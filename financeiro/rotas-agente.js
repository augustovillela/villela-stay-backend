// =====================================================================
// Villela Finance — porta do AGENTE (`x-publish-key`), deliberadamente
// estreita.
//
// O resto do módulo só aceita usuário autenticado com perfil, porque é
// disso que dependem a segregação de funções e a alçada. Mas a casa opera
// por rotinas e agentes (é a regra 9 do CLAUDE.md da raiz), e sem uma
// porta para eles a sincronização da Stays dependeria de alguém logar
// todo dia.
//
// A porta existe com TRÊS travas, e o selftest tenta furar as três:
//
//   1. só tenant marcado `interno` — a chave é do grupo, e nunca pode
//      alcançar dado de assinante pagante;
//   2. só ações de NÍVEL ≤ 2 (importar, conciliar, sincronizar). Pagar,
//      estornar, fechar, reabrir e mexer em dado bancário continuam
//      exigindo pessoa com alçada. A trava é o catálogo do rbac.js, não
//      uma lista paralela que alguém esqueceria de atualizar;
//   3. tudo é auditado com `ator_tipo = 'agente'` — a ação tem autor,
//      ainda que o autor seja uma rotina.
//
// Admin do Portal Staff também entra por aqui (é o caminho de um clique
// para o Augusto, que já está logado lá).
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const stays = require('./stays');
const rbac = require('./rbac');
const contas = require('./contas');
const ledger = require('./ledger');
const auditoria = require('./auditoria');
const relatorios = require('./relatorios');
const { responderErro } = require('./rotas-app');

/** Nível máximo que a chave de agente pode acionar. */
const NIVEL_MAXIMO_AGENTE = rbac.NIVEIS.PREVIA;   // 2

/**
 * Confere no CATÁLOGO que a ação está dentro do teto. Ler do rbac.js (e
 * não de uma lista aqui) garante que promover uma ação a nível 3 no
 * futuro fecha esta porta automaticamente.
 */
function exigirNivelDeAgente(acao) {
  const nivel = rbac.nivelDe(acao);
  if (nivel > NIVEL_MAXIMO_AGENTE) {
    throw Object.assign(
      new Error(`A ação "${acao}" é de nível ${nivel} e exige uma pessoa com alçada — a chave de agente vai até o nível ${NIVEL_MAXIMO_AGENTE}.`),
      { status: 403 });
  }
  return nivel;
}

/** Resolve a conta interna do grupo. Nenhuma outra é alcançável por aqui. */
function tenantInterno(slug) {
  const t = slug ? repo.tenantPorSlug(slug) : repo.tenantPorSlug(contas.SLUG_INTERNO);
  if (!t) throw Object.assign(new Error('Conta não encontrada.'), { status: 404 });
  if (t.interno !== 1) {
    throw Object.assign(
      new Error('A chave de agente só alcança a conta interna do grupo. Dado de assinante exige sessão do próprio assinante.'),
      { status: 403 });
  }
  return t;
}

