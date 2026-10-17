// =====================================================================
// Villela Academy Marketplace — páginas públicas + shell do app.
// Landing em /academy ; app (login + dashboards por papel) em /academy/app.
// Server-rendered, autocontido, sem build. Identidade visual própria
// (nada copiado de plataformas existentes).
// =====================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const repo = require('./repo');
const ct = require('./repo-conteudo');
const billing = require('./billing');
const lib = require('./liberacao'); // gotejamento: a promessa dita na compra
const amostras = require('./amostras'); // amostras grátis: trechos públicos de vídeo

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

// Identidade GRUPO VILLELA — Villela Academy (acento âmbar #D97706).
// Assets em /assets/brand/villela-academy/ ; tagline "Aprenda, aplique e transforme".
const BRAND = '/assets/brand/villela-academy';
const BASE_URL = () => (process.env.ACADEMY_BASE_URL || 'https://academia.villelastay.com.br').replace(/\/+$/, '');
const HEAD_MARCA = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="icon" type="image/svg+xml" href="${BRAND}/favicon.svg"><link rel="icon" type="image/png" sizes="192x192" href="${BRAND}/favicon-192.png">
    <link rel="apple-touch-icon" href="${BRAND}/apple-touch-icon.png"><meta name="theme-color" content="#1B2A4A">
    <link rel="manifest" href="/academy/manifest.webmanifest"><script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/academy/sw.js').catch(function(){})})}</script>`;
// lockup da marca: logo + "Villela" (Lora) + "ACADEMY" (Inter caixa alta, âmbar)
const marca = ({ escuro = true, altura = 32 } = {}) =>
  `<a class="marca" href="/academy"><img src="${BRAND}/${escuro ? 'logo-negativo.svg' : 'simbolo-v.svg'}" alt="Villela Academy" style="height:${altura}px">
   <span><span class="mnome" style="color:${escuro ? '#F8F9FA' : 'var(--villela-navy)'}">Villela</span> <span class="msub" style="color:${escuro ? 'var(--acento)' : 'var(--acento2)'}">ACADEMY</span></span></a>`;

// GA4 do grupo (mesma propriedade do site; tráfego segmentável por hostname) — só páginas públicas.
const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-5L2YQ2BPQW"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-5L2YQ2BPQW');</script>`;

const CSS = `:root{--villela-navy:#1B2A4A;--villela-navy2:#24365C;--villela-gold:#C9A227;--villela-ice:#F8F9FA;--villela-graphite:#1F2933;--acento:#D97706;--acento2:#B45309;--borda:#E2E6EC;--ambar-claro:#FDE9D2}
*{box-sizing:border-box}body{font-family:'Inter',system-ui,'Segoe UI',Arial,sans-serif;margin:0;color:var(--villela-graphite);background:var(--villela-ice)}
h1,h2,h3{font-family:'Lora',Georgia,serif}
a{color:var(--acento2)}.wrap{max-width:1040px;margin:0 auto;padding:0 18px}
.hero{background:linear-gradient(140deg,var(--villela-navy),var(--villela-navy2));color:#F8F9FA;padding:64px 0 72px}
.hero h1{font-size:2.4rem;margin:.2rem 0;max-width:660px;line-height:1.15}.hero p{font-size:1.15rem;max-width:580px;color:#C7D0E0}
.badge{display:inline-block;background:var(--villela-gold);color:var(--villela-navy);font-weight:700;padding:4px 12px;border-radius:20px;font-size:.85rem}
.btn{display:inline-block;background:var(--acento);color:#fff;font-weight:700;border:0;border-radius:26px;padding:13px 28px;cursor:pointer;font-size:1rem;text-decoration:none}
.btn:hover{background:var(--acento2)}
.btn.g{background:#fff;color:var(--villela-navy)}.btn.g:hover{background:#fff}.btn.o{background:transparent;border:2px solid #F8F9FA;color:#F8F9FA}.btn.o:hover{background:transparent}
.btn.peq{padding:6px 14px;font-size:.85rem}.btn.secund{background:var(--ambar-claro);color:var(--villela-navy)}.btn.secund:hover{background:var(--ambar-claro)}
.sec{padding:56px 0}.sec h2{font-size:1.7rem;color:var(--villela-navy);text-align:center;margin-bottom:8px}
.sub{text-align:center;color:#5B6472;max-width:640px;margin:0 auto 34px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}
.card{background:#fff;border:1px solid var(--borda);border-radius:14px;padding:22px}
.feat{display:flex;gap:12px;align-items:flex-start}.feat .i{font-size:1.5rem}
footer{background:var(--villela-navy);color:#C7D0E0;padding:30px 0;text-align:center;font-size:.9rem}footer a{color:var(--villela-gold)}
input,select,textarea{width:100%;padding:11px;border:1px solid #ccc;border-radius:9px;font:inherit;margin:5px 0 12px}
.form{max-width:460px;margin:0 auto;background:#fff;padding:26px;border-radius:14px;border:1px solid var(--borda)}
.tag{display:inline-block;background:var(--ambar-claro);color:var(--villela-navy);border-radius:12px;padding:2px 10px;font-size:.8rem}
.aviso{background:#fff7e8;border:1px solid #f0d9a6;border-radius:9px;padding:10px 14px;font-size:.9rem;margin:.4rem 0}
.erro{color:#b00020}
.marca{display:inline-flex;align-items:center;gap:10px;text-decoration:none}
.marca .mnome{font-family:'Lora',Georgia,serif;font-weight:700;font-size:1.15rem}
.marca .msub{font-family:'Inter',system-ui,sans-serif;font-weight:600;font-size:.72rem;letter-spacing:.22em;color:var(--acento)}
header.top{background:var(--villela-navy2);color:#fff}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding-top:18px;padding-bottom:18px}
header.top a{color:#E8ECF4;text-decoration:none}
header.top nav{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
header.top .marca{gap:18px}
header.top .marca>span{display:flex;flex-direction:column;line-height:1.05}
header.top .mnome{font-size:3.2rem}header.top .msub{font-size:1.4rem;letter-spacing:.18em}
@media(max-width:640px){.hero h1{font-size:1.8rem}header.top .esconde{display:none}header.top .marca img{height:84px!important}header.top .mnome{font-size:2rem}header.top .msub{font-size:.95rem}}`;

function landingHTML() {
  // a vitrine é o coração de um site comercial: a landing mostrava benefícios da
  // plataforma e NENHUM curso. Agora ela abre com o catálogo real.
  const destaques = ct.Marketplace.listar({ n: 6 });
  const feats = [
    ['🎓', 'Para quem aprende', 'Biblioteca com seus cursos, aulas em vídeo, materiais, progresso e certificados — tudo em um lugar.'],
    ['🎬', 'Para quem ensina', 'Crie cursos, e-books, mentorias e assinaturas. Página de venda, checkout e área de membros prontos.'],
    ['🤝', 'Para quem divulga', 'Programa de afiliados com links rastreáveis, painel de cliques, vendas e comissões transparentes.'],
    ['💳', 'Pagamento nacional', 'Checkout com Pix e cartão via Mercado Pago, liberação automática do acesso após a confirmação.'],
    ['🔒', 'Conteúdo protegido', 'Vídeos com streaming seguro, arquivos privados e links temporários — seu conteúdo não vaza.'],
    ['🤖', 'IA de verdade', 'Assistentes que ajudam a estruturar cursos, escrever páginas de venda e dar suporte ao aluno.'],
  ];
  const passos = [
    ['Escolha a sua formação', 'Cursos com currículo aberto: você vê módulo a módulo, a duração e os materiais antes de comprar.'],
    ['Estude no seu ritmo', 'Aula em vídeo, artigo em PDF e apresentação da aula, com o seu progresso salvo a cada aula.'],
    ['Aplique e comprove', 'Materiais para usar no trabalho e certificado da Villela Academy ao concluir.'],
  ];
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Villela Academy — cursos online e produtos digitais</title>
    <meta name="description" content="Marketplace brasileiro de cursos online, e-books e produtos digitais: venda como produtor, divulgue como afiliado, aprenda como aluno.">
    <meta property="og:title" content="Villela Academy — cursos online e produtos digitais">
    <meta property="og:description" content="Aprenda, aplique e transforme — marketplace brasileiro de cursos online e produtos digitais.">
    <meta property="og:type" content="website"><meta property="og:site_name" content="Villela Academy">
    <meta property="og:image" content="${BASE_URL()}${BRAND}/og-image.png">
    <link rel="canonical" href="${BASE_URL()}/academy">
    ${HEAD_MARCA}${GA}
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Villela Academy","applicationCategory":"EducationalApplication","operatingSystem":"Web","description":"Marketplace brasileiro de cursos online e produtos digitais: publicar é grátis e o produtor paga só comissão de 8,9% + R$ 1 por venda.","publisher":{"@type":"Organization","name":"Grupo Villela Stay"}}</script>
    <link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><link rel="stylesheet" href="/academy/publico.css?v=2"><style>${CSS}</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"></head><body class="vx" data-vertical="academy">
    <header class="top"><div class="wrap">
      ${marca({ escuro: true, altura: 150 })}
      <nav><a class="esconde" href="/academy#cursos">Cursos</a><a class="esconde" href="/academy/marketplace">Marketplace</a><a class="esconde" href="https://villelastay.com.br/campanhas/cursos/">Conteúdo dos cursos</a><a href="/academy/app">Entrar</a> <a class="btn" style="padding:9px 16px;background:var(--villela-gold);color:var(--villela-navy)!important" href="/academy/app#cadastro">Criar conta grátis</a></nav>
    </div></header>
    <div class="hero"><div class="wrap">
      <span class="badge">Escola online do Grupo Villela Stay</span>
      <h1>Formação profissional que cabe na sua semana.</h1>
      <p><b>Aprenda, aplique e transforme</b> — cursos com aula em vídeo, artigo em PDF e material para usar no trabalho. Com certificado da Villela Academy e acesso de 1 ano.</p>
      <p style="margin-top:26px"><a class="btn" href="#cursos">Ver os cursos</a>
      &nbsp;<a class="btn g" href="/academy/app#cadastro">Criar conta grátis</a>
      &nbsp;<a class="btn o" href="/academy/app">Já sou aluno</a></p>
    </div></div>

    ${destaques.length ? `<div class="sec" id="cursos"><div class="wrap" style="max-width:1180px">
      <h2>Cursos em destaque</h2>
      <p class="sub">Currículo aberto, materiais inclusos e certificado ao final.</p>
      ${barraDeAreas('')}
      <div class="pv-vitrine">${destaques.map(cardProduto).join('')}</div>
      <p class="pv-centro" style="margin-top:28px"><a class="btn" href="/academy/marketplace">Ver o catálogo completo</a></p>
    </div></div>` : ''}

    <div class="sec" style="background:#fff"><div class="wrap" style="max-width:1180px">
      <h2>Como funciona</h2>
      <p class="sub">Do primeiro clique ao certificado, sem burocracia.</p>
      <div class="pv-passos">${passos.map(([tit, txt]) => `<div><h3>${esc(tit)}</h3><p>${esc(txt)}</p></div>`).join('')}</div>
    </div></div>

    <div class="sec" id="recursos"><div class="wrap"><h2>Feita para os três lados do balcão</h2>
      <p class="sub">Aluno, produtor e afiliado com painéis próprios — e a plataforma cuidando de pagamento, entrega e segurança.</p>
      <div class="grid">${feats.map(([i, t, d]) => `<div class="card feat"><div class="i">${i}</div><div><b>${esc(t)}</b><br><span class="sub" style="text-align:left;margin:0">${esc(d)}</span></div></div>`).join('')}</div>
    </div></div>
    <div class="sec" id="confianca" style="background:#fff"><div class="wrap" style="max-width:1180px"><h2>Tecnologia testada na vida real</h2>
      <p class="sub">Nossa missão é ser o caminho mais curto do conhecimento à renda: <b>publicar é grátis — você só paga quando vende</b>. A plataforma nasceu dentro do Grupo Villela Stay, com os mesmos padrões de segurança dos nossos outros sistemas.</p>
      <div class="pv-num">
        <div><b>8,9% + R$ 1</b><span>por venda aprovada — sem mensalidade nem taxa de adesão</span></div>
        <div><b>Pix e cartão</b><span>via Mercado Pago, com liberação automática do acesso</span></div>
        <div><b>Certificado</b><span>com código verificável por qualquer pessoa</span></div>
        <div><b>LGPD</b><span>dados tratados conforme a lei, com exportação e exclusão na conta</span></div>
      </div>
      <p class="sub" style="margin-top:26px">🔒 Conexão segura (HTTPS) &nbsp;·&nbsp; 🛡️ Dados tratados conforme a LGPD &nbsp;·&nbsp; 💳 Pagamentos pelo Mercado Pago</p>
    </div></div>
    <div class="sec" id="produtores" style="background:var(--ambar-claro)"><div class="wrap"><h2>Quer vender seu curso aqui?</h2>
      <p class="sub">Estamos abrindo a plataforma para os primeiros produtores e afiliados. Deixe seu contato que a gente chama você.</p>
      <form class="form" id="lead">
        <input id="l-nome" placeholder="Seu nome" required><input id="l-email" type="email" placeholder="E-mail" required>
        <input id="l-tel" placeholder="Telefone/WhatsApp">
        <select id="l-int"><option value="produtor">Quero vender meus cursos (produtor)</option>
          <option value="afiliado">Quero divulgar e ganhar comissão (afiliado)</option>
          <option value="aluno">Quero aprender (aluno)</option><option value="outro">Outro</option></select>
        <textarea id="l-msg" rows="3" placeholder="Conte rapidinho o que você produz ou procura"></textarea>
        <button class="btn" type="submit">Enviar</button><p id="l-msg2" class="sub" style="margin:8px 0 0"></p>
      </form></div></div>
    <footer>Villela Academy · Aprenda, aplique e transforme<br>
      <span style="opacity:.9">📲 Disponível como app para o seu celular — <a href="/academy/ajuda/manual" style="color:var(--villela-gold)">abra o painel e instale</a></span><br>
      Uma empresa do Grupo Villela Stay · CNPJ 56.776.526/0001-12<br>
      <a href="/academy/marketplace">Marketplace</a> · <a href="/academy/ajuda">Ajuda</a> · <a href="/academy/termos">Termos</a> · <a href="/academy/privacidade">Privacidade</a> · <a href="/academy/app">Entrar</a>
      <script>document.getElementById('lead').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('l-msg2');
        const r=await fetch('/academy/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          nome:l_nome.value,email:l_email.value,telefone:l_tel.value,interesse:l_int.value,mensagem:l_msg.value})});
        m.textContent=r.ok?'✅ Recebido! Entraremos em contato.':'Erro ao enviar.';if(r.ok)document.getElementById('lead').reset();};
      </script></footer></body></html>`;
}

// VERSÃO DOS ARQUIVOS DE TELA do painel (/academy/app). Um lugar só: subir o número de um arquivo aqui muda o `?v=`
// dele no HTML e muda a VERSAO_TELA — que vai em toda resposta da API (cabeçalho X-Academy-Tela, index.js) e nasce
// na página (window.ACADEMY_TELA). Aba aberta durante um deploy compara as duas e mostra "Há uma versão nova desta
// tela — Atualizar" (app-cliente.js › conferirVersao); nunca recarrega sozinha. ⚠️ Alterou um arquivo de tela
// (app-*.js, aluno.css, estude.css)? Suba o número dele aqui. O pacote dos motores (/academy/estude-motores.js) é
// pedido pela própria tela (app-estudo.js › comMotores) e tem o `?v=` dele lá.
const V_SCRIPTS = { jornada: 5, ecossistema: 3, carteira: 3, estude: 7, aluno: 13, app: 14 };
const V_FOLHAS = { aluno: 5, estude: 5 };
const script = (n) => `<script src="/academy/${n}.js?v=${V_SCRIPTS[n]}"></script>`;
const folha = (n) => `<link rel="stylesheet" href="/academy/${n}.css?v=${V_FOLHAS[n]}">`;
const VERSAO_TELA = Object.keys(V_FOLHAS).map(n => `${n}.${V_FOLHAS[n]}`).concat(Object.keys(V_SCRIPTS).map(n => `${n}.${V_SCRIPTS[n]}`)).join('-');
function appHTML() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Villela Academy — Painel</title>${HEAD_MARCA}<link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7">${folha('aluno')}${folha('estude')}<style>${CSS}
    .cx{max-width:1040px;margin:20px auto;padding:0 14px;transition:max-width .25s}.lin{border-bottom:1px solid #eee;padding:8px 0}
    .menu{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px}
    .kpi{background:#fff;border:1px solid var(--borda);border-radius:10px;padding:10px 16px;min-width:120px;display:inline-block;margin:4px}
    .kpi b{display:block;font-size:1.3rem;color:var(--villela-navy)}
    label{font-size:.85rem;font-weight:600;display:block}
    table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #f0ece2}
    th{color:#5B6472;font-weight:600}.chip{display:inline-block;background:var(--ambar-claro);color:var(--villela-navy);border-radius:12px;padding:2px 9px;font-size:.78rem}
    /* erro de ação (ex.: "enviar para revisão" barrado): precisa ser visto, não sussurrado */
    .erro:not(:empty){display:block;margin:8px 0 0;background:#fdecef;border:1px solid #f3b7c2;border-radius:9px;padding:9px 13px;font-size:.9rem;font-weight:600}
    .erro.ok{background:#eaf7ef;border-color:#b7e0c4;color:#14532d} /* mesmo elemento reusado p/ confirmação */
    </style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"></head><body class="vx" data-vertical="academy"><div class="cx">
    <h2 style="color:var(--villela-navy);display:flex;align-items:center;gap:10px;flex-wrap:wrap">${marca({ escuro: false, altura: 30 })} <span class="tag">painel</span></h2>
    <div id="app"><p class="sub">Carregando…</p></div></div>
    <script>window.ACADEMY_TELA=${JSON.stringify(VERSAO_TELA)};</script>${['jornada', 'ecossistema', 'carteira', 'estude', 'aluno', 'app'].map(script).join('')}<script>bootAcademy();</script><script src="/academy/comunicados.js" data-cor="#D97706" data-sino="nao" defer></script></body></html>`;
}

