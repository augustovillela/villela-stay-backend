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

  // ==================== ETAPA 3 — INBOX E CANAIS ====================
  const conversas = require('./conversas');
  const canais = require('./canais');

  app.get('/staff/api/growth/contas/:tenant/inbox', ...naConta('caixa de entrada', (req) => ({
    conversas: conversas.caixa({
      status: req.query.status || 'aberta', canal: req.query.canal || '',
      responsavel: req.query.responsavel || '', filaId: req.query.fila || '', busca: req.query.busca || '',
    }),
    filas: conversas.filas(),
    sla_em_risco: conversas.slaEmRisco(),
  })));

  app.get('/staff/api/growth/contas/:tenant/inbox/:id', ...naConta('abrir conversa',
    (req, res) => {
      const c = conversas.conversa(req.params.id);
      if (!c) { res.status(404).json({ erro: 'Conversa não encontrada.' }); return undefined; }
      return c;
    }));

  app.post('/staff/api/growth/contas/:tenant/inbox/:id/responder', ...naConta('responder conversa',
    (req) => conversas.responder(req.params.id, Object.assign({}, req.body || {}, {
      autorId: (req.user && req.user.id) || 'staff',
    }))));

  app.post('/staff/api/growth/contas/:tenant/inbox/:id/atribuir', ...naConta('atribuir conversa',
    (req) => conversas.atribuir(req.params.id, req.body || {})));

  app.post('/staff/api/growth/contas/:tenant/inbox/:id/digitando', ...naConta('assumir digitação',
    (req) => conversas.assumirDigitacao(req.params.id, (req.user && req.user.id) || 'staff')));

  app.post('/staff/api/growth/contas/:tenant/inbox/:id/encerrar', ...naConta('encerrar conversa',
    (req) => conversas.encerrar(req.params.id, req.body || {})));

  app.get('/staff/api/growth/contas/:tenant/filas', ...naConta('listar filas', () => conversas.filas()));
  app.post('/staff/api/growth/contas/:tenant/filas', ...naConta('criar fila', (req) => conversas.criarFila(req.body || {})));

  app.get('/staff/api/growth/contas/:tenant/respostas-salvas', ...naConta('respostas salvas', () => conversas.respostasSalvas()));
  app.post('/staff/api/growth/contas/:tenant/respostas-salvas', ...naConta('salvar resposta', (req) => conversas.salvarResposta(req.body || {})));

  // ---- conexões de canal ----
  // A tela lê `capacidades` daqui antes de mostrar qualquer botão: o que a
  // conta não pode fazer não aparece (§13.2 do prompt).
  app.get('/staff/api/growth/contas/:tenant/canais', ...naConta('canais da conta', () => ({
    conexoes: canais.conexoes(),
    disponiveis: conectores.panorama().filter((i) => i.categoria === 'messaging' || i.categoria === 'email'),
    capacidades: ['chat_site', 'whatsapp_cloud', 'email'].reduce((acc, k) => {
      acc[k] = canais.capacidades(k); return acc;
    }, {}),
  })));

  app.post('/staff/api/growth/contas/:tenant/canais', ...naConta('conectar canal', async (req, res) => {
    try { res.json(await canais.conectar(req.body || {})); }
    catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
    return undefined;
  }));

  app.post('/staff/api/growth/contas/:tenant/canais/saude', ...naConta('verificar saúde dos canais', async (req, res) => {
    try { res.json(await canais.verificarSaude()); }
    catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
    return undefined;
  }));

  // ================== ETAPA 4 — AUTOMAÇÕES ==================
  const automacoes = require('./automacoes');

  app.get('/staff/api/growth/contas/:tenant/automacoes', ...naConta('listar automações', () => ({
    automacoes: automacoes.listar(),
    gatilhos: automacoes.GATILHOS,
    acoes: Object.fromEntries(Object.entries(automacoes.ACOES).map(([k, v]) => [k, v.rotulo])),
  })));

  app.post('/staff/api/growth/contas/:tenant/automacoes', ...naConta('criar automação', (req) => automacoes.criar(req.body || {})));

  app.put('/staff/api/growth/contas/:tenant/automacoes/:id/rascunho', ...naConta('salvar rascunho',
    (req) => automacoes.salvarRascunho(req.params.id, (req.body || {}).definicao || { nos: [] })));

  app.post('/staff/api/growth/contas/:tenant/automacoes/:id/publicar', ...naConta('publicar automação',
    (req) => automacoes.publicar(req.params.id, { notas: (req.body || {}).notas || '' })));

  app.post('/staff/api/growth/contas/:tenant/automacoes/:id/reverter', ...naConta('reverter versão',
    (req) => automacoes.reverter(req.params.id, (req.body || {}).versao)));

  app.post('/staff/api/growth/contas/:tenant/automacoes/:id/pausar', ...naConta('pausar automação',
    (req) => automacoes.pausar(req.params.id)));

  // Simulação: mostra o caminho que a automação percorreria, sem executar nada.
  app.post('/staff/api/growth/contas/:tenant/automacoes/:id/simular', ...naConta('simular automação',
    async (req, res) => {
      try { res.json(await automacoes.simular(req.params.id, req.body || {})); }
      catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
      return undefined;
    }));

  app.get('/staff/api/growth/contas/:tenant/automacoes/:id/execucoes', ...naConta('execuções da automação',
    (req) => automacoes.execucoes(req.params.id)));

  app.get('/staff/api/growth/contas/:tenant/execucoes/:id', ...naConta('passos da execução',
    (req) => ({ execucao: repo.buscar('gx_workflow_execucoes', req.params.id), passos: automacoes.passosDe(req.params.id) })));

  app.post('/staff/api/growth/contas/:tenant/execucoes/:id/cancelar', ...naConta('cancelar execução',
    (req) => automacoes.cancelar(req.params.id, { motivo: (req.body || {}).motivo || 'cancelada manualmente' })));

  // ================== ETAPA 5 — AGENTES DE IA ==================
  const agentes = require('./agentes');
  const conhecimento = require('./conhecimento');

  app.get('/staff/api/growth/contas/:tenant/agentes', ...naConta('listar agentes', () => ({
    agentes: agentes.listar().map((a) => agentes.metricas(a.chave)),
    ferramentas: Object.fromEntries(Object.entries(agentes.FERRAMENTAS).map(([k, v]) => [k, { escrita: !!v.escrita, acao: v.acao || null }])),
    llm_disponivel: agentes.temChaveLLM(),
  })));

  app.post('/staff/api/growth/contas/:tenant/agentes/provisionar', ...naConta('provisionar agentes',
    () => ({ criados: agentes.provisionar() })));

  app.put('/staff/api/growth/contas/:tenant/agentes/:chave', ...naConta('configurar agente',
    (req) => agentes.configurar(req.params.chave, req.body || {})));

  app.post('/staff/api/growth/contas/:tenant/agentes/:chave/prompt', ...naConta('publicar prompt',
    (req) => agentes.publicarPrompt(req.params.chave, req.body || {})));

  app.post('/staff/api/growth/contas/:tenant/agentes/:chave/executar', ...naConta('executar agente',
    async (req, res) => {
      try { res.json(await agentes.executar(req.params.chave, req.body || {})); }
      catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
      return undefined;
    }));

  app.get('/staff/api/growth/contas/:tenant/agentes/:chave/execucoes', ...naConta('execuções do agente',
    (req) => agentes.execucoes(req.params.chave)));

  app.post('/staff/api/growth/contas/:tenant/execucoes-agente/:id/avaliar', ...naConta('avaliar execução',
    (req) => agentes.avaliar(req.params.id, req.body || {})));

  // ---- base de conhecimento ----
  app.get('/staff/api/growth/contas/:tenant/conhecimento', ...naConta('base de conhecimento', () => ({
    documentos: conhecimento.listar(),
    vencendo: conhecimento.vencendo(),
  })));
  app.post('/staff/api/growth/contas/:tenant/conhecimento', ...naConta('criar documento',
    (req) => conhecimento.criar(req.body || {})));
  app.put('/staff/api/growth/contas/:tenant/conhecimento/:id', ...naConta('editar documento',
    (req) => conhecimento.atualizar(req.params.id, req.body || {})));
  app.post('/staff/api/growth/contas/:tenant/conhecimento/:id/aprovar', ...naConta('aprovar documento',
    (req) => conhecimento.aprovar(req.params.id)));
  app.get('/staff/api/growth/contas/:tenant/conhecimento/buscar', ...naConta('buscar na base',
    (req) => conhecimento.buscar(req.query.q || '', { limite: Number(req.query.n) || 5 })));

  // --------------------------------------------------------- auditoria
  app.get('/staff/api/growth/auditoria', admin, rota('trilha de auditoria', (req) =>
    repo.auditoria.listar(Number(req.query.n) || 200)));
}

module.exports = { registrarRotasStaff };
