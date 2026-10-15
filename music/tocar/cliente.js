(function () {
  'use strict';
  var app = document.getElementById('tocar-app');
  if (!app) return;
  var Core = window.MusiqueTocarCore, Audio = window.MusiqueTocarAudio;
  if (!Core || !Audio) { app.textContent = 'Não foi possível carregar o modo de prática. Recarregue a página.'; return; }
  var boot = JSON.parse(app.getAttribute('data-estado') || '{}');
  var chart = Core.demoChart(), input = null, demoContext = null, ctx = null;
  var media = null, mediaUrl = null, mediaStarting = false, raf = null, nodes = [], generation = 0;
  var state = { mode: 'idle', running: false, position: 0, origin: 0, start: 0, speed: 1,
    from: 0, to: chart.duration, loop: false, judge: null, lastFrame: null, offset: 0,
    nextNote: 0, nextBeat: 0, saved: false, connected: false, connecting: false, calibration: null, endedAt: null,
    instrument: 'violao', inputKind: 'microphone' };
  var COLORS = ['#e9a56a', '#e7ca64', '#70c9ae', '#79b7ed', '#b39cdd', '#e89cac'];
  var STRINGS = ['6 · mi', '5 · lá', '4 · ré', '3 · sol', '2 · si', '1 · mi'];
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return n;
  }
  function $(id) { return document.getElementById(id); }
  function on(id, type, fn) { $(id).addEventListener(type, fn); }
  function text(id, value) { $(id).textContent = value; }
  function msg(value, error) { text('tj-status', value); $('tj-status').classList.toggle('tj-error', !!error); }
  function timeLabel(s) { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
  function noteName(midi) { return ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'][((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1); }
  function profile() {
    var microphone = state.inputKind === 'microphone';
    text('tj-instrument-label', state.instrument === 'violao' ? 'Violão' : 'Guitarra');
    $('tj-back').href = '/music/tutor-braco?i=' + state.instrument;
    text('tj-input-title', microphone ? 'Prepare o microfone' : state.inputKind === 'interface' ? 'Prepare a interface' : 'Prepare o Real Tone');
    text('tj-input-help', microphone
      ? 'Use o microfone do computador, um USB ou um ligado à interface. Aproxime-o do instrumento em um ambiente silencioso. Toque uma corda por vez.'
      : state.inputKind === 'interface'
        ? 'Ligue o instrumento à entrada da interface indicada para instrumento. O violão precisa ter captação e saída para cabo. Selecione a interface na lista abaixo.'
        : 'Plugue o Real Tone na USB e no instrumento com saída para cabo. Selecione o adaptador Rocksmith na lista abaixo.');
    text('tj-listening-help', microphone
      ? 'Use fones: o microfone também pode captar o som do computador e gerar acertos indevidos. Na prática, os sons de apoio começam desligados. Um microfone ligado à interface também usa este modo.'
      : 'Confira o medidor tocando uma corda e ajuste o ganho sem saturar. Se estiver usando um microfone na interface, escolha o modo Microfone.');
    $('tj-connect').textContent = state.connected ? 'Desconectar' : microphone ? 'Ativar microfone' : 'Ativar entrada';
  }
  function changeProfile() {
    stop(); cancelCalibration(); if (input) input.parar();
    state.instrument = $('tj-instrument').value;
    state.inputKind = $('tj-connection-type').value;
    $('tj-device').value = '';
    $('tj-metronome').checked = state.inputKind !== 'microphone';
    $('tj-backing').checked = state.inputKind !== 'microphone';
    $('tj-guide').checked = false;
    profile(); msg('Entrada ajustada. Ative o áudio e selecione o dispositivo que vai usar.');
  }
  function context() {
    var c = input && input.contexto();
    if (c && c.state !== 'closed') return c;
    if (!demoContext || demoContext.state === 'closed') demoContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    return demoContext;
  }
  function silence() { nodes.forEach(function (n) { try { n.stop(); } catch (_) {} }); nodes = []; }
  function tone(midi, when, duration, volume, shape) {
    var osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = shape || 'triangle';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12); gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.025, duration));
    osc.connect(gain); gain.connect(ctx.destination); osc.start(when); osc.stop(when + duration + 0.03); nodes.push(osc);
    osc.onended = function () { osc.disconnect(); gain.disconnect(); var i = nodes.indexOf(osc); if (i >= 0) nodes.splice(i, 1); };
  }
  function current() {
    if (!state.running || !ctx) return state.position;
    if (media && withBacking() && mediaStarting) return state.position;
    if (media && withBacking() && !media.paused && state.position >= state.from) return media.currentTime;
    return state.start + (ctx.currentTime - state.origin) * state.speed;
  }
  function withBacking() { return state.mode === 'demo' || $('tj-backing').checked; }
  function judgeReset() { state.judge = Core.criarJulgador(chart, { offsetMs: state.offset * state.speed, from: state.from, to: state.to }); state.saved = false; }
  function scheduleReset(p) {
    state.nextNote = chart.notes.findIndex(function (n) { return n.time >= p - 0.01; });
    if (state.nextNote < 0) state.nextNote = chart.notes.length;
    state.nextBeat = Math.ceil(p / (60 / chart.bpm));
  }
  function pause() {
    generation++; mediaStarting = false;
    if (state.running) state.position = Math.min(state.to, current());
    state.running = false; silence(); if (media) media.pause();
    text('tj-count', '');
    text('tj-pause', 'Continuar'); updateTransport();
  }
  function stop(reset) {
    pause(); state.mode = 'idle'; state.judge = null;
    if (reset !== false) state.position = state.from;
    if (media) media.currentTime = Math.max(0, state.position);
    text('tj-mode', 'PRONTO PARA TOCAR'); text('tj-pause', 'Pausar'); updateScore(); updateTransport();
  }
  async function start(mode, resume) {
    if (mode === 'practice' && !state.connected) { msg('Ative o áudio e selecione o microfone ou a interface antes de praticar.', true); return; }
    cancelCalibration(); silence(); var attempt = ++generation;
    try {
      ctx = context(); await ctx.resume();
      if (attempt !== generation) return;
      if (resume && state.position >= state.to) resume = false;
      if (!resume) { state.position = state.from - 4 * 60 / chart.bpm; judgeReset(); }
      if (mode === 'practice' && !state.judge.resumo().total) { stop(); msg('Este trecho não contém notas. Escolha um trecho do arranjo.', true); return; }
      state.mode = mode; state.start = state.position; state.origin = ctx.currentTime; state.running = true;
      state.endedAt = null; mediaStarting = false; scheduleReset(state.position);
      if (media) { media.pause(); media.currentTime = Math.max(state.from, state.position); media.playbackRate = state.speed; }
      text('tj-mode', mode === 'demo' ? 'DEMONSTRAÇÃO · SEM AVALIAÇÃO' : 'PRÁTICA · NOTAS ISOLADAS');
      text('tj-pause', 'Pausar');
      msg(mode === 'demo' ? 'Observe os números das casas chegando à linha de tocar.' : 'Toque uma nota por vez. A indicação de corda e casa vem do arranjo.');
      updateTransport();
    } catch (e) { state.running = false; msg('Não consegui iniciar o áudio: ' + e.message, true); }
  }
  function updateTransport() {
    $('tj-practice').disabled = !state.connected || state.running;
    $('tj-demo').disabled = state.running;
    $('tj-pause').disabled = state.mode === 'idle';
    $('tj-speed').disabled = state.running;
    $('tj-from').disabled = state.running; $('tj-to').disabled = state.running;
    $('tj-offset').disabled = state.running; $('tj-calibrate').disabled = state.running || !state.connected;
    $('tj-device').disabled = state.running || state.connecting; $('tj-chart-file').disabled = state.running; $('tj-audio-file').disabled = state.running;
    $('tj-instrument').disabled = state.running || state.connecting; $('tj-connection-type').disabled = state.running || state.connecting;
    $('tj-backing').disabled = state.running;
    text('tj-clock', timeLabel(state.position) + ' / ' + timeLabel(chart.duration));
    $('tj-seek').value = Math.max(0, state.position);
  }
  function updateScore() {
    var r = state.judge && state.mode === 'practice' ? state.judge.resumo() : null;
    text('tj-hits', r ? r.hits : '—'); text('tj-misses', r ? r.misses : '—');
    text('tj-accuracy', r && (r.hits + r.misses) ? Math.round(r.accuracy) + '%' : '—');
    text('tj-score-label', r ? 'Indicação de treino · ' + (r.hits + r.misses) + ' de ' + r.total + ' notas avaliadas' : 'As marcas aparecem quando você pratica com a entrada de áudio ativada.');
    $('tj-save').disabled = !r || r.pending > 0 || state.saved || state.running || !boot.logado;
  }
  function applyChart(c) {
    if (c.tuning.some(function (m, i) { return m !== [40,45,50,55,59,64][i]; })) throw new Error('Neste protótipo, use violão ou guitarra de seis cordas em afinação padrão (Mi Lá Ré Sol Si Mi).');
    stop(); chart = c; state.from = 0; state.to = chart.duration; state.position = 0;
    text('tj-song-title', chart.title); text('tj-song-info', chart.bpm + ' BPM · ' + chart.notes.length + ' notas · ' + timeLabel(chart.duration));
    text('tj-source', chart.metadata && chart.metadata.demo ? 'Estudo original Musique · acompanhamento sintetizado' : 'Arranjo importado · associe o áudio correspondente');
    $('tj-seek').max = chart.duration; $('tj-to').max = chart.duration; $('tj-from').max = chart.duration;
    $('tj-from').value = 0; $('tj-to').value = chart.duration.toFixed(2);
    var table = $('tj-notes'); table.replaceChildren();
    chart.notes.slice(0, 80).forEach(function (n) { table.appendChild(el('tr', {}, [el('td', { text: n.time.toFixed(2) + ' s' }), el('td', { text: noteName(n.midi) }), el('td', { text: String(n.string) }), el('td', { text: String(n.fret) })])); });
    text('tj-table-note', chart.notes.length > 80 ? 'Primeiras 80 notas de ' + chart.notes.length + '. A pista usa o arranjo completo.' : 'Corda 1 é a mais aguda; corda 6 é a mais grave.');
    updateTransport();
  }
  function resetMedia() { mediaStarting = false; if (media) { media.onloadedmetadata = null; media.onerror = null; media.pause(); media.removeAttribute('src'); media.load(); } media = null; if (mediaUrl) URL.revokeObjectURL(mediaUrl); mediaUrl = null; text('tj-media-label', 'Acompanhamento do estudo'); }
  function ending() {
    state.position = state.to; state.running = false; silence(); if (media) media.pause();
    if (state.mode === 'practice' && state.judge) state.judge.avancar(state.to + 1);
    updateScore();
    if (state.loop) { msg('Trecho concluído. Nova rodada após a contagem.'); start(state.mode, false); }
    else { msg(state.mode === 'practice' ? 'Rodada concluída. Confira sua indicação de treino abaixo.' : 'Demonstração concluída. Ative a entrada de áudio para praticar.'); updateTransport(); }
  }
  function tick() {
    if (state.running) {
      var p = current(); state.position = p;
      if (p >= state.to && state.endedAt === null) state.endedAt = ctx.currentTime;
      if (state.endedAt !== null && ctx.currentTime - state.endedAt >= 0.4) ending();
      else {
        if (media && withBacking() && media.paused && !mediaStarting && p >= state.from && p < state.to) {
          mediaStarting = true; media.currentTime = p;
          var playingMedia = media, playGeneration = generation;
          media.play().then(function () {
            if (!state.running || playingMedia !== media) playingMedia.pause();
            if (playGeneration === generation && playingMedia === media) mediaStarting = false;
          }).catch(function (e) { if (playGeneration !== generation) return; mediaStarting = false; pause(); msg('O áudio não pôde tocar: ' + e.message, true); });
        }
        var beat = 60 / chart.bpm, until = p + 0.14 * state.speed;
        // Schedule a short look-ahead from the audio clock, never from animation frame count.
        while (state.nextBeat * beat < until) {
          var bt = state.nextBeat * beat;
          if (bt < state.to && bt >= p - 0.02 && (bt < state.from || $('tj-metronome').checked)) tone(state.nextBeat % 4 === 0 ? 88 : 81, ctx.currentTime + Math.max(0.005, (bt - p) / state.speed), 0.045, 0.045, 'sine');
          state.nextBeat++;
        }
        if (!media || !withBacking()) {
          while (state.nextNote < chart.notes.length && chart.notes[state.nextNote].time < until) {
            var n = chart.notes[state.nextNote++];
            if (n.time >= state.from && n.time < state.to && n.time >= p - 0.02) {
              var at = ctx.currentTime + Math.max(0.005, (n.time - p) / state.speed);
              if (state.mode === 'demo' || $('tj-guide').checked) tone(n.midi, at, Math.min(n.duration / state.speed, 1.2), 0.075);
              if (state.nextNote % 4 === 1 && (state.mode === 'demo' || $('tj-backing').checked)) tone(40, at, Math.min(beat / state.speed, 0.55), 0.032, 'sine');
            }
          }
        }
        // The detector delivers a buffered window; let late frames arrive before expiring a target.
        if (state.mode === 'practice' && state.judge) { state.judge.avancar(p - 0.15 * state.speed); updateScore(); }
        text('tj-count', p < state.from ? String(Math.max(1, Math.ceil((state.from - p) / beat))) : '');
        updateTransport();
      }
    }
    draw(); raf = requestAnimationFrame(tick);
  }
  function onFrame(f) {
    state.lastFrame = f;
    var level = Math.min(1, Math.max(0, f.rms * 7)); $('tj-meter').value = level;
    if (f.hz && f.confidence >= 0.7) {
      var m = 69 + 12 * Math.log2(f.hz / 440), cents = Math.round((m - Math.round(m)) * 100);
      text('tj-note', noteName(Math.round(m))); text('tj-cents', (cents > 0 ? '+' : '') + cents + ' cents');
      $('tj-tuner-dot').style.left = (50 + cents) + '%';
    } else { text('tj-note', '—'); text('tj-cents', f.rms > 0.003 ? 'Toque uma nota isolada' : 'Aguardando sinal'); $('tj-tuner-dot').style.left = '50%'; }
    text('tj-input-level', f.clipped > 0.08 || f.rms > 0.35 ? 'Sinal alto · reduza o ganho' : f.rms > 0.003 ? 'Sinal recebido' : 'Entrada silenciosa');
    if (state.calibration && f.onset && f.hz && f.confidence >= 0.7) sampleCalibration(f);
    if (state.running && !mediaStarting && state.mode === 'practice' && state.judge && ctx) {
      var musicTime = current() - (ctx.currentTime - f.audioTime) * state.speed;
      state.judge.amostrar({ time: musicTime, hz: f.hz || 0, confidence: f.confidence, rms: f.rms, onset: f.onset });
    }
  }
  function onStatus(s) {
    state.connected = s.estado === 'conectado';
    state.connecting = s.estado === 'iniciando';
    text('tj-connection', s.estado === 'conectado' ? (s.nome || 'Entrada de áudio conectada') : s.mensagem || 'Entrada desligada');
    profile();
    if (s.estado === 'erro' || s.estado === 'parado') { if (state.mode === 'practice' || (ctx && ctx.state === 'closed')) pause(); cancelCalibration(); text('tj-note', '—'); $('tj-meter').value = 0; }
    if (s.estado === 'erro') msg(s.mensagem, true);
    updateTransport();
  }
  async function connect() {
    pause(); cancelCalibration();
    if (state.connected) { pause(); input.parar(); return; }
    if (!input) input = Audio.criar({ onFrame: onFrame, onStatus: onStatus });
    $('tj-connect').disabled = true;
    try {
      var devices = await input.iniciar($('tj-device').value || undefined);
      var selected = input.estado().deviceId;
      $('tj-device').replaceChildren(el('option', { value: '', text: 'Entrada padrão do sistema' }));
      devices.forEach(function (d) { $('tj-device').appendChild(el('option', { value: d.deviceId, text: d.label || 'Entrada de áudio' })); });
      if (selected) $('tj-device').value = selected;
      var realTone = devices.find(function (d) { return /rocksmith|real.?tone/i.test(d.label || ''); });
      msg(state.inputKind === 'realtone' && realTone && selected !== realTone.deviceId ? 'O Real Tone foi encontrado. Selecione-o em “Entrada de áudio”.' : 'Confira o dispositivo em “Entrada de áudio” e toque uma corda. Use fones para ouvir o acompanhamento.');
    } catch (e) { msg(e.message || 'Não consegui abrir a entrada de áudio.', true); }
    finally { $('tj-connect').disabled = false; }
  }
  function cancelCalibration() {
    if (state.calibration) { clearTimeout(state.calibration.timer); state.calibration = null; silence(); }
    $('tj-cal-panel').hidden = true;
  }
  function calibrate() {
    cancelCalibration(); stop(); ctx = context(); ctx.resume();
    var startAt = ctx.currentTime + 1, step = 0.75;
    var cal = state.calibration = { start: startAt, step: step, offsets: [], last: -100, timer: null };
    for (var i = 0; i < 12; i++) tone(87, startAt + i * step, 0.04, 0.08, 'sine');
    $('tj-cal-panel').hidden = false; $('tj-use-cal').disabled = true;
    text('tj-cal-result', 'Toque uma nota curta a cada clique. Precisamos de pelo menos 6 ataques.');
    cal.timer = setTimeout(function () {
      if (state.calibration !== cal) return;
      if (cal.offsets.length < 6) { text('tj-cal-result', 'Poucos ataques reconhecidos. Confira a entrada e tente novamente.'); return; }
      var sorted = cal.offsets.slice().sort(function (a,b) { return a-b; }); cal.estimate = Math.round(sorted[Math.floor(sorted.length / 2)]);
      var spread = sorted.map(function (v) { return Math.abs(v - cal.estimate); }).sort(function (a,b) { return a-b; });
      text('tj-cal-result', 'Estimativa: ' + cal.estimate + ' ms · variação ' + Math.round(spread[Math.floor(spread.length / 2)]) + ' ms. Inclui seu tempo de resposta; não é medição física do cabo.');
      $('tj-use-cal').disabled = spread[Math.floor(spread.length / 2)] > 90;
    }, 10500);
  }
  function sampleCalibration(f) {
    var cal = state.calibration;
    if (f.audioTime - cal.last < 0.3) return;
    var k = Math.round((f.audioTime - cal.start) / cal.step);
    if (k < 0 || k >= 12) return;
    var delta = (f.audioTime - (cal.start + k * cal.step)) * 1000;
    if (Math.abs(delta) > 300) return;
    cal.last = f.audioTime; cal.offsets.push(delta); text('tj-cal-result', cal.offsets.length + ' ataques recebidos. Continue até o último clique.');
  }
  function resizeCanvas() {
    var c = $('tj-canvas'), rect = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(rect.width*dpr) || c.height !== Math.round(rect.height*dpr)) { c.width = Math.round(rect.width*dpr); c.height = Math.round(rect.height*dpr); }
    return { c: c, g: c.getContext('2d'), w: c.width, h: c.height, d: dpr };
  }
  function draw() {
    var z = resizeCanvas(), g=z.g, w=z.w, h=z.h, d=z.d;
    var top=h*0.12, bottom=h*0.86, far=w*0.24, near=w*0.88, center=w*0.5, p=state.position;
    g.clearRect(0,0,w,h); var bg=g.createLinearGradient(0,0,0,h); bg.addColorStop(0,'#111c2d');bg.addColorStop(1,'#1d2d40');g.fillStyle=bg;g.fillRect(0,0,w,h);
    function point(lane, depth) { var k=1-depth, width=far+(near-far)*k*k; return [center-width/2+width*lane/6, top+(bottom-top)*k*k]; }
    for(var i=0;i<6;i++) { var a=point(i,1),b=point(i+1,1),c=point(i+1,0),e=point(i,0); g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.lineTo(c[0],c[1]);g.lineTo(e[0],e[1]);g.closePath();g.fillStyle=i%2?'#ffffff05':'#ffffff0a';g.fill(); }
    for(var lane=0;lane<=6;lane++) { var a=point(lane,1),b=point(lane,0);g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.strokeStyle='#ccd8e41a';g.lineWidth=d;g.stroke(); }
    var ahead=4.5, beat=60/chart.bpm;
    for(var t=Math.ceil(p/beat)*beat;t<p+ahead;t+=beat) { var dep=(t-p)/ahead;if(dep<0)continue;var a=point(0,dep),b=point(6,dep);g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.strokeStyle='#ffffff13';g.stroke(); }
    var result={}; if(state.judge && state.mode==='practice')state.judge.estados().forEach(function(s){result[s.id]=s.status;});
    chart.notes.slice().reverse().forEach(function(n){
      if(n.time<state.from||n.time>=state.to)return;var dt=n.time-p;if(dt < -0.35 || dt>ahead)return;
      var dep=Math.max(0,dt/ahead), lane=6-n.string, xy=point(lane+0.5,dep), l=point(lane,dep),r=point(lane+1,dep);
      var width=(r[0]-l[0])*0.62, height=Math.max(14*d,28*d*(1-dep));var status=result[n.id];
      if(n.duration>0.22) { var end=point(lane+0.5,Math.min(1,(dt+n.duration)/ahead));g.beginPath();g.moveTo(xy[0],xy[1]);g.lineTo(end[0],end[1]);g.strokeStyle=COLORS[lane]+'70';g.lineWidth=Math.max(3*d,width*0.17);g.stroke(); }
      g.globalAlpha=dt<0?Math.max(0,1+dt/0.35):1;g.fillStyle=status==='hit'?'#7ad7ac':status==='miss'?'#b36f70':COLORS[lane];
      g.beginPath();g.roundRect(xy[0]-width/2,xy[1]-height/2,width,height,4*d);g.fill();g.fillStyle='#142337';g.font='700 '+Math.max(11*d,18*d*(1-dep))+'px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText(status==='hit'?'✓':String(n.fret),xy[0],xy[1]+d);g.globalAlpha=1;
    });
    var a=point(0,0),b=point(6,0);g.shadowColor='#ffdca3';g.shadowBlur=12*d;g.strokeStyle='#f2d4a0';g.lineWidth=2*d;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();g.shadowBlur=0;
    g.font='600 '+11*d+'px system-ui';g.textAlign='center';
    STRINGS.forEach(function(label,i){var pt=point(i+0.5,0);g.fillStyle=COLORS[i];g.fillText(label,pt[0],bottom+23*d);});
    g.font='500 '+10*d+'px system-ui';g.fillStyle='#a8bacb';g.textAlign='left';g.fillText('CASA 0 = CORDA SOLTA',w*0.04,h*0.08);
    if(!state.running && state.mode==='idle'){g.fillStyle='#dce5ed';g.textAlign='center';g.font='500 '+14*d+'px system-ui';g.fillText('Acompanhe as casas até a linha de tocar',center,h*0.34);}
  }
  async function save() {
    if(!state.judge || state.mode!=='practice' || state.running)return;var r=state.judge.resumo();if(r.pending || !boot.logado)return;
    var payload={chartId:chart.id,title:chart.title,total:r.total,hits:r.hits,misses:r.misses,accuracy:r.total?r.hits/r.total*100:0,speed:state.speed,offsetMs:state.offset,duration:state.to-state.from,mode:'practice'};
    $('tj-save').disabled=true;
    try { var res=await fetch('/music/api/tocar/sessoes',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});var data=await res.json();if(!res.ok)throw new Error(data.erro||'Falha ao guardar.');state.saved=true;msg('Resultado guardado na sua conta como indicação de treino.'); await history(); }
    catch(e){msg(e.message,true);updateScore();}
  }
  async function history() {
    if(!boot.logado)return;
    try {var res=await fetch('/music/api/tocar/sessoes',{credentials:'same-origin'});if(!res.ok)return;var data=await res.json();var list=$('tj-history');list.replaceChildren();
      (data.sessoes||[]).slice(0,5).forEach(function(s){list.appendChild(el('li',{text:s.title+' · '+Math.round(s.accuracy)+'% · '+new Date(s.createdAt).toLocaleDateString('pt-BR')}));});if(!list.children.length)list.appendChild(el('li',{text:'Sua primeira rodada guardada aparecerá aqui.'}));
    } catch(_) { text('tj-history-label','Histórico temporariamente indisponível.'); }
  }
  app.innerHTML = '<div class="tj-heading"><div><p class="tj-eyebrow">MUSIQUE / PRÁTICA COM INSTRUMENTO</p><h1>Tocar junto<span id="tj-instrument-label">Violão</span></h1><p class="tj-intro">Seu instrumento. Uma nota de cada vez. Um pouco melhor a cada rodada.</p></div><a id="tj-back" class="tj-back" href="/music/tutor-braco?i=violao">Tutor de braço ↗</a></div>'+
    '<div class="tj-layout"><section class="tj-main" aria-label="Pista e reprodução"><div class="tj-song"><div class="tj-art" aria-hidden="true">♩</div><div><p id="tj-source" class="tj-caption"></p><h2 id="tj-song-title"></h2><p id="tj-song-info"></p></div><span class="tj-badge">PROTÓTIPO</span></div>'+
    '<div class="tj-stage"><div class="tj-stage-top"><span id="tj-mode">PRONTO PARA TOCAR</span><span>6 CORDAS / AFINAÇÃO PADRÃO</span></div><canvas id="tj-canvas" aria-label="Pista de notas de violão e guitarra. Uma tabela das notas está disponível abaixo."></canvas><span id="tj-count" aria-live="off"></span></div>'+
    '<div class="tj-transport"><div class="tj-seek-row"><label class="tj-sr" for="tj-seek">Posição na música</label><input id="tj-seek" type="range" min="0" step="0.1" value="0"><span id="tj-clock"></span></div><div class="tj-actions"><button id="tj-practice" class="tj-primary" disabled>▶ Praticar</button><button id="tj-demo">Ouvir demonstração</button><button id="tj-pause" disabled>Pausar</button><button id="tj-stop" aria-label="Parar e voltar ao início do trecho">■ Parar</button><label class="tj-speed">Velocidade<select id="tj-speed"><option value="0.5">50%</option><option value="0.75">75%</option><option value="1" selected>100%</option><option value="1.25">125%</option></select></label></div><div class="tj-options"><label><input type="checkbox" id="tj-metronome"> Metrônomo</label><label><input type="checkbox" id="tj-guide"> Nota-guia</label><label><input type="checkbox" id="tj-backing"> Acompanhamento</label><span id="tj-media-label">Acompanhamento do estudo</span></div></div>'+
    '<p id="tj-status" class="tj-status" role="status">Ouça a demonstração ou ative o microfone para começar.</p><div class="tj-score"><div><span>ACERTOS</span><strong id="tj-hits">—</strong></div><div><span>A REVER</span><strong id="tj-misses">—</strong></div><div><span>PRECISÃO</span><strong id="tj-accuracy">—</strong></div><div class="tj-score-note"><p id="tj-score-label"></p><button id="tj-save" disabled>Guardar rodada</button></div></div></section>'+
    '<aside class="tj-sidebar"><section class="tj-panel"><p class="tj-step">01 / SEU INSTRUMENTO</p><h2 id="tj-input-title">Prepare o microfone</h2><div class="tj-input-choices"><label class="tj-field">Instrumento<select id="tj-instrument"><option value="violao" selected>Violão</option><option value="guitarra">Guitarra</option></select></label><label class="tj-field">Como captar o som<select id="tj-connection-type"><option value="microphone" selected>Microfone</option><option value="interface">Interface · instrumento por cabo</option><option value="realtone">Cabo USB Real Tone</option></select></label></div><p id="tj-input-help" class="tj-muted"></p><button id="tj-connect" class="tj-primary tj-wide">Ativar microfone</button><p id="tj-connection" class="tj-connection">Entrada desligada</p><label class="tj-field">Entrada de áudio<select id="tj-device"><option value="">Entrada padrão do sistema</option></select></label><p id="tj-listening-help" class="tj-capture-tip"></p><div class="tj-level"><label for="tj-meter" id="tj-input-level">Aguardando conexão</label><meter id="tj-meter" min="0" max="1" low="0.03" high="0.8" optimum="0.35" value="0"></meter></div><div class="tj-tuner"><span>AFINAÇÃO</span><strong id="tj-note">—</strong><small id="tj-cents">Aguardando sinal</small><div class="tj-tuner-line"><i id="tj-tuner-dot"></i></div></div></section>'+
    '<section class="tj-panel"><p class="tj-step">02 / SEU RITMO</p><h2>Pratique por partes</h2><div class="tj-range"><label>De (segundos)<input id="tj-from" type="number" min="0" step="0.1" value="0"></label><label>Até (segundos)<input id="tj-to" type="number" min="0.5" step="0.1"></label></div><label class="tj-check"><input id="tj-loop" type="checkbox"> Repetir este trecho</label><label class="tj-field">Compensação de atraso (ms)<input id="tj-offset" type="number" min="-500" max="500" step="5" value="0"></label><button id="tj-calibrate" class="tj-wide" disabled>Ajustar com cliques</button><div id="tj-cal-panel" hidden><p id="tj-cal-result"></p><button id="tj-use-cal" disabled>Usar estimativa</button><button id="tj-cancel-cal">Cancelar</button></div><p class="tj-small">A compensação corrige o sincronismo do feedback. Use fone com fio e valide o ajuste tocando.</p></section></aside></div>'+
    '<div class="tj-bottom"><details class="tj-panel"><summary>Praticar outra música</summary><p>Carregue um arranjo com notas e tempos e o áudio correspondente. Os arquivos ficam neste navegador.</p><div class="tj-files"><label>1. Arranjo JSON<input id="tj-chart-file" type="file" accept=".json,application/json"></label><label>2. Áudio da música<input id="tj-audio-file" type="file" accept="audio/*"></label></div><button id="tj-download">Baixar arranjo de exemplo</button><button id="tj-reset">Voltar ao estudo original</button><p class="tj-small">O MP3 sozinho não define as notas da pista. Este protótipo trabalha com notas isoladas, sem acordes simultâneos.</p></details><section class="tj-panel tj-history-panel"><h2>Sua prática</h2><p id="tj-history-label"></p><ul id="tj-history"></ul></section></div>'+
    '<details class="tj-panel tj-notes-panel"><summary>Notas do arranjo · versão em tabela</summary><p id="tj-table-note"></p><table><thead><tr><th>Tempo</th><th>Nota</th><th>Corda</th><th>Casa</th></tr></thead><tbody id="tj-notes"></tbody></table></details><p class="tj-footnote">Feedback de estudo, sem nota escolar. O áudio identifica a altura; corda e casa são posições sugeridas pelo arranjo. Reconhecimento de acordes não está incluído neste protótipo.</p>';
  on('tj-demo','click',function(){start('demo',false);});on('tj-practice','click',function(){start('practice',false);});
  on('tj-instrument','change',changeProfile);on('tj-connection-type','change',changeProfile);
  on('tj-pause','click',function(){if(state.running)pause();else start(state.mode,true);});on('tj-stop','click',function(){stop();cancelCalibration();msg('Pronto para uma nova rodada.');});
  on('tj-connect','click',connect);on('tj-device','change',async function(){if(!input || !state.connected)return;pause();cancelCalibration();try{await input.iniciar($('tj-device').value||undefined);}catch(e){msg(e.message,true);}});
  on('tj-speed','change',function(){stop();state.speed=Number(this.value);if(media)media.playbackRate=state.speed;msg('Velocidade ajustada. Inicie uma nova rodada.');});
  on('tj-loop','change',function(){state.loop=this.checked;});
  ['tj-from','tj-to'].forEach(function(id){on(id,'change',function(){var f=Number($('tj-from').value),t=Number($('tj-to').value);if(!Number.isFinite(f)||!Number.isFinite(t)||f<0||t>chart.duration||t-f<0.5){msg('Escolha um trecho válido de pelo menos meio segundo.',true);$('tj-from').value=state.from;$('tj-to').value=state.to;return;}state.from=f;state.to=t;stop();});});
  on('tj-seek','input',function(){pause();state.position=Math.max(state.from,Math.min(state.to,Number(this.value)));state.mode='demo';if(media)media.currentTime=state.position;state.judge=null;updateScore();updateTransport();msg('Posição alterada. Continue a demonstração ou inicie uma nova prática.');});
  on('tj-offset','change',function(){stop();state.offset=Math.max(-500,Math.min(500,Number(this.value)||0));this.value=state.offset;});
  on('tj-calibrate','click',calibrate);on('tj-use-cal','click',function(){if(!state.calibration||!Number.isFinite(state.calibration.estimate))return;state.offset=state.calibration.estimate;$('tj-offset').value=state.offset;cancelCalibration();msg('Compensação aplicada. Faça uma rodada para conferir.');});on('tj-cancel-cal','click',cancelCalibration);
  on('tj-save','click',save);
  on('tj-chart-file','change',async function(){if(!this.files[0])return;try{if(this.files[0].size>1048576)throw new Error('O arranjo deve ter no máximo 1 MB.');var c=Core.validarChart(JSON.parse(await this.files[0].text()));resetMedia();applyChart(c);msg('Arranjo carregado. Selecione o áudio correspondente.');}catch(e){msg('Arranjo inválido: '+e.message,true);}this.value='';});
  on('tj-audio-file','change',function(){
    var f=this.files[0];if(!f)return;
    if(f.size>100*1024*1024){msg('Escolha áudio de até 100 MB.',true);this.value='';return;}
    stop();resetMedia();mediaUrl=URL.createObjectURL(f);var selectedMedia=media=new window.Audio(mediaUrl);
    media.preload='metadata';media.preservesPitch=true;media.mozPreservesPitch=true;media.webkitPreservesPitch=true;media.volume=0.65;
    media.onerror=function(){if(selectedMedia!==media)return;stop();resetMedia();msg('Não consegui ler este formato de áudio.',true);};
    media.onloadedmetadata=function(){
      if(selectedMedia!==media)return;
      if(!Number.isFinite(media.duration)||media.duration<chart.duration-0.1){stop();resetMedia();msg('O áudio é mais curto que o arranjo. Confira os dois arquivos.',true);return;}
      text('tj-media-label',f.name);msg('Áudio associado ao arranjo. Confira o sincronismo na demonstração.');
    };this.value='';
  });
  on('tj-reset','click',function(){resetMedia();applyChart(Core.demoChart());msg('Estudo original carregado.');});
  on('tj-download','click',function(){var url=URL.createObjectURL(new Blob([JSON.stringify(chart,null,2)],{type:'application/json'}));var a=el('a',{href:url,download:'musique-arranjo.json'});a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);});
  document.addEventListener('visibilitychange',function(){if(document.hidden){pause();cancelCalibration();msg('Pausado porque a página ficou em segundo plano.');}});
  window.addEventListener('pagehide',function(){pause();cancelCalibration();if(input)input.parar();if(demoContext)demoContext.close();if(raf)cancelAnimationFrame(raf);raf=null;resetMedia();});
  window.addEventListener('pageshow',function(e){if(e.persisted && !raf)tick();});
  text('tj-history-label',boot.logado?'Últimas rodadas guardadas nesta conta.':'Entre no Musique para guardar as rodadas na sua conta.');
  if(!boot.logado)$('tj-history').appendChild(el('li',{},[el('a',{href:'/music/entrar?voltar=%2Fmusic%2Ftocar',text:'Entrar ou criar conta'})]));
  profile();applyChart(chart);history();tick();
})();
