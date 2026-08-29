// =====================================================================
// Villela Finance — razão de partida dobrada. É A FONTE OFICIAL.
//
// Nenhum painel calcula saldo somando tabela transacional. Quem quer
// saber quanto tem em caixa pergunta ao razão; quem quer saber por que,
// desce até a linha e dela até a transação de origem.
//
// Invariantes garantidas aqui (e reforçadas por trigger no schema):
//   • débitos == créditos em todo lote, sempre;
//   • valor em centavos inteiros, nunca float;
//   • lote contabilizado é imutável — correção é estorno + novo lote;
//   • período fechado não recebe lançamento;
//   • conta sintética não recebe lançamento;
//   • comando externo com chave de idempotência nunca gera dois lotes.
// =====================================================================
'use strict';
const { transacao, novoId, competenciaDe, hojeISO } = require('./db');
const repo = require('./repo');
const tenancy = require('./tenancy');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');
const diario = require('./diario');

class ErroContabil extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroContabil'; this.status = 400; this.detalhe = detalhe || null; }
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normaliza e valida as linhas ANTES de abrir transação. Devolve linhas
 * prontas e os totais — ou lança com a explicação exata do que está
 * errado (o usuário precisa saber qual linha, não "erro ao lançar").
 */
function prepararLinhas(entidadeId, linhas) {
  if (!Array.isArray(linhas) || linhas.length < 2) {
    throw new ErroContabil('Um lançamento tem pelo menos duas linhas (uma a débito e uma a crédito).');
  }
  const cache = new Map();
  const contaDe = (l, i) => {
    const chave = l.contaId || `codigo:${l.contaCodigo}`;
    if (cache.has(chave)) return cache.get(chave);
    const c = l.contaId ? repo.contaPorId(l.contaId) : repo.contaPorCodigo(entidadeId, l.contaCodigo);
    if (!c) throw new ErroContabil(`Linha ${i + 1}: conta ${l.contaId || l.contaCodigo} não existe.`);
    if (c.entidade_id !== entidadeId) throw new ErroContabil(`Linha ${i + 1}: a conta ${c.codigo} é de outra empresa.`);
    if (c.aceita_lancamento !== 1) throw new ErroContabil(`Linha ${i + 1}: ${c.codigo} é conta sintética e não aceita lançamento.`);
    if (c.status !== 'ativa') throw new ErroContabil(`Linha ${i + 1}: a conta ${c.codigo} está inativa.`);
    cache.set(chave, c);
    return c;
  };

  const prontas = [];
  let debitos = 0, creditos = 0;
  linhas.forEach((l, i) => {
    const conta = contaDe(l, i);
    const deb = l.debitoCents == null ? 0 : dinheiro.naoNegativo(l.debitoCents, `linha ${i + 1} débito`);
    const cred = l.creditoCents == null ? 0 : dinheiro.naoNegativo(l.creditoCents, `linha ${i + 1} crédito`);
    if ((deb === 0) === (cred === 0)) {
      throw new ErroContabil(`Linha ${i + 1}: informe débito OU crédito, com valor maior que zero.`);
    }
    if (l.centroCustoId && !repo.centroCustoPorId(l.centroCustoId)) {
      throw new ErroContabil(`Linha ${i + 1}: centro de custo ${l.centroCustoId} não existe.`);
    }
    // Subledger obriga contraparte: sem isso, "fornecedores" vira um
    // saldo que ninguém sabe de quem é.
    if (conta.subledger && ['clientes', 'fornecedores'].includes(conta.subledger) && !l.contraparteId) {
      throw new ErroContabil(`Linha ${i + 1}: a conta ${conta.codigo} controla ${conta.subledger} — informe a contraparte.`);
    }
    debitos = dinheiro.somar(debitos, deb);
    creditos = dinheiro.somar(creditos, cred);
    prontas.push({
      id: novoId(), ordem: i, contaId: conta.id, debitoCents: deb, creditoCents: cred,
      centroCustoId: l.centroCustoId || '', contraparteId: l.contraparteId || '',
      memo: String(l.memo || '').slice(0, 300), refTipo: l.refTipo || '', refId: l.refId || '',
    });
  });

  if (debitos !== creditos) {
    throw new ErroContabil(
      `Lançamento desbalanceado: débitos ${dinheiro.formatar(debitos)} × créditos ${dinheiro.formatar(creditos)} ` +
      `(diferença de ${dinheiro.formatar(Math.abs(debitos - creditos))}).`,
      { debitos, creditos, diferenca: debitos - creditos }
    );
  }
  if (debitos === 0) throw new ErroContabil('Lançamento de valor zero não é lançamento.');
  return { linhas: prontas, total: debitos };
}

/**
 * Contabiliza um lote. Operação atômica: ou o lote inteiro entra
 * balanceado, ou nada entra.
 *
 * `idempotencia` é a chave do comando externo — a mesma chave devolve o
 * lote já existente em vez de duplicar (webhook reenviado, importação
 * repetida, clique duplo).
 */
