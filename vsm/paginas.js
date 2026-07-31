// =====================================================================
// Villela Stay Manager (VSM) — páginas públicas + painel do assinante.
// Landing/preços/signup em /gestao ; painel do assinante em /gestao/app
// (usa a API de rotas-cliente.js). Server-rendered, autocontido, sem build.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const path = require('path');
const repo = require('./repo');

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

const CSS = `:root{--villela-navy:#1B2A4A;--villela-navy2:#24365C;--villela-gold:#C9A227;--villela-ice:#F8F9FA;--villela-graphite:#1F2933;--acento:#0E7490;--acento2:#0A5666;--borda:#E2E6EC}
*{box-sizing:border-box}body{font-family:'Inter',system-ui,'Segoe UI',Arial,sans-serif;margin:0;color:var(--villela-graphite);background:var(--villela-ice)}
h1,h2,h3{font-family:'Lora',Georgia,serif}
a{color:var(--acento)}.wrap{max-width:1040px;margin:0 auto;padding:0 18px}
.hero{background:linear-gradient(135deg,var(--villela-navy),var(--villela-navy2));color:#f4f6f9;padding:64px 0 72px}
.hero h1{font-size:2.4rem;margin:.2rem 0;max-width:640px;line-height:1.15}.hero p{font-size:1.15rem;max-width:560px;color:#cfd8e6}
.badge{display:inline-block;background:var(--villela-gold);color:var(--villela-navy);font-weight:700;padding:4px 12px;border-radius:20px;font-size:.85rem}
.btn{display:inline-block;background:var(--acento);color:#fff;font-weight:700;border:0;border-radius:26px;padding:13px 28px;cursor:pointer;font-size:1rem;text-decoration:none}
.btn:hover{background:var(--acento2)}
.btn.g{background:#fff;color:var(--acento)}.btn.g:hover{background:#eef6f8}.btn.o{background:transparent;border:2px solid #f4f6f9;color:#f4f6f9}.btn.o:hover{background:rgba(255,255,255,.12)}
.sec{padding:56px 0}.sec h2{font-size:1.7rem;color:var(--villela-navy);text-align:center;margin-bottom:8px}
.sub{text-align:center;color:#5b6b70;max-width:620px;margin:0 auto 34px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}
.card{background:#fff;border:1px solid var(--borda);border-radius:14px;padding:22px}
.feat{display:flex;gap:12px;align-items:flex-start}.feat .i{font-size:1.5rem}
.planos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;align-items:stretch}
.plano{background:#fff;border:1px solid var(--borda);border-radius:16px;padding:24px;display:flex;flex-direction:column}
.plano.dest{border:2px solid var(--villela-gold);box-shadow:0 10px 30px rgba(27,42,74,.12)}
.plano h3{margin:.2rem 0;color:var(--villela-navy)}.preco{font-size:2rem;font-weight:800;color:var(--villela-navy)}.preco small{font-size:.9rem;font-weight:400;color:#7a8890}
.plano ul{list-style:none;padding:0;margin:16px 0;flex:1}.plano li{padding:5px 0;border-bottom:1px solid var(--borda);font-size:.92rem}
footer{background:var(--villela-navy);color:#c3cbd9;padding:30px 0;text-align:center;font-size:.9rem}
input,select,textarea{width:100%;padding:11px;border:1px solid #ccc;border-radius:9px;font:inherit;margin:5px 0 12px}
.form{max-width:460px;margin:0 auto;background:#fff;padding:26px;border-radius:14px;border:1px solid var(--borda)}
.tag{display:inline-block;background:#e6f1f4;color:var(--acento2);border-radius:12px;padding:2px 10px;font-size:.8rem}
.marca{display:inline-flex;align-items:center;gap:10px}.marca img{height:32px}
.marca .m1{font-family:'Lora',Georgia,serif;font-weight:700;font-size:1.3rem;color:var(--villela-navy)}
.marca .m2{font-family:'Inter',system-ui,sans-serif;font-weight:600;font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;color:var(--acento)}
.marca.neg .m1{color:#fff}.marca.neg .m2{color:#67E8F9}
header.top{background:var(--villela-navy2);color:#fff}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding-top:18px;padding-bottom:18px}
header.top a{color:#E8ECF4;text-decoration:none}
header.top nav{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
header.top .marca{gap:18px}header.top .marca img{height:150px}
header.top .marca>span{display:flex;flex-direction:column;line-height:1.05}
header.top .m1{font-size:3.2rem}header.top .m2{font-size:1.4rem;letter-spacing:.18em}
@media(max-width:640px){.hero h1{font-size:1.8rem}header.top .esconde{display:none}header.top .marca img{height:84px}header.top .m1{font-size:2rem}header.top .m2{font-size:.95rem}}`;

