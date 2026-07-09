// =====================================================================
// Villela Legal SaaS — páginas públicas + shell do painel do assinante.
// Landing/preços/signup em /juridico ; painel do assinante em /juridico/app
// (usa a API de rotas-cliente.js). Server-rendered, autocontido, sem build.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const path = require('path');
const repo = require('./repo');

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

// Identidade GRUPO VILLELA — marca Villela Legal (assets em /assets/brand/villela-legal)
const BRAND_DIR = '/assets/brand/villela-legal';
const BRAND_HEAD = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="icon" type="image/svg+xml" href="${BRAND_DIR}/favicon.svg">
    <link rel="icon" type="image/png" sizes="192x192" href="${BRAND_DIR}/favicon-192.png">
    <link rel="apple-touch-icon" href="${BRAND_DIR}/apple-touch-icon.png">
    <meta name="theme-color" content="#1B2A4A">
    <link rel="manifest" href="/juridico/manifest.webmanifest"><script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/juridico/sw.js').catch(function(){})})}</script>`;
// logotipo: símbolo (negativo p/ fundo escuro, colorido p/ fundo claro) + wordmark tipográfico
const MARCA = (escuro) => `<img src="${BRAND_DIR}/${escuro ? 'logo-negativo.svg' : 'simbolo-v.svg'}" alt="Villela Legal" style="height:32px;vertical-align:middle">`;
const WORDMARK = `<span style="font-family:'Lora',Georgia,serif;font-weight:700">Villela</span> <span style="font-family:'Inter',system-ui,sans-serif;font-weight:700;letter-spacing:.22em;color:var(--villela-gold);font-size:.72em">LEGAL</span>`;

// GA4 do grupo (mesma propriedade do site; tráfego segmentável por hostname) — só páginas públicas.
const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-5L2YQ2BPQW"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-5L2YQ2BPQW');</script>`;

const CSS = `:root{--villela-navy:#1B2A4A;--villela-navy2:#24365C;--villela-gold:#C9A227;--villela-ice:#F8F9FA;--villela-graphite:#1F2933;--acento:#14532D;--acento2:#0E3B20;--borda:#E2E6EC}
*{box-sizing:border-box}body{font-family:'Inter',system-ui,'Segoe UI',Arial,sans-serif;margin:0;color:var(--villela-graphite);background:var(--villela-ice)}
h1,h2,h3{font-family:'Lora',Georgia,serif}
a{color:var(--villela-navy)}.wrap{max-width:1040px;margin:0 auto;padding:0 18px}
header.top{background:var(--villela-navy2);color:#fff}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding-top:18px;padding-bottom:18px}
header.top a{color:#E8ECF4;text-decoration:none}
header.top nav{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
header.top .brand{display:inline-flex;align-items:center;gap:18px;color:#fff!important}
header.top .brand>span{display:flex;flex-direction:column;line-height:1.05}
header.top .bnome{font-family:'Lora',Georgia,serif;font-weight:700;font-size:3.2rem}
header.top .bdesc{font-family:'Inter',system-ui,sans-serif;font-weight:700;letter-spacing:.18em;color:var(--villela-gold);font-size:1.4rem}
@media(max-width:640px){header.top .esconde{display:none}header.top .brand img{height:84px!important}header.top .bnome{font-size:2rem}header.top .bdesc{font-size:.95rem}}
.hero{background:linear-gradient(135deg,var(--villela-navy),var(--villela-navy2));color:var(--villela-ice);padding:64px 0 72px}
.hero h1{font-size:2.4rem;margin:.2rem 0;max-width:640px;line-height:1.15}.hero p{font-size:1.15rem;max-width:560px;color:#cfd6e4}
.badge{display:inline-block;background:var(--villela-gold);color:var(--villela-navy);font-weight:700;padding:4px 12px;border-radius:20px;font-size:.85rem}
.btn{display:inline-block;background:var(--acento);color:#fff;font-weight:700;border:0;border-radius:26px;padding:13px 28px;cursor:pointer;font-size:1rem;text-decoration:none}
.btn:hover{background:var(--acento2)}
.btn.g{background:#fff;color:var(--villela-navy)}.btn.o{background:transparent;border:2px solid var(--villela-ice);color:var(--villela-ice)}
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
footer{background:var(--villela-navy);color:#c3cbdb;padding:30px 0;text-align:center;font-size:.9rem}
input,select,textarea{width:100%;padding:11px;border:1px solid #ccc;border-radius:9px;font:inherit;margin:5px 0 12px}
.form{max-width:460px;margin:0 auto;background:#fff;padding:26px;border-radius:14px;border:1px solid var(--borda)}
.tag{display:inline-block;background:#eef3f4;color:var(--villela-navy);border-radius:12px;padding:2px 10px;font-size:.8rem}
@media(max-width:640px){.hero h1{font-size:1.8rem}}`;

