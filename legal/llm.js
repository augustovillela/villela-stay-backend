// =====================================================================
// Villela Legal Intelligence — camada abstrata de LLM (Anthropic).
//
// MODO DUPLO:
//  * ANTHROPIC_API_KEY definida (Render) → o backend responde consultas
//    direto pela API da Anthropic (structured outputs, JSON garantido).
//  * Sem chave → llm.ativo() = false e as consultas ficam PENDENTES na
//    fila, para o agente jurídico local (Claude) responder via PUBLISH_KEY.
//
// Regras jurídicas ficam no SYSTEM (estável → prompt caching); o contexto
// recuperado pelo RAG e a pergunta vão na mensagem do usuário.
// Custos: cada chamada é logada em ai_agent_runs (tokens + estimativa USD).
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');

// Modelos em ordem de preferência (o 2º entra se o 1º falhar por indisponibilidade).
const MODELOS = (process.env.LEGAL_LLM_MODELS || 'claude-opus-4-8,claude-sonnet-4-6')
  .split(',').map(s => s.trim()).filter(Boolean);
const MAX_TOKENS = parseInt(process.env.LEGAL_LLM_MAX_TOKENS, 10) || 16000;

// Preço por MTok (USD) p/ estimativa de custo — atualizar junto com o modelo.
const PRECOS = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

// System prompt BASE (guardrails invioláveis — §9 do plano). O prompt do
// agente especialista entra como 2º bloco; ambos estáveis → cacheáveis.
const GUARDRAILS = `Você é um assistente jurídico do sistema Villela Legal Intelligence (escritório brasileiro; direito brasileiro; responda em português do Brasil).

REGRAS INVIOLÁVEIS:
1. NUNCA invente lei, súmula, jurisprudência ou precedente. Cite apenas fontes que constem do CONTEXTO fornecido ou que você conheça com alta confiança indicando o diploma/artigo exato. Se não houver fonte confiável, escreva "não localizado em fonte confiável" e liste em "lacunas".
2. Toda resposta é MINUTA: exige revisão de advogado (OAB) antes de uso profissional. Nunca afirme que uma tese é vencedora sem indicar o risco.
3. Separe fato, direito, estratégia e opinião. Aponte riscos, pontos fracos e provas necessárias.
4. Não inclua dados pessoais desnecessários (CPF/RG/endereços) na resposta.
5. Se faltarem documentos essenciais, se pedirem certeza absoluta, ou se a tarefa exigir protocolo real, diga isso em "lacunas"/"riscos" e reduza o nível de confiança.
6. nivel_confianca: "alto" só quando fundamentos e fontes são sólidos e suficientes; "medio" quando há lacunas relevantes; "baixo" quando faltam elementos essenciais.`;

// Schema da resposta estruturada (§9) — additionalProperties:false obrigatório.
const SCHEMA_RESPOSTA = {
  type: 'object',
  properties: {
    resposta: { type: 'string', description: 'Resposta objetiva à consulta, em português, com fundamentos legais no corpo' },
    fundamentos: { type: 'array', items: { type: 'string' }, description: 'Fundamentos legais resumidos (um por item)' },
    riscos: { type: 'string', description: 'Riscos e pontos fracos da tese' },
    lacunas: { type: 'string', description: 'Lacunas documentais/informacionais; "não localizado em fonte confiável" quando aplicável' },
    proximos_passos: { type: 'array', items: { type: 'string' } },
    fontes: {
      type: 'array',
      description: 'Fontes citadas — só as verificáveis',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['legislacao', 'jurisprudencia', 'documento', 'processo', 'doutrina'] },
          citacao: { type: 'string' },
          url: { type: 'string' },
          trecho: { type: 'string' },
        },
        required: ['tipo', 'citacao'],
        additionalProperties: false,
      },
    },
    nivel_confianca: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
  },
  required: ['resposta', 'fundamentos', 'riscos', 'lacunas', 'proximos_passos', 'fontes', 'nivel_confianca'],
  additionalProperties: false,
};

