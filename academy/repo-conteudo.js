// =====================================================================
// Villela Academy — domínio de CONTEÚDO (FASE 2): produtos, módulos,
// aulas, materiais, arquivos privados, matrículas e progresso.
// Identidade/papéis vivem em repo.js. Conteúdo é unificado: todo tipo de
// produto usa módulos→aulas→materiais (e-book = produto com 1 aula pdf).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, transacao, nowISO, novoId, j, MOD_DIR } = require('./db');
const { Usuarios } = require('./repo');
const storage = require('./storage'); // F7: driver local|s3, URLs assinadas

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

const ARQUIVOS_DIR = storage.ARQUIVOS_DIR; // privado; NUNCA servido estático

const TIPOS_PRODUTO = ['curso', 'ebook', 'pdf', 'audio', 'pacote', 'mentoria', 'clube'];
const TIPOS_AULA = ['video', 'texto', 'pdf', 'audio', 'arquivo', 'link'];
// o slug é a chave (URL, banco, filtro) e NÃO muda; CAT_ROT é só o rótulo de tela, com acento
const CATEGORIAS = ['negocios', 'marketing', 'vendas', 'tecnologia', 'inteligencia-artificial',
  'direito', 'gestao-documental', 'aluguel-temporada', 'hospedagem', 'gastronomia', 'eventos',
  'construcao', 'financas', 'produtividade', 'desenvolvimento-pessoal'];
const CAT_ROT = {
  negocios: 'Negócios', marketing: 'Marketing', vendas: 'Vendas', tecnologia: 'Tecnologia',
  'inteligencia-artificial': 'Inteligência Artificial', direito: 'Direito',
  'gestao-documental': 'Gestão Documental', 'aluguel-temporada': 'Aluguel por Temporada',
  hospedagem: 'Hospedagem', gastronomia: 'Gastronomia', eventos: 'Eventos',
  construcao: 'Construção', financas: 'Finanças', produtividade: 'Produtividade',
  'desenvolvimento-pessoal': 'Desenvolvimento Pessoal',
};
// A tabela `categories` é a fonte da verdade (migração categorias-tabela-2026-08-11
// semeia as 15 do sistema). CATEGORIAS/CAT_ROT ficam como semente e fallback.
const catRotulo = (c) => {
  const r = db.prepare('SELECT rotulo FROM categories WHERE slug = ?').get(String(c || ''));
  return r ? r.rotulo : (CAT_ROT[c] || String(c || '').replace(/-/g, ' '));
};

const Categorias = {
  listar() { return db.prepare('SELECT * FROM categories ORDER BY ordem, rotulo').all(); },
  existe(slug) { return !!db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(String(slug || '')); },
  rotulo: catRotulo,

  // Filtro público: as do sistema sempre; as criadas por produtor só depois de
  // terem produto PUBLICADO. Categoria criada e nunca usada não polui a vitrine,
  // e como publicar exige aprovação da plataforma, nenhuma categoria nova estreia
  // no site sem um humano ter passado por ela — sem precisar de fila própria.
  // `n` = quantos produtos publicados a categoria tem (o filtro do marketplace
  // mostra o número, e categoria de produtor sem produto continua escondida).
  visiveis() {
    return db.prepare(`SELECT c.*, (
        SELECT COUNT(*) FROM products p WHERE p.status = 'publicado'
          AND (p.categoria = c.slug OR EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.slug = c.slug))
      ) AS n FROM categories c
      WHERE c.origem = 'sistema' OR (
        SELECT COUNT(*) FROM products p WHERE p.status = 'publicado'
          AND (p.categoria = c.slug OR EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.slug = c.slug))
      ) > 0
      ORDER BY c.ordem, c.rotulo`).all();
  },

  // Visão do staff: toda categoria + quantos produtos a usam (por status), para
  // o admin saber o que quebra antes de renomear ou remover.
  listarAdmin() {
    return db.prepare(`SELECT c.*,
        (SELECT COUNT(*) FROM products p WHERE p.categoria = c.slug) AS produtos,
        (SELECT COUNT(*) FROM products p WHERE p.categoria = c.slug AND p.status = 'publicado') AS publicados,
        (SELECT u.nome FROM users u WHERE u.id = c.criado_por) AS criador_nome
      FROM categories c ORDER BY c.origem DESC, c.ordem, c.rotulo`).all();
  },

  // Renomear é a ferramenta para nome infeliz: muda só o RÓTULO, nunca o slug —
  // então links, filtros e produtos já classificados continuam valendo.
  renomear(slug, rotulo) {
    const c = db.prepare('SELECT * FROM categories WHERE slug = ?').get(String(slug || ''));
    if (!c) throw new Error('Categoria não encontrada.');
    const nome = s(rotulo, 40).replace(/\s+/g, ' ');
    if (nome.length < 3) throw new Error('O nome precisa de pelo menos 3 letras.');
    db.prepare('UPDATE categories SET rotulo = ? WHERE slug = ?').run(nome, c.slug);
    return db.prepare('SELECT * FROM categories WHERE slug = ?').get(c.slug);
  },

  // Remover só o que é de produtor e não está em uso: apagar categoria com
  // produto dentro deixaria o produto apontando para o nada, em silêncio.
  // Nome ruim EM USO se conserta renomeando, que não quebra link nenhum.
  remover(slug) {
    const c = db.prepare('SELECT * FROM categories WHERE slug = ?').get(String(slug || ''));
    if (!c) throw new Error('Categoria não encontrada.');
    if (c.origem === 'sistema') throw new Error('Categoria do sistema não pode ser removida — renomeie se o rótulo não serve.');
    const n = db.prepare('SELECT COUNT(*) n FROM products WHERE categoria = ?').get(c.slug).n;
    if (n) throw new Error(`${n} produto(s) ainda usam esta categoria. Renomeie, ou mude a categoria deles antes de remover.`);
    db.prepare('DELETE FROM categories WHERE slug = ?').run(c.slug);
    return { removida: c.slug };
  },

  // Cria a categoria do produtor. Nome equivalente NÃO duplica: "Marketing",
  // "marketing" e "MARKETING " caem no mesmo slug e reaproveitam a que existe.
  criar(rotulo, userId) {
    const nome = s(rotulo, 40).replace(/\s+/g, ' ');
    if (nome.length < 3) throw new Error('O nome da categoria precisa de pelo menos 3 letras.');
    const slug = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slug) throw new Error('Dê à categoria um nome com letras ou números.');
    const ja = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
    if (ja) return ja; // já existe (do sistema ou de alguém): reusa em vez de clonar
    const n = db.prepare("SELECT COUNT(*) n FROM categories WHERE origem = 'produtor' AND criado_por = ?").get(s(userId, 40)).n;
    if (n >= 10) throw new Error('Você já criou 10 categorias. Reaproveite uma delas.');
    db.prepare('INSERT INTO categories (slug, rotulo, origem, criado_por, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(slug, nome, 'produtor', s(userId, 40), 500, nowISO());
    return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  },
};

// upload: 10 MB (o body JSON global aguenta 15 MB em base64); vídeo = URL externa até a F7
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const MIMES_PERMITIDOS = {
  'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
  'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/ogg': '.ogg', 'audio/wav': '.wav',
  'application/zip': '.zip',
};

