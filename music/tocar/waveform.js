// Operações puras para a referência visual de áudio do gestor de arranjos.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MusiqueTocarWaveform = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var LIMITE_OFFSET_MS = 600000;

  function numero(valor, padrao) {
    return typeof valor === 'number' && Number.isFinite(valor) ? valor : padrao;
  }
  function inteiro(valor, minimo, maximo, padrao) {
    var n = Math.round(numero(valor, padrao));
    return Math.max(minimo, Math.min(maximo, n));
  }
  function limitePorDuracao(durationMs) {
    var duracao = numero(durationMs, LIMITE_OFFSET_MS);
    return inteiro(duracao, 0, LIMITE_OFFSET_MS, LIMITE_OFFSET_MS);
  }
  function limitarMs(valor, durationMs) {
    return inteiro(valor, 0, limitePorDuracao(durationMs), 0);
  }
  function msParaX(ms, width, durationMs) {
    var largura = numero(width, 0), duracao = numero(durationMs, 0);
    if (largura <= 0 || duracao <= 0) return 0;
    return limitarMs(ms, duracao) / duracao * largura;
  }
  function xParaMs(x, width, durationMs) {
    var largura = numero(width, 0), duracao = numero(durationMs, 0);
    if (largura <= 0 || duracao <= 0) return 0;
    return limitarMs(numero(x, 0) / largura * duracao, duracao);
  }
  function picos(amostras, colunas) {
    if (!amostras || typeof amostras.length !== 'number' || amostras.length < 1) return [];
    var total = amostras.length, quantidade = inteiro(colunas, 1, 2000, 1), saida = [];
    for (var coluna = 0; coluna < quantidade; coluna++) {
      var inicio = Math.floor(coluna * total / quantidade);
      var fim = Math.max(inicio + 1, Math.floor((coluna + 1) * total / quantidade));
      var minimo = 1, maximo = -1, encontrou = false;
      for (var i = inicio; i < fim && i < total; i++) {
        var valor = amostras[i];
        if (!Number.isFinite(valor)) continue;
        encontrou = true;
        if (valor < minimo) minimo = valor;
        if (valor > maximo) maximo = valor;
      }
      saida.push(encontrou ? { min: Math.max(-1, minimo), max: Math.min(1, maximo) } : { min: 0, max: 0 });
    }
    return saida;
  }
  function picosDoBuffer(buffer, colunas) {
    if (!buffer || typeof buffer.getChannelData !== 'function' || !Number.isSafeInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1) return [];
    // O primeiro canal produz uma referência estável sem duplicar a memória já
    // usada pelo AudioBuffer. O desenho é só orientação, não medição acústica.
    return picos(buffer.getChannelData(0), colunas);
  }

  return Object.freeze({ LIMITE_OFFSET_MS: LIMITE_OFFSET_MS, limitarMs: limitarMs, msParaX: msParaX, xParaMs: xParaMs, picos: picos, picosDoBuffer: picosDoBuffer });
});
