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
/* Grade da galeria. A proporcao fixa evita o salto de layout enquanto
   cada miniatura ainda esta pedindo a propria URL assinada. */
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin:18px 0}
.cel{margin:0;cursor:pointer}
.cel .ph{aspect-ratio:1;border-radius:12px;background:var(--borda) center/cover no-repeat}
.cel figcaption{font-size:13px;color:var(--suave);margin-top:6px;line-height:1.35}
img{max-width:100%;height:auto}
.tl{border-left:2px solid var(--borda);padding-left:18px;margin:14px 0}
.tl-ano{font-family:Lora,Georgia,serif;font-size:17px;margin:20px 0 6px;color:var(--tema)}
.tl-item{display:flex;gap:10px;padding:8px 0;align-items:flex-start}
.tl-ico{flex:0 0 auto}
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
    '<p style="margin-top:26px"><a href="#" onclick="pessoas();return false"><strong>' + esc(t('pessoa.titulo')) + '</strong></a>' +
      ' · <a href="#" onclick="memorias();return false"><strong>' + esc(t('familia.memorias')) + '</strong></a>' +
      ' · <a href="#" onclick="telaHistorias();return false"><strong>' + esc(t('familia.historias')) + '</strong></a>' +
      ' · <a href="#" onclick="telaTradicoes();return false"><strong>' + esc(t('familia.tradicoes')) + '</strong></a>' +
      ' · <a href="#" onclick="telaReliquias();return false"><strong>' + esc(t('familia.reliquias')) + '</strong></a>' +
      ' · <a href="#" onclick="telaTimeline();return false"><strong>' + esc(t('familia.linha_do_tempo')) + '</strong></a>' +
      ' · <a href="#" onclick="telaBusca();return false"><strong>' + esc(t('familia.procurar')) + '</strong></a>' +
      ' · <a href="#" onclick="telaPerguntar();return false"><strong>' + esc(t('ia.perguntar_titulo')) + '</strong></a>' +
      ' · <a href="#" onclick="telaPlanos();return false">' + esc(t('familia.planos')) + '</a></p>' +
    (pode('contribuir')
      ? '<p><a href="#" onclick="telaMissoes();return false"><strong>' + esc(t('familia.missoes')) + '</strong></a>' +
        ' · <a href="#" onclick="telaHistoriador();return false">' + esc(t('historiador.titulo')) + '</a>' +
        ' · <a href="#" onclick="telaIndice();return false">' + esc(t('familia.indice_memoria')) + '</a>' +
        ' · <a href="#" onclick="divergencias();return false">' + esc(t('familia.ver_divergencias')) + '</a>' +
        ' · <a href="#" onclick="telaAvisos();return false">' + esc(t('familia.notificacoes')) + '</a></p>'
      : '') +
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
  const fatos = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id + '/fatos');
  const contribs = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id + '/contribuicoes');
  const bio = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id + '/biografia');
  r.biografia_html = '';
  if (bio.biografia) {
    r.biografia_html = '<h3 style="margin-top:26px">' + esc(t('ia.biografia_titulo')) + '</h3>' +
      '<div class="card"><p style="margin:0;white-space:pre-wrap">' + esc(bio.biografia.corpo) + '</p></div>' +
      '<p class="sub">' + esc(t('ia.selo_ia')) + ' · ' +
      esc(t('ia.gerada_em', { data: new Date(bio.biografia.created_at).toLocaleDateString(IDIOMA),
        n: (bio.biografia.fontes || []).length })) +
      (bio.biografia.contribuicoes_desde
        ? '<br>' + esc(t('ia.contribuicoes_desde', { n: bio.biografia.contribuicoes_desde })) : '') + '</p>' +
      (pode('ia.usar') ? '<p><button class="btn mini claro" onclick="gerarBiografia(\\'' + id + '\\')">' +
        esc(t('ia.atualizar_biografia')) + '</button></p>' : '');
  } else if (pode('ia.usar')) {
    r.biografia_html = '<p style="margin-top:20px"><button class="btn mini claro" ' +
      'onclick="gerarBiografia(\\'' + id + '\\')">' + esc(t('ia.gerar_biografia')) + '</button></p>';
  }
  // O que já se preservou desta pessoa e — o que importa — o que falta.
  // Sem comparação com ninguém: é o retrato dela, não um placar (§31).
  const idx = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id + '/indice-memoria');
  r.indice_html = idx.indice
    ? '<h3 style="margin-top:26px">' + esc(t('indice.titulo')) + '</h3>' +
      '<p>' + barra(idx.indice.score) + ' <span class="sub">' +
        esc(t('indice.score', { n: idx.indice.score })) + '</span></p>' +
      '<p class="sub">' + ((idx.indice.lacunas || []).length
        ? esc(t('indice.falta')) + ': ' + idx.indice.lacunas.map(l => esc(t('indice.dim_' + l))).join(', ')
        : esc(t('indice.nada_falta'))) + '</p>' +
      ((idx.quem_sabe || []).length
        ? '<p class="sub"><strong>' + esc(t('indice.quem_sabe')) + ':</strong> ' +
          idx.quem_sabe.map(q => esc(q.nome)).join(', ') + '<br>' +
          esc(t('indice.quem_sabe_intro')) + '</p>'
        : '')
    : '';
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

    // Biografia viva (§18): versão atual + selo de IA + quantas
    // contribuições chegaram desde que ela foi escrita.
    (r.biografia_html || '') +
    (r.indice_html || '') +
    // O que sabemos — cada fato com o selo e o caminho de volta (§5).
    '<h3 style="margin-top:26px">' + esc(t('fato.titulo')) + '</h3>' +
    ((fatos.fatos || []).length
      ? (fatos.fatos || []).map(x => linhaFato(x, p.id)).join('')
      : '<p class="sub">' + esc(t('fato.sem_fatos')) + '</p>') +
    (pode('claims.criar') ? formFato(p.id) : '') +

    // O que a família contou — cru, com autor e data, nunca apagado (§15).
    '<h3 style="margin-top:26px">' + esc(t('contribuicao.titulo')) + '</h3>' +
    ((contribs.contribuicoes || []).length
      ? (contribs.contribuicoes || []).map(c =>
          '<div class="card" style="padding:16px' + (c.status === 'revisada' ? ';opacity:.65' : '') + '">' +
            '<p style="margin:0 0 6px">' + esc(c.corpo) + '</p>' +
            '<p class="sub" style="margin:0">' + esc(t('contribuicao.por')) + ' <strong>' +
              esc(c.autor_nome || t('auditoria.sistema')) + '</strong> · ' +
              esc(new Date(c.created_at).toLocaleDateString(IDIOMA)) +
              (c.status === 'revisada' ? ' · ' + esc(t('contribuicao.revisada')) : '') + '</p>' +
          '</div>').join('')
      : '<p class="sub">' + esc(t('contribuicao.sem_contribuicoes')) + '</p>') +
    (pode('contribuir')
      ? '<label>' + esc(t('contribuicao.nova')) + '</label>' +
        '<input id="cc" placeholder="' + esc(t('contribuicao.placeholder')) + '">' +
        '<p><button class="btn" onclick="contar(\\'' + p.id + '\\')">' + esc(t('acao.salvar')) + '</button></p>'
      : '') +

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

/** A fila do historiador: onde a família ainda não concorda (§17). */
async function divergencias() {
  const r = await api('GET', '/familias/' + FAM.id + '/divergencias');
  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' + esc(FAM.nome) + '</a></p>' +
    '<h2>' + esc(t('familia.divergencias')) + '</h2>' +
    ((r.divergencias || []).length
      ? (r.divergencias || []).map(d =>
          '<div class="linha"><span><strong>' + esc(d.nome_exibicao) + '</strong> · ' +
          esc(t('predicado.' + d.predicado)) + '<br><span class="sub">' +
          esc((d.valores || []).join('  \u00d7  ')) + '</span></span>' +
          '<button class="btn mini claro" onclick="deOndeVeio(\\'' + d.sujeito_id + '\\',\\'' + d.predicado +
          '\\')">' + esc(t('fato.comparar')) + '</button></div>').join('')
      : '<p class="sub">\u2014</p>'));
}

// ------------------------------------------------------------ proveniência
// A palavra "claim" não aparece em lugar nenhum daqui para baixo (§82):
// o usuário responde "o que você sabe" e "como você sabe disso".
const selo = (st) => t('status.selo_' + st) + ' ' + t('status.' + st);

function linhaFato(f, pessoaId) {
  const rotulo = t('predicado.' + f.predicado);
  return '<div class="linha"><span><strong>' + esc(rotulo) + ':</strong> ' + esc(f.valor) +
    ' <span class="papel" title="' + esc(t('status.' + f.status)) + '">' + esc(selo(f.status)) + '</span>' +
    (f.em_divergencia ? ' <span class="papel" style="background:#FBE3C7;color:#8A4B12">' +
      esc(t('status.selo_DISPUTED') + ' ' + t('fato.divergencia')) + '</span>' : '') +
    '</span><button class="btn mini claro" onclick="deOndeVeio(\\'' + pessoaId + '\\',\\'' +
      f.predicado + '\\')">' + esc(t('fato.de_onde_veio')) + '</button></div>';
}

