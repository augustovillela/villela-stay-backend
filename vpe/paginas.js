// =====================================================================
// Villela Projects & Events — páginas públicas + painel (/vpe/app).
// Identidade própria (verde-petróleo executivo), separada dos irmãos.
// SPA leve em fetch, sem framework — padrão provado no Villela Docs.
// =====================================================================
'use strict';
const repo = require('./repo');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (c) => Number(c || 0) === 0 ? 'Sob consulta' : 'R$ ' + (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + '/mês';

const CSS = `
:root{--ink:#12241f;--verde:#14532d;--verde2:#0c3b20;--acc:#16a34a;--ambar:#d97706;--fundo:#f4f7f5;--borda:#dde5df;--suave:#5b6b62;--alerta:#d93025}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.6}
h1,h2,h3{line-height:1.2;margin:.2em 0 .5em;color:var(--verde2)}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}.wrap-sm{max-width:560px;margin:0 auto;padding:0 20px}
header.top{background:var(--verde2);color:#fff;position:sticky;top:0;z-index:20}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
header.top a{color:#e6f2ea}.brand{font-weight:800;font-size:19px;color:#fff!important}.brand b{color:#86efac}
.nav a{margin-left:18px;font-size:15px}
.btn{display:inline-block;background:var(--acc);color:#fff!important;padding:12px 24px;border-radius:9px;font-weight:700;border:0;cursor:pointer;font-size:15px;text-align:center;transition:.15s}
.btn:hover{background:var(--verde)}
.btn-ghost{background:transparent;border:1.5px solid var(--borda);color:var(--verde2)!important}
.btn.peq{padding:7px 13px;font-size:13px}
.hero{background:linear-gradient(155deg,var(--verde2),var(--verde) 65%,#1d6b38);color:#e6f2ea;padding:60px 0}
.hero h1{color:#fff;font-size:38px;max-width:780px}.hero p.sub{font-size:19px;max-width:640px;color:#c4e5cf}
.eyebrow{text-transform:uppercase;letter-spacing:1.5px;font-size:12px;color:#86efac;font-weight:700}
section{padding:46px 0}section.alt{background:var(--fundo)}
.grid{display:grid;gap:22px}.g3{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.card{background:#fff;border:1px solid var(--borda);border-radius:14px;padding:22px}
.card h3{margin-top:0;font-size:18px}
.plano{display:flex;flex-direction:column}.plano .preco{font-size:26px;font-weight:800;color:var(--verde2)}
.plano ul{padding-left:18px;margin:10px 0;color:var(--suave);flex:1}
.badge{display:inline-block;background:#86efac;color:#052e16;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;text-transform:uppercase}
input,select,textarea{width:100%;padding:11px 12px;border:1.5px solid var(--borda);border-radius:9px;font-size:15px;font-family:inherit;background:#fff}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--acc)}
label{font-size:13px;font-weight:600;color:var(--suave);display:block;margin:12px 0 4px}
.aviso{background:#fef7e0;border:1px solid #f5d78e;border-radius:9px;padding:10px 14px;font-size:14px;margin:10px 0}
.erro{background:#fde8e8;border:1px solid #f5b5b5;border-radius:9px;padding:10px 14px;font-size:14px;margin:10px 0;color:var(--alerta)}
footer{background:var(--ink);color:#b7c6bd;padding:32px 0;font-size:14px}footer a{color:#d4e5da}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--borda)}th{color:var(--suave);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.chip{display:inline-block;background:var(--fundo);border:1px solid var(--borda);border-radius:99px;padding:2px 10px;font-size:12px}
@media(max-width:640px){.hero h1{font-size:28px}.nav a.esconde{display:none}}
`;

function pagina({ titulo, descricao, corpo }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descricao)}">
<style>${CSS}</style></head><body>
<header class="top"><div class="wrap">
  <a class="brand" href="/vpe">Villela <b>Projects</b> & Events</a>
  <nav class="nav"><a class="esconde" href="/vpe#recursos">Recursos</a><a class="esconde" href="/vpe#planos">Planos</a><a href="/vpe/login">Entrar</a> <a class="btn" style="padding:9px 16px;background:#86efac;color:#052e16!important" href="/vpe/cadastro">Teste grátis</a></nav>
</div></header>
${corpo}
<footer><div class="wrap"><b style="color:#fff">Villela Projects & Events Intelligence</b> — gestão de projetos e eventos com IA.<br>
Um produto Augusto Villela Ltda · CNPJ 56.776.526/0001-12 · Brasília-DF<br>
<a href="/vpe/login">Entrar</a> · <a href="/vpe/cadastro">Criar conta</a></div></footer>
</body></html>`;
}

// ------------------------------------------------------------ landing
function landing() {
  const planos = repo.listarPlanos();
  const corpo = `
