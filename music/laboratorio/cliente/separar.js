// =====================================================================
// Musique · Laboratório — cliente · SEPARAR TRILHAS (30/09/2026).
//
// Arquivo → decodeAudioData → estéreo 44,1 kHz (OfflineAudioContext) →
// worker (`/music/separar-worker.js`, HT-Demucs 6 fontes no navegador) →
// 6 AudioBuffers → mixer: tocar/mudo, solo e volume por trilha, receitas
// prontas (karaokê, sem bateria…), play/pausa/posição e baixar em WAV.
// O áudio não sai do aparelho.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, S = L.separacao;
  var el = C.el;
  var MAX_MB = 150;

  C.ferramentas['separar'] = function (alvo, st) {
    var completo = !!st.completo, maxS = completo ? (st.max_min || 8) * 60 : (st.demo_s || 60);
    var worker = null, fontes = [], estado = S.FONTES.map(function () { return { mudo: false, solo: false, volume: 1 }; });
    var ganhosNos = [], fontesNos = [], tocandoDesde = null, posicao = 0, duracao = 0, nomeArq = '', timerPos = null, cortado = false;

    C.limpar(alvo);
    var boxEntrada = el('section', { class: 'lab-sep-entrada' });
    var boxProg = el('div', { class: 'lab-tr-prog', hidden: true }, [el('progress', { max: 100, value: 0 }), el('span', { txt: '' })]);
    var boxInfo = el('p', { class: 'lab-dica', 'aria-live': 'polite' });
    var boxMixer = el('section', { class: 'lab-sep-mixer', hidden: true });
    [boxEntrada, boxProg, boxInfo, boxMixer].forEach(function (x) { alvo.appendChild(x); });

    // ---------------------------------------------------- aparelho
    var semGpu = !(navigator.gpu), celular = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    var memoria = navigator.deviceMemory || 0;
    var avisos = [];
    if (celular) avisos.push('No celular a separação é pesada: funciona melhor num computador. Se a página fechar sozinha, é falta de memória — tente uma música mais curta.');
    else if (semGpu) avisos.push('Este navegador não oferece WebGPU: a separação vai rodar só no processador e pode levar alguns minutos por música (Chrome e Edge atuais usam a placa de vídeo).');
    if (memoria && memoria < 4) avisos.push('Este aparelho tem pouca memória para a separação; músicas longas podem falhar.');

    var inp = el('input', { id: 'sep-arq', type: 'file', accept: 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm', class: 'sr', onchange: function () { if (inp.files[0]) iniciar(inp.files[0]); } });
    var zona = el('label', { for: 'sep-arq', class: 'lab-tr-zona' }, [el('strong', { txt: '📁 Escolher uma música' }), el('span', { txt: 'ou arraste para cá — MP3, WAV, M4A, OGG, FLAC (até ' + (completo ? (st.max_min || 8) + ' minutos' : '1 minuto sem assinatura') + ')' })]);
    ['dragover', 'dragenter'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('sobre'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('sobre'); if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files[0]) iniciar(e.dataTransfer.files[0]); }); });
    boxEntrada.appendChild(el('div', { class: 'lab-tr-cartao' }, [inp, zona]));
    avisos.forEach(function (a) { boxEntrada.appendChild(el('p', { class: 'lab-nota-convencao', txt: a })); });

    function progresso(p, txt) { boxProg.hidden = p == null; if (p != null) { boxProg.querySelector('progress').value = Math.round(p * 100); boxProg.querySelector('span').textContent = txt || ''; } }
    function erro(msg) { progresso(null); boxInfo.textContent = ''; boxInfo.appendChild(el('strong', { class: 'lab-erro', txt: msg })); }
    function mb(b) { return Math.round(b / 1e6) + ' MB'; }
    function fmt(s) { s = Math.max(0, s); return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2); }

    // ---------------------------------------------------- modelo
    function oWorker() {
      if (worker) return worker;
      worker = new Worker('/music/separar-worker.js');
      return worker;
    }
    function modeloNoCache() {
      if (!w.caches) return Promise.resolve(false);
      return w.caches.open('musique-modelos-v1').then(function (c) { return c.match(S.MODELO.url); }).then(function (r) { return !!r; }).catch(function () { return false; });
    }

    // ---------------------------------------------------- fluxo
    function iniciar(f) {
      parar(); C.limpar(boxInfo); boxMixer.hidden = true;
      if (f.size > MAX_MB * 1048576) return erro('Arquivo grande demais (máx. ' + MAX_MB + ' MB).');
      nomeArq = f.name.replace(/\.[^.]+$/, '');
      modeloNoCache().then(function (tem) {
        if (!tem && !w.confirm('Na primeira vez o Musique baixa o modelo de separação (' + mb(S.MODELO.bytes) + '), que fica guardado neste navegador. No celular, prefira o Wi-Fi. Baixar agora?')) { progresso(null); return null; }
        progresso(0.01, 'Lendo o arquivo…');
        return f.arrayBuffer();
      }).then(function (ab) {
        if (!ab) return null;
        return C.Som.audio().decodeAudioData(ab);
      }).then(function (buf) {
        if (!buf) return null;
        if (buf.duration > (st.max_min || 8) * 60 + 1 && completo) throw new Error('Música longa demais (máx. ' + (st.max_min || 8) + ' minutos).');
        cortado = buf.duration > maxS;
        var dur = Math.min(buf.duration, maxS);
        var off = new (w.OfflineAudioContext || w.webkitOfflineAudioContext)(2, Math.ceil(dur * S.TAXA), S.TAXA);
        var src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start(0);
        progresso(0.02, 'Preparando o áudio…');
        return off.startRendering();
      }).then(function (est) {
        if (!est) return;
        duracao = est.duration;
        var esq = new Float32Array(est.getChannelData(0)), dir = new Float32Array(est.numberOfChannels > 1 ? est.getChannelData(1) : est.getChannelData(0));
        rodar(esq, dir);
      }).catch(function (e) {
        erro(/decod|Decod|EncodingError|Unable/.test(String(e && (e.name + e.message))) ? 'O navegador não conseguiu abrir este arquivo de áudio. Tente MP3, WAV ou M4A.' : (e && e.message) || 'Não consegui ler o arquivo.');
      });
    }

    function rodar(esq, dir) {
      var wk = oWorker(), t0 = Date.now(), recebidas = [];
      wk.onerror = function (e) { erro('A separação parou: ' + ((e && e.message) || 'erro no navegador') + '. Recarregue a página e tente de novo.'); };
      wk.onmessage = function (ev) {
        var m = ev.data || {};
        if (m.tipo === 'baixando') progresso(0.03 + 0.37 * m.feito / m.total, m.doCache ? 'Modelo guardado neste navegador.' : 'Baixando o modelo: ' + mb(m.feito) + ' de ' + mb(m.total));
        else if (m.tipo === 'pronto') { progresso(0.41, 'Modelo carregado (' + (m.motor === 'webgpu' ? 'placa de vídeo' : 'processador') + '). Separando…'); boxInfo.textContent = 'Separando com ' + (m.motor === 'webgpu' ? 'a placa de vídeo (WebGPU)' : 'o processador') + '.'; wk.postMessage({ tipo: 'separar', esq: esq, dir: dir }, [esq.buffer, dir.buffer]); }
        else if (m.tipo === 'progresso') {
          var resta = m.i ? (m.ms / m.i) * (m.n - m.i) / 1000 : 0;
          progresso(0.41 + 0.57 * m.i / m.n, 'Separando: trecho ' + m.i + ' de ' + m.n + (m.i ? ' · falta ~' + fmt(resta) : ''));
        }
        else if (m.tipo === 'fonte') { recebidas[m.f] = [m.esq, m.dir]; }
        else if (m.tipo === 'fim') { fontes = recebidas; progresso(null); montarMixer(Date.now() - t0); }
        else if (m.tipo === 'erro') erro(m.msg);
      };
      progresso(0.03, 'Abrindo o modelo…');
      wk.postMessage({ tipo: 'preparar' });
    }

    // ---------------------------------------------------- mixer
    var buffers = [];
    function montarMixer(ms) {
      var a = C.Som.audio();
      // resumo para suporte e conferência: energia de cada trilha (total e
      // abaixo de ~150 Hz) — só números, nada de áudio
      C.separacaoUltima = { ms: ms, duracao: duracao, trilhas: fontes.map(function (fc, f) {
        var e = 0, eg = 0, lp = 0, a1 = Math.exp(-2 * Math.PI * 150 / S.TAXA), x = fc[0];
        for (var k = 0; k < x.length; k++) { e += x[k] * x[k]; lp = (1 - a1) * x[k] + a1 * lp; eg += lp * lp; }
        return { id: S.FONTES[f].id, rms: +Math.sqrt(e / x.length).toFixed(4), graves: +(e ? eg / e : 0).toFixed(2) };
      }) };
      buffers = fontes.map(function (fc) { var b = a.createBuffer(2, fc[0].length, S.TAXA); b.copyToChannel(fc[0], 0); b.copyToChannel(fc[1], 1); return b; });
      C.limpar(boxMixer); boxMixer.hidden = false; posicao = 0;
      boxInfo.textContent = 'Pronto: separado em ' + Math.round(ms / 1000) + ' s' + (cortado ? ' (o primeiro minuto — a música inteira é da assinatura)' : '') + '.';
      var btPlay = el('button', { type: 'button', class: 'btn', onclick: function () { tocandoDesde ? pausar() : tocar(posicao); } }, ['▶ Tocar']);
      var barra = el('input', { type: 'range', min: 0, max: Math.floor(duracao * 10), value: 0, 'aria-label': 'Posição na música', oninput: function () { var p = Number(barra.value) / 10; if (tocandoDesde) tocar(p); else { posicao = p; tempo.textContent = fmt(p) + ' / ' + fmt(duracao); } } });
      var tempo = el('span', { class: 'lab-sep-tempo', txt: '0:00 / ' + fmt(duracao) });
      boxMixer.appendChild(el('div', { class: 'lab-sep-transporte' }, [btPlay, el('button', { type: 'button', class: 'btn sec', onclick: function () { var p = Math.max(0, atual() - 5); tocandoDesde ? tocar(p) : (posicao = p); } }, ['⟲ 5 s']), barra, tempo]));
      boxMixer.appendChild(el('div', { class: 'lab-sep-receitas' }, [el('span', { class: 'lab-dica', txt: 'Receitas: ' })].concat(S.RECEITAS.map(function (r) {
        return el('button', { type: 'button', class: 'lab-chip-btn', onclick: function () { r.ganhos.forEach(function (g, f) { estado[f].mudo = !g; estado[f].solo = false; }); pintarLinhas(); aplicar(); } }, [r.nome]);
      }))));
      var lista = el('div', { class: 'lab-sep-linhas' });
      boxMixer.appendChild(lista);
      function pintarLinhas() {
        C.limpar(lista);
        S.FONTES.forEach(function (fo, f) {
          var e = estado[f];
          var bMudo = el('button', { type: 'button', class: 'lab-sep-bt' + (e.mudo ? ' fora' : ' dentro'), 'aria-pressed': e.mudo ? 'false' : 'true', onclick: function () { e.mudo = !e.mudo; pintarLinhas(); aplicar(); } }, [e.mudo ? '✕ fora' : '✓ tocando']);
          var bSolo = el('button', { type: 'button', class: 'lab-sep-bt' + (e.solo ? ' solo' : ''), 'aria-pressed': e.solo ? 'true' : 'false', title: 'Ouvir só esta (e as outras em solo)', onclick: function () { e.solo = !e.solo; pintarLinhas(); aplicar(); } }, ['S']);
          var vol = el('input', { type: 'range', min: 0, max: 150, value: Math.round(e.volume * 100), 'aria-label': 'Volume de ' + fo.nome, oninput: function () { e.volume = Number(vol.value) / 100; aplicar(); } });
          var bBaixar = el('button', { type: 'button', class: 'lab-sep-bt', title: 'Baixar esta trilha em WAV', onclick: function () { baixar([f]); } }, ['⬇']);
          lista.appendChild(el('div', { class: 'lab-sep-linha' + (ganhosAgora()[f] ? '' : ' calada') }, [el('span', { class: 'lab-sep-nome' }, [el('span', { 'aria-hidden': 'true', txt: fo.icone + ' ' }), fo.curto || fo.nome]), bMudo, bSolo, vol, bBaixar]));
        });
      }
      pintarLinhas();
      boxMixer.appendChild(el('div', { class: 'lab-tutor-acoes' }, [
        el('button', { type: 'button', class: 'btn sec', onclick: function () { baixar(null); } }, ['⬇ Baixar o que está tocando (WAV)']),
        el('a', { class: 'btn sec', href: '/music/transcrever' }, ['🎧 Transcrever os acordes']),
        el('a', { class: 'btn sec', href: '/music/criar/metronomo-progressivo' }, ['⏱️ Metrônomo'])]));
      if (!st.exportar) boxMixer.appendChild(el('p', { class: 'lab-dica', txt: 'Baixar as trilhas faz parte da assinatura. Separar e ouvir são livres no primeiro minuto.' }));

      function atual() { return tocandoDesde ? Math.min(duracao, posicao + C.Som.audio().currentTime - tocandoDesde) : posicao; }
      timerPos = setInterval(function () {
        if (!tocandoDesde) return;
        var p = atual(); barra.value = Math.floor(p * 10); tempo.textContent = fmt(p) + ' / ' + fmt(duracao);
        if (p >= duracao - 0.02) { pausar(); posicao = 0; barra.value = 0; }
      }, 200);
      function tocar(de) {
        pararFontes();
        var a2 = C.Som.audio(), t = a2.currentTime + 0.05, g = ganhosAgora();
        ganhosNos = []; fontesNos = [];
        buffers.forEach(function (b, f) {
          var src = a2.createBufferSource(), gn = a2.createGain(); src.buffer = b; gn.gain.value = g[f];
          src.connect(gn); gn.connect(C.Som.saida()); src.start(t, Math.min(de, b.duration - 0.01));
          if (C.Som.registrar) C.Som.registrar(src);
          ganhosNos.push(gn); fontesNos.push(src);
        });
        posicao = de; tocandoDesde = t; btPlay.textContent = '⏸ Pausar';
      }
      function pausar() { posicao = atual(); pararFontes(); tocandoDesde = null; btPlay.textContent = '▶ Tocar'; }
      pausarExterno = pausar;
    }
    var pausarExterno = null;
    function ganhosAgora() { return S.ganhosEfetivos(estado); }
    function aplicar() {
      var g = ganhosAgora(), a = C.Som.audio();
      ganhosNos.forEach(function (gn, f) { gn.gain.setTargetAtTime(g[f], a.currentTime, 0.02); });
      C.$$('.lab-sep-linha', boxMixer).forEach(function (li, f) { li.classList.toggle('calada', !g[f]); });
    }
    function pararFontes() { fontesNos.forEach(function (s) { try { s.stop(); } catch (_) { /* já parou */ } }); fontesNos = []; ganhosNos = []; }
    function parar() { if (pausarExterno) pausarExterno(); pararFontes(); tocandoDesde = null; clearInterval(timerPos); }

    function baixar(quais) {
      if (!st.exportar) return C.aviso('Baixar as trilhas faz parte da assinatura do Musique.', 'erro');
      var g = quais ? S.FONTES.map(function (_, f) { return quais.indexOf(f) >= 0 ? 1 : 0; }) : ganhosAgora();
      var mx = S.mixar(fontes, g);
      var nome = (nomeArq || 'musica') + (quais ? '-' + S.FONTES[quais[0]].id : '-mix') + '.wav';
      C.baixar(nome, 'audio/wav', S.wav(mx[0], mx[1], S.TAXA));
    }
  };
})(window, document);
