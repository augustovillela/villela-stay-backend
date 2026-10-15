// node --test music/tocar/test-servidor.js
// Express isolado, autenticação falsa e SQLite temporário; não inicia server.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'musique-tocar-test-'));
process.env.DATA_DIR = temporario;
const express = require('express');
const { montar, validarResumo, dadosDe, excluirDe } = require('./index');
const { db, DB_PATH } = require('../db');
const app = express();
app.use(express.json({ limit: '4kb' }));
const opcional = (req, res, next) => {
  const id = req.get('x-test-user');
  if (id) req.usuario = { id, nome: '<script>nome</script>', email: 'nao-expor@example.test' };
  next();
};
const requireUsuario = (req, res, next) => opcional(req, res, () => {
  if (!req.usuario) return res.status(401).json({ erro: 'Entre com a sua conta.' });
  next();
});
montar(app, { requireUsuario, opcional });
// Monta apenas API/páginas do Laboratório, sem filas, provedores ou server.js.
require('../laboratorio/rotas-api').registrarApi(app, { requireUsuario, opcional, ehDocente: () => false });
require('../laboratorio/paginas').registrar(app, { opcional, contextoDe: () => ({ logado: false, completo: false }) });
app.use((erro, req, res, next) => res.status(erro.status || 500).json({ erro: erro.message }));
let server, base;

const resumo = () => ({ chartId: 'estudo-guitarra-1', title: 'Meu estudo de guitarra', total: 4, hits: 3, misses: 1, accuracy: 75, speed: 0.75, offsetMs: 80, duration: 12, mode: 'practice' });
const aprendizado = () => ({ chartId: 'estudo-cordas-soltas', title: 'Cordas soltas', total: 6, hits: 4, skipped: 2, duration: 35, mode: 'learn' });
const enviar = (usuario, corpo, extra = {}) => fetch(base + '/music/api/tocar/sessoes', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(usuario ? { 'x-test-user': usuario } : {}), ...extra }, body: JSON.stringify(corpo),
});

