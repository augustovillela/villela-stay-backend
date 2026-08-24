// =====================================================================
// Villela Finance — CFO inteligente: o que exige atenção, e por quê.
//
// Tudo aqui é DETERMINÍSTICO. Nenhuma anomalia vem de modelo: cada uma é
// uma regra que se pode ler, conferir e discordar. IA generativa pode um
// dia redigir o texto do briefing; ela não decide o que é anomalia.
//
// Toda constatação carrega o mesmo esqueleto, e o esqueleto é a parte
// importante:
//
//   fatos ....... os números que a acionaram, não a conclusão
//   premissa .... o que foi assumido para chegar nela
//   confianca ... 0-100, com o motivo da incerteza
//   horizonte ... quando isso importa
//   acao ........ o que fazer, específico
//   invalidaSe .. O QUE FARIA ESTA CONSTATAÇÃO DEIXAR DE VALER
//
// O último campo é o que separa análise de palpite. Uma constatação que
// não sabe dizer o que a derrubaria não deveria estar na tela.
// =====================================================================
'use strict';
const { nowISO } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');
const caixa = require('./caixa');
const titulos = require('./titulos');
const relatorios = require('./relatorios');
const planoContas = require('./plano-contas');

const GRAVIDADE = { critica: 3, alta: 2, media: 1, informativa: 0 };

/** Competência N meses antes. */
function mesAntes(competencia, n) {
  const [a, m] = competencia.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}
const intervaloDe = (competencia) => relatorios.intervalo(competencia);

/** Média e desvio de uma amostra. Sem amostra, devolve null — não zero. */
function estatistica(valores) {
  if (!valores.length) return null;
  const media = valores.reduce((s, v) => s + v, 0) / valores.length;
  const variancia = valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length;
  return { n: valores.length, media, desvio: Math.sqrt(variancia) };
}

/**
 * Série mensal de uma conta: saldo por competência, nos N meses antes da
 * competência corrente (exclusive).
 */
function serie(entidadeId, contaId, competencia, meses = 6) {
  const out = [];
  for (let i = meses; i >= 1; i--) {
    const comp = mesAntes(competencia, i);
    const { desde, ate } = intervaloDe(comp);
    out.push({ competencia: comp, valorCents: ledger.saldo(contaId, { desde, ate }).saldoCents });
  }
  return out;
}

// =====================================================================
// Detectores. Cada um devolve zero ou mais constatações.
// =====================================================================

/** Despesa muito acima do próprio histórico da conta. */
function despesaForaDoPadrao(entidadeId, competencia, { desvios = 2, minimoMeses = 3, pisoCents = 20000 } = {}) {
  const { desde, ate } = intervaloDe(competencia);
  const doMes = ledger.balancete(entidadeId, { desde, ate }).linhas
    .filter(l => l.natureza === 'despesa' && l.saldoCents >= pisoCents);

  const achados = [];
  for (const conta of doMes) {
    const historico = serie(entidadeId, conta.contaId, competencia).filter(p => p.valorCents > 0);
    const est = estatistica(historico.map(p => p.valorCents));
    // Sem histórico suficiente não se declara anomalia — declara-se que
    // não dá para saber ainda.
    if (!est || est.n < minimoMeses) continue;
    const limite = est.media + desvios * est.desvio;
    if (conta.saldoCents <= limite || conta.saldoCents <= est.media * 1.2) continue;

    const excesso = conta.saldoCents - Math.round(est.media);
    achados.push({
      tipo: 'despesa_fora_do_padrao',
      gravidade: excesso > est.media ? 'alta' : 'media',
      titulo: `${conta.nome} está ${Math.round(100 * excesso / est.media)}% acima da média`,
      fatos: {
        conta: `${conta.codigo} ${conta.nome}`,
        noMes: dinheiro.formatar(conta.saldoCents),
        mediaDosUltimos: dinheiro.formatar(Math.round(est.media)),
        mesesNaAmostra: est.n,
        excesso: dinheiro.formatar(excesso),
        serie: historico.map(p => ({ competencia: p.competencia, valor: dinheiro.formatar(p.valorCents) })),
      },
      premissa: `os ${est.n} meses anteriores com movimento representam o padrão desta conta`,
      confianca: Math.min(90, 40 + est.n * 10),
      motivoDaIncerteza: est.n < 6 ? `amostra curta (${est.n} meses)` : 'variação natural da conta',
      horizonte: 'este mês',
      acao: `Abrir o razão de ${conta.codigo} no mês e conferir se há lançamento duplicado, competência errada ou reajuste real.`,
      drill: { tipo: 'razao', contaId: conta.contaId, desde, ate },
      invalidaSe: 'houve reajuste contratual, o mês concentra uma despesa anual (IPTU, seguro) ou a série anterior está incompleta por lançamento pendente.',
    });
  }
  return achados;
}

