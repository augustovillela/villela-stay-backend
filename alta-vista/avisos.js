// =====================================================================
// Villela Alta Vista 360 — avisos ao dono do grupo pelo WhatsApp: o que
// houve, com quem, quanto e o que fazer. Consulta que falha não derruba o
// fluxo: o campo some da mensagem.
// =====================================================================
'use strict';
const { montarAviso, pessoa, reais } = require('../nucleo/aviso');
const repo = require('./repo');
const { db } = require('./db');
const { Projetos, Clientes, Leads } = repo;

const texto = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const seguro = (fn, padrao = null) => { try { return fn() || padrao; } catch (_) { return padrao; } };
const PAINEL = 'Portal Staff > Alta Vista 360';
const RESPONDER_LEAD = 'Responder em até 24h pelo contato acima';

const contatoDe = (c) => (c ? pessoa(c.nome, c.whatsapp, c.email) : '');
const clienteDe = (id) => seguro(() => Clientes.obter(id));
const projetoDe = (id) => seguro(() => Projetos.obter(id));
const saldoDe = (projetoId) => seguro(() => require('./billing').saldo(projetoId), 0); // require tardio: billing -> avisos

function listaDeInteresses(lead) {
  const v = lead.interesses;
  if (Array.isArray(v)) return v.join(', ');
  return seguro(() => JSON.parse(v || '[]').join(', '), '');
}

function pedidoDeOrcamento(lead) {
  return montarAviso({
    titulo: '📐 Alta Vista 360: novo pedido de orçamento',
    campos: [
      ['Cliente', contatoDe(lead)],
      ['Serviço', listaDeInteresses(lead)],
      ['Imóvel', [lead.tipo_imovel, lead.finalidade, lead.cidade].filter(Boolean).join(' · ')],
      ['Mensagem', texto(lead.mensagem)],
    ],
    fazer: RESPONDER_LEAD + '.',
  });
}

function recomendadorConcluido(lead, rec) {
  return montarAviso({
    titulo: '📐 Alta Vista 360: recomendador concluído',
    campos: [
      ['Cliente', contatoDe(lead)],
      ['Recomendado', rec.pacote && rec.pacote.nome],
      ['Estimado', reais(rec.preco_estimado_centavos)],
      ['Imóvel', [lead.tipo_imovel, lead.finalidade, lead.cidade].filter(Boolean).join(' · ')],
      ['Pontuação', `${rec.pontuacao}/10`],
      ['Mensagem', texto(lead.mensagem)],
    ],
    fazer: rec.analise_manual
      ? `O pacote pede análise manual: analisar o pedido. ${RESPONDER_LEAD}.`
      : `${RESPONDER_LEAD}, com a proposta do pacote recomendado.`,
  });
}

function propostaAceita(p) {
  const lead = seguro(() => Leads.obter(p.lead_id));
  return montarAviso({
    titulo: '✅ Alta Vista 360: proposta ACEITA',
    campos: [
      ['Aceita por', p.aceite && p.aceite.nome],
      ['Cliente', contatoDe(lead)],
      ['Serviços', (p.itens || []).map((i) => i.nome).join(' + ')],
      ['Valor', reais(p.total_centavos)],
    ],
    fazer: `Criar o projeto a partir da proposta e gerar a cobrança em ${PAINEL}.`,
  });
}

function briefingPreenchido(cliente, p) {
  const b = p.briefing || {};
  return montarAviso({
    titulo: '📝 Alta Vista 360: briefing preenchido',
    campos: [
      ['Cliente', contatoDe(cliente)],
      ['Projeto', p.titulo],
      ['Objetivo', texto(b.objetivo, 200)],
      ['Disponibilidade', texto(b.disponibilidade, 200)],
      ['Restrições', texto(b.restricoes, 200)],
    ],
    fazer: `Ler o briefing em ${PAINEL}, agendar e iniciar a produção.`,
  });
}

function mensagemDoCliente(cliente, p, mensagem) {
  return montarAviso({
    titulo: '💬 Alta Vista 360: mensagem do cliente',
    campos: [
      ['Cliente', contatoDe(cliente)],
      ['Projeto', p.titulo],
      ['Mensagem', texto(mensagem)],
    ],
    fazer: `Responder no projeto, em ${PAINEL}: o cliente recebe por e-mail.`,
  });
}

function comentarioDeRevisao(cliente, versao, c) {
  const contexto = seguro(() => db.prepare(`SELECT e.titulo AS entrega, p.titulo AS projeto FROM entregas e
    JOIN projetos p ON p.id = e.projeto_id WHERE e.id = ?`).get(versao.entrega_id), {});
  return montarAviso({
    titulo: '💬 Alta Vista 360: comentário de revisão',
    campos: [
      ['Cliente', contatoDe(cliente)],
      ['Projeto', contexto.projeto],
      ['Entrega', contexto.entrega],
      ['Momento', c.ancora && c.ancora.t != null ? `aos ${Math.round(c.ancora.t)}s` : ''],
      ['Comentário', texto(c.texto)],
    ],
    fazer: `Ver o comentário em ${PAINEL}, responder e ajustar a entrega se for pedido de alteração.`,
  });
}

