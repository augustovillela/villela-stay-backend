// =====================================================================
// Livraria Villela — renderização server-side das páginas públicas (SEO).
// Tudo em HTML gerado no servidor: title/meta/OG/canonical/JSON-LD,
// slugs amigáveis. Identidade Grupo Villela Stay: navy #1B2A4A, acento bordô
// editorial #7F1D1D, dourado #C9A227, gelo #F8F9FA (Lora + Inter).
// =====================================================================
'use strict';
const { brl } = require('./repo');

const SITE = process.env.LIVRARIA_URL || 'https://livros.villelastay.com.br';
const SITE_PRINCIPAL = 'https://villelastay.com.br';
const WHATSAPP = process.env.LIVRARIA_WHATSAPP || '556191935013';
const PIXEL_META = process.env.META_PIXEL_ID || '';
const GADS_ID = process.env.GOOGLE_ADS_ID || '';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const waLink = (msg) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg || 'Olá! Tenho uma dúvida sobre os livros da Villela.')}`;

// ---- pixels de conversão (Google Ads / Meta) — carregam só se as env existirem ----
function pixelsHead() {
  let h = '';
  if (PIXEL_META) h += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${esc(PIXEL_META)}');fbq('track','PageView');</script>`;
  if (GADS_ID) h += `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(GADS_ID)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(GADS_ID)}');</script>`;
  return h;
}
// Evento de conversão reutilizável no client (checkout/obrigado disparam).
function pixelEvento(evento, dados) {
  return `<script>try{window.fbq&&fbq('track','${evento}',${JSON.stringify(dados || {})});window.gtag&&gtag('event','${evento}',${JSON.stringify(dados || {})});}catch(e){}</script>`;
}

