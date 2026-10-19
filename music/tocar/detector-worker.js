'use strict';
// Apenas módulos do próprio site. Nenhuma gravação, rede ou upload de áudio.
importScripts('/music/tocar/detector.js');
var detector = self.MusiqueTocarDetector.criar();
var polyphonic = false;
self.onmessage = function (evento) {
  var mensagem = evento.data;
  if (!mensagem) return;
  if (mensagem.tipo === 'configurar') {
    try {
      detector = self.MusiqueTocarDetector.criar(mensagem.detector);
      polyphonic = !!(mensagem.detector && mensagem.detector.polyphonic);
      if (polyphonic && !self.MusiqueTocarPolifonico) importScripts('/music/tocar/polifonico.js');
      self.postMessage({ tipo: 'configurado' });
    } catch (_) {
      self.postMessage({ tipo: 'erro', mensagem: 'Não foi possível configurar a análise de áudio.' });
    }
    return;
  }
  if (mensagem.tipo !== 'quadro') return;
  try {
    var samples = new Float32Array(mensagem.buffer);
    var frame = detector.analisar(samples, mensagem.sampleRate, mensagem.audioTime);
    if (polyphonic && self.MusiqueTocarPolifonico) frame.polyphonic = self.MusiqueTocarPolifonico.analisar(samples, mensagem.sampleRate, { minMidi: 28, maxMidi: 88 });
    self.postMessage({ tipo: 'quadro', id: mensagem.id, frame: frame });
  } catch (_) {
    self.postMessage({ tipo: 'erro', mensagem: 'Não foi possível analisar a entrada de áudio. Conecte novamente.' });
  }
};
self.postMessage({ tipo: 'pronto' });
