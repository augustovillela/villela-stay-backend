// =====================================================================
// Villela Legal Intelligence — NOTIFICAÇÕES (Fase 5, Módulo 18).
//
// Serviço único: grava a notificação interna (sino do portal) SEMPRE, e
// tenta e-mail/WhatsApp conforme as preferências do cliente
// (clients.preferencias_comunicacao JSON: {email:true, whatsapp:true}).
// Envio é best-effort: falha de canal vira status 'erro' na linha do
// canal, nunca derruba a operação que disparou a notificação.
// enviarEmail/enviarWhatsApp/alertaAugusto são INJETADOS pelo server.js.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');

let _canais = { enviarEmail: async () => false, enviarWhatsApp: async () => false, alertaAugusto: async () => {} };
function configurar(canais) { _canais = { ..._canais, ...canais }; }

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

function gravar({ destinatario_tipo, destinatario, canal, titulo, corpo, ref_tipo, ref_id, status }) {
  const id = novoId();
  db.prepare(`INSERT INTO notifications (id, destinatario_tipo, destinatario, canal, titulo, corpo, ref_tipo, ref_id, status, criado_em, enviado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, destinatario_tipo, String(destinatario), canal, s(titulo, 200), s(corpo, 2000),
      s(ref_tipo, 30), s(ref_id, 40), status, nowISO(), status === 'enviada' ? nowISO() : '');
  return id;
}

// Notifica um CLIENTE: interna sempre + e-mail/WhatsApp conforme preferências.
async function notificarCliente(clientId, { titulo, corpo, ref_tipo, ref_id }) {
  const c = db.prepare('SELECT id, nome, email, whatsapp, preferencias_comunicacao FROM clients WHERE id = ?').get(String(clientId || ''));
  if (!c) return { ok: false, erro: 'cliente não encontrado' };
  const prefs = j.parse(c.preferencias_comunicacao, {});
  const base = { destinatario_tipo: 'cliente', destinatario: c.id, titulo, corpo, ref_tipo, ref_id };
  gravar({ ...base, canal: 'interna', status: 'pendente' }); // aparece no sino do portal do cliente

  const resultados = { interna: true };
  if (prefs.email !== false && c.email) { // padrão: e-mail ligado se houver endereço
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#2b2d2f">
      <div style="background:#1B2A4A;color:#F8F9FA;padding:16px 22px;border-radius:10px 10px 0 0"><strong>Villela Legal</strong></div>
      <div style="border:1px solid #e5e0d5;border-top:0;padding:18px 22px;border-radius:0 0 10px 10px">
      <p><strong>${s(titulo, 200)}</strong></p><p>${s(corpo, 2000).replace(/\n/g, '<br>')}</p>
      <p style="color:#777;font-size:12px">Acompanhe os detalhes no seu portal do cliente.</p></div></div>`;
    const ok = await _canais.enviarEmail(c.email, '[Villela Legal] ' + s(titulo, 150), html).catch(() => false);
    gravar({ ...base, canal: 'email', status: ok ? 'enviada' : 'erro' });
    resultados.email = ok;
  }
  if (prefs.whatsapp === true && c.whatsapp) { // WhatsApp só com opt-in explícito
    const ok = await _canais.enviarWhatsApp(c.whatsapp, `⚖️ Villela Legal — ${s(titulo, 150)}\n${s(corpo, 500)}\n(Detalhes no seu portal do cliente.)`).catch(() => false);
    gravar({ ...base, canal: 'whatsapp', status: ok ? 'enviada' : 'erro' });
    resultados.whatsapp = ok;
  }
  return { ok: true, resultados };
}

// Notificação interna para a equipe (aparece nos alertas) + WhatsApp do Augusto
async function notificarEquipe({ titulo, corpo, ref_tipo, ref_id, whatsapp = true }) {
  gravar({ destinatario_tipo: 'user', destinatario: 'equipe', canal: 'interna', titulo, corpo, ref_tipo, ref_id, status: 'pendente' });
  if (whatsapp) await _canais.alertaAugusto(`⚖️ ${s(titulo, 150)} — ${s(corpo, 300)}`).catch(() => {});
}

const Notificacoes = {
  doCliente(clientId, { somenteNaoLidas = false, limite = 50 } = {}) {
    let sql = `SELECT id, titulo, corpo, ref_tipo, ref_id, status, criado_em FROM notifications
      WHERE destinatario_tipo = 'cliente' AND destinatario = ? AND canal = 'interna'`;
    if (somenteNaoLidas) sql += " AND status = 'pendente'";
    sql += ' ORDER BY criado_em DESC LIMIT ?';
    return db.prepare(sql).all(String(clientId), Math.min(Number(limite) || 50, 200));
  },
  naoLidasDoCliente(clientId) {
    return db.prepare(`SELECT COUNT(*) n FROM notifications WHERE destinatario_tipo = 'cliente'
      AND destinatario = ? AND canal = 'interna' AND status = 'pendente'`).get(String(clientId)).n;
  },
  marcarLida(id, clientId) {
    db.prepare(`UPDATE notifications SET status = 'lida' WHERE id = ? AND destinatario_tipo = 'cliente' AND destinatario = ?`)
      .run(String(id), String(clientId));
  },
  daEquipe(limite = 50) {
    return db.prepare(`SELECT * FROM notifications WHERE destinatario_tipo = 'user' ORDER BY criado_em DESC LIMIT ?`)
      .all(Math.min(Number(limite) || 50, 200));
  },
};

module.exports = { configurar, notificarCliente, notificarEquipe, Notificacoes };