/** Duas saídas do mesmo valor para a mesma contraparte em janela curta. */
function possivelDuplicidade(entidadeId, competencia, { janelaDias = 10 } = {}) {
  const { desde, ate } = intervaloDe(competencia);
  const linhas = repo.q(
    `SELECT t.contraparte_id, c.nome AS contraparte, t.valor_cents, t.id, t.documento, t.competencia, t.criado_em,
            (SELECT MIN(p.vencimento) FROM fin_parcelas p WHERE p.tenant_id = t.tenant_id AND p.titulo_id = t.id) AS venc
       FROM fin_titulos t
       LEFT JOIN fin_contrapartes c ON c.id = t.contraparte_id AND c.tenant_id = t.tenant_id
      WHERE t.tenant_id = :tenant AND t.entidade_id = :ent AND t.especie = 'pagar'
        AND t.status <> 'cancelado' AND t.competencia = :comp`,
    { ent: entidadeId, comp: competencia });

  const porChave = new Map();
  for (const l of linhas) {
    const chave = `${l.contraparte_id}|${l.valor_cents}`;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave).push(l);
  }

  const achados = [];
  for (const [, grupo] of porChave) {
    if (grupo.length < 2) continue;
    const datas = grupo.map(g => g.venc || g.criado_em.slice(0, 10)).sort();
    const dias = Math.round((Date.parse(datas[datas.length - 1]) - Date.parse(datas[0])) / 86400000);
    if (dias > janelaDias) continue;
    // Documentos diferentes reduzem a suspeita: é comum o mesmo fornecedor
    // emitir duas notas iguais no mesmo mês (duas casas, dois serviços).
    const documentos = [...new Set(grupo.map(g => g.documento).filter(Boolean))];
    achados.push({
      tipo: 'possivel_duplicidade',
      gravidade: documentos.length <= 1 ? 'alta' : 'media',
      titulo: `${grupo.length} títulos iguais de ${grupo[0].contraparte || 'fornecedor sem cadastro'}`,
      fatos: {
        contraparte: grupo[0].contraparte || '(sem cadastro)',
        valorCada: dinheiro.formatar(grupo[0].valor_cents),
        quantidade: grupo.length,
        intervaloDias: dias,
        documentos: documentos.length ? documentos : ['(sem número de documento)'],
        titulos: grupo.map(g => g.id),
      },
      premissa: 'mesmo fornecedor + mesmo valor + vencimentos próximos costuma ser a mesma nota lançada duas vezes',
      confianca: documentos.length <= 1 ? 75 : 45,
      motivoDaIncerteza: documentos.length > 1
        ? 'os documentos têm números diferentes, o que sugere notas distintas'
        : 'não há número de documento para distinguir',
      horizonte: 'antes do próximo pagamento',
      acao: 'Comparar as duas notas. Se for duplicidade, cancelar o título repetido (o cancelamento estorna a provisão).',
      drill: { tipo: 'titulos', ids: grupo.map(g => g.id) },
      invalidaSe: 'os documentos forem notas realmente diferentes (dois imóveis, duas competências ou dois serviços do mesmo valor).',
    });
  }
  return achados;
}

/** Despesa recorrente que parou de aparecer — o que falta também é sinal. */
function despesaRecorrenteAusente(entidadeId, competencia, { minimoMeses = 3 } = {}) {
  const contas = repo.listarContas(entidadeId, { somenteAnaliticas: true })
    .filter(c => c.natureza === 'despesa');
  const { desde, ate } = intervaloDe(competencia);

  const achados = [];
  for (const conta of contas) {
    const noMes = ledger.saldo(conta.id, { desde, ate }).saldoCents;
    if (noMes > 0) continue;
    const historico = serie(entidadeId, conta.id, competencia).filter(p => p.valorCents > 0);
    if (historico.length < minimoMeses) continue;
    // Só conta como recorrente se apareceu em quase todos os meses.
    if (historico.length < 5) continue;
    const est = estatistica(historico.map(p => p.valorCents));
    achados.push({
      tipo: 'despesa_recorrente_ausente',
      gravidade: 'media',
      titulo: `${conta.nome} não teve lançamento este mês`,
      fatos: {
        conta: `${conta.codigo} ${conta.nome}`,
        mesesComMovimento: est.n,
        mediaMensal: dinheiro.formatar(Math.round(est.media)),
        serie: historico.map(p => ({ competencia: p.competencia, valor: dinheiro.formatar(p.valorCents) })),
      },
      premissa: `uma conta com movimento em ${est.n} dos últimos 6 meses é recorrente`,
      confianca: 60,
      motivoDaIncerteza: 'a conta pode ter sido descontinuada de propósito',
      horizonte: 'fechamento deste mês',
      acao: 'Conferir se a nota chegou e não foi lançada. Despesa que falta infla o resultado do mês e some no seguinte.',
      drill: { tipo: 'razao', contaId: conta.id },
      invalidaSe: 'o contrato foi encerrado, o fornecedor mudou ou a cobrança passou a ser bimestral.',
    });
  }
  return achados;
}

