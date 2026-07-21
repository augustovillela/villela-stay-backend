// =====================================================================
// Villela Stay Manager (VSM) — API de ADMINISTRAÇÃO DA PLATAFORMA (Portal Staff).
// Prefixo /staff/api/vsm/*. requireAuth + requireAdmin (só o dono da
// plataforma administra o negócio SaaS). Tudo auditado.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const billing = require('./billing');

function registrarRotasStaff(app, { requireAuth, requireAdmin, jwtSecret, enviarEmail }) {
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const quem = (req) => (req.user && (req.user.nome || req.user.email)) || 'plataforma';
  const A = [requireAuth, requireAdmin]; // guarda de admin da plataforma
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));
  const aud = (req, acao, ent, id, det) => repo.Auditoria.registrar({ quem: quem(req), acao, entidade: ent, entidade_id: id, detalhe: det, ip: ipDe(req) });

  app.use('/staff/api/vsm', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // painel
  app.get('/staff/api/vsm/dashboard', ...A, h((req, res) => {
    res.json({ resumo: repo.Dashboard.plataforma(), catalogo: { modulos: repo.MODULOS, limites: repo.LIMITES, flags: repo.Flags.listar() } });
  }));

  // ---- planos ----
  app.get('/staff/api/vsm/planos', ...A, h((req, res) => res.json({ planos: repo.Planos.listar({ incluirInativos: true }), modulos: repo.MODULOS, limites: repo.LIMITES })));
  app.patch('/staff/api/vsm/planos/:id', ...A, h((req, res) => {
    const p = repo.Planos.atualizar(req.params.id, req.body || {});
    aud(req, 'plano.editar', 'plans', p.id, p.slug);
    res.json({ ok: true, plano: p });
  }));

  // ---- tenants (operações) ----
  app.get('/staff/api/vsm/tenants', ...A, h((req, res) => res.json({ tenants: repo.Tenants.listar(req.query) })));
  app.get('/staff/api/vsm/tenants/:id', ...A, h((req, res) => {
    const t = repo.Tenants.obter(req.params.id);
    if (!t) return res.status(404).json({ erro: 'Operação não encontrada.' });
    t.uso = repo.Uso.doTenant(t.id); t.custo = repo.Custo.doTenant(t.id); t.custo_total = repo.Custo.totalTenant(t.id);
    res.json({ tenant: t });
  }));
  app.post('/staff/api/vsm/tenants', ...A, h((req, res) => {
    const t = repo.Tenants.criar(req.body || {}, quem(req));
    aud(req, 'tenant.criar', 'tenants', t.id, t.nome);
    res.json({ ok: true, tenant: t });
  }));
  app.patch('/staff/api/vsm/tenants/:id', ...A, h((req, res) => {
    const t = repo.Tenants.atualizar(req.params.id, req.body || {}, quem(req));
    res.json({ ok: true, tenant: t });
  }));
  app.post('/staff/api/vsm/tenants/:id/status', ...A, h((req, res) => {
    const t = repo.Tenants.mudarStatus(req.params.id, (req.body || {}).status, quem(req), (req.body || {}).detalhe);
    res.json({ ok: true, tenant: t });
  }));
  app.post('/staff/api/vsm/tenants/:id/plano', ...A, h((req, res) => {
    const r = billing.trocarPlano(req.params.id, (req.body || {}).plano, quem(req));
    aud(req, 'tenant.plano', 'tenants', req.params.id, r.plano);
    res.json({ ok: true, ...r });
  }));
  app.post('/staff/api/vsm/tenants/:id/settings', ...A, h((req, res) => {
    repo.salvarSettings(req.params.id, req.body || {});
    aud(req, 'tenant.settings', 'tenant_settings', req.params.id, '');
    res.json({ ok: true, entitlements: repo.entitlements(req.params.id) });
  }));
  // marcar pago manualmente / registrar custo (útil sem MP configurado)
  app.post('/staff/api/vsm/tenants/:id/marcar-pago', ...A, h((req, res) => {
    billing.registrarPagamento(req.params.id);
    aud(req, 'billing.marcar-pago', 'tenants', req.params.id, '');
    res.json({ ok: true, tenant: repo.Tenants.obter(req.params.id) });
  }));
  app.post('/staff/api/vsm/tenants/:id/custo', ...A, h((req, res) => {
    const d = req.body || {};
    repo.Custo.registrar(req.params.id, d.categoria, d.custo_centavos, d.detalhe, d.periodo);
    res.json({ ok: true });
  }));
  // criar link de acesso p/ o admin da operação (definir senha)
  app.post('/staff/api/vsm/tenants/:id/link-acesso', ...A, h((req, res) => {
    const t = repo.Tenants.obter(req.params.id);
    if (!t || !t.usuarios.length) return res.status(404).json({ erro: 'Operação sem usuário.' });
    const admin = t.usuarios.find(u => u.papel === 'admin') || t.usuarios[0];
    const token = jwt.sign({ tipo: 'vsm-setup', uid: admin.id }, jwtSecret, { expiresIn: '7d' });
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const url = `${proto}://${req.get('host')}/gestao/definir-senha?token=${token}`;
    aud(req, 'tenant.link-acesso', 'tenant_users', admin.id, admin.email);
    res.json({ ok: true, url, email: admin.email, validade: '7 dias' });
  }));

  // ---- ACESSOS DE CORTESIA / BETA (teste sem pagamento; vitalício até o dono revogar) ----
  app.get('/staff/api/vsm/cortesia', ...A, h((req, res) => {
    res.json({ acessos: repo.Tenants.listar({ status: 'cortesia', limite: 500 }) });
  }));
  app.post('/staff/api/vsm/cortesia', ...A, h((req, res) => {
    const b = req.body || {};
    if (!b.email || !String(b.email).includes('@')) return res.status(400).json({ erro: 'Informe o e-mail do testador.' });
    const t = repo.Tenants.criar({
      nome: b.nome || b.email, email: b.email, nome_responsavel: b.nome_responsavel || b.nome,
      status_inicial: 'cortesia', seed_demo: b.seed_demo !== false, origem: 'cortesia', obs: b.obs || 'Acesso de cortesia (fase de testes).',
    }, quem(req));
    const admin = t.usuarios.find(u => u.papel === 'admin') || t.usuarios[0];
    const token = jwt.sign({ tipo: 'vsm-setup', uid: admin.id }, jwtSecret, { expiresIn: '30d' });
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const base = `${proto}://${req.get('host')}`;
    aud(req, 'cortesia.criar', 'tenants', t.id, `${t.nome} <${admin.email}>`);
    res.json({ ok: true, tenant: t, acesso: { email: admin.email, definir_senha_url: `${base}/gestao/definir-senha?token=${token}`, painel_url: `${base}/gestao/app`, validade_link: '30 dias' } });
  }));
  app.post('/staff/api/vsm/cortesia/:id/revogar', ...A, h((req, res) => {
    const t = repo.Tenants.mudarStatus(req.params.id, 'suspensa', quem(req), 'cortesia revogada');
    aud(req, 'cortesia.revogar', 'tenants', req.params.id, t.nome);
    res.json({ ok: true, tenant: t });
  }));
  app.post('/staff/api/vsm/cortesia/:id/reativar', ...A, h((req, res) => {
    const t = repo.Tenants.mudarStatus(req.params.id, 'cortesia', quem(req), 'cortesia reativada');
    aud(req, 'cortesia.reativar', 'tenants', req.params.id, t.nome);
    res.json({ ok: true, tenant: t });
  }));

  // ---- custo por cliente / margem ----
  app.get('/staff/api/vsm/custo-por-cliente', ...A, h((req, res) => res.json({ periodo: req.query.periodo || null, linhas: repo.Dashboard.custoPorCliente(req.query.periodo) })));

  // ---- tickets (suporte) ----
  app.get('/staff/api/vsm/tickets', ...A, h((req, res) => res.json({ tickets: repo.Tickets.listar(req.query) })));
  app.get('/staff/api/vsm/tickets/:id', ...A, h((req, res) => {
    const t = repo.Tickets.obter(req.params.id);
    if (!t) return res.status(404).json({ erro: 'Ticket não encontrado.' });
    res.json({ ticket: t });
  }));
  app.post('/staff/api/vsm/tickets/:id/responder', ...A, h((req, res) => {
    repo.Tickets.responder(req.params.id, { texto: (req.body || {}).texto, lado: 'plataforma', autor: quem(req) });
    res.json({ ok: true });
  }));
  app.post('/staff/api/vsm/tickets/:id/status', ...A, h((req, res) => {
    repo.Tickets.mudarStatus(req.params.id, (req.body || {}).status);
    res.json({ ok: true });
  }));

  // ---- feature flags (catálogo global) ----
  app.get('/staff/api/vsm/flags', ...A, h((req, res) => res.json({ flags: repo.Flags.listar() })));

  // ---- leads / logs / auditoria ----
  app.get('/staff/api/vsm/leads', ...A, h((req, res) => res.json({ leads: repo.Leads.listar(req.query.n) })));
  app.post('/staff/api/vsm/leads/:id/status', ...A, h((req, res) => { repo.Leads.status(req.params.id, (req.body || {}).status); res.json({ ok: true }); }));
  app.get('/staff/api/vsm/eventos', ...A, h((req, res) => res.json({ eventos: repo.Eventos.listar(req.query.n) })));
  app.get('/staff/api/vsm/auditoria', ...A, h((req, res) => res.json({ eventos: repo.Auditoria.listar(req.query.n) })));

  // disparo manual do ciclo de vida (dunning/trial) — normalmente roda pela rotina
  app.post('/staff/api/vsm/ciclo-diario', ...A, h((req, res) => {
    const r = billing.processarCicloDeVida();
    aud(req, 'ciclo.manual', 'tenants', '', JSON.stringify(r));
    res.json({ ok: true, ...r });
  }));
}

module.exports = { registrarRotasStaff };