// ==================== FASE 3 — vitrine pública (SEO/OG) ====================
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const TIPOS_ROT = { curso: 'Curso', ebook: 'E-book', pdf: 'PDF', audio: 'Áudio', pacote: 'Pacote', mentoria: 'Mentoria', clube: 'Clube (assinatura)' };
const sufixoMes = (p) => (p.tipo === 'clube' ? '<small>/mês</small>' : '');

// shell público com SEO/OG; TODO conteúdo de produtor passa por esc()
// `imagem` (URL absoluta, ex.: capa do curso) tem prioridade; senão og da marca.
// `url` é o caminho da página (ex.: /academy/marketplace). Vira canonical e og:url
// ABSOLUTOS: sem canonical, o mesmo conteúdo responde por academia./academy./cursos.
// e pelo domínio da Render — quatro endereços disputando a mesma página.
// `noindex`: página que leva dado pessoal (o certificado, com o nome do aluno) não entra em buscador.
// `imagemDim` = { largura, altura } REAIS de `imagem`. Sem ele as dimensões não são declaradas: o shell dizia
// 1200×630 para qualquer imagem, e a capa do curso é 1920×1080 (auditoria de 11/10/2026, B1). Dimensão
// errada é pior do que nenhuma — a rede social recorta pelo que foi declarado.
const OG_MARCA = { largura: 1200, altura: 630 }; // medida de /assets/brand/villela-academy/og-image.png
const ogDimensoes = (d) => (d && d.largura > 0 && d.altura > 0
  ? `<meta property="og:image:width" content="${Number(d.largura)}"><meta property="og:image:height" content="${Number(d.altura)}">` : '');
