// Reprodução de gravações dos instrumentos. O relógio e o contexto pertencem ao cliente.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MusiqueTocarSons = factory();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var BASE = '/music/tocar/sons/';
  var ARQUIVO = /^[a-z0-9][a-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9_-]*\.(?:mp3|ogg|wav)$/;
  var LIMITE_VOZES = 48, LIMITE_DOWNLOADS = 4, TEMPO_DOWNLOAD = 15000, TAMANHO_MAXIMO = 12 * 1024 * 1024;
  function perfilDesempenho(opcoes) {
    var nav = opcoes && opcoes.navigator || (typeof navigator !== 'undefined' ? navigator : null) || {};
    var conexao = nav.connection || nav.mozConnection || nav.webkitConnection || {};
    var tipo = typeof conexao.effectiveType === 'string' ? conexao.effectiveType.toLowerCase() : '';
    var lento = conexao.saveData === true || tipo === 'slow-2g' || tipo === '2g';
    var moderado = tipo === '3g';
    var nucleos = Number(nav.hardwareConcurrency), memoria = Number(nav.deviceMemory);
    if (Number.isFinite(nucleos) && nucleos > 0 && nucleos <= 2) lento = true;
    else if (Number.isFinite(nucleos) && nucleos <= 4) moderado = true;
    if (Number.isFinite(memoria) && memoria > 0 && memoria <= 2) lento = true;
    else if (Number.isFinite(memoria) && memoria <= 4) moderado = true;
    if (lento) return { nome: 'econômico', limiteVozes: 24, limiteDownloads: 2, tempoDownload: 30000 };
    if (moderado) return { nome: 'equilibrado', limiteVozes: 32, limiteDownloads: 3, tempoDownload: 22000 };
    return { nome: 'completo', limiteVozes: LIMITE_VOZES, limiteDownloads: LIMITE_DOWNLOADS, tempoDownload: TEMPO_DOWNLOAD };
  }
  function finito(n) { return typeof n === 'number' && Number.isFinite(n); }
  function midiValido(n) { return Number.isInteger(n) && n >= 0 && n <= 127; }
  function proprio(obj, chave) { return Object.prototype.hasOwnProperty.call(obj, chave); }

  function criar(ctx, opcoes) {
    opcoes = opcoes || {};
    var desempenho = perfilDesempenho(opcoes);
    var manifesto = opcoes.manifest;
    var buscar = opcoes.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!ctx || typeof ctx.createBufferSource !== 'function' || typeof ctx.createGain !== 'function' ||
        typeof ctx.createDynamicsCompressor !== 'function' || typeof ctx.decodeAudioData !== 'function') {
      throw new Error('Este navegador não oferece a reprodução de amostras de áudio.');
    }
    if (!manifesto || manifesto.version !== 1 || !manifesto.banks || typeof manifesto.banks !== 'object') {
      throw new Error('O catálogo de sons dos instrumentos é inválido.');
    }
    if (!buscar) throw new Error('Não foi possível carregar os sons dos instrumentos.');

    var bancos = Object.create(null), buffers = Object.create(null), promessas = Object.create(null);
    var fila = [], downloads = 0, pedidos = [], vozes = [], encerrado = false;
    var master = ctx.createGain(), compressor = ctx.createDynamicsCompressor();
    master.gain.value = 0.65;
    compressor.threshold.value = -16;
    compressor.knee.value = 10;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    compressor.connect(master); master.connect(ctx.destination);

    function disponivel() {
      if (encerrado || ctx.state === 'closed') throw new Error('A reprodução de instrumentos foi encerrada.');
    }
    function banco(instrumento) {
      disponivel();
      if (typeof instrumento !== 'string' || !proprio(manifesto.banks, instrumento)) {
        throw new Error('Não há sons disponíveis para este instrumento.');
      }
      if (bancos[instrumento]) return bancos[instrumento];
      var original = manifesto.banks[instrumento];
      if (!original || (original.kind !== 'pitched' && original.kind !== 'drums') ||
          !Array.isArray(original.samples) || !original.samples.length || original.samples.length > 128) {
        throw new Error('O banco de sons de ' + instrumento + ' é inválido.');
      }
      var ganho = original.gain === undefined ? 0.8 : original.gain;
      var release = original.release === undefined ? 0.25 : original.release;
      if (!finito(ganho) || ganho <= 0 || ganho > 1 || !finito(release) || release < 0 || release > 5 ||
          (original.doubled !== undefined && typeof original.doubled !== 'boolean')) {
        throw new Error('O volume ou a duração do banco de sons é inválido.');
      }
      var vistos = Object.create(null);
      var amostras = original.samples.map(function (s) {
        var tuneCents = s && s.tuneCents === undefined ? 0 : s && s.tuneCents;
        var offsetSeconds = s && s.offsetSeconds === undefined ? 0 : s && s.offsetSeconds;
        if (!s || !midiValido(s.midi) || vistos[s.midi] || typeof s.file !== 'string' || !ARQUIVO.test(s.file) ||
            !finito(tuneCents) || Math.abs(tuneCents) > 100 || !finito(offsetSeconds) || offsetSeconds < 0 || offsetSeconds > 1) {
          throw new Error('Uma amostra do banco de sons é inválida.');
        }
        vistos[s.midi] = true;
        return { midi: s.midi, file: s.file, tuneCents: tuneCents, offsetSeconds: offsetSeconds,
          group: typeof s.group === 'string' ? s.group : null };
      }).sort(function (a, b) { return a.midi - b.midi; });
      bancos[instrumento] = { kind: original.kind, gain: ganho, release: release,
        doubled: original.kind === 'pitched' && original.doubled === true, samples: amostras };
      return bancos[instrumento];
    }
    function escolher(b, midi) {
      if (!midiValido(midi)) throw new Error('A nota MIDI do som é inválida.');
      var melhor = null, distancia = Infinity;
      b.samples.forEach(function (s) {
        var d = Math.abs(s.midi - midi);
        if (d < distancia) { melhor = s; distancia = d; }
      });
      if (b.kind === 'drums' && distancia !== 0) throw new Error('Esta peça da bateria não tem uma amostra de som.');
      return melhor;
    }
    function baixar(file) {
      var controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var temporizador, rejeitar;
      var pedido = { abortar: function () {
        if (controle) controle.abort();
        if (rejeitar) rejeitar(new Error('O carregamento dos sons foi cancelado.'));
      } };
      pedidos.push(pedido);
      return new Promise(function (resolve, reject) {
        rejeitar = reject;
        temporizador = setTimeout(function () {
          if (controle) controle.abort();
          reject(new Error('O carregamento do som demorou demais. Tente novamente.'));
        }, desempenho.tempoDownload);
        Promise.resolve().then(function () {
          return buscar(BASE + file, { credentials: 'same-origin', signal: controle ? controle.signal : undefined });
        }).then(function (resposta) {
          if (!resposta || !resposta.ok || typeof resposta.arrayBuffer !== 'function') {
            throw new Error('Não foi possível baixar o som do instrumento. Tente novamente.');
          }
          var tamanho = resposta.headers && typeof resposta.headers.get === 'function' ? Number(resposta.headers.get('content-length')) : 0;
          if (tamanho > TAMANHO_MAXIMO) throw new Error('O arquivo de som excede o tamanho permitido.');
          return resposta.arrayBuffer();
        }).then(function (bytes) {
          if (!bytes || !finito(bytes.byteLength) || bytes.byteLength <= 0 || bytes.byteLength > TAMANHO_MAXIMO) {
            throw new Error('O arquivo de som recebido é inválido.');
          }
          resolve(bytes);
        }).catch(reject);
      }).finally(function () {
        clearTimeout(temporizador);
        var i = pedidos.indexOf(pedido); if (i >= 0) pedidos.splice(i, 1);
      });
    }
    function despachar() {
      while (!encerrado && downloads < desempenho.limiteDownloads && fila.length) {
        executar(fila.shift());
      }
    }
    function executar(tarefa) {
      downloads++;
      baixar(tarefa.file).then(function (bytes) {
        disponivel();
        return ctx.decodeAudioData(bytes);
      }).then(function (buffer) {
        disponivel();
        if (!buffer || !finito(buffer.duration) || buffer.duration <= 0) throw new Error('Não foi possível decodificar o som do instrumento.');
        buffers[tarefa.file] = buffer;
        tarefa.resolve(buffer);
      }).catch(function (erro) {
        tarefa.reject(erro instanceof Error ? erro : new Error('Não foi possível preparar o som do instrumento.'));
      }).finally(function () { downloads--; despachar(); });
    }
    function carregar(file) {
      if (promessas[file]) return promessas[file];
      var resolve, reject;
      var promessa = new Promise(function (ok, falha) { resolve = ok; reject = falha; });
      promessas[file] = promessa;
      promessa.catch(function () { if (promessas[file] === promessa) delete promessas[file]; });
      fila.push({ file: file, resolve: resolve, reject: reject });
      despachar();
      return promessa;
    }
    async function preparar(instrumento, notas) {
      var b = banco(instrumento);
      if (!Array.isArray(notas)) throw new Error('A lista de notas para preparar os sons é inválida.');
      var arquivos = Object.create(null);
      notas.forEach(function (nota) {
        var midi = typeof nota === 'number' ? nota : nota && nota.midi;
        var amostra = escolher(b, midi);
        if (!arquivos[amostra.file]) arquivos[amostra.file] = [];
        if (arquivos[amostra.file].indexOf(amostra) < 0) arquivos[amostra.file].push(amostra);
      });
      await Promise.all(Object.keys(arquivos).map(async function (file) {
        var buffer = await carregar(file);
        arquivos[file].forEach(function (s) {
          if (s.offsetSeconds >= buffer.duration) throw new Error('O início da amostra está fora da duração do som.');
        });
      }));
      disponivel();
      return { instrumento: instrumento, amostras: Object.keys(arquivos).length };
    }
    function limpar(voz) {
      if (voz.limpa) return;
      voz.limpa = true;
      try { voz.source.disconnect(); } catch (_) {}
      try { voz.gain.disconnect(); } catch (_) {}
      var indice = vozes.indexOf(voz); if (indice >= 0) vozes.splice(indice, 1);
    }
    function pararVoz(voz, quando, fade) {
      if (voz.limpa) return;
      var agora = ctx.currentTime;
      var em = quando === undefined ? agora : quando;
      if (!finito(em) || em < 0) throw new Error('O instante de parada do som é inválido.');
      em = Math.max(agora, em);
      if (em >= voz.end) return;
      var fim = Math.min(voz.end, em + (fade || 0));
      if (fade && em >= voz.when) {
        var ganho = voz.gain.gain;
        // A amostra já contém sua queda natural; esta envoltória apenas fecha a tecla ou o chimbal.
        var volume = voz.amplitude;
        if (voz.releaseAt !== null && em > voz.releaseAt && voz.envelopeEnd > voz.releaseAt) {
          volume *= Math.pow(0.0001, Math.min(1, (em - voz.releaseAt) / (voz.envelopeEnd - voz.releaseAt)));
        }
        ganho.cancelScheduledValues(em);
        ganho.setValueAtTime(volume, em);
        ganho.linearRampToValueAtTime(0, fim);
      }
      voz.end = fim;
      try { voz.source.stop(fim); } catch (_) {}
      if (fim <= agora) limpar(voz);
    }
    function tocar(instrumento, nota) {
      var b = banco(instrumento);
      nota = nota || {};
      var amostra = escolher(b, nota.midi), buffer = buffers[amostra.file];
      var quando = nota.when === undefined ? ctx.currentTime : nota.when;
      var duracao = nota.duration === undefined ? 0.5 : nota.duration;
      var velocidade = nota.velocity === undefined ? 96 : nota.velocity;
      if (!finito(quando) || quando < 0 || !finito(duracao) || duracao <= 0 || duracao > 3600 ||
          !finito(velocidade) || velocidade < 1 || velocidade > 127) {
        throw new Error('O instante, a duração ou a intensidade do som é inválido.');
      }
      if (!buffer) throw new Error('Prepare os sons do instrumento antes de iniciar a reprodução.');
      if (amostra.offsetSeconds >= buffer.duration) throw new Error('O início da amostra está fora da duração do som.');
      quando = Math.max(ctx.currentTime, quando);
      vozes.slice().forEach(function (v) { if (v.end <= ctx.currentTime) limpar(v); });
      var camadas = b.doubled ? 2 : 1;
      while (vozes.length + camadas > desempenho.limiteVozes) {
        var maisAntiga = vozes.reduce(function (a, v) { return v.when < a.when ? v : a; });
        pararVoz(maisAntiga); limpar(maisAntiga);
      }
      var criadas = [];
      for (var camada = 0; camada < camadas; camada++) {
        var inicio = quando + (camada ? 0.003 : 0);
        var cents = amostra.tuneCents + (b.doubled ? (camada ? 3 : -3) : 0);
        var rate = b.kind === 'drums' ? 1 : Math.pow(2, (nota.midi - amostra.midi + cents / 100) / 12);
        var amplitude = b.gain * Math.pow(velocidade / 127, 1.4) / camadas;
        var natural = (buffer.duration - amostra.offsetSeconds) / rate;
        var duracaoTotal = b.kind === 'drums' ? natural : Math.min(natural, duracao + b.release);
        var fim = inicio + duracaoTotal;
        var releaseAt = b.kind === 'drums' ? null : inicio + Math.min(duracao, duracaoTotal);
        var voz = criarVoz(instrumento, nota.midi, buffer, inicio, fim, rate, amplitude, releaseAt, amostra.offsetSeconds);
        criadas.push(voz);
      }
      if (b.kind === 'drums') {
        if (nota.midi === 42 || nota.midi === 44) {
          vozes.slice().forEach(function (v) {
            if (v.instrumento === instrumento && v.midi === 46 && v.when <= quando && v.end > quando) pararVoz(v, quando, 0.012);
          });
        } else if (nota.midi === 46) {
          // Também aceita chamadas fora de ordem: um fechamento já programado deve cortar a abertura.
          var fechado = vozes.filter(function (v) {
            return v.instrumento === instrumento && (v.midi === 42 || v.midi === 44) && v.when >= quando && v.when < criadas[0].end;
          }).sort(function (a, c) { return a.when - c.when; })[0];
          if (fechado) pararVoz(criadas[0], fechado.when, 0.012);
        }
      }
      return { midi: nota.midi, rootMidi: amostra.midi, when: quando,
        get endTime() { return Math.max.apply(null, criadas.map(function (v) { return v.end; })); },
        get duration() { return Math.max(0, this.endTime - quando); },
        stop: function (em) { criadas.forEach(function (v) { pararVoz(v, em); }); } };
    }
    function criarVoz(instrumento, midi, buffer, inicio, fim, rate, amplitude, releaseAt, offset) {
      var source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(rate, inicio);
      gain.gain.setValueAtTime(amplitude, inicio);
      if (releaseAt !== null && releaseAt < fim) {
        gain.gain.setValueAtTime(amplitude, releaseAt);
        gain.gain.exponentialRampToValueAtTime(amplitude * 0.0001, fim);
      }
      source.connect(gain); gain.connect(compressor);
      var voz = { source: source, gain: gain, instrumento: instrumento, midi: midi,
        when: inicio, end: fim, amplitude: amplitude, releaseAt: releaseAt, envelopeEnd: fim, limpa: false };
      source.onended = function () { limpar(voz); };
      source.start(inicio, offset); source.stop(fim); vozes.push(voz);
      return voz;
    }
    function parar() {
      vozes.slice().forEach(function (voz) { pararVoz(voz); limpar(voz); });
    }
    function dispose() {
      if (encerrado) return;
      encerrado = true; parar();
      fila.splice(0).forEach(function (tarefa) { tarefa.reject(new Error('O carregamento dos sons foi cancelado.')); });
      pedidos.slice().forEach(function (pedido) { pedido.abortar(); });
      try { compressor.disconnect(); } catch (_) {}
      try { master.disconnect(); } catch (_) {}
      bancos = Object.create(null); buffers = Object.create(null); promessas = Object.create(null);
    }
    return { preparar: preparar, tocar: tocar, parar: parar, dispose: dispose,
      diagnosticoDesempenho: function () { return { nome: desempenho.nome,
        limiteVozes: desempenho.limiteVozes, limiteDownloads: desempenho.limiteDownloads,
        tempoDownload: desempenho.tempoDownload }; } };
  }
  return { criar: criar };
});
