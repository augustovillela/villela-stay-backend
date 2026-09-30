// =====================================================================
// Musique · Laboratório — WORKER da separação de trilhas (30/09/2026).
//
// Roda fora da tela (a página não congela). Mensagens:
//   ← { tipo: 'preparar' }                 baixa (ou lê do cache) e carrega o modelo
//   ← { tipo: 'separar', esq, dir }        separa (Float32Array a 44,1 kHz)
//   → { tipo: 'baixando', feito, total } · { tipo: 'pronto', motor }
//   → { tipo: 'progresso', i, n, ms }     · { tipo: 'fonte', f, esq, dir } (×6)
//   → { tipo: 'fim' } · { tipo: 'erro', msg }
// O modelo fica no Cache Storage do navegador: baixa UMA vez por aparelho.
// =====================================================================
/* global importScripts, ort, MusiqueLab */
'use strict';
var ORT_VERSAO = '1.30.0';
var ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + ORT_VERSAO + '/dist/';
importScripts(ORT_BASE + 'ort.webgpu.min.js');
importScripts('/music/laboratorio-nucleo.js');
var S = MusiqueLab.separacao;
var CACHE = 'musique-modelos-v1';
var sessao = null, motor = '';

ort.env.wasm.wasmPaths = ORT_BASE;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, (self.navigator && navigator.hardwareConcurrency) || 2) : 1;

function avisar(m, transf) { self.postMessage(m, transf || []); }

async function lerModelo() {
  var url = S.MODELO.url, cache = null;
  try { cache = await caches.open(CACHE); } catch (_) { cache = null; }
  if (cache) { var r0 = await cache.match(url); if (r0) { avisar({ tipo: 'baixando', feito: S.MODELO.bytes, total: S.MODELO.bytes, doCache: true }); return new Uint8Array(await r0.arrayBuffer()); } }
  var r = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!r.ok) throw new Error('Não consegui baixar o modelo (' + r.status + ').');
  var total = Number(r.headers.get('content-length')) || S.MODELO.bytes;
  var buf = new Uint8Array(total), feito = 0, leitor = r.body.getReader(), ult = 0;
  for (;;) {
    var x = await leitor.read();
    if (x.done) break;
    if (feito + x.value.length > buf.length) { var maior = new Uint8Array(Math.max(buf.length * 2, feito + x.value.length)); maior.set(buf); buf = maior; }
    buf.set(x.value, feito); feito += x.value.length;
    if (feito - ult > 2e6) { ult = feito; avisar({ tipo: 'baixando', feito: feito, total: total }); }
  }
  buf = buf.subarray(0, feito);
  if (feito !== S.MODELO.bytes) throw new Error('O modelo chegou incompleto (' + feito + ' de ' + S.MODELO.bytes + ' bytes). Tente de novo.');
  if (cache) { try { await cache.put(url, new Response(buf.slice(), { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (_) { /* sem espaço: baixa de novo da próxima vez */ } }
  avisar({ tipo: 'baixando', feito: feito, total: total });
  return buf;
}

async function preparar() {
  if (sessao) return avisar({ tipo: 'pronto', motor: motor });
  var bytes = await lerModelo();
  var tentativas = [];
  if (self.navigator && navigator.gpu) tentativas.push('webgpu');
  tentativas.push('wasm');
  var ultimoErro = null;
  for (var i = 0; i < tentativas.length; i++) {
    try {
      sessao = await ort.InferenceSession.create(bytes, { executionProviders: [tentativas[i]], graphOptimizationLevel: 'basic', enableCpuMemArena: false, enableMemPattern: false });
      motor = tentativas[i];
      break;
    } catch (e) { ultimoErro = e; sessao = null; }
  }
  if (!sessao) throw new Error('Este navegador não conseguiu carregar o modelo' + (ultimoErro ? ': ' + (ultimoErro.message || ultimoErro) : '') + '.');
  avisar({ tipo: 'pronto', motor: motor });
}

async function separar(esq, dir) {
  if (!sessao) await preparar();
  var t0 = Date.now();
  var fontes = await S.separar(esq, dir, async function (mix) {
    var feeds = {}; feeds[S.MODELO.entrada] = new ort.Tensor('float32', mix, [1, 2, S.TRECHO]);
    var r = await sessao.run(feeds);
    var st = r[S.MODELO.saida] || r[sessao.outputNames[0]];
    return st.getData ? await st.getData() : st.data;
  }, function (i, n) { avisar({ tipo: 'progresso', i: i, n: n, ms: Date.now() - t0 }); });
  // uma fonte por vez, TRANSFERIDA (sem cópia): o pico de memória cai
  for (var f = 0; f < fontes.length; f++) {
    var L = fontes[f][0], R = fontes[f][1]; fontes[f] = null;
    avisar({ tipo: 'fonte', f: f, esq: L, dir: R }, [L.buffer, R.buffer]);
  }
  avisar({ tipo: 'fim', ms: Date.now() - t0 });
}

self.onmessage = function (ev) {
  var m = ev.data || {};
  var p = m.tipo === 'preparar' ? preparar() : m.tipo === 'separar' ? separar(m.esq, m.dir) : Promise.resolve();
  p.catch(function (e) { avisar({ tipo: 'erro', msg: (e && e.message) || String(e) }); });
};
