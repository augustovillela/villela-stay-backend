// =====================================================================
// Villela CRM — páginas públicas + painel do assinante.
// Landing/preços/signup em /crm · painel em /crm/app (SPA app-cliente.js)
// · proposta pública em /crm/p/:token. Server-rendered, sem build.
// Identidade: sistema V-Portal do Grupo Villela Stay; acento CRM #BE123C.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const path = require('path');
const repo = require('./repo');
const appRepo = require('./app-repo');

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

const CSS = `:root{--villela-navy:#1B2A4A;--villela-navy2:#24365C;--villela-gold:#C9A227;--villela-ice:#F8F9FA;--villela-graphite:#1F2933;--acento:#BE123C;--acento2:#9F1239;--borda:#E2E6EC}
*{box-sizing:border-box}body{font-family:'Inter',system-ui,'Segoe UI',Arial,sans-serif;margin:0;color:var(--villela-graphite);background:var(--villela-ice)}
h1,h2,h3{font-family:'Lora',Georgia,serif}
a{color:var(--acento)}.wrap{max-width:1040px;margin:0 auto;padding:0 18px}
.hero{background:linear-gradient(135deg,var(--villela-navy),var(--villela-navy2));color:#f4f6f9;padding:64px 0 72px}
.hero h1{font-size:2.4rem;margin:.2rem 0;max-width:640px;line-height:1.15}.hero p{font-size:1.15rem;max-width:560px;color:#cfd8e6}
.badge{display:inline-block;background:var(--villela-gold);color:var(--villela-navy);font-weight:700;padding:4px 12px;border-radius:20px;font-size:.85rem}
.btn{display:inline-block;background:var(--acento);color:#fff;font-weight:700;border:0;border-radius:26px;padding:13px 28px;cursor:pointer;font-size:1rem;text-decoration:none}
.btn:hover{background:var(--acento2)}
.btn.g{background:#fff;color:var(--acento)}.btn.g:hover{background:#fdeef1}.btn.o{background:transparent;border:2px solid #f4f6f9;color:#f4f6f9}.btn.o:hover{background:rgba(255,255,255,.12)}
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
.tag{display:inline-block;background:#fbe7ec;color:var(--acento2);border-radius:12px;padding:2px 10px;font-size:.8rem}
.marca{display:inline-flex;align-items:center;gap:10px}.marca img{height:32px}
.marca .m1{font-family:'Lora',Georgia,serif;font-weight:700;font-size:1.3rem;color:var(--villela-navy)}
.marca .m2{font-family:'Inter',system-ui,sans-serif;font-weight:600;font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;color:var(--acento)}
.marca.neg .m1{color:#fff}.marca.neg .m2{color:#FDA4AF}
header.top{background:var(--villela-navy2);color:#fff}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding-top:18px;padding-bottom:18px}
header.top a{color:#E8ECF4;text-decoration:none}
header.top nav{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
header.top .marca img{height:56px}
@media(max-width:640px){.hero h1{font-size:1.8rem}header.top .esconde{display:none}}`;

const BRAND = '/assets/brand/villela-crm';
const HEAD_MARCA = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="icon" type="image/svg+xml" href="${BRAND}/favicon.svg"><meta name="theme-color" content="#1B2A4A">`;
// GA4 do grupo — só páginas públicas.
const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-5L2YQ2BPQW"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-5L2YQ2BPQW');</script>`;
const marca = (neg) => `<span class="marca${neg ? ' neg' : ''}"><img src="${BRAND}/${neg ? 'logo-negativo.svg' : 'simbolo-v.svg'}" alt="Villela CRM"><span><span class="m1">Villela</span> <span class="m2">CRM</span></span></span>`;

