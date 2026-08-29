// =====================================================================
// Núcleo · Hóspede FINANCEIRO (dinheiro): conta corrente (extrato + pagar
// via Mercado Pago), webhook do MP (pagamento → lançamento, idempotente) e
// fidelidade (visão/config/rodar o motor). Extraído do server.js (Projeto 2).
// Os motores e helpers (resumoConta, motorFidelidade, mpFetch, lerLancamentos,
// salvarLancamentos, etc.) ficam no server.js e são injetados.
// deps: { requireHospede, requireAuth, requirePublishOrAdmin, resumoConta, mpFetch,
//   AREA_HOSPEDE_URL, lerAvaliacoes, lerIndicacoes, lerFidConfig, motorFidelidade,
//   lerLancamentos, salvarLancamentos, lerHospedes, novoId, alertaAugusto }
// =====================================================================
'use strict';
const webhookMP = require('./webhook-mp');

module.exports.montar = function montar(app, deps) {
  const { requireHospede, requireAuth, requirePublishOrAdmin, resumoConta, mpFetch, AREA_HOSPEDE_URL,
    lerAvaliacoes, lerIndicacoes, lerFidConfig, motorFidelidade,
    lerLancamentos, salvarLancamentos, atualizarJSON, lerHospedes, novoId, alertaAugusto } = deps;

  // ---- Conta corrente do hóspede (extrato + saldo) ----
  app.get('/hospede/api/conta', requireHospede, (req, res) => res.json(resumoConta(req.hospede.id)));

  // Iniciar pagamento do valor pendente (líquido, já abatidos os créditos) via Mercado Pago.
  app.post('/hospede/api/conta/pagar', requireHospede, async (req, res) => {
    const r = resumoConta(req.hospede.id);
    if (r.aPagar <= 0) return res.status(400).json({ erro: 'Você não tem valor pendente para pagar.' });
    if (!process.env.MP_ACCESS_TOKEN) return res.status(503).json({ erro: 'O pagamento online ainda está sendo configurado. Combine o pagamento pelo WhatsApp por enquanto.' });
    try {
      const base = AREA_HOSPEDE_URL.replace(/\/hospede\/?$/, '');
      const pref = await mpFetch('/checkout/preferences', {
        method: 'POST', body: JSON.stringify({
          items: [{ title: 'Conta Villela Stay', quantity: 1, currency_id: 'BRL', unit_price: Number(r.aPagar.toFixed(2)) }],
          external_reference: 'conta:' + req.hospede.id,
          payer: { name: req.hospede.nome || undefined, email: req.hospede.email || undefined },
          back_urls: { success: AREA_HOSPEDE_URL, pending: AREA_HOSPEDE_URL, failure: AREA_HOSPEDE_URL },
          notification_url: base + '/webhooks/mercadopago',
          statement_descriptor: 'VILLELASTAY',
        }),
      });
      res.json({ ok: true, url: pref.init_point || pref.sandbox_init_point, valor: r.aPagar });
    } catch (e) { console.error('[conta pagar]', e.message); res.status(502).json({ erro: 'Falha ao iniciar o pagamento. Tente novamente.' }); }
  });

  // ---- Fidelidade (staff): visão (avaliações/indicações), config e rodar o motor ----
  app.get('/staff/api/hospede/fidelidade', requireAuth, (req, res) => {
    res.json({
      avaliacoes: lerAvaliacoes().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))),
      indicacoes: lerIndicacoes().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))),
    });
  });

  app.get('/staff/api/hospede/fidelidade-config', requirePublishOrAdmin, (req, res) => res.json(lerFidConfig()));

  // Roda o motor de fidelidade sob demanda (force=true ignora o gate FIDELIDADE_AUTO). Admin/PUBLISH_KEY.
  app.post('/staff/api/hospede/fidelidade/rodar', requirePublishOrAdmin, async (req, res) => {
    const d = req.body || {};
    res.json(await motorFidelidade({ force: !!d.force, simular: !!d.simular }));
  });

  // ---- Webhook do Mercado Pago — pagamento aprovado vira lançamento "pagamento" (idempotente) ----
  app.post('/webhooks/mercadopago', async (req, res) => {
    res.sendStatus(200); // responde rápido; processa em seguida
    try {
      const q = req.query || {}, b = req.body || {};
      const tipo = b.type || q.type || q.topic || '';
      const payId = (b.data && b.data.id) || q['data.id'] || (tipo === 'payment' ? q.id : null);
      if (!payId || (tipo && !/payment/i.test(String(tipo)))) return;
      // Confere a assinatura quando ha segredo configurado; o id tambem vai para
      // dentro da URL da API do MP, entao passa pela mesma guarda do Finance.
      const confMP = webhookMP.conferir({ headers: req.headers, dataId: payId,
        segredo: process.env.HOSPEDE_MP_WEBHOOK_SECRET, rotulo: 'hospede' });
      if (!confMP.ok) return console.warn('[hospede] webhook MP recusado:', confMP.motivo);
      if (!webhookMP.idSeguro(payId)) return console.warn('[hospede] webhook MP com id inválido');
      const pay = await mpFetch('/v1/payments/' + payId).catch(() => null);
      if (!pay || pay.status !== 'approved') return;
      const ref = String(pay.external_reference || '');
      if (!ref.startsWith('conta:')) return;
      const hospedeId = ref.slice('conta:'.length);
      const ls = lerLancamentos();
      if (ls.some(l => l.pagamentoRef === String(payId))) return; // idempotente
      const h = lerHospedes().find(x => x.id === hospedeId);
      if (!h) return;
      // Sob o lock — o motor de fidelidade grava no mesmo arquivo por fila, e
      // gravacao direta que caia no meio dele desaparece. Pagamento nao some.
      await atualizarJSON('lancamentos.json', (prev) => prev.concat([
        { id: novoId(), hospedeId, staysClientId: h.staysClientId || '', tipo: 'pagamento', descricao: 'Pagamento online (Mercado Pago)', valor: Math.abs(Number(pay.transaction_amount) || 0), reservaId: '', validade: '', criadoEm: new Date().toISOString(), criadoPor: 'mercadopago', pagamentoRef: String(payId) },
      ]), []);
      console.log('[mp webhook] pagamento baixado p/ hospede', hospedeId, 'R$', pay.transaction_amount);
      alertaAugusto(`Pagamento recebido (Mercado Pago) de ${h.nome || 'hospede'}: R$ ${Number(pay.transaction_amount || 0).toFixed(2)}.`).catch(() => { });
    } catch (e) { console.error('[mp webhook]', e.message); }
  });
};
