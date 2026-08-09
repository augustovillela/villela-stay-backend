// =====================================================================
// ORIGENA — dinheiro (L7, §60 e §5/§6 do BILLING).
//
// O DOMÍNIO NÃO CONHECE O GATEWAY. Este arquivo é a única fronteira: para
// dentro existem PEDIDO, ASSINATURA e CRÉDITO; para fora existe o Mercado
// Pago. Trocar de PSP amanhã é reescrever este arquivo, não o produto.
//
// CINCO REGRAS QUE O CÓDIGO IMPÕE:
//
//   1. MODO MANUAL SEM TOKEN. Sem `MP_ACCESS_TOKEN` a plataforma continua
//      operando: o pedido nasce, fica aguardando, e o staff confirma o
//      pagamento à mão. Foi assim que o ciclo inteiro rodou antes de
//      existir gateway — e é a rede de segurança se o PSP cair.
//
//   2. O WEBHOOK NÃO É FONTE DE VERDADE. O corpo que chega é anônimo e
//      falsificável; ele serve só como AVISO de que algo mudou. Status,
//      valor e referência vêm de uma consulta NOSSA à API do Mercado
//      Pago, autenticada com o nosso token.
//
//   3. IDEMPOTÊNCIA POR ÍNDICE, NÃO POR CHECAGEM. O MP reenvia o mesmo
//      evento; duas entregas simultâneas atravessariam qualquer
//      "if (já pago)". Quem garante é o UPDATE condicional do pedido e o
//      `ux_ledger_ref` do crédito.
//
//   4. NADA FORA DE ESCOPO. `orders` e `subscriptions` têm RLS FORÇADA:
//      sem `app.family_id` o banco devolve zero linhas — inclusive aqui.
//      Por isso a família viaja DENTRO do `external_reference` que nós
//      mesmos gravamos no gateway, e o webhook abre `comEscopo` com ela.
//
//   5. O PREÇO É CONGELADO NO PEDIDO. O catálogo muda; o que a família
//      pagou, não.
// =====================================================================
'use strict';
const crypto = require('crypto');
const creditos = require('./creditos');
const tenancy = require('./tenancy');
const { erro } = require('./erros');
const { auditar } = require('./repo');

let _mpFetch = null;
let _alerta = async () => {};

function configurar({ mpFetch, alertaAugusto } = {}) {
  if (mpFetch) _mpFetch = mpFetch;
  if (alertaAugusto) _alerta = (m) => Promise.resolve(alertaAugusto(m)).catch(() => {});
}
const ativo = () => !!(_mpFetch && (process.env.MP_ACCESS_TOKEN || _mpFetch.__mock));
const mp = (caminho, opts) => {
  if (!ativo()) throw erro('erro.pagamento_indisponivel', 503);
  return _mpFetch(caminho, opts);
};

const BASE = (process.env.ORIGENA_URL || 'https://origena.villelastay.com.br').replace(/\/+$/, '');
const reais = (centavos) => Number((centavos / 100).toFixed(2));
const gerarCodigo = () => 'ORG-' + crypto.randomBytes(3).toString('hex').toUpperCase();
const competencia = () => new Date().toISOString().slice(0, 7);
const hoje = () => new Date().toISOString().slice(0, 10);

// =====================================================================
// PEDIDOS — o preço vira história no instante em que é aceito
// =====================================================================

/** Pacote de créditos: o catálogo entra, o pedido congela preço e quantidade. */
async function pedirCreditos(t, { familyId, userId, produtoCodigo }) {
  const p = await t.uma(
    `SELECT * FROM products WHERE codigo = $1 AND ativo AND categoria = 'creditos'`,
    [String(produtoCodigo || '')]);
  if (!p) throw erro('erro.produto_nao_encontrado', 404);
  const o = await t.uma(
    `INSERT INTO orders (family_id, codigo, tipo, product_id, descricao,
       total_centavos, creditos, created_by)
     VALUES ($1,$2,'creditos',$3,$4,$5,$6,$7) RETURNING *`,
    [familyId, gerarCodigo(), p.id, p.nome, p.preco_centavos, p.creditos, userId]);
  await auditar({ familyId, atorUserId: userId, acao: 'pedido.criado', alvoTipo: 'order',
    alvoId: o.id, depois: { total: o.total_centavos, creditos: o.creditos } }, t);
  return o;
}

