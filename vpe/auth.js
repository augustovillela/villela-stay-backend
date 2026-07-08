// =====================================================================
// Villela Projects & Events — autenticação (Fase 1).
// Sessão própria (cookie 'vpe_sess', path /vpe) — SEPARADA do Portal
// Staff, do vdocs e do portal jurídico (lição de arquitetura: cada
// produto tem sua identidade; nunca misturar).
// req.vp = { user, tenant, vinculo, permissoes } — tenant SEMPRE do token.
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const { permissoesDe, nomePapel } = require('./permissoes');

const COOKIE = 'vpe_sess';
const SESSAO_DIAS = 7;

function criarAuth({ jwtSecret }) {
  if (!jwtSecret) throw new Error('vpe/auth: jwtSecret não injetado.');
  const seguro = process.env.NODE_ENV !== 'development';

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
    res.cookie(COOKIE, tok, { httpOnly: true, sameSite: 'lax', secure: seguro, maxAge: SESSAO_DIAS * 24 * 3600 * 1000, path: '/vpe' });
  }
  const limparSessao = (res) => res.clearCookie(COOKIE, { path: '/vpe' });

  function requireTenant(req, res, next) {
    try {
      const { uid, tid } = jwt.verify((req.cookies || {})[COOKIE], jwtSecret);
      const user = repo.userPorId(uid);
      if (!user || !user.ativo) throw new Error('x');
      const v = repo.vinculo(tid, uid);
      if (!v || v.status !== 'ativo') throw new Error('x');
      const tenant = repo.obterTenant(tid);
      if (!tenant) throw new Error('x');
      req.vp = { user, tenant, vinculo: v, permissoes: permissoesDe(v), papelNome: nomePapel(v.papel, tid), ip: ipDe(req) };
      const trialVencido = !tenant.interno && tenant.status === 'trial' && tenant.trial_expira_em && tenant.trial_expira_em < new Date().toISOString();
      req.vp.bloqueado = (!tenant.interno && (tenant.status === 'suspensa' || tenant.status === 'cancelada')) || trialVencido;
      if (req.vp.bloqueado && !req.path.endsWith('/me')) {
        return res.status(402).json({ erro: trialVencido ? 'Período de teste encerrado — escolha um plano para continuar.' : 'Conta suspensa — fale com a Villela para reativar.' });
      }
      next();
    } catch (_) { res.status(401).json({ erro: 'não autenticado' }); }
  }

  const requirePerm = (perm) => (req, res, next) => {
    if (req.vp && req.vp.permissoes[perm]) return next();
    return res.status(403).json({ erro: `Sem permissão: ${perm}` });
  };

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
    const { db, nowISO } = require('./db');
    db.prepare('UPDATE users SET ultimo_login = ? WHERE id = ?').run(nowISO(), user.id);
    repo.auditar(alvo.id, user, 'login.ok', 'users', user.id, {}, ip);
    emitirSessao(res, user.id, alvo.id);
    return { user, tenant: alvo, tenants };
  }

  return { COOKIE, ipDe, bloqueado, registraFalha, limpaFalhas, emitirSessao, limparSessao, requireTenant, requirePerm, login };
}

module.exports = { criarAuth, COOKIE };
