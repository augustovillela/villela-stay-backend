// =====================================================================
// Gerador estático do site Villela Stay
// Lê data/listings.json (exportado da API Stays) e gera o site em dist/
// Rodar: node build.js
// =====================================================================
const fs = require('fs');
const path = require('path');

const BACKEND = 'https://villela-stay-backend.onrender.com';
const WHATSAPP = '556191935013';
// Motor de reservas da Stays. Cada página de propriedade reserva/paga SÓ a própria propriedade
// via /pt/apartment/<CÓDIGO> (testado: o código sozinho já resolve; aceita ?from=&to=&persons=).
const STAYS_SITE = 'https://ville.stays.com.br';
// Domínio oficial (DNS virado em 29/06/2026). Afeta canonical, hreflang, og:url e sitemap.
const SITE_URL = 'https://villelastay.com.br';

// ----------------------------------------------------------------- PWA
// Cores da marca usadas no manifest, theme-color e ícones (coerentes com os cartões).
const PWA = {
  themeColor: '#5a3e2b',       // marrom da marca (barra do app)
  backgroundColor: '#fbf6ee',  // creme claro (splash screen)
  cacheVersion: 'vstay-v5'     // bump para invalidar o cache do Service Worker
};
const listings = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'listings.json'), 'utf8').replace(/^﻿/, ''));
const BLOG = require('./content/blog'); // escopo de módulo (usado no corpo e no sitemap, fora do loop de idiomas)
const BLOG_I18N = require('./content/blog-i18n'); // traduções EN/ES por slug (fallback por campo p/ PT)
let LANDINGS;                            // preenchido no corpo; escopo de módulo p/ o sitemap usar após o loop

const DIST = path.join(__dirname, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'hospedagem'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'src', 'style.css'), path.join(DIST, 'style.css'));

// Logo: se src/logo.png existir, usa a imagem; senão, marca em texto
const TEM_LOGO = fs.existsSync(path.join(__dirname, 'src', 'logo.png'));
if (TEM_LOGO) fs.copyFileSync(path.join(__dirname, 'src', 'logo.png'), path.join(DIST, 'logo.png'));
// Imagem social da home (1200x630 para WhatsApp/redes)
if (fs.existsSync(path.join(__dirname, 'src', 'og-home.jpg'))) fs.copyFileSync(path.join(__dirname, 'src', 'og-home.jpg'), path.join(DIST, 'og-home.jpg'));
const MARCA = TEM_LOGO
  ? `<a class="marca" href="/"><img class="logo" src="/logo.png" width="128" height="128" alt="Villela Stay — Hospedagens Inteligentes" fetchpriority="high"></a>`
  : `<a class="marca" href="/">Villela <span>Stay</span></a>`;
// Função (não const string) para traduzir por idioma — é avaliada dentro do loop, quando t() já existe.
const TAGLINE = () => `<span class="tagline">${t('Hospedagens Inteligentes<br>para Experiências Inesquecíveis.', 'Smart Stays<br>for Unforgettable Experiences.', 'Alojamientos Inteligentes<br>para Experiencias Inolvidables.')}</span>`;

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const real = n => 'R$ ' + n.toLocaleString('pt-BR');

// ----------------------------------------------------------------- imagens responsivas
// O host das imagens (ville.stays.com.br/image/<id>) aceita redimensionamento e webp no
// servidor: `?width=N` e `?format=webp` (testado 16/06/2026 — width=400&format=webp gera ~22 KB
// contra ~140 KB do original). Por isso NÃO baixamos/convertimos imagem em build-time (sem sharp,
// sem dist/assets/img): geramos srcset apontando para o CDN, que entrega webp já redimensionado.
// Vantagens: build idempotente e trivial, fotos sempre atualizadas com o anúncio, zero manutenção.
const IMG_HOST = 'ville.stays.com.br';
// Larguras geradas no srcset (px). Cobrem thumbnails de card e capas full-width em mobile/desktop/retina.
const IMG_LARGURAS = [400, 600, 800, 1200, 1600];

// Acrescenta width+format=webp à URL do CDN da Stays. URLs de origem própria (turismo, plantas)
// não são tocadas. Idempotente e à prova de URL inesperada (try/catch → devolve a original).
function cdnUrl(url, largura) {
  try {
    const u = new URL(url);
    if (u.hostname !== IMG_HOST) return url; // só o CDN da Stays aceita esses parâmetros
    u.searchParams.set('width', String(largura));
    u.searchParams.set('format', 'webp');
    return u.toString();
  } catch (e) { return url; }
}

// Lê as dimensões intrínsecas de um JPEG/PNG local (sem dependências) para emitir width/height
// corretos em imagens locais de razão variável (ex.: plantas) e manter o CLS baixo. Devolve null
// se não conseguir (o chamador então omite os atributos — fallback seguro).
function dimensoesArquivo(file) {
  try {
    const b = fs.readFileSync(file);
    if (b[0] === 0x89 && b[1] === 0x50) { // PNG
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    if (b[0] === 0xFF && b[1] === 0xD8) { // JPEG
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xFF) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        }
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch (e) {}
  return null;
}

// Monta uma <img> responsiva. Para imagens do CDN da Stays gera srcset (webp redimensionado) + sizes.
// Para imagens locais (turismo/plantas) gera <img> simples com width/height. SEMPRE inclui
// width/height (reserva de espaço → CLS baixo) e decoding="async".
//   opts: { width, height, sizes, alt, classe, lazy=true, prioridade=false, title }
function img(url, opts = {}) {
  const { width, height, sizes = '100vw', alt = '', classe = '', lazy = true, prioridade = false, title } = opts;
  let host = '';
  try { host = new URL(url).hostname; } catch (e) {}
  const cdn = host === IMG_HOST;
  const src = cdn ? cdnUrl(url, 1200) : url;
  const srcset = cdn
    ? ` srcset="${IMG_LARGURAS.map(w => `${cdnUrl(url, w)} ${w}w`).join(', ')}" sizes="${sizes}"`
    : '';
  const dim = (width ? ` width="${width}"` : '') + (height ? ` height="${height}"` : '');
  // Imagem do LCP: fetchpriority high, eager, decode async. Demais: lazy + decode async.
  const carga = prioridade ? ' fetchpriority="high" decoding="async"' : (lazy ? ' loading="lazy" decoding="async"' : ' decoding="async"');
  const cls = classe ? ` class="${classe}"` : '';
  const ttl = title ? ` title="${esc(title)}"` : '';
  return `<img${cls} src="${src}"${srcset}${dim} alt="${esc(alt)}"${ttl}${carga}>`;
}

// ----------------------------------------------------------------- SEO
// Dados reais da marca (NAP — Nome/Endereço/Telefone consistentes com o Google Business).
// Coordenadas aproximadas do bairro Lago Sul (não há lat/lng por unidade em listings.json).
const NAP = {
  nome: 'Villela Stay',
  legal: 'Augusto Villela Ltda',
  telefone: '+5561991935013',
  telefoneExibicao: '(61) 99193-5013',
  email: 'villelastay@gmail.com',
  rua: 'SMDB Conjunto 29, Lago Sul',
  cidade: 'Brasília',
  uf: 'DF',
  pais: 'BR',
  geo: { lat: -15.8528, lng: -47.8657 }, // Lago Sul, Brasília-DF (aproximado, nível bairro)
  sameAs: ['https://instagram.com/villelastay', 'https://instagram.com/augustovillela', 'https://facebook.com/augusto.villela']
};

// Organization da marca — repetida em todas as páginas como âncora de identidade (@id).
const ORG_ID = `${SITE_URL}/#organizacao`;
const orgSchema = {
  '@context': 'https://schema.org', '@type': 'Organization', '@id': ORG_ID,
  name: NAP.nome, legalName: NAP.legal, url: SITE_URL, logo: `${SITE_URL}/logo.png`,
  image: `${SITE_URL}/og-home.jpg`, telephone: NAP.telefone, email: NAP.email,
  address: { '@type': 'PostalAddress', streetAddress: NAP.rua, addressLocality: NAP.cidade, addressRegion: NAP.uf, addressCountry: NAP.pais },
  areaServed: 'Brasília-DF', sameAs: NAP.sameAs
};

// Seções da home na ordem definida pelo Augusto (11/06/2026)
const SECOES = [
  { titulo: 'Reserve O Espaço Inteiro de Uma Casa Bem Equipada', tituloEn: 'Book the Entire Space of a Well-Equipped House', tituloEs: 'Reserva el Espacio Entero de una Casa Bien Equipada', ids: ['GI01I', 'GD01H', 'GG04I', 'PL02I', 'GD03H', 'YV01I'] },
  { titulo: 'Reserve um Flat para até 6 pessoas com cozinha completa e área externa compartilhadas', tituloEn: 'Book a Flat for up to 6 people with a shared full kitchen and outdoor area', tituloEs: 'Reserva un Flat para hasta 6 personas con cocina completa y zona exterior compartidas', ids: ['VH01H', 'VH02H', 'UD03H', 'UF08H', 'UF01H', 'UF07H'] },
  { titulo: 'Reserve Uma Suíte Privativa na Casa Modernista com sala e cozinha compartilhadas', tituloEn: 'Book a Private Suite at Casa Modernista with shared living room and kitchen', tituloEs: 'Reserva una Suite Privada en Casa Modernista con sala y cocina compartidas', ids: ['UH01H', 'UH06H', 'UH04H', 'UH05H', 'UH03H'] },
  { titulo: 'Reserve Uma Suíte Privativa na Gran Villela Home Stay com sala e cozinha compartilhadas', tituloEn: 'Book a Private Suite at Gran Villela Home Stay with shared living room and kitchen', tituloEs: 'Reserva una Suite Privada en Gran Villela Home Stay con sala y cocina compartidas', ids: ['UF06H', 'UF05H', 'UD09H'] }
];
const porId = Object.fromEntries(listings.map(l => [l.id, l]));

const waLink = txt => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(txt)}`;

// ----------------------------------------------------------------- i18n (PT/EN/ES)
// O site é gerado 3x (um loop por idioma). LANG controla as escolhas de texto/links/saída.
// Conteúdo ainda não traduzido cai em PT (fallback), então nada quebra durante a tradução incremental.
const IDIOMAS = ['pt', 'en', 'es'];
let LANG = 'pt';
const HTML_LANG = { pt: 'pt-BR', en: 'en', es: 'es' };
const NOME_IDIOMA = { pt: 'Português BR', en: 'English', es: 'Español' };
// t(pt, en, es): string do idioma corrente (fallback para pt quando faltar tradução).
const t = (pt, en, es) => LANG === 'en' ? (en == null ? pt : en) : (LANG === 'es' ? (es == null ? pt : es) : pt);
// L(path): prefixa caminho absoluto do site com o idioma corrente (/en, /es). PT sem prefixo.
const L = p => (LANG === 'pt' || typeof p !== 'string' || !p.startsWith('/')) ? p : (p === '/' ? `/${LANG}/` : `/${LANG}${p}`);
// Diretório de saída do idioma corrente.
const outDir = () => LANG === 'pt' ? DIST : path.join(DIST, LANG);
// hreflang para a versão de cada idioma de um caminho (informado SEMPRE como o caminho PT).
function hreflangTags(caminhoPt) {
  const abs = (lang, p) => `${SITE_URL}${lang === 'pt' ? '' : '/' + lang}${p}`;
  return IDIOMAS.map(l => `<link rel="alternate" hreflang="${HTML_LANG[l]}" href="${abs(l, caminhoPt)}">`).join('') +
    `<link rel="alternate" hreflang="x-default" href="${abs('pt', caminhoPt)}">`;
}
// Seletor 🌐 do cabeçalho: aponta para o MESMO caminho em cada idioma (PT sem prefixo, EN /en, ES /es).
function seletorIdioma(caminhoPt) {
  const itens = IDIOMAS.map(l => {
    const href = (l === 'pt' ? '' : '/' + l) + caminhoPt;
    return `<a role="menuitem" hreflang="${HTML_LANG[l]}" href="${href}"${l === LANG ? ' aria-current="true"' : ''}>${NOME_IDIOMA[l]}</a>`;
  }).join('');
  return `<div class="lang-switch"><button type="button" class="lang-btn" aria-haspopup="true" aria-expanded="false">🌐 <span>${NOME_IDIOMA[LANG]}</span> ▾</button><div class="lang-menu" role="menu">${itens}</div></div>`;
}

// Título de imóvel: mantém os nomes temáticos (Niemeyer, Cassia Eller…) e traduz só os termos genéricos.
const TITULO_MAP = {
  en: [[/Suíte/g, 'Suite'], [/com piscina no Lago Sul/g, 'with pool in Lago Sul'], [/Espaço Inteiro/g, 'Whole Space'], [/Casa Inteira/g, 'Entire Home'], [/(\d+) pessoas/g, '$1 people'], [/no Lago Sul/g, 'in Lago Sul'], [/na Villela Home Stay/g, 'at Villela Home Stay'], [/na Villela Stay/g, 'at Villela Stay']],
  es: [[/Suíte/g, 'Suite'], [/com piscina no Lago Sul/g, 'con piscina en Lago Sul'], [/Espaço Inteiro/g, 'Espacio Entero'], [/Casa Inteira/g, 'Casa Entera'], [/(\d+) pessoas/g, '$1 personas'], [/no Lago Sul/g, 'en Lago Sul'], [/na Villela Home Stay/g, 'en Villela Home Stay'], [/na Villela Stay/g, 'en Villela Stay']]
};
function tituloImovel(l) { if (LANG === 'pt') return l.titulo; let s = l.titulo; for (const [re, rep] of TITULO_MAP[LANG]) s = s.replace(re, rep); return s; }
// Resumo e descrição traduzidos por id (Fase 3 parte B). Fallback para o PT do listings.json.
const RESUMO_IMOVEL = require('./content/imoveis-i18n').resumos;
const DESC_IMOVEL = require('./content/imoveis-i18n').descricoes;
function resumoImovel(l) { const m = RESUMO_IMOVEL[l.id]; return (LANG !== 'pt' && m && m[LANG]) ? m[LANG] : l.resumo; }
function descricaoImovel(l) { const m = DESC_IMOVEL[l.id]; return (LANG !== 'pt' && m && m[LANG]) ? m[LANG] : l.descricao; }

function layout(titulo, descricao, corpo, opts = {}) {
  const { extraHead = '', caminho = '/', ogImage = `${SITE_URL}/logo.png`, ogType = 'website', lang = HTML_LANG[LANG] } = opts;
  const ogLocale = lang === 'en' ? 'en_US' : (lang === 'es' ? 'es_ES' : 'pt_BR');
  const urlAtual = `${SITE_URL}${LANG === 'pt' ? '' : '/' + LANG}${caminho}`;
  // Organization injetada em toda página (âncora de identidade @id reutilizada nos schemas locais)
  const orgLd = `<script type="application/ld+json">${JSON.stringify(orgSchema)}</script>`;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="preconnect" href="https://ville.stays.com.br" crossorigin>
<link rel="dns-prefetch" href="https://ville.stays.com.br">
<link rel="preconnect" href="https://villela-stay-backend.onrender.com">
<link rel="dns-prefetch" href="https://villela-stay-backend.onrender.com">
<meta name="google-site-verification" content="_Gjh1tlFyUsmEnwd14JOLmSDNQ7u3UKAivi4bkIzz0I">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-5L2YQ2BPQW"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-5L2YQ2BPQW');
</script>
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${urlAtual}">
${hreflangTags(caminho)}
${TEM_LOGO ? '<link rel="icon" type="image/png" href="/logo.png">' : ''}
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="${PWA.themeColor}">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon-180.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/apple-touch-icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Villela Stay">
<meta name="application-name" content="Villela Stay">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Villela Stay">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${urlAtual}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:alt" content="${esc(titulo)}">
<meta property="og:locale" content="${ogLocale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descricao)}">
<meta name="twitter:image" content="${esc(ogImage)}">
${orgLd}
${extraHead}
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="topo">
  <div class="marca-bloco">${MARCA.replace('href="/"', `href="${L('/')}"`)}${TAGLINE()}</div>
  <nav>
    <a href="${L('/')}#hospedagens">${t('Hospedagens', 'Stays', 'Alojamientos')}</a>
    <a href="${L('/eventos.html')}">${t('Eventos', 'Events', 'Eventos')}</a>
    <a href="${L('/pacotes.html')}">${t('Pacotes Especiais', 'Special Packages', 'Paquetes Especiales')}</a>
    <a href="${L('/blog.html')}">Blog</a>
    <a href="${L('/regras.html')}">${t('Regras da Casa', 'House Rules', 'Normas de la Casa')}</a>
    <a href="${L('/faq.html')}">FAQ</a>
    <a href="${L('/guia.html')}">${t('Guia do Hóspede', 'Guest Guide', 'Guía del Huésped')}</a>
    <a href="${L('/nossa-historia.html')}">${t('Nossa História', 'Our Story', 'Nuestra Historia')}</a>
    <a href="${L('/links.html')}">Linktree</a>
    ${seletorIdioma(caminho)}
    <a href="${waLink(t('Olá! Vim pelo site da Villela Stay.', 'Hi! I came from the Villela Stay website.', '¡Hola! Vengo del sitio de Villela Stay.'))}" class="btn-wa-nav">WhatsApp</a>
    <a href="https://minha.villelastay.com.br/hospede" class="link-hospede" title="${t('Área exclusiva para hóspedes', 'Exclusive guest area', 'Área exclusiva para huéspedes')}">🔑 ${t('Área do Hóspede', 'Guest Area', 'Área del Huésped')}</a>
    <a href="${BACKEND}/staff" class="link-staff" title="${t('Área restrita da equipe', 'Staff area', 'Área del equipo')}">🔒 Staff</a>
    <button type="button" id="btn-instalar-pwa" class="btn-instalar" hidden aria-label="${t('Instalar o app da Villela Stay', 'Install the Villela Stay app', 'Instalar la app de Villela Stay')}">${t('📲 Instalar app', '📲 Install app', '📲 Instalar app')}</button>
  </nav>
</header>
<main id="conteudo">
${corpo}
</main>
<footer class="rodape">
  <div class="rodape-links">
    <strong>${t('Conheça', 'Discover', 'Conoce')}</strong>
    <a href="${L('/blog.html')}">${t('Blog · Diário de Brasília', 'Blog · Brasília Diary', 'Blog · Diario de Brasília')}</a>
    <a href="${L('/nossa-historia.html')}">${t('Nossa História', 'Our Story', 'Nuestra Historia')}</a>
    <a href="${L('/posse-2027.html')}">${t('Posse Presidencial 2027', 'Presidential Inauguration 2027', 'Toma de Posesión Presidencial 2027')}</a>
  </div>
  <div>
    <strong>Villela Stay</strong> — ${t('Hospedagem por temporada no Lago Sul, Brasília-DF', 'Vacation rentals in Lago Sul, Brasília, Brazil', 'Alquiler por temporada en Lago Sul, Brasília-DF')}<br>
    SMDB Conjunto 29, Lago Sul, Brasília-DF
    <p class="rodape-distancias">
      ${t('Casa Modernista: 10 minutos do Aeroporto', 'Casa Modernista: 10 minutes from the Airport', 'Casa Modernista: 10 minutos del Aeropuerto')}<br>
      ${t('Gran Villela Home Stay: 15 minutos da Esplanada', 'Gran Villela Home Stay: 15 minutes from the Esplanada', 'Gran Villela Home Stay: 15 minutos de la Explanada')}
    </p>
  </div>
  <div class="rodape-links rodape-compacto">
    <strong>${t('Navegue', 'Browse', 'Navega')}</strong>
    <a href="${L('/faq.html')}">${t('Perguntas Frequentes (FAQ)', 'FAQ — Frequently Asked Questions', 'Preguntas Frecuentes (FAQ)')}</a>
    <a href="${L('/links.html')}">Linktree</a>
    <a href="${L('/pre-checkin.html')}">${t('Check-in on-line', 'Online check-in', 'Check-in en línea')}</a>
    <a href="${L('/guia.html')}">${t('Guia do Hóspede', 'Guest Guide', 'Guía del Huésped')}</a>
    <a href="${L('/formaturas.html')}">${t('Formaturas', 'Graduations', 'Graduaciones')}</a>
    <a href="${L('/casamentos.html')}">${t('Casamentos', 'Weddings', 'Bodas')}</a>
    <a href="${L('/festas-infantis.html')}">${t('Festas Infantis', "Kids' Parties", 'Fiestas Infantiles')}</a>
    <a href="${L('/empresas.html')}">${t('Empresas &amp; Embaixadas', 'Companies &amp; Embassies', 'Empresas y Embajadas')}</a>
  </div>
  <div>
    <p class="rodape-contatos">
      <a href="https://mail.google.com/mail/?view=cm&amp;to=villelastay@gmail.com" target="_blank" rel="noopener">✉️ villelastay@gmail.com</a><br>
      <a href="tel:+5561991935013">📞 (61) 99193-5013</a><br>
      <a href="https://instagram.com/villelastay" target="_blank" rel="noopener">📷 @villelastay</a><br>
      <a href="https://instagram.com/augustovillela" target="_blank" rel="noopener">📷 @augustovillela</a><br>
      <a href="https://facebook.com/augusto.villela" target="_blank" rel="noopener">📘 augusto.villela</a>
    </p>
  </div>
  <div class="creditos">${t('Fotos dos pontos turísticos', 'Landmark photos', 'Fotos de los puntos turísticos')}: krishna naudin, Cayambe, Matheusgf, Portal da Copa, Marinelson Almeida ${t('e', 'and', 'y')} Rose Ramalho, via Wikimedia Commons (${t('licenças', 'licenses', 'licencias')} CC BY / CC BY-SA).</div>
</footer>
<a class="wa-flutuante" href="${waLink(t('Olá! Vim pelo site da Villela Stay.', 'Hi! I came from the Villela Stay website.', '¡Hola! Vengo del sitio de Villela Stay.'))}" aria-label="${t('Falar no WhatsApp', 'Chat on WhatsApp', 'Hablar por WhatsApp')}">💬</a>
<script>window.addEventListener('load', function(){ try { fetch('${BACKEND}/api/hit?p=' + encodeURIComponent(location.pathname) + '&r=' + encodeURIComponent(document.referrer), { keepalive: true }); } catch (e) {} });</script>
<script>
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('a[href*="wa.me"]');
  if (a && typeof gtag === 'function') gtag('event', 'clique_whatsapp', { pagina: location.pathname });
});
document.addEventListener('submit', function(e){
  if (typeof gtag === 'function') gtag('event', 'envio_formulario', { formulario: e.target.id || e.target.className || 'form', pagina: location.pathname });
}, true);
</script>
<script>
// ---- PWA: registro do Service Worker + prompt de instalação ----
(function(){
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function(){});
    });
  }
  var deferido = null;
  var botao = document.getElementById('btn-instalar-pwa');
  var instalado = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();          // esconde o mini-infobar nativo
    deferido = e;
    if (botao && !instalado) botao.hidden = false;
  });
  if (botao) botao.addEventListener('click', function(){
    if (!deferido) return;
    deferido.prompt();
    deferido.userChoice.then(function(escolha){
      if (typeof gtag === 'function') gtag('event', 'instalar_pwa', { resultado: escolha && escolha.outcome });
      deferido = null;
      botao.hidden = true;
    });
  });
  window.addEventListener('appinstalled', function(){
    if (botao) botao.hidden = true;
    if (typeof gtag === 'function') gtag('event', 'pwa_instalado', {});
  });
})();
</script>
</body>
</html>`;
}

// ===================== GERAÇÃO POR IDIOMA (PT / EN / ES) =====================
// Tudo daqui até o fim do links.html é gerado 1x por idioma. PT vai para dist/,
// EN para dist/en/, ES para dist/es/. Conteúdo sem tradução cai em PT (fallback).
for (const __L of IDIOMAS) {
  LANG = __L;
  const od = outDir();
  fs.mkdirSync(path.join(od, 'hospedagem'), { recursive: true });
  fs.mkdirSync(path.join(od, 'blog'), { recursive: true });

// ---------------------------------------------------------------- home
const card = l => `
<div class="card">
  <a class="card-link" href="${L(`/hospedagem/${l.id}.html`)}">
    ${img(l.fotoPrincipal, { alt: l.titulo, width: 400, height: 210, sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px' })}
    <div class="card-info">
      <h3>${esc(tituloImovel(l))}</h3>
      <p>${t(`${l.hospedes} hóspedes · ${l.quartos} quarto${l.quartos > 1 ? 's' : ''} · ${l.banheiros} banheiro${l.banheiros > 1 ? 's' : ''}${l.m2 ? ` · ${l.m2} m²` : ''}`, `${l.hospedes} guests · ${l.quartos} room${l.quartos > 1 ? 's' : ''} · ${l.banheiros} bathroom${l.banheiros > 1 ? 's' : ''}${l.m2 ? ` · ${l.m2} m²` : ''}`, `${l.hospedes} huéspedes · ${l.quartos} ${l.quartos > 1 ? 'habitaciones' : 'habitación'} · ${l.banheiros} ${l.banheiros > 1 ? 'baños' : 'baño'}${l.m2 ? ` · ${l.m2} m²` : ''}`)}</p>
    </div>
  </a>
  <a class="btn btn-reservar btn-card" href="${STAYS_SITE}/pt/apartment/${l.id}" target="_blank" rel="noopener" aria-label="${t('Reservar e pagar', 'Book and pay', 'Reservar y pagar')} ${esc(tituloImovel(l))}">${t('Reservar e pagar', 'Book and pay', 'Reservar y pagar')} →</a>
</div>`;

const cards = SECOES.map(sec => {
  const itens = sec.ids.map(id => porId[id]).filter(Boolean);
  const tit = LANG === 'en' ? sec.tituloEn : (LANG === 'es' ? sec.tituloEs : sec.titulo);
  return `<h2 class="secao-titulo">${esc(tit)}</h2>\n<div class="grade">${itens.map(card).join('\n')}</div>`;
}).join('\n');

// Fotos do slideshow do hero: capas das casas inteiras intercaladas com pontos turísticos
const TURISMO = ['ponte-jk', 'congresso', 'torre-tv', 'torre-digital', 'aeroporto', 'lago-paranoa', 'pontao'];
fs.mkdirSync(path.join(DIST, 'turismo'), { recursive: true });
for (const t of TURISMO) fs.copyFileSync(path.join(__dirname, 'src', 'turismo', `${t}.jpg`), path.join(DIST, 'turismo', `${t}.jpg`));

const casasFotos = SECOES[0].ids.map(id => porId[id]).filter(Boolean).map(l => l.fotoPrincipal);
const heroFotos = [];
for (let i = 0; i < Math.max(casasFotos.length, TURISMO.length); i++) {
  if (casasFotos[i]) heroFotos.push(casasFotos[i]);
  if (TURISMO[i]) heroFotos.push(`/turismo/${TURISMO[i]}.jpg`);
}

// Depoimentos 5 estrelas (colhidos do site atual; edite data/depoimentos.json para incluir novos)
const depoimentos = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'depoimentos.json'), 'utf8').replace(/^﻿/, ''));
// Depoimento traduzido por idioma (fallback PT) + selo discreto de tradução em EN/ES.
const depTexto = d => (LANG === 'en' && d.texto_en) ? d.texto_en : ((LANG === 'es' && d.texto_es) ? d.texto_es : d.texto);
const depSelo = () => LANG === 'pt' ? '' : ` · <span class="dep-traduzido">${t('', 'translated from Portuguese', 'traducido del portugués')}</span>`;

