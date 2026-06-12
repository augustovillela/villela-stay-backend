// =====================================================================
// Gerador estático do site Villela Stay
// Lê data/listings.json (exportado da API Stays) e gera o site em dist/
// Rodar: node build.js
// =====================================================================
const fs = require('fs');
const path = require('path');

const BACKEND = 'https://villela-stay-backend.onrender.com';
const WHATSAPP = '556191935013';
// Trocar para https://villelastay.com.br na virada do domínio (afeta canonical, og:url e sitemap)
const SITE_URL = 'https://villela-stay-site.onrender.com';
const listings = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'listings.json'), 'utf8').replace(/^﻿/, ''));

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
  ? `<a class="marca" href="/"><img class="logo" src="/logo.png" alt="Villela Stay — Hospedagens Inteligentes"></a>`
  : `<a class="marca" href="/">Villela <span>Stay</span></a>`;
const TAGLINE = `<span class="tagline">Hospedagens Inteligentes<br>para Experiências Inesquecíveis.</span>`;

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const real = n => 'R$ ' + n.toLocaleString('pt-BR');

// Seções da home na ordem definida pelo Augusto (11/06/2026)
const SECOES = [
  { titulo: 'Reserve O Espaço Inteiro de Uma Casa Bem Equipada', ids: ['GI01I', 'GD01H', 'GG04I', 'PL02I', 'GD03H', 'YV01I'] },
  { titulo: 'Reserve um Flat para até 6 pessoas com cozinha completa e área externa compartilhadas', ids: ['VH01H', 'VH02H', 'UD03H', 'UF08H', 'UF01H', 'UF07H'] },
  { titulo: 'Reserve Uma Suíte Privativa na Casa Modernista com sala e cozinha compartilhadas', ids: ['UH01H', 'UH06H', 'UH04H', 'UH05H', 'UH03H'] },
  { titulo: 'Reserve Uma Suíte Privativa na Gran Villela Home Stay com sala e cozinha compartilhadas', ids: ['UF06H', 'UF05H', 'UD09H'] }
];
const porId = Object.fromEntries(listings.map(l => [l.id, l]));

const waLink = txt => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(txt)}`;

function layout(titulo, descricao, corpo, opts = {}) {
  const { extraHead = '', caminho = '/', ogImage = `${SITE_URL}/logo.png` } = opts;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://ville.stays.com.br">
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
<link rel="canonical" href="${SITE_URL}${caminho}">
${TEM_LOGO ? '<link rel="icon" type="image/png" href="/logo.png">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Villela Stay">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${SITE_URL}${caminho}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:locale" content="pt_BR">
${extraHead}
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="topo">
  <div class="marca-bloco">${MARCA}${TAGLINE}</div>
  <nav>
    <a href="/#hospedagens">Hospedagens</a>
    <a href="/eventos.html">Eventos</a>
    <a href="/pacotes.html">Pacotes Especiais</a>
    <a href="/regras.html">Regras da Casa</a>
    <a href="/guia.html">Guia do Hóspede</a>
    <a href="${waLink('Olá! Vim pelo site da Villela Stay.')}" class="btn-wa-nav">WhatsApp</a>
  </nav>
</header>
${corpo}
<footer class="rodape">
  <div>
    <strong>Villela Stay</strong> — Hospedagem por temporada no Lago Sul, Brasília-DF<br>
    SMDB Conjunto 29, Lago Sul, Brasília-DF
    <p class="rodape-distancias">
      Casa Modernista: 10 minutos do Aeroporto<br>
      Gran Villela Home Stay: 15 minutos da Esplanada
    </p>
  </div>
  <div class="rodape-links">
    <strong>Navegue</strong>
    <a href="/pre-checkin.html">Pré-check-in online</a>
    <a href="/guia.html">Guia do Hóspede</a>
    <a href="/posse-2027.html">Posse Presidencial 2027</a>
    <a href="/formaturas.html">Formaturas</a>
    <a href="/casamentos.html">Casamentos</a>
    <a href="/festas-infantis.html">Festas Infantis</a>
    <a href="/empresas.html">Empresas &amp; Embaixadas</a>
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
  <div class="creditos">Fotos dos pontos turísticos: krishna naudin, Cayambe, Matheusgf, Portal da Copa, Marinelson Almeida e Rose Ramalho, via Wikimedia Commons (licenças CC BY / CC BY-SA).</div>
</footer>
<a class="wa-flutuante" href="${waLink('Olá! Vim pelo site da Villela Stay.')}" aria-label="Falar no WhatsApp">💬</a>
<script>try { fetch('${BACKEND}/api/hit?p=' + encodeURIComponent(location.pathname) + '&r=' + encodeURIComponent(document.referrer), { keepalive: true }); } catch (e) {}</script>
<script>
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('a[href*="wa.me"]');
  if (a && typeof gtag === 'function') gtag('event', 'clique_whatsapp', { pagina: location.pathname });
});
document.addEventListener('submit', function(e){
  if (typeof gtag === 'function') gtag('event', 'envio_formulario', { formulario: e.target.id || e.target.className || 'form', pagina: location.pathname });
}, true);
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------- home
const card = l => `
<a class="card" href="/hospedagem/${l.id}.html">
  <img loading="lazy" src="${l.fotoPrincipal}" alt="${esc(l.titulo)}">
  <div class="card-info">
    <h3>${esc(l.titulo)}</h3>
    <p>${l.hospedes} hóspedes · ${l.quartos} quarto${l.quartos > 1 ? 's' : ''} · ${l.banheiros} banheiro${l.banheiros > 1 ? 's' : ''}${l.m2 ? ` · ${l.m2} m²` : ''}</p>
  </div>
</a>`;

const cards = SECOES.map(sec => {
  const itens = sec.ids.map(id => porId[id]).filter(Boolean);
  return `<h2 class="secao-titulo">${esc(sec.titulo)}</h2>\n<div class="grade">${itens.map(card).join('\n')}</div>`;
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

const home = layout(
  'Villela Stay — Casas, flats e suítes no Lago Sul, Brasília',
  'Hospedagem por temporada no Lago Sul: casas com piscina aquecida para até 32 pessoas, flats e suítes. Reserva direta com o anfitrião.',
  `
<section class="hero hero-slideshow">
  <div class="hero-bg" aria-hidden="true">
    ${heroFotos.map((u, i) => `<img src="${u}" alt="" ${i === 0 ? 'class="ativa" fetchpriority="high"' : 'loading="lazy" decoding="async"'}>`).join('\n    ')}
  </div>
  <div class="hero-conteudo">
    <h1>Seu Porto Seguro no Lago Sul em Brasília</h1>
    <p><strong>Casas muito bem localizadas, confortáveis, bem equipadas, com cozinha completa e piscina aquecida.<br>Excelentes tanto para casais quanto para grupos de 60 pessoas.<br>Reserve diretamente com o anfitrião para um atendimento personalizado.</strong></p>
    <div class="hero-cta">
      <a class="btn" href="#hospedagens">Ver hospedagens</a>
      <a class="btn btn-claro" href="/eventos.html">Eventos</a>
    </div>
  </div>
</section>
<script>
(function(){
  var imgs = document.querySelectorAll('.hero-bg img');
  if (imgs.length < 2) return;
  var i = 0;
  setInterval(function(){
    imgs[i].classList.remove('ativa');
    i = (i + 1) % imgs.length;
    imgs[i].classList.add('ativa');
  }, 5000);
})();
</script>
<section class="faixa-confianca">
  <div>🏆 Superhost: anfitrião premiado</div><div>🏅 Favorito dos Hóspedes: propriedades premiadas</div><div>📍 10 min do Aeroporto JK e da Esplanada</div><div>👨‍👩‍👧‍👦 Hospedagens de grupos de até 60 pessoas</div><div>🎉 Eventos para até 150 pessoas</div>
