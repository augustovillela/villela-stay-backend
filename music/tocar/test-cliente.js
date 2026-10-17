'use strict';
// Integração de cliente.js + núcleo real, com DOM, relógios e hardware simulados.
// Não substitui teste visual/acessível nem uma guitarra real no navegador.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('./nucleo');
const Aprender = require('./aprender');
const Estudos = require('./estudos');
const Formato = require('./formato-catalogo');
const Perfis = require('./perfis');

class Eventos {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== fn)); }
  dispatch(type) { return (this.listeners.get(type) || []).map(fn => fn.call(this, { type, target: this, preventDefault() {} })); }
}
class Elemento extends Eventos {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.doc = doc; this.ownerDocument = doc; this.attributes = {}; this.children = [];
    this.style = {}; this.files = []; this.disabled = false; this.hidden = false; this.checked = false;
    this._value = ''; this._text = ''; this.classes = new Set();
    this.classList = { toggle: (name, yes) => { if (yes === undefined) yes = !this.classes.has(name); if (yes) this.classes.add(name); else this.classes.delete(name); return yes; }, contains: name => this.classes.has(name) };
  }
  set value(v) { this._value = String(v); } get value() { return this._value; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.doc.ids.set(String(value), this);
    if (name === 'value') this.value = value;
    if (name === 'class') this.classes = new Set(String(value).split(/\s+/));
    if (['disabled', 'checked', 'hidden', 'selected'].includes(name)) this[name] = true;
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  appendChild(child) {
    this.children.push(child); child.parentNode = this;
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION' && (child.selected || this.children.length === 1)) this.value = child.value;
    return child;
  }
  replaceChildren(...children) { this._text = ''; this.children = []; children.forEach(c => this.appendChild(c)); }
  set innerHTML(html) {
    this.replaceChildren(); const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (token.startsWith('<')) {
        const match = token.match(/^<([a-zA-Z0-9-]+)/); if (!match) continue;
        const tag = match[1].toLowerCase(), node = this.doc.createElement(tag);
        const attrs = token.slice(match[0].length, token.lastIndexOf('>')).replace(/\/$/, '');
        for (const a of attrs.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)) node.setAttribute(a[1], a[2] ?? a[3] ?? a[4] ?? '');
        stack.at(-1).appendChild(node);
        if (!['input', 'br', 'img', 'hr', 'meta', 'link', 'source'].includes(tag)) stack.push(node);
      } else stack.at(-1).appendChild(this.doc.createTextNode(token));
    }
  }
  click() { if (!this.disabled) return this.dispatch('click'); }
  getBoundingClientRect() { return { width: 900, height: 430 }; }
  getContext() {
    if (!this.context) {
      const context = { labels: [], createLinearGradient: () => ({ addColorStop() {} }), fillText(text) { this.labels.push(String(text)); } };
      this.context = new Proxy(context, { get: (t, k) => k in t ? t[k] : (() => {}) });
    }
    return this.context;
  }
}
function montar(options = {}) {
  const document = new Eventos(); document.ids = new Map(); document.hidden = false;
  document.createElement = tag => new Elemento(tag, document);
  document.createTextNode = text => ({ textContent: String(text) });
  document.getElementById = id => document.ids.get(id) || null;
  const app = document.createElement('main'); app.setAttribute('id', options.page === 'gestao' ? 'tocar-gestao' : 'tocar-app'); app.setAttribute('data-estado', JSON.stringify({ logado: !!options.logado }));
  let now = 0, sequence = 0;
  const rafs = new Map(), timers = new Map(), contexts = [], oscillators = [], volumes = [], medias = [], requests = [], inputs = [], revoked = [];
  let audioFailure = options.audioFailure || null, pendingPlay = false;
  class Contexto {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    decodeAudioData() {
      if (options.waveformDecodeFailure) return Promise.reject(new Error('Codec indisponível'));
      const samples = options.waveformSamples || new Float32Array([-.8, -.2, .3, .9]);
      return Promise.resolve({ duration: options.waveformBufferDuration || 2, numberOfChannels: 1, getChannelData: () => samples });
    }
    createOscillator() {
      const ctx = this;
      const o = { ctx, frequency: { value: 0 }, connect() {}, disconnect() {}, start(t) { this.when = t; }, stop(t) { this.stopAt = t ?? ctx.currentTime; } };
      oscillators.push(o); return o;
    }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { volumes.push(value); }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  class Media {
    constructor(src) { this.src = src; this.paused = true; this.currentTime = 0; this.duration = 1000; this.playbackRate = 1; this.plays = 0; medias.push(this); }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() { this.loads = (this.loads || 0) + 1; this.currentTime = 0; }
    play() {
      this.plays++;
      if (options.playFailure) return Promise.reject(new Error('Formato indisponível'));
      if (pendingPlay) return new Promise(resolve => { this.release = () => { this.paused = false; resolve(); }; });
      this.paused = false; return Promise.resolve();
    }
  }
  const audio = { criar(callbacks) {
    const labels = { 'microfone-interno': 'Microfone (Realtek Audio)', 'real-tone': 'Rocksmith USB Guitar Adapter', 'interface-2': 'Interface USB 2' };
    const devices = () => Object.keys(labels).map(deviceId => ({ kind: 'audioinput', deviceId, label: labels[deviceId] }));
    const i = { callbacks, calls: [], gainDb: callbacks.ganhoDb, gainCalls: [], gainsAtStart: [], enumerations: 0, stopped: 0, currentContext: null, status: { estado: 'parado' },
      definirGanhoDb(db) {
        assert.equal(typeof db, 'number'); assert.ok(Number.isFinite(db));
        this.gainCalls.push(db); this.gainDb = Math.min(18, Math.max(0, db)); return this.gainDb;
      },
      async dispositivos() {
        this.enumerations++;
        return options.enumerate ? options.enumerate(this, devices()) : devices();
      },
      async iniciar(id) {
        this.gainsAtStart.push(this.gainDb);
        this.calls.push(id); this.status = { estado: 'iniciando' }; callbacks.onStatus(this.status);
        if (audioFailure) { this.status = { estado: 'erro', mensagem: audioFailure }; callbacks.onStatus(this.status); throw new Error(audioFailure); }
        if (this.currentContext) this.currentContext.close();
        const selected = id || 'microfone-interno';
        this.currentContext = new Contexto(); this.status = { estado: 'conectado', deviceId: selected, nome: labels[selected] || 'Entrada de áudio' }; callbacks.onStatus(this.status);
        return devices();
      },
      estado() { return this.status; }, contexto() { return this.currentContext && this.currentContext.state !== 'closed' ? this.currentContext : null; },
      parar() { this.stopped++; if (this.currentContext) this.currentContext.close(); this.status = { estado: 'parado', mensagem: 'Entrada desligada.' }; callbacks.onStatus(this.status); },
      desconectar() { if (this.currentContext) this.currentContext.close(); this.status = { estado: 'erro', mensagem: 'A entrada de áudio foi desconectada.' }; callbacks.onStatus(this.status); },
      frame(frame) { callbacks.onFrame(Object.assign({ audioTime: this.currentContext.currentTime, hz: 110, confidence: 0.99, rms: 0.1, onset: false, clipped: 0 }, frame)); }
    };
    inputs.push(i); return i;
  } };
  async function fetch(url, opts = {}) {
    requests.push({ url, opts });
    if (options.fetch) return options.fetch(url, opts);
    if (options.fetchFailure) throw new Error('Offline');
    if (opts.method === 'POST') {
      if (options.saveFailure) return { ok: false, json: async () => ({ erro: 'Não foi possível guardar agora.' }) };
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ sessoes: options.history || [], arranjos: [], total: 0 }) };
  }
  const window = new Eventos();
  Object.assign(window, { devicePixelRatio: 1, location: {search: options.search || ''}, TextDecoder, TextEncoder, DecompressionStream, Blob, AudioContext: Contexto, Audio: Media, MusiqueTocarCore: Core, MusiqueTocarAudio: audio, MusiqueTocarAprender: Aprender, MusiqueTocarEstudos: Estudos, MusiqueTocarFormatoCatalogo: Formato, MusiqueTocarPerfis: Perfis });
  const sandbox = { window, document, console, fetch, Blob, TextDecoder, TextEncoder, DecompressionStream, URLSearchParams, performance: { now: () => now * 1000 }, URL: { createObjectURL: () => 'blob:local-test-' + (++sequence), revokeObjectURL: url => revoked.push(url) },
    requestAnimationFrame: fn => { const id = ++sequence; rafs.set(id, fn); return id; }, cancelAnimationFrame: id => rafs.delete(id),
    setTimeout: (fn, ms) => { const id = ++sequence; timers.set(id, { at: now + ms / 1000, fn }); return id; }, clearTimeout: id => timers.delete(id) };
  const scripts = options.page === 'gestao' ? ['editor-nucleo.js','editor-cliente.js','importador-midi.js','importador-musicxml.js','waveform.js','waveform-cliente.js'] : ['catalogo-cliente.js','pista-piano.js','pista-bateria.js','cliente.js'];
  scripts.forEach(file => vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), sandbox, { filename: file }));
  if (options.page === 'gestao') {
    if (options.importador) window.MusiqueTocarImportadorMidi = options.importador;
    if (options.importadorMusicXml) window.MusiqueTocarImportadorMusicXML = options.importadorMusicXml;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'gerenciar.js'), 'utf8'), sandbox, { filename: 'gerenciar.js' });
  }
  const $ = id => document.getElementById(id);
  async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
  async function event(id, type, value) {
    const node = $(id); assert.ok(node, id + ' deve existir');
    if (value !== undefined) node.value = value;
    if (node.disabled) return;
    const pending = node.dispatch(type); await Promise.all(pending); await settle();
  }
  async function advance(seconds, step = 0.02) {
    const end = now + seconds;
    while (now < end - 1e-9) {
      const delta = Math.min(step, end - now); now += delta;
      contexts.filter(c => c.state === 'running').forEach(c => { c.currentTime += delta; });
      medias.filter(m => !m.paused).forEach(m => { m.currentTime += delta * m.playbackRate; });
      for (const o of oscillators) if (!o.ended && o.stopAt !== undefined && o.stopAt <= o.ctx.currentTime) { o.ended = true; if (o.onended) o.onended(); }
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); }
      const scheduled = [...rafs.values()]; rafs.clear(); scheduled.forEach(fn => fn(now * 1000)); await settle();
    }
  }
  async function chart(c = pequeno()) {
    const data = JSON.stringify(c); $('tj-chart-file').files = [{ size: data.length, text: async () => data }];
    await event('tj-chart-file', 'change');
  }
  async function associatedAudio(name = 'estudo-local.wav', audible = true) {
    $('tj-audio-file').files = [{ size: 4000, name }]; await event('tj-audio-file', 'change');
    const m = medias.at(-1); m.onloadedmetadata();
    $('tj-backing').checked = audible; await event('tj-backing', 'change'); return m;
  }
  return { $, window, document, contexts, oscillators, volumes, medias, requests, inputs, revoked, event, settle, advance, chart, associatedAudio,
    pendingPlay(value) { pendingPlay = value; }, audioFailure(value) { audioFailure = value; } };
}
function pequeno() {
  return { id: 'teste-2-notas', title: 'Duas cordas', bpm: 120, duration: 2, tuning: [40, 45, 50, 55, 59, 64],
    notes: [{ id: 'e', time: 0, duration: 0.3, string: 6, fret: 0, midi: 40 }, { id: 'a', time: 1, duration: 0.3, string: 5, fret: 0, midi: 45 }] };
}
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
test('Padrão: violão pelo microfone, sem sons de apoio ligados', async () => {
  const h = montar();
  assert.equal(h.$('tj-instrument').value, 'violao'); assert.equal(h.$('tj-instrument-label').textContent, 'Violão');
  assert.equal(h.$('tj-connection-type').value, 'microphone'); assert.match(h.$('tj-connect').textContent, /microfone/i);
  for (const id of ['tj-metronome', 'tj-guide', 'tj-backing']) assert.equal(h.$(id).checked, false, id);
  assert.equal(h.inputs[0].calls.length, 0); assert.equal(h.contexts.length, 0); await h.event('tj-connect', 'click');
  assert.equal(h.inputs[0].calls[0], undefined); assert.equal(h.$('tj-device').value, '');
});

