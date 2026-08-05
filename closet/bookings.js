// =====================================================================
// Closet Club — RESERVA com pagamento bloqueado (escrow).
//
//   reservar → [aguardando_pagamento] → paga (Pix) → [pago_bloqueado]
//   → dono confirma → [confirmado] (gera QR) → QR de retirada → [retirado]
//   → QR de devolução → [devolvido] (janela de vistoria)
//   → sem disputa → [concluido]: comissão fica, repasse Pix sai ao dono,
//     caução volta ao cliente.
//
// Saídas laterais: recusado · cancelado · expirado · em_disputa · reembolsado.
// O dinheiro NUNCA sai antes de [concluido] ou de decisão de disputa.
// =====================================================================
'use strict';
const {
  db, transacao, nowISO, hojeISO, novoId, novoToken, novoCodigo, j,
  diaValido, diasEntre, somaDias,
} = require('./db');
const repo = require('./repo');
const { Config, Users, Items, Looks, Agenda, Precos, Cupons, Notificacoes, evento, lancar, s, n, cent } = repo;

// ganchos injetados pelo index.js (reembolso via PSP, alerta, push, e-mail)
let _hooks = {
  reembolsar: async () => ({ ok: false }), notificar: async () => {},
  push: async () => {}, email: async () => {},
};
function configurar(h = {}) { _hooks = { ..._hooks, ...h }; }

// Um aviso = notificação no app + push + (quando houver modelo) e-mail.
// Tudo best-effort: nenhuma dessas três pode derrubar a transação.
const avisar = (userId, titulo, texto, url, email = null) => {
  try { Notificacoes.criar(userId, { titulo, texto, url }); } catch (_) {}
  Promise.resolve(_hooks.push(userId, { title: titulo, body: texto, url })).catch(() => {});
  if (email) Promise.resolve(_hooks.email(userId, email.chave, email.reserva, email.extra || {})).catch(() => {});
};

const horasAdiante = (h) => new Date(Date.now() + Math.max(0, n(h, 0)) * 3600000).toISOString();

function mapBooking(b, { detalhe = false } = {}) {
  if (!b) return null;
  const itens = db.prepare('SELECT * FROM booking_items WHERE booking_id = ? ORDER BY criado_em').all(b.id);
  const out = {
    ...b,
    status_rotulo: repo.STATUS_BOOKING[b.status] || b.status,
    itens: itens.map((i) => ({ ...i, foto: (j.parse((db.prepare('SELECT fotos FROM items WHERE id = ?').get(i.item_id) || {}).fotos, [])[0] || {}).url || '' })),
    donos: [...new Set(itens.map((i) => i.owner_id))],
  };
  if (detalhe) {
    out.cliente = Users.publico(b.cliente_id);
    out.look = b.look_id ? Looks.obter(b.look_id) : null;
    out.servicos = db.prepare('SELECT * FROM booking_services WHERE booking_id = ?').all(b.id);
    out.disputa = db.prepare('SELECT * FROM disputes WHERE booking_id = ? ORDER BY criado_em DESC LIMIT 1').get(b.id) || null;
    out.repasses = db.prepare('SELECT * FROM payouts WHERE booking_id = ?').all(b.id);
  }
  return out;
}