</section>
<section class="depoimentos-wrap">
  <h2 class="secao-titulo">O Que Dizem Nossos Hóspedes</h2>
  <div class="marquee">
    <div class="marquee-track">${[...depoimentos, ...depoimentos].map(d => `
      <figure class="depoimento">
        <div class="estrelas" aria-label="5 estrelas">★★★★★</div>
        <blockquote>“${esc(d.texto)}”</blockquote>
        <figcaption><strong>${esc(d.nome)}</strong> · ${esc(d.hospedagem)} · <span class="origem">avaliação no ${esc(d.origem)}</span></figcaption>
      </figure>`).join('\n')}
    </div>
  </div>
</section>
<section class="grade-wrap ofertas-wrap" hidden>
  <h2 class="secao-titulo">Datas Livres Nos Próximos 15 Dias — Aproveite</h2>
  <div class="grade ofertas-grade"></div>
</section>
<section id="hospedagens" class="grade-wrap">
${cards}
</section>
<script>
fetch('${BACKEND}/api/ultima-hora')
  .then(function(r){ return r.json(); })
  .then(function(ofertas){
    if (!Array.isArray(ofertas) || !ofertas.length) return;
    var wrap = document.querySelector('.ofertas-wrap');
    var grade = wrap.querySelector('.ofertas-grade');
    var meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    grade.innerHTML = ofertas.slice(0, 6).map(function(o){
      var d = new Date(o.de + 'T12:00:00');
      var quando = d.getDate() + ' de ' + meses[d.getMonth()];
      return '<a class="card oferta" href="/hospedagem/' + o.id + '.html">' +
        '<div class="card-info"><h3>' + o.titulo + '</h3>' +
        '<p>Livre a partir de <strong>' + quando + '</strong> (' + o.noites + '+ noites)' +
        (o.precoBRL ? ' · diária R$ ' + o.precoBRL.toLocaleString('pt-BR') : '') + '</p>' +
        '<p class="oferta-cta">Fale conosco e ganhe condição de última hora →</p></div></a>';
    }).join('');
    wrap.hidden = false;
  })
  .catch(function(){});
</script>`,
  {
    caminho: '/',
    ogImage: `${SITE_URL}/og-home.jpg`,
    extraHead: `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'LodgingBusiness',
      name: 'Villela Stay', url: SITE_URL, image: `${SITE_URL}/og-home.jpg`,
      address: { '@type': 'PostalAddress', streetAddress: 'SMDB Conjunto 29, Lago Sul', addressLocality: 'Brasília', addressRegion: 'DF', addressCountry: 'BR' },
      telephone: '+5561991935013',
      priceRange: 'R$ 200 - R$ 2.000',
      sameAs: ['https://instagram.com/villelastay', 'https://instagram.com/augustovillela', 'https://facebook.com/augusto.villela'],
      aggregateRating: { '@type': 'AggregateRating', ratingValue: '5', bestRating: '5', reviewCount: depoimentos.length },
      review: depoimentos.map(d => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: d.nome },
        reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
        reviewBody: d.texto
      }))
    })}</script>`
  }
);
fs.writeFileSync(path.join(DIST, 'index.html'), home);

// ------------------------------------------------- página por unidade
// Plantas humanizadas (feitas pelo Augusto) — id do anúncio -> arquivo
const PLANTAS = { GI01I: 'casa-villela.jpg', GD03H: 'gran-villela.jpg', GG04I: 'villa-kubitschek.jpg' };
fs.mkdirSync(path.join(DIST, 'plantas'), { recursive: true });
for (const p of Object.values(PLANTAS)) fs.copyFileSync(path.join(__dirname, 'src', 'plantas', p), path.join(DIST, 'plantas', p));

// Vídeos publicitários — id do anúncio -> arquivo
const VIDEOS = { GD01H: 'casa-modernista.mp4', GI01I: 'casa-villela.mp4', GD03H: 'gran-villela.mp4', PL02I: 'villa-catetinho.mp4', GG04I: 'villa-kubitschek.mp4' };
fs.mkdirSync(path.join(DIST, 'videos'), { recursive: true });
for (const v of Object.values(VIDEOS)) fs.copyFileSync(path.join(__dirname, 'src', 'videos', v), path.join(DIST, 'videos', v));

for (const l of listings) {
  const galeria = (l.fotos || []).slice(1, 9).map(f =>
    `<img loading="lazy" src="${f.url}" alt="${esc(f.nome || l.titulo)}" title="${esc(f.nome || '')}">`).join('\n');

  const pagina = layout(
    `${l.titulo} | Villela Stay`,
    String(l.resumo || l.titulo).replace(/<[^>]+>/g, '').slice(0, 155),
    `
<article class="unidade">
  <img class="capa" src="${l.fotoPrincipal}" alt="${esc(l.titulo)}" fetchpriority="high">
  <div class="unidade-cab">
    <nav class="breadcrumb"><a href="/">Início</a> › <a href="/#hospedagens">Hospedagens</a> › <span>${esc(l.titulo)}</span></nav>
    <h1>${esc(l.titulo)}</h1>
    <p class="ficha">${l.hospedes} hóspedes · ${l.quartos} quarto${l.quartos > 1 ? 's' : ''} · ${l.camas} cama${l.camas > 1 ? 's' : ''} · ${l.banheiros} banheiro${l.banheiros > 1 ? 's' : ''}${l.m2 ? ` · ${l.m2} m²` : ''} · ${esc(l.bairro)}</p>
  </div>
  <section class="disponibilidade" data-listing="${l.mongoId}">
    <h2>Consultar disponibilidade e preço</h2>
    <div class="disp-form">
      <label>Entrada <input type="date" class="disp-in"></label>
      <label>Saída <input type="date" class="disp-out"></label>
      <button class="btn disp-btn">Consultar</button>
    </div>
    <div class="disp-resultado" hidden></div>
    <a class="btn btn-wa disp-reservar" href="${waLink(`Olá! Quero reservar a ${l.titulo}.`)}">Reservar pelo WhatsApp</a>
  </section>
  ${VIDEOS[l.id] ? `<section class="video-wrap">
    <h2>Conheça por dentro</h2>
    <video controls preload="metadata" playsinline poster="${l.fotoPrincipal}">
      <source src="/videos/${VIDEOS[l.id]}" type="video/mp4">
    </video>
  </section>` : ''}
  <section class="lead-box">
    <h2>Prefere receber a cotação? Deixe seu contato 👇</h2>
    <form class="form-lead">
      <input name="nome" placeholder="Seu nome*" required>
      <input name="contato" placeholder="Seu WhatsApp ou e-mail*" required>
      <button class="btn" type="submit">Quero uma cotação</button>
      <p class="form-status" hidden></p>
    </form>
  </section>
  <section class="descricao">${l.descricao || ''}</section>
  ${PLANTAS[l.id] ? `<section class="planta">
    <h2>Planta do espaço</h2>
    <a href="/plantas/${PLANTAS[l.id]}" target="_blank" rel="noopener"><img loading="lazy" src="/plantas/${PLANTAS[l.id]}" alt="Planta do espaço — ${esc(l.titulo)}"></a>
    <p class="planta-dica">Clique na planta para ampliar.</p>
  </section>` : ''}
  <section class="galeria"><h2>Fotos</h2><div class="galeria-grid">${galeria}</div></section>
  <section class="relacionados">
    <h2>Veja também</h2>
    <p><a href="/pacotes.html">Pacotes Especiais</a> · <a href="/eventos.html">Eventos no Lago Sul</a> · <a href="/guia.html">Guia do Hóspede</a> · <a href="/regras.html">Regras da Casa</a></p>
  </section>
