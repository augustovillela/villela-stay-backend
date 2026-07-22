// =====================================================================
// Villela Docs Intelligence — administração da PLATAFORMA (/staff/api/vdocs/*).
// Quem acessa: sessão do Portal Staff com papel admin OU área ceo/ti
// (leitura); ações de escrita (status de tenant, planos) = só admin.
// Ações da plataforma são auditadas com tenant_id = '' e espelhadas no
// audit do tenant afetado (transparência para o cliente).
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');

function registrarRotasStaff(app, { express, requireAuth, requireAdmin, jwtSecret }) {
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
  // Domínio público do produto (NÃO o host interno do Render). Links de acesso saem sempre por aqui.
  const BASE = (process.env.VDOCS_BASE_URL || 'https://docs.villelastay.com.br').replace(/\/+$/, '');

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

  // saúde do sistema: jobs, webhooks, IA, volumes (Fase 10)
  r.get('/saude', h(async (req, res) => res.json(require('./enterprise').saudePlataforma())));

  // auditoria da plataforma (tenant_id = '')
  r.get('/auditoria', h(async (req, res) => res.json({ eventos: repo.listarAuditoria('', { limite: req.query.limite || 200 }) })));

  // ---- ACESSOS DE CORTESIA / BETA (teste sem pagamento; liberado até a plataforma revogar) ----
  // Contrato idêntico ao dos demais produtos (tela central de cortesia).
  r.get('/cortesia', h(async (req, res) => {
    res.json({ acessos: repo.listarTenantsPlataforma().filter(t => t.status === 'cortesia') });
  }));
  r.post('/cortesia', requireAdmin, h(async (req, res) => {
    const b = req.body || {};
    if (!b.email || !String(b.email).includes('@')) throw new Error('Informe o e-mail do testador.');
    const nome = repo.s(b.nome || b.email, 120);
    const criado = repo.criarTenantComDono({
      empresa: nome, nome, email: b.email, cortesia: true, seed_demo: b.seed_demo !== false, ip: ipDe(req),
    });
    // link mágico: o dono define a senha (30 dias) e cai direto no painel
    const token = jwt.sign({ tipo: 'vdocs-setup', uid: criado.user.id }, jwtSecret, { expiresIn: '30d' });
    repo.auditar('', req.user, 'plataforma.cortesia.criar', 'tenant', criado.tenant.id, { nome, email: criado.user.email }, ipDe(req));
    res.json({
      ok: true,
      tenant: criado.tenant,
      acesso: {
        email: criado.user.email,
        definir_senha_url: `${BASE}/vdocs/definir-senha?token=${token}`,
        painel_url: `${BASE}/vdocs/app`,
        validade_link: '30 dias',
      },
    });
  }));
  // regenera o link de acesso (novo token vdocs-setup 30d) para o dono do tenant de cortesia
  r.post('/cortesia/:id/link', requireAdmin, h(async (req, res) => {
    const t = repo.obterTenant(req.params.id);
    if (!t) return res.status(404).json({ erro: 'Acesso de cortesia não encontrado.' });
    const dono = repo.listarUsuarios(t.id).find(u => u.papel === 'dono') || repo.listarUsuarios(t.id)[0];
    if (!dono) return res.status(404).json({ erro: 'Dono do acesso não encontrado.' });
    const token = jwt.sign({ tipo: 'vdocs-setup', uid: dono.user_id }, jwtSecret, { expiresIn: '30d' });
    repo.auditar('', req.user, 'plataforma.cortesia.link', 'tenant', t.id, { email: dono.email }, ipDe(req));
    res.json({ ok: true, acesso: { email: dono.email, definir_senha_url: `${BASE}/vdocs/definir-senha?token=${token}`, painel_url: `${BASE}/vdocs/app`, validade_link: '30 dias' } });
  }));
  r.post('/cortesia/:id/revogar', requireAdmin, h(async (req, res) => {
    const t = repo.administrarTenant(req.params.id, { status: 'suspensa' }, req.user, ipDe(req));
    repo.auditar('', req.user, 'plataforma.cortesia.revogar', 'tenant', t.id, { nome: t.nome }, ipDe(req));
    res.json({ ok: true, tenant: t });
  }));
  r.post('/cortesia/:id/reativar', requireAdmin, h(async (req, res) => {
    const t = repo.administrarTenant(req.params.id, { status: 'cortesia' }, req.user, ipDe(req));
    repo.auditar('', req.user, 'plataforma.cortesia.reativar', 'tenant', t.id, { nome: t.nome }, ipDe(req));
    res.json({ ok: true, tenant: t });
  }));

  app.use('/staff/api/vdocs', r);
}

module.exports = { registrarRotasStaff };