const ROTULO_MOD = Object.fromEntries(repo.MODULOS.map(m => [m[0], m[1]]));

function landingHTML() {
  const planos = repo.Planos.listar();
  const cardPlano = (p) => {
    const dest = p.slug === 'profissional';
    const preco = p.preco_centavos ? `${brl(p.preco_centavos)}<small>/mês</small>` : (p.slug === 'trial' ? 'Grátis' : 'Sob consulta');
    const itens = p.slug === 'trial'
      ? ['Todos os módulos por 14 dias', `${p.limites.advogados} advogados`, `${p.limites.processos_ativos} processos`, 'Sem cartão']
      : [`${p.limites.advogados || '∞'} advogados`, `${p.limites.processos_ativos || 'ilimitados'} processos ativos`,
         `${p.limites.ia_consultas_mes || 'ilimitadas'} consultas de IA/mês`,
         `${p.modulos.length} módulos${p.flags.ia_direta ? ' · IA direta' : ''}${p.flags.api_publica ? ' · API' : ''}${p.flags.white_label ? ' · marca própria' : ''}`];
    const cta = p.slug === 'enterprise'
      ? `<a class="btn g" href="#contato">Falar com vendas</a>`
      : `<a class="btn" href="/juridico/assinar?plano=${p.slug}">${p.slug === 'trial' ? 'Testar grátis' : 'Assinar'}</a>`;
    return `<div class="plano ${dest ? 'dest' : ''}">${dest ? '<span class="badge">Mais popular</span>' : ''}
      <h3>${esc(p.nome)}</h3><div class="preco">${preco}</div><p class="sub" style="text-align:left;margin:8px 0 0">${esc(p.descricao)}</p>
      <ul>${itens.map(i => `<li>✓ ${esc(i)}</li>`).join('')}</ul>${cta}</div>`;
  };
  const feats = [
    ['⚖️', 'Processos e prazos', 'Andamentos do DataJud, calculadora de prazos do CPC com validação humana, agenda e Kanban.'],
    ['📰', 'Publicações (DJEN)', 'Coleta automática por OAB, triagem e vínculo ao processo.'],
    ['🤖', 'IA jurídica com fontes', 'Consultas, geração de peças e análise de contratos — sempre como MINUTA, com fontes citadas.'],
    ['📑', 'Peças e contratos', '28 tipos de peça, wizard de contratos e exportação; nada é final sem aprovação do advogado.'],
    ['👥', 'Portal do cliente', 'Seu cliente acompanha o processo em linguagem simples, sem ver estratégia interna.'],
    ['📊', 'Gestão do escritório', 'Relatórios do sócio, por núcleo, financeiro e prestação de contas.'],
  ];
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Villela Legal — software jurídico para escritórios de advocacia</title>
    <meta name="description" content="Gestão de processos, prazos, publicações, IA jurídica, peças, contratos e portal do cliente. Teste grátis por 14 dias.">
    <meta property="og:title" content="Villela Legal — software jurídico para escritórios de advocacia">
    <meta property="og:description" content="Gestão de processos, prazos, publicações, IA jurídica, peças, contratos e portal do cliente. Teste grátis por 14 dias.">
    <meta property="og:image" content="https://juridico.villelastay.com.br${BRAND_DIR}/og-image.png">
    <link rel="canonical" href="https://juridico.villelastay.com.br/juridico">
    ${BRAND_HEAD}${GA}
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Villela Legal","applicationCategory":"BusinessApplication","operatingSystem":"Web","description":"Gestão jurídica inteligente: processos, prazos, publicações DJEN/DataJud, peças, contratos e portal do cliente para escritórios brasileiros.","offers":{"@type":"Offer","price":"149.00","priceCurrency":"BRL"},"publisher":{"@type":"Organization","name":"Grupo Villela Stay"}}</script>
    <style>${CSS}</style></head><body>
    <header class="top"><div class="wrap">
      <a class="brand" href="/juridico"><img src="${BRAND_DIR}/logo-negativo.svg" alt="Villela Legal" style="height:150px"><span><span class="bnome">Villela</span><span class="bdesc">LEGAL</span></span></a>
      <nav><a class="esconde" href="/juridico#recursos">Recursos</a><a class="esconde" href="/juridico#planos">Planos</a><a href="/juridico/app">Entrar</a> <a class="btn" style="padding:9px 16px;background:var(--villela-gold);color:var(--villela-navy)!important" href="/juridico/assinar?plano=trial">Teste grátis</a></nav>
    </div></header>
    <div class="hero"><div class="wrap">
      <span class="badge">Software jurídico completo</span>
      <h1>O escritório inteiro em um só lugar — com IA que cita as fontes.</h1>
      <p>Gestão jurídica inteligente: processos, prazos, publicações, peças, contratos e portal do cliente. Feito por quem advoga, para escritórios brasileiros.</p>
      <p style="margin-top:26px"><a class="btn" href="/juridico/assinar?plano=trial">Testar 14 dias grátis</a>
      &nbsp;<a class="btn o" href="/juridico/app">Já sou cliente</a></p>
    </div></div>
    <div class="sec" id="recursos"><div class="wrap"><h2>Tudo que a banca precisa</h2>
      <p class="sub">Um sistema que cobre da captação ao arquivamento — sem colar planilha com WhatsApp.</p>
      <div class="grid">${feats.map(([i, t, d]) => `<div class="card feat"><div class="i">${i}</div><div><b>${esc(t)}</b><br><span class="sub" style="text-align:left;margin:0">${esc(d)}</span></div></div>`).join('')}</div>
    </div></div>
    <div class="sec" id="confianca"><div class="wrap"><h2>Tecnologia testada na vida real</h2>
      <p class="sub">Nossa missão é tirar prazos e intimações do improviso — com IA que trabalha como um estagiário sênior e <b>nunca assina sozinha</b>. Antes de chegar a você, o Villela Legal roda todos os dias no escritório do próprio Grupo Villela Stay.</p>
      <div class="grid">
        <div class="card feat"><div class="i">⚖️</div><div><b>Usado no escritório próprio</b><br><span class="sub" style="text-align:left;margin:0">Processos, prazos e publicações reais passam por aqui diariamente — comemos a nossa própria comida.</span></div></div>
        <div class="card feat"><div class="i">📡</div><div><b>Mais de 2.400 andamentos monitorados</b><br><span class="sub" style="text-align:left;margin:0">Coleta diária apenas em fontes oficiais: DJEN e DataJud/CNJ.</span></div></div>
        <div class="card feat"><div class="i">🔐</div><div><b>Sigilo por escritório</b><br><span class="sub" style="text-align:left;margin:0">Cada banca em banco de dados isolado; conteúdo de IA sempre como minuta para a sua revisão.</span></div></div>
      </div>
      <p class="sub" style="margin-top:26px">🔒 Conexão segura (HTTPS) &nbsp;·&nbsp; 🛡️ Dados tratados conforme a LGPD &nbsp;·&nbsp; 💳 Pagamentos pelo Mercado Pago</p>
    </div></div>
    <div class="sec" id="planos" style="background:#EFF1F6"><div class="wrap"><h2>Planos</h2>
      <p class="sub">Preços de lançamento, ajustáveis. Comece no trial e evolua quando quiser.</p>
      <div class="planos">${planos.map(cardPlano).join('')}</div>
      <p class="sub" style="margin-top:24px">⚠️ Conteúdo gerado por IA é sempre <b>minuta</b> — a revisão do advogado é obrigatória. Coleta apenas por fontes oficiais (DataJud/DJEN).</p>
    </div></div>
    <div class="sec" id="contato"><div class="wrap"><h2>Fale com a gente</h2>
      <p class="sub">Enterprise, migração ou dúvidas — deixe seu contato.</p>
      <form class="form" id="lead">
        <input id="l-nome" placeholder="Seu nome" required><input id="l-esc" placeholder="Escritório">
        <input id="l-email" type="email" placeholder="E-mail" required><input id="l-tel" placeholder="Telefone/WhatsApp">
        <textarea id="l-msg" rows="3" placeholder="Como podemos ajudar?"></textarea>
        <button class="btn" type="submit">Enviar</button><p id="l-msg2" class="sub" style="margin:8px 0 0"></p>
      </form></div></div>
    <footer>Villela Legal · Gestão jurídica inteligente · <a href="/juridico/app" style="color:var(--villela-gold)">Painel do cliente</a> · <a href="/juridico/ajuda" style="color:var(--villela-gold)">Ajuda</a>
      <br><span style="font-size:.85em;opacity:.85">Uma empresa do Grupo Villela Stay · CNPJ 56.776.526/0001-12</span>
      <script>document.getElementById('lead').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('l-msg2');
        const r=await fetch('/juridico/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          nome:l_nome.value,escritorio:l_esc.value,email:l_email.value,telefone:l_tel.value,mensagem:l_msg.value})});
        m.textContent=r.ok?'✅ Recebido! Entraremos em contato.':'Erro ao enviar.';if(r.ok)document.getElementById('lead').reset();};
      </script></footer></body></html>`;
}

function shell(corpo, script) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Villela Legal — Painel</title>${BRAND_HEAD}<style>${CSS}
    .cx{max-width:720px;margin:24px auto;padding:0 14px}.lin{border-bottom:1px solid #eee;padding:8px 0}
    .menu{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.menu button{flex:1;min-width:96px}
    .kpi{display:inline-block;background:#fff;border:1px solid var(--borda);border-radius:10px;padding:10px 16px;margin:4px}
    .aviso{background:#fdf6e3;border:1px solid #ecd9a0;border-radius:9px;padding:10px 14px;font-size:.9rem}
    .erro{color:#b00020}</style></head><body><div class="cx">
    <h2 style="color:var(--villela-navy);display:flex;align-items:center;gap:10px;flex-wrap:wrap">${MARCA(false)}<span>${WORDMARK}</span> <span class="tag" style="font-family:'Inter',system-ui,sans-serif">painel do escritório</span></h2>${corpo}</div><script>${script}</script></body></html>`;
}

