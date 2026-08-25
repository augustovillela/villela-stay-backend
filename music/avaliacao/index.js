// =====================================================================
// Musique — MOTOR DE AVALIAÇÃO.
//
// ⚠️ TUDO AQUI É PURO (ADR-0004 §5). Entra resposta ou sinal, sai medida.
// Não lê banco, não sabe quem é o aluno, não chama IA. É o que torna a
// nota explicável, contestável e testável com sinal sintético.
//
// O CONTRATO, igual para todos os motores:
//
//   { acerto, medida, confianca, criterio, tolerancia, explicacao,
//     vale_nota }
//
//   · `criterio` e `explicacao` são texto para o ALUNO, em português.
//     Devolver só "errado" ensina o aluno a adivinhar, não a ouvir.
//   · `confianca` (0–1) é a confiança na MEDIDA, não no aluno.
//   · `vale_nota` é `false` quando a medida não sustenta nota. Nesse
//     caso o resultado é INDICAÇÃO — e a tela diz isso (decisão Q5).
//
// A regra que decide `vale_nota` mora AQUI, em um lugar só. Espalhá-la
// pelos motores faria cada um escolher um limiar diferente, e o produto
// passaria a dar nota em situação que não sustenta nota.
// =====================================================================
'use strict';

const escolha = require('./escolha');
const altura = require('./altura');
const ritmo = require('./ritmo');
const afinacao = require('./afinacao');

/** Abaixo disto o resultado é indicação, nunca nota. */
const LIMIAR_NOTA = 0.7;

/**
 * Modos de resposta e o que cada um consegue medir com honestidade.
 * `teto_confianca` é o máximo que aquele caminho alcança MESMO no melhor
 * cenário — vem da física, não de otimismo (ver docs/music/VIABILIDADE §4).
 */
const MODOS = {
  escolha: { motor: escolha, teto_confianca: 1.0, pt: 'múltipla escolha' },
  texto: { motor: escolha, teto_confianca: 1.0, pt: 'resposta digitada' },
  teclado: { motor: escolha, teto_confianca: 1.0, pt: 'teclado virtual' },
  midi: { motor: altura, teto_confianca: 1.0, pt: 'instrumento MIDI' },
  canto: { motor: altura, teto_confianca: 0.85, pt: 'canto' },
  instrumento: { motor: altura, teto_confianca: 0.9, pt: 'instrumento acústico' },
  palma: { motor: ritmo, teto_confianca: 0.9, pt: 'palmas' },
  sustentada: { motor: afinacao, teto_confianca: 0.95, pt: 'nota sustentada' },
};

/**
 * Modos que dependem do microfone. Exigem calibração recente — sem ela
 * o resultado sai marcado como não confiável, porque medir num ambiente
 * desconhecido é medir o ambiente, não o aluno.
 */
const MODOS_POR_MICROFONE = ['canto', 'instrumento', 'palma', 'sustentada'];

/**
 * Avalia. `contexto` traz o que degrada a medida:
 *   { calibrado, ruido_db, polifonico }
 *
 * ⚠️ POLIFONIA NÃO VALE NOTA, em nenhum modo (decisão Q5). Acorde ao
 * violão e piano com pedal não são medidos com confiança suficiente, e
 * fingir que são queima o produto no primeiro uso.
 */
function avaliar({ modo, esperado, resposta, tolerancia = {}, contexto = {} } = {}) {
  const def = MODOS[modo];
  if (!def) {
    return recusa(`Modo de resposta desconhecido: "${modo}".`);
  }

  let r;
  try {
    r = def.motor.avaliar({ modo, esperado, resposta, tolerancia });
  } catch (e) {
    return recusa(e && e.message ? e.message : 'Não consegui avaliar esta resposta.');
  }

  const { confianca, motivos } = ajustarConfianca(Math.min(r.confianca, def.teto_confianca), modo, contexto);
  const valeNota = confianca >= LIMIAR_NOTA && !contexto.polifonico;

  return {
    ...r,
    modo,
    confianca: Number(confianca.toFixed(3)),
    vale_nota: valeNota,
    // O aluno precisa saber POR QUE aquilo não virou nota — senão a
    // tela parece quebrada, e não honesta.
    ressalvas: contexto.polifonico
      ? ['Execução com mais de uma nota ao mesmo tempo não é avaliada com nota: a medida ainda não é confiável o bastante. O resultado abaixo é uma indicação.', ...motivos]
      : motivos,
  };
}

/** Degrada a confiança pelas condições reais da captura. */
function ajustarConfianca(base, modo, contexto) {
  const motivos = [];
  let c = base;

  if (MODOS_POR_MICROFONE.includes(modo)) {
    if (!contexto.calibrado) {
      c *= 0.6;
      motivos.push('O microfone ainda não foi calibrado — faça a calibração para que o resultado valha nota.');
    }
    const ruido = Number(contexto.ruido_db);
    // −50 dBFS é sala silenciosa; −30 já é ruído que compete com a voz.
    if (Number.isFinite(ruido) && ruido > -40) {
      c *= ruido > -25 ? 0.5 : 0.75;
      motivos.push('O ruído de fundo está alto. Em ambiente mais silencioso a medida fica confiável.');
    }
  }
  return { confianca: Math.max(0, Math.min(1, c)), motivos };
}

const recusa = (motivo) => ({
  acerto: false, medida: null, confianca: 0, vale_nota: false,
  criterio: 'não avaliado', tolerancia: null, explicacao: motivo, ressalvas: [motivo],
});

/** O que a tela precisa mostrar ANTES de o aluno tocar (decisão Q5:
 *  todo exercício declara o que mede e com que tolerância). */
function contrato({ modo, tolerancia = {} } = {}) {
  const def = MODOS[modo];
  if (!def) return null;
  const motor = def.motor;
  return {
    modo, modo_pt: def.pt,
    exige_microfone: MODOS_POR_MICROFONE.includes(modo),
    confianca_maxima: def.teto_confianca,
    pode_valer_nota: def.teto_confianca >= LIMIAR_NOTA,
    ...motor.contrato(tolerancia),
  };
}

module.exports = { avaliar, contrato, MODOS, MODOS_POR_MICROFONE, LIMIAR_NOTA };
