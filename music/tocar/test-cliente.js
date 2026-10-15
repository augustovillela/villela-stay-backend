'use strict';
// Integração de cliente.js + núcleo real, com DOM, relógios e hardware simulados.
// Não substitui teste visual/acessível nem uma guitarra real no navegador.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('./nucleo');

class Eventos {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== fn)); }
  dispatch(type) { return (this.listeners.get(type) || []).map(fn => fn.call(this, { type, target: this, preventDefault() {} })); }
}
class Elemento extends Eventos {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.doc = doc; this.attributes = {}; this.children = [];
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
    if (!this.context) this.context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, { get: (t, k) => k in t ? t[k] : (() => {}) });
    return this.context;
  }
}
function montar(options = {}) {
  const document = new Eventos(); document.ids = new Map(); document.hidden = false;
  document.createElement = tag => new Elemento(tag, document);
  document.createTextNode = text => ({ textContent: String(text) });
  document.getElementById = id => document.ids.get(id) || null;
  const app = document.createElement('main'); app.setAttribute('id', 'tocar-app'); app.setAttribute('data-estado', JSON.stringify({ logado: !!options.logado }));
  let now = 0, sequence = 0;
  const rafs = new Map(), timers = new Map(), contexts = [], oscillators = [], medias = [], requests = [], inputs = [], revoked = [];
  let audioFailure = options.audioFailure || null, pendingPlay = false;
  class Contexto {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createOscillator() {
      const ctx = this;
      const o = { ctx, frequency: { value: 0 }, connect() {}, disconnect() {}, start(t) { this.when = t; }, stop(t) { this.stopAt = t ?? ctx.currentTime; } };
      oscillators.push(o); return o;
    }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
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
    const i = { callbacks, calls: [], enumerations: 0, stopped: 0, currentContext: null, status: { estado: 'parado' },
      async dispositivos() {
        this.enumerations++;
        return options.enumerate ? options.enumerate(this, devices()) : devices();
      },
      async iniciar(id) {
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
    if (options.fetchFailure) throw new Error('Offline');
    if (opts.method === 'POST') {
      if (options.saveFailure) return { ok: false, json: async () => ({ erro: 'Não foi possível guardar agora.' }) };
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ sessoes: options.history || [] }) };
  }
  const window = new Eventos();
  Object.assign(window, { devicePixelRatio: 1, AudioContext: Contexto, Audio: Media, MusiqueTocarCore: Core, MusiqueTocarAudio: audio });
  const sandbox = { window, document, console, fetch, Blob, URL: { createObjectURL: () => 'blob:local-test-' + (++sequence), revokeObjectURL: url => revoked.push(url) },
    requestAnimationFrame: fn => { const id = ++sequence; rafs.set(id, fn); return id; }, cancelAnimationFrame: id => rafs.delete(id),
    setTimeout: (fn, ms) => { const id = ++sequence; timers.set(id, { at: now + ms / 1000, fn }); return id; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'cliente.js'), 'utf8'), sandbox, { filename: 'cliente.js' });
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
  return { $, window, document, contexts, oscillators, medias, requests, inputs, revoked, event, settle, advance, chart, associatedAudio,
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
  assert.equal(list.children[0].children.length, 0); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].opts.credentials, 'same-origin');
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

(async () => {
  let failures = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('OK', t.name); }
    catch (e) { failures++; console.error('FALHOU', t.name, '\n ', e.stack); }
  }
  console.log(`${tests.length - failures}/${tests.length} verificações de integração passaram (DOM/hardware simulados).`);
  if (failures) process.exitCode = 1;
})();
