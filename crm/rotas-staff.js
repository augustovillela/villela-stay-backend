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
const { DATA_DIR, db } = require('./db');

function registrarRotasStaff(app, { requireAuth, requireAdmin, jwtSecret }) {
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const quem = (req) => (req.user && (req.user.nome || req.user.email)) || 'plataforma';
  const A = [requireAuth, requireAdmin];
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));
  const aud = (req, acao, ent, id, det) => repo.Auditoria.registrar({ quem: quem(req), acao, entidade: ent, entidade_id: id, detalhe: det, ip: ipDe(req) });

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
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const url = `${proto}://${req.get('host')}/crm/definir-senha?token=${token}`;
    aud(req, 'tenant.link-acesso', 'tenant_users', owner.id, owner.email);
    res.json({ ok: true, url, email: owner.email, validade: '7 dias' });
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
  // Dedupe por telefone/e-mail; estágios legados viram oportunidade no funil 'hospedagem'.
  app.post('/staff/api/vcrm/importar-legado', ...A, h((req, res) => {
    const tenantSlug = (req.body || {}).tenant_slug || 'villela-stay';
    const t = repo.Tenants.porSlug(tenantSlug);
    if (!t) return res.status(404).json({ erro: `Tenant "${tenantSlug}" não existe — crie-o primeiro.` });
    const arq = path.join(DATA_DIR, 'contatos.json');
    if (!fs.existsSync(arq)) return res.status(404).json({ erro: 'contatos.json não encontrado em DATA_DIR.' });
    let legado = [];
    try { legado = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { return res.status(400).json({ erro: 'contatos.json inválido: ' + e.message }); }
    const mapaOrigem = { 'whatsapp-business': 'whatsapp', 'whatsapp-pessoal': 'whatsapp', manual: 'importacao' };
    const funil = appRepo.Funis.listar(t.id).find(f => f.slug === 'hospedagem') || appRepo.Funis.padrao(t.id);
    const estagiosAbertos = funil.estagios.filter(e => e.tipo === 'aberto');
    const mapaEstagio = { novo: 0, contato: 1, orcamento: 3, negociacao: 4, reserva: 5 };
    let criados = 0, existentes = 0, oportunidades = 0;
    for (const l of legado) {
      const r = appRepo.Contatos.criar(t.id, {
        nome: l.nome, telefone: l.telefone, email: l.email,
        tipo: ['hospedado', 'posvenda'].includes(l.estagio) ? 'hospede' : 'lead-hospedagem',
        origem: mapaOrigem[l.origem] || (appRepo.ORIGENS.includes(l.origem) ? l.origem : 'outro'),
        produto_interesse: l.imovelInteresse, ticket_centavos: Math.round((Number(l.valorEstimado) || 0) * 100),
        obs: l.preferencias || '', proxima_acao: (l.proximaAcao || {}).descricao || '', proxima_acao_em: (l.proximaAcao || {}).data || '',
        motivo_perda: l.motivoPerda || '', consentimento: l.consentimento || {},
      }, 'importacao-legado');
      if (r.existente) existentes++; else criados++;
      // estágio aberto do legado vira oportunidade no funil de hospedagem
      if (mapaEstagio[l.estagio] != null && !r.existente) {
        const idx = Math.min(mapaEstagio[l.estagio], estagiosAbertos.length - 1);
        appRepo.Oportunidades.criar(t.id, {
          contato_id: r.contato.id, funil_id: funil.id, estagio_id: estagiosAbertos[idx].id,
          titulo: `Hospedagem — ${l.nome || l.telefone || 'lead'}`,
          produto: l.imovelInteresse || '', valor_centavos: Math.round((Number(l.valorEstimado) || 0) * 100),
          previsao: ((l.periodo || {}).checkin) || '',
        }, 'importacao-legado');
        oportunidades++;
      }
    }
    aud(req, 'importar-legado', 'crm_contatos', t.id, `${criados} criados, ${existentes} já existiam`);
    res.json({ ok: true, tenant: t.slug, criados, existentes, oportunidades, total_legado: legado.length });
  }));

  // consulta rápida a um tenant pelo slug (para o painel staff)
  app.get('/staff/api/vcrm/tenants-por-slug/:slug', ...A, h((req, res) => {
    const t = repo.Tenants.porSlug(req.params.slug);
    if (!t) return res.status(404).json({ erro: 'Não encontrado.' });
    res.json({ tenant: t });
  }));
}

module.exports = { registrarRotasStaff };
