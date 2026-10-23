// Entrada MIDI local para bateria eletrônica. Não envia bytes nem persiste o dispositivo.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MusiqueTocarMidi = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function criar(opcoes) {
    var o = opcoes || {}, acesso = null, entrada = null, conectado = false, dispositivos = [];
    function estado(nome, extra) { if (typeof o.onStatus === 'function') o.onStatus(Object.assign({ estado: nome }, extra || {})); }
    function evento(message) {
      if (!message || !message.data || message.data.length < 3) return;
      var status = message.data[0], tipo = status & 0xf0, canal = status & 0x0f;
      if (tipo !== 0x90 && tipo !== 0x80) return;
      var midi = message.data[1], velocity = message.data[2] || 0;
      if (typeof o.onEvent === 'function') o.onEvent({ midi: midi, velocity: velocity, channel: canal, time: Number.isFinite(message.timeStamp) ? message.timeStamp : performance.now() });
    }
    function listar() {
      dispositivos = acesso ? Array.from(acesso.inputs.values()).map(function (input) {
        return { id: input.id, name: input.name || input.manufacturer || 'Entrada MIDI' };
      }) : [];
      return dispositivos.slice();
    }
    function desligar() { if (entrada) entrada.onmidimessage = null; entrada = null; conectado = false; }
    function escolher(id) {
      desligar();
      if (!acesso) throw new Error('Acesso MIDI ainda não foi iniciado.');
      entrada = acesso.inputs.get(id) || Array.from(acesso.inputs.values())[0] || null;
      if (!entrada) throw new Error('Nenhuma entrada MIDI disponível.');
      entrada.onmidimessage = evento; conectado = true;
      estado('conectado', { nome: entrada.name || 'Entrada MIDI', deviceId: entrada.id });
      return entrada.id;
    }
    async function iniciar(id) {
      if (!navigator.requestMIDIAccess) throw new Error('Este navegador não oferece Web MIDI. Use um navegador compatível com MIDI.');
      estado('iniciando');
      acesso = await navigator.requestMIDIAccess();
      acesso.onstatechange = function () { listar(); if (entrada && !acesso.inputs.has(entrada.id)) { desligar(); estado('parado', { mensagem: 'A entrada MIDI foi desconectada.' }); } };
      listar();
      escolher(id);
      return listar();
    }
    return {
      iniciar: iniciar,
      dispositivos: function () { return Promise.resolve(listar()); },
      escolher: escolher,
      parar: function () { desligar(); estado('parado', { mensagem: 'Entrada MIDI desligada.' }); },
      conectado: function () { return conectado; },
      estado: function () { return { conectado: conectado, deviceId: entrada && entrada.id || null }; }
    };
  }
  return { criar: criar };
});
