// =====================================================================
// Musique — avaliação de AFINAÇÃO: uma nota sustentada, medida ao longo
// do tempo. É o exercício mais confiável do produto — nota isolada,
// instrumento ou voz, ambiente calmo — e por isso o primeiro a valer nota.
//
// Entrada: `resposta.amostras` = [{ hz, ms, confianca }] ao longo da
// sustentação.
//
// O QUE ELE MEDE, E POR QUE SÃO TRÊS NÚMEROS E NÃO UM:
//
//   · CENTRO   — o desvio típico (mediana) em cents. É "você está alto
//                ou baixo".
//   · OSCILAÇÃO — o quanto a altura variou. Um cantor com 40 cents de
//                oscilação pode ter mediana zero e ainda assim soar
//                desafinado; a média sozinha esconderia isso.
//   · ESTABILIDADE NO TEMPO — quanto da sustentação ficou dentro da
//                tolerância. Acertar só no fim não é acertar.
//
// O começo da nota é DESCARTADO de propósito: ataque de voz e de sopro
// entra por baixo, e julgar o ataque mediria o ataque, não a afinação.
//
// Puro: sem banco, sem usuário, sem IA.
// =====================================================================
'use strict';
const T = require('../teoria');

const TOL_CENTS_PADRAO = 20;   // aceitável para estudo; afinador de luthier usa ~5
const DESCARTE_INICIAL = 0.25; // ignora o primeiro quarto (ataque)
const MIN_AMOSTRAS = 5;

/**
 * `esperado` = { nota: 'A4' }  ou  { hz: 440 }
 * `resposta` = { amostras: [{ hz, ms, confianca }] }
 */
function avaliar({ esperado, resposta, tolerancia = {} }) {
  const alvoHz = Number(esperado && esperado.hz) > 0
    ? Number(esperado.hz)
    : (T.midiDe(esperado && esperado.nota) != null ? T.freqDeMidi(T.midiDe(esperado.nota)) : null);
  if (!alvoHz) throw new Error('Gabarito de afinação inválido: informe a nota ou a frequência.');

  const tolCents = Number(tolerancia.cents) || TOL_CENTS_PADRAO;

  const todas = ((resposta && resposta.amostras) || [])
    .map((a) => ({ hz: Number(a.hz), ms: Number(a.ms) || 0, confianca: Number.isFinite(Number(a.confianca)) ? Number(a.confianca) : 0.8 }))
    .filter((a) => a.hz > 0)
    .sort((a, b) => a.ms - b.ms);

  if (todas.length < MIN_AMOSTRAS) {
    return vazio(tolCents, esperado, 'A nota foi curta demais para medir. Sustente por pelo menos um segundo.');
  }

  // descarta o ataque
  const corte = Math.floor(todas.length * DESCARTE_INICIAL);
  const uteis = todas.slice(corte);

  const cents = uteis.map((a) => T.centsEntre(a.hz, alvoHz));
  const centro = mediana(cents);
  const oscilacao = iqr(cents);
  const dentro = cents.filter((c) => Math.abs(c) <= tolCents).length;
  const proporcaoDentro = dentro / cents.length;

  // Acerto exige as DUAS coisas: centro dentro da tolerância E a maior
  // parte da sustentação dentro dela. Só o centro deixaria passar quem
  // oscila para os dois lados e acerta "na média".
  const acerto = Math.abs(centro) <= tolCents && proporcaoDentro >= 0.7;

  const confDetector = uteis.reduce((s, a) => s + a.confianca, 0) / uteis.length;
  // Oscilação enorme costuma ser detector patinando, não voz — a medida
  // perde confiança junto.
  const confianca = Math.max(0, Math.min(1, confDetector * (oscilacao > 120 ? 0.6 : 1)));

  const notaAlvo = T.notaDeFreq(alvoHz);

  return {
    acerto,
    medida: {
      alvo_hz: Number(alvoHz.toFixed(2)),
      alvo_nota: T.nomePt(notaAlvo.pc) + notaAlvo.oitava,
      centro_cents: Math.round(centro),
      oscilacao_cents: Math.round(oscilacao),
      proporcao_dentro: Number(proporcaoDentro.toFixed(3)),
      amostras_usadas: uteis.length,
    },
    confianca,
    criterio: `o centro da nota tem de ficar a até ${tolCents} cents do alvo, `
      + 'e pelo menos 70% da sustentação tem de ficar dentro dessa faixa',
    tolerancia: { cents: tolCents, descarte_do_ataque: DESCARTE_INICIAL },
    explicacao: explicar(centro, oscilacao, proporcaoDentro, tolCents, acerto),
  };
}

function explicar(centro, oscilacao, dentro, tol, acerto) {
  if (acerto && oscilacao <= tol) return `Afinado: centro a ${Math.abs(Math.round(centro))} cents e som estável.`;
  if (acerto) return `Dentro da faixa, mas a altura oscilou ${Math.round(oscilacao)} cents. Sustente com mais apoio.`;

  const partes = [];
  if (Math.abs(centro) > tol) {
    partes.push(`A nota ficou ${Math.round(Math.abs(centro))} cents ${centro > 0 ? 'ACIMA' : 'ABAIXO'} do alvo`
      + (Math.abs(centro) > 100 ? ' — mais de um semitom, então provavelmente é outra nota.' : '.'));
  }
  if (dentro < 0.7) {
    partes.push(`Só ${Math.round(dentro * 100)}% da sustentação ficou dentro da faixa`
      + (oscilacao > tol ? `, com oscilação de ${Math.round(oscilacao)} cents.` : '.'));
  }
  return partes.join(' ');
}

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Amplitude interquartil: mede oscilação sem deixar um pico isolado
 *  (uma tosse, um harmônico) decidir o resultado. */
function iqr(xs) {
  if (xs.length < 4) return Math.max(...xs) - Math.min(...xs);
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return q(0.75) - q(0.25);
}

const vazio = (tolCents, esperado, motivo) => ({
  acerto: false,
  medida: { alvo_nota: (esperado && esperado.nota) || null, centro_cents: null,
    oscilacao_cents: null, proporcao_dentro: 0, amostras_usadas: 0 },
  confianca: 0,
  criterio: `o centro da nota tem de ficar a até ${tolCents} cents do alvo`,
  tolerancia: { cents: tolCents },
  explicacao: motivo,
});

const contrato = (tol = {}) => ({
  mede: 'o quanto a nota sustentada ficou acima ou abaixo do alvo, e o quanto oscilou',
  aceita: 'voz ou instrumento sustentando uma nota por pelo menos um segundo',
  tolerancia_texto: `até ${Number(tol.cents) || TOL_CENTS_PADRAO} cents de desvio, `
    + 'com pelo menos 70% da sustentação dentro da faixa; o ataque inicial é descartado',
});

module.exports = { avaliar, contrato, TOL_CENTS_PADRAO, DESCARTE_INICIAL };
