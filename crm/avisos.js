// =====================================================================
// Villela CRM — avisos ao dono: quem é o cliente, quanto está em jogo e o
// que fazer. Montar o aviso nunca pode derrubar o webhook ou a rotina.
// =====================================================================
'use strict';
const repo = require('./repo');
const { montarAviso, pessoa, reais } = require('../nucleo/aviso');

const SISTEMA = 'Villela CRM';
const dataBR = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || '')) ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const hojeBR = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const planoDe = (t) => (t.plano ? t.plano.nome + (t.plano.preco_centavos ? ` (${reais(t.plano.preco_centavos)}/mês)` : '') : '');

function camposDoCliente(tenantId, { risco = false } = {}) {
  try {
    const t = repo.Tenants.obter(tenantId);
    if (!t) return [['Cliente', tenantId]];
    const resp = (t.usuarios || [])[0] || {};
    return [
      ['Cliente', t.nome],
      ['Responsável', pessoa(resp.nome, resp.email || t.email_contato, t.telefone)],
      [risco ? 'Plano em risco' : 'Plano', planoDe(t)],
    ];
  } catch (_) { return [['Cliente', tenantId]]; }
}

const assinaturaAtivada = (tenantId) => montarAviso({
  titulo: `💚 ${SISTEMA}: novo assinante pagante`,
  campos: camposDoCliente(tenantId),
  fazer: 'Nada: acesso liberado automaticamente.',
});

function assinaturaEncerrada(tenantId, statusMP, sub) {
  const pausada = statusMP === 'paused';
  return montarAviso({
    titulo: `⚠️ ${SISTEMA}: assinatura ${pausada ? 'PAUSADA' : 'CANCELADA'}`,
    campos: [...camposDoCliente(tenantId, { risco: true }), ['Desde', hojeBR()], ['Assinava desde', dataBR(sub && sub.inicio)]],
    fazer: pausada
      ? 'Contatar o cliente pelo contato acima para regularizar o pagamento: a pausa pode ser inadimplência, e a conta é suspensa automaticamente em 7 dias.'
      : 'Contatar o cliente pelo contato acima para entender o motivo do cancelamento.',
  });
}

const listaCurta = (itens) => (itens || []).slice(0, 5).map(x => pessoa(x.nome, x.email)).join('; ')
  + ((itens || []).length > 5 ? `; e mais ${itens.length - 5}` : '');

const resumoDoCiclo = (r) => montarAviso({
  titulo: `⏰ ${SISTEMA}: ${r.trials_vencidos} trial(s) vencido(s), ${r.suspensos} suspenso(s)`,
  campos: [['Trials vencidos', listaCurta(r.trials_vencidos_lista)], ['Suspensos', listaCurta(r.suspensos_lista)]],
  fazer: 'Contatar os clientes listados e oferecer a assinatura. Trial vencido fica bloqueado até assinar; suspenso passou de 7 dias inadimplente.',
});

function novoLead(d = {}) {
  const contato = pessoa(d.email, d.telefone);
  return montarAviso({
    titulo: `📩 ${SISTEMA}: novo lead`,
    campos: [['Nome', d.nome], ['Empresa', d.empresa], ['Contato', contato], ['Plano de interesse', d.plano], ['Mensagem', String(d.mensagem || '').slice(0, 300)]],
    fazer: contato ? 'Responder o lead em até 24h pelo contato acima.' : 'O formulário veio sem e-mail e sem telefone: não há como responder este lead.',
  });
}

const novaEmpresa = (t) => {
  const resp = (t.usuarios || [])[0] || {};
  return montarAviso({
    titulo: `🎉 ${SISTEMA}: nova empresa`,
    campos: [['Empresa', t.nome], ['Responsável', pessoa(resp.nome, resp.email || t.email_contato, t.telefone)], ['Plano', planoDe(t)], ['Trial até', dataBR(t.trial_expira_em)]],
    fazer: 'Dar as boas-vindas em até 24h pelo contato acima e ajudar o cliente a começar.',
  });
};

module.exports = { assinaturaAtivada, assinaturaEncerrada, resumoDoCiclo, novoLead, novaEmpresa };
