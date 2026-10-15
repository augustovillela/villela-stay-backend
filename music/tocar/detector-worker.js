'use strict';
// Apenas módulos do próprio site. Nenhuma gravação, rede ou upload de áudio.
importScripts('/music/tocar/detector.js');
var detector = self.MusiqueTocarDetector.criar();
self.onmessage = function (evento) {
  var mensagem = evento.data;
  if (!mensagem || mensagem.tipo !== 'quadro') return;
  try {
    var frame = detector.analisar(new Float32Array(mensagem.buffer), mensagem.sampleRate, mensagem.audioTime);
    self.postMessage({ tipo: 'quadro', id: mensagem.id, frame: frame });
  } catch (_) {
    self.postMessage({ tipo: 'erro', mensagem: 'Não foi possível analisar a entrada de áudio. Conecte novamente.' });
  }
};
self.postMessage({ tipo: 'pronto' });
