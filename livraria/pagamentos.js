// =====================================================================
// Livraria Villela — camada abstrata de pagamentos
// Adapter MercadoPago (agora) + interface p/ Stripe (futuro).
// Reaproveita a MESMA conta MP do app do hóspede (MP_ACCESS_TOKEN);
// os pedidos da livraria são distinguidos por external_reference "livro:<id>".
// =====================================================================
'use strict';

const MP_BASE = 'https://api.mercadopago.com';
async function mpFetchLocal(pathname, opts) {
  const tok = process.env.MP_ACCESS_TOKEN;
  if (!tok) throw new Error('MP_ACCESS_TOKEN não configurado');
  const r = await fetch(MP_BASE + pathname, Object.assign(
    { headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' } }, opts || {}));
  if (!r.ok) throw new Error('Mercado Pago ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}

// Mapeia status do MP para o nosso vocabulário.
function normalizaStatusMP(s) {
  switch (s) {
    case 'approved': return 'aprovado';
    case 'pending': case 'in_process': case 'authorized': return 'pendente';
    case 'rejected': return 'recusado';
    case 'cancelled': return 'cancelado';
    case 'refunded': case 'charged_back': return 'reembolsado';
    default: return 'pendente';
  }
}

// mpFetch pode ser injetado (reaproveita o do server.js); senão usa o local.
function adapterMercadoPago(mpFetch = mpFetchLocal) {
  return {
    nome: 'mercadopago',
    // order: pedido do repo (com itens e cliente). urls: {success,pending,failure,notification}
    async criarCheckout(order, urls) {
      const items = (order.itens || []).map(it => ({
        title: `${it.titulo_snapshot} (${it.tipo.toUpperCase()})`,
        quantity: it.quantidade,
        currency_id: 'BRL',
        unit_price: Number((it.preco_unit / 100).toFixed(2)),
      }));
      // Desconto do cupom entra como item negativo (MP não tem campo de desconto no Checkout Pro).
      if (order.desconto > 0) {
        items.push({ title: `Desconto ${order.cupom_codigo || 'cupom'}`, quantity: 1, currency_id: 'BRL', unit_price: -Number((order.desconto / 100).toFixed(2)) });
      }
      const cli = order.cliente || {};
      const pref = await mpFetch('/checkout/preferences', {
        method: 'POST',
        body: JSON.stringify({
          items,
          external_reference: 'livro:' + order.id,
          payer: { name: cli.nome || undefined, email: cli.email || undefined },
          back_urls: { success: urls.success, pending: urls.pending, failure: urls.failure },
          auto_return: 'approved',
          notification_url: urls.notification,
          statement_descriptor: 'VILLELALIVROS',
          metadata: { order_id: order.id, origem: 'livraria' },
        }),
      });
      return { url: pref.init_point || pref.sandbox_init_point, ref: pref.id, raw: pref };
    },
    // Consulta um pagamento e devolve dados normalizados.
    async consultarPagamento(paymentId) {
      const pay = await mpFetch('/v1/payments/' + paymentId).catch(() => null);
      if (!pay) return null;
      return {
        provider_payment_id: String(pay.id),
        status: normalizaStatusMP(pay.status),
        externalRef: String(pay.external_reference || ''),
        valor: Math.round((Number(pay.transaction_amount) || 0) * 100),
        metodo: pay.payment_type_id || pay.payment_method_id || '',
        raw: pay,
      };
    },
  };
}

// Stub Stripe — mesma interface, para plugar no futuro sem tocar nas rotas.
function adapterStripe() {
  return {
    nome: 'stripe',
    async criarCheckout() { throw new Error('Stripe ainda não configurado (Fase 3).'); },
    async consultarPagamento() { throw new Error('Stripe ainda não configurado (Fase 3).'); },
  };
}

// Registro de provedores.
function criarPagamentos({ mpFetch } = {}) {
  const provedores = {
    mercadopago: adapterMercadoPago(mpFetch),
    stripe: adapterStripe(),
  };
  return {
    provedor(nome) { return provedores[nome] || provedores.mercadopago; },
    disponivel() { return !!process.env.MP_ACCESS_TOKEN; },
    normalizaStatusMP,
  };
}

module.exports = { criarPagamentos, normalizaStatusMP };
