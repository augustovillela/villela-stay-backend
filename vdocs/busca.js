// =====================================================================
// Villela Docs Intelligence — Fase 4: busca avançada.
//
// Busca HÍBRIDA: nome (LIKE, pega até documento ainda não processado) +
// conteúdo (FTS5/BM25), com operadores no termo:
//   palavra palavra   → todas as palavras (AND)
//   "frase exata"     → frase
//   OR                → alternativa (contrato OR distrato)
//   -palavra          → excluir (NOT)
// O termo do usuário NUNCA entra cru no MATCH: cada token é escapado
// entre aspas duplas — sem injeção de sintaxe FTS5.
// Filtros: tipo, tag, pasta, período de criação, só vencendo.
// Sempre por tenant e só documentos ativos (lixeira fica de fora).
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

const s = repo.s;

// ---- parser de operadores → expressão FTS5 segura ----
function montarMatch(termo) {
  const tokens = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(termo || '').slice(0, 200)))) tokens.push(m[1] != null ? { frase: m[1] } : { palavra: m[2] });
  const partes = [];
  let negados = [];
  for (const t of tokens) {
    if (t.palavra === 'OR' || t.palavra === 'ou') { if (partes.length) partes.push('OR'); continue; }
    const bruto = t.frase != null ? t.frase : t.palavra;
    const negar = t.palavra && t.palavra.startsWith('-') && t.palavra.length > 1;
    const limpo = String(negar ? bruto.slice(1) : bruto).replace(/"/g, '').trim();
    if (!limpo) continue;
    if (negar) { negados.push(`"${limpo}"`); continue; }
    if (partes.length && partes[partes.length - 1] !== 'OR') partes.push('AND');
    partes.push(`"${limpo}"`);
  }
  while (partes.length && ['AND', 'OR'].includes(partes[partes.length - 1])) partes.pop();
  if (!partes.length) return '';
  let expr = partes.join(' ');
  if (partes.includes('OR')) expr = `(${expr})`;
  for (const n of negados) expr += ` NOT ${n}`;
  return expr;
}