const home = layout(
  t('Villela Stay — Casas, flats e suítes no Lago Sul, Brasília', 'Villela Stay — Houses, flats and suites in Lago Sul, Brasília', 'Villela Stay — Casas, flats y suites en Lago Sul, Brasília'),
  t('Hospedagem por temporada no Lago Sul: casas com piscina aquecida para até 32 pessoas, flats e suítes. Reserva direta com o anfitrião.', 'Vacation rentals in Lago Sul: houses with heated pools for up to 32 people, flats and suites. Book directly with the host.', 'Alquiler por temporada en Lago Sul: casas con piscina climatizada para hasta 32 personas, flats y suites. Reserva directa con el anfitrión.'),
  `
<section class="hero hero-slideshow">
  <div class="hero-bg" aria-hidden="true">
    ${heroFotos.map((u, i) => img(u, {
      alt: '', sizes: '100vw', width: 1600, height: 900,
      classe: i === 0 ? 'ativa' : '',
      prioridade: i === 0,   // 1ª imagem = LCP: fetchpriority high, sem lazy
      lazy: i !== 0
    })).join('\n    ')}
  </div>
  <div class="hero-conteudo">
    <h1>${t('Seu Porto Seguro no Lago Sul em Brasília', 'Your Safe Haven in Lago Sul, Brasília', 'Tu Refugio Seguro en Lago Sul, Brasília')}</h1>
    <p><strong>${t('Casas muito bem localizadas, confortáveis, bem equipadas, com cozinha completa e piscina aquecida.<br>Excelentes tanto para casais quanto para grupos de 60 pessoas.<br>Reserve diretamente com o anfitrião para um atendimento personalizado.', 'Beautifully located, comfortable, well-equipped houses with a full kitchen and a heated pool.<br>Great for couples and for groups of up to 60.<br>Book directly with the host for personalised service.', 'Casas muy bien ubicadas, cómodas y equipadas, con cocina completa y piscina climatizada.<br>Ideales tanto para parejas como para grupos de hasta 60 personas.<br>Reserva directamente con el anfitrión para una atención personalizada.')}</strong></p>
    <div class="hero-cta">
      <a class="btn" href="#hospedagens">${t('Ver hospedagens', 'See stays', 'Ver alojamientos')}</a>
      <a class="btn btn-claro" href="${L('/eventos.html')}">${t('Eventos', 'Events', 'Eventos')}</a>
    </div>
  </div>
</section>
<script>
// Slideshow do hero: só inicia após o load (não disputa o thread no carregamento → TBT menor).
// Respeita prefers-reduced-motion. A 1ª imagem já está visível via CSS (.ativa), então sem JS o
// hero ainda funciona (só não roda a troca).
window.addEventListener('load', function(){
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var imgs = document.querySelectorAll('.hero-bg img');
  if (imgs.length < 2) return;
  var i = 0;
  setInterval(function(){
    imgs[i].classList.remove('ativa');
    i = (i + 1) % imgs.length;
    imgs[i].classList.add('ativa');
  }, 5000);
});
</script>
<a class="banner-posse" href="${L('/posse-2027.html')}">🇧🇷 ${t('<strong>Posse Presidencial 2027 + Réveillon:</strong> casas completas no Lago Sul a 10 min da Esplanada — reserve antes que esgotem', '<strong>Presidential Inauguration 2027 + New Year:</strong> whole houses in Lago Sul, 10 min from the Esplanada — book before they sell out', '<strong>Toma de Posesión 2027 + Fin de Año:</strong> casas enteras en Lago Sul a 10 min de la Explanada — reserva antes de que se agoten')} <span>${t('Saiba mais', 'Learn more', 'Saber más')} →</span></a>
<section class="faixa-confianca">
  <div>🏆 ${t('Superhost: anfitrião premiado', 'Superhost: award-winning host', 'Superhost: anfitrión premiado')}</div><div>🏅 ${t('Favorito dos Hóspedes: propriedades premiadas', 'Guest Favourite: award-winning properties', 'Favorito de los Huéspedes: propiedades premiadas')}</div><div>📍 ${t('10 min do Aeroporto JK e da Esplanada', '10 min from JK Airport and the Esplanada', '10 min del Aeropuerto JK y de la Explanada')}</div><div>👨‍👩‍👧‍👦 ${t('Hospedagens de grupos de até 60 pessoas', 'Stays for groups of up to 60', 'Alojamientos para grupos de hasta 60 personas')}</div><div>🎉 ${t('Eventos para até 150 pessoas', 'Events for up to 150 people', 'Eventos para hasta 150 personas')}</div>
</section>
<section class="depoimentos-wrap">
  <h2 class="secao-titulo">${t('O Que Dizem Nossos Hóspedes', 'What Our Guests Say', 'Lo Que Dicen Nuestros Huéspedes')}</h2>
  <div class="marquee">
    <div class="marquee-track">${[...depoimentos, ...depoimentos].map(d => `
      <figure class="depoimento">
        <div class="estrelas" aria-label="${t('5 estrelas', '5 stars', '5 estrellas')}">★★★★★</div>
        <blockquote>“${esc(depTexto(d))}”</blockquote>
        <figcaption><strong>${esc(d.nome)}</strong> · ${esc(d.hospedagem)} · <span class="origem">${t('avaliação no', 'review on', 'reseña en')} ${esc(d.origem)}</span>${depSelo()}</figcaption>
      </figure>`).join('\n')}
    </div>
  </div>
</section>
<section class="grade-wrap ofertas-wrap" hidden>
  <h2 class="secao-titulo">${t('Datas Livres Nos Próximos 15 Dias — Aproveite', 'Free Dates in the Next 15 Days — Grab Them', 'Fechas Libres en los Próximos 15 Días — Aprovecha')}</h2>
  <div class="grade ofertas-grade"></div>
</section>
<section id="hospedagens" class="grade-wrap">
${cards}
</section>
<script>
window.addEventListener('load', function(){
fetch('${BACKEND}/api/ultima-hora')
  .then(function(r){ return r.json(); })
  .then(function(ofertas){
    if (!Array.isArray(ofertas) || !ofertas.length) return;
    var wrap = document.querySelector('.ofertas-wrap');
    var grade = wrap.querySelector('.ofertas-grade');
    var meses = ${JSON.stringify(LANG === 'en' ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] : (LANG === 'es' ? ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'] : ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']))};
    grade.innerHTML = ofertas.slice(0, 6).map(function(o){
      var d = new Date(o.de + 'T12:00:00');
      var quando = ${LANG === 'en' ? "meses[d.getMonth()] + ' ' + d.getDate()" : "d.getDate() + ' de ' + meses[d.getMonth()]"};
      return '<div class="card oferta">' +
        '<a class="card-link" href="${L('/hospedagem/')}' + o.id + '.html">' +
        '<div class="card-info"><h3>' + o.titulo + '</h3>' +
        '<p>' + ${JSON.stringify(t('Livre a partir de', 'Free from', 'Libre desde'))} + ' <strong>' + quando + '</strong> (' + o.noites + ${JSON.stringify(t('+ noites)', '+ nights)', '+ noches)'))} +
        (o.precoBRL ? ${JSON.stringify(t(' · diária R$ ', ' · per night R$ ', ' · por noche R$ '))} + o.precoBRL.toLocaleString('pt-BR') : '') + '</p>' +
        '<p class="oferta-cta">' + ${JSON.stringify(t('Condição de última hora — reserve agora 👇', 'Last-minute deal — book now 👇', 'Oferta de última hora — reserva ahora 👇'))} + '</p></div></a>' +
        '<a class="btn btn-reservar btn-card" target="_blank" rel="noopener" href="${STAYS_SITE}/pt/apartment/' + o.id + '?from=' + o.de + '">' + ${JSON.stringify(t('Reservar e pagar →', 'Book and pay →', 'Reservar y pagar →'))} + '</a>' +
        '</div>';
    }).join('');
    wrap.hidden = false;
  })
  .catch(function(){});
});
</script>`,
  {
    caminho: '/',
    ogImage: `${SITE_URL}/og-home.jpg`,
    // Preload da imagem do LCP (1ª foto do slideshow), com srcset/sizes para o browser baixar a
    // largura certa o quanto antes — derruba o LCP. Só funciona porque o CDN gera webp responsivo.
    extraHead: `<link rel="preload" as="image" fetchpriority="high" href="${cdnUrl(heroFotos[0], 1200)}" imagesrcset="${IMG_LARGURAS.map(w => `${cdnUrl(heroFotos[0], w)} ${w}w`).join(', ')}" imagesizes="100vw">
<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'LodgingBusiness',
      '@id': `${SITE_URL}/#hospedagem`,
      name: NAP.nome, url: SITE_URL, image: `${SITE_URL}/og-home.jpg`,
      description: t('Hospedagem por temporada no Lago Sul, Brasília-DF: casas com piscina aquecida para grupos, flats e suítes, com reserva direta com o anfitrião.', 'Vacation rentals in Lago Sul, Brasília, Brazil: houses with heated pools for groups, flats and suites, booked directly with the host.', 'Alquiler por temporada en Lago Sul, Brasília-DF: casas con piscina climatizada para grupos, flats y suites, con reserva directa con el anfitrión.'),
      address: { '@type': 'PostalAddress', streetAddress: NAP.rua, addressLocality: NAP.cidade, addressRegion: NAP.uf, addressCountry: NAP.pais },
      geo: { '@type': 'GeoCoordinates', latitude: NAP.geo.lat, longitude: NAP.geo.lng },
      telephone: NAP.telefone, email: NAP.email,
      priceRange: 'R$ 200 - R$ 2.000',
      parentOrganization: { '@id': ORG_ID },
      sameAs: NAP.sameAs,
      // aggregateRating/review usam avaliações REAIS coletadas (data/depoimentos.json) — não inventar
      aggregateRating: { '@type': 'AggregateRating', ratingValue: '5', bestRating: '5', reviewCount: depoimentos.length },
      review: depoimentos.map(d => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: d.nome },
        reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
        reviewBody: depTexto(d)
      }))
    })}</script>`
  }
);
fs.writeFileSync(path.join(od, 'index.html'), home);

// ------------------------------------------------- página por unidade
// Plantas humanizadas (feitas pelo Augusto) — id do anúncio -> arquivo
const PLANTAS = { GI01I: 'casa-villela.jpg', GD03H: 'gran-villela.jpg', GG04I: 'villa-kubitschek.jpg' };
fs.mkdirSync(path.join(DIST, 'plantas'), { recursive: true });
for (const p of Object.values(PLANTAS)) fs.copyFileSync(path.join(__dirname, 'src', 'plantas', p), path.join(DIST, 'plantas', p));

// Vídeos publicitários — id do anúncio -> arquivo
const VIDEOS = { GD01H: 'casa-modernista.mp4', GI01I: 'casa-villela.mp4', GD03H: 'gran-villela.mp4', PL02I: 'villa-catetinho.mp4', GG04I: 'villa-kubitschek.mp4' };
fs.mkdirSync(path.join(DIST, 'videos'), { recursive: true });
for (const v of Object.values(VIDEOS)) fs.copyFileSync(path.join(__dirname, 'src', 'videos', v), path.join(DIST, 'videos', v));

// Manuais do hóspede (e-books) — Villela Stay para as 4 casas do complexo; Modernista próprio
const EBOOKS = {
  GD03H: 'manual-villela-stay.pdf', GG04I: 'manual-villela-stay.pdf',
  PL02I: 'manual-villela-stay.pdf', GI01I: 'manual-villela-stay.pdf',
  GD01H: 'manual-casa-modernista.pdf'
};
fs.mkdirSync(path.join(DIST, 'ebooks'), { recursive: true });
for (const e of [...new Set(Object.values(EBOOKS))]) fs.copyFileSync(path.join(__dirname, 'src', 'ebooks', e), path.join(DIST, 'ebooks', e));

// Schema.org por unidade. Casa/flat inteiros -> VacationRental (tipo que o Google usa para
// imóveis de temporada). Quarto/suíte privativos -> LodgingBusiness. Só dados REAIS de
// listings.json (capacidade, quartos, camas, banheiros, m2, localização). SEM rating por
// unidade (não existe avaliação por unidade — não inventar nota nem preço).
function unidadeSchema(l) {
  const inteiro = l.tipo === 'entire_home';
  const desc = String(resumoImovel(l) || descricaoImovel(l) || tituloImovel(l)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
  const s = {
    '@context': 'https://schema.org',
    '@type': inteiro ? 'VacationRental' : 'LodgingBusiness',
    name: tituloImovel(l),
    image: [l.fotoPrincipal, ...(l.fotos || []).slice(1, 6).map(f => f.url)].filter(Boolean),
    url: `${SITE_URL}${L(`/hospedagem/${l.id}.html`)}`,
    description: desc,
    address: {
      '@type': 'PostalAddress',
      streetAddress: l.rua ? `${l.rua} — Lago Sul` : 'Lago Sul',
      addressLocality: NAP.cidade, addressRegion: NAP.uf, addressCountry: NAP.pais
    },
    geo: { '@type': 'GeoCoordinates', latitude: NAP.geo.lat, longitude: NAP.geo.lng },
    containedInPlace: { '@type': 'Place', name: 'Lago Sul, Brasília-DF' },
    numberOfRooms: l.quartos,
    petsAllowed: true,
    brand: { '@id': ORG_ID },
    isPartOf: { '@id': ORG_ID }
  };
  // Ocupação e cômodos (campos numéricos reais)
  s.occupancy = { '@type': 'QuantitativeValue', maxValue: l.hospedes, unitCode: 'C62' };
  if (inteiro) {
    s.numberOfBedrooms = l.quartos;
    if (l.banheiros) s.numberOfBathroomsTotal = l.banheiros;
    if (l.camas) s.numberOfBeds = l.camas;
  }
  if (l.m2) s.floorSize = { '@type': 'QuantitativeValue', value: l.m2, unitCode: 'MTK' };
  return s;
}

// ---- comodidades por categoria (não há campo estruturado na Stays) ----
function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function categoriaDe(l) {
  const t = semAcento(l.titulo);
  if (/suite/.test(t)) return 'suite';
  if (/flat/.test(t)) return 'flat';
  return 'casa';
}
// Itens presentes em TODAS as propriedades (fixos)
const COMODIDADES_FIXAS = [
  { icon: '📶', label: 'Wi-Fi' },
  { icon: '❄️', label: t('Ar-condicionado', 'Air conditioning', 'Aire acondicionado') },
  { icon: '📺', label: 'Smart TV' },
  { icon: '🅿️', label: t('Garagem', 'Parking', 'Estacionamiento') },
  { icon: '🛏️', label: t('Lençóis', 'Bed linen', 'Sábanas') },
  { icon: '🧣', label: t('Cobertores', 'Blankets', 'Mantas') },
  { icon: '🧖', label: t('Toalhas', 'Towels', 'Toallas') },
  { icon: '🛝', label: t('Parquinho infantil', "Kids' playground", 'Parque infantil') }
];
// Itens detectados no texto e SEMPRE incluídos quando presentes (não viram opcionais)
const COMODIDADES_DETECTADAS = [
  { re: /escritorio|home office/, icon: '💻', label: t('Espaço de trabalho', 'Workspace', 'Espacio de trabajo') },
  { re: /rooftop|terraco/, icon: '🌇', label: t('Rooftop / Terraço', 'Rooftop / Terrace', 'Azotea / Terraza') },
  { re: /sinuca|bilhar|pebolim/, icon: '🎱', label: t('Jogos (sinuca/bilhar)', 'Games (pool/billiards)', 'Juegos (billar)') },
  { re: /bosque|area verde/, icon: '🌳', label: t('Bosque / Área verde', 'Woods / Green area', 'Bosque / Zona verde') },
  { re: /portaria|seguranca 24|condominio fechado|cameras|monitorad/, icon: '🔒', label: t('Segurança / portaria', 'Security / gatehouse', 'Seguridad / portería') },
  { re: /\bpet\b|pets|cachorro|aceita animais/, icon: '🐾', label: t('Aceita pets', 'Pets allowed', 'Se admiten mascotas') }
];
// Itens "flexíveis": incluídos nas CASAS (quando citados no texto); OPCIONAIS com taxa em flats/suítes
const FLEX = {
  piscina: { icon: '🏊', label: t('Piscina', 'Pool', 'Piscina') },
  jacuzzi: { icon: '🛀', label: 'Jacuzzi / Spa' },
  churrasqueira: { icon: '🔥', label: t('Churrasqueira', 'Barbecue', 'Parrilla') },
  cozinha: { icon: '🍳', label: t('Cozinha equipada', 'Equipped kitchen', 'Cocina equipada') },
  lavanderia: { icon: '🧺', label: t('Lavanderia', 'Laundry', 'Lavandería') },
  gourmet: { icon: '🍽️', label: t('Espaço gourmet', 'Gourmet space', 'Espacio gourmet') }
};
// Comodidades de USO COMPARTILHADO por anúncio (imóveis interligados do compound)
const COMODIDADES_COMPARTILHADAS = {
  PL02I: [ // Villa Catetinho — área de lazer compartilhada do compound
    FLEX.piscina, FLEX.churrasqueira, FLEX.cozinha, FLEX.lavanderia, { icon: '🌇', label: 'Rooftop' }
  ]
};
function comodidadesDe(l) {
  const cat = categoriaDe(l);
  const hay = semAcento([l.descricao, l.resumo, l.titulo].join(' '));
  const compartilhados = COMODIDADES_COMPARTILHADAS[l.id] ? COMODIDADES_COMPARTILHADAS[l.id].slice() : [];
  const incluidos = [...COMODIDADES_FIXAS];
  for (const a of COMODIDADES_DETECTADAS) if (a.re.test(hay)) incluidos.push({ icon: a.icon, label: a.label });
  const opcionais = [];
  if (cat === 'casa') {
    if (/piscina aquecida/.test(hay)) incluidos.push({ icon: '🏊', label: t('Piscina aquecida', 'Heated pool', 'Piscina climatizada') });
    else if (/piscina/.test(hay)) incluidos.push(FLEX.piscina);
    if (/jacuzzi|hidromassagem|\bspa\b/.test(hay)) incluidos.push(FLEX.jacuzzi);
    if (/churrasqueira|churrasco/.test(hay)) incluidos.push(FLEX.churrasqueira);
    if (/cozinha/.test(hay)) incluidos.push(FLEX.cozinha);
    if (/lavanderia|maquina de lavar|lava e seca/.test(hay)) incluidos.push(FLEX.lavanderia);
    if (/espaco gourmet|area gourmet/.test(hay)) incluidos.push(FLEX.gourmet);
  } else {
    // flat e suíte: itens flexíveis viram OPCIONAIS com cobrança de taxa
    opcionais.push(FLEX.piscina, FLEX.jacuzzi, FLEX.churrasqueira, FLEX.cozinha, FLEX.lavanderia);
    if (cat === 'suite') opcionais.push(FLEX.gourmet);
  }
  // itens compartilhados não se repetem nos incluídos
  const seen = new Set(compartilhados.map(x => x.label));
  const incluidosU = incluidos.filter(x => (seen.has(x.label) ? false : seen.add(x.label)));
  return { incluidos: incluidosU, opcionais, compartilhados };
}
// ---- 3 depoimentos por unidade: tenta casar pela hospedagem; senão, rotaciona ----
const DEP_STOP = new Set(['villela', 'home', 'stay', 'lago', 'sul', 'brasilia', 'flat', 'suite', 'casa', 'dos', 'das', 'espaco', 'inteiro', 'home', 'da', 'do', 'na', 'no']);
function depoimentosUnidade(l, idx) {
  const toks = [...new Set(semAcento(l.titulo).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !DEP_STOP.has(w)))];
  let m = depoimentos.filter(d => { const h = semAcento(d.hospedagem); return toks.some(t => h.includes(t)); });
  if (m.length < 2) {
    const n = depoimentos.length, start = (idx * 3) % n;
    m = [depoimentos[start], depoimentos[(start + 1) % n], depoimentos[(start + 2) % n]];
  }
  return m.slice(0, 3);
}

for (const l of listings) {
  const galeria = (l.fotos || []).slice(1, 9).map(f =>
    img(f.url, { alt: f.nome || l.titulo, title: f.nome || '', width: 400, height: 170, sizes: '(max-width: 640px) 50vw, 260px' })).join('\n');

  const idx = listings.indexOf(l);
  const comods = comodidadesDe(l);
  const stripConfianca = `<section class="uni-confianca">
    <div>🏆 ${t('Superhost premiado', 'Award-winning Superhost', 'Superhost premiado')}</div><div>🏅 ${t('Favorito dos Hóspedes', 'Guest Favourite', 'Favorito de los Huéspedes')}</div><div>📍 ${t('Lago Sul · 10 min da Esplanada', 'Lago Sul · 10 min from the Esplanada', 'Lago Sul · 10 min de la Explanada')}</div><div>💰 ${t('Reserva direta, sem taxa de plataforma', 'Direct booking, no platform fee', 'Reserva directa, sin tarifa de plataforma')}</div>
  </section>`;
  const blocoBeneficios = `<section class="uni-beneficios">
    <p class="uni-lead">${t(`Hospedagem no coração do Lago Sul para até <strong>${l.hospedes} hóspedes</strong>${l.quartos > 1 ? `, ${l.quartos} quartos` : ''}${l.m2 ? ` e ${l.m2} m²` : ''} — conforto premium, localização nobre e a segurança de reservar direto com quem cuida da casa.`, `A stay in the heart of Lago Sul for up to <strong>${l.hospedes} guests</strong>${l.quartos > 1 ? `, ${l.quartos} rooms` : ''}${l.m2 ? ` and ${l.m2} m²` : ''} — premium comfort, a prime location and the peace of mind of booking directly with the people who care for the house.`, `Un alojamiento en el corazón de Lago Sul para hasta <strong>${l.hospedes} huéspedes</strong>${l.quartos > 1 ? `, ${l.quartos} habitaciones` : ''}${l.m2 ? ` y ${l.m2} m²` : ''} — confort premium, ubicación exclusiva y la tranquilidad de reservar directo con quienes cuidan la casa.`)}</p>
    <h2 class="secao-titulo">${t('Por que reservar direto neste site', 'Why book directly on this site', 'Por qué reservar directo en este sitio')}</h2>
    <div class="beneficios-grid">
      <div class="beneficio"><span>💰</span><div><strong>${t('Melhor preço', 'Best price', 'Mejor precio')}</strong>${t('Reserva direta com o anfitrião, sem taxas extras de plataforma.', 'Book directly with the host, with no extra platform fees.', 'Reserva directa con el anfitrión, sin tarifas extra de plataforma.')}</div></div>
      <div class="beneficio"><span>⚡</span><div><strong>${t('Confirmação na hora', 'Instant confirmation', 'Confirmación al instante')}</strong>${t('Disponibilidade em tempo real e reserva imediata.', 'Real-time availability and instant booking.', 'Disponibilidad en tiempo real y reserva inmediata.')}</div></div>
      <div class="beneficio"><span>🔒</span><div><strong>${t('Pagamento 100% seguro', '100% secure payment', 'Pago 100% seguro')}</strong>${t('Pague on-line no sistema oficial de reservas.', 'Pay online through the official booking system.', 'Paga en línea en el sistema oficial de reservas.')}</div></div>
      <div class="beneficio"><span>🤝</span><div><strong>${t('Anfitrião Superhost', 'Superhost host', 'Anfitrión Superhost')}</strong>${t('Atendimento direto e premiado, antes e durante a estadia.', 'Direct, award-winning service before and during your stay.', 'Atención directa y premiada, antes y durante la estancia.')}</div></div>
    </div>
  </section>`;
  const blocoComodidades = (comods.incluidos.length || comods.opcionais.length || comods.compartilhados.length) ? `<section class="comodidades">
    <h2 class="secao-titulo">${t('O que esta hospedagem oferece', 'What this stay offers', 'Lo que ofrece este alojamiento')}</h2>
    <ul class="comodidades-grid">${comods.incluidos.map(c => `<li><span>${c.icon}</span> ${esc(c.label)}</li>`).join('')}</ul>
    ${comods.compartilhados.length ? `<h3 class="comodidades-sub">${t('Comodidades compartilhadas', 'Shared amenities', 'Comodidades compartidas')} <span>· ${t('uso comum do compound', 'shared use within the compound', 'uso común del compound')}</span></h3>
    <ul class="comodidades-grid comodidades-compartilhadas">${comods.compartilhados.map(c => `<li><span>${c.icon}</span> ${esc(c.label)} <em class="comp-tag">${t('uso comum', 'shared', 'uso común')}</em></li>`).join('')}</ul>` : ''}
    ${comods.opcionais.length ? `<h3 class="comodidades-sub">${t('Comodidades opcionais', 'Optional amenities', 'Comodidades opcionales')} <span>· ${t('mediante taxa', 'for a fee', 'mediante tarifa')}</span></h3>
    <ul class="comodidades-grid comodidades-opcionais">${comods.opcionais.map(c => `<li><span>${c.icon}</span> ${esc(c.label)} <em class="opc-tag">${t('opcional', 'optional', 'opcional')}</em></li>`).join('')}</ul>
    <p class="comodidades-nota">${t('Itens opcionais ficam disponíveis mediante agendamento e cobrança de taxa adicional — consulte os valores na reserva ou pelo WhatsApp.', 'Optional items are available by arrangement and for an additional fee — check the prices when booking or on WhatsApp.', 'Los artículos opcionales están disponibles mediante reserva previa y una tarifa adicional — consulta los precios al reservar o por WhatsApp.')}</p>` : ''}
  </section>` : '';
  const deps = depoimentosUnidade(l, idx);
  const blocoDepoimentos = deps.length ? `<section class="uni-depoimentos">
    <h2 class="secao-titulo">${t('O que dizem nossos hóspedes', 'What our guests say', 'Lo que dicen nuestros huéspedes')}</h2>
    <div class="uni-dep-grid">${deps.map(d => `<figure class="depoimento"><div class="estrelas" aria-label="${t('5 estrelas', '5 stars', '5 estrellas')}">★★★★★</div><blockquote>“${esc(depTexto(d))}”</blockquote><figcaption><strong>${esc(d.nome)}</strong> · ${esc(d.hospedagem)} · <span class="origem">${t('avaliação no', 'review on', 'reseña en')} ${esc(d.origem)}</span>${depSelo()}</figcaption></figure>`).join('')}</div>
  </section>` : '';
  const ctaFinal = `<section class="uni-cta-final">
    <h2>${t('Garanta sua data antes que esgote', 'Secure your dates before they\'re gone', 'Asegura tu fecha antes de que se agote')}</h2>
    <p>${t('O calendário do Lago Sul enche rápido em feriados, alta temporada e grandes eventos de Brasília. Reserve agora e assegure a sua estadia.', 'The Lago Sul calendar fills up fast on holidays, high season and major Brasília events. Book now and secure your stay.', 'El calendario de Lago Sul se llena rápido en feriados, temporada alta y grandes eventos de Brasília. Reserva ahora y asegura tu estancia.')}</p>
    <div class="uni-cta-acoes">
      <a class="btn btn-reservar" target="_blank" rel="noopener" href="${STAYS_SITE}/pt/apartment/${l.id}">${t('Reservar e pagar →', 'Book and pay →', 'Reservar y pagar →')}</a>
      <a class="btn btn-claro" href="#reservar">${t('Ver datas e valores', 'See dates and prices', 'Ver fechas y precios')}</a>
    </div>
  </section>`;

  const pagina = layout(
    `${tituloImovel(l)} | Villela Stay`,
    String(resumoImovel(l) || tituloImovel(l)).replace(/<[^>]+>/g, '').slice(0, 155),
    `
<article class="unidade">
  ${img(l.fotoPrincipal, { alt: l.titulo, classe: 'capa', width: 980, height: 420, sizes: '(max-width: 980px) 100vw, 980px', lazy: false, prioridade: true })}
  <div class="unidade-cab">
    <nav class="breadcrumb"><a href="${L('/')}">${t('Início', 'Home', 'Inicio')}</a> › <a href="${L('/')}#hospedagens">${t('Hospedagens', 'Stays', 'Alojamientos')}</a> › <span>${esc(tituloImovel(l))}</span></nav>
    <h1>${esc(tituloImovel(l))}</h1>
    <p class="ficha">${l.hospedes} ${t('hóspedes', 'guests', 'huéspedes')} · ${t(`${l.quartos} quarto${l.quartos > 1 ? 's' : ''}`, `${l.quartos} room${l.quartos > 1 ? 's' : ''}`, `${l.quartos} ${l.quartos > 1 ? 'habitaciones' : 'habitación'}`)} · ${t(`${l.camas} cama${l.camas > 1 ? 's' : ''}`, `${l.camas} bed${l.camas > 1 ? 's' : ''}`, `${l.camas} cama${l.camas > 1 ? 's' : ''}`)} · ${t(`${l.banheiros} banheiro${l.banheiros > 1 ? 's' : ''}`, `${l.banheiros} bathroom${l.banheiros > 1 ? 's' : ''}`, `${l.banheiros} baño${l.banheiros > 1 ? 's' : ''}`)}${l.m2 ? ` · ${l.m2} m²` : ''} · ${esc(l.bairro)}</p>
  </div>
  ${stripConfianca}
  <section id="reservar" class="disponibilidade" data-listing="${l.mongoId}">
    <h2>📅 ${t('Veja disponibilidade e reserve com pagamento on-line', 'Check availability and book with online payment', 'Consulta disponibilidad y reserva con pago en línea')}</h2>
    <div class="disp-form">
      <label>${t('Entrada', 'Check-in', 'Entrada')} <input type="date" class="disp-in"></label>
      <label>${t('Saída', 'Check-out', 'Salida')} <input type="date" class="disp-out"></label>
      <label>${t('Hóspedes', 'Guests', 'Huéspedes')} <input type="number" class="disp-guests" min="1" max="${l.hospedes}" value="2"></label>
      <button class="btn disp-btn">${t('Consultar', 'Check', 'Consultar')}</button>
    </div>
    <div class="disp-resultado" hidden></div>
    <div class="disp-acoes">
      <a class="btn btn-reservar" target="_blank" rel="noopener" href="${STAYS_SITE}/pt/apartment/${l.id}">${t('Reservar e pagar →', 'Book and pay →', 'Reservar y pagar →')}</a>
      <a class="btn btn-wa disp-reservar" href="${waLink(t(`Olá! Quero reservar a ${l.titulo}.`, `Hi! I'd like to book ${l.titulo}.`, `¡Hola! Quiero reservar la ${l.titulo}.`))}">${t('Reservar pelo WhatsApp', 'Book on WhatsApp', 'Reservar por WhatsApp')}</a>
    </div>
    <p class="disp-nota">🔒 ${t('Disponibilidade, reserva e pagamento processados com segurança no nosso sistema de reservas — exclusivo desta hospedagem.', 'Availability, booking and payment are processed securely in our booking system — exclusive to this property.', 'Disponibilidad, reserva y pago procesados de forma segura en nuestro sistema de reservas — exclusivo de este alojamiento.')}</p>
  </section>
  ${blocoBeneficios}
  ${blocoComodidades}
  ${VIDEOS[l.id] ? `<section class="video-wrap">
    <h2>${t('Conheça por dentro', 'Take a look inside', 'Conoce por dentro')}</h2>
    <video controls preload="none" playsinline poster="${cdnUrl(l.fotoPrincipal, 800)}">
      <source src="/videos/${VIDEOS[l.id]}" type="video/mp4">
    </video>
  </section>` : ''}
  <section class="lead-box">
    <h2>${t('Prefere receber a cotação? Deixe seu contato 👇', 'Prefer to get a quote? Leave your contact 👇', '¿Prefieres recibir la cotización? Deja tu contacto 👇')}</h2>
    <form class="form-lead">
      <input name="nome" placeholder="${t('Seu nome*', 'Your name*', 'Tu nombre*')}" required>
      <input name="contato" placeholder="${t('Seu WhatsApp ou e-mail*', 'Your WhatsApp or email*', 'Tu WhatsApp o correo*')}" required>
      <button class="btn" type="submit">${t('Quero uma cotação', 'I want a quote', 'Quiero una cotización')}</button>
      <p class="form-status" hidden></p>
    </form>
  </section>
  <section class="descricao"><h2 class="secao-titulo">${t('Sobre a hospedagem', 'About this stay', 'Sobre el alojamiento')}</h2>${(descricaoImovel(l) || '').replace(/,\s*academias\b/gi, '')}</section>
  ${blocoDepoimentos}
  ${PLANTAS[l.id] ? `<section class="planta">
    <h2>${t('Planta do espaço', 'Floor plan', 'Plano del espacio')}</h2>
    <a href="/plantas/${PLANTAS[l.id]}" target="_blank" rel="noopener">${(() => {
      const d = dimensoesArquivo(path.join(__dirname, 'src', 'plantas', PLANTAS[l.id]));
      return img(`/plantas/${PLANTAS[l.id]}`, { alt: `${t('Planta do espaço', 'Floor plan', 'Plano del espacio')} — ${l.titulo}`, sizes: '(max-width: 980px) 100vw, 980px', width: d ? d.w : undefined, height: d ? d.h : undefined });
    })()}</a>
    <p class="planta-dica">${t('Clique na planta para ampliar.', 'Click the plan to enlarge.', 'Haz clic en el plano para ampliar.')}</p>
  </section>` : ''}
  <section class="galeria"><h2>${t('Fotos', 'Photos', 'Fotos')}</h2><div class="galeria-grid">${galeria}</div></section>
  ${EBOOKS[l.id] ? `<section class="ebook-box">
    📖 <a href="/ebooks/${EBOOKS[l.id]}" target="_blank" rel="noopener"><strong>${t('Baixe o Manual do Hóspede (e-book em PDF)', 'Download the Guest Manual (PDF e-book)', 'Descarga el Manual del Huésped (e-book en PDF)')}</strong></a> — ${t('o funcionamento da casa, as regras e o guia de turismo e gastronomia de Brasília do anfitrião.', "how the house works, the rules and the host's Brasília tourism and food guide.", 'cómo funciona la casa, las normas y la guía de turismo y gastronomía de Brasília del anfitrión.')}
  </section>` : ''}
  ${ctaFinal}
  <section class="relacionados">
    <h2>${t('Veja também', 'See also', 'Ver también')}</h2>
    <p><a href="${L('/pacotes.html')}">${t('Pacotes Especiais', 'Special Packages', 'Paquetes Especiales')}</a> · <a href="${L('/eventos.html')}">${t('Eventos no Lago Sul', 'Events in Lago Sul', 'Eventos en Lago Sul')}</a> · <a href="${L('/guia.html')}">${t('Guia do Hóspede', 'Guest Guide', 'Guía del Huésped')}</a> · <a href="${L('/regras.html')}">${t('Regras da Casa', 'House Rules', 'Normas de la Casa')}</a></p>
  </section>
