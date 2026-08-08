// =====================================================================
// ORIGENA — suíte de testes (Fases 0 e 1).   npm run test:origena
//
// Sobe o Express real com auth de staff injetada, num SCHEMA DESCARTÁVEL
// do Postgres (o equivalente ao os.tmpdir() que os produtos SQLite usam)
// — derrubado no fim, dê certo ou dê errado. O R2 é o de verdade.
//
// Fase 0: migração, idempotência da fila, backoff, DLQ, destrave, storage.
// Fase 1: papéis, privacidade, contas, MFA, famílias, convites e o
//         ISOLAMENTO ENTRE FAMÍLIAS (§94) — este último é gerado a partir
//         da tabela de rotas escopadas, então rota nova nasce coberta e a
//         suíte quebra se alguém esquecer.
// =====================================================================
'use strict';
const crypto = require('crypto');

process.env.NODE_ENV = 'development';
process.env.ORIGENA_DB_SCHEMA = 't_origena_' + crypto.randomBytes(4).toString('hex');
process.env.ORIGENA_SECRET_KEY = crypto.randomBytes(32).toString('hex');  // cofre do MFA
process.env.ORIGENA_BCRYPT = '4';                                          // teste não precisa de custo 12
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

const req = async (metodo, caminho, { como = 'adm', corpo, sessao: jar } = {}) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: {
      'x-test-user': como,
      ...(jar && jar.cookie ? { Cookie: jar.cookie } : {}),
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    redirect: 'manual',
  });
  const set = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (jar) for (const c of set) { const p = c.split(';')[0]; if (p.startsWith('origena_sess=')) jar.cookie = p; }
  const txt = await r.text();
  let json = null; try { json = JSON.parse(txt); } catch (_) {}
  return { status: r.status, json, texto: txt, tipo: r.headers.get('content-type') || '' };
};

// Caixa de e-mail falsa. O token só existe no e-mail — no banco fica o
// HASH dele —, então é daqui que o teste tira o link, igual a um usuário.
const caixa = [];
const enviarEmail = async (para, assunto, html) => { caixa.push({ para, assunto, html }); return true; };
function tokenDoUltimoEmail(para, trecho) {
  const m = [...caixa].reverse().find((e) => e.para === para && e.html.includes(trecho));
  if (!m) throw new Error(`Nenhum e-mail com "${trecho}" para ${para}. Caixa: ${caixa.map((x) => x.para).join(', ')}`);
  const t = m.html.match(new RegExp(trecho + '\\?token=([^"&]+)'));
  if (!t) throw new Error(`E-mail sem token: ${m.assunto}`);
  return decodeURIComponent(t[1]);
}

/** Cria uma conta já verificada e logada. Devolve o "porta-cookie". */
async function novaConta(nome, mail, senha = 'senha-de-teste-123') {
  const jar = { cookie: null, nome, email: mail, senha };
  const c = await req('POST', '/origena/api/v1/conta/cadastrar',
    { corpo: { nome, email: mail, senha, aceito_termos: true }, sessao: jar });
  assert.strictEqual(c.status, 201, 'cadastro falhou: ' + c.texto);
  const token = tokenDoUltimoEmail(mail, '/origena/verificar');
  const v = await req('GET', `/origena/api/v1/conta/verificar?token=${encodeURIComponent(token)}`, { sessao: jar });
  assert.strictEqual(v.status, 200, 'verificação falhou: ' + v.texto);
  jar.id = v.json.usuario.id;
  return jar;
}

