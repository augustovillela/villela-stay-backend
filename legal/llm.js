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
const { db, nowISO, novoId, tenantAtual, TENANT_PADRAO } = require('./db');

// Modelos em ordem de preferência (o 2º entra se o 1º falhar por indisponibilidade).
const MODELOS = (process.env.LEGAL_LLM_MODELS || 'claude-opus-5,claude-opus-4-8')
  .split(',').map(s => s.trim()).filter(Boolean);
const MAX_TOKENS = parseInt(process.env.LEGAL_LLM_MAX_TOKENS, 10) || 16000;

// Preço por MTok (USD) p/ estimativa de custo — atualizar junto com o modelo.
const PRECOS = {
  'claude-opus-5': { in: 5, out: 25 },
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

// Costura de TESTE: troca o SDK por um cliente falso (recebe a chave, ou undefined = chave do servidor).
let _fabricaTeste = null;
function definirFabricaClienteTeste(fn) { _fabricaTeste = typeof fn === 'function' ? fn : null; _client = null; _clientesPorChave.clear(); }

let _client = null;
function cliente() {
  if (_fabricaTeste) return _fabricaTeste(undefined);
  if (!_client) {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente
  }
  return _client;
}
// cliente com a CHAVE DO PRÓPRIO escritório (um por chave, guardado pelo hash — a chave não vira índice)
const _clientesPorChave = new Map();
function clienteDaChave(apiKey) {
  if (_fabricaTeste) return _fabricaTeste(apiKey);
  const h = require('crypto').createHash('sha256').update(String(apiKey)).digest('hex');
  if (!_clientesPorChave.has(h)) {
    const Anthropic = require('@anthropic-ai/sdk');
    if (_clientesPorChave.size > 200) _clientesPorChave.clear();
    _clientesPorChave.set(h, new Anthropic({ apiKey }));
  }
  return _clientesPorChave.get(h);
}

// ---------------------------------------------------------------------
// PORTÃO DA IA POR ESCRITÓRIO (Legal SaaS). O escritório interno usa a
// chave do servidor e não é cobrado. Todo escritório ASSINANTE passa pelo
// portão que o legal-saas injeta, e só há dois jeitos de a IA rodar:
//   'chave'   — chave de API do próprio escritório (não consome crédito);
//   'credito' — chave do servidor, com o custo MÁXIMO reservado ANTES da
//               chamada e o custo real cobrado depois. Sem saldo, não chama.
// Sem portão configurado, assinante fica bloqueado: IA de graça por
// esquecimento de configuração é exatamente o que isto existe para impedir.
// ---------------------------------------------------------------------
let _portao = null;
function configurarPortao(fn) { _portao = typeof fn === 'function' ? fn : null; }
function contextoIA() {
  const t = tenantAtual();
  if (t === TENANT_PADRAO) return { modo: 'interno' };
  if (!_portao) return { modo: 'bloqueado', motivo: 'IA indisponível para este escritório (cobrança de IA não configurada).' };
  try { return _portao(t) || { modo: 'bloqueado', motivo: 'IA indisponível para este escritório.' }; }
  catch (e) { return { modo: 'bloqueado', motivo: e.message }; }
}

// "Há como responder na hora?" — é o que decide entre responder e enfileirar.
function ativo() {
  const c = contextoIA();
  if (c.modo === 'chave') return true;
  if (c.modo === 'interno' || c.modo === 'credito') return !!process.env.ANTHROPIC_API_KEY;
  return false;
}
// Rotinas (fila da madrugada) só rodam se houver com que pagar: chave própria ou saldo.
function podeRodarRotina() {
  const c = contextoIA();
  if (c.modo === 'credito') { try { return ativo() && c.disponivel() > 0; } catch (_) { return false; } }
  return ativo();
}

// ---- custo em MICRO-dólares (1e-6 USD): tokens × preço por MTok já dá micro-dólar ----
const precoDe = (modelo) => PRECOS[modelo] || { in: 5, out: 25 };
// custo real, pelo que o provedor devolveu (escrita de cache custa 1,25×; leitura, 0,1×)
function custoUsdMicros(modelo, usage) {
  if (!usage) return 0;
  const p = precoDe(modelo);
  return Math.ceil((usage.input_tokens || 0) * p.in + (usage.cache_creation_input_tokens || 0) * p.in * 1.25
    + (usage.cache_read_input_tokens || 0) * p.in * 0.1 + (usage.output_tokens || 0) * p.out);
}
// custo MÁXIMO antes de chamar: entrada estimada por tamanho (3 caracteres por token, com
// folga, ao preço de escrita de cache) + o teto inteiro de saída, no modelo mais caro da lista.
function estimarUsdMicros(system, prompt) {
  const chars = system.reduce((n, b) => n + String(b.text || '').length, 0) + String(prompt || '').length;
  const p = MODELOS.map(precoDe).reduce((a, b) => ({ in: Math.max(a.in, b.in), out: Math.max(a.out, b.out) }), { in: 0, out: 0 });
  return Math.ceil((Math.ceil(chars / 3) + 500) * p.in * 1.25 + MAX_TOKENS * p.out);
}

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
  const ctx = contextoIA();
  if (ctx.modo === 'bloqueado') throw new Error(ctx.motivo || 'IA indisponível para este escritório.');
  if (!ativo()) throw new Error('LLM inativo: ANTHROPIC_API_KEY não definida — use a fila (agente local).');
  const system = [
    { type: 'text', text: GUARDRAILS, cache_control: { type: 'ephemeral' } },
    ...(systemExtra ? [{ type: 'text', text: systemExtra, cache_control: { type: 'ephemeral' } }] : []),
  ];
  // CRÉDITO: o dinheiro é reservado ANTES de qualquer chamada ao provedor. Sem saldo, o erro sai daqui.
  const reserva = ctx.modo === 'credito' ? ctx.reservar(estimarUsdMicros(system, prompt), { agente: String(agenteId || ''), query_id: String(queryId || '') }) : null;
  try {
    return await chamar({ ctx, system, agenteId, queryId, prompt, schema, reserva });
  } catch (e) {
    if (reserva && !e._iaLiquidada) { try { ctx.cancelar(reserva); } catch (_) {} } // nada foi gasto → a reserva volta inteira
    throw e;
  }
}

