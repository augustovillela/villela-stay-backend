// =====================================================================
// Closet Club — avisos ao dono do grupo pelo WhatsApp: o que houve, com
// quem, quanto e o que fazer. Consulta que falha não derruba o fluxo: o
// campo some da mensagem. CPF e chave Pix não entram aqui.
// =====================================================================
'use strict';
const { db } = require('./db');
const { montarAviso, pessoa, reais } = require('../nucleo/aviso');

const texto = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const data = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const ate5 = (codigos = []) => codigos.slice(0, 5).join(', ') + (codigos.length > 5 ? ` e mais ${codigos.length - 5}` : '');

function contato(userId) {
  try {
    const u = db.prepare('SELECT nome, email, telefone FROM users WHERE id = ?').get(String(userId || '')) || {};
    return pessoa(u.nome, u.email, u.telefone) || String(userId || '');
  } catch (_) { return String(userId || ''); }
}
const valorDaReserva = (b) => reais(b.total_centavos) + (b.caucao_centavos ? ` (inclui caução de ${reais(b.caucao_centavos)})` : '');

// "CC-8H3K2 (caução)" -> a reserva, com peças e donos. Sem reserva, o aviso sai só com a referência.
function daReferencia(referencia) {
  try {
    const b = db.prepare('SELECT * FROM bookings WHERE codigo = ?').get(String(referencia || '').split(' ')[0]);
    if (!b) return {};
    const itens = db.prepare('SELECT titulo FROM booking_items WHERE booking_id = ?').all(b.id);
    return { b, pecas: itens.map((i) => i.titulo).join('; ') };
  } catch (_) { return {}; }
}

function novaReserva(b, online) {
  return montarAviso({
    titulo: `👗 Closet Club: nova reserva ${b.codigo}`,
    campos: [
      ['Peças', (b.itens || []).map((i) => i.titulo).join('; ')],
      ['Valor', valorDaReserva(b)],
      ['Retirada', data(b.data_retirada)],
      ['Devolução', data(b.data_devolucao)],
      ['Cliente', contato(b.cliente_id)],
      ['Proprietário', (b.donos || []).map(contato).join('; ')],
    ],
    fazer: online
      ? 'Nada a fazer agora: a reserva aguarda o Pix do cliente. Depois de pago, o proprietário confirma pelo app.'
      : 'Pagamento online desligado: combinar o pagamento com o cliente e marcar como paga em Portal Staff > Closet Club.',
  });
}

function disputaAberta(b, donos, d, autorId, autorEhDono) {
  return montarAviso({
    titulo: `⚠️ Closet Club: disputa aberta na reserva ${b.codigo}`,
    campos: [
      ['Motivo', texto(d.motivo, 30) || 'dano'],
      ['Descrição', texto(d.descricao)],
      ['Valor pedido', Number(d.valor_pedido_centavos) > 0 ? reais(d.valor_pedido_centavos) : ''],
      ['Valor bloqueado', valorDaReserva(b)],
      ['Aberta por', contato(autorId) + (autorEhDono ? ' (proprietário)' : ' (cliente)')],
      ['Cliente', contato(b.cliente_id)],
      ['Proprietário', (donos || []).map(contato).join('; ')],
    ],
    fazer: 'Falar com as partes e decidir em Portal Staff > Closet Club. O valor e o repasse seguem bloqueados até a decisão.',
  });
}

function reembolsoManual(referencia, centavos, mpPaymentId) {
  const { b, pecas } = daReferencia(referencia);
  return montarAviso({
    titulo: '↩️ Closet Club: reembolso MANUAL pendente',
    campos: [
      ['Reserva', referencia],
      ['Valor', reais(centavos)],
      ['Cliente', b ? contato(b.cliente_id) : ''],
      ['Peças', pecas],
      ['Motivo', b ? texto(b.motivo_status) : ''],
      ['Id MP', mpPaymentId],
    ],
    fazer: (mpPaymentId
      ? `Estornar ${reais(centavos)} no Mercado Pago (pagamento ${mpPaymentId}): o pagamento online está desligado aqui.`
      : `Devolver ${reais(centavos)} ao cliente pelo mesmo meio em que pagou: a reserva foi paga fora do Mercado Pago.`)
      + ' O sistema já registrou o reembolso, mas não moveu o dinheiro.',
  });
}

function reembolsoFalhou(referencia, centavos, mpPaymentId, erro) {
  const { b, pecas } = daReferencia(referencia);
  return montarAviso({
    titulo: `⚠️ Closet Club: falha ao reembolsar ${referencia}`,
    campos: [
      ['Valor', reais(centavos)],
      ['Cliente', b ? contato(b.cliente_id) : ''],
      ['Peças', pecas],
      ['Erro', texto(erro, 160)],
      ['Id MP', mpPaymentId],
    ],
    fazer: `Estornar ${reais(centavos)} manualmente no Mercado Pago (pagamento ${mpPaymentId}): o sistema já registrou o reembolso, mas o dinheiro não saiu.`,
  });
}

function novoPremium(userId, centavos, ciclo = 'mensal') {
  return montarAviso({
    titulo: '💚 Closet Club: novo assinante Premium',
    campos: [['Assinante', contato(userId)], ['Valor', reais(centavos) + (ciclo === 'anual' ? '/ano (plano anual)' : '/mês')]],
    fazer: 'Nada: Premium liberado automaticamente.',
  });
}

function candidaturaParceiro(d = {}) {
  const contatoParceiro = pessoa(d.telefone, d.email);
  return montarAviso({
    titulo: '🤝 Closet Club: nova candidatura de parceiro',
    campos: [
      ['Negócio', texto(d.nome, 140)],
      ['Tipo', texto(d.tipo, 30)],
      ['Cidade', [texto(d.cidade, 80), texto(d.uf, 2)].filter(Boolean).join('/')],
      ['Contato', contatoParceiro],
      ['Descrição', texto(d.descricao)],
    ],
    fazer: 'Analisar e aprovar ou recusar em Portal Staff > Closet Club.',
  });
}

function novoLead(d = {}) {
  const contatoLead = pessoa(d.email, d.telefone);
  return montarAviso({
    titulo: '📩 Closet Club: novo lead',
    campos: [
      ['Nome', texto(d.nome, 120)],
      ['Contato', contatoLead],
      ['Interesse', texto(d.perfil, 30) || 'quero_alugar'],
      ['Cidade', texto(d.cidade, 80)],
      ['Mensagem', texto(d.mensagem)],
    ],
    fazer: contatoLead ? 'Responder em até 24h pelo contato acima.' : 'O lead veio sem contato: nada a responder. Fica registrado em Portal Staff > Closet Club.',
  });
}

function loteDaRotina(r = {}) {
  const lista = (qtd, codigos) => (qtd ? `${qtd}: ${ate5(codigos)}` : '');
  return montarAviso({
    titulo: '👗 Closet Club: reservas encerradas pela rotina',
    campos: [
      ['Expiradas sem pagamento', lista(r.expiradas, r.codigos_expiradas)],
      ['Não confirmadas e estornadas', lista(r.nao_confirmadas, r.codigos_nao_confirmadas)],
      ['Concluídas', r.concluidas ? String(r.concluidas) : ''],
    ],
    fazer: 'Nada a fazer: datas liberadas, clientes avisados e estornos disparados. Estorno que falhar chega em aviso separado.',
  });
}

module.exports = { novaReserva, disputaAberta, reembolsoManual, reembolsoFalhou, novoPremium, candidaturaParceiro, novoLead, loteDaRotina };
