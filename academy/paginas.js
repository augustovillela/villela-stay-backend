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

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  const feats = [
    ['🎓', 'Para quem aprende', 'Biblioteca com seus cursos, aulas em vídeo, materiais, progresso e certificados — tudo em um lugar.'],
    ['🎬', 'Para quem ensina', 'Crie cursos, e-books, mentorias e assinaturas. Página de venda, checkout e área de membros prontos.'],
    ['🤝', 'Para quem divulga', 'Programa de afiliados com links rastreáveis, painel de cliques, vendas e comissões transparentes.'],
    ['💳', 'Pagamento nacional', 'Checkout com Pix e cartão via Mercado Pago, liberação automática do acesso após a confirmação.'],
    ['🔒', 'Conteúdo protegido', 'Vídeos com streaming seguro, arquivos privados e links temporários — seu conteúdo não vaza.'],
    ['🤖', 'IA de verdade', 'Assistentes que ajudam a estruturar cursos, escrever páginas de venda e dar suporte ao aluno.'],
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
    <link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS}</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"></head><body class="vx" data-vertical="academy">
    <header class="top"><div class="wrap">
      ${marca({ escuro: true, altura: 150 })}
      <nav><a class="esconde" href="/academy#recursos">Recursos</a><a class="esconde" href="/academy/marketplace">Marketplace</a><a href="/academy/app">Entrar</a> <a class="btn" style="padding:9px 16px;background:var(--villela-gold);color:var(--villela-navy)!important" href="/academy/app#cadastro">Criar conta grátis</a></nav>
    </div></header>
    <div class="hero"><div class="wrap">
      <h1>Ensine, aprenda e venda conhecimento em um só lugar.</h1>
      <p><b>Aprenda, aplique e transforme</b> — marketplace de cursos online e produtos digitais: produtores publicam, afiliados divulgam, alunos aprendem, com checkout nacional e área de membros.</p>
      <p style="margin-top:26px"><a class="btn" href="/academy/marketplace">Explorar o marketplace</a>
      &nbsp;<a class="btn g" href="/academy/app#cadastro">Criar conta grátis</a>
      &nbsp;<a class="btn o" href="/academy/app">Entrar</a></p>
    </div></div>
    <div class="sec" id="recursos"><div class="wrap"><h2>Feita para os três lados do balcão</h2>
      <p class="sub">Aluno, produtor e afiliado com painéis próprios — e a plataforma cuidando de pagamento, entrega e segurança.</p>
      <div class="grid">${feats.map(([i, t, d]) => `<div class="card feat"><div class="i">${i}</div><div><b>${esc(t)}</b><br><span class="sub" style="text-align:left;margin:0">${esc(d)}</span></div></div>`).join('')}</div>
    </div></div>
    <div class="sec" id="confianca"><div class="wrap"><h2>Tecnologia testada na vida real</h2>
      <p class="sub">Nossa missão é ser o caminho mais curto do conhecimento à renda: <b>publicar é grátis — você só paga quando vende</b>. A plataforma nasceu dentro do Grupo Villela Stay, com os mesmos padrões de segurança dos nossos outros sistemas.</p>
      <div class="grid">
        <div class="card feat"><div class="i">💰</div><div><b>Taxa transparente: 8,9% + R$ 1</b><br><span class="sub" style="text-align:left;margin:0">Por venda aprovada. Sem mensalidade, sem taxa de adesão, sem surpresa no saque.</span></div></div>
        <div class="card feat"><div class="i">🇧🇷</div><div><b>Pagamento nacional de verdade</b><br><span class="sub" style="text-align:left;margin:0">Pix e cartão via Mercado Pago; o acesso só libera com pagamento confirmado na fonte.</span></div></div>
        <div class="card feat"><div class="i">📜</div><div><b>Certificado com validação pública</b><br><span class="sub" style="text-align:left;margin:0">Cada certificado tem código verificável por qualquer pessoa — o diploma do seu aluno vale algo.</span></div></div>
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

