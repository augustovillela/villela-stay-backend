'use strict';
// O Worklet só copia amostras. Detecção fica fora da thread de áudio.
class MusiqueCapturar extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const perfil = options && options.processorOptions || {};
    const janelaMs = Number.isFinite(perfil.windowMs) && perfil.windowMs >= 35 && perfil.windowMs <= 250 ? perfil.windowMs : 64;
    const passoMs = Number.isFinite(perfil.stepMs) && perfil.stepMs >= 8 && perfil.stepMs <= 120 ? perfil.stepMs : 24;
    this.tamanho = Math.ceil(sampleRate * janelaMs / 1000);
    this.passo = Math.min(this.tamanho, Math.ceil(sampleRate * passoMs / 1000));
    this.anel = new Float32Array(this.tamanho);
    this.posicao = 0;
    this.preenchidas = 0;
    this.desdeUltimo = 0;
    this.pendente = false;
    this.ativo = true;
    this.sequencia = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.tipo === 'livre') this.pendente = false;
      if (e.data && e.data.tipo === 'parar') this.ativo = false;
    };
  }
  process(inputs, outputs) {
    // Saída explicitamente silenciosa mantém o grafo ativo sem monitorar a
    // guitarra nas caixas. Nunca copiamos a entrada para a saída.
    for (var saida of outputs) for (var canal of saida) canal.fill(0);
    if (!this.ativo) return false;
    var entrada = inputs[0] && inputs[0][0];
    if (!entrada || !entrada.length) return true;
    for (var i = 0; i < entrada.length; i++) {
      this.anel[this.posicao] = entrada[i];
      this.posicao = (this.posicao + 1) % this.tamanho;
    }
    this.preenchidas = Math.min(this.tamanho, this.preenchidas + entrada.length);
    this.desdeUltimo += entrada.length;
    if (!this.pendente && this.preenchidas === this.tamanho && this.desdeUltimo >= this.passo) {
      var quadro = new Float32Array(this.tamanho);
      quadro.set(this.anel.subarray(this.posicao));
      quadro.set(this.anel.subarray(0, this.posicao), this.tamanho - this.posicao);
      this.pendente = true;
      this.desdeUltimo = 0;
      // currentFrame é o início do quantum. A marca é o centro da janela,
      // não Date.now nem o momento em que a thread principal recebeu dados.
      this.port.postMessage({ tipo: 'quadro', id: ++this.sequencia,
        audioTime: (currentFrame + entrada.length - this.tamanho / 2) / sampleRate,
        sampleRate: sampleRate, buffer: quadro.buffer }, [quadro.buffer]);
    }
    return true;
  }
}
registerProcessor('musique-capturar', MusiqueCapturar);