test('Captação começa em 6 dB no microfone, com valor acessível de aproximadamente 2 vezes', async () => {
  const h = montar(); const slider = h.$('tj-gain');
  assert.equal(slider.value, '6'); assert.equal(slider.getAttribute('min'), '0'); assert.equal(slider.getAttribute('max'), '18'); assert.equal(slider.getAttribute('step'), '3');
  assert.equal(h.inputs[0].callbacks.ganhoDb, 6); assert.equal(h.inputs[0].calls.length, 0);
  assert.equal(h.$('tj-gain-value').textContent, '6 dB · 2×');
  assert.equal(slider.getAttribute('aria-valuetext'), '6 decibéis, aproximadamente 2 vezes');
  assert.equal(slider.getAttribute('aria-describedby'), 'tj-gain-help');
  assert.match(h.$('tj-gain-help').textContent, /Reduza se houver ruído ou sinal alto/);
});

test('Captação guarda ajuste por modo e mantém valor ao trocar somente o instrumento', async () => {
  const h = montar(); await h.event('tj-gain', 'input', '12');
  await h.event('tj-connection-type', 'change', 'interface');
  assert.equal(h.$('tj-gain').value, '0'); assert.equal(h.$('tj-gain-value').textContent, '0 dB · 1×'); assert.equal(h.inputs[0].gainDb, 0);
  await h.event('tj-gain', 'input', '3'); await h.event('tj-connection-type', 'change', 'realtone');
  assert.equal(h.$('tj-gain').value, '0'); assert.equal(h.inputs[0].gainDb, 0);
  await h.event('tj-gain', 'input', '9'); await h.event('tj-connection-type', 'change', 'microphone');
  assert.equal(h.$('tj-gain').value, '12'); assert.equal(h.inputs[0].gainDb, 12);
  await h.event('tj-instrument', 'change', 'guitarra'); assert.equal(h.$('tj-gain').value, '12');
  await h.event('tj-connection-type', 'change', 'interface'); assert.equal(h.$('tj-gain').value, '3');
  await h.event('tj-connection-type', 'change', 'realtone'); assert.equal(h.$('tj-gain').value, '9');
});

test('Ajuste aplica ganho na captura ativa sem reiniciar e persiste ao reconectar', async () => {
  const h = montar(); await h.event('tj-connect', 'click'); const input = h.inputs[0], context = input.currentContext;
  await h.event('tj-gain', 'input', '9');
  assert.equal(input.gainCalls.at(-1), 9); assert.equal(input.calls.length, 1); assert.equal(input.currentContext, context);
  assert.equal(h.$('tj-gain-value').textContent, '9 dB · 2,8×'); assert.equal(h.oscillators.length, 0);
  await h.event('tj-connect', 'click'); await h.event('tj-connect', 'click');
  assert.deepEqual(input.gainsAtStart, [6, 9]); assert.equal(h.$('tj-gain').value, '9');
});

test('Captação limita valores e rejeita NaN ou infinito sem propagar ganho inválido', async () => {
  const h = montar(); const input = h.inputs[0];
  for (const [value, expected] of [['-6', 0], ['24', 18], ['14', 15], ['NaN', 15], ['Infinity', 15], ['texto', 15]]) {
    await h.event('tj-gain', 'input', value);
    assert.equal(h.$('tj-gain').value, String(expected)); assert.equal(input.gainDb, expected);
    assert.doesNotMatch(h.$('tj-gain-value').textContent + h.$('tj-gain').getAttribute('aria-valuetext'), /NaN|Infinity/);
  }
  assert.ok(input.gainCalls.every(db => Number.isFinite(db) && db >= 0 && db <= 18 && db % 3 === 0));
});

test('Captação é bloqueada durante reprodução e calibração; erro ou cancelamento libera ajuste', async () => {
  for (const mode of ['practice', 'demo']) {
    const h = montar(); await h.chart(); await h.event('tj-connect', 'click');
    await h.event('tj-' + mode, 'click'); assert.equal(h.$('tj-gain').disabled, true);
    const calls = h.inputs[0].gainCalls.length; await h.event('tj-gain', 'input', '18'); assert.equal(h.inputs[0].gainCalls.length, calls);
    await h.event('tj-stop', 'click'); assert.equal(h.$('tj-gain').disabled, false);
    await h.event('tj-calibrate', 'click'); assert.equal(h.$('tj-gain').disabled, true);
    await h.event('tj-cancel-cal', 'click'); assert.equal(h.$('tj-gain').disabled, false);
    await h.event('tj-calibrate', 'click'); h.inputs[0].desconectar(); await h.settle(); assert.equal(h.$('tj-gain').disabled, false);
    h.inputs[0].callbacks.onStatus({ estado: 'iniciando' }); assert.equal(h.$('tj-gain').disabled, true);
    h.inputs[0].callbacks.onStatus({ estado: 'erro', mensagem: 'Falha de conexão.' }); assert.equal(h.$('tj-gain').disabled, false);
  }
});

test('Mudar captação na prática pausada encerra julgamento para não misturar sensibilidades', async () => {
  const h = montar({ logado: true }); await h.chart(); await h.event('tj-connect', 'click');
  await h.event('tj-practice', 'click'); await h.advance(2.1); await h.event('tj-pause', 'click');
  assert.equal(h.$('tj-gain').disabled, false); await h.event('tj-gain', 'input', '12');
  assert.equal(h.$('tj-mode').textContent, 'PRONTO PARA TOCAR'); assert.equal(h.$('tj-hits').textContent, '—');
  assert.equal(h.$('tj-pause').disabled, true); assert.equal(h.$('tj-save').disabled, true);
  assert.match(h.$('tj-status').textContent, /nova rodada/); assert.equal(h.inputs[0].gainDb, 12);
});

test('Ganho de captação não altera volumes da demonstração sintetizada ou do arquivo local', async () => {
  const volumes = [];
  for (const db of [0, 18]) {
    const h = montar(); await h.chart(); await h.event('tj-gain', 'input', String(db));
    await h.event('tj-demo', 'click'); await h.advance(2.2); volumes.push(h.volumes);
    await h.event('tj-stop', 'click'); const media = await h.associatedAudio();
    await h.event('tj-demo', 'click'); await h.advance(2.2); assert.equal(media.volume, 0.65);
  }
  assert.ok(volumes[0].length > 4); assert.deepEqual(volumes[0], volumes[1]);
});

test('Entradas aparecem antes da captura, sem abrir microfone nem escolher dispositivo', async () => {
  const h = montar(); await h.settle();
  const input = h.inputs[0], select = h.$('tj-device');
  assert.equal(input.enumerations, 1); assert.equal(input.calls.length, 0); assert.equal(h.contexts.length, 0);
  assert.equal(select.disabled, false); assert.equal(select.value, '');
  assert.ok(select.children.some(option => option.value === 'microfone-interno' && /Realtek/.test(option.textContent)));
  await h.event('tj-device', 'change', 'microfone-interno'); assert.equal(input.calls.length, 0);
  await h.event('tj-connect', 'click');
  assert.equal(input.calls[0], 'microfone-interno'); assert.equal(input.enumerations, 2);
  assert.equal(select.value, 'microfone-interno'); assert.equal(h.$('tj-practice').disabled, false);
});

test('Labels ocultos ficam genéricos e se atualizam mesmo após falha de inicialização', async () => {
  const originalError = 'A entrada de áudio foi interrompida. Conecte novamente.';
  const h = montar({ audioFailure: originalError, enumerate: (input, devices) => input.calls.length ? devices : devices.map(d => ({ ...d, label: '' })) });
  await h.settle();
  const select = h.$('tj-device');
  assert.equal(select.children[1].textContent, 'Entrada de áudio 1'); assert.doesNotMatch(select.textContent, /Realtek|Rocksmith/);
  await h.event('tj-connect', 'click');
  assert.match(select.textContent, /Realtek/); assert.equal(select.value, ''); assert.equal(select.disabled, false);
  assert.equal(h.$('tj-status').textContent, originalError); assert.equal(h.$('tj-practice').disabled, true);
  await h.event('tj-device', 'change', 'microfone-interno'); assert.equal(h.inputs[0].calls.length, 1);
  h.audioFailure(null); await h.event('tj-connect', 'click');
  assert.equal(h.inputs[0].calls.at(-1), 'microfone-interno'); assert.equal(h.$('tj-practice').disabled, false);
});

