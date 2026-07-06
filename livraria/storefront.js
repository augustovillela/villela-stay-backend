// =====================================================================
// Livraria Villela — renderização server-side das páginas públicas (SEO).
// Tudo em HTML gerado no servidor: title/meta/OG/canonical/JSON-LD,
// slugs amigáveis. Paleta: azul petróleo, branco, cinza claro, dourado.
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
:root{--petroleo:#0c3644;--petroleo2:#12495b;--teal:#1c6e8c;--dourado:#d9a441;--dourado2:#c8912f;--creme:#f7f3ea;--cinza:#f4f6f7;--cinza2:#e7ecee;--tinta:#26313a;--suave:#5f7079}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--tinta);background:#fff;line-height:1.6}
h1,h2,h3{font-family:Georgia,'Times New Roman',serif;color:var(--petroleo);line-height:1.2;margin:.2em 0 .5em}
a{color:var(--teal);text-decoration:none}a:hover{text-decoration:underline}
img{max-width:100%;height:auto;display:block}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.wrap-sm{max-width:720px;margin:0 auto;padding:0 20px}
header.top{background:var(--petroleo);color:var(--creme);position:sticky;top:0;z-index:20}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}
header.top a{color:var(--creme)}
.brand{font-weight:700;font-size:19px;letter-spacing:.3px}.brand b{color:var(--dourado)}
.nav a{margin-left:20px;font-size:15px}
.btn{display:inline-block;background:var(--teal);color:#fff;padding:13px 26px;border-radius:9px;font-weight:700;border:0;cursor:pointer;font-size:16px;text-align:center;transition:.15s}
.btn:hover{background:#155a73;text-decoration:none}
.btn-ouro{background:var(--dourado);color:#3a2c07}.btn-ouro:hover{background:var(--dourado2)}
.btn-wa{background:#25d366;color:#0a2e17}.btn-wa:hover{background:#1eb955}
.btn-ghost{background:transparent;border:1.5px solid var(--cinza2);color:var(--petroleo)}
.hero{background:linear-gradient(160deg,var(--petroleo),var(--petroleo2));color:var(--creme);padding:56px 0}
.hero h1{color:#fff}.hero p.sub{font-size:19px;color:#dbe6ea;max-width:640px}
.eyebrow{text-transform:uppercase;letter-spacing:1.5px;font-size:12px;color:var(--dourado);font-weight:700}
.grid{display:grid;gap:26px}
.grid-books{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card{background:#fff;border:1px solid var(--cinza2);border-radius:14px;overflow:hidden;transition:.15s;display:flex;flex-direction:column}
.card:hover{box-shadow:0 10px 30px rgba(12,54,68,.12);transform:translateY(-2px)}
.card .capa{aspect-ratio:3/4;background:var(--cinza);display:flex;align-items:center;justify-content:center;color:var(--suave);overflow:hidden}
.card .capa img{width:100%;height:100%;object-fit:cover}
.card .corpo{padding:16px;display:flex;flex-direction:column;gap:8px;flex:1}
.card h3{margin:0;font-size:18px}.card .preco{color:var(--petroleo);font-weight:700}
.badge{display:inline-block;background:var(--dourado);color:#3a2c07;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;text-transform:uppercase;letter-spacing:.5px}
section{padding:44px 0}section.alt{background:var(--cinza)}
.sec-narrow{max-width:760px}
.lista-check{list-style:none;padding:0;margin:0}.lista-check li{padding:8px 0 8px 32px;position:relative}
.lista-check li:before{content:"✓";position:absolute;left:0;color:var(--teal);font-weight:800}
.precos{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.plano{border:2px solid var(--cinza2);border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:10px;background:#fff}
.plano.destaque{border-color:var(--dourado);box-shadow:0 8px 24px rgba(217,164,65,.15)}
.plano .valor{font-size:30px;font-weight:800;color:var(--petroleo);font-family:Georgia,serif}
.plano .tipo{font-weight:700;text-transform:uppercase;letter-spacing:.5px;font-size:13px;color:var(--suave)}
.faq details{border-bottom:1px solid var(--cinza2);padding:14px 0}.faq summary{cursor:pointer;font-weight:700;color:var(--petroleo)}
.dep{background:#fff;border:1px solid var(--cinza2);border-radius:12px;padding:18px}.dep .nome{font-weight:700;color:var(--petroleo);margin-top:8px}
.garantia{display:flex;gap:16px;align-items:center;background:var(--creme);border:1px solid #ece0c7;border-radius:14px;padding:20px}
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
  const og = ogImage || (SITE + '/livros/og-default.png');
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || '')}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Villela Stay">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description || '')}">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image">
${schema ? `<script type="application/ld+json">${JSON.stringify(schema)}</script>` : ''}
<style>${CSS}</style>${pixelsHead()}${extraHead}
</head><body>
<header class="top"><div class="wrap">
  <a class="brand" href="/livros">Livraria <b>Villela</b></a>
  <nav class="nav"><a href="/livros">Livros</a><a href="/minha-biblioteca">Minha biblioteca</a><a href="${SITE_PRINCIPAL}">Villela Stay</a></nav>
</div></header>
${body}
<footer class="rod"><div class="wrap"><div class="cols">
  <div><strong style="color:#fff">Villela Stay · Livraria</strong><br>Lago Sul, Brasília-DF<br>Augusto Villela Ltda · CNPJ 56.776.526/0001-12</div>
  <div><a href="/politica-de-privacidade">Privacidade</a> · <a href="/termos-de-uso">Termos</a><br>
    <a href="/politica-de-compra-e-entrega">Compra e entrega</a> · <a href="/politica-de-reembolso">Reembolso</a><br>
    <a href="/politica-de-livro-impresso">Livro impresso</a> · <a href="/suporte-livros">Suporte</a></div>
  <div><a class="btn-wa btn" href="${waLink()}">Falar no WhatsApp</a></div>
</div></div></footer>
</body></html>`;
}

// ------------------------------------------------------------ vitrine /livros
function vitrine(livros) {
  const cards = livros.length ? livros.map(b => `
    <a class="card" href="/livros/${esc(b.slug)}">
      <div class="capa">${b.capa_url ? `<img src="${esc(b.capa_url)}" alt="${esc(b.titulo)}" loading="lazy">` : '📕'}</div>
      <div class="corpo">
        ${b.destaque ? '<span class="badge">Destaque</span>' : ''}
        <h3>${esc(b.titulo)}</h3>
        <p class="muted" style="margin:0;font-size:14px">${esc(b.subtitulo || '')}</p>
        <div style="margin-top:auto" class="preco">${precoMenor(b)}</div>
      </div></a>`).join('') : '<p class="muted">Em breve novos títulos. Fale conosco no WhatsApp para novidades.</p>';
  const body = `
  <section class="hero"><div class="wrap">
    <p class="eyebrow">Livraria Villela</p>
    <h1>Livros para quem quer hospedar, empreender e viver melhor</h1>
    <p class="sub">Conteúdo prático escrito por Augusto Villela. Entrega imediata em PDF e opção de exemplar impresso.</p>
  </div></section>
  <section><div class="wrap"><div class="grid grid-books">${cards}</div></div></section>`;
  return pagina({
    title: 'Livraria Villela — livros de Augusto Villela',
    description: 'Livros práticos sobre hospedagem, negócios e estilo de vida. PDF com entrega imediata e opção impressa.',
    path: '/livros', body,
    schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Livraria Villela', url: SITE + '/livros' },
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
  <section class="hero"><div class="wrap" style="display:grid;grid-template-columns:280px 1fr;gap:34px;align-items:center">
    <div class="capa" style="aspect-ratio:3/4;border-radius:12px;overflow:hidden;background:#0a2b37;display:flex;align-items:center;justify-content:center;font-size:60px">${b.capa_url ? `<img src="${esc(b.capa_url)}" alt="${esc(b.titulo)}" style="width:100%;height:100%;object-fit:cover">` : '📕'}</div>
    <div>
      <p class="eyebrow">${esc(b.categoria || 'Livro')}</p>
      <h1>${esc(b.titulo)}</h1>
      <p class="sub">${esc(b.subtitulo || b.descricao_curta || '')}</p>
      <p><a class="btn btn-ouro" href="#comprar">Quero este livro</a></p>
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
        <div id="entrega" style="display:none">
          <h3>Endereço de entrega (livro impresso)</h3>
          <div class="row2"><div class="campo"><label>CEP</label><input id="cep"></div><div class="campo"><label>Bairro</label><input id="bairro"></div></div>
          <div class="campo"><label>Logradouro</label><input id="logradouro"></div>
          <div class="row2"><div class="campo"><label>Número</label><input id="numero"></div><div class="campo"><label>Complemento</label><input id="complemento"></div></div>
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
      document.getElementById('entrega').style.display=(tipo()==='impresso'||tipo()==='combo')?'block':'none';
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
  return pagina({ title: pago ? 'Obrigado pela compra! — Villela Stay' : 'Confirmando pagamento — Villela Stay', description: 'Obrigado pela sua compra.', path: '/obrigado', body, extraHead: '<meta name="robots" content="noindex"><meta http-equiv="refresh" content="' + (pago ? '' : '15') + '">' });
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

module.exports = { pagina, vitrine, paginaLivro, checkout, obrigado, biblioteca, suporte, SITE, waLink, esc };