const Bookings = {
  // -------------------------------------------------------------------
  // 1. Cotação (sem gravar) — a mesma conta que vira reserva
  // -------------------------------------------------------------------
  cotar({ item_ids = [], look_id = '', de, ate, cupom = '', seguro = false, modo_entrega = 'retirada', servicos = [], clienteId = '', usar_credito = false, endereco_cidade = '', endereco_bairro = '' } = {}) {
    let look = null;
    let ids = (Array.isArray(item_ids) ? item_ids : []).map((x) => s(x, 40)).filter(Boolean);
    if (look_id) {
      look = Looks.obter(look_id);
      if (!look) throw new Error('Look não encontrado.');
      if (look.status !== 'ativo' || look.moderacao !== 'aprovado') throw new Error('Este look não está disponível.');
      ids = look.itens.map((i) => i.id);
    }
    if (!ids.length) throw new Error('Selecione ao menos uma peça.');
    const itens = ids.map((id) => {
      const it = Items.obter(id);
      if (!it) throw new Error('Peça não encontrada: ' + id);
      return it;
    });
    // disponibilidade peça a peça — num look, todas precisam estar livres
    const indisponiveis = itens
      .map((i) => ({ item: i, d: Agenda.disponivel(i.id, de, ate) }))
      .filter((x) => !x.d.disponivel)
      .map((x) => ({ item_id: x.item.id, titulo: x.item.titulo, motivo: x.d.motivo }));

    const servicosLimpos = (Array.isArray(servicos) ? servicos : []).map((sv) => {
      const linha = db.prepare('SELECT ps.*, p.nome AS parceiro FROM partner_services ps JOIN partners p ON p.id = ps.partner_id WHERE ps.id = ? AND ps.ativo = 1').get(s(sv.service_id || sv.id, 40));
      if (!linha) return null;
      return { service_id: linha.id, partner_id: linha.partner_id, nome: linha.nome, tipo: linha.tipo, preco_centavos: linha.preco_centavos };
    }).filter(Boolean);

    // frete pela zona cadastrada (cidade/bairro da entrega, ou a da peça)
    const { Entrega } = require('./parceiros');
    let zona = null;
    if (s(modo_entrega, 20) === 'entrega') {
      zona = Entrega.cotar({ cidade: s(endereco_cidade, 80) || (itens[0] || {}).cidade, bairro: s(endereco_bairro, 80) });
      if (!zona) throw new Error('Ainda não entregamos nessa região — escolha retirada com a proprietária.');
    }

    // crédito de indicação: só entra se a pessoa pedir (é dela a decisão de gastar)
    const { Creditos } = require('./crescimento');
    const creditoDisponivel = (usar_credito && clienteId) ? Creditos.saldo(clienteId) : 0;

    const orc = Precos.orcamento({
      itens, look, de, ate, cupom, seguro: !!seguro,
      entrega_centavos: zona ? zona.preco_centavos : 0,
      servicos: servicosLimpos, clienteId, credito_disponivel_centavos: creditoDisponivel,
    });
    return {
      ...orc, indisponiveis, disponivel: indisponiveis.length === 0,
      look: look ? { id: look.id, titulo: look.titulo, desconto_pct: look.desconto_pct } : null,
      servicos: servicosLimpos, modo_entrega: s(modo_entrega, 20), zona_entrega: zona,
    };
  },

  // -------------------------------------------------------------------
  // 2. Criar a reserva — já segura a agenda (evita dois pagando a mesma peça)
  // -------------------------------------------------------------------
  criar(clienteId, d = {}) {
    const cliente = Users.obter(clienteId);
    if (!cliente) throw new Error('Faça login para reservar.');
    if (cliente.status !== 'ativo') throw new Error('Sua conta não pode reservar no momento.');
    const cot = Bookings.cotar({ ...d, clienteId });
    if (!cot.disponivel) {
      throw new Error('Indisponível nas datas escolhidas: ' + cot.indisponiveis.map((x) => x.titulo).join(', '));
    }
    // não deixa alugar a própria peça (fraude de autolocação para inflar reputação)
    if (cot.linhas.some((l) => l.owner_id === clienteId)) throw new Error('Você não pode alugar a sua própria peça.');

    const id = novoId();
    const agora = nowISO();
    const minutosPix = Config.num('pix_expira_min', 30);
    return transacao(() => {
      db.prepare(`INSERT INTO bookings (id, codigo, cliente_id, tipo, look_id, data_retirada, data_devolucao, dias, ocasiao, modo_entrega, endereco_entrega, observacoes,
        subtotal_centavos, desconto_centavos, cupom, credito_centavos, zona_entrega_id, seguro_centavos, entrega_centavos, servicos_centavos, caucao_centavos, total_centavos,
        comissao_centavos, comissao_pct, repasse_centavos, status, pix_expira_em, criado_em, atualizado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'aguardando_pagamento',?,?,?)`)
        .run(id, novoCodigo(), clienteId, d.look_id ? 'look' : 'peca', s(d.look_id, 40), cot.de, cot.ate, cot.dias,
          s(d.ocasiao, 40), s(d.modo_entrega, 20) || 'retirada', s(d.endereco_entrega, 300), s(d.observacoes, 1000),
          cot.subtotal_centavos, cot.desconto_centavos, cot.cupom, cot.credito_centavos || 0, (cot.zona_entrega || {}).id || '',
          cot.seguro_centavos, cot.entrega_centavos, cot.servicos_centavos,
          cot.caucao_centavos, cot.total_centavos, cot.comissao_centavos, cot.comissao_pct, cot.repasse_centavos,
          new Date(Date.now() + minutosPix * 60000).toISOString(), agora, agora);

      for (const l of cot.linhas) {
        db.prepare(`INSERT INTO booking_items (id, booking_id, item_id, owner_id, titulo, preco_diaria_centavos, dias, subtotal_centavos,
          desconto_centavos, comissao_centavos, repasse_centavos, caucao_centavos, status, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pendente',?)`)
          .run(novoId(), id, l.item_id, l.owner_id, l.titulo, l.preco_diaria_centavos, l.dias, l.subtotal_centavos,
            l.desconto_centavos, l.comissao_centavos, l.repasse_centavos, l.caucao_centavos, agora);
        // trava provisória da agenda: só o período pedido (a higienização entra ao confirmar)
        Agenda.bloquear(l.item_id, cot.de, cot.ate, 'reserva', id);
      }
      for (const sv of cot.servicos) {
        db.prepare('INSERT INTO booking_services (id, booking_id, service_id, partner_id, nome, tipo, preco_centavos, status, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(novoId(), id, sv.service_id, sv.partner_id, sv.nome, sv.tipo, sv.preco_centavos, 'contratado', agora);
      }
      if (cot.cupom) Cupons.consumir(cot.cupom, clienteId, id);
      if (cot.credito_centavos > 0) require('./crescimento').Creditos.usar(clienteId, cot.credito_centavos, id);
      evento(clienteId, 'reserva.criada', id, { total: cot.total_centavos, pecas: cot.linhas.length });
      return Bookings.obter(id);
    });
  },

  obter(id, { detalhe = true } = {}) {
    const b = db.prepare('SELECT * FROM bookings WHERE id = ? OR codigo = ?').get(s(id, 40), s(id, 40).toUpperCase());
    return b ? mapBooking(b, { detalhe }) : null;
  },

  // acesso: cliente da reserva, dono de alguma peça dela, ou admin
  podeVer(booking, user) {
    if (!booking || !user) return false;
    if (user.papel === 'admin' || user.papel === 'moderador') return true;
    if (booking.cliente_id === user.id) return true;
    return booking.donos.includes(user.id);
  },

  doCliente(clienteId, { status = '' } = {}) {
    const q = status ? 'SELECT * FROM bookings WHERE cliente_id = ? AND status = ? ORDER BY criado_em DESC LIMIT 200'
      : 'SELECT * FROM bookings WHERE cliente_id = ? ORDER BY criado_em DESC LIMIT 200';
    const linhas = status ? db.prepare(q).all(s(clienteId, 40), s(status, 30)) : db.prepare(q).all(s(clienteId, 40));
    return linhas.map((b) => mapBooking(b));
  },

  doOwner(ownerId, { status = '' } = {}) {
    let q = `SELECT b.* FROM bookings b WHERE EXISTS (SELECT 1 FROM booking_items bi WHERE bi.booking_id = b.id AND bi.owner_id = ?)`;
    const p = [s(ownerId, 40)];
    if (status) { q += ' AND b.status = ?'; p.push(s(status, 30)); }
    q += ' ORDER BY b.criado_em DESC LIMIT 200';
    return db.prepare(q).all(...p).map((b) => mapBooking(b));
  },

  // -------------------------------------------------------------------
  // 3. Pagamento aprovado → dinheiro BLOQUEADO na plataforma
  // -------------------------------------------------------------------
  marcarPago(id, { mp_payment_id = '', valor_centavos = 0 } = {}) {
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(s(id, 40));
    if (!b) throw new Error('Reserva não encontrada.');
    if (b.status === 'pago_bloqueado' || ['confirmado', 'retirado', 'devolvido', 'concluido'].includes(b.status)) {
      return { ok: true, ja: true, status: b.status }; // idempotente: o PSP reenvia o webhook
    }
    if (b.status !== 'aguardando_pagamento') throw new Error('Esta reserva não está aguardando pagamento.');
    const agora = nowISO();
    const prazo = horasAdiante(Config.num('prazo_confirmacao_h', 24));
    db.prepare("UPDATE bookings SET status='pago_bloqueado', pago_em=?, mp_payment_id=?, prazo_confirmacao=?, atualizado_em=? WHERE id=?")
      .run(agora, s(mp_payment_id, 60), prazo, agora, b.id);
    lancar('entrada', cent(valor_centavos || b.total_centavos), { bookingId: b.id, userId: b.cliente_id, descricao: 'Pagamento retido (escrow) — ' + b.codigo });
    const mapa = mapBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(b.id));
    for (const owner of [...new Set(db.prepare('SELECT owner_id FROM booking_items WHERE booking_id = ?').all(b.id).map((x) => x.owner_id))]) {
      avisar(owner, '💰 Nova reserva paga', `Reserva ${b.codigo}: o valor já está bloqueado. Confirme em até ${Config.num('prazo_confirmacao_h', 24)}h.`,
        '/closet/app#reservas', { chave: 'dono.nova-reserva', reserva: mapa });
    }
    avisar(b.cliente_id, '✅ Pagamento confirmado', `Reserva ${b.codigo}: aguardando a confirmação do proprietário.`,
      '/closet/app#minhas-reservas', { chave: 'cliente.pagamento-confirmado', reserva: mapa });
    evento(b.cliente_id, 'reserva.paga', b.id, { mp_payment_id: s(mp_payment_id, 60) });
    return { ok: true, status: 'pago_bloqueado' };
  },

  // -------------------------------------------------------------------
  // 4. Dono confirma (ou recusa). Confirmada por TODOS os donos → QR.
  // -------------------------------------------------------------------
  confirmar(id, ownerId) {
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(s(id, 40));
    if (!b) throw new Error('Reserva não encontrada.');
    if (b.status !== 'pago_bloqueado') throw new Error('Só é possível confirmar uma reserva paga e aguardando confirmação.');
    const meus = db.prepare("SELECT * FROM booking_items WHERE booking_id = ? AND owner_id = ?").all(b.id, s(ownerId, 40));
    if (!meus.length) throw new Error('Você não tem peças nesta reserva.');
    const agora = nowISO();
    return transacao(() => {
      db.prepare("UPDATE booking_items SET status='confirmado', confirmado_em=? WHERE booking_id=? AND owner_id=?").run(agora, b.id, s(ownerId, 40));
      const pendentes = n((db.prepare("SELECT COUNT(*) c FROM booking_items WHERE booking_id = ? AND status = 'pendente'").get(b.id) || {}).c);
      if (pendentes > 0) {
        db.prepare('UPDATE bookings SET atualizado_em=? WHERE id=?').run(agora, b.id);
        return { ok: true, status: b.status, aguardando_outros_donos: pendentes };
      }
      // todos confirmaram: gera os QR e estende o bloqueio com a higienização
      const tr = novoToken(); const td = novoToken();
      db.prepare("UPDATE bookings SET status='confirmado', confirmado_em=?, token_retirada=?, token_devolucao=?, atualizado_em=? WHERE id=?")
        .run(agora, tr, td, agora, b.id);
      for (const bi of db.prepare('SELECT * FROM booking_items WHERE booking_id = ?').all(b.id)) {
        const it = db.prepare('SELECT prep_dias FROM items WHERE id = ?').get(bi.item_id) || { prep_dias: 0 };
        db.prepare('UPDATE item_blocks SET fim = ? WHERE booking_id = ? AND item_id = ?')
          .run(somaDias(b.data_devolucao, Math.max(0, n(it.prep_dias, 0))), b.id, bi.item_id);
      }
      avisar(b.cliente_id, '🎉 Reserva confirmada', `Reserva ${b.codigo} confirmada. Seu QR Code de retirada já está no app.`,
        '/closet/app#minhas-reservas', { chave: 'cliente.confirmada', reserva: mapBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(b.id)) });
      evento(ownerId, 'reserva.confirmada', b.id, {});
      return { ok: true, status: 'confirmado' };
    });
  },

  recusar(id, ownerId, motivo) {
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(s(id, 40));
    if (!b) throw new Error('Reserva não encontrada.');
    if (!['pago_bloqueado', 'aguardando_pagamento'].includes(b.status)) throw new Error('Esta reserva não pode mais ser recusada.');
    if (ownerId && !db.prepare('SELECT 1 FROM booking_items WHERE booking_id = ? AND owner_id = ?').get(b.id, s(ownerId, 40))) {
      throw new Error('Você não tem peças nesta reserva.');
    }
    // Um look só faz sentido inteiro: recusa de qualquer dono devolve tudo ao cliente.
    return Bookings._encerrarComReembolso(b, 'recusado', b.total_centavos, s(motivo, 300) || 'recusada pelo proprietário', ownerId || 'proprietário');
  },

  cancelar(id, clienteId, motivo) {
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(s(id, 40));
    if (!b) throw new Error('Reserva não encontrada.');
    if (clienteId && b.cliente_id !== clienteId) throw new Error('Esta reserva não é sua.');
    if (!['aguardando_pagamento', 'pago_bloqueado', 'confirmado'].includes(b.status)) {
      throw new Error('Reserva já retirada ou encerrada não pode ser cancelada por aqui — abra uma solicitação.');
    }
    const politica = Config.json('cancelamento', [{ dias: 7, reembolso_pct: 100 }, { dias: 3, reembolso_pct: 50 }, { dias: 0, reembolso_pct: 0 }]);
    const faltam = diasEntre(hojeISO(), b.data_retirada);
    const regra = politica.slice().sort((a, c) => c.dias - a.dias).find((r) => faltam >= r.dias) || { reembolso_pct: 0 };
    // a caução sempre volta inteira: ela nunca foi receita de ninguém
    const locacao = Math.max(0, b.total_centavos - b.caucao_centavos);
    const reembolso = b.status === 'aguardando_pagamento' ? 0 : Math.round(locacao * regra.reembolso_pct / 100) + b.caucao_centavos;
    return Bookings._encerrarComReembolso(b, 'cancelado', reembolso, s(motivo, 300) || `cancelada pelo cliente (${regra.reembolso_pct}% da locação)`, clienteId || 'cliente');
  },

  // encerra liberando a agenda e devolvendo o que for devido
  _encerrarComReembolso(b, novoStatus, reembolsoCentavos, motivo, quem) {
    const agora = nowISO();
    const reembolso = Math.max(0, Math.min(cent(reembolsoCentavos), b.total_centavos));
    transacao(() => {
      db.prepare('UPDATE bookings SET status=?, motivo_status=?, cancelado_em=?, reembolso_centavos=?, atualizado_em=? WHERE id=?')
        .run(novoStatus, motivo, agora, reembolso, agora, b.id);
      db.prepare("UPDATE booking_items SET status='recusado' WHERE booking_id=?").run(b.id);
      db.prepare("UPDATE payouts SET status='retido', motivo=? WHERE booking_id=?").run(motivo, b.id);
      Agenda.limparDaReserva(b.id);
      // reserva que não aconteceu devolve o crédito usado — ele não é consumido à toa
      try { require('./crescimento').Creditos.devolver(b.cliente_id, b.id); } catch (_) {}
      if (reembolso > 0) lancar('reembolso', -reembolso, { bookingId: b.id, userId: b.cliente_id, descricao: `Reembolso ${novoStatus} — ${b.codigo}` });
      // o que a plataforma reteve (multa de cancelamento) vira receita
      const retido = (b.pago_em ? b.total_centavos : 0) - reembolso;
      if (retido > 0) lancar('comissao', retido, { bookingId: b.id, descricao: `Retenção por ${novoStatus} — ${b.codigo}` });
      evento(b.cliente_id, 'reserva.' + novoStatus, b.id, { reembolso, quem: s(quem, 60) });
    });
    if (b.pago_em && reembolso > 0) {
      Promise.resolve(_hooks.reembolsar(b.mp_payment_id, reembolso, b.codigo)).catch(() => {});
    }
    avisar(b.cliente_id, novoStatus === 'recusado' ? '❌ Reserva recusada' : '↩️ Reserva cancelada',
      `Reserva ${b.codigo}: ${motivo}.` + (reembolso > 0 ? ` Reembolso de R$ ${(reembolso / 100).toFixed(2)} em processamento.` : ''),
      '/closet/app#minhas-reservas',
      { chave: 'cliente.encerrada', reserva: mapBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(b.id)), extra: { rotulo: novoStatus === 'recusado' ? 'recusada' : 'cancelada' } });
    for (const o of new Set(db.prepare('SELECT owner_id FROM booking_items WHERE booking_id = ?').all(b.id).map((x) => x.owner_id))) {
      avisar(o, 'Reserva encerrada', `Reserva ${b.codigo}: ${motivo}. Suas datas voltaram a ficar livres.`, '/closet/app#reservas');
    }
    return { ok: true, status: novoStatus, reembolso_centavos: reembolso };
  },

  // -------------------------------------------------------------------
  // 5. QR: retirada e devolução (registro de posse)
  // -------------------------------------------------------------------
  porToken(token) {
    const t = s(token, 80);
    if (!t) return null;
    const b = db.prepare('SELECT * FROM bookings WHERE token_retirada = ? OR token_devolucao = ?').get(t, t);
    if (!b) return null;
    return { booking: mapBooking(b, { detalhe: true }), etapa: b.token_retirada === t ? 'retirada' : 'devolucao' };
  },

  registrarRetirada(token, quemId) {
    const r = Bookings.porToken(token);
    if (!r || r.etapa !== 'retirada') throw new Error('QR Code inválido para retirada.');
    const b = r.booking;
    if (b.status === 'retirado') return { ok: true, ja: true, status: 'retirado', codigo: b.codigo };
    if (b.status !== 'confirmado') throw new Error(`Esta reserva está em "${repo.STATUS_BOOKING[b.status] || b.status}" — não é possível registrar a retirada.`);
    const agora = nowISO();
    db.prepare("UPDATE bookings SET status='retirado', retirada_em=?, retirada_por=?, atualizado_em=? WHERE id=?").run(agora, s(quemId, 40), agora, b.id);
    db.prepare("UPDATE booking_items SET status='retirado' WHERE booking_id=?").run(b.id);
    avisar(b.cliente_id, '👗 Retirada registrada', `Reserva ${b.codigo}: aproveite! Devolução em ${b.data_devolucao}.`, '/closet/app#minhas-reservas');
    for (const o of b.donos) avisar(o, 'Peça retirada', `Reserva ${b.codigo}: retirada registrada agora.`, '/closet/app#reservas');
    evento(quemId, 'reserva.retirada', b.id, {});
    return { ok: true, status: 'retirado', codigo: b.codigo };
  },

  registrarDevolucao(token, quemId) {
    const r = Bookings.porToken(token);
    if (!r || r.etapa !== 'devolucao') throw new Error('QR Code inválido para devolução.');
    const b = r.booking;
    if (['devolvido', 'concluido', 'em_disputa'].includes(b.status)) return { ok: true, ja: true, status: b.status, codigo: b.codigo };
    if (b.status !== 'retirado') throw new Error('A retirada desta reserva ainda não foi registrada.');
    const agora = nowISO();
    const janela = horasAdiante(Config.num('janela_vistoria_h', 24));
    db.prepare("UPDATE bookings SET status='devolvido', devolucao_em=?, devolucao_por=?, janela_vistoria=?, atualizado_em=? WHERE id=?")
      .run(agora, s(quemId, 40), janela, agora, b.id);
    db.prepare("UPDATE booking_items SET status='devolvido' WHERE booking_id=?").run(b.id);
    for (const o of b.donos) {
      avisar(o, '📦 Devolução registrada', `Reserva ${b.codigo}: confira a peça. Sem contestação em ${Config.num('janela_vistoria_h', 24)}h, o repasse é liberado.`,
        '/closet/app#reservas', { chave: 'dono.devolucao', reserva: b });
    }
    avisar(b.cliente_id, '✅ Devolução registrada', `Reserva ${b.codigo}: obrigado! Sua caução volta após a vistoria.`, '/closet/app#minhas-reservas');
    evento(quemId, 'reserva.devolvida', b.id, {});
    return { ok: true, status: 'devolvido', codigo: b.codigo };
  },

  // -------------------------------------------------------------------
  // 6. Conclusão: comissão fica, repasse Pix é liberado, caução volta
  // -------------------------------------------------------------------
  concluir(id, { quem = 'sistema', forcar = false } = {}) {
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(s(id, 40));
    if (!b) throw new Error('Reserva não encontrada.');
    if (b.status === 'concluido') return { ok: true, ja: true };
    if (b.status !== 'devolvido' && !(forcar && b.status === 'em_disputa')) throw new Error('Só é possível concluir uma reserva devolvida.');
    const agora = nowISO();
    const criados = transacao(() => {
      db.prepare("UPDATE bookings SET status='concluido', concluido_em=?, atualizado_em=? WHERE id=?").run(agora, agora, b.id);
      const porDono = new Map();
      for (const bi of db.prepare('SELECT * FROM booking_items WHERE booking_id = ?').all(b.id)) {
        porDono.set(bi.owner_id, (porDono.get(bi.owner_id) || 0) + bi.repasse_centavos);
        db.prepare("UPDATE items SET alugueis = alugueis + 1 WHERE id = ?").run(bi.item_id);
      }
      const lista = [];
      for (const [ownerId, valor] of porDono) {
        const dono = Users.obter(ownerId) || {};
        const pid = novoId();
        db.prepare(`INSERT INTO payouts (id, owner_id, booking_id, valor_centavos, pix_tipo, pix_chave, status, liberado_em, criado_em)
          VALUES (?,?,?,?,?,?,'liberado',?,?) ON CONFLICT(booking_id, owner_id) DO UPDATE SET status='liberado', liberado_em=excluded.liberado_em`)
          .run(pid, ownerId, b.id, valor, dono.pix_tipo || '', dono.pix_chave || '', agora, agora);
        db.prepare('UPDATE users SET num_alugueis = num_alugueis + 1 WHERE id = ?').run(ownerId);
        lista.push({ owner_id: ownerId, valor_centavos: valor, tem_pix: !!dono.pix_chave });
      }
      db.prepare('UPDATE users SET num_locacoes = num_locacoes + 1 WHERE id = ?').run(b.cliente_id);
      if (b.look_id) db.prepare('UPDATE looks SET alugueis = alugueis + 1 WHERE id = ?').run(b.look_id);
      lancar('comissao', b.comissao_centavos, { bookingId: b.id, descricao: `Comissão ${b.comissao_pct}% — ${b.codigo}` });
      lancar('repasse', -b.repasse_centavos, { bookingId: b.id, descricao: `Repasse aos proprietários — ${b.codigo}` });
      if (b.caucao_centavos > 0) lancar('caucao', -b.caucao_centavos, { bookingId: b.id, userId: b.cliente_id, descricao: `Devolução de caução — ${b.codigo}` });
      evento(b.cliente_id, 'reserva.concluida', b.id, { comissao: b.comissao_centavos, repasse: b.repasse_centavos, quem: s(quem, 60) });
      return lista;
    });
    // 1º aluguel concluído de quem veio por indicação: premia padrinho e afilhada
    try { require('./crescimento').Indicacoes.premiarSePrimeira(b.cliente_id, b.id); } catch (_) {}
    if (b.caucao_centavos > 0 && b.pago_em) Promise.resolve(_hooks.reembolsar(b.mp_payment_id, b.caucao_centavos, b.codigo + ' (caução)')).catch(() => {});
    const mapaConcluida = mapBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(b.id));
    for (const p of criados) {
      avisar(p.owner_id, '💸 Repasse liberado',
        `Reserva ${b.codigo}: R$ ${(p.valor_centavos / 100).toFixed(2)} liberado` + (p.tem_pix ? ' — Pix a caminho.' : '. Cadastre sua chave Pix para receber.'),
        '/closet/app#financeiro',
        { chave: 'dono.repasse', reserva: mapaConcluida, extra: { valor_centavos: p.valor_centavos, tem_pix: p.tem_pix } });
    }
    avisar(b.cliente_id, '⭐ Como foi?', `Reserva ${b.codigo} concluída. Avalie a peça e o proprietário.`,
      '/closet/app#minhas-reservas', { chave: 'cliente.avalie', reserva: mapaConcluida });
    return { ok: true, status: 'concluido', repasses: criados.length };
  },

  // -------------------------------------------------------------------
  // 7. Disputa (dano, não devolução, peça diferente do anúncio)
  // -------------------------------------------------------------------
  abrirDisputa(bookingId, userId, d = {}) {
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(s(bookingId, 40));
    if (!b) throw new Error('Reserva não encontrada.');
    const mapa = mapBooking(b);
    const ehDono = mapa.donos.includes(s(userId, 40));
    const ehCliente = b.cliente_id === s(userId, 40);
    if (!ehDono && !ehCliente) throw new Error('Você não participa desta reserva.');
    if (!['retirado', 'devolvido', 'confirmado', 'concluido'].includes(b.status)) throw new Error('Não há o que contestar nesta etapa.');
    if (b.status === 'concluido') throw new Error('Reserva já concluída e repassada — fale com o suporte.');
    const id = novoId();
    const agora = nowISO();
    transacao(() => {
      db.prepare(`INSERT INTO disputes (id, booking_id, aberta_por, contra, motivo, descricao, evidencias, valor_pedido_centavos, status, criado_em)
        VALUES (?,?,?,?,?,?,?,?,'aberta',?)`)
        .run(id, b.id, s(userId, 40), ehDono ? b.cliente_id : (mapa.donos[0] || ''), s(d.motivo, 30) || 'dano',
          s(d.descricao, 3000), j.str(Array.isArray(d.evidencias) ? d.evidencias : []), cent(d.valor_pedido_centavos), agora);
      db.prepare("UPDATE bookings SET status='em_disputa', motivo_status=?, atualizado_em=? WHERE id=?").run('disputa aberta: ' + (s(d.motivo, 30) || 'dano'), agora, b.id);
      db.prepare("UPDATE payouts SET status='retido', motivo='disputa aberta' WHERE booking_id=?").run(b.id);
    });
    Promise.resolve(_hooks.notificar(`⚠️ Closet Club: disputa aberta na reserva ${b.codigo} (${s(d.motivo, 30) || 'dano'}).`)).catch(() => {});
    for (const alvo of [b.cliente_id, ...mapa.donos]) {
      if (alvo !== s(userId, 40)) avisar(alvo, '⚠️ Disputa aberta', `Reserva ${b.codigo}: a plataforma vai mediar. O valor segue bloqueado.`, '/closet/app');
    }
    evento(userId, 'disputa.aberta', b.id, { motivo: s(d.motivo, 30) });
    return { ok: true, id };
  },

  // admin decide: quanto do valor bloqueado fica retido (indenização ao dono) e o resto segue o fluxo
  resolverDisputa(disputaId, { decisao = '', valor_retido_centavos = 0, favor = 'proprietario', quem = 'admin' } = {}) {
    const d = db.prepare('SELECT * FROM disputes WHERE id = ?').get(s(disputaId, 40));
    if (!d) throw new Error('Disputa não encontrada.');
    if (d.status === 'resolvida') throw new Error('Disputa já resolvida.');
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(d.booking_id);
    const agora = nowISO();
    const retido = Math.max(0, Math.min(cent(valor_retido_centavos), b.caucao_centavos + b.total_centavos));
    db.prepare("UPDATE disputes SET status='resolvida', decisao=?, valor_retido_centavos=?, decidida_por=?, decidida_em=? WHERE id=?")
      .run(s(decisao, 2000), retido, s(quem, 80), agora, d.id);

    if (favor === 'cliente') {
      // cliente tinha razão: devolve tudo o que foi pago e nada é repassado
      Bookings._encerrarComReembolso(b, 'reembolsado', b.total_centavos, 'disputa decidida a favor do cliente', quem);
      repo.Users.strike(d.contra || '', 'disputa procedente');
    } else {
      // Proprietário indenizado com parte da caução: primeiro a reserva conclui
      // normalmente (gerando o repasse da locação), DEPOIS a indenização é
      // somada ao repasse do dono. A ordem importa — concluir() reescreve o
      // status do repasse, então uma indenização lançada antes seria perdida.
      db.prepare("UPDATE bookings SET status='devolvido', motivo_status=?, atualizado_em=? WHERE id=?").run('disputa resolvida', agora, b.id);
      db.prepare("UPDATE payouts SET status='pendente', motivo='' WHERE booking_id=?").run(b.id);
      const donoPrincipal = (db.prepare('SELECT owner_id FROM booking_items WHERE booking_id = ? LIMIT 1').get(b.id) || {}).owner_id;
      if (retido > 0) {
        // a indenização sai da caução do cliente: ele recebe de volta só o que sobrar
        db.prepare('UPDATE bookings SET caucao_centavos = MAX(0, caucao_centavos - ?) WHERE id = ?').run(retido, b.id);
      }
      Bookings.concluir(b.id, { quem, forcar: true });
      if (retido > 0 && donoPrincipal) {
        db.prepare('UPDATE payouts SET valor_centavos = valor_centavos + ?, motivo = ? WHERE booking_id = ? AND owner_id = ?')
          .run(retido, 'inclui indenização de disputa', b.id, donoPrincipal);
        lancar('caucao', retido, { bookingId: b.id, userId: donoPrincipal, descricao: `Indenização por dano retida da caução — ${b.codigo}` });
      }
      if (d.contra) repo.Users.strike(d.contra, 'disputa procedente contra o cliente');
    }
    evento('', 'disputa.resolvida', d.id, { favor, retido, quem: s(quem, 60) });
    return { ok: true, favor, valor_retido_centavos: retido };
  },

  listarDisputas({ status = '' } = {}) {
    const q = status ? 'SELECT * FROM disputes WHERE status = ? ORDER BY criado_em DESC LIMIT 200' : 'SELECT * FROM disputes ORDER BY criado_em DESC LIMIT 200';
    const linhas = status ? db.prepare(q).all(s(status, 20)) : db.prepare(q).all();
    return linhas.map((d) => ({ ...d, evidencias: j.parse(d.evidencias, []), reserva: Bookings.obter(d.booking_id, { detalhe: false }) }));
  },

  // -------------------------------------------------------------------
  // 8. Rotina: expira Pix, estorna quem não confirmou, conclui vistorias
  // -------------------------------------------------------------------
  rotina() {
    const agora = nowISO();
    let expiradas = 0, naoConfirmadas = 0, concluidas = 0;

    for (const b of db.prepare("SELECT * FROM bookings WHERE status = 'aguardando_pagamento' AND pix_expira_em != '' AND pix_expira_em < ?").all(agora)) {
      transacao(() => {
        db.prepare("UPDATE bookings SET status='expirado', motivo_status='Pix não pago no prazo', atualizado_em=? WHERE id=?").run(agora, b.id);
        Agenda.limparDaReserva(b.id);
      });
      avisar(b.cliente_id, 'Reserva expirada', `Reserva ${b.codigo}: o Pix não foi pago a tempo e as datas foram liberadas.`, '/closet');
      expiradas++;
    }
    for (const b of db.prepare("SELECT * FROM bookings WHERE status = 'pago_bloqueado' AND prazo_confirmacao != '' AND prazo_confirmacao < ?").all(agora)) {
      try { Bookings._encerrarComReembolso(b, 'recusado', b.total_centavos, 'proprietário não confirmou no prazo — reembolso integral', 'sistema'); naoConfirmadas++; } catch (_) {}
    }
    for (const b of db.prepare("SELECT * FROM bookings WHERE status = 'devolvido' AND janela_vistoria != '' AND janela_vistoria < ?").all(agora)) {
      try { Bookings.concluir(b.id, { quem: 'sistema' }); concluidas++; } catch (_) {}
    }
    evento('', 'rotina.reservas', '', { expiradas, naoConfirmadas, concluidas });
    return { expiradas, nao_confirmadas: naoConfirmadas, concluidas };
  },
};