/**
 * A tela que o §44 pede: "Quem informou que Antônio nasceu em 1921?"
 * Mostra TODAS as versões — inclusive as que a família não aceitou.
 */
async function deOndeVeio(pessoaId, predicado) {
  const r = await api('GET', '/familias/' + FAM.id + '/pessoas/' + pessoaId + '/fatos/' + predicado);
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const podeResolver = pode('claims.resolver');
  $(topo() + '<p class="sub"><a href="#" onclick="dossie(\\'' + pessoaId + '\\');return false">← ' +
      esc(t('acao.voltar_familias')) + '</a></p>' +
    '<h2>' + esc(t('predicado.' + predicado)) + '</h2>' +
    '<p class="sub">' + esc(t('fato.versoes')) + '</p>' +
    (r.versoes || []).map(v =>
      '<div class="card" style="padding:18px">' +
        '<p style="margin:0 0 6px"><strong style="font-size:19px">' + esc(v.valor) + '</strong> ' +
          '<span class="papel">' + esc(selo(v.status)) + '</span>' +
          (v.aceito ? ' <span class="papel" style="background:#DCEFE0;color:#1F5C33">' +
            esc(t('fato.aceita')) + '</span>' : '') + '</p>' +
        '<p class="sub" style="margin:0 0 10px">' + esc(t('fato.informado_por')) + ' <strong>' +
          esc(v.informado_por || t('auditoria.sistema')) + '</strong> ' + esc(t('fato.em')) + ' ' +
          esc(new Date(v.created_at).toLocaleDateString(IDIOMA)) + '</p>' +
        ((v.evidencias || []).length
          ? '<p class="sub" style="margin:0">' + esc(t('fato.fontes')) + ': ' +
            v.evidencias.map(e => (e.posicao === 'CONTRADIZ' ? '⚠ ' + esc(t('fato.contradiz')) + ' — ' : '') +
              esc(t('fonte.' + e.fonte_tipo)) + (e.fonte_titulo ? ': ' + esc(e.fonte_titulo) : '') +
              (e.fonte_referencia ? ' <em>(' + esc(e.fonte_referencia) + ')</em>' : '') +
              (e.trecho ? '<br><span style="border-left:3px solid var(--borda);padding-left:10px;display:inline-block;margin-top:6px">“' +
                esc(e.trecho) + '”</span>' : '')).join('<br>') + '</p>'
          : '<p class="sub" style="margin:0">' + esc(t('fato.nenhuma_fonte')) + '</p>') +
        (v.created_by_kind === 'ai' && podeResolver
          ? '<p style="margin:12px 0 0"><button class="btn mini" onclick="confirmarIA(\\'' + v.id + '\\',\\'' +
            pessoaId + '\\',\\'' + predicado + '\\')">' + esc(t('fato.confirmar_ia')) + '</button></p>' : '') +
        (podeResolver && !v.aceito && v.created_by_kind !== 'ai'
          ? '<p style="margin:12px 0 0"><button class="btn mini claro" onclick="aceitarVersao(\\'' + v.id +
            '\\',\\'' + pessoaId + '\\',\\'' + predicado + '\\')">' + esc(t('fato.aceitar')) + '</button></p>' : '') +
      '</div>').join('') +
    '<p class="sub">' + esc(t('fato.preservadas')) + '</p>');
}

async function aceitarVersao(claimId, pessoaId, predicado) {
  const motivo = prompt(t('fato.motivo'));
  if (!motivo) return;
  const r = await api('POST', '/familias/' + FAM.id + '/pessoas/' + pessoaId +
    '/fatos/' + predicado + '/resolver', { claim_id: claimId, motivo });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  deOndeVeio(pessoaId, predicado);
}

async function confirmarIA(claimId, pessoaId, predicado) {
  const r = await api('POST', '/familias/' + FAM.id + '/fatos/' + claimId + '/confirmar', {});
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  deOndeVeio(pessoaId, predicado);
}

function formFato(pessoaId) {
  const preds = ['nome','data_nascimento','data_falecimento','local_nascimento','profissao'];
  const fontes = ['RELATO','DOCUMENTO','REGISTRO_OFICIAL','MIDIA','PUBLICACAO'];
  return '<h3 style="margin-top:26px">' + esc(t('fato.acrescentar')) + '</h3>' +
    '<label>' + esc(t('fato.campo')) + '</label><select id="fp">' +
      preds.map(x => '<option value="' + x + '">' + esc(t('predicado.' + x)) + '</option>').join('') + '</select>' +
    '<label>' + esc(t('fato.valor')) + '</label><input id="fv">' +
    '<label>' + esc(t('fato.como_sabe')) + '</label><select id="ft">' +
      fontes.map(x => '<option value="' + x + '">' + esc(t('fonte.' + x)) + '</option>').join('') + '</select>' +
    '<label>' + esc(t('fato.fonte_titulo')) + '</label><input id="fq">' +
    '<label>' + esc(t('fato.fonte_referencia')) + '</label><input id="fr">' +
    '<p><button class="btn" onclick="guardarFato(\\'' + pessoaId + '\\')">' + esc(t('acao.salvar')) + '</button></p>';
}

async function guardarFato(pessoaId) {
  const r = await api('POST', '/familias/' + FAM.id + '/pessoas/' + pessoaId + '/fatos', {
    predicado: document.getElementById('fp').value, valor: document.getElementById('fv').value,
    fonte_tipo: document.getElementById('ft').value,
    fonte_titulo: document.getElementById('fq').value,
    fonte_referencia: document.getElementById('fr').value });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  dossie(pessoaId);
}

