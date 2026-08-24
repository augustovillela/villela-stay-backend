// =====================================================================
// Livraria Villela — repositório (acesso a dados + regras de negócio)
// Money sempre em CENTAVOS (INTEGER). Datas ISO. JSON em colunas TEXT.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, novoToken, j } = require('./db');

// ---------------------------------------------------------------- papéis
// Reaproveita usuarios.json do Portal Staff (papel admin|staff + areas[]).
// Dentro da área "livros", o papel funcional refina o que cada um pode fazer.
// Guardado por usuário em usuarios.json campo `papelLivraria` (default derivado).
const PAPEIS_LIVRARIA = {
  admin:      { livros: true, precos: true, pedidos: true, clientes: true, cupons: true, impressos: true, relatorios: true, config: true, auditoria: true },
  editor:     { livros: true, precos: true, pedidos: false, clientes: false, cupons: false, impressos: false, relatorios: true, config: false, auditoria: false },
  financeiro: { livros: false, precos: true, pedidos: true, clientes: true, cupons: true, impressos: false, relatorios: true, config: false, auditoria: true },
  suporte:    { livros: false, precos: false, pedidos: true, clientes: true, cupons: false, impressos: false, relatorios: false, config: false, auditoria: false },
  logistica:  { livros: false, precos: false, pedidos: true, clientes: false, cupons: false, impressos: true, relatorios: false, config: false, auditoria: false },
};
// Deriva permissões: admin do portal = admin da livraria; senão usa papelLivraria (default 'suporte').
function permissoesLivraria(user) {
  if (!user) return {};
  if (user.papel === 'admin') return PAPEIS_LIVRARIA.admin;
  const p = user.papelLivraria && PAPEIS_LIVRARIA[user.papelLivraria] ? user.papelLivraria : 'suporte';
  return PAPEIS_LIVRARIA[p];
}
function papelLivrariaDe(user) {
  if (!user) return null;
  if (user.papel === 'admin') return 'admin';
  return (user.papelLivraria && PAPEIS_LIVRARIA[user.papelLivraria]) ? user.papelLivraria : 'suporte';
}

// ---------------------------------------------------------------- money
const reais = (cents) => (Number(cents || 0) / 100);
const brl = (cents) => 'R$ ' + reais(cents).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------- slug
function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'livro';
}
function slugUnico(base, ignoreId) {
  let s = slugify(base), n = 1;
  // garante unicidade
  while (true) {
    const row = db.prepare('SELECT id FROM books WHERE slug = ?').get(s);
    if (!row || row.id === ignoreId) return s;
    n++; s = slugify(base) + '-' + n;
  }
}

