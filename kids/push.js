// =====================================================================
// Villela Kids — Web Push do app (PWA). SÓ PARA O RESPONSÁVEL — criança
// não recebe notificação (regra do PROMPT_MASTER §5). Assinaturas na
// tabela push_subs do banco do produto; envio pelo helper compartilhado
// ../push-saas.js (VAPID por env). Sempre best-effort: nunca bloqueia rota.
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
      .run(sub.endpoint, String(userId || ''), j.str(sub), nowISO());
  },

  remover(endpoint) { db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(String(endpoint || '')); },

  // payload = { title, body, url, tag? } — o SW do produto renderiza com o ícone da marca.
  async notificarUsuario(userId, payload) {
    const linhas = db.prepare('SELECT dados FROM push_subs WHERE user_id = ?').all(String(userId || ''));
    if (!linhas.length) return 0;
    const subs = linhas.map((l) => j.parse(l.dados, null)).filter(Boolean);
    const mortos = await pushSaas.enviar(subs, payload);
    mortos.forEach((e) => Push.remover(e));
    return subs.length - mortos.length;
  },
};

module.exports = Push;
