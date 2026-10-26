'use strict';
// Emissor de telemetria técnica (music/telemetria-cliente.js) num navegador
// simulado: só allowlist, nenhum dado pessoal, dedupe, teto por sessão e
// falha de envio que não quebra a página.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const Emissor = require('../telemetria-cliente');

const CAMPOS = ['evento', 'rota', 'navegador', 'sistema', 'versao_app', 'duracao_ms', 'codigo'];
const UA_CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function armazenamento() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
function janela(pathname, extra) {
  return Object.assign({ location: { pathname, search: '?token=abc', hash: '#x' }, sessionStorage: armazenamento() }, extra || {});
}
function emissor(opcoes) {
  const enviados = [];
  const T = Emissor.criar(Object.assign({ janela: janela('/music/tocar'), navigator: { userAgent: UA_CHROME_WIN }, enviar: (c) => enviados.push(c) }, opcoes || {}));
  return { T, enviados };
}

test('allowlist do cliente é a mesma do servidor', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'telemetria.js'), 'utf8');
  const bloco = fonte.match(/const EVENTOS = new Set\(\[([\s\S]*?)\]\)/)[1];
  const servidor = [...bloco.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual([...Emissor.EVENTOS].sort(), servidor);
});

test('evento fora da allowlist não sai', () => {
  const { T, enviados } = emissor();
  for (const e of ['page_view', 'login', 'js_errors', '', undefined, 'JS_ERROR']) assert.equal(T.emitir(e, 'x'), null);
  assert.equal(enviados.length, 0);
});

test('corpo tem só os sete campos do contrato, sem query, hash, mensagem nem dado pessoal', () => {
  let t = 1000;
  const { T, enviados } = emissor({
    janela: janela('/music/app/obra/8f3a9c2e1b7d4f60a1b2c3d4/joana@example.com'),
    agora: () => t,
  });
  t = 1450;
  T.emitir('upload_error', 'storage_403');
  T.emitir('js_error', "Cannot read properties of undefined (reading 'email') joana@example.com");
  assert.equal(enviados.length, 2);
  for (const c of enviados) {
    assert.deepEqual(Object.keys(c).sort(), [...CAMPOS].sort());
    const json = JSON.stringify(c);
    assert.doesNotMatch(json, /@|example|token|\?|#|8f3a9c2e/);
  }
  const { versao_app, ...resto } = enviados[0];
  assert.match(versao_app, /^\d{4}\.\d{2}$/);
  assert.deepEqual(resto, {
    evento: 'upload_error', rota: '/music/app/obra/:id/:id', navegador: 'chrome', sistema: 'windows',
    duracao_ms: 450, codigo: 'storage_403',
  });
  assert.equal(enviados[1].codigo, 'outro', 'texto livre de exceção não vira código');
});

test('navegador e sistema saem só em família', () => {
  assert.equal(Emissor.navegadorDe('Mozilla/5.0 (Windows NT 10.0) Chrome/130 Edg/130'), 'edge');
  assert.equal(Emissor.navegadorDe('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko Firefox/131.0'), 'firefox');
  assert.equal(Emissor.navegadorDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile Safari/604.1'), 'safari');
  assert.equal(Emissor.sistemaDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
  assert.equal(Emissor.sistemaDe('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130'), 'android');
  assert.equal(Emissor.sistemaDe(''), 'outro');
});

test('dedupe por evento+código na página', () => {
  const { T, enviados } = emissor();
  assert.ok(T.emitir('audio_decode_error', 'faixa_local'));
  assert.equal(T.emitir('audio_decode_error', 'faixa_local'), null);
  assert.equal(T.emitir('audio_decode_error', 'faixa_local'), null);
  assert.ok(T.emitir('audio_decode_error', 'amostra_instrumento'));
  assert.ok(T.emitir('audio_load_error', 'faixa_local'));
  assert.equal(enviados.length, 3);
});

test('teto por sessão vale também entre recargas da página', () => {
  const w = janela('/music/tocar');
  const a = emissor({ janela: w });
  for (let i = 0; i < Emissor.TETO + 5; i++) a.T.emitir('js_error', 'erro_' + i);
  assert.equal(a.enviados.length, Emissor.TETO);
  const b = emissor({ janela: w }); // mesma aba, página recarregada
  assert.equal(b.T.emitir('route_error', 'api_500'), null);
  assert.equal(b.enviados.length, 0);
  // Sem sessionStorage (modo privado que lança): o teto da página continua valendo.
  const semArmazenamento = janela('/music/app');
  Object.defineProperty(semArmazenamento, 'sessionStorage', { get() { throw new Error('bloqueado'); } });
  const c = emissor({ janela: semArmazenamento });
  for (let i = 0; i < Emissor.TETO + 5; i++) c.T.emitir('js_error', 'erro_' + i);
  assert.equal(c.enviados.length, Emissor.TETO);
});

test('envio usa sendBeacon; se ele falhar cai no fetch keepalive; nada lança', async () => {
  const chamadas = [];
  class BlobFalso { constructor(partes, o) { this.texto = partes.join(''); this.type = o.type; } }
  const w = janela('/music/tocar', {
    Blob: BlobFalso,
    fetch: (url, o) => { chamadas.push(['fetch', url, o]); return Promise.reject(new TypeError('offline')); },
  });
  const comBeacon = Emissor.criar({ janela: w, navigator: { userAgent: UA_CHROME_WIN, sendBeacon: (url, blob) => { chamadas.push(['beacon', url, blob]); return true; } } });
  comBeacon.emitir('worker_error', 'detector_worker');
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0][0], 'beacon');
  assert.equal(chamadas[0][1], '/music/api/telemetria');
  assert.equal(chamadas[0][2].type, 'application/json');
  assert.equal(JSON.parse(chamadas[0][2].texto).evento, 'worker_error');

  chamadas.length = 0;
  const beaconQuebrado = Emissor.criar({ janela: janela('/music/tocar', { Blob: BlobFalso, fetch: w.fetch }), navigator: { userAgent: UA_CHROME_WIN, sendBeacon: () => { throw new Error('x'); } } });
  assert.doesNotThrow(() => beaconQuebrado.emitir('worker_error', 'detector_worker'));
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0][0], 'fetch');
  assert.equal(chamadas[0][2].keepalive, true);
  assert.equal(chamadas[0][2].credentials, 'omit');
  await new Promise((r) => setImmediate(r)); // rejeição do fetch é engolida

  const semNada = Emissor.criar({ janela: { location: { pathname: '/music/app' } }, navigator: {} });
  assert.doesNotThrow(() => semNada.emitir('js_error', 'window_error'));
});

