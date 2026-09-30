// =====================================================================
// Musique · Laboratório — SEPARAR TRILHAS (30/09/2026): a página.
//
// O aluno envia um áudio e escolhe o que toca e o que sai — voz, bateria,
// baixo, guitarra, piano e "outros" (sopros, cordas, teclados) — para
// treinar por cima. A separação é o HT-Demucs de 6 fontes (MIT) rodando
// NO NAVEGADOR (`cliente/separar-worker.js`): o áudio não vem ao
// servidor e não há custo por uso (decisão do Augusto, 30/09/2026 —
// "caminho 1"). O modelo (~285 MB) baixa uma vez do Hugging Face,
// fixado num commit, e fica no cache do navegador.
//
// Isolamento de origem (COOP/COEP) SÓ nesta página e no worker: libera
// várias linhas de CPU quando não há WebGPU. `credentialless` para não
// exigir CORP de fonte, imagem e script de terceiros permitidos.
//
// Sem assinatura: o primeiro minuto. Baixar as trilhas em WAV é da
// assinatura (como exportar no resto do Laboratório).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./html');
const ACESSO = require('./acesso');
const S = require('./nucleo/separacao');

const DEMO_SEGUNDOS = 60;
const MAX_MINUTOS = 5;   // igual a separacao.LIMITES.maxMinutos (o aparelho pode baixar para 2)

// ⚠️ SUSPENSA em 30/09/2026: na primeira separação real (Augusto, notebook
// com Intel Iris Xe INTEGRADA), o computador congelou e precisou ser
// reiniciado à força (Kernel-Power 41). A placa integrada desenha a tela e
// divide a memória com o sistema: um trecho do modelo a ocupava por 25–45 s.
// Volta só com o fluxo em etapas e as travas de aparelho (ver a doc).
const SUSPENSA = false;   // reaberta 30/09/2026 com as etapas e as travas de aparelho

function isolar(res) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
}

function registrar(app, { opcional, contextoDe }) {
  app.get('/music/separar-worker.js', (req, res) => {
    if (SUSPENSA) return res.status(503).set('Cache-Control', 'no-store').type('text/plain').send('Separação de trilhas temporariamente fora do ar.');
    isolar(res);
    res.set('Content-Type', 'application/javascript; charset=utf-8').set('Cache-Control', 'no-cache')
      .send(fs.readFileSync(path.join(__dirname, 'cliente', 'separar-worker.js'), 'utf8'));
  });

  app.get('/music/separar', opcional, (req, res) => {
    if (SUSPENSA) {
      return H.pagina(res, { titulo: 'Separar trilhas — em ajuste | Musique', descricao: 'A separação de trilhas está em ajuste e volta em breve.', caminho: '/music/separar', indexar: false,
        corpo: '<header class="lab-cab"><p class="lab-cab-tipo">Laboratório · treinar com a banda</p><h1><span aria-hidden="true">🎚️</span> Separar trilhas</h1>'
          + '<p class="lab-lead">A separação de trilhas está <strong>em ajuste</strong> e volta em breve.</p>'
          + '<p class="lab-nota-convencao">Em alguns computadores com placa de vídeo integrada a separação sobrecarregava o aparelho. Estamos refazendo-a em etapas, com um teste do aparelho antes de separar. Enquanto isso, <a href="/music/transcrever">transcreva os acordes de uma música</a> ou use o <a href="/music/tutor-braco">Tutor de braço</a>.</p></header>',
        trilha: [['Laboratório', '/music/laboratorio'], ['Separar trilhas']] });
    }
    const ctx = contextoDe(req);
    const completo = ACESSO.pode('separar-completo', ctx).ok;
    const estado = { completo, logado: ctx.logado, demo_s: completo ? 0 : DEMO_SEGUNDOS, max_min: MAX_MINUTOS, exportar: ACESSO.pode('exportar', ctx).ok, modelo_mb: Math.round(S.MODELO.bytes / 1e6) };
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Laboratório · treinar com a banda</p><h1><span aria-hidden="true">🎚️</span> Separar trilhas</h1>
<p class="lab-lead">Envie uma música e escolha o que toca e o que sai: tire a voz para cantar, a bateria para tocar bateria, o baixo, a guitarra, o piano — ou deixe só a cozinha. Depois é só dar o play e tocar junto.</p>
${completo ? '' : `<p class="lab-nota-convencao">Sem assinatura, o Musique separa o primeiro minuto de cada música. ${ctx.logado ? '<a href="/music/app#conta">Assine</a>' : '<a href="/music/entrar?voltar=%2Fmusic%2Fseparar">Entre ou comece o teste grátis</a>'} para a música inteira (até ${MAX_MINUTOS} minutos) e para baixar as trilhas.</p>`}</header>
<div id="lab-ferramenta" class="lab-separar" aria-live="polite"><p>Carregando…</p></div>
<noscript><p class="lab-nota-convencao">A separação roda no seu navegador e precisa de JavaScript.</p></noscript>
<section class="lab-bloco"><h2>Como funciona e o que esperar</h2><ul>
<li><strong>Nada sai do seu aparelho.</strong> A separação é feita por uma inteligência artificial aberta (HT-Demucs, da Meta) que roda aqui mesmo, no navegador. O Musique não recebe nem guarda a música.</li>
<li><strong>Em etapas:</strong> primeiro o arquivo, depois o Musique verifica o computador, prepara o modelo, faz um <strong>teste de 8 segundos</strong> e mostra quanto a música inteira vai levar — só então separa, se você quiser.</li>
<li><strong>Cuidado com o aparelho:</strong> placa de vídeo integrada (a mais comum em notebooks) não é usada — a separação roda no processador, com metade dos núcleos e uma pausa entre os trechos, para o computador continuar respondendo. No celular, a separação não é oferecida.</li>
<li><strong>Na primeira vez</strong> o navegador baixa o modelo (cerca de ${estado.modelo_mb} MB) e o guarda; nas próximas, começa na hora. No celular, prefira o Wi-Fi.</li>
<li><strong>Tempo:</strong> no processador de um notebook comum, dezenas de minutos por música; com placa de vídeo dedicada, bem menos. O teste de 8 segundos diz o número do seu computador antes de começar.</li>
<li><strong>Seis trilhas:</strong> voz, bateria, baixo, guitarra/violão, piano e “outros” — sopros, cordas, teclados e efeitos saem juntos nessa última.</li>
<li><strong>Qualidade:</strong> costuma ser muito boa em voz, bateria e baixo; guitarra e piano às vezes deixam um resto nas outras trilhas. É ferramenta de estudo: use com músicas que você pode usar para estudar.</li></ul></section>`;
    isolar(res);
    H.pagina(res, { titulo: 'Separar trilhas — tire a voz, a bateria, o baixo ou a guitarra de uma música | Musique',
      descricao: 'Envie uma música e treine com a banda: tire a voz (karaokê), a bateria, o baixo, a guitarra ou o piano, com volume por trilha. Inteligência artificial que roda no seu navegador, sem enviar o áudio.',
      caminho: '/music/separar', corpo, ferramenta: 'separar', estado, trilha: [['Laboratório', '/music/laboratorio'], ['Separar trilhas']] });
  });
}

module.exports = { registrar, DEMO_SEGUNDOS, MAX_MINUTOS, SUSPENSA };