/** Assinatura de plano: o ciclo escolhido fixa o preço contratado. */
async function pedirAssinatura(t, { familyId, userId, planoCodigo, ciclo = 'mensal' }) {
  const plano = await t.uma(`SELECT * FROM plans WHERE codigo = $1 AND ativo`,
    [String(planoCodigo || '')]);
  if (!plano) throw erro('erro.plano_nao_encontrado', 404);
  const anual = ciclo === 'anual';
  const total = anual ? plano.preco_anual_centavos : plano.preco_centavos;
  if (!total) throw erro('erro.plano_sem_preco', 400);
  const o = await t.uma(
    `INSERT INTO orders (family_id, codigo, tipo, plan_id, ciclo, descricao,
       total_centavos, creditos, created_by)
     VALUES ($1,$2,'assinatura',$3,$4,$5,$6,$7,$8) RETURNING *`,
    [familyId, gerarCodigo(), plano.id, anual ? 'anual' : 'mensal',
      `${plano.nome} — ${anual ? 'anual' : 'mensal'}`, total, plano.creditos_mes, userId]);
  await auditar({ familyId, atorUserId: userId, acao: 'assinatura.pedida', alvoTipo: 'order',
    alvoId: o.id, depois: { plano: plano.codigo, ciclo, total } }, t);
  return o;
}

// A família viaja na referência porque o webhook chega SEM sessão e a RLS
// não deixa procurar o pedido sem saber de quem ele é (regra 4).
const referencia = (pedido) =>
  `origena-${pedido.tipo === 'assinatura' ? 'assinatura' : 'pedido'}:${pedido.id}:${pedido.family_id}`;
const lerReferencia = (ref) => {
  const p = String(ref || '').split(':');
  if (p.length !== 3 || !p[0].startsWith('origena-')) return null;
  if (!tenancy.UUID.test(p[1]) || !tenancy.UUID.test(p[2])) return null;
  return { tipo: p[0].slice(8), orderId: p[1], familyId: p[2] };
};

/**
 * Manda o pedido para o gateway e devolve o link de pagamento.
 * FORA da transação de propósito: chamada de rede não segura conexão de
 * banco. Sem token, devolve o modo manual em vez de inventar um QR.
 *
 * Crédito avulso é compra única (checkout com Pix, cartão e boleto);
 * assinatura é `preapproval`, que renova sozinha a cada ciclo.
 */
async function linkDePagamento(pedido, { email, nome } = {}) {
  if (!ativo()) {
    return { modo: 'manual', codigo: pedido.codigo, total_centavos: pedido.total_centavos };
  }
  const externa = referencia(pedido);
  const cabecas = { 'X-Idempotency-Key': 'origena-' + pedido.id };

  if (pedido.tipo === 'assinatura') {
    if (!email) throw erro('erro.email_obrigatorio', 400);
    const pre = await mp('/preapproval', {
      method: 'POST', headers: cabecas,
      body: JSON.stringify({
        reason: `Origena — ${pedido.descricao}`,
        external_reference: externa,
        payer_email: email,
        back_url: `${BASE}/origena/app`,
        auto_recurring: {
          frequency: 1,
          frequency_type: pedido.ciclo === 'anual' ? 'years' : 'months',
          transaction_amount: reais(pedido.total_centavos),
          currency_id: 'BRL',
        },
        status: 'pending',
      }),
    });
    await marcarGateway(pedido, String(pre.id || ''));
    return { modo: 'assinatura', link: pre.init_point || pre.sandbox_init_point,
      codigo: pedido.codigo, total_centavos: pedido.total_centavos };
  }

  const pref = await mp('/checkout/preferences', {
    method: 'POST', headers: cabecas,
    body: JSON.stringify({
      external_reference: externa,
      items: [{ title: `Origena — ${pedido.descricao}`, quantity: 1,
        currency_id: 'BRL', unit_price: reais(pedido.total_centavos) }],
      payer: email ? { email, name: nome || undefined } : undefined,
      back_urls: { success: `${BASE}/origena/app`, pending: `${BASE}/origena/app`,
        failure: `${BASE}/origena/app` },
      auto_return: 'approved',
      notification_url: `${BASE}/origena/webhook/mercadopago`,
    }),
  });
  await marcarGateway(pedido, '');
  return { modo: 'checkout', link: pref.init_point || pref.sandbox_init_point,
    codigo: pedido.codigo, total_centavos: pedido.total_centavos };
}

