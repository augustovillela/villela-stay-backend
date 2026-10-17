'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Sons = require('./sons');

function parametro(value = 0) {
  return {
    value, eventos: [],
    setValueAtTime(v, t) { this.eventos.push(['set', v, t]); this.value = v; },
    linearRampToValueAtTime(v, t) { this.eventos.push(['linear', v, t]); },
    exponentialRampToValueAtTime(v, t) { this.eventos.push(['exponential', v, t]); },
    cancelScheduledValues(t) { this.eventos.push(['cancel', t]); },
  };
}
function no(extra = {}) {
  return Object.assign({ conexoes: [], disconnected: false,
    connect(destino) { this.conexoes.push(destino); },
    disconnect() { this.disconnected = true; this.conexoes = []; },
  }, extra);
}
function contexto() {
  return {
    state: 'running', currentTime: 0, destination: {}, sources: [], gains: [], compressors: [], decodes: 0,
    sampleDuration: 10,
    createBufferSource() {
      const s = no({ playbackRate: parametro(1), stops: [],
        start(t, offset) { this.startedAt = t; this.offset = offset; }, stop(t) { this.stops.push(t); this.stoppedAt = t; },
      });
      this.sources.push(s); return s;
    },
    createGain() { const g = no({ gain: parametro(1) }); this.gains.push(g); return g; },
    createDynamicsCompressor() {
      const c = no({ threshold: parametro(), knee: parametro(), ratio: parametro(), attack: parametro(), release: parametro() });
      this.compressors.push(c); return c;
    },
    async decodeAudioData(bytes) { this.decodes++; return { duration: this.sampleDuration, bytes, numberOfChannels: 2 }; },
    advance(t) {
      this.currentTime = t;
      this.sources.forEach(s => { if (!s.ended && s.stoppedAt <= t) { s.ended = true; if (s.onended) s.onended(); } });
    },
  };
}
function manifesto() {
  return { version: 1, banks: {
    piano: { kind: 'pitched', gain: 0.8, release: 0.25,
      samples: [21, 60, 72, 108].map(midi => ({ midi, file: `piano/n${midi}.mp3` })) },
    violao: { kind: 'pitched', gain: 0.7, release: 0.2, samples: [{ midi: 40, file: 'violao/E2.mp3' }] },
    bandolim: { kind: 'pitched', gain: 0.6, release: 0.15, doubled: true,
      samples: [{ midi: 60, file: 'ukulele/C4.mp3', tuneCents: -11 }] },
    bateria: { kind: 'drums', gain: 0.7,
      samples: [36, 38, 42, 44, 46, 49, 51].map(midi => ({ midi, file: `bateria/n${midi}.mp3` })) },
  } };
}
function resposta() { return { ok: true, arrayBuffer: async () => new ArrayBuffer(12) }; }
function montar(opcoes = {}) {
  const ctx = opcoes.ctx || contexto(), manifest = opcoes.manifest || manifesto(), requests = [];
  const buscar = opcoes.fetch || (async (url, init) => { requests.push({ url, init }); return resposta(); });
  return { ctx, manifest, requests, engine: Sons.criar(ctx, { manifest, fetch: buscar, navigator: opcoes.navigator }) };
}
function quase(a, b) { assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`); }
async function flush() { await new Promise(resolve => setImmediate(resolve)); }

test('exporta a mesma API UMD no navegador e em CommonJS', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'sons.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.window.MusiqueTocarSons.criar, 'function');
  assert.equal(typeof Sons.criar, 'function');
});

test('carrega apenas raízes necessárias, deduplica notas e compartilha requisições concorrentes', async () => {
  const h = montar();
  const [a, b] = await Promise.all([
    h.engine.preparar('piano', [{ midi: 59 }, { midi: 60 }, { midi: 61 }, { midi: 72 }]),
    h.engine.preparar('piano', [60, 72]),
  ]);
  assert.equal(a.amostras, 2); assert.equal(b.amostras, 2);
  assert.deepEqual(h.requests.map(r => r.url).sort(), ['/music/tocar/sons/piano/n60.mp3', '/music/tocar/sons/piano/n72.mp3']);
  assert.equal(h.ctx.decodes, 2);
  await h.engine.preparar('piano', [60, 72]);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].init.credentials, 'same-origin');
  h.engine.dispose();
});

test('preserva as 88 alturas e usa a raiz mais próxima sem confundir oitavas', async () => {
  const h = montar();
  await h.engine.preparar('piano', [21, 60, 61, 66, 72, 84, 108]);
  const baixos = h.engine.tocar('piano', { midi: 21, when: 1, duration: 1 });
  const c4 = h.engine.tocar('piano', { midi: 60, when: 1, duration: 1 });
  const cs4 = h.engine.tocar('piano', { midi: 61, when: 1, duration: 1 });
  const fs4 = h.engine.tocar('piano', { midi: 66, when: 1, duration: 1 });
  const c5 = h.engine.tocar('piano', { midi: 72, when: 1, duration: 1 });
  const c6 = h.engine.tocar('piano', { midi: 84, when: 1, duration: 1 });
  const agudos = h.engine.tocar('piano', { midi: 108, when: 1, duration: 1 });
  assert.deepEqual([baixos.rootMidi, c4.rootMidi, cs4.rootMidi, fs4.rootMidi, c5.rootMidi, c6.rootMidi, agudos.rootMidi], [21, 60, 60, 60, 72, 72, 108]);
  quase(h.ctx.sources[2].playbackRate.value, 2 ** (1 / 12));
  quase(h.ctx.sources[3].playbackRate.value, 2 ** (6 / 12));
  quase(h.ctx.sources[5].playbackRate.value, 2);
  assert.equal(h.ctx.sources[0].playbackRate.value, 1);
  assert.equal(h.ctx.sources[6].playbackRate.value, 1);
  h.engine.dispose();
});

test('aplica correção fina da amostra e dobra as cordas do bandolim sem dobrar o volume', async () => {
  const h = montar();
  await h.engine.preparar('bandolim', [60]);
  const voz = h.engine.tocar('bandolim', { midi: 60, when: 2, duration: 0.5, velocity: 127 });
  assert.equal(h.ctx.sources.length, 2);
  quase(h.ctx.sources[0].playbackRate.value, 2 ** (-14 / 1200));
  quase(h.ctx.sources[1].playbackRate.value, 2 ** (-8 / 1200));
  assert.equal(h.ctx.sources[0].startedAt, 2); quase(h.ctx.sources[1].startedAt, 2.003);
  quase(h.ctx.gains[1].gain.eventos[0][1], 0.3); quase(h.ctx.gains[2].gain.eventos[0][1], 0.3);
  quase(voz.endTime, 2.653);
  voz.stop();
  assert.ok(h.ctx.sources.every(s => s.disconnected));
  h.engine.dispose();
});

test('reproduz acordes simultâneos com intensidade por nota e proteção de volume compartilhada', async () => {
  const h = montar();
  await h.engine.preparar('piano', [60, 64, 67]);
  [60, 64, 67].forEach((midi, i) => h.engine.tocar('piano', { midi, when: 2, duration: 2, velocity: [40, 96, 127][i] }));
  assert.deepEqual(h.ctx.sources.map(s => s.startedAt), [2, 2, 2]);
  const volumes = h.ctx.gains.slice(1).map(g => g.gain.eventos[0][1]);
  assert.ok(volumes[0] < volumes[1] && volumes[1] < volumes[2]); assert.equal(volumes[2], 0.8);
  assert.ok(h.ctx.gains.slice(1).every(g => g.conexoes[0] === h.ctx.compressors[0]));
  assert.equal(h.ctx.compressors[0].conexoes[0], h.ctx.gains[0]);
  assert.equal(h.ctx.gains[0].conexoes[0], h.ctx.destination);
  assert.equal(h.ctx.gains[0].gain.value, 0.65);
  assert.equal(h.ctx.compressors[0].ratio.value, 8);
  h.engine.dispose();
});

test('a nota longa conserva sua duração e solta a tecla com cauda, sem limite de 1,2 segundo', async () => {
  const h = montar();
  await h.engine.preparar('piano', [60]);
  const v = h.engine.tocar('piano', { midi: 60, when: 2, duration: 7 });
  assert.equal(v.endTime, 9.25); assert.equal(v.duration, 7.25);
  const envelope = h.ctx.gains[1].gain.eventos;
  assert.equal(envelope[1][2], 9); assert.equal(envelope[2][0], 'exponential'); assert.equal(envelope[2][2], 9.25);
  assert.equal(h.ctx.sources[0].stoppedAt, 9.25);
  h.ctx.advance(9.25);
  assert.equal(h.ctx.sources[0].disconnected, true); assert.equal(h.ctx.gains[1].disconnected, true);
  h.engine.dispose();
});

test('não inventa sustentação além da gravação e respeita a duração após transposição', async () => {
  const h = montar(); h.ctx.sampleDuration = 4;
  await h.engine.preparar('violao', [52]);
  const v = h.engine.tocar('violao', { midi: 52, when: 1, duration: 12 });
  assert.equal(h.ctx.sources[0].playbackRate.value, 2);
  assert.equal(v.endTime, 3); assert.equal(v.duration, 2);
  h.engine.dispose();
});

test('remove apenas o silêncio inicial medido e calcula a cauda pela duração restante e transposição', async () => {
  const m = manifesto(); m.banks.violao.samples[0].offsetSeconds = 0.05;
  const h = montar({ manifest: m }); h.ctx.sampleDuration = 4;
  await h.engine.preparar('violao', [52]);
  const v = h.engine.tocar('violao', { midi: 52, when: 2, duration: 12 });
  assert.equal(h.ctx.sources[0].startedAt, 2); assert.equal(h.ctx.sources[0].offset, 0.05);
  assert.equal(h.ctx.sources[0].playbackRate.value, 2);
  quase(v.duration, (4 - 0.05) / 2); quase(v.endTime, 2 + (4 - 0.05) / 2);
  assert.equal(h.ctx.sources[0].stoppedAt, v.endTime);
  h.engine.dispose();
});

test('offset é preservado nas duas cordas e não muda o instante musical nem encurta notas abaixo da cauda natural', async () => {
  const m = manifesto(); m.banks.bandolim.samples[0].offsetSeconds = 0.015;
  const h = montar({ manifest: m });
  await h.engine.preparar('bandolim', [60]);
  const v = h.engine.tocar('bandolim', { midi: 60, when: 2, duration: 0.5 });
  assert.ok(h.ctx.sources.every(s => s.offset === 0.015));
  assert.equal(h.ctx.sources[0].startedAt, 2); quase(h.ctx.sources[1].startedAt, 2.003);
  quase(v.endTime, 2.653);
  h.engine.dispose();
});

test('recusa offsets fora do arquivo antes de agendar áudio', async () => {
  const m = manifesto(); m.banks.violao.samples[0].offsetSeconds = 0.5;
  const h = montar({ manifest: m }); h.ctx.sampleDuration = 0.3;
  await assert.rejects(h.engine.preparar('violao', [40]), /início da amostra/);
  assert.throws(() => h.engine.tocar('violao', { midi: 40 }), /início da amostra/);
  assert.equal(h.ctx.sources.length, 0); h.engine.dispose();
});

test('bateria usa a peça exata e mantém caudas completas mesmo para notas MIDI de 80 ms', async () => {
  const h = montar(); h.ctx.sampleDuration = 4;
  await h.engine.preparar('bateria', [36, 38, 49]);
  [36, 38, 49].forEach(midi => {
    const v = h.engine.tocar('bateria', { midi, when: 2, duration: 0.08 });
    assert.equal(v.rootMidi, midi); assert.equal(v.endTime, 6); assert.equal(v.duration, 4);
  });
  assert.ok(h.ctx.sources.every(s => s.playbackRate.value === 1));
  assert.ok(h.ctx.sources.every(s => s.offset === 0));
  assert.ok(h.ctx.gains.slice(1).every(g => g.gain.eventos.length === 1));
  const antes = h.requests.length;
  await assert.rejects(h.engine.preparar('bateria', [45]), /peça da bateria/);
  assert.throws(() => h.engine.tocar('bateria', { midi: 45 }), /peça da bateria/);
  assert.equal(h.requests.length, antes);
  h.engine.dispose();
});

test('chimbal fechado corta o aberto no instante futuro, preservando o som antes dele', async () => {
  const h = montar();
  await h.engine.preparar('bateria', [46, 42]);
  const aberto = h.engine.tocar('bateria', { midi: 46, when: 2, duration: 0.08 });
  h.engine.tocar('bateria', { midi: 42, when: 3, duration: 0.08 });
  quase(aberto.endTime, 3.012);
  assert.equal(h.ctx.sources[0].disconnected, false);
  assert.deepEqual(h.ctx.gains[1].gain.eventos.slice(-3), [['cancel', 3], ['set', h.ctx.gains[1].gain.eventos[0][1], 3], ['linear', 0, 3.012]]);
  h.ctx.advance(2.99); assert.equal(h.ctx.sources[0].disconnected, false);
  h.ctx.advance(3.012); assert.equal(h.ctx.sources[0].disconnected, true);
  assert.equal(h.ctx.sources[1].disconnected, false);
  h.engine.dispose();
});

test('pedal de chimbal também fecha e o agendamento fora de ordem não deixa o aberto tocando', async () => {
  const h = montar();
  await h.engine.preparar('bateria', [46, 44]);
  h.engine.tocar('bateria', { midi: 44, when: 3, duration: 0.08 });
  const aberto = h.engine.tocar('bateria', { midi: 46, when: 2, duration: 0.08 });
  quase(aberto.endTime, 3.012);
  const futuro = h.engine.tocar('bateria', { midi: 46, when: 4, duration: 0.08 });
  assert.equal(futuro.endTime, 14);
  h.engine.dispose();
});

test('parar cancela inclusive fontes futuras e permite recomeçar usando as mesmas amostras', async () => {
  const h = montar();
  await h.engine.preparar('piano', [60, 72]);
  const futura = h.engine.tocar('piano', { midi: 60, when: 10, duration: 2 });
  h.engine.tocar('piano', { midi: 72, when: 11, duration: 2 });
  h.engine.parar();
  assert.equal(futura.duration, 0);
  assert.ok(h.ctx.sources.every(s => s.stoppedAt === 0 && s.disconnected));
  assert.ok(h.ctx.gains.slice(1).every(g => g.disconnected));
  assert.equal(h.ctx.gains[0].disconnected, false);
  h.engine.tocar('piano', { midi: 60, when: 1, duration: 1 });
  assert.equal(h.requests.length, 2); assert.equal(h.ctx.sources[2].disconnected, false);
  h.engine.dispose(); h.engine.dispose();
  assert.ok(h.ctx.sources.every(s => s.disconnected));
  assert.equal(h.ctx.gains[0].disconnected, true); assert.equal(h.ctx.compressors[0].disconnected, true);
  assert.throws(() => h.engine.tocar('piano', { midi: 60 }), /encerrada/);
  await assert.rejects(h.engine.preparar('piano', [60]), /encerrada/);
});

test('stop futuro não desconecta prematuramente e não pode prolongar uma nota', async () => {
  const h = montar();
  await h.engine.preparar('piano', [60]);
  const v = h.engine.tocar('piano', { midi: 60, when: 1, duration: 4 });
  v.stop(3); assert.equal(h.ctx.sources[0].stoppedAt, 3); assert.equal(h.ctx.sources[0].disconnected, false);
  v.stop(4); assert.equal(h.ctx.sources[0].stoppedAt, 3);
  h.ctx.advance(3); assert.equal(h.ctx.sources[0].disconnected, true);
  h.engine.dispose();
});

test('limita a polifonia a 48 fontes e libera a mais antiga sem acumular conexões', async () => {
  const h = montar();
  await h.engine.preparar('piano', [60]);
  for (let i = 0; i < 64; i++) h.engine.tocar('piano', { midi: 60, when: 1 + i * 0.01, duration: 5 });
  assert.equal(h.ctx.sources.filter(s => !s.disconnected).length, 48);
  assert.ok(h.ctx.sources.slice(0, 16).every(s => s.disconnected && s.stoppedAt === 0));
  assert.ok(h.ctx.gains.slice(1, 17).every(g => g.disconnected));
  h.engine.parar(); assert.ok(h.ctx.sources.every(s => s.disconnected));
  h.engine.dispose();
});

test('conta ambas as cordas do bandolim no limite de polifonia', async () => {
  const h = montar();
  await h.engine.preparar('bandolim', [60]);
  for (let i = 0; i < 30; i++) h.engine.tocar('bandolim', { midi: 60, when: 1, duration: 5 });
  assert.equal(h.ctx.sources.filter(s => !s.disconnected).length, 48);
  h.engine.dispose();
});

test('falha HTTP e falha de decodificação são explícitas e permitem nova tentativa', async () => {
  let tentativa = 0;
  const h = montar({ fetch: async () => (++tentativa === 1 ? { ok: false, status: 503 } : resposta()) });
  await assert.rejects(h.engine.preparar('piano', [60]), /baixar/);
  assert.throws(() => h.engine.tocar('piano', { midi: 60 }), /Prepare os sons/);
  await h.engine.preparar('piano', [60]);
  assert.equal(tentativa, 2); assert.equal(h.ctx.decodes, 1);
  h.engine.dispose();
  const ctx = contexto(); let decode = 0;
  ctx.decodeAudioData = async () => { if (++decode === 1) throw new Error('Áudio inválido'); return { duration: 2 }; };
  const d = montar({ ctx });
  await assert.rejects(d.engine.preparar('piano', [60]), /Áudio inválido/);
  await d.engine.preparar('piano', [60]); assert.equal(decode, 2); assert.equal(d.requests.length, 2);
  d.engine.dispose();
});

test('limita a quatro downloads globais inclusive entre preparações concorrentes', async () => {
  const m = manifesto();
  m.banks.piano.samples = Array.from({ length: 12 }, (_, i) => ({ midi: 48 + i, file: `piano/n${48 + i}.mp3` }));
  const pendentes = []; let ativos = 0, maximo = 0, baixados = 0;
  const h = montar({ manifest: m, fetch: () => new Promise(resolve => {
    ativos++; maximo = Math.max(maximo, ativos);
    pendentes.push(() => { ativos--; baixados++; resolve(resposta()); });
  }) });
  const a = h.engine.preparar('piano', m.banks.piano.samples.slice(0, 8));
  const b = h.engine.preparar('piano', m.banks.piano.samples.slice(4));
  await flush(); assert.equal(ativos, 4);
  while (baixados < 12) {
    assert.ok(pendentes.length, 'a fila deve avançar após cada download');
    pendentes.shift()(); await flush();
  }
  await Promise.all([a, b]); assert.equal(maximo, 4); assert.equal(h.ctx.decodes, 12);
  h.engine.dispose();
});

test('adapta downloads, polifonia e prazo para conexão ou dispositivo limitado', async () => {
  const h = montar({ navigator: { connection: { effectiveType: '2g', saveData: true }, hardwareConcurrency: 2, deviceMemory: 2 } });
  assert.deepEqual(h.engine.diagnosticoDesempenho(), { nome: 'econômico', limiteVozes: 24, limiteDownloads: 2, tempoDownload: 30000 });
  h.engine.dispose();
  const rápido = montar({ navigator: { connection: { effectiveType: '4g' }, hardwareConcurrency: 8, deviceMemory: 8 } });
  assert.deepEqual(rápido.engine.diagnosticoDesempenho(), { nome: 'completo', limiteVozes: 48, limiteDownloads: 4, tempoDownload: 15000 });
  rápido.engine.dispose();
});

test('dispose aborta downloads pendentes e rejeita a fila sem iniciar novas requisições', async () => {
  const m = manifesto();
  m.banks.piano.samples = Array.from({ length: 8 }, (_, i) => ({ midi: 48 + i, file: `piano/n${48 + i}.mp3` }));
  const sinais = [];
  const h = montar({ manifest: m, fetch: (_url, { signal }) => { sinais.push(signal); return new Promise(() => {}); } });
  const p = h.engine.preparar('piano', m.banks.piano.samples);
  const rejeicao = assert.rejects(p, /cancelado/);
  await flush(); assert.equal(sinais.length, 4);
  h.engine.dispose(); await rejeicao;
  assert.ok(sinais.every(s => s.aborted));
  await flush(); assert.equal(sinais.length, 4);
});

test('uma preparação vazia não baixa arquivos e o cache pertence ao contexto que decodificou', async () => {
  const a = montar(), b = montar();
  await a.engine.preparar('piano', []); assert.equal(a.requests.length, 0);
  await a.engine.preparar('piano', [60]);
  assert.throws(() => b.engine.tocar('piano', { midi: 60 }), /Prepare os sons/);
  await b.engine.preparar('piano', [60]); assert.equal(b.requests.length, 1);
  assert.notEqual(a.ctx, b.ctx);
  a.engine.dispose(); b.engine.dispose();
});

test('recusa entradas malformadas, travessia de diretórios, bancos inexistentes e contexto fechado', async () => {
  assert.throws(() => Sons.criar({}, { manifest: manifesto() }), /navegador/);
  assert.throws(() => Sons.criar(contexto(), { manifest: { version: 2, banks: {} } }), /catálogo/);
  const h = montar();
  for (const id of ['desconhecido', '__proto__', null]) await assert.rejects(h.engine.preparar(id, [60]), /instrumento/);
  for (const midi of [-1, 128, NaN, Infinity, 60.5, '60', null]) await assert.rejects(h.engine.preparar('piano', [midi]), /MIDI/);
  await assert.rejects(h.engine.preparar('piano', null), /lista de notas/);
  for (const nota of [{ when: -1 }, { when: NaN }, { duration: 0 }, { duration: Infinity }, { duration: 3601 }, { velocity: 0 }, { velocity: 128 }, { velocity: NaN }]) {
    assert.throws(() => h.engine.tocar('piano', { midi: 60, ...nota }), /instante|duração|intensidade/);
  }
  assert.equal(h.requests.length, 0); assert.equal(h.ctx.sources.length, 0);
  h.ctx.state = 'closed'; await assert.rejects(h.engine.preparar('piano', [60]), /encerrada/);
  h.engine.dispose();
  for (const file of ['../segredo.mp3', '/piano/C4.mp3', 'https://example.com/a.mp3', 'piano/a%2fb.mp3', 'piano/../a.mp3', 'piano/a.exe', 'piano/sub/a.mp3']) {
    const m = manifesto(); m.banks.piano.samples[0].file = file;
    const s = montar({ manifest: m });
    await assert.rejects(s.engine.preparar('piano', [21]), /amostra/); assert.equal(s.requests.length, 0); s.engine.dispose();
  }
  for (const field of [{ gain: 2 }, { release: -1 }, { doubled: 'yes' }, { samples: [] }, { samples: [{ midi: 60, file: 'piano/a.mp3', tuneCents: 101 }] },
    { samples: [{ midi: 60, file: 'piano/a.mp3' }, { midi: 60, file: 'piano/b.mp3' }] },
    ...[-0.01, 1.01, NaN, Infinity, '0.05'].map(offsetSeconds => ({ samples: [{ midi: 60, file: 'piano/a.mp3', offsetSeconds }] }))]) {
    const m = manifesto(); Object.assign(m.banks.piano, field);
    const s = montar({ manifest: m }); await assert.rejects(s.engine.preparar('piano', [60])); s.engine.dispose();
  }
});

test('arquivos vazios, grandes demais e dados sem duração decodificada falham de forma recuperável', async () => {
  for (const respostaRuim of [
    { ok: true, arrayBuffer: async () => new ArrayBuffer(0) },
    { ok: true, arrayBuffer: async () => ({ byteLength: 13 * 1024 * 1024 }) },
    { ok: true, headers: { get: () => String(13 * 1024 * 1024) }, arrayBuffer: async () => { throw new Error('Não deve ler corpo'); } },
  ]) {
    const h = montar({ fetch: async () => respostaRuim });
    await assert.rejects(h.engine.preparar('piano', [60]), /inválido|tamanho/);
    assert.equal(h.ctx.decodes, 0); h.engine.dispose();
  }
  const ctx = contexto(); ctx.decodeAudioData = async () => ({ duration: NaN });
  const h = montar({ ctx }); await assert.rejects(h.engine.preparar('piano', [60]), /decodificar/); h.engine.dispose();
});

test('o limite de 15 segundos cancela também um corpo HTTP que ficou pendente', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal, tentativas = 0;
  const h = montar({ fetch: async (_url, init) => {
    signal = init.signal; tentativas++;
    return tentativas === 1 ? { ok: true, arrayBuffer: () => new Promise(() => {}) } : resposta();
  } });
  const p = h.engine.preparar('piano', [60]);
  const rejeicao = assert.rejects(p, /demorou demais/);
  await flush(); t.mock.timers.tick(15001); await rejeicao;
  assert.equal(signal.aborted, true);
  await h.engine.preparar('piano', [60]); assert.equal(tentativas, 2);
  h.engine.dispose();
});