const CSS = `
:root{--petroleo:#1B2A4A;--petroleo2:#24365C;--teal:#7F1D1D;--dourado:#C9A227;--dourado2:#B08E1F;--creme:#F8F9FA;--cinza:#F8F9FA;--cinza2:#E2E6EC;--tinta:#1F2933;--suave:#5B6B7A}
*{box-sizing:border-box}body{margin:0;font-family:'Inter',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--tinta);background:#fff;line-height:1.6}
h1,h2,h3{font-family:'Lora',Georgia,serif;color:var(--petroleo);line-height:1.2;margin:.2em 0 .5em}
a{color:var(--teal);text-decoration:none}a:hover{text-decoration:underline}
img{max-width:100%;height:auto;display:block}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.wrap-sm{max-width:720px;margin:0 auto;padding:0 20px}
header.top{background:var(--petroleo);color:var(--creme)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding-top:18px;padding-bottom:18px}
header.top a{color:var(--creme)}
.brand{display:flex;align-items:center;gap:18px;font-size:19px}.brand:hover{text-decoration:none}
.brand>span{display:flex;flex-direction:column;line-height:1.05}
.brand .lv{font-family:'Inter',sans-serif;text-transform:uppercase;letter-spacing:.18em;font-size:1.4rem;font-weight:700;color:var(--dourado)}
.brand b{font-family:'Lora',Georgia,serif;font-weight:700;font-size:3.2rem;color:#fff;line-height:1.05}
@media(max-width:640px){.brand img{height:84px!important}.brand b{font-size:2rem}.brand .lv{font-size:.95rem}}
.nav a{margin-left:20px;font-size:15px}
.btn{display:inline-block;background:var(--teal);color:#fff;padding:13px 26px;border-radius:9px;font-weight:700;border:0;cursor:pointer;font-size:16px;text-align:center;transition:.15s}
.btn:hover{background:#641717;text-decoration:none}
.btn-ouro{background:var(--dourado);color:#3a2c07}.btn-ouro:hover{background:var(--dourado2)}
.btn-wa{background:#25d366;color:#0a2e17}.btn-wa:hover{background:#1eb955}
.btn-ghost{background:transparent;border:1.5px solid var(--cinza2);color:var(--petroleo)}
/* Hero da página do livro: capa + texto. Em tela estreita empilha (antes a
   coluna de 280px fixos espremia o título e os botões num filete). */
.hero-livro{display:grid;grid-template-columns:280px 1fr;gap:34px;align-items:center}
@media(max-width:760px){
  .hero-livro{grid-template-columns:1fr;gap:22px;justify-items:center;text-align:center}
  .hero-livro .capa{width:min(260px,72vw)}
  .hero-livro .hero-ctas{justify-content:center}
}
/* CTAs do hero: mesmo tamanho e borda branca fina, para não se misturarem.
   Seletor com 2 classes de propósito: villela-saas.css carrega DEPOIS deste
   <style> e sobrescreveria .btn (zera borda e força o fundo). */
.hero-ctas{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0 0}
.hero-ctas .hero-cta{width:232px;max-width:100%;padding:13px 18px;border:1.5px solid #fff;
  box-sizing:border-box;line-height:1.25;text-align:center;border-radius:9px}
.hero-ctas .btn-ouro{background:var(--dourado);color:#3a2c07}
.hero-ctas .btn-ouro:hover{background:var(--dourado2)}
.hero-ctas .btn-folhear{background:transparent;color:#fff}
.hero-ctas .btn-folhear:hover{background:rgba(255,255,255,.16)}
.hero-cta-nota{margin:9px 0 0;font-size:13px;opacity:.85}
@media(max-width:660px){.hero-ctas .hero-cta{width:100%}}
/* leitor de amostra ("Folhear") */
.fo-barra{position:sticky;top:0;z-index:5;background:var(--petroleo);color:var(--creme);padding:10px 0}
.fo-barra .wrap{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.fo-barra b{font-family:'Lora',Georgia,serif;font-weight:600}
.fo-nav{display:flex;align-items:center;gap:10px;margin-left:auto}
.fo-btn{background:rgba(248,249,250,.12);border:1px solid rgba(248,249,250,.35);color:var(--creme);border-radius:8px;padding:7px 14px;font-size:15px;font-weight:600;cursor:pointer}
.fo-btn:disabled{opacity:.35;cursor:default}
.fo-btn:not(:disabled):hover{background:rgba(248,249,250,.22)}
.fo-palco{background:#33404f;padding:22px 0 30px;min-height:60vh}
.fo-folha{margin:0 auto;max-width:820px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.28);border-radius:4px;overflow:hidden}
.fo-folha canvas{display:block;width:100%;height:auto}
.fo-fim{max-width:820px;margin:26px auto 0;background:var(--creme);border:1px solid var(--cinza2);border-radius:12px;padding:26px;text-align:center}
.fo-carregando{color:var(--creme);text-align:center;padding:40px 0;font-size:15px}
@media(max-width:660px){
  .fo-barra{padding:8px 0}
  .fo-barra .wrap{gap:8px}
  .fo-barra .fo-titulo{font-size:14px;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .fo-nav{margin-left:0;width:100%;justify-content:space-between;gap:6px}
  .fo-btn{padding:8px 10px;font-size:14px}
  .fo-palco{padding:14px 0 22px}
  .fo-folha{max-width:100%;border-radius:0}
  .fo-fim{margin-left:12px;margin-right:12px;padding:20px}
}
.hero{background:linear-gradient(160deg,var(--petroleo),var(--petroleo2));color:var(--creme);padding:56px 0}
.hero h1{color:#fff}.hero p.sub{font-size:19px;color:#dbe6ea;max-width:640px}
.eyebrow{text-transform:uppercase;letter-spacing:1.5px;font-size:12px;color:var(--dourado);font-weight:700}
.grid{display:grid;gap:26px}
/* Número de colunas FIXO (não auto-fit): assim um grupo de 1 ou 2 livros mostra o card do mesmo
   tamanho de um grupo de 3, em vez de esticar para a largura toda. Especificidade acima de
   .grid do villela-saas.css, que carrega depois deste <style>. */
.wrap .grid.grid-books{grid-template-columns:repeat(3,minmax(0,1fr));column-gap:16px;row-gap:16px}
/* Mural: as categorias dividem a mesma linha de 3 colunas. Uma categoria ocupa tantas colunas
   quantos livros tiver (até 3), então 2 livros + 1 livro fecham a linha em vez de gastar duas.
   O column-gap do mural é igual ao do .grid-books — é isso que faz o card ter exatamente a mesma
   largura em qualquer grupo. */
.wrap .lv-mural{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:16px;row-gap:30px;align-items:start}
.wrap .lv-mural>.lv-grupo{margin:0}
.lv-g1{grid-column:span 1}.lv-g2{grid-column:span 2}.lv-g3{grid-column:span 3}
.wrap .lv-g1>.grid.grid-books{grid-template-columns:minmax(0,1fr)}
.wrap .lv-g2>.grid.grid-books{grid-template-columns:repeat(2,minmax(0,1fr))}
.wrap .lv-g3>.grid.grid-books{grid-template-columns:repeat(3,minmax(0,1fr))}
/* Telas estreitas: mural vira 2 (depois 1) colunas e cada categoria volta a ocupar a linha toda. */
@media(max-width:900px){
  .wrap .lv-mural{grid-template-columns:repeat(2,minmax(0,1fr))}
  .wrap .lv-mural>.lv-grupo{grid-column:1/-1}
  .wrap .grid.grid-books,.wrap .lv-g1>.grid.grid-books,.wrap .lv-g2>.grid.grid-books,.wrap .lv-g3>.grid.grid-books{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:560px){
  .wrap .lv-mural{grid-template-columns:minmax(0,1fr)}
  .wrap .grid.grid-books,.wrap .lv-g1>.grid.grid-books,.wrap .lv-g2>.grid.grid-books,.wrap .lv-g3>.grid.grid-books{grid-template-columns:minmax(0,1fr)}
}
.card{background:#fff;border:1px solid var(--cinza2);border-radius:14px;overflow:hidden;transition:.15s;display:flex;flex-direction:column}
.card:hover{box-shadow:0 10px 30px rgba(27,42,74,.12);transform:translateY(-2px)}
.card .capa{aspect-ratio:3/4;background:var(--cinza);display:flex;align-items:center;justify-content:center;color:var(--suave);overflow:hidden}
.card .capa img{width:100%;height:100%;object-fit:cover}
.card .corpo{padding:16px;display:flex;flex-direction:column;gap:8px;flex:1}
.card h3{margin:0;font-size:18px}.card .preco{color:var(--teal);font-weight:700}
.badge{display:inline-block;background:var(--dourado);color:#3a2c07;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;text-transform:uppercase;letter-spacing:.5px}
.card .lv-cat{margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--suave)}
/* busca + abas de categoria da vitrine */
.lv-busca{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.lv-busca input{flex:1;min-width:220px;max-width:460px;padding:12px 14px;border:1px solid var(--cinza2);border-radius:10px;font:inherit;background:#fff}
.lv-busca input:focus{outline:2px solid var(--teal);outline-offset:1px}
.lv-busca .lv-limpar{color:var(--suave);font-size:14px}
.lv-abas{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.lv-abas .lv-aba{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid var(--cinza2);border-radius:99px;background:#fff;color:var(--petroleo);font-size:14px;font-weight:600;text-decoration:none}
.lv-abas .lv-aba span{color:var(--suave);font-weight:500;font-size:12px}
.lv-abas .lv-aba:hover{border-color:var(--teal)}
.lv-abas .lv-aba.on{background:var(--petroleo);border-color:var(--petroleo);color:#fff}
.lv-abas .lv-aba.on span{color:var(--dourado)}
.lv-grupo{padding:0;margin:0 0 34px}
.lv-grupo h2{font-size:22px;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid var(--cinza2)}
section{padding:44px 0}section.alt{background:var(--cinza)}
.sec-narrow{max-width:760px}
.lista-check{list-style:none;padding:0;margin:0}.lista-check li{padding:8px 0 8px 32px;position:relative}
.lista-check li:before{content:"✓";position:absolute;left:0;color:var(--teal);font-weight:800}
.precos{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.plano{border:2px solid var(--cinza2);border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:10px;background:#fff}
.plano.destaque{border-color:var(--dourado);box-shadow:0 8px 24px rgba(217,164,65,.15)}
.plano .valor{font-size:30px;font-weight:700;color:var(--teal);font-family:'Lora',Georgia,serif}
.plano .tipo{font-weight:700;text-transform:uppercase;letter-spacing:.5px;font-size:13px;color:var(--suave)}
.faq details{border-bottom:1px solid var(--cinza2);padding:14px 0}.faq summary{cursor:pointer;font-weight:700;color:var(--petroleo)}
.dep{background:#fff;border:1px solid var(--cinza2);border-radius:12px;padding:18px}.dep .nome{font-weight:700;color:var(--petroleo);margin-top:8px}
.garantia{display:flex;gap:16px;align-items:center;background:var(--creme);border:1px solid var(--cinza2);border-radius:14px;padding:20px}
.garantia .selo{font-size:40px}
footer.rod{background:var(--petroleo);color:#c6d6db;padding:34px 0;margin-top:20px;font-size:14px}
footer.rod a{color:#c6d6db}footer.rod .cols{display:flex;flex-wrap:wrap;gap:26px;justify-content:space-between}
.campo{margin:12px 0}.campo label{display:block;font-size:13px;font-weight:700;color:var(--suave);margin-bottom:5px}
.campo input,.campo select,.campo textarea{width:100%;padding:12px;border:1.5px solid var(--cinza2);border-radius:9px;font-size:16px;font-family:inherit}
.campo input:focus,.campo select:focus{outline:0;border-color:var(--teal)}
.row2{display:grid;gap:12px;grid-template-columns:1fr 1fr}@media(max-width:560px){.row2{grid-template-columns:1fr}.hero{padding:40px 0}}
.resumo{background:var(--cinza);border-radius:12px;padding:18px;position:sticky;top:80px}
.aviso{background:#fff8e6;border:1px solid #f0dca0;border-radius:10px;padding:12px;font-size:14px;color:#7a5c12}
.muted{color:var(--suave)}.center{text-align:center}.sticky-buy{position:sticky;bottom:0;background:#fff;border-top:1px solid var(--cinza2);padding:12px 0;z-index:15}
`;

