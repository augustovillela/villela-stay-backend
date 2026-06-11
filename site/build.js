// =====================================================================
// Gerador estático do site Villela Stay
// Lê data/listings.json (exportado da API Stays) e gera o site em dist/
// Rodar: node build.js
// =====================================================================
const fs = require('fs');
const path = require('path');

const BACKEND = 'https://villela-stay-backend.onrender.com';
const WHATSAPP = '556191935013';
const listings = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'listings.json'), 'utf8').replace(/^﻿/, ''));

const DIST = path.join(__dirname, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'hospedagem'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'src', 'style.css'), path.join(DIST, 'style.css'));

// Logo: se src/logo.png existir, usa a imagem; senão, marca em texto
const TEM_LOGO = fs.existsSync(path.join(__dirname, 'src', 'logo.png'));
if (TEM_LOGO) fs.copyFileSync(path.join(__dirname, 'src', 'logo.png'), path.join(DIST, 'logo.png'));
const MARCA = TEM_LOGO
  ? `<a class="marca" href="/"><img class="logo" src="/logo.png" alt="Villela Stay — Hospedagens Inteligentes"></a>`
  : `<a class="marca" href="/">Villela <span>Stay</span></a>`;
const TAGLINE = `<span class="tagline">Hospedagens Inteligentes<br>para Experiências Inesquecíveis.</span>`;

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Seções da home na ordem definida pelo Augusto (11/06/2026)
const SECOES = [
  { titulo: 'Reserve O Espaço Inteiro de Uma Casa Bem Equipada', ids: ['GI01I', 'GD01H', 'GG04I', 'PL02I', 'GD03H', 'YV01I'] },
  { titulo: 'Reserve um Flat para até 6 pessoas com cozinha completa e área externa compartilhadas', ids: ['VH01H', 'VH02H', 'UD03H', 'UF08H', 'UF01H', 'UF07H'] },
  { titulo: 'Reserve Uma Suíte Privativa na Casa Modernista com sala e cozinha compartilhadas', ids: ['UH01H', 'UH06H', 'UH04H', 'UH05H', 'UH03H'] },
  { titulo: 'Reserve Uma Suíte Privativa na Gran Villela Home Stay com sala e cozinha compartilhadas', ids: ['UF06H', 'UF05H', 'UD09H'] }
];
const porId = Object.fromEntries(listings.map(l => [l.id, l]));

const waLink = txt => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(txt)}`;

function layout(titulo, descricao, corpo, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
${extraHead}
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="topo">
  <div class="marca-bloco">${MARCA}${TAGLINE}</div>
  <nav>
    <a href="/#hospedagens">Hospedagens</a>
    <a href="/pacotes.html">Pacotes Especiais</a>
    <a href="/eventos.html">Eventos &amp; Grupos</a>
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
  <div>WhatsApp: +55 61 9193-5013 · villelastay.com.br</div>
  <div class="creditos">Fotos dos pontos turísticos: krishna naudin, Cayambe, Matheusgf, Portal da Copa, Marinelson Almeida e Rose Ramalho, via Wikimedia Commons (licenças CC BY / CC BY-SA).</div>
</footer>
<a class="wa-flutuante" href="${waLink('Olá! Vim pelo site da Villela Stay.')}" aria-label="Falar no WhatsApp">💬</a>
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
    ${heroFotos.map((u, i) => `<img src="${u}" alt="" ${i === 0 ? 'class="ativa"' : 'loading="lazy"'}>`).join('\n    ')}
  </div>
  <div class="hero-conteudo">
    <h1>Seu Porto Seguro no Lago Sul em Brasília</h1>
    <p><strong>Casas muito bem localizadas, confortáveis, bem equipadas, com cozinha completa e piscina aquecida.<br>Excelentes para casais e para grupos de até 60 pessoas.<br>Reserve diretamente com o anfitrião para um atendimento personalizado.</strong></p>
    <div class="hero-cta">
      <a class="btn" href="#hospedagens">Ver hospedagens</a>
      <a class="btn btn-claro" href="/eventos.html">Eventos &amp; grupos</a>
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
  <div>🏆 Anfitrião premiado</div><div>📍 15 min do aeroporto e da Esplanada</div><div>🏊 Piscinas aquecidas</div><div>👨‍👩‍👧‍👦 Grupos de até 32 pessoas</div>
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
<section id="hospedagens" class="grade-wrap">
${cards}
</section>`,
  `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'LodgingBusiness',
    name: 'Villela Stay', url: 'https://villelastay.com.br',
    address: { '@type': 'PostalAddress', streetAddress: 'SHIS QI 7, Lago Sul', addressLocality: 'Brasília', addressRegion: 'DF', addressCountry: 'BR' },
    telephone: '+556191935013'
  })}</script>`
);
fs.writeFileSync(path.join(DIST, 'index.html'), home);

