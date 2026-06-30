/* Service worker da Área do Hóspede (PWA). Fase A: instalável + shell em cache (network-first).
   NUNCA cacheia /hospede/api (dados sempre frescos). Offline da info da casa = Fase E. */
'use strict';
const CACHE = 'villela-hospede-v3';
const SHELL = ['/hospede/', '/hospede/index.html', '/hospede/app.js', '/hospede/styles.css', '/hospede/manifest.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST/PATCH/DELETE: só rede
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // CDN/externos: rede direta
  const ehApi = url.pathname.startsWith('/hospede/api');
  // Network-first: online sempre fresco; offline serve a última leitura em cache.
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return resp;
      })
      .catch(() => caches.match(req).then((r) => {
        if (r) return r;
        if (ehApi) return new Response(JSON.stringify({ erro: 'Você está offline. Esta informação aparece depois de abrir o app online ao menos uma vez.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        return caches.match('/hospede/index.html');
      }))
  );
});

/* Web Push (Fase B): recebe a notificação e abre o app no clique. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text ? e.data.text() : '' }; }
  const titulo = d.title || 'Villela Stay';
  const opts = {
    body: d.body || '',
    icon: '/staff/logo.png',
    badge: '/staff/logo.png',
    data: { url: d.url || '/hospede/' },
    tag: d.tag || 'villela',
  };
  e.waitUntil(self.registration.showNotification(titulo, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const alvo = (e.notification.data && e.notification.data.url) || '/hospede/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
      for (const c of cls) { if (c.url.includes('/hospede') && 'focus' in c) { c.navigate(alvo); return c.focus(); } }
      if (self.clients.openWindow) return self.clients.openWindow(alvo);
    })
  );
});
