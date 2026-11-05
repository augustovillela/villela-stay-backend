// =====================================================================
// Villela CRM — API de ADMINISTRAÇÃO DA PLATAFORMA (Portal Staff).
// Prefixo /staff/api/vcrm/* (vcrm para não colidir com o CRM legado do
// staff em /staff/api/crm/*). requireAuth + requireAdmin. Tudo auditado.
// Inclui a importação do CRM legado (contatos.json → tenant interno).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const appRepo = require('./app-repo');
const billing = require('./billing');
const importarLegado = require('./importar-legado');
const { DATA_DIR, db } = require('./db');

function registrarRotasStaff(app, { requireAuth, requireAdmin, jwtSecret }) {
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const quem = (req) => (req.user && (req.user.nome || req.user.email)) || 'plataforma';
  const A = [requireAuth, requireAdmin];
  const h = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));
  const aud = (req, acao, ent, id, det) => repo.Auditoria.registrar({ quem: quem(req), acao, entidade: ent, entidade_id: id, detalhe: det, ip: ipDe(req) });
  // Domínio público do produto (NÃO o host interno do Render). Links de acesso saem sempre por aqui.
  const BASE = (process.env.CRM_BASE_URL || 'https://crm.villelastay.com.br').replace(/\/+$/, '');

  app.use('/staff/api/vcrm', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // painel da plataforma
  app.get('/staff/api/vcrm/dashboard', ...A, h((req, res) => {
    res.json({ resumo: repo.Dashboard.plataforma(), catalogo: { modulos: repo.MODULOS, limites: repo.LIMITES, flags: repo.Flags.listar(), papeis: repo.PAPEIS } });
  }));

  // ---- planos ----
  app.get('/staff/api/vcrm/planos', ...A, h((req, res) => res.json({ planos: repo.Planos.listar({ incluirInativos: true }), modulos: repo.MODULOS, limites: repo.LIMITES })));
  app.patch('/staff/api/vcrm/planos/:id', ...A, h((req, res) => {
    const p = repo.Planos.atualizar(req.params.id, req.body || {});
    aud(req, 'plano.editar', 'plans', p.id, p.slug);
    res.json({ ok: true, plano: p });
  }));

  // ---- tenants (empresas assinantes) ----
  app.get('/staff/api/vcrm/tenants', ...A, h((req, res) => res.json({ tenants: repo.Tenants.listar(req.query) })));
  app.get('/staff/api/vcrm/tenants/:id', ...A, h((req, res) => {
    const t = repo.Tenants.obter(req.params.id);
    if (!t) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    t.uso = repo.Uso.doTenant(t.id);
    res.json({ tenant: t });
  }));
  app.post('/staff/api/vcrm/tenants', ...A, h((req, res) => {
    const t = repo.Tenants.criar(req.body || {}, quem(req));
    aud(req, 'tenant.criar', 'tenants', t.id, t.nome);
    res.json({ ok: true, tenant: t });
  }));
  app.patch('/staff/api/vcrm/tenants/:id', ...A, h((req, res) => res.json({ ok: true, tenant: repo.Tenants.atualizar(req.params.id, req.body || {}, quem(req)) })));
  app.post('/staff/api/vcrm/tenants/:id/status', ...A, h((req, res) => {
    res.json({ ok: true, tenant: repo.Tenants.mudarStatus(req.params.id, (req.body || {}).status, quem(req), (req.body || {}).detalhe) });
  }));
  app.post('/staff/api/vcrm/tenants/:id/plano', ...A, h((req, res) => {
    const r = billing.trocarPlano(req.params.id, (req.body || {}).plano, quem(req));
    aud(req, 'tenant.plano', 'tenants', req.params.id, r.plano);
    res.json({ ok: true, ...r });
  }));
  app.post('/staff/api/vcrm/tenants/:id/settings', ...A, h((req, res) => {
    repo.salvarSettings(req.params.id, req.body || {});
    aud(req, 'tenant.settings', 'tenant_settings', req.params.id, '');
    res.json({ ok: true, entitlements: repo.entitlements(req.params.id) });
  }));
  app.post('/staff/api/vcrm/tenants/:id/marcar-pago', ...A, h((req, res) => {
    billing.registrarPagamento(req.params.id);
    aud(req, 'billing.marcar-pago', 'tenants', req.params.id, '');
    res.json({ ok: true, tenant: repo.Tenants.obter(req.params.id) });
  }));
  // link p/ o owner da empresa definir a senha
  app.post('/staff/api/vcrm/tenants/:id/link-acesso', ...A, h((req, res) => {
    const t = repo.Tenants.obter(req.params.id);
    if (!t || !t.usuarios.length) return res.status(404).json({ erro: 'Empresa sem usuário.' });
    const owner = t.usuarios.find(u => u.papel === 'owner') || t.usuarios[0];
    const token = jwt.sign({ tipo: 'crm-setup', uid: owner.id }, jwtSecret, { expiresIn: '7d' });
    const url = `${BASE}/crm/definir-senha?token=${token}`;
    aud(req, 'tenant.link-acesso', 'tenant_users', owner.id, owner.email);
    res.json({ ok: true, url, email: owner.email, validade: '7 dias' });
  }));

  // ---- ACESSOS DE CORTESIA / BETA (teste sem pagamento; vitalício até o dono revogar) ----
  app.get('/staff/api/vcrm/cortesia', ...A, h((req, res) => {
    res.json({ acessos: repo.Tenants.listar({ cortesia: true, limite: 500 }) });
  }));
  app.post('/staff/api/vcrm/cortesia', ...A, h((req, res) => {
    const b = req.body || {};
    if (!b.email || !String(b.email).includes('@')) return res.status(400).json({ erro: 'Informe o e-mail do testador.' });
    const t = repo.Tenants.criar({
      nome: b.nome || b.email, email: b.email, nome_responsavel: b.nome_responsavel || b.nome,
      status_inicial: 'cortesia', seed_demo: b.seed_demo !== false, origem: 'cortesia', obs: b.obs || 'Acesso de cortesia (fase de testes).',
    }, quem(req));
    const owner = t.usuarios.find(u => u.papel === 'owner') || t.usuarios[0];
    const token = jwt.sign({ tipo: 'crm-setup', uid: owner.id }, jwtSecret, { expiresIn: '30d' });
    aud(req, 'cortesia.criar', 'tenants', t.id, `${t.nome} <${owner.email}>`);
    res.json({ ok: true, tenant: t, acesso: { email: owner.email, definir_senha_url: `${BASE}/crm/definir-senha?token=${token}`, painel_url: `${BASE}/crm/app`, validade_link: '30 dias' } });
  }));
  // regenera o link de acesso (novo token setup 30d) para o dono do tenant de cortesia
  app.post('/staff/api/vcrm/cortesia/:id/link', ...A, h((req, res) => {
    const t = repo.Tenants.obter(req.params.id);
    if (!t || !t.usuarios || !t.usuarios.length) return res.status(404).json({ erro: 'Acesso de cortesia não encontrado.' });
    const owner = t.usuarios.find(u => u.papel === 'owner') || t.usuarios[0];
    const token = jwt.sign({ tipo: 'crm-setup', uid: owner.id }, jwtSecret, { expiresIn: '30d' });
    aud(req, 'cortesia.link', 'tenants', t.id, owner.email);
    res.json({ ok: true, acesso: { email: owner.email, definir_senha_url: `${BASE}/crm/definir-senha?token=${token}`, painel_url: `${BASE}/crm/app`, validade_link: '30 dias' } });
  }));
  app.post('/staff/api/vcrm/cortesia/:id/revogar', ...A, h((req, res) => {
    const t = repo.Tenants.mudarStatus(req.params.id, 'suspensa', quem(req), 'cortesia revogada');
    aud(req, 'cortesia.revogar', 'tenants', req.params.id, t.nome);
    res.json({ ok: true, tenant: t });
  }));
  app.post('/staff/api/vcrm/cortesia/:id/reativar', ...A, h((req, res) => {
    const t = repo.Tenants.mudarStatus(req.params.id, 'cortesia', quem(req), 'cortesia reativada');
    aud(req, 'cortesia.reativar', 'tenants', req.params.id, t.nome);
    res.json({ ok: true, tenant: t });
  }));

  // ---- tickets / flags / leads / logs ----
  app.get('/staff/api/vcrm/tickets', ...A, h((req, res) => res.json({ tickets: repo.Tickets.listar(req.query) })));
  app.get('/staff/api/vcrm/tickets/:id', ...A, h((req, res) => {
    const t = repo.Tickets.obter(req.params.id);
    if (!t) return res.status(404).json({ erro: 'Ticket não encontrado.' });
    res.json({ ticket: t });
  }));
  app.post('/staff/api/vcrm/tickets/:id/responder', ...A, h((req, res) => {
    repo.Tickets.responder(req.params.id, { texto: (req.body || {}).texto, lado: 'plataforma', autor: quem(req) });
    res.json({ ok: true });
  }));
  app.post('/staff/api/vcrm/tickets/:id/status', ...A, h((req, res) => { repo.Tickets.mudarStatus(req.params.id, (req.body || {}).status); res.json({ ok: true }); }));
  app.get('/staff/api/vcrm/flags', ...A, h((req, res) => res.json({ flags: repo.Flags.listar() })));
  app.get('/staff/api/vcrm/leads', ...A, h((req, res) => res.json({ leads: repo.SaasLeads.listar(req.query.n) })));
  app.post('/staff/api/vcrm/leads/:id/status', ...A, h((req, res) => { repo.SaasLeads.status(req.params.id, (req.body || {}).status); res.json({ ok: true }); }));
  app.get('/staff/api/vcrm/eventos', ...A, h((req, res) => res.json({ eventos: repo.Eventos.listar(req.query.n) })));
  app.get('/staff/api/vcrm/auditoria', ...A, h((req, res) => res.json({ eventos: repo.Auditoria.listar(req.query.n) })));

  // ciclo de vida manual (normalmente roda pela rotina interna)
  app.post('/staff/api/vcrm/ciclo-diario', ...A, h((req, res) => {
    const r = billing.processarCicloDeVida();
    aud(req, 'ciclo.manual', 'tenants', '', JSON.stringify(r));
    res.json({ ok: true, ...r });
  }));

  // ---- IMPORTAÇÃO DO CRM LEGADO (contatos.json + atividades.jsonl do staff → tenant) ----
  // Completa e idempotente (ver crm/importar-legado.js). `simular: true` faz tudo e desfaz:
  // devolve os números exatos de uma importação real, sem gravar nada.
  app.post('/staff/api/vcrm/importar-legado', ...A, h((req, res) => {
    const tenantSlug = (req.body || {}).tenant_slug || 'villela-stay';
    const t = repo.Tenants.porSlug(tenantSlug);
    if (!t) return res.status(404).json({ erro: `Tenant "${tenantSlug}" não existe — crie-o primeiro.` });
    const simular = (req.body || {}).simular === true;
    let r;
    try { r = importarLegado.importar(t, { simular }); } catch (e) { return res.status(400).json({ erro: e.message }); }
    aud(req, simular ? 'importar-legado.simular' : 'importar-legado', 'crm_contatos', t.id,
      `${r.criados} criados, ${r.existentes} já existiam, ${r.oportunidades + r.perdidas} oportunidades, ${r.atividades} atividades, ${r.tarefas} tarefas`);
    res.json({ ok: true, tenant: t.slug, ...r });
  }));

  // consulta rápida a um tenant pelo slug (para o painel staff)
  app.get('/staff/api/vcrm/tenants-por-slug/:slug', ...A, h((req, res) => {
    const t = repo.Tenants.porSlug(req.params.slug);
    if (!t) return res.status(404).json({ erro: 'Não encontrado.' });
    res.json({ tenant: t });
  }));
}

module.exports = { registrarRotasStaff };
