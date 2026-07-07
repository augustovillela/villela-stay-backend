// =====================================================================
// Villela Docs Intelligence — Fase 8: billing (assinatura Mercado Pago).
//
// Modelo: assinatura MENSAL via MP *preapproval* (recorrência hospedada
// no Mercado Pago — nenhum dado de cartão no nosso lado). Mesma conta MP
// do restante do backend (MP_ACCESS_TOKEN, injeção de mpFetch).
// DECISÕES (07/07/2026, padrão razoável até o Augusto definir): só plano
// mensal (anual fica p/ evolução); sem cupons na v1; 1 assinatura ativa
// por empresa (mudar de plano = cancelar e assinar de novo; o staff pode
// trocar manualmente a qualquer momento).
//
// Segurança do webhook: o payload do MP é só um AVISO — o estado real é
// SEMPRE relido da API do MP pelo id (mesmo padrão da Livraria). Evento
// bruto vai p/ billing_events (auditoria/replay).
// external_reference = 'vdocs:<tenant_id>'.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

const s = repo.s;
const MP_BASE = 'https://api.mercadopago.com';
let _mpFetch = null;   // injetado pelo server.js (ou mock nos testes)
let _notificar = async () => {};
function configurar({ mpFetch, notificar } = {}) {
  if (mpFetch) _mpFetch = mpFetch;
  if (notificar) _notificar = notificar;
}
const ativo = () => !!(_mpFetch && process.env.MP_ACCESS_TOKEN) || !!(_mpFetch && _mpFetch.__mock);
async function mp(pathname, opts) {
  if (!_mpFetch) throw new Error('Pagamento online não configurado (MP_ACCESS_TOKEN).');
  return _mpFetch(pathname, opts);
}

function logEvento(tenantId, tipo, ref, payload) {
  db.prepare('INSERT INTO billing_events (tenant_id, tipo, ref, payload, criado_em) VALUES (?,?,?,?,?)')
    .run(String(tenantId || ''), s(tipo, 60), s(ref, 80), j.str(payload || {}).slice(0, 4000), nowISO());
}
const subAtual = (tenantId) =>
  db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ? AND status IN ('trial','ativa') ORDER BY criado_em DESC LIMIT 1").get(String(tenantId));

// ------------------------------------------------------------ visão do tenant
function estado(tenantId) {
  const plano = repo.planoDoTenant(tenantId);
  const pagamentos = db.prepare('SELECT valor_centavos, status, criado_em FROM payments WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT 12').all(String(tenantId));
  return {
    online_disponivel: ativo(),
    plano: plano ? { nome: plano.nome, slug: plano.slug, preco_centavos: plano.preco_centavos, status: plano.subscription.status, recorrencia_mp: !!plano.subscription.mp_preapproval_id } : null,
    planos: repo.listarPlanos().filter(p => p.preco_centavos > 0), // enterprise = sob consulta
    pagamentos,
  };
}

// Cria a assinatura no MP e devolve o link de autorização (init_point).
async function assinar(tenantId, planoSlug, user, urlRetorno, ip) {
  if (!ativo()) throw new Error('Pagamento online indisponível — fale com a Villela Docs para ativar seu plano.');
  const plano = repo.planoPorSlug(planoSlug);
  if (!plano || !plano.ativo || !plano.preco_centavos) throw new Error('Plano inválido para assinatura online.');
  const atual = subAtual(tenantId);
  if (atual && atual.mp_preapproval_id && atual.status === 'ativa') {
    throw new Error('Já existe uma assinatura ativa — cancele-a antes de trocar de plano (ou fale com o suporte).');
  }
  const pre = await mp('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: `Villela Docs — plano ${plano.nome}`,
      external_reference: 'vdocs:' + String(tenantId),
      payer_email: user.email,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: Number((plano.preco_centavos / 100).toFixed(2)), currency_id: 'BRL' },
      back_url: urlRetorno,
      status: 'pending',
    }),
  });
  logEvento(tenantId, 'preapproval.criada', pre.id, { plano: plano.slug });
  repo.auditar(tenantId, user, 'billing.assinar_iniciado', 'subscriptions', String(pre.id), { plano: plano.slug }, ip);
  // guarda a intenção: nova subscription 'pendente' vira 'ativa' quando o MP autorizar
  db.prepare('INSERT INTO subscriptions (id, tenant_id, plan_id, status, inicio, criado_em, mp_preapproval_id) VALUES (?,?,?,?,?,?,?)')
    .run(novoId(), String(tenantId), plano.id, 'pendente', nowISO(), nowISO(), String(pre.id));
  return { link: pre.init_point || pre.sandbox_init_point, preapproval_id: pre.id };
}

