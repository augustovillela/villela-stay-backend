// =====================================================================
// Villela Projects & Events — API do produto (/vpe/api/*), Fase 1.
// Públicas: cadastro (trial), login, aceite de convite, lead.
// Autenticadas: requireTenant → req.vp.tenant.id é a única fonte do
// tenant (isolamento). Permissão fina via requirePerm.
// =====================================================================
'use strict';
const repo = require('./repo');
const portfolio = require('./portfolio');
const tarefas = require('./tarefas');
const eventos = require('./eventos');
const comercial = require('./comercial');
const financeiro = require('./financeiro');
const ia = require('./ia');
const automacoes = require('./automacoes');
const portal = require('./portal');
const billing = require('./billing');
const push = require('./push');
const apiPublica = require('./api-publica');
const { PERMISSOES, PAPEIS } = require('./permissoes');

function registrarRotasApi(app, { express, auth, notificar, enviarEmail }) {
  const r = express.Router();
  r.use(express.json({ limit: '2mb' }));
  r.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const h = (fn) => (req, res) => { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); };
  // atrás do proxy do Render req.protocol é 'http' — links usam o protocolo real (lição do vdocs)
  const protoDe = (req) => String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const { requireTenant, requirePerm } = auth;

  // ------------------------------------------------ públicas
  r.post('/cadastro', h(async (req, res) => {
    const ip = auth.ipDe(req);
    if (auth.bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
    const b = req.body || {};
    let criado;
    try { criado = repo.criarTenantComDono({ empresa: b.empresa, nome: b.nome, email: b.email, senha: b.senha, ip }); }
    catch (e) { auth.registraFalha(ip); throw e; }
    auth.limpaFalhas(ip);
    auth.emitirSessao(res, criado.user.id, criado.tenant.id);
    notificar(`📋 Villela Projects: novo trial — ${criado.tenant.nome} (${criado.user.email}).`);
    res.json({ ok: true, tenant: { id: criado.tenant.id, nome: criado.tenant.nome, slug: criado.tenant.slug } });
  }));

  r.post('/login', h(async (req, res) => {
    const b = req.body || {};
    const sessao = auth.login(req, res, { email: b.email, senha: b.senha, tenant_id: b.tenant_id });
    if (!sessao) return;
    res.json({ ok: true, tenant: { id: sessao.tenant.id, nome: sessao.tenant.nome }, tenants: sessao.tenants });
  }));
  r.post('/logout', (req, res) => { auth.limparSessao(res); res.json({ ok: true }); });

  r.post('/convites/aceitar', h(async (req, res) => {
    const b = req.body || {};
    const { user, tenantId } = repo.aceitarConvite(b.token, { nome: b.nome, senha: b.senha }, auth.ipDe(req));
    auth.emitirSessao(res, user.id, tenantId);
    res.json({ ok: true });
  }));

  const leadsPorIp = new Map();
  r.post('/leads', h(async (req, res) => {
    const ip = auth.ipDe(req);
    if (Date.now() - (leadsPorIp.get(ip) || 0) < 30 * 1000) return res.status(429).json({ erro: 'Aguarde um instante e tente de novo.' });
    leadsPorIp.set(ip, Date.now());
    const b = req.body || {};
    if (!repo.emailOK(repo.emailNorm(b.email))) throw new Error('Informe um e-mail válido.');
    repo.criarLead(b);
    notificar(`📋 Villela Projects: novo lead — ${repo.s(b.nome, 80) || 'sem nome'} <${repo.emailNorm(b.email)}> ${repo.s(b.empresa, 80)}`.trim());
    res.json({ ok: true });
  }));

  // ------------------------------------------------ billing: webhook do Mercado Pago — PÚBLICO (Fase 8)
  r.post('/billing/webhook', async (req, res) => {
    const out = await billing.processarWebhook(req.body || {}, req.query || {});
    res.json(out); // sempre 200 — MP reenvia em 5xx
  });

  // ------------------------------------------------ rotina diária — key-gated (Tarefa do Windows)
  // Avalia automações de todos os tenants + gera o relatório do CEO (1×/dia).
  // Auth: header x-publish-key (ou ?key=) == PUBLISH_KEY. Nunca por sessão.
  r.post('/cron/rotina-diaria', h(async (req, res) => {
    const key = String(req.headers['x-publish-key'] || (req.query || {}).key || '');
    if (!process.env.PUBLISH_KEY || key !== process.env.PUBLISH_KEY) return res.status(403).json({ erro: 'chave inválida' });
    const out = await automacoes.rotinaDiariaTodos({ notificar, enviarEmail });
    for (let i = 0; i < 3; i++) { try { await apiPublica.processarEntregas(20); } catch (_) {} }
    res.json({ ok: true, ...out });
  }));

  // ------------------------------------------------ portal do cliente — PÚBLICO por token (Fase 7)
  r.get('/portal/:token', h(async (req, res) => res.json(portal.visaoPublica(req.params.token))));
  r.post('/portal/:token/aceite', h(async (req, res) => {
    const ip = auth.ipDe(req);
    res.json(portal.aceitarPorToken(req.params.token, req.body || {}, ip));
  }));

  // ------------------------------------------------ sessão / contexto
  r.get('/me', requireTenant, h(async (req, res) => {
    const { user, tenant, vinculo, permissoes, papelNome, bloqueado } = req.vp;
    res.json({
      user: { id: user.id, nome: user.nome, email: user.email },
      tenant: { id: tenant.id, nome: tenant.nome, slug: tenant.slug, status: tenant.status, interno: !!tenant.interno, trial_expira_em: tenant.trial_expira_em },
      papel: vinculo.papel, papel_nome: papelNome, permissoes, bloqueado,
      tenants: repo.tenantsDoUsuario(user.id),
      catalogo_permissoes: PERMISSOES,
      papeis_embutidos: Object.fromEntries(Object.entries(PAPEIS).map(([k, v]) => [k, v.nome])),
      enums: { estagios: repo.ESTAGIOS, categorias: repo.CATEGORIAS, horizontes: repo.HORIZONTES, prioridades: repo.PRIORIDADES },
    });
  }));
  r.post('/trocar-tenant', requireTenant, h(async (req, res) => {
    const alvo = String((req.body || {}).tenant_id || '');
    if (!repo.tenantsDoUsuario(req.vp.user.id).some(t => t.id === alvo)) throw new Error('Você não participa dessa empresa.');
    auth.emitirSessao(res, req.vp.user.id, alvo);
    res.json({ ok: true });
  }));
  r.get('/dashboard', requireTenant, h(async (req, res) => {
    const base = { ...repo.dashboardTenant(req.vp.tenant.id), ...tarefas.resumoExecucao(req.vp.tenant.id), ...eventos.resumoEventos(req.vp.tenant.id) };
    if (req.vp.permissoes.ver_financeiro) Object.assign(base, financeiro.resumoFinanceiro(req.vp.tenant.id));
    res.json(base);
  }));

  // ------------------------------------------------ portfólio (núcleo Fase 1)
  r.get('/projetos', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    const q = req.query || {};
    res.json({ projetos: repo.listarProjetos(req.vp.tenant.id, { status: q.status, estagio: q.estagio, categoria: q.categoria, busca: q.busca }), enums: { estagios: repo.ESTAGIOS, categorias: repo.CATEGORIAS, horizontes: repo.HORIZONTES, prioridades: repo.PRIORIDADES } });
  }));
  r.post('/projetos', requireTenant, requirePerm('criar_projeto'), h(async (req, res) => {
    res.json({ ok: true, projeto: repo.criarProjeto(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.get('/projetos/:id', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    res.json({ projeto: repo.obterProjeto(req.vp.tenant.id, req.params.id) });
  }));
  r.patch('/projetos/:id', requireTenant, requirePerm('editar_projeto'), h(async (req, res) => {
    const b = req.body || {};
    // mudanças de status/estágio que encerram ou pausam exigem decidir_projeto
    if ((b.status && b.status !== 'ativo') || ['pausado', 'cancelado', 'arquivado'].includes(b.estagio || '')) {
      if (!req.vp.permissoes.decidir_projeto) return res.status(403).json({ erro: 'Sem permissão: decidir_projeto' });
    }
    res.json({ ok: true, projeto: repo.atualizarProjeto(req.vp.tenant.id, req.params.id, b, req.vp.user, req.vp.ip) });
  }));

  // ------------------------------------------------ portfólio avançado (Fase 2)
  r.get('/portfolio/ranking', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    res.json(portfolio.ranking(req.vp.tenant.id));
  }));
  r.get('/projetos/:id/plano', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    res.json(portfolio.obterPlano(req.vp.tenant.id, req.params.id));
  }));
  r.put('/projetos/:id/plano', requireTenant, requirePerm('editar_projeto'), h(async (req, res) => {
    const b = req.body || {};
    res.json({ ok: true, ...portfolio.salvarPlano(req.vp.tenant.id, req.params.id, { secoes: b.secoes, status: b.status }, req.vp.user, req.vp.ip) });
  }));
  r.get('/projetos/:id/plano/versoes', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    res.json({ versoes: portfolio.versoesDoPlano(req.vp.tenant.id, req.params.id) });
  }));
  r.get('/projetos/:id/plano/versoes/:numero', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    res.json(portfolio.versaoDoPlano(req.vp.tenant.id, req.params.id, req.params.numero));
  }));
  r.get('/projetos/:id/viabilidade', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    res.json(portfolio.obterViabilidade(req.vp.tenant.id, req.params.id));
  }));
  r.put('/projetos/:id/viabilidade', requireTenant, requirePerm('editar_projeto'), h(async (req, res) => {
    const b = req.body || {};
    res.json({ ok: true, ...portfolio.salvarViabilidade(req.vp.tenant.id, req.params.id, { criterios: b.criterios, observacoes: b.observacoes }, req.vp.user, req.vp.ip) });
  }));
  r.get('/projetos/:id/decisoes', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    res.json({ decisoes: portfolio.listarDecisoes(req.vp.tenant.id, req.params.id) });
  }));
  r.post('/projetos/:id/decisoes', requireTenant, requirePerm('decidir_projeto'), h(async (req, res) => {
    const b = req.body || {};
    res.json({ ok: true, decisoes: portfolio.registrarDecisao(req.vp.tenant.id, req.params.id, { decisao: b.decisao, justificativa: b.justificativa }, req.vp.user, req.vp.ip) });
  }));

  // ------------------------------------------------ execução (Fase 3)
  r.get('/tarefas', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    const q = req.query || {};
    res.json({
      tarefas: tarefas.listarTarefas(req.vp.tenant.id, { project_id: q.projeto, responsavel_id: q.minhas ? req.vp.user.id : q.responsavel, status: q.status, so_atrasadas: q.atrasadas === '1' }),
      status: tarefas.STATUS_TAREFA,
    });
  }));
  r.get('/tarefas/agenda', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    const q = req.query || {};
    res.json(tarefas.agenda(req.vp.tenant.id, { dias: Number(q.dias) || 30, responsavel_id: q.minhas ? req.vp.user.id : '' }));
  }));
  r.get('/projetos/:id/kanban', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    res.json(tarefas.kanban(req.vp.tenant.id, req.params.id));
  }));
  r.post('/projetos/:id/tarefas', requireTenant, requirePerm('gerir_tarefas'), h(async (req, res) => {
    const tarefa = tarefas.criarTarefa(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip);
    // push best-effort: avisa o responsável quando a tarefa nasce atribuída a outra pessoa
    if (tarefa.responsavel_id && tarefa.responsavel_id !== req.vp.user.id) {
      push.notificarUsuario(tarefa.responsavel_id, { title: 'Tarefa para você', body: tarefa.titulo, url: '/vpe/app', tag: 'vpe-tarefa' }).catch(() => {});
    }
    res.json({ ok: true, tarefa });
  }));
  r.get('/tarefas/:id', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    res.json({ tarefa: tarefas.obterTarefa(req.vp.tenant.id, req.params.id) });
  }));
  r.patch('/tarefas/:id', requireTenant, requirePerm('gerir_tarefas'), h(async (req, res) => {
    const antes = tarefas.obterTarefa(req.vp.tenant.id, req.params.id);
    const tarefa = tarefas.atualizarTarefa(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip);
    // push best-effort: avisa o NOVO responsável quando a atribuição muda (nunca quem fez a ação)
    if (tarefa.responsavel_id && tarefa.responsavel_id !== antes.responsavel_id && tarefa.responsavel_id !== req.vp.user.id) {
      push.notificarUsuario(tarefa.responsavel_id, { title: 'Tarefa para você', body: tarefa.titulo, url: '/vpe/app', tag: 'vpe-tarefa' }).catch(() => {});
    }
    res.json({ ok: true, tarefa });
  }));
  r.delete('/tarefas/:id', requireTenant, requirePerm('gerir_tarefas'), h(async (req, res) => {
    tarefas.excluirTarefa(req.vp.tenant.id, req.params.id, req.vp.user, req.vp.ip);
    res.json({ ok: true });
  }));
  r.get('/projetos/:id/riscos', requireTenant, requirePerm('ver_projetos'), h(async (req, res) => {
    res.json({ riscos: tarefas.listarRiscos(req.vp.tenant.id, req.params.id) });
  }));
  r.post('/projetos/:id/riscos', requireTenant, requirePerm('editar_projeto'), h(async (req, res) => {
    res.json({ ok: true, id: tarefas.criarRisco(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.patch('/riscos/:id', requireTenant, requirePerm('editar_projeto'), h(async (req, res) => {
    tarefas.atualizarRisco(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ eventos (Fase 4)
  r.get('/eventos', requireTenant, requirePerm('ver_eventos'), h(async (req, res) => {
    const q = req.query || {};
    res.json({
      eventos: eventos.listarEventos(req.vp.tenant.id, { status: q.status, tipo: q.tipo, busca: q.busca, projeto: q.projeto }),
      enums: { status: eventos.STATUS_EVENTO, tipos: eventos.TIPOS },
    });
  }));
  r.post('/eventos', requireTenant, requirePerm('gerir_eventos'), h(async (req, res) => {
    res.json({ ok: true, evento: eventos.criarEvento(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.get('/eventos/:id', requireTenant, requirePerm('ver_eventos'), h(async (req, res) => {
    res.json({ evento: eventos.obterEvento(req.vp.tenant.id, req.params.id), enums: { status: eventos.STATUS_EVENTO, tipos: eventos.TIPOS, categorias_fornecedor: eventos.CAT_FORNECEDOR } });
  }));
  r.patch('/eventos/:id', requireTenant, requirePerm('gerir_eventos'), h(async (req, res) => {
    res.json({ ok: true, evento: eventos.atualizarEvento(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  // fornecedores do evento
  r.post('/eventos/:id/fornecedores', requireTenant, requirePerm('gerir_eventos'), h(async (req, res) => {
    res.json({ ok: true, id: eventos.alocarFornecedor(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.patch('/eventos-fornecedores/:id', requireTenant, requirePerm('gerir_eventos'), h(async (req, res) => {
    eventos.atualizarAlocacao(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip);
    res.json({ ok: true });
  }));
  r.delete('/eventos-fornecedores/:id', requireTenant, requirePerm('gerir_eventos'), h(async (req, res) => {
    eventos.removerAlocacao(req.vp.tenant.id, req.params.id, req.vp.user, req.vp.ip);
    res.json({ ok: true });
  }));
  // convidados
  r.get('/eventos/:id/convidados', requireTenant, requirePerm('ver_eventos'), h(async (req, res) => {
    res.json({ convidados: eventos.listarConvidados(req.vp.tenant.id, req.params.id) });
  }));
  r.post('/eventos/:id/convidados', requireTenant, requirePerm('gerir_eventos'), h(async (req, res) => {
    res.json({ ok: true, id: eventos.adicionarConvidado(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.patch('/convidados/:id', requireTenant, requirePerm('gerir_eventos'), h(async (req, res) => {
    eventos.atualizarConvidado(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip);
    res.json({ ok: true });
  }));
  r.delete('/convidados/:id', requireTenant, requirePerm('gerir_eventos'), h(async (req, res) => {
    eventos.removerConvidado(req.vp.tenant.id, req.params.id);
    res.json({ ok: true });
  }));
  // fornecedores (tenant, reutilizáveis)
  r.get('/fornecedores', requireTenant, requirePerm('ver_eventos'), h(async (req, res) => {
    const q = req.query || {};
    res.json({ fornecedores: eventos.listarFornecedores(req.vp.tenant.id, { categoria: q.categoria, busca: q.busca }), categorias: eventos.CAT_FORNECEDOR });
  }));
  r.post('/fornecedores', requireTenant, requirePerm('gerir_fornecedores'), h(async (req, res) => {
    res.json({ ok: true, id: eventos.criarFornecedor(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.patch('/fornecedores/:id', requireTenant, requirePerm('gerir_fornecedores'), h(async (req, res) => {
    eventos.atualizarFornecedor(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ CRM (Fase 5)
  r.get('/crm/funil', requireTenant, requirePerm('gerir_crm'), h(async (req, res) => res.json(comercial.funil(req.vp.tenant.id))));
  r.get('/crm/deals', requireTenant, requirePerm('gerir_crm'), h(async (req, res) => {
    const q = req.query || {};
    res.json({ deals: comercial.listarDeals(req.vp.tenant.id, { status: q.status, estagio: q.estagio, busca: q.busca }), estagios: comercial.ESTAGIOS_FUNIL });
  }));
  r.post('/crm/deals', requireTenant, requirePerm('gerir_crm'), h(async (req, res) => {
    res.json({ ok: true, deal: comercial.criarDeal(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.get('/crm/deals/:id', requireTenant, requirePerm('gerir_crm'), h(async (req, res) => res.json({ deal: comercial.obterDeal(req.vp.tenant.id, req.params.id), estagios: comercial.ESTAGIOS_FUNIL })));
  r.patch('/crm/deals/:id', requireTenant, requirePerm('gerir_crm'), h(async (req, res) => {
    res.json({ ok: true, deal: comercial.atualizarDeal(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.post('/crm/deals/:id/notas', requireTenant, requirePerm('gerir_crm'), h(async (req, res) => {
    res.json({ ok: true, deal: comercial.adicionarNota(req.vp.tenant.id, req.params.id, (req.body || {}).texto, req.vp.user, req.vp.ip) });
  }));
  r.post('/crm/deals/:id/converter', requireTenant, requirePerm('gerir_crm'), h(async (req, res) => {
    // converter cria projeto/evento → exige também a permissão do alvo
    const alvo = (req.body || {}).alvo;
    if (alvo === 'projeto' && !req.vp.permissoes.criar_projeto) return res.status(403).json({ erro: 'Sem permissão: criar_projeto' });
    if (alvo === 'evento' && !req.vp.permissoes.gerir_eventos) return res.status(403).json({ erro: 'Sem permissão: gerir_eventos' });
    res.json({ ok: true, ...comercial.converterDeal(req.vp.tenant.id, req.params.id, alvo, req.vp.user, req.vp.ip) });
  }));

  // ------------------------------------------------ propostas (Fase 5)
  r.get('/propostas', requireTenant, requirePerm('gerir_propostas'), h(async (req, res) => res.json({ propostas: comercial.listarPropostas(req.vp.tenant.id, { status: req.query.status }), status: comercial.STATUS_PROPOSTA })));
  r.post('/propostas', requireTenant, requirePerm('gerir_propostas'), h(async (req, res) => res.json({ ok: true, proposta: comercial.criarProposta(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) })));
  r.get('/propostas/:id', requireTenant, requirePerm('gerir_propostas'), h(async (req, res) => res.json({ proposta: comercial.obterProposta(req.vp.tenant.id, req.params.id), status: comercial.STATUS_PROPOSTA })));
  r.patch('/propostas/:id', requireTenant, requirePerm('gerir_propostas'), h(async (req, res) => res.json({ ok: true, proposta: comercial.atualizarProposta(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) })));

  // ------------------------------------------------ contratos (Fase 5 — SEMPRE minuta)
  r.get('/contratos', requireTenant, requirePerm('gerir_contratos'), h(async (req, res) => res.json({ contratos: comercial.listarContratos(req.vp.tenant.id, { status: req.query.status }), tipos: comercial.TIPOS_CONTRATO, status: comercial.STATUS_CONTRATO })));
  r.post('/contratos', requireTenant, requirePerm('gerir_contratos'), h(async (req, res) => res.json({ ok: true, contrato: comercial.criarContrato(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) })));
  r.get('/contratos/:id', requireTenant, requirePerm('gerir_contratos'), h(async (req, res) => res.json({ contrato: comercial.obterContrato(req.vp.tenant.id, req.params.id), tipos: comercial.TIPOS_CONTRATO, status: comercial.STATUS_CONTRATO })));
  r.patch('/contratos/:id', requireTenant, requirePerm('gerir_contratos'), h(async (req, res) => res.json({ ok: true, contrato: comercial.salvarContrato(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) })));
  r.post('/contratos/:id/aceite', requireTenant, requirePerm('gerir_contratos'), h(async (req, res) => res.json({ ok: true, contrato: comercial.registrarAceite(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) })));

  // ------------------------------------------------ financeiro (Fase 5)
  r.get('/financeiro', requireTenant, requirePerm('ver_financeiro'), h(async (req, res) => {
    const q = req.query || {};
    res.json({
      lancamentos: financeiro.listarLancamentos(req.vp.tenant.id, { tipo: q.tipo, status: q.status, project_id: q.projeto, event_id: q.evento, so_atrasados: q.atrasados === '1' }),
      consolidado: financeiro.consolidado(req.vp.tenant.id, { project_id: q.projeto, event_id: q.evento }),
    });
  }));
  r.post('/financeiro', requireTenant, requirePerm('lancar_financeiro'), h(async (req, res) => res.json({ ok: true, lancamento: financeiro.criarLancamento(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) })));
  r.patch('/financeiro/:id', requireTenant, requirePerm('lancar_financeiro'), h(async (req, res) => res.json({ ok: true, lancamento: financeiro.atualizarLancamento(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) })));
  r.delete('/financeiro/:id', requireTenant, requirePerm('lancar_financeiro'), h(async (req, res) => { financeiro.excluirLancamento(req.vp.tenant.id, req.params.id, req.vp.user, req.vp.ip); res.json({ ok: true }); }));

  // ------------------------------------------------ IA: assistente (Fase 6)
  r.get('/ia/status', requireTenant, h(async (req, res) => res.json({ ativo: ia.ativo(), agentes: ia.listarAgentes() })));
  r.get('/ia/conversas', requireTenant, requirePerm('usar_ia'), h(async (req, res) => res.json({ conversas: ia.listarConversas(req.vp.tenant.id, req.vp.user.id), ativo: ia.ativo() })));
  r.get('/ia/conversas/:id', requireTenant, requirePerm('usar_ia'), h(async (req, res) => res.json({ conversa: ia.obterConversa(req.vp.tenant.id, req.vp.user.id, req.params.id) })));
  r.post('/ia/perguntar', requireTenant, requirePerm('usar_ia'), h(async (req, res) => res.json({ ok: true, ...await ia.perguntar(req.vp.tenant.id, req.vp.user, req.body || {}, req.vp.ip) })));
  r.delete('/ia/conversas/:id', requireTenant, requirePerm('usar_ia'), h(async (req, res) => { ia.excluirConversa(req.vp.tenant.id, req.vp.user.id, req.params.id); res.json({ ok: true }); }));

  // ------------------------------------------------ IA: agentes especialistas (Fase 6)
  r.get('/ia/agentes', requireTenant, requirePerm('usar_ia'), h(async (req, res) => res.json({ agentes: ia.listarAgentes(), ativo: ia.ativo(), execucoes: ia.listarExecucoesAgente(req.vp.tenant.id, { agente: req.query.agente }) })));
  r.post('/ia/agentes/executar', requireTenant, requirePerm('usar_ia'), h(async (req, res) => res.json({ ok: true, resultado: await ia.executarAgente(req.vp.tenant.id, req.vp.user, req.body || {}, req.vp.ip) })));

  // ------------------------------------------------ automações (Fase 6)
  r.get('/automacoes', requireTenant, requirePerm('gerir_automacoes'), h(async (req, res) => res.json({ automacoes: automacoes.listarAutomacoes(req.vp.tenant.id), gatilhos: automacoes.GATILHOS, acoes: automacoes.ACOES })));
  r.post('/automacoes', requireTenant, requirePerm('gerir_automacoes'), h(async (req, res) => res.json({ ok: true, automacao: automacoes.criarAutomacao(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) })));
  r.get('/automacoes/:id', requireTenant, requirePerm('gerir_automacoes'), h(async (req, res) => res.json({ automacao: automacoes.obterAutomacao(req.vp.tenant.id, req.params.id), historico: automacoes.historico(req.vp.tenant.id, req.params.id) })));
  r.patch('/automacoes/:id', requireTenant, requirePerm('gerir_automacoes'), h(async (req, res) => res.json({ ok: true, automacao: automacoes.atualizarAutomacao(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) })));
  r.delete('/automacoes/:id', requireTenant, requirePerm('gerir_automacoes'), h(async (req, res) => { automacoes.excluirAutomacao(req.vp.tenant.id, req.params.id, req.vp.user, req.vp.ip); res.json({ ok: true }); }));
  r.post('/automacoes/:id/testar', requireTenant, requirePerm('gerir_automacoes'), h(async (req, res) => res.json({ ok: true, resultado: await automacoes.testar(req.vp.tenant.id, req.params.id) })));
  r.post('/automacoes/avaliar', requireTenant, requirePerm('gerir_automacoes'), h(async (req, res) => res.json({ ok: true, ...await automacoes.avaliarTenant(req.vp.tenant.id, { notificar, enviarEmail }) })));

  // ------------------------------------------------ relatório do CEO (Fase 6)
  r.get('/ceo/relatorios', requireTenant, requirePerm('ver_relatorios'), h(async (req, res) => res.json({ relatorios: automacoes.listarRelatoriosCeo(req.vp.tenant.id), atual: automacoes.consolidarCeo(req.vp.tenant.id), ia_ativa: ia.ativo() })));
  r.post('/ceo/relatorios/gerar', requireTenant, requirePerm('ver_relatorios'), h(async (req, res) => res.json({ ok: true, relatorio: await automacoes.gerarRelatorioCeo(req.vp.tenant.id, { comIA: (req.body || {}).comIA !== false }) })));
  r.get('/ceo/relatorios/:id', requireTenant, requirePerm('ver_relatorios'), h(async (req, res) => res.json({ relatorio: automacoes.obterRelatorioCeo(req.vp.tenant.id, req.params.id) })));

  // ------------------------------------------------ portal do cliente — gestão (Fase 7)
  // criar/gerir share exige a permissão do PRÓPRIO tipo de item.
  const PERM_DO_TIPO = { evento: 'gerir_eventos', projeto: 'editar_projeto', proposta: 'gerir_propostas', contrato: 'gerir_contratos' };
  const podeCompartilhar = (req) => Object.values(PERM_DO_TIPO).some(p => req.vp.permissoes[p]);
  const exigeAlgumCompart = (req, res, next) => podeCompartilhar(req) ? next() : res.status(403).json({ erro: 'Sem permissão para compartilhar com clientes.' });

  r.get('/compartilhamentos', requireTenant, exigeAlgumCompart, h(async (req, res) => res.json({
    compartilhamentos: portal.listarShares(req.vp.tenant.id), tipos: portal.TIPOS,
    recurso_liberado: repo.recursoLiberado(req.vp.tenant.id, 'portal_cliente'),
  })));
  r.post('/compartilhamentos', requireTenant, h(async (req, res) => {
    const tipo = (req.body || {}).tipo;
    const perm = PERM_DO_TIPO[tipo];
    if (!perm) return res.status(400).json({ erro: 'Tipo inválido.' });
    if (!req.vp.permissoes[perm]) return res.status(403).json({ erro: 'Sem permissão: ' + perm });
    res.json({ ok: true, compartilhamento: portal.criarShare(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.patch('/compartilhamentos/:id', requireTenant, exigeAlgumCompart, h(async (req, res) => res.json({ ok: true, compartilhamento: portal.atualizarShare(req.vp.tenant.id, req.params.id, req.body || {}, req.vp.user, req.vp.ip) })));
  r.delete('/compartilhamentos/:id', requireTenant, exigeAlgumCompart, h(async (req, res) => { portal.revogarShare(req.vp.tenant.id, req.params.id, req.vp.user, req.vp.ip); res.json({ ok: true }); }));

  // ------------------------------------------------ billing SaaS — tenant (Fase 8)
  r.get('/billing', requireTenant, h(async (req, res) => {
    if (!req.vp.permissoes.administrar_cobranca && !req.vp.permissoes.ver_uso) return res.status(403).json({ erro: 'Sem permissão: administrar_cobranca' });
    res.json(billing.estado(req.vp.tenant.id));
  }));
  r.post('/billing/assinar', requireTenant, requirePerm('administrar_cobranca'), h(async (req, res) => {
    const base = `${protoDe(req)}://${req.get('host')}`;
    res.json({ ok: true, ...await billing.assinar(req.vp.tenant.id, (req.body || {}).plano_slug, req.vp.user, base, req.vp.ip) });
  }));
  r.post('/billing/cancelar', requireTenant, requirePerm('administrar_cobranca'), h(async (req, res) => { await billing.cancelarAssinatura(req.vp.tenant.id, req.vp.user, req.vp.ip); res.json({ ok: true }); }));

  // ------------------------------------------------ API pública: chaves + webhooks (Fase 8)
  r.get('/integracoes', requireTenant, requirePerm('configurar_integracoes'), h(async (req, res) => res.json({
    api_liberada: repo.recursoLiberado(req.vp.tenant.id, 'api'),
    chaves: apiPublica.listarChaves(req.vp.tenant.id),
    webhooks: apiPublica.listarWebhooks(req.vp.tenant.id),
    eventos: apiPublica.EVENTOS,
    entregas: apiPublica.entregasRecentes(req.vp.tenant.id),
  })));
  r.post('/integracoes/chaves', requireTenant, requirePerm('configurar_integracoes'), h(async (req, res) => res.json({ ok: true, ...apiPublica.criarChave(req.vp.tenant.id, (req.body || {}).nome, req.vp.user, req.vp.ip) })));
  r.delete('/integracoes/chaves/:id', requireTenant, requirePerm('configurar_integracoes'), h(async (req, res) => { apiPublica.revogarChave(req.vp.tenant.id, req.params.id, req.vp.user, req.vp.ip); res.json({ ok: true }); }));
  r.post('/integracoes/webhooks', requireTenant, requirePerm('configurar_integracoes'), h(async (req, res) => res.json({ ok: true, ...apiPublica.criarWebhook(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) })));
  r.delete('/integracoes/webhooks/:id', requireTenant, requirePerm('configurar_integracoes'), h(async (req, res) => { apiPublica.excluirWebhook(req.vp.tenant.id, req.params.id, req.vp.user, req.vp.ip); res.json({ ok: true }); }));

  // ------------------------------------------------ empresa / usuários / papéis
  r.get('/config', requireTenant, requirePerm('gerir_configuracoes'), h(async (req, res) => {
    res.json({ tenant: repo.obterTenant(req.vp.tenant.id), settings: repo.lerSettings(req.vp.tenant.id), chaves: repo.CONFIG_PERMITIDAS });
  }));
  r.patch('/config', requireTenant, requirePerm('gerir_configuracoes'), h(async (req, res) => {
    const b = req.body || {};
    if (b.tenant) repo.atualizarTenant(req.vp.tenant.id, b.tenant, req.vp.user, req.vp.ip);
    for (const [k, v] of Object.entries(b.settings || {})) repo.gravarSetting(req.vp.tenant.id, k, v, req.vp.user, req.vp.ip);
    res.json({ ok: true });
  }));

  r.get('/usuarios', requireTenant, requirePerm('gerir_usuarios'), h(async (req, res) => {
    res.json({ usuarios: repo.listarUsuarios(req.vp.tenant.id), convites: repo.listarConvites(req.vp.tenant.id) });
  }));
  r.patch('/usuarios/:vinculoId', requireTenant, requirePerm('gerir_usuarios'), h(async (req, res) => {
    res.json({ ok: true, vinculo: repo.alterarVinculo(req.vp.tenant.id, req.params.vinculoId, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.post('/convites', requireTenant, requirePerm('gerir_usuarios'), h(async (req, res) => {
    const b = req.body || {};
    const conv = repo.criarConvite(req.vp.tenant.id, { email: b.email, papel: b.papel, funcao: b.funcao }, req.vp.user, req.vp.ip);
    const link = `${protoDe(req)}://${req.get('host')}/vpe/convite/${conv.token}`;
    let email_enviado = false;
    if (typeof enviarEmail === 'function') {
      email_enviado = await Promise.resolve(enviarEmail(conv.email,
        `Convite — ${req.vp.tenant.nome} no Villela Projects`,
        `<p>${repo.s(req.vp.user.nome, 120)} convidou você para a gestão de projetos e eventos de <b>${repo.s(req.vp.tenant.nome, 120)}</b>.</p>
         <p><a href="${link}">Aceitar o convite</a> (válido por 7 dias)</p>`)).catch(() => false);
    }
    res.json({ ok: true, convite: { id: conv.id, email: conv.email }, link, email_enviado });
  }));
  r.delete('/convites/:id', requireTenant, requirePerm('gerir_usuarios'), h(async (req, res) => {
    repo.revogarConvite(req.vp.tenant.id, req.params.id, req.vp.user, req.vp.ip);
    res.json({ ok: true });
  }));
  r.get('/papeis', requireTenant, requirePerm('gerir_usuarios'), h(async (req, res) => res.json({ papeis: repo.listarRoles(req.vp.tenant.id) })));
  r.post('/papeis', requireTenant, requirePerm('gerir_papeis'), h(async (req, res) => {
    res.json({ ok: true, id: repo.salvarRole(req.vp.tenant.id, req.body || {}, req.vp.user, req.vp.ip) });
  }));
  r.delete('/papeis/:id', requireTenant, requirePerm('gerir_papeis'), h(async (req, res) => {
    repo.excluirRole(req.vp.tenant.id, req.params.id, req.vp.user, req.vp.ip);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ auditoria / uso
  r.get('/auditoria', requireTenant, requirePerm('ver_auditoria'), h(async (req, res) => {
    res.json({ eventos: repo.listarAuditoria(req.vp.tenant.id, { limite: req.query.limite, antes: req.query.antes }) });
  }));
  r.get('/uso', requireTenant, h(async (req, res) => {
    if (!req.vp.permissoes.ver_uso && !req.vp.permissoes.administrar_cobranca) return res.status(403).json({ erro: 'Sem permissão: ver_uso' });
    res.json({ uso: repo.usoDoMes(req.vp.tenant.id), plano: repo.planoDoTenant(req.vp.tenant.id), planos: repo.listarPlanos() });
  }));

  // ------------------------------------------------ notificações push do painel (PWA) — por usuário, sem gate de módulo
  r.get('/push/chave', requireTenant, h(async (req, res) => res.json({ publicKey: push.chavePublica() })));
  r.post('/push/subscribe', requireTenant, h(async (req, res) => {
    push.salvar(req.vp.tenant.id, req.vp.user.id, (req.body || {}).subscription);
    res.json({ ok: true });
  }));
  r.post('/push/unsubscribe', requireTenant, h(async (req, res) => {
    push.remover((req.body || {}).endpoint);
    res.json({ ok: true });
  }));

  app.use('/vpe/api', r);
}

module.exports = { registrarRotasApi };