async function chamar({ ctx, system, agenteId, queryId, prompt, schema, reserva }) {
  const cli = ctx.modo === 'chave' ? clienteDaChave(ctx.apiKey) : cliente();
  let gasto = 0; // micro-dólares realmente consumidos nesta tarefa (somando tentativas)
  const acertar = (modelo) => { if (reserva) ctx.liquidar(reserva, gasto, { modelo, agente: String(agenteId || '') }); };
  let ultimoErro = null;
  for (const modelo of MODELOS) {
    const t0 = Date.now();
    try {
      const stream = cli.messages.stream({
        model: modelo,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system,
        ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
        messages: [{ role: 'user', content: prompt }],
      });
      const msg = await stream.finalMessage();
      gasto += custoUsdMicros(modelo, msg.usage); // o provedor cobrou: entra na conta mesmo que a resposta não sirva
      if (msg.stop_reason === 'refusal') {
        logRun({ agente: agenteId, query_id: queryId, modelo, usage: msg.usage, duracao_ms: Date.now() - t0, status: 'recusado' });
        throw Object.assign(new Error('O modelo recusou a solicitação (stop_reason=refusal).'), { _recusa: true });
      }
      const texto = (msg.content.find(b => b.type === 'text') || {}).text || '';
      logRun({ agente: agenteId, query_id: queryId, modelo, usage: msg.usage, duracao_ms: Date.now() - t0, status: 'ok' });
      const json = schema ? JSON.parse(texto) : null;
      acertar(modelo);
      return { texto, json, modelo, usage: msg.usage };
    } catch (e) {
      ultimoErro = e;
      if (!e._recusa) logRun({ agente: agenteId, query_id: queryId, modelo, duracao_ms: Date.now() - t0, status: 'erro', detalhe: e.message });
      // 404 (modelo indisponível) / 529 / 500: tenta o próximo da lista; 4xx de request não.
      const st = e.status || (e.error && e.error.status);
      if (ctx.modo === 'chave' && (st === 401 || st === 403)) {
        ultimoErro = new Error('A sua chave de API foi recusada pelo provedor. Confira-a em Painel → 🤖 Créditos de IA (ou remova-a para usar crédito pré-pago).');
        break;
      }
      if (e._recusa || (st && st >= 400 && st < 500 && st !== 404 && st !== 429)) break;
    }
  }
  // falhou, mas houve consumo cobrado pelo provedor (recusa, resposta inválida): cobra só esse tanto
  const erro = ultimoErro || new Error('Falha na chamada de IA.');
  if (reserva && gasto > 0) { try { acertar(MODELOS[0]); erro._iaLiquidada = true; } catch (_) {} }
  throw erro;
}

// Responde uma consulta jurídica com saída estruturada garantida (Fase 3).
async function consultar({ agentePrompt, agenteId, queryId, pergunta, contexto }) {
  const prompt = (contexto ? `CONTEXTO RECUPERADO (fontes internas do escritório — cite pelo campo "citacao" indicado):\n${contexto}\n\n` : '')
    + `CONSULTA:\n${pergunta}`;
  const r = await executar({ agenteId, queryId, systemExtra: agentePrompt, prompt, schema: SCHEMA_RESPOSTA });
  return { json: r.json, modelo: r.modelo, usage: r.usage };
}

module.exports = { ativo, consultar, executar, MODELOS, GUARDRAILS, SCHEMA_RESPOSTA, logRun, configurarPortao, contextoIA, podeRodarRotina, custoUsdMicros, estimarUsdMicros, PRECOS, MAX_TOKENS, definirFabricaClienteTeste };
