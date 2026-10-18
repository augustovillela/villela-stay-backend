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

  // Mapa visual de harmonia: uma leitura simples de condução de vozes,
  // inspirada em mapas de vizinhança, sem depender de uma imagem externa.
  F['mapa-harmonia'] = function (alvo, st) {
    st.texto = st.texto || 'C, Am, F, G';
    function lerAcordes() {
      return st.texto.split(/[;,\n]+/).map(function (x) { return A.ler(x.trim()); }).filter(Boolean).slice(0, 16);
    }
    function pcs(ac) {
      return (A.notas(naOitava(ac.fundamental, 4), ac.id) || []).map(N.pc).filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    function comum(a, b) { return pcs(a).filter(function (p) { return pcs(b).indexOf(p) >= 0; }); }
    function distancia(a, b) {
      var x = pcs(a), y = pcs(b), soma = 0;
      x.forEach(function (p) { var d = Math.min.apply(Math, y.map(function (q) { var z = Math.abs(p - q) % 12; return Math.min(z, 12 - z); })); soma += isFinite(d) ? d : 6; });
      return Math.round((soma / Math.max(1, x.length)) * 10) / 10;
    }
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var entrada = el('textarea', { rows: 2, class: 'lab-textarea', value: st.texto, 'aria-label': 'Sequência de acordes' });
      entrada.value = st.texto;
      alvo.appendChild(el('div', { class: 'lab-controles' }, [
        el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Acordes (separe por vírgulas)' }), entrada]),
        el('button', { type: 'button', class: 'btn', txt: 'Atualizar mapa', onclick: function () { st.texto = entrada.value; render(); } }),
        el('button', { type: 'button', class: 'btn sec', txt: '▶ Ouvir sequência', onclick: function () { lerAcordes().forEach(function (a, i) { C.Som.tocar((A.notas(naOitava(a.fundamental, 3), a.id) || []).map(N.midi), { modo: 'harmonico', dur: 0.7, quando: i * 0.8 }); }); } })
      ]));
      var acs = lerAcordes();
      if (!acs.length) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Digite pelo menos dois acordes, por exemplo: C, Am, F, G.' })); return; }
      var nodes = acs.map(function (a, i) { return el('button', { type: 'button', class: 'lab-mapa-no', title: 'Ouvir ' + A.simbolo(a.fundamental, a.id), txt: A.simbolo(a.fundamental, a.id), onclick: function () { C.Som.tocar((A.notas(naOitava(a.fundamental, 3), a.id) || []).map(N.midi), { modo: 'harmonico' }); } }); });
      alvo.appendChild(el('div', { class: 'lab-mapa-linha', role: 'list', 'aria-label': 'Acordes da sequência' }, nodes));
      var linhas = [];
      for (var i = 0; i < acs.length - 1; i++) { var c = comum(acs[i], acs[i + 1]); linhas.push(el('tr', {}, [el('td', { txt: A.simbolo(acs[i].fundamental, acs[i].id) }), el('td', { txt: A.simbolo(acs[i + 1].fundamental, acs[i + 1].id) }), el('td', { txt: c.length ? c.map(function (p) { return rot(N.deClasse(p)); }).join(', ') : 'nenhuma' }), el('td', { txt: distancia(acs[i], acs[i + 1]) + ' semitons médios' })])); }
      alvo.appendChild(el('div', { class: 'lab-resultado' }, [el('p', { txt: 'Quanto maior o número de notas em comum e menor a distância, mais suave tende a ser a ligação. Use isso como ponto de partida para inversões, suspensões e substituições.' }), el('table', { class: 'lab-tabela' }, [el('thead', {}, [el('tr', {}, ['De', 'Para', 'Notas em comum', 'Distância'].map(function (x) { return el('th', { scope: 'col', txt: x }); }))]), el('tbody', {}, linhas)])]));
       alvo.appendChild(el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar mapa JSON', onclick: function () { C.baixar('mapa-harmonia.json', 'application/json', JSON.stringify({ acordes: acs.map(function (a) { return A.simbolo(a.fundamental, a.id); }), ligacoes: acs.slice(0, -1).map(function (a, i) { var b = acs[i + 1], c = comum(a, b); return { de: A.simbolo(a.fundamental, a.id), para: A.simbolo(b.fundamental, b.id), notas_em_comum: c.map(function (p) { return rot(N.deClasse(p)); }), distancia_media_semitons: distancia(a, b) }; }), criado_em: new Date().toISOString() }, null, 2)); } }));
    }
    render();
  };

  F['acordes-vizinhos'] = function (alvo, st) {
    st.acordeTexto = st.acordeTexto || 'C';
    st.raio = st.raio || '1';
    function gerar() {
      var base = A.ler(st.acordeTexto), raio = Math.max(1, Math.min(3, Number(st.raio) || 1));
      if (!base) return { base: null, itens: [] };
      var ns = A.notas(naOitava(base.fundamental, 4), base.id) || [], orig = ns.map(N.pc), vistos = {};
      var itens = [];
      ns.forEach(function (n, ni) { for (var d = 1; d <= raio; d++) [-1, 1].forEach(function (dir) {
        var teste = ns.map(N.midi), j = teste.indexOf(N.midi(n)); if (j < 0) j = ni; teste[j] += dir * d;
        var achados = A.identificar(teste).filter(function (x) { return x.exata; });
        achados.forEach(function (x) { var chave = x.fundamental.li + ':' + x.fundamental.alt + ':' + x.id; if (vistos[chave]) return; vistos[chave] = 1; var xpcs = (A.notas(x.fundamental, x.id) || []).map(N.pc); itens.push({ a: x, movida: rot(n) + (dir < 0 ? ' ↓' : ' ↑') + d, comum: orig.filter(function (p) { return xpcs.indexOf(p) >= 0; }).length }); });
      }); });
      return { base: base, itens: itens.slice(0, 24) };
    }
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var campo = el('input', { type: 'text', value: st.acordeTexto, placeholder: 'Ex.: Cmaj7, F, Bm7(b5)' }); campo.value = st.acordeTexto;
      var raio = el('select', {}, [1, 2, 3].map(function (n) { return el('option', { value: String(n), txt: n + ' semitom' + (n > 1 ? 's' : '') }); })); raio.value = st.raio;
      alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Acorde de partida' }), campo]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Raio' }), raio]), el('button', { type: 'button', class: 'btn', txt: 'Explorar vizinhos', onclick: function () { st.acordeTexto = campo.value; st.raio = raio.value; render(); } })]));
      var r = gerar(); if (!r.base) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Digite um acorde válido, por exemplo C, Am7 ou G7.' })); return; }
      var baseNs = A.notas(naOitava(r.base.fundamental, 3), r.base.id) || [];
      alvo.appendChild(el('div', { class: 'lab-resultado' }, [el('p', { txt: 'Partida: ' + A.simbolo(r.base.fundamental, r.base.id) + ' · ' + baseNs.map(rot).join(', ') }), el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir partida', onclick: function () { C.Som.tocar(baseNs.map(N.midi), { modo: 'harmonico' }); } })]));
      alvo.appendChild(el('div', { class: 'lab-vizinhos' }, r.itens.map(function (x) { var ns2 = A.notas(naOitava(x.a.fundamental, 3), x.a.id) || []; return el('article', { class: 'lab-vizinho' }, [el('h3', { txt: A.simbolo(x.a.fundamental, x.a.id) }), el('p', { txt: 'Moveu ' + x.movida + ' · ' + x.comum + ' nota(s) em comum' }), el('p', { class: 'lab-dica', txt: ns2.map(rot).join(' · ') }), el('button', { type: 'button', class: 'btn sec', txt: '▶ Ouvir', onclick: function () { C.Som.tocar(ns2.map(N.midi), { modo: 'harmonico' }); } })]); })));
       alvo.appendChild(el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar acordes vizinhos JSON', onclick: function () { C.baixar('acordes-vizinhos.json', 'application/json', JSON.stringify({ partida: A.simbolo(r.base.fundamental, r.base.id), raio: Number(st.raio) || 1, vizinhos: r.itens.map(function (x) { return { acorde: A.simbolo(x.a.fundamental, x.a.id), movimento: x.movida, notas_em_comum: x.comum, notas: (A.notas(naOitava(x.a.fundamental, 3), x.a.id) || []).map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }) }; }), criado_em: new Date().toISOString() }, null, 2)); } }));
      if (!r.itens.length) alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Nenhum nome de acorde do catálogo foi encontrado nesse raio. Tente aumentar para dois ou três semitons.' }));
    }
    render();
  };

  F['harmonizador-tonalidades'] = function (alvo, st) {
    st.t1 = st.t1 || 'do'; st.t2 = st.t2 || 'sol'; st.t3 = st.t3 || 'fa';
    st.m1 = st.m1 || 'maior'; st.m2 = st.m2 || 'maior'; st.m3 = st.m3 || 'maior';
    function modo(valor, chave) { return el('select', {}, ['maior', 'menor'].map(function (x) { return el('option', { value: x, txt: x === 'maior' ? 'maior' : 'menor' }); })); }
    function campo(t, m) { return T.campo(N.deSlug(t) || N.ler(t), m) || []; }
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var cfg = [['t1', 'm1', 'Tonalidade 1'], ['t2', 'm2', 'Tonalidade 2'], ['t3', 'm3', 'Tonalidade 3']];
      var controles = cfg.map(function (x) { var md = modo(st[x[1]], x[1]); md.value = st[x[1]]; md.onchange = function () { st[x[1]] = md.value; render(); }; var tn = C.selTonica(st[x[0]], function (v) { st[x[0]] = v; render(); }); return el('fieldset', { class: 'lab-campo' }, [el('legend', { txt: x[2] }), tn, md]); });
      alvo.appendChild(el('div', { class: 'lab-controles' }, controles));
      var cs = cfg.map(function (x) { return campo(st[x[0]], st[x[1]]); });
      var por = {}; cs.forEach(function (c, i) { c.forEach(function (g) { por[g.simbolo] = por[g.simbolo] || []; por[g.simbolo][i] = g; }); });
      var simbolos = Object.keys(por).sort(function (a, b) { return a.localeCompare(b); });
      var comuns = simbolos.filter(function (s) { return por[s].filter(Boolean).length >= 2; });
      var tabela = simbolos.map(function (s) { return el('tr', {}, [el('th', { scope: 'row', txt: s })].concat(cfg.map(function (_, i) { var g = por[s][i]; return el('td', { class: g ? 'lab-acorde-comum' : '', txt: g ? g.romano + ' · ' + g.funcao : '—' }); }))); });
      var cab = el('tr', {}, [el('th', { scope: 'col', txt: 'Acorde' })].concat(cfg.map(function (x) { return el('th', { scope: 'col', txt: x[2] }); })));
      alvo.appendChild(el('div', { class: 'lab-resultado' }, [
        el('p', { txt: comuns.length + ' acorde(s) aparecem em pelo menos duas tonalidades. Eles podem servir como pivôs de modulação.' }),
        el('table', { class: 'lab-tabela' }, [el('thead', {}, [cab]), el('tbody', {}, tabela)])
      ]));
       alvo.appendChild(el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar pivôs JSON', onclick: function () { C.baixar('harmonizador-tonalidades.json', 'application/json', JSON.stringify({ tonalidades: cfg.map(function (x) { return { nome: x[2], tonica: st[x[0]], modo: st[x[1]] }; }), acordes_comuns: comuns, tabela: simbolos.map(function (s) { return { acorde: s, tonalidades: cfg.map(function (_, i) { var g = por[s][i]; return g ? { romano: g.romano, funcao: g.funcao } : null; }) }; }), criado_em: new Date().toISOString() }, null, 2)); } }));
    }
    render();
  };

  F['piano-roll-harmonico'] = function (alvo, st) {
    st.texto = st.texto || 'C, Am, F, G'; st.bpm = st.bpm || 80;
    function acordes() { return st.texto.split(/[;,\n]+/).map(function (x) { return A.ler(x.trim()); }).filter(Boolean).slice(0, 16); }
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
       var txt = el('textarea', { rows: 2, class: 'lab-textarea', 'aria-label': 'Progressão para o piano roll' }); txt.value = st.texto;
       var bpm = el('input', { type: 'number', min: 30, max: 220, value: st.bpm, 'aria-label': 'BPM' }); bpm.value = st.bpm;
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar piano roll JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); var lista = Array.isArray(j.acordes) ? j.acordes : (Array.isArray(j.progressao) ? j.progressao : []); if (!lista.length) throw new Error('O JSON não contém acordes.'); st.texto = lista.map(String).join(', '); st.bpm = Math.max(30, Math.min(220, Number(j.bpm) || 80)); render(); C.aviso('Piano roll importado.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Acordes' }), txt]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'BPM' }), bpm]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Atualizar', onclick: function () { st.texto = txt.value; st.bpm = Math.max(30, Math.min(220, Number(bpm.value) || 80)); render(); } })]));
      var acs = acordes(); if (!acs.length) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Digite uma progressão, como C, Am, F, G.' })); return; }
      var notas = []; acs.forEach(function (a, i) { (A.notas(naOitava(a.fundamental, 4), a.id) || []).forEach(function (n) { notas.push({ midi: N.midi(n), nome: rot(n), passo: i, acorde: A.simbolo(a.fundamental, a.id) }); }); });
      var lo = Math.min.apply(Math, notas.map(function (x) { return x.midi; })) - 1, hi = Math.max.apply(Math, notas.map(function (x) { return x.midi; })) + 1, altura = Math.max(1, hi - lo + 1);
      var roll = el('div', { class: 'lab-roll', role: 'img', 'aria-label': 'Piano roll da progressão' });
      for (var m = hi; m >= lo; m--) { var linha = el('div', { class: 'lab-roll-linha' }); linha.appendChild(el('span', { class: 'lab-roll-nota', txt: rot(N.deMidi(m)) })); linha.appendChild(el('div', { class: 'lab-roll-grade' })); roll.appendChild(linha); }
      notas.forEach(function (x) { var barra = el('button', { type: 'button', class: 'lab-roll-barra', title: x.acorde + ' · ' + x.nome, txt: x.nome, style: 'left:' + (x.passo * 100 / acs.length) + '%;width:' + (100 / acs.length - 1) + '%;bottom:' + ((x.midi - lo) * 100 / altura) + '%', onclick: function () { C.Som.tocar([x.midi], { dur: 0.6 }); } }); roll.appendChild(barra); });
      alvo.appendChild(el('div', { class: 'lab-roll-cabecalho' }, acs.map(function (a) { return el('span', { txt: A.simbolo(a.fundamental, a.id) }); })));
      alvo.appendChild(roll);
      function exportarPianoRoll(png) {
        var W = 900, H = 500, s = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><rect width="100%" height="100%" fill="#f8fbff"/>'];
        notas.forEach(function (x) { var xx = 90 + x.passo * (W - 110) / acs.length, yy = 30 + (hi - x.midi) * (H - 70) / altura; s.push('<rect x="' + xx.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + ((W - 110) / acs.length - 5).toFixed(1) + '" height="18" rx="4" fill="#8dc8ff" stroke="#14213d"/><text x="' + (xx + 4) + '" y="' + (yy + 13) + '" font-family="Arial" font-size="11">' + D.esc(x.nome) + '</text>'); });
        s.push('</svg>'); var svgTexto = s.join(''); if (png) C.baixarPng('piano-roll-harmonico.png', svgTexto, 1800, 1000); else C.baixar('piano-roll-harmonico.svg', 'image/svg+xml', svgTexto);
      }
       alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar piano roll SVG', onclick: function () { exportarPianoRoll(false); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar piano roll PNG', onclick: function () { exportarPianoRoll(true); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar piano roll JSON', onclick: function () { C.baixar('piano-roll-harmonico.json', 'application/json', JSON.stringify({ bpm: st.bpm, progressao: st.texto, acordes: acs.map(function (a) { return A.simbolo(a.fundamental, a.id); }), notas: notas.map(function (x) { return { nota: x.nome, midi: x.midi, acorde: x.acorde, passo: x.passo }; }), criado_em: new Date().toISOString() }, null, 2)); } })]));
      alvo.appendChild(el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir progressão', onclick: function () { var dur = 60 / st.bpm * 2; acs.forEach(function (a, i) { setTimeout(function () { C.Som.tocar((A.notas(naOitava(a.fundamental, 3), a.id) || []).map(N.midi), { modo: 'harmonico', dur: dur * 0.9 }); }, i * dur * 1000); }); } }));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Cada coluna representa um acorde. As barras alinhadas mostram a altura das notas e ajudam a enxergar notas comuns e caminhos melódicos.' }));
    }
    render();
  };

  F['mandala-harmonica'] = function (alvo, st) {
    st.texto = st.texto || 'C, Am, F, G';
    function acs() { return st.texto.split(/[;,\n]+/).map(function (x) { return A.ler(x.trim()); }).filter(Boolean).slice(0, 12); }
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var txt = el('textarea', { rows: 2, class: 'lab-textarea', 'aria-label': 'Acordes da mandala' }); txt.value = st.texto;
      var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar mandala JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); var lista = Array.isArray(j.acordes) ? j.acordes : (Array.isArray(j.progressao) ? j.progressao : []); if (!lista.length) throw new Error('O JSON não contém acordes.'); st.texto = lista.map(String).join(', '); render(); C.aviso('Progressão importada na mandala.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
      alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Progressão' }), txt]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Atualizar mandala', onclick: function () { st.texto = txt.value; render(); } })]));
      var lista = acs(); if (!lista.length) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Digite acordes separados por vírgula.' })); return; }
      var mandala = el('div', { class: 'lab-mandala', role: 'img', 'aria-label': 'Mandala de acordes' });
      mandala.appendChild(el('div', { class: 'lab-mandala-centro', txt: 'HARMONIA' }));
      lista.forEach(function (a, i) { var ang = (360 / lista.length) * i - 90; var ns = A.notas(naOitava(a.fundamental, 4), a.id) || []; var comum = i ? (A.notas(naOitava(lista[i - 1].fundamental, 4), lista[i - 1].id) || []).map(N.pc).filter(function (p) { return ns.map(N.pc).indexOf(p) >= 0; }) : []; mandala.appendChild(el('button', { type: 'button', class: 'lab-mandala-no', style: 'transform:rotate(' + ang + 'deg) translateY(-132px) rotate(' + (-ang) + 'deg)', title: comum.length ? comum.length + ' nota(s) em comum com o anterior' : 'Ouvir acorde', txt: A.simbolo(a.fundamental, a.id), onclick: function () { C.Som.tocar(ns.map(N.midi), { modo: 'harmonico' }); } })); });
      alvo.appendChild(mandala);
      function exportarMandala(png) {
        var s = ['<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="100%" height="100%" fill="#f8fbff"/><circle cx="300" cy="300" r="220" fill="none" stroke="#aac8df" stroke-width="2"/><circle cx="300" cy="300" r="145" fill="none" stroke="#8db1cf" stroke-dasharray="4 4"/>'];
        lista.forEach(function (a, i) { var ang = (360 / lista.length) * i - 90, rad = ang * Math.PI / 180, x = 300 + 220 * Math.cos(rad), y = 300 + 220 * Math.sin(rad); s.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="28" fill="#fff" stroke="#14213d"/><text x="' + x.toFixed(1) + '" y="' + (y + 5).toFixed(1) + '" text-anchor="middle" font-family="Arial" font-size="13">' + D.esc(A.simbolo(a.fundamental, a.id)) + '</text>'); });
        s.push('<circle cx="300" cy="300" r="48" fill="#14213d"/><text x="300" y="305" text-anchor="middle" fill="#fff" font-family="Arial" font-size="12">HARMONIA</text></svg>');
        var svgTexto = s.join(''); if (png) C.baixarPng('mandala-harmonica.png', svgTexto, 1200, 1200); else C.baixar('mandala-harmonica.svg', 'image/svg+xml', svgTexto);
      }
       alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar mandala SVG', onclick: function () { exportarMandala(false); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar mandala PNG', onclick: function () { exportarMandala(true); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar mandala JSON', onclick: function () { C.baixar('mandala-harmonica.json', 'application/json', JSON.stringify({ acordes: lista.map(function (a, i) { var ns = A.notas(naOitava(a.fundamental, 4), a.id) || []; var anterior = i ? (A.notas(naOitava(lista[i - 1].fundamental, 4), lista[i - 1].id) || []) : []; var pcs = anterior.map(N.pc); return { ordem: i + 1, simbolo: A.simbolo(a.fundamental, a.id), notas: ns.map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }), notas_em_comum_com_anterior: ns.filter(function (n) { return pcs.indexOf(N.pc(n)) >= 0; }).map(rot) }; }), criado_em: new Date().toISOString() }, null, 2)); } })]));
      alvo.appendChild(el('p', { class: 'lab-dica' }, ['Os acordes giram em torno de um centro comum. Passe o cursor sobre cada nó para ver a relação com o acorde anterior; clique para ouvir.']));
    }
    render();
  };

  F['superestruturas-acordes'] = function (alvo, st) {
    st.notasTexto = st.notasTexto || 'C, E';
    function lerNotas() { return st.notasTexto.split(/[;,\s]+/).map(function (x) { return N.ler(x.trim()); }).filter(Boolean).slice(0, 4); }
    function buscar(ns) {
      var pcs = ns.map(N.pc).filter(function (p, i, a) { return a.indexOf(p) === i; }), out = [];
      if (pcs.length < 2) return out;
      for (var r = 0; r < 12; r++) A.CATALOGO.forEach(function (c) { var f = N.deClasse(r), notas = A.notas(f, c.id) || [], cp = notas.map(N.pc); if (pcs.every(function (p) { return cp.indexOf(p) >= 0; })) out.push({ simbolo: A.simbolo(f, c.id), id: c.id, fundamental: f, notas: notas }); });
      return out.slice(0, 80);
    }
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
       var inp = el('input', { type: 'text', class: 'lab-textarea', value: st.notasTexto, placeholder: 'Ex.: C, E, Bb' }); inp.value = st.notasTexto;
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar superestruturas JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result), ns = Array.isArray(j.notas_essenciais) ? j.notas_essenciais : []; if (!ns.length) throw new Error('O JSON não contém notas essenciais.'); st.notasTexto = ns.map(function (n) { return n.nota || n; }).join(', '); render(); C.aviso('Notas essenciais importadas.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Notas essenciais' }), inp]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Encontrar acordes', onclick: function () { st.notasTexto = inp.value; render(); } })]));
      var ns = lerNotas(), res = buscar(ns);
      if (ns.length < 2) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Informe pelo menos duas notas.' })); return; }
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Notas procuradas: ' + ns.map(rot).join(' · ') + '. Os resultados contêm todas elas; as demais notas funcionam como cor e tensão.' }));
      alvo.appendChild(el('div', { class: 'lab-super-grid' }, res.map(function (x) { return el('article', { class: 'lab-super-card' }, [el('h3', { txt: x.simbolo }), el('p', { txt: x.notas.map(rot).join(' · ') }), el('button', { type: 'button', class: 'btn sec', txt: '▶ Ouvir', onclick: function () { C.Som.tocar(x.notas.map(N.midi), { modo: 'harmonico' }); } })]); })));
       alvo.appendChild(el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar superestruturas JSON', onclick: function () { C.baixar('superestruturas-acordes.json', 'application/json', JSON.stringify({ notas_essenciais: ns.map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }), resultados: res.map(function (x) { return { acorde: x.simbolo, notas: x.notas.map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }) }; }), criado_em: new Date().toISOString() }, null, 2)); } }));
      if (!res.length) alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Nenhum acorde do catálogo contém exatamente esse conjunto. Tente remover uma nota ou usar uma grafia enarmônica.' }));
    }
    render();
  };

  F['intervalos-do-acorde'] = function (alvo, st) {
    st.acordeTexto = st.acordeTexto || 'Cmaj7';
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
       var inp = el('input', { type: 'text', class: 'lab-textarea', value: st.acordeTexto, placeholder: 'Ex.: Cmaj7, Dm7, G7(b9)' }); inp.value = st.acordeTexto;
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar intervalos JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); if (!j.acorde) throw new Error('O JSON não contém um acorde.'); st.acordeTexto = String(j.acorde); render(); C.aviso('Acorde importado para análise.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Acorde' }), inp]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Analisar intervalos', onclick: function () { st.acordeTexto = inp.value; render(); } })]));
      var a = A.ler(st.acordeTexto); if (!a) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Digite um acorde válido.' })); return; }
      var ns = A.notas(naOitava(a.fundamental, 4), a.id) || [], pares = [];
      for (var i = 0; i < ns.length; i++) for (var j = i + 1; j < ns.length; j++) { var iv = I.entre(ns[i], ns[j]); if (iv) pares.push({ de: ns[i], para: ns[j], iv: iv }); }
      alvo.appendChild(el('p', { class: 'lab-dica', txt: A.simbolo(a.fundamental, a.id) + ' · ' + ns.map(rot).join(' · ') }));
      alvo.appendChild(el('div', { class: 'lab-intervalos-grid' }, pares.map(function (p) { return el('button', { type: 'button', class: 'lab-intervalo-card', title: p.iv.nome, onclick: function () { C.Som.tocar([N.midi(p.de), N.midi(p.para)], { modo: 'harmonico', dur: 0.9 }); } }, [el('strong', { txt: p.iv.curto }), el('span', { txt: rot(p.de) + ' → ' + rot(p.para) }), el('small', { txt: p.iv.semitons + ' semitons · ' + p.iv.nome })]); })));
       alvo.appendChild(el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar intervalos JSON', onclick: function () { C.baixar('intervalos-do-acorde.json', 'application/json', JSON.stringify({ acorde: A.simbolo(a.fundamental, a.id), notas: ns.map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }), intervalos: pares.map(function (p) { return { de: rot(p.de), para: rot(p.para), semitons: p.iv.semitons, nome: p.iv.nome, simbolo: p.iv.curto }; }), criado_em: new Date().toISOString() }, null, 2)); } }));
      if (!pares.length) alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Esse acorde não tem pares de notas suficientes para comparar.' }));
    }
    render();
  };

  F['editor-de-braco'] = function (alvo, st) {
    st.instrumento = st.instrumento || 'violao'; st.afinacao = st.afinacao || 'padrao'; st.acordeTexto = st.acordeTexto || 'C'; st.casas = st.casas || 12;
    function render() {
      C.gravarUrl(st); C.limpar(alvo); var ins = INS.instrumento(st.instrumento); if (!ins) { st.instrumento = 'violao'; ins = INS.instrumento(st.instrumento); }
      var afs = Object.keys(ins.afinacoes || {}).map(function (k) { return { valor: k, rotulo: ins.afinacoes[k].nome }; }); if (!ins.afinacoes[st.afinacao]) st.afinacao = afs[0] && afs[0].valor || 'padrao';
      var inp = el('input', { type: 'text', value: st.acordeTexto, placeholder: 'Acorde, ex.: Am7' }); inp.value = st.acordeTexto;
      var inst = C.select('lab-editor-inst', 'Instrumento', Object.keys(INS.CORDAS).map(function (k) { return { valor: k, rotulo: INS.CORDAS[k].nome }; }), st.instrumento, function (v) { st.instrumento = v; st.afinacao = 'padrao'; render(); });
      var af = C.select('lab-editor-af', 'Afinação', afs, st.afinacao, function (v) { st.afinacao = v; render(); });
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar shape JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); if (!j.acorde) throw new Error('O JSON não contém um acorde.'); st.acordeTexto = String(j.acorde); if (j.instrumento_id && INS.CORDAS[j.instrumento_id]) st.instrumento = j.instrumento_id; if (j.afinacao) st.afinacao = String(j.afinacao); if (j.casas) st.casas = Number(j.casas) || 12; render(); C.aviso('Shape importado.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [inst, af, el('label', { class: 'lab-campo' }, [el('span', { txt: 'Acorde' }), inp]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Atualizar braço', onclick: function () { st.acordeTexto = inp.value; render(); } })]));
      var a = A.ler(st.acordeTexto); if (!a) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Digite um acorde válido.' })); return; }
      var ns = A.notas(naOitava(a.fundamental, 4), a.id) || [], pcs = ns.map(N.pc), afin = INS.afinacao(st.instrumento, st.afinacao), pos = INS.posicoes(afin, pcs, Number(st.casas) || 12), por = {}; ns.forEach(function (n) { por[N.pc(n)] = n; });
      var dest = pos.map(function (p) { return { corda: p.corda, casa: p.casa, rotulo: rot(por[p.pc]), tipo: p.pc === N.pc(a.fundamental) ? 'raiz' : 'nota' }; });
      var box = svg(D.braco({ afinacao: afin, casas: Number(st.casas) || 12, destaques: dest, interativo: true, notacao: C.notacao, titulo: 'Editor de ' + ins.nome }));
      box.addEventListener('click', function (e) { var k = e.target.closest('[data-midi]'); if (k) C.Som.tocar([Number(k.dataset.midi)], { modo: 'dedilhado', dur: 1.1 }); });
      alvo.appendChild(el('figure', { class: 'lab-fig' }, [box, el('figcaption', { txt: A.simbolo(a.fundamental, a.id) + ' · clique em uma posição para ouvir.' })]));
      alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar braço SVG', onclick: function () { C.baixar('editor-de-braco.svg', 'image/svg+xml', box.innerHTML); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar braço PNG', onclick: function () { C.baixarPng('editor-de-braco.png', box.innerHTML, 1400, 700); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar braço JSON', onclick: function () { C.baixar('editor-de-braco.json', 'application/json', JSON.stringify({ instrumento: ins.nome, instrumento_id: st.instrumento, afinacao: st.afinacao, acorde: A.simbolo(a.fundamental, a.id), casas: Number(st.casas) || 12, posicoes: pos.map(function (p) { return { corda: p.corda, casa: p.casa, nota: rot(por[p.pc]), midi: N.midi(p.nota || por[p.pc]) }; }), criado_em: new Date().toISOString() }, null, 2)); } })]));
      var linhas = []; for (var c = 0; c < afin.midi.length; c++) { var p = pos.filter(function (x) { return x.corda === c; }).sort(function (x, y) { return x.casa - y.casa; })[0]; linhas.push((afin.nomes && afin.nomes[c] ? afin.nomes[c] : 'corda ' + (c + 1)) + ': ' + (p ? p.casa : 'x')); }
      alvo.appendChild(el('pre', { class: 'lab-tablatura', txt: linhas.join('\n') }));
    }
    render();
  };

  F['visualizador-frequencia'] = function (alvo, st) {
    st.acordeTexto = st.acordeTexto || 'C'; st.harmonicos = st.harmonicos || 8;
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
       var inp = el('input', { type: 'text', value: st.acordeTexto, placeholder: 'Nota ou acorde, ex.: Cmaj7' }); inp.value = st.acordeTexto;
      var qtd = el('input', { type: 'number', min: 1, max: 16, value: st.harmonicos }); qtd.value = st.harmonicos;
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar espectro JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); if (!j.entrada) throw new Error('O JSON não contém uma entrada.'); st.acordeTexto = String(j.entrada); st.harmonicos = Math.max(1, Math.min(16, Number(j.harmonicos_por_nota) || 8)); render(); C.aviso('Espectro importado.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Nota ou acorde' }), inp]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Harmônicos por nota' }), qtd]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Atualizar espectro', onclick: function () { st.acordeTexto = inp.value; st.harmonicos = Math.max(1, Math.min(16, Number(qtd.value) || 8)); render(); } })]));
      var a = A.ler(st.acordeTexto), ns = a ? (A.notas(naOitava(a.fundamental, 4), a.id) || []) : [N.ler(st.acordeTexto)]; ns = ns.filter(Boolean); if (!ns.length) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Digite uma nota ou acorde válido.' })); return; }
      var dados = []; ns.forEach(function (n) { AC.serieHarmonica(n, Number(st.harmonicos) || 8).forEach(function (h) { dados.push({ h: h, base: rot(n) }); }); });
      var max = Math.max.apply(Math, dados.map(function (x) { return x.h.hz; }));
      alvo.appendChild(el('div', { class: 'lab-frequencias' }, dados.map(function (x) { var alt = Math.max(10, Math.round(130 * Math.log(1 + x.h.hz) / Math.log(1 + max))); return el('button', { type: 'button', class: 'lab-frequencia-barra', style: 'height:' + alt + 'px', title: x.base + ' · ' + x.h.harmonico + 'º harmônico', onclick: function () { C.Som.tocarHz([x.h.hz], { dur: 0.7 }); } }, [el('span', { txt: x.h.harmonico }), el('small', { txt: Math.round(x.h.hz) + ' Hz' })]); })));
       alvo.appendChild(el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar espectro JSON', onclick: function () { C.baixar('visualizador-frequencia.json', 'application/json', JSON.stringify({ entrada: st.acordeTexto, harmonicos_por_nota: Number(st.harmonicos) || 8, componentes: dados.map(function (x) { return { nota: x.base, harmonico: x.h.harmonico, hz: x.h.hz }; }), criado_em: new Date().toISOString() }, null, 2)); } }));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Clique em uma barra para ouvir o componente. A altura é uma escala visual logarítmica; o espectro real depende do timbre e da execução.' }));
    }
    render();
  };

  F['policordes'] = function (alvo, st) {
    st.a1 = st.a1 || 'C'; st.a2 = st.a2 || 'D';
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
       var i1 = el('input', { type: 'text', value: st.a1, placeholder: 'C' }); i1.value = st.a1;
       var i2 = el('input', { type: 'text', value: st.a2, placeholder: 'D' }); i2.value = st.a2;
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar policorde JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); if (!j.inferior || !j.superior) throw new Error('O JSON não contém os dois acordes.'); st.a1 = String(j.inferior); st.a2 = String(j.superior); render(); C.aviso('Policorde importado.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Acorde inferior' }), i1]), el('span', { class: 'lab-policorde-sinal', txt: '+' }), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Acorde superior' }), i2]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Combinar', onclick: function () { st.a1 = i1.value; st.a2 = i2.value; render(); } })]));
      var a = A.ler(st.a1), b = A.ler(st.a2); if (!a || !b) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Digite dois acordes válidos, por exemplo C e D.' })); return; }
      var baixo = A.notas(naOitava(a.fundamental, 3), a.id) || [], alto = A.notas(naOitava(b.fundamental, 4), b.id) || [], todos = baixo.concat(alto), pcs = todos.map(N.pc).filter(function (p, i, x) { return x.indexOf(p) === i; }), nomes = A.identificar(todos).slice(0, 6);
      alvo.appendChild(el('div', { class: 'lab-policorde-pilhas' }, [el('div', { class: 'lab-super-card' }, [el('h3', { txt: A.simbolo(a.fundamental, a.id) }), el('p', { txt: baixo.map(rot).join(' · ') })]), el('div', { class: 'lab-policorde-sinal', txt: '+' }), el('div', { class: 'lab-super-card' }, [el('h3', { txt: A.simbolo(b.fundamental, b.id) }), el('p', { txt: alto.map(rot).join(' · ') })])]));
      alvo.appendChild(el('div', { class: 'lab-resultado' }, [el('p', { txt: 'Conjunto combinado: ' + pcs.map(function (p) { return rot(N.deClasse(p)); }).join(' · ') }), el('p', { txt: nomes.length ? 'Possíveis leituras: ' + nomes.map(function (x) { return x.simbolo; }).join(', ') : 'O conjunto é tratado como policorde, sem uma leitura única no catálogo.' }), el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir policorde', onclick: function () { C.Som.tocar(todos.map(N.midi), { modo: 'harmonico', dur: 1.8 }); } })]));
       alvo.appendChild(el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar policorde JSON', onclick: function () { C.baixar('policorde-musique.json', 'application/json', JSON.stringify({ inferior: A.simbolo(a.fundamental, a.id), superior: A.simbolo(b.fundamental, b.id), notas_inferiores: baixo.map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }), notas_superiores: alto.map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }), conjunto: pcs.map(function (p) { return rot(N.deClasse(p)); }), leituras: nomes.map(function (x) { return x.simbolo; }), criado_em: new Date().toISOString() }, null, 2)); } }));
    }
    render();
  };

  F['editor-de-progressao'] = function (alvo, st) {
    st.lista = st.lista || ['C', 'Am', 'F', 'G'];
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var inp = el('input', { type: 'text', placeholder: 'Novo acorde, ex.: Dm7' });
      var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar progressão JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); var lista = Array.isArray(j.acordes) ? j.acordes : (Array.isArray(j.progressao) ? j.progressao : []); if (!lista.length) throw new Error('O JSON não contém uma lista de acordes.'); st.lista = lista.map(String).filter(function (x) { return A.ler(x); }); if (!st.lista.length) throw new Error('Nenhum acorde válido foi encontrado.'); render(); C.aviso('Progressão importada.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
      alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Adicionar acorde' }), inp]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: '+ Adicionar', onclick: function () { var a = A.ler(inp.value.trim()); if (a) { st.lista.push(inp.value.trim()); render(); } } }), el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir progressão', onclick: function () { st.lista.map(A.ler).filter(Boolean).forEach(function (a, i) { setTimeout(function () { C.Som.tocar((A.notas(naOitava(a.fundamental, 3), a.id) || []).map(N.midi), { modo: 'harmonico', dur: 0.8 }); }, i * 850); }); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar MIDI', onclick: function () { if (!C.midiArquivo) return; var ev = []; st.lista.map(A.ler).filter(Boolean).forEach(function (a, i) { (A.notas(naOitava(a.fundamental, 3), a.id) || []).forEach(function (n) { ev.push({ t: i * 4, dur: 4, midi: N.midi(n), vel: 78 }); }); }); C.baixar('progressao-musique.mid', 'audio/midi', C.midiArquivo(ev, 80, 4)); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar JSON', onclick: function () { C.baixar('progressao-musique.json', 'application/json', JSON.stringify({ acordes: st.lista, criado_em: new Date().toISOString() }, null, 2)); } })]));
      var nos = el('div', { class: 'lab-nos-progressao' }); st.lista.forEach(function (s, i) { var a = A.ler(s); if (!a) return; nos.appendChild(el('article', { class: 'lab-no-progressao' }, [el('strong', { txt: (i + 1) + '. ' + A.simbolo(a.fundamental, a.id) }), el('div', { class: 'lab-no-acoes' }, [el('button', { type: 'button', title: 'Mover para a esquerda', txt: '←', disabled: i === 0, onclick: function () { var x = st.lista.splice(i, 1)[0]; st.lista.splice(i - 1, 0, x); render(); } }), el('button', { type: 'button', title: 'Mover para a direita', txt: '→', disabled: i === st.lista.length - 1, onclick: function () { var x = st.lista.splice(i, 1)[0]; st.lista.splice(i + 1, 0, x); render(); } }), el('button', { type: 'button', title: 'Remover', txt: '×', onclick: function () { st.lista.splice(i, 1); render(); } })])])); });
      alvo.appendChild(nos);
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Cada cartão é um nó da progressão. Reordene os nós para comparar caminhos harmônicos diferentes.' }));
    }
    render();
  };

  F['metronomo-distorcido'] = function (alvo, st) {
    st.bpm = st.bpm || 80; st.swing = st.swing || 0; st.omitir = st.omitir || 0; var ag = null;
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var bpm = el('input', { type: 'range', min: 30, max: 220, value: st.bpm }); bpm.value = st.bpm;
      var swing = el('input', { type: 'range', min: 0, max: 65, value: st.swing }); swing.value = st.swing;
      var omit = el('input', { type: 'range', min: 0, max: 75, value: st.omitir }); omit.value = st.omitir;
      var info = el('p', { class: 'lab-dica', txt: 'BPM ' + st.bpm + ' · swing ' + st.swing + '% · omissões ' + st.omitir + '%' });
      function atualizar() { st.bpm = Number(bpm.value); st.swing = Number(swing.value); st.omitir = Number(omit.value); info.textContent = 'BPM ' + st.bpm + ' · swing ' + st.swing + '% · omissões ' + st.omitir + '%'; }
      [bpm, swing, omit].forEach(function (x) { x.oninput = atualizar; });
      var botao = el('button', { type: 'button', class: 'btn', txt: '▶ Iniciar', onclick: function () { atualizar(); if (ag) { C.Som.parar(); ag = null; botao.textContent = '▶ Iniciar'; return; } var por = 4; ag = C.Som.agendador({ bpm: st.bpm, porTempo: por, passos: 64, swing: st.swing / 100, aoPasso: function (i, q) { var forte = i % por === 0, perdido = !forte && Math.random() * 100 < st.omitir; if (!perdido) C.Som.bateria.clique(q, forte ? 0.9 : 0.55, forte); }, umaVez: false }); botao.textContent = '■ Parar'; } });
       var exportar = el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar groove MIDI', onclick: function () { if (!C.midiArquivo) return; var ev = []; for (var i = 0; i < 64; i++) { var forte = i % 4 === 0, perdido = !forte && ((i * 37 + 11) % 100 < st.omitir); if (!perdido) ev.push({ t: i, dur: 1, midi: forte ? 36 : 42, canal: 9, vel: forte ? 110 : 78 }); } C.baixar('metronomo-distorcido.mid', 'audio/midi', C.midiArquivo(ev, st.bpm, 4)); } });
       alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Andamento' }), bpm]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Swing' }), swing]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Omissões' }), omit]), botao, exportar])); alvo.appendChild(info);
    }
    render();
  };

  F['atlas-escalas'] = function (alvo, st) {
    st.tonica = st.tonica || 'do'; st.escala = st.escala || 'maior'; st.instrumento = st.instrumento || 'violao'; st.afinacao = st.afinacao || 'padrao';
    function render() {
      C.gravarUrl(st); C.limpar(alvo); var t = tonicaDe(st), t4 = naOitava(t, 4), e = E.porId(st.escala) || E.porId('maior'), ns = E.notas(t4, e.id) || [];
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar escala JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); if (!j.id || !E.porId(j.id)) throw new Error('O JSON não contém uma escala conhecida.'); st.escala = j.id; if (j.tonica) { var sl = N.slug(String(j.tonica)); if (sl) st.tonica = sl; } render(); C.aviso('Escala importada.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }), C.selEscala(st.escala, function (v) { st.escala = v; render(); }), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]) ]));
      var pcs = ns.map(N.pc), itens = pcs.map(function (p, i) { return { rotulo: rot(N.deClasse(p)), dado: i, tipo: i === 0 ? 'ativo' : 'nota', acessivel: rot(N.deClasse(p)) }; });
      var box = svg(D.anel({ itens: itens, poligono: pcs, titulo: rot(t) + ' ' + e.nome, centro: e.nome, descricao: 'Fórmula: ' + e.formula + ' · passos: ' + E.passos(e.id).join(' ') }));
      box.addEventListener('click', function (ev) { var g = ev.target.closest('[data-i]'); if (g) C.Som.tocar([60 + pcs[Number(g.getAttribute('data-i'))]], { dur: 0.5 }); });
      alvo.appendChild(el('div', { class: 'lab-grade-2' }, [el('figure', { class: 'lab-fig lab-fig-circ' }, [box]), el('div', {}, [el('h2', { txt: rot(t) + ' ' + e.nome }), el('p', { txt: 'Notas: ' + ns.map(rot).join(' · ') }), el('p', { txt: 'Fórmula: ' + e.formula + ' · passos: ' + E.passos(e.id).join(' ') }), el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir escala', onclick: function () { C.Som.tocar(ns.concat([N.comOitava(t4, t4.oitava + 1)]).map(N.midi), { dur: 0.35 }); } })])]));
       alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar escala SVG', onclick: function () { C.baixar('atlas-' + e.id + '.svg', 'image/svg+xml', box.innerHTML); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar escala PNG', onclick: function () { C.baixarPng('atlas-' + e.id + '.png', box.innerHTML, 1200, 700); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar escala JSON', onclick: function () { C.baixar('atlas-' + e.id + '.json', 'application/json', JSON.stringify({ tonica: rot(t), escala: e.nome, id: e.id, formula: e.formula, passos: E.passos(e.id), notas: ns.map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }), instrumento: st.instrumento, afinacao: st.afinacao, criado_em: new Date().toISOString() }, null, 2)); } })]));
      alvo.appendChild(bracoSvg(ns, t4, { instrumento: st.instrumento, afinacao: st.afinacao, casas: 12 }, null));
    }
    render();
  };

  F['arranjo-quatro-vozes'] = function (alvo, st) {
    st.texto = st.texto || 'C, Am, F, G';
    function render() {
       C.gravarUrl(st); C.limpar(alvo); var inp = el('textarea', { rows: 2, class: 'lab-textarea' }); inp.value = st.texto;
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar arranjo JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); var lista = Array.isArray(j.acordes) ? j.acordes : (Array.isArray(j.progressao) ? j.progressao : []); if (!lista.length) throw new Error('O JSON não contém uma progressão.'); st.texto = lista.map(String).join(', '); render(); C.aviso('Progressão carregada no arranjo.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Progressão' }), inp]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Gerar arranjo', onclick: function () { st.texto = inp.value; render(); } })]));
      var acs = st.texto.split(/[;,\n]+/).map(function (x) { return A.ler(x.trim()); }).filter(Boolean).slice(0, 12), anterior = null, vozes = [];
      acs.forEach(function (a) { var c = A.conduzir(anterior, a.fundamental, a.id), ns = c ? c.notas.slice() : (A.notas(naOitava(a.fundamental, 4), a.id) || []).slice(); ns.sort(function (x, y) { return N.midi(x) - N.midi(y); }); while (ns.length < 3) ns.push(ns[ns.length - 1] || naOitava(a.fundamental, 4)); vozes.push({ a: a, ns: ns.slice(-3), baixo: N.comOitava(a.baixo || a.fundamental, 2) }); anterior = ns; });
      if (!vozes.length) return;
      var cab = [el('th', { scope: 'col', txt: 'Voz' })].concat(vozes.map(function (v) { return el('th', { scope: 'col', txt: A.simbolo(v.a.fundamental, v.a.id) }); }));
      var rows = ['Soprano', 'Alto', 'Tenor', 'Baixo'].map(function (nome, i) { return el('tr', {}, [el('th', { scope: 'row', txt: nome })].concat(vozes.map(function (v) { var n = i === 3 ? v.baixo : v.ns[Math.min(i, v.ns.length - 1)]; return el('td', { txt: rot(n) }); }))); });
      alvo.appendChild(el('table', { class: 'lab-tabela' }, [el('thead', {}, [el('tr', {}, cab)]), el('tbody', {}, rows)]));
       alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir arranjo', onclick: function () { var dur = 1.1; vozes.forEach(function (v, i) { var ns = v.ns.concat([v.baixo]); setTimeout(function () { C.Som.tocar(ns.map(N.midi), { modo: 'harmonico', dur: dur * 0.95 }); }, i * dur * 1000); }); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar MIDI', onclick: function () { if (!C.midiArquivo) return; var ev = []; vozes.forEach(function (v, i) { v.ns.concat([v.baixo]).forEach(function (n) { ev.push({ t: i * 4, dur: 4, midi: N.midi(n), vel: 78 }); }); }); C.baixar('arranjo-quatro-vozes.mid', 'audio/midi', C.midiArquivo(ev, 80, 4)); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar JSON', onclick: function () { C.baixar('arranjo-quatro-vozes.json', 'application/json', JSON.stringify({ progressao: st.texto, vozes: vozes.map(function (v) { return { acorde: A.simbolo(v.a.fundamental, v.a.id), soprano_alto_tenor: v.ns.map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }), baixo: { nota: rot(v.baixo), midi: N.midi(v.baixo) } }; }), criado_em: new Date().toISOString() }, null, 2)); } })]));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'As três vozes superiores são conduzidas pelo menor movimento disponível; o baixo marca a fundamental ou inversão.' }));
    }
    render();
  };

  F['harmonizador-de-melodia'] = function (alvo, st) {
    st.tonica = st.tonica || 'do'; st.modo = st.modo || 'maior'; st.notasTexto = st.notasTexto || 'C, D, E, G';
    function render() {
       C.gravarUrl(st); C.limpar(alvo); var inp = el('textarea', { rows: 2, class: 'lab-textarea' }); inp.value = st.notasTexto;
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar harmonização JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); var lista = Array.isArray(j.melodia) ? j.melodia : []; if (!lista.length && Array.isArray(j.sugestoes)) lista = j.sugestoes.map(function (x) { return x.nota; }); if (!lista.length) throw new Error('O JSON não contém uma melodia.'); st.notasTexto = lista.map(String).join(', '); if (j.modo === 'menor' || j.modo === 'maior') st.modo = j.modo; render(); C.aviso('Melodia importada para harmonização.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Modo' }), (function () { var s = el('select', {}, ['maior', 'menor'].map(function (x) { return el('option', { value: x, txt: x }); })); s.value = st.modo; s.onchange = function () { st.modo = s.value; render(); }; return s; })()]), el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Notas da melodia' }), inp]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Harmonizar', onclick: function () { st.notasTexto = inp.value; render(); } })]));
      var mel = st.notasTexto.split(/[;,\s]+/).map(function (x) { return N.ler(x.trim()); }).filter(Boolean), campo = T.campo(tonicaDe(st), st.modo) || [];
      if (!mel.length) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Digite notas separadas por vírgulas.' })); return; }
      var linhas = mel.map(function (n) { var cand = campo.filter(function (g) { return g.notas.map(N.pc).indexOf(N.pc(n)) >= 0; }); return el('div', { class: 'lab-harm-linha' }, [el('strong', { txt: rot(n) }), el('span', { txt: '→' })].concat(cand.map(function (g) { return el('button', { type: 'button', class: 'lab-chip-botao', txt: g.simbolo, title: g.funcao_nome, onclick: function () { C.Som.tocar((A.notas(naOitava(g.fundamental, 3), g.acorde) || []).map(N.midi), { modo: 'harmonico' }); } }); }))); });
      alvo.appendChild(el('div', { class: 'lab-harm-linhas' }, linhas));
       alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar melodia MIDI', onclick: function () { if (!C.midiArquivo) return; var ev = mel.map(function (n, i) { return { t: i * 4, dur: 4, midi: N.midi(n), vel: 82 }; }); C.baixar('melodia-musique.mid', 'audio/midi', C.midiArquivo(ev, 80, 4)); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar harmonização JSON', onclick: function () { var sugestoes = mel.map(function (n) { return { nota: rot(n), midi: N.midi(n), acordes: campo.filter(function (g) { return g.notas.map(N.pc).indexOf(N.pc(n)) >= 0; }).map(function (g) { return { simbolo: g.simbolo, funcao: g.funcao_nome }; }) }; }); C.baixar('harmonizacao-melodia.json', 'application/json', JSON.stringify({ tonica: rot(tonicaDe(st)), modo: st.modo, melodia: mel.map(rot), sugestoes: sugestoes, criado_em: new Date().toISOString() }, null, 2)); } })]));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Cada linha mostra os acordes do campo harmônico que contêm a nota da melodia. Escolha pelo contexto, baixo e movimento entre acordes.' }));
    }
    render();
  };

  F['gerador-de-progressao'] = function (alvo, st) {
    st.tonica = st.tonica || 'do'; st.modo = st.modo || 'maior'; st.tamanho = st.tamanho || 4; st.lista = st.lista || [];
    function gerar() { var c = T.campo(tonicaDe(st), st.modo) || []; st.lista = []; var anterior = -1; for (var i = 0; i < Number(st.tamanho); i++) { var op = c.filter(function (_, k) { return k !== anterior; }), g = op[Math.floor(Math.random() * op.length)]; if (!g) break; st.lista.push(g.simbolo); anterior = c.indexOf(g); } }
    function render() {
      C.gravarUrl(st); C.limpar(alvo); var tam = el('select', {}, [3, 4, 6, 8].map(function (n) { return el('option', { value: n, txt: n + ' acordes' }); })); tam.value = st.tamanho;
      var modo = el('select', {}, ['maior', 'menor'].map(function (x) { return el('option', { value: x, txt: x }); })); modo.value = st.modo; modo.onchange = function () { st.modo = modo.value; gerar(); render(); };
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar progressão JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); var lista = Array.isArray(j.acordes) ? j.acordes : (Array.isArray(j.progressao) ? j.progressao : []); if (!lista.length) throw new Error('O JSON não contém acordes.'); st.lista = lista.map(String).filter(function (x) { return A.ler(x); }); if (!st.lista.length) throw new Error('Nenhum acorde válido foi encontrado.'); render(); C.aviso('Progressão carregada no gerador.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selTonica(st.tonica, function (v) { st.tonica = v; gerar(); render(); }), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Modo' }), modo]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Tamanho' }), tam]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: '🎲 Gerar', onclick: function () { st.tamanho = Number(tam.value); gerar(); render(); } })]));
      if (!st.lista.length) gerar();
      var nos = st.lista.map(function (s, i) { var a = A.ler(s); return el('button', { type: 'button', class: 'lab-mapa-no', title: 'Ouvir ' + s, txt: s, onclick: function () { if (a) C.Som.tocar((A.notas(naOitava(a.fundamental, 3), a.id) || []).map(N.midi), { modo: 'harmonico' }); } }); });
      alvo.appendChild(el('div', { class: 'lab-mapa-linha' }, nos));
      alvo.appendChild(el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir sequência', onclick: function () { st.lista.map(A.ler).filter(Boolean).forEach(function (a, i) { setTimeout(function () { C.Som.tocar((A.notas(naOitava(a.fundamental, 3), a.id) || []).map(N.midi), { modo: 'harmonico', dur: 0.75 }); }, i * 800); }); } }));
       alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar MIDI', onclick: function () { if (!C.midiArquivo) return; var ev = []; st.lista.map(A.ler).filter(Boolean).forEach(function (a, i) { (A.notas(naOitava(a.fundamental, 3), a.id) || []).forEach(function (n) { ev.push({ t: i * 4, dur: 4, midi: N.midi(n), vel: 78 }); }); }); C.baixar('gerador-progressao.mid', 'audio/midi', C.midiArquivo(ev, 80, 4)); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar JSON', onclick: function () { C.baixar('gerador-progressao.json', 'application/json', JSON.stringify({ tonica: rot(tonicaDe(st)), modo: st.modo, acordes: st.lista, criado_em: new Date().toISOString() }, null, 2)); } })]));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'O gerador evita repetir o grau imediatamente anterior, mas a sequência é um rascunho: ajuste o baixo, as inversões e o ritmo.' }));
    }
    render();
  };

  F['grafo-harmonico'] = function (alvo, st) {
    st.texto = st.texto || 'C, Am, F, G';
    function render() {
       C.gravarUrl(st); C.limpar(alvo); var inp = el('textarea', { rows: 2, class: 'lab-textarea' }); inp.value = st.texto;
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar progressão JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); var lista = Array.isArray(j.acordes) ? j.acordes : (Array.isArray(j.progressao) ? j.progressao : []); if (!lista.length) throw new Error('O JSON não contém uma progressão.'); st.texto = lista.map(String).join(', '); render(); C.aviso('Progressão importada no grafo.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Progressão' }), inp]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Atualizar grafo', onclick: function () { st.texto = inp.value; render(); } })]));
      var acs = st.texto.split(/[;,\n]+/).map(function (x) { return A.ler(x.trim()); }).filter(Boolean).slice(0, 16); if (!acs.length) return;
      var W = 820, H = 300, cx = W / 2, cy = H / 2, rx = Math.min(330, 35 * acs.length), ry = 95, pts = acs.map(function (_, i) { var a = (Math.PI * 2 * i / acs.length) - Math.PI / 2; return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }; });
      var s = ['<svg xmlns="http://www.w3.org/2000/svg" class="lab-grafo-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grafo harmônico">']; for (var i = 0; i < pts.length - 1; i++) s.push('<line x1="' + pts[i].x.toFixed(1) + '" y1="' + pts[i].y.toFixed(1) + '" x2="' + pts[i + 1].x.toFixed(1) + '" y2="' + pts[i + 1].y.toFixed(1) + '" stroke="#8db1cf" stroke-width="3"/>'); pts.forEach(function (p, i) { s.push('<g data-i="' + i + '" tabindex="0" role="button" aria-label="' + D.esc(A.simbolo(acs[i].fundamental, acs[i].id)) + '"><circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="30" fill="#fff" stroke="#14213d" stroke-width="2"/><text x="' + p.x.toFixed(1) + '" y="' + (p.y + 5).toFixed(1) + '" text-anchor="middle" font-family="Arial" font-size="14">' + D.esc(A.simbolo(acs[i].fundamental, acs[i].id)) + '</text></g>'); }); s.push('</svg>');
      var box = svg(s.join('')); function tocarNo(g) { if (!g) return; var a = acs[Number(g.getAttribute('data-i'))]; C.Som.tocar((A.notas(naOitava(a.fundamental, 3), a.id) || []).map(N.midi), { modo: 'harmonico' }); } box.addEventListener('click', function (e) { tocarNo(e.target.closest('[data-i]')); }); box.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-i]')) { e.preventDefault(); tocarNo(e.target.closest('[data-i]')); } });
        alvo.appendChild(box); alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar grafo SVG', onclick: function () { C.baixar('grafo-harmonico.svg', 'image/svg+xml', s.join('')); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar grafo PNG', onclick: function () { C.baixarPng('grafo-harmonico.png', s.join(), 1640, 600); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar grafo JSON', onclick: function () { C.baixar('grafo-harmonico.json', 'application/json', JSON.stringify({ progressao: st.texto, nos: acs.map(function (a, i) { return { indice: i + 1, acorde: A.simbolo(a.fundamental, a.id), notas: (A.notas(naOitava(a.fundamental, 3), a.id) || []).map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }) }; }), criado_em: new Date().toISOString() }, null, 2)); } })])); alvo.appendChild(el('p', { class: 'lab-dica', txt: 'As linhas representam o percurso informado. Clique em um nó para ouvir o acorde e use o mapa de harmonia para comparar distâncias.' }));
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
