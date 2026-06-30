/* Service worker da Área do Hóspede (PWA). Fase A: instalável + shell em cache (network-first).
   NUNCA cacheia /hospede/api (dados sempre frescos). Offline da info da casa = Fase E. */
'use strict';
const CACHE = 'villela-hospede-v1';
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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // CDN/externos: rede direta
  if (url.pathname.startsWith('/hospede/api')) return;   // API: nunca cachear
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return resp;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/hospede/index.html')))
  );
});

/* Web Push entra na Fase B (VAPID): listeners 'push' e 'notificationclick' serão adicionados aqui. */
