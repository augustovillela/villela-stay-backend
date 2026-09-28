// =====================================================================
// Musique Cifras — CLIENTE · renderização: a VISÃO (tom, capotraste,
// simplificação, grafia) calculada NO APARELHO com o mesmo motor do
// servidor, a cifra desenhada com o acorde em cima da sílaba, e os
// diagramas de cada instrumento.
//
// Transpor é instantâneo porque não há rede no caminho: o documento já
// está no aparelho, e o motor roda aqui.
// =====================================================================
(function (global) {
  'use strict';
  var C = global.MusiqueCifras;
  var M = C.M, el = C.el, esc = C.esc;
  var R = C.R = {};

  // ---------------------------------------------------------------
  // Visão: documento cru → documento que o músico vai ler
  // ---------------------------------------------------------------
  /**
   * v = { semitons, tom (destino), capo, simplificacao, grafia, estilo }
   * Devolve { doc, tom_soando, tom_formas, semitons }.
   */
  R.aplicarVisao = function (doc, v) {
    v = v || {};
    var D = M.documento;
    var semi = Number(v.semitons) || 0;
    if (v.tom) { var x = D.semitonsAte(doc, v.tom); if (x !== null) semi += x; }
    var op = { preferencia: v.grafia || 'auto' };
    var d = semi ? D.transpor(doc, semi, op) : doc;
    if (v.simplificacao) d = D.simplificar(d, v.simplificacao).documento;
    var soando = D.tomDe(d);
    var capo = Number(v.capo) || 0;
    if (capo > 0) d = D.comCapotraste(d, capo, op).documento;
    if (v.estilo && v.estilo !== 'original') d = D.normalizarGrafia(d, v.estilo);
    var formas = D.tomDe(d);
    return { doc: d, semitons: semi, tom_soando: soando.tom ? M.nota.escreverTom(soando.tom) : '', tom_estimado: soando.estimado,
      tom_formas: formas.tom ? M.nota.escreverTom(formas.tom) : '', capo: capo };
  };

  // ---------------------------------------------------------------
  // Cifra
  // ---------------------------------------------------------------
  /**
   * Desenha o documento. o = { modo, graus, familia, fonte, espacamento,
   * colunas, tema, ocultacao, comentarios (Set de linha_id), secaoAtual,
   * aoClicarAcorde(acorde, linha) }
   */
  R.cifra = function (doc, o) {
    o = o || {};
    var box = el('div', { class: 'cf-doc ' + (o.familia || 'mono') + ' t-' + (o.tema || 'claro')
      + (o.colunas > 1 ? ' col' + o.colunas : '') + (o.modo === 'letra' ? ' so-letra' : '') + (o.modo === 'acordes' ? ' so-acordes' : '') });
    box.style.setProperty('--cf-fonte', (o.fonte || 18) + 'px');
    box.style.setProperty('--cf-esp', String(o.espacamento || 1.35));
    if (o.largura && o.largura < 100) box.style.maxWidth = o.largura + '%';
    if (o.modo === 'mapa') { box.appendChild(R.mapa(doc)); return box; }
    var latina = doc.meta && doc.meta.notacao === 'latina';
    var tomDoc = M.documento.tomDe(doc).tom;
    var nLinha = 0;
    doc.secoes.forEach(function (s) {
      var sec = el('div', { class: 'cf-secao' + (o.secaoAtual === s.id ? ' atual' : ''), 'data-secao': s.id });
      if (s.tipo !== 'sem_secao' || s.tom) {
        var rot = el('div', { class: 'cf-secao-rot' });
        rot.appendChild(el('span', { txt: (s.rotulo || M.documento.ROTULO_PADRAO[s.tipo] || '') + (s.repetir > 1 ? ' · ' + s.repetir + 'x' : '') }));
        if (s.tom) rot.appendChild(el('span', { class: 'tom', txt: 'modula para ' + s.tom }));
        sec.appendChild(rot);
      }
      var tomSec = s.tom ? M.nota.lerTom(s.tom) : tomDoc;
      s.linhas.forEach(function (l) {
        if (l.tipo === 'vazia') { sec.appendChild(el('div', { class: 'cf-v' })); return; }
        if (l.tipo === 'comentario') { sec.appendChild(el('div', { class: 'cf-coment', txt: l.texto })); return; }
        if (l.tipo === 'instrucao') { sec.appendChild(el('div', { class: 'cf-ins', txt: '(' + l.texto.replace(/^\(|\)$/g, '') + ')' })); return; }
        if (l.tipo === 'tab') { if (o.modo !== 'letra') sec.appendChild(el('div', { class: 'cf-tab', txt: l.texto })); return; }
        if (l.tipo !== 'letra') return;
        nLinha++;
        var so = M.documento.soAcordes(l);
        if (o.modo === 'letra' && so) return;
        var linha = el('div', { class: 'cf-l', 'data-linha': l.id });
        if (o.comentarios && o.comentarios.has(l.id)) linha.classList.add('cf-ancora-com');
        var ocultarAcordes = o.ocultacao >= 2 || (o.ocultacao === 1 && nLinha % 2 === 0);
        var ocultarLetra = o.ocultacao >= 3 && nLinha % 2 === 1 && !so;
        l.segmentos.forEach(function (sg) {
          var par = el('span', { class: 'cf-p' });
          var ac = el('span', { class: 'cf-a' + (ocultarAcordes ? ' oculto' : '') });
          if (sg.acorde) {
            var lido = M.acorde.ler(sg.acorde, { latina: latina });
            ac.textContent = sg.acorde;
            if (!lido || !lido.reconhecido) { ac.classList.add('nr'); ac.title = 'Acorde que o motor não reconhece: confira.'; }
            if (o.graus && tomSec && lido) {
              var g = M.harmonia.grau(lido, tomSec, { sistema: o.graus });
              if (g) ac.appendChild(el('span', { class: 'g', txt: g.texto }));
            }
            if (o.aoClicarAcorde) { ac.style.cursor = 'pointer'; ac.onclick = function () { o.aoClicarAcorde(sg.acorde, l); }; }
          }
          par.appendChild(ac);
          par.appendChild(el('span', { class: 'cf-t' + (ocultarLetra ? ' oculto' : ''), txt: sg.texto || (sg.acorde ? ' ' : '') }));
          linha.appendChild(par);
        });
        sec.appendChild(linha);
      });
      box.appendChild(sec);
    });
    return box;
  };

  R.mapa = function (doc) {
    var d = el('div', { class: 'cf-mapa' });
    M.documento.mapa(doc).forEach(function (s) {
      var x = el('div');
      x.appendChild(el('b', { txt: (s.rotulo || 'Parte') + (s.repetir > 1 ? ' ' + s.repetir + 'x' : '') }));
      x.appendChild(el('span', { txt: s.acordes.join('  ') || '—' }));
      d.appendChild(x);
    });
    return d;
  };

  // ---------------------------------------------------------------
  // Diagramas
  // ---------------------------------------------------------------
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, at, filhos) {
    var n = document.createElementNS(NS, tag);
    Object.keys(at || {}).forEach(function (k) { n.setAttribute(k, at[k]); });
    (filhos || []).forEach(function (f) { if (f) n.appendChild(f); });
    return n;
  }
  function texto(x, y, t, at) { var n = svg('text', Object.assign({ x: x, y: y, 'text-anchor': 'middle', 'font-size': 10, 'font-family': 'Inter,sans-serif', fill: '#1F2933' }, at || {})); n.textContent = t; return n; }

  /** Diagrama de trastes (violão, guitarra, cavaquinho, ukulele). */
  R.diagramaTrastes = function (forma, cordas, o) {
    o = o || {};
    var n = forma.casas.length, W = 22 + (n - 1) * 13, H = 96, x0 = 14, y0 = 20, esp = 13, alt = 14, trastes = 5;
    var casas = o.canhoto ? forma.casas.slice().reverse() : forma.casas;
    var dedos = forma.dedos_sugeridos ? (o.canhoto ? forma.dedos_sugeridos.slice().reverse() : forma.dedos_sugeridos) : null;
    var graus = forma.graus ? (o.canhoto ? forma.graus.slice().reverse() : forma.graus) : [];
    var presas = forma.casas.filter(function (c) { return c > 0; });
    var maior = presas.length ? Math.max.apply(null, presas) : 0;
    var base = maior > trastes ? Math.min.apply(null, presas) : 1;
    var s = svg('svg', { width: W + 10, height: H, viewBox: '0 0 ' + (W + 10) + ' ' + H, role: 'img', 'aria-label': 'Diagrama: ' + forma.desenho });
    for (var t = 0; t <= trastes; t++) s.appendChild(svg('line', { x1: x0, x2: x0 + esp * (n - 1), y1: y0 + t * alt, y2: y0 + t * alt, stroke: '#5B6478', 'stroke-width': t === 0 && base === 1 ? 3 : 1 }));
    for (var c = 0; c < n; c++) s.appendChild(svg('line', { x1: x0 + c * esp, x2: x0 + c * esp, y1: y0, y2: y0 + trastes * alt, stroke: '#5B6478', 'stroke-width': 1 }));
    if (base > 1) s.appendChild(texto(x0 + esp * (n - 1) + 9, y0 + alt * 0.7, base + 'ª', { 'font-size': 9 }));
    if (forma.pestana) {
      var de = o.canhoto ? n - 1 - forma.pestana.ate : forma.pestana.de;
      var ate = o.canhoto ? n - 1 - forma.pestana.de : forma.pestana.ate;
      var yb = y0 + (forma.pestana.casa - base + 0.5) * alt;
      s.appendChild(svg('rect', { x: x0 + de * esp - 5, y: yb - 5, width: (ate - de) * esp + 10, height: 10, rx: 5, fill: '#1B2A4A' }));
    }
    casas.forEach(function (cs, i) {
      var cx = x0 + i * esp;
      if (cs < 0) s.appendChild(texto(cx, y0 - 6, '×', { 'font-size': 11, fill: '#5B6478' }));
      else if (cs === 0) s.appendChild(svg('circle', { cx: cx, cy: y0 - 9, r: 3.5, fill: 'none', stroke: graus[i] === '1' ? '#C9A227' : '#5B6478', 'stroke-width': 1.5 }));
      else {
        var cy = y0 + (cs - base + 0.5) * alt;
        var raiz = graus[i] === '1';
        var naPestana = forma.pestana && cs === forma.pestana.casa && dedos && dedos[i] === 1;
        if (!naPestana) s.appendChild(svg('circle', { cx: cx, cy: cy, r: 5.5, fill: raiz ? '#C9A227' : '#1B2A4A' }));
        else if (raiz) s.appendChild(svg('circle', { cx: cx, cy: cy, r: 3, fill: '#C9A227' }));
        if (dedos && dedos[i] && !naPestana) s.appendChild(texto(cx, cy + 3.5, String(dedos[i]), { fill: raiz ? '#1B2A4A' : '#fff', 'font-size': 8, 'font-weight': 700 }));
      }
    });
    return s;
  };

  /** Teclado (duas oitavas a partir do dó 3), com as mãos destacadas. */
  R.teclado = function (v) {
    var ini = 48, fim = 84, brancas = [];
    for (var m = ini; m < fim; m++) if ([1, 3, 6, 8, 10].indexOf(m % 12) < 0) brancas.push(m);
    var W = brancas.length * 9, H = 46;
    var s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Teclado: ' + (v.nomes_direita || []).join(' ') });
    var dir = v.mao_direita || [], esq = v.mao_esquerda || [];
    brancas.forEach(function (m, i) {
      var cor = dir.indexOf(m) >= 0 ? '#1B2A4A' : esq.indexOf(m) >= 0 ? '#C9A227' : '#fff';
      s.appendChild(svg('rect', { x: i * 9, y: 0, width: 9, height: H, fill: cor, stroke: '#9BA3B4', 'stroke-width': 0.6 }));
    });
    var xi = 0;
    for (m = ini; m < fim; m++) {
      if ([1, 3, 6, 8, 10].indexOf(m % 12) >= 0) {
        var corP = dir.indexOf(m) >= 0 ? '#3B6FD8' : esq.indexOf(m) >= 0 ? '#C9A227' : '#1F2933';
        s.appendChild(svg('rect', { x: xi * 9 - 3, y: 0, width: 6, height: 28, fill: corP }));
      } else xi++;
    }
    return s;
  };

  /** Braço do baixo com a nota do baixo marcada nas posições. */
  R.bracoBaixo = function (b, o) {
    o = o || {};
    var n = b.cordas.length, casas = 7, W = 12 + casas * 14, H = 12 + (n - 1) * 10 + 10;
    var s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Baixo: ' + b.nota_do_baixo });
    for (var i = 0; i < n; i++) { var y = 8 + i * 10; s.appendChild(svg('line', { x1: 8, x2: W - 2, y1: y, y2: y, stroke: '#5B6478' })); }
    for (var c = 0; c <= casas; c++) s.appendChild(svg('line', { x1: 8 + c * 14, x2: 8 + c * 14, y1: 8, y2: 8 + (n - 1) * 10, stroke: '#9BA3B4', 'stroke-width': c === 0 ? 3 : 1 }));
    b.posicoes.filter(function (p) { return p.casa <= casas; }).forEach(function (p) {
      var corda = o.canhoto ? p.corda : n - 1 - p.corda;       // grave embaixo, como se vê o braço
      var x = p.casa === 0 ? 4 : 8 + (p.casa - 0.5) * 14;
      s.appendChild(svg('circle', { cx: x, cy: 8 + corda * 10, r: 4.2, fill: '#C9A227', stroke: '#1B2A4A' }));
    });
    return s;
  };

  /**
   * Diagramas de TODOS os acordes do documento, para o instrumento da
   * pessoa. `meus` = voicings fixados por ela (têm prioridade).
   */
  R.diagramas = function (doc, inst, o) {
    o = o || {};
    var box = el('div', { class: 'cf-diags', role: 'list', 'aria-label': 'Diagramas dos acordes' });
    var I = M.instrumentos;
    var info = I.INSTRUMENTOS[inst] || I.INSTRUMENTOS.violao;
    var latina = doc.meta && doc.meta.notacao === 'latina';
    var acs = M.documento.acordesUsados(doc).filter(function (a) { return a.reconhecido; }).slice(0, 40);
    if (!acs.length) return box;
    var meus = {};
    (o.meus || []).forEach(function (v) { if (v.afinacao === (o.afinacao || 'padrao')) meus[v.acorde] = v.casas; });
    if (info.tipo === 'teclado') {
      I.tecladoProgressao(acs.map(function (a) { return a.acorde; }), { latina: latina }).forEach(function (v) {
        if (!v.mao_direita) return;
        var d = el('div', { class: 'cf-diag', role: 'listitem', tabindex: '0', title: 'Tocar ' + v.cifra });
        d.appendChild(el('b', { txt: v.cifra })); d.appendChild(R.teclado(v));
        d.appendChild(el('div', { class: 'm', txt: v.nomes_direita.join(' ') }));
        d.onclick = function () { R.tocar(v.mao_esquerda.concat(v.mao_direita)); };
        box.appendChild(d);
      });
      return box;
    }
    if (info.tipo === 'baixo') {
      acs.forEach(function (a) {
        var b = I.baixo(a.acorde, { afinacao: o.afinacao, latina: latina });
        if (b.erro) return;
        var d = el('div', { class: 'cf-diag', role: 'listitem', tabindex: '0' });
        d.appendChild(el('b', { txt: a.acorde })); d.appendChild(R.bracoBaixo(b, o));
        d.appendChild(el('div', { class: 'm', txt: 'baixo ' + b.nota_do_baixo + ' · ' + b.graus_alvo.map(function (g) { return g.nota; }).join('-') }));
        d.onclick = function () { R.tocar([36 + (M.nota.lerNota(b.nota_do_baixo).pc)]); };
        box.appendChild(d);
      });
      return box;
    }
    acs.forEach(function (a) {
      var f = I.formas(a.acorde, inst, { afinacao: o.afinacao, quantas: 3, latina: latina });
      var cordas = f.cordas || (info.afinacoes[o.afinacao || 'padrao'] || info.afinacoes.padrao).cordas;
      var forma = f.formas[0];
      if (meus[a.acorde]) forma = Object.assign({}, forma || {}, { casas: meus[a.acorde], desenho: meus[a.acorde].join(''), pestana: null, dedos_sugeridos: null, graus: [] });
      var d = el('div', { class: 'cf-diag' + (meus[a.acorde] ? ' meu' : ''), role: 'listitem', tabindex: '0', title: 'Tocar ' + a.acorde });
      d.appendChild(el('b', { txt: a.acorde }));
      if (forma) {
        d.appendChild(R.diagramaTrastes(forma, cordas, o));
        d.appendChild(el('div', { class: 'm', txt: (forma.nivel || 'minha') + (forma.pestana ? ' · pestana' : '') }));
        d.onclick = function () { R.tocar(forma.casas.map(function (c, i) { return c < 0 ? null : cordas[i] + c; }).filter(function (x) { return x !== null; })); };
        d.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); d.onclick(); } };
        d.oncontextmenu = function (ev) { ev.preventDefault(); if (o.aoEscolherForma) o.aoEscolherForma(a.acorde, f); };
      } else d.appendChild(el('div', { class: 'm', txt: 'sem forma' }));
      box.appendChild(d);
    });
    return box;
  };

  /** Toca notas (MIDI) — síntese simples do áudio do app, e a tela diz isso. */
  R.tocar = function (midis) {
    try { if (global.MusiqueAudio && midis && midis.length) global.MusiqueAudio.tocar({ tipo: 'acorde', midi: midis, dur_ms: 1600 }); } catch (_) { /* sem áudio */ }
  };

  /** Sugestões de acorde para o editor: campo harmônico do tom + recentes. */
  R.sugestoesDoTom = function (tom, recentes) {
    var out = [];
    if (tom) {
      var campo = tom.menor ? M.harmonia.CAMPO_MENOR : M.harmonia.CAMPO_MAIOR;
      var bem = M.nota.usarBemol(tom, 'auto');
      Object.keys(campo).forEach(function (g) {
        var q = campo[g]; if (Array.isArray(q)) q = q[1];
        var n = M.nota.nome(tom.pc + Number(g), { bemol: bem });
        out.push(n + (q === 'menor' ? 'm' : q === 'dim' ? '°' : ''));
      });
      out.push(M.nota.nome(tom.pc + 7, { bemol: bem }) + '7');
    }
    (recentes || []).forEach(function (r) { if (out.indexOf(r) < 0) out.unshift(r); });
    return out.slice(0, 14);
  };
})(window);