// termos "positivos" p/ o LIKE do nome (operadores não se aplicam ao LIKE)
function termosPositivos(termo) {
  const out = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(termo || '').slice(0, 200)))) {
    const t = m[1] != null ? m[1] : m[2];
    if (t === 'OR' || t === 'ou' || t.startsWith('-')) continue;
    out.push(t.replace(/"/g, ''));
  }
  return out;
}

// ---- execução ----
function buscar(tenantId, { q = '', tipo = '', tag = '', pasta = '', de = '', ate = '', vencendo = '' } = {}, ator) {
  const tid = String(tenantId);
  const porId = new Map();

  // 1) conteúdo (FTS)
  const match = montarMatch(q);
  if (match) {
    let hits = [];
    try {
      hits = db.prepare(`SELECT document_id, snippet(docs_fts, 3, '«', '»', '…', 12) AS trecho, bm25(docs_fts) AS rank
        FROM docs_fts WHERE docs_fts MATCH ? AND tenant_id = ? ORDER BY rank LIMIT 200`).all(match, tid);
    } catch (_) { /* expressão FTS inválida → só nome */ }
    for (const hit of hits) porId.set(hit.document_id, { trecho: hit.trecho, rank: hit.rank, onde: 'conteúdo' });
  }

  // 2) nome (LIKE em todos os termos positivos — acha doc ainda não extraído)
  const positivos = termosPositivos(q);
  if (positivos.length) {
    let sql = "SELECT id FROM documents WHERE tenant_id = ? AND status = 'ativo'";
    const args = [tid];
    for (const t of positivos.slice(0, 8)) { sql += ' AND nome LIKE ?'; args.push(`%${s(t, 60)}%`); }
    for (const row of db.prepare(sql + ' LIMIT 200').all(...args)) {
      const atual = porId.get(row.id);
      if (atual) atual.rank -= 5; // casa nome E conteúdo → sobe no ranking
      else porId.set(row.id, { trecho: '', rank: -3, onde: 'nome' });
    }
  }
  if (!q && (tipo || tag || pasta || de || ate || vencendo)) {
    // busca só por filtros (sem termo): parte de todos os ativos
    for (const row of db.prepare("SELECT id FROM documents WHERE tenant_id = ? AND status = 'ativo' LIMIT 500").all(tid)) {
      if (!porId.has(row.id)) porId.set(row.id, { trecho: '', rank: 0, onde: 'filtros' });
    }
  }

  // 3) materializa + filtros
  const hoje = nowISO().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const docs = [];
  for (const [id, extra] of porId) {
    const d = db.prepare("SELECT id, folder_id, nome, tipo_documental, tags, versao_atual, validade, criado_em, atualizado_em, criado_por FROM documents WHERE id = ? AND tenant_id = ? AND status = 'ativo'").get(id, tid);
    if (!d) continue;
    d.tags = j.parse(d.tags, []);
    if (tipo && d.tipo_documental !== tipo) continue;
    if (tag && !d.tags.includes(tag)) continue;
    if (pasta && d.folder_id !== String(pasta)) continue;
    if (de && d.criado_em.slice(0, 10) < s(de, 10)) continue;
    if (ate && d.criado_em.slice(0, 10) > s(ate, 10)) continue;
    if (vencendo && !(d.validade && d.validade <= em30)) continue;
    docs.push({ ...d, trecho: extra.trecho, onde: extra.onde, vencido: !!(d.validade && d.validade < hoje), rank: extra.rank });
  }
  docs.sort((a, b) => a.rank - b.rank);
  const resultado = docs.slice(0, 100).map(({ rank, ...d }) => d);

  // 4) histórico (sugestões + auditoria de uso)
  if (q || tipo || tag || pasta || de || ate || vencendo) {
    db.prepare('INSERT INTO search_queries (tenant_id, user_id, termo, filtros, resultados, criado_em) VALUES (?,?,?,?,?,?)')
      .run(tid, s(ator && ator.id, 40), s(q, 200), j.str({ tipo, tag, pasta, de, ate, vencendo }), resultado.length, nowISO());
  }
  return resultado;
}

// ---- histórico e buscas salvas (pessoais, por tenant) ----
function historico(tenantId, userId, limite = 10) {
  const vistos = new Set();
  const out = [];
  for (const r of db.prepare('SELECT termo, filtros, criado_em FROM search_queries WHERE tenant_id = ? AND user_id = ? ORDER BY criado_em DESC LIMIT 60')
    .all(String(tenantId), String(userId))) {
    const chave = r.termo + '|' + r.filtros;
    if (vistos.has(chave) || !r.termo) continue;
    vistos.add(chave);
    out.push({ termo: r.termo, filtros: j.parse(r.filtros, {}), criado_em: r.criado_em });
    if (out.length >= limite) break;
  }
  return out;
}
function listarSalvas(tenantId, userId) {
  return db.prepare('SELECT * FROM saved_searches WHERE tenant_id = ? AND user_id = ? ORDER BY nome')
    .all(String(tenantId), String(userId)).map(r => ({ ...r, filtros: j.parse(r.filtros, {}) }));
}
function salvarBusca(tenantId, userId, { nome, termo, filtros }, ip) {
  if (!s(nome, 60)) throw new Error('Dê um nome à busca salva.');
  const existente = db.prepare('SELECT id FROM saved_searches WHERE tenant_id = ? AND user_id = ? AND nome = ?')
    .get(String(tenantId), String(userId), s(nome, 60));
  if (existente) { // upsert por nome
    db.prepare('UPDATE saved_searches SET termo = ?, filtros = ? WHERE id = ?').run(s(termo, 200), j.str(filtros || {}), existente.id);
    return existente.id;
  }
  const id = novoId();
  db.prepare('INSERT INTO saved_searches (id, tenant_id, user_id, nome, termo, filtros, criado_em) VALUES (?,?,?,?,?,?,?)')
    .run(id, String(tenantId), String(userId), s(nome, 60), s(termo, 200), j.str(filtros || {}), nowISO());
  repo.auditar(tenantId, { id: userId }, 'busca.salvar', 'saved_searches', id, { nome: s(nome, 60) }, ip);
  return id;
}
function excluirSalva(tenantId, userId, id) {
  const r = db.prepare('DELETE FROM saved_searches WHERE id = ? AND tenant_id = ? AND user_id = ?')
    .run(String(id), String(tenantId), String(userId));
  if (!r.changes) throw new Error('Busca salva não encontrada.');
}

module.exports = { buscar, montarMatch, historico, listarSalvas, salvarBusca, excluirSalva };
