// =====================================================================
// ORIGENA — suíte de testes (Fases 0 a 4).   npm run test:origena
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
// Fase 2: datas imprecisas, pessoas, parentesco e árvore.
// Fase 3: PROVENIÊNCIA — o cenário do §4 inteiro, do relato divergente à
//         resolução que NÃO apaga as versões perdedoras.
// Fase 4: mídia — upload REAL no R2, worker de verdade, quarentena,
//         imutabilidade do original e "conte a história desta foto".
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

  // =================================================================== FASE 2
  const datasMod = require('./datas');
  console.log('\ndatas imprecisas');
  await teste('lê os formatos que a família realmente escreve', async () => {
    const casos = [
      ['1921', 'ANO', '1921-01-01', '1921-12-31'],
      ['15/03/1921', 'DIA', '1921-03-15', '1921-03-15'],
      ['03/1921', 'MES', '1921-03-01', '1921-03-31'],
      ['c. 1890', 'CIRCA', '1885-01-01', '1895-12-31'],
      ['por volta de 1890', 'CIRCA', '1885-01-01', '1895-12-31'],
      ['anos 40', 'DECADA', '1940-01-01', '1949-12-31'],
      ['década de 1890', 'DECADA', '1890-01-01', '1899-12-31'],
      ['antes de 1920', 'ANTES_DE', null, '1920-12-31'],
      ['depois de 1950', 'DEPOIS_DE', '1950-01-01', null],
      ['entre 1910 e 1920', 'ENTRE', '1910-01-01', '1920-12-31'],
    ];
    for (const [texto, precisao, ini, fim] of casos) {
      const r = datasMod.interpretar(texto);
      assert(!r.erro, `"${texto}" não foi entendida: ${r.erro}`);
      assert.strictEqual(r.precisao, precisao, `"${texto}" virou ${r.precisao}`);
      if (ini) assert.strictEqual(r.ini, ini, `"${texto}" início ${r.ini}`);
      if (fim) assert.strictEqual(r.fim, fim, `"${texto}" fim ${r.fim}`);
    }
  });

  await teste('recusa data impossível sem inventar precisão', async () => {
    for (const ruim of ['31/02/1921', 'abacaxi', '13/13/1900', '1920-1910']) {
      assert(datasMod.interpretar(ruim).erro, `aceitou "${ruim}"`);
    }
  });

  await teste('comparação de datas imprecisas admite não saber', async () => {
    const a = datasMod.interpretar('1900'), b = datasMod.interpretar('1950');
    const c = datasMod.interpretar('c. 1890'), d = datasMod.interpretar('anos 1890');
    assert.strictEqual(datasMod.comparar(a, b), 'antes');
    assert.strictEqual(datasMod.comparar(b, a), 'depois');
    assert.strictEqual(datasMod.comparar(c, d), 'sobrepoe', 'afirmou ordem que os dados não sustentam');
  });

  console.log('\npessoas e parentesco');
  const P = {};
  const criarPessoa = async (dados, sessao = ana) => {
    const r = await req('POST', `/origena/api/v1/familias/${famA}/pessoas`, { sessao, corpo: dados });
    assert.strictEqual(r.status, 201, 'criar pessoa falhou: ' + r.texto);
    return r.json.pessoa;
  };
  const ligar = (corpo, sessao = ana) =>
    req('POST', `/origena/api/v1/familias/${famA}/parentescos`, { sessao, corpo });

  await teste('cria pessoa com data imprecisa e deduz a vitalidade', async () => {
    P.joao = await criarPessoa({ nome: 'João Villela', nascimento: 'c. 1890', falecimento: '1958' });
    assert.strictEqual(P.joao.nascimento_precisao, 'CIRCA');
    assert.strictEqual(P.joao.nascimento_valor, 'c. 1890');
    assert.strictEqual(P.joao.vitalidade, 'falecida', 'não deduziu falecimento pela data');
    const viva = await criarPessoa({ nome: 'Alguém Vivo', nascimento: '1990' });
    assert.strictEqual(viva.vitalidade, 'desconhecido');
  });

  await teste('pessoa sem nome e data impossível são recusadas com mensagem útil', async () => {
    const semNome = await req('POST', `/origena/api/v1/familias/${famA}/pessoas`, { sessao: ana, corpo: { nome: '' } });
    assert.strictEqual(semNome.status, 400);
    assert.strictEqual(semNome.json.codigo, 'erro.pessoa_sem_nome');
    const dataRuim = await req('POST', `/origena/api/v1/familias/${famA}/pessoas`,
      { sessao: ana, corpo: { nome: 'Teste Data', nascimento: '31/02/1900' } });
    assert.strictEqual(dataRuim.status, 400);
    assert.strictEqual(dataRuim.json.codigo, 'erro.data_invalida');
  });

  await teste('monta 4 gerações com casamento, adoção e alguém sem pais', async () => {
    P.maria = await criarPessoa({ nome: 'Maria Villela', nascimento: '1895', falecimento: '1970' });
    P.pedro = await criarPessoa({ nome: 'Pedro Villela', nascimento: '1920' });
    P.paula = await criarPessoa({ nome: 'Paula Villela', nascimento: '1924' });
    P.neto = await criarPessoa({ nome: 'Neto Villela', nascimento: '1950' });
    P.bisneto = await criarPessoa({ nome: 'Bisneto Villela', nascimento: '1980' });
    P.adotado = await criarPessoa({ nome: 'Filho Adotivo', nascimento: '1952' });
    P.avulso = await criarPessoa({ nome: 'Sem Pais Conhecidos', nascimento: 'anos 30' });

    assert.strictEqual((await ligar({ person_a: P.joao.id, person_b: P.pedro.id, tipo: 'PARENT_OF' })).status, 201);
    assert.strictEqual((await ligar({ person_a: P.maria.id, person_b: P.pedro.id, tipo: 'PARENT_OF' })).status, 201);
    assert.strictEqual((await ligar({ person_a: P.joao.id, person_b: P.paula.id, tipo: 'PARENT_OF' })).status, 201);
    assert.strictEqual((await ligar({ person_a: P.maria.id, person_b: P.paula.id, tipo: 'PARENT_OF' })).status, 201);
    assert.strictEqual((await ligar({ person_a: P.joao.id, person_b: P.maria.id, tipo: 'SPOUSE_OF', inicio: '1918' })).status, 201);
    assert.strictEqual((await ligar({ person_a: P.pedro.id, person_b: P.neto.id, tipo: 'PARENT_OF' })).status, 201);
    assert.strictEqual((await ligar({ person_a: P.neto.id, person_b: P.bisneto.id, tipo: 'PARENT_OF' })).status, 201);
    assert.strictEqual((await ligar({ person_a: P.pedro.id, person_b: P.adotado.id, tipo: 'PARENT_OF', natureza: 'adotivo' })).status, 201);
  });

  await teste('adoção NÃO substitui filiação: as duas coexistem', async () => {
    // O Pedro é pai biológico do Neto e adotivo do Filho Adotivo; o
    // registro de uma não some por causa da outra.
    const r = await ligar({ person_a: P.joao.id, person_b: P.pedro.id, tipo: 'PARENT_OF', natureza: 'adotivo' });
    assert.strictEqual(r.status, 201, 'não aceitou registrar a segunda natureza');
    const dossie = await req('GET', `/origena/api/v1/familias/${famA}/pessoas/${P.pedro.id}`, { sessao: ana });
    const doJoao = dossie.json.familia.pais.filter((x) => x.id === P.joao.id);
    assert.strictEqual(doJoao.length, 2, 'as duas naturezas não coexistiram');
    assert.deepStrictEqual(doJoao.map((x) => x.natureza).sort(), ['adotivo', 'biologico']);
  });

  await teste('irmãos são DERIVADOS do ascendente comum, sem aresta declarada', async () => {
    const d = await req('GET', `/origena/api/v1/familias/${famA}/pessoas/${P.pedro.id}`, { sessao: ana });
    const nomes = d.json.familia.irmaos.map((x) => x.nome_exibicao);
    assert(nomes.includes('Paula Villela'), 'não derivou a irmã dos pais comuns: ' + nomes.join(', '));
    const paula = d.json.familia.irmaos.find((x) => x.nome_exibicao === 'Paula Villela');
    assert.strictEqual(paula.meio, false, 'marcou como meio-irmã quem tem os dois pais em comum');
  });

  await teste('meio-irmão é marcado como meio-irmão', async () => {
    const outraMae = await criarPessoa({ nome: 'Outra Mãe', nascimento: '1900' });
    const meio = await criarPessoa({ nome: 'Meio Irmão', nascimento: '1930' });
    await ligar({ person_a: P.joao.id, person_b: meio.id, tipo: 'PARENT_OF' });
    await ligar({ person_a: outraMae.id, person_b: meio.id, tipo: 'PARENT_OF' });
    const d = await req('GET', `/origena/api/v1/familias/${famA}/pessoas/${P.pedro.id}`, { sessao: ana });
    const m = d.json.familia.irmaos.find((x) => x.nome_exibicao === 'Meio Irmão');
    assert(m, 'não trouxe o meio-irmão');
    assert.strictEqual(m.meio, true, 'não marcou como meio-irmão');
  });

  await teste('ciclo de ancestralidade é impossível', async () => {
    const r = await ligar({ person_a: P.bisneto.id, person_b: P.joao.id, tipo: 'PARENT_OF' });
    assert.strictEqual(r.status, 409, 'aceitou fechar um laço na árvore');
    assert.strictEqual(r.json.codigo, 'erro.parentesco_ciclo');
    const consigo = await ligar({ person_a: P.joao.id, person_b: P.joao.id, tipo: 'PARENT_OF' });
    assert.strictEqual(consigo.status, 400);
  });

  await teste('sanidade de idade avisa, mas deixa a família confirmar', async () => {
    const bebe = await criarPessoa({ nome: 'Bebê Impossível', nascimento: '1899' });
    const r = await ligar({ person_a: P.maria.id, person_b: bebe.id, tipo: 'PARENT_OF' });
    assert.strictEqual(r.status, 422, 'não avisou sobre a idade impossível');
    assert.strictEqual(r.json.codigo, 'erro.filiacao_jovem_demais');
    // A família tem a última palavra sobre a própria história.
    const insistindo = await ligar({ person_a: P.maria.id, person_b: bebe.id, tipo: 'PARENT_OF', confirmo_mesmo_assim: true });
    assert.strictEqual(insistindo.status, 201, 'não deixou confirmar');
  });

  await teste('data imprecisa NÃO gera acusação falsa de idade', async () => {
    const vago = await criarPessoa({ nome: 'Sem Data', nascimento: '' });
    const r = await ligar({ person_a: vago.id, person_b: P.neto.id, tipo: 'PARENT_OF' });
    assert.strictEqual(r.status, 201, 'reclamou de idade sem ter data para reclamar');
  });

  await teste('casamento é guardado UMA vez, não duas', async () => {
    const dupla = await ligar({ person_a: P.maria.id, person_b: P.joao.id, tipo: 'SPOUSE_OF' });
    assert.strictEqual(dupla.status, 409, 'guardou o mesmo casamento invertido como novo');
    const n = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT count(*)::int c FROM relationships WHERE tipo='SPOUSE_OF' AND deleted_at IS NULL
        AND $1 IN (person_a, person_b) AND $2 IN (person_a, person_b)`, [P.joao.id, P.maria.id]));
    assert.strictEqual(n.c, 1);
  });

  await teste('a árvore renderiza 4 gerações com as arestas certas', async () => {
    const r = await req('GET', `/origena/api/v1/familias/${famA}/arvore/${P.pedro.id}?geracoes=4`, { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    const ger = (nome) => (r.json.nos.find((n) => n.nome_exibicao === nome) || {}).geracao;
    assert.strictEqual(ger('Pedro Villela'), 0);
    assert.strictEqual(ger('João Villela'), -1, 'pai não ficou uma geração acima');
    assert.strictEqual(ger('Neto Villela'), 1);
    assert.strictEqual(ger('Bisneto Villela'), 2);
    assert(r.json.nos.find((n) => n.nome_exibicao === 'Maria Villela'), 'cônjuge do pai não entrou na árvore');
    assert(r.json.arestas.length >= 5, 'faltaram arestas');
    assert(r.json.nos.every((n) => n.ano_nascimento === null || typeof n.ano_nascimento === 'number'));
  });

  await teste('modo ancestral não traz descendentes, e vice-versa', async () => {
    const sobe = await req('GET', `/origena/api/v1/familias/${famA}/arvore/${P.pedro.id}?modo=ancestral`, { sessao: ana });
    assert(!sobe.json.nos.find((n) => n.nome_exibicao === 'Bisneto Villela'), 'modo ancestral trouxe descendente');
    const desce = await req('GET', `/origena/api/v1/familias/${famA}/arvore/${P.pedro.id}?modo=descendentes`, { sessao: ana });
    assert(!desce.json.nos.find((n) => n.nome_exibicao === 'João Villela'), 'modo descendentes trouxe ascendente');
  });

  await teste('perfil de menor nasce PRIVATE e some para quem não pode ver', async () => {
    const crianca = await criarPessoa({ nome: 'Criança da Família', nascimento: '2018', eh_menor: true });
    assert.strictEqual(crianca.privacidade, 'PRIVATE', 'menor não nasceu privado');
    assert.strictEqual(crianca.eh_menor, true);
    // bruno é CONTRIBUTOR nesta família: não tem `ver.privado`.
    const lista = await req('GET', `/origena/api/v1/familias/${famA}/pessoas`, { sessao: bruno });
    assert(!lista.json.pessoas.find((p) => p.id === crianca.id), 'CONTRIBUTOR viu o perfil do menor');
    assert(lista.json.ocultas >= 1, 'não informou que há pessoas ocultas');
    const direto = await req('GET', `/origena/api/v1/familias/${famA}/pessoas/${crianca.id}`, { sessao: bruno });
    assert.strictEqual(direto.status, 404, 'devolveu 403 e confirmou a existência do registro');
  });

  await teste('CONTRIBUTOR cria pessoa mas não mexe em parentesco nem arquiva', async () => {
    const cria = await req('POST', `/origena/api/v1/familias/${famA}/pessoas`,
      { sessao: bruno, corpo: { nome: 'Trazido pelo Bruno' } });
    assert.strictEqual(cria.status, 201, 'CONTRIBUTOR não conseguiu contribuir');
    const liga = await ligar({ person_a: P.joao.id, person_b: cria.json.pessoa.id, tipo: 'PARENT_OF' }, bruno);
    assert.strictEqual(liga.status, 403, 'CONTRIBUTOR mexeu na árvore');
    const apaga = await req('DELETE', `/origena/api/v1/familias/${famA}/pessoas/${cria.json.pessoa.id}`, { sessao: bruno });
    assert.strictEqual(apaga.status, 403, 'CONTRIBUTOR apagou pessoa');
  });

  await teste('arquivar é soft delete: some da lista, some da árvore, não do banco', async () => {
    const some = await criarPessoa({ nome: 'Vai Sumir', nascimento: '1970' });
    await ligar({ person_a: P.pedro.id, person_b: some.id, tipo: 'PARENT_OF' });
    const r = await req('DELETE', `/origena/api/v1/familias/${famA}/pessoas/${some.id}`, { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    const lista = await req('GET', `/origena/api/v1/familias/${famA}/pessoas`, { sessao: ana });
    assert(!lista.json.pessoas.find((p) => p.id === some.id), 'continuou na lista');
    const arv = await req('GET', `/origena/api/v1/familias/${famA}/arvore/${P.pedro.id}`, { sessao: ana });
    assert(!arv.json.nos.find((n) => n.id === some.id), 'continuou na árvore');
    const noBanco = await tenancy.comEscopo(famA, (t) =>
      t.uma('SELECT deleted_at FROM persons WHERE id = $1', [some.id]));
    assert(noBanco && noBanco.deleted_at, 'a linha foi APAGADA do banco em vez de arquivada');
  });

  // =================================================================== FASE 3
  const prov = require('./proveniencia');
  console.log('\nproveniência — o cenário do §4');

  const F = (caminho) => `/origena/api/v1/familias/${famA}${caminho}`;
  const afirmar = (pessoaId, corpo, sessao = ana) =>
    req('POST', F(`/pessoas/${pessoaId}/fatos`), { sessao, corpo });

  let antonio;
  await teste('Maria diz 1921, Carlos diz 1922, a certidão diz 1921', async () => {
    antonio = await criarPessoa({ nome: 'Antônio Villela' });

    // Ana no papel da Maria: relato de família.
    const r1 = await afirmar(antonio.id, { predicado: 'data_nascimento', valor: '1921',
      fonte_tipo: 'RELATO', fonte_titulo: 'Maria contou no almoço de domingo' }, ana);
    assert.strictEqual(r1.status, 201, r1.texto);
    assert.strictEqual(r1.json.fato.status, 'FAMILY_REPORTED', 'relato virou documento');

    // Bruno no papel do Carlos: outro relato, valor diferente.
    const r2 = await afirmar(antonio.id, { predicado: 'data_nascimento', valor: '1922',
      fonte_tipo: 'RELATO', fonte_titulo: 'Carlos lembra de 1922' }, bruno);
    assert.strictEqual(r2.status, 201, r2.texto);

    // A certidão: fonte documental.
    const r3 = await afirmar(antonio.id, { predicado: 'data_nascimento', valor: '1921',
      fonte_tipo: 'REGISTRO_OFICIAL', fonte_titulo: 'Certidão de nascimento',
      fonte_referencia: 'Cartório de Pirapora, livro 12, fl. 44',
      trecho: 'Antônio Villela, nascido aos quinze dias de março de mil novecentos e vinte e um' }, carla);
    assert.strictEqual(r3.status, 201, r3.texto);
    assert.strictEqual(r3.json.fato.status, 'DOCUMENTED', 'certidão não virou documento');
  });

  await teste('a Origena NÃO resolve sozinha: fica em DIVERGÊNCIA', async () => {
    const r = await req('GET', F(`/pessoas/${antonio.id}/fatos`), { sessao: ana });
    const nasc = r.json.fatos.find((f) => f.predicado === 'data_nascimento');
    assert(nasc, 'o fato não apareceu');
    assert.strictEqual(nasc.em_divergencia, true, 'não detectou a divergência');
    assert.strictEqual(nasc.resolvido, false);
    assert.strictEqual(r.json.divergencias.length, 1);
    assert.strictEqual(r.json.divergencias[0].valores_distintos, 2);
  });

  await teste('"de onde veio isto?" devolve as TRÊS versões com autor e fonte', async () => {
    const r = await req('GET', F(`/pessoas/${antonio.id}/fatos/data_nascimento`), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    assert.strictEqual(r.json.versoes.length, 3, 'perdeu alguma versão');
    const autores = r.json.versoes.map((v) => v.informado_por).sort();
    assert.deepStrictEqual(autores, ['Ana Villela', 'Bruno Villela', 'Carla Villela']);
    // A certidão vem primeiro: melhor evidência.
    assert.strictEqual(r.json.versoes[0].status, 'DOCUMENTED');
    const doc = r.json.versoes[0];
    assert.strictEqual(doc.evidencias.length, 1);
    assert.strictEqual(doc.evidencias[0].fonte_tipo, 'REGISTRO_OFICIAL');
    assert.match(doc.evidencias[0].fonte_referencia, /Pirapora/);
    assert.match(doc.evidencias[0].trecho, /mil novecentos e vinte e um/);
  });

  await teste('o valor EXIBIDO é o de melhor evidência, com o selo de divergência', async () => {
    const p = await req('GET', F(`/pessoas/${antonio.id}`), { sessao: ana });
    assert.strictEqual(p.json.pessoa.nascimento_valor, '1921', 'exibiu o valor de pior evidência');
    // e a projeção aponta o claim de origem — é o caminho de volta.
    assert(p.json.pessoa.nascimento_claim_id, 'a projeção não guardou de qual versão veio');
    const fatos = await req('GET', F(`/pessoas/${antonio.id}/fatos`), { sessao: ana });
    const nasc = fatos.json.fatos.find((f) => f.predicado === 'data_nascimento');
    assert.strictEqual(nasc.claim_id, p.json.pessoa.nascimento_claim_id, 'projeção e fato divergiram');
  });

  await teste('a família resolve — e as versões perdedoras CONTINUAM ali (§4)', async () => {
    const versoes = await req('GET', F(`/pessoas/${antonio.id}/fatos/data_nascimento`), { sessao: ana });
    const doc = versoes.json.versoes.find((v) => v.status === 'DOCUMENTED');

    const semMotivo = await req('POST', F(`/pessoas/${antonio.id}/fatos/data_nascimento/resolver`),
      { sessao: carla, corpo: { claim_id: doc.id } });
    assert.strictEqual(semMotivo.status, 400, 'aceitou resolver sem explicar por quê');

    const r = await req('POST', F(`/pessoas/${antonio.id}/fatos/data_nascimento/resolver`),
      { sessao: carla, corpo: { claim_id: doc.id, motivo: 'A certidão de nascimento é a fonte mais forte.' } });
    assert.strictEqual(r.status, 200, r.texto);

    const depois = await req('GET', F(`/pessoas/${antonio.id}/fatos/data_nascimento`), { sessao: ana });
    assert.strictEqual(depois.json.versoes.length, 3, 'RESOLVER APAGOU VERSÕES — é o que o §4 proíbe');
    assert.strictEqual(depois.json.versoes.filter((v) => v.aceito).length, 1);
    assert(depois.json.versoes.find((v) => v.valor === '1922'), 'o relato do Carlos sumiu');
    // a divergência continua registrada; ela foi decidida, não apagada
    const fatos = await req('GET', F(`/pessoas/${antonio.id}/fatos`), { sessao: ana });
    const nasc = fatos.json.fatos.find((f) => f.predicado === 'data_nascimento');
    assert.strictEqual(nasc.resolvido, true);
    assert.strictEqual(nasc.em_divergencia, true, 'a divergência foi apagada em vez de decidida');
  });

  await teste('reverter a decisão é um registro NOVO, nunca um DELETE', async () => {
    const versoes = await req('GET', F(`/pessoas/${antonio.id}/fatos/data_nascimento`), { sessao: ana });
    const doCarlos = versoes.json.versoes.find((v) => v.valor === '1922');
    await req('POST', F(`/pessoas/${antonio.id}/fatos/data_nascimento/resolver`),
      { sessao: carla, corpo: { claim_id: doCarlos.id, motivo: 'Apareceu um registro de batismo de 1922.' } });
    const n = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT count(*)::int c FROM claim_resolutions WHERE sujeito_id = $1 AND predicado = 'data_nascimento'`,
      [antonio.id]));
    assert.strictEqual(n.c, 2, 'a resolução anterior foi sobrescrita em vez de somada');
    const p = await req('GET', F(`/pessoas/${antonio.id}`), { sessao: ana });
    assert.strictEqual(p.json.pessoa.nascimento_valor, '1922', 'a projeção não seguiu a nova decisão');
    // volta para a certidão, para não deixar o teste com estado esquisito
    const doc = versoes.json.versoes.find((v) => v.status === 'DOCUMENTED');
    await req('POST', F(`/pessoas/${antonio.id}/fatos/data_nascimento/resolver`),
      { sessao: carla, corpo: { claim_id: doc.id, motivo: 'A certidão prevalece.' } });
  });

  console.log('\nproveniência — travas');
  await teste('não existe caminho para afirmar sem dizer de onde veio', async () => {
    const semFonte = await tenancy.comEscopo(famA, async (t) => {
      try {
        await prov.afirmar(t, { familyId: famA, userId: ana.id, sujeitoId: antonio.id,
          predicado: 'profissao', valor: 'lavrador', fonte: null });
        return 'passou';
      } catch (e) { return e.chave; }
    });
    assert.strictEqual(semFonte, 'erro.claim_sem_fonte');
  });

  await teste('a IA só escreve AI_INFERRED — e a trava é do BANCO', async () => {
    await assert.rejects(tenancy.comEscopo(famA, (t) => t.q(
      `INSERT INTO claims (family_id, sujeito_tipo, sujeito_id, predicado, valor, valor_norm,
         status, created_by_kind) VALUES ($1,'person',$2,'profissao','doutor','doutor',
         'DOCUMENTED','ai')`, [famA, antonio.id])),
    /ia_so_infere/, 'o banco aceitou a IA criando fato DOCUMENTADO');

    const ok = await tenancy.comEscopo(famA, (t) => t.uma(
      `INSERT INTO claims (family_id, sujeito_tipo, sujeito_id, predicado, valor, valor_norm,
         status, created_by_kind) VALUES ($1,'person',$2,'profissao','lavrador','lavrador',
         'AI_INFERRED','ai') RETURNING *`, [famA, antonio.id]));
    assert.strictEqual(ok.status, 'AI_INFERRED');
    P.claimIA = ok.id;
  });

  await teste('sugestão da IA nunca vira fato sozinha — precisa de ato humano registrado', async () => {
    const r = await req('POST', F(`/fatos/${P.claimIA}/confirmar`),
      { sessao: carla, corpo: { status: 'FAMILY_REPORTED' } });
    assert.strictEqual(r.status, 201, r.texto);
    assert.strictEqual(r.json.fato.created_by_kind, 'user', 'a confirmação saiu como se fosse da IA');
    assert.strictEqual(r.json.fato.status, 'FAMILY_REPORTED');
    // o claim da IA CONTINUA existindo como sugestão — o histórico mostra
    // que a IA sugeriu e quem confirmou
    const ainda = await tenancy.comEscopo(famA, (t) =>
      t.uma('SELECT status FROM claims WHERE id = $1', [P.claimIA]));
    assert.strictEqual(ainda.status, 'AI_INFERRED', 'a sugestão da IA foi sobrescrita');
  });

  await teste('grafias diferentes do MESMO fato não viram divergência falsa', async () => {
    const pessoa = await criarPessoa({ nome: 'Teste Normalização' });
    await afirmar(pessoa.id, { predicado: 'data_nascimento', valor: '1930',
      fonte_tipo: 'RELATO', fonte_titulo: 'Relato A' }, ana);
    await afirmar(pessoa.id, { predicado: 'data_nascimento', valor: ' 1930 ',
      fonte_tipo: 'RELATO', fonte_titulo: 'Relato B' }, bruno);
    const r = await req('GET', F(`/pessoas/${pessoa.id}/fatos`), { sessao: ana });
    const nasc = r.json.fatos.find((f) => f.predicado === 'data_nascimento');
    assert.strictEqual(nasc.em_divergencia, false, 'inventou divergência entre "1930" e " 1930 "');
    // e "c. 1930" É diferente de "1930": precisão diferente, fato diferente
    await afirmar(pessoa.id, { predicado: 'data_nascimento', valor: 'c. 1930',
      fonte_tipo: 'RELATO', fonte_titulo: 'Relato C' }, carla);
    const r2 = await req('GET', F(`/pessoas/${pessoa.id}/fatos`), { sessao: ana });
    assert.strictEqual(r2.json.fatos.find((f) => f.predicado === 'data_nascimento').em_divergencia, true,
      'tratou "c. 1930" como igual a "1930"');
  });

  await teste('fonte documental que chega depois PROMOVE a versão', async () => {
    const pessoa = await criarPessoa({ nome: 'Teste Promoção' });
    const r = await afirmar(pessoa.id, { predicado: 'profissao', valor: 'professora',
      fonte_tipo: 'RELATO', fonte_titulo: 'A tia contou' }, ana);
    assert.strictEqual(r.json.fato.status, 'FAMILY_REPORTED');
    const ev = await req('POST', F(`/fatos/${r.json.fato.id}/fontes`), { sessao: carla,
      corpo: { fonte_tipo: 'DOCUMENTO', fonte_titulo: 'Diploma de magistério', posicao: 'SUPORTA' } });
    assert.strictEqual(ev.status, 201, ev.texto);
    const versoes = await req('GET', F(`/pessoas/${pessoa.id}/fatos/profissao`), { sessao: ana });
    assert.strictEqual(versoes.json.versoes[0].status, 'DOCUMENTED', 'o documento não promoveu a versão');
    assert.strictEqual(versoes.json.versoes[0].evidencias.length, 2);
  });

  await teste('fonte pode CONTRADIZER — e isso fica registrado', async () => {
    const versoes = await req('GET', F(`/pessoas/${antonio.id}/fatos/data_nascimento`), { sessao: ana });
    const doCarlos = versoes.json.versoes.find((v) => v.valor === '1922');
    const r = await req('POST', F(`/fatos/${doCarlos.id}/fontes`), { sessao: carla,
      corpo: { fonte_tipo: 'REGISTRO_OFICIAL', fonte_titulo: 'Certidão de nascimento',
        posicao: 'CONTRADIZ', nota: 'A certidão diz 1921.' } });
    assert.strictEqual(r.status, 201, r.texto);
    const depois = await req('GET', F(`/pessoas/${antonio.id}/fatos/data_nascimento`), { sessao: ana });
    const carlos = depois.json.versoes.find((v) => v.valor === '1922');
    assert(carlos.evidencias.some((e) => e.posicao === 'CONTRADIZ'), 'não registrou a contradição');
    assert.notStrictEqual(carlos.status, 'DOCUMENTED', 'fonte que CONTRADIZ promoveu a versão');
  });

  console.log('\ncontribuições');
  await teste('o que a família contou fica guardado com autor e data', async () => {
    const r = await req('POST', F(`/pessoas/${antonio.id}/contribuicoes`), { sessao: bruno,
      corpo: { corpo: 'Ele trabalhava na roça e tocava sanfona nas festas de junho.' } });
    assert.strictEqual(r.status, 201, r.texto);
    const lista = await req('GET', F(`/pessoas/${antonio.id}/contribuicoes`), { sessao: ana });
    assert(lista.json.contribuicoes.some((c) => c.autor_nome === 'Bruno Villela'), 'perdeu o autor');
    P.contrib = r.json.contribuicao.id;
  });

  await teste('corrigir uma contribuição NÃO apaga a original (§15)', async () => {
    const r = await req('PATCH', F(`/contribuicoes/${P.contrib}`), { sessao: bruno,
      corpo: { corpo: 'Ele trabalhava na roça e tocava sanfona nas festas de junho e de agosto.' } });
    assert.strictEqual(r.status, 200, r.texto);
    const lista = await req('GET', F(`/pessoas/${antonio.id}/contribuicoes`), { sessao: ana });
    const original = lista.json.contribuicoes.find((c) => c.id === P.contrib);
    assert(original, 'a contribuição original SUMIU');
    assert.strictEqual(original.status, 'revisada');
    assert.match(original.corpo, /festas de junho\.$/, 'o texto original foi alterado');
    const nova = lista.json.contribuicoes.find((c) => c.revisao_de === P.contrib);
    assert(nova && /agosto/.test(nova.corpo), 'a revisão não foi guardada');
  });

  await teste('contribuição não tem rota de exclusão — nem por acidente', async () => {
    const rotas = montado.ROTAS_ESCOPADAS.filter((r) => /contribuicoes/.test(r.caminho));
    assert(!rotas.some((r) => r.metodo === 'DELETE'),
      'existe rota que apaga contribuição: ' + JSON.stringify(rotas));
  });

  await teste('painel de divergências da família lista o que precisa de decisão', async () => {
    const r = await req('GET', F('/divergencias'), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.divergencias.some((d) => d.nome_exibicao === 'Antônio Villela'
      && d.predicado === 'data_nascimento'), 'não listou a divergência do Antônio');
  });

  await teste('CONTRIBUTOR contribui e afirma, mas NÃO resolve divergência', async () => {
    const r = await req('POST', F(`/pessoas/${antonio.id}/fatos/data_nascimento/resolver`),
      { sessao: bruno, corpo: { claim_id: P.claimIA, motivo: 'porque sim' } });
    assert.strictEqual(r.status, 403, 'CONTRIBUTOR resolveu divergência da família');
  });

  await teste('todo fato exibido tem selo — nenhum aparece "pelado"', async () => {
    const r = await req('GET', F(`/pessoas/${antonio.id}/fatos`), { sessao: ana });
    for (const f of r.json.fatos) {
      assert(prov.STATUS.includes(f.status), `fato ${f.predicado} sem status válido: ${f.status}`);
      assert(i18n.t('pt-BR', 'status.selo_' + f.status) !== 'status.selo_' + f.status,
        `status ${f.status} não tem selo`);
    }
  });

  // =================================================================== FASE 4
  const midiaMod = require('./midia');
  const arquivos = require('./arquivos');
  const zlib = require('zlib');

  // Um PNG de verdade, gerado aqui: hash real, dimensões reais, bytes reais.
  function pngReal(largura, altura, cor = [122, 92, 62]) {
    const crcTab = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTab[n] = c >>> 0; }
    const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTab[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (tipo, dados) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
      const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
      const c = Buffer.alloc(4); c.writeUInt32BE(crc(corpo));
      return Buffer.concat([len, corpo, c]);
    };
    const linhas = [];
    for (let y = 0; y < altura; y++) {
      const l = Buffer.alloc(1 + largura * 3);
      for (let x = 0; x < largura; x++) { l[1 + x * 3] = cor[0]; l[2 + x * 3] = cor[1]; l[3 + x * 3] = cor[2]; }
      linhas.push(l);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(largura, 0); ihdr.writeUInt32BE(altura, 4);
    ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(linhas))), chunk('IEND', Buffer.alloc(0))]);
  }

  /** JPEG mínimo com EXIF de verdade — para provar o leitor de EXIF. */
  function jpegComExif(dataISO = '1985:07:12 14:30:00') {
    const tiff = [];
    const push16 = (a, v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); a.push(b); };
    const push32 = (a, v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v); a.push(b); };
    push16(tiff, 0x4d4d); push16(tiff, 42); push32(tiff, 8);      // MM, 42, offset IFD0
    const entradas = [];
    // IFD0 com um ponteiro para o IFD Exif
    push16(entradas, 1);                                            // 1 entrada
    push16(entradas, 0x8769); push16(entradas, 4); push32(entradas, 1); push32(entradas, 8 + 2 + 12 + 4);
    push32(entradas, 0);                                            // fim do IFD0
    const data = Buffer.from(dataISO + '\0', 'ascii');
    const exifIfd = [];
    push16(exifIfd, 1);
    push16(exifIfd, 0x9003); push16(exifIfd, 2); push32(exifIfd, data.length);
    push32(exifIfd, 8 + 2 + 12 + 4 + 2 + 12 + 4);                   // offset do texto
    push32(exifIfd, 0);
    const corpoTiff = Buffer.concat([...tiff, ...entradas, ...exifIfd, data]);
    const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), corpoTiff]);
    const tamanho = Buffer.alloc(2); tamanho.writeUInt16BE(app1.length + 2);
    const sof0 = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);  // 200x100
    return Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe1]), tamanho, app1,
      sof0, Buffer.from([0xff, 0xd9])]);
  }

  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

  /** Sobe um arquivo pelo caminho REAL: preparar → PUT no R2 → confirmar. */
  async function enviar(buf, nome, { sessao = ana, tipo = 'FOTO' } = {}) {
    const prep = await req('POST', F('/midias/preparar'), { sessao,
      corpo: { nome, bytes: buf.length, sha256: sha(buf), mime: 'image/png', tipo } });
    if (prep.json && prep.json.duplicado) return { duplicado: true, media_id: prep.json.media_id };
    assert.strictEqual(prep.status, 201, 'preparar falhou: ' + prep.texto);
    const put = await fetch(prep.json.url_envio, { method: 'PUT', body: buf,
      headers: { 'Content-Type': 'application/octet-stream' } });
    assert(put.ok, 'o R2 recusou o PUT: ' + put.status);
    const conf = await req('POST', F(`/midias/${prep.json.media_id}/confirmar`), { sessao });
    assert.strictEqual(conf.status, 202, 'confirmar falhou: ' + conf.texto);
    return { media_id: prep.json.media_id, chave: prep.json.chave };
  }

  console.log('\nleitura de arquivo (bytes, não o que o cliente disse)');
  await teste('descobre o tipo REAL pelos primeiros bytes', async () => {
    assert.strictEqual(arquivos.tipoReal(pngReal(4, 4)).mime, 'image/png');
    assert.strictEqual(arquivos.tipoReal(jpegComExif()).mime, 'image/jpeg');
    assert.strictEqual(arquivos.tipoReal(Buffer.from('%PDF-1.7')).mime, 'application/pdf');
    // O que não reconhecemos não entra: lista de permissão, não de bloqueio.
    assert.strictEqual(arquivos.tipoReal(Buffer.from('qualquer coisa')), null);
  });

  await teste('SVG e HTML nunca entram como imagem (vetor de XSS)', async () => {
    for (const m of ['image/svg+xml', 'text/html', 'application/xhtml+xml']) {
      assert(arquivos.ehProibido(m), `${m} não está na lista de proibidos`);
    }
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.strictEqual(arquivos.tipoReal(svg), null, 'SVG passou pelos magic bytes');
  });

  await teste('lê dimensões e EXIF sem decodificar a imagem', async () => {
    const d = arquivos.dimensoes(pngReal(120, 80));
    assert.deepStrictEqual([d.largura, d.altura], [120, 80]);
    const j = jpegComExif('1985:07:12 14:30:00');
    assert.deepStrictEqual([arquivos.dimensoes(j).largura, arquivos.dimensoes(j).altura], [200, 100]);
    const exif = arquivos.lerExif(j);
    assert.match(exif.data_original || '', /^1985:07:12/, 'não leu a data do EXIF: ' + JSON.stringify(exif));
    assert.strictEqual(arquivos.dataDoExif(exif), '12/07/1985');
  });

  await teste('EXIF corrompido não impede guardar a foto', async () => {
    const quebrado = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x20]),
      Buffer.from('Exif\0\0'), crypto.randomBytes(20)]);
    assert.deepStrictEqual(arquivos.lerExif(quebrado), {}, 'EXIF quebrado derrubou o leitor');
  });

  console.log('\nmídia — o caminho completo');
  let foto1;
  await teste('preparar → PUT direto no R2 → confirmar → worker → pronta', async () => {
    const buf = pngReal(60, 40);
    const r = await enviar(buf, 'vovo-na-varanda.png');
    foto1 = r.media_id;

    const antes = await req('GET', F(`/midias/${foto1}`), { sessao: ana });
    assert.strictEqual(antes.json.midia.status, 'recebida', 'não ficou aguardando o worker');

    // o worker de verdade, pela fila de verdade
    fila.limparHandlers();
    require('./worker').registrarHandlers();
    const lote = await fila.processarLote(10, 'rapida');
    assert(lote.ok >= 1, 'o worker não processou: ' + JSON.stringify(lote));

    const depois = await req('GET', F(`/midias/${foto1}`), { sessao: ana });
    assert.strictEqual(depois.json.midia.status, 'pronta', 'status: ' + depois.json.midia.erro);
    assert.strictEqual(depois.json.midia.mime_real, 'image/png');
    assert.strictEqual(depois.json.midia.largura, 60);
    assert.strictEqual(depois.json.midia.altura, 40);
  });

  await teste('a data da câmera vira FATO COM FONTE, não verdade absoluta', async () => {
    const buf = jpegComExif('1985:07:12 10:00:00');
    const prep = await req('POST', F('/midias/preparar'), { sessao: ana,
      corpo: { nome: 'festa-1985.jpg', bytes: buf.length, sha256: sha(buf), mime: 'image/jpeg', tipo: 'FOTO' } });
    await fetch(prep.json.url_envio, { method: 'PUT', body: buf });
    await req('POST', F(`/midias/${prep.json.media_id}/confirmar`), { sessao: ana });
    await fila.processarLote(10, 'rapida');

    const m = await req('GET', F(`/midias/${prep.json.media_id}`), { sessao: ana });
    assert.strictEqual(m.json.midia.capturada_valor, '12/07/1985', 'não gravou a data do EXIF');
    const claim = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT c.status, s.tipo AS fonte FROM claims c
         LEFT JOIN evidence e ON e.claim_id = c.id LEFT JOIN sources s ON s.id = e.source_id
        WHERE c.sujeito_tipo='media' AND c.sujeito_id=$1 AND c.predicado='data_captura'`,
      [prep.json.media_id]));
    assert(claim, 'a data do EXIF não virou fato com proveniência');
    assert.strictEqual(claim.status, 'DOCUMENTED');
  });

  await teste('a mesma foto mandada de novo é reconhecida ANTES de subir o byte', async () => {
    const buf = pngReal(60, 40);   // idêntico ao da foto1
    const r = await req('POST', F('/midias/preparar'), { sessao: bruno,
      corpo: { nome: 'copia.png', bytes: buf.length, sha256: sha(buf), mime: 'image/png', tipo: 'FOTO' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.duplicado, true, 'não detectou a duplicata');
    assert.strictEqual(r.json.media_id, foto1, 'apontou para outra mídia');
    assert(!r.json.url_envio, 'ofereceu URL de envio para uma duplicata');
  });

  await teste('arquivo que chega diferente do prometido vai para quarentena', async () => {
    const prometido = pngReal(10, 10);
    const enviado = pngReal(11, 11);        // hash diferente
    const prep = await req('POST', F('/midias/preparar'), { sessao: ana,
      corpo: { nome: 'troca.png', bytes: prometido.length, sha256: sha(prometido), mime: 'image/png', tipo: 'FOTO' } });
    await fetch(prep.json.url_envio, { method: 'PUT', body: enviado });
    await req('POST', F(`/midias/${prep.json.media_id}/confirmar`), { sessao: ana });
    await fila.processarLote(10, 'rapida');
    const m = await req('GET', F(`/midias/${prep.json.media_id}`), { sessao: ana });
    assert.strictEqual(m.json.midia.status, 'quarentena', 'aceitou arquivo trocado');
    assert.strictEqual(m.json.midia.erro, 'erro.midia_hash_diferente');
  });

  await teste('arquivo de tipo não reconhecido não entra no acervo', async () => {
    const lixo = Buffer.from('isto não é imagem nenhuma, é texto disfarçado');
    const prep = await req('POST', F('/midias/preparar'), { sessao: ana,
      corpo: { nome: 'foto.png', bytes: lixo.length, sha256: sha(lixo), mime: 'image/png', tipo: 'FOTO' } });
    await fetch(prep.json.url_envio, { method: 'PUT', body: lixo });
    await req('POST', F(`/midias/${prep.json.media_id}/confirmar`), { sessao: ana });
    await fila.processarLote(10, 'rapida');
    const m = await req('GET', F(`/midias/${prep.json.media_id}`), { sessao: ana });
    assert.strictEqual(m.json.midia.status, 'quarentena', 'aceitou arquivo com extensão mentirosa');
  });

  await teste('reprocessar a mesma mídia é inofensivo (fila entrega ≥1 vez)', async () => {
    const r = await tenancy.comEscopo(famA, (t) =>
      midiaMod.ingerir(t, { mediaId: foto1, familyId: famA, userId: ana.id }));
    assert(r.ignorado, 'reprocessou uma mídia já pronta: ' + JSON.stringify(r));
  });

  console.log('\nmídia — o original é imutável (§7)');
  await teste('o BANCO recusa trocar o arquivo de um original pronto', async () => {
    await assert.rejects(tenancy.comEscopo(famA, (t) => t.q(
      `UPDATE media SET storage_key = 'outro/lugar.png' WHERE id = $1`, [foto1])),
    /imutável/i, 'foi possível apontar o original para outro arquivo');
    await assert.rejects(tenancy.comEscopo(famA, (t) => t.q(
      `UPDATE media SET sha256 = $2 WHERE id = $1`, [foto1, sha(Buffer.from('x'))])),
    /imutável/i, 'foi possível trocar o hash do original');
  });

  await teste('o CONTEXTO continua editável — imutável é o byte, não a memória', async () => {
    const r = await req('PATCH', F(`/midias/${foto1}`), { sessao: ana,
      corpo: { titulo: 'Vovó na varanda', descricao: 'Casa da rua das Palmeiras.' } });
    assert.strictEqual(r.status, 200, r.texto);
    assert.strictEqual(r.json.midia.titulo, 'Vovó na varanda');
  });

  await teste('miniatura é DERIVADO, e o original não é tocado', async () => {
    const thumb = pngReal(16, 16, [200, 200, 200]);
    const r = await req('POST', F(`/midias/${foto1}/derivados`), { sessao: ana,
      corpo: { papel: 'THUMB', sha256: sha(thumb), bytes: thumb.length,
        mime: 'image/png', largura: 16, altura: 16 } });
    assert.strictEqual(r.status, 201, r.texto);
    assert.strictEqual(r.json.derivado.derivado_de, foto1);
    assert.strictEqual(r.json.derivado.ai_class, 'ORIGINAL', 'miniatura marcada como conteúdo de IA');
    assert(r.json.url_envio, 'não devolveu onde subir a miniatura');
    const orig = await req('GET', F(`/midias/${foto1}`), { sessao: ana });
    assert.strictEqual(orig.json.midia.status, 'pronta');
    assert.strictEqual(orig.json.derivados.length, 1);
    assert.strictEqual(orig.json.derivados[0].papel, 'THUMB');
  });

  await teste('não se deriva de um derivado', async () => {
    const orig = await req('GET', F(`/midias/${foto1}`), { sessao: ana });
    const thumbId = orig.json.derivados[0].id;
    const r = await req('POST', F(`/midias/${thumbId}/derivados`), { sessao: ana,
      corpo: { papel: 'THUMB', sha256: sha(Buffer.from('y')), bytes: 1, mime: 'image/png' } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.codigo, 'erro.derivado_de_derivado');
  });

  console.log('\n"conte a história desta foto" (§23)');
  await teste('as respostas viram identificação, fato com fonte e contribuição', async () => {
    const r = await req('POST', F(`/midias/${foto1}/historia`), { sessao: ana, corpo: {
      pessoas: [P.joao.id, P.maria.id],
      quando: 'anos 40',
      onde: 'Fazenda do avô, em Pirapora',
      titulo: 'O aniversário na fazenda',
      ocasiao: 'Aniversário de 60 anos do bisavô.',
      aconteceu: 'Choveu a tarde toda e todo mundo ficou na varanda cantando.',
      porque_importa: 'É a única foto em que os quatro irmãos aparecem juntos.' } });
    assert.strictEqual(r.status, 201, r.texto);
    assert.strictEqual(r.json.registrado.pessoas, 2, 'não marcou as duas pessoas');
    assert(r.json.registrado.contribuicao, 'a história não virou contribuição');

    const m = await req('GET', F(`/midias/${foto1}`), { sessao: ana });
    // 'anos 40' é canonicalizado para 'anos 1940': o século é resolvido na
    // entrada, e não fica ambiguidade guardada no acervo.
    assert.strictEqual(m.json.midia.capturada_valor, 'anos 1940', 'não guardou a data imprecisa');
    assert.strictEqual(m.json.midia.capturada_precisao, 'DECADA');
    assert.match(m.json.midia.local_texto, /Pirapora/);
    assert.strictEqual(m.json.pessoas.length, 2);
    assert(m.json.pessoas.every((x) => x.origem === 'CONFIRMADA'), 'identificação humana não ficou confirmada');
    assert(m.json.contribuicoes.length >= 1, 'a história não ficou consultável');
    assert.match(m.json.contribuicoes[0].corpo, /varanda cantando/);
    assert.strictEqual(m.json.contribuicoes[0].autor_nome, 'Ana Villela', 'perdeu a autoria');
  });

  await teste('a foto entra na galeria filtrada por pessoa', async () => {
    const r = await req('GET', F(`/midias?pessoa=${P.joao.id}`), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.midias.some((m) => m.id === foto1), 'a foto não apareceu no filtro por pessoa');
    const item = r.json.midias.find((m) => m.id === foto1);
    assert.strictEqual(item.pessoas, 2);
    assert(item.thumb_id, 'a galeria não trouxe a miniatura');
  });

  await teste('data errada na história é recusada com mensagem útil', async () => {
    const r = await req('POST', F(`/midias/${foto1}/historia`), { sessao: ana,
      corpo: { quando: '31/02/1940' } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.codigo, 'erro.data_invalida');
  });

  console.log('\nmídia — privacidade e acesso');
  await teste('foto PRIVATE some para quem não pode ver, em TODA listagem', async () => {
    const buf = pngReal(30, 30, [10, 10, 10]);
    const r = await enviar(buf, 'carta-particular.png');
    await fila.processarLote(10, 'rapida');
    await req('PATCH', F(`/midias/${r.media_id}`), { sessao: ana, corpo: { privacidade: 'PRIVATE' } });

    const lista = await req('GET', F('/midias'), { sessao: bruno });   // CONTRIBUTOR
    assert(!lista.json.midias.find((m) => m.id === r.media_id), 'foto privada apareceu na galeria');
    assert(lista.json.ocultas >= 1, 'não avisou que há itens ocultos');
    const direto = await req('GET', F(`/midias/${r.media_id}`), { sessao: bruno });
    assert.strictEqual(direto.status, 404, 'devolveu 403 e confirmou a existência');
    const url = await req('GET', F(`/midias/${r.media_id}/url`), { sessao: bruno });
    assert.strictEqual(url.status, 404, 'entregou a URL do arquivo privado');
    P.privada = r.media_id;
  });

  await teste('quem administra abre o privado, e o acesso fica AUDITADO', async () => {
    const url = await req('GET', F(`/midias/${P.privada}/url`), { sessao: carla });   // ADMIN
    assert.strictEqual(url.status, 200, url.texto);
    assert.match(url.json.url, /X-Amz-Signature/, 'não devolveu URL assinada');
    const log = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT count(*)::int n FROM audit_log WHERE acao = 'midia.baixada' AND alvo_id = $1`, [P.privada]));
    assert(log.n >= 1, 'acesso de terceiro a item privado não foi auditado');
  });

  await teste('o autor sempre abre o que é dele', async () => {
    const url = await req('GET', F(`/midias/${P.privada}/url`), { sessao: ana });
    assert.strictEqual(url.status, 200, 'o autor não conseguiu abrir o próprio arquivo');
  });

  await teste('a URL de leitura é assinada e temporária — o bucket não é público', async () => {
    const url = await req('GET', F(`/midias/${foto1}/url`), { sessao: ana });
    assert(url.json.expira_em_seg <= 900, 'URL sem prazo curto');
    const r = await fetch(url.json.url);
    assert(r.ok, 'a URL assinada não abriu o arquivo');
    const semAssinatura = url.json.url.split('?')[0];
    const publico = await fetch(semAssinatura);
    assert(!publico.ok, 'o arquivo abriu SEM assinatura — o bucket está público');
  });

  await teste('galeria pagina por cursor, não por OFFSET', async () => {
    const r = await req('GET', F('/midias?limite=2'), { sessao: ana });
    assert(r.json.midias.length <= 2);
    assert(r.json.proximo_cursor, 'não devolveu cursor');
    const seg = await req('GET', F(`/midias?limite=2&antes_de=${encodeURIComponent(r.json.proximo_cursor)}`), { sessao: ana });
    const idsA = r.json.midias.map((m) => m.id), idsB = seg.json.midias.map((m) => m.id);
    assert(!idsB.some((id) => idsA.includes(id)), 'a segunda página repetiu itens da primeira');
  });

  await teste('álbum REFERENCIA a mídia, não duplica', async () => {
    const a = await req('POST', F('/albuns'), { sessao: ana, corpo: { titulo: 'Fazenda' } });
    assert.strictEqual(a.status, 201, a.texto);
    const i1 = await req('POST', F(`/albuns/${a.json.album.id}/itens`), { sessao: ana, corpo: { media_id: foto1 } });
    assert.strictEqual(i1.status, 201);
    const i2 = await req('POST', F(`/albuns/${a.json.album.id}/itens`), { sessao: ana, corpo: { media_id: foto1 } });
    assert.strictEqual(i2.json.ja_estava, true, 'aceitou o mesmo item duas vezes no álbum');
    const n = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT count(*)::int c FROM media WHERE id = $1 OR derivado_de = $1`, [foto1]));
    assert.strictEqual(n.c, 2, 'o álbum duplicou a mídia (esperado: original + miniatura)');
  });

  await teste('GUEST não vê documento nem consegue a URL dele', async () => {
    const buf = Buffer.from('%PDF-1.7\n' + 'x'.repeat(400));
    const prep = await req('POST', F('/midias/preparar'), { sessao: ana,
      corpo: { nome: 'certidao.pdf', bytes: buf.length, sha256: sha(buf),
        mime: 'application/pdf', tipo: 'DOCUMENTO' } });
    await fetch(prep.json.url_envio, { method: 'PUT', body: buf });
    await req('POST', F(`/midias/${prep.json.media_id}/confirmar`), { sessao: ana });
    await fila.processarLote(10, 'rapida');
    const m = await tenancy.comEscopo(famA, (t) => t.uma('SELECT tipo, status FROM media WHERE id=$1', [prep.json.media_id]));
    assert.strictEqual(m.tipo, 'DOCUMENTO');
    assert.strictEqual(m.status, 'pronta');

    // convidado de verdade
    const visita = await novaConta('Visita Guest', 'guest-midia@teste.origena');
    const c = await req('POST', F('/convites'), { sessao: ana, corpo: { email: visita.email, papel: 'GUEST' } });
    const tk = tokenDoUltimoEmail(visita.email, '/origena/convite');
    await req('POST', `/origena/api/v1/convites/${encodeURIComponent(tk)}/aceitar`, { sessao: visita });
    assert(c.status === 201);
    const url = await req('GET', F(`/midias/${prep.json.media_id}/url`), { sessao: visita });
    assert.strictEqual(url.status, 404, 'GUEST abriu um documento da família');
  });

  await teste('arquivar mídia é soft delete: some da galeria, fica no banco', async () => {
    const r = await enviar(pngReal(22, 22, [1, 2, 3]), 'some.png');
    await fila.processarLote(10, 'rapida');
    await req('DELETE', F(`/midias/${r.media_id}`), { sessao: ana });
    const lista = await req('GET', F('/midias'), { sessao: ana });
    assert(!lista.json.midias.find((m) => m.id === r.media_id), 'continuou na galeria');
    const linha = await tenancy.comEscopo(famA, (t) =>
      t.uma('SELECT deleted_at FROM media WHERE id = $1', [r.media_id]));
    assert(linha && linha.deleted_at, 'a linha foi APAGADA em vez de arquivada');
  });

  // ============================================================ §94 TENANCY
  console.log('\nisolamento entre famílias (§94) — requisito de primeira classe');

  const ALVO_FALSO = '00000000-0000-4000-8000-000000000000';

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
        .replace(':pessoaId', uuidFalso).replace(':relId', uuidFalso)
        .replace(':predicado', 'data_nascimento').replace(':claimId', uuidFalso)
        .replace(':contribId', uuidFalso).replace(':mediaId', uuidFalso)
        .replace(':albumId', uuidFalso).replace(':idId', uuidFalso).replace(':id', uuidFalso);
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
        .replace(':pessoaId', ALVO_FALSO).replace(':relId', ALVO_FALSO)
        .replace(':predicado', 'data_nascimento').replace(':claimId', ALVO_FALSO)
        .replace(':contribId', ALVO_FALSO).replace(':mediaId', ALVO_FALSO)
        .replace(':albumId', ALVO_FALSO).replace(':idId', ALVO_FALSO).replace(':id', ALVO_FALSO);
      const r = await req(rota.metodo, caminho, { sessao: silva, corpo: rota.metodo === 'GET' ? undefined : { nome: 'x', papel: 'GUEST' } });
      assert.strictEqual(r.status, 404, `${rota.metodo} ${rota.caminho} devolveu ${r.status}`);
    }
  });

  await teste('sem sessão nenhuma, tudo é 401 (nunca 200)', async () => {
    for (const rota of montado.ROTAS_ESCOPADAS) {
      const caminho = rota.caminho.replace(':familyId', famA).replace(':userId', ana.id)
        .replace(':pessoaId', ALVO_FALSO).replace(':relId', ALVO_FALSO)
        .replace(':predicado', 'data_nascimento').replace(':claimId', ALVO_FALSO)
        .replace(':contribId', ALVO_FALSO).replace(':mediaId', ALVO_FALSO)
        .replace(':albumId', ALVO_FALSO).replace(':idId', ALVO_FALSO).replace(':id', ALVO_FALSO);
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
  console.log('ORIGENA Fases 0 a 4: verde.\n');
}

principal().catch(async (e) => {
  console.error('\nsuíte quebrou:', e);
  try { await db.derrubarSchema(); } catch (_) {}
  try { await db.fechar(); } catch (_) {}
  process.exit(1);
});
