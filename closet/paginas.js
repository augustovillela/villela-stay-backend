// =====================================================================
// Closet Club — páginas públicas + shell do app. Server-rendered, sem build.
//
// Identidade PRÓPRIA (decisão do Augusto, 02/08/2026): este é um produto de
// consumo, não um SaaS B2B do portfólio — vale a paleta clean pedida
// (preto/branco/cinza + dourado, rosa queimado e oliva) com Playfair Display
// nos títulos e Inter no texto. A assinatura do Grupo Villela Stay entra
// discreta no rodapé, como endosso.
// =====================================================================
'use strict';
const path = require('path');
const repo = require('./repo');
const { db } = require('./db');
const { Items, Looks, Users, Config, OCASIOES, s, n } = repo;
const { Reviews } = require('./bookings');

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const brl2 = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const BRAND = '/assets/brand/closet-club';
const SITE = (process.env.CLOSET_BASE_URL || 'https://closet.villelastay.com.br').replace(/\/+$/, '');

// ---------------------------------------------------------------------
// Design system — muito espaço branco, tipografia grande, nada de "brechó"
// ---------------------------------------------------------------------
const CSS = `
:root{
  --preto:#111111; --branco:#FFFFFF; --cinza:#F4F4F4; --cinza2:#E7E7E7; --cinza-txt:#6B6B6B;
  --dourado:#C6A96B; --rosa:#D58E97; --oliva:#687056;
  --raio:2px; --transicao:.35s cubic-bezier(.22,.61,.36,1);
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--branco);color:var(--preto);
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.65;
  font-feature-settings:'liga' 1,'kern' 1;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,.serif{font-family:'Playfair Display',Georgia,serif;font-weight:500;letter-spacing:-.01em;line-height:1.12;margin:0}
h1{font-size:clamp(2.4rem,6vw,4.4rem)}
h2{font-size:clamp(1.8rem,3.6vw,2.9rem)}
h3{font-size:clamp(1.2rem,2vw,1.6rem)}
p{margin:0 0 1rem}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}
.wrap{max-width:1240px;margin:0 auto;padding:0 24px}
.wrap-s{max-width:760px;margin:0 auto;padding:0 24px}
.mono{font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;color:var(--cinza-txt);font-weight:500}
.lead{font-size:clamp(1.02rem,1.5vw,1.2rem);color:var(--cinza-txt);max-width:56ch}

/* ---- botões: retangulares, finos, sem sombra (COS/Zara) ---- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;
  background:var(--preto);color:var(--branco);border:1px solid var(--preto);border-radius:var(--raio);
  padding:15px 30px;font-size:.86rem;font-weight:500;letter-spacing:.1em;text-transform:uppercase;
  cursor:pointer;transition:var(--transicao);font-family:inherit}
.btn:hover{background:var(--branco);color:var(--preto)}
.btn.linha{background:transparent;color:var(--preto)}
.btn.linha:hover{background:var(--preto);color:var(--branco)}
.btn.claro{background:var(--branco);color:var(--preto);border-color:var(--branco)}
.btn.claro:hover{background:transparent;color:var(--branco)}
.btn.ouro{background:var(--dourado);border-color:var(--dourado);color:var(--preto)}
.btn.ouro:hover{background:transparent;color:var(--dourado)}
.btn.peq{padding:10px 18px;font-size:.72rem}
.btn[disabled]{opacity:.4;cursor:not-allowed}

/* ---- topo ---- */
header.topo{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);backdrop-filter:blur(14px);border-bottom:1px solid var(--cinza2)}
header.topo .wrap{display:flex;align-items:center;justify-content:space-between;gap:20px;height:74px}
.marca{font-family:'Playfair Display',Georgia,serif;font-size:1.4rem;letter-spacing:.02em;white-space:nowrap}
.marca b{font-weight:500}
.marca .club{color:var(--dourado);font-style:italic}
nav.principal{display:flex;align-items:center;gap:28px;font-size:.82rem;letter-spacing:.08em;text-transform:uppercase}
nav.principal a{position:relative;padding:4px 0;color:var(--cinza-txt);transition:var(--transicao)}
nav.principal a:hover{color:var(--preto)}
nav.principal a::after{content:'';position:absolute;left:0;bottom:0;width:0;height:1px;background:var(--preto);transition:var(--transicao)}
nav.principal a:hover::after{width:100%}
@media(max-width:900px){nav.principal .some{display:none}}

/* ---- hero ---- */
.hero{padding:clamp(60px,10vw,130px) 0 clamp(50px,7vw,96px);position:relative;overflow:hidden}
.hero .wrap{display:grid;grid-template-columns:1.05fr .95fr;gap:60px;align-items:center}
@media(max-width:900px){.hero .wrap{grid-template-columns:1fr;gap:36px}}
.hero h1 em{font-style:italic;color:var(--dourado)}
.hero .acoes{display:flex;gap:14px;flex-wrap:wrap;margin-top:34px}
.hero-arte{aspect-ratio:4/5;background:linear-gradient(150deg,var(--cinza) 0%,#EDE7DD 48%,#E4DAD2 100%);position:relative;border-radius:var(--raio)}
.hero-arte .selo{position:absolute;left:0;bottom:0;background:var(--branco);padding:22px 26px;max-width:74%}
.hero-arte .selo b{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:500;display:block}

/* ---- seções ---- */
section{padding:clamp(56px,8vw,110px) 0}
section.cinza{background:var(--cinza)}
.cabeca{max-width:660px;margin-bottom:clamp(32px,5vw,60px)}
.cabeca .mono{display:block;margin-bottom:14px}

/* ---- grade de peças / ocasiões ---- */
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:clamp(16px,2.4vw,32px)}
.card{background:var(--branco);transition:var(--transicao)}
.card .capa{aspect-ratio:3/4;background:var(--cinza);position:relative;overflow:hidden;border-radius:var(--raio)}
.card .capa img{width:100%;height:100%;object-fit:cover;transition:transform .6s cubic-bezier(.22,.61,.36,1)}
.card:hover .capa img{transform:scale(1.04)}
.card .capa .vazia{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;
  font-family:'Playfair Display',serif;font-size:1.1rem;color:#9a9a9a;background:linear-gradient(160deg,#F7F5F2,#EAE4DC)}
.card .selo{position:absolute;top:12px;left:12px;background:var(--branco);padding:5px 11px;font-size:.64rem;letter-spacing:.14em;text-transform:uppercase}
.card .selo.ouro{background:var(--dourado);color:var(--preto)}
.card .fav{position:absolute;top:10px;right:10px;background:rgba(255,255,255,.9);border:0;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:1rem;line-height:1}
.card h4{margin:14px 0 4px;font-size:1.02rem}
.card .meta{font-size:.8rem;color:var(--cinza-txt);display:flex;justify-content:space-between;gap:10px}
.card .preco{font-weight:600;color:var(--preto)}

.ocasioes{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(190px,100%),1fr));gap:2px;background:var(--cinza2)}
.ocasiao{position:relative;aspect-ratio:3/4;display:flex;align-items:flex-end;padding:22px;background:var(--branco);
  transition:var(--transicao);overflow:hidden}
.ocasiao:nth-child(3n+1){background:linear-gradient(165deg,#F7F5F2,#E9E2D8)}
.ocasiao:nth-child(3n+2){background:linear-gradient(165deg,#F5F2F3,#E8DDDF)}
.ocasiao:nth-child(3n){background:linear-gradient(165deg,#F2F4F0,#DFE4DA)}
.ocasiao:hover{filter:brightness(.96)}
.ocasiao span{font-family:'Playfair Display',serif;font-size:1.25rem;position:relative;z-index:2}
.ocasiao i{position:absolute;top:18px;right:18px;font-size:1.4rem;font-style:normal;opacity:.5}

/* ---- passos ---- */
.passos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:36px;counter-reset:p}
.passo{counter-increment:p;padding-top:26px;border-top:1px solid var(--preto)}
.passo::before{content:'0' counter(p);font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--dourado);display:block;margin-bottom:12px}
.passo b{display:block;margin-bottom:6px;font-size:1.05rem}
.passo p{color:var(--cinza-txt);font-size:.92rem;margin:0}

/* ---- duas colunas (para quem aluga / anuncia) ---- */
.duas{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:var(--cinza2)}
@media(max-width:820px){.duas{grid-template-columns:1fr}}
.duas > div{background:var(--branco);padding:clamp(30px,4vw,54px)}
.duas ul{list-style:none;padding:0;margin:22px 0 28px}
.duas li{padding:12px 0;border-bottom:1px solid var(--cinza2);font-size:.96rem}
.duas li::before{content:'—';color:var(--dourado);margin-right:12px}

/* ---- planos ---- */
.planos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:2px;background:var(--cinza2)}
.plano{background:var(--branco);padding:clamp(28px,3.4vw,44px);display:flex;flex-direction:column}
.plano .valor{font-family:'Playfair Display',serif;font-size:2.6rem;margin:10px 0 4px}
.plano .valor small{font-size:.9rem;font-family:'Inter',sans-serif;color:var(--cinza-txt)}
.plano ul{list-style:none;padding:0;margin:20px 0 26px;flex:1}
.plano li{padding:8px 0;font-size:.92rem;color:var(--cinza-txt)}
.plano li b{color:var(--preto);font-weight:500}
.plano.dest{outline:1px solid var(--dourado);outline-offset:-1px}

/* ---- confiança ---- */
.confianca{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:32px}
.confianca div b{display:block;font-family:'Playfair Display',serif;font-size:1.15rem;margin-bottom:8px}
.confianca div p{font-size:.9rem;color:var(--cinza-txt);margin:0}

/* ---- formulários ---- */
label{display:block;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--cinza-txt);margin:18px 0 6px}
input,select,textarea{width:100%;padding:13px 14px;border:1px solid var(--cinza2);border-radius:var(--raio);
  font:inherit;font-size:.95rem;background:var(--branco);color:var(--preto);transition:var(--transicao)}
input:focus,select:focus,textarea:focus{outline:0;border-color:var(--preto)}
.campos{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
@media(max-width:640px){.campos{grid-template-columns:1fr}}
.caixa{border:1px solid var(--cinza2);padding:clamp(24px,3.4vw,40px);border-radius:var(--raio)}
.erro{color:#A3232B;font-size:.88rem}
.ok{color:var(--oliva);font-size:.88rem}
.aviso{background:var(--cinza);border-left:2px solid var(--dourado);padding:14px 18px;font-size:.9rem;margin:16px 0}
.chip{display:inline-block;border:1px solid var(--cinza2);padding:5px 13px;font-size:.74rem;letter-spacing:.08em;
  text-transform:uppercase;margin:0 6px 6px 0;cursor:pointer;transition:var(--transicao);border-radius:var(--raio);background:var(--branco)}
.chip:hover{border-color:var(--preto)}
.chip.on{background:var(--preto);color:var(--branco);border-color:var(--preto)}
.chip.oliva{border-color:var(--oliva);color:var(--oliva)}
.chip.rosa{border-color:var(--rosa);color:#A6606A}

/* ---- rodapé ---- */
footer{background:var(--preto);color:#B9B9B9;padding:clamp(48px,6vw,80px) 0 34px;font-size:.88rem}
footer a{color:#E9E9E9}
footer a:hover{color:var(--dourado)}
footer .cols{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:32px;margin-bottom:44px}
@media(max-width:820px){footer .cols{grid-template-columns:1fr 1fr}}
footer h5{font-family:'Inter',sans-serif;font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:#7A7A7A;margin:0 0 14px;font-weight:500}
footer ul{list-style:none;padding:0;margin:0}
footer li{padding:5px 0}
footer .base{border-top:1px solid #262626;padding-top:26px;display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;font-size:.78rem;color:#7A7A7A}
footer .marca{color:var(--branco);font-size:1.5rem;margin-bottom:14px}

/* ---- animação discreta de entrada ---- */
@media(prefers-reduced-motion:no-preference){
  .sobe{opacity:0;transform:translateY(18px);animation:sobe .8s cubic-bezier(.22,.61,.36,1) forwards}
  @keyframes sobe{to{opacity:1;transform:none}}
}
`;

// GA4 — só nas páginas públicas (o painel tem noindex e dado pessoal).
// `cc()` é o atalho de evento usado no funil: ver peça → cotar → reservar → pagar.
// Nunca recebe e-mail, nome, CPF nem id de pessoa — só id de peça e valor.
const GA_ID = process.env.CLOSET_GA_ID || 'G-5L2YQ2BPQW';
const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());gtag('config','${GA_ID}');
window.cc=function(evento,dados){try{gtag('event',evento,Object.assign({currency:'BRL'},dados||{}))}catch(e){}};</script>`;

const HEAD = (titulo, descricao, extra = '') => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Closet Club">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="icon" type="image/svg+xml" href="${BRAND}/favicon.svg">
<link rel="apple-touch-icon" href="${BRAND}/apple-touch-icon.png">
<meta name="theme-color" content="#111111">
<link rel="manifest" href="/closet/manifest.webmanifest">
<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/closet/sw.js').catch(function(){})})}</script>
${/noindex/.test(extra) ? '' : GA}<style>${CSS}</style>${extra}`;
// ↑ Página marcada `noindex` (painel, QR de posse, link de convite) não recebe
// analytics: é onde há dado pessoal e onde a pessoa já está identificada.
// Amarrar a regra ao noindex garante que uma página nova não vaze por descuido.