<div class="hero"><div class="wrap">
  <div class="eyebrow">Gestão de projetos e eventos com IA</div>
  <h1>Da ideia ao lançamento — e do briefing ao pós-evento — em um só lugar.</h1>
  <p class="sub">O Villela Projects & Events organiza seu portfólio de negócios (ideia → viabilidade → plano → execução → operação) e sua operação de eventos (briefing, proposta, fornecedores, equipe, financeiro), com agentes de IA trabalhando como parte do time.</p>
  <p style="margin-top:22px"><a class="btn" style="background:#86efac;color:#052e16!important" href="/vpe/cadastro">Começar teste grátis de 14 dias</a>
  <a class="btn btn-ghost" style="margin-left:8px;border-color:#2e7d4a;color:#c4e5cf!important" href="#demo">Pedir demonstração</a></p>
  <p style="font-size:13px;color:#9fcfaf">Sem cartão de crédito · Cancele quando quiser · LGPD</p>
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
  return pagina({ titulo: 'Villela Projects & Events — Gestão de projetos e eventos com IA', descricao: 'Portfólio de ideias, projetos por fases, eventos de ponta a ponta e agentes de IA. Teste grátis 14 dias.', corpo });
}

const formPagina = (titulo, inner) => pagina({
  titulo: `${titulo} — Villela Projects & Events`, descricao: 'Gestão de projetos e eventos com IA.',
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
<title>Villela Projects — Painel</title><style>${CSS}
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
  <a class="brand" href="/vpe/app">Villela <b>Projects</b></a>
  <nav class="nav"><span id="quem" style="font-size:13.5px;color:#c4e5cf"></span> <a href="#" onclick="return sair()" style="margin-left:14px">Sair</a></nav>
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

const TELAS=[
 ['dashboard','📊 Dashboard',()=>true],
 ['portfolio','💡 Portfólio',m=>m.permissoes.ver_projetos],
 ['tarefas','✅ Tarefas',m=>m.permissoes.ver_projetos],
 ['eventos','🎪 Eventos',()=>true,'breve'],
 ['crm','🤝 CRM & Propostas',()=>true,'breve'],
 ['financeiro','💰 Financeiro',()=>true,'breve'],
 ['ia','🤖 Agentes de IA',()=>true,'breve'],
 ['usuarios','👥 Usuários e permissões',m=>m.permissoes.gerir_usuarios],
 ['auditoria','📜 Auditoria',m=>m.permissoes.ver_auditoria],
 ['plano','📦 Plano e uso',m=>m.permissoes.ver_uso||m.permissoes.administrar_cobranca],
 ['config','⚙️ Configurações',m=>m.permissoes.gerir_configuracoes],
];
function menu(){$('menu').innerHTML=TELAS.filter(t=>t[2](S.me)).map(t=>
  t[3]?'<button class="breve" title="Próximas fases">'+t[1]+' <span class="chip">em breve</span></button>'
  :'<button class="'+(S.tela===t[0]?'on':'')+'" onclick="ir(\\''+t[0]+'\\')">'+t[1]+'</button>').join('');}
function ir(t){S.tela=t;menu();({dashboard:vDash,portfolio:vPortfolio,tarefas:vTarefas,usuarios:vUsuarios,auditoria:vAudit,plano:vPlano,config:vConfig}[t]||vDash)().catch(e=>$('corpo').innerHTML='<div class="erro">'+esc(e.message)+'</div>');}

async function boot(){
  S.me=await api('GET','/me');
  $('quem').textContent=S.me.user.nome+' · '+S.me.tenant.nome+' ('+S.me.papel_nome+')';
  menu();
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
   '<div class="aviso" style="margin-top:14px">🚧 Eventos, CRM, financeiro e agentes de IA chegam nas próximas fases.</div>';
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
  $('corpo').innerHTML='<h2>Plano e uso</h2>'+
   '<div class="card"><b>Plano atual:</b> '+esc(d.plano?d.plano.nome:'—')+' <span class="chip">'+esc(d.plano?d.plano.subscription.status:'')+'</span>'+
   '<table style="margin-top:10px"><tr><th>Métrica</th><th>Uso</th><th>Limite</th></tr>'+
   linha('Usuários ativos','usuarios',L.usuarios)+linha('Projetos','projetos',L.projetos)+
   linha('Eventos no mês','eventos',L.eventos_mes)+linha('Consultas de IA','ia_consultas',L.ia_consultas_mes)+'</table></div>'+
   '<div class="aviso">Assinatura online chega junto com o módulo comercial (Fase 5+) — por ora, plano é gerido pela Villela.</div>';
}
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

function registrarPaginas(app) {
  const html = (res, corpo) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex'); res.send(corpo); };
  app.get('/vpe', (req, res) => html(res, landing()));
  app.get('/vpe/cadastro', (req, res) => html(res, cadastro()));
  app.get('/vpe/login', (req, res) => html(res, login()));
  app.get('/vpe/convite/:token', (req, res) => html(res, convite(req.params.token)));
  app.get('/vpe/app', (req, res) => { res.setHeader('Cache-Control', 'no-store'); html(res, appTenant()); });
}

module.exports = { registrarPaginas };
