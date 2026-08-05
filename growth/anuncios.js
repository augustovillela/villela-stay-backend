// =====================================================================
// Villela Growth OS — anúncios e travas de gasto (§15 do PROMPT_MASTER).
//
// A frase que governa este arquivo: **a IA pode recomendar, mas não
// aumenta gasto sem autorização expressa e registrada.**
//
// Por isso NENHUM caminho aqui altera orçamento direto. Toda alteração
// vira um registro em gx_orcamento_alteracoes com justificativa, passa
// pelos tetos da conta e da campanha, e só é aplicada depois de aprovada
// na central. Vale para pessoa, agente e automação — sem exceção.
//
// A importação de campanhas e métricas depende de conta aprovada nas
// plataformas; enquanto não sair, o conector lança 501 e a sincronização
// registra a pendência em vez de inventar número.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const aprovacoes = require('./aprovacoes');
const entitlements = require('./entitlements');
const canais = require('./canais');
const { nowISO, j } = require('./db');

const PLATAFORMAS = { meta_ads: 'Meta Ads', google_ads: 'Google Ads', linkedin_ads: 'LinkedIn Ads', tiktok_ads: 'TikTok Ads' };

// Acima disso, a alteração é tratada como anomalia mesmo que dentro do teto.
const VARIACAO_ANOMALA_PCT = Number(process.env.GROWTH_ADS_ANOMALIA_PCT || 50);

// ------------------------------------------------------------ contas

function conectarConta({ plataforma, nome, contaExternaId = '', tetoDiarioCent = 0, tetoMensalCent = 0 }) {
  if (!PLATAFORMAS[plataforma]) throw erro(400, `Plataforma desconhecida: ${plataforma}`);
  if (!nome) throw erro(400, 'A conta de anúncio precisa de um nome.');
  entitlements.exigirFlag('anuncios');
  entitlements.exigirDentroDoLimite('contas_anuncio', repo.contar('gx_contas_anuncio'));

  const cap = canais.capacidades(plataforma);
  const id = repo.inserir('gx_contas_anuncio', {
    plataforma, nome, conta_externa_id: contaExternaId,
    conexao_id: cap.conexaoId || '',
    status: cap.conectado ? 'ativa' : 'pendente',
    teto_diario_cent: Number(tetoDiarioCent) || 0,
    teto_mensal_cent: Number(tetoMensalCent) || 0,
  });
  repo.auditar({ acao: 'ads.conta_conectada', entidade: 'gx_contas_anuncio', entidadeId: id, detalhe: `${plataforma}: ${nome}` });
  return repo.buscar('gx_contas_anuncio', id);
}

const contas = () => repo.listar('gx_contas_anuncio', { ordem: 'plataforma ASC, nome ASC' })
  .map((c) => Object.assign({}, c, { capacidade: canais.capacidades(c.plataforma) }));

function definirTeto(contaId, { diarioCent, mensalCent }) {
  const c = repo.buscar('gx_contas_anuncio', contaId);
  if (!c) throw erro(404, 'Conta de anúncio não encontrada.');
  const patch = {};
  if (diarioCent !== undefined) patch.teto_diario_cent = Number(diarioCent) || 0;
  if (mensalCent !== undefined) patch.teto_mensal_cent = Number(mensalCent) || 0;
  repo.atualizar('gx_contas_anuncio', contaId, patch);
  repo.auditar({ acao: 'ads.teto_definido', entidade: 'gx_contas_anuncio', entidadeId: contaId, detalhe: j.str(patch) });
  return repo.buscar('gx_contas_anuncio', contaId);
}

// -------------------------------------------------------- importação

/**
 * Sincroniza campanhas e métricas. Depende do conector — que hoje lança
 * 501. A falha é REGISTRADA como pendência, não engolida: conta que não
 * sincroniza há dias é problema, e o painel precisa mostrar isso.
 */