</article>
<script>
(function(){
  var sec = document.querySelector('.disponibilidade');
  var btn = sec.querySelector('.disp-btn'), out = sec.querySelector('.disp-resultado');
  var inEl = sec.querySelector('.disp-in'), outEl = sec.querySelector('.disp-out'), gEl = sec.querySelector('.disp-guests');
  var btnStays = sec.querySelector('.btn-reservar');
  var STAYS_AP = '${STAYS_SITE}/pt/apartment/${l.id}';
  // Mantém o botão "Reservar e pagar" apontando para ESTA propriedade na Stays, com datas/hóspedes.
  function atualizarStays(){
    var qs = [];
    if (inEl.value) qs.push('from=' + inEl.value);
    if (outEl.value) qs.push('to=' + outEl.value);
    if (gEl && gEl.value) qs.push('persons=' + gEl.value);
    btnStays.href = STAYS_AP + (qs.length ? ('?' + qs.join('&')) : '');
  }
  [inEl, outEl, gEl].forEach(function(el){ if (el) el.addEventListener('change', atualizarStays); });
  atualizarStays();
  btn.addEventListener('click', function(){
    var de = inEl.value, ate = outEl.value;
    if (!de || !ate) { out.hidden = false; out.textContent = ${JSON.stringify(t('Escolha as duas datas.', 'Choose both dates.', 'Elige ambas fechas.'))}; return; }
    out.hidden = false; out.textContent = ${JSON.stringify(t('Consultando...', 'Checking...', 'Consultando...'))};
    atualizarStays();
    fetch('${BACKEND}/api/disponibilidade/${l.mongoId}?from=' + de + '&to=' + ate)
      .then(function(r){ return r.json(); })
      .then(function(dias){
        var noites = dias.slice(0, -1);
        var livres = noites.filter(function(d){ return d.disponivel; });
        var total = noites.reduce(function(s, d){ return s + (d.precoBRL || 0); }, 0);
        var wa = sec.querySelector('.disp-reservar');
        if (noites.length && livres.length === noites.length) {
          out.innerHTML = ${JSON.stringify(t('✅ Disponível! ', '✅ Available! ', '✅ ¡Disponible! '))} + noites.length + ${JSON.stringify(t(' noite(s) — total estimado <strong>R$ ', ' night(s) — estimated total <strong>R$ ', ' noche(s) — total estimado <strong>R$ '))} +
            total.toLocaleString('pt-BR') + ${JSON.stringify(t('</strong>. Clique em <strong>“Reservar e pagar”</strong> para concluir com segurança.', '</strong>. Click <strong>“Book and pay”</strong> to complete securely.', '</strong>. Haz clic en <strong>“Reservar y pagar”</strong> para completar con seguridad.'))};
          wa.href = 'https://wa.me/${WHATSAPP}?text=' + encodeURIComponent(${JSON.stringify(t(`Olá! Quero reservar a ${l.titulo} de `, `Hi! I'd like to book ${l.titulo} from `, `¡Hola! Quiero reservar la ${l.titulo} del `))} + de + ${JSON.stringify(t(' a ', ' to ', ' al '))} + ate + ${JSON.stringify(t(' — total estimado R$ ', ' — estimated total R$ ', ' — total estimado R$ '))} + total.toLocaleString('pt-BR') + ${JSON.stringify(t('. Pode confirmar?', '. Can you confirm?', '. ¿Puedes confirmar?'))});
        } else {
          out.innerHTML = ${JSON.stringify(t('😕 Sem disponibilidade completa nessas datas. Tente outras datas ou fale conosco no WhatsApp.', '😕 Not fully available on those dates. Try other dates or contact us on WhatsApp.', '😕 Sin disponibilidad completa en esas fechas. Prueba otras fechas o contáctanos por WhatsApp.'))};
          wa.href = 'https://wa.me/${WHATSAPP}?text=' + encodeURIComponent(${JSON.stringify(t(`Olá! Consultei a ${l.titulo} de `, `Hi! I checked ${l.titulo} from `, `¡Hola! Consulté la ${l.titulo} del `))} + de + ${JSON.stringify(t(' a ', ' to ', ' al '))} + ate + ${JSON.stringify(t(' e não havia disponibilidade completa. Pode me ajudar com datas ou casas alternativas?', ' and it was not fully available. Could you help me with dates or alternative houses?', ' y no había disponibilidad completa. ¿Puedes ayudarme con fechas o casas alternativas?'))});
        }
      })
      .catch(function(){ out.textContent = ${JSON.stringify(t('Não foi possível consultar agora. Tente novamente ou fale conosco pelo WhatsApp.', "Couldn't check right now. Please try again or contact us on WhatsApp.", 'No fue posible consultar ahora. Inténtalo de nuevo o contáctanos por WhatsApp.'))}; });
  });

  var fl = document.querySelector('.form-lead');
  fl.addEventListener('submit', function(e){
    e.preventDefault();
    var st = fl.querySelector('.form-status');
    st.hidden = false; st.textContent = ${JSON.stringify(t('Enviando...', 'Sending...', 'Enviando...'))};
    var de = sec.querySelector('.disp-in').value, ate = sec.querySelector('.disp-out').value;
    fetch('${BACKEND}/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: fl.nome.value, contato: fl.contato.value,
        mensagem: 'Cotação ${l.id} - ${l.titulo}' + (de && ate ? (' | datas: ' + de + ' a ' + ate) : ''),
        origem: 'site-${l.id}'
      })
    }).then(function(r){
      st.textContent = r.ok ? ${JSON.stringify(t('✅ Recebido! Em breve enviaremos sua cotação.', "✅ Received! We'll send your quote soon.", '✅ ¡Recibido! Pronto te enviaremos tu cotización.'))} : ${JSON.stringify(t('Erro ao enviar — fale conosco pelo WhatsApp.', 'Error sending — contact us on WhatsApp.', 'Error al enviar — contáctanos por WhatsApp.'))};
      if (r.ok) fl.reset();
    }).catch(function(){ st.textContent = ${JSON.stringify(t('Erro ao enviar — fale conosco pelo WhatsApp.', 'Error sending — contact us on WhatsApp.', 'Error al enviar — contáctanos por WhatsApp.'))}; });
  });
})();
</script>`,
    {
      caminho: `/hospedagem/${l.id}.html`,
      ogImage: l.fotoPrincipal,
      ogType: 'product',
      extraHead: `<link rel="preload" as="image" fetchpriority="high" href="${cdnUrl(l.fotoPrincipal, 1200)}" imagesrcset="${IMG_LARGURAS.map(w => `${cdnUrl(l.fotoPrincipal, w)} ${w}w`).join(', ')}" imagesizes="(max-width: 980px) 100vw, 980px">
<script type="application/ld+json">${JSON.stringify(unidadeSchema(l))}</script>
<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('Início', 'Home', 'Inicio'), item: SITE_URL + L('/') },
          { '@type': 'ListItem', position: 2, name: t('Hospedagens', 'Stays', 'Alojamientos'), item: SITE_URL + L('/') + '#hospedagens' },
          { '@type': 'ListItem', position: 3, name: tituloImovel(l), item: `${SITE_URL}${L(`/hospedagem/${l.id}.html`)}` }
        ]
      })}</script>`
    }
  );
  fs.writeFileSync(path.join(od, 'hospedagem', `${l.id}.html`), pagina);
}

// ------------------------- eventos (página de vendas) -------------------------
const CASAS_EVENTO = [
  {
    id: 'GG04I', nome: 'Villa Kubitschek', convidados: 150,
    local: 'SMDB Conjunto 29, Lago Sul',
    destaque: t('O maior espaço — casamentos, formaturas e grandes confraternizações', 'The largest space — weddings, graduations and big get-togethers', 'El mayor espacio — bodas, graduaciones y grandes encuentros')
  },
  {
    id: 'GD01H', nome: 'Casa Modernista', convidados: 80,
    local: 'SHIS QI 7, Conjunto 3, Lago Sul',
    destaque: t('Arquitetura icônica para festas e eventos corporativos', 'Iconic architecture for parties and corporate events', 'Arquitectura icónica para fiestas y eventos corporativos')
  },
  {
    id: 'GI01I', nome: 'Casa Villela', convidados: 60,
    local: 'SMDB Conjunto 29, Lago Sul',
    destaque: t('Aconchegante para aniversários, batizados e festas em família', 'Cosy for birthdays, christenings and family parties', 'Acogedora para cumpleaños, bautizos y fiestas en familia')
  }
];

const cardsEventos = CASAS_EVENTO.map(c => {
  const l = porId[c.id];
  const exemplo = c.convidados * 100 + 1000;
  return `
<article class="casa-pacote">
  ${l ? img(l.fotoPrincipal, { alt: c.nome, width: 340, height: 280, sizes: '(max-width: 760px) 100vw, 340px' }) : '<img alt="" width="340" height="280">'}
  <div class="casa-pacote-corpo">
    <h3>${esc(c.nome)}</h3>
    <p class="casa-meta">🕺 ${t('até', 'up to', 'hasta')} ${c.convidados} ${t('convidados', 'guests', 'invitados')} · 🕙 ${t('das 10h às 22h', '10 AM–10 PM', 'de 10h a 22h')} · 📍 ${esc(c.local)}</p>
    <p>${esc(c.destaque)}.</p>
    <div class="preco-bloco">
      <div class="preco-principal">R$ 100 <span>${t('por convidado', 'per guest', 'por invitado')}</span> + R$ 1.000 <span>${t('de limpeza profissional', 'professional cleaning', 'de limpieza profesional')}</span></div>
      <div class="preco-detalhe">${t(`Exemplo com lotação máxima (${c.convidados} convidados): <strong>${real(exemplo)}</strong> pelo dia inteiro de evento — piscina, churrasqueira e cozinha completa inclusas.`, `Example at full capacity (${c.convidados} guests): <strong>${real(exemplo)}</strong> for the full event day — pool, barbecue and full kitchen included.`, `Ejemplo con aforo máximo (${c.convidados} invitados): <strong>${real(exemplo)}</strong> por el día entero de evento — piscina, parrilla y cocina completa incluidas.`)}</div>
    </div>
    <a class="btn btn-wa" href="${waLink(t(`Olá! Quero fazer um evento na ${c.nome}. Data: ___ | Nº de convidados: ___ | Tipo de evento: ___`, `Hi! I'd like to host an event at ${c.nome}. Date: ___ | Number of guests: ___ | Type of event: ___`, `¡Hola! Quiero hacer un evento en ${c.nome}. Fecha: ___ | Nº de invitados: ___ | Tipo de evento: ___`))}">${t('Orçar evento na', 'Get a quote for', 'Cotizar evento en')} ${esc(c.nome)} →</a>
  </div>
</article>`;
}).join('\n');

const eventos = layout(
  t('Eventos no Lago Sul — casamentos, formaturas e festas | Villela Stay', 'Events in Lago Sul — weddings, graduations and parties | Villela Stay', 'Eventos en Lago Sul — bodas, graduaciones y fiestas | Villela Stay'),
  t('Alugue o espaço externo das casas da Villela Stay no Lago Sul para seu evento: piscina, churrasqueira e cozinha completa. R$ 100 por convidado, das 10h às 22h.', 'Rent the outdoor space of Villela Stay\'s houses in Lago Sul for your event: pool, barbecue and full kitchen. R$ 100 per guest, 10 AM–10 PM.', 'Alquila el espacio exterior de las casas de Villela Stay en Lago Sul para tu evento: piscina, parrilla y cocina completa. R$ 100 por invitado, de 10h a 22h.'),
  /* corpo */ `
<section class="hero hero-menor">
  <h1>${t('Seu evento no Lago Sul em Brasília', 'Your event in Lago Sul, Brasília', 'Tu evento en Lago Sul, Brasília')}</h1>
  <p>${t('<strong>Casamentos, formaturas, aniversários, festas infantis, confraternizações, eventos corporativos e reuniões familiares:</strong> alugue por um dia o espaço externo completo de uma de nossas casas no Lago Sul — com piscina, churrasqueira e cozinha. Entregamos a casa limpa e arrumamos tudo depois. Você só traz os seus convidados.', '<strong>Weddings, graduations, birthdays, kids\' parties, get-togethers, corporate events and family gatherings:</strong> rent the full outdoor space of one of our houses in Lago Sul for a day — with pool, barbecue and kitchen. We hand the house over clean and tidy up afterwards. You just bring your guests.', '<strong>Bodas, graduaciones, cumpleaños, fiestas infantiles, encuentros, eventos corporativos y reuniones familiares:</strong> alquila por un día el espacio exterior completo de una de nuestras casas en Lago Sul — con piscina, parrilla y cocina. Entregamos la casa limpia y ordenamos todo después. Tú solo traes a tus invitados.')}</p>
</section>
<div class="pacotes-wrap">

  <section class="venda-bloco como-funciona">
    <h2 class="secao-titulo">${t('Como funciona', 'How it works', 'Cómo funciona')}</h2>
    <div class="passos">
      <div class="passo"><strong>${t('1. Escolha a casa pelo tamanho da festa', '1. Choose the house by the size of your party', '1. Elige la casa según el tamaño de la fiesta')}</strong><br>${t('Eventos de 30 a 150 convidados com espaço exclusivo das 10h às 22h.', 'Events from 30 to 150 guests with exclusive use from 10 AM to 10 PM.', 'Eventos de 30 a 150 invitados con espacio exclusivo de 10h a 22h.')}</div>
      <div class="passo"><strong>${t('2. Preço simples e transparente', '2. Simple, transparent pricing', '2. Precio simple y transparente')}</strong><br>${t('Por apenas R$ 100 por convidado e R$ 1000 de taxa de limpeza — necessários para pagar duas diaristas, material de limpeza, sacos de lixo, etc.', 'Just R$ 100 per guest and a R$ 1,000 cleaning fee — needed to pay two cleaners, cleaning supplies, rubbish bags, etc.', 'Solo R$ 100 por invitado y R$ 1.000 de tarifa de limpieza — necesarios para pagar a dos personas de limpieza, materiales, bolsas de basura, etc.')}</div>
      <div class="passo"><strong>${t('3. Estrutura pronta', '3. Everything ready', '3. Estructura lista')}</strong><br>${t('Cozinha com gás, utensílios, detergente; churrasqueira a gás e a carvão; banheiros com sabonete líquido, papel toalha e papel higiênico.', 'Kitchen with gas, utensils and detergent; gas and charcoal barbecue; bathrooms with liquid soap, paper towels and toilet paper.', 'Cocina con gas, utensilios y detergente; parrilla a gas y a carbón; baños con jabón líquido, papel toalla y papel higiénico.')}</div>
    </div>
  </section>

  <section class="venda-bloco">
    <h2 class="secao-titulo">${t('As casas para o seu evento', 'The houses for your event', 'Las casas para tu evento')}</h2>
    ${cardsEventos}
  </section>

  <section class="venda-bloco">
    <h2 class="secao-titulo">${t('Combinados importantes', 'Important agreements', 'Acuerdos importantes')}</h2>
    <div class="passos">
      <div class="passo"><strong>🔇 ${t('Som moderado', 'Moderate sound', 'Sonido moderado')}</strong><br>${t('Pela lei do silêncio do condomínio, não permitimos banda ao vivo nem DJ com volume alto. Som ambiente é bem-vindo.', 'Under the condominium\'s quiet-hours rule, we don\'t allow live bands or loud DJs. Background music is welcome.', 'Por la ley del silencio del condominio, no permitimos banda en vivo ni DJ con volumen alto. La música ambiente es bienvenida.')}</div>
      <div class="passo"><strong>🪪 ${t('Controle de entrada', 'Entry control', 'Control de entrada')}</strong><br>${t('Em eventos com muitos convidados, o contratante providencia uma pessoa para controlar a entrada e saída, evitando transtornos aos vizinhos.', 'For events with many guests, the client provides someone to manage entry and exit, avoiding disturbances to neighbours.', 'En eventos con muchos invitados, el contratante provee a una persona para controlar la entrada y salida, evitando molestias a los vecinos.')}</div>
      <div class="passo"><strong>🅿️ ${t('Eventos grandes', 'Large events', 'Eventos grandes')}</strong><br>${t('Pode ser necessária a contratação de seguranças — que também orientam o estacionamento dos veículos dos convidados.', 'Hiring security may be necessary — they also direct guests\' vehicle parking.', 'Puede ser necesaria la contratación de seguridad — que también orienta el estacionamiento de los vehículos de los invitados.')}</div>
    </div>
    <p class="aviso-escassez">💡 ${t(`Nas datas especiais funcionamos apenas com <strong>pacotes de hospedagem combinados com eventos</strong> — veja os <a href="${L('/pacotes.html')}">Pacotes Especiais</a>.`, `On special dates we work only with <strong>stay packages combined with events</strong> — see the <a href="${L('/pacotes.html')}">Special Packages</a>.`, `En las fechas especiales trabajamos solo con <strong>paquetes de alojamiento combinados con eventos</strong> — mira los <a href="${L('/pacotes.html')}">Paquetes Especiales</a>.`)}</p>
  </section>

  <section class="venda-bloco cta-final">
    <h2>${t('Peça seu orçamento', 'Request your quote', 'Pide tu presupuesto')}</h2>
    <p>${t('Responda três perguntas — data, número de convidados e tipo de evento — e devolvemos a proposta completa.', 'Answer three questions — date, number of guests and type of event — and we\'ll send back a full proposal.', 'Responde tres preguntas — fecha, número de invitados y tipo de evento — y te enviamos la propuesta completa.')}</p>
    <a class="btn btn-wa btn-grande" href="${waLink(t('Olá! Quero orçar um evento. Data: ___ | Nº de convidados: ___ | Tipo de evento: ___', 'Hi! I\'d like a quote for an event. Date: ___ | Number of guests: ___ | Type of event: ___', '¡Hola! Quiero cotizar un evento. Fecha: ___ | Nº de invitados: ___ | Tipo de evento: ___'))}">${t('Orçar pelo WhatsApp', 'Get a quote on WhatsApp', 'Cotizar por WhatsApp')}</a>
    <p style="margin-top:24px">${t('Ou deixe seu contato que retornamos:', 'Or leave your contact and we\'ll get back to you:', 'O deja tu contacto y te respondemos:')}</p>
    <form id="form-evento" class="form-evento form-evento-claro">
      <label>${t('Seu nome*', 'Your name*', 'Tu nombre*')} <input name="nome" required></label>
      <label>${t('WhatsApp ou e-mail*', 'WhatsApp or email*', 'WhatsApp o correo*')} <input name="contato" required></label>
      <label>${t('Conte sobre o evento (tipo, data, nº de convidados)', 'Tell us about the event (type, date, number of guests)', 'Cuéntanos sobre el evento (tipo, fecha, nº de invitados)')} <textarea name="mensagem" rows="3"></textarea></label>
      <button class="btn" type="submit">${t('Pedir orçamento', 'Request a quote', 'Pedir presupuesto')}</button>
      <p class="form-status" hidden></p>
    </form>
  </section>
</div>
<script>
document.getElementById('form-evento').addEventListener('submit', function(e){
  e.preventDefault();
  var f = e.target, st = f.querySelector('.form-status');
  st.hidden = false; st.textContent = ${JSON.stringify(t('Enviando...', 'Sending...', 'Enviando...'))};
  fetch('${BACKEND}/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: f.nome.value, contato: f.contato.value, mensagem: f.mensagem.value, origem: 'site-eventos' })
  }).then(function(r){
    st.textContent = r.ok ? ${JSON.stringify(t('✅ Recebido! Retornaremos em breve.', '✅ Received! We\'ll get back to you shortly.', '✅ ¡Recibido! Te responderemos pronto.'))} : ${JSON.stringify(t('Erro ao enviar — fale conosco pelo WhatsApp.', 'Error sending — contact us on WhatsApp.', 'Error al enviar — contáctanos por WhatsApp.'))};
    if (r.ok) f.reset();
  }).catch(function(){ st.textContent = ${JSON.stringify(t('Erro ao enviar — fale conosco pelo WhatsApp.', 'Error sending — contact us on WhatsApp.', 'Error al enviar — contáctanos por WhatsApp.'))}; });
});
</script>`,
  { caminho: '/eventos.html' }
);
fs.writeFileSync(path.join(od, 'eventos.html'), eventos);

// ------------------------- pacotes (página de vendas) -------------------------
const DATAS_PACOTE = [
  { emoji: '🎄', nome: t('Natal 2026', 'Christmas 2026', 'Navidad 2026'), periodo: '23 a 27/12/2026' },
  { emoji: '🎆', nome: t('Réveillon 2026/2027', "New Year's Eve 2026/2027", 'Fin de Año 2026/2027'), periodo: '30/12/2026 a 03/01/2027' },
  { emoji: '🇧🇷', nome: t('Caravana da Posse do Novo Presidente', "New President's Inauguration Caravan", 'Caravana de la Toma de Posesión del Nuevo Presidente'), periodo: '30/12/2026 a 3/1/2027' },
  { emoji: '🎭', nome: t('Carnaval 2027', 'Carnival 2027', 'Carnaval 2027'), periodo: '6 a 10/02/2027' },
  { emoji: '🏛️', nome: t('Marcha dos Municípios 2027', 'March of Municipalities 2027', 'Marcha de los Municipios 2027'), periodo: t('datas sob consulta', 'dates on request', 'fechas a consultar') },
  { emoji: '🏛️', nome: t('Marcha dos Prefeitos 2027', "Mayors' March 2027", 'Marcha de los Alcaldes 2027'), periodo: t('16 a 20/5/2027 (a confirmar)', '16–20 May 2027 (to be confirmed)', '16 a 20/5/2027 (a confirmar)') }
];
// Tradutor de termos de cama (acordeão de quartos dos pacotes) e de "N pessoas".
const CAMAS_MAP = {
  en: [[/quadriliche com 4 camas tipo solteirão/g, 'quadruple bunk with 4 large single beds'], [/triliche \(1 casal \+ 2 solteiros\)/g, 'triple bunk (1 double + 2 singles)'], [/beliche de solteiro/g, 'single bunk bed'], [/beliche de casal/g, 'double bunk bed'], [/sofá-cama de casal/g, 'double sofa bed'], [/sofá-cama de solteiro/g, 'single sofa bed'], [/sofá-cama/g, 'sofa bed'], [/cama king/g, 'king bed'], [/cama box de solteiro/g, 'single bed'], [/cama de solteiro auxiliar/g, 'extra single bed'], [/cama auxiliar de solteiro/g, 'extra single bed'], [/cama de casal/g, 'double bed'], [/cama auxiliar/g, 'extra bed'], [/cama de solteiro/g, 'single bed']],
  es: [[/quadriliche com 4 camas tipo solteirão/g, 'litera cuádruple con 4 camas individuales grandes'], [/triliche \(1 casal \+ 2 solteiros\)/g, 'litera triple (1 doble + 2 individuales)'], [/beliche de solteiro/g, 'litera individual'], [/beliche de casal/g, 'litera doble'], [/sofá-cama de casal/g, 'sofá cama doble'], [/sofá-cama de solteiro/g, 'sofá cama individual'], [/sofá-cama/g, 'sofá cama'], [/cama king/g, 'cama king'], [/cama box de solteiro/g, 'cama individual'], [/cama de solteiro auxiliar/g, 'cama individual extra'], [/cama auxiliar de solteiro/g, 'cama individual extra'], [/cama de casal/g, 'cama doble'], [/cama auxiliar/g, 'cama extra'], [/cama de solteiro/g, 'cama individual']]
};
const tCamas = s => { if (LANG === 'pt') return s; let o = s; for (const [re, rep] of CAMAS_MAP[LANG]) o = o.replace(re, rep); return o; };
const nPessoas = s => LANG === 'pt' ? s : s.replace(/(\d+) pessoas/g, (m, n) => `${n} ${LANG === 'en' ? 'people' : 'personas'}`);

const CASAS_PACOTE = [
  {
    id: 'GD01H', nome: 'Casa Modernista', hospedes: 24, convidados: 80,
    local: 'SHIS QI 7, Conjunto 3, Lago Sul', pacote: 15400, limpeza: 1000,
    quartos: [
      ['Suíte Master (4 pessoas)', '1 cama king · 1 cama box de solteiro · 1 sofá-cama de casal'],
      ['Suíte da Sofia (5 pessoas)', '1 cama king · 1 cama box de solteiro · 1 beliche de solteiro'],
      ['Suíte do Pedro (5 pessoas)', '1 quadriliche com 4 camas tipo solteirão · 1 cama box de solteiro'],
      ['Suíte do Felipe (4 pessoas)', '1 cama de casal · 1 beliche de solteiro'],
      ['Suíte da Família (6 pessoas)', '1 cama de casal · 1 cama box de solteiro · 1 beliche de solteiro · 1 sofá-cama de casal']
    ]
  },
  {
    id: 'GI01I', nome: 'Casa Villela', hospedes: 15, convidados: 50,
    local: 'SMDB Conjunto 29, Lago Sul', pacote: 9800, limpeza: 800,
    quartos: [
      ['Flat do Lúcio Costa (6 pessoas)', '1 cama king · 1 triliche (1 casal + 2 solteiros) · 1 sofá-cama de solteiro'],
      ['Flat do Athos Bulcão (6 pessoas)', '1 cama king · 1 triliche (1 casal + 2 solteiros) · 1 sofá-cama de casal'],
      ['Sala (3 pessoas)', '3 sofás-cama de casal']
    ]
  },
  {
    id: 'GG04I', nome: 'Villa Kubitschek', hospedes: 21, convidados: 150,
    local: 'SMDB Conjunto 29, Lago Sul', pacote: 13600, limpeza: 1000,
    quartos: [
      ['Suíte do Amor (4 pessoas)', '1 cama de casal · 1 cama box de solteiro · 1 sofá-cama'],
      ['Flat dos Solteiros (7 pessoas)', '2 beliches de solteiro · 2 camas auxiliares · 1 sofá-cama de casal'],
      ['Suíte do Chef (5 pessoas)', '1 beliche de casal · 1 cama auxiliar · 1 sofá-cama de casal'],
      ['Suíte do Renato Russo (5 pessoas)', '1 beliche de casal · 1 cama auxiliar · 1 sofá-cama de casal']
    ]
  },
  {
    id: 'PL02I', nome: 'Villa Catetinho', hospedes: 21, convidados: 150,
    local: 'SMDB Conjunto 29, Lago Sul', pacote: 13600, limpeza: 1000,
    quartos: [
      ['Flat do Oscar (7 pessoas)', '1 cama de casal · 1 beliche de solteiro · 1 cama de solteiro auxiliar · 1 sofá-cama de casal · 1 cama box de solteiro'],
      ['Flat do Burle Marx (7 pessoas)', '1 cama de casal · 1 beliche de solteiro · 1 cama de solteiro auxiliar · 1 sofá-cama de casal'],
      ['Flat da Cassia Eller (7 pessoas)', '1 beliche de casal · 1 cama auxiliar de solteiro · 1 sofá-cama de casal']
    ]
  }
];

const chipsDatas = DATAS_PACOTE.map(d =>
  `<a class="chip-data" href="${d.emoji === '🇧🇷' ? L('/posse-2027.html') : waLink(t(`Olá! Quero reservar uma casa completa para ${d.nome} (${d.periodo}). Somos um grupo de ___ pessoas.`, `Hi! I'd like to book a whole house for ${d.nome} (${d.periodo}). We're a group of ___ people.`, `¡Hola! Quiero reservar una casa entera para ${d.nome} (${d.periodo}). Somos un grupo de ___ personas.`))}">${d.emoji} <strong>${esc(d.nome)}</strong><span>${esc(d.periodo)}</span></a>`).join('\n');

const cardsCasas = CASAS_PACOTE.map(c => {
  const l = porId[c.id];
  const porPessoa = Math.ceil(c.pacote / c.hospedes);
  const porDia = Math.ceil(porPessoa / 4);
  return `
<article class="casa-pacote">
  ${l ? img(l.fotoPrincipal, { alt: c.nome, width: 340, height: 280, sizes: '(max-width: 760px) 100vw, 340px' }) : '<img alt="" width="340" height="280">'}
  <div class="casa-pacote-corpo">
    <h3>${esc(c.nome)}</h3>
    <p class="casa-meta">🛌 ${t('até', 'up to', 'hasta')} ${c.hospedes} ${t('hóspedes', 'guests', 'huéspedes')} · 🕺 ${t('eventos para até', 'events for up to', 'eventos para hasta')} ${c.convidados} ${t('convidados', 'guests', 'invitados')} · 📍 ${esc(c.local)}</p>
    <div class="preco-bloco">
      <div class="preco-principal">${real(c.pacote)} <span>· ${t('pacote de 4 diárias com a casa completa', '4-night package with the whole house', 'paquete de 4 noches con la casa entera')}</span></div>
      <div class="preco-detalhe">${t(`Sai por ~<strong>${real(porPessoa)}</strong> por pessoa no total — cerca de <strong>${real(porDia)}/dia</strong>. Menos que uma diária de hotel simples nessas datas, com casa, piscina e cozinha inteiras para o seu grupo.`, `Comes to ~<strong>${real(porPessoa)}</strong> per person in total — about <strong>${real(porDia)}/day</strong>. Less than a basic hotel night on these dates, with a whole house, pool and kitchen for your group.`, `Sale por ~<strong>${real(porPessoa)}</strong> por persona en total — cerca de <strong>${real(porDia)}/día</strong>. Menos que una noche de hotel sencillo en estas fechas, con casa, piscina y cocina enteras para tu grupo.`)}</div>
      <div class="preco-composicao">${t(`Composição: R$ 150/dia por pessoa × 4 dias × ${c.hospedes} hóspedes + ${real(c.limpeza)} de taxa de limpeza`, `Breakdown: R$ 150/day per person × 4 days × ${c.hospedes} guests + ${real(c.limpeza)} cleaning fee`, `Composición: R$ 150/día por persona × 4 días × ${c.hospedes} huéspedes + ${real(c.limpeza)} de tarifa de limpieza`)}</div>
    </div>
    <details class="quartos">
      <summary>${t(`Ver a distribuição das camas (${c.quartos.length} acomodações)`, `See the bed layout (${c.quartos.length} rooms)`, `Ver la distribución de las camas (${c.quartos.length} habitaciones)`)}</summary>
      <ul>${c.quartos.map(q => `<li><strong>${esc(nPessoas(q[0]))}</strong><br>${esc(tCamas(q[1]))}</li>`).join('\n')}</ul>
    </details>
    <a class="btn btn-wa" href="${waLink(t(`Olá! Quero reservar a ${c.nome} completa em uma das datas especiais. Somos um grupo de ___ pessoas para a data: ___.`, `Hi! I'd like to book the whole ${c.nome} on one of the special dates. We're a group of ___ people for the date: ___.`, `¡Hola! Quiero reservar la ${c.nome} entera en una de las fechas especiales. Somos un grupo de ___ personas para la fecha: ___.`))}">${t('Reservar a', 'Book', 'Reservar la')} ${esc(c.nome)} →</a>
  </div>
</article>`;
}).join('\n');

const pacotes = layout(
  t('Pacotes para Natal, Réveillon, Posse, Carnaval e Marchas | Villela Stay', 'Packages for Christmas, New Year, Inauguration, Carnival & Marches | Villela Stay', 'Paquetes para Navidad, Fin de Año, Toma de Posesión, Carnaval y Marchas | Villela Stay'),
  t('Casas completas no Lago Sul para as datas mais disputadas de Brasília: Natal, Réveillon, Posse Presidencial, Carnaval e Marcha dos Prefeitos. A partir de R$ 150/dia por pessoa.', 'Whole houses in Lago Sul for Brasília\'s most sought-after dates: Christmas, New Year, Presidential Inauguration, Carnival and the Mayors\' March. From R$ 150/day per person.', 'Casas enteras en Lago Sul para las fechas más solicitadas de Brasília: Navidad, Fin de Año, Toma de Posesión Presidencial, Carnaval y Marcha de los Alcaldes. Desde R$ 150/día por persona.'),
  `
<section class="hero hero-menor">
  <h1>${t('As datas mais disputadas de Brasília.<br>As melhores casas do Lago Sul.', "Brasília's most sought-after dates.<br>The best houses in Lago Sul.", 'Las fechas más solicitadas de Brasília.<br>Las mejores casas de Lago Sul.')}</h1>
  <p>${t('<strong>Natal, Réveillon, Posse Presidencial, Carnaval e as Marchas dos Prefeitos e dos Municípios:</strong> quando Brasília lota e os hotéis dobram de preço, grupos inteligentes reservam uma casa completa — e cada pessoa paga menos que uma diária de hotel.', '<strong>Christmas, New Year, the Presidential Inauguration, Carnival and the Mayors\' and Municipalities\' Marches:</strong> when Brasília fills up and hotels double their prices, smart groups book a whole house — and each person pays less than a hotel night.', '<strong>Navidad, Fin de Año, la Toma de Posesión Presidencial, el Carnaval y las Marchas de Alcaldes y Municipios:</strong> cuando Brasília se llena y los hoteles duplican sus precios, los grupos inteligentes reservan una casa entera — y cada persona paga menos que una noche de hotel.')}</p>
