// =====================================================================
// Villela CRM — ENRIQUECIMENTO pelo site público da empresa.
// O Maps quase nunca traz e-mail nem WhatsApp; quem traz é o site da
// própria empresa (rodapé, "Fale conosco"). Lemos só páginas públicas,
// com a rede segura da Musique (SSRF bloqueado, robots.txt, taxa por
// domínio, tamanho e tempo máximos). Cada dado sai com a fonte
// `site:<host>` para gravar em crm_contato_canais.fonte.
// =====================================================================
'use strict';
const { URL } = require('url');
const rede = require('../music/cifras/importar/rede');
const Canais = require('./canais');

const UA = 'VillelaCRMBot/1.0 (+https://villelastay.com.br)';
const PAGINAS_MAX = 4;
const RE_PAG_CONTATO = /(contato|contact|fale|atendimento|sobre|about|quem-somos|institucional|trabalhe|carreira|equipe|diretoria|rh|gente|pessoas)/i;
// e-mail de FUNÇÃO (não de pessoa): é o que se coleta para achar RH/diretoria — nunca o nome de pessoa física (LGPD, minimização)
const PAPEIS = [
  ['rh', /^(rh|recursos-?humanos|gente|gestao-?de-?pessoas|pessoas|people|talentos|recrutamento|vagas|curriculos?|trabalheconosco|carreiras?|dp|departamentopessoal)([._-]|$)/i],
  ['diretoria', /^(diretoria|diretor|presidencia|ceo|socio|socios|administracao|admin|gerencia|direcao|financeiro)([._-]|$)/i],
]
const papelDe = (email) => { const l = String(email).split('@')[0]; const p = PAPEIS.find(([, re]) => re.test(l)); return p ? p[0] : ''; };
const ORDEM_PAPEL = { rh: 0, diretoria: 1, '': 2 };
const EXT_RUIM = /\.(png|jpe?g|gif|svg|webp|css|js|ico|woff2?)$/i;
const DOM_RUIM = /(example\.|sentry|wixpress|godaddy|domain\.com|seudominio|email\.com$|yourdomain|schema\.org|w3\.org)/i;
const LOCAL_RUIM = /^(no-?reply|do-?not-?reply|nao-?responda|mailer-daemon|postmaster|webmaster@?$)/i;

function desescapar(h) {
  return String(h || '').replace(/&#0*64;|&commat;|%40/gi, '@').replace(/&#0*46;/g, '.').replace(/&amp;/g, '&');
}

/** Extrai e-mails, WhatsApps e perfis de um HTML. Puro (testável sem rede). */
function extrair(html, hostSite = '') {
  const h = desescapar(html);
  const emails = new Map(); const was = new Set(); const redes = {};
  const addEmail = (e) => {
    e = String(e).toLowerCase().replace(/[.,;:)]+$/, '');
    if (EXT_RUIM.test(e) || DOM_RUIM.test(e)) return;
    const [local, dom] = e.split('@');
    if (!local || !dom || LOCAL_RUIM.test(local)) return;
    if (!Canais.normalizar('email', e)) return;
    emails.set(e, (dom === hostSite || dom.endsWith('.' + hostSite) || hostSite.endsWith('.' + dom) ? 0 : 1));
  };
  for (const m of h.matchAll(/mailto:([^"'?\s>]+)/gi)) addEmail(decodeURIComponent(m[1]));
  for (const m of h.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) addEmail(m[0]);

  for (const m of h.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?[^"'\s>]*?phone=|web\.whatsapp\.com\/send\?[^"'\s>]*?phone=|whatsapp:\/\/send\?[^"'\s>]*?phone=)\+?(\d{10,15})/gi)) {
    const n = Canais.normalizar('whatsapp', m[1]);
    if (n) was.add(n);
  }
  for (const canal of ['instagram', 'facebook']) {
    const re = canal === 'instagram' ? /instagram\.com\/([A-Za-z0-9._]+)/gi : /(?:facebook|fb)\.com\/([A-Za-z0-9.\-_]+)/gi;
    for (const m of h.matchAll(re)) {
      if (['sharer', 'sharer.php', 'share', 'share.php', 'tr', 'plugins', 'dialog', 'login', 'policies', 'groups', 'events', 'hashtag'].includes(m[1].toLowerCase())) continue;
      const ident = Canais.normalizar(canal, m[1]);
      if (ident && !redes[canal]) redes[canal] = ident;
    }
  }
  const ord = [...emails.entries()].sort((a, b) => (ORDEM_PAPEL[papelDe(a[0])] - ORDEM_PAPEL[papelDe(b[0])]) || (a[1] - b[1])).map(([e]) => e).slice(0, 4);
  return {
    emails: ord,
    papeis: Object.fromEntries(ord.filter((e) => papelDe(e)).map((e) => [e, papelDe(e)])),
    whatsapps: [...was].slice(0, 2),
    redes,
  };
}

function linksDeContato(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
      if (RE_PAG_CONTATO.test(u.pathname) && !out.includes(u.toString())) out.push(u.toString());
    } catch (_) { /* link quebrado */ }
    if (out.length >= PAGINAS_MAX - 1) break;
  }
  return out;
}

/**
 * Lê o site e devolve { fonte, emails[], whatsapps[], redes{}, paginas, erro? }.
 * `obter` injetável nos testes.
 */
async function enriquecerSite(siteUrl, { obter = rede.obter } = {}) {
  let url = String(siteUrl || '').trim();
  if (!url) return { vazio: true, emails: [], whatsapps: [], redes: {}, paginas: 0 };
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let base;
  try { base = rede.validarUrl(url); } catch (e) { return { erro: e.message, emails: [], whatsapps: [], redes: {}, paginas: 0 }; }
  const host = base.hostname.replace(/^www\./, '').toLowerCase();
  const acum = { emails: [], whatsapps: [], redes: {}, papeis: {}, paginas: 0 };
  const junta = (x) => {
    for (const e of x.emails) if (!acum.emails.includes(e)) acum.emails.push(e);
    for (const w of x.whatsapps) if (!acum.whatsapps.includes(w)) acum.whatsapps.push(w);
    for (const [k, v] of Object.entries(x.redes)) if (!acum.redes[k]) acum.redes[k] = v;
    Object.assign(acum.papeis, x.papeis || {});
  };
  let fila = [base.toString()]; let erro = '';
  const vistos = new Set();
  while (fila.length && acum.paginas < PAGINAS_MAX) {
    const u = fila.shift();
    if (vistos.has(u)) continue; vistos.add(u);
    try {
      const r = await obter(u, { ua: UA, maxBytes: 1024 * 1024 });
      acum.paginas++;
      junta(extrair(r.texto, host));
      if (acum.paginas === 1) fila = fila.concat(linksDeContato(r.texto, base));
    } catch (e) { if (acum.paginas === 0) erro = e.message; }
    // só para cedo quando já achou um e-mail de função (RH/diretoria) e um WhatsApp
    if (acum.emails.length && acum.whatsapps.length && Object.keys(acum.papeis).length) break;
  }
  acum.emails.sort((a, b) => (ORDEM_PAPEL[papelDe(a)] - ORDEM_PAPEL[papelDe(b)]));
  acum.emails = acum.emails.slice(0, 4);
  return { ...acum, fonte: 'site:' + host, ...(erro ? { erro } : {}) };
}

module.exports = { papelDe, extrair, enriquecerSite, linksDeContato, UA };