async function sincronizar(contaId, { dias = 7 } = {}) {
  const conta = repo.buscar('gx_contas_anuncio', contaId);
  if (!conta) throw erro(404, 'Conta de anúncio não encontrada.');

  const conector = require('./conectores').obter(conta.plataforma);
  if (!conector) throw erro(404, `Sem conector para ${conta.plataforma}.`);

  try {
    const campanhas = await conector.importarCampanhas({ conexaoId: conta.conexao_id, contaExternaId: conta.conta_externa_id });
    for (const c of (campanhas || [])) registrarCampanha(contaId, c);

    const metricas = await conector.importarMetricas({ conexaoId: conta.conexao_id, dias });
    for (const m of (metricas || [])) registrarMetrica(contaId, m);

    repo.atualizar('gx_contas_anuncio', contaId, { ultima_sync: nowISO(), status: 'ativa' });
    return { ok: true, campanhas: (campanhas || []).length, metricas: (metricas || []).length };
  } catch (e) {
    // 501 = conector ainda é contrato. Não é falha de operação, é pendência.
    const pendente = e.status === 501;
    repo.atualizar('gx_contas_anuncio', contaId, { status: pendente ? 'pendente' : 'sem_acesso' });
    if (!pendente) {
      require('./incidentes').abrir({
        natureza: 'integracao', severidade: 'media',
        titulo: `Sincronização de ${PLATAFORMAS[conta.plataforma]} falhou`,
        detalhe: e.message, refTipo: 'conta_anuncio', refId: contaId,
      });
    }
    return { ok: false, pendente, motivo: e.message };
  }
}

function registrarCampanha(contaId, c) {
  const ja = c.externaId
    ? repo.um('SELECT * FROM gx_campanhas_anuncio WHERE tenant_id = :tenant AND conta_id = :c AND externa_id = :e',
      { c: contaId, e: c.externaId })
    : null;
  const dados = {
    conta_id: contaId, externa_id: c.externaId || '', nome: c.nome || 'Sem nome',
    objetivo: c.objetivo || '', status: c.status || 'ativa',
    orcamento_cent: Number(c.orcamentoCent) || 0, orcamento_tipo: c.orcamentoTipo || 'diario',
    utm_campaign: c.utmCampaign || '', inicio: c.inicio || '', fim: c.fim || '',
    importada_em: nowISO(),
  };
  if (ja) { repo.atualizar('gx_campanhas_anuncio', ja.id, dados); return ja.id; }
  return repo.inserir('gx_campanhas_anuncio', dados);
}

function registrarMetrica(contaId, m) {
  const chave = { c: contaId, camp: m.campanhaId || '', an: m.anuncioId || '', d: m.dia };
  const ja = repo.um(
    'SELECT * FROM gx_metricas_anuncio WHERE tenant_id = :tenant AND conta_id = :c AND campanha_id = :camp AND anuncio_id = :an AND dia = :d',
    chave
  );
  const dados = {
    conta_id: contaId, campanha_id: m.campanhaId || '', anuncio_id: m.anuncioId || '', dia: m.dia,
    impressoes: Number(m.impressoes) || 0, cliques: Number(m.cliques) || 0,
    gasto_cent: Number(m.gastoCent) || 0, conversoes: Number(m.conversoes) || 0, leads: Number(m.leads) || 0,
    importado_em: nowISO(),
  };
  if (ja) { repo.atualizar('gx_metricas_anuncio', ja.id, dados); return ja.id; }
  return repo.inserir('gx_metricas_anuncio', dados);
}

// ------------------------------------------- alteração de orçamento

/**
 * O ÚNICO caminho para mexer em orçamento. Nunca aplica direto:
 *   1. calcula a variação e confere os tetos da conta e da campanha;
 *   2. exige justificativa;
 *   3. marca anomalia quando o salto é grande demais;
 *   4. abre pedido na central de aprovações;
 *   5. só `aplicar()` — depois de aprovado — muda o número.
 */