function assinarHTML(planoSlug) {
  const p = repo.Planos.porSlug(planoSlug) || repo.Planos.porSlug('trial');
  const preco = p.preco_centavos ? `${brl(p.preco_centavos)}/mês` : (p.slug === 'trial' ? '14 dias grátis, sem cartão' : 'Sob consulta');
  return shell(`<div class="card"><h3>Criar conta — plano ${esc(p.nome)}</h3><p class="tag">${esc(preco)}</p>
    <form class="form" id="su" style="margin-top:12px">
      <input id="s-esc" placeholder="Nome do escritório *" required>
      <input id="s-nome" placeholder="Seu nome (responsável) *" required>
      <input id="s-email" type="email" placeholder="E-mail de acesso *" required>
      <input id="s-cnpj" placeholder="CNPJ (opcional)"><input id="s-oab" placeholder="OAB seccional (ex.: OAB/DF)">
      <input id="s-tel" placeholder="Telefone/WhatsApp">
      <button class="btn" type="submit">Criar conta e começar</button><p id="s-msg" class="erro"></p>
    </form>
    <p class="sub" style="margin-top:10px">Ao criar, você recebe por e-mail o link para definir a senha. ${p.slug !== 'trial' && p.preco_centavos ? 'A cobrança é ativada no painel após o acesso.' : ''}</p></div>`,
    `document.getElementById('su').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('s-msg');m.textContent='';
      const r=await fetch('/juridico/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        nome:s_esc.value,nome_responsavel:s_nome.value,email:s_email.value,cnpj:s_cnpj.value,oab_secional:s_oab.value,telefone:s_tel.value,plano:'${p.slug}'})});
      const d=await r.json();if(!r.ok){m.textContent=d.erro||'Erro';return}
      document.querySelector('.cx').innerHTML='<div class="card"><h3>✅ Conta criada!</h3><p>Enviamos para <b>'+${JSON.stringify('')}+'${esc('')}'+d.email+'</b> o link para definir a senha e acessar o painel.</p>'
        +(d.link_setup?'<p class="aviso">Link de acesso (defina sua senha): <a href="'+d.link_setup+'">'+d.link_setup+'</a></p>':'')
        +'<p><a class="btn" href="/juridico/app">Ir para o painel</a></p></div>';};`);
}

