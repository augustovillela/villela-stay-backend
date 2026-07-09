// =====================================================================
// Villela Projects & Events — páginas públicas + painel (/vpe/app).
// Identidade Grupo Villela Stay (navy + dourado, acento violeta #7C3AED).
// SPA leve em fetch, sem framework — padrão provado no Villela Docs.
// =====================================================================
'use strict';
const repo = require('./repo');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (c) => Number(c || 0) === 0 ? 'Sob consulta' : 'R$ ' + (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + '/mês';

const CSS = `
:root{--ink:#1F2933;--verde:#1B2A4A;--verde2:#24365C;--acc:#7C3AED;--ambar:#C9A227;--fundo:#F8F9FA;--borda:#E2E6EC;--suave:#5D6673;--alerta:#d93025}
*{box-sizing:border-box}body{margin:0;font-family:'Inter',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.6}
h1,h2,h3{font-family:'Lora',Georgia,serif;line-height:1.2;margin:.2em 0 .5em;color:var(--verde2)}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}.wrap-sm{max-width:560px;margin:0 auto;padding:0 20px}
header.top{background:var(--verde2);color:#fff;position:sticky;top:0;z-index:20}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
header.top a{color:#E8ECF4}.brand{display:inline-flex;align-items:center;gap:9px;font-family:'Lora',Georgia,serif;font-weight:700;font-size:19px;color:#fff!important}.brand b{font-family:'Inter',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-weight:700;font-size:13.5px;text-transform:uppercase;letter-spacing:2.5px;color:#A78BFA}
header.top{position:static}header.top .wrap{height:auto;padding-top:18px;padding-bottom:18px;gap:14px;flex-wrap:wrap}
.brand.xl{gap:18px;font-size:3.2rem}.brand.xl b{font-size:1.4rem;letter-spacing:.18em}
@media(max-width:640px){.brand.xl img{height:84px!important}.brand.xl{font-size:2rem}.brand.xl b{font-size:.95rem}}
.nav a{margin-left:18px;font-size:15px}
.btn{display:inline-block;background:var(--acc);color:#fff!important;padding:12px 24px;border-radius:9px;font-weight:700;border:0;cursor:pointer;font-size:15px;text-align:center;transition:.15s}
.btn:hover{background:var(--verde)}
.btn-ghost{background:transparent;border:1.5px solid var(--borda);color:var(--verde2)!important}
.btn.peq{padding:7px 13px;font-size:13px}
.hero{background:linear-gradient(155deg,var(--verde2),var(--verde) 65%,#31406E);color:#E8ECF4;padding:60px 0}
.hero h1{color:#fff;font-size:38px;max-width:780px}.hero p.sub{font-size:19px;max-width:640px;color:#C7D0E2}
.eyebrow{text-transform:uppercase;letter-spacing:1.5px;font-size:12px;color:var(--acc);font-weight:700}
.hero .eyebrow{color:#A78BFA}
section{padding:46px 0}section.alt{background:var(--fundo)}
.grid{display:grid;gap:22px}.g3{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.card{background:#fff;border:1px solid var(--borda);border-radius:14px;padding:22px}
.card h3{margin-top:0;font-size:18px}
.plano{display:flex;flex-direction:column}.plano .preco{font-size:26px;font-weight:800;color:var(--verde2)}
.plano ul{padding-left:18px;margin:10px 0;color:var(--suave);flex:1}
.badge{display:inline-block;background:#DDD3F7;color:#2E1065;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;text-transform:uppercase}
input,select,textarea{width:100%;padding:11px 12px;border:1.5px solid var(--borda);border-radius:9px;font-size:15px;font-family:inherit;background:#fff}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--acc)}
label{font-size:13px;font-weight:600;color:var(--suave);display:block;margin:12px 0 4px}
.aviso{background:#fef7e0;border:1px solid #f5d78e;border-radius:9px;padding:10px 14px;font-size:14px;margin:10px 0}
.erro{background:#fde8e8;border:1px solid #f5b5b5;border-radius:9px;padding:10px 14px;font-size:14px;margin:10px 0;color:var(--alerta)}
footer{background:var(--ink);color:#B9C2CF;padding:32px 0;font-size:14px}footer a{color:#D6DCE8}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--borda)}th{color:var(--suave);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.chip{display:inline-block;background:var(--fundo);border:1px solid var(--borda);border-radius:99px;padding:2px 10px;font-size:12px}
@media(max-width:640px){.hero h1{font-size:28px}.nav a.esconde{display:none}}
`;

const HEAD_MARCA = `<link rel="icon" type="image/svg+xml" href="/assets/brand/villela-projects/favicon.svg">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/brand/villela-projects/favicon-192.png">
<link rel="apple-touch-icon" href="/assets/brand/villela-projects/apple-touch-icon.png">
<meta name="theme-color" content="#1B2A4A">
<link rel="manifest" href="/vpe/manifest.webmanifest"><script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/vpe/sw.js').catch(function(){})})}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

const BRAND_LOCKUP = `<img src="/assets/brand/villela-projects/logo-negativo.svg" alt="Villela Projects" style="height:30px">Villela <b>Projects</b>`;
// lockup GRANDE das páginas públicas (masthead 5x — símbolo 150px, nome empilhado)
const BRAND_XL = `<img src="/assets/brand/villela-projects/logo-negativo.svg" alt="Villela Projects" style="height:150px"><span style="display:flex;flex-direction:column;line-height:1.05"><span>Villela</span><b>Projects</b></span>`;

const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-5L2YQ2BPQW"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-5L2YQ2BPQW');</script>`;

function pagina({ titulo, descricao, corpo, og, extraHead }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descricao)}">
${og ? `<meta property="og:type" content="website"><meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}"><meta property="og:image" content="https://projetos.villelastay.com.br/assets/brand/villela-projects/og-image.png">
` : ''}${extraHead || ''}${HEAD_MARCA}${GA}
<style>${CSS}</style></head><body>
<header class="top"><div class="wrap">
  <a class="brand xl" href="/vpe">${BRAND_XL}</a>
  <nav class="nav"><a class="esconde" href="/vpe#recursos">Recursos</a><a class="esconde" href="/vpe#planos">Planos</a><a href="/vpe/login">Entrar</a> <a class="btn" style="padding:9px 16px;background:#DDD3F7;color:#2E1065!important" href="/vpe/cadastro">Teste grátis</a></nav>
</div></header>
${corpo}
<footer><div class="wrap"><b style="color:#fff">Villela Projects</b> · Projetos, processos e automações em um só lugar<br>
Uma empresa do Grupo Villela Stay · CNPJ 56.776.526/0001-12 · Brasília-DF<br>
<a href="/vpe/login">Entrar</a> · <a href="/vpe/cadastro">Criar conta</a> · <a href="/vpe/ajuda">Ajuda</a></div></footer>
</body></html>`;
}

// ------------------------------------------------------------ landing
function landing() {
  const planos = repo.listarPlanos();
  const corpo = `
<div class="hero"><div class="wrap">
  <div class="eyebrow">Gestão de projetos e eventos com IA</div>
  <h1>Da ideia ao lançamento — e do briefing ao pós-evento — em um só lugar.</h1>
  <p class="sub">Projetos, processos e automações em um só lugar: o Villela Projects organiza seu portfólio de negócios (ideia → viabilidade → plano → execução → operação) e sua operação de eventos (briefing, proposta, fornecedores, equipe, financeiro), com agentes de IA trabalhando como parte do time.</p>
  <p style="margin-top:22px"><a class="btn" style="background:#DDD3F7;color:#2E1065!important" href="/vpe/cadastro">Começar teste grátis de 14 dias</a>
  <a class="btn btn-ghost" style="margin-left:8px;border-color:#4A5A85;color:#C7D0E2!important" href="#demo">Pedir demonstração</a></p>
  <p style="font-size:13px;color:#A9B4CC">Sem cartão de crédito · Cancele quando quiser · LGPD</p>
</div></div>

<section id="recursos"><div class="wrap">
  <div class="eyebrow">Recursos</div>
  <h2>Portfólio antes de tarefa</h2>
  <div class="grid g3">
    <div class="card"><h3>💡 Portfólio de ideias</h3>Cada ideia com estágio, horizonte, prioridade, viabilidade, investimento e receita potencial — para decidir o que executar agora, depois ou nunca.</div>
    <div class="card"><h3>📋 Projetos por fases</h3>Da incubação ao lançamento e operação: 15 estágios configuráveis, responsáveis, riscos e próximos passos sempre visíveis.</div>
    <div class="card"><h3>🎪 Eventos de ponta a ponta</h3>Briefing → proposta → contrato → checklist → equipe → fornecedores → pós-evento (chega nas próximas fases do produto).</div>
    <div class="card"><h3>🤖 IA como time</h3>Agentes que geram plano de negócio, cronograma, propostas e relatórios — sempre registrando premissas e lacunas, sem inventar dados.</div>
    <div class="card"><h3>💰 Comercial e financeiro</h3>CRM, propostas, contratos, orçamento previsto × realizado e margem por projeto/evento.</div>
    <div class="card"><h3>🔐 Multiempresa e seguro</h3>Cada empresa isolada, papéis e permissões, trilha de auditoria completa e LGPD.</div>
  </div>
</div></section>

<section id="confianca"><div class="wrap">
  <div class="eyebrow">Por que confiar</div>
  <h2>Tecnologia testada na vida real</h2>
  <p class="sub" style="max-width:640px">Nossa missão é uma gestão de projetos que uma equipe brasileira adota em uma tarde — do plano ao evento, com IA que escreve o relatório que ninguém quer escrever. E antes de chegar a você, ela gere o portfólio do próprio Grupo Villela Stay.</p>
  <div class="grid g3">
    <div class="card"><h3>📋 16 projetos reais dentro dele</h3>O portfólio do Grupo Villela Stay — hospedagem, eventos e expansões — é gerido neste mesmo sistema, todos os dias.</div>
    <div class="card"><h3>🎪 Eventos de verdade</h3>Nasceu numa operação que recebe casamentos, formaturas e eventos corporativos — o módulo de eventos não é enfeite.</div>
    <div class="card"><h3>✅ 197 verificações automatizadas</h3>Cada atualização passa por 197 testes antes de entrar no ar — estabilidade não é promessa, é rotina.</div>
  </div>
  <p class="sub" style="margin-top:24px">🔒 Conexão segura (HTTPS) &nbsp;·&nbsp; 🛡️ Dados tratados conforme a LGPD &nbsp;·&nbsp; 💳 Pagamentos pelo Mercado Pago</p>
</div></section>

<section class="alt" id="planos"><div class="wrap">
  <div class="eyebrow">Planos</div>
  <h2>Do primeiro projeto à operação completa</h2>
  <div class="grid g3">
    ${planos.map(p => `<div class="card plano">${p.slug === 'professional' ? '<div><span class="badge">Mais escolhido</span></div>' : ''}
      <h3>${esc(p.nome)}</h3><div class="preco">${brl(p.preco_centavos)}</div>
      <ul>
        <li><b>${p.limites.usuarios || 'Sob medida'}</b> usuários</li>
        <li><b>${p.limites.projetos || 'Sob medida'}</b> projetos</li>
        <li><b>${p.limites.eventos_mes || 'Sob medida'}</b> eventos/mês</li>
        <li><b>${p.limites.ia_consultas_mes || 'Sob medida'}</b> consultas de IA/mês</li>
        <li>${p.limites.portal_cliente ? '✔ Portal do cliente' : '— sem portal do cliente'}</li>
        <li>${p.limites.api ? '✔ API e integrações' : '— sem API'}</li>
      </ul>
      <a class="btn${p.slug === 'professional' ? '' : ' btn-ghost'}" href="/vpe/cadastro">Testar grátis</a></div>`).join('')}
  </div>
</div></section>