test('Falha na enumeração não apaga lista, seleção nem erro de permissão', async () => {
  const originalError = 'A permissão de áudio foi negada.';
  const h = montar({ audioFailure: originalError, enumerate(input, devices) {
    if (input.calls.length) throw new Error('Falha de enumerateDevices');
    return devices;
  } });
  await h.settle(); await h.event('tj-device', 'change', 'interface-2');
  const previous = h.$('tj-device').textContent;
  await h.event('tj-connect', 'click');
  assert.equal(h.$('tj-device').textContent, previous); assert.equal(h.$('tj-device').value, 'interface-2');
  assert.equal(h.$('tj-device').disabled, false); assert.equal(h.$('tj-connect').disabled, false);
  assert.equal(h.$('tj-status').textContent, originalError); assert.equal(h.$('tj-status').classList.contains('tj-error'), true);
});

test('Troca conectada que falha mantém escolha e permite tentar novamente explicitamente', async () => {
  const h = montar(); await h.settle(); await h.event('tj-connect', 'click');
  h.audioFailure('Não foi possível abrir a entrada escolhida.'); await h.event('tj-device', 'change', 'interface-2');
  assert.equal(h.inputs[0].calls.at(-1), 'interface-2'); assert.equal(h.inputs[0].enumerations, 3);
  assert.equal(h.$('tj-device').value, 'interface-2'); assert.equal(h.$('tj-device').disabled, false);
  assert.equal(h.$('tj-practice').disabled, true); assert.match(h.$('tj-status').textContent, /entrada escolhida/);
  h.audioFailure(null); await h.event('tj-connect', 'click');
  assert.equal(h.inputs[0].calls.at(-1), 'interface-2'); assert.equal(h.$('tj-practice').disabled, false);
});

test('Lista antiga pendente não bloqueia conexão nem sobrescreve nomes após permissão', async () => {
  let release;
  const h = montar({ enumerate(input, devices) {
    return input.enumerations === 1 ? new Promise(resolve => { release = () => resolve(devices.map(d => ({ ...d, label: '' }))); }) : devices;
  } });
  await h.event('tj-connect', 'click');
  assert.equal(h.inputs[0].calls.length, 1); assert.equal(h.$('tj-practice').disabled, false);
  assert.match(h.$('tj-device').textContent, /Realtek/);
  release(); await h.settle(); assert.match(h.$('tj-device').textContent, /Realtek/);
  assert.equal(h.$('tj-device').value, '');
});

