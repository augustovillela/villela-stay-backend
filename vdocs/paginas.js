// =====================================================================
// Villela Docs Intelligence — páginas públicas (server-rendered, SEO) e
// painel do cliente (/vdocs/app — SPA leve em fetch, sem framework).
// Identidade própria (índigo corporativo), separada do site da Villela Stay.
// =====================================================================
'use strict';
const repo = require('./repo');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (c) => Number(c || 0) === 0 ? 'Sob consulta' : 'R$ ' + (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + '/mês';

const CSS = `
:root{--ink:#141a2e;--indigo:#2b3a8f;--indigo2:#1e2a6e;--azul:#3b5bdb;--ciano:#12b5cb;--fundo:#f6f7fb;--borda:#e3e6f0;--suave:#5b6478;--ok:#0f9d58;--alerta:#d93025}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.6}
h1,h2,h3{line-height:1.2;margin:.2em 0 .5em;color:var(--indigo2)}
a{color:var(--azul);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}.wrap-sm{max-width:560px;margin:0 auto;padding:0 20px}
header.top{background:var(--indigo2);color:#fff;position:sticky;top:0;z-index:20}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
header.top a{color:#e8ebfa}.brand{font-weight:800;font-size:19px;letter-spacing:.3px;color:#fff!important}.brand b{color:var(--ciano)}
.nav a{margin-left:18px;font-size:15px}
.btn{display:inline-block;background:var(--azul);color:#fff!important;padding:12px 24px;border-radius:9px;font-weight:700;border:0;cursor:pointer;font-size:15px;text-align:center;transition:.15s}
.btn:hover{background:var(--indigo);text-decoration:none}
.btn-ciano{background:var(--ciano);color:#06323a!important}.btn-ciano:hover{background:#0ea2b5}
.btn-ghost{background:transparent;border:1.5px solid var(--borda);color:var(--indigo2)!important}
.hero{background:linear-gradient(155deg,var(--indigo2),var(--indigo) 60%,#38449b);color:#e8ebfa;padding:64px 0}
.hero h1{color:#fff;font-size:40px;max-width:760px}.hero p.sub{font-size:19px;max-width:640px;color:#c9d1f2}
.eyebrow{text-transform:uppercase;letter-spacing:1.5px;font-size:12px;color:var(--ciano);font-weight:700}
section{padding:48px 0}section.alt{background:var(--fundo)}
.grid{display:grid;gap:22px}.g3{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}.g2{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.card{background:#fff;border:1px solid var(--borda);border-radius:14px;padding:22px}
.card h3{margin-top:0;font-size:18px}
.plano{display:flex;flex-direction:column}.plano .preco{font-size:26px;font-weight:800;color:var(--indigo2)}
.plano ul{padding-left:18px;margin:10px 0;color:var(--suave);flex:1}.plano li{margin:4px 0}
.badge{display:inline-block;background:var(--ciano);color:#06323a;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;text-transform:uppercase;letter-spacing:.5px}
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

function pagina({ titulo, descricao, corpo, canonical }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descricao)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
<style>${CSS}</style></head><body>
<header class="top"><div class="wrap">
  <a class="brand" href="/vdocs">Villela <b>Docs</b> Intelligence</a>
  <nav class="nav"><a class="esconde" href="/vdocs#recursos">Recursos</a><a class="esconde" href="/vdocs/precos">Planos</a><a href="/vdocs/login">Entrar</a> <a class="btn btn-ciano" style="padding:9px 16px" href="/vdocs/cadastro">Teste grátis</a></nav>
</div></header>
${corpo}
<footer><div class="wrap">
  <b style="color:#fff">Villela Docs Intelligence</b> — gestão documental inteligente para empresas.<br>
  Um produto Augusto Villela Ltda · CNPJ 56.776.526/0001-12 · Brasília-DF<br>
  <a href="/vdocs/precos">Planos</a> · <a href="/vdocs/login">Entrar</a> · <a href="/vdocs/cadastro">Criar conta</a>
  <div style="margin-top:8px;font-size:12px">Seus documentos são privados: armazenamento isolado por empresa, criptografia em trânsito e trilha de auditoria completa (LGPD).</div>
</div></footer>
</body></html>`;
}

