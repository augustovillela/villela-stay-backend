// =====================================================================
// Villela CRM — SPA do painel do assinante (/crm/app).
// Script clássico servido em /crm/app.js (sem build). Fala com /crm/api/*.
// Telas: Dashboard · Kanban · Contatos · Tarefas · Templates · Propostas ·
// Campanhas · IA · Conta (equipe/plano/integrações).
// =====================================================================
'use strict';
/* eslint-disable no-alert */
let ME = null, KANBAN_FUNIL = '';

const $ = (q) => document.querySelector(q);
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const dataBr = (iso) => iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : '—';
// Ícones SVG (sprite inline da página, crm/icones.js) no lugar dos emojis. O Growth OS ainda manda emoji no menu:
// a tabela abaixo traduz; emoji desconhecido continua aparecendo como veio.
const ICO_EMOJI = { '📊': 'grid', '📋': 'kanban', '👥': 'users', '📄': 'file', '⏰': 'clock', '💬': 'message', '📣': 'megaphone', '🤖': 'bot', '⚙': 'sliders', '🧭': 'compass', '🎯': 'target', '📅': 'calendar', '💸': 'coins', '📈': 'trending', '⭐': 'star', '🧠': 'sparkles', '✋': 'checkcircle', '🔌': 'plug', '🔒': 'lock', '💳': 'card' };
const svgIco = (n) => `<svg class="cp-i" aria-hidden="true" focusable="false"><use href="#i-${n}"/></svg>`;
const icoDe = (e) => { const n = ICO_EMOJI[String(e == null ? '' : e).replace(/\uFE0F/g, '')]; return n ? svgIco(n) : esc(e); };
// Tradutor automático: qualquer emoji conhecido que uma tela desenhar (inclusive as do Growth OS) vira ícone SVG.
// Observa o painel, troca só nós de TEXTO (nunca <option>, <textarea>, <script>) e para sozinho quando não há mais emoji.
const EMOJI_ICO = { '✅': 'checkcircle', '🚫': 'ban', '✉': 'mail', '📞': 'phone', '📋': 'copy', '📤': 'send', '🔗': 'link', '🔁': 'refresh', '♻': 'refresh', '📉': 'trendingdown', '💡': 'bulb', '🎉': 'sparkles', '🔑': 'key', '🎫': 'ticket', '🤖': 'bot', '💬': 'message', '📄': 'file', '⚙': 'sliders', '👥': 'users', '🔔': 'bell', '📲': 'download', '⚠': 'alert', '🎁': 'gift', '📅': 'calendar', '⭐': 'star', '📣': 'megaphone', '📈': 'trending', '💳': 'card', '🔒': 'lock', '🧠': 'sparkles', '✋': 'checkcircle', '🔌': 'plug', '💸': 'coins', '🧭': 'compass', '📊': 'grid', '⏰': 'clock', '💰': 'coins', '🔥': 'flame', '🛡': 'shield', '📎': 'link', '📧': 'mail', '📝': 'file', '🎯': 'target', '🚀': 'zap', '✨': 'sparkles' };
const EMOJI_BOLA = { '🔴': 'red', '🟡': 'amber', '🧊': 'blue', '🟢': 'green' };
const RE_EMOJI_G = new RegExp('(' + Object.keys(EMOJI_ICO).concat(Object.keys(EMOJI_BOLA)).join('|') + ')\uFE0F?', 'g');
const RE_EMOJI_T = new RegExp('(' + Object.keys(EMOJI_ICO).concat(Object.keys(EMOJI_BOLA)).join('|') + ')');
function iconizar(raiz) {
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|TEXTAREA|OPTION|TITLE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
      return RE_EMOJI_T.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nos = []; let n; while ((n = w.nextNode())) nos.push(n);
  for (const no of nos) {
    const txt = no.nodeValue, frag = document.createDocumentFragment(); let ult = 0, m;
    RE_EMOJI_G.lastIndex = 0;
    while ((m = RE_EMOJI_G.exec(txt))) {
      if (m.index > ult) frag.appendChild(document.createTextNode(txt.slice(ult, m.index)));
      const el = document.createElement('span');
      const e = m[1];
      if (EMOJI_BOLA[e]) { el.className = 'cp-dot cp-dot--' + EMOJI_BOLA[e]; }
      else { el.className = 'cp-ei'; el.innerHTML = svgIco(EMOJI_ICO[e]); }
      frag.appendChild(el); ult = m.index + m[0].length;
    }
    if (ult < txt.length) frag.appendChild(document.createTextNode(txt.slice(ult)));
    no.replaceWith(frag);
  }
}
let _iconizarAgendado = false;
new MutationObserver(() => {
  if (_iconizarAgendado) return;
  _iconizarAgendado = true;
  requestAnimationFrame(() => { _iconizarAgendado = false; iconizar(document.body); });
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
const CANAIS_UI = { whatsapp: 'WhatsApp', email: 'E-mail', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn' };
const CANAL_ICO = { whatsapp: '💬', email: '✉️', instagram: '📸', facebook: '👤', tiktok: '🎵', linkedin: '💼' };
const CANAL_ASSIST = ['instagram', 'facebook', 'tiktok', 'linkedin']; // sem API para abrir conversa: o CRM monta a fila, quem opera envia
const waLink = (tel, txt) => 'https://wa.me/' + String(tel || '').replace(/\D/g, '') + (txt ? '?text=' + encodeURIComponent(txt) : '');

// SEQ cresce a cada troca de tela: leitura que volta depois de o usuário já
// ter mudado de tela não pinta por cima da tela nova (a promessa morre aqui).
let SEQ = 0;
async function api(metodo, caminho, corpo) {
  const meu = SEQ;
  const r = await fetch('/crm/api' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined, credentials: 'same-origin',
  });
  const d = await r.json().catch(() => ({}));
  // 401 nas rotas de login é "credencial errada", não "sessão expirada":
  // jogar de volta para a tela de login apagaria o código que a pessoa
  // acabou de digitar no segundo fator.
  if (r.status === 401 && !caminho.startsWith('/login')) { telaLogin(); throw new Error('Sessão expirada — entre novamente.'); }
  if (!r.ok) throw new Error(d.erro || ('Erro ' + r.status));
  if (metodo === 'GET' && meu !== SEQ) await new Promise(() => {});
  return d;
}

async function bootCRM() {
  try { ME = await api('GET', '/me'); telaApp(); }
  catch (_) { /* telaLogin já chamada no 401 */ }
}

function telaLogin() {
  $('#app').innerHTML = `<div class="card crm-auth"><div class="cp-auth-marca"><img src="/assets/brand/villela-crm/simbolo-v.svg" alt=""><span class="vx-hint" style="margin:0">Villela CRM</span></div>
    <h3 style="margin-bottom:14px">Entrar no Villela CRM</h3>
    <div class="vx-campo"><label for="lg-email">E-mail</label>
      <input id="lg-email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false"></div>
    <div class="vx-campo"><label for="lg-senha">Senha</label>
      <input id="lg-senha" type="password" autocomplete="current-password"></div>
    <button class="vx-btn" id="lg-btn" style="margin-top:8px">Entrar</button>
    <p id="lg-msg" class="erro" role="alert"></p>
    <p class="sub" style="margin-top:10px;text-align:left"><a href="#" id="lg-esqueci">Esqueci minha senha</a></p>
    <p class="sub" style="margin-top:14px;text-align:left">Ainda não tem conta? <a href="/crm/assinar?plano=trial">Teste grátis por 15 dias</a>.</p></div>`;
  const entrar = async () => {
    $('#lg-msg').textContent = '';
    try {
      const r = await api('POST', '/login', { email: $('#lg-email').value.trim(), senha: $('#lg-senha').value });
      // senha certa mas com segundo fator: ainda não há sessão
      if (r && r.mfa) { telaSegundoFator(r.desafio); return; }
      ME = await api('GET', '/me'); telaApp();
    } catch (e) { $('#lg-msg').textContent = e.message; }
  };
  $('#lg-btn').onclick = entrar;
  $('#lg-senha').onkeydown = (ev) => { if (ev.key === 'Enter') entrar(); };
  $('#lg-esqueci').onclick = (ev) => { ev.preventDefault(); telaEsqueci($('#lg-email').value.trim()); };
}

/** "Esqueci minha senha": pede o e-mail e manda o link (a resposta é igual exista a conta ou não). */
function telaEsqueci(emailInicial) {
  $('#app').innerHTML = `<div class="card crm-auth"><div class="cp-auth-marca"><img src="/assets/brand/villela-crm/simbolo-v.svg" alt=""><span class="vx-hint" style="margin:0">Villela CRM</span></div>
    <h3 style="margin-bottom:6px">Esqueci minha senha</h3>
    <p class="sub" style="text-align:left;margin:0 0 14px">Digite o e-mail da sua conta. Enviamos um link para criar uma nova senha.</p>
    <div class="vx-campo"><label for="es-email">E-mail</label>
      <input id="es-email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(emailInicial || '')}"></div>
    <button class="vx-btn" id="es-btn">Enviar link</button>
    <p id="es-msg" class="erro" role="alert"></p>
    <p class="sub" style="margin-top:14px;text-align:left"><a href="#" id="es-voltar">Voltar ao login</a></p></div>`;
  const enviar = async () => {
    const msg = $('#es-msg'); msg.textContent = ''; msg.classList.add('erro');
    try {
      const r = await api('POST', '/esqueci-senha', { email: $('#es-email').value.trim() });
      msg.classList.remove('erro'); msg.textContent = '✅ ' + r.mensagem;
    } catch (e) { msg.textContent = e.message; }
  };
  $('#es-btn').onclick = enviar;
  $('#es-email').onkeydown = (ev) => { if (ev.key === 'Enter') enviar(); };
  $('#es-voltar').onclick = (ev) => { ev.preventDefault(); telaLogin(); };
  $('#es-email').focus();
}

/** Segunda etapa do login quando a conta tem MFA (Villela Growth OS). */
function telaSegundoFator(desafio) {
  $('#app').innerHTML = `<div class="card crm-auth"><div class="cp-auth-marca"><img src="/assets/brand/villela-crm/simbolo-v.svg" alt=""><span class="vx-hint" style="margin:0">Villela CRM</span></div>
    <h3 style="margin-bottom:6px">Código de verificação</h3>
    <p class="sub" style="text-align:left;margin:0 0 14px">Abra seu aplicativo autenticador e digite o código de 6 dígitos. Sem o celular, use um código de recuperação.</p>
    <div class="vx-campo"><label for="mfa-cod">Código</label>
      <input id="mfa-cod" inputmode="numeric" autocomplete="one-time-code" maxlength="20" placeholder="000000"></div>
    <button class="vx-btn" id="mfa-btn">Confirmar</button>
    <p id="mfa-msg" class="erro" role="alert"></p>
    <p class="sub" style="margin-top:14px;text-align:left"><a href="#" id="mfa-voltar">Voltar</a></p></div>`;
  const confirmar = async () => {
    $('#mfa-msg').textContent = '';
    try {
      await api('POST', '/login/mfa', { desafio, codigo: $('#mfa-cod').value.trim() });
      ME = await api('GET', '/me'); telaApp();
    } catch (e) { $('#mfa-msg').textContent = e.message; }
  };
  $('#mfa-btn').onclick = confirmar;
  $('#mfa-cod').onkeydown = (ev) => { if (ev.key === 'Enter') confirmar(); };
  $('#mfa-voltar').onclick = (ev) => { ev.preventDefault(); telaLogin(); };
  $('#mfa-cod').focus();
}

// [id, módulo do plano, grupo do menu, ícone, rótulo]
const MENU = [
  ['dash', 'dashboard', 'Visão geral', '📊', 'Dashboard'],
  ['kanban', 'funis', 'Comercial', '📋', 'Kanban'],
  ['contatos', 'contatos', 'Comercial', '👥', 'Contatos'],
  ['propostas', 'propostas', 'Comercial', '📄', 'Propostas'],
  ['buscas', 'importacao', 'Comercial', '🎯', 'Busca ativa'],
  ['tarefas', 'tarefas', 'Relacionamento', '⏰', 'Tarefas'],
  ['templates', 'templates', 'Relacionamento', '💬', 'Templates'],
  ['conversas', 'contatos', 'Relacionamento', '🧭', 'Conversas'],
  ['campanhas', 'campanhas', 'Relacionamento', '📣', 'Campanhas'],
  ['ia', 'ia', 'Inteligência', '🤖', 'Agentes de IA'],
  ['conta', '', 'Conta', '⚙️', 'Conta e plano'],
];
const ORDEM_GRUPOS_BASE = ['Visão geral', 'Comercial', 'Relacionamento', 'Inteligência', 'Conta'];
// Calculado na hora, não no load: a extensão do Growth OS é carregada
// DEPOIS deste arquivo. Grupos novos entram antes de "Conta", que fecha.
function ordemGrupos() {
  const ext = (window.GX_EXT && GX_EXT.grupos) || [];
  const novos = ext.filter((g) => !ORDEM_GRUPOS_BASE.includes(g));
  return ORDEM_GRUPOS_BASE.slice(0, -1).concat(novos, 'Conta');
}
let ABA = 'dash';

// <rota> — F5 mantém a tela (05/11/2026). A tela atual mora no endereço: `#<tela>` ou
// `#<tela>/<id>` (ex.: `#contatos`, `#contatos/123`, `#gx_inbox`). Funções puras aqui
// (testadas em node no selftest, que extrai este bloco); o que toca `location` fica abaixo.
function rotaDoHash(hash) {
  const h = String(hash == null ? '' : hash).replace(/^#\/?/, '');
  if (!h) return null;                                   // vazio / "#" / "#/": não navega
  const i = h.indexOf('/');
  const tela = i < 0 ? h : h.slice(0, i);
  let id = i < 0 ? '' : h.slice(i + 1);
  try { id = decodeURIComponent(id); } catch (_) { return null; }
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(tela)) return null;
  if (id && !/^[\w.:-]{1,80}$/.test(id)) return null;
  return { tela, id };
}
function hashDaRota(tela, id) { return '#' + tela + (id ? '/' + encodeURIComponent(id) : ''); }
// Decide a tela de abertura. `permitidas` = telas que este plano/papel pode abrir.
// Conta bloqueada abre sempre "conta"; hash inválido ou sem permissão cai no padrão.
function resolverRota(rota, { bloqueado, permitidas }) {
  if (bloqueado) return { tela: 'conta', id: '' };
  if (rota && permitidas.includes(rota.tela)) return { tela: rota.tela, id: rota.tela === 'contatos' ? rota.id : '' };
  return { tela: 'dash', id: '' };
}
// </rota>
let ROTA_LIGADA = false;
// Grava a tela no endereço. pushState quando a pessoa navega (o Voltar funciona);
// replaceState no boot. Não grava se já for igual. Mantém o `?query` da página.
function marcarRota(tela, id, substituir) {
  const alvo = hashDaRota(tela, id);
  if (location.hash === alvo) return;
  try { history[substituir ? 'replaceState' : 'pushState'](null, '', location.pathname + location.search + alvo); }
  catch (_) { location.hash = alvo; }
}
let NAV_COLAPSADA = (() => { try { return localStorage.getItem('vx-nav') === 'colapsada'; } catch (_) { return false; } })();

// Ganchos de extensão: o Villela Growth OS acrescenta abas por
// `window.GX_EXT` (ver growth/app-assinante.js) sem tocar neste núcleo.
// Item estendido: [id, modulo, grupo, ícone, rótulo, flagDoPlano].
function itensDoMenu() {
  const ent = ME.entitlements || {};
  const mods = ent.modulos || [];
  const flags = ent.flags || {};
  const extras = (window.GX_EXT && GX_EXT.menu) || [];
  return MENU.concat(extras).filter(([, mod, , , , flag]) =>
    (!mod || mods.includes(mod)) && (!flag || flags[flag] === true));
}
function montarNav() {
  let html = '';
  for (const g of ordemGrupos()) {
    const doGrupo = itensDoMenu().filter(i => i[2] === g);
    if (!doGrupo.length) continue;
    html += `<div class="vx-nav-grupo">${esc(g)}</div>`;
    for (const [id, , , ico, rot] of doGrupo) {
      html += `<button type="button" class="vx-nav-item" data-v="${id}" title="${esc(rot)}"${ABA === id ? ' aria-current="page"' : ''}>` +
        `<span class="vx-nav-ico" aria-hidden="true">${icoDe(ico)}</span><span class="vx-nav-rot">${esc(rot)}</span></button>`;
    }
  }
  html += `<hr class="vx-sep" style="margin:8px 4px">
    <button type="button" class="vx-nav-item vx-nav-toggle" data-colapsar="1" aria-label="${NAV_COLAPSADA ? 'Expandir menu' : 'Recolher menu'}">
      <span class="vx-nav-ico" aria-hidden="true">${NAV_COLAPSADA ? '»' : '«'}</span>
      <span class="vx-nav-rot">Recolher menu</span></button>`;
  return html;
}
function ligarNav() {
  document.querySelectorAll('#crm-nav [data-v]').forEach(b => { b.onclick = () => navegar(b.dataset.v); });
  const t = $('#crm-nav [data-colapsar]');
  if (t) t.onclick = alternarNav;
}
function alternarNav() {
  NAV_COLAPSADA = !NAV_COLAPSADA;
  try { localStorage.setItem('vx-nav', NAV_COLAPSADA ? 'colapsada' : 'aberta'); } catch (_) {}
  const a = $('#crm-app'); if (a) a.setAttribute('data-nav', NAV_COLAPSADA ? 'colapsada' : 'aberta');
  const nav = $('#crm-nav'); if (nav) { nav.innerHTML = montarNav(); ligarNav(); }
}
function ctxDaAba() {
  return itensDoMenu().find(i => i[0] === ABA) || ['dash', 'dashboard', 'Visão geral', '📊', 'Dashboard'];
}
function pintarCabecalho() {
  const c = ctxDaAba(); const h = $('#crm-head');
  if (!h) return;
  h.innerHTML = `<div class="vx-crumb"><span>${esc(ME.empresa.nome)}</span><span aria-hidden="true">›</span><span>${esc(c[2])}</span></div>
    <h1><span class="cp-h1ico">${icoDe(c[3])}</span>${esc(c[4])}</h1>`;
}

function telaApp() {
  const bloq = ME.entitlements && !ME.entitlements.acesso_liberado;
  const inicial = resolverRota(rotaDoHash(location.hash), { bloqueado: !!bloq, permitidas: telasPermitidas() });
  ABA = inicial.tela;
  const alerta = bloq
    ? `<div class="vx-alerta vx-alerta--danger"><span class="vx-alerta-ico" aria-hidden="true">${svgIco('alert')}</span><div><b>Acesso bloqueado (${esc(ME.empresa.status)}).</b><p class="vx-mb0">Regularize o plano em Conta e plano.</p></div></div>`
    : (ME.empresa.status === 'trial' && ME.entitlements.trial_expira_em
      ? `<div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico" aria-hidden="true">${svgIco('gift')}</span><div><b>Período de teste até ${dataBr(ME.entitlements.trial_expira_em)}.</b><p class="vx-mb0">Assine em Conta e plano para não perder o acesso.</p></div></div>`
      : '');
  $('#app').innerHTML = `
    <div class="vx-app" id="crm-app" data-nav="${NAV_COLAPSADA ? 'colapsada' : 'aberta'}">
      <nav class="vx-nav" id="crm-nav" aria-label="Seções do painel">${montarNav()}</nav>
      <div class="vx-main">
        <div class="vx-page-head">
          <div id="crm-head"></div>
          <div class="vx-acoes">
            <span class="vx-badge vx-badge--accent">${esc(ME.entitlements.plano || '—')}</span>
            <button class="vx-btn vx-btn--sec vx-btn--sm" id="pwa-btn" style="display:none" title="Instalar o Villela CRM como app no celular">${svgIco('download')} Instalar app</button>
            <button class="vx-btn vx-btn--sec vx-btn--sm" id="push-btn" style="display:none" title="Receber avisos de leads e propostas no celular">${svgIco('bell')} Avisos</button>
            <button class="vx-btn vx-btn--ghost vx-btn--sm" id="sair">Sair</button>
          </div>
        </div>
        <p class="vx-hint">Conectado como ${esc(ME.usuario.nome || ME.usuario.email)} (${esc(ME.usuario.papel)})</p>
        ${alerta}
        <div id="tela"></div>
      </div>
    </div>`;
  $('#sair').onclick = async () => { await api('POST', '/logout'); location.reload(); };
  ligarNav();
  pintarBotaoPush();
  pintarBotaoInstalar();
  marcarRota(inicial.tela, inicial.id, true);          // normaliza o endereço sem empilhar histórico
  ligarRota();
  navegar(ABA, { semHash: true, id: inicial.id });
}

// ---- instalar como app (PWA) — prompt no Android/Chrome, instrução no iPhone ----
let PWA_EVT = null; // beforeinstallprompt pode disparar antes de telaApp renderizar
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); PWA_EVT = e; pintarBotaoInstalar(); });
function emModoApp() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function ehIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function pintarBotaoInstalar() {
  const btn = $('#pwa-btn');
  if (!btn) return;
  if (emModoApp()) { btn.style.display = 'none'; return; }
  if (PWA_EVT || ehIOS()) { btn.style.display = ''; btn.onclick = instalarApp; }
}
async function instalarApp() {
  if (PWA_EVT) {
    PWA_EVT.prompt();
    const r = await PWA_EVT.userChoice.catch(() => null);
    if (r && r.outcome === 'accepted') { PWA_EVT = null; pintarBotaoInstalar(); }
    return;
  }
  alert('Para instalar no iPhone:\n1. Toque em Compartilhar (o quadrado com a seta ↑)\n2. Escolha "Adicionar à Tela de Início"');
}