async function contar(pessoaId) {
  const corpo = document.getElementById('cc').value;
  const r = await api('POST', '/familias/' + FAM.id + '/pessoas/' + pessoaId + '/contribuicoes', { corpo });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  dossie(pessoaId);
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

// ------------------------------------------------------------------ mídia
// O arquivo vai do navegador DIRETO para o storage. O servidor assina a
// URL e guarda o metadado; o byte nunca passa por ele.
const MIDIA_CACHE = {};

async function hashDoArquivo(file) {
  const buf = await file.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Miniatura feita aqui, no canvas. O servidor não processa imagem (o
 * grupo não usa dependência nativa) e o navegador já tem o arquivo
 * aberto. O ORIGINAL sobe intacto e tem o hash conferido no worker.
 */
function miniatura(file, lado) {
  return new Promise((resolve) => {
    if (!/^image\\//.test(file.type)) return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * escala));
      c.height = Math.max(1, Math.round(img.height * escala));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b ? { blob: b, largura: c.width, altura: c.height } : null), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

const tipoDoArquivo = (f) => /^image\\//.test(f.type) ? 'FOTO'
  : /^video\\//.test(f.type) ? 'VIDEO' : /^audio\\//.test(f.type) ? 'AUDIO' : 'DOCUMENTO';

async function enviarArquivos(lista) {
  const arqs = [...lista];
  const painel = document.getElementById('envio');
  let enviados = 0, duplicadas = 0;
  for (const file of arqs) {
    painel.textContent = t('midia.enviando', { n: enviados + 1, total: arqs.length });
    try {
      const sha = await hashDoArquivo(file);
      const prep = await api('POST', '/familias/' + FAM.id + '/midias/preparar', {
        nome: file.name, bytes: file.size, sha256: sha, mime: file.type, tipo: tipoDoArquivo(file) });
      if (prep.status >= 400) { painel.innerHTML = aviso(prep.erro); continue; }
      if (prep.duplicado) { duplicadas++; enviados++; continue; }

      const put = await fetch(prep.url_envio, { method: 'PUT', body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      if (!put.ok) { painel.innerHTML = aviso(t('erro.generico')); continue; }
      await api('POST', '/familias/' + FAM.id + '/midias/' + prep.media_id + '/confirmar');

      // miniatura: derivado, não original
      const mini = await miniatura(file, 512);
      if (mini) {
        const mBuf = await mini.blob.arrayBuffer();
        const mHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', mBuf))]
          .map(b => b.toString(16).padStart(2, '0')).join('');
        const d = await api('POST', '/familias/' + FAM.id + '/midias/' + prep.media_id + '/derivados', {
          papel: 'THUMB', sha256: mHash, bytes: mini.blob.size, mime: 'image/jpeg',
          largura: mini.largura, altura: mini.altura });
        if (d.url_envio) await fetch(d.url_envio, { method: 'PUT', body: mini.blob,
          headers: { 'Content-Type': 'image/jpeg' } });
      }
      enviados++;
    } catch (_) { painel.innerHTML = aviso(t('erro.generico')); }
  }
  painel.textContent = duplicadas ? t('midia.duplicada') : '';
  memorias();
}

async function urlDe(id) {
  if (MIDIA_CACHE[id]) return MIDIA_CACHE[id];
  const r = await api('GET', '/familias/' + FAM.id + '/midias/' + id + '/url');
  if (r.status >= 400) return null;
  MIDIA_CACHE[id] = r.url;
  return r.url;
}

async function memorias(cursor) {
  const r = await api('GET', '/familias/' + FAM.id + '/midias?limite=60' +
    (cursor ? '&antes_de=' + encodeURIComponent(cursor) : ''));
  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' + esc(FAM.nome) + '</a></p>' +
    '<h2>' + esc(t('midia.titulo')) + '</h2>' +
    (r.ocultas ? '<p class="sub">' + esc(t('midia.ocultas', { n: r.ocultas })) + '</p>' : '') +
    (pode('contribuir')
      ? '<p><input type="file" id="arqs" multiple accept="image/*,video/*,audio/*,.pdf"> ' +
        '<button class="btn" onclick="enviarArquivos(document.getElementById(\\'arqs\\').files)">' +
        esc(t('midia.enviar')) + '</button></p><p class="sub" id="envio"></p>' : '<p id="envio"></p>') +
    ((r.midias || []).length
      ? '<div class="grade">' + r.midias.map(m =>
          '<figure class="cel" onclick="verMidia(\\'' + m.id + '\\')" data-thumb="' + (m.thumb_id || m.id) + '">' +
          '<div class="ph"></div><figcaption>' + esc(m.titulo || '') +
          (m.status !== 'pronta' ? '<br><span class="papel">' + esc(t('midia.' +
            (m.status === 'quarentena' ? 'quarentena' : m.status === 'falhou' ? 'falhou' : 'processando'))) +
            '</span>' : '') +
          (m.pessoas ? '<br><span class="sub">' + m.pessoas + ' 👤</span>' : '') +
          '</figcaption></figure>').join('') + '</div>' +
        (r.proximo_cursor && r.midias.length >= 60
          ? '<p><button class="btn claro" onclick="memorias(\\'' + r.proximo_cursor + '\\')">' +
            esc(t('midia.carregar_mais')) + '</button></p>' : '')
      : '<p class="sub">' + esc(t('midia.sem_midias')) + '</p>'));
  // As imagens carregam DEPOIS da grade: a tela aparece na hora e cada
  // miniatura pede a própria URL assinada (§119).
  for (const cel of document.querySelectorAll('.cel')) {
    urlDe(cel.dataset.thumb).then(u => { if (u) cel.querySelector('.ph').style.backgroundImage = 'url(' + u + ')'; });
  }
}

async function verMidia(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/midias/' + id);
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const m = r.midia;
  const u = await urlDe((r.derivados.find(d => d.papel === 'THUMB') || {}).id || id);
  $(topo() + '<p class="sub"><a href="#" onclick="memorias();return false">← ' + esc(t('midia.titulo')) + '</a></p>' +
    (u ? '<img src="' + u + '" alt="' + esc(m.titulo || '') + '" style="max-width:100%;border-radius:14px">' : '') +
    '<h2>' + esc(m.titulo || t('midia.titulo')) + '</h2>' +
    '<p class="sub">' + [m.capturada_valor, m.local_texto].filter(Boolean).map(esc).join(' · ') + '</p>' +
    (m.descricao ? '<p>' + esc(m.descricao) + '</p>' : '') +
    '<h3>' + esc(t('midia.quem_aparece')) + '</h3>' +
    ((r.pessoas || []).length
      ? r.pessoas.map(x => '<div class="linha"><span>' +
          (x.origem === 'IA_SUGERIDA'
            ? esc(t('midia.possivelmente', { nome: x.nome_exibicao, pct: x.confianca || '?' }))
            : '<a href="#" onclick="dossie(\\'' + x.person_id + '\\');return false">' + esc(x.nome_exibicao) + '</a>') +
          (x.confirmado_em ? ' <span class="sub">' + esc(t('midia.confirmada_por',
            { nome: x.confirmado_por_nome || '', data: new Date(x.confirmado_em).toLocaleDateString(IDIOMA) })) + '</span>' : '') +
          '</span>' + (x.origem === 'IA_SUGERIDA' && pode('contribuir')
            ? '<button class="btn mini" onclick="confirmarPessoa(\\'' + x.id + '\\',\\'' + id + '\\')">' +
              esc(t('midia.confirmar')) + '</button>' : '') + '</div>').join('')
      : '<p class="sub">' + esc(t('midia.sem_pessoas')) + '</p>') +
    ((r.contribuicoes || []).length
      ? '<h3>' + esc(t('contribuicao.titulo')) + '</h3>' + r.contribuicoes.map(c =>
          '<div class="card" style="padding:16px"><p style="margin:0 0 6px">' + esc(c.corpo) + '</p>' +
          '<p class="sub" style="margin:0">' + esc(t('contribuicao.por')) + ' <strong>' +
          esc(c.autor_nome || '') + '</strong> · ' + esc(new Date(c.created_at).toLocaleDateString(IDIOMA)) +
          '</p></div>').join('')
      : '') +
    (m.tipo === 'DOCUMENTO' ? '<div id="doc-ia"></div>' : '') +
    (pode('contribuir') ? formHistoria(id) : '') +
    '<p class="sub" style="margin-top:20px">' + esc(t('midia.original_intacto')) + '</p>');
  if (m.tipo === 'DOCUMENTO') carregarAchados(id);
  if (pode('contribuir')) {
    const l = await api('GET', '/familias/' + FAM.id + '/pessoas');
    const sel = document.getElementById('hq');
    if (sel) sel.innerHTML = (l.pessoas || []).map(x =>
      '<option value="' + x.id + '">' + esc(x.nome_exibicao) + '</option>').join('');
  }
}

function formHistoria(id) {
  const campo = (chave, idc, dica) => '<label>' + esc(t('historia.' + chave)) + '</label>' +
    '<input id="' + idc + '"' + (dica ? ' placeholder="' + esc(dica) + '"' : '') + '>';
  return '<h3 style="margin-top:26px">' + esc(t('historia.titulo')) + '</h3>' +
    '<p class="sub">' + esc(t('historia.intro')) + '</p>' +
    '<label>' + esc(t('historia.quem')) + '</label><select id="hq" multiple size="4"></select>' +
    campo('quando', 'hw', t('pessoa.ajuda_data')) +
    campo('onde', 'ho') +
    campo('titulo_curto', 'ht') +
    campo('ocasiao', 'hc') +
    campo('aconteceu', 'ha') +
    campo('porque_importa', 'hp') +
    '<p><button class="btn" onclick="guardarHistoria(\\'' + id + '\\')">' + esc(t('historia.guardar')) + '</button></p>';
}

async function guardarHistoria(id) {
  const sel = document.getElementById('hq');
  const r = await api('POST', '/familias/' + FAM.id + '/midias/' + id + '/historia', {
    pessoas: [...sel.selectedOptions].map(o => o.value),
    quando: document.getElementById('hw').value, onde: document.getElementById('ho').value,
    titulo: document.getElementById('ht').value, ocasiao: document.getElementById('hc').value,
    aconteceu: document.getElementById('ha').value,
    porque_importa: document.getElementById('hp').value });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verMidia(id);
}

// ------------------------------------------- o que a IA leu no documento
// A tela inteira existe para deixar UMA coisa clara: isto é sugestão, não
// fato. Cada achado só vira fato da família quando alguém apontar de quem
// o papel fala — e o trecho citado fica à vista para conferir (§24).
async function carregarAchados(mediaId) {
  const alvo = document.getElementById('doc-ia');
  if (!alvo) return;
  const r = await api('GET', '/familias/' + FAM.id + '/midias/' + mediaId + '/achados');
  const achados = r.achados || [];
  const sugeridos = achados.filter(a => a.status === 'sugerido');
  alvo.innerHTML = '<h3 style="margin-top:26px">' + esc(t('documento.leitura_titulo')) + '</h3>' +
    '<p class="sub">' + esc(t('documento.leitura_intro')) + '</p>' +
    (pode('ia.usar') ? '<p><button class="btn" id="doc-ler" onclick="lerDocumento(\\'' + mediaId + '\\')">' +
      esc(t(achados.length ? 'documento.reler' : 'documento.ler')) + '</button></p>' : '') +
    (achados.length ? achados.map(a => '<div class="card" style="padding:16px;text-align:left">' +
      '<p style="margin:0 0 4px"><strong>' + esc(t('predicado.' + a.predicado) || a.predicado) +
        '</strong>: ' + esc(a.valor) +
        (a.pessoa_texto ? ' <span class="sub">— ' + esc(a.pessoa_texto) + '</span>' : '') + '</p>' +
      (a.trecho ? '<p class="sub" style="margin:0 0 8px">' +
        esc(t('documento.trecho', { trecho: a.trecho })) + '</p>' : '') +
      (a.status === 'sugerido' && pode('claims.criar')
        ? '<div class="linha"><span class="sub">' + esc(t('documento.achado_de')) + '</span>' +
          '<span><select id="ap_' + a.id + '" class="ap-pessoa"></select> ' +
          '<button class="btn mini" onclick="aceitarAchado(\\'' + a.id + '\\',\\'' + mediaId + '\\')">' +
            esc(t('documento.aceitar')) + '</button> ' +
          '<button class="btn mini sec" onclick="descartarAchado(\\'' + a.id + '\\',\\'' + mediaId + '\\')">' +
            esc(t('documento.descartar')) + '</button></span></div>'
        : '<p class="sub" style="margin:0">' + esc(a.status === 'aceito'
          ? t('documento.aceito', { nome: a.pessoa_nome || '' })
          : t('documento.descartado', { nome: a.decidido_por_nome || '' })) + '</p>') +
      '</div>').join('')
      : '<p class="sub">' + esc(t('documento.sem_achados')) + '</p>');

  if (sugeridos.length && pode('claims.criar')) {
    const l = await api('GET', '/familias/' + FAM.id + '/pessoas');
    const opcoes = (l.pessoas || []).map(x =>
      '<option value="' + x.id + '">' + esc(x.nome_exibicao) + '</option>').join('');
    document.querySelectorAll('.ap-pessoa').forEach(s => { s.innerHTML = '<option value=""></option>' + opcoes; });
  }
}

async function lerDocumento(mediaId, confirmando) {
  const b = document.getElementById('doc-ler');
  if (b && confirmando) { b.disabled = true; b.textContent = t('documento.lendo'); }
  const r = await api('POST', '/familias/' + FAM.id + '/midias/' + mediaId + '/analisar',
    confirmando ? { confirmar: true } : {});
  if (r.status === 503) return alert(t('ia.indisponivel'));
  if (r.status >= 400) { carregarAchados(mediaId); return alert(r.erro); }
  if (r.cotacao && !confirmando) {
    if (confirm(t('ia.custara', { n: r.cotacao.creditos }))) return lerDocumento(mediaId, true);
    return;
  }
  await carregarAchados(mediaId);
  if (!(r.achados || []).length) alert(t('documento.nada_encontrado'));
}

async function aceitarAchado(achadoId, mediaId) {
  const sel = document.getElementById('ap_' + achadoId);
  if (!sel || !sel.value) return alert(t('documento.escolha_pessoa'));
  const r = await api('POST', '/familias/' + FAM.id + '/achados/' + achadoId + '/aceitar',
    { pessoa: sel.value });
  if (r.status >= 400) return alert(r.erro);
  carregarAchados(mediaId);
}

async function descartarAchado(achadoId, mediaId) {
  const r = await api('POST', '/familias/' + FAM.id + '/achados/' + achadoId + '/descartar');
  if (r.status >= 400) return alert(r.erro);
  carregarAchados(mediaId);
}

async function confirmarPessoa(idId, mediaId) {
  const r = await api('POST', '/familias/' + FAM.id + '/identificacoes/' + idId + '/confirmar');
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verMidia(mediaId);
}

// ------------------------------------------------------------------ busca
// Uma caixa para o acervo inteiro (§43). O servidor decide o que aparece;
// esta tela só apresenta.
async function telaBusca(offset) {
  const q = document.getElementById('bq') ? document.getElementById('bq').value : '';
  const tipo = document.getElementById('bt') ? document.getElementById('bt').value : '';
  const r = q !== '' || tipo !== ''
    ? await api('GET', '/familias/' + FAM.id + '/busca?q=' + encodeURIComponent(q) +
        (tipo ? '&tipos=' + tipo : '') + (offset ? '&offset=' + offset : ''))
    : { resultados: null };
  const tipos = ['', 'person', 'media', 'document', 'story', 'contribution',
    'tradition', 'recipe', 'heirloom'];
  const abrirDe = (x) => x.ref_tipo === 'person' ? "dossie('" + x.ref_id + "')"
    : x.ref_tipo === 'story' ? "verHistoria('" + x.ref_id + "')"
    : (x.ref_tipo === 'tradition' || x.ref_tipo === 'recipe') ? "verTradicao('" + x.ref_id + "')"
    : x.ref_tipo === 'heirloom' ? "verReliquia('" + x.ref_id + "')"
    : "verMidia('" + x.ref_id + "')";
  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' + esc(FAM.nome) + '</a></p>' +
    '<h2>' + esc(t('busca.titulo')) + '</h2>' +
    '<label>' + esc(t('busca.campo')) + '</label>' +
    '<input id="bq" value="' + esc(q) + '" placeholder="' + esc(t('busca.placeholder')) + '"' +
      ' onkeydown="if(event.key===\\'Enter\\')telaBusca()">' +
    '<label>' + esc(t('busca.tipo')) + '</label><select id="bt">' +
      tipos.map(x => '<option value="' + x + '"' + (x === tipo ? ' selected' : '') + '>' +
        esc(x ? t('busca.tipo_' + x) : '—') + '</option>').join('') + '</select>' +
    '<p><button class="btn" onclick="telaBusca()">' + esc(t('busca.titulo')) + '</button></p>' +
    (r.resultados === null ? '' :
      (r.resultados.length
        ? '<p class="sub">' + esc(t('busca.resultados', { n: r.resultados.length })) +
          (r.ocultos ? ' · ' + esc(t('busca.ocultos', { n: r.ocultos })) : '') + '</p>' +
          r.resultados.map(x =>
            '<div class="card" style="padding:16px;cursor:pointer" onclick="' + abrirDe(x) + '">' +
            '<p style="margin:0 0 4px"><span class="papel">' + esc(t('busca.tipo_' + x.ref_tipo)) + '</span> ' +
            '<strong>' + esc(x.titulo || '') + '</strong></p>' +
            (x.trecho ? '<p class="sub" style="margin:0">' +
              esc(x.trecho).replace(/«/g, '<mark>').replace(/»/g, '</mark>') + '</p>' : '') +
            '</div>').join('')
        : '<p class="sub">' + esc(t('busca.nada')) + '</p>')));
  const campo = document.getElementById('bq');
  if (campo && !offset) campo.focus();
}

// --------------------------------------------------------------- histórias
async function telaHistorias() {
  const r = await api('GET', '/familias/' + FAM.id + '/historias');
  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' + esc(FAM.nome) + '</a></p>' +
    '<h2>' + esc(t('historia_mod.titulo')) + '</h2>' +
    ((r.historias || []).length
      ? r.historias.map(x =>
          '<div class="card" style="padding:18px;cursor:pointer" onclick="verHistoria(\\'' + x.id + '\\')">' +
          '<p style="margin:0 0 4px"><strong>' + esc(x.titulo) + '</strong>' +
          (x.ocorrido_valor ? ' <span class="sub">· ' + esc(x.ocorrido_valor) + '</span>' : '') + '</p>' +
          '<p class="sub" style="margin:0">' + esc(x.resumo || '') + '</p>' +
          (x.contada_por ? '<p class="sub" style="margin:6px 0 0">' + esc(t('historia_mod.por')) + ' ' +
            esc(x.contada_por) + '</p>' : '') +
          '</div>').join('')
      : '<p class="sub">' + esc(t('historia_mod.sem_historias')) + '</p>') +
    (pode('contribuir') ? formHistoriaNova() : ''));
  if (pode('contribuir')) preencherSelPessoas('hn_quem');
}

function formHistoriaNova() {
  return '<h3 style="margin-top:26px">' + esc(t('historia_mod.nova')) + '</h3>' +
    '<label>' + esc(t('historia_mod.nome')) + '</label><input id="hn_t">' +
    '<label>' + esc(t('historia_mod.corpo')) + '</label>' +
    '<textarea id="hn_c" rows="5" style="width:100%;min-height:120px;padding:12px 14px;' +
      'border:1px solid var(--borda);border-radius:10px;font:16px Inter,system-ui,sans-serif;' +
      'background:var(--card);color:var(--tinta)" placeholder="' + esc(t('historia_mod.placeholder')) + '"></textarea>' +
    '<label>' + esc(t('historia_mod.contada_por')) + '</label><select id="hn_quem"><option value=""></option></select>' +
    '<label>' + esc(t('historia_mod.ocorrido')) + '</label><input id="hn_q" placeholder="' + esc(t('pessoa.ajuda_data')) + '">' +
    '<label>' + esc(t('historia_mod.local')) + '</label><input id="hn_l">' +
    '<p><button class="btn" onclick="criarHistoria()">' + esc(t('historia_mod.guardar')) + '</button></p>';
}

async function preencherSelPessoas(idSel) {
  const sel = document.getElementById(idSel);
  if (!sel) return;
  const l = await api('GET', '/familias/' + FAM.id + '/pessoas');
  const opcoes = (l.pessoas || []).map(x =>
    '<option value="' + x.id + '">' + esc(x.nome_exibicao) + '</option>').join('');
  // mantém a opção vazia quando o select a tiver (contada_por é opcional)
  sel.innerHTML = (sel.innerHTML.indexOf('value=""') >= 0 ? '<option value=""></option>' : '') + opcoes;
}

async function criarHistoria() {
  const quem = document.getElementById('hn_quem').value;
  const r = await api('POST', '/familias/' + FAM.id + '/historias', {
    titulo: document.getElementById('hn_t').value,
    corpo: document.getElementById('hn_c').value,
    contada_por: quem || null, pessoas: quem ? [quem] : [],
    ocorrido: document.getElementById('hn_q').value,
    local: document.getElementById('hn_l').value });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verHistoria(r.historia.id);
}

async function verHistoria(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/historias/' + id);
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const h = r.historia;
  $(topo() + '<p class="sub"><a href="#" onclick="telaHistorias();return false">← ' +
      esc(t('historia_mod.titulo')) + '</a></p>' +
    '<h2>' + esc(h.titulo) + '</h2>' +
    '<p class="sub">' + [h.contada_por ? t('historia_mod.por') + ' ' + h.contada_por : '',
      h.ocorrido_valor, h.local_texto].filter(Boolean).map(esc).join(' · ') + '</p>' +
    '<div class="card"><p style="margin:0;white-space:pre-wrap">' + esc(r.corpo) + '</p></div>' +
    ((r.mencoes || []).filter(m => m.person_id).length
      ? '<p class="sub">' + esc(t('historia_mod.menciona')) + ': ' +
        r.mencoes.filter(m => m.person_id).map(m =>
          '<a href="#" onclick="dossie(\\'' + m.person_id + '\\');return false">' +
          esc(m.nome_exibicao) + '</a>').join(', ') + '</p>' : '') +
    (pode('editar')
      ? '<h3>' + esc(t('historia_mod.editar')) + '</h3>' +
        '<textarea id="he_c" rows="5" style="width:100%;min-height:120px;padding:12px 14px;' +
        'border:1px solid var(--borda);border-radius:10px;font:16px Inter,system-ui,sans-serif;' +
        'background:var(--card);color:var(--tinta)">' + esc(r.corpo) + '</textarea>' +
        '<p><button class="btn" onclick="editarHistoria(\\'' + id + '\\')">' +
        esc(t('historia_mod.guardar')) + '</button></p>' : '') +
    ((r.versoes || []).length > 1
      ? '<h3>' + esc(t('historia_mod.versoes')) + '</h3>' +
        r.versoes.slice(1).map(v =>
          '<div class="card" style="padding:14px;opacity:.7">' +
          '<p class="sub" style="margin:0 0 6px">' + esc(t('historia_mod.versao', { n: v.versao })) +
          (v.editado_por_nome ? ' · ' + esc(t('historia_mod.editada_por',
            { nome: v.editado_por_nome, data: new Date(v.created_at).toLocaleDateString(IDIOMA) })) : '') +
          (v.nota_edicao ? ' · ' + esc(v.nota_edicao) : '') + '</p>' +
          '<p style="margin:0;white-space:pre-wrap">' + esc(v.corpo) + '</p></div>').join('') +
        '<p class="sub">' + esc(t('historia_mod.preservadas')) + '</p>'
      : ''));
}

async function editarHistoria(id) {
  const r = await api('PATCH', '/familias/' + FAM.id + '/historias/' + id,
    { corpo: document.getElementById('he_c').value });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verHistoria(id);
}

// --------------------------------------------------------------- timeline
// A régua vertical da família (§33). A IMPRECISÃO aparece como foi dita
// ("anos 1940", "c. 1890") — a tela nunca inventa um dia exato. Item sem
// data vai para o fim, rotulado: presença sem afirmação de ordem.
async function telaTimeline(pessoaId) {
  const r = await api('GET', '/familias/' + FAM.id + '/timeline' +
    (pessoaId ? '?pessoa=' + pessoaId : ''));
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const abrirDe = (i) => i.ref_tipo === 'person' ? "dossie(\\'" + i.ref_id + "\\')"
    : i.ref_tipo === 'story' ? "verHistoria(\\'" + i.ref_id + "\\')"
    : i.ref_tipo === 'media' ? "verMidia(\\'" + i.ref_id + "\\')"
    : i.ref_tipo === 'tradition' ? "verTradicao(\\'" + i.ref_id + "\\')"
    : i.ref_tipo === 'heirloom' ? "verReliquia(\\'" + i.ref_id + "\\')" : '';
  const ICONES = { nascimento: '🌱', falecimento: '🕯', casamento: '💍',
    evento: '📌', foto: '📷', historia: '📖', tradicao: '🍲', reliquia: '💍' };
  const comData = (r.itens || []).filter(i => i.data_ini);
  const semData = (r.itens || []).filter(i => !i.data_ini);
  let anoAnterior = null;
  const linha = (i) => {
    const ano = i.data_ini ? String(i.data_ini).slice(0, 4) : null;
    const cab = ano && ano !== anoAnterior
      ? '<h3 class="tl-ano">' + esc(ano) + '</h3>' : '';
    anoAnterior = ano;
    const onclick = abrirDe(i);
    return cab + '<div class="tl-item"' + (onclick ? ' style="cursor:pointer" onclick="' + onclick + '"' : '') + '>' +
      '<span class="tl-ico">' + (ICONES[i.tipo] || '·') + '</span>' +
      '<span><strong>' + esc(i.titulo) + '</strong>' +
      '<br><span class="sub">' + esc(t('tempo.tipo_' + i.tipo)) +
      (i.data_valor ? ' · ' + esc(i.data_valor) : '') +
      (i.local_texto ? ' · ' + esc(i.local_texto) : '') + '</span></span></div>';
  };
  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' + esc(FAM.nome) + '</a></p>' +
    '<h2>' + esc(pessoaId ? t('tempo.titulo') : t('tempo.titulo')) + '</h2>' +
    (r.ocultos ? '<p class="sub">' + esc(t('tempo.ocultos', { n: r.ocultos })) + '</p>' : '') +
    (comData.length || semData.length
      ? '<div class="tl">' + comData.map(linha).join('') +
        (semData.length
          ? '<h3 class="tl-ano">' + esc(t('tempo.sem_data')) + '</h3>' +
            semData.map(i => { anoAnterior = 'x'; return linha(i); }).join('')
          : '') + '</div>'
      : '<p class="sub">' + esc(t('tempo.sem_itens')) + '</p>') +
    (pode('contribuir') ? formEvento() : ''));
  if (pode('contribuir')) preencherSelPessoas('ev_quem');
}

function formEvento() {
  const tipos = ['reuniao','casamento','mudanca','viagem','formatura','trabalho','outro'];
  return '<h3 style="margin-top:26px">' + esc(t('evento.novo')) + '</h3>' +
    '<label>' + esc(t('evento.nome')) + '</label><input id="ev_t">' +
    '<label>' + esc(t('evento.tipo')) + '</label><select id="ev_tipo">' +
      tipos.map(x => '<option value="' + x + '">' + esc(t('evento.' + x)) + '</option>').join('') + '</select>' +
    '<label>' + esc(t('evento.quando')) + '</label><input id="ev_q" placeholder="' + esc(t('pessoa.ajuda_data')) + '">' +
    '<label>' + esc(t('evento.onde')) + '</label><input id="ev_l">' +
    '<label>' + esc(t('evento.quem')) + '</label><select id="ev_quem" multiple size="4"></select>' +
    '<label>' + esc(t('evento.descricao')) + '</label><input id="ev_d">' +
    '<p><button class="btn" onclick="criarEvento()">' + esc(t('acao.salvar')) + '</button></p>';
}

async function criarEvento() {
  const sel = document.getElementById('ev_quem');
  const r = await api('POST', '/familias/' + FAM.id + '/eventos', {
    titulo: document.getElementById('ev_t').value,
    tipo: document.getElementById('ev_tipo').value,
    data: document.getElementById('ev_q').value,
    local: document.getElementById('ev_l').value,
    descricao: document.getElementById('ev_d').value,
    participantes: [...sel.selectedOptions].map(o => o.value) });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  telaTimeline();
}

// ----------------------------------------------------------- IA (Fase 7)
// O preço aparece ANTES (§53), o selo de IA aparece SEMPRE (§88), e a
// resposta traz as fontes — sem fonte, não é memória, é ficção.
async function gerarBiografia(pessoaId, confirmando) {
  const r = await api('POST', '/familias/' + FAM.id + '/pessoas/' + pessoaId + '/biografia',
    confirmando ? { confirmar: true } : {});
  if (r.status === 503) return alert(t('ia.indisponivel'));
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  if (r.cotacao && !confirmando) {
    if (confirm(t('ia.custara', { n: r.cotacao.creditos }))) return gerarBiografia(pessoaId, true);
    return;
  }
  dossie(pessoaId);
}

async function telaPerguntar(confirmando, pergunta) {
  const q = pergunta || (document.getElementById('pq') ? document.getElementById('pq').value : '');
  let corpo = '';
  if (q && confirmando) {
    const r = await api('POST', '/familias/' + FAM.id + '/perguntar', { pergunta: q, confirmar: true });
    if (r.status === 503) corpo = aviso(t('ia.indisponivel'));
    else if (r.status >= 400) corpo = aviso(r.erro);
    else {
      corpo = '<div class="card"><p style="margin:0;white-space:pre-wrap">' + esc(r.resposta) + '</p></div>' +
        '<p class="sub">' + esc(t('ia.selo_ia')) + '</p>' +
        ((r.fontes || []).length
          ? '<p class="sub"><strong>' + esc(t('ia.fontes_resposta')) + ':</strong> ' +
            r.fontes.map(f => esc(t('busca.tipo_' + f.tipo) || f.tipo)).join(', ') + '</p>' : '') +
        (r.incerteza ? '<p class="sub"><strong>' + esc(t('ia.incerteza')) + ':</strong> ' +
          esc(r.incerteza) + '</p>' : '');
    }
  } else if (q && !confirmando) {
    const cot = await api('POST', '/familias/' + FAM.id + '/perguntar', { pergunta: q });
    if (cot.status === 503) corpo = aviso(t('ia.indisponivel'));
    else if (cot.cotacao && confirm(t('ia.custara', { n: cot.cotacao.creditos })))
      return telaPerguntar(true, q);
  }
  const cred = await api('GET', '/familias/' + FAM.id + '/creditos');
  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' + esc(FAM.nome) + '</a></p>' +
    '<h2>' + esc(t('ia.perguntar_titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('ia.saldo', { n: cred.saldo != null ? cred.saldo : '?' })) + '</p>' +
    '<label>' + esc(t('ia.perguntar_campo')) + '</label>' +
    '<input id="pq" value="' + esc(q || '') + '" placeholder="' + esc(t('ia.perguntar_placeholder')) + '">' +
    '<p><button class="btn" onclick="telaPerguntar()">' + esc(t('ia.perguntar_titulo')) + '</button></p>' +
    corpo);
}

// ------------------------------------------------ tradições (Fase 2.1)
// A receita, a reza, a música e o ofício moram na mesma tela — o que muda
// é a categoria. A receita ganha ingredientes e preparo; e o manuscrito
// da avó continua sendo o original, com a transcrição do lado.
let CAT = '';
const CATS = ['RECEITA','CELEBRACAO','MUSICA','EXPRESSAO','SABER','RELIQUIA','LUGAR','HISTORIA'];
const voltarFamilia = () => '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' +
  esc(FAM.nome) + '</a></p>';
const area = (id, valor, dica) => '<textarea id="' + id + '" rows="4" style="width:100%;' +
  'min-height:96px;padding:12px 14px;border:1px solid var(--borda);border-radius:10px;' +
  'font:16px Inter,system-ui,sans-serif;background:var(--card);color:var(--tinta)"' +
  (dica ? ' placeholder="' + esc(dica) + '"' : '') + '>' + esc(valor || '') + '</textarea>';

async function telaTradicoes(cat) {
  if (cat !== undefined) CAT = cat;
  const r = await api('GET', '/familias/' + FAM.id + '/tradicoes' + (CAT ? '?categoria=' + CAT : ''));
  const filtro = (c, rot) => '<button class="btn mini ' + (CAT === c ? '' : 'claro') +
    '" onclick="telaTradicoes(\\'' + c + '\\')">' + esc(rot) + '</button> ';
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('tradicao.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('tradicao.intro')) + '</p>' +
    '<p>' + filtro('', t('tradicao.filtro_todas')) +
      CATS.map(c => filtro(c, t('tradicao.cat_' + c))).join('') + '</p>' +
    ((r.tradicoes || []).length
      ? r.tradicoes.map(x =>
          '<div class="card" style="padding:18px;cursor:pointer" onclick="verTradicao(\\'' + x.id + '\\')">' +
          '<p style="margin:0 0 4px"><span class="papel">' + esc(t('tradicao.cat_' + x.categoria)) +
            '</span> <strong>' + esc(x.titulo) + '</strong>' +
            (x.desde_valor ? ' <span class="sub">· ' + esc(x.desde_valor) + '</span>' : '') + '</p>' +
          (x.de_quem ? '<p class="sub" style="margin:0">' + esc(t('tradicao.de_quem')) + ': ' +
            esc(x.de_quem) + '</p>' : '') +
          (x.aprendizes ? '<p class="sub" style="margin:4px 0 0">' +
            esc(t('tradicao.aprendizes_n', { n: x.aprendizes })) + '</p>' : '') +
          '</div>').join('')
      : '<p class="sub">' + esc(t('tradicao.sem_tradicoes')) + '</p>') +
    (pode('contribuir') ? formTradicao() : ''));
  if (pode('contribuir')) { preencherSelPessoas('tr_quem'); alternarReceita(); }
}

function formTradicao() {
  return '<h3 style="margin-top:28px">' + esc(t('tradicao.nova')) + '</h3>' +
    '<label>' + esc(t('tradicao.categoria')) + '</label>' +
    '<select id="tr_cat" onchange="alternarReceita()">' +
      CATS.map(c => '<option value="' + c + '">' + esc(t('tradicao.cat_' + c)) + '</option>').join('') +
    '</select>' +
    '<label>' + esc(t('tradicao.nome')) + '</label><input id="tr_t">' +
    '<label>' + esc(t('tradicao.corpo')) + '</label>' + area('tr_c', '') +
    '<label>' + esc(t('tradicao.de_quem')) + '</label>' +
      '<select id="tr_quem"><option value=""></option></select>' +
    '<label>' + esc(t('tradicao.origem')) + '</label><input id="tr_o">' +
    '<label>' + esc(t('tradicao.ocasioes')) + '</label><input id="tr_oc">' +
    '<label>' + esc(t('tradicao.desde')) + '</label>' +
      '<input id="tr_d" placeholder="' + esc(t('pessoa.ajuda_data')) + '">' +
    '<label>' + esc(t('tradicao.local')) + '</label><input id="tr_l">' +
    '<div id="tr_receita">' +
      '<label>' + esc(t('tradicao.ingredientes')) + '</label>' + area('tr_i', '') +
      '<label>' + esc(t('tradicao.preparo')) + '</label>' + area('tr_p', '') +
      '<label>' + esc(t('tradicao.rendimento')) + '</label><input id="tr_r">' +
      '<label>' + esc(t('tradicao.tempo')) + '</label><input id="tr_tp">' +
    '</div>' +
    '<p><button class="btn" onclick="criarTradicao()">' + esc(t('tradicao.guardar')) + '</button></p>';
}

function alternarReceita() {
  const sel = document.getElementById('tr_cat'), bloco = document.getElementById('tr_receita');
  if (sel && bloco) bloco.style.display = sel.value === 'RECEITA' ? 'block' : 'none';
}

const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };

async function criarTradicao() {
  const r = await api('POST', '/familias/' + FAM.id + '/tradicoes', {
    categoria: val('tr_cat'), titulo: val('tr_t'), corpo: val('tr_c'),
    person_id: val('tr_quem') || null, origem: val('tr_o'), ocasioes: val('tr_oc'),
    desde: val('tr_d'), local: val('tr_l'),
    ingredientes: val('tr_i'), preparo: val('tr_p'),
    rendimento: val('tr_r'), tempo: val('tr_tp') });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verTradicao(r.tradicao.id);
}

async function verTradicao(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/tradicoes/' + id);
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const x = r.tradicao, rec = x.receita;
  $(topo() + '<p class="sub"><a href="#" onclick="telaTradicoes();return false">← ' +
      esc(t('tradicao.titulo')) + '</a></p>' +
    '<h2>' + esc(x.titulo) + '</h2>' +
    '<p class="sub"><span class="papel">' + esc(t('tradicao.cat_' + x.categoria)) + '</span> ' +
      [x.de_quem, x.desde_valor, x.local_texto].filter(Boolean).map(esc).join(' · ') + '</p>' +
    (x.corpo ? '<div class="card"><p style="margin:0;white-space:pre-wrap">' + esc(x.corpo) + '</p></div>' : '') +
    (x.origem ? '<p class="sub"><strong>' + esc(t('tradicao.origem')) + ':</strong> ' + esc(x.origem) + '</p>' : '') +
    ((x.ocasioes || []).length ? '<p class="sub"><strong>' + esc(t('tradicao.ocasioes')) +
      ':</strong> ' + esc(x.ocasioes.join(', ')) + '</p>' : '') +
    (rec
      ? '<h3>' + esc(t('tradicao.ingredientes')) + '</h3><ul>' +
        (rec.ingredientes || []).map(i => '<li>' + esc(i.item) + '</li>').join('') + '</ul>' +
        (rec.preparo ? '<h3>' + esc(t('tradicao.preparo')) + '</h3>' +
          '<p style="white-space:pre-wrap">' + esc(rec.preparo) + '</p>' : '') +
        '<p class="sub">' + [rec.rendimento, rec.tempo].filter(Boolean).map(esc).join(' · ') + '</p>' +
        (rec.manuscrito_media_id
          ? '<p><a href="#" onclick="verMidia(\\'' + rec.manuscrito_media_id + '\\');return false">' +
            esc(t('tradicao.manuscrito')) + '</a><br><span class="sub">' +
            esc(t('tradicao.manuscrito_nota')) + '</span></p>' : '')
      : '') +

    // quem sabe fazer — a lacuna que o Historiador cobra
    (rec ? '<h3>' + esc(t('tradicao.aprendizes')) + '</h3>' +
      ((x.aprendizes || []).length
        ? x.aprendizes.map(a => '<div class="linha"><span><a href="#" onclick="dossie(\\'' +
            a.person_id + '\\');return false">' + esc(a.nome_exibicao) + '</a>' +
            (a.aprendeu_valor ? ' <span class="sub">· ' + esc(a.aprendeu_valor) + '</span>' : '') +
            '</span></div>').join('')
        : '<p class="sub">' + esc(t('tradicao.sem_aprendizes')) + '</p>') +
      (pode('contribuir')
        ? '<label>' + esc(t('tradicao.quem_aprendeu')) + '</label><select id="ap_quem"></select>' +
          '<label>' + esc(t('tradicao.aprendeu_quando')) + '</label><input id="ap_q">' +
          '<p><button class="btn mini" onclick="registrarAprendiz(\\'' + id + '\\')">' +
          esc(t('acao.salvar')) + '</button></p>' : '') : '') +

    // a corrente do saber
    '<h3>' + esc(t('tradicao.transmissoes')) + '</h3>' +
    ((x.transmissoes || []).length
      ? x.transmissoes.map(tr => '<div class="linha"><span>' + esc(tr.de_nome) + ' → ' +
          esc(tr.para_nome) + (tr.quando_valor ? ' <span class="sub">· ' + esc(tr.quando_valor) +
          '</span>' : '') + '</span></div>').join('')
      : '<p class="sub">' + esc(t('tradicao.sem_transmissoes')) + '</p>') +
    (pode('contribuir')
      ? '<label>' + esc(t('tradicao.ensinou')) + '</label><select id="tm_de"></select>' +
        '<label>' + esc(t('tradicao.aprendeu')) + '</label><select id="tm_para"></select>' +
        '<label>' + esc(t('tradicao.aprendeu_quando')) + '</label><input id="tm_q">' +
        '<p><button class="btn mini" onclick="registrarTransmissao(\\'' + id + '\\')">' +
        esc(t('tradicao.registrar_transmissao')) + '</button></p>' : ''));
  if (pode('contribuir')) {
    for (const s of ['ap_quem', 'tm_de', 'tm_para']) preencherSelPessoas(s);
  }
}

async function registrarAprendiz(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/tradicoes/' + id + '/aprendizes',
    { person_id: val('ap_quem'), quando: val('ap_q') });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verTradicao(id);
}

async function registrarTransmissao(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/tradicoes/' + id + '/transmissoes',
    { de_person_id: val('tm_de'), para_person_id: val('tm_para'), quando: val('tm_q') });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verTradicao(id);
}

