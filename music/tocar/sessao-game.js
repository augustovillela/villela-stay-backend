// Máquina de estados da sessão de game. Não toca áudio, não acessa DOM e não
// persiste dados; o cliente continua dono dos relógios e dos dispositivos.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MusiqueTocarSessaoGame = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var TRANSICOES = {
    idle: ['preparing'], preparing: ['count-in', 'failed', 'idle'],
    'count-in': ['running', 'paused', 'failed', 'idle'],
    running: ['paused', 'completed', 'failed', 'idle'],
    paused: ['running', 'failed', 'idle'],
    completed: ['preparing', 'idle'], failed: ['preparing', 'idle'], idle: ['preparing']
  };
  function erro(mensagem) { throw new Error('Sessão de game: ' + mensagem); }
  function criar(opcoes) {
    opcoes = opcoes || {};
    var estado = 'idle', revisao = 0, tokenAtual = 0, motivo = null;
    function informar() {
      if (typeof opcoes.onChange === 'function') opcoes.onChange({ estado: estado, revisao: revisao, motivo: motivo });
    }
    function mudar(proximo, razao) {
      if ((TRANSICOES[estado] || []).indexOf(proximo) < 0) erro('transição inválida de ' + estado + ' para ' + proximo + '.');
      estado = proximo; motivo = razao || null; revisao++; informar();
      return estado;
    }
    function preparar() {
      var token = ++tokenAtual;
      if (estado !== 'idle' && estado !== 'failed' && estado !== 'completed') erro('preparação indisponível em ' + estado + '.');
      estado = 'preparing'; motivo = null; informar();
      return token;
    }
    function pronto(token) {
      if (token !== tokenAtual || estado !== 'preparing') return false;
      mudar('count-in'); return true;
    }
    function iniciar(token) {
      if (token !== undefined && token !== tokenAtual) return false;
      if (estado !== 'count-in') erro('início indisponível em ' + estado + '.');
      mudar('running'); return true;
    }
    function cancelar(razao) {
      if (estado === 'idle') return false;
      if ((TRANSICOES[estado] || []).indexOf('idle') < 0) erro('cancelamento indisponível em ' + estado + '.');
      mudar('idle', razao || 'cancelada'); return true;
    }
    return Object.freeze({
      estado: function () { return { estado: estado, revisao: revisao, motivo: motivo }; },
      preparar: preparar,
      pronto: pronto,
      iniciar: iniciar,
      pausar: function () { if (estado !== 'running' && estado !== 'count-in') erro('pausa indisponível em ' + estado + '.'); return mudar('paused'); },
      retomar: function () { if (estado !== 'paused') erro('retomada indisponível em ' + estado + '.'); return mudar('running'); },
      concluir: function () { if (estado !== 'running') erro('conclusão indisponível em ' + estado + '.'); return mudar('completed'); },
      falhar: function (razao) { if (estado !== 'preparing' && estado !== 'count-in' && estado !== 'running' && estado !== 'paused') erro('falha indisponível em ' + estado + '.'); return mudar('failed', razao || 'falha'); },
      cancelar: cancelar,
    });
  }
  return { criar: criar };
});
