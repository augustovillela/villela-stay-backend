// =====================================================================
// Musique · Laboratório — cliente · TRANSCREVER (29/09/2026).
//
// Entrada:
//   📁 arquivo → decodeAudioData → mono a 22 050 Hz (OfflineAudioContext)
//      → quadros em lotes (a tela não congela) → `transcricao.analisar`;
//   🖥️ aba (getDisplayMedia com o áudio da guia) ou 🎤 microfone → um
//      quadro a cada ~100 ms, acorde e nota AO VIVO; ao parar, a análise
//      completa do que foi ouvido.
// Saída: tom, BPM, cifra por compasso (clicável: ouve o acorde), player
// que acompanha o compasso tocando, melodia em rolo de piano, transpor,
// exportar (cifra ChordPro e MIDI — assinatura) e atalhos para o
// Laboratório e o Tutor de braço.
// Nada é enviado: o áudio e o resultado ficam no aparelho.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, N = L.notas, A = L.acordes, TR = L.transcricao;
  var el = C.el;
  var TAXA = 22050, MAX_S = 15 * 60, MAX_MB = 120;

  C.ferramentas['transcrever'] = function (alvo, st) {
    var completo = !!st.completo, limite = completo ? MAX_S : (st.demo_s || 60);
    var compasso = st.compasso === 3 ? 3 : 4;
    var buffer = null, resultado = null, transpor = 0, tocando = null, nomeArq = '';

    C.limpar(alvo);
    var boxEntrada = el('section', { class: 'lab-tr-entrada' });
    var boxProg = el('div', { class: 'lab-tr-prog', hidden: true }, [el('progress', { max: 100, value: 0 }), el('span', { txt: '' })]);
    var boxVivo = el('section', { class: 'lab-tr-vivo', hidden: true, 'aria-live': 'polite' });
    var boxRes = el('section', { class: 'lab-tr-res' });
    [boxEntrada, boxProg, boxVivo, boxRes].forEach(function (x) { alvo.appendChild(x); });

    // ------------------------------------------------------ entrada
    var inp = el('input', { id: 'tr-arq', type: 'file', accept: 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm', class: 'sr', onchange: function () { if (inp.files[0]) doArquivo(inp.files[0]); } });
    var zona = el('label', { for: 'tr-arq', class: 'lab-tr-zona' }, [el('strong', { txt: '📁 Escolher um arquivo de áudio' }), el('span', { txt: 'ou arraste para cá — MP3, WAV, M4A, OGG, FLAC' })]);
    ['dragover', 'dragenter'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('sobre'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('sobre'); if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files[0]) doArquivo(e.dataTransfer.files[0]); }); });
    var podeAba = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    boxEntrada.appendChild(el('div', { class: 'lab-tr-opcoes' }, [
      el('div', { class: 'lab-tr-cartao' }, [inp, zona]),
      el('div', { class: 'lab-tr-cartao' }, [
        el('strong', { txt: '🔴 Ouvir ao vivo' }),
        el('p', { class: 'lab-dica', txt: 'Para um vídeo do YouTube ou outro site: abra-o em outra aba, clique em “Ouvir uma aba”, escolha a aba e marque o áudio. Pode ir para lá dar o play: o Musique continua ouvindo. Ou toque perto do microfone.' }),
        el('div', { class: 'lab-tr-bts' }, [
          podeAba ? el('button', { type: 'button', class: 'btn', onclick: function () { vivo('aba'); } }, ['🖥️ Ouvir uma aba']) : el('p', { class: 'lab-dica', txt: 'Este navegador não compartilha áudio de aba (no computador, use Chrome ou Edge). O microfone funciona.' }),
          el('button', { type: 'button', class: 'btn sec', onclick: function () { vivo('mic'); } }, ['🎤 Microfone'])])]),
    ]));
    boxEntrada.appendChild(el('div', { class: 'lab-controles' }, [C.select('tr-comp', 'Compasso', [{ valor: '4', rotulo: '4 tempos (4/4, 2/4)' }, { valor: '3', rotulo: '3 tempos (3/4, valsa)' }], String(compasso), function (v) {
      compasso = Number(v);
      if (resultado && resultado._quadros) { resultado = analisarQuadros(resultado._quadros, resultado._taxa, resultado._hop, resultado._n); mostrar(); }
    })]));

    function progresso(p, txt) { boxProg.hidden = p == null; if (p != null) { boxProg.querySelector('progress').value = Math.round(p * 100); boxProg.querySelector('span').textContent = txt || ''; } }
    function erro(msg) { progresso(null); C.limpar(boxRes); boxRes.appendChild(el('p', { class: 'lab-erro', txt: msg })); }

    // ------------------------------------------------------ arquivo
    function doArquivo(f) {
      pararTudo();
      if (f.size > MAX_MB * 1048576) return erro('Arquivo grande demais (máx. ' + MAX_MB + ' MB).');
      nomeArq = f.name.replace(/\.[^.]+$/, '');
      progresso(0.02, 'Lendo o arquivo…');
      f.arrayBuffer().then(function (ab) {
        progresso(0.06, 'Decodificando o áudio…');
        return C.Som.audio().decodeAudioData(ab);
      }).then(function (buf) {
        if (buf.duration > MAX_S + 1) throw new Error('Música longa demais (máx. 15 minutos).');
        buffer = buf;
        var dur = Math.min(buf.duration, limite);
        var off = new (w.OfflineAudioContext || w.webkitOfflineAudioContext)(1, Math.ceil(dur * TAXA), TAXA);
        var src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start(0);
        progresso(0.1, 'Preparando…');
        return off.startRendering();
      }).then(function (mono) {
        var x = mono.getChannelData(0), an = TR.criar(TAXA), qs = [], i = 0, total = Math.max(1, Math.floor((x.length - an.n) / an.hop));
        return new Promise(function (ok) {
          (function lote() {
            var fim = Math.min(total, i + 150);
            for (; i < fim; i++) qs.push(an.quadro(x, i * an.hop));
            progresso(0.1 + 0.85 * i / total, 'Ouvindo… ' + Math.round(100 * i / total) + '%');
            if (i < total) setTimeout(lote, 0); else ok({ qs: qs, an: an });
          })();
        });
      }).then(function (r) {
        progresso(0.97, 'Montando a cifra…');
        setTimeout(function () {
          resultado = analisarQuadros(r.qs, TAXA, r.an.hop, r.an.n);
          resultado.origem = 'arquivo'; resultado.cortado = !completo && buffer.duration > limite;
          progresso(null); mostrar();
        }, 20);
      }).catch(function (e) {
        erro(/decod|Decod|EncodingError|Unable/.test(String(e && (e.name + e.message))) ? 'O navegador não conseguiu abrir este arquivo de áudio. Tente MP3, WAV ou M4A.' : (e && e.message) || 'Não consegui ler o arquivo.');
      });
    }
    function analisarQuadros(qs, taxa, hop, n) {
      var r = TR.analisar(qs, { taxa: taxa, hop: hop, n: n, compasso: compasso });
      r._quadros = qs; r._taxa = taxa; r._hop = hop; r._n = n;
      return r;
    }

    // ------------------------------------------------------ ao vivo
    var vivoEst = null;
    function vivo(tipo) {
      pararTudo();
      var pedir = tipo === 'aba'
        ? navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, preferCurrentTab: false, selfBrowserSurface: 'exclude', systemAudio: 'include' })
        : navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      pedir.then(function (stream) {
        stream.getVideoTracks().forEach(function (t) { t.stop(); });   // só o som interessa
        if (!stream.getAudioTracks().length) { stream.getTracks().forEach(function (t) { t.stop(); }); throw new Error('A aba foi compartilhada sem o áudio. Compartilhe de novo e marque “compartilhar o áudio da guia”.'); }
        // processador de áudio (não setInterval): o navegador freia timers da
        // aba em segundo plano — e o aluno vai estar na aba do YouTube. O
        // callback de áudio segue no ritmo do som, visível ou não.
        var a = C.Som.audio(), fonte = a.createMediaStreamSource(stream), an = TR.criar(a.sampleRate);
        var HOP = 4096, proc = a.createScriptProcessor(HOP, 1, 1), mudo = a.createGain(); mudo.gain.value = 0;
        fonte.connect(proc); proc.connect(mudo); mudo.connect(a.destination);
        var buf = new Float32Array(an.n), qs = [], inicio = a.currentTime, hop = HOP, total = new Float32Array(12);
        var linha = [], ultimo = null, contaIgual = 0;
        vivoEst = { stream: stream, fonte: fonte, proc: proc, mudo: mudo, qs: qs, an: an, hop: hop, taxa: a.sampleRate };
        boxVivo.hidden = false; C.limpar(boxRes);
        var agoraAc = el('div', { class: 'lab-tr-agora' }), agoraNota = el('div', { class: 'lab-tr-agora-nota' }), tomTxt = el('p', { class: 'lab-dica' }), linhaBox = el('p', { class: 'lab-tr-linha' }), tempo = el('span', {});
        C.limpar(boxVivo);
        boxVivo.appendChild(el('div', { class: 'lab-tr-vivo-cab' }, [el('strong', { txt: tipo === 'aba' ? '🖥️ Ouvindo a aba' : '🎤 Ouvindo o microfone' }), tempo,
          el('button', { type: 'button', class: 'btn', onclick: function () { pararVivo(true); } }, ['■ Parar e ver a cifra'])]));
        boxVivo.appendChild(el('div', { class: 'lab-tr-vivo-grade' }, [el('div', {}, [el('small', { txt: 'Acorde agora' }), agoraAc]), el('div', {}, [el('small', { txt: 'Nota da melodia' }), agoraNota])]));
        boxVivo.appendChild(tomTxt); boxVivo.appendChild(linhaBox);
        stream.getAudioTracks()[0].addEventListener('ended', function () { pararVivo(true); });
        proc.onaudioprocess = function (ev) {
          if (!vivoEst) return;
          var novo = ev.inputBuffer.getChannelData(0);
          buf.copyWithin(0, novo.length); buf.set(novo, buf.length - novo.length);   // janela deslizante
          var q = an.quadro(buf, 0); qs.push(q);
          var s = a.currentTime - inicio;
          tempo.textContent = ' ' + Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2) + (completo ? '' : ' de ' + limite + ' s');
          if (q.energia > 0.004) { var c0 = q.croma; for (var i = 0; i < 12; i++) total[i] += c0[i] / (Math.hypot.apply(null, c0) || 1); }
          if (qs.length % 6 === 0) {
            var cr = new Float32Array(12), gr = new Float32Array(12), e = 0;
            qs.slice(-10).forEach(function (x) { for (var k = 0; k < 12; k++) { cr[k] += x.croma[k]; gr[k] += x.grave[k]; } e += x.energia; });
            var tom = TR.tomDoCroma(total);
            if (e / 10 < 0.004) { agoraAc.textContent = '…'; }
            else {
              var ac = TR.acordeAgora(cr, gr, tom.pc, tom.modo);
              agoraAc.textContent = ac.simbolo;
              if (ultimo === ac.simbolo) { contaIgual++; if (contaIgual === 2 && linha[linha.length - 1] !== ac.simbolo) { linha.push(ac.simbolo); linhaBox.textContent = linha.slice(-24).join('  ·  '); } } else { ultimo = ac.simbolo; contaIgual = 0; }
            }
            tomTxt.textContent = qs.length > 50 ? 'Tom provável até aqui: ' + N.nome(N.ler(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][tom.pc]), { notacao: 'pt', glifo: true, oitava: false }) + ' ' + tom.modo : 'Escutando…';
          }
          agoraNota.textContent = q.melConf > 0.55 && q.energia > 0.004 ? C.nomeNota(N.deMidi(q.mel), true) : '—';
          if (s >= limite) { pararVivo(true); if (!completo) C.aviso('Sem assinatura, o Musique transcreve o primeiro minuto.'); }
        };
      }).catch(function (e) {
        boxVivo.hidden = true;
        erro(e && e.name === 'NotAllowedError' ? 'Permissão negada. Para ouvir, o navegador precisa que você autorize o compartilhamento (aba ou microfone).' : (e && e.message) || 'Não consegui começar a ouvir.');
      });
    }
    function pararVivo(analisar) {
      if (!vivoEst) return;
      var v = vivoEst; vivoEst = null;
      v.proc.onaudioprocess = null;
      try { v.fonte.disconnect(); v.proc.disconnect(); v.mudo.disconnect(); } catch (_) { /* ok */ }
      v.stream.getTracks().forEach(function (t) { t.stop(); });
      boxVivo.hidden = true;
      if (analisar && v.qs.length > 30) { buffer = null; nomeArq = 'ao-vivo'; resultado = analisarQuadros(v.qs, v.taxa, v.hop, v.an.n); resultado.origem = 'vivo'; mostrar(); }
      else if (analisar) erro('Ouvi muito pouco para transcrever. Deixe tocar pelo menos uns 10 segundos.');
    }
    function pararTudo() { pararVivo(false); pararSom(); }

    // ------------------------------------------------------ resultado
    function transpostos() {
      var r = resultado, g = TR.grafiaDoTom(r.tom.pc + transpor, r.tom.modo);
      var sim = function (a) { return a ? A.simbolo(g[((a.raiz + transpor) % 12 + 12) % 12], a.id) : '—'; };
      return { sim: sim, tomNome: N.nome(N.ler(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][((r.tom.pc + transpor) % 12 + 12) % 12]), { notacao: 'pt', glifo: true, oitava: false }) + ' ' + r.tom.modo };
    }
    function mostrar() {
      var r = resultado; C.limpar(boxRes);
      if (!r.compassos.length) { boxRes.appendChild(el('p', { class: 'lab-erro', txt: 'Não encontrei música suficiente para transcrever (silêncio ou só percussão?).' })); return; }
      var tp = transpostos();
      boxRes.appendChild(el('div', { class: 'lab-tutor-nums' }, [
        num(tp.tomNome, 'tom provável' + (r.tom.confianca < 0.3 ? ' (ou ' + r.tom.alternativa + ')' : '')), num(r.bpm ? r.bpm + ' BPM' : '—', 'andamento'),
        num(r.compasso + ' tempos', 'por compasso'), num(fmt(r.duracao), r.cortado ? 'analisados (1º minuto)' : 'de música')]));
      // ações
      var acoes = el('div', { class: 'lab-tutor-acoes' });
      if (buffer) acoes.appendChild(el('button', { type: 'button', class: 'btn', onclick: function () { ouvirOriginal(); } }, ['▶ Ouvir a música com a cifra']));
      acoes.appendChild(el('button', { type: 'button', class: 'btn sec', onclick: function () { ouvirTranscricao(true, true); } }, ['▶ Ouvir a transcrição']));
      acoes.appendChild(el('button', { type: 'button', class: 'btn sec', onclick: function () { ouvirTranscricao(false, true); } }, ['▶ Só os acordes']));
      acoes.appendChild(el('button', { type: 'button', class: 'btn sec', onclick: pararSom }, ['■ Parar']));
      boxRes.appendChild(acoes);
      boxRes.appendChild(el('div', { class: 'lab-controles' }, [
        C.select('tr-transp', 'Transpor', [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map(function (k) { return { valor: String(k), rotulo: (k > 0 ? '+' : '') + k + (k ? ' semitom' + (Math.abs(k) > 1 ? 's' : '') : ' (original)') }; }), String(transpor), function (v) { transpor = Number(v); mostrar(); })]));
      // cifra por compasso
      var grade = el('ol', { class: 'lab-tr-cifra', 'aria-label': 'Acordes por compasso' });
      r.compassos.forEach(function (c, i) {
        var li = el('li', { class: 'lab-tr-comp', 'data-i': String(i) }, [el('small', { txt: String(i + 1) })]);
        c.acordes.forEach(function (a) {
          var s = tp.sim(a.acorde);
          li.appendChild(a.acorde ? el('button', { type: 'button', class: 'lab-tr-ac', title: 'Ouvir ' + s + (a.tempos < r.compasso ? ' (' + a.tempos + ' tempo' + (a.tempos > 1 ? 's' : '') + ')' : ''), onclick: function () { ouvirAcorde(a.acorde); } }, [s]) : el('span', { class: 'lab-tr-pausa', txt: '—' }));
        });
        grade.appendChild(li);
      });
      boxRes.appendChild(el('h2', { txt: 'Cifra por compasso' }));
      boxRes.appendChild(grade);
      // acordes usados → atalhos
      var usados = {}; r.compassos.forEach(function (c) { c.acordes.forEach(function (a) { if (a.acorde) usados[tp.sim(a.acorde)] = 1; }); });
      boxRes.appendChild(el('p', { class: 'lab-dica' }, ['Acordes usados: '].concat(Object.keys(usados).map(function (s, i) { return el('a', { href: '/music/laboratorio/acorde?c=' + encodeURIComponent(s), class: 'lab-chip-btn', style: 'margin:2px' }, [s]); }))));
      // melodia
      if (r.melodia.length) {
        boxRes.appendChild(el('h2', { txt: 'Melodia (aproximada)' }));
        boxRes.appendChild(el('p', { class: 'lab-dica', txt: 'A linha que mais se destaca — voz ou solo. Com a banda inteira, erra notas e oitavas: confira de ouvido.' }));
        boxRes.appendChild(el('div', { class: 'lab-svgbox lab-tr-rolo', html: rolo(r) }));
        boxRes.appendChild(el('p', { class: 'lab-tr-notas', txt: r.melodia.slice(0, 96).map(function (n) { return C.nomeNota(N.deMidi(n.midi + transpor), true); }).join(' ') + (r.melodia.length > 96 ? ' …' : '') }));
      }
      // exportar e estudar
      var slugTom = N.slug(N.ler(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][((r.tom.pc + transpor) % 12 + 12) % 12]));
      boxRes.appendChild(el('h2', { txt: 'Levar adiante' }));
      boxRes.appendChild(el('div', { class: 'lab-tutor-acoes' }, [
        el('button', { type: 'button', class: 'btn sec', onclick: function () { copiar(); } }, ['📋 Copiar a cifra']),
        el('button', { type: 'button', class: 'btn sec', onclick: function () { baixarChordPro(); } }, ['⬇ Cifra (ChordPro)']),
        el('button', { type: 'button', class: 'btn sec', onclick: function () { baixarMidi(); } }, ['⬇ MIDI']),
        el('a', { class: 'btn sec', href: '/music/tutor-braco?t=' + slugTom + '&x=pentatonica&e=' + (r.tom.modo === 'menor' ? 'pentatonica-menor' : 'pentatonica-maior') }, ['🎸 Estudar a escala no Tutor de braço']),
        el('a', { class: 'btn sec', href: '/music/laboratorio/tom?t=' + encodeURIComponent(N.nome(N.ler(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][((r.tom.pc + transpor) % 12 + 12) % 12])) + (r.tom.modo === 'menor' ? 'm' : '')) }, ['🗝️ Ver o tom e o campo harmônico'])]));
      if (!st.exportar) boxRes.appendChild(el('p', { class: 'lab-dica', txt: 'Baixar a cifra e o MIDI faz parte da assinatura. Copiar e ver são livres.' }));
    }
    function num(v, rot) { return el('div', { class: 'lab-tutor-num' }, [el('strong', { txt: v }), el('small', { txt: rot })]); }
    function fmt(s) { return Math.floor(s / 60) + ':' + ('0' + Math.round(s % 60)).slice(-2); }

    function rolo(r) {
      var ms = r.melodia, lo = 127, hi = 0; ms.forEach(function (n) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); });
      lo -= 1; hi += 1;
      var pxS = 60, alt = 7, W = Math.max(300, Math.ceil(r.duracao * pxS) + 20), H = (hi - lo + 1) * alt + 20, s = '';
      r.compassos.forEach(function (c, i) { var x = c.inicio * pxS; s += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="0" y2="' + H + '" class="tr-bar"/>' + '<text x="' + (x + 2).toFixed(1) + '" y="10" class="tr-num">' + (i + 1) + '</text>'; });
      for (var m = lo; m <= hi; m++) if (m % 12 === 0) s += '<text x="2" y="' + ((hi - m) * alt + 20 + 6) + '" class="tr-num">' + C.nomeNota(N.deMidi(m + transpor), true) + '</text>';
      ms.forEach(function (n) { s += '<rect class="tr-nota" x="' + (n.t * pxS).toFixed(1) + '" y="' + ((hi - n.midi) * alt + 20) + '" width="' + Math.max(2, n.dur * pxS - 1).toFixed(1) + '" height="' + (alt - 1) + '" rx="1.5"><title>' + C.nomeNota(N.deMidi(n.midi + transpor), true) + '</title></rect>'; });
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Melodia transcrita em rolo de piano">' + s + '</svg>';
    }

    // ------------------------------------------------------------ som
    function notasDoAcorde(a) {
      var f = N.comOitava(N.deClasse(((a.raiz + transpor) % 12 + 12) % 12), 3);
      return (A.notas(f, a.id) || []).map(N.midi);
    }
    function ouvirAcorde(a) { C.Som.tocar(notasDoAcorde(a), { modo: 'dedilhado', dur: 1.4 }); }
    function pararSom() {
      if (tocando) { try { tocando.parar(); } catch (_) { /* ok */ } tocando = null; }
      C.$$('.lab-tr-comp.agora', boxRes).forEach(function (x) { x.classList.remove('agora'); });
    }
    function acompanhar(t0, fim) {
      var a = C.Som.audio(), ult = -1;
      var id = setInterval(function () {
        var t = a.currentTime - t0, i = -1;
        resultado.compassos.forEach(function (c, k) { if (t >= c.inicio && t < c.fim) i = k; });
        if (i !== ult) { C.$$('.lab-tr-comp', boxRes).forEach(function (x, k) { x.classList.toggle('agora', k === i); }); var li = C.$('.lab-tr-comp[data-i="' + i + '"]', boxRes); if (li && li.scrollIntoView && i >= 0) li.scrollIntoView({ block: 'nearest' }); ult = i; }
        if (t > fim) pararSom();
      }, 60);
      return function () { clearInterval(id); };
    }
    function ouvirOriginal() {
      pararSom();
      var a = C.Som.audio(), src = a.createBufferSource(); src.buffer = buffer; src.connect(C.Som.saida());
      var t0 = a.currentTime + 0.05; src.start(t0); if (C.Som.registrar) C.Som.registrar(src);
      var fimAc = acompanhar(t0, Math.min(buffer.duration, resultado.cortado ? limite : buffer.duration));
      tocando = { parar: function () { fimAc(); try { src.stop(); } catch (_) { /* ok */ } } };
    }
    function ouvirTranscricao(comMelodia, comAcordes) {
      pararSom();
      var a = C.Som.audio(), t0 = a.currentTime + 0.1, r = resultado;
      var tb = r.bpm ? 60 / r.bpm : 0.5;
      if (comAcordes) r.compassos.forEach(function (c) {
        var t = c.inicio;
        c.acordes.forEach(function (x) { if (x.acorde) notasDoAcorde(x.acorde).forEach(function (m) { C.Som.voz(C.Som.FREQ(m), t0 + t, x.tempos * tb * 0.95, { timbre: 'orgao', vel: 0.05 }); }); t += x.tempos * tb; });
      });
      if (comMelodia) r.melodia.forEach(function (n) { C.Som.voz(C.Som.FREQ(n.midi + transpor), t0 + n.t, Math.max(0.1, n.dur), { timbre: 'malete', vel: 0.22 }); });
      var fimAc = acompanhar(t0, r.duracao);
      tocando = { parar: function () { fimAc(); C.Som.parar(); } };
    }

    // ------------------------------------------------------- exportar
    function textoCifra() {
      var tp = transpostos(), linhas = [], atual = [];
      resultado.compassos.forEach(function (c) {
        atual.push(' ' + c.acordes.map(function (a) { return tp.sim(a.acorde); }).join(' ') + ' ');
        if (atual.length === 4) { linhas.push('|' + atual.join('|') + '|'); atual = []; }
      });
      if (atual.length) linhas.push('|' + atual.join('|') + '|');
      return 'Tom: ' + tp.tomNome + ' · ' + (resultado.bpm || '?') + ' BPM · ' + resultado.compasso + ' tempos por compasso\n' + linhas.join('\n') + '\n(Transcrição automática do Musique — indicação de estudo; confira de ouvido.)';
    }
    function copiar() {
      var t = textoCifra();
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { C.aviso('Cifra copiada.'); }).catch(function () { w.prompt('Copie a cifra:', t); });
    }
    function exigeAssinatura() { if (st.exportar) return false; C.aviso('Baixar a cifra e o MIDI faz parte da assinatura do Musique.', 'erro'); return true; }
    function baixarChordPro() {
      if (exigeAssinatura()) return;
      var tp = transpostos(), r = resultado;
      var cp = ['{title: ' + (nomeArq || 'Transcrição') + '}', '{key: ' + tp.sim({ raiz: r.tom.pc, id: r.tom.modo === 'menor' ? 'menor' : 'maior' }) + '}', '{tempo: ' + (r.bpm || '') + '}', '{time: ' + r.compasso + '/4}', '{comment: Transcrição automática do Musique — confira de ouvido}', ''];
      var linha = [];
      r.compassos.forEach(function (c, i) {
        linha.push(c.acordes.map(function (a) { return '[' + tp.sim(a.acorde) + ']'; }).join(' ') + '  ');
        if ((i + 1) % 4 === 0) { cp.push(linha.join('| ')); linha = []; }
      });
      if (linha.length) cp.push(linha.join('| '));
      C.baixar((nomeArq || 'transcricao') + '.cho', 'text/plain', cp.join('\n') + '\n');
    }
    function baixarMidi() {
      if (exigeAssinatura()) return;
      if (!C.midiArquivo) return C.aviso('Exportação MIDI indisponível.', 'erro');
      var r = resultado, bpm = r.bpm || 120, porSeg = bpm / 60 * 4, ev = [];   // 4 passos por semínima
      r.compassos.forEach(function (c) {
        var t = c.inicio, tb = 60 / bpm;
        c.acordes.forEach(function (x) { if (x.acorde) notasDoAcorde(x.acorde).forEach(function (m) { ev.push({ t: Math.round(t * porSeg), dur: Math.max(1, Math.round(x.tempos * 4) - 1), midi: m, canal: 1, vel: 60 }); }); t += x.tempos * tb; });
      });
      r.melodia.forEach(function (n) { ev.push({ t: Math.round(n.t * porSeg), dur: Math.max(1, Math.round(n.dur * porSeg)), midi: n.midi + transpor, canal: 0, vel: 96 }); });
      C.baixar((nomeArq || 'transcricao') + '.mid', 'audio/midi', C.midiArquivo(ev, bpm, 4));
    }

  };
})(window, document);
