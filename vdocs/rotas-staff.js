// =====================================================================
// Villela Docs Intelligence — administração da PLATAFORMA (/staff/api/vdocs/*).
// Quem acessa: sessão do Portal Staff com papel admin OU área ceo/ti
// (leitura); ações de escrita (status de tenant, planos) = só admin.
// Ações da plataforma são auditadas com tenant_id = '' e espelhadas no
// audit do tenant afetado (transparência para o cliente).
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
    return res.status(403).json({ erro: 'sem acesso à área Villela Docs' });
  });
  const h = (fn) => (req, res) => { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); };
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  r.get('/resumo', h(async (req, res) => res.json(repo.resumoPlataforma())));
  r.get('/tenants', h(async (req, res) => res.json({ tenants: repo.listarTenantsPlataforma() })));
  r.get('/tenants/:id', h(async (req, res) => {
    const t = repo.obterTenant(req.params.id);
    if (!t) throw new Error('Empresa não encontrada.');
    res.json({ tenant: t, plano: repo.planoDoTenant(t.id), uso: repo.usoDoMes(t.id), usuarios: repo.listarUsuarios(t.id), auditoria: repo.listarAuditoria(t.id, { limite: 50 }) });
  }));
  r.patch('/tenants/:id', requireAdmin, h(async (req, res) => {
    const b = req.body || {};
    res.json({ ok: true, tenant: repo.administrarTenant(req.params.id, { status: b.status, plano_slug: b.plano_slug }, req.user, ipDe(req)) });
  }));

  r.get('/planos', h(async (req, res) => res.json({ planos: repo.listarPlanos(false) })));
  r.patch('/planos/:id', requireAdmin, h(async (req, res) => {
    const p = repo.atualizarPlano(req.params.id, req.body || {});
    repo.auditar('', req.user, 'plataforma.plano.atualizar', 'plans', p.id, { nome: p.nome }, ipDe(req));
    res.json({ ok: true, plano: p });
  }));

  r.get('/leads', h(async (req, res) => res.json({ leads: repo.listarLeads() })));
  r.patch('/leads/:id', h(async (req, res) => {
    repo.atualizarLead(req.params.id, (req.body || {}).status);
    res.json({ ok: true });
  }));

  // relatório SaaS: receita, assinaturas, trials expirando, custo de IA por tenant (Fase 8)
  r.get('/receita', h(async (req, res) => res.json(require('./billing').receitaPlataforma())));

  // auditoria da plataforma (tenant_id = '')
  r.get('/auditoria', h(async (req, res) => res.json({ eventos: repo.listarAuditoria('', { limite: req.query.limite || 200 }) })));

  app.use('/staff/api/vdocs', r);
}

module.exports = { registrarRotasStaff };
