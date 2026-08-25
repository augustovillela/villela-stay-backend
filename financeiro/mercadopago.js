// =====================================================================
// Villela Finance — extrato do Mercado Pago (importação automática).
//
// Por que existe: o razão recebia as reservas da Stays como receita e
// NENHUM recebimento era baixado, porque o extrato nunca era importado.
// O resultado é o aging acusando 97,8% vencido — inadimplência que
// provavelmente não existe. Isto ataca metade do problema: traz o
// dinheiro que entrou. A outra metade (casar o recebimento com a parcela)
// continua sendo decisão de gente, na tela de conciliação.
//
// **Não é um segundo caminho de importação.** O adaptador converte os
// pagamentos no MESMO formato JSON que `bancos.importar()` já lê. Assim a
// dedupe por impressão digital, a sugestão de classificação, o painel de
// conciliação e a auditoria são exatamente os mesmos do arquivo subido à
// mão. Um pipeline paralelo divergiria do outro em três meses.
//
// ⚠️ **O que este adaptador NÃO vê**, e por isso não pode ser lido como
// extrato completo: saques para o banco, transferências enviadas e
// qualquer movimento que não seja pagamento recebido. A API de relatório
// de liberações (`/v1/account/release_report`) não está habilitada nesta
// conta — voltou 404 em 24/08/2026. Enquanto for assim, `sincronizar`
// devolve esse aviso junto do resultado, e o painel de conciliação vai
// acusar diferença contra o saldo real. É o comportamento correto:
// melhor a diferença aparecer do que o sistema fingir que bate.
// =====================================================================
'use strict';
const bancos = require('./bancos');
const dinheiro = require('./dinheiro');

class ErroMercadoPago extends Error {
  constructor(msg) { super(msg); this.name = 'ErroMercadoPago'; this.status = 400; }
}

const LIMITE_PAGINA = 50;          // teto da API de busca
const MAX_PAGINAS = 40;            // 2.000 pagamentos por sincronização

let _mpFetch = null;
let _idDaConta = null;

function configurar({ mpFetch, idDaConta } = {}) {
  _mpFetch = typeof mpFetch === 'function' ? mpFetch : null;
  _idDaConta = idDaConta ? String(idDaConta) : null;
  return { disponivel: configurado() };
}

/**
 * Quem somos nós na conta do Mercado Pago. É o que decide o SINAL de cada
 * pagamento — sem isso, dinheiro que saiu entra como dinheiro que entrou.
 * Buscado uma vez e guardado.
 */
async function idDaConta() {
  if (_idDaConta) return _idDaConta;
  const eu = await mp('/users/me');
  _idDaConta = String(eu && eu.id);
  return _idDaConta;
}
const configurado = () => !!(_mpFetch && (process.env.MP_ACCESS_TOKEN || _mpFetch.__mock));

async function mp(caminho) {
  if (!configurado()) throw new ErroMercadoPago('A integração com o Mercado Pago não está configurada neste servidor (MP_ACCESS_TOKEN).');
  try { return await _mpFetch(caminho); }
  catch (e) { throw new ErroMercadoPago(`O Mercado Pago não respondeu: ${e.message}`); }
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Busca paginada dos pagamentos aprovados no intervalo. */
async function buscarPagamentos({ desde, ate }) {
  if (!RE_DATA.test(String(desde)) || !RE_DATA.test(String(ate))) {
    throw new ErroMercadoPago('Informe o intervalo em AAAA-MM-DD (desde e ate).');
  }
  const achados = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const q = new URLSearchParams({
      sort: 'date_approved', criteria: 'asc',
      limit: String(LIMITE_PAGINA), offset: String(pagina * LIMITE_PAGINA),
      'range': 'date_approved',
      'begin_date': `${desde}T00:00:00.000-03:00`,
      'end_date': `${ate}T23:59:59.999-03:00`,
    });
    const r = await mp(`/v1/payments/search?${q.toString()}`);
    const lote = (r && r.results) || [];
    achados.push(...lote);
    const total = (r && r.paging && r.paging.total) || 0;
    if (lote.length < LIMITE_PAGINA || achados.length >= total) {
      return { pagamentos: achados, total, truncado: false };
    }
  }
  // Teto atingido: dizer, em vez de devolver um pedaço como se fosse tudo.
  return { pagamentos: achados, total: achados.length, truncado: true };
}