test('Lista reduzida depois de recusa não muda a entrada explicitamente escolhida', async () => {
  const h = montar({ audioFailure: 'A permissão de áudio foi negada.', enumerate: (input, devices) => input.calls.length ? [] : devices });
  await h.settle(); await h.event('tj-device', 'change', 'interface-2'); await h.event('tj-connect', 'click');
  assert.equal(h.$('tj-device').value, 'interface-2'); assert.match(h.$('tj-device').textContent, /Interface USB 2/);
  h.audioFailure(null); await h.event('tj-connect', 'click'); assert.equal(h.inputs[0].calls.at(-1), 'interface-2');
});
test('Trocar instrumento ou forma de captação encerra a captura e exige novo clique', async () => {
  for (const [id, value] of [['tj-instrument', 'guitarra'], ['tj-connection-type', 'interface']]) {
    const h = montar(); await h.chart(); await h.event('tj-connect', 'click'); await h.event('tj-practice', 'click');
    assert.equal(h.$('tj-instrument').disabled, true); assert.equal(h.$('tj-connection-type').disabled, true);
    await h.event('tj-pause', 'click'); const input = h.inputs[0]; await h.event(id, 'change', value);
    assert.equal(input.stopped, 1); assert.equal(input.currentContext.state, 'closed'); assert.equal(input.calls.length, 1);
    assert.equal(h.$('tj-mode').textContent, 'PRONTO PARA TOCAR'); assert.equal(h.$('tj-practice').disabled, true);
    await h.event('tj-device', 'change', 'interface-2');
    assert.equal(input.calls.length, 1, 'Escolher dispositivo desligado não abre o microfone.');
    await h.event('tj-connect', 'click'); assert.equal(input.calls.at(-1), 'interface-2'); assert.equal(h.$('tj-practice').disabled, false);
  }
});
test('Interface e Real Tone continuam selecionáveis por deviceId explícito', async () => {
  for (const [kind, device] of [['interface', 'interface-2'], ['realtone', 'real-tone']]) {
    const h = montar(); await h.event('tj-connect', 'click'); await h.event('tj-connection-type', 'change', kind);
    assert.equal(h.$('tj-backing').checked, true); assert.equal(h.$('tj-metronome').checked, true);
    h.$('tj-device').value = device; await h.event('tj-connect', 'click');
    assert.equal(h.inputs[0].calls.at(-1), device); assert.equal(h.$('tj-device').value, device);
    assert.equal(h.$('tj-practice').disabled, false);
    await h.event('tj-connection-type', 'change', 'microphone');
    for (const id of ['tj-metronome', 'tj-guide', 'tj-backing']) assert.equal(h.$(id).checked, false);
  }
});
test('Prática pelo microfone permanece silenciosa após contagem, com ou sem arquivo local', async () => {
  for (const local of [false, true]) {
    const h = montar(); await h.chart(); const media = local ? await h.associatedAudio('apoio.wav', false) : null;
    await h.event('tj-connect', 'click'); await h.event('tj-practice', 'click'); await h.advance(4.6);
    assert.equal(h.oscillators.length, 4, 'Somente os quatro cliques de contagem: arquivo=' + local);
    if (media) { assert.equal(media.plays, 0); assert.equal(media.paused, true); }
    assert.equal(h.$('tj-misses').textContent, '2', 'A prática silenciosa continua usando o relógio e avaliando.');
  }
});
test('Demonstração continua audível quando acompanhamento está desmarcado', async () => {
  for (const local of [false, true]) {
    const h = montar(); await h.chart(); const media = local ? await h.associatedAudio('demo.wav', false) : null;
    assert.equal(h.$('tj-backing').checked, false); await h.event('tj-demo', 'click'); await h.advance(2.2);
    if (media) { assert.equal(media.plays, 1); assert.equal(media.paused, false); }
    else assert.ok(h.oscillators.length > 4, 'A demo sintetiza notas além da contagem.');
    assert.equal(h.$('tj-hits').textContent, '—');
  }
});
test('Visitante: demonstração funciona sem captura, nota ou histórico inventado', async () => {
  const h = montar(); await h.chart();
  assert.equal(h.$('tj-practice').disabled, true); assert.equal(h.$('tj-save').disabled, true);
  await h.event('tj-demo', 'click'); await h.advance(4.2);
  assert.match(h.$('tj-mode').textContent, /DEMONSTRAÇÃO/); assert.equal(h.$('tj-hits').textContent, '—');
  assert.equal(h.$('tj-save').disabled, true); assert.equal(h.inputs[0].calls.length, 0); assert.equal(h.requests.length, 0);
});
test('Contagem inicial toca quatro cliques mesmo com metrônomo desmarcado', async () => {
  const h = montar(); await h.chart(); h.$('tj-metronome').checked = false;
  await h.event('tj-demo', 'click'); await h.advance(1.85);
  assert.equal(h.oscillators.length, 4); assert.equal(h.$('tj-count').textContent, '1');
});
test('Mapa de andamento variável preserva a fase das batidas na contagem e no metrônomo', async () => {
  const h = montar(), c = pequeno();
  c.duration = 3; c.bpm = 120;
  c.tempoMap = { version: 1, events: [{ time: 0, beat: 0, bpm: 120 }, { time: 1, beat: 2, bpm: 60 }] };
  c.notes[1] = { ...c.notes[1], time: 2.6 };
  c.sections = [{ id: 'depois-da-mudanca', title: 'Depois da mudança', from: 2.5, to: 3 }];
  await h.chart(c); await h.event('tj-section', 'change', '0'); await h.event('tj-connect', 'click'); h.$('tj-metronome').checked = true;
  assert.match(h.$('tj-song-info').textContent, /andamento variável/);
  await h.event('tj-practice', 'click'); await h.advance(2.8);
  const clicks = h.oscillators.filter(o => o.frequency.value > 800).map(o => o.when);
  // A contagem começa na mesma fase da batida que o trecho: as pausas
  // atravessam a mudança de 120 para 60 BPM em vez de manter 0,5 s fixos.
  assert.ok(clicks.some(t => Math.abs(t - 1.75) < 0.08), 'Clique após a mudança de andamento.');
  assert.equal(clicks.some(t => Math.abs(t - 1.5) < 0.08), false, 'Não deve inventar o clique constante de 120 BPM.');
  assert.equal(h.$('tj-count').textContent, '');
});
test('Pausar a contagem e continuar preserva o tempo que ainda falta', async () => {
  const h = montar(); await h.chart(); await h.event('tj-demo', 'click'); await h.advance(0.7);
  await h.event('tj-pause', 'click'); await h.advance(4); await h.event('tj-pause', 'click'); await h.advance(0.1);
  assert.ok(Number(h.$('tj-count').textContent) >= 2, 'A contagem restante não pode ser pulada ao continuar.');
});
test('Prática: dispositivo explícito, altura real, pausa sem perder acertos e persistência mínima', async () => {
  const h = montar({ logado: true }); await h.settle(); await h.chart();
  h.$('tj-device').value = 'real-tone'; await h.event('tj-connect', 'click');
  assert.equal(h.inputs[0].calls[0], 'real-tone'); assert.equal(h.$('tj-practice').disabled, false);
  await h.event('tj-practice', 'click'); await h.advance(2.001);
  const input = h.inputs[0], hz = midi => 440 * 2 ** ((midi - 69) / 12);
  input.frame({ hz: hz(40), onset: true }); await h.advance(0.024); input.frame({ hz: hz(40) });
  await h.advance(0.024); input.frame({ hz: hz(40) }); await h.advance(0.02);
  assert.equal(h.$('tj-hits').textContent, '1');
  await h.event('tj-pause', 'click'); const position = h.$('tj-seek').value; await h.advance(10);
  assert.equal(h.$('tj-seek').value, position); await h.event('tj-pause', 'click');
  assert.equal(h.$('tj-hits').textContent, '1');
  await h.advance(1 - Number(position)); input.frame({ hz: hz(45), onset: true });
  await h.advance(0.024); input.frame({ hz: hz(45) }); await h.advance(0.024); input.frame({ hz: hz(45) });
  await h.advance(1.5); // Inclui os 400 ms de graça para quadros em trânsito.
  assert.equal(h.$('tj-hits').textContent, '2'); assert.equal(h.$('tj-misses').textContent, '0');
  assert.equal(h.$('tj-save').disabled, false); await h.event('tj-save', 'click'); await h.event('tj-save', 'click');
  const posts = h.requests.filter(r => r.opts.method === 'POST'); assert.equal(posts.length, 1);
  const payload = JSON.parse(posts[0].opts.body);
  assert.equal(payload.mode, 'practice'); assert.equal(payload.hits, 2); assert.equal(payload.total, 2);
  assert.ok(!Object.keys(payload).some(k => /audio|sample|buffer|record/i.test(k)), 'Nenhum áudio integra a persistência.');
  assert.equal(posts[0].opts.credentials, 'same-origin');
});
test('Mudança de entrada usa exatamente o dispositivo escolhido', async () => {
  const h = montar(); await h.event('tj-connect', 'click');
  await h.event('tj-device', 'change', 'interface-2');
  assert.equal(h.inputs[0].calls.at(-1), 'interface-2'); assert.equal(h.$('tj-practice').disabled, false);
});
test('Permissão negada mostra erro e mantém prática desabilitada', async () => {
  const h = montar({ audioFailure: 'A permissão de áudio foi negada.' }); await h.event('tj-connect', 'click');
  assert.match(h.$('tj-status').textContent, /permissão/); assert.equal(h.$('tj-practice').disabled, true);
  assert.equal(h.$('tj-connect').disabled, false); assert.equal(h.$('tj-status').classList.contains('tj-error'), true);
});
test('Desconexão pausa prática e também demonstração com contexto compartilhado', async () => {
  for (const mode of ['practice', 'demo']) {
    const h = montar(); await h.chart(); await h.event('tj-connect', 'click');
    await h.event('tj-' + mode, 'click'); await h.advance(0.2); h.inputs[0].desconectar(); await h.settle();
    assert.equal(h.$('tj-demo').disabled, false, 'Demo deve ser liberada após perda do contexto: ' + mode);
    assert.equal(h.$('tj-practice').disabled, true); assert.match(h.$('tj-status').textContent, /desconectada/);
  }
});
test('Áudio local pendente não recebe play() repetido a cada frame', async () => {
  const h = montar(); await h.chart(); const media = await h.associatedAudio(); h.pendingPlay(true);
  await h.event('tj-demo', 'click'); await h.advance(2.25);
  assert.equal(media.plays, 1); assert.equal(h.$('tj-media-label').textContent, 'estudo-local.wav');
  media.release(); await h.settle(); await h.advance(0.1);
  assert.equal(media.plays, 1); assert.equal(media.paused, false);
});
test('Prática espera o áudio pendente sem avançar nem julgar a guitarra', async () => {
  const h = montar(); await h.chart(); const media = await h.associatedAudio(); h.pendingPlay(true);
  await h.event('tj-connect', 'click'); await h.event('tj-practice', 'click'); await h.advance(2.1);
  const input = h.inputs[0], hz = 440 * 2 ** ((40 - 69) / 12), position = h.$('tj-seek').value;
  input.frame({ hz, onset: true }); await h.advance(0.024); input.frame({ hz });
  await h.advance(0.024); input.frame({ hz }); await h.advance(3);
  assert.equal(h.$('tj-seek').value, position); assert.equal(media.plays, 1);
  assert.equal(h.$('tj-hits').textContent, '0'); assert.equal(h.$('tj-misses').textContent, '0');
  media.release(); await h.settle(); input.frame({ hz, onset: true });
  await h.advance(0.024); input.frame({ hz }); await h.advance(0.024); input.frame({ hz }); await h.advance(0.02);
  assert.equal(h.$('tj-hits').textContent, '1');
});
test('Resolver play() depois de Pausar não reinicia o áudio', async () => {
  const h = montar(); await h.chart(); const media = await h.associatedAudio(); h.pendingPlay(true);
  await h.event('tj-demo', 'click'); await h.advance(2.1); await h.event('tj-pause', 'click');
  media.release(); await h.settle();
  assert.equal(media.paused, true); assert.equal(h.$('tj-demo').disabled, false);
});
test('Eventos atrasados do arquivo A não removem nem renomeiam o arquivo B', async () => {
  const h = montar(); await h.chart(); const a = await h.associatedAudio('primeiro.wav');
  const erroAntigo = a.onerror, metadataAntiga = a.onloadedmetadata;
  const b = await h.associatedAudio('segundo.wav'); a.duration = 0;
  metadataAntiga(); erroAntigo();
  assert.equal(h.$('tj-media-label').textContent, 'segundo.wav'); assert.ok(b.src);
  assert.equal(a.src, ''); assert.equal(a.onerror, null); assert.equal(a.onloadedmetadata, null); assert.ok(a.loads >= 1);
  await h.event('tj-demo', 'click'); await h.advance(2.1); assert.equal(b.plays, 1);
});
test('Alterar velocidade ou compensação encerra o julgamento anterior', async () => {
  for (const [id, value] of [['tj-speed', '0.5'], ['tj-offset', '100']]) {
    const h = montar({ logado: true }); await h.chart(); await h.event('tj-connect', 'click');
    await h.event('tj-practice', 'click'); await h.advance(2.1); await h.event('tj-pause', 'click');
    await h.event(id, 'change', value);
    assert.equal(h.$('tj-mode').textContent, 'PRONTO PARA TOCAR'); assert.equal(h.$('tj-hits').textContent, '—');
    assert.equal(h.$('tj-pause').disabled, true); assert.equal(h.$('tj-save').disabled, true);
    assert.equal(h.$(id).value, value);
  }
});
test('Quadro atrasado dentro da tolerância ainda pode confirmar uma nota', async () => {
  const h = montar(); await h.chart(); await h.event('tj-connect', 'click'); await h.event('tj-practice', 'click');
  const input = h.inputs[0]; await h.advance(3.2);
  input.frame({ audioTime: input.currentContext.currentTime - 0.04, hz: 110, onset: true });
  await h.advance(0.02); input.frame({ audioTime: input.currentContext.currentTime - 0.04, hz: 110 });
  await h.advance(0.02); input.frame({ audioTime: input.currentContext.currentTime - 0.04, hz: 110 });
  await h.advance(0.02);
  assert.equal(h.$('tj-hits').textContent, '1');
});
test('Erro de reprodução local pausa o transporte e fica visível', async () => {
  const h = montar({ playFailure: true }); await h.chart(); await h.associatedAudio();
  await h.event('tj-demo', 'click'); await h.advance(2.2);
  assert.equal(h.$('tj-demo').disabled, false); assert.match(h.$('tj-status').textContent, /áudio|Formato/i);
});
test('Histórico vem da conta, é limitado e trata títulos como texto', async () => {
  const title = '<img src=x onerror=alert(1)>';
  const h = montar({ logado: true, history: Array.from({ length: 8 }, (_, i) => ({ title: i ? 'Estudo ' + i : title, accuracy: 80, createdAt: '2026-10-15T12:00:00Z' })) });
  await h.settle(); const list = h.$('tj-history');
  assert.equal(list.children.length, 5); assert.match(list.children[0].textContent, /<img src=x/);
  assert.equal(list.children[0].children.length, 0); assert.equal(h.requests.filter(r=>r.url.endsWith('/sessoes')).length, 1); assert.equal(h.requests[0].opts.credentials, 'same-origin');
  const offline = montar({ logado: true, fetchFailure: true }); await offline.settle();
  assert.match(offline.$('tj-history-label').textContent, /indisponível/);
});
test('Falha ao guardar mantém a rodada e permite tentar novamente', async () => {
  const h = montar({ logado: true, saveFailure: true }); await h.chart(); await h.event('tj-connect', 'click');
  await h.event('tj-practice', 'click'); await h.advance(4.6);
  assert.equal(h.$('tj-save').disabled, false); await h.event('tj-save', 'click');
  assert.match(h.$('tj-status').textContent, /Não foi possível guardar/);
  assert.equal(h.$('tj-save').disabled, false); assert.equal(h.$('tj-misses').textContent, '2');
});
test('Segundo plano pausa; saída da página fecha captura e revoga áudio local', async () => {
  const h = montar(); await h.chart(); await h.associatedAudio(); await h.event('tj-connect', 'click'); await h.event('tj-practice', 'click');
  await h.advance(0.2); h.document.hidden = true; h.document.dispatch('visibilitychange'); await h.settle();
  assert.equal(h.$('tj-demo').disabled, false); assert.match(h.$('tj-status').textContent, /segundo plano/);
  h.window.dispatch('pagehide'); await h.settle();
  assert.equal(h.inputs[0].stopped, 1); assert.ok(h.contexts.every(c => c.state === 'closed'));
  assert.ok(h.revoked.some(url => url.startsWith('blob:local-test-')));
});