// ------------------------------------------------ relíquias (Fase 2.1)
// O valor do objeto está em por quantas mãos passou. A tela mostra a
// corrente inteira, e transferir NUNCA apaga o dono anterior.
async function telaReliquias() {
  const r = await api('GET', '/familias/' + FAM.id + '/reliquias');
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('reliquia.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('reliquia.intro')) + '</p>' +
    ((r.reliquias || []).length
      ? r.reliquias.map(x =>
          '<div class="card" style="padding:18px;cursor:pointer" onclick="verReliquia(\\'' + x.id + '\\')">' +
          '<p style="margin:0 0 4px"><strong>' + esc(x.nome) + '</strong></p>' +
          '<p class="sub" style="margin:0">' +
            (x.com_quem ? esc(t('reliquia.ainda_com', { nome: x.com_quem })) +
              (x.desde ? ' · ' + esc(x.desde) : '')
              : esc(t('reliquia.sem_custodia'))) +
            (x.maos ? ' · ' + esc(t('reliquia.maos', { n: x.maos })) : '') + '</p>' +
          '</div>').join('')
      : '<p class="sub">' + esc(t('reliquia.sem_reliquias')) + '</p>') +
    (pode('contribuir')
      ? '<h3 style="margin-top:28px">' + esc(t('reliquia.nova')) + '</h3>' +
        '<label>' + esc(t('reliquia.nome')) + '</label><input id="rl_n">' +
        '<label>' + esc(t('reliquia.descricao')) + '</label>' + area('rl_d', '') +
        '<label>' + esc(t('reliquia.origem')) + '</label><input id="rl_o">' +
        '<label>' + esc(t('reliquia.local')) + '</label><input id="rl_l">' +
        '<label>' + esc(t('reliquia.com_quem')) + '</label>' +
          '<select id="rl_q"><option value=""></option></select>' +
        '<label>' + esc(t('reliquia.desde')) + '</label>' +
          '<input id="rl_s" placeholder="' + esc(t('pessoa.ajuda_data')) + '">' +
        '<p><button class="btn" onclick="criarReliquia()">' + esc(t('reliquia.guardar')) + '</button></p>'
      : ''));
  if (pode('contribuir')) preencherSelPessoas('rl_q');
}

