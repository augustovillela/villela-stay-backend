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
app.use(express.json({ limit: '2mb' }));
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
  for (const script of ['aprender', 'estudos', 'formato-catalogo', 'catalogo-cliente']) {
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
  for (const arquivo of ['index.js', 'catalogo.js', 'rotas-catalogo.js', 'test-catalogo.js', 'test-servidor.js', 'test-aprender.js', 'test-estudos.js', 'test-editor-nucleo.js', 'test-editor-cliente.js', 'test-importador-midi.js', 'schema.sql', '%2e%2e%2fdb.js']) {
    assert.equal((await fetch(base + '/music/tocar/' + arquivo)).status, 404, arquivo);
  }
  const nucleo = await fetch(base + '/music/tocar/nucleo.js');
  assert.equal(nucleo.status, 200);
  assert.match(nucleo.headers.get('content-type'), /javascript/);
  assert.equal(nucleo.headers.get('x-content-type-options'), 'nosniff');
  for (const arquivo of ['aprender.js', 'estudos.js', 'formato-catalogo.js', 'catalogo-cliente.js', 'editor-nucleo.js', 'editor-cliente.js', 'importador-midi.js', 'gerenciar.js']) {
    const asset = await fetch(base + '/music/tocar/' + arquivo);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /javascript/);
    assert.equal(asset.headers.get('x-content-type-options'), 'nosniff');
  }
  const estiloEditor = await fetch(base + '/music/tocar/editor.css');
  assert.equal(estiloEditor.status, 200);
  assert.match(estiloEditor.headers.get('content-type'), /text\/css/);
});

test('gestão pública só entrega a interface e não incorpora identidade ou obras', async () => {
  for (const usuario of [null, 'editor-catalogo']) {
    const resposta = await fetch(base + '/music/tocar/gerenciar', { headers: usuario ? { 'x-test-user': usuario } : {} });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.headers.get('cache-control'), 'no-store');
    const html = await resposta.text();
    assert.match(html, /id="tocar-gestao"/);
    assert.match(html, /\/music\/tocar\/gerenciar\.js/);
    assert.match(html, /\/music\/tocar\/editor\.css/);
    const scripts = ['nucleo', 'editor-nucleo', 'editor-cliente', 'importador-midi', 'gerenciar'].map(nome => html.indexOf('src="/music/tocar/' + nome + '.js"'));
    assert.ok(scripts.every(posicao => posicao >= 0));
    assert.ok(scripts.every((posicao, i) => i === 0 || posicao > scripts[i - 1]), 'O núcleo e o editor devem carregar antes da integração do gestor.');
    assert.doesNotMatch(html, /nao-expor|<script>nome|editor-catalogo/);
  }
});