function appHTML() {
  return shell(`<div id="app"><div class="card"><h3>Entrar</h3>
    <input id="em" type="email" placeholder="E-mail"><input id="sn" type="password" placeholder="Senha">
    <button class="btn" onclick="entrar()">Entrar</button><p id="msg" class="erro"></p>
    <p class="sub">Novo por aqui? <a href="/juridico/assinar?plano=trial">Teste grátis</a>.</p></div></div>`,
    `const app=document.getElementById('app');
    const api=async(m,p,b)=>{const r=await fetch('/juridico/api'+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const d=await r.json();if(!r.ok)throw new Error(d.erro||'erro');return d};
    const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const brl=c=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
    const dt=t=>t?String(t).slice(0,10).split('-').reverse().join('/'):'—';
    async function entrar(){const m=document.getElementById('msg');m.textContent='';try{await api('POST','/login',{email:em.value,senha:sn.value});home()}catch(e){m.textContent=e.message}}
    window.entrar=entrar;
    async function home(){let me;try{me=await api('GET','/me')}catch(_){return}
      const ent=me.entitlements;
      const alerta=me.escritorio.status!=='ativa'&&me.escritorio.status!=='trial'?'<div class="aviso">⚠️ Sua conta está <b>'+esc(me.escritorio.status)+'</b>. Regularize a cobrança para reativar o acesso.</div>':(me.escritorio.status==='trial'?'<div class="aviso">🎁 Você está no <b>período de teste</b> até '+dt(ent.trial_expira_em)+'. Assine para continuar sem interrupção.</div>':'');
      app.innerHTML='<div class="card"><h3>'+esc(me.escritorio.nome)+' <span class="tag">'+esc(ent.plano||'—')+'</span></h3>'+alerta
        +'<div class="menu"><button class="btn g" onclick="vPlano()">💳 Plano</button><button class="btn g" onclick="vUso()">📊 Uso</button><button class="btn g" onclick="vSup()">🎧 Suporte</button>'
        +((me.escritorio.status==='ativa'||me.escritorio.status==='trial')?'<a class="btn" href="/juridico/app/juridico" style="text-decoration:none">⚖️ Meu Jurídico</a>':'')
        +'<button class="btn g" id="push-btn" style="display:none" title="Notificações no celular">🔔 Avisos</button></div>'
        +'<p class="sub">Olá, '+esc(me.usuario.nome||me.usuario.email)+' · <a href="#" onclick="sair();return false">sair</a></p></div><div id="c"></div>';
      pintarBotaoPush();
      vPlano();}
    window.home=home;const c=()=>document.getElementById('c');
    async function sair(){await api('POST','/logout').catch(()=>{});location.reload()}window.sair=sair;
    async function vPlano(){const d=await api('GET','/cobranca');
      c().innerHTML='<div class="card"><h3>Plano e cobrança</h3><p>Plano atual: <b>'+esc(d.plano?d.plano.nome:'—')+'</b> · assinatura: <span class="tag">'+esc(d.assinatura?d.assinatura.status:'—')+'</span>'+(d.assinatura&&d.assinatura.proximo_venc?' · próx. venc. '+dt(d.assinatura.proximo_venc):'')+'</p>'
        +'<h3 style="margin-top:12px">Planos</h3>'+d.planos_disponiveis.map(p=>'<div class="lin"><b>'+esc(p.nome)+'</b> — '+(p.preco_centavos?brl(p.preco_centavos)+'/mês':'sob consulta')+(p.preco_centavos?' <button class="btn g" style="padding:6px 14px" onclick="assinar(\\''+p.slug+'\\')">Assinar</button>':'')+'</div>').join('')
        +(d.mp_ativo?'':'<p class="aviso">Pagamento online em configuração — fale com o suporte para ativar seu plano.</p>')
        +(d.assinatura&&d.assinatura.recorrencia_mp?'<p style="margin-top:12px"><button class="btn g" onclick="cancelar()">Cancelar assinatura</button></p>':'')+'</div>';}
    window.vPlano=vPlano;
    async function assinar(slug){try{const r=await api('POST','/cobranca/assinar',{plano:slug});location.href=r.link;}catch(e){alert(e.message)}}window.assinar=assinar;
    async function cancelar(){if(!confirm('Cancelar a assinatura?'))return;try{await api('POST','/cobranca/cancelar');vPlano()}catch(e){alert(e.message)}}window.cancelar=cancelar;
    async function vUso(){const me=await api('GET','/me');const ent=me.entitlements;const u=me.uso;
      const lim=(k)=>ent.limites[k]||0;const usado=(k)=>u[k]||0;
      const linhas=Object.keys(ent.limites).map(k=>'<div class="lin">'+esc(k.replace(/_/g,\" \"))+': <b>'+usado(k)+'</b> / '+(lim(k)===0?'ilimitado':lim(k))+'</div>').join('');
      c().innerHTML='<div class="card"><h3>Uso do mês</h3>'+linhas+'<h3 style="margin-top:14px">Módulos do seu plano</h3><p>'+ent.modulos.map(m=>'<span class="tag" style="margin:2px">'+esc(m.replace(/_/g,\" \"))+'</span>').join(' ')+'</p></div>';}
    window.vUso=vUso;
    async function vSup(){const {tickets}=await api('GET','/tickets');
      c().innerHTML='<div class="card"><h3>Suporte</h3>'+(tickets.length?tickets.map(t=>'<div class="lin"><b>'+esc(t.assunto)+'</b> <span class="tag">'+esc(t.status)+'</span> <span class="sub">'+dt(t.criado_em)+'</span></div>').join(''):'<p class="sub">Nenhum chamado.</p>')
        +'<h3 style="margin-top:12px">Abrir chamado</h3><input id="tk-a" placeholder="Assunto"><textarea id="tk-t" rows="3" placeholder="Descreva sua dúvida"></textarea><button class="btn" onclick="abrirTk()">Enviar</button></div>';}
    window.vSup=vSup;
    async function abrirTk(){const a=document.getElementById('tk-a').value,t=document.getElementById('tk-t').value;if(!a||!t)return;await api('POST','/tickets',{assunto:a,texto:t});vSup();}window.abrirTk=abrirTk;
    // ---- notificações push do painel (PWA) — avisos de ticket/conta no celular ----
    function pushOk(){return ('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window)}
    function b64ParaU8(b){const pad='='.repeat((4-b.length%4)%4);const s=(b+pad).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(s);const a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a}
    async function pushAssinado(){try{const reg=await navigator.serviceWorker.ready;return await reg.pushManager.getSubscription()}catch(_){return null}}
    async function pintarBotaoPush(){const btn=document.getElementById('push-btn');if(!btn||!pushOk())return;const sub=await pushAssinado();
      btn.style.display='';btn.textContent=sub?'🔔 Avisos ✓':'🔔 Avisos';
      btn.title=sub?'Notificações ativadas — toque para desativar':'Receber avisos de tickets e da conta no celular';
      btn.onclick=()=>alternarPush()}
    async function alternarPush(){try{const sub=await pushAssinado();
      if(sub){await api('POST','/push/unsubscribe',{endpoint:sub.endpoint}).catch(()=>{});await sub.unsubscribe()}
      else{const d=await api('GET','/push/chave');
        if(!d.publicKey)return alert('As notificações ainda não estão disponíveis. Tente mais tarde.');
        if((await Notification.requestPermission())!=='granted')return alert('Permissão negada. Libere as notificações deste site nas configurações do navegador.');
        const reg=await navigator.serviceWorker.ready;
        const nova=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ParaU8(d.publicKey)});
        await api('POST','/push/subscribe',{subscription:nova.toJSON()})}
      }catch(e){alert(e.message)}
      pintarBotaoPush()}
    window.pintarBotaoPush=pintarBotaoPush;window.alternarPush=alternarPush;
    home();`);
}

