// =====================================================================
// Closet Club — dinheiro.
//
// Três fontes de receita, como planejado:
//   1. COMISSÃO (20%)  — retida na conclusão da reserva (ver bookings.js).
//   2. PREMIUM (R$39)  — assinatura mensal do anunciante (MP preapproval).
//   3. SERVIÇOS EXTRAS — lavanderia/foto/entrega/seguro no checkout.
//
// O pagamento do aluguel entra por Pix e fica BLOQUEADO na conta da
// plataforma. Só depois de [concluido] a plataforma repassa ao dono.
// Sem MP_ACCESS_TOKEN o módulo roda em modo MANUAL (o admin marca pago),
// o que permite operar e testar tudo antes de plugar o PSP.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const { Bookings, Payouts } = require('./bookings');
const { Config, Users, Planos, lancar, evento, s, n, cent } = repo;

let _mpFetch = null, _notificar = async () => {};
function configurar({ mpFetch, notificar } = {}) {
  if (mpFetch) _mpFetch = mpFetch;
  if (notificar) _notificar = (m) => Promise.resolve(notificar(m)).catch(() => {});
}
const ativo = () => !!(_mpFetch && (process.env.MP_ACCESS_TOKEN || _mpFetch.__mock));
async function mp(pathname, opts) {
  if (!_mpFetch) throw new Error('Pagamento online não configurado (MP_ACCESS_TOKEN).');
  return _mpFetch(pathname, opts);
}

// ---------------------------------------------------------------------
// 1. Pix do aluguel (entrada em escrow)
// ---------------------------------------------------------------------
async function gerarPix(bookingId, { email = '', nome = '', cpf = '' } = {}) {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(s(bookingId, 40));
  if (!b) throw new Error('Reserva não encontrada.');
  if (b.status !== 'aguardando_pagamento') throw new Error('Esta reserva não está aguardando pagamento.');
  if (!ativo()) {
    // Modo manual: devolve instrução para pagamento fora da plataforma e deixa
    // o admin confirmar. Nunca inventa um QR que não existe.
    return { modo: 'manual', total_centavos: b.total_centavos, codigo: b.codigo, aviso: 'Pagamento online ainda não está ativo. O suporte confirmará seu pagamento manualmente.' };
  }
  const minutos = Config.num('pix_expira_min', 30);
  const partes = String(nome || '').trim().split(/\s+/);
  const resp = await mp('/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': 'closet-' + b.id },
    body: JSON.stringify({
      transaction_amount: Number((b.total_centavos / 100).toFixed(2)),
      description: `Closet Club — reserva ${b.codigo}`,
      payment_method_id: 'pix',
      external_reference: `closet:${b.id}`,
      date_of_expiration: new Date(Date.now() + minutos * 60000).toISOString(),
      payer: {
        email: s(email, 120) || 'sem-email@closetclub.local',
        first_name: partes[0] || 'Cliente',
        last_name: partes.slice(1).join(' ') || 'Closet',
        ...(cpf ? { identification: { type: 'CPF', number: String(cpf).replace(/\D/g, '') } } : {}),
      },
    }),
  });
  const tx = (resp.point_of_interaction && resp.point_of_interaction.transaction_data) || {};
  db.prepare('UPDATE bookings SET mp_payment_id=?, pix_qr=?, pix_copia_cola=?, pix_expira_em=?, atualizado_em=? WHERE id=?')
    .run(String(resp.id || ''), s(tx.qr_code_base64, 200000), s(tx.qr_code, 4000),
      new Date(Date.now() + minutos * 60000).toISOString(), nowISO(), b.id);
  evento(b.cliente_id, 'pix.gerado', b.id, { mp_payment_id: String(resp.id || '') });
  return {
    modo: 'pix', mp_payment_id: String(resp.id || ''), total_centavos: b.total_centavos, codigo: b.codigo,
    qr_base64: tx.qr_code_base64 || '', copia_cola: tx.qr_code || '', expira_em_min: minutos,
  };
}

