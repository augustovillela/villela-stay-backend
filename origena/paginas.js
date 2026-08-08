// =====================================================================
// ORIGENA — páginas server-rendered, sem build.
//
// TODO texto vem do catálogo i18n (§86) — zero string em componente. O
// servidor injeta o catálogo do idioma do visitante no HTML, e o JS do
// navegador só lê `T['chave']`. Trocar de idioma é trocar o JSON.
//
// IDENTIDADE PROVISÓRIA, DE PROPÓSITO: a marca da Origena depende do
// brand book do grupo, ainda em preparação (memória
// `brand-book-em-preparacao`), e da busca INPI. Nada aqui é decisão de
// marca — os tokens estão num bloco só, para trocar de uma vez.
// =====================================================================
'use strict';
const i18n = require('./i18n');

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

// Cabeça compartilhada. `pwa` liga manifest + service worker (o módulo
// central pwa.js serve os dois em /origena/manifest.webmanifest e /origena/sw.js).
function pagina(idioma, titulo, corpo, { pwa = false, css = '' } = {}) {
  return `<!doctype html>
<html lang="${idioma}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#7A5C3E">
<title>${titulo}</title>
${pwa ? '<link rel="manifest" href="/origena/manifest.webmanifest">'
      + '<link rel="apple-touch-icon" href="/assets/brand/villela-origena/apple-touch-icon.png">' : ''}
<link rel="icon" href="/assets/brand/villela-origena/favicon.svg" type="image/svg+xml">
<style>${CSS}${css}</style>
</head><body>${corpo}
${pwa ? `<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('/origena/sw.js',{scope:'/origena/'}).catch(()=>{});</script>` : ''}
</body></html>`;
}

function registrarPaginas(app) {
  // ------------------------------------------------------------- landing
  app.get('/origena', (req, res) => {
    const idioma = req.idioma || i18n.PADRAO;
    const t = (c) => i18n.t(idioma, c);
    res.type('html').send(pagina(idioma,
      `${t('produto.nome')} — ${t('produto.assinatura')}`, `
<div class="wrap">
  <div class="hero">
    <div class="selo">${t('landing.selo')}</div>
    <h1>${t('produto.nome')}</h1>
    <p class="assinatura">${t('produto.assinatura')}</p>
  </div>
  <div class="card">
    <h2>${t('landing.titulo')}</h2>
    <p>${t('landing.p1')}</p>
    <p>${t('landing.p2')}</p>
  </div>
  <div class="card">
    <h2>${t('landing.fechado_titulo')}</h2>
    <p>${t('landing.fechado_p')}</p>
  </div>
  <footer>${t('produto.grupo')}</footer>
</div>`));
  });

  app.get('/origena/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /origena\n');
  });

  // ------------------------------------------------------ app da família
  app.get('/origena/app', (req, res) => {
    const idioma = req.idioma || i18n.PADRAO;
    const corpo = CORPO_APP
      .replace('__CATALOGO__', JSON.stringify(i18n.catalogo(idioma)))
      .replace('__IDIOMA__', JSON.stringify(idioma));
    res.type('html').send(pagina(idioma, i18n.t(idioma, 'produto.nome'), corpo, { pwa: true, css: CSS_APP }));
  });

  // Aterrissagem dos links de e-mail. Entregam o token ao app.
  for (const rota of ['/origena/verificar', '/origena/convite', '/origena/nova-senha']) {
    app.get(rota, (req, res) => res.redirect(302,
      `/origena/app#${rota.split('/').pop()}?token=${encodeURIComponent(req.query.token || '')}`));
  }
}