test.before(async () => {
  assert.equal(DB_PATH, path.join(temporario, 'music', 'music.db'));
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = 'http://127.0.0.1:' + server.address().port;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  // Só a pasta única criada neste teste pode ser removida, nunca DATA_DIR externo.
  const pasta = path.resolve(temporario);
  assert.equal(path.dirname(pasta), path.resolve(os.tmpdir()));
  assert.ok(path.basename(pasta).startsWith('musique-tocar-test-'));
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('página pública tem bootstrap escapado sem identidade e apenas scripts próprios', async () => {
  const resposta = await fetch(base + '/music/tocar', { headers: { 'x-test-user': 'aluno-a' } });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get('cache-control'), 'no-store');
  const html = await resposta.text();
  assert.match(html, /id="tocar-app" data-estado="\{&quot;logado&quot;:true\}"/);
  assert.match(html, /\/music\/tocar\/cliente\.js/);
  for (const script of ['aprender', 'estudos']) {
    assert.ok(html.includes('/music/tocar/' + script + '.js'));
    assert.ok(html.indexOf('/music/tocar/' + script + '.js') < html.indexOf('/music/tocar/cliente.js'));
  }
  assert.doesNotMatch(html, /nao-expor|<script>nome|laboratorio\.js|laboratorio-nucleo\.js/);
  const anonimo = await (await fetch(base + '/music/tocar')).text();
  assert.match(anonimo, /&quot;logado&quot;:false/);
});

test('demonstração pública usa exatamente o arranjo do núcleo', async () => {
  const resposta = await fetch(base + '/music/api/tocar/demo');
  assert.equal(resposta.status, 200);
  const { demoChart } = require('./nucleo');
  const esperado = typeof demoChart === 'function' ? demoChart() : demoChart;
  assert.deepEqual(await resposta.json(), esperado);
});

test('arquivos de servidor e caminhos não autorizados não ficam públicos', async () => {
  for (const arquivo of ['index.js', 'test-servidor.js', 'test-aprender.js', 'test-estudos.js', 'schema.sql', '%2e%2e%2fdb.js']) {
    assert.equal((await fetch(base + '/music/tocar/' + arquivo)).status, 404, arquivo);
  }
  const nucleo = await fetch(base + '/music/tocar/nucleo.js');
  assert.equal(nucleo.status, 200);
  assert.match(nucleo.headers.get('content-type'), /javascript/);
  assert.equal(nucleo.headers.get('x-content-type-options'), 'nosniff');
  for (const arquivo of ['aprender.js', 'estudos.js']) {
    const asset = await fetch(base + '/music/tocar/' + arquivo);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /javascript/);
    assert.equal(asset.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('salvar e consultar exigem autenticação', async () => {
  assert.equal((await enviar(null, resumo())).status, 401);
  assert.equal((await enviar(null, aprendizado())).status, 401);
  assert.equal((await fetch(base + '/music/api/tocar/sessoes')).status, 401);
});

test('histórico pertence à sessão e traz indicação explícita, sem nota', async () => {
  const salvar = await enviar('aluno-a', resumo());
  assert.equal(salvar.status, 201);
  const recebido = await salvar.json();
  assert.equal(recebido.sessao.vale_nota, false);
  assert.equal(recebido.sessao.accuracy, 75);
  assert.match(recebido.indicacao, /não é nota/);
  assert.doesNotMatch(JSON.stringify(recebido), /aluno-a|nao-expor/);
  const lista = await (await fetch(base + '/music/api/tocar/sessoes', { headers: { 'x-test-user': 'aluno-a' } })).json();
  assert.equal(lista.sessoes.length, 1);
  assert.equal(lista.sessoes[0].id, recebido.sessao.id);
  const outra = await (await fetch(base + '/music/api/tocar/sessoes', { headers: { 'x-test-user': 'aluno-b' } })).json();
  assert.deepEqual(outra.sessoes, []);
  assert.equal((await enviar('aluno-b', { ...resumo(), usuario: 'aluno-a' })).status, 400);
});

test('rejeita demonstração, valores incoerentes, áudio e campos extras', async () => {
  const entradas = [
    { mode: 'demo' }, { mode: 'simulation' }, { demo: true }, { audio: 'base64' },
    { total: 0 }, { hits: 4 }, { misses: 0 }, { accuracy: 99 }, { hits: '3' },
    { speed: -1 }, { speed: 100 }, { duration: null }, { offsetMs: 1001 },
    { chartId: '../server.js' }, { title: '<img src=x onerror=alert(1)>' },
    { title: 'x'.repeat(161) }, { title: '\u0000' },
  ];
  for (const entrada of entradas) {
    assert.equal((await enviar('aluno-a', { ...resumo(), ...entrada })).status, 400, JSON.stringify(entrada));
  }
  for (const valor of [NaN, Infinity, -Infinity]) assert.throws(() => validarResumo({ ...resumo(), speed: valor }), /inválido/);
  assert.equal((await enviar('aluno-a', resumo(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal(dadosDe('aluno-a').length, 1);
});

test('arredondamento consistente e limites válidos são preservados', () => {
  const r = validarResumo({ ...resumo(), total: 3, hits: 1, misses: 2, accuracy: 33.3, speed: 0.25, offsetMs: -1000, duration: 0.1 });
  assert.equal(r.accuracy, 33.33);
  assert.equal(r.speed, 0.25);
});

test('aprender guarda reconhecidas e puladas, convive com histórico anterior e mantém isolamento', async () => {
  const salvo = await enviar('aluno-aprender', aprendizado());
  assert.equal(salvo.status, 201);
  const { sessao } = await salvo.json();
  assert.equal(sessao.mode, 'learn');
  assert.equal(sessao.hits, 4);
  assert.equal(sessao.skipped, 2);
  assert.equal(sessao.vale_nota, false);
  for (const campo of ['accuracy', 'misses', 'speed', 'offsetMs', 'usuario', 'audio']) assert.equal(campo in sessao, false, campo);
  assert.equal((await enviar('aluno-aprender', resumo())).status, 201);
  const lista = await (await fetch(base + '/music/api/tocar/sessoes', { headers: { 'x-test-user': 'aluno-aprender' } })).json();
  assert.deepEqual(lista.sessoes.map(s => s.mode), ['practice', 'learn']);
  assert.equal(lista.sessoes[0].accuracy, 75);
  const outra = await (await fetch(base + '/music/api/tocar/sessoes', { headers: { 'x-test-user': 'aluno-aprender-outro' } })).json();
  assert.deepEqual(outra.sessoes, []);
  const exportacao = await (await fetch(base + '/music/api/lab/meus-dados', { headers: { 'x-test-user': 'aluno-aprender' } })).json();
  assert.equal(exportacao.tocar_junto.length, 2);
  assert.equal(exportacao.tocar_junto.find(s => s.mode === 'learn').skipped, 2);
  assert.equal(excluirDe('aluno-aprender'), 2);
  assert.deepEqual(dadosDe('aluno-aprender'), []);
  assert.equal(dadosDe('aluno-a').length, 1);
});

test('aprender rejeita rodada incompleta, métricas temporais, áudio e tentativas de escolher usuário', async () => {
  for (const alteracao of [
    { total: 0 }, { total: 7 }, { hits: -1 }, { hits: 4.5 }, { skipped: '2' },
    { skipped: -1 }, { skipped: 3 }, { skipped: null }, { duration: 0 }, { duration: 7201 },
    { accuracy: 66.7 }, { misses: 2 }, { speed: 1 }, { offsetMs: 0 },
    { audio: 'base64' }, { usuario: 'aluno-a' }, { pending: 1 }, { mode: 'demo' },
  ]) {
    assert.equal((await enviar('aluno-aprender-invalido', { ...aprendizado(), ...alteracao })).status, 400, JSON.stringify(alteracao));
  }
  for (const campo of ['total', 'hits', 'skipped', 'duration']) {
    for (const valor of [NaN, Infinity, -Infinity]) {
      assert.throws(() => validarResumo({ ...aprendizado(), [campo]: valor }), /inválido/);
    }
    const faltante = aprendizado(); delete faltante[campo];
    assert.throws(() => validarResumo(faltante), /inválido/);
  }
  assert.deepEqual(dadosDe('aluno-aprender-invalido'), []);
  assert.equal(validarResumo({ ...aprendizado(), hits: 0, skipped: 6, duration: 0.1 }).skipped, 6);
  assert.equal(validarResumo({ ...aprendizado(), hits: 6, skipped: 0, duration: 7200 }).hits, 6);
});

test('exportação e exclusão completas afetam apenas o próprio usuário', async () => {
  await enviar('aluno-b', { ...resumo(), chartId: 'local-meu-arranjo', title: 'Arranjo próprio' });
  assert.equal(dadosDe('aluno-a').length, 1);
  assert.equal(dadosDe('aluno-b').length, 1);
  assert.equal(excluirDe('aluno-a'), 1);
  assert.deepEqual(dadosDe('aluno-a'), []);
  assert.equal(dadosDe('aluno-b').length, 1);
});

test('hooks de privacidade do Laboratório incluem Tocar junto e isolam contas', async () => {
  await enviar('aluno-a', resumo());
  const exportar = await fetch(base + '/music/api/lab/meus-dados', { headers: { 'x-test-user': 'aluno-a' } });
  assert.equal(exportar.status, 200);
  const dados = await exportar.json();
  assert.equal(dados.tocar_junto.length, 1);
  assert.equal(dados.tocar_junto[0].chartId, 'estudo-guitarra-1');
  assert.equal(dados.tocar_junto[0].vale_nota, false);
  const apagar = (confirmacao, usuario = 'aluno-a') => fetch(base + '/music/api/lab/meus-dados/excluir', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user': usuario }, body: JSON.stringify({ confirmacao }),
  });
  assert.equal((await apagar('NÃO')).status, 400);
  assert.equal(dadosDe('aluno-a').length, 1);
  assert.equal((await apagar('EXCLUIR')).status, 200);
  assert.deepEqual(dadosDe('aluno-a'), []);
  assert.equal(dadosDe('aluno-b').length, 1);
});

test('entrada do Laboratório abre a rota própria, sem usar dispatcher de ferramentas', async () => {
  for (const caminho of ['/music/laboratorio', '/music/praticar']) {
    const res = await fetch(base + caminho);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /href="\/music\/tocar"/);
  }
  const CAT = require('../laboratorio/catalogo');
  const entrada = CAT.entradas().find((item) => item.url === '/music/tocar');
  assert.equal(entrada.titulo, 'Tocar junto · violão e guitarra');
  assert.ok(!CAT.FERRAMENTAS.some((item) => item.slug === 'tocar'));
});