// Reembolso (total ou parcial). Usado por cancelamento, recusa, disputa e devolução de caução.
async function reembolsar(mpPaymentId, valorCentavos, referencia = '') {
  if (!ativo() || !mpPaymentId) {
    evento('', 'reembolso.manual', s(referencia, 60), { valor: cent(valorCentavos) });
    _notificar(`↩️ Closet Club: reembolso MANUAL pendente de R$ ${(cent(valorCentavos) / 100).toFixed(2)} (${referencia}). Sem PSP configurado.`);
    return { ok: false, manual: true };
  }
  try {
    const r = await mp(`/v1/payments/${mpPaymentId}/refunds`, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': `ref-${mpPaymentId}-${cent(valorCentavos)}` },
      body: JSON.stringify({ amount: Number((cent(valorCentavos) / 100).toFixed(2)) }),
    });
    evento('', 'reembolso.enviado', s(referencia, 60), { valor: cent(valorCentavos), refund_id: String(r.id || '') });
    return { ok: true, refund_id: String(r.id || '') };
  } catch (e) {
    _notificar(`⚠️ Closet Club: falha ao reembolsar ${referencia} — ${e.message}. Trate manualmente no Mercado Pago.`);
    return { ok: false, erro: e.message };
  }
}

// ---------------------------------------------------------------------
// 2. Repasse Pix ao proprietário
// ---------------------------------------------------------------------
// A transferência Pix automática para terceiros exige habilitação específica
// na conta do PSP (Mercado Pago Split/Payouts). Enquanto não estiver
// liberada, o repasse fica na fila "liberado" e o admin envia pelo app do
// banco marcando como pago — o dinheiro do dono nunca fica indefinido.
async function pagarRepasse(payoutId, { quem = 'admin' } = {}) {
  const p = db.prepare('SELECT p.*, u.pix_chave, u.pix_tipo, u.nome FROM payouts p JOIN users u ON u.id = p.owner_id WHERE p.id = ?').get(s(payoutId, 40));
  if (!p) throw new Error('Repasse não encontrado.');
  if (p.status === 'pago') return { ok: true, ja: true };
  if (p.status !== 'liberado') throw new Error('Este repasse ainda não foi liberado.');
  if (!p.pix_chave) throw new Error(`${p.nome} ainda não cadastrou a chave Pix.`);
  if (String(process.env.CLOSET_PIX_AUTO || '').toLowerCase() !== 'on' || !ativo()) {
    return { ok: false, manual: true, chave: p.pix_chave, tipo: p.pix_tipo, valor_centavos: p.valor_centavos, nome: p.nome,
      aviso: 'Repasse automático desligado (CLOSET_PIX_AUTO). Envie o Pix e marque como pago.' };
  }
  const r = await mp('/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': 'payout-' + p.id },
    body: JSON.stringify({
      transaction_amount: Number((p.valor_centavos / 100).toFixed(2)),
      description: `Closet Club — repasse ${p.booking_id}`,
      payment_method_id: 'pix',
      external_reference: `closet-payout:${p.id}`,
    }),
  });
  return Payouts.marcarPago(p.id, { mp_transfer_id: String(r.id || ''), quem });
}

