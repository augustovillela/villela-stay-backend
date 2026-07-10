// =====================================================================
// Núcleo · staff-core: autenticação/sessão/usuários do Portal Staff —
// login (form nativo + JSON), logout, /me, troca de senha, CRUD de usuários
// (admin), link de acesso e login mágico. Extraído do server.js (Projeto 2).
// ⚠️ Os MIDDLEWARES (requireAuth/requireAdmin/lockout) ficam no server.js —
// são injetados aqui e em todos os outros módulos. bcrypt/jwt são requeridos
// direto. deps: { requireAuth, requireAdmin, loginBloqueado, registraFalha,
//   limpaFalhas, lerUsuarios, salvarUsuarios, JWT_SECRET, COOKIE_SECURE, semSenha,
//   areasDoUsuario, AREAS, AREA_IDS, novoId, registrarAuditoria }
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports.montar = function montar(app, deps) {
  const { requireAuth, requireAdmin, loginBloqueado, registraFalha, limpaFalhas, lerUsuarios,
    salvarUsuarios, JWT_SECRET, COOKIE_SECURE, semSenha, areasDoUsuario, AREAS, AREA_IDS,
    novoId, registrarAuditoria } = deps;

  app.post('/staff/api/login', (req, res) => {
    // Form NATIVO (POST+redirect) dispara o gerenciador de senhas; JSON mantém resposta JSON.
    const querJson = req.is('application/json') || req.accepts(['html', 'json']) === 'json';
    const ip = req.ip || 'ip';
    if (loginBloqueado(ip)) {
      if (querJson) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
      return res.redirect(303, '/staff/?login_erro=2');
    }
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const senha = String((req.body && (req.body.senha != null ? req.body.senha : req.body.password)) || '');
    const user = lerUsuarios().find(u => u.email === email && u.ativo);
    if (!user || !bcrypt.compareSync(senha, user.senhaHash)) {
      registraFalha(ip);
      if (querJson) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
      return res.redirect(303, '/staff/?login_erro=1');
    }
    limpaFalhas(ip);
    const usuarios = lerUsuarios();
    const u = usuarios.find(x => x.id === user.id);
    u.ultimoLogin = new Date().toISOString();
    salvarUsuarios(usuarios);
    const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('staff_token', token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/staff' });
    if (querJson) return res.json({ ok: true, usuario: semSenha(u), areas: areasDoUsuario(u), catalogoAreas: AREAS });
    return res.redirect(303, '/staff/');
  });

  app.post('/staff/api/logout', (req, res) => {
    res.clearCookie('staff_token', { path: '/staff' });
    res.json({ ok: true });
  });

  app.get('/staff/api/me', requireAuth, (req, res) => {
    res.json({ usuario: semSenha(req.user), areas: areasDoUsuario(req.user), catalogoAreas: AREAS });
  });

  app.post('/staff/api/conta/senha', requireAuth, (req, res) => {
    const atual = String((req.body && req.body.atual) || '');
    const nova = String((req.body && req.body.nova) || '');
    if (nova.length < 8) return res.status(400).json({ erro: 'A nova senha deve ter ao menos 8 caracteres.' });
    if (!bcrypt.compareSync(atual, req.user.senhaHash)) return res.status(400).json({ erro: 'Senha atual incorreta.' });
    const usuarios = lerUsuarios();
    const u = usuarios.find(x => x.id === req.user.id);
    u.senhaHash = bcrypt.hashSync(nova, 10);
    u.precisaTrocarSenha = false;
    salvarUsuarios(usuarios);
    res.json({ ok: true });
  });

  // ===================== usuários (admin) =====================
  app.get('/staff/api/usuarios', requireAuth, requireAdmin, (req, res) => {
    res.json({ usuarios: lerUsuarios().map(semSenha), catalogoAreas: AREAS });
  });

  app.post('/staff/api/usuarios', requireAuth, requireAdmin, (req, res) => {
    const d = req.body || {};
    const email = String(d.email || '').trim().toLowerCase();
    const senha = String(d.senha || '');
    const nome = String(d.nome || '').trim();
    if (!nome || !email || !/.+@.+\..+/.test(email)) return res.status(400).json({ erro: 'Nome e e-mail válidos são obrigatórios.' });
    if (senha.length < 8) return res.status(400).json({ erro: 'Senha inicial com ao menos 8 caracteres.' });
    const usuarios = lerUsuarios();
    if (usuarios.some(u => u.email === email)) return res.status(409).json({ erro: 'Já existe usuário com esse e-mail.' });
    const papel = d.papel === 'admin' ? 'admin' : 'staff';
    const areas = papel === 'admin' ? ['*'] : (Array.isArray(d.areas) ? d.areas.filter(a => AREA_IDS.has(a)) : []);
    const novo = {
      id: novoId(), nome, email, senhaHash: bcrypt.hashSync(senha, 10),
      papel, areas, ativo: true, precisaTrocarSenha: true,
      criadoEm: new Date().toISOString(), ultimoLogin: null,
    };
    usuarios.push(novo);
    salvarUsuarios(usuarios);
    registrarAuditoria(req, 'usuario.criar', `${nome} <${email}> (${papel})`);
    res.json({ ok: true, usuario: semSenha(novo) });
  });

  app.patch('/staff/api/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
    const usuarios = lerUsuarios();
    const u = usuarios.find(x => x.id === req.params.id);
    if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    const d = req.body || {};
    if (typeof d.nome === 'string' && d.nome.trim()) u.nome = d.nome.trim();
    if (d.papel === 'admin' || d.papel === 'staff') { u.papel = d.papel; if (d.papel === 'admin') u.areas = ['*']; }
    if (Array.isArray(d.areas) && u.papel !== 'admin') u.areas = d.areas.filter(a => AREA_IDS.has(a));
    if (typeof d.ativo === 'boolean') {
      if (!d.ativo && u.papel === 'admin' && usuarios.filter(x => x.papel === 'admin' && x.ativo).length <= 1)
        return res.status(400).json({ erro: 'Não é possível desativar o único administrador.' });
      u.ativo = d.ativo;
    }
    if (typeof d.novaSenha === 'string' && d.novaSenha) {
      if (d.novaSenha.length < 8) return res.status(400).json({ erro: 'Senha com ao menos 8 caracteres.' });
      u.senhaHash = bcrypt.hashSync(d.novaSenha, 10);
      u.precisaTrocarSenha = true;
    }
    salvarUsuarios(usuarios);
    registrarAuditoria(req, 'usuario.editar', `${u.nome} <${u.email}>${typeof d.novaSenha === 'string' && d.novaSenha ? ' (senha redefinida)' : ''}`);
    res.json({ ok: true, usuario: semSenha(u) });
  });

  app.delete('/staff/api/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
    const usuarios = lerUsuarios();
    const u = usuarios.find(x => x.id === req.params.id);
    if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (u.id === req.user.id) return res.status(400).json({ erro: 'Você não pode remover a si mesmo.' });
    if (u.papel === 'admin' && usuarios.filter(x => x.papel === 'admin' && x.ativo).length <= 1)
      return res.status(400).json({ erro: 'Não é possível remover o único administrador.' });
    salvarUsuarios(usuarios.filter(x => x.id !== u.id));
    registrarAuditoria(req, 'usuario.remover', `${u.nome} <${u.email}>`);
    res.json({ ok: true });
  });

  // ---- Link de acesso (admin gera token de 30min) + login mágico (troca por sessão) ----
  app.post('/staff/api/usuarios/:id/link-acesso', requireAuth, requireAdmin, (req, res) => {
    const u = lerUsuarios().find(x => x.id === req.params.id);
    if (!u || !u.ativo) return res.status(404).json({ erro: 'Usuário não encontrado ou inativo.' });
    const token = jwt.sign({ tipo: 'staff-magic', uid: u.id }, JWT_SECRET, { expiresIn: '30m' });
    registrarAuditoria(req, 'usuario.link-acesso', `${u.nome} <${u.email}>`);
    res.json({ ok: true, token, expiraMin: 30 });
  });
  app.post('/staff/api/login-magico', (req, res) => {
    const token = String((req.body && req.body.token) || '');
    try {
      const dec = jwt.verify(token, JWT_SECRET);
      if (!dec || dec.tipo !== 'staff-magic' || !dec.uid) return res.status(401).json({ erro: 'Link inválido ou expirado.' });
      const u = lerUsuarios().find(x => x.id === dec.uid && x.ativo);
      if (!u) return res.status(401).json({ erro: 'Usuário não encontrado.' });
      const sess = jwt.sign({ uid: u.id }, JWT_SECRET, { expiresIn: '30d' });
      res.cookie('staff_token', sess, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/staff' });
      res.json({ ok: true, usuario: semSenha(u), areas: areasDoUsuario(u), catalogoAreas: AREAS });
    } catch (e) { return res.status(401).json({ erro: 'Link inválido ou expirado.' }); }
  });
};
