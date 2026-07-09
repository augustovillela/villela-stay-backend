// =====================================================================
// Villela Academy — billing (FASE 4): checkout Mercado Pago de produto
// único, webhook idempotente, consulta segura e reembolso.
// Regra de ouro: matrícula NUNCA é criada pelo retorno do navegador —
// só por webhook confirmado ou consulta server-side à API do MP.
// Comissões oficiais: plataforma 10% (snapshot por pedido); afiliado F5.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const ct = require('./repo-conteudo');

let _mpFetch = null;
let _notificar = async () => {};
function configurar({ mpFetch, notificar }) {
  _mpFetch = typeof mpFetch === 'function' ? mpFetch : null;
  if (notificar) _notificar = notificar;
}
const ativo = () => !!_mpFetch;
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

const Pedidos = {
  obter(id) { return db.prepare('SELECT * FROM orders WHERE id = ?').get(id) || null; },
  doUsuario(userId) { return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY criado_em DESC LIMIT 100').all(userId); },
  doProdutor(producerId) {
    return db.prepare(`SELECT o.*, u.nome AS comprador_nome, u.email AS comprador_email FROM orders o
      JOIN users u ON u.id = o.user_id WHERE o.producer_id = ? ORDER BY o.criado_em DESC LIMIT 200`).all(producerId);
  },
  listarAdmin({ status, n } = {}) {
    let sql = `SELECT o.*, u.email AS comprador_email FROM orders o JOIN users u ON u.id = o.user_id`;
    const args = [];
    if (status) { sql += ' WHERE o.status = ?'; args.push(status); }
    sql += ' ORDER BY o.criado_em DESC LIMIT ?'; args.push(Math.min(parseInt(n, 10) || 200, 1000));
    return db.prepare(sql).all(...args);
  },
  vendasDoMes(producerId) {
    const mes = new Date().toISOString().slice(0, 7);
    const r = db.prepare(`SELECT COALESCE(SUM(liquido_produtor_centavos),0) v FROM orders
      WHERE producer_id = ? AND status = 'paga' AND pago_em >= ?`).get(producerId, mes);
    return r.v;
  },
  kpisPlataforma() {
    const g = (sql) => db.prepare(sql).get();
    const pagas = g("SELECT COALESCE(SUM(valor_centavos),0) v, COALESCE(SUM(comissao_plataforma_centavos),0) c, COUNT(*) n FROM orders WHERE status = 'paga'");
    return {
      gmv_centavos: pagas.v, receita_plataforma_centavos: pagas.c, vendas: pagas.n,
      pedidos_pendentes: g("SELECT COUNT(*) n FROM orders WHERE status = 'pendente'").n,
      reembolsos: g("SELECT COUNT(*) n FROM orders WHERE status = 'reembolsada'").n,
    };
  },
};

// cria o pedido e (se pago) a preferência do MP; produto grátis matricula direto
async function criarCheckout(usuario, productId, baseUrl) {
  const p = ct.Produtos.obter(productId);
  if (!p || p.status !== 'publicado') throw new Error('Produto não disponível para compra.');
  if (ct.Matriculas.ativa(usuario.id, p.id)) throw new Error('Você já tem acesso a este produto.');
  const pendente = db.prepare("SELECT * FROM orders WHERE user_id = ? AND product_id = ? AND status = 'pendente'").get(usuario.id, p.id);
  const valor = p.preco_promo_centavos || p.preco_centavos || 0;
  const comissoes = repo.Config.obter('comissoes', { plataforma_pct: 10 });
  const pct = Math.max(0, Math.min(100, parseInt(comissoes.plataforma_pct, 10) || 10));
  const comissao = Math.round(valor * pct / 100);

  // grátis: matrícula imediata (sem MP), pedido 'paga' de valor 0 p/ trilha
  if (!valor) {
    const id = novoId();
    transacao(() => {
      db.prepare(`INSERT INTO orders (id, user_id, product_id, produto_titulo, producer_id, valor_centavos,
        plataforma_pct, comissao_plataforma_centavos, liquido_produtor_centavos, status, criado_em, pago_em)
        VALUES (?, ?, ?, ?, ?, 0, ?, 0, 0, 'paga', ?, ?)`).run(id, usuario.id, p.id, p.titulo, p.producer_id, pct, nowISO(), nowISO());
      ct.Matriculas.criar(p.id, usuario.email, 'checkout-gratis', 'compra');
    });
    return { gratis: true, order_id: id };
  }

  if (!ativo()) throw new Error('Pagamento online indisponível no momento. Use o formulário de interesse que o produtor entra em contato.');
  const id = (pendente && pendente.id) || novoId();
  if (!pendente) {
    db.prepare(`INSERT INTO orders (id, user_id, product_id, produto_titulo, producer_id, valor_centavos,
      plataforma_pct, comissao_plataforma_centavos, liquido_produtor_centavos, status, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?)`)
      .run(id, usuario.id, p.id, p.titulo, p.producer_id, valor, pct, comissao, valor - comissao, nowISO());
  }
  const pref = await _mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ title: s(p.titulo, 120), quantity: 1, unit_price: Math.round(valor) / 100, currency_id: 'BRL' }],
      payer: { email: usuario.email },
      external_reference: 'academy:' + id,
      back_urls: { success: `${baseUrl}/academy/obrigado?pedido=${id}`, pending: `${baseUrl}/academy/obrigado?pedido=${id}`, failure: `${baseUrl}/academy/obrigado?pedido=${id}` },
      auto_return: 'approved',
      notification_url: `${baseUrl}/academy/webhooks/mercadopago`,
      statement_descriptor: 'VILLELA ACADEMY',
    }),
  });
  db.prepare('UPDATE orders SET mp_preference_id = ?, atualizado_em = ? WHERE id = ?').run(s(pref.id, 80), nowISO(), id);
  return { order_id: id, init_point: pref.init_point || pref.sandbox_init_point || '' };
}

