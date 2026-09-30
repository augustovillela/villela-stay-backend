// =====================================================================
// Musique · Laboratório — WORKER da separação de trilhas.
//
// Etapas SEPARADAS (refeito em 30/09/2026, depois de congelar um notebook
// com placa integrada — ver `aparelho()` em nucleo/separacao.js):
//   ← { tipo: 'preparar', motor, threads }  baixa (ou lê do cache) e carrega
//   ← { tipo: 'testar', esq, dir }           separa UM trecho de 7,8 s e mede
//   ← { tipo: 'separar', esq, dir, pausaMs } separa a música, com folga entre trechos
//   → baixando · pronto {motor, threads} · teste {ms, fontes} · progresso · fonte (×6) · fim · erro
// O motor (placa de vídeo ou processador) é decidido pela PÁGINA, antes.
// "Parar" é `worker.terminate()` na página: corta na hora, sem depender
// deste código.
// =====================================================================
/* global importScripts, ort, MusiqueLab */
'use strict';
var ORT_VERSAO = '1.30.0';
var ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + ORT_VERSAO + '/dist/';
importScripts(ORT_BASE + 'ort.webgpu.min.js');
importScripts('/music/laboratorio-nucleo.js');
var S = MusiqueLab.separacao;
var CACHE = 'musique-modelos-v1';
var sessao = null, motor = '', threads = 1;

ort.env.wasm.wasmPaths = ORT_BASE;

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
  if (cache) { try { await cache.put(url, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (_) { /* sem espaço: baixa de novo da próxima vez */ } }
  avisar({ tipo: 'baixando', feito: feito, total: total });
  return buf;
}

async function preparar(m) {
  if (sessao) return avisar({ tipo: 'pronto', motor: motor, threads: threads });
  motor = m.motor === 'webgpu' ? 'webgpu' : 'wasm';
  threads = Math.max(1, Math.min(4, Number(m.threads) || 1));
  ort.env.wasm.numThreads = self.crossOriginIsolated ? threads : 1;
  threads = ort.env.wasm.numThreads;
  var bytes = await lerModelo();
  try {
    sessao = await ort.InferenceSession.create(bytes, { executionProviders: [motor], graphOptimizationLevel: 'basic', enableCpuMemArena: false, enableMemPattern: false });
  } catch (e) {
    if (motor !== 'webgpu') throw new Error('Este navegador não conseguiu carregar o modelo: ' + (e.message || e));
    motor = 'wasm'; ort.env.wasm.numThreads = self.crossOriginIsolated ? threads : 1;   // placa recusou: processador
    sessao = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'basic', enableCpuMemArena: false, enableMemPattern: false });
  }
  bytes = null;
  avisar({ tipo: 'pronto', motor: motor, threads: threads });
}

function rodarModelo(mix) {
  var feeds = {}; feeds[S.MODELO.entrada] = new ort.Tensor('float32', mix, [1, 2, S.TRECHO]);
  return sessao.run(feeds).then(function (r) {
    var st = r[S.MODELO.saida] || r[sessao.outputNames[0]];
    return st.getData ? st.getData() : st.data;
  });
}

async function testar(m) {
  if (!sessao) throw new Error('O modelo ainda não foi carregado.');
  var t0 = Date.now();
  var fontes = await S.separar(m.esq, m.dir, rodarModelo);
  var ms = Date.now() - t0, transf = [];
  fontes.forEach(function (fc) { transf.push(fc[0].buffer, fc[1].buffer); });
  avisar({ tipo: 'teste', ms: ms, fontes: fontes }, transf);
}

async function separar(m) {
  if (!sessao) throw new Error('O modelo ainda não foi carregado.');
  var t0 = Date.now();
  var fontes = await S.separar(m.esq, m.dir, rodarModelo, function (i, n) { avisar({ tipo: 'progresso', i: i, n: n, ms: Date.now() - t0 }); }, { pausaMs: m.pausaMs || 0 });
  m.esq = m.dir = null;
  // uma fonte por vez, TRANSFERIDA (sem cópia): o pico de memória cai
  for (var f = 0; f < fontes.length; f++) {
    var L = fontes[f][0], R = fontes[f][1]; fontes[f] = null;
    avisar({ tipo: 'fonte', f: f, esq: L, dir: R }, [L.buffer, R.buffer]);
  }
  avisar({ tipo: 'fim', ms: Date.now() - t0 });
}

self.onmessage = function (ev) {
  var m = ev.data || {};
  var p = m.tipo === 'preparar' ? preparar(m) : m.tipo === 'testar' ? testar(m) : m.tipo === 'separar' ? separar(m) : Promise.resolve();
  p.catch(function (e) { avisar({ tipo: 'erro', msg: (e && e.message) || String(e) }); });
};
