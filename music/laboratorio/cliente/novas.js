// =====================================================================
// Musique · Laboratório — CLIENTE · ferramentas da 2ª entrega:
// afinador por corda, extensão vocal, metrônomo progressivo, mini
// máquina, motivos, série de doze sons, os 7 modos lado a lado, teclado
// isomórfico, xilofone e gerador de bumbo.
//
// Microfone: só com o gesto da pessoa, processado AQUI (nada vai ao
// servidor) e desligado ao parar ou sair da página.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas;
  var N = L.notas, I = L.intervalos, E = L.escalas, A = L.acordes, T = L.tonalidades, D = L.desenho, INS = L.instrumentos, M = L.motivos;
  var el = C.el;
  function rot(n, oit) { return C.nomeNota(n, oit); }
  function tonicaDe(st) { return N.deSlug(st.tonica) || N.ler('C'); }
  function naOitava(t, o) { return N.comOitava(t, t.oitava != null ? t.oitava : (t.li >= 4 ? (o || 4) - 1 : (o || 4))); }
  function numero(id, rotulo, valor, min, max, aoMudar, passo) {
    var i = el('input', { id: id, type: 'number', min: min, max: max, step: passo || 1, value: valor, oninput: function () { var v = Number(i.value); if (v >= min && v <= max) aoMudar(v); } });
    return el('div', { class: 'lab-campo' }, [el('label', { for: id, txt: rotulo }), i]);
  }

  // ------------------------------------------------------------------
  // Microfone: abre sob demanda, mede altura monofônica, fecha sempre.
  // ------------------------------------------------------------------
  function microfone(aoMedir) {
    var stream = null, an = null, buf = null, raf = null, fonte = null;
    return {
      ligar: function () {
        if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return Promise.reject(new Error('Este navegador não dá acesso ao microfone.'));
        return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) {
          stream = s; var a = C.Som.audio();
          fonte = a.createMediaStreamSource(s); an = a.createAnalyser(); an.fftSize = 4096; fonte.connect(an); buf = new Float32Array(an.fftSize);
          var laco = function () {
            an.getFloatTimeDomainData(buf);
            var r = w.MusiqueAudio && w.MusiqueAudio.detectarHz ? w.MusiqueAudio.detectarHz(buf, a.sampleRate) : { hz: -1 };
            aoMedir(r);
            raf = requestAnimationFrame(laco);
          };
          laco();
        });
      },
      desligar: function () {
        cancelAnimationFrame(raf);
        try { if (fonte) fonte.disconnect(); } catch (_) { /* ok */ }
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        stream = null;
      },
      ligado: function () { return !!stream; },
    };
  }
  function medidor(cents) {
    var box = el('div', { class: 'lab-agulha', role: 'meter', 'aria-valuemin': '-50', 'aria-valuemax': '50', 'aria-valuenow': String(cents), 'aria-label': 'Desvio em cents' });
    box.appendChild(el('span', { class: 'lab-agulha-ok' }));
    box.appendChild(el('span', { class: 'lab-agulha-ponta', style: 'left:' + (50 + Math.max(-50, Math.min(50, cents))) + '%' }));
    return box;
  }

  // ------------------------------------------------------------------
  // Afinador por corda
  // ------------------------------------------------------------------
  F['afinador-cordas'] = function (alvo, st) {
    var inst = st.instrumento && INS.CORDAS[st.instrumento] ? st.instrumento : 'violao', afin = 'padrao';
    var mic = null, suave = [];
    var painel = el('div', { class: 'lab-afinador', 'aria-live': 'polite' });
    function render() {
      C.limpar(alvo);
      var ins = INS.instrumento(inst), af = INS.afinacao(inst, afin);
      alvo.appendChild(el('div', { class: 'lab-controles' }, [
        C.select('lab-inst', 'Instrumento', Object.keys(INS.CORDAS).filter(function (k) { return k !== 'guitarra'; }).map(function (k) { return { valor: k, rotulo: INS.CORDAS[k].nome }; }), inst, function (v) { inst = v; afin = 'padrao'; render(); }),
        C.select('lab-afin', 'Afinação', Object.keys(ins.afinacoes).map(function (k) { return { valor: k, rotulo: ins.afinacoes[k].nome }; }), afin, function (v) { afin = v; render(); }),
        el('button', { type: 'button', class: 'btn', txt: mic && mic.ligado() ? 'Desligar o microfone' : 'Ligar o microfone', onclick: alternar })]));
      alvo.appendChild(el('div', { class: 'lab-cordas' }, af.notas.map(function (n, i) {
        return el('button', { type: 'button', class: 'lab-corda', 'data-i': i, onclick: function () { C.Som.tocar([af.midi[i]], { modo: 'dedilhado', dur: 2.5 }); } },
          [el('strong', { txt: (af.notas.length - i) + 'ª' }), ' ' + rot(n) + n.oitava, el('small', { txt: ' ouvir' })]);
      }).reverse()));
      alvo.appendChild(painel);
      if (!mic || !mic.ligado()) C.limpar(painel).appendChild(el('p', { class: 'lab-dica', txt: 'Toque uma corda de cada vez, perto do microfone. Os botões tocam a nota de referência. O áudio não sai do seu aparelho.' }));
    }
    function alternar() {
      if (mic && mic.ligado()) { mic.desligar(); render(); return; }
      var af = INS.afinacao(inst, afin);
      mic = microfone(function (r) {
        if (!(r.hz > 0) || r.confianca < 0.85) return;
        suave.push(r.hz); if (suave.length > 5) suave.shift();
        var hz = suave.slice().sort(function (a, b) { return a - b; })[Math.floor(suave.length / 2)];
        var mais = 0, dist = Infinity;
        af.midi.forEach(function (m, i) { var dd = Math.abs(N.centsEntre(hz, N.freqDeMidi(m))); if (dd < dist) { dist = dd; mais = i; } });
        var cents = Math.round(N.centsEntre(hz, N.freqDeMidi(af.midi[mais])));
        C.limpar(painel);
        var n = af.notas[mais];
        painel.appendChild(el('p', { class: 'lab-grande', txt: (af.notas.length - mais) + 'ª corda · ' + rot(n) + n.oitava }));
        painel.appendChild(medidor(cents));
        painel.appendChild(el('p', { class: 'lab-info', txt: Math.abs(cents) <= 5 ? '✓ Afinada (' + (cents >= 0 ? '+' : '') + cents + ' cents)' : (cents > 0 ? 'Alta: afrouxe um pouco (+' + cents + ' cents)' : 'Baixa: aperte um pouco (' + cents + ' cents)') + (Math.abs(cents) > 50 ? ' — longe; confira se é esta corda' : '') }));
        C.$$('.lab-corda', alvo).forEach(function (b) { b.classList.toggle('on', Number(b.dataset.i) === mais); });
      });
      mic.ligar().then(render).catch(function (e) { C.aviso(e.name === 'NotAllowedError' ? 'O acesso ao microfone foi negado. As notas de referência continuam funcionando.' : e.message, 'erro'); });
    }
    w.addEventListener('pagehide', function () { if (mic) mic.desligar(); });
    render();
  };

  // ------------------------------------------------------------------
  // Extensão vocal
  // ------------------------------------------------------------------
  F['extensao-vocal'] = function (alvo) {
    var grave = null, agudo = null, mic = null;
    var status = el('p', { class: 'lab-info', 'aria-live': 'polite' });
    function medir(qual) {
      var amostras = [], inicio = Date.now();
      status.textContent = 'Cante e segure a nota ' + (qual === 'grave' ? 'mais GRAVE' : 'mais AGUDA') + ' que for confortável… (4 segundos)';
      mic = microfone(function (r) {
        if (r.hz > 0 && r.confianca > 0.85 && r.hz > 60 && r.hz < 1400) amostras.push(r.hz);
        if (Date.now() - inicio > 4000) {
          mic.desligar();
          if (amostras.length < 20) { status.textContent = 'Não consegui medir uma nota firme. Tente de novo, mais perto do microfone e sem fone.'; return; }
          var o = amostras.sort(function (a, b) { return a - b; }); var hz = o[Math.floor(o.length / 2)];
          var nota = N.deFreq(hz);
          if (qual === 'grave') grave = nota; else agudo = nota;
          render();
        }
      });
      mic.ligar().catch(function (e) { status.textContent = e.name === 'NotAllowedError' ? 'O acesso ao microfone foi negado.' : e.message; });
    }
    function render() {
      C.limpar(alvo);
      alvo.appendChild(el('p', { class: 'lab-nota-convencao', txt: '⚠️ Isto mede a sua EXTENSÃO hoje, com este microfone. Não é classificação de voz nem diagnóstico: classificar uma voz exige professor e leva em conta timbre, conforto e tessitura. Não force: pare se doer.' }));
      alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn', txt: 'Medir a nota mais grave', onclick: function () { medir('grave'); } }),
        el('button', { type: 'button', class: 'btn', txt: 'Medir a nota mais aguda', onclick: function () { medir('agudo'); } })]));
      alvo.appendChild(status);
      if (grave || agudo) {
        var linhas = [];
        if (grave) linhas.push('Mais grave: ' + rot(grave.nota) + grave.nota.oitava + ' (' + Math.round(N.freqDeMidi(grave.midi)) + ' Hz)');
        if (agudo) linhas.push('Mais aguda: ' + rot(agudo.nota) + agudo.nota.oitava + ' (' + Math.round(N.freqDeMidi(agudo.midi)) + ' Hz)');
        alvo.appendChild(el('div', { class: 'lab-resumo' }, linhas.map(function (l) { return el('p', { txt: l }); })));
        if (grave && agudo && agudo.midi > grave.midi) {
          var dd = {}; for (var m = grave.midi; m <= agudo.midi; m++) dd[m] = { rotulo: '', tipo: m === grave.midi || m === agudo.midi ? 'raiz' : 'nota' };
          alvo.appendChild(el('div', { class: 'lab-svgbox', html: D.piano({ de: Math.min(36, grave.midi - 2), ate: Math.max(84, agudo.midi + 2), destaques: dd, titulo: 'A sua extensão no teclado' }) }));
          var semi = agudo.midi - grave.midi;
          alvo.appendChild(el('p', { txt: semi + ' semitons (' + (semi / 12).toFixed(1).replace('.', ',') + ' oitavas).' }));
          var faixas = INS.VOZES.map(function (v) { var g = N.midi(v.grave), a = N.midi(v.agudo); var sob = Math.max(0, Math.min(a, agudo.midi) - Math.max(g, grave.midi)); return { v: v, p: Math.round(100 * sob / (a - g)) }; });
          alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Faixas de coral que a sua extensão cobre (apenas referência): ' + faixas.filter(function (x) { return x.p >= 60; }).map(function (x) { return x.v.nome + ' (' + x.p + '%)'; }).join(', ') + '.' }));
          alvo.appendChild(el('button', { type: 'button', class: 'lab-ouvir', 'data-midis': JSON.stringify([grave.midi, agudo.midi]), txt: '▶ Ouvir as duas pontas' }));
        }
      }
    }
    w.addEventListener('pagehide', function () { if (mic) mic.desligar(); });
    render();
  };

  // ------------------------------------------------------------------
  // Metrônomo que acelera
  // ------------------------------------------------------------------
  F['metronomo-progressivo'] = function (alvo) {
    var cfg = C.lerLocal('metro-prog', { de: 60, ate: 120, passo: 4, cada: 4, tempos: 4 });
    var ag = null, compasso = 0, bpm = cfg.de;
    var grande = el('p', { class: 'lab-grande', 'aria-live': 'polite', txt: cfg.de + ' BPM' });
    var info = el('p', { class: 'lab-info' });
    var pulso = el('div', { class: 'lab-pulsos', 'aria-hidden': 'true' });
    function tocar() {
      if (ag) { ag.parar(); ag = null; botao.textContent = '▶ Começar'; return; }
      C.guardar('metro-prog', cfg);
      bpm = cfg.de; compasso = 0; grande.textContent = bpm + ' BPM';
      C.limpar(pulso); for (var k = 0; k < cfg.tempos; k++) pulso.appendChild(el('i'));
      ag = C.Som.agendador({ bpm: bpm, porTempo: 1, passos: cfg.tempos,
        aoPasso: function (i, q) {
          if (i === 0 && q > 0) {
            compasso++;
            if (compasso > 1 && (compasso - 1) % cfg.cada === 0 && bpm < cfg.ate) { bpm = Math.min(cfg.ate, bpm + cfg.passo); ag.bpm(bpm); }
          }
          C.Som.bateria.clique(q, i === 0 ? 1 : 0.6, i === 0);
        },
        visual: function (i) { C.$$('i', pulso).forEach(function (x, k) { x.className = k === i ? (k === 0 ? 'forte' : 'on') : ''; }); if (i === 0) { grande.textContent = bpm + ' BPM'; info.textContent = 'Compasso ' + compasso + (bpm >= cfg.ate ? ' · meta atingida' : ' · próximo aumento em ' + (cfg.cada - ((compasso - 1) % cfg.cada)) + ' compasso(s)'); } } });
      botao.textContent = '■ Parar';
    }
    C.Som.aoParar = function () { ag = null; botao.textContent = '▶ Começar'; };
    var botao = el('button', { type: 'button', class: 'btn', txt: '▶ Começar', onclick: tocar });
    alvo.appendChild(el('div', { class: 'lab-controles' }, [
      numero('mp-de', 'BPM inicial', cfg.de, 30, 280, function (v) { cfg.de = v; }), numero('mp-ate', 'Meta (BPM)', cfg.ate, 30, 300, function (v) { cfg.ate = v; }),
      numero('mp-passo', 'Aumento (BPM)', cfg.passo, 1, 20, function (v) { cfg.passo = v; }), numero('mp-cada', 'A cada (compassos)', cfg.cada, 1, 32, function (v) { cfg.cada = v; }),
      numero('mp-tempos', 'Tempos por compasso', cfg.tempos, 2, 12, function (v) { cfg.tempos = v; }), botao]));
    alvo.appendChild(grande); alvo.appendChild(pulso); alvo.appendChild(info);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Estude o trecho difícil no andamento em que ele sai limpo e deixe o metrônomo subir aos poucos. Se errar, volte ao último andamento limpo.' }));
  };

  // ------------------------------------------------------------------
  // Mini máquina musical: bateria + baixo + acordes + melodia
  // ------------------------------------------------------------------
  var BAT = { 'pop': { bumbo: [0, 8, 10], caixa: [4, 12], chimbal: [0, 2, 4, 6, 8, 10, 12, 14] }, 'rock': { bumbo: [0, 6, 8], caixa: [4, 12], chimbal: [0, 2, 4, 6, 8, 10, 12, 14] },
    'bossa (referência)': { bumbo: [0, 6, 8, 14], caixa: [0, 3, 6, 10, 12], chimbal: [0, 2, 4, 6, 8, 10, 12, 14] }, 'balada': { bumbo: [0, 10], caixa: [8], chimbal: [0, 4, 8, 12] } };
  F['mini-maquina'] = function (alvo, st) {
    var cfg = C.lerLocal('mini-maquina', { tonica: 'do', prog: 'pop', bat: 'pop', bpm: 96, baixo: true, acordes: true, melodia: true, bateria: true, notas: {} });
    var ag = null, atual = -1;
    var grade = el('div', { class: 'lab-grade-passos', role: 'grid', 'aria-label': 'Melodia (pentatônica do tom)' });
    var cab = el('p', { class: 'lab-info', 'aria-live': 'polite' });
    function acordes() {
      var t = N.deSlug(cfg.tonica) || N.ler('C'); var p = T.PROGRESSOES.filter(function (x) { return x.id === cfg.prog; })[0] || T.PROGRESSOES[0];
      return T.realizar(t, p.modo || 'maior', p.graus.slice(0, 4), { tetrades: false });
    }
    function escalaMel() { var t = N.deSlug(cfg.tonica) || N.ler('C'); var p = T.PROGRESSOES.filter(function (x) { return x.id === cfg.prog; })[0]; var id = p && p.modo === 'menor' ? 'pentatonica-menor' : 'pentatonica-maior'; return E.notas(N.comOitava(t, 4), id).concat(E.notas(N.comOitava(t, 5), id)).reverse(); }
    function pintarGrade() {
      C.limpar(grade);
      escalaMel().forEach(function (n, li) {
        var linha = el('div', { class: 'lab-linha-passos', role: 'row' }, [el('span', { class: 'lab-rot-faixa', role: 'rowheader', txt: rot(n) + n.oitava })]);
        for (var i = 0; i < 16; i++) (function (i) {
          linha.appendChild(el('button', { type: 'button', role: 'gridcell', class: 'lab-passo' + (i % 4 === 0 ? ' tempo' : '') + (i === atual % 16 ? ' agora' : ''), 'aria-pressed': cfg.notas[i] === li ? 'true' : 'false', 'aria-label': rot(n) + ', passo ' + (i + 1),
            onclick: function () { if (cfg.notas[i] === li) delete cfg.notas[i]; else { cfg.notas[i] = li; C.Som.tocar([N.midi(n)], { dur: 0.3 }); } C.guardar('mini-maquina', cfg); pintarGrade(); } }));
        })(i);
        grade.appendChild(linha);
      });
    }
    function tocar() {
      if (ag) { ag.parar(); ag = null; botao.textContent = '▶ Tocar'; return; }
      var acs = acordes(), mel = escalaMel(), vozes = [], ant = null;
      acs.forEach(function (g) { var c = A.conduzir(ant, g.fundamental, g.acorde); vozes.push(c ? c.notas : A.notas(N.comOitava(g.fundamental, 4), g.acorde)); ant = vozes[vozes.length - 1]; });
      var dur = function () { return 60 / cfg.bpm / 4; };
      ag = C.Som.agendador({ bpm: cfg.bpm, porTempo: 4, passos: 64,
        aoPasso: function (i, q) {
          var c = Math.floor(i / 16), p = i % 16, g = acs[c], b = BAT[cfg.bat] || BAT.pop;
          if (cfg.bateria) ['bumbo', 'caixa', 'chimbal'].forEach(function (k) { if (b[k].indexOf(p) >= 0) C.Som.bateria[k](q, p % 4 === 0 ? 0.9 : 0.6); });
          if (cfg.baixo && (p === 0 || p === 8 || p === 14)) C.Som.voz(C.Som.FREQ(N.midi(N.comOitava(g.fundamental, 2)) + (p === 14 ? 7 : 0)), q, dur() * (p === 14 ? 1.8 : 6), { vel: 0.3, timbre: 'pluck' });
          if (cfg.acordes && (p === 0 || p === 6 || p === 12)) vozes[c].forEach(function (n) { C.Som.voz(C.Som.FREQ(N.midi(n)), q, dur() * 5, { vel: 0.07, timbre: 'orgao' }); });
          if (cfg.melodia && cfg.notas[p] != null && mel[cfg.notas[p]]) C.Som.voz(C.Som.FREQ(N.midi(mel[cfg.notas[p]])), q, dur() * 1.8, { vel: 0.2, timbre: 'malete' });
        },
        visual: function (i) { atual = i; if (i < 0) return; var c = Math.floor(i / 16); cab.textContent = 'Compasso ' + (c + 1) + ' de 4 · ' + acs[c].simbolo + ' (' + acs[c].romano + ')'; C.$$('.lab-linha-passos', grade).forEach(function (row) { C.$$('.lab-passo', row).forEach(function (bt, k) { bt.classList.toggle('agora', k === i % 16); }); }); } });
      botao.textContent = '■ Parar';
    }
    C.Som.aoParar = function () { ag = null; botao.textContent = '▶ Tocar'; };
    var botao = el('button', { type: 'button', class: 'btn', txt: '▶ Tocar', onclick: tocar });
    function reiniciar() { C.guardar('mini-maquina', cfg); if (ag) { ag.parar(); ag = null; tocar(); } cab.textContent = acordes().map(function (g) { return g.simbolo; }).join(' → '); }
    var chk = function (k, r) { return el('label', { class: 'lab-check' }, [el('input', { type: 'checkbox', checked: cfg[k] ? true : null, onchange: function (e) { cfg[k] = e.target.checked; C.guardar('mini-maquina', cfg); } }), ' ' + r]); };
    alvo.appendChild(el('div', { class: 'lab-controles' }, [botao,
      C.selTonica(cfg.tonica, function (v) { cfg.tonica = v; pintarGrade(); reiniciar(); }),
      C.select('mm-prog', 'Progressão', T.PROGRESSOES.filter(function (p) { return p.graus.length <= 4; }).map(function (p) { return { valor: p.id, rotulo: p.nome }; }), cfg.prog, function (v) { cfg.prog = v; pintarGrade(); reiniciar(); }),
      C.select('mm-bat', 'Batida', Object.keys(BAT).map(function (k) { return { valor: k, rotulo: k }; }), cfg.bat, function (v) { cfg.bat = v; reiniciar(); }),
      numero('mm-bpm', 'BPM', cfg.bpm, 50, 180, function (v) { cfg.bpm = v; C.guardar('mini-maquina', cfg); if (ag) ag.bpm(v); }),
      chk('bateria', 'bateria'), chk('baixo', 'baixo'), chk('acordes', 'acordes'), chk('melodia', 'melodia'),
      el('button', { type: 'button', class: 'btn sec', txt: 'Melodia aleatória', onclick: function () { var r = L.exercicios.prng(Date.now()); cfg.notas = {}; var at = 4; for (var i = 0; i < 16; i++) if (r() < 0.55) { at = Math.max(0, Math.min(9, at + Math.round((r() - 0.5) * 3))); cfg.notas[i] = at; } C.guardar('mini-maquina', cfg); pintarGrade(); } })]));
    alvo.appendChild(cab); alvo.appendChild(grade);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Quatro compassos em loop, um acorde por compasso. A melodia usa a pentatônica do tom: quase tudo encaixa sobre os acordes.' }));
    pintarGrade(); reiniciar();
  };

  // ------------------------------------------------------------------
  // Motivos
  // ------------------------------------------------------------------
  F.motivos = function (alvo) {
    var txt = C.lerLocal('motivo', 'C4 D4 E4 G4 E4');
    var intervalo = '5J';
    var campo = el('input', { id: 'lab-motivo', type: 'text', value: txt, class: 'lab-textarea' });
    var saida = el('div');
    function render() {
      C.limpar(saida);
      var ns = M.lerMotivo(campo.value);
      if (!ns) { saida.appendChild(el('p', { class: 'lab-erro', txt: 'Escreva as notas com a oitava, separadas por espaço: C4 D4 E4 ou dó4 ré4 mi4.' })); return; }
      C.guardar('motivo', campo.value);
      var trans = [{ nome: 'Original', ns: ns }, { nome: 'Transposto (' + I.ler(intervalo).nome + ' acima)', ns: M.transpor(ns, intervalo) }, { nome: 'Inversão (espelho)', ns: M.inverter(ns) },
        { nome: 'Retrógrado (de trás para frente)', ns: M.retrogradar(ns) }, { nome: 'Retrógrado da inversão', ns: M.retrogradoInverso(ns) }];
      trans.forEach(function (x) {
        if (!x.ns) { saida.appendChild(el('p', { txt: x.nome + ': exigiria acidente triplo.' })); return; }
        saida.appendChild(el('figure', { class: 'lab-fig' }, [el('div', { class: 'lab-svgbox', html: D.pauta({ clave: 'sol', notas: x.ns.map(function (n) { return { nota: N.nome(n), rotulo: rot(n) }; }), titulo: x.nome }) }),
          el('figcaption', {}, [el('strong', { txt: x.nome }), ' ', el('button', { type: 'button', class: 'lab-ouvir mini', 'data-midis': JSON.stringify(x.ns.map(N.midi)), txt: '▶ Ouvir' })])]));
      });
    }
    alvo.appendChild(el('div', { class: 'lab-controles' }, [el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'lab-motivo', txt: 'Motivo (notas com oitava)' }), campo]),
      C.select('lab-iv', 'Transpor por', ['2M', '3m', '3M', '4J', '5J', '6M', '8J'].map(function (x) { return { valor: x, rotulo: I.ler(x).nome }; }), intervalo, function (v) { intervalo = v; render(); }),
      el('button', { type: 'button', class: 'btn', txt: 'Transformar', onclick: render })]));
    alvo.appendChild(saida);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'A inversão espelha cada intervalo com a grafia certa: uma terça maior que sobe vira uma terça maior que desce.' }));
    render();
  };

  // ------------------------------------------------------------------
  // Série de doze sons e matriz
  // ------------------------------------------------------------------
  F['serie-dodecafonica'] = function (alvo) {
    var serie = C.lerLocal('serie', [0, 11, 7, 8, 3, 1, 2, 10, 6, 5, 4, 9]);
    var campo = el('input', { id: 'lab-serie', type: 'text', class: 'lab-textarea', value: serie.map(function (p) { return N.nome(N.deClasse(p), { oitava: false }); }).join(' ') });
    var saida = el('div');
    function nomeP(p) { return rot(N.deClasse(p)); }
    function render() {
      C.limpar(saida);
      var pcs = campo.value.trim().split(/[\s,]+/).map(function (x) { var n = N.ler(x); return n ? N.pc(n) : /^\d+$/.test(x) ? Number(x) % 12 : null; });
      if (pcs.some(function (x) { return x == null; }) || !M.serieValida(pcs)) { saida.appendChild(el('p', { class: 'lab-erro', txt: 'A série precisa ter as 12 notas, cada uma uma vez (nomes ou números de 0 a 11).' })); return; }
      serie = pcs; C.guardar('serie', serie);
      var mz = M.matriz(serie);
      var t = el('table', { class: 'lab-tabela lab-matriz' }, [el('caption', { txt: 'Matriz: linhas = P (esq.→dir.) e R (dir.→esq.); colunas = I (cima→baixo) e RI (baixo→cima)' }),
        el('thead', {}, [el('tr', {}, [el('th', {})].concat(mz.I.map(function (x) { return el('th', { scope: 'col', txt: x }); })).concat([el('th', {})]))]),
        el('tbody', {}, mz.linhas.map(function (l, i) {
          return el('tr', {}, [el('th', { scope: 'row' }, [el('button', { type: 'button', class: 'lab-ouvir mini', 'data-midis': JSON.stringify(l.map(function (p) { return 60 + p; })), txt: mz.P[i] })])]
            .concat(l.map(function (p) { return el('td', { txt: nomeP(p) }); }))
            .concat([el('th', {}, [el('button', { type: 'button', class: 'lab-ouvir mini', 'data-midis': JSON.stringify(l.slice().reverse().map(function (p) { return 60 + p; })), txt: 'R' + mz.P[i].slice(1) })])]));
        }))]);
      saida.appendChild(el('div', { class: 'lab-tabela-rolagem' }, [t]));
    }
    alvo.appendChild(el('div', { class: 'lab-controles' }, [el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'lab-serie', txt: 'Série (12 notas)' }), campo]),
      el('button', { type: 'button', class: 'btn', txt: 'Montar a matriz', onclick: render }),
      el('button', { type: 'button', class: 'btn sec', txt: 'Série aleatória', onclick: function () { var r = L.exercicios.prng(Date.now()); var s = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; for (var i = 11; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var x = s[i]; s[i] = s[j]; s[j] = x; } campo.value = s.map(function (p) { return N.nome(N.deClasse(p), { oitava: false }); }).join(' '); render(); } })]));
    alvo.appendChild(saida);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Aqui as notas são classes de altura (sem oitava e sem grafia): no dodecafonismo, dó♯ e ré♭ são a mesma coisa. Os números dizem a transposição em semitons a partir da primeira nota.' }));
    render();
  };

  // ------------------------------------------------------------------
  // Os 7 modos lado a lado (do mais claro ao mais escuro)
  // ------------------------------------------------------------------
  F['comparar-modos'] = function (alvo, st) {
    var ORDEM = ['lidio', 'maior', 'mixolidio', 'dorico', 'menor-natural', 'frigio', 'locrio'];
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var t = tonicaDe(st);
      alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }), C.selNotacao(render)]));
      var maior = E.notas(t, 'maior');
      var linhas = ORDEM.map(function (id) {
        var ns = E.notas(t, id), gs = E.graus(E.porId(id).formula);
        var celulas = ns.map(function (n, i) { var mudou = gs[i].alt !== 0; return el('td', { class: mudou ? 'lab-grau-mudou' : '' }, [rot(n), mudou ? el('small', { txt: ' ' + (gs[i].alt > 0 ? '♯' : '♭') + gs[i].grau }) : '']); });
        var t4 = naOitava(t); var sobe = E.notas(t4, id).concat([N.comOitava(t4, t4.oitava + 1)]);
        return el('tr', {}, [el('th', { scope: 'row' }, [el('a', { href: L.catalogo.urlEscala(t, id), txt: E.porId(id).nome })])].concat(celulas).concat([el('td', {}, [el('button', { type: 'button', class: 'lab-ouvir mini', 'data-midis': JSON.stringify(sobe.map(N.midi)), txt: '▶' })])]));
      });
      alvo.appendChild(el('div', { class: 'lab-tabela-rolagem' }, [el('table', { class: 'lab-tabela lab-modos' }, [el('caption', { txt: 'Os 7 modos de ' + rot(t) + ', do mais claro (lídio) ao mais escuro (lócrio). Em destaque, os graus que diferem da escala maior.' }),
        el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', txt: 'Modo' })].concat([1, 2, 3, 4, 5, 6, 7].map(function (g) { return el('th', { scope: 'col', txt: String(g) }); })).concat([el('th', { scope: 'col', txt: 'Ouvir' })]))]),
        el('tbody', {}, linhas)])]));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Cada passo para baixo abaixa UMA nota em relação ao modo de cima: lídio → jônio abaixa o 4º grau; jônio → mixolídio, o 7º; e assim por diante. Referência: ' + maior.map(function (n) { return rot(n); }).join(' ') + '.' }));
    }
    render();
  };

  // ------------------------------------------------------------------
  // Teclado isomórfico (Wicki-Hayden): → +2 semitons, ↗ +7, ↖ +5
  // ------------------------------------------------------------------
  F['piano-isomorfico'] = function (alvo, st) {
    function render() {
      C.gravarUrl(st); C.limpar(alvo);
      var t = tonicaDe(st);
      alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selTonica(st.tonica, function (v) { st.tonica = v; render(); }), C.selEscala(st.escala, function (v) { st.escala = v; st.acorde = ''; render(); }, true),
        C.selAcorde(st.acorde, function (v) { st.acorde = v; st.escala = ''; render(); }, true), C.selNotacao(render)]));
      var ns = st.acorde ? A.notas(t, st.acorde) : st.escala ? E.notas(t, st.escala) : [];
      var marc = {}; (ns || []).forEach(function (n) { marc[N.pc(n)] = n; });
      var R = 22, dx = R * Math.sqrt(3), dy = R * 1.5, linhas = 6, cols = 10, base = 48;
      var svg = '', larg = cols * dx + dx, alt = linhas * dy + R * 2;
      for (var r = 0; r < linhas; r++) for (var c = 0; c < cols; c++) {
        // linha ímpar deslocada meia célula: ↗ = +7 e ↖ = +5 em qualquer linha
        var m = base + 2 * c + 12 * Math.floor(r / 2) + 7 * (r % 2);
        var cx = dx / 2 + c * dx + (r % 2 ? dx / 2 : 0) + 4, cy = alt - (R + r * dy) - 4;
        var pc = N.mod(m, 12), sel = marc[pc], raiz = sel && N.pc(t) === pc;
        var pts = []; for (var k = 0; k < 6; k++) { var an = Math.PI / 180 * (60 * k - 30); pts.push((cx + (R - 1) * Math.cos(an)).toFixed(1) + ',' + (cy + (R - 1) * Math.sin(an)).toFixed(1)); }
        var nome = rot(sel || N.deClasse(pc));
        svg += '<g class="iso' + (sel ? ' on' : '') + (raiz ? ' raiz' : '') + (N.mod(m, 12) === 0 ? ' do' : '') + '" data-midi="' + m + '" tabindex="0" role="button" aria-label="' + D.esc(N.nome(N.deMidi(m), { notacao: 'extenso' })) + '"><polygon points="' + pts.join(' ') + '"></polygon><text x="' + cx.toFixed(1) + '" y="' + (cy + 4).toFixed(1) + '" text-anchor="middle">' + D.esc(nome) + '</text></g>';
      }
      var box = el('div', { class: 'lab-svgbox', html: '<svg xmlns="http://www.w3.org/2000/svg" class="lab-svg lab-iso" viewBox="0 0 ' + larg.toFixed(0) + ' ' + alt.toFixed(0) + '" width="' + (larg * 1.3).toFixed(0) + '" role="group" aria-label="Teclado isomórfico">' + svg + '</svg>' });
      box.addEventListener('click', function (e) { var g = e.target.closest('[data-midi]'); if (g) C.Som.tocar([Number(g.dataset.midi)], { dur: 0.8 }); });
      box.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.midi) { e.preventDefault(); C.Som.tocar([Number(e.target.dataset.midi)], { dur: 0.8 }); } });
      alvo.appendChild(el('figure', { class: 'lab-fig' }, [box, el('figcaption', { txt: 'Disposição Wicki-Hayden: para a direita, +1 tom; na diagonal para cima e à direita, +1 quinta; para cima e à esquerda, +1 quarta. Uma forma de acorde vale em QUALQUER tom — mude a tônica e veja o desenho se repetir.' })]));
    }
    render();
  };

  // ------------------------------------------------------------------
  // Xilofone
  // ------------------------------------------------------------------
  F.xilofone = function (alvo) {
    var CORES = ['#E53935', '#FB8C00', '#FDD835', '#7CB342', '#00ACC1', '#3949AB', '#8E24AA'];
    var brancas = [0, 2, 4, 5, 7, 9, 11];
    var notas = []; [4, 5].forEach(function (o) { brancas.forEach(function (pc) { notas.push(12 * (o + 1) + pc); }); }); notas.push(84);
    var box = el('div', { class: 'lab-xilofone', role: 'group', 'aria-label': 'Xilofone' });
    notas.forEach(function (m, i) {
      var n = N.deMidi(m); var li = n.li;
      box.appendChild(el('button', { type: 'button', class: 'lab-lamina', style: 'background:' + CORES[li] + ';height:' + (220 - i * 8) + 'px', 'aria-label': N.nome(n, { notacao: 'extenso' }),
        onpointerdown: function (e) { e.preventDefault(); C.Som.voz(C.Som.FREQ(m), C.Som.audio().currentTime + 0.005, 0.9, { timbre: 'malete', vel: 0.3 }); } }, [el('span', { txt: rot(n) })]));
    });
    alvo.appendChild(el('div', { class: 'lab-controles' }, [C.selNotacao(function () { C.limpar(alvo); F.xilofone(alvo); })]));
    alvo.appendChild(box);
    alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Cada nota tem uma cor (dó vermelho, ré laranja…) e a mesma cor volta na oitava de cima. As lâminas menores soam mais agudo — como no instrumento de verdade.' }));
  };

  // ------------------------------------------------------------------
  // Gerador de bumbo
  // ------------------------------------------------------------------
  F['gerador-de-bumbo'] = function (alvo, st) {
    var p = C.lerLocal('bumbo', { f0: 150, f1: 45, queda: 90, dur: 450, clique: 0.4, sat: 0.2 });
    var cv = el('canvas', { width: 640, height: 160, class: 'lab-canvas', role: 'img', 'aria-label': 'Curva de volume e de altura do bumbo' });
    function bumbo(a, destino, t) {
      var o = a.createOscillator(), g = a.createGain();
      o.frequency.setValueAtTime(p.f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, p.f1), t + p.queda / 1000);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + p.dur / 1000);
      var fim = g;
      if (p.sat > 0) { var ws = a.createWaveShaper(), cur = new Float32Array(512); for (var i = 0; i < 512; i++) { var x = i / 256 - 1; cur[i] = Math.tanh((1 + p.sat * 8) * x) / Math.tanh(1 + p.sat * 8); } ws.curve = cur; g.connect(ws); fim = ws; }
      o.connect(g); fim.connect(destino); o.start(t); o.stop(t + p.dur / 1000 + 0.05);
      if (p.clique > 0) { var cl = a.createOscillator(), cg = a.createGain(); cl.type = 'square'; cl.frequency.value = 2500; cg.gain.setValueAtTime(0.25 * p.clique, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012); cl.connect(cg); cg.connect(destino); cl.start(t); cl.stop(t + 0.02); }
      return o;
    }
    function tocar() { var a = C.Som.audio(); C.Som.registrar(bumbo(a, C.Som.saida(), a.currentTime + 0.02)); }
    function desenhar() {
      var g = cv.getContext('2d'); g.clearRect(0, 0, 640, 160);
      var tot = p.dur / 1000;
      g.strokeStyle = '#1B2A4A'; g.lineWidth = 2; g.beginPath();
      for (var x = 0; x < 640; x++) { var t = x / 640 * tot; var v = t < 0.003 ? t / 0.003 : Math.pow(0.0001 / 0.9, (t - 0.003) / (tot - 0.003)) ; var y = 150 - v * 130; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      g.strokeStyle = '#C9A227'; g.beginPath();
      for (var x2 = 0; x2 < 640; x2++) { var t2 = x2 / 640 * tot; var q = Math.min(1, t2 / (p.queda / 1000)); var f = p.f0 * Math.pow(Math.max(20, p.f1) / p.f0, q); var y2 = 150 - (f - 20) / 280 * 130; if (x2) g.lineTo(x2, y2); else g.moveTo(x2, y2); }
      g.stroke();
      g.fillStyle = '#1F2933'; g.font = '12px Inter,sans-serif'; g.fillText('volume (azul) · altura (dourado)', 8, 16);
    }
    function sl(k, r, min, max, passo, un) {
      var i = el('input', { id: 'kb-' + k, type: 'range', min: min, max: max, step: passo, value: p[k], oninput: function () { p[k] = Number(i.value); l.textContent = p[k] + (un || ''); C.guardar('bumbo', p); desenhar(); } });
      var l = el('span', { txt: p[k] + (un || '') });
      return el('div', { class: 'lab-campo' }, [el('label', { for: 'kb-' + k, txt: r }), i, l]);
    }
    alvo.appendChild(el('div', { class: 'lab-controles' }, [sl('f0', 'Altura inicial', 60, 300, 1, ' Hz'), sl('f1', 'Altura final', 25, 100, 1, ' Hz'), sl('queda', 'Queda da altura', 10, 400, 5, ' ms'),
      sl('dur', 'Duração', 80, 1500, 10, ' ms'), sl('clique', 'Ataque (clique)', 0, 1, 0.05), sl('sat', 'Saturação', 0, 1, 0.05),
      el('button', { type: 'button', class: 'btn', txt: '▶ Tocar', onclick: tocar }),
      el('button', { type: 'button', class: 'btn sec', txt: 'Exportar WAV', onclick: function () {
        if (!st.exportar) { C.aviso('Exportar faz parte da assinatura do Musique. O resto da ferramenta é livre.', 'erro'); return; }
        var sr = 44100, n = Math.ceil(sr * (p.dur / 1000 + 0.1)), off = new (w.OfflineAudioContext || w.webkitOfflineAudioContext)(1, n, sr);
        bumbo(off, off.destination, 0);
        off.startRendering().then(function (buf) { C.baixar('bumbo-musique.wav', 'audio/wav', wav(buf.getChannelData(0), sr)); });
      } })]));
    alvo.appendChild(el('figure', { class: 'lab-fig' }, [cv, el('figcaption', { txt: 'O bumbo eletrônico é uma senoide cuja altura cai muito rápido: a queda dá o "soco", a duração dá o corpo.' })]));
    desenhar();
  };
  function wav(amostras, sr) {
    var n = amostras.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    var s = function (o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, amostras[i])) * 32767, true);
    return new Uint8Array(b);
  }
})(window, document);
