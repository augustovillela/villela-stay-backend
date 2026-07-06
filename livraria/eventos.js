// =====================================================================
// Livraria Villela — eventos internos para Make/n8n
// Cada evento gera um payload JSON padronizado e é postado no webhook
// LIVRARIA_EVENTS_WEBHOOK (env). Também registra em notification_logs.
// Nunca lança: automação nunca deve derrubar o fluxo de compra.
// =====================================================================
'use strict';
const { brl } = require('./repo');

// Tipos de evento (contrato com o Make/n8n).
const EVENTOS = {
  VENDA_APROVADA: 'venda_aprovada',
  PAGAMENTO_RECUSADO: 'pagamento_recusado',
  PDF_ENTREGUE: 'pdf_entregue',
  IMPRESSO_CRIADO: 'pedido_impresso_criado',
  IMPRESSO_ENVIADO: 'pedido_impresso_enviado',
  CHECKOUT_ABANDONADO: 'checkout_abandonado',
  PEDIDO_ERRO: 'pedido_com_erro',
  REEMBOLSO: 'reembolso',
  RELATORIO_CEO: 'relatorio_diario_ceo',
};

// Monta o payload padronizado a partir de um pedido do repo.
function payloadPedido(eventType, order, extra = {}) {
  const cli = order.cliente || {};
  return {
    event_type: eventType,
    order_id: order.id,
    customer: {
      nome: cli.nome || '', email: cli.email || '', whatsapp: cli.whatsapp || '',
      doc: cli.doc || '', cidade: cli.cidade || '', estado: cli.estado || '', pais: cli.pais || 'BR',
    },
    products: (order.itens || []).map(it => ({
      book_id: it.book_id, titulo: it.titulo_snapshot, tipo: it.tipo,
      quantidade: it.quantidade, preco_unit: it.preco_unit, preco_unit_fmt: brl(it.preco_unit),
    })),
    amount: order.valor_total,
    amount_fmt: brl(order.valor_total),
    cupom: order.cupom_codigo || '',
    payment_status: order.status,
    delivery_status: order.entrega_digital,
    print_status: order.impressao_status,
    origem: order.origem || {},
    created_at: order.created_at,
    ...extra,
  };
}

function criarEventos({ repo, fetchImpl = fetch }) {
  async function postar(payload) {
    const url = process.env.LIVRARIA_EVENTS_WEBHOOK;
    if (!url) return false;
    try {
      await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      return true;
    } catch (e) { console.error('[livraria evento]', e.message); return false; }
  }
  return {
    EVENTOS, payloadPedido,
    // Emite evento de pedido (não lança).
    async emitirPedido(eventType, order, extra) {
      const payload = payloadPedido(eventType, order, extra);
      const ok = await postar(payload);
      try { repo.Notif.log('webhook', { destino: 'make', assunto: eventType, order_id: order.id, status: ok ? 'enviado' : 'falha' }); } catch (_) {}
      return payload;
    },
    // Emite evento genérico (ex.: relatório diário do CEO).
    async emitir(eventType, dados) {
      const payload = { event_type: eventType, ...dados, created_at: new Date().toISOString() };
      const ok = await postar(payload);
      try { repo.Notif.log('webhook', { destino: 'make', assunto: eventType, status: ok ? 'enviado' : 'falha' }); } catch (_) {}
      return payload;
    },
  };
}

module.exports = { criarEventos, EVENTOS, payloadPedido };