// Pix avulso de campanha patrocinada (4ª fonte de receita)
async function gerarPixCampanha(campanhaId, { email = '', nome = '' } = {}) {
  const { Campanhas } = require('./campanhas');
  const c = Campanhas.obter(campanhaId);
  if (!c) throw new Error('Campanha não encontrada.');
  if (c.status !== 'aguardando_pagamento') throw new Error('Esta campanha não está aguardando pagamento.');
  if (!ativo()) return { modo: 'manual', total_centavos: c.preco_centavos, aviso: 'Pagamento online ainda não está ativo — o suporte confirma manualmente.' };
  const resp = await mp('/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': 'closet-camp-' + c.id },
    body: JSON.stringify({
      transaction_amount: Number((c.preco_centavos / 100).toFixed(2)),
      description: `Closet Club — destaque ${c.dias} dia(s)`,
      payment_method_id: 'pix',
      external_reference: `closet-campanha:${c.id}`,
      payer: { email: s(email, 120) || 'sem-email@closetclub.local', first_name: s(nome, 60) || 'Anunciante' },
    }),
  });
  const tx = (resp.point_of_interaction && resp.point_of_interaction.transaction_data) || {};
  db.prepare('UPDATE campanhas SET mp_payment_id = ? WHERE id = ?').run(String(resp.id || ''), c.id);
  return { modo: 'pix', total_centavos: c.preco_centavos, qr_base64: tx.qr_code_base64 || '', copia_cola: tx.qr_code || '' };
}

// ---------------------------------------------------------------------
// 3. Premium do anunciante (R$ 39/mês)
// ---------------------------------------------------------------------
function estadoAssinatura(userId) {
  const u = Users.obter(userId);
  if (!u) return null;
  const sub = db.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('pendente','ativa','inadimplente') ORDER BY criado_em DESC LIMIT 1").get(s(userId, 40));
  return {
    plano: u.plano, premium_ate: u.premium_ate, entitlements: u.entitlements,
    assinatura: sub ? { status: sub.status, proximo_venc: sub.proximo_venc, recorrencia: !!sub.mp_preapproval_id } : null,
    planos: Planos.listar(),
    mp_ativo: ativo(),
    faturas: db.prepare('SELECT valor_centavos, competencia, vencimento, status, pago_em FROM invoices WHERE user_id = ? ORDER BY criado_em DESC LIMIT 12').all(s(userId, 40)),
  };
}

async function assinarPremium(userId, baseUrl) {
  const u = Users.obter(userId);
  if (!u) throw new Error('Usuário não encontrado.');
  const plano = Planos.porSlug('premium');
  if (!plano || !plano.preco_centavos) throw new Error('Plano Premium indisponível.');
  const atual = db.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status = 'ativa'").get(u.id);
  if (atual) throw new Error('Você já tem uma assinatura ativa.');
  if (!ativo()) throw new Error('Pagamento online indisponível no momento — fale com o suporte para ativar o Premium.');
  const pre = await mp('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: 'Closet Club — Premium',
      external_reference: `closet-premium:${u.id}`,
      payer_email: u.email,
      back_url: `${String(baseUrl || '').replace(/\/+$/, '')}/closet/app`,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: Number((plano.preco_centavos / 100).toFixed(2)), currency_id: 'BRL' },
      status: 'pending',
    }),
  });
  db.prepare('INSERT INTO subscriptions (id, user_id, plan_id, status, inicio, criado_em, mp_preapproval_id) VALUES (?,?,?,?,?,?,?)')
    .run(novoId(), u.id, plano.id, 'pendente', nowISO(), nowISO(), String(pre.id));
  evento(u.id, 'premium.iniciado', String(pre.id), {});
  return { link: pre.init_point || pre.sandbox_init_point, preapproval_id: pre.id };
}