function solicitarAlteracao({ campanhaId, paraCent, justificativa = '', origemTipo = 'usuario', origemId = '' }) {
  const camp = repo.buscar('gx_campanhas_anuncio', campanhaId);
  if (!camp) throw erro(404, 'Campanha não encontrada.');
  const conta = repo.buscar('gx_contas_anuncio', camp.conta_id);
  if (!conta) throw erro(404, 'Conta de anúncio não encontrada.');

  const de = Number(camp.orcamento_cent) || 0;
  const para = Number(paraCent);
  if (!Number.isFinite(para) || para < 0) throw erro(400, 'Orçamento inválido.');
  if (!String(justificativa).trim()) throw erro(400, 'Alteração de orçamento exige justificativa.');

  const variacao = de > 0 ? Math.round(((para - de) / de) * 100) : (para > 0 ? 100 : 0);
  const aumenta = para > de;

  const registrar = (status, motivo, aprovacaoId = '') => repo.inserir('gx_orcamento_alteracoes', {
    conta_id: conta.id, campanha_id: campanhaId, de_cent: de, para_cent: para, variacao_pct: variacao,
    justificativa, origem_tipo: origemTipo, origem_id: origemId, status, motivo, aprovacao_id: aprovacaoId,
  });

  // teto da campanha
  if (camp.teto_cent && para > camp.teto_cent) {
    const id = registrar('bloqueada', `acima do teto da campanha (R$ ${(camp.teto_cent / 100).toFixed(2)})`);
    return { bloqueada: true, id, motivo: repo.buscar('gx_orcamento_alteracoes', id).motivo };
  }
  // teto diário da conta, somando as outras campanhas ativas
  if (conta.teto_diario_cent && aumenta) {
    const outras = repo.um(
      "SELECT COALESCE(SUM(orcamento_cent),0) AS total FROM gx_campanhas_anuncio " +
      "WHERE tenant_id = :tenant AND conta_id = :c AND status = 'ativa' AND id != :id",
      { c: conta.id, id: campanhaId }
    );
    const totalPrevisto = (outras ? Number(outras.total) : 0) + para;
    if (totalPrevisto > conta.teto_diario_cent) {
      const id = registrar('bloqueada',
        `o total diário da conta ficaria em R$ ${(totalPrevisto / 100).toFixed(2)}, acima do teto de R$ ${(conta.teto_diario_cent / 100).toFixed(2)}`);
      return { bloqueada: true, id, motivo: repo.buscar('gx_orcamento_alteracoes', id).motivo };
    }
  }

  const anomala = aumenta && Math.abs(variacao) >= VARIACAO_ANOMALA_PCT;

  // aumentar gasto é SEMPRE nível 3 — nem o nível do autor muda isso
  const pedido = aprovacoes.solicitar({
    acao: aumenta ? 'anuncio.orcamento_alterar' : 'anuncio.criar',
    titulo: `${aumenta ? 'Aumentar' : 'Reduzir'} orçamento: ${camp.nome}`,
    justificativa,
    dados: { campanhaId, de_cent: de, para_cent: para, variacao_pct: variacao, anomala },
    impacto: `${variacao > 0 ? '+' : ''}${variacao}% · de R$ ${(de / 100).toFixed(2)} para R$ ${(para / 100).toFixed(2)}`,
    custoCentavos: Math.max(0, para - de),
    origemTipo, origemId,
  });

  const id = registrar('aguardando', anomala ? `variação de ${variacao}% — acima do normal` : '', pedido.id);
  if (anomala) {
    eventos.publicar('ad_budget_threshold_reached', {
      refTipo: 'campanha_anuncio', refId: campanhaId,
      payload: { variacao_pct: variacao, de_cent: de, para_cent: para, origem_tipo: origemTipo },
      chaveIdem: `anomalia:${id}`,
    });
  }
  return { bloqueada: false, id, aprovacaoId: pedido.id, anomala, variacao };
}

/** Aplica a alteração já aprovada. Chamado pelo executor da aprovação. */
function aplicarAlteracao(alteracaoId) {
  const a = repo.buscar('gx_orcamento_alteracoes', alteracaoId);
  if (!a) throw erro(404, 'Alteração não encontrada.');
  if (a.status !== 'aguardando') throw erro(409, `Esta alteração já está "${a.status}".`);
  const aprov = a.aprovacao_id ? repo.buscar('gx_aprovacoes', a.aprovacao_id) : null;
  if (!aprov || !['aprovada', 'executada'].includes(aprov.status)) {
    throw erro(403, 'Alteração de orçamento sem aprovação registrada — bloqueada.');
  }
  repo.atualizar('gx_campanhas_anuncio', a.campanha_id, { orcamento_cent: a.para_cent });
  repo.atualizar('gx_orcamento_alteracoes', alteracaoId, { status: 'aplicada', aplicada_em: nowISO() });
  repo.auditar({
    acao: 'ads.orcamento_alterado', entidade: 'gx_campanhas_anuncio', entidadeId: a.campanha_id,
    detalhe: `R$ ${(a.de_cent / 100).toFixed(2)} → R$ ${(a.para_cent / 100).toFixed(2)} · ${a.justificativa}`,
  });
  return repo.buscar('gx_orcamento_alteracoes', alteracaoId);
}

const alteracoes = (limite = 100) =>
  repo.listar('gx_orcamento_alteracoes', { ordem: 'criado_em DESC', limite });

// ---------------------------------------------------- desempenho

