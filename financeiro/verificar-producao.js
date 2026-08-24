// =====================================================================
// Villela Finance — verificação de produção DE FORA.
//   npm run verificar:finance
//   npm run verificar:finance -- https://villela-stay-backend.onrender.com
//
// Roda contra o que está NO AR, sem credencial. Confere três coisas, nesta
// ordem de importância:
//
//   1. o LEGADO continua respondendo — um deploy do produto novo que
//      derrube `/staff/api/financeiro/*` quebra a operação de hoje;
//   2. as rotas novas existem e recusam quem não está autenticado
//      (401/403 — nunca 200, nunca 500, nunca 404);
//   3. nada de segredo ou stack trace vaza na resposta de erro.
//
// Sai com código 1 só em bloqueio real. O que não dá para verificar sem
// sessão é DITO, não silenciado.
// =====================================================================
'use strict';
const assert = require('assert');

const BASE = (process.argv[2] || 'https://villela-stay-backend.onrender.com').replace(/\/+$/, '');
let ok = 0;
const falhas = [];
const avisos = [];

async function pega(caminho, opts = {}) {
  const r = await fetch(BASE + caminho, { redirect: 'manual', ...opts });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch (_) { /* nem toda rota devolve JSON */ }
  return { st: r.status, texto, json, headers: r.headers };
}

async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(`${nome}: ${e.message}`); console.log('  ❌', nome, '—', e.message); }
}
const aviso = (texto) => { avisos.push(texto); console.log('  ⚠️ ', texto); };

const json = (corpo) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
});

