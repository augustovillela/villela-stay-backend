// =====================================================================
// Villela Docs (Document Intelligence) — páginas públicas (server-rendered,
// SEO) e painel do cliente (/vdocs/app — SPA leve em fetch, sem framework).
// Identidade do GRUPO VILLELA (navy + azul-aço #2563EB + dourado),
// separada do site da Villela Stay. Assets: /assets/brand/villela-docs/.
// =====================================================================
'use strict';
const repo = require('./repo');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (c) => Number(c || 0) === 0 ? 'Sob consulta' : 'R$ ' + (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + '/mês';

const CSS = `
:root{--ink:#1F2933;--indigo:#1B2A4A;--indigo2:#24365C;--azul:#2563EB;--ciano:#C9A227;--fundo:#F8F9FA;--borda:#E2E6EC;--suave:#5b6478;--ok:#0f9d58;--alerta:#d93025}
*{box-sizing:border-box}body{margin:0;font-family:'Inter',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.6}
h1,h2,h3{font-family:'Lora',Georgia,serif;line-height:1.2;margin:.2em 0 .5em;color:var(--indigo2)}
a{color:var(--azul);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}.wrap-sm{max-width:560px;margin:0 auto;padding:0 20px}
header.top{background:var(--indigo2);color:#fff;position:sticky;top:0;z-index:20}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
header.top a{color:#e6ebf4}.brand{display:flex;align-items:center;gap:9px;font-family:'Lora',Georgia,serif;font-weight:700;font-size:19px;letter-spacing:.3px;color:#fff!important}.brand img{height:32px;display:block}.brand b{font-family:'Inter',sans-serif;font-weight:700;font-size:14px;letter-spacing:.22em;color:var(--azul)}
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
<style>${CSS}</style></head><body>
<header class="top xl"><div class="wrap">
  <a class="brand" href="/vdocs">${MARCA_XL}</a>
  <nav class="nav"><a class="esconde" href="/vdocs#recursos">Recursos</a><a class="esconde" href="/vdocs/precos">Planos</a><a href="/vdocs/login">Entrar</a> <a class="btn btn-ciano" style="padding:9px 16px" href="/vdocs/cadastro">Teste grátis</a></nav>
</div></header>
${corpo}
<footer><div class="wrap">
  <b style="color:#fff">Villela Docs</b> · Inteligência documental para empresas<br>
  Uma empresa do Grupo Villela Stay · CNPJ 56.776.526/0001-12 · Brasília-DF<br>
  <a href="/vdocs/precos">Planos</a> · <a href="/vdocs/login">Entrar</a> · <a href="/vdocs/cadastro">Criar conta</a> · <a href="/vdocs/ajuda">Ajuda</a>
  <div style="margin-top:8px;font-size:12px">Seus documentos são privados: armazenamento isolado por empresa, criptografia em trânsito e trilha de auditoria completa (LGPD).</div>
</div></footer>
</body></html>`;
}

