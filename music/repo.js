// =====================================================================
// Musique — repositório. Nenhuma rota toca no banco direto (padrão da
// casa): quem fala com SQLite é este arquivo.
//
// ⚠️ Este módulo NÃO decide direitos. Publicação, compartilhamento,
// descoberta e envio para IA passam por `direitos.js`, que é a única
// autoridade. Aqui só existe leitura e escrita — e a leitura pública
// já sai filtrada, porque filtro que mora só na tela vaza.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const direitos = require('./direitos');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

// ---------------------------------------------------------------------
// Config da plataforma
// ---------------------------------------------------------------------
const Config = {
  get(chave, padrao = null) {
    const l = db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave);
    return l ? j.parse(l.valor, padrao) : padrao;
  },
  set(chave, valor) {
    db.prepare(`INSERT INTO config (chave, valor, atualizado_em) VALUES (?, ?, ?)
                ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`)
      .run(chave, j.str(valor), nowISO());
    return valor;
  },
  tudo: () => db.prepare('SELECT * FROM config ORDER BY chave').all()
    .map((l) => ({ chave: l.chave, valor: j.parse(l.valor, null), atualizado_em: l.atualizado_em })),
};

// ---------------------------------------------------------------------
// Projeção do usuário (ADR-0001). A identidade é da Academia; aqui só
// mora o que é musical. `garantir` cria na primeira visita.
// ---------------------------------------------------------------------
const Usuarios = {
  porId: (academyUserId) => db.prepare('SELECT * FROM usuarios_music WHERE academy_user_id = ?').get(academyUserId) || null,

  garantir(academyUserId, { apelido = '' } = {}) {
    const ex = Usuarios.porId(academyUserId);
    if (ex) return ex;
    db.prepare(`INSERT INTO usuarios_music (academy_user_id, apelido, criado_em, atualizado_em)
                VALUES (?, ?, ?, ?)`).run(academyUserId, s(apelido, 80), nowISO(), nowISO());
    return Usuarios.porId(academyUserId);
  },

  editar(academyUserId, d = {}) {
    const u = Usuarios.garantir(academyUserId);
    const campos = {
      apelido: d.apelido !== undefined ? s(d.apelido, 80) : u.apelido,
      instrumentos: d.instrumentos !== undefined ? j.str(d.instrumentos) : u.instrumentos,
      nivel: d.nivel !== undefined ? s(d.nivel, 20) : u.nivel,
      extensao_vocal: d.extensao_vocal !== undefined ? j.str(d.extensao_vocal) : u.extensao_vocal,
      modo_interface: d.modo_interface !== undefined ? s(d.modo_interface, 20) : u.modo_interface,
      calibracao: d.calibracao !== undefined ? j.str(d.calibracao) : u.calibracao,
      preferencias: d.preferencias !== undefined ? j.str(d.preferencias) : u.preferencias,
    };
    db.prepare(`UPDATE usuarios_music SET apelido = ?, instrumentos = ?, nivel = ?, extensao_vocal = ?,
                modo_interface = ?, calibracao = ?, preferencias = ?, atualizado_em = ?
                WHERE academy_user_id = ?`)
      .run(campos.apelido, campos.instrumentos, campos.nivel, campos.extensao_vocal,
           campos.modo_interface, campos.calibracao, campos.preferencias, nowISO(), academyUserId);
    return Usuarios.porId(academyUserId);
  },

  publico: (u) => u && ({
    apelido: u.apelido, nivel: u.nivel,
    instrumentos: j.parse(u.instrumentos, []),
    extensao_vocal: j.parse(u.extensao_vocal, null),
    modo_interface: u.modo_interface,
    calibrado: !!(j.parse(u.calibracao, {}) || {}).microfone_ok,
  }),
};

