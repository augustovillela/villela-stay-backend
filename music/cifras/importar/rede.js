// =====================================================================
// Musique Cifras — REDE SEGURA para importar de URL.
//
// Importar "qualquer página pública" é a porta de entrada clássica de
// SSRF: alguém cola http://169.254.169.254/ (metadados da nuvem) ou
// http://localhost:10000/staff e o nosso servidor vira o atacante. As
// defesas, todas aqui e todas testadas:
//
//   1. só http/https, só portas 80 e 443, sem usuário:senha na URL;
//   2. o IP é checado DEPOIS de resolver o DNS, e o socket conecta NESSE
//      IP (lookup próprio) — sem janela para DNS rebinding;
//   3. redes internas, loopback, link-local, CGNAT, multicast e faixas
//      de documentação são recusadas, em IPv4 e IPv6 (inclusive IPv4
//      mapeado em IPv6 e NAT64);
//   4. redirecionamento é seguido À MÃO, no máximo 3, revalidando cada
//      destino;
//   5. tempo máximo, tamanho máximo lido (o corpo é cortado, não
//      acumulado inteiro) e tipos de conteúdo permitidos;
//   6. robots.txt respeitado, limite de taxa por domínio e disjuntor: um
//      site fora do ar não trava a busca inteira.
// =====================================================================
'use strict';
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const UA = 'MusiqueBot/1.0 (+https://musique.villelastay.com.br/music/robo)';
const TEMPO_MS = Number(process.env.MUSIC_IMPORT_TIMEOUT_MS) || 8000;
const MAX_BYTES = 2 * 1024 * 1024;
const TIPOS_OK = /^(text\/html|text\/plain|application\/xhtml\+xml|application\/json|text\/xml|application\/xml)/i;

// ---------------------------------------------------------------------
// IPs proibidos
// ---------------------------------------------------------------------
function v4EmNumero(ip) { return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0; }
const FAIXAS_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => ({ base: v4EmNumero(base), mascara: bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0 }));

function v4Bloqueado(ip) {
  const n = v4EmNumero(ip);
  return FAIXAS_V4.some((f) => ((n & f.mascara) >>> 0) === ((f.base & f.mascara) >>> 0));
}

