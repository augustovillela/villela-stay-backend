// Perfil vocal evolutivo: análise local de frequência fundamental, sem enviar áudio.
(function (global) {
  'use strict';
  var C = global.MusiqueCifras, el = C.el, api = C.api;
  var nomes = ['dó', 'dó#', 'ré', 'ré#', 'mi', 'fá', 'fá#', 'sol', 'sol#', 'lá', 'lá#', 'si'];
  function nota(m) { var pc = ((m % 12) + 12) % 12; return nomes[pc] + Math.floor(m / 12 - 1); }
  function quant(xs, p) { if (!xs.length) return null; var s = xs.slice().sort(function (a, b) { return a - b; }); return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]; }
  function midi(hz) { return 69 + 12 * Math.log(hz / 440) / Math.LN2; }
  function pitch(buf, sr) {
    var rms = 0, i; for (i = 0; i < buf.length; i++) rms += buf[i] * buf[i]; rms = Math.sqrt(rms / buf.length);
    if (rms < 0.008) return null;
    var best = 0, score = 0, min = Math.floor(sr / 1000), max = Math.floor(sr / 70);
    for (var lag = min; lag <= max; lag++) { var ac = 0, norm = 0; for (i = 0; i < buf.length - lag; i++) { ac += buf[i] * buf[i + lag]; norm += buf[i] * buf[i]; } var q = norm ? ac / norm : 0; if (q > score) { score = q; best = lag; } }
    if (!best || score < 0.55) return null; return { hz: sr / best, confianca: Math.max(0, Math.min(1, score)), midi: midi(sr / best) };
  }
  function perfilTexto(p) { return p ? 'Perfil salvo · ' + nota(p.grave_midi) + '–' + nota(p.agudo_midi) + ' · região mais estável: ' + nota(p.regiao_min_midi) + '–' + nota(p.regiao_max_midi) : 'Ainda não há avaliação vocal salva.'; }
  function painel(cifraId, perfilInicial) {
    var box = el('div', { class: 'cf-voz-painel', style: 'padding:12px;border:1px solid #dbe3ef;border-radius:12px;margin:10px 0' });
    var status = el('p', { class: 'm', txt: perfilTexto(perfilInicial) });
    var instr = el('p', { txt: 'O teste toca notas simples. Cante “ah” ou “ô” sustentando cada nota; o áudio é analisado apenas neste navegador.' });
    var iniciar = C.botao(perfilInicial ? '🎤 Reavaliar minha voz' : '🎤 Avaliar extensão vocal', iniciarTeste, 'peq');
    box.appendChild(el('b', { txt: 'Extensão e conforto vocal' })); box.appendChild(status); box.appendChild(instr); box.appendChild(iniciar);
    function iniciarTeste() {
      iniciar.disabled = true; status.textContent = 'Preparando microfone…';
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status.textContent = 'Este navegador não oferece acesso ao microfone.'; iniciar.disabled = false; return; }
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
        var AC = global.AudioContext || global.webkitAudioContext, ctx = new AC(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 2048; src.connect(an); var buf = new Float32Array(an.fftSize), vals = [], conf = [], t0 = performance.now(), ultima = 0;
        var notasGuia = [48, 55, 60, 67, 72], fase = -1, os = ctx.createOscillator(), gn = ctx.createGain(); os.connect(gn); gn.connect(ctx.destination); os.type = 'sine'; gn.gain.value = 0.04; os.start();
        function guia() { fase++; if (fase >= notasGuia.length) { os.stop(); finalizar(); return; } var f = 440 * Math.pow(2, (notasGuia[fase] - 69) / 12); os.frequency.value = f; status.textContent = 'Cante ' + nota(notasGuia[fase]) + ' por alguns segundos (' + (fase + 1) + '/5)…'; setTimeout(guia, 1500); }
        function ler() { an.getFloatTimeDomainData(buf); var p = pitch(buf, ctx.sampleRate); if (p && p.midi >= 30 && p.midi <= 96) { vals.push(p.midi); conf.push(p.confianca); } if (performance.now() - t0 < 7800) { ultima = requestAnimationFrame(ler); } }
        function finalizar() { cancelAnimationFrame(ultima); stream.getTracks().forEach(function (x) { x.stop(); }); ctx.close(); if (vals.length < 8) { status.textContent = 'Não consegui medir uma sustentação. Tente em um local silencioso e cante mais perto do microfone.'; iniciar.disabled = false; return; } var grave = Math.round(quant(vals, .05)), agudo = Math.round(quant(vals, .95)), rmin = Math.round(quant(vals, .35)), rmax = Math.round(quant(vals, .65)); var estabilidade = Math.max(0, Math.min(1, 1 - ((rmax - rmin) / Math.max(12, agudo - grave)))); var confianca = conf.reduce(function (a, b) { return a + b; }, 0) / conf.length; var dados = { cifra_id: cifraId || '', nota_min_midi: grave, nota_max_midi: agudo, regiao_min_midi: rmin, regiao_max_midi: rmax, estabilidade: Number(estabilidade.toFixed(3)), confianca: Number(confianca.toFixed(3)), amostras: vals.length }; status.textContent = 'Salvando resultado…'; api('POST', '/perfil-vocal/avaliacoes', dados).then(function (r) { status.textContent = perfilTexto(r.perfil) + ' · avaliação adicionada agora.'; iniciar.disabled = false; }).catch(function (e) { status.textContent = 'Medição concluída, mas não foi possível salvar: ' + e.message; iniciar.disabled = false; }); }
        ler(); guia();
      }).catch(function () { status.textContent = 'O microfone não foi autorizado. Permita o acesso e tente novamente.'; iniciar.disabled = false; });
    }
    return box;
  }
  function botao() {
    var b = el('button', { type: 'button', class: 'cf-voz-atalho', txt: '🎤 Perfil vocal', title: 'Abrir o perfil vocal' });
    b.onclick = function () {
      var p = document.querySelector('.cf-voz-painel');
      if (p) p.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    return b;
  }
  C.Voz = { painel: painel, perfilTexto: perfilTexto, botao: botao };
})(window);
