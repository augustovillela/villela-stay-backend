// =====================================================================
// Villela Finance — ativos fixos e depreciação.
//
// As contas do imobilizado já existiam no plano; o cálculo, não. Sem ele
// o resultado fica otimista: a casa, os móveis e a reforma envelhecem e o
// DRE não registra nada — o lucro do mês parece maior do que é.
//
// Método: **linear**, e só ele. Saldo decrescente e unidades produzidas
// existem, mas exigem escolha fiscal que é do contador do assinante, não
// do sistema. Oferecer três métodos sem parecer é convidar ao erro.
//
// Duas coisas que o cálculo não faz de propósito:
//   • **não decide vida útil** — o padrão é sugestão (Receita Federal,
//     IN 1.700/2017 para os casos comuns), e a resposta diz que é
//     sugestão. Enquadramento é do contador;
//   • **não deprecia terreno** nem ativo já totalmente depreciado, e
//     nunca passa do valor depreciável (custo − residual). Depreciação
//     que ultrapassa o custo é erro que só aparece no balanço, meses
//     depois.
// =====================================================================
'use strict';
const { novoId, nowISO, hojeISO, transacao } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const planoContas = require('./plano-contas');
const auditoria = require('./auditoria');
const dinheiro = require('./dinheiro');
const tenancy = require('./tenancy');

class ErroDeAtivo extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDeAtivo'; this.status = 400; this.detalhe = detalhe || null; }
}

/**
 * Vidas úteis SUGERIDAS, em meses. São ponto de partida, não norma — a
 * resposta carrega esse aviso para que ninguém as tome por decisão fiscal.
 */
const VIDAS_SUGERIDAS = [
  { chave: 'imovel', rotulo: 'Imóvel (edificação)', meses: 300, conta: '1.2.1.001' },
  { chave: 'moveis', rotulo: 'Móveis e utensílios', meses: 120, conta: '1.2.1.002' },
  { chave: 'eletro', rotulo: 'Eletrodomésticos e eletrônicos', meses: 60, conta: '1.2.1.002' },
  { chave: 'benfeitoria', rotulo: 'Benfeitorias e reformas', meses: 120, conta: '1.2.1.003' },
  { chave: 'veiculo', rotulo: 'Veículo', meses: 60, conta: '1.2.1.002' },
  { chave: 'terreno', rotulo: 'Terreno', meses: 0, conta: '1.2.1.001' },   // não deprecia
];

const RE_COMP = /^\d{4}-\d{2}$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

