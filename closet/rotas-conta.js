// =====================================================================
// Closet Club — CONTA do usuário (a mesma conta aluga e anuncia).
// Sessão própria por cookie `closet_sess` restrito ao path /closet —
// isolada do Portal Staff e dos demais produtos do grupo.
// Aqui: cadastro, login, perfil, chave Pix, plano e direitos LGPD.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const billing = require('./billing');
const Push = require('./push');
const { Users, Notificacoes, Auditoria, s } = repo;

const COOKIE = 'closet_sess';

function registrarRotasConta(app, { jwtSecret, enviarEmail }) {
  const seguro = process.env.NODE_ENV !== 'development';
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));

  // rate limit de login por IP (5 erros → 15 min)
  const tentativas = new Map();
  const bloqueado = (ip) => { const t = tentativas.get(ip); return !!(t && t.ate && t.ate > Date.now()); };
  const falha = (ip) => { const t = tentativas.get(ip) || { n: 0, ate: 0 }; if (++t.n >= 5) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; } tentativas.set(ip, t); };

  const setSessao = (res, userId) => {
    const token = jwt.sign({ uid: userId }, jwtSecret, { expiresIn: '60d' });
    res.cookie(COOKIE, token, { httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: 60 * 24 * 3600 * 1000, path: '/closet' });
  };

  // exige login
  function requireUsuario(req, res, next) {
    try {
      const { uid } = jwt.verify(req.cookies && req.cookies[COOKIE], jwtSecret);
      const u = Users.obter(uid);
      if (!u || u.status !== 'ativo') throw new Error('x');
      req.usuario = u;
      next();
    } catch (_) { res.status(401).json({ erro: 'não autenticado' }); }
  }
  // sessão opcional (vitrine sabe quem você é, mas não exige login)
  function talvezUsuario(req, res, next) {
    try {
      const { uid } = jwt.verify(req.cookies && req.cookies[COOKIE], jwtSecret);
      const u = Users.obter(uid);
      if (u && u.status === 'ativo') req.usuario = u;
    } catch (_) { /* visitante */ }
    next();
  }
  const requireAdminCloset = (req, res, next) => (req.usuario && ['admin', 'moderador'].includes(req.usuario.papel))
    ? next() : res.status(403).json({ erro: 'Acesso restrito à administração.' });

  app.use('/closet/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---- cadastro / login ----
  app.post('/closet/api/cadastrar', h(async (req, res) => {
    const d = req.body || {};
    const u = Users.criar(d, { ip: ipDe(req), origem: s(d.origem, 120) });
    setSessao(res, u.id);
    Notificacoes.criar(u.id, { titulo: 'Bem-vinda ao Closet Club', texto: 'Complete seu perfil para receber sugestões de look no seu tamanho.', url: '/closet/app#perfil' });
    if (enviarEmail) {
      enviarEmail(u.email, 'Closet Club — sua conta está pronta',
        `<p>Olá, ${s(u.nome, 60)}!</p><p>Sua conta no <b>Closet Club</b> foi criada.</p>
         <p>Alugue um look completo ou transforme as peças paradas do seu armário em renda.</p>
         <p><a href="https://closet.villelastay.com.br/closet/app">Abrir meu Closet</a></p>`).catch(() => {});
    }
    Auditoria.registrar({ quem: u.email, acao: 'conta.criar', entidade: 'users', entidade_id: u.id, ip: ipDe(req) });
    res.json({ ok: true, usuario: { id: u.id, nome: u.nome, email: u.email } });
  }));

  app.post('/closet/api/login', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    const u = Users.autenticar((req.body || {}).email, (req.body || {}).senha);
    if (!u) { falha(ip); return res.status(401).json({ erro: 'E-mail ou senha incorretos.' }); }
    tentativas.delete(ip);
    setSessao(res, u.id);
    res.json({ ok: true, usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel } });
  }));

  app.post('/closet/api/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/closet' }); res.json({ ok: true }); });

  // recuperação de senha por link assinado (sem expor se o e-mail existe)
  app.post('/closet/api/esqueci-senha', h(async (req, res) => {
    const u = Users.porEmail((req.body || {}).email);
    if (u) {
      const token = jwt.sign({ tipo: 'closet-senha', uid: u.id }, jwtSecret, { expiresIn: '2h' });
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const link = `${proto}://${req.get('host')}/closet/definir-senha?token=${token}`;
      if (enviarEmail) enviarEmail(u.email, 'Closet Club — redefinir senha', `<p>Para criar uma nova senha, clique: <a href="${link}">${link}</a></p><p>O link vale por 2 horas.</p>`).catch(() => {});
      if (process.env.NODE_ENV === 'development') return res.json({ ok: true, link });
    }
    res.json({ ok: true });
  }));

  app.post('/closet/api/definir-senha', h(async (req, res) => {
    let dec;
    try { dec = jwt.verify(s((req.body || {}).token, 4000), jwtSecret); } catch (_) { return res.status(400).json({ erro: 'Link inválido ou expirado.' }); }
    if (dec.tipo !== 'closet-senha') return res.status(400).json({ erro: 'Link inválido.' });
    Users.definirSenha(dec.uid, (req.body || {}).senha);
    setSessao(res, dec.uid);
    res.json({ ok: true });
  }));

  // ---- quem sou eu ----
  app.get('/closet/api/me', requireUsuario, h(async (req, res) => {
    const u = req.usuario;
    res.json({
      usuario: {
        id: u.id, nome: u.nome, email: u.email, telefone: u.telefone, cidade: u.cidade, uf: u.uf, bairro: u.bairro,
        avatar_url: u.avatar_url, bio: u.bio, papel: u.papel, plano: u.plano, premium_ate: u.premium_ate,
        perfil_corpo: u.perfil_corpo, pix_tipo: u.pix_tipo, pix_chave: u.pix_chave, verificado: u.verificado,
        nota_media: u.nota_media, num_avaliacoes: u.num_avaliacoes, num_alugueis: u.num_alugueis, num_locacoes: u.num_locacoes,
      },
      entitlements: u.entitlements,
      nao_lidas: Notificacoes.listar(u.id, { naoLidas: true }).length,
      push_key: Push.chavePublica(),
    });
  }));

  app.patch('/closet/api/me', requireUsuario, h(async (req, res) => {
    const u = Users.atualizar(req.usuario.id, req.body || {});
    res.json({ ok: true, usuario: { id: u.id, nome: u.nome, cidade: u.cidade, uf: u.uf, perfil_corpo: u.perfil_corpo, pix_chave: u.pix_chave } });
  }));

  app.post('/closet/api/me/senha', requireUsuario, h(async (req, res) => {
    const atual = (req.body || {}).atual;
    if (!Users.autenticar(req.usuario.email, atual)) return res.status(400).json({ erro: 'Senha atual incorreta.' });
    Users.definirSenha(req.usuario.id, (req.body || {}).nova);
    res.json({ ok: true });
  }));

  // ---- notificações ----
  app.get('/closet/api/notificacoes', requireUsuario, h(async (req, res) => res.json({ notificacoes: Notificacoes.listar(req.usuario.id) })));
  app.post('/closet/api/notificacoes/lidas', requireUsuario, h(async (req, res) => { Notificacoes.marcarLidas(req.usuario.id); res.json({ ok: true }); }));

  // ---- push (PWA) ----
  app.post('/closet/api/push/assinar', requireUsuario, h(async (req, res) => { Push.salvar(req.usuario.id, (req.body || {}).sub); res.json({ ok: true }); }));
  app.post('/closet/api/push/cancelar', requireUsuario, h(async (req, res) => { Push.remover((req.body || {}).endpoint); res.json({ ok: true }); }));

  // ---- plano Premium ----
  app.get('/closet/api/plano', requireUsuario, h(async (req, res) => res.json(billing.estadoAssinatura(req.usuario.id))));
  app.post('/closet/api/plano/assinar', requireUsuario, h(async (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    res.json({ ok: true, ...(await billing.assinarPremium(req.usuario.id, `${proto}://${req.get('host')}`)) });
  }));
  app.post('/closet/api/plano/cancelar', requireUsuario, h(async (req, res) => res.json(await billing.cancelarPremium(req.usuario.id))));

  // ---- LGPD: portabilidade e exclusão pelo próprio titular ----
  app.get('/closet/api/meus-dados', requireUsuario, h(async (req, res) => {
    Auditoria.registrar({ quem: req.usuario.email, acao: 'lgpd.exportar', entidade: 'users', entidade_id: req.usuario.id, ip: ipDe(req) });
    res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-closet-club.json"');
    res.json(Users.exportar(req.usuario.id));
  }));
  app.post('/closet/api/excluir-conta', requireUsuario, h(async (req, res) => {
    const r = Users.anonimizar(req.usuario.id, req.usuario.email);
    res.clearCookie(COOKIE, { path: '/closet' });
    res.json(r);
  }));

  return { requireUsuario, talvezUsuario, requireAdminCloset, setSessao, COOKIE };
}

module.exports = { registrarRotasConta, COOKIE };
