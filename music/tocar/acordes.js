// Identificação determinística de acordes para grupos de notas MIDI.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MusiqueTocarAcordes = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var QUALITIES = [
    { quality: 'major', suffix: '', intervals: [0, 4, 7], priority: 1 },
    { quality: 'minor', suffix: 'm', intervals: [0, 3, 7], priority: 1 },
    { quality: 'sus2', suffix: 'sus2', intervals: [0, 2, 7], priority: 2 },
    { quality: 'sus4', suffix: 'sus4', intervals: [0, 5, 7], priority: 2 },
    { quality: 'diminished', suffix: 'dim', intervals: [0, 3, 6], priority: 2 },
    { quality: 'augmented', suffix: 'aug', intervals: [0, 4, 8], priority: 2 },
    { quality: 'dominant7', suffix: '7', intervals: [0, 4, 7, 10], priority: 1 },
    { quality: 'major7', suffix: 'maj7', intervals: [0, 4, 7, 11], priority: 1 },
    { quality: 'minor7', suffix: 'm7', intervals: [0, 3, 7, 10], priority: 1 },
    { quality: 'halfDiminished7', suffix: 'm7b5', intervals: [0, 3, 6, 10], priority: 2 },
    { quality: 'diminished7', suffix: 'dim7', intervals: [0, 3, 6, 9], priority: 2 },
  ];
  function uniquePitches(notes) {
    var seen = Object.create(null), values = [];
    (Array.isArray(notes) ? notes : []).forEach(function (n) {
      var midi = typeof n === 'number' ? n : n && n.midi;
      if (!Number.isInteger(midi) || midi < 0 || midi > 127) return;
      var pc = ((midi % 12) + 12) % 12;
      if (!seen[pc]) { seen[pc] = true; values.push(pc); }
    });
    return values.sort(function (a, b) { return a - b; });
  }
  function same(a, b) { return a.length === b.length && a.every(function (v, i) { return v === b[i]; }); }
  function identificar(notes) {
    var input = Array.isArray(notes) ? notes : [], pcs = uniquePitches(input);
    if (pcs.length < 3) return null;
    var lowest = input.map(function (n) { return typeof n === 'number' ? n : n && n.midi; })
      .filter(function (n) { return Number.isInteger(n); }).sort(function (a, b) { return a - b; })[0];
    var matches = [];
    for (var rootPc = 0; rootPc < 12; rootPc++) QUALITIES.forEach(function (q) {
      var expected = q.intervals.map(function (i) { return (rootPc + i) % 12; }).sort(function (a, b) { return a - b; });
      if (same(expected, pcs)) matches.push({ rootPc: rootPc, quality: q, inversion: lowest === undefined ? 0 : ((lowest % 12 + 12) % 12 - rootPc + 12) % 12 });
    });
    if (!matches.length) return null;
    matches.sort(function (a, b) {
      return a.quality.priority - b.quality.priority || a.quality.intervals.length - b.quality.intervals.length || a.rootPc - b.rootPc;
    });
    var found = matches[0];
    return { rootPc: found.rootPc, rootName: NAMES[found.rootPc], symbol: NAMES[found.rootPc] + found.quality.suffix,
      quality: found.quality.quality, inversion: found.inversion, notes: pcs.slice(), midi: input.slice() };
  }
  return { identificar: identificar, nomes: NAMES.slice() };
});