async function criarReliquia() {
  const r = await api('POST', '/familias/' + FAM.id + '/reliquias', {
    nome: val('rl_n'), descricao: val('rl_d'), origem: val('rl_o'), local: val('rl_l'),
    com_quem: val('rl_q') || null, desde: val('rl_s') });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verReliquia(r.reliquia.id);
}

async function verReliquia(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/reliquias/' + id);
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const h = r.reliquia;
  const fontes = ['RELATO','DOCUMENTO','REGISTRO_OFICIAL','MIDIA','PUBLICACAO'];
  $(topo() + '<p class="sub"><a href="#" onclick="telaReliquias();return false">← ' +
      esc(t('reliquia.titulo')) + '</a></p>' +
    '<h2>' + esc(h.nome) + '</h2>' +
    '<p class="sub">' + [h.local_texto, h.origem].filter(Boolean).map(esc).join(' · ') + '</p>' +
    (h.descricao ? '<div class="card"><p style="margin:0;white-space:pre-wrap">' +
      esc(h.descricao) + '</p></div>' : '') +
    '<h3>' + esc(t('reliquia.linha_de_posse')) + '</h3>' +
    ((h.custodia || []).length
      ? '<div class="tl">' + h.custodia.map(c =>
          '<div class="tl-item"><span class="tl-ico">🤲</span><span>' +
          '<a href="#" onclick="dossie(\\'' + c.person_id + '\\');return false"><strong>' +
            esc(c.nome_exibicao) + '</strong></a>' +
          '<br><span class="sub">' + esc(c.de_valor || '?') + ' — ' +
            esc(c.ate_valor || t('reliquia.ainda_com', { nome: c.nome_exibicao })) +
            (c.fonte_tipo ? ' · ' + esc(t('fonte.' + c.fonte_tipo)) +
              (c.fonte_titulo ? ': ' + esc(c.fonte_titulo) : '') : '') +
            (c.nota ? '<br>' + esc(c.nota) : '') + '</span></span></div>').join('') + '</div>'
      : '<p class="sub">' + esc(t('reliquia.sem_custodia')) + '</p>') +
    (pode('contribuir')
      ? '<h3 style="margin-top:26px">' + esc(t('reliquia.transferir')) + '</h3>' +
        '<label>' + esc(t('reliquia.passou_para')) + '</label><select id="cu_q"></select>' +
        '<label>' + esc(t('reliquia.quando')) + '</label>' +
          '<input id="cu_d" placeholder="' + esc(t('pessoa.ajuda_data')) + '">' +
        '<label>' + esc(t('reliquia.nota')) + '</label><input id="cu_n">' +
        '<label>' + esc(t('reliquia.como_sabe')) + '</label><select id="cu_ft">' +
          fontes.map(f => '<option value="' + f + '">' + esc(t('fonte.' + f)) + '</option>').join('') +
        '</select>' +
        '<label>' + esc(t('reliquia.fonte_titulo')) + '</label><input id="cu_fq">' +
        '<p><button class="btn" onclick="transferirReliquia(\\'' + id + '\\')">' +
        esc(t('reliquia.guardar')) + '</button></p>' : ''));
  if (pode('contribuir')) preencherSelPessoas('cu_q');
}

