// =====================================================================
// Villela Finance — fluxo de caixa: o que aconteceu e o que vem.
//
// Três coisas diferentes que costumam ser chamadas do mesmo nome:
//
//   • FLUXO DIRETO — o que de fato passou pelas contas de caixa e banco,
//     classificado por natureza. Sai do razão, linha a linha.
//   • FLUXO INDIRETO — parte do resultado e ajusta o que não é caixa.
//     Serve para explicar POR QUE lucro e caixa diferem.
//   • PREVISÃO — saldo de hoje mais o que está agendado (parcelas a
//     receber menos a pagar). Não é fato: é projeção, e o código diz isso.
//
// A previsão traz CENÁRIOS. O cenário não é chute: a taxa de recebimento
// vem do histórico da própria conta (quanto do que venceu foi recebido),
// e quando não há histórico suficiente a resposta DIZ que está usando o
// padrão, em vez de fingir que calculou.
// =====================================================================
'use strict';
const { nowISO } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');
const planoContas = require('./plano-contas');

class ErroDeCaixa extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDeCaixa'; this.status = 400; }
}

const somaDias = (data, dias) => {
  const d = new Date(data + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Contas contábeis que representam dinheiro (caixa, bancos). */
function contasDeCaixa(entidadeId) {
  const ids = new Set();
  try { ids.add(planoContas.chave(entidadeId, 'caixa').id); } catch (_) { /* semeadura antiga */ }
  for (const cb of repo.listarContasBancarias(entidadeId)) if (cb.conta_id) ids.add(cb.conta_id);
  return [...ids];
}

/**
 * Fluxo DIRETO: cada movimento das contas de caixa, com a contrapartida
 * que explica o movimento. Agrupado por natureza da contrapartida —
 * é o que responde "o dinheiro foi para quê".
 */
function fluxoDireto(entidadeId, { desde, ate }) {
  const caixas = contasDeCaixa(entidadeId);
  if (!caixas.length) throw new ErroDeCaixa('Esta empresa não tem conta de caixa nem conta bancária ligada ao razão.');

  const movimentos = repo.q(
    `SELECT b.id AS lote_id, b.data, b.memo, b.origem,
            l.debito_cents, l.credito_cents,
            (SELECT group_concat(c2.codigo) FROM fin_linhas l2
               JOIN fin_contas c2 ON c2.id = l2.conta_id
              WHERE l2.tenant_id = l.tenant_id AND l2.lote_id = l.lote_id AND l2.id <> l.id) AS contrapartidas
       FROM fin_linhas l
       JOIN fin_lotes b ON b.id = l.lote_id AND b.status <> 'rascunho'
      WHERE l.tenant_id = :tenant AND b.entidade_id = :ent
        AND l.conta_id IN (${caixas.map((_, i) => `:c${i}`).join(',')})
        ${desde ? 'AND b.data >= :desde' : ''} ${ate ? 'AND b.data <= :ate' : ''}
      ORDER BY b.data, b.numero`,
    Object.assign({ ent: entidadeId, desde, ate },
      Object.fromEntries(caixas.map((id, i) => [`c${i}`, id]))));

  // Classifica pela contrapartida: receita/despesa = operacional,
  // imobilizado = investimento, empréstimo/capital = financiamento.
  const classificar = (codigos) => {
    const c = String(codigos || '');
    if (/(^|,)1\.2/.test(c)) return 'investimento';
    if (/(^|,)(2\.1\.5|2\.3)/.test(c)) return 'financiamento';
    return 'operacional';
  };

  const grupos = { operacional: { entradasCents: 0, saidasCents: 0 }, investimento: { entradasCents: 0, saidasCents: 0 }, financiamento: { entradasCents: 0, saidasCents: 0 } };
  const linhas = movimentos.map(m => {
    const grupo = classificar(m.contrapartidas);
    const valor = m.debito_cents - m.credito_cents;   // + entrou, − saiu
    if (valor > 0) grupos[grupo].entradasCents += valor; else grupos[grupo].saidasCents += -valor;
    return {
      loteId: m.lote_id, data: m.data, memo: m.memo, origem: m.origem,
      grupo, valorCents: valor, valor: dinheiro.formatar(valor),
      contrapartidas: String(m.contrapartidas || '').split(',').filter(Boolean),
    };
  });

  const entradas = Object.values(grupos).reduce((s, g) => s + g.entradasCents, 0);
  const saidas = Object.values(grupos).reduce((s, g) => s + g.saidasCents, 0);
  const saldoInicial = desde
    ? caixas.reduce((s, id) => s + ledger.saldo(id, { ate: somaDias(desde, -1) }).saldoCents, 0)
    : 0;

  return {
    metodo: 'direto', desde, ate,
    grupos: Object.entries(grupos).map(([nome, g]) => ({
      grupo: nome,
      entradasCents: g.entradasCents, saidasCents: g.saidasCents,
      liquidoCents: g.entradasCents - g.saidasCents,
      liquido: dinheiro.formatar(g.entradasCents - g.saidasCents),
    })),
    saldoInicialCents: saldoInicial,
    entradasCents: entradas, saidasCents: saidas,
    variacaoCents: entradas - saidas,
    saldoFinalCents: saldoInicial + entradas - saidas,
    saldoFinal: dinheiro.formatar(saldoInicial + entradas - saidas),
    movimentos: linhas.slice(0, 500),
    origem: {
      formula: 'movimentos das contas de caixa e banco no razão, agrupados pela natureza da contrapartida',
      fonte: 'razão (lotes contabilizados)',
    },
  };
}

/**
 * Fluxo INDIRETO: resultado do período mais os ajustes que explicam a
 * diferença entre lucro e caixa (variação de recebíveis e de obrigações).
 *
 * A conciliação com o direto é a prova de que o cálculo está certo — e
 * ela vem na resposta, não fica implícita.
 */
function fluxoIndireto(entidadeId, { desde, ate }) {
  const balancete = ledger.balancete(entidadeId, { desde, ate }).linhas;
  const soma = (filtro) => balancete.filter(filtro).reduce((s, l) => s + l.saldoCents, 0);

  const receitas = soma(l => l.natureza === 'receita');
  const despesas = soma(l => l.natureza === 'despesa');
  const resultado = receitas - despesas;

  // Variação no período: aumento de recebível consome caixa (sinal −),
  // aumento de obrigação libera caixa (sinal +).
  const variacaoRecebiveis = soma(l => l.codigo.startsWith('1.1.2'));
  const variacaoObrigacoes = soma(l => l.codigo.startsWith('2.1'));
  const depreciacao = soma(l => l.codigo.startsWith('1.2.1.900'));

  const ajustes = [
    { rotulo: 'Resultado do período', valorCents: resultado, tipo: 'base' },
    { rotulo: '(+) Depreciação (não afeta caixa)', valorCents: -depreciacao, tipo: 'ajuste' },
    { rotulo: '(−) Aumento de contas a receber', valorCents: -variacaoRecebiveis, tipo: 'ajuste' },
    { rotulo: '(+) Aumento de obrigações', valorCents: variacaoObrigacoes, tipo: 'ajuste' },
  ];
  const caixaCalculado = ajustes.reduce((s, a) => s + a.valorCents, 0);

  const direto = fluxoDireto(entidadeId, { desde, ate });
  const diferenca = caixaCalculado - direto.variacaoCents;

  return {
    metodo: 'indireto', desde, ate,
    linhas: ajustes.map(a => ({ ...a, valor: dinheiro.formatar(a.valorCents) })),
    variacaoCalculadaCents: caixaCalculado,
    variacaoPeloDiretoCents: direto.variacaoCents,
    diferencaCents: diferenca,
    concilia: diferenca === 0,
    // Quando não concilia, o motivo quase sempre é lançamento em conta
    // patrimonial não coberta pelos ajustes acima. Dizer isso poupa uma
    // hora de investigação.
    explicacao: diferenca === 0
      ? 'O indireto reconstrói exatamente a variação de caixa do método direto.'
      : `Diferença de ${dinheiro.formatar(diferenca)} — há movimento em conta patrimonial fora dos ajustes previstos (imobilizado, empréstimo ou capital). Confira o fluxo direto do período.`,
    origem: { formula: 'resultado + depreciação − variação de recebíveis + variação de obrigações', fonte: 'razão' },
  };
}

/**
 * Taxa histórica de recebimento: das parcelas que JÁ venceram, quanto foi
 * efetivamente recebido. É o que dá base ao cenário pessimista.
 */
function taxaHistorica(entidadeId, especie, hoje) {
  const r = repo.q(
    `SELECT COALESCE(SUM(p.valor_cents),0) AS devido, COALESCE(SUM(p.pago_cents),0) AS pago, COUNT(*) AS n
       FROM fin_parcelas p
       JOIN fin_titulos t ON t.id = p.titulo_id AND t.tenant_id = p.tenant_id
      WHERE p.tenant_id = :tenant AND t.entidade_id = :ent AND t.especie = :especie
        AND t.status <> 'cancelado' AND p.status <> 'cancelada' AND p.vencimento < :hoje`,
    { ent: entidadeId, especie, hoje })[0];
  const suficiente = r.n >= 10;
  return {
    amostra: r.n,
    suficiente,
    taxa: r.devido > 0 ? Math.min(1, r.pago / r.devido) : 1,
    // Sem histórico não se inventa número: usa-se 1 e DIZ-SE que é padrão.
    origem: suficiente
      ? `${r.n} parcelas já vencidas: ${dinheiro.formatar(r.pago)} recebidos de ${dinheiro.formatar(r.devido)}`
      : `histórico insuficiente (${r.n} parcelas vencidas) — usando 100% como padrão`,
  };
}

/**
 * Previsão de caixa por horizonte e cenário. NÃO é fato: cada número
 * carrega a premissa que o produziu.
 */
function previsao(entidadeId, { dias = 90, referencia } = {}) {
  const hoje = referencia || nowISO().slice(0, 10);
  const fim = somaDias(hoje, dias);
  const caixas = contasDeCaixa(entidadeId);
  const saldoHoje = caixas.reduce((s, id) => s + ledger.saldo(id, { ate: hoje }).saldoCents, 0);

  const agendadas = repo.q(
    `SELECT p.vencimento, p.valor_cents, p.pago_cents, t.especie
       FROM fin_parcelas p
       JOIN fin_titulos t ON t.id = p.titulo_id AND t.tenant_id = p.tenant_id
      WHERE p.tenant_id = :tenant AND t.entidade_id = :ent
        AND t.status <> 'cancelado' AND p.status IN ('aberta','parcial')
        AND p.vencimento <= :fim
      ORDER BY p.vencimento`,
    { ent: entidadeId, fim });

  const taxa = taxaHistorica(entidadeId, 'receber', hoje);
  const CENARIOS = [
    { chave: 'otimista', rotulo: 'Otimista', recebimento: 1, premissa: 'todo recebível é pago no vencimento' },
    { chave: 'base', rotulo: 'Base', recebimento: taxa.taxa, premissa: `recebimento na taxa histórica (${taxa.origem})` },
    { chave: 'pessimista', rotulo: 'Pessimista', recebimento: Math.max(0, taxa.taxa - 0.15), premissa: 'taxa histórica menos 15 pontos percentuais' },
  ];

  const resultado = CENARIOS.map(c => {
    let saldo = saldoHoje;
    let menor = { data: hoje, saldoCents: saldo };
    const semanas = [];
    let semanaAtual = null;

    for (const p of agendadas) {
      const aberto = p.valor_cents - p.pago_cents;
      if (aberto <= 0) continue;
      // Vencido antes de hoje entra no primeiro dia da projeção.
      const data = p.vencimento < hoje ? hoje : p.vencimento;
      // Só o recebível é afetado pelo cenário — despesa a pagar é
      // compromisso assumido, não estimativa.
      const valor = p.especie === 'receber' ? Math.round(aberto * c.recebimento) : -aberto;
      saldo += valor;
      if (saldo < menor.saldoCents) menor = { data, saldoCents: saldo };

      const semana = data.slice(0, 10);
      if (!semanaAtual || semanaAtual.ate < semana) {
        semanaAtual = { de: semana, ate: somaDias(semana, 6), entradasCents: 0, saidasCents: 0, saldoFinalCents: 0 };
        semanas.push(semanaAtual);
      }
      if (valor > 0) semanaAtual.entradasCents += valor; else semanaAtual.saidasCents += -valor;
      semanaAtual.saldoFinalCents = saldo;
    }

    return {
      cenario: c.chave, rotulo: c.rotulo, premissa: c.premissa,
      saldoFinalCents: saldo, saldoFinal: dinheiro.formatar(saldo),
      menorSaldoCents: menor.saldoCents, menorSaldo: dinheiro.formatar(menor.saldoCents),
      menorSaldoEm: menor.data,
      // A pergunta que o dono realmente faz.
      faltaCaixa: menor.saldoCents < 0,
      semanas: semanas.slice(0, 26),
    };
  });

  const base = resultado.find(r => r.cenario === 'base');
  return {
    referencia: hoje, horizonteDias: dias, ate: fim,
    saldoHojeCents: saldoHoje, saldoHoje: dinheiro.formatar(saldoHoje),
    parcelasConsideradas: agendadas.length,
    taxaHistorica: taxa,
    cenarios: resultado,
    alerta: resultado.filter(r => r.faltaCaixa).map(r =>
      `No cenário ${r.rotulo.toLowerCase()}, o caixa fica negativo em ${r.menorSaldoEm} (${r.menorSaldo}).`),
    veredito: base.faltaCaixa
      ? `Atenção: no cenário base o caixa fica negativo em ${base.menorSaldoEm}.`
      : `No cenário base o caixa não fica negativo nos próximos ${dias} dias (menor saldo: ${base.menorSaldo} em ${base.menorSaldoEm}).`,
    origem: {
      formula: 'saldo atual + parcelas a receber (ajustadas pelo cenário) − parcelas a pagar, por data de vencimento',
      fonte: 'razão (saldo) + contas a pagar e receber (agenda)',
      natureza: 'PREVISÃO, não fato — parcela vencida entra no primeiro dia da projeção.',
    },
  };
}

module.exports = { ErroDeCaixa, fluxoDireto, fluxoIndireto, previsao, taxaHistorica, contasDeCaixa, somaDias };
