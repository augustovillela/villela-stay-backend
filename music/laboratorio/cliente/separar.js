// =====================================================================
// Musique · Laboratório — cliente · SEPARAR TRILHAS, em ETAPAS.
//
// Refeito em 30/09/2026 (a 1ª versão congelou um notebook com placa de
// vídeo integrada). Ideia do Augusto: cada coisa no seu passo, e a
// separação pesada só no fim, depois de o aluno ver quanto vai levar.
//   1. Arquivo   — só lê: nome, duração, formato. Nada pesado.
//   2. Aparelho  — `separacao.aparelho()` decide placa × processador e o limite.
//   3. Modelo    — baixa (uma vez) e carrega, com confirmação.
//   4. Teste     — separa 7,8 s, toca o resultado e ESTIMA a música inteira.
//   5. Separar   — a música, com folga entre trechos e "Parar" que corta na hora.
// Depois: mixer (tocar/fora, solo, volume, receitas) e WAV (assinatura).
// O áudio não sai do aparelho.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, S = L.separacao;
  var el = C.el;
  var MAX_MB = 150;

  C.ferramentas['separar'] = function (alvo, st) {
    var completo = !!st.completo;
    var arq = null, audio = null, ap = null, worker = null, pronto = false, teste = null, buffers = [], cortado = false, nomeArq = '';
    var etapa = 1, ocupado = false;

    C.limpar(alvo);
    var passos = el('ol', { class: 'lab-sep-passos', 'aria-label': 'Etapas' });
    var caixa = el('section', { class: 'lab-sep-etapa', 'aria-live': 'polite' });
    var boxMixer = el('section', { class: 'lab-sep-mixer', hidden: true });
    [passos, caixa, boxMixer].forEach(function (x) { alvo.appendChild(x); });
    var NOMES = ['Arquivo', 'Aparelho', 'Modelo', 'Teste', 'Separar'];

    function pintarPassos() {
      C.limpar(passos);
      NOMES.forEach(function (n, i) { passos.appendChild(el('li', { class: 'lab-sep-passo' + (i + 1 < etapa ? ' feito' : i + 1 === etapa ? ' atual' : ''), 'aria-current': i + 1 === etapa ? 'step' : null }, [el('span', { txt: String(i + 1) }), ' ' + n])); });
    }
    function ir(n) { etapa = n; pintarPassos(); C.limpar(caixa); ({ 1: e1, 2: e2, 3: e3, 4: e4, 5: e5 })[n](); }
    function mb(b) { return Math.round(b / 1e6) + ' MB'; }
    function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
    function tempoLongo(ms) { var m = Math.round(ms / 60000); return m < 1 ? 'menos de 1 minuto' : m === 1 ? 'cerca de 1 minuto' : 'cerca de ' + m + ' minutos'; }
    function erro(msg) { caixa.appendChild(el('p', { class: 'lab-erro', txt: msg })); }
    function barra() { var b = el('div', { class: 'lab-tr-prog' }, [el('progress', { max: 100, value: 0 }), el('span', { txt: '' })]); caixa.appendChild(b); return function (p, t) { b.querySelector('progress').value = Math.round(p * 100); b.querySelector('span').textContent = t || ''; }; }
    function matarWorker() { if (worker) { try { worker.terminate(); } catch (_) { /* ok */ } } worker = null; pronto = false; }

    // ---------------------------------------------------- 1. arquivo
    function e1() {
      caixa.appendChild(el('h2', { txt: '1. Escolha a música' }));
      caixa.appendChild(el('p', { class: 'lab-dica', txt: 'Nesta etapa o Musique só lê o arquivo — nada pesado ainda. MP3, WAV, M4A, OGG ou FLAC.' }));
      var inp = el('input', { id: 'sep-arq', type: 'file', accept: 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm', class: 'sr', onchange: function () { if (inp.files[0]) ler(inp.files[0]); } });
      var zona = el('label', { for: 'sep-arq', class: 'lab-tr-zona' }, [el('strong', { txt: '📁 Escolher uma música' }), el('span', { txt: 'ou arraste para cá' })]);
      ['dragover', 'dragenter'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('sobre'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('sobre'); if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files[0]) ler(e.dataTransfer.files[0]); }); });
      caixa.appendChild(el('div', { class: 'lab-tr-cartao' }, [inp, zona]));
      var info = el('div', { class: 'lab-sep-info' }); caixa.appendChild(info);
      function ler(f) {
        C.limpar(info);
        if (f.size > MAX_MB * 1048576) return info.appendChild(el('p', { class: 'lab-erro', txt: 'Arquivo grande demais (máx. ' + MAX_MB + ' MB).' }));
        info.appendChild(el('p', { txt: 'Lendo ' + f.name + '…' }));
        f.arrayBuffer().then(function (ab) { return C.Som.audio().decodeAudioData(ab); }).then(function (buf) {
          arq = f; audio = buf; nomeArq = f.name.replace(/\.[^.]+$/, ''); teste = null;
          C.limpar(info);
          info.appendChild(el('ul', { class: 'lab-sep-fatos' }, [
            el('li', {}, [el('strong', { txt: 'Arquivo: ' }), f.name + ' (' + mb(f.size) + ')']),
            el('li', {}, [el('strong', { txt: 'Duração: ' }), fmt(buf.duration)]),
            el('li', {}, [el('strong', { txt: 'Formato: ' }), (buf.numberOfChannels > 1 ? 'estéreo' : 'mono')])]));
          info.appendChild(el('button', { type: 'button', class: 'btn', onclick: function () { ir(2); } }, ['Continuar →']));
        }).catch(function () { C.limpar(info); info.appendChild(el('p', { class: 'lab-erro', txt: 'O navegador não conseguiu abrir este arquivo de áudio. Tente MP3, WAV ou M4A.' })); });
      }
    }

    // ---------------------------------------------------- 2. aparelho
    function e2() {
      caixa.appendChild(el('h2', { txt: '2. Verificar este computador' }));
      var info = el('div', { class: 'lab-sep-info', txt: 'Verificando…' }); caixa.appendChild(info);
      var gpu = navigator.gpu ? navigator.gpu.requestAdapter().then(function (ad) { return ad ? (ad.info || {}) : null; }).catch(function () { return null; }) : Promise.resolve(null);
      gpu.then(function (g) {
        ap = S.aparelho({ gpu: g ? { vendor: g.vendor, architecture: g.architecture, description: g.description } : null, nucleos: navigator.hardwareConcurrency, memoriaGB: navigator.deviceMemory, celular: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || ''), isolado: !!w.crossOriginIsolated });
        C.limpar(info);
        if (!ap.pode) { info.appendChild(el('p', { class: 'lab-erro', txt: ap.motivo })); info.appendChild(el('button', { type: 'button', class: 'btn sec', onclick: function () { ir(1); } }, ['← Voltar'])); return; }
        var limite = completo ? ap.maxMinutos * 60 : Math.min(ap.maxMinutos * 60, st.demo_s || 60);
        cortado = audio.duration > limite;
        info.appendChild(el('ul', { class: 'lab-sep-fatos' }, [
          el('li', {}, [el('strong', { txt: 'Placa de vídeo: ' }), ap.placa === 'dedicada' ? 'com folga para a separação (' + ((g && (g.description || g.vendor)) || 'detectada') + ')' : ap.placa === 'integrada' ? 'integrada (' + ((g && (g.description || g.vendor)) || 'detectada') + ') — não será usada' : 'não disponível neste navegador']),
          el('li', {}, [el('strong', { txt: 'Vai usar: ' }), ap.motor === 'webgpu' ? 'a placa de vídeo' : 'o processador, com ' + ap.threads + ' núcleo' + (ap.threads > 1 ? 's' : '') + ' (de ' + (navigator.hardwareConcurrency || '?') + ')']),
          el('li', {}, [el('strong', { txt: 'Limite: ' }), fmt(limite) + (cortado ? ' — a música tem ' + fmt(audio.duration) + ': será separado só o começo' + (completo ? '' : ' (o primeiro minuto, sem assinatura)') : '')])]));
        ap.avisos.forEach(function (a) { info.appendChild(el('p', { class: 'lab-nota-convencao', txt: a })); });
        ap.limiteS = limite;
        info.appendChild(el('div', { class: 'lab-tutor-acoes' }, [el('button', { type: 'button', class: 'btn sec', onclick: function () { ir(1); } }, ['← Outra música']), el('button', { type: 'button', class: 'btn', onclick: function () { ir(3); } }, ['Continuar →'])]));
      });
    }

    // ---------------------------------------------------- 3. modelo
    function e3() {
      caixa.appendChild(el('h2', { txt: '3. Preparar a inteligência artificial' }));
      if (pronto) { caixa.appendChild(el('p', { txt: 'Modelo já carregado.' })); caixa.appendChild(el('button', { type: 'button', class: 'btn', onclick: function () { ir(4); } }, ['Continuar →'])); return; }
      var info = el('div', { class: 'lab-sep-info' }); caixa.appendChild(info);
      var noCache = w.caches ? w.caches.open('musique-modelos-v1').then(function (c) { return c.match(S.MODELO.url); }).then(Boolean).catch(function () { return false; }) : Promise.resolve(false);
      noCache.then(function (tem) {
        info.appendChild(el('p', { txt: tem ? 'O modelo já está guardado neste navegador: é só carregar.' : 'Na primeira vez o navegador baixa o modelo (' + mb(S.MODELO.bytes) + ') e o guarda — nas próximas, carrega na hora. Prefira o Wi-Fi.' }));
        info.appendChild(el('p', { class: 'lab-dica', txt: 'Modelo: ' + S.MODELO.nome + '.' }));
        info.appendChild(el('button', { type: 'button', class: 'btn', onclick: function () { carregar(); } }, [tem ? 'Carregar o modelo' : 'Baixar e carregar (' + mb(S.MODELO.bytes) + ')']));
      });
      function carregar() {
        C.limpar(info); var pb = barra();
        matarWorker();
        worker = new Worker('/music/separar-worker.js');
        worker.onerror = function (e) { erro('A preparação parou: ' + ((e && e.message) || 'erro no navegador') + '.'); };
        worker.onmessage = function (ev) {
          var m = ev.data || {};
          if (m.tipo === 'baixando') pb(m.feito / m.total * 0.9, m.doCache ? 'Lendo o modelo guardado…' : 'Baixando: ' + mb(m.feito) + ' de ' + mb(m.total));
          else if (m.tipo === 'pronto') { pronto = true; ap.motor = m.motor; ap.threads = m.threads; pb(1, 'Pronto (' + (m.motor === 'webgpu' ? 'placa de vídeo' : 'processador, ' + m.threads + ' núcleo' + (m.threads > 1 ? 's' : '')) + ').'); caixa.appendChild(el('button', { type: 'button', class: 'btn', onclick: function () { ir(4); } }, ['Continuar →'])); }
          else if (m.tipo === 'erro') erro(m.msg);
        };
        pb(0.01, 'Abrindo…');
        worker.postMessage({ tipo: 'preparar', motor: ap.motor, threads: ap.threads });
      }
    }

    // ---------------------------------------------------- áudio em 44,1 kHz
    function estereo(ateS) {
      var dur = Math.min(audio.duration, ateS);
      var off = new (w.OfflineAudioContext || w.webkitOfflineAudioContext)(2, Math.ceil(dur * S.TAXA), S.TAXA);
      var src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start(0);
      return off.startRendering().then(function (b) { return [new Float32Array(b.getChannelData(0)), new Float32Array(b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0))]; });
    }

    // ---------------------------------------------------- 4. teste
    function e4() {
      caixa.appendChild(el('h2', { txt: '4. Teste com 8 segundos' }));
      caixa.appendChild(el('p', { class: 'lab-dica', txt: 'O Musique separa só um trecho de 8 segundos, toca o resultado e calcula quanto a música inteira vai levar neste computador. Você decide se continua.' }));
      var info = el('div', { class: 'lab-sep-info' }); caixa.appendChild(info);
      if (teste) return mostrarTeste();
      var bt = el('button', { type: 'button', class: 'btn', onclick: function () { rodar(); } }, ['Fazer o teste']);
      info.appendChild(bt);
      function rodar() {
        C.limpar(info); info.appendChild(el('p', { txt: 'Separando o trecho de teste… (no processador pode levar até um minuto)' }));
        var parar = el('button', { type: 'button', class: 'btn sec', onclick: function () { matarWorker(); C.limpar(info); info.appendChild(el('p', { txt: 'Teste interrompido. O modelo será carregado de novo (do cache) quando você continuar.' })); info.appendChild(el('button', { type: 'button', class: 'btn', onclick: function () { ir(3); } }, ['Recarregar o modelo'])); } }, ['■ Parar']);
        info.appendChild(parar);
        estereo(audio.duration).then(function (lr) {
          var t = S.trechoDeTeste(lr[0].length);
          var esq = lr[0].slice(t.ini, t.fim), dir = lr[1].slice(t.ini, t.fim);
          worker.onmessage = function (ev) {
            var m = ev.data || {};
            if (m.tipo === 'teste') { teste = { ms: m.ms, fontes: m.fontes }; C.limpar(info); mostrarTeste(); }
            else if (m.tipo === 'erro') erro(m.msg);
          };
          worker.postMessage({ tipo: 'testar', esq: esq, dir: dir }, [esq.buffer, dir.buffer]);
        });
      }
      function mostrarTeste() {
        var totalAmostras = Math.ceil(Math.min(audio.duration, ap.limiteS) * S.TAXA);
        var est = S.estimar(totalAmostras, teste.ms, ap.pausaMs);
        var lento = teste.ms > 60000;
        info.appendChild(el('ul', { class: 'lab-sep-fatos' }, [
          el('li', {}, [el('strong', { txt: 'O trecho de teste levou: ' }), (teste.ms / 1000).toFixed(1) + ' s']),
          el('li', {}, [el('strong', { txt: 'A música inteira (' + fmt(totalAmostras / S.TAXA) + ') vai levar: ' }), tempoLongo(est.ms) + ' (' + est.trechos + ' trechos)'])]));
        if (ap.motor === 'webgpu' && teste.ms > S.LIMITES.gpuMaxMsTrecho) info.appendChild(el('p', { class: 'lab-nota-convencao', txt: 'A placa de vídeo demorou demais neste trecho. Para não sobrecarregar o computador, prefira separar só um pedaço menor ou usar outro computador.' }));
        if (lento) info.appendChild(el('p', { class: 'lab-nota-convencao', txt: 'Vai demorar bastante neste computador. Você pode deixar rodando e usar outra coisa: o Musique trabalha com metade dos núcleos e dá uma pausa entre os trechos.' }));
        var ouvir = function (ganhos) {
          var a = C.Som.audio(), n = teste.fontes[0][0].length, b = a.createBuffer(2, n, S.TAXA);
          var mx = S.mixar(teste.fontes, ganhos); b.copyToChannel(mx[0], 0); b.copyToChannel(mx[1], 1);
          var s = a.createBufferSource(); s.buffer = b; s.connect(C.Som.saida()); s.start(); if (C.Som.registrar) C.Som.registrar(s);
        };
        info.appendChild(el('p', { class: 'lab-sep-receitas' }, [el('span', { class: 'lab-dica', txt: 'Ouça o trecho: ' }),
          el('button', { type: 'button', class: 'lab-chip-btn', onclick: function () { ouvir([1, 1, 1, 0, 1, 1]); } }, ['sem voz']),
          el('button', { type: 'button', class: 'lab-chip-btn', onclick: function () { ouvir([0, 0, 0, 1, 0, 0]); } }, ['só a voz']),
          el('button', { type: 'button', class: 'lab-chip-btn', onclick: function () { ouvir([0, 1, 1, 1, 1, 1]); } }, ['sem bateria']),
          el('button', { type: 'button', class: 'lab-chip-btn', onclick: function () { ouvir([1, 1, 0, 0, 0, 0]); } }, ['só bateria e baixo']),
          el('button', { type: 'button', class: 'lab-chip-btn', onclick: function () { C.Som.parar(); } }, ['■'])]));
        info.appendChild(el('div', { class: 'lab-tutor-acoes' }, [el('button', { type: 'button', class: 'btn sec', onclick: function () { ir(1); } }, ['← Outra música']),
          el('button', { type: 'button', class: 'btn', onclick: function () { ir(5); } }, ['Separar a música inteira (' + tempoLongo(est.ms) + ') →'])]));
      }
    }

    // ---------------------------------------------------- 5. separar
    function e5() {
      caixa.appendChild(el('h2', { txt: '5. Separando a música' }));
      caixa.appendChild(el('p', { class: 'lab-dica', txt: 'Pode deixar rodando e usar outra coisa. “Parar” interrompe na hora.' }));
      var pb = barra();
      var parar = el('button', { type: 'button', class: 'btn sec', onclick: function () { matarWorker(); ocupado = false; C.limpar(caixa); caixa.appendChild(el('p', { txt: 'Separação interrompida.' })); caixa.appendChild(el('button', { type: 'button', class: 'btn', onclick: function () { ir(3); } }, ['Recomeçar (o modelo carrega do cache)'])); } }, ['■ Parar']);
      caixa.appendChild(parar);
      if (!worker || !pronto) { C.limpar(caixa); ir(3); return; }
      ocupado = true;
      estereo(ap.limiteS).then(function (lr) {
        var recebidas = [], t0 = Date.now();
        worker.onmessage = function (ev) {
          var m = ev.data || {};
          if (m.tipo === 'progresso') { var resta = (m.ms / m.i) * (m.n - m.i); pb(m.i / m.n, 'Trecho ' + m.i + ' de ' + m.n + ' · falta ' + (resta < 60000 ? 'menos de 1 min' : '~' + Math.round(resta / 60000) + ' min')); }
          else if (m.tipo === 'fonte') {
            // vira AudioBuffer na hora e o array é solto: metade da memória
            var a = C.Som.audio(), b = a.createBuffer(2, m.esq.length, S.TAXA); b.copyToChannel(m.esq, 0); b.copyToChannel(m.dir, 1); recebidas[m.f] = b;
          }
          else if (m.tipo === 'fim') { ocupado = false; buffers = recebidas; C.limpar(caixa); caixa.appendChild(el('p', { class: 'lab-dica', txt: 'Pronto: separado em ' + tempoLongo(Date.now() - t0) + (cortado ? ' (o começo da música, até o limite)' : '') + '.' })); montarMixer(); }
          else if (m.tipo === 'erro') { ocupado = false; erro(m.msg); }
        };
        pb(0, 'Começando…');
        worker.postMessage({ tipo: 'separar', esq: lr[0], dir: lr[1], pausaMs: ap.pausaMs }, [lr[0].buffer, lr[1].buffer]);
      });
    }
    w.addEventListener('beforeunload', function (e) { if (ocupado) { e.preventDefault(); e.returnValue = ''; } });

    // ---------------------------------------------------- mixer
    var estado = S.FONTES.map(function () { return { mudo: false, solo: false, volume: 1 }; });
    var ganhosNos = [], fontesNos = [], tocandoDesde = null, posicao = 0, timerPos = null;
    function ganhosAgora() { return S.ganhosEfetivos(estado); }
    function montarMixer() {
      var duracao = buffers[0].duration;
      C.limpar(boxMixer); boxMixer.hidden = false; posicao = 0;
      var btPlay = el('button', { type: 'button', class: 'btn', onclick: function () { tocandoDesde ? pausar() : tocar(posicao); } }, ['▶ Tocar']);
      var barraPos = el('input', { type: 'range', min: 0, max: Math.floor(duracao * 10), value: 0, 'aria-label': 'Posição na música', oninput: function () { var p = Number(barraPos.value) / 10; if (tocandoDesde) tocar(p); else { posicao = p; tempo.textContent = fmt(p) + ' / ' + fmt(duracao); } } });
      var tempo = el('span', { class: 'lab-sep-tempo', txt: '0:00 / ' + fmt(duracao) });
      boxMixer.appendChild(el('div', { class: 'lab-sep-transporte' }, [btPlay, el('button', { type: 'button', class: 'btn sec', onclick: function () { var p = Math.max(0, atual() - 5); tocandoDesde ? tocar(p) : (posicao = p); } }, ['⟲ 5 s']), barraPos, tempo]));
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
        el('button', { type: 'button', class: 'btn sec', onclick: function () { parar(); boxMixer.hidden = true; ir(1); } }, ['Separar outra música']),
        el('a', { class: 'btn sec', href: '/music/transcrever' }, ['🎧 Transcrever os acordes'])]));
      if (!st.exportar) boxMixer.appendChild(el('p', { class: 'lab-dica', txt: 'Baixar as trilhas faz parte da assinatura.' }));
      function atual() { return tocandoDesde ? Math.min(duracao, posicao + C.Som.audio().currentTime - tocandoDesde) : posicao; }
      clearInterval(timerPos);
      timerPos = setInterval(function () {
        if (!tocandoDesde) return;
        var p = atual(); barraPos.value = Math.floor(p * 10); tempo.textContent = fmt(p) + ' / ' + fmt(duracao);
        if (p >= duracao - 0.02) { pausar(); posicao = 0; barraPos.value = 0; }
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
      var fontes = buffers.map(function (b) { return [b.getChannelData(0), b.getChannelData(1)]; });
      var mx = S.mixar(fontes, g);
      C.baixar((nomeArq || 'musica') + (quais ? '-' + S.FONTES[quais[0]].id : '-mix') + '.wav', 'audio/wav', S.wav(mx[0], mx[1], S.TAXA));
    }

    ir(1);
  };
})(window, document);
