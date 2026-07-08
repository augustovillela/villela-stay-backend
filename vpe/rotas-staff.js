// =====================================================================
// Villela Projects & Events — administração da PLATAFORMA
// (/staff/api/vpe/*). Leitura: admin OU áreas ceo/ti; escrita: admin.
// Inclui o seed do workspace interno da Villela (16 projetos) — a senha
// inicial do dono só aparece na resposta (uma vez).
// =====================================================================
'use strict';
const repo = require('./repo');

function registrarRotasStaff(app, { express, requireAuth, requireAdmin }) {
  const r = express.Router();
  r.use(express.json({ limit: '1mb' }));
  r.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  r.use(requireAuth);
  r.use((req, res, next) => {
    const areas = (req.user && req.user.areas) || [];
    if (req.user.papel === 'admin' || areas.includes('*') || areas.includes('ceo') || areas.includes('ti')) return next();
    return res.status(403).json({ erro: 'sem acesso à área Villela Projects' });
  });
  const h = (fn) => (req, res) => { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); };
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  r.get('/resumo', h(async (req, res) => res.json(repo.resumoPlataforma())));
  r.get('/tenants', h(async (req, res) => res.json({ tenants: repo.listarTenantsPlataforma() })));
  r.get('/tenants/:id', h(async (req, res) => {
    const t = repo.obterTenant(req.params.id);
    if (!t) throw new Error('Empresa não encontrada.');
    res.json({ tenant: t, plano: repo.planoDoTenant(t.id), uso: repo.usoDoMes(t.id), usuarios: repo.listarUsuarios(t.id), projetos: repo.listarProjetos(t.id, {}).length, auditoria: repo.listarAuditoria(t.id, { limite: 30 }) });
  }));
  r.patch('/tenants/:id', requireAdmin, h(async (req, res) => {
    const b = req.body || {};
    res.json({ ok: true, tenant: repo.administrarTenant(req.params.id, { status: b.status, plano_slug: b.plano_slug, estender_trial_dias: b.estender_trial_dias }, req.user, ipDe(req)) });
  }));

  // Seed do workspace interno Villela (idempotente). A senha inicial só sai aqui.
  r.post('/semear-interno', requireAdmin, h(async (req, res) => {
    const b = req.body || {};
    const r2 = repo.semearInterno({ email: b.email, nome: b.nome, senha: b.senha }, req.user, ipDe(req));
    res.json({ ok: true, tenant: { id: r2.tenant.id, slug: r2.tenant.slug, nome: r2.tenant.nome }, projetos_criados: r2.criados, projetos_total: r2.total, senha_inicial: r2.senha_inicial });
  }));

  r.get('/planos', h(async (req, res) => res.json({ planos: repo.listarPlanos(false) })));
  r.patch('/planos/:id', requireAdmin, h(async (req, res) => {
    const p = repo.atualizarPlano(req.params.id, req.body || {});
    repo.auditar('', req.user, 'plataforma.plano.atualizar', 'plans', p.id, { nome: p.nome }, ipDe(req));
    res.json({ ok: true, plano: p });
  }));

  r.get('/leads', h(async (req, res) => res.json({ leads: repo.listarLeads() })));
  r.patch('/leads/:id', h(async (req, res) => { repo.atualizarLead(req.params.id, (req.body || {}).status); res.json({ ok: true }); }));
  r.get('/auditoria', h(async (req, res) => res.json({ eventos: repo.listarAuditoria('', { limite: req.query.limite || 200 }) })));

  app.use('/staff/api/vpe', r);
}

module.exports = { registrarRotasStaff };
