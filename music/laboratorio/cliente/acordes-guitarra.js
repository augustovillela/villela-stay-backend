// Musique · Laboratório de acordes para violão e guitarra.
(function (w) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas, A = L.acordes, N = L.notas, el = C.el;
  var GRUPOS = {
    abertos: { nome: 'Acordes abertos', descricao: 'Formas iniciais para acompanhar músicas.', itens: ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm'] },
    pestanas: { nome: 'Pestanas e formas móveis', descricao: 'Formas que viajam pelo braço com uma fundamental clara.', itens: ['F', 'Bm', 'Bb', 'C#m'] },
    setimas: { nome: 'Acordes com sétima', descricao: 'Cores e direções para pop, blues, MPB e acompanhamento.', itens: ['A7', 'D7', 'E7', 'G7', 'C7', 'Am7', 'Em7', 'C7M'] }
  };
  function acorde(txt) { return A.ler(txt); }
  function tocar(txt) { var a = acorde(txt), ns = a && A.notas(N.comOitava(a.fundamental, 3), a.id); if (ns && C.Som) C.Som.tocar(ns.map(N.midi), { modo: 'harmonico', dur: 1.2 }); }
  function arpejar(txt) { var a = acorde(txt), ns = a && A.notas(N.comOitava(a.fundamental, 3), a.id); if (ns && C.Som) C.Som.tocar(ns.map(N.midi), { modo: 'melodico', dur: .42, passo: .24 }); }
  // Formas de referência em afinação padrão, da 6ª para a 1ª corda.
  // -1 = corda abafada; 0 = corda solta. São as posições iniciais que o aluno
  // encontra nos primeiros estudos e podem ser transportadas no editor de braço.
  var FORMAS = {
    C: [-1, 3, 2, 0, 1, 0], G: [3, 2, 0, 0, 0, 3], D: [-1, -1, 0, 2, 3, 2], A: [-1, 0, 2, 2, 2, 0], E: [0, 2, 2, 1, 0, 0],
    Am: [-1, 0, 2, 2, 1, 0], Em: [0, 2, 2, 0, 0, 0], Dm: [-1, -1, 0, 2, 3, 1], F: [1, 3, 3, 2, 1, 1],
    Bm: [-1, 2, 4, 4, 3, 2], Bb: [1, 3, 3, 2, 1, 1], 'C#m': [-1, 4, 6, 6, 5, 4], A7: [-1, 0, 2, 0, 2, 0],
    D7: [-1, -1, 0, 2, 1, 2], E7: [0, 2, 0, 1, 0, 0], G7: [3, 2, 0, 0, 0, 1], C7: [-1, 3, 2, 3, 1, 0],
    Am7: [-1, 0, 2, 0, 1, 0], Em7: [0, 2, 0, 0, 0, 0], C7M: [-1, 3, 2, 0, 0, 0]
  };
  function diagrama(txt) {
    var forma = FORMAS[txt]; if (!forma) return el('p', { class: 'acorde-guitarra-sem-forma', txt: 'Diagrama em preparação.' });
    var NS = 'http://www.w3.org/2000/svg', W = 132, H = 150, x0 = 25, y0 = 30, dx = 16, dy = 19;
    function s(tag, at) { var n = document.createElementNS(NS, tag); Object.keys(at || {}).forEach(function (k) { n.setAttribute(k, at[k]); }); return n; }
    function t(x, y, texto, at) { var n = s('text', Object.assign({ x: x, y: y, 'text-anchor': 'middle', 'font-size': 12, 'font-family': 'Inter,Arial,sans-serif', fill: '#526176' }, at || {})); n.textContent = texto; return n; }
    var box = s('svg', { class: 'acorde-guitarra-diagrama', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Cifra de ' + txt + ': ' + forma.map(function (n) { return n < 0 ? 'abafada' : n === 0 ? 'solta' : 'casa ' + n; }).join(', ') });
    for (var i = 0; i < 6; i++) { box.appendChild(s('line', { x1: x0 + i * dx, x2: x0 + i * dx, y1: y0, y2: y0 + 4 * dy, stroke: '#64748B', 'stroke-width': i === 0 ? 2 : 1 })); }
    for (var f = 0; f <= 4; f++) box.appendChild(s('line', { x1: x0, x2: x0 + 5 * dx, y1: y0 + f * dy, y2: y0 + f * dy, stroke: '#64748B', 'stroke-width': f === 0 ? 3 : 1 }));
    forma.forEach(function (casa, i) { var x = x0 + i * dx; if (casa < 0) box.appendChild(t(x, y0 - 10, '×', { fill: '#B45309', 'font-size': 15, 'font-weight': 700 })); else if (casa === 0) box.appendChild(t(x, y0 - 10, '○', { fill: '#1B2A4A', 'font-size': 15 })); else { var y = y0 + (casa - 0.5) * dy; box.appendChild(s('circle', { cx: x, cy: y, r: 6.5, fill: '#1B2A4A' })); box.appendChild(t(x, y + 4, String(casa), { fill: '#fff', 'font-size': 9, 'font-weight': 700 })); } });
    [6, 5, 4, 3, 2, 1].forEach(function (c, i) { box.appendChild(t(x0 + i * dx, y0 + 4 * dy + 18, String(c), { 'font-size': 10 })); });
    return el('div', { class: 'acorde-guitarra-diagrama-wrap' }, [box, el('small', { class: 'acorde-guitarra-legenda', txt: '× abafada · ○ solta · números = casas' })]);
  }
  function render(alvo, st) {
    st.grupo = st.grupo || 'abertos'; st.bpm = Math.max(40, Math.min(180, Number(st.bpm) || 60)); st.limpas = Number(st.limpas) || 0; var g = GRUPOS[st.grupo] || GRUPOS.abertos;
    C.limpar(alvo);
    alvo.appendChild(el('header', { class: 'lab-cab acordes-guitarra-cab' }, [el('h2', { txt: 'Acordes para violão e guitarra' }), el('p', { class: 'lab-lead', txt: 'Aprenda formas em ordem: abertos, pestanas e sétimas. Ouça cada acorde, escolha um par e só acelere quando a troca estiver limpa.' })]));
    var sel = el('select', { class: 'lab-select', 'aria-label': 'Família de acordes' }); Object.keys(GRUPOS).forEach(function (id) { sel.appendChild(el('option', { value: id, txt: GRUPOS[id].nome, selected: id === st.grupo })); }); sel.onchange = function () { st.grupo = sel.value; st.limpas = 0; render(alvo, st); };
    var bpm = el('input', { type: 'number', class: 'lab-input', min: 40, max: 180, step: 5, value: st.bpm, 'aria-label': 'BPM inicial' });
    var escolhido = st.par || [g.itens[0], g.itens[1]]; if (g.itens.indexOf(escolhido[0]) < 0 || g.itens.indexOf(escolhido[1]) < 0) escolhido = [g.itens[0], g.itens[1]];
    var p1 = el('select', { class: 'lab-select', 'aria-label': 'Primeiro acorde' }), p2 = el('select', { class: 'lab-select', 'aria-label': 'Segundo acorde' });
    g.itens.forEach(function (x) { p1.appendChild(el('option', { value: x, txt: x, selected: x === escolhido[0] })); p2.appendChild(el('option', { value: x, txt: x, selected: x === escolhido[1] })); });
    var atualizarPar = function () { st.par = [p1.value, p2.value]; }; p1.onchange = atualizarPar; p2.onchange = atualizarPar; bpm.onchange = function () { st.bpm = Math.max(40, Math.min(180, Number(bpm.value) || 60)); C.guardar('acordes-guitarra-config', { bpm: st.bpm, grupo: st.grupo, par: [p1.value, p2.value] }); };
    alvo.appendChild(el('div', { class: 'lab-controles acordes-guitarra-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Família' }), sel]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Acorde 1' }), p1]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'Acorde 2' }), p2]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'BPM inicial' }), bpm]) ]));
    alvo.appendChild(el('p', { class: 'lab-dica', txt: g.descricao + ' · Trocas limpas registradas: ' + st.limpas + ' · três trocas estáveis aumentam 5 BPM.' }));
    var cards = el('div', { class: 'acordes-guitarra-cards' }); g.itens.forEach(function (x) { var a = acorde(x), ns = a && A.notas(N.comOitava(a.fundamental, 3), a.id); cards.appendChild(el('article', { class: 'acorde-guitarra-card' }, [el('strong', { txt: x }), diagrama(x), el('small', { txt: ns ? ns.map(function (n) { return C.nomeNota(n); }).join(' · ') : 'forma em revisão' }), el('div', { class: 'lab-acoes acorde-guitarra-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '▶ Ouvir', onclick: function () { tocar(x); } }), el('button', { type: 'button', class: 'btn sec', txt: '♫ Arpejo', onclick: function () { arpejar(x); } })])])); }); alvo.appendChild(cards);
    var treino = el('section', { class: 'acordes-guitarra-treino' }, [el('h3', { txt: 'Treino de troca' }), el('p', { txt: escolhido[0] + ' ↔ ' + escolhido[1] + ' · conte quatro tempos por acorde.' })]);
    treino.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '▶ Ouvir acorde 1', onclick: function () { tocar(escolhido[0]); } }), el('button', { type: 'button', class: 'btn sec', txt: '▶ Ouvir acorde 2', onclick: function () { tocar(escolhido[1]); } }), el('button', { type: 'button', class: 'btn', txt: '✓ Marcar troca limpa', onclick: function () { st.limpas += 1; if (st.limpas % 3 === 0 && st.bpm < 180) st.bpm += 5; C.guardar('acordes-guitarra-progresso', { limpas: st.limpas, bpm: st.bpm, grupo: st.grupo, par: [p1.value, p2.value] }); render(alvo, st); } })]));
    alvo.appendChild(treino); alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Sinal para acelerar: três trocas consecutivas sem cordas abafadas, interrupção ou tensão desnecessária.' }));
  }
  F['acordes-guitarra'] = function (alvo, st) { var salvo = C.lerLocal('acordes-guitarra-progresso', {}); Object.keys(salvo).forEach(function (k) { st[k] = salvo[k]; }); var cfg = C.lerLocal('acordes-guitarra-config', {}); if (cfg.grupo) st.grupo = cfg.grupo; if (cfg.bpm) st.bpm = cfg.bpm; if (cfg.par) st.par = cfg.par; render(alvo, st); };
})(window);