function landingHTML() {
  const planos = repo.Planos.listar();
  const nomeLimite = (p, k, rot) => { const v = p.limites[k]; return `${v ? v.toLocaleString('pt-BR') : 'Ilimitados'} ${rot}`; };
  const cardPlano = (p) => {
    const dest = p.slug === 'professional';
    const preco = p.preco_centavos ? `${brl(p.preco_centavos)}<small>/mês</small>` : (p.slug === 'trial' ? 'Grátis' : 'Sob consulta');
    const itens = p.slug === 'trial'
      ? ['Todos os módulos por 14 dias', `${p.limites.contatos} contatos`, `${p.limites.usuarios} usuários`, 'Sem cartão']
      : [nomeLimite(p, 'contatos', 'contatos'), nomeLimite(p, 'usuarios', 'usuários'),
         p.limites.funis ? `${p.limites.funis} funil(is)` : 'Funis ilimitados',
         `${p.modulos.length} módulos${p.flags.ia ? ' · IA' : ''}${p.flags.api_publica ? ' · API' : ''}${p.flags.white_label ? ' · white label' : ''}`];
    const cta = p.slug === 'enterprise'
      ? `<a class="btn g" href="#contato">Falar com vendas</a>`
      : `<a class="btn" href="/crm/assinar?plano=${p.slug}">${p.slug === 'trial' ? 'Testar grátis' : 'Assinar'}</a>`;
    return `<div class="plano ${dest ? 'dest' : ''}">${dest ? '<span class="badge">Mais popular</span>' : ''}
      <h3>${esc(p.nome)}</h3><div class="preco">${preco}</div><p class="sub" style="text-align:left;margin:8px 0 0">${esc(p.descricao)}</p>
      <ul>${itens.map(i => `<li>✓ ${esc(i)}</li>`).join('')}</ul>${cta}</div>`;
  };
  const feats = [
    ['🎯', 'Nenhum lead esquecido', 'Todo contato entra com origem, campanha e UTM registrados. A caixa "precisa de ação hoje" mostra exatamente quem atender.'],
    ['📊', 'Kanban de verdade', 'Funis configuráveis por vertical (hospedagem, eventos, SaaS, educação) com arrastar-e-soltar, valor por etapa e alerta de atraso.'],
    ['🔥', 'Lead scoring automático', 'Cada lead ganha nota de 0 a 100 pelo comportamento: respondeu, abriu proposta, veio de indicação. Atenda os quentes primeiro.'],
    ['📨', 'Multicanal sem fricção', 'WhatsApp, e-mail e ligação a 1 clique da ficha, com templates prontos e variáveis. Tudo registrado na timeline.'],
    ['📄', 'Propostas com link', 'Envie propostas com link público: você sabe quando o cliente visualizou, e ele aceita ou recusa por lá.'],
    ['🤖', 'Agentes inteligentes', 'Qualificação, follow-up, reativação e análise de perdas — sempre como sugestão, com você no controle.'],
  ];
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Villela CRM — CRM inteligente multicanal para vender mais</title>
    <meta name="description" content="CRM inteligente multicanal: leads com origem e UTM, funis Kanban, follow-ups automáticos, lead scoring, propostas com link, campanhas e agentes de IA. Teste grátis 14 dias.">
    <meta property="og:title" content="Villela CRM — CRM inteligente multicanal">
    <meta property="og:description" content="Capte, organize, converta: funis Kanban, follow-up automático, scoring, propostas e campanhas em um só lugar. Teste grátis por 14 dias.">
    <meta property="og:type" content="website">
    ${HEAD_MARCA}${GA}
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Villela CRM","applicationCategory":"BusinessApplication","operatingSystem":"Web","description":"CRM inteligente multicanal: leads, funis, follow-ups, scoring, propostas, campanhas e agentes de IA.","offers":{"@type":"Offer","price":"79.00","priceCurrency":"BRL"},"publisher":{"@type":"Organization","name":"Grupo Villela Stay"}}</script>
    <style>${CSS}</style></head><body>
    <header class="top"><div class="wrap">
      <a href="/crm" style="text-decoration:none">${marca(true)}</a>
      <nav><a class="esconde" href="/crm#recursos">Recursos</a><a class="esconde" href="/crm#planos">Planos</a><a href="/crm/app">Entrar</a> <a class="btn" style="padding:9px 16px;background:var(--villela-gold);color:var(--villela-navy)!important" href="/crm/assinar?plano=trial">Teste grátis</a></nav>
    </div></header>
    <div class="hero"><div class="wrap">
      <span class="badge">CRM inteligente multicanal</span>
      <h1>Pare de perder leads. Comece a fechar mais.</h1>
      <p>Captação com origem e UTM, funis Kanban, follow-up que se cobra sozinho, propostas com link rastreável e agentes de IA — para times comerciais brasileiros.</p>
      <p style="margin-top:26px"><a class="btn" href="/crm/assinar?plano=trial">Testar 14 dias grátis</a>
      &nbsp;<a class="btn o" href="/crm/app">Já sou cliente</a></p>
      <p style="font-size:.95rem;margin-top:18px;color:#cfd8e6"><span style="color:var(--villela-gold)">★</span> Usado todos os dias pela operação real do Grupo Villela Stay</p>
    </div></div>
    <div class="sec" id="recursos"><div class="wrap"><h2>Do primeiro clique ao pós-venda</h2>
      <p class="sub">Não é um cadastro de contatos. É um centro de captação, conversão e relacionamento.</p>
      <div class="grid">${feats.map(([i, t, d]) => `<div class="card feat"><div class="i">${i}</div><div><b>${esc(t)}</b><br><span class="sub" style="text-align:left;margin:0">${esc(d)}</span></div></div>`).join('')}</div>
    </div></div>
    <div class="sec"><div class="wrap"><h2>Feito para o seu funil</h2>
      <p class="sub">Cinco funis prontos no primeiro acesso — e você cria os seus.</p>
      <div class="grid">
        <div class="card feat"><div class="i">🏠</div><div><b>Hospedagem</b><br><span class="sub" style="text-align:left;margin:0">Do interessado ao pós-check-out com pedido de avaliação e recompra.</span></div></div>
        <div class="card feat"><div class="i">🎉</div><div><b>Eventos</b><br><span class="sub" style="text-align:left;margin:0">Orçamento, visita, contrato, sinal e pós-evento.</span></div></div>
        <div class="card feat"><div class="i">💻</div><div><b>SaaS e B2B</b><br><span class="sub" style="text-align:left;margin:0">Demo, trial, ativação, churn e recuperação.</span></div></div>
        <div class="card feat"><div class="i">🎓</div><div><b>Educacional</b><br><span class="sub" style="text-align:left;margin:0">Interessado, oferta, carrinho, aluno ativo e upsell.</span></div></div>
      </div>
      <p class="sub" style="margin-top:26px">🔒 Conexão segura (HTTPS) &nbsp;·&nbsp; 🛡️ LGPD: consentimento, opt-out e exclusão definitiva &nbsp;·&nbsp; 💳 Pagamentos pelo Mercado Pago</p>
    </div></div>
    <div class="sec" id="planos" style="background:#EDF1F5"><div class="wrap"><h2>Planos</h2>
      <p class="sub">Preços de lançamento, ajustáveis. Comece no trial e evolua quando quiser.</p>
      <div class="planos">${planos.map(cardPlano).join('')}</div>
      <p class="sub" style="margin-top:24px">Sugestões de IA são sempre sugestões — nenhuma mensagem sai sem a sua aprovação.</p>
    </div></div>
    <div class="sec" id="contato"><div class="wrap"><h2>Fale com a gente</h2>
      <p class="sub">Enterprise, migração de outro CRM ou dúvidas — deixe seu contato.</p>
      <form class="form" id="lead">
        <input id="l-nome" placeholder="Seu nome" required><input id="l-emp" placeholder="Empresa">
        <input id="l-email" type="email" placeholder="E-mail" required><input id="l-tel" placeholder="Telefone/WhatsApp">
        <textarea id="l-msg" rows="3" placeholder="Quantos leads/mês você recebe? Como podemos ajudar?"></textarea>
        <button class="btn" type="submit">Enviar</button><p id="l-msg2" class="sub" style="margin:8px 0 0"></p>
      </form></div></div>
    <footer>Villela CRM · CRM inteligente multicanal · <a href="/crm/app" style="color:var(--villela-gold)">Painel do cliente</a> · <a href="/crm/ajuda" style="color:var(--villela-gold)">Ajuda</a>
      <br><span style="opacity:.8">Uma empresa do Grupo Villela Stay · CNPJ 56.776.526/0001-12</span>
      <script>document.getElementById('lead').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('l-msg2');
        const r=await fetch('/crm/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          nome:l_nome.value,empresa:l_emp.value,email:l_email.value,telefone:l_tel.value,mensagem:l_msg.value})});
        m.textContent=r.ok?'✅ Recebido! Entraremos em contato.':'Erro ao enviar.';if(r.ok)document.getElementById('lead').reset();};
      </script></footer></body></html>`;
}

function shell(corpo, script, titulo = 'Villela CRM — Painel') {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>${esc(titulo)}</title>${HEAD_MARCA}<style>${CSS}
    .cx{max-width:720px;margin:24px auto;padding:0 14px}.erro{color:#b00020}
    .aviso{background:#fdf6e3;border:1px solid #ecd9a0;border-radius:9px;padding:10px 14px;font-size:.9rem}</style></head><body><div class="cx">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 16px">${marca(false)}</div>${corpo}</div><script>${script || ''}</script></body></html>`;
}