async function cancelarAssinatura(tenantId, user, ip) {
  const atual = subAtual(tenantId);
  if (!atual || !atual.mp_preapproval_id) throw new Error('Não há assinatura online ativa para cancelar.');
  await mp(`/preapproval/${atual.mp_preapproval_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  // o webhook confirma, mas aplicamos já (idempotente)
  aplicarPreapproval(tenantId, atual.mp_preapproval_id, 'cancelled');
  repo.auditar(tenantId, user, 'billing.cancelar', 'subscriptions', atual.id, {}, ip);
}

// ------------------------------------------------------------ efeitos de estado
function aplicarPreapproval(tenantId, preapprovalId, statusMP) {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE tenant_id = ? AND mp_preapproval_id = ? ORDER BY criado_em DESC LIMIT 1')
    .get(String(tenantId), String(preapprovalId));
  if (!sub) return false;
  const agora = nowISO();
  if (statusMP === 'authorized') {
    db.prepare("UPDATE subscriptions SET status = 'cancelada', fim = ?, atualizado_em = ? WHERE tenant_id = ? AND status IN ('trial','ativa') AND id != ?")
      .run(agora, agora, String(tenantId), sub.id); // encerra trial/assinatura anterior
    db.prepare("UPDATE subscriptions SET status = 'ativa', atualizado_em = ? WHERE id = ?").run(agora, sub.id);
    db.prepare("UPDATE tenants SET status = 'ativa', atualizado_em = ? WHERE id = ?").run(agora, String(tenantId));
    repo.auditar(tenantId, { id: 'mercadopago', nome: 'Mercado Pago' }, 'billing.assinatura_ativa', 'subscriptions', sub.id, {}, 'webhook');
    _notificar(`💰 Villela Docs: assinatura ATIVADA — tenant ${tenantId}.`);
  } else if (statusMP === 'cancelled' || statusMP === 'paused') {
    db.prepare("UPDATE subscriptions SET status = 'cancelada', fim = ?, atualizado_em = ? WHERE id = ?").run(agora, agora, sub.id);
    if (sub.status === 'ativa') { // só suspende quem dependia dessa assinatura
      db.prepare("UPDATE tenants SET status = 'suspensa', atualizado_em = ? WHERE id = ?").run(agora, String(tenantId));
      _notificar(`⚠️ Villela Docs: assinatura ${statusMP === 'paused' ? 'PAUSADA (inadimplência?)' : 'CANCELADA'} — tenant ${tenantId} suspenso.`);
    }
    repo.auditar(tenantId, { id: 'mercadopago', nome: 'Mercado Pago' }, 'billing.assinatura_encerrada', 'subscriptions', sub.id, { statusMP }, 'webhook');
  }
  return true;
}

const tenantDeRef = (external_reference) => {
  const m = String(external_reference || '').match(/^vdocs:(.+)$/);
  return m ? m[1] : '';
};

// Webhook do MP: relê o recurso pelo id e aplica. Nunca lança (200 sempre —
// MP reenvia em caso de 5xx e não queremos loop por evento alheio).
async function processarWebhook(body, query) {
  try {
    const tipo = String((body && body.type) || (query && query.type) || '');
    const id = String((body && body.data && body.data.id) || (query && query['data.id']) || '');
    if (!id) return { ok: true, ignorado: 'sem id' };
    if (tipo === 'subscription_preapproval') {
      const pre = await mp(`/preapproval/${id}`);
      const tenantId = tenantDeRef(pre.external_reference);
      if (!tenantId || !repo.obterTenant(tenantId)) return { ok: true, ignorado: 'ref alheia' };
      logEvento(tenantId, 'webhook.preapproval', id, { status: pre.status });
      aplicarPreapproval(tenantId, id, pre.status);
      return { ok: true };
    }
    if (tipo === 'payment' || tipo === 'subscription_authorized_payment') {
      const pagId = id;
      let pag;
      try { pag = await mp(`/v1/payments/${pagId}`); } catch (_) { return { ok: true, ignorado: 'pagamento não lido' }; }
      const tenantId = tenantDeRef(pag.external_reference) || tenantDeRef(pag.metadata && pag.metadata.external_reference);
      if (!tenantId || !repo.obterTenant(tenantId)) return { ok: true, ignorado: 'ref alheia' };
      logEvento(tenantId, 'webhook.payment', pagId, { status: pag.status, valor: pag.transaction_amount });
      const status = { approved: 'aprovado', pending: 'pendente', in_process: 'pendente', rejected: 'recusado', refunded: 'reembolsado', charged_back: 'reembolsado' }[pag.status] || 'pendente';
      db.prepare(`INSERT INTO payments (id, tenant_id, mp_payment_id, valor_centavos, status, detalhe, criado_em) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT (mp_payment_id) DO UPDATE SET status = excluded.status, detalhe = excluded.detalhe`)
        .run(novoId(), tenantId, String(pagId), Math.round(Number(pag.transaction_amount || 0) * 100), status, s(pag.status_detail, 120), nowISO());
      if (status === 'aprovado') _notificar(`💰 Villela Docs: pagamento aprovado R$ ${Number(pag.transaction_amount || 0).toFixed(2)} — tenant ${tenantId}.`);
      return { ok: true };
    }
    return { ok: true, ignorado: tipo || 'tipo desconhecido' };
  } catch (e) {
    logEvento('', 'webhook.erro', '', { erro: e.message });
    return { ok: true, erro: e.message };
  }
}

// ------------------------------------------------------------ relatório SaaS (staff)
function receitaPlataforma() {
  const mes = nowISO().slice(0, 7);
  const recebidoMes = db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v FROM payments WHERE status = 'aprovado' AND criado_em LIKE ?").get(mes + '%').v;
  const porMes = db.prepare("SELECT substr(criado_em,1,7) mes, SUM(valor_centavos) v FROM payments WHERE status = 'aprovado' GROUP BY mes ORDER BY mes DESC LIMIT 12").all();
  const trials7 = db.prepare("SELECT id, nome, trial_expira_em FROM tenants WHERE status = 'trial' AND trial_expira_em != '' AND trial_expira_em <= ? ORDER BY trial_expira_em")
    .all(new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString());
  const custoIA = db.prepare('SELECT tenant_id, SUM(custo_centavos_usd) custo, SUM(input_tokens+output_tokens) tokens, COUNT(*) chamadas FROM ai_runs GROUP BY tenant_id ORDER BY custo DESC LIMIT 20').all()
    .map(r => ({ ...r, nome: (repo.obterTenant(r.tenant_id) || {}).nome || r.tenant_id }));
  const assinaturas = db.prepare(`SELECT sb.tenant_id, sb.status, sb.mp_preapproval_id, p.nome plano, p.preco_centavos FROM subscriptions sb
    JOIN plans p ON p.id = sb.plan_id WHERE sb.status IN ('ativa','pendente') ORDER BY sb.criado_em DESC LIMIT 100`).all()
    .map(a => ({ ...a, tenant_nome: (repo.obterTenant(a.tenant_id) || {}).nome || a.tenant_id, recorrencia_mp: !!a.mp_preapproval_id }));
  return { ...repo.resumoPlataforma(), recebido_mes_centavos: recebidoMes, recebido_por_mes: porMes, trials_expirando_7d: trials7, custo_ia_por_tenant: custoIA, assinaturas };
}

// Rotina diária: resumo de trials vencendo p/ o Augusto (WhatsApp via notificar).
async function rotinaBilling() {
  const r = receitaPlataforma();
  if (r.trials_expirando_7d.length) {
    await _notificar(`🗂️ Villela Docs: ${r.trials_expirando_7d.length} trial(s) expirando em ≤7 dias: ` +
      r.trials_expirando_7d.slice(0, 8).map(t => `${t.nome} (${String(t.trial_expira_em).slice(0, 10)})`).join(' · '));
  }
  return r.trials_expirando_7d.length;
}

module.exports = { configurar, ativo, estado, assinar, cancelarAssinatura, processarWebhook, aplicarPreapproval, receitaPlataforma, rotinaBilling, logEvento, MP_BASE };