const somaMeses = (competencia, n) => {
  const [a, m] = competencia.split('-').map(Number);
  const t = (a * 12 + (m - 1)) + n;
  return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const mesesEntre = (de, ate) => {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return (a2 * 12 + m2) - (a1 * 12 + m1);
};

/** Cadastra o ativo. NÃO lança nada: a compra já entrou pelo título ou pelo extrato. */
function registrar(d) {
  const entidadeId = d.entidadeId || tenancy.entidadeAtual();
  const nome = String(d.nome || '').trim().slice(0, 200);
  if (!nome) throw new ErroDeAtivo('Informe o nome do ativo.');
  if (!RE_DATA.test(String(d.aquisicao || ''))) throw new ErroDeAtivo('Informe a data de aquisição (AAAA-MM-DD).');

  const custo = dinheiro.naoNegativo(d.custoCents, 'custo');
  if (!custo) throw new ErroDeAtivo('Ativo de custo zero não é ativo.');
  const residual = dinheiro.naoNegativo(d.residualCents || 0, 'valor residual');
  if (residual >= custo) throw new ErroDeAtivo('O valor residual não pode alcançar o custo — não sobraria nada a depreciar.');

  const meses = Number(d.vidaUtilMeses);
  if (!Number.isInteger(meses) || meses < 0 || meses > 1200) {
    throw new ErroDeAtivo('Vida útil inválida (0 a 1200 meses; use 0 para ativo que não deprecia, como terreno).');
  }

  const conta = d.contaId ? repo.contaPorId(d.contaId) : repo.contaPorCodigo(entidadeId, planoContas.CHAVES.imobilizado);
  if (!conta) throw new ErroDeAtivo('Conta do imobilizado não encontrada.');

  const id = novoId();
  repo.criarAtivo({
    id, entidadeId, nome, categoria: String(d.categoria || '').slice(0, 40),
    contaId: conta.id, centroCustoId: d.centroCustoId || '',
    aquisicao: d.aquisicao, custoCents: custo, residualCents: residual,
    vidaUtilMeses: meses, inicioDepreciacao: d.inicioDepreciacao || String(d.aquisicao).slice(0, 7),
  });
  auditoria.registrar('ativo.registrar', {
    objetoTipo: 'ativo', objetoId: id,
    detalhe: { nome, custoCents: custo, vidaUtilMeses: meses, conta: conta.codigo },
  });
  return repo.ativo(id);
}

/** Quanto este ativo deprecia por mês, e quanto ainda resta depreciar. */
function situacao(a, ate) {
  const depreciavel = a.custo_cents - a.residual_cents;
  if (!a.vida_util_meses || depreciavel <= 0) {
    return { mensalCents: 0, acumuladoCents: a.depreciado_cents, restanteCents: 0, naoDeprecia: true };
  }
  // Largest-remainder no tempo: a última parcela absorve o arredondamento,
  // para que a soma dos meses feche exatamente com o valor depreciável.
  const mensal = Math.floor(depreciavel / a.vida_util_meses);
  const decorridos = Math.max(0, Math.min(a.vida_util_meses, mesesEntre(a.inicio_depreciacao, ate) + 1));
  const acumuladoDevido = decorridos >= a.vida_util_meses ? depreciavel : mensal * decorridos;
  return {
    mensalCents: mensal,
    decorridos,
    acumuladoDevidoCents: acumuladoDevido,
    acumuladoCents: a.depreciado_cents,
    restanteCents: depreciavel - a.depreciado_cents,
    faltaLancarCents: Math.max(0, acumuladoDevido - a.depreciado_cents),
    naoDeprecia: false,
  };
}

/**
 * Prévia da depreciação de uma competência: o que seria lançado, ativo a
 * ativo, sem gravar. É o mesmo padrão do resto do módulo — olhar antes.
 */
function previa(entidadeId, competencia) {
  if (!RE_COMP.test(competencia)) throw new ErroDeAtivo('Competência inválida (use AAAA-MM).');
  const ate = competencia;
  const linhas = [];
  let total = 0;
  for (const a of repo.listarAtivos(entidadeId)) {
    if (a.status !== 'ativo') continue;
    if (a.inicio_depreciacao > ate) continue;
    const s = situacao(a, ate);
    if (s.naoDeprecia || !s.faltaLancarCents) continue;
    linhas.push({
      ativoId: a.id, nome: a.nome, contaId: a.conta_id,
      centroCustoId: a.centro_custo_id || '',
      custoCents: a.custo_cents, vidaUtilMeses: a.vida_util_meses,
      mensalCents: s.mensalCents, valorCents: s.faltaLancarCents,
      valor: dinheiro.formatar(s.faltaLancarCents),
      acumuladoAntesCents: a.depreciado_cents,
    });
    total += s.faltaLancarCents;
  }
  return {
    competencia, linhas, totalCents: total, total: dinheiro.formatar(total),
    metodo: 'linear',
    origem: {
      formula: '(custo − valor residual) ÷ vida útil em meses, acumulado até a competência, menos o já depreciado',
      fonte: 'cadastro de ativos',
    },
    aviso: 'As vidas úteis são SUGESTÃO, não norma. Enquadramento e método são decisão do contador de cada empresa.',
  };
}

/**
 * Lança a depreciação da competência. Um lote só, com uma linha de
 * despesa por ativo (para o resultado por imóvel funcionar) e o crédito
 * na depreciação acumulada.
 */
function depreciar(entidadeId, competencia, { motivo = '' } = {}) {
  const p = previa(entidadeId, competencia);
  if (!p.linhas.length) return { lancado: false, motivo: 'nada a depreciar nesta competência', previa: p };

  const acumulada = planoContas.chave(entidadeId, 'depreciacaoAcumulada');
  const despesa = planoContas.chave(entidadeId, 'depreciacaoDespesa');

  const linhas = p.linhas.map(l => ({
    contaId: despesa.id, debitoCents: l.valorCents, creditoCents: 0,
    centroCustoId: l.centroCustoId || '', refTipo: 'ativo', refId: l.ativoId,
    memo: `Depreciação — ${l.nome}`,
  }));
  linhas.push({ contaId: acumulada.id, debitoCents: 0, creditoCents: p.totalCents });

  return transacao(() => {
    const r = ledger.lancar({
      entidadeId, data: ultimoDiaDoMes(competencia), competencia,
      memo: `Depreciação de ${competencia}`,
      origem: 'depreciacao', origemRef: competencia,
      // Idempotente pela competência E pelo que está sendo depreciado: um
      // ativo cadastrado depois não é engolido por uma chave só de período.
      idempotencia: `depreciacao:${entidadeId}:${competencia}:${p.totalCents}:${p.linhas.length}`,
      linhas,
    });
    for (const l of p.linhas) repo.somarDepreciacao(l.ativoId, l.valorCents);
    auditoria.registrar('ativo.depreciar', {
      objetoTipo: 'competencia', objetoId: `${entidadeId}:${competencia}`,
      motivo: motivo || `depreciação de ${competencia}`,
      detalhe: { totalCents: p.totalCents, ativos: p.linhas.length, loteId: r.lote.id },
    });
    return { lancado: true, loteId: r.lote.id, totalCents: p.totalCents, ativos: p.linhas.length, previa: p };
  });
}

const ultimoDiaDoMes = (competencia) => {
  const [a, m] = competencia.split('-').map(Number);
  return `${competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Baixa do ativo (venda, perda, fim de uso). Não apaga: muda o status. */
function baixar(ativoId, { motivo = '', data = '' } = {}) {
  const a = repo.ativo(ativoId);
  if (!a) throw new ErroDeAtivo('Ativo não encontrado.');
  if (a.status !== 'ativo') throw new ErroDeAtivo(`Este ativo já está ${a.status}.`);
  if (!String(motivo).trim()) throw new ErroDeAtivo('Informe o motivo da baixa — ele vai para a auditoria.');
  repo.baixarAtivo(ativoId, { data: data || hojeISO(), motivo });
  auditoria.registrar('ativo.baixar', {
    objetoTipo: 'ativo', objetoId: ativoId, motivo,
    detalhe: { custoCents: a.custo_cents, depreciadoCents: a.depreciado_cents },
  });
  return repo.ativo(ativoId);
}

/** Lista com a situação de cada ativo calculada até a competência. */
function listar(entidadeId, { ate = nowISO().slice(0, 7) } = {}) {
  return repo.listarAtivos(entidadeId).map(a => {
    const s = situacao(a, ate);
    return {
      id: a.id, nome: a.nome, categoria: a.categoria, status: a.status,
      aquisicao: a.aquisicao, custoCents: a.custo_cents, custo: dinheiro.formatar(a.custo_cents),
      residualCents: a.residual_cents, vidaUtilMeses: a.vida_util_meses,
      inicioDepreciacao: a.inicio_depreciacao,
      depreciadoCents: a.depreciado_cents, depreciado: dinheiro.formatar(a.depreciado_cents),
      liquidoCents: a.custo_cents - a.depreciado_cents,
      liquido: dinheiro.formatar(a.custo_cents - a.depreciado_cents),
      mensalCents: s.mensalCents, faltaLancarCents: s.faltaLancarCents || 0,
      naoDeprecia: s.naoDeprecia,
    };
  });
}

module.exports = {
  ErroDeAtivo, VIDAS_SUGERIDAS,
  registrar, previa, depreciar, baixar, listar, situacao, mesesEntre, somaMeses, ultimoDiaDoMes,
};