const BRAND = '/assets/brand/villela-stay-manager';
const HEAD_MARCA = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="icon" type="image/svg+xml" href="${BRAND}/favicon.svg"><link rel="icon" type="image/png" sizes="192x192" href="${BRAND}/favicon-192.png">
    <link rel="apple-touch-icon" href="${BRAND}/apple-touch-icon.png"><meta name="theme-color" content="#1B2A4A">
    <link rel="manifest" href="/gestao/manifest.webmanifest"><script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/gestao/sw.js').catch(function(){})})}</script>`;
// GA4 do grupo (mesma propriedade do site; tráfego segmentável por hostname) — só páginas públicas.
const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-5L2YQ2BPQW"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-5L2YQ2BPQW');</script>`;
// Lockup da marca: negativo (símbolo dourado) sobre fundo escuro; símbolo-v sobre fundo claro.
const marca = (neg) => `<span class="marca${neg ? ' neg' : ''}"><img src="${BRAND}/${neg ? 'logo-negativo.svg' : 'simbolo-v.svg'}" alt="Villela Stay Manager"><span><span class="m1">Villela</span> <span class="m2">Stay Manager</span></span></span>`;

function landingHTML() {
  const planos = repo.Planos.listar();
  const cardPlano = (p) => {
    const dest = p.slug === 'pro';
    const preco = p.preco_centavos ? `${brl(p.preco_centavos)}<small>/mês</small>` : (p.slug === 'trial' ? 'Grátis' : 'Sob consulta');
    const itens = p.slug === 'trial'
      ? ['Todos os módulos por 14 dias', `${p.limites.imoveis} imóveis`, `${p.limites.usuarios} usuários`, 'Sem cartão']
      : [`${p.limites.imoveis || '∞'} imóveis`, `${p.limites.usuarios || 'ilimitados'} usuários`,
         `${p.limites.reservas_mes || 'ilimitadas'} reservas/mês`,
         `${p.modulos.length} módulos${p.flags.ia_direta ? ' · IA' : ''}${p.flags.api_publica ? ' · API' : ''}${p.flags.white_label ? ' · marca própria' : ''}`];
    const cta = p.slug === 'enterprise'
      ? `<a class="btn g" href="#contato">Falar com vendas</a>`
      : `<a class="btn" href="/gestao/assinar?plano=${p.slug}">${p.slug === 'trial' ? 'Testar grátis' : 'Assinar'}</a>`;
    return `<div class="plano ${dest ? 'dest' : ''}">${dest ? '<span class="badge">Mais popular</span>' : ''}
      <h3>${esc(p.nome)}</h3><div class="preco">${preco}</div><p class="sub" style="text-align:left;margin:8px 0 0">${esc(p.descricao)}</p>
      <ul>${itens.map(i => `<li>✓ ${esc(i)}</li>`).join('')}</ul>${cta}</div>`;
  };
  const feats = [
    ['🏠', 'Imóveis e anúncios', 'Cadastro central dos seus imóveis, fotos, comodidades e regras — uma fonte só para todos os canais.'],
    ['📅', 'Reservas e calendário', 'Calendário unificado anti-overbooking, reservas de todas as OTAs e diretas em um lugar.'],
    ['🔗', 'Canais / OTAs', 'Conecte Airbnb, Booking, Vrbo, Decolar e reservas diretas — sincronização de disponibilidade e preços.'],
    ['🧹', 'Limpeza e manutenção', 'Agenda automática de faxina pelos check-ins/outs, chamados e checklist boutique para a equipe.'],
    ['💰', 'Financeiro e repasses', 'Receitas por competência, despesas, repasses a proprietários e relatórios de resultado.'],
    ['☑️', 'Checklist de etapas e estoque', 'Cada reserva carrega as etapas da jornada (cadastro, faxina, condomínio, boas-vindas…) — o sistema lembra o que falta. Estoque com baixa por reserva e lista de compras.'],
    ['🤖', 'IA, API e webhooks', 'Assistente que responde hóspedes e sugere preços; API com token e webhooks para integrar seus scripts e assistentes.'],
  ];
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Villela Stay Manager — sistema de gestão para aluguel por temporada</title>
    <meta name="description" content="Gestão profissional para aluguel por temporada: imóveis, reservas, canais/OTAs, limpeza, financeiro e IA para anfitriões e gestores. Teste grátis por 14 dias.">
    <meta property="og:title" content="Villela Stay Manager — Gestão profissional para aluguel por temporada">
    <meta property="og:description" content="Imóveis, reservas, canais/OTAs, limpeza, financeiro e IA em um só lugar. Gestão testada na operação real da Villela Stay. Teste grátis por 14 dias.">
    <meta property="og:image" content="https://manager.villelastay.com.br${BRAND}/og-image.png">
    <meta property="og:type" content="website"><meta property="og:url" content="https://manager.villelastay.com.br/gestao">
    <link rel="canonical" href="https://manager.villelastay.com.br/gestao">
    ${HEAD_MARCA}${GA}
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Villela Stay Manager","applicationCategory":"BusinessApplication","operatingSystem":"Web","description":"Gestão profissional para aluguel por temporada: imóveis, reservas, canais, limpeza, financeiro e IA.","offers":{"@type":"Offer","price":"129.00","priceCurrency":"BRL"},"publisher":{"@type":"Organization","name":"Grupo Villela Stay"}}</script>
    <link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS}</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"></head><body class="vx" data-vertical="manager">
    <header class="top"><div class="wrap">
      <a href="/gestao" style="text-decoration:none">${marca(true)}</a>
      <nav><a class="esconde" href="/gestao#recursos">Recursos</a><a class="esconde" href="/gestao#planos">Planos</a><a href="/gestao/app">Entrar</a> <a class="btn" style="padding:9px 16px;background:var(--villela-gold);color:var(--villela-navy)!important" href="/gestao/assinar?plano=trial">Teste grátis</a></nav>
    </div></header>
    <div class="hero"><div class="wrap">
      <span class="badge">Sistema de gestão de hospedagem</span>
      <h1>Toda a sua operação de temporada em um só lugar.</h1>
      <p>Gestão profissional para aluguel por temporada: imóveis, reservas, canais, limpeza, financeiro e IA — para anfitriões e gestores brasileiros.</p>
      <p style="margin-top:26px"><a class="btn" href="/gestao/assinar?plano=trial">Testar 14 dias grátis</a>
      &nbsp;<a class="btn o" href="/gestao/app">Já sou cliente</a></p>
      <p style="font-size:.95rem;margin-top:18px;color:#cfd8e6"><span style="color:var(--villela-gold)">★</span> Gestão testada na operação real da Villela Stay</p>
    </div></div>
    <div class="sec" id="recursos"><div class="wrap"><h2>Tudo que a sua operação precisa</h2>
      <p class="sub">Do anúncio ao repasse do proprietário — sem colar planilha com WhatsApp e calendário de OTA.</p>
      <div class="grid">${feats.map(([i, t, d]) => `<div class="card feat"><div class="i">${i}</div><div><b>${esc(t)}</b><br><span class="sub" style="text-align:left;margin:0">${esc(d)}</span></div></div>`).join('')}</div>
    </div></div>
    <div class="sec" id="confianca"><div class="wrap"><h2>Tecnologia testada na vida real</h2>
      <p class="sub">Nossa missão é entregar ao anfitrião independente a mesma máquina de gestão dos grandes operadores — sem consultor, sem implantação cara. O Stay Manager é o sistema que o Grupo Villela Stay usa <b>na própria operação, todos os dias</b>.</p>
      <div class="grid">
        <div class="card feat"><div class="i">🏘️</div><div><b>20 anúncios reais geridos aqui</b><br><span class="sub" style="text-align:left;margin:0">As 4 casas e os 20 anúncios da Villela Stay no Lago Sul rodam neste mesmo sistema.</span></div></div>
        <div class="card feat"><div class="i">🛡️</div><div><b>Anti-overbooking de verdade</b><br><span class="sub" style="text-align:left;margin:0">Regras de bloqueio testadas em casas interligadas, onde um furo de calendário custa caro.</span></div></div>
        <div class="card feat"><div class="i">🔗</div><div><b>Seus canais, sua conta</b><br><span class="sub" style="text-align:left;margin:0">Conecte a sua conta Stays.net e importe anúncios e reservas de Airbnb, Booking, Decolar, Vrbo e Expedia.</span></div></div>
      </div>
      <p class="sub" style="margin-top:26px">🔒 Conexão segura (HTTPS) &nbsp;·&nbsp; 🛡️ Dados tratados conforme a LGPD &nbsp;·&nbsp; 💳 Pagamentos pelo Mercado Pago</p>
    </div></div>
    <div class="sec" id="planos" style="background:#EDF1F5"><div class="wrap"><h2>Planos</h2>
      <p class="sub">Preços de lançamento, ajustáveis. Comece no trial e evolua quando quiser.</p>
      <div class="planos">${planos.map(cardPlano).join('')}</div>
      <p class="sub" style="margin-top:24px">Você conecta os seus próprios canais (Airbnb/Booking/channel manager). Conteúdo gerado por IA é sugestão — a palavra final é sempre sua.</p>
    </div></div>
    <div class="sec" id="contato"><div class="wrap"><h2>Fale com a gente</h2>
      <p class="sub">Enterprise, migração de outro sistema ou dúvidas — deixe seu contato.</p>
      <form class="form" id="lead">
        <input id="l-nome" placeholder="Seu nome" required><input id="l-esc" placeholder="Nome da operação / empresa">
        <input id="l-email" type="email" placeholder="E-mail" required><input id="l-tel" placeholder="Telefone/WhatsApp">
        <textarea id="l-msg" rows="3" placeholder="Quantos imóveis você opera? Como podemos ajudar?"></textarea>
        <button class="btn" type="submit">Enviar</button><p id="l-msg2" class="sub" style="margin:8px 0 0"></p>
      </form></div></div>
    <footer>Villela Stay Manager · Gestão profissional para aluguel por temporada · <a href="/gestao/app" style="color:var(--villela-gold)">Painel do cliente</a> · <a href="/gestao/ajuda" style="color:var(--villela-gold)">Ajuda</a>
      <br><span style="opacity:.9">📲 Disponível como app para o seu celular — <a href="/gestao/ajuda/manual" style="color:var(--villela-gold)">abra o painel e instale</a></span>
      <br><span style="opacity:.8">Uma empresa do Grupo Villela Stay · CNPJ 56.776.526/0001-12</span>
      <script>document.getElementById('lead').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('l-msg2');
        const r=await fetch('/gestao/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          nome:l_nome.value,empresa:l_esc.value,email:l_email.value,telefone:l_tel.value,mensagem:l_msg.value})});
        m.textContent=r.ok?'✅ Recebido! Entraremos em contato.':'Erro ao enviar.';if(r.ok)document.getElementById('lead').reset();};
      </script></footer></body></html>`;
}

function shell(corpo, script) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Villela Stay Manager — Painel</title>${HEAD_MARCA}<link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS}
    .cx{max-width:720px;margin:24px auto;padding:0 14px}.lin{border-bottom:1px solid #eee;padding:8px 0}
    .menu{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.menu button{flex:1;min-width:96px}
    .kpi{display:inline-block;background:#fff;border:1px solid var(--borda);border-radius:10px;padding:10px 16px;margin:4px}
    .aviso{background:#fdf6e3;border:1px solid #ecd9a0;border-radius:9px;padding:10px 14px;font-size:.9rem}
    .erro{color:#b00020}</style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"></head><body class="vx" data-vertical="manager"><div class="cx">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 16px">${marca(false)}<span class="tag">painel da operação</span></div>${corpo}</div><script>${script}</script></body></html>`;
}

