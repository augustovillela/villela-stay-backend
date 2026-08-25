// =====================================================================
// Musique — avaliação de ALTURA: uma sequência de notas tocada, cantada
// ou enviada por MIDI, comparada com a melodia esperada.
//
// A ENTRADA NÃO É ÁUDIO. É a lista de eventos que o navegador já
// detectou:  [{ hz, inicio_ms, dur_ms, confianca }]
//
// Por quê: a detecção de altura acontece no Web Audio, onde o som está,
// e mandar o áudio inteiro para cá custaria banda e tempo em cada
// exercício. O servidor guarda a REGRA; o cliente traz a MEDIDA.
//
// ⚠️ A contrapartida, escrita para não ser esquecida: um cliente pode
// mentir sobre o que detectou. Por isso exercício de prática vale como
// prática, e NOTA QUE CONTA passa por tarefa com áudio enviado e
// revisão do professor (matriz de papéis, §3.2). Confiar no cliente
// para praticar é barato; confiar nele para dar diploma, não.
//
// Puro: sem banco, sem usuário, sem IA.
// =====================================================================
'use strict';
const T = require('../teoria');

const TOL_CENTS_PADRAO = 50;      // meio semitom: erra de nota, não de afinação
const TOL_MS_PADRAO = 250;        // atraso aceitável no ataque

/**
 * `esperado` = { notas: ['C4','D4',...], bpm?, oitava_livre? }
 * `resposta` = { eventos: [{ hz | midi, inicio_ms, dur_ms, confianca }] }
 */
function avaliar({ esperado, resposta, tolerancia = {} }) {
  const alvo = (esperado && esperado.notas) || [];
  if (!alvo.length) throw new Error('Gabarito de melodia vazio.');

  const tolCents = Number(tolerancia.cents) || TOL_CENTS_PADRAO;
  const tolMs = Number(tolerancia.ms) || TOL_MS_PADRAO;
  // Solfejo e canto: um baixo cantando uma oitava abaixo está certo.
  // Exigir a oitava mediria tessitura, não percepção.
  const oitavaLivre = esperado.oitava_livre !== false;

  const eventos = ((resposta && resposta.eventos) || [])
    .map(normalizarEvento)
    .filter(Boolean)
    .sort((a, b) => a.inicio_ms - b.inicio_ms);

  if (!eventos.length) {
    return vazio(alvo, tolCents, tolMs, 'Não identifiquei nenhuma nota no que chegou.');
  }

  const notas = [];
  let somaConfDetector = 0;

  for (let i = 0; i < alvo.length; i++) {
    const esperadoMidi = T.midiDe(alvo[i]);
    const ev = eventos[i] || null;
    if (esperadoMidi == null) throw new Error(`Nota do gabarito inválida: "${alvo[i]}".`);

    if (!ev) {
      notas.push({ indice: i, esperado: alvo[i], tocado: null, cents: null, acerto: false, motivo: 'não veio' });
      continue;
    }
    somaConfDetector += ev.confianca;

    const desvio = desvioEmCents(ev.midiExato, esperadoMidi, oitavaLivre);
    const acerto = Math.abs(desvio) <= tolCents;
    notas.push({
      indice: i, esperado: alvo[i],
      tocado: T.nomePt(((Math.round(ev.midiExato) % 12) + 12) % 12),
      cents: Math.round(desvio), acerto,
      motivo: acerto ? '' : (Math.abs(desvio) > 150 ? 'nota diferente' : 'afinação fora'),
    });
  }

  const sobrando = Math.max(0, eventos.length - alvo.length);
  const certas = notas.filter((n) => n.acerto).length;
  const proporcao = certas / alvo.length;

  // Confiança da MEDIDA (não do aluno): confiança média do detector,
  // penalizada por nota faltando ou sobrando — sinal picotado engana.
  const confDetector = somaConfDetector / Math.max(1, eventos.length);
  const faltando = notas.filter((n) => n.tocado === null).length;
  const penalidade = 1 - Math.min(0.5, (faltando + sobrando) * 0.12);
  const confianca = Math.max(0, Math.min(1, confDetector * penalidade));

  return {
    acerto: proporcao === 1 && !sobrando,
    medida: {
      notas, certas, total: alvo.length,
      proporcao: Number(proporcao.toFixed(3)),
      notas_sobrando: sobrando,
      desvio_medio_cents: mediana(notas.filter((n) => n.cents != null).map((n) => Math.abs(n.cents))),
    },
    confianca,
    criterio: `cada nota conta como certa quando fica a até ${tolCents} cents da altura esperada`
      + (oitavaLivre ? ', em qualquer oitava' : ', na oitava escrita'),
    tolerancia: { cents: tolCents, ms: tolMs, oitava_livre: oitavaLivre },
    explicacao: explicar(notas, certas, alvo.length, sobrando),
  };
}