// ---------------------------------------------------------------------
// Obras, arranjos e partituras
// ---------------------------------------------------------------------
const Obras = {
  porId: (id) => db.prepare('SELECT * FROM obras WHERE id = ?').get(id) || null,

  /** Cria. O padrão de titularidade é o MAIS RESTRITIVO de propósito:
   *  quem sobe sem declarar, sobe como obra de terceiro em acervo
   *  pessoal — e aí as quatro travas valem. */
  criar({ dono, titulo, compositor = '', tomOriginal = '', andamentoBpm = 0, compasso = '',
    titularidade = 'terceiro_privado', tags = [], organizacaoId = '' }) {
    if (!dono) throw new Error('Obra precisa de dono.');
    if (!s(titulo)) throw new Error('Obra precisa de título.');
    if (!direitos.TITULARIDADES.includes(titularidade)) throw new Error(`Titularidade inválida: ${titularidade}`);
    const id = novoId();
    db.prepare(`INSERT INTO obras (id, dono, organizacao_id, titulo, compositor, tom_original,
                andamento_bpm, compasso, titularidade, visibilidade, origem, tags, criado_em, atualizado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'privada', 'upload', ?, ?, ?)`)
      .run(id, dono, organizacaoId, s(titulo, 200), s(compositor, 200), s(tomOriginal, 10),
           Number(andamentoBpm) || 0, s(compasso, 10), titularidade, j.str(tags), nowISO(), nowISO());
    direitos.registrar({ ator: dono, acao: 'obra.criada', alvo: id, detalhe: { titularidade } });
    return Obras.porId(id);
  },

  editar(id, dono, d = {}) {
    const o = Obras.porId(id);
    if (!o) throw new Error('Obra não encontrada.');
    if (o.dono !== dono) throw new Error('Esta obra não é sua.');
    db.prepare(`UPDATE obras SET titulo = ?, compositor = ?, tom_original = ?, andamento_bpm = ?,
                compasso = ?, tags = ?, atualizado_em = ? WHERE id = ?`)
      .run(d.titulo !== undefined ? s(d.titulo, 200) : o.titulo,
           d.compositor !== undefined ? s(d.compositor, 200) : o.compositor,
           d.tom_original !== undefined ? s(d.tom_original, 10) : o.tom_original,
           d.andamento_bpm !== undefined ? Number(d.andamento_bpm) || 0 : o.andamento_bpm,
           d.compasso !== undefined ? s(d.compasso, 10) : o.compasso,
           d.tags !== undefined ? j.str(d.tags) : o.tags,
           nowISO(), id);
    return Obras.porId(id);
  },

  /** O acervo do próprio usuário — tudo dele, inclusive o de terceiro. */
  doUsuario: (dono, { limite = 200 } = {}) =>
    db.prepare('SELECT * FROM obras WHERE dono = ? ORDER BY atualizado_em DESC LIMIT ?')
      .all(dono, Math.min(limite, 500)),

  /**
   * Descoberta: o que OUTRA pessoa pode encontrar. O filtro vem do
   * `direitos`, e é aplicado aqui no repositório — não na tela.
   * Filtro só na tela é como o item privado reaparece na busca.
   */
  descobrir(paraUsuario, { termo = '', limite = 50 } = {}) {
    const like = `%${s(termo, 80)}%`;
    const brutas = db.prepare(
      `SELECT * FROM obras WHERE (titulo LIKE ? OR compositor LIKE ?)
       ORDER BY atualizado_em DESC LIMIT ?`).all(like, like, Math.min(limite, 200) * 4);
    return direitos.filtrarParaDescoberta(brutas, paraUsuario).slice(0, Math.min(limite, 200));
  },

  excluir(id, dono) {
    const o = Obras.porId(id);
    if (!o) throw new Error('Obra não encontrada.');
    if (o.dono !== dono) throw new Error('Esta obra não é sua.');
    const arranjos = db.prepare('SELECT id FROM arranjos WHERE obra_id = ?').all(id);
    for (const a of arranjos) db.prepare('DELETE FROM partituras WHERE arranjo_id = ?').run(a.id);
    db.prepare('DELETE FROM arranjos WHERE obra_id = ?').run(id);
    db.prepare('DELETE FROM obras WHERE id = ?').run(id);
    direitos.registrar({ ator: dono, acao: 'obra.excluida', alvo: id, detalhe: { titulo: o.titulo } });
    return true;
  },
};

