// =====================================================================
// Villela Legal SaaS — API do ASSINANTE (escritório), sessão própria.
// Cookie `jur_saas` restrito ao path /juridico. Isolado do Portal Staff
// e do portal do cliente-do-cliente (/cliente-juridico do módulo legal/).
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, nowISO } = require('./db');
const repo = require('./repo');
const billing = require('./billing');
const push = require('./push');

const COOKIE = 'jur_saas';
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

function registrarRotasCliente(app, { jwtSecret, enviarEmail }) {
  const seguro = process.env.NODE_ENV !== 'development';
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  // rate limit login
  const tentativas = new Map();
  const bloqueado = (ip) => { const t = tentativas.get(ip); return !!(t && t.ate && t.ate > Date.now()); };
  const falha = (ip) => { const t = tentativas.get(ip) || { n: 0, ate: 0 }; if (++t.n >= 5) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; } tentativas.set(ip, t); };

  function requireAssinante(req, res, next) {
    try {
      const { uid } = jwt.verify(req.cookies && req.cookies[COOKIE], jwtSecret);
      const u = db.prepare('SELECT u.*, t.nome AS tenant_nome, t.status AS tenant_status FROM tenant_users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ? AND u.ativo = 1').get(uid);
      if (!u) throw new Error('x');
      req.assinante = u;
      next();
    } catch (_) { res.status(401).json({ erro: 'não autenticado' }); }
  }

  app.use('/juridico/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  app.post('/juridico/api/login', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    const email = s((req.body || {}).email, 120).toLowerCase();
    const u = db.prepare('SELECT * FROM tenant_users WHERE lower(email) = ? AND ativo = 1').get(email);
    if (!u || !u.senha_hash || !bcrypt.compareSync(String((req.body || {}).senha || ''), u.senha_hash)) {
      falha(ip); return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }
    tentativas.delete(ip);
    db.prepare('UPDATE tenant_users SET ultimo_login = ? WHERE id = ?').run(nowISO(), u.id);
    const token = jwt.sign({ uid: u.id }, jwtSecret, { expiresIn: '30d' });
    res.cookie(COOKIE, token, { httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/juridico' });
    res.json({ ok: true });
  }));
  app.post('/juridico/api/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/juridico' }); res.json({ ok: true }); });

  app.post('/juridico/api/definir-senha', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    let dec; try { dec = jwt.verify(s((req.body || {}).token, 4000), jwtSecret); } catch (_) { falha(ip); return res.status(400).json({ erro: 'Link inválido ou expirado.' }); }
    if (dec.tipo !== 'legalsaas-setup') return res.status(400).json({ erro: 'Link inválido.' });
    if (String((req.body || {}).senha || '').length < 8) return res.status(400).json({ erro: 'A senha precisa de 8+ caracteres.' });
    db.prepare('UPDATE tenant_users SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(req.body.senha), 10), dec.uid);
    res.json({ ok: true });
  }));

  app.get('/juridico/api/me', requireAssinante, h(async (req, res) => {
    const t = repo.Tenants.obter(req.assinante.tenant_id);
    res.json({
      usuario: { nome: req.assinante.nome, email: req.assinante.email, papel: req.assinante.papel },
      escritorio: { nome: t.nome, status: t.status, slug: t.slug },
      entitlements: t.entitlements,
      uso: repo.Uso.doTenant(t.id),
    });
  }));

  // cobrança / plano (self-service)
  app.get('/juridico/api/cobranca', requireAssinante, h(async (req, res) => {
    res.json(billing.estado(req.assinante.tenant_id));
  }));
  app.post('/juridico/api/cobranca/assinar', requireAssinante, h(async (req, res) => {
    if (req.assinante.papel !== 'admin') return res.status(403).json({ erro: 'Apenas o administrador do escritório assina.' });
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const base = `${proto}://${req.get('host')}`;
    const r = await billing.assinar(req.assinante.tenant_id, s((req.body || {}).plano, 60), req.assinante.email, base, ipDe(req));
    res.json({ ok: true, ...r });
  }));
  app.post('/juridico/api/cobranca/cancelar', requireAssinante, h(async (req, res) => {
    if (req.assinante.papel !== 'admin') return res.status(403).json({ erro: 'Apenas o administrador cancela.' });
    res.json(await billing.cancelarAssinatura(req.assinante.tenant_id, req.assinante.email, ipDe(req)));
  }));

  // suporte / tickets
  app.get('/juridico/api/tickets', requireAssinante, h(async (req, res) => {
    res.json({ tickets: repo.Tickets.listar({ tenant_id: req.assinante.tenant_id }) });
  }));
  app.get('/juridico/api/tickets/:id', requireAssinante, h(async (req, res) => {
    const t = repo.Tickets.obter(req.params.id);
    if (!t || t.tenant_id !== req.assinante.tenant_id) return res.status(404).json({ erro: 'Ticket não encontrado.' });
    res.json({ ticket: t });
  }));
  app.post('/juridico/api/tickets', requireAssinante, h(async (req, res) => {
    const id = repo.Tickets.abrir(req.assinante.tenant_id, req.body || {}, req.assinante.email);
    res.json({ ok: true, id });
  }));
  app.post('/juridico/api/tickets/:id/responder', requireAssinante, h(async (req, res) => {
    const t = repo.Tickets.obter(req.params.id);
    if (!t || t.tenant_id !== req.assinante.tenant_id) return res.status(404).json({ erro: 'Ticket não encontrado.' });
    repo.Tickets.responder(req.params.id, { texto: s((req.body || {}).texto, 4000), lado: 'cliente', autor: req.assinante.email });
    res.json({ ok: true });
  }));

  // ---- notificações push do painel (PWA) — por usuário, sem gate de plano ----
  app.get('/juridico/api/push/chave', requireAssinante, h(async (req, res) => {
    res.json({ publicKey: push.chavePublica() });
  }));
  app.post('/juridico/api/push/subscribe', requireAssinante, h(async (req, res) => {
    push.salvar(req.assinante.tenant_id, req.assinante.id, (req.body || {}).subscription);
    res.json({ ok: true });
  }));
  app.post('/juridico/api/push/unsubscribe', requireAssinante, h(async (req, res) => {
    push.remover((req.body || {}).endpoint);
    res.json({ ok: true });
  }));

  // workspaces + usuários do escritório
  app.post('/juridico/api/workspaces', requireAssinante, h(async (req, res) => {
    if (req.assinante.papel !== 'admin') return res.status(403).json({ erro: 'Apenas admin.' });
    const id = repo.Tenants.addWorkspace(req.assinante.tenant_id, s((req.body || {}).nome, 120));
    res.json({ ok: true, id });
  }));

  return { requireAssinante, COOKIE };
}

module.exports = { registrarRotasCliente, COOKIE };
