// =====================================================================
// Villela Academy — Web Push do painel (PWA). Assinaturas na tabela
// push_subs do banco do produto (por user_id — o Academy não é
// multi-tenant); envio pelo helper compartilhado ../push-saas.js
// (VAPID por env). Envio é sempre best-effort: nunca bloqueia a rota
// nem o sininho — quem chama usa .catch(() => {}).
// =====================================================================
'use strict';
const { db, nowISO, j } = require('./db');
const pushSaas = require('../push-saas');

const Push = {
  chavePublica: pushSaas.chavePublica,

  salvar(userId, sub) {
    if (!sub || !sub.endpoint) throw new Error('Assinatura inválida.');
    db.prepare(`INSERT INTO push_subs (endpoint, user_id, dados, criado_em) VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, dados = excluded.dados`)
      .run(sub.endpoint, userId, j.str(sub), nowISO());
  },

  remover(endpoint) { db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(String(endpoint || '')); },

  async _enviar(linhas, payload) {
    const subs = linhas.map((l) => j.parse(l.dados, null)).filter(Boolean);
    const mortos = await pushSaas.enviar(subs, payload);
    mortos.forEach((e) => Push.remover(e));
    return subs.length - mortos.length;
  },

  // payload = { title, body, url, tag? } — o SW do produto renderiza com o ícone da marca.
  async notificarUsuario(userId, payload) {
    return Push._enviar(db.prepare('SELECT dados FROM push_subs WHERE user_id = ?').all(userId), payload);
  },
};

module.exports = Push;
