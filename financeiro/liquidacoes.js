// =====================================================================
// Villela Finance — liquidação: o dinheiro entrando ou saindo.
//
// A liquidação é o REGIME DE CAIXA do sistema. O título já reconheceu o
// fato pela competência; aqui só se registra a movimentação e o que ela
// carrega de acessório: juros, multa e desconto.
//
// A conta que fecha (a pagar):
//   D Fornecedores ......... valor da parcela quitado
//   D Juros e multas pagos . juros + multa
//     C Banco .............. valor + juros + multa − desconto  (o que saiu)
//     C Descontos obtidos .. desconto
//
// A receber, espelhado:
//   D Banco ................ valor + juros + multa − desconto  (o que entrou)
//   D Descontos concedidos . desconto
//     C Clientes ........... valor da parcela quitado
//     C Juros e multas receb. juros + multa
//
// Baixa parcial é normal e prevista: a parcela vira `parcial` e o saldo
// continua no aging. Quitar além do saldo é recusado — dinheiro a mais é
// outra coisa (adiantamento), não uma liquidação maior.
// =====================================================================
'use strict';
const { transacao, novoId, nowISO, competenciaDe } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');
const planoContas = require('./plano-contas');
const tenancy = require('./tenancy');

class ErroDeLiquidacao extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDeLiquidacao'; this.status = 400; this.detalhe = detalhe || null; }
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const MEIOS = ['pix', 'boleto', 'cartao', 'ted', 'doc', 'dinheiro', 'debito_automatico', 'outro'];

function carregarParcela(parcelaId) {
  const p = repo.q(
    `SELECT p.*, t.especie, t.entidade_id, t.contraparte_id, t.documento, t.descricao, t.status AS titulo_status
       FROM fin_parcelas p JOIN fin_titulos t ON t.id = p.titulo_id AND t.tenant_id = p.tenant_id
      WHERE p.tenant_id = :tenant AND p.id = :id`, { id: parcelaId })[0];
  if (!p) throw new ErroDeLiquidacao('Parcela não encontrada.');
  return p;
}

/**
 * Registra o pagamento ou recebimento. `valorCents` é a parte do PRINCIPAL
 * que está sendo quitada — juros, multa e desconto vão separados, porque
 * cada um vai para uma conta diferente no razão.
 */
