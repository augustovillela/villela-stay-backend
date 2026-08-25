// =====================================================================
// Musique — biblioteca de ÁUDIO DO CLIENTE, servida em /music/audio.js.
//
// Um arquivo só, usado pelas ferramentas abertas e pelos exercícios.
// Duplicar a detecção nos dois lugares faria o afinador e a avaliação
// discordarem sobre a mesma nota — e o aluno teria razão em desconfiar
// dos dois.
//
// O QUE ESTE ARQUIVO FAZ, E O QUE ELE DELIBERADAMENTE NÃO FAZ:
//
//   FAZ  · sintetizar o que o exercício manda tocar (o servidor manda
//          notas MIDI, não áudio — mandar áudio custaria banda em cada
//          item e não deixaria mudar o timbre);
//        · detectar altura por autocorrelação normalizada;
//        · detectar ataques por energia, com período refratário;
//        · medir o ruído de fundo para a calibração.
//
//   NÃO FAZ · julgar. Nada aqui decide acerto, nota ou tolerância. O
//          cliente MEDE, o servidor JULGA. Misturar as duas coisas
//          deixaria o gabarito no navegador.
//
// ⚠️ O microfone é aberto sob demanda e FECHADO ao terminar a captura.
// Faixa aberta depois do exercício é falha de privacidade, não de
// desempenho.
// =====================================================================
'use strict';

