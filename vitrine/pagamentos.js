// =====================================================================
// Vitrine — camada de PROVEDORES DE PAGAMENTO.
//
// Provedores:
//   'simulado'          → MVP/demonstração: nenhum dinheiro real circula e a
//                         interface diz isso com todas as letras.
//   'mercadopago-split' → FASE 6, implementação REAL do Split Payments:
//                         OAuth por vendedor, Checkout Pro criado com o token
//                         do VENDEDOR + marketplace_fee da plataforma, webhook
//                         assinado (x-signature) e reembolso pela API.
//                         Sem credenciais (VITRINE_MP_APP_ID/SECRET) ele se
//                         declara indisponível e RECUSA operar — contrato
//                         honesto, nada de status inventado. Com credenciais
//                         de TESTE do Mercado Pago, roda em sandbox; nenhum
//                         valor real circula até o Augusto trocar por
//                         credenciais de produção.
//
// O status que o usuário vê SEMPRE vem do servidor, e toda mudança passa
// por processarEvento(), que é idempotente: `evento_id` é UNIQUE em
// payment_events — o mesmo evento entregue duas vezes só processa uma.
//
// Dinheiro interno em CENTAVOS INTEIROS; a API do MP fala em decimais —
// a conversão é string-based (centavosDecimal), nunca aritmética float.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const { s, cent } = repo;

// fetch injetável: o selftest troca por um mock sem tocar na rede
let _fetch = (...a) => globalThis.fetch(...a);
function setFetch(fn) { _fetch = fn || ((...a) => globalThis.fetch(...a)); }

const MP_API = 'https://api.mercadopago.com';
const MP_AUTH = 'https://auth.mercadopago.com.br/authorization';

// centavos (int) → decimal exato p/ APIs externas: 12345 → 123.45 (sem float)
function centavosDecimal(c) {
  const v = cent(c);
  return Number(Math.trunc(v / 100) + '.' + String(v % 100).padStart(2, '0'));
}

// tarifa simulada do processador: R$ 0,99 + 3,49% do total, em aritmética
// inteira de basis points. É fictícia, mas existe de propósito: mostra ao
// admin que a comissão de 5% NÃO é o líquido da plataforma.
const TARIFA_FIXA_CENTAVOS = 99;
const TARIFA_BP = 349;

const mpCfg = () => ({
  appId: s(process.env.VITRINE_MP_APP_ID, 80),
  secret: s(process.env.VITRINE_MP_SECRET, 120),
  webhookSecret: s(process.env.VITRINE_MP_WEBHOOK_SECRET, 120),
});

// ---------------------------------------------------------------------
// Tokens OAuth do vendedor (Split: o pagamento é criado na conta DELE)
// ---------------------------------------------------------------------
const MPTokens = {
  obter(userId) { return db.prepare('SELECT * FROM seller_mp_tokens WHERE user_id = ?').get(s(userId, 40)) || null; },
  salvar(userId, t) {
    const expira = t.expires_in ? new Date(Date.now() + Number(t.expires_in) * 1000).toISOString() : '';
    db.prepare(`INSERT INTO seller_mp_tokens (user_id, mp_user_id, access_token, refresh_token, public_key, live_mode, expira_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET mp_user_id=excluded.mp_user_id, access_token=excluded.access_token,
        refresh_token=excluded.refresh_token, public_key=excluded.public_key, live_mode=excluded.live_mode,
        expira_em=excluded.expira_em, atualizado_em=excluded.atualizado_em`)
      .run(s(userId, 40), String(t.user_id || ''), s(t.access_token, 200), s(t.refresh_token, 200),
        s(t.public_key, 120), t.live_mode ? 1 : 0, expira, nowISO());
    db.prepare('UPDATE seller_profiles SET mp_conectado = 1, mp_user_id = ? WHERE user_id = ?').run(String(t.user_id || ''), s(userId, 40));
  },
  remover(userId) {
    db.prepare('DELETE FROM seller_mp_tokens WHERE user_id = ?').run(s(userId, 40));
    db.prepare("UPDATE seller_profiles SET mp_conectado = 0, mp_user_id = '' WHERE user_id = ?").run(s(userId, 40));
  },
};

