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
    return { automacoes: automacoes.listar(), gatilhos: automacoes.GATILHOS, execucoes: automacoes.execucoes(null, 30) };
  }, { flag: 'automacoes' }));

  // ---- agentes ----
  app.get(`${B}/agentes`, ...rota(() => {
    const agentes = require('./agentes');
    return {
      agentes: agentes.listar().map((x) => agentes.metricas(x.chave)),
      llm_disponivel: agentes.temChaveLLM(),
      conhecimento: require('./conhecimento').listar(50),
    };
  }, { flag: 'ia' }));

  // ---- conteúdo ----
  app.get(`${B}/conteudo`, ...rota((req) =>
    require('./conteudo').calendario({ de: req.query.de || '', ate: req.query.ate || '' }), { flag: 'redes_sociais' }));

  app.get(`${B}/comunidade`, ...rota((req) => {
    const comunidade = require('./comunidade');
    return { interacoes: comunidade.caixa({ fila: req.query.fila || '' }), panorama: comunidade.panorama() };
  }, { flag: 'redes_sociais' }));

  // ---- anúncios e atribuição ----
  app.get(`${B}/anuncios`, ...rota((req) => {
    const anuncios = require('./anuncios');
    return { contas: anuncios.contas(), desempenho: anuncios.desempenho({ de: req.query.de, ate: req.query.ate }), alertas: anuncios.alertas() };
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
