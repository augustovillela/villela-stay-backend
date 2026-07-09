// =====================================================================
// Villela Academy Marketplace — páginas públicas + shell do app.
// Landing em /academy ; app (login + dashboards por papel) em /academy/app.
// Server-rendered, autocontido, sem build. Identidade visual própria
// (nada copiado de plataformas existentes).
// =====================================================================
'use strict';
const path = require('path');
const repo = require('./repo');

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

const CSS = `*{box-sizing:border-box}body{font-family:system-ui,'Segoe UI',Arial,sans-serif;margin:0;color:#241f33;background:#faf8fc}
a{color:#4a2fbd}.wrap{max-width:1040px;margin:0 auto;padding:0 18px}
.hero{background:linear-gradient(140deg,#1d1440,#4a2fbd);color:#f4f0ff;padding:64px 0 72px}
.hero h1{font-size:2.4rem;margin:.2rem 0;max-width:660px;line-height:1.15}.hero p{font-size:1.15rem;max-width:580px;color:#d9d2f2}
.badge{display:inline-block;background:#ffb84d;color:#1d1440;font-weight:700;padding:4px 12px;border-radius:20px;font-size:.85rem}
.btn{display:inline-block;background:#ffb84d;color:#1d1440;font-weight:700;border:0;border-radius:26px;padding:13px 28px;cursor:pointer;font-size:1rem;text-decoration:none}
.btn.g{background:#fff;color:#1d1440}.btn.o{background:transparent;border:2px solid #f4f0ff;color:#f4f0ff}
.btn.peq{padding:6px 14px;font-size:.85rem}.btn.secund{background:#efe9fb;color:#1d1440}
.sec{padding:56px 0}.sec h2{font-size:1.7rem;color:#1d1440;text-align:center;margin-bottom:8px}
.sub{text-align:center;color:#6b6480;max-width:640px;margin:0 auto 34px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}
.card{background:#fff;border:1px solid #e8e2f4;border-radius:14px;padding:22px}
.feat{display:flex;gap:12px;align-items:flex-start}.feat .i{font-size:1.5rem}
footer{background:#1d1440;color:#c9c2e0;padding:30px 0;text-align:center;font-size:.9rem}footer a{color:#ffb84d}
input,select,textarea{width:100%;padding:11px;border:1px solid #ccc;border-radius:9px;font:inherit;margin:5px 0 12px}
.form{max-width:460px;margin:0 auto;background:#fff;padding:26px;border-radius:14px;border:1px solid #e8e2f4}
.tag{display:inline-block;background:#efe9fb;color:#1d1440;border-radius:12px;padding:2px 10px;font-size:.8rem}
.aviso{background:#fff7e8;border:1px solid #f0d9a6;border-radius:9px;padding:10px 14px;font-size:.9rem;margin:.4rem 0}
.erro{color:#b00020}
@media(max-width:640px){.hero h1{font-size:1.8rem}}`;

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
    <style>${CSS}</style></head><body>
    <div class="hero"><div class="wrap">
      <span class="badge">Villela Academy</span>
      <h1>Ensine, aprenda e venda conhecimento em um só lugar.</h1>
      <p>Marketplace de cursos online e produtos digitais: produtores publicam, afiliados divulgam, alunos aprendem — com checkout nacional e área de membros.</p>
      <p style="margin-top:26px"><a class="btn" href="/academy/app#cadastro">Criar conta grátis</a>
      &nbsp;<a class="btn o" href="/academy/app">Entrar</a></p>
    </div></div>
    <div class="sec"><div class="wrap"><h2>Feita para os três lados do balcão</h2>
      <p class="sub">Aluno, produtor e afiliado com painéis próprios — e a plataforma cuidando de pagamento, entrega e segurança.</p>
      <div class="grid">${feats.map(([i, t, d]) => `<div class="card feat"><div class="i">${i}</div><div><b>${esc(t)}</b><br><span class="sub" style="text-align:left;margin:0">${esc(d)}</span></div></div>`).join('')}</div>
    </div></div>
    <div class="sec" id="produtores" style="background:#f1ecfa"><div class="wrap"><h2>Quer vender seu curso aqui?</h2>
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
    <footer>Villela Academy — produto da Villela Stay (Augusto Villela Ltda) ·
      <a href="/academy/termos">Termos</a> · <a href="/academy/privacidade">Privacidade</a> · <a href="/academy/app">Entrar</a>
      <script>document.getElementById('lead').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('l-msg2');
        const r=await fetch('/academy/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          nome:l_nome.value,email:l_email.value,telefone:l_tel.value,interesse:l_int.value,mensagem:l_msg.value})});
        m.textContent=r.ok?'✅ Recebido! Entraremos em contato.':'Erro ao enviar.';if(r.ok)document.getElementById('lead').reset();};
      </script></footer></body></html>`;
}

function appHTML() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Villela Academy — Painel</title><style>${CSS}
    .cx{max-width:1040px;margin:20px auto;padding:0 14px}.lin{border-bottom:1px solid #eee;padding:8px 0}
    .menu{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px}
    .kpi{background:#fff;border:1px solid #e8e2f4;border-radius:10px;padding:10px 16px;min-width:120px;display:inline-block;margin:4px}
    .kpi b{display:block;font-size:1.3rem;color:#1d1440}
    label{font-size:.85rem;font-weight:600;display:block}
    table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #f0ece2}
    th{color:#6b6480;font-weight:600}.chip{display:inline-block;background:#efe9fb;color:#1d1440;border-radius:12px;padding:2px 9px;font-size:.78rem}
    </style></head><body><div class="cx">
    <h2 style="color:#1d1440">🎓 Villela Academy <span class="tag">painel</span></h2>
    <div id="app"><p class="sub">Carregando…</p></div></div>
    <script src="/academy/app.js"></script><script>bootAcademy();</script></body></html>`;
}

