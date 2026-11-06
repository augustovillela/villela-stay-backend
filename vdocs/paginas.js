// =====================================================================
// Villela Docs (Document Intelligence) — páginas públicas (server-rendered,
// SEO) e painel do cliente (/vdocs/app — SPA leve em fetch, sem framework).
// Identidade do GRUPO VILLELA (navy + azul-aço #2563EB + dourado),
// separada do site da Villela Stay. Assets: /assets/brand/villela-docs/.
// =====================================================================
'use strict';
const repo = require('./repo');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const brl = (c) => Number(c || 0) === 0 ? 'Sob consulta' : 'R$ ' + (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + '/mês';


// ---- ícones: traço único em sprite inline (substituem os emojis; leem melhor em produto corporativo) ----
const ICONES = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15v4M17 17h4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z"/><path d="m9 12 2 2 4-4"/>',
  scroll: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"/><path d="M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 8h3M8 12h3M8 16h3"/>',
  paperclip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  approve: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1.5 3h5l1.5-3h5"/>',
  dashboard: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
  pen: '<path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z"/><path d="m13.5 6.5 3 3"/>',
  plug: '<path d="M9 2v5M15 2v5M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v6"/>',
  clip: '<path d="M9 3h6v4H9z"/><path d="M7 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1M9 12h6M9 16h4"/>',
  package: '<path d="m3 8 9-5 9 5v8l-9 5-9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  upload: '<path d="M12 20V9M7.5 13.5 12 9l4.5 4.5M4 4h16"/>',
  home: '<path d="M3 11 12 4l9 7M5 10v10h14V10"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 20h16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const SPRITE = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0" aria-hidden="true">' +
  Object.entries(ICONES).map(([k, v]) => '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + v + '</symbol>').join('') + '</svg>';
const ic = (n, cls = '') => '<svg class="dx-i ' + cls + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>';

const CSS = `
:root{--ink:#1F2933;--indigo:#1B2A4A;--indigo2:#24365C;--azul:#2563EB;--ciano:#C9A227;--fundo:#F8F9FA;--borda:#E2E6EC;--suave:#5b6478;--ok:#0f9d58;--alerta:#d93025}
*{box-sizing:border-box}body{margin:0;font-family:'Inter',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.6}
h1,h2,h3{font-family:'Lora',Georgia,serif;line-height:1.2;margin:.2em 0 .5em;color:var(--indigo2)}
a{color:var(--azul);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}.wrap-sm{max-width:560px;margin:0 auto;padding:0 20px}
header.top{background:var(--indigo2);color:#fff;position:sticky;top:0;z-index:20}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
header.top a{color:#e6ebf4}.brand{display:flex;align-items:center;gap:9px;font-family:'Lora',Georgia,serif;font-weight:700;font-size:19px;letter-spacing:.3px;color:#fff!important}.brand img{height:32px;display:block}.brand b{font-family:'Inter',sans-serif;font-weight:700;font-size:14px;letter-spacing:.22em;color:#7FA6FF}
header.top.xl{position:static}header.top.xl .wrap{height:auto;padding-top:18px;padding-bottom:18px;gap:14px;flex-wrap:wrap}
header.top.xl .brand{gap:18px;font-size:3.2rem}header.top.xl .brand img{height:150px}header.top.xl .brand b{font-size:1.4rem;letter-spacing:.18em;color:#7FA6FF}
@media(max-width:640px){header.top.xl .brand img{height:84px!important}header.top.xl .brand{font-size:2rem}header.top.xl .brand b{font-size:.95rem}}
.nav a{margin-left:18px;font-size:15px}
.btn{display:inline-block;background:var(--azul);color:#fff!important;padding:12px 24px;border-radius:9px;font-weight:700;border:0;cursor:pointer;font-size:15px;text-align:center;transition:.15s}
.btn:hover{background:var(--indigo);text-decoration:none}
.btn-ciano{background:var(--ciano);color:#1B2A4A!important}.btn-ciano:hover{background:#B8921F}
.btn-ghost{background:transparent;border:1.5px solid var(--borda);color:var(--indigo2)!important}
.hero .btn-ghost{border-color:rgba(248,249,250,.75);color:#F8F9FA!important}.hero .btn-ghost:hover{background:rgba(248,249,250,.12)}
.hero{background:linear-gradient(155deg,var(--indigo),var(--indigo2) 60%,#2E4370);color:#e6ebf4;padding:64px 0}
.hero h1{color:#fff;font-size:40px;max-width:760px}.hero p.sub{font-size:19px;max-width:640px;color:#c6d0e2}
.eyebrow{text-transform:uppercase;letter-spacing:1.5px;font-size:12px;color:var(--ciano);font-weight:700}
section{padding:48px 0}section.alt{background:var(--fundo)}
.grid{display:grid;gap:22px}.g3{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}.g2{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.card{background:#fff;border:1px solid var(--borda);border-radius:14px;padding:22px}
.card h3{margin-top:0;font-size:18px}
.plano{display:flex;flex-direction:column}.plano .preco{font-size:26px;font-weight:800;color:var(--indigo2)}
.plano ul{padding-left:18px;margin:10px 0;color:var(--suave);flex:1}.plano li{margin:4px 0}
.badge{display:inline-block;background:var(--ciano);color:#1B2A4A;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;text-transform:uppercase;letter-spacing:.5px}
input,select,textarea{width:100%;padding:11px 12px;border:1.5px solid var(--borda);border-radius:9px;font-size:15px;font-family:inherit;background:#fff}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--azul)}
label{font-size:13px;font-weight:600;color:var(--suave);display:block;margin:12px 0 4px}
.aviso{background:#fef7e0;border:1px solid #f5d78e;border-radius:9px;padding:10px 14px;font-size:14px;margin:10px 0}
.erro{background:#fde8e8;border:1px solid #f5b5b5;border-radius:9px;padding:10px 14px;font-size:14px;margin:10px 0;color:var(--alerta)}
footer{background:var(--ink);color:#aeb6cc;padding:34px 0;font-size:14px}footer a{color:#cdd5ec}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--borda)}th{color:var(--suave);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.faq details{border:1px solid var(--borda);border-radius:10px;padding:14px 18px;margin:8px 0;background:#fff}
.faq summary{font-weight:700;cursor:pointer;color:var(--indigo2)}
.check{color:var(--ok);font-weight:700}
@media(max-width:640px){.hero h1{font-size:29px}.nav a.esconde{display:none}}
`;

// Head comum da identidade Grupo Villela Stay (fontes, favicons, theme-color)
const BRAND_DIR = '/assets/brand/villela-docs';
const BASE_URL = 'https://docs.villelastay.com.br';
const HEAD_MARCA = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/svg+xml" href="${BRAND_DIR}/favicon.svg">
<link rel="icon" type="image/png" sizes="192x192" href="${BRAND_DIR}/favicon-192.png">
<link rel="apple-touch-icon" href="${BRAND_DIR}/apple-touch-icon.png">
<meta name="theme-color" content="#1B2A4A">
<link rel="manifest" href="/vdocs/manifest.webmanifest"><script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/vdocs/sw.js').catch(function(){})})}</script>`;
const MARCA = `<img src="${BRAND_DIR}/logo-negativo.svg" alt="Villela Docs" style="height:32px"> Villela <b>DOCS</b>`;
// GA4 do grupo (mesma propriedade do site; tráfego segmentável por hostname) — só páginas públicas.
const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-5L2YQ2BPQW"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-5L2YQ2BPQW');</script>`;
// lockup GRANDE das páginas públicas (masthead 5x — símbolo 150px, nome empilhado)
const MARCA_XL = `<img src="${BRAND_DIR}/logo-negativo.svg" alt="Villela Docs" style="height:150px"><span style="display:flex;flex-direction:column;line-height:1.05"><span>Villela</span><b>DOCS</b></span>`;

function pagina({ titulo, descricao, corpo, canonical }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descricao)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
<meta property="og:image" content="${BASE_URL}${BRAND_DIR}/og-image.png">
${HEAD_MARCA}${GA}
<link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS}</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"><link rel="stylesheet" href="/assets/brand/villela-docs-pro.css?v=9"></head><body class="vx dx-pub" data-vertical="docs">
${SPRITE}
<header class="dx-top"><div class="dx-wrap">
  <a class="dx-brand" href="/vdocs"><img src="${BRAND_DIR}/logo-horizontal.svg" alt="Villela Docs"></a>
  <nav class="dx-nav" aria-label="Principal"><a href="/vdocs#recursos">Recursos</a><a href="/vdocs#seguranca">Segurança</a><a href="/vdocs#planos">Planos</a><a href="/vdocs#faq">Perguntas</a></nav>
  <div class="dx-cta"><a class="dx-link" href="/vdocs/login">Entrar</a><a class="btn btn-ciano" href="/vdocs/cadastro">Teste grátis</a></div>
</div></header>
${corpo}
<footer class="dx-foot"><div class="dx-wrap">
  <div class="dx-foot-grid">
    <div><img src="${BRAND_DIR}/logo-negativo.svg" alt="Villela Docs"><div style="color:#fff;font-weight:600">Villela Docs</div><div>Inteligência documental para empresas.</div></div>
    <div><h4>Produto</h4><ul><li><a href="/vdocs#recursos">Recursos</a></li><li><a href="/vdocs#seguranca">Segurança</a></li><li><a href="/vdocs/precos">Planos</a></li></ul></div>
    <div><h4>Acesso</h4><ul><li><a href="/vdocs/login">Entrar</a></li><li><a href="/vdocs/cadastro">Criar conta</a></li><li><a href="/vdocs#demo">Pedir demonstração</a></li></ul></div>
    <div><h4>Ajuda</h4><ul><li><a href="/vdocs/ajuda">Central de ajuda</a></li><li><a href="/vdocs/ajuda/manual">Instalar como app</a></li></ul></div>
  </div>
  <div class="dx-foot-bottom">Uma empresa do Grupo Villela Stay · CNPJ 56.776.526/0001-12 · Brasília-DF<br>Seus documentos são privados: armazenamento isolado por empresa, criptografia em trânsito e trilha de auditoria completa (LGPD).</div>
</div></footer>
</body></html>`;
}

// ------------------------------------------------------------ landing
function landing() {
  const planos = repo.listarPlanos();
  const corpo = `
<section class="hx-hero">
  <div class="hx-aurora" aria-hidden="true"></div><div class="hx-grid" aria-hidden="true"></div>
  <div class="dx-wrap hx-hero-grid">
    <div class="hx-copy">
      <span class="hx-pill"><i></i> Nomeia, classifica e organiza sozinho com IA</span>
      <h1>Todos os documentos da sua empresa <span class="hx-grad">organizados, seguros e com respostas em segundos.</span></h1>
      <p class="hx-lead">O Villela Docs centraliza contratos, notas, faturas e processos num só lugar, com busca inteligente, aprovações, controle de versão, trilha de auditoria e uma IA que responde citando o documento.</p>
      <div class="hx-cta">
        <a class="btn btn-ciano lg" href="/vdocs/cadastro">Começar teste grátis de 15 dias ${ic('arrow')}</a>
        <a class="hx-ghost" href="#demo">Pedir demonstração</a>
      </div>
      <div class="hx-micro"><span>${ic('check')} Sem cartão de crédito</span><span>${ic('check')} Cancele quando quiser</span><span>${ic('check')} Dados no Brasil, adequado à LGPD</span></div>
    </div>
    <div class="hx-stage" aria-hidden="true">
      <div class="hx-flow">
        <div class="hx-flow-bar"><i></i><i></i><i></i><b>Entrada de documentos</b><em><span class="hx-live"></span>IA organizando</em></div>
        <div class="hx-rows">
          <div class="hx-row" style="--i:0"><div class="hx-raw">${ic('file')}<code>IMG_20261103_094512.pdf</code></div>
            <div class="hx-done"><span class="dx-cat dx-cat-nota_fiscal">Nota fiscal</span><b>Nota fiscal – Distribuidora Alfa – 03/11/2026</b><small>Notas fiscais · v1</small></div></div>
          <div class="hx-row" style="--i:1"><div class="hx-raw">${ic('file')}<code>scan0007_final_v2.pdf</code></div>
            <div class="hx-done"><span class="dx-cat dx-cat-contrato">Contrato</span><b>Contrato de locação – Empresa Beta – 01/2027</b><small>Contratos · vence em 31/01/2028</small></div></div>
          <div class="hx-row" style="--i:2"><div class="hx-raw">${ic('file')}<code>1793745936224-ticket-8a2cd6b2.pdf</code></div>
            <div class="hx-done"><span class="dx-cat dx-cat-fatura">Fatura</span><b>Fatura – Telefonia – 11/2026</b><small>Faturas · vence em 10/11/2026</small></div></div>
          <div class="hx-row" style="--i:3"><div class="hx-raw">${ic('file')}<code>documento (3).pdf</code></div>
            <div class="hx-done"><span class="dx-cat dx-cat-extrato_bancario">Extrato</span><b>Extrato bancário – Conta PJ – 10/2026</b><small>Extratos · v1</small></div></div>
        </div>
      </div>
      <div class="hx-float hx-f1">${ic('spark')}<div><b>IA documental</b><span>O contrato de locação vence em <em>31/01/2028</em> — cláusula 4.</span></div></div>
      <div class="hx-float hx-f2"><span class="hx-dot"></span><div><b>Alerta de validade</b><span>1 contrato vence em 30 dias</span></div></div>
      <div class="hx-note">Exemplo ilustrativo da interface</div>
    </div>
  </div>
</section>

<div class="hx-trust"><div class="dx-wrap">
  <div>${ic('db')}<span><b>Dados no Brasil</b>adequado à LGPD</span></div>
  <div>${ic('building')}<span><b>Isolamento por empresa</b>cada empresa só vê o que é dela</span></div>
  <div>${ic('lock')}<span><b>Conexão segura (HTTPS)</b>armazenamento privado</span></div>
  <div>${ic('scroll')}<span><b>Trilha de auditoria</b>cada acesso registrado</span></div>
</div></div>

<section class="hx-sec hx-sec-light" id="recursos"><div class="dx-wrap">
  <div class="hx-head"><div class="hx-eyebrow">Recursos</div><h2>Do arquivo solto à decisão tomada, tudo no mesmo lugar</h2><p>Cada documento entra, é entendido, fica rastreável e pode ser consultado em linguagem natural.</p></div>
  <div class="hx-bento">
    <article class="hx-tile t-busca"><header><span class="hx-ico c-blue">${ic('search')}</span><h3>Busca inteligente</h3></header>
      <p>Encontre por nome, conteúdo, metadados ou pergunta em linguagem natural. OCR lê até documento escaneado.</p>
      <div class="hx-mini"><div class="hx-search">${ic('search')}<span>Qual contrato vence em janeiro?</span></div>
        <div class="hx-hit"><span class="dx-cat dx-cat-contrato">Contrato</span><b>Contrato de locação – Empresa Beta</b><small>…vigência até <mark>31/01/2028</mark>…</small></div>
        <div class="hx-hit"><span class="dx-cat dx-cat-contrato">Contrato</span><b>Contrato de prestação – Empresa Gama</b><small>…renovação em <mark>janeiro</mark>…</small></div></div></article>
    <article class="hx-tile t-ia"><header><span class="hx-ico c-violet">${ic('spark')}</span><h3>IA que cita as fontes</h3></header>
      <p>Converse com seus documentos: resumos, cláusulas, prazos e riscos, sempre apontando documento e página. Sem inventar.</p>
      <div class="hx-mini hx-chat"><div class="q">Qual a multa por rescisão antecipada?</div><div class="a">A multa é de <b>3 aluguéis</b>, proporcional ao prazo restante. <span class="src">${ic('paperclip')} Contrato de locação – Empresa Beta · cláusula 9</span></div></div></article>
    <article class="hx-tile t-aprov"><header><span class="hx-ico c-green">${ic('approve')}</span><h3>Workflows de aprovação</h3></header>
      <p>Etapas, prazos e aprovadores definidos por você, com histórico de cada decisão.</p>
      <div class="hx-mini hx-steps"><div class="s ok"><i></i>Jurídico</div><div class="s ok"><i></i>Financeiro</div><div class="s on"><i></i>Diretoria</div></div></article>
    <article class="hx-tile t-vers"><header><span class="hx-ico c-amber">${ic('layers')}</span><h3>Versionamento</h3></header>
      <p>Toda alteração vira versão. Compare, restaure e saiba qual é o documento vigente.</p>
      <div class="hx-mini hx-time"><span>v1</span><span>v2</span><span class="cur">v3 vigente</span></div></article>
    <article class="hx-tile t-audit"><header><span class="hx-ico c-rose">${ic('scroll')}</span><h3>LGPD e auditoria</h3></header>
      <p>Trilha completa de acessos, retenção e descarte controlados, exportação de dados.</p>
      <div class="hx-mini hx-log"><div><i></i>baixou <b>Contrato Beta</b><small>10:42</small></div><div><i></i>visualizou <b>Fatura 11/2026</b><small>10:15</small></div><div><i></i>aprovou <b>Política interna</b><small>09:58</small></div></div></article>
    <article class="hx-tile t-nome"><header><span class="hx-ico c-teal">${ic('inbox')}</span><h3>Nome e categoria automáticos</h3></header>
      <p>A IA lê o documento e dá um nome claro, com categoria e pasta certas, para ninguém perder tempo arrumando.</p>
      <div class="hx-mini hx-ba"><div class="b"><s>IMG_20261103_094512.pdf</s></div><div class="arrow">${ic('arrow')}</div><div class="n"><span class="dx-cat dx-cat-nota_fiscal">Nota fiscal</span> Nota fiscal – Distribuidora Alfa – 03/11/2026</div></div></article>
    <article class="hx-tile t-seg"><header><span class="hx-ico c-navy">${ic('shield')}</span><h3>Segurança corporativa</h3></header>
      <p>Permissões por papel, pasta e documento. Links de compartilhamento com senha e validade. Nada exposto em URL pública.</p>
      <div class="hx-mini hx-chips"><span>${ic('lock')} Verificação em duas etapas</span><span>${ic('link')} Links com senha e validade</span><span>${ic('users')} Permissões por papel</span><span>${ic('db')} Dados no Brasil</span></div></article>
  </div>
</div></section>

<section class="hx-sec hx-sec-mist"><div class="dx-wrap">
  <div class="hx-head"><div class="hx-eyebrow">Como funciona</div><h2>Três passos, sem planilha e sem pasta perdida</h2></div>
  <div class="hx-path">
    <div class="hx-node"><span>1</span><h3>Centralize</h3><p>Envie os documentos pelo painel ou pela API. Cada empresa tem o seu repositório, isolado e privado.</p></div>
    <div class="hx-node"><span>2</span><h3>Organize</h3><p>Pastas, categorias, versões e permissões por papel. Alertas de validade avisam antes do vencimento.</p></div>
    <div class="hx-node"><span>3</span><h3>Encontre e decida</h3><p>Busca pelo conteúdo, IA que responde citando a fonte e aprovações com prazo e histórico.</p></div>
  </div>
</div></section>

<section class="hx-sec hx-sec-light"><div class="dx-wrap">
  <div class="hx-head"><div class="hx-eyebrow">Para quem é</div><h2>Pequenas, médias e grandes empresas</h2></div>
  <div class="dx-grid dx-g3">
    <div class="dx-feat"><span class="dx-ico">${ic('scroll')}</span><h3>Jurídico e contratos</h3><p>Contratos com vencimento monitorado, cláusulas extraídas por IA e aprovação formal antes da assinatura.</p></div>
    <div class="dx-feat"><span class="dx-ico">${ic('card')}</span><h3>Financeiro e contábil</h3><p>Notas, recibos e comprovantes organizados por competência, com busca por valor, fornecedor ou CNPJ.</p></div>
    <div class="dx-feat"><span class="dx-ico">${ic('users')}</span><h3>RH e operações</h3><p>Políticas internas versionadas, documentos de colaboradores com acesso restrito e retenção conforme a lei.</p></div>
  </div>
</div></section>

<section class="dx-sec dx-secure" id="seguranca"><div class="dx-wrap">
  <div class="dx-sec-head"><div class="dx-sec-eyebrow">Segurança e conformidade</div><h2>Documento é coisa séria. O controle também.</h2><p>Os mesmos padrões de segurança, auditoria e isolamento que usamos nos nossos próprios sistemas em produção.</p></div>
  <div class="dx-secure-grid">
    <div class="dx-secure-item">${ic('building')}<div><b>Isolamento por empresa</b><span>Os dados de uma empresa nunca aparecem para outra, e isso é verificado por testes automáticos.</span></div></div>
    <div class="dx-secure-item">${ic('lock')}<div><b>Armazenamento privado</b><span>Arquivos nunca ficam em URL pública; todo download passa por autenticação e fica registrado.</span></div></div>
    <div class="dx-secure-item">${ic('shield')}<div><b>Controle de acesso</b><span>Permissões por papel, pasta e documento, e verificação em duas etapas (2FA) para os usuários.</span></div></div>
    <div class="dx-secure-item">${ic('scroll')}<div><b>Trilha de auditoria</b><span>Quem viu, baixou, alterou ou apagou — cada ação com usuário, data e origem.</span></div></div>
    <div class="dx-secure-item">${ic('link')}<div><b>Compartilhamento controlado</b><span>Links com senha e validade, que você revoga quando quiser.</span></div></div>
    <div class="dx-secure-item">${ic('db')}<div><b>LGPD</b><span>Retenção e descarte controlados, retenção legal, exportação e exclusão de dados.</span></div></div>
  </div>
</div></section>

<section class="hx-sec hx-sec-light" id="confianca"><div class="dx-wrap">
  <div class="hx-head"><div class="hx-eyebrow">Por que confiar</div><h2>Tecnologia testada na vida real</h2><p>Nossa missão é transformar o arquivo morto da sua empresa em respostas — busca que entende o conteúdo e IA que responde <b>citando a fonte</b>. O Villela Docs nasceu dentro do Grupo Villela Stay, para organizar os contratos, notas e políticas de uma operação real.</p></div>
  <div class="dx-grid dx-g3">
    <div class="dx-feat"><span class="dx-ico">${ic('building')}</span><h3>Nascido numa operação real</h3><p>Construído pelo Grupo Villela Stay com os mesmos padrões de segurança, auditoria e isolamento que usamos nos nossos próprios sistemas em produção.</p></div>
    <div class="dx-feat"><span class="dx-ico">${ic('paperclip')}</span><h3>IA que cita a fonte</h3><p>Cada resposta aponta o documento e o trecho de origem — você confere em um clique, nada de resposta solta.</p></div>
    <div class="dx-feat"><span class="dx-ico">${ic('check')}</span><h3>Mais de 300 verificações automatizadas</h3><p>Cada atualização passa por mais de 300 testes antes de chegar a você.</p></div>
  </div>
  <p class="sub" style="margin-top:26px;display:flex;flex-wrap:wrap;gap:8px 26px;color:var(--dx-ink-3);font-size:14px"><span>${ic('lock')} Conexão segura (HTTPS)</span><span>${ic('shield')} Dados tratados conforme a LGPD</span><span>${ic('card')} Pagamentos pelo Mercado Pago</span></p>
</div></section>

<section class="hx-sec hx-sec-mist" id="planos"><div class="dx-wrap">
  <div class="hx-head"><div class="hx-eyebrow">Planos</div><h2>Comece pequeno, cresça sem trocar de ferramenta</h2><p>Todos os planos começam com 15 dias grátis no nível Professional, sem cartão de crédito.</p></div>
  <div class="dx-plans">
    ${planos.map(p => `<div class="dx-plan${p.slug === 'professional' ? ' dest' : ''}">${p.slug === 'professional' ? '<span class="dx-badge">Mais escolhido</span>' : ''}
      <h3>${esc(p.nome)}</h3><div class="dx-preco">${p.slug === 'trial' ? '15 dias grátis <small>sem cartão</small>' : brl(p.preco_centavos) + (Number(p.preco_centavos) ? ' <small>/mês</small>' : '')}</div>
      <ul>${planoBullets(p)}</ul>
      <a class="btn${p.slug === 'professional' ? '' : ' btn-ghost'}" href="/vdocs/cadastro">Testar grátis</a></div>`).join('')}
  </div>
  <p style="text-align:center;margin-top:22px"><a href="/vdocs/precos">Ver comparação completa de planos →</a></p>
</div></section>

<section class="hx-sec hx-sec-light" id="demo"><div class="dx-wrap dx-demo">
  <div>
    <div class="hx-eyebrow">Fale com a gente</div>
    <h2 style="font-family:'Lora',Georgia,serif;font-size:clamp(28px,3.2vw,38px);line-height:1.15;margin:8px 0 14px">Peça uma demonstração</h2>
    <p class="dx-lead" style="font-size:17px">Mostramos o Villela Docs com os seus tipos de documento e tiramos as dúvidas sobre segurança, LGPD e integração.</p>
    <ul class="dx-bullets">
      <li>${ic('check')} Retornamos em até 1 dia útil</li>
      <li>${ic('check')} Sem compromisso e sem cartão de crédito</li>
      <li>${ic('check')} Conversa com quem construiu o sistema</li>
    </ul>
  </div>
  <div class="dx-demo-form">
    <div id="lead-erro"></div>
    <form onsubmit="return enviarLead(event)">
      <label>Seu nome</label><input id="ld-nome" required>
      <label>E-mail corporativo</label><input id="ld-email" type="email" required>
      <label>Empresa</label><input id="ld-empresa">
      <label>Telefone/WhatsApp</label><input id="ld-tel">
      <label>O que você precisa organizar?</label><textarea id="ld-msg" rows="3"></textarea>
      <p style="margin:14px 0 0"><button class="btn lg" style="width:100%" type="submit">Quero uma demonstração</button></p>
    </form>
    <div id="lead-ok" style="display:none" class="aviso">Recebido! Vamos entrar em contato em breve.</div>
  </div>
  <script>
  async function enviarLead(ev){ev.preventDefault();
    const r=await fetch('/vdocs/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:ld('ld-nome'),email:ld('ld-email'),empresa:ld('ld-empresa'),telefone:ld('ld-tel'),mensagem:ld('ld-msg'),origem:'landing'})});
    const d=await r.json().catch(()=>({}));
    if(r.ok){ev.target.style.display='none';document.getElementById('lead-ok').style.display='block';}
    else document.getElementById('lead-erro').innerHTML='<div class="erro">'+(d.erro||'Não foi possível enviar.')+'</div>';
    return false;}
  function ld(id){return document.getElementById(id).value}
  </script>
</div></section>

<section class="hx-sec hx-sec-mist" id="faq"><div class="dx-wrap dx-faq">
  <div class="hx-head" style="text-align:center;margin-left:auto;margin-right:auto"><div class="hx-eyebrow" style="justify-content:center">Perguntas frequentes</div><h2>Tire suas dúvidas</h2></div>
  <details><summary>Meus documentos ficam seguros?</summary><div>Cada empresa tem seus dados isolados das demais, com criptografia em trânsito, armazenamento privado (nunca em URL pública) e trilha de auditoria de cada acesso.</div></details>
  <details><summary>A IA pode inventar informações?</summary><div>Não. A IA responde apenas com base nos seus documentos e sempre cita documento e trecho usados. Quando não encontra a resposta, ela diz que não encontrou.</div></details>
  <details><summary>Preciso instalar algo?</summary><div>Não — é 100% na nuvem, funciona no navegador do computador e do celular.</div></details>
  <details><summary>E se eu cancelar?</summary><div>Você exporta todos os seus documentos e dados antes de sair. Sem fidelidade, sem multa.</div></details>
  <details><summary>Atende à LGPD?</summary><div>Sim: controle de acesso, registro de tratamento, retenção e descarte controlados, exportação e exclusão de dados quando aplicável.</div></details>
</div></section>

<section class="hx-sec hx-sec-light"><div class="dx-wrap">
  <div class="hx-final"><div class="hx-aurora" aria-hidden="true"></div><div style="position:relative"><h2>Organize os documentos da sua empresa ainda hoje</h2><p>Crie a conta em minutos e use todos os recursos por 14 dias, sem cartão de crédito.</p>
    <a class="btn btn-ciano lg" href="/vdocs/cadastro">Começar teste grátis</a> <a class="hx-ghost" href="#demo">Pedir demonstração</a></div></div>
</div></section>`;
  return pagina({
    titulo: 'Villela Docs — Document Intelligence: gestão de documentos com IA para empresas',
    descricao: 'Inteligência documental para empresas: centralize, organize e encontre os documentos da sua empresa com busca inteligente, workflows de aprovação, auditoria e IA que cita as fontes. Teste grátis 15 dias.',
    canonical: 'https://docs.villelastay.com.br/vdocs',
    corpo: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Villela Docs","applicationCategory":"BusinessApplication","operatingSystem":"Web","description":"Inteligência documental para empresas: busca inteligente, workflows, auditoria e IA que responde citando as fontes.","offers":{"@type":"Offer","price":"99.00","priceCurrency":"BRL"},"publisher":{"@type":"Organization","name":"Grupo Villela Stay"}}</script>` + corpo,
  });
}

