'use strict';
// Sinais sintéticos e dispositivos simulados: não abrem microfone nem rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const Detector = require('./detector');
const Audio = require('./audio');
let testes = 0;
function verificar(nome, fn) { fn(); testes++; console.log('OK', nome); }
function sinal(hz, sr = 48000, harmonicos = [1], ganho = 0.3, fase = 0) {
  const total = harmonicos.reduce((s, a) => s + Math.abs(a), 0);
  return Float32Array.from({ length: Math.ceil(sr * 0.064) }, (_, i) =>
    ganho * harmonicos.reduce((s, a, h) => s + a * Math.sin(2 * Math.PI * hz * (h + 1) * i / sr + fase), 0) / total);
}
function afinação(r, esperado, cents = 8) {
  assert.ok(r.hz !== null, `Altura ausente para ${esperado} Hz`);
  assert.ok(Math.abs(1200 * Math.log2(r.hz / esperado)) < cents, `${r.hz} vs ${esperado} Hz`);
  assert.ok(r.confidence >= 0.85);
}
verificar('Todas as notas cromáticas E2–E6 em 44,1/48/96 kHz e várias fases', () => {
  for (const sr of [44100, 48000, 96000]) for (let midi = 40; midi <= 88; midi++) {
    const hz = 440 * 2 ** ((midi - 69) / 12);
    for (const fase of [0, 0.8]) afinação(Detector.detectar(sinal(hz, sr, [1], 0.2, fase), sr), hz);
  }
});
verificar('Fundamental fraca não vira a oitava quando há evidência harmônica', () => {
  for (const hz of [82.4069, 110, 146.832, 196, 246.942, 329.628, 659.255, 1318.51]) {
    for (const harmonicos of [[0.15, 1], [0.1, 1, 0.6, 0.2], [1, 0.7, 0.4, 0.2, 0.1]]) {
      afinação(Detector.detectar(sinal(hz, 48000, harmonicos), 48000), hz, 12);
    }
  }
});
verificar('Silêncio, DC, sinal abaixo do piso, NaN e ruído não viram nota', () => {
  let seed = 41;
  const ruído = Float32Array.from({ length: 3072 }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 2 ** 32 - 0.5) * 0.3; });
  for (const a of [new Float32Array(3072), new Float32Array(3072).fill(0.2), sinal(110, 48000, [1], 0.001), ruído]) assert.equal(Detector.detectar(a, 48000).hz, null);
  const inválido = sinal(110); inválido[0] = NaN;
  assert.equal(Detector.detectar(inválido, 48000).hz, null);
});
verificar('Clipping forte não produz confiança falsa; distorção moderada mantém fundamental', () => {
  const saturado = sinal(110, 48000, [1], 2).map(x => Math.max(-1, Math.min(1, x)));
  const r = Detector.detectar(saturado, 48000);
  assert.equal(r.hz, null); assert.equal(r.confidence, 0); assert.ok(r.clipped > 0.08);
  const distorcido = sinal(110, 48000, [1], 2).map(x => Math.max(-0.5, Math.min(0.5, x)));
  afinação(Detector.detectar(distorcido, 48000), 110);
});
verificar('Faixa musical rejeita tons fora de 70–1400 Hz', () => {
  for (const hz of [40, 60, 1800, 4000]) assert.equal(Detector.detectar(sinal(hz), 48000).hz, null);
});
verificar('Ataque é refratário, não se repete na sustentação e reaparece após silêncio', () => {
  const d = Detector.criar(), a = sinal(110);
  assert.equal(d.analisar(a, 48000, 1).onset, true);
  assert.equal(d.analisar(a, 48000, 1.024).onset, false);
  assert.equal(d.analisar(a, 48000, 1.2).onset, false);
  d.analisar(new Float32Array(a.length), 48000, 1.3);
  assert.equal(d.analisar(a, 48000, 1.4).onset, true);
  assert.equal(d.analisar(a, 48000, 1.424).audioTime, 1.424);
});
verificar('Worklet: silêncio na saída, tempo por amostras e fila limitada a um quadro', () => {
  let Classe;
  const mensagens = [];
  class Base { constructor() { this.port = { postMessage: msg => mensagens.push(msg) }; } }
  const sandbox = { AudioWorkletProcessor: Base, Float32Array, sampleRate: 48000, currentFrame: 48000,
    registerProcessor: (nome, C) => { assert.equal(nome, 'musique-capturar'); Classe = C; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'capturar-worklet.js'), 'utf8'), sandbox);
  const capturador = new Classe(), entrada = new Float32Array(128).fill(0.4), saída = new Float32Array(128).fill(1);
  function render() { capturador.process([[entrada]], [[saída]]); sandbox.currentFrame += 128; }
  for (let i = 0; i < 24; i++) render();
  assert.equal(mensagens.length, 1); assert.ok(saída.every(x => x === 0));
  assert.equal(mensagens[0].audioTime, (48000 + 3072 - 1536) / 48000);
  assert.ok(new Float32Array(mensagens[0].buffer).every(x => Math.abs(x - 0.4) < 1e-6));
  for (let i = 0; i < 100; i++) render();
  assert.equal(mensagens.length, 1);
  capturador.port.onmessage({ data: { tipo: 'livre' } }); render();
  assert.equal(mensagens.length, 2);
  assert.ok(mensagens[1].audioTime > mensagens[0].audioTime + 0.25);
  capturador.port.onmessage({ data: { tipo: 'parar' } });
  assert.equal(capturador.process([[entrada]], [[saída]]), false);
});
verificar('Worker carrega o detector local e devolve id e relógio do quadro', () => {
  const mensagens = [];
  const sandbox = { Float32Array, postMessage: msg => mensagens.push(msg) };
  sandbox.self = sandbox;
  const contexto = vm.createContext(sandbox);
  sandbox.importScripts = url => {
    assert.equal(url, '/music/tocar/detector.js');
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'detector.js'), 'utf8'), contexto);
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'detector-worker.js'), 'utf8'), contexto);
  assert.equal(mensagens[0].tipo, 'pronto');
  sandbox.onmessage({ data: { tipo: 'quadro', id: 7, sampleRate: 48000, audioTime: 12.5, buffer: sinal(110).buffer } });
  assert.equal(mensagens[1].id, 7); assert.equal(mensagens[1].frame.audioTime, 12.5);
  afinação(mensagens[1].frame, 110);
});

