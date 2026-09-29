// =====================================================================
// Musique · Laboratório — CLIENTE · Criar. Instrumentos e ferramentas de
// estúdio de bolso. Nada é gravado nem enviado: o som é sintetizado no
// aparelho. Exportar (MIDI/JSON) é da assinatura (acesso.js).
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas;
  var N = L.notas, I = L.intervalos, E = L.escalas, A = L.acordes, T = L.tonalidades, D = L.desenho, R = L.ritmo, X = L.exercicios;
  var el = C.el;
  function rot(n) { return C.nomeNota(n); }
  function tonicaDe(st) { return N.deSlug(st.tonica) || N.ler('C'); }
  function naOitava(t, o) { return N.comOitava(t, t.oitava != null ? t.oitava : (t.li >= 4 ? (o || 4) - 1 : (o || 4))); }
  function campoNum(id, rotulo, valor, min, max, aoMudar, passo) {
    var i = el('input', { id: id, type: 'number', min: min, max: max, step: passo || 1, value: valor, oninput: function () { var v = Number(i.value); if (v >= min && v <= max) aoMudar(v); } });
    return el('div', { class: 'lab-campo' }, [el('label', { for: id, txt: rotulo }), i]);
  }
  function exportar(st, nome, tipo, dados) {
    if (!st.exportar) { C.aviso('Exportar faz parte da assinatura do Musique. O resto da ferramenta é livre.', 'erro'); return; }
    C.baixar(nome, tipo, dados);
  }

  // ---- MIDI: arquivo padrão (formato 0), escrito à mão, sem biblioteca ----
  function midiArquivo(eventos, bpm) {
    // eventos: [{ t: passos, dur: passos, midi, canal, vel }], 4 passos por semínima, 480 ppq
    var ppq = 480, porPasso = ppq / 4;
    var ev = [];
    eventos.forEach(function (e) { ev.push({ t: e.t * porPasso, b: [0x90 | (e.canal || 0), e.midi, e.vel || 90] }); ev.push({ t: (e.t + (e.dur || 1)) * porPasso - 1, b: [0x80 | (e.canal || 0), e.midi, 0] }); });
    ev.sort(function (a, b) { return a.t - b.t; });
    var trilha = [];
    function vlq(v) { var s = [v & 0x7f]; while ((v >>= 7)) s.unshift((v & 0x7f) | 0x80); return s; }
    var tempo = Math.round(60000000 / bpm);
    trilha.push(0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255);
    var ult = 0;
    ev.forEach(function (x) { trilha.push.apply(trilha, vlq(Math.max(0, x.t - ult))); trilha.push.apply(trilha, x.b); ult = x.t; });
    trilha.push(0, 0xff, 0x2f, 0);
    var cab = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255];
    var tl = trilha.length;
    var mt = [0x4d, 0x54, 0x72, 0x6b, (tl >> 24) & 255, (tl >> 16) & 255, (tl >> 8) & 255, tl & 255];
    return new Uint8Array(cab.concat(mt, trilha));
  }

  // ------------------------------------------------------------------
  // Piano virtual: mouse, toque, teclado do computador; MIDI opcional
  // ------------------------------------------------------------------
  F['piano-virtual'] = function (alvo, st) {
    var MAPA = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, 'ç': 16 };
    var base = 60, soando = {}, historico = [];
    var info = el('p', { class: 'lab-info', 'aria-live': 'polite', txt: 'Toque com o mouse, com o dedo ou com as teclas A W S E D F T G Y H U J K. Z e X mudam a oitava.' });
    var box = el('div', { class: 'lab-svgbox' });
    var acordeTxt = el('p', { class: 'lab-acorde-atual', 'aria-live': 'polite' });
    function pintar() {
      var dd = {}; Object.keys(soando).forEach(function (m) { dd[m] = { rotulo: rot(N.deMidi(Number(m))), tipo: 'nota' }; });
      box.innerHTML = D.piano({ de: base - 12, ate: base + 16, destaques: dd, interativo: true, rotulos: 'dos', notacao: C.notacao, titulo: 'Piano virtual' });
      var ms = Object.keys(soando).map(Number).sort(function (a, b) { return a - b; });
      var r = ms.length >= 2 ? A.identificar(ms) : [];
      acordeTxt.textContent = r.length ? 'Acorde: ' + r.slice(0, 3).map(function (x) { return x.simbolo; }).join(' ou ') : '';
    }
    function tocar(m) { C.Som.tocar([m], { dur: 1.2 }); soando[m] = 1; historico.push(m); if (historico.length > 16) historico.shift(); info.textContent = 'Última: ' + rot(N.deMidi(m)) + ' ' + N.deMidi(m).oitava + ' · sequência: ' + historico.slice(-8).map(function (x) { return rot(N.deMidi(x)); }).join(' '); pintar(); }
    function soltar(m) { delete soando[m]; pintar(); }
    box.addEventListener('pointerdown', function (e) { var k = e.target.closest('[data-midi]'); if (!k) return; e.preventDefault(); var m = Number(k.dataset.midi); tocar(m); var up = function () { soltar(m); w.removeEventListener('pointerup', up); }; w.addEventListener('pointerup', up); });
    box.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.midi) { e.preventDefault(); var m = Number(e.target.dataset.midi); tocar(m); setTimeout(function () { soltar(m); }, 300); } });
    function teclado(e) {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;     // guarda de foco: não sequestra campos
      var k = e.key.toLowerCase();
      if (e.type === 'keydown' && k === 'z') { base = Math.max(24, base - 12); pintar(); return; }
      if (e.type === 'keydown' && k === 'x') { base = Math.min(96, base + 12); pintar(); return; }
      if (!(k in MAPA) || e.repeat) return;
      var m = base + MAPA[k];
      if (e.type === 'keydown') tocar(m); else soltar(m);
    }
    d.addEventListener('keydown', teclado); d.addEventListener('keyup', teclado);
    var midiBtn = el('button', { type: 'button', class: 'btn sec', txt: 'Conectar teclado MIDI (opcional)', onclick: function () {
      if (!navigator.requestMIDIAccess) { C.aviso('Este navegador não tem Web MIDI (o iPhone e o Safari não têm). O piano funciona igual pelo toque e pelo teclado.'); return; }
      navigator.requestMIDIAccess().then(function (acc) {
        var n = 0; acc.inputs.forEach(function (inp) { n++; inp.onmidimessage = function (msg) { var s = msg.data[0] & 0xf0, m = msg.data[1], v = msg.data[2]; if (s === 0x90 && v > 0) tocar(m); else if (s === 0x80 || (s === 0x90 && v === 0)) soltar(m); }; });
        C.aviso(n ? n + ' entrada(s) MIDI conectada(s).' : 'Nenhum teclado MIDI encontrado.');
      }).catch(function () { C.aviso('O acesso ao MIDI foi negado.'); });
    } });
    alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selNotacao(pintar), C.selTimbre(), midiBtn]));
    alvo.appendChild(box); alvo.appendChild(acordeTxt); alvo.appendChild(info);
    pintar();
  };

  // ------------------------------------------------------------------
  // Transpositor — usa o MOTOR DAS CIFRAS (uma transposição só na casa)
  // ------------------------------------------------------------------
  F.transpositor = function (alvo, st) {
    var ta = el('textarea', { id: 'lab-tr-txt', rows: 5, class: 'lab-textarea', placeholder: 'Cole acordes ou uma cifra: C  Am  F  G7   ou   Dm7 G7(9) C7M' });
    ta.value = C.lerLocal('transpositor', 'C  Am7  Dm7  G7(9)\nC7M  E7(b9)  Am  A7  Dm  G7  C');
    var de = el('select', { id: 'lab-tr-de' }), para = el('select', { id: 'lab-tr-para' });
    C.TONICAS.forEach(function (n) { de.appendChild(el('option', { value: N.slug(n), txt: N.nomeDuplo(n) })); para.appendChild(el('option', { value: N.slug(n), txt: N.nomeDuplo(n) })); });
    de.value = 'do'; para.value = 're';
    var saida = el('pre', { class: 'lab-saida', 'aria-live': 'polite' });
    var capo = el('p', { class: 'lab-dica' });
    function fazer() {
      var M = w.MusiqueMotor;
      if (!M || !M.acorde) { saida.textContent = 'Carregando o motor de transposição…'; return; }
      C.guardar('transpositor', ta.value);
      var a = N.deSlug(de.value), b = N.deSlug(para.value);
      var semi = N.mod(N.pc(b) - N.pc(a), 12);
      if (semi > 6) semi -= 12;
      var bemol = M.nota.usarBemol({ pc: N.pc(b), menor: false }, 'auto') || b.alt < 0;
      var linhas = ta.value.split('\n').map(function (l) {
        return l.split(/(\s+)/).map(function (tok) { if (!tok.trim()) return tok; var x = M.acorde.transporTexto(tok, semi, { bemol: bemol }); return x; }).join('');
      });
      saida.textContent = linhas.join('\n');
      capo.textContent = 'De ' + rot(a) + ' para ' + rot(b) + ': ' + (semi === 0 ? 'mesmo tom.' : Math.abs(semi) + ' semitom(ns) ' + (semi > 0 ? 'acima' : 'abaixo') + '.') + (semi < 0 ? ' No violão, dá para manter as formas com capotraste na casa ' + (12 + semi) + ' do tom original (ou transpor as formas).' : semi > 0 ? ' No violão: capotraste na casa ' + semi + ' com as formas do tom original.' : '');
    }
    [ta, de, para].forEach(function (x) { x.addEventListener('input', fazer); x.addEventListener('change', fazer); });
    alvo.appendChild(el('div', { class: 'lab-controles' }, [el('div', { class: 'lab-campo' }, [el('label', { for: 'lab-tr-de', txt: 'Tom de origem' }), de]), el('div', { class: 'lab-campo' }, [el('label', { for: 'lab-tr-para', txt: 'Tom de destino' }), para])]));
    alvo.appendChild(el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'lab-tr-txt', txt: 'Acordes' }), ta]));
    alvo.appendChild(el('h3', { txt: 'Resultado' })); alvo.appendChild(saida); alvo.appendChild(capo);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'A grafia segue o tom de destino (em mi♭ maior, escreve-se B♭, não A#). É o mesmo motor que transpõe as cifras do Musique.' }));
    C.carregarScript('/music/motor-cifras.js').then(fazer).catch(function (e) { saida.textContent = e.message; });
  };

  // ------------------------------------------------------------------
  // BPM por toque
  // ------------------------------------------------------------------
  F.bpm = function (alvo) {
    var toques = [];
    var grande = el('div', { class: 'lab-grande', 'aria-live': 'polite', txt: '—' });
    var det = el('p', { class: 'lab-info', txt: 'Toque no botão (ou aperte T ou Espaço) no ritmo da música, pelo menos 4 vezes.' });
    function toque() {
      var t = performance.now();
      if (toques.length && t - toques[toques.length - 1] > 2000) toques = [];
      toques.push(t);
      var r = R.bpmDeToques(toques);
      if (r) { grande.textContent = Math.round(r.bpm) + ' BPM'; det.textContent = r.toques + ' toques · intervalo ' + Math.round(r.intervalo_ms) + ' ms · oscilação ±' + r.desvio_ms + ' ms' + (r.desvio_ms > 40 ? ' (irregular: continue tocando para estabilizar)' : ''); }
      C.Som.bateria.clique(C.Som.audio().currentTime + 0.001, 0.6, true);
    }
    var b = el('button', { type: 'button', class: 'lab-botao-toque', txt: 'Toque aqui', onclick: toque });
    d.addEventListener('keydown', function (e) { if (e.target && /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) && e.target !== b) return; if (e.key === 't' || e.key === 'T' || e.key === ' ') { e.preventDefault(); toque(); } });
    alvo.appendChild(grande); alvo.appendChild(b); alvo.appendChild(det);
    alvo.appendChild(el('button', { type: 'button', class: 'btn sec', txt: 'Zerar', onclick: function () { toques = []; grande.textContent = '—'; } }));
    alvo.appendChild(el('p', {}, [el('a', { href: '/music/ferramentas', txt: 'Abrir o metrônomo →' }), ' · ', el('a', { href: '/music/criar/bpm-ms', txt: 'Converter para milissegundos →' })]));
  };

  // ------------------------------------------------------------------
  // BPM ↔ milissegundos
  // ------------------------------------------------------------------
  F['bpm-ms'] = function (alvo, st) {
    var bpm = st.bpm || 120;
    var tab = el('div');
    function render() {
      var linhas = [];
      R.FIGURAS.slice(0, 6).forEach(function (f) {
        [['', {}], [' pontuada', { pontos: 1 }], [' (tercina)', { quialtera: [3, 2] }]].forEach(function (v) {
          var ms = R.ms(bpm, f.id, v[1]);
          linhas.push('<tr><th scope="row">' + D.esc(f.nome + v[0]) + '</th><td>' + ms.toFixed(1).replace('.', ',') + ' ms</td><td>' + (1000 / ms).toFixed(2).replace('.', ',') + ' Hz</td></tr>');
        });
      });
      tab.innerHTML = '<div class="lab-tabela-rolagem"><table class="lab-tabela"><caption>A ' + bpm + ' BPM (o BPM conta semínimas)</caption><thead><tr><th scope="col">Figura</th><th scope="col">Duração</th><th scope="col">Frequência (LFO)</th></tr></thead><tbody>' + linhas.join('') + '</tbody></table></div>';
    }
    alvo.appendChild(el('div', { class: 'lab-controles' }, [campoNum('lab-bpm', 'BPM', bpm, 20, 400, function (v) { bpm = v; render(); }, 0.1)]));
    alvo.appendChild(tab);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Delay em colcheia pontuada (bem comum na guitarra) = 3/4 da semínima. Fórmula: 60.000 ÷ BPM = ms da semínima.' }));
    render();
  };

  // ------------------------------------------------------------------
  // Fazedor de batidas (16 passos)
  // ------------------------------------------------------------------
  var PADROES = {
    'rock básico': { bumbo: [0, 8, 10], caixa: [4, 12], chimbal: [0, 2, 4, 6, 8, 10, 12, 14], palma: [] },
    'pop': { bumbo: [0, 6, 8], caixa: [4, 12], chimbal: [0, 2, 4, 6, 8, 10, 12, 14], palma: [4, 12] },
    'funk (semicolcheias)': { bumbo: [0, 3, 10], caixa: [4, 12, 7, 15], chimbal: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], palma: [] },
    'reggae (one drop)': { bumbo: [8], caixa: [8], chimbal: [2, 6, 10, 14], palma: [] },
    'baião (referência)': { bumbo: [0, 3, 8], caixa: [], chimbal: [0, 2, 4, 6, 8, 10, 12, 14], palma: [4, 12] },
    'shuffle (use swing)': { bumbo: [0, 8], caixa: [4, 12], chimbal: [0, 2, 4, 6, 8, 10, 12, 14], palma: [] },
  };
  var FAIXAS = [['bumbo', 'Bumbo'], ['caixa', 'Caixa'], ['chimbal', 'Chimbal'], ['palma', 'Palma']];

  F.batidas = function (alvo, st) {
    var grade = C.lerLocal('batidas', null) || { bumbo: [], caixa: [], chimbal: [], palma: [] };
    var bpm = st.bpm || 100, swing = 0, ag = null, atual = -1;
    var tabela = el('div', { class: 'lab-grade-passos', role: 'grid', 'aria-label': 'Grade de 16 passos' });
    function tem(f, i) { return grade[f].indexOf(i) >= 0; }
    function pintar() {
      C.limpar(tabela);
      FAIXAS.forEach(function (fx) {
        var linha = el('div', { class: 'lab-linha-passos', role: 'row' }, [el('span', { class: 'lab-rot-faixa', role: 'rowheader', txt: fx[1] })]);
        for (var i = 0; i < 16; i++) (function (i) {
          linha.appendChild(el('button', { type: 'button', role: 'gridcell', class: 'lab-passo' + (i % 4 === 0 ? ' tempo' : '') + (i === atual ? ' agora' : ''), 'aria-pressed': tem(fx[0], i) ? 'true' : 'false', 'aria-label': fx[1] + ', passo ' + (i + 1),
            onclick: function () { var k = grade[fx[0]].indexOf(i); if (k >= 0) grade[fx[0]].splice(k, 1); else { grade[fx[0]].push(i); C.Som.bateria[fx[0]](C.Som.audio().currentTime + 0.01, 0.8); } C.guardar('batidas', grade); pintar(); } }));
        })(i);
        tabela.appendChild(linha);
      });
    }
    function tocar() {
      if (ag) { ag.parar(); ag = null; botao.textContent = '▶ Tocar'; return; }
      ag = C.Som.agendador({ bpm: bpm, porTempo: 4, passos: 16, swing: swing,
        aoPasso: function (i, q) { FAIXAS.forEach(function (fx) { if (tem(fx[0], i)) C.Som.bateria[fx[0]](q, i % 4 === 0 ? 1 : 0.75); }); },
        visual: function (i) { atual = i; C.$$('.lab-passo', tabela).forEach(function (b, k) { b.classList.toggle('agora', k % 16 === i); }); } });
      botao.textContent = '■ Parar';
    }
    C.Som.aoParar = function () { ag = null; botao.textContent = '▶ Tocar'; };
    var botao = el('button', { type: 'button', class: 'btn', txt: '▶ Tocar', onclick: tocar });
    var sw = el('input', { id: 'lab-swing', type: 'range', min: 0, max: 66, value: 0, oninput: function () { swing = Number(sw.value) / 100; lsw.textContent = sw.value === '0' ? 'reto' : sw.value + '%'; if (ag) ag.swing(swing); } });
    var lsw = el('span', { txt: 'reto' });
    alvo.appendChild(el('div', { class: 'lab-controles' }, [botao, campoNum('lab-bpm', 'BPM', bpm, 40, 240, function (v) { bpm = v; if (ag) ag.bpm(v); }),
      el('div', { class: 'lab-campo' }, [el('label', { for: 'lab-swing', txt: 'Swing' }), sw, lsw]),
      C.select('lab-padrao', 'Padrão pronto', [{ valor: '', rotulo: '— escolher —' }].concat(Object.keys(PADROES).map(function (k) { return { valor: k, rotulo: k }; })), '', function (v) { if (!v) return; grade = JSON.parse(JSON.stringify(PADROES[v])); C.guardar('batidas', grade); pintar(); }),
      el('button', { type: 'button', class: 'btn sec', txt: 'Limpar', onclick: function () { grade = { bumbo: [], caixa: [], chimbal: [], palma: [] }; C.guardar('batidas', grade); pintar(); } }),
      el('button', { type: 'button', class: 'btn sec', txt: 'Exportar MIDI', onclick: function () {
        var MAP = { bumbo: 36, caixa: 38, chimbal: 42, palma: 39 }, ev = [];
        for (var rep = 0; rep < 4; rep++) FAIXAS.forEach(function (fx) { grade[fx[0]].forEach(function (i) { ev.push({ t: rep * 16 + i, dur: 1, midi: MAP[fx[0]], canal: 9 }); }); });
        exportar(st, 'musique-batida.mid', 'audio/midi', midiArquivo(ev, bpm));
      } })]));
    alvo.appendChild(tabela);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Cada linha é um som; cada coluna, uma semicolcheia (4 por tempo). Os padrões prontos são referências simplificadas de cada estilo, não transcrições. O MIDI exportado usa o canal 10 (percussão).' }));
    pintar();
  };

  // ------------------------------------------------------------------
  // Sequenciador melódico (dentro da escala)
  // ------------------------------------------------------------------
  F.sequenciador = function (alvo, st) {
    st.escala = st.escala || 'pentatonica-maior';
    var passos = C.lerLocal('seq', null) || {};   // { passo: índice da linha }
    var bpm = st.bpm || 110, ag = null;
    var grade = el('div', { class: 'lab-grade-passos lab-seq', role: 'grid', 'aria-label': 'Sequenciador' });
    function linhas() {
      var t4 = naOitava(tonicaDe(st), 4);
      var ns = E.notas(t4, st.escala) || [];
      var sup = E.notas(N.comOitava(t4, t4.oitava + 1), st.escala) || [];
      return ns.concat(sup).reverse();
    }
    function pintar() {
      C.gravarUrl(st); C.limpar(grade);
      linhas().forEach(function (n, li) {
        var linha = el('div', { class: 'lab-linha-passos', role: 'row' }, [el('span', { class: 'lab-rot-faixa', role: 'rowheader', txt: rot(n) + n.oitava })]);
        for (var i = 0; i < 16; i++) (function (i) {
          var on = passos[i] === li;
          linha.appendChild(el('button', { type: 'button', role: 'gridcell', class: 'lab-passo' + (i % 4 === 0 ? ' tempo' : ''), 'aria-pressed': on ? 'true' : 'false', 'aria-label': rot(n) + ', passo ' + (i + 1),
            onclick: function () { if (passos[i] === li) delete passos[i]; else { passos[i] = li; C.Som.tocar([N.midi(n)], { dur: 0.3 }); } C.guardar('seq', passos); pintar(); } }));
        })(i);
        grade.appendChild(linha);
      });
    }
    function tocar() {
      if (ag) { ag.parar(); ag = null; botao.textContent = '▶ Tocar'; return; }
      var ls = linhas();
      ag = C.Som.agendador({ bpm: bpm, porTempo: 4, passos: 16, aoPasso: function (i, q) { if (passos[i] != null && ls[passos[i]]) C.Som.voz(C.Som.FREQ(N.midi(ls[passos[i]])), q, 60 / bpm / 4 * 0.9, { timbre: C.Som.timbre || 'pluck', vel: 0.25 }); },
        visual: function (i) { C.$$('.lab-linha-passos', grade).forEach(function (row) { C.$$('.lab-passo', row).forEach(function (b, k) { b.classList.toggle('agora', k === i); }); }); } });
      botao.textContent = '■ Parar';
    }
    C.Som.aoParar = function () { ag = null; botao.textContent = '▶ Tocar'; };
    var botao = el('button', { type: 'button', class: 'btn', txt: '▶ Tocar', onclick: tocar });
    alvo.appendChild(el('div', { class: 'lab-controles' }, [botao, C.selTonica(st.tonica, function (v) { st.tonica = v; pintar(); }), C.selEscala(st.escala, function (v) { st.escala = v; passos = {}; pintar(); }), C.selTimbre(),
      campoNum('lab-bpm', 'BPM', bpm, 40, 240, function (v) { bpm = v; if (ag) ag.bpm(v); }),
      el('button', { type: 'button', class: 'btn sec', txt: 'Ideia aleatória', onclick: function () { var r = X.prng(Date.now()); var n = linhas().length; passos = {}; var at = Math.floor(n / 2); for (var i = 0; i < 16; i++) { if (r() < 0.7) { at = Math.max(0, Math.min(n - 1, at + Math.round((r() - 0.5) * 3))); passos[i] = at; } } C.guardar('seq', passos); pintar(); } }),
      el('button', { type: 'button', class: 'btn sec', txt: 'Limpar', onclick: function () { passos = {}; C.guardar('seq', passos); pintar(); } }),
      el('button', { type: 'button', class: 'btn sec', txt: 'Exportar MIDI', onclick: function () { var ls = linhas(); var ev = []; Object.keys(passos).forEach(function (i) { ev.push({ t: Number(i), dur: 1, midi: N.midi(ls[passos[i]]) }); }); exportar(st, 'musique-melodia.mid', 'audio/midi', midiArquivo(ev, bpm)); } })]));
    alvo.appendChild(grade);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Uma nota por passo, sempre dentro da escala: em pentatônica, quase nada soa "errado" — um bom lugar para começar a compor.' }));
    pintar();
  };

  // ------------------------------------------------------------------
  // Laboratório de progressões
  // ------------------------------------------------------------------
  F.progressoes = function (alvo, st) {
    var graus = [1, 5, 6, 4], tetrades = false, bpm = 80, historico = C.lerLocal('progressoes-hist', []);
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var t = tonicaDe(st), modo = st.modo || 'maior';
      var campo = T.campo(t, modo, { tetrades: tetrades });
      alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }),
        C.select('lab-modo', 'Modo', [{ valor: 'maior', rotulo: 'maior' }, { valor: 'menor', rotulo: 'menor' }], modo, function (v) { st.modo = v; render(); }),
        el('label', { class: 'lab-check' }, [el('input', { type: 'checkbox', checked: tetrades ? true : null, onchange: function (e) { tetrades = e.target.checked; render(); } }), ' com sétimas']),
        C.select('lab-pronta', 'Progressão pronta', [{ valor: '', rotulo: '— escolher —' }].concat(T.PROGRESSOES.filter(function (p) { return (p.modo || 'maior') === modo; }).map(function (p) { return { valor: p.id, rotulo: p.nome + ' (' + p.genero + ')' }; })), '', function (v) { var p = T.PROGRESSOES.filter(function (x) { return x.id === v; })[0]; if (p) { graus = p.graus.slice(); render(); } }),
        campoNum('lab-bpm', 'BPM', bpm, 30, 200, function (v) { bpm = v; }), C.selTimbre()]));
      alvo.appendChild(el('p', { txt: 'Toque nos graus para montar a sequência:' }));
      alvo.appendChild(el('div', { class: 'lab-graus' }, campo.map(function (g) {
        return el('button', { type: 'button', class: 'lab-grau lab-func-' + g.funcao, onclick: function () { graus.push(g.grau); if (graus.length > 16) graus.shift(); C.Som.tocar(A.notas(naOitava(g.fundamental, 3), g.acorde).map(N.midi), { modo: 'harmonico', dur: 0.9 }); render(); } },
          [el('strong', { txt: g.romano }), el('span', { txt: g.simbolo }), el('small', { txt: g.funcao })]);
      })));
      var acs = T.realizar(t, modo, graus, { tetrades: tetrades });
      var vozes = []; var ant = null;
      acs.forEach(function (g) { var c = A.conduzir(ant, g.fundamental, g.acorde); vozes.push(c ? c.notas : A.notas(naOitava(g.fundamental, 3), g.acorde)); ant = vozes[vozes.length - 1]; });
      var seqTxt = acs.map(function (g) { return g.simbolo; }).join(' → ');
      alvo.appendChild(el('div', { class: 'lab-resumo' }, [el('h2', { txt: seqTxt || 'Escolha os graus' }),
        el('p', { txt: acs.map(function (g) { return g.romano + ' (' + g.funcao + ')'; }).join(' – ') }),
        el('div', { class: 'lab-acoes' }, [
          el('button', { type: 'button', class: 'btn', txt: '▶ Ouvir (condução de vozes)', onclick: function () { var a = C.Som.audio(), dur = 60 / bpm * 2; vozes.forEach(function (v, i) { v.forEach(function (n) { C.Som.voz(C.Som.FREQ(N.midi(n)), a.currentTime + 0.05 + i * dur, dur * 0.95, { vel: 0.14 }); }); C.Som.voz(C.Som.FREQ(N.midi(N.comOitava(acs[i].fundamental, 2))), a.currentTime + 0.05 + i * dur, dur * 0.95, { vel: 0.18 }); }); historico.unshift(seqTxt); historico = historico.filter(function (x, k) { return historico.indexOf(x) === k; }).slice(0, 8); C.guardar('progressoes-hist', historico); } }),
          el('button', { type: 'button', class: 'btn sec', txt: 'Desfazer', onclick: function () { graus.pop(); render(); } }),
          el('button', { type: 'button', class: 'btn sec', txt: 'Limpar', onclick: function () { graus = []; render(); } }),
          el('button', { type: 'button', class: 'btn sec', txt: 'Exportar ChordPro', onclick: function () {
            var cp = '{title: Progressão em ' + T.nome(t, modo) + '}\n{key: ' + N.nome(t, { oitava: false }) + (modo === 'menor' ? 'm' : '') + '}\n'
              + '{comment: ' + acs.map(function (g) { return g.romano; }).join(' – ') + '}\n' + acs.map(function (g) { return '[' + g.simbolo + ']'; }).join(' ') + '\n';
            exportar(st, 'progressao-' + N.slug(t) + '.cho', 'text/plain', cp);
          } }),
          el('a', { href: '/music/criar/transpositor', txt: 'Transpor →' })])]));
      alvo.appendChild(el('ul', { class: 'lab-lista-pos' }, vozes.map(function (v, i) { return el('li', { txt: acs[i].simbolo + ': ' + v.map(function (n) { return rot(n) + n.oitava; }).join(' ') }); })));
      if (historico.length) alvo.appendChild(el('details', { class: 'lab-det' }, [el('summary', { txt: 'Tocadas recentemente' }), el('ul', {}, historico.map(function (h) { return el('li', { txt: h }); }))]));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'A condução de vozes escolhe, para cada acorde, a inversão que menos move a mão desde o anterior — é como um pianista toca, e soa mais ligado.' }));
    }
    render();
  };

  // ------------------------------------------------------------------
  // Arpejador
  // ------------------------------------------------------------------
  F.arpejador = function (alvo, st) {
    st.acorde = st.acorde || 'm7';
    var padrao = 'sobe', oitavas = 2, bpm = 110, ag = null;
    function notasArp() {
      var base = A.notas(naOitava(tonicaDe(st), 3), st.acorde) || [];
      var ms = [];
      for (var o = 0; o < oitavas; o++) base.forEach(function (n) { ms.push(N.midi(n) + 12 * o); });
      ms.push(ms[0] + 12 * oitavas);
      if (padrao === 'desce') ms.reverse();
      else if (padrao === 'sobe-desce') ms = ms.concat(ms.slice(1, -1).reverse());
      else if (padrao === 'alternado') { var out = []; for (var i = 0; i < ms.length; i++) out.push(i % 2 ? ms[ms.length - 1 - (i >> 1)] : ms[i >> 1]); ms = out; }
      return ms;
    }
    function tocar() {
      if (ag) { ag.parar(); ag = null; botao.textContent = '▶ Tocar'; return; }
      var ms = notasArp();
      ag = C.Som.agendador({ bpm: bpm, porTempo: 4, passos: ms.length, aoPasso: function (i, q) { C.Som.voz(C.Som.FREQ(ms[i]), q, 60 / bpm / 4 * 1.6, { timbre: C.Som.timbre || 'pluck', vel: 0.22 }); } });
      botao.textContent = '■ Parar';
    }
    C.Som.aoParar = function () { ag = null; botao.textContent = '▶ Tocar'; };
    var botao = el('button', { type: 'button', class: 'btn', txt: '▶ Tocar', onclick: tocar });
    function reiniciar() { if (ag) { ag.parar(); ag = null; tocar(); } info.textContent = notasArp().map(function (m) { return rot(N.deMidi(m)); }).join(' '); C.gravarUrl(st); }
    var info = el('p', { class: 'lab-info', 'aria-live': 'polite' });
    alvo.appendChild(el('div', { class: 'lab-controles' }, [botao, C.selTonica(st.tonica, function (v) { st.tonica = v; reiniciar(); }), C.selAcorde(st.acorde, function (v) { st.acorde = v; reiniciar(); }), C.selTimbre(),
      C.select('lab-pad', 'Padrão', [{ valor: 'sobe', rotulo: 'subindo' }, { valor: 'desce', rotulo: 'descendo' }, { valor: 'sobe-desce', rotulo: 'sobe e desce' }, { valor: 'alternado', rotulo: 'alternado (fora para dentro)' }], padrao, function (v) { padrao = v; reiniciar(); }),
      C.select('lab-oit', 'Oitavas', [{ valor: 1, rotulo: '1' }, { valor: 2, rotulo: '2' }, { valor: 3, rotulo: '3' }], oitavas, function (v) { oitavas = Number(v); reiniciar(); }),
      campoNum('lab-bpm', 'BPM', bpm, 40, 220, function (v) { bpm = v; if (ag) ag.bpm(v); })]));
    alvo.appendChild(info); reiniciar();
  };

  // ------------------------------------------------------------------
  // Polirritmos e rudimentos
  // ------------------------------------------------------------------
  F.polirritmos = function (alvo) {
    var a = 3, b = 2, bpm = 70, ag = null, rud = null;
    var vis = el('div', { class: 'lab-poli', 'aria-hidden': 'true' });
    function desenhar(ativo) {
      var p = R.polirritmo(a, b); C.limpar(vis);
      [['a', p.a, a], ['b', p.b, b]].forEach(function (v) {
        var row = el('div', { class: 'lab-poli-linha' }, [el('span', { txt: v[2] })]);
        v[1].forEach(function (on, i) { row.appendChild(el('i', { class: (on ? 'on' : '') + (i === ativo ? ' agora' : '') })); });
        vis.appendChild(row);
      });
    }
    function tocar() {
      if (ag) { ag.parar(); ag = null; botao.textContent = '▶ Tocar'; return; }
      var p = R.polirritmo(a, b);
      ag = C.Som.agendador({ bpm: bpm, porTempo: p.passos / b, passos: p.passos,
        aoPasso: function (i, q) { if (p.a[i]) C.Som.bateria.clique(q, 0.8, true); if (p.b[i]) C.Som.bateria.bumbo(q, 0.7); },
        visual: desenhar });
      botao.textContent = '■ Parar';
    }
    C.Som.aoParar = function () { ag = null; botao.textContent = '▶ Tocar'; desenhar(-1); };
    var botao = el('button', { type: 'button', class: 'btn', txt: '▶ Tocar', onclick: tocar });
    function num(id, r, v, f) { return campoNum(id, r, v, 2, 9, function (x) { f(x); desenhar(-1); if (ag) { ag.parar(); ag = null; tocar(); } }); }
    alvo.appendChild(el('div', { class: 'lab-controles' }, [botao, num('lab-pa', 'Voz aguda (clique)', a, function (x) { a = x; }), num('lab-pb', 'Voz grave (bumbo)', b, function (x) { b = x; }), campoNum('lab-bpm', 'BPM (da voz grave)', bpm, 30, 160, function (v) { bpm = v; if (ag) ag.bpm(v); })]));
    alvo.appendChild(vis); desenhar(-1);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'As duas vozes começam juntas e só voltam a coincidir no início do ciclo (mmc dos dois números). Bata a voz grave com o pé e a aguda com a mão.' }));
    alvo.appendChild(el('h2', { txt: 'Rudimentos' }));
    var rudInfo = el('p', { class: 'lab-grande-rud', 'aria-live': 'polite' });
    alvo.appendChild(el('div', { class: 'lab-chips-bot' }, R.RUDIMENTOS.map(function (r) {
      return el('button', { type: 'button', class: 'btn sec', txt: r.nome, onclick: function () {
        if (rud) rud.parar();
        var maos = r.padrao.split(' ');
        rudInfo.textContent = r.nome + ': ' + r.padrao;
        rud = C.Som.agendador({ bpm: 80, porTempo: 4, passos: maos.length, aoPasso: function (i, q) { var ac = (r.acentos || []).indexOf(i) >= 0; if (maos[i] === 'D') C.Som.bateria.caixa(q, ac ? 1 : 0.55); else C.Som.bateria.caixa(q, ac ? 0.95 : 0.45); },
          visual: function (i) { if (i >= 0) rudInfo.innerHTML = D.esc(r.nome) + ': ' + maos.map(function (m, k) { return k === i ? '<mark>' + m + '</mark>' : m; }).join(' '); } });
      } });
    })));
    alvo.appendChild(rudInfo);
  };

  // ------------------------------------------------------------------
  // Batimentos e ruído (volume seguro)
  // ------------------------------------------------------------------
  F.batimentos = function (alvo) {
    var f = 440, delta = 2, nos = [], ruidoNo = null;
    function parar() { nos.forEach(function (o) { try { o.stop(); } catch (_) { /* ok */ } }); nos = []; if (ruidoNo) { try { ruidoNo.stop(); } catch (_) { /* ok */ } ruidoNo = null; } }
    C.Som.aoParar = function () { nos = []; ruidoNo = null; };
    function tocar() {
      parar(); var a = C.Som.audio(); var g = a.createGain(); g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.08, a.currentTime + 0.1); g.connect(C.Som.saida());
      [f, f + delta].forEach(function (x) { var o = a.createOscillator(); o.frequency.value = x; o.connect(g); o.start(); C.Som.registrar(o); nos.push(o); });
      info.textContent = f + ' Hz e ' + (f + delta) + ' Hz → ' + delta + ' batimento(s) por segundo.';
    }
    function ruido(tipo) {
      parar(); var a = C.Som.audio(); var n = C.Som.ruido(); n.loop = true; var g = a.createGain(); g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.05, a.currentTime + 0.2);
      if (tipo === 'rosa') { var fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1200; n.connect(fl); fl.connect(g); } else n.connect(g);
      g.connect(C.Som.saida()); n.start(); C.Som.registrar(n); ruidoNo = n;
      info.textContent = 'Ruído ' + tipo + ' (sem altura definida: todas as frequências ao mesmo tempo).';
    }
    var info = el('p', { class: 'lab-info', 'aria-live': 'polite', txt: 'Volume inicial baixo. Use o botão "Parar o som" ou Esc a qualquer momento.' });
    alvo.appendChild(el('p', { class: 'lab-nota-convencao', txt: '⚠️ Tons contínuos cansam o ouvido. Mantenha o volume baixo e faça pausas.' }));
    alvo.appendChild(el('div', { class: 'lab-controles' }, [campoNum('lab-f', 'Frequência base (Hz)', f, 100, 1000, function (v) { f = v; if (nos.length) tocar(); }),
      campoNum('lab-d', 'Diferença (Hz)', delta, 0, 12, function (v) { delta = v; if (nos.length) tocar(); }, 0.5),
      el('button', { type: 'button', class: 'btn', txt: '▶ Batimentos', onclick: tocar }), el('button', { type: 'button', class: 'btn sec', txt: 'Ruído branco', onclick: function () { ruido('branco'); } }),
      el('button', { type: 'button', class: 'btn sec', txt: 'Ruído rosa (aprox.)', onclick: function () { ruido('rosa'); } }), el('button', { type: 'button', class: 'btn sec', txt: '■ Parar', onclick: function () { parar(); C.Som.parar(); } })]));
    alvo.appendChild(info);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Duas notas quase iguais "pulsam" na diferença entre elas: é assim que se afina de ouvido — o batimento some quando as frequências se igualam.' }));
  };
})(window, document);
