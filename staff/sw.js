'use strict';
// Service worker do Portal Staff — só existe para tornar o portal INSTALÁVEL como app (PWA).
// Estratégia: rede sempre (network-only), NENHUM cache — o portal é um painel vivo e uma
// versão cacheada causaria dados velhos. Se um dia quisermos offline, trocar aqui.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* passthrough: deixa a rede responder */ });
