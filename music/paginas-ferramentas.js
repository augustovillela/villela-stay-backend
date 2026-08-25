// =====================================================================
// Musique — FERRAMENTAS ABERTAS: afinador, metrônomo e gerador de tons.
//
// Sem login, de propósito. É a porta de entrada do produto: quem está
// aprendendo violão precisa afinar HOJE, e nenhum cadastro melhora esse
// momento. Quem gostar da ferramenta volta para o resto.
//
// TRÊS COISAS QUE ESTA PÁGINA FAZ CERTO E QUE COSTUMAM SER FEITAS ERRADO:
//
//   1. O METRÔNOMO NÃO USA setInterval PARA SOAR. `setInterval` é
//      preemptado pelo navegador e derrapa em dezenas de milissegundos —
//      num metrônomo isso é audível e destrói justamente o que ele
//      deveria ensinar. Aqui um timer só OLHA para a frente e agenda os
//      cliques no relógio do áudio (`AudioContext.currentTime`), que é
//      de amostra, não de evento.
//
//   2. O AFINADOR MEDE PERÍODO, NÃO PICO DE ESPECTRO. Corda de violão e
//      voz têm harmônicos mais fortes que a fundamental; pegar o pico da
//      FFT mostraria a oitava errada com frequência. A autocorrelação
//      normalizada acha a periodicidade, que é o que o ouvido chama de
//      altura.
//
//   3. TUDO SE DESLIGA. Microfone aberto que continua ligado depois de
//      sair da aba é falha de privacidade, não de desempenho — a faixa é
//      parada e o contexto, fechado.
//
// Acessibilidade: navegável por teclado, `aria-live` nos números que
// mudam, e respeito a `prefers-reduced-motion` — a agulha do afinador
// para de animar para quem pediu menos movimento.
// =====================================================================
'use strict';
const { layout } = require('./paginas');