let _client = null;
function cliente() {
  if (!_client) {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente
  }
  return _client;
}

const ativo = () => !!process.env.ANTHROPIC_API_KEY;

function logRun({ agente, query_id, modelo, usage, duracao_ms, status, detalhe }) {
  try {
    const preco = PRECOS[modelo] || { in: 5, out: 25 };
    const custo = usage
      ? Math.round(((usage.input_tokens || 0) * preco.in + (usage.output_tokens || 0) * preco.out) / 1e6 * 100)
      : 0;
    db.prepare(`INSERT INTO ai_agent_runs (id, agente, query_id, modelo, input_tokens, output_tokens, cache_read_tokens,
      custo_centavos_usd, duracao_ms, status, detalhe, quando) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(novoId(), String(agente || ''), String(query_id || ''), String(modelo || ''),
        (usage && usage.input_tokens) || 0, (usage && usage.output_tokens) || 0,
        (usage && usage.cache_read_input_tokens) || 0, custo, duracao_ms || 0,
        status || 'ok', String(detalhe || '').slice(0, 300), nowISO());
  } catch (_) { /* log nunca derruba a chamada */ }
}

// Execução genérica com fallback de modelo. Com `schema` → structured output
// (retorna { json }); sem → texto livre (retorna { texto }). Sempre loga o run.
async function executar({ agenteId, queryId, systemExtra, prompt, schema }) {
  if (!ativo()) throw new Error('LLM inativo: ANTHROPIC_API_KEY não definida — use a fila (agente local).');
  const system = [
    { type: 'text', text: GUARDRAILS, cache_control: { type: 'ephemeral' } },
    ...(systemExtra ? [{ type: 'text', text: systemExtra, cache_control: { type: 'ephemeral' } }] : []),
  ];
  let ultimoErro = null;
  for (const modelo of MODELOS) {
    const t0 = Date.now();
    try {
      const stream = cliente().messages.stream({
        model: modelo,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system,
        ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
        messages: [{ role: 'user', content: prompt }],
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') {
        logRun({ agente: agenteId, query_id: queryId, modelo, usage: msg.usage, duracao_ms: Date.now() - t0, status: 'recusado' });
        throw new Error('O modelo recusou a solicitação (stop_reason=refusal).');
      }
      const texto = (msg.content.find(b => b.type === 'text') || {}).text || '';
      logRun({ agente: agenteId, query_id: queryId, modelo, usage: msg.usage, duracao_ms: Date.now() - t0, status: 'ok' });
      return { texto, json: schema ? JSON.parse(texto) : null, modelo, usage: msg.usage };
    } catch (e) {
      ultimoErro = e;
      logRun({ agente: agenteId, query_id: queryId, modelo, duracao_ms: Date.now() - t0, status: 'erro', detalhe: e.message });
      // 404 (modelo indisponível) / 529 / 500: tenta o próximo da lista; 4xx de request não.
      const st = e.status || (e.error && e.error.status);
      if (st && st >= 400 && st < 500 && st !== 404 && st !== 429) break;
    }
  }
  throw ultimoErro || new Error('Falha na chamada de IA.');
}

// Responde uma consulta jurídica com saída estruturada garantida (Fase 3).
async function consultar({ agentePrompt, agenteId, queryId, pergunta, contexto }) {
  const prompt = (contexto ? `CONTEXTO RECUPERADO (fontes internas do escritório — cite pelo campo "citacao" indicado):\n${contexto}\n\n` : '')
    + `CONSULTA:\n${pergunta}`;
  const r = await executar({ agenteId, queryId, systemExtra: agentePrompt, prompt, schema: SCHEMA_RESPOSTA });
  return { json: r.json, modelo: r.modelo, usage: r.usage };
}

module.exports = { ativo, consultar, executar, MODELOS, GUARDRAILS, SCHEMA_RESPOSTA, logRun };
