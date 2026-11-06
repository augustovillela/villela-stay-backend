// =====================================================================
// Villela CRM — API do CRM do assinante. Prefixo /crm/api/app/*.
// Protegido por requireAssinante (cookie crm_sess) + requireAcesso
// (bloqueia trial vencido/suspensa) + gate por MÓDULO do plano + papel.
// Também registra os endpoints PÚBLICOS: webhook de entrada de leads,
// proposta pública (/crm/api/p/:token) e API pública por chave vc_.
// =====================================================================
'use strict';
const repo = require('./repo');
const app = require('./app-repo');
const push = require('./push');
const buscas = require('./buscas');
const { db } = require('./db');

function registrarRotasApp(server, { requireAssinante, requirePapel }) {
  const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(400).json({ erro: e.message }); } };
  const tid = (req) => req.assinante.tenant_id;
  const quem = (req) => req.assinante.nome || req.assinante.email;

  function requireAcesso(req, res, next) {
    const e = repo.entitlements(req.assinante.tenant_id);
    if (!e || !e.acesso_liberado) return res.status(403).json({ erro: 'Acesso bloqueado — regularize seu plano para usar o CRM.', bloqueado: true });
    req.ent = e; next();
  }
  const gate = (mod) => (req, res, next) => (req.ent && req.ent.modulos.includes(mod)) ? next()
    : res.status(403).json({ erro: `O módulo "${mod}" não está no seu plano. Faça upgrade para liberar.`, modulo: mod });
  const G = (mod) => [requireAssinante, requireAcesso, gate(mod)];
  const GE = (mod, acao) => [requireAssinante, requireAcesso, gate(mod), requirePapel(acao)]; // gate + papel
  const B = [requireAssinante, requireAcesso];

  server.use('/crm/api/app', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---- dashboard comercial ----
  server.get('/crm/api/app/dashboard', ...B, h((req, res) => res.json({ dashboard: app.dashboard(tid(req)), entitlements: req.ent })));

  // ---- config do CRM ----
  server.get('/crm/api/app/config', ...B, h((req, res) => {
    const c = app.Config.obter(tid(req));
    res.json({ config: c ? c.config : {}, webhook_token: c ? c.webhook_token : '', tipos: app.TIPOS_CONTATO, origens: app.ORIGENS, variaveis: app.VARIAVEIS, canais: app.Canais.CANAIS });
  }));
  server.post('/crm/api/app/config', ...GE('contatos', 'gerir_conta'), h((req, res) => res.json({ ok: true, config: app.Config.salvar(tid(req), req.body || {}).config })));

  // ---- contatos ----
  server.get('/crm/api/app/contatos', ...G('contatos'), h((req, res) => res.json({ contatos: app.Contatos.listar(tid(req), req.query) })));
  server.get('/crm/api/app/contatos/exportar', ...GE('importacao', 'editar'), h((req, res) => {
    res.type('text/csv').attachment('contatos.csv').send(app.Contatos.exportarCSV(tid(req), req.query));
  }));
  server.get('/crm/api/app/contatos/:id', ...G('contatos'), h((req, res) => {
    const c = app.Contatos.ficha(tid(req), req.params.id);
    if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
    res.json({ contato: c });
  }));
  server.post('/crm/api/app/contatos', ...GE('contatos', 'editar'), h((req, res) => {
    const lim = repo.dentroLimite(tid(req), 'contatos');
    if (!lim.ok) return res.status(400).json({ erro: `Limite de contatos do plano atingido (${lim.limite}). Faça upgrade.` });
    res.json({ ok: true, ...app.Contatos.criar(tid(req), req.body || {}, quem(req)) });
  }));
  server.patch('/crm/api/app/contatos/:id', ...GE('contatos', 'editar'), h((req, res) => res.json({ ok: true, contato: app.Contatos.atualizar(tid(req), req.params.id, req.body || {}, quem(req)) })));
  server.delete('/crm/api/app/contatos/:id', ...GE('contatos', 'gerir_conta'), h((req, res) => res.json({ ok: true, ...app.Contatos.excluir(tid(req), req.params.id) })));
  server.post('/crm/api/app/contatos/importar', ...GE('importacao', 'editar'), h((req, res) => {
    res.json({ ok: true, ...app.Contatos.importarCSV(tid(req), (req.body || {}).csv, quem(req)) });
  }));
  // ---- canais do contato (multicanal) + unificação ----
  server.get('/crm/api/app/canais', ...B, h((req, res) => res.json({ canais: app.Canais.CANAIS, alcance: app.Canais.alcance(tid(req)) })));
  server.post('/crm/api/app/contatos/importar-rede', ...GE('importacao', 'editar'), h((req, res) => {
    const b = req.body || {};
    res.json({ ok: true, ...app.Contatos.importarRedes(tid(req), b.canal, b.texto, quem(req)) });
  }));
  server.get('/crm/api/app/contatos-duplicados', ...G('contatos'), h((req, res) => res.json({ grupos: app.Contatos.duplicados(tid(req)) })));
  server.post('/crm/api/app/contatos/:id/mesclar', ...GE('contatos', 'editar'), h((req, res) => res.json(app.Contatos.mesclar(tid(req), req.params.id, (req.body || {}).com, quem(req)))));
  server.post('/crm/api/app/contatos/:id/canais', ...GE('contatos', 'editar'), h((req, res) => {
    const b = req.body || {};
    if (!app.Contatos.obter(tid(req), req.params.id)) return res.status(404).json({ erro: 'Contato não encontrado.' });
    const r = app.Canais.adicionar(tid(req), req.params.id, b.canal, b.identificador, { fonte: 'manual' });
    if (r.conflito) return res.status(400).json({ erro: 'Esse perfil já pertence a outro contato. Use "Unificar cadastros" para juntar os dois.' });
    res.json({ ok: true, ...r });
  }));
  server.delete('/crm/api/app/contatos/:id/canais/:cid', ...GE('contatos', 'editar'), h((req, res) => res.json({ ok: true, ...app.Canais.remover(tid(req), req.params.id, req.params.cid) })));
  server.post('/crm/api/app/contatos/:id/canais/:cid/optout', ...GE('contatos', 'editar'), h((req, res) => res.json(app.Canais.optOut(tid(req), req.params.id, req.params.cid, (req.body || {}).sair !== false))));
  server.post('/crm/api/app/contatos/:id/atividade', ...GE('contatos', 'editar'), h((req, res) => {
    const id = app.Atividades.registrar(tid(req), { ...(req.body || {}), contato_id: req.params.id, autor: quem(req) });
    app.recalcularScore(tid(req), req.params.id);
    res.json({ ok: true, id });
  }));

  // ---- busca ativa (leads do Google Maps) ----
  // Nada gasta sem aprovação: criar = "aguardando_aprovacao"; só gerir_conta aprova (vê a estimativa).
  server.get('/crm/api/app/buscas', ...G('importacao'), h((req, res) => res.json({
    buscas: buscas.listar(tid(req)), fontes: buscas.fontesDisponiveis(), frequencias: buscas.FREQ_OK, agenda_ligada: buscas.agendaLigada(),
    teto_mes: buscas.tetoMes(), lugares_no_mes: buscas.lugaresNoMes(tid(req)), max_por_busca: buscas.MAX_POR_BUSCA })));
  server.post('/crm/api/app/buscas', ...GE('importacao', 'editar'), h((req, res) => res.json({ ok: true, busca: buscas.criar(tid(req), req.body || {}) })));
  server.patch('/crm/api/app/buscas/:id', ...GE('importacao', 'editar'), h((req, res) => res.json({ ok: true, ...buscas.atualizar(tid(req), req.params.id, req.body || {}) })));
  server.post('/crm/api/app/buscas/:id/aprovar', ...GE('importacao', 'gerir_conta'), h((req, res) => res.json({ ok: true, busca: buscas.aprovar(tid(req), req.params.id, { aceite: (req.body || {}).aceite === true, por: quem(req) }) })));
  server.post('/crm/api/app/buscas/:id/status', ...GE('importacao', 'editar'), h((req, res) => res.json({ ok: true, ...buscas.mudarStatus(tid(req), req.params.id, (req.body || {}).status) })));
  server.post('/crm/api/app/buscas/:id/rodar', ...GE('importacao', 'gerir_conta'), h((req, res) => {
    const b = buscas.obter(tid(req), req.params.id);
    if (!b) return res.status(404).json({ erro: 'Busca não encontrada.' });
    if (!b.aprovada_em) return res.status(400).json({ erro: 'Aprove a busca (estimativa de custo) antes de rodar.' });
    if (b.status !== 'ativa') return res.status(400).json({ erro: 'A busca está pausada.' });
    // quem paga: conta interna, token do assinante ou créditos — decidido ANTES de gastar (captura.js)
    const Captura = require('./captura');
    const sit = Captura.situacaoExterna(tid(req));
    if (!sit.pode) return res.status(400).json({ erro: sit.motivo || 'Sem forma de pagamento para esta busca. Nada foi cobrado.' });
    if (sit.modo === 'creditos') {
      const orc = Captura.orcamentoExterno(tid(req), b.custo);
      if ((Number((req.body || {}).aceite_milesimos) || 0) < orc.teto_milesimos) return res.status(409).json({ erro: `Esta busca custa no máximo ${orc.teto}. Confirme o valor para rodar.`, orcamento_milesimos: orc.teto_milesimos, orcamento: orc.teto });
      if (!orc.cobre) return res.status(402).json({ erro: `Saldo insuficiente: o teto é ${orc.teto} e você tem ${orc.saldo}. Recarregue para continuar.`, orcamento_milesimos: orc.teto_milesimos });
    }
    // roda em segundo plano (pode levar minutos); a tela acompanha pelas execuções
    buscas.executar(tid(req), req.params.id, { gatilho: 'manual' }).catch((e) => console.warn('[crm] busca manual falhou:', e.message));
    res.json({ ok: true, iniciada: true });
  }));
  // campanha de leads de uma tag (ex.: confraternizacao-2026): nasce em RASCUNHO, nada é enviado
  server.post('/crm/api/app/buscas/preparar-campanha', ...GE('campanhas', 'campanhas'), h((req, res) => {
    const lim = repo.dentroLimite(tid(req), 'campanhas_mes');
    if (!lim.ok) return res.status(400).json({ erro: `Limite de campanhas do mês atingido (${lim.limite}). Faça upgrade.` });
    res.json({ ok: true, ...buscas.prepararCampanha(tid(req), req.body || {}, quem(req)) });
  }));
  server.get('/crm/api/app/buscas/:id/execucoes', ...G('importacao'), h((req, res) => res.json({ execucoes: buscas.execucoes(tid(req), req.params.id) })));
  server.get('/crm/api/app/buscas/:id/lugares', ...G('importacao'), h((req, res) => res.json({ lugares: buscas.lugares(tid(req), req.params.id, req.query) })));

  // ---- empresas ----
  server.get('/crm/api/app/empresas', ...G('empresas'), h((req, res) => res.json({ empresas: app.Empresas.listar(tid(req), req.query.busca) })));
  server.post('/crm/api/app/empresas', ...GE('empresas', 'editar'), h((req, res) => res.json({ ok: true, empresa: app.Empresas.criar(tid(req), req.body || {}) })));
  server.patch('/crm/api/app/empresas/:id', ...GE('empresas', 'editar'), h((req, res) => res.json({ ok: true, empresa: app.Empresas.atualizar(tid(req), req.params.id, req.body || {}) })));

  // ---- funis + kanban ----
  server.get('/crm/api/app/funis', ...G('funis'), h((req, res) => res.json({ funis: app.Funis.listar(tid(req)) })));
  server.post('/crm/api/app/funis', ...GE('funis', 'gerir_conta'), h((req, res) => {
    const lim = repo.dentroLimite(tid(req), 'funis');
    if (!lim.ok) return res.status(400).json({ erro: `Limite de funis do plano atingido (${lim.limite}). Faça upgrade.` });
    res.json({ ok: true, funil: app.Funis.criar(tid(req), req.body || {}) });
  }));
  server.get('/crm/api/app/kanban', ...G('funis'), h((req, res) => {
    const k = app.Funis.kanban(tid(req), req.query.funil_id);
    if (!k) return res.status(404).json({ erro: 'Nenhum funil encontrado.' });
    res.json(k);
  }));

  // ---- oportunidades ----
  server.post('/crm/api/app/oportunidades', ...GE('oportunidades', 'editar'), h((req, res) => res.json({ ok: true, oportunidade: app.Oportunidades.criar(tid(req), req.body || {}, quem(req)) })));
  server.get('/crm/api/app/oportunidades/:id', ...G('oportunidades'), h((req, res) => {
    const o = app.Oportunidades.obter(tid(req), req.params.id);
    if (!o) return res.status(404).json({ erro: 'Oportunidade não encontrada.' });
    res.json({ oportunidade: o });
  }));
  server.patch('/crm/api/app/oportunidades/:id', ...GE('oportunidades', 'editar'), h((req, res) => res.json({ ok: true, oportunidade: app.Oportunidades.atualizar(tid(req), req.params.id, req.body || {}, quem(req)) })));
  server.post('/crm/api/app/oportunidades/:id/mover', ...GE('oportunidades', 'editar'), h((req, res) => {
    res.json({ ok: true, oportunidade: app.Oportunidades.mover(tid(req), req.params.id, (req.body || {}).estagio_id, quem(req), (req.body || {}).motivo) });
  }));

  // ---- tarefas / follow-ups ----
  server.get('/crm/api/app/tarefas', ...G('tarefas'), h((req, res) => res.json({ tarefas: app.Tarefas.listar(tid(req), req.query) })));
  server.get('/crm/api/app/tarefas/caixa', ...G('tarefas'), h((req, res) => res.json(app.Tarefas.caixa(tid(req)))));
  server.post('/crm/api/app/tarefas', ...GE('tarefas', 'editar'), h((req, res) => res.json({ ok: true, tarefa: app.Tarefas.criar(tid(req), req.body || {}, quem(req)) })));
  server.post('/crm/api/app/tarefas/:id/concluir', ...GE('tarefas', 'editar'), h((req, res) => res.json({ ok: true, ...app.Tarefas.concluir(tid(req), req.params.id, quem(req)) })));
  server.post('/crm/api/app/tarefas/:id/cancelar', ...GE('tarefas', 'editar'), h((req, res) => res.json({ ok: true, ...app.Tarefas.cancelar(tid(req), req.params.id) })));

  // ---- templates ----
  server.get('/crm/api/app/templates', ...G('templates'), h((req, res) => res.json({ templates: app.Templates.listar(tid(req), req.query), variaveis: app.VARIAVEIS })));
  server.post('/crm/api/app/templates', ...GE('templates', 'editar'), h((req, res) => {
    const lim = repo.dentroLimite(tid(req), 'templates');
    if (!lim.ok) return res.status(400).json({ erro: `Limite de templates do plano atingido (${lim.limite}).` });
    res.json({ ok: true, template: app.Templates.criar(tid(req), req.body || {}) });
  }));
  server.patch('/crm/api/app/templates/:id', ...GE('templates', 'editar'), h((req, res) => res.json({ ok: true, template: app.Templates.atualizar(tid(req), req.params.id, req.body || {}) })));
  server.post('/crm/api/app/templates/:id/render', ...G('templates'), h((req, res) => {
    res.json({ ok: true, ...app.Templates.render(tid(req), req.params.id, (req.body || {}).contato_id, (req.body || {}).extras || {}) });
  }));

  // ---- propostas ----
  server.get('/crm/api/app/propostas', ...G('propostas'), h((req, res) => res.json({ propostas: app.Propostas.listar(tid(req), req.query) })));
  server.post('/crm/api/app/propostas', ...GE('propostas', 'propostas'), h((req, res) => res.json({ ok: true, proposta: app.Propostas.criar(tid(req), req.body || {}, quem(req)) })));
  server.patch('/crm/api/app/propostas/:id', ...GE('propostas', 'propostas'), h((req, res) => res.json({ ok: true, proposta: app.Propostas.atualizar(tid(req), req.params.id, req.body || {}) })));
  server.post('/crm/api/app/propostas/:id/enviar', ...GE('propostas', 'propostas'), h((req, res) => res.json({ ok: true, proposta: app.Propostas.enviar(tid(req), req.params.id, quem(req)) })));
  server.post('/crm/api/app/propostas/:id/status', ...GE('propostas', 'propostas'), h((req, res) => res.json({ ok: true, proposta: app.Propostas.mudarStatus(tid(req), req.params.id, (req.body || {}).status, quem(req)) })));

  require('./rotas-conversas').registrarRotasConversas(server, { G, GE, h, tid, quem });
  require('./rotas-captura').registrarRotasCaptura(server, { G, GE, B, tid, quem });

  // ---- campanhas ----
  server.get('/crm/api/app/campanhas', ...G('campanhas'), h((req, res) => res.json({ campanhas: app.Campanhas.listar(tid(req)) })));
  server.post('/crm/api/app/campanhas', ...GE('campanhas', 'campanhas'), h((req, res) => {
    const lim = repo.dentroLimite(tid(req), 'campanhas_mes');
    if (!lim.ok) return res.status(400).json({ erro: `Limite de campanhas do mês atingido (${lim.limite}). Faça upgrade.` });
    res.json({ ok: true, ...app.Campanhas.criar(tid(req), req.body || {}, quem(req)) });
  }));
  server.get('/crm/api/app/campanhas/:id/alvos', ...G('campanhas'), h((req, res) => res.json({ alvos: app.Campanhas.alvos(tid(req), req.params.id, req.query.status, req.query.canal) })));
  server.post('/crm/api/app/campanhas/:id/status', ...GE('campanhas', 'campanhas'), h((req, res) => res.json({ ok: true, ...app.Campanhas.mudarStatus(tid(req), req.params.id, (req.body || {}).status) })));
  server.post('/crm/api/app/campanha-alvos/:id', ...GE('campanhas', 'campanhas'), h((req, res) => res.json({ ok: true, ...app.Campanhas.marcarAlvo(tid(req), req.params.id, (req.body || {}).status, quem(req)) })));

  // ---- automações ----
  server.post('/crm/api/app/automacoes/rodar', ...G('automacoes'), h((req, res) => {
    if (!repo.flag(tid(req), 'automacoes')) return res.status(403).json({ erro: 'Automações não estão no seu plano.' });
    res.json({ ok: true, ...app.rodarAutomacoes(tid(req)) });
  }));

  // ---- agentes (IA) — sempre sugestão com log + revisão humana ----
  const gateIA = (req, res, next) => {
    if (!repo.flag(tid(req), 'ia')) return res.status(403).json({ erro: 'Agentes de IA não estão no seu plano.' });
    const lim = repo.dentroLimite(tid(req), 'ia_mes');
    if (!lim.ok) return res.status(400).json({ erro: `Limite de execuções de IA do mês atingido (${lim.limite}).` });
    next();
  };
  server.post('/crm/api/app/ia/qualificar/:contatoId', ...G('ia'), gateIA, h((req, res) => res.json({ ok: true, ...app.Agentes.qualificar(tid(req), req.params.contatoId) })));
  server.post('/crm/api/app/ia/followups', ...G('ia'), gateIA, h((req, res) => res.json({ ok: true, ...app.Agentes.followups(tid(req)) })));
  server.post('/crm/api/app/ia/reativacao', ...G('ia'), gateIA, h((req, res) => res.json({ ok: true, ...app.Agentes.reativacao(tid(req)) })));
  server.post('/crm/api/app/ia/perdas', ...G('ia'), gateIA, h((req, res) => res.json({ ok: true, ...app.Agentes.perdas(tid(req)) })));
  server.post('/crm/api/app/ia/resposta/:contatoId', ...G('ia'), gateIA, h((req, res) => res.json({ ok: true, ...app.Agentes.resposta(tid(req), req.params.contatoId, req.body || {}) })));
  server.get('/crm/api/app/ia/logs', ...G('ia'), h((req, res) => res.json({ logs: app.Agentes.logs(tid(req), req.query.n) })));
  server.post('/crm/api/app/ia/logs/:id', ...G('ia'), h((req, res) => res.json({ ok: true, ...app.Agentes.avaliarLog(tid(req), req.params.id, (req.body || {}).status) })));

  // ---- API pública (chaves) ----
  server.get('/crm/api/app/chaves', ...G('api'), h((req, res) => res.json({ chaves: app.ApiKeys.listar(tid(req)) })));
  server.post('/crm/api/app/chaves', ...GE('api', 'gerir_conta'), h((req, res) => {
    if (!repo.flag(tid(req), 'api_publica')) return res.status(403).json({ erro: 'API pública não está no seu plano.' });
    res.json({ ok: true, ...app.ApiKeys.criar(tid(req), (req.body || {}).nome) });
  }));
  server.delete('/crm/api/app/chaves/:id', ...GE('api', 'gerir_conta'), h((req, res) => res.json({ ok: true, ...app.ApiKeys.revogar(tid(req), req.params.id) })));

  // ---- notificações push do painel (PWA) — por usuário, sem gate de módulo ----
  server.get('/crm/api/app/push/chave', requireAssinante, h((req, res) => res.json({ publicKey: push.chavePublica() })));
  server.post('/crm/api/app/push/subscribe', requireAssinante, h((req, res) => {
    push.salvar(tid(req), req.assinante.id, (req.body || {}).subscription);
    res.json({ ok: true });
  }));
  server.post('/crm/api/app/push/unsubscribe', requireAssinante, h((req, res) => {
    push.remover((req.body || {}).endpoint);
    res.json({ ok: true });
  }));
}