// ---------------------------------------------------------------------
// Repasses (saída de dinheiro ao proprietário)
// ---------------------------------------------------------------------
const Payouts = {
  doOwner(ownerId) {
    return db.prepare('SELECT p.*, b.codigo FROM payouts p JOIN bookings b ON b.id = p.booking_id WHERE p.owner_id = ? ORDER BY p.criado_em DESC LIMIT 200').all(s(ownerId, 40));
  },
  listar({ status = 'liberado' } = {}) {
    return db.prepare('SELECT p.*, b.codigo, u.nome AS proprietario, u.pix_chave AS chave FROM payouts p JOIN bookings b ON b.id = p.booking_id JOIN users u ON u.id = p.owner_id WHERE p.status = ? ORDER BY p.criado_em').all(s(status, 20));
  },
  marcarPago(id, { mp_transfer_id = '', quem = 'admin' } = {}) {
    const p = db.prepare('SELECT * FROM payouts WHERE id = ?').get(s(id, 40));
    if (!p) throw new Error('Repasse não encontrado.');
    if (p.status === 'pago') return { ok: true, ja: true };
    db.prepare("UPDATE payouts SET status='pago', mp_transfer_id=?, pago_em=? WHERE id=?").run(s(mp_transfer_id, 80), nowISO(), p.id);
    evento(p.owner_id, 'repasse.pago', p.id, { valor: p.valor_centavos, quem: s(quem, 60) });
    avisar(p.owner_id, '💸 Pix enviado', `R$ ${(p.valor_centavos / 100).toFixed(2)} enviados para a sua chave Pix.`, '/closet/app#financeiro');
    return { ok: true };
  },
  saldo(ownerId) {
    const q = (st) => n((db.prepare('SELECT COALESCE(SUM(valor_centavos),0) v FROM payouts WHERE owner_id = ? AND status = ?').get(s(ownerId, 40), st) || {}).v);
    const aReceber = n((db.prepare(`SELECT COALESCE(SUM(bi.repasse_centavos),0) v FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id
      WHERE bi.owner_id = ? AND b.status IN ('pago_bloqueado','confirmado','retirado','devolvido')`).get(s(ownerId, 40)) || {}).v);
    return { em_andamento_centavos: aReceber, liberado_centavos: q('liberado'), pago_centavos: q('pago'), retido_centavos: q('retido') };
  },
};

