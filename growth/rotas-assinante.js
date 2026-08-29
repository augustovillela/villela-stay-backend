// =====================================================================
// Villela Growth OS — API do ASSINANTE (painel em /crm/app).
//
// Por que aqui e não em /staff: pela ADR-0002, Growth OS É o Villela CRM
// evoluído. O assinante já tem login, sessão e painel em /crm/app — criar
// um segundo login para o mesmo produto seria contradizer a decisão.
//
// Estas rotas usam o `requireAssinante` do CRM (cookie crm_sess) e
// executam SEMPRE dentro do tenant da sessão. O tenant nunca vem da
// requisição — é o mesmo princípio das rotas de plataforma, aplicado do
// lado de fora.
// =====================================================================
'use strict';
const tenancy = require('./tenancy');
const repo = require('./repo');
const rbac = require('./rbac');
const entitlements = require('./entitlements');
const repoCrm = require('../crm/repo');   // standing da conta mora no CRM
const { j } = require('./db');

function registrarRotasAssinante(app, { requireAssinante }) {
  if (!requireAssinante) throw new Error('growth: rotas do assinante exigem requireAssinante do CRM.');

  /**
   * Envelopa o handler no contexto do assinante logado. As permissões vêm
   * do papel legado do CRM traduzido para o perfil equivalente do Growth,
   * então a checagem de permissão é a mesma dos dois lados.
   */
  const rota = (fn, { flag = null } = {}) => [requireAssinante, (req, res) => {
    const a = req.assinante;
    // O requireAssinante confere se o USUARIO esta ativo; nao conferia o
    // STANDING da conta. Trial vencido ou assinatura suspensa mantinha o painel
    // inteiro aberto, porque as flags do plano continuam la depois que o status
    // muda. O CRM ja barrava isso (requireAcesso); o Growth herdou a sessao e
    // nao herdou a trava.
    const ent = repoCrm.entitlements(a.tenant_id);
    if (!ent || !ent.acesso_liberado) {
      return res.status(403).json({ erro: 'Acesso bloqueado — regularize seu plano para usar o Growth.', bloqueado: true });
    }
    const slugPerfil = rbac.MAPA_PAPEL_LEGADO[a.papel] || rbac.PERFIL_PADRAO;
    const papel = rbac.papelPorSlug(slugPerfil);
    const permissoes = new Set(papel ? j.parse(papel.permissoes, []) : []);

    try {
      const saida = tenancy.comTenant(
        { tenantId: a.tenant_id, userId: a.id, papel: a.papel, permissoes, correlationId: req.correlationId },
        () => {
          // recurso fora do plano não é 404 nem tela vazia: é 402 com motivo
          if (flag) entitlements.exigirFlag(flag);
          return fn(req, res, a);
        }
      );
      if (saida !== undefined && !res.headersSent) {
        if (saida && typeof saida.then === 'function') {
          return saida.then((v) => { if (!res.headersSent) res.json(v); })
            .catch((e) => { if (!res.headersSent) res.status(e.status || 500).json({ erro: e.message }); });
        }
        res.json(saida);
      }
    } catch (e) {
      if (!res.headersSent) res.status(e.status || 500).json({ erro: e.message });
    }
  }];

  const B = '/crm/api/growth';

  // ---- visão geral: o que exige ação hoje ----
  app.get(`${B}/visao`, ...rota(() => {
    const comercial = require('./comercial');
    const conversas = require('./conversas');
    const seguro = (fn, padrao = 0) => { try { return fn(); } catch { return padrao; } };
    return {
      onboarding: comercial.onboarding(),
      identidade: comercial.identidadePublica(),
      exige_acao: {
        conversas_sem_resposta: seguro(() => repo.contar('gx_conversas', { onde: "status = 'aberta' AND primeira_resposta_em = ''" })),
        sla_em_risco: seguro(() => conversas.slaEmRisco().length),
        aprovacoes_pendentes: seguro(() => repo.contar('gx_aprovacoes', { onde: "status = 'pendente'" })),
        duplicatas: seguro(() => repo.contar('gx_merge_sugestoes', { onde: "status = 'pendente'" })),
        lgpd_vencidas: seguro(() => require('./lgpd').vencidas().length),
        conteudo_aguardando: seguro(() => repo.contar('gx_conteudos', { onde: "status = 'revisao'" })),
        avaliacoes_sem_resposta: seguro(() => repo.contar('gx_avaliacoes_publicas', { onde: "sentimento = 'negativo' AND resposta = ''" })),
      },
      numeros: {
        contatos: seguro(() => repo.contar('crm_contatos')),
        conversas_abertas: seguro(() => repo.contar('gx_conversas', { onde: "status = 'aberta'" })),
        automacoes: seguro(() => repo.contar('gx_workflows', { onde: "status = 'publicado'" })),
        agendamentos: seguro(() => repo.contar('gx_agendamentos', { onde: "status = 'confirmado'" })),
      },
    };
  }));

  // ---- inbox ----
  app.get(`${B}/inbox`, ...rota((req) => {
    const conversas = require('./conversas');
    return {
      conversas: conversas.caixa({ status: req.query.status || 'aberta', canal: req.query.canal || '', busca: req.query.busca || '' }),
      filas: conversas.filas(),
      sla_em_risco: conversas.slaEmRisco(),
      canais: require('./canais').conexoes(),
    };
  }, { flag: 'inbox' }));

  app.get(`${B}/inbox/:id`, ...rota((req, res) => {
    const c = require('./conversas').conversa(req.params.id);
    if (!c) { res.status(404).json({ erro: 'Conversa não encontrada.' }); return undefined; }
    return c;
  }, { flag: 'inbox' }));

  app.post(`${B}/inbox/:id/responder`, ...rota((req, res, a) => {
    rbac.exigir('inbox.responder');
    return require('./conversas').responder(req.params.id, Object.assign({}, req.body || {}, { autorId: a.id }));
  }, { flag: 'inbox' }));

  app.post(`${B}/inbox/:id/digitando`, ...rota((req, res, a) =>
    require('./conversas').assumirDigitacao(req.params.id, a.id), { flag: 'inbox' }));

  // ---- automações ----
  app.get(`${B}/automacoes`, ...rota(() => {
    const automacoes = require('./automacoes');
    return {
      automacoes: automacoes.listar(), gatilhos: automacoes.GATILHOS,
      execucoes: automacoes.execucoes(null, 30),
      // o construtor precisa saber o que existe para oferecer
      acoes: Object.fromEntries(Object.entries(automacoes.ACOES).map(([k, v]) => [k, v.rotulo])),
      tipos_no: automacoes.TIPOS_NO,
    };
  }, { flag: 'automacoes' }));

  app.get(`${B}/automacoes/:id`, ...rota((req, res) => {
    const automacoes = require('./automacoes');
    const wf = repo.buscar('gx_workflows', req.params.id);
    if (!wf) { res.status(404).json({ erro: 'Automação não encontrada.' }); return undefined; }
    const versoes = repo.listar('gx_workflow_versoes', {
      onde: 'workflow_id = :w', params: { w: wf.id }, ordem: 'versao DESC', limite: 20,
    });
    const rascunho = versoes.find((v) => Number(v.versao) === Number(wf.versao_rascunho));
    return {
      workflow: wf,
      rascunho: rascunho ? j.parse(rascunho.definicao, { nos: [] }) : { nos: [] },
      versoes: versoes.map((v) => ({ versao: v.versao, publicada_em: v.publicada_em, notas: v.notas })),
      execucoes: automacoes.execucoes(wf.id, 30),
    };
  }, { flag: 'automacoes' }));

  app.post(`${B}/automacoes`, ...rota((req) => {
    rbac.exigir('automacao.editar');
    return require('./automacoes').criar(req.body || {});
  }, { flag: 'automacoes' }));

  app.put(`${B}/automacoes/:id/rascunho`, ...rota((req) => {
    rbac.exigir('automacao.editar');
    return require('./automacoes').salvarRascunho(req.params.id, (req.body || {}).definicao || { nos: [] });
  }, { flag: 'automacoes' }));

  app.post(`${B}/automacoes/:id/publicar`, ...rota((req) => {
    rbac.exigir('automacao.publicar');
    return require('./automacoes').publicar(req.params.id, { notas: (req.body || {}).notas || '' });
  }, { flag: 'automacoes' }));

  app.post(`${B}/automacoes/:id/reverter`, ...rota((req) => {
    rbac.exigir('automacao.publicar');
    return require('./automacoes').reverter(req.params.id, (req.body || {}).versao);
  }, { flag: 'automacoes' }));

  app.post(`${B}/automacoes/:id/pausar`, ...rota((req) => {
    rbac.exigir('automacao.publicar');
    return require('./automacoes').pausar(req.params.id);
  }, { flag: 'automacoes' }));

  // Simular NÃO executa nada: mostra o caminho que percorreria.
  app.post(`${B}/automacoes/:id/simular`, ...rota((req) =>
    require('./automacoes').simular(req.params.id, req.body || {}), { flag: 'automacoes' }));

  // ---- agentes ----
  app.get(`${B}/agentes`, ...rota(() => {
    const agentes = require('./agentes');
    return {
      agentes: agentes.listar().map((x) => agentes.metricas(x.chave)),
      llm_disponivel: agentes.temChaveLLM(),
      conhecimento: require('./conhecimento').listar(50),
      catalogo: agentes.CATALOGO,
      niveis: require('./aprovacoes').NIVEIS,
      ferramentas: Object.fromEntries(Object.entries(agentes.FERRAMENTAS)
        .map(([k, v]) => [k, { escrita: !!v.escrita, acao: v.acao || null }])),
    };
  }, { flag: 'ia' }));

  app.get(`${B}/agentes/:chave`, ...rota((req, res) => {
    const agentes = require('./agentes');
    const ag = agentes.porChave(req.params.chave);
    if (!ag) { res.status(404).json({ erro: 'Agente não encontrado.' }); return undefined; }
    return {
      agente: ag, metricas: agentes.metricas(ag.chave),
      versao: agentes.versaoAtual(ag),
      execucoes: agentes.execucoes(ag.chave),
    };
  }, { flag: 'ia' }));

  app.post(`${B}/agentes/provisionar`, ...rota(() => {
    rbac.exigir('agente.configurar');
    return { criados: require('./agentes').provisionar() };
  }, { flag: 'ia' }));

  app.put(`${B}/agentes/:chave`, ...rota((req) => {
    rbac.exigir('agente.configurar');
    return require('./agentes').configurar(req.params.chave, req.body || {});
  }, { flag: 'ia' }));

  app.post(`${B}/agentes/:chave/prompt`, ...rota((req) => {
    rbac.exigir('agente.configurar');
    return require('./agentes').publicarPrompt(req.params.chave, req.body || {});
  }, { flag: 'ia' }));

  // ---- base de conhecimento (o que o agente pode citar) ----
  app.post(`${B}/conhecimento`, ...rota((req) => {
    rbac.exigir('agente.configurar');
    return require('./conhecimento').criar(req.body || {});
  }, { flag: 'ia' }));

  app.post(`${B}/conhecimento/:id/aprovar`, ...rota((req) => {
    rbac.exigir('agente.configurar');
    return require('./conhecimento').aprovar(req.params.id);
  }, { flag: 'ia' }));

  // ---- conteúdo ----
  app.get(`${B}/conteudo`, ...rota((req) => {
    const conteudo = require('./conteudo');
    return Object.assign(
      conteudo.calendario({ de: req.query.de || '', ate: req.query.ate || '', status: req.query.status || '' }),
      { redes: conteudo.REDES, formatos: conteudo.FORMATOS, status_possiveis: conteudo.STATUS,
        limite_legenda: conteudo.LIMITE_LEGENDA }
    );
  }, { flag: 'redes_sociais' }));

  app.get(`${B}/conteudo/:id`, ...rota((req, res) => {
    const conteudo = require('./conteudo');
    const c = repo.buscar('gx_conteudos', req.params.id);
    if (!c) { res.status(404).json({ erro: 'Conteúdo não encontrado.' }); return undefined; }
    return {
      conteudo: c,
      variacoes: conteudo.variacoes(c.id),
      problemas: conteudo.validar(c),
      disponibilidade: conteudo.formatosDisponiveis(),
      publicacoes: repo.listar('gx_publicacoes', { onde: 'conteudo_id = :c', params: { c: c.id }, limite: 20 }),
    };
  }, { flag: 'redes_sociais' }));

  app.post(`${B}/conteudo`, ...rota((req) => {
    rbac.exigir('conteudo.criar');
    return require('./conteudo').criar(req.body || {});
  }, { flag: 'redes_sociais' }));

  app.put(`${B}/conteudo/:id`, ...rota((req) => {
    rbac.exigir('conteudo.criar');
    return require('./conteudo').atualizar(req.params.id, req.body || {});
  }, { flag: 'redes_sociais' }));

  app.post(`${B}/conteudo/:id/variacao`, ...rota((req) => {
    rbac.exigir('conteudo.criar');
    return require('./conteudo').definirVariacao(req.params.id, (req.body || {}).rede, req.body || {});
  }, { flag: 'redes_sociais' }));

  app.post(`${B}/conteudo/:id/mover`, ...rota((req) => {
    rbac.exigir('conteudo.criar');
    return require('./conteudo').mover(req.params.id, (req.body || {}).status);
  }, { flag: 'redes_sociais' }));

  app.post(`${B}/conteudo/:id/aprovar`, ...rota((req) => {
    rbac.exigir('conteudo.aprovar');
    return require('./conteudo').aprovar(req.params.id);
  }, { flag: 'redes_sociais' }));

  // Agendar só oferece rede que a conexão aceita — a recusa vem do módulo,
  // com o motivo dela, e a tela mostra tal como veio.
  app.post(`${B}/conteudo/:id/agendar`, ...rota((req) => {
    rbac.exigir('conteudo.publicar');
    return require('./conteudo').agendar(req.params.id, req.body || {});
  }, { flag: 'redes_sociais' }));

  app.get(`${B}/comunidade`, ...rota((req) => {
    const comunidade = require('./comunidade');
    return { interacoes: comunidade.caixa({ fila: req.query.fila || '' }), panorama: comunidade.panorama() };
  }, { flag: 'redes_sociais' }));

  // ---- anúncios e atribuição ----
  app.get(`${B}/anuncios`, ...rota((req) => {
    const anuncios = require('./anuncios');
    return {
      contas: anuncios.contas(),
      desempenho: anuncios.desempenho({ de: req.query.de, ate: req.query.ate }),
      alertas: anuncios.alertas(),
      alteracoes: anuncios.alteracoes(30),
      plataformas: anuncios.PLATAFORMAS,
      campanhas: repo.listar('gx_campanhas_anuncio', { ordem: 'criado_em DESC', limite: 100 }),
    };
  }, { flag: 'anuncios' }));

  app.post(`${B}/anuncios/contas`, ...rota((req) => {
    rbac.exigir('ads.editar');
    return require('./anuncios').conectarConta(req.body || {});
  }, { flag: 'anuncios' }));

  app.put(`${B}/anuncios/contas/:id/teto`, ...rota((req) => {
    rbac.exigir('ads.editar');
    return require('./anuncios').definirTeto(req.params.id, req.body || {});
  }, { flag: 'anuncios' }));

  app.post(`${B}/anuncios/campanhas`, ...rota((req) => {
    rbac.exigir('ads.editar');
    const b = req.body || {};
    return require('./anuncios').registrarCampanha(b.contaId, b);
  }, { flag: 'anuncios' }));

  // Mexer em orçamento NUNCA aplica direto: abre pedido de aprovação.
  app.post(`${B}/anuncios/orcamento`, ...rota((req, res, a) => {
    rbac.exigir('ads.orcamento.alterar');
    return require('./anuncios').solicitarAlteracao(Object.assign({}, req.body || {}, {
      origemTipo: 'usuario', origemId: a.id,
    }));
  }, { flag: 'anuncios' }));

  app.get(`${B}/atribuicao`, ...rota((req) => {
    const atribuicao = require('./atribuicao');
    return {
      funil: atribuicao.funil({ de: req.query.de, ate: req.query.ate }),
      por_origem: atribuicao.porOrigem({ de: req.query.de, ate: req.query.ate }),
      limitacoes: atribuicao.limitacoes(),
    };
  }));

  // ---- reputação e reuniões ----
  app.get(`${B}/reputacao`, ...rota((req) => {
    const reputacao = require('./reputacao');
    return Object.assign({ pesquisas: reputacao.pesquisas() }, reputacao.painel({ de: req.query.de, ate: req.query.ate }));
  }, { flag: 'reputacao' }));

  app.get(`${B}/reunioes`, ...rota((req) => {
    const reunioes = require('./reunioes');
    return { tipos: reunioes.tipos(), agenda: reunioes.agenda({ de: req.query.de, ate: req.query.ate }), indicadores: reunioes.indicadores({}) };
  }, { flag: 'reunioes' }));

  // ---- aprovações: a central que o §20 pede ----
  app.get(`${B}/aprovacoes`, ...rota(() => ({
    pendentes: require('./aprovacoes').pendentes(100),
    niveis: require('./aprovacoes').NIVEIS,
    // o painel avisa ANTES de aprovar quando a ação ainda não tem destino
    catalogo: require('./executor').catalogo(),
    historico: repo.listar('gx_aprovacoes', {
      onde: "status != 'pendente'", ordem: 'decidido_em DESC, criado_em DESC', limite: 20,
    }),
  })));

  app.post(`${B}/aprovacoes/:id/decidir`, ...rota((req, res, a) => {
    rbac.exigir('aprovacao.decidir');
    return require('./aprovacoes').decidir(req.params.id, Object.assign({}, req.body || {}, { quem: a.id }));
  }));

  // ---- conexões e credenciais ----
  // O corpo do POST carrega o token do assinante. Ele entra no cofre e não
  // volta nunca: a resposta traz metadados e o resultado do teste de saúde.
  app.get(`${B}/conexoes`, ...rota(() => {
    const canais = require('./canais');
    const segredos = require('./segredos');
    const conexoes = canais.conexoes();
    const meta = segredos.listar({ escopo: 'conexao' });
    return {
      conexoes: conexoes.map((c) => Object.assign({}, c, {
        credenciais: meta.filter((m) => m.ref_id === c.id),
      })),
      vencendo: segredos.vencendo(15),
      integracoes: require('./conectores').panorama(),
    };
  }));

  app.post(`${B}/conexoes/:id/credencial`, ...rota((req, res, a) => {
    rbac.exigir('integracao.conectar');
    const b = req.body || {};
    const r = require('./segredos').rotacionarCredencial({
      escopo: 'conexao', refId: req.params.id,
      chave: b.chave || 'access_token', valor: b.valor, expiraEm: b.expiraEm || '',
    });
    void a;
    return r;   // { id, primeira_vez, saude } — nunca o valor
  }));

  app.post(`${B}/conexoes/:id/saude`, ...rota((req) => require('./canais').verificarSaude(req.params.id)));

  // ---- segundo fator (MFA) ----
  // Sempre do PRÓPRIO usuário logado: não existe rota para ligar/desligar
  // MFA de outra pessoa. Nem o dono da conta faz isso pelo painel.
  app.get(`${B}/mfa`, ...rota((req, res, a) => require('./mfa').estado(a.id)));

  app.post(`${B}/mfa/iniciar`, ...rota((req, res, a) =>
    require('./mfa').iniciar({ userId: a.id, email: a.email })));

  app.post(`${B}/mfa/confirmar`, ...rota((req, res, a) =>
    require('./mfa').confirmar({ userId: a.id, codigo: (req.body || {}).codigo })));

  app.post(`${B}/mfa/recuperacao`, ...rota((req, res, a) => {
    const mfa = require('./mfa');
    if (!mfa.estado(a.id).ativo) { const e = new Error('Ative o segundo fator antes de gerar códigos.'); e.status = 409; throw e; }
    return { recuperacao: mfa.gerarRecuperacao(a.id) };
  }));

  // Desligar exige a SENHA: sessão aberta num computador emprestado não
  // pode bastar para remover o segundo fator.
  app.post(`${B}/mfa/desativar`, ...rota((req, res, a) => {
    const bcrypt = require('bcryptjs');
    const { db } = require('../crm/db');
    const u = db.prepare('SELECT senha_hash FROM tenant_users WHERE id = ?').get(a.id);
    if (!u || !u.senha_hash || !bcrypt.compareSync(String((req.body || {}).senha || ''), u.senha_hash)) {
      const e = new Error('Senha incorreta.'); e.status = 401; throw e;
    }
    return require('./mfa').desativar({ userId: a.id });
  }));

  // ---- assinatura e marca ----
  app.get(`${B}/assinatura`, ...rota(() => require('./comercial').minhaAssinatura()));

  app.post(`${B}/onboarding/:passo/dispensar`, ...rota((req) =>
    require('./comercial').dispensarPasso(req.params.passo, req.body || {})));
}

module.exports = { registrarRotasAssinante };