// ---- endpoints PÚBLICOS (sem sessão) ----
function registrarRotasPublicas(server) {
  const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(400).json({ erro: e.message }); } };

  // webhook de ENTRADA de leads (formulários externos, Make/n8n/Zapier, site do assinante)
  server.post('/crm/webhook/:token', h((req, res) => {
    const c = app.Config.porWebhookToken(req.params.token);
    if (!c) return res.status(404).json({ erro: 'Webhook não encontrado.' });
    const ent = repo.entitlements(c.tenant_id);
    if (!ent || !ent.acesso_liberado) return res.status(403).json({ erro: 'Conta inativa.' });
    const lim = repo.dentroLimite(c.tenant_id, 'contatos');
    if (!lim.ok) return res.status(400).json({ erro: 'Limite de contatos do plano atingido.' });
    const d = req.body || {};
    const r = app.Contatos.criar(c.tenant_id, { ...d, origem: app.ORIGENS.includes(d.origem) ? d.origem : 'formulario-externo' }, 'webhook');
    if (!r.existente) {
      push.notificarTenant(c.tenant_id, { title: 'Novo lead no CRM', body: (r.contato.nome || 'Contato sem nome') + ' entrou pelo formulário.', url: '/crm/app', tag: 'crm-lead' }).catch(() => {});
    }
    res.json({ ok: true, contato_id: r.contato.id, existente: r.existente });
  }));

  // WhatsApp Business OFICIAL do assinante (Fase C, só recebimento): verificação da Meta + mensagens assinadas
  const WA = require('./whatsapp-business');
  server.get('/crm/webhook/whatsapp/:token', (req, res) => {
    const desafio = WA.verificar(req.params.token, req.query);
    if (desafio == null) return res.sendStatus(403);
    res.type('text/plain').send(desafio);
  });
  server.post('/crm/webhook/whatsapp/:token', (req, res) => {
    if (!req.rawBody) { console.warn('[crm] webhook WhatsApp sem corpo bruto: o servidor precisa capturar req.rawBody (verify do express.json).'); return res.sendStatus(500); }
    try {
      const tid = WA.tenantPorToken(req.params.token);
      const ent = tid ? repo.entitlements(tid) : null;
      if (tid && (!ent || !ent.acesso_liberado)) return res.sendStatus(200); // conta inativa: aceita e ignora (a Meta não reentrega)
      res.sendStatus(WA.receber(req.params.token, req.rawBody, req.get('x-hub-signature-256'), req.body).status);
    } catch (e) { console.warn('[crm] webhook WhatsApp falhou:', String(e.message).slice(0, 120)); res.sendStatus(500); }
  });

  // proposta pública (visualização + aceite)
  server.get('/crm/api/p/:token', h((req, res) => {
    const p = app.Propostas.publica(req.params.token);
    if (!p) return res.status(404).json({ erro: 'Proposta não encontrada.' });
    res.json({ proposta: p });
  }));
  server.post('/crm/api/p/:token/responder', h((req, res) => {
    const antes = db.prepare('SELECT tenant_id, titulo, status FROM crm_propostas WHERE token = ?').get(String(req.params.token || '').slice(0, 60));
    const r = app.Propostas.responderPublica(req.params.token, !!(req.body || {}).aceite);
    if (antes && !['aceita', 'recusada'].includes(antes.status) && ['aceita', 'recusada'].includes(r.status)) {
      const rot = r.status === 'aceita' ? '🎉 Proposta ACEITA' : 'Proposta recusada';
      push.notificarTenant(antes.tenant_id, { title: rot, body: antes.titulo || 'Proposta comercial', url: '/crm/app', tag: 'crm-proposta' }).catch(() => {});
    }
    res.json({ ok: true, status: r.status });
  }));

  // API pública por chave vc_ (header x-api-key): criar e listar contatos
  const porChave = (req, res) => {
    const k = app.ApiKeys.resolver(req.headers['x-api-key']);
    if (!k) { res.status(401).json({ erro: 'Chave de API inválida.' }); return null; }
    if (!repo.flag(k.tenant_id, 'api_publica')) { res.status(403).json({ erro: 'API pública não habilitada no plano.' }); return null; }
    return k;
  };
  server.post('/crm/api/v1/contatos', h((req, res) => {
    const k = porChave(req, res); if (!k) return;
    const lim = repo.dentroLimite(k.tenant_id, 'contatos');
    if (!lim.ok) return res.status(400).json({ erro: 'Limite de contatos do plano atingido.' });
    const r = app.Contatos.criar(k.tenant_id, { ...(req.body || {}), origem: (req.body || {}).origem || 'api' }, 'api');
    res.json({ ok: true, contato: { id: r.contato.id, existente: r.existente } });
  }));
  server.get('/crm/api/v1/contatos', h((req, res) => {
    const k = porChave(req, res); if (!k) return;
    res.json({ contatos: app.Contatos.listar(k.tenant_id, { ...req.query, limite: Math.min(Number(req.query.limite) || 100, 500) }) });
  }));
}

module.exports = { registrarRotasApp, registrarRotasPublicas };
