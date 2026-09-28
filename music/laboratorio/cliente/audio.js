// =====================================================================
// Musique · Laboratório — CLIENTE · som.
//
// Regras (ADR-0013 §5), cada uma com o seu porquê:
//   · UM AudioContext (o do MusiqueAudio): vários contextos concorrentes
//     esgotam o limite do navegador e dessincronizam;
//   · o som começa só depois de um gesto (política dos navegadores);
//   · sequenciador e metrônomo AGENDAM no relógio do áudio com
//     look-ahead — setInterval nunca é o relógio: ele atrasa dezenas de
//     ms sob carga e isso se ouve;
//   · toda nota tem envelope (ataque e soltura): sem ele, clique;
//   · tudo passa por um compressor-limitador e um volume que começa
//     baixo; botão "Parar" sempre visível enquanto há som;
//   · sair ou esconder a aba PARA tudo.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente;
  var ctx = null, mestre = null, limitador = null, analisador = null;
  var ativos = new Set();
  var agendadores = new Set();
  var volume = C.lerLocal('volume', 45);

  function audio() {
    if (!ctx) {
      ctx = w.MusiqueAudio && w.MusiqueAudio.audio ? w.MusiqueAudio.audio() : new (w.AudioContext || w.webkitAudioContext)();
      limitador = ctx.createDynamicsCompressor();
      limitador.threshold.value = -10; limitador.knee.value = 6; limitador.ratio.value = 12;
      limitador.attack.value = 0.003; limitador.release.value = 0.2;
      mestre = ctx.createGain(); mestre.gain.value = curva(volume);
      analisador = ctx.createAnalyser(); analisador.fftSize = 2048;
      mestre.connect(limitador); limitador.connect(analisador); analisador.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function curva(v) { var x = Math.max(0, Math.min(100, Number(v))) / 100; return 0.6 * x * x; }   // perceptual e com teto

  function mostrarBarra(on) { var b = C.$('#lab-som'); if (b) b.hidden = !on; }
  function registrar(no, fim) {
    ativos.add(no); mostrarBarra(true);
    no.onended = function () { ativos.delete(no); if (!ativos.size && !agendadores.size) mostrarBarra(false); };
    return no;
  }

  var FREQ = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  /** Uma voz com envelope. timbre: piano | seno | orgao | pluck. */
  function voz(f, quando, dur, o) {
    o = o || {};
    var a = audio();
    var g = a.createGain();
    var pico = (o.vel == null ? 0.22 : o.vel);
    var t = Math.max(quando, a.currentTime);
    var timbre = o.timbre || 'piano';
    var parciais = timbre === 'seno' ? [[1, 1]] : timbre === 'orgao' ? [[1, 1], [2, 0.5], [3, 0.3], [4, 0.2]] : timbre === 'pluck' ? [[1, 1], [2, 0.45], [3, 0.25], [5, 0.1]] : [[1, 1], [2, 0.38], [3, 0.14], [4, 0.08]];
    var soma = parciais.reduce(function (x, p) { return x + p[1]; }, 0);
    var decai = timbre === 'orgao' || timbre === 'seno' ? false : true;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pico, t + 0.012);
    if (decai) g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pico * 0.25), t + Math.min(dur, 0.9));
    g.gain.setValueAtTime(decai ? Math.max(0.0002, pico * 0.25) : pico, t + Math.max(0.02, dur - 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    g.connect(mestre);
    parciais.forEach(function (p) {
      var os = a.createOscillator(); var pg = a.createGain();
      os.type = 'sine'; os.frequency.value = f * p[0]; pg.gain.value = p[1] / soma;
      os.connect(pg); pg.connect(g);
      os.start(t); os.stop(t + dur + 0.15);
      registrar(os);
    });
  }

  /** Toca MIDIs: melodico (um após o outro), harmonico (juntos), dedilhado. */
  function tocar(midis, o) {
    o = o || {};
    var a = audio(); var t0 = a.currentTime + 0.05;
    var ms = (midis || []).filter(function (m) { return m != null; });
    if (o.modo === 'harmonico') { ms.forEach(function (m) { voz(FREQ(m), t0, o.dur || 1.6, { vel: 0.5 / Math.max(2, ms.length), timbre: o.timbre }); }); return (o.dur || 1.6); }
    if (o.modo === 'dedilhado') { ms.forEach(function (m, i) { voz(FREQ(m), t0 + i * 0.045, (o.dur || 1.8) - i * 0.045, { vel: 0.45 / Math.max(2, ms.length), timbre: 'pluck' }); }); return o.dur || 1.8; }
    var dur = o.dur || 0.5;
    ms.forEach(function (m, i) { voz(FREQ(m), t0 + i * dur, dur * 0.95, { timbre: o.timbre }); });
    return ms.length * dur;
  }
  function tocarHz(hzs, o) { var a = audio(); var t0 = a.currentTime + 0.05; hzs.forEach(function (f) { voz(f, t0, (o && o.dur) || 1.5, { timbre: 'seno', vel: 0.25 / hzs.length }); }); }
  /** Sequência de acordes (listas de MIDI). */
  function sequencia(acordes, o) {
    var a = audio(); var t0 = a.currentTime + 0.05; var dur = (o && o.dur) || 1;
    acordes.forEach(function (ms, i) { ms.forEach(function (m) { voz(FREQ(m), t0 + i * dur, dur * 0.92, { vel: 0.5 / Math.max(2, ms.length) }); }); });
  }

  // ---- percussão sintetizada (sem amostras: nada de licença a pedir) ----
  var ruidoBuf = null;
  function ruido() {
    var a = audio();
    if (!ruidoBuf) { ruidoBuf = a.createBuffer(1, a.sampleRate, a.sampleRate); var x = ruidoBuf.getChannelData(0); for (var i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; }
    var s = a.createBufferSource(); s.buffer = ruidoBuf; return s;
  }
  var BATERIA = {
    bumbo: function (t, v) { var a = audio(); var o = a.createOscillator(); var g = a.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(g); g.connect(mestre); o.start(t); o.stop(t + 0.4); registrar(o); },
    caixa: function (t, v) { var a = audio(); var n = ruido(); var f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200; var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); n.connect(f); f.connect(g); g.connect(mestre); n.start(t); n.stop(t + 0.2); registrar(n);
      var o = a.createOscillator(); var og = a.createGain(); o.frequency.value = 190; og.gain.setValueAtTime(0.3 * v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(og); og.connect(mestre); o.start(t); o.stop(t + 0.12); registrar(o); },
    chimbal: function (t, v) { var a = audio(); var n = ruido(); var f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); n.connect(f); f.connect(g); g.connect(mestre); n.start(t); n.stop(t + 0.07); registrar(n); },
    palma: function (t, v) { var a = audio(); [0, 0.011, 0.022].forEach(function (dt) { var n = ruido(); var f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; var g = a.createGain(); g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.35 * v, t + dt + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.09); n.connect(f); f.connect(g); g.connect(mestre); n.start(t + dt); n.stop(t + dt + 0.1); registrar(n); }); },
    clique: function (t, v, forte) { var a = audio(); var o = a.createOscillator(); var g = a.createGain(); o.frequency.value = forte ? 1760 : 1200; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); o.connect(g); g.connect(mestre); o.start(t); o.stop(t + 0.05); registrar(o); },
  };

  /**
   * Agendador com look-ahead. `aoPasso(i, quando)` agenda o som do passo
   * i no instante `quando` (relógio do áudio). O timer só OLHA à frente.
   * `visual(i)` é chamado perto da hora certa, por requestAnimationFrame.
   */
  function agendador(o) {
    var a = audio();
    var bpm = o.bpm || 100, porTempo = o.porTempo || 4, passos = o.passos || 16, i = 0;
    var prox = a.currentTime + 0.08, timer = null, raf = null, fila = [];
    var swing = o.swing || 0;
    function durPasso() { return 60 / bpm / porTempo; }
    function tick() {
      while (prox < a.currentTime + 0.12) {
        var q = prox + (swing && i % 2 === 1 ? durPasso() * swing : 0);
        o.aoPasso(i, q);
        fila.push({ i: i, t: q });
        prox += durPasso();
        i = (i + 1) % passos;
        if (o.umaVez && i === 0) { prox = Infinity; break; }
      }
      timer = setTimeout(tick, 25);
    }
    function pintar() {
      while (fila.length && fila[0].t <= a.currentTime) { var x = fila.shift(); if (o.visual) o.visual(x.i); }
      raf = requestAnimationFrame(pintar);
    }
    var ag = {
      parar: function () { clearTimeout(timer); cancelAnimationFrame(raf); agendadores.delete(ag); if (o.visual) o.visual(-1); if (!ativos.size && !agendadores.size) mostrarBarra(false); },
      bpm: function (v) { bpm = Math.max(20, Math.min(400, Number(v) || bpm)); },
      swing: function (v) { swing = Math.max(0, Math.min(0.66, Number(v) || 0)); },
    };
    agendadores.add(ag); mostrarBarra(true);
    tick(); pintar();
    return ag;
  }

  function pararTudo() {
    agendadores.forEach(function (ag) { ag.parar(); });
    ativos.forEach(function (n) { try { n.stop(); } catch (_) { /* já parou */ } });
    ativos.clear(); mostrarBarra(false);
    if (C.Som.aoParar) C.Som.aoParar();
  }

  C.Som = { audio: audio, voz: voz, tocar: tocar, tocarHz: tocarHz, sequencia: sequencia, bateria: BATERIA, agendador: agendador, ruido: ruido,
    parar: pararTudo, analisador: function () { audio(); return analisador; }, saida: function () { audio(); return mestre; }, FREQ: FREQ, registrar: registrar };

  d.addEventListener('DOMContentLoaded', function () {
    var p = C.$('#lab-parar'); if (p) p.onclick = pararTudo;
    var v = C.$('#lab-volume');
    if (v) { v.value = volume; v.oninput = function () { volume = Number(v.value); C.guardar('volume', volume); if (mestre) mestre.gain.setTargetAtTime(curva(volume), ctx.currentTime, 0.02); }; }
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') pararTudo(); });
  });
  w.addEventListener('pagehide', pararTudo);
  d.addEventListener('visibilitychange', function () { if (d.hidden) pararTudo(); });
})(window, document);