</article>
<script>
(function(){
  var sec = document.querySelector('.disponibilidade');
  var btn = sec.querySelector('.disp-btn'), out = sec.querySelector('.disp-resultado');
  btn.addEventListener('click', function(){
    var de = sec.querySelector('.disp-in').value, ate = sec.querySelector('.disp-out').value;
    if (!de || !ate) { out.hidden = false; out.textContent = 'Escolha as duas datas.'; return; }
    out.hidden = false; out.textContent = 'Consultando...';
    fetch('${BACKEND}/api/disponibilidade/${l.mongoId}?from=' + de + '&to=' + ate)
      .then(function(r){ return r.json(); })
      .then(function(dias){
        var noites = dias.slice(0, -1);
        var livres = noites.filter(function(d){ return d.disponivel; });
        var total = noites.reduce(function(s, d){ return s + (d.precoBRL || 0); }, 0);
        var wa = sec.querySelector('.disp-reservar');
        if (noites.length && livres.length === noites.length) {
          out.innerHTML = '✅ Disponível! ' + noites.length + ' noite(s) — total estimado <strong>R$ ' +
            total.toLocaleString('pt-BR') + '</strong>. Garanta pelo WhatsApp 👇';
          wa.href = 'https://wa.me/${WHATSAPP}?text=' + encodeURIComponent('Olá! Quero reservar a ${l.titulo} de ' + de + ' a ' + ate + ' — total estimado R$ ' + total.toLocaleString('pt-BR') + '. Pode confirmar?');
        } else {
          out.innerHTML = '😕 Sem disponibilidade completa nessas datas. Fale conosco no WhatsApp — encontramos a casa ideal para você.';
          wa.href = 'https://wa.me/${WHATSAPP}?text=' + encodeURIComponent('Olá! Consultei a ${l.titulo} de ' + de + ' a ' + ate + ' e não havia disponibilidade completa. Pode me ajudar com datas ou casas alternativas?');
        }
      })
      .catch(function(){ out.textContent = 'Não foi possível consultar agora. Fale conosco pelo WhatsApp.'; });
  });

  var fl = document.querySelector('.form-lead');
  fl.addEventListener('submit', function(e){
    e.preventDefault();
    var st = fl.querySelector('.form-status');
    st.hidden = false; st.textContent = 'Enviando...';
    var de = sec.querySelector('.disp-in').value, ate = sec.querySelector('.disp-out').value;
    fetch('${BACKEND}/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: fl.nome.value, contato: fl.contato.value,
        mensagem: 'Cotação ${l.id} - ${l.titulo}' + (de && ate ? (' | datas: ' + de + ' a ' + ate) : ''),
        origem: 'site-${l.id}'
      })
    }).then(function(r){
      st.textContent = r.ok ? '✅ Recebido! Em breve enviaremos sua cotação.' : 'Erro ao enviar — fale conosco pelo WhatsApp.';
      if (r.ok) fl.reset();
    }).catch(function(){ st.textContent = 'Erro ao enviar — fale conosco pelo WhatsApp.'; });
  });
})();
</script>`,
    {
      caminho: `/hospedagem/${l.id}.html`,
      ogImage: l.fotoPrincipal,
      extraHead: `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Accommodation',
        name: l.titulo, image: l.fotoPrincipal, url: `${SITE_URL}/hospedagem/${l.id}.html`,
        address: { '@type': 'PostalAddress', addressLocality: 'Brasília', addressRegion: 'DF', addressCountry: 'BR' },
        occupancy: { '@type': 'QuantitativeValue', maxValue: l.hospedes },
        numberOfBedrooms: l.quartos
      })}</script>
<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: SITE_URL + '/' },
          { '@type': 'ListItem', position: 2, name: 'Hospedagens', item: SITE_URL + '/#hospedagens' },
          { '@type': 'ListItem', position: 3, name: l.titulo, item: `${SITE_URL}/hospedagem/${l.id}.html` }
        ]
      })}</script>`
    }
  );
  fs.writeFileSync(path.join(DIST, 'hospedagem', `${l.id}.html`), pagina);
}

// ------------------------- eventos (página de vendas) -------------------------
const CASAS_EVENTO = [
  {
    id: 'GG04I', nome: 'Villa Kubitschek', convidados: 150,
    local: 'SMDB Conjunto 29, Lago Sul',
    destaque: 'O maior espaço — casamentos, formaturas e grandes confraternizações'
  },
  {
    id: 'GD01H', nome: 'Casa Modernista', convidados: 80,
    local: 'SHIS QI 7, Conjunto 3, Lago Sul',
    destaque: 'Arquitetura icônica para festas e eventos corporativos'
  },
  {
    id: 'GI01I', nome: 'Casa Villela', convidados: 60,
    local: 'SMDB Conjunto 29, Lago Sul',
    destaque: 'Aconchegante para aniversários, batizados e festas em família'
  }
];

const cardsEventos = CASAS_EVENTO.map(c => {
  const l = porId[c.id];
  const exemplo = c.convidados * 100 + 1000;
  return `
<article class="casa-pacote">
  <img loading="lazy" src="${l ? l.fotoPrincipal : ''}" alt="${esc(c.nome)}">
  <div class="casa-pacote-corpo">
    <h3>${esc(c.nome)}</h3>
    <p class="casa-meta">🕺 até ${c.convidados} convidados · 🕙 das 10h às 22h · 📍 ${esc(c.local)}</p>
    <p>${esc(c.destaque)}.</p>
    <div class="preco-bloco">
      <div class="preco-principal">R$ 100 <span>por convidado</span> + R$ 1.000 <span>de limpeza profissional</span></div>
      <div class="preco-detalhe">Exemplo com lotação máxima (${c.convidados} convidados): <strong>${real(exemplo)}</strong> pelo dia inteiro de evento — piscina, churrasqueira e cozinha completa inclusas.</div>
    </div>
    <a class="btn btn-wa" href="${waLink(`Olá! Quero fazer um evento na ${c.nome}. Data: ___ | Nº de convidados: ___ | Tipo de evento: ___`)}">Orçar evento na ${esc(c.nome)} →</a>
  </div>
</article>`;
}).join('\n');

const eventos = layout(
  'Eventos no Lago Sul — casamentos, formaturas e festas | Villela Stay',
  'Alugue o espaço externo das casas da Villela Stay no Lago Sul para seu evento: piscina, churrasqueira e cozinha completa. R$ 100 por convidado, das 10h às 22h.',
  /* corpo */ `
<section class="hero hero-menor">
  <h1>Seu evento no Lago Sul em Brasília</h1>
  <p><strong>Casamentos, formaturas, aniversários, festas infantis, confraternizações, eventos corporativos e reuniões familiares:</strong> alugue por um dia o espaço externo completo de uma de nossas casas no Lago Sul — com piscina, churrasqueira e cozinha. Entregamos a casa limpa e arrumamos tudo depois. Você só traz os seus convidados.</p>
