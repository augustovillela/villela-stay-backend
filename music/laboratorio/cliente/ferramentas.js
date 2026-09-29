// =====================================================================
// Musique · Laboratório — CLIENTE · Explorar. Cada ferramenta é uma
// função (alvo, estado). O ESTADO é um só por página: mudar a tônica
// muda piano, pauta, braço e círculo juntos — nada é recalculado em dois
// lugares, porque todos pedem ao mesmo núcleo.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas;
  var N = L.notas, I = L.intervalos, E = L.escalas, A = L.acordes, T = L.tonalidades, D = L.desenho, INS = L.instrumentos, AC = L.acustica, X = L.exercicios;
  var el = C.el;

  function tonicaDe(st) { return N.deSlug(st.tonica) || N.ler('C'); }
  function naOitava(t, o) { return N.comOitava(t, t.oitava != null ? t.oitava : (t.li >= 4 ? (o || 4) - 1 : (o || 4))); }
  /** Notas do estado (escala ou acorde), com oitava. */
  function notasDe(st) {
    var t4 = naOitava(tonicaDe(st));
    if (st.acorde) return A.notas(t4, st.acorde) || [t4];
    if (st.escala) return E.notas(t4, st.escala) || [t4];
    return [t4];
  }
  function rot(n) { return C.nomeNota(n); }
  function svg(html) { var s = el('div', { class: 'lab-svgbox', html: html }); return s; }
  function destaquesPiano(ns, raiz) {
    var dd = {}; ns.forEach(function (n) { var m = N.midi(n); if (m != null) dd[m] = { rotulo: rot(n), tipo: raiz && N.pc(n) === N.pc(raiz) ? 'raiz' : 'nota' }; });
    return dd;
  }
  function pianoInterativo(ns, raiz, de, ate, aoTocar) {
    var box = svg(D.piano({ de: de || 48, ate: ate || 84, destaques: destaquesPiano(ns, raiz), interativo: true, notacao: C.notacao, titulo: 'Teclado' }));
    box.addEventListener('click', function (e) { var k = e.target.closest('[data-midi]'); if (!k) return; var m = Number(k.dataset.midi); C.Som.tocar([m], { dur: 0.8 }); if (aoTocar) aoTocar(m); });
    box.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.midi) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    return box;
  }
  function bracoSvg(ns, raiz, st, extra) {
    var af = st.afinacao === 'personalizada' && st.afinPers ? INS.afinacaoPersonalizada(st.afinPers, st.instrumento) : INS.afinacao(st.instrumento || 'violao', st.afinacao || 'padrao');
    if (!af) af = INS.afinacao(st.instrumento || 'violao', 'padrao');
    var porPc = {}; ns.forEach(function (n) { porPc[N.pc(n)] = n; });
    var casas = st.casas || 12;
    var pos = INS.posicoes(af, Object.keys(porPc).map(Number), casas);
    var modo = st.rotulo || 'nome';
    var dest = pos.map(function (p) {
      var n = porPc[p.pc];
      var r = modo === 'grau' ? String(ns.map(N.pc).indexOf(p.pc) + 1) : modo === 'intervalo' ? ((I.entre(N.semOitava(raiz), N.semOitava(n)) || {}).curto || '') : rot(n);
      return { corda: p.corda, casa: p.casa, rotulo: r, tipo: raiz && p.pc === N.pc(raiz) ? 'raiz' : 'nota' };
    });
    var box = svg(D.braco({ afinacao: af, casas: casas, destaques: dest, canhoto: !!st.canhoto, interativo: true, notacao: C.notacao, titulo: 'Braço do ' + INS.instrumento(st.instrumento || 'violao').nome }));
    box.classList.add('lab-rola');
    box.addEventListener('click', function (e) { var c = e.target.closest('[data-midi]'); if (c) { C.Som.tocar([Number(c.dataset.midi)], { modo: 'dedilhado', dur: 1.2 }); if (extra) extra(Number(c.dataset.midi)); } });
    return box;
  }
  function resumoTexto(st) {
    var t = tonicaDe(st);
    if (st.acorde) { var c = A.porId(st.acorde); var ns = A.notas(t, st.acorde) || []; return { titulo: A.simbolo(t, st.acorde) + ' — ' + c.nome, linhas: ['Notas: ' + ns.map(function (n) { return rot(n); }).join(' – '), 'Fórmula: ' + c.formula + ' · intervalos ' + A.intervalos(st.acorde).join(' ')], url: L.catalogo.urlAcorde(t, st.acorde) }; }
    var e = E.porId(st.escala || 'maior'); var ne = E.notas(t, e.id) || [];
    return { titulo: rot(t) + ' ' + e.nome, linhas: ['Notas: ' + ne.map(function (n) { return rot(n); }).join(' – '), 'Fórmula: ' + e.formula + ' · passos ' + E.passos(e.id).join(' ')], url: L.catalogo.urlEscala(t, e.id) };
  }
  function painelResumo(st) {
    var r = resumoTexto(st);
    var ns = notasDe(st);
    var t4 = naOitava(tonicaDe(st));
    var sobe = st.acorde ? ns : ns.concat([N.comOitava(t4, t4.oitava + 1)]);
    return el('div', { class: 'lab-resumo' }, [el('h2', { txt: r.titulo })].concat(r.linhas.map(function (l) { return el('p', { txt: l }); })).concat([
      el('div', { class: 'lab-acoes' }, [
        el('button', { type: 'button', class: 'lab-ouvir', 'data-midis': JSON.stringify(sobe.map(N.midi)), 'data-modo': st.acorde ? 'harmonico' : 'melodico', txt: st.acorde ? '▶ Ouvir o acorde' : '▶ Ouvir subindo' }),
        st.acorde ? el('button', { type: 'button', class: 'lab-ouvir', 'data-midis': JSON.stringify(ns.map(N.midi)), txt: '▶ Arpejo' }) : el('button', { type: 'button', class: 'lab-ouvir', 'data-midis': JSON.stringify(sobe.slice().reverse().map(N.midi)), txt: '▶ Descendo' }),
        el('a', { href: r.url, txt: 'Página completa →' })])]));
  }

  // ------------------------------------------------------------------
  // Laboratório integrado (caminho 3)
  // ------------------------------------------------------------------
  F.laboratorio = function (alvo, st) {
    st.tipo = st.acorde ? 'acorde' : 'escala';
    function render() {
      C.gravarUrl(st);
      C.limpar(alvo);
      var t = tonicaDe(st);
      var ns = notasDe(st);
      var t4 = naOitava(t);
      var ctrl = el('div', { class: 'lab-controles' }, [
        C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }),
        C.select('lab-tipo', 'Ver', [{ valor: 'escala', rotulo: 'escala / modo' }, { valor: 'acorde', rotulo: 'acorde' }], st.tipo, function (v) { st.tipo = v; if (v === 'acorde') { st.acorde = st.acorde || 'maior'; st.escala = ''; } else { st.escala = st.escala || 'maior'; st.acorde = ''; } render(); }),
        st.tipo === 'acorde' ? C.selAcorde(st.acorde, function (v) { st.acorde = v; render(); }) : C.selEscala(st.escala, function (v) { st.escala = v; render(); }),
        C.select('lab-inst', 'Instrumento', Object.keys(INS.CORDAS).map(function (k) { return { valor: k, rotulo: INS.CORDAS[k].nome }; }), st.instrumento, function (v) { st.instrumento = v; st.afinacao = 'padrao'; render(); }),
        C.select('lab-clave', 'Clave', [{ valor: 'sol', rotulo: 'sol' }, { valor: 'fa', rotulo: 'fá' }, { valor: 'do3', rotulo: 'dó (3ª linha)' }, { valor: 'do4', rotulo: 'dó (4ª linha)' }], st.clave, function (v) { st.clave = v; render(); }),
        C.selNotacao(render), C.selTimbre(),
        el('label', { class: 'lab-check' }, [el('input', { type: 'checkbox', checked: st.canhoto ? true : null, onchange: function (e) { st.canhoto = e.target.checked; render(); } }), ' canhoto']),
      ]);
      alvo.appendChild(ctrl);
      alvo.appendChild(painelResumo(st));
      var oitClave = st.clave === 'fa' ? 3 : st.clave === 'sol' ? 4 : 3;
      var nsClave = st.acorde ? A.notas(naOitava(t, oitClave), st.acorde) : E.notas(naOitava(t, oitClave), st.escala);
      alvo.appendChild(el('div', { class: 'lab-grade-2' }, [
        el('figure', { class: 'lab-fig' }, [svg(D.pauta({ clave: st.clave, acorde: !!st.acorde, notas: (nsClave || []).map(function (n) { return { nota: N.nome(n), rotulo: rot(n) }; }) })), el('figcaption', { txt: 'Pauta' })]),
        el('figure', { class: 'lab-fig' }, [relogio(ns, t), el('figcaption', { txt: 'Relógio cromático: a forma da ' + (st.acorde ? 'harmonia' : 'escala') })]),
      ]));
      alvo.appendChild(el('figure', { class: 'lab-fig' }, [pianoInterativo(ns, t4, 48, 84), el('figcaption', { txt: 'Toque as teclas para ouvir. A fundamental tem um losango.' })]));
      alvo.appendChild(el('figure', { class: 'lab-fig' }, [bracoSvg(ns, t, st), el('figcaption', { txt: 'A fundamental aparece em quadrado. Toque uma casa para ouvir.' })]));
      if (!st.acorde && E.graus(E.porId(st.escala).formula).length === 7) {
        var campo = E.empilhar(t, st.escala, 4);
        var box = el('div', { class: 'lab-campo-chips' }, [el('h3', { txt: 'Acordes da escala (clique para ver)' })]);
        var ul = el('ul', { class: 'lab-chips' });
        campo.forEach(function (p, i) {
          var q = A.qualidadeDaPilha(p.notas); var q3 = A.qualidadeDaPilha(p.notas.slice(0, 3));
          if (!q && !q3) return;
          var id = q || q3;
          ul.appendChild(el('li', {}, [el('button', { type: 'button', class: 'lab-chip-btn', onclick: function () { st.tonica = N.slug(p.notas[0]); st.acorde = id; st.escala = ''; st.tipo = 'acorde'; render(); } }, [T.romano(i + 1, id) + ' · ' + A.simbolo(p.notas[0], id)])]));
        });
        box.appendChild(ul); alvo.appendChild(box);
      }
    }
    render();
  };

  function relogio(ns, raiz) {
    var pcs = ns.map(N.pc);
    var itens = [];
    for (var pc = 0; pc < 12; pc++) {
      var n = ns.filter(function (x) { return N.pc(x) === pc; })[0];
      itens.push({ rotulo: n ? rot(n) : rot(N.deClasse(pc)), tipo: n ? (N.pc(raiz) === pc ? 'raiz' : 'nota') : '' });
    }
    var poli = []; for (var k = 0; k < 12; k++) if (pcs.indexOf(k) >= 0) poli.push(k);
    return svg(D.anel({ itens: itens, poligono: poli, titulo: 'Relógio cromático', centro: pcs.length + ' notas', descricao: 'As 12 classes de altura; o polígono liga as notas em uso.' }));
  }

  // ------------------------------------------------------------------
  // Piano e notas
  // ------------------------------------------------------------------
  F.piano = function (alvo, st) {
    var marcadas = [];
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var t = tonicaDe(st);
      alvo.appendChild(el('div', { class: 'lab-controles' }, [
        C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }),
        C.selEscala(st.escala, function (v) { st.escala = v; if (v) st.acorde = ''; render(); }, true),
        C.selAcorde(st.acorde, function (v) { st.acorde = v; if (v) st.escala = ''; render(); }, true),
        C.selNotacao(render), C.selTimbre(),
      ]));
      var ns = (st.escala || st.acorde) ? notasDe(st) : [];
      alvo.appendChild(el('figure', { class: 'lab-fig' }, [pianoInterativo(ns, naOitava(t), 36, 84, function (m) {
        var n = N.deMidi(m, { bemol: T.armadura(t, 'maior') && T.armadura(t, 'maior').quantidade < 0 });
        var iv = I.entre(N.comOitava(t, 4), N.comOitava(n, 4));
        marcadas.push(m); if (marcadas.length > 6) marcadas.shift();
        info.textContent = rot(n) + (n.oitava != null ? ' ' + n.oitava : '') + ' · ' + N.freqDeMidi(m).toFixed(1).replace('.', ',') + ' Hz' + (iv ? ' · ' + iv.nome + ' acima de ' + rot(t) : '');
      })]));
      var info = el('p', { class: 'lab-info', 'aria-live': 'polite', txt: 'Toque uma tecla (ou use Tab e Enter).' });
      alvo.appendChild(info);
      if (ns.length) alvo.appendChild(painelResumo(st));
    }
    render();
  };

  // ------------------------------------------------------------------
  // Pauta e claves
  // ------------------------------------------------------------------
  F.pauta = function (alvo, st) {
    st.texto = st.texto || '';
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var campoTxt = el('input', { id: 'lab-notas-txt', type: 'text', value: st.texto, placeholder: 'Ex.: C4 E4 G4 ou dó4 mi♭4 sol4' });
      alvo.appendChild(el('div', { class: 'lab-controles' }, [
        C.select('lab-clave', 'Clave', [{ valor: 'sol', rotulo: 'sol' }, { valor: 'fa', rotulo: 'fá' }, { valor: 'do3', rotulo: 'dó na 3ª linha' }, { valor: 'do4', rotulo: 'dó na 4ª linha' }], st.clave, function (v) { st.clave = v; render(); }),
        C.selTonica(st.tonica, function (v) { st.tonica = v; st.texto = ''; render(); }),
        C.selEscala(st.escala, function (v) { st.escala = v; st.texto = ''; render(); }, true),
        el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'lab-notas-txt', txt: 'Ou digite notas com oitava' }), campoTxt]),
        el('button', { type: 'button', class: 'btn', txt: 'Mostrar', onclick: function () { st.texto = campoTxt.value; render(); } }),
      ]));
      var ns;
      if (st.texto) {
        ns = st.texto.split(/[\s,]+/).map(N.ler).filter(function (n) { return n && n.oitava != null; });
        if (!ns.length) alvo.appendChild(el('p', { class: 'lab-erro', txt: 'Não reconheci as notas. Use letra ou nome + oitava: C4, F#3, sol4, si♭3.' }));
      } else {
        var oit = st.clave === 'fa' ? 3 : st.clave === 'sol' ? 4 : 3;
        ns = st.escala ? E.notas(naOitava(tonicaDe(st), oit), st.escala) : [];
      }
      ns = ns || [];
      var pos = ns.map(function (n) { var p = L.pauta.posicao(n, st.clave); return rot(n) + ' ' + n.oitava + ': ' + (p ? L.pauta.nomeDaPosicao(p.posicao) : '—'); });
      alvo.appendChild(el('figure', { class: 'lab-fig' }, [svg(D.pauta({ clave: st.clave, notas: ns.map(function (n) { return { nota: N.nome(n), rotulo: rot(n) }; }) })),
        el('figcaption', {}, [ns.length ? el('button', { type: 'button', class: 'lab-ouvir', 'data-midis': JSON.stringify(ns.map(N.midi)), txt: '▶ Ouvir' }) : 'Escolha uma escala ou digite notas.'])]));
      if (pos.length) alvo.appendChild(el('ul', { class: 'lab-lista-pos' }, pos.map(function (p) { return el('li', { txt: p }); })));
      var cl = L.pauta.clave(st.clave);
      alvo.appendChild(el('p', { class: 'lab-dica', txt: cl.nome + ': ' + cl.referencia + '. A linha vem da GRAFIA: dó♯ e ré♭ ficam em lugares diferentes.' }));
    }
    render();
  };

  // ------------------------------------------------------------------
  // Braço
  // ------------------------------------------------------------------
  F.braco = function (alvo, st) {
    st.rotulo = st.rotulo || 'nome'; st.casas = st.casas || 12;
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var ins = INS.instrumento(st.instrumento) || INS.instrumento('violao');
      var afs = Object.keys(ins.afinacoes).map(function (k) { return { valor: k, rotulo: ins.afinacoes[k].nome }; }).concat([{ valor: 'personalizada', rotulo: 'personalizada…' }]);
      var pers = el('input', { id: 'lab-afin-pers', type: 'text', value: st.afinPers || '', placeholder: 'Ex.: D A D G B E' });
      alvo.appendChild(el('div', { class: 'lab-controles' }, [
        C.select('lab-inst', 'Instrumento', Object.keys(INS.CORDAS).map(function (k) { return { valor: k, rotulo: INS.CORDAS[k].nome }; }), st.instrumento, function (v) { st.instrumento = v; st.afinacao = 'padrao'; render(); }),
        C.select('lab-afin', 'Afinação', afs, st.afinacao, function (v) { st.afinacao = v; render(); }),
        st.afinacao === 'personalizada' ? el('div', { class: 'lab-campo' }, [el('label', { for: 'lab-afin-pers', txt: 'Cordas (grave → aguda)' }), pers, el('button', { type: 'button', class: 'btn sec', txt: 'Aplicar', onclick: function () { st.afinPers = pers.value; render(); } })]) : null,
        C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }),
        C.selEscala(st.escala, function (v) { st.escala = v; if (v) st.acorde = ''; render(); }, true),
        C.selAcorde(st.acorde, function (v) { st.acorde = v; if (v) st.escala = ''; render(); }, true),
        C.select('lab-rot', 'Mostrar', [{ valor: 'nome', rotulo: 'nome da nota' }, { valor: 'intervalo', rotulo: 'intervalo' }, { valor: 'grau', rotulo: 'grau' }], st.rotulo, function (v) { st.rotulo = v; render(); }),
        C.select('lab-casas', 'Casas', [{ valor: 12, rotulo: '12' }, { valor: 15, rotulo: '15' }, { valor: 19, rotulo: '19' }, { valor: 22, rotulo: '22' }], st.casas, function (v) { st.casas = Number(v); render(); }),
        C.selNotacao(render), C.selTimbre(),
        el('label', { class: 'lab-check' }, [el('input', { type: 'checkbox', checked: st.canhoto ? true : null, onchange: function (e) { st.canhoto = e.target.checked; render(); } }), ' canhoto']),
      ]));
      if (st.afinacao === 'personalizada' && st.afinPers && !INS.afinacaoPersonalizada(st.afinPers, st.instrumento)) alvo.appendChild(el('p', { class: 'lab-erro', txt: 'A afinação precisa ter uma nota por corda (' + INS.afinacao(st.instrumento, 'padrao').notas.length + ').' }));
      var ns = (st.escala || st.acorde) ? notasDe(st) : L.cliente.TONICAS.filter(function (n) { return n.alt === 0; });
      var info = el('p', { class: 'lab-info', 'aria-live': 'polite', txt: 'Toque uma casa para ouvir.' });
      alvo.appendChild(el('figure', { class: 'lab-fig' }, [bracoSvg(ns, (st.escala || st.acorde) ? tonicaDe(st) : null, st, function (m) { info.textContent = rot(N.deMidi(m)) + ' ' + N.deMidi(m).oitava + ' · ' + N.freqDeMidi(m).toFixed(1).replace('.', ',') + ' Hz'; })]));
      alvo.appendChild(info);
      if (st.escala || st.acorde) alvo.appendChild(painelResumo(st));
    }
    render();
  };

  // ------------------------------------------------------------------
  // Círculos
  // ------------------------------------------------------------------
  F['circulo-de-quintas'] = function (alvo, st) {
    var sel = { i: 0, modo: 'maior' }, quartas = false;
    function render() {
      C.limpar(alvo);
      var ordem = quartas ? [0, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      var itens = ordem.map(function (i) { var c = T.CIRCULO[i]; var q = T.armadura(c.maior, 'maior').quantidade;
        return { rotulo: C.nomeNota(N.ler(c.maior)) + (c.alt ? '/' + C.nomeNota(N.ler(c.alt)) : ''), sub: q ? Math.abs(q) + (q > 0 ? '♯' : '♭') : '', dado: 'M' + i, acessivel: T.nome(N.ler(c.maior), 'maior'),
          tipo: sel.modo === 'maior' && sel.i === i ? 'ativo' : (Math.abs(((i - sel.i) + 12) % 12) === 1 || Math.abs(((sel.i - i) + 12) % 12) === 1) ? 'vizinho' : '' }; });
      var internos = ordem.map(function (i) { var c = T.CIRCULO[i]; return { rotulo: C.nomeNota(N.ler(c.menor)) + 'm', dado: 'm' + i, acessivel: T.nome(N.ler(c.menor), 'menor'), tipo: sel.modo === 'menor' && sel.i === i ? 'ativo' : '' }; });
      alvo.appendChild(el('div', { class: 'lab-controles' }, [
        el('button', { type: 'button', class: 'btn sec', 'aria-pressed': quartas ? 'true' : 'false', txt: quartas ? 'Ver como quintas ↻' : 'Ver como quartas ↺', onclick: function () { quartas = !quartas; render(); } }), C.selNotacao(render)]));
      var box = svg(D.anel({ itens: itens, interno: internos, interativo: true, titulo: quartas ? 'Círculo de quartas' : 'Círculo de quintas', centro: quartas ? 'quartas ↺' : 'quintas ↻', descricao: 'Tons maiores por fora, relativos menores por dentro. Selecione um tom.' }));
      box.addEventListener('click', escolher); box.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(e); } });
      function escolher(e) { var g = e.target.closest('[data-i]'); if (!g) return; var v = g.getAttribute('data-i'); sel = { i: Number(v.slice(1)), modo: v[0] === 'M' ? 'maior' : 'menor' }; render(); var f = C.$('.lab-circ-info h2'); if (f) f.focus(); }
      var c = T.CIRCULO[sel.i]; var ton = N.ler(sel.modo === 'maior' ? c.maior : c.menor);
      var arm = T.armadura(ton, sel.modo), rel = T.relativa(ton, sel.modo);
      var campo = T.campo(ton, sel.modo);
      var info = el('div', { class: 'lab-circ-info' }, [
        el('h2', { tabindex: '-1', txt: T.nome(ton, sel.modo) }),
        el('p', { txt: 'Armadura: ' + (arm.quantidade ? Math.abs(arm.quantidade) + (arm.quantidade > 0 ? ' sustenido(s): ' : ' bemol(is): ') + arm.acidentes.map(function (n) { return rot(n); }).join(' ') : 'nenhum acidente') }),
        el('p', { txt: 'Relativa: ' + T.nome(rel.tonica, rel.modo) }),
        el('p', { txt: 'Campo: ' + campo.map(function (g) { return g.romano + ' ' + g.simbolo; }).join(' · ') }),
        el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'lab-ouvir', 'data-sequencia': JSON.stringify(T.realizar(ton, sel.modo, [1, 4, 5, 1]).map(function (g) { return A.notas(naOitava(g.fundamental, 3), g.acorde).map(N.midi); })), txt: '▶ Ouvir I–IV–V–I' }),
          el('a', { href: L.catalogo.urlTom(ton, sel.modo), txt: 'Página do tom →' })]),
        el('div', { class: 'lab-svgbox', html: D.pauta({ clave: 'sol', armadura: arm.usual ? arm.quantidade : 0, notas: [], titulo: 'Armadura de ' + T.nome(ton, sel.modo) }) }),
      ]);
      alvo.appendChild(el('div', { class: 'lab-grade-2' }, [el('figure', { class: 'lab-fig lab-fig-circ' }, [box]), info]));
    }
    render();
  };

  F['circulo-cromatico'] = function (alvo, st) {
    var livres = null;
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selTonica(st.tonica, function (v) { st.tonica = v; livres = null; render(); }),
        C.selEscala(st.escala, function (v) { st.escala = v; st.acorde = ''; livres = null; render(); }, true),
        C.selAcorde(st.acorde, function (v) { st.acorde = v; st.escala = ''; livres = null; render(); }, true),
        el('button', { type: 'button', class: 'btn sec', txt: 'Marcar livre', onclick: function () { livres = []; render(); } })]));
      var ns = livres ? livres.map(function (pc) { return N.deClasse(pc); }) : notasDe(st);
      var raiz = livres ? (ns[0] || null) : tonicaDe(st);
      var itens = [];
      for (var pc = 0; pc < 12; pc++) { var n = ns.filter(function (x) { return N.pc(x) === pc; })[0]; itens.push({ rotulo: rot(n || N.deClasse(pc)), dado: pc, acessivel: rot(N.deClasse(pc)) + (n ? ', marcada' : ''), tipo: n ? (raiz && N.pc(raiz) === pc ? 'raiz' : 'nota') : '' }); }
      var poli = []; ns.forEach(function (n) { if (poli.indexOf(N.pc(n)) < 0) poli.push(N.pc(n)); }); poli.sort(function (a, b) { return a - b; });
      var box = svg(D.anel({ itens: itens, poligono: poli, interativo: true, titulo: 'Relógio cromático', centro: poli.length + ' notas', descricao: 'Toque os números para marcar notas; o polígono mostra a forma do conjunto.' }));
      box.addEventListener('click', function (e) {
        var g = e.target.closest('[data-i]'); if (!g) return; var p = Number(g.getAttribute('data-i'));
        if (!livres) livres = ns.map(N.pc);
        var k = livres.indexOf(p); if (k >= 0) livres.splice(k, 1); else livres.push(p);
        C.Som.tocar([60 + p], { dur: 0.5 }); render();
      });
      var nomes = [];
      if (poli.length >= 2) {
        var escs = E.identificar(poli, { soExatas: true }).slice(0, 6).map(function (x) { return rot(N.deClasse(x.tonica_pc)) + ' ' + x.nome; });
        var acs = poli.length <= 6 ? A.identificar(poli.map(function (p) { return 60 + p; })).slice(0, 4).map(function (x) { return x.simbolo; }) : [];
        if (acs.length) nomes.push('Acorde: ' + acs.join(', '));
        if (escs.length) nomes.push('Escala: ' + escs.join(', '));
      }
      alvo.appendChild(el('div', { class: 'lab-grade-2' }, [el('figure', { class: 'lab-fig lab-fig-circ' }, [box]),
        el('div', {}, [el('p', { txt: 'Classes de altura: {' + poli.join(', ') + '} (dó = 0).' }), el('p', { txt: 'Intervalos em semitons entre vizinhos: ' + poli.map(function (p, i) { return ((poli[(i + 1) % poli.length] - p) + 12) % 12 || 12; }).join(' ') }),
          el('p', { 'aria-live': 'polite', txt: nomes.join(' · ') || 'Marque duas ou mais notas para ver os nomes possíveis.' }),
          el('p', { class: 'lab-dica', txt: 'Formas simétricas (tons inteiros, diminuta, aumentada) têm poucas transposições diferentes: gire e veja o polígono se repetir.' })])]));
    }
    render();
  };

  F['circulo-de-tercas'] = function (alvo, st) {
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }), C.selNotacao(render)]));
      var cad = T.cadeiaDeTercas(tonicaDe(st), 24);
      var itens = cad.map(function (x, i) { return { rotulo: C.nomeNota(x.tonica) + (x.modo === 'menor' ? 'm' : ''), tipo: i === 0 ? 'ativo' : '', dado: i, acessivel: T.nome(x.tonica, x.modo) }; });
      var box = svg(D.anel({ itens: itens, interativo: true, titulo: 'Cadeia de terças', descricao: 'Tons maiores e menores alternados, cada passo uma terça acima; vizinhos dividem duas notas.' }));
      box.addEventListener('click', function (e) { var g = e.target.closest('[data-i]'); if (!g) return; var x = cad[Number(g.getAttribute('data-i'))]; var ns = A.notas(naOitava(x.tonica, 4), x.modo === 'menor' ? 'menor' : 'maior'); C.Som.tocar(ns.map(N.midi), { modo: 'harmonico' }); });
      alvo.appendChild(el('figure', { class: 'lab-fig lab-fig-circ' }, [box, el('figcaption', { txt: 'Toque um acorde para ouvir. C → Em → G → Bm…: cada passo troca uma nota só.' })]));
    }
    render();
  };

  // ------------------------------------------------------------------
  // Identificadores
  // ------------------------------------------------------------------
  F['identificar-acorde'] = function (alvo, st) {
    var marcadas = [];
    function render() {
      C.limpar(alvo);
      var txt = el('input', { id: 'lab-ac-txt', type: 'text', placeholder: 'Ou digite: E G C, ou mi4 sol4 dó5' });
      alvo.appendChild(el('div', { class: 'lab-controles' }, [el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'lab-ac-txt', txt: 'Notas (a primeira é o baixo)' }), txt]),
        el('button', { type: 'button', class: 'btn', txt: 'Identificar', onclick: function () { var ns = txt.value.split(/[\s,]+/).map(N.ler).filter(Boolean); marcadas = ns.map(function (n, i) { return n.oitava != null ? N.midi(n) : 48 + N.pc(n) + (i ? 12 : 0); }); render(); } }),
        el('button', { type: 'button', class: 'btn sec', txt: 'Limpar', onclick: function () { marcadas = []; render(); } }), C.selNotacao(render)]));
      var dd = {}; marcadas.forEach(function (m) { dd[m] = { rotulo: rot(N.deMidi(m)), tipo: 'nota' }; });
      var box = svg(D.piano({ de: 36, ate: 84, destaques: dd, interativo: true, notacao: C.notacao, titulo: 'Marque as notas do acorde' }));
      box.addEventListener('click', function (e) { var k = e.target.closest('[data-midi]'); if (!k) return; var m = Number(k.dataset.midi); var i = marcadas.indexOf(m); if (i >= 0) marcadas.splice(i, 1); else { marcadas.push(m); C.Som.tocar([m], { dur: 0.6 }); } render(); });
      alvo.appendChild(el('figure', { class: 'lab-fig' }, [box, el('figcaption', { txt: 'Toque as teclas para marcar ou desmarcar. A mais grave é o baixo.' })]));
      var res = marcadas.length >= 2 ? A.identificar(marcadas.slice().sort(function (a, b) { return a - b; })) : [];
      var out = el('div', { class: 'lab-resultado', 'aria-live': 'polite' });
      if (marcadas.length < 2) out.appendChild(el('p', { txt: 'Marque pelo menos duas notas.' }));
      else if (!res.length) out.appendChild(el('p', { txt: 'Estas notas não formam um acorde do catálogo. Tente tirar uma nota ou mudar o baixo.' }));
      else {
        out.appendChild(el('button', { type: 'button', class: 'lab-ouvir', 'data-midis': JSON.stringify(marcadas.slice().sort(function (a, b) { return a - b; })), 'data-modo': 'harmonico', txt: '▶ Ouvir' }));
        out.appendChild(el('ol', { class: 'lab-candidatos' }, res.slice(0, 8).map(function (r) {
          return el('li', {}, [el('a', { href: L.catalogo.urlAcorde(r.fundamental, r.id) }, [el('strong', { txt: r.simbolo })]), ' — ' + r.nome + ' · ' + r.nome_inversao + (r.sem_quinta ? ' (sem a quinta)' : '')]);
        })));
        if (res.length > 1) out.appendChild(el('p', { class: 'lab-dica', txt: 'Mais de um nome é normal: o mesmo conjunto de notas lido a partir de fundamentais diferentes. O contexto (o baixo, a tonalidade) decide.' }));
      }
      alvo.appendChild(out);
    }
    render();
  };

  F['identificar-escala'] = function (alvo) {
    var pcs = [];
    function render() {
      C.limpar(alvo);
      var dd = {}; pcs.forEach(function (p) { dd[60 + p] = { rotulo: rot(N.deClasse(p)), tipo: 'nota' }; });
      var box = svg(D.piano({ de: 60, ate: 71, destaques: dd, interativo: true, notacao: C.notacao, titulo: 'Marque as notas' }));
      box.addEventListener('click', function (e) { var k = e.target.closest('[data-midi]'); if (!k) return; var p = Number(k.dataset.midi) % 12; var i = pcs.indexOf(p); if (i >= 0) pcs.splice(i, 1); else { pcs.push(p); C.Som.tocar([60 + p], { dur: 0.5 }); } render(); });
      alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selNotacao(render), C.selTimbre(), el('button', { type: 'button', class: 'btn sec', txt: 'Limpar', onclick: function () { pcs = []; render(); } })]));
      alvo.appendChild(el('figure', { class: 'lab-fig' }, [box]));
      var r = pcs.length >= 3 ? E.identificar(pcs) : [];
      var ex = r.filter(function (x) { return x.exata; }), contem = r.filter(function (x) { return !x.exata; }).slice(0, 12);
      var li = function (x) { var t = N.deClasse(x.tonica_pc); return el('li', {}, [el('a', { href: L.catalogo.urlEscala(t, x.id), txt: rot(t) + ' ' + x.nome })]); };
      alvo.appendChild(el('div', { class: 'lab-resultado', 'aria-live': 'polite' }, pcs.length < 3 ? [el('p', { txt: 'Marque três ou mais notas.' })] : [
        el('h3', { txt: 'Exatamente estas notas' }), ex.length ? el('ul', { class: 'lab-chips' }, ex.slice(0, 16).map(li)) : el('p', { txt: 'Nenhuma escala do catálogo tem exatamente estas notas.' }),
        el('h3', { txt: 'Escalas que contêm estas notas' }), el('ul', { class: 'lab-chips' }, contem.map(li))]));
    }
    render();
  };

  // ------------------------------------------------------------------
  // Acústica
  // ------------------------------------------------------------------
  F['serie-harmonica'] = function (alvo, st) {
    var fund = 'C2';
    function render() {
      C.limpar(alvo);
      alvo.appendChild(el('div', { class: 'lab-controles' }, [C.select('lab-fund', 'Fundamental', ['C2', 'E2', 'A2', 'C3', 'G3', 'A3'].map(function (x) { return { valor: x, rotulo: C.nomeNota(N.ler(x), true) }; }), fund, function (v) { fund = v; render(); })]));
      var s = AC.serieHarmonica(fund, 16);
      var ul = el('div', { class: 'lab-serie' });
      s.forEach(function (h) {
        ul.appendChild(el('button', { type: 'button', class: 'lab-harm', style: 'height:' + Math.round(30 + 90 / h.harmonico) + 'px', 'aria-label': h.harmonico + 'º harmônico, ' + C.nomeNota(h.nota, true) + ', ' + h.cents + ' cents', onclick: function () { C.Som.tocarHz([h.hz], { dur: 1.3 }); } }, [el('span', { txt: h.harmonico }), el('small', { txt: C.nomeNota(h.nota) })]));
      });
      alvo.appendChild(ul);
      alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn', txt: '▶ Subir a série', onclick: function () { var a = C.Som.audio(); s.forEach(function (h, i) { C.Som.voz(h.hz, a.currentTime + 0.05 + i * 0.35, 0.33, { timbre: 'seno', vel: 0.2 }); }); } }),
        el('button', { type: 'button', class: 'btn sec', txt: '▶ Os oito primeiros juntos', onclick: function () { C.Som.tocarHz(s.slice(0, 8).map(function (h) { return h.hz; }), { dur: 2.5 }); } })]));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'O 7º, o 11º e o 13º harmônicos ficam longe do piano (dezenas de cents): o temperamento igual não os representa.' }));
    }
    render();
  };

  F.onda = function (alvo) {
    var tipo = 'sine', freq = 220, osc = null, raf = null;
    var NOMES = { sine: 'senoidal (pura)', square: 'quadrada', sawtooth: 'dente de serra', triangle: 'triangular' };
    // amplitudes dos harmônicos de cada forma (teoria de Fourier)
    function espectro(t) { var a = []; for (var k = 1; k <= 16; k++) a.push(t === 'sine' ? (k === 1 ? 1 : 0) : t === 'square' ? (k % 2 ? 1 / k : 0) : t === 'sawtooth' ? 1 / k : (k % 2 ? 1 / (k * k) : 0)); return a; }
    var cv = el('canvas', { width: 640, height: 180, class: 'lab-canvas', role: 'img', 'aria-label': 'Forma de onda' });
    var sp = el('canvas', { width: 640, height: 140, class: 'lab-canvas', role: 'img', 'aria-label': 'Espectro de harmônicos' });
    function desenhar(dados) {
      var g = cv.getContext('2d'); g.clearRect(0, 0, 640, 180); g.strokeStyle = '#1B2A4A'; g.lineWidth = 2; g.beginPath();
      for (var x = 0; x < 640; x++) { var y; if (dados) y = dados[Math.floor(x * dados.length / 640)]; else { var ph = (x / 640 * 3) % 1; y = tipo === 'sine' ? Math.sin(2 * Math.PI * ph) : tipo === 'square' ? (ph < 0.5 ? 1 : -1) : tipo === 'sawtooth' ? 2 * ph - 1 : 1 - 4 * Math.abs(ph - 0.5); }
        var py = 90 - y * 70; if (x) g.lineTo(x, py); else g.moveTo(x, py); }
      g.stroke();
      var h = sp.getContext('2d'); h.clearRect(0, 0, 640, 140); espectro(tipo).forEach(function (a, i) { h.fillStyle = '#C9A227'; var bh = a * 120; h.fillRect(12 + i * 39, 130 - bh, 26, bh); h.fillStyle = '#1F2933'; h.font = '11px Inter,sans-serif'; h.fillText(i + 1, 20 + i * 39, 139); });
    }
    function vivo() { var an = C.Som.analisador(); var buf = new Float32Array(an.fftSize); an.getFloatTimeDomainData(buf); var mx = 0.001; buf.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); }); desenhar(Array.prototype.map.call(buf.slice(0, 1024), function (v) { return v / mx; })); raf = requestAnimationFrame(vivo); }
    function parar() { if (osc) { try { osc.stop(); } catch (_) { /* ok */ } osc = null; } cancelAnimationFrame(raf); desenhar(); botao.textContent = '▶ Tocar'; }
    var botao = el('button', { type: 'button', class: 'btn', txt: '▶ Tocar', onclick: function () {
      if (osc) return parar();
      var a = C.Som.audio(); osc = a.createOscillator(); var g = a.createGain(); osc.type = tipo; osc.frequency.value = freq; g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.12, a.currentTime + 0.05);
      osc.connect(g); g.connect(C.Som.saida()); osc.start(); C.Som.registrar(osc); botao.textContent = '■ Parar'; vivo(); } });
    C.Som.aoParar = function () { osc = null; cancelAnimationFrame(raf); botao.textContent = '▶ Tocar'; desenhar(); };
    var fq = el('input', { id: 'lab-fq', type: 'range', min: 55, max: 880, value: freq, oninput: function () { freq = Number(fq.value); lfq.textContent = freq + ' Hz'; if (osc) osc.frequency.setTargetAtTime(freq, C.Som.audio().currentTime, 0.02); } });
    var lfq = el('span', { txt: freq + ' Hz' });
    alvo.appendChild(el('div', { class: 'lab-controles' }, [C.select('lab-forma', 'Forma', Object.keys(NOMES).map(function (k) { return { valor: k, rotulo: NOMES[k] }; }), tipo, function (v) { tipo = v; if (osc) osc.type = v; desenhar(); }),
      el('div', { class: 'lab-campo' }, [el('label', { for: 'lab-fq', txt: 'Frequência' }), fq, lfq]), botao]));
    alvo.appendChild(el('figure', { class: 'lab-fig' }, [cv, el('figcaption', { txt: 'Forma de onda (tempo). Tocando, o desenho é o sinal real que sai do alto-falante.' })]));
    alvo.appendChild(el('figure', { class: 'lab-fig' }, [sp, el('figcaption', { txt: 'Espectro: a força de cada harmônico. Mesma altura, receitas diferentes = timbres diferentes.' })]));
    desenhar();
  };

  // hub: nada a montar além da busca (feita na base)
  F.hub = function () {};

  // ------------------------------------------------------------------
  // "Por onde começar?": nível + instrumento + objetivo → um caminho.
  // Fica neste aparelho; para quem tem conta, também na conta.
  // ------------------------------------------------------------------
  var CORDAS_IDS = ['violao', 'guitarra', 'baixo', 'ukulele', 'cavaquinho', 'violao-7', 'bandolim'];
  function recomendar(p) {
    var inst = CORDAS_IDS.indexOf(p.instrumento) >= 0 ? p.instrumento : '';
    var ferrInst = p.instrumento === 'teclado' ? { nome: 'Piano virtual', url: '/music/criar/piano-virtual' }
      : p.instrumento === 'voz' ? { nome: 'Extensão vocal', url: '/music/criar/extensao-vocal' }
      : inst ? { nome: 'Braço do ' + INS.instrumento(inst).nome, url: '/music/explorar/braco?i=' + inst } : { nome: 'Piano e notas', url: '/music/explorar/piano' };
    var tutor = inst ? { nome: 'Tutor de braço: escalas e desenhos com correção', url: '/music/tutor-braco?i=' + inst } : null;
    var afinar = p.instrumento === 'voz' ? { nome: 'Afinador (voz)', url: '/music/ferramentas' } : inst ? { nome: 'Afinador do ' + INS.instrumento(inst).nome, url: '/music/criar/afinador-cordas?i=' + inst } : { nome: 'Afinador', url: '/music/ferramentas' };
    var r;
    if (p.objetivo === 'ensinar') r = { caminho: 'Ensinar', motivo: 'Monte atividades a partir dos exercícios, atribua à turma e acompanhe por habilidade.', itens: [{ nome: 'Área do professor', url: '/music/ensinar' }, { nome: 'Todos os exercícios', url: '/music/praticar' }, { nome: 'Trilha de lições (para indicar aos alunos)', url: '/music/aprender' }] };
    else if (p.objetivo === 'compor') r = { caminho: 'Laboratório integrado + Criar', motivo: 'Experimente livre: tônica, escala e acorde num lugar só, e ferramentas para montar ideias.', itens: [{ nome: 'Laboratório integrado', url: '/music/explorar/laboratorio' + (inst ? '?i=' + inst : '') }, { nome: 'Laboratório de progressões', url: '/music/criar/progressoes' }, { nome: 'Mini máquina musical', url: '/music/criar/mini-maquina' }, { nome: 'Motivos: variar e inverter', url: '/music/criar/motivos' }] };
    else if (p.objetivo === 'tocar') r = { caminho: 'Usar agora', motivo: 'Ferramentas que resolvem na hora, já no seu instrumento — cada uma leva à lição do assunto.', itens: [tutor, ferrInst, afinar, { nome: 'Transpositor de acordes', url: '/music/criar/transpositor' }, { nome: 'Identificador de acordes', url: '/music/explorar/identificar-acorde' }, { nome: 'Metrônomo que acelera', url: '/music/criar/metronomo-progressivo' }].filter(Boolean) };
    else if (p.objetivo === 'ouvido') r = { caminho: 'Praticar + Jogar', motivo: 'Treino curto e frequente: leitura, intervalos e acordes de ouvido, com explicação de cada erro.', itens: p.nivel === 'comecando'
      ? [{ nome: 'Nota na pauta', url: '/music/praticar/nota-na-pauta' }, { nome: 'Nota no teclado', url: '/music/praticar/nota-no-teclado' }, { nome: 'Intervalos de ouvido', url: '/music/praticar/intervalo-ouvido' }, { nome: 'Desafio do dia', url: '/music/jogar/desafio-diario' }]
      : [{ nome: 'Leitura à primeira vista', url: '/music/praticar/leitura-primeira-vista' }, { nome: 'Ditado rítmico', url: '/music/praticar/ditado-ritmico' }, { nome: 'Cadências de ouvido', url: '/music/praticar/cadencia-ouvido' }, { nome: 'Ditado a duas vozes', url: '/music/praticar/ditado-duas-vozes' }] };
    else if (p.nivel === 'avancado') r = { caminho: 'Aprender (aprofundamento)', motivo: 'Vá direto às lições avançadas e use as referências como consulta.', itens: [{ nome: 'Harmonia popular: MPB, blues e jazz', url: '/music/aprender/harmonia-popular' }, { nome: 'Empréstimo modal e modulação', url: '/music/aprender/emprestimo-e-modulacao' }, { nome: 'Contraponto', url: '/music/aprender/contraponto' }, { nome: 'Os 7 modos lado a lado', url: '/music/explorar/comparar-modos' }] };
    else if (p.nivel === 'toco') r = { caminho: 'Aprender, a partir dos intervalos', motivo: 'Quem já toca costuma pular o básico: comece pelos intervalos e siga até o campo harmônico.', itens: [{ nome: 'Intervalos: número e qualidade', url: '/music/aprender/intervalos' }, { nome: 'Campo harmônico e funções', url: '/music/aprender/campo-harmonico' }, ferrInst, { nome: 'Exercícios de campo harmônico', url: '/music/praticar/campo-grau' }] };
    else r = { caminho: 'Aprender passo a passo', motivo: 'A trilha na ordem certa, do som ao campo harmônico. Cada lição termina num exercício.', itens: [{ nome: 'Lição 1: Som, altura e nota', url: '/music/aprender/som-e-nota' }, { nome: 'A trilha completa', url: '/music/aprender' }, ferrInst, afinar] };
    return r;
  }
  function mostrarRecomendacao(p, alvo) {
    var r = recomendar(p);
    C.limpar(alvo).appendChild(el('div', { class: 'lab-resumo' }, [el('h3', { txt: 'O seu caminho: ' + r.caminho }), el('p', { txt: r.motivo }),
      el('ul', { class: 'lab-chips' }, r.itens.map(function (x, i) { return el('li', {}, [el('a', { href: x.url, txt: (i === 0 ? '→ ' : '') + x.nome })]); }))]));
  }
  d.addEventListener('DOMContentLoaded', function () {
    var f = C.$('#lab-perfil'), out = C.$('#lab-recomendacao');
    if (!f || !out) return;
    var salvo = C.lerLocal('perfil', null);
    var preencher = function (p) { ['nivel', 'instrumento', 'objetivo'].forEach(function (k) { if (p[k] && f.elements[k]) f.elements[k].value = p[k]; }); mostrarRecomendacao(p, out); };
    if (salvo) preencher(salvo);
    C.api('GET', '/music/api/lab/perfil').then(function (r) { if (r.perfil) { C.guardar('perfil', r.perfil); preencher(r.perfil); } }).catch(function () { /* sem conta: fica no aparelho */ });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var p = { nivel: f.elements.nivel.value, instrumento: f.elements.instrumento.value, objetivo: f.elements.objetivo.value };
      C.guardar('perfil', p);
      if (CORDAS_IDS.indexOf(p.instrumento) >= 0) C.guardar('instrumento', p.instrumento);
      mostrarRecomendacao(p, out);
      C.api('POST', '/music/api/lab/perfil', p).catch(function () { /* sem conta ou sem assinatura: fica no aparelho */ });
      var h = C.$('h3', out); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
    });
  });

  // o instrumento do perfil vira o padrão das ferramentas (a URL manda, se tiver)
  C.antesDeMontar = function (estado) {
    var main = C.$('#lab-main'), f = main && main.getAttribute('data-ferramenta');
    if (['braco', 'laboratorio', 'afinador-cordas'].indexOf(f) < 0) return;     // só onde o instrumento conta
    var inst = C.lerLocal('instrumento', '');
    if (inst && !/[?&]i=/.test(location.search) && CORDAS_IDS.indexOf(inst) >= 0 && (!estado.instrumento || estado.instrumento === 'violao')) estado.instrumento = inst;
  };
  C.recomendar = recomendar;
})(window, document);