// ============================================================ BOOKS
const BOOK_JSON = ['tags', 'beneficios', 'bonus', 'depoimentos', 'faq'];
function hidrataBook(r) {
  if (!r) return null;
  const o = { ...r };
  for (const k of BOOK_JSON) o[k] = j.parse(r[k], []);
  o.ativo = !!r.ativo; o.destaque = !!r.destaque;
  return o;
}
const Books = {
  listar() { return db.prepare('SELECT * FROM books ORDER BY destaque DESC, titulo').all().map(hidrataBook); },
  listarPublico() {
    return db.prepare('SELECT * FROM books WHERE ativo = 1 ORDER BY destaque DESC, titulo').all().map(hidrataBook);
  },
  obter(id) { return hidrataBook(db.prepare('SELECT * FROM books WHERE id = ?').get(id)); },
  porSlug(slug) { return hidrataBook(db.prepare('SELECT * FROM books WHERE slug = ?').get(slug)); },
  criar(d) {
    const id = novoId(), t = nowISO();
    const slug = slugUnico(d.slug || d.titulo, null);
    db.prepare(`INSERT INTO books
      (id,slug,titulo,subtitulo,autor,descricao_curta,descricao_longa,sumario,categoria,tags,publico_alvo,
       beneficios,bonus,depoimentos,faq,preco_pdf,preco_impresso,preco_combo,ativo,destaque,capa_url,
       seo_title,seo_description,og_image,created_at,updated_at)
      VALUES (@id,@slug,@titulo,@subtitulo,@autor,@descricao_curta,@descricao_longa,@sumario,@categoria,@tags,@publico_alvo,
       @beneficios,@bonus,@depoimentos,@faq,@preco_pdf,@preco_impresso,@preco_combo,@ativo,@destaque,@capa_url,
       @seo_title,@seo_description,@og_image,@created_at,@updated_at)`).run({
      id, slug,
      titulo: d.titulo || 'Sem título', subtitulo: d.subtitulo || '', autor: d.autor || 'Augusto Villela',
      descricao_curta: d.descricao_curta || '', descricao_longa: d.descricao_longa || '', sumario: d.sumario || '',
      categoria: d.categoria || '', tags: j.str(d.tags || []), publico_alvo: d.publico_alvo || '',
      beneficios: j.str(d.beneficios || []), bonus: j.str(d.bonus || []),
      depoimentos: j.str(d.depoimentos || []), faq: j.str(d.faq || []),
      preco_pdf: d.preco_pdf ?? null, preco_impresso: d.preco_impresso ?? null, preco_combo: d.preco_combo ?? null,
      ativo: d.ativo === false ? 0 : 1, destaque: d.destaque ? 1 : 0, capa_url: d.capa_url || '',
      seo_title: d.seo_title || '', seo_description: d.seo_description || '', og_image: d.og_image || '',
      created_at: t, updated_at: t,
    });
    return Books.obter(id);
  },
  atualizar(id, d) {
    const b = Books.obter(id); if (!b) return null;
    const campos = ['titulo', 'subtitulo', 'autor', 'descricao_curta', 'descricao_longa', 'sumario', 'categoria', 'publico_alvo', 'capa_url', 'seo_title', 'seo_description', 'og_image'];
    const set = {}; for (const c of campos) if (typeof d[c] === 'string') set[c] = d[c];
    for (const c of BOOK_JSON) if (d[c] !== undefined) set[c] = j.str(d[c]);
    for (const c of ['preco_pdf', 'preco_impresso', 'preco_combo']) if (d[c] !== undefined) set[c] = d[c] === null ? null : Math.round(Number(d[c]));
    if (d.ativo !== undefined) set.ativo = d.ativo ? 1 : 0;
    if (d.destaque !== undefined) set.destaque = d.destaque ? 1 : 0;
    if (typeof d.slug === 'string' && d.slug.trim()) set.slug = slugUnico(d.slug, id);
    else if (typeof d.titulo === 'string' && !b.slug) set.slug = slugUnico(d.titulo, id);
    set.updated_at = nowISO();
    const cols = Object.keys(set); if (!cols.length) return b;
    db.prepare(`UPDATE books SET ${cols.map(c => `${c}=@${c}`).join(', ')} WHERE id=@id`).run({ ...set, id });
    return Books.obter(id);
  },
  remover(id) { db.prepare('DELETE FROM books WHERE id = ?').run(id); },
};

// ======================================================= BOOK FILES (PDF)
const Files = {
  listar(bookId) { return db.prepare('SELECT * FROM book_files WHERE book_id = ? ORDER BY versao DESC').all(bookId); },
  ativo(bookId) { return db.prepare('SELECT * FROM book_files WHERE book_id = ? AND ativo = 1 ORDER BY versao DESC LIMIT 1').get(bookId); },
  obter(id) { return db.prepare('SELECT * FROM book_files WHERE id = ?').get(id); },
  // Adiciona nova versão e a torna a ativa (desativa as anteriores).
  adicionar(bookId, { filename, original_name, mime, tamanho }) {
    return transacao(() => {
      const ult = db.prepare('SELECT MAX(versao) v FROM book_files WHERE book_id = ?').get(bookId);
      const versao = (ult && ult.v ? ult.v : 0) + 1;
      db.prepare('UPDATE book_files SET ativo = 0, updated_at = ? WHERE book_id = ?').run(nowISO(), bookId);
      const id = novoId(), t = nowISO();
      db.prepare(`INSERT INTO book_files (id,book_id,filename,original_name,mime,tamanho,versao,ativo,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,1,?,?)`).run(id, bookId, filename, original_name || '', mime || 'application/pdf', tamanho || 0, versao, t, t);
      return Files.obter(id);
    });
  },
  ativar(id) {
    const f = Files.obter(id); if (!f) return null;
    transacao(() => {
      db.prepare('UPDATE book_files SET ativo = 0, updated_at = ? WHERE book_id = ?').run(nowISO(), f.book_id);
      db.prepare('UPDATE book_files SET ativo = 1, updated_at = ? WHERE id = ?').run(nowISO(), id);
    });
    return Files.obter(id);
  },
};