async function mpChamada(caminho, { metodo = 'GET', token, corpo } = {}) {
  const r = await _fetch(MP_API + caminho, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch (_) {}
  if (!r.ok) throw new Error(`Mercado Pago ${caminho}: HTTP ${r.status} ${texto.slice(0, 200)}`);
  return json;
}

// chamada com o token do vendedor, com refresh automático em 401 (uma vez)
async function mpComoVendedor(sellerId, caminho, opts = {}) {
  let tk = MPTokens.obter(sellerId);
  if (!tk || !tk.access_token) throw new Error('Vendedor não conectou a conta Mercado Pago.');
  try {
    return await mpChamada(caminho, { ...opts, token: tk.access_token });
  } catch (e) {
    if (!/HTTP 401/.test(e.message) || !tk.refresh_token) throw e;
    const { appId, secret } = mpCfg();
    const novo = await mpChamada('/oauth/token', {
      metodo: 'POST',
      token: secret, // /oauth/token usa client credentials no corpo; o header é ignorado
      corpo: { client_id: appId, client_secret: secret, grant_type: 'refresh_token', refresh_token: tk.refresh_token },
    });
    MPTokens.salvar(sellerId, novo);
    return await mpChamada(caminho, { ...opts, token: novo.access_token });
  }
}

const OAuth = {
  configurado() { const c = mpCfg(); return !!(c.appId && c.secret); },
  url(state, redirectUri) {
    const c = mpCfg();
    if (!OAuth.configurado()) throw new Error('Mercado Pago não configurado nesta instalação (defina VITRINE_MP_APP_ID e VITRINE_MP_SECRET).');
    const u = new URLSearchParams({ client_id: c.appId, response_type: 'code', platform_id: 'mp', state, redirect_uri: redirectUri });
    return MP_AUTH + '?' + u.toString();
  },
  async trocarCodigo(code, redirectUri) {
    const c = mpCfg();
    return mpChamada('/oauth/token', {
      metodo: 'POST', token: c.secret,
      corpo: { client_id: c.appId, client_secret: c.secret, grant_type: 'authorization_code', code: s(code, 200), redirect_uri: redirectUri },
    });
  },
};

// ---------------------------------------------------------------------
// Provedores
// ---------------------------------------------------------------------
const Provedores = {
  simulado: {
    nome: 'Pagamento simulado (nenhum valor real é cobrado)',
    disponivel: () => true,
    novaRef() { return 'SIM-' + crypto.randomBytes(8).toString('hex').toUpperCase(); },
    tarifa(totalCentavos) { return TARIFA_FIXA_CENTAVOS + Math.round(cent(totalCentavos) * TARIFA_BP / 10000); },
    async reembolsar() { return { ok: true }; },
  },
  'mercadopago-split': {
    nome: 'Mercado Pago Split Payments',
    disponivel: () => OAuth.configurado(),
    prontoParaVendedor: (sellerId) => !!MPTokens.obter(sellerId),
    novaRef() { return 'MP-' + crypto.randomBytes(8).toString('hex').toUpperCase(); },
    // A tarifa REAL do MP só é conhecida no webhook (fee_details); aqui devolve
    // 0 e o valor verdadeiro sobrescreve quando o pagamento aprova.
    tarifa() { return 0; },
    // Checkout Pro na conta do VENDEDOR com a comissão da plataforma embutida.
    async iniciarCobranca(pay, order, itens, baseUrl) {
      const pref = await mpComoVendedor(order.seller_id, '/checkout/preferences', {
        metodo: 'POST',
        corpo: {
          items: itens.map((i) => ({
            title: s(i.titulo, 120), quantity: i.quantidade,
            unit_price: centavosDecimal(i.preco_centavos), currency_id: 'BRL',
          })).concat(order.frete_centavos > 0 ? [{ title: 'Frete', quantity: 1, unit_price: centavosDecimal(order.frete_centavos), currency_id: 'BRL' }] : []),
          marketplace_fee: centavosDecimal(order.comissao_centavos),
          external_reference: order.id,
          notification_url: baseUrl + '/vitrine/webhooks/mercadopago',
          back_urls: {
            success: baseUrl + '/vitrine/app#pedido-' + order.id,
            pending: baseUrl + '/vitrine/app#pedido-' + order.id,
            failure: baseUrl + '/vitrine/app#pedido-' + order.id,
          },
          auto_return: 'approved',
          statement_descriptor: 'VITRINE',
        },
      });
      const url = pref.init_point || pref.sandbox_init_point || '';
      db.prepare('UPDATE payments SET checkout_url = ?, dados = ?, atualizado_em = ? WHERE id = ?')
        .run(s(url, 400), j.str({ preference_id: pref.id, live_mode: !!pref.init_point }), nowISO(), pay.id);
      return { checkout_url: url };
    },
    async reembolsar(pay, valorCentavos) {
      const dados = j.parse(pay.dados, {});
      if (!dados.mp_payment_id) throw new Error('Pagamento MP ainda não identificado para reembolso.');
      const order = db.prepare('SELECT seller_id, total_centavos FROM orders WHERE id = ?').get(pay.order_id);
      const total = cent(valorCentavos);
      const corpo = total > 0 && total < cent(order.total_centavos) ? { amount: centavosDecimal(total) } : {};
      await mpComoVendedor(order.seller_id, `/v1/payments/${dados.mp_payment_id}/refunds`, { metodo: 'POST', corpo });
      return { ok: true };
    },
  },
};

// Provedor do PEDIDO: mp-split quando a plataforma está configurada E o
// vendedor conectou a conta; caso contrário, simulado (e a tela diz qual é).
function provedorParaPedido(sellerId) {
  const mp = Provedores['mercadopago-split'];
  if (mp.disponivel() && mp.prontoParaVendedor(sellerId)) return { nome: 'mercadopago-split', impl: mp };
  return { nome: 'simulado', impl: Provedores.simulado };
}
// provedor "da instalação" (para o log de boot)
function provedorAtivo() {
  const mp = Provedores['mercadopago-split'];
  if (mp.disponivel()) return { nome: 'mercadopago-split', impl: mp };
  return { nome: 'simulado', impl: Provedores.simulado };
}

// ---------------------------------------------------------------------
// Pagamento do pedido
// ---------------------------------------------------------------------
// Síncrono de propósito: roda DENTRO da transação do checkout (nada de rede
// aqui). A chamada externa acontece depois, em iniciarCobranca().
function criarPagamento(order) {
  const { nome, impl } = provedorParaPedido(order.seller_id);
  const ref = impl.novaRef();
  const id = novoId();
  db.prepare(`INSERT INTO payments (id, order_id, provedor, provedor_ref, status, valor_centavos, criado_em)
    VALUES (?,?,?,?,'pendente',?,?)`)
    .run(id, order.id, nome, ref, order.total_centavos, nowISO());
  return {
    id, provedor: nome, ref, status: 'pendente',
    instrucoes: nome === 'simulado'
      ? 'Ambiente de demonstração: aprove ou recuse o pagamento pelo botão "Simular pagamento". Nenhum valor real é cobrado.'
      : 'Você será direcionado ao Mercado Pago para concluir o pagamento.',
  };
}

// Pós-commit do checkout: cria a cobrança externa quando o provedor exige.
// Falha aqui NÃO derruba o pedido — o painel mostra o erro e permite reabrir.
async function iniciarCobranca(paymentId, baseUrl) {
  const pay = Pagamentos.obter(paymentId);
  if (!pay || pay.provedor !== 'mercadopago-split' || pay.checkout_url) return pay ? { checkout_url: pay.checkout_url } : null;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(pay.order_id);
  const itens = db.prepare('SELECT titulo, quantidade, preco_centavos FROM order_items WHERE order_id = ?').all(pay.order_id);
  return Provedores['mercadopago-split'].iniciarCobranca(pay, order, itens, s(baseUrl, 200).replace(/\/+$/, ''));
}

const Pagamentos = {
  obter(id) { return db.prepare('SELECT * FROM payments WHERE id = ?').get(s(id, 40)) || null; },
  doPedido(orderId) { return db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY criado_em DESC').get(s(orderId, 40)) || null; },
  porRef(ref) { return db.prepare('SELECT * FROM payments WHERE provedor_ref = ?').get(s(ref, 80)) || null; },

  // Núcleo idempotente: registra o evento (UNIQUE evento_id) e aplica o
  // efeito UMA vez. Chega aqui o webhook (simulado ou MP) e a simulação.
  processarEvento({ evento_id, ref, tipo, payload, tarifa_centavos }) {
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
        const tarifa = tarifa_centavos != null ? cent(tarifa_centavos)
          : (pay.provedor === 'simulado' ? Provedores.simulado.tarifa(pay.valor_centavos) : 0);
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

// ---------------------------------------------------------------------
// Webhook do Mercado Pago (assinado)
// ---------------------------------------------------------------------
// Valida o esquema documentado do MP: header `x-signature: ts=...,v1=...`,
// manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com HMAC-SHA256
// do segredo configurado no painel do MP (VITRINE_MP_WEBHOOK_SECRET).
function validarAssinaturaMP(headers, dataId) {
  const segredo = mpCfg().webhookSecret;
  if (!segredo) return false; // sem segredo configurado, NADA passa
  const assinatura = String(headers['x-signature'] || '');
  const partes = Object.fromEntries(assinatura.split(',').map((p) => p.trim().split('=').map((x) => x && x.trim())));
  if (!partes.ts || !partes.v1) return false;
  const manifesto = `id:${String(dataId).toLowerCase()};request-id:${String(headers['x-request-id'] || '')};ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(String(partes.v1))); } catch (_) { return false; }
}

const MAPA_STATUS_MP = {
  approved: 'aprovado', authorized: 'aprovado',
  in_process: 'em_analise', pending: 'em_analise', in_mediation: 'em_analise',
  rejected: 'recusado', cancelled: 'recusado',
  refunded: 'reembolsado', charged_back: 'reembolsado',
};

// Processa a notificação: busca o pagamento na API (com o token do vendedor,
// que é o dono do pagamento no Split) e aplica pelo núcleo idempotente.
async function processarWebhookMP(body, query, headers) {
  const topico = String((body && body.type) || (query && query.topic) || '');
  const mpId = String((body && body.data && body.data.id) || (query && query.id) || '');
  if (!/payment/.test(topico) || !mpId) return { ignorado: true };
  if (!validarAssinaturaMP(headers, mpId)) throw new Error('assinatura inválida');

  // external_reference = id do pedido → localiza o vendedor e o payment local
  // (primeira busca com o token de QUALQUER conexão daria errado; por isso o
  // pedido vem do nosso banco, nunca do payload)
  const tentativa = db.prepare(`SELECT o.id AS order_id, o.seller_id FROM orders o
    JOIN payments p ON p.order_id = o.id AND p.provedor = 'mercadopago-split'
    WHERE p.dados LIKE ? LIMIT 1`).get('%' + mpId + '%');
  let orderId = tentativa && tentativa.order_id;
  let sellerId = tentativa && tentativa.seller_id;
  let mpPay = null;
  if (!orderId) {
    // pagamento novo: precisamos descobrir o pedido pelo external_reference.
    // Tentamos com o token de cada vendedor conectado que tenha pedido MP pendente.
    const candidatos = db.prepare(`SELECT DISTINCT o.seller_id FROM orders o
      JOIN payments p ON p.order_id = o.id AND p.provedor = 'mercadopago-split' AND p.status IN ('pendente','em_analise')`).all();
    for (const c of candidatos) {
      try { mpPay = await mpComoVendedor(c.seller_id, '/v1/payments/' + mpId); sellerId = c.seller_id; break; } catch (_) { /* não é deste vendedor */ }
    }
    if (!mpPay) return { ignorado: true, motivo: 'pagamento não pertence a nenhum pedido pendente' };
    orderId = s(mpPay.external_reference, 40);
  } else {
    mpPay = await mpComoVendedor(sellerId, '/v1/payments/' + mpId);
  }

  const pay = Pagamentos.doPedido(orderId);
  if (!pay) return { ignorado: true, motivo: 'pedido sem pagamento local' };

  // guarda o vínculo mp_payment_id (necessário p/ reembolso)
  const dados = j.parse(pay.dados, {});
  if (!dados.mp_payment_id) {
    db.prepare('UPDATE payments SET dados = ?, atualizado_em = ? WHERE id = ?')
      .run(j.str({ ...dados, mp_payment_id: mpId }), nowISO(), pay.id);
  }

  const tipo = MAPA_STATUS_MP[String(mpPay.status)] || null;
  if (!tipo) return { ignorado: true, motivo: 'status desconhecido: ' + mpPay.status };
  // tarifa real do MP (fee_details) em centavos, por string decimal
  let tarifa = null;
  if (tipo === 'aprovado' && Array.isArray(mpPay.fee_details)) {
    tarifa = mpPay.fee_details.reduce((t, f) => {
      const [int, dec] = String(f.amount || '0').split('.');
      return t + (Math.abs(parseInt(int, 10) || 0) * 100 + parseInt(String(dec || '0').padEnd(2, '0').slice(0, 2), 10));
    }, 0);
  }
  return Pagamentos.processarEvento({
    evento_id: `mp-${mpId}-${mpPay.status}`, ref: pay.provedor_ref, tipo,
    payload: { mp_payment_id: mpId, status: mpPay.status }, tarifa_centavos: tarifa,
  });
}

// segredo do webhook SIMULADO/genérico: env ou gerado e persistido na config
function webhookSecret() {
  const env = s(process.env.VITRINE_WEBHOOK_SECRET, 120);
  if (env) return env;
  let v = repo.Config.get('webhook_secret', '');
  if (!v) { v = crypto.randomBytes(18).toString('base64url'); repo.Config.set('webhook_secret', v); }
  return v;
}

module.exports = {
  Provedores, provedorAtivo, provedorParaPedido, criarPagamento, iniciarCobranca,
  Pagamentos, MPTokens, OAuth, processarWebhookMP, validarAssinaturaMP,
  webhookSecret, setFetch, centavosDecimal, TARIFA_FIXA_CENTAVOS, TARIFA_BP,
};
