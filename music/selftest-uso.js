// =====================================================================
// Musique — TEMPO DE USO + ALUNOS IDENTIFICADOS (07/11/2026)
//
// Cada teste existe porque, sem ele, uma decisão viraria só um parágrafo:
//   • o servidor decide quanto somar (pulso rápido soma MENOS, nunca mais)
//   • um relógio por pessoa (duas abas não dobram o tempo)
//   • o cookie do Musique NÃO se confunde com o da Academy (ADR-0011)
//   • relatório nominal: só admin, CSV auditado, sem fórmula no Excel
//   • visitante anônimo e id forjado não entram
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

async function rodar({ t, secao, req, assert }) {
  secao('Tempo de uso e alunos identificados (relatório 🎵 do staff)');
  const Uso = require('./uso-tempo');
  const Cliente = require('./uso-cliente');
  const atrib = require('../nucleo/atribuicao-aluno');
  const R = require('./relatorio-visitas-alunos');
  const em = (seg) => new Date(Date.UTC(2026, 10, 7, 12, 0, 0) + seg * 1000);

  await t('servidor decide o tempo: 1º pulso = 30 s; intervalo real; rajada ignorada; mais rápido soma menos', async () => {
    assert.equal(Uso.pulso('u-bruno', 'cifras', em(0)).somado, 30);
    assert.equal(Uso.pulso('u-bruno', 'cifras', em(31)).somado, 31);
    assert.equal(Uso.pulso('u-bruno', 'cifras', em(33)).somado, 0);          // rajada < 5 s
    assert.equal(Uso.pulso('u-bruno', 'cifras', em(38)).somado, 7);          // rajada não grava: o relógio segue em 31 s
    assert.equal(Uso.pulso('u-bruno', 'cifras', em(38 + 600)).somado, 30);   // sumiu 10 min: vale 30, não 600
  });

  await t('um relógio por pessoa: trocar de área não abre um segundo relógio', async () => {
    const antes = Uso.porUsuarioArea('2026-11-07', '2026-11-07').filter((x) => x.usuario === 'u-bruno').reduce((s, x) => s + x.segundos, 0);
    assert.equal(Uso.pulso('u-bruno', 'tocar', em(38 + 600 + 1)).somado, 0);   // 1 s depois, outra área: rajada
    assert.equal(Uso.pulso('u-bruno', 'tocar', em(38 + 600 + 20)).somado, 20);
    const depois = Uso.porUsuarioArea('2026-11-07', '2026-11-07').filter((x) => x.usuario === 'u-bruno').reduce((s, x) => s + x.segundos, 0);
    assert.equal(depois - antes, 20);
  });

  await t('área fora da allowlist cai em "app" — nunca vira valor livre no banco', async () => {
    Uso.pulso('u-sus', "'; DROP TABLE uso_tempo;--", em(0));
    const linhas = Uso.porUsuarioArea('2026-11-07', '2026-11-07').filter((x) => x.usuario === 'u-sus');
    assert.deepEqual(linhas.map((x) => x.area), ['app']);
  });

  await t('rota do pulso: sem sessão = 401; com sessão soma; área estranha vira "app"', async () => {
    assert.equal((await req('POST', '/music/api/uso/pulso', { corpo: { area: 'cifras' } })).status, 401);
    const r = await req('POST', '/music/api/uso/pulso', { como: 'ana', corpo: { area: 'palco' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.somado, 30);
    const seg = await req('POST', '/music/api/uso/pulso', { como: 'ana', corpo: { area: 'x'.repeat(500) } });
    assert.equal(seg.status, 200);
    assert.equal(seg.json.somado, 0);                       // rajada: o relógio é um só
  });

  await t('cliente: só pulsa com a aba visível e a pessoa mexendo; Tocar junto tolera mais', async () => {
    let t0 = 1000000, enviados = [];
    const doc = { visibilityState: 'visible' };
    const mk = (pathname, hash) => Cliente.criar({ janela: { location: { pathname, hash: hash || '' } }, documento: doc, agora: () => t0, enviar: (c) => enviados.push(c) });
    const app = mk('/music/app', '#cifras');
    assert.deepEqual(app.pulsar(), { area: 'cifras' });
    doc.visibilityState = 'hidden';
    assert.equal(app.pulsar(), null, 'aba escondida não conta');
    doc.visibilityState = 'visible';
    t0 += Cliente.OCIOSO_MS + 1;
    assert.equal(app.pulsar(), null, 'parado além da tolerância não conta');
    app.marcar();
    assert.ok(app.pulsar(), 'mexeu de novo: volta a contar');
    const tocar = mk('/music/tocar', '');
    t0 += Cliente.OCIOSO_MS + 1;
    assert.deepEqual(tocar.pulsar(), { area: 'tocar' }, 'praticando com o instrumento não mexe no mouse');
    t0 += Cliente.OCIOSO_PRATICA_MS + 1;
    assert.equal(tocar.pulsar(), null);
    // o corpo que o cliente monta só tem a área
    enviados.forEach((c) => assert.deepEqual(Object.keys(c), ['area']));
    // as áreas que ele sugere existem todas na allowlist do servidor
    for (const [p, h] of [['/music/app', ''], ['/music/app', '#cifras'], ['/music/app', '#palco'], ['/music/app', '#biblioteca'], ['/music/app', '#escolas'], ['/music/app', '#conta'], ['/music/tocar', ''], ['/music/explorar/laboratorio', '']]) {
      assert.ok(Uso.AREAS[Cliente.areaDe(p, h)], `área ${Cliente.areaDe(p, h)} não existe no servidor`);
    }
  });

  await t('cliente: 401/402/403 do pulso para de vez (sem sessão não insiste)', async () => {
    let chamadas = 0;
    const w = { location: { pathname: '/music/app', hash: '' }, fetch: async () => { chamadas++; return { status: 401 }; } };
    const c = Cliente.criar({ janela: w, documento: { visibilityState: 'visible' } });
    c.pulsar(); await new Promise((r) => setImmediate(r));
    c.pulsar();
    assert.equal(chamadas, 1);
  });

  await t('páginas do app, Tocar e Laboratório carregam o pulso; o arquivo é servido', async () => {
    const js = await req('GET', '/music/uso-cliente.js', { cru: true });
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') || '', /javascript/);
    for (const pagina of ['/music/app', '/music/tocar']) {
      const h = await req('GET', pagina, { cru: true });
      assert.match(h.texto, /<script src="\/music\/uso-cliente\.js"/, pagina + ' não carrega o pulso');
    }
    const lab = await req('GET', '/music/laboratorio.js', { cru: true });
    assert.ok(lab.texto.includes('MusiqueUso'), 'o bundle do Laboratório precisa do pulso');
  });

  await t('cookie vs_musique: assinatura própria — o da Academy não vale aqui, nem o contrário', async () => {
    const doMusique = atrib.musique.valorDe('u-ana');
    assert.equal(atrib.musique.verificar(doMusique), 'u-ana');
    assert.equal(atrib.verificar(doMusique), '', 'cookie do Musique não pode valer como aluno da Academy');
    assert.equal(atrib.musique.verificar(atrib.valorDe('u-ana')), '', 'cookie da Academy não pode valer como pessoa do Musique');
    assert.equal(atrib.musique.verificar('u-ana.assinatura-forjada-aaaaaaa'), '');
  });

  await t('entrar emite vs_musique; sair apaga', async () => {
    const e = await req('POST', '/music/api/conta/entrar', { corpo: { email: 'bruno@t', senha: 'senha-teste-123' } });
    assert.equal(e.status, 200, JSON.stringify(e.json));
    const ck = e.setCookie.find((c) => c.startsWith('vs_musique='));
    assert.ok(ck, 'login não emitiu o cookie de atribuição: ' + e.setCookie.join(' | '));
    assert.match(ck, /HttpOnly/i);
    const valor = decodeURIComponent(ck.split(';')[0].split('=').slice(1).join('='));
    assert.equal(atrib.musique.verificar(valor), 'u-bruno');
    const s = await req('POST', '/music/api/conta/sair', { como: 'bruno' });
    assert.ok(s.setCookie.some((c) => /^vs_musique=;/.test(c)), 'sair não apagou o cookie: ' + s.setCookie.join(' | '));
  });

  await t('middleware de visitas grava `mid` só com assinatura válida; robô e forjado ficam anônimos', async () => {
    const express = require('express');
    const cookieParser = require('cookie-parser');
    const visitas = require('../nucleo/visitas');
    const DATA = process.env.DATA_DIR;
    process.env.VISITAS_GEO = 'off';
    const col = visitas.criarColetor(DATA);
    const a = express();
    a.use(cookieParser());
    a.use(col.middleware);
    a.get('/music/x', (q, r) => r.type('html').send('<p>ok</p>'));
    const srv = a.listen(0); await new Promise((r) => srv.once('listening', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/music/x';
    const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0';
    await fetch(url, { headers: { 'User-Agent': UA, Cookie: 'vs_musique=' + atrib.musique.valorDe('u-ana') } });
    await fetch(url, { headers: { 'User-Agent': UA, Cookie: 'vs_musique=u-bruno.forjadoforjadoforjadoforj' } });
    await fetch(url, { headers: { 'User-Agent': UA, Cookie: 'vs_musique=' + atrib.valorDe('u-bruno') } });   // cookie da Academy
    await fetch(url, { headers: { 'User-Agent': 'Googlebot/2.1', Cookie: 'vs_musique=' + atrib.musique.valorDe('u-ana') } });
    await new Promise((r) => setTimeout(r, 150));
    srv.close();
    const hoje = new Date().toISOString().slice(0, 10);
    const porMid = visitas.visitasPorUid(DATA, hoje, hoje, 'mid');
    assert.deepEqual(Object.keys(porMid), ['u-ana'], 'só a visita com assinatura válida e sem robô é atribuída');
    assert.equal(porMid['u-ana'].paginas, 1);
    // e a atribuição da Academy não enxerga o Musique
    assert.deepEqual(Object.keys(visitas.visitasPorUid(DATA, hoje, hoje)), []);
  });

  await t('relatório: junta visitas e tempo; id sem conta não aparece; visitante anônimo nunca', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    Uso.pulso('u-ana', 'cifras', new Date());   // o relógio de hoje (ana já pulsou na rota, mas outro dia/área soma igual)
    const rel = R.montar({ dias: 7, porMid: { 'u-ana': { paginas: 4, sessoes: 2, dias: 1, primeira: hoje + 'T10:00:00Z', ultima: hoje + 'T11:00:00Z', porProduto: [{ id: 'music', nome: 'Musique', emoji: '🎵', paginas: 3, ultima: '' }, { id: 'academy', nome: 'Academy', emoji: '🎓', paginas: 1, ultima: '' }] }, 'fantasma': { paginas: 9, sessoes: 9, dias: 1, primeira: '', ultima: '', porProduto: [] } } });
    const ana = rel.alunos.find((a) => a.id === 'u-ana');
    assert.ok(ana, 'ana tinha visita e uso');
    assert.equal(ana.visitas.porGrupo.sistemas, 3);
    assert.equal(ana.visitas.porGrupo.cursos, 1);
    assert.ok(ana.tempo_total_seg >= 30);
    assert.ok(!rel.alunos.some((a) => a.id === 'fantasma'));
    assert.ok(rel.resumo.por_area.length >= 1);
    assert.equal(rel.resumo.alunos, rel.alunos.length);
  });

  await t('rotas do staff: só admin; detalhe de quem não existe = 404', async () => {
    assert.equal((await req('GET', '/staff/api/music/visitas-alunos?dias=30', { staff: 'op' })).status, 403);
    assert.equal((await req('GET', '/staff/api/music/visitas-alunos.csv', { staff: 'op' })).status, 403);
    const ok = await req('GET', '/staff/api/music/visitas-alunos?dias=30', { staff: 'adm' });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.ok(Array.isArray(ok.json.alunos));
    assert.equal((await req('GET', '/staff/api/music/visitas-alunos/nao-existe', { staff: 'adm' })).status, 404);
    const det = await req('GET', '/staff/api/music/visitas-alunos/u-bruno?dias=30', { staff: 'adm' });
    assert.equal(det.status, 200);
    assert.ok(det.json.dias_de_uso.length >= 1);
  });

  await t('CSV: BOM, separador ";", auditado, e nome com "=" não vira fórmula', async () => {
    const { db } = require('./db');
    db.prepare("UPDATE contas_music SET nome = '=HYPERLINK(\"x\")' WHERE id = 'u-sus'").run();
    const antes = require('./direitos').auditoria(500).filter((e) => e.acao === 'relatorio.visitas-alunos.csv').length;
    const r = await req('GET', '/staff/api/music/visitas-alunos.csv?dias=30', { staff: 'adm', cru: true });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /text\/csv/);
    // (fetch().text() descarta o BOM; confere no gerador)
    assert.ok(R.csv(R.montar({ dias: 30 })).charCodeAt(0) === 0xFEFF, 'sem BOM o Excel quebra os acentos');
    assert.ok(r.texto.split('\r\n')[0].includes(';'));
    assert.ok(!/(^|;)=HYPERLINK/.test(r.texto), 'nome começando com = precisa ser neutralizado');
    const depois = require('./direitos').auditoria(500).filter((e) => e.acao === 'relatorio.visitas-alunos.csv').length;
    assert.equal(depois, antes + 1, 'exportar dados pessoais tem de ficar na auditoria');
  });
}

module.exports = { rodar };