function shellPublico({ titulo, descricao, url, corpo, imagem, imagemDim, jsonld, noindex }) {
  const abs = url ? (String(url).startsWith('http') ? url : BASE_URL() + url) : '';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(titulo)} — Villela Academy</title>
    <meta name="description" content="${esc(descricao)}">
    <meta name="robots" content="${noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'}">
    ${abs ? `<link rel="canonical" href="${esc(abs)}">` : ''}
    <meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
    <meta property="og:type" content="website">${abs ? `<meta property="og:url" content="${esc(abs)}">` : ''}
    <meta property="og:site_name" content="Villela Academy"><meta property="og:locale" content="pt_BR">
    <meta property="og:image" content="${esc(imagem || `${BASE_URL()}${BRAND}/og-image.png`)}">
    ${ogDimensoes(imagem ? imagemDim : OG_MARCA)}
    <meta name="twitter:card" content="summary_large_image">
    ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
    ${HEAD_MARCA}
    <link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><link rel="stylesheet" href="/academy/publico.css?v=2"><style>${CSS} .top{background:var(--villela-navy);padding:12px 0}.top a{color:#F8F9FA;text-decoration:none;margin-right:16px}
    .estrela{color:var(--villela-gold)}</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"></head><body class="vx" data-vertical="academy">
    <div class="top"><div class="wrap" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">${marca({ escuro: true, altura: 28 })}<span style="flex:1"></span><a href="/academy/marketplace">Marketplace</a><a href="https://villelastay.com.br/campanhas/cursos/">Conteúdo dos cursos</a><a href="/academy/app">Entrar</a></div></div>
    ${corpo}
    <footer>Villela Academy · Aprenda, aplique e transforme<br>
      <span style="opacity:.9">📲 Disponível como app para o seu celular — <a href="/academy/ajuda/manual" style="color:var(--villela-gold)">abra o painel e instale</a></span><br>
      Uma empresa do Grupo Villela Stay · CNPJ 56.776.526/0001-12<br>
      <a href="/academy/marketplace">Marketplace</a> · <a href="/academy/ajuda">Ajuda</a> · <a href="/academy/termos">Termos</a> · <a href="/academy/privacidade">Privacidade</a> · <a href="/academy/reembolso">Reembolso</a> ·
      <a href="/academy/termos-produtor">Produtores</a> · <a href="/academy/termos-afiliado">Afiliados</a></footer></body></html>`;
}

function cardProduto(p) {
  // ?v = id da mídia: a URL da capa é estável (og:image), então sem esta chave o
  // navegador serviria a capa ANTIGA por até 1h depois de o produtor trocá-la.
  const capa = p.capa_media_id ? `<img src="/academy/capa/${esc(p.id)}?v=${esc(p.capa_media_id)}" alt="" loading="lazy">` : '';
  const preco = p.preco_promo_centavos
    ? `<span class="preco"><s>${brl(p.preco_centavos)}</s> ${brl(p.preco_promo_centavos)}${sufixoMes(p)}</span>`
    : `<span class="preco">${p.preco_centavos ? brl(p.preco_centavos) + sufixoMes(p) : 'Grátis'}</span>`;
  // categoria como etiqueta ao lado do tipo. Aqui é SPAN, não link: o card
  // inteiro já é um <a>, e âncora dentro de âncora é HTML inválido.
  const cat = (p.categorias && p.categorias.length ? p.categorias : [p.categoria]).filter(Boolean).slice(0, 2)
    .map(c => `<span class="tag area">${esc(ct.catRotulo(c))}</span>`).join('');
  // selo discreto: só quando o curso TEM trecho público para assistir antes de comprar
  const selo = amostras.tem(p.id) ? '<span class="tag amostra">▶ amostras grátis</span>' : '';
  return `<a class="cardp" href="/academy/cursos/${esc(p.slug)}">${capa || '<span class="capa-vazia"></span>'}
    <span class="tags"><span class="tag">${TIPOS_ROT[p.tipo] || esc(p.tipo)}</span>${cat}${selo}</span>
    <b>${esc(p.titulo)}</b>
    <span class="sub">${esc(p.descricao_curta || p.subtitulo)}</span>
    <span class="autor">por ${esc(p.produtor_nome || '')}</span>${preco}</a>`;
}

// barra de áreas: "todas" + uma por categoria visível, com a contagem de
// publicados e destaque na ativa. Usada no marketplace e na home.
function barraDeAreas(ativa) {
  // só áreas COM curso publicado: filtro que leva a "nenhum produto encontrado" é
  // beco sem saída, e 15 etiquetas vazias fazem a vitrine parecer deserta. A ativa
  // entra sempre (o aluno tem de ver onde está), mesmo que tenha ficado sem curso.
  const todas = ct.Categorias.visiveis();
  const cats = todas.filter(c => c.n > 0 || c.slug === ativa);
  if (!cats.length) return '';
  const total = ct.Marketplace.listar({ n: 200 }).length;
  const chip = (href, rotulo, n, on) =>
    `<a class="${on ? 'on' : ''}" href="${href}">${esc(rotulo)}${n ? `<span class="n">${n}</span>` : ''}</a>`;
  return `<nav class="pv-areas" aria-label="Áreas de conhecimento">
    ${chip('/academy/marketplace', 'Todas as áreas', total, !ativa)}
    ${cats.map(c => chip(`/academy/marketplace?categoria=${encodeURIComponent(c.slug)}`, ct.catRotulo(c.slug), c.n, c.slug === ativa)).join('')}
  </nav>`;
}

function marketplaceHTML({ q, categoria }) {
  const itens = ct.Marketplace.listar({ q, categoria });
  // <h1> de verdade: a vitrine abria com <h2> e ficava SEM h1 — o buscador não
  // tinha o título da página em lugar nenhum do corpo.
  const corpo = `<div class="sec"><div class="wrap" style="max-width:1180px"><h1 style="font-family:'Lora',Georgia,serif;font-size:1.7rem;color:var(--villela-navy);text-align:center;margin-bottom:8px">${categoria ? `Cursos de ${esc(ct.catRotulo(categoria))}` : 'Cursos online da Villela Academy'}</h1>
    <p class="sub">Cursos e produtos digitais dos produtores da Villela Academy — currículo aberto, materiais inclusos e certificado.</p>
    <form class="pv-busca" method="get" action="/academy/marketplace">
      <input name="q" value="${esc(q || '')}" placeholder="Buscar curso, e-book, mentoria..." aria-label="Buscar">
      <button type="submit">Buscar</button></form>
    ${barraDeAreas(categoria)}
    ${itens.length ? `<div class="pv-vitrine">${itens.map(cardProduto).join('')}</div>`
      : '<p class="sub">Nenhum produto encontrado' + (q || categoria ? ' com esse filtro.' : ' ainda — os primeiros produtores estão chegando.') + '</p>'}
  </div></div>`;
  return shellPublico({
    titulo: categoria ? `Cursos de ${ct.catRotulo(categoria)}` : 'Cursos online, e-books e mentorias',
    descricao: 'Cursos online, e-books e mentorias da Villela Academy: currículo aberto, material para baixar e certificado da Villela Academy. '
      + (categoria ? `Área: ${ct.catRotulo(categoria)}.` : 'Veja o catálogo completo por área.'),
    url: '/academy/marketplace' + (categoria ? `?categoria=${encodeURIComponent(categoria)}` : ''),
    corpo,
    // CollectionPage + ItemList: diz ao buscador (e ao assistente) que esta página
    // É o catálogo, e quais cursos estão nele — sem isso ela é só "uma página".
    jsonld: {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: 'Marketplace da Villela Academy', inLanguage: 'pt-BR',
      url: `${BASE_URL()}/academy/marketplace`,
      isPartOf: { '@type': 'WebSite', name: 'Villela Academy', url: `${BASE_URL()}/academy` },
      mainEntity: {
        '@type': 'ItemList', numberOfItems: itens.length,
        itemListElement: itens.slice(0, 50).map((x, i) => ({
          '@type': 'ListItem', position: i + 1, name: x.titulo,
          url: `${BASE_URL()}/academy/cursos/${x.slug}`,
        })),
      },
    },
  });
}

function embedDe(url) {
  let m = String(url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,20})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1];
  m = String(url || '').match(/vimeo\.com\/(\d+)/);
  if (m) return 'https://player.vimeo.com/video/' + m[1];
  return null;
}
const li = (arr, icone) => arr && arr.length ? `<ul style="list-style:none;padding:0">${arr.map(x => `<li style="padding:5px 0">${icone} ${esc(x)}</li>`).join('')}</ul>` : '';

// ícones da vitrine (SVG inline: nítido, herda a cor, sem dependência externa)
const D_ICO = {
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  play: 'M8 5v14l11-7z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z',
  som: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3z',
  elo: 'M3.9 12a5 5 0 0 1 5-5h3v-2h-3a7 7 0 0 0 0 14h3v-2h-3a5 5 0 0 1-5-5zm4.1 1h8v-2H8zm5-8v2h3a5 5 0 0 1 0 10h-3v2h3a7 7 0 0 0 0-14z',
  texto: 'M3 5h18v2H3zm0 6h18v2H3zm0 6h12v2H3z',
  baixar: 'M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z',
  seta: 'M8.6 16.6 13.2 12 8.6 7.4 10 6l6 6-6 6z',
  relogio: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.6V7h-2v6.4l5 3 1-1.7z',
  chapeu: 'M12 3 1 9l11 6 9-4.9V17h2V9zM5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.8z',
  escudo: 'M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11z',
  estrela: 'm12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.1-.6L12 2 9.1 8.7 2 9.3l5.4 4.7-1.6 7z',
  alvo: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-14a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
  presente: 'M20 7h-2.2a3 3 0 0 0-4.8-3.4L12 4.4l-1-.8A3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3h9V8h-1a1 1 0 0 1 0-2h1.5L12 5l.5.9H14a1 1 0 0 1 0 2h-1v3h9V8a1 1 0 0 0-1-1zM11 21v-8H4v7a1 1 0 0 0 1 1zm2 0h6a1 1 0 0 0 1-1v-7h-7z',
};
const svgI = (n, t = 18) => `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="currentColor" aria-hidden="true"><path d="${D_ICO[n]}"/></svg>`;
const ICO_AULA = { video: 'play', pdf: 'doc', audio: 'som', arquivo: 'baixar', link: 'elo', texto: 'texto' };
const durSeg = (seg) => {
  seg = Number(seg || 0); if (!seg) return '';
  if (seg < 60) return seg + ' s';
  const m = Math.round(seg / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : m + ' min';
};
const listaPv = (arr, cls, icone) => arr && arr.length
  ? `<ul class="pv-lista ${cls}">${arr.map(x => `<li>${svgI(icone, 20)}<span>${esc(x)}</span></li>`).join('')}</ul>` : '';
const secPv = (titulo, html) => html
  ? `<section class="pv-sec">${titulo ? `<h2>${titulo}</h2>` : ''}${html}</section>` : '';
// "1.632 questões", e nunca "1 conteúdos": número com milhar e a palavra no número certo
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const qtd = (n, um, muitos) => `${num(n)} ${Number(n) === 1 ? um : muitos}`;

// DESCRIÇÃO LONGA do produtor (auditoria de 11/10/2026, M1). O texto chega com listas ("- item") e títulos
// internos ("O que é"), e saía num parágrafo só: 13 itens corridos, 893 px de texto contínuo no celular.
// Três regras, e nada além delas:
//   · linha que começa com "- " é item de lista;
//   · linha curta, sem pontuação no fim, SOZINHA entre linhas em branco e com texto depois dela, é subtítulo;
//   · o resto é parágrafo.
// O texto é ESCAPADO ANTES de qualquer coisa: daqui só saem as tags <p>, <ul>, <li> e <h3> que ESTA função
// escreve. Não é Markdown e não aceita HTML — "<script>" do produtor aparece como texto na tela.
const TITULO_MAX = 70;
function textoRico(texto) {
  const blocos = esc(String(texto == null ? '' : texto).replace(/\r\n?/g, '\n')).split(/\n[ \t]*\n/)
    .map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length);
  const ehItem = (l) => /^- +\S/.test(l);
  return blocos.map((linhas, i) => {
    const so = linhas.length === 1 ? linhas[0] : '';
    if (so && i < blocos.length - 1 && !ehItem(so) && so.length <= TITULO_MAX && !/[.!?:;,…]$/.test(so)) return `<h3 class="pv-sub">${so}</h3>`;
    const saida = []; let par = [], itens = [];
    const fecha = () => {
      if (par.length) saida.push(`<p>${par.join(' ')}</p>`);
      if (itens.length) saida.push(`<ul class="pv-pontos">${itens.map(x => `<li>${x}</li>`).join('')}</ul>`);
      par = []; itens = [];
    };
    for (const l of linhas) {
      if (ehItem(l)) { if (par.length) fecha(); itens.push(l.replace(/^- +/, '')); }
      else { if (itens.length) fecha(); par.push(l); }
    }
    fecha();
    return saida.join('');
  }).join('');
}

// og:image (auditoria de 11/10/2026, B1): largura e altura REAIS da capa, lidas do cabeçalho do arquivo. Só PNG
// e JPEG (o que o upload de capa recebe na prática); formato que não se sabe ler fica SEM dimensão declarada.
function dimensoesDaImagem(buf) {
  try {
    if (!buf || buf.length < 24) return null;
    if (buf.readUInt32BE(0) === 0x89504E47 && buf.toString('latin1', 12, 16) === 'IHDR') return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      // JPEG: anda pelos segmentos até o SOF (C0–CF, menos C4, C8 e CC), onde estão altura e largura
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const m = buf[i + 1];
        if (m === 0xFF) { i++; continue; }
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { largura: buf.readUInt16BE(i + 7), altura: buf.readUInt16BE(i + 5) };
        if ((m >= 0xD0 && m <= 0xD9) || m === 0x01) { i += 2; continue; } // marcadores sem tamanho
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch (_) { /* arquivo truncado ou estranho: sem dimensão */ }
  return null;
}
// A medida fica guardada pelo id da mídia (trocar a capa troca o id). Capa no disco é lida na hora; capa no
// bucket só é conhecida depois que a rota /academy/capa a serviu uma vez — até lá a página sai SEM dimensão,
// que é o certo: a página de venda não espera uma ida ao bucket para montar o cabeçalho.
const DIMS_CAPA = new Map();
function dimsDaCapa(mediaId, bytes) {
  if (!mediaId) return null;
  if (DIMS_CAPA.has(mediaId)) return DIMS_CAPA.get(mediaId);
  let buf = bytes || null;
  if (!buf) {
    try {
      const m = ct.Midia.obter(mediaId);
      if (!m || m.storage === 's3') return null; // no bucket: espera a rota da capa
      const caminho = ct.Midia.caminhoAbsoluto(m);
      const fd = fs.openSync(caminho, 'r');
      // 256 KB bastam para o cabeçalho (o SOF do JPEG pode vir depois de um EXIF com miniatura)
      try { buf = Buffer.alloc(262144); buf = buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0)); } finally { fs.closeSync(fd); }
    } catch (_) { return null; }
  }
  const d = dimensoesDaImagem(buf);
  if (DIMS_CAPA.size > 2000) DIMS_CAPA.clear();
  DIMS_CAPA.set(mediaId, d);
  return d;
}

// ERRO PÚBLICO (404 de curso, de produtor e de certificado) — auditoria de 11/10/2026, B4. Estas páginas
// saíam do molde dos textos legais e herdavam a faixa "MINUTA — documento em elaboração…" por cima de
// "Certificado não encontrado". O molde de erro é o shell público, sem faixa e fora dos buscadores.
// `mensagem` é texto FIXO de quem chama (nunca o que veio na URL) e sai escapado.
function paginaErro(titulo, mensagem) {
  return shellPublico({ titulo, descricao: mensagem, noindex: true,
    corpo: `<div class="sec"><div class="wrap" style="max-width:620px"><div class="card" style="text-align:center;padding:40px">
      <h1 style="color:var(--villela-navy);margin:8px 0;font-size:1.6rem">${esc(titulo)}</h1>
      <p class="sub">${esc(mensagem)}</p>
      <p style="margin-top:22px"><a class="btn" href="/academy/marketplace">Ver os cursos</a></p></div></div></div>` });
}

// ---- AMOSTRAS GRÁTIS na página de venda ----
// Cada trecho é um <video> nativo com a capa de pôster: toca no lugar, sem autoplay e
// sem baixar nada antes do clique (preload="none"). Sem JavaScript continua funcionando;
// o script só cuida de pausar os outros quando um começa.
const rotAmostra = (a) => [a.aula ? `Aula ${a.aula}` : 'Do curso', a.duracao_seg ? durSeg(a.duracao_seg) : ''].filter(Boolean).join(' · ');
const videoAmostra = (a, { cls = '', poster = '' } = {}) =>
  `<video${cls ? ` class="${cls}"` : ''} data-amostra controls playsinline preload="none"${(poster || a.capa_url) ? ` poster="${esc(poster || a.capa_url)}"` : ''} aria-label="Amostra grátis: ${esc(a.titulo)}"><source src="${esc(a.video_url)}" type="${esc(a.video_mime || 'video/mp4')}">Seu navegador não toca este vídeo. <a href="${esc(a.video_url)}">Abrir a amostra</a>.</video>`;
const cartaoAmostra = (a) => `<figure class="pv-am">${videoAmostra(a)}
      <figcaption><span class="meta">${esc(rotAmostra(a))}</span><b>${esc(a.titulo)}</b>${a.ponte ? `<span class="ponte">${esc(a.ponte)}</span>` : ''}</figcaption></figure>`;
const AMOSTRAS_A_VISTA = 6; // o resto abre em "ver mais": 25 capas de uma vez empurram o currículo para longe
function secaoAmostras(lista, destino, cta) {
  if (!lista.length) return '';
  const aVista = lista.slice(0, AMOSTRAS_A_VISTA), resto = lista.slice(AMOSTRAS_A_VISTA);
  return `<section class="pv-sec" id="amostras"><h2>Amostras grátis</h2>
    <p class="pv-fino pv-am-intro">${lista.length > 1 ? `${lista.length} trechos das aulas` : 'Um trecho do curso'} para assistir agora, sem cadastro.</p>
    <div class="pv-amostras">${aVista.map(cartaoAmostra).join('')}</div>
    ${resto.length ? `<details class="pv-am-mais"><summary>Ver mais ${resto.length} amostra${resto.length > 1 ? 's' : ''}</summary>
      <div class="pv-amostras">${resto.map(cartaoAmostra).join('')}</div></details>` : ''}
    <p class="pv-am-cta"><a href="${destino}">${esc(cta)} e assistir às aulas completas →</a></p>
  </section>`;
}
// um vídeo por vez: quando um começa, os outros param
const SCRIPT_AMOSTRAS = `<script>(function(){var v=document.querySelectorAll('video[data-amostra]');
    for(var i=0;i<v.length;i++){v[i].addEventListener('play',function(e){for(var j=0;j<v.length;j++){if(v[j]!==e.target&&!v[j].paused)v[j].pause();}});}})();</script>`;

function cursoHTML(slug) {
  const p = ct.Marketplace.porSlug(slug);
  if (!p) return null;
  const trechos = amostras.publicasDoProduto(p.id); // [] na maioria dos cursos: nada muda na página
  const sp = ct.SalesPages.obter(p.id);
  const nota = ct.Reviews.media(p.id);
  const reviews = ct.Reviews.publicas(p.id);
  const resumo = ct.Marketplace.resumoConteudo(p.id);
  // curso COM área: só entram cursos da mesma área — sem nenhum, a seção não aparece (melhor do que pôr
  // Paisagismo ao lado de Direito). Curso sem área cai no catálogo recente, e o subtítulo diz isso.
  const areas = (p.categorias && p.categorias.length ? p.categorias : [p.categoria]).filter(Boolean);
  const relacionados = ct.Marketplace.recomendados({
    excluir: [p.id], categorias: areas, tags: p.tags || [], produtores: [p.producer_id], n: 3, soDaCategoria: areas.length > 0,
  });
  // curso que hospeda o Estude: os números da página vêm do percurso publicado, não da casca (ver resumoDoEstude)
  const est = resumo.estude;
  const emb = embedDe(sp.video_url);
  const ehClube = p.tipo === 'clube';
  const valor = p.preco_promo_centavos || p.preco_centavos;
  const gratis = !valor;
  const capaUrl = p.capa_media_id ? `/academy/capa/${esc(p.id)}?v=${esc(p.capa_media_id)}` : '';
  // GOTEJAMENTO — a trilha dita ANTES da compra. Sem isto o aluno compra
  // esperando tudo aberto e encontra cadeado: a trava viraria surpresa, e
  // a promessa da página, mentira. Sai do config do produto, não à mão.
  const gote = lib.normalizar(p.config);
  const goteDias = lib.diasAteOFim(resumo.total_aulas, gote);
  const cta = ehClube ? 'Assinar agora' : (gratis ? 'Matricular grátis' : 'Comprar agora');
  const destino = (billing.ativo() || gratis) ? `/academy/checkout/${esc(p.slug)}` : '#comprar';
  const inicial = esc((p.produtor_nome || 'V').trim().charAt(0).toUpperCase());

  // "o que você leva" sai do conteúdo REAL do curso, não de promessa escrita à mão
  const inclui = [];
  // a grade conta só as aulas; o módulo bônus (Villela Express) aparece à parte
  const nAulas = est ? est.aulas : resumo.modulos.filter(m => !m.extra).length;
  // horas de VÍDEO do curso: as das videoaulas do percurso, ou as dos vídeos da grade
  const segVideo = est ? est.video_seg : resumo.total_seg;
  const bonusExpress = resumo.total_express ? `+ Villela Express: ${resumo.total_express} vídeo${resumo.total_express > 1 ? 's' : ''} curto${resumo.total_express > 1 ? 's' : ''} de consulta rápida` : '';
  if (nAulas) inclui.push(['texto', `${qtd(nAulas, 'aula', 'aulas')}, do começo ao fim`]);
  if (bonusExpress) inclui.push(['play', bonusExpress]);
  if (est) {
    if (est.videos) inclui.push(['play', `${qtd(est.videos, 'videoaula', 'videoaulas')}${est.video_seg ? ` · ${durSeg(est.video_seg)}` : ''}`]);
    if (est.questoes) inclui.push(['alvo', `${qtd(est.questoes, 'questão', 'questões')} para praticar`]);
    if (est.cards) inclui.push(['doc', `${qtd(est.cards, 'card', 'cards')} de revisão`]);
  } else {
    if (resumo.total_videos) inclui.push(['play', `${resumo.total_videos} vídeo${resumo.total_videos > 1 ? 's' : ''}${resumo.total_seg ? ` · ${durSeg(resumo.total_seg)}` : ''}`]);
    const naoVideo = resumo.total_aulas - resumo.total_videos;
    if (naoVideo > 0) inclui.push(['doc', `${naoVideo} conteúdo${naoVideo > 1 ? 's' : ''} de leitura e prática`]);
  }
  if (resumo.total_materiais) inclui.push(['baixar', `${qtd(resumo.total_materiais, 'material', 'materiais')} para baixar`]);
  inclui.push(['chapeu', 'Certificado da Villela Academy']);
  if (gote.ativo) inclui.push(['relogio', `${lib.promessa(gote)}, a partir da sua matrícula`]);
  inclui.push(['relogio', ehClube ? 'Acesso enquanto a assinatura estiver ativa' : 'Acesso por 1 ano, no computador e no celular']);
  if (p.garantia_dias) inclui.push(['escudo', `Garantia de ${p.garantia_dias} dias`]);

  const chips = [
    `<span class="pv-chip ouro">${TIPOS_ROT[p.tipo] || esc(p.tipo)}</span>`,
    ...((p.categorias && p.categorias.length ? p.categorias : [p.categoria]).filter(Boolean)
      .map(c => `<a class="pv-chip" href="/academy/marketplace?categoria=${encodeURIComponent(c)}" style="text-decoration:none">${esc(ct.catRotulo(c))}</a>`)),
    nota.media ? `<span class="pv-chip" style="color:var(--pv-ouro)">★ ${nota.media} <span style="opacity:.8;color:#E8EDF6">(${nota.total} avaliações)</span></span>` : '',
    nAulas ? `<span class="pv-chip">${svgI('texto', 15)} ${qtd(nAulas, 'aula', 'aulas')}</span>` : '',
    est ? (est.videos ? `<span class="pv-chip">${svgI('play', 15)} ${qtd(est.videos, 'videoaula', 'videoaulas')}</span>` : '')
      : (resumo.total_aulas > resumo.modulos.length ? `<span class="pv-chip">${svgI('play', 15)} ${resumo.total_aulas} conteúdos</span>` : ''),
    segVideo ? `<span class="pv-chip">${svgI('relogio', 15)} ${durSeg(segVideo)}</span>` : '',
    est && est.questoes ? `<span class="pv-chip">${svgI('alvo', 15)} ${qtd(est.questoes, 'questão', 'questões')}</span>` : '',
    resumo.total_materiais ? `<span class="pv-chip">${svgI('baixar', 15)} ${qtd(resumo.total_materiais, 'material', 'materiais')}</span>` : '',
  ].filter(Boolean).join('');

  const precoHtml = gratis
    ? '<div class="pv-preco"><b>Grátis</b></div>'
    : `<div class="pv-preco">${p.preco_promo_centavos ? `<s>${brl(p.preco_centavos)}</s>` : ''}<b>${brl(valor)}</b>${ehClube ? '<span class="mes">/mês</span>' : ''}</div>
       <p class="pv-parcela">${ehClube ? 'cancele quando quiser, sem multa' : 'Pix com liberação imediata ou cartão'}</p>`;

  const cartao = `<aside class="pv-compra">
    ${emb ? `<iframe src="${esc(emb)}" style="width:100%;aspect-ratio:16/9;border:0;display:block" allowfullscreen title="Apresentação do curso"></iframe>`
      : (trechos.length ? videoAmostra(trechos[0], { cls: 'capa', poster: capaUrl })
        : (capaUrl ? `<img class="capa" src="${capaUrl}" alt="Capa do curso ${esc(p.titulo)}">` : ''))}
    <div class="in">
      ${precoHtml}
      ${avisoIA(p)}
      <a class="pv-bt" href="${destino}">${svgI('play', 19)} ${cta}</a>
      <a class="pv-bt fan" href="/academy/app">Já sou aluno — entrar</a>
      <ul class="pv-inclui">${inclui.map(([i, txt]) => `<li>${svgI(i, 18)}<span>${txt}</span></li>`).join('')}</ul>
      ${sp.garantia_texto || p.garantia_dias
        ? `<p class="pv-garantia">${svgI('escudo', 15)} ${esc(sp.garantia_texto || `Garantia de ${p.garantia_dias} dias: se o curso não for para você, peça o reembolso dentro do prazo.`)}</p>` : ''}
    </div></aside>`;

  // CURSO QUE HOSPEDA O ESTUDE: o "conteúdo do curso" é o PROGRAMA — as disciplinas, com as aulas de cada uma —
  // e não a casca ("Comece por aqui — 1 conteúdo"). Com mais de um percurso publicado, o nome do percurso vem junto.
  const curriculoEstude = est ? `
    <div class="pv-resumo-curr">
      <span>${svgI('texto', 16)} ${qtd(est.aulas, 'aula', 'aulas')}${est.disciplinas ? ` em ${qtd(est.disciplinas, 'disciplina', 'disciplinas')}` : ''}</span>
      ${est.videos ? `<span>${svgI('play', 16)} ${qtd(est.videos, 'videoaula', 'videoaulas')}${est.video_seg ? ` · ${durSeg(est.video_seg)} de vídeo` : ''}</span>` : ''}
      ${est.questoes ? `<span>${svgI('alvo', 16)} ${qtd(est.questoes, 'questão', 'questões')}</span>` : ''}
      ${est.cards ? `<span>${svgI('doc', 16)} ${qtd(est.cards, 'card', 'cards')} de revisão</span>` : ''}
    </div>
    <div class="pv-curr pv-disc">${est.grupos.map(g => `<div class="aula">${svgI('texto', 17)}
      <span>${esc(est.percursos > 1 && g.nome !== g.percurso ? `${g.percurso} — ${g.nome}` : g.nome)}</span>
      <span class="dur">${qtd(g.aulas, 'aula', 'aulas')}</span></div>`).join('')}</div>` : '';
  const curriculo = est ? curriculoEstude : resumo.modulos.length ? `
    <div class="pv-resumo-curr">
      <span>${svgI('texto', 16)} ${nAulas} aula${nAulas > 1 ? 's' : ''}${resumo.total_express ? ` + Villela Express (${resumo.total_express} vídeos curtos)` : ''}</span>
      <span>${svgI('play', 16)} ${qtd(resumo.total_aulas, 'conteúdo', 'conteúdos')} (vídeo, artigo, material)</span>
      ${resumo.total_seg ? `<span>${svgI('relogio', 16)} ${durSeg(resumo.total_seg)} de conteúdo</span>` : ''}
      ${resumo.total_materiais ? `<span>${svgI('baixar', 16)} ${qtd(resumo.total_materiais, 'material', 'materiais')}</span>` : ''}
    </div>
    ${gote.ativo ? `<p class="pv-gote">${svgI('relogio', 15)} <b>${esc(lib.promessa(gote))}.</b>
      Este curso abre em trilha, contada da <b>sua</b> matrícula — não de uma data fixa de turma.
      ${goteDias ? `A trilha inteira se abre em ${goteDias} dias` : 'As aulas vão abrindo no ritmo da trilha'},
      e cada aula que abre é sua para sempre.</p>` : ''}
    <div class="pv-curr">${resumo.modulos.map((m, i) => `<details${i < 2 ? ' open' : ''}>
      <summary>${svgI('seta', 16)}<span>${esc(m.titulo)}</span>
        <span class="qt">${m.aulas.length} conteúdo${m.aulas.length > 1 ? 's' : ''}${m.duracao_seg ? ' · ' + durSeg(m.duracao_seg) : ''}</span></summary>
      <div class="aulas">${m.aulas.map(a => `<div class="aula">${svgI(ICO_AULA[a.tipo] || 'doc', 17)}
        <span>${esc(a.titulo)}${a.materiais ? `<span class="pv-fino"> · ${a.materiais} ${a.materiais > 1 ? 'materiais' : 'material'}</span>` : ''}${a.gratuita ? '<span class="free">degustação grátis</span>' : ''}</span>
        ${a.duracao_seg && a.tipo === 'video' ? `<span class="dur">${durSeg(a.duracao_seg)}</span>` : ''}</div>`).join('')}</div>
    </details>`).join('')}</div>` : '';

  const depoimentos = (sp.depoimentos || []).concat(reviews.map(r => ({ nome: r.nome, texto: r.texto, nota: r.nota })));
  const sobre = textoRico(sp.promessa || p.descricao_longa); // listas e subtítulos do texto do produtor, sempre escapado

  const corpo = `
  <div class="pv-hero"><div class="pv">
    <p class="pv-trilha"><a href="/academy">Villela Academy</a> › <a href="/academy/marketplace">Marketplace</a>${p.categoria ? ` › <a href="/academy/marketplace?categoria=${encodeURIComponent(p.categoria)}">${esc(ct.catRotulo(p.categoria))}</a>` : ''}</p>
    <div class="pv-chips">${chips}</div>
    <h1>${esc(sp.headline || p.titulo)}</h1>
    <p class="dek">${esc(sp.subheadline || p.subtitulo || p.descricao_curta)}</p>
    <div class="pv-autor"><span class="av">${inicial}</span>
      <span>Com <a href="/academy/produtores/${esc(p.produtor_slug)}">${esc(p.produtor_nome)}</a><br>
      <span class="pv-fino" style="color:#9FB0CB">${esc(p.titulo)}</span></span></div>
  </div></div>

  <div class="pv"><div class="pv-corpo">
    <main>
      ${secPv('O que você vai conquistar', sobre)}${secaoAmostras(trechos, destino, cta)}
      ${secPv('O que está incluído', listaPv(sp.beneficios, '', 'check'))}
      ${secPv('Conteúdo do curso', curriculo)}
      ${secPv('O que você vai aprender', listaPv(sp.aprender, 'duas', 'alvo'))}
      ${secPv('Para quem é este curso', listaPv(sp.para_quem, '', 'alvo'))}
      ${secPv('Bônus', listaPv(sp.bonus, 'bonus', 'presente'))}
      ${secPv('Quem ensina', p.produtor_nome ? `<div class="pv-prof"><span class="av">${inicial}</span>
        <div><h3>${esc(p.produtor_nome)}</h3>
        <p style="margin:0 0 8px">${esc(p.produtor_bio || 'Produtor na Villela Academy.')}</p>
        <a href="/academy/produtores/${esc(p.produtor_slug)}" style="font-weight:600">Ver todos os cursos deste autor →</a></div></div>` : '')}
      ${secPv('Quem já fez recomenda', depoimentos.length ? `<div class="pv-dep">${depoimentos.map(d => `<div class="d">
        ${d.nota ? `<span class="est">${'★'.repeat(d.nota)}</span>` : ''}
        <p class="t">"${esc(d.texto)}"</p><b style="color:var(--pv-navy)">— ${esc(d.nome)}</b></div>`).join('')}</div>` : '')}
      ${secPv('Perguntas frequentes', (sp.faq || []).length ? `<div class="pv-faq">${sp.faq.map(f => `<details>
        <summary><span>${esc(f.p)}</span><span class="mais">+</span></summary><div class="r">${esc(f.r)}</div></details>`).join('')}</div>` : '')}
    </main>
    ${cartao}
  </div></div>

  <div class="pv-fim"><div class="pv">
    <h2>${gratis ? 'Comece agora, sem custo' : 'Garanta o seu acesso'}</h2>
    <p>${esc(p.descricao_curta || sp.subheadline || '')}</p>
    <a class="pv-bt" href="${destino}">${cta}${gratis ? '' : ' — ' + brl(valor)}</a>
    ${p.garantia_dias ? `<p class="pv-fino" style="color:#9FB0CB;margin-top:16px">Garantia de ${p.garantia_dias} dias · pagamento pelo Mercado Pago</p>` : ''}
  </div></div>

  ${relacionados.length ? `<div class="pv-rel"><div class="pv">
    <h2>${areas.length ? 'Cursos relacionados' : 'Outros cursos da Villela Academy'}</h2><p class="pv-fino" style="margin:0 0 20px">${areas.length ? `Da mesma área: ${esc(areas.map(c => ct.catRotulo(c)).join(', '))}.` : 'Os mais recentes do catálogo.'}</p>
    <div class="pv-vitrine">${relacionados.map(cardProduto).join('')}</div></div></div>` : ''}${trechos.length ? SCRIPT_AMOSTRAS : ''}

  ${(billing.ativo() || gratis) ? '' : `<div class="sec" id="comprar" style="background:var(--ambar-claro)"><div class="wrap" style="max-width:560px">
      <h2>Quero ser avisado</h2>
      <p class="sub">O pagamento online chega em breve. Deixe seu contato que avisamos você — ou o produtor libera seu acesso direto.</p>
      <form class="form" id="int">
        <input id="i-nome" placeholder="Seu nome" required><input id="i-email" type="email" placeholder="E-mail" required>
        <input id="i-tel" placeholder="WhatsApp"><button class="btn" type="submit">Quero ser avisado</button>
        <p id="i-msg" class="sub" style="margin:8px 0 0"></p></form>
      <script>document.getElementById('int').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('i-msg');
        const r=await fetch('/academy/api/cursos/${esc(p.id)}/interesse',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({nome:i_nome.value,email:i_email.value,telefone:i_tel.value})});
        m.textContent=r.ok?'✅ Anotado! Você será avisado.':'Erro ao enviar.';if(r.ok)document.getElementById('int').reset();};</script>
    </div></div>`}
  ${/* BARRA DE COMPRA do celular (auditoria de 11/10/2026, M6): em tela estreita o cartão de compra desce para
       depois do conteúdo e o preço ficava a mais de 3.000 px do topo. A barra fica presa ao rodapé da tela com
       preço e botão; só aparece abaixo de 980 px (publico.css), que é quando o cartão sai do lado. Tem de ser o
       ÚLTIMO elemento do corpo: o CSS abre espaço no <footer> que vem logo depois, para a barra não cobri-lo. */''}
  <div class="pv-barra" role="region" aria-label="Preço e compra">
    <div class="pv-barra-preco">${gratis ? '<b>Grátis</b>' : `${p.preco_promo_centavos ? `<s>${brl(p.preco_centavos)}</s>` : ''}<b>${brl(valor)}</b>${ehClube ? '<span class="mes">/mês</span>' : ''}`}</div>
    <a class="pv-bt" href="${destino}">${cta}</a>
  </div>`;

  // Course é o schema que faz o curso aparecer com provedor, preço e nota nos
  // resultados; sem ele a página é só texto para o buscador. `offers` só entra
  // com preço de verdade, e `aggregateRating` só quando existe avaliação real —
  // marcação de nota inventada é motivo de penalidade.
  // Quem ensina: o produtor é uma PESSOA, salvo quando o curso é da própria casa — "Villela Academy" marcada
  // como Person é organização vestida de gente (auditoria de 11/10/2026, B6).
  const nomeProdutor = String(p.produtor_nome || '').trim();
  const quemEnsina = !nomeProdutor || /^villela academy$/i.test(nomeProdutor)
    ? { '@type': 'Organization', name: 'Villela Academy', url: `${BASE_URL()}/academy` }
    : { '@type': 'Person', name: nomeProdutor };
  const ld = {
    '@context': 'https://schema.org', '@type': 'Course', inLanguage: 'pt-BR',
    name: p.titulo, description: p.descricao_curta || sp.headline || p.subtitulo || p.titulo,
    url: `${BASE_URL()}/academy/cursos/${p.slug}`,
    provider: { '@type': 'Organization', name: 'Villela Academy', url: `${BASE_URL()}/academy` },
    author: quemEnsina,
    ...(p.capa_media_id ? { image: `${BASE_URL()}/academy/capa/${p.id}?v=${p.capa_media_id}` } : {}),
    hasCourseInstance: {
      '@type': 'CourseInstance', courseMode: 'online',
      courseWorkload: segVideo ? `PT${Math.max(1, Math.round(segVideo / 3600))}H` : undefined,
      instructor: quemEnsina,
    },
    // curso que hospeda o Estude: o programa (disciplina e nº de aulas) vai junto, como na página
    ...(est ? {
      syllabusSections: est.grupos.map(g => ({ '@type': 'Syllabus', name: g.nome, description: qtd(g.aulas, 'aula', 'aulas') })),
    } : {}),
    ...(valor ? {
      offers: {
        '@type': 'Offer', price: (valor / 100).toFixed(2), priceCurrency: 'BRL',
        availability: 'https://schema.org/InStock', url: `${BASE_URL()}/academy/cursos/${p.slug}`,
        category: ehClube ? 'Assinatura' : 'Compra única',
      },
    } : { offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL', availability: 'https://schema.org/InStock' } }),
    ...(nota.media && nota.total ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: String(nota.media), reviewCount: String(nota.total) },
    } : {}),
  };
  const ldFaq = (sp.faq || []).length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: sp.faq.slice(0, 12).map((f) => ({
      '@type': 'Question', name: f.p,
      acceptedAnswer: { '@type': 'Answer', text: f.r },
    })),
  } : null;
  return shellPublico({
    titulo: p.titulo, descricao: p.descricao_curta || sp.headline || p.subtitulo || p.titulo, url: `/academy/cursos/${p.slug}`, corpo,
    jsonld: ldFaq ? [ld, ldFaq] : ld,
    // capa do curso como og:image quando existe (melhor); og da marca é o fallback do shell
    imagem: p.capa_media_id ? `${BASE_URL()}/academy/capa/${p.id}?v=${p.capa_media_id}` : null,
    imagemDim: dimsDaCapa(p.capa_media_id), // medida real do arquivo; desconhecida = não declara
  });
}

// checkout de produto único: resumo + login inline + botão de pagamento.
// A matrícula em si só acontece server-side (webhook/consulta segura).
function checkoutHTML(slug) {
  const p = ct.Marketplace.porSlug(slug);
  if (!p) return null;
  const valor = p.preco_promo_centavos || p.preco_centavos || 0;
  const clube = p.tipo === 'clube';
  const corpo = `<div class="sec"><div class="wrap" style="max-width:560px">
    <h2>${clube ? 'Assinar clube' : `Finalizar ${valor ? 'compra' : 'matrícula'}`}</h2>
    <div class="card"><b>${esc(p.titulo)}</b><br><span class="sub" style="text-align:left;margin:0">por ${esc(p.produtor_nome)}</span>
      <p style="font-size:1.5rem;font-weight:800;color:var(--villela-navy);margin:10px 0 0">${valor ? brl(valor) + (clube ? '/mês' : '') : 'Grátis'}</p>
      ${p.preco_promo_centavos ? `<p class="sub" style="text-align:left;margin:0"><s>${brl(p.preco_centavos)}</s> preço promocional</p>` : ''}
    </div>
    <div class="card" id="cx-box"><p class="sub">Carregando…</p></div>
    <p class="sub">Pagamento processado pelo Mercado Pago. O acesso é liberado automaticamente após a confirmação.
      ${clube ? 'Assinatura mensal com renovação automática — cancele quando quiser no painel.' : ''}
      Ao ${clube ? 'assinar' : 'comprar'} você concorda com os <a href="/academy/termos" target="_blank">Termos</a> e a <a href="/academy/reembolso" target="_blank">Política de Reembolso</a>.</p>
    ${avisoIA(p)}
  </div></div>
  <script>
  (function(){
    var box=document.getElementById('cx-box');
    var CLUBE=${clube ? 'true' : 'false'};
    function pagar(){
      box.innerHTML='<p class="sub">Preparando o pagamento…</p>';
      var url=CLUBE?'/academy/api/assinar/${esc(p.id)}':'/academy/api/checkout/${esc(p.id)}';
      fetch(url,{method:'POST',headers:{'Content-Type':'application/json'}})
        .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.erro||'erro');return d;})})
        .then(function(d){
          if(d.gratis){location.href='/academy/obrigado?pedido='+d.order_id;}
          else if(CLUBE){location.href=d.init_point;}
          else {location.href=d.init_point;}
        })
        .catch(function(e){ box.innerHTML='<p class="erro">'+e.message+'</p><p><button class="btn peq" onclick="location.reload()">Tentar de novo</button></p>'; });
    }
    function formPagar(me){
      box.innerHTML='<p>Olá, <b>'+me.usuario.nome.replace(/</g,'&lt;')+'</b>! O acesso será liberado nesta conta ('+me.usuario.email.replace(/</g,'&lt;')+').</p>'+
        '<p><button class="btn" id="b-pagar">${clube ? '🔁 Assinar com Mercado Pago' : (valor ? '💳 Pagar com Mercado Pago' : '🎁 Confirmar matrícula grátis')}</button></p>';
      document.getElementById('b-pagar').onclick=pagar;
    }
    function formLogin(){
      box.innerHTML='<p><b>Entre para continuar</b> — o acesso fica vinculado à sua conta.</p>'+
        '<input id="cx-em" type="email" placeholder="E-mail"><input id="cx-sn" type="password" placeholder="Senha">'+
        '<p><button class="btn peq" id="cx-entrar">Entrar</button> <span id="cx-msg" class="erro"></span></p>'+
        '<p class="sub" style="text-align:left">Não tem conta? <a href="/academy/app#cadastro" target="_blank">Crie grátis</a> e depois <a href="#" onclick="location.reload();return false">continue aqui</a>.</p>';
      document.getElementById('cx-entrar').onclick=function(){
        fetch('/academy/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('cx-em').value,senha:document.getElementById('cx-sn').value})})
          .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.erro||'erro');return d;})})
          .then(boot).catch(function(e){document.getElementById('cx-msg').textContent=e.message;});
      };
    }
    function boot(){ fetch('/academy/api/me').then(function(r){ if(!r.ok) throw 0; return r.json(); }).then(formPagar).catch(formLogin); }
    boot();
  })();
  </script>`;
  return shellPublico({ titulo: 'Checkout — ' + p.titulo, descricao: 'Finalize sua compra na Villela Academy.', corpo, noindex: true });
}

function obrigadoHTML() {
  const corpo = `<div class="sec"><div class="wrap" style="max-width:560px">
    <div class="card" id="ob-box"><h2 style="text-align:left">⏳ Confirmando seu pagamento…</h2>
      <p class="sub" style="text-align:left">Isso costuma levar poucos segundos. Pix aprova na hora; boleto pode demorar até a compensação.</p></div>
  </div></div>
  <script>
  (function(){
    var id=new URLSearchParams(location.search).get('pedido'); var box=document.getElementById('ob-box'); var tent=0;
    function pronto(t){ box.innerHTML='<h2 style="text-align:left">🎉 Acesso liberado!</h2><p>Seu acesso a <b>'+t.replace(/</g,'&lt;')+'</b> está ativo.</p><p><a class="btn" href="/academy/app">Ir para a minha biblioteca</a></p>'; }
    function falhou(st){ box.innerHTML='<h2 style="text-align:left">😕 Pagamento '+st+'</h2><p class="sub" style="text-align:left">Você pode tentar de novo — nenhum valor foi cobrado.</p><p><a class="btn" href="javascript:history.back()">Tentar novamente</a></p>'; }
    function checa(){
      fetch('/academy/api/pedidos/'+id+'/status').then(function(r){return r.json();}).then(function(d){
        if(d.status==='paga') return pronto(d.produto_titulo||'seu produto');
        if(d.status==='recusada'||d.status==='cancelada') return falhou(d.status);
        tent++;
        if(tent===3) fetch('/academy/api/pedidos/'+id+'/conferir',{method:'POST'}).catch(function(){});
        if(tent<20) setTimeout(checa,4000);
        else box.innerHTML+='<p class="aviso">Ainda aguardando a confirmação. Pode fechar esta página — o acesso é liberado automaticamente quando o pagamento cair, e fica na sua biblioteca em /academy/app.</p>';
      }).catch(function(){ if(++tent<20) setTimeout(checa,4000); });
    }
    if(id) checa(); else box.innerHTML='<p class="erro">Pedido não informado.</p>';
  })();
  </script>`;
  return shellPublico({ titulo: 'Obrigado', descricao: 'Confirmação de compra na Villela Academy.', corpo, noindex: true });
}

function obrigadoAssinaturaHTML() {
  const corpo = `<div class="sec"><div class="wrap" style="max-width:560px">
    <div class="card" id="oa-box"><h2 style="text-align:left">⏳ Ativando sua assinatura…</h2>
      <p class="sub" style="text-align:left">A confirmação chega em instantes, assim que o Mercado Pago autorizar a recorrência.</p></div>
  </div></div>
  <script>
  (function(){
    var id=new URLSearchParams(location.search).get('assinatura'); var box=document.getElementById('oa-box'); var tent=0;
    function checa(){
      fetch('/academy/api/assinaturas/'+id+'/status').then(function(r){return r.json();}).then(function(d){
        if(d.status==='ativa'){ box.innerHTML='<h2 style="text-align:left">🎉 Assinatura ativa!</h2><p>Bem-vindo ao <b>'+String(d.produto_titulo||'clube').replace(/</g,'&lt;')+'</b>.</p><p><a class="btn" href="/academy/app">Ir para a minha biblioteca</a></p>'; return; }
        if(d.status==='cancelada'){ box.innerHTML='<h2 style="text-align:left">😕 Assinatura não concluída</h2><p><a class="btn" href="javascript:history.back()">Tentar novamente</a></p>'; return; }
        if(++tent<20) setTimeout(checa,4000);
        else box.innerHTML+='<p class="aviso">Ainda aguardando a autorização. Pode fechar — o acesso aparece na sua biblioteca em /academy/app assim que ativar.</p>';
      }).catch(function(){ if(++tent<20) setTimeout(checa,4000); });
    }
    if(id) checa(); else box.innerHTML='<p class="erro">Assinatura não informada.</p>';
  })();
  </script>`;
  return shellPublico({ titulo: 'Assinatura', descricao: 'Confirmação de assinatura na Villela Academy.', corpo, noindex: true });
}

function produtorHTML(slug) {
  const pr = ct.Marketplace.produtorPorSlug(slug);
  if (!pr) return null;
  const corpo = `<div class="hero" style="padding:40px 0"><div class="wrap">
      <span class="badge">Produtor</span><h1>${esc(pr.nome_publico)}</h1>
      <p>${esc(pr.bio || '')}</p>${pr.site ? `<p><a class="btn o" href="${esc(pr.site)}" rel="noopener nofollow" target="_blank">Site / rede social</a></p>` : ''}
    </div></div>
    <div class="sec"><div class="wrap"><h2>Produtos de ${esc(pr.nome_publico)}</h2>
      ${pr.produtos.length ? `<div class="grid">${pr.produtos.map(p => cardProduto({ ...p, produtor_nome: pr.nome_publico })).join('')}</div>` : '<p class="sub">Nenhum produto publicado ainda.</p>'}
    </div></div>`;
  return shellPublico({ titulo: pr.nome_publico, descricao: (pr.bio || `Produtos de ${pr.nome_publico} na Villela Academy.`).slice(0, 200), url: `/academy/produtores/${pr.slug}`, corpo });
}

// IA paga à parte: o aviso aparece na página de venda e no checkout A PARTIR do momento em que
// o dono liga a cobrança (carteira-ia.js) — antes disso, dizer "pago" seria falso; depois,
// não dizer seria vender sem avisar. Por isso sai da config, e não do texto de cada curso.
// O QUE O PREÇO INCLUI sai do que o curso TEM (auditoria de 11/10/2026, B2): a frase era fixa e prometia "o quiz"
// a curso sem quiz nenhum. Curso que hospeda o Estude tem a prática DENTRO do percurso (questões e caderno de
// erros), não o quiz da Academy; curso comum só fala em quiz quando há quiz publicado. Sem produto (chamada
// antiga), a lista fica no que todo curso tem.
function inclusoNoPreco(p) {
  let est = null, quiz = false;
  try { if (p) { est = ct.Marketplace.resumoDoEstude(p.id); quiz = ct.Marketplace.temQuiz(p.id); } } catch (_) { /* na dúvida, promete menos */ }
  const itens = est
    ? ['O curso', 'as aulas', est.videos ? 'as videoaulas' : '', est.questoes ? 'as questões' : '', est.questoes ? 'o caderno de erros' : '', 'o certificado']
    : ['O curso', 'os vídeos', 'os materiais', quiz ? 'o quiz' : '', 'o certificado'];
  const l = itens.filter(Boolean);
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]} estão incluídos no preço.`;
}
function avisoIA(p) {
  let ligada = false;
  try { ligada = !!require('./carteira-ia').cfg().ligada; } catch (_) { /* sem a carteira, não há o que avisar */ }
  if (!ligada) return '';
  return `<p class="pv-ia" style="font-size:.84rem;line-height:1.45;margin:10px 0;padding:9px 11px;border-left:3px solid #D97706;background:#FEF3E7;border-radius:6px;color:#7A3E06">
    <b>O Tutor Villela e as ferramentas de IA são pagos à parte, por uso.</b> ${esc(inclusoNoPreco(p))}
    A IA usa saldo pré-pago: você vê o valor antes de cada uso e paga só o que usar. <a href="/academy/creditos-ia" style="color:#7A3E06">Como funciona</a>.</p>`;
}

