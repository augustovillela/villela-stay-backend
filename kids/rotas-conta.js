// =====================================================================
// Villela Kids — CONTA do responsável (o titular é sempre um adulto).
// Sessão própria por cookie `kids_sess` restrito ao path /kids — isolada
// do Portal Staff e dos demais produtos do grupo. Aqui: cadastro (com o
// consentimento parental do art. 14 da LGPD), login, verificação de
// e-mail, senha e direitos do titular (exportar/excluir).
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const emails = require('./emails');
const { Users, Notificacoes, Auditoria, s } = repo;

const COOKIE = 'kids_sess';

function registrarRotasConta(app, { jwtSecret }) {
  const seguro = process.env.NODE_ENV !== 'development';
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));
  const baseUrl = (req) => `${req.headers['x-forwarded-proto'] || req.protocol || 'https'}://${req.get('host')}`;

  // rate limit de login por IP (5 erros → 15 min)
  const tentativas = new Map();
  const bloqueado = (ip) => { const t = tentativas.get(ip); return !!(t && t.ate && t.ate > Date.now()); };
  const falha = (ip) => { const t = tentativas.get(ip) || { n: 0, ate: 0 }; if (++t.n >= 5) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; } tentativas.set(ip, t); };

  const setSessao = (res, userId) => {
    // A versão vai no token: trocar a senha invalida o que já foi emitido.
    const v = Number((Users.obter(userId) || {}).sessao_versao || 0);
    const token = jwt.sign({ uid: userId, v, tipo: 'sessao' }, jwtSecret, { expiresIn: '60d' });
    res.cookie(COOKIE, token, { httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: 60 * 24 * 3600 * 1000, path: '/kids' });
  };

  function requireUsuario(req, res, next) {
    try {
      const dec = jwt.verify(req.cookies && req.cookies[COOKIE], jwtSecret);
      // A4: o mesmo segredo assina o link de REDEFINIR SENHA (tipo 'kids-senha').
      // Sem conferir para que o token foi emitido, colar aquele link no cookie
      // valia como sessao. Token antigo nao tem 'tipo' e segue valendo; qualquer
      // outro proposito e recusado.
      if (dec.tipo !== undefined && dec.tipo !== 'sessao') throw new Error('x');
      const u = Users.obter(dec.uid);
      if (!u || u.status !== 'ativo') throw new Error('x');
      if (Number(dec.v || 0) !== Number(u.sessao_versao || 0)) throw new Error('x');
      req.usuario = u;
      next();
    } catch (_) { res.status(401).json({ erro: 'não autenticado' }); }
  }

  app.use('/kids/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---- cadastro / login ----
  app.post('/kids/api/cadastrar', h(async (req, res) => {
    const d = req.body || {};
    const u = Users.criar(d, { ip: ipDe(req), origem: s(d.origem, 120) });
    setSessao(res, u.id);
    const link = `${baseUrl(req)}/kids/verificar-email?token=${u.verif_token}`;
    emails.boasVindas(u, link);
    Notificacoes.criar(u.id, { titulo: 'Bem-vindo(a) ao Villela Kids', texto: 'Crie o perfil da criança para começar a primeira missão.', url: '/kids/app#perfis' });
    Auditoria.registrar({ quem: u.email, acao: 'conta.criar', entidade: 'users', entidade_id: u.id, ip: ipDe(req) });
    const extra = process.env.NODE_ENV === 'development' ? { link_verificacao: link } : {};
    res.json({ ok: true, usuario: { id: u.id, nome: u.nome, email: u.email, email_verificado: !!u.email_verificado }, ...extra });
  }));

  app.post('/kids/api/login', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente novamente em 15 minutos.' });
    const u = Users.autenticar((req.body || {}).email, (req.body || {}).senha);
    if (!u) { falha(ip); return res.status(401).json({ erro: 'E-mail ou senha incorretos.' }); }
    tentativas.delete(ip);
    setSessao(res, u.id);
    res.json({ ok: true, usuario: { id: u.id, nome: u.nome, email: u.email, email_verificado: !!u.email_verificado } });
  }));

  app.post('/kids/api/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/kids' }); res.json({ ok: true }); });

  // ---- verificação de e-mail (não bloqueia o uso no beta fechado) ----
  app.get('/kids/verificar-email', (req, res) => {
    const u = Users.verificarEmail(String(req.query.token || ''));
    res.redirect(302, u ? '/kids/app#pais?verificado=1' : '/kids/entrar?verificacao=invalida');
  });

  // ---- recuperação de senha (sem revelar se o e-mail existe) ----
  app.post('/kids/api/esqueci-senha', h(async (req, res) => {
    const u = Users.porEmail((req.body || {}).email);
    if (u && u.status === 'ativo') {
      const token = jwt.sign({ tipo: 'kids-senha', uid: u.id }, jwtSecret, { expiresIn: '2h' });
      const link = `${baseUrl(req)}/kids/entrar?definir=${token}`;
      emails.enviar(u.id, 'Villela Kids — redefinir senha', `<p>Para criar uma nova senha, abra: <a href="${link}">${link}</a></p><p>O link vale por 2 horas.</p>`);
      if (process.env.NODE_ENV === 'development') return res.json({ ok: true, link });
    }
    res.json({ ok: true });
  }));
  app.post('/kids/api/definir-senha', h(async (req, res) => {
    let dec;
    try { dec = jwt.verify(s((req.body || {}).token, 4000), jwtSecret); } catch (_) { return res.status(400).json({ erro: 'Link inválido ou expirado.' }); }
    if (dec.tipo !== 'kids-senha') return res.status(400).json({ erro: 'Link inválido.' });
    Users.definirSenha(dec.uid, (req.body || {}).senha);
    setSessao(res, dec.uid);
    res.json({ ok: true });
  }));

  // ---- quem sou eu ----
  app.get('/kids/api/me', requireUsuario, h(async (req, res) => {
    const u = req.usuario;
    res.json({
      usuario: { id: u.id, nome: u.nome, email: u.email, email_verificado: !!u.email_verificado },
      criancas: repo.Criancas.listar(u.id).map((c) => ({ ...c, nivel: repo.nivelDaCrianca(c.id) })),
      nao_lidas: Notificacoes.listar(u.id, { naoLidas: true }).length,
    });
  }));
  app.patch('/kids/api/me', requireUsuario, h(async (req, res) => {
    const u = Users.atualizar(req.usuario.id, req.body || {});
    res.json({ ok: true, usuario: { id: u.id, nome: u.nome } });
  }));
  app.post('/kids/api/me/senha', requireUsuario, h(async (req, res) => {
    if (!Users.autenticar(req.usuario.email, (req.body || {}).atual)) return res.status(400).json({ erro: 'Senha atual incorreta.' });
    Users.definirSenha(req.usuario.id, (req.body || {}).nova);
    setSessao(res, req.usuario.id);   // versao subiu: reemite p/ quem trocou nao cair junto
    res.json({ ok: true });
  }));

  // ---- notificações do responsável ----
  app.get('/kids/api/notificacoes', requireUsuario, h(async (req, res) => res.json({ notificacoes: Notificacoes.listar(req.usuario.id) })));
  app.post('/kids/api/notificacoes/lidas', requireUsuario, h(async (req, res) => { Notificacoes.marcarLidas(req.usuario.id); res.json({ ok: true }); }));

  // ---- LGPD: portabilidade e exclusão pelo titular ----
  app.get('/kids/api/meus-dados', requireUsuario, h(async (req, res) => {
    Auditoria.registrar({ quem: req.usuario.email, acao: 'lgpd.exportar', entidade: 'users', entidade_id: req.usuario.id, ip: ipDe(req) });
    res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-villela-kids.json"');
    res.json(Users.exportar(req.usuario.id));
  }));
  app.post('/kids/api/excluir-conta', requireUsuario, h(async (req, res) => {
    const r = Users.anonimizar(req.usuario.id);
    res.clearCookie(COOKIE, { path: '/kids' });
    res.json(r);
  }));

  return { requireUsuario, setSessao, COOKIE };
}

module.exports = { registrarRotasConta, COOKIE };
