(function () {
  'use strict';
  var app = document.getElementById('tocar-app');
  if (!app) return;
  var Core = window.MusiqueTocarCore, Audio = window.MusiqueTocarAudio, Aprender = window.MusiqueTocarAprender, Estudos = window.MusiqueTocarEstudos, Perfis = window.MusiqueTocarPerfis;
  var Piano = window.MusiqueTocarPiano, Bateria = window.MusiqueTocarBateria;
  var Acordes = window.MusiqueTocarAcordes;
  var Sons = window.MusiqueTocarSons, Manifesto = window.MusiqueTocarSonsManifesto;
  if (!Core || !Audio || !Aprender || !Estudos || !Perfis || !Piano || !Bateria || !Sons || !Manifesto) { app.textContent = 'Não foi possível carregar o modo de prática. Recarregue a página.'; return; }
  var boot = JSON.parse(app.getAttribute('data-estado') || '{}');
  var Catalogo = window.MusiqueTocarCatalogo, Formato = window.MusiqueTocarFormatoCatalogo, Campaign = window.MusiqueTocarCampanha;
  var query = new URLSearchParams(window.location ? window.location.search : '');
  var previewMode = query.has('previa'), previewReady = !previewMode;
  var source = { kind: 'study' }, catalogUI = null, chartTicket = 0, chartLoading = false;
  var remoteAudio = null, remoteTicket = 0, remoteLoading = false, saving = null;
  var chart = Core.demoChart(), input = null, midiInput = null, midiHeld = Object.create(null), demoContext = null, ctx = null, deviceRefresh = 0;
  var media = null, mediaUrl = null, mediaStarting = false, raf = null, nodes = [], generation = 0, dailySessions = 0;
  var referenceWallUntil = 0, outputWallUntil = 0;
  var sampler = null, samplerContext = null, samplerBank = null, soundLoading = false, scheduledSoundUntil = 0;
  var backingPackage = null, backingNext = Object.create(null), backingPrepared = Object.create(null);
  var backingMix = { baixo: 1, piano: 1, bateria: 1 };
  var state = { mode: 'idle', running: false, position: 0, origin: 0, start: 0, speed: 1,
    from: 0, to: chart.duration, loop: false, judge: null, lastFrame: null, offset: 0,
    nextNote: 0, nextBeat: 0, countInFirstBeat: null, saved: false, connected: false, connecting: false, calibration: null, endedAt: null,
    instrument: 'violao', inputKind: 'microphone', trainingMode: 'practice', learner: null, midiOrigin: 0,
    learnContext: null, learnElapsed: 0, learnStartedAt: null, guideUntil: 0 };
  var studies = Estudos.listar(), phraseButtons = [];
  var campaignState = Campaign ? Campaign.criar({ instrument: state.instrument }) : null;
  function campaignStorageKey(instrument) { return 'musique.campanha.v1.' + instrument; }
  function loadCampaign() {
    if (!Campaign) return null;
    var raw = null;
    try { raw = window.localStorage && window.localStorage.getItem(campaignStorageKey(state.instrument)); } catch (_) {}
    try { campaignState = Campaign.criar(raw ? JSON.parse(raw) : { instrument: state.instrument }); }
    catch (_) { campaignState = Campaign.criar({ instrument: state.instrument }); }
    return campaignState;
  }
  function saveCampaign() { if (!Campaign || !campaignState) return; try { window.localStorage.setItem(campaignStorageKey(state.instrument), JSON.stringify(campaignState)); } catch (_) {} }
  async function syncCampaign() {
    if (!Campaign || !campaignState || !boot.logado) return;
    var button = $('tj-campaign-sync'); if (button) { button.disabled = true; button.textContent = 'Sincronizando…'; }
    try {
      var response = await fetch('/music/api/tocar/campanha/' + encodeURIComponent(state.instrument), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Não foi possível consultar a campanha.');
      var data = await response.json();
      if (data && data.estado) campaignState = Campaign.mesclar(campaignState, data.estado);
      saveCampaign();
      var saved = await fetch('/music/api/tocar/campanha/' + encodeURIComponent(state.instrument), { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campaignState) });
      if (!saved.ok) throw new Error('Não foi possível guardar a campanha.');
      renderCampaign(); msg('Progresso da campanha sincronizado com a sua conta.');
    } catch (_) { msg('Não foi possível sincronizar agora. O progresso local continua salvo.', true); }
    finally { var current = $('tj-campaign-sync'); if (current) { current.disabled = false; current.textContent = 'Sincronizar conta'; } }
  }
  function exportCampaign() {
    if (!Campaign || !campaignState) return;
    var blob = new Blob([JSON.stringify(campaignState, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob), link = el('a', { href: url, download: 'musique-campanha-' + state.instrument + '.json' });
    link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); msg('Backup da campanha exportado.');
  }
  async function importCampaign(file) {
    if (!file || !Campaign) return;
    try {
      if (file.size > 50000) throw new Error('O backup da campanha é grande demais.');
      var imported = Campaign.criar(JSON.parse(await file.text()));
      if (imported.instrument !== state.instrument) throw new Error('O backup pertence a outro instrumento.');
      campaignState = Campaign.mesclar(campaignState, imported); saveCampaign(); renderCampaign(); msg('Backup da campanha importado e mesclado com segurança.');
    } catch (error) { msg('Backup inválido: ' + error.message, true); }
  }
  function renderCampaign() {
    var panel = $('tj-campaign'); if (!panel || !Campaign) return;
    var lista = Campaign.listar(campaignState || { instrument: state.instrument });
    var overview = Campaign.resumo(campaignState), bar = el('span', { id: 'tj-campaign-progress', class: 'tj-campaign-progress', role: 'progressbar', 'aria-label': 'Progresso da campanha', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(overview.percent) }); bar.style.width = overview.percent + '%';
    var heading = el('div', { class: 'tj-campaign-heading' }, [el('div', {}, [el('p', { class: 'tj-caption', text: 'CAMPANHA AUTORAL' }), el('h2', { text: 'Trilha de evolução' })]), el('span', { class: 'tj-campaign-count', text: overview.completed + '/' + overview.total + ' concluídas · ' + overview.badges + ' distintivos' })]);
    var exportButton = el('button', { type: 'button', class: 'tj-campaign-sync', text: 'Exportar' }); exportButton.addEventListener('click', exportCampaign);
    var importInput = el('input', { type: 'file', accept: '.json,application/json', hidden: '' }); importInput.addEventListener('change', function () { importCampaign(this.files && this.files[0]); this.value = ''; });
    var importButton = el('button', { type: 'button', class: 'tj-campaign-sync', text: 'Importar' }); importButton.addEventListener('click', function () { importInput.click(); });
    heading.appendChild(exportButton); heading.appendChild(importButton); heading.appendChild(importInput);
    if (boot.logado) { var sync = el('button', { id: 'tj-campaign-sync', type: 'button', class: 'tj-campaign-sync', text: 'Sincronizar conta' }); sync.addEventListener('click', syncCampaign); heading.appendChild(sync); }
    var recomendacao = overview.next ? 'Próxima recomendação: ' + overview.next.title + (overview.next.position > 0 ? ' · retomar em ' + overview.next.position.toFixed(1) + ' s' : '') : 'Campanha concluída. Revise qualquer etapa para manter a prática.';
    var meta = boot.logado ? 'Meta diária: ' + Math.min(dailySessions, 3) + '/3 rodadas' : 'Entre para acompanhar sua meta diária.';
    panel.replaceChildren(heading, el('div', { class: 'tj-campaign-summary' }, [el('span', { class: 'tj-campaign-summary-label', text: overview.percent + '% da trilha' }), el('span', { class: 'tj-campaign-progress-track' }, [bar]), el('span', { class: 'tj-campaign-summary-label', text: overview.attempts + ' tentativas · melhor sequência: ' + overview.bestStreak }), el('span', { class: 'tj-campaign-summary-label', text: recomendacao }), el('span', { class: 'tj-campaign-summary-label', text: meta })]));
    var list = el('ol', { class: 'tj-campaign-list' });
    lista.forEach(function (item) {
      var label = item.status === 'completed' ? 'Concluída' : item.status === 'in_progress' ? 'Em andamento' : item.status === 'available' ? 'Disponível' : 'Bloqueada';
      var action = item.status === 'locked' ? el('span', { class: 'tj-campaign-status', text: '🔒 ' + label }) : el('button', { type: 'button', class: 'tj-campaign-action', text: item.status === 'in_progress' ? 'Continuar' : item.status === 'completed' ? 'Revisar' : 'Começar' });
      if (action.tagName === 'BUTTON') action.addEventListener('click', function () {
        var estudo = Estudos.obter(item.id); if (!estudo) return;
        campaignState = item.status === 'completed' ? Campaign.criar(campaignState) : Campaign.iniciar(campaignState, item.id);
        saveCampaign(); $('tj-study').value = item.id; $('tj-speed').value = String(item.adaptive.speed); state.speed = item.adaptive.speed; chooseChart(estudo, { kind: 'study', instrument: state.instrument, objective: item.objective }); renderCampaign(); msg((item.status === 'in_progress' ? 'Campanha retomada. ' : 'Etapa da campanha carregada. ') + 'Velocidade adaptativa sugerida: ' + item.adaptive.label + ' — ' + item.adaptive.reason + '.');
      });
      list.appendChild(el('li', { class: 'tj-campaign-item ' + item.status }, [el('div', {}, [el('strong', { text: item.order + '. ' + item.title }), el('small', { text: item.challenge.level + ' · ' + item.challenge.objective }), el('small', { class: 'tj-campaign-adaptive', text: 'Sugestão: ' + item.adaptive.label + ' · ' + item.adaptive.reason }), el('small', { class: 'tj-campaign-reward', text: (item.reward.unlocked ? '✓ ' : '✦ ') + item.reward.title })]), action]));
    });
    panel.appendChild(list);
  }
  function updateCampaign(completed) {
    if (!Campaign || source.kind !== 'study' || !campaignState) return;
    var item = studies.find(function (study) { return study.chart.id === chart.id; }); if (!item) return;
    var fullArrangement = state.from <= 1e-6 && state.to >= chart.duration - 1e-6;
    var resumo = state.judge && state.mode === 'practice' ? state.judge.resumo() : null;
    try { campaignState = Campaign.atualizar(campaignState, item.id, { completed: !!completed && fullArrangement, position: completed && fullArrangement ? chart.duration : state.position, accuracy: resumo && resumo.accuracy, bestStreak: resumo && resumo.bestStreak }); saveCampaign(); renderCampaign(); } catch (_) {}
  }
  var COLORS = ['#e9a56a', '#e7ca64', '#70c9ae', '#79b7ed', '#b39cdd', '#e89cac'];
  var captureGains = { microphone: 6, interface: 0, realtone: 0 };
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return n;
  }
  function $(id) { return document.getElementById(id); }
  function on(id, type, fn) { $(id).addEventListener(type, fn); }
  function text(id, value) { $(id).textContent = value; }
  function msg(value, error) { text('tj-status', value); $('tj-status').classList.toggle('tj-error', !!error); }
  function perfilDoInstrumento(instrumento) { return Perfis.obter(instrumento) || Perfis.obter('violao'); }
  function perfilDoChart(c) { return c && (Perfis.porChart ? Perfis.porChart(c) : Perfis.porAfinacao(c.tuning)); }
  function meiaJanelaDetector() {
    var perfil = perfilDoChart(chart) || perfilDoInstrumento(state.instrument);
    var ms = perfil && perfil.detector && perfil.detector.windowMs;
    return Number.isFinite(ms) && ms >= 35 && ms <= 250 ? ms / 2000 : 0.032;
  }
  function nomeInstrumento(instrumento) {
    return instrumento === 'baixo' ? 'Contrabaixo' : instrumento === 'cavaquinho' ? 'Cavaquinho' : instrumento === 'ukulele' ? 'Ukulele' : instrumento === 'bandolim' ? 'Bandolim' : instrumento === 'bateria' ? 'Bateria eletrônica' : instrumento === 'piano' ? 'Piano' : instrumento === 'guitarra' ? 'Guitarra' : 'Violão';
  }
  function instrumentoDoChart(perfil, origem) {
    if (origem && origem.instrument && perfilDoInstrumento(origem.instrument).id === perfil.id) return origem.instrument;
    if (perfil.id === 'baixo') return 'baixo';
    if (perfil.id === 'bateria-midi') return 'bateria';
    if (perfil.id === 'piano-midi') return 'piano';
    if (perfil.id === 'cavaquinho' || perfil.id === 'ukulele') return perfil.id;
    if (perfil.id === 'bandolim-5') return 'bandolim';
    return state.instrument === 'guitarra' ? 'guitarra' : 'violao';
  }
  function encerrarCapturaDoPerfilAnterior() {
    var anterior = input;
    input = null;
    if (anterior) anterior.parar();
  }
  function timeLabel(s) { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
  function noteName(midi) { return ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'][((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1); }
  function tempoEvents(c) {
    return c.tempoMap ? c.tempoMap.events : [{ time: 0, beat: 0, bpm: c.bpm }];
  }
  function tempoAt(c, time) {
    var eventos = tempoEvents(c), atual = eventos[0];
    eventos.forEach(function (evento) { if (evento.time <= time) atual = evento; });
    return atual;
  }
  function beatAt(c, time) {
    var evento = tempoAt(c, time);
    return evento.beat + (time - evento.time) * evento.bpm / 60;
  }
  function timeAtBeat(c, beat) {
    var eventos = tempoEvents(c), atual = eventos[0], i;
    if (beat < atual.beat) return atual.time + (beat - atual.beat) * 60 / atual.bpm;
    for (i = 1; i < eventos.length; i++) {
      if (beat < eventos[i].beat) return atual.time + (beat - atual.beat) * 60 / atual.bpm;
      atual = eventos[i];
    }
    return atual.time + (beat - atual.beat) * 60 / atual.bpm;
  }
  function firstBeatAtOrAfter(c, time) { return Math.ceil(beatAt(c, time) - 1e-7); }
  function countInStart(c, from) { return timeAtBeat(c, beatAt(c, from) - 4); }
  function tempoLabel(c) {
    if (!c.tempoMap || c.tempoMap.events.length < 2) return c.bpm + ' BPM';
    var mudancas = c.tempoMap.events.length - 1;
    return c.bpm + ' BPM inicial · andamento variável (' + mudancas + ' ' + (mudancas === 1 ? 'mudança' : 'mudanças') + ')';
  }
  function renderCaptureGain() {
    var db = captureGains[state.inputKind];
    var multiplier = (Math.round(Math.pow(10, db / 20) * 10) / 10).toLocaleString('pt-BR');
    $('tj-gain').value = db;
    text('tj-gain-value', db + ' dB · ' + multiplier + '×');
    $('tj-gain').setAttribute('aria-valuetext', db + ' decibéis, aproximadamente ' + multiplier + ' vezes');
  }
  function changeCaptureGain() {
    var db = Number($('tj-gain').value);
    if (Number.isFinite(db)) {
      db = Math.min(18, Math.max(0, Math.round(db / 3) * 3));
      if (db !== captureGains[state.inputKind]) {
        if (state.mode === 'practice' || state.mode === 'learn') { stop(); msg('Nível ajustado. Inicie uma nova rodada.'); }
        captureGains[state.inputKind] = db;
        if (input) input.definirGanhoDb(db);
      }
    }
    renderCaptureGain();
  }
  function profile() {
    var perfil = perfilDoInstrumento(state.instrument), baixo = perfil.id === 'baixo', bateria = perfil.layout === 'drums', piano = perfil.layout === 'piano';
    var microphone = state.inputKind === 'microphone';
    text('tj-instrument-label', nomeInstrumento(state.instrument));
    text('tj-sound-label', state.instrument === 'cavaquinho' ? 'Som de cavaquinho adaptado de cordas dedilhadas' : state.instrument === 'bandolim' ? 'Som de bandolim adaptado, com vozes de cordas dobradas' : 'Som de ' + nomeInstrumento(state.instrument).toLowerCase().replace(' eletrônica', ' acústica') + ' com amostras gravadas');
    $('tj-back').hidden = baixo || bateria || piano;
    if (!baixo) $('tj-back').href = '/music/tutor-braco?i=' + state.instrument;
    text('tj-input-title', bateria ? 'Conecte a bateria eletrônica' : piano ? 'Conecte o piano MIDI' : microphone ? 'Prepare o microfone' : state.inputKind === 'interface' ? 'Prepare a interface' : 'Prepare o Real Tone');
    text('tj-input-help', bateria || piano ? 'Use um navegador com Web MIDI e selecione a porta MIDI do instrumento.' : microphone
      ? 'Use o microfone do computador, um USB ou um ligado à interface. Aproxime-o do instrumento em um ambiente silencioso. Toque uma corda por vez.'
      : state.inputKind === 'interface'
        ? 'Ligue o instrumento à entrada indicada para instrumento na interface. Selecione a interface na lista abaixo.'
        : 'Plugue o Real Tone na USB e no instrumento com saída para cabo. Selecione o adaptador Rocksmith na lista abaixo.');
    text('tj-listening-help', bateria || piano ? 'A prática usa as mensagens MIDI do instrumento; microfone e reconhecimento acústico ficam desativados neste perfil.' : microphone
      ? 'Use fones: o microfone também pode captar o som do computador e gerar acertos indevidos. Na prática, os sons de apoio começam desligados. Um microfone ligado à interface também usa este modo.'
      : 'Confira o medidor tocando uma corda e ajuste o ganho sem saturar. Se estiver usando um microfone na interface, escolha o modo Microfone.');
    $('tj-connect').textContent = state.connected ? 'Desconectar' : bateria || piano ? 'Ativar MIDI' : microphone ? 'Ativar microfone' : 'Ativar entrada';
    $('tj-gain').disabled = bateria || piano; if (!bateria && !piano) renderCaptureGain();
    if (bateria || piano) { state.trainingMode = 'practice'; $('tj-study-mode').value = 'practice'; }
    $('tj-study-mode').children[1].disabled = bateria || piano;
    text('tj-learning-help', bateria || piano ? 'No ritmo, acompanhe o tempo. Em Aprender, cada tecla ou grupo de pads espera sua entrada MIDI, sem avaliação de ritmo.' : 'No ritmo, acompanhe o tempo. Ao aprender, cada nota espera por você, sem avaliação de ritmo.');
    text('tj-stage-help', piano ? 'As 88 teclas vão de Lá0 a Dó8. Toque quando a nota chegar ao teclado; o comprimento indica a duração. A iluminação acompanha o arranjo.' : bateria ? 'As notas descem até cada peça. No chimbal, × indica fechado e ○ indica aberto. Crash e ride ficam acima dos tambores, como na montagem da bateria.' : 'Acompanhe as casas até a linha de tocar. Casa 0 indica corda solta.');
    text('tj-footnote', bateria || piano ? 'Indicação de treino, sem nota escolar. A demonstração mostra o arranjo; na prática, os acertos usam a entrada MIDI.' : 'Feedback de estudo, sem nota escolar. O áudio identifica a altura; corda e casa são posições sugeridas pelo arranjo. Reconhecimento de acordes pelo microfone não está incluído neste protótipo.');
    $('tj-connection-type').value = bateria || piano ? 'midi' : state.inputKind;
    app.setAttribute('data-layout', perfil.layout);
    $('tj-stage').setAttribute('data-layout', perfil.layout);
  }
  function changeProfile() {
    var anterior = perfilDoInstrumento(state.instrument);
    stop(); cancelCalibration();
    state.instrument = $('tj-instrument').value;
    state.inputKind = $('tj-connection-type').value;
    var atual = perfilDoInstrumento(state.instrument);
    if (atual.layout === 'piano' || atual.layout === 'drums') state.inputKind = 'midi';
    else if (state.inputKind === 'midi') state.inputKind = 'microphone';
    if (anterior.id !== atual.id) {
      encerrarCapturaDoPerfilAnterior();
      var estudo = studies.find(function (item) { var p = perfilDoChart(item.chart); return p && p.id === atual.id; });
      if (estudo) chooseChart(estudo.chart, { kind: 'study', instrument: estudo.instrument, objective: estudo.objective });
    } else if (input) {
      input.parar();
      input.definirGanhoDb(captureGains[state.inputKind]);
    }
    $('tj-device').value = '';
    $('tj-metronome').checked = state.inputKind !== 'microphone';
    $('tj-backing').checked = state.inputKind !== 'microphone';
    $('tj-guide').checked = false;
    renderStudies(); loadCampaign(); renderCampaign(); profile(); updateTransport(); refreshDevices(); msg(atual.layout === 'piano' || atual.layout === 'drums' ? 'Instrumento selecionado. Veja a demonstração ou ative a entrada MIDI para praticar.' : 'Entrada ajustada. Ative o áudio e selecione o dispositivo que vai usar.');
  }
  function context() {
    var c = input && input.contexto();
    if (c && c.state !== 'closed') return c;
    if (!demoContext || demoContext.state === 'closed') demoContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    return demoContext;
  }
  function silence() {
    var now = performance.now() / 1000;
    if (nodes.length || sampler) outputWallUntil = Math.min(outputWallUntil, now + 0.35);
    if (media && !media.paused) outputWallUntil = Math.max(outputWallUntil, now + 0.35);
    nodes.forEach(function (n) { try { n.stop(); } catch (_) {} }); nodes = [];
    if (sampler) sampler.parar();
    scheduledSoundUntil = 0;
    backingNext = Object.create(null);
  }
  function soundEngine() {
    var group = state.instrument === 'cavaquinho' || state.instrument === 'bandolim' ? 'violao' : state.instrument;
    if (!sampler || samplerContext !== ctx || samplerBank !== group) {
      if (sampler) sampler.dispose();
      sampler = Sons.criar(ctx, { manifest: Manifesto }); samplerContext = ctx; samplerBank = group;
    }
    return sampler;
  }
  function instrumentNote(n, when, duration) {
    var voice = sampler.tocar(state.instrument, { midi: n.midi, when: when, duration: duration, velocity: n.velocity || 96 });
    outputWallUntil = Math.max(outputWallUntil, performance.now() / 1000 + Math.max(0, when - ctx.currentTime) + duration + 0.35);
    if (voice && Number.isFinite(voice.endTime)) scheduledSoundUntil = Math.max(scheduledSoundUntil, voice.endTime);
    return voice;
  }
  function tone(midi, when, duration, volume, shape) {
    outputWallUntil = Math.max(outputWallUntil, performance.now() / 1000 + Math.max(0, when - ctx.currentTime) + duration + 0.35);
    var osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = shape || 'triangle';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12); gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.025, duration));
    osc.connect(gain); gain.connect(ctx.destination); osc.start(when); osc.stop(when + duration + 0.03); nodes.push(osc);
    osc.onended = function () { osc.disconnect(); gain.disconnect(); var i = nodes.indexOf(osc); if (i >= 0) nodes.splice(i, 1); };
  }
  async function prepareBacking() {
    if (!backingPackage) return;
    var engine = soundEngine();
    var tracks = (backingPackage.tracks || []).filter(function (track) { return track.instrument !== 'violao' && !backingPrepared[track.instrument]; });
    for (var i = 0; i < tracks.length; i++) {
      var track = tracks[i];
      await engine.preparar(track.instrument, (track.events || []).map(function (event) { return { midi: event.midi }; }));
      backingPrepared[track.instrument] = true;
    }
  }
  function scheduleBacking(position, until) {
    if (!backingPackage || state.mode === 'learn') return;
    (backingPackage.tracks || []).forEach(function (track) {
      if (track.instrument === 'violao') return;
      var events = Array.isArray(track.events) ? track.events : [], key = track.id || track.instrument;
      var index = backingNext[key] || 0;
      while (index < events.length && Number(events[index].atMs) / 1000 < until) {
        var e = events[index++], t = Number(e.atMs) / 1000;
        if (t >= state.from && t < state.to && t >= position - 0.02) {
          var midi = Number(e.midi), dur = Math.max(0.04, Number(e.durationMs || 80) / 1000 / state.speed);
          var mix = Number.isFinite(backingMix[track.instrument]) ? backingMix[track.instrument] : 1;
          if (mix <= 0) continue;
          var volume = (track.instrument === 'bateria' ? 0.055 : track.instrument === 'piano' ? 0.035 : 0.045) * mix;
          var at = ctx.currentTime + Math.max(0.005, (t - position) / state.speed);
          if (backingPrepared[track.instrument] && sampler) {
            var voice = sampler.tocar(track.instrument, { midi: midi, when: at, duration: dur, velocity: e.velocity || 96 });
            if (voice && Number.isFinite(voice.endTime)) scheduledSoundUntil = Math.max(scheduledSoundUntil, voice.endTime);
            outputWallUntil = Math.max(outputWallUntil, performance.now() / 1000 + Math.max(0, at - ctx.currentTime) + dur + 0.35);
          } else {
            var shape = track.instrument === 'bateria' ? 'square' : track.instrument === 'piano' ? 'sine' : 'triangle';
            tone(midi, at, dur, volume, shape);
          }
        }
      }
      backingNext[key] = index;
    });
  }
  function current() {
    if (!state.running || !ctx || state.mode === 'learn') return state.position;
    if (media && withBacking() && mediaStarting) return state.position;
    if (media && withBacking() && !media.paused && state.position >= state.from) return mediaToChart(media.currentTime);
    return state.start + (ctx.currentTime - state.origin) * state.speed;
  }
  function mediaOffsetSeconds() {
    return source && Number.isSafeInteger(source.mediaOffsetMs) && source.mediaOffsetMs >= 0 ? source.mediaOffsetMs / 1000 : 0;
  }
  function chartToMedia(time) { return Math.max(0, time + mediaOffsetSeconds()); }
  function mediaToChart(time) { return Math.max(0, time - mediaOffsetSeconds()); }
  function mediaDurationNeeded() { return chart.duration + mediaOffsetSeconds(); }
  function withBacking() { return state.mode === 'demo' || (state.mode !== 'learn' && $('tj-backing').checked); }
  function learnDuration() { return state.learnElapsed + (state.learnStartedAt === null || !ctx ? 0 : Math.max(0, ctx.currentTime - state.learnStartedAt)); }
  function learnTarget() {
    var target = state.learner && state.mode === 'learn' ? state.learner.alvo() : null;
    var preview = chart.notes.find(function (n) { return n.time >= state.from && n.time < state.to; });
    var n = target || (state.mode === 'idle' ? preview : null);
    var perfilAlvo = perfilDoChart(chart), midiAlvo = perfilAlvo && (perfilAlvo.layout === 'piano' || perfilAlvo.layout === 'drums');
    var pecaAlvo = n && midiAlvo && perfilAlvo.layout === 'drums' && perfilAlvo.drums.find(function (p) { return p.midi === n.midi; });
    var grupoAlvo = state.learner && midiAlvo && perfilAlvo.layout === 'piano' && typeof state.learner.grupo === 'function' ? state.learner.grupo() : [];
    var acorde = grupoAlvo.length >= 3 && window.MusiqueTocarAcordes ? window.MusiqueTocarAcordes.identificar(grupoAlvo) : null;
    var label = n ? midiAlvo ? (pecaAlvo ? pecaAlvo.label : acorde ? 'Acorde ' + acorde.symbol + ' · ' + grupoAlvo.length + ' teclas' : grupoAlvo.length > 1 ? 'Acorde · ' + grupoAlvo.length + ' teclas' : 'Tecla ' + noteName(n.midi)) : 'Corda ' + n.string + ' · ' + (n.fret === 0 ? 'solta (casa 0)' : 'casa ' + n.fret) + ' · ' + noteName(n.midi) : state.mode === 'idle' ? 'Nenhuma nota neste trecho' : 'Trecho concluído';
    if ($('tj-target').textContent !== label) text('tj-target', label);
    if (target) state.position = target.time;
    $('tj-learn-panel').hidden = state.trainingMode !== 'learn' || state.mode === 'demo';
    var gated = ctx && ctx.currentTime < state.guideUntil + meiaJanelaDetector();
    $('tj-hear-note').disabled = !target || !state.running || gated;
    $('tj-skip').disabled = !target || !state.running || gated;
    text('tj-target-help', gated ? 'Espere o som de referência terminar e toque a nota novamente.' : state.running ? 'Toque uma nota clara. A próxima aparece quando esta for reconhecida.' : target ? 'Prática pausada. Continue quando estiver pronto para tocar novamente.' : state.mode === 'learn' ? 'Você chegou ao fim deste trecho.' : preview ? 'Ative a entrada e comece a aprender. Você pode pausar a qualquer momento.' : 'Escolha outra frase ou a música inteira.');
  }
  function finishLearn() {
    pause(); state.position = state.to; updateCampaign(true); updateScore(); updateTransport();
    msg('Trecho concluído: notas reconhecidas e puladas abaixo. O ritmo não foi avaliado.');
  }
  function expiredLearn() {
    if (learnDuration() < 7200) return false;
    pause(); msg('A rodada atingiu duas horas de prática ativa. Comece uma nova rodada para continuar.', true); return true;
  }
  function advanceLearn(change) {
    if (!change) return;
    learnTarget(); updateScore();
    if (state.learner.resumo().complete) finishLearn();
  }
  function selectedRange() {
    var value = $('tj-section').value;
    phraseButtons.forEach(function (button) { button.setAttribute('aria-pressed', String(button.value === value)); });
    $('tj-range-fill').style.left = (state.from / chart.duration * 100) + '%';
    $('tj-range-fill').style.width = ((state.to - state.from) / chart.duration * 100) + '%';
    var title = value === '' ? 'Música inteira' : value === 'custom' ? 'Trecho manual' : (chart.sections || [])[Number(value)].title;
    text('tj-range-label', title + ' · ' + state.from.toFixed(2) + ' s a ' + state.to.toFixed(2) + ' s');
  }
  function selectSection(value) {
    if (state.running) return;
    $('tj-section').value = value;
    if (value === 'custom') { selectedRange(); return; }
    var s = value === '' ? { from: 0, to: chart.duration } : (chart.sections || [])[Number(value)];
    if (!s) return;
    state.from = s.from; state.to = s.to; $('tj-from').value = s.from; $('tj-to').value = s.to;
    stop(); selectedRange(); msg('Trecho selecionado. Comece uma nova rodada.');
  }
  function hearNote() {
    if (!state.running || state.mode !== 'learn' || !state.learner || ctx.currentTime < state.guideUntil + meiaJanelaDetector()) return;
    var target = state.learner.alvo(); if (!target) return;
    state.guideUntil = ctx.currentTime + 0.8;
    referenceWallUntil = performance.now() / 1000 + 0.8;
    state.learner.bloquearAte(state.guideUntil);
    instrumentNote(target, ctx.currentTime + 0.005, 0.45);
    learnTarget();
  }
  function judgeReset() { state.judge = Core.criarJulgador(chart, { offsetMs: state.offset * state.speed, from: state.from, to: state.to }); state.saved = false; }
  function scheduleReset(p, countIn) {
    state.nextNote = chart.notes.findIndex(function (n) { return n.time >= p - 0.01; });
    if (state.nextNote < 0) state.nextNote = chart.notes.length;
    state.nextBeat = countIn ? beatAt(chart, p) : firstBeatAtOrAfter(chart, p);
    state.countInFirstBeat = countIn ? state.nextBeat : null;
  }
  function pause() {
    generation++; mediaStarting = false; soundLoading = false;
    if (state.mode === 'learn' && state.learnStartedAt !== null) { state.learnElapsed = learnDuration(); state.learnStartedAt = null; }
    if (state.running) state.position = Math.min(state.to, current());
    if (state.running && (state.mode === 'practice' || state.mode === 'learn')) updateCampaign(false);
    state.running = false; silence(); if (media) media.pause();
    text('tj-count', '');
    text('tj-pause', 'Continuar'); updateTransport();
  }
  function stop(reset) {
    pause(); state.mode = 'idle'; state.judge = null; state.learner = null; state.learnContext = null; state.learnElapsed = 0; state.learnStartedAt = null; state.guideUntil = 0;
    if (reset !== false) state.position = state.from;
    if (media) media.currentTime = chartToMedia(Math.max(0, state.position));
    midiHeld = Object.create(null); updateMidiChord();
    text('tj-mode', 'PRONTO PARA TOCAR'); text('tj-pause', 'Pausar'); updateScore(); updateTransport();
  }
  function updateMidiChord() {
    var values = Object.keys(midiHeld).map(function (n) { return Number(n); }).filter(Number.isInteger).sort(function (a, b) { return a - b; });
    var label = '';
    if (values.length >= 3 && Acordes) {
      var chord = Acordes.identificar(values);
      label = chord ? 'Acorde reconhecido: ' + chord.symbol : 'Notas simultâneas: ' + values.map(noteName).join(' · ');
    } else if (values.length) label = 'Notas pressionadas: ' + values.map(noteName).join(' · ');
    var node = $('tj-midi-chord'); if (node) { node.textContent = label; node.hidden = !label; }
  }
  async function start(mode, resume) {
    if (chartLoading || remoteLoading || soundLoading || !previewReady || (previewMode && mode !== 'demo')) return;
    var layout = perfilDoChart(chart).layout, midi = layout === 'piano' || layout === 'drums';
    if ((mode === 'practice' || mode === 'learn') && !state.connected) { msg(midi ? 'Ative a entrada MIDI antes de praticar.' : 'Ative o áudio e selecione o microfone ou a interface antes de praticar.', true); return; }
    cancelCalibration(); silence(); var attempt = ++generation;
    soundLoading = true; updateTransport();
    try {
      // Resume no gesto de clique, antes de qualquer download.
      ctx = context(); await ctx.resume();
      if (attempt !== generation) return;
      if (remoteAudio && (mode === 'demo' || (mode === 'practice' && $('tj-backing').checked)) && (!media || performance.now() >= remoteAudio.expiresAt)) {
        if (!await loadRemoteAudio(remoteAudio)) return;
      }
      if (attempt !== generation) return;
      if (mode === 'learn' || ((!media || (mode !== 'demo' && !$('tj-backing').checked)) && (mode === 'demo' || $('tj-guide').checked))) {
        msg('Preparando o som de ' + nomeInstrumento(state.instrument).toLowerCase() + '…');
        await soundEngine().preparar(state.instrument, chart.notes);
      }
      if (backingPackage && mode !== 'learn' && $('tj-backing').checked && !media) {
        msg('Preparando os sons do acompanhamento…');
        await prepareBacking();
      }
      if (attempt !== generation) return;
      soundLoading = false;
      if (resume && state.position >= state.to) resume = false;
      if (mode === 'learn' && (state.learnContext !== ctx || state.learnElapsed >= 7200)) resume = false;
      var startWithCountIn = false;
      if (mode === 'learn') {
        if (!resume || !state.learner) {
          var perfilAprender = perfilDoChart(chart) || perfilDoInstrumento(state.instrument);
          state.learner = midi && typeof Aprender.criarMidi === 'function'
            ? Aprender.criarMidi(chart, { from: state.from, to: state.to, now: ctx.currentTime })
            : Aprender.criar(chart, { from: state.from, to: state.to, now: ctx.currentTime,
              windowMs: perfilAprender.detector.windowMs });
          state.learnContext = ctx; state.learnElapsed = 0; state.judge = null; state.saved = false;
          // Só o restante da cauda audível atravessa rodadas e trocas de contexto.
          // performance.now continua avançando quando o contexto antigo fecha.
          state.guideUntil = ctx.currentTime + Math.max(0, referenceWallUntil - performance.now() / 1000, outputWallUntil - performance.now() / 1000);
          state.learner.retomar(state.guideUntil);
        } else state.learner.retomar(Math.max(ctx.currentTime, state.guideUntil));
        if (!state.learner.resumo().total) { stop(); msg('Este trecho não contém notas. Escolha um trecho do arranjo.', true); return; }
        state.position = state.learner.alvo().time; state.learnStartedAt = ctx.currentTime;
      } else if (!resume) { state.position = countInStart(chart, state.from); startWithCountIn = true; judgeReset(); state.learner = null; }
      if (mode === 'practice' && !state.judge.resumo().total) { stop(); msg('Este trecho não contém notas. Escolha um trecho do arranjo.', true); return; }
      state.mode = mode; state.start = state.position; state.origin = ctx.currentTime; state.running = true;
      state.midiOrigin = performance.now();
      state.endedAt = null; mediaStarting = false; scheduleReset(state.position, startWithCountIn);
      if (media) { media.pause(); media.currentTime = chartToMedia(Math.max(state.from, state.position)); media.playbackRate = state.speed; }
      text('tj-mode', mode === 'demo' ? 'DEMONSTRAÇÃO · SEM AVALIAÇÃO' : mode === 'learn' ? 'APRENDER · NOTA POR NOTA' : midi ? 'PRÁTICA · ENTRADA MIDI' : 'PRÁTICA · NOTAS ISOLADAS');
      text('tj-pause', 'Pausar');
      msg(midi ? (layout === 'piano' ? 'Acompanhe as notas até as teclas correspondentes. Barras simultâneas indicam um acorde.' : 'Acompanhe as batidas até as peças da bateria. × indica chimbal fechado; ○ indica aberto.') : mode === 'demo' ? 'Observe os números das casas chegando à linha de tocar.' : mode === 'learn' ? 'Toque a nota indicada no seu tempo. Ouça a referência ou pule quando precisar.' : 'Toque uma nota por vez. A indicação de corda e casa vem do arranjo.');
      updateScore(); updateTransport();
    } catch (e) { if (attempt === generation) { state.running = false; msg('Não consegui preparar o áudio: ' + e.message + ' Tente novamente.', true); } }
    finally { if (attempt === generation) { soundLoading = false; updateTransport(); } }
  }
  function updateTransport() {
    var perfil = perfilDoInstrumento(state.instrument), midi = perfil.layout === 'drums' || perfil.layout === 'piano';
    var learning = state.trainingMode === 'learn' && state.mode !== 'demo';
    var hasNotes = chart.notes.some(function (n) { return n.time >= state.from && n.time < state.to; });
    $('tj-practice').disabled = !state.connected || state.running || !hasNotes;
    text('tj-practice', state.trainingMode === 'learn' ? '▶ Começar a aprender' : '▶ Praticar');
    $('tj-demo').disabled = state.running;
    $('tj-pause').disabled = state.mode === 'idle';
    $('tj-speed').disabled = state.running || learning;
    $('tj-from').disabled = state.running; $('tj-to').disabled = state.running;
    $('tj-offset').disabled = state.running || learning; $('tj-calibrate').disabled = state.running || !state.connected || learning || midi;
    $('tj-device').disabled = state.running || state.connecting; $('tj-chart-file').disabled = state.running; $('tj-audio-file').disabled = state.running;
    $('tj-instrument').disabled = state.running || state.connecting; $('tj-connection-type').disabled = state.running || state.connecting || midi;
    $('tj-backing').disabled = state.running || learning;
    var mixer = $('tj-mixer');
    if (mixer) {
      mixer.hidden = !backingPackage;
      ['baixo', 'piano', 'bateria'].forEach(function (instrument) {
        var input = $('tj-mix-' + instrument), output = $('tj-mix-' + instrument + '-value');
        if (!input || !output) return;
        input.disabled = state.running || learning || !backingPackage;
        input.value = String(Number.isFinite(backingMix[instrument]) ? backingMix[instrument] : 1);
        output.textContent = Math.round(Number(input.value) * 100) + '%';
      });
    }
    $('tj-metronome').disabled = state.running || learning; $('tj-guide').disabled = state.running || learning;
    $('tj-loop').disabled = state.running || learning; $('tj-progressive-speed').disabled = state.running || learning || !state.loop; $('tj-seek').disabled = learning;
    $('tj-study-mode').disabled = state.running; $('tj-study').disabled = state.running; $('tj-section').disabled = state.running;
    phraseButtons.forEach(function (button) { button.disabled = state.running; });
    $('tj-reset').disabled = state.running;
    $('tj-gain').disabled = state.running || state.connecting || !!state.calibration || midi;
    $('tj-audio-file').disabled = state.running || source.kind === 'catalog' || previewMode;
    $('tj-remote-audio').hidden = !remoteAudio;
    $('tj-remote-audio').disabled = state.running || chartLoading || remoteLoading;
    if (chartLoading || remoteLoading || soundLoading || !previewReady) { $('tj-demo').disabled = true; $('tj-practice').disabled = true; if(!state.running)$('tj-pause').disabled=true; }
    if (previewMode) {
      ['tj-connect','tj-practice','tj-calibrate','tj-device','tj-gain','tj-study-mode','tj-study','tj-chart-file','tj-reset','tj-instrument','tj-connection-type'].forEach(function(id){$(id).disabled=true;});
    }
    if (catalogUI) catalogUI.bloquear(state.running);
    text('tj-clock', state.mode === 'learn' ? timeLabel(learnDuration()) + ' de prática ativa' : timeLabel(state.position) + ' / ' + timeLabel(chart.duration));
    $('tj-seek').value = Math.max(0, state.position);
    learnTarget();
  }
  function updateScore() {
    var learning = state.mode === 'learn' || (state.mode === 'idle' && state.trainingMode === 'learn');
    var r = state.mode === 'learn' && state.learner ? state.learner.resumo() : state.judge && state.mode === 'practice' ? state.judge.resumo() : null;
    text('tj-hits-label', learning ? 'RECONHECIDAS' : 'ACERTOS'); text('tj-misses-label', learning ? 'PULADAS' : 'A REVER');
    $('tj-accuracy-panel').hidden = learning;
    text('tj-hits', r ? r.hits : '—'); text('tj-misses', r ? learning ? r.skipped : r.misses : '—');
    text('tj-accuracy', r && (r.hits + r.misses) ? Math.round(r.accuracy) + '%' : '—');
    var detalhe = '';
    if (r && !learning) {
      if (r.meanAbsTimingMs != null) detalhe += ' · tempo médio ±' + Math.round(r.meanAbsTimingMs) + ' ms';
      if (r.meanAbsCents != null) detalhe += ' · desvio médio ' + Math.round(r.meanAbsCents) + ' cents';
    }
    text('tj-score-label', r ? learning ? (r.hits + r.skipped) + ' de ' + r.total + ' notas · sem avaliação de ritmo' : 'Indicação de treino · ' + (r.hits + r.misses) + ' de ' + r.total + ' notas avaliadas' + (r.streak ? ' · sequência atual: ' + r.streak + ' · melhor: ' + r.bestStreak : '') + detalhe : 'As marcas aparecem quando você pratica com a entrada de áudio ativada.');
    $('tj-save').disabled = previewMode || !!saving || !r || !r.total || r.pending > 0 || state.saved || state.running || !boot.logado;
  }
  function applyChart(c, origin) {
    var perfil = perfilDoChart(c);
    if (!perfil) throw new Error('Use uma afinação padrão disponível: violão/guitarra de seis cordas ou contrabaixo de quatro cordas.');
    stop(); chart = c; source = origin || {kind:'study'};
    var anterior = perfilDoInstrumento(state.instrument), proximo = instrumentoDoChart(perfil, source);
    state.instrument = proximo; $('tj-instrument').value = proximo;
    if (anterior.id !== perfil.id) encerrarCapturaDoPerfilAnterior();
    renderStudies(); loadCampaign(); renderCampaign(); profile(); state.from = 0; state.to = chart.duration; state.position = 0;
    text('tj-song-title', chart.title); text('tj-song-info', tempoLabel(chart) + ' · ' + chart.notes.length + ' notas · ' + timeLabel(chart.duration));
    text('tj-source', source.kind === 'catalog' ? 'Catálogo · versão ' + source.versionNumber + ' · ' + source.credits : source.kind === 'preview' ? 'PRÉVIA DO RASCUNHO · revisão ' + source.revision + ' · sem captura ou avaliação' : source.kind === 'multitrack' ? 'Cifra · acompanhamento automático multifaixa' : source.kind === 'audio-arrangement' ? 'MP3 · rascunho de acordes analisados no navegador' : source.kind === 'study' ? 'Estudo original Musique · sons de instrumentos' : 'Arranjo importado neste navegador');
    $('tj-seek').max = chart.duration; $('tj-to').max = chart.duration; $('tj-from').max = chart.duration;
    $('tj-from').value = 0; $('tj-to').value = chart.duration.toFixed(2);
    var section = $('tj-section'); section.replaceChildren(el('option', { value: '', text: 'Música inteira' }));
    (chart.sections || []).forEach(function (s, i) { section.appendChild(el('option', { value: String(i), text: s.title + ' · ' + timeLabel(s.from) + '–' + timeLabel(s.to) })); });
    section.appendChild(el('option', { value: 'custom', text: 'Trecho manual (segundos abaixo)' })); section.value = '';
    var phrases = $('tj-phrases'); phrases.replaceChildren(); phraseButtons = [];
    [{ title: 'Música inteira', value: '' }].concat((chart.sections || []).map(function (s, i) { return { title: s.title, value: String(i) }; })).forEach(function (s) {
      var button = el('button', { type: 'button', value: s.value, text: s.title, 'aria-pressed': String(s.value === '') });
      button.addEventListener('click', function () { selectSection(s.value); }); phrases.appendChild(button); phraseButtons.push(button);
    });
    var study = source.kind === 'study' && studies.find(function (s) { return s.chart.id === chart.id; });
    $('tj-study').value = study ? study.id : '';
    text('tj-study-info', study ? study.level + ' · ' + study.objective : source.objective || 'Arranjo importado neste navegador. Use notas isoladas na afinação indicada.');
    var table = $('tj-notes'); table.replaceChildren();
    var midi = perfil.layout === 'drums' || perfil.layout === 'piano';
    chart.notes.slice(0, 80).forEach(function (n) {
      var peca = perfil.layout === 'drums' && perfil.drums.find(function (p) { return p.midi === n.midi; });
      table.appendChild(el('tr', {}, [el('td', { text: n.time.toFixed(2) + ' s' }), el('td', { text: peca ? peca.label : noteName(n.midi) }), el('td', { text: midi ? n.duration.toFixed(2) + ' s' : String(n.string) }), el('td', { text: midi ? String(n.velocity) : String(n.fret) })]));
    });
    text('tj-table-third', midi ? 'Duração' : 'Corda'); text('tj-table-fourth', midi ? 'Intensidade MIDI' : 'Casa');
    text('tj-table-note', (chart.notes.length > 80 ? 'Primeiras 80 notas de ' + chart.notes.length + '. ' : '') + (perfil.layout === 'piano' ? 'Cada nome inclui a oitava: Dó4 e Dó5 correspondem a teclas diferentes.' : perfil.layout === 'drums' ? 'Cada linha identifica a peça, o momento e a intensidade da batida.' : perfil.id === 'ukulele' ? 'Afinação tradicional reentrante: cordas 4–1 em Sol4, Dó4, Mi4 e Lá4.' : 'Corda 1 é a mais aguda; corda ' + perfil.strings + ' é a mais grave.'));
    text('tj-stage-profile', perfil.layout === 'drums' ? 'BATERIA MIDI / PISTAS VERTICAIS' : perfil.layout === 'piano' ? 'PIANO / 88 TECLAS · LÁ0–DÓ8' : perfil.strings + ' CORDAS / AFINAÇÃO PADRÃO');
    $('tj-canvas').setAttribute('aria-label', 'Pista de notas de ' + nomeInstrumento(proximo).toLowerCase() + '. Uma tabela das notas está disponível abaixo.');
    selectedRange(); updateScore(); updateTransport();
  }
  function resetMedia() { mediaStarting = false; if (media) { media.onloadedmetadata = null; media.onerror = null; media.pause(); media.removeAttribute('src'); media.load(); } media = null; if (mediaUrl) URL.revokeObjectURL(mediaUrl); mediaUrl = null; text('tj-media-label', 'Sem faixa de acompanhamento'); }
  function attachAudioFile(f) {
    stop(); resetMedia(); mediaUrl = URL.createObjectURL(f); var selectedMedia = media = new window.Audio(mediaUrl);
    media.preload = 'metadata'; media.preservesPitch = true; media.mozPreservesPitch = true; media.webkitPreservesPitch = true; media.volume = 0.65;
    media.onerror = function () { if (selectedMedia !== media) return; stop(); resetMedia(); msg('Não consegui ler este formato de áudio.', true); };
    media.onloadedmetadata = function () { if (selectedMedia !== media) return; if (!Number.isFinite(media.duration) || media.duration < mediaDurationNeeded() - 0.1) { stop(); resetMedia(); msg('O áudio é mais curto que o arranjo e seu alinhamento.', true); return; } text('tj-media-label', f.name); msg('MP3 associado ao arranjo. Clique em Ouvir demonstração para acompanhar a gravação.'); };
  }
  function chooseChart(c, origin) {
    ++chartTicket; ++remoteTicket; chartLoading = false; remoteLoading=false; remoteAudio = null;
    if (!origin || origin.kind !== 'multitrack') backingPackage = null;
    backingPrepared = Object.create(null);
    resetMedia(); applyChart(c, origin);
  }
  function renderStudies() {
    var select = $('tj-study');
    if (!select) return;
    var perfil = perfilDoInstrumento(state.instrument);
    var escolhido = select.value;
    select.replaceChildren(el('option', { value: '', text: 'Arranjo importado' }));
    studies.filter(function (study) {
      var p = perfilDoChart(study.chart);
      return p && p.id === perfil.id;
    }).forEach(function (study) {
      select.appendChild(el('option', { value: study.id, text: study.title }));
    });
    if (Array.prototype.some.call(select.children, function (option) { return option.value === escolhido; })) select.value = escolhido;
    loadCampaign(); renderCampaign();
  }
  async function loadRemoteAudio(reference) {
    var ticket = ++remoteTicket; remoteLoading=true;updateTransport();
    try {
      var data = await Catalogo.requisicao(reference.path);
      if (ticket !== remoteTicket || remoteAudio !== reference) return false;
      if (typeof data.url !== 'string' || !/^https:\/\//i.test(data.url) || typeof data.mime !== 'string' || !/^audio\//i.test(data.mime)) throw new Error('A faixa não está disponível em um formato de áudio compatível.');
      resetMedia();
      var selected = media = new window.Audio(data.url);
      media.preload='metadata'; media.preservesPitch=true; media.mozPreservesPitch=true; media.webkitPreservesPitch=true; media.volume=0.65;media.playbackRate=state.speed;
      reference.expiresAt = performance.now() + Math.max(1, Math.min(600, Number(data.expiresIn) || 600)) * 1000;
      media.onerror=function(){if(selected!==media)return;pause();resetMedia();reference.expiresAt=0;msg('Não consegui reproduzir a faixa. Recarregue o áudio para tentar novamente.',true);};
      media.onloadedmetadata=function(){if(selected!==media)return;if(!Number.isFinite(media.duration)||media.duration<mediaDurationNeeded()-0.1){pause();resetMedia();reference.expiresAt=0;msg('O áudio é mais curto que o arranjo e seu alinhamento. O responsável precisa revisar esta versão.',true);}};
      text('tj-media-label','Áudio associado à versão'); return true;
    } catch(e) { if(ticket===remoteTicket && remoteAudio===reference)msg('Áudio indisponível: '+e.message,true); return false; }
    finally{if(ticket===remoteTicket){remoteLoading=false;updateTransport();}}
  }
  async function openCatalog(item) {
    if (state.running || previewMode || !Catalogo || !Formato) return;
    var ticket=++chartTicket; ++remoteTicket;remoteLoading=false; chartLoading=true; stop(); updateTransport(); msg('Carregando a versão publicada…');
    try {
      var data=await Catalogo.requisicao('/catalogo/'+encodeURIComponent(item.id)+'/versoes/'+encodeURIComponent(item.versionId));
      var doc=Formato.validarDocumento(data.documento), a=data.arranjo;
      if(ticket!==chartTicket)return;
      if(!a || a.id!==item.id || a.versionId!==item.versionId)throw new Error('A versão recebida não corresponde à selecionada.');
      resetMedia(); remoteAudio=null;
      applyChart(doc.chart,{kind:'catalog',instrument:doc.instrument,arranjoId:a.id,versionId:a.versionId,versionNumber:a.versionNumber,objective:doc.objective,credits:doc.credits,mediaOffsetMs:doc.mediaOffsetMs});
      msg('Versão '+a.versionNumber+' carregada. Escolha o trecho e o modo de prática.');
      if(doc.mediaId){remoteAudio={path:'/catalogo/'+encodeURIComponent(a.id)+'/versoes/'+encodeURIComponent(a.versionId)+'/audio',expiresAt:0};await loadRemoteAudio(remoteAudio);}
    } catch(e){if(ticket===chartTicket)msg('Não foi possível abrir este arranjo: '+e.message,true);}
    finally{if(ticket===chartTicket){chartLoading=false;updateTransport();}}
  }
  async function openPreview() {
    var revision=Number(query.get('revisao')), id=query.get('previa'), ticket=++chartTicket;
    chartLoading=true;updateTransport();msg('Carregando prévia do rascunho…');
    try {
      if(!Catalogo || !Formato || !id || !Number.isSafeInteger(revision) || revision<1)throw new Error('Link de prévia inválido. Abra a revisão pela gestão de arranjos.');
      var data=await Catalogo.requisicao('/gestao/arranjos/'+encodeURIComponent(id)), a=data.arranjo;
      if(ticket!==chartTicket)return;
      if(!a || a.id!==id || a.revision!==revision)throw new Error('O rascunho mudou. Reabra a prévia pela gestão para revisar a versão atual.');
      var doc=Formato.validarDocumento(a.documento); previewReady=true;
      applyChart(doc.chart,{kind:'preview',instrument:doc.instrument,revision:revision,objective:doc.objective,credits:doc.credits,mediaOffsetMs:doc.mediaOffsetMs});
      msg('Prévia de revisão: apenas demonstração. Volte à gestão para publicar.');
      if(doc.mediaId){remoteAudio={path:'/gestao/arranjos/'+encodeURIComponent(id)+'/audio?revision='+revision,expiresAt:0};await loadRemoteAudio(remoteAudio);}
    }catch(e){if(ticket===chartTicket){previewReady=false;msg(e.message,true);}}
    finally{if(ticket===chartTicket){chartLoading=false;updateTransport();}}
  }
  async function openCifra() {
    var id = query.get('cifra'), ticket = ++chartTicket;
    if (!id) return;
    chartLoading = true; updateTransport(); msg('Gerando o arranjo multifaixa da cifra…');
    try {
      var resposta = await fetch('/music/api/cifras/cifras/' + encodeURIComponent(id) + '/arranjo-multifaixa', { credentials: 'same-origin' });
      var pacote = await resposta.json(); if (!resposta.ok) throw new Error(pacote.erro || 'Cifra não encontrada.');
      var faixa = (pacote.tracks || []).find(function (t) { return t.instrument === 'violao'; });
      if (!faixa || !Array.isArray(faixa.events) || !faixa.events.length) throw new Error('A cifra não gerou uma trilha de violão.');
      var chart = Core.validarChart({ id: pacote.id + '-guia', title: pacote.title, bpm: pacote.tempo.bpm, duration: pacote.durationMs / 1000,
        tuning: faixa.tuning, notes: faixa.events.map(function (e, i) { return { id: 'multi-' + i, time: e.atMs / 1000, duration: e.durationMs / 1000, string: e.string, fret: e.fret, midi: e.midi }; }), sections: [{ id: 'cifra-inteira', title: 'Cifra inteira', from: 0, to: pacote.durationMs / 1000 }] });
      if (ticket !== chartTicket) return;
      backingPackage = pacote; chooseChart(chart, { kind: 'multitrack', instrument: 'violao', objective: 'Acompanhamento automático com baixo, piano e bateria.', credits: 'Arranjo multifaixa gerado da cifra.' });
      $('tj-backing').checked = true; msg('Arranjo multifaixa carregado. Clique em Ouvir demonstração ou ative o microfone para praticar.');
    } catch (e) { if (ticket === chartTicket) msg('Não foi possível carregar a cifra: ' + e.message, true); }
    finally { if (ticket === chartTicket) { chartLoading = false; updateTransport(); } }
  }
  async function openRiff() {
    var id = query.get('riff'), ticket = ++chartTicket;
    if (!id) return;
    chartLoading = true; updateTransport(); msg('Carregando a tablatura…');
    try {
      var resposta = await fetch('/music/api/cifras/riffs/' + encodeURIComponent(id) + '/chart', { credentials: 'same-origin' });
      var pacote = await resposta.json(); if (!resposta.ok) throw new Error(pacote.erro || 'Riff não encontrado.');
      var c = Core.validarChart(pacote);
      if (ticket !== chartTicket) return;
      chooseChart(c, { kind: 'riff', instrument: 'guitarra', objective: 'Praticar riff pela tablatura.', credits: 'Tablatura do acervo de riffs.' });
      $('tj-backing').checked = false;
      msg('Riff carregado. Clique em Ouvir demonstração ou conecte sua guitarra.');
    } catch (e) { if (ticket === chartTicket) msg('Não foi possível carregar o riff: ' + e.message, true); }
    finally { if (ticket === chartTicket) { chartLoading = false; updateTransport(); } }
  }
  function ending() {
    state.position = state.to; state.running = false; silence(); if (media) media.pause();
    if (state.mode === 'practice' && state.judge) state.judge.avancar(state.to + 1);
    updateScore();
    if (state.loop) {
      if (state.progressiveSpeed) {
        var velocidades = [0.5, 0.75, 1, 1.25], indice = velocidades.indexOf(state.speed);
        if (indice >= 0 && indice < velocidades.length - 1) {
          state.speed = velocidades[indice + 1]; $('tj-speed').value = String(state.speed);
          msg('Trecho concluído. Velocidade aumentada para ' + Math.round(state.speed * 100) + '%; nova rodada após a contagem.');
        } else msg('Trecho concluído na velocidade máxima; nova rodada após a contagem.');
      } else msg('Trecho concluído. Nova rodada após a contagem.');
      start(state.mode, false);
    }
    else { if (state.mode === 'practice') updateCampaign(true); msg(state.mode === 'practice' ? 'Rodada concluída. Confira sua indicação de treino abaixo.' : 'Demonstração concluída. Ative a entrada de áudio para praticar.'); updateTransport(); }
  }
  function tick() {
    if (state.running && state.mode === 'learn') {
      expiredLearn();
      updateTransport();
    } else if (state.running) {
      var p = current(); state.position = p;
      if (p >= state.to && state.endedAt === null) state.endedAt = ctx.currentTime;
      if (state.endedAt !== null && ctx.currentTime - state.endedAt >= Math.max(0.4, scheduledSoundUntil - state.endedAt)) ending();
      else {
        if (media && withBacking() && media.paused && !mediaStarting && p >= state.from && p < state.to) {
          mediaStarting = true; media.currentTime = chartToMedia(p);
          var playingMedia = media, playGeneration = generation;
          media.play().then(function () {
            if (!state.running || playingMedia !== media) playingMedia.pause();
            if (playGeneration === generation && playingMedia === media) mediaStarting = false;
          }).catch(function (e) { if (playGeneration !== generation) return; mediaStarting = false; pause(); msg('O áudio não pôde tocar: ' + e.message, true); });
        }
        var until = p + 0.14 * state.speed;
        if ($('tj-backing').checked) scheduleBacking(p, until);
        // Schedule a short look-ahead from the audio clock, never from animation frame count.
        while (timeAtBeat(chart, state.nextBeat) < until) {
          var bt = timeAtBeat(chart, state.nextBeat);
          if (bt < state.to && bt >= p - 0.02 && (bt < state.from || $('tj-metronome').checked)) {
            var accent = state.countInFirstBeat !== null && Math.abs(state.nextBeat - state.countInFirstBeat) < 1e-7;
            tone(accent || Math.abs(state.nextBeat % 4) < 1e-7 ? 88 : 81, ctx.currentTime + Math.max(0.005, (bt - p) / state.speed), 0.045, 0.045, 'sine');
          }
          if (state.countInFirstBeat !== null && Math.abs(state.nextBeat - state.countInFirstBeat) < 1e-7) state.countInFirstBeat = null;
          state.nextBeat++;
        }
        if (!media || !withBacking()) {
          while (state.nextNote < chart.notes.length && chart.notes[state.nextNote].time < until) {
            var n = chart.notes[state.nextNote++];
            if (n.time >= state.from && n.time < state.to && n.time >= p - 0.02) {
              var at = ctx.currentTime + Math.max(0.005, (n.time - p) / state.speed);
              if (state.mode === 'demo' || $('tj-guide').checked) instrumentNote(n, at, n.duration / state.speed);
            }
          }
        }
        // The detector delivers a buffered window; let late frames arrive before expiring a target.
        if (state.mode === 'practice' && state.judge) { state.judge.avancar(p - 0.15 * state.speed); updateScore(); }
        text('tj-count', p < state.from ? String(Math.max(1, Math.ceil(beatAt(chart, state.from) - beatAt(chart, p) - 1e-7))) : '');
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
    if (state.running && state.mode === 'learn' && state.learner && ctx && !(perfilDoChart(chart).layout === 'piano' || perfilDoChart(chart).layout === 'drums')) {
      if (!expiredLearn()) advanceLearn(state.learner.amostrar(f));
    }
    if (state.running && !mediaStarting && state.mode === 'practice' && state.judge && ctx) {
      var musicTime = current() - (ctx.currentTime - f.audioTime) * state.speed;
      state.judge.amostrar({ time: musicTime, hz: f.hz || 0, confidence: f.confidence, rms: f.rms, onset: f.onset });
    }
  }
  function onMidiEvent(e) {
    if (e && Number.isInteger(e.midi)) {
      if (e.velocity === 0) delete midiHeld[e.midi]; else midiHeld[e.midi] = true;
      updateMidiChord();
    }
    if (!state.running || !ctx || e.velocity === 0) return;
    var stamp = Number.isFinite(e.time) ? e.time : performance.now();
    var musicTime = state.start + (stamp - state.midiOrigin) / 1000 * state.speed;
    if (state.mode === 'learn' && state.learner) { advanceLearn(state.learner.amostrar({ audioTime: ctx.currentTime, midi: e.midi, velocity: e.velocity, channel: e.channel })); return; }
    if (state.mode !== 'practice' || !state.judge) return;
    state.judge.amostrar({ time: musicTime, midi: e.midi, velocity: e.velocity, channel: e.channel });
    updateScore();
  }
  function onMidiStatus(s) {
    state.connected = s.estado === 'conectado';
    state.connecting = s.estado === 'iniciando';
    text('tj-connection', s.estado === 'conectado' ? (s.nome || 'Entrada MIDI conectada') : s.mensagem || 'Entrada MIDI desligada');
    if (s.estado === 'conectado') msg('MIDI conectado. Toque seu instrumento para praticar.');
    if (s.estado === 'erro' || s.estado === 'parado') { midiHeld = Object.create(null); updateMidiChord(); if (state.mode === 'practice' || state.mode === 'learn') pause(); text('tj-meter', ''); }
    if (s.estado === 'conectado' || s.estado === 'parado') refreshDevices();
    updateTransport();
  }
  function onStatus(s) {
    state.connected = s.estado === 'conectado';
    state.connecting = s.estado === 'iniciando';
    text('tj-connection', s.estado === 'conectado' ? (s.nome || 'Entrada de áudio conectada') : s.mensagem || 'Entrada desligada');
    profile();
    if (s.estado === 'erro' || s.estado === 'parado') { if (state.mode === 'practice' || state.mode === 'learn' || (ctx && ctx.state === 'closed')) pause(); cancelCalibration(); text('tj-note', '—'); $('tj-meter').value = 0; }
    if (s.estado === 'erro') msg(s.mensagem, true);
    updateTransport();
  }
  function audioInput() {
    if (!input) input = Audio.criar({ onFrame: onFrame, onStatus: onStatus, ganhoDb: captureGains[state.inputKind], detector: perfilDoInstrumento(state.instrument).detector });
    return input;
  }
  async function refreshDevices() {
    var attempt = ++deviceRefresh;
    try {
      // Enumerar não abre o microfone nem pede permissão. Os nomes podem estar ocultos.
      if ((perfilDoInstrumento(state.instrument).layout === 'drums' || perfilDoInstrumento(state.instrument).layout === 'piano') && window.MusiqueTocarMidi) {
        var midi = midiInput || (midiInput = window.MusiqueTocarMidi.criar({ onEvent: onMidiEvent, onStatus: onMidiStatus }));
        var portas = await midi.dispositivos();
        if (attempt !== deviceRefresh) return;
        var ms = $('tj-device'), selectedMidi = ms.value;
        ms.replaceChildren(el('option', { value: '', text: 'Primeira porta MIDI disponível' }));
        portas.forEach(function (d) { ms.appendChild(el('option', { value: d.id, text: d.name })); });
        ms.value = selectedMidi; return;
      }
      var devices = await audioInput().dispositivos();
      if (attempt !== deviceRefresh) return;
      var select = $('tj-device'), selected = select.value;
      var previous = Array.prototype.find.call(select.children, function (n) { return n.value === selected; });
      var found = !selected, seen = Object.create(null);
      select.replaceChildren(el('option', { value: '', text: 'Entrada padrão do sistema' }));
      devices.forEach(function (d, i) {
        if (!d.deviceId || seen[d.deviceId]) return;
        seen[d.deviceId] = true;
        select.appendChild(el('option', { value: d.deviceId, text: d.label || ('Entrada de áudio ' + (i + 1)) }));
        if (d.deviceId === selected) found = true;
      });
      // Uma lista reduzida por permissão não deve trocar silenciosamente a escolha.
      if (!found) select.appendChild(el('option', { value: selected, text: previous ? previous.textContent : 'Entrada selecionada' }));
      select.value = selected;
    } catch (_) { /* Preserva a lista e a mensagem original da tentativa de captura. */ }
  }
  async function activateInput() {
    $('tj-connect').disabled = true;
    try {
      if ((perfilDoInstrumento(state.instrument).layout === 'drums' || perfilDoInstrumento(state.instrument).layout === 'piano') && window.MusiqueTocarMidi) {
        midiInput = midiInput || window.MusiqueTocarMidi.criar({ onEvent: onMidiEvent, onStatus: onMidiStatus });
        await midiInput.iniciar($('tj-device').value || undefined);
        state.connected = true; msg('MIDI conectado. Toque seu instrumento para praticar.'); updateTransport(); return;
      }
      var devices = await audioInput().iniciar($('tj-device').value || undefined);
      var selected = input.estado().deviceId;
      var realTone = devices.find(function (d) { return /rocksmith|real.?tone/i.test(d.label || ''); });
      msg(state.inputKind === 'realtone' && realTone && selected !== realTone.deviceId ? 'O Real Tone foi encontrado. Selecione-o em “Entrada de áudio”.' : 'Confira o dispositivo em “Entrada de áudio” e toque uma corda. Use fones para ouvir o acompanhamento.');
    } catch (e) { msg(e.message || 'Não consegui abrir a entrada de áudio.', true); }
    finally { $('tj-connect').disabled = false; refreshDevices(); }
  }
  function connect() {
    if(previewMode)return;
    pause(); cancelCalibration();
    if (state.connected) { if (midiInput && (perfilDoInstrumento(state.instrument).layout === 'drums' || perfilDoInstrumento(state.instrument).layout === 'piano')) midiInput.parar(); else if (input) input.parar(); return; }
    return activateInput();
  }
  function cancelCalibration() {
    if (state.calibration) { clearTimeout(state.calibration.timer); state.calibration = null; silence(); }
    $('tj-cal-panel').hidden = true;
    updateTransport();
  }
  function calibrate() {
    cancelCalibration(); stop(); ctx = context(); ctx.resume();
    var startAt = ctx.currentTime + 1, step = 0.75;
    var cal = state.calibration = { start: startAt, step: step, offsets: [], last: -100, timer: null };
    updateTransport();
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
    var perfil = perfilDoChart(chart) || perfilDoInstrumento(state.instrument), totalCordas = perfil.strings;
    var top=h*0.12, bottom=h*0.86, far=w*0.24, near=w*0.88, center=w*0.5, p=state.position;
    g.clearRect(0,0,w,h); var bg=g.createLinearGradient(0,0,0,h); bg.addColorStop(0,'#111c2d');bg.addColorStop(1,'#1d2d40');g.fillStyle=bg;g.fillRect(0,0,w,h);
    if (perfil.layout === 'drums' || perfil.layout === 'piano') {
      var statuses = {}, performanceMidi = state.mode === 'practice' ? state.judge : null, beats = [];
      if (performanceMidi) performanceMidi.estados().forEach(function (s) { statuses[s.id] = s.status; });
      for (var beat = firstBeatAtOrAfter(chart, p), grid = 0; grid < 64; beat++, grid++) {
        var gt = timeAtBeat(chart, beat); if (gt >= p + 4.5) break; beats.push(gt);
      }
      (perfil.layout === 'piano' ? Piano : Bateria).desenhar(g, { w:w, h:h, d:d, chart:chart, position:p, from:state.from, to:state.to, statuses:statuses, beats:beats, mode:state.mode, running:state.running });
      return;
    }
    function point(lane, depth) { var k=1-depth, width=far+(near-far)*k*k; return [center-width/2+width*lane/totalCordas, top+(bottom-top)*k*k]; }
    for(var i=0;i<totalCordas;i++) { var a=point(i,1),b=point(i+1,1),c=point(i+1,0),e=point(i,0); g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.lineTo(c[0],c[1]);g.lineTo(e[0],e[1]);g.closePath();g.fillStyle=i%2?'#ffffff05':'#ffffff0a';g.fill(); }
    for(var lane=0;lane<=totalCordas;lane++) { var a=point(lane,1),b=point(lane,0);g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.strokeStyle='#ccd8e41a';g.lineWidth=d;g.stroke(); }
    var ahead=4.5, nextBeat=firstBeatAtOrAfter(chart,p), gridLines=0;
    for(;gridLines<64;nextBeat++) { var t=timeAtBeat(chart,nextBeat);if(t>=p+ahead)break;var dep=(t-p)/ahead;if(dep<0)continue;var a=point(0,dep),b=point(totalCordas,dep);g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.strokeStyle='#ffffff13';g.stroke();gridLines++; }
    var result={}, performance=state.mode==='learn'?state.learner:state.mode==='practice'?state.judge:null; if(performance)performance.estados().forEach(function(s){result[s.id]=s.status;});
    chart.notes.slice().reverse().forEach(function(n){
      if(n.time<state.from||n.time>=state.to)return;var dt=n.time-p;if(dt < -0.35 || dt>ahead)return;
       var dep=Math.max(0,dt/ahead), lane=totalCordas-n.string, xy=point(lane+0.5,dep), l=point(lane,dep),r=point(lane+1,dep);
      var width=(r[0]-l[0])*0.62, height=Math.max(14*d,28*d*(1-dep));var status=result[n.id];
       if(n.duration>0.22) { var end=point(lane+0.5,Math.min(1,(dt+n.duration)/ahead));g.beginPath();g.moveTo(xy[0],xy[1]);g.lineTo(end[0],end[1]);g.strokeStyle=COLORS[lane % COLORS.length]+'70';g.lineWidth=Math.max(3*d,width*0.17);g.stroke(); }
       g.globalAlpha=dt<0?Math.max(0,1+dt/0.35):1;g.fillStyle=status==='hit'?'#7ad7ac':status==='miss'||status==='skipped'?'#b36f70':COLORS[lane % COLORS.length];
      g.beginPath();g.roundRect(xy[0]-width/2,xy[1]-height/2,width,height,4*d);g.fill();g.fillStyle='#142337';g.font='700 '+Math.max(11*d,18*d*(1-dep))+'px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText(status==='hit'?'✓':String(n.fret),xy[0],xy[1]+d);g.globalAlpha=1;
    });
    var a=point(0,0),b=point(totalCordas,0);g.shadowColor='#ffdca3';g.shadowBlur=12*d;g.strokeStyle='#f2d4a0';g.lineWidth=2*d;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();g.shadowBlur=0;
    g.font='600 '+11*d+'px system-ui';g.textAlign='center';
    // A pista é desenhada da corda grave (esquerda) para a aguda (direita),
    // enquanto o perfil numera as cordas de 1 (aguda) até a última (grave).
    perfil.rotulos.slice().reverse().forEach(function(label,i){var pt=point(i+0.5,0);g.fillStyle=COLORS[i % COLORS.length];g.fillText(label,pt[0],bottom+23*d);});
    g.font='500 '+10*d+'px system-ui';g.fillStyle='#a8bacb';g.textAlign='left';g.fillText('CASA 0 = CORDA SOLTA',w*0.04,h*0.08);
    if(!state.running && state.mode==='idle'){g.fillStyle='#dce5ed';g.textAlign='center';g.font='500 '+14*d+'px system-ui';g.fillText('Acompanhe as casas até a linha de tocar',center,h*0.34);}
  }
  async function save() {
    var learning=state.mode==='learn', performance=learning?state.learner:state.mode==='practice'?state.judge:null;
    if(previewMode || saving || !performance || state.running || state.saved)return;var r=performance.resumo();if(!r.total || r.pending || !boot.logado)return;
    // Uma única nota pulada logo após iniciar pode durar menos que a
    // granularidade mínima de 0,1 s aceita pelo resumo da API.
    var payload=learning?{chartId:chart.id,title:chart.title,total:r.total,hits:r.hits,skipped:r.skipped,duration:Math.max(0.1,Math.round(learnDuration()*1000)/1000),mode:'learn'}:{chartId:chart.id,title:chart.title,total:r.total,hits:r.hits,misses:r.misses,accuracy:r.total?r.hits/r.total*100:0,speed:state.speed,offsetMs:state.offset,duration:state.to-state.from,mode:'practice'};
    if(source.kind==='catalog')payload.catalogRef={arranjoId:source.arranjoId,versionId:source.versionId,from:state.from,to:state.to};
    var round=performance;saving=round;$('tj-save').disabled=true;
    try { var res=await fetch('/music/api/tocar/sessoes',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});var data=await res.json();if(!res.ok)throw new Error(data.erro||'Falha ao guardar.');if(round===(state.learner||state.judge)){state.saved=true;msg('Resultado guardado na sua conta como indicação de treino.');}await history(); }
    catch(e){if(round===(state.learner||state.judge))msg(e.message,true);}
    finally{if(saving===round)saving=null;updateScore();}
  }
  async function history() {
    if(!boot.logado)return;
    try {var res=await fetch('/music/api/tocar/sessoes',{credentials:'same-origin'});if(!res.ok)return;var data=await res.json();var list=$('tj-history');list.replaceChildren();
      var hoje = new Date(); dailySessions = (data.sessoes || []).filter(function (s) { var d = new Date(s.createdAt); return Number.isFinite(d.getTime()) && d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth() && d.getDate() === hoje.getDate(); }).length;
      renderCampaign();
      (data.sessoes||[]).slice(0,5).forEach(function(s){var result=s.mode==='learn'?s.hits+' reconhecidas · '+s.skipped+' puladas':Math.round(s.accuracy)+'%';list.appendChild(el('li',{text:s.title+(s.catalogRef&&s.catalogRef.versionNumber?' · versão '+s.catalogRef.versionNumber:'')+' · '+result+' · '+new Date(s.createdAt).toLocaleDateString('pt-BR')}));});if(!list.children.length)list.appendChild(el('li',{text:'Sua primeira rodada guardada aparecerá aqui.'}));
    } catch(_) { text('tj-history-label','Histórico temporariamente indisponível.'); }
  }
  app.innerHTML = '<div class="tj-heading"><div><p class="tj-eyebrow">MUSIQUE / PRÁTICA COM INSTRUMENTO</p><h1>Tocar junto<span id="tj-instrument-label">Violão</span></h1><p class="tj-intro">Escolha seu instrumento e acompanhe as notas na pista.</p></div><a id="tj-back" class="tj-back" href="/music/tutor-braco?i=violao">Tutor de braço ↗</a></div>'+
    '<section id="tj-catalog" class="tj-panel tj-catalog"></section><p id="tj-preview-notice" class="tj-capture-tip" hidden>Prévia privada do rascunho · apenas demonstração, sem captura ou resultados. <a href="/music/tocar/gerenciar">Voltar à gestão</a></p>'+
    '<div class="tj-layout"><section class="tj-main" aria-label="Pista e reprodução"><div class="tj-song"><div class="tj-art" aria-hidden="true">♩</div><div><p id="tj-source" class="tj-caption"></p><h2 id="tj-song-title"></h2><p id="tj-song-info"></p></div><span class="tj-badge">PROTÓTIPO</span></div>'+
    '<section id="tj-campaign" class="tj-panel tj-campaign" aria-label="Campanha autoral"></section>'+
    '<div class="tj-study-controls"><label class="tj-field">Estudos<select id="tj-study" aria-describedby="tj-study-info"><option value="">Arranjo importado</option></select></label><label class="tj-field">Como praticar<select id="tj-study-mode" aria-describedby="tj-learning-help"><option value="practice" selected>No ritmo</option><option value="learn">Aprender nota por nota</option></select></label><p id="tj-study-info" class="tj-muted"></p><p id="tj-learning-help" class="tj-small">No ritmo, acompanhe o tempo. Ao aprender, cada nota espera por você, sem avaliação de ritmo.</p><div id="tj-phrases" class="tj-phrases" role="group" aria-label="Escolha uma frase ou a música inteira"></div></div>'+
    '<div id="tj-stage" class="tj-stage"><div class="tj-stage-top"><span id="tj-mode">PRONTO PARA TOCAR</span><span id="tj-stage-profile">6 CORDAS / AFINAÇÃO PADRÃO</span></div><div class="tj-stage-scroll" tabindex="0" role="region" aria-label="Pista do instrumento; use as setas para rolar em telas pequenas"><canvas id="tj-canvas" aria-describedby="tj-stage-help" aria-label="Pista de notas de violão e guitarra. Uma tabela das notas está disponível abaixo."></canvas></div><span id="tj-count" aria-live="off"></span><p id="tj-stage-help" class="tj-stage-help"></p></div>'+
    '<section id="tj-learn-panel" class="tj-learn-panel" aria-label="Nota para aprender" hidden><div><p class="tj-caption">SUA PRÓXIMA NOTA</p><h3 id="tj-target" aria-live="polite" aria-atomic="true"></h3><p id="tj-target-help"></p></div><div class="tj-learn-actions"><button id="tj-hear-note" aria-describedby="tj-guide-help" disabled>Ouvir nota</button><button id="tj-skip" disabled>Pular nota</button></div><p id="tj-guide-help" class="tj-small">A referência toca só quando você pede. Espere o som terminar e toque de novo; use fones. Corda e casa são sugestões do arranjo.</p></section>'+
    '<div class="tj-transport"><div class="tj-seek-row"><label class="tj-sr" for="tj-seek">Posição na música</label><input id="tj-seek" type="range" min="0" step="0.1" value="0"><span id="tj-clock"></span></div><div class="tj-actions"><button id="tj-practice" class="tj-primary" disabled>▶ Praticar</button><button id="tj-demo">Ouvir demonstração</button><button id="tj-pause" disabled>Pausar</button><button id="tj-stop" aria-label="Parar e voltar ao início do trecho">■ Parar</button><label class="tj-speed">Velocidade<select id="tj-speed"><option value="0.5">50%</option><option value="0.75">75%</option><option value="1" selected>100%</option><option value="1.25">125%</option></select></label></div><div class="tj-options"><label><input type="checkbox" id="tj-metronome"> Metrônomo</label><label><input type="checkbox" id="tj-guide"> Nota-guia</label><label><input type="checkbox" id="tj-backing"> Acompanhamento</label><span id="tj-media-label">Sem faixa de acompanhamento</span></div><fieldset id="tj-mixer" class="tj-mixer" hidden><legend>Mixagem do acompanhamento</legend><label>Baixo <input id="tj-mix-baixo" type="range" min="0" max="1" step="0.05" value="1"><output id="tj-mix-baixo-value">100%</output></label><label>Piano <input id="tj-mix-piano" type="range" min="0" max="1" step="0.05" value="1"><output id="tj-mix-piano-value">100%</output></label><label>Bateria <input id="tj-mix-bateria" type="range" min="0" max="1" step="0.05" value="1"><output id="tj-mix-bateria-value">100%</output></label></fieldset><label class="tj-check"><input type="checkbox" id="tj-progressive-speed" disabled> Aumentar velocidade a cada volta</label></div>'+
    '<div class="tj-range-overview"><div class="tj-range-track" aria-hidden="true"><span id="tj-range-fill"></span></div><p id="tj-range-label"></p></div><p id="tj-status" class="tj-status" role="status">Ouça a demonstração ou ative o microfone para começar.</p><div class="tj-score"><div><span id="tj-hits-label">ACERTOS</span><strong id="tj-hits">—</strong></div><div><span id="tj-misses-label">A REVER</span><strong id="tj-misses">—</strong></div><div id="tj-accuracy-panel"><span>PRECISÃO</span><strong id="tj-accuracy">—</strong></div><div class="tj-score-note"><p id="tj-score-label"></p><button id="tj-save" disabled>Guardar rodada</button></div></div></section>'+
    '<aside class="tj-sidebar"><section class="tj-panel"><p class="tj-step">01 / SEU INSTRUMENTO</p><h2 id="tj-input-title">Prepare o microfone</h2><div class="tj-input-choices"><label class="tj-field">Instrumento<select id="tj-instrument"><option value="violao" selected>Violão</option><option value="guitarra">Guitarra</option><option value="baixo">Contrabaixo de 4 cordas</option></select></label><label class="tj-field">Como captar o som<select id="tj-connection-type"><option value="microphone" selected>Microfone</option><option value="interface">Interface · instrumento por cabo</option><option value="realtone">Cabo USB Real Tone</option></select></label></div><p id="tj-input-help" class="tj-muted"></p><button id="tj-connect" class="tj-primary tj-wide">Ativar microfone</button><p id="tj-connection" class="tj-connection">Entrada desligada</p><label class="tj-field">Entrada de áudio<select id="tj-device"><option value="">Entrada padrão do sistema</option></select></label><div class="tj-capture-gain"><div><label for="tj-gain">Nível de captação</label><output id="tj-gain-value" for="tj-gain"></output></div><input id="tj-gain" type="range" min="0" max="18" step="3" value="6" aria-describedby="tj-gain-help"><p id="tj-gain-help">Aumente se o instrumento estiver baixo. Reduza se houver ruído ou sinal alto. Pause a prática para ajustar.</p></div><p id="tj-listening-help" class="tj-capture-tip"></p><div class="tj-level"><label for="tj-meter" id="tj-input-level">Aguardando conexão</label><meter id="tj-meter" min="0" max="1" low="0.03" high="0.8" optimum="0.35" value="0"></meter></div><div class="tj-tuner"><span>AFINAÇÃO</span><strong id="tj-note">—</strong><small id="tj-cents">Aguardando sinal</small><div class="tj-tuner-line"><i id="tj-tuner-dot"></i></div></div><p id="tj-midi-chord" class="tj-midi-chord" hidden aria-live="polite"></p></section>'+
    '<section class="tj-panel"><p class="tj-step">02 / SEU TRECHO</p><h2>Pratique por partes</h2><label class="tj-field">Frase ou música inteira<select id="tj-section"></select></label><div class="tj-range"><label>De (segundos)<input id="tj-from" type="number" min="0" step="0.1" value="0"></label><label>Até (segundos)<input id="tj-to" type="number" min="0.5" step="0.1"></label></div><label class="tj-check"><input id="tj-loop" type="checkbox"> Repetir este trecho no ritmo</label><label class="tj-field">Compensação de atraso (ms)<input id="tj-offset" type="number" min="-500" max="500" step="5" value="0"></label><button id="tj-calibrate" class="tj-wide" disabled>Ajustar com cliques</button><div id="tj-cal-panel" hidden><p id="tj-cal-result"></p><button id="tj-use-cal" disabled>Usar estimativa</button><button id="tj-cancel-cal">Cancelar</button></div><p class="tj-small">A compensação corrige o sincronismo no modo No ritmo. Use fone com fio e valide o ajuste tocando.</p></section></aside></div>'+
    '<div class="tj-bottom"><details class="tj-panel"><summary>Praticar outra música</summary><p>Gere um rascunho diretamente de um MP3 ou carregue um arranjo pronto.</p><div class="tj-files"><label>1. Gerar arranjo a partir do MP3<input id="tj-audio-arrangement-file" type="file" accept="audio/*"></label><label>2. Arranjo JSON pronto<input id="tj-chart-file" type="file" accept=".json,application/json"></label><label>3. Áudio correspondente<input id="tj-audio-file" type="file" accept="audio/*"></label></div><button id="tj-download">Baixar arranjo de exemplo</button><button id="tj-reset">Voltar ao estudo original</button><p class="tj-small">A análise é local e aproximada; a gravação original permanece como acompanhamento.</p></details><section class="tj-panel tj-history-panel"><h2>Sua prática</h2><p id="tj-history-label"></p><ul id="tj-history"></ul></section></div>'+
    '<details class="tj-panel tj-notes-panel"><summary>Notas do arranjo · versão em tabela</summary><p id="tj-table-note"></p><table><thead><tr><th>Tempo</th><th>Nota</th><th id="tj-table-third">Corda</th><th id="tj-table-fourth">Casa</th></tr></thead><tbody id="tj-notes"></tbody></table></details><p id="tj-footnote" class="tj-footnote"></p>';
  $('tj-media-label').parentNode.appendChild(el('button',{id:'tj-remote-audio',type:'button',text:'Recarregar áudio',hidden:''}));
  app.appendChild(el('p', {class:'tj-footnote'}, [el('span',{id:'tj-sound-label'}), ' · ', el('a',{href:'/music/tocar/creditos-sons.html',target:'_blank',rel:'noopener',text:'Créditos dos sons'})]));
  renderStudies();
  if(previewMode){$('tj-catalog').hidden=true;$('tj-preview-notice').hidden=false;}
  else if(Catalogo)catalogUI=Catalogo.montar($('tj-catalog'),{loggedIn:!!boot.logado,onSelect:openCatalog});
  else $('tj-catalog').hidden=true;
  on('tj-demo','click',function(){return start('demo',false);});on('tj-practice','click',function(){return start(state.trainingMode,false);});
  on('tj-study-mode','change',function(){stop();cancelCalibration();state.trainingMode=this.value==='learn'?'learn':'practice';updateScore();updateTransport();var midi=perfilDoInstrumento(state.instrument).layout==='piano'||perfilDoInstrumento(state.instrument).layout==='drums';msg(state.trainingMode==='learn'?(midi?'Cada tecla ou grupo de pads espera sua entrada MIDI. Sem contagem, metrônomo ou avaliação de ritmo; ouça a referência quando quiser.':'Cada nota espera por você. Sem contagem, metrônomo ou acompanhamento; ouça a referência quando quiser.'):'Acompanhe as notas no tempo da música.');});
  on('tj-study','change',function(){var estudoId=this.value,estudo=studies.find(function(item){return item.id===estudoId;}),c=Estudos.obter(estudoId);if(!c||previewMode)return;chooseChart(c,{kind:'study',instrument:estudo&&estudo.instrument,objective:estudo&&estudo.objective});msg('Estudo carregado. Escolha uma frase ou pratique a música inteira.');});
  on('tj-section','change',function(){selectSection(this.value);});
  on('tj-hear-note','click',hearNote);on('tj-skip','click',function(){if(state.running&&state.mode==='learn'&&state.learner&&ctx.currentTime>=state.guideUntil+meiaJanelaDetector()&&!expiredLearn())advanceLearn(state.learner.pular(ctx.currentTime));});
  on('tj-instrument','change',changeProfile);on('tj-connection-type','change',changeProfile);
  on('tj-gain','input',changeCaptureGain);
  on('tj-pause','click',function(){if(state.running)pause();else return start(state.mode,true);});on('tj-stop','click',function(){stop();cancelCalibration();msg('Pronto para uma nova rodada.');});
  on('tj-connect','click',connect);on('tj-device','change',function(){if(!input || !state.connected)return;pause();cancelCalibration();return activateInput();});
  on('tj-speed','change',function(){stop();state.speed=Number(this.value);if(media)media.playbackRate=state.speed;msg('Velocidade ajustada. Inicie uma nova rodada.');});
  on('tj-loop','change',function(){state.loop=this.checked;updateTransport();});
  on('tj-progressive-speed','change',function(){state.progressiveSpeed=this.checked;});
  ['baixo', 'piano', 'bateria'].forEach(function (instrument) {
    on('tj-mix-' + instrument, 'input', function () {
      backingMix[instrument] = Math.max(0, Math.min(1, Number(this.value) || 0));
      var output = $('tj-mix-' + instrument + '-value');
      if (output) output.textContent = Math.round(backingMix[instrument] * 100) + '%';
    });
  });
  ['tj-from','tj-to'].forEach(function(id){on(id,'change',function(){var f=Number($('tj-from').value),t=Number($('tj-to').value);if(!Number.isFinite(f)||!Number.isFinite(t)||f<0||t>chart.duration||t-f<0.5){msg('Escolha um trecho válido de pelo menos meio segundo.',true);$('tj-from').value=state.from;$('tj-to').value=state.to;return;}state.from=f;state.to=t;$('tj-section').value='custom';stop();selectedRange();});});
  on('tj-seek','input',function(){var requested=Number(this.value);pause();state.position=Math.max(state.from,Math.min(state.to,requested));state.mode='demo';if(media)media.currentTime=chartToMedia(state.position);state.judge=null;updateScore();updateTransport();msg('Posição alterada. Continue a demonstração ou inicie uma nova prática.');});
  on('tj-offset','change',function(){stop();state.offset=Math.max(-500,Math.min(500,Number(this.value)||0));this.value=state.offset;});
  on('tj-calibrate','click',calibrate);on('tj-use-cal','click',function(){if(!state.calibration||!Number.isFinite(state.calibration.estimate))return;state.offset=state.calibration.estimate;$('tj-offset').value=state.offset;cancelCalibration();msg('Compensação aplicada. Faça uma rodada para conferir.');});on('tj-cancel-cal','click',cancelCalibration);
  on('tj-save','click',save);
  on('tj-chart-file','change',async function(){if(!this.files[0]||previewMode)return;var ticket=++chartTicket;try{if(this.files[0].size>1048576)throw new Error('O arranjo deve ter no máximo 1 MB.');var c=Core.validarChart(JSON.parse(await this.files[0].text()));if(ticket!==chartTicket)return;chooseChart(c,{kind:'local'});msg('Arranjo carregado. Selecione o áudio correspondente.');}catch(e){if(ticket===chartTicket){chartLoading=false;updateTransport();msg('Arranjo inválido: '+e.message,true);}}this.value='';});
  on('tj-audio-file','change',function(){var f=this.files[0];if(!f||previewMode||source.kind==='catalog')return;if(f.size>100*1024*1024){msg('Escolha áudio de até 100 MB.',true);this.value='';return;}attachAudioFile(f);this.value='';});
  on('tj-audio-arrangement-file','change',async function(){var f=this.files[0];if(!f||previewMode||!globalThis.MusiqueTocarAudioArranjo)return;var ticket=++chartTicket;chartLoading=true;updateTransport();msg('Analisando o MP3…');try{var r=await MusiqueTocarAudioArranjo.analisar(f,function(fase){msg(fase);});var gerado=MusiqueTocarAudioArranjo.gerar(r,f.name.replace(/\.[^.]+$/,''));var c=Core.validarChart(gerado.chart);if(ticket!==chartTicket)return;chooseChart(c,{kind:'audio-arrangement',objective:'Notas aproximadas extraídas do MP3.',credits:'Análise local de áudio.'});attachAudioFile(f);$('tj-backing').checked=true;msg('Arranjo do MP3 pronto. A gravação original será usada como acompanhamento.');}catch(e){if(ticket===chartTicket)msg('Não foi possível gerar o arranjo do MP3: '+e.message,true);}finally{if(ticket===chartTicket){chartLoading=false;updateTransport();}}this.value='';});
  on('tj-remote-audio','click',async function(){if(!remoteAudio||state.running)return;var reference=remoteAudio;var ok=await loadRemoteAudio(reference);if(ok&&reference===remoteAudio)msg('Áudio recarregado. Confira a demonstração.');});
  on('tj-reset','click',function(){if(previewMode)return;var perfil=perfilDoInstrumento(state.instrument),estudo=studies.find(function(item){var p=perfilDoChart(item.chart);return p&&p.id===perfil.id;});chooseChart(estudo?estudo.chart:Core.demoChart(),{kind:'study',instrument:estudo&&estudo.instrument,objective:estudo&&estudo.objective});msg('Estudo original carregado.');});
  on('tj-download','click',function(){var url=URL.createObjectURL(new Blob([JSON.stringify(chart,null,2)],{type:'application/json'}));var a=el('a',{href:url,download:'musique-arranjo.json'});a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);});
  document.addEventListener('visibilitychange',function(){if(document.hidden){pause();cancelCalibration();msg('Pausado porque a página ficou em segundo plano.');}});
  window.addEventListener('pagehide',function(){++chartTicket;++remoteTicket;chartLoading=false;remoteLoading=false;pause();cancelCalibration();if(input)input.parar();if(sampler){sampler.dispose();sampler=null;samplerContext=null;}if(demoContext)demoContext.close();if(raf)cancelAnimationFrame(raf);raf=null;resetMedia();});
  window.addEventListener('pageshow',function(e){if(e.persisted && !raf)tick();});
  text('tj-history-label',boot.logado?'Últimas rodadas guardadas nesta conta.':'Entre no Musique para guardar as rodadas na sua conta.');
  if(!boot.logado)$('tj-history').appendChild(el('li',{},[el('a',{href:'/music/entrar?voltar=%2Fmusic%2Ftocar',text:'Entrar ou criar conta'})]));
  if (!Array.prototype.some.call($('tj-instrument').children || [], function (o) { return o.value === 'bateria'; })) $('tj-instrument').appendChild(el('option', { value: 'bateria', text: 'Bateria eletrônica' }));
  if (!Array.prototype.some.call($('tj-instrument').children || [], function (o) { return o.value === 'piano'; })) $('tj-instrument').appendChild(el('option', { value: 'piano', text: 'Piano MIDI' }));
  if (!Array.prototype.some.call($('tj-instrument').children || [], function (o) { return o.value === 'cavaquinho'; })) $('tj-instrument').appendChild(el('option', { value: 'cavaquinho', text: 'Cavaquinho' }));
  if (!Array.prototype.some.call($('tj-instrument').children || [], function (o) { return o.value === 'ukulele'; })) $('tj-instrument').appendChild(el('option', { value: 'ukulele', text: 'Ukulele' }));
  if (!Array.prototype.some.call($('tj-instrument').children || [], function (o) { return o.value === 'bandolim'; })) $('tj-instrument').appendChild(el('option', { value: 'bandolim', text: 'Bandolim de 5 cordas' }));
  if (!Array.prototype.some.call($('tj-connection-type').children || [], function (o) { return o.value === 'midi'; })) $('tj-connection-type').appendChild(el('option', { value: 'midi', text: 'Web MIDI · piano ou bateria' }));
  if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', function () {
    refreshDevices().then(function () { if (!state.connected) msg('Lista de entradas atualizada. Confira o microfone ou a interface selecionada.'); });
  });
  profile();applyChart(chart);if(previewMode)openPreview();else{refreshDevices();history();if(query.has('cifra'))openCifra();else if(query.has('riff'))openRiff();}tick();
})();
