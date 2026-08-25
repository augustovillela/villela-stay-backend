// =====================================================================
// Musique — suíte de testes da FASE 0.  npm run test:music
//
// O foco é o que sustenta as decisões do Augusto (24/08/2026), e cada
// teste existe porque, sem ele, uma decisão viraria só um parágrafo:
//
//   Q1  conta única → a sessão da Academia autentica em /music, e o
//       cookie mudou de escopo SEM criar sessão fantasma
//   Q2  acervo privado → as QUATRO travas do `terceiro_privado`, cada
//       uma testada TENTANDO violar
//   Q5  microfone → formato que não transpõe não promete transpor
//   Q6  não anunciar geração → capability sem provedor não aparece
//   ADR-0003  fila idempotente, DLQ para handler ausente, nada de áudio
//       no disco
//   ADR-0004  o AI Router não conhece direitos (varredura de imports)
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'music-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.MUSIC_FILA_OFF = '1';   // o teste processa a fila À MÃO, para ver cada job
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const SEGREDO = 'seg-teste-music';

// ---- staff fake (o Portal Staff administra a plataforma) ----
const STAFF = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', ativo: true },
];
function requireAuth(req, res, next) {
  const u = STAFF.find((x) => x.id === (req.headers['x-test-user'] || 'adm'));
  if (!u) return res.status(401).json({ erro: 'x' });
  req.user = u; next();
}
const requireAdmin = (req, res, next) =>
  (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'admin' });

// ---- conta da Academia, FALSA (ADR-0001: identidade é injetada) ----
// O módulo nunca importa o banco da Academia — é isto que permite testar
// a Musique sem subir a Academia inteira.
const CONTAS = {
  ana: { id: 'u-ana', nome: 'Ana', email: 'ana@t', status: 'ativo' },
  bruno: { id: 'u-bruno', nome: 'Bruno', email: 'bruno@t', status: 'ativo' },
  suspenso: { id: 'u-sus', nome: 'Suspenso', email: 'sus@t', status: 'suspenso' },
};
const revogadas = new Set();
const sessaoAcademyNucleo = require('../nucleo/sessao-academy');
const verificador = sessaoAcademyNucleo.criarVerificador({
  jwtSecret: SEGREDO,
  buscarUsuario: (uid) => Object.values(CONTAS).find((c) => c.id === uid) || null,
  sessaoValida: (jti) => !revogadas.has(jti),
});
const tokenDe = (chave, jti) => sessaoAcademyNucleo.assinar(CONTAS[chave].id, jti || 'jti-' + chave, SEGREDO);

// Papel de professor vem da Academia (ADR-0001). No teste, um conjunto.
const PROFESSORES = new Set(['u-prof']);
CONTAS.prof = { id: 'u-prof', nome: 'Prof. Clara', email: 'clara@t', status: 'ativo' };
// Fase 3: uma escola precisa de gente com papéis diferentes.
CONTAS.sec = { id: 'u-sec', nome: 'Secretaria', email: 'sec@t', status: 'ativo' };
CONTAS.prof2 = { id: 'u-prof2', nome: 'Dani', email: 'prof2@t', status: 'ativo' };
CONTAS.menor = { id: 'u-menor', nome: 'Tita (12 anos)', email: 'menor@t', status: 'ativo' };
CONTAS.resp = { id: 'u-resp', nome: 'Mãe da Tita', email: 'resp@t', status: 'ativo' };
CONTAS.forasteiro = { id: 'u-forasteiro', nome: 'De outra escola', email: 'forasteiro@t', status: 'ativo' };

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
const mod = require('./index');
mod.montar(app, {
  express, requireAuth, requireAdmin, jwtSecret: SEGREDO,
  sessaoAcademy: verificador, alertaAugusto: async () => {},
  ehProfessor: (u) => PROFESSORES.has(u && u.id),
  // Busca de conta por e-mail (ADR-0001): o professor atribui tarefa e o
  // músico convida a banda pelo e-mail, não pelo id interno.
  buscarContaPorId: (id) => { const c = Object.values(CONTAS).find((x) => x.id === id); return c ? { id: c.id, nome: c.nome } : null; },
  buscarContaPorEmail: (email) => Object.values(CONTAS)
    .find((c) => c.email.toLowerCase() === String(email || '').trim().toLowerCase()) || null,
});

// O PWA é montado uma vez, globalmente, pelo server.js — para TODOS os
// produtos. Aqui ele entra porque as páginas da Musique apontam para o
// manifest e para o service worker no próprio HEAD, e um teste que não
// monta o par testaria uma tag que aponta para o vazio.
require('../pwa').montar(app);

const repo = require('./repo');
const direitos = require('./direitos');
const fila = require('./fila');
const storage = require('./storage');
const router = require('./ia/router');
const { db } = require('./db');

// ---- harness HTTP com cookie jar por pessoa ----
let BASE = '', ok = 0;
const falhas = [];
const jars = {};
async function req(metodo, caminho, { corpo, como = '', staff = 'adm', headers: hx, cru = false } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-test-user': staff, ...(hx || {}) };
  if (como) headers.Cookie = `${sessaoAcademyNucleo.COOKIE}=${tokenDe(como)}`;
  const r = await fetch(BASE + caminho, {
    method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual',
  });
  const setCookie = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (cru) return { status: r.status, texto: await r.text(), setCookie, headers: r.headers };
  let json = null;
  try { json = await r.json(); } catch (_) { json = null; }
  return { status: r.status, json, setCookie };
}
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✅ ' + nome); }
  catch (e) { falhas.push({ nome, erro: e.message }); console.log('  ❌ ' + nome + '\n     ' + e.message); }
}
const secao = (s) => console.log('\n— ' + s + ' —');

