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
const CATEGORIAS = ['negocios', 'marketing', 'vendas', 'tecnologia', 'inteligencia-artificial',
  'direito', 'gestao-documental', 'aluguel-temporada', 'hospedagem', 'gastronomia', 'eventos',
  'construcao', 'financas', 'produtividade', 'desenvolvimento-pessoal'];

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
  obter(id) { return normProduto(db.prepare('SELECT * FROM products WHERE id = ?').get(id)); },
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
        CATEGORIAS.includes(d.categoria) ? d.categoria : '', s(d.descricao_curta, 300),
        s(d.descricao_longa, 10000), Math.max(0, parseInt(d.preco_centavos, 10) || 0),
        Math.max(0, parseInt(d.garantia_dias, 10) || 7), nowISO());
    return this.obter(id);
  },

  editar(id, producerId, d = {}) {
    const p = this.obterDoDono(id, producerId);
    if (['suspenso', 'removido'].includes(p.status)) throw new Error('Produto suspenso/removido não pode ser editado.');
    const num = (v, atual) => (v == null ? atual : Math.max(0, parseInt(v, 10) || 0));
    db.prepare(`UPDATE products SET titulo = ?, subtitulo = ?, categoria = ?, descricao_curta = ?, descricao_longa = ?,
      preco_centavos = ?, preco_promo_centavos = ?, garantia_dias = ?, capa_media_id = ?, tags = ?, atualizado_em = ? WHERE id = ?`)
      .run(d.titulo != null ? (s(d.titulo, 160) || p.titulo) : p.titulo,
        d.subtitulo != null ? s(d.subtitulo, 200) : p.subtitulo,
        d.categoria != null ? (CATEGORIAS.includes(d.categoria) ? d.categoria : '') : p.categoria,
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
    const materiais = db.prepare('SELECT m.* FROM lesson_materials m JOIN lessons l ON l.id = m.lesson_id WHERE l.product_id = ?').all(productId);
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
    const m = this.obter(id);
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

// acesso efetivo (F6): matrícula ativa OU assinatura ativa do clube OU
// assinatura ativa de um clube que inclui o produto
function temAcesso(userId, productId) {
  if (Matriculas.ativa(userId, productId)) return true;
  if (db.prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND product_id = ? AND status = 'ativa'").get(userId, productId)) return true;
  return !!db.prepare(`SELECT 1 FROM subscriptions s JOIN club_items ci ON ci.club_product_id = s.product_id
    WHERE s.user_id = ? AND s.status = 'ativa' AND ci.product_id = ?`).get(userId, productId);
}

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
  ehCortesia(userId) {
    return !!db.prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND origem = 'cortesia' LIMIT 1").get(userId);
  },

  // concede acesso vitalício a TUDO a partir de {nome,email}
  concederTotal({ nome, email }, criadoPor = 'staff') {
    return transacao(() => {
      const { usuario, novo, senha_temporaria } = this.acharOuCriarUsuario({ nome, email });
      let novos = 0;
      for (const pid of this.idsDeTudo()) {
        const r = this.garantirMatricula(usuario, pid, criadoPor);
        if (r.origem === 'cortesia' && r.novo) novos++;
      }
      return { usuario, novo, senha_temporaria, novos, produtos_liberados: this.contarLiberados(usuario.id) };
    });
  },

  // corta o acesso: inativa as matrículas de cortesia (compra/assinatura ficam intactas)
  revogarTotal(userId) {
    const u = Usuarios.porId(userId); if (!u) throw new Error('Usuário não encontrado.');
    if (!this.ehCortesia(userId)) throw new Error('Este usuário não tem acesso de cortesia.');
    const r = db.prepare("UPDATE enrollments SET status = 'revogada' WHERE user_id = ? AND origem = 'cortesia' AND status = 'ativa'").run(userId);
    return { revogadas: r.changes };
  },

  // volta a conceder: reativa o que estava revogado e cobre novos produtos
  reativarTotal(userId, criadoPor = 'staff') {
    const u = Usuarios.porId(userId); if (!u) throw new Error('Usuário não encontrado.');
    if (!this.ehCortesia(userId)) throw new Error('Este usuário não tem acesso de cortesia.');
    return this.concederTotal({ nome: u.nome, email: u.email }, criadoPor);
  },

  // lista os usuários de cortesia (ativos ou revogados) para o painel staff
  listar() {
    return db.prepare(`
      SELECT u.id, u.nome, u.email, u.criado_em,
        SUM(CASE WHEN e.status = 'ativa' THEN 1 ELSE 0 END) AS produtos_liberados,
        MAX(CASE WHEN e.status = 'ativa' THEN 1 ELSE 0 END) AS ativo
      FROM enrollments e JOIN users u ON u.id = e.user_id
      WHERE e.origem = 'cortesia'
      GROUP BY u.id, u.nome, u.email, u.criado_em
      ORDER BY u.criado_em DESC LIMIT 500`).all()
      .map(r => ({ id: r.id, nome: r.nome, email: r.email, criado_em: r.criado_em,
        produtos_liberados: r.produtos_liberados, ativo: !!r.ativo }));
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
    return db.prepare(`SELECT sp.lesson_id, sp.product_id, sp.atualizado_em, l.titulo AS aula_titulo, p.titulo AS produto_titulo
      FROM student_progress sp JOIN lessons l ON l.id = sp.lesson_id JOIN products p ON p.id = sp.product_id
      WHERE sp.user_id = ? ORDER BY sp.atualizado_em DESC LIMIT 1`).get(userId) || null;
  },
};

// ================= FASE 3 — marketplace público, página de venda, avaliações, denúncias =================

// vitrine: SÓ produtos publicados; nunca vaza rascunho/suspenso
const Marketplace = {
  listar({ q, categoria, n } = {}) {
    let rows = db.prepare(`SELECT p.id, p.tipo, p.titulo, p.subtitulo, p.slug, p.categoria, p.descricao_curta,
      p.capa_media_id, p.preco_centavos, p.preco_promo_centavos, pr.nome_publico AS produtor_nome, pr.slug AS produtor_slug
      FROM products p JOIN producer_profiles pr ON pr.user_id = p.producer_id
      WHERE p.status = 'publicado' ORDER BY p.atualizado_em DESC LIMIT ?`).all(Math.min(parseInt(n, 10) || 60, 200));
    if (categoria) rows = rows.filter(r => r.categoria === categoria);
    if (q) {
      const t = s(q, 80).toLowerCase();
      rows = rows.filter(r => (r.titulo + ' ' + r.subtitulo + ' ' + r.descricao_curta).toLowerCase().includes(t));
    }
    return rows;
  },
  porSlug(slug) {
    const p = db.prepare(`SELECT p.*, pr.nome_publico AS produtor_nome, pr.slug AS produtor_slug, pr.bio AS produtor_bio
      FROM products p JOIN producer_profiles pr ON pr.user_id = p.producer_id
      WHERE p.slug = ? AND p.status = 'publicado'`).get(String(slug || ''));
    return normProduto(p);
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
  resumoConteudo(productId) {
    const modulos = db.prepare('SELECT id, titulo FROM course_modules WHERE product_id = ? ORDER BY ordem, criado_em').all(productId);
    const aulas = db.prepare('SELECT module_id, titulo, gratuita FROM lessons WHERE product_id = ? ORDER BY ordem, criado_em').all(productId);
    return {
      total_aulas: aulas.length,
      modulos: modulos.map(m => ({ titulo: m.titulo, aulas: aulas.filter(a => a.module_id === m.id).map(a => ({ titulo: a.titulo, gratuita: !!a.gratuita })) })),
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
  TIPOS_PRODUTO, TIPOS_AULA, CATEGORIAS, STATUS_PRODUTO, TRANSICOES, UPLOAD_MAX_BYTES,
  Produtos, Conteudo, Midia, Matriculas, Cortesia, Progresso, ARQUIVOS_DIR,
  Marketplace, SalesPages, Reviews, Denuncias,
  temAcesso, Clube,
};