// ============================================================ ASSETS
const Assets = {
  listar(bookId) { return db.prepare('SELECT * FROM book_assets WHERE book_id = ? ORDER BY ordem, created_at').all(bookId); },
  adicionar(bookId, { url, tipo, ordem }) {
    const id = novoId(), t = nowISO();
    db.prepare('INSERT INTO book_assets (id,book_id,url,tipo,ordem,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, bookId, url, tipo || 'imagem', ordem || 0, t, t);
    return db.prepare('SELECT * FROM book_assets WHERE id = ?').get(id);
  },
  remover(id) { db.prepare('DELETE FROM book_assets WHERE id = ?').run(id); },
};

// ============================================================ CUSTOMERS
const Customers = {
  obter(id) { return db.prepare('SELECT * FROM customers WHERE id = ?').get(id); },
  porEmail(email) { return db.prepare('SELECT * FROM customers WHERE email = ? ORDER BY created_at LIMIT 1').get(String(email || '').toLowerCase()); },
  // Upsert por e-mail (comprador volta com mesmo e-mail = mesmo cadastro).
  upsert(d) {
    const email = String(d.email || '').toLowerCase().trim();
    const existe = email ? Customers.porEmail(email) : null;
    const t = nowISO();
    if (existe) {
      const set = { updated_at: t };
      for (const c of ['nome', 'whatsapp', 'doc', 'pais', 'estado', 'cidade', 'observacoes']) if (d[c] != null && d[c] !== '') set[c] = String(d[c]);
      if (d.endereco) set.endereco = j.str(d.endereco);
      if (d.consentimentos) set.consentimentos = j.str(Object.assign(j.parse(existe.consentimentos, {}), d.consentimentos));
      const cols = Object.keys(set);
      db.prepare(`UPDATE customers SET ${cols.map(c => `${c}=@${c}`).join(', ')} WHERE id=@id`).run({ ...set, id: existe.id });
      return Customers.obter(existe.id);
    }
    const id = novoId();
    db.prepare(`INSERT INTO customers (id,nome,email,whatsapp,doc,pais,estado,cidade,endereco,observacoes,consentimentos,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, d.nome || '', email, d.whatsapp || '', d.doc || '', d.pais || 'BR', d.estado || '', d.cidade || '',
      j.str(d.endereco || {}), d.observacoes || '', j.str(d.consentimentos || {}), t, t);
    return Customers.obter(id);
  },
  atualizar(id, d) {
    const c = Customers.obter(id); if (!c) return null;
    const set = { updated_at: nowISO() };
    for (const k of ['nome', 'whatsapp', 'doc', 'pais', 'estado', 'cidade', 'observacoes']) if (typeof d[k] === 'string') set[k] = d[k];
    if (d.endereco) set.endereco = j.str(d.endereco);
    if (d.consentimentos) set.consentimentos = j.str(d.consentimentos);
    const cols = Object.keys(set);
    db.prepare(`UPDATE customers SET ${cols.map(x => `${x}=@${x}`).join(', ')} WHERE id=@id`).run({ ...set, id });
    return Customers.obter(id);
  },
  listar(q) {
    if (q && q.trim()) {
      const like = '%' + q.trim().toLowerCase() + '%';
      return db.prepare('SELECT * FROM customers WHERE lower(nome) LIKE ? OR lower(email) LIKE ? OR whatsapp LIKE ? ORDER BY created_at DESC LIMIT 200').all(like, like, like);
    }
    return db.prepare('SELECT * FROM customers ORDER BY created_at DESC LIMIT 200').all();
  },
  comprasDe(customerId) {
    return db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
  },
};

// ============================================================ COUPONS
const Coupons = {
  listar() { return db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all().map(c => ({ ...c, ativo: !!c.ativo, livros_aplicaveis: j.parse(c.livros_aplicaveis, []) })); },
  porCodigo(codigo) { return db.prepare('SELECT * FROM coupons WHERE codigo = ?').get(String(codigo || '').toUpperCase().trim()); },
  criar(d) {
    const id = novoId(), t = nowISO();
    db.prepare(`INSERT INTO coupons (id,codigo,tipo,valor,validade,limite_uso,usos,livros_aplicaveis,ativo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,0,?,?,?,?)`).run(
      id, String(d.codigo || '').toUpperCase().trim(), d.tipo === 'fixo' ? 'fixo' : 'percent', Math.round(Number(d.valor) || 0),
      d.validade || null, Math.round(Number(d.limite_uso) || 0), j.str(d.livros_aplicaveis || []), d.ativo === false ? 0 : 1, t, t);
    return db.prepare('SELECT * FROM coupons WHERE id = ?').get(id);
  },
  atualizar(id, d) {
    const c = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id); if (!c) return null;
    const set = { updated_at: nowISO() };
    if (d.tipo) set.tipo = d.tipo === 'fixo' ? 'fixo' : 'percent';
    if (d.valor !== undefined) set.valor = Math.round(Number(d.valor) || 0);
    if (d.validade !== undefined) set.validade = d.validade || null;
    if (d.limite_uso !== undefined) set.limite_uso = Math.round(Number(d.limite_uso) || 0);
    if (d.livros_aplicaveis !== undefined) set.livros_aplicaveis = j.str(d.livros_aplicaveis || []);
    if (d.ativo !== undefined) set.ativo = d.ativo ? 1 : 0;
    const cols = Object.keys(set);
    db.prepare(`UPDATE coupons SET ${cols.map(x => `${x}=@${x}`).join(', ')} WHERE id=@id`).run({ ...set, id });
    return db.prepare('SELECT * FROM coupons WHERE id = ?').get(id);
  },
  remover(id) { db.prepare('DELETE FROM coupons WHERE id = ?').run(id); },
  // Valida cupom para um conjunto de book_ids e um subtotal (centavos).
  // Retorna { ok, motivo?, desconto, cupom }.
  avaliar(codigo, bookIds, subtotal) {
    const c = Coupons.porCodigo(codigo);
    if (!c || !c.ativo) return { ok: false, motivo: 'Cupom inválido.' };
    if (c.validade && new Date(c.validade + 'T23:59:59') < new Date()) return { ok: false, motivo: 'Cupom expirado.' };
    if (c.limite_uso > 0 && c.usos >= c.limite_uso) return { ok: false, motivo: 'Cupom esgotado.' };
    const aplic = j.parse(c.livros_aplicaveis, []);
    if (aplic.length && !bookIds.some(b => aplic.includes(b))) return { ok: false, motivo: 'Cupom não vale para estes livros.' };
    let desconto = c.tipo === 'percent' ? Math.round(subtotal * c.valor / 100) : Math.min(c.valor, subtotal);
    desconto = Math.max(0, Math.min(desconto, subtotal));
    return { ok: true, desconto, cupom: c };
  },
  consumir(codigo) { db.prepare('UPDATE coupons SET usos = usos + 1, updated_at = ? WHERE codigo = ?').run(nowISO(), String(codigo || '').toUpperCase().trim()); },
};

// ============================================================ ORDERS
const PRECO_COL = { pdf: 'preco_pdf', impresso: 'preco_impresso', combo: 'preco_combo' };
function hidrataOrder(o) {
  if (!o) return null;
  return { ...o, endereco_entrega: j.parse(o.endereco_entrega, {}), origem: j.parse(o.origem, {}) };
}
const Orders = {
  obter(id) {
    const o = hidrataOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
    if (!o) return null;
    o.itens = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    o.cliente = Customers.obter(o.customer_id);
    o.pagamentos = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at').all(id);
    return o;
  },
  listar(filtro) {
    let sql = 'SELECT o.*, c.nome cliente_nome, c.email cliente_email FROM orders o JOIN customers c ON c.id = o.customer_id';
    const w = [], p = [];
    if (filtro && filtro.status) { w.push('o.status = ?'); p.push(filtro.status); }
    if (filtro && filtro.impressao) { w.push('o.impressao_status = ?'); p.push(filtro.impressao); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY o.created_at DESC LIMIT ' + (filtro && filtro.limite ? Number(filtro.limite) : 300);
    return db.prepare(sql).all(...p).map(hidrataOrder);
  },
  // Cria pedido pendente a partir de um carrinho validado. items: [{book_id,tipo,quantidade}].
  // Calcula preços a partir do BANCO (nunca confia no preço do cliente). Aplica cupom.
  //
  // desconto_pacote / rotulo_pacote vêm de `pacotes.js`, já expandidos e deduplicados
  // pela rota de checkout. NÃO acumulam com cupom: se o pedido veio de pacote, o
  // cupom é ignorado, para não empilhar dois descontos sobre a mesma margem.
  criar({ customer, items, cupom, origem, endereco_entrega, desconto_pacote = 0, rotulo_pacote = '' }) {
    return transacao(() => {
      const cli = Customers.upsert(customer);
      const linhas = [];
      let subtotal = 0, temPdf = false, temImpresso = false;
      const bookIds = [];
      for (const it of items) {
        const b = Books.obter(it.book_id);
        if (!b || !b.ativo) throw new Error('Livro indisponível.');
        const tipo = ['pdf', 'impresso', 'combo'].includes(it.tipo) ? it.tipo : 'pdf';
        const preco = b[PRECO_COL[tipo]];
        if (preco == null) throw new Error(`"${b.titulo}" não está disponível na opção ${tipo}.`);
        const qtd = Math.max(1, Math.round(Number(it.quantidade) || 1));
        subtotal += preco * qtd;
        if (tipo === 'pdf' || tipo === 'combo') temPdf = true;
        if (tipo === 'impresso' || tipo === 'combo') temImpresso = true;
        bookIds.push(b.id);
        linhas.push({ book_id: b.id, tipo, titulo_snapshot: b.titulo, preco_unit: preco, quantidade: qtd });
      }
      if (!linhas.length) throw new Error('Carrinho vazio.');
      let desconto = 0, cupomCodigo = '';
      if (desconto_pacote > 0) {
        desconto = Math.min(Math.round(desconto_pacote), subtotal);
        cupomCodigo = ('PACOTE ' + (rotulo_pacote || '')).trim().slice(0, 60);
      } else if (cupom) {
        const av = Coupons.avaliar(cupom, bookIds, subtotal);
        if (av.ok) { desconto = av.desconto; cupomCodigo = av.cupom.codigo; }
      }
      const total = Math.max(0, subtotal - desconto);
      const id = novoId(), t = nowISO();
      db.prepare(`INSERT INTO orders
        (id,customer_id,status,forma_pagamento,valor_bruto,desconto,valor_total,cupom_codigo,tem_pdf,tem_impresso,
         entrega_digital,impressao_status,endereco_entrega,origem,created_at,updated_at)
        VALUES (?,?,'pendente','mercadopago',?,?,?,?,?,?,'pendente',?,?,?,?,?)`).run(
        id, cli.id, subtotal, desconto, total, cupomCodigo, temPdf ? 1 : 0, temImpresso ? 1 : 0,
        temImpresso ? 'aguardando' : 'nenhum', j.str(endereco_entrega || {}), j.str(origem || {}), t, t);
      const insItem = db.prepare(`INSERT INTO order_items (id,order_id,book_id,tipo,titulo_snapshot,preco_unit,quantidade,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      for (const l of linhas) insItem.run(novoId(), id, l.book_id, l.tipo, l.titulo_snapshot, l.preco_unit, l.quantidade, t, t);
      return Orders.obter(id);
    });
  },
  atualizarCampos(id, set) {
    set.updated_at = nowISO();
    const cols = Object.keys(set);
    db.prepare(`UPDATE orders SET ${cols.map(c => `${c}=@${c}`).join(', ')} WHERE id=@id`).run({ ...set, id });
    return Orders.obter(id);
  },
};

// ============================================================ PAYMENTS
const Payments = {
  registrar(orderId, d) {
    const id = novoId(), t = nowISO();
    db.prepare(`INSERT INTO payments (id,order_id,provider,provider_ref,provider_payment_id,status,valor,metodo,raw,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, orderId, d.provider || 'mercadopago', d.provider_ref || '', d.provider_payment_id || '',
      d.status || 'pendente', d.valor || 0, d.metodo || '', j.str(d.raw || {}), t, t);
    return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  },
  atualizarPorOrder(orderId, set) {
    set.updated_at = nowISO();
    const cols = Object.keys(set);
    db.prepare(`UPDATE payments SET ${cols.map(c => `${c}=@${c}`).join(', ')} WHERE order_id=@order_id`).run({ ...set, order_id: orderId });
  },
};

// ====================================================== DOWNLOAD TOKENS
const Tokens = {
  // Gera token para o PDF ativo do livro. exp em horas, max downloads.
  gerar(orderId, bookId, { horas = 72, max = 5 } = {}) {
    const file = Files.ativo(bookId);
    const id = novoToken(), t = nowISO();
    const exp = new Date(Date.now() + horas * 3600 * 1000).toISOString();
    db.prepare(`INSERT INTO download_tokens (id,order_id,book_id,book_file_id,expires_at,max_downloads,download_count,ativo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,0,1,?,?)`).run(id, orderId, bookId, file ? file.id : null, exp, max, t, t);
    return Tokens.obter(id);
  },
  obter(id) { return db.prepare('SELECT * FROM download_tokens WHERE id = ?').get(id); },
  daOrder(orderId) { return db.prepare('SELECT * FROM download_tokens WHERE order_id = ? ORDER BY created_at DESC').all(orderId); },
  // Valida sem consumir. Retorna { ok, motivo?, token, file }.
  validar(id) {
    const tk = Tokens.obter(id);
    if (!tk) return { ok: false, motivo: 'inexistente' };
    if (!tk.ativo) return { ok: false, motivo: 'bloqueado', token: tk };
    if (new Date(tk.expires_at) < new Date()) return { ok: false, motivo: 'expirado', token: tk };
    if (tk.max_downloads > 0 && tk.download_count >= tk.max_downloads) return { ok: false, motivo: 'limite', token: tk };
    const file = tk.book_file_id ? Files.obter(tk.book_file_id) : Files.ativo(tk.book_id);
    if (!file) return { ok: false, motivo: 'sem_arquivo', token: tk };
    return { ok: true, token: tk, file };
  },
  consumir(id) { db.prepare('UPDATE download_tokens SET download_count = download_count + 1, updated_at = ? WHERE id = ?').run(nowISO(), id); },
  bloquear(id, ativo) { db.prepare('UPDATE download_tokens SET ativo = ?, updated_at = ? WHERE id = ?').run(ativo ? 1 : 0, nowISO(), id); },
  bloquearOrder(orderId, ativo) { db.prepare('UPDATE download_tokens SET ativo = ?, updated_at = ? WHERE order_id = ?').run(ativo ? 1 : 0, nowISO(), orderId); },
  logar(tokenId, orderId, bookId, { ip, ua, resultado }) {
    db.prepare('INSERT INTO download_logs (id,token_id,order_id,book_id,ip,user_agent,resultado,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(novoId(), tokenId, orderId || null, bookId || null, ip || '', ua || '', resultado || 'ok', nowISO());
  },
  logsDaOrder(orderId) { return db.prepare('SELECT * FROM download_logs WHERE order_id = ? ORDER BY created_at DESC').all(orderId); },
  logs(limite = 200) { return db.prepare('SELECT * FROM download_logs ORDER BY created_at DESC LIMIT ?').all(limite); },
};

// ============================================================ PRINT JOBS
const Print = {
  criar(orderId, bookId) {
    const id = novoId(), t = nowISO();
    db.prepare(`INSERT INTO print_jobs (id,order_id,book_id,status,created_at,updated_at)
      VALUES (?,?,?,'aguardando_producao',?,?)`).run(id, orderId, bookId, t, t);
    return Print.obter(id);
  },
  obter(id) { return db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(id); },
  daOrder(orderId) { return db.prepare('SELECT * FROM print_jobs WHERE order_id = ?').all(orderId); },
  listar(status) {
    if (status) return db.prepare('SELECT * FROM print_jobs WHERE status = ? ORDER BY created_at DESC').all(status);
    return db.prepare(`SELECT * FROM print_jobs WHERE status != 'entregue' AND status != 'cancelado' ORDER BY created_at DESC`).all();
  },
  atualizar(id, d) {
    const pj = Print.obter(id); if (!pj) return null;
    const set = { updated_at: nowISO() };
    for (const k of ['status', 'fornecedor', 'rastreio', 'previsao', 'observacoes']) if (d[k] != null) set[k] = String(d[k]);
    for (const k of ['custo_impressao', 'custo_frete']) if (d[k] !== undefined) set[k] = Math.round(Number(d[k]) || 0);
    // margem = (parte do pedido) - custos; simplificação: informado ou custo negativo
    const cols = Object.keys(set);
    db.prepare(`UPDATE print_jobs SET ${cols.map(c => `${c}=@${c}`).join(', ')} WHERE id=@id`).run({ ...set, id });
    return Print.obter(id);
  },
};

// =================================================== WEBHOOK EVENTS (idempotência)
const Webhooks = {
  // Registra evento; retorna { novo:true } se inseriu, { novo:false } se já existia.
  registrar(provider, eventId, tipo, payload) {
    const id = novoId(), t = nowISO();
    try {
      db.prepare('INSERT INTO webhook_events (id,provider,event_id,tipo,payload,processed,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)')
        .run(id, provider, String(eventId), tipo || '', j.str(payload || {}), t, t);
      return { novo: true, id };
    } catch (e) {
      // UNIQUE(provider,event_id) violado = duplicado
      const ex = db.prepare('SELECT id FROM webhook_events WHERE provider = ? AND event_id = ?').get(provider, String(eventId));
      return { novo: false, id: ex ? ex.id : null };
    }
  },
  marcar(id, resultado) { db.prepare('UPDATE webhook_events SET processed = 1, resultado = ?, updated_at = ? WHERE id = ?').run(resultado || 'ok', nowISO(), id); },
  listar(limite = 100) { return db.prepare('SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT ?').all(limite); },
};

// ============================================================ AUDIT
const Audit = {
  log(user, acao, { entidade, entidade_id, detalhe, ip } = {}) {
    db.prepare('INSERT INTO audit_logs (id,staff_id,staff_nome,acao,entidade,entidade_id,detalhe,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(novoId(), (user && user.id) || '', (user && user.nome) || 'sistema', acao, entidade || '', entidade_id || '', detalhe || '', ip || '', nowISO());
  },
  listar(limite = 200) { return db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limite); },
};

// ============================================================ NOTIFICATIONS
const Notif = {
  log(tipo, { destino, assunto, order_id, status, erro } = {}) {
    db.prepare('INSERT INTO notification_logs (id,tipo,destino,assunto,order_id,status,erro,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(novoId(), tipo, destino || '', assunto || '', order_id || null, status || 'enviado', erro || '', nowISO());
  },
  listar(limite = 100) { return db.prepare('SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT ?').all(limite); },
};

// ============================================================ DASHBOARD / RELATÓRIOS
function intervalo(desde, ate) {
  const w = [], p = [];
  if (desde) { w.push("created_at >= ?"); p.push(desde); }
  if (ate) { w.push("created_at <= ?"); p.push(ate); }
  return { clause: w.length ? ' AND ' + w.join(' AND ') : '', params: p };
}
const Relatorios = {
  // Visão geral do dashboard (opcional intervalo).
  resumo(desde, ate) {
    const { clause, params } = intervalo(desde, ate);
    const pagos = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(valor_total),0) receita FROM orders WHERE status='pago'${clause}`).get(...params);
    const pendentes = db.prepare(`SELECT COUNT(*) n FROM orders WHERE status='pendente'${clause}`).get(...params);
    const reembolsados = db.prepare(`SELECT COUNT(*) n FROM orders WHERE status='reembolsado'${clause}`).get(...params);
    const downloads = db.prepare(`SELECT COUNT(*) n FROM download_logs WHERE resultado='ok'${clause}`).get(...params);
    const impressosPend = db.prepare(`SELECT COUNT(*) n FROM print_jobs WHERE status NOT IN ('entregue','cancelado')`).get();
    const ticket = pagos.n ? Math.round(pagos.receita / pagos.n) : 0;
    return {
      pedidos_pagos: pagos.n, receita: pagos.receita, receita_fmt: brl(pagos.receita),
      ticket_medio: ticket, ticket_medio_fmt: brl(ticket),
      pedidos_pendentes: pendentes.n, reembolsos: reembolsados.n,
      downloads: downloads.n, impressos_pendentes: impressosPend.n,
    };
  },
  maisVendidos(desde, ate, limite = 10) {
    const { clause, params } = intervalo(desde, ate);
    return db.prepare(`
      SELECT b.id, b.titulo, COUNT(oi.id) itens, COALESCE(SUM(oi.preco_unit*oi.quantidade),0) receita
      FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN books b ON b.id = oi.book_id
      WHERE o.status='pago'${clause.replace(/created_at/g, 'o.created_at')}
      GROUP BY b.id ORDER BY itens DESC LIMIT ?`).all(...params, limite)
      .map(r => ({ ...r, receita_fmt: brl(r.receita) }));
  },
  cuponsUsados(desde, ate) {
    const { clause, params } = intervalo(desde, ate);
    return db.prepare(`SELECT cupom_codigo codigo, COUNT(*) usos, COALESCE(SUM(desconto),0) desconto
      FROM orders WHERE status='pago' AND cupom_codigo != ''${clause} GROUP BY cupom_codigo ORDER BY usos DESC`).all(...params)
      .map(r => ({ ...r, desconto_fmt: brl(r.desconto) }));
  },
  // Conversão por livro: visitas não são rastreadas no MVP → aproxima por pedidos criados vs pagos.
  conversaoPorLivro(desde, ate) {
    const { clause, params } = intervalo(desde, ate);
    return db.prepare(`
      SELECT b.id, b.titulo,
        SUM(CASE WHEN o.status='pago' THEN 1 ELSE 0 END) pagos,
        COUNT(DISTINCT o.id) pedidos
      FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN books b ON b.id = oi.book_id
      WHERE 1=1 ${clause.replace(/created_at/g, 'o.created_at')}
      GROUP BY b.id ORDER BY pagos DESC`).all(...params)
      .map(r => ({ ...r, conversao: r.pedidos ? Math.round(100 * r.pagos / r.pedidos) : 0 }));
  },
  // Pedidos problemáticos: pagos com download bloqueado, ou impresso parado, ou download com erro.
  problematicos() {
    return db.prepare(`
      SELECT o.id, c.nome cliente, o.status, o.entrega_digital, o.impressao_status, o.valor_total, o.created_at
      FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE (o.status='pago' AND o.tem_pdf=1 AND o.entrega_digital='bloqueado')
         OR (o.status='pago' AND o.tem_impresso=1 AND o.impressao_status='aguardando' AND o.created_at < ?)
         OR o.status='reembolsado'
      ORDER BY o.created_at DESC LIMIT 50`).all(new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString())
      .map(hidrataOrder);
  },
};

module.exports = {
  Books, Files, Assets, Customers, Coupons, Orders, Payments, Tokens, Print, Webhooks, Audit, Notif, Relatorios,
  PAPEIS_LIVRARIA, permissoesLivraria, papelLivrariaDe, reais, brl, slugify,
};
