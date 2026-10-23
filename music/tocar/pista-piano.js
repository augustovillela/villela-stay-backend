// Pista de piano de 88 teclas. O destaque mostra o instante do arranjo,
// não o estado físico do teclado nem uma confirmação de acerto MIDI.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MusiqueTocarPiano = factory();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var PRETAS = { 1: true, 3: true, 6: true, 8: true, 10: true };
  var NOMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
  var CORES = { fundo: '#111c2d', fundoBaixo: '#1d2d40', branca: '#e4ebf1', preta: '#111c2d',
    nota: '#71d4c9', notaPreta: '#f2d4a0', hit: '#7ad7ac', miss: '#b36f70', texto: '#a8bacb' };
  var cache = null;
  function finito(valor) { return typeof valor === 'number' && Number.isFinite(valor); }
  function limitar(valor, min, max) { return Math.max(min, Math.min(max, valor)); }
  function nomeMidi(midi) { return NOMES[midi % 12] + (Math.floor(midi / 12) - 1); }

  // Todas as medidas são pixels do canvas. O chamador já aplica DPR ao
  // tamanho do canvas; d serve apenas para tipografia, bordas e espaçamento.
  function geometria(opcoes) {
    opcoes = opcoes || {};
    var w = opcoes.w, h = opcoes.h, d = finito(opcoes.d) && opcoes.d > 0 ? opcoes.d : 1;
    if (!finito(w) || !finito(h) || w <= 0 || h <= 0) return null;
    var x = Math.min(24 * d, w * 0.025), width = w - 2 * x;
    var bottom = h * 0.96, keyHeight = Math.min(104 * d, h * 0.24);
    var strikeY = bottom - keyHeight, top = Math.min(46 * d, h * 0.16);
    var whiteWidth = width / 52, blackWidth = whiteWidth * 0.62, whiteIndex = 0;
    var keys = [], whiteKeys = [], blackKeys = [], byMidi = Object.create(null);
    for (var midi = 21; midi <= 108; midi++) {
      var black = !!PRETAS[midi % 12];
      var keyX = x + whiteIndex * whiteWidth - (black ? blackWidth / 2 : 0);
      var keyWidth = black ? blackWidth : whiteWidth;
      var key = { midi: midi, name: nomeMidi(midi), black: black, x: keyX, y: strikeY,
        width: keyWidth, height: keyHeight * (black ? 0.63 : 1), center: keyX + keyWidth / 2 };
      keys.push(key); byMidi[midi] = key;
      if (black) blackKeys.push(key);
      else { whiteKeys.push(key); whiteIndex++; }
    }
    return { w: w, h: h, d: d, x: x, width: width, top: top, strikeY: strikeY, bottom: bottom,
      keyHeight: keyHeight, whiteWidth: whiteWidth, travel: strikeY - top,
      keys: keys, whiteKeys: whiteKeys, blackKeys: blackKeys, byMidi: byMidi };
  }

  // A cabeça chega à linha no início da nota; a cauda chega ao final.
  // Sustentações iniciadas antes da janela visível continuam desenhadas.
  function projetarNota(nota, geo, opcoes) {
    if (!geo || !nota || !Number.isInteger(nota.midi) || !geo.byMidi[nota.midi] ||
        !finito(nota.time) || !finito(nota.duration) || nota.duration <= 0) return null;
    opcoes = opcoes || {};
    var position = finito(opcoes.position) ? opcoes.position : 0;
    var from = finito(opcoes.from) ? opcoes.from : 0;
    var to = finito(opcoes.to) ? opcoes.to : Infinity;
    var ahead = finito(opcoes.ahead) && opcoes.ahead > 0 ? opcoes.ahead : 4.5;
    if (to <= from || nota.time < from || nota.time >= to) return null;
    var end = Math.min(nota.time + nota.duration, to);
    if (!finito(end) || end <= position || nota.time >= position + ahead) return null;
    var headY = geo.strikeY - (nota.time - position) * geo.travel / ahead;
    var tailY = geo.strikeY - (end - position) * geo.travel / ahead;
    var bottom = limitar(headY, geo.top, geo.strikeY);
    var y = limitar(tailY, geo.top, geo.strikeY);
    // Notas curtas continuam visíveis, sem avançar sobre o teclado.
    y = Math.max(geo.top, Math.min(y, bottom - Math.min(4 * geo.d, geo.travel)));
    if (bottom <= y) return null;
    // Centros de uma branca e sua preta vizinha ficam a meia tecla branca
    // de distância. Larguras menores evitam que acordes cromáticos se tapem.
    var key = geo.byMidi[nota.midi], width = key.width * (key.black ? 0.72 : 0.52);
    return { midi: nota.midi, key: key, x: key.center - width / 2, y: y, width: width,
      height: bottom - y, headY: headY, tailY: tailY, bottom: bottom,
      active: position >= nota.time && position < end, end: end };
  }

  function corNota(key, status) {
    return status === 'hit' ? CORES.hit : status === 'miss' || status === 'skipped' ? CORES.miss : key.black ? CORES.notaPreta : CORES.nota;
  }
  function linha(g, x1, y1, x2, y2) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  function desenhar(g, opcoes) {
    opcoes = opcoes || {};
    if (!cache || cache.w !== opcoes.w || cache.h !== opcoes.h || cache.d !== (opcoes.d || 1)) cache = geometria(opcoes);
    var geo = cache;
    if (!g || !geo) return { geometry: geo, visibleNotes: 0, activeMidis: [] };
    var d = geo.d, chart = opcoes.chart || {}, notas = Array.isArray(chart.notes) ? chart.notes : [];
    var position = finito(opcoes.position) ? opcoes.position : 0;
    var from = finito(opcoes.from) ? opcoes.from : 0;
    var to = finito(opcoes.to) ? opcoes.to : finito(chart.duration) ? chart.duration : Infinity;
    var statuses = opcoes.statuses || {}, active = Object.create(null), visible = 0;
    var janela = { position: position, from: from, to: to, ahead: 4.5 };
    g.save();
    g.globalAlpha = 1; g.shadowBlur = 0;
    g.clearRect(0, 0, geo.w, geo.h);
    var bg = g.createLinearGradient(0, 0, 0, geo.h);
    bg.addColorStop(0, CORES.fundo); bg.addColorStop(1, CORES.fundoBaixo);
    g.fillStyle = bg; g.fillRect(0, 0, geo.w, geo.h);

    geo.whiteKeys.forEach(function (key) {
      if (key.midi % 12 === 0) {
        g.fillStyle = '#ffffff04'; g.fillRect(key.x, geo.top, key.width, geo.travel);
      }
      g.strokeStyle = '#ccd8e40b'; g.lineWidth = d;
      linha(g, key.x, geo.top, key.x, geo.strikeY);
    });
    geo.blackKeys.forEach(function (key) {
      g.fillStyle = '#00000019'; g.fillRect(key.x, geo.top, key.width, geo.travel);
    });
    (Array.isArray(opcoes.beats) ? opcoes.beats : []).forEach(function (tempo, i) {
      if (i >= 64 || !finito(tempo) || tempo < position || tempo > position + 4.5 || tempo < from || tempo >= to) return;
      var y = geo.strikeY - (tempo - position) * geo.travel / 4.5;
      g.strokeStyle = '#ffffff18'; g.lineWidth = d;
      linha(g, geo.x, y, geo.x + geo.width, y);
    });
    for (var i = 0; i < notas.length; i++) {
      var nota = notas[i], p = projetarNota(nota, geo, janela);
      if (!p) continue;
      visible++;
      var status = statuses[nota.id], cor = corNota(p.key, status);
      if (p.active) active[nota.midi] = cor;
      var velocity = finito(nota.velocity) ? limitar(nota.velocity, 1, 127) : 100;
      g.globalAlpha = 0.72 + velocity / 127 * 0.28;
      g.fillStyle = cor; g.fillRect(p.x, p.y, p.width, p.height);
      g.globalAlpha = 1;
      // Uma borda clara marca a cabeça e a chegada sem esconder a duração.
      g.fillStyle = '#effaf6';
      g.fillRect(p.x, Math.max(p.y, p.bottom - Math.min(2 * d, p.height)), p.width, Math.min(2 * d, p.height));
      if (p.width >= 17 * d && p.height >= 14 * d) {
        g.fillStyle = '#142337'; g.font = '600 ' + 8 * d + 'px system-ui';
        g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.fillText(p.key.name, p.key.center, p.bottom - 3 * d);
      }
    }

    // Primeiro todas as brancas; depois as pretas, como no teclado físico.
    geo.whiteKeys.forEach(function (key) {
      var gap = Math.min(d, key.width * 0.08);
      g.fillStyle = active[key.midi] || CORES.branca;
      g.fillRect(key.x + gap / 2, key.y, key.width - gap, key.height);
      g.fillStyle = active[key.midi] ? '#14233730' : '#b8c6d3';
      g.fillRect(key.x + gap / 2, key.y + key.height - Math.min(4 * d, key.height), key.width - gap, Math.min(4 * d, key.height));
    });
    geo.blackKeys.forEach(function (key) {
      g.fillStyle = active[key.midi] || CORES.preta;
      g.fillRect(key.x, key.y, key.width, key.height);
      g.fillStyle = active[key.midi] ? '#ffffff55' : '#43556b';
      g.fillRect(key.x + key.width * 0.15, key.y + key.height - Math.min(3 * d, key.height), key.width * 0.7, Math.min(3 * d, key.height));
    });
    g.strokeStyle = CORES.notaPreta; g.lineWidth = 2 * d;
    linha(g, geo.x, geo.strikeY, geo.x + geo.width, geo.strikeY);
    geo.whiteKeys.forEach(function (key) {
      if (key.midi % 12 !== 0 && key.midi !== 21 && key.midi !== 108) return;
      g.fillStyle = '#24364a'; g.font = '600 ' + Math.min(10 * d, Math.max(7 * d, geo.whiteWidth * 0.65)) + 'px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(key.name, key.center, geo.bottom - Math.min(8 * d, geo.keyHeight * 0.12));
    });
    g.fillStyle = CORES.texto; g.font = '600 ' + 10 * d + 'px system-ui';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('PIANO · 88 TECLAS', geo.x, geo.top * 0.46);
    if (geo.w / d >= 600) {
      g.font = '500 ' + 10 * d + 'px system-ui'; g.textAlign = 'right';
      g.fillText('Teclas acesas = notas do arranjo', geo.x + geo.width, geo.top * 0.46);
    }
    if (!opcoes.running && opcoes.mode === 'idle' && geo.w / d >= 360) {
      g.fillStyle = '#dce5ed'; g.font = '500 ' + 12 * d + 'px system-ui';
      g.textAlign = 'center';
      g.fillText('Toque quando a nota alcançar o teclado', geo.w / 2, geo.top + geo.travel * 0.18);
    }
    g.restore();
    return { geometry: geo, visibleNotes: visible, activeMidis: Object.keys(active).map(Number) };
  }
  return { geometria: geometria, projetarNota: projetarNota, desenhar: desenhar };
});
