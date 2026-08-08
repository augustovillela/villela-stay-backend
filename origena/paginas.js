// =====================================================================
// ORIGENA — páginas públicas server-rendered, sem build.
//
// FASE 0: só a porta de entrada, para o produto EXISTIR no ar (rota
// medida pelo analytics, deploy verificável, subdomínio apontado).
// A landing de verdade e o app da família entram na Fase 1.
//
// IDENTIDADE PROVISÓRIA, DE PROPÓSITO: a marca da Origena depende do
// brand book do grupo, ainda em preparação (memória
// `brand-book-em-preparacao`), e da busca INPI. Até lá isto é um
// esqueleto sóbrio — nada aqui deve ser tratado como decisão de marca.
// =====================================================================
'use strict';

const CSS = `
:root{--fundo:#FBF9F6;--tinta:#1C1A17;--suave:#6B655C;--card:#fff;--borda:#E8E2D9;
--tema:#7A5C3E;--raio:18px}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--tinta);
font:16px/1.65 Inter,system-ui,'Segoe UI',Roboto,sans-serif}
h1,h2{font-family:Lora,Georgia,'Times New Roman',serif;font-weight:600;letter-spacing:-.01em}
.wrap{max-width:820px;margin:0 auto;padding:0 22px}
.hero{padding:72px 0 44px;text-align:center}
.hero h1{font-size:clamp(34px,6vw,54px);margin:0 0 10px}
.assinatura{color:var(--suave);font-size:18px;margin:0 0 30px}
.selo{display:inline-block;background:#FDF3D7;border:1px solid #EBD9A6;color:#7A5B12;
border-radius:999px;padding:6px 15px;font-weight:600;font-size:14px;margin-bottom:22px}
.card{background:var(--card);border:1px solid var(--borda);border-radius:var(--raio);
padding:26px;margin:18px 0;text-align:left}
.card h2{font-size:20px;margin:0 0 10px}
.card p{margin:0 0 10px;color:var(--suave)}
.card p:last-child{margin-bottom:0}
footer{color:var(--suave);font-size:14px;text-align:center;padding:34px 0 50px}
@media(prefers-color-scheme:dark){
:root{--fundo:#17150F;--tinta:#F2EDE4;--suave:#A69E90;--card:#221E17;--borda:#332C22;--tema:#C9A87C}
.selo{background:#332A12;border-color:#5A4A20;color:#E8D08A}}
`;

const pagina = (titulo, corpo) => `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${titulo}</title>
<style>${CSS}</style>
</head><body>${corpo}</body></html>`;

function registrarPaginas(app) {
  app.get('/origena', (req, res) => {
    res.type('html').send(pagina('Origena — Suas origens. Suas histórias. Seu legado.', `
<div class="wrap">
  <div class="hero">
    <div class="selo">Em construção · beta fechado</div>
    <h1>Origena</h1>
    <p class="assinatura">Suas origens. Suas histórias. Seu legado.</p>
  </div>
  <div class="card">
    <h2>Um sistema para a memória da sua família</h2>
    <p>Fotografias, documentos, cartas, receitas, gravações e histórias contadas em casa —
       guardados juntos, com <strong>quem contou, quando e de onde veio</strong>.</p>
    <p>A Origena preserva a origem de cada informação. Quando duas pessoas lembram de formas
       diferentes, as duas versões continuam ali.</p>
  </div>
  <div class="card">
    <h2>Ainda não estamos abertos</h2>
    <p>A plataforma está em desenvolvimento e roda hoje em beta fechado, com uma família só.</p>
  </div>
  <footer>Um produto do Grupo Villela Stay.</footer>
</div>`));
  });

  // `noindex` global até o memorial público existir e ser autorizado (§120).
  app.get('/origena/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /origena\n');
  });

  // App da família. Página única, JS clássico, sem build — padrão da casa.
  // A autorização é TODA do servidor: esta tela só esconde botão que a API
  // já negaria (§92). O que ela mostra vem de `permissoes` do backend.
  app.get('/origena/app', (req, res) => res.type('html').send(APP));

  // Aterrissagem dos links de e-mail. Entregam o token ao app.
  for (const rota of ['/origena/verificar', '/origena/convite', '/origena/nova-senha']) {
    app.get(rota, (req, res) => res.redirect(302,
      `/origena/app#${rota.split('/').pop()}?token=${encodeURIComponent(req.query.token || '')}`));
  }
}