</section>
<div class="pacotes-wrap">

  <section class="venda-bloco">
    <h2 class="secao-titulo">${t('Escolha a sua data', 'Choose your date', 'Elige tu fecha')}</h2>
    <div class="chips-datas">${chipsDatas}</div>
  </section>

  <section class="venda-bloco como-funciona">
    <h2 class="secao-titulo">${t('Como funciona — simples e transparente', 'How it works — simple and transparent', 'Cómo funciona — simple y transparente')}</h2>
    <div class="passos">
      <div class="passo"><strong>${t('1. Junte o seu grupo', '1. Gather your group', '1. Reúne a tu grupo')}</strong><br>${t('Nessas datas trabalhamos com casas completas, de 15 a 24 hóspedes — família, amigos, caravana ou comitiva.', 'On these dates we work with whole houses, from 15 to 24 guests — family, friends, a caravan or a delegation.', 'En estas fechas trabajamos con casas enteras, de 15 a 24 huéspedes — familia, amigos, caravana o comitiva.')}</div>
      <div class="passo"><strong>${t('2. Cada um paga R$ 150 por dia', '2. Each person pays R$ 150 per day', '2. Cada uno paga R$ 150 por día')}</strong><br>${t('Diária por pessoa com a casa lotada + rateio da taxa de limpeza. Piscina aquecida, cozinha completa e área de lazer inclusas.', 'Per-person rate with the house at full capacity + a share of the cleaning fee. Heated pool, full kitchen and leisure area included.', 'Tarifa por persona con la casa llena + prorrateo de la tarifa de limpieza. Piscina climatizada, cocina completa y zona de ocio incluidas.')}</div>
      <div class="passo"><strong>${t('3. Reserve direto com o anfitrião', '3. Book directly with the host', '3. Reserva directo con el anfitrión')}</strong><br>${t('Sem taxas de plataforma, com atendimento personalizado de um Superhost premiado, do primeiro contato ao check-out.', 'No platform fees, with personalised service from an award-winning Superhost, from first contact to check-out.', 'Sin tarifas de plataforma, con atención personalizada de un Superhost premiado, desde el primer contacto hasta el check-out.')}</div>
    </div>
    <p class="aviso-escassez">⚠️ ${t('Temos <strong>apenas 4 casas disponíveis</strong> para cada período. Os pacotes de <strong>Natal e Réveillon</strong>, principalmente, costumam se esgotar rapidamente. Além disso, Brasília ficará pequena para os visitantes na virada do ano porque no dia <strong>1º de janeiro de 2027</strong> será a <strong>posse do novo Presidente do Brasil</strong>.', 'We have <strong>only 4 houses available</strong> for each period. The <strong>Christmas and New Year</strong> packages in particular tend to sell out quickly. On top of that, Brasília will be packed at the turn of the year because <strong>1 January 2027</strong> is the <strong>inauguration of Brazil\'s new President</strong>.', 'Tenemos <strong>solo 4 casas disponibles</strong> para cada período. Los paquetes de <strong>Navidad y Fin de Año</strong>, sobre todo, suelen agotarse rápido. Además, Brasília quedará pequeña para los visitantes en el cambio de año porque el <strong>1 de enero de 2027</strong> será la <strong>toma de posesión del nuevo Presidente de Brasil</strong>.')}</p>
  </section>

  <section class="venda-bloco">
    <h2 class="secao-titulo">${t('As 4 casas — pacotes de 4 diárias', 'The 4 houses — 4-night packages', 'Las 4 casas — paquetes de 4 noches')}</h2>
    <p class="pacote-cond">${t('Check-in às 14h do primeiro dia · check-out às 10h do último · período mínimo de 4 diárias nessas datas · convidado extra para evento ou day use: R$ 120/dia', 'Check-in at 2 PM on the first day · check-out at 10 AM on the last · minimum 4 nights on these dates · extra event or day-use guest: R$ 120/day', 'Check-in a las 14h del primer día · check-out a las 10h del último · mínimo de 4 noches en estas fechas · invitado extra para evento o day use: R$ 120/día')}</p>
    ${cardsCasas}
  </section>

  <section class="venda-bloco cta-final">
    <h2>${t('Garanta a sua data antes que feche', 'Secure your date before it\'s gone', 'Asegura tu fecha antes de que se agote')}</h2>
    <p>${t('Conte para a gente a data, o tamanho do grupo e a ocasião — respondemos com a proposta completa no WhatsApp.', 'Tell us the date, the size of your group and the occasion — we\'ll reply with a full proposal on WhatsApp.', 'Cuéntanos la fecha, el tamaño del grupo y la ocasión — respondemos con la propuesta completa por WhatsApp.')}</p>
    <a class="btn btn-wa btn-grande" href="${waLink(t('Olá! Quero garantir um pacote de data especial. Data: ___ | Nº de pessoas: ___ | Ocasião: ___', 'Hi! I\'d like to secure a special-date package. Date: ___ | Number of people: ___ | Occasion: ___', '¡Hola! Quiero asegurar un paquete de fecha especial. Fecha: ___ | Nº de personas: ___ | Ocasión: ___'))}">${t('Falar com o anfitrião agora', 'Talk to the host now', 'Hablar con el anfitrión ahora')}</a>
  </section>
</div>`,
  {
    caminho: '/pacotes.html',
    extraHead: `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: CASAS_PACOTE.map((c, i) => ({
        '@type': 'ListItem', position: i + 1,
        item: {
          '@type': 'Product',
          name: t(`Pacote de 4 diárias — ${c.nome}`, `4-night package — ${c.nome}`, `Paquete de 4 noches — ${c.nome}`),
          description: t(`Casa completa para até ${c.hospedes} hóspedes no Lago Sul, Brasília — Natal, Réveillon, Posse, Carnaval e Marchas.`, `Whole house for up to ${c.hospedes} guests in Lago Sul, Brasília — Christmas, New Year, Inauguration, Carnival and Marches.`, `Casa entera para hasta ${c.hospedes} huéspedes en Lago Sul, Brasília — Navidad, Fin de Año, Toma de Posesión, Carnaval y Marchas.`),
          image: porId[c.id] ? porId[c.id].fotoPrincipal : undefined,
          offers: { '@type': 'Offer', price: c.pacote, priceCurrency: 'BRL', availability: 'https://schema.org/InStock', url: `${SITE_URL}${L('/pacotes.html')}` }
        }
      }))
    })}</script>`
  }
);
fs.writeFileSync(path.join(od, 'pacotes.html'), pacotes);

// ------------------------- regras da casa -------------------------
const REGRAS = [
  [t('1. Idade Mínima', '1. Minimum Age', '1. Edad Mínima'), t(`<p>A locação é permitida apenas para maiores de 18 anos.</p><p>Menores devem estar acompanhados pelos pais ou responsáveis legais.</p>`, `<p>Rental is only allowed for guests over 18.</p><p>Minors must be accompanied by their parents or legal guardians.</p>`, `<p>El alquiler solo se permite para mayores de 18 años.</p><p>Los menores deben estar acompañados por sus padres o tutores legales.</p>`)],
  [t('2. Check-in e Check-out', '2. Check-in & Check-out', '2. Check-in y Check-out'), t(`<p><strong>Check-in:</strong> a partir das 14h · <strong>Check-out:</strong> até as 10h</p>
<p>⏳ Caso autorizado, o check-in antecipado ou check-out tardio dá acesso apenas ao quarto reservado, não às áreas comuns (piscina, churrasqueira, cozinha etc.), pois nossa equipe precisa de tempo para preparar a casa com todo o cuidado que você merece.</p>
<p>⚒ Durante sua estadia, poderão ocorrer serviços pontuais de manutenção para garantir a qualidade da hospedagem.</p>
<p>🧹 No dia do check-out, a equipe iniciará a limpeza das áreas externas a partir das 8h.</p>`, `<p><strong>Check-in:</strong> from 2 PM · <strong>Check-out:</strong> by 10 AM</p>
<p>⏳ If authorised, early check-in or late check-out gives access only to the booked room, not to the shared areas (pool, barbecue, kitchen, etc.), as our team needs time to prepare the house with all the care you deserve.</p>
<p>⚒ During your stay, occasional maintenance services may take place to ensure the quality of the stay.</p>
<p>🧹 On check-out day, the team will start cleaning the outdoor areas from 8 AM.</p>`, `<p><strong>Check-in:</strong> a partir de las 14h · <strong>Check-out:</strong> hasta las 10h</p>
<p>⏳ Si se autoriza, el early check-in o el late check-out da acceso solo a la habitación reservada, no a las zonas comunes (piscina, parrilla, cocina, etc.), porque nuestro equipo necesita tiempo para preparar la casa con todo el cuidado que mereces.</p>
<p>⚒ Durante tu estancia, pueden realizarse servicios puntuales de mantenimiento para garantizar la calidad del alojamiento.</p>
<p>🧹 El día del check-out, el equipo comenzará la limpieza de las zonas exteriores a partir de las 8h.</p>`)],
  [t('3. Itens de Consumo', '3. Consumables', '3. Artículos de Consumo'), t(`<p>Cada hóspede deve trazer seus itens de uso pessoal: alimentos, bebidas, carvão, fósforo, gás, papel higiênico extra, produtos de higiene, repelente e materiais de limpeza.</p>
<p>Os itens oferecidos (na cozinha, churrasqueira e banheiros) são cortesia inicial; se acabarem, a reposição será de responsabilidade do hóspede.</p>`, `<p>Each guest should bring their personal items: food, drinks, charcoal, matches, gas, extra toilet paper, toiletries, insect repellent and cleaning supplies.</p>
<p>The items provided (in the kitchen, barbecue and bathrooms) are a starter courtesy; if they run out, restocking is the guest's responsibility.</p>`, `<p>Cada huésped debe traer sus artículos de uso personal: alimentos, bebidas, carbón, fósforos, gas, papel higiénico extra, productos de higiene, repelente y artículos de limpieza.</p>
<p>Los artículos ofrecidos (en la cocina, parrilla y baños) son una cortesía inicial; si se acaban, la reposición es responsabilidad del huésped.</p>`)],
  [t('4. Fumar 🚭', '4. Smoking 🚭', '4. Fumar 🚭'), t(`<p>Proibido fumar em áreas internas (quartos e banheiros).</p><p>Nas áreas externas é permitido, desde que se use cinzeiro.</p>`, `<p>Smoking is not allowed in indoor areas (bedrooms and bathrooms).</p><p>It is allowed in outdoor areas, provided an ashtray is used.</p>`, `<p>Está prohibido fumar en áreas internas (habitaciones y baños).</p><p>En las áreas exteriores está permitido, siempre que se use un cenicero.</p>`)],
  [t('5. Animais de Estimação 🐾', '5. Pets 🐾', '5. Mascotas 🐾'), t(`<p>Pets são bem-vindos! Mas:</p><ul><li>Não devem subir em camas, sofás ou móveis.</li><li>Qualquer dano causado será de responsabilidade do hóspede.</li></ul>`, `<p>Pets are welcome! But:</p><ul><li>They must not climb on beds, sofas or furniture.</li><li>Any damage caused is the guest's responsibility.</li></ul>`, `<p>¡Las mascotas son bienvenidas! Pero:</p><ul><li>No deben subir a camas, sofás o muebles.</li><li>Cualquier daño causado es responsabilidad del huésped.</li></ul>`)],
  [t('6. Eventos e Convidados 🎉', '6. Events & Guests 🎉', '6. Eventos e Invitados 🎉'), t(`<p>Não são permitidos eventos comerciais, festas abertas, sublocação ou cobrança de ingresso.</p>
<p>Eventos familiares só com autorização prévia e mediante taxa.</p>
<ul><li>Convidado day-use/evento: R$ 100,00</li><li>Hóspede extra pernoite: R$ 120,00/dia</li></ul>
<p>⚠️ <strong>Importante:</strong> a casa é destinada principalmente a hospedagens. Eventos autorizados não incluem garantias quanto a clima, fornecimento de energia ou funcionamento de equipamentos alugados.</p>`, `<p>Commercial events, open parties, subletting or charging admission are not allowed.</p>
<p>Family events only with prior authorisation and a fee.</p>
<ul><li>Day-use/event guest: R$ 100.00</li><li>Extra overnight guest: R$ 120.00/day</li></ul>
<p>⚠️ <strong>Important:</strong> the house is intended mainly for stays. Authorised events do not include guarantees regarding weather, power supply or the operation of rented equipment.</p>`, `<p>No se permiten eventos comerciales, fiestas abiertas, subarriendo ni cobro de entrada.</p>
<p>Los eventos familiares solo con autorización previa y mediante tarifa.</p>
<ul><li>Invitado day-use/evento: R$ 100,00</li><li>Huésped extra por noche: R$ 120,00/día</li></ul>
<p>⚠️ <strong>Importante:</strong> la casa está destinada principalmente al alojamiento. Los eventos autorizados no incluyen garantías sobre el clima, el suministro de energía o el funcionamiento de equipos alquilados.</p>`)],
  [t('7. Som e Lei do Silêncio 🔊', '7. Noise & Quiet Hours 🔊', '7. Sonido y Ley del Silencio 🔊'), t(`<p>Proibido: som alto, DJs, bandas ao vivo ou caixas potentes.</p>
<p>Limite de ruído:</p><ul><li>até 55 dB (7h às 22h)</li><li>até 45 dB (22h às 7h)</li></ul>
<p>Qualquer solicitação de redução deve ser atendida imediatamente.</p>`, `<p>Not allowed: loud sound, DJs, live bands or powerful speakers.</p>
<p>Noise limit:</p><ul><li>up to 55 dB (7 AM–10 PM)</li><li>up to 45 dB (10 PM–7 AM)</li></ul>
<p>Any request to lower the noise must be met immediately.</p>`, `<p>Prohibido: sonido alto, DJ, bandas en vivo o altavoces potentes.</p>
<p>Límite de ruido:</p><ul><li>hasta 55 dB (7h a 22h)</li><li>hasta 45 dB (22h a 7h)</li></ul>
<p>Cualquier solicitud de reducción debe atenderse de inmediato.</p>`)],
  [t('8. Normas do Condomínio', '8. Condominium Rules', '8. Normas del Condominio'), t(`<p>Todos os hóspedes devem cumprir as regras do condomínio.</p><p>O hóspede principal receberá o controle do portão e deve mantê-lo sempre fechado.</p>`, `<p>All guests must comply with the condominium rules.</p><p>The main guest will receive the gate remote and must keep it closed at all times.</p>`, `<p>Todos los huéspedes deben cumplir las normas del condominio.</p><p>El huésped principal recibirá el control del portón y debe mantenerlo siempre cerrado.</p>`)],
  [t('9. Jacuzzi, Spa ou Hidro 🛁', '9. Jacuzzi, Spa or Hot Tub 🛁', '9. Jacuzzi, Spa o Hidromasaje 🛁'), t(`<p><strong>No aluguel do espaço inteiro</strong>, o uso da jacuzzi está incluído, sem taxa: 1 vez ao dia, por até 4 horas.</p>
<p><strong>Nas hospedagens de quartos, suítes e flats</strong>, o uso é mediante solicitação prévia e taxa de R$ 200,00 (1 vez ao dia, por até 4 horas).</p>`, `<p><strong>With the whole-house rental</strong>, use of the jacuzzi is included, free of charge: once a day, for up to 4 hours.</p>
<p><strong>For room, suite and flat stays</strong>, use is upon prior request and a fee of R$ 200.00 (once a day, for up to 4 hours).</p>`, `<p><strong>Con el alquiler de la casa entera</strong>, el uso del jacuzzi está incluido, sin tarifa: 1 vez al día, por hasta 4 horas.</p>
<p><strong>En las estancias de habitaciones, suites y flats</strong>, el uso es mediante solicitud previa y una tarifa de R$ 200,00 (1 vez al día, por hasta 4 horas).</p>`)],
  [t('10. Lavanderia', '10. Laundry', '10. Lavandería'), t(`<p>Área de lavanderia do anfitrião não está disponível.</p><p>Uma lava e seca será disponibilizada na cozinha para uso dos hóspedes.</p>`, `<p>The host's laundry area is not available.</p><p>A washer-dryer is provided in the kitchen for guests' use.</p>`, `<p>El área de lavandería del anfitrión no está disponible.</p><p>Se proporciona una lavadora-secadora en la cocina para uso de los huéspedes.</p>`)],
  [t('11. Louça e Lixo 🍽️', '11. Dishes & Rubbish 🍽️', '11. Vajilla y Basura 🍽️'), t(`<p>A louça deve ser lavada antes do check-out.</p><p>Perecíveis devem ser descartados e o lixo colocado em sacos para recolhimento.</p>`, `<p>Dishes must be washed before check-out.</p><p>Perishables must be discarded and rubbish bagged for collection.</p>`, `<p>La vajilla debe lavarse antes del check-out.</p><p>Los perecederos deben desecharse y la basura colocarse en bolsas para su recogida.</p>`)],
  [t('12. Multas por Descumprimento ⚠️', '12. Penalties for Non-Compliance ⚠️', '12. Multas por Incumplimiento ⚠️'), t(`<p>Quebra de regra: multa de 1 diária por ocorrência.</p>
<p>Check-in/out fora do horário:</p><ul><li>até 8h de atraso → ½ diária</li><li>acima de 8h → 1 diária</li></ul>
<p>Se outro hóspede for prejudicado, o responsável deverá arcar com o ressarcimento integral da hospedagem afetada.</p>`, `<p>Breaking a rule: a penalty of 1 night's rate per occurrence.</p>
<p>Check-in/out outside the agreed time:</p><ul><li>up to 8 hours late → ½ night</li><li>over 8 hours → 1 night</li></ul>
<p>If another guest is affected, the responsible party must fully reimburse the affected stay.</p>`, `<p>Romper una norma: multa de 1 noche por incidencia.</p>
<p>Check-in/out fuera del horario:</p><ul><li>hasta 8h de retraso → ½ noche</li><li>más de 8h → 1 noche</li></ul>
<p>Si otro huésped resulta perjudicado, el responsable deberá cubrir el reembolso íntegro de la estancia afectada.</p>`)],
  [t('13. Taxas Adicionais 💰', '13. Additional Fees 💰', '13. Tarifas Adicionales 💰'), t(`<ul>
<li>Hóspede extra: R$ 120,00/noite</li>
<li>Convidado day-use/evento: R$ 100,00</li>
<li>Jacuzzi: R$ 200,00 — apenas nas hospedagens de quarto, suíte ou flat (1x ao dia, até 4h); incluída sem custo no aluguel do espaço inteiro</li>
<li>Churrasqueira: R$ 200,00</li>
<li>Copo/prato quebrado: R$ 20,00/unidade</li>
<li>Gás extra: R$ 140,00</li>
<li>Limpeza extra piscina: R$ 150,00</li>
<li>Papel higiênico adicional: R$ 10,00/pessoa</li>
<li>Ar-condicionado ligado sem necessidade: R$ 50,00</li>
<li>Uso excessivo de energia: R$ 100,00</li>
<li>Material de limpeza extra: R$ 100,00</li>
</ul>`, `<ul>
<li>Extra guest: R$ 120.00/night</li>
<li>Day-use/event guest: R$ 100.00</li>
<li>Jacuzzi: R$ 200.00 — only for room, suite or flat stays (once a day, up to 4h); included free with the whole-house rental</li>
<li>Barbecue: R$ 200.00</li>
<li>Broken glass/plate: R$ 20.00/unit</li>
<li>Extra gas: R$ 140.00</li>
<li>Extra pool cleaning: R$ 150.00</li>
<li>Additional toilet paper: R$ 10.00/person</li>
<li>Air conditioning left on unnecessarily: R$ 50.00</li>
<li>Excessive energy use: R$ 100.00</li>
<li>Extra cleaning supplies: R$ 100.00</li>
</ul>`, `<ul>
<li>Huésped extra: R$ 120,00/noche</li>
<li>Invitado day-use/evento: R$ 100,00</li>
<li>Jacuzzi: R$ 200,00 — solo en estancias de habitación, suite o flat (1x al día, hasta 4h); incluido sin costo en el alquiler de la casa entera</li>
<li>Parrilla: R$ 200,00</li>
<li>Vaso/plato roto: R$ 20,00/unidad</li>
<li>Gas extra: R$ 140,00</li>
<li>Limpieza extra de piscina: R$ 150,00</li>
<li>Papel higiénico adicional: R$ 10,00/persona</li>
<li>Aire acondicionado encendido sin necesidad: R$ 50,00</li>
<li>Uso excesivo de energía: R$ 100,00</li>
<li>Material de limpieza extra: R$ 100,00</li>
</ul>`)],
  [t('14. Falhas Externas', '14. External Failures', '14. Fallos Externos'), t(`<p>Não nos responsabilizamos por interrupções de água, energia ou fenômenos naturais.</p>`, `<p>We are not responsible for interruptions to water, power or natural phenomena.</p>`, `<p>No nos responsabilizamos por interrupciones de agua, energía o fenómenos naturales.</p>`)],
  [t('15. Danos e Objetos Perdidos', '15. Damage & Lost Property', '15. Daños y Objetos Perdidos'), t(`<p>Danos por mau uso → custo de reposição será cobrado.</p><p>Objetos esquecidos não são de nossa responsabilidade.</p>`, `<p>Damage from misuse → the replacement cost will be charged.</p><p>Forgotten items are not our responsibility.</p>`, `<p>Daños por mal uso → se cobrará el costo de reposición.</p><p>Los objetos olvidados no son de nuestra responsabilidad.</p>`)],
  [t('16. Responsabilidade', '16. Responsibility', '16. Responsabilidad'), t(`<p>O hóspede principal é responsável por todos os ocupantes e convidados durante a estadia.</p>`, `<p>The main guest is responsible for all occupants and guests during the stay.</p>`, `<p>El huésped principal es responsable de todos los ocupantes e invitados durante la estancia.</p>`)],
  [t('17. Manutenção', '17. Maintenance', '17. Mantenimiento'), t(`<p>A casa recebe manutenção constante.</p><p>Reparos imediatos fora do horário comercial podem não ser possíveis.</p>`, `<p>The house receives constant maintenance.</p><p>Immediate repairs outside business hours may not be possible.</p>`, `<p>La casa recibe mantenimiento constante.</p><p>Las reparaciones inmediatas fuera del horario comercial pueden no ser posibles.</p>`)],
  [t('18. Indisponibilidade Pontual', '18. Occasional Unavailability', '18. Indisponibilidad Puntual'), t(`<p>A casa oferece muitas comodidades, mas falhas isoladas (como ar-condicionado, jacuzzi ou eletrodomésticos) não geram reembolso ou cancelamento.</p>`, `<p>The house offers many amenities, but isolated failures (such as air conditioning, jacuzzi or appliances) do not entitle you to a refund or cancellation.</p>`, `<p>La casa ofrece muchas comodidades, pero los fallos aislados (como aire acondicionado, jacuzzi o electrodomésticos) no dan derecho a reembolso o cancelación.</p>`)]
];

const regras = layout(
  t('Regras da Casa | Villela Stay', 'House Rules | Villela Stay', 'Normas de la Casa | Villela Stay'),
  t('Regras da casa da Villela Stay: check-in e check-out, pets, som, convidados, taxas adicionais e responsabilidades — tudo para uma estadia tranquila.', 'Villela Stay house rules: check-in and check-out, pets, noise, guests, additional fees and responsibilities — everything for a smooth stay.', 'Normas de la casa de Villela Stay: check-in y check-out, mascotas, ruido, invitados, tarifas adicionales y responsabilidades — todo para una estancia tranquila.'),
  `
<section class="hero hero-menor">
  <h1>🌿 ${t('Regras da Casa', 'House Rules', 'Normas de la Casa')} – Villela Stay</h1>
  <p>${t('Bem-vindo(a)! Para garantir que sua estadia seja confortável, segura e agradável, pedimos a gentileza de observar as seguintes regras:', 'Welcome! To make your stay comfortable, safe and pleasant, we kindly ask you to observe the following rules:', '¡Bienvenido(a)! Para que tu estancia sea cómoda, segura y agradable, te pedimos amablemente que observes las siguientes normas:')}</p>
</section>
<div class="regras-wrap">
  ${REGRAS.map(r => `<section class="regra"><h2>${r[0]}</h2>${r[1]}</section>`).join('\n')}
  <p class="regras-aceite">✅ ${t('Ao reservar, você confirma estar de acordo com estas regras, que existem para proteger sua experiência e garantir o bem-estar de todos.', 'By booking, you confirm that you agree to these rules, which exist to protect your experience and ensure everyone\'s well-being.', 'Al reservar, confirmas que estás de acuerdo con estas normas, que existen para proteger tu experiencia y garantizar el bienestar de todos.')}</p>
</div>`,
  {
    caminho: '/regras.html',
    extraHead: `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: REGRAS.map(r => ({
        '@type': 'Question',
        name: r[0].replace(/^\d+\.\s*/, ''),
        acceptedAnswer: { '@type': 'Answer', text: r[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
      }))
    })}</script>`
  }
);
fs.writeFileSync(path.join(od, 'regras.html'), regras);

// ------------------------- FAQ (perguntas frequentes) -------------------------
const FAQ_SECOES = [
  ['Reserva e pagamento', [
    ['Como faço para reservar?', `Fale com a gente pelo WhatsApp ou pelo site. Confirmamos a disponibilidade, enviamos a cotação e reservamos a sua data. Para grupos e eventos, montamos uma proposta sob medida.`],
    ['Posso conhecer/visitar a casa antes de reservar?', `Pode, sim — é só <strong>agendar uma visita</strong> com a gente. Combinamos um horário e mostramos o espaço para você confirmar se atende ao seu grupo ou evento.`],
    ['Quais as formas de pagamento?', `Aceitamos <strong>PIX</strong> e <strong>cartão de crédito</strong> — à vista ou parcelado. Os encargos do cartão de crédito, tanto à vista quanto parcelado, ficam por conta do locatário. O PIX costuma ser o caminho mais rápido para garantir a data.`],
    ['Preciso pagar um sinal para segurar a data?', `Sim. Pedimos um <strong>sinal de 50%</strong> para confirmar a reserva; os outros <strong>50%</strong> são pagos <strong>uma semana antes do check-in</strong>.`],
    ['Posso reservar direto com vocês, fora do Airbnb/Booking?', `Pode, sim. Trabalhamos com reserva direta e contrato próprio para hospedagem por temporada e para eventos — vários hóspedes preferem assim.`],
    ['Tem contrato?', `Tem. Para temporada e para eventos emitimos um contrato com os dados do hóspede, o período e as condições combinadas, enviado para você conferir e assinar antes da estadia.`],
    ['Qual é a política de cancelamento?', `O <strong>sinal não é reembolsável</strong>. Em caso de desistência com <strong>mais de 60 dias</strong> de antecedência do check-in, devolvemos os demais pagamentos já feitos (tudo, menos o sinal). <strong>Dentro dos 60 dias</strong>, as diárias pagas e não usufruídas podem ser utilizadas em até <strong>6 meses</strong> após a data originalmente prevista para o check-in — desde que a nova data esteja disponível e não seja data especial (Natal, Ano Novo, Carnaval, Marcha dos Prefeitos) nem período com pacote especial.`]
  ]],
  ['Check-in e check-out', [
    ['Qual o horário de check-in e check-out?', `Check-in a partir das <strong>14h</strong> e check-out até as <strong>10h</strong>.`],
    ['Posso fazer early check-in ou late check-out?', `Sempre que a agenda da casa permitir. O <strong>early check-in é cobrado como diária cheia</strong> e o <strong>late check-out também é cobrado como diária cheia</strong> (a casa fica indisponível para o próximo hóspede naquele dia). Combine com antecedência.`],
    ['Como funciona o acesso à casa? Tem chave, senha?', `No dia, enviamos as instruções de acesso (chave, fechadura ou senha, conforme a unidade) e como abrir o portão. Acompanhamos a sua chegada — qualquer dúvida, é só chamar.`],
    ['Qual é o endereço?', `O endereço completo, com ponto de referência, vai junto com as instruções de check-in, após a confirmação da reserva. Temos dois endereços: a <strong>Casa Modernista</strong> (SHIS QI 7, Conjunto 3) e as <strong>demais casas</strong> (compound SMDB Conjunto 29, Lote 2), ambos no Lago Sul, Brasília-DF.`]
  ]],
  ['A casa: comodidades e capacidade', [
    ['Como vejo fotos e detalhes de cada casa?', `Cada unidade tem página própria no site, com fotos, comodidades, capacidade e consulta de disponibilidade. Se preferir, enviamos fotos e o link pelo WhatsApp — é só dizer a casa e a data.`],
    ['Quantas pessoas cabem em cada acomodação?', `Temos de suíte privativa a casa inteira para grupos grandes:<table class="faq-tabela"><thead><tr><th>Unidade</th><th>Capacidade</th></tr></thead><tbody><tr><td>Grand Villela (espaço inteiro)</td><td>até 32 pessoas</td></tr><tr><td>Casa Modernista</td><td>até 22</td></tr><tr><td>Villa Catetinho</td><td>até 21</td></tr><tr><td>Villa Kubitschek</td><td>até 16</td></tr><tr><td>Casa Villela</td><td>até 15</td></tr><tr><td>Flat da Família / Flat dos Amigos</td><td>até 10 cada</td></tr><tr><td>Flat do Oscar</td><td>até 6</td></tr><tr><td>Suítes e quartos individuais</td><td>3 a 7 conforme a unidade</td></tr><tr><td>Jardim dos Sentidos (casal)</td><td>até 2</td></tr></tbody></table>Conte quantas pessoas vão e a ocasião que indicamos a unidade ideal.`],
    ['E se for mais gente do que o combinado? Tem taxa de hóspede extra?', `Sim. Cada <strong>hóspede extra</strong> (ou acompanhante eventual) que pernoita, além do número contratado, tem taxa de <strong>R$ 120 por dia</strong>. Sempre nos diga o número real de pessoas. Para participantes de evento/day use que não pernoitam, vale a regra de <strong>convidado</strong>: R$ 100 por convidado.`],
    ['Tem Wi-Fi?', `Sim, todas as unidades têm Wi-Fi. A rede e a senha são enviadas junto com as instruções de check-in.`],
    ['A piscina é aquecida?', `Sim, <strong>todas as casas têm piscina aquecida</strong>. O aquecimento e a temperatura podem ser regulados — no check-in mostramos como ajustar.`],
    ['A piscina é segura para crianças? Tem parte rasa?', `As piscinas <strong>não têm parte rasa</strong> (profundidade única), por isso pedimos <strong>atenção redobrada e supervisão constante de um adulto</strong> com as crianças na área da piscina.`],
    ['Tem spa / jacuzzi?', `Sim, <strong>todas as casas têm SPA</strong>. No aluguel do <strong>espaço inteiro</strong>, o uso está incluído. No aluguel de <strong>quartos e flats</strong>, fica disponível mediante taxa.`],
    ['Tem churrasqueira?', `Sim, <strong>todas as casas têm churrasqueira</strong>. No aluguel de quartos e flats, pode ser utilizada mediante taxa.`],
    ['Tem ar-condicionado?', `Sim, <strong>todas as acomodações têm ar-condicionado</strong>.`],
    ['Aluguei um quarto ou um flat — posso usar a piscina, a churrasqueira e a cozinha?', `No aluguel de quarto ou flat, o que está incluído é a sua unidade privativa. As áreas comuns (piscina, churrasqueira e cozinha) ficam disponíveis mediante as respectivas taxas. No aluguel do espaço inteiro, você tem tudo isso incluso.`],
    ['A cozinha é equipada?', `Sim, cozinha completa — fogão, geladeira, micro-ondas e utensílios. O uso pontual da cozinha (café da manhã, lanches) é permitido. Já no caso de preparações de almoço e jantar — em que a cozinha precisa ser limpa por uma diarista — é cobrada uma taxa equivalente à diária da profissional, pois essa despesa não é coberta pelas nossas tarifas reduzidas.`],
    ['Roupa de cama e banho estão inclusas?', `Sim, fornecemos roupa de cama e toalhas, padrão de hotel.`],
    ['Tem estacionamento / garagem?', `Sim. Todas as casas têm estacionamento amplo dentro da propriedade. A exceção é a Casa Modernista, que tem 3 vagas internas e mais vagas externas na rua.`],
    ['Aceitam pets?', `Sim, sob consulta e com taxa adicional (higienização). Antes de reservar, nos conte o porte e a quantidade de animais.`],
    ['Pode levar crianças?', `Sim, recebemos famílias com crianças — várias casas são ótimas para isso.`],
    ['Pode fumar dentro da casa?', `Não. É proibido fumar em ambientes internos. Quem fuma pode usar as áreas externas/abertas.`]
  ]],
  ['Localização', [
    ['Onde fica a Villela Stay?', `No Lago Sul, um dos endereços mais nobres de Brasília, à beira do Lago Paranoá — bairro tranquilo, verde e seguro.`],
    ['Quais as distâncias?', `Temos dois endereços: a Casa Modernista (SHIS QI 7) e as demais casas (compound SMDB Conjunto 29).<table class="faq-tabela"><thead><tr><th>Destino</th><th>Casa Modernista</th><th>Demais casas</th></tr></thead><tbody><tr><td>Aeroporto JK</td><td>7 km · ~10 min</td><td>25 km · ~25 min</td></tr><tr><td>Esplanada dos Ministérios</td><td>8 km · ~10 min</td><td>10 km · ~10 min</td></tr><tr><td>Pontão do Lago Sul</td><td>5 km · ~10 min</td><td>8 km · ~10 min</td></tr><tr><td>Shoppings da região</td><td>10 km · ~15 min</td><td>10 km · ~15 min</td></tr></tbody></table>`],
    ['Como é o clima? Esquenta ou esfria muito?', `Brasília tem clima seco. As casas têm ar-condicionado, piscina aquecida e SPA para o seu conforto o ano todo. No inverno, as noites costumam ser mais frias — vale levar um agasalho leve.`]
  ]],
  ['Eventos e celebrações', [
    ['Vocês recebem eventos?', `Sim! Aniversários, festas infantis, casamentos, confraternizações, eventos corporativos e comemorações.`],
    ['Quantos convidados o espaço comporta?', `Depende da casa escolhida. Diga a data e o número de convidados que indicamos o espaço certo.`],
    ['Como é a cobrança de um evento?', `O modelo é: diária do espaço/hospedagem + taxa por convidado + taxa de limpeza do evento. A <strong>diária do espaço para eventos é proporcional ao número de convidados</strong>. A referência é <strong>R$ 100 por convidado</strong>, podendo ser mais ou menos dependendo das circunstâncias do ajuste. Além disso, cobramos taxa de limpeza a partir de <strong>R$ 800</strong> (varia conforme o porte).`],
    ['O que conta como "convidado"?', `Convidado é toda pessoa que não está na lista de hóspedes da reserva de hospedagem — vale para evento e day use. Se você contratar apenas o aluguel do espaço para o evento (sem hospedagem), todos os participantes contam como convidados.`],
    ['Posso fazer só o evento durante o dia (day use)?', `Sim. A cobrança segue o mesmo modelo (R$ 100 por convidado + taxa de limpeza) e o período é combinado. No day use, como não há hospedagem, todos os participantes contam como convidados.`],
    ['Pode ter som / música ao vivo / DJ?', `Pode, com respeito à vizinhança. Seguimos a Lei Distrital de Silêncio (Lei nº 4.092/2008): o som precisa ser controlado/reduzido a partir das <strong>22h e não deve ultrapassar 00h00</strong>. O horário de encerramento do evento é definido no contrato.`],
    ['Tem segurança / portaria?', `Não. O caseiro pode auxiliar com o portão para a entrada dos convidados mediante o pagamento de uma diária. Para os grandes eventos, sugerimos a contratação de segurança profissional, para a segurança de todos e a preservação do local.`],
    ['Posso levar meu buffet, decoração e fornecedores?', `Sim, você pode trazer seus fornecedores próprios (buffet, decoração, som) — é só alinhar os horários de montagem e desmontagem. <strong>Prestamos serviços de buffet também</strong> — consulte-nos para conferir a disponibilidade.`]
  ]],
  ['Operação, limpeza e suporte', [
    ['A limpeza está inclusa?', `A casa é entregue limpa e arrumada, padrão de hotel. A taxa de limpeza <strong>não inclui a limpeza durante a hospedagem</strong> — apenas a limpeza anterior e posterior à estadia. Se precisar de limpeza ou de cozinheira durante a estadia, podemos indicar uma pessoa.`],
    ['Tem café da manhã?', `O café da manhã é opcional — pode ser contratado à parte. As casas têm cozinha equipada para você preparar suas refeições.`],
    ['Tem serviços extras?', `Sim, sob consulta: transfer/translado, chef/cozinheiro(a), camareira/passadeira durante a estadia e decoração/estrutura para eventos.`],
    ['Quem eu chamo se precisar de algo durante a estadia?', `Você fala pelo WhatsApp, direto com o anfitrião. Para questões na casa, o caseiro dá apoio local. Estamos à disposição do check-in ao check-out.`],
    ['Tem alguém no local durante a estadia? Vocês moram lá?', `Moramos na propriedade e contamos com o caseiro para apoio no condomínio durante a sua hospedagem — você tem privacidade total na sua unidade e, ao mesmo tempo, suporte por perto e por WhatsApp a qualquer hora.`]
  ]]
];
// --- helpers e geração das páginas FAQ (PT/EN/ES) ---
const FAQ_STYLE = `<style>.faq-q{margin:18px 0 4px;font-size:1.06rem;color:var(--petroleo,#0c3644)}.faq-a{margin:0 0 6px;line-height:1.6}.faq-a p{margin:0 0 8px}.faq-langs{margin:14px 0 0;font-size:.95rem}.faq-tabela{width:100%;border-collapse:collapse;margin:10px 0;font-size:.92rem}.faq-tabela th,.faq-tabela td{border:1px solid rgba(0,0,0,.12);padding:6px 9px;text-align:left}.faq-tabela th{background:rgba(12,54,68,.06)}</style>`;
const FAQ_HREFLANG = `<link rel="alternate" hreflang="pt-BR" href="${SITE_URL}/faq.html"><link rel="alternate" hreflang="en" href="${SITE_URL}/faq-en.html"><link rel="alternate" hreflang="es" href="${SITE_URL}/faq-es.html"><link rel="alternate" hreflang="x-default" href="${SITE_URL}/faq.html">`;
function faqSchema(secoes) {
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: secoes.flatMap(s => s[1]).map(it => ({
      '@type': 'Question', name: it[0],
      acceptedAnswer: { '@type': 'Answer', text: it[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
    }))
  })}</script>`;
}
function renderFaqPage(o) {
  // A troca de idioma e o hreflang vêm do cabeçalho/layout (seletor global).
  return layout(o.titulo, o.descricao, `