const JS = `
(function (global) {
  'use strict';
  var LA4 = 440;
  var ctx = null;

  function audio() {
    if (!ctx) { var C = global.AudioContext || global.webkitAudioContext; ctx = new C(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function freqDeMidi(m) { return LA4 * Math.pow(2, (m - 69) / 12); }

  // =================================================================
  // SÍNTESE — o servidor manda o QUE tocar; o timbre é escolha daqui
  // =================================================================
  function nota(midi, quando, dur, ganho) {
    var a = audio();
    var osc = a.createOscillator(), g = a.createGain();
    osc.type = 'triangle';                       // menos áspero que dente de serra, mais corpo que senoidal
    osc.frequency.value = freqDeMidi(midi);
    // Envelope: sem ataque e queda suaves, cada nota estala — e o estalo
    // atrapalha justamente quem está tentando ouvir a ALTURA.
    g.gain.setValueAtTime(0.0001, quando);
    g.gain.exponentialRampToValueAtTime(ganho || 0.25, quando + 0.02);
    g.gain.setValueAtTime(ganho || 0.25, quando + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
    osc.connect(g); g.connect(a.destination);
    osc.start(quando); osc.stop(quando + dur + 0.02);
  }

  function percussao(quando, forte) {
    var a = audio();
    var osc = a.createOscillator(), g = a.createGain();
    osc.frequency.value = forte ? 1600 : 1000;
    g.gain.setValueAtTime(0.0001, quando);
    g.gain.exponentialRampToValueAtTime(forte ? 0.5 : 0.3, quando + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + 0.05);
    osc.connect(g); g.connect(a.destination);
    osc.start(quando); osc.stop(quando + 0.06);
  }

  /** Toca o que veio no campo \`tocar\` do item. Devolve a duração total. */
  function tocar(spec) {
    if (!spec) return 0;
    var a = audio();
    var t0 = a.currentTime + 0.08;
    var total = 0;
    if (spec.tipo === 'acorde') {
      var d = (spec.dur_ms || 1500) / 1000;
      spec.midi.forEach(function (m) { nota(m, t0, d, 0.16); });
      total = d;
    } else if (spec.tipo === 'ritmo') {
      var passo = 60 / (spec.bpm || 90);
      var t = t0;
      for (var c = 0; c < (spec.contagem || 0); c++) { percussao(t, c === 0); t += passo; }
      (spec.figuras || []).forEach(function (f, i) { percussao(t, i === 0); t += f * passo; });
      total = t - t0;
    } else {
      // sequência (melodia, escala, referência)
      var dur = (spec.dur_ms || 600) / 1000;
      var gap = (spec.gap_ms || 60) / 1000;
      var reps = spec.repeticoes || 1;
      var q = t0;
      for (var r = 0; r < reps; r++) {
        spec.midi.forEach(function (m) { nota(m, q, dur, 0.24); q += dur + gap; });
        q += 0.35;
      }
      total = q - t0;
    }
    return total;
  }

  // =================================================================
  // DETECÇÃO DE ALTURA — autocorrelação normalizada
  // =================================================================
  // Corda e voz têm harmônicos mais fortes que a fundamental: pegar o
  // pico do espectro mostraria a oitava errada com frequência. Aqui se
  // procura PERIODICIDADE, que é o que o ouvido chama de altura.
  function detectarHz(buf, taxa) {
    var N = buf.length, i, j, rms = 0;
    for (i = 0; i < N; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / N);
    if (rms < 0.008) return { hz: -1, rms: rms, confianca: 0 };

    var limiar = 0.2, r1 = 0, r2 = N - 1;
    for (i = 0; i < N / 2; i++) if (Math.abs(buf[i]) < limiar) r1 = i;
    for (i = 1; i < N / 2; i++) if (Math.abs(buf[N - i]) < limiar) r2 = N - i;
    var b = buf.slice(r1, r2), M = b.length;
    if (M < 512) return { hz: -1, rms: rms, confianca: 0 };

    var c = new Float32Array(M).fill(0);
    for (i = 0; i < M; i++) for (j = 0; j < M - i; j++) c[i] += b[j] * b[j + i];

    var d = 0; while (d < M - 1 && c[d] > c[d + 1]) d++;
    var maxVal = -1, maxPos = -1;
    for (i = d; i < M; i++) if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
    if (maxPos <= 0) return { hz: -1, rms: rms, confianca: 0 };

    // Interpolação parabólica: sem ela a leitura anda em degraus de
    // vários cents e a agulha treme sem o som ter mudado.
    var y1 = c[maxPos - 1] || 0, y2 = c[maxPos], y3 = c[maxPos + 1] || 0;
    var a2 = (y1 + y3 - 2 * y2) / 2, b2 = (y3 - y1) / 2;
    var pico = a2 ? maxPos - b2 / (2 * a2) : maxPos;
    var hz = taxa / pico;
    if (hz < 55 || hz > 2000) return { hz: -1, rms: rms, confianca: 0 };
    return { hz: hz, rms: rms, confianca: Math.max(0, Math.min(1, maxVal / (c[0] || 1))) };
  }

  // =================================================================
  // MICROFONE
  // =================================================================
  var micStream = null, micAnalisador = null, micBuf = null;

  function abrirMic() {
    if (micStream) return Promise.resolve();
    if (!global.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('Este navegador não dá acesso ao microfone. Tente pelo Chrome, Edge ou Firefox atualizados.'));
    }
    // Eco, ruído e ganho automático MEXEM no sinal — e medir sinal
    // alterado é medir o filtro, não o aluno.
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    }).then(function (stream) {
      micStream = stream;
      var a = audio();
      var src = a.createMediaStreamSource(stream);
      micAnalisador = a.createAnalyser();
      micAnalisador.fftSize = 4096;
      micBuf = new Float32Array(micAnalisador.fftSize);
      src.connect(micAnalisador);
    }).catch(function (e) {
      throw new Error(e && e.name === 'NotAllowedError'
        ? 'A permissão do microfone foi negada. Libere o microfone para este site e tente de novo.'
        : 'Não consegui usar o microfone: ' + ((e && e.message) || 'erro desconhecido'));
    });
  }

  function fecharMic() {
    if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
    micAnalisador = null; micBuf = null;
  }

  function amostrar() { micAnalisador.getFloatTimeDomainData(micBuf); return micBuf; }

  /** Roda \`passo(agora_ms)\` a cada quadro por \`ms\`, e resolve no fim. */
  function durante(ms, passo) {
    return new Promise(function (resolve) {
      var t0 = performance.now();
      (function ciclo() {
        var agora = performance.now() - t0;
        if (agora >= ms) return resolve();
        passo(agora);
        requestAnimationFrame(ciclo);
      })();
    });
  }

  /** Nota sustentada → amostras para o motor de afinação. */
  function capturarSustentada(ms, aoVivo) {
    var amostras = [];
    return abrirMic()
      .then(function () {
        return durante(ms, function (t) {
          var r = detectarHz(amostrar(), ctx.sampleRate);
          if (r.hz > 0) {
            amostras.push({ hz: r.hz, ms: Math.round(t), confianca: r.confianca });
            if (aoVivo) aoVivo(r);
          }
        });
      })
      .then(function () { fecharMic(); return amostras; })
      .catch(function (e) { fecharMic(); throw e; });
  }

  /**
   * Melodia → eventos de nota. Uma nota "vira" outra quando a altura sai
   * mais de meio semitom e fica lá por alguns quadros: sem essa
   * histerese, um vibrato viraria dez notas.
   */
  function capturarMelodia(ms, aoVivo) {
    var eventos = [], atual = null, forasSeguidos = 0;
    function fechar(t) {
      if (atual && atual.amostras.length >= 3) {
        var ord = atual.amostras.slice().sort(function (a, b) { return a - b; });
        eventos.push({
          hz: ord[Math.floor(ord.length / 2)],
          inicio_ms: Math.round(atual.inicio), dur_ms: Math.round(t - atual.inicio),
          confianca: atual.conf / atual.amostras.length,
        });
      }
      atual = null;
    }
    return abrirMic()
      .then(function () {
        return durante(ms, function (t) {
          var r = detectarHz(amostrar(), ctx.sampleRate);
          if (r.hz <= 0) {
            if (atual && ++forasSeguidos > 4) fechar(t);
            return;
          }
          forasSeguidos = 0;
          if (aoVivo) aoVivo(r);
          var midi = 69 + 12 * Math.log2(r.hz / LA4);
          if (!atual) { atual = { midi: midi, inicio: t, amostras: [r.hz], conf: r.confianca }; return; }
          if (Math.abs(midi - atual.midi) > 0.6) { fechar(t); atual = { midi: midi, inicio: t, amostras: [r.hz], conf: r.confianca }; }
          else { atual.amostras.push(r.hz); atual.conf += r.confianca; atual.midi = (atual.midi * 3 + midi) / 4; }
        });
      })
      .then(function () { fechar(ms); fecharMic(); return eventos; })
      .catch(function (e) { fecharMic(); throw e; });
  }

  /**
   * Palmas → tempos de ataque. Detecção por energia: um ataque é uma
   * SUBIDA rápida acima do piso de ruído, com período refratário para o
   * eco da palma não virar uma segunda palma.
   */
  function capturarOnsets(ms, aoVivo) {
    var onsets = [], anterior = 0, ultimo = -999, piso = 0.004;
    return abrirMic()
      .then(function () {
        return durante(ms, function (t) {
          var buf = amostrar(), e = 0;
          for (var i = 0; i < buf.length; i++) e += buf[i] * buf[i];
          e = Math.sqrt(e / buf.length);
          if (e > piso && e > anterior * 2.2 && t - ultimo > 90) {
            onsets.push(Math.round(t)); ultimo = t;
            if (aoVivo) aoVivo(onsets.length);
          }
          // piso adaptativo lento: sala que muda de ruído não vira ataque
          piso = Math.max(0.002, piso * 0.995 + e * 0.005);
          anterior = e;
        });
      })
      .then(function () { fecharMic(); return onsets; })
      .catch(function (e) { fecharMic(); throw e; });
  }

  /** Ruído de fundo em dBFS, para a calibração. */
  function medirRuido(ms) {
    var soma = 0, n = 0;
    return abrirMic()
      .then(function () {
        return durante(ms || 2500, function () {
          var buf = amostrar(), e = 0;
          for (var i = 0; i < buf.length; i++) e += buf[i] * buf[i];
          soma += Math.sqrt(e / buf.length); n++;
        });
      })
      .then(function () {
        fecharMic();
        var rms = n ? soma / n : 0;
        return { rms: rms, db: rms > 0 ? Math.round(20 * Math.log10(rms) * 10) / 10 : -90 };
      })
      .catch(function (e) { fecharMic(); throw e; });
  }

  global.MusiqueAudio = {
    audio: audio, tocar: tocar, freqDeMidi: freqDeMidi, detectarHz: detectarHz,
    capturarSustentada: capturarSustentada, capturarMelodia: capturarMelodia,
    capturarOnsets: capturarOnsets, medirRuido: medirRuido, fecharMic: fecharMic,
  };

  // Sair da página com o microfone aberto é falha de privacidade.
  global.addEventListener('pagehide', fecharMic);
})(window);
`;

function registrar(app) {
  app.get('/music/audio.js', (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300')
      .send(JS);
  });
}

module.exports = { registrar, JS };
