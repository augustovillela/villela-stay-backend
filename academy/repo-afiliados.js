// =====================================================================
// Villela Academy — domínio de AFILIADOS (FASE 5): links rastreáveis,
// cliques, atribuição e comissões (pendente → disponível → paga;
// cancelada em reembolso). Afiliação aberta: todo afiliado APROVADO pode
// divulgar qualquer produto publicado que comissione (pct > 0).
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

// % efetivo do produto: products.afiliado_pct (NULL = padrão global; 0 = não comissiona)
function pctDoProduto(p) {
  if (p.afiliado_pct != null) return Math.max(0, Math.min(90, parseInt(p.afiliado_pct, 10) || 0));
  const c = repo.Config.obter('comissoes', {});
  return Math.max(0, Math.min(90, parseInt(c.afiliado_padrao_pct, 10) || 10));
}
function cookieDias() {
  const c = repo.Config.obter('comissoes', {});
  return Math.max(1, Math.min(365, parseInt(c.cookie_dias, 10) || 30));
}

const Links = {
  // código curto sem ambiguidade (vai em URL pública)
  criar(affiliateUserId, productId) {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!p || p.status !== 'publicado') throw new Error('Produto não disponível para afiliação.');
    if (!pctDoProduto(p)) throw new Error('Este produto não paga comissão de afiliado.');
    if (p.producer_id === affiliateUserId) throw new Error('Você é o produtor deste produto — a venda já é sua.');
    const existe = db.prepare('SELECT * FROM affiliate_links WHERE affiliate_user_id = ? AND product_id = ?').get(affiliateUserId, productId);
    if (existe) return existe;
    const alf = 'abcdefghjkmnpqrstuvwxyz23456789';
    let codigo = ''; const b = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) codigo += alf[b[i] % alf.length];
    if (db.prepare('SELECT 1 FROM affiliate_links WHERE id = ?').get(codigo)) codigo = novoId();
    db.prepare('INSERT INTO affiliate_links (id, affiliate_user_id, product_id, criado_em) VALUES (?, ?, ?, ?)')
      .run(codigo, affiliateUserId, productId, nowISO());
    return db.prepare('SELECT * FROM affiliate_links WHERE id = ?').get(codigo);
  },
  porCodigo(codigo) { return db.prepare('SELECT * FROM affiliate_links WHERE id = ?').get(s(codigo, 30)) || null; },
  doAfiliado(userId) {
    return db.prepare(`SELECT l.*, p.titulo, p.slug, p.status AS product_status,
      (SELECT COUNT(*) FROM affiliate_clicks c WHERE c.link_id = l.id) AS cliques,
      (SELECT COUNT(*) FROM commissions m WHERE m.affiliate_user_id = l.affiliate_user_id AND m.product_id = l.product_id AND m.status != 'cancelada') AS conversoes
      FROM affiliate_links l JOIN products p ON p.id = l.product_id
      WHERE l.affiliate_user_id = ? ORDER BY l.criado_em DESC`).all(userId);
  },
  registrarClique(codigo, ip) {
    const l = this.porCodigo(codigo);
    if (!l) return null;
    db.prepare('INSERT INTO affiliate_clicks (link_id, quando, ip) VALUES (?, ?, ?)').run(l.id, nowISO(), s(ip, 60));
    return l;
  },
};

// resolve a atribuição no momento da compra (código do cookie academy_ref).
// Estrita: o link tem que ser do MESMO produto; afiliado aprovado e ativo;
// nunca o próprio comprador nem o produtor.
function atribuir(codigo, compradorId, produto) {
  if (!codigo) return null;
  const l = Links.porCodigo(codigo);
  if (!l || l.product_id !== produto.id) return null;
  if (l.affiliate_user_id === compradorId || l.affiliate_user_id === produto.producer_id) return null;
  const u = repo.Usuarios.porId(l.affiliate_user_id);
  if (!repo.podeAgirComo(u, 'afiliado')) return null;
  const pct = pctDoProduto(produto);
  if (!pct) return null;
  return { affiliate_user_id: l.affiliate_user_id, pct };
}