</section>
<div class="pacotes-wrap">

  <section class="venda-bloco como-funciona">
    <h2 class="secao-titulo">Como funciona</h2>
    <div class="passos">
      <div class="passo"><strong>1. Escolha a casa pelo tamanho da festa</strong><br>Eventos de 30 a 150 convidados com espaço exclusivo das 10h às 22h.</div>
      <div class="passo"><strong>2. Preço simples e transparente</strong><br>Por apenas R$ 100 por convidado e R$ 1000 de taxa de limpeza — necessários para pagar duas diaristas, material de limpeza, sacos de lixo, etc.</div>
      <div class="passo"><strong>3. Estrutura pronta</strong><br>Cozinha com gás, utensílios, detergente; churrasqueira a gás e a carvão; banheiros com sabonete líquido, papel toalha e papel higiênico.</div>
    </div>
  </section>

  <section class="venda-bloco">
    <h2 class="secao-titulo">As casas para o seu evento</h2>
    ${cardsEventos}
  </section>

  <section class="venda-bloco">
    <h2 class="secao-titulo">Combinados importantes</h2>
    <div class="passos">
      <div class="passo"><strong>🔇 Som moderado</strong><br>Pela lei do silêncio do condomínio, não permitimos banda ao vivo nem DJ com volume alto. Som ambiente é bem-vindo.</div>
      <div class="passo"><strong>🪪 Controle de entrada</strong><br>Em eventos com muitos convidados, o contratante providencia uma pessoa para controlar a entrada e saída, evitando transtornos aos vizinhos.</div>
      <div class="passo"><strong>🅿️ Eventos grandes</strong><br>Pode ser necessária a contratação de seguranças — que também orientam o estacionamento dos veículos dos convidados.</div>
    </div>
    <p class="aviso-escassez">💡 Nas datas especiais funcionamos apenas com <strong>pacotes de hospedagem combinados com eventos</strong> — veja os <a href="/pacotes.html">Pacotes Especiais</a>.</p>
  </section>

  <section class="venda-bloco cta-final">
    <h2>Peça seu orçamento</h2>
    <p>Responda três perguntas — data, número de convidados e tipo de evento — e devolvemos a proposta completa.</p>
    <a class="btn btn-wa btn-grande" href="${waLink('Olá! Quero orçar um evento. Data: ___ | Nº de convidados: ___ | Tipo de evento: ___')}">Orçar pelo WhatsApp</a>
    <p style="margin-top:24px">Ou deixe seu contato que retornamos:</p>
    <form id="form-evento" class="form-evento form-evento-claro">
      <label>Seu nome* <input name="nome" required></label>
      <label>WhatsApp ou e-mail* <input name="contato" required></label>
      <label>Conte sobre o evento (tipo, data, nº de convidados) <textarea name="mensagem" rows="3"></textarea></label>
      <button class="btn" type="submit">Pedir orçamento</button>
      <p class="form-status" hidden></p>
    </form>
  </section>
</div>
<script>
document.getElementById('form-evento').addEventListener('submit', function(e){
  e.preventDefault();
  var f = e.target, st = f.querySelector('.form-status');
  st.hidden = false; st.textContent = 'Enviando...';
  fetch('${BACKEND}/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: f.nome.value, contato: f.contato.value, mensagem: f.mensagem.value, origem: 'site-eventos' })
  }).then(function(r){
    st.textContent = r.ok ? '✅ Recebido! Retornaremos em breve.' : 'Erro ao enviar — fale conosco pelo WhatsApp.';
    if (r.ok) f.reset();
  }).catch(function(){ st.textContent = 'Erro ao enviar — fale conosco pelo WhatsApp.'; });
});
</script>`,
  { caminho: '/eventos.html' }
);
fs.writeFileSync(path.join(DIST, 'eventos.html'), eventos);

// ------------------------- pacotes (página de vendas) -------------------------
const DATAS_PACOTE = [
  { emoji: '🎄', nome: 'Natal 2026', periodo: '23 a 27/12/2026' },
  { emoji: '🎆', nome: 'Réveillon 2026/2027', periodo: '30/12/2026 a 03/01/2027' },
  { emoji: '🇧🇷', nome: 'Caravana da Posse do Novo Presidente', periodo: '30/12/2026 a 3/1/2027' },
  { emoji: '🎭', nome: 'Carnaval 2027', periodo: '6 a 10/02/2027' },
  { emoji: '🏛️', nome: 'Marcha dos Municípios 2027', periodo: 'datas sob consulta' },
  { emoji: '🏛️', nome: 'Marcha dos Prefeitos 2027', periodo: '16 a 20/5/2027 (a confirmar)' }
];

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
  `<a class="chip-data" href="${waLink(`Olá! Quero reservar uma casa completa para ${d.nome} (${d.periodo}). Somos um grupo de ___ pessoas.`)}">${d.emoji} <strong>${esc(d.nome)}</strong><span>${esc(d.periodo)}</span></a>`).join('\n');

const cardsCasas = CASAS_PACOTE.map(c => {
  const l = porId[c.id];
  const porPessoa = Math.ceil(c.pacote / c.hospedes);
  const porDia = Math.ceil(porPessoa / 4);
  return `
<article class="casa-pacote">
  <img loading="lazy" src="${l ? l.fotoPrincipal : ''}" alt="${esc(c.nome)}">
  <div class="casa-pacote-corpo">
    <h3>${esc(c.nome)}</h3>
    <p class="casa-meta">🛌 até ${c.hospedes} hóspedes · 🕺 eventos para até ${c.convidados} convidados · 📍 ${esc(c.local)}</p>
    <div class="preco-bloco">
      <div class="preco-principal">${real(c.pacote)} <span>· pacote de 4 diárias com a casa completa</span></div>
      <div class="preco-detalhe">Sai por ~<strong>${real(porPessoa)}</strong> por pessoa no total — cerca de <strong>${real(porDia)}/dia</strong>. Menos que uma diária de hotel simples nessas datas, com casa, piscina e cozinha inteiras para o seu grupo.</div>
      <div class="preco-composicao">Composição: R$ 150/dia por pessoa × 4 dias × ${c.hospedes} hóspedes + ${real(c.limpeza)} de taxa de limpeza</div>
    </div>
    <details class="quartos">
      <summary>Ver a distribuição das camas (${c.quartos.length} acomodações)</summary>
      <ul>${c.quartos.map(q => `<li><strong>${esc(q[0])}</strong><br>${esc(q[1])}</li>`).join('\n')}</ul>
    </details>
    <a class="btn btn-wa" href="${waLink(`Olá! Quero reservar a ${c.nome} completa em uma das datas especiais. Somos um grupo de ___ pessoas para a data: ___.`)}">Reservar a ${esc(c.nome)} →</a>
  </div>
</article>`;
}).join('\n');

const pacotes = layout(
  'Pacotes para Natal, Réveillon, Posse, Carnaval e Marchas | Villela Stay',
  'Casas completas no Lago Sul para as datas mais disputadas de Brasília: Natal, Réveillon, Posse Presidencial, Carnaval e Marcha dos Prefeitos. A partir de R$ 150/dia por pessoa.',
  `
<section class="hero hero-menor">
  <h1>As datas mais disputadas de Brasília.<br>As melhores casas do Lago Sul.</h1>
  <p><strong>Natal, Réveillon, Posse Presidencial, Carnaval e as Marchas dos Prefeitos e dos Municípios:</strong> quando Brasília lota e os hotéis dobram de preço, grupos inteligentes reservam uma casa completa — e cada pessoa paga menos que uma diária de hotel.</p>
