// =====================================================================
// Vitrine — camada de PROVEDORES DE PAGAMENTO.
//
// Contrato: todo provedor implementa
//   criar(order, payment)        → { ref, status, instrucoes }
//   reembolsar(payment, valor)   → { ok }
//   tarifa(totalCentavos)        → centavos (tarifa do processador)
//
// 'simulado' é o provedor do MVP: nenhum dinheiro real circula, e a
// interface diz isso com todas as letras. 'mercadopago-split' é o
// contrato honesto da fase 6: sem credencial ele se declara indisponível
// e RECUSA operar — nunca finge (padrão do Growth OS: integração externa
// é contrato honesto, sem URL nem status inventados).
//
// O status que o usuário vê SEMPRE vem do servidor, e toda mudança passa
// por processarEvento(), que é idempotente: `evento_id` é UNIQUE em
// payment_events — o mesmo evento entregue duas vezes só processa uma.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const { s, cent, inteiro } = repo;

// tarifa simulada do processador: R$ 0,99 + 3,49% do total, em aritmética
// inteira de basis points. É fictícia, mas existe de propósito: mostra ao
// admin que a comissão de 5% NÃO é o líquido da plataforma.
const TARIFA_FIXA_CENTAVOS = 99;
const TARIFA_BP = 349;

const Provedores = {
  simulado: {
    nome: 'Pagamento simulado (nenhum valor real é cobrado)',
    disponivel: () => true,
    criar(order) {
      return {
        ref: 'SIM-' + crypto.randomBytes(8).toString('hex').toUpperCase(),
        status: 'pendente',
        instrucoes: 'Ambiente de demonstração: aprove ou recuse o pagamento pelo botão "Simular pagamento". Nenhum valor real é cobrado.',
      };
    },
    tarifa(totalCentavos) { return TARIFA_FIXA_CENTAVOS + Math.round(cent(totalCentavos) * TARIFA_BP / 10000); },
    async reembolsar() { return { ok: true }; },
  },
  'mercadopago-split': {
    nome: 'Mercado Pago Split Payments',
    disponivel: () => !!(process.env.VITRINE_MP_APP_ID && process.env.VITRINE_MP_SECRET),
    criar() { throw new Error('Mercado Pago Split ainda não está configurado nesta instalação (fase 6). Use o provedor simulado.'); },
    tarifa() { return 0; },
    async reembolsar() { throw new Error('Mercado Pago Split não configurado.'); },
  },
};

function provedorAtivo() {
  const nome = s(process.env.VITRINE_PAGAMENTO_PROVEDOR, 40) || 'simulado';
  const p = Provedores[nome];
  if (!p || !p.disponivel()) return { nome: 'simulado', impl: Provedores.simulado };
  return { nome, impl: p };
}

// ---------------------------------------------------------------------
// Pagamento do pedido
// ---------------------------------------------------------------------
function criarPagamento(order) {
  const { nome, impl } = provedorAtivo();
  const intent = impl.criar(order);
  const id = novoId();
  db.prepare(`INSERT INTO payments (id, order_id, provedor, provedor_ref, status, valor_centavos, criado_em)
    VALUES (?,?,?,?,?,?,?)`)
    .run(id, order.id, nome, intent.ref, intent.status, order.total_centavos, nowISO());
  return { id, provedor: nome, ref: intent.ref, status: intent.status, instrucoes: intent.instrucoes || '' };
}

