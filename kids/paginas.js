// =====================================================================
// Villela Kids — páginas públicas server-rendered, sem build.
// Identidade PRÓPRIA de produto de consumo (mesma decisão do Closet
// Club, 02/08/2026): a criança não usa o V-Portal; o `.vx` do grupo fica
// para o Portal Staff. Paleta lúdica sobre creme, botões grandes,
// cantos redondos — legível para criança E para o pai.
// Textos jurídicos nascem com a tarja MINUTA (advogado valida antes do
// lançamento comercial — PROMPT_MASTER §6).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const repo = require('./repo');

const CSS = `
:root{--fundo:#FFF9F0;--tinta:#27303F;--suave:#6B7280;--card:#FFFFFF;--tema:#0F766E;--tema-2:#0B5A54;
--sol:#F59E0B;--uva:#7C3AED;--rosa:#DB2777;--borda:#EBE2D4;--raio:18px}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--tinta);font:16px/1.6 system-ui,'Segoe UI',Roboto,sans-serif}
a{color:var(--tema)}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
header.topo{background:var(--fundo);border-bottom:2px solid var(--borda)}
.topo .wrap{display:flex;align-items:center;justify-content:space-between;padding:14px 20px}
.logo{display:flex;gap:10px;align-items:center;font-weight:800;font-size:20px;color:var(--tinta);text-decoration:none}
.logo .bola{width:38px;height:38px;border-radius:12px;background:var(--tema);color:#fff;display:grid;place-items:center;font-size:20px}
.topo nav{display:flex;gap:8px;align-items:center}
.btn{display:inline-block;background:var(--tema);color:#fff;border:0;border-radius:999px;padding:12px 22px;font-weight:700;font-size:16px;text-decoration:none;cursor:pointer}
.btn:hover{background:var(--tema-2)}
.btn.claro{background:#fff;color:var(--tema);border:2px solid var(--tema)}
.btn.grande{padding:16px 30px;font-size:18px}
.hero{padding:56px 0 30px;text-align:center}
.hero h1{font-size:clamp(30px,5.5vw,52px);line-height:1.15;margin:0 0 14px;font-weight:900}
.hero h1 em{font-style:normal;color:var(--tema)}
.hero p.sub{font-size:19px;color:var(--suave);max-width:640px;margin:0 auto 26px}
.selo{display:inline-block;background:#FEF3C7;border:1px solid #FDE68A;color:#92400E;border-radius:999px;padding:6px 14px;font-weight:700;font-size:14px;margin-bottom:18px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:26px 0}
.card{background:var(--card);border:2px solid var(--borda);border-radius:var(--raio);padding:22px}
.card .ico{font-size:34px}
.card h3{margin:8px 0 6px;font-size:19px}
.card p{margin:0;color:var(--suave);font-size:15px}
.faixa{background:var(--card);border-top:2px solid var(--borda);border-bottom:2px solid var(--borda);padding:40px 0;margin:34px 0}
h2.titulo{font-size:clamp(24px,4vw,34px);text-align:center;margin:0 0 8px;font-weight:900}
p.centro{color:var(--suave);text-align:center;max-width:620px;margin:0 auto 10px}
.passos{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;counter-reset:p;margin-top:22px}
.passo{background:var(--fundo);border-radius:var(--raio);padding:20px;border:2px dashed var(--borda)}
.passo::before{counter-increment:p;content:counter(p);display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--sol);color:#fff;font-weight:800;margin-bottom:8px}
.pais{background:#ECFDF5;border:2px solid #A7F3D0;border-radius:var(--raio);padding:24px;margin:30px 0}
.pais h3{margin-top:0}
.pais ul{margin:0;padding-left:20px;color:#065F46}
.minuta{background:#FEF2F2;border:2px solid #FECACA;color:#991B1B;border-radius:12px;padding:10px 16px;font-weight:700;margin:18px 0}
footer{padding:34px 0;color:var(--suave);font-size:14px;text-align:center}
footer a{color:var(--suave)}
.juridico{max-width:760px;margin:30px auto;background:#fff;border:2px solid var(--borda);border-radius:var(--raio);padding:30px}
.form{max-width:420px;margin:40px auto;background:#fff;border:2px solid var(--borda);border-radius:var(--raio);padding:28px}
.form h1{margin:0 0 16px;font-size:24px}
.form label{display:block;font-weight:700;font-size:14px;margin:12px 0 4px}
.form input{width:100%;padding:12px;border:2px solid var(--borda);border-radius:10px;font-size:16px}
.form .check{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-top:12px;font-weight:400}
.form .check input{width:auto;margin-top:3px}
.form .erro{color:#B91C1C;font-weight:700;margin-top:10px;min-height:22px}
.form button{width:100%;margin-top:16px}
.trocar{text-align:center;margin-top:14px;font-size:14px}
.skip{position:absolute;left:-9999px}.skip:focus{position:static;display:block;padding:8px}
@media (max-width:640px){.topo nav .btn{padding:9px 14px;font-size:14px}}
`;