function expandirV6(ip) {
  let x = ip.toLowerCase().split('%')[0];
  if (x.includes('.')) {                        // ::ffff:1.2.3.4
    const i = x.lastIndexOf(':');
    const v4 = x.slice(i + 1).split('.').map(Number);
    x = x.slice(0, i + 1) + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const [a, b] = x.split('::');
  const esq = a ? a.split(':') : [];
  const dir = b !== undefined ? (b ? b.split(':') : []) : [];
  const meio = b !== undefined ? new Array(8 - esq.length - dir.length).fill('0') : [];
  return esq.concat(meio, dir).map((h) => parseInt(h || '0', 16));
}

function v6Bloqueado(ip) {
  const g = expandirV6(ip);
  if (g.length !== 8 || g.some((n) => !Number.isFinite(n))) return true;
  if (g.every((n) => n === 0)) return true;                              // ::
  if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return true;    // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true;                           // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true;                           // fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return true;                           // ff00::/8
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                   // documentação
  const v4De = (hi, lo) => [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) return v4Bloqueado(v4De(g[6], g[7]));  // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return v4Bloqueado(v4De(g[6], g[7]));                         // NAT64
  if (g.slice(0, 6).every((n) => n === 0)) return v4Bloqueado(v4De(g[6], g[7]));                      // ::a.b.c.d
  return false;
}

function ipBloqueado(ip) {
  const tipo = net.isIP(ip);
  if (tipo === 4) return v4Bloqueado(ip);
  if (tipo === 6) return v6Bloqueado(ip);
  return true;
}

/** Valida a URL antes de qualquer rede. Lança com motivo legível. */
function validarUrl(bruta) {
  let u;
  try { u = new URL(String(bruta || '').trim()); } catch (_) { throw codigo('URL inválida.', 'URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw codigo('Só endereços http e https.', 'URL');
  if (u.username || u.password) throw codigo('URL com usuário e senha não é aceita.', 'URL');
  const porta = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (![80, 443].includes(porta)) throw codigo('Só as portas padrão (80 e 443).', 'URL');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(local|localhost|internal|intranet|lan|home|corp)$/.test(host) || !host.includes('.') && !net.isIP(host)) {
    throw codigo('Endereço interno não é aceito.', 'SSRF');
  }
  if (net.isIP(host) && ipBloqueado(host)) throw codigo('Endereço de rede interna não é aceito.', 'SSRF');
  return u;
}

function codigo(msg, cod) { const e = new Error(msg); e.codigo = cod; e.permanente = true; return e; }

/** lookup que só devolve IP público — e o socket conecta nele. */
function lookupSeguro(hostname, opcoes, cb) {
  if (typeof opcoes === 'function') { cb = opcoes; opcoes = {}; }
  dns.lookup(hostname, { all: true, verbatim: true }, (err, lista) => {
    if (err) return cb(err);
    if (!lista.length || lista.some((a) => ipBloqueado(a.address))) {
      return cb(codigo('O nome resolve para rede interna. Importação recusada.', 'SSRF'));
    }
    if (opcoes && opcoes.all) return cb(null, lista);
    return cb(null, lista[0].address, lista[0].family);
  });
}

// ---------------------------------------------------------------------
// Taxa por domínio e disjuntor
// ---------------------------------------------------------------------
const INTERVALO_MS = Number(process.env.MUSIC_IMPORT_INTERVALO_MS) || 1200;
const fila = new Map();            // host → Promise da última requisição
const disjuntor = new Map();       // host → { falhas, abertoAte }

function disjuntorAberto(host) {
  const d = disjuntor.get(host);
  return !!(d && d.abertoAte > Date.now());
}
function registrarResultado(host, ok) {
  const d = disjuntor.get(host) || { falhas: 0, abertoAte: 0 };
  if (ok) { d.falhas = 0; d.abertoAte = 0; }
  else { d.falhas++; if (d.falhas >= 3) d.abertoAte = Date.now() + 10 * 60000; }
  disjuntor.set(host, d);
}
function naVez(host, fn) {
  const anterior = fila.get(host) || Promise.resolve();
  const agora = anterior.catch(() => {}).then(() => new Promise((r) => setTimeout(r, INTERVALO_MS))).then(fn);
  fila.set(host, agora.catch(() => {}));
  return agora;
}

// ---------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------
function getUmaVez(u, { tempoMs = TEMPO_MS, maxBytes = MAX_BYTES, aceitar = TIPOS_OK } = {}) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || undefined,
      path: u.pathname + u.search, method: 'GET', lookup: lookupSeguro,
      headers: { 'User-Agent': UA, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      timeout: tempoMs,
    }, (res) => {
      const st = res.statusCode;
      if (st >= 300 && st < 400 && res.headers.location) { res.resume(); return resolve({ redirecionar: res.headers.location, status: st }); }
      const tipo = String(res.headers['content-type'] || '');
      if (st >= 400) { res.resume(); const e = new Error('A página respondeu ' + st + '.'); e.status = st; e.permanente = st >= 400 && st < 500; return reject(e); }
      if (tipo && !aceitar.test(tipo)) { res.resume(); return reject(codigo('Tipo de conteúdo não aceito: ' + tipo.split(';')[0], 'TIPO')); }
      const partes = []; let total = 0; let cortado = false;
      res.on('data', (c) => {
        if (cortado) return;
        total += c.length;
        if (total > maxBytes) { cortado = true; partes.push(c.slice(0, c.length - (total - maxBytes))); res.destroy(); return; }
        partes.push(c);
      });
      res.on('end', () => resolve({ status: st, tipo, corpo: Buffer.concat(partes), cortado }));
      res.on('close', () => { if (cortado) resolve({ status: st, tipo, corpo: Buffer.concat(partes), cortado }); });
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(Object.assign(new Error('A página demorou demais para responder.'), { codigo: 'TEMPO' })); });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Busca uma URL com todas as travas. Devolve { url, status, tipo, texto }.
 * `transporte` pode ser injetado (testes): recebe a URL JÁ validada.
 */
async function obter(url, opcoes = {}) {
  let u = validarUrl(url);
  const host = u.hostname.toLowerCase();
  if (disjuntorAberto(host)) throw codigo('Esta fonte falhou várias vezes e está em pausa por alguns minutos.', 'DISJUNTOR');
  if (!opcoes.ignorarRobots) {
    const permitido = await robotsPermite(u, opcoes);
    if (!permitido) throw codigo('O site proíbe a leitura automática desta página (robots.txt).', 'ROBOTS');
  }
  const executar = async () => {
    for (let salto = 0; salto <= 3; salto++) {
      const r = opcoes.transporte ? await opcoes.transporte(u) : await getUmaVez(u, opcoes);
      if (r.redirecionar) {
        if (salto === 3) throw codigo('Redirecionamentos demais.', 'REDIRECT');
        u = validarUrl(new URL(r.redirecionar, u).toString());
        continue;
      }
      const texto = decodificar(r.corpo, r.tipo);
      return { url: u.toString(), status: r.status, tipo: r.tipo, texto, cortado: !!r.cortado };
    }
    throw codigo('Redirecionamentos demais.', 'REDIRECT');
  };
  try {
    const r = opcoes.semFila ? await executar() : await naVez(host, executar);
    registrarResultado(host, true);
    return r;
  } catch (e) {
    if (!e.permanente || e.status >= 500) registrarResultado(host, false);
    throw e;
  }
}

function decodificar(buf, tipo) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''));
  const cs = (String(tipo || '').match(/charset=([\w-]+)/i) || [])[1];
  let t = b.toString('utf8');
  const meta = (t.slice(0, 2000).match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  const alvo = String(cs || meta || 'utf-8').toLowerCase();
  if (alvo === 'iso-8859-1' || alvo === 'latin1' || alvo === 'windows-1252') t = b.toString('latin1');
  return t;
}

