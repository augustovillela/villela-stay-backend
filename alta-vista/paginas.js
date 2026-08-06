// =====================================================================
// Villela Alta Vista 360 — páginas públicas. Server-rendered, sem build.
//
// Identidade PRÓPRIA da marca (spec aprovada em 06/08/2026): Azul Noite +
// Ciano Imersivo + Dourado Solar, Sora nos títulos e Manrope no corpo.
// Estúdio visual para hospedagens e imóveis — NUNCA "agência de marketing".
// Copy sem promessa de resultado: nenhuma frase afirma aumento garantido
// de reservas, ocupação ou receita.
// =====================================================================
'use strict';
const repo = require('./repo');
const { db } = require('./db');
const { Servicos, Combos, Portfolio, Faqs, Conteudos, Config, Propostas, Leads, AVISO_CONCEITUAL, TERMOS_VERSAO, s, n } = repo;

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const brl2 = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const BASE = '/alta-vista';
const SITE = (process.env.ALTAVISTA_BASE_URL || 'https://altavista.villelastay.com.br').replace(/\/+$/, '');

// GA4 — só quando configurado por env, e só nas páginas públicas.
const GA_ID = process.env.ALTAVISTA_GA_ID || '';
const GA = GA_ID ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());gtag('config','${GA_ID}');
window.av=function(evento,dados){try{gtag('event',evento,Object.assign({currency:'BRL'},dados||{}))}catch(e){}};</script>` : '<script>window.av=function(){};</script>';

// ---------------------------------------------------------------------
// Design system da marca (tokens da spec §2.7)
// ---------------------------------------------------------------------
const CSS = `
:root{
  --noite:#071A2B; --altitude:#0E7490; --ciano:#22D3EE; --ouro:#F4B942;
  --claro:#F7F6F2; --grafite:#17242D; --texto2:#5C6B75; --linha:#E5E2DA;
  --raio:12px; --transicao:.3s ease;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto} *,*::before,*::after{animation:none!important;transition:none!important}}
body{margin:0;background:var(--claro);color:var(--grafite);
  font-family:'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.7;
  -webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:'Sora',system-ui,sans-serif;font-weight:600;letter-spacing:-.02em;line-height:1.15;margin:0}
h1{font-size:clamp(2.1rem,5.4vw,3.6rem)}
h2{font-size:clamp(1.6rem,3.2vw,2.4rem)}
h3{font-size:clamp(1.15rem,1.8vw,1.5rem)}
p{margin:0 0 1rem}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}
.wrap{max-width:1200px;margin:0 auto;padding:0 22px}
.wrap-s{max-width:780px;margin:0 auto;padding:0 22px}
.mono{font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--altitude);font-weight:700}
.escuro .mono{color:var(--ciano)}
.lead{font-size:clamp(1rem,1.4vw,1.16rem);color:var(--texto2);max-width:58ch}
.escuro .lead{color:#B9C6CF}
.num{font-family:'Sora',sans-serif}

/* ---- botões ---- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;
  background:var(--ouro);color:var(--grafite);border:1px solid var(--ouro);border-radius:999px;
  padding:14px 28px;font-size:.9rem;font-weight:700;cursor:pointer;transition:var(--transicao);font-family:inherit}
.btn:hover{filter:brightness(1.06);transform:translateY(-1px)}
.btn.linha{background:transparent;color:inherit;border-color:currentColor;font-weight:600}
.btn.linha:hover{border-color:var(--altitude);color:var(--altitude)}
.escuro .btn.linha:hover{border-color:var(--ciano);color:var(--ciano)}
.btn.peq{padding:9px 18px;font-size:.8rem}
.btn[disabled]{opacity:.45;cursor:not-allowed}

/* ---- topo ---- */
header.topo{position:sticky;top:0;z-index:50;background:rgba(247,246,242,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--linha)}
header.topo .wrap{display:flex;align-items:center;justify-content:space-between;gap:18px;height:72px}
.marca{display:flex;flex-direction:column;line-height:1.05;font-family:'Sora',sans-serif;white-space:nowrap}
.marca b{font-weight:800;letter-spacing:.14em;font-size:1rem}
.marca span{font-size:.66rem;letter-spacing:.3em;color:var(--altitude);font-weight:700}
.marca span i{font-style:normal;color:var(--ouro)}
nav.principal{display:flex;align-items:center;gap:22px;font-size:.85rem;font-weight:600}
nav.principal a{color:var(--texto2);padding:4px 0;border-bottom:2px solid transparent;transition:var(--transicao)}
nav.principal a:hover,nav.principal a.on{color:var(--grafite);border-bottom-color:var(--ouro)}
@media(max-width:960px){nav.principal .some{display:none}}

/* ---- hero e faixas escuras ---- */
.escuro{background:var(--noite);color:var(--claro)}
.escuro h1 em,.escuro h2 em{font-style:normal;color:var(--ciano)}
.hero{padding:clamp(58px,9vw,120px) 0 clamp(48px,7vw,92px);position:relative;overflow:hidden}
.hero .orbita{position:absolute;right:-180px;top:-180px;width:560px;height:560px;border-radius:50%;
  border:1px solid rgba(34,211,238,.22);pointer-events:none}
.hero .orbita::after{content:'';position:absolute;inset:70px;border-radius:50%;border:1px solid rgba(34,211,238,.13)}
.hero .acoes{display:flex;gap:14px;flex-wrap:wrap;margin-top:32px}
.hero .selo-regiao{margin-top:30px;font-size:.8rem;color:#8FA3B0;letter-spacing:.06em}

/* ---- seções ---- */
section{padding:clamp(52px,7.5vw,100px) 0}
section.compacta{padding:clamp(36px,5vw,64px) 0}
.cabeca{max-width:680px;margin-bottom:clamp(28px,4.5vw,52px)}
.cabeca .mono{display:block;margin-bottom:12px}

/* ---- grades e cards ---- */
.grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:clamp(14px,2vw,24px)}
.grade.fixa{grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr))}
.cartao{background:#fff;border:1px solid var(--linha);border-radius:var(--raio);padding:clamp(20px,2.6vw,30px);
  display:flex;flex-direction:column;transition:var(--transicao)}
.cartao:hover{border-color:var(--altitude);transform:translateY(-2px)}
.cartao h3{margin-bottom:8px}
.cartao .desc{color:var(--texto2);font-size:.94rem;flex:1}
.cartao .apartir{font-size:.78rem;color:var(--texto2)}
.cartao .preco{font-family:'Sora',sans-serif;font-size:1.5rem;font-weight:700}
.cartao .cta{margin-top:16px}
.tag{display:inline-block;background:rgba(14,116,144,.1);color:var(--altitude);border-radius:999px;
  padding:3px 12px;font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px}