class Eventos {
  constructor() { this.eventos = new Map(); }
  addEventListener(nome, fn) { this.eventos.set(nome, fn); }
  removeEventListener(nome, fn) { if (this.eventos.get(nome) === fn) this.eventos.delete(nome); }
  emitir(nome) { const fn = this.eventos.get(nome); if (fn) fn(); if (typeof this['on' + nome] === 'function') this['on' + nome](); }
}
function ambiente() {
  const trilha = Object.assign(new Eventos(), { readyState: 'live', label: 'Rocksmith USB Guitar Adapter', stops: 0,
    stop() { this.stops++; this.readyState = 'ended'; }, getSettings: () => ({ deviceId: 'real-tone' }) });
  const stream = { getTracks: () => [trilha], getAudioTracks: () => [trilha] };
  const media = Object.assign(new Eventos(), { pedidos: [], lista: [{ kind: 'audioinput', deviceId: 'real-tone', label: trilha.label }],
    getUserMedia(pedido) { this.pedidos.push(pedido); return Promise.resolve(stream); },
    enumerateDevices() { return Promise.resolve(this.lista); } });
  const contextos = [], workers = [], nodes = [];
  class Contexto extends Eventos {
    constructor() { super(); this.state = 'suspended'; this.resumes = 0; this.sampleRate = 48000; this.destination = {}; this.audioWorklet = { addModule: async url => { assert.equal(url, '/music/tocar/capturar-worklet.js'); } }; contextos.push(this); }
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; this.closed = true; return Promise.resolve(); }
    createMediaStreamSource(s) { assert.equal(s, stream); return { connect() {}, disconnect() {} }; }
  }
  class Worker {
    constructor(url) { assert.equal(url, '/music/tocar/detector-worker.js'); this.frames = []; workers.push(this); setImmediate(() => { if (this.onmessage) this.onmessage({ data: { tipo: 'pronto' } }); }); }
    postMessage(msg) { this.frames.push(msg); }
    terminate() { this.terminated = true; }
  }
  class Node {
    constructor() { this.port = { messages: [], postMessage(msg) { this.messages.push(msg); }, close() { this.closed = true; } }; nodes.push(this); }
    connect() {} disconnect() { this.disconnected = true; }
  }
  const g = { isSecureContext: true, navigator: { mediaDevices: media }, AudioContext: Contexto,
    AudioWorkletNode: Node, Worker, setTimeout, clearTimeout };
  return { g, trilha, stream, media, contextos, workers, nodes };
}
async function verificarAsync(nome, fn) { await fn(); testes++; console.log('OK', nome); }
async function aguardar(condicao) {
  for (let i = 0; i < 10 && !condicao(); i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(condicao(), 'A etapa assíncrona esperada não foi alcançada.');
}
function comRetomada(retomar) {
  const a = ambiente(), C = a.g.AudioContext;
  a.g.AudioContext = class extends C {
    resume() {
      if (!this.resumes) return super.resume();
      this.resumes++;
      return retomar(this, a);
    }
  };
  a.media.enumerateDevices = async () => { a.contextos[0].state = 'suspended'; return a.media.lista; };
  return a;
}
function conferirLimpeza(a) {
  assert.equal(a.trilha.stops, 1);
  assert.equal(a.contextos[0].closed, true);
  assert.equal(a.contextos[0].eventos.size, 0);
  for (const worker of a.workers) assert.equal(worker.terminated, true);
  assert.equal(a.media.eventos.size, 0);
  assert.equal(a.trilha.eventos.size, 0);
}
async function principal() {
  await verificarAsync('Ciclo: dispositivo exato, processamento desativado, callback e liberação total', async () => {
    const a = ambiente(), frames = [], estados = [];
    const mic = Audio.criar({ ambiente: a.g, onFrame: f => frames.push(f), onStatus: s => estados.push(s.estado) });
    const lista = await mic.iniciar('real-tone');
    assert.equal(lista[0].deviceId, 'real-tone');
    assert.deepEqual(a.media.pedidos[0].audio.deviceId, { exact: 'real-tone' });
    for (const opção of ['echoCancellation', 'noiseSuppression', 'autoGainControl']) assert.equal(a.media.pedidos[0].audio[opção], false);
    assert.equal(mic.estado().estado, 'conectado'); assert.equal(mic.contexto(), a.contextos[0]);
    assert.equal(a.contextos[0].resumes, 1, 'contexto já ativo não é retomado de novo');
    const port = a.nodes[0].port, worker = a.workers[0];
    const frame = { audioTime: 1, hz: 110, rms: 0.2, confidence: 0.99, onset: true };
    port.onmessage({ data: { tipo: 'quadro', id: 1, buffer: new ArrayBuffer(4) } });
    port.onmessage({ data: { tipo: 'quadro', id: 2, buffer: new ArrayBuffer(4) } });
    assert.equal(worker.frames.length, 1);
    worker.onmessage({ data: { tipo: 'quadro', id: 1, frame } });
    assert.equal(frames[0], frame); assert.equal(port.messages.at(-1).tipo, 'livre');
    mic.parar();
    assert.equal(a.trilha.stops, 1); assert.equal(worker.terminated, true); assert.equal(a.contextos[0].closed, true);
    assert.equal(mic.contexto(), null); assert.equal(mic.estado().estado, 'parado');
    assert.equal(a.media.eventos.size, 0); assert.equal(a.trilha.eventos.size, 0);
    assert.deepEqual(estados, ['iniciando', 'conectado', 'parado']);
  });
  await verificarAsync('Negação de permissão e navegador incompatível nunca ficam conectados', async () => {
    const a = ambiente(); a.media.getUserMedia = async () => { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; };
    const mic = Audio.criar({ ambiente: a.g });
    await assert.rejects(mic.iniciar(), /permissão de áudio foi negada/);
    assert.equal(mic.estado().estado, 'erro'); assert.equal(a.contextos.length, 0);
    const b = ambiente(); delete b.g.AudioWorkletNode;
    const outro = Audio.criar({ ambiente: b.g });
    await assert.rejects(outro.iniciar(), /AudioWorklet/);
    assert.equal(b.media.pedidos.length, 0); assert.equal(outro.contexto(), null);
  });
  await verificarAsync('Parar enquanto a permissão está pendente fecha a faixa tardia', async () => {
    const a = ambiente(); let permitir;
    a.media.getUserMedia = () => new Promise(resolve => { permitir = resolve; });
    const mic = Audio.criar({ ambiente: a.g });
    const promessa = mic.iniciar();
    assert.equal(a.contextos.length, 0, 'nenhum contexto aberto enquanto a entrada está pendente');
    mic.parar(); permitir(a.stream);
    await assert.rejects(promessa, { name: 'AbortError' });
    assert.equal(a.trilha.stops, 1); assert.equal(a.contextos.length, 0); assert.equal(mic.estado().estado, 'parado');
  });
  await verificarAsync('Contexto só é criado depois de a entrada abrir; contexto já running dispensa resume', async () => {
    const a = ambiente(), C = a.g.AudioContext;
    let permitir, entradaAberta = false;
    a.media.getUserMedia = () => new Promise(resolve => { permitir = () => { entradaAberta = true; resolve(a.stream); }; });
    a.g.AudioContext = class extends C {
      constructor() { assert.equal(entradaAberta, true); super(); this.state = 'running'; }
    };
    const mic = Audio.criar({ ambiente: a.g }), promessa = mic.iniciar();
    assert.equal(a.contextos.length, 0);
    permitir(); await promessa;
    assert.equal(a.contextos[0].resumes, 0);
    assert.equal(mic.estado().estado, 'conectado');
    mic.parar(); conferirLimpeza(a);
  });
  await verificarAsync('Primeira retomada pendente ou sem running expira e libera a entrada antes de montar o grafo', async () => {
    for (const modo of ['pendente', 'suspended']) {
      const a = ambiente(), C = a.g.AudioContext;
      let expirar;
      a.g.AudioContext = class extends C {
        resume() { this.resumes++; return modo === 'pendente' ? new Promise(() => {}) : Promise.resolve(); }
      };
      a.g.setTimeout = (fn, ms) => { assert.equal(ms, 2000); expirar = fn; return {}; };
      a.g.clearTimeout = () => {};
      const mic = Audio.criar({ ambiente: a.g });
      const rejeicao = assert.rejects(mic.iniciar(), /processamento de áudio do navegador continua indisponível/);
      await aguardar(() => !!expirar);
      assert.equal(a.workers.length, 0);
      expirar(); await rejeicao;
      assert.equal(a.contextos[0].resumes, 1);
      assert.equal(mic.estado().estado, 'erro');
      conferirLimpeza(a);
    }
  });
  await verificarAsync('Primeira retomada rejeitada ou cancelada libera a faixa e não monta o grafo', async () => {
    for (const modo of ['rejeitada', 'cancelada']) {
      const a = ambiente(), C = a.g.AudioContext;
      let liberar;
      a.g.AudioContext = class extends C {
        resume() {
          this.resumes++;
          if (modo === 'rejeitada') return Promise.reject(new Error('audio unavailable'));
          return new Promise(resolve => { liberar = resolve; });
        }
      };
      const estados = [], mic = Audio.criar({ ambiente: a.g, onStatus: s => estados.push(s.estado) });
      const rejeicao = assert.rejects(mic.iniciar(), modo === 'cancelada' ? { name: 'AbortError' } : /Não foi possível retomar o processamento de áudio/);
      if (modo === 'cancelada') { await aguardar(() => !!liberar); mic.parar(); liberar(); }
      await rejeicao;
      assert.equal(a.workers.length, 0);
      assert.deepEqual(estados, ['iniciando', modo === 'cancelada' ? 'parado' : 'erro']);
      conferirLimpeza(a);
    }
  });
  await verificarAsync('Desconectar faixa interrompe worker, contexto e captura', async () => {
    const a = ambiente(), mic = Audio.criar({ ambiente: a.g }); await mic.iniciar();
    a.trilha.emitir('ended');
    assert.equal(mic.estado().estado, 'erro'); assert.match(mic.estado().mensagem, /desconectada/);
    assert.equal(a.workers[0].terminated, true); assert.equal(a.trilha.stops, 1); assert.equal(mic.contexto(), null);
  });
  await verificarAsync('Troca de dispositivos e erro do Worker liberam o microfone', async () => {
    const a = ambiente(), mic = Audio.criar({ ambiente: a.g }); await mic.iniciar();
    a.media.lista = []; a.media.emitir('devicechange'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(mic.estado().estado, 'erro'); assert.equal(a.trilha.stops, 1);
    const b = ambiente(), outro = Audio.criar({ ambiente: b.g }); await outro.iniciar();
    b.workers[0].onerror({ preventDefault() {} });
    assert.equal(outro.estado().estado, 'erro'); assert.equal(b.trilha.stops, 1); assert.equal(b.workers[0].terminated, true);
  });
  await verificarAsync('Falha no módulo do Worklet libera recursos antes de rejeitar', async () => {
    const a = ambiente(), C = a.g.AudioContext;
    a.g.AudioContext = class extends C { constructor() { super(); this.audioWorklet.addModule = async () => { throw new Error('404'); }; } };
    const mic = Audio.criar({ ambiente: a.g }); await assert.rejects(mic.iniciar());
    assert.equal(mic.estado().estado, 'erro'); assert.equal(a.trilha.stops, 1); assert.equal(a.contextos[0].closed, true);
  });
  await verificarAsync('Uma conexão antiga não substitui nem encerra a conexão mais recente', async () => {
    const a = ambiente(); let resolverAntiga, chamadas = 0, stopsAntigos = 0;
    const faixaAntiga = { stop() { stopsAntigos++; } };
    a.media.getUserMedia = () => ++chamadas === 1 ? new Promise(resolve => { resolverAntiga = resolve; }) : Promise.resolve(a.stream);
    const mic = Audio.criar({ ambiente: a.g });
    const antiga = mic.iniciar('antiga');
    const rejeiçãoAntiga = assert.rejects(antiga, { name: 'AbortError' });
    await mic.iniciar('real-tone');
    resolverAntiga({ getTracks: () => [faixaAntiga] });
    await rejeiçãoAntiga;
    assert.equal(stopsAntigos, 1); assert.equal(a.trilha.stops, 0);
    assert.equal(mic.estado().estado, 'conectado'); assert.equal(mic.contexto(), a.contextos[0]);
    assert.equal(a.contextos.length, 1, 'a solicitação antiga nunca abriu um contexto');
    mic.parar();
  });
  await verificarAsync('Suspensão após módulo ou enumeração recebe uma única retomada final', async () => {
    for (const fase of ['modulo', 'enumeracao']) {
      const a = ambiente(), C = a.g.AudioContext;
      if (fase === 'modulo') a.g.AudioContext = class extends C {
        constructor() { super(); this.audioWorklet.addModule = async () => { this.state = 'suspended'; }; }
      };
      if (fase === 'enumeracao') a.media.enumerateDevices = async () => { a.contextos[0].state = 'suspended'; return a.media.lista; };
      const mic = Audio.criar({ ambiente: a.g });
      await mic.iniciar();
      assert.equal(mic.estado().estado, 'conectado', fase);
      assert.equal(a.trilha.readyState, 'live');
      assert.equal(a.contextos[0].state, 'running');
      assert.equal(a.contextos[0].resumes, 2);
      assert.equal(a.contextos[0].eventos.size, 0, 'listener temporário removido');
      mic.parar(); conferirLimpeza(a);
    }
  });
  await verificarAsync('Interrupção transitória aguarda statechange sem anunciar conexão antes de running', async () => {
    let concluirRetomada;
    const a = comRetomada(ctx => {
      ctx.state = 'interrupted';
      concluirRetomada = () => { ctx.state = 'running'; ctx.emitir('statechange'); };
      return Promise.resolve();
    });
    const estados = [], mic = Audio.criar({ ambiente: a.g, onStatus: s => estados.push(s.estado) });
    const iniciar = mic.iniciar();
    await aguardar(() => !!concluirRetomada);
    assert.equal(mic.estado().estado, 'iniciando');
    concluirRetomada(); await iniciar;
    assert.deepEqual(estados, ['iniciando', 'conectado']);
    assert.equal(a.contextos[0].resumes, 2);
    mic.parar(); conferirLimpeza(a);
  });
  await verificarAsync('Retomada rejeitada mantém a falha de áudio visível e libera todos os recursos', async () => {
    const a = comRetomada(() => Promise.reject(new Error('audio hardware unavailable')));
    const mic = Audio.criar({ ambiente: a.g });
    await assert.rejects(mic.iniciar(), /Não foi possível retomar o processamento de áudio/);
    assert.equal(a.contextos[0].resumes, 2);
    assert.equal(mic.estado().estado, 'erro');
    conferirLimpeza(a);
  });
  await verificarAsync('Retomada pendente ou sem running tem prazo limitado e não tenta após expirar', async () => {
    for (const modo of ['pendente', 'suspended', 'interrupted']) {
      let expirar, timerLimpo = false;
      const a = comRetomada(ctx => {
        if (modo === 'pendente') return new Promise(() => {});
        ctx.state = modo; return Promise.resolve();
      });
      const marcador = {};
      a.g.setTimeout = (fn, ms) => { if (ms === 2000 && a.contextos[0].resumes === 1) { expirar = fn; return marcador; } return setTimeout(fn, ms); };
      a.g.clearTimeout = timer => { if (timer === marcador) timerLimpo = true; else clearTimeout(timer); };
      const mic = Audio.criar({ ambiente: a.g });
      const rejeicao = assert.rejects(mic.iniciar(), /processamento de áudio do navegador continua indisponível/);
      await aguardar(() => !!expirar);
      assert.equal(mic.estado().estado, 'iniciando');
      expirar(); await rejeicao;
      assert.equal(timerLimpo, true);
      assert.equal(a.contextos[0].resumes, 2);
      conferirLimpeza(a);
    }
  });
  await verificarAsync('Cancelar durante a retomada aborta espera e ignora a resolução tardia', async () => {
    let liberar;
    const a = comRetomada(() => new Promise(resolve => { liberar = resolve; }));
    const estados = [], mic = Audio.criar({ ambiente: a.g, onStatus: s => estados.push(s.estado) });
    const rejeicao = assert.rejects(mic.iniciar(), { name: 'AbortError' });
    await aguardar(() => !!liberar);
    mic.parar(); await rejeicao; liberar();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(estados, ['iniciando', 'parado']);
    conferirLimpeza(a);
  });
  await verificarAsync('Faixa encerrada durante a retomada não vira conexão válida', async () => {
    const a = comRetomada((ctx, entrada) => {
      ctx.state = 'running'; entrada.trilha.readyState = 'ended'; return Promise.resolve();
    });
    const mic = Audio.criar({ ambiente: a.g });
    await assert.rejects(mic.iniciar(), /entrada de áudio foi desconectada durante a inicialização/);
    assert.equal(mic.estado().estado, 'erro');
    conferirLimpeza(a);
  });
  await verificarAsync('Suspensão do contexto interrompe captura; respostas antigas são ignoradas', async () => {
    const a = ambiente(), frames = [], mic = Audio.criar({ ambiente: a.g, onFrame: f => frames.push(f) });
    await mic.iniciar();
    const respostaAntiga = a.workers[0].onmessage;
    a.contextos[0].state = 'suspended'; a.contextos[0].onstatechange();
    assert.equal(mic.estado().estado, 'erro'); assert.equal(a.trilha.stops, 1);
    respostaAntiga({ data: { tipo: 'quadro', id: 1, frame: { hz: 110 } } });
    assert.equal(frames.length, 0); assert.equal(mic.contexto(), null);
  });
  const a = sinal(82.4069, 96000, [0.15, 1, 0.6]);
  const começo = performance.now();
  for (let i = 0; i < 100; i++) Detector.detectar(a, 96000);
  console.log(`Detector: média local de ${((performance.now() - começo) / 100).toFixed(2)} ms/quadro (96 kHz; não é medição de hardware de áudio).`);
  console.log(`${testes} verificações passaram.`);
}
const prazoTestes = setTimeout(() => { console.error('Os testes de áudio não concluíram dentro do prazo.'); process.exitCode = 1; }, 15000);
principal().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => clearTimeout(prazoTestes));
