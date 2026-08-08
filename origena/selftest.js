// =====================================================================
// ORIGENA — suíte de testes da Fase 0.   npm run test:origena
//
// Sobe o Express real com auth de staff injetada, num SCHEMA DESCARTÁVEL
// do Postgres (o equivalente ao os.tmpdir() que os produtos SQLite usam)
// — derrubado no fim, dê certo ou dê errado.
//
// O foco da Fase 0 é o encanamento que tudo o mais vai usar: migração,
// idempotência da fila, backoff, DLQ, destrave e storage de verdade.
// Testes de tenancy (§94), autorização e domínio entram na Fase 1.
// =====================================================================
'use strict';
const crypto = require('crypto');

process.env.NODE_ENV = 'development';
process.env.ORIGENA_DB_SCHEMA = 't_origena_' + crypto.randomBytes(4).toString('hex');
// Backoff LONGO de propósito: o teste precisa ver `rodar_apos` no futuro.
// Os testes que dependem de reprocessar encurtam à mão (UPDATE rodar_apos).
process.env.ORIGENA_FILA_BACKOFF_MS = '60000';

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./db');
const fila = require('./fila');
const storage = require('./storage');
const origena = require('./index');

// ---- staff falso (o Portal Staff é quem administra a plataforma) ----
const STAFF = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', ativo: true },
];
function requireAuth(req, res, next) {
  const u = STAFF.find((x) => x.id === (req.headers['x-test-user'] || 'adm'));
  if (!u) return res.status(401).json({ erro: 'sem sessão' });
  req.user = u; next();
}
const requireAdmin = (req, res, next) =>
  (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'admin' });

let servidor, base;
let passou = 0;
const falhas = [];

async function teste(nome, fn) {
  try { await fn(); passou++; console.log('  ok   ' + nome); }
  catch (e) { falhas.push({ nome, erro: e.message }); console.log('  FALHOU ' + nome + '\n         ' + e.message); }
}

const req = async (metodo, caminho, { como = 'adm', corpo } = {}) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'x-test-user': como, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const txt = await r.text();
  let json = null; try { json = JSON.parse(txt); } catch (_) {}
  return { status: r.status, json, texto: txt, tipo: r.headers.get('content-type') || '' };
};