<section class="hero hero-menor">
  <h1>${esc(o.h1)}</h1>
  <p>${o.intro}</p>
</section>
<div class="regras-wrap faq-wrap">
  ${o.secoes.map(s => `<section class="regra"><h2>${esc(s[0])}</h2>${s[1].map(it => `<h3 class="faq-q">${esc(it[0])}</h3><div class="faq-a">${it[1]}</div>`).join('\n')}</section>`).join('\n')}
  <p class="regras-aceite">${o.rodape}</p>
</div>`, { caminho: o.caminho, extraHead: FAQ_STYLE + faqSchema(o.secoes) });
}

const FAQ_SECOES_EN = [
  ['Booking & payment', [
    ['How do I make a booking?', `Just message us on WhatsApp or use the website. We confirm availability, send a quote and hold your dates. For groups and events, we put together a tailor-made proposal.`],
    ['Can I visit the house before booking?', `Yes — just <strong>schedule a visit</strong> with us. We agree on a time and show you the space so you can confirm it suits your group or event.`],
    ['What payment methods do you accept?', `We accept <strong>PIX</strong> (instant Brazilian transfer) and <strong>credit card</strong> — in full or in installments. Credit-card charges, whether paid in full or in installments, are the guest's responsibility. PIX is usually the fastest way to secure your dates.`],
    ['Do I need to pay a deposit to hold the dates?', `Yes. We ask for a <strong>50% deposit</strong> to confirm the booking; the remaining <strong>50%</strong> is paid <strong>one week before check-in</strong>.`],
    ['Can I book directly with you, outside Airbnb/Booking?', `Yes. We work with direct bookings and our own contract, for both seasonal stays and events.`],
    ['Is there a contract?', `Yes. For seasonal stays and events we issue a contract with the guest's details, the dates and the agreed conditions, sent for you to review and sign before the stay.`],
    ['What is the cancellation policy?', `The <strong>deposit is non-refundable</strong>. If you cancel <strong>more than 60 days</strong> before check-in, we refund any other payments made (everything except the deposit). <strong>Within 60 days</strong>, nights already paid and not used may be credited for up to <strong>6 months</strong> after the originally booked check-in date — provided the new date is available and is not a special date (Christmas, New Year, Carnival, Marcha dos Prefeitos) or a period with a special package.`]
  ]],
  ['Check-in & check-out', [
    ['What are the check-in and check-out times?', `Check-in from <strong>2 PM</strong> and check-out by <strong>10 AM</strong>.`],
    ['Can I do an early check-in or late check-out?', `Whenever the house's schedule allows. <strong>Early check-in is charged as a full night</strong> and <strong>late check-out is also charged as a full night</strong> (the house is unavailable for the next guest that day). Please arrange it in advance.`],
    ['How do I get into the house? Is there a key or code?', `On the day, we send the access instructions (key, smart lock or door code, depending on the unit) and how to open the gate. We follow your arrival — just message us if anything comes up.`],
    ['What is the address?', `The full address, with a landmark, is sent with the check-in instructions, after the booking is confirmed. We have two addresses: <strong>Casa Modernista</strong> (SHIS QI 7, Conjunto 3) and the <strong>other houses</strong> (SMDB Conjunto 29, Lote 2 compound), both in Lago Sul, Brasília.`]
  ]],
  ['The house: amenities & capacity', [
    ['How can I see photos and details of each house?', `Each unit has its own page on the website, with photos, amenities, capacity and an availability check. If you prefer, we send photos and the link on WhatsApp — just tell us the house and the dates.`],
    ['How many people fit in each property?', `We range from a private suite to an entire house for large groups:<table class="faq-tabela"><thead><tr><th>Unit</th><th>Capacity</th></tr></thead><tbody><tr><td>Grand Villela (entire house)</td><td>up to 32 people</td></tr><tr><td>Casa Modernista</td><td>up to 22</td></tr><tr><td>Villa Catetinho</td><td>up to 21</td></tr><tr><td>Villa Kubitschek</td><td>up to 16</td></tr><tr><td>Casa Villela</td><td>up to 15</td></tr><tr><td>Flat da Família / Flat dos Amigos</td><td>up to 10 each</td></tr><tr><td>Flat do Oscar</td><td>up to 6</td></tr><tr><td>Suites and single rooms</td><td>3 to 7 depending on the unit</td></tr><tr><td>Jardim dos Sentidos (couple)</td><td>up to 2</td></tr></tbody></table>Tell us how many people are coming and the occasion, and we recommend the ideal unit.`],
    ['What if there are more people than agreed? Is there an extra-guest fee?', `Yes. Each <strong>extra guest</strong> staying overnight beyond the contracted number is <strong>R$ 120 per day</strong>. Always tell us the real number of people. For event/day-use attendees who do not stay overnight, the <strong>guest</strong> rule applies: R$ 100 per guest.`],
    ['Is there Wi-Fi?', `Yes, all units have Wi-Fi. The network and password are sent with the check-in instructions.`],
    ['Is the pool heated?', `Yes, <strong>all houses have a heated pool</strong>. The heating and temperature can be adjusted — at check-in we show you how.`],
    ['Is the pool safe for children? Is there a shallow area?', `The pools have <strong>no shallow area</strong> (single depth), so we ask for <strong>extra care and constant adult supervision</strong> with children around the pool.`],
    ['Is there a spa / jacuzzi?', `Yes, <strong>all houses have a spa</strong>. With the <strong>whole-house</strong> rental it is included. With <strong>rooms and flats</strong>, it is available for a fee.`],
    ['Is there a barbecue?', `Yes, <strong>all houses have a barbecue</strong>. With room and flat rentals it can be used for a fee.`],
    ['Is there air conditioning?', `Yes, <strong>all accommodations have air conditioning</strong>.`],
    ['I rented a room or flat — can I use the pool, barbecue and kitchen?', `With a room or flat rental, what is included is your private unit. The shared areas (pool, barbecue and kitchen) are available for the respective fees. With the whole-house rental, all of this is included.`],
    ['Is the kitchen equipped?', `Yes, a full kitchen — stove, fridge, microwave and utensils. Occasional use of the kitchen (breakfast, snacks) is allowed. For lunch and dinner cooking — which requires the kitchen to be cleaned by a cleaner — a fee equal to the cleaner's daily rate applies, as this is not covered by our reduced rates.`],
    ['Are bed linen and towels included?', `Yes, we provide bed linen and towels, hotel standard.`],
    ['Is there parking?', `Yes. All houses have ample parking inside the property. The exception is Casa Modernista, with 3 internal spaces plus street parking.`],
    ['Do you accept pets?', `Yes, on request and with an extra (sanitizing) fee. Before booking, tell us the size and number of animals.`],
    ['Can I bring children?', `Yes, we welcome families with children — several houses are great for that.`],
    ['Can I smoke inside the house?', `No. Smoking is not allowed indoors. Smokers may use the outdoor/open areas.`]
  ]],
  ['Location', [
    ['Where is Villela Stay?', `In Lago Sul, one of Brasília's most prestigious neighborhoods, by Lake Paranoá — quiet, green and safe.`],
    ['What are the distances?', `We have two addresses: Casa Modernista (SHIS QI 7) and the other houses (SMDB Conjunto 29 compound).<table class="faq-tabela"><thead><tr><th>Destination</th><th>Casa Modernista</th><th>Other houses</th></tr></thead><tbody><tr><td>JK Airport</td><td>7 km · ~10 min</td><td>25 km · ~25 min</td></tr><tr><td>Esplanada dos Ministérios</td><td>8 km · ~10 min</td><td>10 km · ~10 min</td></tr><tr><td>Pontão do Lago Sul</td><td>5 km · ~10 min</td><td>8 km · ~10 min</td></tr><tr><td>Shopping malls</td><td>10 km · ~15 min</td><td>10 km · ~15 min</td></tr></tbody></table>`],
    ['What is the weather like?', `Brasília has a dry climate. The houses have air conditioning, a heated pool and a spa for your comfort year-round. In winter, nights are colder — bring a light jacket.`]
  ]],
  ['Events & celebrations', [
    ['Do you host events?', `Yes! Birthdays, kids' parties, weddings, get-togethers, corporate events and celebrations.`],
    ['How many guests does the space hold?', `It depends on the house. Tell us the date and the number of guests and we recommend the right space.`],
    ['How is an event priced?', `The model is: venue/accommodation rate + per-guest fee + event cleaning fee. The <strong>venue rate for events is proportional to the number of guests</strong>. The reference is <strong>R$ 100 per guest</strong>, which may be more or less depending on the circumstances. We also charge a cleaning fee from <strong>R$ 800</strong> (varies with size).`],
    ['What counts as a "guest"?', `A guest is anyone not on the accommodation booking's guest list — for both events and day use. If you rent only the venue for the event (without accommodation), all attendees count as guests.`],
    ['Can I do a daytime event only (day use)?', `Yes. Pricing follows the same model (R$ 100 per guest + cleaning fee) and the time slot is agreed. For day use, since there is no accommodation, all attendees count as guests.`],
    ['Can I have sound / live music / a DJ?', `Yes, with respect for the neighbors. We follow the local Noise Law (Lei nº 4.092/2008): sound must be <strong>turned down from 10 PM and must not go past midnight</strong>. The event's closing time is set in the contract.`],
    ['Is there security / a doorman?', `No. The caretaker can help with the gate for guests' entry for a daily fee. For large events, we recommend hiring professional security, for everyone's safety and to protect the venue.`],
    ['Can I bring my own caterer, décor and suppliers?', `Yes, you can bring your own suppliers (catering, décor, sound) — just align the setup and teardown times. <strong>We also provide catering services</strong> — ask us about availability.`]
  ]],
  ['Operations, cleaning & support', [
    ['Is cleaning included?', `The house is delivered clean and tidy, hotel standard. The cleaning fee <strong>does not include cleaning during the stay</strong> — only the cleaning before and after. If you need cleaning or a cook during the stay, we can recommend someone.`],
    ['Is breakfast included?', `Breakfast is optional — it can be arranged separately. The houses have an equipped kitchen for you to prepare your meals.`],
    ['Are there extra services?', `Yes, on request: transfer, private chef/cook, housekeeping/ironing during the stay, and décor/structure for events.`],
    ['Who do I contact if I need anything during the stay?', `You talk via WhatsApp, directly with the host. For anything in the house, the caretaker provides local support. We are available from check-in to check-out.`],
    ['Is anyone on site during the stay? Do you live there?', `We live on the property and have a caretaker for support in the compound during your stay — you have full privacy in your unit and, at the same time, support nearby and on WhatsApp at any time.`]
  ]]
];

const FAQ_SECOES_ES = [
  ['Reserva y pago', [
    ['¿Cómo hago una reserva?', `Escríbenos por WhatsApp o usa el sitio. Confirmamos la disponibilidad, enviamos el presupuesto y reservamos tus fechas. Para grupos y eventos, preparamos una propuesta a medida.`],
    ['¿Puedo conocer/visitar la casa antes de reservar?', `Sí — solo <strong>agenda una visita</strong> con nosotros. Acordamos un horario y te mostramos el espacio para que confirmes si se ajusta a tu grupo o evento.`],
    ['¿Qué formas de pago aceptan?', `Aceptamos <strong>PIX</strong> (transferencia instantánea brasileña) y <strong>tarjeta de crédito</strong> — al contado o en cuotas. Los cargos de la tarjeta de crédito, tanto al contado como en cuotas, corren por cuenta del inquilino. El PIX suele ser la forma más rápida de asegurar tus fechas.`],
    ['¿Necesito pagar una seña para reservar la fecha?', `Sí. Pedimos una <strong>seña del 50%</strong> para confirmar la reserva; el otro <strong>50%</strong> se paga <strong>una semana antes del check-in</strong>.`],
    ['¿Puedo reservar directamente con ustedes, fuera de Airbnb/Booking?', `Sí. Trabajamos con reservas directas y contrato propio, para estancias por temporada y para eventos.`],
    ['¿Hay contrato?', `Sí. Para temporada y eventos emitimos un contrato con los datos del huésped, las fechas y las condiciones acordadas, enviado para que lo revises y firmes antes de la estancia.`],
    ['¿Cuál es la política de cancelación?', `La <strong>seña no es reembolsable</strong>. Si cancelas con <strong>más de 60 días</strong> de antelación al check-in, devolvemos los demás pagos realizados (todo, menos la seña). <strong>Dentro de los 60 días</strong>, las noches pagadas y no disfrutadas pueden usarse hasta <strong>6 meses</strong> después de la fecha de check-in originalmente prevista — siempre que la nueva fecha esté disponible y no sea fecha especial (Navidad, Año Nuevo, Carnaval, Marcha dos Prefeitos) ni un período con paquete especial.`]
  ]],
  ['Check-in y check-out', [
    ['¿Cuál es el horario de check-in y check-out?', `Check-in a partir de las <strong>14h</strong> y check-out hasta las <strong>10h</strong>.`],
    ['¿Puedo hacer early check-in o late check-out?', `Siempre que la agenda de la casa lo permita. El <strong>early check-in se cobra como una diaria completa</strong> y el <strong>late check-out también se cobra como una diaria completa</strong> (la casa queda no disponible para el siguiente huésped ese día). Coordínalo con antelación.`],
    ['¿Cómo se accede a la casa? ¿Hay llave o clave?', `El día de llegada enviamos las instrucciones de acceso (llave, cerradura digital o clave de la puerta, según la unidad) y cómo abrir el portón. Acompañamos tu llegada — escríbenos ante cualquier duda.`],
    ['¿Cuál es la dirección?', `La dirección completa, con punto de referencia, se envía con las instrucciones de check-in, tras la confirmación de la reserva. Tenemos dos direcciones: <strong>Casa Modernista</strong> (SHIS QI 7, Conjunto 3) y las <strong>demás casas</strong> (compound SMDB Conjunto 29, Lote 2), ambas en Lago Sul, Brasília.`]
  ]],
  ['La casa: comodidades y capacidad', [
    ['¿Cómo veo fotos y detalles de cada casa?', `Cada unidad tiene su propia página en el sitio, con fotos, comodidades, capacidad y consulta de disponibilidad. Si prefieres, te enviamos fotos y el enlace por WhatsApp — solo dinos la casa y las fechas.`],
    ['¿Cuántas personas caben en cada alojamiento?', `Tenemos desde una suite privada hasta una casa entera para grupos grandes:<table class="faq-tabela"><thead><tr><th>Unidad</th><th>Capacidad</th></tr></thead><tbody><tr><td>Grand Villela (casa entera)</td><td>hasta 32 personas</td></tr><tr><td>Casa Modernista</td><td>hasta 22</td></tr><tr><td>Villa Catetinho</td><td>hasta 21</td></tr><tr><td>Villa Kubitschek</td><td>hasta 16</td></tr><tr><td>Casa Villela</td><td>hasta 15</td></tr><tr><td>Flat da Família / Flat dos Amigos</td><td>hasta 10 c/u</td></tr><tr><td>Flat do Oscar</td><td>hasta 6</td></tr><tr><td>Suites y habitaciones individuales</td><td>3 a 7 según la unidad</td></tr><tr><td>Jardim dos Sentidos (pareja)</td><td>hasta 2</td></tr></tbody></table>Dinos cuántas personas van y la ocasión, y te recomendamos la unidad ideal.`],
    ['¿Y si va más gente de la acordada? ¿Hay tarifa por huésped extra?', `Sí. Cada <strong>huésped extra</strong> que pernocta, además del número contratado, tiene una tarifa de <strong>R$ 120 por día</strong>. Dinos siempre el número real de personas. Para asistentes de evento/day use que no pernoctan, aplica la regla de <strong>invitado</strong>: R$ 100 por invitado.`],
    ['¿Hay Wi-Fi?', `Sí, todas las unidades tienen Wi-Fi. La red y la contraseña se envían con las instrucciones de check-in.`],
    ['¿La piscina es climatizada?', `Sí, <strong>todas las casas tienen piscina climatizada</strong>. La calefacción y la temperatura se pueden regular — en el check-in te mostramos cómo.`],
    ['¿La piscina es segura para niños? ¿Tiene parte poco profunda?', `Las piscinas <strong>no tienen parte poco profunda</strong> (profundidad única), por eso pedimos <strong>atención redoblada y supervisión constante de un adulto</strong> con los niños en la zona de la piscina.`],
    ['¿Hay spa / jacuzzi?', `Sí, <strong>todas las casas tienen spa</strong>. Con el alquiler de la <strong>casa entera</strong> está incluido. Con <strong>habitaciones y flats</strong>, está disponible mediante tarifa.`],
    ['¿Hay parrilla?', `Sí, <strong>todas las casas tienen parrilla</strong>. Con el alquiler de habitaciones y flats puede usarse mediante tarifa.`],
    ['¿Hay aire acondicionado?', `Sí, <strong>todos los alojamientos tienen aire acondicionado</strong>.`],
    ['Alquilé una habitación o un flat — ¿puedo usar la piscina, la parrilla y la cocina?', `Con el alquiler de habitación o flat, lo incluido es tu unidad privada. Las zonas comunes (piscina, parrilla y cocina) están disponibles mediante las respectivas tarifas. Con el alquiler de la casa entera, todo esto está incluido.`],
    ['¿La cocina está equipada?', `Sí, cocina completa — cocina, nevera, microondas y utensilios. El uso puntual de la cocina (desayuno, meriendas) está permitido. Para preparar almuerzo y cena — que requiere que la cocina la limpie una persona de limpieza — se cobra una tarifa equivalente a la diaria de la profesional, ya que ese gasto no está cubierto por nuestras tarifas reducidas.`],
    ['¿La ropa de cama y las toallas están incluidas?', `Sí, proporcionamos ropa de cama y toallas, estándar de hotel.`],
    ['¿Hay estacionamiento?', `Sí. Todas las casas tienen amplio estacionamiento dentro de la propiedad. La excepción es la Casa Modernista, con 3 plazas internas y plazas adicionales en la calle.`],
    ['¿Aceptan mascotas?', `Sí, a consultar y con una tarifa adicional (higienización). Antes de reservar, dinos el tamaño y la cantidad de animales.`],
    ['¿Puedo llevar niños?', `Sí, recibimos familias con niños — varias casas son ideales para eso.`],
    ['¿Se puede fumar dentro de la casa?', `No. Está prohibido fumar en ambientes internos. Quien fuma puede usar las zonas exteriores/abiertas.`]
  ]],
  ['Ubicación', [
    ['¿Dónde está Villela Stay?', `En Lago Sul, uno de los barrios más exclusivos de Brasília, junto al Lago Paranoá — tranquilo, verde y seguro.`],
    ['¿Cuáles son las distancias?', `Tenemos dos direcciones: Casa Modernista (SHIS QI 7) y las demás casas (compound SMDB Conjunto 29).<table class="faq-tabela"><thead><tr><th>Destino</th><th>Casa Modernista</th><th>Demás casas</th></tr></thead><tbody><tr><td>Aeropuerto JK</td><td>7 km · ~10 min</td><td>25 km · ~25 min</td></tr><tr><td>Esplanada dos Ministérios</td><td>8 km · ~10 min</td><td>10 km · ~10 min</td></tr><tr><td>Pontão do Lago Sul</td><td>5 km · ~10 min</td><td>8 km · ~10 min</td></tr><tr><td>Centros comerciales</td><td>10 km · ~15 min</td><td>10 km · ~15 min</td></tr></tbody></table>`],
    ['¿Cómo es el clima?', `Brasília tiene clima seco. Las casas tienen aire acondicionado, piscina climatizada y spa para tu confort todo el año. En invierno, las noches son más frías — conviene llevar un abrigo ligero.`]
  ]],
  ['Eventos y celebraciones', [
    ['¿Reciben eventos?', `¡Sí! Cumpleaños, fiestas infantiles, bodas, encuentros, eventos corporativos y celebraciones.`],
    ['¿Cuántos invitados caben en el espacio?', `Depende de la casa. Dinos la fecha y el número de invitados y te recomendamos el espacio adecuado.`],
    ['¿Cómo se cobra un evento?', `El modelo es: diaria del espacio/alojamiento + tarifa por invitado + tarifa de limpieza del evento. La <strong>diaria del espacio para eventos es proporcional al número de invitados</strong>. La referencia es <strong>R$ 100 por invitado</strong>, pudiendo ser más o menos según las circunstancias. Además, cobramos una tarifa de limpieza desde <strong>R$ 800</strong> (varía según el tamaño).`],
    ['¿Qué cuenta como "invitado"?', `Invitado es toda persona que no está en la lista de huéspedes de la reserva de alojamiento — vale para evento y day use. Si contratas solo el alquiler del espacio para el evento (sin alojamiento), todos los asistentes cuentan como invitados.`],
    ['¿Puedo hacer solo el evento de día (day use)?', `Sí. El cobro sigue el mismo modelo (R$ 100 por invitado + tarifa de limpieza) y el horario se acuerda. En el day use, como no hay alojamiento, todos los asistentes cuentan como invitados.`],
    ['¿Puede haber sonido / música en vivo / DJ?', `Sí, con respeto al vecindario. Seguimos la Ley Distrital del Silencio (Ley nº 4.092/2008): el sonido debe <strong>reducirse a partir de las 22h y no debe pasar de las 00h00</strong>. El horario de cierre del evento se define en el contrato.`],
    ['¿Hay seguridad / portería?', `No. El casero puede ayudar con el portón para la entrada de los invitados mediante el pago de una diaria. Para los grandes eventos, sugerimos contratar seguridad profesional, para la seguridad de todos y la preservación del lugar.`],
    ['¿Puedo llevar mi catering, decoración y proveedores?', `Sí, puedes traer tus propios proveedores (catering, decoración, sonido) — solo coordina los horarios de montaje y desmontaje. <strong>También prestamos servicios de catering</strong> — consúltanos la disponibilidad.`]
  ]],
  ['Operación, limpieza y soporte', [
    ['¿La limpieza está incluida?', `La casa se entrega limpia y ordenada, estándar de hotel. La tarifa de limpieza <strong>no incluye la limpieza durante la estancia</strong> — solo la limpieza anterior y posterior. Si necesitas limpieza o cocinera durante la estancia, podemos recomendarte a alguien.`],
    ['¿Hay desayuno?', `El desayuno es opcional — puede contratarse aparte. Las casas tienen cocina equipada para que prepares tus comidas.`],
    ['¿Hay servicios extra?', `Sí, a consultar: transfer/traslado, chef/cocinero(a), camarera/planchado durante la estancia y decoración/estructura para eventos.`],
    ['¿A quién llamo si necesito algo durante la estancia?', `Hablas por WhatsApp, directamente con el anfitrión. Para cuestiones en la casa, el casero da apoyo local. Estamos a disposición del check-in al check-out.`],
    ['¿Hay alguien en el lugar durante la estancia? ¿Viven ahí?', `Vivimos en la propiedad y contamos con el casero para apoyo en el condominio durante tu estancia — tienes privacidad total en tu unidad y, al mismo tiempo, apoyo cerca y por WhatsApp a cualquier hora.`]
  ]]
];

const faqSec = LANG === 'en' ? FAQ_SECOES_EN : (LANG === 'es' ? FAQ_SECOES_ES : FAQ_SECOES);
fs.writeFileSync(path.join(od, 'faq.html'), renderFaqPage({
  caminho: '/faq.html',
  titulo: t('Perguntas Frequentes (FAQ) | Villela Stay', 'Frequently Asked Questions (FAQ) | Villela Stay', 'Preguntas Frecuentes (FAQ) | Villela Stay'),
  descricao: t('Dúvidas frequentes sobre hospedagem e eventos na Villela Stay, no Lago Sul de Brasília: reserva, pagamento, check-in, comodidades, piscina, pets, eventos e mais.', 'Frequently asked questions about stays and events at Villela Stay, in Lago Sul, Brasília: booking, payment, check-in, amenities, pool, pets, events and more.', 'Preguntas frecuentes sobre estancias y eventos en Villela Stay, en Lago Sul, Brasília: reserva, pago, check-in, comodidades, piscina, mascotas, eventos y más.'),
  h1: t('Perguntas Frequentes', 'Frequently Asked Questions', 'Preguntas Frecuentes'),
  intro: t(`Tudo o que você precisa para reservar, se hospedar ou fazer um evento na Villela Stay, no Lago Sul de Brasília. Não encontrou sua dúvida? <a href="${waLink('Olá! Tenho uma dúvida que não encontrei no FAQ do site.')}">Fale com a gente no WhatsApp</a>.`, `Everything you need to book, stay or host an event at Villela Stay, in Lago Sul, Brasília. Didn't find your question? <a href="${waLink('Hi! I have a question I could not find in the website FAQ.')}">Message us on WhatsApp</a>.`, `Todo lo que necesitas para reservar, hospedarte o hacer un evento en Villela Stay, en Lago Sul, Brasília. ¿No encontraste tu duda? <a href="${waLink('¡Hola! Tengo una duda que no encontré en las preguntas frecuentes del sitio.')}">Escríbenos por WhatsApp</a>.`),
  rodape: t(`Estas são as informações oficiais da Villela Stay. Para uma proposta personalizada, <a href="${waLink('Olá! Vim pelo FAQ do site e quero uma cotação.')}">fale com o anfitrião no WhatsApp</a>.`, `These are Villela Stay's official answers. For a tailored proposal, <a href="${waLink('Hi! I came from the website FAQ and would like a quote.')}">talk to the host on WhatsApp</a>.`, `Estas son las respuestas oficiales de Villela Stay. Para una propuesta personalizada, <a href="${waLink('¡Hola! Vengo de las preguntas frecuentes del sitio y quiero una cotización.')}">habla con el anfitrión por WhatsApp</a>.`),
  secoes: faqSec
}));
console.log(`FAQ gerado (${LANG})`);