/** Soma das tarifas do Mercado Pago num pagamento, em centavos. */
function tarifaCents(p) {
  const soma = (p.fee_details || []).reduce((s, f) => s + Math.abs(Number(f.amount) || 0), 0);
  return Math.round(soma * 100);
}

const so = (v, n) => String(v == null ? '' : v).slice(0, n);

/**
 * Converte pagamentos em linhas de extrato, no formato JSON do importador.
 *
 * O valor BRUTO entra como crédito e a tarifa sai como débito SEPARADO —
 * é assim que o próprio extrato do Mercado Pago mostra, e é o que permite
 * classificar a tarifa como despesa em vez de escondê-la dentro da
 * receita líquida. Importar só o líquido faria a receita encolher sem que
 * ninguém visse para onde foi a diferença.
 */
/**
 * Direção do pagamento, do ponto de vista desta conta.
 *
 * `/v1/payments/search` devolve o que a conta RECEBEU **e** o que ela
 * PAGOU — descobri isso rodando a prévia contra a conta real: dos 50
 * pagamentos de agosto, 19 eram recebimentos, 16 eram pagamentos feitos
 * por ele e 15 eram movimento interno. Tratar todos como entrada punha
 * R$ 7 mil de dinheiro que SAIU dentro da receita.
 */
function direcao(p, eu) {
  const recebedor = String(p.collector_id || '');
  const pagador = String((p.payer && p.payer.id) || p.payer_id || '');
  const souRecebedor = recebedor === eu;
  const souPagador = pagador === eu;
  if (souRecebedor && !souPagador) return 'entrada';
  if (souPagador && !souRecebedor) return 'saida';
  // Conta consigo mesma (`money_exchange`, rendimento de saldo, partição):
  // não é entrada nem saída de dinheiro do negócio. Chutar o sinal aqui
  // seria inventar receita ou despesa — melhor devolver e declarar.
  return 'interno';
}

function paraTransacoes(pagamentos, eu) {
  if (!eu) throw new ErroMercadoPago('Sem o id da conta não dá para saber o sinal de cada pagamento.');
  const linhas = [];
  const naoClassificados = [];
  for (const p of pagamentos) {
    if (p.status !== 'approved') continue;
    const data = so(p.date_approved || p.date_created, 10);
    if (!RE_DATA.test(data)) continue;

    const valor = Math.round((Number(p.transaction_amount) || 0) * 100);
    if (!valor) continue;

    const dir = direcao(p, eu);
    if (dir === 'interno') {
      naoClassificados.push({
        id: so(p.id, 40), tipo: so(p.operation_type, 40), valorCents: valor,
        motivo: 'a conta figura dos dois lados (movimento interno do Mercado Pago) — não é entrada nem saída do negócio',
      });
      continue;
    }
    const bruto = dir === 'entrada' ? valor : -valor;

    const pagador = p.additional_info && p.additional_info.payer
      ? `${p.additional_info.payer.first_name || ''} ${p.additional_info.payer.last_name || ''}`.trim()
      : '';
    const meio = so(p.payment_method_id, 40);
    const descricao = so(p.description || p.operation_type || 'Pagamento recebido', 300);

    linhas.push({
      data, valorCents: bruto,
      descricao: `${descricao}${meio ? ' · ' + meio : ''}`,
      documento: so(p.id, 100),
      contraparte: so(pagador, 200),
      // `bruto` guarda a linha de origem: é o que permite auditar depois de
      // onde veio o lançamento, sem voltar ao Mercado Pago.
      origemMp: { id: p.id, tipo: p.operation_type, status: p.status, referencia: so(p.external_reference, 120) },
    });

    // Tarifa é cobrada de quem recebe. Num pagamento que NÓS fizemos, a
    // tarifa (se houver) já está embutida no que saiu.
    const tarifa = dir === 'entrada' ? tarifaCents(p) : 0;
    if (tarifa) {
      linhas.push({
        data, valorCents: -tarifa,
        descricao: `Tarifa Mercado Pago · pagamento ${so(p.id, 40)}`,
        documento: `${so(p.id, 90)}-tarifa`,
        contraparte: 'Mercado Pago',
        origemMp: { id: p.id, tipo: 'tarifa', status: p.status },
      });
    }
  }
  return { linhas, naoClassificados };
}