const marca = () => `<a class="marca" href="/closet"><b>CLOSET</b> <span class="club">Club</span></a>`;

const topo = (ativo = '') => `<header class="topo"><div class="wrap">
  ${marca()}
  <nav class="principal">
    <a class="some" href="/closet/vitrine"${ativo === 'vitrine' ? ' style="color:var(--preto)"' : ''}>Peças</a>
    <a class="some" href="/closet/looks"${ativo === 'looks' ? ' style="color:var(--preto)"' : ''}>Looks</a>
    <a class="some" href="/closet/ia"${ativo === 'ia' ? ' style="color:var(--preto)"' : ''}>Meu look ideal</a>
    <a class="some" href="/closet/blog"${ativo === 'blog' ? ' style="color:var(--preto)"' : ''}>Diário</a>
    <a class="some" href="/closet/anunciar">Anunciar</a>
    <a href="/closet/app">Entrar</a>
  </nav>
</div></header>`;

const rodape = () => `<footer><div class="wrap">
  <div class="cols">
    <div>
      <div class="marca"><b>CLOSET</b> <span class="club" style="color:var(--dourado);font-style:italic">Club</span></div>
      <p style="max-width:34ch;color:#8E8E8E">O Airbnb dos guarda-roupas. Alugue o look inteiro de quem já tem — e transforme o seu armário parado em renda.</p>
    </div>
    <div><h5>Alugar</h5><ul>
      <li><a href="/closet/vitrine">Todas as peças</a></li>
      <li><a href="/closet/looks">Looks completos</a></li>
      <li><a href="/closet/ia">Descobrir meu look</a></li>
      <li><a href="/closet/vitrine?ocasiao=casamento">Casamento</a></li>
    </ul></div>
    <div><h5>Anunciar</h5><ul>
      <li><a href="/closet/anunciar">Como funciona</a></li>
      <li><a href="/closet/anunciar#planos">Planos</a></li>
      <li><a href="/closet/app">Meu painel</a></li>
    </ul></div>
    <div><h5>Confiança</h5><ul>
      <li><a href="/closet/como-funciona">Pagamento protegido</a></li>
      <li><a href="/closet/blog">Diário do Closet</a></li>
      <li><a href="/closet/parceiro">Seja parceiro</a></li>
      <li><a href="/closet/termos">Termos de uso</a></li>
      <li><a href="/closet/privacidade">Privacidade e LGPD</a></li>
    </ul></div>
  </div>
  <div class="base">
    <span>© ${new Date().getFullYear()} Closet Club · Uma marca do Grupo Villela Stay · CNPJ 56.776.526/0001-12</span>
    <span>Brasília · DF</span>
  </div>
</div></footer>`;

const pagina = (titulo, descricao, corpo, { ativo = '', script = '', extraHead = '' } = {}) =>
  `<!DOCTYPE html><html lang="pt-BR"><head>${HEAD(titulo, descricao, extraHead)}</head><body>
  ${topo(ativo)}${corpo}${rodape()}${script ? `<script>${script}</script>` : ''}</body></html>`;

// cartão de peça reutilizado na vitrine e nas prateleiras da home
function cardPeca(i) {
  const foto = (i.fotos || [])[0];
  return `<a class="card" href="/closet/peca/${esc(i.slug || i.id)}">
    <div class="capa">${foto && foto.url ? `<img src="${esc(foto.url)}" alt="${esc(foto.alt || i.titulo)}" loading="lazy">`
      : `<div class="vazia">${esc(i.titulo)}</div>`}
      ${i.destacado ? '<span class="selo ouro">Destaque</span>' : ''}</div>
    <h4>${esc(i.titulo)}</h4>
    <div class="meta"><span>${esc(i.marca || i.categoria)}${i.tamanho ? ' · ' + esc(i.tamanho) : ''}</span>
      <span class="preco">${brl(i.preco_diaria_centavos)}<span style="font-weight:400;color:var(--cinza-txt)">/dia</span></span></div>
    ${i.nota_media ? `<div class="meta" style="margin-top:2px"><span>★ ${i.nota_media.toFixed(1)} (${i.num_avaliacoes})</span><span>${esc(i.cidade || '')}</span></div>` : ''}
  </a>`;
}

// ---------------------------------------------------------------------
// LANDING
// ---------------------------------------------------------------------
function landingHTML() {
  const destaques = Items.buscar({ limite: 8 }).itens;
  const looks = Looks.buscar({ limite: 3 });
  const numeros = {
    pecas: n((db.prepare("SELECT COUNT(*) c FROM items WHERE status='ativo' AND moderacao='aprovado'").get() || {}).c),
    alugueis: n((db.prepare("SELECT COUNT(*) c FROM bookings WHERE status='concluido'").get() || {}).c),
  };
  const comissao = Config.num('comissao_pct', 20);
  const premium = repo.Planos.porSlug('premium') || { preco_centavos: 3900 };

  const corpo = `
  <div class="hero"><div class="wrap">
    <div class="sobe">
      <span class="mono">O Airbnb dos guarda-roupas</span>
      <h1 style="margin:18px 0 22px">Seu próximo look<br>já existe.<br><em>Você só precisa alugá-lo.</em></h1>
      <p class="lead">Vestido, bolsa, sapato e joia — o conjunto inteiro, de quem já tem, pela fração do preço. Pagamento protegido, retirada com QR Code, devolução registrada.</p>
      <div class="acoes">
        <a class="btn" href="/closet/ia">Quero encontrar meu look</a>
        <a class="btn linha" href="/closet/anunciar">Quero ganhar dinheiro alugando minhas roupas</a>
      </div>
      ${numeros.pecas ? `<p class="mono" style="margin-top:30px">${numeros.pecas} peças disponíveis${numeros.alugueis ? ` · ${numeros.alugueis} locações concluídas` : ''}</p>` : ''}
    </div>
    <div class="hero-arte sobe" style="animation-delay:.15s">
      <div class="selo"><span class="mono">Look completo</span><b>Casamento no campo</b>
        <span style="font-size:.86rem;color:var(--cinza-txt)">vestido + bolsa + sapato + brinco</span></div>
    </div>
  </div></div>

  <section class="cinza"><div class="wrap">
    <div class="cabeca"><span class="mono">Por ocasião</span>
      <h2>Não se procura "vestido midi". Procura-se o vestido do casamento de sábado.</h2></div>
    <div class="ocasioes">
      ${OCASIOES.map((o) => `<a class="ocasiao" href="/closet/vitrine?ocasiao=${o.slug}"><i>${o.emoji}</i><span>${esc(o.nome)}</span></a>`).join('')}
    </div>
  </div></section>

  ${destaques.length ? `<section><div class="wrap">
    <div class="cabeca" style="display:flex;justify-content:space-between;align-items:flex-end;max-width:none">
      <div><span class="mono">Acabaram de chegar</span><h2>Peças em destaque</h2></div>
      <a class="btn linha peq some" href="/closet/vitrine">Ver todas</a></div>
    <div class="grade">${destaques.map(cardPeca).join('')}</div>
  </div></section>` : ''}

  <section${destaques.length ? ' class="cinza"' : ''}><div class="wrap">
    <div class="cabeca"><span class="mono">Como funciona</span><h2>Do clique ao Pix, sem susto.</h2></div>
    <div class="passos">
      <div class="passo"><b>Cadastre sua roupa</b><p>Fotos, medidas e preço. A IA sugere quanto cobrar e escreve a descrição por você.</p></div>
      <div class="passo"><b>Receba reservas</b><p>O cliente reserva e paga. O valor fica <b>bloqueado</b> na plataforma — ninguém combina nada por fora.</p></div>
      <div class="passo"><b>Entregue com QR Code</b><p>Retirada e devolução registradas no app. Fica provado quem entregou o quê, e quando.</p></div>
      <div class="passo"><b>Receba por Pix</b><p>Devolução conferida, repasse liberado. A comissão de ${comissao}% já sai descontada.</p></div>
    </div>
  </div></section>

  <section style="padding-top:0"><div class="wrap"><div class="duas">
    <div>
      <span class="mono">Para quem aluga</span>
      <h3 style="margin:14px 0 0">Vista o que você não compraria.</h3>
      <ul>
        <li>Economize até 90% em relação ao preço da peça</li>
        <li>Use marcas premium sem comprometer o mês</li>
        <li>Roupa diferente em cada evento — e nada parado no armário</li>
        <li>O look inteiro num pedido só: peça-chave, bolsa, sapato e joia</li>
      </ul>
      <a class="btn" href="/closet/vitrine">Ver peças disponíveis</a>
    </div>
    <div>
      <span class="mono">Para quem anuncia</span>
      <h3 style="margin:14px 0 0">Seu armário parado vira renda.</h3>
      <ul>
        <li>Ganhe com peças que você usou uma vez</li>
        <li>Controle a agenda: você decide as datas livres</li>
        <li>Recebe por Pix, direto, sem correr atrás de ninguém</li>
        <li>Cliente avaliado, caução retida e disputa mediada pela plataforma</li>
      </ul>
      <a class="btn linha" href="/closet/anunciar">Começar a anunciar</a>
    </div>
  </div></div></section>

  <section class="cinza"><div class="wrap">
    <div class="cabeca"><span class="mono">Inteligência</span>
      <h2>Descubra seu look ideal.</h2>
      <p class="lead" style="margin-top:16px">Diga a ocasião, a cidade, o clima, a cor que você ama e o seu corpo. Em segundos, montamos conjuntos inteiros — com o porquê de cada escolha.</p></div>
    <div class="confianca" style="margin-bottom:38px">
      <div><b>Evento e horário</b><p>Casamento à noite pede outra coisa que almoço de formatura. A sugestão muda junto.</p></div>
      <div><b>Seu corpo, não a manequim</b><p>Altura, peso e manequim entram na conta: peça que não serve nem aparece.</p></div>
      <div><b>Cor que te valoriza</b><p>Tom de pele e cor preferida orientam a paleta do conjunto.</p></div>
      <div><b>Conjunto, não peça solta</b><p>Vestido, bolsa, sapato e joia — e o combo sai mais barato que as peças separadas.</p></div>
    </div>
    <a class="btn" href="/closet/ia">Montar meu look agora</a>
  </div></section>

  ${looks.length ? `<section><div class="wrap">
    <div class="cabeca"><span class="mono">Looks completos</span><h2>Alugue o conjunto inteiro.</h2></div>
    <div class="grade">${looks.map((l) => `<a class="card" href="/closet/look/${esc(l.slug || l.id)}">
      <div class="capa">${l.foto_capa ? `<img src="${esc(l.foto_capa)}" alt="${esc(l.titulo)}" loading="lazy">` : `<div class="vazia">${esc(l.titulo)}</div>`}
        <span class="selo">${l.itens.length} peças</span></div>
      <h4>${esc(l.titulo)}</h4>
      <div class="meta"><span>${esc(l.ocasiao || '')}</span>
        <span class="preco">${brl(l.preco_diaria_look_centavos)}<span style="font-weight:400;color:var(--cinza-txt)">/dia</span></span></div>
    </a>`).join('')}</div>
  </div></section>` : ''}

  <section class="cinza" id="confianca"><div class="wrap">
    <div class="cabeca"><span class="mono">Confiança</span><h2>Por que ninguém sai no prejuízo.</h2></div>
    <div class="confianca">
      <div><b>Pagamento bloqueado</b><p>O dinheiro entra por Pix e fica retido com a plataforma. O proprietário só recebe depois da devolução conferida.</p></div>
      <div><b>QR Code de posse</b><p>Retirada e devolução registradas com data, hora e autor. Ninguém discute o que ficou combinado.</p></div>
      <div><b>Caução e seguro</b><p>Caução reembolsável em toda reserva e seguro opcional sobre o valor da peça.</p></div>
      <div><b>Reputação dos dois lados</b><p>Cliente avalia a peça e o proprietário; o proprietário avalia o cliente. Reincidente é bloqueado.</p></div>
    </div>
  </div></section>

  <section id="planos"><div class="wrap">
    <div class="cabeca"><span class="mono">Para anunciantes</span><h2>Comece de graça. Cresça quando fizer sentido.</h2></div>
    <div class="planos">
      <div class="plano">
        <span class="mono">Grátis</span><div class="valor">R$ 0<small>/mês</small></div>
        <p style="color:var(--cinza-txt);font-size:.92rem">A plataforma só ganha quando você ganha.</p>
        <ul><li><b>10 peças</b> anunciadas</li><li>5 fotos por peça</li><li>Agenda e reservas</li>
          <li>Recebimento por Pix</li><li>Comissão de <b>${comissao}%</b> por locação</li></ul>
        <a class="btn linha" href="/closet/criar-conta?perfil=anunciar">Criar conta grátis</a>
      </div>
      <div class="plano dest">
        <span class="mono" style="color:var(--dourado)">Premium</span><div class="valor">${brl(premium.preco_centavos)}<small>/mês</small></div>
        <p style="color:var(--cinza-txt);font-size:.92rem">Para quem quer viver disso.</p>
        <ul><li><b>Peças ilimitadas</b> e 15 fotos cada</li><li><b>Destaque</b> no topo da vitrine</li>
          <li>Vídeo no anúncio</li><li>Analytics: visitas, conversão e receita por peça</li>
          <li>IA: preço sugerido, descrição e palavras-chave</li><li>Looks ilimitados</li></ul>
        <a class="btn ouro" href="/closet/criar-conta?perfil=anunciar&plano=premium">Assinar Premium</a>
      </div>
      <div class="plano">
        <span class="mono">Serviços extras</span><div class="valor">Sob demanda</div>
        <p style="color:var(--cinza-txt);font-size:.92rem">Contratados no próprio checkout.</p>
        <ul><li>Lavanderia credenciada</li><li>Fotografia profissional da peça</li>
          <li>Entrega e coleta</li><li>Seguro sobre o valor de reposição</li><li>Consultoria de estilo</li></ul>
        <a class="btn linha" href="/closet/parceiro">Quero ser parceiro</a>
      </div>
    </div>
  </div></section>

  <section class="cinza"><div class="wrap-s" style="text-align:center">
    <h2>Entre para o Closet Club.</h2>
    <p class="lead" style="margin:18px auto 30px">Receba primeiro as peças novas da sua cidade e no seu tamanho.</p>
    <form id="lead" style="max-width:520px;margin:0 auto;text-align:left">
      <div class="campos">
        <div><label>Nome</label><input id="l-nome" required></div>
        <div><label>E-mail</label><input id="l-email" type="email" required></div>
        <div><label>Cidade</label><input id="l-cidade" placeholder="Brasília"></div>
        <div><label>Eu quero</label><select id="l-perfil">
          <option value="quero_alugar">Alugar looks</option>
          <option value="quero_anunciar">Anunciar minhas roupas</option>
          <option value="parceiro">Ser parceiro (lavanderia, foto, styling)</option>
        </select></div>
      </div>
      <button class="btn" type="submit" style="margin-top:26px;width:100%">Quero fazer parte</button>
      <p id="l-msg" class="ok" style="margin-top:14px"></p>
    </form>
  </div></section>`;

  const script = `
  document.getElementById('lead').onsubmit=async e=>{e.preventDefault();
    const m=document.getElementById('l-msg');
    const r=await fetch('/closet/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nome:l_nome.value,email:l_email.value,cidade:l_cidade.value,perfil:l_perfil.value,origem:location.search})});
    m.textContent=r.ok?'Recebido! Avisamos assim que houver novidade na sua cidade.':'Não consegui enviar. Tente de novo.';
    m.className=r.ok?'ok':'erro'; if(r.ok) e.target.reset();};`;

  return pagina('Closet Club — alugue o look inteiro. O Airbnb dos guarda-roupas.',
    'Alugue vestido, bolsa, sapato e joia de quem já tem — o look completo, com pagamento protegido, QR Code de retirada e devolução registrada. Ou transforme seu armário parado em renda.',
    corpo, {
      script,
      extraHead: `<link rel="canonical" href="${SITE}/closet">
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'WebSite', name: 'Closet Club', url: SITE + '/closet',
        description: 'Marketplace de aluguel de roupas e looks completos entre pessoas.',
        publisher: { '@type': 'Organization', name: 'Grupo Villela Stay' },
        potentialAction: { '@type': 'SearchAction', target: SITE + '/closet/vitrine?q={q}', 'query-input': 'required name=q' },
      })}</script>`,
    });
}

