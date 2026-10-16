// Estudos originais Musique. Dados de autoria: não são transcrições de músicas.
// Cada consulta devolve um arranjo novo; editar uma cópia não muda a biblioteca.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nucleo'), require('./perfis'));
  else root.MusiqueTocarEstudos = factory(root.MusiqueTocarCore, root.MusiqueTocarPerfis);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, Perfis) {
  'use strict';
  if (!Core || typeof Core.validarChart !== 'function' || typeof Core.demoChart !== 'function') {
    throw new Error('Carregue MusiqueTocarCore antes da biblioteca de estudos.');
  }
  if (!Perfis || typeof Perfis.obter !== 'function') {
    throw new Error('Carregue MusiqueTocarPerfis antes da biblioteca de estudos.');
  }

  // Eventos: [corda, casa, tempos]. Corda 1 é sempre a mais aguda. Cada frase ocupa
  // um ou dois compassos de 4 tempos; a pausa final de cada evento permite
  // separar ataques, inclusive ao repetir a mesma altura.
  var DEFINICOES = [
    {
      id: 'primeiro-riff-v1', title: 'Primeiro riff', level: 'Iniciante · revisão',
      objective: 'Revisar as seis cordas e as primeiras casas no estudo original.',
      original: true
    },
    {
      id: 'cordas-soltas-v1', title: 'Cordas soltas', level: 'Iniciante · 1', bpm: 60,
      objective: 'Reconhecer cada corda solta e fazer dois ataques separados, abafando entre eles.',
      phrases: [
        { title: 'Mi grave', notes: [[6, 0, 2], [6, 0, 2]] },
        { title: 'Lá', notes: [[5, 0, 2], [5, 0, 2]] },
        { title: 'Ré', notes: [[4, 0, 2], [4, 0, 2]] },
        { title: 'Sol', notes: [[3, 0, 2], [3, 0, 2]] },
        { title: 'Si', notes: [[2, 0, 2], [2, 0, 2]] },
        { title: 'Mi aguda', notes: [[1, 0, 2], [1, 0, 2]] }
      ]
    },
    {
      id: 'cordas-vizinhas-v1', title: 'Cordas vizinhas', level: 'Iniciante · 2', bpm: 64,
      objective: 'Alternar duas cordas vizinhas sem deixar a anterior soar junto.',
      phrases: [
        { title: 'Mi e lá graves', notes: [[6, 0, 1], [5, 0, 1], [6, 0, 1], [5, 0, 1], [6, 0, 1], [5, 0, 1], [6, 0, 1], [5, 0, 1]] },
        { title: 'Ré e sol', notes: [[4, 0, 1], [3, 0, 1], [4, 0, 1], [3, 0, 1], [4, 0, 1], [3, 0, 1], [4, 0, 1], [3, 0, 1]] },
        { title: 'Si e mi agudas', notes: [[2, 0, 1], [1, 0, 1], [2, 0, 1], [1, 0, 1], [2, 0, 1], [1, 0, 1], [2, 0, 1], [1, 0, 1]] }
      ]
    },
    {
      id: 'primeiras-casas-v1', title: 'Primeiras casas', level: 'Iniciante · 3', bpm: 66,
      objective: 'Combinar cordas soltas e casas 1, 2 e 3, pressionando uma nota de cada vez.',
      phrases: [
        { title: 'Mi, fá sustenido e sol', notes: [[6, 0, 1], [6, 2, 1], [6, 3, 2], [6, 2, 1], [6, 0, 1], [5, 2, 2]] },
        { title: 'Lá, si e dó', notes: [[5, 0, 1], [5, 2, 1], [5, 3, 2], [5, 2, 1], [5, 0, 1], [4, 2, 2]] },
        { title: 'Ré, mi, sol e lá', notes: [[4, 0, 1], [4, 2, 1], [3, 0, 2], [3, 2, 1], [3, 0, 1], [4, 0, 2]] },
        { title: 'Si, dó, ré e mi', notes: [[2, 0, 1], [2, 1, 1], [2, 3, 2], [1, 0, 1], [2, 3, 1], [2, 0, 2]] }
      ]
    },
    {
      id: 'pentatonica-mi-v1', title: 'Pentatônica em mi', level: 'Iniciante · 4', bpm: 72,
      objective: 'Percorrer mi, sol, lá, si e ré em pequenas frases, sem mudar de posição.',
      phrases: [
        { title: 'Subida pelos graves', notes: [[6, 0, 1], [6, 3, 1], [5, 0, 1], [5, 2, 1], [4, 0, 1], [4, 2, 1], [3, 0, 1], [3, 2, 1]] },
        { title: 'Chegada ao mi agudo', notes: [[2, 0, 1], [2, 3, 1], [1, 0, 1], [2, 3, 1], [2, 0, 1], [3, 2, 1], [3, 0, 1], [4, 2, 1]] },
        { title: 'Volta aos graves', notes: [[4, 0, 1], [5, 2, 1], [5, 0, 1], [6, 3, 1], [6, 0, 1], [6, 3, 1], [5, 0, 1], [5, 2, 1]] },
        { title: 'Resposta em mi', notes: [[4, 0, 1], [4, 2, 1], [3, 0, 1], [4, 2, 1], [4, 0, 1], [5, 2, 1], [6, 3, 1], [6, 0, 1]] }
      ]
    },
    {
      id: 'saltos-entre-cordas-v1', title: 'Saltos entre cordas', level: 'Iniciante · 5', bpm: 76,
      objective: 'Pular uma corda com precisão e reconhecer a mesma nota em oitavas diferentes.',
      phrases: [
        { title: 'Oitavas de mi e lá', notes: [[6, 0, 1], [4, 2, 1], [6, 0, 1], [4, 2, 1], [5, 0, 1], [3, 2, 1], [5, 0, 1], [3, 2, 1]] },
        { title: 'Oitavas de ré e sol', notes: [[4, 0, 1], [2, 3, 1], [4, 0, 1], [2, 3, 1], [3, 0, 1], [1, 3, 1], [3, 0, 1], [1, 3, 1]] },
        { title: 'Retorno ao mi', notes: [[3, 2, 1], [5, 0, 1], [3, 2, 1], [5, 0, 1], [4, 2, 1], [6, 0, 1], [4, 2, 1], [6, 0, 1]] }
      ]
    },
    {
      id: 'frase-de-revisao-v1', title: 'Frase de revisão', level: 'Iniciante · 6', bpm: 80,
      objective: 'Juntar ataques repetidos, primeiras casas, trocas de corda e pequenos saltos em mi menor.',
      phrases: [
        { title: 'Pergunta nos graves', notes: [[6, 0, 1], [6, 0, 1], [6, 3, 1], [5, 0, 1], [5, 2, 2], [4, 2, 2]] },
        { title: 'Resposta nos agudos', notes: [[3, 0, 1], [3, 2, 1], [2, 0, 1], [2, 3, 1], [1, 0, 2], [2, 0, 2]] },
        { title: 'Caminho de volta', notes: [[3, 2, 1], [3, 0, 1], [4, 2, 1], [4, 0, 1], [5, 2, 2], [6, 3, 2]] },
        { title: 'Final em mi', notes: [[6, 0, 1], [4, 2, 1], [3, 0, 1], [4, 2, 1], [4, 0, 1], [5, 2, 1], [6, 3, 1], [6, 0, 1]] }
      ]
    },
    {
      id: 'baixo-pulsacao-v1', title: 'Pulsação no contrabaixo', level: 'Iniciante · baixo 1', bpm: 62,
      instrument: 'baixo',
      objective: 'Firmar a pulsação em mi, lá, ré e sol no contrabaixo de quatro cordas, abafando entre ataques.',
      phrases: [
        { title: 'Fundação em mi', notes: [[4, 0, 1], [4, 0, 1], [4, 3, 1], [4, 0, 1]] },
        { title: 'Passo para lá', notes: [[4, 0, 1], [3, 0, 1], [3, 2, 1], [3, 0, 1]] },
        { title: 'Ré e sol', notes: [[2, 0, 1], [2, 2, 1], [1, 0, 1], [2, 2, 1]] },
        { title: 'Volta aos graves', notes: [[3, 2, 1], [4, 3, 1], [4, 0, 1], [4, 0, 1]] }
      ]
    },
    {
      id: 'bateria-pulsacao-v1', title: 'Pulsação na bateria', level: 'Iniciante · bateria 1', bpm: 80,
      instrument: 'bateria',
      objective: 'Firmar bumbo, caixa e chimbal em um pulso simples de quatro tempos.',
      drumPhrases: [
        { title: 'Bumbo e chimbal', notes: [[36, 42], [42], [36, 42], [42]] },
        { title: 'Caixa no contratempo', notes: [[36, 42], [42], [38, 42], [42]] },
        { title: 'Bumbo e caixa', notes: [[36, 42], [38, 42], [36, 42], [38, 42]] }
      ]
    },
    {
      id: 'piano-pulsacao-v1', title: 'Pulsação no piano', level: 'Iniciante · piano 1', bpm: 72,
      instrument: 'piano', objective: 'Praticar notas e acordes simples no teclado MIDI, mantendo o pulso.',
      pianoPhrases: [
        { title: 'Notas fundamentais', notes: [[48], [52], [55], [48]] },
        { title: 'Acordes maiores', notes: [[48, 52, 55], [50, 54, 57], [48, 52, 55], [43, 47, 50]] },
        { title: 'Resposta melódica', notes: [[60], [62], [64], [67], [64], [62], [60], [55]] }
      ]
    }
  ];

  function perfilDa(definicao) {
    var perfil = Perfis.obter(definicao.instrument || 'violao');
    if (perfil && (perfil.layout === 'drums' || perfil.layout === 'piano')) return perfil;
    if (!perfil || !Array.isArray(perfil.tuning) || perfil.tuning.length !== perfil.strings) {
      throw new Error('Perfil de instrumento inválido para o estudo.');
    }
    return perfil;
  }

  function construir(definicao) {
    if (definicao.original) return Core.demoChart();
    var perfil = perfilDa(definicao);
    var beat = 60 / definicao.bpm, cursor = 0, notes = [], sections = [];
    if (perfil.layout === 'drums' || perfil.layout === 'piano') {
      if (perfil.layout === 'piano') {
        definicao.pianoPhrases.forEach(function (phrase, i) {
          var inicio = cursor;
          phrase.notes.forEach(function (teclas) { teclas.forEach(function (midi) { notes.push({ id: definicao.id + '-n' + (notes.length + 1), time: Math.round((2 + cursor * beat) * 1000000) / 1000000, duration: Math.round(0.22 * beat * 1000000) / 1000000, midi: midi, velocity: 96 }); }); cursor += 1; });
          sections.push({ id: definicao.id + '-f' + (i + 1), title: phrase.title, from: Math.round((2 + inicio * beat) * 1000000) / 1000000, to: Math.round((2 + cursor * beat) * 1000000) / 1000000 });
        });
        return Core.validarChart({ id: definicao.id, title: definicao.title, bpm: definicao.bpm, duration: Math.round((cursor * beat + 4) * 1000000) / 1000000, profile: 'piano-midi', layout: 'piano', notes: notes, sections: sections, metadata: { demo: true } });
      }
      definicao.drumPhrases.forEach(function (phrase, i) {
        var inicio = cursor;
        phrase.notes.forEach(function (golpes) {
          golpes.forEach(function (midi) {
            var drum = perfil.drums.find(function (item) { return item.midi === midi; });
            notes.push({ id: definicao.id + '-n' + (notes.length + 1), time: Math.round((2 + cursor * beat) * 1000000) / 1000000,
              duration: Math.round(0.08 * 1000000) / 1000000, drum: drum.id, midi: midi, velocity: midi === 36 ? 112 : 96 });
          });
          cursor += 1;
        });
        sections.push({ id: definicao.id + '-f' + (i + 1), title: phrase.title,
          from: Math.round((2 + inicio * beat) * 1000000) / 1000000,
          to: Math.round((2 + cursor * beat) * 1000000) / 1000000 });
      });
      return Core.validarChart({ id: definicao.id, title: definicao.title, bpm: definicao.bpm,
        duration: Math.round((cursor * beat + 4) * 1000000) / 1000000, profile: 'bateria-midi',
        layout: 'drums', notes: notes, sections: sections, metadata: { demo: true } });
    }
    function segundos(tempos) { return Math.round((2 + tempos * beat) * 1000000) / 1000000; }
    definicao.phrases.forEach(function (phrase, i) {
      var inicio = cursor;
      phrase.notes.forEach(function (event) {
        var string = event[0], fret = event[1], tempos = event[2];
        notes.push({ id: definicao.id + '-n' + (notes.length + 1), time: segundos(cursor),
          duration: Math.round(tempos * beat * 0.72 * 1000000) / 1000000,
          string: string, fret: fret, midi: perfil.tuning[perfil.strings - string] + fret });
        cursor += tempos;
      });
      sections.push({ id: definicao.id + '-f' + (i + 1), title: phrase.title, from: segundos(inicio), to: segundos(cursor) });
    });
    return Core.validarChart({ id: definicao.id, title: definicao.title, bpm: definicao.bpm,
      duration: segundos(cursor) + 2, tuning: perfil.tuning.slice(), notes: notes, sections: sections, metadata: { demo: true } });
  }

  function listar() {
    return DEFINICOES.map(function (definicao) {
      var estudo = { id: definicao.id, title: definicao.title, objective: definicao.objective,
        level: definicao.level, chart: construir(definicao) };
      if (definicao.instrument) estudo.instrument = definicao.instrument;
      return estudo;
    });
  }
  function obter(id) {
    var definicao = DEFINICOES.find(function (item) { return item.id === id; });
    return definicao ? construir(definicao) : null;
  }

  return { listar: listar, obter: obter };
});
