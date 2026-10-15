// Musique · Tocar junto — violão e guitarra, captura local e histórico de treino.
// Não recebe áudio nem publica resultados. As medidas vêm do navegador:
// são indicações autodeclaradas de treino, nunca nota ou classificação.
'use strict';

const path = require('node:path');
const { db, novoId, nowISO } = require('../db');
const { layout, esc } = require('../paginas');

const INDICACAO = 'Indicação de treino calculada no seu aparelho; não é nota nem avaliação do professor.';
const CAMPOS = new Set(['chartId', 'title', 'total', 'hits', 'misses', 'accuracy', 'speed', 'offsetMs', 'duration', 'mode']);
const ARQUIVOS = Object.freeze([
  'cliente.js', 'estilo.css', 'nucleo.js', 'audio.js', 'detector.js',
  'capturar-worklet.js', 'detector-worker.js',
]);

function invalido(mensagem) {
  return Object.assign(new Error(mensagem), { status: 400 });
}

function numero(valor, minimo, maximo, nome, inteiro = false) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < minimo || valor > maximo || (inteiro && !Number.isInteger(valor))) {
    throw invalido(`${nome} inválido.`);
  }
  return valor;
}

/** Contrato fechado: dados inesperados (inclusive áudio e id de usuário) são recusados. */
function validarResumo(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw invalido('Resumo de treino inválido.');
  if (Object.keys(b).some((chave) => !CAMPOS.has(chave))) throw invalido('O resumo contém campos não permitidos.');
  if (b.mode !== 'practice') throw invalido('Somente prática com instrumento pode ser guardada; demonstrações não entram no histórico.');
  if (typeof b.chartId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(b.chartId)) throw invalido('Identificador do arranjo inválido.');
  if (typeof b.title !== 'string' || !b.title.trim() || b.title.length > 160 || /[\x00-\x1f\x7f<>]/.test(b.title)) throw invalido('Título do arranjo inválido.');

  const total = numero(b.total, 1, 10000, 'Total de notas', true);
  const hits = numero(b.hits, 0, total, 'Acertos', true);
  const misses = numero(b.misses, 0, total, 'Notas não reconhecidas', true);
  if (hits + misses !== total) throw invalido('O total deve corresponder aos acertos e às notas não reconhecidas.');
  numero(b.accuracy, 0, 100, 'Porcentagem');
  const accuracy = Math.round((hits / total) * 10000) / 100;
  // O núcleo exibe uma casa decimal; a API guarda duas. Aceita apenas
  // essa diferença de arredondamento, mantendo o cálculo derivado do total.
  if (Math.abs(b.accuracy - accuracy) > 0.051) throw invalido('A porcentagem não corresponde às notas informadas.');

  return {
    chartId: b.chartId,
    title: b.title.trim(),
    total, hits, misses, accuracy,
    speed: numero(b.speed, 0.25, 1.5, 'Velocidade'),
    offsetMs: numero(b.offsetMs, -1000, 1000, 'Compensação de atraso'),
    duration: numero(b.duration, 0.1, 7200, 'Duração'),
    mode: 'practice',
  };
}

function sessaoDe(linha) {
  return { id: linha.id, createdAt: linha.criado_em, ...JSON.parse(linha.resumo), vale_nota: false };
}

function historicoDe(usuario, limite = 100) {
  const quantidade = Number.isInteger(limite) && limite > 0 && limite <= 200 ? limite : 100;
  return db.prepare('SELECT id, resumo, criado_em FROM tocar_sessoes WHERE usuario = ? ORDER BY criado_em DESC, rowid DESC LIMIT ?')
    .all(usuario, quantidade).map(sessaoDe);
}

/** Exportação completa, sem o limite da lista de histórico da interface. */
function dadosDe(usuario) {
  return db.prepare('SELECT id, resumo, criado_em FROM tocar_sessoes WHERE usuario = ? ORDER BY criado_em DESC, rowid DESC')
    .all(usuario).map(sessaoDe);
}

function excluirDe(usuario) {
  return db.prepare('DELETE FROM tocar_sessoes WHERE usuario = ?').run(usuario).changes;
}

function montar(app, { requireUsuario, opcional } = {}) {
  if (typeof requireUsuario !== 'function' || typeof opcional !== 'function') throw new Error('tocar.montar: faltam os verificadores de sessão do Musique.');
  const B = '/music/api/tocar';
  app.use(B, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/music/tocar', opcional, (req, res) => {
    const estado = { logado: !!req.usuario };
    const corpo = `<link rel="stylesheet" href="/music/tocar/estilo.css">
<main id="tocar-app" data-estado="${esc(JSON.stringify(estado))}">
  <header class="tocar-cab"><p>Musique · violão e guitarra</p><h1>Tocar junto</h1>
  <p>Toque violão pelo microfone ou selecione uma interface de áudio ou cabo Real Tone. Afine e acompanhe notas isoladas na pista.</p></header>
  <p role="status">Preparando a sala de prática…</p>
</main>
<noscript><div class="wrap"><p>Ative o JavaScript para abrir a pista e escutar seu violão ou guitarra.</p></div></noscript>
<script src="/music/tocar/nucleo.js" defer></script>
<script src="/music/tocar/audio.js" defer></script>
<script src="/music/tocar/cliente.js" defer></script>`;
    res.set('Cache-Control', 'no-store').type('html').send(layout('Tocar junto · violão e guitarra | Musique', corpo, {
      caminho: '/music/tocar', noApp: estado.logado,
      descricao: 'Pratique violão ou guitarra pelo microfone, interface de áudio ou cabo Real Tone, com pista e afinador. Notas isoladas analisadas no seu aparelho.',
    }));
  });

  // Rotas exatas impedem servir código do servidor, banco ou caminhos arbitrários.
  for (const arquivo of ARQUIVOS) {
    app.get('/music/tocar/' + arquivo, (req, res, next) => {
      res.set('X-Content-Type-Options', 'nosniff');
      res.sendFile(path.join(__dirname, arquivo), { maxAge: 0 }, (erro) => {
        if (erro && !res.headersSent) res.status(erro.status === 404 ? 404 : 500).type('text').send('Arquivo indisponível.');
        else if (erro) next(erro);
      });
    });
  }

  app.get(B + '/demo', (req, res, next) => {
    try {
      const { demoChart } = require('./nucleo');
      res.json(typeof demoChart === 'function' ? demoChart() : demoChart);
    } catch (erro) { next(erro); }
  });

  app.get(B + '/sessoes', requireUsuario, (req, res) => {
    res.json({ sessoes: historicoDe(req.usuario.id), indicacao: INDICACAO, vale_nota: false });
  });

  app.post(B + '/sessoes', requireUsuario, (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ erro: 'Envie o resumo como JSON.' });
    // Captura e cálculo são locais: a API só verifica a coerência do resumo,
    // não atesta que o instrumento foi tocado e não alimenta ranking/boletim.
    let resumo;
    try { resumo = validarResumo(req.body); }
    catch (erro) { return res.status(400).json({ erro: erro.message }); }
    try {
      const id = novoId(), criado_em = nowISO();
      db.prepare('INSERT INTO tocar_sessoes (id, usuario, resumo, criado_em) VALUES (?, ?, ?, ?)')
        .run(id, req.usuario.id, JSON.stringify(resumo), criado_em);
      res.status(201).json({ ok: true, sessao: { id, createdAt: criado_em, ...resumo, vale_nota: false }, indicacao: INDICACAO });
    } catch (erro) { next(erro); }
  });
}

module.exports = { montar, validarResumo, historicoDe, dadosDe, excluirDe, INDICACAO };
