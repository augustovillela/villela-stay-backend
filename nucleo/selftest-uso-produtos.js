// =====================================================================
// USO DOS PRODUTOS — nucleo/uso-produtos.js  (npm run test:uso-produtos)
//
// Cada teste existe porque, sem ele, uma decisão viraria só um parágrafo:
//   • o servidor decide quanto somar; um relógio por pessoa E por produto
//   • o cookie de um produto não identifica ninguém em outro
//   • link de senha colado no cookie do Kids não vale como sessão
//   • a página ganha o pulso; JSON, outro prefixo e arquivo não
//   • relatório nominal: só admin, CSV auditado, sem fórmula no Excel
//   • a tabela de produtos não deriva dos cookies reais (varredura do fonte)
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'uso-produtos-test-' + Date.now());
process.env.VISITAS_GEO = 'off';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const SEG = 'segredo-de-teste';
const Mod = require('./uso-produtos');
const Cliente = require('./uso-produto-cliente');
const visitas = require('./visitas');

const PESSOAS = { 'p-ana': { id: 'p-ana', nome: 'Ana', email: 'ana@t' }, 'p-bia': { id: 'p-bia', nome: '=HYPERLINK("x")', email: 'bia@t' } };
const FAKES = [
  { id: 'fin', nome: 'Finance fake', emoji: '💰', prefixo: '/finance', cookie: 'fin_sess', pessoa: (id) => PESSOAS[id] || null },
  { id: 'kids', nome: 'Kids fake', emoji: '🧒', prefixo: '/kids', cookie: 'kids_sess', pessoa: (id) => PESSOAS[id] || null, tiposSessao: [undefined, 'sessao'] },
];
const cookieDe = (nome, payload) => `${nome}=${jwt.sign(payload, SEG, { expiresIn: '1h' })}`;

