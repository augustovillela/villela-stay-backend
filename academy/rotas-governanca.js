// =====================================================================
// Villela Academy — rotas de GOVERNANÇA (FASE 10): certificados,
// tickets de suporte, relatórios avançados e 2FA. A página pública de
// validação do certificado vive em paginas.js.
// =====================================================================
'use strict';
const repo = require('./repo');
const gov = require('./governanca');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const h = (fn) => (req, res) => {
  try { Promise.resolve(fn(req, res)).catch(e => res.status(e.status || 400).json({ erro: e.message })); }
  catch (e) { res.status(e.status || 400).json({ erro: e.message }); }
};

function registrarRotasGovernanca(app, { requireUsuario, requirePapel }) {
  const ADM = [requireUsuario, requirePapel('admin')];

  // ---- certificados ----
  app.post('/academy/api/aluno/cursos/:productId/certificado', requireUsuario, requirePapel('aluno'), h((req, res) => {
    const c = gov.Certificados.emitir(req.usuario, req.params.productId);
    res.json({ ok: true, codigo: c.id, url: '/academy/certificados/' + c.id });
  }));
  app.get('/academy/api/aluno/certificados', requireUsuario, requirePapel('aluno'), h((req, res) => {
    res.json({ certificados: gov.Certificados.doAluno(req.usuario.id) });
  }));

  // ---- tickets (qualquer usuário logado) ----
  app.post('/academy/api/tickets', requireUsuario, h((req, res) => {
    const id = gov.Tickets.abrir(req.usuario, req.body || {});
    repo.Auditoria.registrar({ quem: req.usuario.id, acao: 'ticket.abrir', entidade: 'support_tickets', entidade_id: id, detalhe: s((req.body || {}).assunto, 100) });
    res.json({ ok: true, id });
  }));
  app.get('/academy/api/tickets', requireUsuario, h((req, res) => {
    res.json({ tickets: gov.Tickets.doUsuario(req.usuario.id) });
  }));
  app.get('/academy/api/tickets/:id', requireUsuario, h((req, res) => {
    const t = gov.Tickets.obter(req.params.id);
    if (!t || t.user_id !== req.usuario.id) return res.status(404).json({ erro: 'Ticket não encontrado.' });
    res.json({ ticket: t });
  }));
  app.post('/academy/api/tickets/:id/responder', requireUsuario, h((req, res) => {
    const t = gov.Tickets.obter(req.params.id);
    if (!t || t.user_id !== req.usuario.id) return res.status(404).json({ erro: 'Ticket não encontrado.' });
    gov.Tickets.responder(t.id, { lado: 'usuario', autor: req.usuario.email, texto: (req.body || {}).texto });
    res.json({ ok: true });
  }));

  // ---- 2FA (TOTP) ----
  app.post('/academy/api/me/2fa/gerar', requireUsuario, h((req, res) => {
    res.json({ ok: true, ...gov.DoisFA.gerar(req.usuario) });
  }));
  app.post('/academy/api/me/2fa/ativar', requireUsuario, h((req, res) => {
    gov.DoisFA.ativar(req.usuario, (req.body || {}).codigo);
    res.json({ ok: true });
  }));
  app.post('/academy/api/me/2fa/desativar', requireUsuario, h((req, res) => {
    gov.DoisFA.desativar(req.usuario, (req.body || {}).codigo);
    res.json({ ok: true });
  }));

  // ---- admin: relatórios avançados + tickets ----
  app.get('/academy/api/admin/relatorios', ...ADM, h((req, res) => res.json(gov.Relatorios.executivo())));
  app.get('/academy/api/admin/tickets', ...ADM, h((req, res) => res.json({ tickets: gov.Tickets.listarAdmin(req.query) })));
  app.get('/academy/api/admin/tickets/:id', ...ADM, h((req, res) => {
    const t = gov.Tickets.obter(req.params.id);
    if (!t) return res.status(404).json({ erro: 'Ticket não encontrado.' });
    res.json({ ticket: t });
  }));
  app.post('/academy/api/admin/tickets/:id/responder', ...ADM, h((req, res) => {
    gov.Tickets.responder(req.params.id, { lado: 'plataforma', autor: req.usuario.email, texto: (req.body || {}).texto });
    res.json({ ok: true });
  }));
  app.post('/academy/api/admin/tickets/:id/status', ...ADM, h((req, res) => {
    gov.Tickets.mudarStatus(req.params.id, s((req.body || {}).status, 20));
    res.json({ ok: true });
  }));
}

function registrarRotasGovernancaStaff(app, { requireAuth, requireAdmin }) {
  const A = [requireAuth, requireAdmin];
  const quem = (req) => 'staff:' + ((req.user && (req.user.nome || req.user.email)) || 'plataforma');
  app.get('/staff/api/academy/relatorios', ...A, h((req, res) => res.json(gov.Relatorios.executivo())));
  app.get('/staff/api/academy/tickets', ...A, h((req, res) => res.json({ tickets: gov.Tickets.listarAdmin(req.query) })));
  app.get('/staff/api/academy/tickets/:id', ...A, h((req, res) => {
    const t = gov.Tickets.obter(req.params.id);
    if (!t) return res.status(404).json({ erro: 'Ticket não encontrado.' });
    res.json({ ticket: t });
  }));
  app.post('/staff/api/academy/tickets/:id/responder', ...A, h((req, res) => {
    gov.Tickets.responder(req.params.id, { lado: 'plataforma', autor: quem(req), texto: (req.body || {}).texto });
    res.json({ ok: true });
  }));
  app.post('/staff/api/academy/tickets/:id/status', ...A, h((req, res) => {
    gov.Tickets.mudarStatus(req.params.id, String((req.body || {}).status || ''));
    res.json({ ok: true });
  }));
}

module.exports = { registrarRotasGovernanca, registrarRotasGovernancaStaff };
