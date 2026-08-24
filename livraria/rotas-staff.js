// =====================================================================
// Livraria Villela — rotas administrativas (Portal Staff)
// Prefixo /staff/api/livraria/*. Autenticação via requireAuth (injetado).
// Autorização por papel funcional (permissoesLivraria). Tudo auditado.
// =====================================================================
'use strict';

function registrarRotasStaff(app, deps) {
  const { repo, fluxo, downloads, express, requireAuth, requireAdmin, lerUsuarios, salvarUsuarios } = deps;
  const ipDe = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();

  // guard de permissão funcional (roda depois de requireAuth)
  const pode = (perm) => (req, res, next) => {
    const p = repo.permissoesLivraria(req.user);
    if (!p[perm]) return res.status(403).json({ erro: 'Sem permissão para esta ação (' + perm + ').' });
    next();
  };

  app.use('/staff/api/livraria', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // acesso à livraria: admin OU qualquer papel funcional definido
  const requireLivraria = [requireAuth, (req, res, next) => {
    const p = repo.permissoesLivraria(req.user);
    if (!p || !Object.values(p).some(Boolean)) return res.status(403).json({ erro: 'Sem acesso à Livraria.' });
    next();
  }];

  // meus dados/permissões na livraria (o SPA usa para montar o menu)
  app.get('/staff/api/livraria/eu', ...requireLivraria, (req, res) => {
    res.json({ papel: repo.papelLivrariaDe(req.user), permissoes: repo.permissoesLivraria(req.user), nome: req.user.nome });
  });

  // ------------------------------------------------------- DASHBOARD
  app.get('/staff/api/livraria/dashboard', ...requireLivraria, (req, res) => {
    const { desde, ate } = req.query;
    res.json({
      resumo: repo.Relatorios.resumo(desde, ate),
      mais_vendidos: repo.Relatorios.maisVendidos(desde, ate),
      conversao: repo.Relatorios.conversaoPorLivro(desde, ate),
      cupons: repo.Relatorios.cuponsUsados(desde, ate),
      problematicos: repo.Relatorios.problematicos(),
    });
  });

  // ------------------------------------------------------- LIVROS (CRUD)
  app.get('/staff/api/livraria/livros', ...requireLivraria, (req, res) => res.json({ livros: repo.Books.listar() }));
  app.get('/staff/api/livraria/livros/:id', ...requireLivraria, (req, res) => {
    const b = repo.Books.obter(req.params.id); if (!b) return res.status(404).json({ erro: 'Livro não encontrado.' });
    res.json({ livro: b, arquivos: repo.Files.listar(b.id), assets: repo.Assets.listar(b.id) });
  });
  app.post('/staff/api/livraria/livros', requireAuth, pode('livros'), (req, res) => {
    const b = repo.Books.criar(req.body || {});
    repo.Audit.log(req.user, 'livro.criar', { entidade: 'book', entidade_id: b.id, detalhe: b.titulo, ip: ipDe(req) });
    res.json({ ok: true, livro: b });
  });
  app.patch('/staff/api/livraria/livros/:id', requireAuth, pode('livros'), (req, res) => {
    const antes = repo.Books.obter(req.params.id); if (!antes) return res.status(404).json({ erro: 'Livro não encontrado.' });
    // alteração de preço exige permissão 'precos'
    const mexeuPreco = ['preco_pdf', 'preco_impresso', 'preco_combo'].some(k => req.body && req.body[k] !== undefined);
    if (mexeuPreco && !repo.permissoesLivraria(req.user).precos) return res.status(403).json({ erro: 'Sem permissão para alterar preços.' });
    const b = repo.Books.atualizar(req.params.id, req.body || {});
    const det = mexeuPreco ? `${b.titulo} (preço alterado)` : b.titulo;
    repo.Audit.log(req.user, mexeuPreco ? 'livro.preco' : 'livro.editar', { entidade: 'book', entidade_id: b.id, detalhe: det, ip: ipDe(req) });
    res.json({ ok: true, livro: b });
  });
  app.delete('/staff/api/livraria/livros/:id', requireAuth, pode('livros'), (req, res) => {
    const b = repo.Books.obter(req.params.id); if (!b) return res.status(404).json({ erro: 'Livro não encontrado.' });
    repo.Books.remover(req.params.id);
    repo.Audit.log(req.user, 'livro.remover', { entidade: 'book', entidade_id: req.params.id, detalhe: b.titulo, ip: ipDe(req) });
    res.json({ ok: true });
  });
  // upload do PDF privado (corpo bruto; até 60MB). Header X-Filename com o nome original.
  app.post('/staff/api/livraria/livros/:id/pdf', requireAuth, pode('livros'),
    express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '60mb' }),
    (req, res) => {
      const b = repo.Books.obter(req.params.id); if (!b) return res.status(404).json({ erro: 'Livro não encontrado.' });
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ erro: 'Envie o arquivo PDF no corpo (Content-Type application/pdf).' });
      if (buf.slice(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ erro: 'Arquivo não parece um PDF válido.' });
      const meta = downloads.salvarPDF(buf, req.headers['x-filename'] || 'livro.pdf');
      const file = repo.Files.adicionar(b.id, meta);
      repo.Audit.log(req.user, 'livro.pdf', { entidade: 'book', entidade_id: b.id, detalhe: `v${file.versao} (${Math.round(meta.tamanho / 1024)}KB)`, ip: ipDe(req) });
      res.json({ ok: true, arquivo: file });
    });
  app.post('/staff/api/livraria/livros/:id/pdf/:fileId/ativar', requireAuth, pode('livros'), (req, res) => {
    const f = repo.Files.ativar(req.params.fileId);
    if (f) repo.Audit.log(req.user, 'livro.pdf.ativar', { entidade: 'book', entidade_id: req.params.id, detalhe: 'v' + f.versao, ip: ipDe(req) });
    res.json({ ok: !!f, arquivo: f });
  });
  app.post('/staff/api/livraria/livros/:id/assets', requireAuth, pode('livros'), (req, res) => {
    const a = repo.Assets.adicionar(req.params.id, req.body || {});
    res.json({ ok: true, asset: a });
  });
  app.delete('/staff/api/livraria/assets/:id', requireAuth, pode('livros'), (req, res) => { repo.Assets.remover(req.params.id); res.json({ ok: true }); });

  // ------------------------------------------------------- PEDIDOS
  app.get('/staff/api/livraria/pedidos', ...requireLivraria, pode('pedidos'), (req, res) => {
    res.json({ pedidos: repo.Orders.listar({ status: req.query.status, impressao: req.query.impressao, limite: req.query.limite }) });
  });
  app.get('/staff/api/livraria/pedidos/:id', ...requireLivraria, pode('pedidos'), (req, res) => {
    const o = repo.Orders.obter(req.params.id); if (!o) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    repo.Audit.log(req.user, 'pedido.ver', { entidade: 'order', entidade_id: o.id, ip: ipDe(req) });
    res.json({ pedido: o, tokens: repo.Tokens.daOrder(o.id), downloads: repo.Tokens.logsDaOrder(o.id), impressos: repo.Print.daOrder(o.id) });
  });
  app.post('/staff/api/livraria/pedidos/:id/reenviar-link', requireAuth, pode('pedidos'), async (req, res) => {
    const r = await fluxo.reenviarLink(req.params.id, (req.body || {}).book_id, req.user, ipDe(req));
    res.status(r.erro ? 400 : 200).json(r);
  });
  app.post('/staff/api/livraria/pedidos/:id/bloquear', requireAuth, pode('pedidos'), async (req, res) => {
    const r = await fluxo.bloquearAcesso(req.params.id, !!(req.body || {}).ativo, req.user, ipDe(req));
    res.status(r.erro ? 400 : 200).json(r);
  });
  app.post('/staff/api/livraria/pedidos/:id/reembolsar', requireAuth, pode('pedidos'), async (req, res) => {
    const r = await fluxo.reembolsar(req.params.id, req.user, ipDe(req));
    res.status(r.erro ? 400 : 200).json(r);
  });
  // marcar pago manualmente (ex.: Pix combinado) — admin/financeiro
  app.post('/staff/api/livraria/pedidos/:id/marcar-pago', requireAuth, pode('pedidos'), async (req, res) => {
    if (!repo.permissoesLivraria(req.user).relatorios && req.user.papel !== 'admin') return res.status(403).json({ erro: 'Sem permissão.' });
    const o = repo.Orders.obter(req.params.id); if (!o) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const upd = await fluxo.confirmarPagamento(req.params.id, { provider_payment_id: 'manual', metodo: 'manual', raw: { manual: true, por: req.user.nome } });
    repo.Audit.log(req.user, 'pedido.marcar-pago', { entidade: 'order', entidade_id: req.params.id, ip: ipDe(req) });
    res.json({ ok: true, pedido: upd });
  });

  // ------------------------------------------------------- CLIENTES
  app.get('/staff/api/livraria/clientes', ...requireLivraria, pode('clientes'), (req, res) => res.json({ clientes: repo.Customers.listar(req.query.q) }));
  app.get('/staff/api/livraria/clientes/:id', ...requireLivraria, pode('clientes'), (req, res) => {
    const c = repo.Customers.obter(req.params.id); if (!c) return res.status(404).json({ erro: 'Cliente não encontrado.' });
    repo.Audit.log(req.user, 'cliente.ver', { entidade: 'customer', entidade_id: c.id, detalhe: c.email, ip: ipDe(req) });
    res.json({ cliente: c, compras: repo.Customers.comprasDe(c.id) });
  });
  app.patch('/staff/api/livraria/clientes/:id', requireAuth, pode('clientes'), (req, res) => {
    const c = repo.Customers.atualizar(req.params.id, req.body || {});
    repo.Audit.log(req.user, 'cliente.editar', { entidade: 'customer', entidade_id: req.params.id, ip: ipDe(req) });
    res.json({ ok: !!c, cliente: c });
  });

  // ------------------------------------------------------- CUPONS
  app.get('/staff/api/livraria/cupons', ...requireLivraria, pode('cupons'), (req, res) => res.json({ cupons: repo.Coupons.listar() }));
  app.post('/staff/api/livraria/cupons', requireAuth, pode('cupons'), (req, res) => {
    const c = repo.Coupons.criar(req.body || {});
    repo.Audit.log(req.user, 'cupom.criar', { entidade: 'coupon', entidade_id: c.id, detalhe: c.codigo, ip: ipDe(req) });
    res.json({ ok: true, cupom: c });
  });
  app.patch('/staff/api/livraria/cupons/:id', requireAuth, pode('cupons'), (req, res) => {
    const c = repo.Coupons.atualizar(req.params.id, req.body || {});
    repo.Audit.log(req.user, 'cupom.editar', { entidade: 'coupon', entidade_id: req.params.id, ip: ipDe(req) });
    res.json({ ok: !!c, cupom: c });
  });
  app.delete('/staff/api/livraria/cupons/:id', requireAuth, pode('cupons'), (req, res) => {
    repo.Coupons.remover(req.params.id);
    repo.Audit.log(req.user, 'cupom.remover', { entidade: 'coupon', entidade_id: req.params.id, ip: ipDe(req) });
    res.json({ ok: true });
  });

  // ------------------------------------------------------- IMPRESSOS
  app.get('/staff/api/livraria/impressos', ...requireLivraria, pode('impressos'), (req, res) => {
    const jobs = repo.Print.listar(req.query.status).map(pj => ({ ...pj, pedido: repo.Orders.obter(pj.order_id), livro: repo.Books.obter(pj.book_id) }));
    res.json({ impressos: jobs });
  });
  app.patch('/staff/api/livraria/impressos/:id', requireAuth, pode('impressos'), async (req, res) => {
    const r = await fluxo.atualizarImpresso(req.params.id, req.body || {}, req.user, ipDe(req));
    res.status(r.erro ? 400 : 200).json(r);
  });

  // ------------------------------------------------------- DOWNLOADS / WEBHOOKS / NOTIF / AUDIT
  app.get('/staff/api/livraria/downloads', ...requireLivraria, pode('pedidos'), (req, res) => {
    const logs = repo.db.prepare('SELECT * FROM download_logs ORDER BY created_at DESC LIMIT 200').all();
    res.json({ downloads: logs });
  });
  app.get('/staff/api/livraria/webhooks', ...requireLivraria, (req, res) => res.json({ webhooks: repo.Webhooks.listar(100) }));
  app.get('/staff/api/livraria/notificacoes', ...requireLivraria, (req, res) => res.json({ notificacoes: repo.Notif.listar(150) }));
  app.get('/staff/api/livraria/auditoria', requireAuth, pode('auditoria'), (req, res) => res.json({ auditoria: repo.Audit.listar(300) }));

  // ------------------------------------------------------- RELATÓRIO CSV
  app.get('/staff/api/livraria/relatorio.csv', requireAuth, pode('relatorios'), (req, res) => {
    const tipo = String(req.query.tipo || 'diario');
    const dias = tipo === 'mensal' ? 30 : tipo === 'semanal' ? 7 : 1;
    const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();
    const r = repo.Relatorios.resumo(desde);
    const mv = repo.Relatorios.maisVendidos(desde);
    const linhas = [
      ['Relatório', tipo], ['Desde', desde], [],
      ['Pedidos pagos', r.pedidos_pagos], ['Receita (R$)', (r.receita / 100).toFixed(2)],
      ['Ticket médio (R$)', (r.ticket_medio / 100).toFixed(2)], ['Pendentes', r.pedidos_pendentes],
      ['Downloads', r.downloads], ['Impressos pendentes', r.impressos_pendentes], ['Reembolsos', r.reembolsos], [],
      ['Mais vendidos'], ['Título', 'Itens', 'Receita (R$)'],
      ...mv.map(m => [m.titulo, m.itens, (m.receita / 100).toFixed(2)]),
    ];
    const csv = '﻿' + linhas.map(l => l.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="livraria-${tipo}.csv"`);
    res.send(csv);
  });

  // ------------------------------------------------------- VENDAS (visão planilha)
  // Uma linha por ITEM vendido (não por pedido): é o formato que se lê como
  // planilha e se soma por livro/formato. `dias` filtra o período; `status`
  // permite ver também pendentes e reembolsados.
  function linhasVendas({ dias = 90, status = 'pago' } = {}) {
    const desde = new Date(Date.now() - Number(dias) * 24 * 3600 * 1000).toISOString();
    const pedidos = repo.Orders.listar({ limite: 1000 })
      .filter(o => (status === 'todos' ? true : o.status === status))
      .filter(o => (o.pago_em || o.created_at) >= desde);
    const linhas = [];
    for (const p of pedidos) {
      const full = repo.Orders.obter(p.id);
      if (!full) continue;
      for (const it of (full.itens || [])) {
        linhas.push({
          data: full.pago_em || full.created_at,
          pedido: full.id,
          cliente: (full.cliente || {}).nome || '',
          email: (full.cliente || {}).email || '',
          uf: (full.cliente || {}).estado || '',
          livro: it.titulo_snapshot,
          formato: it.tipo,
          quantidade: it.quantidade,
          valor: it.preco_unit * it.quantidade,
          cupom: full.cupom_codigo || '',
          status: full.status,
          entrega: full.entrega_digital,
          impresso: full.impressao_status,
          origem: (full.origem && (full.origem.utm_source || full.origem.origem)) || (typeof full.origem === 'string' ? full.origem : '') || 'loja',
        });
      }
    }
    return linhas.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  }

  app.get('/staff/api/livraria/vendas', requireAuth, pode('relatorios'), (req, res) => {
    const linhas = linhasVendas(req.query);
    const total = linhas.reduce((s, l) => s + (l.status === 'pago' ? l.valor : 0), 0);
    const porLivro = {};
    for (const l of linhas.filter(x => x.status === 'pago')) {
      porLivro[l.livro] = porLivro[l.livro] || { itens: 0, receita: 0 };
      porLivro[l.livro].itens += l.quantidade;
      porLivro[l.livro].receita += l.valor;
    }
    res.json({ linhas, total, total_fmt: repo.brl(total), por_livro: porLivro });
  });

  app.get('/staff/api/livraria/vendas.csv', requireAuth, pode('relatorios'), (req, res) => {
    const linhas = linhasVendas(req.query);
    const cab = ['Data', 'Pedido', 'Cliente', 'E-mail', 'UF', 'Livro', 'Formato', 'Qtd', 'Valor (R$)', 'Cupom', 'Status', 'Entrega', 'Impresso', 'Origem'];
    const corpo = linhas.map(l => [
      String(l.data).slice(0, 10), l.pedido, l.cliente, l.email, l.uf, l.livro, l.formato,
      l.quantidade, (l.valor / 100).toFixed(2), l.cupom, l.status, l.entrega, l.impresso, l.origem,
    ]);
    // BOM + ; = Excel brasileiro abre sem passar pelo assistente de importação
    const csv = '﻿' + [cab, ...corpo]
      .map(l => l.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vendas-livraria.csv"`);
    res.send(csv);
  });

  // ------------------------------------------------------- EQUIPE (papéis funcionais) — admin
  app.get('/staff/api/livraria/equipe', requireAuth, requireAdmin, (req, res) => {
    const users = lerUsuarios().map(u => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, papelLivraria: u.papelLivraria || (u.papel === 'admin' ? 'admin' : 'suporte'), ativo: u.ativo }));
    res.json({ equipe: users, papeis: Object.keys(repo.PAPEIS_LIVRARIA) });
  });
  app.patch('/staff/api/livraria/equipe/:id', requireAuth, requireAdmin, (req, res) => {
    const papel = String((req.body || {}).papelLivraria || '');
    if (!repo.PAPEIS_LIVRARIA[papel]) return res.status(400).json({ erro: 'Papel inválido.' });
    const users = lerUsuarios(); const u = users.find(x => x.id === req.params.id);
    if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    u.papelLivraria = papel; salvarUsuarios(users);
    repo.Audit.log(req.user, 'equipe.papel', { entidade: 'user', entidade_id: u.id, detalhe: `${u.email}=${papel}`, ip: ipDe(req) });
    res.json({ ok: true });
  });
}

module.exports = { registrarRotasStaff };