async function aprender(h) {
  await h.event('tj-study-mode', 'change', 'learn');
  if(h.inputs[0].status.estado!=='conectado')await h.event('tj-connect', 'click'); await h.event('tj-practice', 'click'); await h.advance(0.04);
}
async function tocarNota(h, midi, options = {}) {
  const input = h.inputs[0], hz = 440 * 2 ** ((midi - 69) / 12);
  for (let i = 0; i < 5; i++) {
    input.frame({ hz, onset: i === 0 && options.onset !== false, ...(options.frame || {}) }); await h.advance(0.024);
  }
}
test('Biblioteca tem sete estudos e mantém No ritmo como padrão sem abrir a captura', async () => {
  const h = montar(); await h.settle(); const library = h.$('tj-study');
  assert.equal(h.$('tj-study-mode').value, 'practice'); assert.equal(library.value, 'primeiro-riff-v1');
  assert.equal(library.children.filter(o => o.value).length, 7); assert.equal(h.inputs[0].calls.length, 0);
  await h.event('tj-study', 'change', 'cordas-soltas-v1');
  assert.equal(h.$('tj-song-title').textContent, Estudos.obter('cordas-soltas-v1').title);
  assert.match(h.$('tj-study-info').textContent, /Iniciante/); assert.match(h.$('tj-source').textContent, /original Musique/);
  assert.equal(h.$('tj-section').value, ''); assert.equal(h.$('tj-from').value, '0');
  assert.equal(h.$('tj-phrases').children[0].getAttribute('aria-pressed'), 'true');
});
test('Contrabaixo usa quatro cordas, estudo próprio e detector de graves sem alterar o perfil de seis cordas', async () => {
  const h = montar();
  const entradaSeisCordas = h.inputs[0];
  await h.event('tj-instrument', 'change', 'baixo');
  const entradaBaixo = h.inputs.at(-1);
  assert.notEqual(entradaBaixo, entradaSeisCordas);
  assert.ok(entradaSeisCordas.stopped >= 1);
  assert.deepEqual(entradaBaixo.callbacks.detector, { minHz: 35, maxHz: 700, frameMs: 128, windowMs: 128, stepMs: 48 });
  assert.equal(h.$('tj-study').value, 'baixo-pulsacao-v1');
  assert.deepEqual(h.$('tj-study').children.filter(option => option.value).map(option => option.value), ['baixo-pulsacao-v1']);
  assert.equal(h.$('tj-stage-profile').textContent, '4 CORDAS / AFINAÇÃO PADRÃO');
  assert.equal(h.$('tj-back').hidden, true);
  assert.match(h.$('tj-canvas').getAttribute('aria-label'), /contrabaixo/i);
  await h.advance(.02);
  const labels = h.$('tj-canvas').getContext().labels;
  assert.ok(labels.indexOf('4 · Mi grave') < labels.indexOf('3 · Lá'));
  assert.ok(labels.indexOf('3 · Lá') < labels.indexOf('2 · Ré'));
  assert.ok(labels.indexOf('2 · Ré') < labels.indexOf('1 · Sol'));
  await h.event('tj-connect', 'click');
  await h.event('tj-study-mode', 'change', 'learn');
  await h.event('tj-practice', 'click');
  await h.advance(.07);
  await h.event('tj-hear-note', 'click');
  await h.advance(.85);
  assert.equal(h.$('tj-skip').disabled, true, 'a janela de 128 ms ainda protege a cauda da referência');
  await h.advance(.02);
  assert.equal(h.$('tj-skip').disabled, false);
  await h.event('tj-stop', 'click');
  await h.event('tj-instrument', 'change', 'guitarra');
  assert.equal(h.$('tj-stage-profile').textContent, '6 CORDAS / AFINAÇÃO PADRÃO');
  assert.equal(h.$('tj-study').children.filter(option => option.value).length, 7);
  assert.deepEqual(h.inputs.at(-1).callbacks.detector, { minHz: 70, maxHz: 1400, frameMs: 64, windowMs: 64, stepMs: 24 });
});
test('Frases visuais e música inteira sincronizam intervalo, marca da pista e total de notas', async () => {
  const h = montar({ logado: true }), c = pequeno(); c.sections = [{ id: 'primeira', title: 'Primeira corda', from: 0, to: 1 }, { id: 'segunda', title: 'Segunda corda', from: 1, to: 2 }];
  await h.chart(c); const chips = h.$('tj-phrases').children;
  assert.equal(chips.length, 3); chips[2].click(); await h.settle();
  assert.equal(h.$('tj-section').value, '1'); assert.equal(h.$('tj-from').value, '1'); assert.equal(h.$('tj-to').value, '2');
  assert.equal(chips[2].getAttribute('aria-pressed'), 'true'); assert.equal(chips[0].getAttribute('aria-pressed'), 'false');
  assert.equal(h.$('tj-range-fill').style.left, '50%'); assert.equal(h.$('tj-range-fill').style.width, '50%');
  assert.match(h.$('tj-range-label').textContent, /Segunda corda · 1.00 s a 2.00 s/);
  await aprender(h); assert.match(h.$('tj-target').textContent, /Corda 5.*solta.*Lá2/);
  assert.equal(chips[0].disabled, true); await h.event('tj-skip', 'click');
  assert.equal(h.$('tj-misses').textContent, '1'); await h.event('tj-save', 'click');
  assert.equal(JSON.parse(h.requests.find(r => r.opts.method === 'POST').opts.body).total, 1);
  chips[0].click(); await h.settle(); assert.equal(h.$('tj-to').value, '2'); assert.equal(h.$('tj-from').value, '0');
  assert.equal(h.$('tj-range-fill').style.width, '100%'); assert.equal(h.$('tj-hits').textContent, '—');
  await h.event('tj-from', 'change', '0.5'); assert.equal(h.$('tj-section').value, 'custom');
  assert.ok(chips.every(b => b.getAttribute('aria-pressed') === 'false'));
});
test('Aprender espera o alvo sem contagem, metrônomo, guia automática ou áudio associado', async () => {
  for (const local of [false, true]) {
    const h = montar(); await h.chart(); await h.event('tj-connection-type', 'change', 'interface');
    const media = local ? await h.associatedAudio() : null; h.$('tj-guide').checked = true;
    await aprender(h); const position = h.$('tj-seek').value; await h.advance(8);
    assert.equal(h.oscillators.length, 0); if (media) assert.equal(media.plays, 0);
    assert.equal(h.$('tj-count').textContent, ''); assert.equal(h.$('tj-seek').value, position);
    assert.equal(h.$('tj-hits').textContent, '0'); assert.equal(h.$('tj-misses').textContent, '0');
    assert.equal(h.$('tj-accuracy-panel').hidden, true); assert.equal(h.$('tj-misses-label').textContent, 'PULADAS');
    for (const id of ['tj-metronome', 'tj-guide', 'tj-backing', 'tj-speed', 'tj-offset', 'tj-loop', 'tj-seek']) assert.equal(h.$(id).disabled, true, id);
    assert.match(h.$('tj-target').textContent, /Corda 6.*solta.*Mi2/); assert.equal(h.$('tj-target').getAttribute('aria-live'), 'polite');
  }
});
test('Aprender reconhece altura estável e passa ao próximo alvo, rejeitando baixa confiança, oitava e saturação', async () => {
  const h = montar(); await h.chart(); await aprender(h);
  await tocarNota(h, 52); await tocarNota(h, 40, { frame: { confidence: 0.4 } }); await tocarNota(h, 40, { frame: { clipped: 0.2 } });
  assert.equal(h.$('tj-hits').textContent, '0'); await tocarNota(h, 40);
  assert.equal(h.$('tj-hits').textContent, '1'); assert.match(h.$('tj-target').textContent, /Corda 5.*Lá2/);
  assert.equal(h.$('tj-seek').value, '1'); assert.equal(h.$('tj-save').disabled, true);
  await tocarNota(h, 45); assert.equal(h.$('tj-hits').textContent, '2'); assert.match(h.$('tj-target').textContent, /concluído/);
  assert.equal(h.$('tj-demo').disabled, false); assert.equal(h.$('tj-save').disabled, true, 'Visitante não salva.');
});
test('Ouvir nota bloqueia guia, cauda e sustain; só ataque novo pode reconhecer depois', async () => {
  const h = montar(); await h.chart(); await aprender(h); await h.event('tj-hear-note', 'click');
  assert.equal(h.oscillators.length, 1); assert.equal(h.$('tj-hear-note').disabled, true); assert.equal(h.$('tj-skip').disabled, true);
  await tocarNota(h, 40); await h.event('tj-hear-note', 'click'); assert.equal(h.oscillators.length, 1);
  await h.advance(0.73); await tocarNota(h, 40, { onset: false });
  assert.equal(h.$('tj-hits').textContent, '0'); assert.equal(h.$('tj-hear-note').disabled, false);
  await tocarNota(h, 40); assert.equal(h.$('tj-hits').textContent, '1');
});
test('Pausa durante a referência preserva bloqueio da cauda ao continuar', async () => {
  const h = montar(); await h.chart(); await aprender(h); await h.event('tj-hear-note', 'click');
  await h.advance(0.1); await h.event('tj-pause', 'click'); await h.advance(0.1); await h.event('tj-pause', 'click');
  await tocarNota(h, 40); assert.equal(h.$('tj-hits').textContent, '0'); assert.equal(h.$('tj-hear-note').disabled, true);
  await h.advance(0.6); await tocarNota(h, 40, { onset: false }); assert.equal(h.$('tj-hits').textContent, '0');
  await tocarNota(h, 40); assert.equal(h.$('tj-hits').textContent, '1');
});
test('Parar ou trocar frase durante a guia preserva bloqueio ao começar outra rodada', async () => {
  for (const action of ['stop', 'section']) {
    const h = montar(), c = pequeno(); c.sections = [{ id: 'primeira', title: 'Primeira', from: 0, to: 1 }];
    await h.chart(c); await aprender(h); await h.event('tj-hear-note', 'click'); await h.advance(0.06);
    await h.event('tj-stop', 'click'); if (action === 'section') await h.event('tj-section', 'change', '0');
    await h.event('tj-practice', 'click'); await tocarNota(h, 40); assert.equal(h.$('tj-hits').textContent, '0');
    await h.advance(0.7); await tocarNota(h, 40, { onset: false }); assert.equal(h.$('tj-hits').textContent, '0');
    await tocarNota(h, 40); assert.equal(h.$('tj-hits').textContent, '1');
  }
});
test('Cauda da demonstração sintetizada ou local não vira acerto ao iniciar aprender', async () => {
  for (const local of [false, true]) {
    const h = montar(); await h.chart(); if (local) await h.associatedAudio(); await h.event('tj-connect', 'click');
    await h.event('tj-demo', 'click'); await h.advance(2.06); await h.event('tj-stop', 'click');
    await h.event('tj-study-mode', 'change', 'learn'); await h.event('tj-practice', 'click'); await tocarNota(h, 40);
    assert.equal(h.$('tj-hits').textContent, '0'); await h.advance(0.4); await tocarNota(h, 40, { onset: false });
    assert.equal(h.$('tj-hits').textContent, '0'); await tocarNota(h, 40); assert.equal(h.$('tj-hits').textContent, '1');
  }
});
test('Cauda atravessa mudança de contexto só pelo tempo restante e expira com contexto antigo fechado', async () => {
  for (const [local, delay] of [[false, 0], [true, 0], [false, 2], [true, 2]]) {
    const h = montar(); await h.chart(); if (local) await h.associatedAudio();
    await h.event('tj-demo', 'click'); await h.advance(2.06); await h.event('tj-pause', 'click');
    const demoContext = h.contexts[0]; demoContext.close();
    await h.advance(delay); await h.event('tj-connect', 'click');
    assert.notEqual(h.inputs[0].currentContext, demoContext);
    await h.event('tj-study-mode', 'change', 'learn'); await h.event('tj-practice', 'click'); await h.advance(0.04);
    await tocarNota(h, 40);
    assert.equal(h.$('tj-hits').textContent, delay ? '1' : '0', 'Local=' + local + ', espera=' + delay);
    if (!delay) {
      await h.advance(0.4); await tocarNota(h, 40, { onset: false }); assert.equal(h.$('tj-hits').textContent, '0');
      await tocarNota(h, 40); assert.equal(h.$('tj-hits').textContent, '1');
    }
  }
});
test('Pausa ignora frames; retomar rejeita frames antigos e exige nova entrada sem perder contagem', async () => {
  const h = montar(); await h.chart(); await aprender(h); await tocarNota(h, 40);
  await h.event('tj-pause', 'click'); const oldTime = h.inputs[0].currentContext.currentTime;
  await tocarNota(h, 45); assert.equal(h.$('tj-hits').textContent, '1'); await h.advance(2);
  await h.event('tj-pause', 'click'); h.inputs[0].frame({ audioTime: oldTime, hz: 110, onset: true });
  await h.advance(0.04); await tocarNota(h, 45, { onset: false }); assert.equal(h.$('tj-hits').textContent, '1');
  await tocarNota(h, 45); assert.equal(h.$('tj-hits').textContent, '2');
});
test('Notas repetidas exigem novo ataque e pular conta separadamente sem acerto automático', async () => {
  const h = montar({ logado: true }), c = pequeno(); c.notes[1] = { ...c.notes[1], string: 6, midi: 40 };
  await h.chart(c); await aprender(h); await tocarNota(h, 40);
  await tocarNota(h, 40, { onset: false }); assert.equal(h.$('tj-hits').textContent, '1');
  await h.event('tj-skip', 'click'); assert.equal(h.$('tj-hits').textContent, '1'); assert.equal(h.$('tj-misses').textContent, '1');
  assert.match(h.$('tj-score-label').textContent, /2 de 2 notas · sem avaliação de ritmo/);
  assert.equal(h.$('tj-save').disabled, false); assert.equal(h.$('tj-skip').disabled, true);
});
test('Resumo aprender é fechado, completo, sem precisão e mede tempo ativo excluindo pausa', async () => {
  const h = montar({ logado: true }); await h.chart(); await aprender(h);
  await tocarNota(h, 40); await h.advance(0.5); await h.event('tj-pause', 'click');
  await h.advance(30); await h.event('tj-pause', 'click'); await h.advance(0.5); await h.event('tj-skip', 'click');
  await h.event('tj-save', 'click'); await h.event('tj-save', 'click');
  const posts = h.requests.filter(r => r.opts.method === 'POST'); assert.equal(posts.length, 1);
  const payload = JSON.parse(posts[0].opts.body);
  assert.deepEqual(Object.keys(payload).sort(), ['chartId', 'duration', 'hits', 'mode', 'skipped', 'title', 'total']);
  assert.equal(payload.mode, 'learn'); assert.equal(payload.total, 2); assert.equal(payload.hits, 1); assert.equal(payload.skipped, 1);
  assert.ok(payload.duration >= 1.1 && payload.duration < 1.3, 'Tempo ativo real: ' + payload.duration);
});
test('Uma nota pulada imediatamente ainda produz duração aceita pelo contrato do servidor', async () => {
  const h = montar({ logado: true }), c = pequeno(); c.notes = c.notes.slice(0, 1);
  await h.chart(c); await aprender(h); await h.event('tj-skip', 'click');
  assert.equal(h.$('tj-save').disabled, false);
  await h.event('tj-save', 'click');
  const payload = JSON.parse(h.requests.find(r => r.opts.method === 'POST').opts.body);
  assert.equal(payload.total, 1); assert.equal(payload.hits, 0); assert.equal(payload.skipped, 1);
  assert.equal(payload.duration, 0.1); assert.equal(payload.mode, 'learn');
});
test('Reconexão recria o motor aprender para o novo relógio, sem reutilizar acertos', async () => {
  const h = montar(); await h.chart(); await aprender(h); await tocarNota(h, 40); const oldContext = h.inputs[0].currentContext;
  h.inputs[0].desconectar(); await h.settle(); assert.equal(h.$('tj-practice').disabled, true);
  await h.event('tj-connect', 'click'); await h.event('tj-pause', 'click');
  assert.notEqual(h.inputs[0].currentContext, oldContext); assert.equal(h.$('tj-hits').textContent, '0');
  assert.match(h.$('tj-target').textContent, /Corda 6/); await h.advance(0.04); await tocarNota(h, 40);
  assert.equal(h.$('tj-hits').textContent, '1');
});
test('Trocar ganho ou estudo durante pausa descarta a rodada aprender e áudio de outro estudo', async () => {
  for (const change of ['gain', 'study']) {
    const h = montar({ logado: true }); await h.chart(); const media = await h.associatedAudio(); await aprender(h); await tocarNota(h, 40);
    await h.event('tj-pause', 'click'); await h.event(change === 'gain' ? 'tj-gain' : 'tj-study', change === 'gain' ? 'input' : 'change', change === 'gain' ? '12' : 'cordas-soltas-v1');
    assert.equal(h.$('tj-hits').textContent, '—'); assert.equal(h.$('tj-save').disabled, true); assert.equal(h.$('tj-pause').disabled, true);
    if (change === 'study') { assert.equal(media.src, ''); assert.equal(h.$('tj-section').value, ''); }
  }
});
test('Trecho sem notas desabilita começar e guardar; demonstração continua disponível', async () => {
  const h = montar({ logado: true }), c = pequeno(); c.sections = [{ id: 'vazio', title: 'Intervalo', from: 0.4, to: 0.9 }];
  await h.chart(c); await h.event('tj-section', 'change', '0'); await h.event('tj-study-mode', 'change', 'learn'); await h.event('tj-connect', 'click');
  assert.equal(h.$('tj-practice').disabled, true); assert.equal(h.$('tj-save').disabled, true); assert.equal(h.$('tj-demo').disabled, false);
  await h.event('tj-section', 'change', ''); assert.equal(h.$('tj-practice').disabled, false);
});
test('Demonstração permanece audível ao selecionar aprender e não mistura resultados', async () => {
  const h = montar(); await h.chart(); await h.event('tj-study-mode', 'change', 'learn');
  await h.event('tj-demo', 'click'); await h.advance(2.3);
  assert.ok(h.oscillators.length > 4); assert.equal(h.$('tj-learn-panel').hidden, true); assert.equal(h.$('tj-hits').textContent, '—');
  await h.event('tj-stop', 'click'); assert.equal(h.$('tj-learn-panel').hidden, false);
});
test('Aprender completo não repete sozinho mesmo que loop do ritmo esteja marcado', async () => {
  const h = montar(); await h.chart(); h.$('tj-loop').checked = true; await h.event('tj-loop', 'change'); await aprender(h);
  await h.event('tj-skip', 'click'); await h.advance(0.04); await h.event('tj-skip', 'click'); await h.advance(4);
  assert.equal(h.$('tj-misses').textContent, '2'); assert.equal(h.$('tj-demo').disabled, false); assert.equal(h.oscillators.length, 0);
});
test('Aprender limita a rodada a duas horas e reinicia ao continuar após o limite', async () => {
  const h = montar(); await h.chart(); await aprender(h); await tocarNota(h, 40);
  h.inputs[0].currentContext.currentTime = 7200.01; h.inputs[0].frame({ hz: 110, onset: true });
  assert.match(h.$('tj-status').textContent, /duas horas/); assert.equal(h.$('tj-save').disabled, true);
  assert.equal(h.$('tj-demo').disabled, false); await h.event('tj-pause', 'click');
  assert.equal(h.$('tj-hits').textContent, '0'); assert.match(h.$('tj-target').textContent, /Corda 6/);
});
test('Histórico distingue aprender do ritmo sem inventar porcentagem de precisão', async () => {
  const h = montar({ logado: true, history: [{ title: 'Aprender', mode: 'learn', hits: 3, skipped: 2, createdAt: '2026-10-15T12:00:00Z' }, { title: 'No ritmo', mode: 'practice', accuracy: 80, createdAt: '2026-10-15T12:00:00Z' }] });
  await h.settle(); const list = h.$('tj-history');
  assert.match(list.children[0].textContent, /3 reconhecidas · 2 puladas/); assert.doesNotMatch(list.children[0].textContent, /%|NaN/);
  assert.match(list.children[1].textContent, /80%/);
});