function appHTML() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Villela Academy — Painel</title>${HEAD_MARCA}<link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS}
    .cx{max-width:1040px;margin:20px auto;padding:0 14px}.lin{border-bottom:1px solid #eee;padding:8px 0}
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
    <script src="/academy/app.js"></script><script>bootAcademy();</script></body></html>`;
}

// ==================== FASE 3 — vitrine pública (SEO/OG) ====================
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const TIPOS_ROT = { curso: 'Curso', ebook: 'E-book', pdf: 'PDF', audio: 'Áudio', pacote: 'Pacote', mentoria: 'Mentoria', clube: 'Clube (assinatura)' };
const sufixoMes = (p) => (p.tipo === 'clube' ? '<small>/mês</small>' : '');

// shell público com SEO/OG; TODO conteúdo de produtor passa por esc()
// `imagem` (URL absoluta, ex.: capa do curso) tem prioridade; senão og da marca.
function shellPublico({ titulo, descricao, url, corpo, imagem }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(titulo)} — Villela Academy</title>
    <meta name="description" content="${esc(descricao)}">
    <meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
    <meta property="og:type" content="website">${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
    <meta property="og:site_name" content="Villela Academy">
    <meta property="og:image" content="${esc(imagem || `${BASE_URL()}${BRAND}/og-image.png`)}">
    ${HEAD_MARCA}
    <link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS} .top{background:var(--villela-navy);padding:12px 0}.top a{color:#F8F9FA;text-decoration:none;margin-right:16px}
    .cardp{background:#fff;border:1px solid var(--borda);border-radius:14px;padding:18px;display:flex;flex-direction:column}
    .cardp .preco{font-size:1.3rem;font-weight:800;color:var(--villela-navy)}.cardp .preco s{color:#8A94A6;font-weight:400;font-size:.95rem}
    .estrela{color:var(--villela-gold)}</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"></head><body class="vx" data-vertical="academy">
    <div class="top"><div class="wrap" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">${marca({ escuro: true, altura: 28 })}<span style="flex:1"></span><a href="/academy/marketplace">Marketplace</a><a href="/academy/app">Entrar</a></div></div>
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
  const capa = p.capa_media_id ? `<img src="/academy/capa/${esc(p.id)}?v=${esc(p.capa_media_id)}" alt="" style="width:100%;border-radius:10px;aspect-ratio:16/9;object-fit:cover;margin-bottom:10px">` : '';
  const preco = p.preco_promo_centavos
    ? `<span class="preco"><s>${brl(p.preco_centavos)}</s> ${brl(p.preco_promo_centavos)}${sufixoMes(p)}</span>`
    : `<span class="preco">${p.preco_centavos ? brl(p.preco_centavos) + sufixoMes(p) : 'Grátis'}</span>`;
  return `<a class="cardp" href="/academy/cursos/${esc(p.slug)}" style="text-decoration:none;color:inherit">${capa}
    <span class="tag">${TIPOS_ROT[p.tipo] || esc(p.tipo)}</span><b style="margin:6px 0">${esc(p.titulo)}</b>
    <span class="sub" style="text-align:left;margin:0;flex:1">${esc(p.descricao_curta || p.subtitulo)}</span>
    <span class="sub" style="text-align:left;margin:6px 0 8px">por ${esc(p.produtor_nome || '')}</span>${preco}</a>`;
}

function marketplaceHTML({ q, categoria }) {
  const itens = ct.Marketplace.listar({ q, categoria });
  const cats = ct.CATEGORIAS.map(c =>
    `<a class="btn peq ${c === categoria ? '' : 'secund'}" href="/academy/marketplace?categoria=${c}" style="margin:3px">${esc(ct.catRotulo(c))}</a>`).join('');
  const corpo = `<div class="sec"><div class="wrap"><h2>Marketplace</h2>
    <p class="sub">Cursos e produtos digitais dos produtores da Villela Academy.</p>
    <form method="get" action="/academy/marketplace" style="max-width:480px;margin:0 auto 18px;display:flex;gap:8px">
      <input name="q" value="${esc(q || '')}" placeholder="Buscar curso, e-book, mentoria..."><button class="btn peq" type="submit">Buscar</button></form>
    <p style="text-align:center;margin-bottom:22px">${cats}</p>
    ${itens.length ? `<div class="grid">${itens.map(cardProduto).join('')}</div>`
      : '<p class="sub">Nenhum produto encontrado' + (q || categoria ? ' com esse filtro.' : ' ainda — os primeiros produtores estão chegando.') + '</p>'}
  </div></div>`;
  return shellPublico({ titulo: 'Marketplace' + (categoria ? ` · ${ct.catRotulo(categoria)}` : ''), descricao: 'Cursos online, e-books e produtos digitais na Villela Academy.', corpo });
}

function embedDe(url) {
  let m = String(url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,20})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1];
  m = String(url || '').match(/vimeo\.com\/(\d+)/);
  if (m) return 'https://player.vimeo.com/video/' + m[1];
  return null;
}
const li = (arr, icone) => arr && arr.length ? `<ul style="list-style:none;padding:0">${arr.map(x => `<li style="padding:5px 0">${icone} ${esc(x)}</li>`).join('')}</ul>` : '';

function cursoHTML(slug) {
  const p = ct.Marketplace.porSlug(slug);
  if (!p) return null;
  const sp = ct.SalesPages.obter(p.id);
  const nota = ct.Reviews.media(p.id);
  const reviews = ct.Reviews.publicas(p.id);
  const resumo = ct.Marketplace.resumoConteudo(p.id);
  const emb = embedDe(sp.video_url);
  const mes = p.tipo === 'clube' ? '<span style="font-size:1rem">/mês</span>' : '';
  const preco = p.preco_promo_centavos
    ? `<s style="color:#8A94A6">${brl(p.preco_centavos)}</s> <span style="font-size:1.9rem;font-weight:800">${brl(p.preco_promo_centavos)}${mes}</span>`
    : `<span style="font-size:1.9rem;font-weight:800">${p.preco_centavos ? brl(p.preco_centavos) + mes : 'Grátis'}</span>`;
  const bloco = (titulo, html) => html ? `<div class="sec" style="padding:26px 0"><div class="wrap"><h2 style="text-align:left;font-size:1.3rem">${titulo}</h2>${html}</div></div>` : '';
  const corpo = `
    <div class="hero" style="padding:44px 0"><div class="wrap">
      <span class="badge">${TIPOS_ROT[p.tipo] || esc(p.tipo)}${nota.media ? ` · ★ ${nota.media} (${nota.total})` : ''}</span>
      <h1>${esc(sp.headline || p.titulo)}</h1>
      <p>${esc(sp.subheadline || p.subtitulo || p.descricao_curta)}</p>
      <p class="sub" style="text-align:left;margin:6px 0;color:#C7D0E0">por <a href="/academy/produtores/${esc(p.produtor_slug)}" style="color:var(--villela-gold)">${esc(p.produtor_nome)}</a></p>
      <p style="margin-top:18px">${preco}<br><br>
        ${(billing.ativo() || !(p.preco_promo_centavos || p.preco_centavos))
          ? `<a class="btn" href="/academy/checkout/${esc(p.slug)}">${p.tipo === 'clube' ? '🔁 Assinar agora' : ((p.preco_promo_centavos || p.preco_centavos) ? '🛒 Comprar agora' : '🎁 Matricular grátis')}</a>`
          : `<a class="btn" href="#comprar">Quero este ${(TIPOS_ROT[p.tipo] || 'produto').toLowerCase()}</a>`}
        &nbsp;<a class="btn o" href="/academy/app">Já sou aluno</a></p>
    </div></div>
    ${emb ? `<div class="sec" style="padding:26px 0"><div class="wrap"><iframe src="${esc(emb)}" style="width:100%;max-width:760px;aspect-ratio:16/9;border:0;border-radius:12px;display:block;margin:0 auto" allowfullscreen></iframe></div></div>`
      // sem vídeo de vendas, a CAPA ocupa o mesmo lugar 16:9. Antes ela só existia como
      // og:image: quem abria a página do curso nunca via a capa que o produtor subiu.
      : (p.capa_media_id ? `<div class="sec" style="padding:26px 0"><div class="wrap"><img src="/academy/capa/${esc(p.id)}?v=${esc(p.capa_media_id)}" alt="${esc(p.titulo)}" style="width:100%;max-width:760px;aspect-ratio:16/9;object-fit:cover;border-radius:12px;display:block;margin:0 auto"></div></div>` : '')}
    ${bloco('O que você vai conquistar', sp.promessa ? `<p>${esc(sp.promessa)}</p>` : '')}
    ${bloco('Benefícios', li(sp.beneficios, '✅'))}
    ${bloco('Para quem é', li(sp.para_quem, '🎯'))}
    ${bloco('O que você vai aprender', li(sp.aprender, '📌'))}
    ${bloco('Conteúdo', resumo.modulos.length ? `<p class="sub" style="text-align:left">${resumo.total_aulas} aula(s)</p>` +
      resumo.modulos.map(m => `<div class="card" style="margin:8px 0"><b>📚 ${esc(m.titulo)}</b>${m.aulas.map(a =>
        `<div style="padding:4px 0 0 14px">${a.gratuita ? '🎁' : '▫️'} ${esc(a.titulo)}${a.gratuita ? ' <span class="tag">degustação grátis</span>' : ''}</div>`).join('')}</div>`).join('') : '')}
    ${bloco('Bônus', li(sp.bonus, '🎁'))}
    ${bloco('Quem já fez recomenda', (sp.depoimentos || []).concat(reviews.map(r => ({ nome: r.nome, texto: r.texto, nota: r.nota }))).map(d =>
      `<div class="card" style="margin:8px 0">${d.nota ? '<span class="estrela">' + '★'.repeat(d.nota) + '</span> ' : ''}"${esc(d.texto)}"<br><b>— ${esc(d.nome)}</b></div>`).join('') || '')}
    ${bloco('Garantia', sp.garantia_texto ? `<p>🛡️ ${esc(sp.garantia_texto)}</p>` : (p.garantia_dias ? `<p>🛡️ Garantia de ${p.garantia_dias} dias.</p>` : ''))}
    ${bloco('Perguntas frequentes', (sp.faq || []).map(f => `<div class="card" style="margin:8px 0"><b>${esc(f.p)}</b><br>${esc(f.r)}</div>`).join('') || '')}
    <div class="sec" id="comprar" style="background:var(--ambar-claro)"><div class="wrap" style="max-width:560px">
      <h2>Garanta o seu acesso</h2>
      <p class="sub">O pagamento online chega em breve. Deixe seu contato que avisamos você — ou o produtor libera seu acesso direto.</p>
      <form class="form" id="int">
        <input id="i-nome" placeholder="Seu nome" required><input id="i-email" type="email" placeholder="E-mail" required>
        <input id="i-tel" placeholder="WhatsApp"><button class="btn" type="submit">Quero ser avisado</button>
        <p id="i-msg" class="sub" style="margin:8px 0 0"></p></form>
      <script>document.getElementById('int').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('i-msg');
        const r=await fetch('/academy/api/cursos/${esc(p.id)}/interesse',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({nome:i_nome.value,email:i_email.value,telefone:i_tel.value})});
        m.textContent=r.ok?'✅ Anotado! Você será avisado.':'Erro ao enviar.';if(r.ok)document.getElementById('int').reset();};</script>
    </div></div>`;
  return shellPublico({
    titulo: p.titulo, descricao: p.descricao_curta || sp.headline || p.subtitulo || p.titulo, url: `/academy/cursos/${p.slug}`, corpo,
    // capa do curso como og:image quando existe (melhor); og da marca é o fallback do shell
    imagem: p.capa_media_id ? `${BASE_URL()}/academy/capa/${p.id}?v=${p.capa_media_id}` : null,
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
  return shellPublico({ titulo: 'Checkout — ' + p.titulo, descricao: 'Finalize sua compra na Villela Academy.', corpo });
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
  return shellPublico({ titulo: 'Obrigado', descricao: 'Confirmação de compra na Villela Academy.', corpo });
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
  return shellPublico({ titulo: 'Assinatura', descricao: 'Confirmação de assinatura na Villela Academy.', corpo });
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

// Termos/privacidade: MINUTA — precisa de revisão por advogado (OAB) antes
// de a plataforma operar comercialmente. O texto deixa isso explícito.
function paginaLegal(titulo, corpo) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(titulo)} — Villela Academy</title>${HEAD_MARCA}<link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS} .doc{max-width:760px;margin:32px auto;padding:0 18px;line-height:1.6}</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"></head>
    <body class="vx" data-vertical="academy"><div class="doc"><p><a href="/academy">← Villela Academy</a></p>
    <div class="aviso"><b>MINUTA</b> — documento em elaboração, sujeito a revisão jurídica (advogado OAB) antes da operação comercial.</div>
    <h1 style="color:var(--villela-navy)">${esc(titulo)}</h1>${corpo}
    <p class="sub" style="text-align:left">Villela Academy é um produto da Augusto Villela Ltda (CNPJ 56.776.526/0001-12).</p>
    </div></body></html>`;
}
const TERMOS = `<p>Estes Termos de Uso regem o acesso à plataforma Villela Academy por alunos, produtores e afiliados.</p>
  <ul><li>A conta é pessoal e intransferível; você responde pelo que fizer com ela.</li>
  <li>Produtores respondem pelo conteúdo que publicam e declaram ter os direitos autorais do material.</li>
  <li>É proibido conteúdo ilegal, enganoso, adulto, perigoso, discriminatório ou que viole direitos de terceiros; a plataforma pode revisar, suspender e remover conteúdo e contas.</li>
  <li>Comissões, prazos de repasse e política de reembolso serão definidos nos Termos do Produtor e do Afiliado.</li>
  <li>Compartilhar acesso, redistribuir ou revender conteúdo comprado viola estes termos.</li></ul>`;
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
const REEMBOLSO = `<p>Política de reembolso (consumidor).</p>
  <ul><li>Compras online têm direito de arrependimento de 7 dias (art. 49 do CDC), com reembolso integral.</li>
  <li>Produtos podem oferecer garantia estendida própria (indicada na página de venda).</li>
  <li>Ao reembolsar, o acesso ao conteúdo é revogado e comissões associadas são canceladas.</li>
  <li>Solicitações: pelo painel do aluno ou canal de suporte.</li></ul>`;
