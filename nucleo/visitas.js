// =====================================================================
// Núcleo · Visitas — analytics próprio de TODOS os sites do Grupo Villela Stay.
//
// O que este módulo resolve (antes existia só contagem crua de páginas do
// site villelastay.com.br, sem origem, sem localidade e sem os demais sites):
//
//   1. COBERTURA — um middleware registra toda página pública renderizada
//      pelo backend (Invente/Kids, Closet, Vitrine, Alta Vista, Academy,
//      CRM, Jurídico, Docs, Projetos, Gestão, Livraria, Área do Hóspede).
//      Não é preciso colar pixel em landing nenhuma: quem responde HTML
//      público é contado. O site estático villelastay.com.br continua
//      mandando o pixel /api/hit, agora com UTM e idioma.
//   2. ORIGEM — referrer classificado em canal (busca, Instagram, WhatsApp,
//      buscadores de IA...) + UTM de campanha.
//   3. LOCALIDADE — país/UF/cidade por base offline, resolvida em processo
//      filho de vida curta (ver visitas-geo-worker.js) e guardada em cache.
//   4. COMPORTAMENTO — visitante único (hash anônimo), sessão, rejeição,
//      dispositivo, navegador, sistema, idioma, hora × dia da semana.
//   5. RUÍDO — robô/crawler é marcado e sai da conta por padrão.
//
// LGPD (art. 6º, III — necessidade): NUNCA gravamos IP. O IP é usado em
// memória para (a) derivar o prefixo de rede que consulta a localidade e
// (b) gerar um identificador anônimo com SAL QUE TROCA TODO DIA — de um dia
// para o outro o mesmo visitante não é reconhecível, o que dá contagem de
// gente sem criar rastreamento de pessoa. Sem cookie, sem fingerprint.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fork } = require('child_process');

const ARQ_HITS = 'hits.jsonl';
const ARQ_HIST = 'visitas-historico.json';   // dias antigos já agregados
const ARQ_GEOCACHE = 'visitas-geo-cache.json';
const RETENCAO_DIAS = 120;                    // linhas cruas mais velhas viram agregado
const JANELA_SESSAO_MIN = 30;                 // padrão de mercado

// ---------------------------------------------------------------------
// Catálogo dos sites do grupo. A ordem importa: o primeiro prefixo que
// casar com o caminho vence (por isso /alta-vista vem antes de /a...).
// ---------------------------------------------------------------------
const PRODUTOS = [
  { id: 'origena', nome: 'Origena', emoji: '🌳', prefixos: ['/origena'] },
  { id: 'kids', nome: 'Invente (Kids)', emoji: '🧒', prefixos: ['/kids'] },
  { id: 'closet', nome: 'Closet Club', emoji: '👗', prefixos: ['/closet'] },
  { id: 'vitrine', nome: 'Vitrine', emoji: '🛒', prefixos: ['/vitrine'] },
  { id: 'alta-vista', nome: 'Alta Vista 360', emoji: '🚁', prefixos: ['/alta-vista'] },
  { id: 'academy', nome: 'Villela Academy', emoji: '🎓', prefixos: ['/academy'] },
  { id: 'crm', nome: 'Villela CRM', emoji: '🤝', prefixos: ['/crm'] },
  { id: 'growth', nome: 'Growth OS', emoji: '📈', prefixos: ['/growth'] },
  { id: 'legal-saas', nome: 'Legal SaaS', emoji: '⚖️', prefixos: ['/juridico', '/cliente-juridico'] },
  { id: 'vsm', nome: 'Stay Manager', emoji: '🏨', prefixos: ['/gestao'] },
  { id: 'vdocs', nome: 'Docs Intelligence', emoji: '📁', prefixos: ['/vdocs'] },
  { id: 'vpe', nome: 'Projects & Events', emoji: '🎪', prefixos: ['/vpe'] },
  { id: 'livraria', nome: 'Livraria', emoji: '📚', prefixos: ['/livros'] },
  { id: 'hospede', nome: 'Área do Hóspede', emoji: '🔑', prefixos: ['/hospede', '/minha'] },
  { id: 'ajuda', nome: 'Central de Ajuda', emoji: '💬', prefixos: ['/ajuda'] },
];
const NOME_PRODUTO = Object.fromEntries(PRODUTOS.map(p => [p.id, p.nome]));
NOME_PRODUTO.site = 'Site villelastay.com.br';
NOME_PRODUTO.outro = 'Outras páginas';
const EMOJI_PRODUTO = Object.fromEntries(PRODUTOS.map(p => [p.id, p.emoji]));
EMOJI_PRODUTO.site = '🏡'; EMOJI_PRODUTO.outro = '🌐';

/** Descobre de qual site do grupo é a página, pelo caminho (e pelo host quando ajuda). */
function produtoDe(caminho, host) {
  const c = String(caminho || '').toLowerCase();
  for (const p of PRODUTOS) for (const pre of p.prefixos) if (c === pre || c.startsWith(pre + '/')) return p.id;
  const h = String(host || '').toLowerCase();
  if (h.startsWith('kids.')) return 'kids';
  if (h.startsWith('closet.')) return 'closet';
  if (h.startsWith('vitrine.')) return 'vitrine';
  if (h.startsWith('altavista.') || h.startsWith('alta-vista.')) return 'alta-vista';
  if (h.startsWith('livros.') || h.startsWith('livraria.')) return 'livraria';
  if (h.startsWith('minha.')) return 'hospede';
  return 'outro';
}

