// =====================================================================
// Vitrine — verificação de produção DE FORA (homologação).
//   npm run verificar:vitrine -- https://vitrine.villelastay.com.br
// Confere páginas, SEO, API, segurança básica e avisos obrigatórios.
// Sai com código 1 só em bloqueio real.
// =====================================================================
'use strict';
const BASE = (process.argv[2] || 'https://villela-stay-backend.onrender.com').replace(/\/+$/, '');
let ok = 0; const falhas = [];

async function pega(caminho, opts = {}) {
  const r = await fetch(BASE + caminho, { redirect: 'manual', ...opts });
  return { st: r.status, texto: await r.text(), headers: r.headers };
}
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); }
}
const assert = require('assert');

(async () => {
  console.log('Vitrine — verificação de produção em', BASE, '\n');

  await t('home responde com a marca e o hero', async () => {
    const r = await pega('/vitrine');
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('Vitrine') && r.texto.includes('Explorar ofertas'));
  });
  await t('busca, categoria e institucionais respondem 200', async () => {
    for (const p of ['/vitrine/busca', '/vitrine/c/eletronicos', '/vitrine/como-funciona', '/vitrine/venda-conosco',
      '/vitrine/seguranca', '/vitrine/termos', '/vitrine/privacidade', '/vitrine/proibidos', '/vitrine/devolucao', '/vitrine/entrar']) {
      assert.equal((await pega(p)).st, 200, p);
    }
  });
  await t('textos jurídicos ainda carregam a tarja de MINUTA (até o advogado aprovar)', async () => {
    assert.ok((await pega('/vitrine/termos')).texto.includes('MINUTA'));
  });
  await t('robots bloqueia painel/API e o sitemap existe', async () => {
    const rb = await pega('/vitrine/robots.txt');
    assert.ok(rb.texto.includes('Disallow: /vitrine/app') && rb.texto.includes('Disallow: /vitrine/api'));
    assert.equal((await pega('/vitrine/sitemap.xml')).st, 200);
  });
  await t('página de produto tem JSON-LD (se houver catálogo)', async () => {
    const busca = JSON.parse((await pega('/vitrine/api/busca?por_pagina=1')).texto);
    if (!busca.total) { console.log('     (catálogo vazio — pulei o produto)'); return; }
    const r = await pega('/vitrine/p/' + busca.itens[0].slug);
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('application/ld+json'));
  });
  await t('API pública responde JSON e painel exige login', async () => {
    assert.ok(JSON.parse((await pega('/vitrine/api/categorias')).texto).categorias.length >= 5);
    assert.equal((await pega('/vitrine/api/me')).st, 401);
    assert.equal((await pega('/vitrine/api/pedidos')).st, 401);
  });
  await t('webhooks são fechados (genérico 401 sem token; MP responde 200 e valida por assinatura)', async () => {
    const g = await fetch(BASE + '/vitrine/webhooks/pagamento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(g.status, 401);
    const mp = await fetch(BASE + '/vitrine/webhooks/mercadopago', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(mp.status, 200); // exigência do MP: 200 rápido; sem assinatura válida nada é aplicado
  });
  await t('placeholder de imagem é servido com cache', async () => {
    const r = await pega('/vitrine/placeholder/teste.svg');
    assert.equal(r.st, 200);
    assert.ok(String(r.headers.get('cache-control') || '').includes('max-age'));
  });
  await t('HTTPS/host: raiz do domínio vitrine.* redireciona para /vitrine', async () => {
    if (!/vitrine\./.test(BASE)) { console.log('     (base não é o domínio vitrine.* — pulei)'); return; }
    const r = await fetch(BASE + '/', { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.ok(String(r.headers.get('location') || '').includes('/vitrine'));
  });

  console.log(`\n${ok} verificação(ões) OK, ${falhas.length} falha(s).`);
  if (falhas.length) { console.log(falhas.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})();