// ---------------------------------------------------------------------
// VITRINE (busca com filtros; dados via API)
// ---------------------------------------------------------------------
function vitrineHTML(query = {}) {
  const corpo = `
  <section style="padding-bottom:24px"><div class="wrap">
    <div class="cabeca" style="margin-bottom:26px"><span class="mono">Vitrine</span><h2 id="v-titulo">Todas as peças</h2></div>
    <form id="filtros" style="border-top:1px solid var(--cinza2);border-bottom:1px solid var(--cinza2);padding:18px 0;margin-bottom:34px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0 16px">
        <div><label>Buscar</label><input id="f-q" placeholder="vestido, marca…"></div>
        <div><label>Ocasião</label><select id="f-ocasiao"><option value="">Todas</option>${OCASIOES.map((o) => `<option value="${o.slug}">${esc(o.nome)}</option>`).join('')}</select></div>
        <div><label>Categoria</label><select id="f-categoria"><option value="">Todas</option>${repo.CATEGORIAS.map((c) => `<option value="${c}">${esc(c)}</option>`).join('')}</select></div>
        <div><label>Tamanho</label><select id="f-tamanho"><option value="">Todos</option>${repo.TAMANHOS.map((t) => `<option value="${t}">${esc(t)}</option>`).join('')}</select></div>
        <div><label>Cidade</label><input id="f-cidade" list="cidades"><datalist id="cidades"></datalist></div>
        <div><label>Retirada</label><input id="f-de" type="date"></div>
        <div><label>Devolução</label><input id="f-ate" type="date"></div>
        <div><label>Até R$/dia</label><input id="f-max" type="number" min="0" step="10" placeholder="300"></div>
        <div><label>Ordenar</label><select id="f-ordem">
          <option value="relevancia">Relevância</option><option value="recentes">Novidades</option>
          <option value="preco_asc">Menor preço</option><option value="preco_desc">Maior preço</option>
          <option value="avaliacao">Melhor avaliadas</option></select></div>
      </div>
      <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn peq" type="submit">Filtrar</button>
        <button class="btn linha peq" type="button" id="limpar">Limpar</button>
        <span id="v-contagem" class="mono" style="align-self:center"></span>
      </div>
    </form>
    <div class="grade" id="v-grade"></div>
    <p id="v-vazio" class="lead" style="display:none;text-align:center;padding:60px 0">
      Nenhuma peça com esses filtros ainda.<br><a href="/closet/anunciar" style="text-decoration:underline">Que tal ser a primeira a anunciar?</a></p>
    <div style="text-align:center;margin-top:44px"><button class="btn linha" id="mais" style="display:none">Ver mais</button></div>
  </div></section>`;

  const script = `
  const q=new URLSearchParams(location.search);
  ['q','ocasiao','categoria','tamanho','cidade','de','ate','ordem'].forEach(k=>{const el=document.getElementById('f-'+k);if(el&&q.get(k))el.value=q.get(k)});
  if(q.get('preco_max'))document.getElementById('f-max').value=q.get('preco_max')/100;
  let offset=0;const LIM=24;
  const brl=c=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{maximumFractionDigits:0});
  const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  function params(){const p=new URLSearchParams();
    const v=id=>document.getElementById(id).value.trim();
    if(v('f-q'))p.set('q',v('f-q'));if(v('f-ocasiao'))p.set('ocasiao',v('f-ocasiao'));
    if(v('f-categoria'))p.set('categoria',v('f-categoria'));if(v('f-tamanho'))p.set('tamanho',v('f-tamanho'));
    if(v('f-cidade'))p.set('cidade',v('f-cidade'));if(v('f-de'))p.set('de',v('f-de'));if(v('f-ate'))p.set('ate',v('f-ate'));
    if(v('f-max'))p.set('preco_max',Math.round(Number(v('f-max'))*100));p.set('ordem',v('f-ordem')||'relevancia');
    p.set('limite',LIM);p.set('offset',offset);return p}
  function card(i){const f=(i.foto&&i.foto.url)?'<img src="'+esc(i.foto.url)+'" alt="'+esc(i.titulo)+'" loading="lazy">':'<div class="vazia">'+esc(i.titulo)+'</div>';
    return '<a class="card" href="/closet/peca/'+esc(i.slug||i.id)+'"><div class="capa">'+f+(i.destacado?'<span class="selo ouro">Destaque</span>':'')+'</div>'+
      '<h4>'+esc(i.titulo)+'</h4><div class="meta"><span>'+esc(i.marca||i.categoria)+(i.tamanho?' · '+esc(i.tamanho):'')+'</span>'+
      '<span class="preco">'+brl(i.preco_diaria_centavos)+'<span style="font-weight:400;color:var(--cinza-txt)">/dia</span></span></div>'+
      (i.nota_media?'<div class="meta" style="margin-top:2px"><span>★ '+i.nota_media.toFixed(1)+'</span><span>'+esc(i.cidade||'')+'</span></div>':'')+'</a>'}
  async function carregar(reset){
    if(reset){offset=0;document.getElementById('v-grade').innerHTML=''}
    const r=await fetch('/closet/api/vitrine?'+params());const d=await r.json();
    document.getElementById('v-grade').insertAdjacentHTML('beforeend',(d.itens||[]).map(card).join(''));
    const total=document.getElementById('v-grade').children.length;
    document.getElementById('v-vazio').style.display=total?'none':'block';
    document.getElementById('v-contagem').textContent=total?total+' peça(s)':'';
    document.getElementById('mais').style.display=(d.itens||[]).length===LIM?'inline-flex':'none';
    offset+=LIM;
    const p=params();p.delete('limite');p.delete('offset');history.replaceState(null,'','/closet/vitrine?'+p)}
  document.getElementById('filtros').onsubmit=e=>{e.preventDefault();carregar(true)};
  document.getElementById('mais').onclick=()=>carregar(false);
  document.getElementById('limpar').onclick=()=>{document.getElementById('filtros').reset();carregar(true)};
  fetch('/closet/api/catalogo').then(r=>r.json()).then(d=>{
    document.getElementById('cidades').innerHTML=(d.cidades||[]).map(c=>'<option value="'+esc(c.cidade)+'">').join('')});
  carregar(true);`;

  const oc = OCASIOES.find((o) => o.slug === s(query.ocasiao, 40));
  return pagina(oc ? `Aluguel de roupa para ${oc.nome} — Closet Club` : 'Vitrine — alugue peças e looks · Closet Club',
    oc ? `Peças disponíveis para alugar para ${oc.nome.toLowerCase()}: vestidos, bolsas, sapatos e joias com pagamento protegido.`
      : 'Todas as peças disponíveis para aluguel: filtre por ocasião, tamanho, cor, cidade e data.',
    corpo, { ativo: 'vitrine', script });
}

