'use strict';

const Acorde = require('./acorde');
const Guia = require('./acompanhamento');

const GUITARRA = Guia.PADRAO;
const BAIXO = [28, 33, 38, 43];
const DRUMS = { kick: 36, snare: 38, hihat: 42 };

function num(v, fallback, min, max) { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : fallback; }
function texto(v, fallback) { return typeof v === 'string' && v.trim() ? v.trim() : fallback; }
function posicao(tuning, midi) {
  let melhor = null;
  for (let string = 1; string <= tuning.length; string++) {
    const base = tuning[tuning.length - string];
    const fret = midi - base;
    if (fret < 0 || fret > 24) continue;
    const custo = Math.abs(fret - 3) + (fret === 0 ? 0.5 : 0);
    if (!melhor || custo < melhor.custo) melhor = { string, fret, midi, custo };
  }
  return melhor;
}
function notaPc(pc, oitava) { return ((pc % 12) + 12) % 12 + oitava * 12; }
function evento(midi, atMs, durationMs, velocity) { return { type: 'note', atMs, durationMs, midi, velocity }; }

/**
 * Cria um pacote multifaixa próprio do Musique a partir da harmonia de uma
 * cifra. É uma maqueta musical editável: a cifra não fornece a gravação nem
 * as vozes exatas, por isso bateria, baixo e teclado usam padrões simples.
 */
function gerar(doc, opcoes) {
  const o = opcoes || {}, bpm = num(o.bpm != null ? o.bpm : doc && doc.meta && doc.meta.bpm, 90, 20, 300);
  const beatMs = 60000 / bpm, ocorrencias = Guia.ocorrencias(doc), desconhecidos = [];
  const guitar = [], bass = [], piano = [], drums = [];
  ocorrencias.forEach((nome, i) => {
    const ac = Acorde.ler(nome, { latina: doc && doc.meta && doc.meta.notacao === 'latina' });
    if (!ac || !ac.raiz || !Number.isInteger(ac.raiz.pc)) { desconhecidos.push(nome); return; }
    const at = Math.round(i * beatMs), dur = Math.max(80, Math.round(beatMs * 0.8)), root = notaPc(ac.raiz.pc, 3);
    const gp = posicao(GUITARRA, root); if (gp) guitar.push({ ...evento(root, at, dur, 96), string: gp.string, fret: gp.fret });
    const bassMidi = notaPc(ac.raiz.pc, 2); bass.push(evento(bassMidi, at, dur, 104));
    const chordNotes = Array.isArray(Acorde.notas(ac)) ? Acorde.notas(ac).slice(0, 4) : [ac.raiz.pc];
    chordNotes.forEach((pc, j) => piano.push(evento(notaPc(pc, j === 0 ? 3 : 4), at, dur, 78 - j * 4)));
    drums.push(evento(DRUMS.kick, at, 100, 108));
    drums.push(evento(DRUMS.hihat, at, 70, 62));
    drums.push(evento(DRUMS.hihat, at + Math.round(beatMs / 2), 70, 48));
    if (i % 4 === 2) drums.push(evento(DRUMS.snare, at, 100, 92));
  });
  if (!guitar.length && !bass.length && !piano.length) throw new Error('A cifra não contém acordes reconhecidos para gerar o arranjo.');
  const durationMs = Math.round(Math.max(beatMs, ocorrencias.length * beatMs));
  const title = texto(o.title, (doc && doc.meta && doc.meta.titulo) || 'Arranjo multifaixa');
  return { schema: 'musique.arrangement.v1', id: texto(o.id, 'cifra-multifaixa-' + Date.now()), title,
    tempo: { bpm, unit: 4 }, meter: { beats: 4, beatUnit: 4 }, durationMs,
    tracks: [
      { id: 'violao-aluno', instrument: 'violao', tuning: GUITARRA.slice(), events: guitar },
      { id: 'baixo-acompanhamento', instrument: 'baixo', tuning: BAIXO.slice(), events: bass },
      { id: 'piano-acompanhamento', instrument: 'piano', events: piano },
      { id: 'bateria-acompanhamento', instrument: 'bateria', events: drums.map((e) => ({ ...e, drum: e.midi === DRUMS.kick ? 'kick' : e.midi === DRUMS.snare ? 'snare' : 'hihat' })) },
    ], sections: [{ id: 'cifra-inteira', title: 'Cifra inteira', fromMs: 0, toMs: durationMs }],
    sources: [{ format: 'musique.cifra', name: texto(o.sourceName, 'cifra-do-acervo') }],
    metadata: { aproximado: true, estrategia: 'harmonia-mais-padrao-multifaixa', acordes: ocorrencias.length, desconhecidos },
  };
}

module.exports = { gerar, GUITARRA, BAIXO, DRUMS };