function layout({ titulo, descricao, conteudo, semIndex = false, canonico = '' } = {}) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo ? titulo + ' · ' : ''}Villela Kids</title>
<meta name="description" content="${descricao || 'Villela Kids — o clube de missões onde crianças aprendem criando: IA, histórias, jogos e projetos de verdade.'}">
${semIndex ? '<meta name="robots" content="noindex">' : ''}
${canonico ? `<link rel="canonical" href="${canonico}">` : ''}
<meta name="theme-color" content="#0F766E">
<link rel="icon" href="/assets/brand/villela-kids/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/brand/villela-kids/apple-touch-icon.png">
<meta property="og:title" content="${titulo ? titulo + ' · ' : ''}Villela Kids">
<meta property="og:image" content="https://kids.villelastay.com.br/assets/brand/villela-kids/og-image.png">
<link rel="manifest" href="/kids/manifest.webmanifest">
<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/kids/sw.js').catch(function(){})})}</script>
<style>${CSS}</style></head>
<body><a class="skip" href="#conteudo">Ir para o conteúdo</a>
<header class="topo"><div class="wrap">
  <a class="logo" href="/kids"><span class="bola">🚀</span> Villela Kids</a>
  <nav><a class="btn claro" href="/kids/entrar">Entrar</a><a class="btn" href="/kids/entrar#criar">Começar</a></nav>
</div></header>
<main id="conteudo">${conteudo}</main>
<footer><div class="wrap">
  <p><b>Villela Kids</b> · um produto do Grupo Villela Stay · Brasília-DF</p>
  <p><a href="/kids/ajuda">Central de Ajuda</a> · <a href="/kids/termos">Termos de uso</a> · <a href="/kids/privacidade">Privacidade</a></p>
</div></footer></body></html>`;
}

function home() {
  const eixos = [
    { ico: '🧠', t: 'Pensar', p: 'Lógica, matemática de verdade, ciência e enigmas para resolver.' },
    { ico: '🎨', t: 'Criar', p: 'Histórias, jogos, HQs e projetos — com a IA de coautora, nunca de autora.' },
    { ico: '🎤', t: 'Comunicar', p: 'Contar histórias, apresentar, gravar podcast e ser ouvido.' },
    { ico: '💡', t: 'Realizar', p: 'Inventar um produto, dar preço, defender a ideia — e aprender com isso.' },
  ];
  const missoes = repo.Missoes.catalogo().slice(0, 4);
  return layout({
    titulo: 'Aprenda criando',
    canonico: 'https://kids.villelastay.com.br/kids',
    conteudo: `
<section class="hero wrap">
  <span class="selo">🔒 Beta fechado — entrada por convite às famílias</span>
  <h1>Brincando hoje,<br><em>criando o amanhã</em>.</h1>
  <p class="sub">Um clube de missões onde crianças de 7 a 11 anos aprendem o que a escola quase nunca ensina:
  usar inteligência artificial, criar coisas de verdade e — no final — saber quando <b>não</b> confiar na tela.</p>
  <a class="btn grande" href="/kids/entrar#criar">Criar a conta da família</a>
</section>
<section class="wrap">
  <h2 class="titulo">Os 4 superpoderes</h2>
  <p class="centro">Nada de decorar matéria. Cada missão desenvolve uma competência que vale para a vida inteira.</p>
  <div class="cards">${eixos.map((e) => `<div class="card"><div class="ico">${e.ico}</div><h3>${e.t}</h3><p>${e.p}</p></div>`).join('')}</div>
</section>
<section class="faixa"><div class="wrap">
  <h2 class="titulo">Como funciona</h2>
  <div class="passos">
    <div class="passo"><b>Uma missão por semana.</b><br>Nada de lição: um desafio com produto final que a criança quer mostrar.</div>
    <div class="passo"><b>A IA é coautora.</b><br>Sugere caminhos dentro da missão; quem decide (e aprende a decidir) é a criança.</div>
    <div class="passo"><b>Tudo vira portfólio.</b><br>Histórias, jogos e invenções ficam guardados — evidência de aprendizagem, não nota.</div>
    <div class="passo"><b>A família participa.</b><br>Toda missão termina num momento em família: ler, jogar, ouvir, aplaudir.</div>
  </div>
