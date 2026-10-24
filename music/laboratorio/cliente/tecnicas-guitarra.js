// Musique · Laboratório · técnicas de articulação para violão e guitarra.
(function (w) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas, N = L.notas, el = C.el;
  var TECNICAS = [
    { id: 'slide', nome: 'Slide', sinal: '↗', resumo: 'Deslize mantendo a pressão e faça a nota chegar sem degrau.', pratica: 'Toque a nota grave e deslize duas casas até a aguda. O movimento deve ser contínuo.', seq: [0, 2, 4, 2] },
    { id: 'hammer-on', nome: 'Hammer-on', sinal: '⌃', resumo: 'Ataque uma nota e pressione a próxima sem novo ataque da mão direita.', pratica: 'Toque a primeira nota, mantenha o dedo preparado e golpeie a segunda com precisão.', seq: [0, 2, 4, 5] },
    { id: 'pull-off', nome: 'Pull-off', sinal: '⌄', resumo: 'Retire o dedo sem deixar a corda desaparecer nem soar forte demais.', pratica: 'Prenda duas notas, ataque a mais aguda e puxe o dedo para revelar a mais grave.', seq: [5, 4, 2, 0] },
    { id: 'ligados', nome: 'Ligados combinados', sinal: '⌁', resumo: 'Una hammer-ons e pull-offs numa frase regular.', pratica: 'Faça quatro notas por corda, mantendo o volume parecido entre ataques e ligados.', seq: [0, 2, 4, 2, 0] },
    { id: 'bends', nome: 'Bend', sinal: '↗︎', resumo: 'Empurre a corda até alcançar exatamente a altura desejada.', pratica: 'Ouça a nota-alvo antes, faça o bend lentamente e confira se a afinação chegou ao mesmo lugar.', seq: [0, 2, 4, 2] },
    { id: 'vibrato', nome: 'Vibrato', sinal: '〰', resumo: 'Oscile a altura com controle, sem transformar a nota em ruído.', pratica: 'Sustente uma nota, faça oscilações pequenas e regulares e só depois aumente a amplitude.', seq: [0, 2, 0, 2] }
  ];
  function render(alvo, st) {
    st.indice = Math.max(0, Math.min(TECNICAS.length - 1, Number(st.indice) || 0));
    st.bpm = Math.max(40, Math.min(180, Number(st.bpm) || 60));
    st.concluidas = st.concluidas || {};
    var t = TECNICAS[st.indice]; C.limpar(alvo);
    alvo.appendChild(el('header', { class: 'lab-cab tecnicas-guitarra-cab' }, [el('h2', { txt: 'Técnicas de articulação' }), el('p', { class: 'lab-lead', txt: 'Estude o gesto devagar, escute a altura e só acelere quando a articulação continuar limpa.' })]));
    var sel = el('select', { class: 'lab-select', 'aria-label': 'Técnica' }); TECNICAS.forEach(function (x, i) { sel.appendChild(el('option', { value: i, txt: (i + 1) + ' · ' + x.nome, selected: i === st.indice })); }); sel.onchange = function () { st.indice = Number(sel.value); salvar(); render(alvo, st); };
    var bpm = el('input', { type: 'number', class: 'lab-input', min: 40, max: 180, step: 5, value: st.bpm, 'aria-label': 'BPM' });
    alvo.appendChild(el('div', { class: 'lab-controles tecnicas-guitarra-controles' }, [el('label', { class: 'lab-campo' }, [el('span', { txt: 'Técnica' }), sel]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'BPM' }), bpm]), el('button', { type: 'button', class: 'btn', txt: 'Aplicar BPM', onclick: function () { st.bpm = Math.max(40, Math.min(180, Number(bpm.value) || 60)); salvar(); render(alvo, st); } })]));
    alvo.appendChild(el('div', { class: 'tecnicas-guitarra-lista' }, TECNICAS.map(function (x, i) { return el('button', { type: 'button', class: 'tecnica-guitarra-chip' + (i === st.indice ? ' ativa' : '') + (st.concluidas[x.id] ? ' concluida' : ''), onclick: function () { st.indice = i; salvar(); render(alvo, st); } }, [el('strong', { txt: x.sinal }), el('span', { txt: x.nome }), st.concluidas[x.id] ? el('small', { txt: '✓' }) : null]); })));
    alvo.appendChild(el('article', { class: 'lab-tendencia-card tecnica-guitarra-detalhe' }, [el('span', { class: 'tecnica-guitarra-sinal', txt: t.sinal }), el('h3', { txt: t.nome }), el('p', { txt: t.resumo }), el('p', { class: 'lab-dica', txt: t.pratica }), el('p', { class: 'lab-dica', txt: 'Meta: quatro repetições sem ruído, tensão ou perda do pulso.' })]));
    function ouvir() { var base = 57, passo = 60000 / st.bpm; t.seq.forEach(function (x, i) { setTimeout(function () { C.Som.tocar([base + x], { modo: 'dedilhado', dur: Math.max(.15, passo / 1000 * .8), vel: .7 }); }, i * passo); }); }
    function salvar() { C.guardar('tecnicas-guitarra-progresso', { indice: st.indice, bpm: st.bpm, concluidas: st.concluidas }); }
    alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'lab-ouvir', txt: '▶ Ouvir demonstração', onclick: ouvir }), el('button', { type: 'button', class: 'btn', txt: st.concluidas[t.id] ? '✓ Concluída' : 'Marcar técnica praticada', onclick: function () { st.concluidas[t.id] = true; salvar(); render(alvo, st); } }), el('a', { class: 'btn sec', href: '/music/tutor-braco', txt: 'Praticar no tutor de braço' })]));
    alvo.appendChild(el('p', { class: 'lab-dica', txt: Object.keys(st.concluidas).filter(function (k) { return st.concluidas[k]; }).length + '/' + TECNICAS.length + ' técnicas registradas nesta etapa.' }));
  }
  F['tecnicas-guitarra'] = function (alvo, st) { var salvo = C.lerLocal('tecnicas-guitarra-progresso', {}); Object.keys(salvo || {}).forEach(function (k) { st[k] = salvo[k]; }); render(alvo, st); };
})(window);
