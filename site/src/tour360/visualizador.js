// =====================================================================
// Visualizador 360° da Villela Stay — WebGL puro, ZERO dependências.
//
// Renderiza panoramas equirretangulares (proporção 2:1) projetando um raio
// por pixel num quad de tela cheia — sem geometria de esfera, sem biblioteca,
// sem CDN externo. Mesmo espírito do build.js: nada para instalar, nada para
// manter atualizado.
//
// A página injeta window.TOUR360 = { base, cenas, inicial, textos } e este
// arquivo se encarrega do resto. Ver src/tour360/cenas.js para o manifesto.
//
// Compatibilidade: WebGL1 (todo navegador desde 2013). Sem WebGL, o próprio
// visualizador troca por uma imagem estática — a página nunca fica vazia.
// =====================================================================
(function () {
  'use strict';

  var RAD = Math.PI / 180;
  var FOV_MIN = 32, FOV_MAX = 100;   // graus (vertical)
  var PITCH_MAX = 88;                // trava o polo p/ não "virar de cabeça p/ baixo"

  // ---------------------------------------------------------------- shaders
  // Vertex: só repassa o quad de tela cheia (-1..1) e a posição em clip space.
  var VS = [
    'attribute vec2 aPos;',
    'varying vec2 vPos;',
    'void main(){ vPos = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  // Fragment: monta o raio da câmera a partir da posição em clip space, gira
  // pela matriz da câmera e converte a direção em coordenada equirretangular.
  // uMix faz o crossfade entre a cena atual (A) e a que está entrando (B).
  var FS = [
    'precision highp float;',
    'varying vec2 vPos;',
    'uniform sampler2D uTexA;',
    'uniform sampler2D uTexB;',
    'uniform float uMix;',
    'uniform mat3 uRot;',
    'uniform float uTanHalfFov;',
    'uniform float uAspect;',
    'const float PI = 3.14159265359;',
    'void main(){',
    '  vec3 dir = uRot * normalize(vec3(vPos.x * uTanHalfFov * uAspect, vPos.y * uTanHalfFov, -1.0));',
    '  float u = atan(dir.x, -dir.z) / (2.0 * PI) + 0.5;',
    '  float v = 1.0 - acos(clamp(dir.y, -1.0, 1.0)) / PI;',
    '  vec2 uv = vec2(u, v);',
    '  vec4 a = texture2D(uTexA, uv);',
    '  vec4 b = texture2D(uTexB, uv);',
    '  gl_FragColor = mix(a, b, uMix);',
    '}'
  ].join('\n');

  function compilar(gl, tipo, src) {
    var s = gl.createShader(tipo);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }

  // ---------------------------------------------------------------- helpers
  // Matriz de rotação da câmera: Ry(-yaw) * Rx(pitch), em ordem de coluna (WebGL).
  // O sinal invertido no yaw é o que faz valer a convenção universal de tour 360
  // (Street View, Pannellum): yaw POSITIVO gira para a DIREITA e avança para a
  // direita no panorama. Quem for anotar hotspots à mão espera exatamente isso.
  function matrizCamera(yaw, pitch, out) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    out[0] = cy;       out[1] = 0;   out[2] = sy;
    out[3] = -sy * sp; out[4] = cp;  out[5] = cy * sp;
    out[6] = -sy * cp; out[7] = -sp; out[8] = cy * cp;
    return out;
  }

  // Direção no mundo de um ponto (yaw, pitch) — mesma convenção da câmera, para
  // que um hotspot em yaw=Y fique centralizado quando a câmera está em yaw=Y.
  function direcao(yaw, pitch) {
    var cp = Math.cos(pitch);
    return [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  }

  // Largura de textura adequada ao aparelho: telas pequenas não ganham nada com
  // 4096 e pagam caro em memória e download (celular antigo chega a estourar).
  function larguraIdeal(disponiveis) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var lado = Math.max(screen.width, screen.height) * dpr;
    var mem = navigator.deviceMemory || 4;
    var alvo = (lado <= 900 || mem <= 2) ? 1024 : (lado <= 1800 || mem <= 4) ? 2048 : 4096;
    var ordenadas = disponiveis.slice().sort(function (a, b) { return a - b; });
    var escolha = ordenadas[0];
    for (var i = 0; i < ordenadas.length; i++) if (ordenadas[i] <= alvo) escolha = ordenadas[i];
    return escolha;
  }

  // ---------------------------------------------------------------- viewer
  function Viewer(raiz, cfg) {
    this.raiz = raiz;
    this.cfg = cfg;
    this.cenas = cfg.cenas;
    this.porId = {};
    for (var i = 0; i < this.cenas.length; i++) this.porId[this.cenas[i].id] = this.cenas[i];
    this.txt = cfg.textos || {};

    this.yaw = 0; this.pitch = 0; this.fov = 75;
    this.velYaw = 0; this.velPitch = 0;     // inércia depois de arrastar
    this.autoRotate = true;                 // para no primeiro toque do visitante
    this.mix = 0; this.mixAlvo = 0;
    this.rot = new Float32Array(9);
    this.cache = {};                        // url -> {tex, largura}
    this.cenaAtual = null;
    // Cena de "vista geral" de cada casa (hub). Quem entra num quarto por um portal precisa
    // de uma saída óbvia — sem isso o visitante fica preso no cômodo.
    this.hubs = {};
    for (var h = 0; h < this.cenas.length; h++) {
      var ch = this.cenas[h];
      if (ch.hub && ch.casa && !this.hubs[ch.casa]) this.hubs[ch.casa] = ch.id;
    }
    this.gyro = false;
    this.destruido = false;

    this.montar();
    if (!this.iniciarGL()) { this.semWebGL(); return; }
    this.ligarControles();
    this.ir(cfg.inicial || this.cenas[0].id, true);
    this.loop();
  }

  // ---- DOM ----
  Viewer.prototype.montar = function () {
    var r = this.raiz;
    r.innerHTML = '';
    r.classList.add('t360');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 't360-canvas';
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.setAttribute('aria-label', this.txt.ariaCanvas || 'Panorama 360 graus. Arraste para olhar em volta; use as setas do teclado e + / - para aproximar.');
    r.appendChild(this.canvas);

    this.camadaHotspots = document.createElement('div');
    this.camadaHotspots.className = 't360-hotspots';
    r.appendChild(this.camadaHotspots);

    this.rotulo = document.createElement('div');
    this.rotulo.className = 't360-rotulo';
    r.appendChild(this.rotulo);

    this.carregando = document.createElement('div');
    this.carregando.className = 't360-carregando';
    this.carregando.innerHTML = '<span class="t360-spin" aria-hidden="true"></span>' + (this.txt.carregando || 'Carregando a vista…');
    r.appendChild(this.carregando);

    this.dica = document.createElement('p');
    this.dica.className = 't360-dica';
    this.dica.textContent = this.txt.dica || 'Arraste para olhar em volta';
    r.appendChild(this.dica);

    // Barra de controles
    var barra = document.createElement('div');
    barra.className = 't360-barra';
    var self = this;
    function botao(rotulo, titulo, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 't360-btn'; b.innerHTML = rotulo;
      b.title = titulo; b.setAttribute('aria-label', titulo);
      b.addEventListener('click', function (e) { e.preventDefault(); self.interagiu(); fn(b); });
      barra.appendChild(b);
      return b;
    }
    botao('+', this.txt.aproximar || 'Aproximar', function () { self.zoom(-8); });
    botao('&minus;', this.txt.afastar || 'Afastar', function () { self.zoom(8); });
    this.btnAuto = botao('&#10227;', this.txt.girar || 'Girar sozinho', function (b) {
      self.autoRotate = !self.autoRotate;
      b.classList.toggle('t360-btn-on', self.autoRotate);
    });
    this.btnAuto.classList.add('t360-btn-on');
    if (window.DeviceOrientationEvent) {
      this.btnGyro = botao('&#128241;', this.txt.giroscopio || 'Mover o celular para olhar', function (b) { self.alternarGyro(b); });
    }
    if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
      botao('&#9974;', this.txt.telaCheia || 'Tela cheia', function () { self.telaCheia(); });
    }
    r.appendChild(barra);

    // Saída para a vista geral da casa. Só aparece quando existe hub e não estamos nele.
    this.btnVoltar = document.createElement('button');
    this.btnVoltar.type = 'button';
    this.btnVoltar.className = 't360-voltar';
    this.btnVoltar.hidden = true;
    this.btnVoltar.innerHTML = '&#8592; ' + (this.txt.voltar || 'Voltar à vista geral');
    this.btnVoltar.addEventListener('click', function (e) {
      e.preventDefault();
      self.interagiu();
      var hub = self.cenaAtual && self.hubs[self.cenaAtual.casa];
      if (hub) self.ir(hub);
    });
    r.appendChild(this.btnVoltar);

    // Seletor de cenas (também serve de conteúdo indexável quando o JS falha)
    if (this.cenas.length > 1) {
      this.miniaturas = document.createElement('div');
      this.miniaturas.className = 't360-cenas';
      for (var i = 0; i < this.cenas.length; i++) this.miniaturas.appendChild(this.botaoCena(this.cenas[i]));
      r.appendChild(this.miniaturas);
    }
  };

  Viewer.prototype.botaoCena = function (cena) {
    var self = this;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 't360-cena';
    b.dataset.cena = cena.id;
    b.innerHTML = '<img src="' + this.cfg.base + '/' + cena.arquivo + '-thumb.jpg" alt="" loading="lazy" width="200" height="112">' +
      '<span>' + cena.titulo + '</span>';
    b.addEventListener('click', function () { self.interagiu(); self.ir(cena.id); });
    return b;
  };

  Viewer.prototype.semWebGL = function () {
    var c = this.cenas[0];
    this.raiz.innerHTML = '<div class="t360-fallback">' +
      '<img src="' + this.cfg.base + '/' + c.arquivo + '-1024.jpg" alt="' + (c.titulo || '') + '">' +
      '<p>' + (this.txt.semWebgl || 'Seu navegador não suporta a visualização 360° interativa. A imagem acima mostra a vista panorâmica completa (esticada).') + '</p>' +
      '</div>';
  };

  // ---- WebGL ----
  Viewer.prototype.iniciarGL = function () {
    var opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
    var gl = this.canvas.getContext('webgl', opts) || this.canvas.getContext('experimental-webgl', opts);
    if (!gl) return false;
    this.gl = gl;
    try {
      var prog = gl.createProgram();
      gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      this.prog = prog;

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.u = {
        rot: gl.getUniformLocation(prog, 'uRot'),
        tan: gl.getUniformLocation(prog, 'uTanHalfFov'),
        aspect: gl.getUniformLocation(prog, 'uAspect'),
        mix: gl.getUniformLocation(prog, 'uMix')
      };
      gl.uniform1i(gl.getUniformLocation(prog, 'uTexA'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTexB'), 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      this.texA = this.texturaVazia();
      this.texB = this.texturaVazia();
      this.redimensionar();
      var self = this;
      this._onResize = function () { self.redimensionar(); };
      window.addEventListener('resize', this._onResize);
      window.addEventListener('orientationchange', this._onResize);
      this.canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
      return true;
    } catch (e) { return false; }
  };

  // Textura 1x1 cinza-carvão: evita o "flash branco" antes da primeira foto.
  Viewer.prototype.texturaVazia = function () {
    var gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([26, 28, 30]));
    return tex;
  };

  // Sobe a imagem para a GPU. REPEAT no eixo horizontal (o panorama dá a volta,
  // então a emenda em u=0/1 fica invisível) e CLAMP no vertical (polos).
  // Sem mipmap de propósito: a derivada de u salta na emenda e o mipmap
  // transformaria isso numa faixa borrada vertical no meio da cena.
  Viewer.prototype.subirTextura = function (tex, img) {
    var gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  };

  Viewer.prototype.redimensionar = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  };

  // ---- carregamento de cena ----
  Viewer.prototype.carregarImagem = function (url) {
    return new Promise(function (ok, falha) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { ok(img); };
      img.onerror = function () { falha(new Error(url)); };
      img.src = url;
    });
  };

  Viewer.prototype.ir = function (id, primeira) {
    var cena = this.porId[id];
    if (!cena || cena === this.cenaAtual) return;
    var self = this;
    var anterior = this.cenaAtual;
    this.cenaAtual = cena;
    this.token = (this.token || 0) + 1;
    var meu = this.token;

    // Vista inicial da cena (o Augusto define no manifesto qual ângulo abre).
    var v = cena.vistaInicial || {};
    this.yaw = (v.yaw || 0) * RAD;
    this.pitch = (v.pitch || 0) * RAD;
    this.fov = v.fov || 75;
    this.velYaw = this.velPitch = 0;

    this.rotulo.textContent = (cena.casa ? cena.casa + ' · ' : '') + cena.titulo;
    var hub = this.hubs[cena.casa];
    if (this.btnVoltar) this.btnVoltar.hidden = !hub || hub === cena.id;
    this.marcarCenaAtiva(id);
    this.desenharHotspots(cena);
    this.carregando.hidden = false;

    var larguras = cena.larguras && cena.larguras.length ? cena.larguras : [1024];
    var alvo = larguraIdeal(larguras);
    var urlPreview = this.cfg.base + '/' + cena.arquivo + '-1024.jpg';
    var urlAlvo = this.cfg.base + '/' + cena.arquivo + '-' + alvo + '.jpg';

    // Passo 1: preview leve entra imediatamente (com crossfade se veio de outra cena).
    // Passo 2: a versão cheia substitui em silêncio quando chega.
    var entrar = function (img, comFade) {
      if (self.destruido || meu !== self.token) return;
      if (comFade && anterior) {
        self.subirTextura(self.texB, img);
        self.mix = 0; self.mixAlvo = 1;
      } else {
        self.subirTextura(self.texA, img);
        self.mix = 0; self.mixAlvo = 0;
      }
      self.carregando.hidden = true;
    };

    this.carregarImagem(urlPreview).then(function (img) {
      entrar(img, !primeira);
      if (urlAlvo === urlPreview) return null;
      return self.carregarImagem(urlAlvo);
    }).then(function (img) {
      if (!img || self.destruido || meu !== self.token) return;
      // A versão cheia sempre vai para o slot A e zera o mix — assim o crossfade
      // já terminou e não sobra estado pendente entre trocas rápidas de cena.
      self.subirTextura(self.texA, img);
      self.mix = 0; self.mixAlvo = 0;
    }).catch(function () {
      if (self.destruido || meu !== self.token) return;
      self.carregando.innerHTML = self.txt.erro || 'Não foi possível carregar esta vista.';
    });

    // Deep link: /tour.html?cena=<id> — permite mandar a cena exata no WhatsApp.
    if (!primeira && window.history && history.replaceState) {
      try {
        var u = new URL(location.href);
        u.searchParams.set('cena', id);
        history.replaceState(null, '', u.toString());
      } catch (e) { /* URL antiga: segue sem deep link */ }
    }
    if (typeof gtag === 'function') gtag('event', 'tour360_cena', { cena: id, imovel: cena.imovel || '' });
  };

  Viewer.prototype.marcarCenaAtiva = function (id) {
    if (!this.miniaturas) return;
    var bs = this.miniaturas.querySelectorAll('.t360-cena');
    for (var i = 0; i < bs.length; i++) {
      var ativo = bs[i].dataset.cena === id;
      bs[i].classList.toggle('t360-cena-on', ativo);
      bs[i].setAttribute('aria-current', ativo ? 'true' : 'false');
    }
  };

  // ---- hotspots ----
  Viewer.prototype.desenharHotspots = function (cena) {
    var self = this;
    this.camadaHotspots.innerHTML = '';
    this.hotspots = [];
    var lista = cena.hotspots || [];
    for (var i = 0; i < lista.length; i++) {
      (function (h) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 't360-hs' + (h.tipo === 'info' ? ' t360-hs-info' : '');
        b.innerHTML = '<span class="t360-hs-icone" aria-hidden="true">' + (h.tipo === 'info' ? 'i' : '&#8599;') + '</span>' +
          '<span class="t360-hs-txt">' + h.texto + '</span>';
        b.title = h.texto;
        b.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          self.interagiu();
          if (h.tipo !== 'info' && h.destino) self.ir(h.destino);
        });
        self.camadaHotspots.appendChild(b);
        self.hotspots.push({ el: b, dir: direcao((h.yaw || 0) * RAD, (h.pitch || 0) * RAD) });
      })(lista[i]);
    }
  };

  Viewer.prototype.posicionarHotspots = function () {
    if (!this.hotspots || !this.hotspots.length) return;
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    var aspect = w / h, tan = Math.tan(this.fov * RAD / 2);
    var m = this.rot; // matriz da câmera (coluna); a transposta leva mundo -> câmera
    for (var i = 0; i < this.hotspots.length; i++) {
      var hs = this.hotspots[i], d = hs.dir;
      var cx = m[0] * d[0] + m[1] * d[1] + m[2] * d[2];
      var cy = m[3] * d[0] + m[4] * d[1] + m[5] * d[2];
      var cz = m[6] * d[0] + m[7] * d[1] + m[8] * d[2];
      if (cz >= -0.02) { hs.el.style.display = 'none'; continue; }   // atrás da câmera
      var x = (cx / -cz) / (tan * aspect), y = (cy / -cz) / tan;
      if (x < -1.4 || x > 1.4 || y < -1.4 || y > 1.4) { hs.el.style.display = 'none'; continue; }
      hs.el.style.display = '';
      hs.el.style.transform = 'translate(-50%,-50%) translate(' + ((x * 0.5 + 0.5) * w) + 'px,' + ((0.5 - y * 0.5) * h) + 'px)';
    }
  };

  // ---- controles ----
  Viewer.prototype.interagiu = function () {
    if (this.autoRotate) {
      this.autoRotate = false;
      if (this.btnAuto) this.btnAuto.classList.remove('t360-btn-on');
    }
    if (this.dica && !this.dica.hidden) this.dica.hidden = true;
  };

  Viewer.prototype.zoom = function (delta) {
    this.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, this.fov + delta));
  };

  Viewer.prototype.ligarControles = function () {
    var self = this, c = this.canvas;
    var arrastando = false, ultimoX = 0, ultimoY = 0, ponteiros = {}, distPinca = 0, fovPinca = 0;

    function fator() { return (self.fov * RAD) / Math.max(1, c.clientHeight); }

    function iniciar(e) {
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
      ponteiros[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(ponteiros);
      if (ids.length === 1) { arrastando = true; ultimoX = e.clientX; ultimoY = e.clientY; self.velYaw = self.velPitch = 0; c.classList.add('t360-arrastando'); }
      if (ids.length === 2) {
        arrastando = false;
        distPinca = distancia(ponteiros[ids[0]], ponteiros[ids[1]]);
        fovPinca = self.fov;
      }
      self.interagiu();
    }
    function distancia(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

    function mover(e) {
      if (!ponteiros[e.pointerId]) return;
      ponteiros[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(ponteiros);
      if (ids.length >= 2) {
        var d = distancia(ponteiros[ids[0]], ponteiros[ids[1]]);
        if (distPinca > 0) self.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, fovPinca * distPinca / d));
        return;
      }
      if (!arrastando) return;
      var f = fator();
      // Sinal negativo no yaw: a cena acompanha o dedo (arrastar para a direita
      // revela o que está à esquerda), como em qualquer visualizador de panorama.
      var dYaw = -(e.clientX - ultimoX) * f, dPitch = (e.clientY - ultimoY) * f;
      ultimoX = e.clientX; ultimoY = e.clientY;
      self.yaw += dYaw;
      self.pitch = Math.max(-PITCH_MAX * RAD, Math.min(PITCH_MAX * RAD, self.pitch + dPitch));
      self.velYaw = dYaw; self.velPitch = dPitch;
      if (e.cancelable) e.preventDefault();
    }

    function terminar(e) {
      delete ponteiros[e.pointerId];
      if (!Object.keys(ponteiros).length) { arrastando = false; c.classList.remove('t360-arrastando'); }
      distPinca = 0;
    }

    c.addEventListener('pointerdown', iniciar);
    c.addEventListener('pointermove', mover, { passive: false });
    c.addEventListener('pointerup', terminar);
    c.addEventListener('pointercancel', terminar);
    c.addEventListener('pointerleave', terminar);

    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.interagiu();
      self.zoom(e.deltaY > 0 ? 4 : -4);
    }, { passive: false });

    c.addEventListener('keydown', function (e) {
      var passo = 4 * RAD, tratou = true;
      if (e.key === 'ArrowLeft') self.yaw -= passo;
      else if (e.key === 'ArrowRight') self.yaw += passo;
      else if (e.key === 'ArrowUp') self.pitch = Math.min(PITCH_MAX * RAD, self.pitch + passo);
      else if (e.key === 'ArrowDown') self.pitch = Math.max(-PITCH_MAX * RAD, self.pitch - passo);
      else if (e.key === '+' || e.key === '=') self.zoom(-5);
      else if (e.key === '-' || e.key === '_') self.zoom(5);
      else tratou = false;
      if (tratou) { e.preventDefault(); self.interagiu(); }
    });

    // Pausa o loop quando o visualizador sai da tela (economiza bateria no celular).
    if (window.IntersectionObserver) {
      this.visivel = true;
      new IntersectionObserver(function (ents) { self.visivel = ents[0].isIntersecting; }, { threshold: 0.01 }).observe(this.raiz);
    } else { this.visivel = true; }
  };

  // Giroscópio em modo RELATIVO: guarda a leitura do momento em que foi ligado e
  // aplica só as variações. Evita a briga com o referencial absoluto da bússola,
  // que muda de eixo entre retrato e paisagem e some no iOS sem HTTPS/permissão.
  Viewer.prototype.alternarGyro = function (botao) {
    var self = this;
    if (this.gyro) {
      window.removeEventListener('deviceorientation', this._onGyro);
      this.gyro = false; this._refGyro = null;
      botao.classList.remove('t360-btn-on');
      return;
    }
    var ligar = function () {
      self._refGyro = null;
      self._onGyro = function (e) {
        if (e.alpha == null) return;
        var ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
        var usaBeta = (ang === 0 || ang === 180);
        var sinal = (ang === 90 || ang === 180) ? -1 : 1;
        var inclina = usaBeta ? e.beta : e.gamma;
        if (inclina == null) return;
        var leitura = { a: e.alpha, i: inclina * sinal };
        if (!self._refGyro) {
          self._refGyro = { a: leitura.a, i: leitura.i, yaw: self.yaw, pitch: self.pitch };
          return;
        }
        var dA = leitura.a - self._refGyro.a;
        if (dA > 180) dA -= 360; else if (dA < -180) dA += 360;
        self.yaw = self._refGyro.yaw - dA * RAD;
        self.pitch = Math.max(-PITCH_MAX * RAD, Math.min(PITCH_MAX * RAD, self._refGyro.pitch + (leitura.i - self._refGyro.i) * RAD));
      };
      window.addEventListener('deviceorientation', self._onGyro);
      self.gyro = true;
      self.autoRotate = false;
      if (self.btnAuto) self.btnAuto.classList.remove('t360-btn-on');
      botao.classList.add('t360-btn-on');
    };
    // iOS 13+ exige pedir permissão dentro de um gesto do usuário (este clique).
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (r) { if (r === 'granted') ligar(); }).catch(function () {});
    } else ligar();
  };

  Viewer.prototype.telaCheia = function () {
    var el = this.raiz;
    var emTela = document.fullscreenElement || document.webkitFullscreenElement;
    if (emTela) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    else { (el.requestFullscreen || el.webkitRequestFullscreen).call(el); }
  };

  // ---- loop de render ----
  Viewer.prototype.loop = function () {
    var self = this;
    var anterior = 0;
    function quadro(ts) {
      if (self.destruido) return;
      requestAnimationFrame(quadro);
      var dt = anterior ? Math.min((ts - anterior) / 1000, 0.1) : 0.016;
      anterior = ts;
      if (!self.visivel) return;

      // Inércia depois do arrasto + giro automático de vitrine
      if (Math.abs(self.velYaw) > 1e-5 || Math.abs(self.velPitch) > 1e-5) {
        self.yaw += self.velYaw;
        self.pitch = Math.max(-PITCH_MAX * RAD, Math.min(PITCH_MAX * RAD, self.pitch + self.velPitch));
        self.velYaw *= 0.92; self.velPitch *= 0.92;
        if (Math.abs(self.velYaw) < 1e-5) self.velYaw = 0;
        if (Math.abs(self.velPitch) < 1e-5) self.velPitch = 0;
      } else if (self.autoRotate && !self.gyro) {
        self.yaw += 0.035 * dt;
      }
      if (self.mix !== self.mixAlvo) {
        self.mix += (self.mixAlvo - self.mix) * Math.min(1, dt * 4);
        if (Math.abs(self.mixAlvo - self.mix) < 0.01) {
          self.mix = self.mixAlvo;
          // Terminou o crossfade: promove B para A e volta o mix a zero.
          if (self.mix === 1) {
            var t = self.texA; self.texA = self.texB; self.texB = t;
            self.mix = self.mixAlvo = 0;
          }
        }
      }
      self.render();
    }
    requestAnimationFrame(quadro);
  };

  Viewer.prototype.render = function () {
    var gl = this.gl;
    this.redimensionar();
    matrizCamera(this.yaw, this.pitch, this.rot);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texB);
    gl.uniformMatrix3fv(this.u.rot, false, this.rot);
    gl.uniform1f(this.u.tan, Math.tan(this.fov * RAD / 2));
    gl.uniform1f(this.u.aspect, this.canvas.width / this.canvas.height);
    gl.uniform1f(this.u.mix, this.mix);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.posicionarHotspots();
  };

  // ---------------------------------------------------------------- boot
  function iniciar() {
    var cfg = window.TOUR360;
    var raiz = document.getElementById('tour360');
    if (!cfg || !raiz || !cfg.cenas || !cfg.cenas.length) return;
    // ?cena=<id> tem prioridade sobre a cena inicial do manifesto (deep link).
    try {
      var q = new URLSearchParams(location.search).get('cena');
      if (q) for (var i = 0; i < cfg.cenas.length; i++) if (cfg.cenas[i].id === q) cfg.inicial = q;
    } catch (e) { /* navegador antigo: usa a cena inicial padrão */ }
    window.__tour360 = new Viewer(raiz, cfg);
    // Modo autoria (?editor=1): carrega o editor sob demanda. O visitante comum não paga
    // por código que nunca usa, e o modo não existe sem o parâmetro na URL.
    try {
      if (new URLSearchParams(location.search).get('editor') === '1') {
        var s = document.createElement('script');
        s.src = (cfg.base || '/tour360') + '/editor.js';
        s.defer = true;
        document.body.appendChild(s);
      }
    } catch (e) { /* sem editor, o tour segue normal */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