// ---------------------------------------------------------------------
// FICHA DA PEÇA (server-rendered — é a página que o Google indexa)
// ---------------------------------------------------------------------
function pecaHTML(item) {
  const i = item;
  const dono = Users.publico(i.owner_id) || {};
  const avaliacoes = Reviews.doAlvo('item', i.id, 8);
  const combina = Items.complementares(i, 4);
  const fotos = i.fotos || [];
  const medidas = Object.entries(i.medidas || {}).filter(([, v]) => n(v, 0) > 0);
  const modelo = i.modelo || {};

  const corpo = `
  <section style="padding-top:40px"><div class="wrap">
    <div style="display:grid;grid-template-columns:1.15fr .85fr;gap:clamp(28px,4vw,64px);align-items:start">
      <div>
        <div style="aspect-ratio:3/4;background:var(--cinza);overflow:hidden">
          ${fotos[0] && fotos[0].url ? `<img id="foto-grande" src="${esc(fotos[0].url)}" alt="${esc(i.titulo)}" style="width:100%;height:100%;object-fit:cover">`
            : `<div style="height:100%;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;color:#9a9a9a;font-size:1.4rem;background:linear-gradient(160deg,#F7F5F2,#EAE4DC)">${esc(i.titulo)}</div>`}
        </div>
        ${fotos.length > 1 ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-top:8px">
          ${fotos.map((f) => `<img src="${esc(f.url)}" alt="${esc(f.alt || '')}" loading="lazy" style="aspect-ratio:1;object-fit:cover;cursor:pointer"
            onclick="document.getElementById('foto-grande').src=this.src">`).join('')}</div>` : ''}
        ${i.video_url ? `<video controls style="width:100%;margin-top:8px" src="${esc(i.video_url)}"></video>` : ''}
      </div>

      <div>
        <span class="mono">${esc(i.categoria)}${i.marca ? ' · ' + esc(i.marca) : ''}</span>
        <h1 style="font-size:clamp(1.9rem,3.4vw,2.8rem);margin:12px 0 16px">${esc(i.titulo)}</h1>
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">
          <span style="font-family:'Playfair Display',serif;font-size:2.1rem">${brl(i.preco_diaria_centavos)}</span>
          <span style="color:var(--cinza-txt)">por diária</span>
        </div>
        ${i.preco_3dias_centavos ? `<p class="mono">3 diárias por ${brl(i.preco_3dias_centavos)}</p>` : ''}
        ${i.nota_media ? `<p style="margin:10px 0">★ ${i.nota_media.toFixed(1)} · ${i.num_avaliacoes} avaliação(ões) · ${i.alugueis} locação(ões)</p>` : ''}

        <div style="margin:22px 0">
          ${(i.ocasioes || []).map((o) => { const oc = OCASIOES.find((x) => x.slug === o); return `<a class="chip" href="/closet/vitrine?ocasiao=${esc(o)}">${oc ? oc.emoji + ' ' + esc(oc.nome) : esc(o)}</a>`; }).join('')}
          ${i.tamanho ? `<span class="chip on">Tam. ${esc(i.tamanho)}</span>` : ''}
          ${i.cor ? `<span class="chip">${esc(i.cor)}</span>` : ''}
          ${i.condicao ? `<span class="chip oliva">${esc(i.condicao)}</span>` : ''}
        </div>

        <div class="caixa" style="margin:26px 0">
          <div class="campos">
            <div><label>Retirada</label><input id="r-de" type="date"></div>
            <div><label>Devolução</label><input id="r-ate" type="date"></div>
          </div>
          <label style="margin-top:16px"><input type="checkbox" id="r-seguro" style="width:auto;margin-right:8px">Incluir seguro da peça</label>
          <label style="margin-top:2px"><input type="checkbox" id="r-credito" style="width:auto;margin-right:8px">Usar meu crédito (se eu tiver)</label>
          <div id="r-orcamento" style="margin:18px 0;font-size:.94rem"></div>
          <button class="btn" id="r-btn" style="width:100%">Verificar disponibilidade</button>
          <p id="r-msg" style="margin-top:12px;font-size:.9rem"></p>
          <p class="mono" style="margin-top:14px">Pagamento bloqueado até a devolução${i.caucao_centavos ? ` · caução de ${brl(i.caucao_centavos)} reembolsável` : ''}</p>
        </div>

        ${i.descricao ? `<p style="white-space:pre-line">${esc(i.descricao)}</p>` : ''}

        ${(modelo.altura_cm || modelo.peso_kg || modelo.vestiu) ? `<div class="aviso">
          <b>Na foto:</b> a modelo tem ${modelo.altura_cm ? (n(modelo.altura_cm) / 100).toFixed(2).replace('.', ',') + 'm' : ''}${modelo.peso_kg ? ' e ' + n(modelo.peso_kg) + 'kg' : ''}${modelo.vestiu ? ` e vestiu tamanho <b>${esc(modelo.vestiu)}</b>` : ''}.</div>` : ''}

        ${medidas.length ? `<h3 style="margin:30px 0 12px">Medidas</h3>
          <table style="width:100%;border-collapse:collapse;font-size:.92rem">
          ${medidas.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid var(--cinza2);text-transform:capitalize">${esc(k)}</td>
            <td style="padding:8px 0;border-bottom:1px solid var(--cinza2);text-align:right">${n(v)} cm</td></tr>`).join('')}</table>` : ''}

        <h3 style="margin:34px 0 12px">Proprietária</h3>
        <a href="/closet/pessoa/${esc(dono.id || '')}" style="display:flex;gap:14px;align-items:center;border:1px solid var(--cinza2);padding:16px">
          <div style="width:48px;height:48px;border-radius:50%;background:var(--cinza);flex-shrink:0;overflow:hidden">
            ${dono.avatar_url ? `<img src="${esc(dono.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}</div>
          <div style="font-size:.9rem">
            <b>${esc(dono.nome || '')}</b>${dono.verificado ? ' <span class="mono" style="color:var(--oliva)">verificada</span>' : ''}<br>
            <span style="color:var(--cinza-txt)">
              ${dono.nota_media ? `★ ${dono.nota_media.toFixed(1)} · ` : ''}${dono.num_alugueis || 0} locação(ões) ·
              ${Math.max(1, Math.round((dono.tempo_plataforma_dias || 0) / 30))} mês(es) na plataforma
              ${dono.resposta_min ? ` · responde em ~${dono.resposta_min} min` : ''}</span><br>
            <span style="color:var(--cinza-txt)">${esc(i.bairro || i.cidade || '')}${i.uf ? ' · ' + esc(i.uf) : ''}</span>
          </div></a>
      </div>
    </div>
  </div></section>

  ${avaliacoes.length ? `<section class="cinza"><div class="wrap">
    <div class="cabeca"><span class="mono">Avaliações</span><h2>Quem já alugou</h2></div>
    <div class="grade">${avaliacoes.map((a) => `<div class="caixa" style="background:var(--branco)">
      <div style="margin-bottom:8px">${'★'.repeat(a.nota)}<span style="color:var(--cinza2)">${'★'.repeat(5 - a.nota)}</span></div>
      <p style="font-size:.94rem">${esc(a.texto)}</p>
      <span class="mono">${esc(a.autor_nome)} · ${esc(String(a.criado_em).slice(0, 10))}</span>
      ${a.resposta ? `<p style="margin-top:12px;padding-left:14px;border-left:2px solid var(--dourado);font-size:.9rem;color:var(--cinza-txt)">${esc(a.resposta)}</p>` : ''}
    </div>`).join('')}</div>
  </div></section>` : ''}

  ${combina.length ? `<section><div class="wrap">
    <div class="cabeca"><span class="mono">Complete o look</span><h2>Combina com</h2></div>
    <div class="grade">${combina.map(cardPeca).join('')}</div>
  </div></section>` : ''}`;

  const script = `
  const ID='${esc(i.id)}';
  const brl=c=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const $=id=>document.getElementById(id);
  cc('view_item',{items:[{item_id:ID,item_name:${JSON.stringify(i.titulo)},item_category:${JSON.stringify(i.categoria)},price:${(i.preco_diaria_centavos / 100).toFixed(2)}}]});
  $('r-btn').onclick=async()=>{
    const de=$('r-de').value,ate=$('r-ate').value,msg=$('r-msg'),orc=$('r-orcamento');
    msg.textContent='';orc.innerHTML='';
    if(!de||!ate){msg.textContent='Escolha as datas de retirada e devolução.';msg.className='erro';return}
    const r=await fetch('/closet/api/cotar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({item_ids:[ID],de:de,ate:ate,seguro:$('r-seguro').checked,usar_credito:$('r-credito').checked})});
    const d=await r.json();
    if(!r.ok){msg.textContent=d.erro;msg.className='erro';return}
    if(!d.disponivel){msg.textContent=(d.indisponiveis[0]||{}).motivo||'Indisponível nessas datas.';msg.className='erro';return}
    orc.innerHTML='<div style="display:flex;justify-content:space-between;padding:5px 0"><span>'+d.dias+' diária(s)</span><b>'+brl(d.subtotal_centavos)+'</b></div>'
      +(d.credito_centavos?'<div style="display:flex;justify-content:space-between;padding:5px 0;color:var(--oliva)"><span>Seu crédito</span><span>−'+brl(d.credito_centavos)+'</span></div>':'')
      +(d.seguro_centavos?'<div style="display:flex;justify-content:space-between;padding:5px 0"><span>Seguro</span><span>'+brl(d.seguro_centavos)+'</span></div>':'')
      +(d.caucao_centavos?'<div style="display:flex;justify-content:space-between;padding:5px 0;color:var(--cinza-txt)"><span>Caução (devolvida)</span><span>'+brl(d.caucao_centavos)+'</span></div>':'')
      +'<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--cinza2);margin-top:6px"><b>Total</b><b>'+brl(d.total_centavos)+'</b></div>';
    msg.className='ok';msg.textContent='Disponível!';
    cc('begin_checkout',{value:d.total_centavos/100,items:[{item_id:ID}]});
    $('r-btn').textContent='Reservar agora';
    $('r-btn').onclick=async()=>{
      const rr=await fetch('/closet/api/reservas',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({item_ids:[ID],de:de,ate:ate,seguro:$('r-seguro').checked,usar_credito:$('r-credito').checked})});
      const dd=await rr.json();
      if(rr.status===401){location.href='/closet/entrar?voltar='+encodeURIComponent(location.pathname);return}
      if(!rr.ok){msg.textContent=dd.erro;msg.className='erro';return}
      cc('purchase',{transaction_id:dd.reserva.codigo,value:dd.reserva.total_centavos/100,items:[{item_id:ID}]});
      location.href='/closet/app#reserva/'+dd.reserva.id};
  };`;

  const fotoUrl = fotos[0] && fotos[0].url ? fotos[0].url : '';
  return pagina(`${i.titulo} — aluguel${i.cidade ? ' em ' + i.cidade : ''} · Closet Club`,
    (i.descricao || `Alugue ${i.titulo}${i.marca ? ' da ' + i.marca : ''}${i.tamanho ? ', tamanho ' + i.tamanho : ''}, por ${brl(i.preco_diaria_centavos)} a diária.`).slice(0, 300),
    corpo, {
      ativo: 'vitrine', script,
      extraHead: `<link rel="canonical" href="${SITE}/closet/peca/${esc(i.slug || i.id)}">
      ${fotoUrl ? `<meta property="og:image" content="${esc(fotoUrl)}">` : ''}
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Product', name: i.titulo, description: (i.descricao || '').slice(0, 500),
        brand: i.marca || undefined, category: i.categoria, image: fotoUrl || undefined,
        offers: { '@type': 'Offer', price: (i.preco_diaria_centavos / 100).toFixed(2), priceCurrency: 'BRL', availability: 'https://schema.org/InStock', url: `${SITE}/closet/peca/${i.slug || i.id}` },
        ...(i.num_avaliacoes ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: i.nota_media, reviewCount: i.num_avaliacoes } } : {}),
      })}</script>`,
    });
}

// ---------------------------------------------------------------------
// LOOK (o conjunto)
// ---------------------------------------------------------------------
function lookHTML(l) {
  const corpo = `
  <section style="padding-top:40px"><div class="wrap">
    <div class="cabeca"><span class="mono">Look completo · ${l.itens.length} peças${l.donos > 1 ? ` de ${l.donos} proprietárias` : ''}</span>
      <h1 style="font-size:clamp(2rem,4vw,3.2rem);margin:14px 0">${esc(l.titulo)}</h1>
      ${l.descricao ? `<p class="lead">${esc(l.descricao)}</p>` : ''}</div>

    <div style="display:grid;grid-template-columns:1fr 380px;gap:clamp(28px,4vw,56px);align-items:start">
      <div class="grade">${l.itens.map((i) => `<a class="card" href="/closet/peca/${esc(i.slug || i.id)}">
        <div class="capa">${(i.fotos || [])[0] && i.fotos[0].url ? `<img src="${esc(i.fotos[0].url)}" alt="${esc(i.titulo)}" loading="lazy">` : `<div class="vazia">${esc(i.titulo)}</div>`}
          <span class="selo">${esc(i.papel || i.categoria)}</span></div>
        <h4>${esc(i.titulo)}</h4>
        <div class="meta"><span>${esc(i.marca || '')}${i.tamanho ? ' · ' + esc(i.tamanho) : ''}</span><span class="preco">${brl(i.preco_diaria_centavos)}/dia</span></div>
      </a>`).join('')}</div>

      <div class="caixa" style="position:sticky;top:100px">
        <span class="mono">O conjunto inteiro</span>
        <div style="display:flex;align-items:baseline;gap:10px;margin:10px 0">
          <span style="font-family:'Playfair Display',serif;font-size:2.2rem">${brl(l.preco_diaria_look_centavos)}</span>
          <span style="color:var(--cinza-txt);text-decoration:line-through">${brl(l.preco_diaria_soma_centavos)}</span>
        </div>
        <p class="mono" style="color:var(--oliva)">Economia de ${l.desconto_pct}% alugando junto</p>
        <div class="campos" style="margin-top:16px">
          <div><label>Retirada</label><input id="k-de" type="date"></div>
          <div><label>Devolução</label><input id="k-ate" type="date"></div>
        </div>
        <div id="k-orcamento" style="margin:16px 0;font-size:.94rem"></div>
        <button class="btn" id="k-btn" style="width:100%">Verificar disponibilidade</button>
        <p id="k-msg" style="margin-top:12px;font-size:.9rem"></p>
        <p class="mono" style="margin-top:14px">Uma reserva só. Cada proprietária confirma a sua peça.</p>
      </div>
    </div>
  </div></section>`;

  const script = `
  const LOOK='${esc(l.id)}';const $=id=>document.getElementById(id);
  const brl=c=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
  $('k-btn').onclick=async()=>{
    const de=$('k-de').value,ate=$('k-ate').value,msg=$('k-msg');msg.textContent='';
    if(!de||!ate){msg.textContent='Escolha as datas.';msg.className='erro';return}
    const r=await fetch('/closet/api/cotar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({look_id:LOOK,de:de,ate:ate})});
    const d=await r.json();
    if(!r.ok){msg.textContent=d.erro;msg.className='erro';return}
    if(!d.disponivel){msg.textContent='Indisponível: '+d.indisponiveis.map(x=>x.titulo).join(', ');msg.className='erro';return}
    $('k-orcamento').innerHTML='<div style="display:flex;justify-content:space-between;padding:5px 0"><span>'+d.dias+' diária(s)</span><b>'+brl(d.subtotal_centavos)+'</b></div>'
      +(d.desconto_centavos?'<div style="display:flex;justify-content:space-between;padding:5px 0;color:var(--oliva)"><span>Desconto do look</span><span>−'+brl(d.desconto_centavos)+'</span></div>':'')
      +(d.caucao_centavos?'<div style="display:flex;justify-content:space-between;padding:5px 0;color:var(--cinza-txt)"><span>Caução (devolvida)</span><span>'+brl(d.caucao_centavos)+'</span></div>':'')
      +'<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--cinza2)"><b>Total</b><b>'+brl(d.total_centavos)+'</b></div>';
    msg.className='ok';msg.textContent='Todas as peças disponíveis!';
    $('k-btn').textContent='Reservar o look';
    $('k-btn').onclick=async()=>{
      const rr=await fetch('/closet/api/reservas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({look_id:LOOK,de:de,ate:ate})});
      const dd=await rr.json();
      if(rr.status===401){location.href='/closet/entrar?voltar='+encodeURIComponent(location.pathname);return}
      if(!rr.ok){msg.textContent=dd.erro;msg.className='erro';return}
      location.href='/closet/app#reserva/'+dd.reserva.id};
  };`;

  return pagina(`${l.titulo} — look completo para alugar · Closet Club`,
    (l.descricao || `Alugue o look completo "${l.titulo}": ${l.itens.map((i) => i.categoria).join(', ')}. Uma reserva só, com desconto de ${l.desconto_pct}%.`).slice(0, 300),
    corpo, { ativo: 'looks', script, extraHead: `<link rel="canonical" href="${SITE}/closet/look/${esc(l.slug || l.id)}">` });
}

// ---------------------------------------------------------------------
// GALERIA DE LOOKS
// ---------------------------------------------------------------------
function looksHTML() {
  const looks = Looks.buscar({ limite: 40 });
  const corpo = `
  <section><div class="wrap">
    <div class="cabeca"><span class="mono">Looks completos</span>
      <h2>Não alugue uma peça. Alugue o look.</h2>
      <p class="lead" style="margin-top:16px">Vestido, bolsa, sapato e joia numa reserva só — e mais barato que alugando separado.</p></div>
    <div style="margin-bottom:34px">
      <a class="chip on" href="/closet/looks">Todos</a>
      ${OCASIOES.map((o) => `<a class="chip" href="/closet/looks?ocasiao=${o.slug}">${o.emoji} ${esc(o.nome)}</a>`).join('')}
    </div>
    ${looks.length ? `<div class="grade">${looks.map((l) => `<a class="card" href="/closet/look/${esc(l.slug || l.id)}">
      <div class="capa">${l.foto_capa ? `<img src="${esc(l.foto_capa)}" alt="${esc(l.titulo)}" loading="lazy">` : `<div class="vazia">${esc(l.titulo)}</div>`}
        <span class="selo">${l.itens.length} peças</span></div>
      <h4>${esc(l.titulo)}</h4>
      <div class="meta"><span>${esc(l.ocasiao || '')}</span><span class="preco">${brl(l.preco_diaria_look_centavos)}/dia</span></div>
    </a>`).join('')}</div>`
      : `<p class="lead" style="text-align:center;padding:70px 0">Os primeiros looks estão sendo montados.<br>
         <a href="/closet/ia" style="text-decoration:underline">Monte o seu com a IA</a> ou
         <a href="/closet/anunciar" style="text-decoration:underline">crie um look com as suas peças</a>.</p>`}
  </div></section>`;
  return pagina('Looks completos para alugar · Closet Club',
    'Alugue o conjunto inteiro: vestido, bolsa, sapato e joia numa reserva só, com desconto.', corpo, { ativo: 'looks' });
}

// ---------------------------------------------------------------------
// IA — "Descubra seu look ideal"
// ---------------------------------------------------------------------
function iaHTML() {
  const corpo = `
  <section><div class="wrap-s">
    <div class="cabeca" style="text-align:center;margin:0 auto 44px">
      <span class="mono">Consultoria em 8 perguntas</span>
      <h2 style="margin:14px 0">Descubra seu look ideal.</h2>
      <p class="lead" style="margin:0 auto">Responda o que der. Quanto mais você contar, melhor a sugestão — e mostramos o porquê de cada peça.</p></div>

    <form id="brief" class="caixa">
      <div class="campos">
        <div><label>Qual a ocasião?</label><select id="b-ocasiao">${OCASIOES.map((o) => `<option value="${o.slug}">${o.emoji} ${esc(o.nome)}</option>`).join('')}</select></div>
        <div><label>Horário</label><select id="b-horario"><option value="">Tanto faz</option><option value="dia">Dia</option><option value="tarde">Tarde</option><option value="noite">Noite</option></select></div>
        <div><label>Cidade</label><input id="b-cidade" placeholder="Brasília"></div>
        <div><label>Clima esperado</label><select id="b-clima"><option value="">Tanto faz</option><option value="quente">Calor</option><option value="ameno">Ameno</option><option value="frio">Frio</option></select></div>
        <div><label>Cor preferida</label><input id="b-cor" placeholder="verde, vinho, off-white…"></div>
        <div><label>Estilo</label><select id="b-estilo"><option value="">Sem preferência</option>${repo.ESTILOS.map((e) => `<option value="${e}">${esc(e)}</option>`).join('')}</select></div>
        <div><label>Altura (cm)</label><input id="b-altura" type="number" min="130" max="210" placeholder="168"></div>
        <div><label>Peso (kg)</label><input id="b-peso" type="number" min="35" max="180" placeholder="62"></div>
        <div><label>Manequim (se souber)</label><input id="b-manequim" type="number" min="34" max="56" placeholder="40"></div>
        <div><label>Calçado</label><input id="b-calcado" type="number" min="30" max="46" placeholder="37"></div>
        <div><label>Tom de pele</label><select id="b-tom"><option value="">Prefiro não dizer</option>
          <option value="clara">Clara</option><option value="media">Média</option><option value="morena">Morena</option><option value="negra">Negra</option></select></div>
        <div><label>Retirada</label><input id="b-de" type="date"></div>
        <div><label>Devolução</label><input id="b-ate" type="date"></div>
      </div>
      <label>Quanto quer gastar por diária? (opcional)</label><input id="b-orcamento" type="number" min="0" step="50" placeholder="400">
      <button class="btn" type="submit" style="width:100%;margin-top:28px">Montar meus looks</button>
      <p class="mono" style="margin-top:14px">Altura, peso e tom de pele são usados só para calcular a sugestão. Você pode deixar em branco.</p>
    </form>

    <div id="resultado" style="margin-top:56px"></div>
  </div></section>`;

  const script = `
  const $=id=>document.getElementById(id);
  const brl=c=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{maximumFractionDigits:0});
  const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  document.getElementById('brief').onsubmit=async e=>{e.preventDefault();
    const r=$('resultado');r.innerHTML='<p class="lead" style="text-align:center">Montando…</p>';
    const body={ocasiao:$('b-ocasiao').value,horario:$('b-horario').value,cidade:$('b-cidade').value,clima:$('b-clima').value,
      cor:$('b-cor').value,estilo:$('b-estilo').value,altura_cm:$('b-altura').value,peso_kg:$('b-peso').value,
      manequim:$('b-manequim').value,calcado:$('b-calcado').value,tom_pele:$('b-tom').value,de:$('b-de').value,ate:$('b-ate').value,
      orcamento_centavos:$('b-orcamento').value?Math.round(Number($('b-orcamento').value)*100):0};
    cc('ia_briefing',{ocasiao:body.ocasiao||'',com_datas:!!(body.de&&body.ate)});
    const resp=await fetch('/closet/api/ia/looks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await resp.json();
    cc('ia_looks',{motor:d.motor,quantidade:(d.looks||[]).length});
    if(!d.looks||!d.looks.length){r.innerHTML='<div class="aviso">'+esc(d.aviso||'Nada encontrado.')+'</div>';return}
    r.innerHTML='<div class="cabeca"><span class="mono">'+d.looks.length+' sugestões · '+d.total_analisado+' peças analisadas</span>'
      +'<h2>Feitos para você</h2></div>'
      +d.looks.map(function(L){return '<div class="caixa" style="margin-bottom:26px">'
        +'<div style="display:flex;justify-content:space-between;align-items:baseline;gap:14px;flex-wrap:wrap">'
        +'<h3>'+esc(L.titulo)+'</h3><div style="text-align:right"><span style="font-family:\\'Playfair Display\\',serif;font-size:1.6rem">'+brl(L.preco_diaria_look_centavos)+'</span>'
        +'<span style="color:var(--cinza-txt)">/dia</span></div></div>'
        +(L.porques.length?'<p class="mono" style="margin:8px 0 0">'+L.porques.map(esc).join(' · ')+'</p>':'')
        +'<div class="grade" style="margin-top:20px">'+L.itens.map(function(i){
          return '<a class="card" href="/closet/peca/'+esc(i.id)+'"><div class="capa">'
            +((i.foto&&i.foto.url)?'<img src="'+esc(i.foto.url)+'" alt="" loading="lazy">':'<div class="vazia">'+esc(i.titulo)+'</div>')
            +'<span class="selo">'+esc(i.papel)+'</span></div><h4>'+esc(i.titulo)+'</h4>'
            +'<div class="meta"><span>'+esc(i.marca||i.categoria)+'</span><span class="preco">'+brl(i.preco_diaria_centavos)+'/dia</span></div></a>'}).join('')
        +'</div></div>'}).join('');
    r.scrollIntoView({behavior:'smooth',block:'start'})};`;

  return pagina('Descubra seu look ideal — consultoria de moda com IA · Closet Club',
    'Responda 8 perguntas sobre a ocasião, o clima e o seu corpo e receba looks completos montados para você, com o porquê de cada peça.',
    corpo, { ativo: 'ia', script });
}

// ---------------------------------------------------------------------
// ANUNCIAR (página de conversão do proprietário)
// ---------------------------------------------------------------------
function anunciarHTML() {
  const comissao = Config.num('comissao_pct', 20);
  const premium = repo.Planos.porSlug('premium') || { preco_centavos: 3900 };
  const corpo = `
  <section><div class="wrap">
    <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center">
      <div><span class="mono">Para anunciantes</span>
        <h1 style="margin:18px 0 20px">Quanto vale o<br>seu armário parado?</h1>
        <p class="lead">Aquele vestido usado uma vez pode render todo mês. Você define as datas, a plataforma cuida do pagamento, do contrato de posse e da cobrança.</p>
        <div class="hero .acoes" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:32px;padding:0">
          <a class="btn" href="/closet/criar-conta?perfil=anunciar">Criar conta grátis</a>
          <a class="btn linha" href="#quanto">Simular meu ganho</a></div>
      </div>
      <div class="hero-arte" style="aspect-ratio:1"><div class="selo"><span class="mono">Comissão</span>
        <b>${comissao}%</b><span style="font-size:.86rem;color:var(--cinza-txt)">só quando você aluga</span></div></div>
    </div>
  </div></section>

  <section class="cinza" id="quanto"><div class="wrap-s">
    <div class="cabeca" style="text-align:center;margin:0 auto 34px"><span class="mono">Simulador</span><h2>Quanto eu ganharia?</h2></div>
    <div class="caixa" style="background:var(--branco)">
      <div class="campos">
        <div><label>Quantas peças você anunciaria?</label><input id="s-pecas" type="number" min="1" value="5"></div>
        <div><label>Diária média (R$)</label><input id="s-diaria" type="number" min="0" step="10" value="150"></div>
        <div><label>Locações por peça no mês</label><input id="s-loc" type="number" min="0" step="1" value="2"></div>
        <div><label>Diárias por locação</label><input id="s-dias" type="number" min="1" value="3"></div>
      </div>
      <div id="s-res" style="margin-top:26px;border-top:1px solid var(--cinza2);padding-top:22px"></div>
      <p class="mono" style="margin-top:16px">Estimativa: depende da demanda real da sua cidade e do seu acervo. Não é promessa de rendimento.</p>
    </div>
  </div></section>

  <section><div class="wrap">
    <div class="cabeca"><span class="mono">Como funciona</span><h2>Você anuncia. A gente protege.</h2></div>
    <div class="passos">
      <div class="passo"><b>Fotografe e cadastre</b><p>A IA sugere o preço a partir do valor da peça e do que já existe na plataforma, e escreve a descrição.</p></div>
      <div class="passo"><b>Aprove a reserva</b><p>Você recebe o pedido com o valor já pago e bloqueado. Aceita ou recusa em até 24h.</p></div>
      <div class="passo"><b>Entregue com QR</b><p>O app registra retirada e devolução. Fica documentado — é o que evita o "eu te entreguei sim".</p></div>
      <div class="passo"><b>Receba por Pix</b><p>Conferiu a peça de volta, o repasse é liberado com a comissão de ${comissao}% já descontada.</p></div>
    </div>
  </div></section>

  <section class="cinza" id="planos"><div class="wrap">
    <div class="cabeca"><span class="mono">Planos</span><h2>Grátis para começar.</h2></div>
    <div class="planos">
      <div class="plano"><span class="mono">Grátis</span><div class="valor">R$ 0<small>/mês</small></div>
        <ul><li><b>10 peças</b></li><li>5 fotos por peça</li><li>Agenda, reservas e chat</li><li>Comissão de <b>${comissao}%</b></li></ul>
        <a class="btn linha" href="/closet/criar-conta?perfil=anunciar">Começar</a></div>
      <div class="plano dest"><span class="mono" style="color:var(--dourado)">Premium</span><div class="valor">${brl(premium.preco_centavos)}<small>/mês</small></div>
        <ul><li><b>Peças ilimitadas</b>, 15 fotos</li><li><b>Destaque</b> na vitrine</li><li>Vídeo no anúncio</li>
          <li>Analytics por peça</li><li>IA de preço, descrição e SEO</li></ul>
        <a class="btn ouro" href="/closet/criar-conta?perfil=anunciar&plano=premium">Assinar</a></div>
    </div>
  </div></section>`;

  const script = `
  const $=id=>document.getElementById(id);
  const brl=c=>'R$ '+Number(c||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
  function calc(){
    const p=Number($('s-pecas').value||0),d=Number($('s-diaria').value||0),l=Number($('s-loc').value||0),dd=Number($('s-dias').value||0);
    const bruto=p*d*l*dd, comissao=bruto*${comissao}/100, liquido=bruto-comissao;
    $('s-res').innerHTML='<div style="display:flex;justify-content:space-between;padding:6px 0"><span>Receita bruta no mês</span><b>'+brl(bruto)+'</b></div>'
      +'<div style="display:flex;justify-content:space-between;padding:6px 0;color:var(--cinza-txt)"><span>Comissão da plataforma (${comissao}%)</span><span>−'+brl(comissao)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:12px 0;border-top:1px solid var(--cinza2);margin-top:6px">'
      +'<b>Você recebe por Pix</b><b style="font-family:\\'Playfair Display\\',serif;font-size:1.5rem">'+brl(liquido)+'</b></div>'
      +'<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--cinza-txt);font-size:.86rem"><span>No ano</span><span>'+brl(liquido*12)+'</span></div>'}
  ['s-pecas','s-diaria','s-loc','s-dias'].forEach(id=>$(id).oninput=calc);calc();`;

  return pagina('Ganhe dinheiro alugando suas roupas · Closet Club',
    `Transforme o guarda-roupa parado em renda: você define as datas, a plataforma cuida do pagamento protegido e do repasse por Pix. Comissão de ${comissao}%.`,
    corpo, { script });
}

// ---------------------------------------------------------------------
// Autenticação, conteúdo institucional e app
// ---------------------------------------------------------------------
function entrarHTML(voltar = '') {
  const corpo = `<section><div class="wrap-s" style="max-width:460px">
    <div class="cabeca" style="text-align:center"><span class="mono">Bem-vinda de volta</span><h2 style="margin-top:12px">Entrar</h2></div>
    <form id="f" class="caixa">
      <label>E-mail</label><input id="e" type="email" required autocomplete="email">
      <label>Senha</label><input id="s" type="password" required autocomplete="current-password">
      <button class="btn" type="submit" style="width:100%;margin-top:26px">Entrar</button>
      <p id="m" class="erro" style="margin-top:12px"></p>
      <p style="margin-top:20px;font-size:.9rem;text-align:center">
        <a href="/closet/esqueci" style="text-decoration:underline">Esqueci minha senha</a><br>
        <span style="color:var(--cinza-txt)">Ainda não tem conta?</span> <a href="/closet/criar-conta" style="text-decoration:underline">Criar conta</a></p>
    </form></div></section>`;
  const script = `document.getElementById('f').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('m');m.textContent='';
    const r=await fetch('/closet/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:document.getElementById('e').value,senha:document.getElementById('s').value})});
    const d=await r.json();if(!r.ok){m.textContent=d.erro;return}
    location.href=${JSON.stringify(s(voltar, 200) || '/closet/app')};};`;
  return pagina('Entrar · Closet Club', 'Acesse sua conta do Closet Club.', corpo, { script });
}

function criarContaHTML(query = {}) {
  const anunciar = s(query.perfil, 30) === 'anunciar';
  const codigo = s(query.indicacao, 40).toUpperCase();
  let convite = null;
  if (codigo) { try { convite = require('./crescimento').Indicacoes.porCodigo(codigo); } catch (_) {} }
  const corpo = `<section><div class="wrap-s" style="max-width:520px">
    <div class="cabeca" style="text-align:center"><span class="mono">${anunciar ? 'Comece a anunciar' : 'Entre para o clube'}</span>
      <h2 style="margin-top:12px">Criar conta</h2>
      <p class="lead" style="margin:14px auto 0">Uma conta só: você aluga e anuncia com ela.</p></div>
    ${convite ? `<div class="aviso" style="margin-bottom:20px">🎁 Convite de <b>${esc(convite.nome)}</b>:
      ${brl(Config.num('indicacao_premio_convidado_centavos', 3000))} de crédito quando você concluir o primeiro aluguel.</div>` : ''}
    <form id="f" class="caixa">
      <div class="campos">
        <div><label>Nome completo</label><input id="nome" required autocomplete="name"></div>
        <div><label>E-mail</label><input id="email" type="email" required autocomplete="email"></div>
        <div><label>WhatsApp</label><input id="tel" autocomplete="tel" placeholder="(61) 9…"></div>
        <div><label>Cidade</label><input id="cidade" placeholder="Brasília"></div>
      </div>
      <label>Senha (8+ caracteres)</label><input id="senha" type="password" required minlength="8" autocomplete="new-password">
      <label style="text-transform:none;letter-spacing:0;font-size:.86rem;color:var(--preto);margin-top:22px">
        <input type="checkbox" id="termos" style="width:auto;margin-right:8px" required>
        Li e aceito os <a href="/closet/termos" target="_blank" style="text-decoration:underline">termos de uso</a> e a
        <a href="/closet/privacidade" target="_blank" style="text-decoration:underline">política de privacidade</a>.</label>
      <label style="text-transform:none;letter-spacing:0;font-size:.86rem;color:var(--cinza-txt);margin-top:10px">
        <input type="checkbox" id="mkt" style="width:auto;margin-right:8px">Quero receber novidades de peças na minha cidade.</label>
      <button class="btn" type="submit" style="width:100%;margin-top:26px">Criar minha conta</button>
      <p id="m" class="erro" style="margin-top:12px"></p>
      <p style="margin-top:18px;font-size:.9rem;text-align:center;color:var(--cinza-txt)">
        Já tem conta? <a href="/closet/entrar" style="text-decoration:underline;color:var(--preto)">Entrar</a></p>
    </form></div></section>`;
  const script = `document.getElementById('f').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('m');m.textContent='';
    const r=await fetch('/closet/api/cadastrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      nome:nome.value,email:email.value,telefone:tel.value,cidade:cidade.value,senha:senha.value,
      indicacao:new URLSearchParams(location.search).get('indicacao')||'',
      aceite_termos:termos.checked,consent_marketing:mkt.checked,origem:location.search})});
    const d=await r.json();if(!r.ok){m.textContent=d.erro;return}
    location.href='/closet/app${anunciar ? '#pecas' : ''}';};`;
  return pagina('Criar conta · Closet Club', 'Crie sua conta no Closet Club: alugue looks completos ou transforme seu armário em renda.', corpo, { script });
}

