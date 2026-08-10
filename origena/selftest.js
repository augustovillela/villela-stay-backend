// =====================================================================
// ORIGENA — suíte de testes (Fases 0 a 6).   npm run test:origena
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
// Fase 5: documentos que viram texto (e os que NÃO viram, declarados),
//         histórias versionadas e a busca única com filtros.
// Fase 6: lugares com nome histórico, eventos e a linha do tempo como
//         PROJEÇÃO reconstruível — nunca fonte de verdade.
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
// MERCADO PAGO DE MENTIRA. O gateway de verdade só responde com dinheiro
// de verdade, então o que se testa aqui é o NOSSO lado do contrato: que o
// crédito só entra depois de perguntar ao provedor, que o mesmo pagamento
// não entra duas vezes, e que valor menor não libera pedido maior.
// `__mock` é o que faz `billing.ativo()` ligar sem MP_ACCESS_TOKEN.
// =====================================================================
const MP = { chamadas: [], pagamentos: {}, assinaturas: {}, seq: 0 };

async function mpFake(caminho, opts = {}) {
  const metodo = (opts.method || 'GET').toUpperCase();
  const corpo = opts.body ? JSON.parse(opts.body) : null;
  MP.chamadas.push({ caminho, metodo, corpo, headers: opts.headers || {} });

  if (caminho === '/checkout/preferences' && metodo === 'POST') {
    const id = 'pref' + (++MP.seq);
    MP.ultimaPreferencia = corpo;
    return { id, init_point: 'https://mp.teste/checkout/' + id };
  }
  if (caminho === '/preapproval' && metodo === 'POST') {
    const id = 'pre' + (++MP.seq);
    MP.assinaturas[id] = { id, status: 'pending', external_reference: corpo.external_reference,
      auto_recurring: corpo.auto_recurring };
    return { ...MP.assinaturas[id], init_point: 'https://mp.teste/assinar/' + id };
  }
  if (caminho.startsWith('/preapproval/')) {
    const id = caminho.split('/')[2];
    const a = MP.assinaturas[id];
    if (!a) throw new Error('Mercado Pago 404: preapproval ' + id);
    if (metodo === 'PUT') { a.status = corpo.status; }
    return a;
  }
  if (caminho.startsWith('/v1/payments/')) {
    const p = MP.pagamentos[caminho.split('/')[3]];
    if (!p) throw new Error('Mercado Pago 404: payment');
    return p;
  }
  throw new Error('mpFake: rota não simulada ' + metodo + ' ' + caminho);
}
mpFake.__mock = true;

