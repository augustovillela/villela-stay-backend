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
    <p><strong>Casas muito bem localizadas, confortáveis, bem equipadas, com cozinha completa e piscina aquecida.<br>Excelentes tanto para casais quanto para grupos de 60 pessoas.<br>Reserve diretamente com o anfitrião para um atendimento personalizado.</strong></p>
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

// ------------------------- pacotes (página de vendas) -------------------------
const DATAS_PACOTE = [
  { emoji: '🎄', nome: 'Natal 2026', periodo: '23 a 27/12/2026' },
  { emoji: '🎆', nome: 'Réveillon 2026/2027', periodo: '30/12/2026 a 03/01/2027' },
  { emoji: '🇧🇷', nome: 'Caravana da Posse do Novo Presidente', periodo: '1º/01/2027' },
  { emoji: '🎭', nome: 'Carnaval 2027', periodo: '6 a 9/02/2027' },
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

const real = n => 'R$ ' + n.toLocaleString('pt-BR');
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
</div>`
);
fs.writeFileSync(path.join(DIST, 'pacotes.html'), pacotes);

console.log(`Site gerado em dist/: ${1 + listings.length + 2} páginas (home + ${listings.length} unidades + eventos + pacotes)`);