// ---------------------------------------------------------------------
// Canal de origem: de onde a visita veio de verdade.
// UTM mandado pela campanha ganha do referrer; referrer vazio = direto.
// ---------------------------------------------------------------------
const DOMINIOS_PROPRIOS = ['villelastay.com.br', 'villela-stay-backend.onrender.com', 'villela-stay-site.onrender.com', 'localhost', '127.0.0.1'];
// `re` casa com o domínio de onde a pessoa veio; `nomes` casa com o valor de
// utm_source que a campanha escreveu (que vem sem domínio: "instagram", "fb").
const REGRAS_CANAL = [
  { canal: 'Google Ads', re: /googleadservices|doubleclick/, nomes: ['google-ads', 'googleads', 'adwords', 'google_ads', 'gads', 'cpc'] },
  { canal: 'Busca Google', re: /(^|\.)google\./, nomes: ['google'] },
  { canal: 'Busca com IA', re: /(chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google|copilot\.microsoft|claude\.ai|you\.com)/, nomes: ['chatgpt', 'openai', 'perplexity', 'gemini', 'copilot', 'claude'] },
  { canal: 'Outras buscas', re: /(^|\.)(bing\.|duckduckgo\.|yahoo\.|ecosia\.|brave\.|yandex\.|baidu\.)/, nomes: ['bing', 'duckduckgo', 'yahoo', 'ecosia'] },
  { canal: 'Instagram', re: /instagram\.com|ig\.me|l\.instagram/, nomes: ['instagram', 'ig', 'insta'] },
  { canal: 'Facebook', re: /facebook\.com|fb\.com|fb\.me|l\.facebook|lm\.facebook/, nomes: ['facebook', 'fb', 'meta'] },
  { canal: 'WhatsApp', re: /whatsapp\.com|wa\.me|l\.wl\.co/, nomes: ['whatsapp', 'wa', 'zap'] },
  { canal: 'YouTube', re: /youtube\.com|youtu\.be/, nomes: ['youtube', 'yt'] },
  { canal: 'LinkedIn', re: /linkedin\.com|lnkd\.in/, nomes: ['linkedin'] },
  { canal: 'TikTok', re: /tiktok\.com/, nomes: ['tiktok'] },
  { canal: 'Pinterest', re: /pinterest\./, nomes: ['pinterest'] },
  { canal: 'X (Twitter)', re: /twitter\.com|(^|\.)x\.com|t\.co$/, nomes: ['twitter', 'x'] },
  { canal: 'E-mail', re: /mail\.google|outlook\.|mail\.yahoo|webmail/, nomes: ['email', 'e-mail', 'newsletter', 'mail'] },
  { canal: 'Linktree', re: /linktr\.ee|link\.me/, nomes: ['linktree', 'linktr'] },
  { canal: 'Airbnb', re: /airbnb\./, nomes: ['airbnb'] },
  { canal: 'Booking', re: /booking\.com/, nomes: ['booking'] },
];

function hostDoRef(ref) {
  try { return new URL(String(ref)).hostname.toLowerCase(); } catch { return ''; }
}

/** Classifica a origem. Devolve o nome do canal já pronto para a tela. */
function canalDe(ref, utm) {
  const src = String((utm && utm.s) || '').trim().toLowerCase();
  if (src) {
    for (const r of REGRAS_CANAL) if (r.nomes.includes(src) || r.re.test(src)) return r.canal;
    return 'Campanha: ' + src.slice(0, 24);
  }
  const h = hostDoRef(ref);
  if (!h) return 'Direto';
  if (DOMINIOS_PROPRIOS.some(d => h === d || h.endsWith('.' + d))) return 'Interno (nosso site)';
  for (const r of REGRAS_CANAL) if (r.re.test(h)) return r.canal;
  return h.replace(/^www\./, '').slice(0, 40);
}

// ---------------------------------------------------------------------
// Leitura do user-agent: robô, dispositivo, navegador, sistema.
// ---------------------------------------------------------------------
const RE_BOT = /(bot|crawler|spider|crawl|slurp|scrape|preview|monitor|uptime|headless|phantom|curl|wget|python-requests|python-urllib|go-http|node-fetch|axios|okhttp|libwww|httpclient|facebookexternalhit|whatsapp|telegram|discord|slackbot|bingpreview|semrush|ahrefs|dotbot|mj12|petal|applebot|gptbot|claudebot|ccbot|perplexitybot|bytespider|amazonbot|dataforseo)/i;