function normalizarEvento(e) {
  if (!e) return null;
  let midiExato = null;
  if (Number.isFinite(e.midi)) midiExato = Number(e.midi);
  else if (Number(e.hz) > 0) midiExato = T.midiDeFreq(Number(e.hz));
  if (midiExato == null || !Number.isFinite(midiExato)) return null;
  const c = Number(e.confianca);
  return {
    midiExato,
    inicio_ms: Number(e.inicio_ms) || 0,
    dur_ms: Number(e.dur_ms) || 0,
    // Sem confiança declarada, assume-se detecção mediana — não perfeita.
    confianca: Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.75,
  };
}

/** Desvio em cents. Com `oitavaLivre`, escolhe a oitava mais próxima. */
function desvioEmCents(midiExato, midiEsperado, oitavaLivre) {
  let d = (midiExato - midiEsperado) * 100;
  if (oitavaLivre) {
    // aproxima em múltiplos de 1200 cents
    d = d - Math.round(d / 1200) * 1200;
  }
  return d;
}

const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

function explicar(notas, certas, total, sobrando) {
  if (certas === total && !sobrando) return 'Todas as notas na altura certa.';
  const erradas = notas.filter((n) => !n.acerto);
  const partes = [`${certas} de ${total} notas na altura certa.`];
  const primeira = erradas[0];
  if (primeira) {
    if (primeira.tocado === null) {
      partes.push(`A ${primeira.indice + 1}ª nota (${primeira.esperado}) não apareceu.`);
    } else if (primeira.motivo === 'afinação fora') {
      partes.push(`A ${primeira.indice + 1}ª nota saiu ${primeira.cents > 0 ? 'acima' : 'abaixo'} `
        + `por ${Math.abs(primeira.cents)} cents.`);
    } else {
      partes.push(`Na ${primeira.indice + 1}ª você tocou ${primeira.tocado}, e era ${primeira.esperado}.`);
    }
  }
  if (sobrando) partes.push(`Vieram ${sobrando} nota(s) a mais do que a melodia pede.`);
  return partes.join(' ');
}

const vazio = (alvo, tolCents, tolMs, motivo) => ({
  acerto: false,
  medida: { notas: [], certas: 0, total: alvo.length, proporcao: 0, notas_sobrando: 0, desvio_medio_cents: null },
  confianca: 0,
  criterio: `cada nota conta como certa quando fica a até ${tolCents} cents da altura esperada`,
  tolerancia: { cents: tolCents, ms: tolMs },
  explicacao: motivo,
});

const contrato = (tol = {}) => ({
  mede: 'a altura de cada nota, comparada com a melodia esperada',
  aceita: 'notas tocadas, cantadas ou enviadas por instrumento MIDI',
  tolerancia_texto: `até ${Number(tol.cents) || TOL_CENTS_PADRAO} cents de desvio por nota`
    + ' — meio semitom, ou seja, mede a NOTA, não a afinação fina',
});

module.exports = { avaliar, contrato, TOL_CENTS_PADRAO, TOL_MS_PADRAO };