</section>
<div class="pacotes-wrap">

  <section class="venda-bloco">
    <h2 class="secao-titulo">Escolha a sua data</h2>
    <div class="chips-datas">${chipsDatas}</div>
  </section>

  <section class="venda-bloco como-funciona">
    <h2 class="secao-titulo">Como funciona — simples e transparente</h2>
    <div class="passos">
      <div class="passo"><strong>1. Junte o seu grupo</strong><br>Nessas datas trabalhamos com casas completas, de 15 a 24 hóspedes — família, amigos, caravana ou comitiva.</div>
      <div class="passo"><strong>2. Cada um paga R$ 150 por dia</strong><br>Diária por pessoa com a casa lotada + rateio da taxa de limpeza. Piscina aquecida, cozinha completa e área de lazer inclusas.</div>
      <div class="passo"><strong>3. Reserve direto com o anfitrião</strong><br>Sem taxas de plataforma, com atendimento personalizado de um Superhost premiado, do primeiro contato ao check-out.</div>
    </div>
    <p class="aviso-escassez">⚠️ Temos <strong>apenas 4 casas disponíveis</strong> para cada período. Os pacotes de <strong>Natal e Réveillon</strong>, principalmente, costumam se esgotar rapidamente. Além disso, Brasília ficará pequena para os visitantes na virada do ano porque no dia <strong>1º de janeiro de 2027</strong> será a <strong>posse do novo Presidente do Brasil</strong>.</p>
  </section>

  <section class="venda-bloco">
    <h2 class="secao-titulo">As 4 casas — pacotes de 4 diárias</h2>
    <p class="pacote-cond">Check-in às 14h do primeiro dia · check-out às 10h do último · período mínimo de 4 diárias nessas datas · convidado extra para evento ou day use: R$ 120/dia</p>
    ${cardsCasas}
  </section>

  <section class="venda-bloco cta-final">
    <h2>Garanta a sua data antes que feche</h2>
    <p>Conte para a gente a data, o tamanho do grupo e a ocasião — respondemos com a proposta completa no WhatsApp.</p>
    <a class="btn btn-wa btn-grande" href="${waLink('Olá! Quero garantir um pacote de data especial. Data: ___ | Nº de pessoas: ___ | Ocasião: ___')}">Falar com o anfitrião agora</a>
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
          name: `Pacote de 4 diárias — ${c.nome}`,
          description: `Casa completa para até ${c.hospedes} hóspedes no Lago Sul, Brasília — Natal, Réveillon, Posse, Carnaval e Marchas.`,
          image: porId[c.id] ? porId[c.id].fotoPrincipal : undefined,
          offers: { '@type': 'Offer', price: c.pacote, priceCurrency: 'BRL', availability: 'https://schema.org/InStock', url: `${SITE_URL}/pacotes.html` }
        }
      }))
    })}</script>`
  }
);
fs.writeFileSync(path.join(DIST, 'pacotes.html'), pacotes);

// ------------------------- regras da casa -------------------------
const REGRAS = [
  ['1. Idade Mínima', `<p>A locação é permitida apenas para maiores de 18 anos.</p><p>Menores devem estar acompanhados pelos pais ou responsáveis legais.</p>`],
  ['2. Check-in e Check-out', `<p><strong>Check-in:</strong> a partir das 14h · <strong>Check-out:</strong> até as 10h</p>
<p>⏳ Caso autorizado, o check-in antecipado ou check-out tardio dá acesso apenas ao quarto reservado, não às áreas comuns (piscina, churrasqueira, cozinha etc.), pois nossa equipe precisa de tempo para preparar a casa com todo o cuidado que você merece.</p>
<p>⚒ Durante sua estadia, poderão ocorrer serviços pontuais de manutenção para garantir a qualidade da hospedagem.</p>
<p>🧹 No dia do check-out, a equipe iniciará a limpeza das áreas externas a partir das 8h.</p>`],
  ['3. Itens de Consumo', `<p>Cada hóspede deve trazer seus itens de uso pessoal: alimentos, bebidas, carvão, fósforo, gás, papel higiênico extra, produtos de higiene, repelente e materiais de limpeza.</p>
<p>Os itens oferecidos (na cozinha, churrasqueira e banheiros) são cortesia inicial; se acabarem, a reposição será de responsabilidade do hóspede.</p>`],
  ['4. Fumar 🚭', `<p>Proibido fumar em áreas internas (quartos e banheiros).</p><p>Nas áreas externas é permitido, desde que se use cinzeiro.</p>`],
  ['5. Animais de Estimação 🐾', `<p>Pets são bem-vindos! Mas:</p><ul><li>Não devem subir em camas, sofás ou móveis.</li><li>Qualquer dano causado será de responsabilidade do hóspede.</li></ul>`],
  ['6. Eventos e Convidados 🎉', `<p>Não são permitidos eventos comerciais, festas abertas, sublocação ou cobrança de ingresso.</p>
<p>Eventos familiares só com autorização prévia e mediante taxa.</p>
<ul><li>Convidado day-use/evento: R$ 80,00</li><li>Hóspede extra pernoite: R$ 120,00/dia</li></ul>
<p>⚠️ <strong>Importante:</strong> a casa é destinada principalmente a hospedagens. Eventos autorizados não incluem garantias quanto a clima, fornecimento de energia ou funcionamento de equipamentos alugados.</p>`],
  ['7. Som e Lei do Silêncio 🔊', `<p>Proibido: som alto, DJs, bandas ao vivo ou caixas potentes.</p>
<p>Limite de ruído:</p><ul><li>até 55 dB (7h às 22h)</li><li>até 45 dB (22h às 7h)</li></ul>
<p>Qualquer solicitação de redução deve ser atendida imediatamente.</p>`],
  ['8. Normas do Condomínio', `<p>Todos os hóspedes devem cumprir as regras do condomínio.</p><p>O hóspede principal receberá o controle do portão e deve mantê-lo sempre fechado.</p>`],
  ['9. Jacuzzi, Spa ou Hidro 🛁', `<p><strong>No aluguel do espaço inteiro</strong>, o uso da jacuzzi está incluído, sem taxa: 1 vez ao dia, por até 4 horas.</p>
<p><strong>Nas hospedagens de quartos, suítes e flats</strong>, o uso é mediante solicitação prévia e taxa de R$ 200,00 (1 vez ao dia, por até 4 horas).</p>`],
  ['10. Lavanderia', `<p>Área de lavanderia do anfitrião não está disponível.</p><p>Uma lava e seca será disponibilizada na cozinha para uso dos hóspedes.</p>`],
  ['11. Louça e Lixo 🍽️', `<p>A louça deve ser lavada antes do check-out.</p><p>Perecíveis devem ser descartados e o lixo colocado em sacos para recolhimento.</p>`],
  ['12. Multas por Descumprimento ⚠️', `<p>Quebra de regra: multa de 1 diária por ocorrência.</p>
<p>Check-in/out fora do horário:</p><ul><li>até 8h de atraso → ½ diária</li><li>acima de 8h → 1 diária</li></ul>
<p>Se outro hóspede for prejudicado, o responsável deverá arcar com o ressarcimento integral da hospedagem afetada.</p>`],
  ['13. Taxas Adicionais 💰', `<ul>