(async () => {
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  BASE = 'http://127.0.0.1:' + srv.address().port;

  // ===================================================================
  secao('Q1 · conta única: a sessão da Academia autentica em /music');

  await t('sem cookie, /music/api/me devolve 401 COM o caminho de entrada', async () => {
    const r = await req('GET', '/music/api/me');
    assert.equal(r.status, 401);
    assert.equal(r.json.entrar, '/academy/app', '401 tem de dizer POR ONDE entrar, não só negar');
  });

  await t('com a sessão da Academia, /music/api/me responde e cria a projeção musical', async () => {
    const r = await req('GET', '/music/api/me', { como: 'ana' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.conta.email, 'ana@t');
    assert.ok(repo.Usuarios.porId('u-ana'), 'a projeção musical devia nascer no primeiro acesso');
  });

  await t('sessão revogada na Academia derruba o acesso à Musique', async () => {
    revogadas.add('jti-bruno');
    const r = await req('GET', '/music/api/me', { como: 'bruno' });
    revogadas.delete('jti-bruno');
    assert.equal(r.status, 401, 'logout na Academia tem de valer aqui — é a mesma sessão');
  });

  await t('conta suspensa não entra', async () => {
    const r = await req('GET', '/music/api/me', { como: 'suspenso' });
    assert.equal(r.status, 401);
  });

  await t('não existe login próprio: /music/api/login não existe', async () => {
    const r = await req('POST', '/music/api/login', { corpo: { email: 'x', senha: 'y' } });
    assert.ok(r.status === 404 || r.status === 405, `esperava rota inexistente, veio ${r.status}`);
  });

  // ===================================================================
  secao('Q1 · escopo do cookie: sem sessão fantasma');

  await t('emitir sempre grava no escopo novo E limpa o antigo', async () => {
    const setados = [];
    const limpos = [];
    const resFake = {
      cookie: (n, v, o) => setados.push({ n, v, o }),
      clearCookie: (n, o) => limpos.push({ n, o }),
    };
    sessaoAcademyNucleo.emitir(resFake, 'tok', true);
    assert.equal(setados.length, 1);
    assert.equal(setados[0].o.path, '/', 'o escopo novo tem de ser / para /music receber o cookie');
    assert.ok(setados[0].o.httpOnly, 'cookie de sessão é httpOnly');
    assert.equal(limpos.length, 1);
    assert.equal(limpos[0].o.path, '/academy',
      'emitir sem limpar o escopo antigo deixa DOIS academy_sess — a sessão fantasma');
  });

  await t('logout limpa nos DOIS escopos', async () => {
    const limpos = [];
    sessaoAcademyNucleo.limpar({ clearCookie: (n, o) => limpos.push(o.path) });
    assert.deepEqual(limpos.sort(), ['/', '/academy']);
  });

  await t('quem já estava logado tem o cookie promovido ao novo escopo, com o MESMO jti', async () => {
    const r = await req('GET', '/music/api/me', { como: 'ana' });
    assert.equal(r.status, 200);
    // O verificador do núcleo reemite em toda requisição autenticada,
    // e é isso que faz o usuário antigo migrar sem novo login.
    const app2 = express();
    app2.use(cookieParser());
    app2.get('/x', verificador.requireUsuario, (rq, rs) => rs.json({ jti: rq.jti }));
    const s2 = app2.listen(0);
    await new Promise((res) => s2.once('listening', res));
    const p = s2.address().port;
    const resp = await fetch(`http://127.0.0.1:${p}/x`, {
      headers: { Cookie: `${sessaoAcademyNucleo.COOKIE}=${tokenDe('ana')}` },
    });
    const cks = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
    s2.close();
    assert.equal((await resp.json()).jti, 'jti-ana', 'o jti tem de ser o mesmo: é a mesma sessão');
    assert.ok(cks.some((c) => /Path=\/(;|$)/.test(c)), 'devia reemitir no escopo novo: ' + JSON.stringify(cks));
    assert.ok(cks.some((c) => /Path=\/academy/.test(c)), 'e limpar o escopo antigo');
  });

  // ===================================================================
  secao('Q2 · as quatro travas do acervo de terceiro');

  let obraTerceiro, obraPropria;
  await t('obra sobe como terceiro_privado por padrão, com aviso na resposta', async () => {
    const r = await req('POST', '/music/api/obras', { como: 'ana', corpo: { titulo: 'Sucesso alheio' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    obraTerceiro = r.json.obra;
    assert.equal(obraTerceiro.titularidade, 'terceiro_privado', 'o padrão tem de ser o mais restritivo');
    assert.equal(obraTerceiro.visibilidade, 'privada');
    assert.ok(/acervo pessoal/i.test(r.json.aviso), 'o usuário tem de saber por que a obra ficou restrita');
  });

  await t('TRAVA 1 — publicar obra de terceiro é recusado, com motivo acionável', async () => {
    const r = await req('POST', `/music/api/obras/${obraTerceiro.id}/visibilidade`,
      { como: 'ana', corpo: { visibilidade: 'publica' } });
    assert.equal(r.status, 403, 'publicar obra de terceiro NÃO pode passar');
    assert.ok(/declare/i.test(r.json.erro), 'a recusa tem de dizer o que fazer: ' + r.json.erro);
    assert.equal(repo.Obras.porId(obraTerceiro.id).visibilidade, 'privada');
  });

  await t('TRAVA 2 — compartilhar obra de terceiro é recusado', async () => {
    const r = await req('POST', `/music/api/obras/${obraTerceiro.id}/visibilidade`,
      { como: 'ana', corpo: { visibilidade: 'compartilhada' } });
    assert.equal(r.status, 403);
    assert.equal(repo.Obras.porId(obraTerceiro.id).visibilidade, 'privada');
  });

  await t('TRAVA 3 — obra de terceiro não aparece na descoberta de outra pessoa', async () => {
    const meu = await req('GET', '/music/api/descobrir?q=Sucesso', { como: 'ana' });
    assert.ok(meu.json.obras.some((o) => o.id === obraTerceiro.id), 'no MEU acervo eu vejo');
    const dele = await req('GET', '/music/api/descobrir?q=Sucesso', { como: 'bruno' });
    assert.ok(!dele.json.obras.some((o) => o.id === obraTerceiro.id),
      'obra de terceiro NUNCA aparece para outro usuário');
  });

  await t('TRAVA 3b — o filtro é do repositório, não da tela', async () => {
    // Chamada direta, sem passar por rota: se a regra morasse na tela,
    // este caminho vazaria.
    const todas = db.prepare('SELECT * FROM obras').all();
    const vistas = direitos.filtrarParaDescoberta(todas, 'u-bruno');
    assert.ok(!vistas.some((o) => o.titularidade === 'terceiro_privado' && o.dono !== 'u-bruno'));
  });

  await t('TRAVA 4 — obra de terceiro não vai para provedor de IA', async () => {
    const v = direitos.podeMandarParaIA(repo.Obras.porId(obraTerceiro.id));
    assert.equal(v.pode, false);
    assert.ok(/IA/i.test(v.motivo));
  });

  await t('declarar titularidade própria destrava publicar', async () => {
    const d = await req('POST', `/music/api/obras/${obraTerceiro.id}/titularidade`,
      { como: 'ana', corpo: { tipo: 'propria', evidencia: 'composição minha' } });
    assert.equal(d.status, 200, JSON.stringify(d.json));
    const p = await req('POST', `/music/api/obras/${obraTerceiro.id}/visibilidade`,
      { como: 'ana', corpo: { visibilidade: 'publica' } });
    assert.equal(p.status, 200, JSON.stringify(p.json));
    assert.equal(repo.Obras.porId(obraTerceiro.id).visibilidade, 'publica');
    obraPropria = repo.Obras.porId(obraTerceiro.id);
  });

  await t('rebaixar para terceiro RECOLHE a obra que estava pública, na hora', async () => {
    await req('POST', `/music/api/obras/${obraPropria.id}/titularidade`,
      { como: 'ana', corpo: { tipo: 'terceiro_privado' } });
    const o = repo.Obras.porId(obraPropria.id);
    assert.equal(o.visibilidade, 'privada',
      'obra que deixou de ser própria não pode continuar pública "até alguém reparar"');
  });

  await t('o histórico de titularidade guarda quem declarou o quê', async () => {
    const h = direitos.historicoTitularidade(obraPropria.id);
    assert.ok(h.length >= 2);
    assert.equal(h[0].declarada_por, 'u-ana');
  });

  await t('não se declara titularidade da obra de outro', async () => {
    const r = await req('POST', `/music/api/obras/${obraPropria.id}/titularidade`,
      { como: 'bruno', corpo: { tipo: 'propria' } });
    assert.ok(r.status >= 400);
  });

  await t('obra privada de outra pessoa devolve 403 ao ser aberta direto pelo id', async () => {
    const r = await req('GET', `/music/api/obras/${obraPropria.id}`, { como: 'bruno' });
    assert.equal(r.status, 403);
  });

  // ===================================================================
  secao('formatos: PDF é anexo, não partitura editável');

  await t('chordpro/musicxml/midi transpõem e tocam; pdf não', async () => {
    for (const f of ['chordpro', 'musicxml', 'midi']) {
      const c = repo.Partituras.capacidades(f);
      assert.ok(c.transpoe && c.toca && c.edita, f + ' devia ser simbólico');
    }
    const pdf = repo.Partituras.capacidades('pdf');
    assert.equal(pdf.transpoe, false, 'prometer transpor PDF é prometer o que não existe');
    assert.equal(pdf.edita, false);
    assert.equal(pdf.anexo, true);
  });

  await t('partitura simbólica sem conteúdo é recusada; PDF sem arquivo também', async () => {
    const arr = repo.Arranjos.criar({ obraId: obraPropria.id, nome: 'base' });
    assert.throws(() => repo.Partituras.criar({ arranjoId: arr.id, formato: 'musicxml', conteudo: '' }));
    assert.throws(() => repo.Partituras.criar({ arranjoId: arr.id, formato: 'pdf' }));
    const p = repo.Partituras.criar({ arranjoId: arr.id, formato: 'chordpro', conteudo: '{title: X}\n[C]teste' });
    assert.equal(p.versao, 1);
    const p2 = repo.Partituras.criar({ arranjoId: arr.id, formato: 'chordpro', conteudo: '[G]outra' });
    assert.equal(p2.versao, 2, 'versão nova nunca sobrescreve: o histórico é o produto');
    assert.equal(repo.Partituras.doArranjo(arr.id).length, 2);
  });

  // ===================================================================
  secao('ADR-0003 · fila durável');

  await t('chave de idempotência: o segundo enfileiramento devolve null', async () => {
    fila.limparHandlers();
    const a = fila.enfileirar({ tipo: 'smoke', payload: { n: 1 }, chaveIdem: 'k1' });
    const b = fila.enfileirar({ tipo: 'smoke', payload: { n: 1 }, chaveIdem: 'k1' });
    assert.ok(a && a.id);
    assert.equal(b, null, 'chave repetida não é erro — é a idempotência funcionando');
  });

  await t('job SEM chave não colide com outro sem chave', async () => {
    const a = fila.enfileirar({ tipo: 'smoke' });
    const b = fila.enfileirar({ tipo: 'smoke' });
    assert.ok(a && b && a.id !== b.id, 'o índice único é PARCIAL justamente por isso');
  });

  await t('handler ausente manda o job para a DLQ na PRIMEIRA tentativa', async () => {
    fila.limparHandlers();
    const job = fila.enfileirar({ tipo: 'tipo.que.ninguem.registrou' });
    await fila.executar(job);
    const dep = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id);
    assert.equal(dep.status, 'dlq', 'repetir 5x um job sem handler só atrasa o diagnóstico');
    assert.ok(/Sem handler/.test(dep.ultimo_erro));
    assert.ok(fila.dlq().some((x) => x.id === job.id), 'a DLQ tem de ser visível');
  });

  await t('handler que lança é reagendado, e só vai para a DLQ ao esgotar', async () => {
    fila.limparHandlers();
    let n = 0;
    fila.registrar('falha', async () => { n++; throw new Error('de propósito'); });
    const job = fila.enfileirar({ tipo: 'falha', maxTentativas: 2 });
    await fila.executar(job);
    assert.equal(db.prepare('SELECT status FROM jobs WHERE id = ?').get(job.id).status, 'pendente');
    await fila.executar(db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id));
    assert.equal(db.prepare('SELECT status FROM jobs WHERE id = ?').get(job.id).status, 'dlq');
    assert.equal(n, 2);
  });

  await t('erro permanente não fica girando: vai direto para a DLQ', async () => {
    fila.limparHandlers();
    fila.registrar('perm', async () => { const e = new Error('payload inválido'); e.permanente = true; throw e; });
    const job = fila.enfileirar({ tipo: 'perm', maxTentativas: 5 });
    await fila.executar(job);
    assert.equal(db.prepare('SELECT status FROM jobs WHERE id = ?').get(job.id).status, 'dlq');
  });

  await t('entrega no mínimo uma vez: handler idempotente executado 2x dá 1 resultado', async () => {
    fila.limparHandlers();
    const feitos = new Set();
    fila.registrar('idem', async (p) => { if (feitos.has(p.alvo)) return { jaEstava: true }; feitos.add(p.alvo); return { feito: true }; });
    const job = fila.enfileirar({ tipo: 'idem', payload: { alvo: 'x' } });
    await fila.executar(job);
    await fila.executar(db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id));
    assert.equal(feitos.size, 1);
  });

  await t('job travado em processando volta para a fila', async () => {
    const job = fila.enfileirar({ tipo: 'smoke' });
    db.prepare("UPDATE jobs SET status = 'processando', iniciado_em = ? WHERE id = ?")
      .run(new Date(Date.now() - 3600e3).toISOString(), job.id);
    assert.ok(fila.destravar(15) >= 1, 'deploy no meio do trabalho não pode deixar job parado para sempre');
    assert.equal(db.prepare('SELECT status FROM jobs WHERE id = ?').get(job.id).status, 'pendente');
  });

  await t('a fila "cara" é RECUSADA enquanto não houver worker dedicado (ADR-0006)', async () => {
    assert.throws(() => fila.enfileirar({ tipo: 'smoke', fila: 'cara' }), /worker dedicado/);
    // O ponto: recusar na cara de quem programa, em vez de aceitar e
    // deixar o job pendente para sempre — pendente-para-sempre não
    // parece erro, e é assim que trabalho some sem ninguém ver.
    const pendentesCaros = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE fila = 'cara'").get().n;
    assert.equal(pendentesCaros, 0);
  });

  await t('o consumo interno só pega a fila rápida', async () => {
    fila.limparHandlers();
    require('./worker').registrarHandlers();
    const r = fila.enfileirar({ tipo: 'smoke', fila: 'rapida', chaveIdem: 'so-rapida' });
    assert.ok(r);
    const lote = fila.proximos(10, 'rapida');
    assert.ok(lote.some((x) => x.id === r.id));
    assert.ok(fila.proximos(10, 'cara').length === 0);
  });

  await t('fumaça ponta a ponta: enfileirar → worker → resultado', async () => {
    fila.limparHandlers();
    require('./worker').registrarHandlers();
    const job = fila.enfileirar({ tipo: 'smoke', payload: { oi: 'mundo' }, chaveIdem: 'fumaca-1' });
    await fila.processarLote(10);
    const dep = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id);
    assert.equal(dep.status, 'concluido', dep.ultimo_erro);
    assert.equal(JSON.parse(dep.resultado).eco.oi, 'mundo');
  });

  await t('todo handler do worker tem nome idêntico ao tipo que alguém enfileira', async () => {
    // O defeito clássico: handler 'aprovacao:executar' para job
    // 'aprovacao:<acao>'. Aqui os tipos enfileirados no código do módulo
    // são conferidos contra os handlers registrados.
    const registrados = new Set(fila.tiposRegistrados());
    const fontes = ['rotas-app.js', 'index.js'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
    const usados = [...fontes.matchAll(/enfileirar\(\{\s*tipo:\s*'([^']+)'/g)].map((m) => m[1]);
    assert.ok(usados.length >= 2, 'esperava achar tipos enfileirados no código');
    for (const u of usados) assert.ok(registrados.has(u), `job "${u}" é enfileirado e NÃO tem handler`);
  });

  // ===================================================================
  secao('ADR-0003 · mídia: o byte não passa pelo processo web');

  await t('sem armazenamento configurado, upload responde 503 dizendo o que falta', async () => {
    const r = await req('POST', '/music/api/midias/upload', { como: 'ana', corpo: { ext: 'wav' } });
    assert.equal(r.status, 503);
    assert.ok(Array.isArray(r.json.faltando) && r.json.faltando.length,
      'indisponível tem de vir com a causa, não com erro genérico');
  });

  await t('com R2 configurado, o upload devolve URL presignada de PUT (e nenhum byte por aqui)', async () => {
    process.env.MUSIC_S3_ENDPOINT = 'https://conta.r2.cloudflarestorage.com';
    process.env.MUSIC_S3_BUCKET = 'villela-music';
    process.env.MUSIC_S3_KEY = 'chave';
    process.env.MUSIC_S3_SECRET = 'segredo';
    const r = await req('POST', '/music/api/midias/upload',
      { como: 'ana', corpo: { ext: 'wav', mime: 'audio/wav', bytes: 50 * 1024 * 1024, tipo: 'gravacoes' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(/X-Amz-Signature=/.test(r.json.url), 'tem de ser URL assinada');
    assert.ok(/^https:\/\/conta\.r2\./.test(r.json.url), 'o PUT vai para o bucket, não para cá');
    assert.ok(r.json.chave.startsWith('gravacoes/u-ana/'), 'a chave separa acervo por dono');
    assert.equal(repo.Midias.porId(r.json.midia_id).estado, 'enviando');
  });

  await t('arquivo acima do limite do plano é recusado ANTES de assinar a URL', async () => {
    const r = await req('POST', '/music/api/midias/upload',
      { como: 'ana', corpo: { ext: 'wav', bytes: 9999 * 1024 * 1024 } });
    assert.equal(r.status, 413);
  });

  await t('confirmar não acredita no cliente: se o objeto não está no bucket, falha com motivo', async () => {
    const up = await req('POST', '/music/api/midias/upload', { como: 'ana', corpo: { ext: 'wav', bytes: 10 } });
    const original = storage.existe;
    storage.existe = async () => null;           // bucket vazio
    const r = await req('POST', `/music/api/midias/${up.json.midia_id}/confirmar`, { como: 'ana', corpo: {} });
    storage.existe = original;
    assert.equal(r.status, 409);
    const m = repo.Midias.porId(up.json.midia_id);
    assert.equal(m.estado, 'falhou');
    assert.ok(m.erro, 'falha nunca é silêncio: o estado carrega o motivo');
  });

  await t('confirmar com o objeto no bucket enfileira a ingestão e o worker conclui', async () => {
    const up = await req('POST', '/music/api/midias/upload', { como: 'ana', corpo: { ext: 'wav', bytes: 1234 } });
    const original = storage.existe;
    storage.existe = async () => ({ bytes: 1234, etag: 'x' });
    const r = await req('POST', `/music/api/midias/${up.json.midia_id}/confirmar`,
      { como: 'ana', corpo: { sha256: 'a'.repeat(64) } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(repo.Midias.porId(up.json.midia_id).estado, 'processando');
    await fila.processarLote(10);
    storage.existe = original;
    assert.equal(repo.Midias.porId(up.json.midia_id).estado, 'pronta');
  });

  await t('upload truncado (tamanho divergente) falha e NÃO fica como pronta', async () => {
    const up = await req('POST', '/music/api/midias/upload', { como: 'ana', corpo: { ext: 'wav', bytes: 5000 } });
    const original = storage.existe;
    storage.existe = async () => ({ bytes: 5000, etag: 'x' });
    await req('POST', `/music/api/midias/${up.json.midia_id}/confirmar`, { como: 'ana', corpo: { sha256: 'b'.repeat(64) } });
    storage.existe = async () => ({ bytes: 12, etag: 'x' });     // chegou pela metade
    await fila.processarLote(10);
    storage.existe = original;
    const m = repo.Midias.porId(up.json.midia_id);
    assert.equal(m.estado, 'falhou');
    assert.ok(/incompleto/i.test(m.erro));
  });

  await t('mídia de outra pessoa devolve 404, não o arquivo', async () => {
    const up = await req('POST', '/music/api/midias/upload', { como: 'ana', corpo: { ext: 'wav', bytes: 10 } });
    const r = await req('GET', `/music/api/midias/${up.json.midia_id}`, { como: 'bruno' });
    assert.equal(r.status, 404);
  });

  await t('nenhum áudio no disco: o módulo não escreve arquivo no DATA_DIR', async () => {
    const dir = path.join(process.env.DATA_DIR, 'music');
    const arquivos = fs.readdirSync(dir).filter((f) => /\.(wav|mp3|flac|ogg|opus|m4a)$/i.test(f));
    assert.equal(arquivos.length, 0, 'o disco do Render é de 1 GB para 15 produtos: áudio vai para o R2');
  });

  await t('presign é puro: mesma entrada, formato estável; e o hash confere', async () => {
    const c = { endpoint: 'https://x.r2.cloudflarestorage.com', bucket: 'b', key: 'k', secret: 's', region: 'auto' };
    const u = storage.presign(c, 'PUT', 'a/b.wav', 600);
    assert.ok(u.includes('X-Amz-Credential=k%2F'));
    assert.ok(u.includes('X-Amz-Expires=600'));
    const h = storage.sha256De(Buffer.from('musica'));
    assert.equal(h.length, 64);
    assert.ok(storage.hashConfere(h, h));
    assert.ok(!storage.hashConfere(h, 'c'.repeat(64)));
    assert.ok(!storage.hashConfere('', ''), 'hash vazio não pode "conferir"');
  });

  // ===================================================================
  secao('Q5/Q6 · IA: o que não existe não aparece');

  await t('capability sem provedor ativo NÃO aparece como disponível', async () => {
    assert.ok(!router.disponivel('musica.gerar'),
      'geração de música não tem fornecedor com API pública (Q6)');
    assert.ok(!router.disponiveis().includes('musica.gerar'));
    assert.ok(router.CAPABILITIES.includes('musica.gerar'),
      'a capability existe, para o vazio ser visível no painel');
  });

  await t('a tela do usuário só recebe capability disponível', async () => {
    const r = await req('GET', '/music/api/me', { como: 'ana' });
    assert.ok(!r.json.capacidades_ia.includes('musica.gerar'),
      'a Musique nunca oferece botão que não funciona');
  });

  await t('cotar devolve null quando não há provedor, e a rota diz 503', async () => {
    assert.equal(router.cotar('musica.gerar'), null);
    const r = await req('POST', '/music/api/ia/cotar', { como: 'ana', corpo: { capability: 'musica.gerar' } });
    assert.equal(r.status, 503);
  });

  await t('executar sem provedor não simula resultado: lança e é permanente', async () => {
    await assert.rejects(() => router.executar('musica.gerar', {}), (e) => e.semProvedor && e.permanente);
  });

  await t('ligar um provedor faz a capability aparecer, e cotar traz o custo ANTES', async () => {
    router.injetarParaTeste('falso', async ({ entrada }) => ({ eco: entrada }));
    router.definirProvedor({ capability: 'harmonia.sugerir', provider: 'falso', model: 'm1',
      ativo: 1, prioridade: 1, creditos: 2, custoEstimadoCentavos: 7, promptVersao: 'v1' });
    assert.ok(router.disponivel('harmonia.sugerir'));
    const c = router.cotar('harmonia.sugerir');
    assert.equal(c.custo_estimado_centavos, 7);
    assert.equal(c.creditos, 2);
    const r = await router.executar('harmonia.sugerir', { tom: 'C' }, { usuario: 'u-ana' });
    assert.equal(r._provider, 'falso');
    assert.equal(r._custo_centavos, 7);
  });

  await t('teto de custo recusa o provedor caro em vez de gastar', async () => {
    await assert.rejects(() => router.executar('harmonia.sugerir', {}, { tetoCentavos: 1 }),
      (e) => /Nenhum provedor concluiu/.test(e.message));
  });

  await t('fallback: provedor que falha cede a vez ao próximo, e o motivo fica registrado', async () => {
    router.injetarParaTeste('ruim', async () => { throw new Error('caiu'); });
    router.injetarParaTeste('bom', async () => ({ ok: true }));
    router.definirProvedor({ capability: 'letra.sugerir', provider: 'ruim', ativo: 1, prioridade: 1, custoEstimadoCentavos: 1 });
    router.definirProvedor({ capability: 'letra.sugerir', provider: 'bom', ativo: 1, prioridade: 2, custoEstimadoCentavos: 1 });
    const r = await router.executar('letra.sugerir', {}, { usuario: 'u-ana' });
    assert.equal(r._provider, 'bom');
    const usos = db.prepare("SELECT * FROM ia_usos WHERE capability = 'letra.sugerir' ORDER BY criado_em").all();
    assert.ok(usos.some((u) => u.provider === 'ruim' && u.ok === 0), 'a falha do primeiro tem de ficar registrada');
  });

  await t('custo de IA por usuário é mensurável (é o número que protege a margem)', async () => {
    const linhas = router.custoPorUsuario('');
    const ana = linhas.find((l) => l.usuario === 'u-ana');
    assert.ok(ana && ana.centavos > 0);
  });

  await t('provedor semeado nasce DESLIGADO: ligar é decisão comercial', async () => {
    const l = router.registry().filter((x) => x.observacao.includes('Fase 0'));
    assert.ok(l.length >= 5);
    assert.ok(l.every((x) => x.ativo === 0));
  });

  await t('capability desconhecida é recusada no registry', async () => {
    assert.throws(() => router.definirProvedor({ capability: 'inventada.xyz', provider: 'x' }));
  });

  // ===================================================================
  secao('ADR-0004 · o AI Router não conhece autorização');

  await t('nada em ia/ importa direitos, sessao, repo ou storage', async () => {
    const dir = path.join(__dirname, 'ia');
    const arquivos = [];
    (function varrer(d) {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) varrer(p); else if (f.name.endsWith('.js')) arquivos.push(p);
      }
    })(dir);
    assert.ok(arquivos.length >= 2);
    const proibidos = ['direitos', 'sessao', 'repo', 'storage', 'rotas-'];
    for (const a of arquivos) {
      const src = fs.readFileSync(a, 'utf8');
      for (const m of src.matchAll(/require\('([^']+)'\)/g)) {
        const alvo = m[1];
        if (proibidos.some((p) => alvo.includes(p))) {
          throw new Error(`${path.basename(a)} importa "${alvo}" — o router não decide autorização (ADR-0004)`);
        }
      }
    }
  });

  await t('a trava de direitos vive no domínio, não no adapter', async () => {
    const adapter = fs.readFileSync(path.join(__dirname, 'ia', 'adapters', 'anthropic.js'), 'utf8');
    assert.ok(!/terceiro_privado/.test(adapter),
      'se a trava morasse no adapter, trocar de fornecedor apagaria a trava');
    const dom = fs.readFileSync(path.join(__dirname, 'direitos.js'), 'utf8');
    assert.ok(/terceiro_privado/.test(dom));
  });

  // ===================================================================
  secao('voz e consentimento');

  await t('sem consentimento, uso da própria voz é recusado', async () => {
    const v = direitos.podeUsarVoz({ titularDaVoz: 'u-ana', solicitante: 'u-ana' });
    assert.equal(v.pode, false);
  });

  await t('com consentimento, a própria voz é liberada', async () => {
    await req('POST', '/music/api/consentimentos', { como: 'ana', corpo: { escopo: 'voz.clonar_propria' } });
    assert.ok(direitos.podeUsarVoz({ titularDaVoz: 'u-ana', solicitante: 'u-ana' }).pode);
  });

  await t('voz de OUTRA pessoa é recusada mesmo com consentimento dela no sistema', async () => {
    const v = direitos.podeUsarVoz({ titularDaVoz: 'u-ana', solicitante: 'u-bruno' });
    assert.equal(v.pode, false);
    assert.ok(/outra pessoa/i.test(v.motivo));
  });

  await t('menor de idade: nunca', async () => {
    const v = direitos.podeUsarVoz({ titularDaVoz: 'u-ana', solicitante: 'u-ana', menor: true });
    assert.equal(v.pode, false);
  });

  await t('consentimento de menor exige responsável (LGPD art. 14)', async () => {
    assert.throws(() => direitos.concederConsentimento({ usuario: 'u-x', escopo: 'voz.clonar_propria', menor: true }));
    const c = direitos.concederConsentimento({ usuario: 'u-x', escopo: 'voz.clonar_propria', menor: true, responsavel: 'u-ana' });
    assert.equal(c.responsavel, 'u-ana');
  });

  await t('revogar tira o acesso e enfileira a purga dos derivados', async () => {
    const r = await req('DELETE', '/music/api/consentimentos/voz.clonar_propria', { como: 'ana' });
    assert.equal(r.status, 200);
    assert.ok(r.json.revogados >= 1);
    assert.equal(direitos.temConsentimento('u-ana', 'voz.clonar_propria'), false);
    const job = db.prepare("SELECT * FROM jobs WHERE tipo = 'voz.purgar_derivados' ORDER BY criado_em DESC").get();
    assert.ok(job, 'a revogação não pode depender de alguém lembrar de limpar');
  });

  await t('a revogação continua registrada: é fato datado, não ausência de registro', async () => {
    const l = db.prepare("SELECT * FROM consentimentos WHERE usuario = 'u-ana' AND escopo = 'voz.clonar_propria'").all();
    assert.ok(l.length >= 1);
    assert.ok(l.every((x) => x.revogado_em));
  });

  await t('purga não apaga nada se a pessoa reconsentiu antes do job rodar', async () => {
    direitos.concederConsentimento({ usuario: 'u-ana', escopo: 'voz.clonar_propria' });
    fila.limparHandlers();
    require('./worker').registrarHandlers();
    const job = fila.enfileirar({ tipo: 'voz.purgar_derivados', payload: { usuario: 'u-ana', escopo: 'voz.clonar_propria' } });
    await fila.processarLote(10);
    const dep = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id);
    assert.equal(dep.status, 'concluido');
    assert.ok(JSON.parse(dep.resultado).pulou, 'entrega no mínimo uma vez torna esta corrida real');
  });

  // ===================================================================
  secao('auditoria e painel do staff');

  await t('toda ação sobre direito fica na auditoria', async () => {
    const eventos = direitos.auditoria(200).map((e) => e.acao);
    for (const a of ['obra.criada', 'titularidade.declarada', 'obra.visibilidade', 'obra.recolhida',
      'consentimento.concedido', 'consentimento.revogado']) {
      assert.ok(eventos.includes(a), 'falta na auditoria: ' + a);
    }
  });

  await t('painel do staff mostra fila, DLQ, acervo por titularidade e o que falta configurar', async () => {
    const r = await req('GET', '/staff/api/music/painel');
    assert.equal(r.status, 200);
    assert.ok(r.json.fila && typeof r.json.fila.dlq === 'number');
    assert.ok(Array.isArray(r.json.acervo_por_titularidade));
    assert.equal(r.json.produto.marca, 'Musique');
    assert.equal(r.json.produto.plataforma, 'Villela Music');
  });

  await t('a DLQ é visível pelo staff (falha silenciosa é o pior desfecho)', async () => {
    const r = await req('GET', '/staff/api/music/fila');
    assert.ok(r.json.dlq.length >= 1);
    assert.ok(r.json.handlers.includes('midia.ingerir'));
  });

  await t('trocar provedor de IA é UPDATE pelo staff, não deploy', async () => {
    const r = await req('POST', '/staff/api/music/ia',
      { corpo: { capability: 'tutor.explicar', provider: 'anthropic', model: 'claude-haiku-4-5', ativo: false, custo_estimado_centavos: 3 } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const linha = router.registry().find((x) => x.capability === 'tutor.explicar' && x.provider === 'anthropic');
    assert.equal(linha.custo_estimado_centavos, 3);
  });

  await t('rota de escrita do staff exige admin', async () => {
    const r = await req('POST', '/staff/api/music/ia', { staff: 'op', corpo: { capability: 'tutor.explicar', provider: 'anthropic' } });
    assert.equal(r.status, 403);
    const d = await req('POST', '/staff/api/music/fila/destravar', { staff: 'op' });
    assert.equal(d.status, 403);
  });

  await t('config é editável pelo staff e some do alcance do usuário', async () => {
    const r = await req('PUT', '/staff/api/music/config/limites', { corpo: { valor: { upload_mb: 500 } } });
    assert.equal(r.status, 200);
    assert.equal(repo.Config.get('limites').upload_mb, 500);
    const u = await req('GET', '/music/api/config', { como: 'ana' });
    assert.ok(u.status >= 400, 'usuário não mexe em config da plataforma');
  });

  // ===================================================================
  secao('páginas e comunicação (decisão Q6)');

  await t('landing responde e NÃO promete geração de música', async () => {
    const r = await req('GET', '/music', { cru: true });
    assert.equal(r.status, 200);
    assert.ok(/Musique/.test(r.texto));
    assert.ok(/por Villela Music/.test(r.texto));
    assert.ok(!/ger(e|ar|ação)\s+(sua\s+)?m[úu]sica/i.test(r.texto),
      'decisão Q6: não anunciar geração de música — não há fornecedor com API pública');
  });

  await t('a landing não inventa marca: usa os tokens oficiais do grupo', async () => {
    const r = await req('GET', '/music', { cru: true });
    assert.ok(/#1B2A4A/.test(r.texto), 'navy oficial');
    assert.ok(/Lora/.test(r.texto) && /Inter/.test(r.texto), 'tipografia oficial');
  });

  await t('termos e privacidade nascem carimbados MINUTA', async () => {
    for (const p of ['/music/termos', '/music/privacidade']) {
      const r = await req('GET', p, { cru: true });
      assert.equal(r.status, 200);
      assert.ok(/MINUTA/.test(r.texto), p + ' devia estar carimbado');
    }
  });

  await t('headers de segurança presentes nas páginas do módulo', async () => {
    const r = await req('GET', '/music', { cru: true });
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('referrer-policy'));
  });

  await t('/music/saude expõe o estado real, inclusive o que falta', async () => {
    const r = await req('GET', '/music/saude');
    assert.equal(r.status, 200);
    assert.equal(r.json.produto, 'Musique');
    assert.ok(r.json.handlers.includes('smoke'));
  });

  await t('a landing sobe mesmo sem a conta da Academia injetada', async () => {
    // Módulo que exige tudo para subir é módulo que derruba o grupo
    // quando falta uma env. Aqui a landing funciona e a API do usuário
    // responde 503 com a causa.
    const app3 = express();
    app3.use(express.json()); app3.use(cookieParser());
    require('./index').montar(app3, { express, requireAuth, requireAdmin, jwtSecret: SEGREDO });
    const s3 = app3.listen(0);
    await new Promise((r) => s3.once('listening', r));
    const p = s3.address().port;
    const land = await fetch(`http://127.0.0.1:${p}/music`);
    const api = await fetch(`http://127.0.0.1:${p}/music/api/me`);
    s3.close();
    assert.equal(land.status, 200);
    assert.equal(api.status, 503, 'sem conta configurada: 503 com causa, não 500 mudo');
  });

  // ===================================================================
  // FASE 1 — Academia Musical (teoria, avaliação, currículo, tarefas)
  // ===================================================================
  await require('./selftest-fase1').rodar({ t, secao, req, assert, PROFESSORES });

  // ===================================================================
  // FASE 2 — biblioteca, repertório e palco
  // ===================================================================
  await require('./selftest-fase2').rodar({ t, secao, req, assert });

  // ===================================================================
  // FASE 3 — escolas, turmas, presença e boletim
  // ===================================================================
  await require('./selftest-fase3').rodar({ t, secao, req, assert, PROFESSORES });

  // ===================================================================
  srv.close();
  console.log(`\n${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach((f) => console.log(` - ${f.nome}: ${f.erro}`)); process.exit(1); }
})();