async function transferirReliquia(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/reliquias/' + id + '/custodia', {
    person_id: val('cu_q'), de: val('cu_d'), nota: val('cu_n'),
    fonte_tipo: val('cu_ft'), fonte_titulo: val('cu_fq') });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verReliquia(id);
}

// --------------------------------------- historiador e missões (Fase 2.2)
async function telaHistoriador() {
  const r = await api('GET', '/familias/' + FAM.id + '/historiador');
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const tipos = Object.keys(r.por_tipo || {});
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('historiador.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('historiador.intro')) + '</p>' +
    (tipos.length
      ? tipos.map(x => '<div class="linha"><span>' + esc(t('historiador.tipo_' + x)) +
          '</span><span class="papel">' + r.por_tipo[x] +
          ((r.alem_do_teto || {})[x] ? ' +' + r.alem_do_teto[x] : '') + '</span></div>').join('')
      : '<p class="sub">' + esc(t('historiador.sem_lacunas')) + '</p>') +
    '<p style="margin-top:22px"><button class="btn" onclick="telaMissoes(null,true)">' +
      esc(t('missao.sincronizar')) + '</button></p>');
}

async function telaMissoes(status, sincronizar) {
  let cab = '';
  if (sincronizar) {
    const s = await api('POST', '/familias/' + FAM.id + '/missoes/sincronizar', {});
    if (s.status < 400) {
      cab = aviso(t('missao.sincronizado', { criadas: s.criadas, resolvidas: s.resolvidas }), 'ok');
    }
  }
  const st = status || 'aberta';
  const r = await api('GET', '/familias/' + FAM.id + '/missoes?status=' + st);
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const c = r.contagem || {};
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('missao.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('missao.intro')) + '</p>' + cab +
    '<p class="sub">' + esc(t('missao.contagem', { abertas: c.abertas || 0,
      respondidas: c.respondidas || 0, resolvidas: c.resolvidas || 0 })) + '</p>' +
    '<p><button class="btn mini" onclick="telaMissoes(null,true)">' + esc(t('missao.sincronizar')) +
      '</button> <button class="btn mini claro" onclick="telaMissoes(\\'' +
      (st === 'aberta' ? 'respondida' : 'aberta') + '\\')">' +
      esc(st === 'aberta' ? t('missao.ver_respondidas') : t('missao.ver_abertas')) + '</button></p>' +
    ((r.missoes || []).length
      ? r.missoes.map(m =>
          '<div class="card" style="padding:18px">' +
          '<p style="margin:0 0 8px"><strong>' + esc(m.pergunta) + '</strong></p>' +
          '<p class="sub" style="margin:0">' + esc(t('historiador.tipo_' + m.tipo)) +
            (m.respondida_por_nome ? ' · ' + esc(t('missao.respondida_por',
              { nome: m.respondida_por_nome })) : '') + '</p>' +
          (m.status === 'aberta'
            ? '<p style="margin:12px 0 0"><button class="btn mini" onclick="responderMissao(\\'' +
              m.id + '\\')">' + esc(t('missao.responder')) + '</button> ' +
              (pode('editar') ? '<button class="btn mini claro" onclick="dispensarMissao(\\'' +
                m.id + '\\')">' + esc(t('missao.dispensar')) + '</button>' : '') + '</p>'
            : '') +
          '</div>').join('')
      : '<p class="sub">' + esc(t('missao.nenhuma')) + '</p>'));
}