// Termos/privacidade: MINUTA — precisa de revisão por advogado (OAB) antes
// de a plataforma operar comercialmente. O texto deixa isso explícito.
function paginaLegal(titulo, corpo) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(titulo)} — Villela Academy</title><style>${CSS} .doc{max-width:760px;margin:32px auto;padding:0 18px;line-height:1.6}</style></head>
    <body><div class="doc"><p><a href="/academy">← Villela Academy</a></p>
    <div class="aviso"><b>MINUTA</b> — documento em elaboração, sujeito a revisão jurídica (advogado OAB) antes da operação comercial.</div>
    <h1 style="color:#1d1440">${esc(titulo)}</h1>${corpo}
    <p class="sub" style="text-align:left">Villela Academy é um produto da Augusto Villela Ltda (CNPJ 56.776.526/0001-12).</p>
    </div></body></html>`;
}
const TERMOS = `<p>Estes Termos de Uso regem o acesso à plataforma Villela Academy por alunos, produtores e afiliados.</p>
  <ul><li>A conta é pessoal e intransferível; você responde pelo que fizer com ela.</li>
  <li>Produtores respondem pelo conteúdo que publicam e declaram ter os direitos autorais do material.</li>
  <li>É proibido conteúdo ilegal, enganoso, adulto, perigoso, discriminatório ou que viole direitos de terceiros; a plataforma pode revisar, suspender e remover conteúdo e contas.</li>
  <li>Comissões, prazos de repasse e política de reembolso serão definidos nos Termos do Produtor e do Afiliado.</li>
  <li>Compartilhar acesso, redistribuir ou revender conteúdo comprado viola estes termos.</li></ul>`;
const PRIVACIDADE = `<p>Tratamos dados pessoais conforme a LGPD (Lei 13.709/2018).</p>
  <ul><li>Coletamos o mínimo necessário: nome, e-mail, telefone e, para produtores/afiliados, dados de documento e pagamento para repasses.</li>
  <li>Usamos os dados para operar a plataforma (conta, compras, entrega de conteúdo, comissões) e, com consentimento, para comunicações.</li>
  <li>Você pode exportar seus dados e pedir exclusão (anonimização) direto no painel, em Conta.</li>
  <li>Registramos logs de acesso e auditoria por segurança e obrigação legal.</li>
  <li>Não vendemos dados pessoais. Compartilhamos apenas com operadores essenciais (ex.: processador de pagamento).</li></ul>`;

function registrarPaginas(app, { notificar }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  app.get('/academy', (req, res) => res.send(landingHTML()));
  app.get('/academy/app', (req, res) => res.send(appHTML()));
  app.get('/academy/app.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-cliente.js')));
  app.get('/academy/termos', (req, res) => res.send(paginaLegal('Termos de Uso', TERMOS)));
  app.get('/academy/privacidade', (req, res) => res.send(paginaLegal('Política de Privacidade', PRIVACIDADE)));

  // lead da landing
  app.post('/academy/api/lead', h(async (req, res) => {
    const id = repo.Leads.criar(req.body || {});
    if (notificar) notificar(`📩 Villela Academy: novo lead — ${s((req.body || {}).nome, 60)} (${s((req.body || {}).interesse, 20)}).`).catch(() => {});
    res.json({ ok: true, id });
  }));
}

module.exports = { registrarPaginas, landingHTML, appHTML };