function planoBullets(p) {
  const L = p.limites || {};
  const inf = (v, un) => Number(v) ? `${Number(v).toLocaleString('pt-BR')}${un || ''}` : 'Sob medida';
  return [
    `<li><b>${inf(L.usuarios)}</b> usuários</li>`,
    `<li><b>${Number(L.armazenamento_mb) ? (L.armazenamento_mb / 1024) + ' GB' : 'Sob medida'}</b> de armazenamento</li>`,
    `<li><b>${inf(L.documentos)}</b> documentos</li>`,
    `<li><b>${inf(L.ocr_paginas_mes)}</b> páginas OCR/mês</li>`,
    `<li><b>${inf(L.ia_consultas_mes)}</b> consultas de IA/mês</li>`,
    `<li>${L.api ? '<span class="check">✔</span> API e integrações' : '— sem API'}</li>`,
    `<li>${L.sso ? '<span class="check">✔</span> SSO corporativo' : '— sem SSO'}</li>`,
  ].join('');
}

function precos() {
  const planos = repo.listarPlanos();
  const linhas = [
    ['Usuários', p => p.limites.usuarios || 'Sob medida'],
    ['Armazenamento', p => p.limites.armazenamento_mb ? (p.limites.armazenamento_mb / 1024) + ' GB' : 'Sob medida'],
    ['Documentos', p => p.limites.documentos ? p.limites.documentos.toLocaleString('pt-BR') : 'Sob medida'],
    ['Páginas OCR/mês', p => p.limites.ocr_paginas_mes ? p.limites.ocr_paginas_mes.toLocaleString('pt-BR') : 'Sob medida'],
    ['Consultas IA/mês', p => p.limites.ia_consultas_mes ? p.limites.ia_consultas_mes.toLocaleString('pt-BR') : 'Sob medida'],
    ['Workflows ativos', p => p.limites.workflows_ativos || 'Sob medida'],
    ['API e integrações', p => p.limites.api ? '✔' : '—'],
    ['SSO corporativo', p => p.limites.sso ? '✔' : '—'],
  ];
  const corpo = `<section class="dx-sec"><div class="dx-wrap">
  <div class="dx-sec-eyebrow">Planos e preços</div>
  <h2>Escolha o tamanho da sua operação</h2>
  <p style="color:var(--suave)">Todos os planos começam com <b>15 dias grátis</b> no nível Professional — sem cartão de crédito.</p>
  <div style="overflow-x:auto"><table>
    <tr><th></th>${planos.map(p => `<th style="font-size:15px;color:var(--indigo2)">${esc(p.nome)}<br><span style="font-weight:400;color:var(--suave)">${p.slug === 'trial' ? '15 dias grátis' : brl(p.preco_centavos)}</span></th>`).join('')}</tr>
    ${linhas.map(([rot, fn]) => `<tr><td><b>${rot}</b></td>${planos.map(p => `<td>${fn(p)}</td>`).join('')}</tr>`).join('')}
    <tr><td></td>${planos.map(() => `<td><a class="btn" style="padding:9px 16px" href="/vdocs/cadastro">Testar grátis</a></td>`).join('')}</tr>
  </table></div>
  <div class="aviso">Precisa de volumes maiores, SSO ou contrato personalizado? <a href="/vdocs#demo">Fale com a gente</a> — o plano Enterprise é sob medida.</div>
</div></section>`;
  return pagina({ titulo: 'Planos e preços — Villela Docs', descricao: 'Planos Starter, Professional, Business e Enterprise. Teste grátis 15 dias, sem cartão.', corpo });
}

// ------------------------------------------------------------ cadastro / login / convite
const formPagina = (titulo, inner) => pagina({
  titulo: `${titulo} — Villela Docs`, descricao: 'Inteligência documental para empresas.',
  corpo: `<section class="au"><div class="au-grid">
  <aside class="au-brand"><div class="hx-aurora" aria-hidden="true"></div>
    <span class="hx-pill"><i></i> Inteligência documental para empresas</span>
    <h2>Seus documentos, organizados e com respostas em segundos.</h2>
    <p>Centralize contratos, notas e processos num só lugar, com busca inteligente e uma IA que cita a fonte.</p>
    <ul><li>${ic('check')} 15 dias grátis, sem cartão de crédito</li><li>${ic('lock')} Dados no Brasil, isolados por empresa, adequado à LGPD</li><li>${ic('spark')} IA que responde citando o documento</li></ul>
    <div class="au-mini"><span class="dx-cat dx-cat-nota_fiscal">Nota fiscal</span><span class="dx-cat dx-cat-contrato">Contrato</span><span class="dx-cat dx-cat-fatura">Fatura</span><span class="dx-cat dx-cat-extrato_bancario">Extrato</span></div>
  </aside>
  <div class="au-form"><div class="au-card"><h2>${esc(titulo)}</h2>${inner}</div></div>
</div></section>`,
});

const cadastro = () => formPagina('Criar conta — teste grátis 15 dias', `
  <p style="color:var(--suave)">Crie a conta da sua empresa. Você será o <b>Dono da conta</b> e poderá convidar a equipe em seguida.</p>
  <div id="erro"></div>
  <form onsubmit="return enviar(event)">
    <label>Nome da empresa</label><input id="f-empresa" required>
    <label>Seu nome</label><input id="f-nome" required>
    <label>Seu e-mail</label><input id="f-email" type="email" required>
    <label>Senha (mínimo 8 caracteres)</label><input id="f-senha" type="password" minlength="8" required>
    <p><button class="btn" type="submit" style="width:100%">Criar conta e começar</button></p>
  </form>
  <p style="font-size:13px;color:var(--suave)">Ao criar a conta você concorda com os termos de uso e a política de privacidade. Já tem conta? <a href="/vdocs/login">Entrar</a></p>
  <script>
  async function enviar(ev){ev.preventDefault();const v=id=>document.getElementById(id).value;
    const r=await fetch('/vdocs/api/cadastro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({empresa:v('f-empresa'),nome:v('f-nome'),email:v('f-email'),senha:v('f-senha')})});
    const d=await r.json().catch(()=>({}));
    if(r.ok)location.href='/vdocs/app';else document.getElementById('erro').innerHTML='<div class="erro">'+(d.erro||'Erro ao criar conta.')+'</div>';
    return false;}
  </script>`);

const login = () => formPagina('Entrar', `
  <div id="erro"></div>
  <form onsubmit="return enviar(event)">
    <label>E-mail</label><input id="f-email" type="email" required>
    <label>Senha</label><input id="f-senha" type="password" required>
    <p><button class="btn" type="submit" style="width:100%">Entrar</button></p>
  </form>
  <p style="font-size:13px;color:var(--suave)">Ainda não tem conta? <a href="/vdocs/cadastro">Teste grátis 15 dias</a></p>
  <div id="tfa" style="display:none">
    <p style="color:var(--suave)">Sua conta tem verificação em duas etapas. Digite o código do app autenticador (ou um código de recuperação).</p>
    <label>Código</label><input id="f-codigo" inputmode="numeric" autocomplete="one-time-code">
    <p><button class="btn" style="width:100%" onclick="enviar2fa()">Verificar</button></p>
  </div>
  <script>
  let tfaToken='';
  async function enviar(ev){ev.preventDefault();const v=id=>document.getElementById(id).value;
    const r=await fetch('/vdocs/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:v('f-email'),senha:v('f-senha')})});
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.precisa_2fa){tfaToken=d.tfa_token;document.querySelector('form').style.display='none';document.getElementById('tfa').style.display='block';document.getElementById('f-codigo').focus();}
    else if(r.ok)location.href='/vdocs/app';
    else document.getElementById('erro').innerHTML='<div class="erro">'+(d.erro||'Erro no login.')+'</div>';
    return false;}
  async function enviar2fa(){
    const r=await fetch('/vdocs/api/login-2fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tfa_token:tfaToken,codigo:document.getElementById('f-codigo').value})});
    const d=await r.json().catch(()=>({}));
    if(r.ok)location.href='/vdocs/app';else document.getElementById('erro').innerHTML='<div class="erro">'+(d.erro||'Código incorreto.')+'</div>';
  }
  </script>`);

const convite = (token) => formPagina('Aceitar convite', `
  <p style="color:var(--suave)">Você foi convidado para uma empresa no Villela Docs. Se você ainda não tem conta, defina seu nome e senha; se já tem, os campos podem ficar em branco.</p>
  <div id="erro"></div>
  <form onsubmit="return enviar(event)">
    <label>Seu nome (novos usuários)</label><input id="f-nome">
    <label>Senha (novos usuários — mínimo 8 caracteres)</label><input id="f-senha" type="password">
    <p><button class="btn" type="submit" style="width:100%">Aceitar convite</button></p>
  </form>
  <script>
  async function enviar(ev){ev.preventDefault();const v=id=>document.getElementById(id).value;
    const r=await fetch('/vdocs/api/convites/aceitar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(String(token || ''))},nome:v('f-nome'),senha:v('f-senha')})});
    const d=await r.json().catch(()=>({}));
    if(r.ok)location.href='/vdocs/app';else document.getElementById('erro').innerHTML='<div class="erro">'+(d.erro||'Convite inválido.')+'</div>';
    return false;}
  </script>`);

const definirSenha = (token) => formPagina('Definir senha de acesso', `
  <p style="color:var(--suave)">Crie a sua senha para acessar o painel do Villela Docs. Você é o <b>Dono da conta</b>.</p>
  <div id="erro"></div>
  <form onsubmit="return enviar(event)">
    <label>Nova senha (mínimo 8 caracteres)</label><input id="f-senha" type="password" minlength="8" required>
    <label>Repita a senha</label><input id="f-senha2" type="password" minlength="8" required>
    <p><button class="btn" type="submit" style="width:100%">Definir senha e entrar</button></p>
  </form>
  <script>
  async function enviar(ev){ev.preventDefault();const v=id=>document.getElementById(id).value;
    if(v('f-senha')!==v('f-senha2')){document.getElementById('erro').innerHTML='<div class="erro">As senhas não conferem.</div>';return false;}
    const r=await fetch('/vdocs/api/definir-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(String(token || ''))},senha:v('f-senha')})});
    const d=await r.json().catch(()=>({}));
    if(r.ok)location.href='/vdocs/app';else document.getElementById('erro').innerHTML='<div class="erro">'+(d.erro||'Não foi possível definir a senha.')+'</div>';
    return false;}
  </script>`);

