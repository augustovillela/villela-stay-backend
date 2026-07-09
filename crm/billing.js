// =====================================================================
// Villela CRM — cobrança recorrente (Mercado Pago) + ciclo de vida.
// Modelo idêntico ao vsm/billing.js: assinatura MENSAL via MP preapproval,
// mpFetch injetado pelo server.js. Sem MP configurado, o painel da
// plataforma gerencia manualmente (marcar pago, suspender, reativar).
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');

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

function assinaturaAtiva(tenantId) {
  return db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ? AND status IN ('trial','pendente','ativa','inadimplente') ORDER BY criado_em DESC LIMIT 1").get(String(tenantId));
}

function estado(tenantId) {
  const t = repo.Tenants.obter(tenantId);
  if (!t) return null;
  const sub = t.assinatura;
  return {
    status_tenant: t.status,
    plano: t.plano ? { slug: t.plano.slug, nome: t.plano.nome, preco_centavos: t.plano.preco_centavos } : null,
    assinatura: sub ? { status: sub.status, proximo_venc: sub.proximo_venc, recorrencia_mp: !!sub.mp_preapproval_id } : null,
    trial_expira_em: t.trial_expira_em || '',
    planos_disponiveis: repo.Planos.listar().filter(p => p.slug !== 'trial'),
    mp_ativo: ativo(),
    faturas: db.prepare('SELECT valor_centavos, competencia, vencimento, status, pago_em FROM invoices WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT 12').all(String(tenantId)),
  };
}

async function assinar(tenantId, planoSlug, quemEmail, baseUrl, ip) {
  if (!ativo()) throw new Error('Pagamento online indisponível no momento — fale com o suporte para ativar seu plano.');
  const plano = repo.Planos.porSlug(planoSlug);
  if (!plano || !plano.ativo || !plano.preco_centavos) throw new Error('Plano inválido para assinatura online.');
  const atual = assinaturaAtiva(tenantId);
  if (atual && atual.mp_preapproval_id && atual.status === 'ativa') {
    throw new Error('Já existe uma assinatura ativa. Cancele-a antes de trocar de plano, ou fale com o suporte.');
  }
  const t = repo.Tenants.obter(tenantId);
  const pre = await mp('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: `Villela CRM — plano ${plano.nome}`,
      external_reference: `crm:${tenantId}:${plano.slug}`,
      payer_email: quemEmail || t.email_contato,
      back_url: `${baseUrl}/crm/app`,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: Number((plano.preco_centavos / 100).toFixed(2)), currency_id: 'BRL' },
      status: 'pending',
    }),
  });
  repo.evento(tenantId, 'billing.preapproval_criada', pre.id, { plano: plano.slug });
  repo.Auditoria.registrar({ tenant_id: tenantId, quem: quemEmail, acao: 'billing.assinar', entidade: 'subscriptions', entidade_id: String(pre.id), detalhe: plano.slug, ip });
  db.prepare('INSERT INTO subscriptions (id, tenant_id, plan_id, status, ciclo, inicio, criado_em, mp_preapproval_id) VALUES (?,?,?,?,?,?,?,?)')
    .run(novoId(), String(tenantId), plano.id, 'pendente', 'mensal', nowISO(), nowISO(), String(pre.id));
  db.prepare('UPDATE tenants SET plan_id = ? WHERE id = ?').run(plano.id, String(tenantId));
  return { link: pre.init_point || pre.sandbox_init_point, preapproval_id: pre.id };
}

