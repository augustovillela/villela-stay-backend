// =====================================================================
// Musique Cifras — CLIENTE · rolagem automática (visualização e palco).
//
// Modos: manual (px/s), duração total, BPM (duração estimada pelo
// documento), marcadores (tempo por seção, sincronizado com o áudio de
// referência) e página (vira a tela inteira a cada N segundos).
//
// Três cuidados de palco:
//   · posição em FRAÇÃO do conteúdo, não em pixel — girar o celular ou
//     mudar a fonte mantém o ponto da música;
//   · requestAnimationFrame: acompanha a taxa da tela e para sozinho com
//     a aba escondida (bateria);
//   · o dedo manda: tocar/rolar à mão pausa por 2,5 s e retoma do ponto
//     em que o músico deixou.
// =====================================================================
(function (global) {
  'use strict';
  var C = global.MusiqueCifras;

  C.Rolagem = function (alvo, opcoes) {
    var o = opcoes || {};
    var self = this;
    var raf = 0, ultimo = 0, acumulado = 0, ativa = false, pausaAte = 0, timerPagina = 0, timerAtraso = 0;
    self.modo = o.modo || 'manual';
    self.velocidade = o.velocidade || 30;          // px/s no modo manual
    self.duracao_s = o.duracao_s || 0;             // modos duração/bpm
    self.pagina_s = o.pagina_s || 20;
    self.aoMudar = o.aoMudar || function () {};

    function el() { return alvo === global ? document.scrollingElement || document.documentElement : alvo; }
    function maximo() { var e = el(); return Math.max(1, e.scrollHeight - e.clientHeight); }
    self.fracao = function () { return el().scrollTop / maximo(); };
    self.irPara = function (f) { el().scrollTop = Math.max(0, Math.min(1, f)) * maximo(); };

    function passo(t) {
      if (!ativa) return;
      if (!ultimo) ultimo = t;
      var dt = (t - ultimo) / 1000; ultimo = t;
      if (Date.now() >= pausaAte && dt < 0.5) {
        var v = self.modo === 'manual' ? self.velocidade : self.duracao_s ? maximo() / self.duracao_s : self.velocidade;
        acumulado += v * dt;
        if (acumulado >= 1) { var inteiro = Math.floor(acumulado); el().scrollTop += inteiro; acumulado -= inteiro; }
        if (el().scrollTop >= maximo() - 1) { self.parar(); self.aoMudar('fim'); return; }
      }
      raf = global.requestAnimationFrame(passo);
    }

    self.iniciar = function (atraso_s) {
      if (ativa) return;
      clearTimeout(timerAtraso);
      var comecar = function () {
        ativa = true; ultimo = 0; acumulado = 0;
        if (self.modo === 'pagina') {
          timerPagina = setInterval(function () {
            if (Date.now() < pausaAte) return;
            var e = el(); e.scrollTop += e.clientHeight * 0.9;
            if (e.scrollTop >= maximo() - 1) { self.parar(); self.aoMudar('fim'); }
          }, Math.max(3, self.pagina_s) * 1000);
        } else raf = global.requestAnimationFrame(passo);
        self.aoMudar('ativa');
      };
      if (atraso_s > 0) { self.aoMudar('aguardando'); timerAtraso = setTimeout(comecar, atraso_s * 1000); } else comecar();
    };
    self.parar = function () {
      ativa = false; clearTimeout(timerAtraso); clearInterval(timerPagina);
      if (raf) global.cancelAnimationFrame(raf); raf = 0;
      self.aoMudar('parada');
    };
    self.alternar = function (atraso) { if (ativa) self.parar(); else self.iniciar(atraso); };
    self.ativa = function () { return ativa; };
    self.ajustar = function (delta) { self.velocidade = Math.max(2, Math.min(300, self.velocidade + delta)); self.aoMudar('velocidade'); };
    /** Pausa curta porque o músico mexeu na tela. */
    self.interromper = function () { pausaAte = Date.now() + 2500; };

    var alvoEventos = alvo === global ? global : alvo;
    ['wheel', 'touchstart', 'keydown'].forEach(function (ev) {
      alvoEventos.addEventListener(ev, function (e) {
        if (ev === 'keydown' && !/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End)$/.test(e.key)) return;
        if (ativa) self.interromper();
      }, { passive: true });
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && ativa) { self.parar(); self.aoMudar('escondida'); } });
    return self;
  };

  /** Calcula a duração-alvo da rolagem pelo modo escolhido. */
  C.duracaoDaRolagem = function (doc, rol) {
    rol = rol || {};
    if (rol.modo === 'duracao' && rol.duracao_s) return rol.duracao_s;
    if (rol.modo === 'bpm' || rol.modo === 'duracao') return C.M.documento.duracaoEstimada(doc) || 0;
    return 0;
  };

  /** Tap tempo: devolve o BPM médio dos últimos toques. */
  C.tapTempo = function () {
    var toques = [];
    return function () {
      var agora = Date.now();
      toques = toques.filter(function (t) { return agora - t < 3000; });
      toques.push(agora);
      if (toques.length < 2) return 0;
      var soma = 0;
      for (var i = 1; i < toques.length; i++) soma += toques[i] - toques[i - 1];
      return Math.round(60000 / (soma / (toques.length - 1)));
    };
  };

  /** Metrônomo e contagem de entrada (WebAudio do app). */
  C.Metronomo = function () {
    var ctx = null, timer = 0, prox = 0, batida = 0, self = this;
    self.bpm = 90; self.compasso = 4; self.ativo = false;
    function clique(t, forte) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = forte ? 1500 : 1000;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(forte ? 0.5 : 0.3, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.06);
    }
    function agendar() {
      while (prox < ctx.currentTime + 0.12) { clique(prox, batida % self.compasso === 0); prox += 60 / self.bpm; batida++; }
    }
    self.ligar = function () {
      try { ctx = ctx || (global.MusiqueAudio && global.MusiqueAudio.audio ? global.MusiqueAudio.audio() : new (global.AudioContext || global.webkitAudioContext)()); }
      catch (_) { return false; }
      if (ctx.resume) ctx.resume();
      prox = ctx.currentTime + 0.05; batida = 0; self.ativo = true;
      clearInterval(timer); timer = setInterval(agendar, 25);
      return true;
    };
    self.desligar = function () { clearInterval(timer); self.ativo = false; };
    /** Contagem de entrada: N tempos e depois `fn`. */
    self.contar = function (n, fn, aoTempo) {
      var tempos = n || self.compasso, i = 0;
      self.ligar();
      var passoMs = 60000 / self.bpm;
      if (aoTempo) aoTempo(tempos);
      var t = setInterval(function () {
        i++;
        if (i >= tempos) { clearInterval(t); self.desligar(); if (aoTempo) aoTempo(0); if (fn) fn(); return; }
        if (aoTempo) aoTempo(tempos - i);
      }, passoMs);
    };
    return self;
  };
})(window);
