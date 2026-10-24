// Musique · diagnóstico de habilidades para violão e guitarra.
(function (w) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas, el = C.el;
  var ITENS = [['ritmo', 'Ritmo e pulso', 'Mantenho a subdivisão e a batida sem acelerar.', '/music/criar/laboratorio-batidas'], ['acordes', 'Acordes e trocas', 'As formas soam limpas e as trocas não interrompem o pulso.', '/music/criar/troca-acordes'], ['tecnica', 'Técnica das mãos', 'Tenho controle de ataque, articulação e relaxamento.', '/music/criar/tecnicas-guitarra'], ['ouvido', 'Ouvido musical', 'Consigo cantar, reconhecer e encontrar notas ou acordes.', '/music/criar/rotina-ouvido-guitarra'], ['repertorio', 'Repertório completo', 'Consigo atravessar uma música, incluindo entradas e finais.', '/music/criar/repertorio-checkpoints']];
  function render(alvo, st) {
    st.valores = st.valores || {}; C.limpar(alvo);
    alvo.appendChild(el('header', { class: 'lab-cab' }, [el('h2', { txt: 'Diagnóstico de habilidades' }), el('p', { class: 'lab-lead', txt: 'Avalie cada habilidade de 1 a 5. Não é uma nota escolar: é um retrato para escolher o próximo estudo.' })]));
    var lista = el('div', { class: 'diagnostico-habilidades-lista' });
    ITENS.forEach(function (item) { var atual = Number(st.valores[item[0]]) || 0; var card = el('article', { class: 'diagnostico-habilidade-card' }, [el('div', {}, [el('strong', { txt: item[1] }), el('p', { class: 'lab-dica', txt: item[2] }), el('small', { txt: atual ? 'Nível atual: ' + atual + '/5' : 'Ainda não avaliado' })])]); var botoes = el('div', { class: 'diagnostico-habilidade-botoes' }); [1, 2, 3, 4, 5].forEach(function (n) { botoes.appendChild(el('button', { type: 'button', class: 'btn sec' + (n === atual ? ' ativo' : ''), txt: String(n), 'aria-label': item[1] + ': ' + n + ' de 5', onclick: function () { st.valores[item[0]] = n; C.guardar('diagnostico-habilidades-guitarra', st.valores); render(alvo, st); } })); }); card.appendChild(botoes); if (atual && atual <= 2) card.appendChild(el('a', { class: 'diagnostico-habilidade-link', href: item[3], txt: 'Praticar esta habilidade →' })); lista.appendChild(card); });
    alvo.appendChild(lista); alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('a', { class: 'btn', href: '/music/criar/painel-estudos-guitarra', txt: 'Voltar ao painel' }), el('a', { class: 'btn sec', href: '/music/criar/jornada-guitarra', txt: 'Abrir jornada' })]));
  }
  F['diagnostico-habilidades-guitarra'] = function (alvo) { render(alvo, { valores: C.lerLocal('diagnostico-habilidades-guitarra', {}) || {} }); };
})(window);
