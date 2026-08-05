// =====================================================================
// Villela Growth OS — API de administração da PLATAFORMA.
//
// Vive sob /staff/api/growth/* e usa o login do Portal Staff. Toda rota
// roda dentro de tenancy.comoPlataforma() com motivo — logo, toda leitura
// cruzada entre contas fica auditada.
//
// O painel do ASSINANTE não está aqui: ele vem na etapa em que houver
// tela para mostrar (ver docs/growth-os/ROADMAP.md).
// =====================================================================
'use strict';
const tenancy = require('./tenancy');
const repo = require('./repo');
const contas = require('./contas');
const rbac = require('./rbac');
const fila = require('./fila');
const eventos = require('./eventos');
const incidentes = require('./incidentes');
const conectores = require('./conectores');
const aprovacoes = require('./aprovacoes');
const entitlements = require('./entitlements');
const segredos = require('./segredos');
const { db } = require('./db');

function registrarRotasStaff(app, { requireAuth, requireAdmin }) {
  // Envelopa o handler no escopo de plataforma, AUDITA e padroniza o erro.
  // A auditoria é da rota inteira, não só das consultas: toda administração
  // de plataforma atravessa contas, e atravessar conta deixa rastro.
  const rota = (motivo, fn) => (req, res) => {
    try {
      const saida = tenancy.comoPlataforma(
        { userId: (req.user && req.user.id) || 'staff', motivo, correlationId: req.correlationId },
        () => {
          const r = fn(req, res);
          repo.auditar({
            acao: 'plataforma.rota', entidade: 'http',
            entidadeId: `${req.method} ${req.path}`, detalhe: motivo,
            ip: req.ip || '', tenantId: '',
          });
          return r;
        }
      );
      if (saida !== undefined && !res.headersSent) res.json(saida);
    } catch (e) {
      if (!res.headersSent) res.status(e.status || 500).json({ erro: e.message });
    }
  };

  const admin = [requireAuth, requireAdmin];

  // ---------------------------------------------------------- panorama
  app.get('/staff/api/growth/panorama', admin, rota('panorama da plataforma', () => ({
    fila: fila.estatisticas(),
    integracoes: conectores.panorama(),
    incidentes: incidentes.abertos(50),
    orgs: db.prepare('SELECT COUNT(*) AS n FROM gx_orgs').get().n,
    contas: db.prepare('SELECT COUNT(*) AS n FROM tenants').get().n,
    usuarios: db.prepare('SELECT COUNT(*) AS n FROM gx_users').get().n,
    perfis: db.prepare("SELECT COUNT(*) AS n FROM gx_roles WHERE tenant_id = ''").get().n,
    cofre_configurado: segredos.configurado(),
  })));

  // ----------------------------------------------------- organizações
  app.get('/staff/api/growth/orgs', admin, rota('listar organizações', () =>
    db.prepare('SELECT * FROM gx_orgs ORDER BY tipo, nome').all().map(o =>
      Object.assign({}, o, { contas: contas.contasDaOrg(o.id).length }))
  ));

  app.post('/staff/api/growth/orgs', admin, rota('criar organização', (req) => {
    const { tipo, nome, slug, parentId, contatoEmail } = req.body || {};
    return contas.criarOrg({ tipo, nome, slug, parentId, contatoEmail });
  }));

  app.post('/staff/api/growth/orgs/:id/contas', admin, rota('vincular conta a organização', (req) => {
    const { tenantId } = req.body || {};
    if (!tenantId) { const e = new Error('Informe tenantId.'); e.status = 400; throw e; }
    return contas.vincularConta(req.params.id, tenantId);
  }));

  // ------------------------------------------------------------ contas
  app.get('/staff/api/growth/contas', admin, rota('listar contas', () =>
    db.prepare('SELECT id, slug, nome, status, plan_id, criado_em FROM tenants ORDER BY nome').all().map(t => {
      const org = contas.orgDoTenant(t.id);
      return Object.assign({}, t, {
        org: org ? { id: org.id, nome: org.nome, tipo: org.tipo } : null,
        entitlements: entitlements.resolver(t.id),
      });
    })
  ));

  // ---------------------------------------------------------- usuários
  app.get('/staff/api/growth/usuarios', admin, rota('listar usuários', () =>
    db.prepare('SELECT id, nome, email, status, ultimo_login, criado_em FROM gx_users ORDER BY nome').all().map(u =>
      Object.assign({}, u, { acessos: contas.membershipsDoUsuario(u.id).length }))
  ));

  app.post('/staff/api/growth/usuarios', admin, rota('criar usuário', (req) => {
    const { nome, email, senha, escopoTipo, escopoId, perfil } = req.body || {};
    const u = contas.criarUsuario({ nome, email, senha });
    if (escopoTipo) contas.conceder({ userId: u.id, escopoTipo, escopoId, roleSlug: perfil || rbac.PERFIL_PADRAO });
    return { usuario: { id: u.id, nome: u.nome, email: u.email }, acessos: contas.membershipsDoUsuario(u.id) };
  }));

  app.post('/staff/api/growth/usuarios/:id/acessos', admin, rota('conceder acesso', (req) => {
    const { escopoTipo, escopoId, perfil, escopos } = req.body || {};
    return contas.conceder({ userId: req.params.id, escopoTipo, escopoId, roleSlug: perfil, escopos: escopos || {} });
  }));

  app.delete('/staff/api/growth/acessos/:id', admin, rota('revogar acesso', (req) =>
    ({ revogado: contas.revogar(req.params.id) })));

  // ------------------------------------------------------------ perfis
  app.get('/staff/api/growth/perfis', admin, rota('listar perfis', () => ({
    permissoes: rbac.PERMISSOES,
    perfis: db.prepare("SELECT * FROM gx_roles WHERE tenant_id = '' ORDER BY nivel, nome").all(),
  })));

  // --------------------------------------------------- fila e eventos
  app.get('/staff/api/growth/fila', admin, rota('painel da fila', (req) => ({
    estatisticas: fila.estatisticas(),
    dlq: db.prepare("SELECT * FROM gx_jobs WHERE status = 'dlq' ORDER BY concluido_em DESC LIMIT 100").all(),
    eventos_falha: db.prepare("SELECT * FROM gx_eventos WHERE status = 'falha' ORDER BY quando DESC LIMIT 100").all(),
    travados_recuperados: req.query.recuperar === '1' ? fila.recuperarTravados() : undefined,
  })));

  app.post('/staff/api/growth/jobs/:id/reenfileirar', admin, rota('reenfileirar job', (req) =>
    fila.reenfileirar(req.params.id, { motivo: (req.body && req.body.motivo) || 'reprocesso manual' })));

  app.post('/staff/api/growth/eventos/:id/replay', admin, rota('replay de evento', (req) =>
    eventos.reprocessar(req.params.id, { motivo: (req.body && req.body.motivo) || 'replay manual' })));

  app.post('/staff/api/growth/worker/rodar', admin, rota('rodar worker manualmente', () => ({
    eventos: eventos.processarPendentes(100),
    jobs: fila.processarLote(50),
  })));

  // ------------------------------------------------------- integrações
  app.get('/staff/api/growth/integracoes', admin, rota('catálogo de integrações', () => conectores.panorama()));

  // -------------------------------------------------------- incidentes
  app.get('/staff/api/growth/incidentes', admin, rota('incidentes abertos', () => incidentes.abertos(200)));
  app.post('/staff/api/growth/incidentes/:id/fechar', admin, rota('fechar incidente', (req) =>
    incidentes.fechar(req.params.id, { obs: (req.body && req.body.obs) || '' })));

  // ------------------------------------------------------- aprovações
  app.get('/staff/api/growth/aprovacoes', admin, rota('aprovações pendentes', () =>
    db.prepare("SELECT * FROM gx_aprovacoes WHERE status = 'pendente' ORDER BY criado_em ASC LIMIT 200").all()));

  // ----------------------------------------------- ponte com o legado
  app.post('/staff/api/growth/sincronizar-legado', admin, rota('sincronizar usuários do Villela CRM', () =>
    contas.sincronizarUsuariosLegados()));

  // --------------------------------------------------------- auditoria
  app.get('/staff/api/growth/auditoria', admin, rota('trilha de auditoria', (req) =>
    repo.auditoria.listar(Number(req.query.n) || 200)));
}

module.exports = { registrarRotasStaff };