const Pagamentos = {
  obter(id) { return db.prepare('SELECT * FROM payments WHERE id = ?').get(s(id, 40)) || null; },
  doPedido(orderId) { return db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY criado_em DESC').get(s(orderId, 40)) || null; },
  porRef(ref) { return db.prepare('SELECT * FROM payments WHERE provedor_ref = ?').get(s(ref, 80)) || null; },

  // Núcleo idempotente: registra o evento (UNIQUE evento_id) e aplica o
  // efeito UMA vez. Chega aqui tanto o webhook externo quanto a simulação.
  processarEvento({ evento_id, ref, tipo, payload }) {
    const eid = s(evento_id, 120);
    if (!eid) throw new Error('Evento sem evento_id.');
    const pay = Pagamentos.porRef(ref);
    if (!pay) throw new Error('Pagamento não encontrado para a referência informada.');
    let aplicado = false;
    transacao(() => {
      try {
        db.prepare('INSERT INTO payment_events (id, payment_id, evento_id, tipo, payload, processado_em) VALUES (?,?,?,?,?,?)')
          .run(novoId(), pay.id, eid, s(tipo, 40), j.str(payload || {}), nowISO());
        aplicado = true;
      } catch (e) {
        if (!/UNIQUE/i.test(e.message)) throw e;
        aplicado = false; // evento repetido: registrado antes, nada a fazer
      }
      if (!aplicado) return;
      const { Pedidos } = require('./pedidos'); // require tardio: evita ciclo de módulos
      if (tipo === 'aprovado') {
        if (pay.status === 'aprovado') return;
        const { impl } = provedorAtivo();
        const tarifa = pay.provedor === 'simulado' ? Provedores.simulado.tarifa(pay.valor_centavos) : cent(impl.tarifa(pay.valor_centavos));
        db.prepare("UPDATE payments SET status = 'aprovado', tarifa_centavos = ?, atualizado_em = ? WHERE id = ?").run(tarifa, nowISO(), pay.id);
        Pedidos.aoPagamentoAprovado(pay.order_id, { tarifa_centavos: tarifa });
      } else if (tipo === 'em_analise') {
        if (['aprovado', 'recusado', 'reembolsado'].includes(pay.status)) return;
        db.prepare("UPDATE payments SET status = 'em_analise', atualizado_em = ? WHERE id = ?").run(nowISO(), pay.id);
        Pedidos.aoPagamentoEmAnalise(pay.order_id);
      } else if (tipo === 'recusado') {
        if (['aprovado', 'reembolsado'].includes(pay.status)) return;
        db.prepare("UPDATE payments SET status = 'recusado', atualizado_em = ? WHERE id = ?").run(nowISO(), pay.id);
        Pedidos.aoPagamentoRecusado(pay.order_id);
      } else if (tipo === 'reembolsado') {
        db.prepare("UPDATE payments SET status = 'reembolsado', atualizado_em = ? WHERE id = ?").run(nowISO(), pay.id);
      } else {
        throw new Error('Tipo de evento desconhecido: ' + s(tipo, 40));
      }
    });
    return { ok: true, aplicado, payment_id: pay.id };
  },

  async reembolsar(orderId, valorCentavos) {
    const pay = Pagamentos.doPedido(orderId);
    if (!pay || pay.status !== 'aprovado') return { ok: false, motivo: 'sem pagamento aprovado' };
    const impl = Provedores[pay.provedor] || Provedores.simulado;
    await impl.reembolsar(pay, cent(valorCentavos));
    Pagamentos.processarEvento({
      evento_id: 'refund-' + pay.id + '-' + cent(valorCentavos),
      ref: pay.provedor_ref, tipo: 'reembolsado', payload: { valor_centavos: cent(valorCentavos) },
    });
    return { ok: true };
  },

  eventos(paymentId) {
    return db.prepare('SELECT evento_id, tipo, processado_em FROM payment_events WHERE payment_id = ? ORDER BY processado_em').all(s(paymentId, 40));
  },
};

// segredo do webhook: env ou gerado e persistido na config (auditável)
function webhookSecret() {
  const env = s(process.env.VITRINE_WEBHOOK_SECRET, 120);
  if (env) return env;
  let v = repo.Config.get('webhook_secret', '');
  if (!v) { v = crypto.randomBytes(18).toString('base64url'); repo.Config.set('webhook_secret', v); }
  return v;
}

module.exports = { Provedores, provedorAtivo, criarPagamento, Pagamentos, webhookSecret, TARIFA_FIXA_CENTAVOS, TARIFA_BP };
