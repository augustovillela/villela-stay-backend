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

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

const ARQUIVOS_DIR = path.join(MOD_DIR, 'arquivos'); // privado; NUNCA servido estático
fs.mkdirSync(ARQUIVOS_DIR, { recursive: true });

const TIPOS_PRODUTO = ['curso', 'ebook', 'pdf', 'audio', 'pacote', 'mentoria'];
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
    return this.obter(id);
  },

  // transição editorial validada por papel (produtor|admin)
  transicionar(id, novoStatus, { comoPapel, producerId, motivo } = {}) {
    const p = comoPapel === 'produtor' ? this.obterDoDono(id, producerId) : this.obter(id);
    if (!p) throw new Error('Produto não encontrado.');
    const permitidas = (TRANSICOES[comoPapel] || {})[p.status] || [];
    if (!permitidas.includes(novoStatus)) throw new Error(`Transição ${p.status} → ${novoStatus} não permitida para ${comoPapel}.`);
    if (novoStatus === 'em_revisao' && !db.prepare('SELECT 1 FROM lessons WHERE product_id = ? LIMIT 1').get(id)) {
      throw new Error('Adicione pelo menos uma aula/conteúdo antes de enviar para revisão.');
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

const Midia = {
  salvar(ownerUserId, { nome, mime, conteudo_base64 }) {
    mime = s(mime, 100).toLowerCase();
    if (!MIMES_PERMITIDOS[mime]) throw new Error('Tipo de arquivo não permitido (aceitos: PDF, imagem, áudio, ZIP). Vídeo: use URL externa até a Fase 7.');
    const buffer = Buffer.from(String(conteudo_base64 || ''), 'base64');
    if (!buffer.length) throw new Error('Arquivo vazio.');
    if (buffer.length > UPLOAD_MAX_BYTES) throw new Error('Arquivo acima de 10 MB.');
    const id = novoId();
    const rel = id + MIMES_PERMITIDOS[mime];
    fs.writeFileSync(path.join(ARQUIVOS_DIR, rel), buffer);
    db.prepare('INSERT INTO media_files (id, owner_user_id, nome, mime, tamanho, sha256, file_path, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, ownerUserId, s(nome, 200) || rel, mime, buffer.length,
        crypto.createHash('sha256').update(buffer).digest('hex'), rel, nowISO());
    return { id, tamanho: buffer.length };
  },
  obter(id) { return db.prepare('SELECT * FROM media_files WHERE id = ?').get(id) || null; },
  caminhoAbsoluto(m) { return path.join(ARQUIVOS_DIR, m.file_path); },

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
      if (Matriculas.ativa(usuario.id, r.product_id)) return true;
    }
    return false;
  },
  logAcesso(userId, mediaId, ip) {
    db.prepare('INSERT INTO download_logs (quando, user_id, media_id, ip) VALUES (?, ?, ?, ?)').run(nowISO(), s(userId, 40), s(mediaId, 40), s(ip, 60));
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

const Progresso = {
  marcar(userId, lessonId, { concluida, posicao_seg } = {}) {
    const aula = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);
    if (!aula) throw new Error('Aula não encontrada.');
    if (!aula.gratuita && !Matriculas.ativa(userId, aula.product_id)) throw new Error('Você não está matriculado neste produto.');
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

module.exports = {
  TIPOS_PRODUTO, TIPOS_AULA, CATEGORIAS, STATUS_PRODUTO, TRANSICOES, UPLOAD_MAX_BYTES,
  Produtos, Conteudo, Midia, Matriculas, Progresso, ARQUIVOS_DIR,
};