const marcarGateway = (pedido, ref) => tenancy.comEscopo(pedido.family_id, (t) => t.q(
  `UPDATE orders SET gateway = 'mercadopago',
          gateway_ref = COALESCE(NULLIF($2,''), gateway_ref), updated_at = now()
    WHERE id = $1`, [pedido.id, String(ref || '')]));

// =====================================================================
// APLICAR O PAGAMENTO — o único caminho que credita ou liga plano
// =====================================================================

/**
 * Marca o pedido como pago e aplica o efeito. Idempotente por construção:
 * o UPDATE só pega pedido AGUARDANDO, e o crédito tem índice único pela
 * referência do pedido. Webhook repetido não credita duas vezes.
 */
async function aplicarPagamento(t, { orderId, gatewayRef = '', gateway = 'mercadopago', quem = null }) {
  const o = await t.uma(
    `UPDATE orders SET status = 'pago', pago_em = now(), gateway = $2,
            gateway_ref = COALESCE(NULLIF($3,''), gateway_ref), updated_at = now()
      WHERE id = $1 AND status = 'aguardando_pagamento' RETURNING *`,
    [orderId, gateway, String(gatewayRef || '')]);
  if (!o) return { ignorado: 'pedido não estava aguardando pagamento' };

  if (o.tipo === 'creditos') {
    await creditos.lancar(t, { familyId: o.family_id, tipo: 'compra', delta: o.creditos,
      refTipo: 'order', refId: o.id, motivo: o.descricao, userId: quem });
  } else {
    await ativarAssinatura(t, { pedido: o, quem });
  }
  await auditar({ familyId: o.family_id, atorUserId: quem, acao: 'pedido.pago', alvoTipo: 'order',
    alvoId: o.id, depois: { total: o.total_centavos, gateway, ref: gatewayRef } }, t);
  return { pedido: o };
}

/**
 * Liga (ou troca) a assinatura da família e entrega os créditos do ciclo.
 * Uma família tem no máximo uma assinatura viva — trocar de plano é
 * atualizar esta (quem garante é o índice parcial `ux_sub_familia`).
 */
async function ativarAssinatura(t, { pedido, quem = null }) {
  const passo = pedido.ciclo === 'anual' ? "interval '1 year'" : "interval '1 month'";
  const sub = await t.uma(
    `INSERT INTO subscriptions (family_id, plan_id, status, gateway, gateway_ref, ciclo,
       preco_centavos, proximo_ciclo, created_by)
     VALUES ($1,$2,'ativa',$3,$4,$5,$6,(now() + ${passo})::date,$7)
     ON CONFLICT (family_id) WHERE status IN ('trial','ativa','inadimplente')
     DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'ativa', ciclo = EXCLUDED.ciclo,
       preco_centavos = EXCLUDED.preco_centavos, proximo_ciclo = EXCLUDED.proximo_ciclo,
       gateway = EXCLUDED.gateway, gateway_ref = EXCLUDED.gateway_ref,
       cancelada_em = NULL, updated_at = now()
     RETURNING *`,
    [pedido.family_id, pedido.plan_id, pedido.gateway, pedido.gateway_ref,
      pedido.ciclo, pedido.total_centavos, quem]);
  if (pedido.creditos > 0) {
    await creditos.lancar(t, { familyId: pedido.family_id, tipo: 'bonus', delta: pedido.creditos,
      refTipo: 'assinatura', refId: `${sub.id}:${competencia()}`,
      motivo: 'Créditos do plano', userId: quem });
  }
  return sub;
}

