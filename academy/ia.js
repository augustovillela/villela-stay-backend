// =====================================================================
// Villela Academy — IA (FASE 9), padrão vdocs/vpe: modo direto com
// ANTHROPIC_API_KEY do Render; sem chave → indisponível com aviso claro.
// 5 agentes: estruturar curso, copywriter da página de venda, pedagógico,
// suporte ao aluno (escopo = SÓ o conteúdo a que ele tem acesso) e
// relatório executivo do admin. Guardrails: nunca inventa dados, avisa
// quando falta informação, saída é SUGESTÃO (aplicar é ação do humano).
// Todo uso é logado em ai_usage_logs; limite diário por usuário
// (platform_settings.ia.consultas_dia, padrão 30).
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const ct = require('./repo-conteudo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

const MODELOS = (process.env.ACADEMY_LLM_MODELS || 'claude-sonnet-5,claude-haiku-4-5')
  .split(',').map(x => x.trim()).filter(Boolean);
const MAX_TOKENS = parseInt(process.env.ACADEMY_LLM_MAX_TOKENS, 10) || 4000;
const PRECOS = { // USD por MTok — atualizar junto com os modelos
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

const GUARDRAILS = `Você é um assistente da Villela Academy, marketplace brasileiro de cursos online. Responda SEMPRE em português do Brasil e SEMPRE com um único objeto JSON válido (sem markdown, sem texto fora do JSON).

REGRAS INVIOLÁVEIS:
1. NUNCA invente fatos, números ou conteúdos que não estejam no contexto fornecido. Quando faltar informação, diga isso explicitamente no campo apropriado.
2. Suas saídas são SUGESTÕES para revisão humana — nunca afirme que algo foi feito/publicado.
3. Não produza conteúdo ilegal, enganoso, adulto ou que viole direitos autorais.
4. Não exponha dados pessoais.`;

// ---- cliente (com gancho de mock p/ o selftest) ----
let _client = null;
let _mock = null;
const __mockParaTeste = (fn) => { _mock = fn; };
const ativo = () => !!(_mock || process.env.ANTHROPIC_API_KEY);

function logRun(userId, agente, { modelo, usage, status, detalhe }) {
  try {
    const preco = PRECOS[modelo] || { in: 3, out: 15 };
    const custo = usage ? Math.round(((usage.input_tokens || 0) * preco.in + (usage.output_tokens || 0) * preco.out) / 1e6 * 100) : 0;
    db.prepare(`INSERT INTO ai_usage_logs (id, quando, user_id, agente, modelo, input_tokens, output_tokens, custo_centavos_usd, status, detalhe)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(novoId(), nowISO(), s(userId, 40), s(agente, 30), s(modelo, 40),
        (usage && usage.input_tokens) || 0, (usage && usage.output_tokens) || 0, custo, s(status, 20), s(detalhe, 300));
  } catch (_) {}
}

function limiteDia() {
  const cfg = repo.Config.obter('ia', {});
  return Math.max(1, parseInt(cfg.consultas_dia, 10) || 30);
}
function usadasHoje(userId) {
  return db.prepare("SELECT COUNT(*) n FROM ai_usage_logs WHERE user_id = ? AND quando >= ? AND status = 'ok'")
    .get(userId, new Date().toISOString().slice(0, 10)).n;
}

async function executar(userId, agente, prompt) {
  if (!ativo()) throw new Error('IA indisponível: ANTHROPIC_API_KEY não configurada no servidor.');
  if (usadasHoje(userId) >= limiteDia()) { const e = new Error(`Limite diário de IA atingido (${limiteDia()} consultas). Tente amanhã.`); e.status = 429; throw e; }
  if (_mock) { const r = await _mock({ agente, prompt }); logRun(userId, agente, { modelo: 'mock', usage: r.usage || { input_tokens: 10, output_tokens: 10 }, status: 'ok' }); return r.json; }
  if (!_client) { const Anthropic = require('@anthropic-ai/sdk'); _client = new Anthropic(); }
  let ultimoErro = null;
  for (const modelo of MODELOS) {
    try {
      const msg = await _client.messages.create({
        model: modelo, max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: GUARDRAILS, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      });
      const texto = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
        .replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const json = JSON.parse(texto);
      logRun(userId, agente, { modelo, usage: msg.usage, status: 'ok' });
      return json;
    } catch (e) {
      ultimoErro = e;
      logRun(userId, agente, { modelo, status: 'erro', detalhe: e.message });
      const st = e.status || (e.response && e.response.status);
      if (st && st >= 400 && st < 500 && st !== 404 && st !== 429) break;
    }
  }
  throw new Error('IA falhou: ' + (ultimoErro ? ultimoErro.message : 'sem modelo disponível'));
}

// ---------------- contexto compartilhado ----------------
function contextoProduto(p, { incluirConteudo = false, soLiberadas = null, userId = null } = {}) {
  const estrutura = ct.Produtos.estrutura(p.id);
  const linhas = [`PRODUTO: ${p.titulo} (${p.tipo})`, `Subtítulo: ${p.subtitulo || '—'}`,
    `Descrição: ${p.descricao_curta || '—'}`, `Preço: R$ ${((p.preco_promo_centavos || p.preco_centavos) / 100).toFixed(2)}`, 'CONTEÚDO:'];
  for (const m of estrutura) {
    linhas.push(`## Módulo: ${m.titulo}`);
    for (const a of m.aulas) {
      const liberada = !soLiberadas || a.gratuita || ct.temAcesso(userId, p.id);
      linhas.push(`- Aula: ${a.titulo} (${a.tipo})`);
      if (incluirConteudo && liberada && a.conteudo) linhas.push(`  Texto: ${String(a.conteudo).slice(0, 1500)}`);
    }
  }
  return linhas.join('\n').slice(0, 24000);
}

// ---------------- agentes ----------------
const Agentes = {
  // 1) criador de curso: tema → estrutura sugerida (módulos/aulas/objetivos)
  estruturar(userId, p, { tema, publico } = {}) {
    return executar(userId, 'estruturar', `${contextoProduto(p)}
TAREFA: Proponha a estrutura completa deste ${p.tipo} sobre "${s(tema, 200) || p.titulo}"${publico ? ` para o público: ${s(publico, 200)}` : ''}.
Se o produto JÁ tem conteúdo, proponha só o que FALTA (não repita módulos existentes).
JSON: {"modulos":[{"titulo":"...","aulas":[{"titulo":"...","tipo":"video|texto|pdf","objetivo":"o que o aluno sai sabendo"}]}],"observacoes":"o que você assumiu ou precisa de mais informação"}
Máx. 8 módulos, 8 aulas por módulo.`);
  },
  // 2) copywriter: produto → seções da página de venda (formato do editor)
  copy(userId, p) {
    return executar(userId, 'copy', `${contextoProduto(p, { incluirConteudo: true })}
TAREFA: Escreva a página de venda deste produto. Tom: direto, brasileiro, sem promessas irreais (nada de "fique rico", "garantido"); benefícios concretos com base no conteúdo REAL acima.
JSON: {"headline":"...","subheadline":"...","promessa":"...","beneficios":["..."],"para_quem":["..."],"aprender":["..."],"bonus":[],"faq":[{"p":"...","r":"..."}],"garantia_texto":"...","observacoes":"o que faltou saber"}
Máx.: 6 benefícios, 4 para_quem, 8 aprender, 5 faq.`);
  },
  // 3) pedagógico: avalia a didática e sugere exercícios/quiz (texto de apoio)
  pedagogico(userId, p) {
    return executar(userId, 'pedagogico', `${contextoProduto(p, { incluirConteudo: true })}
TAREFA: Como designer instrucional, avalie a sequência didática e proponha melhorias e exercícios.
JSON: {"avaliacao":"análise curta da sequência","sugestoes":["melhoria concreta"],"quiz":[{"pergunta":"...","alternativas":["a","b","c","d"],"correta":0,"aula":"título da aula relacionada"}],"observacoes":"..."}
Máx.: 5 sugestões, 5 questões. Baseie o quiz SÓ no conteúdo real acima.`);
  },
  // 4) suporte ao aluno: responde SÓ com o conteúdo a que ele tem acesso
  suporte(userId, p, pergunta) {
    return executar(userId, 'suporte', `${contextoProduto(p, { incluirConteudo: true, soLiberadas: true, userId })}
PERGUNTA DO ALUNO: ${s(pergunta, 1000)}
TAREFA: Responda como tutor do curso, APENAS com base no conteúdo acima. Se a resposta não estiver no conteúdo, diga isso e sugira ao aluno perguntar ao produtor.
JSON: {"resposta":"...","aula_referencia":"título da aula que embasa (ou vazio)","nao_encontrado":true|false}`);
  },
  // 5) relatório executivo do admin (KPIs reais → análise)
  relatorio(userId) {
    const k = repo.Dashboard.plataforma();
    const billing = require('./billing');
    const kb = billing.Pedidos.kpisPlataforma();
    return executar(userId, 'relatorio', `KPIs REAIS da plataforma Villela Academy hoje (${new Date().toISOString().slice(0, 10)}):
${j.str({ ...k, ...kb })}
TAREFA: Relatório executivo curto para o dono da plataforma. Use SÓ os números acima (não invente tendências sem base).
JSON: {"resumo":"2-3 frases","destaques":["..."],"alertas":["..."],"recomendacoes":["ação concreta"]}
Máx. 4 itens por lista.`);
  },
};

const Logs = {
  listar(n) { return db.prepare('SELECT * FROM ai_usage_logs ORDER BY quando DESC LIMIT ?').all(Math.min(parseInt(n, 10) || 200, 1000)); },
  custoTotal() {
    const r = db.prepare('SELECT COALESCE(SUM(custo_centavos_usd),0) c, COUNT(*) n FROM ai_usage_logs').get();
    return { consultas: r.n, custo_centavos_usd: r.c };
  },
};

module.exports = { ativo, MODELOS, Agentes, Logs, usadasHoje, limiteDia, __mockParaTeste };
