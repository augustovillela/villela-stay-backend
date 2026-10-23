// Gera um rascunho rítmico a partir da sequência harmônica de uma cifra.
// O resultado é deliberadamente aproximado: a cifra não informa o instante
// exato de cada troca. Cada acorde vira um ataque da fundamental, para que o
// responsável revise e complete o arranjo no editor do Tocar junto.
'use strict';

const Acorde = require('./acorde');

const PADRAO = Object.freeze([40, 45, 50, 55, 59, 64]); // grave → aguda

function texto(v, fallback) { return typeof v === 'string' && v.trim() ? v.trim() : fallback; }
function numero(v, fallback, min, max) { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : fallback; }

function ocorrencias(doc) {
  const out = [];
  if (!doc || !Array.isArray(doc.secoes)) return out;
  for (const secao of doc.secoes) {
    for (const linha of (secao.linhas || [])) {
      if (linha.tipo !== 'letra') continue;
      for (const segmento of (linha.segmentos || [])) {
        if (segmento && segmento.acorde) out.push(String(segmento.acorde));
      }
    }
  }
  return out;
}

function posicaoFundamental(pc) {
  let melhor = null;
  for (let string = 1; string <= PADRAO.length; string++) {
    const base = PADRAO[PADRAO.length - string];
    for (let oitava = 2; oitava <= 5; oitava++) {
      const alvo = pc + oitava * 12;
      const fret = alvo - base;
      if (fret < 0 || fret > 12) continue;
      const custo = Math.abs(fret - 3) + (fret === 0 ? 0.5 : 0);
      if (!melhor || custo < melhor.custo) melhor = { string, fret, midi: alvo, custo };
    }
  }
  return melhor;
}

function gerar(doc, opcoes) {
  const o = opcoes || {};
  const bpm = numero(o.bpm != null ? o.bpm : doc && doc.meta && doc.meta.bpm, 90, 20, 300);
  const batida = 60 / bpm;
  const acordes = ocorrencias(doc);
  const notes = [];
  const desconhecidos = [];
  acordes.forEach((nome, i) => {
    const acorde = Acorde.ler(nome, { latina: doc && doc.meta && doc.meta.notacao === 'latina' });
    if (!acorde || !acorde.raiz || !Number.isInteger(acorde.raiz.pc)) { desconhecidos.push(nome); return; }
    const pos = posicaoFundamental(acorde.raiz.pc);
    if (!pos) { desconhecidos.push(nome); return; }
    notes.push({ id: 'cifra-' + (i + 1), time: i * batida, duration: Math.max(0.12, batida * 0.8), string: pos.string, fret: pos.fret, midi: pos.midi });
  });
  if (!notes.length) throw new Error('A cifra não contém acordes reconhecidos para criar o rascunho.');
  const duration = notes[notes.length - 1].time + batida;
  return {
    id: texto(o.id, 'cifra-acompanhamento-' + Date.now()),
    title: texto(o.title, (doc && doc.meta && doc.meta.titulo) || 'Acompanhamento rítmico'),
    bpm, duration, tuning: PADRAO.slice(), notes,
    sections: [{ id: 'cifra-inteira', title: 'Cifra inteira', from: 0, to: duration }],
    metadata: { demo: false, origem: 'musique.cifra', estrategia: 'fundamentais-em-pulsos', aproximado: true, acordes: acordes.length, desconhecidos },
  };
}

module.exports = { gerar, ocorrencias, PADRAO };
