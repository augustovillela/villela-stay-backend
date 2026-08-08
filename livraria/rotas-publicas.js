// =====================================================================
// Livraria Villela — rotas públicas (loja) + APIs + webhook + download
// =====================================================================
'use strict';

function registrarRotasPublicas(app, deps) {
  const { repo, pagamentos, eventos, fluxo, storefront, legais, atualizacoes, downloads, urls } = deps;
  const fs = require('fs');
  const path = require('path');
  const amostra = require('./amostra');

  // Nunca cachear as APIs da loja.
  app.use('/livraria/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ----------------------------------------------------- páginas (SEO server-side)
  app.get('/livros', (req, res) => {
    // ?categoria=<slug> e ?q=<busca> — filtram no servidor (funciona sem JS e é indexável)
    const filtro = { categoria: String(req.query.categoria || '').slice(0, 80), q: String(req.query.q || '').slice(0, 120) };
    res.type('html').send(storefront.vitrine(repo.Books.listarPublico(), filtro));
  });
  // atualizações dos livros — endereço impresso na última página; vem ANTES de /livros/:slug
  app.get('/livros/atualizacoes', (req, res) => {
    res.type('html').send(atualizacoes.atualizacoes());
  });
  // Slugs antigos que já circularam publicamente → 301 para o slug atual (não quebra link já dado).
  const SLUGS_LEGADOS = {
    'claude-ai-na-pratcia': 'claude-ai-na-pratica',
    'domine-o-claude-na-advocacia': 'claude-ai-para-advogados-guia-visual',
  };

  // ---- Folhear (amostra): leitor + arquivo. Vêm ANTES de /livros/:slug por clareza.
  // A lib do leitor é servida do próprio backend (nada de CDN): 1 arquivo + worker.
  const PDFJS_DIR = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build');
  app.get('/livros/pdfjs/:arquivo(pdf.mjs|pdf.worker.mjs)', (req, res) => {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(path.join(PDFJS_DIR, req.params.arquivo));
  });

  const livroPublico = (slug) => {
    const b = repo.Books.porSlug(String(slug || ''));
    return b && b.ativo ? b : null;
  };

  app.get('/livros/:slug/folhear', (req, res) => {
    const legado = SLUGS_LEGADOS[req.params.slug];
    if (legado) return res.redirect(301, `/livros/${legado}/folhear`);
    const b = livroPublico(req.params.slug);
    if (!b || !amostra.temAmostra(repo, b)) return res.redirect(302, '/livros/' + (b ? b.slug : ''));
    res.type('html').send(storefront.folhear(b));
  });

  // O PDF da amostra: gerado sob demanda e cacheado em disco. Inline (o leitor
  // desenha em canvas), nunca indexável, e sem substituir o download do comprador.
  app.get('/livros/:slug/amostra.pdf', async (req, res) => {
    const b = livroPublico(req.params.slug);
    if (!b) return res.status(404).end();
    try {
      const am = await amostra.obterAmostra(repo, b);
      if (!am) return res.status(404).end();
      // sendFile responde Range: o leitor busca só os trechos de que precisa e a
      // 1ª página aparece sem baixar a amostra inteira (livro ilustrado é pesado).
      res.sendFile(am.caminho, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${repo.slugify(b.titulo)}-amostra.pdf"`,
          'Cache-Control': 'public, max-age=3600',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      }, (err) => { if (err && !res.headersSent) res.status(500).end(); });
    } catch (e) {
      console.error('[livraria] amostra:', e.message);
      res.status(500).end();
    }
  });

  app.get('/livros/:slug', (req, res) => {
    const legado = SLUGS_LEGADOS[req.params.slug];
    if (legado) return res.redirect(301, '/livros/' + legado);
    const b = repo.Books.porSlug(req.params.slug);
    if (!b || !b.ativo) return res.status(404).type('html').send(storefront.vitrine(repo.Books.listarPublico()));
    res.type('html').send(storefront.paginaLivro({ ...b, tem_amostra: amostra.temAmostra(repo, b) }));
  });
  app.get('/checkout', (req, res) => {
    const b = req.query.livro ? repo.Books.porSlug(String(req.query.livro)) : null;
    if (!b || !b.ativo) return res.redirect(302, '/livros');
    const tipo = ['pdf', 'impresso', 'combo'].includes(String(req.query.tipo)) ? String(req.query.tipo) : 'pdf';
    res.type('html').send(storefront.checkout(b, tipo));
  });
  app.get('/obrigado', (req, res) => {
    const order = req.query.p ? repo.Orders.obter(String(req.query.p)) : null;
    res.type('html').send(storefront.obrigado(order));
  });
  app.get('/minha-biblioteca', (req, res) => {
    const order = req.query.p ? repo.Orders.obter(String(req.query.p)) : null;
    const tokensPorLivro = {};
    if (order) for (const it of (order.itens || [])) tokensPorLivro[it.book_id] = repo.Tokens.daOrder(order.id).filter(t => t.book_id === it.book_id);
    res.type('html').send(storefront.biblioteca(order, tokensPorLivro));
  });
  app.get('/suporte-livros', (req, res) => res.type('html').send(storefront.suporte()));

  // páginas legais
  app.get('/termos-de-uso', (req, res) => res.type('html').send(legais.termos()));
  app.get('/politica-de-privacidade', (req, res) => res.type('html').send(legais.privacidade()));
  app.get('/politica-de-compra-e-entrega', (req, res) => res.type('html').send(legais.compraEntrega()));
  app.get('/politica-de-livro-impresso', (req, res) => res.type('html').send(legais.livroImpresso()));
  app.get('/politica-de-reembolso', (req, res) => res.type('html').send(legais.reembolso()));

  // ----------------------------------------------------- download seguro
  app.get('/download/:token', downloads.servirDownload(repo));

  // ----------------------------------------------------- API: validar cupom
  app.post('/livraria/api/cupom', (req, res) => {
    const d = req.body || {};
    const items = Array.isArray(d.items) ? d.items : [];
    if (!d.codigo || !items.length) return res.status(400).json({ ok: false, motivo: 'Dados insuficientes.' });
    // subtotal a partir do banco (nunca do cliente)
    let subtotal = 0; const bookIds = [];
    for (const it of items) {
      const b = repo.Books.obter(it.book_id); if (!b) continue;
      const col = { pdf: 'preco_pdf', impresso: 'preco_impresso', combo: 'preco_combo' }[it.tipo] || 'preco_pdf';
      if (b[col] != null) { subtotal += b[col] * (Number(it.quantidade) || 1); bookIds.push(b.id); }
    }
    const av = repo.Coupons.avaliar(d.codigo, bookIds, subtotal);
    if (!av.ok) return res.json({ ok: false, motivo: av.motivo });
    res.json({ ok: true, desconto: av.desconto });
  });

  // ----------------------------------------------------- API: criar checkout
  app.post('/livraria/api/checkout', async (req, res) => {
    try {
      const d = req.body || {};
      if (!d.customer || !d.customer.email || !d.customer.nome) return res.status(400).json({ erro: 'Informe nome e e-mail.' });
      if (!Array.isArray(d.items) || !d.items.length) return res.status(400).json({ erro: 'Carrinho vazio.' });
      if (!d.customer.consentimentos || !d.customer.consentimentos.termos) return res.status(400).json({ erro: 'É preciso aceitar os Termos.' });
      // exige endereço completo em TODO pedido (usado para remessa e cadastro do comprador)
      const end = d.endereco_entrega || {};
      const clean = (v) => String(v == null ? '' : v).trim();
      const faltando = [];
      if (!clean(d.customer.estado)) faltando.push('estado');
      if (!clean(d.customer.cidade)) faltando.push('cidade');
      if (!clean(end.cep)) faltando.push('CEP');
      if (!clean(end.logradouro)) faltando.push('logradouro');
      if (!clean(end.numero)) faltando.push('número');
      if (!clean(end.bairro)) faltando.push('bairro');
      if (faltando.length) return res.status(400).json({ erro: 'Informe o endereço completo para entrega: ' + faltando.join(', ') + '.' });
      // guarda o mesmo endereço também no cadastro do cliente (customer.endereco)
      d.customer.endereco = { cep: clean(end.cep), logradouro: clean(end.logradouro), numero: clean(end.numero), complemento: clean(end.complemento), bairro: clean(end.bairro) };
      if (!pagamentos.disponivel()) return res.status(503).json({ erro: 'Pagamento online em configuração. Fale conosco pelo WhatsApp.' });
      const order = repo.Orders.criar({ customer: d.customer, items: d.items, cupom: d.cupom, origem: d.origem, endereco_entrega: d.endereco_entrega });
      const prov = pagamentos.provedor('mercadopago');
      const pref = await prov.criarCheckout(order, {
        success: urls.obrigado(order.id), pending: urls.obrigado(order.id), failure: urls.obrigado(order.id),
        notification: urls.webhook(),
      });
      repo.Payments.registrar(order.id, { provider: 'mercadopago', provider_ref: pref.ref, status: 'pendente', valor: order.valor_total });
      res.json({ ok: true, url: pref.url, order_id: order.id });
    } catch (e) {
      console.error('[livraria checkout]', e.message);
      res.status(400).json({ erro: e.message || 'Não foi possível iniciar o pagamento.' });
    }
  });

  // ----------------------------------------------------- API: biblioteca por e-mail
  // Envia por e-mail os links das compras pagas daquele e-mail (não revela nada na resposta).
  app.post('/livraria/api/biblioteca-email', async (req, res) => {
    const email = String((req.body && req.body.email) || '').toLowerCase().trim();
    res.json({ ok: true }); // resposta neutra (não enumera contas)
    if (!email) return;
    try {
      const cli = repo.Customers.porEmail(email);
      if (!cli) return;
      const pagas = repo.Customers.comprasDe(cli.id).filter(o => o.status === 'pago');
      if (!pagas.length) return;
      const linhas = pagas.map(o => `<li><a href="${urls.biblioteca(o.id)}">Pedido de ${new Date(o.created_at).toLocaleDateString('pt-BR')} — ${repo.brl(o.valor_total)}</a></li>`).join('');
      const html = storefront.pagina ? null : null; // usa template simples
      const corpo = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2 style="color:#1B2A4A">Sua biblioteca — Livraria Villela</h2><p>Aqui estão seus pedidos e acessos:</p><ul>${linhas}</ul><p style="color:#8a9296;font-size:13px">Se você não pediu isto, ignore este e-mail.</p></div>`;
      await deps.enviarEmail(email, 'Seus livros — Livraria Villela', corpo);
      repo.Notif.log('email', { destino: email, assunto: 'biblioteca', status: 'enviado' });
    } catch (e) { console.error('[biblioteca-email]', e.message); }
  });

  // ----------------------------------------------------- webhook Mercado Pago (isolado)
  app.post('/livraria/webhooks/mercadopago', async (req, res) => {
    res.sendStatus(200); // responde rápido; processa em seguida
    try {
      const q = req.query || {}, b = req.body || {};
      const tipo = b.type || q.type || q.topic || '';
      const payId = (b.data && b.data.id) || q['data.id'] || (tipo === 'payment' ? q.id : null);
      if (!payId || (tipo && !/payment/i.test(String(tipo)))) return;
      const prov = pagamentos.provedor('mercadopago');
      const pag = await prov.consultarPagamento(payId);
      if (!pag) return;
      if (!pag.externalRef.startsWith('livro:')) return; // não é da livraria (conta do hóspede usa outro webhook)
      const orderId = pag.externalRef.slice('livro:'.length);
      // idempotência por (provider,payment_id)
      const ev = repo.Webhooks.registrar('mercadopago', pag.provider_payment_id, pag.status, pag.raw);
      if (!ev.novo) return; // já processado
      if (pag.status === 'aprovado') { await fluxo.confirmarPagamento(orderId, pag); repo.Webhooks.marcar(ev.id, 'confirmado'); }
      else if (pag.status === 'recusado') { await fluxo.registrarRecusa(orderId, pag); repo.Webhooks.marcar(ev.id, 'recusado'); }
      else if (pag.status === 'reembolsado') { const o = repo.Orders.obter(orderId); if (o) await fluxo.reembolsar(orderId, { id: 'mercadopago', nome: 'Mercado Pago' }, ''); repo.Webhooks.marcar(ev.id, 'reembolsado'); }
      else { repo.Webhooks.marcar(ev.id, 'pendente:' + pag.status); }
    } catch (e) { console.error('[livraria mp webhook]', e.message); }
  });
}

module.exports = { registrarRotasPublicas };
