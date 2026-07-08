// =====================================================================
// Villela Projects & Events — Fase 6: IA (assistente + agentes especialistas).
//
// MODO: direto com ANTHROPIC_API_KEY (mesma decisão do Villela Docs/Legal,
// 07/07/2026). Sem chave → recurso indisponível com aviso claro. Todo uso
// é logado em ai_runs (custo/tokens) e consome o limite ia_consultas_mes.
//
// ANCORAGEM: o assistente responde SÓ com base no SNAPSHOT dos dados do
// PRÓPRIO tenant (portfólio, tarefas, eventos, CRM, financeiro) que montamos
// aqui — nunca conhecimento externo sobre a empresa. Sem RAG documental
// (isso é do Villela Docs; a integração vem na Fase 8).
//
// AGENTES ESPECIALISTAS: catálogo de entregas em RASCUNHO (plano de negócio,
// viabilidade, riscos, checklist/briefing de evento, texto de proposta —
// SEMPRE minuta —, follow-up, resumo executivo). Tudo exige validação humana.
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');

const s = repo.s;
const MODELOS = (process.env.VPE_LLM_MODELS || 'claude-opus-4-8,claude-sonnet-4-6')
  .split(',').map(x => x.trim()).filter(Boolean);
const MAX_TOKENS = parseInt(process.env.VPE_LLM_MAX_TOKENS, 10) || 3000;
const PRECOS = { // USD por MTok — atualizar junto com os modelos
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};
const brl = (c) => 'R$ ' + (Math.round(Number(c) || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---- cliente Anthropic (com gancho de mock p/ o selftest) ----
let _client = null;
let _mock = null;
const __mockParaTeste = (fn) => { _mock = fn; };
const ativo = () => !!(_mock || process.env.ANTHROPIC_API_KEY);

function logRun(tenantId, tipo, { modelo, usage, duracao_ms, status, detalhe }) {
  try {
    const preco = PRECOS[modelo] || { in: 5, out: 25 };
    const custo = usage ? Math.round(((usage.input_tokens || 0) * preco.in + (usage.output_tokens || 0) * preco.out) / 1e6 * 100) : 0;
    db.prepare('INSERT INTO ai_runs (id, tenant_id, tipo, modelo, input_tokens, output_tokens, custo_centavos_usd, duracao_ms, status, detalhe, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(novoId(), String(tenantId), String(tipo || ''), String(modelo || ''), (usage && usage.input_tokens) || 0,
        (usage && usage.output_tokens) || 0, custo, duracao_ms || 0, status || 'ok', String(detalhe || '').slice(0, 300), nowISO());
  } catch (_) {}
}

// executa uma chamada de IA. schema opcional (json_schema); sem schema → texto puro.
async function executar(tenantId, tipo, { system, prompt, schema }) {
  if (_mock) return _mock({ tipo, system, prompt, schema });
  if (!ativo()) throw new Error('IA indisponível: ANTHROPIC_API_KEY não configurada no servidor.');
  if (!_client) { const Anthropic = require('@anthropic-ai/sdk'); _client = new Anthropic(); }
  let ultimoErro = null;
  for (const modelo of MODELOS) {
    const t0 = Date.now();
    try {
      const req = {
        model: modelo,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      };
      if (schema) req.output_config = { format: { type: 'json_schema', schema } };
      const msg = await _client.messages.create(req);
      if (msg.stop_reason === 'refusal') {
        logRun(tenantId, tipo, { modelo, usage: msg.usage, duracao_ms: Date.now() - t0, status: 'recusado' });
        throw new Error('O modelo recusou a solicitação.');
      }
      const texto = (msg.content.find(b => b.type === 'text') || {}).text || '';
      logRun(tenantId, tipo, { modelo, usage: msg.usage, duracao_ms: Date.now() - t0, status: 'ok' });
      return { texto, json: schema ? JSON.parse(texto || '{}') : null, modelo, usage: msg.usage };
    } catch (e) {
      ultimoErro = e;
      logRun(tenantId, tipo, { modelo, duracao_ms: Date.now() - t0, status: 'erro', detalhe: e.message });
      const st = e.status || (e.error && e.error.status);
      if (st && st >= 400 && st < 500 && st !== 404 && st !== 429) break;
    }
  }
  throw ultimoErro || new Error('Falha na chamada de IA.');
}

// ------------------------------------------------------------------
// SNAPSHOT dos dados do tenant (única fonte permitida ao assistente)
// ------------------------------------------------------------------
function snapshotGeral(tenantId) {
  const tarefas = require('./tarefas');
  const eventos = require('./eventos');
  const comercial = require('./comercial');
  const financeiro = require('./financeiro');
  const projetos = repo.listarProjetos(tenantId, {}).slice(0, 60);
  const exec = tarefas.resumoExecucao(tenantId);
  const ev = eventos.resumoEventos(tenantId);
  const fin = financeiro.consolidado(tenantId, {});
  let funil = null;
  try { funil = comercial.funil(tenantId); } catch (_) {}
  const linhas = [];
  linhas.push(`PORTFÓLIO (${projetos.length} projetos):`);
  for (const p of projetos.slice(0, 40)) {
    linhas.push(`- ${p.nome} | estágio: ${p.estagio} | prioridade: ${p.prioridade} | viabilidade: ${p.viabilidade || '—'} | investimento: ${brl(p.investimento_estimado)} | receita potencial/ano: ${brl(p.receita_potencial)}`);
  }
  linhas.push('');
  linhas.push(`EXECUÇÃO: ${exec.tarefas_abertas || 0} tarefas abertas, ${exec.tarefas_atrasadas || 0} atrasadas, ${exec.riscos_criticos || 0} riscos críticos.`);
  linhas.push(`EVENTOS: ${ev.eventos_confirmados || 0} confirmados, ${ev.eventos_proximos_30d || 0} nos próximos 30 dias.`);
  if (funil) {
    const valorAberto = Object.values(funil.colunas || {}).reduce((a, c) => a + (c.valor || 0), 0);
    linhas.push(`CRM: ${funil.abertos || 0} oportunidades abertas, valor em aberto ${brl(valorAberto)}, taxa de conversão ${funil.taxa_conversao || 0}%.`);
  }
  linhas.push(`FINANCEIRO: a receber ${brl(fin.a_receber)}, a pagar ${brl(fin.a_pagar)}, inadimplência ${brl(fin.inadimplencia)}, margem prevista ${brl(fin.margem_prevista)}.`);
  return linhas.join('\n');
}

function snapshotProjeto(tenantId, projectId) {
  const tarefas = require('./tarefas');
  const financeiro = require('./financeiro');
  const p = repo.obterProjeto(tenantId, projectId); // valida tenant (anti-IDOR)
  const ts = tarefas.listarTarefas ? tarefas.listarTarefas(tenantId, { project_id: p.id }) : [];
  const fin = financeiro.consolidado(tenantId, { project_id: p.id });
  const linhas = [];
  linhas.push(`PROJETO: ${p.nome}`);
  linhas.push(`Estágio: ${p.estagio} | Prioridade: ${p.prioridade} | Categoria: ${p.categoria} | Horizonte: ${p.horizonte}`);
  linhas.push(`Viabilidade: ${p.viabilidade || '—'} | Investimento: ${brl(p.investimento_estimado)} | Receita potencial/ano: ${brl(p.receita_potencial)}`);
  if (p.descricao) linhas.push(`Descrição: ${String(p.descricao).slice(0, 600)}`);
  if (p.proximos_passos) linhas.push(`Próximos passos: ${String(p.proximos_passos).slice(0, 400)}`);
  if (Array.isArray(ts) && ts.length) {
    linhas.push(`TAREFAS (${ts.length}):`);
    for (const t of ts.slice(0, 25)) linhas.push(`- [${t.status}]${t.atrasada ? ' ATRASADA' : ''} ${t.titulo}${t.prazo ? ' (prazo ' + t.prazo + ')' : ''}`);
  }
  linhas.push(`FINANCEIRO do projeto: a receber ${brl(fin.a_receber)}, a pagar ${brl(fin.a_pagar)}, margem prevista ${brl(fin.margem_prevista)}.`);
  return linhas.join('\n');
}

function snapshotEvento(tenantId, eventId) {
  const eventos = require('./eventos');
  const financeiro = require('./financeiro');
  const e = eventos.obterEvento(tenantId, eventId); // valida tenant
  const fin = financeiro.consolidado(tenantId, { event_id: e.id });
  const linhas = [];
  linhas.push(`EVENTO: ${e.nome} | tipo: ${e.tipo} | status: ${e.status}`);
  if (e.data) linhas.push(`Data: ${e.data}${e.local ? ' | Local: ' + e.local : ''} | Convidados previstos: ${e.convidados_previstos || '—'}`);
  if (e.briefing) { try { const b = typeof e.briefing === 'string' ? JSON.parse(e.briefing) : e.briefing; linhas.push('Briefing: ' + JSON.stringify(b).slice(0, 800)); } catch (_) {} }
  linhas.push(`FINANCEIRO do evento: a receber ${brl(fin.a_receber)}, a pagar ${brl(fin.a_pagar)}, margem prevista ${brl(fin.margem_prevista)}.`);
  return linhas.join('\n');
}

function montarContexto(tenantId, escopoTipo, escopoRef) {
  if (escopoTipo === 'projeto' && escopoRef) return snapshotProjeto(tenantId, escopoRef);
  if (escopoTipo === 'evento' && escopoRef) return snapshotEvento(tenantId, escopoRef);
  return snapshotGeral(tenantId);
}

// ------------------------------------------------------------------
// ASSISTENTE (chat ancorado nos dados)
// ------------------------------------------------------------------
const GUARDRAILS_ASSIST = `Você é o assistente de gestão do Villela Projects & Events, um sistema de gestão de projetos e eventos. Responda sempre em português do Brasil, tom profissional, objetivo e prático.

REGRAS INVIOLÁVEIS:
1. Baseie-se APENAS nos DADOS DA EMPRESA fornecidos no contexto (portfólio, tarefas, eventos, CRM, financeiro). NUNCA invente números, projetos, prazos ou valores que não estejam no contexto.
2. Se a informação necessária não estiver no contexto, diga claramente que não consta nos dados e marque nao_encontrado=true. Você PODE dar recomendações de gestão gerais, mas deixe explícito quando é recomendação e não um dado da empresa.
3. Seja quantitativo quando os dados permitirem (cite os números do contexto). Não exponha dados pessoais de terceiros.
4. nivel_confianca: "alto" quando os dados respondem diretamente; "medio" quando é parcial; "baixo" quando é inferência/recomendação geral.`;

const SCHEMA_ASSIST = {
  type: 'object',
  properties: {
    resposta: { type: 'string', description: 'Resposta em português' },
    nao_encontrado: { type: 'boolean' },
    nivel_confianca: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
  },
  required: ['resposta', 'nao_encontrado', 'nivel_confianca'],
  additionalProperties: false,
};

function listarConversas(tenantId, userId) {
  return db.prepare('SELECT id, titulo, escopo_tipo, escopo_ref, atualizado_em FROM ai_conversations WHERE tenant_id = ? AND user_id = ? ORDER BY atualizado_em DESC LIMIT 30')
    .all(String(tenantId), String(userId));
}
function obterConversa(tenantId, userId, id) {
  const c = db.prepare('SELECT * FROM ai_conversations WHERE id = ? AND tenant_id = ? AND user_id = ?').get(String(id), String(tenantId), String(userId));
  if (!c) throw new Error('Conversa não encontrada.');
  c.mensagens = db.prepare('SELECT id, papel, conteudo, nao_encontrado, nivel_confianca, modelo, criado_em FROM ai_messages WHERE tenant_id = ? AND conversation_id = ? ORDER BY criado_em')
    .all(String(tenantId), c.id);
  return c;
}
function excluirConversa(tenantId, userId, id) {
  const c = db.prepare('SELECT id FROM ai_conversations WHERE id = ? AND tenant_id = ? AND user_id = ?').get(String(id), String(tenantId), String(userId));
  if (!c) throw new Error('Conversa não encontrada.');
  db.prepare('DELETE FROM ai_messages WHERE tenant_id = ? AND conversation_id = ?').run(String(tenantId), c.id);
  db.prepare('DELETE FROM ai_conversations WHERE id = ?').run(c.id);
}

async function perguntar(tenantId, user, { conversation_id, escopo_tipo, escopo_ref, pergunta }, ip) {
  const q = s(pergunta, 2000);
  if (!q) throw new Error('Escreva a pergunta.');
  if (!ativo()) throw new Error('IA indisponível: o servidor está sem ANTHROPIC_API_KEY. Fale com o suporte da Villela.');
  repo.checarLimite(tenantId, 'ia_consultas', 1);
  const agora = nowISO();
  let conv = conversation_id
    ? db.prepare('SELECT * FROM ai_conversations WHERE id = ? AND tenant_id = ? AND user_id = ?').get(String(conversation_id), String(tenantId), String(user.id))
    : null;
  if (conversation_id && !conv) throw new Error('Conversa não encontrada.');
  if (!conv) {
    const id = novoId();
    db.prepare('INSERT INTO ai_conversations (id, tenant_id, user_id, titulo, escopo_tipo, escopo_ref, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, String(tenantId), String(user.id), q.slice(0, 60), s(escopo_tipo || 'geral', 12), s(escopo_ref, 40), agora, agora);
    conv = db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id);
  }
  db.prepare('INSERT INTO ai_messages (id, tenant_id, conversation_id, papel, conteudo, criado_em) VALUES (?,?,?,?,?,?)')
    .run(novoId(), String(tenantId), conv.id, 'usuario', q, agora);

  const contexto = montarContexto(tenantId, conv.escopo_tipo, conv.escopo_ref);
  const anteriores = db.prepare("SELECT papel, conteudo FROM ai_messages WHERE tenant_id = ? AND conversation_id = ? ORDER BY criado_em DESC LIMIT 7")
    .all(String(tenantId), conv.id).reverse().slice(0, -1);
  const historico = anteriores.length
    ? 'CONVERSA ANTERIOR:\n' + anteriores.map(m => `${m.papel === 'usuario' ? 'Usuário' : 'Assistente'}: ${String(m.conteudo).slice(0, 400)}`).join('\n') + '\n\n'
    : '';
  const prompt = historico + `DADOS DA EMPRESA (única fonte factual permitida):\n${contexto}\n\nPERGUNTA:\n${q}`;

  const r = await executar(tenantId, 'assistente', { system: GUARDRAILS_ASSIST, prompt, schema: SCHEMA_ASSIST });
  const jr = r.json || {};
  const msgId = novoId();
  db.prepare(`INSERT INTO ai_messages (id, tenant_id, conversation_id, papel, conteudo, nao_encontrado, nivel_confianca, modelo, input_tokens, output_tokens, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(msgId, String(tenantId), conv.id, 'assistente', s(jr.resposta, 20000), jr.nao_encontrado ? 1 : 0,
      s(jr.nivel_confianca, 10), r.modelo || '', (r.usage && r.usage.input_tokens) || 0, (r.usage && r.usage.output_tokens) || 0, nowISO());
  db.prepare('UPDATE ai_conversations SET atualizado_em = ? WHERE id = ?').run(nowISO(), conv.id);
  repo.registrarUso(tenantId, 'ia_consultas', 1);
  repo.auditar(tenantId, user, 'ia.perguntar', 'ai_conversations', conv.id, { chars: q.length, escopo: conv.escopo_tipo }, ip);
  return { conversation_id: conv.id, mensagem: { id: msgId, papel: 'assistente', conteudo: jr.resposta, nao_encontrado: !!jr.nao_encontrado, nivel_confianca: jr.nivel_confianca, modelo: r.modelo } };
}

// ------------------------------------------------------------------
// AGENTES ESPECIALISTAS (entregas em rascunho — validação humana)
// ------------------------------------------------------------------
// escopo: 'projeto' | 'evento' | 'geral'. minuta:true carimba a saída.
const AGENTES = {
  plano_negocio: { nome: 'Plano de negócio', escopo: 'projeto', desc: 'Rascunho de plano de negócio a partir do projeto.',
    instr: 'Gere um rascunho de plano de negócio para o projeto: sumário, proposta de valor, mercado-alvo, modelo de receita, principais custos, riscos e próximos passos. Use os números do contexto; sinalize hipóteses.' },
  analise_viabilidade: { nome: 'Análise de viabilidade', escopo: 'projeto', desc: 'Parecer de viabilidade do projeto.',
    instr: 'Faça uma análise de viabilidade do projeto: pontos fortes, fragilidades, retorno esperado vs investimento, e um veredito (avançar / amadurecer / pausar / descartar) com justificativa. É recomendação preliminar, não decisão.' },
  analise_riscos: { nome: 'Mapa de riscos', escopo: 'projeto', desc: 'Riscos sugeridos com prevenção e contingência.',
    instr: 'Liste os principais riscos do projeto. Para cada um: descrição, probabilidade (baixa/média/alta), impacto (baixo/médio/alto), prevenção e contingência.' },
  briefing_evento: { nome: 'Briefing de evento', escopo: 'evento', desc: 'Estrutura de briefing do evento.',
    instr: 'Monte um briefing do evento cobrindo: objetivo, público, formato, cronograma macro, ambientação, gastronomia, necessidades técnicas e critérios de sucesso.' },
  checklist_evento: { nome: 'Checklist de produção', escopo: 'evento', desc: 'Checklist de produção do evento.',
    instr: 'Gere um checklist de produção do evento agrupado por frentes (fornecedores, logística, montagem, equipe, comunicação, pós-evento), com itens acionáveis.' },
  texto_proposta: { nome: 'Texto de proposta (MINUTA)', escopo: 'projeto', desc: 'Minuta de texto comercial — validação humana.',
    instr: 'Escreva uma MINUTA de texto de proposta comercial persuasiva e honesta, baseada nos dados. Marque claramente valores como estimativas a confirmar. Não invente condições contratuais.' },
  email_followup: { nome: 'Follow-up de CRM', escopo: 'geral', desc: 'Rascunho de e-mail de follow-up.',
    instr: 'Escreva um rascunho curto e cordial de e-mail de follow-up comercial, adequado ao contexto informado pelo usuário. Tom profissional brasileiro.' },
  resumo_executivo: { nome: 'Resumo executivo', escopo: 'geral', desc: 'Resumo executivo do portfólio e operação.',
    instr: 'Produza um resumo executivo curto (bullets) do portfólio e da operação: destaques, alertas (atrasos, inadimplência, riscos), e 3 recomendações priorizadas.' },
};
const listarAgentes = () => Object.entries(AGENTES).map(([chave, a]) => ({ chave, nome: a.nome, escopo: a.escopo, desc: a.desc, minuta: chave === 'texto_proposta' }));

const GUARDRAILS_AGENTE = `Você é um agente especialista do Villela Projects & Events. Responda em português do Brasil. Baseie-se nos DADOS DA EMPRESA fornecidos; quando precisar supor algo que não está nos dados, marque como hipótese. Suas entregas são RASCUNHOS para validação humana — nunca as apresente como decisão final ou documento oficial. Não invente valores financeiros que não estejam no contexto.`;

async function executarAgente(tenantId, user, { agente, escopo_tipo, escopo_ref, instrucao_extra }, ip) {
  const def = AGENTES[agente];
  if (!def) throw new Error('Agente desconhecido.');
  if (!ativo()) throw new Error('IA indisponível: o servidor está sem ANTHROPIC_API_KEY.');
  repo.checarLimite(tenantId, 'ia_consultas', 1);
  const tipoEscopo = def.escopo === 'geral' ? (escopo_tipo || 'geral') : def.escopo;
  const contexto = montarContexto(tenantId, tipoEscopo, escopo_ref); // valida o ref contra o tenant
  const extra = s(instrucao_extra, 1000);
  const prompt = `DADOS DA EMPRESA:\n${contexto}\n\nTAREFA (${def.nome}):\n${def.instr}${extra ? '\n\nOBSERVAÇÕES DO USUÁRIO:\n' + extra : ''}`;
  const r = await executar(tenantId, 'agente:' + agente, { system: GUARDRAILS_AGENTE, prompt });
  let saida = String(r.texto || '').trim();
  if (agente === 'texto_proposta' || agente === 'plano_negocio' || agente === 'analise_viabilidade') {
    saida = '**MINUTA — rascunho gerado por IA, sujeito a validação humana.**\n\n' + saida;
  }
  const id = novoId();
  db.prepare(`INSERT INTO ai_agent_runs (id, tenant_id, agente, escopo_tipo, escopo_ref, entrada, saida, modelo, input_tokens, output_tokens, criado_por, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(tenantId), agente, s(tipoEscopo, 12), s(escopo_ref, 40), extra, saida.slice(0, 30000),
      r.modelo || '', (r.usage && r.usage.input_tokens) || 0, (r.usage && r.usage.output_tokens) || 0, s(user.id, 40), nowISO());
  repo.registrarUso(tenantId, 'ia_consultas', 1);
  repo.auditar(tenantId, user, 'ia.agente', 'ai_agent_runs', id, { agente, escopo: tipoEscopo }, ip);
  return { id, agente, nome: def.nome, escopo_tipo: tipoEscopo, escopo_ref: escopo_ref || '', saida, modelo: r.modelo };
}
function listarExecucoesAgente(tenantId, { agente = '', limite = 20 } = {}) {
  let sql = 'SELECT id, agente, escopo_tipo, escopo_ref, saida, modelo, criado_por, criado_em FROM ai_agent_runs WHERE tenant_id = ?';
  const args = [String(tenantId)];
  if (agente) { sql += ' AND agente = ?'; args.push(String(agente)); }
  sql += ' ORDER BY criado_em DESC LIMIT ?'; args.push(Math.min(100, Math.max(1, parseInt(limite, 10) || 20)));
  return db.prepare(sql).all(...args);
}

// narrativa livre (usada pelo relatório do CEO) — não consome ia_consultas por ser interna.
async function narrar(tenantId, tipo, resumoTexto) {
  if (!ativo()) return '';
  try {
    const r = await executar(tenantId, tipo, {
      system: 'Você é o analista executivo do Villela Projects & Events. Escreva em português do Brasil, tom executivo, direto, baseado só nos dados fornecidos. 1 parágrafo de leitura + 3 a 5 recomendações priorizadas em bullets. Não invente números.',
      prompt: 'DADOS DE HOJE:\n' + resumoTexto,
    });
    return String(r.texto || '').trim();
  } catch (_) { return ''; }
}

module.exports = {
  ativo, MODELOS, __mockParaTeste, executar,
  snapshotGeral, montarContexto,
  listarConversas, obterConversa, excluirConversa, perguntar,
  AGENTES, listarAgentes, executarAgente, listarExecucoesAgente, narrar,
};
