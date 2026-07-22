// =====================================================================
// Villela Projects & Events — administração da PLATAFORMA
// (/staff/api/vpe/*). Leitura: admin OU áreas ceo/ti; escrita: admin.
// Inclui o seed do workspace interno da Villela (16 projetos) — a senha
// inicial do dono só aparece na resposta (uma vez).
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
    return res.status(403).json({ erro: 'sem acesso à área Villela Projects' });
  });
  const h = (fn) => (req, res) => { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); };
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  // Domínio público do produto (NÃO o host interno do Render). Links de acesso saem sempre por aqui.
  const BASE = (process.env.VPE_BASE_URL || 'https://projetos.villelastay.com.br').replace(/\/+$/, '');

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

  // Gera um link mágico para o DONO do workspace interno definir uma senha nova e
  // entrar (a senha inicial do seed só aparece uma vez). Mesmo fluxo da cortesia.
  r.post('/interno/link-acesso', requireAdmin, h(async (req, res) => {
    const t = (repo.listarTenantsPlataforma() || []).find(x => x.slug === 'villela-interno');
    if (!t) return res.status(404).json({ erro: 'Workspace interno ainda não foi semeado — clique em "Semear" primeiro.' });
    const dono = repo.listarUsuarios(t.id).find(u => u.papel === 'dono') || repo.listarUsuarios(t.id)[0];
    if (!dono) return res.status(404).json({ erro: 'Dono do workspace interno não encontrado.' });
    const token = jwt.sign({ tipo: 'vpe-setup', uid: dono.user_id, tid: t.id }, jwtSecret, { expiresIn: '30d' });
    repo.auditar(t.id, req.user, 'interno.link-acesso', 'tenant', t.id, { email: dono.email }, ipDe(req));
    res.json({ ok: true, acesso: { email: dono.email, definir_senha_url: `${BASE}/vpe/definir-senha?token=${token}`, painel_url: `${BASE}/vpe/app`, validade_link: '30 dias' } });
  }));

  // ---- ACESSOS DE CORTESIA / BETA (teste sem pagamento; vitalício até revogar) ----
  // Contrato idêntico em todos os produtos (tela central). Guarda: requireAuth (já
  // aplicado no router) + requireAdmin. NÃO lista o workspace interno REAL da Villela.
  r.get('/cortesia', requireAdmin, h(async (req, res) => res.json({ acessos: repo.listarCortesias() })));
  r.post('/cortesia', requireAdmin, h(async (req, res) => {
    const b = req.body || {};
    const out = repo.criarCortesia({ nome: b.nome, email: b.email, seed_demo: b.seed_demo }, req.user, ipDe(req));
    // link mágico de definir senha (mesmo padrão do CRM): token vpe-setup 30 dias.
    const token = jwt.sign({ tipo: 'vpe-setup', uid: out.user.id, tid: out.tenant.id }, jwtSecret, { expiresIn: '30d' });
    res.json({
      ok: true,
      tenant: { id: out.tenant.id, slug: out.tenant.slug, nome: out.tenant.nome, status: out.tenant.status },
      acesso: {
        email: out.user.email,
        definir_senha_url: `${BASE}/vpe/definir-senha?token=${token}`,
        painel_url: `${BASE}/vpe/app`,
        validade_link: '30 dias',
      },
      seed: out.seed,
    });
  }));
  // regenera o link de acesso (novo token vpe-setup 30d) para o dono do tenant de cortesia
  r.post('/cortesia/:id/link', requireAdmin, h(async (req, res) => {
    const t = repo.obterTenant(req.params.id);
    if (!t || !t.cortesia) return res.status(404).json({ erro: 'Acesso de cortesia não encontrado.' });
    const dono = repo.listarUsuarios(t.id).find(u => u.papel === 'dono') || repo.listarUsuarios(t.id)[0];
    if (!dono) return res.status(404).json({ erro: 'Dono do acesso não encontrado.' });
    const token = jwt.sign({ tipo: 'vpe-setup', uid: dono.user_id, tid: t.id }, jwtSecret, { expiresIn: '30d' });
    repo.auditar(t.id, req.user, 'cortesia.link', 'tenant', t.id, { email: dono.email }, ipDe(req));
    res.json({ ok: true, acesso: { email: dono.email, definir_senha_url: `${BASE}/vpe/definir-senha?token=${token}`, painel_url: `${BASE}/vpe/app`, validade_link: '30 dias' } });
  }));
  r.post('/cortesia/:id/revogar', requireAdmin, h(async (req, res) => res.json({ ok: true, tenant: repo.revogarCortesia(req.params.id, req.user, ipDe(req)) })));
  r.post('/cortesia/:id/reativar', requireAdmin, h(async (req, res) => res.json({ ok: true, tenant: repo.reativarCortesia(req.params.id, req.user, ipDe(req)) })));

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
