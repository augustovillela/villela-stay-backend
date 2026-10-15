/* Entrada local de guitarra. API pública: window.MusiqueTocarAudio.criar(). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(raiz);
  else raiz.MusiqueTocarAudio = fabrica(raiz);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (raiz) {
  'use strict';
  function criar(opcoes) {
    var o = opcoes || {};
    // Injeção usada somente pelos testes de ciclo de vida, sem microfone real.
    var g = o.ambiente || raiz;
    var sessao = null, geracao = 0;
    var status = { estado: 'parado', mensagem: 'Entrada de áudio desligada.' };
    function emitir(fn, valor) { if (typeof fn === 'function') { try { fn(valor); } catch (_) { /* UI não interrompe a liberação do microfone. */ } } }
    function informar(estado, mensagem, detalhes) {
      status = Object.assign({ estado: estado, mensagem: mensagem }, detalhes || {});
      emitir(o.onStatus, Object.assign({}, status));
    }
    function atual(s) { return sessao === s && s.geracao === geracao && !s.fechada; }
    function erro(texto, nome) { var e = new Error(texto); e.name = nome || 'AudioError'; return e; }
    function cancelar() { return erro('Conexão de áudio cancelada.', 'AbortError'); }
    function pararFaixas(stream) { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); }
    function limpar(s) {
      if (!s || s.fechada) return;
      s.fechada = true;
      if (s.timer) g.clearTimeout(s.timer);
      if (s.timerPronto) g.clearTimeout(s.timerPronto);
      if (s.rejeitarPronto) { s.rejeitarPronto(cancelar()); s.rejeitarPronto = null; }
      if (s.media && s.deviceChange) s.media.removeEventListener('devicechange', s.deviceChange);
      if (s.stream) s.stream.getTracks().forEach(function (t) { t.removeEventListener('ended', s.ended); });
      if (s.node) {
        s.node.onprocessorerror = null;
        s.node.port.onmessage = null;
        try { s.node.port.postMessage({ tipo: 'parar' }); s.node.disconnect(); s.node.port.close(); } catch (_) {}
      }
      if (s.source) { try { s.source.disconnect(); } catch (_) {} }
      if (s.worker) { s.worker.onmessage = null; s.worker.onerror = null; s.worker.terminate(); }
      pararFaixas(s.stream);
      if (s.ctx) {
        s.ctx.onstatechange = null;
        try { Promise.resolve(s.ctx.close()).catch(function () {}); } catch (_) {}
      }
    }
    function falhar(s, mensagem) {
      if (!atual(s)) return;
      s.falha = erro(mensagem);
      sessao = null;
      limpar(s);
      informar('erro', mensagem);
    }
    function traduzir(e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) return 'A permissão de áudio foi negada. Libere o microfone para este site e conecte novamente.';
      if (e && (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError')) return 'Nenhuma entrada de áudio foi encontrada. Confira o microfone ou conecte uma interface USB ou o Real Tone.';
      if (e && e.name === 'OverconstrainedError') return 'A entrada escolhida não está disponível. Confira o microfone ou a interface e selecione a entrada novamente.';
      if (e && (e.name === 'NotReadableError' || e.name === 'TrackStartError')) return 'Não foi possível abrir a entrada. Feche outros aplicativos que estejam usando esse dispositivo e tente novamente.';
      if (e && e.name === 'AudioError') return e.message;
      return 'Não foi possível iniciar o áudio. Confira o dispositivo e tente novamente.';
    }
    async function dispositivos() {
      var media = g.navigator && g.navigator.mediaDevices;
      if (!media || !media.enumerateDevices) return [];
      var lista = await media.enumerateDevices(), indice = 0;
      return lista.filter(function (d) { return d.kind === 'audioinput'; }).map(function (d) {
        return { kind: 'audioinput', deviceId: d.deviceId, label: d.label || ('Entrada de áudio ' + (++indice)) };
      });
    }
    async function iniciar(deviceId) {
      var anterior = sessao;
      var s = { geracao: ++geracao, fechada: false, conectado: false, pendente: null };
      sessao = s;
      limpar(anterior);
      informar('iniciando', 'Aguardando acesso à entrada de áudio…');
      try {
        if (g.isSecureContext === false) throw erro('O áudio precisa de uma conexão HTTPS. Abra a página pelo endereço seguro do site.');
        s.media = g.navigator && g.navigator.mediaDevices;
        if (!s.media || !s.media.getUserMedia) throw erro('Este navegador não permite capturar áudio. Use uma versão atual do Chrome, Edge ou Firefox.');
        var C = g.AudioContext || g.webkitAudioContext;
        if (!C || !g.AudioWorkletNode || !g.Worker) throw erro('Este navegador não oferece o processamento de áudio necessário (AudioWorklet e Worker). Atualize o navegador para conectar o instrumento.');
        s.ctx = new C({ latencyHint: 'interactive' });
        if (!s.ctx.audioWorklet || !s.ctx.audioWorklet.addModule) throw erro('AudioWorklet não está disponível neste navegador. Atualize o navegador para conectar o instrumento.');
        // Resume ainda dentro do gesto do usuário, antes da permissão assíncrona.
        var retomada = s.ctx.resume();
        Promise.resolve(retomada).catch(function () {});
        var audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } };
        if (deviceId) audio.deviceId = { exact: deviceId };
        var stream = await s.media.getUserMedia({ audio: audio, video: false });
        if (!atual(s)) { pararFaixas(stream); throw cancelar(); }
        s.stream = stream;
        s.ended = function () { falhar(s, 'A entrada de áudio foi desconectada. Confira o dispositivo e ative a entrada novamente.'); };
        stream.getTracks().forEach(function (t) { t.addEventListener('ended', s.ended); });
        var faixa = stream.getAudioTracks()[0];
        if (!faixa || faixa.readyState === 'ended') throw erro('A entrada foi desconectada antes de iniciar. Confira o dispositivo e tente novamente.');
        await retomada;
        if (!atual(s)) throw cancelar();
        await s.ctx.audioWorklet.addModule('/music/tocar/capturar-worklet.js');
        if (!atual(s)) throw cancelar();
        s.worker = new g.Worker('/music/tocar/detector-worker.js');
        var pronto = new Promise(function (resolve, reject) {
          s.rejeitarPronto = reject;
          s.timerPronto = g.setTimeout(function () { reject(erro('O detector de áudio não respondeu. Recarregue a página e tente novamente.')); }, 8000);
          s.worker.onmessage = function (evento) {
            if (!atual(s)) return;
            var msg = evento.data || {};
            if (msg.tipo === 'pronto') {
              g.clearTimeout(s.timerPronto); s.timerPronto = null; s.rejeitarPronto = null; resolve();
            } else if (msg.tipo === 'erro') {
              falhar(s, 'O detector de áudio foi interrompido. Conecte novamente.');
            } else if (msg.tipo === 'quadro' && msg.id === s.pendente) {
              g.clearTimeout(s.timer); s.timer = null; s.pendente = null;
              if (s.node) s.node.port.postMessage({ tipo: 'livre' });
              emitir(o.onFrame, msg.frame);
            }
          };
          s.worker.onerror = function (evento) {
            if (evento.preventDefault) evento.preventDefault();
            if (s.conectado) falhar(s, 'O detector de áudio foi interrompido. Recarregue a página e conecte novamente.');
            else reject(erro('Não foi possível carregar o detector de áudio. Recarregue a página e tente novamente.'));
          };
        });
        await pronto;
        if (!atual(s)) throw cancelar();
        s.node = new g.AudioWorkletNode(s.ctx, 'musique-capturar', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
        s.node.onprocessorerror = function () { falhar(s, 'A captura de áudio foi interrompida. Conecte novamente.'); };
        s.node.port.onmessage = function (evento) {
          var msg = evento.data;
          if (!atual(s) || !msg || msg.tipo !== 'quadro' || s.pendente !== null) return;
          s.pendente = msg.id;
          // Não há fila de áudio: até receber a resposta o Worklet continua
          // atualizando seu anel, mas não envia outro quadro.
          s.timer = g.setTimeout(function () { falhar(s, 'A análise de áudio demorou demais. Feche outras abas e conecte novamente.'); }, 3000);
          try { s.worker.postMessage(msg, [msg.buffer]); }
          catch (_) { falhar(s, 'Não foi possível processar a entrada de áudio. Conecte novamente.'); }
        };
        s.source = s.ctx.createMediaStreamSource(stream);
        s.source.connect(s.node);
        s.node.connect(s.ctx.destination); // Worklet produz somente zeros.
        var configuracao = faixa.getSettings ? faixa.getSettings() : {};
        s.deviceId = configuracao.deviceId || deviceId || '';
        s.ctx.onstatechange = function () {
          if (s.conectado && s.ctx.state !== 'running') falhar(s, 'O navegador suspendeu a captura de áudio. Volte à página e conecte novamente.');
        };
        s.deviceChange = function () {
          dispositivos().then(function (lista) {
            if (atual(s) && s.deviceId && !lista.some(function (d) { return d.deviceId === s.deviceId; })) s.ended();
          }).catch(function () { /* ended continua monitorando a faixa. */ });
        };
        if (s.media.addEventListener) s.media.addEventListener('devicechange', s.deviceChange);
        var lista = await dispositivos();
        if (!atual(s)) throw cancelar();
        if (faixa.readyState === 'ended' || s.ctx.state !== 'running') throw erro('A entrada de áudio foi interrompida. Conecte novamente.');
        s.conectado = true;
        informar('conectado', 'Entrada conectada. A análise acontece somente neste dispositivo.', {
          deviceId: s.deviceId, nome: faixa.label || 'Entrada de áudio', sampleRate: s.ctx.sampleRate
        });
        return lista;
      } catch (e) {
        if (atual(s)) {
          var mensagem = traduzir(e);
          falhar(s, mensagem);
          throw erro(mensagem);
        }
        limpar(s);
        throw s.falha || cancelar();
      }
    }
    function parar() {
      geracao++;
      var s = sessao; sessao = null;
      limpar(s);
      informar('parado', 'Entrada de áudio desligada.');
    }
    return { iniciar: iniciar, dispositivos: dispositivos, parar: parar,
      contexto: function () { return sessao && !sessao.fechada ? sessao.ctx : null; },
      estado: function () { return Object.assign({}, status); } };
  }
  return { criar: criar };
});