// ------------------------- guia do hóspede -------------------------
const guia = layout(
  t('Guia do Hóspede | Villela Stay', 'Guest Guide | Villela Stay', 'Guía del Huésped | Villela Stay'),
  t('Tudo para a sua estadia na Villela Stay: chegada, funcionamento da casa, dicas de Brasília, emergências e canal direto com o anfitrião.', 'Everything for your stay at Villela Stay: arrival, how the house works, Brasília tips, emergencies and a direct line to the host.', 'Todo para tu estancia en Villela Stay: llegada, cómo funciona la casa, consejos de Brasília, emergencias y línea directa con el anfitrión.'),
  `
<section class="hero hero-menor">
  <h1>${t('Guia do Hóspede', 'Guest Guide', 'Guía del Huésped')}</h1>
  <p>${t('Bem-vindo(a) à Villela Stay! Aqui está tudo que você precisa para aproveitar a estadia — da chegada ao check-out.', "Welcome to Villela Stay! Here's everything you need to enjoy your stay — from arrival to check-out.", '¡Bienvenido(a) a Villela Stay! Aquí tienes todo lo que necesitas para disfrutar tu estancia — desde la llegada hasta el check-out.')}</p>
</section>
<div class="regras-wrap">

  <section class="regra"><h2>🔑 ${t('Sua chegada', 'Your arrival', 'Tu llegada')}</h2>
    <p><strong>${t('Check-in a partir das 14h.', 'Check-in from 2 PM.', 'Check-in a partir de las 14h.')}</strong> ${t('As instruções de acesso (endereço exato, portão e chaves/senha) são enviadas pelo WhatsApp antes da sua chegada.', 'The access instructions (exact address, gate and keys/code) are sent by WhatsApp before your arrival.', 'Las instrucciones de acceso (dirección exacta, portón y llaves/clave) se envían por WhatsApp antes de tu llegada.')}</p>
    <p>${t(`Preencha o <a href="${L('/pre-checkin.html')}"><strong>check-in on-line</strong></a> para agilizar tudo — leva 2 minutos.`, `Fill in the <a href="${L('/pre-checkin.html')}"><strong>online check-in</strong></a> to speed everything up — it takes 2 minutes.`, `Completa el <a href="${L('/pre-checkin.html')}"><strong>check-in en línea</strong></a> para agilizar todo — toma 2 minutos.`)}</p>
  </section>

  <section class="regra"><h2>🏡 ${t('Como a casa funciona', 'How the house works', 'Cómo funciona la casa')}</h2>
    <ul>
      <li><strong>${t('Cozinha:', 'Kitchen:', 'Cocina:')}</strong> ${t('equipada com utensílios, gás e detergente para começar.', 'equipped with utensils, gas and detergent to get started.', 'equipada con utensilios, gas y detergente para empezar.')}</li>
      <li><strong>${t('Churrasqueira:', 'Barbecue:', 'Parrilla:')}</strong> ${t(`a gás e a carvão (traga seu carvão; uso mediante taxa — consulte as <a href="${L('/regras.html')}">Regras</a>).`, `gas and charcoal (bring your charcoal; use for a fee — see the <a href="${L('/regras.html')}">Rules</a>).`, `a gas y a carbón (trae tu carbón; uso mediante tarifa — consulta las <a href="${L('/regras.html')}">Normas</a>).`)}</li>
      <li><strong>${t('Lava e seca:', 'Washer-dryer:', 'Lavadora-secadora:')}</strong> ${t('disponível na cozinha para uso dos hóspedes.', 'available in the kitchen for guests\' use.', 'disponible en la cocina para uso de los huéspedes.')}</li>
      <li><strong>${t('Piscina:', 'Pool:', 'Piscina:')}</strong> ${t('aproveite! Crianças sempre com supervisão de um adulto.', 'enjoy! Children always with adult supervision.', '¡disfruta! Niños siempre con supervisión de un adulto.')}</li>
      <li><strong>${t('Jacuzzi/spa:', 'Jacuzzi/spa:', 'Jacuzzi/spa:')}</strong> ${t('no aluguel do espaço inteiro, o uso da jacuzzi é permitido uma vez por dia durante 4 horas independentemente do pagamento de taxa.', 'with the whole-house rental, the jacuzzi may be used once a day for 4 hours at no extra charge.', 'con el alquiler de la casa entera, el jacuzzi puede usarse una vez al día durante 4 horas sin costo adicional.')}</li>
      <li><strong>${t('Lixo:', 'Rubbish:', 'Basura:')}</strong> ${t('ensacar e deixar no ponto de coleta indicado.', 'bag it and leave it at the indicated collection point.', 'embolsarla y dejarla en el punto de recogida indicado.')}</li>
      <li><strong>${t('Silêncio:', 'Noise:', 'Ruido:')}</strong> ${t('som moderado sempre; após as 22h, volume reduzido (regra do condomínio).', 'moderate sound at all times; after 10 PM, reduced volume (condominium rule).', 'sonido moderado siempre; después de las 22h, volumen reducido (norma del condominio).')}</li>
    </ul>
  </section>

  <section class="regra"><h2>🗺️ ${t('O melhor de Brasília pertinho de você', 'The best of Brasília right next to you', 'Lo mejor de Brasília muy cerca de ti')}</h2>
    <ul>
      <li><strong>Pontão do Lago Sul</strong> — ${t('restaurantes e pôr do sol à beira do lago (5-10 min)', 'restaurants and sunsets by the lake (5–10 min)', 'restaurantes y atardeceres a orillas del lago (5-10 min)')}</li>
      <li><strong>Ermida Dom Bosco</strong> — ${t('o pôr do sol mais bonito da cidade', 'the most beautiful sunset in the city', 'el atardecer más bonito de la ciudad')}</li>
      <li><strong>${t('Esplanada dos Ministérios, Congresso e Catedral', 'Esplanada dos Ministérios, Congress and Cathedral', 'Esplanada dos Ministérios, Congreso y Catedral')}</strong> — ${t('o cartão-postal (15 min)', 'the postcard view (15 min)', 'la postal (15 min)')}</li>
      <li><strong>${t('Torre de TV e Feira da Torre', 'TV Tower and Tower Fair', 'Torre de TV y Feria de la Torre')}</strong> — ${t('artesanato e gastronomia local', 'local crafts and food', 'artesanía y gastronomía local')}</li>
      <li><strong>Parque da Cidade</strong> — ${t('para correr, pedalar e piquenique', 'for running, cycling and picnics', 'para correr, pedalear y picnic')}</li>
      <li><strong>Memorial JK</strong> — ${t('a história do fundador de Brasília', 'the story of the founder of Brasília', 'la historia del fundador de Brasília')}</li>
    </ul>
    <p>${t('Quer reservas em restaurantes, passeios ou transfer? Fale com o anfitrião — temos as melhores indicações.', 'Want restaurant reservations, tours or a transfer? Talk to the host — we have the best recommendations.', '¿Quieres reservas en restaurantes, paseos o transfer? Habla con el anfitrión — tenemos las mejores recomendaciones.')}</p>
  </section>

  <section class="regra"><h2>🆘 ${t('Emergências', 'Emergencies', 'Emergencias')}</h2>
    <p>${t('SAMU', 'Ambulance (SAMU)', 'Ambulancia (SAMU)')}: <strong>192</strong> · ${t('Bombeiros', 'Fire', 'Bomberos')}: <strong>193</strong> · ${t('Polícia', 'Police', 'Policía')}: <strong>190</strong></p>
    <p>${t('Anfitrião (WhatsApp 24h):', 'Host (WhatsApp 24/7):', 'Anfitrión (WhatsApp 24h):')} <a href="${waLink(t('Olá! Sou hóspede e preciso de ajuda.', "Hi! I'm a guest and I need help.", '¡Hola! Soy huésped y necesito ayuda.'))}"><strong>+55 61 9193-5013</strong></a></p>
  </section>

  <section class="regra"><h2>👋 Check-out</h2>
    <p><strong>${t('Até as 10h.', 'By 10 AM.', 'Hasta las 10h.')}</strong> ${t('Antes de sair: favor desligar os aparelhos de ar-condicionado, lavar a louça, descartar os perecíveis, ensacar o lixo e deixar as chaves na fechadura dos quartos e o controle na sinuca ou na casa do caseiro. A equipe inicia a limpeza externa às 8h.', 'Before you leave: please turn off the air conditioning units, wash the dishes, discard perishables, bag the rubbish and leave the keys in the bedroom locks and the gate remote on the pool table or at the caretaker\'s house. The team starts the outdoor cleaning at 8 AM.', 'Antes de salir: por favor apaga los aparatos de aire acondicionado, lava la vajilla, desecha los perecederos, embolsa la basura y deja las llaves en la cerradura de las habitaciones y el control en la mesa de billar o en la casa del casero. El equipo comienza la limpieza exterior a las 8h.')}</p>
  </section>

  <section class="regra"><h2>🔧 ${t('Algo não está funcionando?', 'Something not working?', '¿Algo no funciona?')}</h2>
    <p>${t('Conte para a gente que resolvemos o quanto antes:', "Let us know and we'll fix it as soon as possible:", 'Cuéntanos y lo resolvemos lo antes posible:')}</p>
    <form id="form-chamado" class="form-evento" style="margin-top:10px">
      <label>${t('Seu nome*', 'Your name*', 'Tu nombre*')} <input name="nome" required></label>
      <label>${t('Casa/unidade em que está hospedado', "House/unit where you're staying", 'Casa/unidad donde te alojas')} <input name="hospedagem"></label>
      <label>${t('O que aconteceu?*', 'What happened?*', '¿Qué pasó?*')} <textarea name="descricao" rows="3" required></textarea></label>
      <button class="btn" type="submit">${t('Enviar chamado', 'Send request', 'Enviar solicitud')}</button>
      <p class="form-status" hidden></p>
    </form>
  </section>
</div>
<script>
document.getElementById('form-chamado').addEventListener('submit', function(e){
  e.preventDefault();
  var f = e.target, st = f.querySelector('.form-status');
  st.hidden = false; st.textContent = ${JSON.stringify(t('Enviando...', 'Sending...', 'Enviando...'))};
  fetch('${BACKEND}/api/chamados', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: f.nome.value, hospedagem: f.hospedagem.value, descricao: f.descricao.value })
  }).then(function(r){
    st.textContent = r.ok ? ${JSON.stringify(t('✅ Chamado recebido! Vamos resolver o quanto antes.', "✅ Request received! We'll resolve it as soon as possible.", '✅ ¡Solicitud recibida! Lo resolveremos lo antes posible.'))} : ${JSON.stringify(t('Erro ao enviar — chame no WhatsApp.', 'Error sending — message us on WhatsApp.', 'Error al enviar — escríbenos por WhatsApp.'))};
    if (r.ok) f.reset();
  }).catch(function(){ st.textContent = ${JSON.stringify(t('Erro ao enviar — chame no WhatsApp.', 'Error sending — message us on WhatsApp.', 'Error al enviar — escríbenos por WhatsApp.'))}; });
});
</script>`,
  { caminho: '/guia.html' }
);
fs.writeFileSync(path.join(od, 'guia.html'), guia);

// ------------------------- pré-check-in -------------------------
const precheckin = layout(
  t('Check-in on-line | Villela Stay', 'Online check-in | Villela Stay', 'Check-in en línea | Villela Stay'),
  t('Adiante seu check-in na Villela Stay: preencha seus dados e chegue com tudo pronto.', 'Get a head start on your Villela Stay check-in: fill in your details and arrive with everything ready.', 'Adelanta tu check-in en Villela Stay: completa tus datos y llega con todo listo.'),
  `
<section class="hero hero-menor">
  <h1>${t('Check-in on-line', 'Online check-in', 'Check-in en línea')}</h1>
  <p>${t('Preencha antes de chegar e ganhe tempo: com seus dados em mãos, deixamos tudo pronto para receber você.', 'Fill it in before you arrive and save time: with your details on hand, we get everything ready to welcome you.', 'Complétalo antes de llegar y gana tiempo: con tus datos a mano, dejamos todo listo para recibirte.')}</p>
</section>
<div class="form-wrap">
  <form id="form-precheckin" class="form-evento">
    <label>${t('Nome completo*', 'Full name*', 'Nombre completo*')} <input name="nome" required></label>
    <label>WhatsApp* <input name="contato" required></label>
    <label>${t('E-mail', 'Email', 'Correo')} <input name="email" type="email"></label>
    <label>${t('Código da reserva (se souber)', 'Booking code (if you know it)', 'Código de reserva (si lo sabes)')} <input name="reserva" placeholder="${t('ex.: LR03J', 'e.g. LR03J', 'ej.: LR03J')}"></label>
    <label>${t('Casa/unidade reservada', 'House/unit booked', 'Casa/unidad reservada')} <input name="hospedagem" placeholder="${t('ex.: Casa Modernista', 'e.g. Casa Modernista', 'ej.: Casa Modernista')}"></label>
    <div style="display:flex;gap:12px">
      <label style="flex:1">${t('Data de chegada*', 'Arrival date*', 'Fecha de llegada*')} <input name="chegada" type="date" required></label>
      <label style="flex:1">${t('Data de saída', 'Departure date', 'Fecha de salida')} <input name="saida" type="date"></label>
    </div>
    <label>${t('Horário previsto de chegada', 'Estimated arrival time', 'Hora estimada de llegada')} <input name="horario" placeholder="${t('ex.: 15h', 'e.g. 3 PM', 'ej.: 15h')}"></label>
    <label>${t('Nº de adultos que vão se hospedar', 'Number of adults staying', 'Nº de adultos que se alojarán')} <input name="adultos" type="number" min="1"></label>
    <label>${t('Nº de crianças que vão se hospedar', 'Number of children staying', 'Nº de niños que se alojarán')} <input name="criancas" type="number" min="0"></label>
    <label>${t('Nº de Convidados para Evento ou Day Use', 'Number of guests for event or day use', 'Nº de invitados para evento o day use')} <input name="convidados" type="number" min="0"></label>
    <label>${t('Vai trazer pet? Qual?', 'Bringing a pet? Which?', '¿Traerás mascota? ¿Cuál?')} <input name="pets" placeholder="${t('ex.: 1 cachorro pequeno', 'e.g. 1 small dog', 'ej.: 1 perro pequeño')}"></label>
    <label>${t('Vai usar o estacionamento?', 'Will you use the parking?', '¿Usarás el estacionamiento?')} <select name="estacionamento" style="width:100%"><option value="">${t('Selecione', 'Select', 'Selecciona')}</option><option value="Sim">${t('Sim', 'Yes', 'Sí')}</option><option value="Não">${t('Não', 'No', 'No')}</option></select></label>
    <label>${t('Modelo e placa do veículo', 'Vehicle model and licence plate', 'Modelo y matrícula del vehículo')} <input name="veiculo" placeholder="${t('ex.: Honda Civic preto - ABC1D23', 'e.g. black Honda Civic - ABC1D23', 'ej.: Honda Civic negro - ABC1D23')}"></label>
    <label>${t('Motivo da viagem', 'Reason for the trip', 'Motivo del viaje')} <select name="motivo" id="pc-motivo" style="width:100%">
      <option value="">${t('Selecione (opcional)', 'Select (optional)', 'Selecciona (opcional)')}</option>
      <option value="Passeio">${t('Passeio', 'Leisure', 'Turismo')}</option>
      <option value="Trabalho">${t('Trabalho', 'Work', 'Trabajo')}</option>
      <option value="Evento na cidade">${t('Evento na cidade', 'Event in the city', 'Evento en la ciudad')}</option>
    </select></label>
    <label id="pc-evento-wrap" hidden>${t('Descreva o evento', 'Describe the event', 'Describe el evento')} <input name="evento" placeholder="${t('ex.: casamento, formatura, aniversário...', 'e.g. wedding, graduation, birthday...', 'ej.: boda, graduación, cumpleaños...')}"></label>
    <div style="display:flex;gap:12px">
      <label style="flex:1">${t('Origem', 'Coming from', 'Origen')} <input name="origem" placeholder="${t('de onde você vem', "where you're coming from", 'de dónde vienes')}"></label>
      <label style="flex:1">${t('Destino', 'Going to', 'Destino')} <input name="destino" placeholder="${t('para onde vai depois', "where you're going next", 'a dónde vas después')}"></label>
    </div>
    <label>${t('Observações (berço, restrições, ocasião especial...)', 'Notes (cot, restrictions, special occasion...)', 'Observaciones (cuna, restricciones, ocasión especial...)')} <textarea name="observacoes" rows="3"></textarea></label>
    <button class="btn" type="submit">${t('Enviar check-in on-line', 'Submit online check-in', 'Enviar check-in en línea')}</button>
    <p class="form-status" hidden></p>
  </form>
</div>
<script>
// Mostra o campo "Descreva o evento" só quando o motivo for Evento.
(function(){
  var m = document.getElementById('pc-motivo'), w = document.getElementById('pc-evento-wrap');
  if (m && w) m.addEventListener('change', function(){
    var ev = m.value === 'Evento na cidade';
    w.hidden = !ev;
    if (!ev) w.querySelector('input').value = '';
  });
})();
document.getElementById('form-precheckin').addEventListener('submit', function(e){
  e.preventDefault();
  var f = e.target, st = f.querySelector('.form-status');
  st.hidden = false; st.textContent = ${JSON.stringify(t('Enviando...', 'Sending...', 'Enviando...'))};
  var dados = {};
  ['nome','contato','email','reserva','hospedagem','chegada','saida','horario','adultos','criancas','convidados','pets','estacionamento','veiculo','motivo','evento','origem','destino','observacoes'].forEach(function(k){ dados[k] = f[k] ? f[k].value : ''; });
  fetch('${BACKEND}/api/precheckin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados)
  }).then(function(r){
    st.textContent = r.ok ? ${JSON.stringify(t('✅ Check-in on-line recebido! Até breve. 🏡', '✅ Online check-in received! See you soon. 🏡', '✅ ¡Check-in en línea recibido! Hasta pronto. 🏡'))} : ${JSON.stringify(t('Erro ao enviar — fale conosco pelo WhatsApp.', 'Error sending — contact us on WhatsApp.', 'Error al enviar — contáctanos por WhatsApp.'))};
    if (r.ok) f.reset();
  }).catch(function(){ st.textContent = ${JSON.stringify(t('Erro ao enviar — fale conosco pelo WhatsApp.', 'Error sending — contact us on WhatsApp.', 'Error al enviar — contáctanos por WhatsApp.'))}; });
});
</script>`,
  { caminho: '/pre-checkin.html' }
);
fs.writeFileSync(path.join(od, 'pre-checkin.html'), precheckin);

// ------------------------- landing pages por público -------------------------
LANDINGS = [
  {
    arquivo: 'formaturas.html', origem: 'site-formaturas',
    titulo: t('Formatura em Brasília — casa com piscina no Lago Sul | Villela Stay', 'Graduation party in Brasília — house with pool in Lago Sul | Villela Stay', 'Fiesta de graduación en Brasília — casa con piscina en Lago Sul | Villela Stay'),
    descricao: t('Espaço para festa de formatura em Brasília: casas no Lago Sul para até 150 convidados, com piscina e churrasqueira, e hospedagem para a turma.', 'A space for a graduation party in Brasília: houses in Lago Sul for up to 150 guests, with pool and barbecue, plus accommodation for the class.', 'Un espacio para fiesta de graduación en Brasília: casas en Lago Sul para hasta 150 invitados, con piscina y parrilla, y alojamiento para la promoción.'),
    h1: t('A formatura que a sua turma merece', 'The graduation your class deserves', 'La graduación que tu promoción merece'),
    sub: t('Festas particulares do formando, Comemorações das Comissões de formatura das faculdades e universidades da cidade (UnB, UDF, IESB, UniCEUB e UCB): festa em casa com piscina, área de lazer, estrutura para buffet, no Lago Sul — e hospedagem para a turma que vem de fora.', "Private parties for the graduate and celebrations for the graduation committees of the city's colleges and universities (UnB, UDF, IESB, UniCEUB and UCB): a party at a house with pool, leisure area and catering space in Lago Sul — plus accommodation for the class coming from out of town.", 'Fiestas particulares del graduando y celebraciones de las comisiones de graduación de las facultades y universidades de la ciudad (UnB, UDF, IESB, UniCEUB y UCB): fiesta en casa con piscina, zona de ocio y estructura para buffet en Lago Sul — y alojamiento para la promoción que viene de fuera.'),
    beneficios: [
      [t('🎓 Festa do seu jeito', '🎓 A party your way', '🎓 Una fiesta a tu manera'), t('Espaço exclusivo das 10h às 22h, com churrasqueira, piscina e cozinha e hospedagem para amigos e familiares.', 'Exclusive space from 10 AM to 10 PM, with barbecue, pool and kitchen, plus accommodation for friends and family.', 'Espacio exclusivo de 10h a 22h, con parrilla, piscina y cocina, además de alojamiento para amigos y familiares.')],
      [t('💰 Preço justo', '💰 Fair price', '💰 Precio justo'), t('R$ 150 por hóspede por dia, R$ 100,00 por convidado para evento ou day use. Escolhas flexíveis para a comissão fechar o orçamento sem surpresas.', 'R$ 150 per guest per day, R$ 100.00 per guest for an event or day use. Flexible options so the committee can set the budget without surprises.', 'R$ 150 por huésped por día, R$ 100,00 por invitado para evento o day use. Opciones flexibles para que la comisión cierre el presupuesto sin sorpresas.')],
      [t('🛌 Turma hospedada', '🛌 The class stays over', '🛌 La promoción alojada'), t('Combine evento com hospedagem em grupo: casas para até 50 pessoas com diárias competitivas.', 'Combine the event with group accommodation: houses for up to 50 people at competitive rates.', 'Combina el evento con alojamiento en grupo: casas para hasta 50 personas con tarifas competitivas.')]
    ],
    casas: ['GD03H', 'GG04I', 'GD01H', 'GI01I'],
    cta: t('Olá! Somos uma comissão de formatura. Data: ___ | Nº de convidados: ___ | Queremos orçamento de festa (e hospedagem, se possível).', "Hi! We're a graduation committee. Date: ___ | Number of guests: ___ | We'd like a quote for a party (and accommodation, if possible).", '¡Hola! Somos una comisión de graduación. Fecha: ___ | Nº de invitados: ___ | Queremos presupuesto de fiesta (y alojamiento, si es posible).')
  },
  {
    arquivo: 'casamentos.html', origem: 'site-casamentos',
    titulo: t('Casamento no Lago Sul — mini wedding em Brasília | Villela Stay', 'Wedding in Lago Sul — mini wedding in Brasília | Villela Stay', 'Boda en Lago Sul — mini wedding en Brasília | Villela Stay'),
    descricao: t('Mini wedding e recepção de casamento em casa no Lago Sul, Brasília: até 150 convidados, piscina, jardim e hospedagem para noivos e família.', 'Mini wedding and wedding reception at a house in Lago Sul, Brasília: up to 150 guests, pool, garden and accommodation for the couple and family.', 'Mini wedding y recepción de boda en una casa en Lago Sul, Brasília: hasta 150 invitados, piscina, jardín y alojamiento para los novios y la familia.'),
    h1: t('Diga "sim" no Lago Sul', 'Say "I do" in Lago Sul', 'Di "sí" en Lago Sul'),
    sub: t('Mini weddings, recepções e pré-weddings em casas com jardim e piscina — e os noivos e a família já hospedados no local da festa.', 'Mini weddings, receptions and pre-weddings at houses with garden and pool — with the couple and family already staying at the party venue.', 'Mini weddings, recepciones y pre-weddings en casas con jardín y piscina — con los novios y la familia ya alojados en el lugar de la fiesta.'),
    beneficios: [
      [t('💍 Cenário pronto', '💍 A ready-made setting', '💍 Un escenario listo'), t('Jardim, piscina e arquitetura estilo garden, que integram os ambientes interno e externos com o paisagismo único — fotos lindas sem cenografia cara.', 'Garden, pool and garden-style architecture that blend the indoor and outdoor spaces with unique landscaping — beautiful photos without expensive staging.', 'Jardín, piscina y arquitectura estilo garden que integran los ambientes interior y exterior con un paisajismo único — fotos preciosas sin escenografía cara.')],
      [t('👨‍👩‍👧 Família por perto', '👨‍👩‍👧 Family nearby', '👨‍👩‍👧 Familia cerca'), t('Hospede padrinhos e familiares na própria casa na semana do casamento.', 'Host the wedding party and relatives at the house during the wedding week.', 'Aloja a padrinos y familiares en la propia casa la semana de la boda.')],
      [t('📋 Orçamento transparente', '📋 Transparent budget', '📋 Presupuesto transparente'), t('R$ 150 por dia para os hóspedes e R$ 100 por convidado para evento ou day use + taxa de limpeza. O resto é com seus fornecedores de confiança.', 'R$ 150 per day for guests and R$ 100 per guest for an event or day use + cleaning fee. The rest is up to your trusted suppliers.', 'R$ 150 por día para los huéspedes y R$ 100 por invitado para evento o day use + tarifa de limpieza. El resto es con tus proveedores de confianza.')]
    ],
    casas: ['GD03H', 'GG04I', 'GD01H', 'GI01I'],
    cta: t('Olá! Estamos planejando um casamento. Data: ___ | Nº de convidados: ___ | Queremos conhecer as casas.', "Hi! We're planning a wedding. Date: ___ | Number of guests: ___ | We'd like to see the houses.", '¡Hola! Estamos planeando una boda. Fecha: ___ | Nº de invitados: ___ | Queremos conocer las casas.')
  },
  {
    arquivo: 'festas-infantis.html', origem: 'site-festas-infantis',
    titulo: t('Festa infantil com piscina em Brasília — Lago Sul | Villela Stay', "Kids' party with pool in Brasília — Lago Sul | Villela Stay", 'Fiesta infantil con piscina en Brasília — Lago Sul | Villela Stay'),
    descricao: t('Festa infantil em casa com piscina e parquinho no Lago Sul, Brasília: espaço seguro e exclusivo das 10h às 22h, R$ 100 por convidado.', "Kids' party at a house with pool and playground in Lago Sul, Brasília: a safe, exclusive space from 10 AM to 10 PM, R$ 100 per guest.", 'Fiesta infantil en una casa con piscina y parque en Lago Sul, Brasília: espacio seguro y exclusivo de 10h a 22h, R$ 100 por invitado.'),
    h1: t('A festa infantil dos sonhos — com piscina e parquinho', "The dream kids' party — with pool and playground", 'La fiesta infantil de tus sueños — con piscina y parque'),
    sub: t('Para os grupos de mães e pais que querem festa ao ar livre, segura e sem dor de cabeça: casa exclusiva no Lago Sul o dia todo.', 'For groups of mums and dads who want an outdoor party that\'s safe and hassle-free: an exclusive house in Lago Sul all day.', 'Para los grupos de madres y padres que quieren una fiesta al aire libre, segura y sin dolores de cabeza: casa exclusiva en Lago Sul todo el día.'),
    beneficios: [
      [t('🎈 Espaço exclusivo', '🎈 Exclusive space', '🎈 Espacio exclusivo'), t('Só a sua festa na casa, das 10h às 22h — sem dividir com estranhos.', 'Only your party at the house, from 10 AM to 10 PM — no sharing with strangers.', 'Solo tu fiesta en la casa, de 10h a 22h — sin compartir con extraños.')],
      [t('🛝 Diversão de verdade', '🛝 Real fun', '🛝 Diversión de verdad'), t('Piscina, parquinho infantil e gramado para brinquedos infláveis.', "Pool, kids' playground and lawn for inflatable toys.", 'Piscina, parque infantil y césped para juegos inflables.')],
      [t('👩‍🍳 Cozinha completa', '👩‍🍳 Full kitchen', '👩‍🍳 Cocina completa'), t('Prepare ou receba buffet com estrutura de casa de verdade — geladeira, fogão, churrasqueira.', 'Cook or host catering with a real home setup — fridge, stove, barbecue.', 'Prepara o recibe buffet con estructura de casa de verdad — nevera, cocina, parrilla.')]
    ],
    casas: ['GD01H', 'GI01I'],
    cta: t('Olá! Quero fazer uma festa infantil. Data: ___ | Nº de convidados (adultos + crianças): ___', "Hi! I'd like to host a kids' party. Date: ___ | Number of guests (adults + children): ___", '¡Hola! Quiero hacer una fiesta infantil. Fecha: ___ | Nº de invitados (adultos + niños): ___')
  },
  {
    arquivo: 'empresas.html', origem: 'site-b2b',
    titulo: t('Hospedagem e eventos para empresas e embaixadas — Brasília | Villela Stay', 'Accommodation and events for companies and embassies — Brasília | Villela Stay', 'Alojamiento y eventos para empresas y embajadas — Brasília | Villela Stay'),
    descricao: t('Hospedagem executiva e eventos corporativos no Lago Sul, Brasília: casas completas para equipes, off-sites e recepções, com faturamento para empresas e embaixadas.', 'Executive accommodation and corporate events in Lago Sul, Brasília: whole houses for teams, off-sites and receptions, with invoicing for companies and embassies.', 'Alojamiento ejecutivo y eventos corporativos en Lago Sul, Brasília: casas enteras para equipos, off-sites y recepciones, con facturación para empresas y embajadas.'),
    h1: t('Para empresas e embaixadas', 'For companies and embassies', 'Para empresas y embajadas'),
    sub: t('Hospedagem de equipes, off-sites, treinamentos e recepções diplomáticas — no bairro mais seguro e bem localizado de Brasília, a 10 min do Aeroporto JK e da Esplanada.', 'Team accommodation, off-sites, training sessions and diplomatic receptions — in the safest, best-located neighbourhood in Brasília, 10 min from JK Airport and the Esplanada.', 'Alojamiento de equipos, off-sites, capacitaciones y recepciones diplomáticas — en el barrio más seguro y mejor ubicado de Brasília, a 10 min del Aeropuerto JK y de la Explanada.'),
    beneficios: [
      [t('🏢 Conta corporativa', '🏢 Corporate account', '🏢 Cuenta corporativa'), t('Atendimento direto com o proprietário, nota e contrato para sua empresa ou missão diplomática.', 'Direct service with the owner, invoice and contract for your company or diplomatic mission.', 'Atención directa con el propietario, factura y contrato para tu empresa o misión diplomática.')],
      [t('🔒 Privacidade e segurança', '🔒 Privacy and security', '🔒 Privacidad y seguridad'), t('Casas em condomínio no Lago Sul — discrição para delegações e executivos.', 'Houses in a gated area in Lago Sul — discretion for delegations and executives.', 'Casas en condominio en Lago Sul — discreción para delegaciones y ejecutivos.')],
      [t('📆 Estadias Curtas e Eventos', '📆 Short stays and events', '📆 Estancias cortas y eventos'), t('Estadias temporárias para colaboradores e estrangeiros em propriedades flexíveis que acomodam de 1 hóspede até grupos de 50 pessoas.', 'Temporary stays for staff and international guests in flexible properties that host from 1 guest up to groups of 50.', 'Estancias temporales para colaboradores y extranjeros en propiedades flexibles que acomodan desde 1 huésped hasta grupos de 50 personas.')]
    ],
    casas: ['GD03H', 'GG04I', 'PL02I', 'GI01I'],
    cta: t('Olá! Represento uma empresa/embaixada. Precisamos de: hospedagem ( ) evento ( ) | Período: ___ | Nº de pessoas: ___', 'Hi! I represent a company/embassy. We need: accommodation ( ) event ( ) | Period: ___ | Number of people: ___', '¡Hola! Represento a una empresa/embajada. Necesitamos: alojamiento ( ) evento ( ) | Período: ___ | Nº de personas: ___')
  }
];

for (const lp of LANDINGS) {
  const cards = lp.casas.map(id => porId[id]).filter(Boolean).map(l => `
  <a class="card" href="${L(`/hospedagem/${l.id}.html`)}">
    ${img(l.fotoPrincipal, { alt: l.titulo, width: 400, height: 210, sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px' })}
    <div class="card-info"><h3>${esc(tituloImovel(l))}</h3><p>${l.hospedes} ${t('hóspedes', 'guests', 'huéspedes')} · ${l.quartos} ${t('quartos', 'rooms', 'habitaciones')}${l.m2 ? ` · ${l.m2} m²` : ''}</p></div>
  </a>`).join('\n');

  const html = layout(lp.titulo, lp.descricao, `
<section class="hero hero-menor">
  <h1>${esc(lp.h1)}</h1>
  <p><strong>${esc(lp.sub)}</strong></p>
</section>
<div class="pacotes-wrap">
  <section class="venda-bloco como-funciona">
    <div class="passos">
      ${lp.beneficios.map(b => `<div class="passo"><strong>${b[0]}</strong><br>${esc(b[1])}</div>`).join('\n')}
    </div>
  </section>
  <section class="venda-bloco">
    <h2 class="secao-titulo">${t('Os Espaços Recomendados', 'Recommended Spaces', 'Los Espacios Recomendados')}</h2>
    <div class="grade">${cards}</div>
  </section>
  <section class="venda-bloco cta-final">
    <h2>${t('Vamos conversar?', 'Shall we talk?', '¿Hablamos?')}</h2>
    <p>${t('Conte a data e o tamanho do grupo — respondemos com a proposta completa.', 'Tell us the date and the size of your group — we\'ll reply with a full proposal.', 'Cuéntanos la fecha y el tamaño del grupo — respondemos con la propuesta completa.')}</p>
    <a class="btn btn-wa btn-grande" href="${waLink(lp.cta)}">${t('Chamar no WhatsApp', 'Message on WhatsApp', 'Escribir por WhatsApp')}</a>
    <p style="margin-top:24px">${t('Ou deixe seu contato:', 'Or leave your contact:', 'O deja tu contacto:')}</p>
    <form class="form-evento form-evento-claro form-landing">
      <label>${t('Seu nome*', 'Your name*', 'Tu nombre*')} <input name="nome" required></label>
      <label>${t('WhatsApp ou e-mail*', 'WhatsApp or email*', 'WhatsApp o correo*')} <input name="contato" required></label>
      <label>${t('Conte rapidamente o que precisa', 'Briefly tell us what you need', 'Cuéntanos brevemente qué necesitas')} <textarea name="mensagem" rows="3"></textarea></label>
      <button class="btn" type="submit">${t('Pedir proposta', 'Request a proposal', 'Pedir propuesta')}</button>
      <p class="form-status" hidden></p>
    </form>
  </section>
</div>
<script>
document.querySelector('.form-landing').addEventListener('submit', function(e){
  e.preventDefault();
  var f = e.target, st = f.querySelector('.form-status');
  st.hidden = false; st.textContent = ${JSON.stringify(t('Enviando...', 'Sending...', 'Enviando...'))};
  fetch('${BACKEND}/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: f.nome.value, contato: f.contato.value, mensagem: f.mensagem.value, origem: '${lp.origem}' })
  }).then(function(r){
    st.textContent = r.ok ? ${JSON.stringify(t('✅ Recebido! Retornaremos em breve.', '✅ Received! We\'ll get back to you shortly.', '✅ ¡Recibido! Te responderemos pronto.'))} : ${JSON.stringify(t('Erro — chame no WhatsApp.', 'Error — message us on WhatsApp.', 'Error — escríbenos por WhatsApp.'))};
    if (r.ok) f.reset();
  }).catch(function(){ st.textContent = ${JSON.stringify(t('Erro — chame no WhatsApp.', 'Error — message us on WhatsApp.', 'Error — escríbenos por WhatsApp.'))}; });
});
</script>`,
    { caminho: `/${lp.arquivo}` }
  );
  fs.writeFileSync(path.join(od, lp.arquivo), html);
}

