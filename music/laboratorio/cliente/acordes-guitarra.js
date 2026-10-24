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
    var cards = el('div', { class: 'acordes-guitarra-cards' }); g.itens.forEach(function (x) { var a = acorde(x), ns = a && A.notas(N.comOitava(a.fundamental, 3), a.id); cards.appendChild(el('article', { class: 'acorde-guitarra-card' }, [el('strong', { txt: x }), el('small', { txt: ns ? ns.map(function (n) { return C.nomeNota(n); }).join(' · ') : 'forma em revisão' }), el('button', { type: 'button', class: 'btn sec', txt: '▶ Ouvir', onclick: function () { tocar(x); } })])); }); alvo.appendChild(cards);
    var treino = el('section', { class: 'acordes-guitarra-treino' }, [el('h3', { txt: 'Treino de troca' }), el('p', { txt: escolhido[0] + ' ↔ ' + escolhido[1] + ' · conte quatro tempos por acorde.' })]);
    treino.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '▶ Ouvir acorde 1', onclick: function () { tocar(escolhido[0]); } }), el('button', { type: 'button', class: 'btn sec', txt: '▶ Ouvir acorde 2', onclick: function () { tocar(escolhido[1]); } }), el('button', { type: 'button', class: 'btn', txt: '✓ Marcar troca limpa', onclick: function () { st.limpas += 1; if (st.limpas % 3 === 0 && st.bpm < 180) st.bpm += 5; C.guardar('acordes-guitarra-progresso', { limpas: st.limpas, bpm: st.bpm, grupo: st.grupo, par: [p1.value, p2.value] }); render(alvo, st); } })]));
    alvo.appendChild(treino); alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Sinal para acelerar: três trocas consecutivas sem cordas abafadas, interrupção ou tensão desnecessária.' }));
  }
  F['acordes-guitarra'] = function (alvo, st) { var salvo = C.lerLocal('acordes-guitarra-progresso', {}); Object.keys(salvo).forEach(function (k) { st[k] = salvo[k]; }); var cfg = C.lerLocal('acordes-guitarra-config', {}); if (cfg.grupo) st.grupo = cfg.grupo; if (cfg.bpm) st.bpm = cfg.bpm; if (cfg.par) st.par = cfg.par; render(alvo, st); };
})(window);
