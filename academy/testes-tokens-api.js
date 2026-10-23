// =====================================================================
// Villela Academy — TOKENS DE API TEMPORÁRIOS (nucleo/tokens-api.js) · testes. Chamado pelo
// selftest (npm run test:academy). Rotas reais; o produtor é a Maria,
// já aprovada. Sessão de staff no mock vem do x-test-user, então todo
// pedido "só com token" vai com semUser (sem sessão), como o Codex faria.
// =====================================================================
'use strict';
const assert = require('assert');

async function rodar({ t, req, app, emailProdutor }) {
  const { db } = require('./db');
  const nucleo = require('../nucleo/tokens-api');
  const tdb = nucleo._db();
  const { ROTAS } = require('./tokens-api');
  const B = '/staff/api/academy';
  const BT = '/staff/api/tokens-api';
  const tok = (token) => ({ authorization: 'Bearer ' + token });
  // corpo no formato da Academy (produtor_email) → formato do núcleo (sistema + dono)
  const emitir = (c, op = {}) => {
    const corpo = { sistema: 'academy', ...c, dono: c.produtor_email };
    delete corpo.produtor_email;
    return req('POST', BT, { corpo, ...op });
  };

  console.log('\n— tokens de API temporários: emissão só por sessão de admin, escopo, produtor, validade —');

  await t('TK1 a PUBLISH_KEY não emite token (a chave que pede não aprova)', async () => {
    const r = await emitir({ nome: 'x', produtor_email: emailProdutor, escopos: ['leitura'] }, { semUser: true, chave: true });
    assert.strictEqual(r.st, 401, JSON.stringify(r.json));
  });
  await t('TK2 sessão de staff que não é admin não emite', async () => {
    const r = await emitir({ nome: 'x', produtor_email: emailProdutor, escopos: ['leitura'] }, { user: 'op' });
    assert.strictEqual(r.st, 403);
  });
  await t('TK3 emissão valida nome, escopo, validade e produtor', async () => {
    const base = { nome: 'Codex', produtor_email: emailProdutor, escopos: ['leitura'] };
    for (const [corpo, trecho] of [
      [{ ...base, nome: '' }, 'nome'],
      [{ ...base, escopos: [] }, 'escopo'],
      [{ ...base, escopos: ['admin'] }, 'desconhecido'],
      [{ ...base, horas: 0 }, 'Validade'],
      [{ ...base, horas: 24 * 31 }, 'Validade'],
      [{ ...base, produtor_email: 'ninguem@t.com' }, 'conta ativa'],
      [{ ...base, produtor_email: '' }, 'E-mail do produtor'],
      [{ ...base, sistema: 'nao-existe' }, 'sistema'],
    ]) {
      const r = await emitir(corpo);
      assert.strictEqual(r.st, 400, JSON.stringify(corpo));
      assert.ok(r.json.erro.includes(trecho), r.json.erro);
    }
  });

  let T = '', TID = '';
  await t('TK4 admin emite: o token aparece uma vez, o banco guarda só o hash', async () => {
    const r = await emitir({ nome: 'Codex — importar', produtor_email: emailProdutor.toUpperCase(), escopos: ['leitura', 'conteudo'], horas: 2 });
    assert.strictEqual(r.st, 200, JSON.stringify(r.json));
    T = r.json.token; TID = r.json.registro.id;
    assert.ok(/^vst_[A-Za-z0-9_-]{40,}$/.test(T), T);
    assert.strictEqual(r.json.registro.dono, emailProdutor.toLowerCase());
    const linha = tdb.prepare('SELECT * FROM api_tokens WHERE id = ?').get(TID);
    assert.ok(!JSON.stringify(linha).includes(T), 'o token bruto não pode estar no banco');
    const horas = (new Date(linha.expira_em) - Date.now()) / 3600e3;
    assert.ok(horas > 1.9 && horas <= 2, String(horas));
    const l = await req('GET', BT);
    assert.ok(!l.texto.includes(T), 'a listagem não devolve o token');
    assert.strictEqual(l.json.tokens.find(x => x.id === TID).situacao, 'ativo');
  });

  let PID = '';
  await t('TK5 token com "conteudo" importa curso; a auditoria diz qual token foi', async () => {
    const r = await req('POST', `${B}/importar-curso`, { semUser: true, cab: tok(T), corpo: {
      produtor_email: emailProdutor,
      produto: { titulo: 'Curso pelo Token', tipo: 'curso', descricao_curta: 'Curta' },
      modulos: [{ titulo: 'Módulo T', aulas: [{ titulo: 'Aula T1', tipo: 'texto', conteudo: 'oi' }] }],
    } });
    assert.strictEqual(r.st, 200, JSON.stringify(r.json));
    PID = r.json.produto.id;
    assert.strictEqual(r.json.produto.status, 'rascunho');
    const a = db.prepare("SELECT quem FROM audit_logs WHERE acao = 'curso.importar' AND entidade_id = ? ORDER BY id DESC").get(PID);
    assert.ok(a.quem.startsWith('staff:token:Codex — importar (vst_'), a.quem);
  });
  await t('TK6 token com "leitura" lê a estrutura; também aceita o cabeçalho x-api-token', async () => {
    const r = await req('GET', `${B}/importar-curso/estrutura?produtor_email=${encodeURIComponent(emailProdutor)}&produto_id=${PID}`,
      { semUser: true, cab: { 'x-api-token': T } });
    assert.strictEqual(r.st, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.estrutura[0].titulo, 'Módulo T');
  });
  await t('TK7 sem o escopo "publicar", status/gotejamento são recusados', async () => {
    const r = await req('POST', `${B}/gotejamento`, { semUser: true, cab: tok(T), corpo: { produtor_email: emailProdutor, produto_id: PID, ativo: true } });
    assert.strictEqual(r.st, 403);
    assert.ok(r.json.erro.includes('publicar'), r.json.erro);
  });
  await t('TK8 outro produtor_email, ou nenhum, é recusado', async () => {
    const outro = await req('POST', `${B}/importar-curso`, { semUser: true, cab: tok(T), corpo: { produtor_email: 'joao@t.com', produto: { titulo: 'X' } } });
    assert.strictEqual(outro.st, 403);
    const sem = await req('GET', `${B}/materiais-curso?produto_id=${PID}`, { semUser: true, cab: tok(T) });
    assert.strictEqual(sem.st, 403);
  });
  await t('TK9 rota só de admin não vê token (sem sessão = 401)', async () => {
    for (const p of ['/dashboard', '/usuarios', '/pedidos']) {
      const r = await req('GET', B + p, { semUser: true, cab: tok(T) });
      assert.strictEqual(r.st, 401, p + ' ' + r.st);
    }
    assert.strictEqual((await req('GET', BT, { semUser: true, cab: tok(T) })).st, 401, 'a gestão de tokens também não');
    const r = await req('POST', `${B}/produtos/${PID}/decidir`, { semUser: true, cab: tok(T), corpo: { decisao: 'aprovar' } });
    assert.strictEqual(r.st, 401);
  });
  await t('TK10 rota da PUBLISH_KEY fora da lista do token é recusada (lista fecha por padrão)', async () => {
    for (const [m, p] of [['GET', '/produtores'], ['GET', '/ia-uso'], ['GET', '/estudo/pedidos-config'], ['POST', '/lives/x/avisar']]) {
      const r = await req(m, B + p + (m === 'GET' ? `?produtor_email=${encodeURIComponent(emailProdutor)}` : ''),
        { semUser: true, cab: tok(T), corpo: m === 'POST' ? { produtor_email: emailProdutor, confirmar: true } : undefined });
      assert.strictEqual(r.st, 403, `${m} ${p} → ${r.st}`);
      assert.ok(r.json.erro.includes('não aceita token'), r.json.erro);
    }
  });
  await t('TK11 token inválido dá 401 mesmo com a PUBLISH_KEY junto; Bearer que não é token cai na chave', async () => {
    const q = `?produtor_email=${encodeURIComponent(emailProdutor)}&produto_id=${PID}`;
    const r = await req('GET', `${B}/materiais-curso${q}`, { semUser: true, chave: true, cab: tok('vst_inventado') });
    assert.strictEqual(r.st, 401);
    const r2 = await req('GET', `${B}/materiais-curso${q}`, { semUser: true, chave: true, cab: { authorization: 'Bearer outra-coisa' } });
    assert.strictEqual(r2.st, 200, JSON.stringify(r2.json));
    const r3 = await req('POST', BT, { cab: tok(T), corpo: { sistema: 'academy', nome: 'x', dono: emailProdutor, escopos: ['leitura'] } });
    assert.strictEqual(r3.st, 403, 'nem com sessão de admin um pedido que carrega token emite token');
  });
  await t('TK12 cada uso fica registrado, inclusive os recusados', async () => {
    const r = await req('GET', `${BT}/${TID}/usos`);
    assert.strictEqual(r.st, 200);
    const st = r.json.usos.map(u => u.status);
    assert.ok(st.includes(200) && st.includes(403), st.join(','));
    const reg = (await req('GET', BT)).json.tokens.find(x => x.id === TID);
    assert.ok(reg.usos >= 2 && reg.ultimo_uso_em, JSON.stringify(reg));
  });
  await t('TK13 revogado e vencido param na hora', async () => {
    const e = await emitir({ nome: 'curto', produtor_email: emailProdutor, escopos: ['leitura'], horas: 1 });
    const q = `?produtor_email=${encodeURIComponent(emailProdutor)}&produto_id=${PID}`;
    tdb.prepare('UPDATE api_tokens SET expira_em = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), e.json.registro.id);
    const v = await req('GET', `${B}/materiais-curso${q}`, { semUser: true, cab: tok(e.json.token) });
    assert.strictEqual(v.st, 401); assert.ok(v.json.erro.includes('vencido'));
    const rv = await req('POST', `${BT}/${TID}/revogar`);
    assert.strictEqual(rv.json.registro.situacao, 'revogado');
    const d = await req('GET', `${B}/materiais-curso${q}`, { semUser: true, cab: tok(T) });
    assert.strictEqual(d.st, 401); assert.ok(d.json.erro.includes('revogado'));
    const pk = await req('POST', `${BT}/${TID}/revogar`, { semUser: true, chave: true });
    assert.strictEqual(pk.st, 401, 'a PUBLISH_KEY também não revoga');
  });
  await t('TK14 trava: toda rota da lista existe e passa pela guarda do token; nenhuma rota de admin passa', async () => {
    const pilha = app._router.stack.filter(l => l.route && typeof l.route.path === 'string');
    const comGuarda = (l) => l.route.stack.some(x => x.handle && x.handle.sistemaToken === 'academy');
    for (const [m, cam] of ROTAS) {
      const comoLista = (p) => p.replace(/\/:[^/]+/g, '/:id'); // :mediaId da rota real = :id da lista
      const achou = pilha.find(l => l.route.methods[m.toLowerCase()] && comoLista(l.route.path) === B + cam);
      assert.ok(achou, `rota da lista não existe: ${m} ${cam}`);
      assert.ok(comGuarda(achou), `rota da lista sem a guarda do token: ${m} ${cam}`);
    }
    for (const l of pilha) {
      if (!l.route.path.startsWith(B + '/')) continue;
      const m = Object.keys(l.route.methods)[0].toUpperCase();
      if (!comGuarda(l)) assert.ok(!nucleo.rotaDe('academy', m, l.route.path), `rota sem guarda está na lista: ${m} ${l.route.path}`);
    }
  });
  await t('TK15 token de outro sistema não entra na Academy', async () => {
    nucleo.registrarSistema('teste-outro', { rotulo: 'Outro', base: '/staff/api/outro', escopos: { leitura: 'ler' }, rotas: [['GET', '/x', 'leitura']] });
    const e = await req('POST', BT, { corpo: { sistema: 'teste-outro', nome: 'outro', escopos: ['leitura'] } });
    assert.strictEqual(e.st, 200, JSON.stringify(e.json));
    assert.strictEqual(e.json.registro.dono, null, 'sistema sem dono não guarda dono');
    const r = await req('GET', `${B}/materiais-curso?produtor_email=${encodeURIComponent(emailProdutor)}&produto_id=${PID}`, { semUser: true, cab: tok(e.json.token) });
    assert.strictEqual(r.st, 403); assert.ok(r.json.erro.includes('teste-outro'), r.json.erro);
    const sis = (await req('GET', BT)).json.sistemas.map(x => x.id);
    assert.ok(sis.includes('academy') && sis.includes('teste-outro'), sis.join(','));
    nucleo.SISTEMAS.delete('teste-outro');
  });
  await t('TK16 limite de tokens ativos', async () => {
    tdb.prepare('UPDATE api_tokens SET revogado_em = ? WHERE revogado_em IS NULL').run(new Date().toISOString());
    for (let i = 0; i < 20; i++) {
      const r = await emitir({ nome: 'lote ' + i, produtor_email: emailProdutor, escopos: ['leitura'] });
      assert.strictEqual(r.st, 200);
    }
    const r = await emitir({ nome: 'onze', produtor_email: emailProdutor, escopos: ['leitura'] });
    assert.strictEqual(r.st, 400); assert.ok(r.json.erro.includes('Revogue'));
    tdb.prepare('UPDATE api_tokens SET revogado_em = ? WHERE revogado_em IS NULL').run(new Date().toISOString());
  });
}

module.exports = { rodar };
