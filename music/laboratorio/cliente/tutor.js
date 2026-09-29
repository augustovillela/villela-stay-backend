// =====================================================================
// Musique · Laboratório — cliente · TUTOR DE BRAÇO (29/09/2026).
//
// 1. O aluno escolhe instrumento, afinação e o exercício clássico; o
//    núcleo (`digitacoes.montar`) calcula cada passo: corda, casa, dedo.
// 2. ▶ Demonstração: contagem, depois o braço anima nota a nota, com o
//    dedo indicado e o som no timbre do instrumento, no andamento.
// 3. 🎤 Praticar: o microfone liga, o metrônomo conta, o aluno toca. A
//    escuta mede altura e início de cada nota AQUI (nada é gravado nem
//    enviado); `tutor.avaliar` compara e `tutor.orientar` fala.
// 4. Modo velocidade: repete sozinho, subindo o andamento só quando a
//    rodada sai limpa (e descendo quando não sai).
// 5. "Pergunte ao tutor" só aparece se a IA estiver ligada no staff.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, N = L.notas, E = L.escalas, A = L.acordes, INS = L.instrumentos, D = L.desenho, DG = L.digitacoes, TU = L.tutor;
  var el = C.el;

  var INSTRUMENTOS = [
    { id: 'violao', nome: 'Violão', timbre: 'nylon' }, { id: 'guitarra', nome: 'Guitarra', timbre: 'eletrica' },
    { id: 'baixo', nome: 'Contrabaixo', timbre: 'aco' }, { id: 'violao-7', nome: 'Violão de 7 cordas', timbre: 'nylon' },
    { id: 'ukulele', nome: 'Ukulele', timbre: 'nylon' }, { id: 'cavaquinho', nome: 'Cavaquinho', timbre: 'aco' },
    { id: 'bandolim', nome: 'Bandolim', timbre: 'bandolim' },
  ];
  var ESCALAS_POSICAO = ['maior', 'menor-natural', 'menor-harmonica', 'menor-melodica', 'dorico', 'frigio', 'lidio', 'mixolidio', 'locrio', 'blues-menor', 'blues-maior', 'pentatonica-menor', 'pentatonica-maior'];
  var ACORDES_ARPEJO = ['maior', 'menor', '7', '7M', 'm7', 'm7b5', 'dim', 'dim7', 'aum', 'sus4', '6', 'm6'];
  var NPT = [{ valor: '1', rotulo: 'semínimas (1 por tempo)' }, { valor: '2', rotulo: 'colcheias (2 por tempo)' }, { valor: '3', rotulo: 'tercinas (3 por tempo)' }, { valor: '4', rotulo: 'semicolcheias (4 por tempo)' }];

  function existe(lista, porId) { return lista.filter(function (id) { return porId(id); }); }

  C.ferramentas['tutor-braco'] = function (alvo, st0) {
    var st = {
      instrumento: st0.instrumento || 'violao', afinacao: st0.afinacao || 'padrao', canhoto: !!st0.canhoto,
      tipo: st0.tipo || 'pentatonica', tonica: st0.tonica || 'la', escala: st0.escala || '', acorde: st0.acorde || 'm7',
      desenho: st0.desenho || 1, posicao: st0.posicao || 5, variante: st0.variante || '1234', ordem: st0.ordem || 'sobe-desce',
      bpm: st0.bpm || 60, npt: st0.npt || 2,
    };
    var completo = !!st0.completo, demoRestantes = st0.demo || 0;
    var opc = C.lerLocal('tutor-opcoes', { falar: false, guia: false, velocidade: false, metronomo: true });
    var ex = null, atual = -1, marcas = {}, rodando = null, historico = [], ultimo = null, ultimasFalas = [];

    // --------------------------------------------------------- controles
    var boxCtl = el('form', { class: 'lab-controles lab-tutor-ctl', onsubmit: function (e) { e.preventDefault(); } });
    var boxInfo = el('div', { class: 'lab-tutor-info' });
    var boxBraco = el('figure', { class: 'lab-fig lab-tutor-braco' });
    var boxSeq = el('ol', { class: 'lab-tutor-seq', 'aria-label': 'Sequência de notas do exercício' });
    var boxAcoes = el('div', { class: 'lab-tutor-acoes' });
    var boxTutor = el('section', { class: 'lab-tutor-painel', 'aria-live': 'polite', 'aria-label': 'Tutor' });
    var boxHist = el('section', { class: 'lab-tutor-hist' });
    var boxIa = el('section', { class: 'lab-tutor-ia', hidden: true });
    C.limpar(alvo);
    [boxCtl, boxInfo, boxBraco, boxSeq, boxAcoes, boxTutor, boxHist, boxIa].forEach(function (x) { alvo.appendChild(x); });

    function afinacoesDe(inst) {
      var i = INS.instrumento(inst); var afs = (i && i.afinacoes) || INS.instrumento('violao').afinacoes;
      return Object.keys(afs).map(function (k) { return { valor: k, rotulo: afs[k].nome }; });
    }
    function escalasDoTipo() {
      if (st.tipo === 'pentatonica') return [{ valor: 'pentatonica-menor', rotulo: 'pentatônica menor' }, { valor: 'pentatonica-maior', rotulo: 'pentatônica maior' }];
      var ids = existe(ESCALAS_POSICAO, E.porId);
      if (st.tipo === 'tres-por-corda') ids = ids.filter(function (id) { return E.porId(id).formula.split(' ').length === 7; });
      return ids.map(function (id) { return { valor: id, rotulo: E.porId(id).nome }; });
    }
    function montarControles() {
      C.limpar(boxCtl);
      var add = function (x) { boxCtl.appendChild(x); };
      add(C.select('tb-inst', 'Instrumento', INSTRUMENTOS.map(function (i) { return { valor: i.id, rotulo: i.nome }; }), st.instrumento, function (v) { st.instrumento = v; st.afinacao = 'padrao'; mudou(true); }));
      add(C.select('tb-afin', 'Afinação', afinacoesDe(st.instrumento), st.afinacao, function (v) { st.afinacao = v; mudou(true); }));
      add(C.select('tb-tipo', 'Exercício', DG.TIPOS.map(function (t) { return { valor: t.id, rotulo: t.nome }; }), st.tipo, function (v) { st.tipo = v; st.desenho = 1; if (v === 'pentatonica' && !/^pentatonica/.test(st.escala)) st.escala = 'pentatonica-menor'; mudou(true); }));
      if (st.tipo !== 'cromatico') add(C.selTonica(st.tonica, function (v) { st.tonica = v; mudou(true); }, 'tb-tonica'));
      if (st.tipo === 'arpejo') add(C.select('tb-acorde', 'Acorde', existe(ACORDES_ARPEJO, A.porId).map(function (id) { var c = A.porId(id); return { valor: id, rotulo: (c.simbolos[0] || 'maior') + ' — ' + c.nome }; }), st.acorde, function (v) { st.acorde = v; mudou(); }));
      if (st.tipo !== 'cromatico' && st.tipo !== 'arpejo') {
        var ops = escalasDoTipo();
        if (!ops.some(function (o) { return o.valor === st.escala; })) st.escala = ops[0].valor;
        add(C.select('tb-escala', 'Escala', ops, st.escala, function (v) { st.escala = v; st.desenho = 1; mudou(true); }));
      }
      if (st.tipo === 'cromatico') {
        add(C.select('tb-var', 'Dedos', Object.keys(DG.CROMATICOS).map(function (k) { return { valor: k, rotulo: k.split('').join('-') }; }), st.variante, function (v) { st.variante = v; mudou(); }));
        add(C.select('tb-pos', 'Posição (casa)', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (k) { return { valor: String(k), rotulo: 'casa ' + k }; }), String(st.posicao), function (v) { st.posicao = Number(v); mudou(); }));
      } else {
        var t = montar();
        var rot = st.tipo === 'tres-por-corda'
          ? [1, 2, 3, 4, 5, 6, 7].map(function (k) { return { valor: String(k), rotulo: 'começa no ' + k + 'º grau' }; })
          : (t.desenhos || []).map(function (x) { return { valor: String(x.n), rotulo: x.rotulo }; });
        if (rot.length) add(C.select('tb-desenho', st.tipo === 'tres-por-corda' ? 'Padrão' : 'Desenho', rot, String(st.desenho), function (v) { st.desenho = Number(v); mudou(); }));
      }
      add(C.select('tb-ordem', 'Sequência', Object.keys(DG.ORDENS).map(function (k) { return { valor: k, rotulo: DG.ORDENS[k].nome }; }), st.ordem, function (v) { st.ordem = v; mudou(); }));
      var bpm = el('input', { id: 'tb-bpm', type: 'number', min: 30, max: 300, value: st.bpm, oninput: function () { var v = Number(bpm.value); if (v >= 30 && v <= 300) { st.bpm = v; gravar(); infoAndamento(); } } });
      add(el('div', { class: 'lab-campo lab-campo-curto' }, [el('label', { for: 'tb-bpm', txt: 'BPM' }), bpm]));
      add(C.select('tb-npt', 'Notas por tempo', NPT, String(st.npt), function (v) { st.npt = Number(v); gravar(); infoAndamento(); }));
      var can = el('input', { id: 'tb-can', type: 'checkbox', onchange: function () { st.canhoto = can.checked; mudou(); } }); can.checked = st.canhoto;
      add(el('div', { class: 'lab-campo lab-campo-check' }, [el('label', { for: 'tb-can' }, [can, ' canhoto'])]));
    }
    function montar() { return DG.montar({ instrumento: st.instrumento, afinacao: st.afinacao, tipo: st.tipo, tonica: N.deSlug(st.tonica) || N.ler('A'),
      escala: st.escala, acorde: st.acorde, desenho: st.desenho, posicao: st.posicao, variante: st.variante, ordem: st.ordem }); }

    function chave() { return [st.instrumento, st.afinacao, st.tipo, st.tipo === 'cromatico' ? st.variante + '@' + st.posicao : st.tonica, st.tipo === 'arpejo' ? st.acorde : st.escala, st.desenho, st.ordem].join('|').replace(/[^a-z0-9|#()+-]/gi, '-'); }
    function gravar() { try { var q = new URLSearchParams({ i: st.instrumento, af: st.afinacao, x: st.tipo, t: st.tonica, e: st.escala, a: st.acorde, d: st.desenho, p: st.posicao, v: st.variante, o: st.ordem, bpm: st.bpm, npt: st.npt }); if (st.canhoto) q.set('canhoto', '1'); history.replaceState(null, '', location.pathname + '?' + q.toString()); } catch (_) { /* sem history: tudo bem */ } }

    function mudou(refazerControles) {
      parar();
      if (refazerControles) montarControles();
      ex = montar(); atual = -1; marcas = {}; ultimo = null;
      gravar(); pintar(); pintarSeq(); infoAndamento();
      pintarTutor([ex.passos.length ? 'Pronto: ' + ex.passos.length + ' notas. Veja a demonstração e depois toque junto comigo.' : 'Este exercício não cabe neste instrumento ou afinação. Troque o tipo ou a escala.']);
    }

    // ---------------------------------------------------------- desenho
    function tonicaPc() { var t = N.deSlug(st.tonica); return t ? N.pc(t) : -1; }
    function pintar() {
      var pc = st.tipo === 'cromatico' ? -1 : tonicaPc(), vistos = {}, dest = [];
      ex.passos.forEach(function (p, i) {
        var k = p.corda + ':' + p.casa;
        var tipo = i === atual ? 'agora' : marcas[i] === true ? 'certo' : marcas[i] === false ? 'errado' : (N.mod(p.midi, 12) === pc ? 'raiz' : 'nota');
        if (vistos[k] != null) { if (i === atual || marcas[i] != null) dest[vistos[k]].tipo = tipo; return; }
        vistos[k] = dest.length;
        dest.push({ corda: p.corda, casa: p.casa, rotulo: p.dedo ? String(p.dedo) : '0', tipo: tipo });
      });
      var casas = Math.min(24, Math.max(ex.casas, 5));
      boxBraco.innerHTML = '<div class="lab-svgbox">' + D.braco({ afinacao: ex.afinacao, casas: casas, destaques: dest, canhoto: st.canhoto, notacao: C.notacao, titulo: ex.titulo, escala: 1.15 }) + '</div>'
        + '<figcaption>' + esc(ex.titulo) + ' · números = dedo da mão que pisa (1 indicador, 2 médio, 3 anelar, 4 mínimo; 0 = corda solta). Corda mais grave embaixo.</figcaption>';
    }
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function nomeCorda(c) { return (ex.afinacao.midi.length - c) + 'ª'; }
    function pintarSeq() {
      C.limpar(boxSeq);
      ex.passos.forEach(function (p, i) {
        var cls = 'lab-tutor-passo' + (i === atual ? ' agora' : '') + (marcas[i] === true ? ' certo' : marcas[i] === false ? ' errado' : '');
        boxSeq.appendChild(el('li', { class: cls, title: 'corda ' + nomeCorda(p.corda) + ', ' + (p.casa ? 'casa ' + p.casa + ', dedo ' + p.dedo : 'solta') }, [
          el('strong', { txt: C.nomeNota(N.ler(p.nota) || N.deMidi(p.midi)) }), el('small', { txt: nomeCorda(p.corda) + ' · ' + (p.casa ? p.casa + ' · d' + p.dedo : 'solta') })]));
      });
    }
    function destacar(i) {
      atual = i; pintar();
      C.$$('.lab-tutor-passo', boxSeq).forEach(function (li, k) { li.classList.toggle('agora', k === i); });
      var li = boxSeq.children[i]; if (li && li.scrollIntoView && boxSeq.scrollWidth > boxSeq.clientWidth) { boxSeq.scrollLeft = li.offsetLeft - boxSeq.clientWidth / 2; }
    }
    function infoAndamento() {
      var dur = 60 / st.bpm / st.npt, total = ex ? ex.passos.length * dur : 0, melhor = C.lerLocal('tutor-melhor', {})[chave()];
      C.limpar(boxInfo);
      boxInfo.appendChild(el('p', {}, [el('strong', { txt: ex ? ex.titulo : '' }), ' · ' + (ex ? ex.passos.length : 0) + ' notas · ' + st.bpm + ' BPM, ' + st.npt + ' por tempo = ' + Math.round(st.bpm * st.npt) + ' notas por minuto · ' + total.toFixed(1) + ' s' + (melhor ? ' · sua melhor marca limpa: ' + melhor + ' BPM' : '')]));
    }

    // ------------------------------------------------------------- som
    function timbre() { var i = INSTRUMENTOS.filter(function (x) { return x.id === st.instrumento; })[0]; return i ? i.timbre : 'nylon'; }
    function clique(t, forte, vel) { C.Som.bateria.clique(t, vel == null ? 0.6 : vel, forte); }

    /**
     * Toca o exercício: 1 compasso de contagem (4 tempos) e depois os
     * passos. `comNotas` = demonstração; sem notas = só metrônomo (prática).
     * Devolve { inicio (tempo do áudio da 1ª nota), dur, parar }.
     */
    function tocarExercicio(o) {
      var a = C.Som.audio(), dur = 60 / st.bpm / st.npt, conta = 4 * st.npt, total = conta + ex.passos.length + st.npt;
      var inicio = null, fim = false;
      var ag = C.Som.agendador({ bpm: st.bpm, porTempo: st.npt, passos: total, umaVez: true,
        aoPasso: function (i, t) {
          if (i === conta) inicio = t;
          var tempo = i % st.npt === 0;
          if (tempo && (i < conta || o.metronomo)) clique(t, i % (4 * st.npt) === 0, i < conta ? 0.7 : (o.comNotas ? 0.3 : 0.25));
          var k = i - conta;
          if (k >= 0 && k < ex.passos.length && (o.comNotas || o.guia)) C.Som.voz(C.Som.FREQ(ex.passos[k].midi), t, Math.max(0.18, dur * 1.6), { timbre: timbre(), vel: o.comNotas ? 0.5 : 0.12 });
        },
        visual: function (i) {
          if (i < 0) return;
          var k = i - conta;
          if (i < conta) { if (i % st.npt === 0) pintarTutor(['Contagem: ' + (i / st.npt + 1) + '…'], true); }
          else if (k < ex.passos.length) destacar(k);
          if (i === total - 1 && !fim) { fim = true; setTimeout(function () { if (o.aoFim) o.aoFim(); }, 250); }
        } });
      // o 1º passo acontece ~0.08 s depois de agora: estima o início antes do agendador chegar lá
      var estimado = a.currentTime + 0.08 + conta * dur;
      return { inicio: function () { return inicio != null ? inicio : estimado; }, dur: dur, parar: function () { ag.parar(); } };
    }

    // ------------------------------------------------------ microfone
    function microfone() {
      var stream = null, an = null, buf = null, raf = null, fonte = null, quadros = [], base = 0;
      return {
        ligar: function () {
          if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return Promise.reject(new Error('Este navegador não dá acesso ao microfone.'));
          if (!(w.MusiqueAudio && w.MusiqueAudio.detectarHz)) return Promise.reject(new Error('A escuta não carregou. Recarregue a página.'));
          return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) {
            stream = s; var a = C.Som.audio();
            fonte = a.createMediaStreamSource(s); an = a.createAnalyser(); an.fftSize = st.instrumento === 'baixo' ? 4096 : 2048; /* 2048 = ~4× mais quadros por segundo (tempo mais fino); o baixo precisa da janela longa para o mi1 */ fonte.connect(an); buf = new Float32Array(an.fftSize);
            var laco = function () {
              // relógio lido ANTES da análise (que é pesada): o quadro descreve o
              // som que terminou agora, e o meio da janela é o instante dele
              var agora = a.currentTime;
              an.getFloatTimeDomainData(buf);
              var r = w.MusiqueAudio.detectarHz(buf, a.sampleRate);
              quadros.push({ t: agora - an.fftSize / a.sampleRate / 2 - base, hz: r.hz, conf: r.confianca == null ? (r.hz > 0 ? 0.9 : 0) : r.confianca, rms: r.rms });
              raf = requestAnimationFrame(laco);
            };
            laco();
          });
        },
        zerar: function (t0) { base = t0; quadros = []; },
        quadros: function () { return quadros.slice(); },
        desligar: function () {
          cancelAnimationFrame(raf);
          try { if (fonte) fonte.disconnect(); } catch (_) { /* ok */ }
          if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
          stream = null;
        },
      };
    }

    // --------------------------------------------------------- ações
    var btDemo = el('button', { type: 'button', class: 'btn', onclick: function () { demonstrar(); } }, ['▶ Demonstração']);
    var btPrat = el('button', { type: 'button', class: 'btn btn-mic', onclick: function () { praticar(); } }, ['🎤 Praticar com o tutor']);
    var btParar = el('button', { type: 'button', class: 'btn sec', hidden: true, onclick: function () { parar(); pintarTutor(['Parado. Quando quiser, é só recomeçar.']); } }, ['■ Parar']);
    var btDevagar = el('button', { type: 'button', class: 'btn sec', onclick: function () { st.bpm = Math.max(30, st.bpm - 5); C.$('#tb-bpm').value = st.bpm; gravar(); infoAndamento(); } }, ['− 5 BPM']);
    var btRapido = el('button', { type: 'button', class: 'btn sec', onclick: function () { st.bpm = Math.min(300, st.bpm + 5); C.$('#tb-bpm').value = st.bpm; gravar(); infoAndamento(); } }, ['+ 5 BPM']);
    function caixa(id, rotulo, chaveOpc, dica) {
      var i = el('input', { id: id, type: 'checkbox', onchange: function () { opc[chaveOpc] = i.checked; C.guardar('tutor-opcoes', opc); } }); i.checked = !!opc[chaveOpc];
      return el('label', { class: 'lab-tutor-op', for: id, title: dica || '' }, [i, ' ' + rotulo]);
    }
    [btDemo, btPrat, btParar, btDevagar, btRapido].forEach(function (b) { boxAcoes.appendChild(b); });
    boxAcoes.appendChild(el('div', { class: 'lab-tutor-ops' }, [
      caixa('tb-met', 'metrônomo durante a prática', 'metronomo', 'Clique baixo em cada tempo.'),
      caixa('tb-guia', 'nota-guia baixinha', 'guia', 'Toca o exercício bem baixo junto com você. Use com fone de ouvido, senão o microfone escuta a guia.'),
      caixa('tb-vel', 'modo velocidade (repete e ajusta o BPM)', 'velocidade'),
      caixa('tb-fala', 'tutor fala em voz alta', 'falar')]));

    function ocupado(on) { btDemo.disabled = on; btPrat.disabled = on; btParar.hidden = !on; C.$$('select,input', boxCtl).forEach(function (x) { x.disabled = on; }); }
    function parar() {
      if (rodando) { try { rodando.parar(); } catch (_) { /* ok */ } }
      rodando = null; ocupado(false);
      if (w.speechSynthesis) try { w.speechSynthesis.cancel(); } catch (_) { /* ok */ }
    }
    function demonstrar() {
      if (!ex.passos.length) return;
      parar(); marcas = {}; pintarSeq(); ocupado(true);
      pintarTutor(['Olhe o dedo em cada casa e escute. Depois é a sua vez.'], true);
      var t = tocarExercicio({ comNotas: true, metronomo: true, aoFim: function () { atual = -1; pintar(); ocupado(false); rodando = null; pintarTutor(['Essa foi a demonstração a ' + st.bpm + ' BPM. Agora toque junto: clique em “Praticar com o tutor”.']); } });
      rodando = { parar: function () { t.parar(); atual = -1; pintar(); } };
    }

    function praticar() {
      if (!ex.passos.length) return;
      if (!completo && demoRestantes <= 0) {
        pintarTutor(['As rodadas de demonstração desta visita acabaram. A demonstração animada continua livre.', st0.logado ? 'Assine o Musique para praticar sem limite e guardar sua marca em cada exercício.' : 'Entre ou comece o teste grátis para praticar sem limite.']);
        return;
      }
      parar(); marcas = {}; pintarSeq(); ocupado(true);
      pintarTutor(['Ligando o microfone…'], true);
      var mic = microfone();
      mic.ligar().then(function () {
        if (!completo) demoRestantes--;
        pintarTutor(['Afine antes, se precisar. Escute a contagem de 4 e comece no próximo tempo. Uma nota por vez.'], true);
        var t = tocarExercicio({ comNotas: false, guia: !!opc.guia, metronomo: opc.metronomo !== false, aoFim: function () {
          var quadros = mic.quadros(); mic.desligar();
          rodando = null; ocupado(false); atual = -1;
          avaliarRodada(t, quadros);
        } });
        // zera o relógio da escuta no instante da 1ª nota (o agendador confirma logo)
        var zerou = false;
        var ajustar = function () { if (zerou || !rodando) return; mic.zerar(t.inicio()); zerou = true; };
        setTimeout(ajustar, Math.max(0, (t.inicio() - C.Som.audio().currentTime) * 1000 - 400));
        rodando = { parar: function () { t.parar(); mic.desligar(); atual = -1; pintar(); } };
        mic.zerar(t.inicio());
      }).catch(function (e) {
        ocupado(false);
        pintarTutor([e && e.name === 'NotAllowedError' ? 'O microfone foi bloqueado. Libere o acesso nas permissões do navegador para o tutor escutar.' : (e.message || 'Não consegui ligar o microfone.')]);
      });
    }

    function avaliarRodada(t, quadros) {
      var esperados = ex.passos.map(function (p, i) { return { t: i * t.dur, midi: p.midi, corda: p.corda, casa: p.casa, dedo: p.dedo }; });
      var tocadas = TU.segmentar(quadros);
      var r = TU.avaliar(esperados, tocadas, { passo_s: t.dur });
      C.tutorUltimaRodada = { esperados: esperados, tocadas: tocadas, quadros: quadros.length, resultado: r };   // para suporte e depuração (nada de áudio)
      marcas = {}; r.itens.forEach(function (x) { marcas[x.i] = x.certo; });
      var o = TU.orientar(r, { nCordas: ex.afinacao.midi.length, bpm: st.bpm, semente: historico.length });
      ultimo = r; ultimasFalas = o.falas;
      historico.unshift({ bpm: st.bpm, npt: st.npt, precisao: r.precisao, desvio: r.desvio_medio_ms, titulo: ex.titulo, hora: new Date() });
      pintar(); pintarSeq();
      pintarTutor(o.falas, false, r, o.proximo);
      guardarMarca(r);
      pintarHist();
      if (opc.velocidade && r.certos > 0 && (completo || demoRestantes > 0)) {
        var novo = o.proximo.bpm;
        if (novo !== st.bpm) { st.bpm = novo; var b = C.$('#tb-bpm'); if (b) b.value = novo; gravar(); infoAndamento(); }
        setTimeout(function () { if (!rodando && opc.velocidade) praticar(); }, opc.falar ? 6500 : 3500);
      }
    }

    function guardarMarca(r) {
      var limpa = r.precisao >= 95 && r.desvio_medio_ms <= 60;
      var loc = C.lerLocal('tutor-melhor', {});
      if (limpa && (!loc[chave()] || st.bpm > loc[chave()])) { loc[chave()] = st.bpm; C.guardar('tutor-melhor', loc); }
      if (!completo) return;
      C.api('POST', '/music/api/lab/tutor/sessao', { exercicio: chave(), titulo: ex.titulo, bpm: st.bpm, precisao: r.precisao, desvio_ms: r.desvio_medio_ms })
        .then(function (x) { if (x.recorde) C.aviso('Nova marca limpa neste exercício: ' + st.bpm + ' BPM! 🎉'); })
        .catch(function () { /* sem rede: a marca fica neste aparelho */ });
    }

    // --------------------------------------------------------- o tutor
    function falar(texto) {
      if (!opc.falar || !w.speechSynthesis || !w.SpeechSynthesisUtterance) return;
      try { w.speechSynthesis.cancel(); var u = new w.SpeechSynthesisUtterance(texto); u.lang = 'pt-BR'; u.rate = 1.05; w.speechSynthesis.speak(u); } catch (_) { /* sem voz: tudo bem */ }
    }
    function pintarTutor(falas, efemero, r, prox) {
      C.limpar(boxTutor);
      var cab = el('div', { class: 'lab-tutor-cab' }, [el('span', { class: 'lab-tutor-avatar', 'aria-hidden': 'true', txt: '🎸' }), el('strong', { txt: 'Tutor' })]);
      boxTutor.appendChild(cab);
      if (r) {
        boxTutor.appendChild(el('div', { class: 'lab-tutor-nums' }, [
          num(r.precisao + '%', 'notas certas'), num(r.certos + '/' + r.total, 'acertos'), num(r.desvio_medio_ms + ' ms', 'desvio de tempo'),
          num(r.deriva_ms > 40 ? 'atrasando' : r.deriva_ms < -40 ? 'correndo' : 'estável', 'andamento')]));
      }
      boxTutor.appendChild(el('ul', { class: 'lab-tutor-falas' }, falas.map(function (f) { return el('li', { txt: f }); })));
      if (prox && prox.bpm !== st.bpm) {
        boxTutor.appendChild(el('p', {}, [el('button', { type: 'button', class: 'btn sec', onclick: function () { st.bpm = prox.bpm; C.$('#tb-bpm').value = prox.bpm; gravar(); infoAndamento(); C.aviso('Andamento: ' + prox.bpm + ' BPM.'); } }, ['Usar ' + prox.bpm + ' BPM']), ' ', el('small', { txt: 'Regra: ' + prox.motivo + '.' })]));
      }
      if (!completo && r) boxTutor.appendChild(el('p', { class: 'lab-dica', txt: demoRestantes > 0 ? 'Rodadas de demonstração restantes nesta visita: ' + demoRestantes + '.' : 'Esta foi a última rodada de demonstração desta visita.' }));
      if (!efemero) falar(falas.join(' '));
    }
    function num(v, rot) { return el('div', { class: 'lab-tutor-num' }, [el('strong', { txt: v }), el('small', { txt: rot })]); }

    function pintarHist() {
      C.limpar(boxHist);
      if (!historico.length) return;
      boxHist.appendChild(el('h2', { txt: 'Rodadas desta sessão' }));
      boxHist.appendChild(el('ol', { class: 'lab-tutor-rodadas' }, historico.slice(0, 12).map(function (h) {
        return el('li', {}, [el('strong', { txt: h.precisao + '%' }), ' a ' + h.bpm + ' BPM (' + h.npt + '/tempo), desvio ' + h.desvio + ' ms — ' + h.titulo]);
      })));
    }

    // ------------------------------------------------------------- IA
    function montarIa() {
      if (!st0.ia) return;
      boxIa.hidden = false;
      var ta = el('textarea', { id: 'tb-pergunta', class: 'lab-textarea', rows: 2, maxlength: 600, placeholder: 'Ex.: por que erro sempre na troca de corda? Como ganhar velocidade sem tensão?' });
      var saida = el('div', { class: 'lab-tutor-ia-saida', 'aria-live': 'polite' });
      var bt = el('button', { type: 'button', class: 'btn', onclick: function () {
        bt.disabled = true; saida.textContent = 'O tutor está pensando…';
        var r = ultimo;
        C.api('POST', '/music/api/lab/tutor/conversa', { pergunta: ta.value, titulo: ex.titulo, instrumento: st.instrumento, bpm: st.bpm, npt: st.npt, falas: ultimasFalas,
          resultado: r ? { precisao: r.precisao, total: r.total, certos: r.certos, erradas: r.erradas, faltaram: r.faltaram, desvio_medio_ms: r.desvio_medio_ms, deriva_ms: r.deriva_ms,
            erros: r.itens.filter(function (x) { return x.tocou && !x.certo; }).slice(0, 8).map(function (x) { return { nota: x.i + 1, corda: ex.afinacao.midi.length - x.esperado.corda, casa: x.esperado.casa, dedo: x.esperado.dedo, semitons: x.semitons }; }) } : null })
          .then(function (x) {
            C.limpar(saida);
            saida.appendChild(el('p', { txt: x.resposta }));
            if (x.dica) saida.appendChild(el('p', {}, [el('strong', { txt: 'Dica: ' }), x.dica]));
            if (x.exercicio_sugerido) saida.appendChild(el('p', {}, [el('strong', { txt: 'Experimente: ' }), x.exercicio_sugerido]));
            saida.appendChild(el('p', { class: 'lab-dica', txt: 'Resposta de IA a partir da medida do código. É sugestão de estudo, não avaliação.' }));
            falar(x.resposta);
          })
          .catch(function (e) { saida.textContent = e.message || 'O tutor de IA não respondeu agora.'; })
          .then(function () { bt.disabled = false; });
      } }, ['Perguntar']);
      boxIa.appendChild(el('h2', { txt: '💬 Pergunte ao tutor' }));
      boxIa.appendChild(el('p', { class: 'lab-dica', txt: 'O tutor de IA conhece a sua última rodada (os números medidos acima) e responde sobre técnica. Ele não escuta o áudio.' }));
      boxIa.appendChild(el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'tb-pergunta', txt: 'Sua pergunta (opcional)' }), ta]));
      boxIa.appendChild(bt); boxIa.appendChild(saida);
    }

    // aba escondida: o áudio para (audio.js) — o microfone e a rodada também
    d.addEventListener('visibilitychange', function () { if (d.hidden && rodando) { parar(); pintarTutor(['Pausei porque a página saiu da tela. Recomece quando quiser.']); } });

    montarControles();
    mudou();
    montarIa();
  };
})(window, document);