function liquidar(d) {
  const parcela = carregarParcela(d.parcelaId);
  if (parcela.titulo_status === 'cancelado') throw new ErroDeLiquidacao('O título está cancelado.');
  if (parcela.status === 'cancelada') throw new ErroDeLiquidacao('Esta parcela está cancelada.');
  if (!RE_DATA.test(String(d.data || ''))) throw new ErroDeLiquidacao('Informe a data (AAAA-MM-DD).');

  const valor = dinheiro.naoNegativo(d.valorCents, 'valor');
  const juros = dinheiro.naoNegativo(d.jurosCents || 0, 'juros');
  const multa = dinheiro.naoNegativo(d.multaCents || 0, 'multa');
  const desconto = dinheiro.naoNegativo(d.descontoCents || 0, 'desconto');
  if (!valor) throw new ErroDeLiquidacao('Liquidação de valor zero não é liquidação.');

  const saldo = parcela.valor_cents - parcela.pago_cents;
  if (valor > saldo) {
    throw new ErroDeLiquidacao(
      `O valor (${dinheiro.formatar(valor)}) passa do saldo da parcela (${dinheiro.formatar(saldo)}). ` +
      `Se houve pagamento a maior, registre a diferença como adiantamento.`,
      { saldoCents: saldo, valorCents: valor, excedenteCents: valor - saldo });
  }
  if (desconto > valor) throw new ErroDeLiquidacao('O desconto não pode ser maior que o principal quitado.');
  if (d.meio && !MEIOS.includes(d.meio)) throw new ErroDeLiquidacao(`Meio inválido: use ${MEIOS.join(', ')}.`);

  const contaBancaria = d.contaBancariaId ? repo.contaBancaria(d.contaBancariaId) : null;
  if (d.contaBancariaId && !contaBancaria) throw new ErroDeLiquidacao('Conta bancária não encontrada.');
  if (contaBancaria && !contaBancaria.conta_id) {
    throw new ErroDeLiquidacao(`A conta bancária "${contaBancaria.nome}" não está ligada a uma conta contábil.`);
  }

  const entidadeId = parcela.entidade_id;
  const pagar = parcela.especie === 'pagar';
  const contaCaixa = contaBancaria
    ? repo.contaPorId(contaBancaria.conta_id)
    : planoContas.chave(entidadeId, 'caixa');
  const contraConta = planoContas.chave(entidadeId, pagar ? 'fornecedores' : 'clientes');
  const movimentado = valor + juros + multa - desconto;   // o que de fato entra/sai

  const linhas = [];
  const somar = (contaId, deb, cred, extras = {}) => {
    if (!deb && !cred) return;
    linhas.push(Object.assign({ contaId, debitoCents: deb, creditoCents: cred, refTipo: 'parcela', refId: parcela.id }, extras));
  };

  if (pagar) {
    somar(contraConta.id, valor, 0, { contraparteId: parcela.contraparte_id });
    somar(planoContas.chave(entidadeId, 'jurosPagos').id, juros + multa, 0);
    somar(contaCaixa.id, 0, movimentado);
    somar(planoContas.chave(entidadeId, 'descontosObtidos').id, 0, desconto);
  } else {
    somar(contaCaixa.id, movimentado, 0);
    somar(planoContas.chave(entidadeId, 'descontosConcedidos').id, desconto, 0);
    somar(contraConta.id, 0, valor, { contraparteId: parcela.contraparte_id });
    somar(planoContas.chave(entidadeId, 'jurosRecebidos').id, 0, juros + multa);
  }

  return transacao(() => {
    const id = novoId();
    const r = ledger.lancar({
      entidadeId, data: d.data, competencia: competenciaDe(d.data),
      memo: `${pagar ? 'Pagamento' : 'Recebimento'}: ${parcela.descricao || parcela.documento || 'parcela ' + parcela.numero}`.slice(0, 300),
      origem: 'manual', origemRef: parcela.id,
      idempotencia: d.idempotencia || `liquidacao:${id}`,
      linhas,
    });

    repo.exec(
      `INSERT INTO fin_liquidacoes (id, tenant_id, parcela_id, data, valor_cents, juros_cents, multa_cents,
         desconto_cents, conta_bancaria_id, meio, lote_id, criado_em, criado_por)
       VALUES (:id, :tenant, :p, :data, :valor, :juros, :multa, :desc, :cb, :meio, :lote, :agora, :por)`,
      { id, p: parcela.id, data: d.data, valor, juros, multa, desc: desconto,
        cb: d.contaBancariaId || '', meio: d.meio || '', lote: r.lote.id,
        agora: nowISO(), por: tenancy.userAtual() });

    const pagoNovo = parcela.pago_cents + valor;
    atualizarSaldos(parcela, pagoNovo);

    auditoria.registrar('parcela.liquidar', {
      objetoTipo: 'parcela', objetoId: parcela.id,
      motivo: d.observacao || '',
      detalhe: {
        especie: parcela.especie, valor_cents: valor, juros_cents: juros, multa_cents: multa,
        desconto_cents: desconto, movimentado_cents: movimentado, meio: d.meio || '',
        lote_id: r.lote.id, quitou: pagoNovo >= parcela.valor_cents,
      },
    });

    return {
      liquidacaoId: id, lote: r.lote,
      parcela: { id: parcela.id, pagoCents: pagoNovo, saldoCents: parcela.valor_cents - pagoNovo, status: statusDaParcela(parcela.valor_cents, pagoNovo) },
      movimentadoCents: movimentado,
    };
  });
}

const statusDaParcela = (valor, pago) => (pago >= valor ? 'liquidada' : pago > 0 ? 'parcial' : 'aberta');

/** Atualiza a parcela e, se todas fecharem, o título. */
function atualizarSaldos(parcela, pagoNovo) {
  repo.exec(
    `UPDATE fin_parcelas SET pago_cents = :pago, status = :status, atualizado_em = :agora
      WHERE tenant_id = :tenant AND id = :id`,
    { id: parcela.id, pago: pagoNovo, status: statusDaParcela(parcela.valor_cents, pagoNovo), agora: nowISO() });

  const abertas = repo.q(
    `SELECT COUNT(*) AS n FROM fin_parcelas
      WHERE tenant_id = :tenant AND titulo_id = :t AND status IN ('aberta','parcial')`,
    { t: parcela.titulo_id })[0].n;
  repo.exec(
    `UPDATE fin_titulos SET status = :status, atualizado_em = :agora
      WHERE tenant_id = :tenant AND id = :t AND status <> 'cancelado'`,
    { t: parcela.titulo_id, status: abertas === 0 ? 'liquidado' : 'aberto', agora: nowISO() });
}

/**
 * Estorna uma liquidação: reverte o lote no razão e devolve o saldo à
 * parcela. Não apaga a liquidação — marca `estornada`, para que o
 * histórico continue mostrando que houve o pagamento e a volta dele.
 */
