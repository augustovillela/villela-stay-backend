// =====================================================================
// Voz — FASE 1: a tela do círculo. Servida em /staff/voz (exige sessão).
//
// O celular grava, fala com a OpenAI por WebRTC, e as DUAS ferramentas
// do modelo batem na NOSSA API — que é onde estão catálogo, níveis,
// aprovação, idempotência e auditoria. O modelo de voz é só ouvido, boca
// e vez de falar.
//
// TRÊS COISAS QUE A TELA FAZ E QUE NÃO SÃO ENFEITE:
//
// 1. MOSTRA A TRANSCRIÇÃO DO QUE VOCÊ FALOU. É o que permite ver que
//    "manda pro Cesar" virou "manda pro Ceará" — e ver ANTES de o
//    resultado chegar. Sem isso, erro de fala vira mistério.
// 2. MOSTRA QUANDO ESTÁ PENSANDO. Uma consulta leva de 3 a 8 segundos;
//    círculo parado nesse tempo parece travado, e a pessoa repete o
//    comando — que é como se cria pedido duplicado.
// 3. MOSTRA O QUE A FERRAMENTA DEVOLVEU, em texto. Fala some; texto
//    fica. Quando algo der errado, é a tela que diz o quê.
// =====================================================================
'use strict';

const CSS = `
:root{--tinta:#1B2A4A;--ouro:#C9A227;--fundo:#0f1420;--cartao:#171d2b;--borda:#28304a;
      --claro:#eef1f6;--fraco:#8b93a7;--ok:#2dd4bf;--perigo:#f87171}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--claro);
     font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
     min-height:100dvh;display:flex;flex-direction:column}
header{padding:14px 18px;border-bottom:1px solid var(--borda);display:flex;align-items:center;gap:10px}
header b{font-size:15px}header span{font-size:12px;color:var(--ouro)}
header a{margin-left:auto;color:var(--fraco);font-size:13px;text-decoration:none}
main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:18px}
.palco{position:relative;width:220px;height:220px;display:grid;place-items:center}
.halo{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(45,212,191,.28),transparent 70%);
      transform:scale(.6);opacity:0;transition:transform .12s ease-out,opacity .3s}
.bola{width:132px;height:132px;border-radius:50%;position:relative;
      background:linear-gradient(145deg,#2dd4bf,#1b6ef3 60%,#5b3df5);
      box-shadow:0 12px 40px rgba(27,110,243,.35);transition:transform .12s ease-out,filter .3s;
      display:grid;place-items:center;cursor:pointer;border:0}
.bola:disabled{cursor:progress}
.bola::after{content:'';position:absolute;inset:8px;border-radius:50%;
      background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.5),transparent 55%)}
body[data-estado="parado"] .bola{filter:grayscale(.75) brightness(.7)}
body[data-estado="pensando"] .bola{animation:pulsa 1.1s ease-in-out infinite}
body[data-estado="pensando"] .halo{opacity:.5}
@keyframes pulsa{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@media (prefers-reduced-motion:reduce){body[data-estado="pensando"] .bola{animation:none}}
.estado{font-size:15px;color:var(--fraco);min-height:22px;text-align:center}
.dica{font-size:13px;color:var(--fraco);text-align:center;max-width:320px}
.fita{width:100%;max-width:560px;display:flex;flex-direction:column;gap:8px;
      max-height:38vh;overflow-y:auto;padding:4px}
.linha{padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.eu{background:#22304d;align-self:flex-end;max-width:85%;border-bottom-right-radius:4px}
.ele{background:var(--cartao);border:1px solid var(--borda);align-self:flex-start;max-width:90%;border-bottom-left-radius:4px}
.sis{background:transparent;color:var(--fraco);font-size:12.5px;align-self:center;text-align:center;padding:2px}
.erro{background:#3a1d1d;border:1px solid var(--perigo);color:#fecaca;align-self:stretch}
.rodape{padding:12px 18px;border-top:1px solid var(--borda);font-size:12px;color:var(--fraco);text-align:center}
a{color:var(--ok)}
`;

