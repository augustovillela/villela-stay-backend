// =====================================================================
// Villela Projects — avisos ao dono: quem é o cliente, quanto está em jogo
// e o que fazer. Montar o aviso nunca pode derrubar o webhook ou a rotina.
// =====================================================================
'use strict';
const { db } = require('./db');
const repo = require('./repo');
const { montarAviso, pessoa, reais } = require('../nucleo/aviso');

const SISTEMA = 'Villela Projects';
const dataBR = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || '')) ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const hojeBR = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function camposDoCliente(tenantId, planId, { risco = false } = {}) {
  try {
    const t = repo.obterTenant(tenantId);
    if (!t) return [['Cliente', tenantId]];
    const dono = db.prepare(`SELECT u.nome, u.email FROM tenant_users tu JOIN users u ON u.id = tu.user_id
      WHERE tu.tenant_id = ? AND tu.papel = 'dono' ORDER BY tu.criado_em LIMIT 1`).get(String(tenantId)) || {};
    const id = planId || (repo.planoDoTenant(tenantId) || {}).id;
    const plano = id ? db.prepare('SELECT nome, preco_centavos FROM plans WHERE id = ?').get(id) : null;
    return [
      ['Cliente', t.nome],
      ['Responsável', pessoa(dono.nome, dono.email || t.email_contato, t.telefone)],
      [risco ? 'Plano em risco' : 'Plano', plano ? plano.nome + (plano.preco_centavos ? ` (${reais(plano.preco_centavos)}/mês)` : '') : ''],
    ];
  } catch (_) { return [['Cliente', tenantId]]; }
}

const assinaturaAtivada = (tenantId, sub) => montarAviso({
  titulo: `💰 ${SISTEMA}: assinatura ATIVADA`,
  campos: camposDoCliente(tenantId, sub && sub.plan_id),
  fazer: 'Nada: acesso liberado automaticamente.',
});

function assinaturaEncerrada(tenantId, statusMP, sub) {
  const pausada = statusMP === 'paused';
  return montarAviso({
    titulo: `⚠️ ${SISTEMA}: assinatura ${pausada ? 'PAUSADA' : 'CANCELADA'}`,
    campos: [...camposDoCliente(tenantId, sub && sub.plan_id, { risco: true }), ['Desde', hojeBR()], ['Assinava desde', dataBR(sub && sub.inicio)]],
    fazer: pausada
      ? 'Contatar o cliente pelo contato acima para regularizar o pagamento (a pausa pode ser inadimplência): a conta já foi suspensa automaticamente.'
      : 'Contatar o cliente pelo contato acima para entender o motivo do cancelamento: a conta já foi suspensa automaticamente.',
  });
}

const pagamentoAprovado = (tenantId, valorMP, mpPaymentId) => montarAviso({
  titulo: `💰 ${SISTEMA}: pagamento aprovado`,
  campos: [...camposDoCliente(tenantId), ['Valor', reais(Math.round(Number(valorMP || 0) * 100))], ['Pagamento MP', mpPaymentId]],
  fazer: 'Nada: pagamento registrado automaticamente.',
});

const trialsExpirando = (trials) => montarAviso({
  titulo: `🗂️ ${SISTEMA}: ${trials.length} trial(s) expirando em ≤7 dias`,
  campos: [['Quem', trials.slice(0, 5).map(t => `${pessoa(t.nome, t.email_contato)} (vence ${dataBR(t.trial_expira_em)})`).join('; ')
    + (trials.length > 5 ? `; e mais ${trials.length - 5}` : '')]],
  fazer: 'Contatar cada cliente antes do vencimento e oferecer a assinatura.',
});

function novoTrial(tenant) {
  return montarAviso({
    titulo: `📋 ${SISTEMA}: novo trial`,
    campos: [...camposDoCliente(tenant.id), ['Trial até', dataBR(tenant.trial_expira_em)]],
    fazer: 'Dar as boas-vindas em até 24h pelo contato acima e ajudar o cliente a começar.',
  });
}

const novoLead = (b = {}) => montarAviso({
  titulo: `📋 ${SISTEMA}: novo lead`,
  campos: [['Nome', repo.s(b.nome, 80) || 'sem nome'], ['Empresa', repo.s(b.empresa, 80)], ['Contato', pessoa(repo.emailNorm(b.email), repo.s(b.telefone, 30))], ['Mensagem', repo.s(b.mensagem, 300)]],
  fazer: 'Responder o lead em até 24h pelo contato acima.',
});

const automacaoDisparou = (nome, empresa, disparo) => montarAviso({
  titulo: `🤖 ${SISTEMA}: automação "${nome}" disparou`,
  campos: [['Empresa', empresa], ['Resultado', disparo.resumo],
    ['Itens', disparo.itens.slice(0, 12).map(i => i.texto + (i.extra ? ' (' + i.extra + ')' : '')).join('; ')]],
  fazer: 'Tratar os itens listados na empresa acima, no Villela Projects.',
});

module.exports = { assinaturaAtivada, assinaturaEncerrada, pagamentoAprovado, trialsExpirando, novoTrial, novoLead, automacaoDisparou };
