// =====================================================================
// Musique — avaliação de RITMO: onde os ataques caíram, comparados com
// a grade rítmica esperada.
//
// Entrada: `resposta.onsets` = tempos em ms do início de cada ataque
// (palma, baqueta, nota percussiva), já detectados pelo navegador.
//
// DUAS COISAS QUE ESTE MOTOR FAZ E QUE UM CONTADOR INGÊNUO NÃO FARIA:
//
//   1. ALINHA ANTES DE JULGAR. O aluno quase nunca começa exatamente no
//      clique. Se o motor comparasse tempo absoluto, uma execução
//      perfeita começando 120 ms depois seria reprovada inteira. Aqui a
//      diferença CONSTANTE é descontada, e sobra o que é erro de ritmo
//      de verdade.
//
//   2. SEPARA ATRASO DE INSTABILIDADE. Tocar tudo 40 ms atrasado é uma
//      coisa (latência, ou o aluno "atrás do tempo"); tocar ora adiantado
//      ora atrasado é outra, e é a que precisa de metrônomo. O relatório
//      dá os dois números com nomes diferentes, porque o conserto é
//      diferente.
//
// A tolerância acompanha o andamento: 60 ms num compasso a 60 BPM é
// pouco; a 160 BPM é muito. Tolerância fixa premiaria quem estuda devagar.
// =====================================================================
'use strict';

const TOL_FRACAO_PADRAO = 0.12;   // fração da semínima
const TOL_MS_MIN = 45;            // piso: abaixo disso é ruído de captura

/**
 * `esperado` = { bpm, figuras: [1, 0.5, 0.5, ...] }  (em semínimas)
 *   ou       = { bpm, onsets_ms: [0, 500, 1000, ...] }
 * `resposta` = { onsets: [ms, ...] }
 */
function avaliar({ esperado, resposta, tolerancia = {} }) {
  const bpm = Number(esperado && esperado.bpm) || 90;
  const seminima = 60000 / bpm;

  const alvo = Array.isArray(esperado.onsets_ms)
    ? esperado.onsets_ms.map(Number)
    : grade(esperado.figuras, seminima);
  if (!alvo.length) throw new Error('Gabarito de ritmo vazio.');

  const tolMs = Math.max(
    TOL_MS_MIN,
    Number(tolerancia.ms) || seminima * (Number(tolerancia.fracao) || TOL_FRACAO_PADRAO),
  );

  const onsets = ((resposta && resposta.onsets) || []).map(Number)
    .filter((x) => Number.isFinite(x)).sort((a, b) => a - b);

  if (!onsets.length) {
    return vazio(alvo, tolMs, bpm, 'Não identifiquei nenhum ataque no que chegou.');
  }

  // 1) alinhamento: desconta o atraso CONSTANTE (mediana das diferenças
  //    do pareamento ingênuo), que é latência/entrada, não erro rítmico.
  const brutas = alvo.map((t, i) => (onsets[i] == null ? null : onsets[i] - t)).filter((d) => d != null);
  const deslocamento = mediana(brutas) || 0;

  // 2) julga o que sobra
  const eventos = alvo.map((t, i) => {
    const o = onsets[i];
    if (o == null) return { indice: i, esperado_ms: Math.round(t), tocado_ms: null, erro_ms: null, acerto: false, motivo: 'faltou' };
    const erro = (o - deslocamento) - t;
    return {
      indice: i, esperado_ms: Math.round(t), tocado_ms: Math.round(o),
      erro_ms: Math.round(erro), acerto: Math.abs(erro) <= tolMs,
      motivo: Math.abs(erro) <= tolMs ? '' : (erro > 0 ? 'atrasou' : 'adiantou'),
    };
  });

  const sobrando = Math.max(0, onsets.length - alvo.length);
  const certos = eventos.filter((e) => e.acerto).length;
  const errosAbs = eventos.filter((e) => e.erro_ms != null).map((e) => e.erro_ms);

  // instabilidade = desvio-padrão do erro DEPOIS de tirar o atraso
  const instabilidade = desvioPadrao(errosAbs);

  const faltando = eventos.filter((e) => e.tocado_ms === null).length;
  const confianca = Math.max(0, Math.min(1, 0.9 - Math.min(0.5, (faltando + sobrando) * 0.15)));

  return {
    acerto: certos === alvo.length && !sobrando,
    medida: {
      eventos, certos, total: alvo.length, ataques_sobrando: sobrando,
      atraso_medio_ms: Math.round(deslocamento),
      instabilidade_ms: Math.round(instabilidade),
      bpm_alvo: bpm,
    },
    confianca,
    criterio: `cada ataque conta como certo quando cai a até ${Math.round(tolMs)} ms do lugar, `
      + 'depois de descontado o atraso constante do começo',
    tolerancia: { ms: Math.round(tolMs), fracao_da_seminima: Number((tolMs / seminima).toFixed(3)) },
    explicacao: explicar(eventos, certos, alvo.length, sobrando, deslocamento, instabilidade, tolMs),
  };
}

