// =====================================================================
// Musique · Laboratório — NÚCLEO · desenho (SVG como texto).
//
// Funções PURAS que devolvem SVG. A mesma função desenha no servidor (a
// página chega pronta, indexável e útil mesmo sem JavaScript) e no
// navegador (quando o estado muda). Uma geometria só — e testada.
//
// Acessibilidade: todo desenho tem <title> e descrição textual; a cor
// nunca é a única pista (a fundamental ganha forma própria: quadrado no
// braço, losango no piano; a nota fora da escala, tracejado).
// Tudo o que vem de fora passa por `esc` — o SVG vai para innerHTML.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'), require('./pauta'));
  else { var L = raiz.MusiqueLab = raiz.MusiqueLab || {}; L.desenho = fabrica(L.notas, L.pauta); }
})(typeof self !== 'undefined' ? self : this, function (N, P) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { return Math.round(Number(v) * 10) / 10; }
  var BRANCAS = { 0: 1, 2: 1, 4: 1, 5: 1, 7: 1, 9: 1, 11: 1 };

  function raizSvg(classe, largura, altura, titulo, desc, interativo, corpo, escala) {
    var k = escala || 1;
    var id = 'd' + Math.abs(hash(titulo + desc)).toString(36);
    return '<svg xmlns="http://www.w3.org/2000/svg" class="lab-svg ' + classe + '" viewBox="0 0 ' + num(largura) + ' ' + num(altura) + '" width="' + num(largura * k) + '" height="' + num(altura * k) + '"'
      + (interativo ? ' role="group"' : ' role="img"') + ' aria-labelledby="' + id + 't ' + id + 'd">'
      + '<title id="' + id + 't">' + esc(titulo) + '</title><desc id="' + id + 'd">' + esc(desc) + '</desc>' + corpo + '</svg>';
  }
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  // -------------------------------------------------------------------
  // Piano
  // -------------------------------------------------------------------
  /**
   * o.de / o.ate: MIDI (ajustados para começar e terminar em tecla
   * branca). o.destaques: { midi: { rotulo, tipo } } — tipo: raiz | nota |
   * certo | errado | fora. o.porClasse: { pc: { rotulo, tipo } } destaca
   * todas as oitavas. o.rotulos: 'nenhum' | 'dos' (só as destacadas) |
   * 'todas'. o.interativo: teclas focáveis (role=button).
   */
  function piano(o) {
    o = o || {};
    var de = o.de == null ? 48 : o.de, ate = o.ate == null ? 72 : o.ate;
    while (!BRANCAS[N.mod(de, 12)]) de--;
    while (!BRANCAS[N.mod(ate, 12)]) ate++;
    var W = 28, H = 132, BW = 17, BH = 84;
    var brancas = [], pretas = [], x = 0, xs = {};
    for (var m = de; m <= ate; m++) {
      if (BRANCAS[N.mod(m, 12)]) { xs[m] = x; brancas.push(m); x += W; }
      else { xs[m] = x - BW / 2; pretas.push(m); }
    }
    var largura = x + 2;
    var dest = o.destaques || {}, porC = o.porClasse || {};
    var rot = o.rotulos || 'dos';
    var marcadas = [];
    function info(m) { return dest[m] || porC[N.mod(m, 12)] || null; }
    function tecla(m, preta) {
      var d = info(m);
      var n = N.deMidi(m, { bemol: !!o.bemol });
      var nomeAcess = N.nome(n, { notacao: 'extenso' });
      var cls = 'k ' + (preta ? 'k-p' : 'k-b') + (d ? ' on on-' + esc(d.tipo || 'nota') : '');
      if (d) marcadas.push((d.rotulo || N.nome(n, { notacao: 'pt', glifo: true })) + (d.tipo === 'raiz' ? ' (fundamental)' : ''));
      var r = '<rect class="' + cls + '" data-midi="' + m + '" x="' + num(xs[m] + (preta ? 0 : 1)) + '" y="1" width="' + (preta ? BW : W - 1)
        + '" height="' + (preta ? BH : H - 2) + '" rx="' + (preta ? 2.5 : 4) + '"'
        + (o.interativo ? ' tabindex="0" role="button" aria-label="' + esc(nomeAcess + (d ? ', marcada' : '')) + '"' : '') + '></rect>';
      var cx = xs[m] + (preta ? BW / 2 : W / 2 + 0.5);
      var txt = d && d.rotulo != null ? d.rotulo : (rot === 'todas' || (rot === 'dos' && d)) ? N.nome(n, { notacao: o.notacao === 'cifra' ? 'cifra' : 'pt', glifo: true, oitava: false }) : '';
      if (d && d.tipo === 'raiz') r += '<path class="k-marca" d="M' + num(cx) + ' ' + (preta ? BH - 34 : H - 44) + 'l5 5-5 5-5-5z"></path>';
      if (txt) r += '<text class="k-t' + (preta ? ' k-tp' : '') + '" x="' + num(cx) + '" y="' + (preta ? BH - 9 : H - 12) + '" text-anchor="middle">' + esc(txt) + '</text>';
      return r;
    }
    var corpo = brancas.map(function (m) { return tecla(m, false); }).join('') + pretas.map(function (m) { return tecla(m, true); }).join('');
    var titulo = o.titulo || 'Teclado';
    var desc = marcadas.length ? 'Teclas marcadas: ' + marcadas.join(', ') + '.' : 'Nenhuma tecla marcada.';
    return raizSvg('lab-piano', largura, H, titulo, desc, o.interativo, corpo, o.escala || 1.25);
  }

  // -------------------------------------------------------------------
  // Pauta
  // -------------------------------------------------------------------
  /**
   * o.clave: sol | fa | do3 | do4. o.notas: [{ nota, rotulo, tipo }]
   * (nota com oitava). o.acorde: empilha todas no mesmo tempo.
   * o.armadura: quantidade (+ sustenidos, − bemóis). o.figura: glifo de
   * figura em vez de cabeça (reservado).
   */
  function pauta(o) {
    o = o || {};
    var clave = o.clave || 'sol';
    var S = 10, H2 = S / 2;
    var itens = (o.notas || []).map(function (x) { var n = N.ler(x.nota || x); var p = n ? P.posicao(n, clave) : null; return p ? { n: n, p: p, rotulo: x.rotulo, tipo: x.tipo } : null; }).filter(Boolean);
    var ps = itens.map(function (x) { return x.p.posicao; });
    var pmax = Math.max.apply(null, [8].concat(ps)), pmin = Math.min.apply(null, [0].concat(ps));
    var topo = 14 + (pmax - 8) * H2 + 12;
    var yLinha = function (pos) { return topo + (8 - pos) * H2; };
    var arm = o.armadura ? (P.armadura(o.armadura, clave) || []) : [];
    var xNotas = 52 + arm.length * 10 + 14;
    var passoX = o.acorde ? 0 : 38;
    var largura = Math.max(o.largura || 0, xNotas + (o.acorde ? 60 : Math.max(1, itens.length) * passoX + 20));
    var temRot = itens.some(function (x) { return x.rotulo; });
    var altura = yLinha(pmin) + 22 + (temRot ? 18 : 0);
    var c = '';
    for (var l = 0; l <= 8; l += 2) c += '<line class="p-linha" x1="4" x2="' + num(largura - 4) + '" y1="' + num(yLinha(l)) + '" y2="' + num(yLinha(l)) + '"></line>';
    var cl = P.clave(clave);
    // O glifo da clave (fonte Noto Music) é ancorado na linha de referência.
    var refPos = { sol: 2, fa: 6, do3: 4, do4: 6 }[clave];
    c += claveSvg(clave, 10, yLinha(refPos));
    arm.forEach(function (a, i) { c += acidenteSvg(a.glifo === '♯' ? 1 : -1, 52 + i * 10, yLinha(a.posicao)); });
    var descr = [];
    var ultimoPos = null;
    itens.forEach(function (it, i) {
      var x = xNotas + i * passoX + 14;
      if (o.acorde && ultimoPos != null && it.p.posicao - ultimoPos === 1) x += 13;   // segunda no acorde: cabeça ao lado
      ultimoPos = it.p.posicao;
      var y = yLinha(it.p.posicao);
      it.p.suplementares.forEach(function (sp) { c += '<line class="p-sup" x1="' + num(x - 11) + '" x2="' + num(x + 11) + '" y1="' + num(yLinha(sp)) + '" y2="' + num(yLinha(sp)) + '"></line>'; });
      if (it.p.acidente) c += acidenteSvg(it.p.acidente, x - (it.p.acidente === -2 ? 19 : 16), y);
      c += '<ellipse class="p-nota' + (it.tipo ? ' on-' + esc(it.tipo) : '') + '" cx="' + num(x) + '" cy="' + num(y) + '" rx="6.6" ry="4.7" transform="rotate(-18 ' + num(x) + ' ' + num(y) + ')"></ellipse>';
      if (it.tipo === 'raiz') c += '<rect class="p-marca" x="' + num(x - 2) + '" y="' + num(yLinha(pmin) + 6) + '" width="4" height="4"></rect>';
      if (it.rotulo) c += '<text class="p-rot" x="' + num(x) + '" y="' + num(altura - 6) + '" text-anchor="middle">' + esc(it.rotulo) + '</text>';
      descr.push(N.nome(it.n, { notacao: 'extenso' }) + ' (' + P.nomeDaPosicao(it.p.posicao) + ')');
    });
    var titulo = o.titulo || ('Pauta em ' + cl.nome);
    var desc = cl.nome + (arm.length ? ', armadura com ' + arm.length + (o.armadura > 0 ? ' sustenido(s)' : ' bemol(is)') : '')
      + (descr.length ? '. Notas: ' + descr.join('; ') + '.' : '.');
    return raizSvg('lab-pauta', largura, altura, titulo, desc, false, c, o.escala || 1.8);
  }

  // -------------------------------------------------------------------
  // Braço (violão, guitarra, baixo, ukulele, cavaquinho)
  // -------------------------------------------------------------------
  /**
   * o.afinacao: { notas, midi } (de instrumentos.afinacao). o.casas.
   * o.destaques: [{ corda, casa, rotulo, tipo }]. o.canhoto espelha.
   * o.interativo: células clicáveis/focáveis com data-corda/data-casa.
   * Corda mais grave EMBAIXO (é como o músico vê o braço no colo).
   */
  function braco(o) {
    o = o || {};
    var af = o.afinacao; if (!af) return '';
    var nC = af.midi.length, casas = o.casas || 12;
    var FW = 46, SS = 24, esq = 40, topo = 16;
    var largura = esq + casas * FW + 16, alturaC = (nC - 1) * SS, altura = topo + alturaC + 36;
    var X = function (x) { return o.canhoto ? largura - x : x; };
    var yC = function (c) { return topo + (nC - 1 - c) * SS; };
    var c = '';
    // marcações de casa
    [3, 5, 7, 9, 15, 17, 19, 21].forEach(function (k) { if (k <= casas) c += '<circle class="b-inlay" cx="' + num(X(esq + (k - 0.5) * FW)) + '" cy="' + num(topo + alturaC / 2) + '" r="4.5"></circle>'; });
    if (casas >= 12) { c += '<circle class="b-inlay" cx="' + num(X(esq + 11.5 * FW)) + '" cy="' + num(topo + alturaC / 2 - SS) + '" r="4.5"></circle><circle class="b-inlay" cx="' + num(X(esq + 11.5 * FW)) + '" cy="' + num(topo + alturaC / 2 + SS) + '" r="4.5"></circle>'; }
    for (var k = 0; k <= casas; k++) {
      c += '<line class="' + (k === 0 ? 'b-pestana' : 'b-traste') + '" x1="' + num(X(esq + k * FW)) + '" x2="' + num(X(esq + k * FW)) + '" y1="' + topo + '" y2="' + (topo + alturaC) + '"></line>';
      if (k > 0 && (k <= 5 || k % 2 === 1 || k === 12)) c += '<text class="b-num" x="' + num(X(esq + (k - 0.5) * FW)) + '" y="' + (topo + alturaC + 26) + '" text-anchor="middle">' + k + '</text>';
    }
    for (var s = 0; s < nC; s++) {
      c += '<line class="b-corda" style="stroke-width:' + num(0.8 + (nC - 1 - s) * 0.28) + '" x1="' + num(X(esq)) + '" x2="' + num(X(esq + casas * FW)) + '" y1="' + yC(s) + '" y2="' + yC(s) + '"></line>';
      c += '<text class="b-nome" x="' + num(X(14)) + '" y="' + (yC(s) + 4) + '" text-anchor="middle">' + esc(N.nome(af.notas[s], { notacao: o.notacao === 'cifra' ? 'cifra' : 'pt', glifo: true, oitava: false })) + '</text>';
    }
    if (o.interativo) {
      for (var cc = 0; cc < nC; cc++) for (var kk = 0; kk <= casas; kk++) {
        var cx0 = kk === 0 ? esq - 22 : esq + (kk - 1) * FW;
        var w0 = kk === 0 ? 20 : FW;
        var xr = o.canhoto ? largura - cx0 - w0 : cx0;
        var mm = af.midi[cc] + kk;
        c += '<rect class="b-cel" data-corda="' + cc + '" data-casa="' + kk + '" data-midi="' + mm + '" x="' + num(xr) + '" y="' + (yC(cc) - SS / 2) + '" width="' + w0 + '" height="' + SS + '" tabindex="-1"></rect>';
      }
    }
    var descr = [];
    (o.destaques || []).forEach(function (d) {
      var cx = d.casa === 0 ? esq - 12 : esq + (d.casa - 0.5) * FW;
      var y = yC(d.corda), xx = X(cx);
      var cls = 'b-pt on-' + esc(d.tipo || 'nota');
      if (d.tipo === 'raiz') c += '<rect class="' + cls + '" x="' + num(xx - 9.5) + '" y="' + (y - 9.5) + '" width="19" height="19" rx="4"></rect>';
      else c += '<circle class="' + cls + '" cx="' + num(xx) + '" cy="' + y + '" r="9.5"></circle>';
      if (d.rotulo) c += '<text class="b-rot" x="' + num(xx) + '" y="' + (y + 3.6) + '" text-anchor="middle">' + esc(d.rotulo) + '</text>';
      descr.push('corda ' + (nC - d.corda) + ', ' + (d.casa === 0 ? 'solta' : 'casa ' + d.casa) + (d.rotulo ? ' (' + d.rotulo + ')' : ''));
    });
    var titulo = o.titulo || 'Braço do instrumento';
    var desc = 'Afinação ' + af.notas.map(function (n) { return N.nome(n, { notacao: 'pt', oitava: false }); }).join(' ') + (o.canhoto ? ', vista de canhoto' : '')
      + '. ' + (descr.length ? 'Marcadas: ' + descr.slice(0, 60).join('; ') + (descr.length > 60 ? '…' : '') + '.' : 'Nenhuma posição marcada.');
    return raizSvg('lab-braco', largura, altura, titulo, desc, o.interativo, c, o.escala || 1.2);
  }

  // -------------------------------------------------------------------
  // Círculos (quintas, cromático, anel genérico)
  // -------------------------------------------------------------------
  function ponto(cx, cy, r, ang) { var a = (ang - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }

  /**
   * Anel genérico: o.itens [{ rotulo, sub, tipo, dado }] em volta; o.interno
   * (opcional) segundo anel. o.poligono: índices ligados por linha (para
   * o relógio de classes de altura). o.centro: texto do meio.
   */
  function anel(o) {
    o = o || {};
    var T = 340, cx = T / 2, cy = T / 2, R1 = 138, R2 = 92;
    var c = '<circle class="c-aro" cx="' + cx + '" cy="' + cy + '" r="' + R1 + '"></circle>';
    if (o.interno) c += '<circle class="c-aro" cx="' + cx + '" cy="' + cy + '" r="' + R2 + '"></circle>';
    var n = o.itens.length;
    if (o.poligono && o.poligono.length > 1) {
      var pts = o.poligono.map(function (i) { return ponto(cx, cy, R1, i * 360 / n).map(num).join(','); }).join(' ');
      c += '<polygon class="c-poli" points="' + pts + '"></polygon>';
    }
    var descr = [];
    function nos(lista, R, rr, cls) {
      lista.forEach(function (it, i) {
        var p = ponto(cx, cy, R, i * 360 / lista.length);
        c += '<g class="c-no ' + cls + (it.tipo ? ' on-' + esc(it.tipo) : '') + '"' + (it.dado != null ? ' data-i="' + esc(it.dado) + '" tabindex="0" role="button" aria-label="' + esc(it.acessivel || it.rotulo) + '"' : '') + '>'
          + '<circle cx="' + num(p[0]) + '" cy="' + num(p[1]) + '" r="' + rr + '"></circle>'
          + '<text x="' + num(p[0]) + '" y="' + num(p[1] + (it.sub ? 0 : 4.5)) + '" text-anchor="middle">' + esc(it.rotulo) + '</text>'
          + (it.sub ? '<text class="c-sub" x="' + num(p[0]) + '" y="' + num(p[1] + 11) + '" text-anchor="middle">' + esc(it.sub) + '</text>' : '') + '</g>';
        if (it.tipo) descr.push(it.acessivel || it.rotulo);
      });
    }
    nos(o.itens, R1, 22, 'c-ext');
    if (o.interno) nos(o.interno, R2, 17, 'c-int');
    if (o.centro) c += '<text class="c-centro" x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle">' + esc(o.centro) + '</text>';
    var desc = (o.descricao || '') + (descr.length ? ' Em destaque: ' + descr.join(', ') + '.' : '');
    return raizSvg('lab-circulo', T, T, o.titulo || 'Círculo', desc, !!o.interativo, c);
  }


  // -------------------------------------------------------------------
  // Glifos DESENHADOS (sem fonte externa: a fonte de símbolos musicais
  // pode não carregar — rede lenta, bloqueio — e a clave sairia como
  // quadradinho). Coordenadas em espaços de pauta (S = 10).
  // -------------------------------------------------------------------
  function f2(x, y) { return num(x) + ' ' + num(y); }
  /** Clave desenhada. `yRef`: a linha que a clave define (sol, fá ou dó). */
  function claveSvg(clave, x, yRef) {
    if (clave === 'sol') {
      var y = yRef;
      return '<g class="p-clave-g"><path class="p-traco" d="M' + f2(x + 13, y + 3) + ' C' + f2(x + 6, y + 4) + ' ' + f2(x + 5, y - 6) + ' ' + f2(x + 11, y - 7)
        + ' C' + f2(x + 19, y - 8) + ' ' + f2(x + 21, y + 7) + ' ' + f2(x + 12, y + 9)
        + ' C' + f2(x + 1, y + 11) + ' ' + f2(x - 1, y - 4) + ' ' + f2(x + 6, y - 12)
        + ' C' + f2(x + 13, y - 20) + ' ' + f2(x + 19, y - 30) + ' ' + f2(x + 15, y - 38)
        + ' C' + f2(x + 12, y - 44) + ' ' + f2(x + 6, y - 38) + ' ' + f2(x + 8, y - 29)
        + ' L' + f2(x + 14, y + 17) + ' C' + f2(x + 15, y + 23) + ' ' + f2(x + 7, y + 25) + ' ' + f2(x + 5, y + 19) + '"></path>'
        + '<circle class="p-cheio" cx="' + num(x + 7.5) + '" cy="' + num(y + 18) + '" r="2.8"></circle></g>';
    }
    if (clave === 'fa') {
      var yf = yRef;
      return '<g class="p-clave-g"><circle class="p-cheio" cx="' + num(x + 5) + '" cy="' + num(yf) + '" r="3.4"></circle>'
        + '<path class="p-traco grosso" d="M' + f2(x + 3, yf) + ' C' + f2(x + 3, yf - 10) + ' ' + f2(x + 21, yf - 11) + ' ' + f2(x + 21, yf + 2)
        + ' C' + f2(x + 21, yf + 14) + ' ' + f2(x + 11, yf + 22) + ' ' + f2(x + 2, yf + 26) + '"></path>'
        + '<circle class="p-cheio" cx="' + num(x + 27) + '" cy="' + num(yf - 5) + '" r="1.9"></circle><circle class="p-cheio" cx="' + num(x + 27) + '" cy="' + num(yf + 5) + '" r="1.9"></circle></g>';
    }
    var yc = yRef;
    var curva = function (sg) {
      return '<path class="p-traco grosso" d="M' + f2(x + 9, yc) + ' C' + f2(x + 12, yc - 4 * sg) + ' ' + f2(x + 17, yc - 5 * sg) + ' ' + f2(x + 17, yc - 12 * sg)
        + ' C' + f2(x + 17, yc - 19 * sg) + ' ' + f2(x + 10, yc - 21 * sg) + ' ' + f2(x + 9, yc - 16 * sg) + '"></path>';
    };
    return '<g class="p-clave-g"><rect class="p-cheio" x="' + num(x) + '" y="' + num(yc - 20) + '" width="4" height="40"></rect>'
      + '<rect class="p-cheio" x="' + num(x + 6) + '" y="' + num(yc - 20) + '" width="1.4" height="40"></rect>' + curva(1) + curva(-1) + '</g>';
  }
  /** Acidente desenhado, centrado em (x, y). alt: -2..2. */
  function acidenteSvg(alt, x, y) {
    if (alt === 1) {
      return '<g class="p-acid-g"><path class="p-traco fino" d="M' + f2(x - 2, y - 9) + ' L' + f2(x - 2, y + 10) + ' M' + f2(x + 2, y - 10) + ' L' + f2(x + 2, y + 9) + '"></path>'
        + '<path class="p-traco grosso" d="M' + f2(x - 5, y - 2) + ' L' + f2(x + 5, y - 4.5) + ' M' + f2(x - 5, y + 4.5) + ' L' + f2(x + 5, y + 2) + '"></path></g>';
    }
    if (alt === -1 || alt === -2) {
      var um = function (dx) {
        return '<path class="p-traco fino" d="M' + f2(x - 3 + dx, y - 13) + ' L' + f2(x - 3 + dx, y + 5) + ' C' + f2(x + 5 + dx, y + 1) + ' ' + f2(x + 5 + dx, y - 6) + ' ' + f2(x - 3 + dx, y - 2) + '"></path>';
      };
      return '<g class="p-acid-g">' + (alt === -2 ? um(-4) + um(3) : um(0)) + '</g>';
    }
    if (alt === 2) return '<g class="p-acid-g"><path class="p-traco grosso" d="M' + f2(x - 4, y - 4) + ' L' + f2(x + 4, y + 4) + ' M' + f2(x - 4, y + 4) + ' L' + f2(x + 4, y - 4) + '"></path></g>';
    return '';
  }

  // Figuras e pausas desenhadas (para a tabela e o exercício de ritmo).
  var BANDEIRAS = { semibreve: 0, minima: 0, seminima: 0, colcheia: 1, semicolcheia: 2, fusa: 3, semifusa: 4 };
  function figuraSvg(id, x, y, pontos) {
    var vazada = id === 'semibreve' || id === 'minima';
    var c = '<ellipse class="' + (vazada ? 'p-nota' : 'p-cheio') + '" cx="' + num(x) + '" cy="' + num(y) + '" rx="6" ry="4.4" transform="rotate(-20 ' + num(x) + ' ' + num(y) + ')"></ellipse>';
    if (id !== 'semibreve') {
      c += '<line class="p-haste" x1="' + num(x + 5.6) + '" y1="' + num(y - 1) + '" x2="' + num(x + 5.6) + '" y2="' + num(y - 32) + '"></line>';
      for (var b = 0; b < BANDEIRAS[id]; b++) c += '<path class="p-traco" d="M' + f2(x + 5.6, y - 32 + b * 6) + ' C' + f2(x + 12, y - 26 + b * 6) + ' ' + f2(x + 15, y - 20 + b * 6) + ' ' + f2(x + 11, y - 13 + b * 6) + '"></path>';
    }
    for (var p = 0; p < (pontos || 0); p++) c += '<circle class="p-cheio" cx="' + num(x + 11 + p * 5) + '" cy="' + num(y - 2) + '" r="1.7"></circle>';
    return c;
  }
  function pausaSvg(id, x, y) {
    if (id === 'semibreve') return '<rect class="p-cheio" x="' + num(x - 6) + '" y="' + num(y - 10) + '" width="12" height="5"></rect><line class="p-sup" x1="' + num(x - 9) + '" x2="' + num(x + 9) + '" y1="' + num(y - 10) + '" y2="' + num(y - 10) + '"></line>';
    if (id === 'minima') return '<rect class="p-cheio" x="' + num(x - 6) + '" y="' + num(y - 5) + '" width="12" height="5"></rect><line class="p-sup" x1="' + num(x - 9) + '" x2="' + num(x + 9) + '" y1="' + num(y) + '" y2="' + num(y) + '"></line>';
    if (id === 'seminima') return '<path class="p-traco grosso" d="M' + f2(x - 3, y - 16) + ' L' + f2(x + 3, y - 9) + ' L' + f2(x - 3, y - 3) + ' L' + f2(x + 3, y + 3) + ' C' + f2(x - 4, y + 1) + ' ' + f2(x - 4, y + 8) + ' ' + f2(x + 1, y + 10) + '"></path>';
    var n = BANDEIRAS[id] || 1, c = '';
    c += '<line class="p-traco" x1="' + num(x + 4) + '" y1="' + num(y - 12) + '" x2="' + num(x - 2 - n) + '" y2="' + num(y + 6 + n * 3) + '"></line>';
    for (var k = 0; k < n; k++) c += '<circle class="p-cheio" cx="' + num(x - 3 + k * 1.5) + '" cy="' + num(y - 11 + k * 6) + '" r="2.2"></circle><path class="p-traco" d="M' + f2(x - 3 + k * 1.5, y - 11 + k * 6) + ' Q' + f2(x + 1, y - 7 + k * 6) + ' ' + f2(x + 4 - k * 1, y - 12 + k * 6) + '"></path>';
    return c;
  }
  /** Uma figura (ou pausa) isolada, como SVG pequeno. */
  function figura(o) {
    o = o || {};
    var corpo = o.pausa ? pausaSvg(o.id, 16, 26) : figuraSvg(o.id, 12, 38, o.pontos);
    return raizSvg('lab-pauta lab-fig-mini', 36, 48, (o.pausa ? 'Pausa de ' : '') + (o.nome || o.id), o.nome || o.id, false, corpo, 1.2);
  }
  /** Compasso de ritmo: fórmula + figuras + um espaço "?" a completar. */
  function ritmo(o) {
    o = o || {};
    var y = 40, x = 16, c = '';
    var largura = 60 + (o.figuras || []).length * 34 + 40;
    for (var l = 0; l < 5; l++) c += '<line class="p-linha" x1="4" x2="' + largura + '" y1="' + (20 + l * 10) + '" y2="' + (20 + l * 10) + '"></line>';
    var comp = String(o.compasso || '4/4').split('/');
    c += '<text class="p-formula" x="' + x + '" y="38" text-anchor="middle">' + esc(comp[0]) + '</text><text class="p-formula" x="' + x + '" y="58" text-anchor="middle">' + esc(comp[1]) + '</text>';
    var xx = 46;
    (o.figuras || []).forEach(function (f) { c += f.pausa ? pausaSvg(f.figura, xx, y) : figuraSvg(f.figura, xx, y + 5, f.pontos); xx += 34; });
    c += '<rect class="p-falta" x="' + (xx - 8) + '" y="18" width="28" height="44" rx="4"></rect><text class="p-falta-t" x="' + (xx + 6) + '" y="46" text-anchor="middle">?</text>';
    c += '<line class="p-barra" x1="' + (xx + 30) + '" x2="' + (xx + 30) + '" y1="20" y2="60"></line>';
    return raizSvg('lab-pauta lab-ritmo', xx + 40, 80, 'Compasso ' + (o.compasso || ''), o.descricao || 'Compasso incompleto', false, c, 1.6);
  }

  return { esc: esc, piano: piano, pauta: pauta, braco: braco, anel: anel, figura: figura, ritmo: ritmo, claveSvg: claveSvg, acidenteSvg: acidenteSvg };
});