<li>Hóspede extra: R$ 120,00/noite</li>
<li>Convidado day-use/evento: R$ 80,00</li>
<li>Jacuzzi: R$ 200,00 — apenas nas hospedagens de quarto, suíte ou flat (1x ao dia, até 4h); incluída sem custo no aluguel do espaço inteiro</li>
<li>Churrasqueira: R$ 200,00</li>
<li>Copo/prato quebrado: R$ 20,00/unidade</li>
<li>Gás extra: R$ 140,00</li>
<li>Limpeza extra piscina: R$ 150,00</li>
<li>Papel higiênico adicional: R$ 10,00/pessoa</li>
<li>Ar-condicionado ligado sem necessidade: R$ 50,00</li>
<li>Uso excessivo de energia: R$ 100,00</li>
<li>Material de limpeza extra: R$ 100,00</li>
</ul>`],
  ['14. Falhas Externas', `<p>Não nos responsabilizamos por interrupções de água, energia ou fenômenos naturais.</p>`],
  ['15. Danos e Objetos Perdidos', `<p>Danos por mau uso → custo de reposição será cobrado.</p><p>Objetos esquecidos não são de nossa responsabilidade.</p>`],
  ['16. Responsabilidade', `<p>O hóspede principal é responsável por todos os ocupantes e convidados durante a estadia.</p>`],
  ['17. Manutenção', `<p>A casa recebe manutenção constante.</p><p>Reparos imediatos fora do horário comercial podem não ser possíveis.</p>`],
  ['18. Indisponibilidade Pontual', `<p>A casa oferece muitas comodidades, mas falhas isoladas (como ar-condicionado, jacuzzi ou eletrodomésticos) não geram reembolso ou cancelamento.</p>`]
];

const regras = layout(
  'Regras da Casa | Villela Stay',
  'Regras da casa da Villela Stay: check-in e check-out, pets, som, convidados, taxas adicionais e responsabilidades — tudo para uma estadia tranquila.',
  `
<section class="hero hero-menor">
  <h1>🌿 Regras da Casa – Villela Stay</h1>
  <p>Bem-vindo(a)! Para garantir que sua estadia seja confortável, segura e agradável, pedimos a gentileza de observar as seguintes regras:</p>
</section>
<div class="regras-wrap">
  ${REGRAS.map(r => `<section class="regra"><h2>${r[0]}</h2>${r[1]}</section>`).join('\n')}
  <p class="regras-aceite">✅ Ao reservar, você confirma estar de acordo com estas regras, que existem para proteger sua experiência e garantir o bem-estar de todos.</p>
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
fs.writeFileSync(path.join(DIST, 'regras.html'), regras);

// ------------------------- guia do hóspede -------------------------
const guia = layout(
  'Guia do Hóspede | Villela Stay',
  'Tudo para a sua estadia na Villela Stay: chegada, funcionamento da casa, dicas de Brasília, emergências e canal direto com o anfitrião.',
  `
<section class="hero hero-menor">
  <h1>Guia do Hóspede</h1>
  <p>Bem-vindo(a) à Villela Stay! Aqui está tudo que você precisa para aproveitar a estadia — da chegada ao check-out.</p>
</section>
<div class="regras-wrap">

  <section class="regra"><h2>🔑 Sua chegada</h2>
    <p><strong>Check-in a partir das 14h.</strong> As instruções de acesso (endereço exato, portão e chaves/senha) são enviadas pelo WhatsApp antes da sua chegada.</p>
    <p>Preencha o <a href="/pre-checkin.html"><strong>pré-check-in online</strong></a> para agilizar tudo — leva 2 minutos.</p>
  </section>

  <section class="regra"><h2>🏡 Como a casa funciona</h2>
    <ul>
      <li><strong>Cozinha:</strong> equipada com utensílios, gás e detergente para começar.</li>
      <li><strong>Churrasqueira:</strong> a gás e a carvão (traga seu carvão; uso mediante taxa — consulte as <a href="/regras.html">Regras</a>).</li>
      <li><strong>Lava e seca:</strong> disponível na cozinha para uso dos hóspedes.</li>
      <li><strong>Piscina:</strong> aproveite! Crianças sempre com supervisão de um adulto.</li>
      <li><strong>Jacuzzi/spa:</strong> no aluguel do espaço inteiro, o uso da jacuzzi é permitido uma vez por dia durante 4 horas independentemente do pagamento de taxa.</li>
      <li><strong>Lixo:</strong> ensacar e deixar no ponto de coleta indicado.</li>
      <li><strong>Silêncio:</strong> som moderado sempre; após as 22h, volume reduzido (regra do condomínio).</li>
    </ul>
  </section>

  <section class="regra"><h2>🗺️ O melhor de Brasília pertinho de você</h2>
    <ul>
      <li><strong>Pontão do Lago Sul</strong> — restaurantes e pôr do sol à beira do lago (5-10 min)</li>
      <li><strong>Ermida Dom Bosco</strong> — o pôr do sol mais bonito da cidade</li>
      <li><strong>Esplanada dos Ministérios, Congresso e Catedral</strong> — o cartão-postal (15 min)</li>
      <li><strong>Torre de TV e Feira da Torre</strong> — artesanato e gastronomia local</li>
      <li><strong>Parque da Cidade</strong> — para correr, pedalar e piquenique</li>
      <li><strong>Memorial JK</strong> — a história do fundador de Brasília</li>
    </ul>
    <p>Quer reservas em restaurantes, passeios ou transfer? Fale com o anfitrião — temos as melhores indicações.</p>
  </section>

  <section class="regra"><h2>🆘 Emergências</h2>
    <p>SAMU: <strong>192</strong> · Bombeiros: <strong>193</strong> · Polícia: <strong>190</strong></p>
    <p>Anfitrião (WhatsApp 24h): <a href="${waLink('Olá! Sou hóspede e preciso de ajuda.')}"><strong>+55 61 9193-5013</strong></a></p>
  </section>

  <section class="regra"><h2>👋 Check-out</h2>
    <p><strong>Até as 10h.</strong> Antes de sair: favor desligar os aparelhos de ar-condicionado, lavar a louça, descartar os perecíveis, ensacar o lixo e deixar as chaves na fechadura dos quartos e o controle na sinuca ou na casa do caseiro. A equipe inicia a limpeza externa às 8h.</p>
  </section>

  <section class="regra"><h2>🔧 Algo não está funcionando?</h2>
    <p>Conte para a gente que resolvemos o quanto antes:</p>
    <form id="form-chamado" class="form-evento" style="margin-top:10px">
      <label>Seu nome* <input name="nome" required></label>
      <label>Casa/unidade em que está hospedado <input name="hospedagem"></label>
      <label>O que aconteceu?* <textarea name="descricao" rows="3" required></textarea></label>
      <button class="btn" type="submit">Enviar chamado</button>
      <p class="form-status" hidden></p>
    </form>
  </section>
</div>
<script>
document.getElementById('form-chamado').addEventListener('submit', function(e){
  e.preventDefault();
  var f = e.target, st = f.querySelector('.form-status');
  st.hidden = false; st.textContent = 'Enviando...';
  fetch('${BACKEND}/api/chamados', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: f.nome.value, hospedagem: f.hospedagem.value, descricao: f.descricao.value })
  }).then(function(r){
    st.textContent = r.ok ? '✅ Chamado recebido! Vamos resolver o quanto antes.' : 'Erro ao enviar — chame no WhatsApp.';
    if (r.ok) f.reset();
  }).catch(function(){ st.textContent = 'Erro ao enviar — chame no WhatsApp.'; });
});
</script>`,
  { caminho: '/guia.html' }
);
fs.writeFileSync(path.join(DIST, 'guia.html'), guia);