function esqueciHTML() {
  const corpo = `<section><div class="wrap-s" style="max-width:440px">
    <div class="cabeca" style="text-align:center"><h2>Recuperar senha</h2></div>
    <form id="f" class="caixa"><label>Seu e-mail</label><input id="e" type="email" required>
      <button class="btn" type="submit" style="width:100%;margin-top:22px">Enviar link</button>
      <p id="m" class="ok" style="margin-top:12px"></p></form></div></section>`;
  const script = `document.getElementById('f').onsubmit=async e=>{e.preventDefault();
    await fetch('/closet/api/esqueci-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('e').value})});
    document.getElementById('m').textContent='Se houver conta com esse e-mail, o link de redefinição foi enviado.';};`;
  return pagina('Recuperar senha · Closet Club', 'Recupere o acesso à sua conta.', corpo, { script });
}

function definirSenhaHTML() {
  const corpo = `<section><div class="wrap-s" style="max-width:440px">
    <div class="cabeca" style="text-align:center"><h2>Nova senha</h2></div>
    <form id="f" class="caixa"><label>Nova senha (8+)</label><input id="s1" type="password" minlength="8" required>
      <label>Confirme</label><input id="s2" type="password" minlength="8" required>
      <button class="btn" type="submit" style="width:100%;margin-top:22px">Salvar</button>
      <p id="m" class="erro" style="margin-top:12px"></p></form></div></section>`;
  const script = `document.getElementById('f').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('m');
    if(s1.value!==s2.value){m.textContent='As senhas não conferem.';return}
    const r=await fetch('/closet/api/definir-senha',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:new URLSearchParams(location.search).get('token'),senha:s1.value})});
    const d=await r.json();if(!r.ok){m.textContent=d.erro;return}location.href='/closet/app';};`;
  return pagina('Definir senha · Closet Club', 'Defina uma nova senha.', corpo, { script });
}