const Arranjos = {
  porId: (id) => db.prepare('SELECT * FROM arranjos WHERE id = ?').get(id) || null,
  daObra: (obraId) => db.prepare('SELECT * FROM arranjos WHERE obra_id = ? ORDER BY criado_em').all(obraId),
  criar({ obraId, nome = '', instrumentacao = [], tom = '', dificuldade = '' }) {
    if (!Obras.porId(obraId)) throw new Error('Obra não encontrada.');
    const id = novoId();
    db.prepare(`INSERT INTO arranjos (id, obra_id, nome, instrumentacao, tom, dificuldade, criado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, obraId, s(nome, 120), j.str(instrumentacao), s(tom, 10), s(dificuldade, 20), nowISO());
    return Arranjos.porId(id);
  },
};

const FORMATOS_SIMBOLICOS = ['chordpro', 'musicxml', 'midi'];
const FORMATOS = [...FORMATOS_SIMBOLICOS, 'pdf'];

const Partituras = {
  porId: (id) => db.prepare('SELECT * FROM partituras WHERE id = ?').get(id) || null,
  doArranjo: (arranjoId) => db.prepare('SELECT * FROM partituras WHERE arranjo_id = ? ORDER BY versao DESC').all(arranjoId),

  /** Nova versão. Versão nunca sobrescreve: o histórico é o produto.
   *  PDF entra como ANEXO (`media_id`), nunca como corpo simbólico —
   *  PDF não é formato musical editável. */
  criar({ arranjoId, formato, conteudo = '', mediaId = '', criadoPor = '' }) {
    if (!FORMATOS.includes(formato)) throw new Error(`Formato inválido: ${formato}`);
    if (formato === 'pdf' && !mediaId) throw new Error('PDF é anexo: informe a mídia.');
    if (formato !== 'pdf' && !s(conteudo, 1)) throw new Error('Partitura simbólica precisa de conteúdo.');
    if (!Arranjos.porId(arranjoId)) throw new Error('Arranjo não encontrado.');
    const ultima = db.prepare('SELECT MAX(versao) AS v FROM partituras WHERE arranjo_id = ?').get(arranjoId);
    const versao = (ultima && ultima.v ? ultima.v : 0) + 1;
    const id = novoId();
    db.prepare(`INSERT INTO partituras (id, arranjo_id, formato, conteudo, media_id, versao, pai_versao, criado_por, criado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, arranjoId, formato, String(conteudo || ''), mediaId, versao, versao - 1, criadoPor, nowISO());
    return Partituras.porId(id);
  },

  /** O que este formato permite — a tela pergunta antes de oferecer
   *  botão de transpor ou de tocar. */
  capacidades: (formato) => ({
    transpoe: FORMATOS_SIMBOLICOS.includes(formato),
    toca: FORMATOS_SIMBOLICOS.includes(formato),
    edita: FORMATOS_SIMBOLICOS.includes(formato),
    anexo: formato === 'pdf',
  }),
};

// ---------------------------------------------------------------------
// Mídia (metadado; o byte está no R2 — ADR-0003)
// ---------------------------------------------------------------------
const Midias = {
  porId: (id) => db.prepare('SELECT * FROM midias WHERE id = ?').get(id) || null,
  doUsuario: (dono, { limite = 100 } = {}) =>
    db.prepare('SELECT * FROM midias WHERE dono = ? ORDER BY criado_em DESC LIMIT ?').all(dono, Math.min(limite, 300)),

  criar({ dono, chave, mime = '', organizacaoId = '' }) {
    if (!dono || !chave) throw new Error('Mídia precisa de dono e chave.');
    const id = novoId();
    db.prepare(`INSERT INTO midias (id, dono, organizacao_id, chave, mime, estado, criado_em, atualizado_em)
                VALUES (?, ?, ?, ?, ?, 'enviando', ?, ?)`)
      .run(id, dono, organizacaoId, chave, s(mime, 80), nowISO(), nowISO());
    return Midias.porId(id);
  },

  estado(id, estado, { erro = '', bytes = null, sha256 = null, duracaoMs = null } = {}) {
    const m = Midias.porId(id);
    if (!m) throw new Error('Mídia não encontrada.');
    db.prepare(`UPDATE midias SET estado = ?, erro = ?, bytes = ?, sha256 = ?, duracao_ms = ?, atualizado_em = ?
                WHERE id = ?`)
      .run(estado, String(erro).slice(0, 300),
           bytes == null ? m.bytes : Number(bytes) || 0,
           sha256 == null ? m.sha256 : String(sha256),
           duracaoMs == null ? m.duracao_ms : Number(duracaoMs) || 0,
           nowISO(), id);
    return Midias.porId(id);
  },
};

/** Config inicial (upsert idempotente). */
function semear() {
  if (Config.get('limites') === null) {
    Config.set('limites', {
      upload_mb: Number(process.env.MUSIC_UPLOAD_MB) || 200,
      obras_plano_gratuito: 20,
      minutos_processados_mes: 30,
      jobs_simultaneos: 2,
    });
  }
  // `produto` vem do CÓDIGO, sempre — não é configuração que alguém
  // edita no painel. Semear só quando está nulo faria a fase congelar na
  // do primeiro boot e a landing mentir sobre o próprio estado.
  Config.set('produto', {
    marca: 'Musique', plataforma: 'Villela Music',
    assinatura: 'Musique · por Villela Music',
    fase: 1, fase_nome: 'Academia Musical', lancado: false,
  });
  return true;
}

module.exports = {
  Config, Usuarios, Obras, Arranjos, Partituras, Midias,
  FORMATOS, FORMATOS_SIMBOLICOS, semear,
};
