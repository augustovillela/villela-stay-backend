// =====================================================================
// Vitrine — núcleo de domínio (contas, catálogo, carrinho, favoritos).
// Regras de dinheiro e status de pedido moram em pedidos.js; aqui fica
// o resto do domínio. Rotas nunca mexem no banco "na mão": passam por
// este módulo, que valida e audita.
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const { db, transacao, nowISO, novoId, novoToken, j } = require('./db');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const n = (v, padrao = 0) => { const x = Number(v); return Number.isFinite(x) ? x : padrao; };
const inteiro = (v, padrao = 0) => Math.trunc(n(v, padrao));
const cent = (v) => Math.max(0, Math.round(n(v, 0)));
const slugify = (t) => s(t, 140).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

const CONDICOES = ['novo', 'seminovo', 'usado'];
const STATUS_PRODUTO = ['rascunho', 'aguardando_aprovacao', 'ativo', 'pausado', 'vendido', 'rejeitado', 'arquivado'];

// ---------------------------------------------------------------------
// Configuração da plataforma (platform_settings)
// ---------------------------------------------------------------------
const CONFIG_PADRAO = {
  marketplace_commission_percent: { valor: '5', descricao: 'Comissão da plataforma sobre o subtotal dos produtos (%). Não incide sobre o frete.' },
  pagamento_expira_h: { valor: '24', descricao: 'Horas até um pedido não pago expirar e liberar o estoque.' },
  janela_devolucao_dias: { valor: '7', descricao: 'Dias após a entrega em que o comprador pode pedir devolução; depois o pedido conclui sozinho.' },
  max_fotos_por_anuncio: { valor: '8', descricao: 'Limite de fotos por anúncio.' },
  moderacao_previa: { valor: 'on', descricao: 'on = anúncio novo só entra na vitrine depois de aprovado pela moderação.' },
  min_preco_centavos: { valor: '100', descricao: 'Preço mínimo de um anúncio, em centavos.' },
};

const Config = {
  todos() { return db.prepare('SELECT chave, valor, descricao FROM config ORDER BY chave').all(); },
  get(chave, padrao = '') {
    const r = db.prepare('SELECT valor FROM config WHERE chave = ?').get(String(chave));
    return r ? r.valor : padrao;
  },
  // Number('') é 0 e é finito — sem este guarda, chave ausente devolveria 0
  // em vez do padrão, e 0% de comissão silencioso é receita perdida (lição
  // registrada do Closet Club).
  num(chave, padrao = 0) { const v = Config.get(chave, ''); return v === '' ? padrao : n(v, padrao); },
  set(chave, valor) {
    db.prepare(`INSERT INTO config (chave, valor, descricao, atualizado_em) VALUES (?,?,'',?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`)
      .run(String(chave), String(valor == null ? '' : valor), nowISO());
    return { chave, valor };
  },
  // comissão vigente em basis points (500 = 5%): inteiro, nunca float em dinheiro
  comissaoBp() { return Math.max(0, Math.round(Config.num('marketplace_commission_percent', 5) * 100)); },
};

// ---------------------------------------------------------------------
// Auditoria (admin_audit_logs), eventos e notificações
// ---------------------------------------------------------------------
const Auditoria = {
  registrar({ quem, acao, entidade, entidade_id, detalhe, ip } = {}) {
    db.prepare('INSERT INTO auditoria (id, quem, acao, entidade, entidade_id, detalhe, ip, quando) VALUES (?,?,?,?,?,?,?,?)')
      .run(novoId(), s(quem, 120), s(acao, 60), s(entidade, 40), s(entidade_id, 60), s(detalhe, 400), s(ip, 60), nowISO());
  },
  listar({ limite = 200 } = {}) { return db.prepare('SELECT * FROM auditoria ORDER BY quando DESC LIMIT ?').all(Math.min(inteiro(limite, 200), 1000)); },
};

function evento(userId, tipo, ref, dados) {
  db.prepare('INSERT INTO platform_events (id, user_id, tipo, ref, dados, quando) VALUES (?,?,?,?,?,?)')
    .run(novoId(), s(userId, 40), s(tipo, 60), s(ref, 80), j.str(dados || {}), nowISO());
}

