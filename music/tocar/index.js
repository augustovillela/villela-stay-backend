// Musique · Tocar junto — violão, guitarra e contrabaixo, captura local e histórico de treino.
// Não recebe áudio nem publica resultados. As medidas vêm do navegador:
// são indicações autodeclaradas de treino, nunca nota ou classificação.
'use strict';

const path = require('node:path');
const { db, novoId, nowISO } = require('../db');
const { layout, esc } = require('../paginas');
const SONS = require('./sons-manifesto');
const Campanha = require('./campanha');

const INDICACAO = 'Indicação de treino calculada no seu aparelho; não é nota nem avaliação do professor.';
const CAMPOS_PRATICA = new Set(['chartId', 'title', 'total', 'hits', 'misses', 'accuracy', 'speed', 'offsetMs', 'duration', 'mode', 'catalogRef']);
const CAMPOS_APRENDER = new Set(['chartId', 'title', 'total', 'hits', 'skipped', 'duration', 'mode', 'catalogRef']);
const ARQUIVOS = Object.freeze([
  'cliente.js', 'estilo.css', 'perfis.js', 'nucleo.js', 'midi.js', 'acordes.js', 'polifonico.js', 'audio.js', 'detector.js',
  'capturar-worklet.js', 'detector-worker.js', 'aprender.js', 'estudos.js', 'sessao-game.js',
  'formato-catalogo.js', 'formato-arranjo.js', 'catalogo-cliente.js', 'gerenciar.js',
  'editor-nucleo.js', 'editor-cliente.js', 'editor.css', 'importador-midi.js', 'importador-musicxml.js',
  'waveform.js', 'waveform-cliente.js', 'campanha.js',
  'pista-piano.js', 'pista-bateria.js', 'sons.js', 'sons-manifesto.js', 'creditos-sons.html',
  'audio-arranjo.js',
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
  if (b.mode !== 'practice' && b.mode !== 'learn') throw invalido('Somente prática com instrumento pode ser guardada; demonstrações não entram no histórico.');
  const campos = b.mode === 'learn' ? CAMPOS_APRENDER : CAMPOS_PRATICA;
  if (Object.keys(b).some((chave) => !campos.has(chave))) throw invalido('O resumo contém campos não permitidos.');
  if (typeof b.chartId !== 'string' || !/^[a-zA-Z0-9_-][a-zA-Z0-9_.:-]{0,119}$/.test(b.chartId)) throw invalido('Identificador do arranjo inválido.');
  if (typeof b.title !== 'string' || !b.title.trim() || b.title.length > 160 || /[\x00-\x1f\x7f<>]/.test(b.title)) throw invalido('Título do arranjo inválido.');

  const total = numero(b.total, 1, 10000, 'Total de notas', true);
  const hits = numero(b.hits, 0, total, 'Acertos', true);
  const base = {
    chartId: b.chartId, title: b.title.trim(), total, hits,
    duration: numero(b.duration, 0.1, 7200, 'Duração'), mode: b.mode,
  };
  // A referência enviada é mínima. Versão, obra e hash são resolvidos pelo
  // servidor depois de confirmar a sessão e o acesso atual à obra.
  if (Object.hasOwn(b, 'catalogRef')) {
    const ref = b.catalogRef;
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)
      || Object.keys(ref).length !== 4
      || Object.keys(ref).some(k => !['arranjoId', 'versionId', 'from', 'to'].includes(k))
      || !['arranjoId', 'versionId'].every(k => typeof ref[k] === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(ref[k]))) {
      throw invalido('Referência do catálogo inválida.');
    }
    const from = numero(ref.from, 0, 900, 'Início do trecho');
    const to = numero(ref.to, 0, 900, 'Fim do trecho');
    if (to <= from) throw invalido('O trecho do catálogo precisa ter duração positiva.');
    base.catalogRef = { arranjoId: ref.arranjoId, versionId: ref.versionId, from, to };
  }
  // Aprender não tem penalidade temporal nem porcentagem de precisão.
  // Somente rodadas concluídas, com cada nota reconhecida ou pulada, são guardadas.
  if (b.mode === 'learn') {
    const skipped = numero(b.skipped, 0, total, 'Notas puladas', true);
    if (hits + skipped !== total) throw invalido('O total deve corresponder às notas reconhecidas e puladas.');
    return { ...base, skipped };
  }
  const misses = numero(b.misses, 0, total, 'Notas não reconhecidas', true);
  if (hits + misses !== total) throw invalido('O total deve corresponder aos acertos e às notas não reconhecidas.');
  numero(b.accuracy, 0, 100, 'Porcentagem');
  const accuracy = Math.round((hits / total) * 10000) / 100;
  // O núcleo exibe uma casa decimal; a API guarda duas. Aceita apenas
  // essa diferença de arredondamento, mantendo o cálculo derivado do total.
  if (Math.abs(b.accuracy - accuracy) > 0.051) throw invalido('A porcentagem não corresponde às notas informadas.');

  return {
    ...base, misses, accuracy,
    speed: numero(b.speed, 0.25, 1.5, 'Velocidade'),
    offsetMs: numero(b.offsetMs, -1000, 1000, 'Compensação de atraso'),
  };
}

