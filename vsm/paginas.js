// =====================================================================
// Villela Stay Manager (VSM) — páginas públicas + painel do assinante.
// Landing/preços/signup em /gestao ; painel do assinante em /gestao/app
// (usa a API de rotas-cliente.js). Server-rendered, autocontido, sem build.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

const CSS = `*{box-sizing:border-box}body{font-family:system-ui,'Segoe UI',Arial,sans-serif;margin:0;color:#1e2b30;background:#f7f5ef}
a{color:#0c3644}.wrap{max-width:1040px;margin:0 auto;padding:0 18px}
.hero{background:linear-gradient(135deg,#0c3644,#12525f);color:#f2ecd8;padding:64px 0 72px}
.hero h1{font-size:2.4rem;margin:.2rem 0;max-width:640px;line-height:1.15}.hero p{font-size:1.15rem;max-width:560px;color:#d7e2e5}
.badge{display:inline-block;background:#d9a441;color:#0c3644;font-weight:700;padding:4px 12px;border-radius:20px;font-size:.85rem}
.btn{display:inline-block;background:#d9a441;color:#0c3644;font-weight:700;border:0;border-radius:26px;padding:13px 28px;cursor:pointer;font-size:1rem;text-decoration:none}
.btn.g{background:#fff;color:#0c3644}.btn.o{background:transparent;border:2px solid #f2ecd8;color:#f2ecd8}
.sec{padding:56px 0}.sec h2{font-size:1.7rem;color:#0c3644;text-align:center;margin-bottom:8px}
.sub{text-align:center;color:#5b6b70;max-width:620px;margin:0 auto 34px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}
.card{background:#fff;border:1px solid #e7e1d4;border-radius:14px;padding:22px}
.feat{display:flex;gap:12px;align-items:flex-start}.feat .i{font-size:1.5rem}
.planos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;align-items:stretch}
.plano{background:#fff;border:1px solid #e7e1d4;border-radius:16px;padding:24px;display:flex;flex-direction:column}
.plano.dest{border:2px solid #d9a441;box-shadow:0 10px 30px rgba(12,54,68,.12)}
.plano h3{margin:.2rem 0;color:#0c3644}.preco{font-size:2rem;font-weight:800;color:#0c3644}.preco small{font-size:.9rem;font-weight:400;color:#7a8890}
.plano ul{list-style:none;padding:0;margin:16px 0;flex:1}.plano li{padding:5px 0;border-bottom:1px solid #f0ece2;font-size:.92rem}
footer{background:#0c3644;color:#c7d3d6;padding:30px 0;text-align:center;font-size:.9rem}
input,select,textarea{width:100%;padding:11px;border:1px solid #ccc;border-radius:9px;font:inherit;margin:5px 0 12px}
.form{max-width:460px;margin:0 auto;background:#fff;padding:26px;border-radius:14px;border:1px solid #e7e1d4}
.tag{display:inline-block;background:#eef3f4;color:#0c3644;border-radius:12px;padding:2px 10px;font-size:.8rem}
@media(max-width:640px){.hero h1{font-size:1.8rem}}`;

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
    ['🤖', 'IA e concierge', 'Assistente que responde hóspedes, sugere preços e monta relatórios — sempre com você no controle.'],
  ];
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Villela Stay Manager — sistema de gestão para aluguel por temporada</title>
    <meta name="description" content="Gestão de imóveis, reservas, canais/OTAs, limpeza, financeiro e IA para anfitriões e gestores de aluguel por temporada. Teste grátis por 14 dias.">
    <style>${CSS}</style></head><body>
    <div class="hero"><div class="wrap">
      <span class="badge">Sistema de gestão de hospedagem</span>
      <h1>Toda a sua operação de temporada em um só lugar.</h1>
      <p>Imóveis, reservas, canais, limpeza, financeiro e IA. Feito por quem opera aluguel por temporada — para anfitriões e gestores brasileiros.</p>
      <p style="margin-top:26px"><a class="btn" href="/gestao/assinar?plano=trial">Testar 14 dias grátis</a>
      &nbsp;<a class="btn o" href="/gestao/app">Já sou cliente</a></p>
    </div></div>
    <div class="sec"><div class="wrap"><h2>Tudo que a sua operação precisa</h2>
      <p class="sub">Do anúncio ao repasse do proprietário — sem colar planilha com WhatsApp e calendário de OTA.</p>
      <div class="grid">${feats.map(([i, t, d]) => `<div class="card feat"><div class="i">${i}</div><div><b>${esc(t)}</b><br><span class="sub" style="text-align:left;margin:0">${esc(d)}</span></div></div>`).join('')}</div>
    </div></div>
    <div class="sec" id="planos" style="background:#efeae0"><div class="wrap"><h2>Planos</h2>
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
    <footer>Villela Stay Manager — produto da Villela Stay · <a href="/gestao/app" style="color:#d9a441">Painel do cliente</a>
      <script>document.getElementById('lead').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('l-msg2');
        const r=await fetch('/gestao/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          nome:l_nome.value,empresa:l_esc.value,email:l_email.value,telefone:l_tel.value,mensagem:l_msg.value})});
        m.textContent=r.ok?'✅ Recebido! Entraremos em contato.':'Erro ao enviar.';if(r.ok)document.getElementById('lead').reset();};
      </script></footer></body></html>`;
}

function shell(corpo, script) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Villela Stay Manager — Painel</title><style>${CSS}
    .cx{max-width:720px;margin:24px auto;padding:0 14px}.lin{border-bottom:1px solid #eee;padding:8px 0}
    .menu{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.menu button{flex:1;min-width:96px}
    .kpi{display:inline-block;background:#fff;border:1px solid #e7e1d4;border-radius:10px;padding:10px 16px;margin:4px}
    .aviso{background:#fdf6e3;border:1px solid #ecd9a0;border-radius:9px;padding:10px 14px;font-size:.9rem}
    .erro{color:#b00020}</style></head><body><div class="cx">
    <h2 style="color:#0c3644">🏨 Villela Stay Manager <span class="tag">painel da operação</span></h2>${corpo}</div><script>${script}</script></body></html>`;
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

