// =====================================================================
// Villela Docs Intelligence — autenticação e autorização (Fase 1).
// Sessão própria (cookie JWT 'vdocs_sess' com { uid, tid }), separada do
// Portal Staff e do portal jurídico. Toda request autenticada carrega:
//   req.vd = { user, tenant, vinculo, permissoes }
// e o tenant vem SEMPRE do token (nunca de parâmetro do cliente).
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const { permissoesDe, nomePapel } = require('./permissoes');

const COOKIE = 'vdocs_sess';
const SESSAO_DIAS = 7;

function criarAuth({ jwtSecret }) {
  if (!jwtSecret) throw new Error('vdocs/auth: jwtSecret não injetado.');
  const seguro = process.env.NODE_ENV !== 'development';

  // rate limit em memória (mesma política do Portal Staff: 5 falhas/IP → 15 min)
  const tentativas = new Map();
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const bloqueado = (ip) => { const t = tentativas.get(ip); return !!(t && t.ate && t.ate > Date.now()); };
  const registraFalha = (ip) => {
    const t = tentativas.get(ip) || { n: 0, ate: 0 };
    t.n++;
    if (t.n >= 5) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; }
    tentativas.set(ip, t);
  };
  const limpaFalhas = (ip) => tentativas.delete(ip);

  function emitirSessao(res, userId, tenantId) {
    const tok = jwt.sign({ uid: String(userId), tid: String(tenantId) }, jwtSecret, { expiresIn: `${SESSAO_DIAS}d` });
    res.cookie(COOKIE, tok, { httpOnly: true, sameSite: 'lax', secure: seguro, maxAge: SESSAO_DIAS * 24 * 3600 * 1000, path: '/vdocs' });
  }
  const limparSessao = (res) => res.clearCookie(COOKIE, { path: '/vdocs' });

  // Carrega o contexto do tenant a partir do token. Empresa suspensa/cancelada
  // bloqueia tudo exceto o /me (a tela mostra o aviso e o contato de cobrança).
  function requireTenant(req, res, next) {
    try {
      const { uid, tid } = jwt.verify((req.cookies || {})[COOKIE], jwtSecret);
      const user = repo.userPorId(uid);
      if (!user || !user.ativo) throw new Error('x');
      const v = repo.vinculo(tid, uid);
      if (!v || v.status !== 'ativo') throw new Error('x');
      const tenant = repo.obterTenant(tid);
      if (!tenant) throw new Error('x');
      req.vd = { user, tenant, vinculo: v, permissoes: permissoesDe(v), papelNome: nomePapel(v.papel, tid), ip: ipDe(req) };
      // Cortesia/beta = acesso LIBERADO por decisão da plataforma: nunca bloqueia e nunca "vence".
      const cortesia = tenant.status === 'cortesia';
      const trialVencido = !cortesia && tenant.status === 'trial' && tenant.trial_expira_em && tenant.trial_expira_em < new Date().toISOString();
      req.vd.bloqueado = !cortesia && (tenant.status === 'suspensa' || tenant.status === 'cancelada' || trialVencido);
      if (req.vd.bloqueado && !req.path.endsWith('/me')) {
        return res.status(402).json({ erro: trialVencido ? 'Período de teste encerrado — escolha um plano para continuar.' : 'Conta suspensa — fale com a Villela Docs para reativar.' });
      }
      next();
    } catch (_) { res.status(401).json({ erro: 'não autenticado' }); }
  }

  const requirePerm = (perm) => (req, res, next) => {
    if (req.vd && req.vd.permissoes[perm]) return next();
    return res.status(403).json({ erro: `Sem permissão: ${perm}` });
  };

  // Login: valida credencial e escolhe o tenant (o informado, se o usuário
  // pertence a ele; senão o primeiro ativo).
  function login(req, res, { email, senha, tenant_id }) {
    const ip = ipDe(req);
    if (bloqueado(ip)) { res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' }); return null; }
    const user = repo.userPorEmail(email);
    if (!user || !user.ativo || !user.senha_hash || !bcrypt.compareSync(String(senha || ''), user.senha_hash)) {
      registraFalha(ip);
      res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
      return null;
    }
    const tenants = repo.tenantsDoUsuario(user.id);
    if (!tenants.length) { res.status(403).json({ erro: 'Sua conta não participa de nenhuma empresa.' }); return null; }
    const alvo = tenants.find(t => t.id === String(tenant_id || '')) || tenants[0];
    limpaFalhas(ip);
    // 2FA ativo → senha ok NÃO emite sessão: devolve um token curto p/ o 2º passo
    if (user.totp_ativo) {
      const tfa_token = jwt.sign({ uid: String(user.id), tid: String(alvo.id), tfa: 1 }, jwtSecret, { expiresIn: '5m' });
      res.json({ ok: true, precisa_2fa: true, tfa_token });
      return null;
    }
    concluirLogin(res, user, alvo.id, ip);
    return { user, tenant: alvo, tenants };
  }

  function concluirLogin(res, user, tenantId, ip) {
    const { db, nowISO } = require('./db');
    db.prepare('UPDATE users SET ultimo_login = ? WHERE id = ?').run(nowISO(), user.id);
    repo.auditar(tenantId, user, 'login.ok', 'users', user.id, {}, ip);
    emitirSessao(res, user.id, tenantId);
  }

  // 2º passo do login (TOTP ou código de recuperação).
  function login2fa(req, res, { tfa_token, codigo }) {
    const ip = ipDe(req);
    if (bloqueado(ip)) { res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' }); return null; }
    let claims;
    try { claims = jwt.verify(String(tfa_token || ''), jwtSecret); if (!claims.tfa) throw new Error('x'); }
    catch (_) { res.status(401).json({ erro: 'Sessão de verificação expirada — faça login de novo.' }); return null; }
    const user = repo.userPorId(claims.uid);
    if (!user || !user.ativo) { res.status(401).json({ erro: 'Conta indisponível.' }); return null; }
    if (!require('./enterprise').verificarSegundoFator(user.id, codigo)) {
      registraFalha(ip);
      repo.auditar(claims.tid, user, 'login.2fa_falhou', 'users', user.id, {}, ip);
      res.status(401).json({ erro: 'Código incorreto.' });
      return null;
    }
    limpaFalhas(ip);
    concluirLogin(res, user, claims.tid, ip);
    return { user, tenant: repo.obterTenant(claims.tid) };
  }

  return { COOKIE, ipDe, bloqueado, registraFalha, limpaFalhas, emitirSessao, limparSessao, requireTenant, requirePerm, login, login2fa };
}

module.exports = { criarAuth, COOKIE };