const CSS_APP = `
.wrap{max-width:720px}
.topo{display:flex;justify-content:space-between;align-items:center;padding:18px 0;border-bottom:1px solid var(--borda)}
.marca{font-family:Lora,Georgia,serif;font-size:22px;font-weight:600}
/* §85: alvo de toque de 48px e texto de 16px+. A Origena vai ser usada
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
@media(prefers-color-scheme:dark){.papel{background:#3A2E22;color:#D9BC93}
.erro{background:#3A1E1E;border-color:#5C2C2C;color:#F0B4B4}.ok{background:#1C3324;border-color:#2C5C3A;color:#A8DDB8}}
`;

const CORPO_APP = `
<div class="wrap" id="app"></div>
<script>const T=__CATALOGO__, IDIOMA=__IDIOMA__;
const API = '/origena/api/v1';
let EU = null, FAM = null, PERM = [];
const $ = (h) => { document.getElementById('app').innerHTML = h; };
const esc = (t) => String(t==null?'':t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pode = (p) => PERM.includes(p);
// Toda string da tela vem do catálogo: nenhuma frase mora aqui (§86).
const t = (chave, vars) => { let s = T[chave]; if (s == null) return chave;
  return vars ? String(s).replace(/\\{(\\w+)\\}/g, (m,k) => vars[k]==null?m:vars[k]) : s; };
const dataHora = (v) => new Date(v).toLocaleString(IDIOMA);

async function api(metodo, caminho, corpo) {
  try {
    const r = await fetch(API + caminho, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, ...(j || {}) };
  } catch (_) {
    // Rede caiu: mensagem útil, nunca uma tela em branco (§118).
    return { status: 0, erro: t('erro.generico') };
  }
}
const aviso = (m, tipo) => '<div class="' + (tipo||'erro') + '">' + esc(m || t('erro.generico')) + '</div>';
const papelNome = (p) => t('papel.' + p) || p;

const topo = () => '<div class="topo"><span class="marca">' + esc(t('produto.nome')) + '</span>' +
  (EU ? '<span class="sub">' + esc(EU.nome) + ' · <a href="#" onclick="sair();return false">' + esc(t('acao.sair')) + '</a></span>' : '') +
  '</div>';

// ------------------------------------------------------------------ entrar
function telaEntrar(msg) {
  $(topo() + '<h2>' + esc(t('conta.entrar_titulo')) + '</h2>' + (msg ? aviso(msg) : '') +
    '<label>' + esc(t('campo.email')) + '</label><input id="e" type="email" autocomplete="email">' +
    '<label>' + esc(t('campo.senha')) + '</label><input id="s" type="password" autocomplete="current-password">' +
    '<div id="mfa" style="display:none"><label>' + esc(t('campo.codigo')) + '</label>' +
      '<input id="c" inputmode="numeric" autocomplete="one-time-code" placeholder="000000"></div>' +
    '<button class="btn" onclick="entrar()">' + esc(t('acao.entrar')) + '</button>' +
    '<p class="sub" style="margin-top:20px">' + esc(t('conta.sem_conta')) +
      ' <a href="#" onclick="telaCadastrar();return false">' + esc(t('acao.criar_conta')) + '</a></p>');
}
async function entrar() {
  const r = await api('POST', '/conta/entrar', {
    email: document.getElementById('e').value, senha: document.getElementById('s').value,
    codigo: (document.getElementById('c')||{}).value });
  if (r.mfa_necessario && r.status === 200) { document.getElementById('mfa').style.display = 'block'; return; }
  if (r.status !== 200) return telaEntrar(r.erro || t('erro.nao_entrei'));
  inicio();
}
function telaCadastrar(msg) {
  $(topo() + '<h2>' + esc(t('conta.criar_titulo')) + '</h2>' + (msg ? aviso(msg) : '') +
    '<label>' + esc(t('campo.seu_nome')) + '</label><input id="n">' +
    '<label>' + esc(t('campo.email')) + '</label><input id="e" type="email">' +
    '<label>' + esc(t('campo.senha')) + '</label><input id="s" type="password" autocomplete="new-password">' +
    '<p class="sub"><label style="display:inline"><input type="checkbox" id="t" style="width:auto"> ' +
      esc(t('campo.aceito_termos')) + '</label></p>' +
    '<button class="btn" onclick="cadastrar()">' + esc(t('acao.criar_conta')) + '</button>' +
    '<p class="sub" style="margin-top:20px"><a href="#" onclick="telaEntrar();return false">' +
      esc(t('acao.ja_tenho_conta')) + '</a></p>');
}
async function cadastrar() {
  const r = await api('POST', '/conta/cadastrar', {
    nome: document.getElementById('n').value, email: document.getElementById('e').value,
    senha: document.getElementById('s').value, aceito_termos: document.getElementById('t').checked });
  if (r.status >= 400) return telaCadastrar(r.erro);
  $(topo() + '<h2>' + esc(t('conta.confirme_titulo')) + '</h2>' + aviso(r.mensagem, 'ok') +
    '<p class="sub">' + esc(t('conta.confirme_p')) + '</p>');
}
const sair = async () => { await api('POST', '/conta/sair'); EU = null; telaEntrar(); };

// ------------------------------------------------------------------ famílias
async function inicio() {
  const eu = await api('GET', '/conta/eu');
  if (eu.status !== 200) return telaEntrar();
  EU = eu.usuario;
  const fams = eu.familias || [];
  $(topo() + '<h2>' + esc(t('familia.minhas')) + '</h2>' +
    (fams.length ? fams.map(f =>
      '<div class="linha"><span><strong>' + esc(f.nome) + '</strong> <span class="papel">' + esc(papelNome(f.papel)) + '</span></span>' +
      '<button class="btn mini" onclick="abrir(\\'' + f.id + '\\')">' + esc(t('acao.abrir')) + '</button></div>').join('')
      : '<p class="sub">' + esc(t('familia.nenhuma')) + '</p>') +
    '<h3 style="margin-top:28px">' + esc(t('familia.criar_titulo')) + '</h3>' +
    '<label>' + esc(t('campo.nome_familia')) + '</label>' +
    '<input id="nf" placeholder="' + esc(t('familia.placeholder_nome')) + '">' +
    '<button class="btn" onclick="criarFamilia()">' + esc(t('acao.criar')) + '</button>');
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
  const papeisConvidaveis = ['CONTRIBUTOR','FAMILY_MEMBER','EDITOR','HISTORIAN','ADMIN','GUEST'];
  $(topo() + '<p class="sub"><a href="#" onclick="inicio();return false">' + esc(t('acao.voltar_familias')) + '</a></p>' +
    '<h2>' + esc(FAM.nome) + '</h2><p class="sub">' + t('familia.voce_e', { papel: esc(papelNome(f.papel)) }) + '</p>' +
    '<h3 style="margin-top:26px">' + esc(t('familia.pessoas')) + '</h3>' +
    (m.membros || []).map(x =>
      '<div class="linha"><span>' + esc(x.nome) + (x.email ? ' <span class="sub">' + esc(x.email) + '</span>' : '') +
      ' <span class="papel">' + esc(papelNome(x.papel)) + '</span></span>' +
      (pode('membros.gerenciar') && x.papel !== 'OWNER'
        ? '<button class="btn mini claro" onclick="remover(\\'' + x.user_id + '\\')">' + esc(t('acao.remover')) + '</button>' : '') +
      '</div>').join('') +
    (pode('membros.convidar')
      ? '<h3 style="margin-top:26px">' + esc(t('familia.convidar_titulo')) + '</h3>' +
        '<label>' + esc(t('campo.email')) + '</label><input id="ce" type="email">' +
        '<label>' + esc(t('campo.papel')) + '</label><select id="cp">' +
        papeisConvidaveis.map(p => '<option value="' + p + '">' + esc(t('papel.desc_' + p)) + '</option>').join('') +
        '</select>' +
        '<button class="btn" onclick="convidar()">' + esc(t('acao.enviar_convite')) + '</button>' +
        ((convites.convites || []).filter(c => !c.aceito_em && !c.revogado_em).map(c =>
          '<div class="linha"><span class="sub">' + esc(c.email) + ' · ' + esc(papelNome(c.papel)) +
          ' · ' + esc(t('familia.aguardando')) + '</span></div>').join(''))
      : '') +
    '<p style="margin-top:26px"><a href="#" onclick="pessoas();return false"><strong>' + esc(t('pessoa.titulo')) + '</strong></a></p>' +
    (pode('auditoria.ver') ? '<p><a href="#" onclick="auditoria();return false">' +
      esc(t('familia.ver_historico')) + '</a></p>' : ''));
}
async function convidar() {
  const r = await api('POST', '/familias/' + FAM.id + '/convites',
    { email: document.getElementById('ce').value, papel: document.getElementById('cp').value });
  if (r.status === 428) return $(document.getElementById('app').innerHTML + aviso(t('mfa.exigido_convite')));
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  abrir(FAM.id);
}
async function remover(userId) {
  if (!confirm(t('familia.confirmar_remocao'))) return;
  const r = await api('DELETE', '/familias/' + FAM.id + '/membros/' + userId);
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  abrir(FAM.id);
}
async function auditoria() {
  const r = await api('GET', '/familias/' + FAM.id + '/auditoria');
  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' + esc(FAM.nome) + '</a></p>' +
    '<h2>' + esc(t('familia.historico_titulo')) + '</h2>' +
    (r.eventos || []).map(e => '<div class="linha"><span>' + esc(t('auditoria.' + e.acao) || e.acao) +
      '<br><span class="sub">' + esc(e.ator_nome || t('auditoria.sistema')) + ' · ' +
      dataHora(e.created_at) + '</span></span></div>').join(''));
}

// ------------------------------------------------------------------ pessoas
const anos = (p) => {
  const a = p.nascimento_valor || '?', b = p.falecimento_valor;
  return b ? a + ' – ' + b : (p.vitalidade === 'falecida' ? a + ' – ?' : a);
};

async function pessoas() {
  const r = await api('GET', '/familias/' + FAM.id + '/pessoas');
  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' + esc(FAM.nome) + '</a></p>' +
    '<h2>' + esc(t('pessoa.titulo')) + '</h2>' +
    (r.ocultas ? '<p class="sub">' + esc(t('pessoa.ocultas', { n: r.ocultas })) + '</p>' : '') +
    ((r.pessoas || []).length
      ? (r.pessoas || []).map(p =>
          '<div class="linha"><span><a href="#" onclick="dossie(\\'' + p.id + '\\');return false"><strong>' +
          esc(p.nome_exibicao) + '</strong></a> <span class="sub">' + esc(anos(p)) + '</span>' +
          (p.eh_menor ? ' <span class="papel">' + esc(t('pessoa.eh_menor')) + '</span>' : '') + '</span>' +
          '<button class="btn mini claro" onclick="verArvore(\\'' + p.id + '\\')">' + esc(t('familia.arvore')) + '</button></div>').join('')
      : '<p class="sub">' + esc(t('pessoa.sem_pessoas')) + '</p>') +
    (pode('pessoas.criar') ? formPessoa() : ''));
}

const formPessoa = () =>
  '<h3 style="margin-top:28px">' + esc(t('pessoa.nova')) + '</h3>' +
  '<label>' + esc(t('pessoa.nome')) + '</label><input id="pn">' +
  '<label>' + esc(t('pessoa.nascimento')) + '</label><input id="pnasc" placeholder="1921">' +
  '<label>' + esc(t('pessoa.falecimento')) + '</label><input id="pfal">' +
  '<p class="sub">' + esc(t('pessoa.ajuda_data')) + '</p>' +
  '<label style="font-weight:400"><input type="checkbox" id="pmenor" style="width:auto"> ' +
    esc(t('pessoa.eh_menor')) + '</label>' +
  '<p><button class="btn" onclick="criarPessoa()">' + esc(t('acao.criar')) + '</button></p>';

async function criarPessoa() {
  const r = await api('POST', '/familias/' + FAM.id + '/pessoas', {
    nome: document.getElementById('pn').value,
    nascimento: document.getElementById('pnasc').value,
    falecimento: document.getElementById('pfal').value,
    eh_menor: document.getElementById('pmenor').checked });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  pessoas();
}

async function dossie(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id);
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const p = r.pessoa, f = r.familia;
  const grupo = (titulo, lista, extra) => lista.length
    ? '<h3 style="margin-top:22px">' + esc(titulo) + '</h3>' + lista.map(x =>
        '<div class="linha"><span><a href="#" onclick="dossie(\\'' + x.id + '\\');return false">' +
        esc(x.nome_exibicao) + '</a> <span class="sub">' + esc(anos(x)) + '</span>' +
        (extra ? extra(x) : '') + '</span></div>').join('')
    : '';
  const selo = (x) => (x.natureza && x.natureza !== 'biologico'
      ? ' <span class="papel">' + esc(t('parentesco.' + x.natureza)) + '</span>' : '')
    + (x.meio ? ' <span class="papel">' + esc(t('familia.meio_irmao')) + '</span>' : '');

  $(topo() + '<p class="sub"><a href="#" onclick="pessoas();return false">← ' + esc(t('pessoa.titulo')) + '</a></p>' +
    '<h2>' + esc(p.nome_exibicao) + '</h2>' +
    '<p class="sub">' + esc(anos(p)) + (p.local_nascimento ? ' · ' + esc(p.local_nascimento) : '') +
      (p.profissao ? ' · ' + esc(p.profissao) : '') + '</p>' +
    '<p><button class="btn mini" onclick="verArvore(\\'' + p.id + '\\')">' + esc(t('familia.ver_arvore')) + '</button></p>' +
    grupo(t('familia.pais'), f.pais, selo) +
    grupo(t('familia.unioes'), f.unioes, selo) +
    grupo(t('familia.irmaos'), f.irmaos, selo) +
    grupo(t('familia.filhos'), f.filhos, selo) +
    (f.pais.length + f.filhos.length + f.unioes.length + f.irmaos.length === 0
      ? '<p class="sub">' + esc(t('familia.sem_parentes')) + '</p>' : '') +
    (pode('parentesco.editar') ? formParentesco(p.id) : ''));
  if (pode('parentesco.editar')) preencherPessoas(p.id);
}

function formParentesco(id) {
  // Sem <script> no innerHTML: navegador nenhum executa script inserido
  // assim. O select e preenchido depois, por preencherPessoas().
  const opcoes = (chaves) => chaves.map(x =>
    '<option value="' + x + '">' + esc(t('parentesco.' + x)) + '</option>').join('');
  return '<h3 style="margin-top:26px">' + esc(t('familia.ligar')) + '</h3>' +
    '<label>' + esc(t('parentesco.tipo')) + '</label><select id="rt">' +
      opcoes(['PARENT_OF','SPOUSE_OF','PARTNER_OF','SIBLING_OF','GUARDIAN_OF']) + '</select>' +
    '<label>' + esc(t('parentesco.natureza')) + '</label><select id="rn">' +
      opcoes(['biologico','adotivo','socioafetivo','enteado','desconhecido']) + '</select>' +
    '<label>' + esc(t('parentesco.pessoa')) + '</label><select id="rp"></select>' +
    '<p><button class="btn" onclick="ligar(\\'' + id + '\\')">' + esc(t('familia.ligar')) + '</button></p>';
}

async function preencherPessoas(exceto) {
  const sel = document.getElementById('rp');
  if (!sel) return;
  const l = await api('GET', '/familias/' + FAM.id + '/pessoas');
  sel.innerHTML = (l.pessoas || []).filter(x => x.id !== exceto)
    .map(x => '<option value="' + x.id + '">' + esc(x.nome_exibicao) + '</option>').join('');
}

async function ligar(id, confirmando) {
  const alvo = document.getElementById('rp').value;
  const tipo = document.getElementById('rt').value;
  const corpo = { person_a: tipo === 'PARENT_OF' ? id : id, person_b: alvo, tipo,
    natureza: document.getElementById('rn').value, confirmo_mesmo_assim: !!confirmando };
  const r = await api('POST', '/familias/' + FAM.id + '/parentescos', corpo);
  // 422 = aviso de sanidade: a família tem a última palavra sobre a
  // própria história, então perguntamos em vez de barrar.
  if (r.status === 422) {
    if (confirm(r.erro + '\\n\\n' + t('parentesco.confirmo'))) return ligar(id, true);
    return;
  }
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  dossie(id);
}

// ------------------------------------------------------------------ árvore
async function verArvore(id, modo, geracoes) {
  MODO = modo || MODO || 'ambos'; GERACOES = geracoes || GERACOES || 4;
  const r = await api('GET', '/familias/' + FAM.id + '/arvore/' + id + '?modo=' + MODO + '&geracoes=' + GERACOES);
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const botao = (m, rot) => '<button class="btn mini ' + (MODO === m ? '' : 'claro') +
    '" onclick="verArvore(\\'' + id + '\\',\\'' + m + '\\')">' + esc(rot) + '</button> ';
  $(topo() + '<p class="sub"><a href="#" onclick="dossie(\\'' + id + '\\');return false">← ' +
      esc(t('acao.voltar_familias')) + '</a></p>' +
    '<h2>' + esc(t('familia.arvore')) + '</h2>' +
    '<p>' + botao('ancestral', t('familia.modo_ancestral')) + botao('ambos', t('familia.modo_ambos')) +
      botao('descendentes', t('familia.modo_descendentes')) +
      '<button class="btn mini claro" onclick="window.print()">' + esc(t('familia.imprimir')) + '</button></p>' +
    '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">' + svgArvore(r) + '</div>');
}

/**
 * Layout por baricentro: as gerações viram linhas e cada nó é puxado para
 * a média dos x de quem se liga a ele. Três passadas bastam para os laços
 * pararem de se cruzar em famílias reais — e é o suficiente para uma
 * árvore que precisa ser legível, não perfeita.
 */
function svgArvore(dados) {
  const L = 150, A = 96, MARGEM = 24;
  const gs = [...new Set(dados.nos.map(n => n.geracao))].sort((a,b) => a-b);
  const linhas = new Map(gs.map(g => [g, dados.nos.filter(n => n.geracao === g)]));
  const pos = new Map();
  linhas.forEach((lista, g) => lista.forEach((n, i) => pos.set(n.id, { x: i, y: gs.indexOf(g) })));

  const vizinhos = new Map(dados.nos.map(n => [n.id, []]));
  dados.arestas.forEach(e => {
    if (vizinhos.has(e.person_a) && vizinhos.has(e.person_b)) {
      vizinhos.get(e.person_a).push(e.person_b); vizinhos.get(e.person_b).push(e.person_a);
    }
  });
  for (let passada = 0; passada < 3; passada++) {
    linhas.forEach((lista) => {
      lista.forEach(n => {
        const vs = vizinhos.get(n.id).map(v => pos.get(v)).filter(Boolean);
        if (vs.length) pos.get(n.id).x = vs.reduce((s,v) => s + v.x, 0) / vs.length;
      });
      // desempata mantendo a ordem e afastando quem colidiu
      lista.map(n => ({ n, p: pos.get(n.id) })).sort((a,b) => a.p.x - b.p.x)
        .forEach((it, i, arr) => { if (i > 0 && it.p.x - arr[i-1].p.x < 1) it.p.x = arr[i-1].p.x + 1; });
    });
  }
  const xs = [...pos.values()].map(p => p.x);
  const min = Math.min(...xs), largura = (Math.max(...xs) - min) * L + 2 * MARGEM + L;
  const altura = gs.length * A + 2 * MARGEM;
  const X = (id) => MARGEM + (pos.get(id).x - min) * L + L/2;
  const Y = (id) => MARGEM + pos.get(id).y * A + 26;

  const linhasSvg = dados.arestas.map(e => {
    if (!pos.has(e.person_a) || !pos.has(e.person_b)) return '';
    const tracejado = e.natureza && e.natureza !== 'biologico' ? ' stroke-dasharray="5 4"' : '';
    const cor = e.tipo === 'PARENT_OF' ? 'var(--tema)' : 'var(--suave)';
    return '<line x1="' + X(e.person_a) + '" y1="' + Y(e.person_a) + '" x2="' + X(e.person_b) +
      '" y2="' + Y(e.person_b) + '" stroke="' + cor + '" stroke-width="1.6"' + tracejado + ' opacity=".75"/>';
  }).join('');

  const nosSvg = dados.nos.map(n => {
    const x = X(n.id), y = Y(n.id);
    const rotulo = n.nome_exibicao.length > 18 ? n.nome_exibicao.slice(0,17) + '…' : n.nome_exibicao;
    const per = [n.ano_nascimento, n.ano_falecimento].filter(Boolean).join('–');
    return '<g style="cursor:pointer" onclick="dossie(\\'' + n.id + '\\')">' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (n.id === dados.raiz ? 9 : 6) + '" fill="var(--tema)"' +
        (n.id === dados.raiz ? ' stroke="var(--tinta)" stroke-width="2"' : '') + '/>' +
      '<text x="' + x + '" y="' + (y + 24) + '" text-anchor="middle" font-size="13" ' +
        'font-weight="' + (n.id === dados.raiz ? 700 : 500) + '" fill="var(--tinta)">' + esc(rotulo) + '</text>' +
      (per ? '<text x="' + x + '" y="' + (y + 40) + '" text-anchor="middle" font-size="11" fill="var(--suave)">' +
        esc(per) + '</text>' : '') + '</g>';
  }).join('');

  return '<svg viewBox="0 0 ' + Math.max(largura, 320) + ' ' + altura + '" width="' + Math.max(largura, 320) +
    '" height="' + altura + '" role="img" aria-label="' + esc(t('familia.arvore')) + '">' +
    linhasSvg + nosSvg + '</svg>';
}
let MODO = 'ambos', GERACOES = 4;

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
    if (eu.status !== 200) return telaEntrar(t('conta.entre_com_email', { email: c.convite.email }));
    const a = await api('POST', '/convites/' + encodeURIComponent(token) + '/aceitar');
    history.replaceState(null, '', '/origena/app');
    return a.status === 200 ? abrir(a.familyId) : (EU = eu.usuario, $(topo() + aviso(a.erro)));
  }
  if (qual === 'nova-senha' && token) {
    return $(topo() + '<h2>' + esc(t('conta.nova_senha_titulo')) + '</h2><label>' + esc(t('campo.nova_senha')) + '</label>' +
      '<input id="s" type="password" autocomplete="new-password">' +
      '<button class="btn" onclick="salvarSenha(\\'' + esc(token) + '\\')">' + esc(t('acao.salvar')) + '</button>');
  }
  inicio();
}
async function salvarSenha(token) {
  const r = await api('POST', '/conta/nova-senha', { token, senha: document.getElementById('s').value });
  history.replaceState(null, '', '/origena/app');
  telaEntrar(r.status === 200 ? t('conta.senha_alterada') : r.erro);
}

rotaDoHash();
</script>`;

module.exports = { registrarPaginas, pagina, CSS };