function assinarHTML(planoSlug) {
  const p = repo.Planos.porSlug(planoSlug) || repo.Planos.porSlug('trial');
  const preco = p.preco_centavos ? `${brl(p.preco_centavos)}/mês` : (p.slug === 'trial' ? '14 dias grátis, sem cartão' : 'Sob consulta');
  return shell(`<div class="card"><h3>Criar conta — plano ${esc(p.nome)}</h3><p class="tag">${esc(preco)}</p>
    <form class="form" id="su" style="margin-top:12px">
      <input id="s-esc" placeholder="Nome da operação / empresa *" required>
      <input id="s-nome" placeholder="Seu nome (responsável) *" required>
      <input id="s-email" type="email" placeholder="E-mail de acesso *" required>
      <input id="s-cnpj" placeholder="CNPJ (opcional)"><input id="s-site" placeholder="Site ou perfil (Airbnb/Booking/próprio)">
      <input id="s-tel" placeholder="Telefone/WhatsApp">
      <button class="btn" type="submit">Criar conta e começar</button><p id="s-msg" class="erro"></p>
    </form>
    <p class="sub" style="margin-top:10px">Ao criar, você recebe por e-mail o link para definir a senha. ${p.slug !== 'trial' && p.preco_centavos ? 'A cobrança é ativada no painel após o acesso.' : ''}</p></div>`,
    `document.getElementById('su').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('s-msg');m.textContent='';
      const r=await fetch('/gestao/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        nome:s_esc.value,nome_responsavel:s_nome.value,email:s_email.value,cnpj:s_cnpj.value,site:s_site.value,telefone:s_tel.value,plano:'${p.slug}'})});
      const d=await r.json();if(!r.ok){m.textContent=d.erro||'Erro';return}
      document.querySelector('.cx').innerHTML='<div class="card"><h3>✅ Conta criada!</h3><p>Enviamos para <b>'+d.email+'</b> o link para definir a senha e acessar o painel.</p>'
        +(d.link_setup?'<p class="aviso">Link de acesso (defina sua senha): <a href="'+d.link_setup+'">'+d.link_setup+'</a></p>':'')
        +'<p><a class="btn" href="/gestao/app">Ir para o painel</a></p></div>';};`);
}