async function catalogoHTTP(usuario, caminho, method = 'GET', corpo) {
  const resposta = await fetch(base + '/music/api/tocar' + caminho, {
    method, headers: { ...(usuario ? { 'x-test-user': usuario } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  return { status: resposta.status, body: await resposta.json() };
}

async function fixtureCatalogo(dono, titulo = 'Estudo para catálogo') {
  const repo = require('../repo');
  const obra = repo.Obras.criar({ dono, titulo, titularidade: 'propria' });
  const chart = require('./estudos').obter('cordas-soltas-v1');
  chart.title = titulo;
  const documento = { title: titulo, instrument: 'violao', level: 'iniciante', technique: 'cordas-soltas',
    objective: 'Tocar cada corda solta com clareza.', credits: 'Estudo original Musique, preparação de teste.', mediaId: '', chart };
  const criada = await catalogoHTTP(dono, '/gestao/arranjos', 'POST', { obraId: obra.id, documento });
  assert.equal(criada.status, 201, JSON.stringify(criada.body));
  return { obra, documento, arranjo: criada.body.arranjo };
}

function chartEditado(titulo) {
  return {
    id: '_arranjo-visual', title: titulo, bpm: 87.5, duration: 2.875,
    tuning: [40, 45, 50, 55, 59, 64],
    notes: [
      { id: 'mi-01', time: 0.125, duration: 1 / 3, string: 6, fret: 2, midi: 42 },
      { id: '_la-02', time: 0.75, duration: 0.125, string: 5, fret: 0, midi: 45 },
      { id: '-si-03', time: 1.375, duration: 0.25, string: 2, fret: 1, midi: 60 },
    ],
    sections: [
      { id: 'frase-A', title: 'Primeira frase', from: 0.125, to: 1.125 },
      { id: '_frase-B', title: 'Resposta', from: 1.375, to: 2.875 },
    ],
    metadata: { demo: false },
  };
}

test('edição de notas salva e reabre tempos fracionários, IDs e frases sem arredondamento', async () => {
  const dono = 'editor-visual-precisao', f = await fixtureCatalogo(dono, 'Frases editadas');
  const documento = { ...f.documento, chart: chartEditado(f.documento.title) };
  // A normalização ordena pelo tempo, sem renumerar IDs ou quantizar tempos.
  documento.chart.notes.reverse(); documento.chart.sections.reverse();
  const esperado = require('./formato-catalogo').validarDocumento(documento);
  const salva = await catalogoHTTP(dono, '/gestao/arranjos/' + f.arranjo.id, 'PUT', { revision: f.arranjo.revision, documento });
  assert.equal(salva.status, 200, JSON.stringify(salva.body));
  assert.equal(salva.body.arranjo.revision, f.arranjo.revision + 1);
  assert.deepEqual(salva.body.arranjo.documento, esperado);
  const reaberta = await catalogoHTTP(dono, '/gestao/arranjos/' + f.arranjo.id);
  assert.equal(reaberta.status, 200);
  assert.deepEqual(reaberta.body.arranjo.documento, esperado);
  const chart = reaberta.body.arranjo.documento.chart;
  assert.equal(chart.bpm, 87.5); assert.equal(chart.duration, 2.875);
  assert.deepEqual(chart.notes.map(n => n.id), ['mi-01', '_la-02', '-si-03']);
  assert.equal(chart.notes[0].duration, 1 / 3);
  assert.deepEqual(chart.sections.map(s => [s.id, s.from, s.to]), [['frase-A', 0.125, 1.125], ['_frase-B', 1.375, 2.875]]);
});

test('edição inválida por sobreposição não altera revisão, rascunho ou versão publicada', async () => {
  const dono = 'editor-visual-atomico', f = await fixtureCatalogo(dono, 'Edição atômica');
  const documento = { ...f.documento, chart: chartEditado(f.documento.title) };
  const salvo = await catalogoHTTP(dono, '/gestao/arranjos/' + f.arranjo.id, 'PUT', { revision: f.arranjo.revision, documento });
  assert.equal(salvo.status, 200);
  const publicada = await catalogoHTTP(dono, '/gestao/arranjos/' + f.arranjo.id + '/publicar', 'POST', { revision: salvo.body.arranjo.revision });
  assert.equal(publicada.status, 200);
  const antes = publicada.body.arranjo;
  const snapshot = await catalogoHTTP(dono, '/catalogo/' + antes.id);
  const sobreposta = structuredClone(antes.documento);
  sobreposta.chart.notes[1].time = 0.25;
  const recusada = await catalogoHTTP(dono, '/gestao/arranjos/' + antes.id, 'PUT', { revision: antes.revision, documento: sobreposta });
  assert.equal(recusada.status, 400); assert.match(recusada.body.erro, /sobrepostas/i);
  assert.deepEqual((await catalogoHTTP(dono, '/gestao/arranjos/' + antes.id)).body.arranjo, antes);
  assert.deepEqual((await catalogoHTTP(dono, '/catalogo/' + antes.id)).body, snapshot.body);
  // Nem apagar todas as notas nem discordar da afinação deve persistir pela API.
  for (const invalidar of [c => { c.notes = []; }, c => { c.notes[0].fret += 1; }]) {
    const invalida = structuredClone(antes.documento); invalidar(invalida.chart);
    assert.equal((await catalogoHTTP(dono, '/gestao/arranjos/' + antes.id, 'PUT', { revision: antes.revision, documento: invalida })).status, 400);
    assert.deepEqual((await catalogoHTTP(dono, '/gestao/arranjos/' + antes.id)).body.arranjo, antes);
  }
});

test('editar notas e frases prepara nova publicação sem reescrever a versão anterior', async () => {
  const dono = 'editor-visual-versoes', f = await fixtureCatalogo(dono, 'Publicações do editor');
  const primeira = await catalogoHTTP(dono, '/gestao/arranjos/' + f.arranjo.id + '/publicar', 'POST', { revision: f.arranjo.revision });
  assert.equal(primeira.status, 200);
  const a1 = primeira.body.arranjo;
  const versao1 = await catalogoHTTP(dono, '/catalogo/' + a1.id + '/versoes/' + a1.publishedVersionId);
  const editado = { ...f.documento, chart: chartEditado(f.documento.title) };
  const salvo = await catalogoHTTP(dono, '/gestao/arranjos/' + a1.id, 'PUT', { revision: a1.revision, documento: editado });
  assert.equal(salvo.status, 200);
  assert.equal(salvo.body.arranjo.publishedVersionId, a1.publishedVersionId);
  assert.deepEqual((await catalogoHTTP(dono, '/catalogo/' + a1.id)).body, versao1.body, 'Editar rascunho mantém a publicação anterior.');
  const segunda = await catalogoHTTP(dono, '/gestao/arranjos/' + a1.id + '/publicar', 'POST', { revision: salvo.body.arranjo.revision });
  assert.equal(segunda.status, 200);
  const a2 = segunda.body.arranjo;
  assert.notEqual(a2.publishedVersionId, a1.publishedVersionId);
  const versao2 = await catalogoHTTP(dono, '/catalogo/' + a1.id);
  assert.equal(versao2.status, 200);
  assert.equal(versao2.body.arranjo.versionNumber, 2);
  assert.notEqual(versao2.body.arranjo.sha256, versao1.body.arranjo.sha256);
  assert.deepEqual(versao2.body.documento, require('./formato-catalogo').validarDocumento(editado));
  assert.deepEqual((await catalogoHTTP(dono, '/catalogo/' + a1.id + '/versoes/' + a1.publishedVersionId)).body, versao1.body);
  assert.deepEqual((await catalogoHTTP(dono, '/gestao/arranjos/' + a1.id)).body.arranjo.documento, versao2.body.documento);
});

test('sessões do catálogo fixam versão e trecho mesmo após editar, republicar e retirar', async () => {
  const dono = 'catalogo-editor', aluno = 'catalogo-aluno';
  const f = await fixtureCatalogo(dono);
  require('../direitos').definirVisibilidade({ obraId: f.obra.id, usuario: dono, visibilidade: 'publica' });
  const publicada = await catalogoHTTP(dono, '/gestao/arranjos/' + f.arranjo.id + '/publicar', 'POST', { revision: f.arranjo.revision });
  assert.equal(publicada.status, 200, JSON.stringify(publicada.body));
  let atual = publicada.body.arranjo;
  const aberta = await catalogoHTTP(aluno, '/catalogo/' + atual.id);
  assert.equal(aberta.status, 200);
  const anterior = aberta.body.arranjo;
  const from = f.documento.chart.sections[0].from, to = f.documento.chart.sections[0].to;
  const total = f.documento.chart.notes.filter(n => n.time >= from && n.time < to).length;
  const catalogRef = { arranjoId: atual.id, versionId: anterior.versionId, from, to };
  const treino = { chartId: f.documento.chart.id, title: f.documento.title, total, hits: total, misses: 0, accuracy: 100,
    speed: 1, offsetMs: 0, duration: to - from, mode: 'practice', catalogRef };

  // A outra publicação ocorre enquanto o aluno ainda está na versão anterior.
  const nova = structuredClone(f.documento); nova.title = nova.chart.title = 'Estudo revisado';
  const editada = await catalogoHTTP(dono, '/gestao/arranjos/' + atual.id, 'PUT', { revision: atual.revision, documento: nova });
  assert.equal(editada.status, 200, JSON.stringify(editada.body)); atual = editada.body.arranjo;
  const segunda = await catalogoHTTP(dono, '/gestao/arranjos/' + atual.id + '/publicar', 'POST', { revision: atual.revision });
  assert.equal(segunda.status, 200); atual = segunda.body.arranjo;
  assert.notEqual(atual.publishedVersionId, anterior.versionId);

  const salvo = await enviar(aluno, treino);
  assert.equal(salvo.status, 201, await salvo.clone().text());
  const sessao = (await salvo.json()).sessao;
  assert.equal(sessao.title, f.documento.title);
  assert.deepEqual(Object.keys(sessao.catalogRef).sort(), ['arranjoId', 'versionId', 'versionNumber', 'sha256', 'obraId', 'from', 'to'].sort());
  assert.equal(sessao.catalogRef.versionId, anterior.versionId);
  assert.equal(sessao.catalogRef.versionNumber, 1);
  assert.equal(sessao.catalogRef.obraId, f.obra.id);
  assert.match(sessao.catalogRef.sha256, /^[a-f0-9]{64}$/);
  assert.equal(sessao.vale_nota, false);

  const retirada = await catalogoHTTP(dono, '/gestao/arranjos/' + atual.id + '/retirar', 'POST', { revision: atual.revision });
  assert.equal(retirada.status, 200);
  assert.equal((await catalogoHTTP(aluno, '/catalogo/' + atual.id)).status, 404);
  const aprendendo = { chartId: treino.chartId, title: treino.title, total, hits: 1, skipped: total - 1, duration: 12, mode: 'learn', catalogRef };
  assert.equal((await enviar(aluno, aprendendo)).status, 201, 'Rodada já iniciada pode terminar após retirada, enquanto houver acesso à obra.');
  const exportado = await (await fetch(base + '/music/api/lab/meus-dados', { headers: { 'x-test-user': aluno } })).json();
  assert.equal(exportado.tocar_junto.length, 2);
  assert.ok(exportado.tocar_junto.every(s => s.catalogRef.versionId === anterior.versionId));
  assert.deepEqual(dadosDe(dono), []);

  // Revogar a visibilidade da obra já impede novos resultados desse aluno.
  require('../direitos').definirVisibilidade({ obraId: f.obra.id, usuario: dono, visibilidade: 'privada' });
  const negada = await enviar(aluno, treino);
  assert.ok([403, 404].includes(negada.status));
  assert.equal(dadosDe(aluno).length, 2);
});

test('referência de catálogo não aceita falsificar versão, intervalo, título ou total', async () => {
  const dono = 'catalogo-validacao', f = await fixtureCatalogo(dono, 'Validação de sessão');
  const draftRef = { arranjoId: f.arranjo.id, versionId: 'versao-inexistente', from: 0, to: f.documento.chart.duration };
  const total = f.documento.chart.notes.length;
  const treino = { chartId: f.documento.chart.id, title: f.documento.title, total, hits: 0, skipped: total, duration: 8, mode: 'learn', catalogRef: draftRef };
  assert.ok([400, 404].includes((await enviar(dono, treino)).status));
  const pub = await catalogoHTTP(dono, '/gestao/arranjos/' + f.arranjo.id + '/publicar', 'POST', { revision: f.arranjo.revision });
  assert.equal(pub.status, 200);
  treino.catalogRef = { ...draftRef, versionId: pub.body.arranjo.publishedVersionId };
  for (const mudanca of [
    { title: 'Título falsificado' }, { chartId: 'chart-inventado' }, { total: total - 1, skipped: total - 1 },
    { catalogRef: { ...treino.catalogRef, from: 3 } },
    { catalogRef: { ...treino.catalogRef, to: f.documento.chart.duration + 1 } },
    { catalogRef: { ...treino.catalogRef, to: 0 } },
    { catalogRef: { ...treino.catalogRef, versionNumber: 1 } },
    { catalogRef: null }, { catalogRef: [] }, { catalogRef: { ...treino.catalogRef, from: '0' } },
  ]) assert.equal((await enviar(dono, { ...treino, ...mudanca })).status, 400, JSON.stringify(mudanca));
  assert.deepEqual(dadosDe(dono), []);
});

test('IDs de chart aceitos pelo núcleo com hífen ou sublinhado inicial podem guardar rodada', async () => {
  for (const chartId of ['_estudo-valido', '-estudo-valido']) {
    const chart = require('./nucleo').validarChart({ ...require('./estudos').obter('cordas-soltas-v1'), id: chartId });
    const dono = 'catalogo-id-' + chartId;
    const f = await fixtureCatalogo(dono, chart.title);
    f.documento.chart.id = chart.id;
    const editada = await catalogoHTTP(dono, '/gestao/arranjos/' + f.arranjo.id, 'PUT', { revision: f.arranjo.revision, documento: f.documento });
    const publicada = await catalogoHTTP(dono, '/gestao/arranjos/' + f.arranjo.id + '/publicar', 'POST', { revision: editada.body.arranjo.revision });
    const r = await enviar(dono, { chartId, title: chart.title, total: chart.notes.length, hits: 0, skipped: chart.notes.length, mode: 'learn', duration: 2,
      catalogRef: { arranjoId: f.arranjo.id, versionId: publicada.body.arranjo.publishedVersionId, from: 0, to: chart.duration } });
    assert.equal(r.status, 201, await r.clone().text());
    assert.equal((await r.json()).sessao.chartId, chartId);
  }
});

test('backup e exclusão do Acervo incluem catálogo próprio sem apagar treino de outro usuário', async () => {
  const dono = 'catalogo-privacidade', aluno = 'catalogo-historico-preservado';
  const f = await fixtureCatalogo(dono, 'Obra a exportar');
  require('../direitos').definirVisibilidade({ obraId: f.obra.id, usuario: dono, visibilidade: 'publica' });
  const publicada = await catalogoHTTP(dono, '/gestao/arranjos/' + f.arranjo.id + '/publicar', 'POST', { revision: f.arranjo.revision });
  const ref = { arranjoId: f.arranjo.id, versionId: publicada.body.arranjo.publishedVersionId, from: 0, to: f.documento.chart.duration };
  const total = f.documento.chart.notes.length;
  assert.equal((await enviar(aluno, { chartId: f.documento.chart.id, title: f.documento.title, total, hits: 0, skipped: total, duration: 20, mode: 'learn', catalogRef: ref })).status, 201);
  const { Exportar } = require('../cifras/exportar');
  const backup = Exportar.tudo(dono);
  assert.ok(JSON.stringify(backup.tocar_arranjos).includes(ref.versionId));
  assert.ok(!JSON.stringify(Exportar.tudo(aluno).tocar_arranjos).includes(ref.versionId));
  assert.throws(() => Exportar.excluirTudo(dono, 'NÃO'));
  Exportar.excluirTudo(dono, 'EXCLUIR MINHAS CIFRAS');
  assert.equal(require('../repo').Obras.porId(f.obra.id), null);
  assert.ok(!JSON.stringify(Exportar.tudo(dono).tocar_arranjos).includes(ref.versionId));
  assert.equal(dadosDe(aluno).length, 1);
  assert.equal(dadosDe(aluno)[0].catalogRef.versionId, ref.versionId);
  assert.equal(excluirDe(aluno), 1);
});

test('exclusão legada de obra remove arranjos tocáveis na mesma transação', async () => {
  const dono = 'catalogo-exclusao-legada', f = await fixtureCatalogo(dono, 'Exclusão da obra');
  require('../repo').Obras.excluir(f.obra.id, dono);
  assert.equal(require('../repo').Obras.porId(f.obra.id), null);
  assert.ok(!JSON.stringify(require('./catalogo').dadosDe(dono)).includes(f.arranjo.id));
});

test('catálogo usa o portão real de assinatura; estudos públicos continuam abertos', async () => {
  const { Contas } = require('../contas');
  const conta = Contas.criar({ nome: 'Teste assinatura', email: 'catalogo-assinatura@example.test' }, { senhaHash: 'hash-de-teste-local' });
  db.prepare('UPDATE contas_music SET criado_em = ? WHERE id = ?').run(new Date(Date.now() - 40 * 86400000).toISOString(), conta.id);
  const sessao = require('../sessao').criar({ resolver(req) { return req.get('x-test-user') === conta.id ? { usuario: Contas.publica(Contas.porId(conta.id)) } : null; } });
  const isolado = express(); isolado.use(express.json()); montar(isolado, sessao);
  const s = await new Promise(resolve => { const v = isolado.listen(0, '127.0.0.1', () => resolve(v)); });
  const b = 'http://127.0.0.1:' + s.address().port;
  try {
    for (const caminho of ['/catalogo', '/gestao/obras', '/gestao/arranjos']) {
      assert.equal((await fetch(b + '/music/api/tocar' + caminho)).status, 401);
      assert.equal((await fetch(b + '/music/api/tocar' + caminho, { headers: { 'x-test-user': conta.id } })).status, 402);
    }
    assert.equal((await fetch(b + '/music/tocar')).status, 200);
    assert.equal((await fetch(b + '/music/api/tocar/demo')).status, 200);
    assert.equal((await fetch(b + '/music/tocar/estudos.js')).status, 200);
  } finally { await new Promise(resolve => s.close(resolve)); }
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