function entregaAprovada(cliente, e) {
  const p = projetoDe(e.projeto_id);
  const saldo = saldoDe(e.projeto_id);
  return montarAviso({
    titulo: '✅ Alta Vista 360: cliente APROVOU a entrega',
    campos: [
      ['Cliente', contatoDe(cliente)],
      ['Projeto', p && p.titulo],
      ['Entrega', e.titulo],
      ['Saldo em aberto', saldo ? reais(saldo) : 'nenhum'],
    ],
    fazer: saldo
      ? `Cobrar o saldo de ${reais(saldo)}: o download final só abre depois da quitação.`
      : 'Nada de cobrança: o cliente já pode baixar o arquivo final desta entrega.',
  });
}

function pedidoDeRenovacao(cliente, tour, plano, centavos, online) {
  const p = projetoDe(tour.projeto_id);
  return montarAviso({
    titulo: '🔁 Alta Vista 360: pedido de renovação do tour',
    campos: [
      ['Cliente', contatoDe(cliente)],
      ['Tour', tour.titulo],
      ['Projeto', p && p.titulo],
      ['Plano', plano],
      ['Valor', reais(centavos)],
    ],
    fazer: online
      ? 'Nada a fazer agora: o checkout está aberto para o cliente e, pago, a validade do tour se estende sozinha.'
      : `Pagamento online indisponível: combinar a cobrança com o cliente e dar baixa da parcela em ${PAINEL}.`,
  });
}

function fazerDaParcela(parc, projeto, resto) {
  if (/^Hospedagem do tour/.test(parc.rotulo || '')) return 'Nada a fazer: a validade do tour foi estendida automaticamente.';
  if (projeto && projeto.status === 'briefing_pending') {
    return projeto.briefing_em
      ? `Agendar a produção em ${PAINEL}: o briefing já está preenchido.`
      : 'Acompanhar o briefing: o projeto foi destravado e o cliente precisa preenchê-lo antes do agendamento.';
  }
  if (!resto) return 'Nada de cobrança: o download final abre assim que a entrega estiver aprovada.';
  return `Seguir o projeto em ${PAINEL}. Ainda falta receber ${reais(resto)}.`;
}

function parcelaPaga(parc, { payId = '', via = '', resto = 0 } = {}) {
  const projeto = projetoDe(parc.projeto_id);
  return montarAviso({
    titulo: '💰 Alta Vista 360: parcela paga',
    campos: [
      ['Parcela', parc.rotulo],
      ['Valor', reais(parc.valor_centavos) + (via ? ` (${via})` : '')],
      ['Saldo em aberto', resto ? reais(resto) : 'nenhum, projeto QUITADO ✅'],
      ['Cliente', contatoDe(clienteDe(parc.cliente_id))],
      ['Projeto', projeto && projeto.titulo],
      ['Id MP', payId],
    ],
    fazer: fazerDaParcela(parc, projeto, resto),
  });
}

function valorDivergente(parc, pay, payId) {
  const projeto = projetoDe(parc.projeto_id);
  return montarAviso({
    titulo: '⚠️ Alta Vista 360: pagamento com VALOR DIVERGENTE ignorado',
    campos: [
      ['Esperado', reais(parc.valor_centavos)],
      ['Veio', `${pay.transaction_amount} ${pay.currency_id}`],
      ['Parcela', parc.rotulo],
      ['Cliente', contatoDe(clienteDe(parc.cliente_id))],
      ['Projeto', projeto && projeto.titulo],
      ['Id MP', payId],
    ],
    fazer: `Conferir no painel do Mercado Pago. A parcela segue aberta: se o valor estiver certo, dar baixa manual em ${PAINEL}; se não, estornar no Mercado Pago.`,
  });
}

function estornoNoMP(parc, status, payId) {
  const projeto = projetoDe(parc.projeto_id);
  const reembolso = status === 'refunded';
  return montarAviso({
    titulo: `🔁 Alta Vista 360: pagamento ${reembolso ? 'REEMBOLSADO' : 'CONTESTADO (chargeback)'}`,
    campos: [
      ['Parcela', parc.rotulo],
      ['Valor', reais(parc.valor_centavos)],
      ['Cliente', contatoDe(clienteDe(parc.cliente_id))],
      ['Projeto', projeto && projeto.titulo],
      ['Id MP', payId],
    ],
    fazer: (reembolso ? 'Conferir o reembolso no Mercado Pago e decidir o que fazer com o projeto.' : 'Responder à contestação no Mercado Pago, se for o caso, e decidir o que fazer com o projeto.')
      + ' A parcela voltou a contar como saldo em aberto: o download final fica travado.',
  });
}

function reembolsoExecutado(parc, quem) {
  const projeto = projetoDe(parc.projeto_id);
  const noMP = parc.pago_via === 'mercadopago' && parc.mp_payment_id;
  return montarAviso({
    titulo: '↩️ Alta Vista 360: reembolso executado',
    campos: [
      ['Parcela', parc.rotulo],
      ['Valor', reais(parc.valor_centavos)],
      ['Feito por', quem],
      ['Cliente', contatoDe(clienteDe(parc.cliente_id))],
      ['Projeto', projeto && projeto.titulo],
      ['Id MP', parc.mp_payment_id],
    ],
    fazer: (noMP ? 'Conferir o estorno no Mercado Pago.' : 'Devolver o valor ao cliente pelo mesmo meio em que pagou: a baixa foi manual e o sistema não moveu dinheiro.')
      + ' A parcela voltou a contar como saldo em aberto.',
  });
}

module.exports = {
  pedidoDeOrcamento, recomendadorConcluido, propostaAceita, briefingPreenchido, mensagemDoCliente, comentarioDeRevisao,
  entregaAprovada, pedidoDeRenovacao, parcelaPaga, valorDivergente, estornoNoMP, reembolsoExecutado,
};