async function responderMissao(id) {
  const corpo = prompt(t('missao.resposta_placeholder'));
  if (!corpo) return;
  const r = await api('POST', '/familias/' + FAM.id + '/missoes/' + id + '/responder', { corpo });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  telaMissoes();
}

async function dispensarMissao(id) {
  const motivo = prompt(t('missao.motivo'));
  if (motivo === null) return;
  const r = await api('POST', '/familias/' + FAM.id + '/missoes/' + id + '/dispensar', { motivo });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  telaMissoes();
}

// Índice de memória (§31): a lista sai POR NOME. Não existe placar entre
// familiares — o número serve para achar lacuna, não para comparar.
function barra(score) {
  return '<span style="display:inline-block;width:90px;height:8px;border-radius:4px;' +
    'background:var(--borda);vertical-align:middle"><span style="display:block;height:8px;' +
    'border-radius:4px;background:var(--tema);width:' + Math.max(2, score) + '%"></span></span>';
}

async function telaIndice() {
  const r = await api('GET', '/familias/' + FAM.id + '/indice-memoria');
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('indice.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('indice.intro')) + '</p>' +
    '<p class="sub">' + esc(t('indice.sem_ranking')) + '</p>' +
    (r.pessoas || []).map(p =>
      '<div class="linha"><span><a href="#" onclick="dossie(\\'' + p.person_id + '\\');return false">' +
      '<strong>' + esc(p.nome_exibicao) + '</strong></a><br><span class="sub">' +
      ((p.lacunas || []).length
        ? esc(t('indice.falta')) + ': ' + p.lacunas.map(l => esc(t('indice.dim_' + l))).join(', ')
        : esc(t('indice.nada_falta'))) + '</span></span>' +
      '<span>' + barra(p.score) + ' <span class="sub">' +
        esc(t('indice.score', { n: p.score })) + '</span></span></div>').join(''));
}

