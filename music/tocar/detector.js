/* Detector monofônico local. Não decide pontuação nem identifica corda/casa. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.MusiqueTocarDetector = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PADRAO = Object.freeze({ minHz: 70, maxHz: 1400 });
  var PISO = 0.004;

  // A faixa é escolhida pela interface a partir de um perfil conhecido. A
  // normalização também mantém a API segura para quem usa o detector direto
  // em testes: uma configuração incompleta volta ao comportamento histórico.
  function configuracao(opcoes) {
    var origem = opcoes && typeof opcoes === 'object' ? opcoes : {};
    var min = Number.isFinite(origem.minHz) ? origem.minHz : PADRAO.minHz;
    var max = Number.isFinite(origem.maxHz) ? origem.maxHz : PADRAO.maxHz;
    if (min < 20 || min > 1000 || max <= min || max > 4000) return { minHz: PADRAO.minHz, maxHz: PADRAO.maxHz };
    return { minHz: min, maxHz: max };
  }

  function detectar(amostras, taxa, opcoes) {
    var faixa = configuracao(opcoes);
    var n = amostras && amostras.length || 0;
    var vazio = { hz: null, confidence: 0, rms: 0, clipped: 0 };
    if (!Number.isFinite(taxa) || taxa < 8000 || taxa > 192000 || n < taxa * 0.035 || n > taxa * 0.25) return vazio;
    var soma = 0, energia = 0, clip = 0, i, j;
    for (i = 0; i < n; i++) {
      var v = amostras[i];
      if (!Number.isFinite(v)) return vazio;
      soma += v; energia += v * v;
      if (Math.abs(v) >= 0.985) clip++;
    }
    var media = soma / n;
    // Energia sem DC: offsets de interface não viram uma nota ou ataque.
    var rms = Math.sqrt(Math.max(0, energia / n - media * media));
    var resultado = { hz: null, confidence: 0, rms: rms, clipped: clip / n };
    if (rms < PISO || resultado.clipped > 0.08) return resultado;

    // Média de pequenos blocos reduz custo e atenua altas frequências antes
    // da decimação. Mantém pelo menos 22 kHz em entradas de 44,1–192 kHz.
    var passo = Math.max(1, Math.floor(taxa / 22050));
    var sr = taxa / passo, m = Math.floor(n / passo);
    var x = new Float32Array(m);
    for (i = 0; i < m; i++) {
      var s = 0;
      for (j = 0; j < passo; j++) s += amostras[i * passo + j] - media;
      x[i] = s / passo;
    }
    // Também examinar períodos acima da faixa permitida: ignorá-los faria
    // uma senoide aguda aparecer como seu sub-harmônico dentro da faixa.
    var minimo = 2;
    var maximo = Math.min(Math.ceil(sr / faixa.minHz), Math.floor(m / 2) - 1);
    var janela = m - maximo - 1;
    var diferencas = new Float64Array(maximo + 2), acumulado = 0;
    diferencas[0] = 1;
    // YIN: comprimento de comparação constante para não favorecer atrasos
    // grandes. Este trabalho acontece exclusivamente no Worker.
    for (var atraso = 1; atraso <= maximo + 1; atraso++) {
      var d = 0;
      for (j = 0; j < janela; j++) { var delta = x[j] - x[j + atraso]; d += delta * delta; }
      acumulado += d;
      diferencas[atraso] = acumulado ? d * atraso / acumulado : 1;
    }
    var candidatos = [];
    for (i = minimo; i <= maximo; i++) {
      if (diferencas[i] >= diferencas[i - 1] || diferencas[i] > diferencas[i + 1]) continue;
      var a = diferencas[i - 1], b = diferencas[i], c = diferencas[i + 1];
      var denominador = a - 2 * b + c;
      var ajuste = denominador ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / denominador)) : 0;
      var vale = Math.max(0, b - 0.25 * (a - c) * ajuste);
      if (vale < 0.18) candidatos.push({ periodo: i + ajuste, vale: vale });
    }
    if (!candidatos.length) return resultado;
    var melhor = candidatos[0];
    // Uma fundamental fraca pode produzir o primeiro vale na oitava. Só
    // trocar por um múltiplo quando a periodicidade melhora substancialmente;
    // mínimos quase iguais de uma senoide não autorizam baixar uma oitava.
    for (i = 1; i < candidatos.length; i++) {
      var atual = candidatos[i], razao = atual.periodo / melhor.periodo;
      var multiplo = Math.round(razao);
      if (multiplo >= 2 && multiplo <= 4 && Math.abs(razao - multiplo) < 0.06 &&
          atual.vale < melhor.vale * 0.45 && melhor.vale - atual.vale > 0.01) melhor = atual;
    }
    var hz = sr / melhor.periodo;
    if (hz < faixa.minHz || hz > faixa.maxHz) return resultado;
    resultado.hz = hz;
    resultado.confidence = Math.max(0, Math.min(1, 1 - melhor.vale));
    return resultado;
  }

  function criar(opcoes) {
    var faixa = configuracao(opcoes);
    var energiaAnterior = 0, ultimoAtaque = -Infinity, candidato = null;
    var PRAZO_ATAQUE = 0.075, DEBOUNCE_ATAQUE = 0.09, SUBIDA_ATAQUE = 1.65;
    return {
      analisar: function (amostras, taxa, audioTime) {
        var r = detectar(amostras, taxa, faixa);
        var tempo = Number.isFinite(audioTime) ? audioTime : 0;
        // O transiente da palhetada pode elevar a energia antes de haver
        // periodicidade. Guardar a subida por até 75 ms permite confirmá-la
        // depois, sem renovar seu prazo nem reutilizar o mesmo candidato.
        if (candidato && (tempo < candidato.tempo || tempo - candidato.tempo > PRAZO_ATAQUE + 1e-7 ||
            r.clipped > 0.08 || r.rms <= PISO * 1.5 || r.rms <= candidato.energia * SUBIDA_ATAQUE)) candidato = null;
        if (!candidato && r.clipped <= 0.08 && r.rms > PISO * 1.5 &&
            r.rms > energiaAnterior * SUBIDA_ATAQUE && tempo - ultimoAtaque >= DEBOUNCE_ATAQUE) {
          candidato = { tempo: tempo, energia: energiaAnterior };
        }
        var onset = candidato !== null && r.hz !== null && r.confidence >= 0.85;
        var onsetTime = onset ? candidato.tempo : null;
        if (onset) { ultimoAtaque = tempo; candidato = null; }
        energiaAnterior = r.rms;
        return { audioTime: tempo, hz: r.hz, confidence: r.confidence, rms: r.rms,
          onset: onset, onsetTime: onsetTime, clipped: r.clipped };
      },
      reiniciar: function () { energiaAnterior = 0; ultimoAtaque = -Infinity; candidato = null; }
    };
  }
  return { detectar: detectar, criar: criar, faixa: { min: PADRAO.minHz, max: PADRAO.maxHz }, configurar: configuracao };
});
