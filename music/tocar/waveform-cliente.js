// Painel progressivo de referência visual. Não grava nem altera o áudio.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./waveform'), globalThis);
  else root.MusiqueTocarWaveformCliente = factory(root.MusiqueTocarWaveform, root);
})(typeof window !== 'undefined' ? window : globalThis, function (Waveform, root) {
  'use strict';
  var MAX_BYTES = 12 * 1024 * 1024, MAX_SECONDS = 300, COLUNAS = 900;

  function montar(container, options) {
    if (!Waveform) throw new Error('A referência visual de áudio não foi carregada.');
    options = options || {};
    var doc = container.ownerDocument || document;
    var ticket = 0, audio = null, controller = null, offsetMs = 0, locked = false, destroyed = false;
    function $(id) { return doc.getElementById('tw-' + id); }
    function texto(id, value) { $(id).textContent = value; }
    function estado(value, error) {
      texto('status', value);
      $('status').classList.toggle('tw-error', !!error);
      if (typeof options.onStatus === 'function') options.onStatus(value, !!error);
    }
    function ms(v, duration) { return Waveform.limitarMs(v, duration); }
    function durationMs() {
      return audio && Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : 0;
    }
    function posicaoMs() {
      return audio && Number.isFinite(audio.currentTime) && audio.currentTime >= 0 ? ms(Math.round(audio.currentTime * 1000), durationMs()) : 0;
    }
    function formatar(millis) {
      var total = Math.max(0, Math.round(millis / 1000)), minutos = Math.floor(total / 60), segundos = total % 60;
      return minutos + ':' + String(segundos).padStart(2, '0');
    }
    function atualizarControles() {
      var duracao = durationMs(), pronto = !!audio && duracao > 0 && !locked;
      var limite = Math.min(Waveform.LIMITE_OFFSET_MS, duracao || Waveform.LIMITE_OFFSET_MS);
      $('position').max = String(limite);
      $('position').value = String(ms(posicaoMs(), limite));
      $('position').disabled = !pronto;
      $('use').disabled = !pronto;
      texto('position-label', pronto ? 'Posição atual: ' + formatar(posicaoMs()) + ' de ' + formatar(duracao) : 'Aguardando metadados do áudio.');
    }
    function desenhar(picos) {
      var canvas = $('canvas'), caixa = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 720 };
      var largura = Math.max(240, Math.min(COLUNAS, Math.round(caixa.width || 720)));
      var altura = 112, escala = Math.max(1, Number(root.devicePixelRatio) || 1);
      canvas.width = largura * escala; canvas.height = altura * escala;
      canvas.style.height = altura + 'px'; canvas.style.width = '100%';
      var ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return;
      if (ctx.setTransform) ctx.setTransform(escala, 0, 0, escala, 0, 0);
      ctx.clearRect(0, 0, largura, altura);
      ctx.fillStyle = '#0b1721'; ctx.fillRect(0, 0, largura, altura);
      ctx.strokeStyle = 'rgba(226, 184, 86, .65)'; ctx.lineWidth = 1;
      var meio = altura / 2;
      picos.forEach(function (pico, index) {
        var x = index / Math.max(1, picos.length - 1) * largura;
        ctx.beginPath(); ctx.moveTo(x, meio + pico.min * meio); ctx.lineTo(x, meio + pico.max * meio); ctx.stroke();
      });
      var duracao = durationMs();
      if (duracao > 0) {
        var marcador = Waveform.msParaX(offsetMs, largura, duracao);
        var atual = Waveform.msParaX(posicaoMs(), largura, duracao);
        ctx.strokeStyle = '#79d5cc'; ctx.beginPath(); ctx.moveTo(marcador, 0); ctx.lineTo(marcador, altura); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(atual, 0); ctx.lineTo(atual, altura); ctx.stroke();
      }
    }
    function pararAudio() {
      if (!audio) return;
      audio.onloadedmetadata = null; audio.ontimeupdate = null; audio.onseeked = null; audio.onplay = null; audio.onpause = null; audio.onerror = null;
      if (typeof audio.pause === 'function') audio.pause();
      if (typeof audio.removeAttribute === 'function') audio.removeAttribute('src'); else audio.src = '';
      if (typeof audio.load === 'function') audio.load();
      audio = null;
      $('audio').replaceChildren();
    }
    function cancelar() {
      ++ticket;
      if (controller && typeof controller.abort === 'function') controller.abort();
      controller = null;
    }
    function limiteCabecalho(response) {
      var headers = response && response.headers;
      var bruto = headers && typeof headers.get === 'function' ? headers.get('content-length') : '';
      return /^\d+$/.test(String(bruto || '')) ? Number(bruto) : 0;
    }
    async function bytesLimitados(response, signal) {
      if (!response || !response.ok) throw new Error('Não foi possível ler o áudio para desenhar a referência.');
      if (limiteCabecalho(response) > MAX_BYTES) throw new Error('O arquivo é grande demais para desenhar a waveform neste navegador.');
      if (response.body && typeof response.body.getReader === 'function') {
        var reader = response.body.getReader(), partes = [], total = 0;
        try {
          while (true) {
            if (signal && signal.aborted) throw new Error('Leitura cancelada.');
            var item = await reader.read(); if (item.done) break;
            total += item.value.byteLength;
            if (total > MAX_BYTES) { if (reader.cancel) await reader.cancel(); throw new Error('O arquivo é grande demais para desenhar a waveform neste navegador.'); }
            partes.push(item.value);
          }
        } finally { if (reader.releaseLock) reader.releaseLock(); }
        var combinado = new Uint8Array(total), cursor = 0;
        partes.forEach(function (parte) { combinado.set(parte, cursor); cursor += parte.byteLength; });
        return combinado.buffer;
      }
      if (typeof response.arrayBuffer !== 'function') throw new Error('O navegador não disponibilizou bytes para a waveform.');
      var bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_BYTES) throw new Error('O arquivo é grande demais para desenhar a waveform neste navegador.');
      return bytes;
    }
    function decodificar(context, bytes) {
      try {
        var valor = context.decodeAudioData(bytes.slice ? bytes.slice(0) : bytes);
        if (valor && typeof valor.then === 'function') return valor;
      } catch (erro) { return Promise.reject(erro); }
      return new Promise(function (resolve, reject) { context.decodeAudioData(bytes, resolve, reject); });
    }
    async function carregarWaveform(url, localTicket, localController) {
      var duracao = durationMs();
      if (!duracao || duracao > MAX_SECONDS * 1000) {
        estado('Reprodução pronta. A waveform fica disponível para arquivos de até 5 minutos; use os controles de posição para este áudio.');
        return;
      }
      var criarContexto = options.audioContextFactory || function () {
        var Tipo = root.AudioContext || root.webkitAudioContext;
        return Tipo ? new Tipo() : null;
      };
      var contexto;
      try { contexto = criarContexto(); }
      catch (erroContexto) {
        estado('Reprodução pronta. Este navegador não conseguiu preparar a waveform.');
        return;
      }
      if (!contexto || typeof contexto.decodeAudioData !== 'function') {
        estado('Reprodução pronta. Este navegador não oferece decodificação local para a waveform.');
        return;
      }
      try {
        var resposta = await (options.fetch || root.fetch)(url, localController ? { signal: localController.signal } : {});
        var bytes = await bytesLimitados(resposta, localController && localController.signal);
        var buffer = await decodificar(contexto, bytes);
        if (destroyed || localTicket !== ticket || !audio) return;
        var peaks = Waveform.picosDoBuffer(buffer, COLUNAS);
        desenhar(peaks);
        $('canvas').hidden = false;
        estado('Waveform pronta. A linha clara acompanha a reprodução; a linha verde marca o 0:00 do arranjo.');
      } catch (erro) {
        if (!destroyed && localTicket === ticket && !(localController && localController.signal && localController.signal.aborted)) {
          estado('Reprodução pronta, mas não foi possível desenhar a waveform neste navegador. Use a posição do áudio e o botão abaixo.', false);
        }
      } finally {
        if (contexto && typeof contexto.close === 'function') {
          var fechamento = contexto.close();
          if (fechamento && typeof fechamento.catch === 'function') fechamento.catch(function () {});
        }
      }
    }
    function carregar(source) {
      cancelar(); pararAudio();
      if (destroyed || !source || typeof source.url !== 'string' || !source.url) return limpar('Salve um rascunho com áudio associado para abrir a referência visual.');
      var TipoAbort = root.AbortController || (typeof AbortController === 'function' ? AbortController : null);
      controller = TipoAbort ? new TipoAbort() : null;
      var localTicket = ticket;
      $('player').hidden = false; $('canvas').hidden = true; texto('caption', 'A linha verde marca o 0:00 do arranjo. A linha clara acompanha o áudio.');
      estado('Carregando os metadados do áudio…');
      var criarAudio = options.audioFactory || function (url) {
        var elemento = root.Audio ? new root.Audio(url) : doc.createElement('audio');
        if (!elemento.src) elemento.src = url;
        return elemento;
      };
      try { audio = criarAudio(source.url); }
      catch (erroAudio) { falhar('O navegador não conseguiu preparar o reprodutor deste áudio.'); return; }
      audio.preload = 'metadata'; audio.controls = true;
      $('audio').replaceChildren(audio);
      audio.onloadedmetadata = function () {
        if (destroyed || localTicket !== ticket || audio !== this) return;
        atualizarControles(); desenhar([]); estado('Reprodução pronta. Preparando a waveform…');
        carregarWaveform(source.url, localTicket, controller);
      };
      audio.ontimeupdate = function () { if (localTicket === ticket) { atualizarControles(); if (!$('canvas').hidden) desenharCache(); } };
      audio.onseeked = audio.ontimeupdate;
      audio.onplay = audio.ontimeupdate; audio.onpause = audio.ontimeupdate;
      audio.onerror = function () { if (localTicket === ticket) { atualizarControles(); estado('O navegador não conseguiu reproduzir este áudio. Confira o arquivo no Acervo.', true); } };
      return localTicket;
    }
    var cachedPeaks = [];
    function desenharCache() { desenhar(cachedPeaks); }
    // Mantém a função de desenho isolada para que a posição atual seja redesenhada
    // sem voltar a decodificar o arquivo.
    var desenharOriginal = desenhar;
    desenhar = function (picos) {
      if (Array.isArray(picos) && picos.length) cachedPeaks = picos;
      desenharOriginal(cachedPeaks);
    };
    function limpar(reason) {
      cancelar(); pararAudio(); cachedPeaks = []; $('player').hidden = true; $('canvas').hidden = true;
      texto('position-label', 'Aguardando um áudio salvo.'); texto('caption', 'A waveform será exibida somente como referência visual.');
      $('position').value = '0'; $('position').disabled = true; $('use').disabled = true;
      estado(reason || 'Salve um rascunho com áudio associado para abrir a referência visual.');
    }
    function falhar(reason) {
      cancelar(); pararAudio(); cachedPeaks = []; $('player').hidden = true; $('canvas').hidden = true;
      texto('position-label', 'A referência visual não está disponível.'); texto('caption', 'Revise o áudio associado e tente salvar ou recarregar o rascunho.');
      $('position').value = '0'; $('position').disabled = true; $('use').disabled = true;
      estado(reason || 'Não foi possível abrir a referência visual.', true);
    }
    function setOffset(value) {
      offsetMs = Waveform.limitarMs(value, durationMs() || Waveform.LIMITE_OFFSET_MS);
      if (!$('canvas').hidden) desenharCache();
    }
    function bloquear(value) { locked = !!value; atualizarControles(); }
    function destruir() { destroyed = true; limpar('Referência visual encerrada.'); }

    container.setAttribute('class', (container.getAttribute('class') || '') + ' tw-root');
    container.innerHTML = '<section class="tw-panel" aria-labelledby="tw-title"><h3 id="tw-title">Alinhar áudio ao arranjo</h3><p class="tj-small">Use o áudio autorizado para localizar o instante que corresponde ao 0:00 do arranjo. A reprodução não é gravada nem enviada.</p><p id="tw-status" class="tw-status" role="status">Salve um rascunho com áudio associado para abrir a referência visual.</p><div id="tw-player" hidden><div id="tw-audio" class="tw-audio"></div><canvas id="tw-canvas" class="tw-canvas" aria-hidden="true" hidden></canvas><p id="tw-caption" class="tj-small">A waveform será exibida somente como referência visual.</p><label class="tj-field">Posição no áudio<input id="tw-position" type="range" min="0" max="600000" step="1" value="0" aria-describedby="tw-position-label"></label><p id="tw-position-label" class="tj-small">Aguardando metadados do áudio.</p><button id="tw-use" type="button">Usar posição atual como 0:00 do arranjo</button></div></section>';
    $('position').addEventListener('input', function () {
      if (!audio || locked) return;
      var novo = ms(Number(this.value), durationMs()); audio.currentTime = novo / 1000; atualizarControles(); desenharCache();
    });
    $('use').addEventListener('click', function () {
      if (!audio || locked || typeof options.onUsePosition !== 'function') return;
      options.onUsePosition(posicaoMs());
    });
    $('canvas').addEventListener('click', function (event) {
      if (!audio || locked || !durationMs()) return;
      var caixa = $('canvas').getBoundingClientRect(), x = Number.isFinite(event.offsetX) ? event.offsetX : Number(event.clientX) - (caixa.left || 0);
      audio.currentTime = Waveform.xParaMs(x, caixa.width, durationMs()) / 1000; atualizarControles(); desenharCache();
    });
    return { carregar: carregar, limpar: limpar, falhar: falhar, setOffset: setOffset, bloquear: bloquear, destruir: destruir };
  }

  return Object.freeze({ montar: montar, MAX_BYTES: MAX_BYTES, MAX_SECONDS: MAX_SECONDS });
});
