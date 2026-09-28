// =====================================================================
// Musique Cifras — CLIENTE · ESCUTA: seguir pelo microfone, tirar os
// acordes de uma gravação e mudar o tom do áudio de referência.
//
// Tudo roda NO APARELHO. O microfone não grava nem envia nada: o som
// vira 12 números (croma) por décimo de segundo e é descartado. A análise
// pesada vai para um Web Worker (/music/cifras-trabalhador.js) com o
// MESMO motor testado no servidor — a tela não congela.
//
// Régua da Q5: o que depende de medida acústica em ambiente real sai
// como EXPERIMENTAL / RASCUNHO, com a confiança na tela, e nunca decide
// sozinho nada que o músico não possa desfazer com um toque.
// =====================================================================
(function (global) {
  'use strict';
  var C = global.MusiqueCifras;
  var M = C.M, el = C.el, api = C.api;
  var E = C.Escuta = {};

  // ---------------------------------------------------------------
  // Trabalhador (Web Worker) — um só, reaproveitado
  // ---------------------------------------------------------------
  var _trab = null, _seq = 0, _pend = {};
  function trabalhador() {
    if (_trab) return _trab;
    _trab = new Worker('/music/cifras-trabalhador.js');
    _trab.onmessage = function (e) { var p = _pend[e.data.id]; if (!p) return; delete _pend[e.data.id]; if (e.data.ok) p.ok(e.data); else p.falha(new Error(e.data.erro)); };
    _trab.onerror = function (e) { Object.keys(_pend).forEach(function (k) { _pend[k].falha(new Error('A análise falhou: ' + (e.message || 'erro'))); delete _pend[k]; }); };
    return _trab;
  }
  function pedir(msg, transferir) {
    return new Promise(function (ok, falha) {
      var id = ++_seq; _pend[id] = { ok: ok, falha: falha };
      msg.id = id; trabalhador().postMessage(msg, transferir || []);
    });
  }

  // ---------------------------------------------------------------
  // Áudio: decodificar para mono (e reamostrar quando pedido)
  // ---------------------------------------------------------------
  function decodificar(arrayBuffer, taxaAlvo) {
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return Promise.reject(new Error('Este navegador não processa áudio.'));
    var ctx = new Ctx();
    return new Promise(function (ok, falha) { ctx.decodeAudioData(arrayBuffer, ok, function () { falha(new Error('Não consegui ler este arquivo de áudio.')); }); })
      .then(function (buf) {
        try { ctx.close(); } catch (_) { /* ok */ }
        var taxa = taxaAlvo || buf.sampleRate;
        var n = Math.floor(buf.duration * taxa);
        var Off = global.OfflineAudioContext || global.webkitOfflineAudioContext;
        var off = new Off(1, n, taxa);                       // mono, e reamostra de graça
        var src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
        return off.startRendering().then(function (r) { return { amostras: r.getChannelData(0), taxa: taxa, duracao: buf.duration }; });
      });
  }
  E.decodificar = decodificar;

  /** Alinha amostras já em memória (ex.: o som do YouTube ouvido pelo microfone). */
  E.alinharAmostras = function (amostras, taxa, acordes) {
    return pedir({ tipo: 'alinhar', amostras: amostras, taxa: taxa, acordes: acordes, qualquerTom: true }, [amostras.buffer]).then(function (r) { return r.resultado; });
  };

  /** Smart Play: alinha a cifra (sequência de acordes) a uma gravação, no Worker. */
  E.alinhar = function (arrayBuffer, acordes) {
    return decodificar(arrayBuffer, 22050).then(function (a) {
      return pedir({ tipo: 'alinhar', amostras: a.amostras, taxa: a.taxa, acordes: acordes, qualquerTom: true }, [a.amostras.buffer]);
    }).then(function (r) { return r.resultado; });
  };

  function baixar(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('Não consegui baixar o áudio (' + r.status + ').'); return r.arrayBuffer(); });
  }

  /** Mono Float32 → WAV 16 bits (Blob), para tocar no <audio> de sempre. */
  function wav(amostras, taxa) {
    var n = amostras.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    var esc = function (o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    esc(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); esc(8, 'WAVE'); esc(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, taxa, true); v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    esc(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var x = Math.max(-1, Math.min(1, amostras[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    return new Blob([b], { type: 'audio/wav' });
  }

  // ---------------------------------------------------------------
  // 1. SEGUIR PELO MICROFONE (experimental)
  // ---------------------------------------------------------------
  /**
   * Acompanha os acordes DESENHADOS em `raiz` (já no tom da tela).
   * o = { rolar(elemento) , aoStatus(texto, confianca) }
   */
  E.seguir = function (raiz, o) {
    o = o || {};
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('Este navegador não dá acesso ao microfone.'));
    var ctrl = { ativo: true };
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      var ctx = new Ctx(), fonte = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 8192; an.smoothingTimeConstant = 0.3;
      fonte.connect(an);
      var db = new Float32Array(an.frequencyBinCount), mags = new Float32Array(an.frequencyBinCount);
      var elementos = [], seg = null, fundo = Infinity;
      ctrl.recomecar = function () {
        elementos = Array.prototype.slice.call(raiz.querySelectorAll('.cf-a')).filter(function (a) { return a.firstChild && a.firstChild.textContent.trim(); });
        var acordes = elementos.map(function (a) { return a.firstChild.textContent.trim(); });
        seg = M.audio.Seguidor(acordes, { piso: 1e-9 });
        marcar(0);
      };
      function marcar(i) {
        raiz.querySelectorAll('.cf-a.ouvindo').forEach(function (x) { x.classList.remove('ouvindo'); });
        var alvo = elementos[i];
        if (!alvo) return;
        alvo.classList.add('ouvindo');
        if (o.rolar) o.rolar(alvo.closest('.cf-l') || alvo);
      }
      /** O músico tocou num acorde: o seguidor recomeça dali. */
      ctrl.irPara = function (elemento) { var i = elementos.indexOf(elemento); if (i >= 0 && seg) { seg.irPara(i); marcar(i); } };
      ctrl.recomecar();
      var timer = setInterval(function () {
        if (!ctrl.ativo || !seg) return;
        an.getFloatFrequencyData(db);
        for (var k = 0; k < db.length; k++) mags[k] = db[k] > -140 ? Math.pow(10, db[k] / 20) * 50 : 0;
        var c = M.audio.croma(mags, ctx.sampleRate, an.fftSize);
        // Silêncio RELATIVO ao ruído do ambiente (cada sala e cada celular
        // têm o seu): o fundo acompanha o mínimo recente, e só som bem
        // acima dele conta como música.
        fundo = Math.min(fundo * 1.01, c.energia);
        if (c.energia < fundo * 3) c = { croma: c.croma, energia: 0 };
        var p = seg.passo(c);
        if (p.avancou) marcar(p.indice);
        if (o.aoStatus) o.aoStatus(p.silencio ? 'ouvindo… (silêncio)' : 'ouvindo · ' + (elementos[seg.indice] ? elementos[seg.indice].firstChild.textContent : ''), p.confianca || 0);
      }, 110);
      ctrl.parar = function () {
        ctrl.ativo = false; clearInterval(timer);
        stream.getTracks().forEach(function (t) { t.stop(); });
        try { ctx.close(); } catch (_) { /* ok */ }
        raiz.querySelectorAll('.cf-a.ouvindo').forEach(function (x) { x.classList.remove('ouvindo'); });
        if (o.aoStatus) o.aoStatus('', 0);
      };
      global.addEventListener('pagehide', ctrl.parar);
      return ctrl;
    });
  };

  /** Botão "🎤" pronto para a leitura e para o palco. */
  E.botaoSeguir = function (obterRaiz, rolar, aoStatus) {
    var atual = null;
    var b = el('button', { type: 'button', txt: '🎤', title: 'Seguir pelo microfone (experimental)', 'aria-label': 'Seguir pelo microfone (experimental)', 'aria-pressed': 'false' });
    b.onclick = function () {
      if (atual) { atual.parar(); atual = null; b.setAttribute('aria-pressed', 'false'); b.textContent = '🎤'; return; }
      E.seguir(obterRaiz(), { rolar: rolar, aoStatus: aoStatus }).then(function (c) {
        atual = c; b.setAttribute('aria-pressed', 'true'); b.textContent = '🎤●';
        C.aviso('Seguindo pelo microfone (EXPERIMENTAL): a cifra rola quando o acorde muda. Toque num acorde para recomeçar dali. Nada é gravado nem enviado.');
      }).catch(function (e) { C.aviso(e && e.name === 'NotAllowedError' ? 'Sem permissão para o microfone.' : (e.message || 'Microfone indisponível.')); });
    };
    b.recomecar = function () { if (atual && atual.recomecar) atual.recomecar(); };
    b.parar = function () { if (atual) { atual.parar(); atual = null; } };
    b.irPara = function (elm) { if (atual && atual.irPara) atual.irPara(elm); };
    return b;
  };

  // ---------------------------------------------------------------
  // 2. TIRAR OS ACORDES DE UMA GRAVAÇÃO (rascunho)
  // ---------------------------------------------------------------
  /** arrayBuffer → { resultado, bpm, chordpro } (no trabalhador). */
  E.transcrever = function (arrayBuffer, meta, aoFase) {
    if (aoFase) aoFase('Lendo o áudio…');
    return decodificar(arrayBuffer, 22050).then(function (a) {
      if (a.duracao > 15 * 60) throw new Error('Áudio acima de 15 minutos: corte o trecho da música.');
      if (aoFase) aoFase('Ouvindo os acordes (' + Math.round(a.duracao) + ' s de áudio)…');
      var copia = new Float32Array(a.amostras);
      return pedir({ tipo: 'transcrever', amostras: copia, taxa: a.taxa }, [copia.buffer]);
    }).then(function (r) {
      var bpm = r.bpm && r.bpm.confianca >= 0.3 ? r.bpm.bpm : 0;
      var cp = M.audio.paraChordPro(r.resultado, Object.assign({}, meta || {}, { bpm: bpm }));
      return { resultado: r.resultado, bpm: bpm, chordpro: cp.chordpro, tom: cp.tom };
    });
  };

  /** Tela: escolher o áudio, analisar, mostrar e mandar para a prévia. */
  E.telaTranscrever = function (area, extra) {
    extra = extra || {};
    area.innerHTML = '';
    area.appendChild(el('div', { class: 'alerta', txt: 'EXPERIMENTAL · Os acordes saem como RASCUNHO (maiores e menores), com a confiança de cada trecho. Funciona melhor com violão ou piano bem audíveis; banda cheia, bateria e voz alta derrubam a precisão — e a confiança diz isso. A análise roda neste aparelho: o áudio não é enviado.' }));
    var input = el('input', { type: 'file', accept: 'audio/*,video/*', 'aria-label': 'Arquivo de áudio' });
    var tit = el('input', { type: 'text', placeholder: 'Título (opcional)', value: extra.titulo || '' });
    var saida = el('div', { 'aria-live': 'polite' });
    area.appendChild(el('div', { class: 'cf-barra' }, [input, tit]));
    area.appendChild(saida);
    var rodar = function (buffer) {
      saida.innerHTML = ''; var fase = el('p', { class: 'peq' }); saida.appendChild(fase);
      E.transcrever(buffer, { titulo: tit.value }, function (f) { fase.textContent = f; }).then(function (r) { mostrar(r); })
        .catch(function (e) { saida.innerHTML = ''; saida.appendChild(C.estadoErro(e)); });
    };
    input.onchange = function () {
      var f = input.files[0]; if (!f) return;
      if (f.size > 80 * 1024 * 1024) return C.aviso('Arquivo acima de 80 MB.');
      if (!tit.value) tit.value = f.name.replace(/\.[^.]+$/, '');
      f.arrayBuffer().then(rodar);
    };
    if (extra.url) baixar(extra.url).then(rodar).catch(function (e) { saida.appendChild(C.estadoErro(e)); });
    function mostrar(r) {
      saida.innerHTML = '';
      var segs = r.resultado.segmentos.filter(function (s) { return s.acorde; });
      saida.appendChild(el('p', { txt: segs.length + ' trocas de acorde · confiança média ' + Math.round(r.resultado.confianca * 100) + '%' + (r.tom ? ' · tom provável ' + r.tom.nome : '') + (r.bpm ? ' · ~' + r.bpm + ' bpm' : '') }));
      var lista = el('div', { class: 'cf-marcas', style: 'max-height:30vh;overflow:auto' });
      segs.forEach(function (s) {
        lista.appendChild(el('span', { class: 'cf-tag ' + (s.confianca >= 0.8 ? 'ok' : s.confianca < 0.65 ? 'er' : 'av'), title: 'confiança ' + Math.round(s.confianca * 100) + '%',
          txt: Math.floor(s.inicio_s / 60) + ':' + ('0' + Math.floor(s.inicio_s % 60)).slice(-2) + ' ' + s.acorde }));
      });
      saida.appendChild(lista);
      saida.appendChild(el('p', { class: 'peq', txt: 'Verde = confiança alta; amarelo = média; vermelho = baixa (confira esses primeiro). Na cifra, os duvidosos saem com "?".' }));
      saida.appendChild(C.botao('Revisar como cifra', function () {
        api('POST', '/importar/texto', { texto: r.chordpro, titulo: tit.value, origem: 'audio', confianca: r.resultado.confianca, bpm: r.bpm })
          .then(function (d) { C.abrirPrevia(d, extra); }).catch(C.erro);
      }));
    }
  };

  // ---------------------------------------------------------------
  // 3. MUDAR O TOM do áudio de referência
  // ---------------------------------------------------------------
  var _cacheTom = {};
  /** Devolve uma URL (blob) do áudio no novo tom, com a mesma duração. */
  E.audioNoTom = function (url, semitons, aoFase) {
    var chave = url + '|' + semitons;
    if (_cacheTom[chave]) return Promise.resolve(_cacheTom[chave]);
    if (aoFase) aoFase('Baixando o áudio…');
    return baixar(url).then(function (b) { if (aoFase) aoFase('Lendo o áudio…'); return decodificar(b, 0); }).then(function (a) {
      if (a.duracao > 15 * 60) throw new Error('Áudio acima de 15 minutos.');
      if (aoFase) aoFase('Mudando o tom (' + (semitons > 0 ? '+' : '') + semitons + ')… pode levar alguns segundos.');
      var copia = new Float32Array(a.amostras);
      return pedir({ tipo: 'tom', amostras: copia, semitons: semitons }, [copia.buffer]).then(function (r) {
        var u = URL.createObjectURL(wav(r.amostras, a.taxa));
        _cacheTom[chave] = u;
        return u;
      });
    });
  };
})(window);