/** Figuras em semínimas → tempos de ataque acumulados. */
function grade(figuras, seminima) {
  const fs = Array.isArray(figuras) ? figuras.map(Number).filter((x) => x > 0) : [];
  const out = [];
  let t = 0;
  for (const f of fs) { out.push(t); t += f * seminima; }
  return out;
}

const mediana = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function desvioPadrao(xs) {
  if (xs.length < 2) return 0;
  const md = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - md) ** 2, 0) / xs.length);
}

function explicar(eventos, certos, total, sobrando, deslocamento, instabilidade, tolMs) {
  const partes = [`${certos} de ${total} ataques no lugar.`];

  // O diagnóstico útil não é "errou": é ATRASO (constante) ou
  // INSTABILIDADE (oscila). Cada um pede um estudo diferente.
  if (Math.abs(deslocamento) > tolMs) {
    partes.push(`Você entrou ${Math.abs(Math.round(deslocamento))} ms `
      + `${deslocamento > 0 ? 'depois' : 'antes'} do começo — isso sozinho não é erro de ritmo, `
      + 'é o ponto de entrada.');
  }
  if (instabilidade > tolMs) {
    partes.push(`A pulsação oscilou ${Math.round(instabilidade)} ms em torno do tempo. `
      + 'Estude com metrônomo em andamento mais lento e só acelere quando estabilizar.');
  } else if (certos < total) {
    const e = eventos.find((x) => !x.acerto);
    if (e && e.tocado_ms === null) partes.push(`O ${e.indice + 1}º ataque não apareceu.`);
    else if (e) partes.push(`O ${e.indice + 1}º ataque ${e.motivo} ${Math.abs(e.erro_ms)} ms.`);
  }
  if (sobrando) partes.push(`Vieram ${sobrando} ataque(s) a mais.`);
  if (certos === total && !sobrando && instabilidade <= tolMs) {
    partes.push(`Pulsação estável (oscilação de ${Math.round(instabilidade)} ms).`);
  }
  return partes.join(' ');
}

const vazio = (alvo, tolMs, bpm, motivo) => ({
  acerto: false,
  medida: { eventos: [], certos: 0, total: alvo.length, ataques_sobrando: 0,
    atraso_medio_ms: 0, instabilidade_ms: 0, bpm_alvo: bpm },
  confianca: 0,
  criterio: `cada ataque conta como certo quando cai a até ${Math.round(tolMs)} ms do lugar`,
  tolerancia: { ms: Math.round(tolMs) },
  explicacao: motivo,
});

const contrato = (tol = {}) => ({
  mede: 'onde cada ataque caiu em relação à pulsação, e o quanto a pulsação oscilou',
  aceita: 'palmas, percussão ou notas curtas captadas pelo microfone',
  tolerancia_texto: 'a tolerância acompanha o andamento '
    + `(cerca de ${Math.round((Number(tol.fracao) || TOL_FRACAO_PADRAO) * 100)}% da semínima, nunca menos de ${TOL_MS_MIN} ms); `
    + 'o atraso do começo é descontado antes de julgar',
});

module.exports = { avaliar, contrato, grade, TOL_FRACAO_PADRAO, TOL_MS_MIN };
