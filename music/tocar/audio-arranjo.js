// Musique · análise local de MP3 para um rascunho de arranjo.
(function (global) {
  'use strict';
  var NOTAS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  var TUNING = [40, 45, 50, 55, 59, 64];
  function nota(cifra) { var m = /^([A-G](?:#|b)?)(m|min|minor)?/.exec(String(cifra || '').trim()); return m && NOTAS[m[1]] != null ? { pc: NOTAS[m[1]], menor: !!m[2] } : null; }
  function posicao(midi) { var melhor = null; for (var s = 1; s <= 6; s++) { var fret = midi - TUNING[6 - s]; if (fret < 0 || fret > 24) continue; var custo = Math.abs(fret - 3) + (fret === 0 ? .5 : 0); if (!melhor || custo < melhor.custo) melhor = { string: s, fret: fret, custo: custo }; } return melhor; }
  function mono(buffer, taxa) { var n = Math.max(1, Math.round(buffer.duration * taxa)), y = new Float32Array(n), canais = buffer.numberOfChannels; for (var i = 0; i < n; i++) { var p = i * buffer.sampleRate / taxa, a = Math.floor(p), f = p - a, soma = 0; for (var c = 0; c < canais; c++) { var d = buffer.getChannelData(c); soma += (d[a] || 0) * (1 - f) + (d[Math.min(d.length - 1, a + 1)] || 0) * f; } y[i] = soma / canais; } return y; }
  function analisar(file, progresso) {
    if (!file || typeof file.arrayBuffer !== 'function') return Promise.reject(new Error('Escolha um arquivo de áudio.'));
    if (file.size > 100 * 1024 * 1024) return Promise.reject(new Error('O áudio deve ter no máximo 100 MB.'));
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return Promise.reject(new Error('Este navegador não oferece análise de áudio.'));
    if (progresso) progresso('Lendo o MP3…');
    return file.arrayBuffer().then(function (bytes) { var ctx = new Ctx(); return new Promise(function (ok, fail) { ctx.decodeAudioData(bytes, ok, fail); }).then(function (buf) { var dur = buf.duration; if (dur > 15 * 60) throw new Error('Áudio acima de 15 minutos. Corte a música antes de importar.'); var amostras = mono(buf, 22050); ctx.close(); if (progresso) progresso('Analisando acordes e andamento…'); return new Promise(function (ok, fail) { var w = new Worker('/music/cifras-trabalhador.js'), id = 1; w.onmessage = function (e) { if (e.data.id !== id) return; w.terminate(); e.data.ok ? ok({ analise: e.data.resultado, bpm: e.data.bpm && e.data.bpm.confianca >= .3 ? e.data.bpm.bpm : 90, duracao: dur }) : fail(new Error(e.data.erro || 'A análise do áudio falhou.')); }; w.onerror = function () { w.terminate(); fail(new Error('A análise do áudio falhou.')); }; w.postMessage({ id: id, tipo: 'transcrever', amostras: amostras, taxa: 22050 }, [amostras.buffer]); }); }); });
  }
  function gerar(resultado, titulo) {
    var segs = (resultado.analise.segmentos || []).filter(function (s) { return s.acorde && nota(s.acorde); });
    if (!segs.length) throw new Error('Não consegui reconhecer acordes suficientes nesse áudio.');
    var bpm = resultado.bpm || 90, beat = 60000 / bpm, guitar = [], bass = [], piano = [], drums = [];
    segs.forEach(function (seg, i) { var n = nota(seg.acorde), at = Math.round(seg.inicio_s * 1000), fim = i + 1 < segs.length ? segs[i + 1].inicio_s * 1000 : resultado.duracao * 1000, dur = Math.max(80, Math.round(fim - at)), root = 48 + n.pc, p = posicao(root); if (p) guitar.push({ type: 'note', atMs: at, durationMs: dur, midi: root, string: p.string, fret: p.fret, velocity: 96 }); bass.push({ type: 'note', atMs: at, durationMs: Math.min(dur, Math.round(beat * 1.8)), midi: 36 + n.pc, velocity: 105 }); [root, root + (n.menor ? 3 : 4), root + 7].forEach(function (m, j) { piano.push({ type: 'note', atMs: at, durationMs: dur, midi: m + (j ? 12 : 0), velocity: 78 - j * 5 }); }); for (var t = at; t < Math.min(fim, resultado.duracao * 1000); t += beat) { drums.push({ type: 'note', atMs: Math.round(t), durationMs: 90, midi: 36, velocity: 105 }); drums.push({ type: 'note', atMs: Math.round(t + beat / 2), durationMs: 60, midi: 42, velocity: 58 }); } });
    var id = 'audio-rascunho-' + Date.now(), chart = { id: id, title: titulo || 'Arranjo gerado do áudio', bpm: bpm, duration: resultado.duracao, tuning: TUNING.slice(), notes: guitar.map(function (e, i) { return { id: 'audio-' + i, time: e.atMs / 1000, duration: e.durationMs / 1000, string: e.string, fret: e.fret, midi: e.midi, velocity: e.velocity }; }), sections: [{ id: 'audio-inteiro', title: 'Áudio inteiro', from: 0, to: resultado.duracao }] };
    return { chart: chart, package: { schema: 'musique.arrangement.v1', id: id, title: chart.title, tempo: { bpm: bpm, unit: 4 }, durationMs: Math.round(resultado.duracao * 1000), tracks: [{ id: 'violao-audio', instrument: 'violao', tuning: TUNING.slice(), events: guitar }, { id: 'baixo-audio', instrument: 'baixo', events: bass }, { id: 'piano-audio', instrument: 'piano', events: piano }, { id: 'bateria-audio', instrument: 'bateria', events: drums }], metadata: { aproximado: true, estrategia: 'croma-do-audio', confianca: resultado.analise.confianca } } };
  }
  global.MusiqueTocarAudioArranjo = { analisar: analisar, gerar: gerar };
})(typeof window !== 'undefined' ? window : globalThis);