</div></section>
<section class="wrap">
  <h2 class="titulo">As primeiras missões</h2>
  <div class="cards">${missoes.map((m) => `<div class="card"><div class="ico">${m.emoji}</div><h3>${m.titulo}</h3><p>${m.resumo}</p></div>`).join('')}</div>
</section>
<section class="wrap"><div class="pais">
  <h3>🛡️ Para os pais: segurança em primeiro lugar</h3>
  <ul>
    <li>A conta é <b>sua</b> — a criança usa um perfil com apelido, sem e-mail, sem cadastro próprio e sem contato com estranhos.</li>
    <li><b>Sem rede social</b>: nenhuma criança vê ou fala com criança de outra família.</li>
    <li>A IA conversa <b>dentro das missões</b>, com limites de conteúdo infantil — e a voz do seu filho nunca sobe para o app.</li>
    <li>Dados mínimos, nenhuma publicidade, e você exporta ou apaga tudo quando quiser (LGPD, art. 14).</li>
  </ul>
</div></section>` });
}

function entrar() {
  // Página de login/cadastro com JS inline mínimo — o app de verdade é /kids/app.
  return layout({
    titulo: 'Entrar', semIndex: true,
    conteudo: `
<div class="form">
  <h1 id="tit">Entrar</h1>
  <form id="f">
    <div id="campos-criar" style="display:none">
      <label>Seu nome (responsável)</label><input name="nome" autocomplete="name">
      <label>Confirmo que sou responsável pelas crianças que vão usar</label>
    </div>
    <label>E-mail</label><input name="email" type="email" autocomplete="email" required>
    <label>Senha</label><input name="senha" type="password" minlength="8" autocomplete="current-password" required>
    <div id="consentimentos" style="display:none">
      <label class="check"><input type="checkbox" name="aceite_termos"> Li e aceito os <a href="/kids/termos" target="_blank">termos</a> e a <a href="/kids/privacidade" target="_blank">política de privacidade</a>.</label>
      <label class="check"><input type="checkbox" name="consentimento_parental"> <b>Consentimento parental:</b> como responsável, autorizo o uso do Villela Kids pelas crianças da minha família (LGPD, art. 14).</label>
    </div>
    <div class="erro" id="erro"></div>
    <button class="btn" id="bt" type="submit">Entrar</button>
  </form>
  <p class="trocar"><a href="#criar" id="alt">Primeira vez? Criar a conta da família</a></p>
  <p class="trocar"><a href="#" id="esqueci">Esqueci a senha</a></p>
