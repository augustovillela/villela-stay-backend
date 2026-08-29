// =====================================================================
// Livraria — suíte de testes.  npm run test:livraria
//
// Sobe o módulo real com auth de staff injetada e banco descartável.
//
// A Livraria era o ÚNICO produto que movimenta dinheiro e faz entrega
// irreversível sem nenhum teste — e, sem suíte, o portão de qualidade
// também não tinha o que rodar quando alguém mexia nela. O foco aqui é
// exatamente esses dois eixos:
//
//   DINHEIRO   — o valor pago tem de bater com o cobrado; webhook repetido
//                não pode pagar duas vezes; preço é centavo inteiro.
//   ENTREGA    — o PDF não volta depois de baixado. Então: só quem pagou
//                baixa, o link expira, o limite é respeitado, o token de um
//                pedido não serve para outro, e bloquear corta na hora.
// =====================================================================
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const express = require('express');

process.env.DATA_DIR = path.join(os.tmpdir(), 'livraria-selftest-' + process.pid + '-' + Date.now());
process.env.NODE_ENV = 'development';
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

// ---- staff falso: o Portal Staff administra a livraria ----
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

const emailsEnviados = [];
const app = express();
app.use(express.json({ limit: '4mb' }));
require('./index').montar(app, {
  express, requireAuth, requireAdmin,
  lerUsuarios: () => [], salvarUsuarios: () => {},
  enviarEmail: async (to, ass) => { emailsEnviados.push({ to, ass }); return true; },
  alertaAugusto: async () => {},
});

const repo = require('./repo');
// O fluxo e uma fabrica (criarFluxo) e recebe as mesmas pecas que o index monta.
const urls = {
  biblioteca: (id) => 'http://teste/minha-biblioteca?p=' + id,
  obrigado: (id) => 'http://teste/obrigado?p=' + id,
  webhook: () => 'http://teste/livraria/webhooks/mercadopago',
  checkoutRetry: () => 'http://teste/livros',
  download: (t) => 'http://teste/download/' + t,
};
const fluxo = require('./fluxo').criarFluxo({
  repo,
  eventos: require('./eventos').criarEventos({ repo }),
  emails: require('./emails'),
  enviarEmail: async (to, ass) => { emailsEnviados.push({ to, ass }); return true; },
  enviarWhatsApp: async () => true,
  alertaAugusto: async () => {},
  urls,
});
const { PDF_DIR } = require('./db');

// ---- harness ----
let ok = 0; const falhas = [];
function teste(nome, fn) {
  try { fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); }
}
async function testeAsync(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); }
}
let BASE = '';
async function req(metodo, caminho, corpo) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'x-test-user': 'adm' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    redirect: 'manual',
  });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { status: r.status, json, texto, headers: r.headers };
}

// ---- fixtura: um livro com PDF de verdade no disco ----
const PRECO_PDF = 4990;               // centavos — o schema é INTEGER em centavos
function semearLivro(titulo = 'Livro de Teste') {
  const b = repo.Books.criar({
    titulo, autor: 'Augusto Villela', preco_pdf: PRECO_PDF, ativo: 1,
    descricao_curta: 'x', categoria: 'teste',
  });
  fs.mkdirSync(PDF_DIR, { recursive: true });
  const nome = 'teste-' + b.id + '.pdf';
  const caminhoPdf = path.join(PDF_DIR, nome);
  fs.writeFileSync(caminhoPdf, '%PDF-1.4\n% conteudo de teste\n');
  // tamanho REAL do arquivo: a rota manda Content-Length a partir dele, e um
  // numero chutado deixa o cliente esperando o byte que nunca chega.
  const tamanho = fs.statSync(caminhoPdf).size;
  repo.Files.adicionar(b.id, { filename: nome, original_name: 'teste.pdf', mime: 'application/pdf', tamanho });
  return b;
}
const CLIENTE = {
  nome: 'Comprador Um', email: 'comprador@exemplo.test', estado: 'DF', cidade: 'Brasília',
  consentimentos: { termos: true },
  endereco: { cep: '71680-000', logradouro: 'SMDB 29', numero: '1', bairro: 'Lago Sul' },
};
const pedidoNovo = (book) => repo.Orders.criar({
  customer: CLIENTE, items: [{ book_id: book.id, tipo: 'pdf', quantidade: 1 }],
  origem: 'teste', endereco_entrega: CLIENTE.endereco,
});

