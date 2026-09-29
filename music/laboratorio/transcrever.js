// =====================================================================
// Musique · Laboratório — TRANSCREVER (29/09/2026): a página.
//
// O aluno traz o som e o Musique devolve tom, andamento, acordes por
// compasso e a linha de melodia. Duas entradas, ambas analisadas NO
// APARELHO (`nucleo/transcricao.js`) — o áudio não vem ao servidor:
//   · arquivo que o aluno já tem (MP3, WAV, M4A/AAC, OGG/Opus, FLAC,
//     WebM — o que o navegador souber decodificar);
//   · escuta ao vivo: uma ABA compartilhada pelo próprio navegador (o
//     vídeo do YouTube tocando lá) ou o microfone.
//
// ⚠️ Decisão do Augusto (29/09/2026): o Musique NÃO baixa áudio do
// YouTube nem de outro site (termos de uso e cópia de obra protegida).
// Não há campo de link, e não deve passar a haver — o caminho para quem
// estuda uma música do YouTube é a escuta da aba, que não guarda nada.
//
// É indicação de estudo (Q5): a harmonia costuma sair boa; a melodia em
// gravação com banda é aproximada — a página diz isso. Nada é guardado
// no servidor; exportar (cifra e MIDI) é da assinatura, como no resto do
// Laboratório.
// =====================================================================
'use strict';
const H = require('./html');
const ACESSO = require('./acesso');

const DEMO_SEGUNDOS = 60;

function registrar(app, { opcional, contextoDe }) {
  app.get('/music/transcrever', opcional, (req, res) => {
    const ctx = contextoDe(req);
    const completo = ACESSO.pode('transcrever-completo', ctx).ok;
    const estado = { completo, logado: ctx.logado, demo_s: completo ? 0 : DEMO_SEGUNDOS, exportar: ACESSO.pode('exportar', ctx).ok, compasso: req.query.c === '3' ? 3 : 4 };
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Laboratório · ouvir e entender</p><h1><span aria-hidden="true">🎧</span> Transcrever música</h1>
<p class="lab-lead">Traga uma música e veja o tom, o andamento, os acordes de cada compasso e a linha da melodia — para tirar de ouvido com ajuda, tocar junto e estudar. Vale para arquivo de áudio que você tem e para o que está tocando numa aba do navegador, como um vídeo do YouTube.</p>
${completo ? '' : `<p class="lab-nota-convencao">Sem assinatura, o Musique transcreve o primeiro minuto de cada música. ${ctx.logado ? '<a href="/music/app#conta">Assine</a>' : '<a href="/music/entrar?voltar=%2Fmusic%2Ftranscrever">Entre ou comece o teste grátis</a>'} para a música inteira e para exportar a cifra e o MIDI.</p>`}</header>
<div id="lab-ferramenta" class="lab-transcrever" aria-live="polite"><p>Carregando…</p></div>
<noscript><p class="lab-nota-convencao">A transcrição roda no seu navegador e precisa de JavaScript.</p></noscript>
<section class="lab-bloco"><h2>Como funciona e o que esperar</h2><ul>
<li><strong>Nada sai do seu aparelho.</strong> O som é analisado aqui mesmo, no navegador; o Musique não recebe, não grava e não guarda a música.</li>
<li><strong>YouTube e outros sites:</strong> o Musique não baixa vídeo nem áudio de site nenhum. Abra o vídeo em outra aba, clique em “Ouvir uma aba”, escolha a aba e marque <em>compartilhar o áudio da guia</em>. O Musique escuta enquanto toca, como você escutaria.</li>
<li><strong>Harmonia:</strong> os acordes saem por compasso, com o tom provável e a alternativa quando há dúvida (maior × relativa menor). Em música popular costuma sair muito perto; acordes com tensões (9ª, 11ª, 13ª) aparecem como a tríade ou a tétrade de base.</li>
<li><strong>Melodia:</strong> é a linha que mais se destaca (voz ou solo). Com voz ou instrumento sozinho sai boa; com banda inteira é <em>aproximada</em> — use como ponto de partida e confira de ouvido. É indicação de estudo, não partitura oficial.</li>
<li>Formatos: MP3, WAV, M4A/AAC, OGG/Opus, FLAC e WebM (os que o seu navegador tocar). Até 15 minutos por música.</li></ul></section>`;
    H.pagina(res, { titulo: 'Transcrever música — acordes, tom, andamento e melodia de um áudio | Musique',
      descricao: 'Descubra os acordes por compasso, o tom, o BPM e a linha da melodia de uma música: de um arquivo MP3, WAV, M4A, OGG ou FLAC, ou do que toca numa aba do navegador. Análise no seu aparelho, em português.',
      caminho: '/music/transcrever', corpo, ferramenta: 'transcrever', estado, trilha: [['Laboratório', '/music/laboratorio'], ['Transcrever música']] });
  });
}

module.exports = { registrar, DEMO_SEGUNDOS };