// fluxo editorial: quem pode levar de onde para onde
const STATUS_PRODUTO = ['rascunho', 'em_revisao', 'aprovado', 'rejeitado', 'publicado', 'pausado', 'suspenso', 'removido'];
const TRANSICOES = {
  produtor: { rascunho: ['em_revisao'], rejeitado: ['em_revisao'], aprovado: ['publicado'], publicado: ['pausado'], pausado: ['publicado'] },
  admin: { em_revisao: ['aprovado', 'rejeitado'], aprovado: ['suspenso', 'removido'], rejeitado: ['removido'], publicado: ['suspenso', 'removido'], pausado: ['suspenso', 'removido'], suspenso: ['aprovado', 'removido'] },
};

function slugDe(texto, tabela) {
  const base = s(texto, 80).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'produto';
  let slug = base, i = 1;
  while (db.prepare(`SELECT 1 FROM ${tabela} WHERE slug = ?`).get(slug)) slug = `${base}-${++i}`;
  return slug;
}
function normProduto(p) { return p ? { ...p, tags: j.parse(p.tags, []), config: j.parse(p.config, {}) } : null; }

const Produtos = {
  obter(id) {
    const p = normProduto(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
    return p ? { ...p, categorias: this.categoriasDe(p.id, p.categoria) } : null;
  },
  // todas as categorias do produto, a principal primeiro
  categoriasDe(id, principal) {
    const rows = db.prepare('SELECT slug, principal FROM product_categories WHERE product_id = ? ORDER BY principal DESC, slug').all(id);
    const fora = rows.map(r => r.slug);
    if (principal && !fora.includes(principal)) fora.unshift(principal);  // produto salvo antes da migração
    return fora;
  },
  // grava o conjunto (a 1ª vira a principal). Ignora slug que não existe.
  gravarCategorias(id, lista) {
    const validas = [...new Set((lista || []).map(x => s(x, 40)).filter(x => x && Categorias.existe(x)))];
    db.prepare('DELETE FROM product_categories WHERE product_id = ?').run(id);
    validas.forEach((slug, i) => db.prepare('INSERT OR REPLACE INTO product_categories (product_id, slug, principal) VALUES (?, ?, ?)').run(id, slug, i === 0 ? 1 : 0));
    db.prepare('UPDATE products SET categoria = ? WHERE id = ?').run(validas[0] || '', id);
    return validas;
  },
  doProdutor(producerId) {
    return db.prepare("SELECT * FROM products WHERE producer_id = ? AND status != 'removido' ORDER BY criado_em DESC").all(producerId).map(normProduto);
  },
  // dono OU admin/staff; senão erro (anti-IDOR)
  obterDoDono(id, producerId) {
    const p = this.obter(id);
    if (!p || p.producer_id !== producerId) throw new Error('Produto não encontrado.');
    return p;
  },

  criar(producerId, d = {}) {
    const titulo = s(d.titulo, 160);
    if (!titulo) throw new Error('Informe o título.');
    const tipo = TIPOS_PRODUTO.includes(d.tipo) ? d.tipo : 'curso';
    const id = novoId();
    db.prepare(`INSERT INTO products (id, producer_id, tipo, titulo, subtitulo, slug, categoria, descricao_curta,
      descricao_longa, preco_centavos, garantia_dias, status, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?)`)
      .run(id, producerId, tipo, titulo, s(d.subtitulo, 200), slugDe(titulo, 'products'),
        Categorias.existe(d.categoria) ? d.categoria : '', s(d.descricao_curta, 300),
        s(d.descricao_longa, 10000), Math.max(0, parseInt(d.preco_centavos, 10) || 0),
        Math.max(0, parseInt(d.garantia_dias, 10) || 7), nowISO());
    this.gravarCategorias(id, Array.isArray(d.categorias) && d.categorias.length ? d.categorias : [d.categoria]);
    return this.obter(id);
  },

  editar(id, producerId, d = {}) {
    const p = this.obterDoDono(id, producerId);
    // `categorias` (lista) manda; `categoria` sozinha continua valendo, como antes
    if (Array.isArray(d.categorias)) { this.gravarCategorias(id, d.categorias); d = { ...d, categoria: this.obter(id).categoria }; }
    else if (d.categoria != null) this.gravarCategorias(id, [d.categoria]);
    if (['suspenso', 'removido'].includes(p.status)) throw new Error('Produto suspenso/removido não pode ser editado.');
    const num = (v, atual) => (v == null ? atual : Math.max(0, parseInt(v, 10) || 0));
    db.prepare(`UPDATE products SET titulo = ?, subtitulo = ?, categoria = ?, descricao_curta = ?, descricao_longa = ?,
      preco_centavos = ?, preco_promo_centavos = ?, garantia_dias = ?, capa_media_id = ?, tags = ?, atualizado_em = ? WHERE id = ?`)
      .run(d.titulo != null ? (s(d.titulo, 160) || p.titulo) : p.titulo,
        d.subtitulo != null ? s(d.subtitulo, 200) : p.subtitulo,
        d.categoria != null ? (Categorias.existe(d.categoria) ? d.categoria : '') : p.categoria,
        d.descricao_curta != null ? s(d.descricao_curta, 300) : p.descricao_curta,
        d.descricao_longa != null ? s(d.descricao_longa, 10000) : p.descricao_longa,
        num(d.preco_centavos, p.preco_centavos), num(d.preco_promo_centavos, p.preco_promo_centavos),
        num(d.garantia_dias, p.garantia_dias),
        d.capa_media_id != null ? s(d.capa_media_id, 40) : p.capa_media_id,
        d.tags != null ? j.str((Array.isArray(d.tags) ? d.tags : []).slice(0, 12).map(t => s(t, 40))) : j.str(p.tags),
        nowISO(), id);
    // % de afiliado do produto (F5): '' → NULL (usa padrão global); 0 desliga a comissão
    if ('afiliado_pct' in d) {
      const v = d.afiliado_pct === '' || d.afiliado_pct == null ? null : Math.max(0, Math.min(90, parseInt(d.afiliado_pct, 10) || 0));
      db.prepare('UPDATE products SET afiliado_pct = ? WHERE id = ?').run(v, id);
    }
    return this.obter(id);
  },

  // transição editorial validada por papel (produtor|admin)
  transicionar(id, novoStatus, { comoPapel, producerId, motivo } = {}) {
    const p = comoPapel === 'produtor' ? this.obterDoDono(id, producerId) : this.obter(id);
    if (!p) throw new Error('Produto não encontrado.');
    const permitidas = (TRANSICOES[comoPapel] || {})[p.status] || [];
    if (!permitidas.includes(novoStatus)) throw new Error(`Transição ${p.status} → ${novoStatus} não permitida para ${comoPapel}.`);
    if (novoStatus === 'em_revisao' && p.tipo !== 'clube' && !db.prepare('SELECT 1 FROM lessons WHERE product_id = ? LIMIT 1').get(id)) {
      throw new Error('Adicione pelo menos uma aula/conteúdo antes de enviar para revisão.');
    }
    if (novoStatus === 'em_revisao' && p.tipo === 'clube') {
      if (!(p.preco_promo_centavos || p.preco_centavos)) throw new Error('Clube precisa de mensalidade (preço > 0).');
      const temItem = db.prepare('SELECT 1 FROM club_items WHERE club_product_id = ? LIMIT 1').get(id);
      const temAula = db.prepare('SELECT 1 FROM lessons WHERE product_id = ? LIMIT 1').get(id);
      if (!temItem && !temAula) throw new Error('Inclua produtos no clube ou adicione conteúdo próprio antes de enviar para revisão.');
    }
    db.prepare('UPDATE products SET status = ?, motivo_status = ?, atualizado_em = ? WHERE id = ?')
      .run(novoStatus, s(motivo, 500), nowISO(), id);
    return this.obter(id);
  },

  emRevisao() {
    return db.prepare(`SELECT p.*, u.nome AS produtor_nome, u.email AS produtor_email FROM products p
      JOIN users u ON u.id = p.producer_id WHERE p.status = 'em_revisao' ORDER BY p.atualizado_em`).all().map(normProduto);
  },
  listarAdmin({ status, n } = {}) {
    let sql = 'SELECT p.*, u.nome AS produtor_nome FROM products p JOIN users u ON u.id = p.producer_id';
    const args = [];
    if (status) { sql += ' WHERE p.status = ?'; args.push(status); }
    sql += ' ORDER BY p.atualizado_em DESC, p.criado_em DESC LIMIT ?'; args.push(Math.min(parseInt(n, 10) || 200, 1000));
    return db.prepare(sql).all(...args).map(normProduto);
  },

  // estrutura completa (módulos → aulas), p/ builder do produtor e área do aluno
  estrutura(productId) {
    const modulos = db.prepare('SELECT * FROM course_modules WHERE product_id = ? ORDER BY ordem, criado_em').all(productId);
    const aulas = db.prepare('SELECT * FROM lessons WHERE product_id = ? ORDER BY ordem, criado_em').all(productId);
    // mime/tamanho vêm junto: a lista de materiais do aluno mostra o tipo e o peso do
    // arquivo, e sem eles a tela só teria o nome (LEFT JOIN: material órfão não some).
    const materiais = db.prepare(`SELECT m.*, f.mime, f.tamanho FROM lesson_materials m
      JOIN lessons l ON l.id = m.lesson_id LEFT JOIN media_files f ON f.id = m.media_id
      WHERE l.product_id = ?`).all(productId);
    return modulos.map(m => ({
      ...m,
      aulas: aulas.filter(a => a.module_id === m.id).map(a => ({ ...a, materiais: materiais.filter(x => x.lesson_id === a.id) })),
    }));
  },
};

const Conteudo = {
  addModulo(productId, titulo) {
    const t = s(titulo, 160); if (!t) throw new Error('Informe o título do módulo.');
    const id = novoId();
    const ordem = (db.prepare('SELECT COALESCE(MAX(ordem),0) o FROM course_modules WHERE product_id = ?').get(productId).o) + 1;
    db.prepare('INSERT INTO course_modules (id, product_id, titulo, ordem, criado_em) VALUES (?, ?, ?, ?, ?)').run(id, productId, t, ordem, nowISO());
    return id;
  },
  moduloDoProduto(moduleId, productId) {
    const m = db.prepare('SELECT * FROM course_modules WHERE id = ? AND product_id = ?').get(moduleId, productId);
    if (!m) throw new Error('Módulo não encontrado.');
    return m;
  },
  editarModulo(moduleId, productId, { titulo, ordem }) {
    const m = this.moduloDoProduto(moduleId, productId);
    db.prepare('UPDATE course_modules SET titulo = ?, ordem = ? WHERE id = ?')
      .run(titulo != null ? (s(titulo, 160) || m.titulo) : m.titulo, ordem != null ? (parseInt(ordem, 10) || m.ordem) : m.ordem, moduleId);
  },
  removerModulo(moduleId, productId) { this.moduloDoProduto(moduleId, productId); db.prepare('DELETE FROM course_modules WHERE id = ?').run(moduleId); },

  addAula(productId, moduleId, d = {}) {
    this.moduloDoProduto(moduleId, productId);
    const titulo = s(d.titulo, 160); if (!titulo) throw new Error('Informe o título da aula.');
    const tipo = TIPOS_AULA.includes(d.tipo) ? d.tipo : 'texto';
    if (d.media_id && !db.prepare('SELECT 1 FROM media_files WHERE id = ?').get(String(d.media_id))) throw new Error('Arquivo não encontrado.');
    const id = novoId();
    const ordem = (db.prepare('SELECT COALESCE(MAX(ordem),0) o FROM lessons WHERE module_id = ?').get(moduleId).o) + 1;
    db.prepare(`INSERT INTO lessons (id, module_id, product_id, titulo, tipo, conteudo, media_id, url_externa,
      duracao_seg, gratuita, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, moduleId, productId, titulo, tipo, s(d.conteudo, 40000), s(d.media_id, 40), s(d.url_externa, 500),
        Math.max(0, parseInt(d.duracao_seg, 10) || 0), d.gratuita ? 1 : 0, ordem, nowISO());
    this.formatoAula(id, d);
    return id;
  },
  aulaDoProduto(lessonId, productId) {
    const a = db.prepare('SELECT * FROM lessons WHERE id = ? AND product_id = ?').get(lessonId, productId);
    if (!a) throw new Error('Aula não encontrada.');
    return a;
  },
  editarAula(lessonId, productId, d = {}) {
    const a = this.aulaDoProduto(lessonId, productId);
    if (d.media_id && !db.prepare('SELECT 1 FROM media_files WHERE id = ?').get(String(d.media_id))) throw new Error('Arquivo não encontrado.');
    db.prepare(`UPDATE lessons SET titulo = ?, tipo = ?, conteudo = ?, media_id = ?, url_externa = ?, duracao_seg = ?,
      gratuita = ?, ordem = ?, atualizado_em = ? WHERE id = ?`)
      .run(d.titulo != null ? (s(d.titulo, 160) || a.titulo) : a.titulo,
        d.tipo != null && TIPOS_AULA.includes(d.tipo) ? d.tipo : a.tipo,
        d.conteudo != null ? s(d.conteudo, 40000) : a.conteudo,
        d.media_id != null ? s(d.media_id, 40) : a.media_id,
        d.url_externa != null ? s(d.url_externa, 500) : a.url_externa,
        d.duracao_seg != null ? Math.max(0, parseInt(d.duracao_seg, 10) || 0) : a.duracao_seg,
        d.gratuita != null ? (d.gratuita ? 1 : 0) : a.gratuita,
        d.ordem != null ? (parseInt(d.ordem, 10) || a.ordem) : a.ordem, nowISO(), lessonId);
    this.formatoAula(lessonId, d);
  },
  // formato do ecossistema (express | faca-comigo | live) e passos do "Faça comigo" — já validados na entrada
  formatoAula(lessonId, d = {}) {
    if (d.formato != null) db.prepare('UPDATE lessons SET formato = ? WHERE id = ?').run(s(d.formato, 20), lessonId);
    if (d.passos != null) db.prepare('UPDATE lessons SET passos = ? WHERE id = ?').run(typeof d.passos === 'string' ? d.passos : JSON.stringify(d.passos), lessonId);
  },
  removerAula(lessonId, productId) { this.aulaDoProduto(lessonId, productId); db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId); },

  addMaterial(lessonId, productId, { nome, media_id }) {
    this.aulaDoProduto(lessonId, productId);
    if (!db.prepare('SELECT 1 FROM media_files WHERE id = ?').get(String(media_id || ''))) throw new Error('Arquivo não encontrado.');
    const id = novoId();
    db.prepare('INSERT INTO lesson_materials (id, lesson_id, nome, media_id, criado_em) VALUES (?, ?, ?, ?, ?)')
      .run(id, lessonId, s(nome, 160) || 'Material', String(media_id), nowISO());
    return id;
  },
  removerMaterial(materialId, productId) {
    const m = db.prepare('SELECT m.* FROM lesson_materials m JOIN lessons l ON l.id = m.lesson_id WHERE m.id = ? AND l.product_id = ?').get(materialId, productId);
    if (!m) throw new Error('Material não encontrado.');
    db.prepare('DELETE FROM lesson_materials WHERE id = ?').run(materialId);
  },
};

// vídeo só via upload-grande (direto ao bucket, F7); nunca por base64
const MIMES_VIDEO = { 'video/mp4': '.mp4', 'video/webm': '.webm' };
const UPLOAD_GRANDE_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (vai direto ao S3)

const Midia = {
  async salvar(ownerUserId, { nome, mime, conteudo_base64 }) {
    mime = s(mime, 100).toLowerCase();
    if (MIMES_VIDEO[mime]) throw new Error('Vídeo: use o upload de vídeo (direto ao storage) ou URL externa.');
    if (!MIMES_PERMITIDOS[mime]) throw new Error('Tipo de arquivo não permitido (aceitos: PDF, imagem, áudio, ZIP).');
    const buffer = Buffer.from(String(conteudo_base64 || ''), 'base64');
    if (!buffer.length) throw new Error('Arquivo vazio.');
    if (buffer.length > UPLOAD_MAX_BYTES) throw new Error('Arquivo acima de 10 MB.');
    const id = novoId();
    const rel = id + MIMES_PERMITIDOS[mime];
    const onde = await storage.salvar(rel, buffer, mime);
    db.prepare('INSERT INTO media_files (id, owner_user_id, nome, mime, tamanho, sha256, file_path, storage, confirmado, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)')
      .run(id, ownerUserId, s(nome, 200) || rel, mime, buffer.length,
        crypto.createHash('sha256').update(buffer).digest('hex'), rel, onde, nowISO());
    return { id, tamanho: buffer.length };
  },

  // F7: upload GRANDE (vídeo) direto ao bucket — o arquivo não passa pelo servidor.
  // 1) iniciar → presigned PUT; 2) cliente sobe; 3) confirmar → HEAD no bucket.
  iniciarUploadGrande(ownerUserId, { nome, mime, tamanho }) {
    if (!storage.s3Ativo()) throw new Error('Upload de vídeo exige o storage externo (S3/R2) configurado — use URL externa (YouTube não listado/Vimeo) por enquanto.');
    mime = s(mime, 100).toLowerCase();
    const ext = MIMES_VIDEO[mime] || MIMES_PERMITIDOS[mime];
    if (!ext) throw new Error('Tipo de arquivo não permitido no upload grande (vídeo mp4/webm, PDF, imagem, áudio, ZIP).');
    tamanho = parseInt(tamanho, 10) || 0;
    if (!tamanho || tamanho > UPLOAD_GRANDE_MAX_BYTES) throw new Error('Tamanho inválido (máx. 2 GB).');
    const id = novoId();
    const rel = id + ext;
    db.prepare("INSERT INTO media_files (id, owner_user_id, nome, mime, tamanho, file_path, storage, confirmado, criado_em) VALUES (?, ?, ?, ?, ?, ?, 's3', 0, ?)")
      .run(id, ownerUserId, s(nome, 200) || rel, mime, tamanho, rel, nowISO());
    return { id, upload_url: storage.presignS3(storage.s3cfg(), 'PUT', rel, 3600), expira_seg: 3600 };
  },
  async confirmarUploadGrande(id, ownerUserId) {
    // obterMesmoPendente, NUNCA obter: o registro nasce confirmado=0 e obter() filtra
    // confirmado=1 — usá-lo aqui fazia toda confirmação de vídeo morrer em "Upload não
    // encontrado", com o arquivo já no bucket. Quem confirma é justamente o pendente.
    const m = this.obterMesmoPendente(id);
    if (!m || m.owner_user_id !== ownerUserId) throw new Error('Upload não encontrado.');
    if (m.confirmado) return m;
    const obj = await storage.s3Existe(m.file_path);
    if (!obj) throw new Error('Arquivo ainda não chegou ao storage — envie e confirme de novo.');
    db.prepare('UPDATE media_files SET confirmado = 1, tamanho = ? WHERE id = ?').run(obj.tamanho || m.tamanho, id);
    return this.obter(id);
  },

  obter(id) { return db.prepare('SELECT * FROM media_files WHERE id = ? AND confirmado = 1').get(id) || null; },
  obterMesmoPendente(id) { return db.prepare('SELECT * FROM media_files WHERE id = ?').get(id) || null; },
  caminhoAbsoluto(m) { return storage.caminhoLocal(m.file_path); },
  // URL temporária assinada (local: HMAC próprio; s3: presigned do bucket)
  urlTemporaria(m, uid, segundos) { return storage.urlDeLeitura(m, uid, segundos); },

  // controle de acesso do arquivo: dono, admin, matriculado ativo no produto
  // que o referencia, ou aula gratuita (degustação, exige login)
  podeAcessar(mediaId, usuario) {
    if (!usuario) return false;
    const m = this.obter(mediaId);
    if (!m) return false;
    if (m.owner_user_id === usuario.id || (usuario.papeis || []).includes('admin')) return true;
    const refs = db.prepare(`
      SELECT l.product_id, l.gratuita FROM lessons l WHERE l.media_id = ?
      UNION SELECT l.product_id, l.gratuita FROM lesson_materials x JOIN lessons l ON l.id = x.lesson_id WHERE x.media_id = ?
      UNION SELECT p.id AS product_id, 0 AS gratuita FROM products p WHERE p.capa_media_id = ?`).all(mediaId, mediaId, mediaId);
    for (const r of refs) {
      if (r.gratuita) return true; // degustação
      if (temAcesso(usuario.id, r.product_id)) return true; // matrícula ou assinatura (clube)
    }
    return false;
  },
  logAcesso(userId, mediaId, ip) {
    db.prepare('INSERT INTO download_logs (quando, user_id, media_id, ip) VALUES (?, ?, ?, ?)').run(nowISO(), s(userId, 40), s(mediaId, 40), s(ip, 60));
  },
};

// acesso efetivo (F6): CORTESIA total (flag do usuário → libera TUDO, inclusive
// produtos futuros) OU matrícula ativa OU assinatura ativa do clube OU
// assinatura ativa de um clube que inclui o produto
function temAcesso(userId, productId) {
  const u = db.prepare('SELECT cortesia FROM users WHERE id = ?').get(userId);
  if (u && u.cortesia === 1) return true; // acesso de cortesia vitalício a todo o catálogo
  if (Matriculas.ativa(userId, productId)) return true;
  if (db.prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND product_id = ? AND status = 'ativa'").get(userId, productId)) return true;
  return !!db.prepare(`SELECT 1 FROM subscriptions s JOIN club_items ci ON ci.club_product_id = s.product_id
    WHERE s.user_id = ? AND s.status = 'ativa' AND ci.product_id = ?`).get(userId, productId);
}

// AUDIOBOOK do curso: capítulos em áudio para ouvir no player do site.
// De propósito o áudio NÃO entra em Midia.podeAcessar: a rota genérica
// /api/media/:id não o entrega. O único caminho é Audiobook.link (aluno com
// acesso, ou capítulo de amostra), que emite URL assinada curta — o arquivo
// só "vive" dentro do player. Identidade do capítulo = (produto, ordem).
const MIMES_AUDIO = ['audio/mpeg', 'audio/mp4', 'audio/ogg'];
const Audiobook = {
  faixas(productId) {
    return db.prepare(`SELECT f.id, f.ordem, f.titulo, f.duracao_seg, f.amostra, f.media_id, m.tamanho, m.mime
      FROM audiobook_faixas f JOIN media_files m ON m.id = f.media_id AND m.confirmado = 1
      WHERE f.product_id = ? ORDER BY f.ordem`).all(productId);
  },
  // o que o aluno vê: título de todos (vitrine), mas só o capítulo liberado é tocável
  paraAluno(productId, userId) {
    const acesso = temAcesso(userId, productId);
    return this.faixas(productId).map(f => ({
      id: f.id, ordem: f.ordem, titulo: f.titulo, duracao_seg: f.duracao_seg,
      amostra: f.amostra ? 1 : 0, liberada: acesso || !!f.amostra,
    }));
  },
  // grava/atualiza o capítulo N. Só toca no que veio: reenviar só o título não
  // troca o áudio, e reenviar o áudio não apaga a amostra.
  definir(productId, producerId, d = {}) {
    const ordem = parseInt(d.ordem, 10);
    if (!(ordem >= 1 && ordem <= 999)) throw new Error('Informe a "ordem" do capítulo (1 a 999).');
    const ja = db.prepare('SELECT * FROM audiobook_faixas WHERE product_id = ? AND ordem = ?').get(productId, ordem);
    let mediaId = ja ? ja.media_id : '';
    if (d.media_id != null) {
      const m = Midia.obter(s(d.media_id, 40));
      if (!m || m.owner_user_id !== producerId) throw new Error('O áudio não é uma mídia confirmada deste produtor.');
      if (!MIMES_AUDIO.includes(m.mime)) throw new Error('O capítulo precisa ser áudio (MP3, M4A ou OGG).');
      mediaId = m.id;
    }
    if (!mediaId) throw new Error('Capítulo novo precisa do áudio ("media_id").');
    const titulo = d.titulo != null ? s(d.titulo, 160) : (ja ? ja.titulo : '');
    if (!titulo) throw new Error('Capítulo sem título.');
    const duracao = d.duracao_seg != null ? Math.max(0, parseInt(d.duracao_seg, 10) || 0) : (ja ? ja.duracao_seg : 0);
    const amostra = d.amostra != null ? (d.amostra ? 1 : 0) : (ja ? ja.amostra : 0);
    if (ja) {
      db.prepare('UPDATE audiobook_faixas SET titulo = ?, media_id = ?, duracao_seg = ?, amostra = ? WHERE id = ?')
        .run(titulo, mediaId, duracao, amostra, ja.id);
      return ja.id;
    }
    const id = novoId();
    db.prepare('INSERT INTO audiobook_faixas (id, product_id, ordem, titulo, media_id, duracao_seg, amostra, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, productId, ordem, titulo, mediaId, duracao, amostra, nowISO());
    return id;
  },
  remover(productId, ordem) {
    return db.prepare('DELETE FROM audiobook_faixas WHERE product_id = ? AND ordem = ?').run(productId, parseInt(ordem, 10) || 0).changes;
  },
  // URL assinada do capítulo — só para quem pode ouvir. 30 min cobre o capítulo
  // mais longo com folga; se vencer numa pausa, o player pede outra sozinho.
  link(faixaId, usuario) {
    const f = db.prepare('SELECT * FROM audiobook_faixas WHERE id = ?').get(s(faixaId, 40));
    if (!f || !usuario) return null;
    const p = Produtos.obter(f.product_id);
    if (!p || ['suspenso', 'removido'].includes(p.status)) return null;
    const dono = p.producer_id === usuario.id || (usuario.papeis || []).includes('admin');
    if (!dono && !f.amostra && !temAcesso(usuario.id, f.product_id)) return null;
    const m = Midia.obter(f.media_id);
    if (!m) return null;
    return { faixa: f, media: m, ...Midia.urlTemporaria(m, usuario.id, 1800) };
  },
};

// itens do clube (sempre produtos do MESMO produtor)
const Clube = {
  itens(clubProductId) {
    return db.prepare(`SELECT ci.product_id, p.titulo, p.tipo, p.slug, p.status FROM club_items ci
      JOIN products p ON p.id = ci.product_id WHERE ci.club_product_id = ? ORDER BY ci.criado_em`).all(clubProductId);
  },
  addItem(clube, productId) {
    if (clube.tipo !== 'clube') throw new Error('Este produto não é um clube.');
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(String(productId || ''));
    if (!p || p.producer_id !== clube.producer_id) throw new Error('Só produtos seus podem entrar no clube.');
    if (p.id === clube.id || p.tipo === 'clube') throw new Error('Um clube não pode conter outro clube.');
    db.prepare('INSERT OR IGNORE INTO club_items (club_product_id, product_id, criado_em) VALUES (?, ?, ?)')
      .run(clube.id, p.id, nowISO());
  },
  removerItem(clubeId, productId) {
    db.prepare('DELETE FROM club_items WHERE club_product_id = ? AND product_id = ?').run(clubeId, String(productId || ''));
  },
};

const Matriculas = {
  ativa(userId, productId) {
    return !!db.prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND product_id = ? AND status = 'ativa'").get(userId, productId);
  },
  criar(productId, email, criadoPor, origem = 'cortesia') {
    const u = Usuarios.porEmail(email);
    if (!u || u.status !== 'ativo') throw new Error('Nenhum aluno ativo com este e-mail (a pessoa precisa criar a conta primeiro).');
    const ja = db.prepare('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?').get(u.id, productId);
    if (ja) {
      if (ja.status === 'ativa') throw new Error('Este aluno já está matriculado.');
      db.prepare("UPDATE enrollments SET status = 'ativa', origem = ?, criado_por = ? WHERE id = ?").run(origem, s(criadoPor, 80), ja.id);
      return ja.id;
    }
    const id = novoId();
    db.prepare('INSERT INTO enrollments (id, user_id, product_id, origem, status, criado_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, u.id, productId, origem, 'ativa', nowISO(), s(criadoPor, 80));
    return id;
  },
  revogar(enrollmentId, productId) {
    const e = db.prepare('SELECT * FROM enrollments WHERE id = ? AND product_id = ?').get(enrollmentId, productId);
    if (!e) throw new Error('Matrícula não encontrada.');
    db.prepare("UPDATE enrollments SET status = 'revogada' WHERE id = ?").run(enrollmentId);
  },
  doProduto(productId) {
    return db.prepare(`SELECT e.*, u.nome, u.email FROM enrollments e JOIN users u ON u.id = e.user_id
      WHERE e.product_id = ? ORDER BY e.criado_em DESC`).all(productId);
  },
  doAluno(userId) {
    return db.prepare(`SELECT e.*, p.titulo, p.tipo, p.slug, p.capa_media_id, p.status AS product_status
      FROM enrollments e JOIN products p ON p.id = e.product_id
      WHERE e.user_id = ? AND e.status = 'ativa' AND p.status NOT IN ('suspenso','removido')
      ORDER BY e.criado_em DESC`).all(userId);
  },

  // A biblioteca precisa mostrar o acesso REAL, não só as linhas de matrícula.
  // Quem tem cortesia total (users.cortesia = 1) passa em temAcesso() para todo
  // o catálogo, mas não tem enrollment nenhum — via a biblioteca vazia e não
  // tinha por onde entrar no curso, mesmo com o checkout dizendo "você já tem
  // acesso". Aqui as duas visões voltam a bater.
  doAlunoComAcesso(userId) {
    const matriculas = this.doAluno(userId);
    const u = db.prepare('SELECT cortesia FROM users WHERE id = ?').get(userId);
    if (!u || u.cortesia !== 1) return matriculas;
    const ja = new Set(matriculas.map(e => e.product_id));
    const extras = db.prepare(`SELECT id AS product_id, titulo, tipo, slug, capa_media_id, status AS product_status
      FROM products WHERE status = 'publicado' ORDER BY criado_em DESC`).all()
      .filter(p => !ja.has(p.product_id))
      .map(p => ({ ...p, id: '', user_id: userId, status: 'ativa', origem: 'cortesia', criado_em: '' }));
    return matriculas.concat(extras);
  },
};

// ---- ACESSO DE CORTESIA / BETA (acesso vitalício a TUDO, sem pagamento,
// revogável). Marketplace B2C: NÃO há tenant — o acesso é por PRODUTO, via a
// mesma primitiva de Matriculas.criar (origem 'cortesia'). Um usuário é "de
// cortesia" quando tem ao menos uma matrícula origem 'cortesia' (rastreável
// sem nova tabela). "Tudo" = produtos publicados + itens de clubes publicados
// (cobre itens exclusivos de clube que não aparecem na vitrine).
const Cortesia = {
  // acha o usuário por e-mail (case-insensitive) ou cria (papel 'aluno').
  // conta nova nasce com senha aleatória — a pessoa define a própria pelo
  // link de definir-senha (reaproveita o fluxo de reset já existente).
  acharOuCriarUsuario({ nome, email }) {
    const emailN = s(email, 120).toLowerCase();
    if (!emailN || !emailN.includes('@')) throw new Error('Informe um e-mail válido.');
    let u = Usuarios.porEmail(emailN);
    if (u) {
      if (u.status !== 'ativo') u = Usuarios.mudarStatus(u.id, 'ativo'); // reativa p/ poder matricular
      return { usuario: u, novo: false, senha_temporaria: null };
    }
    const senha = 'Cx' + crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
    u = Usuarios.criar({ nome: s(nome, 120) || emailN, email: emailN, senha });
    return { usuario: u, novo: true, senha_temporaria: senha };
  },

  // conjunto de produtos que compõem "tudo"
  idsDeTudo() {
    const set = new Set(db.prepare("SELECT id FROM products WHERE status = 'publicado'").all().map(r => r.id));
    db.prepare(`SELECT ci.product_id FROM club_items ci JOIN products c ON c.id = ci.club_product_id
      WHERE c.status = 'publicado'`).all().forEach(r => set.add(r.product_id));
    return [...set];
  },

  // garante matrícula cortesia idempotente num produto (não toca compra/assinatura)
  garantirMatricula(usuario, productId, criadoPor) {
    const ja = db.prepare('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?').get(usuario.id, productId);
    if (ja && ja.status === 'ativa') return { novo: false, origem: ja.origem };
    Matriculas.criar(productId, usuario.email, criadoPor, 'cortesia'); // reativa revogada OU cria nova
    return { novo: !ja, origem: 'cortesia' };
  },

  contarLiberados(userId) {
    return db.prepare("SELECT COUNT(*) n FROM enrollments WHERE user_id = ? AND origem = 'cortesia' AND status = 'ativa'").get(userId).n;
  },
  // é/foi de cortesia: flag do usuário OU histórico de matrícula cortesia
  ehCortesia(userId) {
    const u = db.prepare('SELECT cortesia FROM users WHERE id = ?').get(userId);
    if (u && u.cortesia === 1) return true;
    return !!db.prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND origem = 'cortesia' LIMIT 1").get(userId);
  },

  // concede acesso vitalício a TUDO a partir de {nome,email}: liga o FLAG
  // (acesso total, cobre catálogo vazio e produtos futuros) E matricula nos
  // publicados atuais (p/ aparecerem em "meus cursos"). Idempotente.
  concederTotal({ nome, email }, criadoPor = 'staff') {
    return transacao(() => {
      const { usuario, novo, senha_temporaria } = this.acharOuCriarUsuario({ nome, email });
      db.prepare('UPDATE users SET cortesia = 1, atualizado_em = ? WHERE id = ?').run(nowISO(), usuario.id);
      let novos = 0;
      for (const pid of this.idsDeTudo()) {
        const r = this.garantirMatricula(usuario, pid, criadoPor);
        if (r.origem === 'cortesia' && r.novo) novos++;
      }
      return { usuario, novo, senha_temporaria, cortesia_total: true, novos, produtos_liberados: this.contarLiberados(usuario.id) };
    });
  },

  // corta o acesso: desliga o flag E inativa as matrículas de cortesia
  // (compra/assinatura ficam intactas)
  revogarTotal(userId) {
    const u = Usuarios.porId(userId); if (!u) throw new Error('Usuário não encontrado.');
    if (!this.ehCortesia(userId)) throw new Error('Este usuário não tem acesso de cortesia.');
    db.prepare('UPDATE users SET cortesia = 0, atualizado_em = ? WHERE id = ?').run(nowISO(), userId);
    const r = db.prepare("UPDATE enrollments SET status = 'revogada' WHERE user_id = ? AND origem = 'cortesia' AND status = 'ativa'").run(userId);
    return { revogadas: r.changes };
  },

  // volta a conceder: religa o flag, reativa o que estava revogado e cobre
  // novos produtos (funciona mesmo se a revogação zerou as matrículas)
  reativarTotal(userId, criadoPor = 'staff') {
    const u = Usuarios.porId(userId); if (!u) throw new Error('Usuário não encontrado.');
    return this.concederTotal({ nome: u.nome, email: u.email }, criadoPor);
  },

  // painel staff: cortesia ativa (flag=1) + histórico revogado (já teve matrícula
  // cortesia). Aparece mesmo com 0 produtos liberados.
  listar() {
    return db.prepare(`
      SELECT u.id, u.nome, u.email, u.criado_em, u.cortesia,
        (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id AND e.origem = 'cortesia' AND e.status = 'ativa') AS produtos_liberados
      FROM users u
      WHERE u.cortesia = 1
         OR EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id AND e.origem = 'cortesia')
      ORDER BY u.criado_em DESC LIMIT 500`).all()
      .map(r => ({ id: r.id, nome: r.nome, email: r.email, criado_em: r.criado_em,
        produtos_liberados: r.produtos_liberados, ativo: r.cortesia === 1,
        status: r.cortesia === 1 ? 'ativo' : 'revogado' }));
  },
};

const Progresso = {
  marcar(userId, lessonId, { concluida, posicao_seg } = {}) {
    const aula = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);
    if (!aula) throw new Error('Aula não encontrada.');
    if (!aula.gratuita && !temAcesso(userId, aula.product_id)) throw new Error('Você não tem acesso a este produto.');
    db.prepare(`INSERT INTO student_progress (user_id, lesson_id, product_id, concluida, posicao_seg, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET
      concluida = excluded.concluida, posicao_seg = excluded.posicao_seg, atualizado_em = excluded.atualizado_em`)
      .run(userId, lessonId, aula.product_id, concluida ? 1 : 0, Math.max(0, parseInt(posicao_seg, 10) || 0), nowISO());
    return this.doProduto(userId, aula.product_id);
  },
  doProduto(userId, productId) {
    const total = db.prepare('SELECT COUNT(*) n FROM lessons WHERE product_id = ?').get(productId).n;
    const feitas = db.prepare('SELECT COUNT(*) n FROM student_progress WHERE user_id = ? AND product_id = ? AND concluida = 1').get(userId, productId).n;
    return { total_aulas: total, concluidas: feitas, pct: total ? Math.round(100 * feitas / total) : 0 };
  },
  porAula(userId, productId) {
    const rows = db.prepare('SELECT lesson_id, concluida, posicao_seg FROM student_progress WHERE user_id = ? AND product_id = ?').all(userId, productId);
    const map = {}; rows.forEach(r => { map[r.lesson_id] = { concluida: !!r.concluida, posicao_seg: r.posicao_seg }; });
    return map;
  },
  continuar(userId) { // última aula tocada (continuar de onde parou)
    return db.prepare(`SELECT sp.lesson_id, sp.product_id, sp.atualizado_em, l.titulo AS aula_titulo,
      p.titulo AS produto_titulo, p.capa_media_id
      FROM student_progress sp JOIN lessons l ON l.id = sp.lesson_id JOIN products p ON p.id = sp.product_id
      WHERE sp.user_id = ? ORDER BY sp.atualizado_em DESC LIMIT 1`).get(userId) || null;
  },
};

// ================= FASE 3 — marketplace público, página de venda, avaliações, denúncias =================

// anexa as áreas de cada produto da lista numa consulta só (o cartão mostra até
// duas). Sem isso o card exibia só a principal, mesmo em produto multi-área.
function comCategorias(rows) {
  if (!rows.length) return rows;
  const ids = rows.map(r => r.id);
  const pares = db.prepare(`SELECT product_id, slug FROM product_categories
    WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY principal DESC, slug`).all(...ids);
  const porProduto = new Map();
  pares.forEach(x => porProduto.set(x.product_id, [...(porProduto.get(x.product_id) || []), x.slug]));
  return rows.map(r => {
    const cats = porProduto.get(r.id) || [];
    if (r.categoria && !cats.includes(r.categoria)) cats.unshift(r.categoria);
    return { ...r, categorias: cats };
  });
}

// vitrine: SÓ produtos publicados; nunca vaza rascunho/suspenso
const Marketplace = {
  listar({ q, categoria, n } = {}) {
    let rows = db.prepare(`SELECT p.id, p.tipo, p.titulo, p.subtitulo, p.slug, p.categoria, p.descricao_curta,
      p.capa_media_id, p.preco_centavos, p.preco_promo_centavos, pr.nome_publico AS produtor_nome, pr.slug AS produtor_slug
      FROM products p JOIN producer_profiles pr ON pr.user_id = p.producer_id
      WHERE p.status = 'publicado' ORDER BY p.atualizado_em DESC LIMIT ?`).all(Math.min(parseInt(n, 10) || 60, 200));
    if (categoria) {
      const naCat = new Set(db.prepare('SELECT product_id FROM product_categories WHERE slug = ?').all(categoria).map(r => r.product_id));
      rows = rows.filter(r => r.categoria === categoria || naCat.has(r.id));
    }
    if (q) {
      const t = s(q, 80).toLowerCase();
      rows = rows.filter(r => (r.titulo + ' ' + r.subtitulo + ' ' + r.descricao_curta).toLowerCase().includes(t));
    }
    return comCategorias(rows);
  },
  porSlug(slug) {
    const p = db.prepare(`SELECT p.*, pr.nome_publico AS produtor_nome, pr.slug AS produtor_slug, pr.bio AS produtor_bio
      FROM products p JOIN producer_profiles pr ON pr.user_id = p.producer_id
      WHERE p.slug = ? AND p.status = 'publicado'`).get(String(slug || ''));
    const n = normProduto(p);
    return n ? { ...n, categorias: Produtos.categoriasDe(n.id, n.categoria) } : null;
  },
  produtorPorSlug(slug) {
    const pr = db.prepare(`SELECT pr.user_id, pr.nome_publico, pr.slug, pr.bio, pr.site
      FROM producer_profiles pr WHERE pr.slug = ? AND pr.status = 'aprovado'`).get(String(slug || ''));
    if (!pr) return null;
    pr.produtos = db.prepare(`SELECT id, tipo, titulo, subtitulo, slug, categoria, descricao_curta, capa_media_id,
      preco_centavos, preco_promo_centavos FROM products WHERE producer_id = ? AND status = 'publicado' ORDER BY atualizado_em DESC`).all(pr.user_id);
    return pr;
  },
  // aulas de degustação p/ mostrar na vitrine (só títulos + contagem)
  // Recomendação de próximos cursos. Pontua o catálogo publicado contra o "gosto"
  // do aluno (categorias, tags e produtores do que ele já tem) e devolve os melhores.
  // `excluir` são os produtos que ele JÁ tem — recomendar o que já foi comprado é o
  // erro clássico dessas vitrines. Sem afinidade nenhuma, cai no catálogo recente
  // (melhor mostrar algo bom do que uma prateleira vazia).
  recomendados({ excluir = [], categorias = [], tags = [], produtores = [], n = 6 } = {}) {
    const fora = new Set((excluir || []).filter(Boolean));
    const cat = new Set((categorias || []).filter(Boolean));
    const pro = new Set((produtores || []).filter(Boolean));
    const tg = new Set((tags || []).map(x => String(x || '').toLowerCase().trim()).filter(Boolean));
    const rows = db.prepare(`SELECT p.id, p.producer_id, p.tipo, p.titulo, p.subtitulo, p.slug, p.categoria,
      p.descricao_curta, p.tags, p.capa_media_id, p.preco_centavos, p.preco_promo_centavos, p.atualizado_em,
      pr.nome_publico AS produtor_nome, pr.slug AS produtor_slug
      FROM products p JOIN producer_profiles pr ON pr.user_id = p.producer_id
      WHERE p.status = 'publicado' ORDER BY p.atualizado_em DESC LIMIT 200`).all();
    return comCategorias(rows.filter(r => !fora.has(r.id)).map(r => {
      const minhas = j.parse(r.tags, []).map(x => String(x || '').toLowerCase().trim());
      const emComum = minhas.filter(x => tg.has(x));
      const score = (cat.has(r.categoria) ? 4 : 0) + Math.min(emComum.length, 3) * 2 + (pro.has(r.producer_id) ? 3 : 0);
      const motivo = cat.has(r.categoria) ? `Mesma área: ${catRotulo(r.categoria)}`
        : (pro.has(r.producer_id) ? `Do mesmo autor: ${r.produtor_nome}`
          : (emComum.length ? `Também sobre ${emComum[0]}` : 'Em destaque na Academy'));
      return { ...r, tags: minhas, score, motivo };
    })).sort((a, b) => b.score - a.score || String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')))
      .slice(0, Math.min(parseInt(n, 10) || 6, 24));
  },

  // o "gosto" de um aluno a partir do que ele já tem acesso (matrícula ou clube)
  perfilDoAluno(userId) {
    const rows = db.prepare(`SELECT DISTINCT p.id, p.producer_id, p.categoria, p.tags FROM products p
      WHERE p.id IN (SELECT product_id FROM enrollments WHERE user_id = ? AND status = 'ativa')`).all(userId);
    return {
      ids: rows.map(r => r.id),
      categorias: [...new Set(rows.map(r => r.categoria).filter(Boolean))],
      produtores: [...new Set(rows.map(r => r.producer_id))],
      tags: [...new Set(rows.flatMap(r => j.parse(r.tags, []).map(x => String(x || '').toLowerCase().trim())))].filter(Boolean),
    };
  },

  // vitrine do conteúdo: a página de venda mostra tipo, duração e quantos
  // materiais cada aula tem — sem isso o currículo é só uma lista de títulos.
  resumoConteudo(productId) {
    const modulos = db.prepare('SELECT id, titulo FROM course_modules WHERE product_id = ? ORDER BY ordem, criado_em').all(productId);
    const aulas = db.prepare('SELECT id, module_id, titulo, tipo, duracao_seg, gratuita FROM lessons WHERE product_id = ? ORDER BY ordem, criado_em').all(productId);
    const mats = db.prepare(`SELECT m.lesson_id, COUNT(*) n FROM lesson_materials m
      JOIN lessons l ON l.id = m.lesson_id WHERE l.product_id = ? GROUP BY m.lesson_id`).all(productId);
    const porAula = new Map(mats.map(x => [x.lesson_id, x.n]));
    const nAula = (a) => ({
      titulo: a.titulo, tipo: a.tipo, duracao_seg: a.duracao_seg || 0,
      gratuita: !!a.gratuita, materiais: porAula.get(a.id) || 0,
    });
    return {
      total_aulas: aulas.length,
      total_videos: aulas.filter(a => a.tipo === 'video').length,
      total_seg: aulas.reduce((n, a) => n + (a.duracao_seg || 0), 0),
      total_materiais: mats.reduce((n, x) => n + x.n, 0),
      modulos: modulos.map(m => ({
        titulo: m.titulo,
        aulas: aulas.filter(a => a.module_id === m.id).map(nAula),
        duracao_seg: aulas.filter(a => a.module_id === m.id).reduce((n, a) => n + (a.duracao_seg || 0), 0),
      })),
    };
  },
};

const SalesPages = {
  obter(productId) {
    const r = db.prepare('SELECT secoes FROM sales_pages WHERE product_id = ?').get(productId);
    return r ? j.parse(r.secoes, {}) : {};
  },
  salvar(productId, secoes = {}) {
    const lista = (v, max) => (Array.isArray(v) ? v : []).slice(0, max);
    const limpo = {
      headline: s(secoes.headline, 200), subheadline: s(secoes.subheadline, 300),
      video_url: s(secoes.video_url, 300), promessa: s(secoes.promessa, 1000),
      beneficios: lista(secoes.beneficios, 12).map(x => s(x, 200)).filter(Boolean),
      para_quem: lista(secoes.para_quem, 10).map(x => s(x, 200)).filter(Boolean),
      aprender: lista(secoes.aprender, 15).map(x => s(x, 200)).filter(Boolean),
      bonus: lista(secoes.bonus, 8).map(x => s(x, 200)).filter(Boolean),
      depoimentos: lista(secoes.depoimentos, 10).map(x => ({ nome: s(x && x.nome, 80), texto: s(x && x.texto, 500) })).filter(x => x.texto),
      faq: lista(secoes.faq, 12).map(x => ({ p: s(x && x.p, 200), r: s(x && x.r, 800) })).filter(x => x.p && x.r),
      garantia_texto: s(secoes.garantia_texto, 500),
    };
    db.prepare(`INSERT INTO sales_pages (product_id, secoes, atualizado_em) VALUES (?, ?, ?)
      ON CONFLICT(product_id) DO UPDATE SET secoes = excluded.secoes, atualizado_em = excluded.atualizado_em`)
      .run(productId, j.str(limpo), nowISO());
    return limpo;
  },
};

const Reviews = {
  avaliar(productId, userId, { nota, texto }) {
    nota = parseInt(nota, 10);
    if (!(nota >= 1 && nota <= 5)) throw new Error('Nota de 1 a 5.');
    if (!temAcesso(userId, productId)) throw new Error('Só quem tem acesso (matrícula ou assinatura) avalia.');
    db.prepare(`INSERT INTO reviews (id, product_id, user_id, nota, texto, status, criado_em) VALUES (?, ?, ?, ?, ?, 'publicada', ?)
      ON CONFLICT(product_id, user_id) DO UPDATE SET nota = excluded.nota, texto = excluded.texto, criado_em = excluded.criado_em`)
      .run(novoId(), productId, userId, nota, s(texto, 1000), nowISO());
  },
  publicas(productId) {
    return db.prepare(`SELECT r.nota, r.texto, r.criado_em, u.nome FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.product_id = ? AND r.status = 'publicada' ORDER BY r.criado_em DESC LIMIT 30`).all(productId);
  },
  media(productId) {
    const r = db.prepare("SELECT AVG(nota) m, COUNT(*) n FROM reviews WHERE product_id = ? AND status = 'publicada'").get(productId);
    return { media: r.m ? Math.round(r.m * 10) / 10 : null, total: r.n };
  },
  moderar(reviewId, status) {
    if (!['publicada', 'oculta'].includes(status)) throw new Error('Status inválido.');
    const r = db.prepare('SELECT 1 FROM reviews WHERE id = ?').get(reviewId);
    if (!r) throw new Error('Avaliação não encontrada.');
    db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, reviewId);
  },
  listarAdmin(n) {
    return db.prepare(`SELECT r.*, u.nome, p.titulo AS produto_titulo FROM reviews r
      JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id
      ORDER BY r.criado_em DESC LIMIT ?`).all(Math.min(parseInt(n, 10) || 100, 500));
  },
};

const Denuncias = {
  MOTIVOS: ['direitos-autorais', 'enganoso', 'ilegal', 'adulto', 'outro'],
  criar(productId, userId, { motivo, texto }) {
    if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(productId)) throw new Error('Produto não encontrado.');
    const id = novoId();
    db.prepare('INSERT INTO moderation_reports (id, product_id, user_id, motivo, texto, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, productId, s(userId, 40), this.MOTIVOS.includes(motivo) ? motivo : 'outro', s(texto, 2000), nowISO());
    return id;
  },
  abertas() {
    return db.prepare(`SELECT r.*, p.titulo AS produto_titulo, p.status AS produto_status FROM moderation_reports r
      JOIN products p ON p.id = r.product_id WHERE r.status = 'aberta' ORDER BY r.criado_em`).all();
  },
  resolver(id, { status, resolucao }) {
    if (!['resolvida', 'descartada'].includes(status)) throw new Error('Status inválido.');
    const r = db.prepare('SELECT 1 FROM moderation_reports WHERE id = ?').get(id);
    if (!r) throw new Error('Denúncia não encontrada.');
    db.prepare('UPDATE moderation_reports SET status = ?, resolucao = ?, resolvido_em = ? WHERE id = ?')
      .run(status, s(resolucao, 500), nowISO(), id);
  },
};

module.exports = {
  TIPOS_PRODUTO, TIPOS_AULA, CATEGORIAS, CAT_ROT, catRotulo, Categorias, STATUS_PRODUTO, TRANSICOES, UPLOAD_MAX_BYTES,
  Produtos, Conteudo, Midia, Matriculas, Cortesia, Progresso, ARQUIVOS_DIR,
  Marketplace, SalesPages, Reviews, Denuncias,
  temAcesso, Clube, Audiobook,
};