// ---------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------
const robotsCache = new Map();
async function robotsPermite(u, opcoes = {}) {
  const origem = u.protocol + '//' + u.host;
  let c = robotsCache.get(origem);
  if (!c || c.em < Date.now() - 6 * 36e5) {
    let texto = '';
    try {
      const r = await obter(origem + '/robots.txt', { ...opcoes, ignorarRobots: true, semFila: true, maxBytes: 256 * 1024 });
      texto = r.status === 200 ? r.texto : '';
    } catch (_) { texto = ''; }               // sem robots.txt = sem restrição
    c = { regras: lerRobots(texto), em: Date.now() };
    robotsCache.set(origem, c);
  }
  return permitidoPor(c.regras, u.pathname + u.search);
}

function lerRobots(texto) {
  const grupos = [];
  let atual = null, ultimoFoiAgente = false;
  String(texto || '').split(/\r?\n/).forEach((l) => {
    const linha = l.replace(/#.*$/, '').trim();
    const m = linha.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) return;
    const campo = m[1].toLowerCase(), valor = m[2].trim();
    if (campo === 'user-agent') {
      if (!ultimoFoiAgente) { atual = { agentes: [], regras: [] }; grupos.push(atual); }
      atual.agentes.push(valor.toLowerCase());
      ultimoFoiAgente = true;
      return;
    }
    ultimoFoiAgente = false;
    if (!atual) return;
    if (campo === 'disallow' || campo === 'allow') atual.regras.push({ permitir: campo === 'allow', caminho: valor });
  });
  const meu = grupos.find((g) => g.agentes.some((a) => a !== '*' && 'musiquebot'.includes(a)));
  const todos = grupos.find((g) => g.agentes.includes('*'));
  return (meu || todos || { regras: [] }).regras;
}

function permitidoPor(regras, caminho) {
  let melhor = null;
  regras.forEach((r) => {
    if (!r.caminho) return;                       // "Disallow:" vazio = tudo liberado
    const re = new RegExp('^' + r.caminho.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(caminho) && (!melhor || r.caminho.length > melhor.caminho.length || (r.caminho.length === melhor.caminho.length && r.permitir))) melhor = r;
  });
  return !melhor || melhor.permitir;
}

const estado = () => ({
  disjuntores: [...disjuntor.entries()].map(([host, d]) => ({ host, falhas: d.falhas, aberto: d.abertoAte > Date.now(), ate: d.abertoAte ? new Date(d.abertoAte).toISOString() : '' })),
  robots_em_cache: robotsCache.size,
});

module.exports = { obter, validarUrl, ipBloqueado, lookupSeguro, lerRobots, permitidoPor, estado, UA,
  _limpar: () => { robotsCache.clear(); disjuntor.clear(); fila.clear(); } };
