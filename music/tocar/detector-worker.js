'use strict';
// Apenas módulos do próprio site. Nenhuma gravação, rede ou upload de áudio.
importScripts('/music/tocar/detector.js');
var detector = self.MusiqueTocarDetector.criar();
var polyphonic = false;
var polyphonicTick = 0;
var lastPolyphonic = null;
self.onmessage = function (evento) {
  var mensagem = evento.data;
  if (!mensagem) return;
  if (mensagem.tipo === 'configurar') {
    try {
      detector = self.MusiqueTocarDetector.criar(mensagem.detector);
      polyphonic = !!(mensagem.detector && mensagem.detector.polyphonic);
      polyphonicTick = 0;
      lastPolyphonic = null;
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
    if (polyphonic && self.MusiqueTocarPolifonico) {
      if ((polyphonicTick++ % 2) === 0) lastPolyphonic = self.MusiqueTocarPolifonico.analisar(samples, mensagem.sampleRate, { minMidi: 28, maxMidi: 88 });
      frame.polyphonic = lastPolyphonic;
    }
    self.postMessage({ tipo: 'quadro', id: mensagem.id, frame: frame });
  } catch (_) {
    self.postMessage({ tipo: 'erro', mensagem: 'Não foi possível analisar a entrada de áudio. Conecte novamente.' });
  }
};
self.postMessage({ tipo: 'pronto' });
