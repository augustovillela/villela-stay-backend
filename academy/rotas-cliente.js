// =====================================================================
// Villela Academy Marketplace — API do USUÁRIO (aluno/produtor/afiliado/
// admin da Academy), sessão própria. Cookie `academy_sess` restrito ao
// path /academy, JWT com jti revogável (tabela sessions). Isolado do
// Portal Staff e dos demais SaaS.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const com = require('./emails'); // F8

const COOKIE = 'academy_sess';
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

function registrarRotasCliente(app, { jwtSecret }) {
  const seguro = process.env.NODE_ENV !== 'development';
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));
  const aud = (req, acao, entidade, entidade_id, detalhe) => repo.Auditoria.registrar({
    quem: (req.usuario && req.usuario.id) || 'anonimo', papel: (req.papelAtivo || ''),
    acao, entidade, entidade_id, detalhe, ip: ipDe(req),
  });

  // rate limit de login/signup por IP (5 falhas → 15 min)
  const tentativas = new Map();
  const bloqueado = (ip) => { const t = tentativas.get(ip); return !!(t && t.ate && t.ate > Date.now()); };
  const falha = (ip) => { const t = tentativas.get(ip) || { n: 0, ate: 0 }; if (++t.n >= 5) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; } tentativas.set(ip, t); };

  // autenticação: JWT válido + sessão não revogada + usuário ativo
  function requireUsuario(req, res, next) {
    try {
      const { uid, jti } = jwt.verify(req.cookies && req.cookies[COOKIE], jwtSecret);
      if (!repo.Sessoes.valida(jti)) throw new Error('sessão revogada');
      const u = repo.Usuarios.porId(uid);
      if (!u || u.status !== 'ativo') throw new Error('conta indisponível');
      req.usuario = u; req.jti = jti;
      next();
    } catch (_) { res.status(401).json({ erro: 'não autenticado' }); }
  }
  // autorização por papel (produtor/afiliado exigem perfil aprovado)
  const requirePapel = (papel) => (req, res, next) => {
    if (!repo.podeAgirComo(req.usuario, papel)) {
      return res.status(403).json({ erro: `Acesso restrito ao papel '${papel}'.` });
    }
    req.papelAtivo = papel; next();
  };

  app.use('/academy/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---- cadastro / login / logout ----
  app.post('/academy/api/signup', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    const d = req.body || {};
    if (!d.aceite_termos) return res.status(400).json({ erro: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.' });
    let u;
    try { u = repo.Usuarios.criar(d); } catch (e) { falha(ip); throw e; }
    repo.Auditoria.registrar({ quem: u.id, papel: 'aluno', acao: 'auth.signup', entidade: 'users', entidade_id: u.id, detalhe: u.email, ip });
    // F8: boas-vindas com link de verificação de e-mail (best-effort)
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const tokVerif = jwt.sign({ tipo: 'academy-verify', uid: u.id }, jwtSecret, { expiresIn: '7d' });
    com.Emails.boasVindas(u, `${proto}://${req.get('host')}/academy/verificar-email?token=${tokVerif}`);
    const jti = repo.Sessoes.criar(u.id, { ip, userAgent: req.headers['user-agent'] });
    const token = jwt.sign({ uid: u.id, jti }, jwtSecret, { expiresIn: '30d' });
    res.cookie(COOKIE, token, { httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/academy' });
    res.json({ ok: true });
  }));

  app.post('/academy/api/login', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    const u = repo.Usuarios.porEmail((req.body || {}).email);
    if (!u || u.status !== 'ativo' || !repo.Usuarios.conferirSenha(u, (req.body || {}).senha)) {
      falha(ip);
      repo.Auditoria.registrar({ quem: (u && u.id) || 'anonimo', acao: 'auth.login.falha', entidade: 'users', detalhe: s((req.body || {}).email, 120), ip });
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }
    // F10: segundo fator quando o usuário ativou 2FA
    const fa = require('./governanca').DoisFA.conferirLogin(u.id, (req.body || {}).codigo);
    if (fa.precisa && !fa.ok) {
      if (!(req.body || {}).codigo) return res.status(401).json({ erro: 'Informe o código do autenticador.', precisa_2fa: true });
      falha(ip);
      return res.status(401).json({ erro: 'Código 2FA incorreto.', precisa_2fa: true });
    }
    tentativas.delete(ip);
    require('./db').db.prepare('UPDATE users SET ultimo_login = ? WHERE id = ?').run(new Date().toISOString(), u.id);
    const jti = repo.Sessoes.criar(u.id, { ip, userAgent: req.headers['user-agent'] });
    repo.Auditoria.registrar({ quem: u.id, acao: 'auth.login', entidade: 'sessions', entidade_id: jti, ip });
    const token = jwt.sign({ uid: u.id, jti }, jwtSecret, { expiresIn: '30d' });
    res.cookie(COOKIE, token, { httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/academy' });
    res.json({ ok: true });
  }));

  app.post('/academy/api/logout', requireUsuario, h(async (req, res) => {
    repo.Sessoes.revogar(req.jti);
    aud(req, 'auth.logout', 'sessions', req.jti, '');
    res.clearCookie(COOKIE, { path: '/academy' });
    res.json({ ok: true });
  }));

  // ---- conta ----
  app.get('/academy/api/me', requireUsuario, h(async (req, res) => {
    const u = req.usuario;
    res.json({
      usuario: repo.semSegredos(u),
      permissoes: repo.permissoesDe(u),
      papeis_ativos: repo.PAPEIS.filter(p => repo.podeAgirComo(u, p)),
      perfil_produtor: repo.Perfis.produtor(u.id) ? { status: repo.Perfis.produtor(u.id).status, slug: repo.Perfis.produtor(u.id).slug } : null,
      perfil_afiliado: repo.Perfis.afiliado(u.id) ? { status: repo.Perfis.afiliado(u.id).status } : null,
    });
  }));
  app.patch('/academy/api/me', requireUsuario, h(async (req, res) => {
    const u = repo.Usuarios.editar(req.usuario.id, req.body || {});
    aud(req, 'conta.editar', 'users', u.id, '');
    res.json({ ok: true, usuario: repo.semSegredos(u) });
  }));
  app.post('/academy/api/me/senha', requireUsuario, h(async (req, res) => {
    if (!repo.Usuarios.conferirSenha(repo.Usuarios.porId(req.usuario.id), (req.body || {}).senha_atual)) {
      return res.status(400).json({ erro: 'Senha atual incorreta.' });
    }
    repo.Usuarios.trocarSenha(req.usuario.id, (req.body || {}).senha_nova);
    repo.Sessoes.revogarDoUsuario(req.usuario.id); // troca de senha derruba as sessões
    aud(req, 'conta.trocar-senha', 'users', req.usuario.id, '');
    res.clearCookie(COOKIE, { path: '/academy' });
    res.json({ ok: true, relogin: true });
  }));

  // ---- F8: verificação de e-mail + recuperação de senha + notificações ----
  app.post('/academy/api/me/reenviar-verificacao', requireUsuario, h(async (req, res) => {
    if (req.usuario.email_verificado) return res.json({ ok: true, ja_verificado: true });
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const tok = jwt.sign({ tipo: 'academy-verify', uid: req.usuario.id }, jwtSecret, { expiresIn: '7d' });
    await com.Emails.reenviarVerificacao(req.usuario, `${proto}://${req.get('host')}/academy/verificar-email?token=${tok}`);
    res.json({ ok: true });
  }));
  app.post('/academy/api/verificar-email', h(async (req, res) => {
    let dec; try { dec = jwt.verify(s((req.body || {}).token, 2000), jwtSecret); } catch (_) { return res.status(400).json({ erro: 'Link inválido ou expirado.' }); }
    if (dec.tipo !== 'academy-verify') return res.status(400).json({ erro: 'Link inválido.' });
    repo.Usuarios.marcarEmailVerificado(dec.uid);
    repo.Auditoria.registrar({ quem: dec.uid, acao: 'auth.email-verificado', entidade: 'users', entidade_id: dec.uid, ip: ipDe(req) });
    res.json({ ok: true });
  }));

  // esqueci minha senha: sempre responde ok (sem enumeração de e-mails)
  app.post('/academy/api/senha/esquecer', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    falha(ip); // conta contra o rate limit p/ evitar abuso do disparo
    const u = repo.Usuarios.porEmail((req.body || {}).email);
    if (u && u.status === 'ativo') {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const tok = jwt.sign({ tipo: 'academy-reset', uid: u.id }, jwtSecret, { expiresIn: '30m' });
      com.Emails.redefinirSenha(u, `${proto}://${req.get('host')}/academy/redefinir-senha?token=${tok}`);
      repo.Auditoria.registrar({ quem: u.id, acao: 'auth.senha-esquecer', entidade: 'users', entidade_id: u.id, ip });
    }
    res.json({ ok: true }); // resposta idêntica exista ou não a conta
  }));
  app.post('/academy/api/senha/redefinir', h(async (req, res) => {
    let dec; try { dec = jwt.verify(s((req.body || {}).token, 2000), jwtSecret); } catch (_) { return res.status(400).json({ erro: 'Link inválido ou expirado.' }); }
    if (dec.tipo !== 'academy-reset') return res.status(400).json({ erro: 'Link inválido.' });
    repo.Usuarios.trocarSenha(dec.uid, (req.body || {}).senha);
    repo.Sessoes.revogarDoUsuario(dec.uid); // troca derruba sessões
    repo.Auditoria.registrar({ quem: dec.uid, acao: 'auth.senha-redefinida', entidade: 'users', entidade_id: dec.uid, ip: ipDe(req) });
    res.json({ ok: true });
  }));

  // sininho
  app.get('/academy/api/notificacoes', requireUsuario, h(async (req, res) => {
    res.json(com.Notificacoes.doUsuario(req.usuario.id));
  }));
  app.post('/academy/api/notificacoes/lidas', requireUsuario, h(async (req, res) => {
    com.Notificacoes.marcarLidas(req.usuario.id);
    res.json({ ok: true });
  }));

  // ---- notificações push do painel (PWA) — espelham o sininho no celular ----
  const push = require('./push');
  app.get('/academy/api/push/chave', requireUsuario, h(async (req, res) => res.json({ publicKey: push.chavePublica() })));
  app.post('/academy/api/push/subscribe', requireUsuario, h(async (req, res) => {
    push.salvar(req.usuario.id, (req.body || {}).subscription);
    res.json({ ok: true });
  }));
  app.post('/academy/api/push/unsubscribe', requireUsuario, h(async (req, res) => {
    push.remover((req.body || {}).endpoint);
    res.json({ ok: true });
  }));

  // LGPD: takeout + exclusão (anonimização) pelo próprio titular
  app.get('/academy/api/me/exportar', requireUsuario, h(async (req, res) => {
    aud(req, 'lgpd.exportar', 'users', req.usuario.id, '');
    res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-academy.json"');
    res.json(repo.Usuarios.exportar(req.usuario.id));
  }));
  app.post('/academy/api/me/excluir', requireUsuario, h(async (req, res) => {
    if (!repo.Usuarios.conferirSenha(repo.Usuarios.porId(req.usuario.id), (req.body || {}).senha)) {
      return res.status(400).json({ erro: 'Confirme com a sua senha.' });
    }
    aud(req, 'lgpd.excluir', 'users', req.usuario.id, 'anonimização a pedido do titular');
    repo.Usuarios.anonimizar(req.usuario.id);
    res.clearCookie(COOKIE, { path: '/academy' });
    res.json({ ok: true });
  }));

  // ---- onboarding de produtor / afiliado (fluxo com aprovação) ----
  app.post('/academy/api/tornar-se-produtor', requireUsuario, h(async (req, res) => {
    const p = repo.Perfis.solicitarProdutor(req.usuario.id, req.body || {});
    aud(req, 'perfil.produtor.solicitar', 'producer_profiles', req.usuario.id, p.nome_publico);
    res.json({ ok: true, status: p.status });
  }));
  app.post('/academy/api/tornar-se-afiliado', requireUsuario, h(async (req, res) => {
    const p = repo.Perfis.solicitarAfiliado(req.usuario.id, req.body || {});
    aud(req, 'perfil.afiliado.solicitar', 'affiliate_profiles', req.usuario.id, p.nome_publico);
    res.json({ ok: true, status: p.status });
  }));

  // ---- dashboards por papel ----
  app.get('/academy/api/aluno/dashboard', requireUsuario, requirePapel('aluno'), h(async (req, res) => {
    res.json({ dashboard: repo.Dashboard.aluno(req.usuario.id) });
  }));
  app.get('/academy/api/produtor/dashboard', requireUsuario, requirePapel('produtor'), h(async (req, res) => {
    res.json({ dashboard: repo.Dashboard.produtor(req.usuario.id), perfil: repo.Perfis.produtor(req.usuario.id) });
  }));
  app.get('/academy/api/afiliado/dashboard', requireUsuario, requirePapel('afiliado'), h(async (req, res) => {
    res.json({ dashboard: repo.Dashboard.afiliado(req.usuario.id), perfil: repo.Perfis.afiliado(req.usuario.id) });
  }));

  // ---- administração da Academy (papel admin dentro da plataforma) ----
  const ADM = [requireUsuario, requirePapel('admin')];
  app.get('/academy/api/admin/dashboard', ...ADM, h(async (req, res) => {
    res.json({ dashboard: repo.Dashboard.plataforma(), pendentes: repo.Perfis.pendentes() });
  }));
  app.get('/academy/api/admin/usuarios', ...ADM, h(async (req, res) => {
    res.json({ usuarios: repo.Usuarios.listar(req.query) });
  }));
  app.post('/academy/api/admin/perfis/:tipo/:userId/decidir', ...ADM, h(async (req, res) => {
    const { tipo, userId } = req.params;
    if (!['produtor', 'afiliado'].includes(tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
    const p = repo.Perfis.decidir(tipo, userId, s((req.body || {}).status, 20), (req.body || {}).motivo);
    aud(req, `perfil.${tipo}.${p.status}`, tipo === 'produtor' ? 'producer_profiles' : 'affiliate_profiles', userId, s((req.body || {}).motivo, 200));
    const alvo = repo.Usuarios.porId(userId); // F8: avisa o solicitante
    if (alvo) {
      com.Emails.perfilDecidido(alvo, tipo, p.status, (req.body || {}).motivo);
      com.Notificacoes.criar(alvo.id, `Cadastro de ${tipo}: ${p.status}`, p.status === 'aprovado' ? 'A nova aba já está no seu painel.' : s((req.body || {}).motivo, 200), '/academy/app');
    }
    res.json({ ok: true, perfil: { status: p.status } });
  }));
  app.post('/academy/api/admin/usuarios/:id/status', ...ADM, h(async (req, res) => {
    if (req.params.id === req.usuario.id) return res.status(400).json({ erro: 'Não altere o próprio status.' });
    const u = repo.Usuarios.mudarStatus(req.params.id, s((req.body || {}).status, 20));
    aud(req, 'usuario.status', 'users', u.id, u.status);
    res.json({ ok: true, usuario: repo.semSegredos(u) });
  }));
  app.get('/academy/api/admin/auditoria', ...ADM, h(async (req, res) => {
    res.json({ eventos: repo.Auditoria.listar(req.query.n) });
  }));

  return { requireUsuario, requirePapel, COOKIE };
}

module.exports = { registrarRotasCliente, COOKIE };