const PRIVACIDADE = `<p>Tratamos dados pessoais conforme a LGPD (Lei 13.709/2018).</p>
  <ul><li>Coletamos o mínimo necessário: nome, e-mail, telefone e, para produtores/afiliados, dados de documento e pagamento para repasses.</li>
  <li>Usamos os dados para operar a plataforma (conta, compras, entrega de conteúdo, comissões) e, com consentimento, para comunicações.</li>
  <li>Você pode exportar seus dados e pedir exclusão (anonimização) direto no painel, em Conta.</li>
  <li>Registramos logs de acesso e auditoria por segurança e obrigação legal.</li>
  <li>Não vendemos dados pessoais. Compartilhamos apenas com operadores essenciais — em especial o
  Mercado Pago, que processa os pagamentos (dados de cartão vão direto a ele, nunca aos nossos servidores).</li></ul>`;

function registrarPaginas(app, { notificar }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  app.get('/academy', (req, res) => res.send(landingHTML()));
  app.get('/academy/app', (req, res) => res.send(appHTML()));
  app.get('/academy/app.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-cliente.js')));
  app.get('/academy/termos', (req, res) => res.send(paginaLegal('Termos de Uso', TERMOS)));
  app.get('/academy/privacidade', (req, res) => res.send(paginaLegal('Política de Privacidade', PRIVACIDADE)));
  app.get('/academy/termos-produtor', (req, res) => res.send(paginaLegal('Termos do Produtor', TERMOS_PRODUTOR)));
  app.get('/academy/termos-afiliado', (req, res) => res.send(paginaLegal('Termos do Afiliado', TERMOS_AFILIADO)));
  app.get('/academy/reembolso', (req, res) => res.send(paginaLegal('Política de Reembolso', REEMBOLSO)));

  // ---- vitrine pública (FASE 3) ----
  app.get('/academy/marketplace', (req, res) => res.send(marketplaceHTML({ q: s(req.query.q, 80), categoria: s(req.query.categoria, 40) })));
  app.get('/academy/categorias/:slug', (req, res) => res.redirect(302, '/academy/marketplace?categoria=' + encodeURIComponent(s(req.params.slug, 40))));
  app.get('/academy/cursos/:slug', (req, res) => {
    const html = cursoHTML(s(req.params.slug, 90));
    if (!html) return res.status(404).send(paginaLegal('Não encontrado', '<p>Este produto não existe ou não está publicado.</p>'));
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
    if (!html) return res.status(404).send(paginaLegal('Não encontrado', '<p>Este produto não existe ou não está publicado.</p>'));
    res.send(html);
  });
  app.get('/academy/obrigado', (req, res) => res.send(obrigadoHTML()));
  app.get('/academy/obrigado-assinatura', (req, res) => res.send(obrigadoAssinaturaHTML()));
  app.get('/academy/produtores/:slug', (req, res) => {
    const html = produtorHTML(s(req.params.slug, 90));
    if (!html) return res.status(404).send(paginaLegal('Não encontrado', '<p>Produtor não encontrado.</p>'));
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
    if (!c) return res.status(404).send(paginaLegal('Certificado não encontrado', '<p>Este código de certificado não existe. Confira o código e tente de novo.</p>'));
    const corpo = `<div class="sec"><div class="wrap" style="max-width:680px">
      <div class="card" style="border:3px solid var(--villela-gold);text-align:center;padding:40px">
        <p style="margin:0 0 8px"><img src="${BRAND}/simbolo-v.svg" alt="Villela Academy" style="height:44px"></p>
        <p style="color:var(--villela-navy);font-weight:800;letter-spacing:2px;margin:0">VILLELA <span style="color:var(--villela-gold)">ACADEMY</span></p>
        <h1 style="color:var(--villela-navy);margin:8px 0">Certificado de Conclusão</h1>
        <p class="sub">certificamos que</p>
        <p style="font-size:1.6rem;font-weight:800;color:var(--villela-navy);margin:6px 0">${esc(c.aluno_nome)}</p>
        <p class="sub">concluiu com êxito</p>
        <p style="font-size:1.2rem;font-weight:700;margin:6px 0">${esc(c.produto_titulo)}</p>
        ${c.produtor_nome ? `<p class="sub">por ${esc(c.produtor_nome)}</p>` : ''}
        <p class="sub">${c.total_aulas} aula(s) · emitido em ${esc(String(c.emitido_em).slice(0, 10).split('-').reverse().join('/'))}</p>
        <p style="margin-top:18px"><span class="tag">Código de validação: ${esc(c.id)}</span></p>
        <p class="sub" style="font-size:.8rem">Autenticidade verificável em villelastay.com.br — /academy/certificados/${esc(c.id)}</p>
      </div>
      <p style="text-align:center;margin-top:14px"><button class="btn peq" onclick="window.print()">🖨️ Imprimir / salvar PDF</button></p>
    </div></div>`;
    res.send(shellPublico({ titulo: 'Certificado ' + c.id, descricao: `Certificado de conclusão de ${c.aluno_nome} — ${c.produto_titulo}.`, corpo }));
  });

  // F8: páginas de verificação de e-mail e redefinição de senha
  app.get('/academy/verificar-email', (req, res) => res.send(shellPublico({
    titulo: 'Verificar e-mail', descricao: 'Confirmação de e-mail na Villela Academy.',
    corpo: `<div class="sec"><div class="wrap" style="max-width:520px"><div class="card" id="vf-box"><p class="sub">Confirmando…</p></div></div></div>
    <script>fetch('/academy/api/verificar-email',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:new URLSearchParams(location.search).get('token')})})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.erro||'erro');});})
      .then(function(){document.getElementById('vf-box').innerHTML='<h2 style="text-align:left">✅ E-mail confirmado!</h2><p><a class="btn" href="/academy/app">Ir para o painel</a></p>';})
      .catch(function(e){document.getElementById('vf-box').innerHTML='<p class="erro">'+e.message+'</p>';});</script>` })));
  app.get('/academy/redefinir-senha', (req, res) => res.send(shellPublico({
    titulo: 'Redefinir senha', descricao: 'Redefinição de senha na Villela Academy.',
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

module.exports = { registrarPaginas, landingHTML, appHTML };
