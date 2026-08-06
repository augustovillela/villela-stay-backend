// =====================================================================
// Villela Alta Vista 360 — entregas, versões, revisão e materiais (Onda 5).
// As regras que moram aqui:
//   · versão nova nunca apaga a anterior (histórico completo);
//   · comentário é ancorado ({"t":segundos} em vídeo, {"x","y"} em imagem);
//   · aprovação formal é do CLIENTE; quando TODAS as entregas do projeto
//     estão aprovadas e ele está em client_review, vira approved sozinho;
//   · PRÉVIA é sempre permitida (com tarja enquanto saldo > 0);
//     DOWNLOAD FINAL exige entrega aprovada E saldo zero (spec §4.3/§14).
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const storage = require('./storage');
const billing = require('./billing');
const { Projetos, Auditoria, s, n } = repo;

const TIPOS_ENTREGA = ['video', 'foto', 'panorama', 'outro'];

// ---------------------------------------------------------------------
// uploads pendentes (emitidos pelo upload-url; consumidos no confirmar)
// ---------------------------------------------------------------------
const Uploads = {
  criar(mime, contexto) {
    const prep = storage.prepararUpload(mime, n(contexto.tamanho, 0));
    const id = novoId();
    db.prepare('INSERT INTO uploads_pendentes (id, chave, mime, contexto, criado_em) VALUES (?,?,?,?,?)')
      .run(id, prep.chave, s(mime, 60), j.str(contexto), nowISO());
    return {
      upload_id: id, modo: prep.modo, chave: prep.chave,
      url: prep.modo === 's3' ? prep.url : `/alta-vista/upload-local/${id}`,
      metodo: 'PUT', headers: prep.headers || {},
    };
  },
  async consumir(uploadId, contextoEsperado) {
    const up = db.prepare('SELECT * FROM uploads_pendentes WHERE id = ?').get(s(uploadId, 40));
    if (!up) throw new Error('Upload não encontrado ou já consumido — gere um novo.');
    const ctx = j.parse(up.contexto, {});
    for (const [k, v] of Object.entries(contextoEsperado)) {
      if (ctx[k] !== v) throw new Error('Upload não pertence a este destino.');
    }
    const r = await storage.confirmarUpload(up.chave, up.mime);
    db.prepare('DELETE FROM uploads_pendentes WHERE id = ?').run(up.id);
    return { chave: up.chave, mime: r.mime || up.mime, tamanho: r.tamanho };
  },
};

// ---------------------------------------------------------------------
// Entregas e versões
// ---------------------------------------------------------------------
const Entregas = {
  criar(projetoId, { titulo, tipo = 'video' }, { quem = 'staff' } = {}) {
    const p = Projetos.obter(projetoId);
    if (!p) throw new Error('Projeto não encontrado.');
    if (!s(titulo, 160)) throw new Error('Título do entregável é obrigatório.');
    const id = novoId();
    db.prepare('INSERT INTO entregas (id, projeto_id, titulo, tipo, criado_em) VALUES (?,?,?,?,?)')
      .run(id, p.id, s(titulo, 160), TIPOS_ENTREGA.includes(tipo) ? tipo : 'outro', nowISO());
    Auditoria.registrar({ quem, acao: 'entrega.criar', entidade: 'entregas', entidade_id: id, detalhe: s(titulo, 120) });
    return Entregas.obter(id);
  },
  obter(id) {
    const e = db.prepare('SELECT * FROM entregas WHERE id = ?').get(s(id, 40));
    if (!e) return null;
    return { ...e, versoes: Versoes.daEntrega(e.id) };
  },
  doProjeto(projetoId) {
    return db.prepare('SELECT * FROM entregas WHERE projeto_id = ? ORDER BY criado_em').all(s(projetoId, 40))
      .map((e) => ({ ...e, versoes: Versoes.daEntrega(e.id) }));
  },
  // aprovação formal do cliente — e a promoção automática do projeto
  aprovar(clienteId, entregaId, { nome }) {
    const e = db.prepare(`SELECT en.* FROM entregas en JOIN projetos p ON p.id = en.projeto_id
      WHERE en.id = ? AND p.cliente_id = ?`).get(s(entregaId, 40), s(clienteId, 40));
    if (!e) throw new Error('Entrega não encontrada.');
    if (!Versoes.daEntrega(e.id).length) throw new Error('Ainda não há versão para aprovar.');
    if (e.status === 'aprovada') return Entregas.obter(e.id);
    return transacao(() => {
      db.prepare("UPDATE entregas SET status = 'aprovada', aprovada_em = ?, aprovada_por = ? WHERE id = ?")
        .run(nowISO(), s(nome, 160), e.id);
      Auditoria.registrar({ quem: s(nome, 120), acao: 'entrega.aprovar', entidade: 'entregas', entidade_id: e.id, detalhe: e.titulo });
      // todas aprovadas + projeto em client_review → approved (a máquina valida)
      const pendentes = db.prepare("SELECT COUNT(*) c FROM entregas WHERE projeto_id = ? AND status != 'aprovada'").get(e.projeto_id).c;
      const projeto = Projetos.obter(e.projeto_id);
      if (!pendentes && projeto && projeto.status === 'client_review') {
        Projetos.mudarStatus(projeto.id, 'approved', { quem: s(nome, 120), justificativa: 'todas as entregas aprovadas pelo cliente' });
      }
      return Entregas.obter(e.id);
    });
  },
};

