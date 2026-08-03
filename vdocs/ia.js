// =====================================================================
// Villela Docs Intelligence — Fase 5: IA documental (RAG + Anthropic).
//
// MODO: direto com ANTHROPIC_API_KEY (a mesma do Render — decisão do
// Augusto 07/07/2026; custo por tenant logado em ai_runs e consumo do
// plano em ia_consultas). Sem chave → recurso indisponível com aviso
// claro (SaaS não tem fila de agente local como o módulo jurídico).
//
// GUARDRAILS (spec §2.5): responde SÓ com base nos trechos recuperados
// dos documentos do PRÓPRIO tenant; cita as fontes [n]; quando não acha,
// diz que não encontrou (nao_encontrado=true); toda pergunta/resposta é
// gravada com usuário, fontes e tokens.
// RAG = FTS5/BM25 sobre document_texts (sem embeddings — mesma decisão
// validada no Villela Legal; vetores só se a qualidade pedir).
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

const s = repo.s;
const MODELOS = (process.env.VDOCS_LLM_MODELS || 'claude-opus-4-8,claude-sonnet-4-6')
  .split(',').map(x => x.trim()).filter(Boolean);
const MAX_TOKENS = parseInt(process.env.VDOCS_LLM_MAX_TOKENS, 10) || 4000;
const PRECOS = { // USD por MTok — atualizar junto com os modelos
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

const GUARDRAILS = `Você é o assistente de documentos do Villela Docs Intelligence, um sistema de gestão documental empresarial. Responda sempre em português do Brasil, em tom profissional e claro.

REGRAS INVIOLÁVEIS:
1. Responda APENAS com base nos TRECHOS DE DOCUMENTOS fornecidos no contexto. NUNCA use conhecimento externo para afirmar fatos sobre a empresa ou seus documentos.
2. Cite as fontes usando a numeração dos trechos: [1], [2]... Toda afirmação factual precisa de citação.
3. Se a resposta NÃO estiver nos trechos fornecidos, diga claramente que não encontrou a informação nos documentos e marque nao_encontrado=true. NUNCA invente.
4. Não exponha dados pessoais desnecessários (CPF, RG, endereços) — mencione que existem, sem transcrever, salvo se a pergunta for especificamente sobre eles.
5. Documentos podem estar desatualizados: quando houver datas nos trechos, mencione-as.
6. nivel_confianca: "alto" só quando os trechos respondem diretamente; "medio" quando a resposta é parcial; "baixo" quando é inferência fraca.`;

const SCHEMA_RESPOSTA = {
  type: 'object',
  properties: {
    resposta: { type: 'string', description: 'Resposta em português com citações [n] no corpo' },
    fontes_usadas: { type: 'array', items: { type: 'integer' }, description: 'Números dos trechos efetivamente usados' },
    nao_encontrado: { type: 'boolean', description: 'true quando a informação não está nos documentos' },
    nivel_confianca: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
  },
  required: ['resposta', 'fontes_usadas', 'nao_encontrado', 'nivel_confianca'],
  additionalProperties: false,
};

// ---- cliente Anthropic (com gancho de mock p/ o selftest) ----
let _client = null;
let _mock = null;
const __mockParaTeste = (fn) => { _mock = fn; };
const ativo = () => !!(_mock || process.env.ANTHROPIC_API_KEY);

function logRun(tenantId, { modelo, usage, duracao_ms, status, detalhe }) {
  try {
    const preco = PRECOS[modelo] || { in: 5, out: 25 };
    const custo = usage ? Math.round(((usage.input_tokens || 0) * preco.in + (usage.output_tokens || 0) * preco.out) / 1e6 * 100) : 0;
    db.prepare('INSERT INTO ai_runs (id, tenant_id, modelo, input_tokens, output_tokens, custo_centavos_usd, duracao_ms, status, detalhe, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(novoId(), String(tenantId), String(modelo || ''), (usage && usage.input_tokens) || 0,
        (usage && usage.output_tokens) || 0, custo, duracao_ms || 0, status || 'ok', String(detalhe || '').slice(0, 300), nowISO());
  } catch (_) {}
}

async function executar(tenantId, { prompt, schema = SCHEMA_RESPOSTA, systemExtra = '' }) {
  if (_mock) return _mock({ prompt, schema, systemExtra });
  if (!ativo()) throw new Error('IA indisponível: ANTHROPIC_API_KEY não configurada no servidor.');
  if (!_client) { const Anthropic = require('@anthropic-ai/sdk'); _client = new Anthropic(); }
  let ultimoErro = null;
  for (const modelo of MODELOS) {
    const t0 = Date.now();
    try {
      const msg = await _client.messages.create({
        model: modelo,
        max_tokens: MAX_TOKENS,
        system: [
          { type: 'text', text: GUARDRAILS, cache_control: { type: 'ephemeral' } },
          ...(systemExtra ? [{ type: 'text', text: systemExtra, cache_control: { type: 'ephemeral' } }] : []),
        ],
        // sem schema = texto livre (redação); com schema = resposta estruturada (perguntas)
        ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
        messages: [{ role: 'user', content: prompt }],
      });
      if (msg.stop_reason === 'refusal') {
        logRun(tenantId, { modelo, usage: msg.usage, duracao_ms: Date.now() - t0, status: 'recusado' });
        throw new Error('O modelo recusou a solicitação.');
      }
      const texto = (msg.content.find(b => b.type === 'text') || {}).text || (schema ? '{}' : '');
      logRun(tenantId, { modelo, usage: msg.usage, duracao_ms: Date.now() - t0, status: 'ok' });
      return { json: schema ? JSON.parse(texto) : null, texto, modelo, usage: msg.usage };
    } catch (e) {
      ultimoErro = e;
      logRun(tenantId, { modelo, duracao_ms: Date.now() - t0, status: 'erro', detalhe: e.message });
      const st = e.status || (e.error && e.error.status);
      if (st && st >= 400 && st < 500 && st !== 404 && st !== 429) break; // erro de request: não adianta trocar de modelo
    }
  }
  throw ultimoErro || new Error('Falha na chamada de IA.');
}

// ---- RAG: recuperar trechos relevantes DENTRO do escopo ----
function docsDoEscopo(tenantId, escopoTipo, escopoRef) {
  if (escopoTipo === 'documento') {
    const d = db.prepare("SELECT id FROM documents WHERE id = ? AND tenant_id = ? AND status = 'ativo'").get(String(escopoRef), String(tenantId));
    if (!d) throw new Error('Documento do escopo não encontrado.');
    return [d.id];
  }
  if (escopoTipo === 'pasta') {
    const p = db.prepare('SELECT id FROM folders WHERE id = ? AND tenant_id = ?').get(String(escopoRef), String(tenantId));
    if (!p) throw new Error('Pasta do escopo não encontrada.');
    return db.prepare("SELECT id FROM documents WHERE tenant_id = ? AND folder_id = ? AND status = 'ativo'").all(String(tenantId), p.id).map(x => x.id);
  }
  return null; // base inteira do tenant (filtrada no MATCH por tenant_id)
}

function montarContexto(tenantId, pergunta, escopoTipo, escopoRef) {
  const ids = docsDoEscopo(tenantId, escopoTipo || 'base', escopoRef);
  // termos da pergunta em OR (recall alto; o BM25 ordena) — tokens escapados
  const termos = [];
  const re = /"([^"]+)"|(\p{L}[\p{L}\p{N}-]{2,})/gu;
  let m;
  while ((m = re.exec(String(pergunta || '').slice(0, 300)))) termos.push((m[1] || m[2]).replace(/"/g, ''));
  const match = termos.slice(0, 12).map(t => `"${t}"`).join(' OR ');
  let hits = [];
  if (match) {
    try {
      hits = db.prepare(`SELECT document_id, snippet(docs_fts, 3, '', '', ' … ', 110) AS trecho, bm25(docs_fts) AS rank
        FROM docs_fts WHERE docs_fts MATCH ? AND tenant_id = ? ORDER BY rank LIMIT 24`).all(match, String(tenantId));
    } catch (_) {}
  }
  if (ids) hits = hits.filter(hh => ids.includes(hh.document_id));
  // escopo=documento sem match → manda o começo do texto mesmo assim
  if (!hits.length && escopoTipo === 'documento') {
    const t = db.prepare('SELECT texto FROM document_texts WHERE tenant_id = ? AND document_id = ?').get(String(tenantId), String(escopoRef));
    if (t && t.texto) hits = [{ document_id: String(escopoRef), trecho: t.texto.slice(0, 4000), rank: 0 }];
  }
  const fontes = [];
  const linhas = [];
  for (const hit of hits.slice(0, 8)) {
    const d = db.prepare('SELECT id, nome, tipo_documental, validade FROM documents WHERE id = ? AND tenant_id = ?').get(hit.document_id, String(tenantId));
    if (!d) continue;
    const n = fontes.length + 1;
    fontes.push({ document_id: d.id, nome: d.nome, trecho: String(hit.trecho).slice(0, 600) });
    linhas.push(`[${n}] Documento "${d.nome}" (tipo: ${d.tipo_documental}${d.validade ? `, validade: ${d.validade}` : ''}):\n${String(hit.trecho).slice(0, 1800)}`);
  }
  return { contexto: linhas.join('\n\n'), fontes };
}

// ---- conversa ----
function listarConversas(tenantId, userId) {
  return db.prepare('SELECT id, titulo, escopo_tipo, escopo_ref, atualizado_em FROM ai_conversations WHERE tenant_id = ? AND user_id = ? ORDER BY atualizado_em DESC LIMIT 30')
    .all(String(tenantId), String(userId));
}
function obterConversa(tenantId, userId, id) {
  const c = db.prepare('SELECT * FROM ai_conversations WHERE id = ? AND tenant_id = ? AND user_id = ?').get(String(id), String(tenantId), String(userId));
  if (!c) throw new Error('Conversa não encontrada.');
  c.mensagens = db.prepare('SELECT id, papel, conteudo, fontes, nao_encontrado, nivel_confianca, modelo, criado_em FROM ai_messages WHERE tenant_id = ? AND conversation_id = ? ORDER BY criado_em')
    .all(String(tenantId), c.id).map(mm => ({ ...mm, fontes: j.parse(mm.fontes, []) }));
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
  if (!ativo()) throw new Error('IA indisponível: o servidor está sem ANTHROPIC_API_KEY. Fale com o suporte da Villela Docs.');
  repo.checarLimite(tenantId, 'ia_consultas', 1); // limite mensal do plano (ia_consultas_mes)
  const agora = nowISO();
  let conv = conversation_id
    ? db.prepare('SELECT * FROM ai_conversations WHERE id = ? AND tenant_id = ? AND user_id = ?').get(String(conversation_id), String(tenantId), String(user.id))
    : null;
  if (conversation_id && !conv) throw new Error('Conversa não encontrada.');
  if (!conv) {
    const id = novoId();
    db.prepare('INSERT INTO ai_conversations (id, tenant_id, user_id, titulo, escopo_tipo, escopo_ref, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, String(tenantId), String(user.id), q.slice(0, 60), s(escopo_tipo || 'base', 12), s(escopo_ref, 40), agora, agora);
    conv = db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id);
  }
  db.prepare('INSERT INTO ai_messages (id, tenant_id, conversation_id, papel, conteudo, criado_em) VALUES (?,?,?,?,?,?)')
    .run(novoId(), String(tenantId), conv.id, 'usuario', q, agora);

  const { contexto, fontes } = montarContexto(tenantId, q, conv.escopo_tipo, conv.escopo_ref);
  // histórico curto p/ perguntas de acompanhamento (últimas 3 trocas)
  const anteriores = db.prepare("SELECT papel, conteudo FROM ai_messages WHERE tenant_id = ? AND conversation_id = ? AND id != '' ORDER BY criado_em DESC LIMIT 7")
    .all(String(tenantId), conv.id).reverse().slice(0, -1);
  const historico = anteriores.length
    ? 'CONVERSA ANTERIOR (para contexto de acompanhamento):\n' + anteriores.map(mm => `${mm.papel === 'usuario' ? 'Usuário' : 'Assistente'}: ${String(mm.conteudo).slice(0, 400)}`).join('\n') + '\n\n'
    : '';
  const prompt = historico
    + (contexto ? `TRECHOS DE DOCUMENTOS DA EMPRESA (única fonte permitida — cite por [n]):\n${contexto}\n\n` : 'NENHUM TRECHO RELEVANTE FOI ENCONTRADO nos documentos da empresa para esta pergunta.\n\n')
    + `PERGUNTA:\n${q}`;

  const r = await executar(tenantId, { prompt });
  const jr = r.json || {};
  const usadas = Array.isArray(jr.fontes_usadas) ? jr.fontes_usadas : [];
  const fontesUsadas = usadas.map(n => fontes[n - 1]).filter(Boolean);
  const msgId = novoId();
  db.prepare(`INSERT INTO ai_messages (id, tenant_id, conversation_id, papel, conteudo, fontes, nao_encontrado, nivel_confianca, modelo, input_tokens, output_tokens, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(msgId, String(tenantId), conv.id, 'assistente', s(jr.resposta, 20000), j.str(fontesUsadas.length ? fontesUsadas : fontes),
      jr.nao_encontrado ? 1 : 0, s(jr.nivel_confianca, 10), r.modelo || '', (r.usage && r.usage.input_tokens) || 0, (r.usage && r.usage.output_tokens) || 0, nowISO());
  db.prepare('UPDATE ai_conversations SET atualizado_em = ? WHERE id = ?').run(nowISO(), conv.id);
  repo.registrarUso(tenantId, 'ia_consultas', 1);
  repo.auditar(tenantId, user, 'ia.perguntar', 'ai_conversations', conv.id, { chars: q.length, fontes: fontesUsadas.length, nao_encontrado: !!jr.nao_encontrado }, ip);
  return { conversation_id: conv.id, mensagem: { id: msgId, papel: 'assistente', conteudo: jr.resposta, fontes: fontesUsadas.length ? fontesUsadas : fontes, nao_encontrado: !!jr.nao_encontrado, nivel_confianca: jr.nivel_confianca, modelo: r.modelo } };
}

function darFeedback(tenantId, userId, messageId, tipo, comentario) {
  if (!['util', 'incorreta', 'sensivel'].includes(tipo)) throw new Error('Tipo de feedback inválido.');
  const mm = db.prepare('SELECT id FROM ai_messages WHERE id = ? AND tenant_id = ?').get(String(messageId), String(tenantId));
  if (!mm) throw new Error('Mensagem não encontrada.');
  db.prepare('INSERT INTO ai_feedback (tenant_id, message_id, user_id, tipo, comentario, criado_em) VALUES (?,?,?,?,?,?)')
    .run(String(tenantId), mm.id, String(userId), tipo, s(comentario, 500), nowISO());
}

module.exports = { ativo, MODELOS, GUARDRAILS, SCHEMA_RESPOSTA, executar, __mockParaTeste, montarContexto, listarConversas, obterConversa, excluirConversa, perguntar, darFeedback };