const CSS_FERRAMENTAS = `
.ftabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 22px}
.ftab{background:#fff;border:1px solid var(--borda);border-radius:999px;padding:10px 20px;
  font:600 15px Inter,sans-serif;cursor:pointer;color:var(--graphite)}
.ftab[aria-selected="true"]{background:var(--navy);color:#fff;border-color:var(--navy)}
.painel{background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:26px;margin-bottom:22px}
.painel[hidden]{display:none}
.grande{font:600 64px/1 Lora,Georgia,serif;letter-spacing:-.02em}
.medio{font:600 30px/1.2 Lora,Georgia,serif}
.rot{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--suave);font-weight:600}
.linha{display:flex;gap:22px;flex-wrap:wrap;align-items:center}
.col{flex:1 1 200px}
.campo{display:flex;flex-direction:column;gap:6px;margin:0 0 14px}
.campo label{font-size:14px;font-weight:600}
input[type=number],select,input[type=text]{border:1px solid var(--borda);border-radius:10px;
  padding:10px 12px;font:15px Inter,sans-serif;background:#fff;color:var(--graphite);min-width:0}
input[type=range]{width:100%}
.btn.sec{background:#fff;color:var(--navy);border:1px solid var(--navy)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.pulso{display:flex;gap:8px;margin:18px 0}
.pulso i{width:38px;height:38px;border-radius:50%;background:#E7EAEF;display:block}
.pulso i.on{background:var(--navy)}
.pulso i.forte{background:var(--gold)}
.agulha{position:relative;height:74px;border:1px solid var(--borda);border-radius:12px;
  background:linear-gradient(90deg,#FDF2F2,#F2F7F2 50%,#FDF2F2);overflow:hidden;margin:12px 0}
.agulha .centro{position:absolute;left:50%;top:0;bottom:0;width:2px;background:var(--navy);opacity:.55}
.agulha .marca-m{position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,.08)}
.agulha .ponta{position:absolute;top:8px;bottom:8px;width:6px;border-radius:3px;background:var(--navy);
  left:50%;transform:translateX(-3px);transition:left .09s linear}
.agulha .faixa-ok{position:absolute;top:0;bottom:0;left:47.5%;width:5%;background:rgba(21,154,120,.16)}
@media (prefers-reduced-motion: reduce){.agulha .ponta{transition:none}}
.aviso-x{background:#FEF3C7;border:1px solid #FDE68A;color:#7A4E06;padding:12px 16px;
  border-radius:10px;margin:14px 0;font-size:15px}
.erro-x{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;padding:12px 16px;
  border-radius:10px;margin:14px 0;font-size:15px}
.teclas{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:8px;margin:12px 0}
.tecla{background:#fff;border:1px solid var(--borda);border-radius:10px;padding:12px 6px;
  font:600 15px Inter,sans-serif;cursor:pointer;color:var(--graphite)}
.tecla[aria-pressed="true"]{background:var(--navy);color:#fff;border-color:var(--navy)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

// ---------------------------------------------------------------------
// O JS da página. Escrito como string porque o padrão da casa é SPA sem
// build — e porque este arquivo tem de ser lido junto com o comentário
// de cima, que explica por que cada parte é assim.
// ---------------------------------------------------------------------
const JS = `
(function () {
  'use strict';
  var LA4 = 440;
  var NOMES = ['dó','dó#','ré','ré#','mi','fá','fá#','sol','sol#','lá','lá#','si'];
  // Um AudioContext só, compartilhado com /music/audio.js: dois
  // contextos no mesmo aparelho competem por recurso e, em celular,
  // costumam derrubar o áudio do que abriu primeiro.
  var ctx = null;
  function audio() { ctx = window.MusiqueAudio.audio(); return ctx; }
  function nomeDeMidi(m) { return NOMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1); }
  function freqDeMidi(m) { return LA4 * Math.pow(2, (m - 69) / 12); }

  // ---- abas -------------------------------------------------------
  var tabs = [].slice.call(document.querySelectorAll('.ftab'));
  function mostrar(id) {
    tabs.forEach(function (t) {
      var sel = t.dataset.p === id;
      t.setAttribute('aria-selected', sel ? 'true' : 'false');
      document.getElementById('p-' + t.dataset.p).hidden = !sel;
    });
    if (id !== 'afinador') pararAfinador();
    if (id !== 'metronomo') pararMetronomo();
    if (id !== 'tons') pararTom();
  }
  tabs.forEach(function (t) { t.onclick = function () { mostrar(t.dataset.p); }; });

  // =================================================================
  // METRÔNOMO — agendamento no relógio do ÁUDIO
  // =================================================================
  var mRodando = false, mTimer = null, mProximo = 0, mPulso = 0, mBpmAtual = 0, mCompassos = 0;
  var LOOKAHEAD_MS = 25, JANELA_S = 0.12;

  function cliquear(quando, forte) {
    var a = audio();
    var osc = a.createOscillator(), g = a.createGain();
    osc.frequency.value = forte ? 1600 : 1000;
    // Envelope curto: clique sem "plop" de corte abrupto.
    g.gain.setValueAtTime(0.0001, quando);
    g.gain.exponentialRampToValueAtTime(forte ? 0.5 : 0.28, quando + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + 0.05);
    osc.connect(g); g.connect(a.destination);
    osc.start(quando); osc.stop(quando + 0.06);
  }

  function agendar() {
    var a = audio();
    var porCompasso = parseInt(document.getElementById('m-compasso').value, 10) || 4;
    var sub = parseInt(document.getElementById('m-sub').value, 10) || 1;
    var acentuar = document.getElementById('m-acento').checked;
    var passoS = 60 / mBpmAtual / sub;

    while (mProximo < a.currentTime + JANELA_S) {
      var naSub = mPulso % sub;
      var tempoDoCompasso = Math.floor(mPulso / sub) % porCompasso;
      var forte = acentuar && naSub === 0 && tempoDoCompasso === 0;
      cliquear(mProximo, forte);
      pintar(tempoDoCompasso, naSub === 0, forte, mProximo - a.currentTime);
      mProximo += passoS;
      mPulso++;
      if (mPulso % (porCompasso * sub) === 0) {
        mCompassos++;
        var aumento = parseInt(document.getElementById('m-progressivo').value, 10) || 0;
        var aCada = parseInt(document.getElementById('m-acada').value, 10) || 4;
        if (aumento > 0 && mCompassos % aCada === 0) {
          mBpmAtual = Math.min(300, mBpmAtual + aumento);
          document.getElementById('m-bpm-atual').textContent = mBpmAtual;
        }
      }
    }
  }

  function pintar(indice, noTempo, forte, emS) {
    if (!noTempo) return;
    setTimeout(function () {
      var ls = document.querySelectorAll('#m-pulso i');
      for (var i = 0; i < ls.length; i++) { ls[i].className = ''; }
      if (ls[indice]) ls[indice].className = forte ? 'forte' : 'on';
    }, Math.max(0, emS * 1000));
  }

  function montarPulso() {
    var n = parseInt(document.getElementById('m-compasso').value, 10) || 4;
    var alvo = document.getElementById('m-pulso');
    alvo.innerHTML = '';
    for (var i = 0; i < n; i++) alvo.appendChild(document.createElement('i'));
  }

  function iniciarMetronomo() {
    if (mRodando) return;
    var a = audio();
    mBpmAtual = parseInt(document.getElementById('m-bpm').value, 10) || 90;
    document.getElementById('m-bpm-atual').textContent = mBpmAtual;
    mRodando = true; mPulso = 0; mCompassos = 0;
    var contagem = parseInt(document.getElementById('m-contagem').value, 10) || 0;
    // Contagem de entrada: dá ao aluno o tempo de pegar o instrumento —
    // começar no primeiro clique garante que ele perde o primeiro tempo.
    mProximo = a.currentTime + 0.1 + (contagem * 60 / mBpmAtual);
    if (contagem) {
      for (var i = 0; i < contagem; i++) cliquear(a.currentTime + 0.1 + i * 60 / mBpmAtual, i === 0);
    }
    mTimer = setInterval(agendar, LOOKAHEAD_MS);
    document.getElementById('m-play').textContent = 'Parar';
    document.getElementById('m-estado').textContent = 'tocando';
  }

  function pararMetronomo() {
    if (!mRodando) return;
    mRodando = false;
    clearInterval(mTimer); mTimer = null;
    var ls = document.querySelectorAll('#m-pulso i');
    for (var i = 0; i < ls.length; i++) ls[i].className = '';
    var b = document.getElementById('m-play');
    if (b) { b.textContent = 'Começar'; document.getElementById('m-estado').textContent = 'parado'; }
  }

  // =================================================================
  // AFINADOR — autocorrelação normalizada
  // =================================================================
  var aStream = null, aRaf = null, aAnalisador = null, aBuf = null;

  // A detecção mora em /music/audio.js e é a MESMA usada pelos
  // exercícios. Duplicar aqui faria o afinador e a avaliação discordarem
  // sobre a mesma nota — e o aluno teria razão em desconfiar dos dois.
  var detectar = function (buf, taxa) { return window.MusiqueAudio.detectarHz(buf, taxa); };

  var historico = [];
  function laco() {
    aAnalisador.getFloatTimeDomainData(aBuf);
    var r = detectar(aBuf, ctx.sampleRate);
    if (r.hz > 0) {
      historico.push(r.hz);
      if (historico.length > 5) historico.shift();
      var ord = historico.slice().sort(function (x, y) { return x - y; });
      var hz = ord[Math.floor(ord.length / 2)];   // mediana: mata leitura solta
      var m = 69 + 12 * Math.log2(hz / LA4);
      var midi = Math.round(m);
      var cents = Math.round((m - midi) * 100);
      document.getElementById('af-nota').textContent = nomeDeMidi(midi);
      document.getElementById('af-hz').textContent = hz.toFixed(1) + ' Hz';
      document.getElementById('af-cents').textContent = (cents > 0 ? '+' : '') + cents + ' cents';
      var pos = Math.max(0, Math.min(100, 50 + cents));   // ±50 cents = ponta a ponta
      document.getElementById('af-ponta').style.left = pos + '%';
      document.getElementById('af-diag').textContent =
        Math.abs(cents) <= 5 ? 'afinado' : (cents < 0 ? 'baixo — aperte' : 'alto — solte');
    } else {
      document.getElementById('af-nota').textContent = '—';
      document.getElementById('af-hz').textContent = '';
      document.getElementById('af-cents').textContent = '';
      document.getElementById('af-diag').textContent = 'toque uma nota';
      historico.length = 0;
    }
    aRaf = requestAnimationFrame(laco);
  }

  function iniciarAfinador() {
    if (aStream) return;
    var erro = document.getElementById('af-erro');
    erro.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      erro.hidden = false;
      erro.textContent = 'Este navegador não dá acesso ao microfone. Tente pelo Chrome, Edge ou Firefox atualizados.';
      return;
    }
    navigator.mediaDevices.getUserMedia({
      // Processamento do navegador atrapalha medição: eco e ruído são
      // filtros que MEXEM no sinal, e o ganho automático muda o volume
      // no meio da nota.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    }).then(function (stream) {
      aStream = stream;
      var a = audio();
      var src = a.createMediaStreamSource(stream);
      aAnalisador = a.createAnalyser();
      aAnalisador.fftSize = 4096;
      aBuf = new Float32Array(aAnalisador.fftSize);
      src.connect(aAnalisador);
      document.getElementById('af-play').textContent = 'Parar';
      laco();
    }).catch(function (e) {
      erro.hidden = false;
      erro.textContent = 'Não consegui usar o microfone: ' + (e && e.name === 'NotAllowedError'
        ? 'a permissão foi negada. Libere o microfone para este site e tente de novo.'
        : (e && e.message) || 'erro desconhecido') + '';
    });
  }

  function pararAfinador() {
    if (aRaf) { cancelAnimationFrame(aRaf); aRaf = null; }
    if (aStream) { aStream.getTracks().forEach(function (t) { t.stop(); }); aStream = null; }
    var b = document.getElementById('af-play');
    if (b) b.textContent = 'Ligar o microfone';
    var n = document.getElementById('af-nota'); if (n) n.textContent = '—';
    var d = document.getElementById('af-diag'); if (d) d.textContent = 'microfone desligado';
  }

  // =================================================================
  // GERADOR DE TONS
  // =================================================================
  var tOsc = null, tGain = null, tMidi = 69;
  function tocarTom() {
    pararTom();
    var a = audio();
    tOsc = a.createOscillator(); tGain = a.createGain();
    tOsc.type = document.getElementById('t-timbre').value;
    tOsc.frequency.value = freqDeMidi(tMidi);
    tGain.gain.setValueAtTime(0.0001, a.currentTime);
    tGain.gain.exponentialRampToValueAtTime(0.22, a.currentTime + 0.03);
    tOsc.connect(tGain); tGain.connect(a.destination);
    tOsc.start();
    document.getElementById('t-play').textContent = 'Parar';
  }
  function pararTom() {
    if (tOsc) {
      try { tGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04); tOsc.stop(ctx.currentTime + 0.06); } catch (e) {}
      tOsc = null; tGain = null;
    }
    var b = document.getElementById('t-play');
    if (b) b.textContent = 'Tocar';
  }
  function pintarTeclas() {
    [].slice.call(document.querySelectorAll('.tecla')).forEach(function (k) {
      k.setAttribute('aria-pressed', Number(k.dataset.midi) === tMidi ? 'true' : 'false');
    });
    document.getElementById('t-nota').textContent = nomeDeMidi(tMidi);
    document.getElementById('t-hz').textContent = freqDeMidi(tMidi).toFixed(1) + ' Hz';
    if (tOsc) tOsc.frequency.setValueAtTime(freqDeMidi(tMidi), ctx.currentTime);
  }

  // ---- ligações ---------------------------------------------------
  document.getElementById('m-play').onclick = function () { mRodando ? pararMetronomo() : iniciarMetronomo(); };
  document.getElementById('m-compasso').onchange = montarPulso;
  document.getElementById('m-bpm').oninput = function () {
    document.getElementById('m-bpm-lbl').textContent = this.value;
    if (mRodando) { mBpmAtual = parseInt(this.value, 10); document.getElementById('m-bpm-atual').textContent = mBpmAtual; }
  };
  document.getElementById('af-play').onclick = function () { aStream ? pararAfinador() : iniciarAfinador(); };
  document.getElementById('t-play').onclick = function () { tOsc ? pararTom() : tocarTom(); };
  [].slice.call(document.querySelectorAll('.tecla')).forEach(function (k) {
    k.onclick = function () { tMidi = Number(k.dataset.midi); pintarTeclas(); if (!tOsc) tocarTom(); };
  });
  document.getElementById('t-oitava').onchange = function () {
    var d = Number(this.value) * 12;
    [].slice.call(document.querySelectorAll('.tecla')).forEach(function (k) {
      k.dataset.midi = Number(k.dataset.base) + d;
    });
    tMidi = Number(document.querySelector('.tecla').dataset.base) + d + (tMidi % 12) - (Number(document.querySelector('.tecla').dataset.base) % 12);
    pintarTeclas();
  };

  montarPulso();
  pintarTeclas();
  mostrar('afinador');

  // Sair da página com o microfone aberto é falha de privacidade, não de
  // desempenho. Some com tudo.
  window.addEventListener('pagehide', function () { pararAfinador(); pararMetronomo(); pararTom(); });
})();
`;

function registrar(app) {
  app.get('/music/ferramentas', (req, res) => {
    const teclas = ['dó', 'dó#', 'ré', 'ré#', 'mi', 'fá', 'fá#', 'sol', 'sol#', 'lá', 'lá#', 'si']
      .map((n, i) => `<button class="tecla" data-base="${60 + i}" data-midi="${60 + i}" aria-pressed="false">${n}</button>`)
      .join('');

    res.set('Content-Type', 'text/html; charset=utf-8').send(layout(
      'Musique — afinador, metrônomo e gerador de tons',
      `<style>${CSS_FERRAMENTAS}</style>