function assinarHTML(planoSlug) {
  const p = repo.Planos.porSlug(planoSlug) || repo.Planos.porSlug('trial');
  const preco = p.preco_centavos ? `${brl(p.preco_centavos)}/mês` : (p.slug === 'trial' ? '14 dias grátis, sem cartão' : 'Sob consulta');
  return shell(`<div class="card"><h3>Criar conta — plano ${esc(p.nome)}</h3><p class="tag">${esc(preco)}</p>
    <form class="form" id="su" style="margin-top:12px">
      <input id="s-emp" placeholder="Nome da empresa *" required>
      <input id="s-nome" placeholder="Seu nome (responsável) *" required>
      <input id="s-email" type="email" placeholder="E-mail de acesso *" required>
      <input id="s-cnpj" placeholder="CNPJ (opcional)"><input id="s-site" placeholder="Site (opcional)">
      <input id="s-tel" placeholder="Telefone/WhatsApp">
      <button class="btn" type="submit">Criar conta e começar</button><p id="s-msg" class="erro"></p>
    </form>
    <p class="sub" style="margin-top:10px">Ao criar, você recebe por e-mail o link para definir a senha. ${p.slug !== 'trial' && p.preco_centavos ? 'A cobrança é ativada no painel após o acesso.' : ''}</p></div>`,
    `document.getElementById('su').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('s-msg');m.textContent='';
      const r=await fetch('/crm/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        nome:s_emp.value,nome_responsavel:s_nome.value,email:s_email.value,cnpj:s_cnpj.value,site:s_site.value,telefone:s_tel.value,plano:'${p.slug}'})});
      const d=await r.json();if(!r.ok){m.textContent=d.erro||'Erro';return}
      document.querySelector('.cx').innerHTML='<div class="card"><h3>✅ Conta criada!</h3><p>Enviamos para <b>'+d.email+'</b> o link para definir a senha e acessar o painel.</p>'
        +(d.link_setup?'<p class="aviso">Link de acesso (defina sua senha): <a href="'+d.link_setup+'">'+d.link_setup+'</a></p>':'')
        +'<p><a class="btn" href="/crm/app">Ir para o painel</a></p></div>';};`);
}

