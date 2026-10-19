// Analisador polifônico experimental local. Não classifica desempenho nem
// substitui o detector YIN usado na prática de cordas.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MusiqueTocarPolifonico = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var A4 = 440, MIN_MIDI = 28, MAX_MIDI = 88, FLOOR = 0.004;
  function midiHz(midi) { return A4 * Math.pow(2, (midi - 69) / 12); }
  function inteiro(v, fallback, min, max) { return Number.isInteger(v) && v >= min && v <= max ? v : fallback; }
  function analisar(samples, sampleRate, options) {
    var o = options && typeof options === 'object' ? options : {};
    var minMidi = inteiro(o.minMidi, MIN_MIDI, 0, 127), maxMidi = inteiro(o.maxMidi, MAX_MIDI, minMidi, 127);
    var n = samples && samples.length || 0;
    var vazio = { midis: [], frequencies: [], confidence: 0, rms: 0, clipped: 0 };
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || n < sampleRate * 0.03 || n > sampleRate * 0.25) return vazio;
    var sum = 0, energy = 0, clipped = 0, i;
    for (i = 0; i < n; i++) { var v = samples[i]; if (!Number.isFinite(v)) return vazio; sum += v; energy += v * v; if (Math.abs(v) >= 0.985) clipped++; }
    var mean = sum / n, rms = Math.sqrt(Math.max(0, energy / n - mean * mean));
    vazio.rms = rms; vazio.clipped = clipped / n;
    if (rms < FLOOR || vazio.clipped > 0.08) return vazio;
    var scores = [], maxScore = 0, span = maxMidi - minMidi + 1;
    for (var midi = minMidi; midi <= maxMidi; midi++) {
      var fundamental = midiHz(midi), real = 0, imag = 0, harmonic = 0;
      for (i = 0; i < n; i++) {
        var window = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
        var phase = 2 * Math.PI * fundamental * i / sampleRate;
        var centered = (samples[i] - mean) * window;
        real += centered * Math.cos(phase); imag -= centered * Math.sin(phase);
        if (fundamental * 2 < sampleRate / 2) { var p2 = phase * 2; harmonic += centered * Math.cos(p2); }
      }
      var magnitude = Math.sqrt(real * real + imag * imag) + 0.35 * Math.abs(harmonic);
      scores.push({ midi: midi, score: magnitude }); if (magnitude > maxScore) maxScore = magnitude;
    }
    if (!maxScore) return vazio;
    var threshold = maxScore * (Number.isFinite(o.threshold) ? Math.max(0.08, Math.min(0.8, o.threshold)) : 0.28);
    var picked = scores.filter(function (x) { return x.score >= threshold; });
    // Um pico pode ocupar duas casas cromáticas; conserva somente o maior
    // vizinho para não transformar vazamento espectral em nota extra.
    var candidatos = picked.slice().sort(function (a, b) { return b.score - a.score; }), aceitos = [];
    candidatos.forEach(function (x) {
      if (aceitos.every(function (y) { return Math.abs(y.midi - x.midi) > 1; })) aceitos.push(x);
    });
    picked = aceitos.sort(function (a, b) { return a.midi - b.midi; }).slice(0, 8);
    var confidence = picked.length ? Math.min(1, picked.reduce(function (s, x) { return s + x.score; }, 0) / (maxScore * Math.max(1, picked.length))) : 0;
    return { midis: picked.map(function (x) { return x.midi; }), frequencies: picked.map(function (x) { return midiHz(x.midi); }), confidence: confidence, rms: rms, clipped: vazio.clipped };
  }
  return { analisar: analisar, midiHz: midiHz };
});