// ---- notificações push do painel (PWA) — avisos de lead/proposta no celular ----
function pushOk() { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
function b64ParaU8(b) {
  const pad = '='.repeat((4 - b.length % 4) % 4);
  const s = (b + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s); const a = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
  return a;
}
async function pushAssinado() {
  try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); }
  catch (_) { return null; }
}
async function pintarBotaoPush() {
  const btn = $('#push-btn');
  if (!btn || !pushOk()) return;
  const sub = await pushAssinado();
  btn.style.display = '';
  btn.innerHTML = svgIco('bell') + (sub ? ' Avisos ✓' : ' Avisos');
  btn.title = sub ? 'Notificações ativadas — toque para desativar' : 'Receber avisos de leads e propostas no celular';
  btn.onclick = () => alternarPush(btn);
}
async function alternarPush() {
  try {
    const sub = await pushAssinado();
    if (sub) {
      await api('POST', '/app/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    } else {
      const { publicKey } = await api('GET', '/app/push/chave');
      if (!publicKey) return alert('As notificações ainda não estão disponíveis. Tente mais tarde.');
      if ((await Notification.requestPermission()) !== 'granted') return alert('Permissão negada. Libere as notificações deste site nas configurações do navegador.');
      const reg = await navigator.serviceWorker.ready;
      const nova = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaU8(publicKey) });
      await api('POST', '/app/push/subscribe', { subscription: nova.toJSON() });
    }
  } catch (e) { alert(e.message); }
  pintarBotaoPush();
}
function mapaDeTelas() {
  return Object.assign(
    { dash: vDash, kanban: vKanban, contatos: vContatos, tarefas: vTarefas, templates: vTemplates, propostas: vPropostas, buscas: vBuscas, campanhas: vCampanhas, conversas: vConversas, ia: vIA, conta: vConta },
    (window.GX_EXT && GX_EXT.vistas) || {}   // abas do Villela Growth OS
  );
}
// Telas que esta conta pode abrir: toda tela do mapa, menos as do menu que o plano/módulo esconde.
function telasPermitidas() {
  const catalogo = new Set(MENU.concat((window.GX_EXT && GX_EXT.menu) || []).map(i => i[0]));
  const visiveis = new Set(itensDoMenu().map(i => i[0]));
  return Object.keys(mapaDeTelas()).filter(k => !catalogo.has(k) || visiveis.has(k));
}
// opts.semHash: não grava o endereço (boot e Voltar/Avançar). opts.id: abre o item (contato).
function navegar(v, opts) {
  opts = opts || {};
  const mapa = mapaDeTelas();
  ABA = mapa[v] ? v : 'dash';
  SEQ++;
  if (!opts.semHash) marcarRota(ABA, '');
  document.querySelectorAll('#crm-nav [data-v]').forEach(b => {
    if (b.dataset.v === ABA) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  pintarCabecalho();
  if (opts.id && ABA === 'contatos') return abrirContato(opts.id);
  (mapa[ABA] || vDash)();
}
// Voltar/Avançar do navegador: relê o endereço e abre a mesma tela, sem gravar de novo.
function ligarRota() {
  if (ROTA_LIGADA) return;
  ROTA_LIGADA = true;
  window.addEventListener('popstate', () => {
    if (typeof ME === 'undefined' || !ME) return;       // tela de login: não há o que reabrir
    const rota = rotaDoHash(location.hash);
    if (!rota) return;                                   // "#" vazio (links href="#"): ignora
    const bloq = ME.entitlements && !ME.entitlements.acesso_liberado;
    const r = resolverRota(rota, { bloqueado: !!bloq, permitidas: telasPermitidas() });
    marcarRota(r.tela, r.id, true);                      // endereço inválido/sem permissão vira o padrão
    navegar(r.tela, { semHash: true, id: r.id });
  });
}
const carregando = () => {
  $('#tela').innerHTML = '<div class="vx-skel vx-skel--linha"></div><div class="vx-skel vx-skel--linha"></div><div class="vx-skel vx-skel--bloco"></div>';
};
const erroTela = (e) => {
  $('#tela').innerHTML = `<div class="vx-alerta vx-alerta--danger" role="alert">
    <span class="vx-alerta-ico" aria-hidden="true">${svgIco('alert')}</span>
    <div><b>Não foi possível carregar esta tela</b>
      <p class="vx-mb0">${esc(e && e.message ? e.message : 'Erro inesperado.')}</p>
      <button class="vx-btn vx-btn--sec vx-btn--sm" id="crm-retry" style="margin-top:8px">Tentar novamente</button></div></div>`;
  const b = $('#crm-retry');
  if (b) b.onclick = () => navegar(ABA);
};

// ---------------- DASHBOARD ----------------
async function vDash() {
  carregando();
  try {
    const [{ dashboard: d }, caixa] = await Promise.all([api('GET', '/app/dashboard'), api('GET', '/app/tarefas/caixa').catch(() => null)]);
    // KPI acionável: número + o que fazer com ele; data-ir leva à tela certa
    const kpi = (n, rot, ctx, ir, tom, icone) => {
      const corpo = `<span class="vx-kpi-top"><span class="vx-kpi-rot">${esc(rot)}</span>${icone ? `<span class="cp-kico">${svgIco(icone)}</span>` : ''}</span><span class="vx-kpi-val">${n}</span>` +
        (ctx ? `<span class="vx-kpi-ctx">${esc(ctx)}</span>` : '');
      return ir
        ? `<button type="button" class="vx-kpi" data-tom="${tom || ''}" data-ir="${ir}">${corpo}</button>`
        : `<div class="vx-kpi" data-tom="${tom || ''}">${corpo}</div>`;
    };
    const secao = (titulo, sub, corpo) => `<section class="vx-card"><div class="vx-card-head"><div><h2>${esc(titulo)}</h2>` +
      (sub ? `<p class="vx-hint vx-mb0">${esc(sub)}</p>` : '') + '</div></div>' + corpo + '</section>';
    const tab = (titulo, linhas) => linhas && linhas.length
      ? `<div class="vx-card"><h3>${esc(titulo)}</h3><div class="vx-tabela-wrap"><table>${linhas}</table></div></div>` : '';

    const exige = [
      d.tarefas_atrasadas ? kpi(d.tarefas_atrasadas, 'Tarefas atrasadas', 'passaram do prazo', 'tarefas', 'critico', 'clock') : '',
      d.tarefas_hoje ? kpi(d.tarefas_hoje, 'Tarefas de hoje', 'para fechar hoje', 'tarefas', 'atencao', 'calendar') : '',
      d.leads_sem_acao ? kpi(d.leads_sem_acao, 'Leads sem ação', 'ninguém retomou', 'contatos', 'atencao', 'target') : '',
      d.propostas_vencidas ? kpi(d.propostas_vencidas, 'Propostas vencidas', 'passaram da validade', 'propostas', 'critico', 'file') : '',
    ].filter(Boolean).join('');

    const hora = new Date().getHours(), saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const boasVindas = `<div class="cp-welcome"><div><h2>${saud}, ${esc(String(ME.usuario.nome || '').split(' ')[0] || 'time')}</h2>
      <p>${esc(ME.empresa.nome)} · veja o que pede ação hoje e como está a carteira.</p></div>
      <div class="acoes"><button type="button" class="btn secund" id="w-contatos">${svgIco('users')} Contatos</button>
      <button type="button" class="btn" id="w-opp">${svgIco('plus')} Nova oportunidade</button></div></div>`;
    $('#tela').innerHTML = boasVindas +
      secao('Exige ação', 'O que está esperando por você agora.',
        (exige ? `<div class="vx-kpis">${exige}</div>` : `<p class="vx-vazio">${svgIco('checkcircle')} Nada atrasado. Dia limpo.</p>`) +
        (caixa ? caixaHTML(caixa) : '')) +
      secao('Funil', 'Como está a carteira hoje.', `<div class="vx-kpis">
        ${kpi(d.oportunidades_abertas, 'Negócios abertos', 'no funil', 'kanban', '', 'kanban')}
        ${kpi(brl(d.valor_em_negociacao_centavos), 'Em negociação', 'valor em aberto', 'kanban', '', 'coins')}
        ${kpi(d.propostas_enviadas, 'Propostas em aberto', 'aguardando resposta', 'propostas', '', 'file')}
        ${kpi(d.taxa_conversao_pct + '%', 'Conversão', 'do total trabalhado', null, '', 'trending')}
      </div>`) +
      secao('Carteira', 'Entrada de gente nova e temperatura.', `<div class="vx-kpis">
        ${kpi(d.leads_novos_7d, 'Leads novos (7d)', 'entraram na semana', 'contatos', '', 'target')}
        ${kpi(d.contatos_total, 'Contatos ativos', 'na base', 'contatos', '', 'users')}
        ${kpi(d.leads_quentes, 'Leads quentes', 'prontos para abordar', 'contatos', '', 'flame')}
        ${kpi(brl(d.valor_ganho_centavos), 'Ganho (total)', 'negócios fechados', null, 'ok', 'checkcircle')}
        ${d.tempo_medio_fechamento_dias != null ? kpi(d.tempo_medio_fechamento_dias + 'd', 'Tempo médio de fechamento', 'do 1º contato ao ganho', null, '', 'clock') : ''}
      </div>`) +
      `<div class="duas">
        ${tab('Leads e conversão por origem', d.por_origem.map(o => `<tr><td>${esc(o.origem || '—')}</td><td style="text-align:right">${o.leads} leads</td><td style="text-align:right">${o.convertidos} conv.</td></tr>`).join(''))}
        ${tab('Receita ganha por origem', d.receita_por_origem.map(o => `<tr><td>${esc(o.origem || '—')}</td><td style="text-align:right">${brl(o.v)}</td></tr>`).join(''))}
        ${tab('Previsão de receita (negócios abertos)', d.previsao_receita_mes.map(m => `<tr><td>${esc(m.mes)}</td><td style="text-align:right">${brl(m.v)}</td></tr>`).join(''))}
        ${tab('Performance por responsável', d.por_responsavel.map(r => `<tr><td>${esc(r.responsavel)}</td><td style="text-align:right">${r.ganhas}/${r.n}</td><td style="text-align:right">${brl(r.valor_ganho)}</td></tr>`).join(''))}
        ${tab('Motivos de perda', d.motivos_perda.map(m => `<tr><td>${esc(m.motivo)}</td><td style="text-align:right">${m.n}</td></tr>`).join(''))}
        ${tab('Temperatura dos leads', d.score_faixas.map(f => `<tr><td><span class="chip ${esc(f.faixa)}">${esc(f.faixa)}</span></td><td style="text-align:right">${f.n}</td></tr>`).join(''))}
      </div>`;
    document.querySelectorAll('#tela [data-ir]').forEach(b => { b.onclick = () => navegar(b.dataset.ir); });
    $('#w-opp').onclick = () => dlgOportunidade();
    $('#w-contatos').onclick = () => navegar('contatos');
    ligaCaixa();
  } catch (e) { erroTela(e); }
}
function caixaHTML(cx) {
  const chip = (t, cls) => t.map(x => `<button class="btn peq secund cx-item" data-id="${esc(x.contato_id || x.id)}" style="margin:2px">${cls} ${esc(x.titulo || x.nome || x.contato_nome || '')}${x.vence_em ? ' · ' + dataBr(x.vence_em) : ''}</button>`).join('');
  if (!cx.atrasadas.length && !cx.hoje.length && !cx.leads_parados.length && !cx.propostas_sem_resposta.length) return '';
  return `<div class="vx-card" style="margin-top:14px;border-left:4px solid var(--vx-accent)"><b>${svgIco('bell')} Retomar agora</b><br>
    ${cx.atrasadas.length ? '<p style="margin:6px 0 2px"><b>Atrasadas:</b><br>' + chip(cx.atrasadas, '<i class="cp-dot cp-dot--red"></i>') + '</p>' : ''}
    ${cx.hoje.length ? '<p style="margin:6px 0 2px"><b>Hoje:</b><br>' + chip(cx.hoje, '<i class="cp-dot cp-dot--amber"></i>') + '</p>' : ''}
    ${cx.leads_parados.length ? '<p style="margin:6px 0 2px"><b>Leads parados:</b><br>' + chip(cx.leads_parados, '<i class="cp-dot cp-dot--blue"></i>') + '</p>' : ''}
    ${cx.propostas_sem_resposta.length ? '<p style="margin:6px 0 2px"><b>Propostas sem resposta:</b><br>' + chip(cx.propostas_sem_resposta, '<i class="cp-dot cp-dot--pink"></i>') + '</p>' : ''}
  </div>`;
}
function ligaCaixa() { document.querySelectorAll('.cx-item').forEach(b => b.onclick = () => abrirContato(b.dataset.id)); }

// ---------------- KANBAN ----------------
async function vKanban() {
  carregando();
  try {
    const { funis } = await api('GET', '/app/funis');
    if (!KANBAN_FUNIL && funis.length) KANBAN_FUNIL = funis[0].id;
    const k = await api('GET', '/app/kanban?funil_id=' + encodeURIComponent(KANBAN_FUNIL));
    const sel = funis.map(f => `<option value="${f.id}" ${f.id === KANBAN_FUNIL ? 'selected' : ''}>${esc(f.nome)}</option>`).join('');
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <label style="display:flex;align-items:center;gap:6px">Funil <select id="k-funil" style="width:auto;margin:0">${sel}</select></label>
        <button class="btn peq" id="k-novo">+ Nova oportunidade</button>
        <button class="btn peq secund" id="k-novo-funil">+ Novo funil</button>
      </div>
      <div class="kanban">${k.colunas.map(colunaHTML).join('')}</div>`;
    $('#k-funil').onchange = () => { KANBAN_FUNIL = $('#k-funil').value; vKanban(); };
    $('#k-novo').onclick = () => dlgOportunidade();
    $('#k-novo-funil').onclick = async () => {
      const nome = prompt('Nome do novo funil:'); if (!nome) return;
      try { const r = await api('POST', '/app/funis', { nome }); KANBAN_FUNIL = r.funil.id; vKanban(); } catch (e) { alert(e.message); }
    };
    ligaKanban();
  } catch (e) { erroTela(e); }
}
function colunaHTML(c) {
  const cards = c.oportunidades.map(o => `
    <div class="kard ${o.atrasada ? 'atrasada' : ''}" draggable="true" data-id="${o.id}" data-contato="${o.contato_id}">
      <b>${esc(o.contato_nome || o.titulo)}</b>
      <div class="meta">${esc(o.titulo)}${o.valor_centavos ? ' · ' + brl(o.valor_centavos) : ''}</div>
      <div class="meta"><span class="chip ${esc(faixa(o.contato_score))}">${o.contato_score}</span>
        ${o.contato_origem ? '<span class="chip">' + esc(o.contato_origem) + '</span>' : ''}
        ${o.previsao ? svgIco('calendar') + ' ' + dataBr(o.previsao) : ''}
        ${o.contato_telefone ? `<a href="${waLink(o.contato_telefone)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="WhatsApp">${svgIco('message')}</a>` : ''}</div>
    </div>`).join('');
  return `<div class="kcol" data-est="${c.id}"><h4><span>${esc(c.nome)}</span><span>${c.oportunidades.length}${c.total_centavos ? ' · ' + brl(c.total_centavos) : ''}</span></h4>${cards || '<div class="sub" style="margin:6px">—</div>'}</div>`;
}
const faixa = (n) => n <= 30 ? 'frio' : n <= 60 ? 'morno' : n <= 80 ? 'quente' : 'muito-quente';
function ligaKanban() {
  document.querySelectorAll('.kard').forEach(kd => {
    kd.onclick = () => abrirContato(kd.dataset.contato);
    kd.ondragstart = (ev) => ev.dataTransfer.setData('text/plain', kd.dataset.id);
  });
  document.querySelectorAll('.kcol').forEach(col => {
    col.ondragover = (ev) => { ev.preventDefault(); col.classList.add('sobre'); };
    col.ondragleave = () => col.classList.remove('sobre');
    col.ondrop = async (ev) => {
      ev.preventDefault(); col.classList.remove('sobre');
      const id = ev.dataTransfer.getData('text/plain');
      try {
        const nome = (col.querySelector('h4 span') || {}).textContent || '';
        const motivo = /perdid/i.test(nome) ? prompt('Motivo da perda (opcional):') || '' : '';
        await api('POST', `/app/oportunidades/${id}/mover`, { estagio_id: col.dataset.est, motivo });
        vKanban();
      } catch (e) { alert(e.message); }
    };
  });
}
async function dlgOportunidade(contatoId) {
  const { funis } = await api('GET', '/app/funis');
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Nova oportunidade</h3>
    ${contatoId ? '' : `<label>Contato (busque pelo nome) <input id="o-busca" placeholder="digite 2+ letras"><div id="o-lista"></div><input type="hidden" id="o-contato"></label>`}
    <label>Título <input id="o-titulo" placeholder="ex.: Hospedagem réveillon"></label>
    <div class="hi-grid">
      <label>Funil <select id="o-funil">${funis.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></label>
      <label>Valor (R$) <input id="o-valor" type="number" min="0" step="50"></label>
      <label>Previsão <input id="o-prev" type="date"></label>
    </div>
    <button class="btn" id="o-salvar">Criar</button> <button class="btn secund" id="o-fechar">Cancelar</button><p id="o-msg" class="erro"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  if (!contatoId) {
    let t; $('#o-busca').oninput = () => { clearTimeout(t); t = setTimeout(async () => {
      const b = $('#o-busca').value.trim(); if (b.length < 2) return;
      const { contatos } = await api('GET', '/app/contatos?busca=' + encodeURIComponent(b) + '&limite=8');
      $('#o-lista').innerHTML = contatos.map(c => `<button class="btn peq secund" data-id="${c.id}" style="margin:2px">${esc(c.nome || c.telefone)}</button>`).join('');
      $('#o-lista').querySelectorAll('button').forEach(bt => bt.onclick = () => { $('#o-contato').value = bt.dataset.id; $('#o-busca').value = bt.textContent; $('#o-lista').innerHTML = ''; });
    }, 300); };
  }
  $('#o-fechar').onclick = () => dlg.remove();
  $('#o-salvar').onclick = async () => {
    try {
      await api('POST', '/app/oportunidades', {
        contato_id: contatoId || $('#o-contato').value, titulo: $('#o-titulo').value.trim(),
        funil_id: $('#o-funil').value, valor_centavos: Math.round(Number($('#o-valor').value || 0) * 100), previsao: $('#o-prev').value,
      });
      dlg.remove(); vKanban();
    } catch (e) { $('#o-msg').textContent = e.message; }
  };
}

// ---------------- CONTATOS ----------------
async function vContatos() {
  carregando();
  try {
    const cfg = await api('GET', '/app/config');
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <button class="btn peq" id="c-novo">+ Novo contato</button>
        <input id="c-busca" placeholder="Buscar nome, telefone, e-mail, empresa…" style="flex:1;min-width:180px;margin:0;width:auto">
        <select id="c-tipo" style="width:auto;margin:0"><option value="">Todos os tipos</option>${cfg.tipos.map(t => `<option>${t}</option>`).join('')}</select>
        <select id="c-origem" style="width:auto;margin:0"><option value="">Todas as origens</option>${cfg.origens.map(o => `<option>${o}</option>`).join('')}</select>
        <button class="btn peq secund" id="c-importar">⬆ Importar</button>
        <button class="btn peq secund" id="c-unificar">🔗 Unificar cadastros</button>
        <a class="btn peq secund" href="/crm/api/app/contatos/exportar">⬇ Exportar</a>
      </div><div id="c-lista"><p class="sub">Carregando…</p></div>`;
    const carregar = async () => {
      const q = new URLSearchParams();
      if ($('#c-busca').value.trim()) q.set('busca', $('#c-busca').value.trim());
      if ($('#c-tipo').value) q.set('tipo', $('#c-tipo').value);
      if ($('#c-origem').value) q.set('origem', $('#c-origem').value);
      const { contatos } = await api('GET', '/app/contatos?' + q);
      $('#c-lista').innerHTML = contatos.length ? `<div class="card" style="padding:8px;overflow-x:auto"><table>
        <thead><tr><th>Nome</th><th>Contato</th><th>Tipo</th><th>Origem</th><th>Score</th><th>Próx. ação</th><th></th></tr></thead><tbody>
        ${contatos.map(c => `<tr>
          <td><a href="#" class="c-abrir" data-id="${c.id}"><b>${esc(c.nome || '(sem nome)')}</b></a>${c.empresa_nome ? '<br><span class="sub" style="margin:0;text-align:left">' + esc(c.empresa_nome) + '</span>' : ''}</td>
          <td>${c.telefone ? `<a href="${waLink(c.telefone)}" target="_blank" rel="noopener">💬 ${esc(c.telefone)}</a>` : ''}${c.email ? `<br><a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</td>
          <td><span class="chip">${esc(c.tipo)}</span></td><td>${esc(c.origem || '—')}</td>
          <td><span class="chip ${esc(c.score_faixa)}">${c.score}</span></td>
          <td>${c.proxima_acao ? esc(c.proxima_acao) + (c.proxima_acao_em ? ' · ' + dataBr(c.proxima_acao_em) : '') : '—'}</td>
          <td><button class="btn peq secund c-abrir" data-id="${c.id}">Abrir</button></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="card">Nenhum contato ainda. Crie o primeiro ou importe um CSV.</div>';
      document.querySelectorAll('.c-abrir').forEach(a => a.onclick = (ev) => { ev.preventDefault(); abrirContato(a.dataset.id); });
    };
    let t; $('#c-busca').oninput = () => { clearTimeout(t); t = setTimeout(carregar, 300); };
    $('#c-tipo').onchange = carregar; $('#c-origem').onchange = carregar;
    $('#c-novo').onclick = () => dlgContato(cfg);
    $('#c-importar').onclick = () => dlgImportar();
    $('#c-unificar').onclick = () => dlgUnificar();
    carregar();
  } catch (e) { erroTela(e); }
}
function dlgContato(cfg) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Novo contato</h3>
    <div class="hi-grid"><label>Nome <input id="n-nome"></label><label>Sobrenome <input id="n-sobre"></label></div>
    <div class="hi-grid"><label>Telefone/WhatsApp <input id="n-tel" placeholder="61 9xxxx-xxxx"></label><label>E-mail <input id="n-email" type="email"></label></div>
    <div class="hi-grid"><label>Instagram <input id="n-ig" placeholder="@usuario ou link"></label><label>Facebook <input id="n-fb" placeholder="link do perfil"></label></div>
    <div class="hi-grid"><label>TikTok <input id="n-tt" placeholder="@usuario"></label><label>LinkedIn <input id="n-li" placeholder="link do perfil"></label></div>
    <div class="hi-grid">
      <label>Tipo <select id="n-tipo">${cfg.tipos.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Origem <select id="n-origem">${cfg.origens.map(o => `<option>${o}</option>`).join('')}</select></label>
    </div>
    <div class="hi-grid"><label>Interesse/produto <input id="n-prod"></label><label>Ticket potencial (R$) <input id="n-ticket" type="number" min="0"></label></div>
    <label>Primeira mensagem / observação <textarea id="n-obs" rows="2"></textarea></label>
    <label style="font-weight:400"><input type="checkbox" id="n-optin" checked style="width:auto;margin-right:6px">Tenho consentimento para contato (LGPD)</label>
    <button class="btn" id="n-salvar">Criar contato</button> <button class="btn secund" id="n-fechar">Cancelar</button><p id="n-msg" class="erro"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  $('#n-fechar').onclick = () => dlg.remove();
  $('#n-salvar').onclick = async () => {
    try {
      const r = await api('POST', '/app/contatos', {
        nome: $('#n-nome').value.trim(), sobrenome: $('#n-sobre').value.trim(), telefone: $('#n-tel').value.trim(),
        email: $('#n-email').value.trim(), instagram: $('#n-ig').value.trim(), facebook: $('#n-fb').value.trim(),
        tiktok: $('#n-tt').value.trim(), linkedin: $('#n-li').value.trim(), tipo: $('#n-tipo').value, origem: $('#n-origem').value,
        produto_interesse: $('#n-prod').value.trim(), ticket_centavos: Math.round(Number($('#n-ticket').value || 0) * 100),
        primeira_mensagem: $('#n-obs').value.trim(),
        consentimento: { optIn: $('#n-optin').checked, base: 'cadastro-manual', em: new Date().toISOString() },
      });
      dlg.remove(); abrirContato(r.contato.id);
    } catch (e) { $('#n-msg').textContent = e.message; }
  };
}
function dlgImportar() {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Importar contatos</h3>
    <p class="sub" style="text-align:left"><b>CSV</b> — cabeçalhos aceitos: nome, sobrenome, telefone, whatsapp, email, instagram, facebook, tiktok, linkedin, empresa, cargo, cidade, estado, tipo, origem, interesse, obs, tags. Também reconhece direto a exportação do <b>Google Contatos</b> e as <b>Conexões do LinkedIn</b>. Separador ; ou ,. Duplicados (telefone, e-mail ou perfil) são mesclados.</p>
    <input type="file" id="i-arq" accept=".csv,text/csv">
    <button class="btn" id="i-ok">Importar CSV</button>
    <hr style="margin:14px 0">
    <p class="sub" style="text-align:left"><b>Perfis de uma rede</b> — arquivo de seguidores/seguindo do Instagram ("Baixar suas informações", formato JSON) ou lista de texto, um perfil por linha (@usuario, link ou "Nome;link"). Essas exportações trazem usuário e nome, <b>não</b> telefone nem e-mail.</p>
    <label>Rede <select id="i-rede">${['instagram', 'facebook', 'tiktok', 'linkedin'].map(k => `<option value="${k}">${CANAIS_UI[k]}</option>`).join('')}</select></label>
    <input type="file" id="i-arq2" accept=".json,.txt,.csv,text/plain,application/json">
    <button class="btn" id="i-ok2">Importar perfis</button> <button class="btn secund" id="i-fechar">Fechar</button><p id="i-msg"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  $('#i-fechar').onclick = () => dlg.remove();
  $('#i-ok').onclick = async () => {
    const f = $('#i-arq').files[0]; if (!f) return;
    try {
      const csv = await f.text();
      const r = await api('POST', '/app/contatos/importar', { csv });
      $('#i-msg').textContent = `✅ ${r.criados} criados, ${r.duplicados} mesclados, ${r.invalidos} inválidos.`;
      setTimeout(() => { dlg.remove(); vContatos(); }, 1500);
    } catch (e) { $('#i-msg').textContent = e.message; }
  };
  $('#i-ok2').onclick = async () => {
    const f = $('#i-arq2').files[0]; if (!f) return;
    try {
      const r = await api('POST', '/app/contatos/importar-rede', { canal: $('#i-rede').value, texto: await f.text() });
      $('#i-msg').textContent = `✅ ${r.criados} criados, ${r.duplicados} já existiam (mesclados), ${r.invalidos} inválidos.`;
      setTimeout(() => { dlg.remove(); vContatos(); }, 1800);
    } catch (e) { $('#i-msg').textContent = e.message; }
  };
}

// ---- unificar cadastros (mesma pessoa em dois contatos) ----
async function dlgUnificar() {
  const { grupos } = await api('GET', '/app/contatos-duplicados');
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Unificar cadastros</h3>
    <p class="sub" style="text-align:left">Contatos com o mesmo nome completo em cadastros diferentes. Ao unir, o primeiro fica e recebe canais, histórico, tarefas e oportunidades do outro. <b>Confira antes: dois homônimos são pessoas diferentes.</b></p>
    ${grupos.map(g => `<div class="card" style="margin-bottom:8px"><b>${esc(g[0].nome)}</b>
      ${g.map((r, i) => `<div class="lin">${i === 0 ? '⭐ ficará' : 'será unido'} · ${esc([r.telefone, r.email].filter(Boolean).join(' · ') || '—')} ${r.canais.map(k => `<span class="chip">${esc(CANAIS_UI[k.canal] || k.canal)}</span>`).join(' ')}
        ${i > 0 ? `<button class="btn peq un-ok" data-p="${g[0].id}" data-d="${r.id}">Unir ao primeiro</button>` : ''}</div>`).join('')}</div>`).join('') || '<p class="sub">Nenhuma duplicidade encontrada.</p>'}
    <button class="btn secund" id="un-fechar">Fechar</button><p id="un-msg" class="erro"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  $('#un-fechar').onclick = () => { dlg.remove(); vContatos(); };
  dlg.querySelectorAll('.un-ok').forEach(b => b.onclick = async () => {
    if (!confirm('Unir estes dois cadastros? Não dá para desfazer.')) return;
    try { await api('POST', `/app/contatos/${b.dataset.p}/mesclar`, { com: b.dataset.d }); dlg.remove(); dlgUnificar(); }
    catch (e) { $('#un-msg').textContent = e.message; }
  });
}

// ---- ficha do contato ----
async function abrirContato(id) {
  marcarRota('contatos', id);
  try {
    const { contato: c } = await api('GET', '/app/contatos/' + id);
    const tl = (c.atividades || []).map(a => `<div class="lin"><span class="chip">${esc(a.tipo)}</span> ${esc(a.texto)}<br><span class="sub" style="margin:0;text-align:left">${dataBr(a.data)} ${String(a.data).slice(11, 16)} · ${esc(a.autor || '')}</span></div>`).join('') || '<p class="sub" style="text-align:left">Sem atividades.</p>';
    const kv = (r, v) => v ? `<div class="lin"><b>${r}:</b> ${v}</div>` : '';
    $('#tela').innerHTML = `
      <button class="btn peq secund" id="f-voltar">← Voltar</button>
      <div class="duas" style="margin-top:10px">
        <div class="card">
          <h3 style="margin:0">${esc(c.nome || c.telefone || 'Contato')} <span class="chip ${esc(c.score_faixa)}">${c.score} · ${esc(c.score_faixa)}</span></h3>
          <p class="sub" style="text-align:left;margin:4px 0 10px">${esc(c.tipo)} · ${esc(c.origem || 'origem?')}${c.campanha ? ' · ' + esc(c.campanha) : ''} · criado ${dataBr(c.criado_em)}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            ${c.telefone ? `<a class="btn peq" target="_blank" rel="noopener" href="${waLink(c.telefone)}">💬 WhatsApp</a>` : ''}
            ${c.email ? `<a class="btn peq secund" href="mailto:${esc(c.email)}">✉️ E-mail</a>` : ''}
            ${c.telefone ? `<a class="btn peq secund" href="tel:+${esc(c.telefone)}">📞 Ligar</a>` : ''}
            <button class="btn peq secund" id="f-msg">💬 Mensagem por template</button>
            <button class="btn peq secund" id="f-ia">🤖 Qualificar</button>
          </div>
          <div class="lin"><b>Canais de contato:</b>
            ${(c.canais || []).map(k => `<div style="margin:3px 0"><span class="chip">${CANAL_ICO[k.canal] || ''} ${esc(CANAIS_UI[k.canal] || k.canal)}</span> <a href="${esc(k.link)}" target="_blank" rel="noopener">${esc(k.identificador)}</a>${k.opt_out ? ' <span class="chip">🚫 opt-out</span>' : ''}${k.fonte ? ` <small class="sub" title="De onde veio este dado">· ${esc(k.fonte)}</small>` : ''}
              <button class="btn peq secund cn-opt" data-id="${k.id}" data-sair="${k.opt_out ? 0 : 1}">${k.opt_out ? 'Reativar' : 'Opt-out'}</button>
              <button class="btn peq secund cn-del" data-id="${k.id}">✕</button></div>`).join('') || '<span class="sub">Nenhum canal cadastrado.</span>'}
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              <select id="cn-canal" style="width:auto">${Object.keys(CANAIS_UI).map(k => `<option value="${k}">${CANAIS_UI[k]}</option>`).join('')}</select>
              <input id="cn-valor" placeholder="telefone, e-mail, @usuario ou link" style="flex:1;min-width:160px">
              <button class="btn peq" id="cn-add">+ Canal</button></div>
            <p id="cn-msg" class="erro"></p></div>
          ${kv('Telefone', esc(c.telefone))}${kv('E-mail', esc(c.email))}${kv('Empresa', esc(c.empresa_nome))}${kv('Cidade', esc([c.cidade, c.estado].filter(Boolean).join('/')))}
          ${kv('Interesse', esc(c.interesse))}${kv('Produto', esc(c.produto_interesse))}
          ${kv('Ticket potencial', c.ticket_centavos ? brl(c.ticket_centavos) : '')}
          ${kv('UTM', Object.keys(c.utm || {}).length ? esc(JSON.stringify(c.utm)) : '')}
          ${kv('Página de entrada', esc(c.pagina_entrada))}${kv('Primeira mensagem', esc(c.primeira_mensagem))}
          ${kv('Tags', (c.tags || []).map(t => '<span class="chip">' + esc(t) + '</span>').join(' '))}
          ${kv('LGPD', c.consentimento && c.consentimento.optIn === false ? '🚫 OPT-OUT — não contatar' : (c.consentimento && c.consentimento.optIn ? '✅ opt-in (' + esc(c.consentimento.base || '') + ')' : '—'))}
          <div style="margin-top:12px">
            <label>Responsável <input id="f-resp" value="${esc(c.responsavel)}"></label>
            <div class="hi-grid">
              <label>Próxima ação <input id="f-acao" value="${esc(c.proxima_acao)}"></label>
              <label>Prazo <input id="f-prazo" type="date" value="${esc(c.proxima_acao_em)}"></label>
              <label>Prioridade <select id="f-prio">${['alta', 'media', 'baixa'].map(p => `<option ${p === c.prioridade ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
            </div>
            <button class="btn peq" id="f-salvar">Salvar</button>
            <button class="btn peq secund" id="f-oport">+ Oportunidade</button>
            <button class="btn peq secund" id="f-tarefa">+ Tarefa</button>
            <button class="btn peq secund" id="f-proposta">+ Proposta</button>
            <button class="btn peq secund" id="f-optout">🚫 Opt-out</button>
          </div>
          <div style="margin-top:12px"><label>Registrar contato/nota <textarea id="f-nota" rows="2" placeholder="ex.: liguei, cliente vai decidir amanhã"></textarea></label>
            <select id="f-nota-tipo" style="width:auto"><option value="nota">nota</option><option value="mensagem-enviada">mensagem enviada</option><option value="mensagem-recebida">mensagem recebida</option><option value="ligacao">ligação</option><option value="email">e-mail</option></select>
            <button class="btn peq secund" id="f-add">Adicionar à timeline</button></div>
        </div>
        <div>
          ${(c.oportunidades || []).length ? `<div class="card" style="margin-bottom:12px"><b>Oportunidades</b>${c.oportunidades.map(o => `<div class="lin">${esc(o.titulo)} — ${esc(o.funil_nome)} · <span class="chip">${esc(o.estagio_nome)}</span> ${o.valor_centavos ? brl(o.valor_centavos) : ''}</div>`).join('')}</div>` : ''}
          ${(c.propostas || []).length ? `<div class="card" style="margin-bottom:12px"><b>Propostas</b>${c.propostas.map(p => `<div class="lin">${esc(p.titulo)} · ${brl(p.valor_centavos)} · <span class="chip">${esc(p.status)}</span>${p.token ? ` <a href="/crm/p/${esc(p.token)}" target="_blank">link</a>` : ''}</div>`).join('')}</div>` : ''}
          ${(c.tarefas || []).length ? `<div class="card" style="margin-bottom:12px"><b>Tarefas abertas</b>${c.tarefas.map(t => `<div class="lin">${esc(t.titulo)}${t.vence_em ? ' · ' + dataBr(t.vence_em) : ''}</div>`).join('')}</div>` : ''}
          <div class="card"><b>Linha do tempo</b>${tl}</div>
        </div>
      </div><div id="f-saida"></div>`;
    $('#f-voltar').onclick = () => navegar('contatos');
    $('#cn-add').onclick = async () => {
      try { await api('POST', `/app/contatos/${id}/canais`, { canal: $('#cn-canal').value, identificador: $('#cn-valor').value.trim() }); abrirContato(id); }
      catch (e) { $('#cn-msg').textContent = e.message; }
    };
    document.querySelectorAll('.cn-opt').forEach(b => b.onclick = async () => { try { await api('POST', `/app/contatos/${id}/canais/${b.dataset.id}/optout`, { sair: b.dataset.sair === '1' }); abrirContato(id); } catch (e) { alert(e.message); } });
    document.querySelectorAll('.cn-del').forEach(b => b.onclick = async () => { if (!confirm('Remover este canal do contato?')) return; try { await api('DELETE', `/app/contatos/${id}/canais/${b.dataset.id}`); abrirContato(id); } catch (e) { alert(e.message); } });
    $('#f-salvar').onclick = async () => {
      try { await api('PATCH', '/app/contatos/' + id, { responsavel: $('#f-resp').value.trim(), proxima_acao: $('#f-acao').value.trim(), proxima_acao_em: $('#f-prazo').value, prioridade: $('#f-prio').value }); abrirContato(id); }
      catch (e) { alert(e.message); }
    };
    $('#f-add').onclick = async () => {
      const texto = $('#f-nota').value.trim(); if (!texto) return;
      try { await api('POST', `/app/contatos/${id}/atividade`, { tipo: $('#f-nota-tipo').value, texto }); abrirContato(id); } catch (e) { alert(e.message); }
    };
    $('#f-oport').onclick = () => dlgOportunidade(id);
    $('#f-tarefa').onclick = async () => {
      const titulo = prompt('Tarefa:'); if (!titulo) return;
      const vence = prompt('Prazo (AAAA-MM-DD, vazio = sem prazo):') || '';
      try { await api('POST', '/app/tarefas', { contato_id: id, titulo, vence_em: vence }); abrirContato(id); } catch (e) { alert(e.message); }
    };
    $('#f-proposta').onclick = () => dlgProposta(id);
    $('#f-optout').onclick = async () => {
      if (!confirm('Marcar opt-out (não contatar mais)?')) return;
      try { await api('PATCH', '/app/contatos/' + id, { consentimento: { optIn: false, base: 'opt-out', em: new Date().toISOString() } }); abrirContato(id); } catch (e) { alert(e.message); }
    };
    $('#f-msg').onclick = () => dlgTemplateEnvio(c);
    $('#f-ia').onclick = async () => {
      $('#f-saida').innerHTML = '<p class="sub">Analisando…</p>';
      try {
        const r = await api('POST', '/app/ia/qualificar/' + id);
        $('#f-saida').innerHTML = `<div class="card" style="margin-top:12px;border-left:4px solid var(--villela-gold)"><b>🤖 Agente de qualificação</b> <span class="sub" style="margin:0">(sugestão — revise antes de agir)</span>
          <div class="lin"><b>Perfil:</b> ${esc(r.perfil)}</div>
          <div class="lin"><b>Prioridade sugerida:</b> ${esc(r.prioridade_sugerida)} · <b>Chance:</b> ${esc(r.chance_conversao)}</div>
          ${r.dados_faltantes.length ? `<div class="lin"><b>Faltam:</b> ${r.dados_faltantes.map(esc).join(', ')}</div>` : ''}
          ${r.perguntas_sugeridas.length ? `<div class="lin"><b>Perguntar:</b> ${r.perguntas_sugeridas.map(esc).join(' · ')}</div>` : ''}
          <div class="lin"><b>Próxima ação:</b> ${esc(r.proxima_acao)}</div></div>`;
      } catch (e) { $('#f-saida').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
    };
  } catch (e) { erroTela(e); }
}
async function dlgTemplateEnvio(c) {
  const { templates } = await api('GET', '/app/templates');
  if (!templates.length) return alert('Nenhum template ativo. Crie na aba Templates.');
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Mensagem por template</h3>
    <label>Template <select id="te-sel">${templates.map(t => `<option value="${t.id}">${esc(t.nome)} (${esc(t.canal)})</option>`).join('')}</select></label>
    <textarea id="te-corpo" rows="6"></textarea>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${c.telefone ? `<a class="btn peq" id="te-wa" target="_blank" rel="noopener">💬 Abrir no WhatsApp</a>` : ''}
      ${c.email ? `<a class="btn peq secund" id="te-mail">✉️ Abrir e-mail</a>` : ''}
      <button class="btn peq secund" id="te-copiar">📋 Copiar</button>
      <button class="btn peq secund" id="te-reg">Registrar como enviada</button>
      <button class="btn peq secund" id="te-fechar">Fechar</button>
    </div>`;
  document.body.appendChild(dlg); dlg.showModal();
  let assunto = '';
  const render = async () => {
    const r = await api('POST', `/app/templates/${$('#te-sel').value}/render`, { contato_id: c.id });
    $('#te-corpo').value = r.corpo; assunto = r.assunto || '';
    const wa = $('#te-wa'); if (wa) wa.href = waLink(c.telefone, r.corpo);
    const ml = $('#te-mail'); if (ml) ml.href = `mailto:${c.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(r.corpo)}`;
  };
  $('#te-sel').onchange = render; await render();
  $('#te-copiar').onclick = () => navigator.clipboard.writeText($('#te-corpo').value).then(() => { $('#te-copiar').textContent = '✓ Copiado'; });
  $('#te-reg').onclick = async () => { await api('POST', `/app/contatos/${c.id}/atividade`, { tipo: 'mensagem-enviada', canal: 'whatsapp', texto: $('#te-corpo').value.slice(0, 500) }); dlg.remove(); abrirContato(c.id); };
  $('#te-fechar').onclick = () => dlg.remove();
}

// ---------------- TAREFAS ----------------
async function vTarefas() {
  carregando();
  try {
    const cx = await api('GET', '/app/tarefas/caixa');
    const bloco = (titulo, lista, cor) => `<div class="card" style="margin-bottom:12px;border-left:4px solid ${cor}"><b>${titulo} (${lista.length})</b>
      ${lista.map(t => `<div class="lin">${esc(t.titulo)}${t.contato_nome ? ' — <a href="#" class="t-c" data-id="' + t.contato_id + '">' + esc(t.contato_nome) + '</a>' : ''}
        ${t.vence_em ? ' · ' + dataBr(t.vence_em) : ''} <span class="chip">${esc(t.origem || t.tipo || '')}</span>
        <button class="btn peq secund t-ok" data-id="${t.id}" style="float:right">✓ Concluir</button></div>`).join('') || '<p class="sub" style="text-align:left">Nada aqui. 🎉</p>'}</div>`;
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn peq" id="t-nova">+ Nova tarefa</button>
      <button class="btn peq secund" id="t-auto">⚙️ Rodar automações agora</button></div>
      ${bloco('🔴 Atrasadas', cx.atrasadas, '#b00020')}
      ${bloco('🟡 Para hoje', cx.hoje, '#C9A227')}
      ${bloco('📄 Propostas sem resposta', cx.propostas_sem_resposta.map(p => ({ ...p, titulo: p.titulo + ' · ' + brl(p.valor_centavos) })), '#7C3AED')}
      ${bloco('🧊 Leads parados (7+ dias, negócio aberto)', cx.leads_parados.map(l => ({ titulo: (l.nome || l.telefone) + ' · score ' + l.score, contato_id: l.id, contato_nome: '', id: '' })), '#0E7490')}
      ${bloco('⏭ Próximas', cx.proximas, '#E2E6EC')}`;
    document.querySelectorAll('.t-ok').forEach(b => b.onclick = async () => { if (!b.dataset.id) return; try { await api('POST', `/app/tarefas/${b.dataset.id}/concluir`); vTarefas(); } catch (e) { alert(e.message); } });
    document.querySelectorAll('.t-c').forEach(a => a.onclick = (ev) => { ev.preventDefault(); abrirContato(a.dataset.id); });
    $('#t-nova').onclick = async () => {
      const titulo = prompt('Tarefa:'); if (!titulo) return;
      const vence = prompt('Prazo (AAAA-MM-DD, vazio = sem prazo):') || '';
      try { await api('POST', '/app/tarefas', { titulo, vence_em: vence }); vTarefas(); } catch (e) { alert(e.message); }
    };
    $('#t-auto').onclick = async () => {
      try { const r = await api('POST', '/app/automacoes/rodar'); alert(`Automações: ${r.tarefas_criadas} tarefa(s) criada(s), ${r.propostas_vencidas} proposta(s) vencida(s), ${r.priorizados} lead(s) priorizado(s).`); vTarefas(); }
      catch (e) { alert(e.message); }
    };
  } catch (e) { erroTela(e); }
}

// ---------------- TEMPLATES ----------------
async function vTemplates() {
  carregando();
  try {
    const { templates, variaveis } = await api('GET', '/app/templates?ativo=todos');
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn peq" id="tp-novo">+ Novo template</button></div>
      <p class="sub" style="text-align:left">Variáveis: ${variaveis.map(v => `<code>{{${v}}}</code>`).join(' ')}</p>
      <div class="grid">${templates.map(t => `<div class="card">
        <b>${esc(t.nome)}</b> <span class="chip">${esc(t.canal)}</span> ${t.categoria ? `<span class="chip">${esc(t.categoria)}</span>` : ''} ${!t.ativo ? '<span class="chip" style="background:#eee;color:#777">inativo</span>' : ''}
        ${t.assunto ? `<div class="sub" style="text-align:left;margin:4px 0"><b>Assunto:</b> ${esc(t.assunto)}</div>` : ''}
        <p style="white-space:pre-wrap;font-size:.85rem">${esc(t.corpo)}</p>
        <button class="btn peq secund tp-edit" data-id="${t.id}">Editar</button></div>`).join('') || '<div class="card">Nenhum template.</div>'}</div>`;
    const editar = (t) => {
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `<h3>${t ? 'Editar' : 'Novo'} template</h3>
        <div class="hi-grid"><label>Nome <input id="tp-nome" value="${esc(t ? t.nome : '')}"></label>
        <label>Canal <select id="tp-canal">${['whatsapp', 'email', 'sms', 'outro'].map(c => `<option ${t && t.canal === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>Categoria <input id="tp-cat" value="${esc(t ? t.categoria : '')}" placeholder="followup, orcamento…"></label></div>
        <label>Assunto (e-mail) <input id="tp-ass" value="${esc(t ? t.assunto : '')}"></label>
        <label>Corpo <textarea id="tp-corpo" rows="6">${esc(t ? t.corpo : '')}</textarea></label>
        ${t ? `<label style="font-weight:400"><input type="checkbox" id="tp-ativo" ${t.ativo ? 'checked' : ''} style="width:auto;margin-right:6px">Ativo</label>` : ''}
        <button class="btn" id="tp-salvar">Salvar</button> <button class="btn secund" id="tp-fechar">Cancelar</button><p id="tp-msg" class="erro"></p>`;
      document.body.appendChild(dlg); dlg.showModal();
      $('#tp-fechar').onclick = () => dlg.remove();
      $('#tp-salvar').onclick = async () => {
        const corpo = { nome: $('#tp-nome').value.trim(), canal: $('#tp-canal').value, categoria: $('#tp-cat').value.trim(), assunto: $('#tp-ass').value.trim(), corpo: $('#tp-corpo').value };
        if (t) corpo.ativo = $('#tp-ativo').checked;
        try { await api(t ? 'PATCH' : 'POST', '/app/templates' + (t ? '/' + t.id : ''), corpo); dlg.remove(); vTemplates(); }
        catch (e) { $('#tp-msg').textContent = e.message; }
      };
    };
    $('#tp-novo').onclick = () => editar(null);
    document.querySelectorAll('.tp-edit').forEach(b => b.onclick = () => editar(templates.find(x => x.id === b.dataset.id)));
  } catch (e) { erroTela(e); }
}

// ---------------- PROPOSTAS ----------------
async function vPropostas() {
  carregando();
  try {
    const { propostas } = await api('GET', '/app/propostas');
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn peq" id="pp-nova">+ Nova proposta</button></div>
      <div class="card" style="padding:8px;overflow-x:auto"><table>
      <thead><tr><th>Título</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Validade</th><th></th></tr></thead><tbody>
      ${propostas.map(p => `<tr><td><b>${esc(p.titulo)}</b></td><td><a href="#" class="pp-c" data-id="${p.contato_id}">${esc(p.contato_nome || '')}</a></td>
        <td>${brl(p.valor_centavos - (p.desconto_centavos || 0))}</td><td><span class="chip">${esc(p.status)}</span></td><td>${p.validade ? dataBr(p.validade) : '—'}</td>
        <td>${p.status === 'rascunho' ? `<button class="btn peq pp-env" data-id="${p.id}">📤 Enviar</button>` : ''}
        ${p.token ? `<a class="btn peq secund" href="/crm/p/${esc(p.token)}" target="_blank">🔗 Link</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma proposta.</td></tr>'}
      </tbody></table></div>`;
    $('#pp-nova').onclick = () => dlgProposta();
    document.querySelectorAll('.pp-c').forEach(a => a.onclick = (ev) => { ev.preventDefault(); abrirContato(a.dataset.id); });
    document.querySelectorAll('.pp-env').forEach(b => b.onclick = async () => { try { await api('POST', `/app/propostas/${b.dataset.id}/enviar`); vPropostas(); } catch (e) { alert(e.message); } });
  } catch (e) { erroTela(e); }
}
async function dlgProposta(contatoId) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Nova proposta</h3>
    ${contatoId ? '' : `<label>Contato <input id="pr-busca" placeholder="busque pelo nome"><div id="pr-lista"></div><input type="hidden" id="pr-contato"></label>`}
    <label>Título <input id="pr-titulo" placeholder="ex.: Hospedagem Villa Kubitschek — 4 noites"></label>
    <label>Descrição do item <input id="pr-item" placeholder="ex.: 4 noites · casa inteira · 12 hóspedes"></label>
    <div class="hi-grid"><label>Valor (R$) <input id="pr-valor" type="number" min="0" step="10"></label>
    <label>Desconto (R$) <input id="pr-desc" type="number" min="0" step="10"></label>
    <label>Validade <input id="pr-val" type="date"></label></div>
    <label>Condições <textarea id="pr-cond" rows="2" placeholder="ex.: sinal de 50% para reservar; saldo até 7 dias antes"></textarea></label>
    <label>Link de pagamento (opcional) <input id="pr-pag"></label>
    <button class="btn" id="pr-salvar">Criar rascunho</button> <button class="btn secund" id="pr-fechar">Cancelar</button><p id="pr-msg" class="erro"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  if (!contatoId) {
    let t; $('#pr-busca').oninput = () => { clearTimeout(t); t = setTimeout(async () => {
      const b = $('#pr-busca').value.trim(); if (b.length < 2) return;
      const { contatos } = await api('GET', '/app/contatos?busca=' + encodeURIComponent(b) + '&limite=8');
      $('#pr-lista').innerHTML = contatos.map(c => `<button class="btn peq secund" data-id="${c.id}" style="margin:2px">${esc(c.nome || c.telefone)}</button>`).join('');
      $('#pr-lista').querySelectorAll('button').forEach(bt => bt.onclick = () => { $('#pr-contato').value = bt.dataset.id; $('#pr-busca').value = bt.textContent; $('#pr-lista').innerHTML = ''; });
    }, 300); };
  }
  $('#pr-fechar').onclick = () => dlg.remove();
  $('#pr-salvar').onclick = async () => {
    try {
      await api('POST', '/app/propostas', {
        contato_id: contatoId || $('#pr-contato').value, titulo: $('#pr-titulo').value.trim(),
        itens: [{ descricao: $('#pr-item').value.trim() || $('#pr-titulo').value.trim(), qtd: 1, valor_centavos: Math.round(Number($('#pr-valor').value || 0) * 100) }],
        desconto_centavos: Math.round(Number($('#pr-desc').value || 0) * 100),
        validade: $('#pr-val').value, condicoes: $('#pr-cond').value.trim(), link_pagamento: $('#pr-pag').value.trim(),
      });
      dlg.remove(); vPropostas();
    } catch (e) { $('#pr-msg').textContent = e.message; }
  };
}

// ---------------- BUSCA ATIVA (leads do Google Maps) ----------------
const BUSCA_ST = { aguardando_aprovacao: '⏳ aguardando aprovação', ativa: '🟢 ativa', pausada: '⏸ pausada' };
const reais = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let BUSCA_POLL = null;
async function vBuscas() {
  carregando();
  clearInterval(BUSCA_POLL);
  try {
    const d = await api('GET', '/app/buscas');
    const rodando = d.buscas.some(b => b.rodando_desde);
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn peq" id="bu-nova">+ Nova busca</button></div>
      <p class="sub" style="text-align:left">Varreduras periódicas de empresas do Google Maps (nome, atividade, endereço). E-mail e WhatsApp quase nunca estão no Maps: o CRM lê o <b>site público</b> da empresa e marca de onde veio cada dado. Quem entra aqui <b>não deu consentimento</b> (base: legítimo interesse B2B, com opt-out por canal) e <b>nada é enviado sozinho</b> — a abordagem é por campanha, com você aprovando.</p>
      <p class="sub" style="text-align:left">Cada varredura <b>gasta crédito</b> da fonte, por isso a busca só roda depois de você aprovar a estimativa. Teto do mês: ${d.lugares_no_mes}/${d.teto_mes} lugares usados.${d.agenda_ligada ? '' : ' <b>Agenda automática desligada no servidor</b> (só "Rodar agora").'}</p>
      <div class="grid">${d.buscas.map(b => `<div class="card"><b>${esc(b.nome)}</b> <span class="chip">${BUSCA_ST[b.status] || esc(b.status)}</span>
        <p class="sub" style="text-align:left;margin:6px 0">“${esc(b.termos.join(' / '))}” · ${b.lat != null ? 'raio ' + b.raio_m + ' m' : esc(b.locais.map(x => x.split(',')[0]).join(', '))} · a cada ${b.frequencia_dias} dia(s) · até ${b.max_resultados} lugares · tag <code>${esc(b.tag)}</code></p>
        <p class="sub" style="text-align:left;margin:6px 0">Custo estimado: ~${reais(b.custo.brl_centavos)} por varredura (≈ ${reais(b.custo.por_mes_centavos)}/mês). ${b.resumo.lugares || 0} lugar(es) · ${b.resumo.contatos || 0} contato(s).
        ${b.ultima_execucao ? `Última: ${esc(b.ultima_execucao.status)}${b.ultima_execucao.status === 'ok' ? ` — ${b.ultima_execucao.novos} novos, ${b.ultima_execucao.existentes} já conhecidos, ${b.ultima_execucao.enriquecidos} sites com contato` : ''}${b.ultima_execucao.erro ? ' · ' + esc(b.ultima_execucao.erro) : ''}.` : 'Ainda não rodou.'}
        ${b.rodando_desde ? '<b>⏳ Rodando agora…</b>' : ''}${b.fonte_configurada ? '' : ' <b>Fonte sem credencial no servidor — nada roda.</b>'}</p>
        ${b.status === 'aguardando_aprovacao' ? `<button class="btn peq bu-aprovar" data-id="${b.id}">✅ Aprovar custo e ativar</button>` : ''}
        ${b.status === 'ativa' ? `<button class="btn peq bu-rodar" data-id="${b.id}" data-custo="${b.custo.brl_centavos}">▶ Rodar agora</button> <button class="btn peq secund bu-st" data-id="${b.id}" data-st="pausada">⏸ Pausar</button>` : ''}
        ${b.status === 'pausada' ? `<button class="btn peq secund bu-st" data-id="${b.id}" data-st="ativa">▶ Retomar</button>` : ''}
        ${b.tags_extra.length ? `<button class="btn peq secund bu-camp" data-tag="${esc(b.tags_extra[0])}">📋 Preparar campanha (rascunho)</button>` : ''}
        <button class="btn peq secund bu-ver" data-id="${b.id}">O que entrou</button>
        <button class="btn peq secund bu-st" data-id="${b.id}" data-st="arquivada">Arquivar</button></div>`).join('') || '<div class="card">Nenhuma busca criada.</div>'}</div>
      <div id="bu-lugares"></div>`;
    $('#bu-nova').onclick = () => dlgBusca(d);
    document.querySelectorAll('.bu-aprovar').forEach(x => x.onclick = () => {
      const b = d.buscas.find(y => y.id === x.dataset.id);
      if (!confirm(`Aprovar esta busca?\n\nCusto estimado: ~${reais(b.custo.brl_centavos)} por varredura, a cada ${b.frequencia_dias} dia(s) (≈ ${reais(b.custo.por_mes_centavos)}/mês).\n\nA fonte é um serviço que lê o Google Maps e cobra por lugar; isso pode contrariar os termos de uso do Google Maps. Você assume esse risco e a responsabilidade LGPD pela abordagem (legítimo interesse B2B).\n\nConfirma?`)) return;
      api('POST', `/app/buscas/${b.id}/aprovar`, { aceite: true }).then(vBuscas).catch(e => alert(e.message));
    });
    document.querySelectorAll('.bu-rodar').forEach(x => x.onclick = () => {
      if (!confirm(`Rodar agora? Vai consumir até ~${reais(x.dataset.custo)} de crédito da fonte.`)) return;
      api('POST', `/app/buscas/${x.dataset.id}/rodar`).then(vBuscas).catch(e => alert(e.message));
    });
    document.querySelectorAll('.bu-st').forEach(x => x.onclick = () => {
      if (x.dataset.st === 'arquivada' && !confirm('Arquivar esta busca? Os contatos já capturados continuam no CRM.')) return;
      api('POST', `/app/buscas/${x.dataset.id}/status`, { status: x.dataset.st }).then(vBuscas).catch(e => alert(e.message));
    });
    document.querySelectorAll('.bu-ver').forEach(x => x.onclick = () => verLugaresBusca(x.dataset.id));
    document.querySelectorAll('.bu-camp').forEach(x => x.onclick = async () => {
      if (!confirm(`Montar a campanha dos contatos com a tag "${x.dataset.tag}" (e-mail e WhatsApp)?\n\nEla nasce em RASCUNHO e NADA é enviado: a lista passa pela sua aprovação e cada envio é manual.`)) return;
      try { const r = await api('POST', '/app/buscas/preparar-campanha', { tag: x.dataset.tag }); alert(`${r.aviso}\n\n${r.alvos} alvo(s) em ${r.contatos} contato(s).`); navegar('campanhas'); } catch (e) { alert(e.message); }
    });
    if (rodando) { const meu = SEQ; BUSCA_POLL = setInterval(() => { if (meu !== SEQ || ABA !== 'buscas') return clearInterval(BUSCA_POLL); vBuscas(); }, 8000); }
  } catch (e) { erroTela(e); }
}
async function verLugaresBusca(id) {
  const box = $('#bu-lugares'); box.innerHTML = '<p class="sub">Carregando…</p>';
  try {
    const [{ lugares }, { execucoes }] = await Promise.all([api('GET', `/app/buscas/${id}/lugares`), api('GET', `/app/buscas/${id}/execucoes`)]);
    box.innerHTML = `<h3 style="margin-top:14px">O que entrou (${lugares.length})</h3>
      <p class="sub" style="text-align:left">Varreduras: ${execucoes.slice(0, 5).map(x => `${esc((x.iniciada_em || '').slice(0, 16).replace('T', ' '))} · ${esc(x.status)} · ${x.lugares} lugares · ${x.novos} novos${x.erro ? ' · ' + esc(x.erro) : ''}`).join(' | ') || 'nenhuma'}</p>
      ${lugares.map(l => `<div class="lin"><b>${esc(l.nome)}</b> <span class="sub">${esc(l.bairro ? l.bairro.split(',')[0] + ' · ' : '')}${esc(l.categoria)} · ${esc(l.endereco)}</span><br>
        ${l.site ? `<a href="${esc(l.site)}" target="_blank" rel="noopener noreferrer">site</a> ` : '<span class="sub">sem site</span> '}
        ${l.canais.map(k => `<span class="chip" title="Fonte: ${esc(k.fonte)}">${CANAL_ICO[k.canal] || ''} ${esc(k.identificador)}${k.rotulo ? ' (' + esc(k.rotulo) + ')' : ''} · ${esc(k.fonte)}</span>`).join(' ') || '<span class="sub">nenhum canal ainda</span>'}
        ${l.contato_id ? `<a href="#" class="bu-contato" data-id="${l.contato_id}">abrir contato</a>` : ''}</div>`).join('') || '<div class="card">Nada ainda — rode a busca.</div>'}`;
    document.querySelectorAll('.bu-contato').forEach(x => x.onclick = (ev) => { ev.preventDefault(); navegar('contatos'); setTimeout(() => abrirContato(x.dataset.id), 300); });
  } catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
function dlgBusca(d) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Nova busca no Google Maps</h3>
    <button class="btn peq secund" type="button" id="bu-preset">🎄 Preencher: confraternização de fim de ano (DF)</button>
    <label>O que buscar (uma categoria por linha) <textarea id="bu-termo" rows="3" placeholder="ex.: clínica odontológica"></textarea></label>
    <label>Regiões / bairros (um por linha) <textarea id="bu-local" rows="3" placeholder="ex.: Lago Sul, Brasília - DF"></textarea></label>
    <p class="sub" id="bu-conta" style="text-align:left"></p>
    <details><summary class="sub">ou um círculo por coordenadas</summary>
      <div class="hi-grid"><label>Latitude <input id="bu-lat" placeholder="-15.8"></label><label>Longitude <input id="bu-lng" placeholder="-47.88"></label></div>
      <label>Raio (metros, até 50.000) <input id="bu-raio" type="number" min="100" max="50000" value="3000"></label></details>
    <div class="hi-grid"><label>Repetir a cada <select id="bu-freq">${d.frequencias.map(f => `<option value="${f}"${f === 7 ? ' selected' : ''}>${f} dia(s)</option>`).join('')}</select></label>
      <label>Máx. de lugares por varredura <input id="bu-max" type="number" min="1" max="${d.max_por_busca}" value="60"></label></div>
    <label>Nome da busca (opcional) <input id="bu-nome"></label>
    <p class="sub" style="text-align:left">Ao criar, a busca fica <b>aguardando aprovação</b>: você verá a estimativa de custo e confirma. Nada é cobrado antes disso.</p>
    <button class="btn" id="bu-salvar">Criar busca</button> <button class="btn secund" id="bu-fechar">Cancelar</button><p id="bu-msg" class="erro"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  $('#bu-fechar').onclick = () => dlg.remove();
  let tagsPreset;
  const linhas = (id) => $(id).value.split(/\n/).map(x => x.trim()).filter(Boolean);
  const contar = () => {
    const nt = Math.max(1, linhas('#bu-termo').length), nl = Math.max(1, linhas('#bu-local').length), mx = Number($('#bu-max').value) || 0;
    $('#bu-conta').textContent = `${nt} categoria(s) × ${nl} região(ões) × até ${mx} = até ${nt * nl * mx} lugares por varredura (a estimativa em R$ aparece depois de criar).`;
  };
  ['#bu-termo', '#bu-local', '#bu-max'].forEach(id => $(id).oninput = contar); contar();
  $('#bu-preset').onclick = () => {
    $('#bu-termo').value = ['escritório', 'clínica', 'escola', 'escritório de advocacia', 'empresa de tecnologia', 'agência de marketing'].join('\n');
    $('#bu-local').value = ['Lago Sul', 'Lago Norte', 'Asa Sul', 'Asa Norte', 'Sudoeste', 'Noroeste', 'Park Way', 'Jardim Botânico', 'Águas Claras'].map(b => b + ', Brasília - DF').join('\n');
    $('#bu-max').value = 25; $('#bu-freq').value = '30'; $('#bu-nome').value = 'Confraternização 2026 — empresas do DF';
    tagsPreset = ['confraternizacao-2026']; contar();
  };
  $('#bu-salvar').onclick = async () => {
    try {
      const lat = $('#bu-lat').value.trim(), lng = $('#bu-lng').value.trim();
      const termos = linhas('#bu-termo'), locais = lat && lng ? [] : linhas('#bu-local');
      await api('POST', '/app/buscas', { termos, locais: locais.length ? locais : undefined, local_texto: locais.length ? undefined : (linhas('#bu-local')[0] || ''), tags: tagsPreset, lat: lat || undefined, lng: lng || undefined,
        raio_m: lat && lng ? $('#bu-raio').value : undefined, frequencia_dias: $('#bu-freq').value, max_resultados: $('#bu-max').value, nome: $('#bu-nome').value.trim() });
      dlg.remove(); vBuscas();
    } catch (e) { $('#bu-msg').textContent = e.message; }
  };
}

// ---------------- CAMPANHAS ----------------
async function vCampanhas() {
  carregando();
  try {
    const { campanhas } = await api('GET', '/app/campanhas');
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn peq" id="cp-nova">+ Nova campanha</button></div>
      <p class="sub" style="text-align:left">Campanhas semiautomáticas: você escolhe os canais e o segmento, o CRM monta a fila com a mensagem pronta e você dispara um a um (opt-out respeitado por canal). Instagram, Facebook, TikTok e LinkedIn são <b>assistidos</b>: o CRM abre o perfil e copia a mensagem, mas quem envia é você — não existe API que permita abrir conversa com uma lista nessas redes.</p>
      <div class="grid">${campanhas.map(c => `<div class="card"><b>${esc(c.nome)}</b> ${(c.canais && c.canais.length ? c.canais : [c.tipo]).map(k => `<span class="chip">${CANAL_ICO[k] || ''} ${esc(CANAIS_UI[k] || k)}</span>`).join(' ')} <span class="chip">${esc(c.status)}</span>
        <p class="sub" style="text-align:left;margin:6px 0">${c.alvos} alvo(s) · ${c.enviados} enviado(s) · ${c.respondidos} respondeu(ram)</p>
        <button class="btn peq secund cp-abrir" data-id="${c.id}" data-msg="${esc(c.mensagem)}">Trabalhar lista</button></div>`).join('') || '<div class="card">Nenhuma campanha.</div>'}</div>
      <div id="cp-alvos"></div>`;
    $('#cp-nova').onclick = () => dlgCampanha();
    document.querySelectorAll('.cp-abrir').forEach(b => b.onclick = () => abrirCampanha(b.dataset.id, b.dataset.msg));
  } catch (e) { erroTela(e); }
}
async function dlgCampanha(pre = {}) {
  const { alcance } = await api('GET', '/app/canais').catch(() => ({ alcance: {} }));
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Nova campanha</h3>
    <label>Nome <input id="ca-nome" placeholder="ex.: Reativação ex-hóspedes julho"></label>
    <label>O que fazer <select id="ca-tipo"><option value="msg">Enviar mensagem nos canais escolhidos</option><option value="tarefa">Criar tarefa</option><option value="ligacao">Ligar</option></select></label>
    <fieldset id="ca-canais" style="border:1px solid #d9dee2;border-radius:8px;margin:8px 0;padding:8px">
      <legend>Canais (a ordem da lista é a prioridade)</legend>
      ${Object.keys(CANAIS_UI).map(k => `<label style="font-weight:400;display:block"><input type="checkbox" class="ca-canal" value="${k}" style="width:auto;margin-right:6px" ${k === 'whatsapp' ? 'checked' : ''}>${CANAL_ICO[k]} ${CANAIS_UI[k]} <span class="sub" style="margin:0">· ${alcance[k] || 0} contato(s)${CANAL_ASSIST.includes(k) ? ' · assistido (você envia)' : ''}</span></label>`).join('')}
      <label style="margin-top:6px">Quando o contato tem mais de um canal
        <select id="ca-modo"><option value="melhor">Usar só o melhor canal (o primeiro da lista que ele tem)</option><option value="todos">Enviar em todos os canais que ele tem</option></select></label>
    </fieldset>
    <div class="hi-grid">
      <label>Tipo de contato <input id="ca-seg-tipo" placeholder="ex.: hospede (vazio = todos)"></label>
      <label>Origem <input id="ca-seg-origem" placeholder="ex.: indicacao"></label>
      <label>Score mínimo <input id="ca-seg-score" type="number" min="0" max="100"></label>
      <label>Dias sem interação <input id="ca-seg-dias" type="number" min="0" placeholder="ex.: 90"></label>
      <label>Cidade <input id="ca-seg-cidade"></label>
      <label>Tag <input id="ca-seg-tag"></label>
    </div>
    <fieldset style="border:1px solid #d9dee2;border-radius:8px;margin:8px 0;padding:8px">
      <legend>Por conversa anterior (só quem você aprovou na tela Conversas)</legend>
      <div class="hi-grid">
        <label>Assunto <select id="ca-seg-assunto"><option value="">Qualquer</option>${Object.keys(ASSUNTO_UI).map(k => `<option value="${k}">${ASSUNTO_UI[k]}</option>`).join('')}</select></label>
        <label>Temperatura <select id="ca-seg-temp"><option value="">Qualquer</option>${Object.keys(TEMP_UI).map(k => `<option value="${k}">${TEMP_UI[k]}</option>`).join('')}</select></label>
        <label>Última conversa <select id="ca-seg-faixa">${FAIXAS_DIAS.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></label>
      </div>
    </fieldset>
    <label>Mensagem (use {{nome}} etc.) <textarea id="ca-msg" rows="4"></textarea></label>
    <button class="btn" id="ca-salvar">Gerar fila</button> <button class="btn secund" id="ca-fechar">Cancelar</button><p id="ca-msg2" class="erro"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  $('#ca-fechar').onclick = () => dlg.remove();
  if (pre.assunto) $('#ca-seg-assunto').value = pre.assunto;
  if (pre.qualificacao) $('#ca-seg-temp').value = pre.qualificacao;
  if (pre.faixa) $('#ca-seg-faixa').value = pre.faixa;
  $('#ca-tipo').onchange = () => { $('#ca-canais').style.display = $('#ca-tipo').value === 'msg' ? '' : 'none'; };
  $('#ca-salvar').onclick = async () => {
    const seg = {};
    if ($('#ca-seg-tipo').value.trim()) seg.tipo = $('#ca-seg-tipo').value.trim();
    if ($('#ca-seg-origem').value.trim()) seg.origem = $('#ca-seg-origem').value.trim();
    if ($('#ca-seg-score').value) seg.score_min = $('#ca-seg-score').value;
    if ($('#ca-seg-dias').value) seg.dias_sem_interacao = $('#ca-seg-dias').value;
    if ($('#ca-seg-cidade').value.trim()) seg.cidade = $('#ca-seg-cidade').value.trim();
    if ($('#ca-seg-tag').value.trim()) seg.tag = $('#ca-seg-tag').value.trim();
    if ($('#ca-seg-assunto').value) seg.assunto = $('#ca-seg-assunto').value;
    if ($('#ca-seg-temp').value) seg.conversa_qualificacao = $('#ca-seg-temp').value;
    const fx = faixaDias($('#ca-seg-faixa').value); if (fx.min) seg.conversa_dias_min = fx.min; if (fx.max) seg.conversa_dias_max = fx.max;
    const msg = $('#ca-tipo').value === 'msg';
    const canais = msg ? [...document.querySelectorAll('.ca-canal:checked')].map(x => x.value) : [];
    if (msg && !canais.length) { $('#ca-msg2').textContent = 'Marque pelo menos um canal.'; return; }
    try {
      const r = await api('POST', '/app/campanhas', { nome: $('#ca-nome').value.trim(), tipo: msg ? undefined : $('#ca-tipo').value, canais, modo: $('#ca-modo').value, segmento: seg, mensagem: $('#ca-msg').value });
      alert(`Fila pronta: ${r.alvos} envio(s) para ${r.contatos != null ? r.contatos : r.alvos} contato(s).` + (r.sem_canal ? `\n${r.sem_canal} contato(s) do segmento ficaram de fora (sem o canal escolhido ou em opt-out).` : ''));
      dlg.remove(); vCampanhas();
    } catch (e) { $('#ca-msg2').textContent = e.message; }
  };
}
async function abrirCampanha(id, mensagem) {
  const { alvos } = await api('GET', `/app/campanhas/${id}/alvos`);
  const por = {}; alvos.forEach(a => { por[a.canal || 'legado'] = (por[a.canal || 'legado'] || 0) + 1; });
  $('#cp-alvos').innerHTML = `<div class="card" style="margin-top:14px"><b>Fila da campanha</b> (${alvos.length})
    <p class="sub" style="text-align:left;margin:4px 0 8px">${Object.entries(por).map(([k, n]) => `<span class="chip">${CANAL_ICO[k] || ''} ${esc(CANAIS_UI[k] || 'lista')}: ${n}</span>`).join(' ')}</p>
    ${alvos.map(a => {
      const msg = (mensagem || '').replace(/\{\{nome\}\}/g, (a.nome || '').split(' ')[0]);
      let acao = '';
      if (a.status === 'pendente') {
        if (a.canal === 'whatsapp') acao = `<a class="btn peq" target="_blank" rel="noopener" href="${waLink(a.destino, msg)}">💬 Enviar</a>`;
        else if (a.canal === 'email') acao = `<a class="btn peq" href="mailto:${esc(a.destino)}?body=${encodeURIComponent(msg)}">✉️ Escrever</a>`;
        else if (a.assistido && a.link_base) acao = `<button class="btn peq cp-copiar" data-msg="${esc(msg)}" data-link="${esc(a.link_base)}">📋 Copiar e abrir perfil</button>`;
        else if (!a.canal && a.telefone) acao = `<a class="btn peq" target="_blank" rel="noopener" href="${waLink(a.telefone, msg)}">💬 Enviar</a>`;
      }
      return `<div class="lin">${esc(a.nome || a.telefone)} <span class="chip ${faixa(a.score)}">${a.score}</span>
      ${a.canal ? `<span class="chip">${CANAL_ICO[a.canal] || ''} ${esc(CANAIS_UI[a.canal] || a.canal)}${a.canal === 'whatsapp' || a.canal === 'email' ? '' : ' · ' + esc(a.destino)}</span>` : ''}
      <span class="chip">${esc(a.status)}</span> ${acao}
      ${a.status === 'pendente' ? `<button class="btn peq secund cp-mark" data-id="${a.id}" data-st="enviado">✓ Enviado</button>
      <button class="btn peq secund cp-mark" data-id="${a.id}" data-st="pulado">Pular</button>` : ''}
      ${a.status === 'enviado' ? `<button class="btn peq secund cp-mark" data-id="${a.id}" data-st="respondido">💬 Respondeu</button>` : ''}</div>`;
    }).join('')}</div>`;
  document.querySelectorAll('.cp-copiar').forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.msg); b.textContent = '✅ Copiada — cole na conversa'; } catch (_) { b.textContent = 'Copie a mensagem manualmente'; }
    window.open(b.dataset.link, '_blank', 'noopener');
  });
  document.querySelectorAll('.cp-mark').forEach(b => b.onclick = async () => {
    try { await api('POST', `/app/campanha-alvos/${b.dataset.id}`, { status: b.dataset.st }); abrirCampanha(id, mensagem); } catch (e) { alert(e.message); }
  });
}

// ---------------- CONVERSAS (leads que já conversaram com a gente) ----------------
const ASSUNTO_UI = { hospedagem: 'Hospedagem / reserva', evento: 'Evento / confraternização', curso: 'Curso / Academy', livro: 'Livro / livraria', sistemas: 'Sistemas / SaaS', juridico: 'Jurídico', parceria: 'Parceria / fornecedor', obra: 'Obra / manutenção' };
const TEMP_UI = { quente: '🔥 quente', morno: '🌤 morno', frio: '❄️ frio', cliente: '✅ cliente', perdido: '🚫 perdido' };
const FAIXAS_DIAS = [['', 'Qualquer data'], ['0-7', 'Últimos 7 dias'], ['0-30', 'Últimos 30 dias'], ['31-90', 'Entre 31 e 90 dias'], ['91-180', 'Entre 91 e 180 dias'], ['181-', 'Mais de 180 dias']];
// '31-90' → há no mínimo 31 e no máximo 90 dias; '181-' → mais de 180; '0-7' → últimos 7
const faixaDias = (v) => { const [a, b] = String(v || '').split('-'); return { min: a && a !== '0' ? a : '', max: b || '' }; };
let CONV_FILTRO ={ status: 'sugerido', assunto: '', canal: '', qualificacao: '', faixa: '', busca: '' };
async function vConversas() {
  carregando();
  try {
    const f = CONV_FILTRO;
    const qs = new URLSearchParams({ status: f.status });
    ['assunto', 'canal', 'qualificacao', 'busca'].forEach(k => { if (f[k]) qs.set(k, f[k]); });
    const fx = faixaDias(f.faixa); if (fx.min) qs.set('dias_min', fx.min); if (fx.max) qs.set('dias_max', fx.max);
    const [{ conversas }, { assuntos }] = await Promise.all([api('GET', '/app/conversas?' + qs), api('GET', '/app/conversas/resumo')]);
    const aba = (id, rot) => `<button class="btn peq ${f.status === id ? '' : 'secund'} cv-aba" data-s="${id}">${rot}</button>`;
    $('#tela').innerHTML = `
      <p class="sub" style="text-align:left">Contatos que <b>já conversaram</b> com você (Gmail, WhatsApp e mensagens das redes), classificados por <b>assunto</b> e pela <b>razão da última conversa</b>. O texto das conversas nunca sai do seu computador: aqui só chegam o assunto, a razão e as contagens. A classificação é por palavras-chave e <b>pode errar</b> — por isso nada vira contato nem entra em campanha sem a sua aprovação.</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${aba('sugerido', 'Para decidir')}${aba('lead', 'Aprovadas (viram leads)')}${aba('descartado', 'Descartadas')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        <span class="chip cv-ass" data-a="" style="cursor:pointer;${f.assunto ? '' : 'font-weight:700'}">Todos os assuntos</span>
        ${assuntos.map(a => `<span class="chip cv-ass" data-a="${esc(a.assunto)}" style="cursor:pointer;${f.assunto === a.assunto ? 'font-weight:700' : ''}">${esc(a.rotulo)} · ${a.total}${a.sugeridas ? ` (${a.sugeridas} a decidir)` : ''}</span>`).join('') || '<span class="sub">Nenhuma conversa importada ainda.</span>'}
      </div>
      <div class="hi-grid" style="margin-bottom:10px">
        <label>Temperatura <select id="cv-q"><option value="">Todas</option>${Object.keys(TEMP_UI).map(k => `<option value="${k}" ${f.qualificacao === k ? 'selected' : ''}>${TEMP_UI[k]}</option>`).join('')}</select></label>
        <label>Canal <select id="cv-c"><option value="">Todos</option>${Object.keys(CANAIS_UI).map(k => `<option value="${k}" ${f.canal === k ? 'selected' : ''}>${CANAIS_UI[k]}</option>`).join('')}</select></label>
        <label>Última conversa <select id="cv-d">${FAIXAS_DIAS.map(([v, r]) => `<option value="${v}" ${f.faixa === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <label>Buscar <input id="cv-b" value="${esc(f.busca)}" placeholder="nome, telefone ou e-mail"></label>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <button class="btn peq secund" id="cv-aplicar">Filtrar</button>
        <button class="btn peq" id="cv-camp">📣 Campanha com este recorte</button>
      </div>
      <div class="card"><b>${conversas.length} conversa(s)</b>${conversas.length >= 300 ? ' <span class="sub">(mostrando as 300 mais recentes)</span>' : ''}
        ${conversas.map(c => `<div class="lin" style="padding:8px 0;border-bottom:1px solid #eef1f3">
          <b>${esc(c.contato_nome || c.nome || c.identificador.replace(/^nome:/, ''))}</b>
          <span class="chip">${CANAL_ICO[c.canal] || ''} ${esc(CANAIS_UI[c.canal] || c.canal)}</span>
          <span class="chip">${esc(ASSUNTO_UI[c.assunto] || c.assunto)}</span> <span class="chip">${TEMP_UI[c.qualificacao] || esc(c.qualificacao)}</span>
          <div class="sub" style="text-align:left;margin:3px 0">Última razão: <b>${esc(c.razao_rotulo || '—')}</b> · ${c.situacao === 'aguardando_nos' ? 'ele(a) falou por último — <b>aguarda a sua resposta</b>' : 'você falou por último — aguarda a resposta dele(a)'} · há ${c.dias_parado != null ? c.dias_parado + ' dia(s)' : '—'} · ${c.total} msg (${c.deles} dele/a, ${c.minhas} suas)
          ${c.evidencias && c.evidencias.length ? ` · palavras: ${esc(c.evidencias.join(', '))}` : ''}${c.identificador.startsWith('nome:') ? ' · <i>sem perfil vinculado (o export só traz o nome)</i>' : ''}</div>
          ${c.status === 'sugerido' ? `<button class="btn peq cv-dec" data-id="${c.id}" data-a="lead">✓ Aprovar como lead</button> <button class="btn peq secund cv-dec" data-id="${c.id}" data-a="descartar">✕ Descartar</button>` : ''}
          ${c.status === 'lead' ? `${c.contato_id ? `<button class="btn peq secund cv-ver" data-id="${c.contato_id}">Abrir contato</button>` : ''} <button class="btn peq secund cv-dec" data-id="${c.id}" data-a="sugerir">Voltar para decidir</button>` : ''}
          ${c.status === 'descartado' ? `<button class="btn peq secund cv-dec" data-id="${c.id}" data-a="sugerir">Reconsiderar</button>` : ''}
        </div>`).join('') || '<p class="sub" style="text-align:left">Nada neste recorte.</p>'}</div>`;
    document.querySelectorAll('.cv-aba').forEach(b => b.onclick = () => { CONV_FILTRO.status = b.dataset.s; vConversas(); });
    document.querySelectorAll('.cv-ass').forEach(b => b.onclick = () => { CONV_FILTRO.assunto = b.dataset.a; vConversas(); });
    $('#cv-aplicar').onclick = () => { CONV_FILTRO = { ...CONV_FILTRO, qualificacao: $('#cv-q').value, canal: $('#cv-c').value, faixa: $('#cv-d').value, busca: $('#cv-b').value.trim() }; vConversas(); };
    $('#cv-camp').onclick = () => {
      const pre = { assunto: CONV_FILTRO.assunto, qualificacao: $('#cv-q').value, faixa: $('#cv-d').value };
      dlgCampanha(pre);
    };
    document.querySelectorAll('.cv-dec').forEach(b => b.onclick = async () => {
      try { await api('POST', `/app/conversas/${b.dataset.id}/decidir`, { acao: b.dataset.a }); vConversas(); } catch (e) { alert(e.message); }
    });
    document.querySelectorAll('.cv-ver').forEach(b => b.onclick = () => abrirContato(b.dataset.id));
  } catch (e) { erroTela(e); }
}

// ---------------- AGENTES (IA) ----------------
async function vIA() {
  carregando();
  try {
    $('#tela').innerHTML = `
      <p class="sub" style="text-align:left">Agentes analisam sua base e devolvem <b>sugestões</b> — nada é enviado sem você. Toda execução fica registrada.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn peq" id="ia-fu">🔁 Follow-ups sugeridos</button>
        <button class="btn peq" id="ia-re">♻️ Reativação</button>
        <button class="btn peq" id="ia-pe">📉 Análise de perdas</button>
      </div><div id="ia-saida"></div><div id="ia-logs"></div>`;
    const saida = $('#ia-saida');
    $('#ia-fu').onclick = async () => {
      saida.innerHTML = '<p class="sub">Analisando…</p>';
      const r = await api('POST', '/app/ia/followups').catch(e => { saida.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return null; });
      if (!r) return;
      saida.innerHTML = `<div class="card"><b>🔁 Follow-ups sugeridos (${r.sugestoes.length})</b>
        ${r.sugestoes.map(sg => `<div class="lin"><b>${esc(sg.nome || sg.telefone)}</b> · parado há ${sg.dias_parado}d · score ${sg.score}<br>
          <span class="sub" style="text-align:left;margin:0">${esc(sg.mensagem)}</span><br>
          ${sg.telefone ? `<a class="btn peq" target="_blank" rel="noopener" href="${waLink(sg.telefone, sg.mensagem)}">💬 Enviar</a>` : ''}
          <a href="#" class="t-c" data-id="${sg.contato_id}">abrir ficha</a></div>`).join('') || '<p class="sub" style="text-align:left">Nenhum lead parado. 🎉</p>'}</div>`;
      document.querySelectorAll('.t-c').forEach(a => a.onclick = (ev) => { ev.preventDefault(); abrirContato(a.dataset.id); });
    };
    $('#ia-re').onclick = async () => {
      saida.innerHTML = '<p class="sub">Analisando…</p>';
      const r = await api('POST', '/app/ia/reativacao').catch(e => { saida.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return null; });
      if (!r) return;
      saida.innerHTML = `<div class="card"><b>♻️ Candidatos à reativação (${r.candidatos.length})</b>
        ${r.candidatos.map(c => `<div class="lin"><b>${esc(c.nome || c.telefone)}</b> · ${esc(c.tipo)} · último contato ${dataBr(c.ultima_interacao)}${c.ticket_centavos ? ' · ' + brl(c.ticket_centavos) : ''}
          <a href="#" class="t-c" data-id="${c.id}">abrir</a></div>`).join('') || '<p class="sub" style="text-align:left">Ninguém para reativar agora.</p>'}</div>`;
      document.querySelectorAll('.t-c').forEach(a => a.onclick = (ev) => { ev.preventDefault(); abrirContato(a.dataset.id); });
    };
    $('#ia-pe').onclick = async () => {
      saida.innerHTML = '<p class="sub">Analisando…</p>';
      const r = await api('POST', '/app/ia/perdas').catch(e => { saida.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return null; });
      if (!r) return;
      saida.innerHTML = `<div class="card"><b>📉 Análise de perdas</b>
        ${r.motivos.map(m => `<div class="lin">${esc(m.motivo)} — ${m.n}×</div>`).join('') || '<p class="sub" style="text-align:left">Sem perdas com motivo registrado.</p>'}
        ${r.sugestoes.map(sg => `<div class="lin">💡 ${esc(sg)}</div>`).join('')}</div>`;
    };
    const { logs } = await api('GET', '/app/ia/logs?n=20').catch(() => ({ logs: [] }));
    $('#ia-logs').innerHTML = logs.length ? `<div class="card" style="margin-top:14px"><b>Execuções recentes</b>
      ${logs.map(l => `<div class="lin"><span class="chip">${esc(l.agente)}</span> ${dataBr(l.criado_em)} ${String(l.criado_em).slice(11, 16)} · motor ${esc(l.motor)} · ${esc(l.status)}</div>`).join('')}</div>` : '';
  } catch (e) { erroTela(e); }
}

// ---------------- CONTA (equipe / plano / integrações) ----------------
async function vConta() {
  carregando();
  try {
    const [cob, eq, cfg] = await Promise.all([
      api('GET', '/cobranca'), api('GET', '/equipe'), api('GET', '/app/config').catch(() => null)]);
    const planoAtual = cob.plano ? cob.plano.slug : '';
    $('#tela').innerHTML = `
      <div class="duas">
        <div class="card"><b>💳 Plano e cobrança</b>
          <div class="lin">Plano atual: <b>${esc(cob.plano ? cob.plano.nome : '—')}</b> · status <span class="chip">${esc(cob.status_tenant)}</span></div>
          ${cob.trial_expira_em ? `<div class="lin">Trial até ${dataBr(cob.trial_expira_em)}</div>` : ''}
          <div class="lin">Assinar/trocar:
            ${cob.planos_disponiveis.map(p => `<button class="btn peq ${p.slug === planoAtual ? 'secund' : ''} cb-plano" data-p="${p.slug}" data-c="mensal" style="margin:2px">${esc(p.nome)} ${p.preco_centavos ? '· ' + brl(p.preco_centavos) + '/mês' : ''}</button>${p.preco_anual_centavos ? `<button class="btn peq secund cb-plano" data-p="${p.slug}" data-c="anual" style="margin:2px">${esc(p.nome)} · ${brl(p.preco_anual_centavos)}/ano (2 meses grátis)</button>` : ''}`).join('')}
          </div>
          ${!cob.mp_ativo ? '<p class="aviso">Pagamento online indisponível — fale com o suporte (aba abaixo) para ativar seu plano.</p>' : ''}
          ${cob.faturas.length ? `<div class="lin"><b>Faturas:</b> ${cob.faturas.map(f => `<span class="chip">${esc(f.competencia)} ${brl(f.valor_centavos)} ${esc(f.status)}</span>`).join(' ')}</div>` : ''}
        </div>
        <div class="card"><b>👥 Equipe</b> <span class="sub" style="margin:0">(papéis: ${esc(eq.papeis.join(', '))})</span>
          ${eq.usuarios.map(u => `<div class="lin">${esc(u.nome || u.email)} · <span class="chip">${esc(u.papel)}</span> ${u.ativo ? '' : '· inativo'}</div>`).join('')}
          <div style="margin-top:8px"><div class="hi-grid">
            <label>Nome <input id="eq-nome"></label><label>E-mail <input id="eq-email" type="email"></label>
            <label>Papel <select id="eq-papel">${eq.papeis.filter(p => p !== 'owner').map(p => `<option>${p}</option>`).join('')}</select></label></div>
          <button class="btn peq" id="eq-add">+ Adicionar usuário</button><p id="eq-msg" class="sub" style="text-align:left"></p></div>
        </div>
        ${cfg ? `<div class="card"><b>🔗 Captação de leads</b>
          <div class="lin"><b>Webhook de entrada</b> (formulários, Make/n8n/Zapier):<br><code style="font-size:.78rem;word-break:break-all">POST ${location.origin}/crm/webhook/${esc(cfg.webhook_token)}</code></div>
          <div class="lin sub" style="text-align:left">Envie JSON com nome, telefone, email, origem, utm, primeira_mensagem… O lead entra deduplicado e com procedência.</div>
          <div class="lin"><b>Chaves de API</b> <button class="btn peq secund" id="ak-nova">+ Gerar chave</button><div id="ak-lista"></div></div>
        </div>` : ''}
        <div class="card"><b>🔑 Minha senha</b>
          <p class="sub" style="text-align:left;margin:4px 0 8px">${esc(ME.usuario.email)} · as outras sessões abertas serão encerradas ao trocar.</p>
          <label>Senha atual <input id="pw-atual" type="password" autocomplete="current-password"></label>
          <label>Nova senha (8+ caracteres) <input id="pw-nova" type="password" autocomplete="new-password"></label>
          <label>Confirmar nova senha <input id="pw-conf" type="password" autocomplete="new-password"></label>
          <button class="btn peq" id="pw-salvar">Alterar senha</button><p id="pw-msg" class="sub" style="text-align:left" role="alert"></p>
        </div>
        <div class="card"><b>🎫 Suporte</b><div id="tk-lista"></div>
          <label>Assunto <input id="tk-ass"></label><label>Mensagem <textarea id="tk-txt" rows="2"></textarea></label>
          <button class="btn peq" id="tk-abrir">Abrir ticket</button>
        </div>
      </div>`;
    document.querySelectorAll('.cb-plano').forEach(b => b.onclick = async () => {
      if (!confirm(`Assinar o plano ${b.dataset.p} (${b.dataset.c === 'anual' ? 'anual' : 'mensal'})?`)) return;
      try { const r = await api('POST', '/cobranca/assinar', { plano: b.dataset.p, ciclo: b.dataset.c || 'mensal' }); if (r.link) location.href = r.link; }
      catch (e) { alert(e.message); }
    });
    $('#eq-add').onclick = async () => {
      try {
        const r = await api('POST', '/equipe', { nome: $('#eq-nome').value.trim(), email: $('#eq-email').value.trim(), papel: $('#eq-papel').value });
        $('#eq-msg').innerHTML = `✅ Criado. Link p/ definir senha: <a href="${esc(r.link_setup)}">${esc(r.link_setup)}</a>`;
      } catch (e) { $('#eq-msg').textContent = e.message; }
    };
    $('#pw-salvar').onclick = async () => {
      const msg = $('#pw-msg'); msg.textContent = '';
      if ($('#pw-nova').value !== $('#pw-conf').value) { msg.textContent = 'A confirmação não confere com a nova senha.'; return; }
      try {
        await api('POST', '/trocar-senha', { senha_atual: $('#pw-atual').value, nova_senha: $('#pw-nova').value });
        ['#pw-atual', '#pw-nova', '#pw-conf'].forEach(q => { $(q).value = ''; });
        msg.textContent = '✅ Senha alterada.';
      } catch (e) { msg.textContent = e.message; }
    };
    const carregarChaves = async () => {
      const { chaves } = await api('GET', '/app/chaves').catch(() => ({ chaves: [] }));
      $('#ak-lista').innerHTML = chaves.map(k => `<div class="lin"><code>${esc(k.chave_mascarada)}</code> ${esc(k.nome)} ${k.ativo ? '' : '· revogada'}</div>`).join('');
    };
    if ($('#ak-nova')) {
      $('#ak-nova').onclick = async () => {
        try { const r = await api('POST', '/app/chaves', { nome: 'painel' }); alert('Chave criada (copie agora, não será exibida de novo):\n\n' + r.chave); carregarChaves(); }
        catch (e) { alert(e.message); }
      };
      carregarChaves();
    }
    const carregarTickets = async () => {
      const { tickets } = await api('GET', '/tickets');
      $('#tk-lista').innerHTML = tickets.map(t => `<div class="lin">${esc(t.assunto)} · <span class="chip">${esc(t.status)}</span></div>`).join('');
    };
    $('#tk-abrir').onclick = async () => {
      try { await api('POST', '/tickets', { assunto: $('#tk-ass').value.trim(), texto: $('#tk-txt').value.trim() }); $('#tk-ass').value = ''; $('#tk-txt').value = ''; carregarTickets(); }
      catch (e) { alert(e.message); }
    };
    carregarTickets();
  } catch (e) { erroTela(e); }
}