// aplica o resultado de um pagamento do MP a um pedido (idempotente)
function aplicarPagamento(pay) {
  const ref = String(pay.external_reference || '');
  if (!ref.startsWith('academy:')) return { resultado: 'ignorado' };
  const order = Pedidos.obter(ref.slice('academy:'.length));
  if (!order) return { resultado: 'ignorado' };
  db.prepare('INSERT INTO payment_events (quando, order_id, mp_payment_id, status, payload) VALUES (?, ?, ?, ?, ?)')
    .run(nowISO(), order.id, s(pay.id, 40), s(pay.status, 30), j.str(pay).slice(0, 8000));

  const st = String(pay.status || '');
  if (st === 'approved') {
    if (order.status === 'paga') return { resultado: 'ja-paga' }; // idempotente
    transacao(() => {
      db.prepare("UPDATE orders SET status = 'paga', mp_payment_id = ?, pago_em = ?, atualizado_em = ? WHERE id = ?")
        .run(s(pay.id, 40), nowISO(), nowISO(), order.id);
      const u = repo.Usuarios.porId(order.user_id);
      if (u && !ct.Matriculas.ativa(u.id, order.product_id)) ct.Matriculas.criar(order.product_id, u.email, 'mercadopago', 'compra');
    });
    repo.Auditoria.registrar({ quem: 'mercadopago', acao: 'pedido.pago', entidade: 'orders', entidade_id: order.id, detalhe: `R$ ${(order.valor_centavos / 100).toFixed(2)}` });
    _notificar(`💰 Villela Academy: venda paga — "${order.produto_titulo}" (R$ ${(order.valor_centavos / 100).toFixed(2)}). Comissão da plataforma: R$ ${(order.comissao_plataforma_centavos / 100).toFixed(2)}.`).catch(() => {});
    return { resultado: 'paga' };
  }
  if (['rejected', 'cancelled'].includes(st) && order.status === 'pendente') {
    db.prepare('UPDATE orders SET status = ?, mp_payment_id = ?, atualizado_em = ? WHERE id = ?')
      .run(st === 'rejected' ? 'recusada' : 'cancelada', s(pay.id, 40), nowISO(), order.id);
    return { resultado: st };
  }
  if (['refunded', 'charged_back'].includes(st) && order.status === 'paga') {
    aplicarReembolso(order, { motivo: st === 'charged_back' ? 'chargeback (MP)' : 'reembolso (MP)', quem: 'mercadopago' });
    return { resultado: 'reembolsada' };
  }
  return { resultado: 'sem-acao:' + st };
}