</div>
<script>
(function(){
  var criar=false;
  function modo(){criar=location.hash==='#criar';
    document.getElementById('tit').textContent=criar?'Criar a conta da família':'Entrar';
    document.getElementById('bt').textContent=criar?'Criar conta':'Entrar';
    document.getElementById('campos-criar').style.display=criar?'':'none';
    document.getElementById('consentimentos').style.display=criar?'':'none';
    document.getElementById('alt').textContent=criar?'Já tenho conta — entrar':'Primeira vez? Criar a conta da família';
    document.getElementById('alt').href=criar?'#entrar':'#criar';}
  window.addEventListener('hashchange',modo);modo();
  document.getElementById('f').addEventListener('submit',async function(ev){
    ev.preventDefault();var f=ev.target,e=document.getElementById('erro');e.textContent='';
    var corpo={email:f.email.value,senha:f.senha.value};
    if(criar){corpo.nome=f.nome.value;corpo.aceite_termos=f.aceite_termos.checked;corpo.consentimento_parental=f.consentimento_parental.checked;}
    try{
      var r=await fetch('/kids/api/'+(criar?'cadastrar':'login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corpo)});
      var d=await r.json();
      if(!r.ok)throw new Error(d.erro||'Não deu certo. Tente de novo.');
      location.href='/kids/app';
    }catch(err){e.textContent=err.message;}
  });
  document.getElementById('esqueci').addEventListener('click',async function(ev){
    ev.preventDefault();var f=document.getElementById('f'),e=document.getElementById('erro');
    if(!f.email.value){e.textContent='Preencha o e-mail e clique de novo.';return;}
    await fetch('/kids/api/esqueci-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value})});
    e.textContent='Se este e-mail tiver conta, enviamos o link de redefinição.';
  });
})();
</script>` });
}

const TARJA = `<p class="minuta">⚠️ MINUTA — este texto ainda será validado por advogado(a) inscrito(a) na OAB antes do lançamento comercial.</p>`;

function termos() {
  return layout({ titulo: 'Termos de uso', conteudo: `<div class="juridico wrap"><h1>Termos de uso</h1>${TARJA}
<p>O <b>Villela Kids</b> é um serviço do Grupo Villela Stay (Augusto Villela Ltda, CNPJ 56.776.526/0001-12) em fase de <b>beta fechado</b>.</p>
<ol>
<li><b>Conta do responsável.</b> Só maiores de 18 anos criam conta. Os perfis de criança pertencem à conta do responsável, que responde pelo uso.</li>
<li><b>Uso educacional.</b> O serviço oferece missões educativas com apoio de inteligência artificial. Não substitui a escola.</li>
<li><b>Conteúdo criado.</b> As criações da criança pertencem à família. Usamos apenas para exibi-las no portfólio da própria conta.</li>
<li><b>Sem interação entre famílias.</b> Não há chat, comentários nem qualquer contato entre crianças de contas diferentes.</li>
<li><b>Beta gratuito.</b> Durante o beta fechado não há cobrança. Condições comerciais futuras virão em novo termo.</li>
<li><b>Encerramento.</b> O responsável pode excluir a conta a qualquer momento; os dados das crianças são apagados em definitivo.</li>
</ol></div>` });
}

function privacidade() {
  return layout({ titulo: 'Política de privacidade', conteudo: `<div class="juridico wrap"><h1>Política de privacidade</h1>${TARJA}
<p>Tratamos dados pessoais conforme a LGPD (Lei 13.709/2018), com atenção especial ao <b>art. 14</b> (dados de crianças).</p>
<ol>
<li><b>O que coletamos do responsável:</b> nome, e-mail e senha (criptografada).</li>
<li><b>O que coletamos da criança:</b> o mínimo — apelido, faixa etária e um emoji de avatar. Sem nome completo, sem data de nascimento, sem foto, sem e-mail, sem voz.</li>
<li><b>Consentimento parental:</b> o uso por criança só acontece após consentimento específico e destacado do responsável, colhido no cadastro.</li>
<li><b>Para que usamos:</b> exclusivamente para a experiência educativa (trilha de missões, portfólio e avisos ao responsável). <b>Nunca</b> para publicidade.</li>
<li><b>IA:</b> as conversas acontecem dentro das missões, com filtros de conteúdo infantil. Não usamos os dados das crianças para treinar modelos.</li>
<li><b>Seus direitos:</b> exportar todos os dados da família e excluir a conta (apagamento definitivo das criações e do progresso) direto no painel.</li>
<li><b>Contato do controlador:</b> Augusto Villela Ltda — contato@villelastay.com.br.</li>
</ol></div>` });
}

function registrarPaginas(app) {
  const g = (rota, fn) => app.get(rota, (req, res) => {
    try { res.set('Content-Type', 'text/html; charset=utf-8').send(fn(req)); }
    catch (e) { res.status(500).send('Erro ao montar a página: ' + e.message); }
  });

  g('/kids', () => home());
  g('/kids/entrar', () => entrar());
  g('/kids/termos', () => termos());
  g('/kids/privacidade', () => privacidade());

  // Casca do app da família + bundle com cache imutável por mtime (lição do Closet:
  // sem o ?v= o navegador segura app velho depois de deploy).
  const APP_JS = path.join(__dirname, 'app-cliente.js');
  let APP_V = '1'; try { APP_V = String(Math.trunc(fs.statSync(APP_JS).mtimeMs)); } catch (_) {}
  g('/kids/app', () => layout({
    titulo: 'Clube de Missões', semIndex: true,
    conteudo: `<div class="wrap" id="kids-app"><p style="text-align:center;padding:50px 0">Carregando o clube…</p></div>
<script src="/kids/app.js?v=${APP_V}"></script>`,
  }));
  app.get('/kids/app.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.send(fs.readFileSync(APP_JS, 'utf8'));
  });

  // robots/sitemap próprios do produto: app e API fora do índice.
  app.get('/kids/robots.txt', (req, res) => res.type('text/plain').send(
    'User-agent: *\nDisallow: /kids/app\nDisallow: /kids/api\nSitemap: https://kids.villelastay.com.br/kids/sitemap.xml\n'));
  app.get('/kids/sitemap.xml', (req, res) => {
    const base = 'https://kids.villelastay.com.br';
    const urls = ['/kids', '/kids/termos', '/kids/privacidade'];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
      urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('') + '</urlset>');
  });
}

module.exports = { registrarPaginas };