const Versoes = {
  daEntrega(entregaId) {
    return db.prepare('SELECT * FROM entrega_versoes WHERE entrega_id = ? ORDER BY numero').all(s(entregaId, 40))
      .map((v) => ({ ...v, comentarios: Comentarios.daVersao(v.id) }));
  },
  obter(id) { return db.prepare('SELECT * FROM entrega_versoes WHERE id = ?').get(s(id, 40)) || null; },
  async criar(entregaId, { upload_id, nota = '', quem = 'staff' }) {
    const e = db.prepare('SELECT * FROM entregas WHERE id = ?').get(s(entregaId, 40));
    if (!e) throw new Error('Entrega não encontrada.');
    const up = await Uploads.consumir(upload_id, { tipo: 'versao', entrega_id: e.id });
    const numero = n((db.prepare('SELECT MAX(numero) m FROM entrega_versoes WHERE entrega_id = ?').get(e.id) || {}).m, 0) + 1;
    const id = novoId();
    transacao(() => {
      db.prepare(`INSERT INTO entrega_versoes (id, entrega_id, numero, chave, mime, tamanho_bytes, nota, autor, criado_em)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(id, e.id, numero, up.chave, up.mime, up.tamanho, s(nota, 500), s(quem, 120), nowISO());
      // versão nova reabre a revisão da entrega
      db.prepare("UPDATE entregas SET status = 'em_revisao', aprovada_em = '', aprovada_por = '' WHERE id = ?").run(e.id);
      Auditoria.registrar({ quem, acao: 'versao.criar', entidade: 'entrega_versoes', entidade_id: id, detalhe: `${e.titulo} v${numero}` });
    });
    return { ...Versoes.obter(id), comentarios: [] };
  },
  // prévia: sempre permitida; tarja de PRÉVIA enquanto houver saldo em aberto
  verPrevia(versaoId) {
    const v = Versoes.obter(versaoId);
    if (!v) throw new Error('Versão não encontrada.');
    const e = db.prepare('SELECT * FROM entregas WHERE id = ?').get(v.entrega_id);
    const previa = billing.saldo(e.projeto_id) > 0;
    return { url: storage.assinarUrl(v.chave, 600), mime: v.mime, previa };
  },
  // download final: aprovada + saldo zero + registro (spec: liberação pelo saldo)
  download(versaoId, { quem = '', ip = '' } = {}) {
    const v = Versoes.obter(versaoId);
    if (!v) throw new Error('Versão não encontrada.');
    const e = db.prepare('SELECT * FROM entregas WHERE id = ?').get(v.entrega_id);
    if (e.status !== 'aprovada') throw new Error('O download final abre depois da sua aprovação formal da entrega.');
    const saldo = billing.saldo(e.projeto_id);
    if (saldo > 0) throw new Error(`O download final libera após a quitação (saldo em aberto: R$ ${(saldo / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`);
    db.prepare('INSERT INTO downloads (id, versao_id, quem, ip, criado_em) VALUES (?,?,?,?,?)')
      .run(novoId(), v.id, s(quem, 160), s(ip, 60), nowISO());
    return { url: storage.assinarUrl(v.chave, 24 * 3600), mime: v.mime };
  },
};

const Comentarios = {
  daVersao(versaoId) {
    return db.prepare('SELECT * FROM comentarios WHERE versao_id = ? ORDER BY criado_em').all(s(versaoId, 40))
      .map((c) => ({ ...c, ancora: j.parse(c.ancora, null) }));
  },
  criar(versaoId, { autor, autor_nome = '', texto, ancora = null }) {
    if (!['cliente', 'equipe'].includes(autor)) throw new Error('Autor inválido.');
    if (!s(texto, 2000)) throw new Error('Comentário vazio.');
    if (!Versoes.obter(versaoId)) throw new Error('Versão não encontrada.');
    const anc = ancora && typeof ancora === 'object'
      ? (ancora.t != null ? { t: Math.max(0, Number(ancora.t) || 0) }
        : (ancora.x != null ? { x: Math.min(100, Math.max(0, Number(ancora.x) || 0)), y: Math.min(100, Math.max(0, Number(ancora.y) || 0)) } : null))
      : null;
    const id = novoId();
    db.prepare('INSERT INTO comentarios (id, versao_id, autor, autor_nome, texto, ancora, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(id, s(versaoId, 40), autor, s(autor_nome, 120), s(texto, 2000), anc ? j.str(anc) : '', nowISO());
    return { ...db.prepare('SELECT * FROM comentarios WHERE id = ?').get(id), ancora: anc };
  },
};

// ---------------------------------------------------------------------
// Materiais do cliente (fotos p/ vídeo IA, panoramas próprios, referências)
// ---------------------------------------------------------------------
const Materiais = {
  doProjeto(projetoId) { return db.prepare('SELECT * FROM materiais WHERE projeto_id = ? ORDER BY criado_em').all(s(projetoId, 40)); },
  async criar(clienteId, projetoId, { upload_id, nome }) {
    const p = db.prepare('SELECT * FROM projetos WHERE id = ? AND cliente_id = ?').get(s(projetoId, 40), s(clienteId, 40));
    if (!p) throw new Error('Projeto não encontrado.');
    const up = await Uploads.consumir(upload_id, { tipo: 'material', projeto_id: p.id });
    const id = novoId();
    db.prepare('INSERT INTO materiais (id, projeto_id, cliente_id, nome, chave, mime, tamanho_bytes, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, p.id, p.cliente_id, s(nome, 200) || 'arquivo', up.chave, up.mime, up.tamanho, nowISO());
    return db.prepare('SELECT * FROM materiais WHERE id = ?').get(id);
  },
  ver(materialId) {
    const m = db.prepare('SELECT * FROM materiais WHERE id = ?').get(s(materialId, 40));
    if (!m) throw new Error('Material não encontrado.');
    return { url: storage.assinarUrl(m.chave, 600), mime: m.mime };
  },
  remover(clienteId, materialId) {
    const m = db.prepare('SELECT * FROM materiais WHERE id = ? AND cliente_id = ?').get(s(materialId, 40), s(clienteId, 40));
    if (!m) throw new Error('Material não encontrado.');
    db.prepare('DELETE FROM materiais WHERE id = ?').run(m.id);
    storage.removerArquivo(m.chave);
  },
};

module.exports = { Uploads, Entregas, Versoes, Comentarios, Materiais, TIPOS_ENTREGA };