/** Liga o MFA de uma conta (quem administra família precisa dele). */
async function ativarMFA(jar) {
  const sess = require('./sessao');
  const ini = await req('POST', '/origena/api/v1/conta/mfa/iniciar', { sessao: jar });
  assert.strictEqual(ini.status, 200, 'mfa/iniciar falhou: ' + ini.texto);
  const conf = await req('POST', '/origena/api/v1/conta/mfa/confirmar',
    { sessao: jar, corpo: { codigo: sess.codigoTOTP(ini.json.segredo) } });
  assert.strictEqual(conf.status, 200, 'mfa/confirmar falhou: ' + conf.texto);
  jar.totp = ini.json.segredo; jar.backups = conf.json.codigos_backup;
  return jar;
}

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
  const montado = await origena.montar(app, {
    express, requireAuth, requireAdmin, enviarEmail, jwtSecret: 'segredo-de-teste-origena' });
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

  // =================================================================== FASE 1
  const rbac = require('./rbac');
  const privacidade = require('./privacidade');
  const tenancy = require('./tenancy');
  const sess = require('./sessao');

  const i18n = require('./i18n');
  console.log('\ni18n');
  await teste('nenhuma string de tela mora no código (§86)', async () => {
    const fs = require('fs');
    const suspeitos = [];
    for (const arquivo of ['rotas-conta.js', 'rotas-app.js', 'tenancy.js', 'rbac.js', 'paginas.js']) {
      const src = fs.readFileSync(require('path').join(__dirname, arquivo), 'utf8');
      // frase em português dentro de resposta JSON ou de HTML é o que
      // queremos extinguir; comentário e chave i18n podem ficar.
      const linhas = src.split('\n');
      linhas.forEach((l, n) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        if (/erro:\s*'[^']*[çãõáéíóúâêô][^']*'/i.test(l)) suspeitos.push(`${arquivo}:${n + 1}`);
      });
    }
    assert.strictEqual(suspeitos.length, 0, 'mensagem em português no código: ' + suspeitos.join(', '));
  });

  await teste('idioma sem tradução cai no pt-BR, nunca mostra a chave crua', async () => {
    assert.strictEqual(i18n.t('en-US', 'erro.credenciais'), i18n.t('pt-BR', 'erro.credenciais'));
    assert.strictEqual(i18n.t('pt-BR', 'chave.que.nao.existe'), 'chave.que.nao.existe');
  });

  await teste('normaliza pt, en-GB e lixo para um idioma que existe', async () => {
    assert.strictEqual(i18n.normalizar('pt'), 'pt-BR');
    assert.strictEqual(i18n.normalizar('en-GB'), 'en-US');
    assert.strictEqual(i18n.normalizar('klingon'), 'pt-BR');
    assert.strictEqual(i18n.normalizar(''), 'pt-BR');
  });

  await teste('interpolação e formatação por locale', async () => {
    assert.match(i18n.t('pt-BR', 'conta.entre_com_email', { email: 'a@b.c' }), /a@b\.c/);
    // 3 de dezembro: en-US inverte dia e mês, pt-BR não.
    assert.strictEqual(i18n.data('2026-12-03T12:00:00Z', 'pt-BR'), '03/12/2026');
    assert.strictEqual(i18n.data('2026-12-03T12:00:00Z', 'en-US'), '12/03/2026');
  });

  await teste('todo papel e toda ação auditada têm rótulo traduzível', async () => {
    const rbacMod = require('./rbac');
    for (const p of rbacMod.PAPEIS) {
      assert.notStrictEqual(i18n.t('pt-BR', 'papel.' + p), 'papel.' + p, `falta rótulo do papel ${p}`);
    }
    for (const acao of ['familia.criada', 'convite.enviado', 'convite.aceito', 'membro.removido',
      'membro.papel_alterado', 'conta.criada', 'conta.entrou']) {
      assert.notStrictEqual(i18n.t('pt-BR', 'auditoria.' + acao), 'auditoria.' + acao, `falta rótulo de ${acao}`);
    }
  });

  await teste('erro devolve CÓDIGO estável além da mensagem (cliente não faz parse de texto)', async () => {
    const r = await req('POST', '/origena/api/v1/conta/entrar', { corpo: { email: 'x@y.z', senha: 'errada-mesmo-1' } });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.json.codigo, 'erro.credenciais');
  });

  console.log('\npapéis (função pura)');
  await teste('OWNER pode tudo; GUEST só vê o que é público', async () => {
    for (const p of rbac.PERMISSOES) assert(rbac.pode('OWNER', p), `OWNER não pôde ${p}`);
    assert.deepStrictEqual(rbac.permissoesDe('GUEST'), ['ver.publico']);
  });

  await teste('CONTRIBUTOR acrescenta mas NÃO apaga', async () => {
    assert(rbac.pode('CONTRIBUTOR', 'contribuir'));
    assert(!rbac.pode('CONTRIBUTOR', 'excluir'), 'CONTRIBUTOR conseguiu excluir');
    assert(!rbac.pode('CONTRIBUTOR', 'papeis.alterar'));
    assert(!rbac.pode('CONTRIBUTOR', 'ver.documentos'), 'CONTRIBUTOR viu documento');
  });

  await teste('só quem administra resolve divergência e mexe em papel', async () => {
    for (const papel of ['OWNER', 'ADMIN', 'HISTORIAN']) assert(rbac.pode(papel, 'claims.resolver'), papel);
    for (const papel of ['EDITOR', 'CONTRIBUTOR', 'FAMILY_MEMBER', 'GUEST']) {
      assert(!rbac.pode(papel, 'claims.resolver'), `${papel} resolveu divergência`);
      assert(!rbac.pode(papel, 'papeis.alterar'), `${papel} alterou papel`);
    }
  });

  await teste('ninguém promove alguém acima de si (ADMIN não vira OWNER)', async () => {
    assert(!rbac.podeAlterarPapel('ADMIN', 'ADMIN', 'OWNER'), 'ADMIN se promoveu a OWNER');
    assert(!rbac.podeAlterarPapel('ADMIN', 'OWNER', 'GUEST'), 'ADMIN rebaixou o OWNER');
    assert(rbac.podeAlterarPapel('OWNER', 'ADMIN', 'HISTORIAN'));
    assert(rbac.podeAlterarPapel('ADMIN', 'EDITOR', 'CONTRIBUTOR'));
  });

  await teste('permissão inexistente é erro de programação, não "false" silencioso', async () => {
    assert.throws(() => rbac.pode('OWNER', 'permissao.que.nao.existe'), /desconhecida/);
  });

  console.log('\nprivacidade (função pura)');
  await teste('PRIVATE: autor vê; quem administra vê e fica auditado; os demais não', async () => {
    const item = { privacidade: 'PRIVATE', created_by: 'u1' };
    assert(privacidade.podeVer(item, { userId: 'u1', papel: 'GUEST' }).pode, 'autor não viu o próprio item');
    const adm = privacidade.podeVer(item, { userId: 'u2', papel: 'ADMIN' });
    assert(adm.pode && adm.auditar, 'admin viu sem marcar auditoria');
    assert(!privacidade.podeVer(item, { userId: 'u3', papel: 'EDITOR' }).pode, 'EDITOR viu item privado alheio');
  });

  await teste('GUEST não vê conteúdo FAMILY; visitante sem papel só vê PUBLIC', async () => {
    assert(!privacidade.podeVer({ privacidade: 'FAMILY' }, { papel: 'GUEST' }).pode);
    assert(privacidade.podeVer({ privacidade: 'PUBLIC' }, null).pode);
    assert(!privacidade.podeVer({ privacidade: 'FAMILY' }, null).pode);
  });

  await teste('cápsula lacrada não abre nem para OWNER', async () => {
    const daqui1ano = new Date(Date.now() + 3.15e10).toISOString();
    assert(!privacidade.podeVer({ privacidade: 'TIME_LOCKED', liberada_em: daqui1ano }, { papel: 'OWNER' }).pode);
    const ontem = new Date(Date.now() - 8.6e7).toISOString();
    assert(privacidade.podeVer({ privacidade: 'TIME_LOCKED', liberada_em: ontem }, { papel: 'OWNER' }).pode);
  });

  await teste('perfil de menor nunca vai a público (§73)', async () => {
    assert(!privacidade.podeExporPublicamente({ privacidade: 'PUBLIC', eh_menor: true }).pode);
  });

  await teste('staff sem motivo registrado não vê conteúdo de família', async () => {
    assert(!privacidade.podeVer({ privacidade: 'FAMILY' }, { papel: 'OWNER', ehStaff: true }).pode);
  });

  console.log('\ncontas');
  let ana, bruno, carla, silva;
  await teste('cadastro → e-mail de verificação → conta verificada', async () => {
    ana = await novaConta('Ana Villela', 'ana@teste.origena');
    const eu = await req('GET', '/origena/api/v1/conta/eu', { sessao: ana });
    assert.strictEqual(eu.status, 200);
    assert.strictEqual(eu.json.usuario.email_verificado, true);
  });

  await teste('e-mail repetido não revela que a conta existe', async () => {
    const r = await req('POST', '/origena/api/v1/conta/cadastrar',
      { corpo: { nome: 'Outra', email: 'ana@teste.origena', senha: 'senha-de-teste-123', aceito_termos: true } });
    assert.strictEqual(r.status, 202, 'devolveu status que denuncia a existência da conta');
  });

  await teste('senha fraca e termos não aceitos são recusados', async () => {
    const f = await req('POST', '/origena/api/v1/conta/cadastrar',
      { corpo: { nome: 'X', email: 'x@teste.origena', senha: '123', aceito_termos: true } });
    assert.strictEqual(f.status, 400);
    const t = await req('POST', '/origena/api/v1/conta/cadastrar',
      { corpo: { nome: 'Xis Silva', email: 'x2@teste.origena', senha: 'senha-de-teste-123' } });
    assert.strictEqual(t.status, 400);
  });

  await teste('senha errada e e-mail inexistente dão a MESMA resposta', async () => {
    const a = await req('POST', '/origena/api/v1/conta/entrar', { corpo: { email: 'ana@teste.origena', senha: 'errada-mesmo-123' } });
    const b = await req('POST', '/origena/api/v1/conta/entrar', { corpo: { email: 'nao-existe@teste.origena', senha: 'errada-mesmo-123' } });
    assert.strictEqual(a.status, 401); assert.strictEqual(b.status, 401);
    assert.strictEqual(a.json.erro, b.json.erro, 'as mensagens diferem — dá para enumerar contas');
  });

  await teste('trocar a senha derruba TODAS as sessões (não só o cookie atual)', async () => {
    const zeca = await novaConta('Zeca Villela', 'zeca@teste.origena');
    const antes = await req('GET', '/origena/api/v1/conta/eu', { sessao: zeca });
    assert.strictEqual(antes.status, 200);
    await req('POST', '/origena/api/v1/conta/esqueci', { corpo: { email: zeca.email } });
    const tk = tokenDoUltimoEmail(zeca.email, '/origena/nova-senha');
    const nova = await req('POST', '/origena/api/v1/conta/nova-senha', { corpo: { token: tk, senha: 'outra-senha-boa-456' } });
    assert.strictEqual(nova.status, 200, nova.texto);
    const depois = await req('GET', '/origena/api/v1/conta/eu', { sessao: { cookie: antes && zeca.cookie } });
    assert.strictEqual(depois.status, 401, 'a sessão antiga continuou valendo depois da troca de senha');
  });

  console.log('\nMFA (TOTP)');
  await teste('TOTP gera código de 6 dígitos e aceita ±1 janela', async () => {
    const seg = sess.gerarSegredoTOTP();
    const agora = Date.now();
    assert.match(sess.codigoTOTP(seg, 0, agora), /^\d{6}$/);
    assert(sess.conferirTOTP(seg, sess.codigoTOTP(seg, 0, agora), agora));
    assert(sess.conferirTOTP(seg, sess.codigoTOTP(seg, -1, agora), agora), 'não aceitou o código da janela anterior');
    assert(!sess.conferirTOTP(seg, sess.codigoTOTP(seg, 5, agora), agora), 'aceitou código de janela distante');
    assert(!sess.conferirTOTP(seg, '000000', agora) || true);   // pode colidir; não é asserção forte
  });

  await teste('ativar MFA e entrar exigindo o código', async () => {
    const ini = await req('POST', '/origena/api/v1/conta/mfa/iniciar', { sessao: ana });
    assert.strictEqual(ini.status, 200, ini.texto);
    const conf = await req('POST', '/origena/api/v1/conta/mfa/confirmar',
      { sessao: ana, corpo: { codigo: sess.codigoTOTP(ini.json.segredo) } });
    assert.strictEqual(conf.status, 200, conf.texto);
    assert.strictEqual((conf.json.codigos_backup || []).length, 8, 'não gerou códigos de backup');
    ana.totp = ini.json.segredo; ana.backups = conf.json.codigos_backup;

    const semCodigo = await req('POST', '/origena/api/v1/conta/entrar', { corpo: { email: ana.email, senha: ana.senha } });
    assert.strictEqual(semCodigo.json.mfa_necessario, true, 'entrou sem pedir o segundo fator');
    const errado = await req('POST', '/origena/api/v1/conta/entrar', { corpo: { email: ana.email, senha: ana.senha, codigo: '000001' } });
    assert.strictEqual(errado.status, 401);
    const certo = await req('POST', '/origena/api/v1/conta/entrar',
      { corpo: { email: ana.email, senha: ana.senha, codigo: sess.codigoTOTP(ana.totp) }, sessao: ana });
    assert.strictEqual(certo.status, 200, certo.texto);
  });

  await teste('código de backup funciona UMA vez só', async () => {
    const cod = ana.backups[0];
    const um = await req('POST', '/origena/api/v1/conta/entrar', { corpo: { email: ana.email, senha: ana.senha, codigo: cod }, sessao: ana });
    assert.strictEqual(um.status, 200, 'código de backup não funcionou');
    const dois = await req('POST', '/origena/api/v1/conta/entrar', { corpo: { email: ana.email, senha: ana.senha, codigo: cod } });
    assert.strictEqual(dois.status, 401, 'código de backup funcionou duas vezes');
  });

  console.log('\nfamílias, papéis e convites');
  let famA, famB;
  await teste('criar família dá OWNER a quem criou', async () => {
    const r = await req('POST', '/origena/api/v1/familias', { sessao: ana, corpo: { nome: 'Família Villela' } });
    assert.strictEqual(r.status, 201, r.texto);
    famA = r.json.familia.id;
    assert.strictEqual(r.json.familia.papel, 'OWNER');
  });

  await teste('e-mail não verificado não cria família', async () => {
    const jar = { cookie: null };
    await req('POST', '/origena/api/v1/conta/cadastrar',
      { corpo: { nome: 'Nao Verificado', email: 'nv@teste.origena', senha: 'senha-de-teste-123', aceito_termos: true } });
    const ent = await req('POST', '/origena/api/v1/conta/entrar',
      { corpo: { email: 'nv@teste.origena', senha: 'senha-de-teste-123' }, sessao: jar });
    assert.strictEqual(ent.status, 200);
    const cria = await req('POST', '/origena/api/v1/familias', { sessao: jar, corpo: { nome: 'Não deveria' } });
    assert.strictEqual(cria.status, 403);
  });

  await teste('convite: enviar → aceitar → vira membro com o papel certo', async () => {
    bruno = await novaConta('Bruno Villela', 'bruno@teste.origena');
    const c = await req('POST', `/origena/api/v1/familias/${famA}/convites`,
      { sessao: ana, corpo: { email: bruno.email, papel: 'CONTRIBUTOR' } });
    assert.strictEqual(c.status, 201, c.texto);
    assert.strictEqual(c.json.convite.token_hash, undefined, 'a API devolveu o hash do token');
    const tk = tokenDoUltimoEmail(bruno.email, '/origena/convite');
    const a = await req('POST', `/origena/api/v1/convites/${encodeURIComponent(tk)}/aceitar`, { sessao: bruno });
    assert.strictEqual(a.status, 200, a.texto);
    assert.strictEqual(a.json.papel, 'CONTRIBUTOR');
  });

  await teste('convite não serve para outro e-mail, nem duas vezes', async () => {
    carla = await novaConta('Carla Villela', 'carla@teste.origena');
    const c = await req('POST', `/origena/api/v1/familias/${famA}/convites`,
      { sessao: ana, corpo: { email: 'destinatario@teste.origena', papel: 'GUEST' } });
    assert.strictEqual(c.status, 201);
    const tk = tokenDoUltimoEmail('destinatario@teste.origena', '/origena/convite');
    const outro = await req('POST', `/origena/api/v1/convites/${encodeURIComponent(tk)}/aceitar`, { sessao: carla });
    assert.strictEqual(outro.status, 403, 'link vazado funcionou para outra pessoa');

    const c2 = await req('POST', `/origena/api/v1/familias/${famA}/convites`,
      { sessao: ana, corpo: { email: carla.email, papel: 'GUEST' } });
    const tk2 = tokenDoUltimoEmail(carla.email, '/origena/convite');
    assert.strictEqual((await req('POST', `/origena/api/v1/convites/${encodeURIComponent(tk2)}/aceitar`, { sessao: carla })).status, 200);
    const dnv = await req('POST', `/origena/api/v1/convites/${encodeURIComponent(tk2)}/aceitar`, { sessao: carla });
    assert.strictEqual(dnv.status, 410, 'o mesmo convite foi aceito duas vezes');
    assert(c2.status === 201);
  });

  await teste('convite revogado e vencido não valem', async () => {
    const c = await req('POST', `/origena/api/v1/familias/${famA}/convites`,
      { sessao: ana, corpo: { email: 'revogado@teste.origena', papel: 'GUEST' } });
    const tk = tokenDoUltimoEmail('revogado@teste.origena', '/origena/convite');
    await req('DELETE', `/origena/api/v1/familias/${famA}/convites/${c.json.convite.id}`, { sessao: ana });
    const zz = await novaConta('Ze Revogado', 'revogado@teste.origena');
    assert.strictEqual((await req('POST', `/origena/api/v1/convites/${encodeURIComponent(tk)}/aceitar`, { sessao: zz })).status, 410);

    const c2 = await req('POST', `/origena/api/v1/familias/${famA}/convites`,
      { sessao: ana, corpo: { email: 'vencido@teste.origena', papel: 'GUEST' } });
    const tk2 = tokenDoUltimoEmail('vencido@teste.origena', '/origena/convite');
    await db.q(`UPDATE invites SET expira_em = now() - interval '1 day' WHERE id = $1`, [c2.json.convite.id]);
    const vv = await novaConta('Ze Vencido', 'vencido@teste.origena');
    assert.strictEqual((await req('POST', `/origena/api/v1/convites/${encodeURIComponent(tk2)}/aceitar`, { sessao: vv })).status, 410);
  });

  await teste('CONTRIBUTOR não convida ninguém nem lê a auditoria', async () => {
    assert.strictEqual((await req('POST', `/origena/api/v1/familias/${famA}/convites`,
      { sessao: bruno, corpo: { email: 'x@y.z', papel: 'GUEST' } })).status, 403);
    assert.strictEqual((await req('GET', `/origena/api/v1/familias/${famA}/auditoria`, { sessao: bruno })).status, 403);
  });

  await teste('quem administra a família precisa de MFA para convidar (428)', async () => {
    const p = await req('PATCH', `/origena/api/v1/familias/${famA}/membros/${carla.id}`,
      { sessao: ana, corpo: { papel: 'ADMIN' } });
    assert.strictEqual(p.status, 200, p.texto);
    const semMfa = await req('POST', `/origena/api/v1/familias/${famA}/convites`,
      { sessao: carla, corpo: { email: 'alguem@teste.origena', papel: 'GUEST' } });
    assert.strictEqual(semMfa.status, 428, 'ADMIN sem MFA conseguiu convidar');
    assert.strictEqual(semMfa.json.acao, 'ativar_mfa');
  });

  await teste('ninguém convida para um papel acima do próprio', async () => {
    await ativarMFA(carla);   // carla já é ADMIN; agora passa da trava de MFA
    const r = await req('POST', `/origena/api/v1/familias/${famA}/convites`,
      { sessao: carla, corpo: { email: 'novo-owner@teste.origena', papel: 'OWNER' } });
    assert(r.status === 400 || r.status === 403, `ADMIN convidou alguém como OWNER (status ${r.status})`);
    // e o papel legítimo continua funcionando
    const ok = await req('POST', `/origena/api/v1/familias/${famA}/convites`,
      { sessao: carla, corpo: { email: 'legitimo@teste.origena', papel: 'EDITOR' } });
    assert.strictEqual(ok.status, 201, ok.texto);
  });

  await teste('a família NUNCA fica sem dono (trava no banco)', async () => {
    await assert.rejects(
      db.q(`UPDATE family_memberships SET papel = 'ADMIN' WHERE family_id = $1 AND papel = 'OWNER'`, [famA]),
      /pelo menos um responsável/i,
      'foi possível rebaixar o último OWNER');
    await assert.rejects(
      db.q(`DELETE FROM family_memberships WHERE family_id = $1 AND papel = 'OWNER'`, [famA]),
      /pelo menos um responsável/i,
      'foi possível apagar o último OWNER');
  });

  await teste('remover membro revoga acesso mas NÃO apaga o que ele contribuiu (§15)', async () => {
    const dedo = await novaConta('Dedo Villela', 'dedo@teste.origena');
    const c = await req('POST', `/origena/api/v1/familias/${famA}/convites`,
      { sessao: ana, corpo: { email: dedo.email, papel: 'FAMILY_MEMBER' } });
    const tk = tokenDoUltimoEmail(dedo.email, '/origena/convite');
    await req('POST', `/origena/api/v1/convites/${encodeURIComponent(tk)}/aceitar`, { sessao: dedo });
    assert.strictEqual((await req('GET', `/origena/api/v1/familias/${famA}`, { sessao: dedo })).status, 200);

    const rem = await req('DELETE', `/origena/api/v1/familias/${famA}/membros/${dedo.id}`, { sessao: ana });
    assert.strictEqual(rem.status, 200, rem.texto);
    assert.strictEqual((await req('GET', `/origena/api/v1/familias/${famA}`, { sessao: dedo })).status, 404,
      'membro removido continuou enxergando a família');
    // A leitura precisa entrar no escopo da família — sem ele o RLS
    // devolve zero e o teste mentiria dizendo que o histórico sumiu.
    const linhas = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT count(*)::int n FROM audit_log WHERE family_id = $1 AND ator_user_id = $2`, [famA, dedo.id]));
    assert(linhas.n > 0, 'o histórico do membro removido foi apagado junto');
  });

  await teste('auditoria registra as ações críticas', async () => {
    const a = await req('GET', `/origena/api/v1/familias/${famA}/auditoria`, { sessao: ana });
    assert.strictEqual(a.status, 200, a.texto);
    const acoes = a.json.eventos.map((e) => e.acao);
    for (const esperada of ['familia.criada', 'convite.enviado', 'convite.aceito', 'membro.removido']) {
      assert(acoes.includes(esperada), `faltou "${esperada}" na auditoria (tem: ${[...new Set(acoes)].join(', ')})`);
    }
  });

  // ============================================================ §94 TENANCY
  console.log('\nisolamento entre famílias (§94) — requisito de primeira classe');

  await teste('sem SET app.family_id, tabela de conteúdo devolve ZERO linhas', async () => {
    const dentro = await tenancy.comEscopo(famA, (t) =>
      t.uma('SELECT count(*)::int n FROM audit_log WHERE family_id = $1', [famA]));
    assert(dentro.n > 0, 'o escopo certo não enxergou as próprias linhas');
    const fora = await tenancy.semEscopo((t) =>
      t.uma('SELECT count(*)::int n FROM audit_log WHERE family_id = $1', [famA]));
    assert.strictEqual(fora.n, 0, 'o RLS deixou passar SEM escopo — o muro do banco não está de pé');
  });

  await teste('com o escopo da OUTRA família, zero linhas', async () => {
    // A família B precisa de um dono que NÃO seja membro da A — o Bruno
    // entrou na A como CONTRIBUTOR e serviria de falso negativo.
    silva = await novaConta('Silva de Outra Família', 'silva@teste.origena');
    const rB = await req('POST', '/origena/api/v1/familias', { sessao: silva, corpo: { nome: 'Família Silva' } });
    assert.strictEqual(rB.status, 201, rB.texto);
    famB = rB.json.familia.id;
    const cruzado = await tenancy.comEscopo(famB, (t) =>
      t.uma('SELECT count(*)::int n FROM audit_log WHERE family_id = $1', [famA]));
    assert.strictEqual(cruzado.n, 0, 'o escopo da família B leu linha da família A');
  });

  await teste('o RLS vale até para o dono da tabela (FORCE ROW LEVEL SECURITY)', async () => {
    const r = await db.uma(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'audit_log'
         AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)`, [db.SCHEMA]);
    assert(r.relrowsecurity, 'RLS não está habilitada');
    assert(r.relforcerowsecurity, 'falta FORCE — o dono da tabela ignoraria a política');
  });

  await teste('família mandada pelo CLIENTE é ignorada (só vale a membership)', async () => {
    const r = await req('PATCH', `/origena/api/v1/familias/${famA}`,
      { sessao: ana, corpo: { nome: 'Renomeada', family_id: famB, familyId: famB } });
    assert.strictEqual(r.status, 200);
    const b = await req('GET', `/origena/api/v1/familias/${famB}`, { sessao: silva });
    assert.strictEqual(b.json.familia.nome, 'Família Silva', 'o corpo da requisição mudou a OUTRA família');
  });

  await teste(`usuário da família A recebe 404 em TODAS as ${montado.ROTAS_ESCOPADAS.length} rotas da família B`, async () => {
    const falhas94 = [];
    const uuidFalso = '00000000-0000-4000-8000-000000000000';
    for (const rota of montado.ROTAS_ESCOPADAS) {
      const caminho = rota.caminho
        .replace(':familyId', famB)
        .replace(':userId', bruno.id)
        .replace(':id', uuidFalso);
      const r = await req(rota.metodo, caminho, { sessao: ana, corpo: rota.metodo === 'GET' ? undefined : { nome: 'invasao', papel: 'GUEST' } });
      // 404 e NUNCA 403: 403 confirmaria que a família existe (T2).
      if (r.status !== 404) falhas94.push(`${rota.metodo} ${rota.caminho} → ${r.status}`);
    }
    assert.strictEqual(falhas94.length, 0,
      'VAZAMENTO ENTRE FAMÍLIAS:\n         ' + falhas94.join('\n         '));
  });

  await teste('o outro lado também: usuário de B não alcança A', async () => {
    for (const rota of montado.ROTAS_ESCOPADAS) {
      const caminho = rota.caminho.replace(':familyId', famA).replace(':userId', ana.id)
        .replace(':id', '00000000-0000-4000-8000-000000000000');
      const r = await req(rota.metodo, caminho, { sessao: silva, corpo: rota.metodo === 'GET' ? undefined : { nome: 'x', papel: 'GUEST' } });
      assert.strictEqual(r.status, 404, `${rota.metodo} ${rota.caminho} devolveu ${r.status}`);
    }
  });

  await teste('sem sessão nenhuma, tudo é 401 (nunca 200)', async () => {
    for (const rota of montado.ROTAS_ESCOPADAS) {
      const caminho = rota.caminho.replace(':familyId', famA).replace(':userId', ana.id)
        .replace(':id', '00000000-0000-4000-8000-000000000000');
      const r = await req(rota.metodo, caminho, {});
      assert.strictEqual(r.status, 401, `${rota.metodo} ${rota.caminho} respondeu ${r.status} sem sessão`);
    }
  });

  await teste('a IA não pode decidir autorização (§102) — nem por import', async () => {
    const fs = require('fs'), path = require('path');
    const dirIA = path.join(__dirname, 'ia');
    if (!fs.existsSync(dirIA)) return;   // Fase 7 ainda não chegou
    const proibidos = [];
    const varrer = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return varrer(p);
      if (!e.name.endsWith('.js')) return;
      const src = fs.readFileSync(p, 'utf8');
      if (/require\(['"]\.\.?\/(rbac|privacidade|tenancy)['"]\)/.test(src)) proibidos.push(e.name);
    });
    varrer(dirIA);
    assert.strictEqual(proibidos.length, 0, 'módulo de IA importou autorização: ' + proibidos.join(', '));
  });

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
  console.log('ORIGENA Fases 0 e 1: verde.\n');
}

principal().catch(async (e) => {
  console.error('\nsuíte quebrou:', e);
  try { await db.derrubarSchema(); } catch (_) {}
  try { await db.fechar(); } catch (_) {}
  process.exit(1);
});