// Painel do assinante = app de gestão real (SPA carregada de /gestao/app.js).
function appHTML() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Villela Stay Manager — Painel</title>${HEAD_MARCA}<link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${CSS}
    .cx{max-width:1040px;margin:20px auto;padding:0 14px}.lin{border-bottom:1px solid #eee;padding:8px 0}
    .menu{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px}
    .kpi{background:#fff;border:1px solid var(--borda);border-radius:10px;padding:10px 16px;min-width:120px}
    .aviso{background:#fdf6e3;border:1px solid #ecd9a0;border-radius:9px;padding:10px 14px;font-size:.9rem;margin:.4rem 0}
    .erro{color:#b00020}.btn.peq{padding:6px 14px;font-size:.85rem}.btn.secund{background:#e6f1f4;color:var(--acento2)}.btn.secund:hover{background:#d8e9ee}
    .hi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
    label{font-size:.85rem;font-weight:600;display:block}
    table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--borda)}
    th{color:#5b6b70;font-weight:600}.chip,.tag{display:inline-block;background:#e6f1f4;color:var(--acento2);border-radius:12px;padding:2px 9px;font-size:.78rem}
    </style><link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7"></head><body class="vx" data-vertical="manager"><div class="cx">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 16px">${marca(false)}<span class="tag">painel da operação</span></div>
    <div id="app"><p class="sub">Carregando…</p></div></div>
    <script src="/gestao/app.js"></script><script src="/gestao/app-livro.js"></script><script>bootGestao();</script></body></html>`;
}

function registrarPaginas(app, { jwtSecret, enviarEmail, notificar }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  app.get('/gestao', (req, res) => res.send(landingHTML()));
  app.get('/gestao/assinar', (req, res) => res.send(assinarHTML(s(req.query.plano, 60))));
  app.get('/gestao/app', (req, res) => res.send(appHTML()));
  app.get('/gestao/app.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-cliente.js')));
  // ONDA LIVRO: extensão da SPA (carregada depois do app.js, antes do boot)
  app.get('/gestao/app-livro.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-cliente-livro.js')));
  // páginas públicas do livro: manual do hóspede e portal do proprietário
  require('./rotas-livro').registrarPaginasLivro(app, { css: CSS, marca: 'Villela Stay Manager' });
  app.get(['/gestao/definir-senha', '/gestao/app/definir-senha'], (req, res) => res.send(shell(
    `<div class="card"><h3>Defina sua senha</h3><input id="s1" type="password" placeholder="Nova senha (8+)"><input id="s2" type="password" placeholder="Confirme"><button class="btn" onclick="salvar()">Salvar</button><p id="m" class="erro"></p></div>`,
    `async function salvar(){const m=document.getElementById('m');m.textContent='';if(s1.value!==s2.value){m.textContent='As senhas não conferem.';return}
      const r=await fetch('/gestao/api/definir-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:new URLSearchParams(location.search).get('token'),senha:s1.value})});
      const d=await r.json();if(!r.ok){m.textContent=d.erro;return}location.href='/gestao/app';}`)));

  // lead da landing
  app.post('/gestao/api/lead', h(async (req, res) => {
    const id = repo.Leads.criar(req.body || {});
    if (notificar) notificar(`📩 Villela Stay Manager: novo lead — ${s((req.body || {}).nome, 60)} (${s((req.body || {}).empresa, 60)}).`).catch(() => {});
    res.json({ ok: true, id });
  }));

  // signup (cria operação trial + usuário admin + link de definição de senha)
  app.post('/gestao/api/signup', h(async (req, res) => {
    const d = req.body || {};
    const email = s(d.email, 120).toLowerCase();
    if (require('./db').db.prepare('SELECT 1 FROM tenant_users WHERE lower(email) = ?').get(email)) {
      return res.status(400).json({ erro: 'Já existe uma conta com este e-mail. Acesse o painel.' });
    }
    const t = repo.Tenants.criar({ ...d, email_contato: email, origem: 'landing' }, 'signup');
    const admin = t.usuarios[0];
    const token = jwt.sign({ tipo: 'vsm-setup', uid: admin.id }, jwtSecret, { expiresIn: '7d' });
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const link = `${proto}://${req.get('host')}/gestao/definir-senha?token=${token}`;
    if (enviarEmail) {
      enviarEmail(email, 'Villela Stay Manager — acesse sua conta', `<p>Olá! Sua conta <b>${esc(t.nome)}</b> foi criada.</p><p>Defina sua senha e acesse: <a href="${link}">${link}</a></p><p>Você está no plano <b>${esc(t.plano ? t.plano.nome : '')}</b>.</p>`).catch(() => {});
    }
    if (notificar) notificar(`🎉 Villela Stay Manager: nova operação — ${esc(t.nome)} (${email}).`).catch(() => {});
    // em produção o link vai só por e-mail; em dev devolvemos p/ facilitar teste
    res.json({ ok: true, tenant_id: t.id, email, link_setup: process.env.NODE_ENV === 'development' ? link : undefined });
  }));
}

module.exports = { registrarPaginas, landingHTML, appHTML, assinarHTML };