// ---------------------------------------------------------------------
// Avaliações, favoritos e chat
// ---------------------------------------------------------------------
const Reviews = {
  criar(autorId, d = {}) {
    const alvoTipo = s(d.alvo_tipo, 20);
    if (!['item', 'proprietario', 'cliente'].includes(alvoTipo)) throw new Error('Tipo de avaliação inválido.');
    const b = d.booking_id ? db.prepare('SELECT * FROM bookings WHERE id = ?').get(s(d.booking_id, 40)) : null;
    if (!b) throw new Error('Avaliação só é possível a partir de uma reserva.');
    if (b.status !== 'concluido') throw new Error('Avalie após a conclusão da reserva.');
    const mapa = mapBooking(b);
    const ehCliente = b.cliente_id === s(autorId, 40);
    const ehDono = mapa.donos.includes(s(autorId, 40));
    if (!ehCliente && !ehDono) throw new Error('Você não participou desta reserva.');
    if (ehCliente && alvoTipo === 'cliente') throw new Error('O cliente não avalia a si mesmo.');
    if (ehDono && alvoTipo !== 'cliente') throw new Error('O proprietário avalia o cliente.');
    const nota = Math.min(5, Math.max(1, n(d.nota, 5)));
    const id = novoId();
    db.prepare(`INSERT INTO reviews (id, booking_id, autor_id, alvo_tipo, alvo_id, nota, texto, detalhes, criado_em) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, b.id, s(autorId, 40), alvoTipo, s(d.alvo_id, 40), nota, s(d.texto, 3000), j.str(d.detalhes || {}), nowISO());
    Reviews.recalcular(alvoTipo, s(d.alvo_id, 40));
    evento(autorId, 'avaliacao.criada', id, { alvo_tipo: alvoTipo, nota });
    return { ok: true, id };
  },
  recalcular(alvoTipo, alvoId) {
    const r = db.prepare("SELECT COUNT(*) c, COALESCE(AVG(nota),0) m FROM reviews WHERE alvo_tipo = ? AND alvo_id = ? AND publicada = 1").get(alvoTipo, alvoId);
    const media = Math.round((r.m || 0) * 100) / 100;
    if (alvoTipo === 'item') db.prepare('UPDATE items SET nota_media=?, num_avaliacoes=? WHERE id=?').run(media, r.c, alvoId);
    else db.prepare('UPDATE users SET nota_media=?, num_avaliacoes=? WHERE id=?').run(media, r.c, alvoId);
  },
  doAlvo(alvoTipo, alvoId, limite = 30) {
    return db.prepare(`SELECT r.*, u.nome AS autor_nome, u.avatar_url AS autor_avatar FROM reviews r JOIN users u ON u.id = r.autor_id
      WHERE r.alvo_tipo = ? AND r.alvo_id = ? AND r.publicada = 1 ORDER BY r.criado_em DESC LIMIT ?`)
      .all(alvoTipo, s(alvoId, 40), Math.min(n(limite, 30), 100))
      .map((r) => ({ ...r, detalhes: j.parse(r.detalhes, {}) }));
  },
  responder(id, autorAlvoId, texto) {
    const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(s(id, 40));
    if (!r) throw new Error('Avaliação não encontrada.');
    const dono = r.alvo_tipo === 'item' ? (db.prepare('SELECT owner_id FROM items WHERE id = ?').get(r.alvo_id) || {}).owner_id : r.alvo_id;
    if (dono !== s(autorAlvoId, 40)) throw new Error('Só quem foi avaliado pode responder.');
    db.prepare('UPDATE reviews SET resposta = ? WHERE id = ?').run(s(texto, 2000), r.id);
    return { ok: true };
  },
  moderar(id, publicada, quem) {
    const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(s(id, 40));
    if (!r) throw new Error('Avaliação não encontrada.');
    db.prepare('UPDATE reviews SET publicada = ? WHERE id = ?').run(publicada ? 1 : 0, r.id);
    Reviews.recalcular(r.alvo_tipo, r.alvo_id);
    evento('', 'avaliacao.moderada', r.id, { publicada: !!publicada, quem: s(quem, 60) });
    return { ok: true };
  },
};

const Favoritos = {
  alternar(userId, alvoTipo, alvoId) {
    const tipo = s(alvoTipo, 10) === 'look' ? 'look' : 'item';
    const ja = db.prepare('SELECT 1 FROM favorites WHERE user_id=? AND alvo_tipo=? AND alvo_id=?').get(s(userId, 40), tipo, s(alvoId, 40));
    if (ja) {
      db.prepare('DELETE FROM favorites WHERE user_id=? AND alvo_tipo=? AND alvo_id=?').run(s(userId, 40), tipo, s(alvoId, 40));
      if (tipo === 'item') db.prepare('UPDATE items SET favoritos = MAX(0, favoritos - 1) WHERE id = ?').run(s(alvoId, 40));
      return { favoritado: false };
    }
    db.prepare('INSERT INTO favorites (user_id, alvo_tipo, alvo_id, criado_em) VALUES (?,?,?,?)').run(s(userId, 40), tipo, s(alvoId, 40), nowISO());
    if (tipo === 'item') db.prepare('UPDATE items SET favoritos = favoritos + 1 WHERE id = ?').run(s(alvoId, 40));
    return { favoritado: true };
  },
  listar(userId) {
    const f = db.prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY criado_em DESC LIMIT 200').all(s(userId, 40));
    return {
      itens: f.filter((x) => x.alvo_tipo === 'item').map((x) => Items.obter(x.alvo_id)).filter(Boolean),
      looks: f.filter((x) => x.alvo_tipo === 'look').map((x) => Looks.obter(x.alvo_id)).filter(Boolean),
    };
  },
};

const Chat = {
  abrir(clienteId, ownerId, { item_id = '', booking_id = '', assunto = '' } = {}) {
    if (s(clienteId, 40) === s(ownerId, 40)) throw new Error('Não é possível conversar consigo mesmo.');
    const ja = db.prepare('SELECT * FROM threads WHERE cliente_id=? AND owner_id=? AND item_id=? AND booking_id=?')
      .get(s(clienteId, 40), s(ownerId, 40), s(item_id, 40), s(booking_id, 40));
    if (ja) return ja.id;
    const id = novoId();
    db.prepare('INSERT INTO threads (id, booking_id, item_id, cliente_id, owner_id, assunto, ultima_em, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, s(booking_id, 40), s(item_id, 40), s(clienteId, 40), s(ownerId, 40), s(assunto, 140), nowISO(), nowISO());
    return id;
  },
  enviar(threadId, autorId, texto, { sistema = false } = {}) {
    const t = db.prepare('SELECT * FROM threads WHERE id = ?').get(s(threadId, 40));
    if (!t) throw new Error('Conversa não encontrada.');
    if (!sistema && ![t.cliente_id, t.owner_id].includes(s(autorId, 40))) throw new Error('Você não participa desta conversa.');
    const txt = s(texto, 4000);
    if (!txt) throw new Error('Mensagem vazia.');
    const id = novoId();
    const agora = nowISO();
    db.prepare('INSERT INTO messages (id, thread_id, autor_id, texto, sistema, criado_em) VALUES (?,?,?,?,?,?)')
      .run(id, t.id, s(autorId, 40), txt, sistema ? 1 : 0, agora);
    db.prepare('UPDATE threads SET ultima_em = ? WHERE id = ?').run(agora, t.id);
    const destino = s(autorId, 40) === t.cliente_id ? t.owner_id : t.cliente_id;
    if (!sistema) avisar(destino, '💬 Nova mensagem', txt.slice(0, 120), '/closet/app#mensagens');
    // tempo de resposta do proprietário alimenta a reputação
    if (!sistema && s(autorId, 40) === t.owner_id) {
      const anterior = db.prepare("SELECT criado_em FROM messages WHERE thread_id=? AND autor_id=? ORDER BY criado_em DESC LIMIT 1").get(t.id, t.cliente_id);
      if (anterior) {
        const min = Math.max(0, Math.round((Date.parse(agora) - Date.parse(anterior.criado_em)) / 60000));
        const u = db.prepare('SELECT resposta_min FROM users WHERE id = ?').get(t.owner_id) || { resposta_min: 0 };
        db.prepare('UPDATE users SET resposta_min = ? WHERE id = ?').run(u.resposta_min ? Math.round((u.resposta_min + min) / 2) : min, t.owner_id);
      }
    }
    return { ok: true, id };
  },
  listar(userId) {
    return db.prepare(`SELECT t.*, (SELECT texto FROM messages m WHERE m.thread_id = t.id ORDER BY m.criado_em DESC LIMIT 1) AS ultima,
      (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id AND m.autor_id != ? AND m.lida_em = '') AS nao_lidas
      FROM threads t WHERE t.cliente_id = ? OR t.owner_id = ? ORDER BY t.ultima_em DESC LIMIT 100`)
      .all(s(userId, 40), s(userId, 40), s(userId, 40))
      .map((t) => ({ ...t, outro: Users.publico(t.cliente_id === s(userId, 40) ? t.owner_id : t.cliente_id) }));
  },
  mensagens(threadId, userId) {
    const t = db.prepare('SELECT * FROM threads WHERE id = ?').get(s(threadId, 40));
    if (!t) throw new Error('Conversa não encontrada.');
    if (![t.cliente_id, t.owner_id].includes(s(userId, 40))) throw new Error('Você não participa desta conversa.');
    db.prepare("UPDATE messages SET lida_em = ? WHERE thread_id = ? AND autor_id != ? AND lida_em = ''").run(nowISO(), t.id, s(userId, 40));
    return {
      thread: { ...t, outro: Users.publico(t.cliente_id === s(userId, 40) ? t.owner_id : t.cliente_id) },
      mensagens: db.prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY criado_em LIMIT 500').all(t.id),
    };
  },
};

module.exports = { Bookings, Payouts, Reviews, Favoritos, Chat, configurar, mapBooking };