// ------------------------------------------------- planos e créditos (§50)
// A família vê PREÇO. Custo e margem são do staff e não passam por aqui.
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString(IDIOMA, { minimumFractionDigits: 2 });

async function telaPlanos() {
  const r = await api('GET', '/familias/' + FAM.id + '/planos');
  if (r.status >= 400) return $(topo() + aviso(r.erro));
  const podeComprar = r.pagamento === 'mercadopago' && pode('creditos.comprar');
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('plano.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('plano.intro')) + '</p>' +
    '<p class="sub">' + esc(r.assinatura ? t('plano.atual', { nome: r.assinatura.nome })
      : t('plano.sem_assinatura')) + ' · ' + esc(t('plano.saldo', { n: r.saldo })) + '</p>' +
    (r.assinatura && r.assinatura.status === 'ativa'
      ? '<p class="sub">' + esc(t('plano.renova_em', { data: r.assinatura.proximo_ciclo || '—' })) +
        ' · <a href="#" onclick="cancelarAssinatura();return false">' +
        esc(t('plano.cancelar')) + '</a></p>' : '') +

    (r.planos || []).map(p =>
      '<div class="card" style="padding:18px">' +
      '<p style="margin:0 0 6px"><strong style="font-size:18px">' + esc(p.nome) + '</strong> ' +
        (p.preco_centavos ? '<span class="sub">' + esc(brl(p.preco_centavos)) +
          esc(t('plano.por_mes')) + '</span>' : '<span class="papel">' + esc(t('plano.gratis')) + '</span>') +
        '</p>' +
      (p.preco_anual_centavos
        ? '<p class="sub" style="margin:0 0 6px">' +
          esc(t('plano.por_ano', { valor: brl(p.preco_anual_centavos) })) + '</p>' : '') +
      '<p class="sub" style="margin:0">' +
        esc(t('plano.storage', { n: p.storage_gb })) + ' · ' +
        (p.creditos_mes ? esc(t('plano.creditos_mes', { n: p.creditos_mes })) + ' · ' : '') +
        esc(p.familias > 1 ? t('plano.familias_n', { n: p.familias }) : t('plano.familias_1')) +
        ' · ' + esc(t('plano.membros')) + '</p>' +
      // O botão só existe quando há gateway ligado E o plano é pago: sem
      // isso, botão de "assinar" que não cobra é promessa falsa.
      (podeComprar && p.preco_centavos ?
        '<p style="margin:10px 0 0">' +
        '<button class="btn" onclick="assinar(\'' + esc(p.codigo) + '\',\'mensal\')">' +
          esc(t('plano.assinar_mes')) + '</button>' +
        (p.preco_anual_centavos ? ' <button class="btn sec" onclick="assinar(\'' + esc(p.codigo) +
          '\',\'anual\')">' + esc(t('plano.assinar_ano')) + '</button>' : '') +
        '</p>' : '') +
      '</div>').join('') +

    '<h3 style="margin-top:26px">' + esc(t('plano.pacotes')) + '</h3>' +
    '<p class="sub">' + esc(t('plano.creditos_explica')) + '</p>' +
    (r.pacotes || []).map(p => '<div class="linha"><span>' +
      esc(t('plano.pacote', { n: p.creditos, valor: brl(p.preco_centavos) })) + '</span>' +
      (podeComprar ? '<span><button class="btn sec" onclick="comprarCreditos(\'' +
        esc(p.codigo) + '\')">' + esc(t('plano.comprar')) + '</button></span>' : '') +
      '</div>').join('') +

    (podeComprar ? '' : '<h3 style="margin-top:26px">' + esc(t('plano.manual_titulo')) + '</h3>' +
      '<p class="sub">' + esc(t('plano.manual')) + '</p>') +

    ((r.pedidos || []).length ? '<h3 style="margin-top:26px">' + esc(t('plano.compras')) + '</h3>' +
      r.pedidos.map(p => '<div class="linha"><span>' + esc(p.descricao) +
        ' <span class="sub">' + esc(p.codigo) + '</span></span><span class="sub">' +
        esc(brl(p.total_centavos)) + ' · ' + esc(t('plano.st_' + p.status)) +
        '</span></div>').join('') : ''));
}

/**
 * Comprar leva ao gateway, não credita nada aqui: quem credita é o webhook
 * depois que o Mercado Pago confirmar (billing.js). A aba nova é de
 * propósito — voltar para o acervo não pode custar o pagamento em curso.
 */
async function comprarCreditos(pacote) {
  const r = await api('POST', '/familias/' + FAM.id + '/pedidos', { pacote });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  irPagar(r.pagamento);
}

async function assinar(plano, ciclo) {
  const r = await api('POST', '/familias/' + FAM.id + '/assinatura', { plano, ciclo });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  irPagar(r.pagamento);
}

function irPagar(pag) {
  if (pag && pag.link) {
    window.open(pag.link, '_blank', 'noopener');
    return $(document.getElementById('app').innerHTML + aviso(t('plano.pagando'), 'ok'));
  }
  $(document.getElementById('app').innerHTML + aviso(t('plano.manual'), 'ok'));
}

async function cancelarAssinatura() {
  if (!confirm(t('plano.cancelar_confirma'))) return;
  const r = await api('DELETE', '/familias/' + FAM.id + '/assinatura');
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  telaPlanos();
}

// ------------------------------------------------------ avisos (§87)
async function telaAvisos() {
  const r = await api('GET', '/familias/' + FAM.id + '/notificacoes');
  const atual = (r.preferencias || []).find(p => p.evento === 'missoes');
  const freq = atual ? atual.frequencia : 'nunca';
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('notificacao.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('notificacao.intro')) + '</p>' +
    '<label>' + esc(t('notificacao.missoes')) + '</label>' +
    '<select id="nt_f">' +
      ['nunca', 'imediato'].map(f => '<option value="' + f + '"' + (f === freq ? ' selected' : '') +
        '>' + esc(t('notificacao.' + f)) + '</option>').join('') + '</select>' +
    '<p><button class="btn" onclick="salvarAviso()">' + esc(t('acao.salvar')) + '</button></p>');
}

async function salvarAviso() {
  const r = await api('PATCH', '/familias/' + FAM.id + '/notificacoes',
    { evento: 'missoes', frequencia: val('nt_f') });
  if (r.status >= 400) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  $(document.getElementById('app').innerHTML + aviso(t('notificacao.salvo'), 'ok'));
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