function aplicarReembolso(order, { motivo, quem, mp_refund_id } = {}) {
  transacao(() => {
    db.prepare("UPDATE orders SET status = 'reembolsada', atualizado_em = ? WHERE id = ?").run(nowISO(), order.id);
    db.prepare('INSERT INTO refunds (id, order_id, valor_centavos, motivo, quem, mp_refund_id, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(novoId(), order.id, order.valor_centavos, s(motivo, 300), s(quem, 80), s(mp_refund_id, 60), nowISO());
    const e = db.prepare("SELECT id FROM enrollments WHERE user_id = ? AND product_id = ? AND status = 'ativa'").get(order.user_id, order.product_id);
    if (e) db.prepare("UPDATE enrollments SET status = 'revogada' WHERE id = ?").run(e.id);
  });
  repo.Auditoria.registrar({ quem: s(quem, 80), acao: 'pedido.reembolsar', entidade: 'orders', entidade_id: order.id, detalhe: s(motivo, 200) });
  _notificar(`↩️ Villela Academy: reembolso — "${order.produto_titulo}" (R$ ${(order.valor_centavos / 100).toFixed(2)}). Acesso revogado.`).catch(() => {});
}

// reembolso disparado por admin/staff (chama o MP e aplica localmente)
async function reembolsar(orderId, { motivo, quem } = {}) {
  const order = Pedidos.obter(orderId);
  if (!order) throw new Error('Pedido não encontrado.');
  if (order.status !== 'paga') throw new Error('Só pedidos pagos podem ser reembolsados.');
  let mpRefundId = '';
  if (order.valor_centavos > 0) {
    if (!ativo()) throw new Error('Mercado Pago não configurado.');
    if (!order.mp_payment_id) throw new Error('Pedido sem pagamento do MP associado.');
    const r = await _mpFetch(`/v1/payments/${order.mp_payment_id}/refunds`, { method: 'POST', body: JSON.stringify({}) });
    mpRefundId = s(r && r.id, 60);
  }
  aplicarReembolso(order, { motivo: motivo || 'reembolso manual', quem, mp_refund_id: mpRefundId });
  return { ok: true };
}

// webhook do MP: salva cru, busca o pagamento e aplica (idempotente)
async function processarWebhook(body, query) {
  const topico = s((body && body.type) || (query && (query.type || query.topic)), 40);
  const mpId = s((body && body.data && body.data.id) || (query && (query['data.id'] || query.id)), 60);
  const reg = db.prepare('INSERT INTO webhook_events (quando, topico, mp_id, payload, resultado) VALUES (?, ?, ?, ?, ?)')
    .run(nowISO(), topico, mpId, j.str({ body, query }).slice(0, 8000), '');
  const marcar = (r) => db.prepare('UPDATE webhook_events SET resultado = ? WHERE id = ?').run(s(r, 200), reg.lastInsertRowid);
  try {
    if (topico !== 'payment' || !mpId || !ativo()) return marcar('ignorado');
    const pay = await _mpFetch(`/v1/payments/${mpId}`);
    marcar(aplicarPagamento(pay).resultado);
  } catch (e) { marcar('erro:' + e.message); }
}

// consulta segura sob demanda ("já paguei"): busca pagamentos pelo external_reference
async function conferirPedido(orderId) {
  const order = Pedidos.obter(orderId);
  if (!order) throw new Error('Pedido não encontrado.');
  if (order.status !== 'pendente' || !ativo()) return { status: order.status };
  const r = await _mpFetch(`/v1/payments/search?external_reference=${encodeURIComponent('academy:' + orderId)}&sort=date_created&criteria=desc`);
  for (const pay of (r && r.results) || []) aplicarPagamento(pay);
  return { status: Pedidos.obter(orderId).status };
}

module.exports = { configurar, ativo, Pedidos, criarCheckout, processarWebhook, conferirPedido, reembolsar, aplicarPagamento };