function pagina({ title, description, path = '/', ogImage, schema, body, extraHead = '' }) {
  const canonical = SITE + path;
  const og = ogImage || (SITE + '/assets/brand/livraria-villela/og-image.png');
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || '')}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="theme-color" content="#1B2A4A">
<link rel="icon" type="image/svg+xml" href="/assets/brand/livraria-villela/favicon.svg">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/brand/livraria-villela/favicon-192.png">
<link rel="apple-touch-icon" href="/assets/brand/livraria-villela/apple-touch-icon.png">
<link rel="manifest" href="/livros/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<meta property="og:type" content="website"><meta property="og:site_name" content="Livraria Villela">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description || '')}">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image">
${schema ? `<script type="application/ld+json">${JSON.stringify(schema)}</script>` : ''}
<link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS}</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7">${pixelsHead()}${extraHead}
</head><body class="vx" data-vertical="livraria">
<header class="top"><div class="wrap">
  <a class="brand" href="/livros"><img src="/assets/brand/livraria-villela/logo-negativo.svg" alt="Livraria Villela" style="height:150px"><span><span class="lv">Livraria</span> <b>Villela</b></span></a>
  <nav class="nav"><a href="/livros">Livros</a><a href="/livros/atualizacoes">Atualizações</a><a href="/minha-biblioteca">Minha biblioteca</a><a href="${SITE_PRINCIPAL}">Villela Stay</a></nav>
</div></header>
${body}
<div class="wrap" style="text-align:center;padding:26px 20px 6px;color:var(--suave);font-size:14px">
  <strong style="color:var(--petroleo)">Tecnologia testada na vida real</strong> — loja própria do Grupo Villela Stay: do autor para as suas mãos, sem intermediário.<br>
  🔒 Conexão segura (HTTPS) &nbsp;·&nbsp; 🛡️ Dados tratados conforme a LGPD &nbsp;·&nbsp; 💳 Pagamentos pelo Mercado Pago &nbsp;·&nbsp; ↩️ Garantia de 7 dias
</div>
<footer class="rod"><div class="wrap"><div class="cols">
  <div><strong style="color:#fff">Livraria Villela</strong> · Livros, ideias e conhecimento aplicado<br>📲 Disponível como app para o seu celular — <a href="/livros/ajuda/manual" style="color:var(--dourado)">adicione à tela inicial</a><br>Uma empresa do <strong style="color:var(--dourado)">Grupo Villela Stay</strong> · CNPJ 56.776.526/0001-12 · Brasília-DF</div>
  <div><a href="/politica-de-privacidade">Privacidade</a> · <a href="/termos-de-uso">Termos</a><br>
    <a href="/politica-de-compra-e-entrega">Compra e entrega</a> · <a href="/politica-de-reembolso">Reembolso</a><br>
    <a href="/politica-de-livro-impresso">Livro impresso</a> · <a href="/suporte-livros">Suporte</a><br>
    <a href="/livros/ajuda">Manual e perguntas frequentes</a><br>
    <a href="/livros/atualizacoes">Atualizações dos livros</a></div>
  <div><a class="btn-wa btn" href="${waLink()}">Falar no WhatsApp</a></div>