function sessaoDe(linha) {
  return { id: linha.id, createdAt: linha.criado_em, ...JSON.parse(linha.resumo), vale_nota: false };
}

function validarCampanha(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalido('Estado da campanha inválido.');
  const estado = Campanha.criar(body);
  if (JSON.stringify(estado).length > 50000) throw invalido('Estado da campanha excede o limite permitido.');
  return estado;
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

function dadosCampanhasDe(usuario) {
  return db.prepare('SELECT instrumento, estado, atualizado_em FROM tocar_campanhas WHERE usuario = ? ORDER BY instrumento')
    .all(usuario).map((linha) => ({
      instrumento: linha.instrumento,
      estado: JSON.parse(linha.estado),
      atualizado_em: linha.atualizado_em,
    }));
}

function excluirDe(usuario) {
  return db.prepare('DELETE FROM tocar_sessoes WHERE usuario = ?').run(usuario).changes;
}

function excluirCampanhasDe(usuario) {
  return db.prepare('DELETE FROM tocar_campanhas WHERE usuario = ?').run(usuario).changes;
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
  <header class="tocar-cab"><p>Musique · violão, guitarra e contrabaixo</p><h1>Tocar junto</h1>
  <p>Toque violão, guitarra ou contrabaixo pelo microfone ou selecione uma interface de áudio ou cabo Real Tone. Afine e acompanhe notas isoladas na pista.</p></header>
  <p role="status">Preparando a sala de prática…</p>
</main>
<noscript><div class="wrap"><p>Ative o JavaScript para abrir a pista e escutar seu violão, guitarra ou contrabaixo.</p></div></noscript>
<script src="/music/tocar/perfis.js" defer></script>
<script src="/music/tocar/nucleo.js" defer></script>
<script src="/music/tocar/midi.js" defer></script>
<script src="/music/tocar/acordes.js" defer></script>
<script src="/music/tocar/audio.js" defer></script>
<script src="/music/tocar/aprender.js" defer></script>
<script src="/music/tocar/estudos.js" defer></script>
<script src="/music/tocar/formato-catalogo.js" defer></script>
<script src="/music/tocar/formato-arranjo.js" defer></script>
<script src="/music/tocar/catalogo-cliente.js" defer></script>
<script src="/music/tocar/pista-piano.js" defer></script>
<script src="/music/tocar/pista-bateria.js" defer></script>
<script src="/music/tocar/sons-manifesto.js" defer></script>
<script src="/music/tocar/sons.js" defer></script>
<script src="/music/tocar/campanha.js" defer></script>
<script src="/music/tocar/audio-arranjo.js" defer></script>
<script src="/music/tocar/cliente.js" defer></script>`;
    res.set('Cache-Control', 'no-store').type('html').send(layout('Tocar junto · prática com instrumentos | Musique', corpo, {
      caminho: '/music/tocar', noApp: estado.logado,
      descricao: 'Pratique violão, guitarra ou contrabaixo pelo microfone, interface de áudio ou cabo Real Tone, com pista e afinador. Notas isoladas analisadas no seu aparelho.',
    }));
  });

  // A página contém somente a interface. Dados e cada ação editorial exigem
  // a sessão/assinatura e a propriedade da obra nas APIs do catálogo.
  app.get('/music/tocar/gerenciar', opcional, (req, res) => {
    const estado = { logado: !!req.usuario };
    const corpo = `<link rel="stylesheet" href="/music/tocar/estilo.css">
<link rel="stylesheet" href="/music/tocar/editor.css">
<main id="tocar-gestao" data-estado="${esc(JSON.stringify(estado))}">
  <header class="tocar-cab"><p>Musique · seu Acervo</p><h1>Gerenciar arranjos</h1>
  <p>Prepare uma versão, confira na pista e disponibilize para quem tem acesso à música.</p></header>
  <p role="status">Preparando seus arranjos…</p>
</main>
<noscript><div class="wrap"><p>Ative o JavaScript para gerenciar os arranjos do seu Acervo.</p></div></noscript>
<script src="/music/tocar/perfis.js" defer></script>
<script src="/music/tocar/nucleo.js" defer></script>
<script src="/music/tocar/formato-catalogo.js" defer></script>
<script src="/music/tocar/formato-arranjo.js" defer></script>
<script src="/music/tocar/estudos.js" defer></script>
<script src="/music/tocar/editor-nucleo.js" defer></script>
<script src="/music/tocar/editor-cliente.js" defer></script>
<script src="/music/tocar/importador-midi.js" defer></script>
<script src="/music/tocar/importador-musicxml.js" defer></script>
<script src="/music/tocar/waveform.js" defer></script>
<script src="/music/tocar/waveform-cliente.js" defer></script>\n<script src="/music/tocar/campanha.js" defer></script>
<script src="/music/tocar/gerenciar.js" defer></script>`;
    res.set('Cache-Control', 'no-store').type('html').send(layout('Gerenciar arranjos | Musique', corpo, {
      caminho: '/music/tocar/gerenciar', noApp: estado.logado,
      descricao: 'Prepare, revise e publique arranjos para a prática com instrumento no Musique.',
    }));
  });

  require('./rotas-catalogo').montar(app, { requireUsuario });

  // Somente amostras enumeradas no manifesto de distribuição ficam públicas.
  const amostras = new Set(Object.values(SONS.banks).flatMap(b => b.samples.map(s => s.file)));
  for (const arquivo of amostras) {
    if (!/^[a-z0-9][a-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9_-]*\.mp3$/.test(arquivo)) throw new Error('Caminho de amostra inválido.');
    app.get('/music/tocar/sons/' + arquivo, (req, res, next) => {
      res.set('X-Content-Type-Options', 'nosniff');
      res.sendFile(path.join(__dirname, 'sons', arquivo), { maxAge: 0 }, (erro) => {
        if (erro && !res.headersSent) res.status(erro.status === 404 ? 404 : 500).type('text').send('Som indisponível.');
        else if (erro) next(erro);
      });
    });
  }

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

  // Analisa apenas a camada textual do PDF durante a importação. O arquivo é
  // mantido em memória e não é salvo no acervo; a conversão de partitura
  // continua dependendo de um trabalhador OMR configurado separadamente.
  app.post(B + '/importar-pdf', requireUsuario, async (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ erro: 'Envie o PDF como JSON em base64.' });
    const corpo = req.body && req.body.base64;
    if (typeof corpo !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(corpo) || corpo.length % 4 !== 0) {
      return res.status(400).json({ erro: 'Base64 do PDF inválido.' });
    }
    let bytes;
    try { bytes = Buffer.from(corpo, 'base64'); }
    catch (_) { return res.status(400).json({ erro: 'Base64 do PDF inválido.' }); }
    try {
      const { analisarPdf, LIMITE_BYTES } = require('./importador-pdf');
      if (bytes.length > LIMITE_BYTES) return res.status(400).json({ erro: 'O PDF deve ter no máximo 10 MiB.' });
      const resultado = await analisarPdf(bytes, req.body.nome);
      if (resultado.texto.length > 200000) resultado.texto = resultado.texto.slice(0, 200000);
      res.json({ ok: true, ...resultado });
    } catch (erro) { next(erro); }
  });

  app.post(B + '/importar-pdf/omr', requireUsuario, async (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ erro: 'Envie o PDF como JSON em base64.' });
    const corpo = req.body && req.body.base64;
    if (typeof corpo !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(corpo) || corpo.length % 4 !== 0) {
      return res.status(400).json({ erro: 'Base64 do PDF inválido.' });
    }
    try {
      const { converterPdf } = require('./omr');
      const resultado = await converterPdf(Buffer.from(corpo, 'base64'), req.body.nome);
      res.json({ ok: true, nome: resultado.nome, arquivo: resultado.arquivo, extensao: resultado.extensao, musicxmlBase64: resultado.bytes.toString('base64') });
    } catch (erro) { next(erro); }
  });
  app.get(B + '/importar-pdf/omr/status', requireUsuario, (req, res) => {
    const { disponivel } = require('./omr');
    res.json({ ok: true, disponivel: disponivel() });
  });

  app.get(B + '/sessoes', requireUsuario, (req, res) => {
    res.json({ sessoes: historicoDe(req.usuario.id), indicacao: INDICACAO, vale_nota: false });
  });

  app.get(B + '/campanha/:instrumento', requireUsuario, (req, res) => {
    const instrumento = req.params.instrumento;
    const linha = db.prepare('SELECT estado, atualizado_em FROM tocar_campanhas WHERE usuario = ? AND instrumento = ?').get(req.usuario.id, instrumento);
    if (!linha) return res.json({ estado: Campanha.criar({ instrument: instrumento }), atualizado_em: null });
    try { return res.json({ estado: validarCampanha(JSON.parse(linha.estado)), atualizado_em: linha.atualizado_em }); }
    catch (_) { return res.json({ estado: Campanha.criar({ instrument: instrumento }), atualizado_em: null }); }
  });

  app.put(B + '/campanha/:instrumento', requireUsuario, (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ erro: 'Envie o estado da campanha como JSON.' });
    try {
      const enviado = validarCampanha(req.body);
      if (enviado.instrument !== req.params.instrumento) throw invalido('O instrumento da campanha não corresponde à rota.');
      const anterior = db.prepare('SELECT estado FROM tocar_campanhas WHERE usuario = ? AND instrumento = ?').get(req.usuario.id, enviado.instrument);
      const estado = anterior ? Campanha.mesclar(validarCampanha(JSON.parse(anterior.estado)), enviado) : enviado;
      const atualizado = nowISO();
      db.prepare(`INSERT INTO tocar_campanhas (usuario, instrumento, estado, atualizado_em) VALUES (?, ?, ?, ?)
        ON CONFLICT(usuario, instrumento) DO UPDATE SET estado = excluded.estado, atualizado_em = excluded.atualizado_em`)
        .run(req.usuario.id, estado.instrument, JSON.stringify(estado), atualizado);
      return res.json({ ok: true, estado, atualizado_em: atualizado });
    } catch (erro) { return res.status(erro.status >= 400 && erro.status < 500 ? erro.status : 400).json({ erro: erro.message }); }
  });

  app.post(B + '/sessoes', requireUsuario, (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ erro: 'Envie o resumo como JSON.' });
    // Captura e cálculo são locais: a API só verifica a coerência do resumo,
    // não atesta que o instrumento foi tocado e não alimenta ranking/boletim.
    let resumo;
    try { resumo = validarResumo(req.body); }
    catch (erro) { return res.status(400).json({ erro: erro.message }); }
    try {
      if (resumo.catalogRef) {
        resumo.catalogRef = require('./catalogo').resolverReferencia(req.usuario.id, resumo.catalogRef, resumo);
      }
      const id = novoId(), criado_em = nowISO();
      db.prepare('INSERT INTO tocar_sessoes (id, usuario, resumo, criado_em) VALUES (?, ?, ?, ?)')
        .run(id, req.usuario.id, JSON.stringify(resumo), criado_em);
      res.status(201).json({ ok: true, sessao: { id, createdAt: criado_em, ...resumo, vale_nota: false }, indicacao: INDICACAO });
    } catch (erro) {
      if (erro.status >= 400 && erro.status < 500) return res.status(erro.status).json({ erro: erro.message });
      next(erro);
    }
  });
}

module.exports = { montar, validarResumo, validarCampanha, historicoDe, dadosDe, dadosCampanhasDe, excluirDe, excluirCampanhasDe, INDICACAO };

