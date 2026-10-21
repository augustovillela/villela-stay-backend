// =====================================================================
// Musique · Laboratório — CLIENTE · Explorar. Cada ferramenta é uma
// função (alvo, estado). O ESTADO é um só por página: mudar a tônica
// muda piano, pauta, braço e círculo juntos — nada é recalculado em dois
// lugares, porque todos pedem ao mesmo núcleo.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas;
  var N = L.notas, I = L.intervalos, E = L.escalas, A = L.acordes, T = L.tonalidades, D = L.desenho, INS = L.instrumentos, AC = L.acustica, X = L.exercicios, R = L.ritmo;
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
      var modoTitulo = quartas ? 'Círculo de quartas' : 'Círculo de quintas';
      var modoDescricao = quartas ? 'Sentido anti-horário: cada passo desce uma quinta (equivale a subir uma quarta).' : 'Sentido horário: cada passo sobe uma quinta. As menores relativas ficam no anel interno.';
      alvo.appendChild(el('div', { class: 'lab-circulo-modo', role: 'status', 'aria-live': 'polite' }, [el('strong', { txt: 'Exibindo: ' + modoTitulo }), el('span', { txt: modoDescricao })]));
      alvo.appendChild(el('div', { class: 'lab-controles lab-circulo-controles' }, [
        el('button', { type: 'button', class: 'btn lab-circulo-toggle', 'aria-pressed': quartas ? 'true' : 'false', 'aria-label': quartas ? 'Alternar para círculo de quintas' : 'Alternar para círculo de quartas', txt: quartas ? 'Mostrar círculo de quintas ↻' : 'Mostrar círculo de quartas ↺', onclick: function () { quartas = !quartas; render(); } }), C.selNotacao(render)]));
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
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar mapa JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); var lista = Array.isArray(j.acordes) ? j.acordes : (Array.isArray(j.progressao) ? j.progressao : []); if (!lista.length) throw new Error('O JSON não contém uma progressão.'); st.texto = lista.map(String).join(', '); render(); C.aviso('Progressão importada no mapa.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
      alvo.appendChild(el('div', { class: 'lab-controles' }, [
        el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Acordes (separe por vírgulas)' }), entrada]),
         el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]),
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
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar acordes vizinhos JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); if (!j.partida) throw new Error('O JSON não contém o acorde de partida.'); st.acordeTexto = String(j.partida); st.raio = Math.max(1, Math.min(3, Number(j.raio) || 1)); render(); C.aviso('Acordes vizinhos importados.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Acorde de partida' }), campo]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Raio' }), raio]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Explorar vizinhos', onclick: function () { st.acordeTexto = campo.value; st.raio = raio.value; render(); } })]));
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
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar pivôs JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); if (!Array.isArray(j.tonalidades) || j.tonalidades.length < 3) throw new Error('O JSON não contém três tonalidades.'); j.tonalidades.slice(0, 3).forEach(function (x, i) { if (x.modo === 'maior' || x.modo === 'menor') st['m' + (i + 1)] = x.modo; if (x.tonica) { var sl = N.slug(String(x.tonica)); if (sl) st['t' + (i + 1)] = sl; } }); render(); C.aviso('Tonalidades importadas.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       alvo.appendChild(el('div', { class: 'lab-controles' }, controles.concat([el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo])] )));
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

  F['pozzoli-ritmos'] = function (alvo, st) {
    st.serie = Math.max(1, Math.min(4, Number(st.serie) || 1)); st.comp = st.comp || '2/4'; st.bpm = Math.max(40, Math.min(180, Number(st.bpm) || 72)); st.modo = st.modo || 'leitura'; st.tonalidade = st.tonalidade || 'C'; st.exercicio = Math.max(0, Math.min(29, Number(st.exercicio) || 0)); st.revelado = false;
    var FIG = R.FIG;
    var BASE = { '2/4': { 1: [['seminima', 0], ['seminima', 0]], 2: [['colcheia', 0], ['colcheia', 0], ['seminima', 0], ['colcheia', 1], ['colcheia', 0]], 3: [['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 0], ['seminima', 0], ['colcheia', 1], ['colcheia', 0], ['colcheia', 0]], 4: [['colcheia', 1], ['colcheia', 0], ['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 0], ['colcheia', 0], ['seminima', 0]] }, '3/4': { 1: [['seminima', 0], ['seminima', 0], ['seminima', 0]], 2: [['colcheia', 0], ['colcheia', 0], ['seminima', 0], ['colcheia', 0], ['colcheia', 1], ['seminima', 0]], 3: [['seminima', 0], ['colcheia', 1], ['colcheia', 0], ['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 0], ['colcheia', 0], ['seminima', 0]], 4: [['colcheia', 0], ['colcheia', 0], ['colcheia', 1], ['colcheia', 0], ['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 0], ['colcheia', 0], ['seminima', 0]] }, '4/4': { 1: [['seminima', 0], ['seminima', 0], ['seminima', 0], ['seminima', 0]], 2: [['colcheia', 0], ['colcheia', 0], ['colcheia', 1], ['colcheia', 0], ['seminima', 0], ['colcheia', 0], ['colcheia', 0]], 3: [['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 0], ['colcheia', 1], ['colcheia', 0], ['colcheia', 0], ['semicolcheia', 0], ['semicolcheia', 0], ['seminima', 0]], 4: [['colcheia', 1], ['colcheia', 0], ['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 0], ['colcheia', 0], ['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 1], ['colcheia', 0]] }, '6/8': { 1: [['colcheia', 0], ['colcheia', 0], ['colcheia', 0], ['colcheia', 0], ['colcheia', 0], ['colcheia', 0]], 2: [['colcheia', 0], ['colcheia', 1], ['colcheia', 0], ['colcheia', 0], ['colcheia', 1], ['colcheia', 0]], 3: [['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 0], ['colcheia', 0], ['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 0]], 4: [['colcheia', 1], ['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 0], ['semicolcheia', 0], ['semicolcheia', 0], ['colcheia', 0]] } };
    function padrao() { var c = BASE[st.comp] || BASE['2/4']; var base = c[st.serie] || c[1]; return Array.from({ length: 30 }, function (_, i) { var corte = (i + st.serie + st.exercicio) % base.length; return base.slice(corte).concat(base.slice(0, corte)); }); }
    var timers = [], tocando = false;
    function parar() { timers.forEach(clearTimeout); timers = []; tocando = false; C.Som.parar(); }
    function tocar(p, aoPasso, aoFim) { parar(); tocando = true; var pos = 0, pulso = 0; p.forEach(function (x, i) { var ms = R.ms(st.bpm, x[0], { unidadeBpm: R.fr(1, 4) }); timers.push(setTimeout(function () { if (!tocando) return; if (aoPasso) aoPasso(i); if (!x[1]) { var forte = pulso % (st.comp === '6/8' ? 3 : Number(st.comp.split('/')[0])) === 0; C.Som.bateria.clique(C.Som.audio().currentTime + 0.005, forte ? 0.95 : 0.72, forte); } pulso++; if (i === p.length - 1 && aoFim) { timers.push(setTimeout(function () { tocando = false; aoFim(); }, Math.max(60, ms))); } }, pos)); pos += ms; }); }
    function figura(x) { var f = FIG[x[0]]; return x[1] ? (f && f.pausa || '𝄽') : (f && f.glifo || '·'); }
    function render() { C.gravarUrl(st); C.limpar(alvo); var medidas = padrao(), p = medidas[st.exercicio], c = R.compasso(st.comp); var serie = el('select', { class: 'lab-select', 'aria-label': 'Série' }); [1, 2, 3, 4].forEach(function (n) { serie.appendChild(el('option', { value: n, txt: 'Série ' + n, selected: st.serie === n })); }); serie.onchange = function () { st.serie = Number(serie.value); st.exercicio = 0; render(); }; var comp = el('select', { class: 'lab-select', 'aria-label': 'Compasso' }); ['2/4', '3/4', '4/4', '6/8'].forEach(function (n) { comp.appendChild(el('option', { value: n, txt: n, selected: st.comp === n })); }); comp.onchange = function () { st.comp = comp.value; st.exercicio = 0; render(); }; var arm = el('select', { class: 'lab-select', 'aria-label': 'Armadura de clave' }); [['C', 'Dó maior · sem acidentes'], ['G', 'Sol maior · F♯'], ['D', 'Ré maior · F♯ C♯'], ['F', 'Fá maior · B♭']].forEach(function (x) { arm.appendChild(el('option', { value: x[0], txt: x[1], selected: st.tonalidade === x[0] })); }); arm.onchange = function () { st.tonalidade = arm.value; render(); }; var bpm = el('input', { type: 'number', class: 'lab-input', min: 40, max: 180, step: 1, value: st.bpm, 'aria-label': 'BPM' }); var modo = el('select', { class: 'lab-select', 'aria-label': 'Modo' }); [['leitura', 'Leitura'], ['ditado', 'Ditado']].forEach(function (x) { modo.appendChild(el('option', { value: x[0], txt: x[1], selected: st.modo === x[0] })); }); modo.onchange = function () { st.modo = modo.value; st.revelado = false; render(); };
      alvo.appendChild(el('section', { class: 'lab-atlas-intro' }, [el('span', { class: 'lab-atlas-selo', txt: 'RITMO ORIGINAL · LABORATÓRIO MUSIQUE' }), el('h1', { txt: 'Séries graduais de leitura e ditado' }), el('p', { txt: 'Cada série tem 30 compassos contínuos. Leia a pauta, mantenha o pulso e avance compasso por compasso.' }), el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Série' }), serie]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Compasso' }), comp]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Armadura' }), arm]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'BPM' }), bpm]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Modo' }), modo]), el('button', { type: 'button', class: 'btn', txt: 'Aplicar', onclick: function () { st.bpm = Math.max(40, Math.min(180, Number(bpm.value) || 72)); render(); } })]) ]));
      var box = el('section', { class: 'pozzoli-exercicio' }, [el('p', { class: 'lab-cab-tipo', txt: 'Série de 30 compassos · compasso atual: ' + (st.exercicio + 1) + '/30 · ' + st.comp + ' · ' + st.bpm + ' BPM' }), el('div', { class: 'pozzoli-pauta-cab', 'aria-label': 'Clave e armadura de clave' }, [el('span', { class: 'pozzoli-clave', txt: '𝄞' }), el('span', { class: 'pozzoli-armadura-sinais', txt: ({ C: '—', G: '♯', D: '♯ ♯', F: '♭' })[st.tonalidade] || '—' }), el('span', { class: 'pozzoli-armadura-nome', txt: arm.options[arm.selectedIndex].text })])]); var grade = el('div', { class: 'pozzoli-grade pozzoli-serie', role: 'img', 'aria-label': 'Série de 30 compassos com compasso atual destacado' }); var refs = [], medidasPlanas = [].concat.apply([], medidas); medidas.forEach(function (medida, i) { var cel = el('div', { class: 'pozzoli-compasso ' + (i === st.exercicio ? 'atual' : '') }); cel.appendChild(el('small', { txt: String(i + 1) })); if (st.modo === 'ditado' && !st.revelado && i === st.exercicio) { var oculto = el('span', { class: 'pozzoli-oculto', txt: '?  ?' }); cel.appendChild(oculto); medida.forEach(function () { refs.push(oculto); }); } else medida.forEach(function (x) { var figuraEl = el('span', { class: 'pozzoli-fig ' + (x[1] ? 'pausa' : ''), txt: figura(x) }); refs.push(figuraEl); cel.appendChild(figuraEl); }); grade.appendChild(cel); }); box.appendChild(grade); var andamento = el('p', { class: 'pozzoli-andamento lab-dica', 'aria-live': 'polite', txt: 'Clique em “Ouvir série inteira” para acompanhar cada figura.' }); box.appendChild(andamento); box.appendChild(el('p', { class: 'lab-dica', txt: 'O compasso atual fica destacado. Acentue o início de cada compasso; em 6/8, sinta dois pulsos grandes de três subdivisões.' })); alvo.appendChild(box);
      alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn', txt: '▶ Ouvir série inteira', onclick: function () { refs.forEach(function (r) { r.classList.remove('ativo'); r.removeAttribute('aria-current'); }); grade.querySelectorAll('.pozzoli-compasso').forEach(function (m) { m.classList.remove('tocando'); }); tocar(medidasPlanas, function (i) { refs.forEach(function (r) { r.classList.remove('ativo'); }); if (refs[i]) { refs[i].classList.add('ativo'); refs[i].setAttribute('aria-current', 'step'); var compassoAtual = refs[i].closest('.pozzoli-compasso'); if (compassoAtual) compassoAtual.classList.add('tocando'); } andamento.textContent = 'Tocando figura ' + (i + 1) + ' de ' + medidasPlanas.length; }, function () { andamento.textContent = 'Série concluída. Repita devagar ou avance para o próximo compasso.'; }); } }), el('button', { type: 'button', class: 'btn sec pozzoli-parar', txt: '■ Parar som', onclick: function () { parar(); refs.forEach(function (r) { r.classList.remove('ativo'); r.removeAttribute('aria-current'); }); grade.querySelectorAll('.pozzoli-compasso').forEach(function (m) { m.classList.remove('tocando'); }); andamento.textContent = 'Som parado.'; } }), el('button', { type: 'button', class: 'btn sec', txt: st.modo === 'ditado' && !st.revelado ? 'Mostrar resposta' : 'Ocultar resposta', onclick: function () { st.revelado = !st.revelado; render(); } }), el('button', { type: 'button', class: 'btn sec', txt: 'Próximo compasso', onclick: function () { st.exercicio = (st.exercicio + 1) % 30; st.revelado = false; render(); } })]));
      var tempos = []; var tap = el('button', { type: 'button', class: 'btn sec', txt: '👏 Marcar pulsos' }); var resultado = el('span', { class: 'lab-dica', 'aria-live': 'polite' }); tap.onclick = function () { var agora = performance.now(); tempos.push(agora); if (tempos.length > 8) tempos.shift(); C.Som.tocar([72], { dur: .06 }); var r = R.bpmDeToques(tempos); resultado.textContent = r ? 'BPM estimado: ' + r.bpm + ' · desvio médio: ' + r.desvio_ms + ' ms' : 'Marque pelo menos três pulsos regulares.'; }; alvo.appendChild(el('div', { class: 'lab-acoes' }, [tap, resultado])); alvo.appendChild(el('p', { class: 'lab-nota-convencao', txt: 'Este módulo usa exercícios originais do Musique. Ele se inspira em uma progressão didática de leitura, áudio e ditado, mas não reproduz páginas ou séries do livro Pozzoli.' }));
    }
    render();
  };

  F['mandala-harmonica'] = function (alvo, st) {
    st.tonica = st.tonica || 'C'; st.modo = st.modo || 'maior'; st.mandalaFonte = st.mandalaFonte || 'todos'; st.mapaGlobal = !!st.mapaGlobal;
    function pc(n) { return N.pc(n); }
    function chave(f, id) { return pc(f) + ':' + id; }
    function adicionar(lista, f, id, grupo, grau) {
      var c = A.porId(id); if (!c || !f) return;
      var k = chave(f, id), x = lista.filter(function (n) { return n.chave === k; })[0];
      if (x) { if (x.grupos.indexOf(grupo) < 0) x.grupos.push(grupo); if (grau && !x.grau) x.grau = grau; return; }
      lista.push({ chave: k, fundamental: N.semOitava(f), id: id, grupos: [grupo], grau: grau || '', notas: (A.notas(N.semOitava(f), id) || []).map(pc) });
    }
    function rede() {
      var ton = tonicaDe(st), modo = st.modo, out = [], campo = T.campo(ton, modo, { tetrades: false }) || [];
      campo.forEach(function (x) { adicionar(out, x.fundamental, x.acorde || (x.modo === 'menor' ? 'menor' : 'maior'), 'diatônico', x.romano || String(x.grau)); });
      var paralelo = T.campo(ton, modo === 'maior' ? 'menor' : 'maior', { tetrades: false }) || [];
      paralelo.forEach(function (x) { adicionar(out, x.fundamental, x.acorde || (modo === 'maior' ? 'menor' : 'maior'), 'paralelo', x.romano || String(x.grau)); });
      campo.forEach(function (x) { adicionar(out, x.fundamental, '7', 'dominante secundária', 'V/' + (x.romano || x.grau)); });
      // Vizinhos de duas notas: a rede prioriza tríades, como a referência visual.
      var base = out.slice();
      for (var r = 0; r < 12; r++) { adicionar(out, N.deClasse(r), 'maior', 'vizinho', ''); adicionar(out, N.deClasse(r), 'menor', 'vizinho', ''); }
      var centro = pc(ton);
      out.sort(function (a, b) { var ga = a.grupos.indexOf('diatônico') >= 0 ? 0 : a.grupos.indexOf('paralelo') >= 0 ? 1 : a.grupos.indexOf('dominante secundária') >= 0 ? 2 : 3; var gb = b.grupos.indexOf('diatônico') >= 0 ? 0 : b.grupos.indexOf('paralelo') >= 0 ? 1 : b.grupos.indexOf('dominante secundária') >= 0 ? 2 : 3; return ga - gb || ((a.notas.indexOf(centro) < 0) - (b.notas.indexOf(centro) < 0)); });
      return out.slice(0, 50);
    }
    function relacao(a, b) { var comum = a.notas.filter(function (n) { return b.notas.indexOf(n) >= 0; }).length; return { comum: comum, distancia: a.notas.reduce(function (s, n) { return s + Math.min.apply(Math, b.notas.map(function (m) { var d = Math.abs(n - m); return Math.min(d, 12 - d); })); }, 0) / Math.max(1, a.notas.length) }; }
    function acs() { return (st.texto || '').split(/[;,\n]+/).map(function (x) { return A.ler(x.trim()); }).filter(Boolean); }
    function renderGlobal() {
      /* O anel segue o círculo de quintas: cada par maior/menor é relativo. */
      var campos = [];
      (T.CIRCULO || []).forEach(function (par) { campos.push({ tonica: N.ler(par.maior), modo: 'maior' }); campos.push({ tonica: N.ler(par.menor), modo: 'menor' }); });
      var mapa = el('div', { class: 'lab-mandala-global' });
      /* C.el cria elementos HTML; o mapa precisa de elementos no namespace SVG. */
      var SVG_NS = 'http://www.w3.org/2000/svg';
      function svgNode(tag, attrs) { var e = d.createElementNS(SVG_NS, tag); Object.keys(attrs || {}).forEach(function (k) { var v = attrs[k]; if (v == null) return; if (k === 'txt') e.textContent = v; else e.setAttribute(k, v); }); return e; }
      var svgEl = svgNode('svg', { class: 'lab-mandala-global-svg', viewBox: '0 0 920 420', width: 920, height: 420, role: 'img', 'aria-label': 'Mapa dos 24 campos harmônicos' });
      var cx = 460, cy = 210, raio = 170; campos.forEach(function (campo, i) { var ang = i / campos.length * Math.PI * 2 - Math.PI / 2, x = cx + raio * Math.cos(ang), y = cy + raio * Math.sin(ang), proximo = (i + 1) % campos.length, ang2 = proximo / campos.length * Math.PI * 2 - Math.PI / 2, x2 = cx + raio * Math.cos(ang2), y2 = cy + raio * Math.sin(ang2); var linha = svgNode('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'lab-mandala-global-linha' }); svgEl.appendChild(linha); svgEl.appendChild(svgNode('line', { x1: x, y1: y, x2: x2, y2: y2, class: i % 2 === 0 ? 'lab-mandala-global-relativa' : 'lab-mandala-global-modulacao' })); });
      var selecao = el('section', { class: 'lab-mandala-global-selecao', 'aria-live': 'polite' });
      function mostrarCampo(i) { var campo = campos[i], c = T.campo(campo.tonica, campo.modo, { tetrades: false }) || [], nome = T.nome(campo.tonica, campo.modo); C.limpar(selecao); var botoes = c.map(function (x) { var ac = { fundamental: x.fundamental, id: x.acorde, notas: A.notas(naOitava(x.fundamental, 4), x.acorde) || [] }; return el('button', { type: 'button', class: 'lab-atlas-acorde', title: (x.romano || '') + ' · ouvir', txt: x.simbolo || A.simbolo(x.fundamental, x.acorde), onclick: function () { tocarAcorde(ac); } }); }); selecao.appendChild(el('div', { class: 'lab-mandala-global-selecao-cab' }, [el('div', {}, [el('p', { class: 'lab-cab-tipo', txt: 'Campo selecionado' }), el('h3', { txt: nome }), el('p', { class: 'lab-dica', txt: 'I · ii · iii · IV · V · vi · vii° · clique para ouvir' })]), el('button', { type: 'button', class: 'btn sec', txt: 'Abrir mapa deste tom', onclick: function () { st.tonica = C.nomeNota(campo.tonica); st.modo = campo.modo; st.mapaGlobal = false; render(); } })])); selecao.appendChild(el('div', { class: 'lab-atlas-chips' }, botoes)); }
      function irParaCampo(i) { var card = d.getElementById('lab-campo-global-' + i); if (!card) return; d.querySelectorAll('.lab-mandala-global-card-foco').forEach(function (x) { x.classList.remove('lab-mandala-global-card-foco'); }); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('lab-mandala-global-card-foco'); mostrarCampo(i); }
      campos.forEach(function (campo, i) { var ang = i / campos.length * Math.PI * 2 - Math.PI / 2, x = cx + raio * Math.cos(ang), y = cy + raio * Math.sin(ang), rotulo = C.nomeNota(campo.tonica) + (campo.modo === 'maior' ? ' M' : ' m'), grupo = svgNode('g', { class: 'lab-mandala-global-no-grupo', tabindex: 0, role: 'button', 'aria-label': 'Abrir campo de ' + T.nome(campo.tonica, campo.modo) }); grupo.appendChild(svgNode('circle', { cx: x, cy: y, r: 15, class: 'lab-mandala-global-no ' + campo.modo })); grupo.appendChild(svgNode('text', { x: x, y: y + 3, class: 'lab-mandala-global-no-txt', txt: rotulo })); grupo.addEventListener('click', function () { irParaCampo(i); }); grupo.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irParaCampo(i); } }); svgEl.appendChild(grupo); });
      svgEl.appendChild(svgNode('circle', { cx: cx, cy: cy, r: 70, class: 'lab-mandala-global-centro' })); svgEl.appendChild(svgNode('text', { x: cx, y: cy + 5, class: 'lab-mandala-global-centro-txt', txt: 'CÍRCULO DE QUINTAS' })); svgEl.appendChild(svgNode('text', { x: cx, y: 16, class: 'lab-mandala-global-legenda', txt: 'dourado = relativa maior/menor · tracejado = modulação por quintas' })); mapa.appendChild(svgEl);
      var lista = el('div', { class: 'lab-mandala-global-lista' }); campos.forEach(function (campo, i) { var c = T.campo(campo.tonica, campo.modo, { tetrades: false }) || [], nome = T.nome(campo.tonica, campo.modo); var card = el('article', { id: 'lab-campo-global-' + i, class: 'lab-mandala-global-card' }, [el('h3', { txt: nome }), el('p', { class: 'lab-dica', txt: 'I · ii · iii · IV · V · vi · vii°' })]); var linha = el('div', { class: 'lab-campo-linha', role: 'list', 'aria-label': 'Acordes do campo de ' + nome }); c.forEach(function (x, k) { var ac = { fundamental: x.fundamental, id: x.acorde, nome: x.simbolo || A.simbolo(x.fundamental, x.acorde), notas: A.notas(naOitava(x.fundamental, 4), x.acorde) || [] }; linha.appendChild(el('button', { type: 'button', class: 'lab-atlas-acorde ' + (x.funcao === 'dominante' ? 'global-dominante' : ''), title: nome + ' · ' + (x.romano || ''), txt: ac.nome, onclick: function () { tocarAcorde(ac); } })); if (k < c.length - 1) linha.appendChild(el('span', { class: 'lab-campo-seta', 'aria-hidden': 'true', txt: '→' })); }); card.appendChild(linha); lista.appendChild(card); }); mapa.appendChild(selecao); mapa.appendChild(lista); alvo.appendChild(mapa); alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Clique ou use Enter em uma tonalidade do círculo para abrir seu campo abaixo. Como ler: cada par de nós maior/menor ligado em dourado é uma relativa; cada trecho tracejado segue uma quinta e sugere uma modulação vizinha.' }));
    }
    function tocarAcorde(x) { C.Som.tocar(x.notas.map(N.midi), { modo: 'harmonico', dur: 1.1 }); }
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      alvo.appendChild(el('section', { class: 'lab-mandala-explicacao' }, [el('span', { class: 'lab-atlas-selo', txt: 'COMO LER A MANDALA' }), el('h1', { txt: 'Um mapa para encontrar caminhos entre acordes' }), el('p', { txt: 'A mandala não é uma lista de cifras. Ela mostra como a harmonia se organiza: cada campo reúne os acordes de uma tonalidade; cada linha liga os graus desse campo; as conexões entre campos sugerem caminhos de modulação e rearmonização.' }), el('div', { class: 'lab-mandala-legenda' }, [el('span', { class: 'leg-diatonico', txt: '● Campo da tonalidade' }), el('span', { class: 'leg-paralelo', txt: '● Empréstimo modal' }), el('span', { class: 'leg-dominante', txt: '● Dominante' }), el('span', { class: 'leg-vizinho', txt: '● Acorde vizinho' })]), el('ol', { class: 'lab-mandala-passos' }, [el('li', { txt: 'Escolha uma tonalidade ou ative “Mapa global”.' }), el('li', { txt: 'Leia a linha de graus para ver a família de acordes.' }), el('li', { txt: 'Clique para ouvir; compare linhas para encontrar uma rota harmônica.' })])]));
      var txt = el('textarea', { rows: 2, class: 'lab-textarea', 'aria-label': 'Acordes da mandala' }); txt.value = st.texto || '';
      var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar mandala JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); var lista = Array.isArray(j.acordes) ? j.acordes : (Array.isArray(j.progressao) ? j.progressao : []); if (!lista.length) throw new Error('O JSON não contém acordes.'); st.texto = lista.map(String).join(', '); render(); C.aviso('Progressão importada na mandala.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
      var tonica = el('input', { type: 'text', class: 'lab-input', value: C.nomeNota(tonicaDe(st)), 'aria-label': 'Tônica da mandala', placeholder: 'C' });
      var modo = el('select', { class: 'lab-select', 'aria-label': 'Modo da mandala' }); ['maior', 'menor'].forEach(function (m) { modo.appendChild(el('option', { value: m, txt: m === 'maior' ? 'Maior' : 'Menor', selected: st.modo === m })); });
      var filtro = el('select', { class: 'lab-select', 'aria-label': 'Filtro da rede' }); [['todos', 'Todos os grupos'], ['diatônico', 'Campo diatônico'], ['paralelo', 'Empréstimos paralelos'], ['dominante secundária', 'Dominantes secundárias'], ['vizinho', 'Vizinhos']].forEach(function (p) { filtro.appendChild(el('option', { value: p[0], txt: p[1], selected: st.mandalaFonte === p[0] })); });
      var global = el('input', { type: 'checkbox', 'aria-label': 'Mostrar todos os campos harmônicos' }); global.checked = st.mapaGlobal; global.onchange = function () { st.mapaGlobal = global.checked; render(); };
      alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Tônica' }), tonica]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Modo' }), modo]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Mostrar' }), filtro]), el('label', { class: 'lab-check' }, [global, el('span', { txt: 'Mapa global (24 campos)' })]), el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Progressão opcional' }), txt]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), el('button', { type: 'button', class: 'btn', txt: 'Gerar rede', onclick: function () { st.tonica = tonica.value; st.modo = modo.value; st.mandalaFonte = filtro.value; st.texto = txt.value; render(); } })]));
      if (st.mapaGlobal) { renderGlobal(); return; }
      var lista = rede().filter(function (n) { return st.mandalaFonte === 'todos' || n.grupos.indexOf(st.mandalaFonte) >= 0; });
      if (!lista.length) { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Nenhum acorde encontrado para este filtro.' })); return; }
      var mandala = el('div', { class: 'lab-mandala lab-mandala-rede', role: 'application', 'aria-label': 'Rede harmônica com acordes vizinhos' });
      var largura = 920, altura = 680, cx = largura / 2, cy = altura / 2, pos = [];
      lista.forEach(function (a, i) { var anel = i === 0 ? 0 : i < 7 ? 1 : i < 21 ? 2 : i < 37 ? 3 : 4, inicio = anel === 0 ? 0 : anel === 1 ? 1 : anel === 2 ? 7 : anel === 3 ? 21 : 37, total = anel === 0 ? 1 : anel === 1 ? 6 : anel === 2 ? 14 : anel === 3 ? 16 : Math.max(1, lista.length - 37), idx = i - inicio, raio = [0, 112, 205, 292, 350][anel], ang = anel === 0 ? -Math.PI / 2 : (idx / total) * Math.PI * 2 - Math.PI / 2; pos.push({ x: cx + (raio ? raio * Math.cos(ang) : 0), y: cy + (raio ? raio * Math.sin(ang) : 0) }); });
      var SVG_NS_LOCAL = 'http://www.w3.org/2000/svg';
      function svgNodeLocal(tag, attrs) { var e = d.createElementNS(SVG_NS_LOCAL, tag); Object.keys(attrs || {}).forEach(function (k) { var v = attrs[k]; if (v == null) return; if (k === 'txt') e.textContent = v; else e.setAttribute(k, v); }); return e; }
      var svgEl = svgNodeLocal('svg', { class: 'lab-mandala-svg', viewBox: '0 0 ' + largura + ' ' + altura, role: 'img', 'aria-label': 'Mapa harmônico expandido com acordes, funções e caminhos' });
      var defs = svgNodeLocal('defs'); var marker = svgNodeLocal('marker', { id: 'lab-mandala-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }); marker.appendChild(svgNodeLocal('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#8aa8c4' })); defs.appendChild(marker); svgEl.appendChild(defs);
      [112, 205, 292, 350].forEach(function (raio, k) { svgEl.appendChild(svgNodeLocal('circle', { cx: cx, cy: cy, r: raio, class: 'lab-mandala-anel anel-' + k })); });
      [['CAMPO', 112], ['PARALELO', 205], ['DOMINANTES', 292], ['VIZINHOS', 350]].forEach(function (x) { svgEl.appendChild(svgNodeLocal('text', { x: cx, y: cy - x[1] + 14, class: 'lab-mandala-anel-txt', txt: x[0] })); });
      var arestas = []; for (var i = 0; i < lista.length; i++) for (var j = i + 1; j < lista.length; j++) { var rr = relacao(lista[i], lista[j]); if (rr.comum >= 2 || rr.distancia <= 1.5) arestas.push({ a: i, b: j, r: rr }); }
      arestas.forEach(function (e, edgeIndex) { var a = pos[e.a], b = pos[e.b], dx = b.x - a.x, dy = b.y - a.y, len = Math.max(1, Math.sqrt(dx * dx + dy * dy)), nx = -dy / len, ny = dx / len, curva = ((edgeIndex % 3) - 1) * Math.min(34, len * .16), mx = (a.x + b.x) / 2 + nx * curva, my = (a.y + b.y) / 2 + ny * curva, dPath = 'M ' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' Q ' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1); var l = svgNodeLocal('path', { d: dPath, class: 'lab-mandala-aresta' + (e.r.comum >= 2 ? ' comum' : ''), 'data-a': e.a, 'data-b': e.b, 'data-comum': e.r.comum, 'marker-end': 'url(#lab-mandala-arrow)' }); svgEl.appendChild(l); });
      mandala.appendChild(svgEl); mandala.appendChild(el('div', { class: 'lab-mandala-centro', txt: C.nomeNota(tonicaDe(st)) + ' ' + (st.modo === 'maior' ? 'MAIOR' : 'MENOR') }));
      var selecionado = -1, caminho = [];
      function marcar(i) { selecionado = i; mandala.querySelectorAll('.lab-mandala-no').forEach(function (n, k) { n.classList.toggle('ativo', k === i || caminho.indexOf(k) >= 0); }); mandala.querySelectorAll('.lab-mandala-aresta').forEach(function (l) { l.classList.toggle('ativo', caminho.some(function (x, k) { return k < caminho.length - 1 && ((x === Number(l.dataset.a) && caminho[k + 1] === Number(l.dataset.b)) || (x === Number(l.dataset.b) && caminho[k + 1] === Number(l.dataset.a))); })); }); }
      function caminhoAte(alvoIdx) { if (selecionado < 0 || selecionado === alvoIdx) { caminho = [alvoIdx]; marcar(alvoIdx); return; } var fila = [[selecionado]], vistos = {}; vistos[selecionado] = 1; while (fila.length) { var pth = fila.shift(), u = pth[pth.length - 1]; if (u === alvoIdx) { caminho = pth; marcar(alvoIdx); return; } arestas.forEach(function (e) { var v = e.a === u ? e.b : e.b === u ? e.a : -1; if (v >= 0 && !vistos[v]) { vistos[v] = 1; fila.push(pth.concat(v)); } }); } caminho = [selecionado, alvoIdx]; marcar(alvoIdx); }
      lista.forEach(function (a, i) { var ns = A.notas(naOitava(a.fundamental, 4), a.id) || [], grupoClasse = a.grupos.indexOf('diatônico') >= 0 ? 'lab-grupo-diatonico' : a.grupos.indexOf('paralelo') >= 0 ? 'lab-grupo-paralelo' : a.grupos.indexOf('dominante secundária') >= 0 ? 'lab-grupo-dominante' : 'lab-grupo-vizinho'; var no = el('button', { type: 'button', class: 'lab-mandala-no ' + grupoClasse + (i === 0 ? ' principal' : ''), style: 'left:' + (pos[i].x / largura * 100) + '%;top:' + (pos[i].y / altura * 100) + '%', title: a.grupos.join(' · ') + ' · ' + relacao(a, lista[Math.max(0, i - 1)]).comum + ' notas em comum', 'aria-label': A.simbolo(a.fundamental, a.id) + ' · ' + a.grupos.join(', '), txt: A.simbolo(a.fundamental, a.id), onclick: function () { if (selecionado >= 0 && selecionado !== i) caminhoAte(i); else { selecionado = i; caminho = [i]; marcar(i); } C.Som.tocar(ns.map(N.midi), { modo: 'harmonico' }); } }); no.dataset.grupo = a.grupos.join(','); mandala.appendChild(no); });
      alvo.appendChild(mandala); alvo.appendChild(el('p', { class: 'lab-dica', txt: 'A rede mostra até 50 acordes. Clique em um acorde para ouvi-lo; clique em outro para destacar o caminho mais curto entre os dois. As linhas mais fortes ligam acordes que compartilham duas notas.' }));
       var modo3d = false; var alternar3d = el('button', { type: 'button', class: 'btn sec', 'aria-pressed': 'false', txt: '◇ Perspectiva 3D', onclick: function () { modo3d = !modo3d; mandala.classList.toggle('lab-mandala-3d', modo3d); alternar3d.setAttribute('aria-pressed', modo3d ? 'true' : 'false'); alternar3d.textContent = modo3d ? '◇ Voltar ao 2D' : '◇ Perspectiva 3D'; } });
      function exportarMandala(png) {
        var s = ['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 920 680"><rect width="100%" height="100%" fill="#f8fbff"/>'];
        arestas.forEach(function (e) { s.push('<line x1="' + pos[e.a].x.toFixed(1) + '" y1="' + pos[e.a].y.toFixed(1) + '" x2="' + pos[e.b].x.toFixed(1) + '" y2="' + pos[e.b].y.toFixed(1) + '" stroke="#b7cce0" stroke-width="' + (e.r.comum >= 2 ? 2 : 1) + '"/>'); });
        lista.forEach(function (a, i) { s.push('<circle cx="' + pos[i].x.toFixed(1) + '" cy="' + pos[i].y.toFixed(1) + '" r="24" fill="#fff" stroke="#14213d"/><text x="' + pos[i].x.toFixed(1) + '" y="' + (pos[i].y + 5).toFixed(1) + '" text-anchor="middle" font-family="Arial" font-size="11">' + D.esc(A.simbolo(a.fundamental, a.id)) + '</text>'); });
        s.push('<circle cx="' + cx + '" cy="' + cy + '" r="44" fill="#14213d"/><text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" fill="#fff" font-family="Arial" font-size="12">' + D.esc(C.nomeNota(tonicaDe(st))) + '</text></svg>');
        var svgTexto = s.join(''); if (png) C.baixarPng('mandala-harmonica.png', svgTexto, 1200, 1200); else C.baixar('mandala-harmonica.svg', 'image/svg+xml', svgTexto);
      }
       alvo.appendChild(el('div', { class: 'lab-acoes' }, [alternar3d, el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar mandala SVG', onclick: function () { exportarMandala(false); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar mandala PNG', onclick: function () { exportarMandala(true); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar mandala JSON', onclick: function () { C.baixar('mandala-harmonica.json', 'application/json', JSON.stringify({ acordes: lista.map(function (a, i) { var ns = A.notas(naOitava(a.fundamental, 4), a.id) || []; var anterior = i ? (A.notas(naOitava(lista[i - 1].fundamental, 4), lista[i - 1].id) || []) : []; var pcs = anterior.map(N.pc); return { ordem: i + 1, simbolo: A.simbolo(a.fundamental, a.id), notas: ns.map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }), notas_em_comum_com_anterior: ns.filter(function (n) { return pcs.indexOf(N.pc(n)) >= 0; }).map(rot) }; }), criado_em: new Date().toISOString() }, null, 2)); } })]));
      alvo.appendChild(el('p', { class: 'lab-dica' }, ['Os acordes giram em torno de um centro comum. Passe o cursor sobre cada nó para ver a relação com o acorde anterior; clique para ouvir.']));
    }
    render();
  };

  F['atlas-harmonia-visual'] = function (alvo, st) {
    st.tonica = st.tonica || 'C'; st.modo = st.modo || 'maior';
    function acorde(t, id) { return { f: t, id: id, nome: A.simbolo(t, id), notas: A.notas(naOitava(t, 4), id) || [] }; }
    function tocar(x) { C.Som.tocar(x.notas.map(N.midi), { modo: 'harmonico', dur: 1.1 }); }
    function cartao(titulo, subtitulo, corpo, classe) { return el('section', { class: 'lab-atlas-cartao ' + (classe || '') }, [el('div', { class: 'lab-atlas-cartao-cab' }, [el('span', { class: 'lab-atlas-num', txt: titulo.slice(0, 1) }), el('div', {}, [el('h2', { txt: titulo }), el('p', { class: 'lab-dica', txt: subtitulo })])]), corpo]); }
    function chips(xs, grupo) { return el('div', { class: 'lab-atlas-chips' }, xs.map(function (x) { return el('button', { type: 'button', class: 'lab-atlas-acorde ' + (grupo || ''), title: 'Ouvir ' + x.nome, txt: x.nome, onclick: function () { tocar(x); } }); })); }
    function atualizar() { st.tonica = tonica.value || 'C'; st.modo = modo.value; render(); }
    function render() {
      C.gravarUrl(st); C.limpar(alvo); var tonica = el('input', { type: 'text', class: 'lab-input', value: C.nomeNota(tonicaDe(st)), 'aria-label': 'Tônica do atlas', placeholder: 'C' }); var modo = el('select', { class: 'lab-select', 'aria-label': 'Modo do atlas' }); ['maior', 'menor'].forEach(function (m) { modo.appendChild(el('option', { value: m, txt: m === 'maior' ? 'Maior' : 'Menor', selected: st.modo === m })); });
      alvo.appendChild(el('div', { class: 'lab-atlas-intro' }, [el('span', { class: 'lab-atlas-selo', txt: 'ATLAS VISUAL' }), el('h1', { txt: 'Veja a harmonia antes de decorá-la' }), el('p', { txt: 'Escolha uma tonalidade. Cada painel transforma uma ideia musical em uma imagem para ouvir, comparar e experimentar.' }), el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Tônica' }), tonica]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Modo' }), modo]), el('button', { type: 'button', class: 'btn', txt: 'Atualizar atlas', onclick: atualizar })])]));
      var t = tonicaDe(st), campo = T.campo(t, st.modo, { tetrades: false }) || [], paralelo = T.campo(t, st.modo === 'maior' ? 'menor' : 'maior', { tetrades: false }) || [];
      var diatonicos = campo.map(function (x) { return acorde(x.fundamental, x.acorde); }), vizinhos = []; diatonicos.forEach(function (x) { for (var r = 0; r < 12; r++) ['maior', 'menor'].forEach(function (id) { var y = acorde(N.deClasse(r), id), comum = x.notas.map(N.pc).filter(function (p) { return y.notas.map(N.pc).indexOf(p) >= 0; }).length; if (comum >= 2 && !vizinhos.some(function (z) { return z.nome === y.nome; })) vizinhos.push(y); }); });
      var campoBox = el('div', { class: 'lab-atlas-campo' }, [el('div', { class: 'lab-atlas-graus', txt: 'I   ii   iii   IV   V   vi   vii°' }), chips(diatonicos, 'diatonico')]);
      alvo.appendChild(cartao('Campo harmônico', 'A família de acordes da tonalidade. As cores separam tônica, preparação e dominante.', campoBox, 'lab-atlas-campo-card'));
      var vizSvg = el('div', { class: 'lab-atlas-vizinhos' }); var base = diatonicos[0], pares = vizinhos.slice(0, 10); pares.forEach(function (x, i) { var item = el('button', { type: 'button', class: 'lab-atlas-viz-card', title: 'Ouvir transição ' + base.nome + ' → ' + x.nome, onclick: function () { tocar(base); setTimeout(function () { tocar(x); }, 550); } }, [el('strong', { txt: x.nome }), el('span', { txt: '2 notas em comum' }), el('small', { txt: 'mova uma nota' })]); vizSvg.appendChild(item); });
      alvo.appendChild(cartao('Acordes vizinhos', 'Uma troca pequena pode levar a outro caminho. O botão toca o acorde de partida e o vizinho.', vizSvg, 'lab-atlas-viz-card-wrap'));
      var caminhos = [acorde(t, 'maior'), acorde(t, '7M'), acorde(t, '7M9'), acorde(t, '9'), acorde(t, '13')]; var tensoes = el('div', { class: 'lab-atlas-tensoes' }); caminhos.forEach(function (x, i) { tensoes.appendChild(el('button', { type: 'button', class: 'lab-atlas-tensao', title: 'Ouvir ' + x.nome, onclick: function () { tocar(x); } }, [el('span', { class: 'lab-atlas-tensao-num', txt: String(i) }), el('strong', { txt: x.nome }), el('small', { txt: i === 0 ? 'tríade' : i === 1 ? 'cor' : i === 2 ? 'abertura' : i === 3 ? 'tensão' : 'brilho' })])); if (i < caminhos.length - 1) tensoes.appendChild(el('span', { class: 'lab-atlas-seta', txt: '→' })); });
      alvo.appendChild(cartao('Cores e tensões', 'A mesma fundamental pode ganhar novas funções e cores sem perder sua identidade.', tensoes, 'lab-atlas-tensoes-card'));
      var modal = paralelo.slice(0, 7).map(function (x) { return acorde(x.fundamental, x.acorde); }); alvo.appendChild(cartao('Empréstimo modal', 'Acordes do modo paralelo criam contraste: toque um deles e depois volte ao campo principal.', chips(modal, 'paralelo'), 'lab-atlas-modal-card'));
      var instrumento = el('div', { class: 'lab-atlas-instrumentos' }); instrumento.appendChild(el('button', { type: 'button', class: 'btn sec', txt: 'Ver ' + diatonicos[0].nome + ' no piano', onclick: function () { location.href = '/music/explorar/piano?t=' + N.slug(t) + '&a=maior'; } })); instrumento.appendChild(el('button', { type: 'button', class: 'btn sec', txt: 'Ver no braço do violão', onclick: function () { location.href = '/music/explorar/braco?t=' + N.slug(t) + '&a=maior'; } })); alvo.appendChild(cartao('Leve para o instrumento', 'A imagem vira prática: abra o acorde no piano ou no braço e toque junto.', instrumento, 'lab-atlas-inst-card'));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'O atlas é um ponto de partida visual. Use os botões para ouvir, depois abra o desenho do instrumento e pratique.' }));
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

  // Composição original do Musique: uma grade de graus relativos que pode
  // ser transposta sem reescrever a ideia. O estado fica na URL e também
  // pode ser salvo no navegador; nenhuma música de terceiros é incorporada.
  F['compositor-visual'] = function (alvo, st) {
    st.tonica = st.tonica || 'do'; st.modo = st.modo || 'maior'; st.bpm = Number(st.bpm) || 92;
    st.compassos = Array.isArray(st.compassos) && st.compassos.length ? st.compassos : [0, 4, 5, 3, 0, 4, 5, 3];
    st.melodia = Array.isArray(st.melodia) && st.melodia.length ? st.melodia : [0, 2, 4, 2, 0, 2, 4, 6];
    st.secoes = Array.isArray(st.secoes) && st.secoes.length ? st.secoes : ['Intro', 'Intro', 'Verso', 'Verso', 'Refrão', 'Refrão', 'Ponte', 'Refrão'];
    st.duracoes = Array.isArray(st.duracoes) && st.duracoes.length ? st.duracoes : st.compassos.map(function () { return 4; });
    function campo() { return T.campo(tonicaDe(st), st.modo) || []; }
    function tocarCompasso(i, c) {
      var g = c[i], n = c[i] == null ? null : (A.notas(naOitava(g.fundamental, 3), g.acorde) || []).map(N.midi);
      if (n && n.length) C.Som.tocar(n, { modo: 'harmonico', dur: 60 / st.bpm * ((Number(st.duracoes[i]) || 4) - 0.25), vel: 0.58 });
      var m = st.melodia[i], escala = E.notas(naOitava(tonicaDe(st), 4), st.modo === 'menor' ? 'menor-natural' : 'maior') || [];
      if (m != null && escala[m]) setTimeout(function () { C.Som.tocar([N.midi(escala[m])], { dur: 60 / st.bpm * 0.8, vel: 0.82 }); }, 90);
    }
    function render() {
      C.gravarUrl(st); C.limpar(alvo); var c = campo();
      var modo = el('select', {}, ['maior', 'menor'].map(function (x) { return el('option', { value: x, txt: x === 'maior' ? 'Maior' : 'Menor', selected: st.modo === x }); }));
      modo.onchange = function () { st.modo = modo.value; render(); };
      var bpm = el('input', { type: 'number', min: 40, max: 220, step: 1, value: st.bpm, class: 'lab-input', 'aria-label': 'BPM' });
      bpm.onchange = function () { st.bpm = Math.max(40, Math.min(220, Number(bpm.value) || 92)); render(); };
      var salvar = el('button', { type: 'button', class: 'btn sec', txt: '💾 Salvar rascunho' });
      salvar.onclick = function () { try { localStorage.setItem('musique-compositor-visual-v1', JSON.stringify({ tonica: st.tonica, modo: st.modo, bpm: st.bpm, compassos: st.compassos, melodia: st.melodia })); C.aviso('Rascunho salvo neste navegador.'); } catch (_) { C.aviso('Não consegui salvar neste navegador.', 'erro'); } };
      var carregar = el('button', { type: 'button', class: 'btn sec', txt: '↥ Carregar rascunho' });
      carregar.onclick = function () { try { var x = JSON.parse(localStorage.getItem('musique-compositor-visual-v1') || 'null'); if (!x) return C.aviso('Ainda não há rascunho salvo.'); Object.keys(x).forEach(function (k) { st[k] = x[k]; }); render(); C.aviso('Rascunho carregado.'); } catch (_) { C.aviso('Rascunho inválido.', 'erro'); } };
      var importar = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar arranjo JSON' });
      importar.onchange = function () { var f = importar.files && importar.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var x = JSON.parse(rd.result), itens = Array.isArray(x.compassos) ? x.compassos : []; if (!itens.length) throw new Error('O JSON não contém compassos.'); if (typeof x.tonica === 'string' && N.ler(x.tonica)) st.tonica = N.slug(N.ler(x.tonica)); if (x.modo === 'maior' || x.modo === 'menor') st.modo = x.modo; if (Number(x.bpm)) st.bpm = Math.max(40, Math.min(220, Number(x.bpm))); if (typeof itens[0] === 'object') { var novo = itens.map(function (z) { var g = c.findIndex(function (q) { return q.romano === z.grau || q.simbolo === z.acorde; }); return g >= 0 ? g : 0; }); st.compassos = novo; st.secoes = itens.map(function (z) { return z.secao || 'Seção'; }); st.duracoes = itens.map(function (z) { return Number(z.duracao) || 4; }); st.melodia = itens.map(function (z) { return z.melodia == null ? null : Number(z.melodia); }); } else { st.compassos = itens.map(function (z) { return c.findIndex(function (q) { return q.romano === z || q.simbolo === z; }); }).map(function (z) { return z < 0 ? 0 : z; }); st.melodia = Array(st.compassos.length).fill(0); st.secoes = Array(st.compassos.length).fill('Seção'); st.duracoes = Array(st.compassos.length).fill(4); } render(); C.aviso('Arranjo importado.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
      var tocar = el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir sequência' }); var ativo = false, timer = null;
      tocar.onclick = function () { if (ativo) { ativo = false; clearTimeout(timer); grade.querySelectorAll('.tocando').forEach(function (x) { x.classList.remove('tocando'); }); tocar.textContent = '▶ Ouvir sequência'; return; } ativo = true; var i = 0; tocar.textContent = '■ Parar'; var passo = function () { if (!ativo) return; grade.querySelectorAll('.tocando').forEach(function (x) { x.classList.remove('tocando'); }); if (celulas[i]) celulas[i].classList.add('tocando'); tocarCompasso(i, c); var atual = i; i = (i + 1) % st.compassos.length; timer = setTimeout(passo, 60000 / st.bpm * (Number(st.duracoes[atual]) || 4)); }; passo(); };
      var adicionar = el('button', { type: 'button', class: 'btn sec', txt: '+ Compasso', onclick: function () { st.compassos.push(0); st.melodia.push(0); st.secoes.push('Novo'); st.duracoes.push(4); render(); } });
      var remover = el('button', { type: 'button', class: 'btn sec', txt: '− Compasso', disabled: st.compassos.length <= 1, onclick: function () { if (st.compassos.length > 1) { st.compassos.pop(); st.melodia.pop(); st.secoes.pop(); st.duracoes.pop(); render(); } } });
      alvo.appendChild(el('div', { class: 'lab-controles compositor-controles' }, [C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Modo' }), modo]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'BPM' }), bpm]), tocar, adicionar, remover, salvar, carregar, el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), importar])]));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'A ideia fica em graus (I, ii, V…), então mudar a tônica transpõe os acordes e a melodia juntos. Clique em um acorde para ouvir apenas aquele compasso.' }));
      var grade = el('div', { class: 'lab-compositor-grade', role: 'list', 'aria-label': 'Linha do tempo de composição' }); var celulas = [];
      var nomes = c.map(function (g) { return g.simbolo; });
      st.compassos.forEach(function (g, i) {
        var secao = el('input', { class: 'lab-compositor-secao', type: 'text', value: st.secoes[i] || 'Seção', maxlength: 24, 'aria-label': 'Seção do compasso ' + (i + 1) });
        secao.onchange = function () { st.secoes[i] = secao.value.trim() || 'Seção'; };
        var dur = el('select', { class: 'lab-compositor-duracao', 'aria-label': 'Duração do compasso ' + (i + 1) });
        [2, 3, 4, 6, 8].forEach(function (x) { dur.appendChild(el('option', { value: x, txt: x + ' tempos', selected: Number(st.duracoes[i]) === x })); });
        dur.onchange = function () { st.duracoes[i] = Number(dur.value); render(); };
        var cs = el('select', { class: 'lab-compositor-select', 'aria-label': 'Acorde do compasso ' + (i + 1) });
        c.forEach(function (x, k) { cs.appendChild(el('option', { value: k, txt: x.romano + ' · ' + x.simbolo, selected: Number(g) === k })); });
        cs.onchange = function () { st.compassos[i] = Number(cs.value); render(); };
        var ms = el('select', { class: 'lab-compositor-select', 'aria-label': 'Melodia do compasso ' + (i + 1) });
        ['— pausa', '1º grau', '2º grau', '3º grau', '4º grau', '5º grau', '6º grau', '7º grau'].forEach(function (x, k) { ms.appendChild(el('option', { value: k ? k - 1 : '', txt: x, selected: (g == null ? '' : Number(st.melodia[i])) === (k ? k - 1 : '') })); });
        ms.onchange = function () { st.melodia[i] = ms.value === '' ? null : Number(ms.value); render(); };
        var ouvirNo = el('button', { type: 'button', class: 'lab-compositor-ouvir', title: 'Ouvir compasso ' + (i + 1), txt: '▶', onclick: function () { tocarCompasso(i, c); } });
        var escalaAtual = E.notas(naOitava(tonicaDe(st), 4), st.modo === 'menor' ? 'menor-natural' : 'maior') || [], notaMel = st.melodia[i] == null ? null : escalaAtual[Number(st.melodia[i])], notasAcorde = (A.notas(naOitava(c[g].fundamental, 3), c[g].acorde) || []).map(N.pc), compat = notaMel == null ? 'sem melodia' : (notasAcorde.indexOf(N.pc(notaMel)) >= 0 ? 'nota do acorde' : 'tensão / passagem');
        var artigo = el('article', { class: 'lab-compositor-celula lab-func-' + String(c[g].funcao || 'tônica').replace(/[^a-z]/gi, '-'), role: 'listitem', style: 'flex-grow:' + Math.max(1, Number(st.duracoes[i]) || 4) }, [el('strong', { txt: 'Compasso ' + (i + 1) }), secao, cs, dur, el('span', { class: 'lab-compositor-melodia', txt: 'Melodia · ' + compat }), ouvirNo]);
        celulas.push(artigo); grade.appendChild(artigo);
      });
      alvo.appendChild(grade);
      var ultimo = st.compassos[st.compassos.length - 1], ordemSugestoes = [4, 5, 0, 3, 1, 2, 6].filter(function (x, i, a) { return x < c.length && a.indexOf(x) === i && x !== ultimo; });
      alvo.appendChild(el('section', { class: 'lab-compositor-paleta', 'aria-labelledby': 'compositor-paleta-t' }, [el('h3', { id: 'compositor-paleta-t', txt: 'Próximos caminhos sugeridos' }), el('p', { class: 'lab-dica', txt: 'Sugestões do campo harmônico para continuar a ideia. A escolha é sua.' }), el('div', { class: 'lab-compositor-sugestoes' }, ordemSugestoes.slice(0, 5).map(function (x) { return el('button', { type: 'button', class: 'lab-chip-botao', txt: c[x].romano + ' · ' + c[x].simbolo, title: 'Ouvir e adicionar ' + c[x].simbolo, onclick: function () { C.Som.tocar((A.notas(naOitava(c[x].fundamental, 3), c[x].acorde) || []).map(N.midi), { modo: 'harmonico', dur: 0.8 }); st.compassos.push(x); st.melodia.push(0); st.secoes.push(st.secoes[st.secoes.length - 1] || 'Seção'); st.duracoes.push(4); render(); } }); }))]));
      alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '↻ Nova ideia', onclick: function () { st.compassos = [0, 4, 5, 3, 0, 4, 5, 3]; st.melodia = [0, 2, 4, 2, 0, 2, 4, 6]; st.secoes = ['Intro', 'Intro', 'Verso', 'Verso', 'Refrão', 'Refrão', 'Ponte', 'Refrão']; st.duracoes = [4, 4, 4, 4, 4, 4, 4, 4]; render(); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar JSON', onclick: function () { C.baixar('compositor-visual-musique.json', 'application/json', JSON.stringify({ schema: 'musique.compositor.v2', tonica: C.nomeNota(tonicaDe(st)), modo: st.modo, bpm: st.bpm, compassos: st.compassos.map(function (x, i) { return { secao: st.secoes[i] || 'Seção', duracao: Number(st.duracoes[i]) || 4, grau: c[x].romano, acorde: c[x].simbolo, melodia: st.melodia[i] }; }), criado_em: new Date().toISOString() }, null, 2)); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar MIDI', onclick: function () { if (!C.midiArquivo) return C.aviso('Exportação MIDI indisponível neste navegador.', 'erro'); var ev = [], tempo = 0, escala = E.notas(naOitava(tonicaDe(st), 4), st.modo === 'menor' ? 'menor-natural' : 'maior') || []; st.compassos.forEach(function (x, i) { var d = Number(st.duracoes[i]) || 4, ac = A.notas(naOitava(c[x].fundamental, 3), c[x].acorde) || []; ac.forEach(function (n) { ev.push({ t: tempo, dur: d, midi: N.midi(n), vel: 72, canal: 0 }); }); var m = st.melodia[i] == null ? null : escala[Number(st.melodia[i])]; if (m) ev.push({ t: tempo, dur: Math.max(1, d / 2), midi: N.midi(m), vel: 96, canal: 1 }); tempo += d; }); C.baixar('compositor-visual-musique.mid', 'audio/midi', C.midiArquivo(ev, st.bpm, 4)); } })]));
    }
    render();
  };

  F['metronomo-distorcido'] = function (alvo, st) {
    st.bpm = st.bpm || 80; st.swing = st.swing || 0; st.omitir = st.omitir || 0; st.semente = st.semente || 17; var ag = null;
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var bpm = el('input', { type: 'range', min: 30, max: 220, value: st.bpm }); bpm.value = st.bpm;
      var swing = el('input', { type: 'range', min: 0, max: 65, value: st.swing }); swing.value = st.swing;
      var omit = el('input', { type: 'range', min: 0, max: 75, value: st.omitir }); omit.value = st.omitir;
       var seed = el('input', { type: 'number', min: 1, max: 9999, value: st.semente }); seed.value = st.semente;
      var info = el('p', { class: 'lab-dica', txt: 'BPM ' + st.bpm + ' · swing ' + st.swing + '% · omissões ' + st.omitir + '%' });
       function atualizar() { st.bpm = Number(bpm.value); st.swing = Number(swing.value); st.omitir = Number(omit.value); st.semente = Math.max(1, Math.min(9999, Number(seed.value) || 17)); info.textContent = 'BPM ' + st.bpm + ' · swing ' + st.swing + '% · omissões ' + st.omitir + '% · semente ' + st.semente; }
      [bpm, swing, omit].forEach(function (x) { x.oninput = atualizar; });
       var botao = el('button', { type: 'button', class: 'btn', txt: '▶ Iniciar', onclick: function () { atualizar(); if (ag) { C.Som.parar(); ag = null; botao.textContent = '▶ Iniciar'; return; } var por = 4; ag = C.Som.agendador({ bpm: st.bpm, porTempo: por, passos: 64, swing: st.swing / 100, aoPasso: function (i, q) { var forte = i % por === 0, perdido = !forte && ((i * 37 + st.semente) % 100 < st.omitir); if (!perdido) C.Som.bateria.clique(q, forte ? 0.9 : 0.55, forte); }, umaVez: false }); botao.textContent = '■ Parar'; } });
       var exportar = el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar groove MIDI', onclick: function () { if (!C.midiArquivo) return; atualizar(); var ev = []; for (var i = 0; i < 64; i++) { var forte = i % 4 === 0, perdido = !forte && ((i * 37 + st.semente) % 100 < st.omitir); if (!perdido) ev.push({ t: i, dur: 1, midi: forte ? 36 : 42, canal: 9, vel: forte ? 110 : 78 }); } C.baixar('metronomo-distorcido.mid', 'audio/midi', C.midiArquivo(ev, st.bpm, 4)); } });
       var arquivo = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar groove JSON' }); arquivo.onchange = function () { var f = arquivo.files && arquivo.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var j = JSON.parse(rd.result); st.bpm = Math.max(30, Math.min(220, Number(j.bpm) || 80)); st.swing = Math.max(0, Math.min(65, Number(j.swing) || 0)); st.omitir = Math.max(0, Math.min(75, Number(j.omissoes) || 0)); st.semente = Math.max(1, Math.min(9999, Number(j.semente) || 17)); render(); C.aviso('Groove importado.'); } catch (e) { C.aviso('Não consegui importar: ' + e.message, 'erro'); } }; rd.readAsText(f); };
       var exportarJson = el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar groove JSON', onclick: function () { atualizar(); C.baixar('metronomo-distorcido.json', 'application/json', JSON.stringify({ bpm: st.bpm, swing: st.swing, omissoes: st.omitir, semente: st.semente, criado_em: new Date().toISOString() }, null, 2)); } });
       alvo.appendChild(el('div', { class: 'lab-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Andamento' }), bpm]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Swing' }), swing]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Omissões' }), omit]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Semente' }), seed]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Importar JSON' }), arquivo]), botao, exportar, exportarJson])); alvo.appendChild(info);
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
       var modo3d = false; var alternar3d = el('button', { type: 'button', class: 'btn sec', 'aria-pressed': 'false', txt: '◇ Perspectiva 3D', onclick: function () { modo3d = !modo3d; box.classList.toggle('lab-grafo-3d', modo3d); alternar3d.setAttribute('aria-pressed', modo3d ? 'true' : 'false'); alternar3d.textContent = modo3d ? '◇ Voltar ao 2D' : '◇ Perspectiva 3D'; } });
       alvo.appendChild(box); alvo.appendChild(el('div', { class: 'lab-acoes' }, [alternar3d, el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar grafo SVG', onclick: function () { C.baixar('grafo-harmonico.svg', 'image/svg+xml', s.join('')); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Baixar grafo PNG', onclick: function () { C.baixarPng('grafo-harmonico.png', s.join(), 1640, 600); } }), el('button', { type: 'button', class: 'btn sec', txt: '⬇ Exportar grafo JSON', onclick: function () { C.baixar('grafo-harmonico.json', 'application/json', JSON.stringify({ progressao: st.texto, nos: acs.map(function (a, i) { return { indice: i + 1, acorde: A.simbolo(a.fundamental, a.id), notas: (A.notas(naOitava(a.fundamental, 3), a.id) || []).map(function (n) { return { nota: rot(n), midi: N.midi(n) }; }) }; }), criado_em: new Date().toISOString() }, null, 2)); } })])); alvo.appendChild(el('p', { class: 'lab-dica', txt: 'As linhas representam o percurso informado. Clique em um nó para ouvir o acorde e use o mapa de harmonia para comparar distâncias.' }));
    }
    render();
  };

  F['tendencias-harmonicas'] = function (alvo, st) {
    st.tonica = st.tonica || 'do';
    var padroes = [
      { nome: 'Pop circular', graus: [0, 4, 5, 3], roman: 'I · V · vi · IV', nota: 'Equilíbrio entre repouso, tensão e retorno.' },
      { nome: 'Cadência clássica', graus: [1, 4, 0], roman: 'ii · V · I', nota: 'Preparação, dominante e resolução.' },
      { nome: 'Ciclo suave', graus: [0, 5, 3, 4], roman: 'I · vi · IV · V', nota: 'Movimento contínuo com retorno ao dominante.' },
      { nome: 'Menor relativo', graus: [5, 3, 0, 4], roman: 'vi · IV · I · V', nota: 'Começa no relativo menor e abre para a tônica.' },
      { nome: 'Plagal ampliada', graus: [0, 3, 0, 4], roman: 'I · IV · I · V', nota: 'Alternância entre tônica e subdominante.' },
    ];
    function tocar(p, c) { p.graus.forEach(function (x, i) { var g = c[x]; if (g) setTimeout(function () { C.Som.tocar((A.notas(naOitava(g.fundamental, 3), g.acorde) || []).map(N.midi), { modo: 'harmonico', dur: 0.75 }); }, i * 800); }); } function funcao(x) { return [0, 2, 5].indexOf(x) >= 0 ? 'Tônica' : ([1, 3].indexOf(x) >= 0 ? 'Predominante' : 'Dominante'); }
    function render() { C.gravarUrl(st); C.limpar(alvo); var c = T.campo(tonicaDe(st), 'maior') || []; var texto = el('input', { type: 'text', class: 'lab-input', value: st.personalizada || '', placeholder: 'Ex.: I V vi IV ou C G Am F', 'aria-label': 'Progressão personalizada', onkeydown: function (ev) { if (ev.key === 'Enter') { st.personalizada = texto.value.trim(); render(); } } }); var aplicar = el('button', { type: 'button', class: 'btn', txt: 'Analisar', onclick: function () { st.personalizada = texto.value.trim(); render(); } }); alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }), el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Sua progressão' }), texto]), aplicar])); alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Use graus romanos ou nomes de acordes separados por espaço, vírgula ou seta.' })); if (st.personalizada) { var partes = st.personalizada.split(/[\s,;→>-]+/).filter(Boolean), custom = partes.map(function (x) { var grau = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'].indexOf(x); if (grau >= 0) return grau; var ac = A.ler(x); return ac ? c.findIndex(function (g) { return g.simbolo === A.simbolo(ac.fundamental, ac.id); }) : -1; }).filter(function (x) { return x >= 0; }); if (custom.length) { var cp = { graus: custom }, ca = custom.map(function (x) { return c[x].simbolo; }); alvo.appendChild(el('article', { class: 'lab-tendencia-card lab-tendencia-personalizada' }, [el('div', {}, [el('h3', { txt: 'Sua progressão analisada' }), el('p', { class: 'lab-graus-destaque', txt: custom.map(function (x) { return c[x].romano; }).join(' · ') }), el('p', { class: 'lab-dica', txt: ca.join(' · ') }), el('p', { class: 'lab-dica', txt: 'Funções: ' + custom.map(funcao).join(' · ') })]), el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir', onclick: function () { tocar(cp, c); } })])); } else { alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Não reconheci essa progressão. Use I, ii, V ou acordes como C, Am, G7.' })); } } var lista = el('div', { class: 'lab-tendencias-lista' }); padroes.forEach(function (p) { var acordes = p.graus.map(function (x) { return c[x] ? c[x].simbolo : ''; }); var ouvir = el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir', onclick: function () { tocar(p, c); } }); var abrir = el('a', { class: 'btn sec', href: '/music/criar/compositor-visual?tonica=' + encodeURIComponent(st.tonica), txt: 'Abrir no compositor' }); lista.appendChild(el('article', { class: 'lab-tendencia-card' }, [el('div', {}, [el('h3', { txt: p.nome }), el('p', { class: 'lab-graus-destaque', txt: p.roman }), el('p', { txt: p.nota }), el('p', { class: 'lab-dica', txt: acordes.join(' · ') }), el('p', { class: 'lab-dica', txt: 'Funções: ' + p.graus.map(funcao).join(' · ') } )]), el('div', { class: 'lab-acoes' }, [ouvir, abrir])])); }); alvo.appendChild(lista); }
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