// Termos/privacidade: MINUTA — o carimbo só sai depois de validado por advogado (OAB); é regra da casa.
// A FRASE da faixa, porém, não pode mentir (auditoria de 11/10/2026, M4): dizia "antes da operação
// comercial" com o checkout aberto. Agora diz o que é verdade: o texto está em validação e, até a versão
// definitiva, é o que vale. Uma faixa só, igual em todas as páginas legais (`FAIXA_MINUTA`).
//
// PONTOS PENDENTES DE ADVOGADO — ficam AQUI, fora do texto público (lista completa em
// docs\estudo\MINUTA-termos-pedidos-e-audio.md, seção "Publicado como minuta em 11/10/2026"):
//   [A VALIDAR]   base legal de cada tratamento (o texto fala em "executar o serviço", "obrigação legal" e
//                 "consentimento" sem citar artigo da LGPD);
//   [A VALIDAR]   transferência internacional e salvaguardas dos operadores (arts. 33 a 36 da LGPD): o texto
//                 nomeia os operadores que o CÓDIGO comprova e diz que pode haver tratamento fora do Brasil;
//   [A VALIDAR]   idade mínima / declaração de idade: nada foi escrito (o cadastro não pergunta a idade);
//   [A VALIDAR]   nome do encarregado e canal fora do painel: o texto aponta o Suporte, único canal publicado;
//   [A VALIDAR]   aviso/consentimento do Google Analytics da landing /academy (a política só o descreve);
//   [A CONFIRMAR] tentativa que falha dentro de um pedido concluído: o código já NÃO a cobra do aluno
//                 (ia.js, `custoCobrado`), mas o texto promete só "o custo efetivo, nunca acima do aceito";
//   [A CONFIRMAR] critério do certificado (todas as aulas + um simulado): fica na página do curso, não aqui;
//   [A VALIDAR]   enquadramento do saldo pré-pago e do arrependimento sobre pedido já executado.
const FAIXA_MINUTA = '<div class="aviso"><b>MINUTA</b> — texto em validação jurídica. Enquanto a versão definitiva não é publicada, estas são as condições em vigor.</div>';
function paginaLegal(titulo, corpo) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(titulo)} — Villela Academy</title>${HEAD_MARCA}<link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS} .doc{max-width:760px;margin:32px auto;padding:0 18px;line-height:1.6}</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"></head>
    <body class="vx" data-vertical="academy"><div class="doc"><p><a href="/academy">← Villela Academy</a></p>
    ${FAIXA_MINUTA}
    <h1 style="color:var(--villela-navy)">${esc(titulo)}</h1>${corpo}
    <p class="sub" style="text-align:left">Villela Academy é um produto da Augusto Villela Ltda (CNPJ 56.776.526/0001-12).</p>
    </div></body></html>`;
}
// Operadores citados nos textos: só os que o código comprova — Anthropic (ia.js, SDK @anthropic-ai/sdk: texto e
// PDF), OpenAI (ia.js, /v1/audio/transcriptions: áudio), Mercado Pago (billing.js e carteira-ia.js), Cloudflare R2
// (storage.js), Render (hospedagem: docs\integracoes\backend-portal.md) e Google (o gtag da landing, `GA`, acima).
const TERMOS = `<p>Estes Termos de Uso regem o acesso à plataforma Villela Academy por alunos, produtores e afiliados. Complementam-se pela <a href="/academy/privacidade">Política de Privacidade</a>, pela <a href="/academy/reembolso">Política de Reembolso</a> e pelos <a href="/academy/creditos-ia">Termos dos Créditos de IA</a>.</p>
  <h3>1. Conta</h3>
  <ul><li>A conta é pessoal e intransferível; você responde pelo que fizer com ela.</li>
  <li>Compartilhar acesso, redistribuir ou revender conteúdo comprado viola estes termos.</li></ul>
  <h3>2. Conteúdo e conduta</h3>
  <ul><li>Produtores respondem pelo conteúdo que publicam e declaram ter os direitos autorais do material.</li>
  <li>É proibido conteúdo ilegal, enganoso, adulto, perigoso, discriminatório ou que viole direitos de terceiros; a plataforma pode revisar, suspender e remover conteúdo e contas.</li>
  <li>As condições de quem vende e de quem divulga estão nos <a href="/academy/termos-produtor">Termos do Produtor</a> e nos <a href="/academy/termos-afiliado">Termos do Afiliado</a>.</li></ul>
  <h3>3. Compra e acesso</h3>
  <ul><li>A página de venda de cada curso informa o preço e, quando houver, o prazo de acesso e a garantia.</li>
  <li>O pagamento é processado pelo Mercado Pago; o acesso é liberado quando ele confirma o pagamento.</li>
  <li>Arrependimento, garantia e devolução seguem a <a href="/academy/reembolso">Política de Reembolso</a>.</li></ul>
  <h3>4. Funções de IA e pedidos pagos por uso</h3>
  <ul><li>As funções que acionam um provedor de inteligência artificial a cada uso (como o Tutor Villela) são pagas à parte, do saldo de créditos de IA, conforme os <a href="/academy/creditos-ia">Termos dos Créditos de IA</a>.</li>
  <li>A plataforma também oferece <b>pedidos pagos por uso</b> — correção de resposta discursiva, de peça e de resposta oral; importação de prova em PDF; leitura de edital em PDF. Essa função é liberada aos poucos e pode ainda não estar disponível na sua conta.</li>
  <li>Antes de qualquer cobrança, a tela mostra o valor máximo e pede o seu aceite. Quando o saldo não basta, a recarga feita para pagar um pedido tem valor mínimo de R$ 50,00.</li></ul>
  <h3>5. Natureza do conteúdo e dos resultados</h3>
  <ul><li>Os cursos e as ferramentas são material de estudo. A plataforma não garante resultado em concurso, exame ou seleção.</li>
  <li>A nota e os comentários produzidos por inteligência artificial são <b>estimativa</b> e apoio de estudo: não equivalem à avaliação de banca examinadora e podem conter erros.</li></ul>
  <h3>6. Certificado</h3>
  <ul><li>Ao concluir um curso, o aluno pode emitir o certificado de conclusão da Villela Academy, que pode ser conferido pelo código impresso nele.</li>
  <li>Os cursos são <b>cursos livres</b>: o certificado <b>não tem validade para o MEC</b> e não constitui título nem habilitação profissional. O critério de emissão é informado em cada curso.</li></ul>
  <h3>7. Conteúdo enviado pelo usuário</h3>
  <ul><li>Ao enviar respostas, áudios e arquivos (como provas e editais em PDF), você declara ter o direito de enviá-los e responde pelo conteúdo enviado.</li>
  <li>A leitura automática de arquivos pode conter erros; o que não pôde ser conferido com o documento fica marcado para a sua revisão. O percurso particular criado a partir dos seus arquivos é visível apenas a você.</li>
  <li>O áudio da resposta oral fica guardado por 6 meses e depois é apagado; os detalhes estão na <a href="/academy/privacidade">Política de Privacidade</a>.</li></ul>
  <h3>8. Mudanças e contato</h3>
  <ul><li>Mudanças nestes termos são informadas na plataforma e valem para o uso posterior à publicação.</li>
  <li>Dúvidas e pedidos: pelo Suporte, no painel, em Conta.</li></ul>`;
const TERMOS_PRODUTOR = `<p>Termos específicos de quem vende na Villela Academy (complementam os Termos de Uso).</p>
  <ul><li>O produtor declara ser titular dos direitos do conteúdo publicado e responde civil e criminalmente por ele.</li>
  <li>Todo produto passa por revisão editorial e pode ser rejeitado, suspenso ou removido conforme a Política de Conteúdo.</li>
  <li>Comissões da plataforma, prazos de repasse e taxas serão definidos comercialmente antes da ativação do checkout (Fase 4).</li>
  <li>Reembolsos concedidos ao comprador estornam o valor do produtor conforme a Política de Reembolso.</li>
  <li>Dados de alunos ficam restritos à finalidade da entrega do produto (LGPD) — proibido exportar para uso externo sem consentimento.</li></ul>`;
const TERMOS_AFILIADO = `<p>Termos específicos de quem divulga produtos da Villela Academy por comissão.</p>
  <ul><li>Divulgação honesta: proibido spam, promessas enganosas, uso indevido de marca ou compra pelo próprio link.</li>
  <li>A comissão só é devida sobre venda confirmada e é bloqueada em caso de reembolso ou chargeback.</li>
  <li>Percentuais, prazo de cookie e regras de atribuição são definidos por produto (Fase 5).</li>
  <li>Violação das regras leva a suspensão/bloqueio e perda das comissões pendentes.</li></ul>`;
const REEMBOLSO = `<p>Política de reembolso (consumidor). Nada aqui reduz os direitos que o Código de Defesa do Consumidor garante.</p>
  <h3>1. Cursos e produtos</h3>
  <ul><li>Compras online têm direito de arrependimento de 7 dias (art. 49 do CDC), com reembolso integral.</li>
  <li>Produtos podem oferecer garantia estendida própria (indicada na página de venda).</li>
  <li>Ao reembolsar, o acesso ao conteúdo é revogado e comissões associadas são canceladas.</li>
  <li>A devolução é feita pelo mesmo meio de pagamento da compra, pelo Mercado Pago.</li></ul>
  <h3>2. Assinaturas</h3>
  <ul><li>A assinatura pode ser cancelada pelo próprio assinante no painel; o cancelamento interrompe as cobranças seguintes.</li></ul>
  <h3>3. Créditos de IA e pedidos pagos por uso</h3>
  <ul><li><b>Recarga:</b> em até 7 dias, devolve-se o valor da recarga (ou a parte não usada, se já houve uso). Depois disso, o saldo comprado e ainda não usado pode ser devolvido a pedido.</li>
  <li><b>Recarga feita para pagar um pedido:</b> tem valor mínimo de R$ 50,00. O que exceder o custo do pedido fica como saldo de créditos de IA, nas mesmas condições da recarga comum — inclusive as de devolução.</li>
  <li><b>Pedido que não se conclui</b> por falha técnica: o valor reservado volta integralmente ao saldo.</li>
  <li><b>Pedido concluído:</b> o valor consumido não é devolvido, salvo falha da plataforma. Discordar da nota não gera devolução automática; a discordância registrada é analisada pela Academy.</li>
  <li>As regras completas estão nos <a href="/academy/creditos-ia">Termos dos Créditos de IA</a>.</li></ul>
  <h3>4. Como pedir</h3>
  <ul><li>Solicitações: pelo Suporte, no painel, em Conta.</li></ul>`;
// Termos dos créditos de IA (saldo pré-pago). MINUTA: as escolhas de validade e de devolução
// abaixo são PROPOSTA a validar com advogado e a confirmar pelo Augusto (docs\estudo\DECISIONS\ADR-0003).
// A margem não é publicada; o que se promete ao usuário é o método de preço e o valor antes do uso.
const CREDITOS_IA = `<p>Estes termos tratam do <b>saldo de créditos de IA</b> da Villela Academy: o valor pré-pago que o usuário usa para o Tutor Villela, o mentor do Villela Lab, o "lapidar com IA", os pedidos pagos por uso (correção de respostas, importação de prova e leitura de edital) e as demais funções que dependem de provedores de inteligência artificial. Complementam os Termos de Uso e a Política de Reembolso.</p>
  <h3>1. O que é pago à parte</h3>
  <ul><li>O preço de um curso inclui as aulas, os vídeos, os materiais, o quiz, o caderno, a jornada e o certificado.</li>
  <li>As funções que acionam um provedor de IA a cada uso são cobradas <b>por uso</b>, do saldo de créditos. A página de venda e a tela de pagamento de cada curso informam isso.</li>
  <li>Quem já tinha matrícula em um curso <b>antes</b> do início desta cobrança mantém, naquele curso, a quantidade diária de consultas gratuitas que valia na compra. Esgotada a quantidade do dia, o uso adicional sai do saldo.</li></ul>
  <h3>2. Como o preço é calculado</h3>
  <ul><li>O valor de cada uso parte do custo cobrado pelo provedor de IA, em dólares, convertido para reais pela cotação PTAX de venda do Banco Central vigente, acrescido de encargos de conversão e de uma taxa de serviço da plataforma.</li>
  <li><b>Antes de gerar, a tela mostra o valor máximo daquele uso</b> e pede confirmação. Sem confirmação, nada é gerado e nada é cobrado.</li>
  <li>Depois de gerar, é debitado apenas o custo efetivo, nunca acima do valor máximo aceito; a diferença volta ao saldo na hora.</li>
  <li>Se a geração falhar, nada é cobrado: o valor reservado é devolvido integralmente ao saldo.</li>
  <li>O extrato, em Conta e pagamentos, mostra cada recarga e cada uso.</li>
  <li>O preço pode variar de um dia para o outro com a cotação do dólar e com os preços do provedor. A variação vale para usos futuros; o saldo, que é em reais, não muda.</li></ul>
  <h3>3. Recarga</h3>
  <ul><li>A recarga comum é feita em pacotes de valor fixo — hoje R$ 20, R$ 50 e R$ 100; os pacotes em vigor aparecem na tela de recarga —, pagos pelo Mercado Pago (Pix ou cartão). Dados de cartão vão direto ao Mercado Pago, nunca aos nossos servidores.</li>
  <li><b>Recarga para pagar um pedido:</b> quando o saldo não basta para um pedido pago por uso, a recarga feita na hora cobre o que falta e tem valor mínimo de R$ 50,00. O que exceder o custo do pedido permanece como saldo de créditos de IA, nas mesmas condições do saldo comprado por recarga comum.</li>
  <li>O crédito entra no saldo quando o pagamento é confirmado pelo Mercado Pago.</li></ul>
  <h3>4. Pedidos pagos por uso</h3>
  <ul><li>Além das consultas ao Tutor e das demais funções de IA, a Academy oferece pedidos pagos por uso, descontados do saldo: (a) correção de resposta discursiva, de peça e de resposta oral; (b) importação de prova em PDF; (c) leitura de edital em PDF. <b>Essa função é liberada aos poucos</b> e pode ainda não estar disponível em todos os cursos e contas.</li>
  <li><b>Orçamento e aceite:</b> antes de qualquer cobrança, a tela mostra o valor máximo do pedido, e ele só é executado depois do aceite. O valor máximo é reservado no saldo no momento do aceite; concluído o pedido, cobra-se apenas o custo efetivo, e a diferença volta ao saldo. Nunca se cobra acima do valor aceito.</li>
  <li><b>Pedido que não se conclui:</b> se o pedido falhar por motivo técnico, o valor reservado volta integralmente ao saldo.</li>
  <li><b>Natureza do resultado:</b> a correção é apoio de estudo produzido por inteligência artificial a partir da rubrica da questão. A nota é <b>estimativa</b>: não equivale à avaliação de banca examinadora e não garante resultado em concurso. O usuário pode registrar discordância da correção; o registro é analisado pela Academy e não gera devolução automática.</li>
  <li><b>Arquivos enviados:</b> o usuário declara ter o direito de enviar os arquivos (editais e provas) e responde pelo conteúdo enviado. A leitura automática pode conter erros; itens e questões cuja leitura não pôde ser conferida com o documento ficam marcados para revisão do próprio usuário. O percurso particular criado a partir desses arquivos é visível apenas a ele.</li>
  <li><b>Áudio da resposta oral:</b> é transcrito por provedor de transcrição e fica guardado por 6 meses, com download enquanto estiver disponível; depois é apagado. A transcrição e a correção permanecem no histórico.</li>
  <li><b>Limites de uso:</b> a Academy pode limitar a quantidade diária de pedidos e o tamanho dos arquivos, para proteger o serviço.</li></ul>
  <h3>5. Validade do saldo</h3>
  <ul><li>O saldo <b>comprado</b> não tem prazo de validade: fica disponível enquanto a conta existir.</li>
  <li>O saldo é em reais, não rende, não é transferível a outra conta e só pode ser usado nas funções de IA da Villela Academy. Não é conta de pagamento nem meio de pagamento para outros produtos.</li></ul>
  <h3>6. Arrependimento e devolução do saldo não usado</h3>
  <ul><li><b>Em até 7 dias da recarga</b> (direito de arrependimento, art. 49 do Código de Defesa do Consumidor): devolução do valor da recarga. Se parte dela já tiver sido usada, devolve-se a parte não usada.</li>
  <li><b>Depois de 7 dias:</b> o saldo comprado e ainda não usado pode ser devolvido a pedido do usuário, pelo mesmo meio de pagamento da recarga.</li>
  <li>O valor já consumido em usos concluídos não é devolvido, salvo falha da plataforma.</li>
  <li>Pedidos: pelo Suporte, em Conta e pagamentos, ou pelo e-mail da conta. Prazo de resposta: até 10 dias úteis.</li>
  <li>Ao encerrar a conta, o saldo comprado e não usado é devolvido a pedido, na forma acima.</li></ul>
  <h3>7. Créditos de cortesia</h3>
  <ul><li>A plataforma pode conceder créditos de cortesia. Eles aparecem identificados no extrato, não têm valor em dinheiro, não são devolvidos nem convertidos em reais e podem ter prazo ou ser retirados se não usados.</li>
  <li>Quando há saldo comprado e de cortesia na mesma conta, a devolução considera apenas o saldo comprado.</li></ul>
  <h3>8. Contestação do pagamento (chargeback) e reembolso pelo meio de pagamento</h3>
  <ul><li>Se o pagamento de uma recarga for contestado, estornado ou reembolsado pelo meio de pagamento, o crédito correspondente é retirado do saldo.</li>
  <li>Se esse crédito já tiver sido usado, o saldo fica negativo e as funções de IA ficam suspensas até a regularização. O acesso aos cursos comprados não é afetado por isso.</li>
  <li>Contestações indevidas ou reiteradas podem levar à suspensão da recarga na conta.</li></ul>
  <h3>9. Sobre as respostas da IA</h3>
  <ul><li>As respostas são apoio ao estudo, geradas por modelos de inteligência artificial com base no material do curso. Podem conter erros e não substituem a conferência nas fontes nem orientação profissional.</li>
  <li>A cobrança se refere ao uso do serviço, e não à concordância do usuário com o conteúdo da resposta.</li>
  <li>Para gerar as respostas, o texto enviado e os arquivos em PDF são processados por modelos da Anthropic; o áudio das respostas orais é transcrito por serviço da OpenAI. O tratamento pode ocorrer fora do Brasil. Os detalhes estão na <a href="/academy/privacidade">Política de Privacidade</a>.</li></ul>
  <h3>10. Mudanças</h3>
  <ul><li>Mudanças nestes termos valem para recargas e usos posteriores à publicação e são informadas na plataforma. O saldo já comprado é preservado.</li></ul>`;
const PRIVACIDADE = `<p>Tratamos dados pessoais conforme a LGPD (Lei 13.709/2018). A Villela Academy é operada pela Augusto Villela Ltda, responsável pelo tratamento descrito aqui.</p>
  <h3>1. Dados que tratamos</h3>
  <ul><li><b>Cadastro:</b> coletamos o mínimo necessário — nome, e-mail, telefone e, para produtores/afiliados, dados de documento e pagamento para repasses.</li>
  <li><b>Compras:</b> pedidos, valores, recargas e o extrato do saldo de créditos de IA. Dados de cartão vão direto ao Mercado Pago, nunca aos nossos servidores.</li>
  <li><b>Estudo:</b> progresso nas aulas, o tempo que você passa com cada aula aberta, respostas e notas, certificados, anotações, marcações, tentativas, o que você escreve no caderno e na comunidade, e as mensagens ao Suporte.</li>
  <li><b>Funções de IA:</b> as perguntas e os textos que você envia ao Tutor Villela e às demais funções de IA, e as respostas geradas.</li>
  <li><b>Pedidos pagos por uso:</b> o texto das respostas escritas; o áudio das respostas orais e a transcrição desse áudio; os arquivos PDF enviados (editais e provas) e o que deles for extraído; e os registros de discordância da correção.</li>
  <li><b>Acesso e segurança:</b> registros de sessão (data, endereço IP e navegador) e de auditoria.</li></ul>
  <h3>2. Para que usamos</h3>
  <ul><li>Para operar a plataforma e executar o serviço que você pediu (conta, compras, entrega de conteúdo, funções de IA, pedidos, certificados, comissões).</li>
  <li>Para cumprir obrigações legais e fiscais e para a segurança da plataforma.</li>
  <li>Com consentimento, para comunicações.</li>
  <li>Não vendemos dados pessoais.</li></ul>
  <h3>3. Com quem compartilhamos (operadores)</h3>
  <p>Compartilhamos apenas com os fornecedores necessários para o serviço funcionar:</p>
  <ul><li><b>Mercado Pago</b> — processa os pagamentos de cursos, assinaturas e recargas.</li>
  <li><b>Anthropic</b> — provedor dos modelos de inteligência artificial que geram as respostas do Tutor, as correções e a leitura de provas e editais: recebe o texto enviado e os arquivos em PDF.</li>
  <li><b>OpenAI</b> — provedor da transcrição: recebe o áudio das respostas orais.</li>
  <li><b>Cloudflare</b> (armazenamento R2) — guarda os arquivos da plataforma, entre eles os vídeos, os materiais e os arquivos e áudios que você envia.</li>
  <li><b>Render</b> — hospeda a aplicação e o banco de dados.</li>
  <li><b>Google</b> — mede as visitas da página inicial pública (Google Analytics) e fornece as fontes tipográficas das páginas.</li>
  <li>Serviços de envio de e-mail e de notificação, para as mensagens da plataforma.</li></ul>
  <p>Esses fornecedores podem tratar dados <b>fora do Brasil</b>.</p>
  <h3>4. Cookies e medição de visitas</h3>
  <ul><li>Usamos um cookie de sessão, necessário para manter você conectado.</li>
  <li>Contamos as visitas às páginas com medição própria, que não grava o endereço IP. Para quem <b>não</b> está conectado, a contagem é anônima e não usa cookie.</li>
  <li>Quando você está <b>conectado</b> à sua conta, um segundo cookie (só com o código da conta, protegido contra falsificação, e que não dá acesso a ela) associa à sua conta as páginas que você visita nos sites do Grupo Villela Stay — Academy, Livraria e sistemas — e medimos o tempo com a aula aberta. Usamos isso para entender o uso dos cursos e melhorar o conteúdo. As visitas associadas ficam guardadas por até 120 dias; o tempo nas aulas faz parte do seu histórico de estudo e vai na exportação dos seus dados. Ao sair da conta, o cookie é apagado.</li>
  <li>A página inicial pública (<a href="/academy">/academy</a>) carrega o Google Analytics, que pode gravar cookies e registrar dados de navegação, como páginas vistas e endereço IP. É possível bloqueá-lo nas configurações do navegador.</li></ul>
  <h3>5. Por quanto tempo guardamos</h3>
  <ul><li><b>Áudio da resposta oral:</b> fica guardado por <b>6 meses</b> a contar do envio e é apagado depois disso. A tela informa a data-limite e permite <b>baixar o próprio áudio</b> enquanto ele estiver disponível. A transcrição e a correção permanecem no seu histórico.</li>
  <li>Os demais dados da conta ficam guardados enquanto a conta existir.</li>
  <li>Registros financeiros (valor e data de compras, recargas e pedidos) são mantidos pelo prazo exigido em lei.</li></ul>
  <h3>6. Seus direitos, exportação e exclusão</h3>
  <ul><li>Você pode pedir confirmação e acesso aos seus dados, correção, informação sobre o compartilhamento, exclusão e revogação de consentimento.</li>
  <li><b>Exportação:</b> você pode exportar seus dados direto no painel, em Conta — o cadastro, os textos que escreveu, os registros de estudo e de compra e os pedidos que fez.</li>
  <li><b>Exclusão:</b> você pode excluir a conta direto no painel, em Conta. Os dados de identificação são anonimizados; o áudio, os arquivos enviados, as respostas, as transcrições, as correções, as anotações e o percurso particular são apagados. Permanece o registro financeiro (valor e data), pelo prazo legal.</li></ul>
  <h3>7. Encarregado e contato</h3>
  <ul><li>O canal do <b>encarregado pelo tratamento de dados pessoais</b> é o Suporte da plataforma: no painel, em Conta, seção Suporte. As respostas chegam por ali e pelo e-mail da conta.</li></ul>
  <h3>8. Mudanças</h3>
  <ul><li>Mudanças nesta política são informadas na plataforma.</li></ul>`;

function registrarPaginas(app, { notificar }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  app.get('/academy', (req, res) => res.send(landingHTML()));
  app.get('/academy/app', (req, res) => res.send(appHTML()));
  app.get('/academy/app.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-cliente.js')));
  app.get('/academy/aluno.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-aluno.js')));
  app.get('/academy/ecossistema.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-ecossistema.js')));
  app.get('/academy/jornada.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-jornada.js')));
  app.get('/academy/carteira.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-carteira.js')));
  app.get('/academy/estude.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-estudo.js')));
  // os motores puros do Estude (pontuação, prazo, plano, cronograma) para as Ferramentas, que rodam no navegador
  app.get('/academy/estude-motores.js', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.type('application/javascript').send(require('./estudo/motores-navegador').pacote()); });
  app.get('/academy/estude.css', (req, res) => res.type('text/css').sendFile(path.join(__dirname, 'estude.css')));
  app.get('/academy/aluno.css', (req, res) => res.type('text/css').sendFile(path.join(__dirname, 'aluno.css')));
  app.get('/academy/publico.css', (req, res) => res.type('text/css').sendFile(path.join(__dirname, 'publico.css')));
  app.get('/academy/termos', (req, res) => res.send(paginaLegal('Termos de Uso', TERMOS)));
  app.get('/academy/privacidade', (req, res) => res.send(paginaLegal('Política de Privacidade', PRIVACIDADE)));
  app.get('/academy/termos-produtor', (req, res) => res.send(paginaLegal('Termos do Produtor', TERMOS_PRODUTOR)));
  app.get('/academy/termos-afiliado', (req, res) => res.send(paginaLegal('Termos do Afiliado', TERMOS_AFILIADO)));
  app.get('/academy/reembolso', (req, res) => res.send(paginaLegal('Política de Reembolso', REEMBOLSO)));
  app.get('/academy/creditos-ia', (req, res) => res.send(paginaLegal('Termos dos Créditos de IA', CREDITOS_IA)));

  // ---- vitrine pública (FASE 3) ----
  app.get('/academy/marketplace', (req, res) => res.send(marketplaceHTML({ q: s(req.query.q, 80), categoria: s(req.query.categoria, 40) })));
  app.get('/academy/categorias/:slug', (req, res) => res.redirect(302, '/academy/marketplace?categoria=' + encodeURIComponent(s(req.params.slug, 40))));
  app.get('/academy/cursos/:slug', (req, res) => {
    const html = cursoHTML(s(req.params.slug, 90));
    if (!html) return res.status(404).send(paginaErro('Curso não encontrado', 'Este produto não existe ou não está publicado.'));
    // rastreio de afiliado (?ref=): registra o clique e arma o cookie de atribuição
    const ref = s(req.query.ref, 30);
    if (ref) {
      const af = require('./repo-afiliados');
      const l = af.Links.registrarClique(ref, String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim());
      if (l) res.cookie('academy_ref', l.id, {
        httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax',
        maxAge: af.cookieDias() * 864e5, path: '/academy',
      });
    }
    res.send(html);
  });
  app.get('/academy/checkout/:slug', (req, res) => {
    const html = checkoutHTML(s(req.params.slug, 90));
    if (!html) return res.status(404).send(paginaErro('Curso não encontrado', 'Este produto não existe ou não está publicado.'));
    res.send(html);
  });
  app.get('/academy/obrigado', (req, res) => res.send(obrigadoHTML()));
  app.get('/academy/obrigado-assinatura', (req, res) => res.send(obrigadoAssinaturaHTML()));
  app.get('/academy/produtores/:slug', (req, res) => {
    const html = produtorHTML(s(req.params.slug, 90));
    if (!html) return res.status(404).send(paginaErro('Produtor não encontrado', 'Esta página de produtor não existe.'));
    res.send(html);
  });
  // capa pública: SÓ de produto publicado (sem sessão; único arquivo exposto sem login)
  app.get('/academy/capa/:productId', async (req, res) => {
    const p = ct.Produtos.obter(s(req.params.productId, 40));
    if (!p || p.status !== 'publicado' || !p.capa_media_id) return res.sendStatus(404);
    const m = ct.Midia.obter(p.capa_media_id);
    if (!m || !m.mime.startsWith('image/')) return res.sendStatus(404);
    // Cache-Control SÓ quando os bytes existem. Setado antes, ele grudava no 404 do
    // sendFile (o finalhandler do Express limpa Content-*, não Cache-Control) e o
    // navegador guardava a capa quebrada por 1 HORA — foi por isso que a correção do
    // R2 pareceu não funcionar até o cache vencer sozinho.
    const entregar = () => {
      res.setHeader('Content-Type', m.mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');
    };
    // Com o storage no R2 o arquivo NÃO está no disco: esta rota mandava sendFile no
    // caminho local e dava ENOENT. Aqui os bytes passam pelo servidor DE PROPÓSITO (a
    // rota privada pode redirecionar; esta não): ela é o og:image do produto e precisa
    // de URL estável — URL presignada expira e quebra o compartilhamento.
    if (m.storage === 's3') {
      try {
        const u = ct.Midia.urlTemporaria(m, '', 300).url;
        if (!/^https?:/.test(u)) return res.sendStatus(404); // media no bucket e bucket desligado
        const r = await fetch(u);
        if (!r.ok) return res.sendStatus(404);
        const bytes = Buffer.from(await r.arrayBuffer());
        dimsDaCapa(m.id, bytes); // a medida real passa a valer no og:image da página de venda
        entregar();
        return res.end(bytes);
      } catch (_) { return res.sendStatus(404); }
    }
    const caminho = ct.Midia.caminhoAbsoluto(m);
    if (!fs.existsSync(caminho)) return res.sendStatus(404); // 404 sem cache, nunca via sendFile
    entregar();
    res.sendFile(caminho);
  });
  // interesse de compra (pré-checkout): vira lead + alerta
  app.post('/academy/api/cursos/:id/interesse', h(async (req, res) => {
    const p = ct.Produtos.obter(s(req.params.id, 40));
    if (!p || p.status !== 'publicado') return res.status(404).json({ erro: 'Produto não encontrado.' });
    const d = req.body || {};
    const id = repo.Leads.criar({ nome: d.nome, email: d.email, telefone: d.telefone, interesse: 'compra', mensagem: `Interesse no produto: ${p.titulo} (${p.id})` });
    if (notificar) notificar(`🛒 Villela Academy: interesse de compra — ${s(d.nome, 60)} quer "${p.titulo}".`).catch(() => {});
    res.json({ ok: true, id });
  }));

  // lead da landing
  app.post('/academy/api/lead', h(async (req, res) => {
    const id = repo.Leads.criar(req.body || {});
    if (notificar) notificar(`📩 Villela Academy: novo lead — ${s((req.body || {}).nome, 60)} (${s((req.body || {}).interesse, 20)}).`).catch(() => {});
    require('./emails').webhookSaida('lead.novo', { id, nome: s((req.body || {}).nome, 80), interesse: s((req.body || {}).interesse, 30) }).catch(() => {});
    res.json({ ok: true, id });
  }));

  // F10: validação pública de certificado (imprimível)
  app.get('/academy/certificados/:codigo', (req, res) => {
    const c = require('./governanca').Certificados.porCodigo(s(req.params.codigo, 30));
    if (!c) return res.status(404).send(paginaErro('Certificado não encontrado', 'Este código de certificado não existe. Confira o código e tente de novo.'));
    res.setHeader('X-Robots-Tag', 'noindex, nofollow'); // o nome do aluno não é assunto de buscador
    // REVOGADO (reembolso, acesso revogado): o código continua respondendo — quem confere precisa saber que ele
    // NÃO vale mais —, mas a página não mostra o nome nem o certificado.
    if (c.revogado_em) {
      return res.send(shellPublico({ titulo: 'Certificado revogado', descricao: 'Este certificado foi revogado e não é mais válido.', noindex: true,
        corpo: `<div class="sec"><div class="wrap" style="max-width:680px"><div class="card" style="text-align:center;padding:40px">
          <h1 style="color:var(--villela-navy);margin:8px 0">Certificado revogado</h1>
          <p class="sub">O certificado de código <b>${esc(c.id)}</b> foi revogado em ${esc(require('./governanca').Certificados.dataBrasilia(c.revogado_em).br)} e <b>não é mais válido</b>.</p>
          <p class="sub">Curso: ${esc(c.produto_titulo)}</p></div></div></div>` }));
    }
    const selos = require('./jornada').selosDoCertificado(c.user_id, c.product_id);
    // a data é a do fuso de Brasília (emitido às 22 h do dia 10 não sai como dia 11)
    const emitido = require('./governanca').Certificados.dataBrasilia(c.emitido_em);
    // conta excluída a pedido do titular (LGPD): o certificado fica, sem o nome
    const semTitular = !c.aluno_nome;
    const linkedin = 'https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&' + new URLSearchParams({
      name: c.produto_titulo, organizationName: 'Villela Academy', issueYear: String(emitido.ano),
      issueMonth: String(emitido.mes), certUrl: 'https://academia.villelastay.com.br/academy/certificados/' + c.id, certId: c.id,
    }).toString();
    // CERTIFICADO ANTIGO, emitido pela aula-casca de um curso que hoje hospeda o Estude (tipo vazio): na exibição ele
    // ganha a frase do curso livre e perde o "1 aula(s)" da casca — o registro emitido não é alterado.
    const cascaDoEstude = c.tipo !== 'estude' && require('./estudo/repo').Escopos.temDoCurso(c.product_id);
    const corpo =`<div class="sec"><div class="wrap" style="max-width:680px">
      <div class="card" style="border:3px solid var(--villela-gold);text-align:center;padding:40px">
        <p style="margin:0 0 8px"><img src="${BRAND}/simbolo-v.svg" alt="Villela Academy" style="height:44px"></p>
        <p style="color:var(--villela-navy);font-weight:800;letter-spacing:2px;margin:0">VILLELA <span style="color:var(--villela-gold)">ACADEMY</span></p>
        <h1 style="color:var(--villela-navy);margin:8px 0">Certificado de Conclusão</h1>
        ${semTitular ? `<p class="sub">certificado emitido para um aluno que depois pediu a exclusão da conta</p>
        <p style="font-size:1.2rem;font-weight:700;color:var(--villela-navy);margin:6px 0">O titular removeu os dados pessoais</p>
        <p class="sub">o registro confirma a conclusão de</p>` : `<p class="sub">certificamos que</p>
        <p style="font-size:1.6rem;font-weight:800;color:var(--villela-navy);margin:6px 0">${esc(c.aluno_nome)}</p>
        <p class="sub">concluiu com êxito</p>`}
        <p style="font-size:1.2rem;font-weight:700;margin:6px 0">${esc(c.produto_titulo)}</p>
        ${c.produtor_nome ? `<p class="sub">por ${esc(c.produtor_nome)}</p>` : ''}
        <p class="sub">${cascaDoEstude ? '' : `${c.total_aulas} aula(s)`}${c.tipo === 'estude' && c.carga_horaria_min ? ` · carga horária de ${Math.max(1, Math.round(c.carga_horaria_min / 60))} hora(s)` : ''}${cascaDoEstude ? '' : ' · '}emitido em ${esc(emitido.br)}</p>
        ${c.tipo === 'estude' || cascaDoEstude ? `<p class="sub" style="margin-top:10px"><b>${esc(require('./governanca').FRASE_CURSO_LIVRE)}</b></p>` : ''}
        ${selos.length ? `<p class="sub" style="margin:18px 0 6px">competências comprovadas no curso</p>
        <p style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:0">${selos.map(x => `<span class="tag" style="background:#eef7f3;color:#0d6b52">${esc((x.icone ? x.icone + ' ' : '') + x.nome)}</span>`).join('')}</p>` : ''}
        <p style="margin-top:18px"><span class="tag">Código de validação: ${esc(c.id)}</span></p>
        <p class="sub" style="font-size:.8rem">Autenticidade verificável em villelastay.com.br — /academy/certificados/${esc(c.id)}</p>
      </div>
      <p style="text-align:center;margin-top:14px"><button class="btn peq" onclick="window.print()">🖨️ Imprimir / salvar PDF</button>
        ${semTitular ? '' : `<a class="btn peq" style="margin-left:8px;background:#0A66C2" target="_blank" rel="noopener" href="${esc(linkedin)}">Adicionar ao LinkedIn</a>`}</p>
    </div></div>`;
    res.send(shellPublico({ titulo: 'Certificado ' + c.id, noindex: true, descricao: `Certificado de conclusão — ${c.produto_titulo}.${c.tipo === 'estude' || cascaDoEstude ? ' ' + require('./governanca').FRASE_CURSO_LIVRE : ''}`, corpo }));
  });

  // F8: páginas de verificação de e-mail e redefinição de senha
  app.get('/academy/verificar-email', (req, res) => res.send(shellPublico({
    titulo: 'Verificar e-mail', descricao: 'Confirmação de e-mail na Villela Academy.', noindex: true,
    corpo: `<div class="sec"><div class="wrap" style="max-width:520px"><div class="card" id="vf-box"><p class="sub">Confirmando…</p></div></div></div>
    <script>fetch('/academy/api/verificar-email',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:new URLSearchParams(location.search).get('token')})})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.erro||'erro');});})
      .then(function(){document.getElementById('vf-box').innerHTML='<h2 style="text-align:left">✅ E-mail confirmado!</h2><p><a class="btn" href="/academy/app">Ir para o painel</a></p>';})
      .catch(function(e){document.getElementById('vf-box').innerHTML='<p class="erro">'+e.message+'</p>';});</script>` })));
  app.get('/academy/redefinir-senha', (req, res) => res.send(shellPublico({
    titulo: 'Redefinir senha', descricao: 'Redefinição de senha na Villela Academy.', noindex: true,
    corpo: `<div class="sec"><div class="wrap" style="max-width:520px"><div class="card">
      <h2 style="text-align:left">Criar nova senha</h2>
      <input id="s1" type="password" placeholder="Nova senha (8+)"><input id="s2" type="password" placeholder="Confirme">
      <p><button class="btn" onclick="salvar()">Salvar nova senha</button></p><p id="m" class="erro"></p></div></div></div>
    <script>function salvar(){var m=document.getElementById('m');m.textContent='';
      if(s1.value!==s2.value){m.textContent='As senhas não conferem.';return}
      fetch('/academy/api/senha/redefinir',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token:new URLSearchParams(location.search).get('token'),senha:s1.value})})
        .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.erro||'erro');});})
        .then(function(){location.href='/academy/app';}).catch(function(e){m.textContent=e.message;});}</script>` })));
}

module.exports = { registrarPaginas, landingHTML, appHTML, VERSAO_TELA,
  // só para os testes (testes-pagina-venda.js): as funções puras da página de venda
  _teste: { textoRico, dimensoesDaImagem, inclusoNoPreco } };
