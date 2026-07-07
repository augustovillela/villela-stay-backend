// =====================================================================
// Villela Docs Intelligence — Fase 7: compartilhamento externo.
//
// * Link seguro (share) p/ DOCUMENTO ou PASTA ("sala segura"), com senha
//   opcional (bcrypt), expiração, modo só-visualização e revogação.
//   Token de 24 bytes só existe na criação — no banco fica o sha256.
// * Solicitação de documentos: link público onde o externo ENVIA arquivos
//   para uma pasta escolhida (viram documentos normais, auditados).
// * Todo acesso externo vira linha em share_access_logs (IP incluído) e
//   o público NUNCA vê ids internos além do necessário.
// Senha errada: throttle por IP (mesma política do login).
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, nowISO, novoId, sha256, j } = require('./db');
const repo = require('./repo');

const s = repo.s;
let _canais = { enviarEmail: null, notificar: async () => {} };
function configurar(canais) { Object.assign(_canais, canais || {}); }

const hashToken = (t) => sha256(Buffer.from(String(t || '')));
const vivo = (r) => r && !r.revogado_em && (!r.expira_em || r.expira_em > nowISO());

// ------------------------------------------------------------ shares (gestão)
function criarShare(tenantId, { alvo_tipo, alvo_id, senha, permite_download, expira_dias, rotulo }, ator, ip) {
  const docs = require('./docs');
  if (alvo_tipo === 'documento') docs.obterDocumento(tenantId, alvo_id);
  else if (alvo_tipo === 'pasta') {
    const p = db.prepare('SELECT id FROM folders WHERE id = ? AND tenant_id = ?').get(String(alvo_id), String(tenantId));
    if (!p) throw new Error('Pasta não encontrada.');
  } else throw new Error('Alvo inválido (documento ou pasta).');
  const token = crypto.randomBytes(24).toString('base64url');
  const id = novoId();
  const dias = Math.min(Math.max(0, Math.trunc(Number(expira_dias) || 0)), 365);
  db.prepare(`INSERT INTO shares (id, tenant_id, alvo_tipo, alvo_id, token_hash, senha_hash, permite_download, expira_em, rotulo, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(tenantId), alvo_tipo, String(alvo_id), hashToken(token),
      String(senha || '') ? bcrypt.hashSync(String(senha), 10) : '',
      permite_download === false ? 0 : 1,
      dias ? new Date(Date.now() + dias * 24 * 3600 * 1000).toISOString() : '',
      s(rotulo, 80), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'compartilhar.criar', 'shares', id, { alvo_tipo, alvo_id: String(alvo_id), com_senha: !!senha, permite_download: permite_download !== false, expira_dias: dias }, ip);
  return { id, token }; // o link completo é montado na rota (host)
}
function listarShares(tenantId) {
  const docs = require('./docs');
  return db.prepare('SELECT * FROM shares WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT 200').all(String(tenantId)).map(sh => {
    let alvo_nome = '(removido)';
    try {
      alvo_nome = sh.alvo_tipo === 'documento'
        ? docs.obterDocumento(tenantId, sh.alvo_id).nome
        : (db.prepare('SELECT nome FROM folders WHERE id = ? AND tenant_id = ?').get(sh.alvo_id, String(tenantId)) || {}).nome || '(removida)';
    } catch (_) {}
    const acessos = db.prepare("SELECT COUNT(*) n FROM share_access_logs WHERE tenant_id = ? AND share_id = ? AND acao != 'senha_errada'").get(String(tenantId), sh.id).n;
    return { id: sh.id, alvo_tipo: sh.alvo_tipo, alvo_id: sh.alvo_id, alvo_nome, com_senha: !!sh.senha_hash, permite_download: !!sh.permite_download, expira_em: sh.expira_em, revogado_em: sh.revogado_em, rotulo: sh.rotulo, criado_em: sh.criado_em, acessos, ativo: vivo(sh) };
  });
}
function revogarShare(tenantId, id, ator, ip) {
  const r = db.prepare("UPDATE shares SET revogado_em = ? WHERE id = ? AND tenant_id = ? AND revogado_em = ''").run(nowISO(), String(id), String(tenantId));
  if (!r.changes) throw new Error('Compartilhamento não encontrado (ou já revogado).');
  repo.auditar(tenantId, ator, 'compartilhar.revogar', 'shares', String(id), {}, ip);
}
function acessosDoShare(tenantId, id, limite = 100) {
  return db.prepare('SELECT * FROM share_access_logs WHERE tenant_id = ? AND share_id = ? ORDER BY criado_em DESC LIMIT ?')
    .all(String(tenantId), String(id), Math.min(Number(limite) || 100, 500));
}

// ------------------------------------------------------------ shares (acesso público)
const tentativas = new Map(); // ip -> {n, ate}
function bloqueado(ip) { const t = tentativas.get(ip); return !!(t && t.ate && t.ate > Date.now()); }
function registraFalha(ip) {
  const t = tentativas.get(ip) || { n: 0, ate: 0 };
  t.n++;
  if (t.n >= 8) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; }
  tentativas.set(ip, t);
}

function resolverShare(token) {
  const sh = db.prepare('SELECT * FROM shares WHERE token_hash = ?').get(hashToken(token));
  if (!vivo(sh)) throw new Error('Link inválido, expirado ou revogado.');
  return sh;
}
function conferirSenha(sh, senha, ip) {
  if (!sh.senha_hash) return true;
  if (bloqueado(ip)) throw new Error('Muitas tentativas. Tente de novo em 15 minutos.');
  if (!bcrypt.compareSync(String(senha || ''), sh.senha_hash)) {
    registraFalha(ip);
    logAcesso(sh, 'senha_errada', '', ip);
    return false;
  }
  tentativas.delete(ip);
  return true;
}
function logAcesso(sh, acao, documentId, ip) {
  db.prepare('INSERT INTO share_access_logs (tenant_id, share_id, acao, document_id, ip, criado_em) VALUES (?,?,?,?,?,?)')
    .run(sh.tenant_id, sh.id, acao, String(documentId || ''), s(ip, 60), nowISO());
}
// Conteúdo visível do share (após senha ok). Pasta lista só docs ATIVOS.
function conteudoDoShare(sh) {
  const docs = require('./docs');
  const doDoc = (id) => {
    const d = docs.obterDocumento(sh.tenant_id, id);
    if (d.status !== 'ativo') throw new Error('Documento indisponível.');
    const txt = db.prepare('SELECT texto FROM document_texts WHERE tenant_id = ? AND document_id = ?').get(sh.tenant_id, d.id);
    return { id: d.id, nome: d.nome, descricao: d.descricao, tipo_documental: d.tipo_documental, versao: d.versao_atual, atualizado_em: d.atualizado_em || d.criado_em, texto: sh.permite_download ? '' : String((txt || {}).texto || '').slice(0, 20000) };
  };
  if (sh.alvo_tipo === 'documento') return { titulo: doDoc(sh.alvo_id).nome, documentos: [doDoc(sh.alvo_id)] };
  const pasta = db.prepare('SELECT nome FROM folders WHERE id = ? AND tenant_id = ?').get(sh.alvo_id, sh.tenant_id);
  if (!pasta) throw new Error('Sala indisponível.');
  const lista = db.prepare("SELECT id FROM documents WHERE tenant_id = ? AND folder_id = ? AND status = 'ativo' ORDER BY nome LIMIT 200").all(sh.tenant_id, sh.alvo_id);
  return { titulo: pasta.nome, documentos: lista.map(x => doDoc(x.id)) };
}
function baixarDoShare(sh, documentId, ip) {
  if (!sh.permite_download) throw new Error('Este link é somente visualização.');
  const docs = require('./docs');
  if (sh.alvo_tipo === 'documento' && String(documentId) !== sh.alvo_id) throw new Error('Documento fora deste link.');
  if (sh.alvo_tipo === 'pasta') {
    const d = db.prepare("SELECT id FROM documents WHERE id = ? AND tenant_id = ? AND folder_id = ? AND status = 'ativo'").get(String(documentId), sh.tenant_id, sh.alvo_id);
    if (!d) throw new Error('Documento fora deste link.');
  }
  const r = docs.baixar(sh.tenant_id, documentId, 0, { id: 'externo:share:' + sh.id, nome: 'Acesso externo' }, ip);
  logAcesso(sh, 'baixar', documentId, ip);
  return r;
}

// ------------------------------------------------------------ solicitações de documentos
function criarSolicitacao(tenantId, { titulo, instrucoes, folder_id, expira_dias, max_arquivos }, ator, ip) {
  if (!s(titulo, 120)) throw new Error('Dê um título à solicitação.');
  if (folder_id) {
    const p = db.prepare('SELECT id FROM folders WHERE id = ? AND tenant_id = ?').get(String(folder_id), String(tenantId));
    if (!p) throw new Error('Pasta não encontrada.');
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const id = novoId();
  const dias = Math.min(Math.max(1, Math.trunc(Number(expira_dias) || 14)), 90);
  db.prepare(`INSERT INTO document_requests (id, tenant_id, folder_id, titulo, instrucoes, token_hash, expira_em, max_arquivos, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(tenantId), s(folder_id, 40), s(titulo, 120), s(instrucoes, 600), hashToken(token),
      new Date(Date.now() + dias * 24 * 3600 * 1000).toISOString(),
      Math.min(Math.max(1, Math.trunc(Number(max_arquivos) || 10)), 50), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'solicitacao.criar', 'document_requests', id, { titulo: s(titulo, 120) }, ip);
  return { id, token };
}
function listarSolicitacoes(tenantId) {
  return db.prepare('SELECT id, folder_id, titulo, expira_em, max_arquivos, recebidos, revogado_em, criado_em FROM document_requests WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT 100')
    .all(String(tenantId)).map(rq => ({ ...rq, ativa: vivo(rq) }));
}
function revogarSolicitacao(tenantId, id, ator, ip) {
  const r = db.prepare("UPDATE document_requests SET revogado_em = ? WHERE id = ? AND tenant_id = ? AND revogado_em = ''").run(nowISO(), String(id), String(tenantId));
  if (!r.changes) throw new Error('Solicitação não encontrada.');
  repo.auditar(tenantId, ator, 'solicitacao.revogar', 'document_requests', String(id), {}, ip);
}
function resolverSolicitacao(token) {
  const rq = db.prepare('SELECT * FROM document_requests WHERE token_hash = ?').get(hashToken(token));
  if (!vivo(rq)) throw new Error('Link inválido, expirado ou encerrado.');
  return rq;
}
// Upload do externo → vira documento normal na pasta da solicitação.
function receberArquivo(rq, { remetente, arquivo_nome, conteudo_base64 }, ip) {
  if (rq.recebidos >= rq.max_arquivos) throw new Error('Esta solicitação já atingiu o limite de arquivos.');
  const docs = require('./docs');
  const ator = { id: 'externo:req:' + rq.id, nome: `Externo (${s(remetente, 80) || 'sem nome'})` };
  const d = docs.criarDocumento(rq.tenant_id, {
    nome: s(arquivo_nome, 200), arquivo_nome, conteudo_base64, folder_id: rq.folder_id,
    descricao: `Recebido via solicitação "${rq.titulo}"${remetente ? ` de ${s(remetente, 80)}` : ''}`,
    tipo_documental: 'outro', forcar_duplicado: true, // externo não decide sobre dedupe
  }, ator, ip);
  db.prepare('UPDATE document_requests SET recebidos = recebidos + 1 WHERE id = ?').run(rq.id);
  // avisa quem pediu (best-effort)
  const dono = repo.userPorId(rq.criado_por);
  if (dono && dono.email && typeof _canais.enviarEmail === 'function') {
    Promise.resolve(_canais.enviarEmail(dono.email, `Villela Docs — arquivo recebido: ${rq.titulo}`,
      `<p><b>${s(remetente, 80) || 'Alguém'}</b> enviou <b>${s(arquivo_nome, 120)}</b> na solicitação "${s(rq.titulo, 120)}".</p>
       <p><a href="https://villela-stay-backend.onrender.com/vdocs/app">Abrir o painel</a></p>`)).catch(() => {});
  }
  return d.id;
}

module.exports = {
  configurar,
  criarShare, listarShares, revogarShare, acessosDoShare,
  resolverShare, conferirSenha, logAcesso, conteudoDoShare, baixarDoShare,
  criarSolicitacao, listarSolicitacoes, revogarSolicitacao, resolverSolicitacao, receberArquivo,
};