// ------------------------- artigo: posse 2027 -------------------------
const cardsPosse = ['GD03H', 'GG04I', 'PL02I', 'GD01H', 'GI01I'].map(id => porId[id]).filter(Boolean).map(l => `
  <a class="card" href="${L(`/hospedagem/${l.id}.html`)}">
    ${img(l.fotoPrincipal, { alt: l.titulo, width: 400, height: 210, sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px' })}
    <div class="card-info"><h3>${esc(tituloImovel(l))}</h3><p>${l.hospedes} ${t('hóspedes', 'guests', 'huéspedes')} · ${l.quartos} ${t('quartos', 'rooms', 'habitaciones')}</p></div>
  </a>`).join('\n');

const posse = layout(
  t('Onde ficar em Brasília para a Posse Presidencial 2027 | Villela Stay', 'Where to stay in Brasília for the 2027 Presidential Inauguration | Villela Stay', 'Dónde alojarse en Brasília para la Toma de Posesión Presidencial 2027 | Villela Stay'),
  t('Hospedagem para a posse do novo Presidente em 1º/01/2027: casas completas no Lago Sul para caravanas e comitivas, a 10 min da Esplanada. Reserve antes de esgotar.', "Accommodation for the new President's inauguration on 1 Jan 2027: whole houses in Lago Sul for groups and delegations, 10 min from the Esplanada. Book before they sell out.", 'Alojamiento para la toma de posesión del nuevo Presidente el 1/01/2027: casas enteras en Lago Sul para caravanas y comitivas, a 10 min de la Explanada. Reserva antes de que se agoten.'),
  `
<section class="hero hero-menor">
  <h1>${t('Onde ficar em Brasília para a Posse Presidencial 2027', 'Where to stay in Brasília for the 2027 Presidential Inauguration', 'Dónde alojarse en Brasília para la Toma de Posesión Presidencial 2027')}</h1>
  <p>${t('<strong>Em 1º de janeiro de 2027, o Brasil inteiro estará em Brasília.</strong> E quem deixar para depois vai pagar caro — ou ficar longe. Aqui está o guia de quem conhece a cidade.', '<strong>On 1 January 2027, all of Brazil will be in Brasília.</strong> Those who wait will pay dearly — or stay far away. Here\'s the guide from people who know the city.', '<strong>El 1 de enero de 2027, todo Brasil estará en Brasília.</strong> Quien lo deje para después pagará caro — o se quedará lejos. Aquí está la guía de quien conoce la ciudad.')}</p>
</section>
<div class="regras-wrap">
  <section class="regra"><h2>${t('Por que reservar agora', 'Why book now', 'Por qué reservar ahora')}</h2>
    <p>${t('A posse presidencial é o evento que mais lota Brasília — caravanas de todos os estados, comitivas políticas, delegações estrangeiras e famílias inteiras vêm assistir à cerimônia na Esplanada dos Ministérios. Nas posses anteriores, os hotéis da região central <strong>dobraram ou triplicaram as diárias</strong> e esgotaram com meses de antecedência.', 'The presidential inauguration is the event that fills Brasília the most — caravans from every state, political delegations, foreign missions and whole families come to watch the ceremony at the Esplanada dos Ministérios. At previous inaugurations, hotels in the central area <strong>doubled or tripled their rates</strong> and sold out months in advance.', 'La toma de posesión presidencial es el evento que más llena Brasília — caravanas de todos los estados, comitivas políticas, delegaciones extranjeras y familias enteras vienen a ver la ceremonia en la Esplanada dos Ministérios. En las tomas anteriores, los hoteles de la zona central <strong>duplicaron o triplicaron las tarifas</strong> y se agotaron con meses de antelación.')}</p>
    <p>${t('E há um detalhe que torna 2027 ainda mais especial: a posse cai <strong>emendada com o Réveillon</strong>. Quem vem, vem para os dois — e fica de 4 a 5 dias.', 'And one detail makes 2027 even more special: the inauguration falls <strong>right after New Year\'s Eve</strong>. Those who come, come for both — and stay 4 to 5 days.', 'Y hay un detalle que hace 2027 aún más especial: la toma de posesión cae <strong>pegada al Fin de Año</strong>. Quien viene, viene para los dos — y se queda de 4 a 5 días.')}</p>
  </section>
  <section class="regra"><h2>${t('A alternativa inteligente: casa completa no Lago Sul', 'The smart alternative: a whole house in Lago Sul', 'La alternativa inteligente: casa entera en Lago Sul')}</h2>
    <p>${t('Para grupos e caravanas, hotel é a conta que não fecha: dezenas de diárias individuais, sem cozinha, sem espaço de convivência. A solução que cresce a cada posse é alugar uma <strong>casa completa</strong> — e o Lago Sul é o melhor bairro para isso: seguro, silencioso, a <strong>10 minutos do Aeroporto JK e da Esplanada</strong>.', 'For groups and caravans, a hotel just doesn\'t add up: dozens of individual rates, no kitchen, no shared living space. The solution that grows with every inauguration is renting a <strong>whole house</strong> — and Lago Sul is the best neighbourhood for it: safe, quiet, <strong>10 minutes from JK Airport and the Esplanada</strong>.', 'Para grupos y caravanas, el hotel es la cuenta que no cuadra: decenas de tarifas individuales, sin cocina, sin espacio de convivencia. La solución que crece con cada toma de posesión es alquilar una <strong>casa entera</strong> — y Lago Sul es el mejor barrio para eso: seguro, silencioso, a <strong>10 minutos del Aeropuerto JK y de la Explanada</strong>.')}</p>
    <p>${t('Nas casas da Villela Stay, o grupo inteiro fica junto, com piscina aquecida, churrasqueira e cozinha completa — e o custo se divide: <strong>R$ 150 por pessoa por dia</strong> no pacote de 4 diárias com a casa lotada. Menos que uma diária de hotel simples em semana de posse.', 'In Villela Stay\'s houses, the whole group stays together, with a heated pool, barbecue and full kitchen — and the cost is split: <strong>R$ 150 per person per day</strong> in the 4-night package with the house at full capacity. Less than a basic hotel night during inauguration week.', 'En las casas de Villela Stay, todo el grupo se queda junto, con piscina climatizada, parrilla y cocina completa — y el costo se reparte: <strong>R$ 150 por persona por día</strong> en el paquete de 4 noches con la casa llena. Menos que una noche de hotel sencillo en semana de toma de posesión.')}</p>
  </section>
  <section class="regra"><h2>${t('O pacote Réveillon + Posse (30/12/2026 a 03/01/2027)', 'The New Year + Inauguration package (30 Dec 2026 to 3 Jan 2027)', 'El paquete Fin de Año + Toma de Posesión (30/12/2026 a 03/01/2027)')}</h2>
    <p>${t(`Nossas 4 casas recebem de 15 a 24 hóspedes cada. O pacote de 4 diárias vai de <strong>R$ 9.800 (Casa Villela, 15 pessoas)</strong> a <strong>R$ 15.400 (Casa Modernista, 24 pessoas)</strong> — valores fechados, sem surpresa. Veja os detalhes e a composição das camas em <a href="${L('/pacotes.html')}"><strong>Pacotes Especiais</strong></a>.`, `Our 4 houses host 15 to 24 guests each. The 4-night package ranges from <strong>R$ 9,800 (Casa Villela, 15 people)</strong> to <strong>R$ 15,400 (Casa Modernista, 24 people)</strong> — fixed prices, no surprises. See the details and bed layouts in <a href="${L('/pacotes.html')}"><strong>Special Packages</strong></a>.`, `Nuestras 4 casas reciben de 15 a 24 huéspedes cada una. El paquete de 4 noches va de <strong>R$ 9.800 (Casa Villela, 15 personas)</strong> a <strong>R$ 15.400 (Casa Modernista, 24 personas)</strong> — precios cerrados, sin sorpresas. Mira los detalles y la distribución de camas en <a href="${L('/pacotes.html')}"><strong>Paquetes Especiales</strong></a>.`)}</p>
    <p>⚠️ ${t('São apenas 4 casas por data, e Réveillon + Posse é a janela mais disputada do calendário. As reservas são confirmadas por ordem de chegada.', 'There are only 4 houses per date, and New Year + Inauguration is the most sought-after window on the calendar. Bookings are confirmed on a first-come, first-served basis.', 'Son solo 4 casas por fecha, y Fin de Año + Toma de Posesión es la ventana más disputada del calendario. Las reservas se confirman por orden de llegada.')}</p>
  </section>
  <section class="regra"><h2>${t('As casas', 'The houses', 'Las casas')}</h2>
    <div class="grade" style="margin-top:8px">${cardsPosse}</div>
  </section>
  <section class="venda-bloco cta-final" style="margin-top:28px">
    <h2>${t('Garanta a sua casa para a Posse 2027', 'Secure your house for the 2027 Inauguration', 'Asegura tu casa para la Toma de Posesión 2027')}</h2>
    <p>${t('Diga o tamanho do grupo e devolvemos a proposta completa no WhatsApp.', 'Tell us the size of your group and we\'ll send the full proposal on WhatsApp.', 'Dinos el tamaño del grupo y te enviamos la propuesta completa por WhatsApp.')}</p>
    <a class="btn btn-wa btn-grande" href="${waLink(t('Olá! Quero reservar uma casa para a Posse Presidencial 2027 (30/12 a 03/01). Somos um grupo de ___ pessoas.', "Hi! I'd like to book a house for the 2027 Presidential Inauguration (30 Dec to 3 Jan). We're a group of ___ people.", '¡Hola! Quiero reservar una casa para la Toma de Posesión Presidencial 2027 (30/12 a 03/01). Somos un grupo de ___ personas.'))}">${t('Reservar pelo WhatsApp', 'Book on WhatsApp', 'Reservar por WhatsApp')}</a>
  </section>
</div>`,
  { caminho: '/posse-2027.html' }
);
fs.writeFileSync(path.join(od, 'posse-2027.html'), posse);

// ------------------------- nossa história -------------------------
const historia = layout(
  t('Nossa História — a Brasília de JK, Niemeyer e Burle Marx | Villela Stay', "Our Story — the Brasília of JK, Niemeyer and Burle Marx | Villela Stay", 'Nuestra Historia — la Brasília de JK, Niemeyer y Burle Marx | Villela Stay'),
  t('Cada casa da Villela Stay homenageia quem fez Brasília: Kubitschek, Niemeyer, Lúcio Costa, Burle Marx, Athos Bulcão, Renato Russo e Cassia Eller. Conheça a história.', 'Every Villela Stay house honours those who built Brasília: Kubitschek, Niemeyer, Lúcio Costa, Burle Marx, Athos Bulcão, Renato Russo and Cassia Eller. Discover the story.', 'Cada casa de Villela Stay homenajea a quienes hicieron Brasília: Kubitschek, Niemeyer, Lúcio Costa, Burle Marx, Athos Bulcão, Renato Russo y Cassia Eller. Conoce la historia.'),
  `
<section class="hero hero-menor">
  <h1>${t('Toda casa da Villela Stay homenageia quem fez Brasília', 'Every Villela Stay house honours those who built Brasília', 'Cada casa de Villela Stay homenajea a quienes hicieron Brasília')}</h1>
</section>
<div class="regras-wrap">
  <section class="regra">
    <p>${t('Brasília nasceu de um sonho — o de <strong>Juscelino Kubitschek</strong>, que ergueu uma capital no meio do cerrado em mil dias. O traço veio de <strong>Lúcio Costa</strong>, as curvas de <strong>Oscar Niemeyer</strong>, os jardins de <strong>Burle Marx</strong>, os azulejos de <strong>Athos Bulcão</strong>. E a alma veio depois, nas vozes de <strong>Renato Russo</strong> e <strong>Cassia Eller</strong>, que fizeram da cidade a Capital do Rock.', 'Brasília was born from a dream — that of <strong>Juscelino Kubitschek</strong>, who built a capital in the middle of the cerrado in a thousand days. The plan came from <strong>Lúcio Costa</strong>, the curves from <strong>Oscar Niemeyer</strong>, the gardens from <strong>Burle Marx</strong>, the tiles from <strong>Athos Bulcão</strong>. And the soul came later, in the voices of <strong>Renato Russo</strong> and <strong>Cassia Eller</strong>, who made the city the Capital of Rock.', 'Brasília nació de un sueño — el de <strong>Juscelino Kubitschek</strong>, que levantó una capital en medio del cerrado en mil días. El trazo vino de <strong>Lúcio Costa</strong>, las curvas de <strong>Oscar Niemeyer</strong>, los jardines de <strong>Burle Marx</strong>, los azulejos de <strong>Athos Bulcão</strong>. Y el alma vino después, en las voces de <strong>Renato Russo</strong> y <strong>Cassia Eller</strong>, que hicieron de la ciudad la Capital del Rock.')}</p>
    <p>${t('<strong>Na Villela Stay, cada hospedagem carrega um desses nomes.</strong> A Villa Kubitschek e a Villa Catetinho lembram o presidente fundador — o Catetinho foi sua primeira residência na cidade, erguida em dez dias. O Flat do Oscar, o Flat do Burle Marx, o Flat do Lúcio Costa e o Flat do Athos Bulcão celebram os construtores. As suítes do Renato Russo e da Cassia Eller guardam a trilha sonora. E a Casa Modernista é a síntese de tudo: a arquitetura de Brasília, de portas abertas para você morar por alguns dias.', '<strong>At Villela Stay, every unit carries one of these names.</strong> Villa Kubitschek and Villa Catetinho recall the founding president — the Catetinho was his first home in the city, built in ten days. The Flat do Oscar, Flat do Burle Marx, Flat do Lúcio Costa and Flat do Athos Bulcão celebrate the builders. The Renato Russo and Cassia Eller suites hold the soundtrack. And Casa Modernista is the synthesis of it all: the architecture of Brasília, with open doors for you to live in for a few days.', '<strong>En Villela Stay, cada alojamiento lleva uno de estos nombres.</strong> La Villa Kubitschek y la Villa Catetinho recuerdan al presidente fundador — el Catetinho fue su primera residencia en la ciudad, levantada en diez días. El Flat do Oscar, el Flat do Burle Marx, el Flat do Lúcio Costa y el Flat do Athos Bulcão celebran a los constructores. Las suites de Renato Russo y de Cassia Eller guardan la banda sonora. Y la Casa Modernista es la síntesis de todo: la arquitectura de Brasília, con las puertas abiertas para que vivas en ella unos días.')}</p>
  </section>
  <section class="regra"><h2>${t('O anfitrião', 'The host', 'El anfitrión')}</h2>
    <p>${t('Augusto Villela nasceu em Brasília em 1970 — dez anos depois da cidade. Advogado de profissão e anfitrião por vocação, viu na hospitalidade um jeito de compartilhar o que a capital tem de melhor: o Lago Sul, o céu do cerrado, a mesa farta e a história viva em cada esquina. Hoje, como Superhost premiado, recebe famílias, grupos e delegações do mundo inteiro nas casas da Villela Stay.', 'Augusto Villela was born in Brasília in 1970 — ten years after the city itself. A lawyer by profession and a host by vocation, he found in hospitality a way to share the best of the capital: Lago Sul, the cerrado sky, a generous table and living history on every corner. Today, as an award-winning Superhost, he welcomes families, groups and delegations from all over the world to the Villela Stay houses.', 'Augusto Villela nació en Brasília en 1970 — diez años después de la ciudad. Abogado de profesión y anfitrión por vocación, vio en la hospitalidad una forma de compartir lo mejor de la capital: Lago Sul, el cielo del cerrado, la mesa abundante y la historia viva en cada esquina. Hoy, como Superhost premiado, recibe a familias, grupos y delegaciones de todo el mundo en las casas de Villela Stay.')}</p>
  </section>
  <section class="regra"><h2>${t('O que a gente acredita', 'What we believe', 'En qué creemos')}</h2>
    <p>${t('Que hospedar é mais do que abrigar. É entregar a casa limpa e a piscina aquecida, mas também indicar o restaurante certo, o pôr do sol da Ermida Dom Bosco e o caminho mais bonito para a Esplanada. É o que chamamos de <strong>Hospedagens Inteligentes para Experiências Inesquecíveis</strong>.', 'That hosting is more than providing shelter. It\'s handing over a clean house and a heated pool, but also recommending the right restaurant, the sunset at Ermida Dom Bosco and the most beautiful route to the Esplanada. It\'s what we call <strong>Smart Stays for Unforgettable Experiences</strong>.', 'Que hospedar es más que dar techo. Es entregar la casa limpia y la piscina climatizada, pero también recomendar el restaurante adecuado, el atardecer de la Ermida Dom Bosco y el camino más bonito hacia la Explanada. Es lo que llamamos <strong>Alojamientos Inteligentes para Experiencias Inolvidables</strong>.')}</p>
  </section>
  <section class="venda-bloco cta-final" style="margin-top:28px">
    <h2>${t('Venha viver essa história', 'Come and live this story', 'Ven a vivir esta historia')}</h2>
    <p>${t('Escolha a sua casa no Lago Sul — e seja recebido por quem ama Brasília.', 'Choose your house in Lago Sul — and be welcomed by people who love Brasília.', 'Elige tu casa en Lago Sul — y serás recibido por quien ama Brasília.')}</p>
    <a class="btn btn-wa btn-grande" href="${waLink(t('Olá! Conheci a história da Villela Stay e quero me hospedar.', "Hi! I read the Villela Stay story and I'd like to stay.", '¡Hola! Conocí la historia de Villela Stay y quiero hospedarme.'))}">${t('Falar com o anfitrião', 'Talk to the host', 'Hablar con el anfitrión')}</a>
    <p style="margin-top:14px"><a href="${L('/')}#hospedagens" style="color:var(--creme);text-decoration:underline">${t('Ver as hospedagens', 'See the stays', 'Ver los alojamientos')} →</a></p>
  </section>
</div>`,
  { caminho: '/nossa-historia.html' }
);
fs.writeFileSync(path.join(od, 'nossa-historia.html'), historia);

// ============================ BLOG / Diário de Brasília ============================
// Motor data-driven: cada artigo é um arquivo em content/blog/ (registrado em index.js).
// Para publicar um novo: crie o arquivo, registre no index e rode `node build.js`.
// BLOG: definido no escopo de módulo (topo do arquivo).

// Créditos das imagens curadas (Wikimedia Commons) — opcional/tolerante a ausência.
let blogCreditos = {};
try {
  blogCreditos = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'blog', 'creditos.json'), 'utf8').replace(/^﻿/, ''));
} catch (e) { console.warn('[blog] sem creditos.json — artigos usarão só a arte de marca'); }

// Copia as imagens do blog (src/blog/*.jpg|png) para dist/blog-img/
const BLOG_IMG_SRC = path.join(__dirname, 'src', 'blog');
const BLOG_IMG_DST = path.join(DIST, 'blog-img');
if (fs.existsSync(BLOG_IMG_SRC)) {
  fs.mkdirSync(BLOG_IMG_DST, { recursive: true });
  for (const f of fs.readdirSync(BLOG_IMG_SRC)) {
    if (/\.(jpe?g|png)$/i.test(f)) fs.copyFileSync(path.join(BLOG_IMG_SRC, f), path.join(BLOG_IMG_DST, f));
  }
}
fs.mkdirSync(path.join(DIST, 'blog'), { recursive: true });

// Copia os PDFs das iscas (lead magnets) para dist/iscas/
const ISCAS_SRC = path.join(__dirname, 'src', 'iscas');
if (fs.existsSync(ISCAS_SRC)) {
  const ISCAS_DST = path.join(DIST, 'iscas');
  fs.mkdirSync(ISCAS_DST, { recursive: true });
  for (const f of fs.readdirSync(ISCAS_SRC)) {
    if (/\.pdf$/i.test(f)) fs.copyFileSync(path.join(ISCAS_SRC, f), path.join(ISCAS_DST, f));
  }
}

const fmtDataBR = s => { const p = String(s).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };

// Motivo decorativo modernista (curvas tipo Niemeyer) — tingido por CSS via currentColor.
const BLOG_HERO_SVG = `<svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M-40,400 C160,150 480,150 680,400"/><path d="M-40,400 C160,95 480,95 680,400"/><path d="M-40,400 C160,40 480,40 680,400"/><circle cx="520" cy="120" r="46"/></g></svg>`;

// <figure> de uma imagem curada do artigo (1-based). '' se não existir — degrada com elegância.
function blogFig(slug, n, opts = {}) {
  const item = (blogCreditos[slug] || [])[n - 1];
  if (!item) return '';
  const abs = path.join(BLOG_IMG_SRC, item.file);
  if (!fs.existsSync(abs)) return '';
  const dim = dimensoesArquivo(abs) || { w: 1600, h: 1067 };
  const legenda = opts.legenda || item.alt || '';
  const credito = `${t('Foto:', 'Photo:', 'Foto:')} ${esc(item.credito)} (${esc(item.licenca)}) · <a href="${esc(item.fonte)}" target="_blank" rel="noopener nofollow">Wikimedia Commons</a>`;
  return `<figure class="artigo-fig${opts.classe ? ' ' + opts.classe : ''}">
${img('/blog-img/' + item.file, { alt: legenda || item.alt, width: dim.w, height: dim.h, sizes: '(max-width: 820px) 100vw, 760px' })}
  <figcaption>${legenda ? `<span class="fig-legenda">${esc(legenda)}</span>` : ''}<span class="fig-credito">${credito}</span></figcaption>
</figure>`;
}

// Imagem de capa de um card do hub (1ª foto do tema) ou arte de marca de fallback.
function blogCardImg(a) {
  const item = (blogCreditos[a.slug] || [])[0];
  if (item) {
    const abs = path.join(BLOG_IMG_SRC, item.file);
    if (fs.existsSync(abs)) {
      const d = dimensoesArquivo(abs) || { w: 1600, h: 1067 };
      return img('/blog-img/' + item.file, { alt: a.h1, width: d.w, height: d.h, sizes: '(max-width: 640px) 100vw, 400px' });
    }
  }
  return `<div class="blog-card-arte tema-${a.slug}" aria-hidden="true">${BLOG_HERO_SVG}</div>`;
}

const BLOG_POR_SLUG = Object.fromEntries(BLOG.map(a => [a.slug, a]));

// Script único que liga todos os formulários do blog ao /api/leads (CRM), marcando a origem.
const formScriptBlog = `<script>
document.querySelectorAll('.form-blog').forEach(function(f){
  f.addEventListener('submit', function(e){
    e.preventDefault();
    var st = f.querySelector('.form-status'); st.hidden=false; st.textContent=${JSON.stringify(t('Enviando...', 'Sending...', 'Enviando...'))};
    var g=function(n){var el=f.querySelector('[name="'+n+'"]'); return el?String(el.value).trim():'';};
    var extra=[]; ['datas','pessoas','interesse','mensagem'].forEach(function(n){var v=g(n); if(v) extra.push(n+': '+v);});
    var msg=(f.getAttribute('data-contexto')||'')+(extra.length?' — '+extra.join(' | '):'');
    fetch('${BACKEND}/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nome:g('nome'),contato:g('contato'),mensagem:msg,origem:f.getAttribute('data-origem')})})
    .then(function(r){
      if(r.ok){ var arq=f.getAttribute('data-arquivo');
        if(arq){ st.innerHTML=${JSON.stringify(t('✅ Pronto! Seu material: ', '✅ Done! Your resource: ', '✅ ¡Listo! Tu material: '))}+'<a href="'+arq+'" target="_blank" rel="noopener" download><b>'+${JSON.stringify(t('baixar agora →', 'download now →', 'descargar ahora →'))}+'</b></a>'; try{window.open(arq,'_blank');}catch(e){} }
        else { st.textContent=${JSON.stringify(t('✅ Recebido! Em breve entramos em contato.', "✅ Received! We'll be in touch soon.", '✅ ¡Recibido! Pronto te contactamos.'))}; }
        f.reset();
      } else { st.textContent=${JSON.stringify(t('Não consegui enviar — chame no WhatsApp.', "Couldn't send — message us on WhatsApp.", 'No pude enviar — escríbenos por WhatsApp.'))}; }
    })
    .catch(function(){ st.textContent=${JSON.stringify(t('Não consegui enviar — chame no WhatsApp.', "Couldn't send — message us on WhatsApp.", 'No pude enviar — escríbenos por WhatsApp.'))}; });
  });
});
</script>`;

// Tradução do "tema"/categoria do artigo (rótulo curto usado em cards, breadcrumb e tag).
const BLOG_TEMA_I18N = {
  'Arquitetura': { en: 'Architecture', es: 'Arquitectura' },
  'Arquitetura modular': { en: 'Modular architecture', es: 'Arquitectura modular' },
  'Domo geodésico': { en: 'Geodesic dome', es: 'Domo geodésico' },
  'Gastronomia': { en: 'Food & dining', es: 'Gastronomía' },
  'Hospedagem profissional': { en: 'Professional hosting', es: 'Hospedaje profesional' },
  'Paisagismo': { en: 'Landscaping', es: 'Paisajismo' },
  'Personalidades': { en: 'Notable figures', es: 'Personalidades' },
  'Roteiros': { en: 'Itineraries', es: 'Itinerarios' }
};
// Mescla o artigo PT com a tradução do idioma corrente (campo a campo; faltou = cai no PT).
function tradArtigo(a) {
  if (LANG === 'pt') return a;
  const tr = (BLOG_I18N[a.slug] || {})[LANG];
  const merged = tr ? { ...a, ...tr } : { ...a };
  const tm = BLOG_TEMA_I18N[a.tema];
  if (tm && tm[LANG]) merged.tema = tm[LANG];
  return merged;
}
function renderArtigo(a0) {
  const a = tradArtigo(a0);
  const h = {
    fig: (n, opts) => blogFig(a.slug, n, opts),
    wa: waLink,
    esc, L,
    t,
    casaLink: (code, label) => porId[code] ? `<a href="${L(`/hospedagem/${code}.html`)}">${esc(label || tituloImovel(porId[code]))}</a>` : (label ? esc(label) : ''),
  };
  const caminho = `/blog/${a.slug}.html`;
  const url = `${SITE_URL}${L(caminho)}`;
  const heroAbs = (blogCreditos[a.slug] && blogCreditos[a.slug][0]) ? `${SITE_URL}/blog-img/${blogCreditos[a.slug][0].file}` : `${SITE_URL}/og-home.jpg`;

  // ---- dados estruturados ----
  const artigoLd = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.h1, description: a.descricao, image: heroAbs,
    datePublished: a.atualizado, dateModified: a.atualizado, inLanguage: HTML_LANG[LANG],
    about: a.tema, author: { '@id': ORG_ID }, publisher: { '@id': ORG_ID },
    mainEntityOfPage: url, isPartOf: { '@type': 'Blog', '@id': `${SITE_URL}/blog.html#blog`, name: 'Diário de Brasília — Villela Stay' }
  };
  const faqLd = a.faq && a.faq.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: a.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  } : null;
  const crumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('Início', 'Home', 'Inicio'), item: SITE_URL + L('/') },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}${L('/blog.html')}` },
      { '@type': 'ListItem', position: 3, name: a.tema, item: url }
    ]
  };
  const extraHead = [artigoLd, faqLd, crumbLd].filter(Boolean)
    .map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');

  // ---- blocos de conversão ----
  const casasCards = (a.casas || []).map(id => porId[id]).filter(Boolean).map(card).join('\n');
  const iscaBox = a.isca ? `
  <aside class="isca-box">
    <div class="isca-conteudo">
      <span class="isca-tag">🎁 ${t('Material gratuito', 'Free resource', 'Material gratuito')}</span>
      <h2>${esc(a.isca.titulo)}</h2>
      <p>${esc(a.isca.texto)}</p>
    </div>
    <form class="form-blog form-isca" data-origem="blog:${a.slug}:isca" data-arquivo="${a.isca.arquivo || ''}" data-contexto="Isca '${esc(a.isca.titulo)}' (artigo: ${esc(a.h1)})">
      <input name="nome" placeholder="${t('Seu nome', 'Your name', 'Tu nombre')}" required aria-label="${t('Seu nome', 'Your name', 'Tu nombre')}">
      <input name="contato" placeholder="${t('WhatsApp ou e-mail', 'WhatsApp or email', 'WhatsApp o correo')}" required aria-label="${t('WhatsApp ou e-mail', 'WhatsApp or email', 'WhatsApp o correo')}">
      <button class="btn" type="submit">${esc(a.isca.botao || t('Quero receber', 'Send it to me', 'Quiero recibirlo'))}</button>
      <p class="form-status" hidden></p>
    </form>
  </aside>` : '';

  const faqBloco = (a.faq && a.faq.length) ? `
  <section class="artigo-faq">
    <h2>${t('Perguntas frequentes', 'Frequently asked questions', 'Preguntas frecuentes')}</h2>
    ${a.faq.map(f => `<details class="faq-item"><summary>${esc(f.q)}</summary><div class="faq-resp">${esc(f.a)}</div></details>`).join('\n    ')}
  </section>` : '';

  const relacionados = (a.relacionados || []).map(s => BLOG_POR_SLUG[s]).filter(Boolean);
  const relacionadosBloco = relacionados.length ? `
  <section class="blog-relacionados">
    <h2 class="secao-titulo">${t('Continue lendo', 'Keep reading', 'Sigue leyendo')}</h2>
    <div class="blog-grade">
      ${relacionados.map(r0 => { const r = tradArtigo(r0); return `<a class="blog-card blog-card-min" href="${L(`/blog/${r.slug}.html`)}">
        <div class="blog-card-img">${blogCardImg(r0)}</div>
        <div class="blog-card-info"><span class="tema-tag tema-${r.slug}">${r.emoji} ${esc(r.tema)}</span><h3>${esc(r.h1)}</h3></div>
      </a>`; }).join('\n      ')}
    </div>
  </section>` : '';

  const waMsg = t(`Olá! Li o artigo "${a.h1}" no site da Villela Stay e quero saber sobre hospedagem no Lago Sul.`, `Hi! I read the article "${a.h1}" on the Villela Stay website and I'd like to know about staying in Lago Sul.`, `¡Hola! Leí el artículo "${a.h1}" en el sitio de Villela Stay y quiero saber sobre alojamiento en el Lago Sul.`);

  const corpoHtml = `
<article class="artigo">
  <header class="artigo-hero tema-${a.slug}">
    <div class="artigo-hero-motivo" aria-hidden="true">${BLOG_HERO_SVG}</div>
    <div class="artigo-hero-conteudo">
      <nav class="breadcrumb"><a href="${L('/')}">${t('Início', 'Home', 'Inicio')}</a> › <a href="${L('/blog.html')}">Blog</a> › <span>${esc(a.tema)}</span></nav>
      <span class="tema-tag">${a.emoji} ${esc(a.tema)}</span>
      <h1>${esc(a.h1)}</h1>
      <p class="artigo-dek">${esc(a.dek)}</p>
      <div class="artigo-meta"><span>⏱ ${a.leituraMin || 7} ${t('min de leitura', 'min read', 'min de lectura')}</span><span>${t('Atualizado em', 'Updated on', 'Actualizado el')} ${fmtDataBR(a.atualizado)}</span></div>
    </div>
  </header>
  <div class="artigo-corpo">
    ${a.corpo(h)}
    ${iscaBox}
    ${faqBloco}
  </div>
</article>

<section class="grade-wrap blog-casas">
  <h2 class="secao-titulo">${esc(a.casasTitulo || t('Onde se hospedar', 'Where to stay', 'Dónde alojarse'))}</h2>
  ${a.casasTexto ? `<p class="blog-casas-texto">${esc(a.casasTexto)}</p>` : ''}
  <div class="grade">${casasCards}</div>
</section>

<section class="venda-bloco cta-final blog-cta">
  <h2>${t('Quer ajuda para planejar sua estadia?', 'Want help planning your stay?', '¿Quieres ayuda para planear tu estancia?')}</h2>
  <p>${t('Conte a data e o tamanho do grupo — devolvemos a proposta completa, com as casas certas e os melhores preços.', "Tell us the date and the size of your group — we'll send a full proposal, with the right houses and the best prices.", 'Cuéntanos la fecha y el tamaño del grupo — te enviamos la propuesta completa, con las casas adecuadas y los mejores precios.')}</p>
  <a class="btn btn-wa btn-grande" href="${waLink(waMsg)}">${t('Falar no WhatsApp', 'Chat on WhatsApp', 'Hablar por WhatsApp')}</a>
  <p style="margin-top:22px">${t('Ou deixe seu contato que retornamos:', "Or leave your contact and we'll get back to you:", 'O deja tu contacto y te respondemos:')}</p>
  <form class="form-blog form-evento form-evento-claro" data-origem="blog:${a.slug}" data-contexto="Cotação a partir do artigo: ${esc(a.h1)}">
    <label>${t('Seu nome*', 'Your name*', 'Tu nombre*')} <input name="nome" required></label>
    <label>${t('WhatsApp ou e-mail*', 'WhatsApp or email*', 'WhatsApp o correo*')} <input name="contato" required></label>
    <label>${t('Datas pretendidas', 'Preferred dates', 'Fechas deseadas')} <input name="datas" placeholder="${t('Ex.: 10 a 14/07 (ou flexível)', 'E.g. 10–14 Jul (or flexible)', 'Ej.: 10 a 14/07 (o flexible)')}"></label>
    <label>${t('Nº de pessoas', 'Number of people', 'Nº de personas')} <input name="pessoas" placeholder="${t('Ex.: 8', 'E.g. 8', 'Ej.: 8')}"></label>
    <label>${t('Interesse', 'Interest', 'Interés')}
      <select name="interesse">
        <option value="">${t('Selecione…', 'Select…', 'Selecciona…')}</option>
        <option value="Hospedagem">${t('Hospedagem', 'Stay', 'Alojamiento')}</option>
        <option value="Evento">${t('Evento', 'Event', 'Evento')}</option>
        <option value="Hospedagem + evento">${t('Hospedagem + evento', 'Stay + event', 'Alojamiento + evento')}</option>
      </select>
    </label>
    <label>${t('Mensagem (opcional)', 'Message (optional)', 'Mensaje (opcional)')} <textarea name="mensagem" rows="2"></textarea></label>
    <button class="btn" type="submit">${t('Pedir proposta', 'Request a proposal', 'Pedir propuesta')}</button>
    <p class="form-status" hidden></p>
  </form>
</section>

${relacionadosBloco}
${formScriptBlog}`;

  const html = layout(a.titulo, a.descricao, corpoHtml, { caminho, ogType: 'article', ogImage: heroAbs, extraHead });
  fs.writeFileSync(path.join(od, 'blog', `${a.slug}.html`), html);
}