// ------------------------- pré-check-in -------------------------
const precheckin = layout(
  'Pré-check-in | Villela Stay',
  'Adiante seu check-in na Villela Stay: preencha seus dados e chegue com tudo pronto.',
  `
<section class="hero hero-menor">
  <h1>Pré-check-in</h1>
  <p>Preencha antes de chegar e ganhe tempo: com seus dados em mãos, deixamos tudo pronto para receber você.</p>
</section>
<div class="form-wrap">
  <form id="form-precheckin" class="form-evento">
    <label>Nome completo* <input name="nome" required></label>
    <label>WhatsApp* <input name="contato" required></label>
    <label>E-mail <input name="email" type="email"></label>
    <label>Código da reserva (se souber) <input name="reserva" placeholder="ex.: LR03J"></label>
    <label>Casa/unidade reservada <input name="hospedagem" placeholder="ex.: Casa Modernista"></label>
    <label>Data de chegada* <input name="chegada" type="date" required></label>
    <label>Horário previsto de chegada <input name="horario" placeholder="ex.: 15h"></label>
    <label>Nº de adultos que vão se hospedar <input name="adultos" type="number" min="1"></label>
    <label>Nº de crianças que vão se hospedar <input name="criancas" type="number" min="0"></label>
    <label>Nº de Convidados para Evento ou Day Use <input name="convidados" type="number" min="0"></label>
    <label>Vai trazer pet? Qual? <input name="pets" placeholder="ex.: 1 cachorro pequeno"></label>
    <label>Observações (berço, restrições, ocasião especial...) <textarea name="observacoes" rows="3"></textarea></label>
    <button class="btn" type="submit">Enviar pré-check-in</button>
    <p class="form-status" hidden></p>
  </form>
</div>
<script>
document.getElementById('form-precheckin').addEventListener('submit', function(e){
  e.preventDefault();
  var f = e.target, st = f.querySelector('.form-status');
  st.hidden = false; st.textContent = 'Enviando...';
  var dados = {};
  ['nome','contato','email','reserva','hospedagem','chegada','horario','adultos','criancas','convidados','pets','observacoes'].forEach(function(k){ dados[k] = f[k].value; });
  fetch('${BACKEND}/api/precheckin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados)
  }).then(function(r){
    st.textContent = r.ok ? '✅ Pré-check-in recebido! Até breve. 🏡' : 'Erro ao enviar — fale conosco pelo WhatsApp.';
    if (r.ok) f.reset();
  }).catch(function(){ st.textContent = 'Erro ao enviar — fale conosco pelo WhatsApp.'; });
});
</script>`,
  { caminho: '/pre-checkin.html' }
);
fs.writeFileSync(path.join(DIST, 'pre-checkin.html'), precheckin);

// ------------------------- landing pages por público -------------------------
const LANDINGS = [
  {
    arquivo: 'formaturas.html', origem: 'site-formaturas',
    titulo: 'Formatura em Brasília — casa com piscina no Lago Sul | Villela Stay',
    descricao: 'Espaço para festa de formatura em Brasília: casas no Lago Sul para até 150 convidados, com piscina e churrasqueira, e hospedagem para a turma.',
    h1: 'A formatura que a sua turma merece',
    sub: 'Festas particulares do formando, Comemorações das Comissões de formatura das faculdades e universidades da cidade (UnB, UDF, IESB, UniCEUB e UCB): festa em casa com piscina, área de lazer, estrutura para buffet, no Lago Sul — e hospedagem para a turma que vem de fora.',
    beneficios: [
      ['🎓 Festa do seu jeito', 'Espaço exclusivo das 10h às 22h, com churrasqueira, piscina e cozinha e hospedagem para amigos e familiares.'],
      ['💰 Preço justo', 'R$ 150 por hóspede por dia, R$ 100,00 por convidado para evento ou day use. Escolhas flexíveis para a comissão fechar o orçamento sem surpresas.'],
      ['🛌 Turma hospedada', 'Combine evento com hospedagem em grupo: casas para até 50 pessoas com diárias competitivas.']
    ],
    casas: ['GD03H', 'GG04I', 'GD01H', 'GI01I'],
    cta: 'Olá! Somos uma comissão de formatura. Data: ___ | Nº de convidados: ___ | Queremos orçamento de festa (e hospedagem, se possível).'
  },
  {
    arquivo: 'casamentos.html', origem: 'site-casamentos',
    titulo: 'Casamento no Lago Sul — mini wedding em Brasília | Villela Stay',
    descricao: 'Mini wedding e recepção de casamento em casa no Lago Sul, Brasília: até 150 convidados, piscina, jardim e hospedagem para noivos e família.',
    h1: 'Diga "sim" no Lago Sul',
    sub: 'Mini weddings, recepções e pré-weddings em casas com jardim e piscina — e os noivos e a família já hospedados no local da festa.',
    beneficios: [
      ['💍 Cenário pronto', 'Jardim, piscina e arquitetura estilo garden, que integram os ambientes interno e externos com o paisagismo único — fotos lindas sem cenografia cara.'],
      ['👨‍👩‍👧 Família por perto', 'Hospede padrinhos e familiares na própria casa na semana do casamento.'],
      ['📋 Orçamento transparente', 'R$ 150 por dia para os hóspedes e R$ 100 por convidado para evento ou day use + taxa de limpeza. O resto é com seus fornecedores de confiança.']
    ],
    casas: ['GD03H', 'GG04I', 'GD01H', 'GI01I'],
    cta: 'Olá! Estamos planejando um casamento. Data: ___ | Nº de convidados: ___ | Queremos conhecer as casas.'
  },
  {
    arquivo: 'festas-infantis.html', origem: 'site-festas-infantis',
    titulo: 'Festa infantil com piscina em Brasília — Lago Sul | Villela Stay',
    descricao: 'Festa infantil em casa com piscina e parquinho no Lago Sul, Brasília: espaço seguro e exclusivo das 10h às 22h, R$ 100 por convidado.',
    h1: 'A festa infantil dos sonhos — com piscina e parquinho',
    sub: 'Para os grupos de mães e pais que querem festa ao ar livre, segura e sem dor de cabeça: casa exclusiva no Lago Sul o dia todo.',
    beneficios: [
      ['🎈 Espaço exclusivo', 'Só a sua festa na casa, das 10h às 22h — sem dividir com estranhos.'],
      ['🛝 Diversão de verdade', 'Piscina, parquinho infantil e gramado para brinquedos infláveis.'],
      ['👩‍🍳 Cozinha completa', 'Prepare ou receba buffet com estrutura de casa de verdade — geladeira, fogão, churrasqueira.']
    ],
    casas: ['GD01H', 'GI01I'],
    cta: 'Olá! Quero fazer uma festa infantil. Data: ___ | Nº de convidados (adultos + crianças): ___'
  },
  {
    arquivo: 'empresas.html', origem: 'site-b2b',
    titulo: 'Hospedagem e eventos para empresas e embaixadas — Brasília | Villela Stay',
    descricao: 'Hospedagem executiva e eventos corporativos no Lago Sul, Brasília: casas completas para equipes, off-sites e recepções, com faturamento para empresas e embaixadas.',
    h1: 'Para empresas e embaixadas',
    sub: 'Hospedagem de equipes, off-sites, treinamentos e recepções diplomáticas — no bairro mais seguro e bem localizado de Brasília, a 10 min do Aeroporto JK e da Esplanada.',
    beneficios: [
      ['🏢 Conta corporativa', 'Atendimento direto com o proprietário, nota e contrato para sua empresa ou missão diplomática.'],
      ['🔒 Privacidade e segurança', 'Casas em condomínio no Lago Sul — discrição para delegações e executivos.'],
      ['📆 Estadias Curtas e Eventos', 'Estadias temporárias para colaboradores e estrangeiros em propriedades flexíveis que acomodam de 1 hóspede até grupos de 50 pessoas.']
    ],
    casas: ['GD03H', 'GG04I', 'PL02I', 'GI01I'],
    cta: 'Olá! Represento uma empresa/embaixada. Precisamos de: hospedagem ( ) evento ( ) | Período: ___ | Nº de pessoas: ___'
  }
];