// página do QR (retirada/devolução)
function qrHTML(token) {
  const corpo = `<section><div class="wrap-s" style="max-width:520px">
    <div id="qr" class="caixa" style="text-align:center"><p class="lead">Verificando…</p></div></div></section>`;
  const script = `
  const T=${JSON.stringify(s(token, 80))};const cx=document.getElementById('qr');
  const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  (async()=>{
    const r=await fetch('/closet/api/qr/'+encodeURIComponent(T));
    if(r.status===401){cx.innerHTML='<h3>Entre para continuar</h3><p class="lead" style="margin:14px auto">Faça login com a conta que participa desta reserva.</p><a class="btn" href="/closet/entrar?voltar='+encodeURIComponent(location.pathname)+'">Entrar</a>';return}
    const d=await r.json();
    if(!r.ok){cx.innerHTML='<h3>QR Code inválido</h3><p class="lead">'+esc(d.erro)+'</p>';return}
    const et=d.etapa==='retirada'?'Retirada':'Devolução';
    cx.innerHTML='<span class="mono">'+esc(d.reserva.codigo)+'</span><h2 style="margin:10px 0 6px">'+et+'</h2>'
      +'<p class="lead" style="margin:0 auto 18px">'+esc(d.reserva.status_rotulo)+'</p>'
      +'<div style="text-align:left;border-top:1px solid var(--cinza2);padding-top:16px">'
      +d.reserva.itens.map(i=>'<div style="padding:6px 0">• '+esc(i.titulo)+'</div>').join('')
      +'<p class="mono" style="margin-top:12px">'+esc(d.reserva.data_retirada)+' → '+esc(d.reserva.data_devolucao)+'</p></div>'
      +(d.pode_registrar?'<button class="btn" id="ok" style="width:100%;margin-top:22px">Confirmar '+et.toLowerCase()+'</button>'
        :'<div class="aviso" style="margin-top:20px">Nada a registrar nesta etapa.</div>')
      +'<p id="m" style="margin-top:12px"></p>';
    const b=document.getElementById('ok');
    if(b)b.onclick=async()=>{b.disabled=true;
      const rr=await fetch('/closet/api/qr/'+encodeURIComponent(T),{method:'POST'});const dd=await rr.json();
      const m=document.getElementById('m');
      if(!rr.ok){m.className='erro';m.textContent=dd.erro;b.disabled=false;return}
      cx.innerHTML='<h2>✓ '+et+' registrada</h2><p class="lead" style="margin:14px auto">Reserva '+esc(d.reserva.codigo)+'.</p><a class="btn" href="/closet/app">Ir para o meu Closet</a>'};
  })();`;
  return pagina('Registro de posse · Closet Club', 'Registro de retirada e devolução.', corpo, { script });
}