function resposta(data, status = 200) { return {ok:status>=200&&status<300,status,json:async()=>data}; }
function documento(c = pequeno(), mediaId = '', mediaOffsetMs) { const d={title:c.title,instrument:'violao',level:'iniciante',technique:'notas-isoladas',objective:'Praticar duas notas',credits:'Estudo de teste',mediaId,chart:c};if(mediaId&&mediaOffsetMs!==undefined)d.mediaOffsetMs=mediaOffsetMs;return d; }
function itemCatalogo(id = 'arranjo-a', versionId = 'versao-1') { return {id,versionId,versionNumber:1,title:'Duas cordas',obra:{id:'obra-a',titulo:'Obra própria',artista:'Autor'},instrument:'violao',level:'iniciante',technique:'notas-isoladas',objective:'Praticar duas notas',credits:'Estudo de teste',hasAudio:false}; }
function fetchCatalogo(extra) {
  return async(url,opts)=> {
    const overridden=extra&&await extra(url,opts); if(overridden)return overridden;
    if(url.includes('/catalogo?'))return resposta({arranjos:[itemCatalogo()],total:1});
    if(url.includes('/catalogo/arranjo-a/versoes/versao-1'))return resposta({arranjo:itemCatalogo(),documento:documento()});
    return resposta({sessoes:[]});
  };
}
async function abrirPrimeiro(h) { await h.settle(); const button=h.$('tc-results').children[0].children.at(-1); await Promise.all(button.click());await h.settle(); }