// Página do WORKSPACE JURÍDICO do assinante: reusa o SPA app-legal.js do Portal
// Staff, servido sob /juridico com a casca legal-assinante-shell.js (API em
// /juridico/api/legal, cookie jur_saas). Sem `${}` aqui de propósito.
function appJuridicoHTML() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Meu Jurídico — Villela Legal</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/svg+xml" href="/assets/brand/villela-legal/favicon.svg">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/brand/villela-legal/favicon-192.png">
<link rel="apple-touch-icon" href="/assets/brand/villela-legal/apple-touch-icon.png">
<meta name="theme-color" content="#1B2A4A">
<link rel="manifest" href="/juridico/manifest.webmanifest"><script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/juridico/sw.js').catch(function(){})})}</script><style>
:root{--villela-navy:#1B2A4A;--villela-navy2:#24365C;--villela-gold:#C9A227;--villela-ice:#F8F9FA;--villela-graphite:#1F2933;--acento:#14532D;--acento2:#0E3B20;--borda:#E2E6EC}
*{box-sizing:border-box}body{font-family:'Inter',system-ui,'Segoe UI',Arial,sans-serif;margin:0;color:var(--villela-graphite);background:var(--villela-ice)}
h1,h2,h3{font-family:'Lora',Georgia,serif}
.topo{background:var(--villela-navy);color:var(--villela-ice);padding:10px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.topo b{font-size:1.05rem}.topo a{color:var(--villela-gold);text-decoration:none;font-weight:600;cursor:pointer}
.area{max-width:1100px;margin:16px auto;padding:0 16px}
.titulo{font-size:1.5rem;color:var(--villela-navy);margin:.3rem 0;font-family:'Lora',Georgia,serif}.sub{color:#5b6b70;font-size:.92rem;margin:.2rem 0 .8rem}
.card{background:#fff;border:1px solid var(--borda);border-radius:12px;padding:16px;margin:.5rem 0}
.btn{display:inline-block;background:var(--acento);color:#fff;font-weight:700;border:0;border-radius:22px;padding:9px 18px;cursor:pointer;font-size:.95rem;text-decoration:none}
.btn:hover{background:var(--acento2)}
.btn.secund{background:#eef3f4;color:var(--villela-navy)}.btn.peq{padding:5px 12px;font-size:.85rem}
.chip{display:inline-block;background:#eef3f4;color:var(--villela-navy);border-radius:12px;padding:2px 9px;font-size:.8rem;margin:1px}
.tag{display:inline-block;background:var(--villela-navy);color:var(--villela-ice);border-radius:12px;padding:2px 10px;font-size:.78rem}
.aviso{background:#fdf6e3;border:1px solid #ecd9a0;border-radius:9px;padding:10px 14px;font-size:.9rem;margin:.5rem 0}
input,select,textarea{width:100%;padding:9px;border:1px solid #ccc;border-radius:8px;font:inherit;margin:4px 0 10px}
label{font-size:.9rem;font-weight:600}table{width:100%;border-collapse:collapse}
</style></head><body>
<div class="topo"><span style="display:flex;align-items:center;gap:10px"><img src="/assets/brand/villela-legal/logo-negativo.svg" alt="Villela Legal" style="height:26px"><b id="esc-nome">Meu escritório</b></span>
  <span><a href="/juridico/app">← Painel</a> &nbsp;·&nbsp; <a onclick="sairLegal()">Sair</a></span></div>
<div class="area"><div id="conteudo"><p class="sub">Carregando…</p></div></div>
<script src="/juridico/legal-shell.js"></script>
<script src="/juridico/app-legal.js"></script>
<script>bootLegal();</script>
</body></html>`;
}

function registrarPaginas(app, { jwtSecret, enviarEmail, notificar }) {
  const STAFF_DIR = path.join(__dirname, '..', 'staff');
  const jsFile = (nome) => (req, res) => res.type('application/javascript').sendFile(path.join(STAFF_DIR, nome));
  // assets do workspace jurídico do assinante (mesmo SPA do staff, base de API própria)
  app.get('/juridico/legal-shell.js', jsFile('legal-assinante-shell.js'));
  app.get('/juridico/app-legal.js', jsFile('app-legal.js'));
  app.get('/juridico/app/juridico', (req, res) => res.send(appJuridicoHTML()));
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  app.get('/juridico', (req, res) => res.send(landingHTML()));
  app.get('/juridico/assinar', (req, res) => res.send(assinarHTML(s(req.query.plano, 60))));
  app.get('/juridico/app', (req, res) => res.send(appHTML()));
  app.get(['/juridico/definir-senha', '/juridico/app/definir-senha'], (req, res) => res.send(shell(
    `<div class="card"><h3>Defina sua senha</h3><input id="s1" type="password" placeholder="Nova senha (8+)"><input id="s2" type="password" placeholder="Confirme"><button class="btn" onclick="salvar()">Salvar</button><p id="m" class="erro"></p></div>`,
    `async function salvar(){const m=document.getElementById('m');m.textContent='';if(s1.value!==s2.value){m.textContent='As senhas não conferem.';return}
      const r=await fetch('/juridico/api/definir-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:new URLSearchParams(location.search).get('token'),senha:s1.value})});
      const d=await r.json();if(!r.ok){m.textContent=d.erro;return}location.href='/juridico/app';}`)));

  // lead da landing
  app.post('/juridico/api/lead', h(async (req, res) => {
    const id = repo.Leads.criar(req.body || {});
    if (notificar) notificar(`📩 Villela Legal SaaS: novo lead — ${s((req.body || {}).nome, 60)} (${s((req.body || {}).escritorio, 60)}).`).catch(() => {});
    res.json({ ok: true, id });
  }));

  // signup (cria tenant trial + usuário admin + link de definição de senha)
  app.post('/juridico/api/signup', h(async (req, res) => {
    const d = req.body || {};
    const email = s(d.email, 120).toLowerCase();
    if (require('./db').db.prepare('SELECT 1 FROM tenant_users WHERE lower(email) = ?').get(email)) {
      return res.status(400).json({ erro: 'Já existe uma conta com este e-mail. Acesse o painel.' });
    }
    const t = repo.Tenants.criar({ ...d, email_contato: email, origem: 'landing' }, 'signup');
    const admin = t.usuarios[0];
    const token = jwt.sign({ tipo: 'legalsaas-setup', uid: admin.id }, jwtSecret, { expiresIn: '7d' });
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const link = `${proto}://${req.get('host')}/juridico/definir-senha?token=${token}`;
    if (enviarEmail) {
      enviarEmail(email, 'Villela Legal — acesse sua conta', `<p>Olá! Sua conta <b>${esc(t.nome)}</b> foi criada.</p><p>Defina sua senha e acesse: <a href="${link}">${link}</a></p><p>Você está no plano <b>${esc(t.plano ? t.plano.nome : '')}</b>.</p>`).catch(() => {});
    }
    if (notificar) notificar(`🎉 Villela Legal SaaS: novo escritório — ${esc(t.nome)} (${email}).`).catch(() => {});
    // em produção o link vai só por e-mail; em dev devolvemos p/ facilitar teste
    res.json({ ok: true, tenant_id: t.id, email, link_setup: process.env.NODE_ENV === 'development' ? link : undefined });
  }));
}

module.exports = { registrarPaginas, landingHTML, appHTML, assinarHTML };