// páginas institucionais (texto real, sem lero-lero)
function institucionalHTML(qual) {
  const conteudos = {
    'como-funciona': {
      titulo: 'Como funciona o pagamento protegido',
      corpo: `<h2>Como funciona</h2>
        <p>O Closet Club não é um mural de anúncios: a plataforma fica no meio da transação, e é isso que reduz golpe dos dois lados.</p>
        <h3 style="margin:28px 0 8px">1. Reserva e pagamento</h3>
        <p>O cliente escolhe as datas e paga por Pix. <b>O dinheiro fica retido com a plataforma</b> — o proprietário ainda não recebeu nada.</p>
        <h3 style="margin:28px 0 8px">2. Confirmação</h3>
        <p>O proprietário tem ${Config.num('prazo_confirmacao_h', 24)} horas para confirmar. Se não confirmar, a reserva é cancelada e <b>o cliente é reembolsado integralmente</b>.</p>
        <h3 style="margin:28px 0 8px">3. Retirada com QR Code</h3>
        <p>Na entrega, quem participa da reserva abre o QR Code no app e confirma. Fica registrado quem, quando e o quê.</p>
        <h3 style="margin:28px 0 8px">4. Devolução e vistoria</h3>
        <p>A devolução também é registrada por QR Code. O proprietário tem ${Config.num('janela_vistoria_h', 24)} horas para conferir a peça e, se houver dano, abrir uma disputa.</p>
        <h3 style="margin:28px 0 8px">5. Repasse</h3>
        <p>Sem contestação, o repasse é liberado por Pix ao proprietário com a comissão de ${Config.num('comissao_pct', 20)}% já descontada, e a caução volta ao cliente.</p>
        <h3 style="margin:28px 0 8px">Cancelamento</h3>
        <p>Reembolso conforme a antecedência: ${(Config.json('cancelamento', []) || []).map((r) => `${r.reembolso_pct}% com ${r.dias}+ dias`).join(' · ')}. A caução volta sempre integralmente.</p>
        <h3 style="margin:28px 0 8px">Disputa</h3>
        <p>Dano, não devolução ou peça diferente do anúncio: qualquer lado abre disputa e a plataforma media, com o valor ainda bloqueado. A decisão pode reter parte da caução como indenização.</p>`,
    },
    termos: {
      titulo: require('./termos').titulo,
      corpo: require('./termos').corpo(),
    },
    privacidade: {
      titulo: 'Privacidade e LGPD',
      corpo: `<h2>Privacidade e LGPD</h2>
        <p>Controladora: <b>Augusto Villela Ltda</b> (CNPJ 56.776.526/0001-12), operadora da marca Closet Club.</p>
        <h3 style="margin:26px 0 8px">O que coletamos e por quê</h3>
        <ul style="line-height:2">
          <li><b>Cadastro</b> (nome, e-mail, telefone, cidade) — para criar a conta e permitir o contato entre as partes. Base legal: execução de contrato.</li>
          <li><b>CPF e chave Pix</b> — para pagamento e repasse, e para prevenção a fraude. Ficam restritos: não aparecem em anúncio, vitrine nem para outros usuários.</li>
          <li><b>Medidas do corpo, altura, peso e tom de pele</b> — <b>opcionais</b>, usados só para calcular a sugestão de look. Você pode não informar e usar a plataforma normalmente.</li>
          <li><b>Histórico de reservas, avaliações e mensagens</b> — para reputação, mediação de disputas e obrigações fiscais.</li>
        </ul>
        <h3 style="margin:26px 0 8px">Com quem compartilhamos</h3>
        <p>Com o provedor de pagamento (para processar o Pix) e, quando você contrata, com o parceiro do serviço escolhido (lavanderia, entrega, fotografia). Nunca vendemos dados.</p>
        <h3 style="margin:26px 0 8px">Seus direitos</h3>
        <p>No painel, em <b>Conta</b>, você pode <b>baixar todos os seus dados</b> em um arquivo e <b>excluir sua conta</b>. A exclusão anonimiza seus dados pessoais; registros financeiros exigidos por lei são mantidos sem identificação. Reservas em andamento precisam ser concluídas antes.</p>
        <h3 style="margin:26px 0 8px">Contato do encarregado</h3>
        <p>augusto.villela@gmail.com</p>`,
    },
    parceiro: {
      titulo: 'Seja parceiro',
      corpo: `<h2>Seja parceiro do Closet Club</h2>
        <p class="lead">Lavanderias, fotógrafos, costureiras, stylists, maquiadores, cabeleireiros, joalherias e transportadoras: o cliente monta o evento inteiro por aqui, não só a roupa.</p>
        <p style="margin-top:24px">Seus serviços aparecem no checkout da reserva, na cidade em que você atende. A plataforma retém uma comissão sobre o serviço e repassa o restante.</p>
        <p><a class="btn" href="/closet#planos" style="margin-top:20px">Quero me cadastrar</a></p>`,
    },
  };
  const c = conteudos[qual] || conteudos['como-funciona'];
  return pagina(`${c.titulo} · Closet Club`, c.titulo,
    `<section><div class="wrap-s">${c.corpo}</div></section>`, {});
}

// ---------------------------------------------------------------------
// BLOG — o que traz quem ainda não sabe que dá para alugar
// ---------------------------------------------------------------------
function blogHTML(query = {}) {
  const { Posts } = require('./conteudo');
  const cat = s(query.categoria, 40);
  const posts = Posts.publicados({ categoria: cat, ocasiao: s(query.ocasiao, 40), limite: 30 });
  const cardPost = (p) => `<a class="card" href="/closet/blog/${esc(p.slug)}">
    <div class="capa" style="aspect-ratio:16/10">${p.capa ? `<img src="${esc(p.capa)}" alt="${esc(p.titulo)}" loading="lazy">`
      : `<div class="vazia">${esc((Posts.CATEGORIAS.find((c) => c.slug === p.categoria) || {}).nome || 'Closet Club')}</div>`}</div>
    <h4>${esc(p.titulo)}</h4>
    <div class="meta"><span>${esc((Posts.CATEGORIAS.find((c) => c.slug === p.categoria) || {}).nome || p.categoria)}</span>
      <span>${esc(String(p.publicado_em).slice(0, 10).split('-').reverse().join('/'))}</span></div>
    ${p.resumo ? `<p style="font-size:.9rem;color:var(--cinza-txt);margin-top:8px">${esc(p.resumo)}</p>` : ''}</a>`;

  const corpo = `<section><div class="wrap">
    <div class="cabeca"><span class="mono">Diário do Closet</span>
      <h2>O que vestir, como cuidar, por que alugar.</h2>
      <p class="lead" style="margin-top:16px">Guias práticos de estilo — e o link direto para as peças reais de cada ocasião.</p></div>
    <div style="margin-bottom:34px">
      <a class="chip${cat ? '' : ' on'}" href="/closet/blog">Todos</a>
      ${Posts.CATEGORIAS.map((c) => `<a class="chip${cat === c.slug ? ' on' : ''}" href="/closet/blog?categoria=${c.slug}">${esc(c.nome)}</a>`).join('')}
    </div>
    ${posts.length ? `<div class="grade">${posts.map(cardPost).join('')}</div>`
      : '<p class="lead" style="text-align:center;padding:60px 0">Ainda não há textos publicados nesta categoria.</p>'}
  </div></section>`;
  return pagina('Diário do Closet — guias de estilo e dress code · Closet Club',
    'Guias práticos: o que vestir em cada ocasião, dress code decifrado, quanto custa alugar em vez de comprar.',
    corpo, { extraHead: `<link rel="canonical" href="${SITE}/closet/blog">` });
}

function postHTML(p) {
  const { Posts, renderMarkdown } = require('./conteudo');
  const pecas = Posts.pecasRelacionadas(p, 4);
  const outros = Posts.relacionados(p, 3);
  const oc = OCASIOES.find((o) => o.slug === p.ocasiao);
  const dataBR = String(p.publicado_em).slice(0, 10).split('-').reverse().join('/');

  const corpo = `<article><section style="padding-bottom:20px"><div class="wrap-s">
    <span class="mono">${esc((Posts.CATEGORIAS.find((c) => c.slug === p.categoria) || {}).nome || p.categoria)} · ${esc(dataBR)}</span>
    <h1 style="font-size:clamp(2rem,4.4vw,3.2rem);margin:16px 0 20px">${esc(p.titulo)}</h1>
    ${p.resumo ? `<p class="lead">${esc(p.resumo)}</p>` : ''}
  </div></section>
  ${p.capa ? `<div class="wrap" style="margin-bottom:40px"><img src="${esc(p.capa)}" alt="${esc(p.titulo)}" style="width:100%;max-height:520px;object-fit:cover"></div>` : ''}
  <section style="padding-top:0"><div class="wrap-s">
    <div class="texto" style="font-size:1.06rem;line-height:1.8">${renderMarkdown(p.corpo)}</div>
    ${oc ? `<div class="aviso" style="margin-top:40px"><b>${oc.emoji} Procurando peça para ${esc(oc.nome.toLowerCase())}?</b><br>
      <a href="/closet/vitrine?ocasiao=${esc(p.ocasiao)}" style="text-decoration:underline">Ver o que está disponível agora</a>
      ou <a href="/closet/ia" style="text-decoration:underline">montar seu look com a IA</a>.</div>` : ''}
  </div></section>
  ${pecas.length ? `<section class="cinza"><div class="wrap">
    <div class="cabeca"><span class="mono">Disponível agora</span><h2>Peças para essa ocasião</h2></div>
    <div class="grade">${pecas.map(cardPeca).join('')}</div>
  </div></section>` : ''}
  ${outros.length ? `<section><div class="wrap">
    <div class="cabeca"><span class="mono">Continue lendo</span><h2>Também pode te interessar</h2></div>
    <div class="grade">${outros.map((o) => `<a class="card" href="/closet/blog/${esc(o.slug)}">
      <div class="capa" style="aspect-ratio:16/10">${o.capa ? `<img src="${esc(o.capa)}" alt="" loading="lazy">` : `<div class="vazia">${esc(o.titulo)}</div>`}</div>
      <h4>${esc(o.titulo)}</h4></a>`).join('')}</div>
  </div></section>` : ''}</article>`;

  return pagina(esc(p.seo_titulo || `${p.titulo} · Closet Club`), (p.seo_descricao || p.resumo || p.titulo).slice(0, 300), corpo, {
    extraHead: `<link rel="canonical" href="${SITE}/closet/blog/${esc(p.slug)}">
    ${p.capa ? `<meta property="og:image" content="${esc(p.capa)}">` : ''}
    <meta property="og:type" content="article">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article', headline: p.titulo,
      description: p.resumo || '', datePublished: p.publicado_em, dateModified: p.atualizado_em || p.publicado_em,
      author: { '@type': 'Organization', name: p.autor || 'Closet Club' },
      publisher: { '@type': 'Organization', name: 'Closet Club' },
      mainEntityOfPage: `${SITE}/closet/blog/${p.slug}`, ...(p.capa ? { image: p.capa } : {}),
    })}</script>`,
  });
}

// ---------------------------------------------------------------------
// INDICAÇÃO — /closet/i/:codigo
// ---------------------------------------------------------------------
function indicacaoHTML(codigo) {
  const { Indicacoes } = require('./crescimento');
  const padrinho = Indicacoes.porCodigo(codigo);
  const premio = Config.num('indicacao_premio_convidado_centavos', 3000);
  if (!padrinho) {
    return pagina('Convite inválido · Closet Club', 'Convite inválido.',
      `<section><div class="wrap-s" style="text-align:center"><h2>Esse convite não vale mais</h2>
       <p class="lead" style="margin:16px auto 26px">O código pode ter expirado. Você ainda pode entrar por conta própria.</p>
       <a class="btn" href="/closet/criar-conta">Criar minha conta</a></div></section>`, {});
  }
  const corpo = `<section><div class="wrap-s" style="text-align:center;max-width:600px">
    <span class="mono">Convite de ${esc(padrinho.nome.split(' ')[0])}</span>
    <h1 style="font-size:clamp(2rem,4.4vw,3rem);margin:18px 0 20px">Você ganhou<br><em style="font-style:italic;color:var(--dourado)">${brl(premio)}</em><br>para o primeiro aluguel.</h1>
    <p class="lead" style="margin:0 auto 30px">${esc(padrinho.nome)} usa o Closet Club e te convidou. Crie sua conta: o crédito entra automaticamente quando você concluir o primeiro aluguel.</p>
    <a class="btn" href="/closet/criar-conta?indicacao=${esc(String(codigo).toUpperCase())}">Aceitar convite e criar conta</a>
    <p class="mono" style="margin-top:24px">Sem mensalidade · pagamento protegido · devolução registrada</p>
  </div></section>`;
  return pagina(`${padrinho.nome} te convidou para o Closet Club`,
    `Ganhe ${brl(premio)} de crédito no primeiro aluguel do Closet Club.`, corpo,
    { extraHead: '<meta name="robots" content="noindex">' });
}

// ---------------------------------------------------------------------
// PARCEIRO — formulário de candidatura
// ---------------------------------------------------------------------
function parceiroHTML() {
  const { TIPOS } = require('./parceiros');
  const rotulos = {
    lavanderia: 'Lavanderia', fotografo: 'Fotógrafo(a)', costureira: 'Costureira / ajustes',
    stylist: 'Stylist / consultoria', maquiador: 'Maquiador(a)', cabeleireiro: 'Cabeleireiro(a)',
    joalheria: 'Joalheria', entrega: 'Entrega / transporte',
  };
  const corpo = `<section><div class="wrap">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start">
      <div>
        <span class="mono">Parceiros</span>
        <h1 style="margin:18px 0 20px">O cliente monta o<br>evento inteiro aqui.</h1>
        <p class="lead">Quem aluga um vestido para casamento precisa de mais: ajuste, lavanderia, maquiagem, cabelo, foto e transporte. Seus serviços aparecem no checkout da reserva, para quem já decidiu ir ao evento.</p>
        <ul style="list-style:none;padding:0;margin:30px 0">
          ${TIPOS.map((t) => `<li style="padding:11px 0;border-bottom:1px solid var(--cinza2)"><span style="color:var(--dourado);margin-right:12px">—</span>${esc(rotulos[t] || t)}</li>`).join('')}
        </ul>
        <p class="mono">A plataforma retém uma comissão sobre o serviço e repassa o restante. Sem mensalidade.</p>
      </div>
      <form id="pf" class="caixa">
        <h3 style="margin-bottom:6px">Quero ser parceiro</h3>
        <p style="color:var(--cinza-txt);font-size:.92rem">Analisamos e entramos em contato.</p>
        <div class="campos">
          <div><label>Nome do negócio</label><input id="pf-nome" required></div>
          <div><label>Tipo</label><select id="pf-tipo">${TIPOS.map((t) => `<option value="${t}">${esc(rotulos[t] || t)}</option>`).join('')}</select></div>
          <div><label>Cidade</label><input id="pf-cidade" placeholder="Brasília" required></div>
          <div><label>UF</label><input id="pf-uf" maxlength="2" placeholder="DF"></div>
          <div><label>WhatsApp</label><input id="pf-tel"></div>
          <div><label>E-mail</label><input id="pf-email" type="email" required></div>
        </div>
        <label>O que você oferece</label><textarea id="pf-desc" rows="3" placeholder="Ex.: lavagem a seco de peças delicadas em 24h"></textarea>
        <div class="campos">
          <div><label>Serviço principal</label><input id="pf-sv" placeholder="Lavagem a seco"></div>
          <div><label>Preço (R$)</label><input id="pf-preco" type="number" min="0" step="5"></div>
        </div>
        <button class="btn" type="submit" style="width:100%;margin-top:22px">Enviar candidatura</button>
        <p id="pf-msg" style="margin-top:12px;font-size:.9rem"></p>
      </form>
    </div>
  </div></section>`;
  const script = `document.getElementById('pf').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('pf-msg');
    const servicos=pf_sv.value?[{nome:pf_sv.value,tipo:pf_tipo.value,preco_centavos:Math.round(Number(pf_preco.value||0)*100)}]:[];
    const r=await fetch('/closet/api/parceiros/candidatar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nome:pf_nome.value,tipo:pf_tipo.value,cidade:pf_cidade.value,uf:pf_uf.value,
        telefone:pf_tel.value,email:pf_email.value,descricao:pf_desc.value,servicos:servicos})});
    const d=await r.json();
    if(!r.ok){m.className='erro';m.textContent=d.erro;return}
    m.className='ok';m.textContent='Candidatura recebida! Vamos analisar e entrar em contato.';e.target.reset();};`;
  return pagina('Seja parceiro do Closet Club — lavanderia, foto, styling e entrega',
    'Lavanderias, fotógrafos, costureiras, stylists, maquiadores e transportadoras: apareça no checkout de quem já alugou o look.',
    corpo, { script });
}

