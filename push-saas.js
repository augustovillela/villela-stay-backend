// =====================================================================
// Web Push dos produtos SaaS — helper compartilhado (VAPID por env, o mesmo
// par de chaves da Área do Hóspede/staff). Armazenamento fica em CADA módulo
// (tabela push_subs no SQLite do produto); aqui só o envio e a higiene.
// Padrão de uso no módulo:
//   const push = require('../push-saas');
//   const mortos = await push.enviar(subs, { title, body, url });
//   mortos.forEach((endpoint) => repo.removerPushSub(endpoint));
// =====================================================================
'use strict';

let _wp = null; // null = não resolvido; false = indisponível (sem VAPID)
function pronto() {
  if (_wp !== null) return _wp;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (_wp = false);
  try {
    const wp = require('web-push');
    wp.setVapidDetails('mailto:augusto.villela@gmail.com', pub, priv);
    _wp = wp;
  } catch (e) { console.warn('[push-saas] web-push indisponível:', e.message); _wp = false; }
  return _wp;
}

const chavePublica = () => process.env.VAPID_PUBLIC_KEY || '';

// subs = [{ endpoint, keys: {...} }] (objeto da PushSubscription, como veio do navegador).
// Devolve os endpoints MORTOS (404/410) para o módulo apagar da própria tabela.
async function enviar(subs, payload) {
  const wp = pronto();
  const mortos = [];
  if (!wp || !Array.isArray(subs) || !subs.length) return mortos;
  const corpo = JSON.stringify(payload || {});
  await Promise.all(subs.map(async (sub) => {
    try { await wp.sendNotification(sub, corpo); }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) mortos.push(sub.endpoint); }
  }));
  return mortos;
}

module.exports = { chavePublica, enviar, pronto };
