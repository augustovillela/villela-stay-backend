// =====================================================================
// Vitrine — API autenticada dos painéis (comprador e vendedor).
// A autorização é SEMPRE do servidor: cada consulta filtra pelo id da
// sessão — esconder botão no navegador não é segurança.
// =====================================================================
'use strict';
const repo = require('./repo');
const { Pedidos, Avaliacoes } = require('./pedidos');
const pagamentos = require('./pagamentos');
const frete = require('./frete');
const { Products, Vendedores, Favoritos, Carrinho, Perguntas, Enderecos, s, n } = repo;

function registrarRotasApp(app, { requireUsuario }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));

  // exige cadastro de vendedor ativo por cima da sessão
  const requireVendedor = (req, res, next) => {
    const v = Vendedores.obter(req.usuario.id);
    if (!v) return res.status(403).json({ erro: 'Complete seu cadastro de vendedor primeiro.' });
    if (v.status !== 'ativo') return res.status(403).json({ erro: 'Sua conta de vendedor está suspensa.' });
    req.vendedor = v;
    next();
  };

  // =================== COMPRADOR ===================

  app.post('/vitrine/api/favoritos/:productId', requireUsuario, h(async (req, res) => res.json(Favoritos.alternar(req.usuario.id, req.params.productId))));
  app.get('/vitrine/api/favoritos', requireUsuario, h(async (req, res) => res.json({ favoritos: Favoritos.listar(req.usuario.id) })));

  app.get('/vitrine/api/carrinho', requireUsuario, h(async (req, res) => res.json(Carrinho.ver(req.usuario.id))));
  app.post('/vitrine/api/carrinho', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json(Carrinho.adicionar(req.usuario.id, s(d.product_id, 40), d.quantidade));
  }));
  app.patch('/vitrine/api/carrinho', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json(Carrinho.ajustar(req.usuario.id, s(d.product_id, 40), d.quantidade));
  }));

  // cotação de frete para o grupo de um vendedor no carrinho
  app.get('/vitrine/api/carrinho/frete', requireUsuario, h(async (req, res) => {
    const sellerId = s(req.query.seller_id, 40);
    const cep = s(req.query.cep, 9).replace(/\D/g, '');
    const grupo = Carrinho.ver(req.usuario.id).grupos.find((g) => g.seller_id === sellerId);
    if (!grupo) return res.status(404).json({ erro: 'Vendedor não está no carrinho.' });
    const peso = grupo.itens.reduce((t, i) => t + i.peso_gramas * i.quantidade, 0);
    const maior = grupo.itens.reduce((m, i) => (i.comp_cm * i.larg_cm * i.alt_cm > m.comp_cm * m.larg_cm * m.alt_cm ? i : m), grupo.itens[0]);
    const retiradaOk = grupo.itens.every((i) => i.entrega_retirada);
    const envioOk = grupo.itens.every((i) => i.entrega_envio);
    const opcoes = envioOk
      ? await frete.cotar({ cepDestino: cep, cepOrigem: grupo.itens[0].cep_origem, pesoGramas: peso, dim: maior, retiradaOk })
      : (retiradaOk ? [{ tipo: 'retirada', nome: 'Retirada em mãos (combinar com o vendedor)', valor_centavos: 0, prazo_dias: 0 }] : []);
    res.json({ opcoes, subtotal_centavos: grupo.subtotal_centavos });
  }));

  // checkout: cria UM pedido do vendedor informado (regra 1 pedido = 1 vendedor).
  // Com MP Split ativo p/ o vendedor, a cobrança externa nasce DEPOIS do commit
  // (rede fora de transação); falha ali não derruba o pedido.
  app.post('/vitrine/api/checkout', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    const r = await Pedidos.checkout(req.usuario.id, { sellerId: s(d.seller_id, 40), addressId: s(d.address_id, 40), freteTipo: s(d.frete_tipo, 20) });
    if (r.pagamento && r.pagamento.provedor === 'mercadopago-split') {
      const base = `${req.headers['x-forwarded-proto'] || req.protocol || 'https'}://${req.get('host')}`;
      try {
        const cb = await pagamentos.iniciarCobranca(r.pagamento.id, base);
        if (cb && cb.checkout_url) r.pagamento.checkout_url = cb.checkout_url;
      } catch (e) { r.pagamento.erro_cobranca = e.message; }
    }
    res.json({ ok: true, ...r });
  }));

  app.get('/vitrine/api/pedidos', requireUsuario, h(async (req, res) => res.json({ pedidos: Pedidos.doComprador(req.usuario.id) })));
  app.get('/vitrine/api/pedidos/:id', requireUsuario, h(async (req, res) => {
    const p = Pedidos.completo(req.params.id, req.usuario.id);
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json(p);
  }));
  app.post('/vitrine/api/pedidos/:id/cancelar', requireUsuario, h(async (req, res) => {
    const o = Pedidos.obter(req.params.id);
    if (!o) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const papel = o.buyer_id === req.usuario.id ? 'comprador' : 'vendedor';
    res.json({ ok: true, pedido: await Pedidos.cancelar(req.params.id, { userId: req.usuario.id, papel, motivo: (req.body || {}).motivo }) });
  }));
  app.post('/vitrine/api/pedidos/:id/recebi', requireUsuario, h(async (req, res) => res.json({ ok: true, pedido: Pedidos.confirmarRecebimento(req.usuario.id, req.params.id) })));
  app.post('/vitrine/api/pedidos/:id/concluir', requireUsuario, h(async (req, res) => {
    const o = Pedidos.obter(req.params.id);
    if (!o || o.buyer_id !== req.usuario.id) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json({ ok: true, pedido: Pedidos.concluir(req.params.id, { quem: req.usuario.email, papel: 'comprador' }) });
  }));
  app.post('/vitrine/api/pedidos/:id/devolucao', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, pedido: Pedidos.solicitarDevolucao(req.usuario.id, req.params.id, { motivo: d.motivo, detalhe: d.detalhe }) });
  }));

  // pagamento SIMULADO: o comprador aprova/recusa a própria compra de teste.
  // Passa pelo MESMO caminho idempotente do webhook — o status vem do servidor.
  app.post('/vitrine/api/pedidos/:id/pagar-simulado', requireUsuario, h(async (req, res) => {
    const o = Pedidos.obter(req.params.id);
    if (!o || o.buyer_id !== req.usuario.id) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const pay = pagamentos.Pagamentos.doPedido(o.id);
    if (!pay || pay.provedor !== 'simulado') return res.status(400).json({ erro: 'Este pedido não usa o pagamento simulado.' });
    const resultado = s((req.body || {}).resultado, 20) === 'recusado' ? 'recusado' : 'aprovado';
    const r = pagamentos.Pagamentos.processarEvento({
      evento_id: `sim-${pay.id}-${resultado}`, ref: pay.provedor_ref, tipo: resultado, payload: { origem: 'simulacao-comprador' },
    });
    res.json({ ok: true, aplicado: r.aplicado, pedido: Pedidos.obter(o.id) });
  }));

  // avaliação (só com pedido entregue/concluído — regra no domínio)
  app.post('/vitrine/api/avaliar', requireUsuario, h(async (req, res) => res.json({ ok: true, avaliacao: Avaliacoes.criar(req.usuario.id, req.body || {}) })));

  // perguntas
  app.post('/vitrine/api/produto/:id/perguntar', requireUsuario, h(async (req, res) => res.json({ ok: true, ...Perguntas.perguntar(req.usuario.id, req.params.id, (req.body || {}).pergunta) })));

  // =================== VENDEDOR ===================

  app.post('/vitrine/api/vendedor', requireUsuario, h(async (req, res) => res.json({ ok: true, vendedor: Vendedores.criar(req.usuario.id, req.body || {}) })));
  app.patch('/vitrine/api/vendedor', requireUsuario, requireVendedor, h(async (req, res) => res.json({ ok: true, vendedor: Vendedores.atualizar(req.usuario.id, req.body || {}) })));
  app.get('/vitrine/api/vendedor/resumo', requireUsuario, requireVendedor, h(async (req, res) => {
    res.json({
      vendedor: req.vendedor,
      resumo: Pedidos.resumoVendedor(req.usuario.id),
      reputacao: Vendedores.publico(req.usuario.id),
      perguntas_pendentes: Perguntas.doVendedor(req.usuario.id, { pendentes: true }).length,
    });
  }));

  // anúncios
  app.get('/vitrine/api/anuncios', requireUsuario, requireVendedor, h(async (req, res) => res.json({ anuncios: Products.doVendedor(req.usuario.id, { status: s(req.query.status, 30) }) })));
  app.post('/vitrine/api/anuncios', requireUsuario, requireVendedor, h(async (req, res) => res.json({ ok: true, anuncio: Products.criar(req.usuario.id, req.body || {}) })));
  app.get('/vitrine/api/anuncios/:id', requireUsuario, requireVendedor, h(async (req, res) => {
    const p = Products.obter(req.params.id);
    if (!p || p.seller_id !== req.usuario.id) return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    res.json({ anuncio: { ...p, fotos: Products.fotos(p.id) } });
  }));
  app.patch('/vitrine/api/anuncios/:id', requireUsuario, requireVendedor, h(async (req, res) => res.json({ ok: true, anuncio: Products.atualizar(req.usuario.id, req.params.id, req.body || {}) })));
  app.post('/vitrine/api/anuncios/:id/publicar', requireUsuario, requireVendedor, h(async (req, res) => res.json({ ok: true, anuncio: Products.publicar(req.usuario.id, req.params.id) })));
  app.post('/vitrine/api/anuncios/:id/pausar', requireUsuario, requireVendedor, h(async (req, res) => res.json({ ok: true, anuncio: Products.pausar(req.usuario.id, req.params.id) })));
  app.post('/vitrine/api/anuncios/:id/encerrar', requireUsuario, requireVendedor, h(async (req, res) => res.json({ ok: true, anuncio: Products.encerrar(req.usuario.id, req.params.id) })));

  // fotos (MVP: o navegador manda uma URL de placeholder gerada localmente
  // ou o caminho devolvido pelo upload; upload binário real via storage-s3
  // entra quando as fotos reais chegarem — o contrato da rota não muda)
  app.post('/vitrine/api/anuncios/:id/fotos', requireUsuario, requireVendedor, h(async (req, res) => {
    const d = req.body || {};
    let url = s(d.url, 400);
    // segurança: só aceitamos caminho interno da própria Vitrine
    if (!/^\/vitrine\/(placeholder|fotos)\//.test(url)) {
      url = '/vitrine/placeholder/' + encodeURIComponent(s(d.rotulo, 40) || 'produto') + '.svg';
    }
    res.json({ ok: true, foto: Products.adicionarFoto(req.usuario.id, req.params.id, url) });
  }));
  app.delete('/vitrine/api/anuncios/:id/fotos/:fotoId', requireUsuario, requireVendedor, h(async (req, res) => res.json(Products.removerFoto(req.usuario.id, req.params.id, req.params.fotoId))));

  // vendas
  app.get('/vitrine/api/vendas', requireUsuario, requireVendedor, h(async (req, res) => res.json({ vendas: Pedidos.doVendedor(req.usuario.id) })));
  app.get('/vitrine/api/vendas/:id', requireUsuario, requireVendedor, h(async (req, res) => {
    const p = Pedidos.completo(req.params.id, req.usuario.id);
    if (!p || p.papel !== 'vendedor') return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json(p);
  }));
  app.post('/vitrine/api/vendas/:id/preparar', requireUsuario, requireVendedor, h(async (req, res) => res.json({ ok: true, pedido: Pedidos.prepararEnvio(req.usuario.id, req.params.id) })));
  app.post('/vitrine/api/vendas/:id/enviar', requireUsuario, requireVendedor, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, envio: Pedidos.informarEnvio(req.usuario.id, req.params.id, { codigo: d.codigo_rastreio, servico: d.servico }) });
  }));
  app.post('/vitrine/api/vendas/:id/devolucao', requireUsuario, requireVendedor, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, pedido: await Pedidos.responderDevolucao(req.usuario.id, req.params.id, { aceitar: !!d.aceitar, justificativa: d.justificativa }) });
  }));
  // demonstração: o vendedor pode avançar a esteira de rastreio simulada
  app.post('/vitrine/api/vendas/:id/avancar-rastreio', requireUsuario, requireVendedor, h(async (req, res) => {
    const o = Pedidos.obter(req.params.id);
    if (!o || o.seller_id !== req.usuario.id) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const sh = frete.Envios.doPedido(o.id);
    if (!sh) return res.status(400).json({ erro: 'Este pedido ainda não tem envio.' });
    if (sh.provedor !== 'simulado') return res.status(400).json({ erro: 'Só o rastreio simulado pode ser avançado manualmente.' });
    const ev = frete.Envios.avancar(sh.id);
    if (ev) Pedidos.aoRastreioAvancar(o.id, ev.status);
    res.json({ ok: true, evento: ev, pedido: Pedidos.obter(o.id) });
  }));

  // ---- Mercado Pago Split (fase 6): status e desconexão ----
  app.get('/vitrine/api/vendedor/mp-status', requireUsuario, requireVendedor, h(async (req, res) => {
    const tk = pagamentos.MPTokens.obter(req.usuario.id);
    res.json({
      plataforma_configurada: pagamentos.OAuth.configurado(),
      conectado: !!tk,
      live_mode: tk ? !!tk.live_mode : false,
      mp_user_id: tk ? tk.mp_user_id : '',
    });
  }));
  app.post('/vitrine/api/vendedor/mp-desconectar', requireUsuario, requireVendedor, h(async (req, res) => {
    pagamentos.MPTokens.remover(req.usuario.id);
    res.json({ ok: true });
  }));

  // perguntas e avaliações do vendedor
  app.get('/vitrine/api/vendedor/perguntas', requireUsuario, requireVendedor, h(async (req, res) => res.json({ perguntas: Perguntas.doVendedor(req.usuario.id, { pendentes: req.query.pendentes === '1' }) })));
  app.post('/vitrine/api/perguntas/:id/responder', requireUsuario, requireVendedor, h(async (req, res) => res.json({ ok: true, ...Perguntas.responder(req.usuario.id, req.params.id, (req.body || {}).resposta) })));
  app.get('/vitrine/api/vendedor/avaliacoes', requireUsuario, requireVendedor, h(async (req, res) => res.json({ avaliacoes: Avaliacoes.doVendedor(req.usuario.id) })));
}

module.exports = { registrarRotasApp };