.tag.ouro{background:rgba(244,185,66,.16);color:#8A6516}

/* ---- aviso de projeto conceitual (obrigatório, spec §8) ---- */
.aviso-conceitual{display:block;background:rgba(244,185,66,.13);border:1px dashed rgba(138,101,22,.45);color:#7A5A14;
  border-radius:8px;padding:8px 12px;font-size:.76rem;font-weight:600;line-height:1.45;margin-top:14px}

/* ---- portfólio ---- */
.pf-capa{aspect-ratio:16/10;border-radius:var(--raio);overflow:hidden;position:relative;
  background:linear-gradient(140deg,#0B2438 0%,#0E7490 70%,#134E5E 100%);margin-bottom:16px}
.pf-capa img{width:100%;height:100%;object-fit:cover}
.pf-capa .rot{position:absolute;left:16px;bottom:14px;color:#DFF6FB;font-family:'Sora',sans-serif;font-weight:600;font-size:1.02rem;max-width:85%}
.pf-capa .selo{position:absolute;top:12px;left:12px;background:rgba(7,26,43,.82);color:var(--ciano);
  padding:4px 11px;border-radius:999px;font-size:.64rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700}

/* ---- passos ---- */
.passos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:26px;counter-reset:p}
.passo{counter-increment:p;padding-top:20px;border-top:2px solid var(--noite)}
.escuro .passo{border-top-color:rgba(34,211,238,.4)}
.passo::before{content:'0' counter(p);font-family:'Sora',sans-serif;font-weight:700;font-size:1.2rem;color:var(--ouro);display:block;margin-bottom:8px}
.passo b{display:block;margin-bottom:4px}
.passo p{color:var(--texto2);font-size:.92rem;margin:0}
.escuro .passo p{color:#B9C6CF}

/* ---- comparador antes/depois (acessível, sem JS obrigatório) ---- */
.antes-depois{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:var(--linha);border-radius:var(--raio);overflow:hidden}
@media(max-width:760px){.antes-depois{grid-template-columns:1fr}}
.antes-depois>div{background:#fff;padding:clamp(24px,3.4vw,42px)}
.antes-depois .rotulo{font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;font-weight:700;margin-bottom:14px;display:block}
.antes-depois .antes .rotulo{color:var(--texto2)}
.antes-depois .depois{background:var(--noite);color:var(--claro)}
.antes-depois .depois .rotulo{color:var(--ciano)}
.antes-depois ul{list-style:none;margin:0;padding:0}
.antes-depois li{padding:9px 0;border-bottom:1px solid rgba(120,130,140,.18);font-size:.94rem}
.antes-depois li::before{content:'—';margin-right:10px;opacity:.6}
.antes-depois .depois li::before{content:'+';color:var(--ouro);opacity:1}

/* ---- tabela de preços ---- */
.tab-wrap{overflow-x:auto;border:1px solid var(--linha);border-radius:var(--raio);background:#fff}
table.precos{width:100%;border-collapse:collapse;font-size:.93rem;min-width:640px}
table.precos th{text-align:left;font-family:'Sora',sans-serif;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;
  color:var(--texto2);padding:14px 16px;border-bottom:2px solid var(--linha)}
table.precos td{padding:14px 16px;border-bottom:1px solid var(--linha);vertical-align:top}
table.precos tr:last-child td{border-bottom:0}
table.precos .v{font-family:'Sora',sans-serif;font-weight:700;white-space:nowrap}

/* ---- listas com traço ---- */
ul.tracos{list-style:none;padding:0;margin:18px 0 24px}
ul.tracos li{padding:10px 0;border-bottom:1px solid var(--linha);font-size:.96rem}
ul.tracos li::before{content:'—';color:var(--ouro);margin-right:12px}
.escuro ul.tracos li{border-bottom-color:rgba(185,198,207,.18)}

/* ---- FAQ ---- */
details.faq{border-bottom:1px solid var(--linha);padding:6px 0}
details.faq summary{cursor:pointer;font-weight:700;font-family:'Sora',sans-serif;font-size:1rem;padding:12px 0;list-style:none;display:flex;justify-content:space-between;gap:14px}
details.faq summary::after{content:'+';color:var(--altitude);font-weight:400;font-size:1.3rem;line-height:1}
details.faq[open] summary::after{content:'–'}
details.faq p{color:var(--texto2);margin:0 0 14px}

/* ---- formulários ---- */
.caixa{background:#fff;border:1px solid var(--linha);border-radius:var(--raio);padding:clamp(22px,3vw,36px)}
label{display:block;font-size:.8rem;font-weight:700;margin:14px 0 5px}
input,select,textarea{width:100%;padding:11px 13px;border:1px solid var(--linha);border-radius:8px;font-family:inherit;
  font-size:.95rem;background:var(--claro);color:var(--grafite)}
input:focus,select:focus,textarea:focus{outline:2px solid var(--altitude);outline-offset:1px;border-color:var(--altitude)}
.campos{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
@media(max-width:640px){.campos{grid-template-columns:1fr}}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.chips label{display:inline-flex;align-items:center;gap:6px;margin:0;background:var(--claro);border:1px solid var(--linha);
  border-radius:999px;padding:7px 14px;font-size:.82rem;font-weight:600;cursor:pointer}
.chips input{width:auto;accent-color:var(--altitude)}
.ok{color:#166534;font-weight:600}.erro{color:#B42318;font-weight:600}
.hp{position:absolute;left:-5000px;top:-5000px;height:1px;width:1px;overflow:hidden}

/* ---- rodapé ---- */
footer{background:var(--noite);color:#B9C6CF;padding:clamp(44px,6vw,72px) 0 30px;font-size:.9rem}
footer h5{color:var(--claro);font-family:'Sora',sans-serif;font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;margin:0 0 14px}
footer ul{list-style:none;padding:0;margin:0}
footer li{padding:5px 0}
footer a:hover{color:var(--ciano)}
footer .colunas{display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:32px;padding-bottom:36px;border-bottom:1px solid rgba(185,198,207,.16)}
@media(max-width:860px){footer .colunas{grid-template-columns:1fr 1fr}}
footer .base{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;padding-top:22px;font-size:.78rem;color:#7E93A1}

/* ---- utilidades ---- */
.centro{text-align:center}
.vazio{text-align:center;color:var(--texto2);padding:44px 18px}
.destaque-combo{border:2px solid var(--ouro);position:relative}
.destaque-combo .fita{position:absolute;top:-13px;left:24px;background:var(--ouro);color:var(--grafite);
  border-radius:999px;padding:3px 14px;font-size:.68rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
a.pular{position:absolute;left:-9999px;top:0;background:var(--ouro);color:var(--grafite);padding:10px 16px;z-index:100;border-radius:0 0 8px 0}
a.pular:focus{left:0}
`;

const FONTES = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">`;

const PWA_TAGS = `<link rel="manifest" href="${BASE}/manifest.webmanifest">
<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('${BASE}/sw.js').catch(function(){})})}</script>`;

const HEAD = (titulo, descricao, extraHead = '') => `
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(String(descricao || '').slice(0, 300))}">
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(String(descricao || '').slice(0, 300))}">
<meta property="og:site_name" content="Villela Alta Vista 360"><meta property="og:locale" content="pt_BR">
<meta name="theme-color" content="#071A2B">
<link rel="icon" href="/assets/brand/villela-alta-vista/favicon-192.png">
${FONTES}${PWA_TAGS}${GA}
<style>${CSS}</style>${extraHead}`;

const marca = () => `<a class="marca" href="${BASE}" aria-label="Villela Alta Vista 360 — início"><b>VILLELA</b><span>ALTA VISTA 360<i>°</i></span></a>`;
// versão com o símbolo oficial (fundos claros — topo do site); o rodapé escuro segue só tipográfico
const marcaComSimbolo = () => `<a class="marca" href="${BASE}" aria-label="Villela Alta Vista 360 — início" style="flex-direction:row;align-items:center;gap:10px">
  <img src="/assets/brand/villela-alta-vista/simbolo.png" alt="" width="42" height="42" style="border-radius:9px" decoding="async">
  <span style="display:flex;flex-direction:column;line-height:1.05"><b>VILLELA</b><span>ALTA VISTA 360<i>°</i></span></span></a>`;

const topo = (ativo = '') => {
  const item = (href, rot, id, some) => `<a href="${href}"${ativo === id ? ' class="on" aria-current="page"' : ''}${some ? ' data-some class="some"' : ''}>${rot}</a>`;
  return `<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<header class="topo"><div class="wrap">${marcaComSimbolo()}
  <nav class="principal" aria-label="Navegação principal">
    ${item(BASE + '/servicos', 'Serviços', 'servicos')}
    ${item(BASE + '/portfolio', 'Portfólio', 'portfolio')}
    ${item(BASE + '/precos', 'Preços', 'precos')}
    <a href="${BASE}/como-funciona" class="some${ativo === 'como' ? ' on' : ''}">Como funciona</a>
    <a href="${BASE}/conteudos" class="some${ativo === 'conteudos' ? ' on' : ''}">Conteúdos</a>
    <a href="${BASE}/entrar" class="some">Entrar</a>
    <a class="btn peq" href="${BASE}/orcamento">Pedir orçamento</a>
  </nav>
</div></header><main id="conteudo">`;
};

const rodape = () => `</main><footer><div class="wrap">
  <div class="colunas">
    <div>${marca()}
      <p style="margin:16px 0 0;max-width:34ch">Estúdio de conteúdo visual e experiências imersivas para hospedagens e imóveis. Seu espaço visto por todos os ângulos.</p>
    </div>
    <div><h5>Serviços</h5><ul>
      <li><a href="${BASE}/servicos/drone">Filmagem com drone</a></li>
      <li><a href="${BASE}/servicos/video-com-ia">Vídeos com IA</a></li>
      <li><a href="${BASE}/servicos/fotografia-360">Fotografia 360°</a></li>
      <li><a href="${BASE}/servicos/tour-virtual-360">Tour virtual 360°</a></li>
    </ul></div>
    <div><h5>Para você</h5><ul>
      <li><a href="${BASE}/para/anfitrioes">Anfitriões de temporada</a></li>
      <li><a href="${BASE}/para/imobiliarias">Imobiliárias e corretores</a></li>
      <li><a href="${BASE}/para/hoteis-e-pousadas">Hotéis e pousadas</a></li>
      <li><a href="${BASE}/para/proprietarios">Proprietários</a></li>
    </ul></div>
    <div><h5>Institucional</h5><ul>
      <li><a href="${BASE}/app">Área do cliente</a></li>
      <li><a href="${BASE}/como-funciona">Como funciona</a></li>
      <li><a href="${BASE}/sobre">Sobre o estúdio</a></li>
      <li><a href="${BASE}/faq">Perguntas frequentes</a></li>
      <li><a href="${BASE}/contato">Contato</a></li>
      <li><a href="${BASE}/privacidade">Privacidade e LGPD</a></li>
      <li><a href="${BASE}/termos">Termos de serviço</a></li>
      <li><a href="${BASE}/politica-de-ia">Política de uso de IA</a></li>
    </ul></div>
  </div>
  <div class="base">
    <span>© ${new Date().getFullYear()} Villela Alta Vista 360 · Uma marca do Grupo Villela Stay · Augusto Villela Ltda · CNPJ 56.776.526/0001-12</span>
    <span>Brasília · DF — atendimento remoto em todo o Brasil</span>
  </div>
</div></footer>`;

const pagina = (titulo, descricao, corpo, { ativo = '', script = '', extraHead = '' } = {}) =>
  `<!DOCTYPE html><html lang="pt-BR"><head>${HEAD(titulo, descricao, extraHead)}</head><body>
  ${topo(ativo)}${corpo}${rodape()}${script ? `<script>${script}</script>` : ''}</body></html>`;

// ---------------------------------------------------------------------
// blocos reutilizados
// ---------------------------------------------------------------------
const cardServicoResumo = (slugPagina, nome, frase, precoDe) => `
  <a class="cartao" href="${BASE}/servicos/${slugPagina}">
    <h3>${esc(nome)}</h3>
    <p class="desc">${esc(frase)}</p>
    ${precoDe ? `<div><span class="apartir">a partir de</span> <span class="preco">${brl(precoDe)}</span></div>` : ''}
    <span class="cta" style="color:var(--altitude);font-weight:700;font-size:.88rem">Conhecer →</span>
  </a>`;

function cardsQuatroServicos() {
  const de = (cat) => { const l = Servicos.listar({ categoria: cat }); return l.length ? Math.min(...l.map((x) => x.preco_centavos)) : 0; };
  return `<div class="grade">
    ${cardServicoResumo('drone', 'Filmagem com drone', 'Imagens aéreas que situam o imóvel: terreno, área externa, vizinhança e perspectiva que nenhuma foto interna alcança.', de('drone'))}
    ${cardServicoResumo('video-com-ia', 'Vídeos com IA', 'Suas fotos atuais viram vídeo pronto para anúncio, Reels e WhatsApp — sem produção no local e com transparência no uso de IA.', de('video_ia'))}
    ${cardServicoResumo('fotografia-360', 'Fotografia 360°', 'Panoramas profissionais que mostram o ambiente inteiro de uma vez, tratados para anúncio e tour.', de('foto360'))}
    ${cardServicoResumo('tour-virtual-360', 'Tour virtual 360°', 'Visita navegável hospedada com link próprio, incorporação no site e estatísticas de visualização.', de('tour'))}
  </div>`;
}

const cardPortfolio = (p) => `
  <a class="cartao" href="${BASE}/portfolio/${esc(p.slug)}" style="padding:14px 14px 20px">
    <div class="pf-capa">${p.capa_url ? `<img src="${esc(p.capa_url)}" alt="${esc(p.titulo)}" loading="lazy">` : `<span class="rot">${esc(p.titulo)}</span>`}
      ${p.conceitual ? '<span class="selo">Projeto conceitual</span>' : '<span class="selo" style="color:var(--ouro)">Caso real autorizado</span>'}</div>
    <h3 style="font-size:1.08rem">${esc(p.titulo)}</h3>
    <p class="desc" style="margin-top:6px">${esc(p.resumo)}</p>
    ${p.conceitual ? `<span class="aviso-conceitual">${esc(AVISO_CONCEITUAL)}</span>` : ''}
  </a>`;

function comboCard(c) {
  return `<div class="cartao${c.destaque ? ' destaque-combo' : ''}">
    ${c.destaque ? '<span class="fita">Mais completo</span>' : ''}
    <h3>${esc(c.nome)}</h3>
    <p class="desc" style="margin-top:6px">${esc(c.resumo)}</p>
    <ul class="tracos" style="margin:14px 0 18px">${c.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <div>${c.preco_apartir ? '<span class="apartir">a partir de</span> ' : ''}<span class="preco">${brl(c.preco_centavos)}</span></div>
    <a class="btn cta" href="${BASE}/orcamento?interesse=${esc(c.slug)}">Quero este pacote</a>
  </div>`;
}

const blocoFaq = (lista) => lista.map((f) => `<details class="faq"><summary>${esc(f.pergunta)}</summary><p>${esc(f.resposta)}</p></details>`).join('');

const ctaFinal = (titulo = 'Pronto para mostrar o seu espaço por inteiro?') => `
  <section class="escuro"><div class="wrap-s centro">
    <h2 style="margin-bottom:16px">${esc(titulo)}</h2>
    <p class="lead" style="margin:0 auto 28px">Responda 2 minutos de perguntas e receba a recomendação de pacote com justificativa e preço-base — na hora.</p>
    <a class="btn" href="${BASE}/recomendar-pacote">Descobrir o pacote ideal</a>
  </div></section>`;

// ---------------------------------------------------------------------
// LANDING (11 seções da spec §7)
// ---------------------------------------------------------------------
function landingHTML() {
  const combos = Combos.listar();
  const completo = combos.find((c) => c.destaque) || combos[0];
  const portfolio = Portfolio.listar().slice(0, 3);
  const faqs = Faqs.listar().slice(0, 4);

  const corpo = `
  <div class="escuro hero"><div class="orbita" aria-hidden="true"></div><div class="wrap">
    <span class="mono">Estúdio visual · Hospedagens e imóveis · Brasília-DF</span>
    <h1 style="margin:20px 0 22px;max-width:19ch">Seu anúncio pode mostrar mais do que quartos. <em>Mostre a experiência de estar aí.</em></h1>
    <p class="lead">Drone, vídeos com IA e experiências 360° para o seu espaço despertar o desejo de conhecer, reservar ou comprar.</p>
    <div class="acoes">
      <a class="btn" href="${BASE}/recomendar-pacote">Descobrir o pacote ideal</a>
      <a class="btn linha" href="${BASE}/portfolio">Explorar possibilidades</a>
    </div>
    <p class="selo-regiao">Presencial em Brasília e no DF · Vídeos com IA para todo o Brasil</p>
  </div></div>

  <section><div class="wrap">
    <div class="cabeca"><span class="mono">O problema</span>
      <h2>O hóspede compara dezenas de anúncios. O seu tem 20 segundos para ser diferente.</h2></div>
    <div class="grade">
      <div class="cartao"><h3 style="font-size:1.05rem">Fotos iguais às dos vizinhos</h3><p class="desc">Cômodo por cômodo, todo anúncio parece o mesmo. A distribuição real do espaço — o que faz alguém escolher — não aparece.</p></div>
      <div class="cartao"><h3 style="font-size:1.05rem">Vídeo dá trabalho</h3><p class="desc">Produzir vídeo parece caro e demorado. Resultado: o formato que mais chama atenção fica de fora do seu anúncio.</p></div>
      <div class="cartao"><h3 style="font-size:1.05rem">Formatos errados para cada canal</h3><p class="desc">Airbnb pede uma coisa, Reels outra, WhatsApp outra. Material que não se adapta acaba não sendo usado.</p></div>
    </div>
  </div></section>

  <section class="compacta" style="padding-top:0"><div class="wrap">
    <div class="cabeca"><span class="mono">Quatro especialidades, um estúdio</span>
      <h2>Só fazemos quatro coisas. Por isso fazemos bem.</h2></div>
    ${cardsQuatroServicos()}
  </div></section>

  ${portfolio.length ? `<section class="compacta"><div class="wrap">
    <div class="cabeca" style="display:flex;justify-content:space-between;align-items:flex-end;max-width:none;gap:18px">
      <div><span class="mono">Galeria</span><h2>O que é possível fazer com o seu espaço</h2></div>
      <a class="btn linha peq" href="${BASE}/portfolio">Ver a galeria completa</a></div>
    <div class="grade">${portfolio.map(cardPortfolio).join('')}</div>
  </div></section>` : ''}

  <section><div class="wrap">
    <div class="cabeca"><span class="mono">Antes e depois</span>
      <h2>O mesmo imóvel, apresentado de outro jeito.</h2></div>
    <div class="antes-depois">
      <div class="antes"><span class="rotulo">Antes — o anúncio comum</span><ul>
        <li>Fotos estáticas, uma por cômodo</li>
        <li>Área externa reduzida a uma foto da varanda</li>
        <li>Hóspede não entende onde fica cada ambiente</li>
        <li>Nenhum material para redes sociais e WhatsApp</li>
      </ul></div>
      <div class="depois"><span class="rotulo">Depois — com o estúdio</span><ul>
        <li>Vídeo de 45–60 s pronto para anúncio, Reels e WhatsApp</li>
        <li>Imagens aéreas situando terreno, piscina e vizinhança</li>
        <li>Tour 360° navegável: a pessoa "anda" pelo imóvel antes de reservar</li>
        <li>Panoramas que mostram cada ambiente por inteiro</li>
      </ul></div>
    </div>
    <p style="margin-top:14px;font-size:.8rem;color:var(--texto2)">Comparação ilustrativa de formatos de apresentação — não é promessa de resultado comercial.</p>
  </div></section>

  ${completo ? `<section class="escuro"><div class="wrap">
    <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center" class="ad-grid">
      <div><span class="mono">Recomendado</span>
        <h2 style="margin:14px 0 16px">${esc(completo.nome)}</h2>
        <p class="lead">${esc(completo.resumo)}</p>
        <ul class="tracos">${completo.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
        <div style="display:flex;align-items:center;gap:22px;flex-wrap:wrap">
          <span class="preco num" style="font-size:2rem;color:var(--ouro)">${completo.preco_apartir ? 'a partir de ' : ''}${brl(completo.preco_centavos)}</span>
          <a class="btn" href="${BASE}/orcamento?interesse=${esc(completo.slug)}">Quero o ${esc(completo.nome)}</a>
        </div></div>
      <div class="pf-capa" style="aspect-ratio:4/3;margin:0" aria-hidden="true"><span class="rot">Aéreas + vídeo + 360° + tour</span></div>
    </div>
    <style>@media(max-width:900px){.ad-grid{grid-template-columns:1fr!important}}</style>
  </div></section>` : ''}

  <section><div class="wrap">
    <div class="cabeca"><span class="mono">Processo</span><h2>Da primeira conversa à entrega, sem surpresa.</h2></div>
    <div class="passos">
      <div class="passo"><b>Conte sobre o espaço</b><p>Formulário guiado de 2 minutos. Recomendamos o pacote com justificativa e preço.</p></div>
      <div class="passo"><b>Confirme e agende</b><p>Proposta clara, pagamento protegido pelo Mercado Pago e data combinada (com plano B para clima).</p></div>
      <div class="passo"><b>Captação e produção</b><p>Voo autorizado, fotografia 360° e edição. Você acompanha o status pelo portal.</p></div>
      <div class="passo"><b>Revise e aprove</b><p>Prévia com seus comentários. As revisões incluídas cobrem edição, texto, música e navegação.</p></div>
      <div class="passo"><b>Receba e publique</b><p>Arquivos nos formatos certos por canal + tour no ar com link e incorporação.</p></div>
    </div>
  </div></section>

  <section class="compacta"><div class="wrap">
    <div class="antes-depois" style="background:transparent;gap:20px">
      <div style="border:1px solid var(--linha);border-radius:var(--raio)">
        <span class="rotulo" style="color:var(--altitude)">Brasília e Distrito Federal</span>
        <p style="margin:0;color:var(--texto2)">Filmagem com drone e fotografia 360° presenciais no Lago Sul, Lago Norte, Plano Piloto, Park Way e todo o DF. Endereço passa por análise de viabilidade aérea antes da confirmação.</p>
      </div>
      <div style="background:#fff;color:var(--grafite);border:1px solid var(--linha);border-radius:var(--raio)">
        <span class="rotulo" style="color:var(--altitude)">Todo o Brasil, a distância</span>
        <p style="margin:0;color:var(--texto2)">Vídeos com IA a partir das suas fotos e montagem de tour com panoramas que você já tem: contratação, produção e entrega 100% on-line.</p>
      </div>
    </div>
  </div></section>

  <section class="escuro compacta"><div class="wrap">
    <div class="cabeca"><span class="mono">Transparência</span><h2>Três compromissos que não mudam.</h2></div>
    <div class="grade">
      <div><h3 style="font-size:1.05rem;color:var(--ciano)">IA com honestidade</h3><p style="color:#B9C6CF;font-size:.94rem">A IA trabalha com as fotos reais do imóvel e não inventa o que não existe. Alterações ilustrativas são sempre sinalizadas. <a href="${BASE}/politica-de-ia" style="color:var(--ciano)">Política de IA →</a></p></div>
      <div><h3 style="font-size:1.05rem;color:var(--ciano)">Drone dentro da regra</h3><p style="color:#B9C6CF;font-size:.94rem">Operação conforme ANAC, DECEA/SARPAS e Anatel, com análise de espaço aéreo por endereço. Clima ou restrição geram reagendamento, nunca voo arriscado.</p></div>
      <div><h3 style="font-size:1.05rem;color:var(--ciano)">Sem promessa vazia</h3><p style="color:#B9C6CF;font-size:.94rem">Entregamos apresentação melhor do seu espaço — não prometemos número de reservas. Seus dados seguem a LGPD e o portfólio só publica cliente com autorização registrada.</p></div>
    </div>
  </div></section>

  ${faqs.length ? `<section><div class="wrap-s">
    <div class="cabeca"><span class="mono">Dúvidas frequentes</span><h2>O que todo mundo pergunta primeiro</h2></div>
    ${blocoFaq(faqs)}
    <p style="margin-top:20px"><a class="btn linha peq" href="${BASE}/faq">Ver todas as perguntas</a></p>
  </div></section>` : ''}

  ${ctaFinal()}`;

  return pagina('Villela Alta Vista 360 — Drone, vídeos com IA e experiências 360° para hospedagens e imóveis',
    'Estúdio visual em Brasília-DF: filmagem com drone, vídeos com IA a partir de fotos, fotografia 360° e tours virtuais para anfitriões, imobiliárias, hotéis e proprietários.',
    corpo, {
      ativo: '',
      extraHead: `<link rel="canonical" href="${SITE}${BASE}">
<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'LocalBusiness',
        name: 'Villela Alta Vista 360', slogan: 'Seu espaço visto por todos os ângulos.',
        description: 'Estúdio de conteúdo visual e experiências imersivas para hospedagens e imóveis: drone, vídeos com IA, fotografia 360° e tours virtuais.',
        areaServed: 'Brasília - DF, Brasil', url: SITE + BASE,
        parentOrganization: { '@type': 'Organization', name: 'Grupo Villela Stay' },
      })}</script>`,
    });
}

// ---------------------------------------------------------------------
// SERVIÇOS — hub e páginas por serviço
// ---------------------------------------------------------------------
function servicosHTML() {
  const corpo = `
  <section><div class="wrap">
    <div class="cabeca"><span class="mono">Serviços</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem)">Quatro formas de mostrar o seu espaço.</h1>
      <p class="lead" style="margin-top:16px">Cada serviço resolve um problema diferente do anúncio — e juntos formam a presença visual completa. Nos pacotes, saem mais em conta.</p></div>
    ${cardsQuatroServicos()}
    <p style="margin-top:26px"><a class="btn linha" href="${BASE}/precos">Ver a tabela de preços completa</a></p>
  </div></section>
  ${ctaFinal('Não sabe qual serviço faz sentido? A gente recomenda.')}`;
  return pagina('Serviços — drone, vídeo com IA, fotografia 360° e tour virtual | Villela Alta Vista 360',
    'Filmagem com drone, vídeos com IA a partir de fotos, fotografia profissional 360° e tours virtuais 360° para hospedagens e imóveis.',
    corpo, { ativo: 'servicos', extraHead: `<link rel="canonical" href="${SITE}${BASE}/servicos">` });
}

const PAG_SERVICO = {
  drone: {
    categoria: 'drone', nome: 'Filmagem com drone',
    titulo: 'Filmagem com drone para hospedagens e imóveis',
    frase: 'A perspectiva que nenhuma foto interna alcança: terreno, área externa, vizinhança e a localização real do imóvel.',
    mostra: ['O tamanho verdadeiro do lote e da área externa', 'Piscina, jardim e áreas de lazer no contexto do imóvel',
      'A vizinhança e a privacidade do terreno', 'A chegada: rua, acesso e fachada em movimento'],
    extra: `<section class="escuro compacta"><div class="wrap">
      <div class="cabeca"><span class="mono">Segurança e regularidade</span><h2>Voo bonito é voo autorizado.</h2></div>
      <ul class="tracos">
        <li>Operação conforme as exigências de ANAC, DECEA/SARPAS e Anatel</li>
        <li>Todo endereço passa por análise de viabilidade do espaço aéreo antes da confirmação</li>
        <li>Clima impróprio ou restrição aérea geram reagendamento sem custo</li>
        <li>Checklist de segurança em cada captação: equipamento, bateria, área e pessoas</li>
      </ul></div></section>`,
  },
  'video-com-ia': {
    categoria: 'video_ia', nome: 'Vídeos com IA',
    titulo: 'Vídeo com IA a partir das fotos do seu imóvel',
    frase: 'As fotos que você já tem viram vídeo com movimento, texto e música — pronto para anúncio, Reels e WhatsApp, sem produção no local.',
    mostra: ['Vídeo vertical e horizontal a partir de fotos existentes', 'Texto, música e ritmo pensados para cada canal',
      'Atendimento 100% remoto, para todo o Brasil', 'Entrega em 3–5 dias úteis'],
    extra: `<section class="escuro compacta"><div class="wrap">
      <div class="cabeca"><span class="mono">Uso honesto de IA</span><h2>A IA valoriza. Não inventa.</h2></div>
      <ul class="tracos">
        <li>Trabalhamos sobre as fotos reais do imóvel — a IA não cria cômodos, vistas ou acabamentos que não existem</li>
        <li>Qualquer ambientação ilustrativa é sinalizada como ilustrativa no próprio material</li>
        <li>Você aprova a prévia antes da entrega final</li>
        <li>Detalhes na nossa <a href="${BASE}/politica-de-ia" style="color:var(--ciano)">Política de uso de IA</a></li>
      </ul></div></section>`,
  },
  'fotografia-360': {
    categoria: 'foto360', nome: 'Fotografia 360°',
    titulo: 'Fotografia profissional 360° de ambientes',
    frase: 'Panoramas que mostram o ambiente inteiro de uma vez — a base do tour virtual e um diferencial no anúncio.',
    mostra: ['Ambiente completo em uma única imagem navegável', 'Captação profissional com tratamento de cor e luz',
      'Panoramas prontos para tour virtual, anúncio e redes', 'Presencial em Brasília e no DF'],
    extra: '',
  },
  'tour-virtual-360': {
    categoria: 'tour', nome: 'Tour virtual 360°',
    titulo: 'Tour virtual 360° com hospedagem e incorporação',
    frase: 'A visita que acontece antes da visita: o interessado navega pelo imóvel no celular ou no computador, quando quiser.',
    mostra: ['Tour navegável com pontos conectados e hotspots', 'Link exclusivo para anúncio, WhatsApp e redes',
      'Código de incorporação para o seu site', 'Estatísticas de visualização e controle de acesso (público, não listado ou senha)'],
    extra: `<section class="escuro compacta"><div class="wrap">
      <div class="cabeca"><span class="mono">Hospedagem do tour</span><h2>Publicado, medido e sempre no ar.</h2></div>
      <ul class="tracos">
        <li>Pacotes incluem franquia de hospedagem (6 ou 12 meses, conforme o combo)</li>
        <li>Depois da franquia: R$ 29/mês ou R$ 290/ano</li>
        <li>QR Code para materiais impressos e placas</li>
        <li>Endereço completo do imóvel oculto por padrão — você decide o que aparece</li>
      </ul></div></section>`,
  },
};

function servicoHTML(slugPagina) {
  const cfg = PAG_SERVICO[slugPagina];
  if (!cfg) return null;
  const tiers = Servicos.listar({ categoria: cfg.categoria });
  const adicionais = cfg.categoria === 'tour'
    ? Servicos.listar().filter((x) => ['adicional', 'hospedagem'].includes(x.categoria)) : [];
  const corpo = `
  <section><div class="wrap">
    <div class="cabeca"><span class="mono">${esc(cfg.nome)}</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem)">${esc(cfg.titulo)}</h1>
      <p class="lead" style="margin-top:16px">${esc(cfg.frase)}</p></div>
    <div class="antes-depois" style="background:transparent;gap:20px;grid-template-columns:1.1fr .9fr">
      <div style="border:1px solid var(--linha);border-radius:var(--raio)">
        <span class="rotulo" style="color:var(--altitude)">O que este serviço mostra</span>
        <ul class="tracos" style="margin:0">${cfg.mostra.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
      </div>
      <div class="pf-capa" style="aspect-ratio:auto;min-height:240px;margin:0" aria-hidden="true"><span class="rot">${esc(cfg.nome)}</span></div>
    </div>
  </div></section>

  <section class="compacta" style="padding-top:0"><div class="wrap">
    <div class="cabeca"><span class="mono">Opções e preços</span><h2>Escolha o tamanho da entrega.</h2></div>
    <div class="grade">
      ${tiers.map((sv) => `<div class="cartao">
        <h3 style="font-size:1.1rem">${esc(sv.nome)}</h3>
        <p class="desc" style="margin-top:6px">${esc(sv.entrega)}</p>
        ${sv.prazo ? `<p style="font-size:.8rem;color:var(--texto2);margin:0 0 10px">Prazo: ${esc(sv.prazo)}${sv.revisoes ? ` · ${sv.revisoes} revisão(ões)` : ''}</p>` : ''}
        <div>${sv.preco_apartir ? '<span class="apartir">a partir de</span> ' : ''}<span class="preco">${brl(sv.preco_centavos)}</span>${sv.unidade === 'mes' ? '<span class="apartir">/mês</span>' : sv.unidade === 'ano' ? '<span class="apartir">/ano</span>' : sv.unidade === 'ponto' ? '<span class="apartir">/ponto</span>' : ''}</div>
        <a class="btn cta" href="${BASE}/orcamento?interesse=${esc(sv.slug)}">Pedir orçamento</a>
      </div>`).join('')}
      ${adicionais.map((sv) => `<div class="cartao" style="border-style:dashed">
        <span class="tag">Adicional</span>
        <h3 style="font-size:1.02rem">${esc(sv.nome)}</h3>
        <p class="desc" style="margin-top:4px">${esc(sv.entrega)}</p>
        <div><span class="preco" style="font-size:1.2rem">${brl(sv.preco_centavos)}</span><span class="apartir">${sv.unidade === 'mes' ? '/mês' : sv.unidade === 'ano' ? '/ano' : sv.unidade === 'ponto' ? '/ponto' : ''}</span></div>
      </div>`).join('')}
    </div>
    <p style="margin-top:22px;color:var(--texto2);font-size:.9rem">Este serviço também compõe os pacotes — veja <a href="${BASE}/precos" style="color:var(--altitude);font-weight:700">preços e combos</a>.</p>
  </div></section>
  ${cfg.extra}
  ${ctaFinal()}`;
  return pagina(`${cfg.titulo} | Villela Alta Vista 360`, cfg.frase, corpo,
    { ativo: 'servicos', extraHead: `<link rel="canonical" href="${SITE}${BASE}/servicos/${slugPagina}">` });
}

// ---------------------------------------------------------------------
// PÚBLICOS — /para/*
// ---------------------------------------------------------------------
const PAG_PUBLICO = {
  anfitrioes: {
    rotulo: 'Anfitriões e gestores de temporada', titulo: 'Para quem vive de receber bem',
    frase: 'Seu anúncio disputa atenção com dezenas de espaços parecidos. Nós fazemos o seu mostrar o que os outros não mostram: a experiência de estar aí.',
    dores: ['Anúncio parecido com o dos concorrentes', 'Hóspede que não entende a distribuição do imóvel e se frustra no check-in',
      'Falta de material para Reels, WhatsApp e site próprio', 'Pouco tempo para pensar em produção'],
    entregas: ['Vídeo pronto por canal: anúncio, Reels e WhatsApp', 'Tour 360° que reduz a surpresa (e a chance de avaliação ruim por expectativa errada)',
      'Aéreas que valorizam área externa e localização', 'Materiais reutilizáveis em todos os seus canais'],
  },
  imobiliarias: {
    rotulo: 'Imobiliárias e corretores', titulo: 'Para quem precisa qualificar a visita',
    frase: 'O tour virtual filtra curiosos: quem agenda visita presencial já conheceu o imóvel — e já gostou.',
    dores: ['Visitas presenciais desperdiçadas com quem não tinha perfil', 'Imóveis de carteira com apresentação desigual',
      'Anúncio de portal onde todos os imóveis parecem iguais', 'Proprietário cobrando divulgação melhor'],
    entregas: ['Tour 360° com link para enviar antes da visita', 'Vídeo e aéreas que destacam o imóvel no portal',
      'QR Code para placa e materiais impressos', 'Pacotes para carteira com prioridade de agenda'],
  },
  'hoteis-e-pousadas': {
    rotulo: 'Hotéis e pousadas', titulo: 'Para quem vende categorias, não só quartos',
    frase: 'O hóspede quer ver o quarto exato da categoria que está pagando — e as áreas comuns que fazem a estadia valer.',
    dores: ['Fotos que não diferenciam as categorias de quarto', 'Áreas comuns (restaurante, piscina, recepção) subaproveitadas na divulgação',
      'Material desatualizado após reformas', 'OTAs exigindo mídia cada vez melhor'],
    entregas: ['Tour multi-ambientes: recepção, áreas comuns e um quarto por categoria', 'Panoramas 360° por categoria para o site e as OTAs',
      'Aéreas situando a propriedade e o entorno', 'Vídeos por canal para campanhas'],
  },
  proprietarios: {
    rotulo: 'Proprietários', titulo: 'Para quem quer vender ou alugar mais rápido',
    frase: 'Um imóvel bem apresentado atrai interessados mais decididos — e você recebe menos visita de curioso.',
    dores: ['Anúncio com fotos de celular que não fazem justiça ao imóvel', 'Dificuldade de mostrar terreno, vista e vizinhança',
      'Interessados que desistem na visita porque a expectativa estava errada', 'Imóvel parado no portal'],
    entregas: ['Tour 360° para o interessado visitar antes de agendar', 'Aéreas do lote, da rua e da vista real',
      'Vídeo do imóvel para compartilhar no WhatsApp', 'Material que o seu corretor pode usar em todos os canais'],
  },
};

function publicoHTML(slug) {
  const cfg = PAG_PUBLICO[slug];
  if (!cfg) return null;
  const corpo = `
  <section><div class="wrap">
    <div class="cabeca"><span class="mono">${esc(cfg.rotulo)}</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem)">${esc(cfg.titulo)}</h1>
      <p class="lead" style="margin-top:16px">${esc(cfg.frase)}</p></div>
    <div class="antes-depois">
      <div class="antes"><span class="rotulo">O que costuma travar</span><ul>${cfg.dores.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>
      <div class="depois"><span class="rotulo">O que entregamos</span><ul>${cfg.entregas.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>
    </div>
  </div></section>
  <section class="compacta" style="padding-top:0"><div class="wrap">
    <div class="cabeca"><span class="mono">Os quatro serviços</span><h2>As mesmas quatro especialidades, aplicadas ao seu caso.</h2></div>
    ${cardsQuatroServicos()}
  </div></section>
  ${ctaFinal()}`;
  return pagina(`${cfg.titulo} — ${cfg.rotulo} | Villela Alta Vista 360`, cfg.frase, corpo,
    { extraHead: `<link rel="canonical" href="${SITE}${BASE}/para/${slug}">` });
}

// ---------------------------------------------------------------------
// PORTFÓLIO
// ---------------------------------------------------------------------
function portfolioHTML() {
  const itens = Portfolio.listar();
  const corpo = `
  <section><div class="wrap">
    <div class="cabeca"><span class="mono">Portfólio e galeria conceitual</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem)">O que é possível fazer com cada tipo de espaço.</h1>
      <p class="lead" style="margin-top:16px">Estamos começando — e preferimos mostrar demonstrações honestas a inventar clientes. Os projetos conceituais abaixo ilustram as possibilidades técnicas de cada serviço e serão substituídos por trabalhos reais autorizados, um a um.</p></div>
    ${itens.length ? `<div class="grade fixa">${itens.map(cardPortfolio).join('')}</div>` : '<p class="vazio">Galeria em preparação.</p>'}
  </div></section>
  ${ctaFinal('Quer ser um dos primeiros casos reais aqui?')}`;
  return pagina('Portfólio e galeria conceitual | Villela Alta Vista 360',
    'Demonstrações de drone, vídeo com IA, fotografia 360° e tour virtual por tipo de imóvel: apartamento, flat, casa de temporada, pousada e imóvel à venda.',
    corpo, { ativo: 'portfolio', extraHead: `<link rel="canonical" href="${SITE}${BASE}/portfolio">` });
}

function portfolioItemHTML(p) {
  const nomesServicos = p.servicos.map((sl) => { const sv = Servicos.porSlug(sl); return sv ? sv.nome : sl; });
  const corpo = `
  <section><div class="wrap-s">
    <span class="mono">${esc(p.tipo_imovel || 'Projeto')}${p.cidade ? ' · ' + esc(p.cidade) : ''}</span>
    <h1 style="font-size:clamp(1.8rem,3.8vw,2.6rem);margin:14px 0 18px">${esc(p.titulo)}</h1>
    ${p.conceitual ? `<span class="aviso-conceitual" style="margin:0 0 22px">${esc(AVISO_CONCEITUAL)}</span>` : ''}
    <div class="pf-capa" style="margin:22px 0">${p.capa_url ? `<img src="${esc(p.capa_url)}" alt="${esc(p.titulo)}">` : `<span class="rot">${esc(p.titulo)}</span>`}
      ${p.conceitual ? '<span class="selo">Projeto conceitual</span>' : ''}</div>
    ${nomesServicos.length ? `<p>${nomesServicos.map((x) => `<span class="tag">${esc(x)}</span>`).join(' ')}</p>` : ''}
    <p style="font-size:1.02rem">${esc(p.corpo || p.resumo)}</p>
    <div style="margin-top:30px;display:flex;gap:14px;flex-wrap:wrap">
      <a class="btn" href="${BASE}/orcamento">Quero algo assim para o meu espaço</a>
      <a class="btn linha" href="${BASE}/portfolio">Voltar à galeria</a>
    </div>
  </div></section>`;
  return pagina(`${p.titulo} | Villela Alta Vista 360`, p.resumo || p.titulo, corpo,
    { ativo: 'portfolio', extraHead: `<link rel="canonical" href="${SITE}${BASE}/portfolio/${esc(p.slug)}">` });
}

// ---------------------------------------------------------------------
// PREÇOS
// ---------------------------------------------------------------------
function precosHTML() {
  const servicos = Servicos.listar().filter((x) => !['adicional', 'hospedagem'].includes(x.categoria));
  const extras = Servicos.listar().filter((x) => ['adicional', 'hospedagem'].includes(x.categoria));
  const combos = Combos.listar();
  const fundadoresAtivo = Config.num('fundadores_ativo', 1);
  const vagas = Math.max(0, Config.num('fundadores_vagas_total', 10) - Config.num('fundadores_usadas', 0));

  const linha = (sv) => `<tr><td><b>${esc(sv.nome)}</b></td><td>${esc(sv.entrega)}</td>
    <td>${esc(sv.prazo || '—')}</td>
    <td class="v">${sv.preco_apartir ? 'a partir de ' : ''}${brl(sv.preco_centavos)}${sv.unidade === 'mes' ? '/mês' : sv.unidade === 'ano' ? '/ano' : sv.unidade === 'ponto' ? '/ponto' : ''}</td></tr>`;

  const corpo = `
  <section><div class="wrap">
    <div class="cabeca"><span class="mono">Preços de lançamento</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem)">Preço claro, entrega delimitada.</h1>
      <p class="lead" style="margin-top:16px">Cada serviço tem escopo, prazo e revisões definidos antes de começar. Sem surpresa no fim.</p></div>
    <div class="tab-wrap"><table class="precos">
      <caption class="sr-only">Tabela de serviços e preços</caption>
      <thead><tr><th scope="col">Serviço</th><th scope="col">O que inclui</th><th scope="col">Prazo</th><th scope="col">Preço</th></tr></thead>
      <tbody>${servicos.map(linha).join('')}${extras.map(linha).join('')}</tbody>
    </table></div>
  </div></section>

  <section class="compacta" style="padding-top:0"><div class="wrap">
    <div class="cabeca"><span class="mono">Pacotes</span><h2>Combinados, saem mais em conta.</h2></div>
    <div class="grade">${combos.map(comboCard).join('')}</div>
  </div></section>

  ${fundadoresAtivo ? `<section class="escuro compacta"><div class="wrap">
    <div class="cabeca" style="margin-bottom:22px"><span class="mono">Clientes Fundadores</span>
      <h2>Até ${Config.num('fundadores_desconto_pct', 20)}% para os ${Config.num('fundadores_vagas_total', 10)} primeiros projetos.</h2></div>
    <p class="lead" style="margin-bottom:18px">Estamos construindo o portfólio real do estúdio. Para os primeiros projetos, oferecemos condição de fundador — com transparência sobre a contrapartida:</p>
    <ul class="tracos">
      <li>Desconto condicionado à autorização (destacada e por escrito) de uso do trabalho no portfólio</li>
      <li>Depoimento é convidado apenas DEPOIS da entrega — nunca combinado antes</li>
      <li>Nenhuma avaliação, métrica ou história fictícia, aqui ou em qualquer canal</li>
      <li>${vagas > 0 ? `${vagas} vaga(s) restante(s)` : 'Vagas esgotadas — condição encerrada'}</li>
    </ul>
    ${vagas > 0 ? `<a class="btn" href="${BASE}/orcamento?interesse=fundadores">Quero ser cliente fundador</a>` : ''}
  </div></section>` : ''}

  <section class="compacta"><div class="wrap-s">
    <div class="cabeca"><span class="mono">Condições</span><h2>Pagamento e prazos</h2></div>
    <ul class="tracos">
      <li>Pagamento pelo Mercado Pago: Pix e cartão</li>
      <li>Serviços remotos: pagamento integral antes de iniciar</li>
      <li>Presencial até R$ 1.000: pagamento integral na reserva da agenda</li>
      <li>Acima de R$ 1.000: 50% na reserva e 50% antes da liberação final</li>
      <li>Prévias com marca d’água enquanto houver saldo em aberto</li>
      <li>O prazo conta a partir do pagamento aplicável, do briefing e do recebimento dos arquivos necessários</li>
      <li>Revisões cobrem edição, texto, música, ordem e navegação; nova captação por mudança de preferência é adicional</li>
      <li>Arquivos brutos não estão incluídos por padrão</li>
      <li>Licença de uso: o imóvel retratado e os canais do contratante</li>
    </ul>
  </div></section>
  ${ctaFinal()}`;
  return pagina('Preços — drone, vídeo com IA, 360° e tour virtual | Villela Alta Vista 360',
    'Tabela de preços de lançamento: vídeo com IA, filmagem com drone, fotos 360°, tour virtual e pacotes completos, com escopo e prazo definidos.',
    corpo, { ativo: 'precos', extraHead: `<link rel="canonical" href="${SITE}${BASE}/precos">` });
}

// ---------------------------------------------------------------------
// COMO FUNCIONA / SOBRE
// ---------------------------------------------------------------------
function comoFuncionaHTML() {
  const corpo = `
  <section><div class="wrap">
    <div class="cabeca"><span class="mono">Como funciona</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem)">Contratação guiada, do orçamento à entrega.</h1></div>
    <div class="passos" style="grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))">
      <div class="passo"><b>1. Orçamento</b><p>Você descreve o espaço e o objetivo no formulário. Recomendamos o pacote com justificativa e preço-base. Endereços com voo passam por análise de viabilidade aérea.</p></div>
      <div class="passo"><b>2. Proposta e pagamento</b><p>Proposta com escopo, prazo e revisões por escrito. Pagamento pelo Mercado Pago conforme as condições da tabela de preços.</p></div>
      <div class="passo"><b>3. Briefing e agenda</b><p>Formulário do imóvel (acessos, destaques, restrições) e data de captação combinada — com reagendamento sem custo por clima ou restrição aérea.</p></div>
      <div class="passo"><b>4. Captação e produção</b><p>Voo autorizado, panoramas e edição. Serviços remotos começam assim que recebemos suas fotos.</p></div>
      <div class="passo"><b>5. Revisão</b><p>Você recebe a prévia, comenta e aprova. As revisões incluídas cobrem edição, texto, música, ordem e navegação do tour.</p></div>
      <div class="passo"><b>6. Entrega e publicação</b><p>Arquivos finais nos formatos por canal; tour publicado com link, incorporação e QR Code. Suporte para colocar tudo no ar.</p></div>
    </div>
  </div></section>
  <section class="compacta" style="padding-top:0"><div class="wrap-s">
    <div class="cabeca"><span class="mono">Bom saber</span><h2>Regras que protegem os dois lados</h2></div>
    ${blocoFaq(Faqs.listar().filter((f) => [30, 40, 50, 60, 70, 80, 90].includes(f.ordem)))}
  </div></section>
  ${ctaFinal()}`;
  return pagina('Como funciona a contratação | Villela Alta Vista 360',
    'Do orçamento à entrega: recomendação de pacote, proposta clara, pagamento protegido, captação autorizada, revisão e publicação.',
    corpo, { ativo: 'como', extraHead: `<link rel="canonical" href="${SITE}${BASE}/como-funciona">` });
}

function sobreHTML() {
  const corpo = `
  <section><div class="wrap-s">
    <span class="mono">Sobre o estúdio</span>
    <h1 style="font-size:clamp(1.9rem,4vw,2.8rem);margin:14px 0 20px">Nascemos dentro da hospedagem. Por isso falamos a sua língua.</h1>
    <p class="lead" style="margin-bottom:24px">A Villela Alta Vista 360 é o estúdio visual do Grupo Villela Stay — o mesmo grupo que opera hospedagens por temporada no Lago Sul, em Brasília, e desenvolve tecnologia para anfitriões.</p>
    <p>Antes de vender produção visual, nós a usamos nos nossos próprios espaços: tours 360°, vídeos por canal e anúncios que precisam competir todos os dias nas plataformas. O estúdio existe para colocar essa prática a serviço de outros anfitriões, corretores, hotéis e proprietários.</p>
    <p><b>O que somos:</b> um estúdio especializado em quatro serviços — drone, vídeos com IA, fotografia 360° e tours virtuais — para hospedagens e imóveis.</p>
    <p><b>O que não somos:</b> uma agência de marketing genérica. Não gerimos seus anúncios, não prometemos ocupação e não fazemos de tudo um pouco.</p>
    <ul class="tracos">
      <li>Atendimento presencial em Brasília e no Distrito Federal</li>
      <li>Vídeos com IA e montagem de tours a distância, para todo o Brasil</li>
      <li>Operação de drone regularizada (ANAC · DECEA/SARPAS · Anatel)</li>
      <li>Transparência no uso de IA e em projetos conceituais</li>
    </ul>
  </div></section>
  ${ctaFinal()}`;
  return pagina('Sobre o estúdio | Villela Alta Vista 360',
    'O estúdio visual do Grupo Villela Stay: drone, vídeos com IA, fotografia 360° e tours virtuais para hospedagens e imóveis, com prática real de quem opera hospedagem.',
    corpo, { extraHead: `<link rel="canonical" href="${SITE}${BASE}/sobre">` });
}

// ---------------------------------------------------------------------
// CONTEÚDOS
// ---------------------------------------------------------------------
function conteudosHTML() {
  const posts = Conteudos.listarPublicados();
  const corpo = `
  <section><div class="wrap">
    <div class="cabeca"><span class="mono">Conteúdos</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem)">Guias práticos para apresentar melhor o seu espaço.</h1></div>
    ${posts.length ? `<div class="grade fixa">${posts.map((c) => `<a class="cartao" href="${BASE}/conteudos/${esc(c.slug)}">
      <span class="mono" style="font-size:.66rem">${esc(String(c.publicado_em).slice(0, 10).split('-').reverse().join('/'))}</span>
      <h3 style="font-size:1.08rem;margin-top:8px">${esc(c.titulo)}</h3>
      <p class="desc" style="margin-top:8px">${esc(c.resumo)}</p></a>`).join('')}</div>`
      : '<p class="vazio">Os primeiros guias estão sendo escritos. Volte em breve — ou peça um orçamento e receba as orientações direto no seu caso.</p>'}
  </div></section>
  ${ctaFinal()}`;
  return pagina('Conteúdos e guias | Villela Alta Vista 360',
    'Guias sobre vídeo para anúncio de temporada, tour virtual, fotografia 360° e drone para hospedagens e imóveis.',
    corpo, { ativo: 'conteudos', extraHead: `<link rel="canonical" href="${SITE}${BASE}/conteudos">` });
}

function conteudoHTML(c) {
  const corpo = `
  <article><section><div class="wrap-s">
    <span class="mono">${esc(String(c.publicado_em).slice(0, 10).split('-').reverse().join('/'))}</span>
    <h1 style="font-size:clamp(1.8rem,3.6vw,2.5rem);margin:14px 0 20px">${esc(c.titulo)}</h1>
    ${c.resumo ? `<p class="lead" style="margin-bottom:26px">${esc(c.resumo)}</p>` : ''}
    <div>${c.corpo}</div>
    <div style="margin-top:34px"><a class="btn linha" href="${BASE}/conteudos">← Todos os conteúdos</a></div>
  </div></section></article>`;
  return pagina(`${c.titulo} | Villela Alta Vista 360`, c.resumo || c.titulo, corpo, {
    ativo: 'conteudos',
    extraHead: `<link rel="canonical" href="${SITE}${BASE}/conteudos/${esc(c.slug)}">
<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article', headline: c.titulo, description: c.resumo || '',
      datePublished: c.publicado_em, publisher: { '@type': 'Organization', name: 'Villela Alta Vista 360' },
    })}</script>`,
  });
}

// ---------------------------------------------------------------------
// FAQ / CONTATO / ORÇAMENTO
// ---------------------------------------------------------------------
function faqHTML() {
  const faqs = Faqs.listar();
  const corpo = `
  <section><div class="wrap-s">
    <div class="cabeca"><span class="mono">Perguntas frequentes</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem)">Tudo o que perguntam antes de contratar.</h1></div>
    ${blocoFaq(faqs)}
  </div></section>
  ${ctaFinal()}`;
  return pagina('Perguntas frequentes | Villela Alta Vista 360',
    'Prazos, revisões, licença de uso, regularização do drone, pagamento e hospedagem do tour 360°: as respostas diretas.',
    corpo, {
      extraHead: `<link rel="canonical" href="${SITE}${BASE}/faq">
<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.pergunta, acceptedAnswer: { '@type': 'Answer', text: f.resposta } })),
      })}</script>`,
    });
}

function contatoHTML() {
  const wa = Config.get('whatsapp', '');
  const email = Config.get('email_contato', '');
  const corpo = `
  <section><div class="wrap-s">
    <div class="cabeca"><span class="mono">Contato</span>
      <h1 style="font-size:clamp(1.9rem,4vw,2.8rem)">Vamos conversar sobre o seu espaço.</h1>
      <p class="lead" style="margin-top:16px">O caminho mais rápido é o formulário de orçamento — ele já nos conta o essencial e respondemos em até ${esc(Config.get('prazo_resposta', '1 dia útil'))}.</p></div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:34px">
      <a class="btn" href="${BASE}/orcamento">Pedir orçamento</a>
      ${wa ? `<a class="btn linha" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent('Olá! Vim pelo site da Villela Alta Vista 360.')}" rel="noopener" target="_blank">WhatsApp</a>` : ''}
      ${email ? `<a class="btn linha" href="mailto:${esc(email)}">E-mail</a>` : ''}
    </div>
    <ul class="tracos">
      <li>Atendimento presencial: ${esc(Config.get('cidade_base', 'Brasília · DF'))}</li>
      <li>Atendimento remoto (vídeo com IA e montagem de tour): todo o Brasil</li>
      <li>Resposta em até ${esc(Config.get('prazo_resposta', '1 dia útil'))}</li>
    </ul>
  </div></section>`;
  return pagina('Contato | Villela Alta Vista 360', 'Fale com o estúdio: orçamento guiado, WhatsApp e e-mail. Atendimento em Brasília-DF e remoto para todo o Brasil.',
    corpo, { extraHead: `<link rel="canonical" href="${SITE}${BASE}/contato">` });
}

function orcamentoHTML(query = {}) {
  const opcoes = [
    ...Combos.listar().map((c) => ({ slug: c.slug, nome: c.nome + ' (pacote)' })),
    ...Servicos.listar().filter((x) => !['adicional', 'hospedagem'].includes(x.categoria)).map((x) => ({ slug: x.slug, nome: x.nome })),
  ];
  const pre = s(query.interesse, 80);
  const corpo = `
  <section><div class="wrap">
    <div style="display:grid;grid-template-columns:.9fr 1.1fr;gap:44px;align-items:start" class="oc-grid">
      <div>
        <span class="mono">Orçamento</span>
        <h1 style="font-size:clamp(1.8rem,3.6vw,2.5rem);margin:14px 0 18px">Conte sobre o seu espaço. A recomendação vem com justificativa.</h1>
        <p class="lead">Duas linhas sobre o imóvel e o objetivo bastam. Respondemos em até ${esc(Config.get('prazo_resposta', '1 dia útil'))} com o pacote recomendado, o porquê e o preço.</p>
        <ul class="tracos">
          <li>Sem compromisso e sem ligação indesejada</li>
          <li>Endereço com voo de drone passa por análise de viabilidade aérea</li>
          <li>Seus dados são usados só para responder este pedido (LGPD)</li>
        </ul>
      </div>
      <form id="oc" class="caixa" novalidate>
        <h3 style="margin-bottom:4px">Pedido de orçamento</h3>
        <p style="color:var(--texto2);font-size:.9rem;margin-bottom:6px">Campos com * são obrigatórios.</p>
        <div class="campos">
          <div><label for="oc-nome">Seu nome *</label><input id="oc-nome" autocomplete="name" required></div>
          <div><label for="oc-cidade">Cidade do imóvel</label><input id="oc-cidade" placeholder="Brasília · DF"></div>
          <div><label for="oc-wa">WhatsApp</label><input id="oc-wa" autocomplete="tel" inputmode="tel" placeholder="(61) 9…"></div>
          <div><label for="oc-email">E-mail</label><input id="oc-email" type="email" autocomplete="email"></div>
          <div><label for="oc-tipo">Tipo de imóvel</label><select id="oc-tipo">
            <option value="">Escolher…</option>
            ${['Apartamento/flat', 'Casa de temporada', 'Pousada', 'Hotel', 'Imóvel à venda', 'Imóvel para alugar', 'Outro'].map((t) => `<option>${t}</option>`).join('')}
          </select></div>
          <div><label for="oc-fin">Finalidade</label><select id="oc-fin">
            <option value="">Escolher…</option>
            ${['Aluguel por temporada', 'Venda', 'Aluguel tradicional', 'Divulgação do negócio'].map((t) => `<option>${t}</option>`).join('')}
          </select></div>
        </div>
        <label>Interesses</label>
        <div class="chips">${opcoes.map((o) => `<label><input type="checkbox" name="oc-int" value="${esc(o.slug)}"${pre === o.slug ? ' checked' : ''}> ${esc(o.nome)}</label>`).join('')}</div>
        <label for="oc-msg">Conte um pouco (opcional)</label>
        <textarea id="oc-msg" rows="3" placeholder="Ex.: casa com piscina no Lago Sul, anúncio no Airbnb, quero vídeo e tour"></textarea>
        <div class="hp" aria-hidden="true"><label>Não preencha este campo<input id="oc-site" tabindex="-1" autocomplete="off"></label></div>
        <label style="display:flex;gap:10px;align-items:flex-start;font-weight:500;margin-top:16px;font-size:.85rem">
          <input type="checkbox" id="oc-lgpd" style="width:auto;margin-top:3px" required>
          <span>Autorizo o contato da Villela Alta Vista 360 para responder este pedido, conforme a <a href="${BASE}/privacidade" style="color:var(--altitude);font-weight:700">Política de Privacidade</a>. *</span></label>
        <button class="btn" type="submit" style="width:100%;margin-top:18px">Enviar e receber a recomendação</button>
        <p id="oc-msg-envio" role="status" style="margin:12px 0 0;font-size:.9rem"></p>
      </form>
    </div>
    <style>@media(max-width:900px){.oc-grid{grid-template-columns:1fr!important}}</style>
  </div></section>`;
  const script = `
document.getElementById('oc').onsubmit=async function(e){e.preventDefault();
  var m=document.getElementById('oc-msg-envio');var b=e.target.querySelector('button');
  var ints=[].slice.call(document.querySelectorAll('input[name=oc-int]:checked')).map(function(x){return x.value});
  var q=new URLSearchParams(location.search);var utm={};
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){if(q.get(k))utm[k]=q.get(k)});
  if(document.referrer)utm.referrer=document.referrer.slice(0,200);
  b.disabled=true;m.className='';m.textContent='Enviando…';
  try{
    var r=await fetch('${BASE}/api/orcamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      nome:document.getElementById('oc-nome').value, cidade:document.getElementById('oc-cidade').value,
      whatsapp:document.getElementById('oc-wa').value, email:document.getElementById('oc-email').value,
      tipo_imovel:document.getElementById('oc-tipo').value, finalidade:document.getElementById('oc-fin').value,
      interesses:ints, mensagem:document.getElementById('oc-msg').value,
      consentimento:document.getElementById('oc-lgpd').checked, website:document.getElementById('oc-site').value,
      origem:'/alta-vista/orcamento', utm:utm})});
    var d=await r.json();
    if(!r.ok){m.className='erro';m.textContent=d.erro||'Não foi possível enviar. Tente de novo.';b.disabled=false;return}
    m.className='ok';m.textContent='Recebido! Vamos analisar e responder em até ${esc(Config.get('prazo_resposta', '1 dia útil'))}.';
    window.av('orcamento_enviado',{interesses:ints.join(',')});e.target.reset();
  }catch(err){m.className='erro';m.textContent='Falha de conexão. Tente novamente.';b.disabled=false}};`;
  return pagina('Pedir orçamento | Villela Alta Vista 360',
    'Descreva o seu imóvel e receba a recomendação de pacote com justificativa e preço em até 1 dia útil.',
    corpo, { script, extraHead: `<link rel="canonical" href="${SITE}${BASE}/orcamento">` });
}

// ---------------------------------------------------------------------
// RECOMENDADOR — /alta-vista/recomendar-pacote (Onda 2)
// Wizard em 4 etapas com progresso salvo no navegador; a recomendação e o
// preço são calculados NO SERVIDOR (POST /alta-vista/api/recomendar).
// ---------------------------------------------------------------------
function recomendarHTML() {
  const corpo = `
  <section><div class="wrap-s">
    <span class="mono">Recomendador de pacote</span>
    <h1 style="font-size:clamp(1.8rem,3.6vw,2.5rem);margin:14px 0 12px">Descubra o pacote ideal para o seu espaço.</h1>
    <p class="lead" style="margin-bottom:26px">Quatro etapas, 2 minutos. No final você recebe a recomendação com o porquê e o preço-base — e a gente confirma tudo em até ${esc(Config.get('prazo_resposta', '1 dia útil'))}.</p>
    <div class="caixa" id="rc-caixa">
      <div id="rc-progresso" class="mono" style="margin-bottom:14px" aria-live="polite">Etapa 1 de 4 — O imóvel</div>

      <fieldset id="rc-e1" style="border:0;padding:0;margin:0">
        <label for="rc-tipo">Tipo de imóvel</label>
        <select id="rc-tipo">${['', 'Apartamento/flat', 'Casa de temporada', 'Pousada', 'Hotel', 'Imóvel à venda', 'Imóvel para alugar', 'Outro'].map((t) => `<option${t ? '' : ' value=""'}>${t || 'Escolher…'}</option>`).join('')}</select>
        <label for="rc-fin">Finalidade</label>
        <select id="rc-fin">${['', 'Aluguel por temporada', 'Venda', 'Aluguel tradicional', 'Divulgação do negócio'].map((t) => `<option${t ? '' : ' value=""'}>${t || 'Escolher…'}</option>`).join('')}</select>
        <label for="rc-cidade">Cidade do imóvel</label>
        <input id="rc-cidade" placeholder="Brasília · DF">
      </fieldset>

      <fieldset id="rc-e2" style="border:0;padding:0;margin:0;display:none">
        <div class="campos">
          <div><label for="rc-area">Área aproximada (m²)</label><input id="rc-area" type="number" min="0" inputmode="numeric"></div>
          <div><label for="rc-amb">Quantos ambientes para mostrar?</label><input id="rc-amb" type="number" min="0" inputmode="numeric" placeholder="quartos, salas, áreas externas…"></div>
        </div>
        <label for="rc-fotos">Quantas fotos boas você já tem?</label>
        <input id="rc-fotos" type="number" min="0" inputmode="numeric" placeholder="0 se ainda não tem">
      </fieldset>

      <fieldset id="rc-e3" style="border:0;padding:0;margin:0;display:none">
        <label>Onde você divulga (ou vai divulgar)?</label>
        <div class="chips">${['Airbnb', 'Booking', 'Instagram/Reels', 'WhatsApp', 'Site próprio', 'Portais de venda'].map((c) => `<label><input type="checkbox" name="rc-canal" value="${c}"> ${c}</label>`).join('')}</div>
        <label>O que mais te interessa?</label>
        <div class="chips">${[['drone', 'Imagens aéreas (drone)'], ['video-com-ia', 'Vídeo a partir das minhas fotos'], ['tour-360', 'Tour virtual 360°'], ['alta-vista-completo', 'O pacote completo']].map(([v, r]) => `<label><input type="checkbox" name="rc-int" value="${v}"> ${r}</label>`).join('')}</div>
        <label for="rc-prazo">Para quando?</label>
        <select id="rc-prazo">${['', 'Urgente (esta semana)', 'Nas próximas 2 semanas', 'Neste mês', 'Sem pressa, pesquisando'].map((t) => `<option${t ? '' : ' value=""'}>${t || 'Escolher…'}</option>`).join('')}</select>
      </fieldset>

      <fieldset id="rc-e4" style="border:0;padding:0;margin:0;display:none">
        <div class="campos">
          <div><label for="rc-nome">Seu nome *</label><input id="rc-nome" autocomplete="name" required></div>
          <div><label for="rc-wa">WhatsApp</label><input id="rc-wa" autocomplete="tel" inputmode="tel"></div>
        </div>
        <label for="rc-email">E-mail</label><input id="rc-email" type="email" autocomplete="email">
        <div class="hp" aria-hidden="true"><label>Não preencha<input id="rc-site" tabindex="-1" autocomplete="off"></label></div>
        <label style="display:flex;gap:10px;align-items:flex-start;font-weight:500;margin-top:16px;font-size:.85rem">
          <input type="checkbox" id="rc-lgpd" style="width:auto;margin-top:3px">
          <span>Autorizo o contato da Villela Alta Vista 360 para responder este pedido, conforme a <a href="${BASE}/privacidade" style="color:var(--altitude);font-weight:700">Política de Privacidade</a>. *</span></label>
      </fieldset>

      <div style="display:flex;gap:12px;margin-top:22px">
        <button class="btn linha" type="button" id="rc-voltar" style="display:none">← Voltar</button>
        <button class="btn" type="button" id="rc-avancar">Avançar →</button>
      </div>
      <p id="rc-msg" role="status" style="margin:12px 0 0;font-size:.9rem"></p>
    </div>
    <div id="rc-resultado" style="margin-top:26px"></div>
  </div></section>`;

  const script = `
(function(){
var etapa=1,TOT=4;
var TITULOS={1:'O imóvel',2:'Tamanho e material',3:'Objetivo',4:'Seu contato'};
var CHAVE='av_recomendador';
function campos(){return {
  tipo_imovel:rcv('rc-tipo'),finalidade:rcv('rc-fin'),cidade:rcv('rc-cidade'),
  area_m2:rcv('rc-area'),ambientes:rcv('rc-amb'),fotos_qtd:rcv('rc-fotos'),
  canais:marcados('rc-canal'),interesses:marcados('rc-int'),prazo:rcv('rc-prazo'),
  nome:rcv('rc-nome'),whatsapp:rcv('rc-wa'),email:rcv('rc-email')}}
function rcv(id){var e=document.getElementById(id);return e?e.value:''}
function marcados(nome){return [].slice.call(document.querySelectorAll('input[name='+nome+']:checked')).map(function(x){return x.value})}
function salvar(){try{localStorage.setItem(CHAVE,JSON.stringify({etapa:etapa,d:campos()}))}catch(e){}}
function restaurar(){try{var g=JSON.parse(localStorage.getItem(CHAVE)||'null');if(!g)return;
  var d=g.d||{};['rc-tipo','rc-fin','rc-cidade','rc-area','rc-amb','rc-fotos','rc-prazo','rc-nome','rc-wa','rc-email'].forEach(function(id){
    var mapa={'rc-tipo':'tipo_imovel','rc-fin':'finalidade','rc-cidade':'cidade','rc-area':'area_m2','rc-amb':'ambientes','rc-fotos':'fotos_qtd','rc-prazo':'prazo','rc-nome':'nome','rc-wa':'whatsapp','rc-email':'email'};
    var e=document.getElementById(id);if(e&&d[mapa[id]])e.value=d[mapa[id]]});
  (d.canais||[]).forEach(function(v){var e=document.querySelector('input[name=rc-canal][value="'+v+'"]');if(e)e.checked=true});
  (d.interesses||[]).forEach(function(v){var e=document.querySelector('input[name=rc-int][value="'+v+'"]');if(e)e.checked=true});
  if(g.etapa>1&&g.etapa<=TOT){etapa=g.etapa}mostrar()}catch(e){}}
function mostrar(){for(var i=1;i<=TOT;i++){document.getElementById('rc-e'+i).style.display=(i===etapa)?'':'none'}
  document.getElementById('rc-progresso').textContent='Etapa '+etapa+' de '+TOT+' — '+TITULOS[etapa];
  document.getElementById('rc-voltar').style.display=etapa>1?'':'none';
  document.getElementById('rc-avancar').textContent=etapa<TOT?'Avançar →':'Ver minha recomendação'}
document.getElementById('rc-voltar').onclick=function(){if(etapa>1){etapa--;mostrar();salvar()}};
document.getElementById('rc-avancar').onclick=async function(){
  var m=document.getElementById('rc-msg');m.className='';m.textContent='';
  if(etapa<TOT){etapa++;mostrar();salvar();return}
  var d=campos();
  if(!d.nome){m.className='erro';m.textContent='Informe seu nome.';return}
  if(!d.whatsapp&&!d.email){m.className='erro';m.textContent='Informe WhatsApp ou e-mail para receber a confirmação.';return}
  if(!document.getElementById('rc-lgpd').checked){m.className='erro';m.textContent='É preciso autorizar o contato (LGPD).';return}
  var q=new URLSearchParams(location.search);var utm={};
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){if(q.get(k))utm[k]=q.get(k)});
  if(document.referrer)utm.referrer=document.referrer.slice(0,200);
  var b=this;b.disabled=true;m.textContent='Calculando…';
  try{
    var r=await fetch('${BASE}/api/recomendar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(Object.assign({},d,{consentimento:true,website:rcv('rc-site'),utm:utm,origem:'/alta-vista/recomendar-pacote'}))});
    var j=await r.json();
    if(!r.ok){m.className='erro';m.textContent=j.erro||'Não deu para calcular. Tente de novo.';b.disabled=false;return}
    try{localStorage.removeItem(CHAVE)}catch(e){}
    window.av('recomendador_concluido',{pacote:j.recomendacao&&j.recomendacao.pacote?j.recomendacao.pacote.slug:''});
    mostrarResultado(j.recomendacao);m.textContent='';
    document.getElementById('rc-caixa').style.display='none';
  }catch(err){m.className='erro';m.textContent='Falha de conexão. Tente novamente.';b.disabled=false}};
function brlJs(c){return 'R$ '+(c/100).toLocaleString('pt-BR')}
function escJs(t){var d=document.createElement('div');d.textContent=t==null?'':String(t);return d.innerHTML}
function mostrarResultado(rec){
  if(!rec){document.getElementById('rc-resultado').innerHTML='<div class="caixa"><p class="ok">Recebido! Vamos analisar e responder em breve.</p></div>';return}
  var h='<div class="caixa">'
    +'<span class="tag ouro">Recomendação</span>'
    +'<h2 style="margin:6px 0 10px">'+escJs(rec.pacote.nome)+'</h2>'
    +(rec.pacote.itens_do_combo.length?'<ul class="tracos">'+rec.pacote.itens_do_combo.map(function(i){return '<li>'+escJs(i)+'</li>'}).join('')+'</ul>':'')
    +'<p><b>Por quê:</b></p><ul class="tracos">'+rec.motivos.map(function(x){return '<li>'+escJs(x)+'</li>'}).join('')+'</ul>'
    +'<p style="font-size:1.3rem"><b>Preço-base: '+brlJs(rec.preco_base_centavos)+'</b>'
    +(rec.preco_estimado_centavos>rec.preco_base_centavos?' <span style="color:var(--texto2)">(estimado com adicionais: '+brlJs(rec.preco_estimado_centavos)+')</span>':'')+'</p>'
    +rec.adicionais.map(function(a){return '<p style="font-size:.9rem;color:var(--texto2)">+ '+a.qtd+'× '+escJs(a.nome)+' ('+brlJs(a.total_centavos)+') — '+escJs(a.motivo)+'</p>'}).join('')
    +rec.avisos.map(function(a){return '<p class="aviso-conceitual">'+escJs(a)+'</p>'}).join('')
    +'<p style="margin-top:16px">'+(rec.analise_manual
      ?'Este pedido passa por <b>análise manual</b> (viabilidade aérea/agenda). Confirmamos tudo em até ${esc(Config.get('prazo_resposta', '1 dia útil'))} e enviamos a proposta formal.'
      :'Recebemos seu pedido — em até ${esc(Config.get('prazo_resposta', '1 dia útil'))} enviamos a proposta formal para você aceitar on-line.')+'</p>'
    +'<p style="font-size:.8rem;color:var(--texto2)">Preço-base do catálogo vigente; o valor final vem na proposta, após a análise do seu caso. A recomendação descreve formatos de apresentação — não é promessa de resultado comercial.</p>'
    +'</div>';
  document.getElementById('rc-resultado').innerHTML=h;
  document.getElementById('rc-resultado').scrollIntoView({behavior:'smooth'})}
restaurar();mostrar();
})();`;
  return pagina('Descubra o pacote ideal — recomendador | Villela Alta Vista 360',
    'Responda 4 etapas sobre o seu imóvel e receba a recomendação de pacote com justificativa e preço-base calculado na hora.',
    corpo, { script, extraHead: `<link rel="canonical" href="${SITE}${BASE}/recomendar-pacote">` });
}

// ---------------------------------------------------------------------
// PROPOSTA PÚBLICA — /alta-vista/proposta/:token (noindex; aceite formal)
// ---------------------------------------------------------------------
function propostaHTML(p, lead) {
  const validaAte = p.enviada_em ? new Date(Date.parse(p.enviada_em) + p.validade_dias * 86400000) : null;
  const dataBr = (x) => x ? new Date(x).toLocaleDateString('pt-BR') : '';
  let painel = '';
  if (p.status === 'aceita') {
    painel = `<div class="caixa" style="border-color:#16653433"><p class="ok" style="font-size:1.05rem">✔ Proposta aceita por ${esc(p.aceite.nome)} em ${dataBr(p.aceite.em)}.</p>
      <p style="margin:8px 0 0;color:var(--texto2)">Registramos o aceite sob os Termos de Serviço versão ${esc(p.aceite.termos_versao)}. Entraremos em contato com a cobrança e os próximos passos.</p></div>`;
  } else if (p.status === 'expirada') {
    painel = `<div class="caixa"><p class="erro">Esta proposta expirou em ${dataBr(validaAte)}.</p>
      <p style="margin:8px 0 0;color:var(--texto2)">Os preços podem ter mudado. <a href="${BASE}/contato" style="color:var(--altitude);font-weight:700">Fale com a gente</a> para receber uma proposta atualizada.</p></div>`;
  } else if (p.status === 'enviada') {
    painel = `<div class="caixa">
      <h3 style="margin-bottom:6px">Aceitar esta proposta</h3>
      <p style="color:var(--texto2);font-size:.9rem">O aceite é registrado com data, nome e a versão vigente dos <a href="${BASE}/termos" target="_blank" rel="noopener" style="color:var(--altitude);font-weight:700">Termos de Serviço</a> (${esc(TERMOS_VERSAO)}).</p>
      <label for="pa-nome">Seu nome completo *</label><input id="pa-nome" autocomplete="name">
      <label style="display:flex;gap:10px;align-items:flex-start;font-weight:500;margin-top:14px;font-size:.85rem">
        <input type="checkbox" id="pa-termos" style="width:auto;margin-top:3px">
        <span>Li e aceito o escopo, os prazos e os Termos de Serviço. *</span></label>
      <button class="btn" id="pa-aceitar" style="width:100%;margin-top:16px">Aceitar proposta</button>
      <p id="pa-msg" role="status" style="margin:12px 0 0;font-size:.9rem"></p>
    </div>`;
  } else {
    painel = `<div class="caixa"><p style="color:var(--texto2)">Esta proposta ainda não está disponível para aceite. Se você recebeu este link, aguarde nosso contato.</p></div>`;
  }

  const corpo = `
  <section><div class="wrap-s">
    <span class="mono">Proposta comercial</span>
    <h1 style="font-size:clamp(1.7rem,3.4vw,2.3rem);margin:14px 0 8px">Proposta para ${esc(lead ? lead.nome : 'você')}</h1>
    <p style="color:var(--texto2);margin-bottom:24px">Emitida em ${dataBr(p.criado_em)}${p.status === 'enviada' && validaAte ? ` · válida até <b>${dataBr(validaAte)}</b>` : ''}</p>
    <div class="tab-wrap" style="margin-bottom:18px"><table class="precos" style="min-width:420px">
      <thead><tr><th scope="col">Item</th><th scope="col">Qtd</th><th scope="col">Valor</th></tr></thead>
      <tbody>
        ${p.itens.map((i) => `<tr><td><b>${esc(i.nome)}</b></td><td>${i.qtd}</td><td class="v">${brl2(i.preco_centavos * i.qtd)}</td></tr>`).join('')}
        <tr><td colspan="2" style="text-align:right">Subtotal</td><td class="v">${brl2(p.subtotal_centavos)}</td></tr>
        ${p.desconto_pct ? `<tr><td colspan="2" style="text-align:right">Desconto ${p.desconto_pct}%${p.motivo_desconto ? ` — ${esc(p.motivo_desconto)}` : ''}</td><td class="v">− ${brl2(p.subtotal_centavos - p.total_centavos)}</td></tr>` : ''}
        <tr><td colspan="2" style="text-align:right;font-family:'Sora',sans-serif;font-weight:700">Total</td><td class="v" style="font-size:1.15rem">${brl2(p.total_centavos)}</td></tr>
      </tbody>
    </table></div>
    ${p.nota ? `<p style="color:var(--texto2);margin-bottom:18px"><b>Observações:</b> ${esc(p.nota)}</p>` : ''}
    <ul class="tracos" style="margin-bottom:24px">
      <li>Pagamento pelo Mercado Pago conforme as <a href="${BASE}/precos" style="color:var(--altitude);font-weight:700">condições publicadas</a> (remoto integral · presencial ≤ R$ 1.000 integral · acima, 50% + 50%)</li>
      <li>Prazos contam após pagamento aplicável, briefing e arquivos necessários</li>
      <li>Voo de drone sujeito a viabilidade aérea e clima (reagendamento sem custo)</li>
    </ul>
    ${painel}
  </div></section>`;
  const script = p.status === 'enviada' ? `
document.getElementById('pa-aceitar').onclick=async function(){
  var m=document.getElementById('pa-msg');var nome=document.getElementById('pa-nome').value;
  if(!nome){m.className='erro';m.textContent='Informe seu nome completo.';return}
  if(!document.getElementById('pa-termos').checked){m.className='erro';m.textContent='É preciso aceitar os Termos de Serviço.';return}
  this.disabled=true;m.className='';m.textContent='Registrando…';
  try{
    var r=await fetch('${BASE}/api/proposta/${esc(p.token)}/aceitar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:nome})});
    var d=await r.json();
    if(!r.ok){m.className='erro';m.textContent=d.erro;this.disabled=false;return}
    m.className='ok';m.textContent='Aceite registrado! Recarregando…';setTimeout(function(){location.reload()},900);
  }catch(e){m.className='erro';m.textContent='Falha de conexão. Tente novamente.';this.disabled=false}};` : '';
  return pagina('Proposta comercial | Villela Alta Vista 360', 'Proposta comercial da Villela Alta Vista 360.', corpo,
    { script, extraHead: '<meta name="robots" content="noindex,nofollow">' });
}

// ---------------------------------------------------------------------
// AUTENTICAÇÃO DO CLIENTE + SHELL DO PAINEL (Onda 3)
// ---------------------------------------------------------------------
function caixaAuthHTML(titulo, sub, corpoForm, script) {
  const corpo = `
  <section><div class="wrap-s" style="max-width:460px">
    <span class="mono">Área do cliente</span>
    <h1 style="font-size:clamp(1.6rem,3vw,2.1rem);margin:14px 0 8px">${esc(titulo)}</h1>
    <p style="color:var(--texto2);margin-bottom:22px">${sub}</p>
    <div class="caixa">${corpoForm}</div>
  </div></section>`;
  return pagina(`${titulo} | Villela Alta Vista 360`, titulo, corpo,
    { script, extraHead: '<meta name="robots" content="noindex">' });
}

function entrarHTML() {
  return caixaAuthHTML('Entrar', `Acompanhe seus projetos, briefings e entregas. Ainda não tem conta? <a href="${BASE}/criar-conta" style="color:var(--altitude);font-weight:700">Criar conta</a>.`,
    `<form id="f" novalidate>
      <label for="e-email">E-mail</label><input id="e-email" type="email" autocomplete="email" required>
      <label for="e-senha">Senha</label><input id="e-senha" type="password" autocomplete="current-password" required>
      <button class="btn" style="width:100%;margin-top:18px" type="submit">Entrar</button>
      <p style="margin:14px 0 0;font-size:.85rem"><a href="${BASE}/esqueci" style="color:var(--altitude);font-weight:700">Esqueci a senha</a></p>
      <p id="msg" role="status" style="margin:10px 0 0;font-size:.9rem"></p>
    </form>`,
    `document.getElementById('f').onsubmit=async function(ev){ev.preventDefault();var m=document.getElementById('msg');
      try{var r=await fetch('${BASE}/api/conta/entrar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:document.getElementById('e-email').value,senha:document.getElementById('e-senha').value})});
      var d=await r.json();if(!r.ok){m.className='erro';m.textContent=d.erro;return}
      location.href='${BASE}/app';}catch(e){m.className='erro';m.textContent='Falha de conexão.'}};`);
}

function criarContaHTML() {
  return caixaAuthHTML('Criar conta', `Já é cliente? <a href="${BASE}/entrar" style="color:var(--altitude);font-weight:700">Entrar</a>.`,
    `<form id="f" novalidate>
      <label for="c-nome">Nome completo</label><input id="c-nome" autocomplete="name" required>
      <label for="c-email">E-mail</label><input id="c-email" type="email" autocomplete="email" required>
      <label for="c-wa">WhatsApp (opcional)</label><input id="c-wa" inputmode="tel" autocomplete="tel">
      <label for="c-senha">Senha (mínimo 8 caracteres)</label><input id="c-senha" type="password" autocomplete="new-password" required>
      <div class="hp" aria-hidden="true"><label>Não preencha<input id="c-site" tabindex="-1"></label></div>
      <label style="display:flex;gap:10px;align-items:flex-start;font-weight:500;margin-top:14px;font-size:.85rem">
        <input type="checkbox" id="c-termos" style="width:auto;margin-top:3px">
        <span>Li e aceito os <a href="${BASE}/termos" target="_blank" rel="noopener" style="color:var(--altitude);font-weight:700">Termos de Serviço</a> e a <a href="${BASE}/privacidade" target="_blank" rel="noopener" style="color:var(--altitude);font-weight:700">Política de Privacidade</a>.</span></label>
      <button class="btn" style="width:100%;margin-top:18px" type="submit">Criar minha conta</button>
      <p id="msg" role="status" style="margin:10px 0 0;font-size:.9rem"></p>
    </form>`,
    `document.getElementById('f').onsubmit=async function(ev){ev.preventDefault();var m=document.getElementById('msg');
      try{var r=await fetch('${BASE}/api/conta/criar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({nome:document.getElementById('c-nome').value,email:document.getElementById('c-email').value,
          whatsapp:document.getElementById('c-wa').value,senha:document.getElementById('c-senha').value,
          aceite_termos:document.getElementById('c-termos').checked,website:document.getElementById('c-site').value})});
      var d=await r.json();if(!r.ok){m.className='erro';m.textContent=d.erro;return}
      location.href='${BASE}/app';}catch(e){m.className='erro';m.textContent='Falha de conexão.'}};`);
}

function esqueciHTML() {
  return caixaAuthHTML('Esqueci a senha', 'Enviamos um link de definição de senha para o seu e-mail (vale por 2 horas).',
    `<form id="f" novalidate>
      <label for="q-email">E-mail da conta</label><input id="q-email" type="email" autocomplete="email" required>
      <button class="btn" style="width:100%;margin-top:18px" type="submit">Enviar link</button>
      <p id="msg" role="status" style="margin:10px 0 0;font-size:.9rem"></p>
    </form>`,
    `document.getElementById('f').onsubmit=async function(ev){ev.preventDefault();var m=document.getElementById('msg');
      try{var r=await fetch('${BASE}/api/conta/esqueci',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:document.getElementById('q-email').value})});
      var d=await r.json();m.className=r.ok?'ok':'erro';m.textContent=d.msg||d.erro;}catch(e){m.className='erro';m.textContent='Falha de conexão.'}};`);
}

function definirSenhaHTML() {
  return caixaAuthHTML('Definir senha', 'Crie a sua nova senha de acesso.',
    `<form id="f" novalidate>
      <label for="s-senha">Nova senha (mínimo 8 caracteres)</label><input id="s-senha" type="password" autocomplete="new-password" required>
      <button class="btn" style="width:100%;margin-top:18px" type="submit">Salvar e entrar</button>
      <p id="msg" role="status" style="margin:10px 0 0;font-size:.9rem"></p>
    </form>`,
    `document.getElementById('f').onsubmit=async function(ev){ev.preventDefault();var m=document.getElementById('msg');
      var token=new URLSearchParams(location.search).get('token')||'';
      try{var r=await fetch('${BASE}/api/conta/definir-senha',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token:token,senha:document.getElementById('s-senha').value})});
      var d=await r.json();if(!r.ok){m.className='erro';m.textContent=d.erro;return}
      location.href='${BASE}/app';}catch(e){m.className='erro';m.textContent='Falha de conexão.'}};`);
}

// Versão do bundle do painel = mtime do arquivo (lição do Closet: sem ?v= o
// service worker serve app.js velho depois de deploy).
const path = require('path');
const VERSAO_APP = (() => {
  try { return String(Math.floor(require('fs').statSync(path.join(__dirname, 'app-cliente.js')).mtimeMs)); }
  catch (_) { return '1'; }
})();

function appHTML() {
  return `<!DOCTYPE html><html lang="pt-BR"><head>${HEAD('Meus projetos — Villela Alta Vista 360', 'Painel do cliente.', '<meta name="robots" content="noindex">')}
  <style>
    .app{max-width:1080px;margin:0 auto;padding:0 20px 70px}
    .app-topo{background:var(--noite);color:var(--claro);position:sticky;top:0;z-index:40}
    .app-topo .in{max-width:1080px;margin:0 auto;padding:0 20px;height:64px;display:flex;align-items:center;justify-content:space-between;gap:14px}
    .app-topo .marca span{color:var(--ciano)}
    .abas{display:flex;gap:4px;overflow-x:auto;max-width:1080px;margin:0 auto;padding:0 20px}
    .aba{padding:12px 16px;font-size:.8rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8FA3B0;
      white-space:nowrap;cursor:pointer;border:0;background:transparent;font-family:inherit;border-bottom:2px solid transparent}
    .aba.on{color:var(--claro);border-bottom-color:var(--ouro)}
    .painel{background:#fff;border:1px solid var(--linha);border-radius:var(--raio);padding:clamp(18px,2.6vw,30px);margin-top:22px}
    .pill{display:inline-block;background:rgba(14,116,144,.1);color:var(--altitude);border-radius:999px;padding:3px 12px;font-size:.72rem;font-weight:700}
    .pill.ouro{background:rgba(244,185,66,.18);color:#8A6516}
    .linha-msg{padding:10px 14px;border-radius:10px;margin:8px 0;max-width:85%}
    .linha-msg.cliente{background:rgba(14,116,144,.1);margin-left:auto}
    .linha-msg.equipe{background:var(--claro);border:1px solid var(--linha)}
    .timeline{list-style:none;padding:0;margin:10px 0}
    .timeline li{padding:6px 0 6px 18px;border-left:2px solid var(--linha);font-size:.85rem;color:var(--texto2)}
    .timeline li b{color:var(--grafite)}
  </style></head><body>
  <div class="app-topo"><div class="in">${marca()}
    <div style="display:flex;align-items:center;gap:12px">
      <span id="u-nome" style="font-size:.85rem"></span>
      <button class="btn peq" id="sair" style="background:transparent;border-color:#8FA3B0;color:var(--claro)">Sair</button></div></div>
    <div class="abas" id="abas"></div></div>
  <main class="app"><div id="tela"><p class="vazio">Carregando…</p></div></main>
  <script src="${BASE}/app.js?v=${VERSAO_APP}"></script><script>bootAltaVista();</script></body></html>`;
}

// ---------------------------------------------------------------------
// PÁGINAS LEGAIS (minutas — validação por advogado antes do lançamento)
// ---------------------------------------------------------------------
const TARJA_MINUTA = `<p class="aviso-conceitual" style="margin:0 0 26px">MINUTA provisória — este texto será revisado por advogado(a) inscrito(a) na OAB antes do lançamento comercial.</p>`;

const LEGAIS = {
  privacidade: {
    titulo: 'Política de Privacidade e Proteção de Dados',
    corpo: `
    <p><b>Controladora:</b> Augusto Villela Ltda (Villela Alta Vista 360), CNPJ 56.776.526/0001-12, Brasília-DF.</p>
    <h3>Quais dados coletamos</h3>
    <p>No pedido de orçamento: nome, contato (e-mail e/ou WhatsApp), cidade e informações sobre o imóvel que você mesmo fornece. Na navegação: dados de uso agregados para estatística, quando você consente com a medição.</p>
    <h3>Para que usamos</h3>
    <p>Responder ao seu pedido, elaborar proposta, executar o serviço contratado e cumprir obrigações legais. Não vendemos dados pessoais e não enviamos marketing sem a sua autorização específica.</p>
    <h3>Endereços de imóveis</h3>
    <p>O endereço completo do imóvel é tratado como dado sensível do negócio: fica restrito à equipe do projeto e nunca é exibido publicamente em tours ou portfólio sem a sua decisão expressa.</p>
    <h3>Seus direitos (LGPD)</h3>
    <p>Você pode solicitar acesso, correção, exportação ou exclusão dos seus dados a qualquer momento pelos canais da página de contato. Atendemos conforme a Lei nº 13.709/2018 (LGPD).</p>
    <h3>Retenção</h3>
    <p>Dados de orçamento não convertidos são mantidos por até 12 meses; dados contratuais, pelos prazos legais aplicáveis.</p>`,
  },
  termos: {
    titulo: 'Termos de Serviço',
    corpo: `
    <p><b>Prestadora:</b> Augusto Villela Ltda (Villela Alta Vista 360), CNPJ 56.776.526/0001-12.</p>
    <h3>Escopo dos serviços</h3>
    <p>Filmagem com drone, vídeos com IA a partir de fotos, fotografia 360° e tours virtuais 360°, conforme escopo, prazo e número de revisões descritos na proposta aceita.</p>
    <h3>Prazos</h3>
    <p>Os prazos contam a partir do pagamento aplicável, do briefing preenchido e do recebimento dos arquivos necessários. Clima impróprio ou restrição do espaço aéreo geram reagendamento sem custo.</p>
    <h3>Revisões</h3>
    <p>As revisões incluídas cobrem edição, texto, música, ordem e navegação. Nova captação decorrente de mudança de preferência é serviço adicional.</p>
    <h3>Pagamento</h3>
    <p>Via Mercado Pago. Serviços remotos: integral antecipado. Presencial até R$ 1.000: integral na reserva. Acima de R$ 1.000: 50% na reserva e 50% antes da liberação final. Prévias com marca d'água enquanto houver saldo.</p>
    <h3>Licença de uso</h3>
    <p>A licença padrão autoriza o uso do material para o imóvel retratado nos canais do contratante (anúncios, redes sociais, WhatsApp e site próprio). Arquivos brutos não integram a entrega padrão.</p>
    <h3>Operação de drone</h3>
    <p>A operação observa as exigências de ANAC, DECEA/SARPAS e Anatel. A viabilidade aérea do endereço é analisada antes da confirmação e pode inviabilizar ou adaptar a captação.</p>
    <h3>Uso de IA</h3>
    <p>Regido pela nossa <a href="${BASE}/politica-de-ia">Política de uso de IA</a>: a IA não inventa características do imóvel e alterações materiais são sinalizadas como ilustrativas.</p>
    <h3>Foro</h3>
    <p>Legislação brasileira; foro de Brasília-DF.</p>`,
  },
  cookies: {
    titulo: 'Política de Cookies',
    corpo: `
    <p>Usamos apenas: (1) cookies essenciais ao funcionamento do site; e (2) medição de audiência (Google Analytics 4), quando habilitada, para entender páginas visitadas e origem das visitas — sem identificação pessoal para fins de publicidade.</p>
    <p>Você pode bloquear cookies não essenciais no navegador sem perder acesso a nenhum conteúdo do site. Áreas privadas usam cookies estritamente funcionais de sessão.</p>`,
  },
  'politica-de-ia': {
    titulo: 'Política de uso de Inteligência Artificial',
    corpo: `
    <p>Usamos IA na edição de vídeos a partir de fotos e em etapas de tratamento de imagem. Estes são os limites que nos impomos — e que você pode cobrar:</p>
    <h3>1. A IA não inventa o imóvel</h3>
    <p>Não criamos cômodos, vistas, acabamentos, mobílias "de série" ou características que não existem no imóvel real. O material parte das fotos reais fornecidas ou captadas.</p>
    <h3>2. Ilustrativo é sinalizado</h3>
    <p>Quando uma ambientação ilustrativa for usada (por exemplo, simulação de decoração), ela é identificada como ilustrativa no próprio material.</p>
    <h3>3. Transparência com o seu público</h3>
    <p>Recomendamos — e praticamos nos nossos canais — indicar quando um vídeo foi produzido com IA a partir de fotos.</p>
    <h3>4. Projetos conceituais são identificados</h3>
    <p>Toda demonstração do nosso portfólio que não representa cliente atendido exibe o aviso: "${AVISO_CONCEITUAL}"</p>
    <h3>5. Por quê</h3>
    <p>Anúncio enganoso gera hóspede frustrado, avaliação ruim e prejuízo para você. Material honesto e bem produzido é o único que se sustenta.</p>`,
  },
};

function legalHTML(slug) {
  const cfg = LEGAIS[slug];
  if (!cfg) return null;
  const corpo = `
  <section><div class="wrap-s">
    <span class="mono">Documento</span>
    <h1 style="font-size:clamp(1.7rem,3.4vw,2.3rem);margin:14px 0 18px">${esc(cfg.titulo)}</h1>
    ${TARJA_MINUTA}
    <div>${cfg.corpo}</div>
    <p style="margin-top:30px;font-size:.82rem;color:var(--texto2)">Atualizado em agosto de 2026 · Villela Alta Vista 360 · Augusto Villela Ltda · CNPJ 56.776.526/0001-12</p>
  </div></section>`;
  return pagina(`${cfg.titulo} | Villela Alta Vista 360`, cfg.titulo, corpo,
    { extraHead: `<link rel="canonical" href="${SITE}${BASE}/${slug}"><meta name="robots" content="noindex">` });
}

// ---------------------------------------------------------------------
// Registro das rotas de página
// ---------------------------------------------------------------------
function registrarPaginas(app) {
  const html = (res, corpo) => res.type('html').send(corpo);
  const n404 = (res, titulo, msg, voltar) => res.status(404).type('html').send(
    pagina(`${titulo} | Villela Alta Vista 360`, msg,
      `<section><div class="wrap-s centro"><h2>${esc(msg)}</h2>
       <a class="btn" style="margin-top:22px" href="${voltar}">Voltar</a></div></section>`, {}));

  app.get(BASE, (req, res) => html(res, landingHTML()));
  app.get(`${BASE}/servicos`, (req, res) => html(res, servicosHTML()));
  app.get(`${BASE}/servicos/:slug`, (req, res) => {
    const p = servicoHTML(req.params.slug);
    if (!p) return n404(res, 'Serviço não encontrado', 'Esse serviço não existe.', `${BASE}/servicos`);
    html(res, p);
  });
  app.get(`${BASE}/para/:slug`, (req, res) => {
    const p = publicoHTML(req.params.slug);
    if (!p) return n404(res, 'Página não encontrada', 'Essa página não existe.', BASE);
    html(res, p);
  });
  app.get(`${BASE}/portfolio`, (req, res) => html(res, portfolioHTML()));
  app.get(`${BASE}/portfolio/:slug`, (req, res) => {
    const p = Portfolio.porSlug(req.params.slug);
    if (!p || !p.publicado) return n404(res, 'Projeto não encontrado', 'Esse projeto saiu da galeria.', `${BASE}/portfolio`);
    html(res, portfolioItemHTML(p));
  });
  app.get(`${BASE}/precos`, (req, res) => html(res, precosHTML()));
  app.get(`${BASE}/como-funciona`, (req, res) => html(res, comoFuncionaHTML()));
  app.get(`${BASE}/sobre`, (req, res) => html(res, sobreHTML()));
  app.get(`${BASE}/conteudos`, (req, res) => html(res, conteudosHTML()));
  app.get(`${BASE}/conteudos/:slug`, (req, res) => {
    const c = Conteudos.porSlug(req.params.slug);
    if (!c || c.status !== 'publicado') return n404(res, 'Conteúdo não encontrado', 'Esse conteúdo saiu do ar.', `${BASE}/conteudos`);
    html(res, conteudoHTML(c));
  });
  app.get(`${BASE}/faq`, (req, res) => html(res, faqHTML()));
  app.get(`${BASE}/contato`, (req, res) => html(res, contatoHTML()));
  app.get(`${BASE}/orcamento`, (req, res) => html(res, orcamentoHTML(req.query || {})));
  app.get(`${BASE}/recomendar-pacote`, (req, res) => html(res, recomendarHTML()));

  // ---- Onda 3: autenticação + painel do cliente ----
  app.get(`${BASE}/entrar`, (req, res) => html(res, entrarHTML()));
  app.get(`${BASE}/criar-conta`, (req, res) => html(res, criarContaHTML()));
  app.get(`${BASE}/esqueci`, (req, res) => html(res, esqueciHTML()));
  app.get(`${BASE}/definir-senha`, (req, res) => html(res, definirSenhaHTML()));
  app.get(`${BASE}/app`, (req, res) => html(res, appHTML()));
  app.get(`${BASE}/app.js`, (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-cliente.js')));
  app.get(`${BASE}/proposta/:token`, (req, res) => {
    const p = Propostas.porToken(req.params.token);
    if (!p) return n404(res, 'Proposta não encontrada', 'Essa proposta não existe ou o link está incompleto.', BASE);
    html(res, propostaHTML(p, Leads.obter(p.lead_id)));
  });
  for (const slug of Object.keys(LEGAIS)) {
    app.get(`${BASE}/${slug}`, (req, res) => html(res, legalHTML(slug)));
  }

  // SEO
  app.get(`${BASE}/sitemap.xml`, (req, res) => {
    const fixas = ['', '/servicos', '/servicos/drone', '/servicos/video-com-ia', '/servicos/fotografia-360',
      '/servicos/tour-virtual-360', '/para/anfitrioes', '/para/imobiliarias', '/para/hoteis-e-pousadas',
      '/para/proprietarios', '/portfolio', '/precos', '/como-funciona', '/sobre', '/conteudos', '/faq', '/contato', '/orcamento'];
    const pf = Portfolio.listar();
    const posts = Conteudos.listarPublicados();
    const url = (loc, lastmod, pri) => `<url><loc>${SITE}${BASE}${loc}</loc>${lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : ''}<priority>${pri}</priority></url>`;
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${fixas.map((f) => url(f, '', f === '' ? '1.0' : '0.8')).join('\n')}
${pf.map((p) => url('/portfolio/' + p.slug, p.atualizado_em || p.criado_em, '0.7')).join('\n')}
${posts.map((c) => url('/conteudos/' + c.slug, c.publicado_em, '0.7')).join('\n')}
</urlset>`);
  });
  app.get(`${BASE}/robots.txt`, (req, res) => res.type('text/plain')
    .send(`User-agent: *\nAllow: ${BASE}\nDisallow: ${BASE}/app\nDisallow: ${BASE}/api\nDisallow: ${BASE}/proposta/\nSitemap: ${SITE}${BASE}/sitemap.xml\n`));
}

module.exports = { registrarPaginas, landingHTML, precosHTML, portfolioHTML, orcamentoHTML, recomendarHTML, propostaHTML, esc, brl, brl2, BASE, SITE };