BLOG.forEach(renderArtigo);

// ---- hub /blog.html ----
const blogCardsHub = BLOG.map(a0 => { const a = tradArtigo(a0); return `
  <a class="blog-card" href="${L(`/blog/${a.slug}.html`)}">
    <div class="blog-card-img">${blogCardImg(a0)}</div>
    <div class="blog-card-info">
      <span class="tema-tag tema-${a.slug}">${a.emoji} ${esc(a.tema)}</span>
      <h3>${esc(a.h1)}</h3>
      <p>${esc(a.dek)}</p>
      <span class="blog-card-leia">${t('Ler artigo', 'Read article', 'Leer artículo')} · ${a.leituraMin || 7} min →</span>
    </div>
  </a>`; }).join('\n');

const blogLd = {
  '@context': 'https://schema.org', '@type': 'Blog', '@id': `${SITE_URL}/blog.html#blog`,
  name: 'Diário de Brasília — Villela Stay', inLanguage: HTML_LANG[LANG], publisher: { '@id': ORG_ID },
  blogPost: BLOG.map(a0 => { const a = tradArtigo(a0); return { '@type': 'BlogPosting', headline: a.h1, url: `${SITE_URL}${L(`/blog/${a.slug}.html`)}`, datePublished: a.atualizado, about: a.tema }; })
};

const blogHub = layout(
  t('Blog — Diário de Brasília | Villela Stay', 'Blog — Brasília Diary | Villela Stay', 'Blog — Diario de Brasília | Villela Stay'),
  t('Arquitetura, gastronomia, roteiros, paisagismo e história de Brasília — o diário do anfitrião para quem ama (ou vai conhecer) a capital. Conteúdo da Villela Stay.', "Architecture, food, itineraries, landscaping and the history of Brasília — the host's diary for those who love (or are about to discover) the capital. By Villela Stay.", 'Arquitectura, gastronomía, itinerarios, paisajismo e historia de Brasília — el diario del anfitrión para quien ama (o va a conocer) la capital. Contenido de Villela Stay.'),
  `
<section class="hero hero-menor blog-hero-hub">
  <span class="tema-tag">📖 ${t('Diário de Brasília', 'Brasília Diary', 'Diario de Brasília')}</span>
  <h1>${t('Brasília por quem vive aqui', 'Brasília by those who live here', 'Brasília por quien vive aquí')}</h1>
  <p><strong>${t('Arquitetura, gastronomia, roteiros, paisagismo e as histórias da capital — o diário do anfitrião para você conhecer Brasília antes mesmo de chegar.', "Architecture, food, itineraries, landscaping and the stories of the capital — the host's diary to help you get to know Brasília before you even arrive.", 'Arquitectura, gastronomía, itinerarios, paisajismo y las historias de la capital — el diario del anfitrión para que conozcas Brasília antes incluso de llegar.')}</strong></p>
</section>
<section class="grade-wrap">
  <div class="blog-grade">${blogCardsHub}</div>
</section>
<section class="venda-bloco cta-final blog-cta" style="max-width:1000px;margin:0 auto 64px">
  <h2>${t('Pronto para conhecer Brasília de perto?', 'Ready to experience Brasília up close?', '¿Listo para conocer Brasília de cerca?')}</h2>
  <p>${t('Escolha sua casa no Lago Sul e seja recebido por quem ama a cidade.', 'Choose your house in Lago Sul and be welcomed by people who love the city.', 'Elige tu casa en Lago Sul y serás recibido por quien ama la ciudad.')}</p>
  <a class="btn btn-wa btn-grande" href="${waLink(t('Olá! Vim pelo blog da Villela Stay e quero saber sobre as hospedagens.', 'Hi! I came from the Villela Stay blog and would like to know about the stays.', '¡Hola! Vengo del blog de Villela Stay y quiero saber sobre los alojamientos.'))}">${t('Falar no WhatsApp', 'Chat on WhatsApp', 'Hablar por WhatsApp')}</a>
  <p style="margin-top:14px"><a href="${L('/')}#hospedagens" style="color:var(--creme);text-decoration:underline">${t('Ver as hospedagens', 'See the stays', 'Ver los alojamientos')} →</a></p>
</section>`,
  { caminho: '/blog.html', extraHead: `<script type="application/ld+json">${JSON.stringify(blogLd)}</script>` }
);
fs.writeFileSync(path.join(od, 'blog.html'), blogHub);

const BLOG_PATHS = ['/blog.html', ...BLOG.map(a => `/blog/${a.slug}.html`)];
console.log(`Blog gerado: hub + ${BLOG.length} artigos`);

// ------------------------- links.html (hub de links / "linktree") -------------------------
// Página standalone, mobile-first, para abrir pelo QR Code / bio das redes. Usa a identidade
// da marca (paleta petróleo/creme/cerrado, logo no topo) mas SEM o header/nav do site — foco
// total nos botões, como um linktree. Cada link de reserva marca ?origem=linktree para o CRM.
const linkWa = txt => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(txt)}`;
const LINKTREE = [
  { emoji: '📍', titulo: t('Google Maps · Avaliações', 'Google Maps · Reviews', 'Google Maps · Reseñas'), sub: t('Veja onde ficamos e o que dizem os hóspedes', 'See where we are and what guests say', 'Mira dónde estamos y lo que dicen los huéspedes'), href: 'https://maps.app.goo.gl/3G91MUDdDt3NW3U18', social: true },
  { emoji: '🏡', titulo: t('Reservar / Ver as casas', 'Book / See the houses', 'Reservar / Ver las casas'), sub: t('Casas, flats e suítes no Lago Sul', 'Houses, flats and suites in Lago Sul', 'Casas, flats y suites en Lago Sul'), href: L('/') + '?origem=linktree#hospedagens', destaque: true },
  { emoji: '💬', titulo: t('Fale conosco no WhatsApp', 'Chat with us on WhatsApp', 'Escríbenos por WhatsApp'), sub: t('Atendimento direto com o anfitrião', 'Direct service with the host', 'Atención directa con el anfitrión'), href: linkWa(t('Olá! Vim pelo link da Villela Stay e gostaria de informações.', "Hi! I came from the Villela Stay link and I'd like some information.", '¡Hola! Vengo del enlace de Villela Stay y quiero información.')), wa: true },
  { emoji: '🎉', titulo: t('Eventos', 'Events', 'Eventos'), sub: t('Casamentos, formaturas e festas — peça seu orçamento', 'Weddings, graduations and parties — request a quote', 'Bodas, graduaciones y fiestas — pide tu presupuesto'), href: L('/eventos.html') + '?origem=linktree' },
  { emoji: '❓', titulo: t('Perguntas Frequentes (FAQ)', 'FAQ — Frequently Asked Questions', 'Preguntas Frecuentes (FAQ)'), sub: t('Reserva, check-in, comodidades, eventos e mais', 'Booking, check-in, amenities, events and more', 'Reserva, check-in, comodidades, eventos y más'), href: L('/faq.html') + '?origem=linktree' },
  { emoji: '📕', titulo: t('e-Book da Casa Modernista', 'Casa Modernista e-Book', 'e-Book de la Casa Modernista'), sub: t('Guia completo da casa: estrutura, regras e roteiros de Brasília', 'Complete house guide: layout, rules and Brasília itineraries', 'Guía completa de la casa: estructura, normas e itinerarios de Brasília'), href: `${SITE_URL}/ebooks/manual-casa-modernista.pdf` },
  { emoji: '📗', titulo: t('e-Book da Villela Home Stay', 'Villela Home Stay e-Book', 'e-Book de Villela Home Stay'), sub: t('Guia das casas do compound: estrutura, regras e roteiros de Brasília', 'Compound houses guide: layout, rules and Brasília itineraries', 'Guía de las casas del compound: estructura, normas e itinerarios de Brasília'), href: `${SITE_URL}/ebooks/manual-villela-stay.pdf` },
  { emoji: '🎄', titulo: t('Pacotes especiais', 'Special packages', 'Paquetes especiales'), sub: t('Natal, Réveillon, Posse 2027 e Carnaval', 'Christmas, New Year, 2027 Inauguration and Carnival', 'Navidad, Fin de Año, Toma de Posesión 2027 y Carnaval'), href: L('/pacotes.html') + '?origem=linktree' },
  { emoji: '📷', titulo: 'Instagram · @villelastay', sub: t('Siga nossas casas e bastidores', 'Follow our houses and behind the scenes', 'Sigue nuestras casas y el detrás de escena'), href: 'https://instagram.com/villelastay', social: true },
  { emoji: '📷', titulo: 'Instagram · @augustovillela', sub: t('Siga o anfitrião', 'Follow the host', 'Sigue al anfitrión'), href: 'https://instagram.com/augustovillela', social: true },
  { emoji: '📘', titulo: 'Facebook · augusto.villela', sub: t('Curta e acompanhe as novidades', 'Like and follow the news', 'Dale me gusta y sigue las novedades'), href: 'https://facebook.com/augusto.villela', social: true },
  { emoji: '✉️', titulo: t('E-mail · villelastay@gmail.com', 'Email · villelastay@gmail.com', 'Correo · villelastay@gmail.com'), sub: t('Fale com a gente por e-mail', 'Reach us by email', 'Escríbenos por correo'), href: 'mailto:villelastay@gmail.com', social: true },
  { emoji: '📖', titulo: t('Blog · Diário de Brasília', 'Blog · Brasília Diary', 'Blog · Diario de Brasília'), sub: t('Arquitetura, gastronomia e roteiros', 'Architecture, food and itineraries', 'Arquitectura, gastronomía e itinerarios'), href: L('/blog.html') + '?origem=linktree' }
];
// Atalhos diretos para as casas (espaços inteiros). Só entram os que existem em listings.json.
const LINKTREE_CASAS = [
  { id: 'GG04I', nome: 'Villa Kubitschek' },
  { id: 'PL02I', nome: 'Villa Catetinho' },
  { id: 'GI01I', nome: 'Casa Villela' },
  { id: 'GD03H', nome: t('Gran Villela (espaço inteiro)', 'Gran Villela (whole house)', 'Gran Villela (casa entera)') },
  { id: 'GD01H', nome: 'Casa Modernista' }
].filter(c => porId[c.id]);
// Redes sociais REAIS confirmadas no site (não inventar perfis).
// Os botões de Instagram/Facebook/e-mail foram PROMOVIDOS para botões principais (LINKTREE) para
// ganhar destaque. Aqui no rodapé fica só o telefone, que não vira botão principal.
const LINKTREE_REDES = [
  { rede: 'Telefone', label: '(61) 99193-5013', href: 'tel:+5561991935013', emoji: '📞' },
  { rede: 'YouTube', label: 'YouTube', href: 'https://www.youtube.com/@augustovilllela', emoji: '▶️' },
  { rede: 'TikTok', label: 'TikTok', href: 'https://www.tiktok.com/@augustovillela0', emoji: '🎵' },
  { rede: 'Telegram', label: 'Telegram', href: 'https://t.me/augustovilleladf', emoji: '✈️' },
  { rede: 'X', label: 'X / Twitter', href: 'https://twitter.com/augustovillela', emoji: '𝕏' },
  { rede: 'LinkedIn', label: 'LinkedIn', href: 'https://www.linkedin.com/in/augustovillela', emoji: '💼' },
  { rede: 'Spotify', label: 'Spotify', href: 'https://open.spotify.com/user/12175913829', emoji: '🎧' }
];

const linktreeBtn = b => `<a class="lt-btn${b.destaque ? ' lt-destaque' : ''}${b.wa ? ' lt-wa' : ''}" href="${b.href}"${/^https?:|^tel:/.test(b.href) ? ' target="_blank" rel="noopener"' : ''}>
  <span class="lt-emoji" aria-hidden="true">${b.emoji}</span>
  <span class="lt-txt"><strong>${esc(b.titulo)}</strong>${b.sub ? `<small>${esc(b.sub)}</small>` : ''}</span>
</a>`;

// Seletor de idioma da linktree (PT · EN · ES) — aponta para a MESMA página /links.html de cada idioma.
const ltLangs = IDIOMAS.map(l => {
  const href = (l === 'pt' ? '' : '/' + l) + '/links.html';
  const ativo = l === LANG;
  return `<a class="lt-lang${ativo ? ' lt-lang-ativo' : ''}" hreflang="${HTML_LANG[l]}" href="${href}"${ativo ? ' aria-current="true"' : ''}>${NOME_IDIOMA[l]}</a>`;
}).join('');

const linktreeHtml = `<!DOCTYPE html>
<html lang="${HTML_LANG[LANG]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t('Links da Villela Stay — Hospedagens no Lago Sul, Brasília', 'Villela Stay Links — Stays in Lago Sul, Brasília', 'Enlaces de Villela Stay — Alojamientos en Lago Sul, Brasília'))}</title>
<meta name="description" content="${esc(t('Todos os links da Villela Stay: reservar, WhatsApp, eventos, pacotes, blog e redes sociais. Hospedagens inteligentes no Lago Sul, Brasília.', 'All Villela Stay links: book, WhatsApp, events, packages, blog and social media. Smart stays in Lago Sul, Brasília.', 'Todos los enlaces de Villela Stay: reservar, WhatsApp, eventos, paquetes, blog y redes sociales. Alojamientos inteligentes en Lago Sul, Brasília.'))}">
<link rel="canonical" href="${SITE_URL}${LANG === 'pt' ? '' : '/' + LANG}/links.html">
${hreflangTags('/links.html')}
${TEM_LOGO ? '<link rel="icon" type="image/png" href="/logo.png">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Villela Stay">
<meta property="og:title" content="${esc(t('Links da Villela Stay', 'Villela Stay Links', 'Enlaces de Villela Stay'))}">
<meta property="og:description" content="${esc(t('Reservar, WhatsApp, eventos, pacotes, blog e redes sociais da Villela Stay — Lago Sul, Brasília.', 'Book, WhatsApp, events, packages, blog and social media of Villela Stay — Lago Sul, Brasília.', 'Reservar, WhatsApp, eventos, paquetes, blog y redes sociales de Villela Stay — Lago Sul, Brasília.'))}">
<meta property="og:url" content="${SITE_URL}${LANG === 'pt' ? '' : '/' + LANG}/links.html">
<meta property="og:image" content="${SITE_URL}/og-home.jpg">
<meta property="og:locale" content="${LANG === 'en' ? 'en_US' : (LANG === 'es' ? 'es_ES' : 'pt_BR')}">
<meta name="theme-color" content="${PWA.themeColor}">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-5L2YQ2BPQW"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-5L2YQ2BPQW');</script>
<style>
  :root{ --lt-fundo:#0c3644; --lt-fundo2:#145066; --lt-creme:#f2ecd8; --lt-ouro:#d9a441; --lt-branco:#fff; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    background:radial-gradient(120% 80% at 50% 0%, var(--lt-fundo2) 0%, var(--lt-fundo) 60%) fixed;
    color:var(--lt-creme); min-height:100vh; padding:32px 18px 48px; -webkit-font-smoothing:antialiased; }
  .lt-wrap{ max-width:480px; margin:0 auto; text-align:center; }
  .lt-logo{ width:104px; height:104px; border-radius:50%; object-fit:cover; background:var(--lt-branco);
    padding:8px; box-shadow:0 6px 22px rgba(0,0,0,.28); margin:0 auto 16px; display:block; }
  .lt-marca{ font-size:1.7rem; font-weight:800; letter-spacing:.5px; color:var(--lt-branco); }
  .lt-marca span{ color:var(--lt-ouro); }
  .lt-tag{ font-size:.95rem; color:var(--lt-creme); opacity:.92; margin:6px 0 26px; line-height:1.5; }
  .lt-btn{ display:flex; align-items:center; gap:14px; text-align:left; text-decoration:none;
    background:rgba(255,255,255,.07); border:1.5px solid rgba(242,236,216,.28); color:var(--lt-creme);
    border-radius:16px; padding:15px 18px; margin:0 0 13px; transition:transform .12s ease, background .12s ease, border-color .12s ease; }
  .lt-btn:hover{ transform:translateY(-2px); background:rgba(255,255,255,.13); border-color:var(--lt-ouro); }
  .lt-btn:active{ transform:translateY(0); }
  .lt-emoji{ font-size:1.5rem; width:30px; text-align:center; flex:0 0 auto; }
  .lt-txt{ display:flex; flex-direction:column; line-height:1.25; }
  .lt-txt strong{ font-size:1.04rem; }
  .lt-txt small{ font-size:.82rem; opacity:.82; margin-top:2px; }
  .lt-destaque{ background:var(--lt-ouro); border-color:var(--lt-ouro); color:#3a2410; }
  .lt-destaque:hover{ background:#e6b24f; color:#3a2410; }
  .lt-wa{ background:rgba(37,211,102,.16); border-color:rgba(37,211,102,.55); }
  .lt-wa:hover{ background:rgba(37,211,102,.26); border-color:#25d366; }
  .lt-sep{ font-size:.78rem; letter-spacing:1.5px; text-transform:uppercase; opacity:.65;
    margin:24px 0 14px; display:flex; align-items:center; gap:12px; }
  .lt-sep::before,.lt-sep::after{ content:''; flex:1; height:1px; background:rgba(242,236,216,.25); }
  .lt-redes{ display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-top:6px; }
  .lt-rede{ display:inline-flex; align-items:center; gap:7px; text-decoration:none; color:var(--lt-creme);
    background:rgba(255,255,255,.06); border:1px solid rgba(242,236,216,.22); border-radius:999px;
    padding:8px 14px; font-size:.86rem; transition:background .12s, border-color .12s; }
  .lt-rede:hover{ background:rgba(255,255,255,.13); border-color:var(--lt-ouro); }
  .lt-voltar{ display:inline-flex; align-items:center; gap:7px; text-decoration:none;
    color:var(--lt-creme); opacity:.78; background:rgba(255,255,255,.05);
    border:1px solid rgba(242,236,216,.22); border-radius:999px; padding:7px 16px;
    font-size:.85rem; margin:0 auto 22px; transition:opacity .12s, border-color .12s, background .12s; }
  .lt-voltar:hover{ opacity:1; border-color:var(--lt-ouro); background:rgba(255,255,255,.1); }
  .lt-langs{ display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin:0 0 22px; }
  .lt-lang{ text-decoration:none; color:var(--lt-creme); background:rgba(255,255,255,.06);
    border:1px solid rgba(242,236,216,.22); border-radius:999px; padding:6px 14px; font-size:.84rem;
    transition:background .12s, border-color .12s; }
  .lt-lang:hover{ background:rgba(255,255,255,.13); border-color:var(--lt-ouro); }
  .lt-lang-ativo{ background:var(--lt-ouro); border-color:var(--lt-ouro); color:#3a2410; font-weight:700; }
  .lt-rodape{ margin-top:30px; font-size:.78rem; opacity:.6; line-height:1.6; }
  .lt-rodape a{ color:var(--lt-creme); }
</style>
</head>
<body>
<main class="lt-wrap">
  ${TEM_LOGO ? '<img class="lt-logo" src="/logo.png" alt="Villela Stay" width="104" height="104">' : ''}
  <div class="lt-marca">Villela <span>Stay</span></div>
  <p class="lt-tag">${t('Hospedagens Inteligentes · para Experiências Inesquecíveis', 'Smart Stays · for Unforgettable Experiences', 'Alojamientos Inteligentes · para Experiencias Inolvidables')}</p>

  <a class="lt-voltar" href="${L('/')}"><span aria-hidden="true">🌐</span> ${t('Ir para o site', 'Go to the website', 'Ir al sitio')}</a>

  <nav class="lt-langs" aria-label="${esc(t('Idioma', 'Language', 'Idioma'))}">${ltLangs}</nav>

  ${LINKTREE.map(linktreeBtn).join('\n  ')}

  <div class="lt-sep">${t('Nossas casas', 'Our houses', 'Nuestras casas')}</div>
  ${LINKTREE_CASAS.map(c => linktreeBtn({
    emoji: '🔑', titulo: c.nome, sub: porId[c.id].titulo ? `${porId[c.id].hospedes} ${t('hóspedes', 'guests', 'huéspedes')}` : '',
    href: `${L(`/hospedagem/${c.id}.html`)}?origem=linktree`
  })).join('\n  ')}

  <div class="lt-sep">${t('Telefone &amp; redes', 'Phone &amp; social', 'Teléfono y redes')}</div>
  <div class="lt-redes">
    ${LINKTREE_REDES.map(r => `<a class="lt-rede" href="${r.href}"${/^https?:/.test(r.href) ? ' target="_blank" rel="noopener"' : ''}><span aria-hidden="true">${r.emoji}</span>${esc(r.label)}</a>`).join('\n    ')}
  </div>

  <p class="lt-rodape">
    ${t('Lago Sul, Brasília-DF · 10 min do Aeroporto JK e da Esplanada', 'Lago Sul, Brasília · 10 min from JK Airport and the Esplanada', 'Lago Sul, Brasília-DF · 10 min del Aeropuerto JK y de la Explanada')}<br>
    <a href="${L('/')}">villelastay.com.br</a>
  </p>
</main>
<script>
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('a');
  if (a && typeof gtag === 'function') gtag('event', 'clique_linktree', { destino: a.getAttribute('href') });
});
</script>
</body>
</html>`;
fs.writeFileSync(path.join(od, 'links.html'), linktreeHtml);
console.log(`Gerado (${LANG}): páginas em ${LANG === 'pt' ? 'dist/' : 'dist/' + LANG + '/'}`);

} // ===================== fim do loop de idiomas =====================

// ------------------------- PWA: manifest, ícones, service worker, offline -------------------------
// Copia os ícones do app (gerados em assets/icons/) para dist/assets/icons/
const ICON_SRC = path.join(__dirname, 'assets', 'icons');
const ICON_DST = path.join(DIST, 'assets', 'icons');
fs.mkdirSync(ICON_DST, { recursive: true });
const ICON_FILES = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon-180.png'];
for (const f of ICON_FILES) fs.copyFileSync(path.join(ICON_SRC, f), path.join(ICON_DST, f));

// manifest.webmanifest
const manifest = {
  name: 'Villela Stay',
  short_name: 'Villela',
  description: 'Hospedagem por temporada no Lago Sul, Brasília: casas com piscina aquecida, flats e suítes. Reserva direta com o anfitrião.',
  lang: 'pt-BR',
  dir: 'ltr',
  start_url: '/?source=pwa',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  theme_color: PWA.themeColor,
  background_color: PWA.backgroundColor,
  categories: ['travel', 'lifestyle', 'business'],
  icons: [
    { src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/assets/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ],
  // Shortcuts precisam estar DENTRO do scope (mesma origem) — links externos (wa.me) são
  // ignorados por alguns navegadores. O CTA para o WhatsApp fica nas próprias páginas.
  shortcuts: [
    {
      name: 'Ver as casas', short_name: 'Reservar',
      description: 'Ver e reservar as hospedagens',
      url: '/?source=pwa#hospedagens',
      icons: [{ src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
    },
    {
      name: 'Eventos', short_name: 'Eventos',
      description: 'Casamentos, formaturas e festas no Lago Sul',
      url: '/eventos.html',
      icons: [{ src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
    },
    {
      name: 'Pacotes especiais', short_name: 'Pacotes',
      description: 'Natal, Réveillon, Posse 2027 e Carnaval',
      url: '/pacotes.html',
      icons: [{ src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
    }
  ]
};
fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// Página offline (branded, simples) — servida pelo SW quando uma navegação falha sem cache.
const offline = layout(
  'Você está offline | Villela Stay',
  'Sem conexão no momento. Reconecte para ver as hospedagens da Villela Stay.',
  `
<section class="hero hero-menor">
  <h1>Você está offline</h1>
  <p><strong>Não conseguimos carregar esta página agora.</strong> Verifique sua conexão e tente novamente — assim que voltar a rede, é só recarregar.</p>
  <div class="hero-cta">
    <a class="btn" href="/">Tentar a página inicial</a>
    <a class="btn btn-claro" href="${waLink('Olá! Vim pelo app da Villela Stay.')}">Falar no WhatsApp</a>
  </div>
</section>`,
  { caminho: '/offline.html' }
);
fs.writeFileSync(path.join(DIST, 'offline.html'), offline);

// Service Worker. Precache do app-shell (home, CSS, logo, offline, ícones e páginas das unidades).
// Estratégia: network-first para navegação/HTML (nunca servir página velha); stale-while-revalidate
// para estáticos (CSS/imagens/ícones). NUNCA cacheia chamadas ao backend/API (sempre rede).
const PRECACHE_URLS = [
  '/', '/index.html', '/style.css', '/offline.html', '/manifest.webmanifest',
  ...(TEM_LOGO ? ['/logo.png'] : []),
  ...ICON_FILES.map(f => `/assets/icons/${f}`),
  '/eventos.html', '/pacotes.html', '/guia.html', '/regras.html', '/faq.html', '/blog.html', '/links.html',
  ...listings.map(l => `/hospedagem/${l.id}.html`)
];
const sw = `// Service Worker da Villela Stay (PWA) — gerado por build.js. NÃO editar à mão.
const CACHE = '${PWA.cacheVersion}';
const PRECACHE = ${JSON.stringify(PRECACHE_URLS)};
const BACKEND = '${BACKEND}';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll é atômico; cacheia o que der (alguns recursos podem faltar em dev)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // só GET
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // ignora cross-origin (backend/API, GA, fontes)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/webhooks/')) return; // nunca cachear API

  // Navegação / documentos HTML: network-first (não servir página velha), cai no cache, depois offline.html
  const aceitaHtml = req.headers.get('accept') && req.headers.get('accept').indexOf('text/html') !== -1;
  if (req.mode === 'navigate' || aceitaHtml) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/offline.html')))
    );
    return;
  }

  // Estáticos (CSS, imagens, ícones): stale-while-revalidate
  event.respondWith(
    caches.match(req).then((hit) => {
      const rede = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || rede;
    })
  );
});
`;
fs.writeFileSync(path.join(DIST, 'sw.js'), sw);

// ------------------------- sitemap.xml e robots.txt -------------------------
const hoje = new Date().toISOString().slice(0, 10);
// Rotas com prioridade/frequência por tipo de página (ajuda o crawler a priorizar)
const rotas = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/eventos.html', changefreq: 'weekly', priority: '0.9' },
  { loc: '/pacotes.html', changefreq: 'weekly', priority: '0.9' },
  ...LANDINGS.map(lp => ({ loc: `/${lp.arquivo}`, changefreq: 'weekly', priority: '0.8' })),
  { loc: '/posse-2027.html', changefreq: 'weekly', priority: '0.7' },
  { loc: '/blog.html', changefreq: 'weekly', priority: '0.7' },
  ...BLOG.map(a => ({ loc: `/blog/${a.slug}.html`, changefreq: 'monthly', priority: '0.6' })),
  { loc: '/nossa-historia.html', changefreq: 'monthly', priority: '0.5' },
  { loc: '/guia.html', changefreq: 'monthly', priority: '0.4' },
  { loc: '/regras.html', changefreq: 'monthly', priority: '0.4' },
  { loc: '/faq.html', changefreq: 'monthly', priority: '0.6' },
  { loc: '/pre-checkin.html', changefreq: 'monthly', priority: '0.3' },
  { loc: '/links.html', changefreq: 'monthly', priority: '0.4' },
  ...listings.map(l => ({ loc: `/hospedagem/${l.id}.html`, changefreq: 'weekly', priority: '0.8' }))
];
const absLoc = (lang, loc) => `${SITE_URL}${lang === 'pt' ? '' : '/' + lang}${loc}`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${rotas.flatMap(r => IDIOMAS.map(lang => `  <url><loc>${absLoc(lang, r.loc)}</loc><lastmod>${hoje}</lastmod><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority>${IDIOMAS.map(l => `<xhtml:link rel="alternate" hreflang="${HTML_LANG[l]}" href="${absLoc(l, r.loc)}"/>`).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${absLoc('pt', r.loc)}"/></url>`)).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Site gerado: ${rotas.length} rotas × ${IDIOMAS.length} idiomas + sitemap.xml + robots.txt`);
