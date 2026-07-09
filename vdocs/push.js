// =====================================================================
// Villela Docs Intelligence — Web Push do painel (PWA). Assinaturas na
// tabela push_subs do banco do produto; envio pelo helper compartilhado
// ../push-saas.js (VAPID por env). Envio é sempre best-effort: nunca
// bloqueia a rota nem o fluxo de aprovação.
// =====================================================================
'use strict';
const { db, nowISO, j } = require('./db');
const pushSaas = require('../push-saas');

const Push = {
  chavePublica: pushSaas.chavePublica,

  salvar(tenantId, userId, sub) {
    if (!sub || !sub.endpoint) throw new Error('Assinatura inválida.');
    db.prepare(`INSERT INTO push_subs (endpoint, tenant_id, user_id, dados, criado_em) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET tenant_id = excluded.tenant_id, user_id = excluded.user_id, dados = excluded.dados`)
      .run(String(sub.endpoint), String(tenantId), String(userId), j.str(sub), nowISO());
  },

  remover(endpoint) { db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(String(endpoint || '')); },

  async _enviar(linhas, payload) {
    const subs = linhas.map((l) => j.parse(l.dados, null)).filter(Boolean);
    const mortos = await pushSaas.enviar(subs, payload);
    mortos.forEach((e) => Push.remover(e));
    return subs.length - mortos.length;
  },

  // payload = { title, body, url, tag? } — o SW do produto renderiza com o ícone da marca.
  async notificarTenant(tenantId, payload) {
    return Push._enviar(db.prepare('SELECT dados FROM push_subs WHERE tenant_id = ?').all(String(tenantId)), payload);
  },

  async notificarUsuario(userId, payload) {
    return Push._enviar(db.prepare('SELECT dados FROM push_subs WHERE user_id = ?').all(String(userId)), payload);
  },
};

module.exports = Push;