// ------------------------------------------------------------ painel do cliente (SPA)
function appTenant() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Villela Docs — Painel</title>
${HEAD_MARCA}
<link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS}
body{background:var(--fundo)}
.vx-app{margin:22px auto;max-width:1240px;padding:0 16px}
.vx-nav-item.breve{opacity:.5;cursor:default}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin:14px 0}
.kpi{background:#fff;border:1px solid var(--borda);border-radius:12px;padding:14px}.kpi .n{font-size:26px;font-weight:800;color:var(--indigo2)}.kpi .r{font-size:12.5px;color:var(--suave)}
.chip{display:inline-block;background:var(--fundo);border:1px solid var(--borda);border-radius:99px;padding:2px 10px;font-size:12px}
.btn.peq{padding:7px 13px;font-size:13px}
.vw-ov{position:fixed;inset:0;background:rgba(15,23,42,.72);z-index:60;display:flex;align-items:center;justify-content:center;padding:12px}
.vw{background:#fff;border-radius:12px;width:min(1100px,100%);height:min(92vh,100%);display:flex;flex-direction:column;overflow:hidden}
.vw-h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--borda)}
.vw-t{overflow-wrap:anywhere}
.vw-c{flex:1;min-height:0;overflow:auto;display:flex;align-items:stretch;justify-content:center;background:var(--fundo)}
.vw-c iframe{border:0;width:100%;height:100%}
.vw-c img{max-width:100%;max-height:100%;object-fit:contain;align-self:center}
.vw-c audio,.vw-c video{align-self:center;max-width:100%}
.vw-pre{margin:0;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;width:100%;background:#fff}
.dx-lista{table-layout:fixed}
body[data-vertical="docs"] .dx-lista th{padding:7px 10px}
body[data-vertical="docs"] .dx-lista td{padding:4px 10px;line-height:1.25}
.dx-lista td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dx-lista td a{font-weight:600}
.dx-lista .c-cat{width:148px}
.dx-lista .c-pasta{width:132px}
.dx-lista .c-data{width:92px}
.dx-lista .c-acoes{width:124px;text-align:right;overflow:visible}
.dx-lista th{white-space:nowrap}
.dx-lista.lix .c-acoes{width:250px}
.dx-lista td .chip,.dx-lista td .dx-cat{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle;box-sizing:border-box}
@media(max-width:1180px){.dx-lista .c-pasta{display:none}}
@media(max-width:640px){.dx-lista .c-cat,.dx-lista .c-data{display:none}.dx-lista .c-acoes{width:104px}}
.pl{width:100%;display:flex;flex-direction:column;min-height:0;background:#fff}
.pl-abas{display:flex;gap:2px;flex-wrap:wrap;padding:8px 10px 0;border-bottom:1px solid var(--borda);background:var(--fundo)}
.pl-ab{border:1px solid var(--borda);border-bottom:0;background:#eef1f5;padding:6px 14px;border-radius:8px 8px 0 0;font-size:13px;cursor:pointer;color:inherit}
.pl-ab.on{background:#fff;font-weight:700}
.pl-sc{flex:1;min-height:0;overflow:auto}
.pl-t{border-collapse:separate;border-spacing:0;font-size:13px}
.pl-t th{position:sticky;top:0;z-index:2;background:#eef1f5;font-weight:600;color:#556;border-right:1px solid var(--borda);border-bottom:1px solid var(--borda);padding:4px 10px;text-align:center}
.pl-t th.pl-n{left:0;z-index:3;min-width:42px;font-weight:500}
.pl-t tbody th.pl-n{top:auto;z-index:1}
.pl-t td{border-right:1px solid #e6e9ee;border-bottom:1px solid #e6e9ee;padding:4px 10px;white-space:nowrap;max-width:360px;overflow:hidden;text-overflow:ellipsis}
.pl-t td.num{text-align:right;font-variant-numeric:tabular-nums}
body .pl-t td,body .pl-t th{padding:3px 10px;line-height:1.35;height:auto}
.pl-t tbody tr:hover td{background:#f5f8ff}
.pl-rod{padding:6px 12px;font-size:12px;color:var(--suave);border-top:1px solid var(--borda)}
.barra{height:8px;background:var(--borda);border-radius:99px;overflow:hidden}.barra i{display:block;height:100%;background:var(--azul)}
@media(max-width:760px){.layout{flex-direction:column}aside{width:auto;display:flex;overflow-x:auto;gap:4px}aside button{white-space:nowrap;width:auto}}
</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"><link rel="stylesheet" href="/assets/brand/villela-docs-pro.css?v=9"></head><body class="vx" data-vertical="docs">
${SPRITE}
<header class="top"><div class="wrap" style="max-width:none">
  <a class="brand" href="/vdocs/app"><img src="${BRAND_DIR}/logo-horizontal-claro.svg" alt="Villela Docs"></a>
  <nav class="nav"><span id="quem" style="font-size:13.5px;color:#c6d0e2"></span> <button id="pwa-btn" style="display:none;margin-left:14px;background:none;border:1px solid #3a4a66;color:#c6d0e2;border-radius:8px;padding:4px 10px;font-size:13px;cursor:pointer;font-family:inherit" title="Instalar o Villela Docs como app no celular">📲 Instalar app</button> <button id="push-btn" style="display:none;margin-left:14px;background:none;border:1px solid #3a4a66;color:#c6d0e2;border-radius:8px;padding:4px 10px;font-size:13px;cursor:pointer;font-family:inherit" title="Notificações no celular">🔔 Avisos</button> <a href="#" onclick="return sair()" style="margin-left:14px">Sair</a></nav>
</div></header>
<div class="vx-app" id="vd-app"><nav class="vx-nav" id="menu" aria-label="Secoes do painel"></nav>
<div class="vx-main"><div class="vx-page-head"><div id="vd-head"></div></div><div id="corpo"></div></div></div>
<script>
'use strict';
const S={me:null,tela:'dashboard'};
const $=id=>document.getElementById(id);
const ic=(n)=>'<svg class="dx-i" aria-hidden="true"><use href="#i-'+n+'"/></svg>';
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g, '&#39;');
const dt=s=>s?new Date(s).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
let SEQ=0; // cresce a cada troca de tela: leitura atrasada nao pinta a tela nova
async function api(m,c,b){const meu=SEQ;
  const r=await fetch('/vdocs/api'+c,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){location.href='/vdocs/login';throw new Error('sessão expirada');}
  if(!r.ok)throw new Error(d.erro||('HTTP '+r.status));
  if(m==='GET'&&meu!==SEQ)await new Promise(()=>{});
  return d;}
async function sair(){await api('POST','/logout').catch(()=>{});location.href='/vdocs/login';return false;}

// ---- instalar como app (PWA) — prompt no Android/Chrome, instrução no iPhone ----
let PWA_EVT=null; // beforeinstallprompt pode disparar antes do boot renderizar
window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();PWA_EVT=e;pintarBotaoInstalar();});
function emModoApp(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;}
function ehIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function pintarBotaoInstalar(){
  const btn=$('pwa-btn');
  if(!btn)return;
  if(emModoApp()){btn.style.display='none';return;}
  if(PWA_EVT||ehIOS()){btn.style.display='';btn.onclick=instalarApp;}}
async function instalarApp(){
  if(PWA_EVT){
    PWA_EVT.prompt();
    const r=await PWA_EVT.userChoice.catch(()=>null);
    if(r&&r.outcome==='accepted'){PWA_EVT=null;pintarBotaoInstalar();}
    return;
  }
  alert('Para instalar no iPhone:\\n1. Toque em Compartilhar (o quadrado com a seta ↑)\\n2. Escolha "Adicionar à Tela de Início"');}

// ---- notificações push do painel (PWA) — avisos de aprovação no celular ----
function pushOk(){return ('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);}
function b64ParaU8(b){const pad='='.repeat((4-b.length%4)%4);const s=(b+pad).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(s);const a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a;}
async function pushAssinado(){
  try{const reg=await navigator.serviceWorker.ready;return await reg.pushManager.getSubscription();}
  catch(_){return null;}}
async function pintarBotaoPush(){
  const btn=$('push-btn');
  if(!btn||!pushOk())return;
  const sub=await pushAssinado();
  btn.style.display='';
  btn.textContent=sub?'🔔 Avisos ✓':'🔔 Avisos';
  btn.title=sub?'Notificações ativadas — toque para desativar':'Receber avisos de aprovações pendentes no celular';
  btn.onclick=alternarPush;}
async function alternarPush(){
  try{
    const sub=await pushAssinado();
    if(sub){
      await api('POST','/push/unsubscribe',{endpoint:sub.endpoint}).catch(()=>{});
      await sub.unsubscribe();
    }else{
      const d=await api('GET','/push/chave');
      if(!d.publicKey)return alert('As notificações ainda não estão disponíveis. Tente mais tarde.');
      if((await Notification.requestPermission())!=='granted')return alert('Permissão negada. Libere as notificações deste site nas configurações do navegador.');
      const reg=await navigator.serviceWorker.ready;
      const nova=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ParaU8(d.publicKey)});
      await api('POST','/push/subscribe',{subscription:nova.toJSON()});
    }
  }catch(e){alert(e.message);}
  pintarBotaoPush();}

// [id, rotulo, quem ve, grupo, icone]
const TELAS=[
 ['dashboard','Dashboard',()=>true,'Visão geral','dashboard'],
 ['documentos','Documentos',m=>m.permissoes.ver_documentos,'Documentos','folder'],
 ['triagem','Triagem',m=>m.permissoes.ver_documentos,'Documentos','inbox'],
 ['busca','Busca',m=>m.permissoes.ver_documentos,'Documentos','search'],
 ['ia','IA documental',m=>m.permissoes.usar_ia,'Documentos','spark'],
 ['redigir','Redigir com IA',m=>m.permissoes.usar_ia,'Documentos','pen'],
 ['workflows','Aprovações',m=>m.permissoes.ver_documentos,'Fluxos','approve'],
 ['compartilhar','Compartilhamentos',m=>m.permissoes.compartilhar_documento,'Fluxos','link'],
 ['entrada','Entrada automática',m=>m.permissoes.configurar_integracoes,'Fluxos','inbox'],
 ['integracoes','Integrações',m=>m.permissoes.configurar_integracoes,'Fluxos','plug'],
 ['usuarios','Usuários e permissões',m=>m.permissoes.gerir_usuarios,'Administração','users'],
 ['auditoria','Auditoria',m=>m.permissoes.ver_auditoria,'Administração','clip'],
 ['plano','Plano e uso',m=>m.permissoes.ver_uso||m.permissoes.administrar_cobranca,'Administração','package'],
 ['config','Configurações',m=>m.permissoes.gerir_configuracoes,'Administração','sliders'],
];
const ORDEM_GRUPOS=['Visão geral','Documentos','Fluxos','Administração'];
let NAV_COLAPSADA=(()=>{try{return localStorage.getItem('vx-nav')==='colapsada'}catch(e){return false}})();
function visiveis(){return TELAS.filter(t=>t[2](S.me));}
function menu(){
  let html='';
  for(const g of ORDEM_GRUPOS){
    const doGrupo=visiveis().filter(t=>t[3]===g);
    if(!doGrupo.length)continue;
    html+='<div class="vx-nav-grupo">'+esc(g)+'</div>';
    for(const t of doGrupo)
      html+='<button type="button" class="vx-nav-item" onclick="ir(\\''+t[0]+'\\')" title="'+esc(t[1])+'"'+(S.tela===t[0]?' aria-current="page"':'')+'>'+
        '<span class="vx-nav-ico" aria-hidden="true">'+ic(t[4])+'</span><span class="vx-nav-rot">'+esc(t[1])+'</span></button>';
  }
  html+='<hr class="vx-sep" style="margin:8px 4px">'+
    '<button type="button" class="vx-nav-item vx-nav-toggle" onclick="return alternarNav()" aria-label="'+(NAV_COLAPSADA?'Expandir menu':'Recolher menu')+'">'+
    '<span class="vx-nav-ico" aria-hidden="true">'+(NAV_COLAPSADA?'»':'«')+'</span><span class="vx-nav-rot">Recolher menu</span></button>';
  $('menu').innerHTML=html;}
function alternarNav(){
  NAV_COLAPSADA=!NAV_COLAPSADA;
  try{localStorage.setItem('vx-nav',NAV_COLAPSADA?'colapsada':'aberta')}catch(e){}
  const a=$('vd-app');if(a)a.setAttribute('data-nav',NAV_COLAPSADA?'colapsada':'aberta');
  menu();return false;}
function ctxDaTela(){return visiveis().find(t=>t[0]===S.tela)||['dashboard','Dashboard',()=>true,'Visão geral','dashboard'];}
function pintarCabecalho(){
  const c=ctxDaTela(),h=$('vd-head');
  if(!h)return;
  h.innerHTML='<div class="vx-crumb"><span>'+esc(S.me.tenant.nome)+'</span><span aria-hidden="true">›</span><span>'+esc(c[3])+'</span></div>'+
    '<h1>'+ic(c[4])+esc(c[1])+'</h1>';}
function esqueleto(){return '<div class="vx-skel vx-skel--linha"></div><div class="vx-skel vx-skel--linha"></div><div class="vx-skel vx-skel--bloco"></div>';}
function erroTela(e){
  $('corpo').innerHTML='<div class="vx-alerta vx-alerta--danger" role="alert"><span class="vx-alerta-ico" aria-hidden="true">⚠️</span>'+
    '<div><b>Não foi possível carregar esta tela</b><p class="vx-mb0">'+esc(e&&e.message?e.message:'Erro inesperado.')+'</p>'+
    '<button class="vx-btn vx-btn--sec vx-btn--sm" style="margin-top:8px" onclick="ir(S.tela)">Tentar novamente</button></div></div>';}
// ---- URL = estado: F5 continua na mesma tela (e na mesma pasta/aba); Voltar/Avançar do navegador funcionam ----
// formato: #tela  ou  #tela/sub   (documentos/<id da pasta>|lixeira · triagem/propaganda|remetentes)
function lerHash(){const h=(location.hash||'').replace(/^#/,'');const i=h.indexOf('/');
  try{return i<0?[h,'']:[h.slice(0,i),decodeURIComponent(h.slice(i+1))];}catch(e){return [h.slice(0,i),''];}}
function marcaHash(t,sub,empurra){
  const novo='#'+t+(sub?'/'+encodeURIComponent(sub):'');
  if(location.hash===novo)return;
  try{history[empurra?'pushState':'replaceState'](null,'',novo);}catch(e){}}
function subDaTela(t){
  if(t==='documentos')return S.lixeira?'lixeira':((S.pasta||'')+(S.tipoF?'~'+S.tipoF:''));
  if(t==='triagem')return S.triAba&&S.triAba!=='decidir'?S.triAba:'';
  return '';}
function aplicaSub(t,sub){
  if(t==='documentos'){
    S.docAberto=sub.startsWith('doc:')?sub.slice(4):null; // #documentos/doc:<id> reabre o documento
    if(!S.docAberto){const [pf,tf]=sub.split('~');S.lixeira=pf==='lixeira';S.pasta=pf==='lixeira'?'':(pf||'');S.tipoF=tf||'';}
  }
  if(t==='triagem'&&['decidir','propaganda','remetentes'].includes(sub))S.triAba=sub;}
function ir(t,naoMarcar){
  S.tela=t;SEQ++;menu();pintarCabecalho();
  if(!naoMarcar)marcaHash(t,subDaTela(t),true);
  $('corpo').innerHTML=esqueleto();
  ({dashboard:vDash,documentos:vDocs,triagem:vTriagem,entrada:vEntrada,busca:vBusca,ia:vIA,redigir:vRedigir,workflows:vWorkflows,compartilhar:vShares,integracoes:vInteg,usuarios:vUsuarios,auditoria:vAudit,plano:vPlano,config:vConfig}[t]||vDash)().catch(erroTela);}

async function boot(){
  S.me=await api('GET','/me');
  $('quem').textContent=S.me.user.nome+' · '+S.me.tenant.nome+' ('+S.me.papel_nome+')';
  menu();
  pintarBotaoInstalar();
  pintarBotaoPush().catch(()=>{});
  if(S.me.bloqueado){pintarCabecalho();$('corpo').innerHTML='<div class="vx-alerta vx-alerta--danger" role="alert"><span class="vx-alerta-ico" aria-hidden="true">⚠️</span><div><b>Conta bloqueada.</b><p class="vx-mb0">'+(S.me.tenant.status==='suspensa'?'Sua conta está suspensa — fale com a Villela Docs.':'Seu período de teste terminou — escolha um plano para continuar (fale com a gente pelo formulário da página inicial).')+'</p></div></div>';return;}
  // F5, favorito e link do aviso do WhatsApp (/vdocs/app#triagem) reabrem a mesma tela
  const [alvo,sub]=lerHash();
  const tela=visiveis().some(t=>t[0]===alvo)?alvo:'dashboard';
  aplicaSub(tela,sub);
  ir(tela,tela!==alvo); // hash inválido/sem permissão: troca pelo da tela que abriu
  if(tela!==alvo)marcaHash(tela,subDaTela(tela));
  // links "#" que só disparam uma ação (abrir documento etc.) não podem navegar nem voltar ao início
  document.addEventListener('click',e=>{const l=e.target.closest&&e.target.closest('a[href="#"]');if(l)e.preventDefault();});
  window.addEventListener('popstate',()=>{
    if(!S.me||S.me.bloqueado)return;
    const [a,s2]=lerHash();
    if(!a)return; // hash vazio = clique em link "#", não navegação: fica onde está
    const t=visiveis().some(x=>x[0]===a)?a:'dashboard';
    aplicaSub(t,s2);ir(t,true);});
}
async function vDash(){
  const P=S.me.permissoes;
  const [d,dd,tr]=await Promise.all([
    api('GET','/dashboard'),
    P.ver_documentos?api('GET','/documentos?todos=1&limite=500').catch(()=>({documentos:[]})):Promise.resolve({documentos:[]}),
    P.ver_documentos?api('GET','/entrada/triagem').catch(()=>({itens:[]})):Promise.resolve({itens:[]}),
  ]);
  const L=(d.plano&&d.plano.limites)||{};
  const pct=(v,l)=>l?Math.min(100,Math.round(100*v/l)):0;
  const docs=dd.documentos||[];
  const naTriagem=(tr.itens||[]).filter(i=>i.grupo!=='propaganda').length;
  const hora=new Date().getHours();
  const saud=hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
  const primeiro=String(S.me.user.nome||'').split(' ')[0]||'';
  const trial=d.empresa.status==='trial'?'<div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico" aria-hidden="true">'+ic('spark')+'</span><div><b>Período de teste até '+new Date(d.empresa.trial_expira_em).toLocaleDateString('pt-BR')+'.</b><p class="vx-mb0">Plano '+esc(d.plano?d.plano.nome:'')+'. Assine para continuar sem interrupção.</p></div></div>':'';
  const venc=d.vencendo_30dias?'<div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico" aria-hidden="true">'+ic('clip')+'</span><div><b>'+d.vencendo_30dias+' documento(s) com validade nos próximos 30 dias'+(d.vencidos?' ('+d.vencidos+' já vencido(s))':'')+'</b><p class="vx-mb0">'+d.docs_vencendo.map(x=>(x.vencido?'<span class="dx-cat dx-cat-financeiro">vencido</span> ':'<span class="dx-cat dx-cat-fatura">vence</span> ')+esc(x.nome)+' ('+x.validade.split('-').reverse().join('/')+')').join(' &nbsp; ')+'</p></div></div>':'';

  // distribuição por categoria (barra empilhada na cor de cada categoria)
  const porTipo={};docs.forEach(x=>{porTipo[x.tipo_documental]=(porTipo[x.tipo_documental]||0)+1;});
  const tipos=Object.keys(porTipo).sort((a,b)=>porTipo[b]-porTipo[a]);
  const barra=docs.length?'<div class="pd-stack" role="img" aria-label="Documentos por categoria">'+tipos.map(t=>'<i class="dx-cat-'+esc(t)+'" style="flex:'+porTipo[t]+'" title="'+esc(ROT_TIPO[t]||t)+': '+porTipo[t]+'"></i>').join('')+'</div>'+
    '<div class="pd-legend">'+tipos.map(t=>'<button type="button" class="pd-leg dx-cat-'+esc(t)+'" onclick="S.pasta=\\'\\';S.tipoF=\\''+esc(t)+'\\';ir(\\'documentos\\')"><i></i>'+esc(ROT_TIPO[t]||t)+' <b>'+porTipo[t]+'</b></button>').join('')+'</div>'
    :'<p class="vx-vazio">Ainda não há documentos. Envie o primeiro e ele aparece aqui, por categoria.</p>';
  const recentes=docs.slice().sort((a,b)=>String(b.atualizado_em||b.criado_em).localeCompare(String(a.atualizado_em||a.criado_em))).slice(0,5);
  const lista=recentes.length?'<div class="pd-list">'+recentes.map(x=>'<a class="pd-item" href="#" onclick="S.docAberto=\\''+x.id+'\\';ir(\\'documentos\\');return false"><span class="dx-cat dx-cat-'+esc(x.tipo_documental)+'">'+esc(ROT_TIPO[x.tipo_documental]||x.tipo_documental)+'</span><b>'+esc(x.nome)+'</b><small>'+dt(x.atualizado_em||x.criado_em)+'</small></a>').join('')+'</div>':'<p class="vx-vazio">Nada por aqui ainda.</p>';

  const card=(cor,icone,rot,n,ctx,tela,extra)=>'<button type="button" class="pd-stat pd-'+cor+'"'+(tela?' onclick="ir(\\''+tela+'\\')"':'')+'><span class="pd-ico">'+ic(icone)+'</span><span class="pd-rot">'+esc(rot)+'</span><span class="pd-n">'+n+'</span><span class="pd-ctx">'+esc(ctx)+'</span>'+(extra||'')+'</button>';
  const stats='<div class="pd-stats">'+
    card('blue','folder','Documentos',docs.length||d.documentos,'no acervo','documentos')+
    (P.ver_documentos?card('amber','inbox','Aguardando triagem',naTriagem,naTriagem?'decida: eliminar ou processar':'tudo decidido','triagem'):'')+
    card('violet','users','Usuários ativos',d.usuarios_ativos,L.usuarios?'de '+L.usuarios+' do plano':'na equipe','usuarios')+
    card('teal','db','Armazenamento',(d.armazenamento_mb||0)+' MB','usado no plano','plano',(L.armazenamento_mb?'<span class="pd-bar"><i style="width:'+pct(d.armazenamento_mb||0,L.armazenamento_mb)+'%"></i></span>':''))+
  '</div>';

  const pend=[];
  const kpi=(rot,n,ctx,tom,tela)=>'<button type="button" class="vx-kpi" data-tom="'+(tom||'')+'" onclick="ir(\\''+tela+'\\')"><span class="vx-kpi-rot">'+esc(rot)+'</span><span class="vx-kpi-val">'+n+'</span><span class="vx-kpi-ctx">'+esc(ctx)+'</span></button>';
  if(d.aprovacoes_pendentes)pend.push(kpi('Aprovações para você',d.aprovacoes_pendentes,'esperando seu aval','critico','workflows'));
  if(d.vencendo_30dias)pend.push(kpi('Documentos vencendo',d.vencendo_30dias,(d.vencidos?d.vencidos+' já vencido(s)':'nos próximos 30 dias'),'atencao','documentos'));
  if(d.convites_pendentes)pend.push(kpi('Convites pendentes',d.convites_pendentes,'ninguém aceitou ainda','atencao','usuarios'));

  $('corpo').innerHTML=
   '<section class="pd-hero"><div class="pd-aurora" aria-hidden="true"></div><div class="pd-hero-in">'+
     '<div><div class="pd-hi">'+esc(saud)+(primeiro?', '+esc(primeiro):'')+'</div><h2>'+esc(S.me.tenant.nome)+'</h2>'+
     '<p>'+(naTriagem?'<b>'+naTriagem+'</b> documento(s) esperam a sua decisão na Triagem.':'Seus documentos estão em dia.')+'</p></div>'+
     '<div class="pd-acoes">'+
       (P.ver_documentos?'<button class="btn btn-ciano" onclick="ir('+"\\'triagem\\'"+')">'+ic('inbox')+' Triagem'+(naTriagem?' ('+naTriagem+')':'')+'</button>':'')+
       (P.criar_documento?'<button class="pd-glass" onclick="ir('+"\\'documentos\\'"+')">'+ic('upload')+' Enviar documentos</button>':'')+
       (P.usar_ia?'<button class="pd-glass" onclick="ir('+"\\'ia\\'"+')">'+ic('spark')+' Perguntar à IA</button>':'')+
     '</div></div></section>'+
   trial+venc+
   stats+
   (pend.length?'<section class="vx-card pd-sec"><div class="vx-card-head"><div><h2>Exige ação</h2><p class="vx-hint vx-mb0">O que está esperando por você agora.</p></div></div><div class="vx-kpis">'+pend.join('')+'</div></section>':'')+
   '<div class="pd-duo">'+
     '<section class="vx-card pd-sec"><div class="vx-card-head"><div><h2>Documentos por categoria</h2><p class="vx-hint vx-mb0">Clique numa categoria para filtrar.</p></div></div>'+barra+'</section>'+
     '<section class="vx-card pd-sec"><div class="vx-card-head"><div><h2>Atualizados recentemente</h2></div></div>'+lista+'</section>'+
   '</div>'+
   '<section class="vx-card pd-sec"><div class="vx-card-head"><div><h2>Atividade recente</h2></div></div><table><tr><th>Quando</th><th>Quem</th><th>Ação</th></tr>'+
   d.auditoria_recente.map(a=>'<tr><td>'+dt(a.criado_em)+'</td><td>'+esc(a.usuario_nome)+'</td><td>'+esc(a.acao)+'</td></tr>').join('')+'</table></section>';
}
// ---------------- Documentos (Fase 2) ----------------
S.pasta='';S.lixeira=false;S.pastas=[];
const kb=n=>{n=Number(n||0);return n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B';};
function trilha(){
  const partes=[];let id=S.pasta;
  while(id){const p=S.pastas.find(x=>x.id===id);if(!p)break;partes.unshift(p);id=p.parent_id;}
  return '<a href="#" onclick="return irPasta(\\'\\')">📁 Documentos</a>'+partes.map(p=>' / <a href="#" onclick="return irPasta(\\''+p.id+'\\')">'+esc(p.nome)+'</a>').join('');
}
function irPasta(id){S.pasta=id;S.tipoF='';S.lixeira=false;vDocs();return false;}
function irTipo(t){S.tipoF=S.tipoF===t?'':t;vDocs();return false;} // clicar na categoria ativa volta a mostrar todas
async function vDocs(){
  const P=S.me.permissoes;
  if(S.docAberto){const id=S.docAberto;S.docAberto=null;return abrirDoc(id);} // F5 dentro de um documento
  marcaHash('documentos',subDaTela('documentos')); // pasta/lixeira entram na URL
  const filtro=($('dq')&&$('dq').value)||'';
  const [ps,ds]=await Promise.all([api('GET','/pastas'),api('GET','/documentos?busca='+encodeURIComponent(filtro)+'&'+(S.lixeira?'status=lixeira':'todos=1&limite=500'))]);
  S.pastas=ps.pastas;S.tiposDoc=ds.tipos;
  // se a pessoa continuou digitando enquanto a lista carregava, refaz com o texto atual (senão sumiriam letras)
  if(((($('dq')&&$('dq').value)||''))!==filtro)return vDocs();
  // Início = TODOS os documentos (de todas as pastas); pasta e categoria só ESTREITAM a lista
  const sub=S.lixeira?[]:S.pastas.filter(p=>p.parent_id===S.pasta);
  const desc=id=>[id].concat(S.pastas.filter(p=>p.parent_id===id).flatMap(p=>desc(p.id))); // a pasta e as de dentro dela
  const idsPasta=new Set(S.pasta?desc(S.pasta):[]);
  const base=S.lixeira||!S.pasta?ds.documentos:ds.documentos.filter(d=>idsPasta.has(d.folder_id));
  const porTipo={};base.forEach(d=>{porTipo[d.tipo_documental]=(porTipo[d.tipo_documental]||0)+1;});
  const docsL=S.tipoF&&!S.lixeira?base.filter(d=>d.tipo_documental===S.tipoF):base;
  const nPasta=id=>{const ids=desc(id);return ds.documentos.filter(d=>ids.includes(d.folder_id)).length;};
  const nomePastaDoc=id=>{const p=S.pastas.find(x=>x.id===id);return p?'<span class="chip">'+ic('folder')+' '+esc(p.nome)+'</span>':'<span class="sub" style="font-size:12px">sem pasta</span>';};
  const chipsTipo=S.lixeira?'':'<div class="card" style="margin-top:12px"><div class="sub" style="font-size:12px;margin-bottom:6px">Categorias — clique para filtrar · mostrando <b>'+docsL.length+'</b> de '+base.length+' documento(s)'+(S.pasta?' desta pasta':'')+'</div><div style="display:flex;flex-wrap:wrap;gap:6px">'+
    '<button class="btn peq dx-catbtn todos'+(S.tipoF?' btn-ghost':'')+'" onclick="irTipo(\\'\\')">Todos ('+base.length+')</button>'+
    Object.keys(porTipo).sort((a,b)=>porTipo[b]-porTipo[a]).map(t=>'<button class="btn peq dx-catbtn dx-cat-'+t+(S.tipoF===t?'':' btn-ghost')+'" onclick="irTipo(\\''+t+'\\')">'+esc(ROT_TIPO[t]||t)+' ('+porTipo[t]+')</button>').join('')+'</div></div>';
  // A tela é redesenhada inteira, o que destrói o campo de busca: guarda o foco e a posição do cursor para devolvê-los
  const vivo=$('dq'),temFoco=!!vivo&&document.activeElement===vivo,selIni=temFoco?vivo.selectionStart:0,selFim=temFoco?vivo.selectionEnd:0;
  $('corpo').innerHTML=(S.lixeira?'<h2>Lixeira</h2>':'')+
   '<div class="card" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">'+
   (S.pasta||S.lixeira?'<button class="btn peq" title="Voltar à página inicial dos documentos (todas as pastas)" onclick="S.lixeira=false;irPasta(\\'\\')">'+ic('home')+' Início</button>':'')+
   '<div style="flex:1;min-width:220px;font-size:14px">'+(S.lixeira?'Documentos excluídos (restaure ou exclua definitivamente)':trilha())+'</div>'+
   '<input id="dq" placeholder="Buscar: contrato casa villela…" value="'+esc(filtro)+'" style="max-width:200px" oninput="clearTimeout(S._t);S._t=setTimeout(vDocs,400)">'+
   (P.criar_pasta&&!S.lixeira?'<button class="btn btn-ghost peq" onclick="novaPasta()">'+ic('folder')+' Nova pasta</button>':'')+
   (P.criar_documento&&!S.lixeira?'<button class="btn peq" onclick="$(\\'up-file\\').click()">'+ic('upload')+' Enviar arquivos</button><input id="up-file" type="file" multiple style="display:none" onchange="enviarArquivos(this.files)">':'')+
   (P.excluir_documento||P.restaurar_documento?'<button class="btn btn-ghost peq" onclick="S.lixeira=!S.lixeira;vDocs()">'+(S.lixeira?'← Voltar aos documentos':ic('trash')+' Lixeira')+'</button>':'')+
   '</div><div id="up-out"></div>'+chipsTipo+
   (sub.length?'<div class="card" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">'+sub.map(p=>'<button class="btn btn-ghost peq" onclick="irPasta(\\''+p.id+'\\')">'+ic('folder')+' '+esc(p.nome)+' ('+nPasta(p.id)+')</button>'+(P.excluir_documento?'<button class="dx-ib perigo" title="Excluir pasta vazia" aria-label="Excluir pasta" onclick="excluirPasta(\\''+p.id+'\\')">'+ic('trash')+'</button>':'')).join(''):'')+ (sub.length?'</div>':'')+
   '<div class="card" style="margin-top:12px;padding:6px 8px"><table class="dx-lista'+(S.lixeira?' lix':'')+'"><tr><th>Documento</th><th class="c-cat">Categoria</th><th class="c-pasta">Pasta</th><th class="c-data">Atualizado</th><th class="c-acoes"></th></tr>'+
   (docsL.length?docsL.map(d=>{
     const tg=(d.tags||[]).filter(t=>t!=='entrada-automatica');
     return '<tr><td title="'+esc(d.nome+(tg.length?'  ·  tags: '+tg.join(', '):''))+'"><a href="#" onclick="return abrirDoc(\\''+d.id+'\\')">'+esc(d.nome)+'</a>'+
     (d.versao_atual>1?' <span class="sub" style="font-size:11px">v'+d.versao_atual+'</span>':'')+
     (d.fora_da_pasta?' <span class="chip" title="Encontrado pelo conteúdo em outra pasta">em outra pasta</span>':'')+
     (d.trecho?'<br><span style="font-size:12px;color:var(--suave)">…'+esc(d.trecho)+'…</span>':'')+'</td>'+
     '<td class="c-cat"><span class="dx-cat dx-cat-'+esc(d.tipo_documental)+'">'+esc(ROT_TIPO[d.tipo_documental]||d.tipo_documental)+'</span></td><td class="c-pasta">'+nomePastaDoc(d.folder_id)+'</td>'+
     '<td class="c-data" title="'+esc(dt(d.atualizado_em||d.criado_em))+'">'+(d.atualizado_em||d.criado_em?new Date(d.atualizado_em||d.criado_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—')+'</td><td class="c-acoes">'+
     (S.lixeira?((P.restaurar_documento?'<button class="btn peq" onclick="docAcao(\\''+d.id+'\\',\\'restaurar\\')">Restaurar</button> ':'')+(P.excluir_documento?'<button class="btn btn-ghost peq" onclick="excluirDefinitivo(\\''+d.id+'\\')">Excluir de vez</button>':''))
      :('<button class="dx-ib" title="Visualizar sem baixar" aria-label="Visualizar" onclick="visualizarDoc(\\''+d.id+'\\')">'+ic('eye')+'</button> '+(P.baixar_documento?'<a class="dx-ib" title="Baixar" aria-label="Baixar" href="/vdocs/api/documentos/'+d.id+'/baixar">'+ic('download')+'</a> ':'')+(P.excluir_documento?'<button class="dx-ib perigo" title="Mover para a lixeira" aria-label="Mover para a lixeira" onclick="docAcao(\\''+d.id+'\\',\\'lixeira\\')">'+ic('trash')+'</button>':'')))+'</td></tr>';
   }).join(''):'<tr><td colspan="5" style="color:var(--suave)">'+(S.lixeira?'Lixeira vazia.':(S.tipoF||S.pasta?'Nenhum documento com este filtro.':'Nenhum documento ainda.'))+'</td></tr>')+'</table></div>';
  if(temFoco){const el=$('dq');if(el){el.focus();try{el.setSelectionRange(selIni,selFim);}catch(e){}}}
}
async function novaPasta(){const n=prompt('Nome da nova pasta:');if(!n)return;
  try{await api('POST','/pastas',{nome:n,parent_id:S.pasta});vDocs();}catch(e){alert(e.message);}}
async function excluirPasta(id){if(!confirm('Excluir esta pasta? (precisa estar vazia)'))return;
  try{await api('DELETE','/pastas/'+id);vDocs();}catch(e){alert(e.message);}}
function b64(file){return new Promise((ok,err)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=err;r.readAsDataURL(file);});}
async function enviarArquivos(files){
  const out=$('up-out');
  for(const f of Array.from(files||[])){
    out.innerHTML='<div class="aviso">Enviando '+esc(f.name)+'…</div>';
    try{
      const conteudo=await b64(f);
      try{await api('POST','/documentos',{arquivo_nome:f.name,nome:f.name,folder_id:S.pasta,conteudo_base64:conteudo});}
      catch(e){
        if(/idêntico já existe/.test(e.message)&&confirm(e.message+'\\n\\nEnviar mesmo assim?'))
          await api('POST','/documentos',{arquivo_nome:f.name,nome:f.name,folder_id:S.pasta,conteudo_base64:conteudo,forcar_duplicado:true});
        else if(!/idêntico já existe/.test(e.message))throw e;
      }
    }catch(e){out.innerHTML='<div class="erro">'+esc(f.name)+': '+esc(e.message)+'</div>';return;}
  }
  out.innerHTML='';vDocs();
}
async function docAcao(id,acao){try{await api('POST','/documentos/'+id+'/'+acao);vDocs();}catch(e){alert(e.message);}}
async function excluirDefinitivo(id){if(!confirm('Excluir DEFINITIVAMENTE? Todas as versões serão apagadas do servidor. Não dá para desfazer.'))return;
  try{await api('DELETE','/documentos/'+id);vDocs();}catch(e){alert(e.message);}}
// ---- pré-visualização sem baixar (PDF, imagem, texto, áudio/vídeo; Office mostra o texto extraído) ----
async function visualizarDoc(id,versao){
  let d;try{d=(await api('GET','/documentos/'+id)).documento;}catch(e){alert(e.message);return false;}
  const v=d.versoes.find(x=>x.numero===(versao||d.versao_atual))||d.versoes[0];
  const ext=((v.nome_arquivo.match(/\.([a-z0-9]+)$/i)||[])[1]||'').toLowerCase();
  const q=versao?'?versao='+versao:'';
  const url='/vdocs/api/documentos/'+id+'/visualizar'+q;
  fecharVisualizador();
  const ov=document.createElement('div');ov.className='vw-ov';ov.id='vw-ov';
  ov.onclick=e=>{if(e.target===ov)fecharVisualizador();};
  const baixar=S.me.permissoes.baixar_documento?'<a class="btn peq" href="/vdocs/api/documentos/'+id+'/baixar'+q+'">⬇️ Baixar</a>':'';
  ov.innerHTML='<div class="vw" role="dialog" aria-label="Pré-visualização"><div class="vw-h"><b class="vw-t">'+esc(d.nome)+'</b><span class="sub" style="font-size:12px">v'+v.numero+' · '+esc(v.nome_arquivo)+'</span><span style="flex:1"></span>'+baixar+' <button class="btn btn-ghost peq" onclick="fecharVisualizador()">✕ Fechar</button></div><div class="vw-c" id="vw-c"><p style="padding:20px">Carregando…</p></div></div>';
  document.body.appendChild(ov);
  const c=$('vw-c');
  if(ext==='pdf')c.innerHTML='<iframe title="Pré-visualização do PDF" src="'+url+'"></iframe>';
  else if(['png','jpg','jpeg','gif','webp'].includes(ext))c.innerHTML='<img alt="'+esc(d.nome)+'" src="'+url+'">';
  else if(['mp3','wav'].includes(ext))c.innerHTML='<audio controls src="'+url+'"></audio>';
  else if(['mp4','mov'].includes(ext))c.innerHTML='<video controls src="'+url+'"></video>';
  else{
    try{
      if(['xlsx','xlsm','xls','csv'].includes(ext)){await mostrarPlanilha(c,id,q);}
      else if(['txt','md'].includes(ext)){const r=await fetch(url,{credentials:'same-origin'});c.innerHTML='<pre class="vw-pre">'+esc(await r.text())+'</pre>';}
      else{
        const t=await api('GET','/documentos/'+id+'/texto');
        c.innerHTML=t.texto
          ?'<div style="width:100%"><p class="sub" style="padding:10px 14px;margin:0;font-size:12px">Texto extraído do arquivo (sem a formatação original)'+(baixar?' — use Baixar para ver o original':'')+'.</p><pre class="vw-pre">'+esc(t.texto)+'</pre>'+(t.truncado?'<p class="sub" style="padding:0 14px 14px">[…texto cortado…]</p>':'')+'</div>'
          :'<p style="padding:20px">Este tipo de arquivo não tem pré-visualização e ainda não há texto extraído.'+(baixar?' Use <b>Baixar</b>.':'')+'</p>';
      }
    }catch(e){c.innerHTML='<p style="padding:20px;color:var(--alerta)">'+esc(e.message)+'</p>';}
  }
  return false;
}
// ---- visualizador de planilha (xlsx/csv): abas + tabela com A B C e número de linha, sem baixar ----
async function mostrarPlanilha(c,id,q,senha,aviso){
  // POST (a senha vai no corpo, nunca na URL). 422 = planilha protegida: pede a senha aqui mesmo, sem baixar.
  const r=await fetch('/vdocs/api/documentos/'+id+'/planilha'+q,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({senha:senha||''})});
  const j=await r.json().catch(()=>({}));
  if(r.status===422&&j.precisa_senha){
    c.innerHTML='<div style="margin:auto;max-width:420px;padding:24px;text-align:center"><p style="font-size:15px"><b>Planilha protegida por senha</b></p>'+
     '<p class="sub" style="font-size:13px">'+(j.senha_incorreta?'⚠️ Senha incorreta. Tente de novo.':'Digite a senha do arquivo para ver o conteúdo aqui, sem baixar. A senha não é guardada.')+'</p>'+
     '<input id="pl-senha" type="password" autocomplete="off" placeholder="Senha da planilha" style="max-width:260px" onkeydown="if(event.key===\\'Enter\\')planilhaAbrirComSenha(\\''+id+'\\',\\''+q+'\\')"> '+
     '<button class="btn" onclick="planilhaAbrirComSenha(\\''+id+'\\',\\''+q+'\\')">Abrir</button></div>';
    const i=$('pl-senha');if(i)i.focus();return;
  }
  if(!r.ok)throw new Error(j.erro||('Erro '+r.status));
  S._pl=j;
  c.innerHTML='<div class="pl"><div class="pl-abas" id="pl-abas"></div><div class="pl-sc" id="pl-sc"></div><div class="pl-rod" id="pl-rod"></div></div>';
  planilhaAba(0);
}
function planilhaAbrirComSenha(id,q){const c=$('vw-c'),i=$('pl-senha');if(!c||!i)return;const s=i.value;c.innerHTML='<p style="padding:20px">Abrindo…</p>';mostrarPlanilha(c,id,q,s).catch(e=>{c.innerHTML='<p style="padding:20px;color:var(--alerta)">'+esc(e.message)+'</p>';});}
function planilhaCol(n){let t='';n++;while(n>0){const r=(n-1)%26;t=String.fromCharCode(65+r)+t;n=Math.floor((n-1)/26);}return t;}
function planilhaAba(i){
  const a=S._pl.abas[i];
  $('pl-abas').innerHTML=S._pl.abas.map((x,k)=>'<button class="pl-ab'+(k===i?' on':'')+'" onclick="planilhaAba('+k+')">'+esc(x.nome)+'</button>').join('');
  let h='<table class="pl-t"><thead><tr><th class="pl-n"></th>';
  for(let k=0;k<a.colunas;k++)h+='<th>'+planilhaCol(k)+'</th>';
  h+='</tr></thead><tbody>';
  a.linhas.forEach((l,r)=>{h+='<tr><th class="pl-n">'+(r+1)+'</th>'+l.map(v=>'<td'+(v!==''&&!isNaN(Number(String(v).replace(',','.')))?' class="num"':'')+' title="'+esc(v)+'">'+esc(v)+'</td>').join('')+'</tr>';});
  $('pl-sc').innerHTML=h+'</tbody></table>';
  $('pl-rod').textContent=a.linhas.length+' linhas · '+a.colunas+' colunas'+(a.truncado?' — mostrando só as primeiras '+a.linhas.length+' de '+a.totalLinhas+' (baixe para ver tudo)':'')+' · somente leitura';
}
function fecharVisualizador(){const o=$('vw-ov');if(o)o.remove();}
document.addEventListener('keydown',e=>{if(e.key==='Escape')fecharVisualizador();});
async function abrirDoc(id){
  const P=S.me.permissoes;
  marcaHash('documentos','doc:'+id,true); // o documento entra na URL; Voltar retorna à lista
  if(!S.tiposDoc||!S.pastas.length){ // F5 direto no documento: a lista ainda não carregou pastas e tipos
    const [ps,ds]=await Promise.all([api('GET','/pastas'),api('GET','/documentos?pasta=')]);
    S.pastas=ps.pastas;S.tiposDoc=ds.tipos;
  }
  const {documento:d,acessos,processamento:pr,aprovacoes:aps}=await api('GET','/documentos/'+id);
  const st=(pr&&pr.job&&pr.job.status)||'';
  const proc=pr&&pr.texto?'✅ Texto extraído ('+esc(pr.texto.metodo)+', '+pr.texto.chars.toLocaleString('pt-BR')+' caracteres'+(pr.texto.paginas?', '+pr.texto.paginas+' pág.':'')+') — este documento já aparece na busca por conteúdo.'
    :st==='ocr_pendente'?'🟡 Sem texto extraível (imagem/escaneado) — OCR chega em fase futura.'
    :st==='erro'?'🔴 Falha na extração: '+esc((pr.job&&pr.job.erro)||'')
    :st?'⏳ Extração de texto em processamento…':'';
  const selPasta='<select id="dd-pasta"><option value="">🏠 Início dos documentos (sem pasta)</option>'+S.pastas.map(p=>'<option value="'+p.id+'"'+(p.id===d.folder_id?' selected':'')+'>📁 '+esc(p.nome)+'</option>').join('')+'</select>';
  $('corpo').innerHTML='<p><a href="#" onclick="return irPasta(S.pasta)">← voltar</a></p><h2>'+esc(d.nome)+'</h2>'+
   '<p><button class="btn peq" onclick="visualizarDoc(\\''+d.id+'\\')">👁️ Visualizar</button> '+(P.baixar_documento?'<a class="btn btn-ghost peq" href="/vdocs/api/documentos/'+d.id+'/baixar">⬇️ Baixar</a> ':'')+(P.usar_ia?'<button class="btn btn-ghost peq" onclick="S.iaEscopo={tipo:\\'documento\\',ref:\\''+d.id+'\\'};S.iaConv=\\'\\';ir(\\'ia\\')">🤖 Perguntar à IA</button> ':'')+
   (P.compartilhar_documento?'<button class="btn btn-ghost peq" onclick="compartilharDoc(\\''+d.id+'\\')">🔗 Compartilhar por link</button> ':'')+
   (d.legal_hold?'<span class="chip" style="background:#fde8e8">⚖️ retenção legal</span> ':'')+
   (P.gerir_configuracoes?'<button class="btn btn-ghost peq" onclick="alternarHold(\\''+d.id+'\\','+(d.legal_hold?'false':'true')+')">'+(d.legal_hold?'Remover retenção legal':'⚖️ Marcar retenção legal')+'</button>':'')+'</p>'+
   '<div class="card">'+
   (P.editar_metadados?'<label>Nome</label><input id="dd-nome" value="'+esc(d.nome)+'">'+
    '<label>Descrição</label><textarea id="dd-desc" rows="2">'+esc(d.descricao)+'</textarea>'+
    '<label>Tipo documental</label><select id="dd-tipo">'+S.tiposDoc.map(t=>'<option'+(t===d.tipo_documental?' selected':'')+'>'+t+'</option>').join('')+'</select>'+
    '<label>Tags (separadas por vírgula)</label><input id="dd-tags" value="'+esc(d.tags.join(', '))+'">'+
    '<label>Validade (para alertas de vencimento)</label><input id="dd-val" type="date" value="'+esc(d.validade)+'">'+
    '<p><button class="btn peq" onclick="salvarDoc(\\''+d.id+'\\')">Salvar</button> <span id="dd-out"></span></p>'
    :'<p>'+esc(d.descricao||'Sem descrição.')+'</p><p>Tipo: '+esc(d.tipo_documental)+' · Tags: '+d.tags.map(t=>'<span class="chip">'+esc(t)+'</span>').join(' ')+'</p>')+
   (P.mover_documento?'<label>Pasta</label><div style="display:flex;gap:8px">'+selPasta+'<button class="btn btn-ghost peq" onclick="moverDoc(\\''+d.id+'\\')">Mover</button></div>':'')+
   '</div>'+
   (proc?'<div class="card" style="margin-top:12px"><b>Processamento</b><p style="font-size:14px;margin:.4rem 0">'+proc+'</p>'+
    (P.criar_documento&&(st==='erro'||st==='ocr_pendente')?'<button class="btn btn-ghost peq" onclick="reprocDoc(\\''+d.id+'\\')">🔄 Reprocessar</button>':'')+'</div>':'')+
   '<div class="card" style="margin-top:12px"><b>Aprovações</b> '+
   (P.criar_workflow?'<button class="btn btn-ghost peq" onclick="enviarAprovacao(\\''+d.id+'\\')">📨 Enviar para aprovação</button>':'')+
   ((aps||[]).length?'<table><tr><th>Fluxo</th><th>Etapa</th><th>Status</th><th>Prazo</th><th>Enviado em</th></tr>'+
    aps.map(a=>'<tr><td>'+esc(a.workflow_nome)+'</td><td>'+esc(a.etapa)+' ('+(a.etapa_atual+1)+'/'+a.total+')</td><td>'+(a.status==='aprovado'?'✅ aprovado':a.status==='rejeitado'?'❌ rejeitado':a.status==='cancelado'?'⚪ cancelado':'⏳ em andamento')+'</td><td>'+(a.prazo_em?dt(a.prazo_em):'—')+'</td><td>'+dt(a.criado_em)+'</td></tr>').join('')+'</table>'
    :'<p class="sub" style="font-size:13px">Nenhuma aprovação para este documento.</p>')+'</div>'+
   '<div class="card" style="margin-top:12px"><b>Versões</b> '+
   (P.criar_documento?'<button class="btn btn-ghost peq" onclick="$(\\'dd-file\\').click()">⬆️ Nova versão</button><input id="dd-file" type="file" style="display:none" onchange="novaVersaoDoc(\\''+d.id+'\\',this.files[0])">':'')+
   '<table><tr><th>Versão</th><th>Arquivo</th><th>Tamanho</th><th>Enviada em</th><th>Comentário</th><th></th></tr>'+
   d.versoes.map(v=>'<tr'+(v.numero===d.versao_atual?' style="font-weight:700"':'')+'><td>v'+v.numero+(v.numero===d.versao_atual?' <span class="chip">vigente</span>':'')+'</td><td>'+esc(v.nome_arquivo)+'</td><td>'+kb(v.tamanho)+'</td><td>'+dt(v.criado_em)+'</td><td>'+esc(v.comentario)+'</td><td>'+
    '<button class="btn btn-ghost peq" title="Visualizar esta versão" onclick="visualizarDoc(\\''+d.id+'\\','+v.numero+')">👁️</button> '+
    (P.baixar_documento?'<a class="btn btn-ghost peq" href="/vdocs/api/documentos/'+d.id+'/baixar?versao='+v.numero+'">⬇️</a> ':'')+
    (P.criar_documento&&v.numero!==d.versao_atual?'<button class="btn btn-ghost peq" onclick="restaurarVersaoDoc(\\''+d.id+'\\','+v.numero+')">↩️ Tornar vigente</button>':'')+'</td></tr>').join('')+'</table></div>'+
   (acessos.length?'<div class="card" style="margin-top:12px"><b>Acessos recentes</b><table><tr><th>Quando</th><th>Ação</th><th>Versão</th><th>IP</th></tr>'+
    acessos.map(a=>'<tr><td>'+dt(a.criado_em)+'</td><td>'+esc(a.acao)+'</td><td>'+(a.versao||'—')+'</td><td>'+esc(a.ip)+'</td></tr>').join('')+'</table></div>':'');
  return false;
}
async function salvarDoc(id){try{
  await api('PATCH','/documentos/'+id,{nome:$('dd-nome').value,descricao:$('dd-desc').value,tipo_documental:$('dd-tipo').value,validade:$('dd-val').value,tags:$('dd-tags').value.split(',').map(t=>t.trim()).filter(Boolean)});
  $('dd-out').textContent='✅ salvo';}catch(e){$('dd-out').textContent='⚠️ '+e.message;}}
async function moverDoc(id){try{await api('POST','/documentos/'+id+'/mover',{folder_id:$('dd-pasta').value});abrirDoc(id);}catch(e){alert(e.message);}}
async function alternarHold(id,ativo){
  if(ativo&&!confirm('Marcar retenção legal? O documento ficará IMPOSSÍVEL de excluir até a trava ser removida.'))return;
  try{await api('POST','/documentos/'+id+'/retencao-legal',{ativo:ativo===true||ativo==='true'});abrirDoc(id);}catch(e){alert(e.message);}}
async function enviarAprovacao(id){
  try{
    const {modelos}=await api('GET','/workflows');
    if(!modelos.length){alert('Crie um modelo de fluxo primeiro (tela Aprovações).');return;}
    const nome=prompt('Qual fluxo usar?\\n'+modelos.map((w,i)=>(i+1)+'. '+w.nome).join('\\n')+'\\n\\nDigite o número:');
    const w=modelos[Number(nome)-1];if(!w)return;
    await api('POST','/documentos/'+id+'/aprovacao',{workflow_id:w.id});
    alert('Enviado para aprovação no fluxo "'+w.nome+'".');abrirDoc(id);
  }catch(e){alert(e.message);}
}
async function novaVersaoDoc(id,f){if(!f)return;try{
  const conteudo=await b64(f);const c=prompt('Comentário da versão (opcional):')||'';
  await api('POST','/documentos/'+id+'/versoes',{arquivo_nome:f.name,conteudo_base64:conteudo,comentario:c});abrirDoc(id);
 }catch(e){alert(e.message);}}
async function restaurarVersaoDoc(id,n){if(!confirm('Tornar a v'+n+' vigente? (vira uma nova versão)'))return;
  try{await api('POST','/documentos/'+id+'/versoes/'+n+'/restaurar');abrirDoc(id);}catch(e){alert(e.message);}}
async function reprocDoc(id){try{await api('POST','/documentos/'+id+'/reprocessar');alert('Reprocessamento na fila — atualize em instantes.');abrirDoc(id);}catch(e){alert(e.message);}}

// ---------------- Busca avançada (Fase 4) ----------------
S.buscaF={q:'',tipo:'',tag:'',pasta:'',de:'',ate:'',vencendo:''};
// JSON seguro p/ atributo onclick delimitado por aspas simples
function jsonAttr(o){return JSON.stringify(JSON.stringify(o)).replace(/</g,'\\\\u003c').replace(/'/g,'\\\\u0027');}
async function vBusca(rodar){
  if(!S.buscaCtx)S.buscaCtx=await api('GET','/busca/contexto');
  const C=S.buscaCtx,F=S.buscaF;
  const opt=(v,rot,sel)=>'<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(rot)+'</option>';
  $('corpo').innerHTML=
   '<div class="card">'+
   '<div style="display:flex;gap:8px;flex-wrap:wrap"><input id="bq" value="'+esc(F.q)+'" placeholder=\\'Ex.: contrato "manutenção predial" -rascunho · reajuste OR correção\\' style="flex:2;min-width:240px" onkeydown="if(event.key===\\'Enter\\')rodarBusca()">'+
   '<button class="btn peq" onclick="rodarBusca()">Buscar</button>'+
   '<button class="btn btn-ghost peq" onclick="salvarBuscaAtual()">💾 Salvar busca</button></div>'+
   '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'+
   '<select id="bf-tipo" style="max-width:170px"><option value="">— tipo —</option>'+C.tipos.map(t=>opt(t,t,F.tipo)).join('')+'</select>'+
   '<input id="bf-tag" value="'+esc(F.tag)+'" placeholder="tag" style="max-width:120px">'+
   '<select id="bf-pasta" style="max-width:180px"><option value="">— qualquer pasta —</option>'+C.pastas.map(p=>opt(p.id,'📁 '+p.nome,F.pasta)).join('')+'</select>'+
   '<label style="margin:0;display:flex;align-items:center;gap:4px;font-weight:400">de <input id="bf-de" type="date" value="'+esc(F.de)+'" style="width:auto"></label>'+
   '<label style="margin:0;display:flex;align-items:center;gap:4px;font-weight:400">até <input id="bf-ate" type="date" value="'+esc(F.ate)+'" style="width:auto"></label>'+
   '<label style="margin:0;display:flex;align-items:center;gap:4px;font-weight:400"><input id="bf-venc" type="checkbox"'+(F.vencendo?' checked':'')+' style="width:auto"> só vencendo (30d)</label></div>'+
   '<p class="sub" style="font-size:12px;margin:.5rem 0 0">Operadores: <code>"frase exata"</code> · <code>OR</code> · <code>-excluir</code>. Busca em nome + conteúdo extraído.</p></div>'+
   (C.salvas.length?'<div class="card" style="margin-top:10px"><b>Buscas salvas:</b> '+C.salvas.map(sv=>'<button class="btn btn-ghost peq" onclick=\\'usarSalva('+jsonAttr(sv)+')\\'>'+esc(sv.nome)+'</button> <a href="#" onclick="return delSalva(\\''+sv.id+'\\')" title="excluir">✕</a> ').join(' ')+'</div>':'')+
   (C.historico.length?'<div class="card" style="margin-top:10px"><b>Recentes:</b> '+C.historico.map(hh=>'<button class="btn btn-ghost peq" onclick=\\'usarSalva('+jsonAttr(hh)+')\\'>'+esc(hh.termo)+'</button>').join(' ')+'</div>':'')+
   '<div id="b-res" style="margin-top:10px">'+(rodar?'<p class="sub">Buscando…</p>':'')+'</div>';
  if(rodar)await execBusca();
}
function lerFiltros(){S.buscaF={q:$('bq').value,tipo:$('bf-tipo').value,tag:$('bf-tag').value,pasta:$('bf-pasta').value,de:$('bf-de').value,ate:$('bf-ate').value,vencendo:$('bf-venc').checked?'1':''};}
async function rodarBusca(){lerFiltros();S.buscaCtx=null;await vBusca(true);}
async function execBusca(){
  const F=S.buscaF;
  const qs=Object.entries(F).filter(([,v])=>v).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
  const {resultados}=await api('GET','/busca?'+(qs||'q='));
  const nomePasta=id=>{const p=(S.buscaCtx?S.buscaCtx.pastas:[]).find(x=>x.id===id);return p?'📁 '+p.nome:'🏠 Início';};
  $('b-res').innerHTML='<div class="card"><b>'+resultados.length+' resultado(s)</b><table><tr><th>Documento</th><th>Pasta</th><th>Tipo</th><th>Validade</th><th>Onde achou</th></tr>'+
   (resultados.length?resultados.map(d=>'<tr><td><a href="#" onclick="S.tela=\\'documentos\\';menu();abrirDoc(\\''+d.id+'\\');return false">'+esc(d.nome)+'</a>'+
    (d.trecho?'<br><span style="font-size:12px;color:var(--suave)">…'+esc(d.trecho)+'…</span>':'')+'</td>'+
    '<td>'+esc(nomePasta(d.folder_id))+'</td><td>'+esc(d.tipo_documental)+'</td>'+
    '<td>'+(d.validade?(d.vencido?'🔴 ':'')+d.validade.split('-').reverse().join('/'):'—')+'</td>'+
    '<td><span class="chip">'+esc(d.onde)+'</span></td></tr>').join(''):'<tr><td colspan="5" style="color:var(--suave)">Nada encontrado — tente outros termos ou menos filtros.</td></tr>')+'</table></div>';
}
async function salvarBuscaAtual(){
  lerFiltros();
  const nome=prompt('Nome desta busca salva:');if(!nome)return;
  try{await api('POST','/buscas-salvas',{nome,termo:S.buscaF.q,filtros:S.buscaF});S.buscaCtx=null;vBusca(false);}catch(e){alert(e.message);}
}
function usarSalva(json){const sv=JSON.parse(json);const f=sv.filtros||{};S.buscaF={q:sv.termo||f.q||'',tipo:f.tipo||'',tag:f.tag||'',pasta:f.pasta||'',de:f.de||'',ate:f.ate||'',vencendo:f.vencendo||''};vBusca(true);}
async function delSalva(id){if(!confirm('Excluir esta busca salva?'))return false;try{await api('DELETE','/buscas-salvas/'+id);S.buscaCtx=null;vBusca(false);}catch(e){alert(e.message);}return false;}

// ---------------- Compartilhamentos (Fase 7) ----------------
async function vShares(){
  const [{shares,solicitacoes},pastasR]=await Promise.all([api('GET','/compartilhamentos'),api('GET','/pastas').catch(()=>({pastas:[]}))]);
  S.pastas=pastasR.pastas||S.pastas||[];
  const nomeP=id=>{const p=(S.pastas||[]).find(x=>x.id===id);return p?'📁 '+p.nome:'🏠 Início';};
  $('corpo').innerHTML=
   '<div class="card"><b>Links ativos e histórico</b><table><tr><th>Alvo</th><th>Rótulo</th><th>Proteções</th><th>Expira</th><th>Acessos</th><th>Status</th><th></th></tr>'+
   (shares.length?shares.map(x=>'<tr><td>'+(x.alvo_tipo==='pasta'?'📁 ':'📄 ')+esc(x.alvo_nome)+'</td><td>'+esc(x.rotulo)+'</td>'+
    '<td>'+(x.com_senha?'🔒 senha ':'')+(x.permite_download?'⬇️ download':'👁 só visualização')+'</td>'+
    '<td>'+(x.expira_em?dt(x.expira_em):'—')+'</td><td><a href="#" onclick="return verAcessosShare(\\''+x.id+'\\')">'+x.acessos+'</a></td>'+
    '<td>'+(x.ativo?'🟢 ativo':(x.revogado_em?'⚪ revogado':'🔴 expirado'))+'</td>'+
    '<td>'+(x.ativo?'<button class="btn btn-ghost peq" onclick="revogarShare(\\''+x.id+'\\')">Revogar</button>':'')+'</td></tr>').join(''):'<tr><td colspan="7" style="color:var(--suave)">Nenhum link criado — compartilhe pelo detalhe do documento ou crie uma sala abaixo.</td></tr>')+'</table>'+
   '<p><b>Nova sala segura (compartilhar uma pasta):</b></p><div style="display:flex;gap:8px;flex-wrap:wrap">'+
   '<select id="sh-pasta" style="max-width:200px">'+(S.pastas||[]).map(p=>'<option value="'+p.id+'">📁 '+esc(p.nome)+'</option>').join('')+'</select>'+
   '<input id="sh-rotulo" placeholder="Rótulo (p/ quem é)" style="max-width:170px"><input id="sh-senha" placeholder="Senha (opcional)" style="max-width:140px">'+
   '<input id="sh-dias" type="number" placeholder="Dias" title="Expira em N dias (vazio = sem expiração)" style="max-width:80px">'+
   '<label style="margin:0;display:flex;align-items:center;gap:4px;font-weight:400"><input id="sh-dl" type="checkbox" checked style="width:auto"> permitir download</label>'+
   '<button class="btn peq" onclick="criarSala()">Criar link</button></div><div id="sh-out" style="margin-top:8px;font-size:13px"></div></div>'+
   '<div id="sh-acessos"></div>'+
   '<div class="card" style="margin-top:12px"><b>Solicitações de documentos</b> <span class="sub">(link p/ alguém de fora enviar arquivos)</span>'+
   '<table><tr><th>Título</th><th>Destino</th><th>Recebidos</th><th>Expira</th><th>Status</th><th></th></tr>'+
   (solicitacoes.length?solicitacoes.map(x=>'<tr><td>'+esc(x.titulo)+'</td><td>'+nomeP(x.folder_id)+'</td><td>'+x.recebidos+'/'+x.max_arquivos+'</td><td>'+dt(x.expira_em)+'</td>'+
    '<td>'+(x.ativa?'🟢 ativa':'⚪ encerrada')+'</td><td>'+(x.ativa?'<button class="btn btn-ghost peq" onclick="revogarReq(\\''+x.id+'\\')">Encerrar</button>':'')+'</td></tr>').join(''):'<tr><td colspan="6" style="color:var(--suave)">Nenhuma solicitação.</td></tr>')+'</table>'+
   '<p><b>Nova solicitação:</b></p><div style="display:flex;gap:8px;flex-wrap:wrap">'+
   '<input id="rq-titulo" placeholder="Ex.: Documentos do contrato X" style="flex:1;min-width:200px">'+
   '<select id="rq-pasta" style="max-width:260px"><option value="">🏠 Início dos documentos (sem pasta)</option>'+(S.pastas||[]).map(p=>'<option value="'+p.id+'">📁 '+esc(p.nome)+'</option>').join('')+'</select>'+
   '<input id="rq-dias" type="number" value="14" title="validade em dias" style="max-width:80px">'+
   '<button class="btn peq" onclick="criarReq()">Criar link</button></div>'+
   '<input id="rq-instr" placeholder="Instruções para quem vai enviar (opcional)" style="margin-top:8px"><div id="rq-out" style="margin-top:8px;font-size:13px"></div></div>';
}
function mostrarLink(el,link){$(el).innerHTML='✅ Link criado (envie a quem for acessar):<br><code style="word-break:break-all">'+esc(link)+'</code>';}
async function criarSala(){try{
  const r=await api('POST','/compartilhamentos',{alvo_tipo:'pasta',alvo_id:$('sh-pasta').value,senha:$('sh-senha').value,permite_download:$('sh-dl').checked,expira_dias:Number($('sh-dias').value)||0,rotulo:$('sh-rotulo').value});
  mostrarLink('sh-out',r.link);}catch(e){$('sh-out').innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}
async function revogarShare(id){if(!confirm('Revogar este link? Quem o tiver perde o acesso imediatamente.'))return;await api('DELETE','/compartilhamentos/'+id);vShares();}
async function verAcessosShare(id){
  const {acessos}=await api('GET','/compartilhamentos/'+id+'/acessos');
  $('sh-acessos').innerHTML='<div class="card" style="margin-top:12px"><b>Acessos do link</b><table><tr><th>Quando</th><th>Ação</th><th>IP</th></tr>'+
   (acessos.length?acessos.map(a=>'<tr><td>'+dt(a.criado_em)+'</td><td>'+esc(a.acao)+'</td><td>'+esc(a.ip)+'</td></tr>').join(''):'<tr><td colspan="3" style="color:var(--suave)">Nenhum acesso ainda.</td></tr>')+'</table></div>';
  return false;}
async function criarReq(){try{
  const r=await api('POST','/solicitacoes',{titulo:$('rq-titulo').value,instrucoes:$('rq-instr').value,folder_id:$('rq-pasta').value,expira_dias:Number($('rq-dias').value)||14});
  mostrarLink('rq-out',r.link);}catch(e){$('rq-out').innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}
async function revogarReq(id){if(!confirm('Encerrar esta solicitação?'))return;await api('DELETE','/solicitacoes/'+id);vShares();}
async function compartilharDoc(id){
  const senha=prompt('Senha do link (vazio = sem senha):')||'';
  const dias=Number(prompt('Expira em quantos dias? (vazio = sem expiração)')||0)||0;
  const dl=confirm('Permitir DOWNLOAD? (Cancelar = só visualização)');
  try{const r=await api('POST','/compartilhamentos',{alvo_tipo:'documento',alvo_id:id,senha,permite_download:dl,expira_dias:dias});
    prompt('Link criado — copie e envie:',r.link);}catch(e){alert(e.message);}
}

// ---------------- Integrações/API (Fase 9) ----------------
async function vInteg(){
  const d=await api('GET','/integracoes');
  const exemplo='# testar a chave\\ncurl -H "Authorization: Bearer vd_SUA_CHAVE" '+d.base_url+'/ping\\n\\n# listar/buscar documentos\\ncurl -H "Authorization: Bearer vd_SUA_CHAVE" "'+d.base_url+'/documentos?busca=contrato"\\n\\n# enviar documento (JSON com o arquivo em base64)\\ncurl -X POST -H "Authorization: Bearer vd_SUA_CHAVE" -H "Content-Type: application/json" -d \\'{"arquivo_nome":"nota.pdf","nome":"NF 123","conteudo_base64":"..."}\\' '+d.base_url+'/documentos\\n\\n# baixar\\ncurl -OJ -H "Authorization: Bearer vd_SUA_CHAVE" '+d.base_url+'/documentos/ID/baixar';
  $('corpo').innerHTML=
   (!d.api_disponivel?'<div class="aviso">⚠️ Seu plano atual não inclui API — as chaves só funcionam nos planos <b>Business</b> e <b>Enterprise</b>. Webhooks funcionam em todos os planos.</div>':'')+
   '<div class="card"><b>🔑 Chaves de API</b> <span class="sub" style="font-size:12px">(autenticam sistemas externos: ERP, RPA, Zapier/Make…)</span>'+
   '<table><tr><th>Nome</th><th>Prefixo</th><th>Último uso</th><th>Status</th><th></th></tr>'+
   (d.chaves.length?d.chaves.map(k=>'<tr><td>'+esc(k.nome)+'</td><td><code>'+esc(k.prefixo)+'…</code></td><td>'+dt(k.ultimo_uso)+'</td>'+
    '<td>'+(k.revogada_em?'⚪ revogada':'🟢 ativa')+'</td><td>'+(k.revogada_em?'':'<button class="btn btn-ghost peq" onclick="revogarChave(\\''+k.id+'\\')">Revogar</button>')+'</td></tr>').join(''):'<tr><td colspan="5" style="color:var(--suave)">Nenhuma chave.</td></tr>')+'</table>'+
   '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input id="ak-nome" placeholder="Nome da chave (ex.: ERP financeiro)" style="max-width:260px"><button class="btn peq" onclick="criarChave()">Criar chave</button></div><div id="ak-out" style="margin-top:8px;font-size:13px"></div></div>'+
   '<div class="card" style="margin-top:12px"><b>📡 Webhooks de eventos</b> <span class="sub" style="font-size:12px">(avisamos o SEU sistema quando algo acontece aqui)</span>'+
   '<table><tr><th>URL</th><th>Eventos</th><th></th></tr>'+
   (d.webhooks.length?d.webhooks.map(w=>'<tr><td style="word-break:break-all">'+esc(w.url)+'</td><td>'+w.eventos.map(e=>'<span class="chip">'+esc(e)+'</span>').join(' ')+'</td>'+
    '<td><button class="btn btn-ghost peq" onclick="delWebhook(\\''+w.id+'\\')">Excluir</button></td></tr>').join(''):'<tr><td colspan="3" style="color:var(--suave)">Nenhum webhook.</td></tr>')+'</table>'+
   '<div style="margin-top:8px"><input id="wh-url" placeholder="https://seu-sistema.com/webhook">'+
   '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;align-items:center">'+d.eventos.map(e=>'<label style="margin:0;display:flex;align-items:center;gap:4px;font-weight:400"><input type="checkbox" class="wh-ev" value="'+esc(e)+'" style="width:auto"> '+esc(e)+'</label>').join('')+
   '<button class="btn peq" onclick="criarWebhook()">Criar webhook</button></div><div id="wh-out" style="margin-top:8px;font-size:13px"></div></div>'+
   (d.entregas.length?'<div class="card" style="margin-top:12px"><b>Entregas recentes</b><table><tr><th>Quando</th><th>Evento</th><th>Status</th><th>Tentativas</th><th>Resposta</th></tr>'+
    d.entregas.map(e=>'<tr><td>'+dt(e.criado_em)+'</td><td>'+esc(e.evento)+'</td><td>'+(e.status==='entregue'?'✅':e.status==='erro'?'🔴':'⏳')+' '+esc(e.status)+'</td><td>'+e.tentativas+'</td><td>'+esc(e.resposta)+'</td></tr>').join('')+'</table></div>':'')+
   '<div class="card" style="margin-top:12px"><b>📖 Como usar a API</b>'+
   '<p style="font-size:13px">Base: <code>'+esc(d.base_url)+'</code> · autentique com <code>Authorization: Bearer vd_...</code> · limite de 120 requisições/min por chave · disponível nos planos com API.</p>'+
   '<pre style="background:var(--fundo);padding:10px;border-radius:8px;font-size:12px;overflow-x:auto">'+esc(exemplo)+'</pre>'+
   '<p style="font-size:13px">Webhooks: enviamos POST JSON com os headers <code>X-VDocs-Event</code> e <code>X-VDocs-Signature: sha256=HMAC-SHA256(corpo, seu_secret)</code> — valide a assinatura antes de confiar. Retentativas automáticas: 1, 5 e 30 minutos.</p></div>';
}
async function criarChave(){try{
  const r=await api('POST','/integracoes/chaves',{nome:$('ak-nome').value});
  $('ak-out').innerHTML='✅ Chave criada — <b>copie AGORA (não aparece de novo)</b>:<br><code style="word-break:break-all">'+esc(r.chave)+'</code>';
 }catch(e){$('ak-out').innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}
async function revogarChave(id){if(!confirm('Revogar esta chave? Integrações que a usam param imediatamente.'))return;await api('DELETE','/integracoes/chaves/'+id);vInteg();}
async function criarWebhook(){try{
  const eventos=[...document.querySelectorAll('.wh-ev:checked')].map(x=>x.value);
  const r=await api('POST','/integracoes/webhooks',{url:$('wh-url').value,eventos});
  $('wh-out').innerHTML='✅ Webhook criado — <b>guarde o secret (não aparece de novo)</b>:<br><code style="word-break:break-all">'+esc(r.secret)+'</code>';
 }catch(e){$('wh-out').innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}
async function delWebhook(id){if(!confirm('Excluir este webhook?'))return;await api('DELETE','/integracoes/webhooks/'+id);vInteg();}

// ---------------- Triagem + Entrada automática ----------------
const ROT_TIPO={nota_fiscal:'Nota fiscal',fatura:'Fatura',extrato_bancario:'Extrato bancário',contrato:'Contrato',recibo:'Recibo',proposta:'Proposta',politica_interna:'Política interna',rh:'RH',juridico:'Jurídico',financeiro:'Financeiro',administrativo:'Administrativo',projeto:'Projeto',outro:'Outro'};
const tamH=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
async function vTriagem(aba){
  const d=await api('GET','/entrada/triagem');
  S.tri=d;S.triAba=aba||S.triAba||'decidir';
  marcaHash('triagem',subDaTela('triagem'));
  const prop=d.itens.filter(i=>i.grupo==='propaganda'),dec=d.itens.filter(i=>i.grupo!=='propaganda');
  S.triLista=S.triAba==='propaganda'?prop:dec;
  const aba1=(k,icone,rot,n)=>'<button type="button" class="'+(S.triAba===k?'on':'')+'" onclick="vTriagem(\\''+k+'\\')">'+ic(icone)+' '+rot+' <b>'+n+'</b></button>';
  const abas='<div class="tg-tabs" role="tablist">'+aba1('decidir','inbox','Para decidir',dec.length)+aba1('propaganda','megaphone','Propaganda',prop.length)+aba1('remetentes','users','Remetentes de propaganda',d.remetentes_propaganda.length)+'</div>';
  if(S.triAba==='remetentes'){$('corpo').innerHTML=abas+remetentesHtml(d.remetentes_propaganda);return;}
  const L=S.triLista;
  const ehProp=S.triAba==='propaganda';
  if(!L.length){$('corpo').innerHTML=abas+'<div class="tg-vazio"><span class="tg-vazio-ico">'+ic('check')+'</span><h3>'+(ehProp?'Nenhuma propaganda para conferir':'Tudo decidido por aqui')+'</h3><p>'+(ehProp?'Catálogos, ofertas e newsletters que chegarem pelo WhatsApp ou Gmail aparecem aqui, separados dos documentos de verdade. Nada é apagado sozinho.':'Documentos que chegarem pelo WhatsApp ou Gmail cadastrados aparecem aqui para você decidir: <b>eliminar</b> ou <b>processar e categorizar</b>.')+'</p></div>';return;}
  const imp=L.filter(i=>i.sugestao).length;
  const P=S.me.permissoes;
  const barra='<div class="tg-bar"><div class="tg-bar-txt"><b>'+L.length+'</b> '+(ehProp?'propaganda(s) para conferir':'documento(s) esperando decisão')+(!ehProp&&imp?' <span>· '+imp+' reconhecido(s) como nota, fatura, extrato, contrato, recibo ou comprovante (no topo)</span>':'')+'</div>'+
   '<div class="tg-bar-acoes">'+
   (!ehProp&&P.usar_ia?'<button class="btn btn-ghost peq" title="A IA lê o texto e propõe um nome (ex.: Nota fiscal – Zara – 03/11/2026). Usa 1 consulta de IA do plano por lote de até 15." onclick="triNomear()">'+ic('spark')+' Nomear com IA</button>':'')+
   (!ehProp&&imp?'<button class="btn btn-ciano peq" onclick="triAceitarSugestoes()">'+ic('spark')+' Aceitar sugestões ('+imp+')</button>':'')+
   '<button class="btn btn-ghost peq" onclick="triMarcar(true)">Marcar todos</button>'+
   '<button class="btn btn-ghost peq" onclick="triMarcar(false)">Desmarcar</button>'+
   (ehProp?'<button class="btn peq" onclick="triLote(\\'eliminar\\')">'+ic('trash')+' Eliminar marcadas</button><button class="btn btn-ghost peq" onclick="triLote(\\'nao_propaganda\\')">Não é propaganda</button>'
          :'<button class="btn peq" onclick="triLote(\\'processar\\')">'+ic('check')+' Processar marcados</button><button class="btn btn-ghost peq" onclick="triLote(\\'eliminar\\')">'+ic('trash')+' Eliminar marcados</button>')+
   '</div><div id="tri-out" class="tg-out"></div></div>';
  const cards=L.map((i,n)=>{
    const sug=i.sugestao;
    const tipoSel=sug?sug.tipo:i.tipo_documental;
    const corClasse=sug?' dx-cat-'+esc(sug.tipo):(i.tipo_documental&&i.tipo_documental!=='outro'?' dx-cat-'+esc(i.tipo_documental):'');
    const canal=i.canal.tipo==='gmail'?'E-mail':'WhatsApp';
    const pill=sug?'<span class="dx-cat dx-cat-'+esc(sug.tipo)+'" title="Sugerido '+esc(sug.motivo)+'">'+ic('spark')+esc(sug.rotulo||ROT_TIPO[sug.tipo]||sug.tipo)+(sug.confianca==='alta'?'':' ?')+'</span>':'<span class="dx-cat">Sem sugestão</span>';
    const form=ehProp?'':'<div class="tg-form">'+
      '<label>Nome<input id="tri-nome'+n+'" value="'+esc(i.nome)+'" title="Nome do documento — editável; vale ao Processar"></label>'+
      '<label>Categoria<select id="tri-tipo'+n+'">'+d.tipos.map(t=>'<option value="'+t+'"'+(t===tipoSel?' selected':'')+'>'+esc(ROT_TIPO[t]||t)+'</option>').join('')+'</select></label>'+
      '<label>Pasta<select id="tri-pasta'+n+'"><option value="__auto">(pasta da categoria)</option><option value="__manter">(deixar em Entrada automática)</option><option value="">Raiz</option>'+d.pastas.map(p=>'<option value="'+p.id+'">'+esc(p.nome)+'</option>').join('')+'</select></label>'+
      '<label class="tg-chk" title="Marca para dar baixa na Stays com a data do check-in"><input type="checkbox" id="tri-baixa'+n+'"'+(sug&&sug.rotulo==='Comprovante'?' checked':'')+'> Pagamento de hospedagem (baixa na Stays)</label></div>';
    const acoes=ehProp
      ?'<button class="btn peq" onclick="triLote(\\'eliminar\\','+n+')">'+ic('trash')+' Eliminar</button><button class="btn btn-ghost peq" onclick="triLote(\\'nao_propaganda\\','+n+')">Não é propaganda</button><button class="btn btn-ghost peq" title="Tudo que vier deste remetente vai direto para Propaganda" onclick="triLote(\\'remetente_propaganda\\','+n+')">Sempre propaganda</button>'
      :'<button class="btn peq" onclick="triLote(\\'processar\\','+n+')">'+ic('check')+' Processar</button><button class="btn btn-ghost peq" onclick="triLote(\\'eliminar\\','+n+')">'+ic('trash')+' Eliminar</button><button class="btn btn-ghost peq" title="Este remetente só manda propaganda: tudo dele vai direto para a aba Propaganda" onclick="triLote(\\'remetente_propaganda\\','+n+')">Só propaganda</button>';
    return '<article class="tg-card'+corClasse+'" id="tri-l'+n+'">'+
      '<label class="tg-sel"><input type="checkbox" class="tri-ck" value="'+n+'" aria-label="Marcar"></label>'+
      '<div class="tg-main">'+
        '<div class="tg-top">'+pill+'<span class="tg-meta">'+canal+' · '+tamH(i.tamanho)+' · '+dt(i.recebido_em)+'</span></div>'+
        '<div class="tg-nomeln"><a class="tg-nome" href="#" title="Visualizar sem baixar" onclick="return visualizarDoc(\\''+i.document_id+'\\')">'+esc(i.nome)+'</a>'+(P.baixar_documento?'<a class="dx-ib" href="/vdocs/api/documentos/'+i.document_id+'/baixar" title="Baixar" aria-label="Baixar">'+ic('download')+'</a>':'')+'</div>'+
        '<div class="tg-de">'+esc(i.canal.rotulo||i.canal.identificador||'')+(i.remetente?' · de '+esc(i.remetente):'')+'</div>'+
        (i.trecho?'<p class="tg-trecho">'+esc(i.trecho.slice(0,200))+'…</p>':'')+
        form+
      '</div><div class="tg-acoes">'+acoes+'</div></article>';}).join('');
  $('corpo').innerHTML=abas+barra+'<div class="tg-grid">'+cards+'</div>';
}
async function triNomear(){
  const idx=[...document.querySelectorAll('.tri-ck:checked')].map(c=>+c.value);
  if(!idx.length){$('tri-out').innerHTML='<span style="color:var(--alerta)">Marque os documentos que a IA deve nomear.</span>';return;}
  if(idx.length>15){$('tri-out').innerHTML='<span style="color:var(--alerta)">Marque no máximo 15 por vez.</span>';return;}
  $('tri-out').textContent='✨ A IA está lendo os documentos…';
  try{
    const r=await api('POST','/entrada/triagem/nomear',{log_ids:idx.map(n=>S.triLista[n].log_id)});
    for(const sg of r.sugestoes){
      const n=S.triLista.findIndex(i=>i.log_id===sg.log_id);if(n<0)continue;
      $('tri-nome'+n).value=sg.nome;
      if(sg.tipo_documental&&!(S.triLista[n].sugestao))$('tri-tipo'+n).value=sg.tipo_documental;
    }
    const partes=[r.sugestoes.length+' nome(s) sugerido(s) — confira e clique em Processar'];
    if(r.sem_texto.length)partes.push(r.sem_texto.length+' sem texto legível (imagem ou PDF escaneado: a IA não lê)');
    if(r.sem_sugestao)partes.push(r.sem_sugestao+' que a IA não soube identificar');
    $('tri-out').innerHTML='✅ '+esc(partes.join(' · '));
  }catch(e){$('tri-out').innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}
function triMarcar(v){document.querySelectorAll('.tri-ck').forEach(c=>c.checked=v);}
function triAceitarSugestoes(){
  document.querySelectorAll('.tri-ck').forEach(c=>{c.checked=!!S.triLista[+c.value].sugestao;});
  triLote('processar');}
async function triLote(acao,so){
  const idx=so!=null?[so]:[...document.querySelectorAll('.tri-ck:checked')].map(c=>+c.value);
  if(!idx.length){$('tri-out').innerHTML='<span style="color:var(--alerta)">Marque ao menos um documento.</span>';return;}
  if(acao==='eliminar'&&!confirm('Eliminar '+idx.length+' documento(s)? Vão para a lixeira (dá para restaurar).'))return;
  const itens=idx.map(n=>{const i=S.triLista[n];
    if(acao==='eliminar'||acao==='nao_propaganda'||acao==='remetente_propaganda')return{log_id:i.log_id,acao};
    return{log_id:i.log_id,acao,tipo_documental:$('tri-tipo'+n).value,folder_id:$('tri-pasta'+n).value,baixa_stays:$('tri-baixa'+n).checked,nome:$('tri-nome'+n).value};});
  try{
    const r=await api('POST','/entrada/triagem',{itens});
    const falhas=r.resultado.filter(x=>!x.ok);
    await vTriagem();
    if(falhas.length&&$('tri-out'))$('tri-out').innerHTML='<span style="color:var(--alerta)">'+falhas.length+' item(ns) não aplicado(s): '+esc(falhas[0].erro)+'</span>';
  }catch(e){$('tri-out').innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}

async function vEntrada(){
  const d=await api('GET','/entrada');
  const r24=d.resumo.ultimas_24h||{};
  $('corpo').innerHTML=
   (!d.api_disponivel?'<div class="aviso">⚠️ A entrada automática usa a <b>chave de API</b>, que só existe nos planos <b>Business</b> e <b>Enterprise</b>.</div>':'')+
   '<div class="card"><b>📥 Contas que alimentam o Villela Docs</b> <span class="sub" style="font-size:12px">(todo documento recebido nelas cai na pasta “'+esc(d.pasta_padrao)+'” e espera a sua triagem)</span>'+
   '<p class="sub" style="font-size:13px">Últimas 24 h: <b>'+(r24.recebido||0)+'</b> recebido(s) · '+(r24.duplicado||0)+' repetido(s) · '+(r24.rejeitado||0)+' ignorado(s) · <a href="#" onclick="ir(\\'triagem\\');return false">'+d.resumo.pendentes_triagem+' esperando triagem</a></p>'+
   '<table><tr><th>Canal</th><th>Conta</th><th>Recebidos</th><th>Último</th><th>Status</th><th></th></tr>'+
   (d.canais.length?d.canais.map(c=>'<tr><td>'+(c.tipo==='gmail'?'✉️ Gmail':'💬 WhatsApp')+'</td><td>'+esc(c.rotulo||'')+' <code>'+esc(c.identificador)+'</code></td><td>'+c.total_recebidos+'</td><td>'+dt(c.ultimo_recebimento)+'</td>'+
    '<td>'+(c.ativo?'🟢 ligado':'⚪ desligado')+'</td><td style="white-space:nowrap"><button class="btn btn-ghost peq" onclick="entToggle(\\''+c.id+'\\','+(c.ativo?'false':'true')+')">'+(c.ativo?'Desligar':'Ligar')+'</button> <button class="btn btn-ghost peq" onclick="entExcluir(\\''+c.id+'\\')">Remover</button></td></tr>').join('')
    :'<tr><td colspan="6" style="color:var(--suave)">Nenhuma conta cadastrada.</td></tr>')+'</table>'+
   '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><select id="ent-tipo" style="max-width:140px"><option value="whatsapp">WhatsApp</option><option value="gmail">Gmail</option></select>'+
   '<input id="ent-ident" placeholder="5561999999999 ou voce@gmail.com" style="max-width:280px"><input id="ent-rot" placeholder="Rótulo (ex.: Pessoal)" style="max-width:180px">'+
   '<button class="btn peq" onclick="entAdd()">Cadastrar conta</button></div><div id="ent-out" style="margin-top:8px;font-size:13px"></div></div>'+
   '<div class="card" style="margin-top:12px"><label style="display:flex;gap:8px;align-items:center;font-weight:400;margin:0"><input type="checkbox" style="width:auto" '+(d.nomear_auto.ligado?'checked ':'')+'onchange="entNomearAuto(this.checked)"> ✨ Dar nome automático aos documentos importantes que chegam (a IA lê o texto — ou o remetente e o assunto do e-mail — e nomeia, ex.: <i>Nota fiscal – Zara – 03/11/2026</i>; o nome original fica na descrição). Usa consultas de IA do plano.</label>'+
   '<p class="sub" style="font-size:13px;margin:8px 0 0">'+(d.nomear_auto.ia_ativa?'':'⚠️ <b>IA indisponível no servidor</b> (sem chave) — nada será nomeado. ')+
   '<b>'+d.nomear_auto.aguardando+'</b> aguardando nome'+(d.nomear_auto.aguardando_sem_texto?' ('+d.nomear_auto.aguardando_sem_texto+' sem texto extraído, nomeados só pelo e-mail)':'')+' · <b>'+d.nomear_auto.nomeados+'</b> já nomeados'+(d.nomear_auto.sem_sugestao?' · '+d.nomear_auto.sem_sugestao+' que a IA não soube identificar':'')+
   (d.nomear_auto.ultima_rodada?' · última rodada '+dt(d.nomear_auto.ultima_rodada.em):' · ainda não rodou desde o último deploy (roda a cada 10 min)')+'</p>'+
   '<p style="margin:8px 0 0"><button class="btn peq" id="ent-nomear-agora" onclick="entNomearAgora()">✨ Nomear agora</button> <span id="ent-nomear-out" style="font-size:13px"></span></p></div>'+
   (d.aviso_triagem.disponivel?'<div class="card" style="margin-top:12px"><label style="display:flex;gap:8px;align-items:center;font-weight:400;margin:0"><input type="checkbox" style="width:auto" '+(d.aviso_triagem.ativo?'checked ':'')+'onchange="entAviso(this.checked)"> 📲 Avisar no WhatsApp, todo dia por volta das 9h, quando houver documentos esperando triagem (com link para abrir no celular)</label></div>':'')+
   remetentesHtml(d.remetentes_propaganda)+
   '<div class="card" style="margin-top:12px"><b>🕘 Chegadas recentes</b><table><tr><th>Quando</th><th>Arquivo</th><th>De</th><th>Desfecho</th></tr>'+
   (d.recentes.length?d.recentes.map(e=>'<tr><td>'+dt(e.criado_em)+'</td><td>'+esc(e.arquivo_nome)+'</td><td>'+esc(e.remetente||'')+'</td><td>'+
     (e.status==='recebido'?'✅ recebido'+(e.triagem==='pendente'?' · aguarda triagem':e.triagem==='processado'?' · processado':e.triagem==='eliminado'?' · eliminado':''):e.status==='duplicado'?'♻️ repetido':'🚫 '+esc(e.motivo||e.status))+'</td></tr>').join('')
    :'<tr><td colspan="4" style="color:var(--suave)">Nada recebido ainda.</td></tr>')+'</table></div>';
}
function remetentesHtml(lista){
  const pode=S.me.permissoes.configurar_integracoes;
  return '<div class="card" style="margin-top:12px"><b>📢 Remetentes que só mandam propaganda</b> <span class="sub" style="font-size:12px">(o que vier deles vai direto para a aba Propaganda; nada é apagado sozinho)</span>'+
   '<div style="margin:8px 0">'+(lista.length?lista.map(x=>'<span class="chip" style="margin:2px">'+esc(x.exibicao)+(pode?' <a href="#" title="Remover" onclick="return entDelRem(\\''+x.id+'\\')">✕</a>':'')+'</span>').join(' '):'<span class="sub">Nenhum cadastrado.</span>')+'</div>'+
   (pode?'<div style="display:flex;gap:8px;flex-wrap:wrap"><input id="ent-rem" placeholder="Nomes separados por vírgula (ex.: Leroy Merlin, Sebrae)" style="max-width:420px"><button class="btn peq" onclick="entAddRem()">Adicionar</button></div><div id="ent-rem-out" style="margin-top:6px;font-size:13px"></div>'
        :'<p class="sub" style="font-size:12px">Só quem tem a permissão de integrações cadastra remetentes; na lista de documentos, o botão "Só propaganda" também depende dela.</p>')+'</div>';}
const recarregaRem=()=>S.tela==='triagem'?vTriagem('remetentes'):vEntrada();
async function entAddRem(){try{await api('POST','/entrada/remetentes',{texto:$('ent-rem').value});recarregaRem();}catch(e){$('ent-rem-out').innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}
async function entDelRem(id){await api('DELETE','/entrada/remetentes/'+id);recarregaRem();return false;}
async function entNomearAgora(){
  const b=$('ent-nomear-agora'),o=$('ent-nomear-out');b.disabled=true;o.textContent='A IA está lendo os documentos…';
  try{const r=await api('POST','/entrada/nomear-agora',{});o.textContent=r.nomeados+' documento(s) nomeado(s).';setTimeout(vEntrada,1200);}
  catch(e){b.disabled=false;o.innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}
async function entNomearAuto(ativo){try{await api('POST','/entrada/nomear-auto',{ativo});}catch(e){alert(e.message);vEntrada();}}
async function entAviso(ativo){try{await api('POST','/entrada/aviso',{ativo});}catch(e){alert(e.message);vEntrada();}}
async function entAdd(){try{
  await api('POST','/entrada/canais',{tipo:$('ent-tipo').value,identificador:$('ent-ident').value,rotulo:$('ent-rot').value});vEntrada();
 }catch(e){$('ent-out').innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}
async function entToggle(id,ativo){await api('PATCH','/entrada/canais/'+id,{ativo});vEntrada();}
async function entExcluir(id){if(!confirm('Remover esta conta? Os documentos já recebidos continuam aqui.'))return;await api('DELETE','/entrada/canais/'+id);vEntrada();}

// ---------------- Aprovações (Fase 6) ----------------
async function vWorkflows(){
  const P=S.me.permissoes;
  const [{pendentes,minhas},{modelos}]=await Promise.all([api('GET','/aprovacoes'),api('GET','/workflows')]);
  S.wfModelos=modelos;
  const linha=(a,acoes)=>'<tr'+(a.atrasada?' style="background:#fef7e0"':'')+'><td><a href="#" onclick="S.tela=\\'documentos\\';menu();abrirDoc(\\''+a.document_id+'\\');return false">'+esc(a.documento)+'</a> <span class="chip">v'+a.versao+'</span></td>'+
   '<td>'+esc(a.workflow_nome)+'</td><td>'+esc(a.etapa_nome)+' ('+(a.etapa_atual+1)+'/'+a.total_etapas+')</td>'+
   '<td>'+(a.prazo_em?(a.atrasada?'🔴 ':'')+dt(a.prazo_em):'—')+'</td><td>'+esc(a.status)+'</td><td>'+acoes+'</td></tr>';
  $('corpo').innerHTML=
   '<div class="card"><b>Pendentes para você ('+pendentes.length+')</b><table><tr><th>Documento</th><th>Fluxo</th><th>Etapa</th><th>Prazo</th><th>Status</th><th></th></tr>'+
   (pendentes.length?pendentes.map(a=>linha(a,(P.aprovar_documento?'<button class="btn peq" onclick="decidirWf(\\''+a.id+'\\',\\'aprovar\\')">✔ Aprovar</button> <button class="btn btn-ghost peq" onclick="decidirWf(\\''+a.id+'\\',\\'rejeitar\\')">✖ Rejeitar</button>':'<span class="sub">sem permissão de aprovar</span>'))).join(''):'<tr><td colspan="6" style="color:var(--suave)">Nada pendente para você. 🎉</td></tr>')+'</table></div>'+
   '<div class="card" style="margin-top:12px"><b>Minhas solicitações</b><table><tr><th>Documento</th><th>Fluxo</th><th>Etapa</th><th>Prazo</th><th>Status</th><th></th></tr>'+
   (minhas.length?minhas.map(a=>linha(a,(a.status==='em_andamento'&&P.criar_workflow?'<button class="btn btn-ghost peq" onclick="cancelarWf(\\''+a.id+'\\')">Cancelar</button>':'')+' <button class="btn btn-ghost peq" onclick="verWf(\\''+a.id+'\\')">Histórico</button>')).join(''):'<tr><td colspan="6" style="color:var(--suave)">Você ainda não enviou documentos para aprovação.</td></tr>')+'</table></div>'+
   '<div id="wf-hist"></div>'+
   (P.criar_workflow?'<div class="card" style="margin-top:12px"><b>Modelos de fluxo</b> '+
    (modelos.length?'<table><tr><th>Nome</th><th>Etapas</th></tr>'+modelos.map(w=>'<tr><td>'+esc(w.nome)+'</td><td>'+w.etapas.map((e,i)=>(i+1)+'. '+esc(e.nome)+' ('+e.aprovadores.length+' aprovador(es)'+(e.prazo_dias?', '+e.prazo_dias+'d':'')+')').join(' → ')+'</td></tr>').join('')+'</table>':'<p class="sub">Nenhum modelo ainda.</p>')+
    '<p><b>Novo modelo:</b></p><label>Nome</label><input id="wf-nome" placeholder="Ex.: Aprovação de contratos">'+
    '<label>Etapas (uma por linha: nome | e-mails dos aprovadores separados por vírgula | prazo em dias)</label>'+
    '<textarea id="wf-etapas" rows="3" placeholder="Revisão jurídica | maria@empresa.com | 3&#10;Assinatura diretoria | joao@empresa.com, ana@empresa.com | 5"></textarea>'+
    '<p><button class="btn peq" onclick="criarModeloWf()">Criar modelo</button> <span id="wf-out"></span></p></div>':'');
}
async function decidirWf(id,decisao){
  let justificativa='';
  if(decisao==='rejeitar'){justificativa=prompt('Justificativa da rejeição (obrigatória):')||'';if(!justificativa)return;}
  else if(!confirm('Confirmar aprovação desta etapa?'))return;
  try{await api('POST','/aprovacoes/'+id+'/decidir',{decisao,justificativa});vWorkflows();}catch(e){alert(e.message);}
}
async function cancelarWf(id){if(!confirm('Cancelar esta aprovação?'))return;try{await api('POST','/aprovacoes/'+id+'/cancelar');vWorkflows();}catch(e){alert(e.message);}}
async function verWf(id){
  const {aprovacao:a}=await api('GET','/aprovacoes/'+id);
  document.getElementById('wf-hist').innerHTML='<div class="card" style="margin-top:12px"><b>Histórico — '+esc(a.workflow_nome)+'</b> <span class="chip">'+esc(a.status)+'</span>'+
   '<table><tr><th>Quando</th><th>Etapa</th><th>Decisão</th><th>Justificativa</th></tr>'+
   (a.decisoes.length?a.decisoes.map(d=>'<tr><td>'+dt(d.criado_em)+'</td><td>'+esc((a.etapas[d.etapa]||{}).nome||String(d.etapa+1))+'</td><td>'+(d.decisao==='aprovar'?'✔ aprovado':'✖ rejeitado')+'</td><td>'+esc(d.justificativa)+'</td></tr>').join(''):'<tr><td colspan="4" style="color:var(--suave)">Sem decisões ainda.</td></tr>')+'</table></div>';
}
async function criarModeloWf(){
  try{
    const nome=$('wf-nome').value;
    const linhas=$('wf-etapas').value.split('\\n').map(l=>l.trim()).filter(Boolean);
    if(!linhas.length)throw new Error('Descreva as etapas.');
    let mapa={};
    try{const d=await api('GET','/usuarios');for(const u of d.usuarios)if(u.status==='ativo')mapa[u.email.toLowerCase()]=u.user_id;}
    catch(_){throw new Error('Criar modelos exige a permissão de gerenciar usuários (para localizar os aprovadores por e-mail).');}
    const etapas=linhas.map(l=>{const [n,emails,prazo]=l.split('|').map(x=>(x||'').trim());
      const aprovadores=(emails||'').split(',').map(e=>mapa[e.trim().toLowerCase()]).filter(Boolean);
      if(!aprovadores.length)throw new Error('Etapa "'+n+'": nenhum e-mail corresponde a um usuário ativo.');
      return {nome:n,aprovadores,prazo_dias:Number(prazo)||0};});
    await api('POST','/workflows',{nome,etapas});
    $('wf-out').textContent='✅ modelo criado';vWorkflows();
  }catch(e){$('wf-out').textContent='⚠️ '+e.message;}
}

// ---------------- IA documental (Fase 5) ----------------
S.iaConv='';S.iaEscopo={tipo:'base',ref:''};
async function vIA(){
  const [{ativo,conversas},pastasR]=await Promise.all([api('GET','/ia/conversas'),api('GET','/pastas').catch(()=>({pastas:[]}))]);
  S.iaPastas=pastasR.pastas||[];
  const E=S.iaEscopo;
  $('corpo').innerHTML=
   (!ativo?'<div class="erro">A IA está indisponível no momento (servidor sem chave de IA). Fale com o suporte.</div>':'')+
   '<div class="card"><b>Escopo da conversa:</b> '+
   '<select id="ia-tipo" onchange="S.iaEscopo={tipo:this.value,ref:\\'\\'};vIA()" style="width:auto">'+
   ['base','pasta'].map(t=>'<option value="'+t+'"'+(E.tipo===t?' selected':'')+'>'+(t==='base'?'📚 Todos os documentos':'📁 Uma pasta')+'</option>').join('')+
   (E.tipo==='documento'?'<option value="documento" selected>📄 Um documento</option>':'')+'</select> '+
   (E.tipo==='pasta'?'<select id="ia-ref" onchange="S.iaEscopo.ref=this.value" style="width:auto">'+S.iaPastas.map(p=>'<option value="'+p.id+'"'+(E.ref===p.id?' selected':'')+'>📁 '+esc(p.nome)+'</option>').join('')+'</select>':'')+
   (E.tipo==='documento'?'<span class="chip">documento selecionado</span>':'')+
   '<p class="sub" style="font-size:12px;margin:.4rem 0 0">A IA responde APENAS com base nos seus documentos e cita as fontes. Quando não encontra, ela diz. Novas conversas usam o escopo escolhido.</p></div>'+
   (conversas.length?'<div class="card" style="margin-top:10px"><b>Conversas:</b> <button class="btn btn-ghost peq" onclick="S.iaConv=\\'\\';vIA()">+ nova</button> '+
    conversas.map(c=>'<button class="btn '+(S.iaConv===c.id?'':'btn-ghost ')+'peq" onclick="abrirConv(\\''+c.id+'\\')">'+esc(c.titulo||'(sem título)')+'</button> <a href="#" onclick="return delConv(\\''+c.id+'\\')" title="excluir">✕</a> ').join(' ')+'</div>':'')+
   '<div id="ia-chat" style="margin-top:10px"></div>'+
   '<div class="card" style="margin-top:10px;display:flex;gap:8px"><input id="ia-q" placeholder="Pergunte algo sobre os documentos… (ex.: quais contratos vencem este ano?)" style="flex:1" onkeydown="if(event.key===\\'Enter\\')perguntarIA()">'+
   '<button class="btn peq" id="ia-btn" onclick="perguntarIA()"'+(!ativo?' disabled':'')+'>Perguntar</button></div>';
  if(S.iaConv)await pintarConv();
}
function fonteChips(fontes){return (fontes||[]).map((f,i)=>'<button class="btn btn-ghost peq" title="'+esc((f.trecho||'').slice(0,200))+'" onclick="S.tela=\\'documentos\\';menu();abrirDoc(\\''+f.document_id+'\\')">['+(i+1)+'] 📄 '+esc(f.nome)+'</button>').join(' ');}
function balao(m){
  const eu=m.papel==='usuario';
  return '<div style="display:flex;'+(eu?'justify-content:flex-end':'')+'"><div class="card" style="max-width:80%;margin:4px 0;'+(eu?'background:var(--indigo2);color:#fff':'')+'">'+
   esc(m.conteudo).replace(/\\n/g,'<br>')+
   (!eu&&m.nao_encontrado?'<div class="aviso" style="margin:.5rem 0 0">ℹ️ A informação não foi encontrada nos documentos.</div>':'')+
   (!eu&&(m.fontes||[]).length?'<div style="margin-top:.5rem;font-size:12px"><b>Fontes:</b> '+fonteChips(m.fontes)+'</div>':'')+
   (!eu&&m.nivel_confianca?'<div style="margin-top:.3rem;font-size:11px;color:'+(eu?'#c6d0e2':'var(--suave)')+'">confiança: '+esc(m.nivel_confianca)+' · <a href="#" onclick="return fbIA(\\''+m.id+'\\',\\'util\\')">👍 útil</a> · <a href="#" onclick="return fbIA(\\''+m.id+'\\',\\'incorreta\\')">👎 incorreta</a> · <a href="#" onclick="return fbIA(\\''+m.id+'\\',\\'sensivel\\')">⚠️ sensível</a></div>':'')+
   '</div></div>';
}
async function pintarConv(){
  const {conversa}=await api('GET','/ia/conversas/'+S.iaConv);
  $('ia-chat').innerHTML='<div class="card">'+conversa.mensagens.map(balao).join('')+'</div>';
}
async function abrirConv(id){S.iaConv=id;await vIA();}
async function delConv(id){if(!confirm('Excluir esta conversa?'))return false;await api('DELETE','/ia/conversas/'+id);if(S.iaConv===id)S.iaConv='';vIA();return false;}
async function perguntarIA(){
  const q=$('ia-q').value.trim();if(!q)return;
  $('ia-btn').disabled=true;$('ia-btn').textContent='Pensando…';
  try{
    const r=await api('POST','/ia/perguntar',{conversation_id:S.iaConv||undefined,escopo_tipo:S.iaEscopo.tipo,escopo_ref:S.iaEscopo.ref,pergunta:q});
    S.iaConv=r.conversation_id;$('ia-q').value='';await vIA();
  }catch(e){alert(e.message);$('ia-btn').disabled=false;$('ia-btn').textContent='Perguntar';}
}
async function fbIA(id,tipo){try{await api('POST','/ia/mensagens/'+id+'/feedback',{tipo});alert('Feedback registrado — obrigado!');}catch(e){alert(e.message);}return false;}

async function vRedigir(){
  const [{ativo,tipos,rascunhos},docsR]=await Promise.all([api('GET','/ia/redacoes'),api('GET','/documentos?limite=200').catch(()=>({documentos:[]}))]);
  S.redDocs=S.redDocs||[];
  const docs=docsR.documentos||[];
  $('corpo').innerHTML=
   (!ativo?'<div class="erro">A IA está indisponível no momento (servidor sem chave de IA). Fale com o suporte.</div>':'')+
   '<div class="card"><b>✍️ Redigir com IA</b>'+
   '<p class="sub" style="font-size:12px;margin:.3rem 0 .6rem">Diferente do chat: aqui os documentos escolhidos entram <b>por inteiro</b> no contexto, porque redigir exige ler o documento todo — não um trecho. O resultado nasce como <b>rascunho</b> e só uma pessoa transforma em documento oficial.</p>'+
   '<label>Documentos que servem de base (segure Ctrl para escolher vários)</label>'+
   '<select id="red-docs" multiple size="7" style="width:100%">'+docs.map(d=>'<option value="'+d.id+'">'+esc(d.nome)+(d.tipo_documental?' ('+esc(d.tipo_documental)+')':'')+'</option>').join('')+'</select>'+
   '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'+
   '<label style="flex:1;min-width:180px">Tipo <select id="red-tipo">'+(tipos||[]).map(x=>'<option value="'+x+'">'+x.replace(/-/g,' ')+'</option>').join('')+'</select></label>'+
   '<label style="flex:2;min-width:220px">Título (opcional) <input id="red-tit" maxlength="200"></label></div>'+
   '<label>O que a IA deve redigir <textarea id="red-inst" rows="3" placeholder="ex.: um comunicado interno resumindo as obrigações de renovação dos contratos escolhidos, com as datas"></textarea></label>'+
   '<button class="btn peq" id="red-btn" onclick="redigirIA()"'+(!ativo?' disabled':'')+'>✍️ Redigir</button></div>'+
   '<div id="red-saida"></div>'+
   (rascunhos.length?'<div class="card" style="margin-top:10px"><b>Rascunhos</b>'+
     '<table style="width:100%;margin-top:6px"><thead><tr><th>Título</th><th>Tipo</th><th>Quando</th><th></th></tr></thead><tbody>'+
     rascunhos.map(x=>'<tr><td>'+esc(x.titulo)+(x.truncado?' <span class="chip" title="algum documento não coube inteiro no contexto">⚠️ truncado</span>':'')+'</td><td>'+esc(x.tipo||'—')+'</td><td>'+(x.criado_em||'').slice(0,10).split('-').reverse().join('/')+'</td>'+
     '<td><button class="btn btn-ghost peq" onclick="verRascunho(\\''+x.id+'\\')">Ler</button> <a href="#" onclick="return delRascunho(\\''+x.id+'\\')" title="excluir">✕</a></td></tr>').join('')+
     '</tbody></table></div>':'');
}
async function redigirIA(){
  const sel=[...($('red-docs').selectedOptions||[])].map(o=>o.value);
  if(!sel.length){alert('Escolha ao menos um documento para servir de base.');return;}
  const inst=$('red-inst').value.trim();
  if(!inst){alert('Diga o que a IA deve redigir.');return;}
  $('red-btn').disabled=true;$('red-btn').textContent='Redigindo…';
  try{
    const r=await api('POST','/ia/redigir',{documentos:sel,tipo:$('red-tipo').value,instrucao:inst,titulo:$('red-tit').value});
    await vRedigir();
    mostrarRascunho(r.rascunho);
  }catch(e){alert(e.message);$('red-btn').disabled=false;$('red-btn').textContent='✍️ Redigir';}
}
function mostrarRascunho(x){
  $('red-saida').innerHTML='<div class="card" style="margin-top:10px"><b>'+esc(x.titulo)+'</b>'+
   (x.truncado?'<div class="aviso" style="margin:.4rem 0">⚠️ Algum documento não coube inteiro no contexto — confira o que a IA declarou nas lacunas.</div>':'')+
   '<div style="white-space:pre-wrap;background:var(--fundo2,#f7f8fa);border-radius:8px;padding:12px;margin-top:8px;max-height:60vh;overflow:auto;font-size:14px;line-height:1.6">'+esc(x.conteudo||'')+'</div>'+
   ((x.fontes||[]).length?'<div style="margin-top:.5rem;font-size:12px"><b>Baseado em:</b> '+x.fontes.map(f=>'<span class="chip">📄 '+esc(f.nome)+'</span>').join(' ')+'</div>':'')+
   '</div>';
  $('red-saida').scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function verRascunho(id){const{rascunho}=await api('GET','/ia/redacoes/'+id);mostrarRascunho(rascunho);}
async function delRascunho(id){if(!confirm('Excluir este rascunho?'))return false;await api('DELETE','/ia/redacoes/'+id);vRedigir();return false;}
async function vUsuarios(){
  const d=await api('GET','/usuarios');const papeis=S.me.papeis_embutidos;
  const opts=sel=>Object.entries(papeis).filter(([k])=>k!=='dono').map(([k,n])=>'<option value="'+k+'"'+(k===sel?' selected':'')+'>'+esc(n)+'</option>').join('');
  $('corpo').innerHTML=
   '<div class="card"><b>Convidar por e-mail</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'+
   '<input id="cv-email" placeholder="email@empresa.com" style="flex:2;min-width:200px"><select id="cv-papel" style="flex:1;min-width:150px">'+opts('usuario')+'</select>'+
   '<button class="btn peq" onclick="convidar()">Convidar</button></div><div id="cv-out" style="margin-top:8px;font-size:13px"></div></div>'+
   '<div class="card" style="margin-top:14px"><b>Equipe</b><table><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th>Último acesso</th><th></th></tr>'+
   d.usuarios.map(u=>'<tr><td>'+esc(u.nome)+'</td><td>'+esc(u.email)+'</td><td>'+(u.papel==='dono'?'<span class="chip">Dono da conta</span>':'<select onchange="mudar(\\''+u.vinculo_id+'\\',{papel:this.value})">'+opts(u.papel)+'</select>')+'</td>'+
    '<td>'+esc(u.status)+'</td><td>'+dt(u.ultimo_login)+'</td>'+
    '<td>'+(u.papel==='dono'?'':(u.status==='ativo'?'<button class="btn btn-ghost peq" onclick="mudar(\\''+u.vinculo_id+'\\',{status:\\'suspenso\\'})">Suspender</button>':'<button class="btn peq" onclick="mudar(\\''+u.vinculo_id+'\\',{status:\\'ativo\\'})">Reativar</button>')+' '+(u.papel==='dono'?'':'<button class="btn btn-ghost peq" onclick="mudar(\\''+u.vinculo_id+'\\',{status:\\'removido\\'})">Remover</button>'))+'</td></tr>').join('')+'</table></div>'+
   (d.convites.length?'<div class="card" style="margin-top:14px"><b>Convites pendentes</b><table><tr><th>E-mail</th><th>Papel</th><th>Expira</th><th></th></tr>'+
    d.convites.map(c=>'<tr><td>'+esc(c.email)+'</td><td>'+esc(c.papel)+'</td><td>'+dt(c.expira_em)+'</td><td><button class="btn btn-ghost peq" onclick="revogar(\\''+c.id+'\\')">Revogar</button></td></tr>').join('')+'</table></div>':'');
}
async function convidar(){try{
  const d=await api('POST','/convites',{email:$('cv-email').value,papel:$('cv-papel').value});
  $('cv-out').innerHTML='✅ Convite criado. Envie este link para <b>'+esc(d.convite.email)+'</b> (vale 7 dias):<br><code style="word-break:break-all">'+esc(d.link)+'</code>';
 }catch(e){$('cv-out').innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}
async function mudar(id,campos){try{await api('PATCH','/usuarios/'+id,campos);vUsuarios();}catch(e){alert(e.message);}}
async function revogar(id){try{await api('DELETE','/convites/'+id);vUsuarios();}catch(e){alert(e.message);}}
async function vAudit(){
  const d=await api('GET','/auditoria?limite=200');
  $('corpo').innerHTML='<div class="card"><table><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th><th>IP</th></tr>'+
   d.eventos.map(a=>'<tr><td>'+dt(a.criado_em)+'</td><td>'+esc(a.usuario_nome)+'</td><td>'+esc(a.acao)+'</td><td>'+esc(a.entidade)+(a.entidade_id?' <span class="chip">'+esc(a.entidade_id)+'</span>':'')+'</td><td>'+esc(a.ip)+'</td></tr>').join('')+'</table></div>';
}
async function vPlano(){
  const d=await api('GET','/uso');const L=(d.plano&&d.plano.limites)||{};
  const linha=(rot,met,lim)=>{const v=Number(d.uso[met]||0);return '<tr><td>'+rot+'</td><td>'+v.toLocaleString('pt-BR')+'</td><td>'+(lim?Number(lim).toLocaleString('pt-BR'):'ilimitado')+'</td></tr>';};
  $('corpo').innerHTML=
   '<div class="card"><b>Plano atual:</b> '+esc(d.plano?d.plano.nome:'—')+' <span class="chip">'+esc(d.plano?d.plano.subscription.status:'')+'</span>'+
   '<table style="margin-top:10px"><tr><th>Métrica</th><th>Uso no mês</th><th>Limite</th></tr>'+
   linha('Usuários ativos','usuarios',L.usuarios)+linha('Documentos','documentos',L.documentos)+
   linha('Armazenamento (MB)','armazenamento_mb',L.armazenamento_mb)+linha('Páginas OCR','ocr_paginas',L.ocr_paginas_mes)+
   linha('Consultas de IA','ia_consultas',L.ia_consultas_mes)+'</table></div>'+
   '<div id="pl-billing" style="margin-top:12px"><p class="sub">Carregando cobrança…</p></div>';
  if(S.me.permissoes.administrar_cobranca)vBilling().catch(e=>$('pl-billing').innerHTML='<div class="erro">'+esc(e.message)+'</div>');
  else $('pl-billing').innerHTML='<div class="aviso">Assinatura e cobrança: fale com o Dono da conta.</div>';
}
async function vBilling(){
  const b=await api('GET','/billing');
  const brl=c=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const atual=b.plano||{};
  $('pl-billing').innerHTML='<div class="card"><b>💳 Assinatura</b>'+
   (atual.recorrencia_mp?'<p>Cobrança recorrente ATIVA no Mercado Pago ('+esc(atual.nome)+', '+brl(atual.preco_centavos)+'/mês). <button class="btn btn-ghost peq" onclick="cancelarAssinatura()">Cancelar assinatura</button></p>'
    :atual.status==='trial'?'<p>Você está no período de teste. Assine para continuar depois do trial:</p>':'<p>Escolha um plano para assinar:</p>')+
   (!atual.recorrencia_mp?(b.online_disponivel
     ?'<div style="display:flex;gap:8px;flex-wrap:wrap">'+b.planos.map(p=>'<button class="btn '+(p.slug===atual.slug?'':'btn-ghost ')+'peq" onclick="assinarPlano(\\''+p.slug+'\\')">'+esc(p.nome)+' — '+brl(p.preco_centavos)+'/mês</button>').join('')+'</div><p class="sub" style="font-size:12px">Você será levado ao Mercado Pago para autorizar a cobrança mensal. Cancele quando quiser.</p>'
     :'<div class="aviso">Pagamento online em configuração — fale com a Villela Docs pelo formulário da <a href="/vdocs#demo" target="_blank">página inicial</a> para ativar seu plano.</div>'):'')+
   (b.pagamentos.length?'<b>Pagamentos</b><table><tr><th>Quando</th><th>Valor</th><th>Status</th></tr>'+b.pagamentos.map(p=>'<tr><td>'+dt(p.criado_em)+'</td><td>'+brl(p.valor_centavos)+'</td><td>'+esc(p.status)+'</td></tr>').join('')+'</table>':'')+
   '</div>';
}
async function assinarPlano(slug){
  if(!confirm('Assinar o plano '+slug+'? Você será redirecionado ao Mercado Pago para autorizar a cobrança mensal.'))return;
  try{const r=await api('POST','/billing/assinar',{plano_slug:slug});location.href=r.link;}catch(e){alert(e.message);}
}
async function cancelarAssinatura(){
  if(!confirm('Cancelar a assinatura? Sua conta perderá o acesso pago.'))return;
  try{await api('POST','/billing/cancelar');alert('Assinatura cancelada.');vPlano();}catch(e){alert(e.message);}
}
async function vConfig(){
  const d=await api('GET','/config');const t=d.tenant,st=d.settings;
  $('corpo').innerHTML='<div class="card">'+
   '<label>Nome da empresa</label><input id="cf-nome" value="'+esc(t.nome)+'">'+
   '<label>CNPJ</label><input id="cf-cnpj" value="'+esc(t.cnpj)+'">'+
   '<label>E-mail de contato</label><input id="cf-email" value="'+esc(t.email_contato)+'">'+
   '<label>Telefone</label><input id="cf-tel" value="'+esc(t.telefone)+'">'+
   '<label>Retenção padrão (dias; 0 = sem descarte automático)</label><input id="cf-ret" type="number" value="'+esc(st.retencao_padrao_dias||'0')+'">'+
   '<label>Lixeira: excluir definitivamente após (dias)</label><input id="cf-lix" type="number" value="'+esc(st.retencao_lixeira_dias||'30')+'">'+
   '<p><button class="btn" onclick="salvarCfg()">Salvar</button> <span id="cf-out"></span></p></div>'+
   '<div class="card" style="margin-top:14px"><b>🔐 Verificação em duas etapas (2FA)</b> <span class="chip">'+(S.me.totp_ativo?'ativa':'inativa')+'</span>'+
   '<p class="sub" style="font-size:13px">Protege o SEU login com um código do app autenticador (Google Authenticator, 1Password…).</p>'+
   '<div id="tfa-area">'+(S.me.totp_ativo
     ?'<label>Código atual (ou de recuperação) p/ desativar</label><div style="display:flex;gap:8px"><input id="tfa-cod" style="max-width:160px"><button class="btn btn-ghost peq" onclick="desativar2fa()">Desativar 2FA</button></div>'
     :'<button class="btn peq" onclick="iniciar2fa()">Ativar 2FA</button>')+'</div></div>'+
   '<div class="card" style="margin-top:14px"><b>🤖 IA da empresa</b> <span id="ia-chip" class="chip"></span><div id="ia-fonte"><p class="sub">Carregando…</p></div></div>'+
   (S.me.permissoes.exportar_dados?'<div class="card" style="margin-top:14px"><b>📦 Exportar todos os dados (LGPD)</b>'+
    '<p class="sub" style="font-size:13px">Baixa um ZIP com todos os dados da empresa (cadastros, documentos, auditoria) e os arquivos vigentes.</p>'+
    '<a class="btn btn-ghost peq" href="/vdocs/api/exportacao">⬇️ Baixar exportação completa</a></div>':'')+
   '<div class="card" style="margin-top:14px"><b>Identificador (slug):</b> <code>'+esc(t.slug)+'</code> · criado em '+dt(t.criado_em)+'</div>';
  iaFonteDesenhar();
}
// ---- de quem é a IA: da plataforma (cota do plano) ou chave de API PRÓPRIA do assinante (cifrada, nunca reexibida) ----
async function iaFonteDesenhar(msg){
  let e;try{e=await api('GET','/ia/fonte');}catch(x){return;}
  const c=$('ia-fonte');if(!c)return;
  $('ia-chip').textContent=e.fonte==='propria'?'chave própria':'IA da plataforma';
  c.innerHTML='<p class="sub" style="font-size:13px">De quem é a IA que dá nome aos documentos, responde perguntas e redige textos?</p>'+
   '<label style="display:block;font-weight:400;margin:6px 0"><input type="radio" name="ia-f" style="width:auto;display:inline-block;vertical-align:middle;margin:0 8px 0 0;min-height:0;height:auto" value="plataforma"'+(e.fonte==='plataforma'?' checked':'')+'> <b>IA da Villela Docs</b> — dentro da cota de consultas do seu plano.</label>'+
   '<label style="display:block;font-weight:400;margin:6px 0"><input type="radio" name="ia-f" style="width:auto;display:inline-block;vertical-align:middle;margin:0 8px 0 0;min-height:0;height:auto" value="propria"'+(e.fonte==='propria'?' checked':'')+'> <b>Minha chave de API (Anthropic)</b> — roda e é cobrada na SUA conta da Anthropic; não gasta a cota do plano.</label>'+
   '<div style="margin:8px 0 0 22px">'+(e.tem_chave?'<p class="sub" style="font-size:13px;margin:0 0 6px">Chave guardada, terminada em <code>…'+esc(e.chave_final)+'</code>'+(e.validada_em?' · testada em '+dt(e.validada_em):'')+'. Cole outra para trocar.</p>':'')+
   '<input id="ia-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" style="max-width:420px"></div>'+
   '<p><button class="btn" onclick="iaFonteSalvar()">Salvar</button> '+(e.tem_chave?'<button class="btn btn-ghost peq" onclick="iaChaveRemover()">Remover chave</button> ':'')+'<span id="ia-out">'+esc(msg||'')+'</span></p>'+
   '<p class="sub" style="font-size:12px">A chave é testada ao salvar, guardada cifrada e nunca é mostrada de novo. Crie uma em console.anthropic.com → API Keys, de preferência exclusiva para o Villela Docs e com limite de gasto. Créditos pré-pagos da própria plataforma, para quem não quer lidar com chave: em breve.</p>';
}
async function iaFonteSalvar(){
  const f=(document.querySelector('input[name=ia-f]:checked')||{}).value,k=$('ia-key').value.trim();
  $('ia-out').textContent=k?'Testando a chave…':'Salvando…';
  try{await api('PUT','/ia/fonte',{fonte:f,chave:k});iaFonteDesenhar('✅ salvo');}catch(x){$('ia-out').textContent='⚠️ '+x.message;}
}
async function iaChaveRemover(){
  if(!confirm('Remover a sua chave? A empresa volta a usar a IA da plataforma, dentro da cota do plano.'))return;
  try{await api('DELETE','/ia/chave');iaFonteDesenhar('✅ chave removida');}catch(x){$('ia-out').textContent='⚠️ '+x.message;}
}
async function salvarCfg(){try{
  await api('PATCH','/config',{tenant:{nome:$('cf-nome').value,cnpj:$('cf-cnpj').value,email_contato:$('cf-email').value,telefone:$('cf-tel').value},settings:{retencao_padrao_dias:$('cf-ret').value,retencao_lixeira_dias:$('cf-lix').value}});
  $('cf-out').textContent='✅ salvo';}catch(e){$('cf-out').textContent='⚠️ '+e.message;}}
async function iniciar2fa(){try{
  const r=await api('POST','/seguranca/2fa/iniciar');
  $('tfa-area').innerHTML='<p style="font-size:13px">1) Escaneie no app autenticador (ou digite o segredo):</p>'+
   '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">'+(r.qr_svg||'')+'<code style="word-break:break-all">'+esc(r.secret)+'</code></div>'+
   '<p style="font-size:13px">2) Digite o código de 6 dígitos para confirmar:</p>'+
   '<div style="display:flex;gap:8px"><input id="tfa-conf" inputmode="numeric" style="max-width:140px"><button class="btn peq" onclick="confirmar2fa()">Confirmar</button></div><div id="tfa-out" style="margin-top:8px;font-size:13px"></div>';
 }catch(e){alert(e.message);}}
async function confirmar2fa(){try{
  const r=await api('POST','/seguranca/2fa/confirmar',{codigo:$('tfa-conf').value});
  S.me.totp_ativo=true;
  $('tfa-area').innerHTML='<div class="aviso">✅ 2FA ativado! <b>Guarde os códigos de recuperação</b> (cada um vale 1 vez, não aparecem de novo):<br><code>'+r.recovery.join('</code> · <code>')+'</code></div>';
 }catch(e){$('tfa-out').textContent='⚠️ '+e.message;}}
async function desativar2fa(){try{
  await api('POST','/seguranca/2fa/desativar',{codigo:$('tfa-cod').value});
  S.me.totp_ativo=false;alert('2FA desativado.');vConfig();
 }catch(e){alert(e.message);}}
boot().catch(e=>$('corpo').innerHTML='<div class="erro">'+esc(e.message)+'</div>');
</script><script src="/vdocs/comunicados.js" data-cor="#1F3A5F" defer></script></body></html>`;
}

// ------------------------------------------------------------ páginas públicas do compartilhamento (Fase 7)
const paginaExterna = (titulo, inner) => pagina({
  titulo: `${titulo} — Villela Docs`, descricao: 'Acesso seguro a documentos compartilhados.',
  corpo: `<section class="alt" style="min-height:60vh"><div class="wrap"><div class="card" style="padding:26px;max-width:820px;margin:0 auto">
    <h2 style="margin-top:0">${esc(titulo)}</h2>${inner}
    <p style="font-size:12px;color:var(--suave);margin-top:18px">🔐 Acesso registrado (data, hora e IP) — Villela Docs.</p></div></div></section>`,
});

function paginaShare(token, sh, comp, { senha = '', erroSenha = false } = {}) {
  if (sh.senha_hash && !senha) {
    return paginaExterna('Conteúdo protegido', `
      ${erroSenha ? '<div class="erro">Senha incorreta.</div>' : ''}
      <p style="color:var(--suave)">Este link exige senha. Informe a senha que você recebeu de quem compartilhou.</p>
      <form method="POST" action="/vdocs/s/${esc(token)}"><label>Senha</label><input type="password" name="senha" required>
      <p><button class="btn" type="submit">Acessar</button></p></form>`);
  }
  const cont = comp.conteudoDoShare(sh);
  const linhas = cont.documentos.map(d => `<tr><td><b>${esc(d.nome)}</b>${d.descricao ? `<br><span style="font-size:13px;color:var(--suave)">${esc(d.descricao)}</span>` : ''}</td>
    <td>${esc(d.tipo_documental)}</td><td>v${d.versao}</td>
    <td>${sh.permite_download ? `<form method="POST" action="/vdocs/s/${esc(token)}/baixar" style="margin:0">
      <input type="hidden" name="doc" value="${esc(d.id)}"><input type="hidden" name="senha" value="${esc(senha)}">
      <button class="btn peq" type="submit">⬇️ Baixar</button></form>` : '<span class="chip">só visualização</span>'}</td></tr>`).join('');
  const textos = sh.permite_download ? '' : cont.documentos.filter(d => d.texto).map(d =>
    `<h3>${esc(d.nome)}</h3><div class="card" style="background:var(--fundo);white-space:pre-wrap;font-size:14px;max-height:420px;overflow:auto">${esc(d.texto)}</div>`).join('');
  return paginaExterna(cont.titulo, `
    <p style="color:var(--suave)">${cont.documentos.length} documento(s) compartilhado(s)${sh.expira_em ? ` · acesso até ${sh.expira_em.slice(0, 10).split('-').reverse().join('/')}` : ''}.</p>
    <div style="overflow-x:auto"><table><tr><th>Documento</th><th>Tipo</th><th>Versão</th><th></th></tr>${linhas}</table></div>${textos}`);
}

function paginaSolicitacao(token, rq) {
  return paginaExterna(rq.titulo, `
    ${rq.instrucoes ? `<p>${esc(rq.instrucoes)}</p>` : ''}
    <p style="color:var(--suave)">Envie até ${rq.max_arquivos - rq.recebidos} arquivo(s) (PDF, Office, imagens — máx. 20 MB cada)${rq.expira_em ? ` até ${rq.expira_em.slice(0, 10).split('-').reverse().join('/')}` : ''}.</p>
    <label>Seu nome</label><input id="rq-nome" placeholder="Para identificarmos quem enviou">
    <label>Arquivos</label><input id="rq-files" type="file" multiple>
    <p><button class="btn" id="rq-btn" onclick="enviar()">Enviar arquivos</button></p><div id="rq-out"></div>
    <script>
    function b64(f){return new Promise((ok,err)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=err;r.readAsDataURL(f);});}
    async function enviar(){
      const files=Array.from(document.getElementById('rq-files').files||[]);
      if(!files.length){alert('Escolha os arquivos.');return;}
      const btn=document.getElementById('rq-btn');btn.disabled=true;btn.textContent='Enviando…';
      const out=document.getElementById('rq-out');
      for(const f of files){
        out.innerHTML='<div class="aviso">Enviando '+f.name+'…</div>';
        const r=await fetch('/vdocs/r/${esc(token)}/enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({remetente:document.getElementById('rq-nome').value,arquivo_nome:f.name,conteudo_base64:await b64(f)})});
        const d=await r.json().catch(()=>({}));
        if(!r.ok){out.innerHTML='<div class="erro">'+f.name+': '+(d.erro||'falha no envio')+'</div>';btn.disabled=false;btn.textContent='Enviar arquivos';return;}
      }
      out.innerHTML='<div class="aviso">✅ Tudo enviado — obrigado! Pode fechar esta página.</div>';btn.textContent='Enviado';
    }
    </script>`);
}

function registrarPaginas(app, { express } = {}) {
  const html = (res, corpo) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex'); res.send(corpo); };
  app.get('/vdocs', (req, res) => html(res, landing()));
  app.get('/vdocs/precos', (req, res) => html(res, precos()));
  app.get('/vdocs/cadastro', (req, res) => html(res, cadastro()));
  app.get('/vdocs/login', (req, res) => html(res, login()));
  app.get('/vdocs/convite/:token', (req, res) => html(res, convite(req.params.token)));
  app.get('/vdocs/definir-senha', (req, res) => html(res, definirSenha((req.query || {}).token || '')));
  app.get('/vdocs/app', (req, res) => { res.setHeader('Cache-Control', 'no-store'); html(res, appTenant()); });

  // ---- acesso externo (Fase 7) — sem sessão; tudo logado por IP ----
  if (!express) return;
  const comp = require('./compartilhar');
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const guard = (fn) => (req, res) => {
    try { fn(req, res); }
    catch (e) { res.status(410); html(res, paginaExterna('Link indisponível', `<div class="erro">${esc(e.message)}</div>`)); }
  };
  const form = express.urlencoded({ extended: false, limit: '10kb' });

  app.get('/vdocs/s/:token', guard((req, res) => {
    const sh = comp.resolverShare(req.params.token);
    if (!sh.senha_hash) comp.logAcesso(sh, 'visualizar', '', ipDe(req));
    html(res, paginaShare(req.params.token, sh, comp));
  }));
  app.post('/vdocs/s/:token', form, guard((req, res) => {
    const sh = comp.resolverShare(req.params.token);
    const senha = String((req.body || {}).senha || '');
    if (!comp.conferirSenha(sh, senha, ipDe(req))) return html(res, paginaShare(req.params.token, sh, comp, { erroSenha: true }));
    comp.logAcesso(sh, 'visualizar', '', ipDe(req));
    html(res, paginaShare(req.params.token, sh, comp, { senha }));
  }));
  app.post('/vdocs/s/:token/baixar', form, guard((req, res) => {
    const sh = comp.resolverShare(req.params.token);
    const b = req.body || {};
    if (!comp.conferirSenha(sh, String(b.senha || ''), ipDe(req))) return html(res, paginaShare(req.params.token, sh, comp, { erroSenha: true }));
    const { buffer, nome, mime } = comp.baixarDoShare(sh, String(b.doc || ''), ipDe(req));
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.send(buffer);
  }));

  app.get('/vdocs/r/:token', guard((req, res) => {
    html(res, paginaSolicitacao(req.params.token, comp.resolverSolicitacao(req.params.token)));
  }));
  app.post('/vdocs/r/:token/enviar', express.json({ limit: '30mb' }), (req, res) => {
    try {
      const rq = comp.resolverSolicitacao(req.params.token);
      const id = comp.receberArquivo(rq, req.body || {}, ipDe(req));
      res.json({ ok: true, id });
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });
}

module.exports = { registrarPaginas };