async function cancelarPremium(userId) {
  const sub = db.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('ativa','pendente','inadimplente') ORDER BY criado_em DESC LIMIT 1").get(s(userId, 40));
  if (!sub) throw new Error('Não há assinatura para cancelar.');
  if (sub.mp_preapproval_id && ativo()) {
    try { await mp(`/preapproval/${sub.mp_preapproval_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); } catch (_) {}
  }
  const agora = nowISO();
  db.prepare("UPDATE subscriptions SET status='cancelada', fim=?, atualizado_em=? WHERE id=?").run(agora, agora, sub.id);
  // o Premium vale até o fim do período já pago
  evento(userId, 'premium.cancelado', sub.id, {});
  return { ok: true, vale_ate: (db.prepare('SELECT premium_ate FROM users WHERE id = ?').get(s(userId, 40)) || {}).premium_ate || '' };
}

function ativarPremium(userId, { dias = 30, origem = 'mercadopago' } = {}) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s(userId, 40));
  if (!u) return;
  const base = u.premium_ate && u.premium_ate > nowISO() ? Date.parse(u.premium_ate) : Date.now();
  const ate = new Date(base + Math.max(1, n(dias, 30)) * 86400000).toISOString();
  db.prepare("UPDATE users SET plano='premium', premium_ate=?, atualizado_em=? WHERE id=?").run(ate, nowISO(), u.id);
  const plano = Planos.porSlug('premium');
  db.prepare('INSERT INTO invoices (id, user_id, valor_centavos, competencia, vencimento, status, criado_em, pago_em) VALUES (?,?,?,?,?,?,?,?)')
    .run(novoId(), u.id, plano ? plano.preco_centavos : 3900, new Date().toISOString().slice(0, 7), new Date().toISOString().slice(0, 10), 'paga', nowISO(), nowISO());
  lancar('assinatura', plano ? plano.preco_centavos : 3900, { userId: u.id, descricao: 'Premium mensal — ' + origem });
  repo.Notificacoes.criar(u.id, { titulo: '⭐ Premium ativo', texto: 'Destaque, fotos ilimitadas, vídeo, analytics e IA liberados.', url: '/closet/app#plano' });
  evento(u.id, 'premium.ativo', origem, { ate });
  return ate;
}

function aplicarPreapproval(userId, preapprovalId, statusMP) {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE mp_preapproval_id = ? ORDER BY criado_em DESC LIMIT 1').get(String(preapprovalId));
  if (!sub) return;
  const agora = nowISO();
  if (statusMP === 'authorized') {
    if (sub.status === 'ativa') return; // webhook reenviado
    db.prepare("UPDATE subscriptions SET status='ativa', proximo_venc=?, atualizado_em=? WHERE id=?")
      .run(new Date(Date.now() + 30 * 86400000).toISOString(), agora, sub.id);
    ativarPremium(sub.user_id, { dias: 30 });
    _notificar(`💚 Closet Club: novo assinante Premium — usuário ${sub.user_id}.`);
  } else if (statusMP === 'paused' || statusMP === 'cancelled') {
    db.prepare('UPDATE subscriptions SET status=?, atualizado_em=? WHERE id=?').run(statusMP === 'paused' ? 'inadimplente' : 'cancelada', agora, sub.id);
  }
}

// ---------------------------------------------------------------------
// 4. Webhook único do Mercado Pago
// ---------------------------------------------------------------------
async function processarWebhook(body = {}, query = {}) {
  try {
    const tipo = body.type || query.type || body.topic || query.topic;
    const id = (body.data && body.data.id) || query['data.id'] || query.id;
    if (!id) return { ok: true, ignorado: true };

    if (tipo === 'payment') {
      const pay = await mp(`/v1/payments/${id}`);
      const ref = String(pay.external_reference || '');
      if (ref.startsWith('closet:') && pay.status === 'approved') {
        const bookingId = ref.split(':')[1];
        const r = Bookings.marcarPago(bookingId, { mp_payment_id: String(pay.id), valor_centavos: Math.round(Number(pay.transaction_amount || 0) * 100) });
        evento('', 'webhook.mp.payment', String(id), { booking: bookingId, resultado: r });
      } else if (ref.startsWith('closet-campanha:') && pay.status === 'approved') {
        try { require('./campanhas').Campanhas.ativar(ref.split(':')[1], { mp_payment_id: String(pay.id) }); } catch (_) {}
      } else if (ref.startsWith('closet-premium:') && pay.status === 'approved') {
        const userId = ref.split(':')[1];
        if (!db.prepare('SELECT 1 FROM invoices WHERE mp_payment_id = ?').get(String(pay.id))) {
          ativarPremium(userId, { dias: 30 });
          // carimba o pagamento na fatura recém-criada (idempotência do webhook do MP)
          db.prepare(`UPDATE invoices SET mp_payment_id = ? WHERE id = (
              SELECT id FROM invoices WHERE user_id = ? AND mp_payment_id = '' ORDER BY criado_em DESC LIMIT 1)`)
            .run(String(pay.id), userId);
        }
      }
    } else if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
      const pre = await mp(`/preapproval/${id}`);
      const ref = String(pre.external_reference || '');
      const userId = ref.startsWith('closet-premium:') ? ref.split(':')[1]
        : (db.prepare('SELECT user_id FROM subscriptions WHERE mp_preapproval_id = ?').get(String(id)) || {}).user_id;
      if (userId) aplicarPreapproval(userId, id, pre.status);
    }
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

// ---------------------------------------------------------------------
// 5. Rotina diária: expira Premium vencido e roda o ciclo das reservas
// ---------------------------------------------------------------------
function cicloDiario() {
  const agora = nowISO();
  let premiumVencidos = 0;
  for (const u of db.prepare("SELECT id FROM users WHERE plano = 'premium' AND premium_ate != '' AND premium_ate < ?").all(agora)) {
    db.prepare("UPDATE users SET plano='free', atualizado_em=? WHERE id=?").run(agora, u.id);
    repo.Notificacoes.criar(u.id, { titulo: 'Premium expirou', texto: 'Sua assinatura venceu. Renove para manter destaque, vídeo e analytics.', url: '/closet/app#plano' });
    premiumVencidos++;
  }
  const reservas = Bookings.rotina();
  const campanhas = require('./campanhas').Campanhas.rotina();
  evento('', 'ciclo.diario', '', { premiumVencidos, ...reservas, ...campanhas });
  return { premium_vencidos: premiumVencidos, ...reservas, ...campanhas };
}

// ---------------------------------------------------------------------
// 6. Painel financeiro da plataforma
// ---------------------------------------------------------------------
function financeiroPlataforma({ competencia = '' } = {}) {
  const comp = s(competencia, 7) || new Date().toISOString().slice(0, 7);
  const linhas = db.prepare('SELECT tipo, COALESCE(SUM(valor_centavos),0) v, COUNT(*) c FROM ledger WHERE competencia = ? GROUP BY tipo').all(comp);
  const por = Object.fromEntries(linhas.map((l) => [l.tipo, l.v]));
  const meses = db.prepare(`SELECT competencia, COALESCE(SUM(CASE WHEN tipo IN ('comissao','assinatura','servico','campanha') THEN valor_centavos ELSE 0 END),0) receita
    FROM ledger GROUP BY competencia ORDER BY competencia DESC LIMIT 12`).all();
  return {
    competencia: comp,
    receita_comissao_centavos: por.comissao || 0,
    receita_assinatura_centavos: por.assinatura || 0,
    receita_servicos_centavos: por.servico || 0,
    receita_campanhas_centavos: por.campanha || 0,
    // as quatro fontes de receita do modelo, somadas
    receita_total_centavos: (por.comissao || 0) + (por.assinatura || 0) + (por.servico || 0) + (por.campanha || 0),
    credito_concedido_centavos: Math.abs(por.credito || 0),
    volume_transacionado_centavos: por.entrada || 0,
    repasses_centavos: Math.abs(por.repasse || 0),
    reembolsos_centavos: Math.abs(por.reembolso || 0),
    caucoes_devolvidas_centavos: Math.abs(por.caucao || 0),
    repasses_a_pagar: Payouts.listar({ status: 'liberado' }).length,
    serie: meses.reverse(),
    detalhe: linhas,
  };
}

module.exports = {
  configurar, ativo, gerarPix, gerarPixCampanha, reembolsar, pagarRepasse,
  estadoAssinatura, assinarPremium, cancelarPremium, ativarPremium, aplicarPreapproval,
  processarWebhook, cicloDiario, financeiroPlataforma,
};
