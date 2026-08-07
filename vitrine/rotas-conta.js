// =====================================================================
// Vitrine — CONTA do usuário (a mesma conta compra e vende).
// Sessão própria por cookie `vitrine_sess` restrito ao path /vitrine —
// isolada do Portal Staff e dos demais produtos do grupo.
// Aqui: cadastro, login, verificação de e-mail, senha, endereços e LGPD.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const emails = require('./emails');
const { Users, Enderecos, Notificacoes, Auditoria, s } = repo;

const COOKIE = 'vitrine_sess';

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
    const token = jwt.sign({ uid: userId }, jwtSecret, { expiresIn: '60d' });
    res.cookie(COOKIE, token, { httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: 60 * 24 * 3600 * 1000, path: '/vitrine' });
  };

  function requireUsuario(req, res, next) {
    try {
      const { uid } = jwt.verify(req.cookies && req.cookies[COOKIE], jwtSecret);
      const u = Users.obter(uid);
      if (!u || u.status !== 'ativo') throw new Error('x');
      req.usuario = u;
      next();
    } catch (_) { res.status(401).json({ erro: 'não autenticado' }); }
  }
  function talvezUsuario(req, res, next) {
    try {
      const { uid } = jwt.verify(req.cookies && req.cookies[COOKIE], jwtSecret);
      const u = Users.obter(uid);
      if (u && u.status === 'ativo') req.usuario = u;
    } catch (_) { /* visitante */ }
    next();
  }

  app.use('/vitrine/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---- cadastro / login ----
  app.post('/vitrine/api/cadastrar', h(async (req, res) => {
    const d = req.body || {};
    const u = Users.criar(d, { ip: ipDe(req), origem: s(d.origem, 120) });
    setSessao(res, u.id);
    const link = `${baseUrl(req)}/vitrine/verificar-email?token=${u.verif_token}`;
    emails.boasVindas(u, link);
    Notificacoes.criar(u.id, { titulo: 'Bem-vindo(a) à Vitrine', texto: 'Confirme seu e-mail para comprar e vender com segurança.', url: '/vitrine/app#perfil' });
    Auditoria.registrar({ quem: u.email, acao: 'conta.criar', entidade: 'users', entidade_id: u.id, ip: ipDe(req) });
    const extra = process.env.NODE_ENV === 'development' ? { link_verificacao: link } : {};
    res.json({ ok: true, usuario: { id: u.id, nome: u.nome, email: u.email, email_verificado: !!u.email_verificado }, ...extra });
  }));

  app.post('/vitrine/api/login', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente novamente em 15 minutos.' });
    const u = Users.autenticar((req.body || {}).email, (req.body || {}).senha);
    if (!u) { falha(ip); return res.status(401).json({ erro: 'E-mail ou senha incorretos.' }); }
    tentativas.delete(ip);
    setSessao(res, u.id);
    res.json({ ok: true, usuario: { id: u.id, nome: u.nome, email: u.email, email_verificado: !!u.email_verificado } });
  }));

  app.post('/vitrine/api/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/vitrine' }); res.json({ ok: true }); });

  // ---- verificação de e-mail ----
  app.get('/vitrine/verificar-email', (req, res) => {
    const u = Users.verificarEmail(String(req.query.token || ''));
    res.redirect(302, u ? '/vitrine/app#perfil?verificado=1' : '/vitrine/entrar?verificacao=invalida');
  });
  app.post('/vitrine/api/reenviar-verificacao', requireUsuario, h(async (req, res) => {
    const u = req.usuario;
    if (u.email_verificado) return res.json({ ok: true, ja_verificado: true });
    const link = `${baseUrl(req)}/vitrine/verificar-email?token=${u.verif_token}`;
    emails.boasVindas(u, link);
    const extra = process.env.NODE_ENV === 'development' ? { link_verificacao: link } : {};
    res.json({ ok: true, ...extra });
  }));

  // ---- recuperação de senha (sem revelar se o e-mail existe) ----
  app.post('/vitrine/api/esqueci-senha', h(async (req, res) => {
    const u = Users.porEmail((req.body || {}).email);
    if (u && u.status === 'ativo') {
      const token = jwt.sign({ tipo: 'vitrine-senha', uid: u.id }, jwtSecret, { expiresIn: '2h' });
      const link = `${baseUrl(req)}/vitrine/entrar?definir=${token}`;
      emails.enviar(u.id, 'Vitrine — redefinir senha', `<p>Para criar uma nova senha, abra: <a href="${link}">${link}</a></p><p>O link vale por 2 horas.</p>`);
      if (process.env.NODE_ENV === 'development') return res.json({ ok: true, link });
    }
    res.json({ ok: true });
  }));
  app.post('/vitrine/api/definir-senha', h(async (req, res) => {
    let dec;
    try { dec = jwt.verify(s((req.body || {}).token, 4000), jwtSecret); } catch (_) { return res.status(400).json({ erro: 'Link inválido ou expirado.' }); }
    if (dec.tipo !== 'vitrine-senha') return res.status(400).json({ erro: 'Link inválido.' });
    Users.definirSenha(dec.uid, (req.body || {}).senha);
    setSessao(res, dec.uid);
    res.json({ ok: true });
  }));

  // ---- quem sou eu ----
  app.get('/vitrine/api/me', requireUsuario, h(async (req, res) => {
    const u = req.usuario;
    res.json({
      usuario: {
        id: u.id, nome: u.nome, email: u.email, telefone: u.telefone, cidade: u.cidade, uf: u.uf,
        bio: u.bio, avatar_url: u.avatar_url, papel: u.papel, email_verificado: !!u.email_verificado,
      },
      vendedor: repo.Vendedores.obter(u.id) || null,
      nao_lidas: Notificacoes.listar(u.id, { naoLidas: true }).length,
    });
  }));
  app.patch('/vitrine/api/me', requireUsuario, h(async (req, res) => {
    const u = Users.atualizar(req.usuario.id, req.body || {});
    res.json({ ok: true, usuario: { id: u.id, nome: u.nome, cidade: u.cidade, uf: u.uf, telefone: u.telefone, bio: u.bio } });
  }));
  app.post('/vitrine/api/me/senha', requireUsuario, h(async (req, res) => {
    if (!Users.autenticar(req.usuario.email, (req.body || {}).atual)) return res.status(400).json({ erro: 'Senha atual incorreta.' });
    Users.definirSenha(req.usuario.id, (req.body || {}).nova);
    res.json({ ok: true });
  }));

  // ---- endereços ----
  app.get('/vitrine/api/enderecos', requireUsuario, h(async (req, res) => res.json({ enderecos: Enderecos.listar(req.usuario.id) })));
  app.post('/vitrine/api/enderecos', requireUsuario, h(async (req, res) => res.json({ ok: true, endereco: Enderecos.criar(req.usuario.id, req.body || {}) })));
  app.delete('/vitrine/api/enderecos/:id', requireUsuario, h(async (req, res) => res.json(Enderecos.remover(req.usuario.id, req.params.id))));

  // ---- notificações ----
  app.get('/vitrine/api/notificacoes', requireUsuario, h(async (req, res) => res.json({ notificacoes: Notificacoes.listar(req.usuario.id) })));
  app.post('/vitrine/api/notificacoes/lidas', requireUsuario, h(async (req, res) => { Notificacoes.marcarLidas(req.usuario.id); res.json({ ok: true }); }));

  // ---- OAuth Mercado Pago (Split, fase 6): fluxo de navegador ----
  // O vendedor conecta a PRÓPRIA conta MP; o token fica no servidor e nunca
  // aparece no navegador. Sem VITRINE_MP_APP_ID/SECRET as rotas explicam que
  // a plataforma ainda não está configurada — nada é inventado.
  const pagamentos = require('./pagamentos');
  const usuarioDeCookie = (req) => {
    try {
      const { uid } = jwt.verify(req.cookies && req.cookies[COOKIE], jwtSecret);
      const u = Users.obter(uid);
      return (u && u.status === 'ativo') ? u : null;
    } catch (_) { return null; }
  };
  // O caminho do callback é CURTO de propósito: o campo "URLs de
  // redirecionamento" do painel do MP tem limite de tamanho e a URL longa
  // (/vitrine/oauth/mercadopago/callback) não cabia. A registrada no MP é:
  //   https://vitrine.villelastay.com.br/vitrine/oauth/mp
  const CALLBACK_MP = '/vitrine/oauth/mp';
  app.get('/vitrine/oauth/mercadopago', (req, res) => {
    const u = usuarioDeCookie(req);
    if (!u) return res.redirect(302, '/vitrine/entrar?voltar=' + encodeURIComponent('/vitrine/oauth/mercadopago'));
    if (!repo.Vendedores.obter(u.id)) return res.redirect(302, '/vitrine/app#vender');
    if (!pagamentos.OAuth.configurado()) return res.redirect(302, '/vitrine/app#loja?mp=nao-configurado');
    const state = jwt.sign({ tipo: 'vitrine-mp', uid: u.id }, jwtSecret, { expiresIn: '30m' });
    const redirectUri = baseUrl(req) + CALLBACK_MP;
    res.redirect(302, pagamentos.OAuth.url(state, redirectUri));
  });
  app.get([CALLBACK_MP, '/vitrine/oauth/mercadopago/callback'], h(async (req, res) => {
    let dec;
    try { dec = jwt.verify(s(String(req.query.state || ''), 4000), jwtSecret); } catch (_) { return res.redirect(302, '/vitrine/app#loja?mp=estado-invalido'); }
    if (dec.tipo !== 'vitrine-mp') return res.redirect(302, '/vitrine/app#loja?mp=estado-invalido');
    if (req.query.error) return res.redirect(302, '/vitrine/app#loja?mp=recusado');
    try {
      const redirectUri = baseUrl(req) + CALLBACK_MP; // tem de bater com a URL registrada no MP
      const tokens = await pagamentos.OAuth.trocarCodigo(String(req.query.code || ''), redirectUri);
      pagamentos.MPTokens.salvar(dec.uid, tokens);
      Auditoria.registrar({ quem: dec.uid, acao: 'mp.conectar', entidade: 'seller_mp_tokens', entidade_id: dec.uid, detalhe: 'live_mode=' + (tokens.live_mode ? '1' : '0') });
      res.redirect(302, '/vitrine/app#loja?mp=conectado');
    } catch (e) {
      console.error('[vitrine] OAuth MP falhou:', e.message);
      res.redirect(302, '/vitrine/app#loja?mp=erro');
    }
  }));

  // ---- LGPD: portabilidade e exclusão pelo titular ----
  app.get('/vitrine/api/meus-dados', requireUsuario, h(async (req, res) => {
    Auditoria.registrar({ quem: req.usuario.email, acao: 'lgpd.exportar', entidade: 'users', entidade_id: req.usuario.id, ip: ipDe(req) });
    res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-vitrine.json"');
    res.json(Users.exportar(req.usuario.id));
  }));
  app.post('/vitrine/api/excluir-conta', requireUsuario, h(async (req, res) => {
    const r = Users.anonimizar(req.usuario.id);
    res.clearCookie(COOKIE, { path: '/vitrine' });
    res.json(r);
  }));

  return { requireUsuario, talvezUsuario, setSessao, COOKIE };
}

module.exports = { registrarRotasConta, COOKIE };