</div></div></footer>
</body></html>`;
}

// ------------------------------------------------------------ vitrine /livros
// Filtro por categoria e busca funcionam SEM JavaScript (links e <form> GET, para o
// robô de busca enxergar); com JS, o campo filtra os cards na hora, sem recarregar.
const SEM_CAT = 'Outros';
const catDe = (b) => (b.categoria || '').trim() || SEM_CAT;
// Ordem em que as categorias aparecem (decisão do Augusto, 03/08/2026). É curadoria, não regra
// derivada dos dados: a sequência foi escolhida para as linhas de 3 fecharem — Desenvolvimento
// Pessoal (2 livros) + Finanças (1) dividem uma linha e Aeronáutica e Drones fica sozinha no fim.
// Categoria fora desta lista entra depois, da maior para a menor; "Outros" é sempre a última.
const ORDEM_CATEGORIAS = ['Negócios e Marketing', 'Tecnologia e IA', 'Desenvolvimento Pessoal', 'Finanças', 'Aeronáutica e Drones'];
function ordenarCategorias(cats, contas) {
  const pos = (c) => { const i = ORDEM_CATEGORIAS.indexOf(c); return i < 0 ? ORDEM_CATEGORIAS.length : i; };
  return cats.slice().sort((a, b) => {
    if (a === SEM_CAT || b === SEM_CAT) return a === SEM_CAT ? 1 : -1;
    if (pos(a) !== pos(b)) return pos(a) - pos(b);
    if ((contas[b] || 0) !== (contas[a] || 0)) return (contas[b] || 0) - (contas[a] || 0);
    return a.localeCompare(b, 'pt-BR');
  });
}
const semAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const catSlug = (c) => semAcento(c).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// tudo que a busca enxerga: categoria, título, subtítulo, autor e o assunto do livro
function textoBusca(b) {
  const lista = (v) => (Array.isArray(v) ? v : []).map(x => typeof x === 'string' ? x : Object.values(x || {}).join(' ')).join(' ');
  return semAcento([b.titulo, b.subtitulo, b.autor, b.categoria, b.slug, b.descricao_curta, b.descricao_longa,
    b.publico_alvo, b.sumario, lista(b.tags), lista(b.beneficios)].join(' '));
}
function vitrine(livros, filtro = {}) {
  const q = String(filtro.q || '').trim();
  const termos = semAcento(q).split(/\s+/).filter(Boolean);
  const catPedida = String(filtro.categoria || '').trim();

  const achados = livros.filter(b => { const t = textoBusca(b); return termos.every(x => t.includes(x)); });
  // as abas listam todas as categorias do acervo (não só as do resultado), com a contagem do resultado
  const contas = {}; for (const b of achados) contas[catDe(b)] = (contas[catDe(b)] || 0) + 1;
  const totais = {}; for (const b of livros) totais[catDe(b)] = (totais[catDe(b)] || 0) + 1;
  const todasCats = ordenarCategorias([...new Set(livros.map(catDe))], totais);
  const catAtiva = todasCats.find(c => catSlug(c) === catSlug(catPedida)) || '';
  const visiveis = catAtiva ? achados.filter(b => catDe(b) === catAtiva) : achados;

  const url = (c) => '/livros' + (c || q ? '?' + [c ? 'categoria=' + encodeURIComponent(catSlug(c)) : '', q ? 'q=' + encodeURIComponent(q) : ''].filter(Boolean).join('&') : '');
  const aba = (c, rot, n, ativa) => `<a class="lv-aba${ativa ? ' on' : ''}" href="${esc(url(c))}" data-cat="${esc(c ? catSlug(c) : '')}">${esc(rot)} <span>${n}</span></a>`;
  const abas = aba('', 'Todos', achados.length, !catAtiva)
    + todasCats.map(c => aba(c, c, contas[c] || 0, catAtiva === c)).join('');

  const card = (b) => `
    <a class="card" href="/livros/${esc(b.slug)}" data-cat="${esc(catSlug(catDe(b)))}" data-busca="${esc(textoBusca(b))}">
      <div class="capa">${b.capa_url ? `<img src="${esc(b.capa_url)}" alt="${esc(b.titulo)}" loading="lazy">` : '📕'}</div>
      <div class="corpo">
        ${b.destaque ? '<span class="badge">Destaque</span>' : ''}
        <p class="lv-cat">${esc(catDe(b))}</p>
        <h3>${esc(b.titulo)}</h3>
        <p class="muted" style="margin:0;font-size:14px">${esc(b.subtitulo || '')}</p>
        <div style="margin-top:auto" class="preco">${precoMenor(b)}</div>
      </div></a>`;

  // sem filtro: agrupa por categoria. com categoria escolhida ou busca: uma grade só.
  let miolo;
  if (!livros.length) miolo = '<p class="muted">Em breve novos títulos. Fale conosco no WhatsApp para novidades.</p>';
  else if (catAtiva || termos.length) miolo = `<div class="grid grid-books">${visiveis.map(card).join('')}</div>`;
  else miolo = `<div class="lv-mural">` + todasCats.map(c => {
    const doGrupo = visiveis.filter(b => catDe(b) === c);
    // a categoria ocupa uma coluna por livro (no máximo 3) — é o que faz duas categorias
    // pequenas dividirem a mesma linha em vez de cada uma gastar uma linha inteira
    return doGrupo.length ? `<section class="lv-grupo lv-g${Math.min(doGrupo.length, 3)}" data-grupo="${esc(catSlug(c))}" id="cat-${esc(catSlug(c))}">
      <h2>${esc(c)}</h2><div class="grid grid-books">${doGrupo.map(card).join('')}</div></section>` : '';
  }).join('') + `</div>`;

  const body = `
  <section class="hero"><div class="wrap">
    <p class="eyebrow">Livraria Villela</p>
    <h1>Livros para quem quer hospedar, empreender e viver melhor</h1>
    <p class="sub">Conteúdo prático escrito por Augusto Villela. Entrega imediata em PDF e opção de exemplar impresso.</p>
  </div></section>
  <section><div class="wrap">
    <form class="lv-busca" method="get" action="/livros" role="search">
      ${catAtiva ? `<input type="hidden" name="categoria" value="${esc(catSlug(catAtiva))}">` : ''}
      <input type="search" name="q" id="lv-q" value="${esc(q)}" autocomplete="off"
             placeholder="Buscar por categoria, título, autor ou assunto…" aria-label="Buscar livros">
      <button class="btn" type="submit">Buscar</button>
      ${q ? `<a class="lv-limpar" href="${esc(catAtiva ? '/livros?categoria=' + catSlug(catAtiva) : '/livros')}">✖ limpar</a>` : ''}
    </form>
    <nav class="lv-abas" aria-label="Categorias">${abas}</nav>
    <p class="muted" id="lv-conta" style="font-size:14px;margin:0 0 10px">${visiveis.length} ${visiveis.length === 1 ? 'livro' : 'livros'}${catAtiva ? ' em ' + esc(catAtiva) : ''}${q ? ` para “${esc(q)}”` : ''}</p>
    <div id="lv-resultados">${miolo}
      ${livros.length ? `<p class="muted" id="lv-vazio"${visiveis.length ? ' style="display:none"' : ''}>Nenhum livro encontrado${q ? ` para “${esc(q)}”` : ''}. <a href="/livros">Ver todos os livros</a>.</p>` : ''}
    </div>
  </div></section>
  <script>
  // Progressive enhancement: filtra na hora enquanto digita. Sem JS, o form GET acima resolve.
  (function(){
    var campo=document.getElementById('lv-q'); if(!campo) return;
    var cards=[].slice.call(document.querySelectorAll('#lv-resultados .card'));
    var grupos=[].slice.call(document.querySelectorAll('#lv-resultados .lv-grupo'));
    var conta=document.getElementById('lv-conta'), vazio=document.getElementById('lv-vazio');
    var semAcento=function(s){return (s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();};
    var catAtiva=${JSON.stringify(catAtiva ? catSlug(catAtiva) : '')};
    function filtrar(){
      var termos=semAcento(campo.value).split(/\\s+/).filter(Boolean), n=0;
      cards.forEach(function(c){
        var txt=c.getAttribute('data-busca')||'';
        var ok=termos.every(function(t){return txt.indexOf(t)>-1;}) && (!catAtiva || c.getAttribute('data-cat')===catAtiva);
        c.style.display=ok?'':'none'; if(ok) n++;
      });
      grupos.forEach(function(g){
        // reempacota: a categoria passa a ocupar uma coluna por card ainda visível,
        // senão a busca deixa buracos na linha
        var vis=g.querySelectorAll('.card:not([style*="none"])').length;
        g.style.display=vis?'':'none';
        g.className='lv-grupo lv-g'+Math.min(vis||1,3);
      });
      if(conta) conta.textContent=n+(n===1?' livro':' livros')+(campo.value.trim()?' para \\u201C'+campo.value.trim()+'\\u201D':'');
      if(vazio) vazio.style.display=n?'none':'';
    }
    campo.addEventListener('input',filtrar);
  })();
  </script>`;
  const titulo = catAtiva ? `${catAtiva} — Livraria Villela` : 'Livraria Villela — livros de Augusto Villela';
  return pagina({
    title: titulo,
    description: catAtiva
      ? `Livros de ${catAtiva} escritos por Augusto Villela. PDF com entrega imediata e opção impressa.`
      : 'Livros práticos sobre hospedagem, negócios e estilo de vida. PDF com entrega imediata e opção impressa.',
    // canonical sempre em /livros: as views filtradas são recortes do mesmo acervo (evita conteúdo duplicado)
    path: '/livros', body,
    extraHead: q ? '<meta name="robots" content="noindex,follow">' : '',
    schema: {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: titulo, url: SITE + '/livros',
      mainEntity: {
        '@type': 'ItemList', numberOfItems: visiveis.length,
        itemListElement: visiveis.map((b, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + '/livros/' + b.slug, name: b.titulo })),
      },
    },
  });
}
function precoMenor(b) {
  const ps = [b.preco_pdf, b.preco_impresso, b.preco_combo].filter(v => v != null);
  return ps.length ? 'a partir de ' + brl(Math.min(...ps)) : 'Em breve';
}

// ------------------------------------------------ página de venda /livros/:slug
function paginaLivro(b) {
  const opcoes = [];
  if (b.preco_pdf != null) opcoes.push({ tipo: 'pdf', nome: 'PDF', preco: b.preco_pdf, sel: 'Download imediato' });
  if (b.preco_impresso != null) opcoes.push({ tipo: 'impresso', nome: 'Impresso', preco: b.preco_impresso, sel: 'Enviado à sua casa' });
  if (b.preco_combo != null) opcoes.push({ tipo: 'combo', nome: 'Combo PDF + Impresso', preco: b.preco_combo, sel: 'O melhor dos dois', destaque: true });
  const planos = opcoes.map(o => `
    <div class="plano${o.destaque ? ' destaque' : ''}">
      ${o.destaque ? '<span class="badge">Mais completo</span>' : ''}
      <span class="tipo">${o.nome}</span>
      <span class="valor">${brl(o.preco)}</span>
      <span class="muted" style="font-size:13px">${o.sel}</span>
      <button class="btn ${o.destaque ? 'btn-ouro' : ''}" onclick="comprar('${o.tipo}')">Comprar ${o.nome}</button>
    </div>`).join('');
  const bloco = (titulo, html) => html ? `<section class="alt"><div class="wrap sec-narrow"><h2>${esc(titulo)}</h2>${html}</div></section>` : '';
  const listaBeneficios = (b.beneficios || []).length ? `<ul class="lista-check">${b.beneficios.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const bonus = (b.bonus || []).length ? `<ul class="lista-check">${b.bonus.map(x => `<li><strong>${esc(x.titulo || x)}</strong>${x.descricao ? ' — ' + esc(x.descricao) : ''}</li>`).join('')}</ul>` : '';
  const deps = (b.depoimentos || []).length ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">${b.depoimentos.map(d => `<div class="dep"><p>"${esc(d.texto || d)}"</p><div class="nome">— ${esc(d.nome || 'Leitor(a)')}</div></div>`).join('')}</div>` : '';
  const faq = (b.faq || []).length ? `<div class="faq">${b.faq.map(f => `<details><summary>${esc(f.pergunta || f.q)}</summary><p>${esc(f.resposta || f.a)}</p></details>`).join('')}</div>` : '';
  const sumario = b.sumario ? `<div style="white-space:pre-wrap">${esc(b.sumario)}</div>` : '';

  const body = `
  <section class="hero"><div class="wrap hero-livro">
    <div class="capa" style="aspect-ratio:3/4;border-radius:12px;overflow:hidden;background:#14203A;display:flex;align-items:center;justify-content:center;font-size:60px">${b.capa_url ? `<img src="${esc(b.capa_url)}" alt="${esc(b.titulo)}" style="width:100%;height:100%;object-fit:cover">` : '📕'}</div>
    <div>
      <p class="eyebrow">${esc(b.categoria || 'Livro')}</p>
      <h1>${esc(b.titulo)}</h1>
      <p class="sub">${esc(b.subtitulo || b.descricao_curta || '')}</p>
      <div class="hero-ctas">
        <a class="btn btn-ouro hero-cta" href="#comprar">Quero este livro</a>
        ${b.tem_amostra ? `<a class="btn btn-folhear hero-cta" href="/livros/${esc(b.slug)}/folhear">📖 Folhear</a>` : ''}
      </div>
      ${b.tem_amostra ? '<p class="hero-cta-nota">Leia as primeiras páginas, como numa livraria.</p>' : ''}
    </div>
  </div></section>
  ${b.publico_alvo ? `<section><div class="wrap sec-narrow"><h2>Para quem é este livro</h2><p>${esc(b.publico_alvo)}</p></div></section>` : ''}
  ${b.descricao_longa ? `<section class="alt"><div class="wrap sec-narrow"><h2>Sobre o livro</h2><div style="white-space:pre-wrap">${esc(b.descricao_longa)}</div></div></section>` : ''}
  ${listaBeneficios ? `<section><div class="wrap sec-narrow"><h2>O que você vai aprender</h2>${listaBeneficios}</div></section>` : ''}
  ${bloco('Sumário', sumario)}
  ${bonus ? `<section><div class="wrap sec-narrow"><h2>Bônus</h2>${bonus}</div></section>` : ''}
  ${deps ? `<section class="alt"><div class="wrap"><h2 class="center">Quem já leu</h2>${deps}</div></section>` : ''}
  <section id="comprar"><div class="wrap sec-narrow">
    <h2 class="center">Escolha como quer receber</h2>
    <div class="precos">${planos || '<p class="muted">Indisponível no momento.</p>'}</div>
    <div class="garantia" style="margin-top:26px"><div class="selo">🛡️</div><div><strong>Garantia de 7 dias.</strong> Direito de arrependimento conforme o Código de Defesa do Consumidor. Não gostou? Devolvemos o valor. <a href="/politica-de-reembolso">Ver política</a>.</div></div>
    <p class="center" style="margin-top:18px"><a class="btn btn-wa" href="${waLink('Olá! Tenho uma dúvida sobre o livro ' + b.titulo)}">Tirar dúvida no WhatsApp</a></p>
  </div></section>
  ${faq ? `<section class="alt"><div class="wrap sec-narrow"><h2>Perguntas frequentes</h2>${faq}</div></section>` : ''}
  <div class="sticky-buy"><div class="wrap" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
    <div><strong>${esc(b.titulo)}</strong> <span class="muted">— ${precoMenor(b)}</span></div>
    <a class="btn btn-ouro" href="#comprar">Comprar</a>
  </div></div>
  <script>
    var LIVRO=${JSON.stringify({ id: b.id, slug: b.slug, titulo: b.titulo })};
    function comprar(tipo){ location.href='/checkout?livro='+encodeURIComponent(LIVRO.slug)+'&tipo='+tipo; }
  </script>`;

  const schema = {
    '@context': 'https://schema.org', '@type': 'Book', name: b.titulo, author: { '@type': 'Person', name: b.autor || 'Augusto Villela' },
    description: b.descricao_curta || b.subtitulo || '', url: SITE + '/livros/' + b.slug,
    image: b.capa_url || undefined,
    offers: [b.preco_pdf, b.preco_impresso, b.preco_combo].filter(v => v != null).map(v => ({ '@type': 'Offer', price: (v / 100).toFixed(2), priceCurrency: 'BRL', availability: 'https://schema.org/InStock' })),
  };
  return pagina({
    title: (b.seo_title || `${b.titulo}${b.subtitulo ? ' — ' + b.subtitulo : ''}`) + ' | Livraria Villela',
    description: b.seo_description || b.descricao_curta || b.subtitulo || b.titulo,
    path: '/livros/' + b.slug, ogImage: b.og_image || b.capa_url, schema, body,
  });
}

// ------------------------------------------------------------ checkout
function checkout(b, tipoInicial) {
  const opcoes = [];
  if (b.preco_pdf != null) opcoes.push({ tipo: 'pdf', nome: 'PDF (download imediato)', preco: b.preco_pdf });
  if (b.preco_impresso != null) opcoes.push({ tipo: 'impresso', nome: 'Impresso (enviado à sua casa)', preco: b.preco_impresso });
  if (b.preco_combo != null) opcoes.push({ tipo: 'combo', nome: 'Combo PDF + Impresso', preco: b.preco_combo });
  const body = `
  <section><div class="wrap" style="display:grid;grid-template-columns:1fr 340px;gap:30px">
    <div>
      <h1>Finalizar compra</h1>
      <form id="frm" onsubmit="return enviar(event)">
        <div class="campo"><label>Opção de compra</label>
          <select id="tipo" onchange="recalc()">${opcoes.map(o => `<option value="${o.tipo}" data-preco="${o.preco}" ${o.tipo === tipoInicial ? 'selected' : ''}>${esc(o.nome)} — ${brl(o.preco)}</option>`).join('')}</select></div>
        <h3>Seus dados</h3>
        <div class="campo"><label>Nome completo *</label><input id="nome" required autocomplete="name"></div>
        <div class="row2">
          <div class="campo"><label>E-mail *</label><input id="email" type="email" required autocomplete="email"></div>
          <div class="campo"><label>WhatsApp *</label><input id="whatsapp" required autocomplete="tel" placeholder="(61) 9...."></div>
        </div>
        <div class="row2">
          <div class="campo"><label>CPF/CNPJ *</label><input id="doc" required></div>
          <div class="campo"><label>País</label><input id="pais" value="Brasil"></div>
        </div>
        <div class="row2">
          <div class="campo"><label>Estado *</label><input id="estado" required></div>
          <div class="campo"><label>Cidade *</label><input id="cidade" required></div>
        </div>
        <div id="entrega">
          <h3>Endereço para entrega</h3>
          <p class="muted" style="font-size:13px;margin:-4px 0 10px">Usamos este endereço para a remessa do exemplar impresso e para o seu cadastro.</p>
          <div class="row2"><div class="campo"><label>CEP *</label><input id="cep" required autocomplete="postal-code" inputmode="numeric" placeholder="00000-000"></div><div class="campo"><label>Bairro *</label><input id="bairro" required></div></div>
          <div class="campo"><label>Logradouro (rua / avenida) *</label><input id="logradouro" required autocomplete="street-address"></div>
          <div class="row2"><div class="campo"><label>Número *</label><input id="numero" required autocomplete="off"></div><div class="campo"><label>Complemento</label><input id="complemento" placeholder="apto, bloco (opcional)"></div></div>
        </div>
        <div class="campo"><label><input type="checkbox" id="termos" required style="width:auto"> Li e aceito os <a href="/termos-de-uso" target="_blank">Termos</a> e a <a href="/politica-de-privacidade" target="_blank">Política de Privacidade</a>.</label></div>
        <div id="erro" class="aviso" style="display:none"></div>
        <button class="btn btn-ouro" id="btn" type="submit" style="width:100%">Ir para o pagamento</button>
        <p class="muted center" style="font-size:13px;margin-top:10px">Pagamento seguro via Mercado Pago (Pix ou cartão). Você não digita dados do cartão aqui.</p>
      </form>
    </div>
    <div><div class="resumo">
      <h3 style="margin-top:0">Resumo</h3>
      <p><strong>${esc(b.titulo)}</strong></p>
      <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span id="r-sub">—</span></div>
      <div class="campo" style="margin-top:14px"><label>Cupom de desconto</label>
        <div style="display:flex;gap:8px"><input id="cupom" style="flex:1"><button type="button" class="btn btn-ghost" onclick="aplicarCupom()">Aplicar</button></div>
        <div id="cupom-msg" class="muted" style="font-size:13px;margin-top:6px"></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:10px"><span>Desconto</span><span id="r-desc">R$ 0,00</span></div>
      <hr><div style="display:flex;justify-content:space-between;font-weight:800;font-size:18px"><span>Total</span><span id="r-total">—</span></div>
    </div></div>
  </div></section>
  <script>
    var LIVRO=${JSON.stringify({ id: b.id, slug: b.slug, titulo: b.titulo, precos: { pdf: b.preco_pdf, impresso: b.preco_impresso, combo: b.preco_combo } })};
    var descontoAtual=0, cupomAplicado='';
    var q=new URLSearchParams(location.search);
    function tipo(){return document.getElementById('tipo').value}
    function precoTipo(){return LIVRO.precos[tipo()]||0}
    function fmt(c){return 'R$ '+(c/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}
    function recalc(){
      var sub=precoTipo();document.getElementById('r-sub').textContent=fmt(sub);
      document.getElementById('r-desc').textContent='− '+fmt(descontoAtual);
      document.getElementById('r-total').textContent=fmt(Math.max(0,sub-descontoAtual));
    }
    async function aplicarCupom(){
      var cod=document.getElementById('cupom').value.trim();if(!cod){return}
      var r=await fetch('/livraria/api/cupom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo:cod,items:[{book_id:LIVRO.id,tipo:tipo(),quantidade:1}]})});
      var d=await r.json();var m=document.getElementById('cupom-msg');
      if(d.ok){descontoAtual=d.desconto;cupomAplicado=cod;m.style.color='#2e7d32';m.textContent='Cupom aplicado: −'+fmt(d.desconto);}
      else{descontoAtual=0;cupomAplicado='';m.style.color='#b3261e';m.textContent=d.motivo||'Cupom inválido';}
      recalc();
    }
    function erro(msg){var e=document.getElementById('erro');e.style.display='block';e.textContent=msg;document.getElementById('btn').disabled=false;document.getElementById('btn').textContent='Ir para o pagamento';}
    async function enviar(ev){
      ev.preventDefault();document.getElementById('erro').style.display='none';
      var btn=document.getElementById('btn');btn.disabled=true;btn.textContent='Redirecionando…';
      var v=id=>document.getElementById(id).value.trim();
      var body={items:[{book_id:LIVRO.id,tipo:tipo(),quantidade:1}],cupom:cupomAplicado,
        customer:{nome:v('nome'),email:v('email'),whatsapp:v('whatsapp'),doc:v('doc'),pais:v('pais'),estado:v('estado'),cidade:v('cidade'),consentimentos:{termos:true,em:new Date().toISOString()}},
        endereco_entrega:{cep:v('cep'),logradouro:v('logradouro'),numero:v('numero'),complemento:v('complemento'),bairro:v('bairro')},
        origem:{utm_source:q.get('utm_source')||'',utm_medium:q.get('utm_medium')||'',utm_campaign:q.get('utm_campaign')||'',ref:document.referrer||''}};
      try{
        var r=await fetch('/livraria/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        var d=await r.json();
        if(!r.ok||!d.url){return erro(d.erro||'Não foi possível iniciar o pagamento.');}
        try{window.fbq&&fbq('track','InitiateCheckout',{value:(Math.max(0,precoTipo()-descontoAtual)/100),currency:'BRL'});}catch(e){}
        location.href=d.url;
      }catch(e){erro('Falha de conexão. Tente novamente.');}
    }
    recalc();
  </script>`;
  return pagina({ title: `Checkout — ${b.titulo} | Livraria Villela`, description: 'Finalize sua compra com segurança.', path: '/checkout', body, extraHead: '<meta name="robots" content="noindex">' });
}

// ------------------------------------------------------------ obrigado
function obrigado(order) {
  const pago = order && order.status === 'pago';
  const body = `
  <section><div class="wrap-sm center" style="padding:40px 20px">
    <div style="font-size:56px">${pago ? '🎉' : '⏳'}</div>
    <h1>${pago ? 'Compra confirmada!' : 'Estamos confirmando seu pagamento'}</h1>
    ${order ? `<p class="muted">Pedido <code>${esc(order.id)}</code></p>` : ''}
    ${pago
      ? `<p>Obrigado pela compra! ${order.tem_pdf ? 'Seu PDF já está liberado — enviamos o link por e-mail e ele está na sua biblioteca.' : ''} ${order.tem_impresso ? 'Seu exemplar impresso entrou em produção.' : ''}</p>
         <p style="margin-top:22px"><a class="btn btn-ouro" href="/minha-biblioteca?p=${esc(order.id)}">Acessar minha biblioteca</a></p>`
      : `<p>Assim que o Mercado Pago confirmar (Pix costuma ser em segundos), liberamos seu acesso automaticamente e enviamos o link por e-mail. Você pode atualizar esta página.</p>
         ${order ? `<p style="margin-top:18px"><a class="btn btn-ghost" href="/minha-biblioteca?p=${esc(order.id)}">Ver minha biblioteca</a></p>` : ''}`}
    <p style="margin-top:18px"><a class="btn btn-wa" href="${waLink()}">Precisa de ajuda? Chame no WhatsApp</a></p>
  </div></section>
  ${pago ? pixelEvento('Purchase', { value: (order.valor_total / 100), currency: 'BRL', content_ids: (order.itens || []).map(i => i.book_id) }) : ''}`;
  return pagina({ title: pago ? 'Obrigado pela compra! — Livraria Villela' : 'Confirmando pagamento — Livraria Villela', description: 'Obrigado pela sua compra.', path: '/obrigado', body, extraHead: '<meta name="robots" content="noindex"><meta http-equiv="refresh" content="' + (pago ? '' : '15') + '">' });
}

// ------------------------------------------------------------ minha biblioteca
function biblioteca(order, tokensPorLivro) {
  let body;
  if (!order) {
    body = `<section><div class="wrap-sm">
      <h1>Minha biblioteca</h1>
      <p class="muted">Informe o e-mail da compra para receber o acesso aos seus livros por e-mail.</p>
      <form onsubmit="return pedir(event)">
        <div class="campo"><label>E-mail da compra</label><input id="email" type="email" required></div>
        <button class="btn btn-ouro" type="submit">Receber meus livros por e-mail</button>
      </form>
      <div id="msg" class="aviso" style="display:none;margin-top:14px"></div>
      <script>async function pedir(e){e.preventDefault();var m=document.getElementById('msg');m.style.display='block';
        var r=await fetch('/livraria/api/biblioteca-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value})});
        m.textContent='Se houver compras neste e-mail, enviamos os links de acesso agora. Confira sua caixa de entrada.';}
      </script>
    </div></section>`;
  } else if (order.status !== 'pago') {
    body = `<section><div class="wrap-sm center"><h1>Pagamento em confirmação</h1><p class="muted">Pedido ${esc(order.id)}. Assim que confirmar, seus downloads aparecem aqui.</p><p><a class="btn btn-ghost" href="/minha-biblioteca?p=${esc(order.id)}">Atualizar</a></p></div></section>`;
  } else {
    const itens = (order.itens || []).map(it => {
      const tk = (tokensPorLivro[it.book_id] || []).find(t => t.ativo);
      const dl = it.tipo !== 'impresso' && tk ? `<a class="btn btn-ouro" href="/download/${esc(tk.id)}">Baixar PDF</a>` : (it.tipo === 'impresso' ? '<span class="muted">Exemplar impresso — enviado pelos Correios</span>' : '<span class="muted">Link indisponível — fale com o suporte</span>');
      return `<div class="dep" style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><strong>${esc(it.titulo_snapshot)}</strong><br><span class="muted">${it.tipo.toUpperCase()}</span></div><div>${dl}</div></div>`;
    }).join('');
    body = `<section><div class="wrap-sm"><h1>Minha biblioteca</h1><p class="muted">Pedido ${esc(order.id)} · ${esc(order.cliente ? order.cliente.email : '')}</p>
      <div class="grid" style="gap:14px">${itens}</div>
      <p class="muted" style="font-size:13px;margin-top:16px">Os links de PDF são pessoais e têm validade. Se um link expirar, peça um novo pelo <a href="${waLink()}">WhatsApp</a> ou <a href="/suporte-livros">suporte</a>.</p>
    </div></section>`;
  }
  return pagina({ title: 'Minha biblioteca — Livraria Villela', description: 'Acesse os livros que você comprou.', path: '/minha-biblioteca', body, extraHead: '<meta name="robots" content="noindex">' });
}

// ------------------------------------------------------------ suporte
function suporte() {
  const body = `<section><div class="wrap-sm">
    <h1>Suporte da Livraria</h1>
    <p>Precisa de ajuda com uma compra, download ou entrega? Fale com a gente:</p>
    <p><a class="btn btn-wa" href="${waLink('Olá! Preciso de ajuda com uma compra na Livraria Villela.')}">WhatsApp</a></p>
    <p class="muted">Horário comercial. Guarde o número do seu pedido para agilizar o atendimento.</p>
    <h3>Dúvidas comuns</h3>
    <div class="faq">
      <details><summary>Não recebi o link do PDF</summary><p>Confira o spam e a aba Promoções. Ou acesse <a href="/minha-biblioteca">minha biblioteca</a> com o e-mail da compra.</p></details>
      <details><summary>Meu link expirou</summary><p>Sem problema — pedimos um novo link pelo WhatsApp e reenviamos na hora.</p></details>
      <details><summary>Quero reembolso</summary><p>Você tem 7 dias de garantia. Veja a <a href="/politica-de-reembolso">política de reembolso</a>.</p></details>
    </div>
  </div></section>`;
  return pagina({ title: 'Suporte — Livraria Villela', description: 'Atendimento ao comprador.', path: '/suporte-livros', body });
}

// ------------------------------------------------- folhear (amostra do livro)
// Leitor página a página, como quem folheia na livraria: pdf.js desenha em
// canvas (o arquivo não fica exposto como link de download) e o fim da amostra
// já convida a comprar. Funciona sem instalar nada: a lib é servida pelo backend.
function folhear(b) {
  const preco = precoMenor(b);
  const body = `
  <div class="fo-barra"><div class="wrap">
    <div class="fo-titulo"><b>${esc(b.titulo)}</b> <span style="opacity:.75;font-size:14px">· amostra</span></div>
    <div class="fo-nav">
      <button class="fo-btn" id="fo-ant" disabled aria-label="Página anterior">‹ Anterior</button>
      <span id="fo-pos" style="font-size:14px;min-width:76px;text-align:center;white-space:nowrap">página 1</span>
      <button class="fo-btn" id="fo-prox" aria-label="Próxima página">Próxima ›</button>
      <a class="fo-btn" href="/livros/${esc(b.slug)}#comprar" style="text-decoration:none">Comprar</a>
    </div>
  </div></div>
  <div class="fo-palco">
    <div id="fo-erro" class="fo-carregando" hidden>Não foi possível abrir a amostra agora.
      <a href="/livros/${esc(b.slug)}" style="color:#fff;text-decoration:underline">Voltar ao livro</a>.</div>
    <div id="fo-load" class="fo-carregando">Abrindo o livro…</div>
    <div class="fo-folha" id="fo-folha" hidden><canvas id="fo-canvas"></canvas></div>
    <div class="fo-fim" id="fo-fim" hidden>
      <h2 style="margin-top:0">Fim da amostra</h2>
      <p style="color:var(--suave)">Você leu as primeiras páginas de <strong>${esc(b.titulo)}</strong>.
      O livro completo continua desta página em diante.</p>
      <p><a class="btn btn-ouro" href="/livros/${esc(b.slug)}#comprar">Quero este livro${preco ? ' — ' + esc(preco) : ''}</a></p>
      <p style="font-size:13px;color:var(--suave);margin-bottom:0">Garantia de 7 dias · Entrega imediata do PDF</p>
    </div>
  </div>
  <script type="module">
    const url = '/livros/${esc(b.slug)}/amostra.pdf';
    const cv = document.getElementById('fo-canvas'), ctx = cv.getContext('2d');
    const elPos = document.getElementById('fo-pos'), elAnt = document.getElementById('fo-ant'), elProx = document.getElementById('fo-prox');
    const elFim = document.getElementById('fo-fim'), elLoad = document.getElementById('fo-load'), elFolha = document.getElementById('fo-folha');
    let doc = null, pag = 1, desenhando = false;
    try {
      const pdfjs = await import('/livros/pdfjs/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/livros/pdfjs/pdf.worker.mjs';
      // disableAutoFetch + range: abre a 1ª página sem baixar a amostra inteira
      doc = await pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: false, rangeChunkSize: 262144 }).promise;
      elLoad.hidden = true; elFolha.hidden = false;
      await desenhar(1);
    } catch (e) {
      elLoad.hidden = true; document.getElementById('fo-erro').hidden = false;
    }
    async function desenhar(n) {
      if (!doc || desenhando || n < 1 || n > doc.numPages) return;
      desenhando = true;
      const page = await doc.getPage(n);
      const larguraAlvo = Math.min(1240, Math.max(560, Math.floor(elFolha.clientWidth * (window.devicePixelRatio || 1))));
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: larguraAlvo / base.width });
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      pag = n; desenhando = false;
      elPos.textContent = innerWidth < 660 ? n + ' / ' + doc.numPages : 'página ' + n + ' de ' + doc.numPages;
      elAnt.disabled = n <= 1; elProx.disabled = n >= doc.numPages;
      elFim.hidden = n < doc.numPages;
      if (n >= doc.numPages) elFim.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    elAnt.onclick = () => desenhar(pag - 1);
    elProx.onclick = () => desenhar(pag + 1);
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') desenhar(pag - 1);
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') desenhar(pag + 1);
    });
    let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => desenhar(pag), 220); });
  </script>`;
  return pagina({
    title: `Folhear: ${b.titulo} — Livraria Villela`,
    description: `Leia gratuitamente as primeiras páginas de ${b.titulo}.`,
    path: `/livros/${b.slug}/folhear`,
    ogImage: b.capa_url ? SITE + b.capa_url : undefined,
    body,
    // amostra não é conteúdo próprio para indexar: o robô fica com a página do livro
    extraHead: '<meta name="robots" content="noindex,follow">',
  });
}

module.exports = { pagina, vitrine, paginaLivro, folhear, checkout, obrigado, biblioteca, suporte, SITE, waLink, esc };
