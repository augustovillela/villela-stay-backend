// Musique · Laboratório · improvisação guiada para violão e guitarra.
(function (w) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas, N = L.notas, A = L.acordes, E = L.escalas, el = C.el;
  var EX = [
    { id: 'menor-rock', nome: 'Pentatônica menor · rock/blues', tonica: 'A', escala: 'pentatonica-menor', acordes: ['Am', 'F', 'C', 'G'], sensacoes: ['introspectivo / tenso', 'aberto / emotivo', 'luminoso / estável', 'impulso / expectativa'], alvo: 'A', dica: 'Termine a frase na tônica A e use pausas como parte do ritmo.' },
    { id: 'maior-pop', nome: 'Pentatônica maior · pop/folk', tonica: 'C', escala: 'pentatonica-maior', acordes: ['C', 'G', 'Am', 'F'], sensacoes: ['alegre / repouso', 'brilho / movimento', 'doce / melancólico', 'acolhedor / expansivo'], alvo: 'E', dica: 'Use E ou G como nota de chegada e responda como se estivesse cantando.' },
    { id: 'mixolidio', nome: 'Mixolídio · dominante e funk', tonica: 'D', escala: 'mixolidio', acordes: ['D7', 'G7'], sensacoes: ['tensão / chamada', 'resposta / abertura'], alvo: 'C', dica: 'A 7ª menor C dá a cor mixolídia; resolva depois em D.' }
  ];
  function notaBase(txt) { var n = N.ler(txt); return n ? N.comOitava(n, n.li >= 4 ? 4 : 3) : N.ler('A3'); }
  function acordeNotas(txt) { var a = A.ler(txt); return a ? (A.notas(notaBase(a.fundamental), a.id) || []).map(N.midi) : []; }
  function render(alvo, st) {
    st.indice = Math.max(0, Math.min(EX.length - 1, Number(st.indice) || 0)); st.bpm = Math.max(50, Math.min(160, Number(st.bpm) || 80)); st.concluidos = st.concluidos || {};
    var ex = EX[st.indice], t = N.ler(ex.tonica), ns = E.notas(notaBase(ex.tonica), ex.escala) || [];
    C.limpar(alvo);
    alvo.appendChild(el('header', { class: 'lab-cab improvisacao-guitarra-cab' }, [el('h2', { txt: 'Improvisação guiada' }), el('p', { class: 'lab-lead', txt: 'Escolha poucas notas, ouça a harmonia e crie uma pergunta e uma resposta. Improvisar é organizar ideias, não correr pela escala.' })]));
    var sel = el('select', { class: 'lab-select', 'aria-label': 'Estudo de improvisação' }); EX.forEach(function (x, i) { sel.appendChild(el('option', { value: i, txt: (i + 1) + ' · ' + x.nome, selected: i === st.indice })); }); sel.onchange = function () { st.indice = Number(sel.value); salvar(); render(alvo, st); };
    var bpm = el('input', { type: 'number', class: 'lab-input', min: 50, max: 160, step: 5, value: st.bpm, 'aria-label': 'BPM' });
    alvo.appendChild(el('div', { class: 'lab-controles improvisacao-guitarra-controles' }, [el('label', { class: 'lab-campo lab-campo-largo' }, [el('span', { txt: 'Estudo' }), sel]), el('label', { class: 'lab-campo' }, [el('span', { txt: 'BPM' }), bpm]), el('button', { type: 'button', class: 'btn', txt: 'Aplicar BPM', onclick: function () { st.bpm = Math.max(50, Math.min(160, Number(bpm.value) || 80)); salvar(); render(alvo, st); } })]));
    alvo.appendChild(el('article', { class: 'lab-tendencia-card improvisacao-guitarra-guia' }, [el('span', { class: 'lab-batida-tipo', txt: 'GUIA DE FRASE' }), el('h3', { txt: ex.nome }), el('p', { txt: 'Tônica: ' + ex.tonica + ' · nota-alvo: ' + ex.alvo }), el('p', { class: 'lab-graus-destaque', txt: ns.map(function (n) { return C.nomeNota(n); }).join(' · ') }), el('p', { class: 'lab-dica', txt: ex.dica })]));
    var base = el('div', { class: 'improvisacao-guitarra-acordes', role: 'list', 'aria-label': 'Progressão de acompanhamento e sensações sugeridas' }); ex.acordes.forEach(function (x, i) { var sensacao = ex.sensacoes[i] || 'cor a explorar'; base.appendChild(el('span', { role: 'listitem', class: 'improvisacao-guitarra-acorde', 'aria-label': x + ' — sensação sugerida: ' + sensacao }, [el('strong', { txt: x }), el('small', { txt: sensacao })])); }); alvo.appendChild(base);
    function tocarBase() { C.Som.parar(); C.Som.sequencia(ex.acordes.map(acordeNotas), { dur: 60 / st.bpm * 4 }); }
    function tocarEscala() { C.Som.tocar(ns.map(N.midi), { modo: 'melodico', dur: .28, passo: 60 / st.bpm / 2 }); }
    function salvar() { C.guardar('improvisacao-guitarra-progresso', { indice: st.indice, bpm: st.bpm, concluidos: st.concluidos }); }
    alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn', txt: '▶ Ouvir base', onclick: tocarBase }), el('button', { type: 'button', class: 'btn sec', txt: '♫ Ouvir escala', onclick: tocarEscala }), el('button', { type: 'button', class: 'btn sec', txt: st.concluidos[ex.id] ? '✓ Estudo concluído' : 'Marcar estudo concluído', onclick: function () { st.concluidos[ex.id] = true; salvar(); render(alvo, st); } })]));
    alvo.appendChild(el('ol', { class: 'lab-lista improvisacao-guitarra-passos' }, [el('li', { txt: 'Ouça a base duas vezes sem tocar.' }), el('li', { txt: 'Cante ou toque apenas a nota-alvo no primeiro tempo.' }), el('li', { txt: 'Crie uma pergunta de dois compassos e uma resposta de dois compassos.' }), el('li', { txt: 'Repita mudando apenas o ritmo; mantenha algumas notas em silêncio.' })]));
  }
  F['improvisacao-guitarra'] = function (alvo, st) { var salvo = C.lerLocal('improvisacao-guitarra-progresso', {}); Object.keys(salvo || {}).forEach(function (k) { st[k] = salvo[k]; }); render(alvo, st); };
})(window);
