// =====================================================================
// Villela Academy — VISITAS IDENTIFICADAS + TEMPO NAS AULAS · testes.
// Chamado pelo selftest (npm run test:academy).
//   1. login emite o cookie de atribuição `vs_aluno` (uid assinado) e o
//      logout o apaga; cookie forjado não vira uid;
//   2. o middleware de visitas grava `uid` só com cookie válido;
//   3. o pulso de tempo: o servidor decide quanto somar (nunca acelera);
//   4. o relatório junta visitas + tempo, e a rota é só de admin.
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function rodar({ t, req, jars, emailProdutor }) {
  const { db } = require('./db');
  const repo = require('./repo');
  const ct = require('./repo-conteudo');
  const atrib = require('../nucleo/atribuicao-aluno');
  const visitas = require('../nucleo/visitas');
  const R = require('./relatorio-visitas-alunos');

  console.log('\n— visitas identificadas do aluno e tempo nas aulas —');
  const ANA = { nome: 'Ana Visitante', email: 'ana.visitas@teste.local', senha: 'senha-forte-123', aceite_termos: true };
  let ana = null;

  await t('cadastro/login emite vs_aluno com o uid assinado (e não é a sessão)', async () => {
    const r = await req('POST', '/academy/api/signup', { corpo: ANA, jar: 'ana' });
    assert.ok(r.st === 200 || r.st === 201, 'signup ' + r.st + ' ' + r.texto);
    ana = repo.Usuarios.porEmail(ANA.email);
    const me = await req('GET', '/academy/api/me', { jar: 'ana' });
    assert.equal(me.st, 200);
    assert.ok(jars.ana && jars.ana.vs_aluno, 'cookie vs_aluno ausente');
    assert.equal(atrib.verificar(decodeURIComponent(jars.ana.vs_aluno)), ana.id);
    // sozinho, o cookie de atribuição não abre conta nenhuma
    const so = await req('GET', '/academy/api/me', { cab: { Cookie: 'vs_aluno=' + jars.ana.vs_aluno } });
    assert.equal(so.st, 401);
  });

  await t('cookie forjado, de outro uid ou malformado não vira uid', () => {
    const bom = atrib.valorDe(ana.id);
    assert.equal(atrib.verificar(bom), ana.id);
    assert.equal(atrib.verificar('outroId.' + bom.split('.').pop()), '');
    assert.equal(atrib.verificar(bom.slice(0, -1) + (bom.endsWith('A') ? 'B' : 'A')), '');
    assert.equal(atrib.verificar(''), '');
    assert.equal(atrib.verificar('semponto'), '');
    assert.equal(atrib.verificar('a b.c'), '');
  });

  await t('domínio do cookie: família *.villelastay.com.br; fora dela, host-only', () => {
    assert.equal(atrib.dominioDe('academia.villelastay.com.br'), '.villelastay.com.br');
    assert.equal(atrib.dominioDe('livros.villelastay.com.br:443'), '.villelastay.com.br');
    assert.equal(atrib.dominioDe('musique.villelastay.com'), '.villelastay.com');
    assert.equal(atrib.dominioDe('villela-stay-backend.onrender.com'), undefined);
    assert.equal(atrib.dominioDe('evilvillelastay.com.br'), undefined);
    assert.equal(atrib.dominioDe('localhost'), undefined);
  });

  await t('middleware de visitas grava uid só com cookie válido; robô nunca', async () => {
    const express = require('express');
    const cookieParser = require('cookie-parser');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visitas-uid-'));
    process.env.VISITAS_GEO = 'off';
    const col = visitas.criarColetor(dir);
    const app = express(); app.use(cookieParser()); app.use(col.middleware);
    app.get(['/academy', '/livros', '/vitrine'], (q, s) => s.type('html').send('<p>oi</p>'));
    const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
    const ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120';
    const ir = (p, cookie, agente = ua) => fetch(base + p, { headers: { 'user-agent': agente, ...(cookie ? { Cookie: cookie } : {}) } });
    try {
      await ir('/academy', 'vs_aluno=' + encodeURIComponent(atrib.valorDe(ana.id)));
      await ir('/livros', 'vs_aluno=' + encodeURIComponent(atrib.valorDe(ana.id)));
      await ir('/vitrine', 'vs_aluno=' + encodeURIComponent('forjado.' + atrib.valorDe(ana.id).split('.').pop()));
      await ir('/academy');
      await ir('/academy', 'vs_aluno=' + encodeURIComponent(atrib.valorDe(ana.id)), 'Googlebot/2.1 (+http://www.google.com/bot.html)');
      await new Promise(r => setTimeout(r, 150));
      const linhas = fs.readFileSync(path.join(dir, 'hits.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(linhas.length, 5);
      assert.deepEqual(linhas.map(l => l.uid || ''), [ana.id, ana.id, '', '', '']);
      const por = visitas.visitasPorUid(dir);
      assert.deepEqual(Object.keys(por), [ana.id]);
      assert.equal(por[ana.id].paginas, 2);
      assert.equal(por[ana.id].sessoes, 1);
      assert.deepEqual(por[ana.id].porProduto.map(p => p.id).sort(), ['academy', 'livraria']);
    } finally { srv.close(); }
  });

  // um curso da Maria com duas aulas; a Ana matriculada nele, o Zé não
  const maria = repo.Usuarios.porEmail(emailProdutor);
  const curso = ct.Produtos.criar(maria.id, { titulo: 'Curso do Relógio', descricao_curta: 'Curso de teste do tempo nas aulas.', preco_centavos: 9900 });
  const mod = ct.Conteudo.addModulo(curso.id, 'Aula 01 — Tempo');
  const aula1 = { id: ct.Conteudo.addAula(curso.id, mod, { titulo: '1.1 Primeira', tipo: 'texto' }) };
  const aula2 = { id: ct.Conteudo.addAula(curso.id, mod, { titulo: '1.2 Segunda', tipo: 'texto' }) };
  db.prepare("INSERT INTO enrollments (id, user_id, product_id, origem, status, criado_em) VALUES (?, ?, ?, 'cortesia', 'ativa', ?)")
    .run('enr-relogio', ana.id, curso.id, new Date().toISOString());

  await t('pulso: o servidor decide quanto somar (30 s, intervalo real até 60 s, rajada ignorada)', () => {
    const t0 = Date.parse('2026-10-16T12:00:00.000Z');
    const em = (s) => new Date(t0 + s * 1000);
    assert.equal(ct.Tempo.pulso(ana.id, aula1.id, em(0)).somado, 30);      // primeiro pulso = um período
    assert.equal(ct.Tempo.pulso(ana.id, aula1.id, em(31)).somado, 31);     // intervalo real
    assert.equal(ct.Tempo.pulso(ana.id, aula1.id, em(33)).somado, 0);      // rajada (< 5 s): nada
    assert.equal(ct.Tempo.pulso(ana.id, aula1.id, em(36)).somado, 5);      // mais rápido soma MENOS, nunca mais
    assert.equal(ct.Tempo.pulso(ana.id, aula1.id, em(36 + 3600)).somado, 30); // voltou depois de uma hora: um período, não uma hora
    // trocar de aula não abre um segundo relógio
    assert.equal(ct.Tempo.pulso(ana.id, aula2.id, em(36 + 3600 + 40)).somado, 40);
    const linhas = db.prepare('SELECT lesson_id, segundos, pulsos FROM study_time WHERE user_id = ? ORDER BY lesson_id').all(ana.id);
    const seg = Object.fromEntries(linhas.map(l => [l.lesson_id, l.segundos]));
    assert.equal(seg[aula1.id], 96);
    assert.equal(seg[aula2.id], 40);
  });

  await t('pulso de quem não tem acesso ao curso é recusado (rota real)', async () => {
    await req('POST', '/academy/api/signup', { corpo: { nome: 'Zé Sem Curso', email: 'ze.semcurso@teste.local', senha: 'senha-forte-123', aceite_termos: true }, jar: 'ze' });
    const r = await req('POST', '/academy/api/aluno/aulas/' + aula1.id + '/tempo', { jar: 'ze' });
    assert.equal(r.st, 400);
    const ze = repo.Usuarios.porEmail('ze.semcurso@teste.local');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM study_time WHERE user_id = ?').get(ze.id).n, 0);
    const sem = await req('POST', '/academy/api/aluno/aulas/' + aula1.id + '/tempo', {});
    assert.equal(sem.st, 401);
  });

  await t('pulso pela rota real soma para a aluna matriculada', async () => {
    const antes = db.prepare('SELECT COALESCE(SUM(segundos),0) s FROM study_time WHERE user_id = ?').get(ana.id).s;
    const r = await req('POST', '/academy/api/aluno/aulas/' + aula1.id + '/tempo', { jar: 'ana' });
    assert.equal(r.st, 200, r.texto);
    assert.ok(r.json.ok);
    const depois = db.prepare('SELECT COALESCE(SUM(segundos),0) s FROM study_time WHERE user_id = ?').get(ana.id).s;
    assert.equal(depois - antes, r.json.somado);
  });

  await t('relatório junta visitas + tempo por curso; uid sem conta fica de fora', () => {
    ct.Progresso.marcar(ana.id, aula1.id, { concluida: true });
    const porUid = {
      [ana.id]: { paginas: 7, sessoes: 3, dias: 2, primeira: '2026-10-16T10:00:00.000Z', ultima: '2026-10-16T11:00:00.000Z',
        porProduto: [{ id: 'academy', paginas: 4 }, { id: 'livraria', paginas: 2 }, { id: 'vitrine', paginas: 1 }] },
      fantasma: { paginas: 9, sessoes: 9, dias: 1, primeira: '', ultima: '', porProduto: [] },
    };
    // a janela cobre os pulsos datados de 16/10/2026 nos testes acima
    const rel = R.montar({ dias: 365, porUid });
    const a = rel.alunos.find(x => x.id === ana.id);
    assert.ok(a, 'Ana fora do relatório');
    assert.ok(!rel.alunos.find(x => x.id === 'fantasma'));
    assert.deepEqual(a.visitas.porGrupo, { cursos: 4, livros: 2, sistemas: 1, site: 0 });
    const c = a.cursos.find(x => x.product_id === curso.id);
    assert.ok(c && c.segundos >= 136, 'tempo do curso');
    assert.equal(c.aulas_tocadas, 2);
    assert.equal(c.concluidas, 1);
    assert.equal(c.total_aulas, 2);
    assert.equal(a.tempo_total_seg, a.cursos.reduce((s, x) => s + x.segundos, 0));
    const csv = R.csv(rel);
    assert.ok(csv.startsWith('﻿'), 'CSV sem BOM');
    assert.ok(csv.includes('Curso do Relógio'));
    const det = R.detalhe(ana.id, { dias: 365, porUid });
    assert.equal(det.aulas.length, 2);
    assert.equal(R.detalhe('nao-existe', { dias: 365, porUid }), null);
  });

  await t('rota do relatório é só de admin do staff; o export LGPD leva o tempo', async () => {
    const r = await req('GET', '/staff/api/academy/visitas-alunos?dias=30');
    assert.equal(r.st, 200, r.texto);
    assert.ok(Array.isArray(r.json.alunos));
    const csv = await req('GET', '/staff/api/academy/visitas-alunos.csv?dias=30');
    assert.equal(csv.st, 200);
    assert.ok(csv.ct.includes('text/csv'));
    assert.notEqual((await req('GET', '/staff/api/academy/visitas-alunos', { semUser: true })).st, 200);
    const exp = repo.Usuarios.exportar(ana.id);
    const txt = JSON.stringify(exp);
    assert.ok(txt.includes('tempo_nas_aulas'), 'export LGPD sem tempo_nas_aulas');
  });

  await t('logout apaga o vs_aluno', async () => {
    await req('POST', '/academy/api/logout', { jar: 'ana' });
    assert.ok(!jars.ana.vs_aluno, 'vs_aluno sobreviveu ao logout');
  });
}

module.exports = { rodar };