function estornar(liquidacaoId, { motivo }) {
  if (!String(motivo || '').trim()) throw new ErroDeLiquidacao('Estorno de liquidação exige motivo.');
  const l = repo.q('SELECT * FROM fin_liquidacoes WHERE tenant_id = :tenant AND id = :id', { id: liquidacaoId })[0];
  if (!l) throw new ErroDeLiquidacao('Liquidação não encontrada.');
  if (l.estornada) throw new ErroDeLiquidacao('Esta liquidação já foi estornada.');

  const parcela = carregarParcela(l.parcela_id);

  return transacao(() => {
    let estorno = null;
    if (l.lote_id) {
      const lote = repo.lotePorId(l.lote_id);
      if (lote && lote.status === 'contabilizado') {
        estorno = ledger.estornar(l.lote_id, { motivo: `Estorno de liquidação: ${motivo}` });
      }
    }
    repo.exec(
      "UPDATE fin_liquidacoes SET estornada = 1 WHERE tenant_id = :tenant AND id = :id", { id: liquidacaoId });

    const pagoNovo = Math.max(0, parcela.pago_cents - l.valor_cents);
    atualizarSaldos(parcela, pagoNovo);

    auditoria.registrar('parcela.estornar_liquidacao', {
      objetoTipo: 'liquidacao', objetoId: liquidacaoId, motivo,
      detalhe: {
        parcela_id: parcela.id, valor_cents: l.valor_cents,
        lote_estorno: estorno ? estorno.estorno.id : null,
        pago_antes: parcela.pago_cents, pago_depois: pagoNovo,
      },
    });
    return {
      liquidacaoId, estorno: estorno ? estorno.estorno : null,
      parcela: { id: parcela.id, pagoCents: pagoNovo, saldoCents: parcela.valor_cents - pagoNovo },
    };
  });
}

const listarDaParcela = (parcelaId) => repo.q(
  'SELECT * FROM fin_liquidacoes WHERE tenant_id = :tenant AND parcela_id = :p ORDER BY data, criado_em',
  { p: parcelaId }).map(l => ({
    id: l.id, data: l.data, valorCents: l.valor_cents, jurosCents: l.juros_cents,
    multaCents: l.multa_cents, descontoCents: l.desconto_cents,
    movimentadoCents: l.valor_cents + l.juros_cents + l.multa_cents - l.desconto_cents,
    meio: l.meio, contaBancariaId: l.conta_bancaria_id, loteId: l.lote_id,
    estornada: l.estornada === 1,
  }));

/**
 * Programar pagamento é NÍVEL 3 (rbac): registra a ORDEM, com aprovação e
 * alçada. **Não executa transferência bancária** — o produto não tem, nem
 * está autorizado a ter, integração de pagamento (ARCHITECTURE §11).
 * Aprovada, a ordem vira liquidação; quem move o dinheiro é uma pessoa.
 */
function prepararOrdemDePagamento({ parcelaId, data, valorCents, jurosCents = 0, multaCents = 0, descontoCents = 0, contaBancariaId = '', meio = '' }) {
  const parcela = carregarParcela(parcelaId);
  if (parcela.especie !== 'pagar') throw new ErroDeLiquidacao('Ordem de pagamento só vale para título a pagar.');
  const contraparte = parcela.contraparte_id ? repo.contraparte(parcela.contraparte_id) : null;
  const banco = contaBancariaId ? repo.contaBancaria(contaBancariaId) : null;
  const total = valorCents + jurosCents + multaCents - descontoCents;

  return {
    payload: { parcelaId, data, valorCents, jurosCents, multaCents, descontoCents, contaBancariaId, meio },
    valorCents: total,
    // A prévia é o que o aprovador lê. Traz favorecido, conta de destino
    // e o total — os três dados que um desvio de pagamento alteraria.
    previa: {
      favorecido: contraparte ? contraparte.nome : '(sem cadastro)',
      documento: parcela.documento,
      descricao: parcela.descricao,
      vencimento: parcela.vencimento,
      principal: dinheiro.formatar(valorCents),
      encargos: dinheiro.formatar(jurosCents + multaCents),
      desconto: dinheiro.formatar(descontoCents),
      totalASair: dinheiro.formatar(total),
      contaDeSaida: banco ? banco.nome : '(caixa)',
      meio,
      dadosBancariosDoFavorecido: contraparte
        ? require('./contrapartes').mascarar(require('./db').j.parse(contraparte.dados_bancarios, {}))
        : null,
    },
  };
}

module.exports = {
  ErroDeLiquidacao, MEIOS, liquidar, estornar, listarDaParcela,
  prepararOrdemDePagamento, carregarParcela, statusDaParcela,
};