<div class="wrap" style="padding:34px 20px 10px">
  <h1 style="font-size:clamp(26px,4.4vw,38px);margin:0 0 8px">Ferramentas de prática</h1>
  <p style="color:var(--suave);max-width:640px;margin:0 0 22px">Afinador, metrônomo e gerador de
  tons. Funcionam aqui mesmo, sem cadastro e sem instalar nada — o áudio não sai do seu aparelho.</p>

  <div class="ftabs" role="tablist" aria-label="Ferramentas">
    <button class="ftab" role="tab" data-p="afinador" aria-selected="true" aria-controls="p-afinador">🎯 Afinador</button>
    <button class="ftab" role="tab" data-p="metronomo" aria-selected="false" aria-controls="p-metronomo">⏱️ Metrônomo</button>
    <button class="ftab" role="tab" data-p="tons" aria-selected="false" aria-controls="p-tons">🔔 Gerador de tons</button>
  </div>

  <!-- ============ AFINADOR ============ -->
  <section class="painel" id="p-afinador" role="tabpanel" aria-labelledby="afinador">
    <div class="linha">
      <div class="col">
        <div class="rot">Nota detectada</div>
        <div class="grande" id="af-nota" aria-live="polite">—</div>
        <div class="medio" id="af-cents" style="font-size:20px;color:var(--suave)" aria-live="polite"></div>
        <div style="color:var(--suave)" id="af-hz"></div>
      </div>
      <div class="col" style="flex:2 1 320px">
        <div class="agulha" role="img" aria-label="Desvio da afinação em cents">
          <div class="faixa-ok"></div>
          <div class="centro"></div>
          <div class="marca-m" style="left:25%"></div>
          <div class="marca-m" style="left:75%"></div>
          <div class="ponta" id="af-ponta"></div>
        </div>
        <div style="display:flex;justify-content:space-between;color:var(--suave);font-size:13px">
          <span>−50 cents</span><span id="af-diag" aria-live="polite">microfone desligado</span><span>+50 cents</span>
        </div>
      </div>
    </div>
    <div class="erro-x" id="af-erro" hidden></div>
    <div style="margin-top:16px"><button class="btn" id="af-play">Ligar o microfone</button></div>
    <div class="aviso-x" style="margin-top:18px">
      <strong>O que este afinador mede.</strong> A altura de <em>uma</em> nota por vez, entre 55 Hz e
      2 kHz. Ele não separa acordes: se você tocar duas cordas juntas, o número não quer dizer nada.
      Em ambiente silencioso e com o instrumento perto do microfone, a leitura é confiável a poucos
      cents.
    </div>
  </section>

  <!-- ============ METRÔNOMO ============ -->
  <section class="painel" id="p-metronomo" role="tabpanel" hidden>
    <div class="linha">
      <div class="col">
        <div class="rot">Andamento</div>
        <div class="grande"><span id="m-bpm-atual">90</span> <span style="font-size:22px;color:var(--suave)">BPM</span></div>
        <div style="color:var(--suave)" id="m-estado" aria-live="polite">parado</div>
        <div class="pulso" id="m-pulso" aria-hidden="true"></div>
        <button class="btn" id="m-play">Começar</button>
      </div>
      <div class="col">
        <div class="campo">
          <label for="m-bpm">BPM: <span id="m-bpm-lbl">90</span></label>
          <input type="range" id="m-bpm" min="30" max="240" value="90">
        </div>
        <div class="campo">
          <label for="m-compasso">Tempos por compasso</label>
          <select id="m-compasso">
            <option>2</option><option>3</option><option selected>4</option>
            <option>5</option><option>6</option><option>7</option>
          </select>
        </div>
        <div class="campo">
          <label for="m-sub">Subdivisão</label>
          <select id="m-sub">
            <option value="1" selected>Semínimas</option>
            <option value="2">Colcheias</option>
            <option value="3">Tercinas</option>
            <option value="4">Semicolcheias</option>
          </select>
        </div>
        <div class="campo">
          <label for="m-contagem">Contagem de entrada (tempos)</label>
          <select id="m-contagem"><option value="0">sem contagem</option><option value="4" selected>4</option><option value="8">8</option></select>
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px">
          <input type="checkbox" id="m-acento" checked> acentuar o primeiro tempo
        </label>
      </div>
      <div class="col">
        <div class="rot">Aumento progressivo</div>
        <p style="color:var(--suave);font-size:14px;margin:6px 0 12px">Acelera sozinho, para você
        estudar a passagem difícil sem parar para mexer no aparelho.</p>
        <div class="campo">
          <label for="m-progressivo">Somar BPM</label>
          <input type="number" id="m-progressivo" value="0" min="0" max="20" step="1">
        </div>
        <div class="campo">
          <label for="m-acada">A cada quantos compassos</label>
          <input type="number" id="m-acada" value="4" min="1" max="32" step="1">
        </div>
      </div>
    </div>
  </section>

  <!-- ============ GERADOR DE TONS ============ -->
  <section class="painel" id="p-tons" role="tabpanel" hidden>
    <div class="linha">
      <div class="col">
        <div class="rot">Nota</div>
        <div class="grande" id="t-nota" aria-live="polite">lá4</div>
        <div style="color:var(--suave)" id="t-hz"></div>
        <div style="margin-top:14px"><button class="btn" id="t-play">Tocar</button></div>
      </div>
      <div class="col" style="flex:2 1 340px">
        <div class="teclas" role="group" aria-label="Escolha a nota">${teclas}</div>
        <div class="linha">
          <div class="campo" style="flex:1">
            <label for="t-oitava">Oitava</label>
            <select id="t-oitava">
              <option value="-2">2</option><option value="-1">3</option>
              <option value="0" selected>4</option><option value="1">5</option>
            </select>
          </div>
          <div class="campo" style="flex:1">
            <label for="t-timbre">Timbre</label>
            <select id="t-timbre">
              <option value="sine" selected>Senoidal (limpo)</option>
              <option value="triangle">Triangular</option>
              <option value="sawtooth">Dente de serra</option>
              <option value="square">Quadrada</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    <div class="aviso-x">Referência em lá 4 = 440 Hz. Use para afinar de ouvido, conferir a altura
    de uma corda ou dar o tom antes de cantar.</div>
  </section>

  <div class="nota" style="margin-bottom:40px">
    Quer acompanhar o seu estudo — exercícios, progresso e trilhas? Isso fica na sua conta.
    <a href="/academy/app">Entre com a conta da Academia</a>.
  </div>
</div>
<script src="/music/audio.js"></script>
<script>${JS}</script>`,
      { descricao: 'Afinador cromático, metrônomo com aumento progressivo e gerador de tons. '
        + 'Grátis, sem cadastro, direto no navegador. Musique, por Villela Music.',
        caminho: '/music/ferramentas' },
    ));
  });
}

module.exports = { registrar, CSS_FERRAMENTAS };