async function cancelarAssinatura(tenantId, quemEmail, ip) {
  const atual = assinaturaAtiva(tenantId);
  if (!atual) throw new Error('Não há assinatura para cancelar.');
  if (atual.mp_preapproval_id && ativo()) {
    try { await mp(`/preapproval/${atual.mp_preapproval_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); } catch (_) {}
  }
  const agora = nowISO();
  db.prepare("UPDATE subscriptions SET status = 'cancelada', fim = ?, atualizado_em = ? WHERE id = ?").run(agora, agora, atual.id);
  repo.Tenants.mudarStatus(tenantId, 'cancelada', quemEmail || 'plataforma', 'assinatura cancelada');
  repo.Auditoria.registrar({ tenant_id: tenantId, quem: quemEmail, acao: 'billing.cancelar', entidade: 'subscriptions', entidade_id: atual.id, ip });
  return { ok: true };
}

function aplicarPreapproval(tenantId, preapprovalId, statusMP) {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE mp_preapproval_id = ? ORDER BY criado_em DESC LIMIT 1').get(String(preapprovalId));
  if (!sub) return;
  const agora = nowISO();
  if (statusMP === 'authorized') {
    db.prepare("UPDATE subscriptions SET status = 'ativa', proximo_venc = ?, atualizado_em = ? WHERE id = ?")
      .run(new Date(Date.now() + 30 * 86400000).toISOString(), agora, sub.id);
    db.prepare("UPDATE subscriptions SET status = 'cancelada', fim = ? WHERE tenant_id = ? AND status IN ('trial','ativa') AND id != ?").run(agora, sub.tenant_id, sub.id);
    repo.Tenants.mudarStatus(sub.tenant_id, 'ativa', 'mercadopago', 'assinatura autorizada');
    gerarFatura(sub.tenant_id, 'paga');
    _notificar(`💚 Villela CRM: novo assinante pagante — tenant ${sub.tenant_id}.`);
  } else if (statusMP === 'paused' || statusMP === 'cancelled') {
    db.prepare('UPDATE subscriptions SET status = ?, atualizado_em = ? WHERE id = ?').run(statusMP === 'paused' ? 'inadimplente' : 'cancelada', agora, sub.id);
    if (sub.status === 'ativa' || sub.status === 'pendente') {
      repo.Tenants.mudarStatus(sub.tenant_id, statusMP === 'paused' ? 'inadimplente' : 'cancelada', 'mercadopago', 'preapproval ' + statusMP);
      _notificar(`⚠️ Villela CRM: assinatura ${statusMP === 'paused' ? 'PAUSADA (inadimplência?)' : 'CANCELADA'} — tenant ${sub.tenant_id}.`);
    }
  }
}

function registrarPagamento(tenantId) {
  const sub = assinaturaAtiva(tenantId);
  if (!sub) return;
  db.prepare("UPDATE subscriptions SET status = 'ativa', proximo_venc = ?, atualizado_em = ? WHERE id = ?")
    .run(new Date(Date.now() + 30 * 86400000).toISOString(), nowISO(), sub.id);
  if (repo.Tenants.obter(tenantId).status !== 'ativa') repo.Tenants.mudarStatus(tenantId, 'ativa', 'mercadopago', 'pagamento recorrente');
  gerarFatura(tenantId, 'paga');
}

function gerarFatura(tenantId, status = 'aberta') {
  const t = repo.Tenants.obter(tenantId);
  const valor = t.plano ? t.plano.preco_centavos : 0;
  db.prepare('INSERT INTO invoices (id, tenant_id, valor_centavos, competencia, vencimento, status, criado_em, pago_em) VALUES (?,?,?,?,?,?,?,?)')
    .run(novoId(), String(tenantId), valor, new Date().toISOString().slice(0, 7), new Date().toISOString().slice(0, 10), status, nowISO(), status === 'paga' ? nowISO() : '');
}

function trocarPlano(tenantId, planoSlug, quem) {
  const plano = repo.Planos.porSlug(planoSlug);
  if (!plano) throw new Error('Plano inválido.');
  const atual = assinaturaAtiva(tenantId);
  const t = repo.Tenants.obter(tenantId);
  const precoAtual = t.plano ? t.plano.preco_centavos : 0;
  const tipo = plano.preco_centavos > precoAtual ? 'upgrade' : (plano.preco_centavos < precoAtual ? 'downgrade' : 'troca');
  repo.Tenants.definirPlano(tenantId, plano.id, quem);
  if (atual) db.prepare('UPDATE subscriptions SET plan_id = ?, atualizado_em = ? WHERE id = ?').run(plano.id, nowISO(), atual.id);
  repo.evento(tenantId, 'billing.' + tipo, plano.slug, {});
  const exigeReassinar = !!(atual && atual.mp_preapproval_id && atual.status === 'ativa' && plano.preco_centavos !== precoAtual);
  return { tipo, exige_reassinar: exigeReassinar, plano: plano.slug };
}

async function processarWebhook(body, query) {
  try {
    const tipo = body.type || query.type || body.topic || query.topic;
    const id = (body.data && body.data.id) || query['data.id'] || query.id;
    if (!id) return { ok: true, ignorado: true };
    if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
      const pre = await mp(`/preapproval/${id}`);
      const ref = String(pre.external_reference || '');
      const tenantId = ref.startsWith('crm:') ? ref.split(':')[1] : (db.prepare('SELECT tenant_id FROM subscriptions WHERE mp_preapproval_id = ?').get(String(id)) || {}).tenant_id;
      if (tenantId) { aplicarPreapproval(tenantId, id, pre.status); repo.evento(tenantId, 'webhook.mp.preapproval', id, { status: pre.status }); }
    } else if (tipo === 'payment') {
      const pay = await mp(`/v1/payments/${id}`);
      const ref = String(pay.external_reference || '');
      const tenantId = ref.startsWith('crm:') ? ref.split(':')[1] : '';
      if (tenantId && pay.status === 'approved') { registrarPagamento(tenantId); repo.evento(tenantId, 'webhook.mp.payment', id, { status: pay.status }); }
    }
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; }
}

// ---- ciclo de vida diário (trial vencido → inadimplente → suspensa) + automações por tenant ----
function processarCicloDeVida() {
  const agora = nowISO();
  let trialsVencidos = 0, suspensos = 0, automacoes = 0;
  for (const t of db.prepare("SELECT id FROM tenants WHERE status = 'trial' AND trial_expira_em != '' AND trial_expira_em < ?").all(agora)) {
    repo.Tenants.mudarStatus(t.id, 'inadimplente', 'sistema', 'trial expirado');
    _notificar(`⏰ Villela CRM: trial expirou — tenant ${t.id} bloqueado até assinar.`);
    trialsVencidos++;
  }
  const limite = new Date(Date.now() - 7 * 86400000).toISOString();
  for (const t of db.prepare("SELECT id FROM tenants WHERE status = 'inadimplente' AND atualizado_em < ?").all(limite)) {
    repo.Tenants.mudarStatus(t.id, 'suspensa', 'sistema', 'inadimplente há +7 dias');
    suspensos++;
  }
  // automações do CRM para todo tenant com flag ligada
  const appRepo = require('./app-repo');
  for (const t of db.prepare("SELECT id FROM tenants WHERE status IN ('trial','ativa')").all()) {
    try { if (repo.flag(t.id, 'automacoes')) { appRepo.rodarAutomacoes(t.id); automacoes++; } } catch (_) {}
  }
  repo.evento('', 'ciclo.diario', '', { trialsVencidos, suspensos, automacoes });
  return { trials_vencidos: trialsVencidos, suspensos, automacoes };
}

module.exports = {
  configurar, ativo, estado, assinar, cancelarAssinatura, trocarPlano,
  aplicarPreapproval, registrarPagamento, processarWebhook, processarCicloDeVida, gerarFatura,
};
