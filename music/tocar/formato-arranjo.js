// Normalizador do formato aberto do Musique. Não acessa DOM, banco ou rede.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nucleo'), require('./perfis'));
  else root.MusiqueTocarFormatoArranjo = factory(root.MusiqueTocarCore, root.MusiqueTocarPerfis);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, Perfis) {
  'use strict';

  var INSTRUMENTOS = Object.freeze(['violao', 'guitarra', 'baixo', 'cavaquinho', 'ukulele', 'bandolim', 'piano', 'bateria']);
  var MAX_EVENTOS = 10000;

  function exigir(ok, msg) { if (!ok) throw new Error('Arranjo inválido: ' + msg); }
  function objeto(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function texto(v, nome, max) {
    exigir(typeof v === 'string' && v.trim() && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v), nome + ' deve ser texto simples.');
    return v.trim();
  }
  function numero(v, nome, min, max) {
    exigir(Number.isFinite(v) && v >= min && v <= max, nome + ' está fora do limite.');
    return v;
  }
  function instrumento(v) {
    exigir(INSTRUMENTOS.indexOf(v) >= 0, 'instrumento não suportado.');
    return v;
  }
  function copiarFonte(fonte) {
    if (fonte === undefined) return [];
    exigir(Array.isArray(fonte) && fonte.length <= 16, 'sources deve ser uma lista curta.');
    return fonte.map(function (f) {
      exigir(objeto(f), 'cada source deve ser um objeto.');
      var formato = texto(f.format, 'formato da fonte', 24).toLowerCase();
      var nome = texto(f.name, 'nome da fonte', 160);
      var hash = f.sha256 === undefined ? '' : texto(f.sha256, 'hash da fonte', 128);
      exigir(!/[/\\]/.test(nome), 'nome da fonte não pode conter caminho.');
      return { format: formato, name: nome, sha256: hash };
    });
  }
  function eventoDaNota(nota, indice, instrumentoId) {
    exigir(objeto(nota), 'nota ' + indice + ' deve ser um objeto.');
    var atMs = Math.round(numero(nota.time, 'tempo da nota', 0, 900) * 1000);
    var durationMs = Math.round(numero(nota.duration, 'duração da nota', 0.001, 60) * 1000);
    exigir(Number.isInteger(nota.midi) && nota.midi >= 0 && nota.midi <= 127, 'MIDI da nota inválido.');
    var e = { type: 'note', atMs: atMs, durationMs: durationMs, midi: nota.midi };
    if (nota.velocity !== undefined) e.velocity = Math.max(1, Math.min(127, Math.round(numero(nota.velocity, 'velocity', 1, 127))));
    if (instrumentoId === 'bateria') {
      exigir(typeof nota.drum === 'string' && nota.drum.length <= 32, 'bateria exige nome drum.');
      e.drum = nota.drum;
    } else if (instrumentoId === 'piano') {
      // Piano usa somente MIDI.
    } else {
      exigir(Number.isInteger(nota.string) && nota.string >= 1 && nota.string <= 6, 'corda inválida.');
      exigir(Number.isInteger(nota.fret) && nota.fret >= 0 && nota.fret <= 24, 'casa inválida.');
      e.string = nota.string; e.fret = nota.fret;
    }
    return e;
  }
  function perfilDaFaixa(chart, instrumentoId) {
    var p = Perfis && Perfis.obter ? Perfis.obter(instrumentoId === 'bandolim' ? 'bandolim-5' : instrumentoId) : null;
    if (!p) return null;
    return p;
  }
  function normalizar(input, opcoes) {
    exigir(Core && typeof Core.validarChart === 'function', 'carregue o núcleo antes de normalizar.');
    exigir(objeto(input) && objeto(input.chart), 'informe chart e metadados do arranjo.');
    opcoes = opcoes || {};
    var chart = Core.validarChart(input.chart);
    var id = texto(opcoes.id || chart.id, 'id', 80);
    var title = texto(opcoes.title || chart.title, 'título', 120);
    var instrumentoId = instrumento(opcoes.instrument || (chart.layout === 'piano' ? 'piano' : chart.layout === 'drums' ? 'bateria' : 'guitarra'));
    var perfil = perfilDaFaixa(chart, instrumentoId);
    exigir(perfil, 'perfil de instrumento não disponível.');
    var notes = chart.notes.map(function (nota, indice) { return eventoDaNota(nota, indice + 1, instrumentoId); });
    exigir(notes.length > 0 && notes.length <= MAX_EVENTOS, 'o arranjo deve conter entre 1 e 10.000 notas.');
    var faixa = { id: texto(opcoes.trackId || instrumentoId + '-1', 'id da trilha', 80), instrument: instrumentoId, events: notes };
    if (Array.isArray(chart.tuning)) faixa.tuning = chart.tuning.slice();
    var tempo = { bpm: numero(chart.bpm || 120, 'BPM', 20, 300), unit: 4 };
    var out = { schema: 'musique.arrangement.v1', id: id, title: title, tempo: tempo,
      meter: { beats: 4, beatUnit: 4 }, durationMs: Math.round(numero(chart.duration, 'duração', 0.04, 900) * 1000), tracks: [faixa], sections: [], sources: copiarFonte(input.sources) };
    if (Array.isArray(chart.sections)) out.sections = chart.sections.map(function (s, i) {
      exigir(objeto(s), 'seção ' + (i + 1) + ' inválida.');
      return { id: texto(s.id || 'secao-' + (i + 1), 'id da seção', 80), title: texto(s.title, 'título da seção', 120), fromMs: Math.round(numero(s.from, 'início da seção', 0, 900) * 1000), toMs: Math.round(numero(s.to, 'fim da seção', 0, 900) * 1000) };
    });
    if (chart.tempoMap && Array.isArray(chart.tempoMap.events)) out.tempoMap = { version: 1, events: chart.tempoMap.events.map(function (e) { return { atMs: Math.round(numero(e.time, 'tempo do mapa', 0, 900) * 1000), bpm: numero(e.bpm, 'BPM do mapa', 20, 300) }; }) };
    return out;
  }
  return { normalizar: normalizar, INSTRUMENTOS: INSTRUMENTOS, MAX_EVENTOS: MAX_EVENTOS };
});
