// =====================================================================
// Vitrine — API pública (visitante): busca, produto, vendedor, denúncia.
// Tudo aqui é dado que já aparece nas páginas públicas — nada de e-mail,
// telefone, CPF ou endereço de ninguém.
// =====================================================================
'use strict';
const repo = require('./repo');
const { Products, Vendedores, Categorias, Denuncias, s, n } = repo;

function registrarRotasPublicas(app, { talvezUsuario }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));

  app.get('/vitrine/api/categorias', h(async (req, res) => res.json({ categorias: Categorias.listar({ arvore: true }) })));

  // busca com todos os filtros — os mesmos parâmetros da URL de /vitrine/busca
  app.get('/vitrine/api/busca', h(async (req, res) => {
    const q = req.query || {};
    res.json(Products.buscar({
      q: q.q, categoria: q.categoria, condicao: q.condicao,
      precoMin: q.preco_min ? n(q.preco_min) : null, precoMax: q.preco_max ? n(q.preco_max) : null,
      uf: q.uf, cidade: q.cidade, entrega: q.entrega,
      notaMin: q.nota_min ? n(q.nota_min) : null,
      ordem: q.ordem, pagina: q.pagina, porPagina: q.por_pagina,
    }));
  }));

  app.get('/vitrine/api/produto/:slug', talvezUsuario, h(async (req, res) => {
    const ficha = Products.fichaPublica(req.params.slug);
    if (!ficha || ficha.status !== 'ativo') {
      // dono e staff enxergam o próprio anúncio fora do ar; o público não
      const dono = req.usuario && ficha && ficha.seller_id === req.usuario.id;
      if (!dono) return res.status(404).json({ erro: 'Produto não encontrado.' });
    }
    Products.registrarVisita(ficha.id);
    const favorito = req.usuario ? repo.Favoritos.ids(req.usuario.id).includes(ficha.id) : false;
    res.json({ produto: ficha, favorito });
  }));

  app.get('/vitrine/api/loja/:slug', h(async (req, res) => {
    const v = Vendedores.porSlug(req.params.slug);
    if (!v || v.user_status !== 'ativo') return res.status(404).json({ erro: 'Vendedor não encontrado.' });
    const publico = Vendedores.publico(v.user_id);
    const produtos = Products.buscar({ sellerId: v.user_id, porPagina: 48 });
    res.json({ vendedor: publico, produtos: produtos.itens });
  }));

  // denúncia de anúncio ou usuário (logado ou não; logado identifica o autor)
  app.post('/vitrine/api/denunciar', talvezUsuario, h(async (req, res) => {
    const d = req.body || {};
    const r = Denuncias.criar({
      tipo: d.tipo, alvo_id: d.alvo_id, autor_id: req.usuario ? req.usuario.id : '',
      motivo: d.motivo, detalhe: d.detalhe,
    });
    res.json({ ok: true, id: r.id, mensagem: 'Denúncia registrada. Nossa equipe vai analisar.' });
  }));
}

module.exports = { registrarRotasPublicas };