// ------------------------------------------------------------ landing
function landing() {
  const planos = repo.listarPlanos();
  const corpo = `
<div class="hero"><div class="wrap">
  <div class="eyebrow">Inteligência documental para empresas</div>
  <h1>Todos os documentos da sua empresa organizados, seguros e com respostas em segundos.</h1>
  <p class="sub">O Villela Docs — Document Intelligence centraliza contratos, notas, políticas e processos em um só lugar — com busca inteligente, aprovações, controle de versão, trilha de auditoria e uma IA que responde citando os documentos.</p>
  <p style="margin-top:22px"><a class="btn btn-ciano" href="/vdocs/cadastro">Começar teste grátis de 14 dias</a>
  <a class="btn btn-ghost" style="margin-left:8px" href="#demo">Pedir demonstração</a></p>
  <p style="font-size:13px;color:#9fb0cc">Sem cartão de crédito · Cancele quando quiser · Dados no Brasil, adequado à LGPD</p>
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

<section id="confianca"><div class="wrap">
  <div class="eyebrow">Por que confiar</div>
  <h2>Tecnologia testada na vida real</h2>
  <p class="sub" style="max-width:640px">Nossa missão é transformar o arquivo morto da sua empresa em respostas — busca que entende o conteúdo e IA que responde <b>citando a fonte</b>. O Villela Docs nasceu dentro do Grupo Villela Stay, para organizar os contratos, notas e políticas de uma operação real.</p>
  <div class="grid g3">
    <div class="card"><h3>🏢 Nascido numa operação real</h3>Construído pelo Grupo Villela Stay com os mesmos padrões de segurança, auditoria e isolamento que usamos nos nossos próprios sistemas em produção.</div>
    <div class="card"><h3>📎 IA que cita a fonte</h3>Cada resposta aponta o documento e o trecho de origem — você confere em um clique, nada de resposta solta.</div>
    <div class="card"><h3>✅ 222 verificações automatizadas</h3>Cada atualização passa por 222 testes antes de chegar a você.</div>
  </div>
  <p class="sub" style="margin-top:24px">🔒 Conexão segura (HTTPS) &nbsp;·&nbsp; 🛡️ Dados tratados conforme a LGPD &nbsp;·&nbsp; 💳 Pagamentos pelo Mercado Pago</p>
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
  return pagina({
    titulo: 'Villela Docs — Document Intelligence: gestão de documentos com IA para empresas',
    descricao: 'Inteligência documental para empresas: centralize, organize e encontre os documentos da sua empresa com busca inteligente, workflows de aprovação, auditoria e IA que cita as fontes. Teste grátis 14 dias.',
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
  return pagina({ titulo: 'Planos e preços — Villela Docs', descricao: 'Planos Starter, Professional, Business e Enterprise. Teste grátis 14 dias, sem cartão.', corpo });
}

// ------------------------------------------------------------ cadastro / login / convite
const formPagina = (titulo, inner) => pagina({
  titulo: `${titulo} — Villela Docs`, descricao: 'Inteligência documental para empresas.',
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

// ------------------------------------------------------------ painel do cliente (SPA)
function appTenant() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Villela Docs — Painel</title>
${HEAD_MARCA}
<style>${CSS}
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
  <a class="brand" href="/vdocs/app">${MARCA}</a>
  <nav class="nav"><span id="quem" style="font-size:13.5px;color:#c6d0e2"></span> <button id="push-btn" style="display:none;margin-left:14px;background:none;border:1px solid #3a4a66;color:#c6d0e2;border-radius:8px;padding:4px 10px;font-size:13px;cursor:pointer;font-family:inherit" title="Notificações no celular">🔔 Avisos</button> <a href="#" onclick="return sair()" style="margin-left:14px">Sair</a></nav>
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

const TELAS=[
 ['dashboard','📊 Dashboard',()=>true],
 ['documentos','📁 Documentos',m=>m.permissoes.ver_documentos],
 ['busca','🔎 Busca',m=>m.permissoes.ver_documentos],
 ['ia','🤖 IA documental',m=>m.permissoes.usar_ia],
 ['workflows','✅ Aprovações',m=>m.permissoes.ver_documentos],
 ['compartilhar','🔗 Compartilhamentos',m=>m.permissoes.compartilhar_documento],
 ['integracoes','🔌 Integrações',m=>m.permissoes.configurar_integracoes],
 ['usuarios','👥 Usuários e permissões',m=>m.permissoes.gerir_usuarios],
 ['auditoria','📜 Auditoria',m=>m.permissoes.ver_auditoria],
 ['plano','📦 Plano e uso',m=>m.permissoes.ver_uso||m.permissoes.administrar_cobranca],
 ['config','⚙️ Configurações',m=>m.permissoes.gerir_configuracoes],
];
function menu(){$('menu').innerHTML=TELAS.filter(t=>t[2](S.me)).map(t=>
  t[3]?'<button class="breve" title="Disponível na próxima fase">'+t[1]+' <span class="chip">em breve</span></button>'
  :'<button class="'+(S.tela===t[0]?'on':'')+'" onclick="ir(\\''+t[0]+'\\')">'+t[1]+'</button>').join('');}
function ir(t){S.tela=t;menu();({dashboard:vDash,documentos:vDocs,busca:vBusca,ia:vIA,workflows:vWorkflows,compartilhar:vShares,integracoes:vInteg,usuarios:vUsuarios,auditoria:vAudit,plano:vPlano,config:vConfig}[t]||vDash)().catch(e=>$('corpo').innerHTML='<div class="erro">'+esc(e.message)+'</div>');}

async function boot(){
  S.me=await api('GET','/me');
  $('quem').textContent=S.me.user.nome+' · '+S.me.tenant.nome+' ('+S.me.papel_nome+')';
  menu();
  pintarBotaoPush().catch(()=>{});
  if(S.me.bloqueado){$('corpo').innerHTML='<div class="erro"><b>Conta bloqueada.</b> '+(S.me.tenant.status==='suspensa'?'Sua conta está suspensa — fale com a Villela Docs.':'Seu período de teste terminou — escolha um plano para continuar (fale com a gente pelo formulário da página inicial).')+'</div>';return;}
  ir('dashboard');
}
async function vDash(){
  const d=await api('GET','/dashboard');
  const L=(d.plano&&d.plano.limites)||{};
  const pct=(v,l)=>l?Math.min(100,Math.round(100*v/l)):0;
  const trial=d.empresa.status==='trial'?'<div class="aviso">🕑 Período de teste até <b>'+new Date(d.empresa.trial_expira_em).toLocaleDateString('pt-BR')+'</b> (plano '+esc(d.plano?d.plano.nome:'')+').</div>':'';
  const venc=d.vencendo_30dias?'<div class="erro" style="background:#fef7e0;border-color:#f5d78e;color:var(--ink)">📅 <b>'+d.vencendo_30dias+' documento(s) com validade nos próximos 30 dias'+(d.vencidos?' ('+d.vencidos+' já vencido(s))':'')+':</b> '+d.docs_vencendo.map(x=>(x.vencido?'🔴 ':'🟡 ')+esc(x.nome)+' ('+x.validade.split('-').reverse().join('/')+')').join(' · ')+'</div>':'';
  $('corpo').innerHTML='<h2>Dashboard</h2>'+trial+venc+
   '<div class="kpis">'+
   '<div class="kpi"><div class="n">'+d.usuarios_ativos+'</div><div class="r">usuários ativos'+(L.usuarios?' / '+L.usuarios:'')+'</div></div>'+
   '<div class="kpi"><div class="n">'+d.convites_pendentes+'</div><div class="r">convites pendentes</div></div>'+
   '<div class="kpi"><div class="n">'+(d.aprovacoes_pendentes||0)+'</div><div class="r">aprovações para você</div></div>'+
   '<div class="kpi"><div class="n">'+d.documentos+'</div><div class="r">documentos</div></div>'+
   '<div class="kpi"><div class="n">'+(d.armazenamento_mb||0)+' MB</div><div class="r">armazenamento usado</div></div></div>'+
   (L.usuarios?'<div class="card"><b>Uso de usuários</b><div class="barra" style="margin-top:6px"><i style="width:'+pct(d.usuarios_ativos,L.usuarios)+'%"></i></div><span class="r" style="font-size:12px;color:var(--suave)">'+d.usuarios_ativos+' de '+L.usuarios+'</span></div>':'')+
   '<div class="card" style="margin-top:14px"><b>Atividade recente</b><table><tr><th>Quando</th><th>Quem</th><th>Ação</th></tr>'+
   d.auditoria_recente.map(a=>'<tr><td>'+dt(a.criado_em)+'</td><td>'+esc(a.usuario_nome)+'</td><td>'+esc(a.acao)+'</td></tr>').join('')+'</table></div>'+
   '<div class="aviso" style="margin-top:14px">🚧 Busca avançada, OCR, IA documental e workflows de aprovação chegam nas próximas fases.</div>';
}
// ---------------- Documentos (Fase 2) ----------------
S.pasta='';S.lixeira=false;S.pastas=[];
const kb=n=>{n=Number(n||0);return n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B';};
function trilha(){
  const partes=[];let id=S.pasta;
  while(id){const p=S.pastas.find(x=>x.id===id);if(!p)break;partes.unshift(p);id=p.parent_id;}
  return '<a href="#" onclick="return irPasta(\\'\\')">🏠 Início</a>'+partes.map(p=>' / <a href="#" onclick="return irPasta(\\''+p.id+'\\')">'+esc(p.nome)+'</a>').join('');
}
function irPasta(id){S.pasta=id;S.lixeira=false;vDocs();return false;}
async function vDocs(){
  const P=S.me.permissoes;
  const filtro=($('dq')&&$('dq').value)||'';
  const [ps,ds]=await Promise.all([api('GET','/pastas'),api('GET','/documentos?busca='+encodeURIComponent(filtro)+'&'+(S.lixeira?'status=lixeira':'pasta='+encodeURIComponent(S.pasta)))]);
  S.pastas=ps.pastas;S.tiposDoc=ds.tipos;
  const sub=S.lixeira?[]:S.pastas.filter(p=>p.parent_id===S.pasta);
  const docsL=ds.documentos;
  $('corpo').innerHTML='<h2>'+(S.lixeira?'🗑️ Lixeira':'Documentos')+'</h2>'+
   '<div class="card" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">'+
   '<div style="flex:1;min-width:220px;font-size:14px">'+(S.lixeira?'Documentos excluídos (restaure ou exclua definitivamente)':trilha())+'</div>'+
   '<input id="dq" placeholder="Buscar por nome…" value="'+esc(filtro)+'" style="max-width:200px" oninput="clearTimeout(S._t);S._t=setTimeout(vDocs,400)">'+
   (P.criar_pasta&&!S.lixeira?'<button class="btn btn-ghost peq" onclick="novaPasta()">📁 Nova pasta</button>':'')+
   (P.criar_documento&&!S.lixeira?'<button class="btn peq" onclick="$(\\'up-file\\').click()">⬆️ Enviar arquivos</button><input id="up-file" type="file" multiple style="display:none" onchange="enviarArquivos(this.files)">':'')+
   (P.excluir_documento||P.restaurar_documento?'<button class="btn btn-ghost peq" onclick="S.lixeira=!S.lixeira;vDocs()">'+(S.lixeira?'← Voltar aos documentos':'🗑️ Lixeira')+'</button>':'')+
   '</div><div id="up-out"></div>'+
   (sub.length?'<div class="card" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">'+sub.map(p=>'<button class="btn btn-ghost peq" onclick="irPasta(\\''+p.id+'\\')">📁 '+esc(p.nome)+'</button>'+(P.excluir_documento?'<button class="btn btn-ghost peq" title="Excluir pasta vazia" onclick="excluirPasta(\\''+p.id+'\\')">✕</button>':'')).join(''):'')+ (sub.length?'</div>':'')+
   '<div class="card" style="margin-top:12px"><table><tr><th>Documento</th><th>Tipo</th><th>Tags</th><th>Versão</th><th>Atualizado</th><th></th></tr>'+
   (docsL.length?docsL.map(d=>{
     return '<tr><td><a href="#" onclick="return abrirDoc(\\''+d.id+'\\')">'+esc(d.nome)+'</a>'+
     (d.fora_da_pasta?' <span class="chip" title="Encontrado pelo conteúdo em outra pasta">em outra pasta</span>':'')+
     (d.trecho?'<br><span style="font-size:12px;color:var(--suave)">…'+esc(d.trecho)+'…</span>':'')+'</td>'+
     '<td>'+esc(d.tipo_documental)+'</td><td>'+d.tags.map(t=>'<span class="chip">'+esc(t)+'</span>').join(' ')+'</td>'+
     '<td>v'+d.versao_atual+'</td><td>'+dt(d.atualizado_em||d.criado_em)+'</td><td>'+
     (S.lixeira?((P.restaurar_documento?'<button class="btn peq" onclick="docAcao(\\''+d.id+'\\',\\'restaurar\\')">Restaurar</button> ':'')+(P.excluir_documento?'<button class="btn btn-ghost peq" onclick="excluirDefinitivo(\\''+d.id+'\\')">Excluir de vez</button>':''))
      :((P.baixar_documento?'<a class="btn btn-ghost peq" href="/vdocs/api/documentos/'+d.id+'/baixar">⬇️</a> ':'')+(P.excluir_documento?'<button class="btn btn-ghost peq" onclick="docAcao(\\''+d.id+'\\',\\'lixeira\\')">🗑️</button>':'')))+'</td></tr>';
   }).join(''):'<tr><td colspan="6" style="color:var(--suave)">'+(S.lixeira?'Lixeira vazia.':'Nenhum documento nesta pasta ainda.')+'</td></tr>')+'</table></div>';
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
async function abrirDoc(id){
  const P=S.me.permissoes;
  const {documento:d,acessos,processamento:pr,aprovacoes:aps}=await api('GET','/documentos/'+id);
  const st=(pr&&pr.job&&pr.job.status)||'';
  const proc=pr&&pr.texto?'✅ Texto extraído ('+esc(pr.texto.metodo)+', '+pr.texto.chars.toLocaleString('pt-BR')+' caracteres'+(pr.texto.paginas?', '+pr.texto.paginas+' pág.':'')+') — este documento já aparece na busca por conteúdo.'
    :st==='ocr_pendente'?'🟡 Sem texto extraível (imagem/escaneado) — OCR chega em fase futura.'
    :st==='erro'?'🔴 Falha na extração: '+esc((pr.job&&pr.job.erro)||'')
    :st?'⏳ Extração de texto em processamento…':'';
  const selPasta='<select id="dd-pasta"><option value="">🏠 Início</option>'+S.pastas.map(p=>'<option value="'+p.id+'"'+(p.id===d.folder_id?' selected':'')+'>📁 '+esc(p.nome)+'</option>').join('')+'</select>';
  $('corpo').innerHTML='<p><a href="#" onclick="return irPasta(S.pasta)">← voltar</a></p><h2>'+esc(d.nome)+'</h2>'+
   '<p>'+(P.usar_ia?'<button class="btn btn-ghost peq" onclick="S.iaEscopo={tipo:\\'documento\\',ref:\\''+d.id+'\\'};S.iaConv=\\'\\';ir(\\'ia\\')">🤖 Perguntar à IA</button> ':'')+
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
  $('corpo').innerHTML='<h2>🔎 Busca avançada</h2>'+
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
  $('corpo').innerHTML='<h2>🔗 Compartilhamentos</h2>'+
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
   '<select id="rq-pasta" style="max-width:200px"><option value="">🏠 Início</option>'+(S.pastas||[]).map(p=>'<option value="'+p.id+'">📁 '+esc(p.nome)+'</option>').join('')+'</select>'+
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
  $('corpo').innerHTML='<h2>🔌 Integrações</h2>'+
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

// ---------------- Aprovações (Fase 6) ----------------
async function vWorkflows(){
  const P=S.me.permissoes;
  const [{pendentes,minhas},{modelos}]=await Promise.all([api('GET','/aprovacoes'),api('GET','/workflows')]);
  S.wfModelos=modelos;
  const linha=(a,acoes)=>'<tr'+(a.atrasada?' style="background:#fef7e0"':'')+'><td><a href="#" onclick="S.tela=\\'documentos\\';menu();abrirDoc(\\''+a.document_id+'\\');return false">'+esc(a.documento)+'</a> <span class="chip">v'+a.versao+'</span></td>'+
   '<td>'+esc(a.workflow_nome)+'</td><td>'+esc(a.etapa_nome)+' ('+(a.etapa_atual+1)+'/'+a.total_etapas+')</td>'+
   '<td>'+(a.prazo_em?(a.atrasada?'🔴 ':'')+dt(a.prazo_em):'—')+'</td><td>'+esc(a.status)+'</td><td>'+acoes+'</td></tr>';
  $('corpo').innerHTML='<h2>✅ Aprovações</h2>'+
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
  $('corpo').innerHTML='<h2>🤖 IA documental</h2>'+
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
  $('corpo').innerHTML='<h2>Configurações da empresa</h2><div class="card">'+
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
   (S.me.permissoes.exportar_dados?'<div class="card" style="margin-top:14px"><b>📦 Exportar todos os dados (LGPD)</b>'+
    '<p class="sub" style="font-size:13px">Baixa um ZIP com todos os dados da empresa (cadastros, documentos, auditoria) e os arquivos vigentes.</p>'+
    '<a class="btn btn-ghost peq" href="/vdocs/api/exportacao">⬇️ Baixar exportação completa</a></div>':'')+
   '<div class="card" style="margin-top:14px"><b>Identificador (slug):</b> <code>'+esc(t.slug)+'</code> · criado em '+dt(t.criado_em)+'</div>';
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
</script></body></html>`;
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
