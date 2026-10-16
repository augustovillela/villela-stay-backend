// Musique — chart e julgamento monofônico de treino. Funções sem DOM,
// banco, áudio ou usuário. A entrada é uma medida; corda/casa vêm do
// arranjo, pois a mesma altura pode ser tocada em posições diferentes.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./perfis'));
  else root.MusiqueTocarCore = factory(root.MusiqueTocarPerfis);
})(typeof self !== 'undefined' ? self : this, function (Perfis) {
  'use strict';

  if (!Perfis || typeof Perfis.porAfinacao !== 'function') throw new Error('Carregue MusiqueTocarPerfis antes do núcleo de arranjos.');
  var PADRAO = [40, 45, 50, 55, 59, 64]; // da corda grave à aguda
  var EPS = 1e-7;
  function exigir(ok, mensagem) { if (!ok) throw new Error(mensagem); }
  function numero(v) { return typeof v === 'number' && Number.isFinite(v); }
  function objeto(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function texto(v, nome, max) {
    exigir(typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v), nome + ' deve ser texto simples de até ' + max + ' caracteres.');
    return v.trim();
  }
  function id(v, nome) {
    exigir(typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v), nome + ' inválido (use letras, números, _ ou -).');
    return v;
  }
  function limite(v, min, max, nome) {
    exigir(numero(v) && v >= min && v <= max, nome + ' deve estar entre ' + min + ' e ' + max + '.');
    return v;
  }
  function tem(obj, chave) { return Object.prototype.hasOwnProperty.call(obj, chave); }
  function camposExatos(valor, esperados, nome) {
    exigir(objeto(valor), nome + ' deve ser um objeto.');
    var chaves = Object.keys(valor);
    exigir(chaves.length === esperados.length && esperados.every(function (chave) { return tem(valor, chave); }), nome + ' contém campos inválidos.');
  }
  function validarTempoMap(input, chart) {
    // A ausência mantém exatamente o contrato antigo. Quando presente, o
    // mapa é deliberadamente fechado: a interface e o metrônomo dependem de
    // tempo, batida e BPM serem a mesma medida que veio do MIDI.
    if (!tem(input, 'tempoMap')) return;
    var mapa = input.tempoMap;
    camposExatos(mapa, ['version', 'events'], 'Mapa de andamento');
    exigir(mapa.version === 1, 'Versão do mapa de andamento inválida.');
    exigir(Array.isArray(mapa.events) && mapa.events.length >= 2 && mapa.events.length <= 512, 'Mapa de andamento deve conter de 2 a 512 eventos.');
    var anterior = null, TOLERANCIA_MAPA_TEMPO = 0.000001;
    chart.tempoMap = {
      version: 1,
      events: mapa.events.map(function (evento, indice) {
        camposExatos(evento, ['time', 'beat', 'bpm'], 'Evento de andamento ' + (indice + 1));
        var time = limite(evento.time, 0, chart.duration, 'Tempo do evento de andamento ' + (indice + 1));
        var beat = evento.beat;
        exigir(numero(beat) && beat >= 0, 'Batida do evento de andamento ' + (indice + 1) + ' deve ser um número não negativo.');
        var bpm = limite(evento.bpm, 20, 300, 'BPM do evento de andamento ' + (indice + 1));
        if (indice === 0) {
          exigir(time === 0 && beat === 0, 'O primeiro evento de andamento deve começar em tempo e batida zero.');
          exigir(bpm === chart.bpm, 'O BPM do arranjo deve ser igual ao primeiro evento de andamento.');
        } else {
          exigir(time > anterior.time && beat > anterior.beat, 'Eventos de andamento devem crescer estritamente em tempo e batida.');
          var beatEsperado = anterior.beat + (time - anterior.time) * anterior.bpm / 60;
          exigir(Math.abs(beat - beatEsperado) <= TOLERANCIA_MAPA_TEMPO,
            'Tempo e batida do evento de andamento ' + (indice + 1) + ' não correspondem ao BPM anterior.');
        }
        anterior = { time: time, beat: beat, bpm: bpm };
        return { time: time, beat: beat, bpm: bpm };
      })
    };
  }

  var BATERIA = Object.freeze({
    36: 'bumbo', 38: 'caixa', 42: 'chimbal-fechado', 46: 'chimbal-aberto',
    45: 'tom-baixo', 47: 'tom-medio', 50: 'tom-alto', 41: 'surdo-baixo',
    49: 'crash', 51: 'ride'
  });

  function validarBateria(input) {
    exigir(input.profile === 'bateria-midi' && input.layout === 'drums', 'O arranjo de bateria deve declarar profile bateria-midi e layout drums.');
    exigir(!tem(input, 'tuning'), 'Arranjo de bateria não usa afinação.');
    var chart = {
      id: id(input.id, 'id do arranjo'), title: texto(input.title, 'Título', 120),
      bpm: limite(input.bpm, 20, 300, 'BPM'), duration: limite(input.duration, 0.04, 900, 'Duração'),
      profile: 'bateria-midi', layout: 'drums', notes: []
    };
    validarTempoMap(input, chart);
    exigir(Array.isArray(input.notes) && input.notes.length > 0 && input.notes.length <= 2000, 'O arranjo deve ter de 1 a 2000 golpes.');
    var ids = Object.create(null);
    chart.notes = input.notes.map(function (n, i) {
      exigir(objeto(n), 'Golpe ' + (i + 1) + ' inválido.');
      camposExatos(n, ['id', 'time', 'duration', 'drum', 'midi', 'velocity'], 'Golpe ' + (i + 1));
      var nid = id(n.id, 'id do golpe ' + (i + 1));
      exigir(!ids[nid], 'id de golpe repetido: ' + nid); ids[nid] = true;
      var start = limite(n.time, 0, 900, 'Início do golpe ' + nid);
      var dur = limite(n.duration, 0.02, 60, 'Duração do golpe ' + nid);
      exigir(start + dur <= chart.duration + EPS, 'O golpe ' + nid + ' ultrapassa a duração do arranjo.');
      exigir(typeof n.drum === 'string' && BATERIA[n.midi] === n.drum, 'Peça e MIDI discordam no golpe ' + nid + '.');
      exigir(Number.isInteger(n.midi) && BATERIA[n.midi], 'MIDI de bateria não suportado no golpe ' + nid + '.');
      exigir(Number.isInteger(n.velocity) && n.velocity >= 1 && n.velocity <= 127, 'Velocity inválida no golpe ' + nid + '.');
      return { id: nid, time: start, duration: dur, drum: n.drum, midi: n.midi, velocity: n.velocity };
    }).sort(function (a, b) { return a.time - b.time || a.midi - b.midi; });
    var fimPorMidi = Object.create(null);
    chart.notes.forEach(function (n) {
      exigir(fimPorMidi[n.midi] === undefined || n.time + EPS >= fimPorMidi[n.midi], 'Golpes da mesma peça se sobrepõem: ' + n.id + '.');
      fimPorMidi[n.midi] = n.time + n.duration;
    });
    if (input.sections != null) {
      exigir(Array.isArray(input.sections) && input.sections.length <= 100, 'Trechos inválidos (máximo 100).');
      var secIds = Object.create(null);
      chart.sections = input.sections.map(function (s) {
        exigir(objeto(s), 'Trecho inválido.');
        var sid = id(s.id, 'id do trecho'); exigir(!secIds[sid], 'id de trecho repetido: ' + sid); secIds[sid] = true;
        var from = limite(s.from, 0, chart.duration, 'Início do trecho');
        var to = limite(s.to, 0, chart.duration, 'Fim do trecho');
        exigir(to > from, 'O fim do trecho deve vir depois do início.');
        return { id: sid, title: texto(s.title, 'Título do trecho', 80), from: from, to: to };
      }).sort(function (a, b) { return a.from - b.from; });
    }
    if (input.metadata != null) {
      exigir(objeto(input.metadata), 'Metadados inválidos.');
      chart.metadata = { demo: input.metadata.demo === true };
    }
    return chart;
  }
  function validarPiano(input) {
    exigir(input.profile === 'piano-midi' && input.layout === 'piano', 'O arranjo de piano deve declarar profile piano-midi e layout piano.');
    exigir(!tem(input, 'tuning'), 'Arranjo de piano não usa afinação.');
    var chart = { id: id(input.id, 'id do arranjo'), title: texto(input.title, 'Título', 120), bpm: limite(input.bpm, 20, 300, 'BPM'), duration: limite(input.duration, 0.04, 900, 'Duração'), profile: 'piano-midi', layout: 'piano', notes: [] };
    validarTempoMap(input, chart); exigir(Array.isArray(input.notes) && input.notes.length > 0 && input.notes.length <= 2000, 'O arranjo deve ter de 1 a 2000 notas.');
    var ids = Object.create(null); chart.notes = input.notes.map(function (n, i) {
      exigir(objeto(n), 'Nota de piano inválida.'); camposExatos(n, ['id','time','duration','midi','velocity'], 'Nota de piano ' + (i + 1));
      var nid = id(n.id, 'id da nota ' + (i + 1)); exigir(!ids[nid], 'id de nota repetido: ' + nid); ids[nid] = true;
      var start = limite(n.time, 0, 900, 'Início da nota ' + nid), dur = limite(n.duration, 0.02, 60, 'Duração da nota ' + nid);
      exigir(start + dur <= chart.duration + EPS, 'A nota ultrapassa a duração do arranjo.'); exigir(Number.isInteger(n.midi) && n.midi >= 21 && n.midi <= 108, 'Tecla MIDI fora do piano de 88 teclas.'); exigir(Number.isInteger(n.velocity) && n.velocity >= 1 && n.velocity <= 127, 'Velocity inválida.');
      return { id: nid, time: start, duration: dur, midi: n.midi, velocity: n.velocity };
    }).sort(function (a,b) { return a.time-b.time || a.midi-b.midi; });
    // Uma tecla física não produz duas notas independentes sustentadas ao
    // mesmo tempo. Acordes continuam permitidos entre alturas diferentes.
    var fimPorMidi = Object.create(null);
    chart.notes.forEach(function (n) {
      exigir(fimPorMidi[n.midi] === undefined || n.time + EPS >= fimPorMidi[n.midi], 'Notas da mesma tecla se sobrepõem: ' + n.id + '.');
      fimPorMidi[n.midi] = n.time + n.duration;
    });
    if (input.sections != null) {
      exigir(Array.isArray(input.sections) && input.sections.length <= 100, 'Trechos inválidos (máximo 100).');
      var secIds = Object.create(null);
      chart.sections = input.sections.map(function (s) {
        exigir(objeto(s), 'Trecho inválido.');
        var sid = id(s.id, 'id do trecho'); exigir(!secIds[sid], 'id de trecho repetido: ' + sid); secIds[sid] = true;
        var from = limite(s.from, 0, chart.duration, 'Início do trecho');
        var to = limite(s.to, 0, chart.duration, 'Fim do trecho');
        exigir(to > from, 'O fim do trecho deve vir depois do início.');
        return { id: sid, title: texto(s.title, 'Título do trecho', 80), from: from, to: to };
      }).sort(function (a, b) { return a.from - b.from; });
    }
    if (input.metadata != null) {
      exigir(objeto(input.metadata), 'Metadados inválidos.');
      chart.metadata = { demo: input.metadata.demo === true };
    }
    return chart;
  }

  function validarChart(input) {
    exigir(objeto(input), 'O arranjo deve ser um objeto.');
    if (input.profile === 'bateria-midi' || input.layout === 'drums') return validarBateria(input);
    if (input.profile === 'piano-midi' || input.layout === 'piano') return validarPiano(input);
    var chart = {
      id: id(input.id, 'id do arranjo'), title: texto(input.title, 'Título', 120),
      bpm: limite(input.bpm, 20, 300, 'BPM'), duration: limite(input.duration, 0.04, 900, 'Duração'),
      tuning: (input.tuning == null ? PADRAO : input.tuning), notes: [],
    };
    exigir(Array.isArray(chart.tuning) && (chart.tuning.length === 4 || chart.tuning.length === 5 || chart.tuning.length === 6), 'Afinação deve conter quatro, cinco ou seis alturas MIDI, da corda grave à aguda.');
    chart.tuning = chart.tuning.map(function (m) {
      exigir(Number.isInteger(m) && m >= 24 && m <= 88, 'Altura da afinação fora da faixa MIDI aceita (24–88).');
      return m;
    });
    var perfil = Perfis.porAfinacao(chart.tuning);
    // Afinações customizadas mantêm o limite histórico de 24 casas.
    var maxCasas = perfil ? perfil.frets : 24;
    validarTempoMap(input, chart);
    exigir(Array.isArray(input.notes) && input.notes.length > 0 && input.notes.length <= 2000, 'O arranjo deve ter de 1 a 2000 notas.');
    var ids = Object.create(null);
    chart.notes = input.notes.map(function (n, i) {
      exigir(objeto(n), 'Nota ' + (i + 1) + ' inválida.');
      var nid = id(n.id, 'id da nota ' + (i + 1));
      exigir(!ids[nid], 'id de nota repetido: ' + nid); ids[nid] = true;
      var start = limite(n.time, 0, 900, 'Início da nota ' + nid);
      var dur = limite(n.duration, 0.04, 60, 'Duração da nota ' + nid);
      exigir(start + dur <= chart.duration + EPS, 'A nota ' + nid + ' ultrapassa a duração do arranjo.');
      exigir(Number.isInteger(n.string) && n.string >= 1 && n.string <= chart.tuning.length,
        'Corda inválida na nota ' + nid + ' (1 é a corda mais aguda).');
      exigir(Number.isInteger(n.fret) && n.fret >= 0 && n.fret <= maxCasas, 'Casa inválida na nota ' + nid + ' (0–' + maxCasas + ').');
      var midi = chart.tuning[chart.tuning.length - n.string] + n.fret;
      exigir(Number.isInteger(n.midi) && n.midi === midi && midi <= 127, 'MIDI, corda, casa e afinação discordam na nota ' + nid + '.');
      return { id: nid, time: start, duration: dur, string: n.string, fret: n.fret, midi: midi };
    }).sort(function (a, b) { return a.time - b.time; });
    for (var i = 1; i < chart.notes.length; i++) {
      var ant = chart.notes[i - 1], atual = chart.notes[i];
      exigir(atual.time + EPS >= ant.time + ant.duration, 'Notas sobrepostas: ' + ant.id + ' e ' + atual.id + '. Este modo aceita uma nota por vez.');
    }
    if (input.sections != null) {
      exigir(Array.isArray(input.sections) && input.sections.length <= 100, 'Trechos inválidos (máximo 100).');
      var secIds = Object.create(null);
      chart.sections = input.sections.map(function (s) {
        exigir(objeto(s), 'Trecho inválido.');
        var sid = id(s.id, 'id do trecho'); exigir(!secIds[sid], 'id de trecho repetido: ' + sid); secIds[sid] = true;
        var from = limite(s.from, 0, chart.duration, 'Início do trecho');
        var to = limite(s.to, 0, chart.duration, 'Fim do trecho');
        exigir(to > from, 'O fim do trecho deve vir depois do início.');
        return { id: sid, title: texto(s.title, 'Título do trecho', 80), from: from, to: to };
      }).sort(function (a, b) { return a.from - b.from; });
    }
    // Metadados descritivos não entram na medida nem permitem executar código.
    if (input.metadata != null) {
      exigir(objeto(input.metadata), 'Metadados inválidos.');
      chart.metadata = { demo: input.metadata.demo === true };
    }
    return chart;
  }

  function demoChart() {
    // Exercício original em mi menor: 8 frases de 6 notas. Os intervalos
    // são deliberadamente espaçosos para a primeira ligação da guitarra.
    var frases = [[0, 2, 2, 0, 0, 3], [3, 2, 0, 2, 0, 0], [0, 3, 2, 0, 3, 0], [2, 2, 0, 2, 0, 2],
      [0, 2, 2, 0, 0, 0], [3, 2, 0, 0, 3, 3], [2, 0, 2, 2, 0, 2], [0, 2, 2, 0, 0, 0]];
    var spans = [2, 1, 2, 1, 2, 2], beat = 60 / 90, t = 2, notes = [], sections = [];
    frases.forEach(function (frets, p) {
      var begin = t;
      frets.forEach(function (fret, j) {
        var span = spans[j] * beat;
        notes.push({ id: 'demo-' + (p * 6 + j + 1), time: t, duration: span * 0.65, string: 6 - j, fret: fret, midi: PADRAO[j] + fret });
        t += span;
      });
      sections.push({ id: 'frase-' + (p + 1), title: 'Frase ' + (p + 1), from: begin, to: t });
    });
    return validarChart({ id: 'primeiro-riff-v1', title: 'Primeiro riff', bpm: 90, duration: t + 2,
      tuning: PADRAO.slice(), notes: notes, sections: sections, metadata: { demo: true } });
  }

  function criarJulgador(input, options) {
    var chart = validarChart(input), o = options || {};
    if (chart.layout === 'drums' || chart.layout === 'piano') return criarJulgadorBateria(chart, o);
    function opt(k, pad, min, max) { return limite(o[k] == null ? pad : o[k], min, max, k); }
    var offset = opt('offsetMs', 0, -2000, 2000) / 1000;
    var tolerance = opt('toleranceMs', 180, 20, 1000) / 1000;
    var centsTolerance = opt('centsTolerance', 45, 1, 50);
    var stable = opt('stableMs', 40, 20, 250) / 1000;
    var minConfidence = opt('minConfidence', 0.7, 0, 1);
    var minRms = opt('minRms', 0.003, 0.000001, 1);
    var from = opt('from', 0, 0, chart.duration), to = opt('to', chart.duration, 0, chart.duration);
    exigir(to > from, 'O fim da prática deve vir depois do início.');
    var notes = chart.notes.filter(function (n) { return n.time >= from && n.time < to; });
    var states = notes.map(function (n) { return { id: n.id, status: 'pending' }; });
    var segment = null, silence = null, attack = 0, attackMidi = null, change = null;
    var usedAttacks = Object.create(null), lastSample = -Infinity, lastOnset = -Infinity;
    function copy(s) { return Object.assign({}, s); }

    function expire(correctedTime) {
      var changed = [];
      notes.forEach(function (n, i) {
        // Dá tempo para confirmar 40 ms de uma entrada no fim da janela.
        if (states[i].status === 'pending' && correctedTime > n.time + tolerance + stable + EPS) {
          states[i].status = 'miss'; changed.push(copy(states[i]));
        }
      });
      return changed;
    }
    function avancar(time) { return numero(time) ? expire(time - offset) : []; }

    function amostrar(sample) {
      if (!objeto(sample) || !numero(sample.time) || sample.time < lastSample) return null;
      var time = sample.time - offset;
      lastSample = sample.time;
      var quiet = numero(sample.rms) && sample.rms < minRms;
      var valid = numero(sample.hz) && sample.hz > 0 && numero(sample.confidence) && sample.confidence >= minConfidence && sample.confidence <= 1 && numero(sample.rms) && sample.rms >= minRms;
      if (!valid) {
        if (quiet) { if (silence === null) silence = time; } else silence = null;
        segment = null; change = null;
        expire(time); return null;
      }
      var exact = 69 + 12 * Math.log(sample.hz / 440) / Math.LN2;
      var midi = Math.round(exact), cents = (exact - midi) * 100;
      if (!numero(exact) || midi < 0 || midi > 127) { segment = null; expire(time); return null; }
      var onset = sample.onset === true && time - lastOnset >= 0.06 - EPS;
      var fresh = attackMidi === null || onset || (silence !== null && time - silence >= 0.03 - EPS);
      silence = null;
      if (fresh) {
        attack++; attackMidi = midi; change = null; segment = null;
        if (onset) lastOnset = time;
      } else if (midi !== attackMidi) {
        if (!change || change.midi !== midi) change = { midi: midi, start: time };
        // Uma oscilação isolada do detector não cria outra palhetada.
        if (time - change.start >= stable - EPS) { attack++; attackMidi = midi; change = null; }
      } else change = null;

      // Um buraco de leitura não prova continuidade do som. O novo
      // segmento exige confirmação; ele não cria sozinho novo ataque.
      if (!segment || segment.midi !== midi || time - segment.end > 0.075) {
        segment = { midi: midi, start: time, end: time, sum: cents, count: 1 };
      } else { segment.end = time; segment.sum += cents; segment.count++; }
      var result = null;
      if (time - segment.start >= stable - EPS && midi === attackMidi && !usedAttacks[attack]) {
        var meanCents = segment.sum / segment.count, best = -1, bestDistance = Infinity;
        if (Math.abs(meanCents) <= centsTolerance + EPS) {
          notes.forEach(function (n, i) {
            var distance = Math.abs(segment.start - n.time);
            // MIDI absoluto: tocar uma oitava acima não acerta o alvo.
            if (states[i].status === 'pending' && n.midi === midi && distance <= tolerance + EPS && distance < bestDistance) {
              best = i; bestDistance = distance;
            }
          });
        }
        if (best >= 0) {
          states[best] = { id: notes[best].id, status: 'hit', timingMs: Math.round((segment.start - notes[best].time) * 1000), cents: Math.round(meanCents * 10) / 10 };
          usedAttacks[attack] = true; result = copy(states[best]);
        }
      }
      expire(time); return result;
    }

    function resumo() {
      var hits = 0, misses = 0, timing = 0, cents = 0;
      states.forEach(function (s) {
        if (s.status === 'hit') { hits++; timing += Math.abs(s.timingMs); cents += Math.abs(s.cents); }
        else if (s.status === 'miss') misses++;
      });
      var done = hits + misses;
      return { total: states.length, hits: hits, misses: misses, pending: states.length - done,
        accuracy: done ? Math.round(1000 * hits / done) / 10 : 0,
        completion: states.length ? Math.round(1000 * done / states.length) / 10 : 0,
        meanAbsTimingMs: hits ? Math.round(timing / hits) : null,
        meanAbsCents: hits ? Math.round(cents / hits * 10) / 10 : null,
        trainingOnly: true };
    }
    return { amostrar: amostrar, avancar: avancar, resumo: resumo, estados: function () { return states.map(copy); } };
  }

  function criarJulgadorBateria(chart, o) {
    function opt(k, pad, min, max) { return limite(o[k] == null ? pad : o[k], min, max, k); }
    var offset = opt('offsetMs', 0, -2000, 2000) / 1000;
    var tolerance = opt('toleranceMs', 180, 20, 1000) / 1000;
    var from = opt('from', 0, 0, chart.duration), to = opt('to', chart.duration, 0, chart.duration);
    exigir(to > from, 'O fim da prática deve vir depois do início.');
    var notes = chart.notes.filter(function (n) { return n.time >= from && n.time < to; });
    var states = notes.map(function (n) { return { id: n.id, status: 'pending' }; });
    function copy(s) { return Object.assign({}, s); }
    function expire(time) {
      notes.forEach(function (n, i) {
        if (states[i].status === 'pending' && time > n.time + tolerance + EPS) states[i] = { id: n.id, status: 'miss' };
      });
    }
    function amostrar(evento) {
      if (!objeto(evento) || !numero(evento.time) || !Number.isInteger(evento.midi) || evento.velocity === 0) return null;
      var time = evento.time - offset;
      expire(time);
      var best = -1, distance = Infinity;
      notes.forEach(function (n, i) {
        var d = Math.abs(time - n.time);
        if (states[i].status === 'pending' && n.midi === evento.midi && d <= tolerance + EPS && d < distance) { best = i; distance = d; }
      });
      if (best < 0) return null;
      var target = notes[best];
      states[best] = { id: target.id, status: 'hit', timingMs: Math.round((time - target.time) * 1000), velocity: evento.velocity };
      return copy(states[best]);
    }
    function resumo() {
      var hits = 0, misses = 0, timing = 0;
      states.forEach(function (s) { if (s.status === 'hit') { hits++; timing += Math.abs(s.timingMs); } else if (s.status === 'miss') misses++; });
      var done = hits + misses;
      return { total: states.length, hits: hits, misses: misses, pending: states.length - done,
        accuracy: done ? Math.round(1000 * hits / done) / 10 : 0, completion: states.length ? Math.round(1000 * done / states.length) / 10 : 0,
        meanAbsTimingMs: hits ? Math.round(timing / hits) : null, meanAbsCents: null, trainingOnly: true };
    }
    return { amostrar: amostrar, avancar: function (time) { if (numero(time)) expire(time - offset); }, resumo: resumo, estados: function () { return states.map(copy); } };
  }

  return { validarChart: validarChart, demoChart: demoChart, criarJulgador: criarJulgador };
});
