// =====================================================================
// Villela Growth OS — sessões revogáveis.
//
// O JWT carrega só o id da sessão: revogar é apagar no banco, não esperar
// o token expirar. Trocar de conta é ação explícita e auditada — é o
// caminho por onde um operador de agência atravessa contas, e ele precisa
// deixar rastro.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const contas = require('./contas');
const tenancy = require('./tenancy');
const { db, nowISO, novoId } = require('./db');

const DIAS = Number(process.env.GROWTH_SESSAO_DIAS || 7);
let SEGREDO = '';

const configurar = ({ jwtSecret }) => { SEGREDO = jwtSecret || ''; };
function segredo() {
  if (!SEGREDO) throw new Error('sessao.configurar({ jwtSecret }) não foi chamado.');
  return SEGREDO;
}

/** Autentica por e-mail e senha. Não decide conta — só identidade. */
function entrar({ email, senha, ip = '', userAgent = '' }) {
  const usuario = contas.usuarioPorEmail(email);
  if (!usuario || usuario.status !== 'ativo' || !contas.conferirSenha(usuario, senha)) {
    const e = new Error('E-mail ou senha incorretos.'); e.status = 401; throw e;
  }
  const disponiveis = contas.contasDoUsuario(usuario.id);
  const sessao = abrir(usuario.id, { tenantId: disponiveis.length === 1 ? disponiveis[0].id : '', ip, userAgent });
  db.prepare('UPDATE gx_users SET ultimo_login = ? WHERE id = ?').run(nowISO(), usuario.id);
  repo.auditar({ acao: 'sessao.login', entidade: 'gx_users', entidadeId: usuario.id, ip, tenantId: sessao.sessao.tenant_ativo || '' });
  return Object.assign({}, sessao, { usuario: semSenha(usuario), contas: disponiveis });
}

function abrir(userId, { tenantId = '', ip = '', userAgent = '' } = {}) {
  const id = novoId();
  const expira = new Date(Date.now() + DIAS * 86400000).toISOString();
  db.prepare('INSERT INTO gx_sessoes (id, user_id, tenant_ativo, ip, user_agent, criado_em, expira_em) VALUES (?,?,?,?,?,?,?)')
    .run(id, userId, tenantId, ip, String(userAgent).slice(0, 250), nowISO(), expira);
  const token = jwt.sign({ sid: id, uid: userId }, segredo(), { expiresIn: `${DIAS}d` });
  return { token, sessao: db.prepare('SELECT * FROM gx_sessoes WHERE id = ?').get(id) };
}

/** Devolve { sessao, usuario, acesso } ou null. Nunca lança por token ruim. */
function validar(token) {
  let dados;
  try { dados = jwt.verify(String(token || ''), segredo()); } catch { return null; }
  const sessao = db.prepare('SELECT * FROM gx_sessoes WHERE id = ?').get(dados.sid);
  if (!sessao || sessao.revogada_em) return null;
  if (sessao.expira_em && sessao.expira_em < nowISO()) return null;
  const usuario = contas.usuarioPorId(sessao.user_id);
  if (!usuario || usuario.status !== 'ativo') return null;
  const acesso = sessao.tenant_ativo ? contas.resolverAcesso(usuario.id, sessao.tenant_ativo) : null;
  return { sessao, usuario: semSenha(usuario), acesso };
}

/** Troca a conta ativa. Só passa se o acesso for validado — e fica auditado. */
function trocarConta(sessaoId, tenantId) {
  const sessao = db.prepare('SELECT * FROM gx_sessoes WHERE id = ?').get(sessaoId);
  if (!sessao || sessao.revogada_em) { const e = new Error('Sessão inválida.'); e.status = 401; throw e; }
  const acesso = contas.resolverAcesso(sessao.user_id, tenantId);
  if (!acesso) { const e = new Error('Sem acesso a esta conta.'); e.status = 403; throw e; }
  db.prepare('UPDATE gx_sessoes SET tenant_ativo = ? WHERE id = ?').run(tenantId, sessaoId);
  tenancy.comTenant({ tenantId, userId: sessao.user_id }, () => {
    repo.auditar({ acao: 'sessao.conta_trocada', entidade: 'tenants', entidadeId: tenantId, detalhe: `via ${acesso.via}` });
  });
  return acesso;
}

function revogar(sessaoId) {
  const n = db.prepare("UPDATE gx_sessoes SET revogada_em = ? WHERE id = ? AND revogada_em = ''").run(nowISO(), sessaoId).changes;
  if (n) repo.auditar({ acao: 'sessao.revogada', entidade: 'gx_sessoes', entidadeId: sessaoId, tenantId: '' });
  return n > 0;
}

function revogarDoUsuario(userId) {
  const n = db.prepare("UPDATE gx_sessoes SET revogada_em = ? WHERE user_id = ? AND revogada_em = ''").run(nowISO(), userId).changes;
  if (n) repo.auditar({ acao: 'sessao.revogada_todas', entidade: 'gx_users', entidadeId: userId, detalhe: `${n} sessão(ões)`, tenantId: '' });
  return n;
}

const ativasDoUsuario = (userId) =>
  db.prepare("SELECT id, tenant_ativo, ip, user_agent, criado_em, expira_em FROM gx_sessoes WHERE user_id = ? AND revogada_em = '' ORDER BY criado_em DESC").all(userId);

function semSenha(u) { const { senha_hash, mfa_segredo, ...resto } = u; return resto; }

/**
 * Executa `fn` dentro do contexto do usuário na conta ativa da sessão.
 * É o ponto onde tenant e permissões entram no contexto — e o único
 * caminho pretendido para uma rota do painel.
 */
function comSessao(token, fn) {
  const v = validar(token);
  if (!v) { const e = new Error('Sessão expirada ou inválida.'); e.status = 401; throw e; }
  if (!v.acesso) { const e = new Error('Escolha uma conta para continuar.'); e.status = 409; throw e; }
  return tenancy.comTenant({
    tenantId: v.sessao.tenant_ativo,
    userId: v.usuario.id,
    orgId: v.acesso.orgId || '',
    papel: v.acesso.via,
    permissoes: v.acesso.permissoes,
  }, () => fn(v));
}

module.exports = { configurar, entrar, abrir, validar, trocarConta, revogar, revogarDoUsuario, ativasDoUsuario, comSessao };
