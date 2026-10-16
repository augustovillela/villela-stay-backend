// node --test music/tocar/test-catalogo.js
// Banco temporário, sessão injetada e assinador falso: nunca usa contas/R2 reais.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'musique-catalogo-test-'));
process.env.DATA_DIR = temporario;
const express = require('express');
const { db, DB_PATH, novoId } = require('../db');
const repo = require('../repo');
const direitos = require('../direitos');
const Catalogo = require('./catalogo');
const storage = require('../storage');
const { montar } = require('./rotas-catalogo');
const app = express();
app.use(express.json({ limit: '1100kb' }));
function requireUsuario(req, res, next) {
  if (!req.get('x-test-user')) return res.status(401).json({ erro: 'Entre no Musique.' });
  if (req.get('x-test-paid') === 'no') return res.status(402).json({ codigo: 'ASSINATURA' });
  req.usuario = { id: req.get('x-test-user') }; next();
}
montar(app, { requireUsuario });
app.use((e, req, res, next) => res.status(e.status || 500).json({ erro: e.message }));
let server, base, seq = 0, assinadas = [];
const storageOriginal = { ativo: storage.ativo, urlDeLeitura: storage.urlDeLeitura };

function documento(extra = {}) {
  const title = extra.title || 'Estudo de cordas';
  return { title, instrument: 'violao', level: 'iniciante', technique: 'cordas-soltas',
    objective: 'Reconhecer e repetir as cordas graves.', credits: 'Estudo original de teste.', mediaId: '',
    chart: { id: 'teste-cordas', title, bpm: 60, duration: 8, tuning: [40, 45, 50, 55, 59, 64],
      notes: [0, 2, 4].map((time, i) => ({ id: 'nota-' + i, time, duration: 0.4, string: 6, fret: i, midi: 40 + i })),
      sections: [{ id: 'frase', title: 'Primeiras duas', from: 0, to: 4 }] }, ...extra };
}
function fixture(extra = {}) {
  const dono = 'dono-' + (++seq), outro = 'outro-' + seq;
  const obra = repo.Obras.criar({ dono, titulo: 'Obra ' + seq, titularidade: 'propria' });
  const a = Catalogo.criar(dono, { obraId: obra.id, documento: documento(extra) });
  return { dono, outro, obra, a };
}
function publicar(f) { f.a = Catalogo.publicar(f.dono, f.a.id, { revision: f.a.revision }); return f.a.publishedVersionId; }
function listarIds(usuario) { return Catalogo.listar(usuario, { limit: 50 }).arranjos.map((a) => a.id); }
function acessoPublico(f) { direitos.definirVisibilidade({ obraId: f.obra.id, usuario: f.dono, visibilidade: 'publica' }); }
function anexar(f, { dono = f.dono, mime = 'audio/wav', estado = 'pronta', obraId = f.obra.id, url = '', titulo = 'Acompanhamento' } = {}) {
  const m = repo.Midias.criar({ dono, chave: 'privado/' + novoId() + '.wav', mime });
  repo.Midias.estado(m.id, estado, { bytes: 300 });
  const id = novoId();
  db.prepare("INSERT INTO obra_midias (id, obra_id, tipo, titulo, url, media_id, criado_por, criado_em) VALUES (?, ?, 'audio', ?, ?, ?, ?, ?)")
    .run(id, obraId, titulo, url, m.id, dono, new Date().toISOString());
  return { ...m, vinculoId: id };
}
function associar(f, mediaId) { f.a = Catalogo.salvar(f.dono, f.a.id, { revision: f.a.revision, documento: documento({ mediaId }) }); }
async function req(url, usuario, method = 'GET', body, headers = {}) {
  const r = await fetch(base + '/music/api/tocar' + url, { method,
    headers: { ...(usuario ? { 'x-test-user': usuario } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await r.json();
  return { status: r.status, data, headers: r.headers };
}
function falha(fn, status) { assert.throws(fn, (e) => e.status === status); }

test.before(async () => {
  assert.equal(DB_PATH, path.join(temporario, 'music', 'music.db'));
  storage.ativo = () => true;
  storage.urlDeLeitura = (chave, segundos) => { assinadas.push({ chave, segundos }); return 'https://audio.example.test/assinada-' + assinadas.length; };
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => {
  Object.assign(storage, storageOriginal);
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  const pasta = path.resolve(temporario);
  assert.equal(path.dirname(pasta), path.resolve(os.tmpdir()));
  assert.ok(path.basename(pasta).startsWith('musique-catalogo-test-'));
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('schema aditivo e idempotente conserva obras e sessões anteriores', () => {
  const antigo = new DatabaseSync(':memory:');
  try {
    antigo.exec("CREATE TABLE obras (id TEXT PRIMARY KEY); INSERT INTO obras VALUES ('antiga'); CREATE TABLE tocar_sessoes (id TEXT PRIMARY KEY, resumo TEXT); INSERT INTO tocar_sessoes VALUES ('treino', '{\"hits\":1}');");
    const sql = fs.readFileSync(path.join(__dirname, '../schema/120-tocar-catalogo.sql'), 'utf8');
    antigo.exec(sql); antigo.exec(sql);
    assert.equal(antigo.prepare('SELECT count(*) n FROM obras').get().n, 1);
    assert.equal(antigo.prepare('SELECT resumo FROM tocar_sessoes').get().resumo, '{"hits":1}');
    assert.equal(antigo.prepare('SELECT count(*) n FROM tocar_versoes').get().n, 0);
  } finally { antigo.close(); }
});

test('todas as famílias HTTP usam sessão e assinatura injetadas', async () => {
  for (const url of ['/catalogo', '/catalogo/a', '/catalogo/a/versoes/b', '/catalogo/a/versoes/b/audio', '/gestao/obras', '/gestao/obras/a', '/gestao/obras/a/midias', '/gestao/arranjos', '/gestao/arranjos/a', '/gestao/arranjos/a/audio?revision=1']) {
    assert.equal((await req(url)).status, 401, url);
    const semAssinatura = await req(url, 'aluno', 'GET', undefined, { 'x-test-paid': 'no' });
    assert.equal(semAssinatura.status, 402, url);
    assert.equal(semAssinatura.headers.get('cache-control'), 'no-store');
  }
  for (const [method, url] of [['POST', '/gestao/arranjos'], ['PUT', '/gestao/arranjos/a'], ['POST', '/gestao/arranjos/a/publicar'], ['POST', '/gestao/arranjos/a/retirar']]) {
    assert.equal((await req(url, null, method, {})).status, 401);
    assert.equal((await req(url, 'aluno', method, {}, { 'x-test-paid': 'no' })).status, 402);
  }
});

test('dono cria por HTTP; rascunho fica fora do catálogo e não altera visibilidade', async () => {
  const f = fixture();
  const r = await req('/gestao/arranjos', f.dono, 'POST', { obraId: f.obra.id, documento: documento() });
  assert.equal(r.status, 201); assert.equal(r.data.arranjo.revision, 1);
  assert.equal(r.data.arranjo.publishedVersionId, ''); assert.equal(r.data.arranjo.versions.length, 0);
  assert.equal(listarIds(f.dono).includes(r.data.arranjo.id), false);
  assert.equal((await req('/gestao/arranjos/' + r.data.arranjo.id, f.outro)).status, 404);
  assert.equal((await req('/gestao/arranjos', f.outro, 'POST', { obraId: f.obra.id, documento: documento() })).status, 404);
  publicar(f);
  assert.equal(repo.Obras.porId(f.obra.id).visibilidade, 'privada');
  assert.equal(listarIds(f.outro).includes(f.a.id), false);
});

test('publicação fixa documento/hash; editar rascunho não muda publicação e versões anteriores abrem', async () => {
  const f = fixture(), v1 = publicar(f), antes = Catalogo.obter(f.dono, f.a.id);
  const d = documento({ title: 'Outro título', instrument: 'guitarra', level: 'intermediario', technique: 'escalas' });
  f.a = Catalogo.salvar(f.dono, f.a.id, { revision: f.a.revision, documento: d });
  assert.deepEqual(Catalogo.obter(f.dono, f.a.id), antes);
  assert.equal(Catalogo.listar(f.dono, { q: 'Outro título' }).total, 0);
  assert.equal(Catalogo.listar(f.dono, { q: 'Outro título' }, true).total, 1);
  const v2 = publicar(f);
  assert.notEqual(v1, v2); assert.equal(Catalogo.obter(f.dono, f.a.id).arranjo.versionNumber, 2);
  const antiga = await req('/catalogo/' + f.a.id + '/versoes/' + v1, f.dono);
  assert.equal(antiga.status, 200); assert.deepEqual(antiga.data, antes);
  const hash = crypto.createHash('sha256').update(JSON.stringify(antes.documento)).digest('hex');
  assert.equal(antes.arranjo.sha256, hash);
  assert.throws(() => db.prepare('UPDATE tocar_versoes SET documento = ? WHERE id = ?').run('{}', v1), /não pode ser alterada/);
  assert.deepEqual(Catalogo.obter(f.dono, f.a.id, v1), antes);
});

test('deslocamento de mídia pertence ao rascunho e ao snapshot imutável da versão', async () => {
  const f = fixture(), midia = anexar(f);
  f.a = Catalogo.salvar(f.dono, f.a.id, { revision: f.a.revision, documento: documento({ mediaId: midia.id, mediaOffsetMs: 1250 }) });
  const v1 = publicar(f), primeiro = Catalogo.obter(f.dono, f.a.id);
  assert.equal(primeiro.documento.mediaId, midia.id); assert.equal(primeiro.documento.mediaOffsetMs, 1250);
  const hashPrimeiro = primeiro.arranjo.sha256;
  f.a = Catalogo.salvar(f.dono, f.a.id, { revision: f.a.revision, documento: documento({ mediaId: midia.id, mediaOffsetMs: 2400 }) });
  const v2 = publicar(f), segundo = Catalogo.obter(f.dono, f.a.id);
  assert.notEqual(v1, v2); assert.equal(segundo.documento.mediaOffsetMs, 2400); assert.notEqual(segundo.arranjo.sha256, hashPrimeiro);
  const antigo = Catalogo.obter(f.dono, f.a.id, v1);
  assert.equal(antigo.documento.mediaOffsetMs, 1250); assert.equal(antigo.arranjo.sha256, hashPrimeiro);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(segundo.documento)).digest('hex'), segundo.arranjo.sha256);
});

test('revisão otimista impede sobrescrita e publicação/retirada concorrentes', async () => {
  const f = fixture(), velha = f.a.revision;
  const salvo = await req('/gestao/arranjos/' + f.a.id, f.dono, 'PUT', { revision: velha, documento: documento({ title: 'Edição A' }) });
  assert.equal(salvo.status, 200); f.a = salvo.data.arranjo;
  for (const [method, sufixo, corpo] of [['PUT', '', { revision: velha, documento: documento({ title: 'Edição B' }) }], ['POST', '/publicar', { revision: velha }], ['POST', '/retirar', { revision: velha }]]) {
    const r = await req('/gestao/arranjos/' + f.a.id + sufixo, f.dono, method, corpo);
    assert.equal(r.status, 409); assert.equal(r.data.revision, f.a.revision);
  }
  assert.equal(Catalogo.obterGestao(f.dono, f.a.id).documento.title, 'Edição A');
  assert.equal(Catalogo.obterGestao(f.dono, f.a.id).versionsTotal, 0);
  const pub = await req('/gestao/arranjos/' + f.a.id + '/publicar', f.dono, 'POST', { revision: f.a.revision });
  assert.equal(pub.status, 200); assert.equal(pub.data.arranjo.revision, f.a.revision + 1);
});

test('falha de auditoria desfaz versão e ponteiro na mesma transação', () => {
  const f = fixture(), antes = Catalogo.obterGestao(f.dono, f.a.id), original = direitos.registrar;
  try {
    direitos.registrar = () => { throw new Error('Auditoria simulada indisponível'); };
    assert.throws(() => publicar(f), /Auditoria simulada/);
  } finally { direitos.registrar = original; }
  assert.deepEqual(Catalogo.obterGestao(f.dono, f.a.id), antes);
});

test('duas publicações HTTP da mesma revisão geram só uma versão', async () => {
  const f = fixture();
  const respostas = await Promise.all([1, 2].map(() => req('/gestao/arranjos/' + f.a.id + '/publicar', f.dono, 'POST', { revision: f.a.revision })));
  assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 409]);
  const detalhe = Catalogo.obterGestao(f.dono, f.a.id);
  assert.equal(detalhe.versionsTotal, 1); assert.equal(detalhe.revision, 2);
  assert.equal(detalhe.publishedVersionId, detalhe.versions[0].id);
});

test('público pode ler, mas só o dono da obra administra', async () => {
  const f = fixture(); publicar(f); acessoPublico(f);
  assert.ok(listarIds(f.outro).includes(f.a.id));
  assert.equal((await req('/catalogo/' + f.a.id, f.outro)).status, 200);
  for (const [method, suffix, body] of [['GET', '', undefined], ['PUT', '', { revision: f.a.revision, documento: documento() }], ['POST', '/publicar', { revision: f.a.revision }], ['POST', '/retirar', { revision: f.a.revision }]]) {
    assert.equal((await req('/gestao/arranjos/' + f.a.id + suffix, f.outro, method, body)).status, 404);
  }
  assert.equal(Catalogo.listar(f.outro, {}, true).total, 0);
  direitos.definirVisibilidade({ obraId: f.obra.id, usuario: f.dono, visibilidade: 'privada' });
  assert.equal((await req('/catalogo/' + f.a.id, f.outro)).status, 404);
  assert.ok(!listarIds(f.outro).includes(f.a.id));
});

test('banda lê obra privada; retirar membro e remover obra revogam acesso imediatamente', async () => {
  const f = fixture(); publicar(f);
  const banda = novoId();
  db.prepare('INSERT INTO bandas (id, dono, nome) VALUES (?, ?, ?)').run(banda, f.dono, 'Banda teste');
  db.prepare('INSERT INTO banda_membros (banda_id, usuario, papel) VALUES (?, ?, ?)').run(banda, f.outro, 'maestro');
  db.prepare('INSERT INTO banda_obras (banda_id, obra_id, compartilhada_por) VALUES (?, ?, ?)').run(banda, f.obra.id, f.dono);
  assert.ok(listarIds(f.outro).includes(f.a.id));
  assert.equal(Catalogo.obter(f.outro, f.a.id).arranjo.id, f.a.id);
  falha(() => Catalogo.salvar(f.outro, f.a.id, { revision: f.a.revision, documento: documento() }), 404);
  db.prepare('DELETE FROM banda_membros WHERE banda_id = ? AND usuario = ?').run(banda, f.outro);
  falha(() => Catalogo.obter(f.outro, f.a.id), 404);
  db.prepare('INSERT INTO banda_membros (banda_id, usuario, papel) VALUES (?, ?, ?)').run(banda, f.outro, 'maestro');
  db.prepare('UPDATE obras SET removido_em = ? WHERE id = ?').run(new Date().toISOString(), f.obra.id);
  for (const usuario of [f.dono, f.outro]) {
    assert.ok(!listarIds(usuario).includes(f.a.id));
    falha(() => Catalogo.obter(usuario, f.a.id), 404);
  }
  assert.equal(Catalogo.listar(f.dono, {}, true).total, 0);
  falha(() => Catalogo.obterGestao(f.dono, f.a.id), 404);
});

test('política central de terceiro público é consultada em cada leitura', () => {
  const f = fixture(); publicar(f);
  db.prepare("UPDATE obras SET titularidade = 'terceiro_privado', visibilidade = 'publica' WHERE id = ?").run(f.obra.id);
  const chave = 'cifras.politica.terceiro_publico';
  db.prepare('INSERT OR REPLACE INTO cifras_flags (chave, ligado) VALUES (?, 1)').run(chave);
  assert.ok(listarIds(f.outro).includes(f.a.id));
  assert.equal(Catalogo.obter(f.outro, f.a.id).arranjo.id, f.a.id);
  db.prepare('UPDATE cifras_flags SET ligado = 0 WHERE chave = ?').run(chave);
  assert.ok(!listarIds(f.outro).includes(f.a.id));
  falha(() => Catalogo.obter(f.outro, f.a.id), 404);
});

test('listas são paginadas, filtradas no snapshot correto e não levam charts', async () => {
  const f = fixture({ title: 'Filtro primeiro' }); publicar(f);
  const segundo = Catalogo.criar(f.dono, { obraId: f.obra.id, documento: documento({ title: 'Filtro segundo', instrument: 'guitarra', level: 'avancado', technique: 'arpejos' }) });
  Catalogo.publicar(f.dono, segundo.id, { revision: segundo.revision });
  const r = await req('/catalogo?q=Filtro&limit=1&offset=0', f.dono);
  assert.equal(r.status, 200); assert.equal(r.data.total, 2); assert.equal(r.data.arranjos.length, 1);
  const proxima = await req('/catalogo?q=Filtro&limit=1&offset=1', f.dono);
  assert.notEqual(r.data.arranjos[0].id, proxima.data.arranjos[0].id);
  const filtro = Catalogo.listar(f.dono, { instrument: 'guitarra', level: 'avancado', technique: 'arpejos' });
  assert.equal(filtro.total, 1); assert.equal(filtro.arranjos[0].id, segundo.id);
  for (const dados of [r.data, Catalogo.listar(f.dono, {}, true)]) {
    assert.doesNotMatch(JSON.stringify(dados), /"documento"|"chart"|"notes"|"chave"/);
  }
  assert.equal(Catalogo.listar(f.dono, { q: "%' OR 1=1 --" }).total, 0);
  for (const query of ['limit=51', 'limit=0', 'limit=NaN', 'offset=-1', 'offset=0.5', 'instrument=piano', 'level=x', 'technique=x', 'q=x&q=y']) {
    assert.equal((await req('/catalogo?' + query, f.dono)).status, 400, query);
  }
});

test('obra pode ser preselecionada por id fora da primeira página, apenas por seu dono', async () => {
  const f = fixture();
  for (let i = 0; i < 51; i++) repo.Obras.criar({ dono: f.dono, titulo: 'Obra adicional ' + i });
  db.prepare("UPDATE obras SET atualizado_em = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(f.obra.id);
  const pagina = await req('/gestao/obras?limit=50', f.dono);
  assert.equal(pagina.status, 200); assert.equal(pagina.data.total, 52);
  assert.ok(!pagina.data.obras.some((o) => o.id === f.obra.id));
  const detalhe = await req('/gestao/obras/' + f.obra.id, f.dono);
  assert.equal(detalhe.status, 200);
  assert.deepEqual(detalhe.data.obra, { id: f.obra.id, titulo: f.obra.titulo, artista: '', visibilidade: 'privada', titularidade: 'propria' });
  assert.equal((await req('/gestao/obras/' + f.obra.id, f.outro)).status, 404);
  assert.equal(Catalogo.obterGestao(f.dono, f.a.id).obra.visibilidade, 'privada');
});

test('mídias listadas/aceitas precisam ser próprias, prontas, áudio e anexadas à mesma obra', async () => {
  const f = fixture(), outraObra = repo.Obras.criar({ dono: f.dono, titulo: 'Outra obra' });
  const ok = anexar(f);
  const invalidas = [anexar(f, { dono: f.outro }), anexar(f, { mime: 'text/html' }), anexar(f, { estado: 'processando' }),
    anexar(f, { obraId: outraObra.id }), anexar(f, { url: 'https://externo.example.test/audio.mp3' })];
  const r = await req('/gestao/obras/' + f.obra.id + '/midias', f.dono);
  assert.equal(r.status, 200); assert.equal(r.data.total, 1); assert.equal(r.data.midias[0].id, ok.id);
  assert.doesNotMatch(JSON.stringify(r.data), /privado\/|"chave"|"url"/);
  assert.equal((await req('/gestao/obras/' + f.obra.id + '/midias', f.outro)).status, 404);
  for (const m of invalidas) falha(() => associar(f, m.id), 409);
  associar(f, ok.id); publicar(f);
  assert.equal(Catalogo.obter(f.dono, f.a.id).documento.mediaId, ok.id);
});

test('áudio é assinado só após revalidar versão, obra e vínculo; versão anterior funciona', async () => {
  const f = fixture(), m = anexar(f); associar(f, m.id); const v1 = publicar(f); acessoPublico(f);
  const caminho = '/catalogo/' + f.a.id + '/versoes/' + v1 + '/audio';
  const primeiro = await req(caminho, f.outro);
  assert.equal(primeiro.status, 200); assert.equal(primeiro.data.expiresIn, 600); assert.equal(primeiro.data.mime, 'audio/wav');
  assert.deepEqual(assinadas.at(-1), { chave: m.chave, segundos: 600 });
  f.a = Catalogo.salvar(f.dono, f.a.id, { revision: f.a.revision, documento: documento() }); publicar(f);
  assert.equal((await req(caminho, f.outro)).status, 200);
  const antes = assinadas.length;
  db.prepare('DELETE FROM obra_midias WHERE id = ?').run(m.vinculoId);
  assert.equal((await req(caminho, f.outro)).status, 409); assert.equal(assinadas.length, antes);
  direitos.definirVisibilidade({ obraId: f.obra.id, usuario: f.dono, visibilidade: 'privada' });
  assert.equal((await req(caminho, f.outro)).status, 404); assert.equal(assinadas.length, antes);
});

test('preview de áudio exige dono e revisão exata; falha de storage é explícita', async () => {
  const f = fixture(), m = anexar(f); associar(f, m.id);
  const url = '/gestao/arranjos/' + f.a.id + '/audio?revision=' + f.a.revision;
  assert.equal((await req(url, f.dono)).status, 200);
  assert.equal((await req(url, f.outro)).status, 404);
  assert.equal((await req('/gestao/arranjos/' + f.a.id + '/audio?revision=1', f.dono)).status, 409);
  assert.equal((await req('/gestao/arranjos/' + f.a.id + '/audio', f.dono)).status, 400);
  try {
    storage.ativo = () => false;
    const r = await req(url, f.dono); assert.equal(r.status, 503); assert.doesNotMatch(JSON.stringify(r.data), /SECRET|KEY|bucket/);
  } finally { storage.ativo = () => true; }
  repo.Midias.estado(m.id, 'falhou');
  assert.equal((await req(url, f.dono)).status, 409);
  falha(() => publicar(f), 409);
});

test('retirada impede abrir e assinar versões sem apagar os snapshots', async () => {
  const f = fixture(), m = anexar(f); associar(f, m.id); const versionId = publicar(f); acessoPublico(f);
  const r = await req('/gestao/arranjos/' + f.a.id + '/retirar', f.dono, 'POST', { revision: f.a.revision });
  assert.equal(r.status, 200); assert.equal(r.data.arranjo.publishedVersionId, '');
  assert.equal(r.data.arranjo.versions.length, 1);
  assert.ok(!listarIds(f.dono).includes(f.a.id));
  for (const caminho of ['/catalogo/' + f.a.id, '/catalogo/' + f.a.id + '/versoes/' + versionId, '/catalogo/' + f.a.id + '/versoes/' + versionId + '/audio']) {
    assert.equal((await req(caminho, f.dono)).status, 404);
  }
  assert.equal(Catalogo.obterGestao(f.dono, f.a.id).versions[0].id, versionId);
});

test('referência de treino fixa versão/hash/intervalo e rejeita totais ou chart falsos', () => {
  const f = fixture(), versionId = publicar(f);
  const ref = { arranjoId: f.a.id, versionId, from: 0, to: 4 };
  const resumo = { chartId: 'teste-cordas', title: 'Estudo de cordas', total: 2 };
  const snapshot = Catalogo.resolverReferencia(f.dono, ref, resumo);
  assert.equal(snapshot.versionNumber, 1); assert.equal(snapshot.obraId, f.obra.id);
  assert.equal(snapshot.sha256, Catalogo.obter(f.dono, f.a.id).arranjo.sha256);
  assert.equal(snapshot.from, 0); assert.equal(snapshot.to, 4);
  for (const alteracao of [{ total: 3 }, { chartId: 'outro' }, { title: 'falso' }]) falha(() => Catalogo.resolverReferencia(f.dono, ref, { ...resumo, ...alteracao }), 400);
  assert.deepEqual(Catalogo.resolverReferencia(f.dono, ref, { ...resumo, mode: 'practice', duration: 4 }), snapshot);
  for (const duration of [3.9, 4.01, 8, NaN, Infinity, '4']) {
    falha(() => Catalogo.resolverReferencia(f.dono, ref, { ...resumo, mode: 'practice', duration }), 400);
  }
  assert.deepEqual(Catalogo.resolverReferencia(f.dono, ref, { ...resumo, mode: 'learn', duration: 75 }), snapshot);
  for (const alteracao of [{ from: -1 }, { to: 9 }, { to: Infinity }, { from: NaN }, { from: '0' }, { from: 1, to: 1.5 }, { from: 4, to: 4 }, { extra: true }]) {
    falha(() => Catalogo.resolverReferencia(f.dono, { ...ref, ...alteracao }, resumo), 400);
  }
  const outra = fixture(); const outraVersao = publicar(outra);
  falha(() => Catalogo.resolverReferencia(f.dono, { ...ref, versionId: outraVersao }, resumo), 404);
  f.a = Catalogo.retirar(f.dono, f.a.id, { revision: f.a.revision });
  assert.deepEqual(Catalogo.resolverReferencia(f.dono, ref, resumo), snapshot);
  falha(() => Catalogo.resolverReferencia(f.outro, ref, resumo), 404);
  db.prepare('UPDATE obras SET removido_em = ? WHERE id = ?').run(new Date().toISOString(), f.obra.id);
  falha(() => Catalogo.resolverReferencia(f.dono, ref, resumo), 404);
});

test('corpos fechados, JSON obrigatório e documento inválido não deixam gravação parcial', async () => {
  const f = fixture();
  const antes = Catalogo.obterGestao(f.dono, f.a.id);
  assert.equal((await req('/gestao/arranjos/' + f.a.id, f.dono, 'PUT', { revision: f.a.revision, documento: documento(), dono: f.outro })).status, 400);
  assert.equal((await req('/gestao/arranjos/' + f.a.id, f.dono, 'PUT', { revision: f.a.revision, documento: documento({ title: '<script>' }) })).status, 400);
  assert.equal((await req('/gestao/arranjos/' + f.a.id + '/publicar', f.dono, 'POST', { revision: String(f.a.revision) })).status, 400);
  const raw = await fetch(base + '/music/api/tocar/gestao/arranjos', { method: 'POST', headers: { 'x-test-user': f.dono, 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(raw.status, 415);
  assert.deepEqual(Catalogo.obterGestao(f.dono, f.a.id), antes);
});

test('exportação inclui todas as versões próprias e retirada/lixeira, sem dados alheios ou URLs', () => {
  const f = fixture(), m = anexar(f); associar(f, m.id); const v1 = publicar(f);
  f.a = Catalogo.salvar(f.dono, f.a.id, { revision: f.a.revision, documento: documento({ title: 'Versão dois', mediaId: m.id }) });
  const v2 = publicar(f); f.a = Catalogo.retirar(f.dono, f.a.id, { revision: f.a.revision });
  db.prepare('UPDATE obras SET removido_em = ? WHERE id = ?').run(new Date().toISOString(), f.obra.id);
  const outra = fixture(); publicar(outra);
  const dados = Catalogo.dadosDe(f.dono);
  assert.equal(dados.arranjos.length, 1); assert.equal(dados.arranjos[0].id, f.a.id);
  assert.deepEqual(dados.versoes.map((v) => v.id), [v1, v2]);
  assert.equal(dados.versoes[0].documento.chart.notes.length, 3);
  assert.doesNotMatch(JSON.stringify(dados), /https:\/\/|privado\/|"chave"/);
  assert.equal(Catalogo.dadosDe(f.outro).arranjos.length, 0);
});

test('exclusão por obra/conta é restrita e preserva resumos de treino de outras pessoas', () => {
  const f = fixture(); publicar(f);
  const obra2 = repo.Obras.criar({ dono: f.dono, titulo: 'Segunda obra' });
  const a2 = Catalogo.criar(f.dono, { obraId: obra2.id, documento: documento() }); Catalogo.publicar(f.dono, a2.id, { revision: a2.revision });
  const outra = fixture(); publicar(outra);
  const treino = novoId();
  db.prepare('INSERT INTO tocar_sessoes (id, usuario, resumo, criado_em) VALUES (?, ?, ?, ?)').run(treino, f.outro, JSON.stringify({ chartId: 'teste-cordas', catalogRef: { arranjoId: f.a.id } }), new Date().toISOString());
  assert.deepEqual(Catalogo.excluirDaObra(f.obra.id), { arranjos: 1, versoes: 1 });
  assert.equal(Catalogo.dadosDe(f.dono).arranjos.length, 1);
  assert.equal(Catalogo.obterGestao(f.dono, a2.id).id, a2.id);
  assert.deepEqual(Catalogo.excluirDe(f.dono), { arranjos: 1, versoes: 1 });
  assert.equal(Catalogo.dadosDe(f.dono).arranjos.length, 0);
  assert.equal(Catalogo.obterGestao(outra.dono, outra.a.id).id, outra.a.id);
  assert.equal(db.prepare('SELECT usuario FROM tocar_sessoes WHERE id = ?').get(treino).usuario, f.outro);
  assert.deepEqual(Catalogo.excluirDe(f.dono), { arranjos: 0, versoes: 0 });
});

test('falha externa na exclusão desfaz também a remoção das versões', () => {
  const f = fixture(); publicar(f);
  db.exec('CREATE TABLE teste_referencia_externa (arranjo_id TEXT REFERENCES tocar_arranjos(id))');
  try {
    db.prepare('INSERT INTO teste_referencia_externa (arranjo_id) VALUES (?)').run(f.a.id);
    assert.throws(() => Catalogo.excluirDaObra(f.obra.id), /FOREIGN KEY/);
    assert.equal(Catalogo.obterGestao(f.dono, f.a.id).versionsTotal, 1);
    assert.equal(Catalogo.obter(f.dono, f.a.id).arranjo.versionId, f.a.publishedVersionId);
  } finally { db.exec('DROP TABLE teste_referencia_externa'); }
});