(async () => {
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  BASE = 'http://127.0.0.1:' + srv.address().port;
  console.log('\nLIVRARIA — selftest\n');

  console.log('dinheiro');

  await testeAsync('pedido nasce pendente e com o preço do livro, em centavos', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    assert.strictEqual(o.status, 'pendente');
    assert.strictEqual(Number(o.valor_total), PRECO_PDF, 'valor_total tem de ser centavo inteiro');
    assert.strictEqual(Number.isInteger(Number(o.valor_total)), true, 'nada de float em dinheiro');
  });

  await testeAsync('pagamento com o valor certo libera a entrega', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const r = await fluxo.confirmarPagamento(o.id, {
      provider_payment_id: 'mp-ok-1', valor: PRECO_PDF, metodo: 'pix', raw: {} });
    assert.ok(r, 'devia ter confirmado');
    assert.strictEqual(r.status, 'pago');
    assert.strictEqual(r.entrega_digital, 'liberado');
  });

  await testeAsync('pagamento com valor MENOR é recusado e nada é liberado', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const r = await fluxo.confirmarPagamento(o.id, {
      provider_payment_id: 'mp-menor', valor: 100, metodo: 'pix', raw: {} });
    assert.strictEqual(r, null, 'valor divergente não pode confirmar');
    const depois = repo.Orders.obter(o.id);
    assert.strictEqual(depois.status, 'pendente', 'o pedido tem de continuar pendente');
    assert.notStrictEqual(depois.entrega_digital, 'liberado', 'a entrega do PDF é irreversível: não pode liberar');
  });

  await testeAsync('confirmar duas vezes não paga duas vezes (idempotente)', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    await fluxo.confirmarPagamento(o.id, { provider_payment_id: 'mp-idem', valor: PRECO_PDF, raw: {} });
    const segunda = await fluxo.confirmarPagamento(o.id, { provider_payment_id: 'mp-idem', valor: PRECO_PDF, raw: {} });
    assert.strictEqual(segunda.status, 'pago');
    const tokens = repo.Tokens.daOrder(o.id);
    assert.ok(tokens.length <= 1, 'não pode emitir um token de download por reenvio do webhook');
  });

  teste('webhook repetido é reconhecido pelo id do provedor', () => {
    const a = repo.Webhooks.registrar('mercadopago', 'evt-1', 'aprovado', {});
    const b = repo.Webhooks.registrar('mercadopago', 'evt-1', 'aprovado', {});
    assert.strictEqual(!!a.novo, true, 'o primeiro é novo');
    assert.strictEqual(!!b.novo, false, 'o reenvio NÃO pode ser novo');
  });

  console.log('\nentrega (o PDF não volta depois de baixado)');

  await testeAsync('quem pagou baixa, e o download conta', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    await fluxo.confirmarPagamento(o.id, { provider_payment_id: 'mp-dl', valor: PRECO_PDF, raw: {} });
    const tk = repo.Tokens.gerar(o.id, b.id, { horas: 72, max: 5 });
    const r = await req('GET', '/download/' + tk.id);
    assert.strictEqual(r.status, 200);
    assert.ok(String(r.headers.get('content-type') || '').includes('pdf'));
    assert.ok(String(r.headers.get('content-disposition') || '').includes('attachment'), 'tem de baixar, não abrir inline');
    assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(Number(repo.Tokens.obter(tk.id).download_count), 1, 'o contador tem de subir');
  });

  await testeAsync('link expirado não entrega', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const tk = repo.Tokens.gerar(o.id, b.id, { horas: -1, max: 5 });   // já nasceu vencido
    const r = await req('GET', '/download/' + tk.id);
    assert.strictEqual(r.status, 403);
    assert.ok(/expirou/i.test(r.texto), 'a página tem de dizer que expirou');
  });

  await testeAsync('limite de downloads é respeitado', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const tk = repo.Tokens.gerar(o.id, b.id, { horas: 72, max: 1 });
    assert.strictEqual((await req('GET', '/download/' + tk.id)).status, 200);
    const segunda = await req('GET', '/download/' + tk.id);
    assert.strictEqual(segunda.status, 403, 'passou do limite');
    assert.ok(/limite/i.test(segunda.texto));
  });

  await testeAsync('token bloqueado corta na hora', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const tk = repo.Tokens.gerar(o.id, b.id, {});
    repo.Tokens.bloquear(tk.id, false);
    const r = await req('GET', '/download/' + tk.id);
    assert.strictEqual(r.status, 403);
  });

  await testeAsync('token inventado dá 404, e não vaza se o pedido existe', async () => {
    const r = await req('GET', '/download/naoexiste-' + Date.now());
    assert.strictEqual(r.status, 404);
    assert.ok(!/pedido|order/i.test(r.texto), 'a página de erro não pode falar de pedido');
  });

  await testeAsync('o token de um pedido não serve para o livro de outro', async () => {
    const b1 = semearLivro('Livro A'), b2 = semearLivro('Livro B');
    const o1 = pedidoNovo(b1), o2 = pedidoNovo(b2);
    const t1 = repo.Tokens.gerar(o1.id, b1.id, {});
    const t2 = repo.Tokens.gerar(o2.id, b2.id, {});
    assert.notStrictEqual(t1.id, t2.id, 'tokens têm de ser distintos');
    assert.strictEqual(repo.Tokens.obter(t1.id).book_id, b1.id);
    assert.strictEqual(repo.Tokens.obter(t2.id).book_id, b2.id, 'cada token está preso ao seu livro');
  });

  await testeAsync('todo acesso ao PDF fica registrado (ok e recusa)', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const tk = repo.Tokens.gerar(o.id, b.id, { horas: 72, max: 1 });
    await req('GET', '/download/' + tk.id);      // ok
    await req('GET', '/download/' + tk.id);      // limite
    const { db } = require('./db');
    const n = db.prepare('SELECT COUNT(*) n FROM download_logs WHERE token_id = ?').get(tk.id).n;
    assert.ok(n >= 2, 'a entrega e a recusa têm de deixar rastro');
  });

  console.log('\nloja');

  await testeAsync('checkout recusa carrinho vazio e sem aceite dos termos', async () => {
    assert.strictEqual((await req('POST', '/livraria/api/checkout', { customer: CLIENTE, items: [] })).status, 400);
    const semTermos = { ...CLIENTE, consentimentos: {} };
    const b = semearLivro();
    const r = await req('POST', '/livraria/api/checkout', {
      customer: semTermos, items: [{ book_id: b.id, tipo: 'pdf', quantidade: 1 }],
      endereco_entrega: CLIENTE.endereco });
    assert.strictEqual(r.status, 400);
  });

  await testeAsync('páginas públicas da loja respondem', async () => {
    for (const p of ['/livros', '/termos-de-uso', '/politica-de-privacidade', '/politica-de-compra-e-entrega']) {
      assert.strictEqual((await req('GET', p)).status, 200, p + ' não respondeu');
    }
  });

  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  srv.close();
  try { fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  if (falhas.length) { falhas.forEach((f) => console.log('  ✗', f)); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FALHA GERAL:', e); process.exit(1); });