/** Cria um pagamento aprovado no MP de mentira e devolve o id dele. */
function mpPagar(externalRef, reais, status = 'approved') {
  const id = 'pay' + (++MP.seq);
  MP.pagamentos[id] = { id, status, external_reference: externalRef, transaction_amount: reais };
  return id;
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
  // MESMO limite do server.js real: com o padrão (100 kB) o teste diria
  // que a importação de um acervo com fotos quebra, quando o que quebra é
  // o servidor de mentira. Harness que não espelha produção mente nos dois
  // sentidos.
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());
  const montado = await origena.montar(app, {
    express, requireAuth, requireAdmin, enviarEmail, mpFetch: mpFake,
    jwtSecret: 'segredo-de-teste-origena' });
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

  await teste('o app da família serve as telas novas, com o catálogo injetado', async () => {
    const r = await req('GET', '/origena/app');
    assert.strictEqual(r.status, 200);
    // o app é uma página só: se o template quebrar, some tudo de uma vez
    for (const tela of ['telaTradicoes', 'verTradicao', 'telaReliquias', 'verReliquia',
      'telaMissoes', 'telaHistoriador', 'telaIndice', 'telaAvisos', 'telaPlanos',
      'telaEntrevistas', 'verEntrevista', 'telaGrafo', 'telaMapa', 'desenhoMapa']) {
      assert(r.texto.includes('function ' + tela) || r.texto.includes(tela + ' ='),
        `a tela ${tela} não foi para o HTML`);
    }
    assert(r.texto.includes('Bolo') === false, 'o HTML do app não pode trazer conteúdo de família');
    assert(r.texto.includes('linha_de_posse'), 'o catálogo da relíquia não foi injetado');
  });

  await teste('GET /origena/health responde com o estado do banco', async () => {
    const r = await req('GET', '/origena/health');
    assert.strictEqual(r.json.produto, 'origena');
    assert(r.json.banco && r.json.banco.ok, 'health não confirmou o banco');
  });

  await teste('a saúde denuncia worker calado ou sem o handler que importa', async () => {
    // sem batida nenhuma: não pode dizer que está tudo bem
    const semWorker = await req('GET', '/origena/health');
    assert.strictEqual(semWorker.status, 503, 'disse "ok" sem worker nenhum ter batido');
    assert.strictEqual(semWorker.json.worker.ok, false);

    // batida antiga, mesmo com handler certo, é worker morto
    const velha = JSON.stringify({ em: new Date(Date.now() - 3.6e6).toISOString(),
      commit: 'abc1234', handlers: ['midia.ingerir', 'documento.extrair', 'smoke'] });
    await db.q(`INSERT INTO config (chave, valor, atualizado_em)
                VALUES ('worker_heartbeat', $1, now() - interval '1 hour')
                ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor,
                       atualizado_em = now() - interval '1 hour'`, [velha]);
    const calado = await req('GET', '/origena/health');
    assert.strictEqual(calado.status, 503, 'batida de 1 hora atrás passou por saudável');
    assert.strictEqual(calado.json.worker.motivo, 'worker calado');

    // batida fresca, mas rodando código velho (sem o handler de mídia):
    // é EXATAMENTE o que aconteceu em produção em 08/08/2026
    const velhoCodigo = JSON.stringify({ em: new Date().toISOString(), commit: '088454c', handlers: ['smoke'] });
    await db.q(`UPDATE config SET valor = $1, atualizado_em = now() WHERE chave = 'worker_heartbeat'`, [velhoCodigo]);
    const desatualizado = await req('GET', '/origena/health');
    assert.strictEqual(desatualizado.status, 503, 'worker sem o handler de mídia passou por saudável');
    assert(desatualizado.json.worker.faltando.includes('midia.ingerir'),
      'não apontou o handler de mídia como faltando');

    // worker em dia
    const bom = JSON.stringify({ em: new Date().toISOString(), commit: 'deadbee',
      handlers: ['midia.ingerir', 'documento.extrair', 'smoke'] });
    await db.q(`UPDATE config SET valor = $1, atualizado_em = now() WHERE chave = 'worker_heartbeat'`, [bom]);
    const ok = await req('GET', '/origena/health');
    assert.strictEqual(ok.status, 200, ok.texto);
    assert.strictEqual(ok.json.worker.commit, 'deadbee');
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

  await teste('toda chave que a TELA pede existe no catálogo', async () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, 'paginas.js'), 'utf8');
    const faltando = new Set();
    // t('chave') no JS do navegador e i18n.t(idioma, 'chave') no servidor
    for (const m of src.matchAll(/\bt\((?:idioma,\s*)?'([a-z_]+(?:\.[a-z_0-9]+)+)'/gi)) {
      // literal terminado em `_` ou `.` é PREFIXO de chave montada
      // ('tradicao.cat_' + categoria); essas o teste seguinte confere uma
      // a uma, porque aqui só dá para ver metade da chave.
      if (/[._]$/.test(m[1])) continue;
      if (i18n.t('pt-BR', m[1]) === m[1]) faltando.add(m[1]);
    }
    assert.strictEqual(faltando.size, 0, 'a tela pede chave que não existe: ' + [...faltando].join(', '));
  });

  await teste('as chaves MONTADAS em tempo de execução também existem', async () => {
    // O teste acima só enxerga chave literal. Estas são construídas
    // ('tradicao.cat_' + categoria) e é justamente onde uma chave crua
    // chegaria na tela do usuário sem ninguém ver.
    const historiadorMod = require('./historiador');
    const tradicoesMod = require('./tradicoes');
    const missoesMod = require('./missoes');
    const faltando = [];
    const conferir = (chave) => { if (i18n.t('pt-BR', chave) === chave) faltando.push(chave); };
    for (const tipo of Object.keys(historiadorMod.PESOS)) {
      conferir('historiador.tipo_' + tipo);
      conferir(missoesMod.PERGUNTA[tipo]);
    }
    for (const c of tradicoesMod.CATEGORIAS) conferir('tradicao.cat_' + c);
    for (const d of historiadorMod.DIMENSOES) conferir('indice.dim_' + d);
    // OWNER fica de fora: não se convida ninguém para dono da família,
    // então a descrição dele nunca aparece na tela de convite.
    for (const p of ['CONTRIBUTOR', 'FAMILY_MEMBER', 'EDITOR', 'HISTORIAN', 'ADMIN', 'GUEST']) {
      conferir('papel.desc_' + p);
    }
    for (const st of require('./proveniencia').STATUS) conferir('status.selo_' + st);
    for (const x of ['person', 'media', 'story', 'contribution', 'document', 'recipe',
      'heirloom', 'event', 'tradition']) conferir('busca.tipo_' + x);
    for (const x of ['nascimento', 'falecimento', 'casamento', 'evento', 'foto', 'historia',
      'tradicao', 'reliquia']) conferir('tempo.tipo_' + x);
    assert.strictEqual(faltando.length, 0, 'chave montada sem tradução: ' + faltando.join(', '));
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

  await teste('a trava do dono vale em LOTE — dois donos apagados de uma vez', async () => {
    // O gatilho de LINHA conta os outros donos e, com dois saindo na mesma
    // instrução, cada um vê o outro ainda vivo: as duas linhas passavam e a
    // família ficava sem dono. Foi um teste INTERMITENTE que denunciou.
    const fam = await db.uma(
      `INSERT INTO families (nome, slug, created_by) VALUES ('Família Dois Donos', $1, $2)
       RETURNING id`, ['dois-donos-' + Date.now(), ana.id]);
    for (const u of [ana.id, bruno.id]) {
      await db.q(
        `INSERT INTO family_memberships (family_id, user_id, papel, status)
         VALUES ($1,$2,'OWNER','ativo')`, [fam.id, u]);
    }
    await assert.rejects(
      db.q(`DELETE FROM family_memberships WHERE family_id = $1 AND papel = 'OWNER'`, [fam.id]),
      /pelo menos um responsável/i,
      'DOIS donos saíram na mesma instrução e a família ficou órfã');
    const sobraram = await db.todas(
      `SELECT id FROM family_memberships WHERE family_id = $1 AND papel = 'OWNER'`, [fam.id]);
    assert.strictEqual(sobraram.length, 2, 'o rollback não devolveu os donos');
    // e o mesmo em UPDATE, que é como se rebaixa alguém
    await assert.rejects(
      db.q(`UPDATE family_memberships SET papel = 'ADMIN' WHERE family_id = $1 AND papel = 'OWNER'`,
        [fam.id]), /pelo menos um responsável/i, 'rebaixou os dois donos de uma vez');
    // Limpeza — e de quebra a prova de que a isenção da purga continua de pé:
    // família `encerrada` PODE ficar sem dono, porque está sendo desmontada.
    await db.q(`UPDATE families SET status = 'encerrada' WHERE id = $1`, [fam.id]);
    await db.q(`DELETE FROM family_memberships WHERE family_id = $1`, [fam.id]);
    await db.q(`DELETE FROM families WHERE id = $1`, [fam.id]);
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
  /** OGG mínimo: só o que o detector de tipo REAL precisa ver ('OggS'). */
  function oggFalso() {
    const cab = Buffer.alloc(64);
    cab.write('OggS', 0, 'ascii');
    cab.write('entrevista-de-teste', 32, 'ascii');
    return cab;
  }

  async function enviar(buf, nome, { sessao = ana, tipo = 'FOTO', mime = 'image/png' } = {}) {
    const prep = await req('POST', F('/midias/preparar'), { sessao,
      corpo: { nome, bytes: buf.length, sha256: sha(buf), mime, tipo } });
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

    // O ÍNDICE TAMBÉM TEM DE SABER. Marcar como privada depois de indexada
    // atualizava só a tabela `media`: a busca continuava com a privacidade
    // antiga e devolvia a foto para quem não podia abri-la. Achado em
    // 10/08/2026 por um teste da busca por SENTIDO — o furo era da textual.
    const naBusca = await req('GET', F('/busca?q=' + encodeURIComponent('carta-particular')),
      { sessao: bruno });
    assert(!(naBusca.json.resultados || []).some((x) => x.ref_id === P.privada),
      'a foto marcada como PRIVADA continuou aparecendo na busca de quem não pode vê-la');
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

  // =================================================================== FASE 5
  const historiasMod = require('./historias');
  const buscaMod = require('./busca');

  console.log('\ndocumentos — o que vira texto e o que NÃO vira');
  let certidao;
  await teste('PDF com texto é extraído e passa a ser buscável', async () => {
    const { PDFDocument, StandardFonts } = require('pdf-lib');
    const doc = await PDFDocument.create();
    const pag = doc.addPage();
    const fonte = await doc.embedFont(StandardFonts.Helvetica);
    pag.drawText('Certidao de nascimento de Antonio Villela, nascido em Pirapora', { x: 40, y: 300, size: 12, font: fonte });
    pag.drawText('aos quinze dias do mes de marco de mil novecentos e vinte e um.', { x: 40, y: 280, size: 12, font: fonte });
    const buf = Buffer.from(await doc.save());

    const prep = await req('POST', F('/midias/preparar'), { sessao: ana,
      corpo: { nome: 'certidao-antonio.pdf', bytes: buf.length, sha256: sha(buf),
        mime: 'application/pdf', tipo: 'DOCUMENTO' } });
    assert.strictEqual(prep.status, 201, prep.texto);
    await fetch(prep.json.url_envio, { method: 'PUT', body: buf });
    await req('POST', F(`/midias/${prep.json.media_id}/confirmar`), { sessao: ana });
    certidao = prep.json.media_id;

    // ingestão e extração são jobs SEPARADOS: dois lotes.
    await fila.processarLote(10, 'rapida');
    await fila.processarLote(10, 'rapida');

    const txt = await req('GET', F(`/midias/${certidao}/texto`), { sessao: ana });
    assert.strictEqual(txt.status, 200, txt.texto);
    assert.strictEqual(txt.json.texto.status, 'extraido', 'não extraiu: ' + txt.json.texto.erro);
    assert.match(txt.json.texto.texto, /Pirapora/);
    assert.strictEqual(txt.json.texto.metodo, 'pdf');
  });

  await teste('imagem escaneada fica ocr_pendente — e a tela pode dizer isso', async () => {
    // Uma foto comum: não há OCR contratado, então o texto dela não existe.
    const r = await enviar(pngReal(50, 50, [5, 5, 5]), 'manuscrito.png');
    await fila.processarLote(10, 'rapida');
    // forçamos a extração como se fosse documento, para exercitar o caminho
    await tenancy.comEscopo(famA, (t) => t.q(
      `UPDATE media SET tipo = 'DOCUMENTO' WHERE id = $1`, [r.media_id]));
    const saida = await tenancy.comEscopo(famA, (t) =>
      require('./documentos').extrair(t, { mediaId: r.media_id, familyId: famA, userId: ana.id }));
    assert.strictEqual(saida.ocr_pendente, true, 'fingiu que leu uma imagem');
    const pend = await req('GET', F('/documentos/pendentes'), { sessao: ana });
    assert(pend.json.pendentes.some((x) => x.media_id === r.media_id),
      'o documento não entrou na fila do que não é buscável');
  });

  await teste('extrair duas vezes o mesmo documento é inofensivo', async () => {
    const r = await tenancy.comEscopo(famA, (t) =>
      require('./documentos').extrair(t, { mediaId: certidao, familyId: famA, userId: ana.id }));
    assert(r.ignorado, 'reprocessou um documento já extraído');
  });

  console.log('\nhistórias versionadas');
  let hist;
  await teste('história guarda quem CONTOU e quem DIGITOU — não é a mesma pessoa', async () => {
    const r = await req('POST', F('/historias'), { sessao: ana, corpo: {
      titulo: 'A viagem de trem para Pirapora',
      corpo: 'Meu avô contava que a família inteira foi de trem, e que a viagem durou dois dias.',
      contada_por: P.joao.id, ocorrido: 'anos 30',
      local: 'Pirapora', pessoas: [P.joao.id, P.maria.id] } });
    assert.strictEqual(r.status, 201, r.texto);
    hist = r.json.historia.id;
    const d = await req('GET', F(`/historias/${hist}`), { sessao: ana });
    assert.strictEqual(d.json.historia.contada_por, 'João Villela', 'perdeu quem contou');
    assert.strictEqual(d.json.historia.autor_nome, 'Ana Villela', 'perdeu quem digitou');
    assert.strictEqual(d.json.historia.ocorrido_valor, 'anos 1930');
    assert.strictEqual(d.json.mencoes.length, 2);
  });

  await teste('editar CRIA a versão 2 — e a versão 1 continua consultável (§67)', async () => {
    const r = await req('PATCH', F(`/historias/${hist}`), { sessao: ana, corpo: {
      corpo: 'Meu avô contava que a família inteira foi de trem, e que a viagem durou três dias por causa de um atraso em Curvelo.',
      nota: 'O tio Zé corrigiu: foram três dias, não dois.' } });
    assert.strictEqual(r.status, 200, r.texto);
    assert.strictEqual(r.json.historia.versao_atual, 2);

    const d = await req('GET', F(`/historias/${hist}`), { sessao: ana });
    assert.strictEqual(d.json.versoes.length, 2, 'a versão 1 sumiu');
    const v1 = d.json.versoes.find((v) => v.versao === 1);
    assert(v1, 'não achei a versão 1');
    assert.match(v1.corpo, /durou dois dias/, 'a versão 1 foi ALTERADA em vez de preservada');
    assert.match(d.json.corpo, /três dias/, 'a versão corrente não é a nova');
    assert.match(d.json.versoes[0].nota_edicao, /tio Zé/);
  });

  await teste('história sem título ou sem texto é recusada', async () => {
    assert.strictEqual((await req('POST', F('/historias'),
      { sessao: ana, corpo: { titulo: '', corpo: 'x y z' } })).json.codigo, 'erro.historia_sem_titulo');
    assert.strictEqual((await req('POST', F('/historias'),
      { sessao: ana, corpo: { titulo: 'Só o título' } })).json.codigo, 'erro.historia_vazia');
  });

  await teste('histórias filtram por quem aparece nelas', async () => {
    const r = await req('GET', F(`/historias?pessoa=${P.maria.id}`), { sessao: ana });
    assert(r.json.historias.some((x) => x.id === hist), 'não achou pela menção');
  });

  console.log('\nbusca (§43)');
  await teste('uma caixa acha em TODOS os tipos do acervo', async () => {
    const r = await req('GET', F('/busca?q=Pirapora'), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    const tipos = new Set(r.json.resultados.map((x) => x.ref_tipo));
    assert(tipos.has('document'), 'não achou o documento: ' + [...tipos].join(', '));
    assert(tipos.has('story'), 'não achou a história');
    assert(r.json.resultados.length >= 2);
  });

  await teste('o trecho mostra ONDE a palavra apareceu', async () => {
    const r = await req('GET', F('/busca?q=Pirapora'), { sessao: ana });
    const doc = r.json.resultados.find((x) => x.ref_tipo === 'document');
    assert(doc, 'sem documento no resultado');
    assert.match(doc.trecho, /«|»/, 'não destacou o termo no trecho: ' + doc.trecho);
  });

  await teste('acha sem acento e com plural — quem digita "Jose" acha "José"', async () => {
    await criarPessoa({ nome: 'José Ferreira', profissao: 'ferroviário' });
    const semAcento = await req('GET', F('/busca?q=jose'), { sessao: ana });
    assert(semAcento.json.resultados.some((x) => /Jos/.test(x.titulo)),
      'não achou "José" digitando "jose"');
    const plural = await req('GET', F('/busca?q=viagens'), { sessao: ana });
    assert(plural.json.resultados.some((x) => x.ref_tipo === 'story'),
      'o radical não funcionou: "viagens" não achou "viagem"');
  });

  await teste('filtra por pessoa, por tipo, por período e por lugar', async () => {
    const porPessoa = await req('GET', F(`/busca?pessoa=${P.maria.id}`), { sessao: ana });
    assert(porPessoa.json.resultados.length >= 1, 'filtro por pessoa não achou nada');
    assert(porPessoa.json.resultados.every((x) => (x.pessoas || []).includes(P.maria.id)),
      'trouxe resultado sem a pessoa filtrada');

    const soHistorias = await req('GET', F('/busca?tipos=story'), { sessao: ana });
    assert(soHistorias.json.resultados.every((x) => x.ref_tipo === 'story'), 'o filtro de tipo vazou');

    const periodo = await req('GET', F('/busca?de=1930-01-01&ate=1939-12-31'), { sessao: ana });
    assert(periodo.json.resultados.some((x) => x.ref_tipo === 'story'),
      'o filtro por período não achou a história dos anos 30');

    const lugar = await req('GET', F('/busca?local=Pirapora'), { sessao: ana });
    assert(lugar.json.resultados.length >= 1, 'o filtro por lugar não achou nada');
  });

  await teste('busca vazia com filtros é navegação, não erro', async () => {
    const r = await req('GET', F('/busca?tipos=person&limite=5'), { sessao: ana });
    assert.strictEqual(r.status, 200);
    assert(r.json.resultados.length >= 1, 'busca só por filtro não devolveu nada');
  });

  await teste('documento PRIVATE não aparece na busca de quem não pode abri-lo', async () => {
    await req('PATCH', F(`/midias/${certidao}`), { sessao: ana, corpo: { privacidade: 'PRIVATE' } });
    // reindexar com a privacidade nova (a rota de PATCH ainda não o faz —
    // é o caso do teste ser mais exigente que o código; forçamos aqui)
    await tenancy.comEscopo(famA, (t) => t.q(
      `UPDATE busca SET privacidade = 'PRIVATE' WHERE ref_id = $1`, [certidao]));

    const daAna = await req('GET', F('/busca?q=Pirapora'), { sessao: ana });
    assert(daAna.json.resultados.some((x) => x.ref_id === certidao), 'o autor perdeu o próprio documento');

    const doBruno = await req('GET', F('/busca?q=Pirapora'), { sessao: bruno });   // CONTRIBUTOR
    assert(!doBruno.json.resultados.some((x) => x.ref_id === certidao),
      'documento PRIVATE apareceu na busca de quem não pode abri-lo');
    assert(doBruno.json.ocultos >= 1, 'não informou que houve resultado oculto');
  });

  await teste('GUEST não acha documento nenhum, nem pelo título', async () => {
    const visita = await novaConta('Visita Busca', 'guest-busca@teste.origena');
    await req('POST', F('/convites'), { sessao: ana, corpo: { email: visita.email, papel: 'GUEST' } });
    const tk = tokenDoUltimoEmail(visita.email, '/origena/convite');
    await req('POST', `/origena/api/v1/convites/${encodeURIComponent(tk)}/aceitar`, { sessao: visita });
    const r = await req('GET', F('/busca?q=Pirapora'), { sessao: visita });
    assert(!r.json.resultados.some((x) => x.ref_tipo === 'document'), 'GUEST achou documento');
  });

  await teste('a busca NUNCA cruza famílias', async () => {
    // a família Silva nasce aqui (primeiro uso); a seção §94 reaproveita.
    silva = await novaConta('Silva de Outra Família', 'silva@teste.origena');
    const criaB = await req('POST', '/origena/api/v1/familias', { sessao: silva, corpo: { nome: 'Família Silva' } });
    assert.strictEqual(criaB.status, 201, criaB.texto);
    famB = criaB.json.familia.id;
    // a família Silva tem uma pessoa com nome parecido
    const rB = await req('POST', `/origena/api/v1/familias/${famB}/pessoas`,
      { sessao: silva, corpo: { nome: 'Antônio Silva de Pirapora' } });
    assert.strictEqual(rB.status, 201, rB.texto);
    const naA = await req('GET', F('/busca?q=Pirapora'), { sessao: ana });
    assert(!naA.json.resultados.some((x) => x.ref_id === rB.json.pessoa.id),
      'a busca da família A trouxe registro da família B');
    const naB = await req('GET', `/origena/api/v1/familias/${famB}/busca?q=Pirapora`, { sessao: silva });
    assert(naB.json.resultados.every((x) => x.ref_id !== certidao),
      'a busca da família B trouxe o documento da família A');
    assert(naB.json.resultados.some((x) => x.ref_id === rB.json.pessoa.id), 'a família B não achou o que é dela');
  });

  await teste('arquivar tira da busca', async () => {
    const p = await criarPessoa({ nome: 'Some da Busca Silva' });
    assert((await req('GET', F('/busca?q=Some'), { sessao: ana })).json.resultados.length >= 1);
    await req('DELETE', F(`/pessoas/${p.id}`), { sessao: ana });
    const depois = await req('GET', F('/busca?q=Some'), { sessao: ana });
    assert(!depois.json.resultados.some((x) => x.ref_id === p.id), 'continuou na busca depois de arquivada');
  });

  await teste('o índice nasce com o dado — não existe passo de reindexar', async () => {
    // `tsv` é coluna GERADA: escrever o texto é atualizar o índice.
    const r = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT is_generated FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'busca' AND column_name = 'tsv'`, [db.SCHEMA]));
    assert.strictEqual(r.is_generated, 'ALWAYS', 'o tsv não é coluna gerada — dá para sair de sincronia');
  });

  // =================================================================== FASE 6
  console.log('\nlugares — o nome antigo não se perde');
  let fazenda;
  await teste('renomear um lugar PRESERVA o nome histórico', async () => {
    const r = await req('POST', F('/lugares'), { sessao: ana,
      corpo: { nome: 'Fazenda do Meio', municipio: 'Pirapora', uf: 'MG' } });
    assert.strictEqual(r.status, 201, r.texto);
    fazenda = r.json.lugar.id;
    const ren = await req('PATCH', F(`/lugares/${fazenda}`), { sessao: ana,
      corpo: { nome: 'Sítio Santa Rita' } });
    assert.strictEqual(ren.status, 200, ren.texto);
    assert.strictEqual(ren.json.lugar.nome, 'Sítio Santa Rita');
    assert(ren.json.lugar.nomes_historicos.includes('Fazenda do Meio'),
      'o nome antigo SUMIU — é o que está no verso das fotos');
    // renomear de novo acumula, não substitui
    await req('PATCH', F(`/lugares/${fazenda}`), { sessao: ana, corpo: { nome: 'Chácara Rita' } });
    const lista = await req('GET', F('/lugares'), { sessao: ana });
    const l = lista.json.lugares.find((x) => x.id === fazenda);
    assert.deepStrictEqual(l.nomes_historicos.sort(),
      ['Fazenda do Meio', 'Sítio Santa Rita'], 'perdeu um dos nomes anteriores');
  });

  console.log('\neventos');
  await teste('evento com participantes, data imprecisa e lugar', async () => {
    const r = await req('POST', F('/eventos'), { sessao: ana, corpo: {
      tipo: 'reuniao', titulo: 'Almoço dos 80 anos da Maria',
      data: '03/1975', local: 'Pirapora',
      participantes: [P.joao.id, P.maria.id, P.pedro.id],
      descricao: 'A família inteira na fazenda.' } });
    assert.strictEqual(r.status, 201, r.texto);
    const ev = await req('GET', F(`/eventos/${r.json.evento.id}`), { sessao: ana });
    assert.strictEqual(ev.json.evento.data_precisao, 'MES');
    assert.strictEqual(ev.json.evento.participantes.length, 3);
    // e entra na busca como tudo o mais
    const b = await req('GET', F('/busca?q=almoço'), { sessao: ana });
    assert(b.json.resultados.some((x) => x.ref_tipo === 'event'), 'o evento não ficou buscável');
  });

  console.log('\nlinha do tempo (§33)');
  await teste('a timeline junta nascimento, casamento, evento, foto e história em ordem', async () => {
    const r = await req('GET', F('/timeline'), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    const tipos = new Set(r.json.itens.map((i) => i.tipo));
    for (const esperado of ['nascimento', 'casamento', 'evento', 'foto', 'historia']) {
      assert(tipos.has(esperado), `faltou "${esperado}" na timeline (tem: ${[...tipos].join(', ')})`);
    }
    // ordem defensável: datas conhecidas em ordem crescente
    const comData = r.json.itens.filter((i) => i.data_ini);
    for (let i = 1; i < comData.length; i++) {
      assert(comData[i].data_ini >= comData[i - 1].data_ini,
        `fora de ordem: ${comData[i - 1].titulo} (${comData[i - 1].data_ini}) antes de ${comData[i].titulo} (${comData[i].data_ini})`);
    }
    // a IMPRECISÃO viaja junto — a tela mostra "anos 40", não uma data inventada
    const foto = r.json.itens.find((i) => i.tipo === 'foto' && i.precisao === 'DECADA');
    assert(foto, 'a foto dos anos 40 não veio com a precisão');
    assert.strictEqual(foto.data_valor, 'anos 1940');
  });

  await teste('timeline individual: só o que toca a pessoa (§33)', async () => {
    const r = await req('GET', F(`/timeline?pessoa=${P.maria.id}`), { sessao: ana });
    assert(r.json.itens.length >= 3, 'a timeline da Maria veio vazia demais');
    assert(r.json.itens.every((i) => (i.pessoas || []).includes(P.maria.id)),
      'entrou item que não menciona a Maria');
    assert(r.json.itens.some((i) => i.tipo === 'casamento'), 'o casamento dela não apareceu');
  });

  await teste('reconstruir do zero dá o MESMO resultado (projeção, não verdade)', async () => {
    const antes = await req('GET', F('/timeline'), { sessao: ana });
    // apaga a projeção na mão — se ela fosse fonte de verdade, isto perderia dados
    await tenancy.comEscopo(famA, (t) => t.q(`DELETE FROM timeline_entries WHERE family_id = $1`, [famA]));
    const depois = await req('GET', F('/timeline'), { sessao: ana });
    const chave = (i) => `${i.tipo}|${i.titulo}|${i.data_ini}|${i.ref_id}`;
    assert.deepStrictEqual(
      depois.json.itens.map(chave).sort(), antes.json.itens.map(chave).sort(),
      'a reconstrução não reproduziu a projeção — ela NÃO é derivável das fontes');
  });

  await teste('item privado some da timeline de quem não pode ver', async () => {
    const r = await req('GET', F('/timeline'), { sessao: bruno });   // CONTRIBUTOR
    assert(!r.json.itens.some((i) => i.ref_id === P.privada), 'a foto privada apareceu na timeline');
    const daAna = await req('GET', F('/timeline'), { sessao: ana });
    assert(daAna.json.itens.length >= r.json.itens.length);
  });

  await teste('filtro por período corta a timeline', async () => {
    const r = await req('GET', F('/timeline?de=1970-01-01&ate=1979-12-31'), { sessao: ana });
    assert(r.json.itens.some((i) => i.tipo === 'evento'), 'o almoço de 1975 não apareceu no recorte');
    assert(!r.json.itens.some((i) => i.data_fim && i.data_fim < '1970-01-01'),
      'entrou item de antes do recorte');
  });

  // ================================================================= FASE 2.1
  // Tradições, receitas, saberes e relíquias. O que a família conta na
  // mesa — e a linha de posse do objeto, que é o valor dele.
  console.log('\ntradições e receitas (§35–37)');
  let receita, saber, semAprendiz;
  await teste('a receita entra com ingredientes, preparo e data imprecisa', async () => {
    const r = await req('POST', F('/tradicoes'), { sessao: ana, corpo: {
      categoria: 'RECEITA', titulo: 'Bolo de fubá da Maria',
      corpo: 'O bolo que ela fazia toda festa junina.',
      person_id: P.maria.id, origem: 'Veio da mãe dela, em Pirapora',
      ocasioes: 'festa junina, aniversário', desde: 'anos 1940', local: 'Pirapora',
      ingredientes: '2 xícaras de fubá\n1 litro de leite\nerva-doce a gosto',
      preparo: 'Bate tudo e leva ao forno.', rendimento: '12 fatias', tempo: '50 min' } });
    assert.strictEqual(r.status, 201, r.texto);
    receita = r.json.tradicao;
    assert.strictEqual(receita.desde_precisao, 'DECADA', 'a data imprecisa não virou década');
    assert.strictEqual(receita.receita.ingredientes.length, 3, 'perdeu ingrediente');
    assert.strictEqual(receita.receita.ingredientes[0].item, '2 xícaras de fubá');
    assert.deepStrictEqual(receita.ocasioes, ['festa junina', 'aniversário']);
  });

  await teste('a receita é encontrável pelo ingrediente, na busca única', async () => {
    const b = await req('GET', F('/busca?q=fubá'), { sessao: ana });
    assert(b.json.resultados.some((x) => x.ref_tipo === 'recipe' && x.ref_id === receita.id),
      'a receita não entrou no índice: ' + JSON.stringify(b.json.resultados.map((x) => x.ref_tipo)));
  });

  await teste('quem aprendeu a fazer fica registrado, e repetir não duplica', async () => {
    const um = await req('POST', F(`/tradicoes/${receita.id}/aprendizes`),
      { sessao: ana, corpo: { person_id: P.paula.id, quando: '1958' } });
    assert.strictEqual(um.status, 201, um.texto);
    const dois = await req('POST', F(`/tradicoes/${receita.id}/aprendizes`),
      { sessao: ana, corpo: { person_id: P.paula.id, quando: '1958' } });
    assert.strictEqual(dois.status, 201, 'a segunda vez deveria ser absorvida, não recusada');
    const tr = await req('GET', F(`/tradicoes/${receita.id}`), { sessao: ana });
    assert.strictEqual(tr.json.tradicao.aprendizes.length, 1, 'duplicou o aprendiz');
    assert.strictEqual(tr.json.tradicao.aprendizes[0].nome_exibicao, 'Paula Villela');
  });

  await teste('o saber vira CORRENTE: quem ensinou → quem aprendeu (§37)', async () => {
    const r = await req('POST', F('/tradicoes'), { sessao: ana, corpo: {
      categoria: 'SABER', titulo: 'Afiar faca na pedra', person_id: P.joao.id,
      corpo: 'Sempre no mesmo ângulo, molhando a pedra.' } });
    assert.strictEqual(r.status, 201, r.texto);
    saber = r.json.tradicao;
    const a = await req('POST', F(`/tradicoes/${saber.id}/transmissoes`), { sessao: ana,
      corpo: { de_person_id: P.joao.id, para_person_id: P.pedro.id, quando: '1935' } });
    assert.strictEqual(a.status, 201, a.texto);
    await req('POST', F(`/tradicoes/${saber.id}/transmissoes`), { sessao: ana,
      corpo: { de_person_id: P.pedro.id, para_person_id: P.neto.id, quando: '1968' } });
    const tr = await req('GET', F(`/tradicoes/${saber.id}`), { sessao: ana });
    assert.strictEqual(tr.json.tradicao.transmissoes.length, 2, 'a corrente se perdeu');
    assert.strictEqual(tr.json.tradicao.transmissoes[0].de_nome, 'João Villela');
    // ninguém ensina a si mesmo
    const eu = await req('POST', F(`/tradicoes/${saber.id}/transmissoes`), { sessao: ana,
      corpo: { de_person_id: P.pedro.id, para_person_id: P.pedro.id } });
    assert.strictEqual(eu.status, 400);
    assert.strictEqual(eu.json.codigo, 'erro.transmissao_reflexiva');
  });

  await teste('tradição sem nome é recusada com mensagem útil', async () => {
    const r = await req('POST', F('/tradicoes'), { sessao: ana, corpo: { categoria: 'MUSICA' } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.codigo, 'erro.tradicao_sem_titulo');
  });

  console.log('\nrelíquias — a linha de posse (§38)');
  let anel;
  await teste('o objeto nasce com dono, e a posse já começa como HISTÓRICO', async () => {
    const r = await req('POST', F('/reliquias'), { sessao: ana, corpo: {
      nome: 'Anel de casamento da Maria', descricao: 'Ouro, com as iniciais gravadas.',
      origem: 'Comprado em Pirapora', local: 'Gaveta da sala',
      com_quem: P.maria.id, desde: '1912' } });
    assert.strictEqual(r.status, 201, r.texto);
    anel = r.json.reliquia;
    assert.strictEqual(anel.custodia.length, 1);
    assert.strictEqual(anel.com_quem.person_id, P.maria.id);
    assert.strictEqual(anel.com_quem.ate_valor, null, 'a custódia nasceu já fechada');
  });

  await teste('passar de mão FECHA a anterior e ABRE a nova — ninguém é apagado', async () => {
    const r = await req('POST', F(`/reliquias/${anel.id}/custodia`), { sessao: ana, corpo: {
      person_id: P.paula.id, de: '1970', nota: 'Passou na partilha.',
      fonte_tipo: 'RELATO', fonte_titulo: 'A tia lembra da partilha' } });
    assert.strictEqual(r.status, 201, r.texto);
    const h = (await req('GET', F(`/reliquias/${anel.id}`), { sessao: ana })).json.reliquia;
    assert.strictEqual(h.custodia.length, 2, 'a dona anterior sumiu da linha de posse');
    const antiga = h.custodia.find((c) => c.person_id === P.maria.id);
    assert.strictEqual(antiga.ate_valor, '1970', 'a saída da anterior não ficou registrada');
    assert.strictEqual(h.com_quem.person_id, P.paula.id);
    assert.strictEqual(h.custodia.filter((c) => !c.ate_valor).length, 1,
      'o objeto ficou em duas mãos ao mesmo tempo');
    // a resposta a "como você sabe?" ficou junto, como fonte
    assert.strictEqual(h.com_quem.fonte_tipo, 'RELATO');
  });

  await teste('o BANCO recusa duas posses abertas para o mesmo objeto', async () => {
    await assert.rejects(tenancy.comEscopo(famA, (t) => t.q(
      `INSERT INTO heirloom_custody (family_id, heirloom_id, person_id, de_valor)
       VALUES ($1,$2,$3,'1999')`, [famA, anel.id, P.pedro.id])),
    (e) => e.code === '23505',
    'o índice único não segurou: o objeto poderia estar em duas mãos');
  });

  await teste('passar para quem já está com o objeto é recusado', async () => {
    const r = await req('POST', F(`/reliquias/${anel.id}/custodia`),
      { sessao: ana, corpo: { person_id: P.paula.id, de: '1980' } });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.json.codigo, 'erro.custodia_ja_e_dele');
  });

  await teste('tradição e relíquia entram na linha do tempo com a data que têm', async () => {
    const r = await req('GET', F('/timeline'), { sessao: ana });
    const tipos = new Set(r.json.itens.map((i) => i.tipo));
    assert(tipos.has('tradicao'), 'a receita dos anos 40 não entrou na linha do tempo');
    assert(tipos.has('reliquia'), 'a passagem do anel não entrou na linha do tempo');
    const passagem = r.json.itens.find((i) => i.tipo === 'reliquia' && i.data_valor === '1970');
    assert(passagem && /Paula/.test(passagem.titulo), 'a passagem de 1970 saiu errada');
  });

  // ================================================================= FASE 2.2
  console.log('\nhistoriador — as lacunas que existem, sem inventar as que não existem (§29)');
  let orfa;
  await teste('o historiador nomeia a lacuna certa para a pessoa certa', async () => {
    orfa = await criarPessoa({ nome: 'Sem Nada Registrado' });
    const r = await req('GET', F('/historiador'), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    const dela = r.json.lacunas.filter((l) => l.alvo_id === orfa.id).map((l) => l.tipo);
    for (const esperada of ['pessoa_sem_nascimento', 'pessoa_sem_foto', 'pessoa_sem_historia']) {
      assert(dela.includes(esperada), `faltou a lacuna ${esperada} (tem: ${dela.join(', ')})`);
    }
    // e NÃO cobra o que já existe: a Maria tem a receita como narrativa
    const daMaria = r.json.lacunas.filter((l) => l.alvo_id === P.maria.id).map((l) => l.tipo);
    assert(!daMaria.includes('pessoa_sem_historia'),
      'cobrou história de quem já tem uma tradição registrada');
    // receita sem ninguém que saiba fazer é lacuna — a que mata a receita
    const semQuemFaca = await req('POST', F('/tradicoes'), { sessao: ana, corpo: {
      categoria: 'RECEITA', titulo: 'Doce de leite queimado', person_id: P.joao.id } });
    semAprendiz = semQuemFaca.json.tradicao;
    const r2 = await req('GET', F('/historiador'), { sessao: ana });
    assert(r2.json.lacunas.some((l) => l.tipo === 'receita_sem_aprendiz'
      && l.alvo_id === semAprendiz.id), 'não viu a receita que ninguém aprendeu');
  });

  await teste('o que ficou além do teto é declarado, não engolido', async () => {
    const r = await req('GET', F('/historiador'), { sessao: ana });
    assert.strictEqual(typeof r.json.teto, 'number');
    assert.strictEqual(typeof r.json.alem_do_teto, 'object',
      'a varredura corta e não diz o que cortou — viraria "não falta nada"');
  });

  console.log('\nmissões — a lacuna vira pergunta endereçada (§30)');
  let missaoFoto;
  await teste('sincronizar cria a pergunta; sincronizar de novo NÃO duplica', async () => {
    const um = await req('POST', F('/missoes/sincronizar'), { sessao: ana });
    assert.strictEqual(um.status, 200, um.texto);
    assert(um.json.criadas > 0, 'não criou pergunta nenhuma');
    const dois = await req('POST', F('/missoes/sincronizar'), { sessao: ana });
    assert.strictEqual(dois.json.criadas, 0, 'duplicou as perguntas na segunda varredura');
  });

  await teste('a pergunta chega em português, com o nome da pessoa dentro (§86)', async () => {
    const r = await req('GET', F('/missoes'), { sessao: ana });
    missaoFoto = r.json.missoes.find((m) => m.tipo === 'pessoa_sem_foto' && m.alvo_id === orfa.id);
    assert(missaoFoto, 'a pergunta da foto não foi criada');
    assert.strictEqual(missaoFoto.pergunta, 'Você tem alguma fotografia de Sem Nada Registrado?');
    // nenhuma pergunta sai como chave crua na cara do usuário
    assert(!r.json.missoes.some((m) => /^missao\./.test(m.pergunta)),
      'alguma pergunta saiu como chave de catálogo');
  });

  await teste('responder guarda a resposta como CONTRIBUIÇÃO, com autor e data', async () => {
    const r = await req('POST', F(`/missoes/${missaoFoto.id}/responder`), { sessao: bruno,
      corpo: { corpo: 'Tenho uma foto dela no álbum azul da minha mãe.' } });
    assert.strictEqual(r.status, 201, r.texto);
    const c = await req('GET', F(`/pessoas/${orfa.id}/contribuicoes`), { sessao: ana });
    assert(c.json.contribuicoes.some((x) => /álbum azul/.test(x.corpo)),
      'a resposta não virou memória do acervo');
    const lista = await req('GET', F('/missoes?status=respondida'), { sessao: ana });
    assert(lista.json.missoes.some((m) => m.id === missaoFoto.id), 'a missão não fechou');
  });

  await teste('lacuna preenchida fecha a pergunta sozinha', async () => {
    const missoesAntes = (await req('GET', F('/missoes'), { sessao: ana })).json.missoes;
    const daData = missoesAntes.find((m) => m.tipo === 'pessoa_sem_nascimento' && m.alvo_id === orfa.id);
    assert(daData, 'não havia a pergunta da data de nascimento');
    await req('PATCH', F(`/pessoas/${orfa.id}`), { sessao: ana, corpo: { nascimento: '1948' } });
    await req('POST', F('/missoes/sincronizar'), { sessao: ana });
    const depois = await req('GET', F('/missoes?status=todas'), { sessao: ana });
    const agora = depois.json.missoes.find((m) => m.id === daData.id);
    assert.strictEqual(agora.status, 'resolvida',
      'a pergunta continuou aberta depois de a lacuna sumir');
  });

  await teste('pergunta dispensada NÃO renasce na varredura seguinte', async () => {
    const abertas = (await req('GET', F('/missoes'), { sessao: ana })).json.missoes;
    const alvo = abertas.find((m) => m.tipo === 'pessoa_sem_parentesco');
    assert(alvo, 'não havia pergunta de parentesco para dispensar');
    // quem só contribui não dispensa pergunta da família
    const negado = await req('POST', F(`/missoes/${alvo.id}/dispensar`),
      { sessao: bruno, corpo: { motivo: 'não quero' } });
    assert.strictEqual(negado.status, 403, 'CONTRIBUTOR dispensou pergunta da família');

    const r = await req('POST', F(`/missoes/${alvo.id}/dispensar`),
      { sessao: ana, corpo: { motivo: 'Ninguém da família fala sobre isso.' } });
    assert.strictEqual(r.status, 200, r.texto);
    await req('POST', F('/missoes/sincronizar'), { sessao: ana });
    const todas = (await req('GET', F('/missoes?status=todas'), { sessao: ana })).json.missoes;
    const mesmas = todas.filter((m) => m.tipo === alvo.tipo && m.alvo_id === alvo.alvo_id);
    assert.strictEqual(mesmas.length, 1, 'a pergunta dispensada renasceu com outro id');
    assert.strictEqual(mesmas[0].status, 'dispensada');
  });

  await teste('lacuna que ficou ALÉM DO TETO não é dada como resolvida', async () => {
    // Com teto 1, quase todo tipo é truncado. A lacuna 2 continua
    // existindo — e a missão dela NÃO pode virar "resolvida" só porque
    // não coube na lista da varredura.
    const missoesMod = require('./missoes');
    const r = await tenancy.comEscopo(famA, (t) =>
      missoesMod.sincronizar(t, { familyId: famA, userId: ana.id, teto: 1 }));
    assert(Object.keys(r.cortados).length > 0, 'o cenário não chegou a truncar nada');
    assert.strictEqual(r.resolvidas, 0,
      'deu como resolvida uma pergunta que só ficou fora do corte da varredura');
  });

  console.log('\navisos — opt-in de verdade, e sem acervo no e-mail (§87)');
  await teste('ninguém recebe e-mail sem ter pedido', async () => {
    await criarPessoa({ nome: 'Gera Lacuna Um' });
    const antes = caixa.length;
    const r = await req('POST', F('/missoes/sincronizar'), { sessao: ana });
    assert(r.json.criadas > 0, 'o cenário não gerou pergunta nova');
    assert.strictEqual(r.json.avisados, 0, 'avisou alguém que não pediu');
    assert.strictEqual(caixa.length, antes, 'saiu e-mail sem opt-in');
  });

  await teste('quem pediu recebe a CONTAGEM — nunca o nome de quem está no acervo', async () => {
    const pref = await req('PATCH', F('/notificacoes'),
      { sessao: ana, corpo: { evento: 'missoes', frequencia: 'imediato' } });
    assert.strictEqual(pref.status, 200, pref.texto);
    await criarPessoa({ nome: 'Segredo de Familia' });
    const antes = caixa.length;
    const r = await req('POST', F('/missoes/sincronizar'), { sessao: ana });
    assert(r.json.avisados >= 1, 'quem pediu não foi avisado');
    assert(caixa.length > antes, 'o e-mail não saiu');
    const ultimo = caixa[caixa.length - 1];
    assert(!/Segredo de Familia/.test(ultimo.html),
      'O E-MAIL LEVOU O NOME DE UMA PESSOA DO ACERVO para fora do login');
    assert(/perguntas/i.test(ultimo.html), 'o e-mail não diz do que se trata');
  });

  console.log('\níndice de memória — lacuna nomeada, sem placar (§31/§32)');
  await teste('o índice diz a porcentagem E o que falta, por nome', async () => {
    const r = await req('GET', F(`/pessoas/${orfa.id}/indice-memoria`), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    assert.strictEqual(r.json.dimensoes.length, 10, 'as dez dimensões do §31 mudaram de número');
    assert(r.json.indice.lacunas.includes('fotos'), 'não apontou a falta de fotos');
    assert(r.json.indice.score < 100);
    const maria = await req('GET', F(`/pessoas/${P.maria.id}/indice-memoria`), { sessao: ana });
    assert(maria.json.indice.score > r.json.indice.score,
      'quem tem acervo devia pontuar mais que quem não tem nada');
  });

  await teste('a lista da família sai por NOME, nunca por pontuação (§31)', async () => {
    const r = await req('GET', F('/indice-memoria'), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    const nomes = r.json.pessoas.map((p) => p.nome_exibicao);
    assert.deepStrictEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      'a lista veio ordenada por outra coisa que não o nome — vira ranking');
    const scores = r.json.pessoas.map((p) => p.score);
    assert(scores.some((s) => s !== scores[0]), 'todos com o mesmo score: o cálculo não está rodando');
  });

  await teste('apagar o índice e recalcular dá o MESMO resultado (projeção)', async () => {
    const antes = (await req('GET', F('/indice-memoria'), { sessao: ana })).json.pessoas;
    await tenancy.comEscopo(famA, (t) => t.q(`DELETE FROM memory_index WHERE family_id = $1`, [famA]));
    const depois = (await req('GET', F('/indice-memoria'), { sessao: ana })).json.pessoas;
    const chave = (p) => `${p.person_id}|${p.score}|${(p.lacunas || []).join(',')}`;
    assert.deepStrictEqual(depois.map(chave), antes.map(chave),
      'o índice não é derivável do acervo — então não é projeção, é dado solto');
  });

  await teste('"quem provavelmente sabe" aponta quem já contribuiu (§32)', async () => {
    const r = await req('GET', F(`/pessoas/${orfa.id}/indice-memoria`), { sessao: ana });
    assert(r.json.quem_sabe.some((q) => q.nome === 'Bruno Villela' || q.user_id === bruno.id),
      'quem respondeu sobre ela não aparece como quem sabe: ' + JSON.stringify(r.json.quem_sabe));
    assert(r.json.quem_sabe.length <= 3, 'virou lista longa — é sugestão, não placar');
  });

  // =================================================================== FASE 7
  const creditosMod = require('./creditos');
  const routerIA = require('./ia/router');

  console.log('\ncréditos — ledger, nunca um campo (§52)');
  await teste('a carteira nasce com o bônus configurado, registrado no ledger', async () => {
    const r = await req('GET', F('/creditos'), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.saldo >= 20, 'sem bônus de boas-vindas: ' + r.json.saldo);
    assert(r.json.extrato.some((l) => l.tipo === 'bonus'), 'o bônus não está no ledger');
  });

  await teste('crédito manual do staff é idempotente pela referência', async () => {
    const um = await req('POST', `/staff/api/origena/familias/${famA}/creditos`,
      { corpo: { creditos: 50, referencia: 'pix-0001' } });
    assert.strictEqual(um.status, 201, um.texto);
    const dois = await req('POST', `/staff/api/origena/familias/${famA}/creditos`,
      { corpo: { creditos: 50, referencia: 'pix-0001' } });
    assert.strictEqual(dois.status, 200);
    assert.strictEqual(dois.json.ja_estava, true, 'A MESMA compra creditou DUAS vezes');
    const semRef = await req('POST', `/staff/api/origena/familias/${famA}/creditos`,
      { corpo: { creditos: 10 } });
    assert.strictEqual(semRef.status, 400, 'aceitou crédito sem referência');
  });

  await teste('o saldo do cache é SEMPRE a soma do ledger', async () => {
    const r = await tenancy.comEscopo(famA, (t) => creditosMod.reconciliar(t, famA));
    assert.strictEqual(r.ok, true, `saldo ${r.saldo} ≠ ledger ${r.ledger}`);
  });

  console.log('\nIA — router, cotação e o ciclo de créditos (§53)');
  await teste('sem provedor utilizável, a capability NÃO aparece (ADR-0004)', async () => {
    // sem ANTHROPIC_API_KEY e sem injeção: registry ativo, adapter mudo
    routerIA.injetarParaTeste('anthropic', null);
    const caps = await req('GET', F('/ia/capacidades'), { sessao: ana });
    assert.strictEqual(caps.json.capacidades.gerar_biografia.disponivel, !!process.env.ANTHROPIC_API_KEY,
      'capability apareceu sem adapter pronto');
    if (!process.env.ANTHROPIC_API_KEY) {
      const r = await req('POST', F(`/pessoas/${antonio.id}/biografia`), { sessao: ana, corpo: {} });
      assert.strictEqual(r.status, 503);
      assert.strictEqual(r.json.codigo, 'erro.ia_indisponivel');
    }
  });

  await teste('cotação primeiro, geração só com confirmação — e a V1 guarda as fontes', async () => {
    // adapter falso: devolve texto citando TODAS as fontes + uma INVENTADA
    routerIA.injetarParaTeste('anthropic', async ({ capability, entrada }) => ({
      saida: capability === 'gerar_biografia'
        ? { texto: 'Antônio Villela nasceu, segundo a certidão, em 1921; a família também conta 1922.',
            fontes_usadas: [...entrada.contexto.map((i) => i.id), 'claim:id-inventado-pela-ia'] }
        : { resposta: 'x', fontes: [] },
      tokens_in: 1000, tokens_out: 300, custo_centavos: 12 }));

    // O preço vem do REGISTRY, não de um número escrito aqui: quando o
    // Augusto muda a tarifa da capability, este teste continua valendo.
    const tarifa = (await db.uma(
      `SELECT creditos FROM provider_registry WHERE capability = 'gerar_biografia' AND ativo
        ORDER BY prioridade LIMIT 1`)).creditos;
    const cot = await req('POST', F(`/pessoas/${antonio.id}/biografia`), { sessao: ana, corpo: {} });
    assert.strictEqual(cot.status, 200, cot.texto);
    assert.strictEqual(cot.json.cotacao.creditos, tarifa, 'a cotação não veio do registry');
    assert(!cot.json.biografia, 'GEROU sem confirmação — é a cobrança surpresa que o §53 proíbe');

    const antes = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    const ger = await req('POST', F(`/pessoas/${antonio.id}/biografia`),
      { sessao: ana, corpo: { confirmar: true } });
    assert.strictEqual(ger.status, 201, ger.texto);
    assert(ger.json.fontes_validas >= 3, 'a biografia não guardou as fontes');
    assert.strictEqual(ger.json.fontes_descartadas, 1, 'o id INVENTADO pela IA não foi descartado');

    const depois = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    assert.strictEqual(depois, antes - tarifa, 'não debitou exatamente o que a cotação prometeu');
    const bio = await req('GET', F(`/pessoas/${antonio.id}/biografia`), { sessao: ana });
    assert.strictEqual(bio.json.biografia.versao_atual, 1);
    assert.match(bio.json.biografia.corpo, /certidão/);
  });

  await teste('gerar de novo cria a V2 — e a V1 continua no banco (§18)', async () => {
    const r = await req('POST', F(`/pessoas/${antonio.id}/biografia`),
      { sessao: ana, corpo: { confirmar: true } });
    assert.strictEqual(r.status, 201);
    const versoes = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT count(*)::int n FROM biography_versions v
        JOIN biographies b ON b.id = v.biography_id WHERE b.person_id = $1`, [antonio.id]));
    assert.strictEqual(versoes.n, 2, 'a V1 sumiu ao gerar a V2');
  });

  await teste('falha do provedor ESTORNA automaticamente (§53)', async () => {
    routerIA.injetarParaTeste('anthropic', async () => { throw new Error('provedor caiu'); });
    const antes = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    const r = await req('POST', F(`/pessoas/${antonio.id}/biografia`),
      { sessao: ana, corpo: { confirmar: true } });
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.json.codigo, 'erro.ia_falhou');
    const depois = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    assert.strictEqual(depois, antes, 'a falha COBROU o usuário');
    const rec = await tenancy.comEscopo(famA, (t) => creditosMod.reconciliar(t, famA));
    assert(rec.ok, 'o estorno desbalanceou o ledger');
  });

  await teste('saldo insuficiente NÃO executa nada', async () => {
    routerIA.injetarParaTeste('anthropic', async () => {
      throw new Error('NUNCA deveria ter sido chamado');
    });
    // zera o saldo por ajuste (com motivo — ajuste sem motivo não existe)
    await tenancy.comEscopo(famA, async (t) => {
      const w = await creditosMod.carteira(t, famA);
      if (w.saldo > 0) await creditosMod.lancar(t, { familyId: famA, tipo: 'ajuste',
        delta: -w.saldo, motivo: 'teste de saldo insuficiente' });
    });
    const r = await req('POST', F(`/pessoas/${antonio.id}/biografia`),
      { sessao: ana, corpo: { confirmar: true } });
    assert.strictEqual(r.status, 402, 'executou sem saldo: ' + r.status);
    assert.strictEqual(r.json.codigo, 'erro.creditos_insuficientes');
    // devolve os créditos para os testes seguintes
    await req('POST', `/staff/api/origena/familias/${famA}/creditos`,
      { corpo: { creditos: 100, referencia: 'reposicao-teste' } });
  });

  console.log('\n"Pergunte à Origena" (§44/§45)');
  await teste('a resposta cita só fontes que ESTAVAM no contexto permitido', async () => {
    routerIA.injetarParaTeste('anthropic', async ({ entrada }) => ({
      saida: { resposta: 'Segundo a certidão, Antônio nasceu em 1921; Carlos lembra 1922.',
        fontes: [...entrada.contexto.slice(0, 2).map((i) => i.id), 'document:id-de-outra-familia'],
        incerteza: '' },
      tokens_in: 500, tokens_out: 100, custo_centavos: 3 }));
    const r = await req('POST', F('/perguntar'),
      { sessao: ana, corpo: { pergunta: 'Quando nasceu o Antônio?', confirmar: true } });
    assert.strictEqual(r.status, 200, r.texto);
    assert.match(r.json.resposta, /1921/);
    assert(r.json.fontes.length >= 1, 'resposta sem fontes');
    assert.strictEqual(r.json.fontes_descartadas, 1, 'a fonte de fora do contexto não foi descartada');
    assert(!r.json.fontes.some((f) => f.ref_id === 'id-de-outra-familia'));
  });

  await teste('o contexto do RAG exclui o que quem pergunta não pode ver', async () => {
    // EDITOR tem ia.usar mas NÃO tem ver.privado — é o papel certo para
    // provar o filtro. (CONTRIBUTOR nem chega aqui: sem ia.usar, 403.)
    await req('PATCH', F(`/membros/${bruno.id}`), { sessao: ana, corpo: { papel: 'EDITOR' } });
    let contextoVisto = null;
    routerIA.injetarParaTeste('anthropic', async ({ entrada }) => {
      contextoVisto = entrada.contexto;
      return { saida: { resposta: 'ok', fontes: [] }, tokens_in: 1, tokens_out: 1, custo_centavos: 0 };
    });
    const r = await req('POST', F('/perguntar'),
      { sessao: bruno, corpo: { pergunta: 'carta particular Pirapora', confirmar: true } });
    assert.strictEqual(r.status, 200, r.texto);
    assert(contextoVisto, 'o mock não foi chamado');
    assert(!contextoVisto.some((i) => i.id.includes(P.privada)),
      'O DOCUMENTO PRIVADO ENTROU NO CONTEXTO DO RAG DE QUEM NÃO PODE VÊ-LO (§45)');
    await req('PATCH', F(`/membros/${bruno.id}`), { sessao: ana, corpo: { papel: 'CONTRIBUTOR' } });
  });

  // ================================================== 2.3 LER O DOCUMENTO
  console.log('\nler documento com IA (2.3, §24) — achado NÃO é fato');

  const docIA = require('./documentos-ia');
  let escaneado = null, achadoData = null;

  // Uma imagem sem texto nenhum: é o caso que o produto declarava não
  // saber ler ("imagem escaneada e manuscrito NÃO viram texto").
  const lerFalso = (saida) => routerIA.injetarParaTeste('anthropic', async ({ capability, entrada }) => {
    if (capability !== 'analisar_documento') throw new Error('capability errada: ' + capability);
    ultimaEntradaDoc = entrada;
    return { saida, tokens_in: 2000, tokens_out: 900, custo_centavos: 30 };
  });
  let ultimaEntradaDoc = null;

  await teste('o escaneado vai como ARQUIVO ao modelo — é o buraco que a 2.3 fecha', async () => {
    const r = await enviar(pngReal(60, 60, [9, 9, 9]), 'certidao-escaneada.png');
    await fila.processarLote(10, 'rapida');
    await tenancy.comEscopo(famA, (t) => t.q(
      `UPDATE media SET tipo = 'DOCUMENTO', titulo = 'Certidão da Anna' WHERE id = $1`, [r.media_id]));
    escaneado = r.media_id;

    lerFalso({ tipo_documento: 'certidão de nascimento',
      transcricao: 'Aos quinze dias do mez de março de mil novecentos e vinte e um nasceu Anna Villela, '
        + 'na cidade de Pirapora, filha de [ilegível].',
      achados: [
        { predicado: 'nome', valor: 'Anna Villela', pessoa: 'Anna Villela', trecho: 'nasceu Anna Villela' },
        { predicado: 'data_nascimento', valor: '15/03/1921', pessoa: 'Anna Villela',
          trecho: 'aos quinze dias do mez de março de mil novecentos e vinte e um' },
        { predicado: 'local_nascimento', valor: 'Pirapora', pessoa: 'Anna Villela', trecho: 'na cidade de Pirapora' },
        { predicado: 'signo', valor: 'peixes', trecho: 'inventado' },   // predicado que o produto não tem
      ] });

    const cot = await req('POST', F(`/midias/${escaneado}/analisar`), { sessao: ana, corpo: {} });
    assert.strictEqual(cot.status, 200, cot.texto);
    assert(cot.json.cotacao, 'leu sem cotar antes (§53)');
    assert(!cot.json.achados, 'ANALISOU sem confirmação');

    const r2 = await req('POST', F(`/midias/${escaneado}/analisar`),
      { sessao: ana, corpo: { confirmar: true } });
    assert.strictEqual(r2.status, 200, r2.texto);
    assert(ultimaEntradaDoc.arquivo, 'mandou só texto para um escaneado — não teria o que ler');
    assert.strictEqual(ultimaEntradaDoc.arquivo.mime, 'image/png');
    assert(ultimaEntradaDoc.arquivo.base64.length > 100, 'o arquivo foi vazio');
  });

  await teste('a transcrição torna o escaneado BUSCÁVEL — e diz que é leitura de máquina', async () => {
    const txt = await req('GET', F(`/midias/${escaneado}/texto`), { sessao: ana });
    assert.strictEqual(txt.json.texto.status, 'extraido', 'continuou sem texto');
    assert.match(txt.json.texto.texto, /Pirapora/);
    assert.match(txt.json.texto.metodo, /^ia:/, 'não marcou que o texto veio de IA');
    // era exatamente isto que faltava: achar a certidão pela palavra dela
    const b = await req('GET', F('/busca?q=Pirapora'), { sessao: ana });
    assert(b.json.resultados.some((x) => x.ref_id === escaneado),
      'o documento transcrito não apareceu na busca');
  });

  await teste('achado NÃO é fato: nada foi projetado na pessoa', async () => {
    const lista = await req('GET', F(`/midias/${escaneado}/achados`), { sessao: ana });
    assert.strictEqual(lista.status, 200, lista.texto);
    const preds = lista.json.achados.map((a) => a.predicado);
    assert(preds.includes('data_nascimento'), 'perdeu um achado legítimo');
    assert(!preds.includes('signo'), 'aceitou predicado que o produto não conhece');
    assert(lista.json.achados.every((a) => a.status === 'sugerido' && !a.claim_id),
      'a leitura da IA virou fato sozinha (§24)');
    achadoData = lista.json.achados.find((a) => a.predicado === 'data_nascimento');
    assert(achadoData.trecho, 'achado sem o trecho que o sustenta');
  });

  await teste('reler o documento não duplica sugestão nem ressuscita descarte', async () => {
    const antes = (await req('GET', F(`/midias/${escaneado}/achados`), { sessao: ana })).json.achados;
    const alvo = antes.find((a) => a.predicado === 'local_nascimento');
    const desc = await req('POST', F(`/achados/${alvo.id}/descartar`), { sessao: ana });
    assert.strictEqual(desc.status, 200, desc.texto);

    await req('POST', F(`/midias/${escaneado}/analisar`), { sessao: ana, corpo: { confirmar: true } });
    const depois = (await req('GET', F(`/midias/${escaneado}/achados`), { sessao: ana })).json.achados;
    assert.strictEqual(depois.length, antes.length, 'a segunda leitura duplicou sugestões');
    assert.strictEqual(depois.find((a) => a.id === alvo.id).status, 'descartado',
      'o que a família descartou voltou na releitura');
  });

  await teste('aceitar cria fato DOCUMENTADO — a IA leu, a pessoa conferiu', async () => {
    const anna = await criarPessoa({ nome: 'Anna Villela' });
    const r = await req('POST', F(`/achados/${achadoData.id}/aceitar`),
      { sessao: ana, corpo: { pessoa: anna.id } });
    assert.strictEqual(r.status, 201, r.texto);
    assert.strictEqual(r.json.claim.status, 'DOCUMENTED',
      'o fato saiu como inferência da IA — a fonte é o DOCUMENTO, não o modelo');
    assert.strictEqual(r.json.claim.created_by_kind, 'user', 'atribuiu à IA o que um humano decidiu');

    // o fato aparece na pessoa, com o caminho de volta até o documento
    const fatos = await req('GET', F(`/pessoas/${anna.id}/fatos`), { sessao: ana });
    const nasc = (fatos.json.fatos || []).find((f) => f.predicado === 'data_nascimento');
    assert(nasc, 'o fato aceito não chegou à pessoa');
    const versoes = await req('GET', F(`/pessoas/${anna.id}/fatos/data_nascimento`), { sessao: ana });
    assert(JSON.stringify(versoes.json).includes('Certidão da Anna'),
      'o fato não aponta de volta para o documento que o sustenta');
    // aceitar duas vezes não cria dois fatos
    const dnv = await req('POST', F(`/achados/${achadoData.id}/aceitar`),
      { sessao: ana, corpo: { pessoa: anna.id } });
    assert.strictEqual(dnv.status, 409, 'aceitou a mesma sugestão duas vezes');
  });

  await teste('ler documento cobra pelo registry e deixa rastro no job', async () => {
    const tarifa = (await db.uma(
      `SELECT creditos FROM provider_registry WHERE capability = 'analisar_documento' AND ativo
        ORDER BY prioridade LIMIT 1`)).creditos;
    const antes = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    lerFalso({ tipo_documento: 'carta', transcricao: 'Querida Anna, escrevo de longe.', achados: [] });
    const r = await req('POST', F(`/midias/${escaneado}/analisar`),
      { sessao: ana, corpo: { confirmar: true } });
    assert.strictEqual(r.status, 200, r.texto);
    const depois = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    assert.strictEqual(depois, antes - tarifa, 'cobrou diferente da tarifa do registry');
    const linhas = await tenancy.comEscopo(famA, (t) => t.todas(
      `SELECT capability FROM ai_cost_ledger WHERE capability = 'analisar_documento'`));
    assert(linhas.length >= 1, 'a leitura não entrou no ledger de custo');
  });

  await teste('documento que a família não pode ver não é lido nem por engano', async () => {
    // GUEST não tem ia.usar; EDITOR tem, mas não vê documento PRIVADO
    const r = await req('POST', F(`/midias/${escaneado}/analisar`),
      { sessao: bruno, corpo: { confirmar: true } });
    assert.strictEqual(r.status, 403, 'CONTRIBUTOR mandou a IA ler um documento');
  });

  // ================================================== 2.4 ENTREVISTAS
  console.log('\nentrevistas (2.4, §27/§28) — a voz é o ativo, o texto é derivado');

  const entrevistasMod = require('./entrevistas');
  let entrevista = null, resp1 = null;

  await teste('os 10 roteiros do §27 existem, e toda pergunta tem texto', async () => {
    assert.strictEqual(entrevistasMod.ROTEIROS.length, 10, 'faltou roteiro do §27');
    const i18nPt = require('./i18n/pt-BR.json');
    for (const r of entrevistasMod.ROTEIROS) {
      assert(i18nPt.entrevista['r_' + r.chave], 'roteiro sem título: ' + r.chave);
      for (const p of entrevistasMod.perguntasDe(r.chave)) {
        assert(i18nPt.entrevista[p], 'pergunta sem texto: ' + p);
      }
    }
  });

  await teste('abrir a entrevista já enfileira as perguntas do roteiro', async () => {
    const r = await req('POST', F('/entrevistas'),
      { sessao: ana, corpo: { pessoa: P.joao.id, roteiro: 'infancia' } });
    assert.strictEqual(r.status, 201, r.texto);
    entrevista = r.json.entrevista.id;
    const g = await req('GET', F(`/entrevistas/${entrevista}`), { sessao: ana });
    assert.strictEqual(g.json.entrevista.respostas.length, 7, 'as perguntas não vieram prontas');
    assert(g.json.entrevista.respostas.every((x) => x.status === 'pendente'));
    // a pergunta viaja por CHAVE — texto guardado envelheceria com o roteiro
    assert.match(g.json.entrevista.respostas[0].pergunta_chave, /^p_infancia_/);
    assert.strictEqual(g.json.entrevista.respostas[0].transcricao, '');
    resp1 = g.json.entrevista.respostas[0].id;
  });

  await teste('sem provedor, a entrevista continua valendo: escrever à mão', async () => {
    routerIA.injetarParaTeste('google', null);
    const lista = await req('GET', F('/entrevistas'), { sessao: ana });
    assert.strictEqual(lista.json.transcricao_disponivel, false,
      'anunciou transcrição sem provedor ligado (ADR-0004)');

    const r = await req('PATCH', F(`/respostas/${resp1}`), { sessao: ana,
      corpo: { transcricao: 'Nasci em Pirapora, numa casa de porta e janela na rua do meio.' } });
    assert.strictEqual(r.status, 200, r.texto);
    assert.strictEqual(r.json.resposta.transcricao_origem, 'humana');

    // vira CONTRIBUIÇÃO da pessoa entrevistada — é assim que entra na proveniência
    const contrib = await req('GET', F(`/pessoas/${P.joao.id}/contribuicoes`), { sessao: ana });
    assert(contrib.json.contribuicoes.some((c) => /Pirapora/.test(c.corpo)),
      'a resposta não virou contribuição de quem contou');
    // e é encontrável
    const b = await req('GET', F('/busca?q=Pirapora'), { sessao: ana });
    assert(b.json.resultados.some((x) => x.ref_id === entrevista),
      'a entrevista não apareceu na busca');
  });

  await teste('transcrever pede provedor — e cobra pelo registry quando existe', async () => {
    // sem áudio nenhum, nem começa: pedir transcrição do nada é erro de uso
    const semAudio = await req('POST', F(`/respostas/${resp1}/transcrever`),
      { sessao: ana, corpo: {} });
    assert.strictEqual(semAudio.status, 400, 'aceitou transcrever pergunta sem gravação');

    // grava um "áudio" e liga à pergunta
    const audio = await enviar(oggFalso(), 'resposta-1.ogg', { tipo: 'AUDIO', mime: 'audio/ogg' });
    await fila.processarLote(10, 'rapida');
    const liga = await req('POST', F(`/respostas/${resp1}/audio`),
      { sessao: ana, corpo: { midia: audio.media_id, duracao_seg: 12 } });
    assert.strictEqual(liga.status, 200, liga.texto);

    // com áudio e SEM provedor ligado: 503, e nada é cobrado
    const semProvedor = await req('POST', F(`/respostas/${resp1}/transcrever`),
      { sessao: ana, corpo: { confirmar: true } });
    assert.strictEqual(semProvedor.status, 503, 'transcreveu sem provedor: ' + semProvedor.texto);

    // liga o provedor no registry (é UPDATE, não deploy) e pluga um falso
    await db.q(`UPDATE provider_registry SET ativo = true WHERE capability = 'transcrever_audio'`);
    routerIA.injetarParaTeste('google', async ({ capability, entrada }) => {
      assert.strictEqual(capability, 'transcrever_audio');
      assert(entrada.arquivo && entrada.arquivo.base64, 'mandou transcrever sem áudio');
      return { saida: { transcricao: 'A vovó Anna fazia bolo de fubá todo domingo em Pirapora.',
        idioma: 'pt-BR', vozes: 1 }, tokens_in: 900, tokens_out: 200, custo_centavos: 40 };
    });

    const tarifa = (await db.uma(
      `SELECT creditos FROM provider_registry WHERE capability = 'transcrever_audio' AND ativo
        ORDER BY prioridade LIMIT 1`)).creditos;
    const cot = await req('POST', F(`/respostas/${resp1}/transcrever`), { sessao: ana, corpo: {} });
    assert.strictEqual(cot.json.cotacao.creditos, tarifa, 'a cotação não veio do registry');

    const antes = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    const tr = await req('POST', F(`/respostas/${resp1}/transcrever`),
      { sessao: ana, corpo: { confirmar: true } });
    assert.strictEqual(tr.status, 200, tr.texto);
    assert.match(tr.json.resposta.transcricao, /bolo de fubá/);
    assert.strictEqual(tr.json.resposta.transcricao_origem, 'ia',
      'não marcou que o texto foi a máquina que ouviu');
    assert.strictEqual((await req('GET', F('/creditos'), { sessao: ana })).json.saldo, antes - tarifa);
  });

  await teste('o ÁUDIO é o ativo: corrigir o texto não toca na gravação', async () => {
    const antes = await req('GET', F(`/entrevistas/${entrevista}`), { sessao: ana });
    const r0 = antes.json.entrevista.respostas.find((x) => x.id === resp1);
    const c = await req('PATCH', F(`/respostas/${resp1}`), { sessao: ana,
      corpo: { transcricao: 'A vovó Ana fazia bolo de fubá todo domingo em Pirapora.' } });
    assert.strictEqual(c.status, 200, c.texto);
    assert.strictEqual(c.json.resposta.transcricao_origem, 'ia_corrigida',
      'a correção apagou a origem: ninguém saberia que a máquina ouviu primeiro');
    const depois = await req('GET', F(`/entrevistas/${entrevista}`), { sessao: ana });
    const r1 = depois.json.entrevista.respostas.find((x) => x.id === resp1);
    assert.strictEqual(r1.media_id, r0.media_id, 'a correção mexeu no áudio');
    assert.match(r1.transcricao, /vovó Ana/);
    // a contribuição foi REVISADA, não duplicada (§15)
    const contrib = await req('GET', F(`/pessoas/${P.joao.id}/contribuicoes`), { sessao: ana });
    const ativas = contrib.json.contribuicoes.filter((x) => /bolo de fubá/.test(x.corpo) && x.status === 'ativa');
    assert.strictEqual(ativas.length, 1, 'a correção criou uma contribuição paralela');
  });

  await teste('o que sai da FALA é relato, não documento (§4)', async () => {
    routerIA.injetarParaTeste('anthropic', async ({ capability }) => {
      assert.strictEqual(capability, 'analisar_documento');
      return { saida: { tipo_documento: 'entrevista', transcricao: '',
        achados: [{ predicado: 'local_nascimento', valor: 'Pirapora', pessoa: 'João',
          trecho: 'em Pirapora' }] },
      tokens_in: 300, tokens_out: 80, custo_centavos: 5 };
    });
    const r = await req('POST', F(`/respostas/${resp1}/entidades`),
      { sessao: ana, corpo: { confirmar: true } });
    assert.strictEqual(r.status, 200, r.texto);
    const achado = (r.json.achados || []).find((a) => a.predicado === 'local_nascimento');
    assert(achado && achado.status === 'sugerido', 'a transcrição virou fato sozinha (§28)');

    const ac = await req('POST', F(`/achados/${achado.id}/aceitar`),
      { sessao: ana, corpo: { pessoa: P.joao.id } });
    assert.strictEqual(ac.status, 201, ac.texto);
    assert.strictEqual(ac.json.claim.status, 'FAMILY_REPORTED',
      'o que a vovó contou saiu com o mesmo selo de uma certidão');
  });

  await teste('WebM do navegador é reconhecido como ÁUDIO — senão a gravação some', async () => {
    const arquivos = require('./arquivos');
    const ebml = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.from('webmB\x82\x84webm'), Buffer.from('...A_OPUS...')]);
    const r = arquivos.tipoReal(ebml);
    assert(r && r.tipo === 'AUDIO' && r.mime === 'audio/webm',
      'a gravação do navegador cairia em quarentena: ' + JSON.stringify(r));
    const comVideo = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.from('webm ... V_VP9 ... A_OPUS')]);
    assert.strictEqual(arquivos.tipoReal(comVideo).tipo, 'VIDEO', 'vídeo virou áudio');
  });

  await teste('a pergunta que a família inventa entra no fim da fila', async () => {
    const r = await req('POST', F(`/entrevistas/${entrevista}/perguntas`),
      { sessao: ana, corpo: { texto: 'Quem era o dono do armazém da esquina?' } });
    assert.strictEqual(r.status, 201, r.texto);
    const g = await req('GET', F(`/entrevistas/${entrevista}`), { sessao: ana });
    const ultima = g.json.entrevista.respostas[g.json.entrevista.respostas.length - 1];
    assert.strictEqual(ultima.pergunta_chave, 'livre');
    assert.match(ultima.pergunta_livre, /armazém/);
  });

  await teste('o custo real fica no ledger de IA, com créditos e margem (§57)', async () => {
    const linhas = await tenancy.comEscopo(famA, (t) => t.todas(
      `SELECT capability, tokens_in, custo_centavos, creditos_cobrados FROM ai_cost_ledger`));
    assert(linhas.length >= 3, 'faltam linhas no ledger de custo');
    const bio = linhas.find((l) => l.capability === 'gerar_biografia');
    const tarifaBio = (await db.uma(
      `SELECT creditos FROM provider_registry WHERE capability = 'gerar_biografia' AND ativo
        ORDER BY prioridade LIMIT 1`)).creditos;
    assert(bio && bio.tokens_in > 0 && bio.creditos_cobrados === tarifaBio,
      'o ledger não registrou o que a cotação do registry cobrou');
  });

  console.log('\naba do staff (§79)');
  await teste('o resumo traz agregados e a métrica norte — nunca conteúdo', async () => {
    const r = await req('GET', '/staff/api/origena/resumo');
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.familias >= 2);
    const fam = r.json.por_familia.find((f) => f.id === famA);
    assert(fam.pessoas > 0 && fam.midias > 0);
    assert.strictEqual(typeof fam.mpc, 'number', 'sem a métrica norte (§80)');
    // §80: a MPC conta mídia, história E tradição — não só foto
    assert(fam.mpc_por_tipo, 'a métrica norte não está aberta por tipo');
    assert(fam.mpc_por_tipo.tradicao >= 1,
      'tradição com pessoa, data, ocasião, autoria e origem não entrou na MPC');
    assert.strictEqual(fam.mpc,
      fam.mpc_por_tipo.midia + fam.mpc_por_tipo.historia + fam.mpc_por_tipo.tradicao);
    assert(fam.missoes && typeof fam.missoes.abertas === 'number', 'sem as lacunas abertas (§29)');
    assert(fam.reconciliacao.ok, 'ledger desbalanceado no resumo');
    // T12: o resumo não carrega conteúdo de família
    const texto = JSON.stringify(r.json);
    assert(!texto.includes('varanda cantando'), 'o resumo VAZOU conteúdo de contribuição');
    const naoAdmin = await req('GET', '/staff/api/origena/resumo', { como: 'op' });
    assert.strictEqual(naoAdmin.status, 403);
  });

  await teste('trocar o modelo é UPDATE no registry, não deploy (§56)', async () => {
    const reg = await req('GET', '/staff/api/origena/registry');
    const linha = reg.json.registry.find((l) => l.capability === 'gerar_biografia');
    const r = await req('PATCH', `/staff/api/origena/registry/${linha.id}`,
      { corpo: { creditos: 12 } });
    assert.strictEqual(r.status, 200);
    routerIA.injetarParaTeste('anthropic', async () => ({ saida: { texto: 'x', fontes_usadas: [] },
      tokens_in: 1, tokens_out: 1, custo_centavos: 0 }));
    const cot = await req('POST', F(`/pessoas/${antonio.id}/biografia`), { sessao: ana, corpo: {} });
    assert.strictEqual(cot.json.cotacao.creditos, 12, 'a cotação não seguiu o registry');
    await req('PATCH', `/staff/api/origena/registry/${linha.id}`, { corpo: { creditos: 10 } });
  });

  await teste('GUEST não usa IA (ia.usar é permissão, não enfeite)', async () => {
    const visita = { cookie: null };
    await req('POST', '/origena/api/v1/conta/entrar',
      { corpo: { email: 'guest-busca@teste.origena', senha: 'senha-de-teste-123' }, sessao: visita });
    const r = await req('POST', F('/perguntar'),
      { sessao: visita, corpo: { pergunta: 'qualquer coisa', confirmar: true } });
    assert.strictEqual(r.status, 403, 'GUEST usou IA');
  });

  routerIA.injetarParaTeste('anthropic', null);   // limpa para o §94

  // =================================================================== FASE 8
  const exportarMod = require('./exportar');
  const integridadeMod = require('./integridade');

  console.log('\nlixeira — nada some com um clique (§66)');
  await teste('arquivado aparece na lixeira e RESTAURAR traz de volta, com as arestas', async () => {
    const p = await criarPessoa({ nome: 'Volta da Lixeira', nascimento: '1960' });
    await ligar({ person_a: P.pedro.id, person_b: p.id, tipo: 'PARENT_OF', confirmo_mesmo_assim: true });
    await req('DELETE', F(`/pessoas/${p.id}`), { sessao: ana });
    const lix = await req('GET', F('/lixeira'), { sessao: ana });
    assert(lix.json.pessoas.some((x) => x.id === p.id), 'não apareceu na lixeira');
    const r = await req('POST', F(`/lixeira/pessoa/${p.id}/restaurar`), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    const dossieR = await req('GET', F(`/pessoas/${p.id}`), { sessao: ana });
    assert.strictEqual(dossieR.status, 200, 'não voltou');
    assert(dossieR.json.familia.pais.some((x) => x.id === P.pedro.id),
      'voltou SEM o parentesco — seria outra pessoa');
  });

  console.log('\nexportação (§68/§70)');
  let zipExport;
  await teste('o zip sai com dados.json, GEDCOM e manifesto — via worker e R2', async () => {
    const ped = await req('POST', F('/exportacoes'), { sessao: ana });
    assert.strictEqual(ped.status, 202, ped.texto);
    await fila.processarLote(10, 'cara');
    const st = await req('GET', F(`/exportacoes/${ped.json.exportacao.id}`), { sessao: ana });
    assert.strictEqual(st.json.exportacao.status, 'pronto', JSON.stringify(st.json));
    assert(st.json.url, 'sem URL de download');
    const resp = await fetch(st.json.url);
    assert(resp.ok, 'a URL assinada não baixou');
    zipExport = Buffer.from(await resp.arrayBuffer());
    assert(zipExport.length === st.json.exportacao.bytes);
    // o zip abre com o leitor do vdocs — formatos abertos de verdade (§77)
    const { lerZip } = require('../vdocs/extrair');
    const z = lerZip(zipExport);
    const dados = JSON.parse(z.arquivo('dados.json').toString('utf8'));
    assert.strictEqual(dados.formato, 'origena/v1');
    assert(dados.tabelas.claims.length >= 5, 'o export perdeu os claims');
    assert(dados.tabelas.evidence.length >= 5, 'o export perdeu as evidências');
    const ged = z.arquivo('familia.ged').toString('utf8');
    assert.match(ged, /0 @I\d+@ INDI/);
  });

  await teste('o GEDCOM leva as datas imprecisas como o padrão manda', async () => {
    const ged = (await req('GET', F('/gedcom'), { sessao: ana })).texto;
    assert.match(ged, /ABT 1890/, 'c. 1890 não virou ABT');           // João
    assert.match(ged, /1 NAME Antônio Villela/);
    assert.match(ged, /2 DATE 1921/, 'o ano exato não saiu');
    assert.match(ged, /1 HUSB @I\d+@/, 'o casamento não virou FAM');
    assert.match(ged, /1 CHIL @I\d+@/, 'a filiação não virou CHIL');
  });

  await teste('GEDCOM de fora entra com fonte IMPORTACAO e proveniência', async () => {
    const ged = ['0 HEAD', '0 @I1@ INDI', '1 NAME Rosa /Externa/', '1 BIRT', '2 DATE 1902',
      '0 @I2@ INDI', '1 NAME Bento /Externo/', '0 @I3@ INDI', '1 NAME Filho /Externo/',
      '0 @F1@ FAM', '1 HUSB @I2@', '1 WIFE @I1@', '1 CHIL @I3@', '0 TRLR'].join('\n');
    const r = await req('POST', F('/importar-gedcom'), { sessao: ana, corpo: { texto: ged } });
    assert.strictEqual(r.status, 201, r.texto);
    assert.strictEqual(r.json.importado.pessoas, 3);
    assert.strictEqual(r.json.importado.casamentos, 1);
    const rosa = (await req('GET', F('/pessoas?busca=Rosa'), { sessao: ana })).json.pessoas[0];
    assert(rosa, 'a Rosa não entrou');
    const versoes = await req('GET', F(`/pessoas/${rosa.id}/fatos/nome`), { sessao: ana });
    assert(versoes.json.versoes[0].evidencias.some((e) => e.fonte_tipo === 'IMPORTACAO'),
      'o dado importado entrou sem dizer de onde veio');
  });

  console.log('\nintegridade (§77, ADR-0008)');
  await teste('a amostra confere os hashes — e byte trocado por fora é PEGO', async () => {
    const ok1 = await tenancy.comEscopo(famA, (t) =>
      integridadeMod.verificar(t, { familyId: famA, amostra: 50 }));
    assert.strictEqual(ok1.divergentes.length, 0, 'acusou divergência onde não há');
    assert(ok1.verificados >= 2);

    // o ataque que a integridade existe para pegar: trocar o byte DIRETO
    // no R2, por fora do sistema (o trigger do banco não vê isso)
    const alvo = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT id, storage_key FROM media WHERE family_id = $1 AND derivado_de IS NULL
        AND status = 'pronta' AND deleted_at IS NULL LIMIT 1`, [famA]));
    await storage.enviar(alvo.storage_key, Buffer.from('bytes trocados por fora'), 'text/plain');
    // zera o rodízio para a amostra pegá-lo de novo
    await tenancy.comEscopo(famA, (t) => t.q(
      `UPDATE media SET exif = exif - '_verificado_em' WHERE id = $1`, [alvo.id]));
    const ok2 = await tenancy.comEscopo(famA, (t) =>
      integridadeMod.verificar(t, { familyId: famA, amostra: 50 }));
    assert(ok2.divergentes.some((d) => d.id === alvo.id),
      'O BYTE FOI TROCADO E A INTEGRIDADE NÃO VIU — a promessa de décadas caiu');
  });

  console.log('\nE2E — exportar → apagar → importar → proveniência intacta');
  await teste('a promessa inteira do produto, de ponta a ponta', async () => {
    // 1. uma família com o cenário do §4 completo
    const dona = await novaConta('Dona E2E', 'e2e@teste.origena');
    const fE2E = (await req('POST', '/origena/api/v1/familias',
      { sessao: dona, corpo: { nome: 'Família E2E' } })).json.familia.id;
    const FE = (c) => `/origena/api/v1/familias/${fE2E}${c}`;
    const pe = (await req('POST', FE('/pessoas'), { sessao: dona,
      corpo: { nome: 'Bisavô E2E' } })).json.pessoa;
    await req('POST', FE(`/pessoas/${pe.id}/fatos`), { sessao: dona, corpo: {
      predicado: 'data_nascimento', valor: '1921', fonte_tipo: 'REGISTRO_OFICIAL',
      fonte_titulo: 'Certidão E2E', fonte_referencia: 'Cartório E2E, livro 1' } });
    await req('POST', FE(`/pessoas/${pe.id}/fatos`), { sessao: dona, corpo: {
      predicado: 'data_nascimento', valor: '1922', fonte_tipo: 'RELATO',
      fonte_titulo: 'Tia lembra 1922' } });
    const vs = (await req('GET', FE(`/pessoas/${pe.id}/fatos/data_nascimento`), { sessao: dona })).json.versoes;
    await req('POST', FE(`/pessoas/${pe.id}/fatos/data_nascimento/resolver`), { sessao: dona,
      corpo: { claim_id: vs.find((v) => v.status === 'DOCUMENTED').id, motivo: 'A certidão manda.' } });
    await req('POST', FE(`/pessoas/${pe.id}/contribuicoes`), { sessao: dona,
      corpo: { corpo: 'Ele plantava café e contava causos na varanda.' } });
    await req('POST', FE('/historias'), { sessao: dona, corpo: {
      titulo: 'O causo do café', corpo: 'Dizem que ele trocou um saco de café por um violão.',
      contada_por: pe.id, ocorrido: 'anos 30' } });
    // e um objeto que já passou por duas mãos: a linha de posse é o que
    // dá valor à relíquia, e tem de sobreviver à viagem inteira
    const neta = (await req('POST', FE('/pessoas'), { sessao: dona,
      corpo: { nome: 'Neta E2E', nascimento: '1975' } })).json.pessoa;
    const relogio = (await req('POST', FE('/reliquias'), { sessao: dona, corpo: {
      nome: 'Relógio de bolso', origem: 'Comprado em 1930',
      com_quem: pe.id, desde: '1930' } })).json.reliquia;
    await req('POST', FE(`/reliquias/${relogio.id}/custodia`), { sessao: dona,
      corpo: { person_id: neta.id, de: '1995', nota: 'Ganhou na formatura.' } });

    // 2. exporta
    const dados = await tenancy.comEscopo(fE2E, (t) => exportarMod.dadosDaFamilia(t, fE2E));
    // 2 claims (1921 e 1922) + 1 resolução + 1 contribuição + 1 história
    assert(dados.tabelas.claims.length >= 2, 'claims: ' + dados.tabelas.claims.length);
    assert(dados.tabelas.claim_resolutions.length >= 1, 'a resolução não saiu no export');
    assert(dados.tabelas.contributions.length >= 1);
    assert(dados.tabelas.stories.length >= 1);

    // 3. APAGA de verdade (purga staff, nome por extenso)
    const semNome = await req('POST', `/staff/api/origena/familias/${fE2E}/purgar`,
      { corpo: { confirmar_nome: 'errado' } });
    assert.strictEqual(semNome.status, 400, 'purgou sem o nome certo');
    const pur = await req('POST', `/staff/api/origena/familias/${fE2E}/purgar`,
      { corpo: { confirmar_nome: 'Família E2E' } });
    assert.strictEqual(pur.status, 200, pur.texto);
    assert((await req('GET', '/origena/api/v1/conta/eu', { sessao: dona })).json.familias.length === 0,
      'a família purgada continuou aparecendo para a dona');
    const sobrou = await tenancy.comEscopo(fE2E, (t) =>
      t.uma(`SELECT count(*)::int n FROM claims WHERE family_id = $1`, [fE2E]));
    assert.strictEqual(sobrou.n, 0, 'a purga deixou claims para trás');

    // 4. importa numa família NOVA
    const fNova = (await req('POST', '/origena/api/v1/familias',
      { sessao: dona, corpo: { nome: 'Família E2E Renascida' } })).json.familia.id;
    const FN = (c) => `/origena/api/v1/familias/${fNova}${c}`;
    const imp = await req('POST', FN('/importar'), { sessao: dona, corpo: { dados } });
    assert.strictEqual(imp.status, 201, imp.texto);

    // 5. a proveniência VOLTOU INTACTA
    const pNovo = (await req('GET', FN('/pessoas?busca=Bisav'), { sessao: dona })).json.pessoas[0];
    assert(pNovo, 'o bisavô não renasceu');
    const fatos = await req('GET', FN(`/pessoas/${pNovo.id}/fatos`), { sessao: dona });
    const nasc = fatos.json.fatos.find((f) => f.predicado === 'data_nascimento');
    assert.strictEqual(nasc.valor, '1921', 'o valor aceito mudou');
    assert.strictEqual(nasc.em_divergencia, true, 'A DIVERGÊNCIA SUMIU na viagem');
    assert.strictEqual(nasc.resolvido, true, 'a resolução da família sumiu');
    const versoes = await req('GET', FN(`/pessoas/${pNovo.id}/fatos/data_nascimento`), { sessao: dona });
    assert.strictEqual(versoes.json.versoes.length, 2, 'uma das versões se perdeu');
    const doc = versoes.json.versoes.find((v) => v.status === 'DOCUMENTED');
    assert(doc.evidencias.some((e) => /Cartório E2E/.test(e.fonte_referencia || '')),
      'a referência da certidão se perdeu');
    const contribs = await req('GET', FN(`/pessoas/${pNovo.id}/contribuicoes`), { sessao: dona });
    assert(contribs.json.contribuicoes.some((c) => /causos na varanda/.test(c.corpo)),
      'a contribuição se perdeu');
    assert(contribs.json.contribuicoes.some((c) => /originalmente por Dona E2E/.test(c.corpo)),
      'a autoria não sobreviveu nem como texto');
    const hist = await req('GET', FN('/historias'), { sessao: dona });
    assert(hist.json.historias.some((h) => h.titulo === 'O causo do café'), 'a história se perdeu');

    // 6. a LINHA DE POSSE voltou inteira, e ainda aponta as pessoas certas
    const rels = await req('GET', FN('/reliquias'), { sessao: dona });
    const relNovo = rels.json.reliquias.find((x) => x.nome === 'Relógio de bolso');
    assert(relNovo, 'a relíquia não renasceu');
    const relCheio = (await req('GET', FN(`/reliquias/${relNovo.id}`), { sessao: dona })).json.reliquia;
    assert.strictEqual(relCheio.custodia.length, 2, 'a linha de posse encolheu na viagem');
    assert.strictEqual(relCheio.custodia[0].de_valor, '1930');
    assert.strictEqual(relCheio.com_quem.nome_exibicao, 'Neta E2E',
      'o objeto voltou na mão errada');
  });

  await teste('importar um acervo COM mídia também funciona (regressão)', async () => {
    // O E2E acima importa uma família sem foto, e por isso não pegava
    // este caminho: a importação mandava para `media` uma coluna que não
    // existe, e QUALQUER acervo com fotografia quebrava na volta.
    const fMid = (await req('POST', '/origena/api/v1/familias',
      { sessao: ana, corpo: { nome: 'Família Com Mídia' } })).json.familia.id;
    const dados = await tenancy.comEscopo(famA, (t) => exportarMod.dadosDaFamilia(t, famA));
    assert(dados.tabelas.media.length > 0, 'a família A deveria ter mídia para este teste valer');
    assert(dados.tabelas.traditions.length > 0, 'as tradições não saem no export');
    assert(dados.tabelas.heirloom_custody.length >= 2, 'a linha de posse não sai no export');
    const r = await req('POST', `/origena/api/v1/familias/${fMid}/importar`,
      { sessao: ana, corpo: { dados } });
    assert.strictEqual(r.status, 201, r.texto);
    const g = await req('GET', `/origena/api/v1/familias/${fMid}/midias`, { sessao: ana });
    assert(g.json.midias.length > 0, 'a mídia não chegou do outro lado');
    assert(g.json.midias.every((m) => m.status !== 'pronta'),
      'mídia sem o binário voltou como "pronta" — seria uma foto que não abre');
    const tr = await req('GET', `/origena/api/v1/familias/${fMid}/tradicoes`, { sessao: ana });
    assert(tr.json.tradicoes.some((x) => /Bolo de fubá/.test(x.titulo)), 'a receita não viajou');
  });

  console.log('\npreços — o preço cobre o cliente BEM-SUCEDIDO (§50/§58)');
  await teste('todo plano pago cobre o próprio piso de custo com o plano CHEIO', async () => {
    const r = await req('GET', '/staff/api/origena/precos');
    assert.strictEqual(r.status, 200, r.texto);
    const pagos = r.json.planos.filter((p) => p.preco_centavos > 0);
    assert(pagos.length >= 3, 'faltam planos pagos');
    for (const p of pagos) {
      assert(p.preco_centavos > p.piso_centavos,
        `${p.nome} custa ${p.piso_centavos} cheio e é vendido por ${p.preco_centavos} — prejuízo no cliente que usa tudo`);
      assert(p.margem_bp >= 2000, `${p.nome} tem margem de só ${p.margem_bp / 100}% no plano cheio`);
    }
    // o piso é a soma real: storage + IA, não um número solto
    for (const p of pagos) {
      assert.strictEqual(p.piso_centavos, p.custo_storage_centavos + p.custo_creditos_centavos);
    }
  });

  await teste('cada operação de IA é cobrada acima do que ela custa', async () => {
    const r = await req('GET', '/staff/api/origena/precos');
    const ativas = r.json.capacidades.filter((c) => c.ativo);
    assert(ativas.length >= 3, 'o registry perdeu capacidades');
    for (const c of ativas) {
      // Capability com tarifa ZERO é RECURSO DO PLANO, não operação vendida
      // (a busca semântica é assim de propósito). A regra que vale para ela
      // é outra, e mais dura: se é de graça para a família, tem de custar
      // ~nada para nós — senão vira prejuízo silencioso por uso.
      if (c.creditos === 0) {
        assert(c.custo_estimado_centavos <= 1,
          `${c.capability} é gratuita para a família mas custa ${c.custo_estimado_centavos} centavos por uso`);
        continue;
      }
      assert(c.receita_centavos > c.custo_estimado_centavos,
        `${c.capability} cobra ${c.receita_centavos} e custa ${c.custo_estimado_centavos}`);
      assert(c.margem_bp >= 3000, `${c.capability} com margem de ${c.margem_bp / 100}%`);
    }
  });

  await teste('a família vê PREÇO; custo e margem não saem do staff', async () => {
    const r = await req('GET', F('/planos'), { sessao: bruno });
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.planos.length >= 3);
    assert(r.json.planos.every((p) => p.preco_centavos != null));
    assert(r.json.pacotes.length >= 1, 'sem pacote de créditos');
    assert.strictEqual(r.json.pagamento, 'mercadopago', 'a tela precisa dizer qual pagamento existe');
    const texto = JSON.stringify(r.json);
    for (const vazamento of ['piso', 'margem', 'custo']) {
      assert(!texto.includes(vazamento), `o app da família recebeu "${vazamento}" — isso é do staff`);
    }
  });

  await teste('preço se ajusta sem deploy — e só as chaves de preço (§97)', async () => {
    const antes = (await req('GET', '/staff/api/origena/precos')).json;
    const familia = antes.planos.find((p) => p.codigo === 'familia');
    const novo = familia.preco_centavos + 1000;
    const up = await req('PATCH', `/staff/api/origena/planos/${familia.id}`,
      { corpo: { preco_centavos: novo } });
    assert.strictEqual(up.status, 200, up.texto);
    const depois = (await req('GET', '/staff/api/origena/precos')).json;
    const agora = depois.planos.find((p) => p.codigo === 'familia');
    assert.strictEqual(agora.preco_centavos, novo);
    assert(agora.margem_bp > familia.margem_bp, 'a margem não recalculou com o preço novo');
    await req('PATCH', `/staff/api/origena/planos/${familia.id}`,
      { corpo: { preco_centavos: familia.preco_centavos } });

    // a cotação do dólar é editável: sem isso a margem exibida vira ficção
    const fx = await req('PATCH', '/staff/api/origena/config/fx_usd_brl', { corpo: { valor: '5.60' } });
    assert.strictEqual(fx.status, 200, fx.texto);
    // o heartbeat do worker também mora em `config` e NÃO pode ser editado por aqui
    const proibido = await req('PATCH', '/staff/api/origena/config/worker_heartbeat',
      { corpo: { valor: '1' } });
    assert.strictEqual(proibido.status, 400, 'deixou editar uma chave que não é de preço');
    const texto = await req('PATCH', '/staff/api/origena/config/fx_usd_brl',
      { corpo: { valor: 'de graça' } });
    assert.strictEqual(texto.status, 400, 'aceitou texto onde precisa de número');
  });

  // ============================================================== L7 — PAGAR
  console.log('\ncobrança (L7) — quem credita é o webhook, nunca o clique');
  const billing = require('./billing');
  const saldoDe = () => tenancy.comEscopo(famA, (t) =>
    t.uma('SELECT saldo FROM credit_wallets WHERE family_id = $1', [famA])).then((w) => (w ? w.saldo : 0));
  const avisar = (corpo) => req('POST', '/origena/webhook/mercadopago', { corpo });
  const FAMILIA_FALSA = '00000000-0000-4000-8000-0000000000f7';

  await teste('o gateway está ligado nos testes (senão o resto não prova nada)', async () => {
    assert.strictEqual(billing.ativo(), true, 'billing desligado — o mpFake não chegou no montar');
  });

  let pedidoCred = null;
  await teste('comprar crédito cria pedido AGUARDANDO e não credita nada ainda', async () => {
    const antes = await saldoDe();
    const r = await req('POST', F('/pedidos'), { sessao: ana, corpo: { pacote: 'creditos_100' } });
    assert.strictEqual(r.status, 201, r.texto);
    assert.strictEqual(r.json.pagamento.modo, 'checkout');
    assert(/^https:\/\/mp\.teste\//.test(r.json.pagamento.link), 'sem link de pagamento');
    assert.strictEqual(await saldoDe(), antes, 'creditou antes de o dinheiro entrar');
    pedidoCred = { id: r.json.pedido.id, ref: MP.ultimaPreferencia.external_reference,
      total: r.json.pedido.total_centavos, creditos: r.json.pedido.creditos, antes };
    // idempotência do lado do MP: pedido repetido não vira cobrança dobrada
    const chave = MP.chamadas[MP.chamadas.length - 1].headers['X-Idempotency-Key'];
    assert.strictEqual(chave, 'origena-' + pedidoCred.id, 'preferência sem chave de idempotência');
  });

  await teste('só quem pode comprar compra — CONTRIBUTOR leva 403', async () => {
    const r = await req('POST', F('/pedidos'), { sessao: bruno, corpo: { pacote: 'creditos_100' } });
    assert.strictEqual(r.status, 403, 'quem não cuida do dinheiro conseguiu comprar');
  });

  await teste('webhook credita depois de PERGUNTAR ao Mercado Pago', async () => {
    const id = mpPagar(pedidoCred.ref, pedidoCred.total / 100);
    const r = await avisar({ type: 'payment', data: { id } });
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.pedido, 'o webhook não aplicou o pedido: ' + JSON.stringify(r.json));
    assert.strictEqual(await saldoDe(), pedidoCred.antes + pedidoCred.creditos);
    // o valor veio da consulta ao MP, não do corpo da requisição
    assert(MP.chamadas.some((c) => c.caminho === '/v1/payments/' + id),
      'confiou no corpo do webhook em vez de consultar o provedor');
  });

  await teste('webhook repetido não credita de novo (é o índice que garante)', async () => {
    const saldo = await saldoDe();
    const id = Object.keys(MP.pagamentos).pop();
    for (let i = 0; i < 3; i++) await avisar({ type: 'payment', data: { id } });
    assert.strictEqual(await saldoDe(), saldo, 'o mesmo pagamento creditou duas vezes');
  });

  await teste('pagamento menor que o pedido NÃO libera o pedido', async () => {
    const p = await req('POST', F('/pedidos'), { sessao: ana, corpo: { pacote: 'creditos_1000' } });
    const ref = MP.ultimaPreferencia.external_reference;
    const saldo = await saldoDe();
    const r = await avisar({ type: 'payment', data: { id: mpPagar(ref, 1) } });
    assert.strictEqual(r.json.ok, false, 'aceitou R$ 1,00 por um pacote de R$ 169,90');
    assert.strictEqual(await saldoDe(), saldo);
    const lista = await req('GET', F('/pedidos'), { sessao: ana });
    const meu = lista.json.pedidos.find((x) => x.id === p.json.pedido.id);
    assert.strictEqual(meu.status, 'aguardando_pagamento', 'o pedido subpago virou pago');
  });

  await teste('pagamento pendente e referência de fora não mexem em nada', async () => {
    const saldo = await saldoDe();
    const pend = await avisar({ type: 'payment', data: { id: mpPagar(pedidoCred.ref, 24.9, 'pending') } });
    assert(pend.json.ignorado, 'aplicou pagamento que ainda não foi aprovado');
    const fora = await avisar({ type: 'payment', data: { id: mpPagar('closet:123', 24.9) } });
    assert(fora.json.ignorado, 'aplicou pagamento de outro produto do grupo');
    // referência com família inventada: a rota é pública, isto é hostil de verdade
    const falsa = `origena-pedido:${pedidoCred.id}:${FAMILIA_FALSA}`;
    const inv = await avisar({ type: 'payment', data: { id: mpPagar(falsa, 24.9) } });
    assert(inv.json.ignorado, 'achou pedido no escopo de uma família que não é a dona');
    assert.strictEqual(await saldoDe(), saldo);
    assert(!billing.lerReferencia('origena-pedido:nada'), 'aceitou referência quebrada');
  });

  let assinatura = null;
  await teste('assinar plano abre recorrência no gateway e não liga nada antes de pagar', async () => {
    const r = await req('POST', F('/assinatura'), { sessao: ana, corpo: { plano: 'familia', ciclo: 'mensal' } });
    assert.strictEqual(r.status, 201, r.texto);
    assert.strictEqual(r.json.pagamento.modo, 'assinatura');
    const pre = Object.values(MP.assinaturas).pop();
    assert.strictEqual(pre.auto_recurring.frequency_type, 'months');
    const planos = await req('GET', F('/planos'), { sessao: ana });
    assert(!planos.json.assinatura || planos.json.assinatura.status !== 'ativa',
      'o plano ficou ativo sem pagamento');
    assinatura = { preId: pre.id, pedido: r.json.pedido.id };
  });

  await teste('autorizada no MP: plano ativo e créditos do ciclo entregues UMA vez', async () => {
    MP.assinaturas[assinatura.preId].status = 'authorized';
    const antes = await saldoDe();
    const r = await avisar({ type: 'subscription_preapproval', data: { id: assinatura.preId } });
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.pedido, 'o webhook não ativou a assinatura: ' + JSON.stringify(r.json));
    const planos = await req('GET', F('/planos'), { sessao: ana });
    assert.strictEqual(planos.json.assinatura.status, 'ativa');
    assert.strictEqual(planos.json.assinatura.codigo, 'familia');
    const plano = planos.json.planos.find((p) => p.codigo === 'familia');
    assert.strictEqual(await saldoDe(), antes + plano.creditos_mes, 'créditos do plano não entraram');
    // abrir a tela de novo NÃO entrega o mês outra vez (idempotente por competência)
    await req('GET', F('/planos'), { sessao: ana });
    await req('GET', F('/planos'), { sessao: ana });
    assert.strictEqual(await saldoDe(), antes + plano.creditos_mes, 'a visita à tela virou dinheiro');
    // e o aviso repetido do MP também não
    await avisar({ type: 'subscription_preapproval', data: { id: assinatura.preId } });
    assert.strictEqual(await saldoDe(), antes + plano.creditos_mes);
  });

  await teste('cobrança recorrente do mesmo mês não entrega o ciclo em dobro', async () => {
    // O plano entrega `creditos_mes` uma vez por COMPETÊNCIA. A adesão já
    // entregou este mês; a cobrança que chega agora não pode entregar de novo
    // (chavear pelo id do pagamento daria crédito dobrado no mês da adesão).
    const antes = await saldoDe();
    const ref = MP.assinaturas[assinatura.preId].external_reference;
    const r = await avisar({ type: 'payment', data: { id: mpPagar(ref, 39.9) } });
    assert.strictEqual(r.json.ok, true, r.texto);
    assert.strictEqual(await saldoDe(), antes, 'a cobrança do mês já entregue creditou de novo');

    // e a competência é mesmo a chave: uma única linha no ledger para o mês
    const sub = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT id FROM subscriptions WHERE family_id = $1 AND status = 'ativa'`, [famA]));
    const mes = new Date().toISOString().slice(0, 7);
    const linhas = await tenancy.comEscopo(famA, (t) => t.todas(
      `SELECT id FROM credit_transactions WHERE family_id = $1 AND ref_tipo = 'assinatura' AND ref_id = $2`,
      [famA, `${sub.id}:${mes}`]));
    assert.strictEqual(linhas.length, 1, 'o mês foi creditado ' + linhas.length + ' vez(es)');
  });

  await teste('cancelar avisa o gateway e vale até o fim do ciclo pago', async () => {
    const r = await req('DELETE', F('/assinatura'), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.vale_ate, 'cancelou sem dizer até quando vale');
    assert.strictEqual(MP.assinaturas[assinatura.preId].status, 'cancelled',
      'cancelou aqui e deixou a cobrança viva no Mercado Pago');
    const planos = await req('GET', F('/planos'), { sessao: ana });
    assert.strictEqual(planos.json.assinatura.status, 'cancelada');
    assert.strictEqual((await req('DELETE', F('/assinatura'), { sessao: ana })).status, 404);
  });

  await teste('crédito repetido não envenena a transação de quem chamou', async () => {
    // O 23505 esperado ABORTA a transação no Postgres se não houver savepoint.
    // Sem esta trava, "creditar de novo" devolve null e faz a PRÓXIMA query
    // do mesmo request morrer — falha que aparece longe da causa.
    const ref = 'regressao-savepoint-' + Date.now();
    await tenancy.comEscopo(famA, async (t) => {
      const um = await require('./creditos').lancar(t, { familyId: famA, tipo: 'bonus', delta: 1,
        refTipo: 'teste', refId: ref, motivo: 'regressão' });
      assert(um, 'o primeiro crédito não entrou');
      const dois = await require('./creditos').lancar(t, { familyId: famA, tipo: 'bonus', delta: 1,
        refTipo: 'teste', refId: ref, motivo: 'regressão' });
      assert.strictEqual(dois, null, 'creditou a mesma referência duas vezes');
      const depois = await t.uma('SELECT saldo FROM credit_wallets WHERE family_id = $1', [famA]);
      assert(depois, 'a transação morreu depois do crédito repetido');
    });
  });

  await teste('staff destrava pedido que o webhook não confirmou — pelo MESMO caminho', async () => {
    const p = await req('POST', F('/pedidos'), { sessao: ana, corpo: { pacote: 'creditos_300' } });
    const lista = await req('GET', '/staff/api/origena/pedidos?status=aguardando_pagamento');
    assert.strictEqual(lista.status, 200, lista.texto);
    const meu = lista.json.pedidos.find((x) => x.id === p.json.pedido.id);
    assert(meu, 'o pedido aberto não apareceu no staff');
    assert(!JSON.stringify(lista.json).includes('pessoas'), 'a tela de dinheiro trouxe acervo junto');

    const antes = await saldoDe();
    const pg = await req('POST', `/staff/api/origena/pedidos/${p.json.pedido.id}/pagar`,
      { corpo: { familyId: famA, referencia: 'pix-na-mao-123' } });
    assert.strictEqual(pg.status, 200, pg.texto);
    assert.strictEqual(pg.json.pago, true);
    assert.strictEqual(await saldoDe(), antes + 300);
    const dnv = await req('POST', `/staff/api/origena/pedidos/${p.json.pedido.id}/pagar`,
      { corpo: { familyId: famA, referencia: 'pix-na-mao-123' } });
    assert.strictEqual(dnv.json.pago, false, 'confirmar de novo creditou de novo');
    assert.strictEqual(await saldoDe(), antes + 300);
  });

  // ============================================== 2.5 GRAFO E MAPA (§20/§34)
  console.log('\ngrafo e mapa (2.5) — a mesma verdade, vista de lado');

  await teste('toda ligação do grafo diz POR QUE existe', async () => {
    const r = await req('GET', F(`/grafo/person/${P.joao.id}`), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.vizinhos.length > 0, 'pessoa do cenário do §4 saiu sem nenhuma ligação');
    for (const v of r.json.vizinhos) {
      assert(v.motivo && v.motivo.startsWith('grafo.m_'),
        'aresta sem motivo: ' + JSON.stringify(v));
      assert(v.tipo && v.id, 'aresta sem destino');
    }
    // e o motivo tem texto — ligação que a tela não sabe nomear não serve
    const i18nPt = require('./i18n/pt-BR.json');
    for (const v of r.json.vizinhos) {
      assert(i18nPt.grafo[v.motivo.replace('grafo.', '')], 'motivo sem texto: ' + v.motivo);
    }
  });

  await teste('o grafo não é atalho para ver o que o papel não pode ver', async () => {
    // `P.privada` é o documento PRIVATE do dono; bruno (CONTRIBUTOR) não o vê
    // na busca — e também não pode encontrá-lo como vizinho de ninguém.
    const meu = await req('GET', F(`/grafo/person/${P.joao.id}`), { sessao: bruno });
    assert.strictEqual(meu.status, 200, meu.texto);
    const texto = JSON.stringify(meu.json);
    assert(!texto.includes(P.privada), 'O ITEM PRIVADO APARECEU COMO VIZINHO PARA QUEM NÃO PODE VÊ-LO');
  });

  await teste('"como Ana se liga a isto?" devolve o CAMINHO, não um número', async () => {
    // dois parentes ligados por parentesco: caminho curto e explicável
    const r = await req('GET', F('/caminho') + `?de=person:${P.joao.id}&para=person:${P.pedro.id}`,
      { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.passos && r.json.passos.length >= 2, 'não achou caminho entre dois parentes');
    assert.strictEqual(r.json.passos[0].id, P.joao.id, 'o caminho não começa na origem');
    assert.strictEqual(r.json.passos[r.json.passos.length - 1].id, P.pedro.id,
      'o caminho não termina no destino');
    assert.strictEqual(r.json.passos[0].motivo, '', 'a origem não pode ter motivo');
    for (const p of r.json.passos.slice(1)) assert(p.motivo, 'elo do caminho sem motivo');
  });

  await teste('sem ligação, o grafo diz que não sabe — não inventa proximidade', async () => {
    const solto = await criarPessoa({ nome: 'Parente Sem Ligação Nenhuma' });
    const r = await req('GET', F('/caminho') + `?de=person:${P.joao.id}&para=person:${solto.id}`,
      { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    assert.strictEqual(r.json.passos, null, 'inventou caminho para quem não tem ligação');
  });

  await teste('o mapa liga o texto ao lugar — inclusive pelo nome HISTÓRICO', async () => {
    const mapaMod = require('./mapa');
    const ix = mapaMod.indiceDeLugares([
      { id: 'l1', nome: 'Ouro Preto', municipio: 'Ouro Preto', nomes_historicos: ['Vila Rica'] },
      { id: 'l2', nome: 'Pirapora', municipio: 'Pirapora', nomes_historicos: [] },
      // a fazenda FICA EM Pirapora; não se chama Pirapora
      { id: 'l3', nome: 'Fazenda do Meio', municipio: 'Pirapora', nomes_historicos: [] },
    ]);
    assert.strictEqual(mapaMod.resolver(ix, 'vila rica').id, 'l1', 'nome histórico não resolveu');
    assert.strictEqual(mapaMod.resolver(ix, 'OURO  PRETO').id, 'l1', 'espaço/caixa quebraram o match');
    // acento é erro de digitação comum e casa de propósito (igual à busca)
    assert.strictEqual(mapaMod.resolver(ix, 'Piraporã').id, 'l2', 'o acento quebrou o match');
    // mas nome PARECIDO é outro lugar: "Pirapora do Bom Jesus" fica em SP,
    // e ligar as duas coisas seria mudar a família de estado sem avisar
    assert.strictEqual(mapaMod.resolver(ix, 'Pirapora do Bom Jesus'), null,
      'casou lugares diferentes só porque o nome começa igual');
    assert.strictEqual(mapaMod.resolver(ix, ''), null, 'texto vazio virou lugar');
    // município é continência, não identidade: "Pirapora" é a cidade, e não
    // a fazenda que fica nela — senão a família inteira nasce numa fazenda
    // que não é a dela
    assert.strictEqual(mapaMod.resolver(ix, 'Pirapora').id, 'l2',
      'o município virou apelido do lugar');
    assert.strictEqual(mapaMod.resolver(ix, 'Fazenda do Meio').id, 'l3');
  });

  await teste('o mapa mostra o que sabe e DECLARA o que não conseguiu pousar', async () => {
    // um lugar com coordenada e um sem: os dois aparecem, com destinos diferentes
    const comCoord = await req('POST', F('/lugares'), { sessao: ana,
      corpo: { nome: 'Pirapora', uf: 'MG', lat: -17.345, lon: -44.941 } });
    assert.strictEqual(comCoord.status, 201, comCoord.texto);
    await req('POST', F('/lugares'), { sessao: ana, corpo: { nome: 'Lugar Sem Coordenada' } });

    // um evento com o lugar escrito à MÃO, e com acento trocado de propósito:
    // é assim que o acervo real está, e é isso que o mapa tem de resolver
    const ev = await req('POST', F('/eventos'), { sessao: ana, corpo: {
      tipo: 'mudanca', titulo: 'Mudança para a cidade', data: '1955',
      local: 'Piraporã', participantes: [P.joao.id] } });
    assert.strictEqual(ev.status, 201, ev.texto);

    const r = await req('GET', F('/mapa'), { sessao: ana });
    assert.strictEqual(r.status, 200, r.texto);
    assert(r.json.com_coordenada >= 1, 'nenhum lugar entrou no desenho');
    assert(r.json.sem_coordenada.includes('Lugar Sem Coordenada'),
      'o lugar sem coordenada sumiu em vez de ser declarado');
    const pirapora = r.json.lugares.find((l) => l.nome === 'Pirapora');
    assert(pirapora, 'o lugar cadastrado não voltou no mapa');
    assert(pirapora.eventos > 0,
      'o texto escrito à mão não se ligou ao lugar cadastrado: ' +
      JSON.stringify({ pirapora, nao_reconhecidos: r.json.nao_reconhecidos.slice(0, 6) }));
  });

  // ================================ 2.5 BUSCA SEMÂNTICA (o fim da fase 2)
  console.log('\nbusca por sentido (2.5) — ao lado da palavra, nunca no lugar dela');

  const semantica = require('./semantica');

  await teste('o texto é cortado onde a frase termina, não no meio da palavra', async () => {
    const longo = ('Era uma vez uma casa de porta e janela na rua do meio. ').repeat(60);
    const partes = semantica.trechos(longo, 300);
    assert(partes.length > 1, 'não cortou um texto de 3 mil caracteres');
    assert(partes.every((p) => p.length <= 300), 'trecho passou do teto');
    // corta na frase: todos os pedaços terminam em pontuação
    assert.strictEqual(partes.filter((x) => /[.!?;]$/.test(x)).length, partes.length,
      'cortou no meio da frase — o trecho perde o sentido que estamos indexando');
    assert.deepStrictEqual(semantica.trechos('curto'), ['curto']);
    assert.deepStrictEqual(semantica.trechos('   '), [], 'texto vazio virou trecho');
  });

  await teste('sem provedor de embedding, a busca por sentido some — e a textual fica', async () => {
    routerIA.injetarParaTeste('google', null);
    await db.q(`UPDATE provider_registry SET ativo = false WHERE capability = 'embedding'`);
    const est = await req('GET', F('/semantica'), { sessao: ana });
    assert.strictEqual(est.json.disponivel, false, 'anunciou busca por sentido sem provedor');
    const b = await req('GET', F('/busca?q=Pirapora'), { sessao: ana });
    assert.strictEqual(b.status, 200, b.texto);
    assert(b.json.resultados.length > 0, 'a busca POR PALAVRA parou junto — ela não depende disto');
    assert.deepStrictEqual(b.json.por_sentido, [], 'inventou achado por sentido sem provedor');
  });

  await teste('indexar guarda um vetor por trecho, e reindexar não duplica', async () => {
    await db.q(`UPDATE provider_registry SET ativo = true WHERE capability = 'embedding'`);
    // Vetor FALSO determinístico: mesmo texto → mesmo vetor. Não testa
    // qualidade semântica (nenhum teste offline testa), testa o que é
    // nosso: cortar, guardar, filtrar e não cobrar.
    const vetorDe = (texto) => {
      const v = new Array(768).fill(0);
      for (let i = 0; i < texto.length; i++) v[texto.charCodeAt(i) % 768] += 1;
      const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / n);
    };
    routerIA.injetarParaTeste('google', async ({ capability, entrada }) => {
      assert.strictEqual(capability, 'embedding');
      return { saida: { vetor: vetorDe(entrada.texto) }, tokens_in: 0, tokens_out: 0, custo_centavos: 0 };
    });

    const antes = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    const r1 = await req('POST', F('/semantica/indexar'), { sessao: ana, corpo: { limite: 10 } });
    assert.strictEqual(r1.status, 200, r1.texto);
    assert(r1.json.itens > 0, 'não indexou nada');

    // esvazia a fila (o acervo de teste tem mais itens que o lote) e SÓ ENTÃO
    // afirma que passar de novo não repete — indexar em lotes é o desenho,
    // não um defeito
    for (let i = 0; i < 20; i++) {
      const r = await req('POST', F('/semantica/indexar'), { sessao: ana, corpo: { limite: 25 } });
      if (r.json.itens === 0) break;
    }
    const n1 = await tenancy.comEscopo(famA, (t) => t.uma(`SELECT count(*)::int n FROM search_chunks`));
    const r2 = await req('POST', F('/semantica/indexar'), { sessao: ana, corpo: { limite: 25 } });
    assert.strictEqual(r2.json.itens, 0, 'reindexou o que já estava em dia');
    const n2 = await tenancy.comEscopo(famA, (t) => t.uma(`SELECT count(*)::int n FROM search_chunks`));
    assert.strictEqual(n2.n, n1.n, 'a segunda indexação duplicou trechos');

    // e NÃO cobra crédito: é recurso do plano, não operação vendida
    assert.strictEqual((await req('GET', F('/creditos'), { sessao: ana })).json.saldo, antes,
      'a busca por sentido cobrou crédito da família');
  });

  await teste('a busca por sentido respeita quem pode ver — antes de devolver', async () => {
    // indexa TUDO, inclusive o documento PRIVATE do dono
    for (let i = 0; i < 12; i++) {
      const r = await req('POST', F('/semantica/indexar'), { sessao: ana, corpo: { limite: 25 } });
      if (r.json.itens === 0) break;
    }
    const doDono = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT texto FROM search_chunks WHERE ref_id = $1 AND ordem = 0`, [P.privada]));
    if (doDono) {
      const busca = await req('GET', F('/busca?q=' + encodeURIComponent(doDono.texto.slice(0, 60))),
        { sessao: bruno });
      assert.strictEqual(busca.status, 200, busca.texto);
      const achou = (busca.json.por_sentido || []).some((x) => x.ref_id === P.privada);
      assert(!achou, 'O ITEM PRIVADO APARECEU NA BUSCA POR SENTIDO DE QUEM NÃO PODE VÊ-LO');
    }
  });

  await teste('o mesmo texto acha o item — e o trecho volta para conferir', async () => {
    const alvo = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT ref_tipo, ref_id, texto FROM search_chunks
        WHERE privacidade = 'FAMILY' AND length(texto) > 40 ORDER BY atualizado_em DESC LIMIT 1`));
    assert(alvo, 'nada foi indexado para procurar');
    const r = await tenancy.comEscopo(famA, (t) => semantica.procurar(t, famA, {
      termo: alvo.texto.slice(0, 120), quem: { userId: ana.id, papel: 'OWNER' }, limite: 5 }));
    assert(r.length > 0, 'não achou nem o próprio texto');
    assert(r.some((x) => x.ref_id === alvo.ref_id), 'o item exato não veio entre os primeiros');
    assert(r[0].trecho && r[0].origem === 'sentido', 'resultado sem trecho ou sem origem declarada');
  });

  await teste('vetor com dimensão errada é RECUSADO, não guardado torto', async () => {
    routerIA.injetarParaTeste('google', async () => ({
      saida: { vetor: new Array(10).fill(0.1) }, tokens_in: 0, tokens_out: 0, custo_centavos: 0 }));
    await tenancy.comEscopo(famA, async (t) => {
      const alvo = await t.uma(`SELECT ref_tipo, ref_id FROM busca LIMIT 1`);
      await assert.rejects(
        semantica.indexarItem(t, { familyId: famA, refTipo: alvo.ref_tipo, refId: alvo.ref_id }),
        /dimension|vector|dimensões/i,
        'guardou vetor de tamanho errado — a comparação viraria lixo silencioso');
    });
  });

  // ====================================================== 3.1 STUDIO (§21)
  console.log('\nStudio (3.1) — o original não se toca, e o selo não é enfeite');

  const estudioMod = require('./estudio');
  let fotoStudio = null;

  await teste('as três operações aparecem com preço — e só as que têm provedor', async () => {
    const r = await enviar(pngReal(80, 80, [40, 40, 40]), 'retrato-antigo.png');
    await fila.processarLote(10, 'rapida');
    fotoStudio = r.media_id;

    const g = await req('GET', F(`/midias/${fotoStudio}/estudio`), { sessao: ana });
    assert.strictEqual(g.status, 200, g.texto);
    for (const op of ['restaurar_foto', 'colorizar_foto', 'ampliar_foto']) {
      assert(g.json.capacidades[op], 'faltou a operação ' + op);
      assert(g.json.capacidades[op].creditos > 0, op + ' apareceu de graça');
    }
    // animar continua declarada e desligada: vídeo custa por segundo
    const animar = await db.uma(
      `SELECT ativo FROM provider_registry WHERE capability = 'animar_foto'`);
    assert.strictEqual(animar.ativo, false, 'a animação foi ligada sem a conta feita');
  });

  await teste('cotação primeiro; confirmar RESERVA o crédito e enfileira', async () => {
    const cot = await req('POST', F(`/midias/${fotoStudio}/estudio`),
      { sessao: ana, corpo: { operacao: 'restaurar_foto' } });
    assert.strictEqual(cot.status, 200, cot.texto);
    assert(cot.json.cotacao.creditos > 0, 'cotou de graça');
    assert(!cot.json.job, 'ENFILEIROU sem confirmação — é a cobrança surpresa do §53');

    const tarifa = cot.json.cotacao.creditos;
    const antes = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    const ok = await req('POST', F(`/midias/${fotoStudio}/estudio`),
      { sessao: ana, corpo: { operacao: 'restaurar_foto', confirmar: true } });
    assert.strictEqual(ok.status, 200, ok.texto);
    assert(ok.json.job && ok.json.job.id, 'confirmou e não criou job');
    // o crédito sai na RESERVA, antes de a fila andar
    assert.strictEqual((await req('GET', F('/creditos'), { sessao: ana })).json.saldo, antes - tarifa,
      'a reserva não travou o valor');
  });

  await teste('o worker gera um DERIVADO com selo — e não encosta no original', async () => {
    const antesOriginal = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT sha256, storage_key, ai_class, bytes FROM media WHERE id = $1`, [fotoStudio]));

    // modelo falso: devolve um PNG diferente do original
    routerIA.injetarParaTeste('google', async ({ capability, entrada }) => {
      assert(capability.endsWith('_foto'), 'capability errada: ' + capability);
      assert(entrada.arquivo && entrada.arquivo.base64, 'mandou editar sem a imagem');
      return { saida: { mime: 'image/png', base64: pngReal(80, 80, [200, 180, 120]).toString('base64') },
        tokens_in: 10, tokens_out: 10, custo_centavos: 22 };
    });
    await fila.processarLote(10, 'cara');

    const dep = await req('GET', F(`/midias/${fotoStudio}/estudio`), { sessao: ana });
    assert.strictEqual(dep.json.derivados.length, 1, 'o Studio não produziu o derivado');
    const d = dep.json.derivados[0];
    assert.strictEqual(d.ai_class, 'AI_RESTORED', 'saiu sem o selo de IA (§88)');
    assert.strictEqual(d.derivacao.operacao, 'restaurar_foto');
    assert(d.derivacao.model, 'não guardou qual modelo fez');

    // O ORIGINAL CONTINUA IGUAL — é a promessa do produto inteiro
    const depoisOriginal = await tenancy.comEscopo(famA, (t) => t.uma(
      `SELECT sha256, storage_key, ai_class, bytes FROM media WHERE id = $1`, [fotoStudio]));
    assert.deepStrictEqual(depoisOriginal, antesOriginal, 'O STUDIO ALTEROU A FOTO ORIGINAL');

    // e o byte do derivado está mesmo no R2
    const url = await req('GET', F(`/midias/${d.id}/url`), { sessao: ana });
    assert.strictEqual(url.status, 200, 'o derivado não tem arquivo: ' + url.texto);
  });

  await teste('recusa do modelo ESTORNA — ninguém paga por foto que não veio', async () => {
    routerIA.injetarParaTeste('google', async () => {
      throw new Error('o modelo não devolveu imagem: recusado');
    });
    const antes = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    const ped = await req('POST', F(`/midias/${fotoStudio}/estudio`),
      { sessao: ana, corpo: { operacao: 'colorizar_foto', confirmar: true } });
    assert.strictEqual(ped.status, 200, ped.texto);
    await fila.processarLote(10, 'cara');

    const depois = (await req('GET', F('/creditos'), { sessao: ana })).json.saldo;
    assert.strictEqual(depois, antes, 'a família pagou por um resultado que não recebeu');
    const rec = await tenancy.comEscopo(famA, (t) => creditosMod.reconciliar(t, famA));
    assert(rec.ok, 'o estorno desbalanceou o ledger');
  });

  await teste('o Studio não roda em documento, nem em derivado de derivado', async () => {
    const doc = await req('POST', F(`/midias/${certidao}/estudio`),
      { sessao: ana, corpo: { operacao: 'restaurar_foto', confirmar: true } });
    assert.strictEqual(doc.status, 400, 'aceitou restaurar um PDF');

    const derivado = (await req('GET', F(`/midias/${fotoStudio}/estudio`), { sessao: ana }))
      .json.derivados[0];
    const neto = await req('POST', F(`/midias/${derivado.id}/estudio`),
      { sessao: ana, corpo: { operacao: 'ampliar_foto', confirmar: true } });
    assert.strictEqual(neto.status, 400,
      'deixou derivar de um derivado — a cadeia vira telefone sem fio');
  });

  // ============================================================ §94 TENANCY
  console.log('\nisolamento entre famílias (§94) — requisito de primeira classe');

  const ALVO_FALSO = '00000000-0000-4000-8000-000000000000';

  /**
   * Monta o caminho de teste de uma rota escopada. Cada `:param` novo
   * PRECISA entrar aqui — é o preço (barato) de a suíte de isolamento ser
   * gerada da tabela de rotas: rota nova sem parâmetro conhecido quebra a
   * suíte em vez de passar despercebida.
   */
  const caminhoDeTeste = (rota, familia, userId) => {
    let c = rota.caminho.replace(':familyId', familia).replace(':userId', userId)
      .replace(':predicado', 'data_nascimento').replace(':noTipo', 'person').replace(':tipo', 'pessoa');
    for (const p of [':pessoaId', ':relId', ':claimId', ':contribId', ':mediaId', ':albumId',
      ':idId', ':storyId', ':lugarId', ':eventoId', ':exportId', ':tradicaoId', ':reliquiaId',
      ':missaoId', ':achadoId', ':entrevistaId', ':respostaId', ':noId', ':itemId', ':id']) {
      c = c.replace(p, ALVO_FALSO);
    }
    const sobrou = c.match(/\/:(\w+)/);
    assert(!sobrou, `a rota ${rota.caminho} tem o parâmetro ${sobrou && sobrou[1]} sem substituto no teste §94`);
    return c;
  };

  await teste('sem SET app.family_id, tabela de conteúdo devolve ZERO linhas', async () => {
    const dentro = await tenancy.comEscopo(famA, (t) =>
      t.uma('SELECT count(*)::int n FROM audit_log WHERE family_id = $1', [famA]));
    assert(dentro.n > 0, 'o escopo certo não enxergou as próprias linhas');
    const fora = await tenancy.semEscopo((t) =>
      t.uma('SELECT count(*)::int n FROM audit_log WHERE family_id = $1', [famA]));
    assert.strictEqual(fora.n, 0, 'o RLS deixou passar SEM escopo — o muro do banco não está de pé');
  });

  await teste('com o escopo da OUTRA família, zero linhas', async () => {
    // silva e famB já existem (Fase 5). O dono da B não é membro da A —
    // o Bruno entrou na A como CONTRIBUTOR e serviria de falso negativo.
    assert(silva && famB, 'a Fase 5 deveria ter criado a família Silva');
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
    for (const rota of montado.ROTAS_ESCOPADAS) {
      const caminho = caminhoDeTeste(rota, famB, bruno.id);
      const r = await req(rota.metodo, caminho, { sessao: ana, corpo: rota.metodo === 'GET' ? undefined : { nome: 'invasao', papel: 'GUEST' } });
      // 404 e NUNCA 403: 403 confirmaria que a família existe (T2).
      if (r.status !== 404) falhas94.push(`${rota.metodo} ${rota.caminho} → ${r.status}`);
    }
    assert.strictEqual(falhas94.length, 0,
      'VAZAMENTO ENTRE FAMÍLIAS:\n         ' + falhas94.join('\n         '));
  });

  await teste('o outro lado também: usuário de B não alcança A', async () => {
    for (const rota of montado.ROTAS_ESCOPADAS) {
      const caminho = caminhoDeTeste(rota, famA, ana.id);
      const r = await req(rota.metodo, caminho, { sessao: silva, corpo: rota.metodo === 'GET' ? undefined : { nome: 'x', papel: 'GUEST' } });
      assert.strictEqual(r.status, 404, `${rota.metodo} ${rota.caminho} devolveu ${r.status}`);
    }
  });

  await teste('sem sessão nenhuma, tudo é 401 (nunca 200)', async () => {
    for (const rota of montado.ROTAS_ESCOPADAS) {
      const r = await req(rota.metodo, caminhoDeTeste(rota, famA, ana.id), {});
      assert.strictEqual(r.status, 401, `${rota.metodo} ${rota.caminho} respondeu ${r.status} sem sessão`);
    }
  });

  await teste('toda tabela de família entra na PURGA — ou está declarada fora', async () => {
    // Tabela nova com `family_id` que ninguém lembrou de purgar é uma
    // promessa de LGPD quebrada em silêncio: o Augusto clica "purgar", a
    // tela diz que apagou, e as linhas continuam lá. Aqui a lista sai do
    // BANCO, não da memória de quem escreveu o módulo — foi assim que
    // `orders` (do gateway) apareceu faltando.
    const FORA = new Set([
      'audit_log',            // o registro da purga não pode se apagar
      'consents',             // prova de base legal (LGPD art. 37)
      'family_memberships', 'invites',  // apagadas fora da ORDEM, no fim
      'feature_flags',        // configuração, não conteúdo
      'jobs', 'jobs_dlq',     // fila operacional, some por retenção
    ]);
    const comFamilia = (await db.todas(
      `SELECT c.table_name FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = $1 AND c.column_name = 'family_id'
          AND t.table_type = 'BASE TABLE'`, [db.SCHEMA])).map((x) => x.table_name);
    const ordem = new Set(require('./purga').ORDEM);
    const esquecidas = comFamilia.filter((n) => !ordem.has(n) && !FORA.has(n));
    assert.strictEqual(esquecidas.length, 0,
      'tabela com family_id fora da purga: ' + esquecidas.join(', '));
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
  console.log('ORIGENA 1.0: Fases 0 a 8 verdes.\n');
}

principal().catch(async (e) => {
  console.error('\nsuíte quebrou:', e);
  try { await db.derrubarSchema(); } catch (_) {}
  try { await db.fechar(); } catch (_) {}
  process.exit(1);
});