for (const lp of LANDINGS) {
  const cards = lp.casas.map(id => porId[id]).filter(Boolean).map(l => `
  <a class="card" href="/hospedagem/${l.id}.html">
    <img loading="lazy" src="${l.fotoPrincipal}" alt="${esc(l.titulo)}">
    <div class="card-info"><h3>${esc(l.titulo)}</h3><p>${l.hospedes} hóspedes · ${l.quartos} quartos${l.m2 ? ` · ${l.m2} m²` : ''}</p></div>
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
    <h2 class="secao-titulo">Os Espaços Recomendados</h2>
    <div class="grade">${cards}</div>
  </section>
  <section class="venda-bloco cta-final">
    <h2>Vamos conversar?</h2>
    <p>Conte a data e o tamanho do grupo — respondemos com a proposta completa.</p>
    <a class="btn btn-wa btn-grande" href="${waLink(lp.cta)}">Chamar no WhatsApp</a>
    <p style="margin-top:24px">Ou deixe seu contato:</p>
    <form class="form-evento form-evento-claro form-landing">
      <label>Seu nome* <input name="nome" required></label>
      <label>WhatsApp ou e-mail* <input name="contato" required></label>
      <label>Conte rapidamente o que precisa <textarea name="mensagem" rows="3"></textarea></label>
      <button class="btn" type="submit">Pedir proposta</button>
      <p class="form-status" hidden></p>
    </form>
  </section>
</div>
<script>
document.querySelector('.form-landing').addEventListener('submit', function(e){
  e.preventDefault();
  var f = e.target, st = f.querySelector('.form-status');
  st.hidden = false; st.textContent = 'Enviando...';
  fetch('${BACKEND}/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: f.nome.value, contato: f.contato.value, mensagem: f.mensagem.value, origem: '${lp.origem}' })
  }).then(function(r){
    st.textContent = r.ok ? '✅ Recebido! Retornaremos em breve.' : 'Erro — chame no WhatsApp.';
    if (r.ok) f.reset();
  }).catch(function(){ st.textContent = 'Erro — chame no WhatsApp.'; });
});
</script>`,
    { caminho: `/${lp.arquivo}` }
  );
  fs.writeFileSync(path.join(DIST, lp.arquivo), html);
}

// ------------------------- artigo: posse 2027 -------------------------
const cardsPosse = ['GD03H', 'GG04I', 'PL02I', 'GD01H', 'GI01I'].map(id => porId[id]).filter(Boolean).map(l => `
  <a class="card" href="/hospedagem/${l.id}.html">
    <img loading="lazy" src="${l.fotoPrincipal}" alt="${esc(l.titulo)}">
    <div class="card-info"><h3>${esc(l.titulo)}</h3><p>${l.hospedes} hóspedes · ${l.quartos} quartos</p></div>
  </a>`).join('\n');

const posse = layout(
  'Onde ficar em Brasília para a Posse Presidencial 2027 | Villela Stay',
  'Hospedagem para a posse do novo Presidente em 1º/01/2027: casas completas no Lago Sul para caravanas e comitivas, a 10 min da Esplanada. Reserve antes de esgotar.',
  `
<section class="hero hero-menor">
  <h1>Onde ficar em Brasília para a Posse Presidencial 2027</h1>
  <p><strong>Em 1º de janeiro de 2027, o Brasil inteiro estará em Brasília.</strong> E quem deixar para depois vai pagar caro — ou ficar longe. Aqui está o guia de quem conhece a cidade.</p>
</section>
<div class="regras-wrap">
  <section class="regra"><h2>Por que reservar agora</h2>
    <p>A posse presidencial é o evento que mais lota Brasília — caravanas de todos os estados, comitivas políticas, delegações estrangeiras e famílias inteiras vêm assistir à cerimônia na Esplanada dos Ministérios. Nas posses anteriores, os hotéis da região central <strong>dobraram ou triplicaram as diárias</strong> e esgotaram com meses de antecedência.</p>
    <p>E há um detalhe que torna 2027 ainda mais especial: a posse cai <strong>emendada com o Réveillon</strong>. Quem vem, vem para os dois — e fica de 4 a 5 dias.</p>
  </section>
  <section class="regra"><h2>A alternativa inteligente: casa completa no Lago Sul</h2>
    <p>Para grupos e caravanas, hotel é a conta que não fecha: dezenas de diárias individuais, sem cozinha, sem espaço de convivência. A solução que cresce a cada posse é alugar uma <strong>casa completa</strong> — e o Lago Sul é o melhor bairro para isso: seguro, silencioso, a <strong>10 minutos do Aeroporto JK e da Esplanada</strong>.</p>
    <p>Nas casas da Villela Stay, o grupo inteiro fica junto, com piscina aquecida, churrasqueira e cozinha completa — e o custo se divide: <strong>R$ 150 por pessoa por dia</strong> no pacote de 4 diárias com a casa lotada. Menos que uma diária de hotel simples em semana de posse.</p>
  </section>
  <section class="regra"><h2>O pacote Réveillon + Posse (30/12/2026 a 03/01/2027)</h2>
    <p>Nossas 4 casas recebem de 15 a 24 hóspedes cada. O pacote de 4 diárias vai de <strong>R$ 9.800 (Casa Villela, 15 pessoas)</strong> a <strong>R$ 15.400 (Casa Modernista, 24 pessoas)</strong> — valores fechados, sem surpresa. Veja os detalhes e a composição das camas em <a href="/pacotes.html"><strong>Pacotes Especiais</strong></a>.</p>
    <p>⚠️ São apenas 4 casas por data, e Réveillon + Posse é a janela mais disputada do calendário. As reservas são confirmadas por ordem de chegada.</p>
  </section>
  <section class="regra"><h2>As casas</h2>
    <div class="grade" style="margin-top:8px">${cardsPosse}</div>
  </section>
  <section class="venda-bloco cta-final" style="margin-top:28px">
    <h2>Garanta a sua casa para a Posse 2027</h2>
    <p>Diga o tamanho do grupo e devolvemos a proposta completa no WhatsApp.</p>
    <a class="btn btn-wa btn-grande" href="${waLink('Olá! Quero reservar uma casa para a Posse Presidencial 2027 (30/12 a 03/01). Somos um grupo de ___ pessoas.')}">Reservar pelo WhatsApp</a>
  </section>
</div>`,
  { caminho: '/posse-2027.html' }
);
fs.writeFileSync(path.join(DIST, 'posse-2027.html'), posse);

// ------------------------- sitemap.xml e robots.txt -------------------------
const hoje = new Date().toISOString().slice(0, 10);
const rotas = ['/', '/eventos.html', '/pacotes.html', '/regras.html', '/guia.html', '/pre-checkin.html', '/posse-2027.html', ...LANDINGS.map(lp => `/${lp.arquivo}`), ...listings.map(l => `/hospedagem/${l.id}.html`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rotas.map(r => `  <url><loc>${SITE_URL}${r}</loc><lastmod>${hoje}</lastmod></url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Site gerado em dist/: ${rotas.length} páginas + sitemap.xml + robots.txt`);