/**
 * Créditos do ciclo. Chamado pelo pagamento recorrente do MP e também,
 * PREGUIÇOSAMENTE, quando a família abre a tela de planos — em vez de
 * depender de um agendador que este produto ainda não tem.
 *
 * A chave é a COMPETÊNCIA (`AAAA-MM`), não o pagamento: o plano entrega
 * `creditos_mes` uma vez por mês, aconteça a chamada dez vezes e venham
 * duas cobranças no mesmo mês. Chavear pelo id do pagamento pareceria
 * mais preciso e entregaria crédito dobrado no mês da adesão.
 */
async function renovarCiclo(t, familyId) {
  const sub = await t.uma(
    `SELECT s.*, p.creditos_mes FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.family_id = $1 AND s.status = 'ativa'`, [familyId]);
  if (!sub || !sub.creditos_mes) return null;
  const linha = await creditos.lancar(t, { familyId, tipo: 'bonus', delta: sub.creditos_mes,
    refTipo: 'assinatura', refId: `${sub.id}:${competencia()}`, motivo: 'Créditos do plano' });
  if (linha && sub.proximo_ciclo && String(sub.proximo_ciclo).slice(0, 10) <= hoje()) {
    await t.q(
      `UPDATE subscriptions SET proximo_ciclo = (proximo_ciclo +
         CASE WHEN ciclo = 'anual' THEN interval '1 year' ELSE interval '1 month' END)::date,
         updated_at = now() WHERE id = $1`, [sub.id]);
  }
  return linha;
}

/** Cancelar vale até o FIM do ciclo pago — ninguém perde o que já pagou (§122). */
async function cancelarAssinatura(t, { familyId, userId }) {
  const sub = await t.uma(
    `UPDATE subscriptions SET status = 'cancelada', cancelada_em = now(), updated_at = now()
      WHERE family_id = $1 AND status IN ('trial','ativa','inadimplente') RETURNING *`,
    [familyId]);
  if (!sub) throw erro('erro.assinatura_nao_encontrada', 404);
  if (sub.gateway === 'mercadopago' && sub.gateway_ref && ativo()) {
    // Se o MP recusar, a assinatura já está cancelada AQUI: a próxima cobrança
    // vira incidente conhecido, em vez de um cancelamento que não aconteceu.
    try {
      await mp(`/preapproval/${sub.gateway_ref}`, { method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }) });
    } catch (e) {
      console.error('[origena/billing] MP recusou o cancelamento:', e.message);
      await _alerta(`⚠️ Origena: cancelar a assinatura ${sub.id} no Mercado Pago falhou — ${e.message}`);
    }
  }
  await auditar({ familyId, atorUserId: userId, acao: 'assinatura.cancelada',
    alvoTipo: 'subscription', alvoId: sub.id, depois: { vale_ate: sub.proximo_ciclo } }, t);
  return sub;
}

// =====================================================================
// WEBHOOK — aviso de fora, verdade consultada por nós
// =====================================================================

/**
 * O Mercado Pago avisa que algo mudou; nós perguntamos A ELE o que foi.
 * O corpo é só o ponteiro para o id; status, valor e `external_reference`
 * chegam da API autenticada. É por isso que não há segredo de webhook
 * aqui — não estamos confiando no que chegou.
 */