const APP = pagina('Origena', `
<div class="wrap" id="app"><p class="carregando">Carregando…</p></div>
<style>
.wrap{max-width:720px}
.topo{display:flex;justify-content:space-between;align-items:center;padding:18px 0;border-bottom:1px solid var(--borda)}
.marca{font-family:Lora,Georgia,serif;font-size:22px;font-weight:600}
/* §85: alvo de toque de 44px e texto de 16px+. A Origena vai ser usada
   por avós no celular — controle apertado aqui não é detalhe estético.
   16px no input também evita o zoom automático do iOS ao focar. */
input,select{width:100%;min-height:48px;padding:12px 14px;border:1px solid var(--borda);
border-radius:10px;font:16px Inter,system-ui,sans-serif;background:var(--card);
color:var(--tinta);margin:6px 0 14px}
input[type=checkbox]{min-height:22px;width:22px;height:22px;vertical-align:-4px}
label{font-size:15px;font-weight:600;display:block;margin-top:6px}
.btn{background:var(--tema);color:#fff;border:0;border-radius:999px;padding:13px 26px;
min-height:48px;font-weight:600;font-size:16px;cursor:pointer}
.btn.claro{background:transparent;color:var(--tema);border:1px solid var(--tema)}
.btn.mini{min-height:40px;padding:9px 16px;font-size:14px}
a{text-decoration-thickness:1px;text-underline-offset:3px}
.btn:disabled{opacity:.5;cursor:wait}
.linha{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;
border-bottom:1px solid var(--borda);flex-wrap:wrap}
.papel{font-size:12px;font-weight:700;letter-spacing:.04em;background:#EFE7DC;color:#7A5C3E;
border-radius:999px;padding:3px 10px}
.erro{background:#FDECEC;border:1px solid #F5C2C2;color:#8A2020;padding:11px 14px;border-radius:10px;margin:12px 0}
.ok{background:#E9F5EC;border:1px solid #BFE0C8;color:#1F5C33;padding:11px 14px;border-radius:10px;margin:12px 0}
.sub{color:var(--suave);font-size:14px}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;word-break:break-all}
@media(prefers-color-scheme:dark){.papel{background:#3A2E22;color:#D9BC93}
.erro{background:#3A1E1E;border-color:#5C2C2C;color:#F0B4B4}.ok{background:#1C3324;border-color:#2C5C3A;color:#A8DDB8}}
</style>
<script>
const API = '/origena/api/v1';
let EU = null, FAM = null, PERM = [];
const $ = (h) => { document.getElementById('app').innerHTML = h; };
const esc = (t) => String(t==null?'':t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pode = (p) => PERM.includes(p);

async function api(metodo, caminho, corpo) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, ...(j || {}) };
}
// Erro nunca vira "500 Internal Server Error" na cara do usuário (§118).
const aviso = (m, tipo) => '<div class="' + (tipo||'erro') + '">' + esc(m) + '</div>';

const topo = () => '<div class="topo"><span class="marca">Origena</span>' +
  (EU ? '<span class="sub">' + esc(EU.nome) + ' · <a href="#" onclick="sair();return false">sair</a></span>' : '') +
  '</div>';

// ------------------------------------------------------------------ entrar
function telaEntrar(msg) {
  $(topo() + '<h2>Entrar</h2>' + (msg ? aviso(msg) : '') + \`
    <label>E-mail</label><input id="e" type="email" autocomplete="email">
    <label>Senha</label><input id="s" type="password" autocomplete="current-password">
    <div id="mfa" style="display:none"><label>Código de verificação</label>
      <input id="c" inputmode="numeric" autocomplete="one-time-code" placeholder="000000"></div>
    <button class="btn" onclick="entrar()">Entrar</button>
    <p class="sub" style="margin-top:20px">Ainda não tem conta?
      <a href="#" onclick="telaCadastrar();return false">Criar conta</a></p>\`);
}
async function entrar() {
  const r = await api('POST', '/conta/entrar', {
    email: document.getElementById('e').value, senha: document.getElementById('s').value,
    codigo: (document.getElementById('c')||{}).value });
  if (r.mfa_necessario && r.status === 200) { document.getElementById('mfa').style.display = 'block'; return; }
  if (r.status !== 200) return telaEntrar(r.erro || 'Não consegui entrar.');
  inicio();
}
function telaCadastrar(msg) {
  $(topo() + '<h2>Criar conta</h2>' + (msg ? aviso(msg) : '') + \`
    <label>Seu nome</label><input id="n">
    <label>E-mail</label><input id="e" type="email">
    <label>Senha</label><input id="s" type="password" autocomplete="new-password">
    <p class="sub"><label style="display:inline"><input type="checkbox" id="t" style="width:auto"> Aceito os termos de uso</label></p>
    <button class="btn" onclick="cadastrar()">Criar conta</button>
    <p class="sub" style="margin-top:20px"><a href="#" onclick="telaEntrar();return false">Já tenho conta</a></p>\`);
}
async function cadastrar() {
  const r = await api('POST', '/conta/cadastrar', {
    nome: document.getElementById('n').value, email: document.getElementById('e').value,
    senha: document.getElementById('s').value, aceito_termos: document.getElementById('t').checked });
  if (r.status >= 400) return telaCadastrar(r.erro);
  $(topo() + '<h2>Confirme seu e-mail</h2>' + aviso(r.mensagem, 'ok') +
    '<p class="sub">Abra o link que enviamos para confirmar e entrar.</p>');
}
const sair = async () => { await api('POST', '/conta/sair'); EU = null; telaEntrar(); };

// ------------------------------------------------------------------ famílias
async function inicio() {
  const eu = await api('GET', '/conta/eu');
  if (eu.status !== 200) return telaEntrar();
  EU = eu.usuario;
  const fams = eu.familias || [];
  $(topo() + '<h2>Nossa família</h2>' +
    (fams.length ? fams.map(f =>
      '<div class="linha"><span><strong>' + esc(f.nome) + '</strong> <span class="papel">' + esc(f.papel) + '</span></span>' +
      '<button class="btn mini" onclick="abrir(\\'' + f.id + '\\')">Abrir</button></div>').join('')
      : '<p class="sub">Você ainda não faz parte de nenhuma família. Crie a sua.</p>') +
    \`<h3 style="margin-top:28px">Criar uma família</h3>
     <label>Nome da família</label><input id="nf" placeholder="Família Villela">
     <button class="btn" onclick="criarFamilia()">Criar</button>\`);
}
async function criarFamilia() {
  const r = await api('POST', '/familias', { nome: document.getElementById('nf').value });
  if (r.status >= 400) { $(document.getElementById('app').innerHTML + aviso(r.erro)); return; }
  abrir(r.familia.id);
}

async function abrir(id) {
  const f = await api('GET', '/familias/' + id);
  if (f.status !== 200) return inicio();
  FAM = f.familia; PERM = f.permissoes || [];
  const m = await api('GET', '/familias/' + id + '/membros');
  const convites = pode('membros.convidar') ? await api('GET', '/familias/' + id + '/convites') : { convites: [] };
  $(topo() + '<p class="sub"><a href="#" onclick="inicio();return false">← todas as famílias</a></p>' +
    '<h2>' + esc(FAM.nome) + '</h2><p class="sub">Você é <strong>' + esc(f.papel) + '</strong> aqui.</p>' +
    '<h3 style="margin-top:26px">Pessoas com acesso</h3>' +
    (m.membros || []).map(x =>
      '<div class="linha"><span>' + esc(x.nome) + (x.email ? ' <span class="sub">' + esc(x.email) + '</span>' : '') +
      ' <span class="papel">' + esc(x.papel) + '</span></span>' +
      (pode('membros.gerenciar') && x.papel !== 'OWNER'
        ? '<button class="btn mini claro" onclick="remover(\\'' + x.user_id + '\\')">Remover</button>' : '') +
      '</div>').join('') +
    (pode('membros.convidar') ? \`
      <h3 style="margin-top:26px">Convidar alguém da família</h3>
      <label>E-mail</label><input id="ce" type="email">
      <label>Papel</label><select id="cp">
        <option value="CONTRIBUTOR">Contribuir (envia fotos e histórias)</option>
        <option value="FAMILY_MEMBER">Ver e contribuir</option>
        <option value="EDITOR">Editar o acervo</option>
        <option value="HISTORIAN">Cuidar das fontes e divergências</option>
        <option value="ADMIN">Administrar a família</option>
        <option value="GUEST">Só visitar</option>
      </select>
      <button class="btn" onclick="convidar()">Enviar convite</button>\` +
      ((convites.convites || []).filter(c => !c.aceito_em && !c.revogado_em).map(c =>
        '<div class="linha"><span class="sub">' + esc(c.email) + ' · ' + esc(c.papel) + ' · aguardando</span></div>').join(''))
      : '') +
    (pode('auditoria.ver') ? '<p style="margin-top:26px"><a href="#" onclick="auditoria();return false">Ver o histórico de mudanças</a></p>' : ''));
}
async function convidar() {
  const r = await api('POST', '/familias/' + FAM.id + '/convites',
    { email: document.getElementById('ce').value, papel: document.getElementById('cp').value });
  if (r.status === 428) return $(document.getElementById('app').innerHTML +
    aviso('Para convidar, ative antes a verificação em duas etapas — esta ação pode expor o acervo da família.'));
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  abrir(FAM.id);
}
async function remover(userId) {
  if (!confirm('Remover o acesso desta pessoa? O que ela contribuiu continua no acervo.')) return;
  const r = await api('DELETE', '/familias/' + FAM.id + '/membros/' + userId);
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  abrir(FAM.id);
}
async function auditoria() {
  const r = await api('GET', '/familias/' + FAM.id + '/auditoria');
  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' + esc(FAM.nome) + '</a></p>' +
    '<h2>Histórico de mudanças</h2>' +
    (r.eventos || []).map(e => '<div class="linha"><span>' + esc(e.acao) +
      '<br><span class="sub">' + esc(e.ator_nome || 'sistema') + ' · ' +
      new Date(e.created_at).toLocaleString('pt-BR') + '</span></span></div>').join(''));
}

// ------------------------------------------------- links vindos do e-mail
async function rotaDoHash() {
  const h = location.hash.slice(1);
  const [qual, q] = h.split('?');
  const token = new URLSearchParams(q || '').get('token');
  if (qual === 'verificar' && token) {
    const r = await api('GET', '/conta/verificar?token=' + encodeURIComponent(token));
    history.replaceState(null, '', '/origena/app');
    return r.status === 200 ? inicio() : telaEntrar(r.erro);
  }
  if (qual === 'convite' && token) {
    const c = await api('GET', '/convites/' + encodeURIComponent(token));
    if (c.status >= 400) { history.replaceState(null, '', '/origena/app'); return telaEntrar(c.erro); }
    const eu = await api('GET', '/conta/eu');
    if (eu.status !== 200) return telaEntrar('Entre com o e-mail ' + c.convite.email + ' para aceitar o convite.');
    const a = await api('POST', '/convites/' + encodeURIComponent(token) + '/aceitar');
    history.replaceState(null, '', '/origena/app');
    return a.status === 200 ? abrir(a.familyId) : (EU = eu.usuario, $(topo() + aviso(a.erro)));
  }
  if (qual === 'nova-senha' && token) {
    return $(topo() + '<h2>Escolher nova senha</h2><label>Nova senha</label>' +
      '<input id="s" type="password" autocomplete="new-password">' +
      '<button class="btn" onclick="salvarSenha(\\'' + esc(token) + '\\')">Salvar</button>');
  }
  inicio();
}
async function salvarSenha(token) {
  const r = await api('POST', '/conta/nova-senha', { token, senha: document.getElementById('s').value });
  history.replaceState(null, '', '/origena/app');
  telaEntrar(r.status === 200 ? 'Senha alterada. Entre de novo.' : r.erro);
}

rotaDoHash();
</script>`);

module.exports = { registrarPaginas, pagina, CSS };