// =====================================================================
async function principal() {
  if (!db.configurado()) {
    console.error('\nORIGENA_DATABASE_URL não definida — o selftest precisa de um Postgres.');
    console.error('Local: crie backend\\.env com ORIGENA_DATABASE_URL (a URL EXTERNA do Render).\n');
    process.exit(1);
  }
  console.log(`\nORIGENA — selftest (Fase 0)   schema descartável: ${db.SCHEMA}\n`);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  await origena.montar(app, { express, requireAuth, requireAdmin, jwtSecret: 'teste' });
  await new Promise((r) => { servidor = app.listen(0, r); });
  base = 'http://127.0.0.1:' + servidor.address().port;

  // ---------------------------------------------------------------- banco
  console.log('banco e migrações');
  await teste('migração criou as tabelas da fundação', async () => {
    const t = await db.todas(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1`, [db.SCHEMA]);
    const nomes = t.map((x) => x.table_name);
    for (const esperada of ['config', 'feature_flags', 'jobs', 'jobs_dlq', 'schema_migrations']) {
      assert(nomes.includes(esperada), `faltou a tabela ${esperada} (tem: ${nomes.join(', ')})`);
    }
  });

  await teste('migração é idempotente (rodar de novo não aplica nada)', async () => {
    const segunda = await db.migrar({ silencioso: true });
    assert.strictEqual(segunda.length, 0, 'aplicou migração de novo');
  });

  await teste('gen_random_uuid funciona apesar do search_path do schema de teste', async () => {
    const r = await db.uma('SELECT gen_random_uuid() AS u');
    assert.match(r.u, /^[0-9a-f-]{36}$/);
  });

  await teste('DROP SCHEMA só aceita schema de teste — nunca o de produção', async () => {
    for (const proibido of ['origena', 'public', 'pg_catalog', '', null, 'origena_prod']) {
      assert.strictEqual(db.podeDerrubar(proibido), false, `aceitou derrubar "${proibido}"`);
      await assert.rejects(db.derrubarSchema(proibido), /só aceita schema de teste/);
    }
    assert.strictEqual(db.podeDerrubar('t_abc123'), true, 'recusou um schema de teste legítimo');
  });

  await teste('transação faz rollback de verdade', async () => {
    await db.q(`INSERT INTO config (chave, valor) VALUES ('rollback_teste','antes')
                ON CONFLICT (chave) DO UPDATE SET valor='antes'`);
    await assert.rejects(db.transacao(async (t) => {
      await t.q(`UPDATE config SET valor='depois' WHERE chave='rollback_teste'`);
      throw new Error('boom');
    }));
    const r = await db.uma(`SELECT valor FROM config WHERE chave='rollback_teste'`);
    assert.strictEqual(r.valor, 'antes', 'o rollback não desfez a escrita');
  });

  // ---------------------------------------------------------------- fila
  console.log('\nfila durável');
  fila.limparHandlers();

  await teste('enfileira e pega o job', async () => {
    const j = await fila.enfileirar({ tipo: 'smoke', payload: { a: 1 } });
    assert(j && j.id, 'não devolveu o job');
    assert.strictEqual(j.status, 'na_fila');
    const pegos = await fila.pegar(10);
    assert(pegos.find((x) => x.id === j.id), 'não pegou o job enfileirado');
  });

  await teste('chave de idempotência barra o duplicado', async () => {
    const a = await fila.enfileirar({ tipo: 'smoke', chaveIdem: 'unica-1' });
    const b = await fila.enfileirar({ tipo: 'smoke', chaveIdem: 'unica-1' });
    assert(a && a.id, 'o primeiro deveria entrar');
    assert.strictEqual(b, null, 'o segundo entrou — a idempotência falhou');
  });

  await teste('job enfileirado DENTRO da transação some junto no rollback', async () => {
    const antes = await db.uma(`SELECT count(*)::int n FROM jobs WHERE tipo='transacional'`);
    await assert.rejects(db.transacao(async (t) => {
      await fila.enfileirar({ tipo: 'transacional' }, t.cliente);
      throw new Error('desiste');
    }));
    const depois = await db.uma(`SELECT count(*)::int n FROM jobs WHERE tipo='transacional'`);
    assert.strictEqual(depois.n, antes.n, 'o job sobreviveu ao rollback');
  });

  await teste('processarLote executa o handler e conclui', async () => {
    fila.limparHandlers();
    let chamou = 0;
    fila.registrar('eco', async (p) => { chamou++; return { viu: p.x }; });
    const j = await fila.enfileirar({ tipo: 'eco', payload: { x: 42 } });
    const r = await fila.processarLote(20);
    assert(r.ok >= 1, 'nenhum job concluído');
    assert.strictEqual(chamou, 1, 'handler não foi chamado exatamente uma vez');
    const feito = await db.uma('SELECT status, resultado FROM jobs WHERE id=$1', [j.id]);
    assert.strictEqual(feito.status, 'concluido');
    assert.strictEqual(feito.resultado.viu, 42, 'não guardou o resultado');
  });

  await teste('handler que lança reagenda com backoff, não perde o job', async () => {
    fila.limparHandlers();
    fila.registrar('quebra', async () => { throw new Error('falha proposital'); });
    const j = await fila.enfileirar({ tipo: 'quebra', maxTentativas: 3 });
    await fila.processarLote(20);
    const depois = await db.uma('SELECT status, tentativas, erro, rodar_apos > now() AS adiado FROM jobs WHERE id=$1', [j.id]);
    assert.strictEqual(depois.status, 'na_fila', 'não voltou para a fila');
    assert.strictEqual(depois.tentativas, 1);
    assert(depois.adiado, 'não aplicou backoff (rodar_apos deveria estar no futuro)');
    assert.match(depois.erro, /falha proposital/);
  });

  await teste('esgotadas as tentativas o job vai para a DLQ e some de jobs', async () => {
    fila.limparHandlers();
    fila.registrar('sempre-quebra', async () => { throw new Error('sem jeito'); });
    const j = await fila.enfileirar({ tipo: 'sempre-quebra', maxTentativas: 2 });
    for (let i = 0; i < 4; i++) {
      await db.q('UPDATE jobs SET rodar_apos = now() WHERE id=$1', [j.id]);   // encurta o backoff
      await fila.processarLote(20);
    }
    const emJobs = await db.uma('SELECT count(*)::int n FROM jobs WHERE id=$1', [j.id]);
    const naDlq = await db.uma('SELECT tentativas, erro FROM jobs_dlq WHERE id=$1', [j.id]);
    assert.strictEqual(emJobs.n, 0, 'continuou em jobs');
    assert(naDlq, 'não chegou na DLQ — o job SUMIU, que é o pior caso possível');
    assert.match(naDlq.erro, /sem jeito/);
  });

  await teste('tipo SEM handler falha alto e vai para a DLQ (não silencia)', async () => {
    fila.limparHandlers();
    const j = await fila.enfileirar({ tipo: 'ninguem-registrou', maxTentativas: 1 });
    const r = await fila.processarLote(20);
    assert.strictEqual(r.semHandler, 1, 'não contabilizou o job órfão');
    const naDlq = await db.uma('SELECT erro FROM jobs_dlq WHERE id=$1', [j.id]);
    assert(naDlq, 'job de tipo desconhecido não chegou na DLQ');
    assert.match(naDlq.erro, /Sem handler registrado/);
  });

  await teste('job preso por worker morto é destravado', async () => {
    const j = await fila.enfileirar({ tipo: 'smoke' });
    await db.q(`UPDATE jobs SET status='processando', travado_por='morto',
                travado_em = now() - interval '30 minutes' WHERE id=$1`, [j.id]);
    const n = await fila.destravarPresos(15);
    assert(n >= 1, 'não destravou');
    const depois = await db.uma('SELECT status FROM jobs WHERE id=$1', [j.id]);
    assert.strictEqual(depois.status, 'na_fila');
  });

  await teste('saúde da fila conta fila, DLQ e job mais velho', async () => {
    const s = await fila.saude();
    for (const campo of ['na_fila', 'processando', 'dlq', 'idade_mais_velho_seg']) {
      assert.strictEqual(typeof s[campo], 'number', `campo ${campo} não é número`);
    }
    assert(s.dlq >= 2, 'a DLQ deveria ter os jobs dos testes anteriores');
  });

  await teste('fila "cara" é separada da "rapida"', async () => {
    fila.limparHandlers();
    await db.q('DELETE FROM jobs');            // isola: sobras dos testes acima poluiriam a conta
    let executou = 0;
    fila.registrar('so-cara', async () => { executou++; });
    await fila.enfileirar({ tipo: 'so-cara', fila: 'cara' });
    const naRapida = await fila.processarLote(20, 'rapida');
    assert.strictEqual(naRapida.pegos, 0, 'o worker da fila rápida pegou job da fila cara');
    assert.strictEqual(executou, 0);
    const naCara = await fila.processarLote(20, 'cara');
    assert.strictEqual(naCara.ok, 1, 'o worker da fila cara não pegou o próprio job');
    assert.strictEqual(executou, 1);
  });

  // ---------------------------------------------------------------- HTTP
  console.log('\nrotas');
  await teste('GET /origena responde HTML 200 (é o que o analytics conta)', async () => {
    const r = await req('GET', '/origena');
    assert.strictEqual(r.status, 200);
    assert.match(r.tipo, /text\/html/);
    assert.match(r.texto, /Origena/);
  });

  await teste('a landing nasce com noindex (nada de conteúdo privado no Google)', async () => {
    const r = await req('GET', '/origena');
    assert.match(r.texto, /name="robots" content="noindex/);
  });

  await teste('GET /origena/health responde com o estado do banco', async () => {
    const r = await req('GET', '/origena/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.produto, 'origena');
    assert(r.json.banco && r.json.banco.ok, 'health não confirmou o banco');
  });

  await teste('saúde completa exige admin do staff', async () => {
    const anon = await req('GET', '/staff/api/origena/saude', { como: 'ninguem' });
    assert.strictEqual(anon.status, 401, 'sem sessão deveria dar 401');
    const membro = await req('GET', '/staff/api/origena/saude', { como: 'op' });
    assert.strictEqual(membro.status, 403, 'membro não-admin deveria dar 403');
  });

  // ---------------------------------------------------------------- storage
  console.log('\nstorage (R2)');
  if (!storage.configurado()) {
    console.log('  PULADO — ORIGENA_S3_* não definidas. O storage NÃO foi testado.');
    falhas.push({ nome: 'storage', erro: 'PULADO: ORIGENA_S3_* ausentes (não conte como verde)' });
  } else {
    await teste('E2E real: PUT → HEAD → GET assinado → DELETE', async () => {
      const s = await storage.saude();
      assert(s.ok, 'storage.saude() falhou: ' + (s.erro || 'sem detalhe'));
    });

    await teste('o bucket NÃO serve o objeto publicamente', async () => {
      const chave = `selftest/privado-${Date.now()}.txt`;
      await storage.enviar(chave, Buffer.from('segredo'), 'text/plain');
      const pub = await fetch('https://pub-a7ffd604a4594a63b996943696a079bd.r2.dev/' + chave);
      const status = pub.status;
      await storage.apagar(chave);
      assert.notStrictEqual(status, 200, `o objeto está PÚBLICO (status ${status}) — o r2.dev foi ligado`);
    });

    await teste('apagar ORIGINAL é recusado (ADR-0008: derivado regenera, original não)', async () => {
      await assert.rejects(
        storage.apagar('fam/abc/orig/def/hash.jpg'),
        /original é imutável/i,
        'a trava do original não funcionou');
    });

    await teste('as chaves seguem o layout por família', async () => {
      assert.strictEqual(storage.chaveOriginal('F1', 'M1', 'abc', 'jpg'), 'fam/F1/orig/M1/abc.jpg');
      assert.strictEqual(storage.chaveDerivado('F1', 'M1', 'D1', 'webp'), 'fam/F1/der/M1/D1.webp');
      assert.match(storage.chaveExport('F1', 'E1'), /^fam\/F1\/exp\/E1\.zip$/);
    });

    await teste('chave rejeita caractere de travessia de caminho', async () => {
      const k = storage.chaveOriginal('../../etc', 'M1', 'h', 'jpg');
      assert(!k.includes('..'), 'a chave aceitou "..": ' + k);
    });
  }

  // ---------------------------------------------------------------- fim
  await new Promise((r) => servidor.close(r));
  try { await db.derrubarSchema(); console.log(`\nschema de teste ${db.SCHEMA} derrubado.`); }
  catch (e) { console.error('\n⚠️  não consegui derrubar o schema de teste:', e.message); }
  await db.fechar();

  console.log(`\n${passou} teste(s) passaram, ${falhas.length} falha(s).`);
  if (falhas.length) {
    console.log('\nFALHAS:');
    falhas.forEach((f) => console.log(`  • ${f.nome}: ${f.erro}`));
    process.exit(1);
  }
  console.log('ORIGENA Fase 0: verde.\n');
}

principal().catch(async (e) => {
  console.error('\nsuíte quebrou:', e);
  try { await db.derrubarSchema(); } catch (_) {}
  try { await db.fechar(); } catch (_) {}
  process.exit(1);
});