function lancar(d) {
  const entidadeId = d.entidadeId || tenancy.entidadeAtual();
  const entidade = repo.entidadePorId(entidadeId);
  if (!entidade) throw new ErroContabil('Empresa não encontrada nesta conta.');
  if (!RE_DATA.test(String(d.data || ''))) throw new ErroContabil('Informe a data do fato no formato AAAA-MM-DD.');

  const competencia = d.competencia || competenciaDe(d.data);
  if (!/^\d{4}-\d{2}$/.test(competencia)) throw new ErroContabil('Competência inválida (use AAAA-MM).');

  const idem = String(d.idempotencia || '').slice(0, 200);
  if (idem) {
    const jaExiste = repo.lotePorIdempotencia(idem);
    if (jaExiste) return { lote: jaExiste, linhas: repo.linhasDoLote(jaExiste.id), duplicado: true };
  }

  const { linhas, total } = prepararLinhas(entidadeId, d.linhas);

  const periodo = repo.periodo(entidadeId, competencia);
  if (periodo && periodo.status === 'fechado') {
    throw new ErroContabil(`A competência ${competencia} está fechada. Reabra o período (com motivo) para lançar nela.`);
  }

  const resultado = transacao(() => {
    if (!periodo) repo.criarPeriodo(entidadeId, competencia);
    const loteId = novoId();
    repo.inserirLote({
      id: loteId, entidadeId, numero: repo.proximoNumeroLote(entidadeId),
      data: d.data, competencia, memo: String(d.memo || '').slice(0, 300),
      origem: d.origem || 'manual', origemRef: d.origemRef || '', idempotencia: idem,
      status: 'rascunho', estornoDe: d.estornoDe || '', totalCents: 0,
    });
    for (const l of linhas) repo.inserirLinha(Object.assign({ loteId }, l));

    // Confere no banco, não na memória: se um trigger recusou uma linha,
    // é aqui que se descobre — antes do COMMIT.
    const gravadas = repo.linhasDoLote(loteId);
    if (gravadas.length !== linhas.length) throw new ErroContabil('Linhas não foram gravadas por completo.');
    const somaDeb = gravadas.reduce((s, l) => s + l.debito_cents, 0);
    const somaCred = gravadas.reduce((s, l) => s + l.credito_cents, 0);
    if (somaDeb !== somaCred || somaDeb !== total) {
      throw new ErroContabil('Conferência pós-gravação falhou: o lote não está balanceado.');
    }

    repo.contabilizarLote(loteId, total);
    const lote = repo.lotePorId(loteId);
    if (!lote || lote.status !== 'contabilizado') throw new ErroContabil('O lote não pôde ser contabilizado.');

    auditoria.registrar('lote.contabilizar', {
      objetoTipo: 'lote', objetoId: loteId,
      motivo: d.memo || '',
      detalhe: { numero: lote.numero, competencia, total_cents: total, origem: lote.origem, origem_ref: lote.origem_ref, linhas: gravadas.length },
    });
    return { lote, linhas: gravadas };
  });

  // Depois do COMMIT: réplica durável e evento. Falha aqui não desfaz o
  // lançamento — a conferência do diário acusa a falta, e é assim que tem
  // de ser (perder o lote para salvar a réplica seria pior).
  try { diario.acrescentar(resultado.lote, resultado.linhas); }
  catch (e) { console.error('[financeiro] diário:', e.message); }
  try { repo.publicarEvento({ tipo: 'lote.contabilizado', payload: { loteId: resultado.lote.id, entidadeId, total } }); }
  catch (_) { /* outbox é melhor esforço; o lote já está no razão */ }

  return { lote: resultado.lote, linhas: resultado.linhas, duplicado: false };
}

/**
 * Estorno: NUNCA se apaga lançamento. Cria um lote espelho com débitos e
 * créditos trocados, na data informada (ou hoje), e amarra os dois nos
 * dois sentidos — sem o vínculo inverso, quem olha o lote original não
 * descobre que ele foi estornado.
 */
function estornar(loteId, { motivo, data } = {}) {
  if (!String(motivo || '').trim()) throw new ErroContabil('Estorno exige motivo — ele vai para a auditoria.');
  const original = repo.lotePorId(loteId);
  if (!original) throw new ErroContabil('Lote não encontrado.');
  if (original.status === 'estornado') throw new ErroContabil('Este lote já foi estornado.');
  if (original.status !== 'contabilizado') throw new ErroContabil('Só se estorna lote contabilizado.');

  const linhas = repo.linhasDoLote(loteId);
  const dataEstorno = data && RE_DATA.test(data) ? data : hojeISO();

  const espelho = linhas.map(l => ({
    contaId: l.conta_id,
    debitoCents: l.credito_cents,          // troca os lados
    creditoCents: l.debito_cents,
    centroCustoId: l.centro_custo_id,
    contraparteId: l.contraparte_id,
    memo: `Estorno: ${l.memo || ''}`.slice(0, 300),
    refTipo: 'lote', refId: loteId,
  }));

  const r = lancar({
    entidadeId: original.entidade_id,
    data: dataEstorno,
    memo: `Estorno do lançamento nº ${original.numero} — ${motivo}`,
    origem: original.origem, origemRef: original.origem_ref,
    idempotencia: `estorno:${loteId}`,
    estornoDe: loteId,
    linhas: espelho,
  });

  if (!r.duplicado) {
    transacao(() => {
      repo.marcarEstornado(loteId, r.lote.id, String(motivo).slice(0, 300));
      auditoria.registrar('lote.estornar', {
        objetoTipo: 'lote', objetoId: loteId, motivo,
        detalhe: { lote_estorno: r.lote.id, numero_original: original.numero, total_cents: original.total_cents },
      });
    });
  }
  return { original: repo.lotePorId(loteId), estorno: r.lote, linhas: r.linhas };
}