/** Saldo parado nas contas "a classificar" — dinheiro sem dono contábil. */
function aClassificarComSaldo(entidadeId, competencia) {
  const { ate } = intervaloDe(competencia);
  const achados = [];
  for (const chave of ['entradaAClassificar', 'saidaAClassificar']) {
    let conta;
    try { conta = planoContas.chave(entidadeId, chave); } catch (_) { continue; }
    const saldo = ledger.saldo(conta.id, { ate }).saldoCents;
    if (!saldo) continue;
    achados.push({
      tipo: 'a_classificar_com_saldo',
      gravidade: 'alta',
      titulo: `${conta.nome}: ${dinheiro.formatar(saldo)} sem classificação`,
      fatos: { conta: `${conta.codigo} ${conta.nome}`, saldo: dinheiro.formatar(saldo) },
      premissa: 'nenhuma',
      confianca: 100,
      motivoDaIncerteza: '',
      horizonte: 'antes do fechamento',
      acao: 'Reclassificar por estorno e novo lançamento. Enquanto houver saldo aqui, o DRE está incompleto.',
      drill: { tipo: 'razao', contaId: conta.id, ate },
      invalidaSe: 'nada — saldo em conta-espera é sempre pendência, por definição.',
    });
  }
  return achados;
}

/** Concentração de receita: um imóvel ou canal sustentando o mês. */
function concentracaoDeReceita(entidadeId, competencia, { limite = 0.5 } = {}) {
  const r = relatorios.porCentroCusto(entidadeId, competencia);
  const total = r.linhas.reduce((s, l) => s + l.receitaCents, 0);
  if (total <= 0 || r.linhas.length < 2) return [];
  const maior = r.linhas.slice().sort((a, b) => b.receitaCents - a.receitaCents)[0];
  const fatia = maior.receitaCents / total;
  if (fatia < limite) return [];
  return [{
    tipo: 'concentracao_de_receita',
    gravidade: fatia > 0.7 ? 'alta' : 'informativa',
    titulo: `${Math.round(fatia * 100)}% da receita do mês veio de ${maior.nome}`,
    fatos: {
      centro: maior.nome, codigo: maior.codigo,
      receita: dinheiro.formatar(maior.receitaCents),
      totalDoMes: dinheiro.formatar(total),
      participacao: `${Math.round(fatia * 100)}%`,
    },
    premissa: 'a receita está classificada por centro de custo; a parcela sem centro não entra na conta',
    confianca: r.aviso ? 55 : 85,
    motivoDaIncerteza: r.aviso ? 'há receita sem centro de custo no mês' : 'um mês só é amostra curta para falar de dependência',
    horizonte: 'próximos meses',
    acao: 'Olhar a ocupação e a agenda desse imóvel: uma vacância nele derruba o mês inteiro.',
    drill: { tipo: 'resultado-por-centro', competencia },
    invalidaSe: 'o mês teve um evento pontual de alto valor, ou a distribuição volta ao normal na competência seguinte.',
  }];
}

/** Caixa projetado negativo — o alerta que o dono realmente quer. */
function insuficienciaDeCaixa(entidadeId, { dias = 90, referencia } = {}) {
  let p;
  try { p = caixa.previsao(entidadeId, { dias, referencia }); }
  catch (_) { return []; }               // sem conta de caixa não há o que projetar
  const base = p.cenarios.find(c => c.cenario === 'base');
  const pess = p.cenarios.find(c => c.cenario === 'pessimista');
  if (!base.faltaCaixa && !pess.faltaCaixa) return [];

  const critico = base.faltaCaixa ? base : pess;
  return [{
    tipo: 'insuficiencia_de_caixa',
    gravidade: base.faltaCaixa ? 'critica' : 'alta',
    titulo: base.faltaCaixa
      ? `Caixa fica negativo em ${base.menorSaldoEm}`
      : `Caixa fica negativo em ${pess.menorSaldoEm} no cenário pessimista`,
    fatos: {
      saldoHoje: p.saldoHoje,
      menorSaldo: critico.menorSaldo,
      quando: critico.menorSaldoEm,
      cenario: critico.rotulo,
      parcelasConsideradas: p.parcelasConsideradas,
      taxaHistorica: p.taxaHistorica.origem,
    },
    premissa: critico.premissa,
    confianca: p.taxaHistorica.suficiente ? 70 : 45,
    motivoDaIncerteza: p.taxaHistorica.suficiente
      ? 'a projeção só enxerga o que já está lançado — receita futura ainda não faturada não entra'
      : 'sem histórico suficiente de recebimento, o cenário base assume 100%',
    horizonte: `${dias} dias`,
    acao: 'Antecipar cobrança do que está vencido, renegociar o vencimento das maiores saídas do período, ou reforçar o caixa.',
    drill: { tipo: 'previsao-caixa', dias },
    invalidaSe: 'entrar receita ainda não lançada, um recebível vencido for pago, ou uma saída for renegociada.',
  }];
}