function registrarRotasAgente(app, { requirePublishOrAdmin, express }) {
  if (!requirePublishOrAdmin || !express) {
    throw new Error('financeiro/rotas-agente: faltam deps (requirePublishOrAdmin, express).');
  }
  const B = '/staff/api/finance/agente';
  const corpo = express.json({ limit: '1mb' });

  /** Envelope: abre contexto na conta interna, com ator de agente. */
  const rota = (acao, fn, { json: comJson = false } = {}) => {
    const meios = [requirePublishOrAdmin];
    if (comJson) meios.push(corpo);
    meios.push((req, res) => {
      try {
        exigirNivelDeAgente(acao);
        const t = tenantInterno(String(req.query.conta || (req.body || {}).conta || ''));
        const ator = req.viaChave ? 'agente/chave' : ((req.user && (req.user.email || req.user.nome)) || 'staff');

        const saida = tenancy.comTenant({
          tenantId: t.id, userId: ator, perfil: 'controller',
          correlationId: req.correlationId, ip: req.ip,
        }, () => {
          const empresas = repo.listarEntidades();
          const pedida = String(req.query.empresa || (req.body || {}).empresa || '');
          const entidade = (pedida && empresas.find(e => e.id === pedida)) || empresas[0] || null;
          if (!entidade) throw Object.assign(new Error('A conta interna não tem empresa cadastrada.'), { status: 400 });
          return tenancy.comEntidade(entidade.id, () => fn(req, res, { tenant: t, entidade, ator }));
        });

        if (saida && typeof saida.then === 'function') {
          return saida.then(v => { if (v !== undefined && !res.headersSent) res.json(v); })
            .catch(e => responderErro(res, e));
        }
        if (saida !== undefined && !res.headersSent) res.json(saida);
      } catch (e) { responderErro(res, e); }
    });
    return meios;
  };

  /** Prévia: não grava nada. É o passo obrigatório antes do primeiro real. */
  app.post(`${B}/stays/previa`, ...rota('transacao.importar', (req, _res, ctx) =>
    stays.sincronizar({
      entidadeId: ctx.entidade.id,
      competencia: String((req.body || {}).competencia || '').trim(),
      dryRun: true,
    }), { json: true }));

  app.post(`${B}/stays/sincronizar`, ...rota('lote.contabilizar', async (req, _res, ctx) => {
    const r = await stays.sincronizar({
      entidadeId: ctx.entidade.id,
      competencia: String((req.body || {}).competencia || '').trim(),
    });
    auditoria.registrar('stays.sincronizar.agente', {
      objetoTipo: 'competencia', objetoId: `${ctx.entidade.id}:${r.resumo.competencia}`,
      motivo: 'sincronização disparada por agente/rotina',
      atorTipo: req.viaChave ? 'agente' : 'usuario',
      detalhe: r.resumo,
    });
    return r;
  }, { json: true }));

  app.get(`${B}/stays/conferir`, ...rota('relatorio.ver', (req, _res, ctx) =>
    stays.conferir({
      entidadeId: ctx.entidade.id,
      competencia: String(req.query.competencia || new Date().toISOString().slice(0, 7)),
    })));

  /** Painel de saúde da conta interna, sem precisar de sessão de assinante. */
  app.get(`${B}/saude`, ...rota('relatorio.ver', (req, _res, ctx) => ({
    conta: ctx.tenant.slug,
    empresa: { id: ctx.entidade.id, nome: ctx.entidade.nome },
    razao: ledger.conferirBalanceamento(ctx.entidade.id),
    auditoria: auditoria.verificarCadeia(ctx.tenant.id),
    diario: require('./diario').status(),
    cockpit: relatorios.cockpit(ctx.entidade.id, String(req.query.competencia || new Date().toISOString().slice(0, 7))),
  })));

  /** Briefing do CFO — leitura (nível 0), para rotinas e para o staff. */
  app.get(`${B}/cfo/briefing`, ...rota('relatorio.ver', (req, _res, ctx) =>
    require('./cfo').briefing(ctx.entidade.id, String(req.query.competencia || new Date().toISOString().slice(0, 7)))));

  /** Conselho dos Mestres — mesma montagem da porta do assinante. */
  app.get(`${B}/conselho`, ...rota('relatorio.ver', (req, _res, ctx) =>
    require('./conselho').montarPara(ctx.entidade.id, String(req.query.competencia || new Date().toISOString().slice(0, 7)))));

  /**
   * Força a replicação do diário e devolve o resultado — inclusive as
   * falhas. É o que permite descobrir que o RPO parou de valer sem ter de
   * abrir o log do servidor.
   */
  app.post(`${B}/diario/replicar`, ...rota('diario.replicar', async () => {
    const r = await require('./diario').replicar();
    return { replicacao: r, status: require('./diario').status() };
  }, { json: true }));

  /**
   * Prova viva do teto: a rota existe para que o teste (e quem auditar)
   * confirme que uma ação material é recusada mesmo com a chave certa.
   */
  app.post(`${B}/teste-de-teto`, ...rota('pagamento.executar', () => ({ jamais: true }), { json: true }));
}

module.exports = { registrarRotasAgente, exigirNivelDeAgente, tenantInterno, NIVEL_MAXIMO_AGENTE };
