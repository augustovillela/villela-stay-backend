// Perfis musicais compartilhados pelo Tocar junto. Não acessa DOM, áudio,
// rede ou persistência. A afinação vai da corda grave à aguda; os rótulos
// acompanham a pista, cuja corda 1 é sempre a mais aguda.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MusiqueTocarPerfis = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function congelarPerfil(perfil) {
    if (perfil.tuning) perfil.tuning = Object.freeze(perfil.tuning.slice());
    if (perfil.rotulos) perfil.rotulos = Object.freeze(perfil.rotulos.slice());
    // As duas grafias atendem consumidores antigos e novos sem tornar o
    // perfil dependente de uma camada de interface específica.
    perfil.stringLabels = perfil.rotulos;
    if (perfil.detector) perfil.detector = Object.freeze(Object.assign({}, perfil.detector));
    if (perfil.drums) perfil.drums = Object.freeze(perfil.drums.map(function (drum) { return Object.freeze(Object.assign({}, drum)); }));
    return Object.freeze(perfil);
  }

  var SEIS_CORDAS = congelarPerfil({
    id: 'seis-cordas',
    rotulo: 'Violão e guitarra',
    label: 'Violão e guitarra',
    tuning: [40, 45, 50, 55, 59, 64], // Mi2, Lá2, Ré3, Sol3, Si3, Mi4
    strings: 6,
    frets: 24,
    rotulos: ['1 · Mi aguda', '2 · Si', '3 · Sol', '4 · Ré', '5 · Lá', '6 · Mi grave'],
    detector: { minHz: 70, maxHz: 1400, frameMs: 64, windowMs: 64, stepMs: 24 }
  });
  var BAIXO = congelarPerfil({
    id: 'baixo',
    rotulo: 'Contrabaixo de 4 cordas',
    label: 'Contrabaixo de 4 cordas',
    tuning: [28, 33, 38, 43], // Mi1, Lá1, Ré2, Sol2
    strings: 4,
    frets: 24,
    rotulos: ['1 · Sol', '2 · Ré', '3 · Lá', '4 · Mi grave'],
    detector: { minHz: 35, maxHz: 700, frameMs: 128, windowMs: 128, stepMs: 48 }
  });
  var CAVAQUINHO = congelarPerfil({ id: 'cavaquinho', rotulo: 'Cavaquinho', label: 'Cavaquinho', tuning: [50, 55, 59, 62], strings: 4, frets: 17, rotulos: ['1 · Ré aguda', '2 · Si', '3 · Sol', '4 · Ré grave'], detector: { minHz: 120, maxHz: 1400, frameMs: 64, windowMs: 64, stepMs: 24 } });
  var BANDOLIM = congelarPerfil({ id: 'bandolim-5', rotulo: 'Bandolim de 5 cordas', label: 'Bandolim de 5 cordas', tuning: [55, 62, 69, 76, 83], strings: 5, frets: 24, rotulos: ['1 · Si aguda', '2 · Mi', '3 · Lá', '4 · Ré', '5 · Sol grave'], detector: { minHz: 140, maxHz: 1600, frameMs: 64, windowMs: 64, stepMs: 24 } });
  var BATERIA = congelarPerfil({
    id: 'bateria-midi',
    rotulo: 'Bateria eletrônica',
    label: 'Bateria eletrônica',
    layout: 'drums',
    drums: [
      { id: 'bumbo', label: 'Bumbo', midi: 36 }, { id: 'caixa', label: 'Caixa', midi: 38 },
      { id: 'chimbal-fechado', label: 'Chimbal fechado', midi: 42 }, { id: 'chimbal-aberto', label: 'Chimbal aberto', midi: 46 },
      { id: 'tom-baixo', label: 'Tom baixo', midi: 45 }, { id: 'tom-medio', label: 'Tom médio', midi: 47 },
      { id: 'tom-alto', label: 'Tom alto', midi: 50 }, { id: 'surdo-baixo', label: 'Surdo baixo', midi: 41 },
      { id: 'crash', label: 'Crash', midi: 49 }, { id: 'ride', label: 'Ride', midi: 51 }
    ],
    detector: null
  });
  var PIANO = congelarPerfil({ id: 'piano-midi', rotulo: 'Piano MIDI', label: 'Piano MIDI', layout: 'piano', keys: 88, minMidi: 21, maxMidi: 108, detector: null });
  var PERFIS = Object.freeze({ 'seis-cordas': SEIS_CORDAS, baixo: BAIXO, cavaquinho: CAVAQUINHO, 'bandolim-5': BANDOLIM, 'bateria-midi': BATERIA, 'piano-midi': PIANO });
  var ALIASES = Object.freeze({ violao: 'seis-cordas', guitarra: 'seis-cordas', 'seis-cordas': 'seis-cordas', baixo: 'baixo', cavaquinho: 'cavaquinho', bandolim: 'bandolim-5', 'bandolim-5': 'bandolim-5', bateria: 'bateria-midi', 'bateria-midi': 'bateria-midi', piano: 'piano-midi', 'piano-midi': 'piano-midi' });

  function copia(perfil) {
    if (!perfil) return null;
    return {
      id: perfil.id,
      rotulo: perfil.rotulo,
      label: perfil.label,
      layout: perfil.layout || 'fretboard',
      tuning: perfil.tuning ? perfil.tuning.slice() : null,
      strings: perfil.strings || 0,
      frets: perfil.frets || 0,
      rotulos: perfil.rotulos ? perfil.rotulos.slice() : [],
      stringLabels: perfil.stringLabels ? perfil.stringLabels.slice() : [],
      drums: perfil.drums ? perfil.drums.map(function (drum) { return Object.assign({}, drum); }) : [],
      keys: perfil.keys || 0, minMidi: perfil.minMidi || 0, maxMidi: perfil.maxMidi || 0,
      detector: perfil.detector ? Object.assign({}, perfil.detector) : null
    };
  }
  function obter(id) {
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(ALIASES, id)) return null;
    return copia(PERFIS[ALIASES[id]]);
  }
  function mesmaAfinacao(a, b) {
    return Array.isArray(a) && a.length === b.length && a.every(function (midi, i) {
      return Number.isInteger(midi) && midi === b[i];
    });
  }
  function porAfinacao(tuning) {
    if (mesmaAfinacao(tuning, SEIS_CORDAS.tuning)) return copia(SEIS_CORDAS);
    if (mesmaAfinacao(tuning, BAIXO.tuning)) return copia(BAIXO);
    if (mesmaAfinacao(tuning, CAVAQUINHO.tuning)) return copia(CAVAQUINHO);
    if (mesmaAfinacao(tuning, BANDOLIM.tuning)) return copia(BANDOLIM);
    return null;
  }
  function porChart(chart) {
    if (chart && (chart.profile === 'bateria-midi' || chart.layout === 'drums')) return copia(BATERIA);
    if (chart && (chart.profile === 'piano-midi' || chart.layout === 'piano')) return copia(PIANO);
    return porAfinacao(chart && chart.tuning);
  }

  return { obter: obter, porAfinacao: porAfinacao, porChart: porChart };
});