function appHTML() {
  return shell(`<div id="app"><div class="card"><h3>Entrar</h3>
    <input id="em" type="email" placeholder="E-mail"><input id="sn" type="password" placeholder="Senha">
    <button class="btn" onclick="entrar()">Entrar</button><p id="msg" class="erro"></p>
    <p class="sub">Novo por aqui? <a href="/gestao/assinar?plano=trial">Teste grátis</a>.</p></div></div>`,
    `const app=document.getElementById('app');
    const api=async(m,p,b)=>{const r=await fetch('/gestao/api'+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const d=await r.json();if(!r.ok)throw new Error(d.erro||'erro');return d};
    const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const brl=c=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
    const dt=t=>t?String(t).slice(0,10).split('-').reverse().join('/'):'—';
    async function entrar(){const m=document.getElementById('msg');m.textContent='';try{await api('POST','/login',{email:em.value,senha:sn.value});home()}catch(e){m.textContent=e.message}}
    window.entrar=entrar;
    async function home(){let me;try{me=await api('GET','/me')}catch(_){return}
      const ent=me.entitlements;
      const alerta=me.operacao.status!=='ativa'&&me.operacao.status!=='trial'?'<div class="aviso">⚠️ Sua conta está <b>'+esc(me.operacao.status)+'</b>. Regularize a cobrança para reativar o acesso.</div>':(me.operacao.status==='trial'?'<div class="aviso">🎁 Você está no <b>período de teste</b> até '+dt(ent.trial_expira_em)+'. Assine para continuar sem interrupção.</div>':'');
      app.innerHTML='<div class="card"><h3>'+esc(me.operacao.nome)+' <span class="tag">'+esc(ent.plano||'—')+'</span></h3>'+alerta
        +'<div class="menu"><button class="btn g" onclick="vPlano()">💳 Plano</button><button class="btn g" onclick="vUso()">📊 Uso</button><button class="btn g" onclick="vSup()">🎧 Suporte</button></div>'
        +'<p class="sub">Olá, '+esc(me.usuario.nome||me.usuario.email)+' · <a href="#" onclick="sair();return false">sair</a></p></div><div id="c"></div>';
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
    home();`);
}

function registrarPaginas(app, { jwtSecret, enviarEmail, notificar }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  app.get('/gestao', (req, res) => res.send(landingHTML()));
  app.get('/gestao/assinar', (req, res) => res.send(assinarHTML(s(req.query.plano, 60))));
  app.get('/gestao/app', (req, res) => res.send(appHTML()));
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