const JS = `
const $ = (s) => document.querySelector(s);
const fita = $('#fita'), bola = $('#bola'), estado = $('#estado');
let pc = null, mic = null, dc = null, audioCtx = null, raf = 0, ligado = false;

const ESTADOS = {
  parado:   'Toque para falar',
  ligando:  'Conectando…',
  ouvindo:  'Estou ouvindo',
  pensando: 'Consultando o sistema…',
  falando:  'Respondendo',
};
function setEstado(e) {
  document.body.dataset.estado = e;
  estado.textContent = ESTADOS[e] || e;
}
function diz(texto, classe) {
  const d = document.createElement('div');
  d.className = 'linha ' + classe;
  d.textContent = texto;
  fita.appendChild(d);
  fita.scrollTop = fita.scrollHeight;
  return d;
}

// ---- o círculo pulsa com o volume real, não com um timer ----
// Animação "no olho" descola do áudio e vira enfeite; medindo, o círculo
// vira feedback de que o microfone está mesmo captando.
function pulsar(stream, halo) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaStreamSource(stream);
  const an = audioCtx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const dados = new Uint8Array(an.frequencyBinCount);
  const passo = () => {
    an.getByteTimeDomainData(dados);
    let soma = 0;
    for (let i = 0; i < dados.length; i++) { const v = (dados[i] - 128) / 128; soma += v * v; }
    const nivel = Math.min(1, Math.sqrt(soma / dados.length) * 6);
    bola.style.transform = 'scale(' + (1 + nivel * 0.22).toFixed(3) + ')';
    halo.style.transform = 'scale(' + (0.6 + nivel * 0.7).toFixed(3) + ')';
    halo.style.opacity = (nivel * 0.9).toFixed(2);
    raf = requestAnimationFrame(passo);
  };
  cancelAnimationFrame(raf);
  passo();
}

// ---- as duas ferramentas: batem na NOSSA API ----
async function chamarFerramenta(nome, args) {
  const rota = nome === 'consultar' ? 'consultar' : 'executar';
  const r = await fetch('/staff/api/voz/' + rota, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',            // a sessão do Portal Staff é quem autoriza
    body: JSON.stringify(nome === 'consultar' ? { pergunta: args.pergunta, canal: 'voz' }
                                              : { pedido: args.pedido, canal: 'voz' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || ('Falha ' + r.status));
  return j;
}

function enviar(dc, obj) { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(obj)); }

async function aoEvento(ev) {
  let m; try { m = JSON.parse(ev.data); } catch (_) { return; }

  // O que EU falei, transcrito. Ver isto antes do resultado e o que
  // permite pegar "Cesar" que virou "Ceara".
  if (m.type && m.type.includes('input_audio_transcription') && m.type.endsWith('.completed')) {
    if (m.transcript) diz(m.transcript, 'eu');
    return;
  }
  // O que ele falou.
  if (m.type && m.type.includes('transcript') && m.type.endsWith('.done')) {
    if (m.transcript) diz(m.transcript, 'ele');
    return;
  }
  if (m.type === 'input_audio_buffer.speech_started') { setEstado('ouvindo'); return; }
  if (m.type === 'response.created') { setEstado('pensando'); return; }
  if (m.type === 'output_audio_buffer.started' || m.type === 'response.output_audio.delta') { setEstado('falando'); return; }

  if (m.type === 'response.done') {
    const saida = (m.response && m.response.output) || [];
    const chamadas = saida.filter((o) => o.type === 'function_call');
    if (!chamadas.length) { if (ligado) setEstado('ouvindo'); return; }

    for (const c of chamadas) {
      setEstado('pensando');
      let resultado;
      try {
        const args = JSON.parse(c.arguments || '{}');
        resultado = await chamarFerramenta(c.name, args);
        // O que a ferramenta devolveu, em texto: fala some, texto fica.
        diz(resultado.fala || '(sem resposta)', 'sis');
      } catch (e) {
        diz('Erro: ' + e.message, 'linha erro');
        resultado = { fala: 'Não consegui falar com o sistema agora.', erro: e.message };
      }
      enviar(dc, { type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(resultado) } });
    }
    enviar(dc, { type: 'response.create' });
    return;
  }

  if (m.type === 'error') {
    diz('Erro da sessão: ' + ((m.error && m.error.message) || 'desconhecido'), 'linha erro');
  }
}

async function ligar() {
  bola.disabled = true;
  setEstado('ligando');
  try {
    const r = await fetch('/staff/api/voz/sessao', { method: 'POST', credentials: 'same-origin' });
    const s = await r.json();
    if (!r.ok) throw new Error(s.erro || ('Falha ' + r.status));

    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc = new RTCPeerConnection();
    const audio = new Audio();
    audio.autoplay = true;
    pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };
    pc.addTrack(mic.getTracks()[0], mic);

    dc = pc.createDataChannel('oai-events');
    dc.onmessage = aoEvento;
    dc.onopen = () => { ligado = true; setEstado('ouvindo'); };

    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    const resp = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST', body: oferta.sdp,
      headers: { Authorization: 'Bearer ' + s.segredo, 'Content-Type': 'application/sdp' },
    });
    if (!resp.ok) throw new Error('A OpenAI recusou a conexão (' + resp.status + ')');
    await pc.setRemoteDescription({ type: 'answer', sdp: await resp.text() });

    pulsar(mic, $('#halo'));
    diz('Sessão aberta com ' + s.modelo + '. Pode falar.', 'sis');
  } catch (e) {
    diz('Não deu para abrir: ' + e.message, 'linha erro');
    setEstado('parado');
    desligar();
  } finally { bola.disabled = false; }
}

function desligar() {
  ligado = false;
  cancelAnimationFrame(raf);
  bola.style.transform = '';
  const halo = $('#halo'); if (halo) { halo.style.opacity = 0; }
  try { if (dc) dc.close(); } catch (_) {}
  try { if (pc) pc.close(); } catch (_) {}
  try { if (mic) mic.getTracks().forEach((t) => t.stop()); } catch (_) {}
  dc = pc = mic = null;
  setEstado('parado');
}

bola.onclick = () => (ligado ? (desligar(), diz('Sessão encerrada.', 'sis')) : ligar());
// Sessao de voz custa por minuto: sair da pagina tem de fechar de
// verdade, nao deixar o microfone e a conexao abertos em segundo plano.
window.addEventListener('pagehide', desligar);
document.addEventListener('visibilitychange', () => { if (document.hidden && ligado) { desligar(); diz('Fechei a sessão porque a tela saiu de foco — voz custa por minuto.', 'sis'); } });
setEstado('parado');
`;

function pagina({ disponivel, motivo = '' }) {
  const corpo = disponivel
    ? `<main>
         <div class="palco"><div class="halo" id="halo"></div><button class="bola" id="bola" aria-label="Falar"></button></div>
         <div class="estado" id="estado">Toque para falar</div>
         <div class="dica">Pergunte (“como está a ocupação hoje?”) ou peça (“põe água na lista de compras”).</div>
         <div class="fita" id="fita"></div>
       </main>
       <div class="rodape">A sessão fecha sozinha quando a tela sai de foco — voz custa por minuto.</div>
       <script>${JS}</script>`
    : `<main>
         <div class="palco"><div class="halo"></div><div class="bola" style="filter:grayscale(1) brightness(.6)"></div></div>
         <div class="estado">Voz em tempo real indisponível</div>
         <div class="dica">${motivo}</div>
         <div class="dica">O WhatsApp continua funcionando normalmente.</div>
       </main>`;

  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0f1420">
<title>Voz — Villela Stay</title><style>${CSS}</style></head>
<body data-estado="parado">
<header><b>Villela Stay</b><span>Voz</span><a href="/staff/">Portal Staff</a></header>
${corpo}
</body></html>`;
}

module.exports = { pagina };