function uaInfo(ua) {
  const u = String(ua || '');
  if (!u) return { bot: 1, dispositivo: 'desconhecido', navegador: 'desconhecido', so: 'desconhecido' };
  if (RE_BOT.test(u)) return { bot: 1, dispositivo: 'robô', navegador: 'robô', so: 'robô' };

  const tablet = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(u);
  const celular = !tablet && /Mobi|Android|iPhone|iPod|Windows Phone/i.test(u);
  const dispositivo = tablet ? 'tablet' : (celular ? 'celular' : 'computador');

  let navegador = 'outro';
  if (/Edg\//i.test(u)) navegador = 'Edge';
  else if (/OPR\/|Opera/i.test(u)) navegador = 'Opera';
  else if (/SamsungBrowser/i.test(u)) navegador = 'Samsung';
  else if (/Chrome\//i.test(u)) navegador = 'Chrome';
  else if (/Firefox\//i.test(u)) navegador = 'Firefox';
  else if (/Safari\//i.test(u)) navegador = 'Safari';

  let so = 'outro';
  if (/Windows/i.test(u)) so = 'Windows';
  else if (/Android/i.test(u)) so = 'Android';
  else if (/iPhone|iPad|iPod|iOS/i.test(u)) so = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(u)) so = 'macOS';
  else if (/Linux|X11/i.test(u)) so = 'Linux';

  return { bot: 0, dispositivo, navegador, so };
}

/** Idioma preferido do visitante (pt/en/es/...), do cabeçalho ou do caminho /en//es/. */
function idiomaDe(aceitaIdioma, caminho) {
  const c = String(caminho || '').toLowerCase();
  if (c === '/en' || c.startsWith('/en/')) return 'en';
  if (c === '/es' || c.startsWith('/es/')) return 'es';
  const bruto = String(aceitaIdioma || '').split(',')[0].trim().toLowerCase();
  const lang = bruto.split('-')[0].replace(/[^a-z]/g, '');
  return lang ? lang.slice(0, 5) : 'desconhecido';
}

// ---------------------------------------------------------------------
// Anonimização do IP. Nada disso vira linha de log: só o resultado.
// ---------------------------------------------------------------------
function limpaIp(ip) {
  const s = String(ip || '').trim();
  return s.startsWith('::ffff:') ? s.slice(7) : s;   // IPv4 embrulhado em IPv6
}

/** Prefixo de rede: /24 no IPv4, /48 no IPv6 — é o que consulta a localidade. */
function prefixoIp(ip) {
  const s = limpaIp(ip);
  if (!s) return '';
  if (s.includes(':')) {
    const partes = s.split(':');
    return partes.slice(0, 3).join(':') + '::/48';
  }
  const o = s.split('.');
  if (o.length !== 4) return '';
  return `${o[0]}.${o[1]}.${o[2]}.0/24`;
}

// Sal do dia: troca à meia-noite, então o identificador anônimo não
// atravessa dias. É o que impede que a contagem vire rastreamento.
let _salDia = { dia: '', valor: '' };
function salDoDia() {
  const dia = new Date().toISOString().slice(0, 10);
  if (_salDia.dia !== dia) _salDia = { dia, valor: crypto.randomBytes(16).toString('hex') };
  return _salDia.valor;
}

/** Identificador anônimo do visitante, válido só dentro do dia. */
function vidDe(ip, ua) {
  return crypto.createHash('sha256').update(salDoDia() + '|' + limpaIp(ip) + '|' + String(ua || '')).digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------------
// Localidade: cache em disco + resolução em processo filho.
// A primeira visita de uma rede nova sai sem cidade; da segunda em diante
// vem do cache. Perde-se pouquíssimo e não se paga memória permanente.
// ---------------------------------------------------------------------
function criarGeo(DATA_DIR) {
  const arquivo = path.join(DATA_DIR, ARQ_GEOCACHE);
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { cache = {}; }
  const pendentes = new Set();
  let agendado = null, rodando = false, sujo = false;

  const salvar = () => {
    if (!sujo) return;
    sujo = false;
    try { fs.writeFileSync(arquivo, JSON.stringify(cache)); } catch (e) { console.error('[visitas] cache de localidade:', e.message); }
  };

  function resolver() {
    if (rodando || !pendentes.size) return;
    if (process.env.VISITAS_GEO === 'off') { pendentes.clear(); return; }
    rodando = true;
    const lote = Array.from(pendentes).slice(0, 500);
    lote.forEach(p => pendentes.delete(p));
    let filho;
    try { filho = fork(path.join(__dirname, 'visitas-geo-worker.js'), [], { stdio: 'ignore' }); }
    catch (e) { rodando = false; console.error('[visitas] não consegui abrir o resolvedor de localidade:', e.message); return; }

    const encerra = () => { rodando = false; salvar(); if (pendentes.size) setTimeout(resolver, 1000).unref(); };
    const guarda = setTimeout(() => { try { filho.kill(); } catch {} }, 20000);
    guarda.unref();

    filho.on('message', (msg) => {
      const mapa = (msg && msg.mapa) || {};
      for (const [pre, loc] of Object.entries(mapa)) { cache[pre] = loc; sujo = true; }
      clearTimeout(guarda);
    });
    filho.on('exit', encerra);
    filho.on('error', (e) => { console.error('[visitas] resolvedor de localidade:', e.message); clearTimeout(guarda); encerra(); });
    try { filho.send({ prefixos: lote }); } catch (e) { clearTimeout(guarda); try { filho.kill(); } catch {} }
  }

  return {
    /** Localidade já conhecida do prefixo; se for rede nova, enfileira para resolver. */
    consultar(ip) {
      const pre = prefixoIp(ip);
      if (!pre) return null;
      if (cache[pre]) return cache[pre];
      if (!pendentes.has(pre)) {
        pendentes.add(pre);
        // Espera alguns segundos antes de abrir o processo filho: numa rajada
        // de visitas, um filho só resolve todas as redes novas de uma vez.
        if (!agendado) {
          agendado = setTimeout(() => { agendado = null; resolver(); }, 3000);
          agendado.unref();
        }
      }
      return null;
    },
    salvar,
    tamanho: () => Object.keys(cache).length,
  };
}

// ---------------------------------------------------------------------
// Gravação da visita
// ---------------------------------------------------------------------
function utmDe(query) {
  const q = query || {};
  const p = (v) => String(v == null ? '' : v).slice(0, 60);
  const utm = {};
  if (q.utm_source) utm.s = p(q.utm_source);
  if (q.utm_medium) utm.m = p(q.utm_medium);
  if (q.utm_campaign) utm.c = p(q.utm_campaign);
  if (q.utm_content) utm.co = p(q.utm_content);
  if (q.utm_term) utm.t = p(q.utm_term);
  if (!utm.s && q.gclid) utm.s = 'google-ads';
  if (!utm.s && q.fbclid) utm.s = 'facebook';
  return utm;
}

function criarRegistrador(DATA_DIR, geo) {
  const arquivo = path.join(DATA_DIR, ARQ_HITS);
  return function registrar({ produto, caminho, ref, utm, ua, ip, aceitaIdioma }) {
    try {
      const info = uaInfo(ua);
      const loc = info.bot ? null : geo.consultar(ip);      // robô não gasta consulta de localidade
      const linha = {
        v: 2,
        produto,
        pagina: String(caminho || '/').slice(0, 200),
        ref: String(ref || '').slice(0, 300),
        canal: canalDe(ref, utm),
        utm: (utm && Object.keys(utm).length) ? utm : undefined,
        disp: info.dispositivo, nav: info.navegador, so: info.so,
        idioma: idiomaDe(aceitaIdioma, caminho),
        pais: loc ? loc.pais : '', uf: loc ? loc.uf : '', cidade: loc ? loc.cidade : '',
        vid: info.bot ? '' : vidDe(ip, ua),
        bot: info.bot,
        _recebido: new Date().toISOString(),
      };
      fs.appendFileSync(arquivo, JSON.stringify(linha) + '\n');
    } catch (e) { console.error('[visitas] falha ao registrar:', e.message); }
  };
}

// ---------------------------------------------------------------------
// Middleware: conta toda página pública que o backend renderiza.
// Regra: só GET que respondeu 200 em text/html, fora do Portal Staff e
// fora das APIs. Assim cada produto novo já nasce medido, sem tocar no
// código dele — e nada de asset, JSON ou redirect entra na conta.
// ---------------------------------------------------------------------
const RE_ARQUIVO = /\.(js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|map|json|xml|txt|pdf|mp4|webm|zip)$/i;
const CAMINHOS_FORA = ['/staff', '/api/', '/health', '/sw.js', '/manifest', '/robots', '/sitemap', '/favicon'];

function criarMiddleware(registrar) {
  return function visitasMiddleware(req, res, next) {
    if (req.method !== 'GET') return next();
    const caminho = req.path || '/';
    if (RE_ARQUIVO.test(caminho)) return next();
    if (CAMINHOS_FORA.some(p => caminho === p || caminho.startsWith(p))) return next();

    res.on('finish', () => {
      try {
        if (res.statusCode !== 200) return;
        const tipo = String(res.getHeader('content-type') || '');
        if (!tipo.includes('text/html')) return;
        registrar({
          produto: produtoDe(caminho, req.hostname),
          caminho,
          ref: req.headers.referer || req.headers.referrer || '',
          utm: utmDe(req.query),
          ua: req.headers['user-agent'] || '',
          ip: req.ip,
          aceitaIdioma: req.headers['accept-language'] || '',
        });
      } catch { /* analytics jamais atrapalha a resposta */ }
    });
    next();
  };
}

// =====================================================================
// LEITURA E AGREGAÇÃO
// =====================================================================

function lerLinhas(DATA_DIR) {
  const f = path.join(DATA_DIR, ARQ_HITS);
  if (!fs.existsSync(f)) return [];
  const out = [];
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* linha corrompida: ignora */ }
  }
  return out;
}

/** Linha antiga (v1) não tinha produto nem canal — normaliza para caber nas mesmas contas. */
function normalizar(h) {
  if (h.v === 2) return h;
  const ref = h.origemRef || h.ref || '';
  const info = uaInfo(h.ua);
  return {
    v: 1, produto: 'site', pagina: h.pagina || '/', ref,
    canal: canalDe(ref, null), disp: info.dispositivo, nav: info.navegador, so: info.so,
    idioma: 'desconhecido', pais: '', uf: '', cidade: '', vid: '', bot: info.bot,
    _recebido: h._recebido || '',
  };
}

const diaDe = (h) => String(h._recebido || '').slice(0, 10);
const somar = (obj, chave, n = 1) => { if (chave) obj[chave] = (obj[chave] || 0) + n; };
const ordenar = (obj, limite) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limite || 999).map(([k, n]) => ({ k, n }));

function listaDias(deISO, ateISO) {
  const out = [];
  const d = new Date(deISO + 'T00:00:00Z'), fim = new Date(ateISO + 'T00:00:00Z');
  while (d <= fim) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function recuar(iso, dias) {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Sessões: visitas do mesmo visitante anônimo com intervalo < 30 min.
 * Sessão de uma página só = rejeição (a pessoa chegou e não seguiu adiante).
 */
function calcularSessoes(hits) {
  const porVid = {};
  for (const h of hits) {
    if (!h.vid) continue;
    (porVid[h.vid + '|' + diaDe(h)] = porVid[h.vid + '|' + diaDe(h)] || []).push(h);
  }
  let sessoes = 0, rejeicoes = 0, paginas = 0;
  const entradas = {}, saidas = {};
  for (const lista of Object.values(porVid)) {
    lista.sort((a, b) => String(a._recebido).localeCompare(String(b._recebido)));
    let atual = [];
    const fechar = () => {
      if (!atual.length) return;
      sessoes++; paginas += atual.length;
      if (atual.length === 1) rejeicoes++;
      somar(entradas, atual[0].pagina);
      somar(saidas, atual[atual.length - 1].pagina);
      atual = [];
    };
    let anterior = null;
    for (const h of lista) {
      const t = Date.parse(h._recebido || '') || 0;
      if (anterior && (t - anterior) > JANELA_SESSAO_MIN * 60000) fechar();
      atual.push(h); anterior = t;
    }
    fechar();
  }
  return { sessoes, rejeicoes, paginas, entradas, saidas };
}

/** Todas as contas de um conjunto de visitas, numa passada só. */
function agregar(hits) {
  const porDia = {}, porProduto = {}, porCanal = {}, porCampanha = {};
  const porPais = {}, porUf = {}, porCidade = {};
  const porDisp = {}, porNav = {}, porSo = {}, porIdioma = {};
  const porPagina = {}, porProdutoDia = {};
  const unicosDia = {}, unicosGeral = new Set();
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));

  for (const h of hits) {
    const dia = diaDe(h);
    somar(porDia, dia);
    somar(porProduto, h.produto || 'outro');
    somar(porCanal, h.canal || 'Direto');
    if (h.utm && h.utm.c) somar(porCampanha, (h.utm.s ? h.utm.s + ' · ' : '') + h.utm.c);
    if (h.pais) somar(porPais, h.pais);
    if (h.pais === 'BR' && h.uf) somar(porUf, h.uf);
    if (h.cidade) somar(porCidade, h.cidade + (h.uf ? '/' + h.uf : ''));
    somar(porDisp, h.disp || 'desconhecido');
    somar(porNav, h.nav || 'desconhecido');
    somar(porSo, h.so || 'desconhecido');
    somar(porIdioma, h.idioma || 'desconhecido');
    somar(porPagina, h.pagina);
    (porProdutoDia[h.produto || 'outro'] = porProdutoDia[h.produto || 'outro'] || {});
    somar(porProdutoDia[h.produto || 'outro'], dia);
    if (h.vid) {
      (unicosDia[dia] = unicosDia[dia] || new Set()).add(h.vid);
      unicosGeral.add(dia + '|' + h.vid);
    }
    const d = new Date(h._recebido || 0);
    if (!isNaN(d)) heat[d.getUTCDay()][d.getUTCHours()]++;
  }

  const s = calcularSessoes(hits);
  return {
    visitas: hits.length,
    unicos: unicosGeral.size,
    sessoes: s.sessoes,
    paginasPorSessao: s.sessoes ? +(s.paginas / s.sessoes).toFixed(2) : 0,
    rejeicaoPct: s.sessoes ? Math.round((s.rejeicoes / s.sessoes) * 100) : 0,
    porDia, unicosPorDia: Object.fromEntries(Object.entries(unicosDia).map(([d, set]) => [d, set.size])),
    porProduto, porProdutoDia, porCanal, porCampanha,
    porPais, porUf, porCidade, porDisp, porNav, porSo, porIdioma,
    porPagina, entradas: s.entradas, saidas: s.saidas, heat,
  };
}

/** Variação percentual contra o período anterior. null quando não havia base. */
function delta(agora, antes) {
  if (!antes) return agora ? null : 0;
  return Math.round(((agora - antes) / antes) * 100);
}

// ---------------------------------------------------------------------
// Histórico agregado (dias já rotacionados) — só volume por dia/produto.
// ---------------------------------------------------------------------
function lerHistorico(DATA_DIR) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, ARQ_HIST), 'utf8')); } catch { return {}; }
}

