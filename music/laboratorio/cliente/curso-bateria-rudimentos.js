(function (w, d) {
  'use strict';
  function iniciar() {
    var p = d.querySelector('[data-rudimento-player]');
    if (!p) return;
    var play = p.querySelector('[data-rudimento-play]');
    var stop = p.querySelector('[data-rudimento-stop]');
    var slider = p.querySelector('[data-rudimento-bpm-input]');
    var output = p.querySelector('[data-rudimento-bpm-output]');
    var contagem = p.querySelector('[data-contagem]');
    var maos = p.querySelectorAll('[data-mao]');
    var partitura = p.querySelector('[data-partitura]');
    var timer = null;
    var ctx = null;
    var passo = 0;
    var notas = ['R', 'L', 'R', 'L', 'R', 'L', 'R', 'L'];
    function som(mao) {
      try {
        ctx = ctx || new (w.AudioContext || w.webkitAudioContext)();
        var o = ctx.createOscillator(); var g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = mao === 'R' ? 180 : 280;
        g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
        o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.1);
      } catch (_) { /* áudio opcional quando o navegador não oferece Web Audio */ }
    }
    function pintar() {
      var atual = passo % notas.length;
      Array.prototype.forEach.call(maos, function (m) { m.classList.toggle('ativo', m.getAttribute('data-mao') === notas[atual]); });
      partitura.textContent = notas.map(function (n, i) { return i === atual ? '◉' : '●'; }).join(' ');
      contagem.textContent = 'Contagem: ' + ((atual % 4) + 1) + ' · ' + notas[atual] + (notas[atual] === 'R' ? ' (direita)' : ' (esquerda)');
      som(notas[atual]); passo += 1;
    }
    function parar() { if (timer) w.clearInterval(timer); timer = null; play.textContent = '▶ Reproduzir'; Array.prototype.forEach.call(maos, function (m) { m.classList.remove('ativo'); }); contagem.textContent = 'Pronto para começar'; }
    function tocar() { parar(); passo = 0; var bpm = Number(slider.value); pintar(); timer = w.setInterval(pintar, 60000 / bpm / 2); play.textContent = '⏸ Reproduzindo'; }
    play.addEventListener('click', function () { if (timer) parar(); else tocar(); });
    stop.addEventListener('click', parar);
    slider.addEventListener('input', function () { output.value = slider.value; output.textContent = slider.value; if (timer) tocar(); });
  }
  d.addEventListener('DOMContentLoaded', iniciar);
})(window, document);
