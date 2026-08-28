// =====================================================================
// Player de VÍDEO 360° da Villela Stay — WebGL puro, ZERO dependências.
//
// Mesma projeção equirretangular do visualizador de fotos (src/tour360/
// visualizador.js) e a MESMA convenção de ângulos: yaw positivo gira para a
// direita, arrastar leva a cena junto com o dedo. A diferença é a fonte da
// textura: aqui é um <video> em vez de uma <img>.
//
// Uso no HTML:
//   <div class="v360" data-src="/videos/arquivo.mp4" data-titulo="..."></div>
//
// Compatibilidade: WebGL2 quando existir (permite REPEAT em textura de lado
// não-potência-de-2, o que fecha a emenda do panorama sem artefato); senão
// WebGL1 com CLAMP_TO_EDGE, que deixa no máximo um fio de costura.
// =====================================================================
(function () {
  'use strict';

  var RAD = Math.PI / 180;
  var FOV_MIN = 40, FOV_MAX = 100;
  var PITCH_MAX = 88;

  var VS = [
    'attribute vec2 aPos;',
    'varying vec2 vPos;',
    'void main(){ vPos = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FS = [
    'precision highp float;',
    'varying vec2 vPos;',
    'uniform sampler2D uTex;',
    'uniform mat3 uRot;',
    'uniform float uTanHalfFov;',
    'uniform float uAspect;',
    'const float PI = 3.14159265359;',
    'void main(){',
    '  vec3 dir = uRot * normalize(vec3(vPos.x * uTanHalfFov * uAspect, vPos.y * uTanHalfFov, -1.0));',
    // fract() mantém u dentro de [0,1) mesmo sem REPEAT — é o que segura a emenda no WebGL1
    '  float u = fract(atan(dir.x, -dir.z) / (2.0 * PI) + 0.5);',
    '  float v = 1.0 - acos(clamp(dir.y, -1.0, 1.0)) / PI;',
    '  gl_FragColor = texture2D(uTex, vec2(u, v));',
    '}'
  ].join('\n');

  function compilar(gl, tipo, src) {
    var s = gl.createShader(tipo);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }

  // Ry(-yaw) * Rx(pitch) em ordem de coluna — idêntica à do visualizador de fotos.
  function matrizCamera(yaw, pitch, out) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    out[0] = cy;       out[1] = 0;   out[2] = sy;
    out[3] = -sy * sp; out[4] = cp;  out[5] = cy * sp;
    out[6] = -sy * cp; out[7] = -sp; out[8] = cy * cp;
    return out;
  }

  function tempo(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function Player(raiz) {
    this.raiz = raiz;
    this.txt = {
      play: raiz.dataset.txtPlay || 'Reproduzir',
      pause: raiz.dataset.txtPause || 'Pausar',
      som: raiz.dataset.txtSom || 'Som',
      telaCheia: raiz.dataset.txtTela || 'Tela cheia',
      dica: raiz.dataset.txtDica || 'Arraste para olhar em volta enquanto o vídeo roda',
      semWebgl: raiz.dataset.txtSemwebgl || 'Seu navegador não suporta a visualização 360° interativa.'
    };
    this.yaw = 0; this.pitch = 0; this.fov = 78;
    this.velYaw = 0; this.velPitch = 0;
    this.rot = new Float32Array(9);
    this.texAlocada = false;
    this.destruido = false;

    this.montar();
    if (!this.iniciarGL()) { this.semWebGL(); return; }
    this.ligarControles();
    this.ligarVideo();
  }

  Player.prototype.montar = function () {
    var r = this.raiz, self = this;
    r.classList.add('v360');
    r.innerHTML = '';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'v360-canvas';
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.setAttribute('aria-label', this.txt.dica);
    r.appendChild(this.canvas);

    // O <video> nunca aparece: ele só alimenta a textura. Fica no DOM porque um
    // elemento solto não decodifica em alguns navegadores.
    this.video = document.createElement('video');
    this.video.className = 'v360-fonte';
    this.video.src = r.dataset.src;
    this.video.preload = 'metadata';
    this.video.playsInline = true;
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('webkit-playsinline', '');
    this.video.crossOrigin = 'anonymous';
    r.appendChild(this.video);

    this.carregando = document.createElement('div');
    this.carregando.className = 'v360-carregando';
    this.carregando.innerHTML = '<span class="v360-spin" aria-hidden="true"></span>';
    r.appendChild(this.carregando);

    // Botão grande no centro: é o único jeito de começar (autoplay com som é
    // bloqueado em todo navegador, e vídeo de 21 MB não deve baixar sozinho).
    this.btnCentro = document.createElement('button');
    this.btnCentro.type = 'button';
    this.btnCentro.className = 'v360-play-centro';
    this.btnCentro.innerHTML = '<span aria-hidden="true">&#9654;</span>';
    this.btnCentro.title = this.txt.play;
    this.btnCentro.setAttribute('aria-label', this.txt.play);
    this.btnCentro.addEventListener('click', function () { self.alternarPlay(); });
    r.appendChild(this.btnCentro);

    this.dica = document.createElement('p');
    this.dica.className = 'v360-dica';
    this.dica.textContent = this.txt.dica;
    r.appendChild(this.dica);

    // Controles
    var barra = document.createElement('div');
    barra.className = 'v360-controles';

    this.btnPlay = document.createElement('button');
    this.btnPlay.type = 'button'; this.btnPlay.className = 'v360-btn';
    this.btnPlay.innerHTML = '&#9654;'; this.btnPlay.title = this.txt.play;
    this.btnPlay.setAttribute('aria-label', this.txt.play);
    this.btnPlay.addEventListener('click', function () { self.alternarPlay(); });
    barra.appendChild(this.btnPlay);

    this.tempoTxt = document.createElement('span');
    this.tempoTxt.className = 'v360-tempo';
    this.tempoTxt.textContent = '0:00 / 0:00';
    barra.appendChild(this.tempoTxt);

    this.trilha = document.createElement('input');
    this.trilha.type = 'range'; this.trilha.className = 'v360-trilha';
    this.trilha.min = '0'; this.trilha.max = '1000'; this.trilha.value = '0';
    this.trilha.setAttribute('aria-label', 'Posição no vídeo');
    this.trilha.addEventListener('input', function () {
      if (self.video.duration) self.video.currentTime = self.video.duration * (self.trilha.value / 1000);
    });
    barra.appendChild(this.trilha);

    this.btnSom = document.createElement('button');
    this.btnSom.type = 'button'; this.btnSom.className = 'v360-btn';
    this.btnSom.innerHTML = '&#128266;'; this.btnSom.title = this.txt.som;
    this.btnSom.setAttribute('aria-label', this.txt.som);
    this.btnSom.addEventListener('click', function () {
      self.video.muted = !self.video.muted;
      self.btnSom.innerHTML = self.video.muted ? '&#128263;' : '&#128266;';
      self.btnSom.classList.toggle('v360-btn-off', self.video.muted);
    });
    barra.appendChild(this.btnSom);

    if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
      var bf = document.createElement('button');
      bf.type = 'button'; bf.className = 'v360-btn';
      bf.innerHTML = '&#9974;'; bf.title = this.txt.telaCheia;
      bf.setAttribute('aria-label', this.txt.telaCheia);
      bf.addEventListener('click', function () {
        var emTela = document.fullscreenElement || document.webkitFullscreenElement;
        if (emTela) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else (r.requestFullscreen || r.webkitRequestFullscreen).call(r);
      });
      barra.appendChild(bf);
    }
    r.appendChild(barra);
  };

  Player.prototype.semWebGL = function () {
    // Sem WebGL o vídeo ainda serve: toca achatado, com o aviso de que a
    // navegação 360 não está disponível. Melhor que uma caixa preta.
    this.raiz.innerHTML = '<video class="v360-plano" controls playsinline preload="metadata" src="' +
      this.raiz.dataset.src + '"></video><p class="v360-aviso">' + this.txt.semWebgl + '</p>';
  };

  Player.prototype.iniciarGL = function () {
    var opts = { alpha: false, antialias: false, depth: false, stencil: false };
    // WebGL2 primeiro: aceita REPEAT em textura de lado não-potência-de-2 (3840x1920),
    // o que fecha a emenda do panorama. O WebGL1 só permite CLAMP_TO_EDGE nesse caso.
    var gl = this.canvas.getContext('webgl2', opts);
    this.webgl2 = !!gl;
    if (!gl) gl = this.canvas.getContext('webgl', opts) || this.canvas.getContext('experimental-webgl', opts);
    if (!gl) return false;
    this.gl = gl;
    try {
      var prog = gl.createProgram();
      gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.u = {
        rot: gl.getUniformLocation(prog, 'uRot'),
        tan: gl.getUniformLocation(prog, 'uTanHalfFov'),
        aspect: gl.getUniformLocation(prog, 'uAspect')
      };
      gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([18, 20, 22]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.webgl2 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      this.redimensionar();
      var self = this;
      this._onResize = function () { self.redimensionar(); self.render(); };
      window.addEventListener('resize', this._onResize);
      window.addEventListener('orientationchange', this._onResize);
      this.canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
      return true;
    } catch (e) { return false; }
  };

  Player.prototype.redimensionar = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  };

  // Sobe o quadro atual do vídeo. Aloca a textura UMA vez e depois só substitui o
  // conteúdo (texSubImage2D) — realocar 7,4 megapixels a cada quadro derruba o
  // desempenho no celular.
  Player.prototype.subirQuadro = function () {
    var gl = this.gl, v = this.video;
    if (!v.videoWidth || v.readyState < 2) return false;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (!this.texAlocada) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v);
      this.texAlocada = true;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGB, gl.UNSIGNED_BYTE, v);
    }
    return true;
  };

  Player.prototype.render = function () {
    if (!this.gl) return;
    var gl = this.gl;
    this.redimensionar();
    matrizCamera(this.yaw, this.pitch, this.rot);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniformMatrix3fv(this.u.rot, false, this.rot);
    gl.uniform1f(this.u.tan, Math.tan(this.fov * RAD / 2));
    gl.uniform1f(this.u.aspect, this.canvas.width / this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  Player.prototype.ligarVideo = function () {
    var self = this, v = this.video;

    // Cartaz: em vez de exigir um JPG à parte, busca um quadro do próprio vídeo.
    v.addEventListener('loadedmetadata', function () {
      self.atualizarTempo();
      try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (e) {}
    });
    v.addEventListener('seeked', function () {
      if (self.subirQuadro()) self.render();
      self.carregando.hidden = true;
    });
    v.addEventListener('loadeddata', function () {
      if (self.subirQuadro()) self.render();
      self.carregando.hidden = true;
    });
    v.addEventListener('timeupdate', function () { self.atualizarTempo(); });
    v.addEventListener('play', function () { self.marcarTocando(true); self.laco(); });
    v.addEventListener('pause', function () { self.marcarTocando(false); });
    v.addEventListener('ended', function () { self.marcarTocando(false); });
    v.addEventListener('waiting', function () { self.carregando.hidden = false; });
    v.addEventListener('playing', function () { self.carregando.hidden = true; });
    v.addEventListener('error', function () {
      self.carregando.hidden = true;
      self.raiz.classList.add('v360-erro');
    });

    // Se o vídeo já estiver pronto quando chegamos aqui (arquivo em cache), os eventos
    // acima JÁ dispararam e não vão disparar de novo — sem isto o player ficaria preto
    // com o spinner girando até alguém apertar play.
    if (v.readyState >= 2) {
      this.atualizarTempo();
      if (this.subirQuadro()) this.render();
      this.carregando.hidden = true;
    }
  };

  Player.prototype.marcarTocando = function (tocando) {
    this.tocando = tocando;
    this.raiz.classList.toggle('v360-tocando', tocando);
    this.btnPlay.innerHTML = tocando ? '&#10074;&#10074;' : '&#9654;';
    var rot = tocando ? this.txt.pause : this.txt.play;
    this.btnPlay.title = rot; this.btnPlay.setAttribute('aria-label', rot);
    if (tocando && this.dica) this.dica.hidden = false;
  };

  Player.prototype.alternarPlay = function () {
    var self = this;
    if (this.video.paused) {
      this.carregando.hidden = false;
      var p = this.video.play();
      if (p && p.catch) p.catch(function () { self.carregando.hidden = true; });
    } else this.video.pause();
  };

  Player.prototype.atualizarTempo = function () {
    var v = this.video;
    this.tempoTxt.textContent = tempo(v.currentTime) + ' / ' + tempo(v.duration);
    if (v.duration && !this.arrastandoTrilha) this.trilha.value = String(Math.round(1000 * v.currentTime / v.duration));
  };

  // Laço de desenho: usa requestVideoFrameCallback quando existe (dispara UMA vez
  // por quadro do vídeo, sem upload redundante) e cai em requestAnimationFrame.
  Player.prototype.laco = function () {
    var self = this;
    if (this._rodando) return;
    this._rodando = true;
    function passo() {
      if (self.destruido) { self._rodando = false; return; }
      if (self.video.paused || self.video.ended) {
        self.aplicarInercia();
        self.subirQuadro(); self.render();
        self._rodando = false;
        return;
      }
      self.aplicarInercia();
      self.subirQuadro();
      self.render();
      if (self.video.requestVideoFrameCallback) self.video.requestVideoFrameCallback(passo);
      else requestAnimationFrame(passo);
    }
    if (this.video.requestVideoFrameCallback) this.video.requestVideoFrameCallback(passo);
    else requestAnimationFrame(passo);
  };

  Player.prototype.aplicarInercia = function () {
    if (Math.abs(this.velYaw) < 1e-5 && Math.abs(this.velPitch) < 1e-5) return;
    this.yaw += this.velYaw;
    this.pitch = Math.max(-PITCH_MAX * RAD, Math.min(PITCH_MAX * RAD, this.pitch + this.velPitch));
    this.velYaw *= 0.92; this.velPitch *= 0.92;
    if (Math.abs(this.velYaw) < 1e-5) this.velYaw = 0;
    if (Math.abs(this.velPitch) < 1e-5) this.velPitch = 0;
  };

  // Quando o vídeo está pausado não há laço rodando, então cada gesto precisa
  // pedir o próprio quadro.
  Player.prototype.desenharSePausado = function () {
    if (this.video.paused) this.render();
  };

  Player.prototype.ligarControles = function () {
    var self = this, c = this.canvas;
    var arrastando = false, ultimoX = 0, ultimoY = 0, ponteiros = {}, distPinca = 0, fovPinca = 0;
    function fator() { return (self.fov * RAD) / Math.max(1, c.clientHeight); }
    function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

    c.addEventListener('pointerdown', function (e) {
      // try/catch: setPointerCapture lanca NotFoundError em alguns casos e, como e a
      // primeira instrucao, a excecao abortava o handler ANTES de registrar o ponteiro --
      // o arrasto morria em silencio. A captura e conveniencia, nao requisito.
      try { c.setPointerCapture && c.setPointerCapture(e.pointerId); } catch (err) {}
      ponteiros[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(ponteiros);
      if (ids.length === 1) { arrastando = true; ultimoX = e.clientX; ultimoY = e.clientY; self.velYaw = self.velPitch = 0; c.classList.add('v360-arrastando'); }
      if (ids.length === 2) { arrastando = false; distPinca = dist(ponteiros[ids[0]], ponteiros[ids[1]]); fovPinca = self.fov; }
      if (self.dica) self.dica.hidden = true;
    });
    c.addEventListener('pointermove', function (e) {
      if (!ponteiros[e.pointerId]) return;
      ponteiros[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(ponteiros);
      if (ids.length >= 2) {
        var d = dist(ponteiros[ids[0]], ponteiros[ids[1]]);
        if (distPinca > 0) self.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, fovPinca * distPinca / d));
        self.desenharSePausado();
        return;
      }
      if (!arrastando) return;
      var f = fator();
      var dYaw = -(e.clientX - ultimoX) * f, dPitch = (e.clientY - ultimoY) * f;
      ultimoX = e.clientX; ultimoY = e.clientY;
      self.yaw += dYaw;
      self.pitch = Math.max(-PITCH_MAX * RAD, Math.min(PITCH_MAX * RAD, self.pitch + dPitch));
      self.velYaw = dYaw; self.velPitch = dPitch;
      self.desenharSePausado();
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    function terminar(e) {
      delete ponteiros[e.pointerId];
      if (!Object.keys(ponteiros).length) { arrastando = false; c.classList.remove('v360-arrastando'); }
      distPinca = 0;
    }
    c.addEventListener('pointerup', terminar);
    c.addEventListener('pointercancel', terminar);
    c.addEventListener('pointerleave', terminar);

    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, self.fov + (e.deltaY > 0 ? 4 : -4)));
      self.desenharSePausado();
    }, { passive: false });

    c.addEventListener('keydown', function (e) {
      var passo = 4 * RAD, tratou = true;
      if (e.key === 'ArrowLeft') self.yaw -= passo;
      else if (e.key === 'ArrowRight') self.yaw += passo;
      else if (e.key === 'ArrowUp') self.pitch = Math.min(PITCH_MAX * RAD, self.pitch + passo);
      else if (e.key === 'ArrowDown') self.pitch = Math.max(-PITCH_MAX * RAD, self.pitch - passo);
      else if (e.key === ' ' || e.key === 'Spacebar') self.alternarPlay();
      else tratou = false;
      if (tratou) { e.preventDefault(); self.desenharSePausado(); }
    });

    // Pausa ao sair da tela: vídeo tocando fora de vista é bateria e dados jogados fora.
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (ents) {
        if (!ents[0].isIntersecting && !self.video.paused) self.video.pause();
      }, { threshold: 0.05 }).observe(this.raiz);
    }
  };

  function iniciar() {
    var alvos = document.querySelectorAll('.v360[data-src]');
    for (var i = 0; i < alvos.length; i++) {
      if (!alvos[i].dataset.pronto) {
        alvos[i].dataset.pronto = '1';
        // Exposto como o visualizador de fotos (window.__tour360): serve para conferir
        // projeção e estado sem precisar instrumentar a página.
        (window.__v360 = window.__v360 || []).push(new Player(alvos[i]));
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
