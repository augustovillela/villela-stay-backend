(function (w, d) {
  'use strict';
  function iniciar() {
    var p = d.querySelector('[data-rudimento-player]');
    if (!p) return;
    var play = p.querySelector('[data-rudimento-play]'); var stop = p.querySelector('[data-rudimento-stop]');
    var slider = p.querySelector('[data-rudimento-bpm-input]'); var output = p.querySelector('[data-rudimento-bpm-output]');
    var contagem = p.querySelector('[data-contagem]'); var partitura = p.querySelector('[data-partitura]');
    var caixa = p.querySelector('.rudimento-caixa'); var baquetas = p.querySelectorAll('[data-baqueta]');
    var timer = null; var ctx = null; var passo = 0; var padrao = [];
    try { padrao = JSON.parse(p.getAttribute('data-rudimento-padrao') || '[]'); } catch (_) { padrao = []; }
    if (!padrao.length) padrao = ['R', 'L', 'R', 'L'];
    function ruido(duracao, ganho, filtro) {
      var tamanho = Math.max(1, Math.floor(ctx.sampleRate * duracao)); var buffer = ctx.createBuffer(1, tamanho, ctx.sampleRate); var dados = buffer.getChannelData(0);
      for (var i = 0; i < tamanho; i += 1) dados[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / tamanho, 2);
      var fonte = ctx.createBufferSource(); var f = ctx.createBiquadFilter(); var g = ctx.createGain(); fonte.buffer = buffer; f.type = filtro || 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7; g.gain.setValueAtTime(ganho, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duracao); fonte.connect(f); f.connect(g); g.connect(ctx.destination); fonte.start();
    }
    function caixaSom(token) {
      try {
        ctx = ctx || new (w.AudioContext || w.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume();
        var acento = token === token.toUpperCase() && token.indexOf('f') !== 0 && token.indexOf('g') !== 0; var fantasma = token.indexOf('g') === 0 || token === token.toLowerCase();
        var agora = ctx.currentTime; var o = ctx.createOscillator(); var g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(acento ? 210 : 175, agora); o.frequency.exponentialRampToValueAtTime(95, agora + 0.12); g.gain.setValueAtTime(fantasma ? 0.06 : acento ? 0.24 : 0.14, agora); g.gain.exponentialRampToValueAtTime(0.0001, agora + 0.14); o.connect(g); g.connect(ctx.destination); o.start(agora); o.stop(agora + 0.15);
        ruido(acento ? 0.24 : 0.16, fantasma ? 0.08 : acento ? 0.34 : 0.2, 'highpass'); ruido(acento ? 0.11 : 0.07, fantasma ? 0.03 : 0.08, 'bandpass');
      } catch (_) { /* a animação continua sem áudio quando Web Audio não existe */ }
    }
    function pintar() {
      var token = padrao[passo % padrao.length]; var mao = token.replace(/^[fg]/, '').charAt(0); var idx = passo % padrao.length;
      Array.prototype.forEach.call(baquetas, function (b) { var ativo = b.getAttribute('data-baqueta') === mao; b.classList.toggle('ativo', ativo); b.classList.toggle('fantasma', token.charAt(0) === 'g'); b.classList.toggle('flam', token.charAt(0) === 'f'); b.style.setProperty('--batida-x', ((idx * 37 + Number(p.getAttribute('data-rudimento-numero')) * 13) % 46 - 23) + 'px'); b.style.setProperty('--batida-y', (idx % 3 * 5) + 'px'); });
      caixa.classList.toggle('acento', token === token.toUpperCase() && token.charAt(0) !== 'f' && token.charAt(0) !== 'g'); caixa.classList.toggle('fantasma', token.charAt(0) === 'g'); caixa.classList.toggle('flam', token.charAt(0) === 'f');
      partitura.textContent = padrao.map(function (n, i) { return i === idx ? (n.charAt(0) === 'g' ? '·' : n.charAt(0) === 'f' ? '◌' : '●') : '○'; }).join(' ');
      contagem.textContent = 'Ataque ' + (idx + 1) + ' de ' + padrao.length + ' · ' + (token.charAt(0) === 'g' ? 'nota fantasma' : token.charAt(0) === 'f' ? 'flam' : token);
      caixaSom(token); passo += 1;
    }
    function parar() { if (timer) w.clearInterval(timer); timer = null; play.textContent = '▶ Reproduzir'; Array.prototype.forEach.call(baquetas, function (b) { b.classList.remove('ativo', 'fantasma', 'flam'); }); caixa.classList.remove('acento', 'fantasma', 'flam'); contagem.textContent = 'Pronto para começar'; }
    function tocar() { parar(); passo = 0; pintar(); timer = w.setInterval(pintar, 60000 / Number(slider.value) / 2); play.textContent = '⏸ Reproduzindo'; }
    play.addEventListener('click', function () { if (timer) parar(); else tocar(); }); stop.addEventListener('click', parar);
    slider.addEventListener('input', function () { output.value = slider.value; output.textContent = slider.value; if (timer) tocar(); });
  }
  d.addEventListener('DOMContentLoaded', iniciar);
})(window, document);
