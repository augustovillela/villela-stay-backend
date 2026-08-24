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

function configurar({ mpFetch } = {}) {
  _mpFetch = typeof mpFetch === 'function' ? mpFetch : null;
  return { disponivel: configurado() };
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
function paraTransacoes(pagamentos) {
  const linhas = [];
  for (const p of pagamentos) {
    if (p.status !== 'approved') continue;
    const data = so(p.date_approved || p.date_created, 10);
    if (!RE_DATA.test(data)) continue;

    const bruto = Math.round((Number(p.transaction_amount) || 0) * 100);
    if (!bruto) continue;

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

    const tarifa = tarifaCents(p);
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
  return linhas;
}

const AVISO_ESCOPO =
  'Traz apenas PAGAMENTOS RECEBIDOS. Saques para o banco, transferências enviadas e outros ' +
  'movimentos não entram — a API de relatório de liberações não está habilitada nesta conta. ' +
  'Por isso a conciliação vai acusar diferença contra o saldo real do Mercado Pago, e isso é o ' +
  'esperado, não um defeito.';

/**
 * Prévia: mostra o que SERIA importado, sem gravar nada. É o primeiro
 * contato com a conta real — olhar antes de deixar entrar no razão.
 */
async function previa({ desde, ate }) {
  const { pagamentos, total, truncado } = await buscarPagamentos({ desde, ate });
  const linhas = paraTransacoes(pagamentos);
  const entradas = linhas.filter(l => l.valorCents > 0);
  const tarifas = linhas.filter(l => l.valorCents < 0);
  const somar = (ls) => ls.reduce((s, l) => s + l.valorCents, 0);
  return {
    periodo: { desde, ate },
    pagamentosEncontrados: total,
    aprovados: entradas.length,
    linhas: linhas.slice(0, 200),
    resumo: {
      brutoCents: somar(entradas), bruto: dinheiro.formatar(somar(entradas)),
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
  const linhas = paraTransacoes(pagamentos);
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
  configurar, configurado, buscarPagamentos, paraTransacoes, tarifaCents, previa, sincronizar,
};
