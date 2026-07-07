// =====================================================================
// Villela Legal Intelligence — IA jurídica (Fase 3): RAG + consultas.
//
// RAG: índice de texto completo (SQLite FTS5, ranking BM25) sobre as
// fontes internas — base de conhecimento curada, texto extraído de
// documentos, minutas, publicações, andamentos e processos. Sem serviço
// de embeddings na infra atual, busca lexical BM25 é o retrieval; a tabela
// legal_embeddings entra quando houver provedor (decisão no README).
//
// Consulta: pergunta → retrieval top-k → llm.js (se ANTHROPIC_API_KEY)
// ou FILA para o agente jurídico local responder via PUBLISH_KEY.
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');
const llm = require('./llm');

// ---- índice FTS5 (contentless não — tabela normal p/ simplificar upsert) ----
let ftsOK = false;
try {
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS rag_index USING fts5(tipo, ref_id, titulo, corpo)`);
  ftsOK = true;
} catch (e) {
  console.error('[legal/ia] FTS5 indisponível — busca RAG desativada:', e.message);
}

const s = (v, max = 100000) => String(v == null ? '' : v).trim().slice(0, max);

// upsert no índice: remove entradas antigas do mesmo (tipo, ref_id) e insere
function indexar(tipo, refId, titulo, corpo) {
  if (!ftsOK) return;
  const texto = s(corpo);
  db.prepare('DELETE FROM rag_index WHERE tipo = ? AND ref_id = ?').run(tipo, String(refId));
  if (texto) db.prepare('INSERT INTO rag_index (tipo, ref_id, titulo, corpo) VALUES (?,?,?,?)').run(tipo, String(refId), s(titulo, 300), texto);
}
function removerDoIndice(tipo, refId) {
  if (!ftsOK) return;
  db.prepare('DELETE FROM rag_index WHERE tipo = ? AND ref_id = ?').run(tipo, String(refId));
}

// consulta FTS com a query do usuário SANITIZADA (tokens entre aspas, OR):
// evita erro de sintaxe do MATCH com caracteres especiais e amplia recall.
function buscar(q, { limite = 8, tipos = [] } = {}) {
  if (!ftsOK) return { disponivel: false, resultados: [] };
  const tokens = String(q || '').split(/\s+/).map(t => t.replace(/["'*^]/g, '')).filter(t => t.length > 1);
  if (!tokens.length) return { disponivel: true, resultados: [] };
  const match = tokens.map(t => `"${t}"`).join(' OR ');
  let sql = `SELECT tipo, ref_id, titulo, snippet(rag_index, 3, '»', '«', '…', 24) AS trecho, bm25(rag_index) AS rank
    FROM rag_index WHERE rag_index MATCH ?`;
  const args = [match];
  if (tipos.length) { sql += ` AND tipo IN (${tipos.map(() => '?').join(',')})`; args.push(...tipos); }
  sql += ' ORDER BY rank LIMIT ?'; args.push(Math.min(Number(limite) || 8, 30));
  try {
    return { disponivel: true, resultados: db.prepare(sql).all(...args) };
  } catch (e) {
    return { disponivel: true, resultados: [], erro: e.message };
  }
}

// varredura completa das fontes internas → reconstrói o índice
function reindexarTudo() {
  if (!ftsOK) return { disponivel: false };
  db.exec('DELETE FROM rag_index');
  let n = 0;
  const add = (tipo, id, titulo, corpo) => { if (String(corpo || '').trim()) { indexar(tipo, id, titulo, corpo); n++; } };
  for (const k of db.prepare('SELECT * FROM legal_knowledge_base').all()) add('conhecimento', k.id, `${k.titulo} (${k.citacao || k.tipo})`, `${k.titulo}\n${k.citacao}\n${k.corpo}\n${k.tags}`);
  for (const e of db.prepare('SELECT document_id, texto FROM document_text_extractions').all()) {
    const doc = db.prepare('SELECT titulo FROM documents WHERE id = ?').get(e.document_id);
    add('documento', e.document_id, (doc && doc.titulo) || 'Documento', e.texto);
  }
  for (const v of db.prepare(`SELECT dv.id, dv.conteudo, d.tipo_peca FROM legal_draft_versions dv JOIN legal_drafts d ON d.id = dv.draft_id`).all()) add('minuta', v.id, 'Minuta ' + v.tipo_peca, v.conteudo);
  for (const p of db.prepare('SELECT id, orgao, texto, resumo FROM case_publications').all()) add('publicacao', p.id, 'Publicação ' + (p.orgao || ''), `${p.texto}\n${p.resumo}`);
  for (const m of db.prepare('SELECT id, descricao, resumo FROM case_movements').all()) add('andamento', m.id, 'Andamento', `${m.descricao}\n${m.resumo}`);
  for (const c of db.prepare('SELECT id, numero_cnj, assunto, classe, tribunal, prognostico, proximas_acoes FROM cases').all()) {
    add('processo', c.id, c.numero_cnj || 'Processo (consultivo)', `${c.numero_cnj} ${c.tribunal} ${c.classe}\n${c.assunto}\n${c.prognostico}\n${c.proximas_acoes}`);
    // estratégia sigilosa fica FORA do índice de propósito (vaza em snippet)
  }
  return { disponivel: true, indexados: n };
}

// ---- base de conhecimento curada ----
const Conhecimento = {
  listar({ busca = '', tipo = '', limite = 100 } = {}) {
    let sql = 'SELECT * FROM legal_knowledge_base', where = [], args = [];
    if (busca) { where.push('(titulo LIKE ? OR citacao LIKE ? OR tags LIKE ?)'); const b = `%${busca}%`; args.push(b, b, b); }
    if (tipo) { where.push('tipo = ?'); args.push(tipo); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY atualizado_em DESC LIMIT ?'; args.push(Math.min(Number(limite) || 100, 300));
    return db.prepare(sql).all(...args);
  },
  criar(d, autor) {
    const tipos = ['legislacao', 'jurisprudencia', 'tese', 'parecer', 'modelo', 'doutrina'];
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO legal_knowledge_base (id, tipo, titulo, citacao, url, corpo, tags, criado_por, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, tipos.includes(d.tipo) ? d.tipo : 'tese', s(d.titulo, 300) || 'Sem título', s(d.citacao, 500), s(d.url, 500),
        s(d.corpo), s(d.tags, 300), s(autor, 40), agora, agora);
    const k = db.prepare('SELECT * FROM legal_knowledge_base WHERE id = ?').get(id);
    indexar('conhecimento', id, `${k.titulo} (${k.citacao || k.tipo})`, `${k.titulo}\n${k.citacao}\n${k.corpo}\n${k.tags}`);
    return k;
  },
  remover(id) {
    db.prepare('DELETE FROM legal_knowledge_base WHERE id = ?').run(id);
    removerDoIndice('conhecimento', id);
  },
};

// ---- extração de texto de documento (feita pelo agente local / OCR) ----
function registrarExtracao(documentId, texto, metodo, por) {
  const doc = db.prepare('SELECT id, titulo FROM documents WHERE id = ?').get(documentId);
  if (!doc) throw new Error('Documento não encontrado.');
  db.prepare(`INSERT INTO document_text_extractions (document_id, texto, metodo, extraido_em, por)
    VALUES (?,?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET texto=excluded.texto, metodo=excluded.metodo,
    extraido_em=excluded.extraido_em, por=excluded.por`)
    .run(documentId, s(texto), s(metodo, 40), nowISO(), s(por, 120));
  indexar('documento', documentId, doc.titulo, texto);
}

// ---- catálogos ----
const agentes = () => db.prepare('SELECT id, nome, especialidade, versao FROM ai_agents WHERE ativo = 1 ORDER BY nome').all();
const agente = (id) => db.prepare('SELECT * FROM ai_agents WHERE id = ? AND ativo = 1').get(String(id || ''));
const prompts = () => db.prepare('SELECT * FROM prompt_templates ORDER BY nome').all();

// ---- pipeline de consulta ----
// monta o contexto textual a partir do retrieval + dados do processo
function montarContexto(pergunta, { case_id } = {}) {
  const partes = [];
  const fontes = [];
  if (case_id) {
    const p = repo.Processos.obter(case_id, { comSigilo: false });
    if (p) {
      partes.push(`[processo] ${p.numero_cnj || '(consultivo)'} — ${p.tribunal} ${p.classe}. Assunto: ${p.assunto}. Status: ${p.status}/${p.fase}. Últimos andamentos: `
        + p.movimentos.slice(0, 5).map(m => `${m.data}: ${m.descricao.slice(0, 120)}`).join(' | '));
      fontes.push({ tipo: 'processo', ref_id: case_id, titulo: p.numero_cnj || 'processo' });
    }
  }
  const r = buscar(pergunta, { limite: 8 });
  for (const hit of r.resultados) {
    partes.push(`[${hit.tipo}:${hit.ref_id}] ${hit.titulo}: ${hit.trecho}`);
    fontes.push({ tipo: hit.tipo, ref_id: hit.ref_id, titulo: hit.titulo });
  }
  return { texto: partes.join('\n\n'), fontes, rag_disponivel: r.disponivel !== false };
}

// cria a consulta e tenta responder na hora (LLM direto); senão fica na fila
async function consultar(d, autor) {
  const pergunta = s(d.pergunta, 8000);
  if (!pergunta) throw new Error('Escreva a consulta.');
  const esp = d.agente ? agente(d.agente) : null;
  const ctx = montarContexto(pergunta, { case_id: d.case_id });
  const queryId = repo.IA.criarConsulta({
    pergunta, agente: esp ? esp.id : '', case_id: d.case_id, client_id: d.client_id,
    contexto: { fontes_recuperadas: ctx.fontes, rag: ctx.rag_disponivel },
  }, autor);

  if (!llm.ativo()) {
    return { query_id: queryId, situacao: 'pendente', detalhe: 'Sem ANTHROPIC_API_KEY no servidor — a consulta entrou na fila para o agente jurídico local responder.' };
  }
  try {
    const r = await llm.consultar({
      agentePrompt: esp ? esp.system_prompt : '', agenteId: esp ? esp.id : 'geral',
      queryId, pergunta, contexto: ctx.texto,
    });
    const j = r.json;
    const respostaTexto = j.resposta
      + (j.fundamentos && j.fundamentos.length ? '\n\nFUNDAMENTOS:\n- ' + j.fundamentos.join('\n- ') : '')
      + (j.proximos_passos && j.proximos_passos.length ? '\n\nPRÓXIMOS PASSOS:\n- ' + j.proximos_passos.join('\n- ') : '');
    const responseId = repo.IA.responder(queryId, {
      resposta: respostaTexto, riscos: j.riscos, lacunas: j.lacunas,
      nivel_confianca: j.nivel_confianca, fontes: j.fontes, modelo: r.modelo,
    });
    return { query_id: queryId, response_id: responseId, situacao: 'respondida', modelo: r.modelo };
  } catch (e) {
    // falhou a chamada direta → consulta permanece pendente (fila) com o motivo
    return { query_id: queryId, situacao: 'pendente', detalhe: 'Chamada de IA falhou (' + e.message + ') — consulta mantida na fila.' };
  }
}

module.exports = {
  ftsOK, indexar, removerDoIndice, buscar, reindexarTudo,
  Conhecimento, registrarExtracao, agentes, agente, prompts,
  montarContexto, consultar,
};
