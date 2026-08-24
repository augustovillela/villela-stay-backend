// =====================================================================
// Villela Finance — contas a pagar e a receber (títulos e parcelas).
//
// Um título é o COMPROMISSO (a nota, o contrato, a reserva). A parcela é
// o vencimento. A liquidação (liquidacoes.js) é o dinheiro saindo ou
// entrando. Os três são coisas diferentes, e é por confundi-los que
// sistema financeiro pequeno erra: "paguei" vira "lancei" e o regime de
// competência se perde.
//
// Aqui vale a COMPETÊNCIA: o título provisiona no razão quando o fato
// econômico acontece, não quando o dinheiro se move. O caixa é problema
// da liquidação.
//
// Duas somas que TÊM de fechar, e o código recusa se não fecharem:
//   • soma do rateio  == valor do título (senão o resultado por imóvel mente)
//   • soma das parcelas == valor do título (senão o aging mente)
// =====================================================================
'use strict';
const { transacao, novoId, nowISO, competenciaDe } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');
const planoContas = require('./plano-contas');
const tenancy = require('./tenancy');

class ErroDeTitulo extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDeTitulo'; this.status = 400; this.detalhe = detalhe || null; }
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const ESPECIES = ['pagar', 'receber'];

/** Soma dias a uma data ISO sem passar por fuso (UTC puro). */
function maisDias(data, dias) {
  const d = new Date(data + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Mesmo dia do mês N meses adiante; se o mês não tem o dia, cai no último. */
function maisMeses(data, meses) {
  const [a, m, d] = data.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Detecta nota já lançada. Mesmo fornecedor + mesmo número de documento é
 * duplicata quase certa — é o erro mais comum de contas a pagar, e o mais
 * caro (paga-se duas vezes).
 */
function procurarDuplicata(entidadeId, { contraparteId, documento, valorCents, especie }) {
  if (!documento || !contraparteId) return null;
  const igual = repo.q(
    `SELECT * FROM fin_titulos
      WHERE tenant_id = :tenant AND entidade_id = :ent AND especie = :especie
        AND contraparte_id = :cp AND documento = :doc AND status <> 'cancelado' LIMIT 1`,
    { ent: entidadeId, especie, cp: contraparteId, doc: String(documento) })[0];
  if (!igual) return null;
  return {
    titulo: igual,
    mesmoValor: igual.valor_cents === valorCents,
    // Valor diferente pode ser complemento legítimo da mesma nota; valor
    // igual é duplicata até prova em contrário.
    certeza: igual.valor_cents === valorCents,
  };
}

/** Normaliza o rateio e confere que ele fecha com o valor do título. */
function prepararRateio(entidadeId, rateio, valorCents, especie) {
  if (!Array.isArray(rateio) || !rateio.length) {
    throw new ErroDeTitulo('Informe ao menos uma linha de rateio (a conta contábil da despesa ou da receita).');
  }
  const naturezaEsperada = especie === 'pagar' ? 'despesa' : 'receita';
  const linhas = rateio.map((r, i) => {
    const conta = r.contaId ? repo.contaPorId(r.contaId) : repo.contaPorCodigo(entidadeId, r.contaCodigo);
    if (!conta) throw new ErroDeTitulo(`Rateio ${i + 1}: conta ${r.contaId || r.contaCodigo} não existe.`);
    if (conta.entidade_id !== entidadeId) throw new ErroDeTitulo(`Rateio ${i + 1}: a conta ${conta.codigo} é de outra empresa.`);
    if (conta.aceita_lancamento !== 1) throw new ErroDeTitulo(`Rateio ${i + 1}: ${conta.codigo} é conta sintética.`);
    // Aviso, não erro: há casos legítimos (ativo imobilizado numa compra).
    const avisoNatureza = conta.natureza !== naturezaEsperada
      ? `a conta ${conta.codigo} é de ${conta.natureza}, e o esperado num título a ${especie} seria ${naturezaEsperada}`
      : '';
    if (r.centroCustoId && !repo.centroCustoPorId(r.centroCustoId)) {
      throw new ErroDeTitulo(`Rateio ${i + 1}: centro de custo ${r.centroCustoId} não existe.`);
    }
    return {
      ordem: i, contaId: conta.id, contaCodigo: conta.codigo,
      centroCustoId: r.centroCustoId || '',
      valorCents: dinheiro.naoNegativo(r.valorCents, `valor do rateio ${i + 1}`),
      memo: String(r.memo || '').slice(0, 200),
      avisoNatureza,
    };
  });
  const soma = linhas.reduce((s, l) => s + l.valorCents, 0);
  if (soma !== valorCents) {
    throw new ErroDeTitulo(
      `O rateio soma ${dinheiro.formatar(soma)} e o título vale ${dinheiro.formatar(valorCents)} ` +
      `(diferença de ${dinheiro.formatar(valorCents - soma)}).`,
      { somaRateio: soma, valorTitulo: valorCents, diferenca: valorCents - soma });
  }
  return linhas;
}

/**
 * Monta as parcelas. Aceita a lista pronta ou `{ quantidade,
 * primeiroVencimento, periodo }` — e nesse caso divide sem perder
 * centavo (o resto vai para as primeiras).
 */
function prepararParcelas(parcelas, valorCents, vencimentoPadrao) {
  if (Array.isArray(parcelas) && parcelas.length) {
    const lista = parcelas.map((p, i) => {
      if (!RE_DATA.test(String(p.vencimento || ''))) {
        throw new ErroDeTitulo(`Parcela ${i + 1}: vencimento inválido (use AAAA-MM-DD).`);
      }
      return { numero: i + 1, vencimento: p.vencimento, valorCents: dinheiro.naoNegativo(p.valorCents, `valor da parcela ${i + 1}`) };
    });
    const soma = lista.reduce((s, p) => s + p.valorCents, 0);
    if (soma !== valorCents) {
      throw new ErroDeTitulo(
        `As parcelas somam ${dinheiro.formatar(soma)} e o título vale ${dinheiro.formatar(valorCents)}.`,
        { somaParcelas: soma, valorTitulo: valorCents, diferenca: valorCents - soma });
    }
    return lista;
  }

  const quantidade = Number((parcelas && parcelas.quantidade) || 1);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 360) {
    throw new ErroDeTitulo('Número de parcelas inválido (1 a 360).');
  }
  const primeiro = (parcelas && parcelas.primeiroVencimento) || vencimentoPadrao;
  if (!RE_DATA.test(String(primeiro || ''))) throw new ErroDeTitulo('Informe o vencimento (AAAA-MM-DD).');

  const periodo = (parcelas && parcelas.periodo) || 'mensal';
  const valores = dinheiro.dividir(valorCents, quantidade);
  return valores.map((v, i) => ({
    numero: i + 1,
    vencimento: periodo === 'semanal' ? maisDias(primeiro, 7 * i)
      : periodo === 'quinzenal' ? maisDias(primeiro, 15 * i)
        : maisMeses(primeiro, i),
    valorCents: v,
  }));
}

/**
 * Cria o título, as parcelas, o rateio e — se `provisionar` — o
 * lançamento de competência no razão. Tudo numa transação: não existe
 * título sem parcela nem provisão sem título.
 */
function criar(d) {
  const entidadeId = d.entidadeId || tenancy.entidadeAtual();
  if (!ESPECIES.includes(d.especie)) throw new ErroDeTitulo(`Espécie inválida: use "pagar" ou "receber".`);
  const valorCents = dinheiro.naoNegativo(d.valorCents, 'valor do título');
  if (!valorCents) throw new ErroDeTitulo('Título de valor zero não é título.');

  const contraparte = d.contraparteId ? repo.contraparte(d.contraparteId) : null;
  if (d.contraparteId && !contraparte) throw new ErroDeTitulo('Contraparte não encontrada.');
  if (!contraparte) throw new ErroDeTitulo('Informe o fornecedor (a pagar) ou o cliente (a receber).');

  const documento = String(d.documento || '').trim().slice(0, 60);
  const dup = procurarDuplicata(entidadeId, { contraparteId: contraparte.id, documento, valorCents, especie: d.especie });
  if (dup && !d.forcar) {
    throw new ErroDeTitulo(
      dup.certeza
        ? `Já existe o documento "${documento}" de ${contraparte.nome} com o mesmo valor — é duplicata.`
        : `Já existe o documento "${documento}" de ${contraparte.nome}, com valor diferente (${dinheiro.formatar(dup.titulo.valor_cents)}). Confirme se é complemento.`,
      { duplicata: { id: dup.titulo.id, valorCents: dup.titulo.valor_cents, competencia: dup.titulo.competencia }, podeForcar: true });
  }

  const competencia = d.competencia || competenciaDe(d.vencimento || nowISO().slice(0, 10));
  if (!/^\d{4}-\d{2}$/.test(competencia)) throw new ErroDeTitulo('Competência inválida (use AAAA-MM).');

  const rateio = prepararRateio(entidadeId, d.rateio, valorCents, d.especie);
  const parcelas = prepararParcelas(d.parcelas, valorCents, d.vencimento);

  return transacao(() => {
    const id = novoId();
    repo.exec(
      `INSERT INTO fin_titulos (id, tenant_id, entidade_id, especie, contraparte_id, documento, descricao,
         competencia, valor_cents, conta_id, centro_custo_id, status, origem, origem_ref, criado_em, criado_por)
       VALUES (:id, :tenant, :ent, :especie, :cp, :doc, :desc, :comp, :valor, :conta, :cc, 'aberto', :origem, :ref, :agora, :por)`,
      { id, ent: entidadeId, especie: d.especie, cp: contraparte.id, doc: documento,
        desc: String(d.descricao || '').slice(0, 200), comp: competencia, valor: valorCents,
        conta: rateio[0].contaId, cc: rateio[0].centroCustoId,
        origem: d.origem || 'manual', ref: d.origemRef || '',
        agora: nowISO(), por: tenancy.userAtual() });

    for (const r of rateio) {
      repo.exec(
        `INSERT INTO fin_titulo_rateio (id, tenant_id, titulo_id, ordem, conta_id, centro_custo_id, valor_cents, memo, criado_em)
         VALUES (:id, :tenant, :t, :ordem, :conta, :cc, :valor, :memo, :agora)`,
        { id: novoId(), t: id, ordem: r.ordem, conta: r.contaId, cc: r.centroCustoId, valor: r.valorCents, memo: r.memo, agora: nowISO() });
    }
    for (const p of parcelas) {
      repo.exec(
        `INSERT INTO fin_parcelas (id, tenant_id, titulo_id, numero, vencimento, valor_cents, status, criado_em)
         VALUES (:id, :tenant, :t, :numero, :venc, :valor, 'aberta', :agora)`,
        { id: novoId(), t: id, numero: p.numero, venc: p.vencimento, valor: p.valorCents, agora: nowISO() });
    }

    let lote = null;
    if (d.provisionar !== false) {
      lote = provisionar({ entidadeId, tituloId: id, especie: d.especie, competencia, rateio, contraparteId: contraparte.id, descricao: d.descricao, data: d.dataFato || parcelas[0].vencimento });
      repo.exec('UPDATE fin_titulos SET lote_id = :lote WHERE tenant_id = :tenant AND id = :id', { id, lote: lote.id });
    }

    auditoria.registrar('titulo.criar', {
      objetoTipo: 'titulo', objetoId: id,
      motivo: d.descricao || '',
      detalhe: {
        especie: d.especie, contraparte: contraparte.nome, documento,
        valor_cents: valorCents, competencia, parcelas: parcelas.length,
        rateio: rateio.length, provisionado: !!lote, forcado_sobre_duplicata: !!(dup && d.forcar),
      },
    });
    return { titulo: buscar(id), lote, avisos: rateio.filter(r => r.avisoNatureza).map(r => r.avisoNatureza) };
  });
}

/**
 * Lançamento de competência. A pagar debita a despesa e credita
 * Fornecedores; a receber debita Clientes e credita a receita.
 */
function provisionar({ entidadeId, tituloId, especie, competencia, rateio, contraparteId, descricao, data }) {
  const contraConta = especie === 'pagar'
    ? planoContas.chave(entidadeId, 'fornecedores')
    : planoContas.chave(entidadeId, 'clientes');
  const total = rateio.reduce((s, r) => s + r.valorCents, 0);

  const linhas = rateio.map(r => ({
    contaId: r.contaId,
    debitoCents: especie === 'pagar' ? r.valorCents : 0,
    creditoCents: especie === 'pagar' ? 0 : r.valorCents,
    centroCustoId: r.centroCustoId,
    refTipo: 'titulo', refId: tituloId,
    memo: r.memo || descricao || '',
  }));
  linhas.push({
    contaId: contraConta.id,
    debitoCents: especie === 'pagar' ? 0 : total,
    creditoCents: especie === 'pagar' ? total : 0,
    contraparteId,
    refTipo: 'titulo', refId: tituloId,
    memo: descricao || '',
  });

  const r = ledger.lancar({
    entidadeId, data: data || `${competencia}-01`, competencia,
    memo: `${especie === 'pagar' ? 'Provisão' : 'Faturamento'}: ${descricao || 'título ' + tituloId}`.slice(0, 300),
    origem: 'manual', origemRef: tituloId,
    idempotencia: `titulo:provisao:${tituloId}`,
    linhas,
  });
  return r.lote;
}

/**
 * Cancela o título. Se houver liquidação, RECUSA — dinheiro que já se
 * moveu se desfaz por estorno da liquidação, não apagando o compromisso.
 */
function cancelar(id, { motivo }) {
  if (!String(motivo || '').trim()) throw new ErroDeTitulo('Cancelar título exige motivo.');
  const t = repo.q('SELECT * FROM fin_titulos WHERE tenant_id = :tenant AND id = :id', { id })[0];
  if (!t) throw new ErroDeTitulo('Título não encontrado.');
  if (t.status === 'cancelado') throw new ErroDeTitulo('Este título já está cancelado.');

  const pago = repo.q(
    `SELECT COALESCE(SUM(pago_cents),0) AS pago FROM fin_parcelas
      WHERE tenant_id = :tenant AND titulo_id = :t`, { t: id })[0].pago;
  if (pago > 0) {
    throw new ErroDeTitulo(
      `Este título já tem ${dinheiro.formatar(pago)} liquidado. Estorne a liquidação antes de cancelar.`,
      { pagoCents: pago });
  }

  return transacao(() => {
    // A provisão sai por estorno — nunca por exclusão do lote.
    let estorno = null;
    if (t.lote_id) {
      const lote = repo.lotePorId(t.lote_id);
      if (lote && lote.status === 'contabilizado') {
        estorno = ledger.estornar(t.lote_id, { motivo: `Cancelamento do título: ${motivo}` });
      }
    }
    repo.exec(
      `UPDATE fin_titulos SET status = 'cancelado', cancelado_em = :agora, cancelado_motivo = :motivo,
         atualizado_em = :agora WHERE tenant_id = :tenant AND id = :id`,
      { id, motivo: String(motivo).slice(0, 300), agora: nowISO() });
    repo.exec(
      `UPDATE fin_parcelas SET status = 'cancelada', atualizado_em = :agora
        WHERE tenant_id = :tenant AND titulo_id = :t AND status IN ('aberta','parcial')`,
      { t: id, agora: nowISO() });

    auditoria.registrar('titulo.cancelar', {
      objetoTipo: 'titulo', objetoId: id, motivo,
      detalhe: { valor_cents: t.valor_cents, lote_estorno: estorno ? estorno.estorno.id : null },
    });
    return { titulo: buscar(id), estorno: estorno ? estorno.estorno : null };
  });
}

// ---------------------------------------------------------------- leitura

function buscar(id) {
  const t = repo.q('SELECT * FROM fin_titulos WHERE tenant_id = :tenant AND id = :id', { id })[0];
  if (!t) return null;
  const contraparte = t.contraparte_id ? repo.contraparte(t.contraparte_id) : null;
  const parcelas = repo.q(
    'SELECT * FROM fin_parcelas WHERE tenant_id = :tenant AND titulo_id = :t ORDER BY numero', { t: id });
  const rateio = repo.q(
    `SELECT r.*, c.codigo AS conta_codigo, c.nome AS conta_nome, cc.codigo AS centro_codigo
       FROM fin_titulo_rateio r
       JOIN fin_contas c ON c.id = r.conta_id
       LEFT JOIN fin_centros_custo cc ON cc.id = r.centro_custo_id AND cc.tenant_id = r.tenant_id
      WHERE r.tenant_id = :tenant AND r.titulo_id = :t ORDER BY r.ordem`, { t: id });

  const pago = parcelas.reduce((s, p) => s + p.pago_cents, 0);
  return {
    id: t.id, especie: t.especie, status: t.status,
    contraparte: contraparte ? { id: contraparte.id, nome: contraparte.nome } : null,
    documento: t.documento, descricao: t.descricao, competencia: t.competencia,
    valorCents: t.valor_cents, valor: dinheiro.formatar(t.valor_cents),
    pagoCents: pago, saldoCents: t.valor_cents - pago,
    saldo: dinheiro.formatar(t.valor_cents - pago),
    loteId: t.lote_id, origem: t.origem, origemRef: t.origem_ref,
    canceladoEm: t.cancelado_em, canceladoMotivo: t.cancelado_motivo,
    parcelas: parcelas.map(p => ({
      id: p.id, numero: p.numero, vencimento: p.vencimento, status: p.status,
      valorCents: p.valor_cents, pagoCents: p.pago_cents,
      saldoCents: p.valor_cents - p.pago_cents,
    })),
    rateio: rateio.map(r => ({
      contaId: r.conta_id, contaCodigo: r.conta_codigo, contaNome: r.conta_nome,
      centroCustoId: r.centro_custo_id, centroCodigo: r.centro_codigo || '',
      valorCents: r.valor_cents, memo: r.memo,
    })),
  };
}

function listar(entidadeId, { especie = '', status = '', contraparteId = '', limite = 200 } = {}) {
  const lista = repo.q(
    `SELECT t.*, c.nome AS contraparte_nome,
            COALESCE((SELECT SUM(p.pago_cents) FROM fin_parcelas p WHERE p.tenant_id = t.tenant_id AND p.titulo_id = t.id), 0) AS pago,
            (SELECT MIN(p.vencimento) FROM fin_parcelas p WHERE p.tenant_id = t.tenant_id AND p.titulo_id = t.id AND p.status IN ('aberta','parcial')) AS proximo_vencimento
       FROM fin_titulos t
       LEFT JOIN fin_contrapartes c ON c.id = t.contraparte_id AND c.tenant_id = t.tenant_id
      WHERE t.tenant_id = :tenant AND t.entidade_id = :ent
        ${especie ? 'AND t.especie = :especie' : ''}
        ${status ? 'AND t.status = :status' : ''}
        ${contraparteId ? 'AND t.contraparte_id = :cp' : ''}
      ORDER BY proximo_vencimento IS NULL, proximo_vencimento, t.criado_em DESC
      LIMIT :limite`,
    { ent: entidadeId, especie, status, cp: contraparteId, limite });

  return lista.map(t => ({
    id: t.id, especie: t.especie, status: t.status,
    contraparte: t.contraparte_nome || '', documento: t.documento, descricao: t.descricao,
    competencia: t.competencia, valorCents: t.valor_cents, pagoCents: t.pago,
    saldoCents: t.valor_cents - t.pago, saldo: dinheiro.formatar(t.valor_cents - t.pago),
    proximoVencimento: t.proximo_vencimento || '',
  }));
}

/**
 * Aging: o saldo em aberto por faixa de atraso. É o número que responde
 * "quanto está vencido e há quanto tempo" — e a base da régua de cobrança.
 */
function aging(entidadeId, { especie = 'receber', referencia } = {}) {
  const hoje = referencia || nowISO().slice(0, 10);
  const abertas = repo.q(
    `SELECT p.*, t.especie, t.contraparte_id, t.documento, t.descricao, c.nome AS contraparte_nome
       FROM fin_parcelas p
       JOIN fin_titulos t ON t.id = p.titulo_id AND t.tenant_id = p.tenant_id
       LEFT JOIN fin_contrapartes c ON c.id = t.contraparte_id AND c.tenant_id = t.tenant_id
      WHERE p.tenant_id = :tenant AND t.entidade_id = :ent AND t.especie = :especie
        AND p.status IN ('aberta','parcial')
      ORDER BY p.vencimento`,
    { ent: entidadeId, especie });

  const FAIXAS = [
    { chave: 'a_vencer', rotulo: 'A vencer', de: -Infinity, ate: -1 },
    { chave: 'vence_hoje', rotulo: 'Vence hoje', de: 0, ate: 0 },
    { chave: 'd1_15', rotulo: '1 a 15 dias', de: 1, ate: 15 },
    { chave: 'd16_30', rotulo: '16 a 30 dias', de: 16, ate: 30 },
    { chave: 'd31_60', rotulo: '31 a 60 dias', de: 31, ate: 60 },
    { chave: 'd61_90', rotulo: '61 a 90 dias', de: 61, ate: 90 },
    { chave: 'd90_mais', rotulo: 'Mais de 90 dias', de: 91, ate: Infinity },
  ];
  const baldes = Object.fromEntries(FAIXAS.map(f => [f.chave, { ...f, totalCents: 0, quantidade: 0, itens: [] }]));

  const dias = (venc) => Math.round((Date.parse(hoje + 'T00:00:00Z') - Date.parse(venc + 'T00:00:00Z')) / 86400000);
  let totalAberto = 0, totalVencido = 0;

  for (const p of abertas) {
    const saldo = p.valor_cents - p.pago_cents;
    if (saldo <= 0) continue;
    const atraso = dias(p.vencimento);
    const faixa = FAIXAS.find(f => atraso >= f.de && atraso <= f.ate);
    const balde = baldes[faixa.chave];
    balde.totalCents += saldo;
    balde.quantidade += 1;
    if (balde.itens.length < 50) {
      balde.itens.push({
        parcelaId: p.id, tituloId: p.titulo_id, numero: p.numero,
        vencimento: p.vencimento, diasAtraso: Math.max(0, atraso),
        saldoCents: saldo, saldo: dinheiro.formatar(saldo),
        contraparte: p.contraparte_nome || '', documento: p.documento, descricao: p.descricao,
      });
    }
    totalAberto += saldo;
    if (atraso > 0) totalVencido += saldo;
  }

  return {
    especie, referencia: hoje,
    faixas: FAIXAS.map(f => ({ ...baldes[f.chave], total: dinheiro.formatar(baldes[f.chave].totalCents) })),
    totalAbertoCents: totalAberto, totalVencidoCents: totalVencido,
    totalAberto: dinheiro.formatar(totalAberto), totalVencido: dinheiro.formatar(totalVencido),
    percentualVencido: totalAberto ? Math.round(1000 * totalVencido / totalAberto) / 10 : 0,
    origem: {
      formula: 'saldo das parcelas em aberto (valor − pago), agrupado pelos dias entre o vencimento e a referência',
      fonte: 'contas a ' + especie,
    },
  };
}

/** Quem mais deve, para a régua de cobrança priorizar. */
function inadimplentes(entidadeId, { especie = 'receber', limite = 20, referencia } = {}) {
  const hoje = referencia || nowISO().slice(0, 10);
  const linhas = repo.q(
    `SELECT t.contraparte_id, c.nome AS contraparte_nome,
            COUNT(*) AS parcelas,
            SUM(p.valor_cents - p.pago_cents) AS saldo,
            MIN(p.vencimento) AS mais_antiga
       FROM fin_parcelas p
       JOIN fin_titulos t ON t.id = p.titulo_id AND t.tenant_id = p.tenant_id
       LEFT JOIN fin_contrapartes c ON c.id = t.contraparte_id AND c.tenant_id = t.tenant_id
      WHERE p.tenant_id = :tenant AND t.entidade_id = :ent AND t.especie = :especie
        AND p.status IN ('aberta','parcial') AND p.vencimento < :hoje
      GROUP BY t.contraparte_id
      ORDER BY saldo DESC LIMIT :limite`,
    { ent: entidadeId, especie, hoje, limite });

  return linhas.map(l => ({
    contraparteId: l.contraparte_id,
    contraparte: l.contraparte_nome || '(sem cadastro)',
    parcelasVencidas: l.parcelas,
    saldoCents: l.saldo, saldo: dinheiro.formatar(l.saldo),
    maisAntiga: l.mais_antiga,
    diasDaMaisAntiga: Math.round((Date.parse(hoje + 'T00:00:00Z') - Date.parse(l.mais_antiga + 'T00:00:00Z')) / 86400000),
  }));
}

module.exports = {
  ErroDeTitulo, ESPECIES, criar, cancelar, buscar, listar, aging, inadimplentes,
  procurarDuplicata, prepararRateio, prepararParcelas, provisionar, maisDias, maisMeses,
};