/** Consolida o período. Sem dado importado, devolve zero — não estimativa. */
function desempenho({ de, ate } = {}) {
  const ini = de || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const fim = ate || nowISO().slice(0, 10);
  const linhas = repo.q(
    'SELECT campanha_id, SUM(impressoes) AS impressoes, SUM(cliques) AS cliques, SUM(gasto_cent) AS gasto, ' +
    'SUM(conversoes) AS conversoes, SUM(leads) AS leads FROM gx_metricas_anuncio ' +
    'WHERE tenant_id = :tenant AND dia >= :ini AND dia <= :fim GROUP BY campanha_id',
    { ini, fim }
  );
  const total = linhas.reduce((a, l) => ({
    impressoes: a.impressoes + l.impressoes, cliques: a.cliques + l.cliques,
    gasto: a.gasto + l.gasto, conversoes: a.conversoes + l.conversoes, leads: a.leads + l.leads,
  }), { impressoes: 0, cliques: 0, gasto: 0, conversoes: 0, leads: 0 });

  const atribuicao = require('./atribuicao');
  const receita = atribuicao.receitaPorCampanha({ de: ini, ate: fim });

  return {
    periodo: { de: ini, ate: fim },
    total: Object.assign({}, total, {
      ctr: total.impressoes ? +(total.cliques / total.impressoes * 100).toFixed(2) : null,
      cpl_cent: total.leads ? Math.round(total.gasto / total.leads) : null,
    }),
    campanhas: linhas.map((l) => {
      const camp = repo.buscar('gx_campanhas_anuncio', l.campanha_id);
      const nome = camp ? camp.nome : l.campanha_id;
      const rec = receita[camp ? (camp.utm_campaign || camp.nome) : ''] || 0;
      return {
        campanha: nome, gasto_cent: l.gasto, leads: l.leads, conversoes: l.conversoes,
        cpl_cent: l.leads ? Math.round(l.gasto / l.leads) : null,
        receita_atribuida_cent: rec,
        roas: l.gasto ? +(rec / l.gasto).toFixed(2) : null,
      };
    }),
    aviso: linhas.length ? '' : 'Nenhuma métrica importada no período — as plataformas de anúncio ainda não estão conectadas.',
  };
}

/** Comparação com o período anterior de mesmo tamanho. */
function comparar({ de, ate }) {
  const d1 = new Date(de); const d2 = new Date(ate);
  const dias = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
  const antAte = new Date(d1.getTime() - 86400000).toISOString().slice(0, 10);
  const antDe = new Date(d1.getTime() - dias * 86400000).toISOString().slice(0, 10);
  const atual = desempenho({ de, ate });
  const anterior = desempenho({ de: antDe, ate: antAte });
  const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
  return {
    atual, anterior,
    variacao: {
      gasto_pct: delta(atual.total.gasto, anterior.total.gasto),
      leads_pct: delta(atual.total.leads, anterior.total.leads),
      cpl_pct: delta(atual.total.cpl_cent, anterior.total.cpl_cent),
    },
  };
}

/** Alertas do §15: o que merece olhar hoje. */
function alertas() {
  const out = [];
  for (const c of contas()) {
    if (c.teto_mensal_cent && c.gasto_mes_cent >= c.teto_mensal_cent * 0.8) {
      out.push({ tipo: 'teto_mensal', conta: c.nome, gravidade: 'alta',
        texto: `${c.nome} já usou ${Math.round(c.gasto_mes_cent / c.teto_mensal_cent * 100)}% do teto mensal.` });
    }
    if (c.status === 'sem_acesso') {
      out.push({ tipo: 'sem_acesso', conta: c.nome, gravidade: 'alta', texto: `Perdemos acesso à conta ${c.nome}.` });
    }
    if (c.ultima_sync && (Date.now() - new Date(c.ultima_sync).getTime()) > 2 * 86400000) {
      out.push({ tipo: 'sync_atrasada', conta: c.nome, gravidade: 'media',
        texto: `${c.nome} não sincroniza desde ${c.ultima_sync.slice(0, 10)}.` });
    }
  }
  const pendentes = repo.listar('gx_orcamento_alteracoes', { onde: "status = 'aguardando'", limite: 50 });
  if (pendentes.length) {
    out.push({ tipo: 'aprovacao_pendente', gravidade: 'media',
      texto: `${pendentes.length} alteração(ões) de orçamento aguardando aprovação.` });
  }
  return out;
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  PLATAFORMAS, VARIACAO_ANOMALA_PCT,
  conectarConta, contas, definirTeto, sincronizar, registrarCampanha, registrarMetrica,
  solicitarAlteracao, aplicarAlteracao, alteracoes, desempenho, comparar, alertas,
};