test('Catálogo: filtros usam parâmetros, falha de acesso mantém estudos e demonstração',async()=>{
  const h=montar({logado:true,fetch:fetchCatalogo((url)=>url.includes('q=')?resposta({erro:'Assinatura necessária'},402):null)});await h.settle();
  await h.event('tc-q','input','mi & lá');await h.event('tc-instrument','change','violao');await h.event('tc-search','click');
  const req=h.requests.find(r=>r.url.includes('q='));const params=new URL(req.url,'https://local.test').searchParams;
  assert.equal(params.get('q'),'mi & lá');assert.equal(params.get('instrument'),'violao');assert.match(h.$('tc-status').textContent,/assinatura ativa/);
  assert.equal(h.$('tc-results').children[0].children[0].getAttribute('href'),'/music/app#conta');
  await h.event('tj-demo','click');await h.advance(0.1);assert.ok(h.oscillators.length);assert.equal(h.inputs[0].calls.length,0);
});
test('Catálogo com sessão expirada oferece entrar mantendo estudos abertos',async()=>{
  const h=montar({logado:true,fetch:async()=>resposta({erro:'Sessão expirada'},401)});await h.settle();assert.match(h.$('tc-status').textContent,/Entre na sua conta/);assert.equal(h.$('tc-results').children[0].children[0].getAttribute('href'),'/music/entrar?voltar=%2Fmusic%2Ftocar');assert.equal(h.$('tj-demo').disabled,false);
});
test('Catálogo usa versão fixa, trata texto sem HTML e não confunde ID do estudo com origem',async()=>{
  const c=Core.demoChart(),item=itemCatalogo();item.title='<img onerror=alert(1)>';
  const h=montar({logado:true,fetch:fetchCatalogo(url=>url.includes('/catalogo?')?resposta({arranjos:[item],total:1}):url.includes('/versoes/')?resposta({arranjo:itemCatalogo(),documento:documento(c)}):null)});
  await abrirPrimeiro(h);assert.equal(h.$('tc-results').children[0].children[0].children.length,0);
  assert.equal(h.$('tj-study').value,'');assert.match(h.$('tj-source').textContent,/Catálogo · versão 1/);
  assert.ok(h.requests.some(r=>r.url.endsWith('/catalogo/arranjo-a/versoes/versao-1')));
  assert.equal(h.$('tj-audio-file').disabled,true);assert.equal(h.inputs[0].calls.length,0);
  await h.event('tj-demo','click');await h.advance(5);assert.ok(h.oscillators.some(o=>o.frequency.value<200));
});
test('Aprender em versão publicada guarda referência e intervalo, e trocar para estudo remove referência',async()=>{
  const h=montar({logado:true,fetch:fetchCatalogo()});await abrirPrimeiro(h);await aprender(h);
  await h.event('tj-skip','click');await h.advance(0.04);await h.event('tj-skip','click');await h.event('tj-save','click');
  let payload=JSON.parse(h.requests.filter(r=>r.opts.method==='POST').at(-1).opts.body);
  assert.deepEqual(payload.catalogRef,{arranjoId:'arranjo-a',versionId:'versao-1',from:0,to:2});assert.equal(payload.mode,'learn');
  await h.event('tj-study','change','cordas-soltas-v1');assert.equal(h.$('tj-study').value,'cordas-soltas-v1');
  await h.chart();await aprender(h);await h.event('tj-skip','click');await h.advance(.04);await h.event('tj-skip','click');await h.event('tj-save','click');
  payload=JSON.parse(h.requests.filter(r=>r.opts.method==='POST').at(-1).opts.body);assert.equal(payload.catalogRef,undefined);
});
test('No ritmo em catálogo mantém resumo antigo com referência adicional de versão',async()=>{
  const h=montar({logado:true,fetch:fetchCatalogo()});await abrirPrimeiro(h);await h.event('tj-connect','click');await h.event('tj-practice','click');await h.advance(4.6);await h.event('tj-save','click');
  const payload=JSON.parse(h.requests.find(r=>r.opts.method==='POST').opts.body);assert.equal(payload.mode,'practice');assert.equal(payload.misses,2);assert.equal(payload.catalogRef.versionId,'versao-1');
});
test('Resposta de catálogo atrasada não substitui estudo escolhido nem importação local',async()=>{
  for(const kind of ['study','local']) {
    let release;const h=montar({logado:true,fetch:fetchCatalogo(url=>url.includes('/versoes/')?new Promise(r=>{release=r;}):null)});await h.settle();
    const pending=h.$('tc-results').children[0].children.at(-1).click();await h.settle();
    if(kind==='study')await h.event('tj-study','change','cordas-soltas-v1');else await h.chart();
    const title=h.$('tj-song-title').textContent;release(resposta({arranjo:itemCatalogo(),documento:documento()}));await Promise.all(pending);await h.settle();
    assert.equal(h.$('tj-song-title').textContent,title);assert.doesNotMatch(h.$('tj-source').textContent,/Catálogo/);assert.equal(h.$('tj-demo').disabled,false);
  }
});
test('Duas escolhas de catálogo respeitam a mais recente mesmo se a primeira terminar depois',async()=>{
  let release;const b=itemCatalogo('arranjo-b','versao-b'),docb=documento();docb.title=docb.chart.title='Segundo arranjo';
  const h=montar({logado:true,fetch:fetchCatalogo(url=>url.includes('/catalogo?')?resposta({arranjos:[itemCatalogo(),b],total:2}):url.includes('/arranjo-a/versoes')?new Promise(r=>{release=r;}):url.includes('/arranjo-b/versoes')?resposta({arranjo:b,documento:docb}):null)});await h.settle();
  const pending=h.$('tc-results').children[0].children.at(-1).click();await h.settle();await Promise.all(h.$('tc-results').children[1].children.at(-1).click());
  release(resposta({arranjo:itemCatalogo(),documento:documento()}));await Promise.all(pending);assert.equal(h.$('tj-song-title').textContent,'Segundo arranjo');
});
test('Lista de busca descarta resposta antiga e bloqueia abrir durante rodada',async()=>{
  let release;const h=montar({logado:true,fetch:fetchCatalogo(url=>url.includes('/catalogo?')&&!url.includes('q=')?new Promise(r=>{release=r;}):null)});await h.settle();
  await h.event('tc-q','input','nova');await h.event('tc-search','click');release(resposta({arranjos:[],total:0}));await h.settle();
  assert.equal(h.$('tc-results').children.length,1);await h.event('tj-demo','click');await h.settle();assert.equal(h.$('tc-results').children[0].children.at(-1).disabled,true);
});
test('Mídia remota atrasada não volta após mudar para um estudo',async()=>{
  let release;const h=montar({logado:true,fetch:fetchCatalogo(url=>url.endsWith('/audio')?new Promise(r=>{release=r;}):url.includes('/versoes/')?resposta({arranjo:itemCatalogo(),documento:documento(pequeno(),'audio-a')}):null)});await h.settle();
  const pending=h.$('tc-results').children[0].children.at(-1).click();await h.settle();await h.event('tj-study','change','cordas-soltas-v1');
  release(resposta({url:'https://audio.example.test/temporario',mime:'audio/mpeg',expiresIn:600}));await Promise.all(pending);assert.equal(h.medias.length,0);assert.equal(h.$('tj-remote-audio').hidden,true);
});
test('Mídia remota usa deslocamento do documento sem alterar a compensação de captura',async()=>{
  const d=documento(pequeno(),'audio-a',1500);
  const h=montar({logado:true,fetch:fetchCatalogo(url=>url.endsWith('/audio')?resposta({url:'https://audio.example.test/deslocada',mime:'audio/mpeg',expiresIn:600}):url.includes('/versoes/')?resposta({arranjo:itemCatalogo(),documento:d}):null)});
  await abrirPrimeiro(h);const media=h.medias[0];media.duration=3.5;media.onloadedmetadata();
  await h.event('tj-offset','change','300');await h.event('tj-demo','click');await h.advance(2.05);
  assert.ok(media.currentTime>=1.5&&media.currentTime<1.7,'a mídia começa no ponto lógico mais o deslocamento');
  await h.event('tj-seek','input','1');assert.equal(media.currentTime,2.5);
  await h.event('tj-pause','click');await h.advance(.06);assert.ok(media.currentTime>=2.5&&media.currentTime<2.7);
});
test('Prévia do rascunho usa o mesmo deslocamento de mídia',async()=>{
  const d=documento(pequeno(),'audio-a',1500);
  const h=montar({logado:true,search:'?previa=arranjo-a&revisao=3',fetch:async url=>url.endsWith('/audio?revision=3')?resposta({url:'https://audio.example.test/previa-deslocada',mime:'audio/mpeg',expiresIn:600}):resposta({arranjo:{id:'arranjo-a',revision:3,documento:d}})});
  await h.settle();await h.settle();await h.settle();const media=h.medias[0];assert.ok(media,'prévia sem mídia: '+h.$('tj-status').textContent+'; '+h.requests.map(r=>r.url).join(', '));media.duration=3.5;media.onloadedmetadata();await h.event('tj-demo','click');await h.advance(2.05);
  assert.ok(media.currentTime>=1.5&&media.currentTime<1.7,'a prévia inicia a faixa no ponto alinhado ao arranjo');
  await h.event('tj-seek','input','1');assert.equal(media.currentTime,2.5);
});
test('Mídia remota exige duração que cubra arranjo e deslocamento',async()=>{
  for(const [duration,aceita] of [[3.39,false],[3.4,true]]){
    const d=documento(pequeno(),'audio-a',1500);
    const h=montar({logado:true,fetch:fetchCatalogo(url=>url.endsWith('/audio')?resposta({url:'https://audio.example.test/duracao-'+duration,mime:'audio/mpeg',expiresIn:600}):url.includes('/versoes/')?resposta({arranjo:itemCatalogo(),documento:d}):null)});
    await abrirPrimeiro(h);const media=h.medias[0];media.duration=duration;media.onloadedmetadata();
    assert.equal(media.src !== '',aceita,String(duration));
    if(!aceita)assert.match(h.$('tj-status').textContent,/mais curto que o arranjo e seu alinhamento/);
  }
});
test('Erro da faixa mostra recuperação; URL temporária é renovada sem gravar ou revogar URL remota',async()=>{
  let count=0;const h=montar({logado:true,fetch:fetchCatalogo(url=>url.endsWith('/audio')?resposta({url:'https://audio.example.test/'+(++count),mime:'audio/mpeg',expiresIn:600}):url.includes('/versoes/')?resposta({arranjo:itemCatalogo(),documento:documento(pequeno(),'audio-a')}):null)});
  await abrirPrimeiro(h);const old=h.medias[0];old.onerror();assert.match(h.$('tj-status').textContent,/Recarregue o áudio/);await h.event('tj-remote-audio','click');
  assert.equal(count,2);assert.equal(h.medias.at(-1).src,'https://audio.example.test/2');assert.equal(h.revoked.length,0);
});
test('Recarregar faixa bloqueia iniciar e continuar enquanto pendente e preserva velocidade',async()=>{
  let count=0,release;const h=montar({logado:true,fetch:fetchCatalogo(url=>url.endsWith('/audio')?(++count===1?resposta({url:'https://audio.example.test/1',mime:'audio/mpeg',expiresIn:600}):new Promise(r=>{release=r;})):url.includes('/versoes/')?resposta({arranjo:itemCatalogo(),documento:documento(pequeno(),'audio-a')}):null)});
  await abrirPrimeiro(h);await h.event('tj-speed','change','.5');const pending=h.$('tj-remote-audio').click();await h.settle();
  assert.equal(h.$('tj-demo').disabled,true);assert.equal(h.$('tj-practice').disabled,true);assert.equal(h.$('tj-pause').disabled,true);await h.event('tj-demo','click');assert.equal(h.$('tj-mode').textContent,'PRONTO PARA TOCAR');
  release(resposta({url:'https://audio.example.test/2',mime:'audio/mpeg',expiresIn:600}));await Promise.all(pending);await h.settle();assert.equal(h.medias.at(-1).playbackRate,.5);assert.equal(h.$('tj-demo').disabled,false);
});
test('Prévia correta é só demonstração, sem criar entrada, enumerar, praticar ou guardar',async()=>{
  const h=montar({logado:true,search:'?previa=arranjo-a&revisao=3',fetch:async()=>resposta({arranjo:{id:'arranjo-a',revision:3,documento:documento()}})});await h.settle();
  assert.equal(h.inputs.length,0);assert.equal(h.$('tj-demo').disabled,false);assert.equal(h.$('tj-connect').disabled,true);assert.equal(h.$('tj-practice').disabled,true);assert.equal(h.$('tj-save').disabled,true);
  assert.equal(h.$('tj-chart-file').disabled,true);assert.equal(h.$('tj-catalog').hidden,true);assert.match(h.$('tj-source').textContent,/revisão 3/);
  await h.event('tj-demo','click');await h.advance(2.3);assert.ok(h.oscillators.length);assert.equal(h.requests.filter(r=>r.url.includes('/sessoes')).length,0);assert.equal(h.inputs.length,0);
});
test('Saída durante recarga pendente invalida mídia e libera controles para volta à página',async()=>{
  let count=0,release;const h=montar({logado:true,fetch:fetchCatalogo(url=>url.endsWith('/audio')?(++count===1?resposta({url:'https://audio.example.test/1',mime:'audio/mpeg',expiresIn:600}):new Promise(r=>{release=r;})):url.includes('/versoes/')?resposta({arranjo:itemCatalogo(),documento:documento(pequeno(),'audio-a')}):null)});
  await abrirPrimeiro(h);const pending=h.$('tj-remote-audio').click();await h.settle();assert.equal(h.$('tj-demo').disabled,true);h.window.dispatch('pagehide');
  release(resposta({url:'https://audio.example.test/2',mime:'audio/mpeg',expiresIn:600}));await Promise.all(pending);await h.settle();assert.equal(h.$('tj-demo').disabled,false);assert.equal(h.$('tj-remote-audio').disabled,false);assert.equal(h.medias.length,1);
});
test('Prévia inválida ou desatualizada falha fechada sem demonstração do estudo anterior',async()=>{
  for(const search of ['?previa=arranjo-a&revisao=2','?previa=arranjo-a&revisao=abc']){
    const h=montar({logado:true,search,fetch:async()=>resposta({arranjo:{id:'arranjo-a',revision:3,documento:documento()}})});await h.settle();
    assert.equal(h.$('tj-demo').disabled,true);assert.equal(h.$('tj-connect').disabled,true);assert.equal(h.inputs.length,0);assert.match(h.$('tj-status').textContent,/rascunho mudou|inválido/);
  }
});
test('Resposta de guardar antiga não marca uma nova rodada como guardada',async()=>{
  let release;const h=montar({logado:true,fetch:fetchCatalogo((url,opts)=>opts.method==='POST'?new Promise(r=>{release=r;}):null)});await h.chart();await aprender(h);
  await h.event('tj-skip','click');await h.advance(.04);await h.event('tj-skip','click');const pending=h.$('tj-save').click();await h.settle();
  await h.chart();await aprender(h);await h.event('tj-skip','click');await h.advance(.04);await h.event('tj-skip','click');release(resposta({ok:true}));await Promise.all(pending);await h.settle();
  assert.equal(h.$('tj-save').disabled,false);assert.doesNotMatch(h.$('tj-status').textContent,/Resultado guardado/);
});
test('Histórico do catálogo mostra versão e preserva sessões legadas',async()=>{
  const h=montar({logado:true,history:[{title:'Estudo',mode:'learn',hits:2,skipped:0,createdAt:'2026-10-15',catalogRef:{versionNumber:4}},{title:'Local',accuracy:80,createdAt:'2026-10-15'}]});await h.settle();
  assert.match(h.$('tj-history').children[0].textContent,/versão 4/);assert.doesNotMatch(h.$('tj-history').children[1].textContent,/versão/);
});

