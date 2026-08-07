// =====================================================================
// PWA dos produtos SaaS do Grupo Villela Stay — app instalável no celular.
// Serve, por produto, o manifest (<base>/manifest.webmanifest) e o service
// worker (<base>/sw.js, escopo <base>/). As páginas de cada módulo apontam
// para eles no próprio HEAD (paginas.js). Mesmo padrão do app do hóspede
// (hospede/manifest.json + hospede/sw.js), aqui gerado por configuração.
// Livraria: manifest sem SW — as rotas dela vivem na raiz do site e um SW
// de escopo '/' interceptaria o staff e os demais produtos.
// =====================================================================
'use strict';

const PRODUTOS = [
  {
    slug: 'crm', base: '/crm', inicio: '/crm/app', escopo: '/crm/',
    nome: 'Villela CRM', curto: 'Villela CRM', marca: 'villela-crm',
    desc: 'CRM inteligente multicanal: funil, contatos, conversas e automações na palma da mão.',
  },
  {
    slug: 'vsm', base: '/gestao', inicio: '/gestao/app', escopo: '/gestao/',
    nome: 'Villela Stay Manager', curto: 'Stay Manager', marca: 'villela-stay-manager',
    desc: 'Gestão de hospedagem por temporada: reservas, limpezas, manutenção e financeiro.',
  },
  {
    slug: 'vpe', base: '/vpe', inicio: '/vpe/app', escopo: '/vpe/',
    nome: 'Villela Projects & Events', curto: 'V·Projects', marca: 'villela-projects',
    desc: 'Gestão de projetos e eventos: portfólio, tarefas, Kanban, comercial e financeiro.',
  },
  {
    slug: 'vdocs', base: '/vdocs', inicio: '/vdocs/app', escopo: '/vdocs/',
    nome: 'Villela Docs Intelligence', curto: 'Villela Docs', marca: 'villela-docs',
    desc: 'Gestão documental inteligente: busca, IA com fontes, workflows e compartilhamento.',
  },
  {
    slug: 'academy', base: '/academy', inicio: '/academy/app', escopo: '/academy/',
    nome: 'Villela Academy', curto: 'Academy', marca: 'villela-academy',
    desc: 'Cursos online e produtos digitais: estude, produza e acompanhe suas vendas.',
  },
  {
    slug: 'closet', base: '/closet', inicio: '/closet/app', escopo: '/closet/',
    nome: 'Closet Club', curto: 'Closet Club', marca: 'closet-club',
    desc: 'Alugue o look completo e transforme seu guarda-roupa parado em renda.',
    tema: '#111111', fundo: '#FFFFFF',
  },
  {
    slug: 'legal', base: '/juridico', inicio: '/juridico/app', escopo: '/juridico/',
    nome: 'Villela Legal', curto: 'Jurídico', marca: 'villela-legal',
    desc: 'Plataforma jurídica: processos, prazos, intimações e produção de peças com IA.',
  },
  {
    slug: 'livraria', base: '/livros', inicio: '/livros', escopo: '/',
    nome: 'Livraria Villela', curto: 'Livraria', marca: 'livraria-villela', semSW: true,
    desc: 'Livros digitais e impressos da Livraria Villela, com a sua biblioteca de compras.',
  },
  {
    slug: 'alta-vista', base: '/alta-vista', inicio: '/alta-vista/app', escopo: '/alta-vista/',
    nome: 'Villela Alta Vista 360', curto: 'Alta Vista 360', marca: 'villela-alta-vista',
    desc: 'Drone, vídeos com IA e experiências 360° para hospedagens e imóveis.',
    tema: '#071A2B', fundo: '#F7F6F2',
  },
  {
    slug: 'kids', base: '/kids', inicio: '/kids/app', escopo: '/kids/',
    nome: 'Villela Kids', curto: 'Villela Kids', marca: 'villela-kids',
    desc: 'Clube de missões onde crianças aprendem criando — com portfólio e painel dos pais.',
    tema: '#0F766E', fundo: '#FFF9F0',
  },
];

function manifestDe(p) {
  return {
    name: p.nome,
    short_name: p.curto,
    description: p.desc,
    id: p.inicio,
    start_url: p.inicio,
    scope: p.escopo,
    display: 'standalone',
    // padrão = identidade V-Portal do grupo; produtos com marca própria (Closet Club) sobrescrevem
    background_color: p.fundo || '#F8F9FA',
    theme_color: p.tema || '#1B2A4A',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['business', 'productivity'],
    icons: [
      { src: `/assets/brand/${p.marca}/favicon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/assets/brand/${p.marca}/icon-pwa.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/assets/brand/${p.marca}/icon-pwa.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

// Network-first: online é sempre fresco; offline serve a última cópia em cache.
// NUNCA cacheia caminhos de API (dados vivos) nem métodos de escrita.
function swDe(p) {
  return `'use strict';
const CACHE = 'villela-pwa-${p.slug}-v2';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.indexOf('villela-pwa-${p.slug}-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                          // escrita: só rede
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                // CDN/externos: rede direta
  if (url.pathname.indexOf('/api') !== -1) return;           // API: dados sempre frescos, sem cache
  // HTML de navegacao NUNCA e guardado: pagina em cache faz o app instalado
  // continuar exibindo o layout antigo depois de um deploy. O cache existe so
  // para o modo offline, e para isso basta a copia da tela inicial (abaixo).
  const ehNavegacao = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1;
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok && !ehNavegacao) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        if (resp && resp.ok && req.mode === 'navigate') {     // guarda so a tela inicial, p/ offline
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put('${p.inicio}', copia)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req).then((r) => {
        if (r) return r;
        if (req.mode === 'navigate') {
          return caches.match('${p.inicio}').then((s) => s || new Response('Você está offline. Abra o app com internet ao menos uma vez.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
        }
        return new Response('', { status: 503 });
      }))
  );
});

/* Web Push: recebe a notificação e abre o painel no clique (padrão do app do hóspede). */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '${p.nome}', {
    body: d.body || '',
    icon: '/assets/brand/${p.marca}/favicon-192.png',
    badge: '/assets/brand/${p.marca}/favicon-192.png',
    data: { url: d.url || '${p.inicio}' },
    tag: d.tag || 'villela-${p.slug}',
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const alvo = (e.notification.data && e.notification.data.url) || '${p.inicio}';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
      for (const c of cls) { if (c.url.indexOf('${p.base}') !== -1 && 'focus' in c) { c.navigate(alvo); return c.focus(); } }
      if (self.clients.openWindow) return self.clients.openWindow(alvo);
    })
  );
});
`;
}

// Tags para o HEAD das páginas do produto (manifest + registro do SW).
// Exportado para referência; cada paginas.js inclui as tags inline no HEAD da marca.
function tagsPwa(p) {
  const manifest = `<link rel="manifest" href="${p.base}/manifest.webmanifest">`;
  if (p.semSW) return manifest;
  return manifest + `<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('${p.base}/sw.js').catch(function(){})})}</script>`;
}

function montar(app) {
  for (const p of PRODUTOS) {
    app.get(`${p.base}/manifest.webmanifest`, (req, res) => {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(JSON.stringify(manifestDe(p)));
    });
    if (!p.semSW) {
      app.get(`${p.base}/sw.js`, (req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache'); // navegador revalida o SW a cada visita
        res.send(swDe(p));
      });
    }
  }
}

module.exports = { montar, PRODUTOS, manifestDe, swDe, tagsPwa };