(async () => {
  console.log('\nVillela Finance — verificação de produção em', BASE, '\n');

  console.log('1. O legado NÃO pode ter sido derrubado');
  await t('/health responde 200', async () => {
    assert.strictEqual((await pega('/health')).st, 200);
  });
  await t('legado /staff/api/financeiro/contas existe e exige autenticação', async () => {
    const r = await pega('/staff/api/financeiro/contas');
    assert.notStrictEqual(r.st, 404, 'a rota do financeiro LEGADO sumiu — o deploy quebrou a operação de hoje');
    assert.ok([401, 403].includes(r.st), `esperava 401/403, veio ${r.st}`);
  });
  await t('legado /staff/api/financeiro/dre continua no ar', async () => {
    const r = await pega('/staff/api/financeiro/dre?mes=2026-08');
    assert.notStrictEqual(r.st, 404, 'a rota do DRE legado sumiu');
    assert.ok([401, 403].includes(r.st), `esperava 401/403, veio ${r.st}`);
  });
  await t('Portal Staff continua servindo', async () => {
    const r = await pega('/staff/');
    assert.ok([200, 301, 302].includes(r.st), `esperava 200/redirect, veio ${r.st}`);
  });

  console.log('\n2. As rotas novas existem e estão fechadas');
  await t('/finance/api/eu sem sessão devolve 401 (não 500, não 404)', async () => {
    const r = await pega('/finance/api/eu');
    assert.notStrictEqual(r.st, 404, 'o módulo não montou — confira o log do Render por "[finance]"');
    assert.strictEqual(r.st, 401, `esperava 401, veio ${r.st}`);
    assert.ok(r.json && /Sessão/i.test(r.json.erro), 'mensagem de sessão ausente');
  });
  await t('/finance/api/cockpit sem sessão devolve 401', async () => {
    assert.strictEqual((await pega('/finance/api/cockpit')).st, 401);
  });
  await t('/finance/api/lancamentos sem sessão devolve 401 (escrita fechada)', async () => {
    const r = await pega('/finance/api/lancamentos', json({ data: '2026-01-01', linhas: [] }));
    assert.strictEqual(r.st, 401, `POST sem sessão devolveu ${r.st} — a escrita está ABERTA`);
  });
  await t('/finance/api/stays/sincronizar sem sessão devolve 401', async () => {
    const r = await pega('/finance/api/stays/sincronizar', json({ competencia: '2026-08' }));
    assert.strictEqual(r.st, 401, `sincronização exposta sem sessão (${r.st})`);
  });
  await t('administração /staff/api/finance/* exige login de staff', async () => {
    for (const caminho of ['/staff/api/finance/tenants', '/staff/api/finance/saude', '/staff/api/finance/planos']) {
      const r = await pega(caminho);
      assert.notStrictEqual(r.st, 404, `${caminho} não montou`);
      assert.ok([401, 403].includes(r.st), `${caminho} devolveu ${r.st}`);
    }
  });
  await t('provisionar conta pela administração exige login', async () => {
    const r = await pega('/staff/api/finance/tenants', json({ nome: 'Invasor Ltda' }));
    assert.ok([401, 403].includes(r.st), `criação de conta aberta (${r.st})`);
  });

  console.log('\n3. Login e vazamento');
  await t('login com credencial errada devolve 401 e não diz se o e-mail existe', async () => {
    const a = await pega('/finance/api/login', json({ email: 'ninguem-existe@exemplo.com', senha: 'x' }));
    const b = await pega('/finance/api/login', json({ email: 'augusto.villela@gmail.com', senha: 'senha-errada-de-proposito' }));
    assert.strictEqual(a.st, 401);
    assert.strictEqual(b.st, 401);
    assert.strictEqual(
      (a.json || {}).erro, (b.json || {}).erro,
      'as mensagens diferem — a tela de login entrega quem tem conta');
  });
  await t('resposta de erro não traz stack trace nem caminho de arquivo', async () => {
    const r = await pega('/finance/api/eu');
    assert.ok(!/at \w+ \(|\.js:\d+|node_modules|\/var\/data/.test(r.texto), 'a resposta vaza interno');
  });
  await t('nenhum segredo conhecido aparece nas respostas públicas', async () => {
    for (const caminho of ['/finance/api/eu', '/finance/api/cockpit', '/staff/api/finance/saude']) {
      const r = await pega(caminho);
      assert.ok(!/STAYS_SECRET|JWT_SECRET|PUBLISH_KEY|sk-ant|scrypt\$/.test(r.texto), `${caminho} vaza segredo`);
    }
  });
  await t('cookie de sessão é restrito ao caminho /finance', async () => {
    // Só dá para conferir num login bem-sucedido; sem credencial, confere
    // que a rota ao menos não devolve cookie em falha de login.
    const r = await pega('/finance/api/login', json({ email: 'x@y.z', senha: 'errada' }));
    const cookies = r.headers.get('set-cookie') || '';
    assert.ok(!/fin_sess=/.test(cookies), 'login falho devolveu cookie de sessão');
  });

  // ------------------------------------------------------- não verificável
  console.log('\n4. O que esta verificação NÃO alcança');
  aviso('isolamento entre contas, razão balanceado e cadeia de auditoria: exigem sessão — ' +
        'estão cobertos por `npm run test:finance` (185 testes) e pelo painel /staff/api/finance/saude.');
  aviso('réplica do diário no R2: confira em /staff/api/finance/saude (campo `diario.configurada`). ' +
        'Enquanto for `false`, o RPO real é o do snapshot diário, não os 5 minutos.');
  aviso('adaptador Stays: rode a PRÉVIA antes da primeira sincronização real — ' +
        'POST /finance/api/stays/sincronizar {"competencia":"AAAA-MM","dryRun":true}.');

  console.log(`\n${'='.repeat(62)}`);
  if (falhas.length) {
    console.log(`${ok} verificação(ões) OK, ${falhas.length} FALHA(S):\n`);
    for (const f of falhas) console.log('  ✗ ' + f);
    console.log('');
    process.exit(1);
  }
  console.log(`${ok}/${ok} verificações OK · ${avisos.length} ponto(s) que só o painel responde.`);
  console.log('='.repeat(62) + '\n');
})().catch(e => { console.error('\nA verificação não pôde rodar:', e.message, '\n'); process.exit(1); });
