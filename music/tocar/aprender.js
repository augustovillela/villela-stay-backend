// Aprendizagem monofônica sem prazo: usa o relógio da captura, não o da música.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nucleo'));
  else root.MusiqueTocarAprender = factory(root.MusiqueTocarCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';
  var EPS = 1e-7, MAX_INTERVALO = 0.075, SILENCIO = 0.03;
  function numero(v) { return typeof v === 'number' && Number.isFinite(v); }
  function objeto(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function copia(v) { return Object.assign({}, v); }
  function exigir(ok, mensagem) { if (!ok) throw new Error(mensagem); }
  function tempo(v) { return numero(v) && v >= 0; }

  function criar(input, options) {
    exigir(Core && typeof Core.validarChart === 'function', 'O núcleo de arranjos precisa estar carregado.');
    var chart = Core.validarChart(input), o = options === undefined ? {} : options;
    exigir(objeto(o), 'As opções de aprendizagem devem ser um objeto.');
    function opt(chave, padrao, min, max) {
      var valor = o[chave] === undefined ? padrao : o[chave];
      exigir(numero(valor) && valor >= min && valor <= max, chave + ' deve estar entre ' + min + ' e ' + max + '.');
      return valor;
    }
    var from = opt('from', 0, 0, chart.duration), to = opt('to', chart.duration, 0, chart.duration);
    exigir(to > from, 'O fim da aprendizagem deve vir depois do início.');
    var stable = opt('stableMs', 60, 20, 1000) / 1000;
    var minConfidence = opt('minConfidence', 0.7, 0, 1);
    var minRms = opt('minRms', 0.003, 0.000001, 1);
    var centsTolerance = opt('centsTolerance', 45, 1, 50);
    var meiaJanela = opt('windowMs', 64, 35, 250) / 2000;
    var gate = opt('now', 0, 0, Number.MAX_SAFE_INTEGER);
    var notes = chart.notes.filter(function (n) { return n.time >= from && n.time < to; });
    var states = notes.map(function (n) { return { id: n.id, status: 'pending' }; });
    var index = 0, lastSample = -Infinity, lastOnset = -Infinity, lastHitTime = -Infinity;
    var segment = null, quietStart = null, quietEnd = null;
    var armed = true, allowPitchChange = false, consumedMidi = null;

    function limparLeitura() { segment = null; quietStart = null; quietEnd = null; }
    function bloquearAte(audioTime) {
      if (!tempo(audioTime)) return false;
      gate = Math.max(gate, audioTime, lastSample);
      limparLeitura();
      armed = false; allowPitchChange = false;
      return true;
    }
    function retomar(audioTime) { return bloquearAte(audioTime); }
    function avancar(status, audioTime, cents) {
      var nota = notes[index];
      if (!nota) return null;
      var state = { id: nota.id, status: status, audioTime: audioTime };
      if (status === 'hit') { state.cents = Math.round(cents * 10) / 10; lastHitTime = audioTime; }
      states[index++] = state;
      consumedMidi = nota.midi;
      armed = false; allowPitchChange = status === 'hit';
      limparLeitura();
      return copia(state);
    }
    function pular(audioTime) {
      if (!tempo(audioTime) || audioTime < lastSample || !notes[index]) return null;
      var resultado = avancar('skipped', audioTime);
      bloquearAte(audioTime);
      return resultado;
    }
    function amostrar(sample) {
      if (!objeto(sample) || !tempo(sample.audioTime) || sample.audioTime <= lastSample) return null;
      var t = sample.audioTime;
      lastSample = t;
      if (!notes[index]) return null;
      // audioTime marca o centro da janela do perfil. Só uma janela
      // inteiramente posterior à guia/pausa pode iniciar uma confirmação.
      if (t - meiaJanela < gate - EPS) return null;
      var clipped = sample.clipped === undefined ? 0 : sample.clipped;
      var dadosValidos = numero(sample.rms) && sample.rms >= 0 &&
        numero(sample.confidence) && sample.confidence >= 0 && sample.confidence <= 1 &&
        numero(clipped) && clipped >= 0 && clipped <= 1 &&
        (sample.hz === null || (numero(sample.hz) && sample.hz > 0)) &&
        (sample.onset === undefined || typeof sample.onset === 'boolean') &&
        (sample.onsetTime === undefined || (sample.onsetTime === null && sample.onset !== true) ||
          (tempo(sample.onsetTime) && sample.onsetTime <= t));
      var quiet = dadosValidos && clipped <= 0.08 && sample.rms < minRms;
      var valid = dadosValidos && !quiet && clipped <= 0.08 && sample.hz !== null && sample.confidence >= minConfidence;
      if (!valid) {
        segment = null;
        if (quiet) {
          if (quietStart === null || t - quietEnd > MAX_INTERVALO) quietStart = t;
          quietEnd = t;
          if (t - quietStart >= SILENCIO - EPS) armed = true;
        } else { quietStart = null; quietEnd = null; }
        return null;
      }
      var afterSilence = quietStart !== null && t - quietStart >= SILENCIO - EPS && t - quietEnd <= MAX_INTERVALO;
      // A confirmação do detector pode chegar depois do transiente. A janela
      // que originou o ataque também deve ser inteiramente posterior ao gate.
      // Quadros sem origem explícita preservam o contrato booleano anterior.
      var origem = sample.onsetTime === undefined ? t : sample.onsetTime;
      // A nota pode ter acertado antes da confirmação do ataque; sua origem
      // anterior ao acerto não autoriza repetir o mesmo alvo outra vez.
      var onset = sample.onset === true && origem - meiaJanela >= gate - EPS &&
        origem > lastHitTime + EPS && origem - lastOnset >= 0.06 - EPS;
      if (onset || afterSilence) {
        armed = true; segment = null;
        if (onset) lastOnset = origem;
      }
      quietStart = null; quietEnd = null;
      var nota = notes[index];
      // A distância em cents é medida contra o MIDI absoluto do alvo:
      // a mesma classe de nota em outra oitava nunca satisfaz o exercício.
      var cents = 1200 * Math.log(sample.hz / (440 * Math.pow(2, (nota.midi - 69) / 12))) / Math.LN2;
      if (!numero(cents) || Math.abs(cents) > centsTolerance + EPS) { segment = null; return null; }
      if (!armed && !(allowPitchChange && nota.midi !== consumedMidi)) { segment = null; return null; }
      if (!segment || t - segment.end > MAX_INTERVALO) segment = { start: t, end: t, sum: cents, count: 1 };
      else { segment.end = t; segment.sum += cents; segment.count++; }
      if (t - segment.start < stable - EPS) return null;
      return avancar('hit', t, segment.sum / segment.count);
    }
    function resumo() {
      var hits = 0, skipped = 0;
      states.forEach(function (s) { if (s.status === 'hit') hits++; else if (s.status === 'skipped') skipped++; });
      return { total: states.length, hits: hits, skipped: skipped, pending: states.length - hits - skipped, complete: index === states.length };
    }
    return { amostrar: amostrar, pular: pular, bloquearAte: bloquearAte, retomar: retomar,
      alvo: function () { return notes[index] ? copia(notes[index]) : null; },
      estados: function () { return states.map(copia); }, resumo: resumo };
  }
  function criarMidi(input, options) {
    exigir(Core && typeof Core.validarChart === 'function', 'O núcleo de arranjos precisa estar carregado.');
    var chart = Core.validarChart(input), o = options === undefined ? {} : options;
    exigir(objeto(o), 'As opções de aprendizagem MIDI devem ser um objeto.');
    var from = o.from === undefined ? 0 : o.from, to = o.to === undefined ? chart.duration : o.to;
    exigir(tempo(from) && tempo(to) && to > from && to <= chart.duration, 'Intervalo MIDI inválido.');
    var notes = chart.notes.filter(function (n) { return n.time >= from && n.time < to; });
    var groups = [], states = [], groupIndex = 0, gate = tempo(o.now) ? o.now : 0, lastSample = -Infinity;
    notes.forEach(function (note) {
      var group = groups[groups.length - 1];
      if (!group || Math.abs(group.time - note.time) > EPS) { group = { time: note.time, notes: [], midi: Object.create(null), received: Object.create(null) }; groups.push(group); }
      group.notes.push(note); group.midi[note.midi] = true; states.push({ id: note.id, status: 'pending' });
    });
    function grupoAtual() { return groups[groupIndex] || null; }
    function bloquearAte(t) { if (tempo(t)) { gate = Math.max(gate, t, lastSample); return true; } return false; }
    function avancar(status, t) {
      var group = grupoAtual(); if (!group || !tempo(t)) return null;
      group.notes.forEach(function (note) { states[states.findIndex(function (s) { return s.id === note.id; })] = { id: note.id, status: status, audioTime: t }; });
      groupIndex++; gate = Math.max(gate, t); return { id: group.notes[0].id, status: status, audioTime: t };
    }
    function amostrar(sample) {
      if (!objeto(sample) || !tempo(sample.audioTime) || sample.audioTime < lastSample - EPS || !Number.isInteger(sample.midi)) return null;
      lastSample = Math.max(lastSample, sample.audioTime);
      if (sample.audioTime < gate - EPS) return null;
      var group = grupoAtual(); if (!group || !group.midi[sample.midi]) return null;
      group.received[sample.midi] = true;
      var pronto = group.notes.every(function (note) { return group.received[note.midi]; });
      return pronto ? avancar('hit', sample.audioTime) : null;
    }
    function pular(t) { if (!tempo(t) || t < lastSample || !grupoAtual()) return null; return avancar('skipped', t); }
    function resumo() { var hits = states.filter(function (s) { return s.status === 'hit'; }).length, skipped = states.filter(function (s) { return s.status === 'skipped'; }).length; return { total: states.length, hits: hits, skipped: skipped, pending: states.length - hits - skipped, complete: groupIndex >= groups.length }; }
    return { amostrar: amostrar, pular: pular, bloquearAte: bloquearAte, retomar: bloquearAte,
      alvo: function () { var g = grupoAtual(); return g && g.notes[0] ? copia(g.notes[0]) : null; },
      estados: function () { return states.map(copia); }, resumo: resumo };
  }
  return { criar: criar, criarMidi: criarMidi };
});