// Painel do assinante (SPA carregada de /crm/app.js)
function appHTML() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Villela CRM — Painel</title>${HEAD_MARCA}<style>${CSS}
    .cx{max-width:1160px;margin:20px auto;padding:0 14px}
    .menu{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px}
    .kpi{background:#fff;border:1px solid var(--borda);border-radius:10px;padding:10px 16px;min-width:118px}
    .kpi .n{font-size:1.4rem;font-weight:800;color:var(--villela-navy)}.kpi .r{font-size:.78rem;color:#5b6b70}
    .aviso{background:#fdf6e3;border:1px solid #ecd9a0;border-radius:9px;padding:10px 14px;font-size:.9rem;margin:.4rem 0}
    .erro{color:#b00020}.btn.peq{padding:6px 14px;font-size:.85rem}.btn.secund{background:#fbe7ec;color:var(--acento2)}.btn.secund:hover{background:#f7d5de}
    .hi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
    label{font-size:.85rem;font-weight:600;display:block}
    table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--borda)}
    th{color:#5b6b70;font-weight:600}.chip,.tag{display:inline-block;background:#fbe7ec;color:var(--acento2);border-radius:12px;padding:2px 9px;font-size:.78rem}
    .chip.frio{background:#e8eef4;color:#3b556e}.chip.morno{background:#fdf1dc;color:#92610a}.chip.quente{background:#fde3d2;color:#b4470b}.chip.muito-quente{background:#fbdada;color:#a31212}
    .kanban{display:flex;gap:10px;overflow-x:auto;padding-bottom:10px}
    .kcol{min-width:230px;max-width:250px;background:#EDF1F5;border-radius:12px;padding:8px;flex-shrink:0}
    .kcol h4{margin:4px 6px 8px;font-size:.85rem;color:var(--villela-navy);display:flex;justify-content:space-between;font-family:'Inter',sans-serif}
    .kard{background:#fff;border:1px solid var(--borda);border-radius:9px;padding:9px 10px;margin-bottom:8px;cursor:grab;font-size:.85rem}
    .kard.atrasada{border-left:3px solid #b00020}.kard b{display:block}
    .kard .meta{color:#5b6b70;font-size:.78rem;margin-top:3px}
    .kcol.sobre{outline:2px dashed var(--acento)}
    .lin{border-bottom:1px solid #eee;padding:8px 0}
    .duas{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:820px){.duas{grid-template-columns:1fr}}
    dialog{border:1px solid var(--borda);border-radius:14px;max-width:560px;width:92%;padding:20px}
    dialog::backdrop{background:rgba(27,42,74,.45)}
    </style></head><body><div class="cx">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 16px">${marca(false)}<span class="tag">painel comercial</span></div>
    <div id="app"><p class="sub">Carregando…</p></div></div>
    <script src="/crm/app.js"></script><script>bootCRM();</script></body></html>`;
}

// proposta pública /crm/p/:token
function propostaHTML(token) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Proposta comercial</title>${HEAD_MARCA}<style>${CSS}
    .cx{max-width:680px;margin:26px auto;padding:0 14px}.erro{color:#b00020}
    .tot{font-size:1.6rem;font-weight:800;color:var(--villela-navy)}</style></head><body><div class="cx">
    <div id="p"><p class="sub">Carregando proposta…</p></div></div>
    <script>
    (async()=>{
      const cx=document.getElementById('p');
      const r=await fetch('/crm/api/p/${encodeURIComponent(s(token, 60))}');
      if(!r.ok){cx.innerHTML='<p class="erro">Proposta não encontrada ou expirada.</p>';return}
      const {proposta:p}=await r.json();
      const brl=c=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
      const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
      const itens=(p.itens||[]).map(i=>'<tr><td>'+esc(i.descricao)+'</td><td style="text-align:center">'+i.qtd+'</td><td style="text-align:right">'+brl(i.valor_centavos*i.qtd)+'</td></tr>').join('');
      const liquido=p.valor_centavos-(p.desconto_centavos||0);
      cx.innerHTML='<div class="card"><p class="tag">'+esc(p.empresa)+'</p><h2 style="text-align:left">'+esc(p.titulo)+'</h2>'
        +'<p>Para: <b>'+esc(p.cliente)+'</b>'+(p.validade?' · válida até <b>'+p.validade+'</b>':'')+'</p>'
        +(itens?'<table style="width:100%;border-collapse:collapse">'+itens+'</table>':'')
        +(p.desconto_centavos?'<p>Desconto: −'+brl(p.desconto_centavos)+'</p>':'')
        +'<p class="tot">Total: '+brl(liquido)+'</p>'
        +(p.condicoes?'<p class="sub" style="text-align:left">'+esc(p.condicoes)+'</p>':'')
        +(p.status==='aceita'?'<p class="aviso">✅ Proposta aceita. Obrigado!':p.status==='recusada'?'<p class="aviso">Proposta recusada.</p>':
          '<p style="margin-top:16px"><button class="btn" id="ac">✅ Aceitar proposta</button> <button class="btn g" id="rc" style="border:1px solid var(--borda)">Recusar</button></p>')
        +(p.link_pagamento?'<p><a class="btn" style="background:var(--villela-gold);color:var(--villela-navy)" href="'+esc(p.link_pagamento)+'">💳 Ir para o pagamento</a></p>':'')
        +(p.link_reserva?'<p><a href="'+esc(p.link_reserva)+'">Link da reserva</a></p>':'')+'</div>';
      const resp=async(a)=>{await fetch('/crm/api/p/${encodeURIComponent(s(token, 60))}/responder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({aceite:a})});location.reload()};
      const ac=document.getElementById('ac'),rc=document.getElementById('rc');
      if(ac)ac.onclick=()=>resp(true);if(rc)rc.onclick=()=>{if(confirm('Recusar esta proposta?'))resp(false)};
    })();
    </script></body></html>`;
}

function registrarPaginas(app, { jwtSecret, enviarEmail, notificar }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  app.get('/crm', (req, res) => res.send(landingHTML()));
  app.get('/crm/assinar', (req, res) => res.send(assinarHTML(s(req.query.plano, 60))));
  app.get('/crm/app', (req, res) => res.send(appHTML()));
  app.get('/crm/app.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-cliente.js')));
  app.get('/crm/p/:token', (req, res) => res.send(propostaHTML(req.params.token)));
  app.get('/crm/definir-senha', (req, res) => res.send(shell(
    `<div class="card"><h3>Defina sua senha</h3><input id="s1" type="password" placeholder="Nova senha (8+)"><input id="s2" type="password" placeholder="Confirme"><button class="btn" onclick="salvar()">Salvar</button><p id="m" class="erro"></p></div>`,
    `async function salvar(){const m=document.getElementById('m');m.textContent='';if(s1.value!==s2.value){m.textContent='As senhas não conferem.';return}
      const r=await fetch('/crm/api/definir-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:new URLSearchParams(location.search).get('token'),senha:s1.value})});
      const d=await r.json();if(!r.ok){m.textContent=d.erro;return}location.href='/crm/app';}`)));

  // lead da landing
  app.post('/crm/api/lead', h(async (req, res) => {
    const id = repo.SaasLeads.criar(req.body || {});
    if (notificar) notificar(`📩 Villela CRM: novo lead — ${s((req.body || {}).nome, 60)} (${s((req.body || {}).empresa, 60)}).`).catch(() => {});
    res.json({ ok: true, id });
  }));

  // signup público (cria empresa trial + owner + link de definição de senha)
  app.post('/crm/api/signup', h(async (req, res) => {
    const d = req.body || {};
    const email = s(d.email, 120).toLowerCase();
    if (require('./db').db.prepare('SELECT 1 FROM tenant_users WHERE lower(email) = ?').get(email)) {
      return res.status(400).json({ erro: 'Já existe uma conta com este e-mail. Acesse o painel.' });
    }
    const t = repo.Tenants.criar({ ...d, email_contato: email, origem: 'landing' }, 'signup');
    const owner = t.usuarios[0];
    const token = jwt.sign({ tipo: 'crm-setup', uid: owner.id }, jwtSecret, { expiresIn: '7d' });
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const link = `${proto}://${req.get('host')}/crm/definir-senha?token=${token}`;
    if (enviarEmail) {
      enviarEmail(email, 'Villela CRM — acesse sua conta', `<p>Olá! Sua conta <b>${esc(t.nome)}</b> foi criada.</p><p>Defina sua senha e acesse: <a href="${link}">${link}</a></p><p>Você está no plano <b>${esc(t.plano ? t.plano.nome : '')}</b>.</p>`).catch(() => {});
    }
    if (notificar) notificar(`🎉 Villela CRM: nova empresa — ${t.nome} (${email}).`).catch(() => {});
    res.json({ ok: true, tenant_id: t.id, email, link_setup: process.env.NODE_ENV === 'development' ? link : undefined });
  }));
}

module.exports = { registrarPaginas, landingHTML, appHTML, assinarHTML, propostaHTML };