// ------------------------------------------------------------ landing
function landing() {
  const planos = repo.listarPlanos();
  const corpo = `
<div class="hero"><div class="wrap">
  <div class="eyebrow">Gestão documental com inteligência artificial</div>
  <h1>Todos os documentos da sua empresa organizados, seguros e com respostas em segundos.</h1>
  <p class="sub">O Villela Docs Intelligence centraliza contratos, notas, políticas e processos em um só lugar — com busca inteligente, aprovações, controle de versão, trilha de auditoria e uma IA que responde citando os documentos.</p>
  <p style="margin-top:22px"><a class="btn btn-ciano" href="/vdocs/cadastro">Começar teste grátis de 14 dias</a>
  <a class="btn btn-ghost" style="margin-left:8px" href="#demo">Pedir demonstração</a></p>
  <p style="font-size:13px;color:#aab4e6">Sem cartão de crédito · Cancele quando quiser · Dados no Brasil, adequado à LGPD</p>
</div></div>

<section><div class="wrap">
  <div class="eyebrow">O problema</div>
  <h2>Pastas soltas custam caro</h2>
  <div class="grid g2">
    <div class="card"><h3>😩 Sem gestão documental</h3><ul style="color:var(--suave)">
      <li>Contrato importante “sumido” no e-mail ou no drive de alguém</li>
      <li>Versões duplicadas — ninguém sabe qual vale</li>
      <li>Vencimentos e renovações descobertos tarde demais</li>
      <li>Zero controle de quem viu, baixou ou apagou o quê</li>
      <li>Colaborador sai da empresa e leva o acesso junto</li></ul></div>
    <div class="card" style="border-color:var(--azul)"><h3>✅ Com o Villela Docs</h3><ul style="color:var(--suave)">
      <li><span class="check">✔</span> Um repositório central por empresa, com pastas e permissões</li>
      <li><span class="check">✔</span> Versão vigente sempre identificada, histórico completo</li>
      <li><span class="check">✔</span> Alertas de validade e políticas de retenção</li>
      <li><span class="check">✔</span> Auditoria de cada visualização, download e alteração</li>
      <li><span class="check">✔</span> Acesso revogado em um clique</li></ul></div>
  </div>
</div></section>

<section class="alt" id="recursos"><div class="wrap">
  <div class="eyebrow">Recursos</div>
  <h2>Feito para o dia a dia de quem gerencia documentos</h2>
  <div class="grid g3">
    <div class="card"><h3>🔎 Busca inteligente</h3>Encontre por nome, conteúdo, metadados ou pergunta em linguagem natural. OCR lê até documento escaneado.</div>
    <div class="card"><h3>🤖 IA que cita as fontes</h3>Converse com seus documentos: resumos, cláusulas, prazos e riscos — sempre apontando documento e página. Sem inventar.</div>
    <div class="card"><h3>✅ Workflows de aprovação</h3>Contratos e políticas passam por etapas, prazos e aprovadores definidos por você, com histórico de cada decisão.</div>
    <div class="card"><h3>🗂️ Versionamento</h3>Toda alteração vira versão. Compare, restaure e saiba sempre qual é o documento vigente.</div>
    <div class="card"><h3>🔐 Segurança corporativa</h3>Permissões por papel, pasta e documento. Links de compartilhamento com senha e validade. Nada exposto em URL pública.</div>
    <div class="card"><h3>📜 LGPD e auditoria</h3>Trilha completa de acessos, retenção e descarte controlados, exportação de dados e relatórios de conformidade.</div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="eyebrow">Para quem é</div>
  <h2>Pequenas, médias e grandes empresas</h2>
  <div class="grid g3">
    <div class="card"><h3>Jurídico e contratos</h3>Contratos com vencimento monitorado, cláusulas extraídas por IA e aprovação formal antes da assinatura.</div>
    <div class="card"><h3>Financeiro e contábil</h3>Notas, recibos e comprovantes organizados por competência, com busca por valor, fornecedor ou CNPJ.</div>
    <div class="card"><h3>RH e operações</h3>Políticas internas versionadas, documentos de colaboradores com acesso restrito e retenção conforme a lei.</div>
  </div>
</div></section>

<section class="alt"><div class="wrap">
  <div class="eyebrow">Planos</div>
  <h2>Comece pequeno, cresça sem trocar de ferramenta</h2>
  <div class="grid g3">
    ${planos.map(p => `<div class="card plano">${p.slug === 'professional' ? '<div><span class="badge">Mais escolhido</span></div>' : ''}
      <h3>${esc(p.nome)}</h3><div class="preco">${brl(p.preco_centavos)}</div>
      <ul>${planoBullets(p)}</ul>
      <a class="btn${p.slug === 'professional' ? '' : ' btn-ghost'}" href="/vdocs/cadastro">Testar grátis</a></div>`).join('')}
  </div>
  <p style="text-align:center"><a href="/vdocs/precos">Ver comparação completa de planos →</a></p>
</div></section>

<section id="demo"><div class="wrap-sm">
  <div class="eyebrow">Fale com a gente</div>
  <h2>Peça uma demonstração</h2>
  <p style="color:var(--suave)">Deixe seus dados e retornamos em até 1 dia útil.</p>
  <div id="lead-erro"></div>
  <form onsubmit="return enviarLead(event)">
    <label>Seu nome</label><input id="ld-nome" required>
    <label>E-mail corporativo</label><input id="ld-email" type="email" required>
    <label>Empresa</label><input id="ld-empresa">
    <label>Telefone/WhatsApp</label><input id="ld-tel">
    <label>O que você precisa organizar?</label><textarea id="ld-msg" rows="3"></textarea>
    <p><button class="btn" type="submit">Quero uma demonstração</button></p>
  </form>
  <div id="lead-ok" style="display:none" class="aviso">✅ Recebido! Vamos entrar em contato em breve.</div>
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

<section class="alt faq"><div class="wrap-sm">
  <h2>Perguntas frequentes</h2>
  <details><summary>Meus documentos ficam seguros?</summary>Cada empresa tem seus dados isolados das demais, com criptografia em trânsito, armazenamento privado (nunca em URL pública) e trilha de auditoria de cada acesso.</details>
  <details><summary>A IA pode inventar informações?</summary>Não. A IA responde apenas com base nos seus documentos e sempre cita documento e trecho usados. Quando não encontra a resposta, ela diz que não encontrou.</details>
  <details><summary>Preciso instalar algo?</summary>Não — é 100% na nuvem, funciona no navegador do computador e do celular.</details>
  <details><summary>E se eu cancelar?</summary>Você exporta todos os seus documentos e dados antes de sair. Sem fidelidade, sem multa.</details>
  <details><summary>Atende à LGPD?</summary>Sim: controle de acesso, registro de tratamento, retenção e descarte controlados, exportação e exclusão de dados quando aplicável.</details>
</div></section>`;
  return pagina({ titulo: 'Villela Docs Intelligence — Gestão de documentos com IA para empresas', descricao: 'Centralize, organize e encontre os documentos da sua empresa com busca inteligente, workflows de aprovação, auditoria e IA que cita as fontes. Teste grátis 14 dias.', corpo });
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
  const corpo = `<section><div class="wrap">
  <div class="eyebrow">Planos e preços</div>
  <h2>Escolha o tamanho da sua operação</h2>
  <p style="color:var(--suave)">Todos os planos começam com <b>14 dias grátis</b> no nível Professional — sem cartão de crédito.</p>
  <div style="overflow-x:auto"><table>
    <tr><th></th>${planos.map(p => `<th style="font-size:15px;color:var(--indigo2)">${esc(p.nome)}<br><span style="font-weight:400;color:var(--suave)">${brl(p.preco_centavos)}</span></th>`).join('')}</tr>
    ${linhas.map(([rot, fn]) => `<tr><td><b>${rot}</b></td>${planos.map(p => `<td>${fn(p)}</td>`).join('')}</tr>`).join('')}
    <tr><td></td>${planos.map(() => `<td><a class="btn" style="padding:9px 16px" href="/vdocs/cadastro">Testar grátis</a></td>`).join('')}</tr>
  </table></div>
  <div class="aviso">Precisa de volumes maiores, SSO ou contrato personalizado? <a href="/vdocs#demo">Fale com a gente</a> — o plano Enterprise é sob medida.</div>
</div></section>`;
  return pagina({ titulo: 'Planos e preços — Villela Docs Intelligence', descricao: 'Planos Starter, Professional, Business e Enterprise. Teste grátis 14 dias, sem cartão.', corpo });
}