const Notificacoes = {
  criar(userId, { titulo, texto, url, tipo } = {}) {
    const id = novoId();
    db.prepare('INSERT INTO notifications (id, user_id, titulo, texto, url, tipo, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(id, s(userId, 40), s(titulo, 140), s(texto, 600), s(url, 300), s(tipo, 30) || 'info', nowISO());
    return id;
  },
  listar(userId, { naoLidas = false } = {}) {
    const q = naoLidas
      ? "SELECT * FROM notifications WHERE user_id = ? AND lida_em = '' ORDER BY criado_em DESC LIMIT 60"
      : 'SELECT * FROM notifications WHERE user_id = ? ORDER BY criado_em DESC LIMIT 60';
    return db.prepare(q).all(s(userId, 40));
  },
  marcarLidas(userId) { db.prepare("UPDATE notifications SET lida_em = ? WHERE user_id = ? AND lida_em = ''").run(nowISO(), s(userId, 40)); },
};

// ---------------------------------------------------------------------
// Usuários (comprador; vendedor = usuário + seller_profile)
// ---------------------------------------------------------------------
const Users = {
  criar(d, { ip = '', origem = '' } = {}) {
    const email = s(d.email, 120).toLowerCase();
    const nome = s(d.nome, 120);
    if (!nome) throw new Error('Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
    if (String(d.senha || '').length < 8) throw new Error('A senha precisa de 8+ caracteres.');
    if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) throw new Error('Já existe uma conta com este e-mail.');
    if (!d.aceite_termos) throw new Error('É preciso aceitar os termos de uso e a política de privacidade.');
    const id = novoId();
    const agora = nowISO();
    db.prepare(`INSERT INTO users (id, nome, email, senha_hash, telefone, cidade, uf, verif_token, aceite_termos_em, consentimento, origem, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, nome, email, bcrypt.hashSync(String(d.senha), 10), s(d.telefone, 30), s(d.cidade, 80),
        s(d.uf, 2).toUpperCase(), novoToken(), agora, j.str({ termos: true, ip }), s(origem, 120), agora, agora);
    evento(id, 'conta.criar', email, { origem });
    return Users.obter(id);
  },
  obter(id) { return db.prepare('SELECT * FROM users WHERE id = ?').get(s(id, 40)) || null; },
  porEmail(email) { return db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(s(email, 120).toLowerCase()) || null; },
  autenticar(email, senha) {
    const u = Users.porEmail(email);
    if (!u || u.status !== 'ativo') return null;
    return bcrypt.compareSync(String(senha || ''), u.senha_hash) ? u : null;
  },
  definirSenha(id, senha) {
    if (String(senha || '').length < 8) throw new Error('A senha precisa de 8+ caracteres.');
    db.prepare('UPDATE users SET senha_hash = ?, atualizado_em = ? WHERE id = ?').run(bcrypt.hashSync(String(senha), 10), nowISO(), s(id, 40));
  },
  atualizar(id, d) {
    const u = Users.obter(id);
    if (!u) throw new Error('Conta não encontrada.');
    db.prepare('UPDATE users SET nome=?, telefone=?, cidade=?, uf=?, bio=?, avatar_url=?, atualizado_em=? WHERE id=?')
      .run(s(d.nome, 120) || u.nome, d.telefone == null ? u.telefone : s(d.telefone, 30),
        d.cidade == null ? u.cidade : s(d.cidade, 80), d.uf == null ? u.uf : s(d.uf, 2).toUpperCase(),
        d.bio == null ? u.bio : s(d.bio, 400), d.avatar_url == null ? u.avatar_url : s(d.avatar_url, 300), nowISO(), u.id);
    return Users.obter(id);
  },
  verificarEmail(token) {
    const u = db.prepare("SELECT * FROM users WHERE verif_token = ? AND verif_token != ''").get(s(token, 80));
    if (!u) return null;
    db.prepare("UPDATE users SET email_verificado = 1, verif_token = '', atualizado_em = ? WHERE id = ?").run(nowISO(), u.id);
    evento(u.id, 'conta.email_verificado', u.email);
    return Users.obter(u.id);
  },
  bloquear(id, motivo, quem) {
    db.prepare("UPDATE users SET status = 'bloqueado', atualizado_em = ? WHERE id = ?").run(nowISO(), s(id, 40));
    Auditoria.registrar({ quem, acao: 'usuario.bloquear', entidade: 'users', entidade_id: id, detalhe: s(motivo, 300) });
  },
  reativar(id, quem) {
    db.prepare("UPDATE users SET status = 'ativo', atualizado_em = ? WHERE id = ?").run(nowISO(), s(id, 40));
    Auditoria.registrar({ quem, acao: 'usuario.reativar', entidade: 'users', entidade_id: id });
  },
  listar({ busca = '', limite = 100 } = {}) {
    const like = '%' + s(busca, 80) + '%';
    return db.prepare(`SELECT u.id, u.nome, u.email, u.papel, u.status, u.email_verificado, u.cidade, u.uf, u.criado_em,
        (SELECT loja_nome FROM seller_profiles sp WHERE sp.user_id = u.id) AS loja_nome
      FROM users u WHERE u.nome LIKE ? OR u.email LIKE ? ORDER BY u.criado_em DESC LIMIT ?`)
      .all(like, like, Math.min(inteiro(limite, 100), 500));
  },
  // LGPD: portabilidade
  exportar(id) {
    const u = Users.obter(id);
    if (!u) return null;
    const { senha_hash, verif_token, ...conta } = u;
    return {
      conta,
      enderecos: db.prepare('SELECT * FROM addresses WHERE user_id = ? AND excluido = 0').all(id),
      vendedor: db.prepare('SELECT * FROM seller_profiles WHERE user_id = ?').get(id) || null,
      anuncios: db.prepare('SELECT * FROM products WHERE seller_id = ? AND excluido = 0').all(id),
      compras: db.prepare('SELECT * FROM orders WHERE buyer_id = ?').all(id),
      vendas: db.prepare('SELECT * FROM orders WHERE seller_id = ?').all(id),
      favoritos: db.prepare('SELECT * FROM favorites WHERE user_id = ?').all(id),
      avaliacoes: db.prepare('SELECT * FROM reviews WHERE buyer_id = ?').all(id),
    };
  },
  // LGPD: exclusão com anonimização — o histórico financeiro dos pedidos fica.
  anonimizar(id) {
    const u = Users.obter(id);
    if (!u) throw new Error('Conta não encontrada.');
    const aberto = db.prepare(`SELECT 1 FROM orders WHERE (buyer_id = ? OR seller_id = ?)
      AND status NOT IN ('concluido','cancelado','reembolsado') LIMIT 1`).get(id, id);
    if (aberto) throw new Error('Você tem pedido em andamento. Conclua ou cancele antes de excluir a conta.');
    transacao(() => {
      db.prepare(`UPDATE users SET nome = 'Conta excluída', email = ?, senha_hash = 'x', telefone = '', bio = '',
        avatar_url = '', status = 'excluido', verif_token = '', atualizado_em = ? WHERE id = ?`)
        .run('excluido+' + id + '@vitrine.local', nowISO(), id);
      db.prepare('UPDATE addresses SET excluido = 1, destinatario = ?, logradouro = ?, numero = ?, complemento = ? WHERE user_id = ?')
        .run('—', '—', '', '', id);
      db.prepare("UPDATE products SET status = 'arquivado', excluido = 1, atualizado_em = ? WHERE seller_id = ? AND status NOT IN ('vendido')").run(nowISO(), id);
      db.prepare('DELETE FROM favorites WHERE user_id = ?').run(id);
      const cart = db.prepare('SELECT id FROM carts WHERE user_id = ?').get(id);
      if (cart) { db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id); db.prepare('DELETE FROM carts WHERE id = ?').run(cart.id); }
    });
    Auditoria.registrar({ quem: 'titular', acao: 'lgpd.excluir', entidade: 'users', entidade_id: id });
    return { ok: true, mensagem: 'Conta excluída. O histórico financeiro é preservado de forma anonimizada, como manda a lei.' };
  },
};

// ---------------------------------------------------------------------
// Endereços do comprador
// ---------------------------------------------------------------------
const Enderecos = {
  listar(userId) { return db.prepare('SELECT * FROM addresses WHERE user_id = ? AND excluido = 0 ORDER BY padrao DESC, criado_em DESC').all(s(userId, 40)); },
  obter(userId, id) { return db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ? AND excluido = 0').get(s(id, 40), s(userId, 40)) || null; },
  criar(userId, d) {
    const cep = s(d.cep, 9).replace(/\D/g, '');
    if (cep.length !== 8) throw new Error('CEP inválido (8 dígitos).');
    if (!s(d.logradouro, 160) || !s(d.cidade, 80) || !s(d.uf, 2)) throw new Error('Preencha logradouro, cidade e UF.');
    const id = novoId();
    transacao(() => {
      if (d.padrao || !db.prepare('SELECT 1 FROM addresses WHERE user_id = ? AND excluido = 0 LIMIT 1').get(userId)) {
        db.prepare('UPDATE addresses SET padrao = 0 WHERE user_id = ?').run(userId);
        d.padrao = true;
      }
      db.prepare(`INSERT INTO addresses (id, user_id, rotulo, destinatario, cep, logradouro, numero, complemento, bairro, cidade, uf, padrao, criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, s(userId, 40), s(d.rotulo, 40) || 'Casa', s(d.destinatario, 120), cep, s(d.logradouro, 160),
          s(d.numero, 20), s(d.complemento, 80), s(d.bairro, 80), s(d.cidade, 80), s(d.uf, 2).toUpperCase(), d.padrao ? 1 : 0, nowISO());
    });
    return Enderecos.obter(userId, id);
  },
  remover(userId, id) {
    const e = Enderecos.obter(userId, id);
    if (!e) throw new Error('Endereço não encontrado.');
    db.prepare('UPDATE addresses SET excluido = 1 WHERE id = ?').run(e.id);
    return { ok: true };
  },
};

