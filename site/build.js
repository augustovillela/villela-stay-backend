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

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Casas inteiras primeiro (maior ticket), depois flats, depois suítes
const peso = l => l.tipo === 'entire_home' ? 0 : (String(l.titulo).match(/Flat/i) ? 1 : 2);
const ordenados = [...listings].sort((a, b) => peso(a) - peso(b) || b.hospedes - a.hospedes);

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
  <a class="marca" href="/">Villela <span>Stay</span></a>
  <nav>
    <a href="/#hospedagens">Hospedagens</a>
    <a href="/eventos.html">Eventos &amp; Grupos</a>
    <a href="${waLink('Olá! Vim pelo site da Villela Stay.')}" class="btn-wa-nav">WhatsApp</a>
  </nav>
</header>
${corpo}
<footer class="rodape">
  <div>
    <strong>Villela Stay</strong> — Hospedagem por temporada no Lago Sul, Brasília-DF<br>
    SHIS QI 7, Lago Sul · 15 min do Aeroporto JK e da Esplanada
  </div>
  <div>WhatsApp: +55 61 9193-5013 · villelastay.com.br</div>
</footer>
<a class="wa-flutuante" href="${waLink('Olá! Vim pelo site da Villela Stay.')}" aria-label="Falar no WhatsApp">💬</a>
</body>
</html>`;
}

// ---------------------------------------------------------------- home
const cards = ordenados.map(l => `
<a class="card" href="/hospedagem/${l.id}.html">
  <img loading="lazy" src="${l.fotoPrincipal}" alt="${esc(l.titulo)}">
  <div class="card-info">
    <h3>${esc(l.titulo)}</h3>
    <p>${l.hospedes} hóspedes · ${l.quartos} quarto${l.quartos > 1 ? 's' : ''} · ${l.banheiros} banheiro${l.banheiros > 1 ? 's' : ''}${l.m2 ? ` · ${l.m2} m²` : ''}</p>
  </div>
</a>`).join('\n');

const home = layout(
  'Villela Stay — Casas, flats e suítes no Lago Sul, Brasília',
  'Hospedagem por temporada no Lago Sul: casas com piscina aquecida para até 32 pessoas, flats e suítes. Reserva direta com o anfitrião.',
  `
<section class="hero">
  <h1>Seu lugar no Lago Sul de Brasília</h1>
  <p>Casas com piscina aquecida, flats e suítes — do casal em viagem ao grupo de 32 pessoas.<br>Reserva direta com o anfitrião, sem taxas de plataforma.</p>
  <div class="hero-cta">
    <a class="btn" href="#hospedagens">Ver hospedagens</a>
    <a class="btn btn-claro" href="/eventos.html">Eventos &amp; grupos</a>
  </div>
</section>
<section class="faixa-confianca">
  <div>🏆 Anfitrião premiado</div><div>📍 15 min do aeroporto e da Esplanada</div><div>🏊 Piscinas aquecidas</div><div>👨‍👩‍👧‍👦 Grupos de até 32 pessoas</div>
</section>
<section id="hospedagens" class="grade-wrap">
  <h2>Hospedagens</h2>
  <div class="grade">${cards}</div>
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

console.log(`Site gerado em dist/: ${1 + listings.length + 1} páginas (home + ${listings.length} unidades + eventos)`);