test('Piano mostra 88 teclas, tabela com duração e animação que respeita pausa e busca', async () => {
  const h = montar();
  await h.event('tj-study-mode', 'change', 'learn');
  await h.event('tj-instrument', 'change', 'piano');
  assert.equal(h.$('tocar-app').getAttribute('data-layout'), 'piano');
  assert.match(h.$('tj-stage-profile').textContent, /88 TECLAS/);
  assert.equal(h.$('tj-study-mode').value, 'practice');
  assert.equal(h.$('tj-study-mode').children[1].disabled, true);
  assert.equal(h.$('tj-table-third').textContent, 'Duração');
  assert.doesNotMatch(h.$('tj-notes').textContent, /undefined/);
  assert.doesNotMatch(h.$('tj-table-note').textContent, /corda/i);
  const frames = [], desenhar = h.window.MusiqueTocarPiano.desenhar;
  h.window.MusiqueTocarPiano.desenhar = (g, o) => { frames.push(o.position); return desenhar(g, o); };
  await h.event('tj-demo', 'click'); await h.advance(.2);
  assert.ok(frames.at(-1) > frames[0], 'Demonstração avança pelo relógio');
  assert.match(h.$('tj-status').textContent, /teclas/);
  await h.event('tj-pause', 'click'); const pausado = frames.at(-1);
  await h.advance(.2); assert.equal(frames.at(-1), pausado);
  await h.event('tj-seek', 'input', '8'); await h.advance(.02);
  assert.equal(frames.at(-1), 8);
  await h.event('tj-stop', 'click');
  await h.event('tj-instrument', 'change', 'violao');
  assert.equal(h.$('tj-study-mode').children[1].disabled, false);
  assert.equal(h.$('tj-table-third').textContent, 'Corda');
  assert.equal(h.$('tj-stage').getAttribute('data-layout'), 'fretboard');
});

test('Bateria usa o desenho vertical do kit e não pede hardware para demonstração', async () => {
  const h = montar(); await h.event('tj-instrument', 'change', 'bateria');
  const frames = [], desenhar = h.window.MusiqueTocarBateria.desenhar;
  h.window.MusiqueTocarBateria.desenhar = (g, o) => { frames.push(o.position); return desenhar(g, o); };
  assert.match(h.$('tj-stage-help').textContent, /Crash e ride/);
  assert.match(h.$('tj-stage-profile').textContent, /VERTICAIS/);
  assert.equal(h.$('tj-table-fourth').textContent, 'Intensidade MIDI');
  assert.match(h.$('tj-notes').textContent, /Chimbal fechado/);
  assert.equal(h.$('tj-gain').disabled, true);
  await h.event('tj-demo', 'click'); await h.advance(.15);
  assert.ok(frames.at(-1) > frames[0]);
  assert.equal(h.inputs.flatMap(i => i.calls).length, 0);
  assert.match(h.$('tj-status').textContent, /peças da bateria/);
});

module.exports = { montar, pequeno, resposta, documento };
if (require.main === module) (async () => {
  let failures = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('OK', t.name); }
    catch (e) { failures++; console.error('FALHOU', t.name, '\n ', e.stack); }
  }
  console.log(`${tests.length - failures}/${tests.length} verificações de integração passaram (DOM/hardware simulados).`);
  if (failures) process.exitCode = 1;
})();
