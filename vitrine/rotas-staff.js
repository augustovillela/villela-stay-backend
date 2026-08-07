// =====================================================================
// Vitrine — administração da plataforma na aba 🛒 do Portal Staff
// (/staff/api/vitrine/*). Sessão do PORTAL (requireAuth/requireAdmin),
// não a sessão do marketplace. Toda ação sensível vai para a auditoria.
// =====================================================================
'use strict';
const { db, nowISO } = require('./db');
const repo = require('./repo');
const { Pedidos, Avaliacoes, Repasses, STATUS_PEDIDO } = require('./pedidos');
const pagamentos = require('./pagamentos');
const { Products, Users, Vendedores, Categorias, Perguntas, Denuncias, Config, Auditoria, s, n, inteiro } = repo;

function registrarRotasStaff(app, { requireAuth, requireAdmin }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));
  const quem = (req) => (req.user && (req.user.email || req.user.nome)) || 'staff';

  const B = '/staff/api/vitrine';

  // ---- dashboard ----
  app.get(B + '/dashboard', requireAuth, h(async (req, res) => {
    const dias = Math.min(inteiro(req.query.dias, 30), 365);
    const corte = new Date(Date.now() - dias * 86400000).toISOString();
    const fin = db.prepare(`SELECT
        COALESCE(SUM(CASE WHEN status IN ('pago','preparando_envio','enviado','em_transito','entregue','concluido') THEN total_centavos ELSE 0 END), 0) AS gmv,
        COALESCE(SUM(CASE WHEN status = 'concluido' THEN comissao_centavos ELSE 0 END), 0) AS comissao,
        COALESCE(SUM(CASE WHEN status = 'concluido' THEN tarifa_processador_centavos ELSE 0 END), 0) AS tarifas,
        COUNT(*) AS pedidos
      FROM orders WHERE criado_em >= ?`).get(corte);
    res.json({
      periodo_dias: dias,
      financeiro: {
        gmv_centavos: fin.gmv,
        comissao_centavos: fin.comissao,
        tarifa_processador_centavos: fin.tarifas,
        margem_liquida_centavos: fin.comissao - fin.tarifas, // honestidade: comissão − tarifa (pode ser negativa)
        comissao_pct: Config.num('marketplace_commission_percent', 5),
      },
      pedidos: {
        total: fin.pedidos,
        em_disputa: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status IN ('devolucao_solicitada','em_disputa')").get().c,
        aguardando_pagamento: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'aguardando_pagamento'").get().c,
      },
      catalogo: {
        ativos: db.prepare("SELECT COUNT(*) AS c FROM products WHERE status = 'ativo' AND excluido = 0").get().c,
        moderacao_pendente: db.prepare("SELECT COUNT(*) AS c FROM products WHERE status = 'aguardando_aprovacao' AND excluido = 0").get().c,
      },
      usuarios: {
        total: db.prepare("SELECT COUNT(*) AS c FROM users WHERE status != 'excluido'").get().c,
        vendedores: db.prepare('SELECT COUNT(*) AS c FROM seller_profiles').get().c,
        novos_periodo: db.prepare('SELECT COUNT(*) AS c FROM users WHERE criado_em >= ?').get(corte).c,
        bloqueados: db.prepare("SELECT COUNT(*) AS c FROM users WHERE status = 'bloqueado'").get().c,
      },
      denuncias_abertas: db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'aberta'").get().c,
      repasses_a_pagar: db.prepare("SELECT COUNT(*) AS c FROM seller_payouts WHERE status = 'liberado'").get().c,
      mais_vistos: db.prepare(`SELECT titulo, slug, vistos, vendidos FROM products WHERE excluido = 0 ORDER BY vistos DESC LIMIT 8`).all(),
      categorias_movimento: db.prepare(`SELECT c.nome, COUNT(oi.id) AS itens_vendidos
        FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.categoria_id
        JOIN orders o ON o.id = oi.order_id AND o.criado_em >= ?
        GROUP BY c.id ORDER BY itens_vendidos DESC LIMIT 8`).all(corte),
    });
  }));

  // ---- moderação de anúncios ----
  app.get(B + '/moderacao', requireAuth, h(async (req, res) => {
    const fila = db.prepare(`SELECT p.*, sp.loja_nome,
        (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.ordem LIMIT 1) AS foto,
        (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id) AS num_fotos
      FROM products p JOIN seller_profiles sp ON sp.user_id = p.seller_id
      WHERE p.status = 'aguardando_aprovacao' AND p.excluido = 0 ORDER BY p.atualizado_em`).all();
    res.json({ fila });
  }));
  app.post(B + '/moderacao/:id', requireAuth, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, produto: Products.moderar(req.params.id, s(d.decisao, 20), { motivo: d.motivo, quem: quem(req) }) });
  }));

  // ---- pedidos ----
  app.get(B + '/pedidos', requireAuth, h(async (req, res) => {
    const status = s(req.query.status, 30);
    const where = status ? 'WHERE o.status = ?' : '';
    const args = status ? [status] : [];
    res.json({
      status_possiveis: STATUS_PEDIDO,
      pedidos: db.prepare(`SELECT o.*, ub.nome AS comprador, sp.loja_nome
        FROM orders o JOIN users ub ON ub.id = o.buyer_id JOIN seller_profiles sp ON sp.user_id = o.seller_id
        ${where} ORDER BY o.criado_em DESC LIMIT 200`).all(...args),
    });
  }));
  app.get(B + '/pedidos/:id', requireAuth, h(async (req, res) => {
    const p = Pedidos.completo(req.params.id, '', { admin: true });
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json(p);
  }));

  // ---- disputas ----
  app.get(B + '/disputas', requireAuth, h(async (req, res) => {
    res.json({
      disputas: db.prepare(`SELECT d.*, o.codigo, o.status AS pedido_status, o.total_centavos, ub.nome AS comprador, sp.loja_nome
        FROM disputes d JOIN orders o ON o.id = d.order_id
        JOIN users ub ON ub.id = o.buyer_id JOIN seller_profiles sp ON sp.user_id = o.seller_id
        WHERE d.status = 'aberta' ORDER BY d.criado_em`).all(),
    });
  }));
  app.post(B + '/disputas/:orderId/resolver', requireAuth, requireAdmin, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, pedido: await Pedidos.resolverDisputa(req.params.orderId, { resolucao: s(d.resolucao, 30), valorCentavos: d.valor_centavos, quem: quem(req) }) });
  }));

  // ---- denúncias ----
  app.get(B + '/denuncias', requireAuth, h(async (req, res) => res.json({ denuncias: Denuncias.listar({ status: s(req.query.status, 20) || 'aberta' }) })));
  app.post(B + '/denuncias/:id/resolver', requireAuth, h(async (req, res) => {
    Denuncias.resolver(req.params.id, (req.body || {}).resolucao, quem(req));
    res.json({ ok: true });
  }));

  // ---- usuários / vendedores ----
  app.get(B + '/usuarios', requireAuth, h(async (req, res) => res.json({ usuarios: Users.listar({ busca: s(req.query.busca, 80) }) })));
  app.post(B + '/usuarios/:id/bloquear', requireAuth, requireAdmin, h(async (req, res) => { Users.bloquear(req.params.id, (req.body || {}).motivo, quem(req)); res.json({ ok: true }); }));
  app.post(B + '/usuarios/:id/reativar', requireAuth, requireAdmin, h(async (req, res) => { Users.reativar(req.params.id, quem(req)); res.json({ ok: true }); }));

  // ---- moderação de conteúdo (avaliações e perguntas) ----
  app.post(B + '/avaliacoes/:id/moderar', requireAuth, h(async (req, res) => { Avaliacoes.moderar(req.params.id, s((req.body || {}).status, 20), quem(req)); res.json({ ok: true }); }));
  app.post(B + '/perguntas/:id/moderar', requireAuth, h(async (req, res) => { Perguntas.moderar(req.params.id, s((req.body || {}).status, 20), quem(req)); res.json({ ok: true }); }));

  // ---- categorias ----
  app.get(B + '/categorias', requireAuth, h(async (req, res) => res.json({ categorias: Categorias.listar() })));
  app.post(B + '/categorias', requireAuth, requireAdmin, h(async (req, res) => res.json({ ok: true, categoria: Categorias.criar(req.body || {}, quem(req)) })));
  app.patch(B + '/categorias/:id', requireAuth, requireAdmin, h(async (req, res) => res.json({ ok: true, categoria: Categorias.atualizar(req.params.id, req.body || {}, quem(req)) })));

  // ---- repasses ----
  app.get(B + '/repasses', requireAuth, h(async (req, res) => res.json({ fila: Repasses.fila() })));
  app.post(B + '/repasses/:id/pago', requireAuth, requireAdmin, h(async (req, res) => res.json(Repasses.marcarPago(req.params.id, quem(req)))));

  // ---- configurações (comissão etc.) ----
  app.get(B + '/config', requireAuth, h(async (req, res) => res.json({ config: Config.todos().filter((c) => c.chave !== 'webhook_secret') })));
  app.post(B + '/config', requireAuth, requireAdmin, h(async (req, res) => {
    const d = req.body || {};
    if (!s(d.chave, 80)) throw new Error('Informe a chave.');
    if (d.chave === 'webhook_secret') throw new Error('O segredo do webhook não é editável por aqui.');
    Config.set(d.chave, d.valor);
    Auditoria.registrar({ quem: quem(req), acao: 'config.set', entidade: 'config', entidade_id: s(d.chave, 80), detalhe: s(String(d.valor), 120) });
    res.json({ ok: true });
  }));

  // ---- auditoria ----
  app.get(B + '/auditoria', requireAuth, requireAdmin, h(async (req, res) => res.json({ auditoria: Auditoria.listar({ limite: inteiro(req.query.limite, 200) }) })));

  // ---- rotina manual ----
  app.post(B + '/rodar-rotina', requireAuth, requireAdmin, h(async (req, res) => {
    const r = Pedidos.rotina();
    Auditoria.registrar({ quem: quem(req), acao: 'rotina.manual', entidade: 'orders', detalhe: JSON.stringify(r) });
    res.json({ ok: true, ...r });
  }));

  // ---- exportação CSV das principais listagens ----
  const csv = (res, nome, linhas) => {
    const esc = (v) => { const t = String(v == null ? '' : v); return /[",;\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const cols = linhas.length ? Object.keys(linhas[0]) : [];
    const corpo = [cols.join(';'), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(';'))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`);
    res.send('﻿' + corpo); // BOM: Excel pt-BR abre com acento certo
  };
  app.get(B + '/export/pedidos.csv', requireAuth, h(async (req, res) => {
    csv(res, 'vitrine-pedidos', db.prepare(`SELECT o.codigo, o.status, o.criado_em, ub.nome AS comprador, sp.loja_nome AS vendedor,
        o.subtotal_centavos, o.frete_centavos, o.comissao_centavos, o.tarifa_processador_centavos, o.total_centavos, o.repasse_vendedor_centavos
      FROM orders o JOIN users ub ON ub.id = o.buyer_id JOIN seller_profiles sp ON sp.user_id = o.seller_id
      ORDER BY o.criado_em DESC LIMIT 5000`).all());
  }));
  app.get(B + '/export/produtos.csv', requireAuth, h(async (req, res) => {
    csv(res, 'vitrine-produtos', db.prepare(`SELECT p.titulo, p.status, p.condicao, p.preco_centavos, p.quantidade, p.vistos, p.vendidos,
        sp.loja_nome AS vendedor, p.criado_em FROM products p JOIN seller_profiles sp ON sp.user_id = p.seller_id
      WHERE p.excluido = 0 ORDER BY p.criado_em DESC LIMIT 5000`).all());
  }));
  app.get(B + '/export/usuarios.csv', requireAuth, requireAdmin, h(async (req, res) => {
    csv(res, 'vitrine-usuarios', db.prepare(`SELECT nome, email, papel, status, email_verificado, cidade, uf, criado_em
      FROM users WHERE status != 'excluido' ORDER BY criado_em DESC LIMIT 5000`).all());
  }));
}

module.exports = { registrarRotasStaff };