<section id="demo"><div class="wrap-sm">
  <div class="eyebrow">Fale com a gente</div>
  <h2>Peça uma demonstração</h2>
  <div id="lead-erro"></div>
  <form onsubmit="return enviarLead(event)">
    <label>Seu nome</label><input id="ld-nome" required>
    <label>E-mail corporativo</label><input id="ld-email" type="email" required>
    <label>Empresa</label><input id="ld-empresa">
    <label>O que você precisa organizar?</label><textarea id="ld-msg" rows="3"></textarea>
    <p><button class="btn" type="submit">Quero uma demonstração</button></p>
  </form>
  <div id="lead-ok" style="display:none" class="aviso">✅ Recebido! Vamos entrar em contato em breve.</div>
  <script>
  async function enviarLead(ev){ev.preventDefault();const v=id=>document.getElementById(id).value;
    const r=await fetch('/vpe/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:v('ld-nome'),email:v('ld-email'),empresa:v('ld-empresa'),mensagem:v('ld-msg'),origem:'landing'})});
    const d=await r.json().catch(()=>({}));
    if(r.ok){ev.target.style.display='none';document.getElementById('lead-ok').style.display='block';}
    else document.getElementById('lead-erro').innerHTML='<div class="erro">'+(d.erro||'Não foi possível enviar.')+'</div>';
    return false;}
  </script>
</div></section>`;
  return pagina({
    titulo: 'Villela Projects — Projetos, processos e automações em um só lugar',
    descricao: 'Portfólio de ideias, projetos por fases, eventos de ponta a ponta e agentes de IA. Teste grátis 14 dias.',
    corpo, og: true,
    extraHead: `<link rel="canonical" href="https://projetos.villelastay.com.br/vpe">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Villela Projects","applicationCategory":"BusinessApplication","operatingSystem":"Web","description":"Projetos, processos e automações em um só lugar: portfólio, Kanban, eventos, financeiro e IA.","offers":{"@type":"Offer","price":"149.00","priceCurrency":"BRL"},"publisher":{"@type":"Organization","name":"Grupo Villela Stay"}}</script>
`,
  });
}

const formPagina = (titulo, inner) => pagina({
  titulo: `${titulo} — Villela Projects`, descricao: 'Projetos, processos e automações em um só lugar.',
  corpo: `<section class="alt" style="min-height:60vh"><div class="wrap-sm"><div class="card" style="padding:28px"><h2 style="margin-top:0">${esc(titulo)}</h2>${inner}</div></div></section>`,
});

const cadastro = () => formPagina('Criar conta — teste grátis 14 dias', `
  <div id="erro"></div>
  <form onsubmit="return enviar(event)">
    <label>Nome da empresa</label><input id="f-empresa" required>
    <label>Seu nome</label><input id="f-nome" required>
    <label>Seu e-mail</label><input id="f-email" type="email" required>
    <label>Senha (mínimo 8 caracteres)</label><input id="f-senha" type="password" minlength="8" required>
    <p><button class="btn" type="submit" style="width:100%">Criar conta e começar</button></p>
  </form>
  <p style="font-size:13px;color:var(--suave)">Já tem conta? <a href="/vpe/login">Entrar</a></p>
  <script>
  async function enviar(ev){ev.preventDefault();const v=id=>document.getElementById(id).value;
    const r=await fetch('/vpe/api/cadastro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({empresa:v('f-empresa'),nome:v('f-nome'),email:v('f-email'),senha:v('f-senha')})});
    const d=await r.json().catch(()=>({}));
    if(r.ok)location.href='/vpe/app';else document.getElementById('erro').innerHTML='<div class="erro">'+(d.erro||'Erro ao criar conta.')+'</div>';
    return false;}
  </script>`);

const login = () => formPagina('Entrar', `
  <div id="erro"></div>
  <form onsubmit="return enviar(event)">
    <label>E-mail</label><input id="f-email" type="email" required>
    <label>Senha</label><input id="f-senha" type="password" required>
    <p><button class="btn" type="submit" style="width:100%">Entrar</button></p>
  </form>
  <p style="font-size:13px;color:var(--suave)">Ainda não tem conta? <a href="/vpe/cadastro">Teste grátis 14 dias</a></p>
  <script>
  async function enviar(ev){ev.preventDefault();const v=id=>document.getElementById(id).value;
    const r=await fetch('/vpe/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:v('f-email'),senha:v('f-senha')})});
    const d=await r.json().catch(()=>({}));
    if(r.ok)location.href='/vpe/app';else document.getElementById('erro').innerHTML='<div class="erro">'+(d.erro||'Erro no login.')+'</div>';
    return false;}
  </script>`);

const convite = (token) => formPagina('Aceitar convite', `
  <p style="color:var(--suave)">Você foi convidado para uma empresa no Villela Projects. Se ainda não tem conta, defina nome e senha; se já tem, deixe em branco.</p>
  <div id="erro"></div>
  <form onsubmit="return enviar(event)">
    <label>Seu nome (novos usuários)</label><input id="f-nome">
    <label>Senha (novos usuários — mínimo 8)</label><input id="f-senha" type="password">
    <p><button class="btn" type="submit" style="width:100%">Aceitar convite</button></p>
  </form>
  <script>
  async function enviar(ev){ev.preventDefault();const v=id=>document.getElementById(id).value;
    const r=await fetch('/vpe/api/convites/aceitar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(String(token || ''))},nome:v('f-nome'),senha:v('f-senha')})});
    const d=await r.json().catch(()=>({}));
    if(r.ok)location.href='/vpe/app';else document.getElementById('erro').innerHTML='<div class="erro">'+(d.erro||'Convite inválido.')+'</div>';
    return false;}
  </script>`);

// ------------------------------------------------------------ painel (SPA)
function appTenant() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Villela Projects — Painel</title>
${HEAD_MARCA}
<style>${CSS}
body{background:var(--fundo)}
.layout{display:flex;min-height:calc(100vh - 60px)}
aside{width:235px;background:#fff;border-right:1px solid var(--borda);padding:18px 12px;flex-shrink:0}
aside button{display:block;width:100%;text-align:left;background:none;border:0;padding:10px 12px;border-radius:8px;font-size:14.5px;cursor:pointer;color:var(--ink);font-family:inherit}
aside button.on{background:var(--verde2);color:#fff;font-weight:700}
aside button:hover:not(.on){background:var(--fundo)}
aside .breve{opacity:.45;cursor:default}
main{flex:1;padding:26px;max-width:1080px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin:14px 0}
.kpi{background:#fff;border:1px solid var(--borda);border-radius:12px;padding:14px}.kpi .n{font-size:24px;font-weight:800;color:var(--verde2)}.kpi .r{font-size:12.5px;color:var(--suave)}
.pri-alta{border-left:4px solid var(--alerta)}.pri-media{border-left:4px solid var(--ambar)}.pri-baixa{border-left:4px solid var(--borda)}
@media(max-width:760px){.layout{flex-direction:column}aside{width:auto;display:flex;overflow-x:auto;gap:4px}aside button{white-space:nowrap;width:auto}}
</style></head><body>
<header class="top"><div class="wrap" style="max-width:none">
  <a class="brand" href="/vpe/app">${BRAND_LOCKUP}</a>
  <nav class="nav"><span id="quem" style="font-size:13.5px;color:#C7D0E2"></span> <button id="push-btn" style="display:none;background:none;border:1px solid #C7D0E2;color:#C7D0E2;border-radius:8px;padding:4px 10px;cursor:pointer;font-family:inherit;font-size:13px;margin-left:14px" title="Notificações no celular">🔔 Avisos</button> <a href="#" onclick="return sair()" style="margin-left:14px">Sair</a></nav>
</div></header>
<div class="layout"><aside id="menu"></aside><main id="corpo"><p>Carregando…</p></main></div>
<script>
'use strict';
const S={me:null,tela:'dashboard'};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const dt=s=>s?new Date(s).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const brl=c=>Number(c||0)?('R$ '+(Number(c)/100).toLocaleString('pt-BR',{maximumFractionDigits:0})):'—';
const rot=s=>String(s||'').replace(/_/g,' ');
async function api(m,c,b){const r=await fetch('/vpe/api'+c,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){location.href='/vpe/login';throw new Error('sessão expirada');}
  if(!r.ok)throw new Error(d.erro||('HTTP '+r.status));return d;}
async function sair(){await api('POST','/logout').catch(()=>{});location.href='/vpe/login';return false;}

// ---- notificações push do painel (PWA) — avisos de tarefas e negócios no celular ----
function pushOk(){return ('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);}
function b64ParaU8(b){
  const pad='='.repeat((4-b.length%4)%4);
  const s=(b+pad).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(s);const a=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);
  return a;
}
async function pushAssinado(){
  try{const reg=await navigator.serviceWorker.ready;return await reg.pushManager.getSubscription();}
  catch(_){return null;}
}
async function pintarBotaoPush(){
  const btn=$('push-btn');
  if(!btn||!pushOk())return;
  const sub=await pushAssinado();
  btn.style.display='';
  btn.textContent=sub?'🔔 Avisos ✓':'🔔 Avisos';
  btn.title=sub?'Notificações ativadas — toque para desativar':'Receber avisos de tarefas e negócios no celular';
  btn.onclick=()=>alternarPush();
}
async function alternarPush(){
  try{
    const sub=await pushAssinado();
    if(sub){
      await api('POST','/push/unsubscribe',{endpoint:sub.endpoint}).catch(()=>{});
      await sub.unsubscribe();
    }else{
      const {publicKey}=await api('GET','/push/chave');
      if(!publicKey)return alert('As notificações ainda não estão disponíveis. Tente mais tarde.');
      if((await Notification.requestPermission())!=='granted')return alert('Permissão negada. Libere as notificações deste site nas configurações do navegador.');
      const reg=await navigator.serviceWorker.ready;
      const nova=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ParaU8(publicKey)});
      await api('POST','/push/subscribe',{subscription:nova.toJSON()});
    }
  }catch(e){alert(e.message);}
  pintarBotaoPush();
}

const TELAS=[
 ['dashboard','📊 Dashboard',()=>true],
 ['portfolio','💡 Portfólio',m=>m.permissoes.ver_projetos],
 ['tarefas','✅ Tarefas',m=>m.permissoes.ver_projetos],
 ['eventos','🎪 Eventos',m=>m.permissoes.ver_eventos],
 ['crm','🤝 CRM & Comercial',m=>m.permissoes.gerir_crm||m.permissoes.gerir_propostas],
 ['financeiro','💰 Financeiro',m=>m.permissoes.ver_financeiro],
 ['ia','🤖 IA & Automações',m=>m.permissoes.usar_ia||m.permissoes.gerir_automacoes||m.permissoes.ver_relatorios],
 ['portalcli','🔗 Portal do cliente',m=>m.permissoes.gerir_eventos||m.permissoes.editar_projeto||m.permissoes.gerir_propostas||m.permissoes.gerir_contratos],
 ['integra','🔌 Integrações & API',m=>m.permissoes.configurar_integracoes],
 ['usuarios','👥 Usuários e permissões',m=>m.permissoes.gerir_usuarios],
 ['auditoria','📜 Auditoria',m=>m.permissoes.ver_auditoria],
 ['plano','📦 Plano e uso',m=>m.permissoes.ver_uso||m.permissoes.administrar_cobranca],
 ['config','⚙️ Configurações',m=>m.permissoes.gerir_configuracoes],
];
function menu(){$('menu').innerHTML=TELAS.filter(t=>t[2](S.me)).map(t=>
  t[3]?'<button class="breve" title="Próximas fases">'+t[1]+' <span class="chip">em breve</span></button>'
  :'<button class="'+(S.tela===t[0]?'on':'')+'" onclick="ir(\\''+t[0]+'\\')">'+t[1]+'</button>').join('');}
function ir(t){S.tela=t;menu();({dashboard:vDash,portfolio:vPortfolio,tarefas:vTarefas,eventos:vEventos,fornecedores:vFornecedores,crm:vCrm,financeiro:vFinanceiro,ia:vIa,portalcli:vPortalCli,integra:vIntegra,usuarios:vUsuarios,auditoria:vAudit,plano:vPlano,config:vConfig}[t]||vDash)().catch(e=>$('corpo').innerHTML='<div class="erro">'+esc(e.message)+'</div>');}

async function boot(){
  S.me=await api('GET','/me');
  $('quem').textContent=S.me.user.nome+' · '+S.me.tenant.nome+' ('+S.me.papel_nome+')';
  menu();
  pintarBotaoPush();
  if(S.me.bloqueado){$('corpo').innerHTML='<div class="erro"><b>Conta bloqueada.</b> '+(S.me.tenant.status==='suspensa'?'Sua conta está suspensa — fale com a Villela.':'Seu período de teste terminou — fale com a gente pela página inicial.')+'</div>';return;}
  ir('dashboard');
}
async function vDash(){
  const d=await api('GET','/dashboard');
  const est=Object.entries(d.projetos_por_estagio).sort((a,b)=>b[1]-a[1]);
  $('corpo').innerHTML='<h2>Dashboard executivo</h2>'+
   (d.empresa.interno?'<div class="aviso">🏠 Workspace interno da Villela — portfólio dos negócios próprios.</div>':'')+
   (d.empresa.status==='trial'?'<div class="aviso">🕑 Período de teste até <b>'+new Date(d.empresa.trial_expira_em).toLocaleDateString('pt-BR')+'</b>.</div>':'')+
   '<div class="kpis">'+
   '<div class="kpi"><div class="n">'+d.projetos_total+'</div><div class="r">projetos no portfólio</div></div>'+
   '<div class="kpi"><div class="n">'+(d.projetos_por_estagio.operacao||0)+'</div><div class="r">em operação</div></div>'+
   '<div class="kpi"><div class="n">'+d.projetos_alta_prioridade.length+'</div><div class="r">alta prioridade</div></div>'+
   '<div class="kpi"><div class="n">'+brl(d.investimento_estimado_total)+'</div><div class="r">investimento estimado</div></div>'+
   '<div class="kpi"><div class="n">'+brl(d.receita_potencial_total)+'</div><div class="r">receita potencial/ano</div></div>'+
   (d.a_receber!=null?'<div class="kpi"><div class="n">'+brl(d.a_receber)+'</div><div class="r">a receber</div></div><div class="kpi"><div class="n"'+(d.inadimplencia?' style="color:var(--alerta)"':'')+'>'+brl(d.inadimplencia||0)+'</div><div class="r">inadimplência</div></div>':'')+
   '<div class="kpi"><div class="n">'+(d.eventos_confirmados||0)+'</div><div class="r">eventos confirmados</div></div>'+
   '<div class="kpi"><div class="n">'+(d.eventos_proximos_30d||0)+'</div><div class="r">eventos em 30 dias</div></div>'+
   '<div class="kpi"><div class="n">'+(d.tarefas_abertas||0)+'</div><div class="r">tarefas abertas</div></div>'+
   '<div class="kpi">'+(d.tarefas_atrasadas?'':'')+'<div class="n"'+(d.tarefas_atrasadas?' style="color:var(--alerta)"':'')+'>'+(d.tarefas_atrasadas||0)+'</div><div class="r">tarefas atrasadas</div></div>'+
   '<div class="kpi"><div class="n"'+(d.riscos_criticos?' style="color:var(--alerta)"':'')+'>'+(d.riscos_criticos||0)+'</div><div class="r">riscos críticos</div></div>'+
   '<div class="kpi"><div class="n">'+d.usuarios_ativos+'</div><div class="r">usuários ativos</div></div></div>'+
   '<div class="card"><b>Portfólio por estágio</b><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">'+
   est.map(([e,n])=>'<span class="chip">'+esc(rot(e))+': <b>'+n+'</b></span>').join('')+'</div></div>'+
   (d.projetos_alta_prioridade.length?'<div class="card" style="margin-top:14px"><b>🔥 Alta prioridade</b><table><tr><th>Projeto</th><th>Estágio</th><th>Horizonte</th><th>Próximos passos</th></tr>'+
    d.projetos_alta_prioridade.map(p=>'<tr><td><a href="#" onclick="return abrirProj(\\''+p.id+'\\')">'+esc(p.nome)+'</a></td><td>'+esc(rot(p.estagio))+'</td><td>'+esc(p.horizonte)+'</td><td style="font-size:13px">'+esc((p.proximos_passos||'').slice(0,90))+'</td></tr>').join('')+'</table></div>':'')+
   '<div class="card" style="margin-top:14px"><b>Atividade recente</b><table><tr><th>Quando</th><th>Quem</th><th>Ação</th></tr>'+
   d.auditoria_recente.map(a=>'<tr><td>'+dt(a.criado_em)+'</td><td>'+esc(a.usuario_nome)+'</td><td>'+esc(a.acao)+'</td></tr>').join('')+'</table></div>'+
   '<div class="aviso" style="margin-top:14px">🚧 Portal do cliente e integrações externas chegam nas próximas fases.</div>';
}
// ---------------- Portfólio ----------------
S.pf={estagio:'',categoria:'',busca:''};
async function vPortfolio(){
  const q=Object.entries(S.pf).filter(([,v])=>v).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
  const {projetos,enums}=await api('GET','/projetos'+(q?'?'+q:''));
  S.enums=enums;
  const opt=(lista,sel,rotulo)=>'<option value="">— '+rotulo+' —</option>'+lista.map(x=>'<option value="'+x+'"'+(x===sel?' selected':'')+'>'+rot(x)+'</option>').join('');
  $('corpo').innerHTML='<h2>💡 Portfólio</h2>'+
   '<div class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'+
   '<input id="pf-busca" placeholder="Buscar…" value="'+esc(S.pf.busca)+'" style="max-width:180px" onkeydown="if(event.key===\\'Enter\\')filtrarPf()">'+
   '<select id="pf-estagio" style="max-width:170px" onchange="filtrarPf()">'+opt(S.enums.estagios,S.pf.estagio,'estágio')+'</select>'+
   '<select id="pf-cat" style="max-width:170px" onchange="filtrarPf()">'+opt(S.enums.categorias,S.pf.categoria,'categoria')+'</select>'+
   (S.me.permissoes.criar_projeto?'<button class="btn peq" onclick="novoProj()">+ Nova ideia/projeto</button>':'')+
   '<button class="btn btn-ghost peq" onclick="vRanking()">🏁 Ranking / Matriz</button></div>'+
   '<div class="card" style="margin-top:12px"><table><tr><th>Projeto</th><th>Categoria</th><th>Estágio</th><th>Horizonte</th><th>Prior.</th><th>Invest.</th><th>Receita/ano</th></tr>'+
   (projetos.length?projetos.map(p=>'<tr class="pri-'+p.prioridade+'"><td><a href="#" onclick="return abrirProj(\\''+p.id+'\\')">'+esc(p.nome)+'</a>'+(p.status!=='ativo'?' <span class="chip">'+p.status+'</span>':'')+'</td>'+
    '<td>'+esc(p.categoria)+'</td><td>'+esc(rot(p.estagio))+'</td><td>'+esc(p.horizonte)+'</td><td>'+esc(p.prioridade)+'</td><td>'+brl(p.investimento_estimado)+'</td><td>'+brl(p.receita_potencial)+'</td></tr>').join(''):'<tr><td colspan="7" style="color:var(--suave)">Nenhum projeto — crie a primeira ideia.</td></tr>')+'</table></div>';
}
function filtrarPf(){S.pf={busca:$('pf-busca').value,estagio:$('pf-estagio').value,categoria:$('pf-cat').value};vPortfolio();}
async function vRanking(){
  const d=await api('GET','/portfolio/ranking');
  const corQ={ganho_rapido:'#dcfce7',aposta_grande:'#fef9c3',tarefa_menor:'#e0f2fe',reavaliar:'#fde8e8'};
  $('corpo').innerHTML='<h2>🏁 Ranking do portfólio</h2>'+
   '<p><a href="#" onclick="ir(\\'portfolio\\');return false">← lista</a></p>'+
   '<div class="card"><p class="sub" style="font-size:12px">Score composto = viabilidade (peso 3) + retorno receita/investimento (peso 2) + prioridade (peso 1). Quadrante = impacto × esforço (investimento).</p>'+
   '<table><tr><th>#</th><th>Projeto</th><th>Score</th><th>Viab.</th><th>Retorno</th><th>Invest.</th><th>Quadrante</th><th>Plano?</th></tr>'+
   d.ranking.map((p,i)=>'<tr><td>'+(i+1)+'</td><td><a href="#" onclick="return abrirProj(\\''+p.id+'\\')">'+esc(p.nome)+'</a></td>'+
    '<td><b>'+p.score_composto+'</b></td><td>'+p.viabilidade+'</td><td>'+p.retorno_relativo+'</td><td>'+brl(p.investimento_estimado)+'</td>'+
    '<td><span class="chip" style="background:'+(corQ[p.quadrante]||'#fff')+'">'+esc(rot(p.quadrante))+'</span></td>'+
    '<td>'+(p.tem_plano?'📘':'—')+'</td></tr>').join('')+'</table></div>'+
   '<div class="card" style="margin-top:12px"><b>Legenda dos quadrantes</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">'+
   Object.entries(d.quadrantes).map(([k,v])=>'<span class="chip" style="background:'+(corQ[k]||'#fff')+'">'+esc(v)+'</span>').join('')+'</div></div>';
}
async function novoProj(){
  const nome=prompt('Nome da ideia/projeto:');if(!nome)return;
  try{const r=await api('POST','/projetos',{nome});abrirProj(r.projeto.id);}catch(e){alert(e.message);}
}
async function abrirProj(id,aba){
  S.projId=id;S.projAba=aba||\'dados\';
  const {projeto:p}=await api(\'GET\',\'/projetos/\'+id);
  S.proj=p;S.enums=S.enums||(await api(\'GET\',\'/me\')).enums;
  const abas=[[\'dados\',\'📄 Dados\'],[\'plano\',\'📘 Plano de negócio\'],[\'viab\',\'📊 Viabilidade\'],[\'tar\',\'✅ Tarefas\'],[\'risco\',\'⚠️ Riscos\'],[\'dec\',\'⚖️ Decisões\']];
  $(\'corpo\').innerHTML=\'<p><a href="#" onclick="ir(\\'portfolio\\');return false">← portfólio</a></p><h2>\'+esc(p.nome)+\' <span class="chip">\'+esc(rot(p.estagio))+\'</span>\'+(p.status!==\'ativo\'?\' <span class="chip" style="background:#fde8e8">\'+p.status+\'</span>\':\'\')+\'</h2>\'+
   \'<div class="card" style="display:flex;gap:6px;flex-wrap:wrap">\'+abas.map(([k,r2])=>\'<button class="btn \'+(S.projAba===k?\'\':\'btn-ghost \')+\'peq" onclick="abrirProj(\\'\'+id+\'\\',\\'\'+k+\'\\')">\'+r2+\'</button>\').join(\'\')+\'</div>\'+
   \'<div id="pj-corpo" style="margin-top:12px"><p class="sub">Carregando…</p></div>\';
  await ({dados:vProjDados,plano:vProjPlano,viab:vProjViab,tar:vProjTarefas,risco:vProjRiscos,dec:vProjDec}[S.projAba])();
  return false;
}
async function vProjDados(){
  const p=S.proj;const P=S.me.permissoes;const E=S.enums;
  const sel=(idc,lista,atual)=>\'<select id="\'+idc+\'"\'+(P.editar_projeto?\'\':\' disabled\')+\'>\'+lista.map(x=>\'<option value="\'+x+\'"\'+(x===atual?\' selected\':\'\')+\'>\'+rot(x)+\'</option>\').join(\'\')+\'</select>\';
  $(\'pj-corpo\').innerHTML=\'<div class="card">\'+
   \'<label>Nome</label><input id="pj-nome" value="\'+esc(p.nome)+\'"\'+(P.editar_projeto?\'\':\' disabled\')+\'>\'+
   \'<label>Descrição</label><textarea id="pj-desc" rows="3"\'+(P.editar_projeto?\'\':\' disabled\')+\'>\'+esc(p.descricao)+\'</textarea>\'+
   \'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">\'+
   \'<div><label>Categoria</label>\'+sel(\'pj-cat\',E.categorias,p.categoria)+\'</div>\'+
   \'<div><label>Estágio</label>\'+sel(\'pj-est\',E.estagios,p.estagio)+\'</div>\'+
   \'<div><label>Horizonte</label>\'+sel(\'pj-hor\',E.horizontes,p.horizonte)+\'</div>\'+
   \'<div><label>Prioridade</label>\'+sel(\'pj-pri\',E.prioridades,p.prioridade)+\'</div>\'+
   \'<div><label>Viabilidade (via aba 📊)</label><input value="\'+p.viabilidade+\'/100" disabled></div>\'+
   \'<div><label>Investimento (R$)</label><input id="pj-inv" type="number" value="\'+Math.round((p.investimento_estimado||0)/100)+\'"\'+(P.editar_projeto?\'\':\' disabled\')+\'></div>\'+
   \'<div><label>Receita/ano (R$)</label><input id="pj-rec" type="number" value="\'+Math.round((p.receita_potencial||0)/100)+\'"\'+(P.editar_projeto?\'\':\' disabled\')+\'></div>\'+
   \'<div><label>Responsável</label><input id="pj-resp" value="\'+esc(p.responsavel)+\'"\'+(P.editar_projeto?\'\':\' disabled\')+\'></div></div>\'+
   \'<label>Riscos</label><textarea id="pj-risco" rows="2"\'+(P.editar_projeto?\'\':\' disabled\')+\'>\'+esc(p.riscos)+\'</textarea>\'+
   \'<label>Próximos passos</label><textarea id="pj-prox" rows="2"\'+(P.editar_projeto?\'\':\' disabled\')+\'>\'+esc(p.proximos_passos)+\'</textarea>\'+
   (P.editar_projeto?\'<p><button class="btn peq" onclick="salvarProj(\\'\'+p.id+\'\\')">Salvar</button> <span id="pj-out"></span></p>\':\'\')+
   \'</div>\';
}
async function vProjPlano(){
  const P=S.me.permissoes;
  const d=await api(\'GET\',\'/projetos/\'+S.projId+\'/plano\');
  const vers=(await api(\'GET\',\'/projetos/\'+S.projId+\'/plano/versoes\')).versoes;
  $(\'pj-corpo\').innerHTML=\'<div class="card"><b>Plano de negócio</b> <span class="chip">\'+(d.plano?(\'v\'+d.plano.versao+\' · \'+esc(d.plano.status)):\'ainda não iniciado\')+\'</span>\'+
   \' <span class="chip">completude: \'+d.completude+\'%</span>\'+
   \'<p class="sub" style="font-size:12px">Preencha as seções que fizerem sentido — cada salvamento gera uma versão. Geração assistida por IA chega na Fase 6.</p>\'+
   d.catalogo.map(([k,r2])=>\'<label>\'+esc(r2)+\'</label><textarea class="bp-sec" data-k="\'+k+\'" rows="3"\'+(P.editar_projeto?\'\':\' disabled\')+\'>\'+esc(d.secoes[k]||\'\')+\'</textarea>\').join(\'\')+
   (P.editar_projeto?\'<p style="margin-top:10px"><button class="btn peq" onclick="salvarPlanoNeg()">Salvar plano (gera versão)</button> \'+
    \'<select id="bp-status" style="width:auto"><option value="">status…</option>\'+[\'rascunho\',\'em_analise\',\'aprovado\'].map(s2=>\'<option\'+((d.plano&&d.plano.status)===s2?\' selected\':\'\')+\'>\'+s2+\'</option>\').join(\'\')+\'</select>\'+
    \' <span id="bp-out"></span></p>\':\'\')+
   (vers.length?\'<p class="sub" style="font-size:12px"><b>Versões:</b> \'+vers.map(v=>\'v\'+v.numero+\' (\'+dt(v.criado_em)+\')\').join(\' · \')+\'</p>\':\'\')+
   \'</div>\';
}
async function salvarPlanoNeg(){try{
  const secoes={};document.querySelectorAll(\'.bp-sec\').forEach(t=>secoes[t.dataset.k]=t.value);
  const status=$(\'bp-status\').value||undefined;
  const d=await api(\'PUT\',\'/projetos/\'+S.projId+\'/plano\',{secoes,status});
  $(\'bp-out\').textContent=\'✅ salvo (v\'+d.plano.versao+\', \'+d.completude+\'%)\';
 }catch(e){$(\'bp-out\').textContent=\'⚠️ \'+e.message;}}
async function vProjViab(){
  const P=S.me.permissoes;
  const d=await api(\'GET\',\'/projetos/\'+S.projId+\'/viabilidade\');
  $(\'pj-corpo\').innerHTML=\'<div class="card"><b>Score de viabilidade</b> <span class="chip" style="font-size:14px">\'+d.score+\'/100</span>\'+
   \'<p class="sub" style="font-size:12px">Nota de 0 a 10 por critério (10 = melhor cenário). O score é a média ×10 e alimenta o ranking.</p>\'+
   \'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px">\'+
   d.catalogo.map(([k,r2])=>\'<div><label style="margin-top:4px">\'+esc(r2)+\'</label><input class="vb-c" data-k="\'+k+\'" type="number" min="0" max="10" value="\'+(d.criterios[k]!=null?d.criterios[k]:\'\')+\'"\'+(P.editar_projeto?\'\':\' disabled\')+\'></div>\').join(\'\')+\'</div>\'+
   \'<label>Observações</label><textarea id="vb-obs" rows="2"\'+(P.editar_projeto?\'\':\' disabled\')+\'>\'+esc(d.observacoes)+\'</textarea>\'+
   (P.editar_projeto?\'<p><button class="btn peq" onclick="salvarViab()">Calcular e salvar score</button> <span id="vb-out"></span></p>\':\'\')+
   \'</div>\';
}
async function salvarViab(){try{
  const criterios={};document.querySelectorAll(\'.vb-c\').forEach(i=>{if(i.value!==\'\')criterios[i.dataset.k]=Number(i.value);});
  const d=await api(\'PUT\',\'/projetos/\'+S.projId+\'/viabilidade\',{criterios,observacoes:$(\'vb-obs\').value});
  $(\'vb-out\').textContent=\'✅ score: \'+d.score+\'/100\';
 }catch(e){$(\'vb-out\').textContent=\'⚠️ \'+e.message;}}
async function vProjDec(){
  const P=S.me.permissoes;
  const {decisoes}=await api(\'GET\',\'/projetos/\'+S.projId+\'/decisoes\');
  const rotD={avancar:\'▶ Avançar\',amadurecer:\'🌱 Amadurecer\',pausar:\'⏸ Pausar\',descartar:\'✖ Descartar\',retomar:\'↩ Retomar\'};
  $(\'pj-corpo\').innerHTML=\'<div class="card"><b>Decisões (governança)</b>\'+
   \'<p class="sub" style="font-size:12px">Toda decisão exige justificativa e fica no histórico. Pausar/descartar/retomar aplicam o status no projeto.</p>\'+
   (P.decidir_projeto?\'<label>Justificativa</label><textarea id="dc-just" rows="2"></textarea>\'+
    \'<p>\'+Object.entries(rotD).map(([k,r2])=>\'<button class="btn \'+(k===\'avancar\'?\'\':\'btn-ghost \')+\'peq" onclick="decidir(\\'\'+k+\'\\')">\'+r2+\'</button> \').join(\'\')+\'</p><div id="dc-out"></div>\'
    :\'<p class="sub">Você não tem a permissão decidir_projeto.</p>\')+
   \'<table><tr><th>Quando</th><th>Decisão</th><th>Por</th><th>Justificativa</th></tr>\'+
   (decisoes.length?decisoes.map(d=>\'<tr><td>\'+dt(d.criado_em)+\'</td><td>\'+esc(rotD[d.decisao]||d.decisao)+\'</td><td>\'+esc(d.decidido_nome)+\'</td><td>\'+esc(d.justificativa)+\'</td></tr>\').join(\'\'):\'<tr><td colspan="4" style="color:var(--suave)">Nenhuma decisão registrada.</td></tr>\')+\'</table></div>\';
}
async function decidir(decisao){try{
  await api(\'POST\',\'/projetos/\'+S.projId+\'/decisoes\',{decisao,justificativa:$(\'dc-just\').value});
  abrirProj(S.projId,\'dec\');
 }catch(e){$(\'dc-out\').innerHTML=\'<div class="erro">\'+esc(e.message)+\'</div>\';}}
async function salvarProj(id){try{
  await api(\'PATCH\',\'/projetos/\'+id,{nome:$(\'pj-nome\').value,descricao:$(\'pj-desc\').value,categoria:$(\'pj-cat\').value,estagio:$(\'pj-est\').value,horizonte:$(\'pj-hor\').value,prioridade:$(\'pj-pri\').value,investimento_estimado:Math.round(Number($(\'pj-inv\').value)*100)||0,receita_potencial:Math.round(Number($(\'pj-rec\').value)*100)||0,responsavel:$(\'pj-resp\').value,riscos:$(\'pj-risco\').value,proximos_passos:$(\'pj-prox\').value});
  $(\'pj-out\').textContent=\'✅ salvo\';}catch(e){$(\'pj-out\').textContent=\'⚠️ \'+e.message;}}

// ---------------- Execução: tarefas e riscos (Fase 3) ----------------
const ST_ROT={pendente:'📥 Pendente',em_andamento:'🔨 Em andamento',aguardando:'⏳ Aguardando',em_revisao:'👀 Em revisão',concluida:'✅ Concluída',cancelada:'✖ Cancelada'};
function tChip(t){return (t.atrasada?'<span class="chip" style="background:#fde8e8">atrasada</span> ':'')+(t.prazo?'<span class="chip">'+t.prazo.split('-').reverse().join('/')+'</span> ':'')+(t.subtarefas_total?'<span class="chip">'+t.subtarefas_feitas+'/'+t.subtarefas_total+' sub</span> ':'')+(t.checklist&&t.checklist.length?'<span class="chip">☑ '+t.checklist.filter(c=>c.feito).length+'/'+t.checklist.length+'</span>':'');}
async function vTarefas(){
  S.tf=S.tf||{minhas:'1',atrasadas:''};
  const q='?'+(S.tf.minhas?'minhas=1&':'')+(S.tf.atrasadas?'atrasadas=1&':'');
  const [{tarefas:ts},ag]=await Promise.all([api('GET','/tarefas'+q),api('GET','/tarefas/agenda?dias=14'+(S.tf.minhas?'&minhas=1':''))]);
  if(!S.projNomes){const pr=await api('GET','/projetos');S.projNomes={};pr.projetos.forEach(p=>S.projNomes[p.id]=p.nome);}
  const nomeProj=S.projNomes;
  $('corpo').innerHTML='<h2>✅ Tarefas</h2>'+
   '<div class="card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">'+
   '<label style="margin:0;display:flex;gap:4px;align-items:center;font-weight:400"><input type="checkbox" '+(S.tf.minhas?'checked':'')+' onchange="S.tf.minhas=this.checked?String(1):String();vTarefas()" style="width:auto"> só as minhas</label>'+
   '<label style="margin:0;display:flex;gap:4px;align-items:center;font-weight:400"><input type="checkbox" '+(S.tf.atrasadas?'checked':'')+' onchange="S.tf.atrasadas=this.checked?String(1):String();vTarefas()" style="width:auto"> só atrasadas</label>'+
   '<span class="sub" style="font-size:12px">Para criar tarefas, abra o projeto → aba ✅ Tarefas.</span></div>'+
   '<div class="card" style="margin-top:12px"><table><tr><th>Tarefa</th><th>Projeto</th><th>Status</th><th>Prior.</th><th>Info</th></tr>'+
   (ts.length?ts.map(t=>'<tr><td><a href="#" onclick="return abrirTarefa(\\''+t.id+'\\')">'+esc(t.titulo)+'</a></td>'+
    '<td>'+esc(nomeProj[t.project_id]||'—')+'</td><td>'+(ST_ROT[t.status]||t.status)+'</td><td>'+esc(t.prioridade)+'</td><td>'+tChip(t)+'</td></tr>').join(''):'<tr><td colspan="5" style="color:var(--suave)">Nenhuma tarefa.</td></tr>')+'</table></div>'+
   (ag.dias.length?'<div class="card" style="margin-top:12px"><b>📅 Agenda (14 dias + atrasadas)</b>'+
    ag.dias.map(d=>'<p style="margin:.5rem 0 .2rem"><b>'+d.split('-').reverse().join('/')+'</b></p>'+ag.porDia[d].map(t=>'<div style="font-size:13.5px">'+(t.atrasada?'🔴':'•')+' <a href="#" onclick="return abrirTarefa(\\''+t.id+'\\')">'+esc(t.titulo)+'</a> <span class="sub">('+esc(t.projeto_nome)+')</span></div>').join('')).join('')+'</div>':'');
}
async function vProjTarefas(){
  const P=S.me.permissoes;
  const kb=await api('GET','/projetos/'+S.projId+'/kanban');
  const colunas=kb.ordem_colunas.filter(c=>c!=='cancelada');
  const card=t=>'<div class="card" style="padding:10px;margin-bottom:8px"><a href="#" onclick="return abrirTarefa(\\''+t.id+'\\')"><b>'+esc(t.titulo)+'</b></a><br>'+tChip(t)+
   (P.gerir_tarefas?'<div style="margin-top:6px"><select onchange="moverTarefa(\\''+t.id+'\\',this.value)" style="font-size:12px;padding:4px">'+kb.ordem_colunas.map(c2=>'<option value="'+c2+'"'+(c2===t.status?' selected':'')+'>'+(ST_ROT[c2]||c2)+'</option>').join('')+'</select></div>':'')+'</div>';
  $('pj-corpo').innerHTML=(P.gerir_tarefas?'<div class="card" style="display:flex;gap:8px;flex-wrap:wrap"><input id="nt-titulo" placeholder="Nova tarefa…" style="flex:1;min-width:220px"><input id="nt-prazo" type="date" style="width:auto"><button class="btn peq" onclick="novaTarefa()">Criar</button></div>':'')+
   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:10px">'+
   colunas.map(c=>'<div><div style="font-weight:700;font-size:13px;margin-bottom:6px">'+(ST_ROT[c]||c)+' ('+kb.colunas[c].length+')</div>'+kb.colunas[c].map(card).join('')+'</div>').join('')+'</div>';
}
async function novaTarefa(){try{await api('POST','/projetos/'+S.projId+'/tarefas',{titulo:$('nt-titulo').value,prazo:$('nt-prazo').value});vProjTarefas();}catch(e){alert(e.message);}}
async function moverTarefa(id,status){try{await api('PATCH','/tarefas/'+id,{status});if(S.tela==='tarefas')vTarefas();else vProjTarefas();}catch(e){alert(e.message);vProjTarefas();}}
async function abrirTarefa(id){
  const P=S.me.permissoes;
  const {tarefa:t}=await api('GET','/tarefas/'+id);
  const podeEd=P.gerir_tarefas;
  if(!S.usuariosCache&&P.gerir_usuarios){try{S.usuariosCache=(await api('GET','/usuarios')).usuarios.filter(u=>u.status==='ativo');}catch(_){S.usuariosCache=[];}}
  const usuarios=S.usuariosCache;
  S.chkTmp=t.checklist.slice();
  const dis=podeEd?'':' disabled';
  $('corpo').innerHTML='<p><a href="#" onclick="return voltarTarefa()">← voltar</a></p><h2>'+esc(t.titulo)+' '+(t.atrasada?'<span class="chip" style="background:#fde8e8">atrasada</span>':'')+'</h2>'+
   '<div class="card">'+
   '<label>Título</label><input id="tt-titulo" value="'+esc(t.titulo)+'"'+dis+'>'+
   '<label>Descrição</label><textarea id="tt-desc" rows="2"'+dis+'>'+esc(t.descricao)+'</textarea>'+
   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">'+
   '<div><label>Status</label><select id="tt-status"'+dis+'>'+Object.entries(ST_ROT).map(([k,r2])=>'<option value="'+k+'"'+(k===t.status?' selected':'')+'>'+r2+'</option>').join('')+'</select></div>'+
   '<div><label>Prioridade</label><select id="tt-pri"'+dis+'>'+['alta','media','baixa'].map(x=>'<option'+(x===t.prioridade?' selected':'')+'>'+x+'</option>').join('')+'</select></div>'+
   '<div><label>Prazo</label><input id="tt-prazo" type="date" value="'+esc(t.prazo)+'"'+dis+'></div>'+
   (usuarios?'<div><label>Responsável</label><select id="tt-resp"'+dis+'><option value="">—</option>'+usuarios.map(u=>'<option value="'+u.user_id+'"'+(u.user_id===t.responsavel_id?' selected':'')+'>'+esc(u.nome)+'</option>').join('')+'</select></div>':'')+'</div>'+
   '<label>Checklist</label><div id="tt-check">'+renderChecklist()+'</div>'+
   (podeEd?'<div style="display:flex;gap:6px;margin-top:4px"><input id="chk-novo" placeholder="Novo item do checklist" style="flex:1"><button class="btn btn-ghost peq" onclick="addChk()">+</button></div>':'')+
   (podeEd?'<p style="margin-top:10px"><button class="btn peq" onclick="salvarTarefa(\\''+t.id+'\\')">Salvar</button> <button class="btn btn-ghost peq" onclick="excluirTarefaUi(\\''+t.id+'\\')">Excluir</button> <span id="tt-out"></span></p>':'')+
   '</div>'+
   '<div class="card" style="margin-top:12px"><b>Subtarefas</b> '+
   (podeEd&&!t.parent_id?'<div style="display:flex;gap:8px;margin-top:6px"><input id="st-titulo" placeholder="Nova subtarefa…" style="flex:1"><button class="btn peq" onclick="novaSubtarefa(\\''+t.project_id+'\\',\\''+t.id+'\\')">+</button></div>':'')+
   (t.subtarefas.length?'<table style="margin-top:6px"><tr><th>Subtarefa</th><th>Status</th><th>Prazo</th></tr>'+t.subtarefas.map(st=>'<tr><td><a href="#" onclick="return abrirTarefa(\\''+st.id+'\\')">'+esc(st.titulo)+'</a></td><td>'+(ST_ROT[st.status]||st.status)+'</td><td>'+(st.prazo||'—')+'</td></tr>').join('')+'</table>':'<p class="sub" style="font-size:13px">Nenhuma.</p>')+'</div>';
  return false;
}
function voltarTarefa(){if(S.tela==='tarefas'&&!S.projAbaVinda){vTarefas();}else if(S.projId){abrirProj(S.projId,'tar');}else{ir('tarefas');}return false;}
function renderChecklist(){return (S.chkTmp||[]).map((c,i)=>'<label style="display:flex;gap:6px;align-items:center;margin:2px 0;font-weight:400"><input type="checkbox" '+(c.feito?'checked':'')+' onchange="S.chkTmp['+i+'].feito=this.checked" style="width:auto"> '+esc(c.t)+' <a href="#" onclick="S.chkTmp.splice('+i+',1);document.getElementById(String(\\'tt-check\\')).innerHTML=renderChecklist();return false" style="font-size:12px">✕</a></label>').join('')||'<span class="sub" style="font-size:13px">Sem itens.</span>';}
function addChk(){const v=$('chk-novo').value.trim();if(!v)return;S.chkTmp.push({t:v,feito:false});$('chk-novo').value='';$('tt-check').innerHTML=renderChecklist();}
async function salvarTarefa(id){try{
  const body={titulo:$('tt-titulo').value,descricao:$('tt-desc').value,status:$('tt-status').value,prioridade:$('tt-pri').value,prazo:$('tt-prazo').value,checklist:S.chkTmp};
  const resp=document.getElementById('tt-resp');if(resp)body.responsavel_id=resp.value;
  await api('PATCH','/tarefas/'+id,body);
  $('tt-out').textContent='✅ salvo';
 }catch(e){$('tt-out').textContent='⚠️ '+e.message;}}
async function excluirTarefaUi(id){if(!confirm('Excluir a tarefa (e subtarefas)?'))return;try{await api('DELETE','/tarefas/'+id);voltarTarefa();}catch(e){alert(e.message);}}
async function novaSubtarefa(projId,paiId){try{await api('POST','/projetos/'+projId+'/tarefas',{titulo:$('st-titulo').value,parent_id:paiId});abrirTarefa(paiId);}catch(e){alert(e.message);}}
async function vProjRiscos(){
  const P=S.me.permissoes;
  const {riscos}=await api('GET','/projetos/'+S.projId+'/riscos');
  const sev=r=>r.severidade>=6?'🔴':r.severidade>=3?'🟡':'🟢';
  $('pj-corpo').innerHTML=(P.editar_projeto?'<div class="card"><b>Novo risco</b>'+
   '<label>Descrição</label><input id="rk-desc">'+
   '<div style="display:flex;gap:10px;flex-wrap:wrap"><div><label>Probabilidade</label><select id="rk-prob">'+['baixa','media','alta'].map(x=>'<option>'+x+'</option>').join('')+'</select></div>'+
   '<div><label>Impacto</label><select id="rk-imp">'+['baixo','medio','alto'].map(x=>'<option>'+x+'</option>').join('')+'</select></div></div>'+
   '<label>Plano de prevenção</label><input id="rk-prev"><label>Plano de contingência</label><input id="rk-cont">'+
   '<p><button class="btn peq" onclick="novoRisco()">Registrar risco</button></p></div>':'')+
   '<div class="card" style="margin-top:12px"><table><tr><th></th><th>Risco</th><th>Prob.</th><th>Impacto</th><th>Status</th><th>Prevenção</th></tr>'+
   (riscos.length?riscos.map(r=>'<tr><td>'+sev(r)+'</td><td>'+esc(r.descricao)+'</td><td>'+r.probabilidade+'</td><td>'+r.impacto+'</td>'+
    '<td>'+(P.editar_projeto?'<select onchange="statusRisco(\\''+r.id+'\\',this.value)">'+['aberto','mitigado','ocorreu','encerrado'].map(x=>'<option'+(x===r.status?' selected':'')+'>'+x+'</option>').join('')+'</select>':r.status)+'</td>'+
    '<td style="font-size:13px">'+esc(r.plano_prevencao)+'</td></tr>').join(''):'<tr><td colspan="6" style="color:var(--suave)">Nenhum risco registrado.</td></tr>')+'</table></div>';
}
async function novoRisco(){try{await api('POST','/projetos/'+S.projId+'/riscos',{descricao:$('rk-desc').value,probabilidade:$('rk-prob').value,impacto:$('rk-imp').value,plano_prevencao:$('rk-prev').value,plano_contingencia:$('rk-cont').value});vProjRiscos();}catch(e){alert(e.message);}}
async function statusRisco(id,status){try{await api('PATCH','/riscos/'+id,{status});}catch(e){alert(e.message);vProjRiscos();}}

// ---------------- Eventos (Fase 4) ----------------
const EV_ROT={lead:'Lead',briefing:'Briefing',proposta:'Proposta',negociacao:'Negociação',aprovado:'Aprovado',confirmado:'Confirmado',em_preparacao:'Em preparação',realizado:'Realizado',pos_evento:'Pós-evento',cancelado:'Cancelado'};
async function vEventos(){
  S.evF=S.evF||{status:'',busca:''};
  const q='?'+(S.evF.status?'status='+S.evF.status+'&':'')+(S.evF.busca?'busca='+encodeURIComponent(S.evF.busca)+'&':'');
  const {eventos:evs,enums}=await api('GET','/eventos'+q);
  S.evEnums=enums;
  const opt=(lista,sel,rotulo,mapa)=>'<option value="">— '+rotulo+' —</option>'+lista.map(x=>'<option value="'+x+'"'+(x===sel?' selected':'')+'>'+((mapa&&mapa[x])||rot(x))+'</option>').join('');
  $('corpo').innerHTML='<h2>🎪 Eventos</h2>'+
   '<div class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'+
   '<input id="ev-busca" placeholder="Buscar evento/cliente…" value="'+esc(S.evF.busca)+'" style="max-width:200px" onkeydown="if(event.keyCode===13)filtrarEv()">'+
   '<select id="ev-status" style="max-width:170px" onchange="filtrarEv()">'+opt(enums.status,S.evF.status,'status',EV_ROT)+'</select>'+
   (S.me.permissoes.gerir_eventos?'<button class="btn peq" onclick="novoEvento()">+ Novo evento</button>':'')+
   '<button class="btn btn-ghost peq" onclick="ir(String.fromCharCode(102,111,114,110,101,99,101,100,111,114,101,115))">🤝 Fornecedores</button></div>'+
   '<div class="card" style="margin-top:12px"><table><tr><th>Evento</th><th>Tipo</th><th>Cliente</th><th>Data</th><th>Convidados</th><th>Status</th><th>Valor</th></tr>'+
   (evs.length?evs.map(e=>'<tr><td><a href="#" onclick="return abrirEvento(\\''+e.id+'\\')">'+esc(e.nome)+'</a></td>'+
    '<td>'+esc(rot(e.tipo))+'</td><td>'+esc(e.cliente_nome||'—')+'</td><td>'+(e.data?e.data.split('-').reverse().join('/'):'—')+'</td>'+
    '<td>'+(e.convidados_previstos||'—')+'</td><td><span class="chip">'+(EV_ROT[e.status]||e.status)+'</span></td><td>'+brl(e.receita_centavos)+'</td></tr>').join(''):'<tr><td colspan="7" style="color:var(--suave)">Nenhum evento — crie o primeiro.</td></tr>')+'</table></div>';
}
function filtrarEv(){S.evF={status:$('ev-status').value,busca:$('ev-busca').value};vEventos();}
async function novoEvento(){const nome=prompt('Nome do evento:');if(!nome)return;try{const r=await api('POST','/eventos',{nome});abrirEvento(r.evento.id);}catch(e){alert(e.message);}}
async function abrirEvento(id,aba){
  S.evId=id;S.evAba=aba||'dados';
  const {evento:e,enums}=await api('GET','/eventos/'+id);
  S.ev=e;S.evEnums2=enums;
  const abas=[['dados','📋 Dados & Briefing'],['forn','🤝 Fornecedores'],['conv','👥 Convidados'],['check','✅ Checklist'],['pos','🎬 Pós-evento']];
  $('corpo').innerHTML='<p><a href="#" onclick="ir(String.fromCharCode(101,118,101,110,116,111,115));return false">← eventos</a></p><h2>'+esc(e.nome)+' <span class="chip">'+(EV_ROT[e.status]||e.status)+'</span></h2>'+
   '<div class="card" style="display:flex;gap:6px;flex-wrap:wrap">'+abas.map(([k,r2])=>'<button class="btn '+(S.evAba===k?'':'btn-ghost ')+'peq" onclick="abrirEvento(\\''+id+'\\',\\''+k+'\\')">'+r2+'</button>').join('')+'</div>'+
   '<div class="card" style="margin-top:10px;display:flex;gap:14px;flex-wrap:wrap;font-size:13.5px">'+
   '<span>👥 <b>'+e.convidados.confirmados+'</b> confirmados / '+e.convidados.pendentes+' pendentes</span>'+
   '<span>✅ check-in: <b>'+e.convidados.checkins+'</b></span>'+
   '<span>💰 receita <b>'+brl(e.financeiro.receita)+'</b> · custo '+brl(e.financeiro.custo_total)+' · margem <b style="color:'+(e.financeiro.margem>=0?'var(--acc)':'var(--alerta)')+'">'+brl(e.financeiro.margem)+'</b></span></div>'+
   '<div id="ev-corpo" style="margin-top:12px"><p class="sub">Carregando…</p></div>';
  await ({dados:vEvDados,forn:vEvForn,conv:vEvConv,check:vEvCheck,pos:vEvPos}[S.evAba])();
  return false;
}
async function vEvDados(){
  const e=S.ev;const P=S.me.permissoes;const En=S.evEnums2;const dis=P.gerir_eventos?'':' disabled';
  const sel=(idc,lista,atual,mapa)=>'<select id="'+idc+'"'+dis+'>'+lista.map(x=>'<option value="'+x+'"'+(x===atual?' selected':'')+'>'+((mapa&&mapa[x])||rot(x))+'</option>').join('')+'</select>';
  $('ev-corpo').innerHTML='<div class="card">'+
   '<label>Nome</label><input id="ed-nome" value="'+esc(e.nome)+'"'+dis+'>'+
   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">'+
   '<div><label>Tipo</label>'+sel('ed-tipo',En.tipos,e.tipo)+'</div>'+
   '<div><label>Status</label>'+sel('ed-status',En.status,e.status,EV_ROT)+'</div>'+
   '<div><label>Data</label><input id="ed-data" type="date" value="'+esc(e.data)+'"'+dis+'></div>'+
   '<div><label>Hora</label><input id="ed-hora" value="'+esc(e.hora)+'"'+dis+'></div>'+
   '<div><label>Convidados previstos</label><input id="ed-conv" type="number" value="'+e.convidados_previstos+'"'+dis+'></div>'+
   '<div><label>Local</label><input id="ed-local" value="'+esc(e.local)+'"'+dis+'></div>'+
   '<div><label>Cliente</label><input id="ed-cli" value="'+esc(e.cliente_nome)+'"'+dis+'></div>'+
   '<div><label>Contato do cliente</label><input id="ed-clicontato" value="'+esc(e.cliente_contato)+'"'+dis+'></div>'+
   '<div><label>Orçamento/custo (R$)</label><input id="ed-orc" type="number" value="'+Math.round((e.orcamento_centavos||0)/100)+'"'+dis+'></div>'+
   '<div><label>Receita fechada (R$)</label><input id="ed-rec" type="number" value="'+Math.round((e.receita_centavos||0)/100)+'"'+dis+'></div></div>'+
   '<h3 style="font-size:16px;margin-top:14px">Briefing</h3>'+
   e.catalogo_briefing.map(([k,r2])=>'<label>'+esc(r2)+'</label><textarea class="eb-sec" data-k="'+k+'" rows="2"'+dis+'>'+esc(e.briefing[k]||'')+'</textarea>').join('')+
   (P.gerir_eventos?'<p style="margin-top:10px"><button class="btn peq" onclick="salvarEvento()">Salvar</button> <span id="ed-out"></span></p>':'')+
   '</div>';
}
async function salvarEvento(){try{
  const briefing={};document.querySelectorAll('.eb-sec').forEach(t=>briefing[t.dataset.k]=t.value);
  await api('PATCH','/eventos/'+S.evId,{nome:$('ed-nome').value,tipo:$('ed-tipo').value,status:$('ed-status').value,data:$('ed-data').value,hora:$('ed-hora').value,convidados_previstos:Number($('ed-conv').value)||0,local:$('ed-local').value,cliente_nome:$('ed-cli').value,cliente_contato:$('ed-clicontato').value,orcamento_centavos:Math.round(Number($('ed-orc').value)*100)||0,receita_centavos:Math.round(Number($('ed-rec').value)*100)||0,briefing});
  $('ed-out').textContent='✅ salvo';abrirEvento(S.evId,'dados');
 }catch(e){$('ed-out').textContent='⚠️ '+e.message;}}
async function vEvForn(){
  const P=S.me.permissoes;const e=S.ev;
  const fornDisp=(await api('GET','/fornecedores')).fornecedores.filter(f=>!f.bloqueado);
  $('ev-corpo').innerHTML=(P.gerir_eventos?'<div class="card"><b>Alocar fornecedor</b>'+
   (fornDisp.length?'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><select id="ef-sup" style="flex:1;min-width:200px">'+fornDisp.map(f=>'<option value="'+f.id+'">'+esc(f.nome)+' ('+esc(f.categoria)+')</option>').join('')+'</select>'+
    '<input id="ef-valor" type="number" placeholder="Valor R$" style="max-width:130px"><button class="btn peq" onclick="alocarForn()">Alocar</button></div>':'<p class="sub">Cadastre fornecedores em 🤝 Fornecedores primeiro.</p>')+'</div>':'')+
   '<div class="card" style="margin-top:12px"><table><tr><th>Fornecedor</th><th>Categoria</th><th>Valor</th><th>Status</th><th></th></tr>'+
   (e.fornecedores.length?e.fornecedores.map(a=>'<tr><td>'+esc(a.fornecedor_nome||'(removido)')+'</td><td>'+esc(a.categoria)+'</td><td>'+brl(a.valor_centavos)+'</td>'+
    '<td>'+(P.gerir_eventos?'<select onchange="statusAloc(\\''+a.id+'\\',this.value)">'+['cotado','confirmado','pago','cancelado'].map(x=>'<option'+(x===a.status?' selected':'')+'>'+x+'</option>').join('')+'</select>':a.status)+'</td>'+
    '<td>'+(P.gerir_eventos?'<button class="btn btn-ghost peq" onclick="removerAloc(\\''+a.id+'\\')">✕</button>':'')+'</td></tr>').join(''):'<tr><td colspan="5" style="color:var(--suave)">Nenhum fornecedor alocado.</td></tr>')+'</table></div>';
}
async function alocarForn(){try{await api('POST','/eventos/'+S.evId+'/fornecedores',{supplier_id:$('ef-sup').value,valor_centavos:Math.round(Number($('ef-valor').value)*100)||0});abrirEvento(S.evId,'forn');}catch(e){alert(e.message);}}
async function statusAloc(id,status){try{await api('PATCH','/eventos-fornecedores/'+id,{status});abrirEvento(S.evId,'forn');}catch(e){alert(e.message);}}
async function removerAloc(id){if(!confirm('Remover este fornecedor do evento?'))return;try{await api('DELETE','/eventos-fornecedores/'+id);abrirEvento(S.evId,'forn');}catch(e){alert(e.message);}}
async function vEvConv(){
  const P=S.me.permissoes;
  const {convidados}=await api('GET','/eventos/'+S.evId+'/convidados');
  const rsvpChip={pendente:'⏳ pendente',confirmado:'✅ confirmado',recusado:'✖ recusado'};
  $('ev-corpo').innerHTML=(P.gerir_eventos?'<div class="card"><b>Adicionar convidado</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><input id="cv-nome" placeholder="Nome" style="flex:1;min-width:160px"><input id="cv-acomp" type="number" placeholder="Acomp." style="max-width:90px"><input id="cv-restr" placeholder="Restrição alimentar" style="max-width:180px"><button class="btn peq" onclick="addConvidado()">Adicionar</button></div></div>':'')+
   '<div class="card" style="margin-top:12px"><table><tr><th>Nome</th><th>Acomp.</th><th>RSVP</th><th>Restrição</th><th>Check-in</th><th></th></tr>'+
   (convidados.length?convidados.map(g=>'<tr><td>'+esc(g.nome)+'</td><td>'+g.acompanhantes+'</td>'+
    '<td>'+(P.gerir_eventos?'<select onchange="rsvpConv(\\''+g.id+'\\',this.value)">'+['pendente','confirmado','recusado'].map(x=>'<option value="'+x+'"'+(x===g.rsvp?' selected':'')+'>'+(rsvpChip[x])+'</option>').join('')+'</select>':(rsvpChip[g.rsvp]||g.rsvp))+'</td>'+
    '<td>'+esc(g.restricao_alimentar||'—')+'</td>'+
    '<td>'+(g.checkin_em?'✅ '+dt(g.checkin_em):(P.gerir_eventos?'<button class="btn btn-ghost peq" onclick="checkinConv(\\''+g.id+'\\',true)">Check-in</button>':'—'))+'</td>'+
    '<td>'+(P.gerir_eventos?'<button class="btn btn-ghost peq" onclick="delConv(\\''+g.id+'\\')">✕</button>':'')+'</td></tr>').join(''):'<tr><td colspan="6" style="color:var(--suave)">Nenhum convidado.</td></tr>')+'</table></div>';
}
async function addConvidado(){try{await api('POST','/eventos/'+S.evId+'/convidados',{nome:$('cv-nome').value,acompanhantes:Number($('cv-acomp').value)||0,restricao_alimentar:$('cv-restr').value});abrirEvento(S.evId,'conv');}catch(e){alert(e.message);}}
async function rsvpConv(id,rsvp){try{await api('PATCH','/convidados/'+id,{rsvp});abrirEvento(S.evId,'conv');}catch(e){alert(e.message);}}
async function checkinConv(id){try{await api('PATCH','/convidados/'+id,{checkin:true});abrirEvento(S.evId,'conv');}catch(e){alert(e.message);}}
async function delConv(id){if(!confirm('Remover convidado?'))return;try{await api('DELETE','/convidados/'+id);abrirEvento(S.evId,'conv');}catch(e){alert(e.message);}}
async function vEvCheck(){
  const P=S.me.permissoes;S.evChk=S.ev.checklist.slice();
  $('ev-corpo').innerHTML='<div class="card"><b>Checklist do evento</b><div id="ev-chk" style="margin-top:8px">'+renderEvChk()+'</div>'+
   (P.gerir_eventos?'<div style="display:flex;gap:6px;margin-top:6px"><input id="evchk-novo" placeholder="Novo item" style="flex:1"><button class="btn btn-ghost peq" onclick="addEvChk()">+</button></div>'+
    '<p><button class="btn peq" onclick="salvarEvChk()">Salvar checklist</button> <span id="evchk-out"></span></p>':'')+'</div>';
}
function renderEvChk(){return (S.evChk||[]).map((c,i)=>'<label style="display:flex;gap:6px;align-items:center;margin:2px 0;font-weight:400"><input type="checkbox" '+(c.feito?'checked':'')+' onchange="S.evChk['+i+'].feito=this.checked" style="width:auto"> '+esc(c.t)+' <a href="#" onclick="S.evChk.splice('+i+',1);document.getElementById(String.fromCharCode(101,118,45,99,104,107)).innerHTML=renderEvChk();return false" style="font-size:12px">✕</a></label>').join('')||'<span class="sub" style="font-size:13px">Sem itens.</span>';}
function addEvChk(){const v=$('evchk-novo').value.trim();if(!v)return;S.evChk.push({t:v,feito:false});$('evchk-novo').value='';$('ev-chk').innerHTML=renderEvChk();}
async function salvarEvChk(){try{await api('PATCH','/eventos/'+S.evId,{checklist:S.evChk});$('evchk-out').textContent='✅ salvo';}catch(e){$('evchk-out').textContent='⚠️ '+e.message;}}
async function vEvPos(){
  const P=S.me.permissoes;const pos=S.ev.pos_evento||{};const dis=P.gerir_eventos?'':' disabled';
  $('ev-corpo').innerHTML='<div class="card"><b>Pós-evento e encerramento</b>'+
   '<label>Avaliação do cliente / do evento</label><textarea id="pos-aval" rows="2"'+dis+'>'+esc(pos.avaliacao||'')+'</textarea>'+
   '<label>Lições aprendidas</label><textarea id="pos-licoes" rows="2"'+dis+'>'+esc(pos.licoes||'')+'</textarea>'+
   '<label>Depoimento</label><textarea id="pos-dep" rows="2"'+dis+'>'+esc(pos.depoimento||'')+'</textarea>'+
   '<label>Pendências</label><textarea id="pos-pend" rows="2"'+dis+'>'+esc(pos.pendencias||'')+'</textarea>'+
   (P.gerir_eventos?'<p><button class="btn peq" onclick="salvarPos()">Salvar</button> <button class="btn btn-ghost peq" onclick="marcarRealizado()">Marcar como realizado</button> <span id="pos-out"></span></p>':'')+'</div>';
}
async function salvarPos(){try{await api('PATCH','/eventos/'+S.evId,{pos_evento:{avaliacao:$('pos-aval').value,licoes:$('pos-licoes').value,depoimento:$('pos-dep').value,pendencias:$('pos-pend').value}});$('pos-out').textContent='✅ salvo';}catch(e){$('pos-out').textContent='⚠️ '+e.message;}}
async function marcarRealizado(){try{await api('PATCH','/eventos/'+S.evId,{status:'realizado'});abrirEvento(S.evId,'pos');}catch(e){alert(e.message);}}
// ---------------- Fornecedores (tenant) ----------------
async function vFornecedores(){
  const P=S.me.permissoes;
  const {fornecedores,categorias}=await api('GET','/fornecedores');
  $('corpo').innerHTML='<h2>🤝 Fornecedores</h2><p><a href="#" onclick="ir(String.fromCharCode(101,118,101,110,116,111,115));return false">← eventos</a></p>'+
   (P.gerir_fornecedores?'<div class="card"><b>Novo fornecedor</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><input id="nf-nome" placeholder="Nome" style="flex:1;min-width:160px"><select id="nf-cat">'+categorias.map(c=>'<option>'+c+'</option>').join('')+'</select><input id="nf-tel" placeholder="Telefone" style="max-width:130px"><button class="btn peq" onclick="novoFornecedor()">Cadastrar</button></div></div>':'')+
   '<div class="card" style="margin-top:12px"><table><tr><th>Nome</th><th>Categoria</th><th>Telefone</th><th>E-mail</th><th></th></tr>'+
   (fornecedores.length?fornecedores.map(f=>'<tr><td>'+(f.favorito?'⭐ ':'')+(f.bloqueado?'🚫 ':'')+esc(f.nome)+'</td><td>'+esc(f.categoria)+'</td><td>'+esc(f.telefone||'—')+'</td><td>'+esc(f.email||'—')+'</td>'+
    '<td>'+(P.gerir_fornecedores?'<button class="btn btn-ghost peq" onclick="toggleFav(\\''+f.id+'\\','+(f.favorito?'false':'true')+')">'+(f.favorito?'★':'☆')+'</button> <button class="btn btn-ghost peq" onclick="toggleBloq(\\''+f.id+'\\','+(f.bloqueado?'false':'true')+')">'+(f.bloqueado?'desbloq.':'bloq.')+'</button>':'')+'</td></tr>').join(''):'<tr><td colspan="5" style="color:var(--suave)">Nenhum fornecedor.</td></tr>')+'</table></div>';
}
async function novoFornecedor(){try{await api('POST','/fornecedores',{nome:$('nf-nome').value,categoria:$('nf-cat').value,telefone:$('nf-tel').value});vFornecedores();}catch(e){alert(e.message);}}
async function toggleFav(id,v){try{await api('PATCH','/fornecedores/'+id,{favorito:v===true||v==='true'});vFornecedores();}catch(e){alert(e.message);}}
async function toggleBloq(id,v){try{await api('PATCH','/fornecedores/'+id,{bloqueado:v===true||v==='true'});vFornecedores();}catch(e){alert(e.message);}}

// ---------------- CRM & Comercial (Fase 5) ----------------
const FN_ROT={novo:'Novo',contato:'Contato',briefing:'Briefing',reuniao:'Reunião',proposta_elaboracao:'Elaborando proposta',proposta_enviada:'Proposta enviada',negociacao:'Negociação',contrato_enviado:'Contrato enviado',fechado:'Fechado',perdido:'Perdido'};
async function vCrm(){
  S.crmAba=S.crmAba||'funil';
  const abas=[['funil','📊 Funil'],['propostas','📄 Propostas'],['contratos','📑 Contratos']];
  $('corpo').innerHTML='<h2>🤝 CRM & Comercial</h2>'+
   '<div class="card" style="display:flex;gap:6px;flex-wrap:wrap">'+abas.map(([k,r2])=>'<button class="btn '+(S.crmAba===k?'':'btn-ghost ')+'peq" onclick="crmIr(\\''+k+'\\')">'+r2+'</button>').join('')+'</div>'+
   '<div id="crm-corpo" style="margin-top:12px"><p class="sub">Carregando…</p></div>';
  await ({funil:vFunil,propostas:vPropostas,contratos:vContratos}[S.crmAba])();
}
function crmIr(k){S.crmAba=k;vCrm();}
async function vFunil(){
  const P=S.me.permissoes;const f=await api('GET','/crm/funil');
  const kpi=(rot,val)=>'<div class="kpi"><div class="n">'+val+'</div><div class="r">'+rot+'</div></div>';
  $('crm-corpo').innerHTML='<div class="kpis">'+kpi('Abertos',f.abertos)+kpi('Ganhos',f.ganhos)+kpi('Perdidos',f.perdidos)+kpi('Taxa de conversão',f.taxa_conversao+'%')+kpi('Valor ganho',brl(f.valor_ganho))+'</div>'+
   (P.gerir_crm?'<div class="card" style="display:flex;gap:8px;flex-wrap:wrap"><input id="nd-titulo" placeholder="Nova oportunidade…" style="flex:1;min-width:200px"><input id="nd-cli" placeholder="Cliente" style="max-width:160px"><input id="nd-valor" type="number" placeholder="Valor R$" style="max-width:120px"><button class="btn peq" onclick="novoDeal()">+ Criar</button></div>':'')+
   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:12px">'+
   f.ordem.filter(e=>e!=='perdido').map(e=>'<div><div style="font-weight:700;font-size:13px;margin-bottom:6px">'+(FN_ROT[e]||e)+' ('+f.colunas[e].deals.length+') · '+brl(f.colunas[e].valor)+'</div>'+
    f.colunas[e].deals.map(d=>'<div class="card" style="padding:10px;margin-bottom:8px"><a href="#" onclick="return abrirDeal(\\''+d.id+'\\')"><b>'+esc(d.titulo)+'</b></a><br><span class="sub" style="font-size:12px">'+esc(d.cliente_nome||d.empresa||'—')+' · '+brl(d.valor_estimado_centavos)+' · '+d.probabilidade+'%</span>'+
     (P.gerir_crm?'<div style="margin-top:6px"><select onchange="moverDeal(\\''+d.id+'\\',this.value)" style="font-size:12px;padding:4px">'+f.ordem.map(e2=>'<option value="'+e2+'"'+(e2===d.estagio?' selected':'')+'>'+(FN_ROT[e2]||e2)+'</option>').join('')+'</select></div>':'')+'</div>').join('')+'</div>').join('')+'</div>';
}
async function novoDeal(){try{const r=await api('POST','/crm/deals',{titulo:$('nd-titulo').value,cliente_nome:$('nd-cli').value,valor_estimado_centavos:Math.round(Number($('nd-valor').value)*100)||0});abrirDeal(r.deal.id);}catch(e){alert(e.message);}}
async function moverDeal(id,estagio){try{await api('PATCH','/crm/deals/'+id,{estagio});vFunil();}catch(e){alert(e.message);vFunil();}}
async function abrirDeal(id){
  const P=S.me.permissoes;const {deal:d,estagios}=await api('GET','/crm/deals/'+id);
  const dis=P.gerir_crm?'':' disabled';
  $('corpo').innerHTML='<p><a href="#" onclick="ir(String.fromCharCode(99,114,109));return false">← CRM</a></p><h2>'+esc(d.titulo)+' <span class="chip">'+(FN_ROT[d.estagio]||d.estagio)+'</span> <span class="chip">'+esc(d.status)+'</span></h2>'+
   '<div class="card"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">'+
   '<div><label>Cliente</label><input id="dd-cli" value="'+esc(d.cliente_nome)+'"'+dis+'></div>'+
   '<div><label>Empresa</label><input id="dd-emp" value="'+esc(d.empresa)+'"'+dis+'></div>'+
   '<div><label>Contato</label><input id="dd-contato" value="'+esc(d.contato)+'"'+dis+'></div>'+
   '<div><label>Origem</label><input id="dd-origem" value="'+esc(d.origem)+'"'+dis+'></div>'+
   '<div><label>Valor estimado (R$)</label><input id="dd-valor" type="number" value="'+Math.round((d.valor_estimado_centavos||0)/100)+'"'+dis+'></div>'+
   '<div><label>Probabilidade (%)</label><input id="dd-prob" type="number" min="0" max="100" value="'+d.probabilidade+'"'+dis+'></div>'+
   '<div><label>Estágio</label><select id="dd-est"'+dis+'>'+estagios.map(x=>'<option value="'+x+'"'+(x===d.estagio?' selected':'')+'>'+(FN_ROT[x]||x)+'</option>').join('')+'</select></div>'+
   '<div><label>Próximo contato</label><input id="dd-prox" type="date" value="'+esc(d.proximo_contato)+'"'+dis+'></div></div>'+
   (P.gerir_crm?'<p><button class="btn peq" onclick="salvarDeal(\\''+d.id+'\\')">Salvar</button> '+
    (d.status==='aberto'?'<button class="btn btn-ghost peq" onclick="converterDeal(\\''+d.id+'\\',String.fromCharCode(112,114,111,106,101,116,111))">→ Projeto</button> <button class="btn btn-ghost peq" onclick="converterDeal(\\''+d.id+'\\',String.fromCharCode(101,118,101,110,116,111))">→ Evento</button>':'')+
    ' <span id="dd-out"></span></p>':'')+'</div>'+
   '<div class="card" style="margin-top:12px"><b>Follow-up / anotações</b>'+
   (P.gerir_crm?'<div style="display:flex;gap:8px;margin-top:6px"><input id="dn-texto" placeholder="Registrar contato/observação…" style="flex:1"><button class="btn peq" onclick="addNota(\\''+d.id+'\\')">Registrar</button></div>':'')+
   (d.notas.length?'<div style="margin-top:8px">'+d.notas.map(n=>'<div style="font-size:13.5px;border-bottom:1px solid var(--borda);padding:4px 0">'+esc(n.texto)+' <span class="sub" style="font-size:11px">— '+esc(n.autor_nome)+', '+dt(n.criado_em)+'</span></div>').join('')+'</div>':'<p class="sub" style="font-size:13px">Sem anotações.</p>')+'</div>'+
   (d.propostas.length?'<div class="card" style="margin-top:12px"><b>Propostas</b><table><tr><th>Título</th><th>Status</th></tr>'+d.propostas.map(pr=>'<tr><td><a href="#" onclick="return abrirProposta(\\''+pr.id+'\\')">'+esc(pr.titulo)+'</a></td><td>'+esc(pr.status)+'</td></tr>').join('')+'</table></div>':'');
  return false;
}
async function salvarDeal(id){try{await api('PATCH','/crm/deals/'+id,{cliente_nome:$('dd-cli').value,empresa:$('dd-emp').value,contato:$('dd-contato').value,origem:$('dd-origem').value,valor_estimado_centavos:Math.round(Number($('dd-valor').value)*100)||0,probabilidade:Number($('dd-prob').value)||0,estagio:$('dd-est').value,proximo_contato:$('dd-prox').value});$('dd-out').textContent='✅ salvo';}catch(e){$('dd-out').textContent='⚠️ '+e.message;}}
async function addNota(id){try{if(!$('dn-texto').value.trim())return;await api('POST','/crm/deals/'+id+'/notas',{texto:$('dn-texto').value});abrirDeal(id);}catch(e){alert(e.message);}}
async function converterDeal(id,alvo){if(!confirm('Converter esta oportunidade em '+alvo+'? (marca como ganho)'))return;try{await api('POST','/crm/deals/'+id+'/converter',{alvo});alert('Convertido em '+alvo+'.');abrirDeal(id);}catch(e){alert(e.message);}}
// ---- propostas ----
async function vPropostas(){
  const P=S.me.permissoes;const {propostas}=await api('GET','/propostas');
  $('crm-corpo').innerHTML=(P.gerir_propostas?'<div class="card" style="display:flex;gap:8px;flex-wrap:wrap"><input id="np-titulo" placeholder="Nova proposta…" style="flex:1;min-width:200px"><input id="np-cli" placeholder="Cliente" style="max-width:160px"><button class="btn peq" onclick="novaProposta()">+ Criar</button></div>':'')+
   '<div class="card" style="margin-top:12px"><table><tr><th>Título</th><th>Cliente</th><th>Total</th><th>Status</th><th>Validade</th></tr>'+
   (propostas.length?propostas.map(p=>'<tr><td><a href="#" onclick="return abrirProposta(\\''+p.id+'\\')">'+esc(p.titulo)+'</a></td><td>'+esc(p.cliente_nome||'—')+'</td><td>'+brl(p.total_centavos)+'</td><td><span class="chip">'+esc(p.status)+'</span></td><td>'+(p.validade?p.validade.split('-').reverse().join('/'):'—')+'</td></tr>').join(''):'<tr><td colspan="5" style="color:var(--suave)">Nenhuma proposta.</td></tr>')+'</table></div>';
}
async function novaProposta(){try{const r=await api('POST','/propostas',{titulo:$('np-titulo').value,cliente_nome:$('np-cli').value});abrirProposta(r.proposta.id);}catch(e){alert(e.message);}}
async function abrirProposta(id){
  const P=S.me.permissoes;const {proposta:p,status}=await api('GET','/propostas/'+id);
  S.propItens=p.itens.slice();S.propId=id;
  const dis=P.gerir_propostas?'':' disabled';
  $('corpo').innerHTML='<p><a href="#" onclick="S.crmAba=String.fromCharCode(112,114,111,112,111,115,116,97,115);ir(String.fromCharCode(99,114,109));return false">← propostas</a></p><h2>'+esc(p.titulo)+'</h2>'+
   '<div class="card"><label>Título</label><input id="pp-titulo" value="'+esc(p.titulo)+'"'+dis+'>'+
   '<label>Cliente</label><input id="pp-cli" value="'+esc(p.cliente_nome)+'"'+dis+'>'+
   '<label>Status</label><select id="pp-status"'+dis+'>'+status.map(x=>'<option'+(x===p.status?' selected':'')+'>'+x+'</option>').join('')+'</select>'+
   '<label>Condições de pagamento</label><input id="pp-cond" value="'+esc(p.condicoes_pagamento)+'"'+dis+'>'+
   '<label>Validade</label><input id="pp-val" type="date" value="'+esc(p.validade)+'"'+dis+'>'+
   '<h3 style="font-size:16px;margin-top:12px">Itens</h3><div id="pp-itens">'+renderPropItens()+'</div>'+
   (P.gerir_propostas?'<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><input id="pi-desc" placeholder="Descrição" style="flex:1;min-width:160px"><input id="pi-qtd" type="number" placeholder="Qtd" style="max-width:80px"><input id="pi-preco" type="number" placeholder="Preço unit. R$" style="max-width:140px"><button class="btn btn-ghost peq" onclick="addPropItem()">+ item</button></div>':'')+
   '<label style="margin-top:10px">Desconto (R$)</label><input id="pp-desc-v" type="number" value="'+Math.round((p.desconto_centavos||0)/100)+'"'+dis+' onchange="calcTotal()">'+
   '<p style="font-size:16px;margin-top:8px">Total: <b id="pp-total">'+brl(p.total_centavos)+'</b></p>'+
   (P.gerir_propostas?'<p><button class="btn peq" onclick="salvarProposta()">Salvar proposta</button> <span id="pp-out"></span></p>':'')+'</div>';
  return false;
}
function renderPropItens(){return '<table><tr><th>Descrição</th><th>Qtd</th><th>Preço unit.</th><th>Subtotal</th><th></th></tr>'+(S.propItens||[]).map((it,i)=>'<tr><td>'+esc(it.descricao)+'</td><td>'+it.qtd+'</td><td>'+brl(it.preco_unit_centavos)+'</td><td>'+brl(it.qtd*it.preco_unit_centavos)+'</td><td><a href="#" onclick="S.propItens.splice('+i+',1);document.getElementById(String.fromCharCode(112,112,45,105,116,101,110,115)).innerHTML=renderPropItens();calcTotal();return false">✕</a></td></tr>').join('')+'</table>';}
function addPropItem(){const d=$('pi-desc').value.trim();if(!d)return;S.propItens.push({descricao:d,qtd:Number($('pi-qtd').value)||1,preco_unit_centavos:Math.round(Number($('pi-preco').value)*100)||0});$('pi-desc').value='';$('pi-qtd').value='';$('pi-preco').value='';$('pp-itens').innerHTML=renderPropItens();calcTotal();}
function calcTotal(){const bruto=(S.propItens||[]).reduce((a,it)=>a+it.qtd*it.preco_unit_centavos,0);const desc=Math.round(Number($('pp-desc-v').value)*100)||0;$('pp-total').textContent=brl(Math.max(0,bruto-desc));}
async function salvarProposta(){try{await api('PATCH','/propostas/'+S.propId,{titulo:$('pp-titulo').value,cliente_nome:$('pp-cli').value,status:$('pp-status').value,condicoes_pagamento:$('pp-cond').value,validade:$('pp-val').value,itens:S.propItens,desconto_centavos:Math.round(Number($('pp-desc-v').value)*100)||0});$('pp-out').textContent='✅ salvo';}catch(e){$('pp-out').textContent='⚠️ '+e.message;}}
// ---- contratos ----
async function vContratos(){
  const P=S.me.permissoes;const {contratos,tipos}=await api('GET','/contratos');
  $('crm-corpo').innerHTML='<div class="aviso">⚖️ Todo contrato gerado aqui é <b>MINUTA</b> — exige revisão de advogado antes do uso.</div>'+
   (P.gerir_contratos?'<div class="card" style="display:flex;gap:8px;flex-wrap:wrap"><input id="nc-titulo" placeholder="Novo contrato…" style="flex:1;min-width:200px"><select id="nc-tipo">'+tipos.map(x=>'<option>'+x+'</option>').join('')+'</select><button class="btn peq" onclick="novoContrato()">+ Criar</button></div>':'')+
   '<div class="card" style="margin-top:12px"><table><tr><th>Título</th><th>Tipo</th><th>Versão</th><th>Status</th></tr>'+
   (contratos.length?contratos.map(c=>'<tr><td><a href="#" onclick="return abrirContrato(\\''+c.id+'\\')">'+esc(c.titulo)+'</a></td><td>'+esc(c.tipo)+'</td><td>v'+c.versao+'</td><td><span class="chip">'+esc(c.status)+'</span></td></tr>').join(''):'<tr><td colspan="4" style="color:var(--suave)">Nenhum contrato.</td></tr>')+'</table></div>';
}
async function novoContrato(){try{const r=await api('POST','/contratos',{titulo:$('nc-titulo').value,tipo:$('nc-tipo').value});abrirContrato(r.contrato.id);}catch(e){alert(e.message);}}
async function abrirContrato(id){
  const P=S.me.permissoes;const {contrato:c,tipos,status}=await api('GET','/contratos/'+id);
  const dis=P.gerir_contratos?'':' disabled';
  $('corpo').innerHTML='<p><a href="#" onclick="S.crmAba=String.fromCharCode(99,111,110,116,114,97,116,111,115);ir(String.fromCharCode(99,114,109));return false">← contratos</a></p><h2>'+esc(c.titulo)+' <span class="chip">MINUTA</span></h2>'+
   '<div class="card"><label>Título</label><input id="ct-titulo" value="'+esc(c.titulo)+'"'+dis+'>'+
   '<div style="display:flex;gap:10px;flex-wrap:wrap"><div><label>Tipo</label><select id="ct-tipo"'+dis+'>'+tipos.map(x=>'<option'+(x===c.tipo?' selected':'')+'>'+x+'</option>').join('')+'</select></div>'+
   '<div><label>Status</label><select id="ct-status"'+dis+'>'+status.map(x=>'<option'+(x===c.status?' selected':'')+'>'+x+'</option>').join('')+'</select></div></div>'+
   '<label>Conteúdo da minuta</label><textarea id="ct-conteudo" rows="12"'+dis+'>'+esc(c.conteudo)+'</textarea>'+
   (P.gerir_contratos?'<p><button class="btn peq" onclick="salvarContrato(\\''+c.id+'\\')">Salvar (gera versão)</button> <span id="ct-out"></span></p>':'')+
   (c.versoes.length?'<p class="sub" style="font-size:12px">Versões: '+c.versoes.map(v=>'v'+v.numero+' ('+dt(v.criado_em)+')').join(' · ')+'</p>':'')+
   (c.aceite&&c.aceite.aceito_em?'<div class="aviso">✅ Aceite registrado por '+esc(c.aceite.nome||'—')+' em '+dt(c.aceite.aceito_em)+' (IP '+esc(c.aceite.ip||'')+').</div>':'')+'</div>';
  return false;
}
async function salvarContrato(id){try{await api('PATCH','/contratos/'+id,{titulo:$('ct-titulo').value,tipo:$('ct-tipo').value,status:$('ct-status').value,conteudo:$('ct-conteudo').value});$('ct-out').textContent='✅ salvo';}catch(e){$('ct-out').textContent='⚠️ '+e.message;}}
// ---------------- Financeiro (Fase 5) ----------------
async function vFinanceiro(){
  S.finF=S.finF||{tipo:'',status:''};
  const P=S.me.permissoes;
  const q='?'+(S.finF.tipo?'tipo='+S.finF.tipo+'&':'')+(S.finF.status?'status='+S.finF.status+'&':'');
  const {lancamentos,consolidado:co}=await api('GET','/financeiro'+q);
  const kpi=(rot,val,alerta)=>'<div class="kpi"><div class="n"'+(alerta&&val?' style="color:var(--alerta)"':'')+'>'+brl(val)+'</div><div class="r">'+rot+'</div></div>';
  $('corpo').innerHTML='<h2>💰 Financeiro</h2>'+
   '<div class="kpis">'+kpi('A receber',co.a_receber)+kpi('A pagar',co.a_pagar)+kpi('Inadimplência',co.inadimplencia,true)+kpi('Margem realizada',co.margem_realizada)+kpi('Margem prevista',co.margem_prevista)+'</div>'+
   (P.lancar_financeiro?'<div class="card"><b>Novo lançamento</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><select id="nf-tipo"><option value="receita">Receita</option><option value="despesa">Despesa</option></select><input id="nf-desc" placeholder="Descrição" style="flex:1;min-width:160px"><input id="nf-valor" type="number" placeholder="Valor R$" style="max-width:120px"><input id="nf-venc" type="date" style="width:auto"><button class="btn peq" onclick="novoLanc()">Lançar</button></div></div>':'')+
   '<div class="card" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select id="ff-tipo" onchange="filtrarFin()"><option value="">— tipo —</option><option value="receita"'+(S.finF.tipo==='receita'?' selected':'')+'>Receitas</option><option value="despesa"'+(S.finF.tipo==='despesa'?' selected':'')+'>Despesas</option></select>'+
   '<select id="ff-status" onchange="filtrarFin()"><option value="">— status —</option>'+['previsto','pendente','pago','cancelado'].map(x=>'<option'+(S.finF.status===x?' selected':'')+'>'+x+'</option>').join('')+'</select></div>'+
   '<div class="card" style="margin-top:12px"><table><tr><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr>'+
   (lancamentos.length?lancamentos.map(l=>'<tr'+(l.atrasado?' style="background:#fde8e8"':'')+'><td>'+esc(l.descricao)+'</td><td>'+(l.tipo==='receita'?'🟢 receita':'🔴 despesa')+'</td><td>'+brl(l.valor_centavos)+'</td><td>'+(l.vencimento?l.vencimento.split('-').reverse().join('/'):'—')+(l.atrasado?' ⚠️':'')+'</td>'+
    '<td>'+(P.lancar_financeiro?'<select onchange="statusLanc(\\''+l.id+'\\',this.value)">'+['previsto','pendente','pago','cancelado'].map(x=>'<option'+(x===l.status?' selected':'')+'>'+x+'</option>').join('')+'</select>':l.status)+'</td>'+
    '<td>'+(P.lancar_financeiro?'<button class="btn btn-ghost peq" onclick="delLanc(\\''+l.id+'\\')">✕</button>':'')+'</td></tr>').join(''):'<tr><td colspan="6" style="color:var(--suave)">Nenhum lançamento.</td></tr>')+'</table></div>';
}
function filtrarFin(){S.finF={tipo:$('ff-tipo').value,status:$('ff-status').value};vFinanceiro();}
async function novoLanc(){try{await api('POST','/financeiro',{tipo:$('nf-tipo').value,descricao:$('nf-desc').value,valor_centavos:Math.round(Number($('nf-valor').value)*100)||0,vencimento:$('nf-venc').value});vFinanceiro();}catch(e){alert(e.message);}}
async function statusLanc(id,status){try{await api('PATCH','/financeiro/'+id,{status});vFinanceiro();}catch(e){alert(e.message);vFinanceiro();}}
async function delLanc(id){if(!confirm('Excluir lançamento?'))return;try{await api('DELETE','/financeiro/'+id);vFinanceiro();}catch(e){alert(e.message);}}

// ---------------- IA & Automações (Fase 6) ----------------
async function vIa(){
  S.iaAba=S.iaAba||'assistente';
  const P=S.me.permissoes;
  const abas=[];
  if(P.usar_ia){abas.push(['assistente','💬 Assistente']);abas.push(['agentes','🧠 Agentes']);}
  if(P.gerir_automacoes)abas.push(['automacoes','⚙️ Automações']);
  if(P.ver_relatorios)abas.push(['ceo','📈 Relatório do CEO']);
  if(!abas.some(a=>a[0]===S.iaAba))S.iaAba=abas.length?abas[0][0]:'assistente';
  $('corpo').innerHTML='<h2>🤖 IA & Automações</h2>'+
   '<div class="card" style="display:flex;gap:6px;flex-wrap:wrap">'+abas.map(a=>'<button class="btn '+(S.iaAba===a[0]?'':'btn-ghost ')+'peq" onclick="iaIr(\\''+a[0]+'\\')">'+a[1]+'</button>').join('')+'</div>'+
   '<div id="ia-corpo" style="margin-top:12px"><p class="sub">Carregando…</p></div>';
  await ({assistente:vIaAssist,agentes:vIaAgentes,automacoes:vIaAutos,ceo:vIaCeo}[S.iaAba]||vIaAssist)();
}
function iaIr(k){S.iaAba=k;vIa();}
function avisoIA(ativo){return ativo?'':'<div class="aviso" style="margin-top:0">🔌 A IA está indisponível: o servidor está sem a chave ANTHROPIC_API_KEY. As telas funcionam, mas gerar respostas exige a chave.</div>';}

// -------- Assistente --------
async function vIaAssist(){
  const st=await api('GET','/ia/status');
  S.aiConv=S.aiConv||null;S.aiMsgs=S.aiMsgs||[];
  const escopo='<select id="ai-escopo" style="min-width:150px"><option value="geral">Visão geral</option><option value="projeto">Um projeto…</option><option value="evento">Um evento…</option></select>';
  $('ia-corpo').innerHTML=avisoIA(st.ativo)+
   '<div class="card"><b>Assistente de gestão</b><p class="sub">Responde com base nos SEUS dados (portfólio, tarefas, eventos, CRM, financeiro). Não inventa números.</p>'+
   '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">'+escopo+'<input id="ai-ref" placeholder="ID do projeto/evento (opcional)" style="flex:1;min-width:160px;display:none">'+
   '<button class="btn btn-ghost peq" onclick="aiLimpar()">Nova conversa</button></div>'+
   '<div style="display:flex;gap:8px"><input id="ai-q" placeholder="Ex.: quais projetos de alta prioridade estão sem tarefas?" style="flex:1" onkeydown="if(event.keyCode===13)aiPerg()"><button class="btn" onclick="aiPerg()">Perguntar</button></div></div>'+
   '<div id="ai-chat" style="margin-top:12px"></div>';
  document.getElementById('ai-escopo').onchange=function(){$('ai-ref').style.display=this.value==='geral'?'none':'';};
  aiRender();
}
function aiLimpar(){S.aiConv=null;S.aiMsgs=[];aiRender();}
function aiRender(){
  const c=$('ai-chat');if(!c)return;
  c.innerHTML=S.aiMsgs.map(m=>'<div class="card" style="margin-bottom:8px;'+(m.papel==='usuario'?'background:var(--fundo2)':'')+'"><b>'+(m.papel==='usuario'?'Você':'🤖 Assistente')+'</b>'+(m.nivel_confianca?' <span class="chip">confiança '+esc(m.nivel_confianca)+'</span>':'')+(m.nao_encontrado?' <span class="chip" style="color:var(--alerta)">fora dos dados</span>':'')+'<div style="white-space:pre-wrap;margin-top:6px">'+esc(m.conteudo)+'</div></div>').join('');
}
async function aiPerg(){
  const q=$('ai-q').value.trim();if(!q)return;
  const escopo=$('ai-escopo').value,ref=$('ai-ref').value.trim();
  S.aiMsgs.push({papel:'usuario',conteudo:q});$('ai-q').value='';aiRender();
  S.aiMsgs.push({papel:'assistente',conteudo:'Pensando…'});aiRender();
  try{
    const d=await api('POST','/ia/perguntar',{conversation_id:S.aiConv,escopo_tipo:escopo,escopo_ref:ref,pergunta:q});
    S.aiConv=d.conversation_id;S.aiMsgs.pop();S.aiMsgs.push(d.mensagem);aiRender();
  }catch(e){S.aiMsgs.pop();S.aiMsgs.push({papel:'assistente',conteudo:'⚠️ '+e.message});aiRender();}
}

// -------- Agentes especialistas --------
async function vIaAgentes(){
  const d=await api('GET','/ia/agentes');S.agEsc=S.agEsc||{};
  const cards=d.agentes.map(a=>'<div class="card" style="width:230px"><b>'+esc(a.nome)+'</b>'+(a.minuta?' <span class="chip">MINUTA</span>':'')+'<p class="sub" style="min-height:38px">'+esc(a.desc)+'</p><div class="chip">escopo: '+esc(a.escopo)+'</div><div style="margin-top:8px"><button class="btn peq" onclick="abrirAgente(\\''+a.chave+'\\')">Usar</button></div></div>').join('');
  $('ia-corpo').innerHTML=avisoIA(d.ativo)+
   '<div style="display:flex;gap:10px;flex-wrap:wrap">'+cards+'</div>'+
   '<div id="ag-form" style="margin-top:12px"></div>'+
   '<div class="card" style="margin-top:12px"><b>Entregas recentes</b>'+(d.execucoes.length?'<table><tr><th>Quando</th><th>Agente</th><th>Escopo</th><th></th></tr>'+d.execucoes.map(e=>'<tr><td>'+dt(e.criado_em)+'</td><td>'+esc(e.agente)+'</td><td>'+esc(e.escopo_tipo)+'</td><td><button class="btn btn-ghost peq" onclick="verEntrega(\\''+e.id+'\\')">ver</button></td></tr>').join('')+'</table>':'<p class="sub">Nenhuma entrega ainda.</p>')+'</div>'+
   '<div id="ag-saida"></div>';
  S.agExecs=d.execucoes;S.agList=d.agentes;
}
async function abrirAgente(chave){
  const a=(S.agList||[]).find(x=>x.chave===chave);if(!a)return;
  let seletor='';
  if(a.escopo==='projeto'||a.escopo==='evento'){
    const rota=a.escopo==='projeto'?'/projetos':'/eventos';
    let itens=[];try{const r=await api('GET',rota);itens=(r.projetos||r.eventos||[]);}catch(e){}
    seletor='<select id="ag-ref" style="min-width:220px"><option value="">— escolha o '+a.escopo+' —</option>'+itens.map(i=>'<option value="'+i.id+'">'+esc(i.nome)+'</option>').join('')+'</select>';
  }
  $('ag-form').innerHTML='<div class="card"><b>'+esc(a.nome)+'</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">'+seletor+
   '<input id="ag-extra" placeholder="Observações para o agente (opcional)" style="flex:1;min-width:200px"></div>'+
   '<button class="btn" onclick="agExec(\\''+chave+'\\')">Gerar rascunho</button> <span class="sub">A entrega é um rascunho para validação humana.</span></div>';
  $('ag-saida').innerHTML='';
}
async function agExec(chave){
  const ref=$('ag-ref')?$('ag-ref').value:'';const extra=$('ag-extra')?$('ag-extra').value:'';
  $('ag-saida').innerHTML='<div class="card"><p class="sub">Gerando…</p></div>';
  try{
    const d=await api('POST','/ia/agentes/executar',{agente:chave,escopo_ref:ref,instrucao_extra:extra});
    $('ag-saida').innerHTML='<div class="card"><b>'+esc(d.resultado.nome)+'</b> <span class="chip">'+esc(d.resultado.modelo||'')+'</span><div style="white-space:pre-wrap;margin-top:8px">'+esc(d.resultado.saida)+'</div></div>';
    vIaAgentes();
  }catch(e){$('ag-saida').innerHTML='<div class="erro">'+esc(e.message)+'</div>';}
}
function verEntrega(id){
  const e=(S.agExecs||[]).find(x=>x.id===id);if(!e)return;
  $('ag-saida').innerHTML='<div class="card"><b>'+esc(e.agente)+'</b> <span class="sub">'+dt(e.criado_em)+'</span><div style="white-space:pre-wrap;margin-top:8px">'+esc(e.saida)+'</div></div>';
  $('ag-saida').scrollIntoView({behavior:'smooth'});
}

// -------- Automações --------
async function vIaAutos(){
  const d=await api('GET','/automacoes');S.autoGat=d.gatilhos;S.autoAc=d.acoes;
  const gOpts=Object.entries(d.gatilhos).map(g=>'<option value="'+g[0]+'">'+esc(g[1].nome)+'</option>').join('');
  const aOpts=Object.entries(d.acoes).map(a=>'<option value="'+a[0]+'">'+esc(a[1].nome)+'</option>').join('');
  $('ia-corpo').innerHTML=
   '<div class="card"><b>Nova automação (gatilho → ação)</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'+
   '<input id="au-nome" placeholder="Nome" style="flex:1;min-width:160px">'+
   '<select id="au-gat">'+gOpts+'</select><input id="au-dias" type="number" min="1" value="7" title="dias" style="width:80px">'+
   '<select id="au-ac">'+aOpts+'</select><input id="au-cfg" placeholder="e-mail / ID do projeto (conforme a ação)" style="flex:1;min-width:180px">'+
   '<button class="btn" onclick="criarAuto()">Criar</button></div>'+
   '<p class="sub" style="margin-top:6px">Gatilhos usam o campo dias (evento próximo, deal parado, conta a vencer, projeto sem atividade). Ação por e-mail usa o campo de config; criar tarefa usa o ID do projeto.</p></div>'+
   '<div class="card" style="margin-top:12px"><div style="display:flex;justify-content:space-between;align-items:center"><b>Automações</b><button class="btn btn-ghost peq" onclick="avaliarTodas()">▶ Avaliar agora</button></div>'+
   (d.automacoes.length?'<table><tr><th>Nome</th><th>Gatilho</th><th>Ação</th><th>Ativa</th><th>Última execução</th><th></th></tr>'+
    d.automacoes.map(a=>'<tr><td>'+esc(a.nome)+'</td><td>'+esc((d.gatilhos[a.gatilho]||{}).nome||a.gatilho)+(a.gatilho_config&&a.gatilho_config.dias?' ('+a.gatilho_config.dias+'d)':'')+'</td><td>'+esc((d.acoes[a.acao]||{}).nome||a.acao)+'</td><td>'+(a.ativo?'✅':'⏸️')+'</td><td class="sub">'+(a.ultima_exec?dt(a.ultima_exec)+' — '+esc((a.ultima_msg||'').slice(0,60)):'—')+'</td>'+
     '<td style="white-space:nowrap"><button class="btn btn-ghost peq" onclick="testarAuto(\\''+a.id+'\\')">testar</button> <button class="btn btn-ghost peq" onclick="toggAuto(\\''+a.id+'\\','+(a.ativo?'false':'true')+')">'+(a.ativo?'pausar':'ativar')+'</button> <button class="btn btn-ghost peq" onclick="delAuto(\\''+a.id+'\\')">✕</button></td></tr>').join('')+'</table>':'<p class="sub">Nenhuma automação ainda.</p>')+'</div>'+
   '<div id="au-res"></div>';
}
async function criarAuto(){
  const gat=$('au-gat').value,ac=$('au-ac').value;
  const gcfg={dias:Number($('au-dias').value)||7};
  const raw=$('au-cfg').value.trim();const acfg={};
  if(ac==='alerta_email')acfg.email=raw;else if(ac==='criar_tarefa')acfg.project_id=raw;
  try{await api('POST','/automacoes',{nome:$('au-nome').value,gatilho:gat,gatilho_config:gcfg,acao:ac,acao_config:acfg});vIaAutos();}catch(e){alert(e.message);}
}
async function testarAuto(id){
  $('au-res').innerHTML='<div class="card"><p class="sub">Testando…</p></div>';
  try{const d=await api('POST','/automacoes/'+id+'/testar');const r=d.resultado;
    $('au-res').innerHTML='<div class="card"><b>Teste: '+esc(r.nome)+'</b><p>'+(r.disparou?'🔔 Dispararia — ':'😴 Nada a fazer — ')+esc(r.detalhe)+'</p>'+(r.exemplos&&r.exemplos.length?'<ul>'+r.exemplos.map(x=>'<li>'+esc(x.texto)+(x.extra?' — '+esc(x.extra):'')+'</li>').join('')+'</ul>':'')+'</div>';
  }catch(e){$('au-res').innerHTML='<div class="erro">'+esc(e.message)+'</div>';}
}
async function toggAuto(id,ativo){try{await api('PATCH','/automacoes/'+id,{ativo:ativo});vIaAutos();}catch(e){alert(e.message);}}
async function delAuto(id){if(!confirm('Excluir automação?'))return;try{await api('DELETE','/automacoes/'+id);vIaAutos();}catch(e){alert(e.message);}}
async function avaliarTodas(){
  $('au-res').innerHTML='<div class="card"><p class="sub">Avaliando todas as automações ativas…</p></div>';
  try{const d=await api('POST','/automacoes/avaliar');
    $('au-res').innerHTML='<div class="card"><b>Avaliação concluída</b><p>'+d.avaliadas+' avaliada(s), '+d.dispararam+' dispararam.</p>'+(d.resultados.length?'<ul>'+d.resultados.map(r=>'<li>'+(r.disparou?'🔔':'😴')+' '+esc(r.nome)+' — '+esc(r.detalhe)+'</li>').join('')+'</ul>':'')+'</div>';vIaAutos();
  }catch(e){$('au-res').innerHTML='<div class="erro">'+esc(e.message)+'</div>';}
}

// -------- Relatório do CEO --------
async function vIaCeo(){
  const d=await api('GET','/ceo/relatorios');const c=d.atual;
  const kpi=(n,r)=>'<div class="kpi"><div class="n">'+n+'</div><div class="r">'+r+'</div></div>';
  $('ia-corpo').innerHTML=
   '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>Relatório executivo de hoje</b><button class="btn" onclick="gerarCeo()">'+(d.ia_ativa?'Gerar com IA':'Gerar (sem narrativa)')+'</button></div>'+
   '<div class="kpis" style="margin-top:10px">'+
   kpi(c.projetos_total,'projetos')+kpi(c.tarefas_atrasadas,'tarefas atrasadas')+kpi(c.eventos_proximos_30d,'eventos em 30d')+
   kpi(c.crm_abertos,'oportunidades')+kpi(brl(c.a_receber),'a receber')+kpi(brl(c.inadimplencia),'inadimplência')+kpi(brl(c.margem_prevista),'margem prevista')+'</div></div>'+
   '<div id="ceo-res" style="margin-top:12px"></div>'+
   '<div class="card" style="margin-top:12px"><b>Relatórios anteriores</b>'+(d.relatorios.length?'<table><tr><th>Data</th><th>Resumo</th></tr>'+d.relatorios.map(r=>'<tr><td>'+esc(r.data)+'</td><td style="font-size:13px">'+esc((r.narrativa||'(sem narrativa)').slice(0,140))+'</td></tr>').join('')+'</table>':'<p class="sub">Nenhum relatório gerado ainda.</p>')+'</div>';
}
async function gerarCeo(){
  $('ceo-res').innerHTML='<div class="card"><p class="sub">Consolidando e gerando narrativa…</p></div>';
  try{const d=await api('POST','/ceo/relatorios/gerar',{});const r=d.relatorio;
    $('ceo-res').innerHTML='<div class="card"><b>Relatório de '+esc(r.data)+'</b><div style="white-space:pre-wrap;margin-top:8px">'+esc(r.narrativa||'(IA indisponível — números consolidados acima.)')+'</div></div>';vIaCeo();
  }catch(e){$('ceo-res').innerHTML='<div class="erro">'+esc(e.message)+'</div>';}
}

// ---------------- Portal do cliente (Fase 7) ----------------
async function vPortalCli(){
  const d=await api('GET','/compartilhamentos');S.shTipos=d.tipos;
  const P=S.me.permissoes;
  const permTipo={evento:'gerir_eventos',projeto:'editar_projeto',proposta:'gerir_propostas',contrato:'gerir_contratos'};
  const tiposOk=d.tipos.filter(t=>P[permTipo[t]]);
  const tOpts=tiposOk.map(t=>'<option value="'+t+'">'+t+'</option>').join('');
  const base=location.origin+'/vpe/portal/';
  $('corpo').innerHTML='<h2>🔗 Portal do cliente</h2>'+
   (d.recurso_liberado?'':'<div class="aviso">⚠️ O portal do cliente não está incluído no seu plano atual. Você pode ver os compartilhamentos existentes, mas criar novos exige upgrade.</div>')+
   '<div class="card"><b>Compartilhar um item com um cliente</b><p class="sub">Gera um link público e só-leitura. Propostas e contratos podem receber aceite do cliente.</p>'+
   '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><select id="sh-tipo" onchange="shCarregarItens()" style="min-width:130px">'+tOpts+'</select>'+
   '<select id="sh-ref" style="flex:1;min-width:200px"><option value="">— carregando… —</option></select>'+
   '<input id="sh-cli" placeholder="Nome do cliente" style="flex:1;min-width:150px"><input id="sh-email" placeholder="E-mail (opcional)" style="flex:1;min-width:150px">'+
   '<label style="display:flex;align-items:center;gap:6px;margin:0;font-size:13px"><input type="checkbox" id="sh-aceite" style="width:auto"> permitir aceite</label>'+
   '<button class="btn" onclick="criarShare()">Gerar link</button></div></div>'+
   '<div id="sh-novo"></div>'+
   '<div class="card" style="margin-top:12px"><b>Compartilhamentos</b>'+
   (d.compartilhamentos.length?'<table><tr><th>Item</th><th>Tipo</th><th>Cliente</th><th>Aceite</th><th>Acessos</th><th>Ativo</th><th>Link</th><th></th></tr>'+
    d.compartilhamentos.map(sh=>'<tr><td>'+esc(sh.titulo)+'</td><td>'+esc(sh.tipo)+'</td><td>'+esc(sh.cliente_nome||'—')+'</td><td>'+(sh.pode_aceitar?'✅':'—')+'</td><td>'+sh.acessos+'</td><td>'+(sh.ativo?'✅':'⏸️')+'</td>'+
     '<td><a href="#" onclick="return copiarLink(\\''+sh.token+'\\')">copiar</a></td>'+
     '<td style="white-space:nowrap"><button class="btn btn-ghost peq" onclick="toggShare(\\''+sh.id+'\\','+(sh.ativo?'false':'true')+')">'+(sh.ativo?'pausar':'ativar')+'</button> <button class="btn btn-ghost peq" onclick="delShare(\\''+sh.id+'\\')">✕</button></td></tr>').join('')+'</table>':'<p class="sub">Nenhum compartilhamento ainda.</p>')+'</div>';
  S.shBase=base;
  if(tiposOk.length)shCarregarItens();
}
async function shCarregarItens(){
  const tipo=$('sh-tipo').value;const sel=$('sh-ref');if(!sel)return;
  const rota={evento:'/eventos',projeto:'/projetos',proposta:'/propostas',contrato:'/contratos'}[tipo];
  sel.innerHTML='<option value="">— carregando… —</option>';
  try{const r=await api('GET',rota);const itens=r.eventos||r.projetos||r.propostas||r.contratos||[];
    sel.innerHTML='<option value="">— escolha o '+tipo+' —</option>'+itens.map(i=>'<option value="'+i.id+'">'+esc(i.nome||i.titulo||i.id)+'</option>').join('');
  }catch(e){sel.innerHTML='<option value="">(sem itens ou sem permissão)</option>';}
  const aceite=$('sh-aceite');if(aceite)aceite.disabled=!(tipo==='proposta'||tipo==='contrato');
}
async function criarShare(){
  const tipo=$('sh-tipo').value,ref=$('sh-ref').value;
  if(!ref){alert('Escolha o item a compartilhar.');return;}
  try{
    const d=await api('POST','/compartilhamentos',{tipo:tipo,ref_id:ref,cliente_nome:$('sh-cli').value,cliente_email:$('sh-email').value,pode_aceitar:$('sh-aceite').checked});
    const link=S.shBase+d.compartilhamento.token;
    $('sh-novo').innerHTML='<div class="card" style="border-color:var(--acc)"><b>✅ Link gerado</b><div style="display:flex;gap:8px;margin-top:8px"><input id="sh-link" value="'+esc(link)+'" readonly><button class="btn peq" onclick="copiarLink(\\''+d.compartilhamento.token+'\\')">Copiar</button></div></div>';
    vPortalCli();
  }catch(e){alert(e.message);}
}
function copiarLink(token){
  const link=S.shBase+token;
  if(navigator.clipboard)navigator.clipboard.writeText(link).then(function(){},function(){});
  prompt('Link do portal do cliente:',link);
  return false;
}
async function toggShare(id,ativo){try{await api('PATCH','/compartilhamentos/'+id,{ativo:ativo});vPortalCli();}catch(e){alert(e.message);}}
async function delShare(id){if(!confirm('Revogar este compartilhamento? O link deixará de funcionar.'))return;try{await api('DELETE','/compartilhamentos/'+id);vPortalCli();}catch(e){alert(e.message);}}

// ---------------- Integrações & API (Fase 8) ----------------
async function vIntegra(){
  const d=await api('GET','/integracoes');S.igEventos=d.eventos;
  const origin=location.origin;
  const evChecks=d.eventos.map(e=>'<label style="display:inline-flex;align-items:center;gap:5px;margin:0 10px 6px 0;font-size:13px;font-weight:400"><input type="checkbox" class="wh-ev" value="'+e+'" style="width:auto"> '+e+'</label>').join('');
  $('corpo').innerHTML='<h2>🔌 Integrações & API</h2>'+
   (d.api_liberada?'':'<div class="aviso">⚠️ Chaves de API e webhooks exigem plano Business ou Enterprise. Faça upgrade em Plano e uso.</div>')+
   '<div class="card"><b>Chaves de API</b><p class="sub">Para integrar seu ERP/sistema à API REST do Villela Projects (base: '+origin+'/vpe/api/v1). A chave aparece só uma vez.</p>'+
   '<div style="display:flex;gap:8px;margin-top:8px"><input id="ak-nome" placeholder="Nome da chave (ex.: ERP financeiro)" style="flex:1"><button class="btn" onclick="criarChaveApi()">Gerar chave</button></div>'+
   '<div id="ak-nova"></div>'+
   (d.chaves.length?'<table style="margin-top:10px"><tr><th>Nome</th><th>Prefixo</th><th>Último uso</th><th>Status</th><th></th></tr>'+
    d.chaves.map(k=>'<tr><td>'+esc(k.nome)+'</td><td><code>'+esc(k.prefixo)+'…</code></td><td class="sub">'+(k.ultimo_uso?dt(k.ultimo_uso):'—')+'</td><td>'+(k.revogada_em?'<span class="chip">revogada</span>':'✅ ativa')+'</td><td>'+(k.revogada_em?'':'<button class="btn btn-ghost peq" onclick="revogarChaveApi(\\''+k.id+'\\')">revogar</button>')+'</td></tr>').join('')+'</table>':'<p class="sub" style="margin-top:8px">Nenhuma chave.</p>')+'</div>'+
   '<div class="card" style="margin-top:12px"><b>Webhooks de saída</b><p class="sub">Receba eventos no Make/n8n/Zapier. Cada entrega é assinada (HMAC-SHA256 no header X-VPE-Signature).</p>'+
   '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input id="wh-url" placeholder="https://hook.seu-sistema.com/..." style="flex:1;min-width:240px"></div>'+
   '<div style="margin-top:8px">'+evChecks+'</div>'+
   '<button class="btn" onclick="criarWebhook()">Criar webhook</button><div id="wh-novo"></div>'+
   (d.webhooks.length?'<table style="margin-top:10px"><tr><th>URL</th><th>Eventos</th><th>Ativo</th><th></th></tr>'+
    d.webhooks.map(w=>'<tr><td style="word-break:break-all;font-size:13px">'+esc(w.url)+'</td><td class="sub">'+esc((w.eventos||[]).join(', '))+'</td><td>'+(w.ativo?'✅':'⏸️')+'</td><td><button class="btn btn-ghost peq" onclick="delWebhook(\\''+w.id+'\\')">✕</button></td></tr>').join('')+'</table>':'<p class="sub" style="margin-top:8px">Nenhum webhook.</p>')+
   (d.entregas&&d.entregas.length?'<div style="margin-top:12px"><b>Entregas recentes</b><table><tr><th>Quando</th><th>Evento</th><th>Status</th><th>Tent.</th><th>Resposta</th></tr>'+d.entregas.map(e=>'<tr><td>'+dt(e.criado_em)+'</td><td>'+esc(e.evento)+'</td><td>'+esc(e.status)+'</td><td>'+e.tentativas+'</td><td class="sub">'+esc(e.resposta||'—')+'</td></tr>').join('')+'</table></div>':'')+'</div>';
}
async function criarChaveApi(){
  const nome=$('ak-nome').value.trim();if(!nome){alert('Dê um nome à chave.');return;}
  try{const d=await api('POST','/integracoes/chaves',{nome:nome});
    $('ak-nova').innerHTML='<div class="aviso" style="margin-top:10px">🔑 Copie agora — não será mostrada de novo:<br><code style="word-break:break-all">'+esc(d.chave)+'</code></div>';
    vIntegraPreserva();
  }catch(e){alert(e.message);}
}
function vIntegraPreserva(){var nova=$('ak-nova')?$('ak-nova').innerHTML:'';vIntegra().then(function(){if(nova&&$('ak-nova'))$('ak-nova').innerHTML=nova;});}
async function revogarChaveApi(id){if(!confirm('Revogar esta chave? Integrações que a usam vão parar.'))return;try{await api('DELETE','/integracoes/chaves/'+id);vIntegra();}catch(e){alert(e.message);}}
async function criarWebhook(){
  const url=$('wh-url').value.trim();
  const eventos=[].slice.call(document.querySelectorAll('.wh-ev:checked')).map(function(c){return c.value;});
  if(!url){alert('Informe a URL.');return;}if(!eventos.length){alert('Escolha ao menos um evento.');return;}
  try{const d=await api('POST','/integracoes/webhooks',{url:url,eventos:eventos});
    $('wh-novo').innerHTML='<div class="aviso" style="margin-top:10px">🔐 Secret do webhook (guarde — valida a assinatura):<br><code style="word-break:break-all">'+esc(d.secret)+'</code></div>';
  }catch(e){alert(e.message);}
}
async function delWebhook(id){if(!confirm('Excluir este webhook?'))return;try{await api('DELETE','/integracoes/webhooks/'+id);vIntegra();}catch(e){alert(e.message);}}

// ---------------- Usuários ----------------
async function vUsuarios(){
  const d=await api('GET','/usuarios');const papeis=S.me.papeis_embutidos;
  const opts=sel=>Object.entries(papeis).filter(([k])=>k!=='dono').map(([k,n])=>'<option value="'+k+'"'+(k===sel?' selected':'')+'>'+esc(n)+'</option>').join('');
  $('corpo').innerHTML='<h2>Usuários e permissões</h2>'+
   '<div class="card"><b>Convidar por e-mail</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'+
   '<input id="cv-email" placeholder="email@empresa.com" style="flex:2;min-width:200px"><select id="cv-papel" style="flex:1;min-width:170px">'+opts('colaborador')+'</select>'+
   '<button class="btn peq" onclick="convidar()">Convidar</button></div><div id="cv-out" style="margin-top:8px;font-size:13px"></div></div>'+
   '<div class="card" style="margin-top:14px"><b>Equipe</b><table><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th></th></tr>'+
   d.usuarios.map(u=>'<tr><td>'+esc(u.nome)+'</td><td>'+esc(u.email)+'</td><td>'+(u.papel==='dono'?'<span class="chip">Dono</span>':'<select onchange="mudar(\\''+u.vinculo_id+'\\',{papel:this.value})">'+opts(u.papel)+'</select>')+'</td>'+
    '<td>'+esc(u.status)+'</td><td>'+(u.papel==='dono'?'':(u.status==='ativo'?'<button class="btn btn-ghost peq" onclick="mudar(\\''+u.vinculo_id+'\\',{status:\\'suspenso\\'})">Suspender</button>':'<button class="btn peq" onclick="mudar(\\''+u.vinculo_id+'\\',{status:\\'ativo\\'})">Reativar</button>'))+'</td></tr>').join('')+'</table></div>'+
   (d.convites.length?'<div class="card" style="margin-top:14px"><b>Convites pendentes</b><table><tr><th>E-mail</th><th>Papel</th><th>Expira</th><th></th></tr>'+
    d.convites.map(c=>'<tr><td>'+esc(c.email)+'</td><td>'+esc(c.papel)+'</td><td>'+dt(c.expira_em)+'</td><td><button class="btn btn-ghost peq" onclick="revogar(\\''+c.id+'\\')">Revogar</button></td></tr>').join('')+'</table></div>':'');
}
async function convidar(){try{
  const d=await api('POST','/convites',{email:$('cv-email').value,papel:$('cv-papel').value});
  $('cv-out').innerHTML='✅ Convite criado'+(d.email_enviado?' e enviado por e-mail':'')+'. Link (7 dias):<br><code style="word-break:break-all">'+esc(d.link)+'</code>';
 }catch(e){$('cv-out').innerHTML='<span style="color:var(--alerta)">'+esc(e.message)+'</span>';}}
async function mudar(id,campos){try{await api('PATCH','/usuarios/'+id,campos);vUsuarios();}catch(e){alert(e.message);}}
async function revogar(id){try{await api('DELETE','/convites/'+id);vUsuarios();}catch(e){alert(e.message);}}
async function vAudit(){
  const d=await api('GET','/auditoria?limite=200');
  $('corpo').innerHTML='<h2>Trilha de auditoria</h2><div class="card"><table><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th><th>IP</th></tr>'+
   d.eventos.map(a=>'<tr><td>'+dt(a.criado_em)+'</td><td>'+esc(a.usuario_nome)+'</td><td>'+esc(a.acao)+'</td><td>'+esc(a.entidade)+(a.entidade_id?' <span class="chip">'+esc(a.entidade_id)+'</span>':'')+'</td><td>'+esc(a.ip)+'</td></tr>').join('')+'</table></div>';
}
async function vPlano(){
  const d=await api('GET','/uso');const L=(d.plano&&d.plano.limites)||{};
  const linha=(rotu,met,lim)=>'<tr><td>'+rotu+'</td><td>'+Number(d.uso[met]||0)+'</td><td>'+(lim?lim:'ilimitado')+'</td></tr>';
  let billingHtml='';
  const P=S.me.permissoes;
  if(P.administrar_cobranca||P.ver_uso){
    try{
      const b=await api('GET','/billing');
      if(b.interno){billingHtml='<div class="aviso">🏠 Workspace interno — sem cobrança.</div>';}
      else{
        const planos=(b.planos||[]).map(p=>'<div class="card" style="width:200px"><b>'+esc(p.nome)+'</b><div style="font-size:20px;font-weight:800;color:var(--verde2)">R$ '+(p.preco_centavos/100).toLocaleString('pt-BR')+'<span style="font-size:12px;font-weight:400">/mês</span></div>'+(P.administrar_cobranca&&b.online_disponivel?'<button class="btn peq" style="margin-top:8px" onclick="assinarPlano(\\''+p.slug+'\\')">Assinar</button>':'')+'</div>').join('');
        const recorrente=b.plano&&b.plano.recorrencia_mp;
        billingHtml='<div class="card" style="margin-top:12px"><b>Assinatura</b>'+
         (b.online_disponivel?'':'<div class="aviso">Pagamento online indisponível no momento — fale com a Villela.</div>')+
         '<p class="sub">Plano atual: <b>'+esc(b.plano?b.plano.nome:'—')+'</b> · status '+esc(b.plano?b.plano.status:'—')+(recorrente?' · recorrência Mercado Pago ativa':'')+'</p>'+
         (P.administrar_cobranca?'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">'+planos+'</div>'+(recorrente?'<button class="btn btn-ghost peq" style="margin-top:10px" onclick="cancelarAssin()">Cancelar assinatura</button>':''):'')+
         (b.pagamentos&&b.pagamentos.length?'<table style="margin-top:12px"><tr><th>Data</th><th>Valor</th><th>Status</th></tr>'+b.pagamentos.map(pg=>'<tr><td>'+dt(pg.criado_em)+'</td><td>'+brl(pg.valor_centavos)+'</td><td>'+esc(pg.status)+'</td></tr>').join('')+'</table>':'')+'</div>';
      }
    }catch(e){billingHtml='<div class="erro">'+esc(e.message)+'</div>';}
  }
  $('corpo').innerHTML='<h2>Plano e uso</h2>'+
   '<div class="card"><b>Plano atual:</b> '+esc(d.plano?d.plano.nome:'—')+' <span class="chip">'+esc(d.plano?d.plano.subscription.status:'')+'</span>'+
   '<table style="margin-top:10px"><tr><th>Métrica</th><th>Uso</th><th>Limite</th></tr>'+
   linha('Usuários ativos','usuarios',L.usuarios)+linha('Projetos','projetos',L.projetos)+
   linha('Eventos no mês','eventos',L.eventos_mes)+linha('Consultas de IA','ia_consultas',L.ia_consultas_mes)+
   linha('Chamadas de API','api_chamadas',0)+'</table></div>'+billingHtml;
}
async function assinarPlano(slug){
  if(!confirm('Assinar o plano '+slug+'? Você será levado ao Mercado Pago para autorizar a cobrança mensal.'))return;
  try{const d=await api('POST','/billing/assinar',{plano_slug:slug});if(d.link)location.href=d.link;else alert('Assinatura iniciada.');}
  catch(e){alert(e.message);}
}
async function cancelarAssin(){if(!confirm('Cancelar a assinatura? Sua conta pode ser suspensa ao fim do período pago.'))return;try{await api('POST','/billing/cancelar');vPlano();}catch(e){alert(e.message);}}
async function vConfig(){
  const d=await api('GET','/config');const t=d.tenant;
  $('corpo').innerHTML='<h2>Configurações da empresa</h2><div class="card">'+
   '<label>Nome da empresa</label><input id="cf-nome" value="'+esc(t.nome)+'">'+
   '<label>CNPJ</label><input id="cf-cnpj" value="'+esc(t.cnpj)+'">'+
   '<label>E-mail de contato</label><input id="cf-email" value="'+esc(t.email_contato)+'">'+
   '<label>Telefone</label><input id="cf-tel" value="'+esc(t.telefone)+'">'+
   '<p><button class="btn" onclick="salvarCfg()">Salvar</button> <span id="cf-out"></span></p></div>'+
   '<div class="card" style="margin-top:14px"><b>Slug:</b> <code>'+esc(t.slug)+'</code> · criado em '+dt(t.criado_em)+'</div>';
}
async function salvarCfg(){try{
  await api('PATCH','/config',{tenant:{nome:$('cf-nome').value,cnpj:$('cf-cnpj').value,email_contato:$('cf-email').value,telefone:$('cf-tel').value}});
  $('cf-out').textContent='✅ salvo';}catch(e){$('cf-out').textContent='⚠️ '+e.message;}}
boot().catch(e=>$('corpo').innerHTML='<div class="erro">'+esc(e.message)+'</div>');
</script></body></html>`;
}

// ---- Portal do cliente (público, server-rendered a partir da visão curada) ----
function portalMoeda(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function portalShell(corpoHtml) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Portal do cliente — Villela Projects</title>
${HEAD_MARCA}
<style>${CSS}.pcard{max-width:760px;margin:26px auto}pre.doc{white-space:pre-wrap;background:var(--fundo);border:1px solid var(--borda);border-radius:10px;padding:16px;font-family:inherit;font-size:14px;max-height:60vh;overflow:auto}</style></head><body>
<header class="top"><div class="wrap"><span class="brand">${BRAND_LOCKUP}</span></div></header>
<div class="wrap pcard">${corpoHtml}</div>
<footer><div class="wrap">Portal do cliente · documento apresentado por meio do Villela Projects, uma empresa do Grupo Villela Stay.</div></footer></body></html>`;
}
function portalCliente(view, token) {
  const d = view.dados || {};
  const chip = (t) => `<span class="chip">${esc(t)}</span>`;
  let corpo = '';
  if (view.tipo === 'evento') {
    corpo = `<div class="card"><div class="badge">Evento</div><h2>${esc(d.nome)}</h2>
      <p>${chip('Tipo: ' + (d.tipo || '—'))} ${chip('Status: ' + (d.status || '—'))} ${d.data ? chip('Data: ' + d.data) : ''} ${d.local ? chip(d.local) : ''} ${d.convidados_previstos ? chip(d.convidados_previstos + ' convidados') : ''}</p>
      <p class="sub">Acompanhe aqui as informações do seu evento com a ${esc(view.empresa)}.</p></div>`;
  } else if (view.tipo === 'projeto') {
    corpo = `<div class="card"><div class="badge">Projeto</div><h2>${esc(d.nome)}</h2>
      <p>${chip(d.categoria || '—')} ${chip('Estágio: ' + (d.estagio || '—'))}</p>
      ${d.descricao ? `<p>${esc(d.descricao)}</p>` : ''}
      ${d.proximos_passos ? `<p><b>Próximos passos:</b> ${esc(d.proximos_passos)}</p>` : ''}</div>`;
  } else if (view.tipo === 'proposta') {
    const linhas = (d.itens || []).map(i => `<tr><td>${esc(i.descricao)}</td><td>${i.qtd}</td><td>${portalMoeda(i.preco_unit_centavos)}</td><td>${portalMoeda(i.qtd * i.preco_unit_centavos)}</td></tr>`).join('');
    corpo = `<div class="card"><div class="badge">Proposta comercial</div><h2>${esc(d.titulo)}</h2>
      <table><tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr>${linhas || '<tr><td colspan="4" class="sub">Sem itens.</td></tr>'}</table>
      ${d.desconto_centavos ? `<p style="text-align:right">Desconto: −${portalMoeda(d.desconto_centavos)}</p>` : ''}
      <h3 style="text-align:right">Total: ${portalMoeda(d.total_centavos)}</h3>
      ${d.condicoes_pagamento ? `<p><b>Condições:</b> ${esc(d.condicoes_pagamento)}</p>` : ''}
      ${d.validade ? `<p class="sub">Válida até ${esc(d.validade)}.</p>` : ''}</div>`;
  } else if (view.tipo === 'contrato') {
    corpo = `<div class="card"><div class="badge">Contrato — MINUTA</div><h2>${esc(d.titulo)}</h2>
      <div class="aviso">Este é um documento em <b>MINUTA</b>, sujeito a validação jurídica. O aceite eletrônico registra sua concordância com o teor apresentado.</div>
      <pre class="doc">${esc(d.conteudo || '(conteúdo ainda não disponível)')}</pre></div>`;
  } else {
    corpo = `<div class="card"><h2>${esc(view.titulo || 'Documento')}</h2></div>`;
  }
  // bloco de aceite
  if (view.pode_aceitar) {
    if (view.aceito) {
      corpo += `<div class="card"><div class="badge" style="background:#bbf7d0">✔ ${view.tipo === 'contrato' ? 'Aceito' : 'Aprovada'}</div><p>Este ${view.tipo} já foi ${view.tipo === 'contrato' ? 'aceito' : 'aprovado'}. Obrigado!</p></div>`;
    } else {
      corpo += `<div class="card" id="aceite"><b>${view.tipo === 'contrato' ? 'Aceitar contrato' : 'Aprovar proposta'}</b>
        <p class="sub">Digite seu nome completo para registrar seu ${view.tipo === 'contrato' ? 'aceite' : 'aval'}.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="ac-nome" placeholder="Seu nome completo" style="flex:1;min-width:200px">
        <button class="btn" id="ac-btn">${view.tipo === 'contrato' ? 'Aceitar' : 'Aprovar'}</button></div>
        <div id="ac-msg"></div></div>
      <script>
      (function(){var b=document.getElementById('ac-btn');b.onclick=function(){
        var nome=document.getElementById('ac-nome').value.trim();var m=document.getElementById('ac-msg');
        if(!nome){m.innerHTML='<div class="erro">Informe seu nome.</div>';return;}
        b.disabled=true;m.innerHTML='<p class="sub">Registrando…</p>';
        fetch('/vpe/api/portal/${esc(token)}/aceite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:nome})})
        .then(function(r){return r.json();}).then(function(d){
          if(d.ok){document.getElementById('aceite').innerHTML='<div class="badge" style="background:#bbf7d0">✔ Registrado</div><p>Obrigado, '+nome.replace(/</g,'')+'! Seu aceite foi registrado.</p>';}
          else{b.disabled=false;m.innerHTML='<div class="erro">'+(d.erro||'Erro ao registrar.')+'</div>';}
        }).catch(function(){b.disabled=false;m.innerHTML='<div class="erro">Falha de conexão.</div>';});
      };})();
      </script>`;
    }
  }
  return portalShell(corpo);
}
function portalErro(msg) {
  return portalShell(`<div class="card"><h2>Link indisponível</h2><p>${esc(msg)}</p><p class="sub">Fale com a empresa que compartilhou este link.</p></div>`);
}

function registrarPaginas(app) {
  const html = (res, corpo) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex'); res.send(corpo); };
  app.get('/vpe', (req, res) => html(res, landing()));
  app.get('/vpe/cadastro', (req, res) => html(res, cadastro()));
  app.get('/vpe/login', (req, res) => html(res, login()));
  app.get('/vpe/convite/:token', (req, res) => html(res, convite(req.params.token)));
  app.get('/vpe/app', (req, res) => { res.setHeader('Cache-Control', 'no-store'); html(res, appTenant()); });
  app.get('/vpe/portal/:token', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { html(res, portalCliente(require('./portal').visaoPublica(req.params.token), req.params.token)); }
    catch (e) { res.status(404); html(res, portalErro(e.message)); }
  });
}

module.exports = { registrarPaginas };