const AVISO_ESCOPO =
  'Traz os pagamentos em que esta conta é a recebedora (entrada) ou a pagadora (saída). ' +
  'Movimento interno (a conta dos dois lados) NÃO entra e vem listado à parte. Saques para o ' +
  'banco e outros lançamentos que não sejam pagamento também não entram — a API de relatório de ' +
  'liberações não está habilitada nesta conta. Por isso a conciliação pode acusar diferença ' +
  'contra o saldo real do Mercado Pago, e isso é o esperado, não um defeito.';

/**
 * Prévia: mostra o que SERIA importado, sem gravar nada. É o primeiro
 * contato com a conta real — olhar antes de deixar entrar no razão.
 */
async function previa({ desde, ate }) {
  const eu = await idDaConta();
  const { pagamentos, total, truncado } = await buscarPagamentos({ desde, ate });
  const { linhas, naoClassificados } = paraTransacoes(pagamentos, eu);
  const entradas = linhas.filter(l => l.valorCents > 0);
  const saidas = linhas.filter(l => l.valorCents < 0 && !/^Tarifa Mercado Pago/.test(l.descricao));
  const tarifas = linhas.filter(l => /^Tarifa Mercado Pago/.test(l.descricao));
  const somar = (ls) => ls.reduce((s, l) => s + l.valorCents, 0);
  return {
    periodo: { desde, ate },
    pagamentosEncontrados: total,
    recebimentos: entradas.length,
    pagamentosFeitos: saidas.length,
    linhas: linhas.slice(0, 200),
    // Movimento interno não entra e não some: fica listado, com o motivo.
    naoClassificados,
    resumo: {
      recebidoCents: somar(entradas), recebido: dinheiro.formatar(somar(entradas)),
      pagoCents: somar(saidas), pago: dinheiro.formatar(somar(saidas)),
      tarifasCents: somar(tarifas), tarifas: dinheiro.formatar(somar(tarifas)),
      liquidoCents: somar(linhas), liquido: dinheiro.formatar(somar(linhas)),
    },
    truncado,
    aviso: AVISO_ESCOPO + (truncado ? ' ⚠️ O intervalo passou do teto desta busca — reduza o período.' : ''),
  };
}

/**
 * Importa de verdade. Entrega ao `bancos.importar()`, que cuida da
 * dedupe, da sugestão e da auditoria — reimportar o mesmo período não
 * duplica nada.
 */
async function sincronizar({ entidadeId, contaBancariaId, desde, ate, dryRun = false }) {
  if (!contaBancariaId) throw new ErroMercadoPago('Escolha a conta bancária do Mercado Pago no Villela Finance.');
  const p = await previa({ desde, ate });
  if (dryRun) return Object.assign({ dryRun: true }, p);

  const { pagamentos } = await buscarPagamentos({ desde, ate });
  const { linhas } = paraTransacoes(pagamentos, await idDaConta());
  if (!linhas.length) {
    return { importado: false, motivo: 'Nenhum pagamento aprovado no período.', resumo: p.resumo, aviso: AVISO_ESCOPO };
  }
  const r = bancos.importar({
    entidadeId, contaBancariaId, formato: 'json',
    conteudo: JSON.stringify(linhas),
    fonte: `Mercado Pago ${desde}..${ate}`,
  });
  return Object.assign({ importado: true }, r, { resumoMp: p.resumo, aviso: AVISO_ESCOPO });
}

module.exports = {
  ErroMercadoPago, AVISO_ESCOPO, LIMITE_PAGINA, MAX_PAGINAS,
  configurar, configurado, idDaConta, buscarPagamentos, paraTransacoes, direcao, tarifaCents, previa, sincronizar,
};