let ok = 0; const falhas = [];
async function t(nome, fn) { try { await fn(); ok++; console.log('  ✅ ' + nome); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌ ' + nome + '\n     ' + e.message); } }

(async () => {
  const DATA = process.env.DATA_DIR;
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const coletor = visitas.criarColetor(DATA);
  app.use(coletor.middleware);
  const AUDIT = [];
  const requireAuth = (req, res, next) => { req.user = { id: req.headers['x-u'] || 'adm', papel: req.headers['x-u'] === 'op' ? 'membro' : 'admin' }; next(); };
  const requireAdmin = (req, res, next) => (req.user.papel === 'admin' ? next() : res.status(403).json({ erro: 'admin' }));
  const uso = Mod.montar(app, { DATA_DIR: DATA, jwtSecret: () => SEG, requireAuth, requireAdmin, auditar: (req, acao, det) => AUDIT.push({ acao, det }), produtos: FAKES });
  app.get('/finance/app', (q, r) => r.type('html').send('<html><body><p>oi</p></body></html>'));
  app.get('/finance/api/dado', (q, r) => r.json({ html: '</body>' }));
  app.get('/fora/app', (q, r) => r.type('html').send('<html><body>x</body></html>'));
  app.get('/kids/x', (q, r) => r.type('html').send('<html><body>k</body></html>'));
  const srv = app.listen(0); await new Promise((r) => srv.once('listening', r));
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0';
  const get = (p, h = {}) => fetch(BASE + p, { headers: { 'User-Agent': UA, ...h } });
  const post = (p, corpo, h = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(corpo) });

  console.log('\n— Uso dos produtos —');

  await t('cookie de um produto só identifica nele; token de outro tipo (link de senha) não vale', async () => {
    const fin = FAKES[0], kids = FAKES[1];
    const req = (c) => ({ cookies: Object.fromEntries(c.split('; ').map((x) => [x.split('=')[0], x.split('=').slice(1).join('=')])) });
    assert.equal(Mod.quemEstaLogado(fin, req(cookieDe('fin_sess', { uid: 'p-ana' })), SEG), 'p-ana');
    assert.equal(Mod.quemEstaLogado(kids, req(cookieDe('fin_sess', { uid: 'p-ana' })), SEG), '', 'cookie do Finance não identifica no Kids');
    assert.equal(Mod.quemEstaLogado(kids, req(cookieDe('kids_sess', { uid: 'p-ana', tipo: 'kids-senha' })), SEG), '', 'link de senha colado no cookie');
    assert.equal(Mod.quemEstaLogado(kids, req(cookieDe('kids_sess', { uid: 'p-ana', tipo: 'sessao', v: 1 })), SEG), 'p-ana');
    assert.equal(Mod.quemEstaLogado(fin, req('fin_sess=' + jwt.sign({ uid: 'p-ana' }, 'outro-segredo')), SEG), '', 'assinatura forjada');
    assert.equal(Mod.quemEstaLogado(fin, req(cookieDe('fin_sess', { uid: '../../x' })), SEG), '', 'uid com lixo');
  });

  await t('servidor decide o tempo; relógio único por pessoa E por produto; área limpa e com teto', async () => {
    const A = Mod.criarArmazem(path.join(DATA, 'x1'));
    const em = (s) => new Date(Date.UTC(2026, 10, 8, 12, 0, 0) + s * 1000);
    assert.equal(A.pulso('fin', 'u', 'App', em(0)).somado, 30);
    assert.equal(A.pulso('fin', 'u', 'app', em(31)).somado, 31);
    assert.equal(A.pulso('fin', 'u', 'app', em(33)).somado, 0);
    assert.equal(A.pulso('fin', 'u', 'app', em(38)).somado, 7);
    assert.equal(A.pulso('fin', 'u', 'app', em(700)).somado, 30);
    assert.equal(A.pulso('kids', 'u', 'app', em(700)).somado, 30, 'outro produto tem relógio próprio');
    assert.equal(A.pulso('fin', 'u', "x'; DROP--", em(730)).somado, 30);
    assert.deepEqual(A.porUsuarioArea('fin', '2026-11-08', '2026-11-08').map((x) => x.area).sort(), ['app', 'xdrop--'].sort());
    for (let i = 0; i < 60; i++) A.pulso('fin', 'z', 'a' + i, em(1000 + i * 40));
    const areas = A.porUsuarioArea('fin', '2026-11-08', '2026-11-08').filter((x) => x.usuario === 'z').map((x) => x.area);
    assert.ok(areas.length <= 41 && areas.includes('outras'), 'área inventada tem teto: ' + areas.length);
  });

  await t('página HTML do produto ganha o pulso (1 vez); JSON, outro prefixo e arquivo não', async () => {
    const h = await (await get('/finance/app')).text();
    assert.equal((h.match(/uso-produto\.js/g) || []).length, 1);
    assert.ok(h.indexOf('uso-produto.js') < h.indexOf('</body>'));
    const j = await (await get('/finance/api/dado')).text();
    assert.ok(!j.includes('uso-produto.js'), 'JSON não pode ser alterado');
    assert.ok(!(await (await get('/fora/app')).text()).includes('uso-produto.js'), 'fora dos prefixos medidos');
    const js = await get('/uso-produto.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
  });

  await t('rota do pulso: sem sessão 401; pessoa inativa 403; com sessão soma; relógio único', async () => {
    assert.equal((await post('/finance/api/uso/pulso', { area: 'app' })).status, 401);
    assert.equal((await post('/finance/api/uso/pulso', { area: 'app' }, { Cookie: cookieDe('fin_sess', { uid: 'fantasma' }) })).status, 403);
    const c = { Cookie: cookieDe('fin_sess', { uid: 'p-ana' }) };
    const r = await post('/finance/api/uso/pulso', { area: 'caixa' }, c);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).somado, 30);
    assert.equal((await (await post('/finance/api/uso/pulso', { area: 'caixa' }, c)).json()).somado, 0);
    assert.equal((await post('/kids/api/uso/pulso', {}, c)).status, 401, 'cookie do Finance não abre o pulso do Kids');
  });

  await t('visitas: quem está logado ganha pprod/pid; anônimo e robô não', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    await get('/finance/app', { Cookie: cookieDe('fin_sess', { uid: 'p-bia' }) });
    await get('/finance/app');
    await fetch(BASE + '/finance/app', { headers: { 'User-Agent': 'Googlebot/2.1', Cookie: cookieDe('fin_sess', { uid: 'p-bia' }) } });
    await get('/kids/x', { Cookie: cookieDe('fin_sess', { uid: 'p-bia' }) });   // cookie errado para o prefixo
    await new Promise((r) => setTimeout(r, 200));
    const v = visitas.visitasPorCampo(DATA, hoje, hoje, 'pid', (h) => h.pprod === 'fin');
    assert.deepEqual(Object.keys(v), ['p-bia']);
    assert.equal(v['p-bia'].paginas, 1);
    assert.deepEqual(Object.keys(visitas.visitasPorCampo(DATA, hoje, hoje, 'pid', (h) => h.pprod === 'kids')), []);
    assert.deepEqual(Object.keys(visitas.visitasPorUid(DATA, hoje, hoje)), [], 'não mistura com os alunos da Academy');
  });

  await t('relatório e CSV: só admin; junta visitas e tempo; CSV auditado e sem fórmula', async () => {
    assert.equal((await get('/staff/api/uso-produtos/fin', { 'x-u': 'op' })).status, 403);
    assert.equal((await get('/staff/api/uso-produtos/fin.csv', { 'x-u': 'op' })).status, 403);
    assert.equal((await get('/staff/api/uso-produtos/nao-existe')).status, 404);
    const r = await (await get('/staff/api/uso-produtos/fin?dias=7')).json();
    const ana = r.pessoas.find((x) => x.id === 'p-ana'), bia = r.pessoas.find((x) => x.id === 'p-bia');
    assert.ok(ana && ana.tempo_total_seg >= 30 && ana.areas[0].area === 'caixa');
    assert.ok(bia && bia.visitas.paginas === 1);
    const lista = await (await get('/staff/api/uso-produtos')).json();
    assert.equal(lista.produtos.length, 2);
    assert.equal((await get('/staff/api/uso-produtos/fin/p-ana')).status, 200);
    assert.equal((await get('/staff/api/uso-produtos/fin/fantasma')).status, 404);
    const csv = await (await get('/staff/api/uso-produtos/fin.csv')).text();
    assert.ok(csv.includes(';') && !/(^|;)=HYPERLINK/.test(csv), 'nome começando com = precisa ser neutralizado');
    assert.ok(uso.csv(await uso.relatorio(FAKES[0], 7)).charCodeAt(0) === 0xFEFF, 'sem BOM o Excel quebra os acentos');
    assert.ok(AUDIT.some((a) => a.acao === 'relatorio.uso-produto.csv'), 'exportar dados pessoais tem de ficar na auditoria');
  });

  await t('cliente: só pulsa visível e com a pessoa mexendo; o endereço sai do prefixo do produto', async () => {
    let t0 = 1e6; const doc = { visibilityState: 'visible' }; const env = [];
    const c = Cliente.criar({ janela: { location: { pathname: '/finance/caixa', hash: '' } }, documento: doc, agora: () => t0, enviar: (u, b) => env.push([u, b]) });
    assert.deepEqual(c.pulsar(), { url: '/finance/api/uso/pulso', corpo: { area: 'caixa' } });
    doc.visibilityState = 'hidden'; assert.equal(c.pulsar(), null);
    doc.visibilityState = 'visible'; t0 += Cliente.OCIOSO_MS + 1; assert.equal(c.pulsar(), null);
    c.marcar(); assert.ok(c.pulsar());
    assert.deepEqual(Cliente.ondeEstou('/gestao/app', '#/reservas?x=1'), { prefixo: '/gestao', area: 'app' });
    assert.deepEqual(Cliente.ondeEstou('/crm', '#leads'), { prefixo: '/crm', area: 'leads' });
    assert.deepEqual(Cliente.ondeEstou('/', ''), null);
    assert.deepEqual(Cliente.ondeEstou('/livros/o-livro', '', true), { prefixo: '/livros', area: 'livros' });
    const l = Cliente.criar({ janela: { location: { pathname: '/minha-conta', hash: '' } }, documento: doc, agora: () => t0, pulsoUrl: '/livraria/api/uso/pulso', areaNoPrefixo: true, enviar: () => {} });
    l.marcar();
    assert.deepEqual(l.pulsar(), { url: '/livraria/api/uso/pulso', corpo: { area: 'minha-conta' } }, 'o servidor diz para onde mandar o pulso');
    env.forEach(([, b]) => assert.deepEqual(Object.keys(b), ['area']));
  });

  await t('cliente: 401/403/404 do pulso para de vez', async () => {
    let n = 0;
    const w = { location: { pathname: '/finance/app', hash: '' }, fetch: async () => { n++; return { status: 401 }; } };
    const c = Cliente.criar({ janela: w, documento: { visibilityState: 'visible' } });
    c.pulsar(); await new Promise((r) => setImmediate(r)); c.pulsar();
    assert.equal(n, 1);
  });

  await t('tabela real de produtos: prefixos e cookies únicos, e cada cookie existe no fonte do produto', async () => {
    const P = Mod.PRODUTOS;
    assert.equal(new Set(P.map((p) => p.id)).size, P.length);
    assert.equal(new Set(P.map((p) => p.prefixo)).size, P.length);
    assert.equal(new Set(P.map((p) => p.cookie)).size, P.length);
    const FONTE = { crm: 'crm/rotas-cliente.js', gestao: 'vsm/rotas-cliente.js', finance: 'financeiro/rotas-app.js', closet: 'closet/rotas-conta.js', vitrine: 'vitrine/rotas-conta.js',
      kids: 'kids/rotas-conta.js', altavista: 'alta-vista/rotas-conta.js', docs: 'vdocs/auth.js', projetos: 'vpe/auth.js', juridico: 'legal-saas/rotas-cliente.js',
      origena: 'origena/sessao.js', clientejur: 'legal/portal-cliente.js', livraria: 'livraria/conta.js', hospede: 'server.js' };
    for (const p of P) {
      const src = fs.readFileSync(path.join(__dirname, '..', FONTE[p.id]), 'utf8');
      assert.ok(src.includes(`'${p.cookie}'`), `${p.id}: o cookie ${p.cookie} não está em ${FONTE[p.id]}`);
      // Livraria usa caminho "/" de propósito (a loja não tem prefixo comum); os demais ficam presos ao próprio prefixo.
      if (p.id !== 'livraria') assert.ok(new RegExp(`path:\\s*'${p.prefixo}'`).test(src), `${p.id}: o cookie não é restrito ao prefixo ${p.prefixo}`);
    }
  });

  await t('tabela real de produtos: a consulta de pessoa roda no banco de CADA produto (tabela e colunas existem)', async () => {
    // O leitor engole erro de propósito (a rota não pode cair); sem este teste uma tabela renomeada viraria "pessoa inexistente" em silêncio.
    const BANCO = { crm: ['../crm/db', 'tenant_users'], gestao: ['../vsm/db', 'tenant_users'], finance: ['../financeiro/db', 'tenant_users'], closet: ['../closet/db', 'users'],
      vitrine: ['../vitrine/db', 'users'], kids: ['../kids/db', 'users'], altavista: ['../alta-vista/db', 'clientes'], docs: ['../vdocs/db', 'users'], projetos: ['../vpe/db', 'users'], juridico: ['../legal-saas/db', 'tenant_users'],
      clientejur: ['../legal/db', 'client_accounts'], livraria: ['../livraria/db', 'customers'] };
    for (const p of Mod.PRODUTOS.filter((x) => BANCO[x.id])) {
      const [mod, tabela] = BANCO[p.id];
      const db = require(path.join(__dirname, mod)).db;
      const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
      for (const c of ['id', 'email']) assert.ok(cols.includes(c), `${p.id}: ${tabela} sem coluna ${c}`);
      if (p.id !== 'clientejur') assert.ok(cols.includes('nome') || cols.includes('name'), `${p.id}: ${tabela} sem nome`);   // clientejur: o nome vem do JOIN com clients
      const id = 'teste-' + p.id;
      db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);   // não pode lançar
      assert.equal(await p.pessoa(id), null);
    }
    // Origena (PostgreSQL) sem banco configurado devolve null, nunca lança; Hóspede lê o JSON.
    assert.equal(await Mod.PRODUTOS.find((x) => x.id === 'origena').pessoa('x'), null);
    fs.writeFileSync(path.join(DATA, 'hospedes.json'), JSON.stringify([{ id: 'h-1', nome: 'Hóspede Um', email: 'h@t' }]));
    process.env.DATA_DIR = DATA;
    assert.deepEqual(await Mod.PRODUTOS.find((x) => x.id === 'hospede').pessoa('h-1'), { id: 'h-1', nome: 'Hóspede Um', email: 'h@t' });
    assert.equal(await Mod.PRODUTOS.find((x) => x.id === 'hospede').pessoa('outro'), null);
  });

  await t('produtos de sessão própria: Hóspede lê hid/tipo, Origena lê sub, Livraria lê o token opaco e casa os caminhos da loja', async () => {
    const por = (id) => Mod.PRODUTOS.find((x) => x.id === id);
    const req = (cookies) => ({ cookies });
    assert.equal(Mod.quemEstaLogado(por('hospede'), req({ hospede_token: jwt.sign({ hid: 'h-1', tipo: 'hospede' }, SEG) }), SEG), 'h-1');
    assert.equal(Mod.quemEstaLogado(por('hospede'), req({ hospede_token: jwt.sign({ hid: 'h-1', tipo: 'outro' }, SEG) }), SEG), '', 'tipo errado');
    assert.equal(Mod.quemEstaLogado(por('origena'), req({ origena_sess: jwt.sign({ sub: 'u-9', v: 1 }, SEG) }), SEG), 'u-9');
    assert.equal(Mod.quemEstaLogado(por('origena'), req({ origena_sess: jwt.sign({ uid: 'u-9' }, SEG) }), SEG), '', 'sem o campo sub não identifica');
    assert.equal(Mod.quemEstaLogado(por('clientejur'), req({ legal_cli: jwt.sign({ aid: 'a-1' }, SEG) }), SEG), 'a-1');
    assert.equal(Mod.quemEstaLogado(por('livraria'), req({}), SEG), '');
    assert.equal(Mod.quemEstaLogado(por('livraria'), req({ livraria_sess: 'token-que-nao-existe' }), SEG), '');
    const L = [por('livraria')];
    for (const c of ['/livros', '/livros/o-livro', '/minha-conta', '/checkout', '/pacotes/x', '/livraria/api/x']) assert.equal(Mod.produtoDoCaminho(L, c) && Mod.produtoDoCaminho(L, c).id, 'livraria', c);
    for (const c of ['/', '/finance/app', '/livrosx', '/blog']) assert.equal(Mod.produtoDoCaminho(L, c), null, c);
  });

  srv.close();
  console.log(`\n${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach((f) => console.log(' - ' + f)); process.exit(1); }
  process.exit(0);
})();
