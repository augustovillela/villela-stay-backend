// =====================================================================
// Musique Cifras — cliente · SMART PLAY, karaokê, acorde em detalhe e voz.
// Pedido do Augusto (28/09/2026), com o SmartCifra como referência:
//
//   • player fixo na cifra: MP3/arquivo ou YouTube, velocidade, minimizar;
//   • karaokê: a linha que está tocando acende; a cifra ROLA junto (smart
//     scroll) — e para de rolar sozinha se a pessoa rolar com a mão;
//   • sincronia linha a linha: AUTOMÁTICA para arquivo de áudio (alinhador
//     do motor, num Web Worker) ou MARCADA à mão (serve para o YouTube);
//   • clicar no acorde abre o detalhe: notas, grau e FUNÇÃO no campo
//     harmônico do tom, e o desenho no instrumento;
//   • comandos de voz (reconhecimento de fala do navegador, pt-BR).
//
// YouTube: o player oficial fica SEMPRE visível (mínimo 200 px de altura),
// como pedem os termos da API — o "sem imagem" vale para arquivo de áudio;
// no YouTube a opção é o vídeo pequeno.
// =====================================================================
(function (global) {
  'use strict';
  var C = global.MusiqueCifras, M = global.MusiqueMotor, R = C.R, el = C.el, esc = C.esc, api = C.api;
  var SP = C.SmartPlay = {};

  var idYouTube = function (url) {
    var m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(String(url || ''));
    return m ? m[1] : '';
  };
  var mmss = function (s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
  var guardar = function (k, v) { try { global.localStorage.setItem('musique.sp.' + k, JSON.stringify(v)); } catch (_) { /* sem armazenamento */ } };
  var lerLocal = function (k, pad) { try { var x = global.localStorage.getItem('musique.sp.' + k); return x == null ? pad : JSON.parse(x); } catch (_) { return pad; } };

  // ---------------------------------------------------------------
  // Motores de reprodução (mesma interface para arquivo e YouTube)
  // ---------------------------------------------------------------
  function motorArquivo(url) {
    var a = new Audio(); a.preload = 'metadata'; a.src = url;
    a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true;
    return { tipo: 'arquivo', el: a, tocar: function () { return a.play(); }, pausar: function () { a.pause(); },
      tempo: function () { return a.currentTime || 0; }, duracao: function () { return a.duration || 0; },
      irPara: function (t) { a.currentTime = Math.max(0, t); }, tocando: function () { return !a.paused; },
      velocidade: function (r) { a.playbackRate = r; }, destruir: function () { a.pause(); a.removeAttribute('src'); } };
  }
  var _ytPronto = null;
  function carregarYT() {
    if (_ytPronto) return _ytPronto;
    _ytPronto = new Promise(function (ok, falha) {
      if (global.YT && global.YT.Player) return ok(global.YT);
      var ant = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = function () { if (ant) try { ant(); } catch (_) { /* ok */ } ok(global.YT); };
      var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
      s.onerror = function () { _ytPronto = null; falha(new Error('Não consegui carregar o player do YouTube.')); };
      document.head.appendChild(s);
    });
    return _ytPronto;
  }
  function motorYouTube(videoId, caixa, aoPronto) {
    var p = null, pronto = false, fila = [];
    var alvo = el('div'); caixa.appendChild(alvo);
    carregarYT().then(function (YT) {
      p = new YT.Player(alvo, { videoId: videoId, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: { onReady: function () { pronto = true; fila.forEach(function (f) { f(); }); fila = []; if (aoPronto) aoPronto(); } } });
    }).catch(function (e) { C.erro(e); });
    var quando = function (f) { if (pronto) f(); else fila.push(f); };
    return { tipo: 'youtube', tocar: function () { quando(function () { p.playVideo(); }); return Promise.resolve(); },
      pausar: function () { quando(function () { p.pauseVideo(); }); },
      tempo: function () { return pronto && p.getCurrentTime ? p.getCurrentTime() || 0 : 0; },
      duracao: function () { return pronto && p.getDuration ? p.getDuration() || 0 : 0; },
      irPara: function (t) { quando(function () { p.seekTo(Math.max(0, t), true); }); },
      tocando: function () { return pronto && p.getPlayerState && p.getPlayerState() === 1; },
      velocidade: function (r) { quando(function () { p.setPlaybackRate(r); }); },
      destruir: function () { try { if (p && p.destroy) p.destroy(); } catch (_) { /* ok */ } } };
  }

  // ---------------------------------------------------------------
  // O player fixo da cifra
  // ---------------------------------------------------------------
  var atual = null;          // { estado, ctx, fontes, fonte, motor, marcas, ... }
  SP.fechar = function () {
    if (!atual) return;
    clearInterval(atual.timer);
    if (atual.motor) atual.motor.destruir();
    if (atual.barra && atual.barra.parentNode) atual.barra.parentNode.removeChild(atual.barra);
    document.body.classList.remove('cf-sp-aberto'); document.body.style.paddingBottom = '';
    global.removeEventListener('wheel', atual.aoRolarMao); global.removeEventListener('touchmove', atual.aoRolarMao);
    atual = null;
  };

  /** Liga o Smart Play à cifra aberta. ctx = { areaDoc, docCru, obraId, cifraId, titulo } */
  SP.anexar = function (estado, ctx) {
    SP.fechar();
    var s = atual = { estado: estado, ctx: ctx, fontes: [], fonte: null, motor: null, marcas: [], karaoke: lerLocal('karaoke', true),
      min: lerLocal('min', false), vel: 1, linhaAtual: '', rolouMao: 0, marcando: null };
    s.aoRolarMao = function () { s.rolouMao = Date.now(); };
    global.addEventListener('wheel', s.aoRolarMao, { passive: true }); global.addEventListener('touchmove', s.aoRolarMao, { passive: true });
    s.barra = el('div', { class: 'cf-sp' + (s.min ? ' min' : ''), role: 'region', 'aria-label': 'Smart Play' });
    document.body.appendChild(s.barra); document.body.classList.add('cf-sp-aberto');
    s.barra.appendChild(el('div', { class: 'cf-sp-carregando', txt: '🎧 Procurando o áudio desta música…' }));
    api('GET', '/musicas/' + ctx.obraId).then(function (m) {
      if (atual !== s) return;
      s.fontes = (m.midias || []).map(function (x) {
        var yt = idYouTube(x.url);
        if (yt) return { id: x.id, tipo: 'youtube', video: yt, titulo: x.titulo || 'YouTube' };
        if (x.media_id || /\.(mp3|m4a|ogg|wav|aac|opus|flac)(\?|$)/i.test(x.url)) return { id: x.id, tipo: 'arquivo', titulo: x.titulo || 'Áudio', midia: x };
        return null;
      }).filter(Boolean);
      desenhar();
      if (s.fontes.length) escolher(s.fontes[0]);
    }).catch(function () { if (atual === s) { s.barra.innerHTML = ''; } });
    s.timer = setInterval(passo, 150);
    return s;
  };

  function desenhar() {
    var s = atual; if (!s) return;
    var b = s.barra; b.innerHTML = '';
    if (!s.fontes.length) {
      b.appendChild(el('div', { class: 'cf-sp-linha' }, [el('span', { class: 'cf-sp-tit', txt: '🎧 Smart Play' }),
        el('span', { class: 'm', txt: 'Esta música ainda não tem áudio nem vídeo.' }),
        C.botao('🔎 Procurar no YouTube', procurarYouTube, 'sec peq'),
        C.botao('Adicionar MP3 ou link', function () { C.ir('musica', s.ctx.obraId); }, 'sec peq'),
        C.botao('✕', SP.fechar, 'sec peq')]));
      return;
    }
    s.caixaVideo = el('div', { class: 'cf-sp-video' + (s.fonte && s.fonte.tipo === 'youtube' ? '' : ' oculto') + (lerLocal('videoGrande', false) ? ' grande' : '') });
    // Vídeo AO LADO dos controles (no celular, empilha): o player baixo não cobre a cifra.
    var corpo = el('div', { class: 'cf-sp-corpo' }), ctrl = el('div', { class: 'cf-sp-controles' });
    corpo.appendChild(s.caixaVideo); corpo.appendChild(ctrl); b.appendChild(corpo);
    s.bt = el('button', { class: 'cf-sp-play', type: 'button', 'aria-label': 'Tocar', txt: '▶', onclick: alternar });
    s.tempo = el('span', { class: 'cf-sp-tempo', txt: '0:00' });
    s.barraTempo = el('input', { type: 'range', min: '0', max: '1000', value: '0', class: 'cf-sp-pos', 'aria-label': 'Posição' });
    s.barraTempo.oninput = function () { if (s.motor && s.motor.duracao()) s.motor.irPara(s.motor.duracao() * s.barraTempo.value / 1000); };
    var vel = el('select', { class: 'cf-sp-vel', 'aria-label': 'Velocidade' });
    [0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5].forEach(function (r) { var o = el('option', { value: String(r), txt: Math.round(r * 100) + '%' }); if (r === s.vel) o.selected = true; vel.appendChild(o); });
    vel.onchange = function () { s.vel = Number(vel.value); if (s.motor) s.motor.velocidade(s.vel); };
    var fonteSel = null;
    if (s.fontes.length > 1) {
      fonteSel = el('select', { class: 'cf-sp-fonte', 'aria-label': 'Áudio' });
      s.fontes.forEach(function (f) { var o = el('option', { value: f.id, txt: (f.tipo === 'youtube' ? '▶️ ' : '🎵 ') + f.titulo }); if (s.fonte && f.id === s.fonte.id) o.selected = true; fonteSel.appendChild(o); });
      fonteSel.onchange = function () { escolher(s.fontes.filter(function (f) { return f.id === fonteSel.value; })[0]); };
    }
    s.info = el('span', { class: 'cf-sp-info m', 'aria-live': 'polite' });
    var kar = C.botao(s.karaoke ? '🎤 Karaokê: ligado' : '🎤 Karaokê: desligado', function () { SP.karaoke(); }, 'sec peq');
    var sinc = el('select', { class: 'cf-sp-sinc', 'aria-label': 'Sincronizar' });
    [['', '🎯 Sincronizar…'], ['auto', '⚡ Automático (arquivo de áudio)'], ['mao', '👆 Marcar linha por linha'], ['limpar', '🗑 Apagar sincronia']]
      .forEach(function (x) { sinc.appendChild(el('option', { value: x[0], txt: x[1] })); });
    sinc.onchange = function () { var x = sinc.value; sinc.value = ''; if (x === 'auto') sincronizarAuto(); else if (x === 'mao') marcarAMao(); else if (x === 'limpar') apagarSincronia(); };
    var videoBt = s.fonte && s.fonte.tipo === 'youtube' ? C.botao(lerLocal('videoGrande', false) ? '📺 Vídeo menor' : '📺 Vídeo maior', function () {
      guardar('videoGrande', !lerLocal('videoGrande', false)); s.caixaVideo.classList.toggle('grande'); this.textContent = s.caixaVideo.classList.contains('grande') ? '📺 Vídeo menor' : '📺 Vídeo maior'; ajustarEspaco(); }, 'sec peq') : null;
    var minBt = el('button', { class: 'cf-sp-min', type: 'button', title: s.min ? 'Abrir o player' : 'Minimizar o player', txt: s.min ? '▴' : '▾', onclick: function () { SP.player(s.min); } });
    ctrl.appendChild(el('div', { class: 'cf-sp-linha' }, [s.bt, el('span', { class: 'cf-sp-tit', txt: (s.fonte ? s.fonte.titulo : '') }), s.tempo, s.barraTempo, minBt]));
    ctrl.appendChild(el('div', { class: 'cf-sp-linha cf-sp-extra' }, [fonteSel, el('label', { class: 'm' }, [el('span', { txt: 'Velocidade ' }), vel]), kar, sinc, videoBt,
      C.botao('✕', SP.fechar, 'sec peq')].filter(Boolean)));
    ctrl.appendChild(s.info);
    s.caixaMarcar = el('div', { class: 'cf-sp-marcar oculto' });
    ctrl.appendChild(s.caixaMarcar);
    ajustarEspaco();
  }
  // A página ganha, embaixo, a altura do player: o fim da cifra nunca fica escondido.
  function ajustarEspaco() {
    var s = atual; if (!s) return;
    setTimeout(function () { if (atual === s) document.body.style.paddingBottom = (s.barra.offsetHeight + 28) + 'px'; }, 0);
  }

  function escolher(f) {
    var s = atual; if (!s || !f) return;
    if (s.motor) s.motor.destruir();
    s.fonte = f; s.marcas = []; s.linhaAtual = ''; desenhar();
    var carregarSincronia = function () {
      api('GET', '/cifras/' + s.ctx.cifraId + '/sincronia?midia=' + encodeURIComponent(f.id)).then(function (r) {
        if (atual !== s || s.fonte !== f) return;
        s.marcas = (r.sincronia && r.sincronia.marcas) || [];
        s.info.textContent = s.marcas.length ? (r.sincronia.origem === 'auto' ? 'sincronia automática' : 'sincronia marcada à mão') + ' · ' + s.marcas.length + ' linhas'
          : 'Sem sincronia: a cifra rola na média da música. Use "Sincronizar" para o karaokê exato.';
      }).catch(function () {});
    };
    if (f.tipo === 'youtube') {
      s.caixaVideo.classList.remove('oculto');
      s.motor = motorYouTube(f.video, s.caixaVideo, function () { s.motor.velocidade(s.vel); });
      carregarSincronia();
    } else {
      var urlPronta = f.midia.media_id ? api('GET', '/midias/' + f.id + '/url').then(function (r) { return r.url; }) : Promise.resolve(f.midia.url);
      urlPronta.then(function (u) { if (atual !== s || s.fonte !== f) return; f.url = u; s.motor = motorArquivo(u); s.motor.velocidade(s.vel); carregarSincronia(); })
        .catch(function (e) { s.info.textContent = e.message; });
    }
  }

  function alternar() {
    var s = atual; if (!s || !s.motor) return;
    if (s.motor.tocando()) s.motor.pausar(); else { s.rolouMao = 0; s.motor.tocar().catch(function () {}); }
  }
  SP.tocar = function () { if (atual && atual.motor && !atual.motor.tocando()) alternar(); };
  SP.pausar = function () { if (atual && atual.motor) atual.motor.pausar(); };
  SP.karaoke = function () { if (!atual) return; atual.karaoke = !atual.karaoke; guardar('karaoke', atual.karaoke); limparDestaque(); desenhar(); if (atual.fonte) { /* mantém o motor */ } };
  SP.player = function (aberto) {
    if (!atual) return; atual.min = !aberto; guardar('min', atual.min);
    atual.barra.classList.toggle('min', atual.min); ajustarEspaco();
    var bt = atual.barra.querySelector('.cf-sp-min'); if (bt) { bt.textContent = atual.min ? '▴' : '▾'; bt.title = atual.min ? 'Abrir o player' : 'Minimizar o player'; }
  };
  SP.velocidade = function (passo) {
    if (!atual) return false;
    var lista = [0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5], i = lista.indexOf(atual.vel);
    atual.vel = lista[Math.max(0, Math.min(lista.length - 1, (i < 0 ? 4 : i) + passo))];
    if (atual.motor) atual.motor.velocidade(atual.vel);
    var sel = atual.barra.querySelector('.cf-sp-vel'); if (sel) sel.value = String(atual.vel);
    return true;
  };
  SP.ativo = function () { return !!(atual && atual.motor); };

  // ---------------------------------------------------------------
  // Karaokê + smart scroll
  // ---------------------------------------------------------------
  function linhasDaTela() { return atual ? Array.prototype.slice.call(atual.ctx.areaDoc.querySelectorAll('.cf-l[data-linha]')) : []; }
  function limparDestaque() { linhasDaTela().forEach(function (l) { l.classList.remove('cf-kar', 'cf-kar-feita'); }); }
  function linhaNoTempo(t) {
    var s = atual, m = s.marcas;
    if (m.length) {
      var achada = '';
      for (var i = 0; i < m.length; i++) { if (m[i].t_ms <= t * 1000) achada = m[i].linha; else break; }
      return achada;
    }
    // Sem sincronia: distribui as linhas pela duração (aproximação honesta).
    var d = s.motor.duracao(), ls = linhasDaTela();
    if (!d || !ls.length) return '';
    return ls[Math.min(ls.length - 1, Math.floor((t / d) * ls.length))].getAttribute('data-linha');
  }
  function passo() {
    var s = atual; if (!s || !s.motor) return;
    var t = s.motor.tempo(), d = s.motor.duracao();
    if (s.tempo) s.tempo.textContent = mmss(t) + (d ? ' / ' + mmss(d) : '');
    if (s.barraTempo && d && document.activeElement !== s.barraTempo) s.barraTempo.value = String(Math.round((t / d) * 1000));
    if (s.bt) s.bt.textContent = s.motor.tocando() ? '⏸' : '▶';
    if (s.marcando) return;
    if (!s.motor.tocando()) return;
    var id = linhaNoTempo(t);
    if (!id || id === s.linhaAtual) {
      if (s.karaoke && id) { var ja = s.ctx.areaDoc.querySelector('.cf-l[data-linha="' + id + '"]'); if (ja && !ja.classList.contains('cf-kar')) aplicar(id); }
      return;
    }
    s.linhaAtual = id; aplicar(id);
  }
  function aplicar(id) {
    var s = atual, ls = linhasDaTela(), passou = true, alvo = null;
    ls.forEach(function (l) {
      var eh = l.getAttribute('data-linha') === id;
      if (eh) { alvo = l; passou = false; }
      if (s.karaoke) { l.classList.toggle('cf-kar', eh); l.classList.toggle('cf-kar-feita', passou && !eh); }
    });
    // Smart scroll: a linha tocando vai para o terço de cima — a menos que a
    // pessoa tenha rolado com a mão há pouco (aí ela está lendo outra parte).
    if (alvo && Date.now() - s.rolouMao > 5000) {
      var r = alvo.getBoundingClientRect(), topo = global.innerHeight * 0.3;
      if (r.top < topo - 40 || r.top > topo + 60) global.scrollBy({ top: r.top - topo, behavior: 'smooth' });
    }
  }

  // ---------------------------------------------------------------
  // Sincronia: automática (arquivo) e marcada à mão (qualquer mídia)
  // ---------------------------------------------------------------
  /** Sequência de acordes na ordem da cifra, com a linha de cada um. */
  function acordesComLinha(doc) {
    var out = [];
    doc.secoes.forEach(function (sec) { sec.linhas.forEach(function (l) {
      if (l.tipo !== 'letra') return;
      (l.segmentos || []).forEach(function (g) { if (g.acorde) out.push({ acorde: g.acorde, linha: l.id }); });
    }); });
    return out;
  }
  /** Início de cada linha a partir do início dos acordes; linha sem acorde fica entre as vizinhas. */
  function marcasDasLinhas(doc, seq, inicios) {
    var ordem = [];
    doc.secoes.forEach(function (sec) { sec.linhas.forEach(function (l) { if (l.tipo === 'letra') ordem.push(l.id); }); });
    var primeiro = {};
    seq.forEach(function (x, i) { if (primeiro[x.linha] === undefined) primeiro[x.linha] = inicios[i]; });
    var marcas = ordem.map(function (id) { return { linha: id, t: primeiro[id] }; });
    for (var i = 0; i < marcas.length; i++) {
      if (marcas[i].t !== undefined) continue;
      var a = i - 1; while (a >= 0 && marcas[a].t === undefined) a--;
      var b = i + 1; while (b < marcas.length && marcas[b].t === undefined) b++;
      var ta = a >= 0 ? marcas[a].t : 0, tb = b < marcas.length ? marcas[b].t : ta + 4;
      marcas[i].t = ta + (tb - ta) * (i - a) / (b - a);
    }
    var ult = -1;
    return marcas.map(function (x) { var t = Math.max(ult, x.t); ult = t; return { linha: x.linha, t_ms: Math.round(t * 1000) }; });
  }
  SP._marcasDasLinhas = marcasDasLinhas; SP._acordesComLinha = acordesComLinha;   // testes

  function salvar(origem, confianca) {
    var s = atual;
    return api('PUT', '/cifras/' + s.ctx.cifraId + '/sincronia', { midia_id: s.fonte.id, marcas: s.marcas, origem: origem, confianca: confianca || 0 });
  }
  function sincronizarAuto() {
    var s = atual; if (!s || !s.fonte) return;
    if (s.fonte.tipo !== 'arquivo') { C.aviso('O automático precisa de um arquivo de áudio (MP3). No YouTube, use "Marcar linha por linha".'); return; }
    var seq = acordesComLinha(s.ctx.docCru);
    if (seq.length < 2) { C.aviso('Esta cifra tem poucos acordes para alinhar.'); return; }
    s.info.textContent = '⚡ Baixando o áudio…';
    fetch(s.fonte.url).then(function (r) { if (!r.ok) throw new Error('Não consegui baixar o áudio.'); return r.arrayBuffer(); })
      .then(function (ab) { s.info.textContent = '⚡ Ouvindo a gravação e alinhando com a cifra…'; return C.Escuta.alinhar(ab, seq.map(function (x) { return x.acorde; })); })
      .then(function (r) {
        if (atual !== s) return;
        s.marcas = marcasDasLinhas(s.ctx.docCru, seq, r.inicios_s);
        return salvar('auto', r.confianca).then(function () {
          s.info.textContent = '⚡ Sincronizado (' + Math.round(r.confianca * 100) + '% de confiança). Se alguma linha escapar, use "Marcar linha por linha".';
        });
      }).catch(function (e) { s.info.textContent = ''; C.erro(e); });
  }
  function marcarAMao() {
    var s = atual; if (!s || !s.motor) return;
    var ls = linhasDaTela(); if (!ls.length) return;
    s.marcando = { i: 0, marcas: [] }; limparDestaque();
    var caixa = s.caixaMarcar; caixa.classList.remove('oculto'); caixa.innerHTML = '';
    var proxima = function () { var l = ls[s.marcando.i]; ls.forEach(function (x) { x.classList.remove('cf-kar-prox'); }); if (l) { l.classList.add('cf-kar-prox'); l.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
    var marcar = function () {
      var l = ls[s.marcando.i]; if (!l) return;
      s.marcando.marcas.push({ linha: l.getAttribute('data-linha'), t_ms: Math.round(s.motor.tempo() * 1000) });
      l.classList.remove('cf-kar-prox'); l.classList.add('cf-kar-feita');
      s.marcando.i++; cont.textContent = s.marcando.i + ' de ' + ls.length;
      if (s.marcando.i >= ls.length) concluir(); else proxima();
    };
    var desfazer = function () { if (!s.marcando.i) return; s.marcando.i--; s.marcando.marcas.pop(); ls[s.marcando.i].classList.remove('cf-kar-feita'); cont.textContent = s.marcando.i + ' de ' + ls.length; proxima(); };
    var concluir = function () {
      ls.forEach(function (x) { x.classList.remove('cf-kar-prox', 'cf-kar-feita'); });
      global.removeEventListener('keydown', tecla, true);
      caixa.classList.add('oculto');
      var feitas = s.marcando.marcas; s.marcando = null;
      if (!feitas.length) return;
      s.marcas = feitas.slice().sort(function (a, b) { return a.t_ms - b.t_ms; });
      salvar('manual').then(function () { s.info.textContent = '👆 Sincronia salva: ' + feitas.length + ' linhas.'; }).catch(C.erro);
    };
    var tecla = function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); marcar(); } else if (e.key === 'Backspace') { e.preventDefault(); desfazer(); } };
    global.addEventListener('keydown', tecla, true);
    var cont = el('span', { class: 'm', txt: '0 de ' + ls.length });
    caixa.appendChild(el('p', { class: 'm', txt: 'Dê o play e toque em "Marcar" (ou Espaço) no instante em que cada linha destacada começa a ser cantada.' }));
    caixa.appendChild(el('div', { class: 'cf-sp-linha' }, [C.botao('👆 Marcar esta linha', marcar), C.botao('Desfazer', desfazer, 'sec peq'), cont, C.botao('Concluir', concluir, 'sec peq')]));
    proxima();
    if (!s.motor.tocando()) { s.motor.irPara(0); s.motor.tocar().catch(function () {}); }
  }
  function apagarSincronia() {
    var s = atual; if (!s || !s.fonte) return;
    if (!confirm('Apagar a sincronia desta música com este áudio?')) return;
    s.marcas = []; salvar('manual').then(function () { s.info.textContent = 'Sincronia apagada.'; limparDestaque(); }).catch(C.erro);
  }
  function procurarYouTube() {
    var s = atual; if (!s) return;
    api('POST', '/musicas/' + s.ctx.obraId + '/youtube').then(function (r) {
      if (r.resultado === 'adicionado' || r.resultado === 'ja-tem') { C.aviso(r.resultado === 'adicionado' ? 'Vídeo encontrado: ' + r.video.titulo : 'A música já tem vídeo.'); SP.anexar(s.estado, s.ctx); }
      else if (r.resultado === 'sem-chave') { global.open(r.busca, '_blank', 'noopener'); C.aviso('A busca automática ainda não está ligada: abri a busca do YouTube. Copie o link do vídeo e cole em "Adicionar MP3 ou link".'); }
      else C.aviso('Não achei o vídeo desta música no YouTube.');
    }).catch(C.erro);
  }

  // ---------------------------------------------------------------
  // Detalhe do acorde (clique na cifra)
  // ---------------------------------------------------------------
  var pop = null;
  function fecharPop() { if (pop && pop.parentNode) pop.parentNode.removeChild(pop); pop = null; document.removeEventListener('mousedown', foraPop, true); }
  function foraPop(e) { if (pop && !pop.contains(e.target)) fecharPop(); }
  SP.detalheAcorde = function (acorde, alvo, o) {
    o = o || {};
    fecharPop();
    var ac = M.acorde.ler(acorde);
    pop = el('div', { class: 'cf-pop', role: 'dialog', 'aria-label': 'Acorde ' + acorde });
    pop.appendChild(el('div', { class: 'cf-pop-cab' }, [el('b', { txt: acorde }), el('button', { type: 'button', class: 'cf-pop-x', txt: '✕', 'aria-label': 'Fechar', onclick: fecharPop })]));
    if (!ac || !ac.reconhecido) {
      pop.appendChild(el('p', { class: 'm', txt: 'O motor não reconhece este acorde: confira a grafia.' }));
    } else {
      var notas = M.acorde.notas(ac).map(function (pc) { return M.nota.nome(pc); });
      pop.appendChild(el('p', { html: '<span class="m">Notas</span> ' + esc(notas.join(' – ')) }));
      pop.appendChild(el('p', { html: '<span class="m">Intervalos</span> ' + esc(ac.intervalos.map(function (x) { return x.papel; }).join(', ')) }));
      var tom = o.tom ? M.nota.lerTom(o.tom) : null;
      if (tom) {
        var g = M.harmonia.grau(ac, tom);
        if (g) pop.appendChild(el('p', { html: '<span class="m">No tom de ' + esc(o.tom) + '</span> <b>' + esc(g.texto) + '</b> · ' + esc(g.funcao || '') }));
      }
      var inst = M.instrumentos.INSTRUMENTOS[o.instrumento || 'violao'];
      if (inst && inst.tipo === 'trastes') {
        var f = M.instrumentos.formas(acorde, o.instrumento || 'violao', { afinacao: o.afinacao || 'padrao', quantas: 1 });
        if (f.formas[0]) pop.appendChild(el('div', { class: 'cf-pop-diag' }, [R.diagramaTrastes(f.formas[0], f.cordas, { canhoto: o.canhoto }), el('span', { class: 'm', txt: f.formas[0].desenho + ' · ' + f.formas[0].nivel })]));
      }
      pop.appendChild(el('div', { class: 'cf-pop-acoes' }, [
        C.botao('▶ Ouvir', function () { if (o.tocar) o.tocar(acorde); }, 'sec peq'),
        C.botao('Mais formas', function () { fecharPop(); C.ir('acordes', acorde); }, 'sec peq')]));
    }
    document.body.appendChild(pop);
    var r = alvo.getBoundingClientRect(), w = pop.offsetWidth || 260, h = pop.offsetHeight || 200;
    var x = Math.min(global.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    var y = r.bottom + 8 + h > global.innerHeight ? Math.max(8, r.top - h - 8) : r.bottom + 8;
    pop.style.left = (x + global.scrollX) + 'px'; pop.style.top = (y + global.scrollY) + 'px';
    setTimeout(function () { document.addEventListener('mousedown', foraPop, true); }, 0);
  };
  global.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharPop(); });

  // ---------------------------------------------------------------
  // Comandos de voz
  // ---------------------------------------------------------------
  var V = C.Voz = {};
  var Reconhecer = global.SpeechRecognition || global.webkitSpeechRecognition;
  V.disponivel = function () { return !!Reconhecer; };
  var ouvindo = null;
  V.ouvir = function (aoStatus) {
    if (!Reconhecer) { C.aviso('Este navegador não reconhece voz. Use o Chrome, o Edge ou o Safari.'); return; }
    if (ouvindo) { try { ouvindo.stop(); } catch (_) { /* ok */ } ouvindo = null; if (aoStatus) aoStatus(false); return; }
    if (!lerLocal('vozAviso', false)) {
      C.aviso('Comandos de voz: o reconhecimento é feito pelo serviço de fala do seu navegador (no Chrome, o do Google). O Musique só recebe o texto.');
      guardar('vozAviso', true);
    }
    var r = new Reconhecer(); r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 3;
    ouvindo = r; if (aoStatus) aoStatus(true);
    r.onresult = function (e) {
      var alts = e.results[0], cmd = null;
      for (var i = 0; i < alts.length; i++) { cmd = M.comandos.interpretar(alts[i].transcript); if (cmd.acao !== 'desconhecido') break; }
      V.executar(cmd);
    };
    r.onerror = function (e) { if (e.error === 'not-allowed') C.aviso('Libere o microfone para usar comandos de voz.'); else if (e.error !== 'no-speech' && e.error !== 'aborted') C.aviso('Não consegui ouvir: ' + e.error); };
    r.onend = function () { ouvindo = null; if (aoStatus) aoStatus(false); };
    try { r.start(); } catch (_) { ouvindo = null; if (aoStatus) aoStatus(false); }
  };
  V.executar = function (c) {
    var ca = C.estado.cifraAtual, ac = ca && ca.acoes;
    var semCifra = function () { C.aviso('Abra uma cifra para usar "' + c.ouvido + '".'); };
    switch (c.acao) {
      case 'abrir':
      case 'buscar':
        return api('GET', '/musicas?q=' + encodeURIComponent(c.q) + '&limite=5').then(function (r) {
          var it = (r.itens || r.musicas || [])[0];
          if (c.acao === 'abrir' && it && it.cifra_principal) { C.aviso('🎙️ Abrindo ' + it.titulo); C.ir('cifra', it.cifra_principal); }
          else C.ir('biblioteca', null, { q: c.q });
        }).catch(C.erro);
      case 'tocar': if (SP.ativo()) SP.tocar(); else if (ac) ac.rolar(true); else semCifra(); return;
      case 'pausar': if (SP.ativo()) SP.pausar(); if (ac) ac.rolar(false); return;
      case 'smartplay': if (SP.ativo()) SP.tocar(); else semCifra(); return;
      case 'karaoke': if (atual) SP.karaoke(); else semCifra(); return;
      case 'player': if (atual) SP.player(c.aberto); else semCifra(); return;
      case 'velocidade': if (SP.ativo() && atual.motor.tocando()) SP.velocidade(c.passo); else if (ac) ac.velocidade(c.passo); else semCifra(); return;
      case 'transpor': return ac ? ac.transpor(c.semitons) : semCifra();
      case 'tom': return ac ? ac.tom(c.tom) : semCifra();
      case 'tom_original': return ac ? ac.tomOriginal() : semCifra();
      case 'fonte': return ac ? ac.fonte(c.passo) : semCifra();
      case 'rolar': return ac ? ac.rolar(c.ligar) : semCifra();
      case 'palco': return ca ? C.palcoUmaMusica(ca) : semCifra();
      case 'voltar': return global.history.back();
      case 'proxima': case 'anterior': return C.aviso('"' + c.ouvido + '" funciona dentro do modo palco do setlist.');
      default:
        C.aviso('🎙️ Ouvi "' + (c.texto || '') + '", mas não entendi. Diga, por exemplo: ' + M.comandos.EXEMPLOS.slice(0, 5).join(' · ') + '.');
    }
  };
  /** Botão de microfone, reaproveitado no menu das Cifras. */
  V.botao = function () {
    var b = el('button', { type: 'button', class: 'cf-voz', title: V.disponivel() ? 'Comando de voz' : 'Seu navegador não reconhece voz', txt: '🎙️ Voz' });
    if (!V.disponivel()) b.disabled = true;
    b.onclick = function () { V.ouvir(function (on) { b.classList.toggle('on', on); b.textContent = on ? '🎙️ Ouvindo…' : '🎙️ Voz'; }); };
    return b;
  };
})(window);