test('erros de mídia viram eventos da allowlist; o resto não sai', () => {
  const { T, enviados } = emissor();
  T.erroDeMidia(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
  T.erroDeMidia(Object.assign(new Error('x'), { telemetria: { evento: 'browser_unsupported', codigo: 'sem_audioworklet' } }));
  T.erroDeMidia(Object.assign(new Error('sem dispositivo'), { name: 'NotFoundError' }));
  T.erroDeMidia(null);
  assert.deepEqual(enviados.map((c) => [c.evento, c.codigo]), [['microphone_denied', 'NotAllowedError'], ['browser_unsupported', 'sem_audioworklet']]);
});

test('no navegador: instala ouvintes globais sem levar a mensagem do erro', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'telemetria-cliente.js'), 'utf8');
  const ouvintes = {}, enviados = [];
  const w = {
    location: { pathname: '/music/tocar' }, navigator: { userAgent: UA_CHROME_WIN },
    sessionStorage: armazenamento(),
    addEventListener: (tipo, fn) => { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
    fetch: (url, o) => { enviados.push(JSON.parse(o.body)); return Promise.resolve(); },
  };
  vm.runInNewContext(fonte, Object.assign(w, { window: w }));
  assert.ok(w.MusiqueTelemetria && typeof w.MusiqueTelemetria.emitir === 'function');
  const erro = new TypeError('falhou com joana@example.com');
  ouvintes.error.forEach((fn) => fn({ error: erro, message: erro.message }));
  ouvintes.error.forEach((fn) => fn({ error: erro, message: erro.message }));
  ouvintes.unhandledrejection.forEach((fn) => fn({ reason: 'texto qualquer' }));
  assert.deepEqual(enviados.map((c) => [c.evento, c.codigo]), [['js_error', 'TypeError'], ['js_error', 'unhandled_rejection']]);
  assert.doesNotMatch(JSON.stringify(enviados), /joana|texto qualquer/);
  // Carregar duas vezes (bundle + tag) não duplica o emissor nem os ouvintes.
  const primeiro = w.MusiqueTelemetria;
  vm.runInNewContext(fonte, w);
  assert.equal(w.MusiqueTelemetria, primeiro);
  assert.equal(ouvintes.error.length, 1);
});

test('páginas do Tocar carregam o emissor antes dos demais scripts', () => {
  const fonte = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const tags = fonte.match(/<script src="\/music\/telemetria-cliente\.js" defer><\/script>\s*<script src="\/music\/tocar\/perfis\.js"/g) || [];
  assert.equal(tags.length, 2, '/music/tocar e /music/tocar/gerenciar');
});