// ------------------------------------------------- página por unidade
for (const l of listings) {
  const galeria = (l.fotos || []).slice(1, 9).map(f =>
    `<img loading="lazy" src="${f.url}" alt="${esc(f.nome || l.titulo)}" title="${esc(f.nome || '')}">`).join('\n');

  const pagina = layout(
    `${l.titulo} | Villela Stay`,
    String(l.resumo || l.titulo).replace(/<[^>]+>/g, '').slice(0, 155),
    `
<article class="unidade">
  <img class="capa" src="${l.fotoPrincipal}" alt="${esc(l.titulo)}">
  <div class="unidade-cab">
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
  <section class="descricao">${l.descricao || ''}</section>
  <section class="galeria"><h2>Fotos</h2><div class="galeria-grid">${galeria}</div></section>
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
        if (noites.length && livres.length === noites.length) {
          out.innerHTML = '✅ Disponível! ' + noites.length + ' noite(s) — total estimado <strong>R$ ' +
            total.toLocaleString('pt-BR') + '</strong>. Garanta pelo WhatsApp 👇';
        } else {
          out.innerHTML = '😕 Sem disponibilidade completa nessas datas. Fale conosco no WhatsApp — encontramos a casa ideal para você.';
        }
      })
      .catch(function(){ out.textContent = 'Não foi possível consultar agora. Fale conosco pelo WhatsApp.'; });
  });
})();
</script>`
  );
  fs.writeFileSync(path.join(DIST, 'hospedagem', `${l.id}.html`), pagina);
}

// ---------------------------------------------------------- eventos
const eventos = layout(
  'Eventos, formaturas e grupos | Villela Stay',
  'Casas no Lago Sul para eventos corporativos, formaturas, casamentos e celebrações — espaços para até 32 pessoas hospedadas.',
  `
<section class="hero hero-menor">
  <h1>Eventos, formaturas e grupos</h1>
  <p>A Grand Villela recebe até 32 hóspedes; nossas villas têm piscina, área gourmet e espaço para celebrações.<br>Conte o que você está planejando e montamos a proposta.</p>
</section>
<section class="form-wrap">
  <form id="form-evento" class="form-evento">
    <label>Seu nome* <input name="nome" required></label>
    <label>WhatsApp ou e-mail* <input name="contato" required></label>
    <label>Conte sobre o evento (tipo, data, nº de pessoas) <textarea name="mensagem" rows="4"></textarea></label>
    <button class="btn" type="submit">Pedir orçamento</button>
    <p class="form-status" hidden></p>
  </form>
</section>
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
</script>`
);
fs.writeFileSync(path.join(DIST, 'eventos.html'), eventos);

// ---------------------------------------------------------- pacotes
const PACOTES = [
  {
    nome: 'Carnaval 2026', periodo: '14 a 18 de fevereiro · mínimo 4 noites',
    casas: [['Casa Modernista (até 22 pessoas)', 'R$ 9.800,00', 'R$ 600,00/pessoa']]
  },
  {
    nome: 'Marcha dos Prefeitos 2026', periodo: '18 a 21 de maio · mínimo 3 noites',
    casas: [
      ['Casa Villela', 'R$ 5.300,00', 'R$ 530,00/pessoa'],
      ['Casa Modernista', 'R$ 9.800,00', 'R$ 530,00/pessoa'],
      ['Villa Kubitschek', 'R$ 9.800,00', 'R$ 490,00/pessoa'],
      ['Villa Catetinho', 'R$ 8.900,00', 'R$ 495,00/pessoa'],
      ['Gran Villela Home Stay', 'R$ 14.300,00', 'R$ 477,00/pessoa']
    ]
  },
  {
    nome: 'Natal 2026', periodo: '23 a 27 de dezembro · mínimo 4 noites',
    casas: [
      ['Casa Villela', 'a partir de R$ 7.800,00', 'R$ 517,00 a R$ 650,00/pessoa'],
      ['Demais casas até a Gran Villela', 'até R$ 18.800,00', 'consulte por casa']
    ]
  },
  {
    nome: 'Réveillon 2026/2027', periodo: '30 de dezembro a 3 de janeiro · mínimo 4 noites',
    casas: [
      ['Casa Villela', 'a partir de R$ 6.600,00', 'R$ 530,00 a R$ 650,00/pessoa'],
      ['Demais casas até a Gran Villela', 'até R$ 18.800,00', 'consulte por casa']
    ]
  }
];

const blocosPacotes = PACOTES.map(p => `
<section class="pacote">
  <h2>${esc(p.nome)}</h2>
  <p class="pacote-periodo">${esc(p.periodo)}</p>
  <table class="pacote-tabela">
    <tr><th>Hospedagem</th><th>Pacote</th><th>Por pessoa</th></tr>
    ${p.casas.map(c => `<tr><td>${esc(c[0])}</td><td>${esc(c[1])}</td><td>${esc(c[2])}</td></tr>`).join('\n    ')}
  </table>
  <a class="btn btn-wa" href="${waLink(`Olá! Tenho interesse no pacote ${p.nome}.`)}">Reservar este pacote</a>
</section>`).join('\n');

const pacotes = layout(
  'Pacotes Especiais — Carnaval, Natal e Réveillon | Villela Stay',
  'Pacotes especiais da Villela Stay no Lago Sul: Carnaval, Marcha dos Prefeitos, Natal e Réveillon em casas completas para grupos.',
  `
<section class="hero hero-menor">
  <h1>Pacotes Especiais</h1>
  <p>Datas mais procuradas do ano em casas completas no Lago Sul — valores fechados por grupo.<br>Taxas para convidados extras e day use sob consulta.</p>
</section>
<div class="pacotes-wrap">${blocosPacotes}</div>`
);
fs.writeFileSync(path.join(DIST, 'pacotes.html'), pacotes);

console.log(`Site gerado em dist/: ${1 + listings.length + 2} páginas (home + ${listings.length} unidades + eventos + pacotes)`);
