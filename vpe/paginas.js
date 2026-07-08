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
 ['tarefas','✅ Tarefas & Kanban',()=>true,'breve'],
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
function ir(t){S.tela=t;menu();({dashboard:vDash,portfolio:vPortfolio,usuarios:vUsuarios,auditoria:vAudit,plano:vPlano,config:vConfig}[t]||vDash)().catch(e=>$('corpo').innerHTML='<div class="erro">'+esc(e.message)+'</div>');}

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
   '<div class="kpi"><div class="n">'+d.usuarios_ativos+'</div><div class="r">usuários ativos</div></div></div>'+
   '<div class="card"><b>Portfólio por estágio</b><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">'+
   est.map(([e,n])=>'<span class="chip">'+esc(rot(e))+': <b>'+n+'</b></span>').join('')+'</div></div>'+
   (d.projetos_alta_prioridade.length?'<div class="card" style="margin-top:14px"><b>🔥 Alta prioridade</b><table><tr><th>Projeto</th><th>Estágio</th><th>Horizonte</th><th>Próximos passos</th></tr>'+
    d.projetos_alta_prioridade.map(p=>'<tr><td><a href="#" onclick="return abrirProj(\\''+p.id+'\\')">'+esc(p.nome)+'</a></td><td>'+esc(rot(p.estagio))+'</td><td>'+esc(p.horizonte)+'</td><td style="font-size:13px">'+esc((p.proximos_passos||'').slice(0,90))+'</td></tr>').join('')+'</table></div>':'')+
   '<div class="card" style="margin-top:14px"><b>Atividade recente</b><table><tr><th>Quando</th><th>Quem</th><th>Ação</th></tr>'+
   d.auditoria_recente.map(a=>'<tr><td>'+dt(a.criado_em)+'</td><td>'+esc(a.usuario_nome)+'</td><td>'+esc(a.acao)+'</td></tr>').join('')+'</table></div>'+
   '<div class="aviso" style="margin-top:14px">🚧 <b>Fase 1 (fundação).</b> Tarefas/Kanban, eventos, CRM, financeiro e agentes de IA chegam nas próximas fases.</div>';
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
   (S.me.permissoes.criar_projeto?'<button class="btn peq" onclick="novoProj()">+ Nova ideia/projeto</button>':'')+'</div>'+
   '<div class="card" style="margin-top:12px"><table><tr><th>Projeto</th><th>Categoria</th><th>Estágio</th><th>Horizonte</th><th>Prior.</th><th>Invest.</th><th>Receita/ano</th></tr>'+
   (projetos.length?projetos.map(p=>'<tr class="pri-'+p.prioridade+'"><td><a href="#" onclick="return abrirProj(\\''+p.id+'\\')">'+esc(p.nome)+'</a>'+(p.status!=='ativo'?' <span class="chip">'+p.status+'</span>':'')+'</td>'+
    '<td>'+esc(p.categoria)+'</td><td>'+esc(rot(p.estagio))+'</td><td>'+esc(p.horizonte)+'</td><td>'+esc(p.prioridade)+'</td><td>'+brl(p.investimento_estimado)+'</td><td>'+brl(p.receita_potencial)+'</td></tr>').join(''):'<tr><td colspan="7" style="color:var(--suave)">Nenhum projeto — crie a primeira ideia.</td></tr>')+'</table></div>';
}
function filtrarPf(){S.pf={busca:$('pf-busca').value,estagio:$('pf-estagio').value,categoria:$('pf-cat').value};vPortfolio();}
async function novoProj(){
  const nome=prompt('Nome da ideia/projeto:');if(!nome)return;
  try{const r=await api('POST','/projetos',{nome});abrirProj(r.projeto.id);}catch(e){alert(e.message);}
}
async function abrirProj(id){
  const {projeto:p}=await api('GET','/projetos/'+id);
  const P=S.me.permissoes;const E=S.enums||(await api('GET','/me')).enums;
  const sel=(idc,lista,atual)=>'<select id="'+idc+'"'+(P.editar_projeto?'':' disabled')+'>'+lista.map(x=>'<option value="'+x+'"'+(x===atual?' selected':'')+'>'+rot(x)+'</option>').join('')+'</select>';
  $('corpo').innerHTML='<p><a href="#" onclick="ir(\\'portfolio\\');return false">← portfólio</a></p><h2>'+esc(p.nome)+'</h2>'+
   '<div class="card">'+
   '<label>Nome</label><input id="pj-nome" value="'+esc(p.nome)+'"'+(P.editar_projeto?'':' disabled')+'>'+
   '<label>Descrição</label><textarea id="pj-desc" rows="3"'+(P.editar_projeto?'':' disabled')+'>'+esc(p.descricao)+'</textarea>'+
   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">'+
   '<div><label>Categoria</label>'+sel('pj-cat',E.categorias,p.categoria)+'</div>'+
   '<div><label>Estágio</label>'+sel('pj-est',E.estagios,p.estagio)+'</div>'+
   '<div><label>Horizonte</label>'+sel('pj-hor',E.horizontes,p.horizonte)+'</div>'+
   '<div><label>Prioridade</label>'+sel('pj-pri',E.prioridades,p.prioridade)+'</div>'+
   '<div><label>Viabilidade (0-100)</label><input id="pj-via" type="number" min="0" max="100" value="'+p.viabilidade+'"'+(P.editar_projeto?'':' disabled')+'></div>'+
   '<div><label>Investimento (R$)</label><input id="pj-inv" type="number" value="'+Math.round((p.investimento_estimado||0)/100)+'"'+(P.editar_projeto?'':' disabled')+'></div>'+
   '<div><label>Receita/ano (R$)</label><input id="pj-rec" type="number" value="'+Math.round((p.receita_potencial||0)/100)+'"'+(P.editar_projeto?'':' disabled')+'></div>'+
   '<div><label>Responsável</label><input id="pj-resp" value="'+esc(p.responsavel)+'"'+(P.editar_projeto?'':' disabled')+'></div></div>'+
   '<label>Riscos</label><textarea id="pj-risco" rows="2"'+(P.editar_projeto?'':' disabled')+'>'+esc(p.riscos)+'</textarea>'+
   '<label>Próximos passos</label><textarea id="pj-prox" rows="2"'+(P.editar_projeto?'':' disabled')+'>'+esc(p.proximos_passos)+'</textarea>'+
   (P.editar_projeto?'<p><button class="btn peq" onclick="salvarProj(\\''+p.id+'\\')">Salvar</button> '+
    (P.decidir_projeto?'<button class="btn btn-ghost peq" onclick="decidirProj(\\''+p.id+'\\',\\'pausado\\')">⏸ Pausar</button> <button class="btn btn-ghost peq" onclick="decidirProj(\\''+p.id+'\\',\\'arquivado\\')">🗂 Arquivar</button>':'')+
    ' <span id="pj-out"></span></p>':'')+
   '</div>'+
   '<div class="aviso" style="margin-top:12px">🧭 Plano de negócio, score de viabilidade guiado, tarefas e cronograma deste projeto chegam nas Fases 2-3.</div>';
  return false;
}
async function salvarProj(id){try{
  await api('PATCH','/projetos/'+id,{nome:$('pj-nome').value,descricao:$('pj-desc').value,categoria:$('pj-cat').value,estagio:$('pj-est').value,horizonte:$('pj-hor').value,prioridade:$('pj-pri').value,viabilidade:Number($('pj-via').value)||0,investimento_estimado:Math.round(Number($('pj-inv').value)*100)||0,receita_potencial:Math.round(Number($('pj-rec').value)*100)||0,responsavel:$('pj-resp').value,riscos:$('pj-risco').value,proximos_passos:$('pj-prox').value});
  $('pj-out').textContent='✅ salvo';}catch(e){$('pj-out').textContent='⚠️ '+e.message;}}
async function decidirProj(id,status){if(!confirm('Confirmar: '+status+'?'))return;try{await api('PATCH','/projetos/'+id,{status});ir('portfolio');}catch(e){alert(e.message);}}

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
