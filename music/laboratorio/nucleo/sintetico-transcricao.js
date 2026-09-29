// =====================================================================
// Musique · Laboratório — gerador de MÚSICA SINTÉTICA para testar a
// transcrição com a resposta conhecida (oráculo independente: o sinal
// nasce da partitura, e o teste compara a partitura com o que o núcleo
// ouviu). Só usado nos testes; não vai ao navegador.
// =====================================================================
'use strict';
const N = require('./notas');
const A = require('./acordes');

const FREQ = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Gerador pseudoaleatório determinístico (mesma semente, mesmo sinal). */
function rng(semente) { let s = semente >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

/**
 * o: { taxa, bpm, compasso, acordes: ['C','G','Am','F'] (1 por compasso),
 *      repeticoes, melodia: true|false, bateria: true|false, semente }
 * Devolve { amostras: Float32Array, esperado: { acordes por compasso,
 * melodia [{t, midi}], bpm } }.
 */
function musica(o) {
  const taxa = o.taxa || 22050, bpm = o.bpm || 100, comp = o.compasso || 4, rep = o.repeticoes || 2;
  const tb = 60 / bpm, seq = []; for (let r = 0; r < rep; r++) seq.push(...o.acordes);
  const intro = o.intro || 0;   // segundos de silêncio antes
  const dur = intro + seq.length * comp * tb + 0.5;
  const x = new Float32Array(Math.ceil(dur * taxa));
  const rnd = rng(o.semente || 7);
  const nota = (f, t0, d, amp, harm, decai) => {
    const i0 = Math.floor(t0 * taxa), n = Math.floor(d * taxa);
    for (let i = 0; i < n && i0 + i < x.length; i++) {
      const t = i / taxa, env = Math.min(1, t / 0.01) * Math.exp(-t * (decai || 1.5)) * Math.min(1, (d - t) / 0.03);
      let v = 0; harm.forEach((a, h) => { v += a * Math.sin(2 * Math.PI * f * (h + 1) * t); });
      x[i0 + i] += amp * env * v;
    }
  };
  const melodia = [];
  seq.forEach((cifra, c) => {
    const ac = A.ler(cifra); const ns = A.notas(N.comOitava(ac.fundamental, 3), ac.id).map(N.midi);
    const t0 = intro + c * comp * tb;
    // baixo: fundamental na 2ª oitava, em cada tempo
    for (let b = 0; b < comp; b++) nota(FREQ(N.midi(N.comOitava(ac.fundamental, 2))), t0 + b * tb, tb * 0.95, 0.35, [1, 0.5, 0.25], 2);
    // acordes: bloco a cada 2 tempos (piano elétrico)
    for (let b = 0; b < comp; b += 2) ns.forEach((m) => nota(FREQ(m + 12), t0 + b * tb, tb * 1.9, 0.12, o.serra ? [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8] : [1, 0.4, 0.2, 0.1], 1.2));
    // bateria: bumbo nos tempos 1 e 3, caixa (ruído) nos tempos 2 e 4
    if (o.bateria !== false) for (let b = 0; b < comp; b++) {
      const tt = t0 + b * tb, i0 = Math.floor(tt * taxa);
      if (b % 2 === 0) nota(55, tt, 0.25, 0.5, [1], 18);
      else for (let i = 0; i < 0.12 * taxa && i0 + i < x.length; i++) x[i0 + i] += 0.25 * (rnd() * 2 - 1) * Math.exp(-i / taxa * 35);
    }
    // melodia: notas do acorde (uma por tempo), 2 oitavas acima, mais forte e brilhante
    if (o.melodia !== false) for (let b = 0; b < comp; b++) {
      const m = ns[(b + c) % ns.length] + 24 > 84 ? ns[(b + c) % ns.length] + 12 : ns[(b + c) % ns.length] + 24;
      nota(FREQ(m), t0 + b * tb, tb * 0.9, 0.3, o.serra ? [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8, 1 / 9, 1 / 10] : [1, 0.6, 0.4, 0.25, 0.15], 0.8);   // serra: todos os harmônicos (metais, cordas)
      melodia.push({ t: +(t0 + b * tb).toFixed(3), midi: m });
    }
  });
  // normaliza
  let mx = 0; for (let i = 0; i < x.length; i++) mx = Math.max(mx, Math.abs(x[i]));
  for (let i = 0; i < x.length; i++) x[i] = x[i] / (mx || 1) * 0.8;
  return { amostras: x, taxa, esperado: { acordes: seq, melodia, bpm, intro } };
}

/** Passa a análise completa (como o navegador faz, sem os intervalos). */
function transcrever(T, amostras, taxa, opcoes) {
  const an = T.criar(taxa);
  const qs = [];
  for (let i = 0; i + an.n <= amostras.length; i += an.hop) qs.push(an.quadro(amostras, i));
  return T.analisar(qs, { taxa, hop: an.hop, n: an.n, compasso: (opcoes && opcoes.compasso) || 4 });
}

module.exports = { musica, transcrever, rng };