// ------------------------------------------------------------ cadastro / login / convite
const formPagina = (titulo, inner) => pagina({
  titulo: `${titulo} — Villela Docs Intelligence`, descricao: 'Gestão documental inteligente para empresas.',
  corpo: `<section class="alt" style="min-height:60vh"><div class="wrap-sm"><div class="card" style="padding:28px"><h2 style="margin-top:0">${esc(titulo)}</h2>${inner}</div></div></section>`,
});

const cadastro = () => formPagina('Criar conta — teste grátis 14 dias', `
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
  <p style="font-size:13px;color:var(--suave)">Ainda não tem conta? <a href="/vdocs/cadastro">Teste grátis 14 dias</a></p>
  <script>
  async function enviar(ev){ev.preventDefault();const v=id=>document.getElementById(id).value;
    const r=await fetch('/vdocs/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:v('f-email'),senha:v('f-senha')})});
    const d=await r.json().catch(()=>({}));
    if(r.ok)location.href='/vdocs/app';else document.getElementById('erro').innerHTML='<div class="erro">'+(d.erro||'Erro no login.')+'</div>';
    return false;}
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

// ------------------------------------------------------------ painel do cliente (SPA)
function appTenant() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Villela Docs — Painel</title><style>${CSS}
body{background:var(--fundo)}
.layout{display:flex;min-height:calc(100vh - 60px)}
aside{width:230px;background:#fff;border-right:1px solid var(--borda);padding:18px 12px;flex-shrink:0}
aside button{display:block;width:100%;text-align:left;background:none;border:0;padding:10px 12px;border-radius:8px;font-size:14.5px;cursor:pointer;color:var(--ink);font-family:inherit}
aside button.on{background:var(--indigo2);color:#fff;font-weight:700}
aside button:hover:not(.on){background:var(--fundo)}
aside .breve{opacity:.45;cursor:default}
main{flex:1;padding:26px;max-width:1000px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin:14px 0}
.kpi{background:#fff;border:1px solid var(--borda);border-radius:12px;padding:14px}.kpi .n{font-size:26px;font-weight:800;color:var(--indigo2)}.kpi .r{font-size:12.5px;color:var(--suave)}
.chip{display:inline-block;background:var(--fundo);border:1px solid var(--borda);border-radius:99px;padding:2px 10px;font-size:12px}
.btn.peq{padding:7px 13px;font-size:13px}
.barra{height:8px;background:var(--borda);border-radius:99px;overflow:hidden}.barra i{display:block;height:100%;background:var(--azul)}
@media(max-width:760px){.layout{flex-direction:column}aside{width:auto;display:flex;overflow-x:auto;gap:4px}aside button{white-space:nowrap;width:auto}}
</style></head><body>
<header class="top"><div class="wrap" style="max-width:none">
  <a class="brand" href="/vdocs/app">Villela <b>Docs</b></a>
  <nav class="nav"><span id="quem" style="font-size:13.5px;color:#c9d1f2"></span> <a href="#" onclick="return sair()" style="margin-left:14px">Sair</a></nav>
</div></header>
<div class="layout"><aside id="menu"></aside><main id="corpo"><p>Carregando…</p></main></div>
<script>
'use strict';
const S={me:null,tela:'dashboard'};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const dt=s=>s?new Date(s).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
async function api(m,c,b){const r=await fetch('/vdocs/api'+c,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){location.href='/vdocs/login';throw new Error('sessão expirada');}
  if(!r.ok)throw new Error(d.erro||('HTTP '+r.status));return d;}
async function sair(){await api('POST','/logout').catch(()=>{});location.href='/vdocs/login';return false;}

const TELAS=[
 ['dashboard','📊 Dashboard',()=>true],
 ['documentos','📁 Documentos',()=>true,'breve'],
 ['busca','🔎 Busca',()=>true,'breve'],
 ['ia','🤖 IA documental',()=>true,'breve'],
 ['workflows','✅ Aprovações',()=>true,'breve'],
 ['usuarios','👥 Usuários e permissões',m=>m.permissoes.gerir_usuarios],
 ['auditoria','📜 Auditoria',m=>m.permissoes.ver_auditoria],
 ['plano','📦 Plano e uso',m=>m.permissoes.ver_uso||m.permissoes.administrar_cobranca],
 ['config','⚙️ Configurações',m=>m.permissoes.gerir_configuracoes],
];
function menu(){$('menu').innerHTML=TELAS.filter(t=>t[2](S.me)).map(t=>
  t[3]?'<button class="breve" title="Disponível na próxima fase">'+t[1]+' <span class="chip">em breve</span></button>'
  :'<button class="'+(S.tela===t[0]?'on':'')+'" onclick="ir(\\''+t[0]+'\\')">'+t[1]+'</button>').join('');}
function ir(t){S.tela=t;menu();({dashboard:vDash,usuarios:vUsuarios,auditoria:vAudit,plano:vPlano,config:vConfig}[t]||vDash)().catch(e=>$('corpo').innerHTML='<div class="erro">'+esc(e.message)+'</div>');}

async function boot(){
  S.me=await api('GET','/me');
  $('quem').textContent=S.me.user.nome+' · '+S.me.tenant.nome+' ('+S.me.papel_nome+')';
  menu();
  if(S.me.bloqueado){$('corpo').innerHTML='<div class="erro"><b>Conta bloqueada.</b> '+(S.me.tenant.status==='suspensa'?'Sua conta está suspensa — fale com a Villela Docs.':'Seu período de teste terminou — escolha um plano para continuar (fale com a gente pelo formulário da página inicial).')+'</div>';return;}
  ir('dashboard');
}
async function vDash(){
  const d=await api('GET','/dashboard');
  const L=(d.plano&&d.plano.limites)||{};
  const pct=(v,l)=>l?Math.min(100,Math.round(100*v/l)):0;
  const trial=d.empresa.status==='trial'?'<div class="aviso">🕑 Período de teste até <b>'+new Date(d.empresa.trial_expira_em).toLocaleDateString('pt-BR')+'</b> (plano '+esc(d.plano?d.plano.nome:'')+').</div>':'';
  $('corpo').innerHTML='<h2>Dashboard</h2>'+trial+
   '<div class="kpis">'+
   '<div class="kpi"><div class="n">'+d.usuarios_ativos+'</div><div class="r">usuários ativos'+(L.usuarios?' / '+L.usuarios:'')+'</div></div>'+
   '<div class="kpi"><div class="n">'+d.convites_pendentes+'</div><div class="r">convites pendentes</div></div>'+
   '<div class="kpi"><div class="n">'+d.documentos+'</div><div class="r">documentos (Fase 2)</div></div>'+
   '<div class="kpi"><div class="n">'+(d.armazenamento_mb||0)+' MB</div><div class="r">armazenamento usado</div></div></div>'+
   (L.usuarios?'<div class="card"><b>Uso de usuários</b><div class="barra" style="margin-top:6px"><i style="width:'+pct(d.usuarios_ativos,L.usuarios)+'%"></i></div><span class="r" style="font-size:12px;color:var(--suave)">'+d.usuarios_ativos+' de '+L.usuarios+'</span></div>':'')+
   '<div class="card" style="margin-top:14px"><b>Atividade recente</b><table><tr><th>Quando</th><th>Quem</th><th>Ação</th></tr>'+
   d.auditoria_recente.map(a=>'<tr><td>'+dt(a.criado_em)+'</td><td>'+esc(a.usuario_nome)+'</td><td>'+esc(a.acao)+'</td></tr>').join('')+'</table></div>'+
   '<div class="aviso" style="margin-top:14px">🚧 <b>Fase 1 (fundação).</b> Upload de documentos, pastas, busca, OCR, IA e workflows chegam nas próximas fases.</div>';
}
async function vUsuarios(){
  const d=await api('GET','/usuarios');const papeis=S.me.papeis_embutidos;
  const opts=sel=>Object.entries(papeis).filter(([k])=>k!=='dono').map(([k,n])=>'<option value="'+k+'"'+(k===sel?' selected':'')+'>'+esc(n)+'</option>').join('');
  $('corpo').innerHTML='<h2>Usuários e permissões</h2>'+
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
  $('corpo').innerHTML='<h2>Trilha de auditoria</h2><div class="card"><table><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th><th>IP</th></tr>'+
   d.eventos.map(a=>'<tr><td>'+dt(a.criado_em)+'</td><td>'+esc(a.usuario_nome)+'</td><td>'+esc(a.acao)+'</td><td>'+esc(a.entidade)+(a.entidade_id?' <span class="chip">'+esc(a.entidade_id)+'</span>':'')+'</td><td>'+esc(a.ip)+'</td></tr>').join('')+'</table></div>';
}
async function vPlano(){
  const d=await api('GET','/uso');const L=(d.plano&&d.plano.limites)||{};
  const linha=(rot,met,lim)=>{const v=Number(d.uso[met]||0);return '<tr><td>'+rot+'</td><td>'+v.toLocaleString('pt-BR')+'</td><td>'+(lim?Number(lim).toLocaleString('pt-BR'):'ilimitado')+'</td></tr>';};
  $('corpo').innerHTML='<h2>Plano e uso</h2>'+
   '<div class="card"><b>Plano atual:</b> '+esc(d.plano?d.plano.nome:'—')+' <span class="chip">'+esc(d.plano?d.plano.subscription.status:'')+'</span>'+
   '<table style="margin-top:10px"><tr><th>Métrica</th><th>Uso no mês</th><th>Limite</th></tr>'+
   linha('Usuários ativos','usuarios',L.usuarios)+linha('Documentos','documentos',L.documentos)+
   linha('Armazenamento (MB)','armazenamento_mb',L.armazenamento_mb)+linha('Páginas OCR','ocr_paginas',L.ocr_paginas_mes)+
   linha('Consultas de IA','ia_consultas',L.ia_consultas_mes)+'</table></div>'+
   '<div class="aviso">Para mudar de plano, fale com a Villela Docs pela página inicial (cobrança automática chega na Fase 8).</div>';
}
async function vConfig(){
  const d=await api('GET','/config');const t=d.tenant,st=d.settings;
  $('corpo').innerHTML='<h2>Configurações da empresa</h2><div class="card">'+
   '<label>Nome da empresa</label><input id="cf-nome" value="'+esc(t.nome)+'">'+
   '<label>CNPJ</label><input id="cf-cnpj" value="'+esc(t.cnpj)+'">'+
   '<label>E-mail de contato</label><input id="cf-email" value="'+esc(t.email_contato)+'">'+
   '<label>Telefone</label><input id="cf-tel" value="'+esc(t.telefone)+'">'+
   '<label>Retenção padrão (dias; 0 = sem descarte automático)</label><input id="cf-ret" type="number" value="'+esc(st.retencao_padrao_dias||'0')+'">'+
   '<p><button class="btn" onclick="salvarCfg()">Salvar</button> <span id="cf-out"></span></p></div>'+
   '<div class="card" style="margin-top:14px"><b>Identificador (slug):</b> <code>'+esc(t.slug)+'</code> · criado em '+dt(t.criado_em)+'</div>';
}
async function salvarCfg(){try{
  await api('PATCH','/config',{tenant:{nome:$('cf-nome').value,cnpj:$('cf-cnpj').value,email_contato:$('cf-email').value,telefone:$('cf-tel').value},settings:{retencao_padrao_dias:$('cf-ret').value}});
  $('cf-out').textContent='✅ salvo';}catch(e){$('cf-out').textContent='⚠️ '+e.message;}}
boot().catch(e=>$('corpo').innerHTML='<div class="erro">'+esc(e.message)+'</div>');
</script></body></html>`;
}

function registrarPaginas(app) {
  const html = (res, corpo) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.send(corpo); };
  app.get('/vdocs', (req, res) => html(res, landing()));
  app.get('/vdocs/precos', (req, res) => html(res, precos()));
  app.get('/vdocs/cadastro', (req, res) => html(res, cadastro()));
  app.get('/vdocs/login', (req, res) => html(res, login()));
  app.get('/vdocs/convite/:token', (req, res) => html(res, convite(req.params.token)));
  app.get('/vdocs/app', (req, res) => { res.setHeader('Cache-Control', 'no-store'); html(res, appTenant()); });
}

module.exports = { registrarPaginas };