// ------------------------------------------------------------ consultas

/** Saldo de uma conta, já com o sinal da natureza dela. */
function saldo(contaId, opts = {}) {
  const conta = repo.contaPorId(contaId);
  if (!conta) throw new ErroContabil('Conta não encontrada.');
  const r = repo.saldoDaConta(contaId, opts) || { debito: 0, credito: 0 };
  const bruto = conta.saldo_normal === 'devedora' ? r.debito - r.credito : r.credito - r.debito;
  return {
    contaId, codigo: conta.codigo, nome: conta.nome, natureza: conta.natureza,
    saldoNormal: conta.saldo_normal,
    debitoCents: r.debito, creditoCents: r.credito, saldoCents: bruto,
    saldoFormatado: dinheiro.formatar(bruto),
  };
}

/** Balancete: saldo de todas as analíticas + prova de que fecha em zero. */
function balancete(entidadeId, opts = {}) {
  const linhas = repo.balancete(entidadeId, opts).map(c => {
    const saldoCents = c.saldo_normal === 'devedora' ? c.debito - c.credito : c.credito - c.debito;
    return {
      contaId: c.id, codigo: c.codigo, nome: c.nome, natureza: c.natureza,
      debitoCents: c.debito, creditoCents: c.credito, saldoCents,
      saldoFormatado: dinheiro.formatar(saldoCents),
    };
  });
  const totalDebito = linhas.reduce((s, l) => s + l.debitoCents, 0);
  const totalCredito = linhas.reduce((s, l) => s + l.creditoCents, 0);
  return {
    linhas: linhas.filter(l => l.debitoCents || l.creditoCents),
    totalDebitoCents: totalDebito, totalCreditoCents: totalCredito,
    diferencaCents: totalDebito - totalCredito,
    fecha: totalDebito === totalCredito,
  };
}

/** Razão de uma conta, linha a linha, com saldo corrido (drill-down). */
function razao(contaId, opts = {}) {
  const conta = repo.contaPorId(contaId);
  if (!conta) throw new ErroContabil('Conta não encontrada.');
  const devedora = conta.saldo_normal === 'devedora';
  let acumulado = 0;
  const linhas = repo.razaoDaConta(contaId, opts).map(l => {
    acumulado += devedora ? (l.debito_cents - l.credito_cents) : (l.credito_cents - l.debito_cents);
    return {
      linhaId: l.id, loteId: l.lote_id, numero: l.numero, data: l.data, competencia: l.competencia,
      memo: l.memo || l.lote_memo, origem: l.origem, origemRef: l.origem_ref,
      refTipo: l.ref_tipo, refId: l.ref_id,
      debitoCents: l.debito_cents, creditoCents: l.credito_cents,
      saldoCents: acumulado, saldoFormatado: dinheiro.formatar(acumulado),
    };
  });
  return { conta: { id: conta.id, codigo: conta.codigo, nome: conta.nome, natureza: conta.natureza }, linhas };
}

/**
 * Prova global: a soma de TODOS os débitos contabilizados tem de ser
 * igual à de todos os créditos. Roda no fechamento e no selftest — é o
 * "100% dos lançamentos balanceados" deixando de ser promessa.
 */
function conferirBalanceamento(entidadeId) {
  const b = repo.balancete(entidadeId, {});
  const deb = b.reduce((s, c) => s + c.debito, 0);
  const cred = b.reduce((s, c) => s + c.credito, 0);
  return { ok: deb === cred, debitoCents: deb, creditoCents: cred, diferencaCents: deb - cred };
}

/** Lote com as linhas e o rastro até a origem. */
function lote(loteId) {
  const l = repo.lotePorId(loteId);
  if (!l) return null;
  return {
    lote: l,
    linhas: repo.linhasDoLote(loteId),
    estorno: l.estornado_por ? repo.lotePorId(l.estornado_por) : null,
    estornoDe: l.estorno_de ? repo.lotePorId(l.estorno_de) : null,
  };
}

module.exports = {
  ErroContabil, lancar, estornar, saldo, balancete, razao, lote,
  conferirBalanceamento, prepararLinhas,
};