/**
 * Rotação: linhas mais velhas que RETENCAO_DIAS viram contagem por dia e
 * produto no histórico e saem do arquivo cru. Sem isso o hits.jsonl cresce
 * para sempre e a página fica lenta justamente quando o negócio cresce.
 */
function rotacionar(DATA_DIR) {
  const f = path.join(DATA_DIR, ARQ_HITS);
  if (!fs.existsSync(f)) return { rotacionadas: 0, mantidas: 0 };
  const corte = recuar(new Date().toISOString().slice(0, 10), RETENCAO_DIAS);
  const todas = lerLinhas(DATA_DIR).map(normalizar);
  const velhas = todas.filter(h => diaDe(h) && diaDe(h) < corte);
  if (!velhas.length) return { rotacionadas: 0, mantidas: todas.length };

  const hist = lerHistorico(DATA_DIR);
  const unicos = {};
  for (const h of velhas) {
    const dia = diaDe(h), prod = h.produto || 'outro';
    hist[dia] = hist[dia] || {};
    hist[dia][prod] = hist[dia][prod] || { v: 0, u: 0, bot: 0 };
    hist[dia][prod].v++;
    if (h.bot) hist[dia][prod].bot++;
    if (h.vid) (unicos[dia + '|' + prod] = unicos[dia + '|' + prod] || new Set()).add(h.vid);
  }
  for (const [chave, set] of Object.entries(unicos)) {
    const [dia, prod] = chave.split('|');
    if (hist[dia] && hist[dia][prod]) hist[dia][prod].u = set.size;
  }
  fs.writeFileSync(path.join(DATA_DIR, ARQ_HIST), JSON.stringify(hist));
  const mantidas = todas.filter(h => !(diaDe(h) && diaDe(h) < corte));
  fs.writeFileSync(f, mantidas.map(h => JSON.stringify(h)).join('\n') + (mantidas.length ? '\n' : ''));
  return { rotacionadas: velhas.length, mantidas: mantidas.length };
}