const Comissoes = {
  // criada quando o pedido é PAGO; libera após a garantia do produto
  criarDoPedido(order) {
    if (!order.affiliate_user_id || !order.comissao_afiliado_centavos) return null;
    if (db.prepare('SELECT 1 FROM commissions WHERE order_id = ?').get(order.id)) return null; // idempotente
    const p = db.prepare('SELECT garantia_dias FROM products WHERE id = ?').get(order.product_id);
    const dias = Math.max(7, (p && p.garantia_dias) || 7);
    const id = novoId();
    db.prepare(`INSERT INTO commissions (id, order_id, affiliate_user_id, product_id, produto_titulo,
      valor_centavos, pct, status, criado_em, disponivel_em) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)`)
      .run(id, order.id, order.affiliate_user_id, order.product_id, order.produto_titulo,
        order.comissao_afiliado_centavos, order.afiliado_pct, nowISO(), new Date(Date.now() + dias * 864e5).toISOString());
    return id;
  },
  cancelarDoPedido(orderId, motivo) {
    db.prepare(`UPDATE commissions SET status = 'cancelada', atualizado_em = ? WHERE order_id = ? AND status IN ('pendente','disponivel')`)
      .run(nowISO(), orderId);
  },
  // liberação preguiçosa: pendente vira disponível quando passa da garantia
  liberarVencidas() {
    db.prepare(`UPDATE commissions SET status = 'disponivel', atualizado_em = ? WHERE status = 'pendente' AND disponivel_em <= ?`)
      .run(nowISO(), nowISO());
  },
  extrato(affiliateUserId) {
    this.liberarVencidas();
    return db.prepare('SELECT * FROM commissions WHERE affiliate_user_id = ? ORDER BY criado_em DESC LIMIT 300').all(affiliateUserId);
  },
  saldos(affiliateUserId) {
    this.liberarVencidas();
    const soma = (st) => (db.prepare('SELECT COALESCE(SUM(valor_centavos),0) v FROM commissions WHERE affiliate_user_id = ? AND status = ?').get(affiliateUserId, st) || { v: 0 }).v;
    return { pendente_centavos: soma('pendente'), disponivel_centavos: soma('disponivel'), paga_centavos: soma('paga'), cancelada_centavos: soma('cancelada') };
  },
  listarAdmin({ status, n } = {}) {
    this.liberarVencidas();
    let sql = `SELECT c.*, u.nome AS afiliado_nome, u.email AS afiliado_email FROM commissions c JOIN users u ON u.id = c.affiliate_user_id`;
    const args = [];
    if (status) { sql += ' WHERE c.status = ?'; args.push(status); }
    sql += ' ORDER BY c.criado_em DESC LIMIT ?'; args.push(Math.min(parseInt(n, 10) || 200, 1000));
    return db.prepare(sql).all(...args);
  },
  // repasse manual (F5): staff/admin marca como paga após transferir
  marcarPaga(id, quem) {
    this.liberarVencidas();
    const c = db.prepare('SELECT * FROM commissions WHERE id = ?').get(id);
    if (!c) throw new Error('Comissão não encontrada.');
    if (c.status !== 'disponivel') throw new Error(`Só comissão disponível pode ser paga (esta está '${c.status}').`);
    db.prepare("UPDATE commissions SET status = 'paga', atualizado_em = ? WHERE id = ?").run(nowISO(), id);
    repo.Auditoria.registrar({ quem: s(quem, 80), acao: 'comissao.pagar', entidade: 'commissions', entidade_id: id, detalhe: `R$ ${(c.valor_centavos / 100).toFixed(2)}` });
    return db.prepare('SELECT * FROM commissions WHERE id = ?').get(id);
  },
};

// produtos que o afiliado pode divulgar (publicados e que comissionam)
function produtosAfiliaveis() {
  return db.prepare(`SELECT p.id, p.titulo, p.slug, p.tipo, p.preco_centavos, p.preco_promo_centavos, p.afiliado_pct,
    pr.nome_publico AS produtor_nome FROM products p JOIN producer_profiles pr ON pr.user_id = p.producer_id
    WHERE p.status = 'publicado' ORDER BY p.atualizado_em DESC LIMIT 200`).all()
    .map(p => ({ ...p, pct_efetivo: pctDoProduto(p) }))
    .filter(p => p.pct_efetivo > 0);
}

module.exports = { Links, Comissoes, atribuir, pctDoProduto, cookieDias, produtosAfiliaveis };
