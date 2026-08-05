// =====================================================================
// Villela Growth OS — base de conhecimento dos agentes (§21 do prompt).
//
// É daqui que o agente tira o que afirma. Duas regras:
//   1. só documento APROVADO e dentro da validade entra numa resposta —
//      preço vencido em base de conhecimento é como preço errado no site;
//   2. a busca devolve a FONTE junto com o trecho, para a resposta poder
//      ser citada. Resposta sem fonte é marcada como não fundamentada.
//
// Busca com FTS5 (ranking de verdade, não LIKE). Embeddings e busca
// híbrida ficam declarados como pendência: exigem provedor de embedding,
// que não está contratado.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const { db, nowISO, j } = require('./db');

const TIPOS = ['documento', 'faq', 'politica', 'produto', 'preco', 'script', 'condicao'];

/** Grava e indexa. O índice FTS é mantido aqui, não por trigger. */
function criar({ titulo, corpo, tipo = 'documento', resumo = '', tags = [], fonte = '', url = '',
  proprietario = '', validoAte = '' }) {
  if (!titulo || !corpo) throw erro(400, 'O documento precisa de título e corpo.');
  if (!TIPOS.includes(tipo)) throw erro(400, `Tipo desconhecido: ${tipo}`);
  const id = repo.inserir('gx_conhecimento', {
    titulo, corpo, tipo, resumo, tags: j.str(tags), fonte, url, proprietario,
    valido_ate: validoAte, status: 'rascunho', versao: 1,
  });
  indexar(id);
  repo.auditar({ acao: 'conhecimento.criado', entidade: 'gx_conhecimento', entidadeId: id, detalhe: titulo });
  return repo.buscar('gx_conhecimento', id);
}

function atualizar(id, dados = {}) {
  const doc = repo.buscar('gx_conhecimento', id);
  if (!doc) throw erro(404, 'Documento não encontrado.');
  const patch = {};
  for (const c of ['titulo', 'corpo', 'resumo', 'fonte', 'url', 'proprietario']) if (dados[c] !== undefined) patch[c] = dados[c];
  if (dados.tags) patch.tags = j.str(dados.tags);
  if (dados.validoAte !== undefined) patch.valido_ate = dados.validoAte;
  // mexeu no conteúdo → volta para rascunho: aprovação é sobre o texto atual
  if (patch.corpo || patch.titulo) { patch.status = 'rascunho'; patch.versao = Number(doc.versao || 1) + 1; }
  repo.atualizar('gx_conhecimento', id, patch);
  indexar(id);
  return repo.buscar('gx_conhecimento', id);
}

function aprovar(id) {
  const doc = repo.buscar('gx_conhecimento', id);
  if (!doc) throw erro(404, 'Documento não encontrado.');
  repo.atualizar('gx_conhecimento', id, {
    status: 'aprovado', aprovado_por: tenancy.userAtual(), aprovado_em: nowISO(),
  });
  repo.auditar({ acao: 'conhecimento.aprovado', entidade: 'gx_conhecimento', entidadeId: id, detalhe: doc.titulo });
  return repo.buscar('gx_conhecimento', id);
}

/** Mantém o índice FTS em dia. rowid do FTS = rowid da linha real. */
function indexar(id) {
  const doc = repo.buscar('gx_conhecimento', id);
  if (!doc) return false;
  const linha = db.prepare('SELECT rowid FROM gx_conhecimento WHERE id = ?').get(id);
  if (!linha) return false;
  db.prepare('DELETE FROM gx_conhecimento_fts WHERE rowid = ?').run(linha.rowid);
  db.prepare('INSERT INTO gx_conhecimento_fts (rowid, titulo, corpo, tags) VALUES (?,?,?,?)')
    .run(linha.rowid, doc.titulo || '', doc.corpo || '', (j.parse(doc.tags, []) || []).join(' '));
  return true;
}

/** Reindexa a conta inteira (útil depois de importação em massa). */
function reindexar() {
  const docs = repo.listar('gx_conhecimento', { limite: 2000 });
  for (const d of docs) indexar(d.id);
  return docs.length;
}

/**
 * Busca o que o agente pode citar.
 *
 * ⚠️ A tabela FTS não tem tenant_id — o isolamento vem do JOIN com
 * gx_conhecimento sob contexto de tenant. Nunca consultar o FTS sozinho.
 */
function buscar(termo, { limite = 5, tipos = null, incluirNaoAprovados = false } = {}) {
  const q = String(termo || '').trim();
  if (!q) return [];
  // sanitiza para a sintaxe do FTS: token solto, sem operadores do usuário
  const consulta = q.replace(/["*^:()\-]/g, ' ').split(/\s+/).filter(Boolean).map((t) => `"${t}"`).join(' OR ');
  if (!consulta) return [];

  const hoje = nowISO().slice(0, 10);
  const cond = ['c.tenant_id = :tenant', "c.excluido_em = ''"];
  if (!incluirNaoAprovados) cond.push("c.status = 'aprovado'");
  cond.push("(c.valido_ate = '' OR c.valido_ate >= :hoje)");   // vencido não é citável
  if (tipos && tipos.length) cond.push(`c.tipo IN (${tipos.map((_, i) => ':t' + i).join(',')})`);

  const params = { consulta, hoje, limite: Math.min(Number(limite) || 5, 30) };
  if (tipos) tipos.forEach((t, i) => { params['t' + i] = t; });

  return repo.q(
    `SELECT c.id, c.titulo, c.tipo, c.corpo, c.resumo, c.fonte, c.url, c.valido_ate, f.rank AS relevancia
     FROM gx_conhecimento_fts f
     JOIN gx_conhecimento c ON c.rowid = f.rowid
     WHERE gx_conhecimento_fts MATCH :consulta AND ${cond.join(' AND ')}
     ORDER BY f.rank LIMIT :limite`,
    params
  ).map((d) => ({
    id: d.id, titulo: d.titulo, tipo: d.tipo, fonte: d.fonte || d.titulo, url: d.url,
    trecho: trecho(d.corpo, q), relevancia: d.relevancia,
  }));
}

/** Pedaço do texto em volta do termo — é o que vai para o prompt. */
function trecho(corpo, termo, tamanho = 400) {
  const t = String(corpo || '');
  const i = t.toLowerCase().indexOf(String(termo).toLowerCase().split(/\s+/)[0] || '');
  if (i < 0) return t.slice(0, tamanho);
  const ini = Math.max(0, i - Math.floor(tamanho / 3));
  return (ini > 0 ? '…' : '') + t.slice(ini, ini + tamanho) + (ini + tamanho < t.length ? '…' : '');
}

function registrarUso(ids = []) {
  for (const id of ids) {
    try { repo.exec('UPDATE gx_conhecimento SET usos = usos + 1 WHERE id = :id AND tenant_id = :tenant', { id }); }
    catch (_) { /* uso é métrica, não pode derrubar a resposta */ }
  }
}

const listar = (limite = 200) => repo.listar('gx_conhecimento', { ordem: 'atualizado_em DESC, criado_em DESC', limite });

/** Documentos vencidos ou vencendo — o agente não pode citar preço velho. */
const vencendo = (dias = 15) => repo.listar('gx_conhecimento', {
  onde: "status = 'aprovado' AND valido_ate != '' AND valido_ate <= :limite",
  params: { limite: new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10) },
  ordem: 'valido_ate ASC', limite: 100,
});

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = { TIPOS, criar, atualizar, aprovar, buscar, listar, vencendo, indexar, reindexar, registrarUso };
