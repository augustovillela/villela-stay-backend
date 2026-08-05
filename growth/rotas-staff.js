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

  // ============================ ETAPA 2 ============================
  // Estas rotas operam DENTRO de uma conta. O administrador da plataforma
  // entra no contexto do tenant escolhido, e a entrada fica auditada — é o
  // mesmo caminho do operador de agência, não um atalho privilegiado.
  const naConta = (motivo, fn) => [requireAuth, requireAdmin, (req, res) => {
    const tid = req.params.tenant;
    if (!db.prepare('SELECT 1 FROM tenants WHERE id = ?').get(tid)) {
      return res.status(404).json({ erro: 'Conta não encontrada.' });
    }
    try {
      const saida = tenancy.comTenant(
        { tenantId: tid, userId: (req.user && req.user.id) || 'staff', correlationId: req.correlationId },
        () => {
          const r = fn(req, res);
          repo.auditar({ acao: 'plataforma.rota_conta', entidade: 'http', entidadeId: `${req.method} ${req.path}`, detalhe: motivo });
          return r;
        }
      );
      if (saida !== undefined && !res.headersSent) res.json(saida);
    } catch (e) {
      if (!res.headersSent) res.status(e.status || 500).json({ erro: e.message });
    }
  }];

  const captura = require('./captura');
  const segmentos = require('./segmentos');
  const identidade = require('./identidade');
  const lgpd = require('./lgpd');

  // ---- formulários e captura ----
  app.get('/staff/api/growth/contas/:tenant/formularios', ...naConta('listar formulários', () => captura.listar()));
  app.post('/staff/api/growth/contas/:tenant/formularios', ...naConta('criar formulário', (req) => captura.criar(req.body || {})));
  app.put('/staff/api/growth/contas/:tenant/formularios/:id', ...naConta('editar formulário', (req) => captura.atualizar(req.params.id, req.body || {})));
  app.post('/staff/api/growth/contas/:tenant/formularios/:id/publicar', ...naConta('publicar formulário', (req) => captura.publicar(req.params.id)));
  app.get('/staff/api/growth/contas/:tenant/formularios/:id/respostas', ...naConta('ver respostas', (req) => captura.respostas(req.params.id)));

  // ---- segmentos ----
  app.get('/staff/api/growth/contas/:tenant/segmentos', ...naConta('listar segmentos', () => segmentos.listar()));
  app.post('/staff/api/growth/contas/:tenant/segmentos', ...naConta('criar segmento', (req) => segmentos.criar(req.body || {})));
  app.get('/staff/api/growth/contas/:tenant/segmentos/:id/contatos', ...naConta('ver contatos do segmento',
    (req) => segmentos.contatos(req.params.id, { excluirSuprimidos: req.query.suprimidos !== 'incluir' })));

  // ---- duplicatas (resolução de identidade) ----
  app.get('/staff/api/growth/contas/:tenant/duplicatas', ...naConta('ver duplicatas prováveis', () => identidade.sugestoesPendentes()));
  app.post('/staff/api/growth/contas/:tenant/duplicatas/:id', ...naConta('decidir duplicata',
    (req) => identidade.decidirSugestao(req.params.id, {
      decisao: (req.body || {}).decisao, quem: (req.user && req.user.id) || 'staff', motivo: (req.body || {}).motivo || '',
    })));
  app.get('/staff/api/growth/contas/:tenant/contatos/:id/identidades', ...naConta('ver identidades do contato',
    (req) => ({ identidades: identidade.identidadesDo(req.params.id), atribuicao: captura.atribuicao(req.params.id) })));

  // ---- LGPD ----
  app.get('/staff/api/growth/contas/:tenant/lgpd', ...naConta('painel LGPD', () => ({
    config: lgpd.config(),
    solicitacoes: lgpd.solicitacoesAbertas(),
    vencidas: lgpd.vencidas(),
    supressoes: lgpd.suprimidos(100),
    inventario: lgpd.inventario(),
  })));
  app.post('/staff/api/growth/contas/:tenant/lgpd/solicitacoes', ...naConta('abrir solicitação de titular',
    (req) => lgpd.abrirSolicitacao(req.body || {})));
  app.post('/staff/api/growth/contas/:tenant/lgpd/solicitacoes/:id/atender', ...naConta('atender solicitação',
    (req) => lgpd.atenderSolicitacao(req.params.id, req.body || {})));
  app.get('/staff/api/growth/contas/:tenant/lgpd/titular/:contato', ...naConta('exportar dados do titular',
    (req) => lgpd.exportarTitular(req.params.contato)));
  app.post('/staff/api/growth/contas/:tenant/lgpd/titular/:contato/anonimizar', ...naConta('anonimizar titular',
    (req) => lgpd.anonimizar(req.params.contato, { motivo: (req.body || {}).motivo || '' })));
  app.post('/staff/api/growth/contas/:tenant/lgpd/supressao', ...naConta('suprimir contato',
    (req) => lgpd.suprimir(req.body || {})));

  // --------------------------------------------------------- auditoria
  app.get('/staff/api/growth/auditoria', admin, rota('trilha de auditoria', (req) =>
    repo.auditoria.listar(Number(req.query.n) || 200)));
}

module.exports = { registrarRotasStaff };
