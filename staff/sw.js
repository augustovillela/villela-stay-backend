'use strict';
// Service worker do Portal Staff — instalabilidade (PWA) + notificações push da equipe.
// SEM cache (network-only): o portal é um painel vivo; uma versão cacheada mostraria dados velhos.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* passthrough: deixa a rede responder */ });

// Push: mostra a notificação enviada pelo backend (enviarPushStaff).
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) {}
  const titulo = d.title || 'Villela Stay — Staff';
  event.waitUntil(self.registration.showNotification(titulo, {
    body: d.body || '',
    icon: '/staff/logo-192.png',
    badge: '/staff/logo-192.png',
    data: { url: d.url || '/staff/' },
  }));
});

// Clique na notificação: foca uma aba aberta do portal ou abre uma nova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/staff/';
  event.waitUntil((async () => {
    const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clientes) { if (c.url.includes('/staff') && 'focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