// Versão do bundle do painel = mtime do arquivo. Sem isto, o service worker
// serve o app.js da versão anterior depois de um deploy e a pessoa fica com um
// painel antigo conversando com uma API nova — sem erro visível, só uma aba
// que "não existe". Mesma lição do `?v=N` nos assets do Portal Staff.
const VERSAO_APP = (() => {
  try { return String(Math.floor(require('fs').statSync(path.join(__dirname, 'app-cliente.js')).mtimeMs)); }
  catch (_) { return String(Date.now()); }
})();

// shell do painel (SPA carregada de /closet/app.js)
function appHTML() {
  return `<!DOCTYPE html><html lang="pt-BR"><head>${HEAD('Meu Closet — Closet Club', 'Painel do Closet Club.', '<meta name="robots" content="noindex">')}
  <style>
    body{background:var(--cinza)}
    .app{max-width:1180px;margin:0 auto;padding:0 20px 70px}
    .app-topo{background:var(--branco);border-bottom:1px solid var(--cinza2);position:sticky;top:0;z-index:40}
    .app-topo .in{max-width:1180px;margin:0 auto;padding:0 20px;height:66px;display:flex;align-items:center;justify-content:space-between;gap:16px}
    .abas{display:flex;gap:4px;overflow-x:auto;padding:14px 0 0;scrollbar-width:none}
    .abas::-webkit-scrollbar{display:none}
    .aba{padding:10px 16px;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--cinza-txt);
      white-space:nowrap;cursor:pointer;border:0;background:transparent;font-family:inherit;border-bottom:2px solid transparent;transition:var(--transicao)}
    .aba:hover{color:var(--preto)}
    .aba.on{color:var(--preto);border-bottom-color:var(--dourado)}
    .painel{background:var(--branco);border:1px solid var(--cinza2);padding:clamp(20px,3vw,34px);margin-top:24px}
    .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:2px;background:var(--cinza2);margin-top:24px}
    .kpi{background:var(--branco);padding:22px}
    .kpi .n{font-family:'Playfair Display',serif;font-size:1.9rem;line-height:1.1}
    .kpi .r{font-size:.74rem;letter-spacing:.14em;text-transform:uppercase;color:var(--cinza-txt);margin-top:6px}
    table{width:100%;border-collapse:collapse;font-size:.9rem}
    th{text-align:left;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--cinza-txt);font-weight:500;padding:10px 8px;border-bottom:1px solid var(--cinza2)}
    td{padding:12px 8px;border-bottom:1px solid var(--cinza2);vertical-align:top}
    .est{display:inline-block;padding:3px 10px;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;border:1px solid var(--cinza2)}
    .est.ok{border-color:var(--oliva);color:var(--oliva)}
    .est.aten{border-color:var(--dourado);color:#8A7433}
    .est.ruim{border-color:#C97A80;color:#A3232B}
    .galeria{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;margin:6px 0}
    .galeria .foto{position:relative;aspect-ratio:3/4;background:var(--cinza);overflow:hidden}
    .galeria .foto img{width:100%;height:100%;object-fit:cover}
    .galeria .foto.capa{outline:2px solid var(--dourado);outline-offset:-2px}
    .galeria .foto button{position:absolute;top:4px;right:4px;border:0;background:rgba(17,17,17,.72);color:#fff;
      width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:.8rem;line-height:1;padding:0}
    .galeria .foto .promover{top:auto;bottom:4px;right:4px;width:auto;height:auto;border-radius:2px;padding:2px 7px;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase}
    .galeria .foto .tag{position:absolute;bottom:4px;left:4px;background:var(--dourado);color:var(--preto);
      font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px}
    dialog{border:0;border-radius:var(--raio);max-width:620px;width:94%;padding:clamp(22px,3vw,36px);box-shadow:0 30px 90px rgba(0,0,0,.22)}
    dialog::backdrop{background:rgba(17,17,17,.55)}
    .vazio{text-align:center;color:var(--cinza-txt);padding:50px 20px}
  </style></head><body>
  <div class="app-topo"><div class="in">${marca()}
    <div style="display:flex;align-items:center;gap:14px">
      <a class="btn linha peq" href="/closet/vitrine">Vitrine</a>
      <span id="u-nome" style="font-size:.86rem"></span>
      <button class="btn peq" id="sair">Sair</button></div></div>
    <div class="app" style="padding-bottom:0"><div class="abas" id="abas"></div></div></div>
  <div class="app"><div id="tela"><p class="vazio">Carregando…</p></div></div>
  <dialog id="modal"></dialog>
  <script src="/closet/app.js?v=${VERSAO_APP}"></script><script>bootCloset();</script></body></html>`;
}

// ---------------------------------------------------------------------
// Registro das rotas de página
// ---------------------------------------------------------------------
function registrarPaginas(app) {
  const html = (res, corpo) => res.type('html').send(corpo);

  app.get('/closet', (req, res) => html(res, landingHTML()));
  app.get('/closet/vitrine', (req, res) => html(res, vitrineHTML(req.query || {})));
  app.get('/closet/looks', (req, res) => html(res, looksHTML()));
  app.get('/closet/ia', (req, res) => html(res, iaHTML()));
  app.get('/closet/anunciar', (req, res) => html(res, anunciarHTML()));
  app.get('/closet/entrar', (req, res) => html(res, entrarHTML(s(req.query.voltar, 200))));
  app.get('/closet/criar-conta', (req, res) => html(res, criarContaHTML(req.query || {})));
  app.get('/closet/esqueci', (req, res) => html(res, esqueciHTML()));
  app.get('/closet/definir-senha', (req, res) => html(res, definirSenhaHTML()));
  app.get('/closet/r/:token', (req, res) => html(res, qrHTML(req.params.token)));
  for (const p of ['como-funciona', 'termos', 'privacidade']) {
    app.get('/closet/' + p, (req, res) => html(res, institucionalHTML(p)));
  }

  // ---- onda 2: blog, indicação e parceiros ----
  app.get('/closet/blog', (req, res) => html(res, blogHTML(req.query || {})));
  app.get('/closet/blog/:slug', (req, res) => {
    const p = require('./conteudo').Posts.obter(req.params.slug);
    if (!p || p.status !== 'publicado') {
      return res.status(404).type('html').send(pagina('Texto não encontrado · Closet Club', 'Não encontrado.',
        `<section><div class="wrap-s" style="text-align:center"><h2>Esse texto saiu do ar</h2>
         <a class="btn" style="margin-top:22px" href="/closet/blog">Ver o Diário do Closet</a></div></section>`, {}));
    }
    require('./conteudo').Posts.registrarLeitura(p.id);
    html(res, postHTML(p));
  });
  app.get('/closet/i/:codigo', (req, res) => html(res, indicacaoHTML(req.params.codigo)));
  app.get('/closet/parceiro', (req, res) => html(res, parceiroHTML()));

  app.get('/closet/peca/:slug', (req, res) => {
    const i = Items.obter(req.params.slug, { comDono: true });
    if (!i || i.status !== 'ativo' || i.moderacao !== 'aprovado') {
      return res.status(404).type('html').send(pagina('Peça não encontrada · Closet Club', 'Peça não encontrada.',
        `<section><div class="wrap-s" style="text-align:center"><h2>Essa peça saiu da vitrine</h2>
         <p class="lead" style="margin:16px auto 26px">Ela pode ter sido pausada ou alugada. Veja o que há disponível agora.</p>
         <a class="btn" href="/closet/vitrine">Ver a vitrine</a></div></section>`, {}));
    }
    Items.registrarVisualizacao(i.id, '', 'pagina');
    html(res, pecaHTML(i));
  });

  app.get('/closet/look/:slug', (req, res) => {
    const l = Looks.obter(req.params.slug);
    if (!l || l.status !== 'ativo' || l.moderacao !== 'aprovado') {
      return res.status(404).type('html').send(pagina('Look não encontrado · Closet Club', 'Look não encontrado.',
        `<section><div class="wrap-s" style="text-align:center"><h2>Esse look não está disponível</h2>
         <a class="btn" style="margin-top:22px" href="/closet/looks">Ver todos os looks</a></div></section>`, {}));
    }
    db.prepare('UPDATE looks SET visualizacoes = visualizacoes + 1 WHERE id = ?').run(l.id);
    html(res, lookHTML(l));
  });

  app.get('/closet/pessoa/:id', (req, res) => {
    const p = Users.publico(req.params.id);
    if (!p) return res.status(404).type('html').send(pagina('Perfil não encontrado · Closet Club', '', '<section><div class="wrap-s"><h2>Perfil não encontrado</h2></div></section>', {}));
    const pecas = Items.buscar({ owner_id: p.id, limite: 24 }).itens;
    html(res, pagina(`${p.nome} · Closet Club`, `Peças de ${p.nome} para alugar no Closet Club.`,
      `<section><div class="wrap">
        <div class="cabeca"><span class="mono">Proprietária${p.verificado ? ' · verificada' : ''}</span>
          <h1 style="margin:14px 0 10px">${esc(p.nome)}</h1>
          <p class="lead">${p.nota_media ? `★ ${p.nota_media.toFixed(1)} (${p.num_avaliacoes}) · ` : ''}${p.num_alugueis} locação(ões) · ${Math.max(1, Math.round(p.tempo_plataforma_dias / 30))} mês(es) na plataforma${p.cidade ? ' · ' + esc(p.cidade) : ''}</p>
          ${p.bio ? `<p style="margin-top:14px">${esc(p.bio)}</p>` : ''}</div>
        ${pecas.length ? `<div class="grade">${pecas.map(cardPeca).join('')}</div>` : '<p class="vazio">Nenhuma peça ativa no momento.</p>'}
      </div></section>`, { ativo: 'vitrine' }));
  });

  app.get('/closet/app', (req, res) => html(res, appHTML()));
  app.get('/closet/app.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-cliente.js')));

  // SEO: sitemap com as peças e looks realmente publicados
  app.get('/closet/sitemap.xml', (req, res) => {
    const fixas = ['', '/vitrine', '/looks', '/ia', '/anunciar', '/blog', '/parceiro', '/como-funciona', '/termos', '/privacidade'];
    const pecas = db.prepare("SELECT slug, atualizado_em FROM items WHERE status='ativo' AND moderacao='aprovado' LIMIT 5000").all();
    const looks = db.prepare("SELECT slug, atualizado_em FROM looks WHERE status='ativo' AND moderacao='aprovado' LIMIT 2000").all();
    const posts = require('./conteudo').Posts.paraSitemap();
    // uma URL por ocasião: são as buscas que as pessoas realmente fazem
    const ocasioes = OCASIOES.map((o) => `/vitrine?ocasiao=${o.slug}`);
    const url = (loc, lastmod, pri) => `<url><loc>${SITE}/closet${loc.replace(/&/g, '&amp;')}</loc>${lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : ''}<priority>${pri}</priority></url>`;
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${fixas.map((f) => url(f, '', f === '' ? '1.0' : '0.8')).join('\n')}
${ocasioes.map((o) => url(o, '', '0.75')).join('\n')}
${posts.map((p) => url('/blog/' + p.slug, p.lastmod, '0.7')).join('\n')}
${pecas.map((p) => url('/peca/' + p.slug, p.atualizado_em, '0.7')).join('\n')}
${looks.map((l) => url('/look/' + l.slug, l.atualizado_em, '0.7')).join('\n')}
</urlset>`);
  });

  app.get('/closet/robots.txt', (req, res) => res.type('text/plain')
    .send(`User-agent: *\nAllow: /closet\nDisallow: /closet/app\nDisallow: /closet/api\nDisallow: /closet/r/\nSitemap: ${SITE}/closet/sitemap.xml\n`));
}

module.exports = {
  registrarPaginas, landingHTML, vitrineHTML, pecaHTML, lookHTML, iaHTML, anunciarHTML,
  blogHTML, postHTML, indicacaoHTML, parceiroHTML, appHTML, CSS,
};