// ---------------------------------------------------------------------
// Vendedor (seller_profiles)
// ---------------------------------------------------------------------
const Vendedores = {
  obter(userId) { return db.prepare('SELECT * FROM seller_profiles WHERE user_id = ?').get(s(userId, 40)) || null; },
  porSlug(slug) {
    return db.prepare(`SELECT sp.*, u.nome AS user_nome, u.criado_em AS user_desde, u.status AS user_status
      FROM seller_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.loja_slug = ?`).get(s(slug, 90)) || null;
  },
  criar(userId, d) {
    const u = Users.obter(userId);
    if (!u || u.status !== 'ativo') throw new Error('Conta inválida.');
    if (!u.email_verificado) throw new Error('Verifique seu e-mail antes de se tornar vendedor.');
    if (Vendedores.obter(userId)) throw new Error('Você já tem cadastro de vendedor.');
    const nome = s(d.loja_nome, 80);
    if (!nome) throw new Error('Dê um nome à sua loja.');
    const cep = s(d.cep_origem, 9).replace(/\D/g, '');
    if (cep.length !== 8) throw new Error('Informe o CEP de origem dos envios (8 dígitos).');
    let slug = slugify(nome) || 'loja';
    let i = 1;
    while (db.prepare('SELECT 1 FROM seller_profiles WHERE loja_slug = ?').get(slug)) slug = slugify(nome) + '-' + (++i);
    db.prepare(`INSERT INTO seller_profiles (user_id, loja_nome, loja_slug, descricao, cidade, uf, cep_origem, retirada_habilitada, pix_tipo, pix_chave, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, nome, slug, s(d.descricao, 600), s(d.cidade, 80) || u.cidade, (s(d.uf, 2) || u.uf).toUpperCase(),
        cep, d.retirada_habilitada ? 1 : 0, s(d.pix_tipo, 20), s(d.pix_chave, 120), nowISO());
    evento(userId, 'vendedor.criar', slug);
    return Vendedores.obter(userId);
  },
  atualizar(userId, d) {
    const v = Vendedores.obter(userId);
    if (!v) throw new Error('Cadastro de vendedor não encontrado.');
    const cep = d.cep_origem == null ? v.cep_origem : s(d.cep_origem, 9).replace(/\D/g, '');
    db.prepare(`UPDATE seller_profiles SET loja_nome=?, descricao=?, cidade=?, uf=?, cep_origem=?, retirada_habilitada=?, pix_tipo=?, pix_chave=? WHERE user_id=?`)
      .run(s(d.loja_nome, 80) || v.loja_nome, d.descricao == null ? v.descricao : s(d.descricao, 600),
        d.cidade == null ? v.cidade : s(d.cidade, 80), d.uf == null ? v.uf : s(d.uf, 2).toUpperCase(), cep,
        d.retirada_habilitada == null ? v.retirada_habilitada : (d.retirada_habilitada ? 1 : 0),
        d.pix_tipo == null ? v.pix_tipo : s(d.pix_tipo, 20), d.pix_chave == null ? v.pix_chave : s(d.pix_chave, 120), userId);
    return Vendedores.obter(userId);
  },
  // ficha pública: reputação sem dado pessoal
  publico(userId) {
    const v = db.prepare(`SELECT sp.loja_nome, sp.loja_slug, sp.descricao, sp.cidade, sp.uf, sp.vendas_concluidas,
        sp.nota_media, sp.num_avaliacoes, sp.entregas_no_prazo, sp.entregas_total, sp.status, u.criado_em AS desde
      FROM seller_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.user_id = ?`).get(s(userId, 40));
    if (!v) return null;
    return { ...v, indice_prazo: v.entregas_total ? Math.round((v.entregas_no_prazo * 100) / v.entregas_total) : null };
  },
  recalcularReputacao(userId) {
    const r = db.prepare(`SELECT COUNT(*) AS qtd, AVG((nota_produto + nota_descricao + nota_embalagem + nota_envio + nota_atendimento) / 5.0) AS media
      FROM reviews WHERE seller_id = ? AND status = 'publicada'`).get(s(userId, 40));
    db.prepare('UPDATE seller_profiles SET nota_media = ?, num_avaliacoes = ? WHERE user_id = ?')
      .run(Math.round((r.media || 0) * 10) / 10, r.qtd || 0, userId);
  },
};

// ---------------------------------------------------------------------
// Categorias (com subcategoria via parent_id)
// ---------------------------------------------------------------------
const CATEGORIAS_SEED = [
  { slug: 'eletronicos', nome: 'Eletrônicos', emoji: '📱', filhos: ['Smartphones', 'Notebooks', 'Câmeras', 'Videogames', 'TVs e áudio'] },
  { slug: 'casa-e-moveis', nome: 'Casa e Móveis', emoji: '🛋️', filhos: ['Mesas e cadeiras', 'Sofás e estofados', 'Móveis infantis', 'Decoração'] },
  { slug: 'eletrodomesticos', nome: 'Eletrodomésticos', emoji: '🫖', filhos: ['Cozinha', 'Lavanderia', 'Climatização'] },
  { slug: 'esporte-e-lazer', nome: 'Esporte e Lazer', emoji: '🚲', filhos: ['Bicicletas', 'Camping', 'Fitness'] },
  { slug: 'livros', nome: 'Livros', emoji: '📚', filhos: ['Literatura', 'Técnicos', 'Infantis'] },
  { slug: 'musica', nome: 'Música', emoji: '🎸', filhos: ['Instrumentos de corda', 'Teclas', 'Áudio e estúdio'] },
  { slug: 'moda', nome: 'Moda', emoji: '👟', filhos: ['Roupas', 'Calçados', 'Acessórios'] },
  { slug: 'infantil', nome: 'Infantil', emoji: '🧸', filhos: ['Brinquedos', 'Carrinhos e cadeirinhas'] },
];

const Categorias = {
  listar({ arvore = false } = {}) {
    const todas = db.prepare('SELECT * FROM categories WHERE ativa = 1 ORDER BY ordem, nome').all();
    if (!arvore) return todas;
    const raizes = todas.filter((c) => !c.parent_id);
    return raizes.map((r) => ({ ...r, filhos: todas.filter((c) => c.parent_id === r.id) }));
  },
  porSlug(slug) { return db.prepare('SELECT * FROM categories WHERE slug = ?').get(s(slug, 90)) || null; },
  obter(id) { return db.prepare('SELECT * FROM categories WHERE id = ?').get(s(id, 40)) || null; },
  criar(d, quem) {
    const nome = s(d.nome, 60);
    if (!nome) throw new Error('Informe o nome da categoria.');
    const id = novoId();
    let slug = slugify(nome);
    if (db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug)) slug += '-' + id.slice(0, 4).toLowerCase();
    db.prepare('INSERT INTO categories (id, slug, nome, emoji, parent_id, ordem, ativa) VALUES (?,?,?,?,?,?,1)')
      .run(id, slug, nome, s(d.emoji, 8), s(d.parent_id, 40), inteiro(d.ordem, 0));
    Auditoria.registrar({ quem, acao: 'categoria.criar', entidade: 'categories', entidade_id: id, detalhe: nome });
    return Categorias.obter(id);
  },
  atualizar(id, d, quem) {
    const c = Categorias.obter(id);
    if (!c) throw new Error('Categoria não encontrada.');
    db.prepare('UPDATE categories SET nome=?, emoji=?, ordem=?, ativa=? WHERE id=?')
      .run(s(d.nome, 60) || c.nome, d.emoji == null ? c.emoji : s(d.emoji, 8), d.ordem == null ? c.ordem : inteiro(d.ordem, 0),
        d.ativa == null ? c.ativa : (d.ativa ? 1 : 0), c.id);
    Auditoria.registrar({ quem, acao: 'categoria.atualizar', entidade: 'categories', entidade_id: id });
    return Categorias.obter(id);
  },
  // uma categoria e todas as filhas (para filtrar a busca pela raiz)
  idsComFilhas(id) {
    const filhas = db.prepare('SELECT id FROM categories WHERE parent_id = ?').all(s(id, 40)).map((c) => c.id);
    return [s(id, 40), ...filhas];
  },
};

// ---------------------------------------------------------------------
// Produtos (anúncios)
// ---------------------------------------------------------------------
function validarProduto(d, parcial = false, atual = null) {
  const p = {};
  if (!parcial || d.titulo != null) {
    p.titulo = s(d.titulo, 120);
    if (p.titulo.length < 8) throw new Error('O título precisa de pelo menos 8 caracteres.');
  }
  if (!parcial || d.descricao != null) {
    p.descricao = s(d.descricao, 6000);
    if (p.descricao.length < 30) throw new Error('Descreva o produto com pelo menos 30 caracteres — descrição honesta vende mais.');
  }
  if (!parcial || d.categoria_id != null) {
    p.categoria_id = s(d.categoria_id, 40);
    if (!Categorias.obter(p.categoria_id)) throw new Error('Escolha uma categoria válida.');
  }
  if (!parcial || d.condicao != null) {
    p.condicao = s(d.condicao, 20);
    if (!CONDICOES.includes(p.condicao)) throw new Error('Condição deve ser: novo, seminovo ou usado.');
  }
  if (!parcial || d.preco_centavos != null) {
    p.preco_centavos = cent(d.preco_centavos);
    if (p.preco_centavos < Config.num('min_preco_centavos', 100)) throw new Error('Preço abaixo do mínimo da plataforma.');
  }
  const condicao = p.condicao || (atual && atual.condicao);
  const defeitos = d.defeitos != null ? s(d.defeitos, 2000) : (atual ? atual.defeitos : '');
  if (condicao !== 'novo' && defeitos.length < 10) {
    throw new Error('Produto usado ou seminovo exige o bloco "estado do produto": descreva marcas de uso e defeitos conhecidos (ou escreva que não há).');
  }
  return p;
}

const Products = {
  obter(id) { return db.prepare('SELECT * FROM products WHERE id = ? AND excluido = 0').get(s(id, 40)) || null; },
  porSlug(slug) { return db.prepare('SELECT * FROM products WHERE slug = ? AND excluido = 0').get(s(slug, 90)) || null; },
  fotos(productId) { return db.prepare('SELECT id, url, ordem FROM product_images WHERE product_id = ? ORDER BY ordem').all(s(productId, 40)); },

  criar(sellerId, d) {
    const vendedor = Vendedores.obter(sellerId);
    if (!vendedor) throw new Error('Complete seu cadastro de vendedor antes de anunciar.');
    if (vendedor.status !== 'ativo') throw new Error('Sua conta de vendedor está suspensa.');
    const v = validarProduto(d);
    const id = novoId();
    let slug = slugify(v.titulo);
    if (!slug || db.prepare('SELECT 1 FROM products WHERE slug = ?').get(slug)) slug = (slug || 'produto') + '-' + id.slice(0, 5).toLowerCase();
    const agora = nowISO();
    db.prepare(`INSERT INTO products (id, seller_id, titulo, slug, descricao, categoria_id, condicao, preco_centavos,
        preco_anterior_centavos, quantidade, marca, modelo, cidade, uf, cep_origem, peso_gramas, comp_cm, larg_cm, alt_cm,
        defeitos, garantia, entrega_envio, entrega_retirada, status, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'rascunho',?,?)`)
      .run(id, s(sellerId, 40), v.titulo, slug, v.descricao, v.categoria_id, v.condicao, v.preco_centavos,
        cent(d.preco_anterior_centavos), Math.max(1, inteiro(d.quantidade, 1)), s(d.marca, 60), s(d.modelo, 60),
        s(d.cidade, 80) || vendedor.cidade, (s(d.uf, 2) || vendedor.uf).toUpperCase(),
        s(d.cep_origem, 8).replace(/\D/g, '') || vendedor.cep_origem,
        Math.max(1, inteiro(d.peso_gramas, 500)), Math.max(1, inteiro(d.comp_cm, 20)), Math.max(1, inteiro(d.larg_cm, 20)), Math.max(1, inteiro(d.alt_cm, 10)),
        s(d.defeitos, 2000), s(d.garantia, 200),
        d.entrega_envio == null ? 1 : (d.entrega_envio ? 1 : 0),
        d.entrega_retirada ? (vendedor.retirada_habilitada ? 1 : 0) : 0, agora, agora);
    evento(sellerId, 'produto.criar', id, { titulo: v.titulo });
    return Products.obter(id);
  },

  atualizar(sellerId, id, d) {
    const p = Products.obter(id);
    if (!p || p.seller_id !== sellerId) throw new Error('Anúncio não encontrado.');
    if (['vendido', 'arquivado'].includes(p.status)) throw new Error('Anúncio encerrado não pode ser editado.');
    const v = validarProduto(d, true, p);
    const campos = {
      titulo: v.titulo != null ? v.titulo : p.titulo,
      descricao: v.descricao != null ? v.descricao : p.descricao,
      categoria_id: v.categoria_id != null ? v.categoria_id : p.categoria_id,
      condicao: v.condicao != null ? v.condicao : p.condicao,
      preco_centavos: v.preco_centavos != null ? v.preco_centavos : p.preco_centavos,
      preco_anterior_centavos: d.preco_anterior_centavos == null ? p.preco_anterior_centavos : cent(d.preco_anterior_centavos),
      quantidade: d.quantidade == null ? p.quantidade : Math.max(0, inteiro(d.quantidade, p.quantidade)),
      marca: d.marca == null ? p.marca : s(d.marca, 60),
      modelo: d.modelo == null ? p.modelo : s(d.modelo, 60),
      cidade: d.cidade == null ? p.cidade : s(d.cidade, 80),
      uf: d.uf == null ? p.uf : s(d.uf, 2).toUpperCase(),
      cep_origem: d.cep_origem == null ? p.cep_origem : s(d.cep_origem, 8).replace(/\D/g, ''),
      peso_gramas: d.peso_gramas == null ? p.peso_gramas : Math.max(1, inteiro(d.peso_gramas, p.peso_gramas)),
      comp_cm: d.comp_cm == null ? p.comp_cm : Math.max(1, inteiro(d.comp_cm, p.comp_cm)),
      larg_cm: d.larg_cm == null ? p.larg_cm : Math.max(1, inteiro(d.larg_cm, p.larg_cm)),
      alt_cm: d.alt_cm == null ? p.alt_cm : Math.max(1, inteiro(d.alt_cm, p.alt_cm)),
      defeitos: d.defeitos == null ? p.defeitos : s(d.defeitos, 2000),
      garantia: d.garantia == null ? p.garantia : s(d.garantia, 200),
      entrega_envio: d.entrega_envio == null ? p.entrega_envio : (d.entrega_envio ? 1 : 0),
      entrega_retirada: d.entrega_retirada == null ? p.entrega_retirada : (d.entrega_retirada ? 1 : 0),
    };
    // edição substantiva de anúncio ativo volta para a fila de moderação
    const mudouConteudo = campos.titulo !== p.titulo || campos.descricao !== p.descricao || campos.categoria_id !== p.categoria_id;
    const status = (p.status === 'ativo' && mudouConteudo && Config.get('moderacao_previa', 'on') === 'on') ? 'aguardando_aprovacao' : p.status;
    db.prepare(`UPDATE products SET titulo=?, descricao=?, categoria_id=?, condicao=?, preco_centavos=?, preco_anterior_centavos=?,
        quantidade=?, marca=?, modelo=?, cidade=?, uf=?, cep_origem=?, peso_gramas=?, comp_cm=?, larg_cm=?, alt_cm=?,
        defeitos=?, garantia=?, entrega_envio=?, entrega_retirada=?, status=?, atualizado_em=? WHERE id=?`)
      .run(campos.titulo, campos.descricao, campos.categoria_id, campos.condicao, campos.preco_centavos, campos.preco_anterior_centavos,
        campos.quantidade, campos.marca, campos.modelo, campos.cidade, campos.uf, campos.cep_origem,
        campos.peso_gramas, campos.comp_cm, campos.larg_cm, campos.alt_cm, campos.defeitos, campos.garantia,
        campos.entrega_envio, campos.entrega_retirada, status, nowISO(), p.id);
    return Products.obter(id);
  },

  // rascunho → aguardando_aprovacao (ou direto ativo, se moderação prévia desligada)
  publicar(sellerId, id) {
    const p = Products.obter(id);
    if (!p || p.seller_id !== sellerId) throw new Error('Anúncio não encontrado.');
    if (!['rascunho', 'pausado', 'rejeitado'].includes(p.status)) throw new Error('Este anúncio não está em estado publicável.');
    if (!Products.fotos(id).length) throw new Error('Adicione pelo menos 1 foto antes de publicar.');
    if (p.quantidade < 1) throw new Error('Informe a quantidade disponível.');
    const u = Users.obter(sellerId);
    if (!u.email_verificado) throw new Error('Verifique seu e-mail antes de publicar anúncios.');
    const alvo = Config.get('moderacao_previa', 'on') === 'on' ? 'aguardando_aprovacao' : 'ativo';
    db.prepare("UPDATE products SET status = ?, motivo_rejeicao = '', atualizado_em = ? WHERE id = ?").run(alvo, nowISO(), id);
    evento(sellerId, 'produto.publicar', id, { status: alvo });
    return Products.obter(id);
  },
  pausar(sellerId, id) {
    const p = Products.obter(id);
    if (!p || p.seller_id !== sellerId) throw new Error('Anúncio não encontrado.');
    if (!['ativo', 'aguardando_aprovacao'].includes(p.status)) throw new Error('Só é possível pausar anúncio ativo.');
    db.prepare("UPDATE products SET status = 'pausado', atualizado_em = ? WHERE id = ?").run(nowISO(), id);
    return Products.obter(id);
  },
  encerrar(sellerId, id) {
    const p = Products.obter(id);
    if (!p || p.seller_id !== sellerId) throw new Error('Anúncio não encontrado.');
    db.prepare("UPDATE products SET status = 'arquivado', atualizado_em = ? WHERE id = ?").run(nowISO(), id);
    return Products.obter(id);
  },

  // moderação (staff)
  moderar(id, decisao, { motivo = '', quem = '' } = {}) {
    const p = Products.obter(id);
    if (!p) throw new Error('Anúncio não encontrado.');
    if (decisao === 'aprovar') {
      db.prepare("UPDATE products SET status = 'ativo', motivo_rejeicao = '', atualizado_em = ? WHERE id = ?").run(nowISO(), id);
      Notificacoes.criar(p.seller_id, { titulo: 'Anúncio aprovado', texto: `"${p.titulo}" está na vitrine.`, url: '/vitrine/p/' + p.slug });
    } else if (decisao === 'rejeitar') {
      if (!s(motivo, 300)) throw new Error('Informe o motivo da rejeição — o vendedor precisa saber o que corrigir.');
      db.prepare("UPDATE products SET status = 'rejeitado', motivo_rejeicao = ?, atualizado_em = ? WHERE id = ?").run(s(motivo, 300), nowISO(), id);
      Notificacoes.criar(p.seller_id, { titulo: 'Anúncio rejeitado', texto: `"${p.titulo}": ${s(motivo, 200)}`, url: '/vitrine/app#anuncios' });
    } else if (decisao === 'bloquear') {
      db.prepare("UPDATE products SET status = 'arquivado', motivo_rejeicao = ?, atualizado_em = ? WHERE id = ?").run(s(motivo, 300) || 'Bloqueado pela moderação', nowISO(), id);
    } else throw new Error('Decisão inválida.');
    Auditoria.registrar({ quem, acao: 'produto.moderar.' + decisao, entidade: 'products', entidade_id: id, detalhe: s(motivo, 300) });
    return Products.obter(id);
  },

  registrarVisita(id) { db.prepare('UPDATE products SET vistos = vistos + 1 WHERE id = ?').run(s(id, 40)); },

  // busca da vitrine — todos os filtros opcionais; usado pela página /vitrine/busca
  buscar({ q = '', categoria = '', condicao = '', precoMin = null, precoMax = null, uf = '', cidade = '',
    entrega = '', notaMin = null, ordem = 'relevancia', pagina = 1, porPagina = 24, sellerId = '' } = {}) {
    const where = ["p.status = 'ativo'", 'p.excluido = 0', 'p.quantidade > 0'];
    const args = [];
    if (s(q, 120)) { where.push('(p.titulo LIKE ? OR p.descricao LIKE ? OR p.marca LIKE ? OR p.modelo LIKE ?)'); const like = '%' + s(q, 120) + '%'; args.push(like, like, like, like); }
    if (s(categoria, 90)) {
      const cat = Categorias.porSlug(categoria) || Categorias.obter(categoria);
      if (cat) { const ids = Categorias.idsComFilhas(cat.id); where.push(`p.categoria_id IN (${ids.map(() => '?').join(',')})`); args.push(...ids); }
    }
    if (CONDICOES.includes(s(condicao, 20))) { where.push('p.condicao = ?'); args.push(s(condicao, 20)); }
    if (precoMin != null && n(precoMin, -1) >= 0) { where.push('p.preco_centavos >= ?'); args.push(cent(precoMin)); }
    if (precoMax != null && n(precoMax, 0) > 0) { where.push('p.preco_centavos <= ?'); args.push(cent(precoMax)); }
    if (s(uf, 2)) { where.push('p.uf = ?'); args.push(s(uf, 2).toUpperCase()); }
    if (s(cidade, 80)) { where.push('p.cidade LIKE ?'); args.push('%' + s(cidade, 80) + '%'); }
    if (entrega === 'envio') where.push('p.entrega_envio = 1');
    if (entrega === 'retirada') where.push('p.entrega_retirada = 1');
    if (notaMin != null && n(notaMin, 0) > 0) { where.push('sp.nota_media >= ?'); args.push(n(notaMin, 0)); }
    if (s(sellerId, 40)) { where.push('p.seller_id = ?'); args.push(s(sellerId, 40)); }
    const ordens = {
      relevancia: 'p.vistos DESC, p.criado_em DESC',
      menor_preco: 'p.preco_centavos ASC',
      maior_preco: 'p.preco_centavos DESC',
      recentes: 'p.criado_em DESC',
      populares: 'p.vendidos DESC, p.vistos DESC',
    };
    const orderBy = ordens[s(ordem, 20)] || ordens.relevancia;
    const pg = Math.max(1, inteiro(pagina, 1));
    const pp = Math.min(48, Math.max(1, inteiro(porPagina, 24)));
    const base = `FROM products p JOIN seller_profiles sp ON sp.user_id = p.seller_id
      JOIN users u ON u.id = p.seller_id AND u.status = 'ativo' WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(...args).c;
    const itens = db.prepare(`SELECT p.id, p.titulo, p.slug, p.condicao, p.preco_centavos, p.preco_anterior_centavos,
        p.cidade, p.uf, p.entrega_envio, p.entrega_retirada, p.quantidade, p.criado_em,
        sp.loja_nome, sp.loja_slug, sp.nota_media, sp.num_avaliacoes,
        (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.ordem LIMIT 1) AS foto
      ${base} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...args, pp, (pg - 1) * pp);
    return { itens, total, pagina: pg, por_pagina: pp, paginas: Math.max(1, Math.ceil(total / pp)) };
  },

  doVendedor(sellerId, { status = '' } = {}) {
    const where = ['seller_id = ?', 'excluido = 0'];
    const args = [s(sellerId, 40)];
    if (STATUS_PRODUTO.includes(s(status, 30))) { where.push('status = ?'); args.push(s(status, 30)); }
    return db.prepare(`SELECT p.*, (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.ordem LIMIT 1) AS foto
      FROM products p WHERE ${where.join(' AND ')} ORDER BY atualizado_em DESC`).all(...args);
  },

  // ficha completa da página pública do produto
  fichaPublica(slug) {
    const p = Products.porSlug(slug);
    if (!p || p.excluido) return null;
    const vendedor = Vendedores.publico(p.seller_id);
    const avaliacoes = db.prepare(`SELECT r.nota_produto, r.nota_descricao, r.comentario, r.criado_em, u.nome AS comprador
      FROM reviews r JOIN users u ON u.id = r.buyer_id WHERE r.product_id = ? AND r.status = 'publicada'
      ORDER BY r.criado_em DESC LIMIT 20`).all(p.id);
    const media = db.prepare("SELECT AVG(nota_produto) AS m, COUNT(*) AS c FROM reviews WHERE product_id = ? AND status = 'publicada'").get(p.id);
    return {
      ...p, fotos: Products.fotos(p.id), vendedor,
      categoria: Categorias.obter(p.categoria_id),
      perguntas: Perguntas.doProduto(p.id),
      avaliacoes, nota_media: media.c ? Math.round(media.m * 10) / 10 : null, num_avaliacoes: media.c,
    };
  },

  // fotos
  adicionarFoto(sellerId, productId, url) {
    const p = Products.obter(productId);
    if (!p || p.seller_id !== sellerId) throw new Error('Anúncio não encontrado.');
    const max = Config.num('max_fotos_por_anuncio', 8);
    const qtd = db.prepare('SELECT COUNT(*) AS c FROM product_images WHERE product_id = ?').get(productId).c;
    if (qtd >= max) throw new Error(`Limite de ${max} fotos por anúncio.`);
    const id = novoId();
    db.prepare('INSERT INTO product_images (id, product_id, url, ordem, criado_em) VALUES (?,?,?,?,?)')
      .run(id, productId, s(url, 400), qtd, nowISO());
    return { id, url: s(url, 400) };
  },
  removerFoto(sellerId, productId, fotoId) {
    const p = Products.obter(productId);
    if (!p || p.seller_id !== sellerId) throw new Error('Anúncio não encontrado.');
    db.prepare('DELETE FROM product_images WHERE id = ? AND product_id = ?').run(s(fotoId, 40), productId);
    return { ok: true };
  },
};

// ---------------------------------------------------------------------
// Favoritos
// ---------------------------------------------------------------------
const Favoritos = {
  alternar(userId, productId) {
    const p = Products.obter(productId);
    if (!p) throw new Error('Produto não encontrado.');
    const tem = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND product_id = ?').get(userId, productId);
    if (tem) { db.prepare('DELETE FROM favorites WHERE user_id = ? AND product_id = ?').run(userId, productId); return { favoritado: false }; }
    db.prepare('INSERT INTO favorites (user_id, product_id, criado_em) VALUES (?,?,?)').run(userId, productId, nowISO());
    return { favoritado: true };
  },
  listar(userId) {
    return db.prepare(`SELECT p.id, p.titulo, p.slug, p.condicao, p.preco_centavos, p.status, p.quantidade, f.criado_em AS favoritado_em,
        (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.ordem LIMIT 1) AS foto
      FROM favorites f JOIN products p ON p.id = f.product_id AND p.excluido = 0
      WHERE f.user_id = ? ORDER BY f.criado_em DESC`).all(s(userId, 40));
  },
  ids(userId) { return db.prepare('SELECT product_id FROM favorites WHERE user_id = ?').all(s(userId, 40)).map((r) => r.product_id); },
};

// ---------------------------------------------------------------------
// Carrinho — pode conter itens de vários vendedores, mas o CHECKOUT é
// sempre por vendedor (1 pedido = 1 vendedor no MVP). A interface avisa.
// ---------------------------------------------------------------------
const Carrinho = {
  deUsuario(userId) {
    let c = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(s(userId, 40));
    if (!c) {
      const id = novoId();
      db.prepare('INSERT INTO carts (id, user_id, atualizado_em) VALUES (?,?,?)').run(id, s(userId, 40), nowISO());
      c = { id, user_id: userId };
    }
    return c;
  },
  adicionar(userId, productId, quantidade = 1) {
    const p = Products.obter(productId);
    if (!p || p.status !== 'ativo' || p.quantidade < 1) throw new Error('Este produto não está disponível.');
    if (p.seller_id === userId) throw new Error('Você não pode comprar o próprio anúncio.');
    const qtd = Math.max(1, Math.min(inteiro(quantidade, 1), p.quantidade));
    const c = Carrinho.deUsuario(userId);
    db.prepare(`INSERT INTO cart_items (id, cart_id, product_id, quantidade, criado_em) VALUES (?,?,?,?,?)
      ON CONFLICT(cart_id, product_id) DO UPDATE SET quantidade = MIN(excluded.quantidade + cart_items.quantidade, ?)`)
      .run(novoId(), c.id, productId, qtd, nowISO(), p.quantidade);
    db.prepare('UPDATE carts SET atualizado_em = ? WHERE id = ?').run(nowISO(), c.id);
    return Carrinho.ver(userId);
  },
  ajustar(userId, productId, quantidade) {
    const c = Carrinho.deUsuario(userId);
    const qtd = inteiro(quantidade, 0);
    if (qtd < 1) db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?').run(c.id, s(productId, 40));
    else {
      const p = Products.obter(productId);
      if (!p) throw new Error('Produto não encontrado.');
      db.prepare('UPDATE cart_items SET quantidade = ? WHERE cart_id = ? AND product_id = ?').run(Math.min(qtd, p.quantidade), c.id, productId);
    }
    return Carrinho.ver(userId);
  },
  limparVendedor(userId, sellerId) {
    const c = Carrinho.deUsuario(userId);
    const r = db.prepare(`DELETE FROM cart_items WHERE cart_id = ? AND product_id IN (SELECT id FROM products WHERE seller_id = ?)`)
      .run(c.id, s(sellerId, 40));
    // devolve o total removido: quem cria pedido usa isto para REIVINDICAR o
    // carrinho — dois checkouts simultâneos, só um remove linha, só um cria.
    return r.changes;
  },
  // visão agrupada POR VENDEDOR: é o contrato de "1 pedido por vendedor"
  ver(userId) {
    const c = Carrinho.deUsuario(userId);
    const itens = db.prepare(`SELECT ci.product_id, ci.quantidade, p.titulo, p.slug, p.condicao, p.preco_centavos,
        p.quantidade AS estoque, p.status, p.seller_id, p.entrega_envio, p.entrega_retirada,
        p.peso_gramas, p.comp_cm, p.larg_cm, p.alt_cm, p.cep_origem,
        sp.loja_nome, sp.loja_slug,
        (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.ordem LIMIT 1) AS foto
      FROM cart_items ci JOIN products p ON p.id = ci.product_id AND p.excluido = 0
      JOIN seller_profiles sp ON sp.user_id = p.seller_id
      WHERE ci.cart_id = ? ORDER BY sp.loja_nome, p.titulo`).all(c.id);
    const grupos = new Map();
    for (const i of itens) {
      const g = grupos.get(i.seller_id) || { seller_id: i.seller_id, loja_nome: i.loja_nome, loja_slug: i.loja_slug, itens: [], subtotal_centavos: 0 };
      const disponivel = i.status === 'ativo' && i.estoque > 0;
      g.itens.push({ ...i, disponivel, quantidade: Math.min(i.quantidade, Math.max(i.estoque, 0)) });
      if (disponivel) g.subtotal_centavos += i.preco_centavos * Math.min(i.quantidade, i.estoque);
      grupos.set(i.seller_id, g);
    }
    const lista = [...grupos.values()];
    return {
      grupos: lista,
      multiplos_vendedores: lista.length > 1,
      aviso: lista.length > 1
        ? 'Seu carrinho tem produtos de vendedores diferentes. Cada vendedor gera um pedido separado, com frete e pagamento próprios.'
        : '',
    };
  },
};

// ---------------------------------------------------------------------
// Perguntas do produto
// ---------------------------------------------------------------------
const Perguntas = {
  perguntar(userId, productId, texto) {
    const p = Products.obter(productId);
    if (!p || p.status !== 'ativo') throw new Error('Produto não encontrado.');
    if (p.seller_id === userId) throw new Error('Você não pode perguntar no próprio anúncio.');
    const pergunta = s(texto, 500);
    if (pergunta.length < 5) throw new Error('Escreva a pergunta.');
    const id = novoId();
    db.prepare('INSERT INTO product_questions (id, product_id, autor_id, pergunta, criado_em) VALUES (?,?,?,?,?)')
      .run(id, productId, s(userId, 40), pergunta, nowISO());
    Notificacoes.criar(p.seller_id, { titulo: 'Nova pergunta', texto: pergunta.slice(0, 120), url: '/vitrine/app#perguntas' });
    return { id };
  },
  responder(sellerId, perguntaId, texto) {
    const q = db.prepare('SELECT q.*, p.seller_id, p.slug FROM product_questions q JOIN products p ON p.id = q.product_id WHERE q.id = ?').get(s(perguntaId, 40));
    if (!q || q.seller_id !== sellerId) throw new Error('Pergunta não encontrada.');
    const resposta = s(texto, 1000);
    if (!resposta) throw new Error('Escreva a resposta.');
    db.prepare('UPDATE product_questions SET resposta = ?, respondida_em = ? WHERE id = ?').run(resposta, nowISO(), q.id);
    Notificacoes.criar(q.autor_id, { titulo: 'Sua pergunta foi respondida', texto: resposta.slice(0, 120), url: '/vitrine/p/' + q.slug });
    return { ok: true };
  },
  doProduto(productId) {
    return db.prepare(`SELECT q.id, q.pergunta, q.resposta, q.criado_em, q.respondida_em, u.nome AS autor
      FROM product_questions q JOIN users u ON u.id = q.autor_id
      WHERE q.product_id = ? AND q.status = 'publicada' ORDER BY q.criado_em DESC LIMIT 30`).all(s(productId, 40));
  },
  doVendedor(sellerId, { pendentes = false } = {}) {
    const extra = pendentes ? "AND q.resposta = ''" : '';
    return db.prepare(`SELECT q.*, p.titulo AS produto, p.slug, u.nome AS autor
      FROM product_questions q JOIN products p ON p.id = q.product_id JOIN users u ON u.id = q.autor_id
      WHERE p.seller_id = ? AND q.status = 'publicada' ${extra} ORDER BY q.criado_em DESC LIMIT 100`).all(s(sellerId, 40));
  },
  moderar(id, status, quem) {
    if (!['publicada', 'oculta'].includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE product_questions SET status = ? WHERE id = ?').run(status, s(id, 40));
    Auditoria.registrar({ quem, acao: 'pergunta.moderar', entidade: 'product_questions', entidade_id: id, detalhe: status });
  },
};

// ---------------------------------------------------------------------
// Denúncias
// ---------------------------------------------------------------------
const Denuncias = {
  criar({ tipo, alvo_id, autor_id = '', motivo, detalhe = '' }) {
    if (!['produto', 'usuario'].includes(s(tipo, 20))) throw new Error('Tipo de denúncia inválido.');
    if (!s(motivo, 80)) throw new Error('Informe o motivo.');
    const id = novoId();
    db.prepare('INSERT INTO reports (id, tipo, alvo_id, autor_id, motivo, detalhe, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(id, s(tipo, 20), s(alvo_id, 40), s(autor_id, 40), s(motivo, 80), s(detalhe, 1000), nowISO());
    return { id };
  },
  listar({ status = 'aberta' } = {}) {
    return db.prepare('SELECT * FROM reports WHERE status = ? ORDER BY criado_em DESC LIMIT 200').all(s(status, 20) || 'aberta');
  },
  resolver(id, resolucao, quem) {
    db.prepare("UPDATE reports SET status = 'resolvida', resolucao = ?, resolvido_em = ? WHERE id = ?")
      .run(s(resolucao, 400), nowISO(), s(id, 40));
    Auditoria.registrar({ quem, acao: 'denuncia.resolver', entidade: 'reports', entidade_id: id, detalhe: s(resolucao, 300) });
  },
};

function semear() {
  for (const [chave, v] of Object.entries(CONFIG_PADRAO)) {
    if (db.prepare('SELECT 1 FROM config WHERE chave = ?').get(chave)) continue;
    db.prepare('INSERT INTO config (chave, valor, descricao, atualizado_em) VALUES (?,?,?,?)').run(chave, v.valor, v.descricao, nowISO());
  }
  let ordem = 0;
  for (const c of CATEGORIAS_SEED) {
    let raiz = Categorias.porSlug(c.slug);
    if (!raiz) {
      const id = novoId();
      db.prepare('INSERT INTO categories (id, slug, nome, emoji, parent_id, ordem, ativa) VALUES (?,?,?,?,?,?,1)')
        .run(id, c.slug, c.nome, c.emoji, '', ordem);
      raiz = Categorias.obter(id);
    }
    ordem++;
    let sub = 0;
    for (const nome of c.filhos) {
      const slug = c.slug + '-' + slugify(nome);
      if (Categorias.porSlug(slug)) { sub++; continue; }
      db.prepare('INSERT INTO categories (id, slug, nome, emoji, parent_id, ordem, ativa) VALUES (?,?,?,?,?,?,1)')
        .run(novoId(), slug, nome, '', raiz.id, sub++);
    }
  }
}

module.exports = {
  s, n, inteiro, cent, slugify, CONDICOES, STATUS_PRODUTO,
  Config, Auditoria, evento, Notificacoes,
  Users, Enderecos, Vendedores, Categorias, Products, Favoritos, Carrinho, Perguntas, Denuncias,
  semear,
};