// =====================================================================
// MONTAGEM: middleware + rotas do Portal Staff
// =====================================================================
module.exports.PRODUTOS = PRODUTOS;
module.exports.NOME_PRODUTO = NOME_PRODUTO;
module.exports.produtoDe = produtoDe;
module.exports.canalDe = canalDe;
module.exports.uaInfo = uaInfo;
module.exports.idiomaDe = idiomaDe;
module.exports.prefixoIp = prefixoIp;
module.exports.utmDe = utmDe;
module.exports.agregar = agregar;
module.exports.normalizar = normalizar;
module.exports.rotacionar = rotacionar;

/**
 * Cria o coletor. Chamado ANTES das rotas dos produtos, para o middleware
 * enxergar todas as páginas. Devolve { middleware, registrar }.
 */
module.exports.criarColetor = function criarColetor(DATA_DIR) {
  const geo = criarGeo(DATA_DIR);
  const registrar = criarRegistrador(DATA_DIR, geo);
  return { middleware: criarMiddleware(registrar), registrar, geo };
};

/**
 * Rotas de consulta do Portal Staff. deps: { DATA_DIR, requireAuth,
 * podeArea, requirePublishOrAdmin, lerContatos }.
 */
module.exports.montarRotas = function montarRotas(app, deps) {
  const { DATA_DIR, requireAuth, podeArea, requirePublishOrAdmin, lerContatos } = deps;
  const podeVer = (req, res) => {
    if (['marketing', 'ti', 'ceo'].some(a => podeArea(req.user, a))) return true;
    res.status(403).json({ erro: 'Sem acesso.' });
    return false;
  };

  /** Monta o relatório completo do período pedido. */
  function relatorio({ dias, produto, incluirBots }) {
    const hoje = new Date().toISOString().slice(0, 10);
    const de = recuar(hoje, dias - 1);
    const deAnterior = recuar(de, dias);
    const ateAnterior = recuar(de, 1);

    let todas = lerLinhas(DATA_DIR).map(normalizar);
    const bots = todas.filter(h => h.bot && diaDe(h) >= de).length;
    if (!incluirBots) todas = todas.filter(h => !h.bot);
    if (produto) todas = todas.filter(h => (h.produto || 'outro') === produto);

    const noPeriodo = todas.filter(h => { const d = diaDe(h); return d >= de && d <= hoje; });
    const anterior = todas.filter(h => { const d = diaDe(h); return d >= deAnterior && d <= ateAnterior; });

    const a = agregar(noPeriodo);
    const b = agregar(anterior);

    // Série diária completa (dias sem visita aparecem como zero) juntando o histórico já rotacionado.
    const hist = lerHistorico(DATA_DIR);
    const serie = listaDias(de, hoje).map(d => {
      let v = a.porDia[d] || 0, u = a.unicosPorDia[d] || 0;
      if (!v && hist[d]) {
        for (const [prod, x] of Object.entries(hist[d])) {
          if (produto && prod !== produto) continue;
          v += (x.v || 0) - (incluirBots ? 0 : (x.bot || 0)); u += x.u || 0;
        }
      }
      return { dia: d, visitas: Math.max(0, v), unicos: u };
    });

    // Cada site do grupo com sua própria série e sua variação.
    const idsProdutos = Array.from(new Set([...Object.keys(a.porProduto), ...Object.keys(b.porProduto)]));
    const sites = idsProdutos.map(id => ({
      id,
      nome: NOME_PRODUTO[id] || id,
      emoji: EMOJI_PRODUTO[id] || '🌐',
      visitas: a.porProduto[id] || 0,
      anterior: b.porProduto[id] || 0,
      delta: delta(a.porProduto[id] || 0, b.porProduto[id] || 0),
      serie: listaDias(de, hoje).map(d => (a.porProdutoDia[id] && a.porProdutoDia[id][d]) || 0),
    })).sort((x, y) => y.visitas - x.visitas);

    return {
      periodo: { de, ate: hoje, dias, produto: produto || '', incluirBots: !!incluirBots },
      resumo: {
        visitas: a.visitas, unicos: a.unicos, sessoes: a.sessoes,
        paginasPorSessao: a.paginasPorSessao, rejeicaoPct: a.rejeicaoPct, bots,
        delta: {
          visitas: delta(a.visitas, b.visitas), unicos: delta(a.unicos, b.unicos),
          sessoes: delta(a.sessoes, b.sessoes), rejeicaoPct: delta(a.rejeicaoPct, b.rejeicaoPct),
        },
      },
      serie, sites,
      canais: ordenar(a.porCanal, 15),
      campanhas: ordenar(a.porCampanha, 12),
      paises: ordenar(a.porPais, 12),
      estados: ordenar(a.porUf, 15),
      cidades: ordenar(a.porCidade, 15),
      dispositivos: ordenar(a.porDisp), navegadores: ordenar(a.porNav, 8),
      sistemas: ordenar(a.porSo, 8), idiomas: ordenar(a.porIdioma, 8),
      paginas: ordenar(a.porPagina, 20), entradas: ordenar(a.entradas, 10), saidas: ordenar(a.saidas, 10),
      heat: a.heat,
      catalogo: PRODUTOS.map(p => ({ id: p.id, nome: p.nome })).concat([{ id: 'site', nome: NOME_PRODUTO.site }]),
      // Cobertura da localidade dita em voz alta: a base offline acerta o país
      // quase sempre, mas não tem cidade para toda faixa de IP. Sem este número
      // o ranking de cidades parece completo quando não é.
      localidade: {
        comPais: Object.values(a.porPais).reduce((s, n) => s + n, 0),
        comCidade: Object.values(a.porCidade).reduce((s, n) => s + n, 0),
        total: a.visitas,
      },
      semLocalidade: Object.keys(a.porPais).length === 0 && a.visitas > 0,
    };
  }

  // ---- Relatório principal
  app.get('/staff/api/visitas', requireAuth, (req, res) => {
    if (!podeVer(req, res)) return;
    const dias = Math.min(400, Math.max(1, parseInt(req.query.dias, 10) || 30));
    try {
      res.json(relatorio({ dias, produto: String(req.query.produto || ''), incluirBots: req.query.bots === '1' }));
    } catch (e) { console.error('[visitas] relatório:', e); res.status(500).json({ erro: e.message }); }
  });

  // ---- Funil: visita → lead → reserva, por canal de origem
  app.get('/staff/api/visitas-funil', requireAuth, (req, res) => {
    if (!podeVer(req, res)) return;
    const dias = Math.min(400, Math.max(1, parseInt(req.query.dias, 10) || 30));
    const de = recuar(new Date().toISOString().slice(0, 10), dias - 1);
    try {
      const hits = lerLinhas(DATA_DIR).map(normalizar).filter(h => !h.bot && diaDe(h) >= de);
      const visitas = {};
      for (const h of hits) somar(visitas, h.canal || 'Direto');

      // Leads: o canal só existe nos captados depois desta entrega — os
      // antigos entram como "não registrado" em vez de sumirem da conta.
      const leads = {};
      const fLeads = path.join(DATA_DIR, 'leads.jsonl');
      if (fs.existsSync(fLeads)) {
        for (const l of fs.readFileSync(fLeads, 'utf8').split('\n')) {
          if (!l.trim()) continue;
          try {
            const x = JSON.parse(l);
            if (String(x._recebido || '').slice(0, 10) < de) continue;
            somar(leads, x.canal || 'não registrado');
          } catch {}
        }
      }

      // Reservas: contato do CRM que chegou ao estágio de reserva ou além.
      const reservas = {};
      const AVANCADOS = ['reserva', 'hospedado', 'posvenda'];
      try {
        for (const c of (lerContatos ? lerContatos() : [])) {
          if (String(c.criadoEm || '').slice(0, 10) < de) continue;
          if (!AVANCADOS.includes(c.estagio)) continue;
          somar(reservas, c.canal || 'não registrado');
        }
      } catch {}

      const canais = Array.from(new Set([...Object.keys(visitas), ...Object.keys(leads), ...Object.keys(reservas)]));
      const linhas = canais.map(c => {
        const v = visitas[c] || 0, l = leads[c] || 0, r = reservas[c] || 0;
        return { canal: c, visitas: v, leads: l, reservas: r, conversaoPct: v ? +((l / v) * 100).toFixed(1) : null };
      }).sort((a, b) => (b.leads - a.leads) || (b.visitas - a.visitas));

      res.json({ de, linhas, aviso: 'Leads e reservas anteriores a esta entrega aparecem como "não registrado" — o canal passou a ser gravado agora.' });
    } catch (e) { res.status(500).json({ erro: e.message }); }
  });

  // ---- Export CSV do período
  app.get('/staff/api/visitas.csv', requireAuth, (req, res) => {
    if (!podeVer(req, res)) return;
    const dias = Math.min(400, Math.max(1, parseInt(req.query.dias, 10) || 30));
    const de = recuar(new Date().toISOString().slice(0, 10), dias - 1);
    const hits = lerLinhas(DATA_DIR).map(normalizar)
      .filter(h => diaDe(h) >= de && (req.query.bots === '1' || !h.bot));
    const cab = ['data', 'hora', 'site', 'pagina', 'canal', 'campanha', 'pais', 'uf', 'cidade', 'dispositivo', 'navegador', 'sistema', 'idioma', 'robo'];
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const linhas = hits.map(h => [
      diaDe(h), String(h._recebido || '').slice(11, 19), NOME_PRODUTO[h.produto] || h.produto || '',
      h.pagina, h.canal, (h.utm && h.utm.c) || '', h.pais, h.uf, h.cidade,
      h.disp, h.nav, h.so, h.idioma, h.bot ? 'sim' : 'não',
    ].map(esc).join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="visitas-${de}-a-hoje.csv"`);
    res.send('﻿' + cab.join(';') + '\n' + linhas.join('\n'));   // BOM: Excel abre com acento certo
  });

  // ---- Resumo em markdown (relatório semanal automático; aceita PUBLISH_KEY)
  app.get('/staff/api/visitas-resumo', requirePublishOrAdmin, (req, res) => {
    const dias = Math.min(400, Math.max(1, parseInt(req.query.dias, 10) || 7));
    try {
      const r = relatorio({ dias, produto: '', incluirBots: false });
      const pct = (d) => d == null ? '—' : (d >= 0 ? '+' : '') + d + '%';
      const linha = (x) => `| ${x.emoji} ${x.nome} | ${x.visitas} | ${x.anterior} | ${pct(x.delta)} |`;
      const top = (lista, rot) => lista.length ? `\n**${rot}:** ` + lista.slice(0, 5).map(i => `${i.k} (${i.n})`).join(' · ') : '';
      const md = `# Visitas dos sites — últimos ${dias} dias
_${r.periodo.de} a ${r.periodo.ate} · robôs fora da conta_

| Indicador | Período | Variação |
|---|---|---|
| Visitas | ${r.resumo.visitas} | ${pct(r.resumo.delta.visitas)} |
| Visitantes únicos | ${r.resumo.unicos} | ${pct(r.resumo.delta.unicos)} |
| Sessões | ${r.resumo.sessoes} | ${pct(r.resumo.delta.sessoes)} |
| Páginas por sessão | ${r.resumo.paginasPorSessao} | — |
| Taxa de rejeição | ${r.resumo.rejeicaoPct}% | ${pct(r.resumo.delta.rejeicaoPct)} |
| Robôs barrados | ${r.resumo.bots} | — |

## Por site do grupo

| Site | Visitas | Período anterior | Variação |
|---|---|---|---|
${r.sites.map(linha).join('\n') || '| — | 0 | 0 | — |'}
${top(r.canais, 'Principais origens')}
${top(r.cidades, 'Cidades')}
${top(r.paginas, 'Páginas mais vistas')}

${r.sites.filter(s => s.delta != null && s.delta <= -30).map(s => `> ⚠️ **${s.nome}** caiu ${s.delta}% contra o período anterior.`).join('\n')}
`;
      if (req.query.formato === 'json') return res.json({ markdown: md, relatorio: r });
      res.type('text/markdown; charset=utf-8').send(md);
    } catch (e) { res.status(500).json({ erro: e.message }); }
  });

  // ---- Manutenção: rotação do arquivo cru (aceita PUBLISH_KEY)
  app.post('/staff/api/visitas-rotacionar', requirePublishOrAdmin, (req, res) => {
    try { res.json(rotacionar(DATA_DIR)); } catch (e) { res.status(500).json({ erro: e.message }); }
  });

  // Rotação diária enquanto o processo estiver de pé (e uma na subida, atrasada
  // para não competir com o boot). Barata: só mexe no arquivo quando há o que tirar.
  setTimeout(() => { try { rotacionar(DATA_DIR); } catch (e) { console.error('[visitas] rotação:', e.message); } }, 60000).unref();
  setInterval(() => { try { rotacionar(DATA_DIR); } catch (e) { console.error('[visitas] rotação:', e.message); } }, 24 * 3600 * 1000).unref();
};