async function webhook(body = {}, query = {}) {
  const tipo = body.type || query.type || body.topic || query.topic || '';
  const id = (body.data && body.data.id) || query['data.id'] || query.id;
  if (!id) return { ok: true, ignorado: 'sem id' };
  if (!ativo()) return { ok: true, ignorado: 'gateway desligado' };

  try {
    if (tipo === 'payment') return await webhookPagamento(String(id));
    if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
      return await webhookAssinatura(String(id));
    }
    return { ok: true, ignorado: 'tipo ' + tipo };
  } catch (e) {
    console.error('[origena/billing] webhook falhou:', e.message);
    await _alerta(`⚠️ Origena: webhook do Mercado Pago falhou (${tipo} ${id}) — ${e.message}`);
    return { ok: false, erro: e.message };
  }
}

async function webhookPagamento(id) {
  const pago = await mp(`/v1/payments/${id}`);
  if (pago.status !== 'approved') return { ok: true, ignorado: 'status ' + pago.status };
  const r = lerReferencia(pago.external_reference);
  if (!r) return { ok: true, ignorado: 'não é da Origena' };
  const centavos = Math.round(Number(pago.transaction_amount || 0) * 100);

  return tenancy.comEscopo(r.familyId, async (t) => {
    const o = await t.uma(`SELECT * FROM orders WHERE id = $1`, [r.orderId]);
    if (!o) return { ok: true, ignorado: 'pedido inexistente' };

    // Cobrança recorrente: a adesão já foi paga, e o que chega agora é o
    // ciclo seguinte — que entrega créditos, não um pedido novo.
    if (o.status === 'pago' && o.tipo === 'assinatura') {
      const linha = await renovarCiclo(t, r.familyId);
      return { ok: true, renovacao: !!linha };
    }
    // Pagamento de R$ 1 não libera pedido de R$ 200.
    if (centavos < o.total_centavos) {
      await _alerta(`⚠️ Origena: pagamento ${id} de R$ ${reais(centavos).toFixed(2)} não cobre o pedido ${o.codigo}.`);
      return { ok: false, erro: 'valor menor que o pedido' };
    }
    const res = await aplicarPagamento(t, { orderId: o.id, gatewayRef: String(pago.id) });
    if (res.pedido) {
      await _alerta(`💚 Origena: pedido ${res.pedido.codigo} pago — R$ ${reais(res.pedido.total_centavos).toFixed(2)}.`);
    }
    return { ok: true, ...res };
  });
}

async function webhookAssinatura(id) {
  const pre = await mp(`/preapproval/${id}`);
  const r = lerReferencia(pre.external_reference);
  if (!r) return { ok: true, ignorado: 'não é da Origena' };
  const novo = pre.status === 'authorized' ? 'ativa'
    : pre.status === 'paused' ? 'inadimplente'
      : pre.status === 'cancelled' ? 'cancelada' : null;
  if (!novo) return { ok: true, ignorado: 'status ' + pre.status };

  return tenancy.comEscopo(r.familyId, async (t) => {
    if (novo === 'ativa') {
      const res = await aplicarPagamento(t, { orderId: r.orderId, gatewayRef: id });
      if (res.pedido) await _alerta(`💚 Origena: assinatura ${res.pedido.descricao} ativada.`);
      return { ok: true, ...res };
    }
    const sub = await t.uma(
      `UPDATE subscriptions SET status = $2, updated_at = now()
        WHERE family_id = $1 AND gateway_ref = $3 AND status <> $2 RETURNING id`,
      [r.familyId, novo, id]);
    return { ok: true, assinatura: sub ? sub.id : null, status: novo };
  });
}

const pedidosDe = (t, familyId, limite = 30) => t.todas(
  `SELECT id, codigo, tipo, descricao, total_centavos, creditos, status, gateway,
          pago_em, created_at
     FROM orders WHERE family_id = $1 ORDER BY created_at DESC LIMIT $2`,
  [familyId, Math.min(Number(limite) || 30, 100)]);

module.exports = { configurar, ativo, pedirCreditos, pedirAssinatura, linkDePagamento,
  aplicarPagamento, ativarAssinatura, renovarCiclo, cancelarAssinatura, webhook, pedidosDe,
  referencia, lerReferencia };