/** Inadimplência crescendo — quem deve, há quanto tempo. */
function inadimplenciaRelevante(entidadeId, { limite = 0.2, referencia } = {}) {
  const a = titulos.aging(entidadeId, { especie: 'receber', referencia });
  if (!a.totalAbertoCents || a.percentualVencido < limite * 100) return [];
  const piores = titulos.inadimplentes(entidadeId, { especie: 'receber', limite: 3, referencia });
  return [{
    tipo: 'inadimplencia',
    gravidade: a.percentualVencido > 50 ? 'alta' : 'media',
    titulo: `${a.percentualVencido}% do que há a receber está vencido`,
    fatos: {
      totalAberto: a.totalAberto, totalVencido: a.totalVencido,
      percentual: `${a.percentualVencido}%`,
      maiores: piores.map(p => `${p.contraparte}: ${p.saldo} (${p.diasDaMaisAntiga} dias)`),
    },
    premissa: 'parcela em aberto com vencimento passado é inadimplência',
    confianca: 90,
    motivoDaIncerteza: 'pagamento pode ter ocorrido e ainda não ter sido baixado no sistema',
    horizonte: 'imediato',
    acao: piores.length
      ? `Cobrar primeiro ${piores[0].contraparte} (${piores[0].saldo}, ${piores[0].diasDaMaisAntiga} dias).`
      : 'Rodar a régua de cobrança.',
    drill: { tipo: 'aging', especie: 'receber' },
    invalidaSe: 'os recebimentos existirem e faltar apenas a baixa — conciliar o extrato antes de cobrar.',
  }];
}

// =====================================================================

const DETECTORES = [
  (e, c, o) => aClassificarComSaldo(e, c),
  (e, c, o) => despesaForaDoPadrao(e, c, o),
  (e, c, o) => possivelDuplicidade(e, c, o),
  (e, c, o) => despesaRecorrenteAusente(e, c, o),
  (e, c, o) => concentracaoDeReceita(e, c, o),
  (e, c, o) => insuficienciaDeCaixa(e, o),
  (e, c, o) => inadimplenciaRelevante(e, o),
];

/**
 * Briefing do CFO: o que exige atenção nesta competência, em ordem de
 * gravidade. Detector que falha não derruba o briefing — vira uma linha
 * dizendo qual falhou, porque um painel silenciosamente incompleto é pior
 * do que um painel que admite o buraco.
 */
function briefing(entidadeId, competencia, opcoes = {}) {
  const constatacoes = [];
  const falhas = [];
  for (const detector of DETECTORES) {
    try { constatacoes.push(...detector(entidadeId, competencia, opcoes)); }
    catch (e) { falhas.push(String(e.message).slice(0, 200)); }
  }
  constatacoes.sort((a, b) =>
    (GRAVIDADE[b.gravidade] - GRAVIDADE[a.gravidade]) || (b.confianca - a.confianca));

  const dre = relatorios.dre(entidadeId, competencia);
  return {
    competencia,
    geradoEm: nowISO(),
    resultado: {
      receitaLiquida: dinheiro.formatar(dre.resumo.receitaLiquidaCents),
      despesas: dinheiro.formatar(dre.resumo.despesaTotalCents),
      resultado: dinheiro.formatar(dre.resumo.resultadoCents),
      margem: dre.resumo.margem,
    },
    constatacoes,
    porGravidade: {
      critica: constatacoes.filter(c => c.gravidade === 'critica').length,
      alta: constatacoes.filter(c => c.gravidade === 'alta').length,
      media: constatacoes.filter(c => c.gravidade === 'media').length,
      informativa: constatacoes.filter(c => c.gravidade === 'informativa').length,
    },
    falhasDeDeteccao: falhas,
    natureza: 'Constatações determinísticas a partir do razão. Nenhuma vem de modelo estatístico ' +
      'nem de IA. Cada uma traz os fatos que a acionaram e o que a invalidaria.',
  };
}

module.exports = {
  briefing, DETECTORES, GRAVIDADE,
  despesaForaDoPadrao, possivelDuplicidade, despesaRecorrenteAusente,
  aClassificarComSaldo, concentracaoDeReceita, insuficienciaDeCaixa, inadimplenciaRelevante,
  serie, estatistica, mesAntes,
};
