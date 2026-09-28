// =====================================================================
// Musique Cifras — ACERVO: música, cifra, revisão, arranjo e a visão de
// cada um. É aqui que o documento do motor vira dado persistente.
//
// O MODELO EM UMA FRASE: uma MÚSICA (obras) tem várias CIFRAS (versões
// de transcrição); cada cifra tem REVISÕES imutáveis e ARRANJOS (a
// leitura de uma banda: tom, capo, ordem das seções); e cada pessoa tem
// a SUA VISÃO (instrumento, tom pessoal, fonte), que não mexe na dos
// outros.
//
// Três garantias:
//   · toda mudança estrutural gera REVISÃO com autor, data e descrição —
//     e nada se sobrescreve: restaurar é criar revisão nova;
//   · conflito é detectado por VERSÃO OTIMISTA: quem salva em cima de
//     uma versão velha recebe 409 com o diff, nunca apaga o outro;
//   · exclusão é SUAVE: a música some da lista e volta com "restaurar".
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('../db');
const repo = require('../repo');
const direitos = require('../direitos');
const acesso = require('./acesso');
const N = require('./motor/nota');
const A = require('./motor/acorde');
const D = require('./motor/documento');
const H = require('./motor/harmonia');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const int = (v, min, max, padrao = 0) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return padrao;
  return Math.max(min, Math.min(max, n));
};
function erro(msg, status = 400, extra = {}) {
  const e = new Error(msg); e.status = status; Object.assign(e, extra); return e;
}

// ---------------------------------------------------------------------
// Normalização, impressão digital e qualidade
// ---------------------------------------------------------------------
const normalizar = (v) => N.semAcento(String(v || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Impressão digital de título + artista. "Garota de Ipanema (Ao Vivo)"
 *  e "garota de ipanema" são a mesma música do mesmo artista. */
function fingerprint(titulo, artista) {
  const t = normalizar(String(titulo || '').replace(/\((ao vivo|live|ac[uú]stic[oa]|remaster[^)]*|vers[aã]o[^)]*|feat[^)]*)\)/gi, ''))
    .replace(/\b(ao vivo|acustico|remasterizado|remastered|live)\b/g, '').replace(/\s+/g, ' ').trim();
  const a = normalizar(artista).replace(/^(os|as|o|a|the)\s+/, '');
  return t + '|' + a;
}

/** Semelhança de Dice por bigramas (0–1): tolera erro de digitação. */
function semelhanca(a, b) {
  a = normalizar(a); b = normalizar(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const big = (x) => { const o = {}; for (let i = 0; i < x.length - 1; i++) { const k = x.slice(i, i + 2); o[k] = (o[k] || 0) + 1; } return o; };
  const ba = big(a), bb = big(b);
  let inter = 0, tot = 0;
  Object.keys(ba).forEach((k) => { tot += ba[k]; if (bb[k]) inter += Math.min(ba[k], bb[k]); });
  Object.keys(bb).forEach((k) => { tot += bb[k]; });
  return tot ? (2 * inter) / tot : 0;
}

/**
 * Qualidade da cifra, 0–100, e o PORQUÊ de cada ponto. Não é nota de
 * gosto: mede completude e o que o motor conseguiu entender.
 */
function qualidade(doc, { confianca = 1, avaliacoes = null } = {}) {
  const motivos = [];
  let pts = 0;
  const acs = D.acordesUsados(doc);
  const total = acs.reduce((a, x) => a + x.vezes, 0);
  const reconhecidos = acs.filter((x) => x.reconhecido).reduce((a, x) => a + x.vezes, 0);
  if (total) {
    const r = reconhecidos / total;
    pts += Math.round(r * 35);
    if (r < 1) motivos.push(`${total - reconhecidos} acorde(s) que o motor não reconhece`);
  } else motivos.push('sem acordes');
  const secoes = doc.secoes.filter((x) => x.tipo !== 'sem_secao').length;
  if (secoes) pts += Math.min(15, secoes * 4); else motivos.push('sem seções marcadas');
  if (doc.meta.tom) pts += 10; else motivos.push('tom não informado');
  if (doc.meta.titulo) pts += 5;
  if (doc.meta.artista) pts += 5;
  const linhasLetra = doc.secoes.reduce((a, x) => a + x.linhas.filter((l) => l.tipo === 'letra').length, 0);
  const comAcorde = doc.secoes.reduce((a, x) => a + x.linhas.filter((l) => l.tipo === 'letra' && l.segmentos.some((g) => g.acorde)).length, 0);
  if (linhasLetra) pts += Math.round((comAcorde / linhasLetra) * 10);
  pts += Math.round(Math.max(0, Math.min(1, confianca)) * 10);
  if (avaliacoes && avaliacoes.n) pts += Math.round((avaliacoes.precisao / 5) * 10);
  else pts += 5;
  return { nota: Math.max(0, Math.min(100, pts)), motivos };
}

// ---------------------------------------------------------------------
// Índice de busca (FTS5 com trigramas; cai para varredura se faltar)
// ---------------------------------------------------------------------
let FTS = false;
try {
  db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS busca_cifras USING fts5(obra_id UNINDEXED, titulo, artista, extras, letra, tokenize='trigram')");
  FTS = true;
} catch (_) { FTS = false; }

function reindexar(obraId) {
  const o = db.prepare('SELECT * FROM obras WHERE id = ?').get(obraId);
  if (!FTS) return;
  db.prepare('DELETE FROM busca_cifras WHERE obra_id = ?').run(obraId);
  if (!o || o.removido_em) return;
  const aliases = db.prepare('SELECT titulo FROM obra_aliases WHERE obra_id = ?').all(obraId).map((x) => x.titulo);
  const cifras = db.prepare("SELECT documento FROM cifras WHERE obra_id = ? AND removido_em = ''").all(obraId);
  const letra = cifras.map((c) => { try { return D.somenteLetra(JSON.parse(c.documento)); } catch (_) { return ''; } }).join('\n');
  const tags = j.parse(o.tags, []) || [];
  db.prepare('INSERT INTO busca_cifras (obra_id, titulo, artista, extras, letra) VALUES (?,?,?,?,?)').run(
    obraId, normalizar([o.titulo].concat(aliases).join(' | ')), normalizar([o.artista, o.compositor].join(' | ')),
    normalizar([o.album, o.genero, o.subgenero].concat(tags).join(' | ')), normalizar(letra).slice(0, 20000));
}

// ---------------------------------------------------------------------
// Pessoas (artista/compositor) e créditos
// ---------------------------------------------------------------------
function pessoa(nome, tipo = 'artista') {
  const n = s(nome, 160);
  if (!n) return null;
  const norm = normalizar(n);
  const l = db.prepare('SELECT * FROM pessoas_musicais WHERE normalizado = ? AND tipo = ?').get(norm, tipo);
  if (l) return l;
  const id = novoId();
  db.prepare('INSERT INTO pessoas_musicais (id, nome, normalizado, tipo, criado_em) VALUES (?,?,?,?,?)').run(id, n, norm, tipo, nowISO());
  return db.prepare('SELECT * FROM pessoas_musicais WHERE id = ?').get(id);
}

function creditar(obraId, nomes, papel) {
  db.prepare('DELETE FROM obra_creditos WHERE obra_id = ? AND papel = ?').run(obraId, papel);
  String(nomes || '').split(/\s*[,;/&]\s*|\s+e\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 12).forEach((n) => {
    const p = pessoa(n, papel === 'compositor' || papel === 'letrista' ? 'compositor' : 'artista');
    if (p) db.prepare('INSERT OR IGNORE INTO obra_creditos (obra_id, pessoa_id, papel) VALUES (?,?,?)').run(obraId, p.id, papel);
  });
}

// ---------------------------------------------------------------------
// MÚSICAS
// ---------------------------------------------------------------------
const CAMPOS_MUSICA = {
  titulo: (v) => s(v, 200), artista: (v) => s(v, 200), compositor: (v) => s(v, 200), album: (v) => s(v, 200),
  ano: (v) => int(v, 0, 2100), idioma: (v) => s(v, 20), genero: (v) => s(v, 60), subgenero: (v) => s(v, 60),
  duracao_s: (v) => int(v, 0, 7200), dificuldade: (v) => (['', 'iniciante', 'intermediario', 'avancado'].includes(v) ? v : ''),
  afinacao: (v) => s(v, 40), capo_sugerido: (v) => int(v, 0, 11), tom_original: (v) => s(v, 10),
  andamento_bpm: (v) => int(v, 0, 400), compasso: (v) => (/^\d{1,2}\/\d{1,2}$/.test(String(v || '')) ? String(v) : ''),
};

const Musicas = {
  /**
   * Os acordes que a pessoa REALMENTE toca: soma a cifra principal de cada
   * música do acervo dela (a de melhor qualidade), por acorde, com as
   * músicas em que aparece. Alimenta a guia Acordes — estudar primeiro o
   * que está no repertório rende mais do que decorar uma tabela.
   * Filtros: pasta (id) e artista. Só obras do próprio dono: o acervo de
   * banda tem o seu próprio lugar.
   */
  acordesDoAcervo(usuario, { pasta = '', artista = '' } = {}) {
    const conds = ["o.dono = ?", "COALESCE(o.removido_em, '') = ''"], vals = [usuario];
    if (pasta) { conds.push('o.pasta_id = ?'); vals.push(s(pasta, 40)); }
    if (artista) { conds.push('lower(o.artista) = lower(?)'); vals.push(s(artista, 200)); }
    const linhas = db.prepare(`SELECT o.id, o.titulo, o.artista, o.criado_em,
        (SELECT c.documento FROM cifras c WHERE c.obra_id = o.id AND c.removido_em = ''
          ORDER BY c.qualidade DESC, c.atualizado_em DESC LIMIT 1) AS doc
      FROM obras o WHERE ${conds.join(' AND ')}`).all(...vals);
    const mapa = new Map();
    let comCifra = 0;
    for (const l of linhas) {
      if (!l.doc) continue;
      let doc; try { doc = JSON.parse(l.doc); } catch (_) { continue; }
      comCifra++;
      for (const a of D.acordesUsados(doc)) {
        if (!a.reconhecido) continue;
        const x = mapa.get(a.acorde) || { acorde: a.acorde, notas: a.notas, vezes: 0, musicas: [], primeira_vez: l.criado_em || '' };
        x.vezes += a.vezes;
        // "Ordem em que entraram" no dicionário: a data da primeira música que trouxe o acorde.
        if (l.criado_em && (!x.primeira_vez || l.criado_em < x.primeira_vez)) x.primeira_vez = l.criado_em;
        if (x.musicas.length < 50 && !x.musicas.some((m) => m.id === l.id)) x.musicas.push({ id: l.id, titulo: l.titulo });
        x.n_musicas = (x.n_musicas || 0) + 1;
        mapa.set(a.acorde, x);
      }
    }
    const acordes = [...mapa.values()].sort((a, b) => b.n_musicas - a.n_musicas || b.vezes - a.vezes || a.acorde.localeCompare(b.acorde));
    const artistas = db.prepare(`SELECT artista, COUNT(*) n FROM obras WHERE dono = ? AND COALESCE(removido_em, '') = '' AND artista <> ''
      GROUP BY lower(artista) ORDER BY n DESC LIMIT 100`).all(usuario);
    return { musicas: comCifra, acordes: acordes.slice(0, 120), artistas };
  },

  porId: (id) => db.prepare('SELECT * FROM obras WHERE id = ?').get(id) || null,

  /** Prováveis duplicatas no acervo da pessoa (o dela e o da banda). */
  duplicatas(usuario, titulo, artista) {
    const fp = fingerprint(titulo, artista);
    const vis = direitos.sqlVisiveis(usuario);
    const exatas = db.prepare(`SELECT o.* FROM obras o WHERE o.fingerprint = ? AND o.removido_em = '' AND ${vis.sql} LIMIT 10`)
      .all(fp, ...vis.params);
    if (exatas.length) return exatas.map((o) => ({ obra: resumo(o), motivo: 'mesmo título e artista', semelhanca: 1 }));
    const nt = normalizar(titulo);
    if (nt.length < 3) return [];
    const cand = db.prepare(`SELECT o.* FROM obras o WHERE o.removido_em = '' AND ${vis.sql} ORDER BY o.atualizado_em DESC LIMIT 2000`)
      .all(...vis.params);
    return cand.map((o) => ({ o, sim: semelhanca(o.titulo, titulo) * 0.75 + (artista ? semelhanca(o.artista, artista) * 0.25 : 0.25) }))
      .filter((x) => x.sim >= 0.82).sort((a, b) => b.sim - a.sim).slice(0, 5)
      .map((x) => ({ obra: resumo(x.o), motivo: 'título parecido', semelhanca: Math.round(x.sim * 100) / 100 }));
  },

  /**
   * Cria a música. Se houver PROVÁVEL DUPLICATA, recusa com 409 e as
   * opções — abrir a existente, criar nova versão nela, mesclar
   * metadados ou salvar separada (`separada: true`).
   */
  criar(usuario, dados = {}) {
    const titulo = s(dados.titulo, 200);
    if (!titulo) throw erro('A música precisa de um título.');
    if (!dados.separada) {
      const dup = Musicas.duplicatas(usuario, titulo, dados.artista);
      if (dup.length) {
        throw erro('Parece que esta música já está no acervo.', 409, { codigo: 'DUPLICATA', duplicatas: dup,
          opcoes: ['abrir', 'nova_versao', 'mesclar_metadados', 'salvar_separada'] });
      }
    }
    const titularidade = direitos.TITULARIDADES.includes(dados.titularidade) ? dados.titularidade : 'terceiro_privado';
    const o = repo.Obras.criar({ dono: usuario, titulo, compositor: s(dados.compositor, 200),
      tomOriginal: s(dados.tom_original || dados.tom, 10), andamentoBpm: int(dados.andamento_bpm || dados.bpm, 0, 400),
      compasso: CAMPOS_MUSICA.compasso(dados.compasso), titularidade,
      tags: Array.isArray(dados.tags) ? dados.tags.map((x) => s(x, 40)).filter(Boolean).slice(0, 30) : [] });
    Musicas._gravarExtras(o.id, dados);
    if (dados.origem) db.prepare('UPDATE obras SET origem = ? WHERE id = ?').run(s(dados.origem, 20), o.id);
    if (dados.pasta_id) {
      const p = db.prepare('SELECT * FROM pastas WHERE id = ?').get(dados.pasta_id);
      if (p && p.dono === usuario) db.prepare('UPDATE obras SET pasta_id = ? WHERE id = ?').run(p.id, o.id);
    }
    reindexar(o.id);
    return Musicas.porId(o.id);
  },

  _gravarExtras(obraId, dados) {
    const sets = [], vals = [];
    ['artista', 'album', 'ano', 'idioma', 'genero', 'subgenero', 'duracao_s', 'dificuldade', 'afinacao', 'capo_sugerido']
      .forEach((c) => { if (dados[c] !== undefined) { sets.push(c + ' = ?'); vals.push(CAMPOS_MUSICA[c](dados[c])); } });
    if (sets.length) db.prepare(`UPDATE obras SET ${sets.join(', ')} WHERE id = ?`).run(...vals, obraId);
    const o = Musicas.porId(obraId);
    db.prepare('UPDATE obras SET fingerprint = ? WHERE id = ?').run(fingerprint(o.titulo, o.artista), obraId);
    if (dados.artista !== undefined) creditar(obraId, dados.artista, 'artista');
    if (dados.compositor !== undefined) creditar(obraId, dados.compositor, 'compositor');
    if (Array.isArray(dados.aliases)) {
      db.prepare('DELETE FROM obra_aliases WHERE obra_id = ?').run(obraId);
      dados.aliases.map((x) => s(x, 200)).filter(Boolean).slice(0, 20).forEach((t) =>
        db.prepare('INSERT INTO obra_aliases (id, obra_id, titulo, normalizado) VALUES (?,?,?,?)').run(novoId(), obraId, t, normalizar(t)));
    }
  },

  editar(usuario, obraId, dados = {}) {
    const o = Musicas.porId(obraId);
    if (!o || o.removido_em) throw erro('Música não encontrada.', 404);
    if (o.dono !== usuario) throw erro('Só quem guardou a música edita os dados dela.', 403);
    const base = {};
    ['titulo', 'compositor', 'tom_original', 'andamento_bpm', 'compasso'].forEach((c) => {
      if (dados[c] !== undefined) base[c] = CAMPOS_MUSICA[c](dados[c]);
    });
    if (dados.tags !== undefined) base.tags = (Array.isArray(dados.tags) ? dados.tags : []).map((x) => s(x, 40)).filter(Boolean).slice(0, 30);
    repo.Obras.editar(obraId, usuario, base);
    Musicas._gravarExtras(obraId, dados);
    reindexar(obraId);
    return Musicas.porId(obraId);
  },

  /** Mescla os metadados de B em A (sem apagar nada que A já tem). */
  mesclarMetadados(usuario, alvoId, origemId) {
    const a = Musicas.porId(alvoId), b = Musicas.porId(origemId);
    if (!a || !b) throw erro('Música não encontrada.', 404);
    if (a.dono !== usuario || b.dono !== usuario) throw erro('Só dá para mesclar músicas suas.', 403);
    const d = {};
    ['artista', 'compositor', 'album', 'genero', 'subgenero', 'idioma', 'afinacao'].forEach((c) => { if (!a[c] && b[c]) d[c] = b[c]; });
    ['ano', 'duracao_s', 'capo_sugerido'].forEach((c) => { if (!a[c] && b[c]) d[c] = b[c]; });
    if (!a.tom_original && b.tom_original) d.tom_original = b.tom_original;
    const tags = [...new Set((j.parse(a.tags, []) || []).concat(j.parse(b.tags, []) || []))];
    d.tags = tags;
    d.aliases = [...new Set(db.prepare('SELECT titulo FROM obra_aliases WHERE obra_id IN (?, ?)').all(alvoId, origemId)
      .map((x) => x.titulo).concat(normalizar(a.titulo) !== normalizar(b.titulo) ? [b.titulo] : []))];
    return Musicas.editar(usuario, alvoId, d);
  },

  remover(usuario, obraId) {
    const o = Musicas.porId(obraId);
    if (!o) throw erro('Música não encontrada.', 404);
    if (o.dono !== usuario) throw erro('Só quem guardou a música pode removê-la.', 403);
    db.prepare('UPDATE obras SET removido_em = ?, atualizado_em = ? WHERE id = ?').run(nowISO(), nowISO(), obraId);
    reindexar(obraId);
    direitos.registrar({ ator: usuario, acao: 'musica.removida', alvo: obraId, detalhe: { titulo: o.titulo } });
    return true;
  },

  restaurar(usuario, obraId) {
    const o = Musicas.porId(obraId);
    if (!o) throw erro('Música não encontrada.', 404);
    if (o.dono !== usuario) throw erro('Só quem guardou a música pode restaurá-la.', 403);
    db.prepare("UPDATE obras SET removido_em = '', atualizado_em = ? WHERE id = ?").run(nowISO(), obraId);
    reindexar(obraId);
    direitos.registrar({ ator: usuario, acao: 'musica.restaurada', alvo: obraId });
    return Musicas.porId(obraId);
  },

  /** Tudo o que a tela de detalhe precisa, de uma vez (sem N+1). */
  detalhe(usuario, obraId) {
    const o = Musicas.porId(obraId);
    const v = direitos.podeVer(o, usuario);
    if (!v.pode) throw erro(v.motivo, o ? 403 : 404, { bloqueioDeDireitos: true });
    const cifras = db.prepare("SELECT * FROM cifras WHERE obra_id = ? AND removido_em = '' ORDER BY qualidade DESC, atualizado_em DESC")
      .all(obraId).map((c) => resumoCifra(c));
    const ids = cifras.map((c) => c.id);
    const arranjos = ids.length ? db.prepare(`SELECT * FROM cifra_arranjos WHERE cifra_id IN (${ids.map(() => '?').join(',')}) AND removido_em = ''`)
      .all(...ids).filter((a) => acesso.podeVerArranjo(a, usuario)).map(resumoArranjo) : [];
    const avals = ids.length ? db.prepare(`SELECT cifra_id, COUNT(*) n, AVG(precisao) p, AVG(facilidade) f FROM avaliacoes_cifra
      WHERE cifra_id IN (${ids.map(() => '?').join(',')}) GROUP BY cifra_id`).all(...ids) : [];
    const avPor = Object.fromEntries(avals.map((x) => [x.cifra_id, { n: x.n, precisao: Math.round(x.p * 10) / 10, facilidade: Math.round(x.f * 10) / 10 }]));
    cifras.forEach((c) => { c.avaliacoes = avPor[c.id] || { n: 0 }; });
    return {
      musica: resumo(o, true),
      removida: !!o.removido_em,
      pela_banda: !!v.pela_banda,
      sou_dono: o.dono === usuario,
      bandas: acesso.bandasDaObraPara(obraId, usuario),
      compartilhada_com: o.dono === usuario ? db.prepare('SELECT bo.banda_id, b.nome FROM banda_obras bo JOIN bandas b ON b.id = bo.banda_id WHERE bo.obra_id = ?').all(obraId) : [],
      cifras, arranjos,
      midias: db.prepare('SELECT * FROM obra_midias WHERE obra_id = ? ORDER BY criado_em').all(obraId)
        .map((m) => ({ ...m, marcadores: j.parse(m.marcadores, []) })),
      fontes: db.prepare('SELECT * FROM cifra_fontes WHERE obra_id = ? ORDER BY importado_em DESC LIMIT 20').all(obraId)
        .map((f) => ({ ...f, detalhe: j.parse(f.detalhe, {}) })),
      aliases: db.prepare('SELECT titulo FROM obra_aliases WHERE obra_id = ?').all(obraId).map((x) => x.titulo),
      favorita: !!db.prepare("SELECT 1 FROM favoritos WHERE usuario = ? AND alvo_tipo = 'obra' AND alvo_id = ?").get(usuario, obraId),
      permissoes: {
        publicar: direitos.podePublicar(o), link: direitos.podeCompartilharPorLink(o), ia: direitos.podeMandarParaIA(o),
        editar: o.dono === usuario,
      },
    };
  },

  /**
   * Busca no acervo visível à pessoa: tolera erro de digitação, acento e
   * título alternativo; procura também na LETRA. Filtros combináveis,
   * ordenação e cursor.
   */
  buscar(usuario, f = {}) {
    const limite = int(f.limite, 1, 100, 30);
    const offset = f.cursor ? int(Buffer.from(String(f.cursor), 'base64url').toString(), 0, 1e6, 0) : 0;
    const vis = direitos.sqlVisiveis(usuario);
    const where = [vis.sql, f.lixeira ? "o.removido_em <> '' AND o.dono = ?" : "o.removido_em = ''"];
    const params = [...vis.params];
    if (f.lixeira) params.push(usuario);
    if (f.escopo === 'minhas') { where.push('o.dono = ?'); params.push(usuario); }
    if (f.banda) { where.push('o.id IN (SELECT obra_id FROM banda_obras WHERE banda_id = ?)'); params.push(s(f.banda, 40)); }
    if (f.artista) { where.push('o.artista = ?'); params.push(s(f.artista, 200)); }
    if (f.genero) { where.push('o.genero = ?'); params.push(s(f.genero, 60)); }
    if (f.dificuldade) { where.push('o.dificuldade = ?'); params.push(s(f.dificuldade, 20)); }
    if (f.idioma) { where.push('o.idioma = ?'); params.push(s(f.idioma, 20)); }
    if (f.tom) { where.push("(o.tom_original = ? OR o.id IN (SELECT obra_id FROM cifras WHERE tom = ? AND removido_em = ''))"); params.push(s(f.tom, 10), s(f.tom, 10)); }
    if (f.tag) { where.push("o.tags LIKE ?"); params.push('%"' + s(f.tag, 40).replace(/[%_"]/g, '') + '"%'); }
    if (f.status) { where.push("o.id IN (SELECT obra_id FROM cifras WHERE status = ? AND removido_em = '')"); params.push(s(f.status, 20)); }
    if (f.favoritas) { where.push("o.id IN (SELECT alvo_id FROM favoritos WHERE usuario = ? AND alvo_tipo = 'obra')"); params.push(usuario); }
    if (f.pasta !== undefined && f.pasta !== null && f.pasta !== '') { where.push('o.pasta_id = ?'); params.push(s(f.pasta, 40)); }

    const q = normalizar(f.q);
    let linhas;
    if (q && q.length >= 3 && FTS) {
      const trig = new Set();
      q.split(' ').filter((w) => w.length >= 3).forEach((w) => { for (let i = 0; i <= w.length - 3; i++) trig.add(w.slice(i, i + 3)); });
      const match = [...trig].slice(0, 60).map((t) => '"' + t + '"').join(' OR ');
      linhas = db.prepare(`SELECT o.*, b.titulo AS b_titulo, b.artista AS b_artista, b.extras AS b_extras, b.letra AS b_letra
          FROM busca_cifras b JOIN obras o ON o.id = b.obra_id
          WHERE busca_cifras MATCH ? AND ${where.join(' AND ')} LIMIT 600`).all(match, ...params);
      linhas = linhas.map((o) => ({ o, score: pontuar(q, o) })).filter((x) => x.score >= 18)
        .sort((a, b) => b.score - a.score).map((x) => Object.assign(x.o, { _score: x.score }));
    } else if (q) {
      const like = '%' + q.replace(/[%_]/g, '') + '%';
      linhas = db.prepare(`SELECT o.* FROM obras o WHERE ${where.join(' AND ')} AND (lower(o.titulo) LIKE ? OR lower(o.artista) LIKE ?)
        ORDER BY o.titulo LIMIT 600`).all(...params, like, like);
    } else {
      const ordem = {
        titulo: 'o.titulo COLLATE NOCASE', artista: 'o.artista COLLATE NOCASE, o.titulo COLLATE NOCASE',
        atualizadas: 'o.atualizado_em DESC',
        recentes: '(SELECT MAX(u.ultima_em) FROM uso_cifras u JOIN cifras c ON c.id = u.cifra_id WHERE c.obra_id = o.id AND u.usuario = ?) DESC, o.atualizado_em DESC',
        mais_tocadas: '(SELECT SUM(u.vezes) FROM uso_cifras u JOIN cifras c ON c.id = u.cifra_id WHERE c.obra_id = o.id AND u.usuario = ?) DESC, o.titulo',
      }[f.ordem || 'titulo'] || 'o.titulo COLLATE NOCASE';
      const pOrdem = /\?/.test(ordem) ? [usuario] : [];
      linhas = db.prepare(`SELECT o.* FROM obras o WHERE ${where.join(' AND ')} ORDER BY ${ordem} LIMIT ? OFFSET ?`)
        .all(...params, ...pOrdem, limite + 1, offset);
      const temMais = linhas.length > limite;
      return { itens: enriquecer(linhas.slice(0, limite), usuario), proximo: temMais ? Buffer.from(String(offset + limite)).toString('base64url') : null, total_aprox: null };
    }
    const pagina = linhas.slice(offset, offset + limite);
    return { itens: enriquecer(pagina, usuario), proximo: offset + limite < linhas.length ? Buffer.from(String(offset + limite)).toString('base64url') : null,
      total_aprox: linhas.length };
  },

  /** Quantas músicas a pessoa vê (dela, da banda, públicas). */
  contar(usuario) {
    const vis = direitos.sqlVisiveis(usuario);
    return db.prepare(`SELECT COUNT(*) n FROM obras o WHERE ${vis.sql} AND o.removido_em = ''`).get(...vis.params).n;
  },

  /** Valores existentes para os filtros (artistas, gêneros, tons). */
  facetas(usuario) {
    const vis = direitos.sqlVisiveis(usuario);
    const w = `${vis.sql} AND o.removido_em = ''`;
    const conta = (col) => db.prepare(`SELECT ${col} AS v, COUNT(*) n FROM obras o WHERE ${w} AND ${col} <> '' GROUP BY ${col} ORDER BY n DESC LIMIT 60`).all(...vis.params);
    return { artistas: conta('o.artista'), generos: conta('o.genero'), dificuldades: conta('o.dificuldade'),
      tons: db.prepare(`SELECT c.tom AS v, COUNT(DISTINCT c.obra_id) n FROM cifras c JOIN obras o ON o.id = c.obra_id WHERE ${w} AND c.tom <> '' AND c.removido_em = '' GROUP BY c.tom ORDER BY n DESC`).all(...vis.params) };
  },
};

function pontuar(q, o) {
  let sc = 0;
  const t = o.b_titulo || normalizar(o.titulo), a = o.b_artista || normalizar(o.artista);
  if (t === q) sc += 120; else if (t.startsWith(q)) sc += 90; else if (t.includes(q)) sc += 70;
  if (a.includes(q)) sc += 55;
  if ((o.b_extras || '').includes(q)) sc += 25;
  if ((o.b_letra || '').includes(q)) sc += 40;
  // Erro de digitação: cada palavra da busca contra a palavra MAIS
  // parecida do título/artista ("ipanmea" ≈ "ipanema"). Comparar a frase
  // inteira diluiria a semelhança no tamanho do título.
  const pal = (x) => x.split(/[ |]+/).filter((w) => w.length >= 2);
  const doTit = pal(t), doArt = pal(a);
  const melhor = (w, lista) => lista.reduce((m, x) => Math.max(m, semelhanca(w, x)), 0);
  const qs = pal(q);
  if (qs.length) {
    sc += Math.round((qs.reduce((s2, w) => s2 + melhor(w, doTit), 0) / qs.length) * 70);
    sc += Math.round((qs.reduce((s2, w) => s2 + melhor(w, doArt), 0) / qs.length) * 35);
  }
  // palavras da busca contidas em qualquer campo (ordem livre)
  const campos = t + ' ' + a + ' ' + (o.b_extras || '');
  const palavras = q.split(' ').filter(Boolean);
  const achadas = palavras.filter((w) => campos.includes(w) || (o.b_letra || '').includes(w)).length;
  sc += Math.round((achadas / palavras.length) * 30);
  return sc;
}

function enriquecer(obras, usuario) {
  if (!obras.length) return [];
  const ids = obras.map((o) => o.id);
  const ph = ids.map(() => '?').join(',');
  const nCifras = Object.fromEntries(db.prepare(`SELECT obra_id, COUNT(*) n, MAX(qualidade) q FROM cifras WHERE obra_id IN (${ph}) AND removido_em = '' GROUP BY obra_id`)
    .all(...ids).map((x) => [x.obra_id, x]));
  const favs = new Set(db.prepare(`SELECT alvo_id FROM favoritos WHERE usuario = ? AND alvo_tipo = 'obra' AND alvo_id IN (${ph})`).all(usuario, ...ids).map((x) => x.alvo_id));
  const principal = Object.fromEntries(db.prepare(`SELECT c.obra_id, c.id, c.tom FROM cifras c WHERE c.obra_id IN (${ph}) AND c.removido_em = ''
    AND c.id = (SELECT c2.id FROM cifras c2 WHERE c2.obra_id = c.obra_id AND c2.removido_em = '' ORDER BY c2.qualidade DESC, c2.atualizado_em DESC LIMIT 1)`)
    .all(...ids).map((x) => [x.obra_id, x]));
  return obras.map((o) => ({ ...resumo(o), cifras: nCifras[o.id] ? nCifras[o.id].n : 0, qualidade: nCifras[o.id] ? nCifras[o.id].q : 0,
    favorita: favs.has(o.id), cifra_principal: principal[o.id] ? principal[o.id].id : '', tom: principal[o.id] ? principal[o.id].tom : o.tom_original,
    minha: o.dono === usuario, score: o._score }));
}

function resumo(o, completo = false) {
  if (!o) return null;
  const r = { id: o.id, titulo: o.titulo, artista: o.artista || '', compositor: o.compositor || '', tom_original: o.tom_original || '',
    genero: o.genero || '', dificuldade: o.dificuldade || '', titularidade: o.titularidade, visibilidade: o.visibilidade,
    atualizado_em: o.atualizado_em, removido_em: o.removido_em || '' };
  if (completo) Object.assign(r, { album: o.album || '', ano: o.ano || 0, idioma: o.idioma || '', subgenero: o.subgenero || '',
    duracao_s: o.duracao_s || 0, afinacao: o.afinacao || '', capo_sugerido: o.capo_sugerido || 0, andamento_bpm: o.andamento_bpm || 0,
    compasso: o.compasso || '', tags: j.parse(o.tags, []) || [], origem: o.origem, pasta_id: o.pasta_id || '', criado_em: o.criado_em });
  return r;
}

// ---------------------------------------------------------------------
// CIFRAS, REVISÕES e RASCUNHOS
// ---------------------------------------------------------------------
function resumoCifra(c) {
  return { id: c.id, obra_id: c.obra_id, nome: c.nome, tom: c.tom, capo: c.capo, afinacao: c.afinacao, status: c.status,
    qualidade: c.qualidade, confianca: c.confianca, revisao_atual: c.revisao_atual, versao: c.versao,
    formato_original: c.formato_original, criado_por: c.criado_por, criado_em: c.criado_em, atualizado_em: c.atualizado_em };
}

function exigirDocumento(doc) {
  const v = D.validar(doc);
  if (!v.ok) throw erro('Documento de cifra inválido: ' + v.erros.slice(0, 3).join(' '), 422, { erros: v.erros });
  return doc;
}

/** Aceita documento pronto, ChordPro ou texto colado. */
function documentoDe(entrada) {
  if (entrada.documento) return { documento: exigirDocumento(typeof entrada.documento === 'string' ? JSON.parse(entrada.documento) : entrada.documento), confianca: 1, formato: 'documento' };
  if (entrada.chordpro) return { documento: D.deChordPro(String(entrada.chordpro).slice(0, 400000)), confianca: 1, formato: 'chordpro' };
  if (entrada.texto) { const r = D.deTexto(String(entrada.texto).slice(0, 400000)); return { documento: r.documento, confianca: r.confianca, formato: 'texto', ambiguidades: r.ambiguidades }; }
  return { documento: D.novoDocumento(), confianca: 1, formato: 'manual' };
}

function tomDoDocumento(doc) {
  const t = D.tomDe(doc);
  return t.tom ? N.escreverTom(t.tom) : '';
}

const Cifras = {
  porId: (id) => db.prepare('SELECT * FROM cifras WHERE id = ?').get(id) || null,

  /** Cria uma cifra (versão) numa música, com a revisão 1. */
  criar(usuario, obraId, entrada = {}) {
    const o = Musicas.porId(obraId);
    if (!o || o.removido_em) throw erro('Música não encontrada.', 404);
    const v = direitos.podeVer(o, usuario);
    if (!v.pode) throw erro(v.motivo, 403, { bloqueioDeDireitos: true });
    // Criar cifra na música exige ser o dono ou editor numa banda que a vê.
    const podeCriar = o.dono === usuario || acesso.bandasDaObraPara(o.id, usuario).some((b) => acesso.PODERES.editar_cifra.includes(b.papel));
    if (!podeCriar) throw erro('Seu papel não permite criar versão desta música.', 403, { bloqueioDeDireitos: true });
    const d = documentoDe(entrada);
    const doc = exigirDocumento(d.documento);
    if (!doc.meta.titulo) doc.meta.titulo = o.titulo;
    if (!doc.meta.artista && o.artista) doc.meta.artista = o.artista;
    const conf = entrada.confianca !== undefined ? Math.max(0, Math.min(1, Number(entrada.confianca))) : d.confianca;
    const q = qualidade(doc, { confianca: conf });
    const id = novoId(), agora = nowISO();
    const tom = s(entrada.tom, 10) || tomDoDocumento(doc);
    transacao(() => {
      db.prepare(`INSERT INTO cifras (id, obra_id, nome, tom, capo, afinacao, documento, original, formato_original, fonte_id,
        status, qualidade, confianca, revisao_atual, versao, criado_por, criado_em, atualizado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?,?)`).run(id, obraId, s(entrada.nome, 120) || 'Versão principal', tom,
        int(entrada.capo !== undefined ? entrada.capo : doc.meta.capo, 0, 11), s(entrada.afinacao, 40) || 'padrao',
        JSON.stringify(doc), String(entrada.original || entrada.texto || entrada.chordpro || '').slice(0, 400000),
        s(entrada.formato_original, 20) || d.formato, s(entrada.fonte_id, 40),
        ['importada', 'comunitaria', 'revisada', 'verificada', 'rascunho'].includes(entrada.status) ? entrada.status : (d.formato === 'manual' ? 'rascunho' : 'importada'),
        q.nota, conf, usuario, agora, agora);
      db.prepare(`INSERT INTO cifra_revisoes (id, cifra_id, numero, documento, autor, descricao, tipo, resumo, criado_em)
        VALUES (?,?,1,?,?,?,?,?,?)`).run(novoId(), id, JSON.stringify(doc), usuario, s(entrada.descricao, 300) || 'Versão inicial',
        entrada.tipo_revisao || (d.formato === 'manual' ? 'criacao' : 'importacao'), '{}', agora);
      db.prepare('UPDATE obras SET atualizado_em = ? WHERE id = ?').run(agora, obraId);
      if (!o.tom_original && tom) db.prepare('UPDATE obras SET tom_original = ? WHERE id = ?').run(tom, obraId);
    });
    reindexar(obraId);
    direitos.registrar({ ator: usuario, acao: 'cifra.criada', alvo: id, detalhe: { obra: obraId } });
    return Cifras.completa(usuario, id);
  },

  /** Cifra com o documento atual, o que a pessoa pode fazer e a visão dela. */
  completa(usuario, cifraId, { arranjoId = '' } = {}) {
    const c = Cifras.porId(cifraId);
    const v = acesso.podeVerCifra(c, usuario);
    if (!v.pode) throw erro(v.motivo, c ? 403 : 404, { bloqueioDeDireitos: true });
    const doc = JSON.parse(c.documento);
    const obra = Musicas.porId(c.obra_id);
    const arranjo = arranjoId ? Arranjos.porId(arranjoId) : null;
    if (arranjo && (arranjo.cifra_id !== cifraId || !acesso.podeVerArranjo(arranjo, usuario))) throw erro('Arranjo não encontrado.', 404);
    const rasc = db.prepare('SELECT * FROM cifra_rascunhos WHERE cifra_id = ? AND usuario = ?').get(cifraId, usuario);
    return {
      cifra: resumoCifra(c),
      musica: resumo(obra),
      documento: doc,
      original_disponivel: !!c.original,
      arranjo: arranjo ? resumoArranjo(arranjo) : null,
      arranjos: db.prepare("SELECT * FROM cifra_arranjos WHERE cifra_id = ? AND removido_em = ''").all(cifraId)
        .filter((a) => acesso.podeVerArranjo(a, usuario)).map(resumoArranjo),
      visao: Visoes.obter(usuario, cifraId, arranjoId),
      preferencias: Preferencias.obter(usuario),
      rascunho: rasc ? { base_revisao: rasc.base_revisao, atualizado_em: rasc.atualizado_em } : null,
      nao_reconhecidos: D.acordesNaoReconhecidos(doc).map((x) => x.acorde),
      tons: H.detectarTom(D.acordesEmOrdem(doc), { latina: doc.meta.notacao === 'latina' }),
      pode: { editar: acesso.podeEditarCifra(c, usuario), comentar: true, arranjo: true },
    };
  },

  /**
   * Salva uma nova REVISÃO. `versao` é a trava otimista: se outra pessoa
   * salvou antes, devolve 409 com o documento atual e o diff — quem
   * decide o que fazer é o músico, e nada do outro se perde.
   */
  salvar(usuario, cifraId, { documento, versao, descricao = '', tipo = 'edicao', meta = null } = {}) {
    const c = Cifras.porId(cifraId);
    if (!c || c.removido_em) throw erro('Cifra não encontrada.', 404);
    if (!acesso.podeEditarCifra(c, usuario)) throw erro('Seu papel não permite editar esta cifra.', 403, { bloqueioDeDireitos: true });
    const doc = exigirDocumento(typeof documento === 'string' ? JSON.parse(documento) : documento);
    if (meta) Object.assign(doc.meta, meta);
    const atual = JSON.parse(c.documento);
    if (Number(versao) !== c.versao) {
      throw erro('Esta cifra foi alterada por outra pessoa depois que você abriu.', 409, { codigo: 'CONFLITO',
        versao_atual: c.versao, revisao_atual: c.revisao_atual, documento_atual: atual, diff: D.diff(atual, doc, { soMudancas: true }) });
    }
    const dif = D.diff(atual, doc, { soMudancas: true });
    const nada = !dif.operacoes.length && !Object.keys(dif.meta).length && !dif.estrutura.mudou;
    if (nada) return { ...Cifras.completa(usuario, cifraId), sem_mudancas: true };
    const numero = c.revisao_atual + 1, agora = nowISO();
    const q = qualidade(doc, { confianca: c.confianca });
    transacao(() => {
      db.prepare(`INSERT INTO cifra_revisoes (id, cifra_id, numero, documento, autor, descricao, tipo, resumo, criado_em)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(novoId(), cifraId, numero, JSON.stringify(doc), usuario, s(descricao, 300),
        ['edicao', 'restauracao', 'fusao', 'transposicao', 'correcao', 'importacao'].includes(tipo) ? tipo : 'edicao',
        JSON.stringify(dif.resumo), agora);
      const r = db.prepare(`UPDATE cifras SET documento = ?, revisao_atual = ?, versao = versao + 1, qualidade = ?, tom = ?,
        atualizado_em = ? WHERE id = ? AND versao = ?`).run(JSON.stringify(doc), numero, q.nota, tomDoDocumento(doc) || c.tom, agora, cifraId, c.versao);
      if (!r.changes) throw erro('Conflito de gravação: tente de novo.', 409, { codigo: 'CONFLITO' });
      db.prepare('DELETE FROM cifra_rascunhos WHERE cifra_id = ? AND usuario = ?').run(cifraId, usuario);
    });
    reindexar(c.obra_id);
    notificarBandas(c, usuario, 'cifra.revisao', `Nova revisão (${numero}) de ${Musicas.porId(c.obra_id).titulo}`);
    return Cifras.completa(usuario, cifraId);
  },

  revisoes(usuario, cifraId) {
    const c = Cifras.porId(cifraId);
    const v = acesso.podeVerCifra(c, usuario);
    if (!v.pode) throw erro(v.motivo, 403, { bloqueioDeDireitos: true });
    return db.prepare('SELECT id, numero, autor, descricao, tipo, resumo, criado_em FROM cifra_revisoes WHERE cifra_id = ? ORDER BY numero DESC')
      .all(cifraId).map((r) => ({ ...r, resumo: j.parse(r.resumo, {}) }));
  },

  revisao(usuario, cifraId, numero) {
    const c = Cifras.porId(cifraId);
    const v = acesso.podeVerCifra(c, usuario);
    if (!v.pode) throw erro(v.motivo, 403, { bloqueioDeDireitos: true });
    const r = db.prepare('SELECT * FROM cifra_revisoes WHERE cifra_id = ? AND numero = ?').get(cifraId, int(numero, 1, 1e6));
    if (!r) throw erro('Revisão não encontrada.', 404);
    return { ...r, documento: JSON.parse(r.documento), resumo: j.parse(r.resumo, {}) };
  },

  comparar(usuario, cifraId, a, b) {
    const ra = Cifras.revisao(usuario, cifraId, a), rb = Cifras.revisao(usuario, cifraId, b);
    return { de: ra.numero, para: rb.numero, diff: D.diff(ra.documento, rb.documento) };
  },

  /** Restaurar = nova revisão com o conteúdo antigo. O histórico não perde nada. */
  restaurar(usuario, cifraId, numero) {
    const r = Cifras.revisao(usuario, cifraId, numero);
    const c = Cifras.porId(cifraId);
    return Cifras.salvar(usuario, cifraId, { documento: r.documento, versao: c.versao,
      descricao: `Restaurada a revisão ${r.numero}`, tipo: 'restauracao' });
  },

  salvarRascunho(usuario, cifraId, { documento, base_revisao }) {
    const c = Cifras.porId(cifraId);
    if (!c || !acesso.podeEditarCifra(c, usuario)) throw erro('Sem permissão para editar esta cifra.', 403);
    const doc = exigirDocumento(typeof documento === 'string' ? JSON.parse(documento) : documento);
    db.prepare(`INSERT INTO cifra_rascunhos (cifra_id, usuario, documento, base_revisao, atualizado_em) VALUES (?,?,?,?,?)
      ON CONFLICT(cifra_id, usuario) DO UPDATE SET documento = excluded.documento, base_revisao = excluded.base_revisao,
      atualizado_em = excluded.atualizado_em`).run(cifraId, usuario, JSON.stringify(doc), int(base_revisao, 0, 1e6), nowISO());
    return { ok: true, salvo_em: nowISO() };
  },

  rascunho(usuario, cifraId) {
    const r = db.prepare('SELECT * FROM cifra_rascunhos WHERE cifra_id = ? AND usuario = ?').get(cifraId, usuario);
    return r ? { documento: JSON.parse(r.documento), base_revisao: r.base_revisao, atualizado_em: r.atualizado_em } : null;
  },

  descartarRascunho(usuario, cifraId) {
    db.prepare('DELETE FROM cifra_rascunhos WHERE cifra_id = ? AND usuario = ?').run(cifraId, usuario);
    return true;
  },

  editarDados(usuario, cifraId, d = {}) {
    const c = Cifras.porId(cifraId);
    if (!c || !acesso.podeEditarCifra(c, usuario)) throw erro('Sem permissão para editar esta cifra.', 403);
    const status = ['importada', 'comunitaria', 'revisada', 'verificada', 'rascunho'].includes(d.status) ? d.status : c.status;
    // "verificada" é selo de quem é dono da música — não se autoconcede
    // por quem só edita pela banda.
    const obra = Musicas.porId(c.obra_id);
    if (status === 'verificada' && obra.dono !== usuario) throw erro('Só o dono da música marca a cifra como verificada.', 403);
    db.prepare('UPDATE cifras SET nome = ?, capo = ?, afinacao = ?, status = ?, atualizado_em = ? WHERE id = ?').run(
      d.nome !== undefined ? s(d.nome, 120) : c.nome, d.capo !== undefined ? int(d.capo, 0, 11) : c.capo,
      d.afinacao !== undefined ? s(d.afinacao, 40) : c.afinacao, status, nowISO(), cifraId);
    return resumoCifra(Cifras.porId(cifraId));
  },

  remover(usuario, cifraId) {
    const c = Cifras.porId(cifraId);
    if (!c) throw erro('Cifra não encontrada.', 404);
    const obra = Musicas.porId(c.obra_id);
    if (obra.dono !== usuario && c.criado_por !== usuario) throw erro('Só o dono da música ou quem criou a versão pode removê-la.', 403);
    db.prepare('UPDATE cifras SET removido_em = ? WHERE id = ?').run(nowISO(), cifraId);
    reindexar(c.obra_id);
    direitos.registrar({ ator: usuario, acao: 'cifra.removida', alvo: cifraId });
    return true;
  },

  original(usuario, cifraId) {
    const c = Cifras.porId(cifraId);
    const v = acesso.podeVerCifra(c, usuario);
    if (!v.pode) throw erro(v.motivo, 403, { bloqueioDeDireitos: true });
    return { formato: c.formato_original, original: c.original };
  },
};

// ---------------------------------------------------------------------
// ARRANJOS (a leitura de uma banda)
// ---------------------------------------------------------------------
function resumoArranjo(a) {
  return { id: a.id, cifra_id: a.cifra_id, banda_id: a.banda_id, nome: a.nome, tom: a.tom, capo: a.capo, bpm: a.bpm,
    compasso: a.compasso, estrutura: j.parse(a.estrutura, []), notas_banda: a.notas_banda, vocalista: a.vocalista,
    status: a.status, aprovado_por: a.aprovado_por, aprovado_em: a.aprovado_em, versao: a.versao,
    criado_por: a.criado_por, atualizado_em: a.atualizado_em };
}

function validarEstrutura(est, doc) {
  if (!Array.isArray(est)) return [];
  const ids = new Set(doc.secoes.map((x) => x.id));
  return est.slice(0, 200).map((x) => ({ secao_id: s(x && x.secao_id, 20), repetir: int(x && x.repetir, 1, 16, 1) }))
    .filter((x) => ids.has(x.secao_id));
}

const Arranjos = {
  porId: (id) => db.prepare('SELECT * FROM cifra_arranjos WHERE id = ?').get(id) || null,

  criar(usuario, cifraId, d = {}) {
    const c = Cifras.porId(cifraId);
    const v = acesso.podeVerCifra(c, usuario);
    if (!v.pode) throw erro(v.motivo, 403, { bloqueioDeDireitos: true });
    const bandaId = s(d.banda_id, 40);
    if (bandaId) {
      acesso.exigir(bandaId, usuario, 'editar_arranjo', 'Seu papel na banda não permite criar arranjo.');
      // o arranjo da banda só faz sentido se a banda VÊ a música
      if (!db.prepare('SELECT 1 FROM banda_obras WHERE banda_id = ? AND obra_id = ?').get(bandaId, c.obra_id)) {
        throw erro('Compartilhe a música com a banda antes de criar o arranjo dela.', 409);
      }
    }
    const doc = JSON.parse(c.documento);
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO cifra_arranjos (id, cifra_id, banda_id, nome, tom, capo, bpm, compasso, estrutura, notas_banda, vocalista,
      status, versao, criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,'rascunho',1,?,?,?)`).run(
      id, cifraId, bandaId, s(d.nome, 120) || (bandaId ? 'Arranjo da banda' : 'Meu arranjo'),
      s(d.tom, 10) || c.tom, int(d.capo, 0, 11), int(d.bpm, 0, 400), CAMPOS_MUSICA.compasso(d.compasso),
      JSON.stringify(validarEstrutura(d.estrutura, doc)), s(d.notas_banda, 4000), s(d.vocalista, 120), usuario, agora, agora);
    if (bandaId) atividade(bandaId, usuario, 'arranjo.criado', id);
    return resumoArranjo(Arranjos.porId(id));
  },

  editar(usuario, arranjoId, d = {}) {
    const a = Arranjos.porId(arranjoId);
    if (!a || a.removido_em) throw erro('Arranjo não encontrado.', 404);
    if (!acesso.podeEditarArranjo(a, usuario)) throw erro('Seu papel não permite editar este arranjo.', 403, { bloqueioDeDireitos: true });
    if (d.versao !== undefined && Number(d.versao) !== a.versao) {
      throw erro('O arranjo mudou desde que você abriu.', 409, { codigo: 'CONFLITO', atual: resumoArranjo(a) });
    }
    const doc = JSON.parse(Cifras.porId(a.cifra_id).documento);
    // Mudar tom/estrutura de um arranjo APROVADO volta ele para revisão:
    // a banda aprovou outra coisa.
    const mudaMusica = (d.tom !== undefined && d.tom !== a.tom) || d.estrutura !== undefined || (d.capo !== undefined && Number(d.capo) !== a.capo);
    const status = a.status === 'aprovado' && mudaMusica ? 'em_revisao' : a.status;
    db.prepare(`UPDATE cifra_arranjos SET nome = ?, tom = ?, capo = ?, bpm = ?, compasso = ?, estrutura = ?, notas_banda = ?, vocalista = ?,
      status = ?, versao = versao + 1, atualizado_em = ? WHERE id = ?`).run(
      d.nome !== undefined ? s(d.nome, 120) : a.nome, d.tom !== undefined ? s(d.tom, 10) : a.tom,
      d.capo !== undefined ? int(d.capo, 0, 11) : a.capo, d.bpm !== undefined ? int(d.bpm, 0, 400) : a.bpm,
      d.compasso !== undefined ? CAMPOS_MUSICA.compasso(d.compasso) : a.compasso,
      d.estrutura !== undefined ? JSON.stringify(validarEstrutura(d.estrutura, doc)) : a.estrutura,
      d.notas_banda !== undefined ? s(d.notas_banda, 4000) : a.notas_banda, d.vocalista !== undefined ? s(d.vocalista, 120) : a.vocalista,
      status, nowISO(), arranjoId);
    if (a.banda_id) atividade(a.banda_id, usuario, 'arranjo.editado', arranjoId, { status });
    return resumoArranjo(Arranjos.porId(arranjoId));
  },

  /** Aprovação: só maestro/admin/proprietário. Aprovar de novo o mesmo não muda nada. */
  aprovar(usuario, arranjoId, { status = 'aprovado' } = {}) {
    const a = Arranjos.porId(arranjoId);
    if (!a || a.removido_em) throw erro('Arranjo não encontrado.', 404);
    if (!a.banda_id) throw erro('Arranjo pessoal não passa por aprovação.');
    acesso.exigir(a.banda_id, usuario, 'aprovar', 'Só o maestro ou a administração da banda aprovam arranjos.');
    const novo = ['aprovado', 'em_revisao', 'rascunho'].includes(status) ? status : 'aprovado';
    db.prepare('UPDATE cifra_arranjos SET status = ?, aprovado_por = ?, aprovado_em = ?, versao = versao + 1, atualizado_em = ? WHERE id = ?')
      .run(novo, novo === 'aprovado' ? usuario : '', novo === 'aprovado' ? nowISO() : '', nowISO(), arranjoId);
    atividade(a.banda_id, usuario, 'arranjo.' + novo, arranjoId);
    return resumoArranjo(Arranjos.porId(arranjoId));
  },

  remover(usuario, arranjoId) {
    const a = Arranjos.porId(arranjoId);
    if (!a) throw erro('Arranjo não encontrado.', 404);
    if (!acesso.podeEditarArranjo(a, usuario)) throw erro('Sem permissão.', 403);
    db.prepare('UPDATE cifra_arranjos SET removido_em = ? WHERE id = ?').run(nowISO(), arranjoId);
    return true;
  },

  daBanda(usuario, bandaId) {
    acesso.exigir(bandaId, usuario, 'ver');
    return db.prepare(`SELECT a.*, c.obra_id, o.titulo FROM cifra_arranjos a JOIN cifras c ON c.id = a.cifra_id JOIN obras o ON o.id = c.obra_id
      WHERE a.banda_id = ? AND a.removido_em = '' ORDER BY o.titulo`).all(bandaId)
      .map((a) => ({ ...resumoArranjo(a), obra_id: a.obra_id, titulo: a.titulo }));
  },
};

// ---------------------------------------------------------------------
// VISÕES PESSOAIS e PREFERÊNCIAS
// ---------------------------------------------------------------------
const TEMAS = ['claro', 'escuro', 'palco', 'sepia', 'preto'];
const MODOS = ['letra_cifra', 'letra', 'acordes', 'mapa'];
const FAMILIAS = ['mono', 'sans', 'serif', 'legivel'];
const ROLAGENS = ['manual', 'duracao', 'bpm', 'marcadores', 'audio', 'pagina', 'microfone'];

function validarExibicao(e = {}) {
  const out = {};
  if (e.fonte !== undefined) out.fonte = int(e.fonte, 10, 72, 18);
  if (e.familia !== undefined) out.familia = FAMILIAS.includes(e.familia) ? e.familia : 'mono';
  if (e.tema !== undefined) out.tema = TEMAS.includes(e.tema) ? e.tema : 'claro';
  if (e.colunas !== undefined) out.colunas = int(e.colunas, 1, 3, 1);
  if (e.modo !== undefined) out.modo = MODOS.includes(e.modo) ? e.modo : 'letra_cifra';
  if (e.espacamento !== undefined) out.espacamento = Math.max(1, Math.min(2.5, Number(e.espacamento) || 1.35));
  if (e.largura !== undefined) out.largura = int(e.largura, 40, 200, 100);
  if (e.brilho !== undefined) out.brilho = int(e.brilho, 20, 100, 100);
  if (e.diagramas !== undefined) out.diagramas = !!e.diagramas;
  if (e.graus !== undefined) out.graus = ['', 'romano', 'nashville'].includes(e.graus) ? e.graus : '';
  return out;
}
function validarRolagem(r = {}) {
  const out = {};
  if (r.modo !== undefined) out.modo = ROLAGENS.includes(r.modo) ? r.modo : 'manual';
  if (r.velocidade !== undefined) out.velocidade = int(r.velocidade, 1, 300, 30);
  if (r.atraso_s !== undefined) out.atraso_s = int(r.atraso_s, 0, 60, 0);
  if (r.contagem !== undefined) out.contagem = int(r.contagem, 0, 8, 0);
  if (r.calibracao !== undefined) out.calibracao = Math.max(0.3, Math.min(3, Number(r.calibracao) || 1));
  if (r.marcadores !== undefined && Array.isArray(r.marcadores)) {
    out.marcadores = r.marcadores.slice(0, 100).map((m) => ({ secao_id: s(m.secao_id, 20), t_s: Math.max(0, Number(m.t_s) || 0) }));
  }
  return out;
}

const Preferencias = {
  obter(usuario) {
    const p = db.prepare('SELECT * FROM preferencias_musicais WHERE usuario = ?').get(usuario);
    if (!p) return { instrumento: 'violao', afinacao: 'padrao', canhoto: false, grafia: 'auto', notacao: 'internacional',
      estilo_acorde: 'original', exibicao: {}, rolagem: {} };
    return { instrumento: p.instrumento, afinacao: p.afinacao, canhoto: !!p.canhoto, grafia: p.grafia, notacao: p.notacao,
      estilo_acorde: p.estilo_acorde, exibicao: j.parse(p.exibicao, {}), rolagem: j.parse(p.rolagem, {}) };
  },
  salvar(usuario, d = {}) {
    const atual = Preferencias.obter(usuario);
    const I = require('./motor/instrumentos');
    const inst = I.INSTRUMENTOS[d.instrumento] ? d.instrumento : atual.instrumento;
    const af = d.afinacao && I.INSTRUMENTOS[inst].afinacoes[d.afinacao] ? d.afinacao : (I.INSTRUMENTOS[inst].afinacoes[atual.afinacao] ? atual.afinacao : 'padrao');
    const novo = {
      instrumento: inst, afinacao: af, canhoto: d.canhoto !== undefined ? !!d.canhoto : atual.canhoto,
      grafia: ['auto', 'sustenido', 'bemol'].includes(d.grafia) ? d.grafia : atual.grafia,
      notacao: ['internacional', 'latina'].includes(d.notacao) ? d.notacao : atual.notacao,
      estilo_acorde: ['original', 'br', 'internacional'].includes(d.estilo_acorde) ? d.estilo_acorde : atual.estilo_acorde,
      exibicao: { ...atual.exibicao, ...validarExibicao(d.exibicao || {}) },
      rolagem: { ...atual.rolagem, ...validarRolagem(d.rolagem || {}) },
    };
    db.prepare(`INSERT INTO preferencias_musicais (usuario, instrumento, afinacao, canhoto, grafia, notacao, estilo_acorde, exibicao, rolagem, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(usuario) DO UPDATE SET instrumento = excluded.instrumento, afinacao = excluded.afinacao,
      canhoto = excluded.canhoto, grafia = excluded.grafia, notacao = excluded.notacao, estilo_acorde = excluded.estilo_acorde,
      exibicao = excluded.exibicao, rolagem = excluded.rolagem, atualizado_em = excluded.atualizado_em`).run(
      usuario, novo.instrumento, novo.afinacao, novo.canhoto ? 1 : 0, novo.grafia, novo.notacao, novo.estilo_acorde,
      JSON.stringify(novo.exibicao), JSON.stringify(novo.rolagem), nowISO());
    return novo;
  },
};

const Visoes = {
  obter(usuario, cifraId, arranjoId = '') {
    const v = db.prepare('SELECT * FROM cifra_visoes WHERE usuario = ? AND cifra_id = ? AND arranjo_id = ?').get(usuario, cifraId, arranjoId || '');
    if (!v) return null;
    return { instrumento: v.instrumento, afinacao: v.afinacao, transposicao: v.transposicao, capo: v.capo, simplificacao: v.simplificacao,
      exibicao: j.parse(v.exibicao, {}), rolagem: j.parse(v.rolagem, {}), notas_privadas: v.notas_privadas, atualizado_em: v.atualizado_em };
  },
  /** Salva a visão PESSOAL. Não toca em arranjo nem em cifra — é o que
   *  garante que a fonte do baterista não muda a do vocalista. */
  salvar(usuario, cifraId, arranjoId, d = {}) {
    const c = Cifras.porId(cifraId);
    const v = acesso.podeVerCifra(c, usuario);
    if (!v.pode) throw erro(v.motivo, 403, { bloqueioDeDireitos: true });
    if (arranjoId) { const a = Arranjos.porId(arranjoId); if (!a || a.cifra_id !== cifraId || !acesso.podeVerArranjo(a, usuario)) throw erro('Arranjo não encontrado.', 404); }
    const atual = Visoes.obter(usuario, cifraId, arranjoId) || { instrumento: '', afinacao: '', transposicao: 0, capo: -1, simplificacao: 0, exibicao: {}, rolagem: {}, notas_privadas: '' };
    const I = require('./motor/instrumentos');
    const novo = {
      instrumento: d.instrumento !== undefined ? (I.INSTRUMENTOS[d.instrumento] ? d.instrumento : '') : atual.instrumento,
      afinacao: d.afinacao !== undefined ? s(d.afinacao, 40) : atual.afinacao,
      transposicao: d.transposicao !== undefined ? int(d.transposicao, -11, 11) : atual.transposicao,
      capo: d.capo !== undefined ? int(d.capo, -1, 11, -1) : atual.capo,
      simplificacao: d.simplificacao !== undefined ? int(d.simplificacao, 0, 3) : atual.simplificacao,
      exibicao: { ...atual.exibicao, ...validarExibicao(d.exibicao || {}) },
      rolagem: { ...atual.rolagem, ...validarRolagem(d.rolagem || {}) },
      notas_privadas: d.notas_privadas !== undefined ? s(d.notas_privadas, 8000) : atual.notas_privadas,
    };
    db.prepare(`INSERT INTO cifra_visoes (usuario, cifra_id, arranjo_id, instrumento, afinacao, transposicao, capo, simplificacao, exibicao, rolagem, notas_privadas, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(usuario, cifra_id, arranjo_id) DO UPDATE SET instrumento = excluded.instrumento,
      afinacao = excluded.afinacao, transposicao = excluded.transposicao, capo = excluded.capo, simplificacao = excluded.simplificacao,
      exibicao = excluded.exibicao, rolagem = excluded.rolagem, notas_privadas = excluded.notas_privadas, atualizado_em = excluded.atualizado_em`).run(
      usuario, cifraId, arranjoId || '', novo.instrumento, novo.afinacao, novo.transposicao, novo.capo, novo.simplificacao,
      JSON.stringify(novo.exibicao), JSON.stringify(novo.rolagem), novo.notas_privadas, nowISO());
    return Visoes.obter(usuario, cifraId, arranjoId);
  },
};

// ---------------------------------------------------------------------
// FAVORITOS, USO, VOICINGS, MÍDIA
// ---------------------------------------------------------------------
const Favoritos = {
  alternar(usuario, tipo, id) {
    if (!['obra', 'cifra', 'setlist'].includes(tipo)) throw erro('Tipo de favorito inválido.');
    const existe = db.prepare('SELECT 1 FROM favoritos WHERE usuario = ? AND alvo_tipo = ? AND alvo_id = ?').get(usuario, tipo, id);
    if (existe) { db.prepare('DELETE FROM favoritos WHERE usuario = ? AND alvo_tipo = ? AND alvo_id = ?').run(usuario, tipo, id); return false; }
    if (tipo === 'obra') { const v = direitos.podeVer(Musicas.porId(id), usuario); if (!v.pode) throw erro(v.motivo, 403); }
    db.prepare('INSERT INTO favoritos (usuario, alvo_tipo, alvo_id, criado_em) VALUES (?,?,?,?)').run(usuario, tipo, id, nowISO());
    return true;
  },
};

const Uso = {
  registrar(usuario, cifraId) {
    db.prepare(`INSERT INTO uso_cifras (usuario, cifra_id, vezes, ultima_em) VALUES (?,?,1,?)
      ON CONFLICT(usuario, cifra_id) DO UPDATE SET vezes = vezes + 1, ultima_em = excluded.ultima_em`).run(usuario, cifraId, nowISO());
  },
  recentes(usuario, limite = 12) {
    return db.prepare(`SELECT u.cifra_id, u.vezes, u.ultima_em, c.obra_id, c.tom, o.titulo, o.artista FROM uso_cifras u
      JOIN cifras c ON c.id = u.cifra_id JOIN obras o ON o.id = c.obra_id
      WHERE u.usuario = ? AND c.removido_em = '' AND o.removido_em = '' ORDER BY u.ultima_em DESC LIMIT ?`).all(usuario, int(limite, 1, 50, 12))
      .filter((x) => direitos.podeVer(Musicas.porId(x.obra_id), usuario).pode);
  },
  maisTocadas(usuario, limite = 12) {
    return db.prepare(`SELECT u.cifra_id, u.vezes, c.obra_id, o.titulo, o.artista FROM uso_cifras u JOIN cifras c ON c.id = u.cifra_id
      JOIN obras o ON o.id = c.obra_id WHERE u.usuario = ? AND c.removido_em = '' AND o.removido_em = '' ORDER BY u.vezes DESC LIMIT ?`)
      .all(usuario, int(limite, 1, 50, 12)).filter((x) => direitos.podeVer(Musicas.porId(x.obra_id), usuario).pode);
  },
};

const Voicings = {
  listar: (usuario, instrumento) => db.prepare('SELECT * FROM voicings_usuario WHERE usuario = ? AND instrumento = ?').all(usuario, instrumento)
    .map((v) => ({ ...v, casas: j.parse(v.casas, []) })),
  fixar(usuario, { instrumento, afinacao = 'padrao', acorde, casas }) {
    const I = require('./motor/instrumentos');
    const inst = I.INSTRUMENTOS[instrumento];
    if (!inst || inst.tipo !== 'trastes') throw erro('Instrumento sem digitação.');
    const cordas = (inst.afinacoes[afinacao] || inst.afinacoes.padrao).cordas;
    if (!Array.isArray(casas) || casas.length !== cordas.length || casas.some((x) => !Number.isInteger(x) || x < -1 || x > 24)) {
      throw erro('Digitação inválida para este instrumento.');
    }
    const ac = A.ler(acorde);
    if (!ac) throw erro('Acorde inválido.');
    const notas = A.notas(ac);
    if (casas.some((x, i) => x >= 0 && !notas.includes((cordas[i] + x) % 12))) throw erro('A digitação tem nota fora do acorde.');
    db.prepare(`INSERT INTO voicings_usuario (usuario, instrumento, afinacao, acorde, casas, criado_em) VALUES (?,?,?,?,?,?)
      ON CONFLICT(usuario, instrumento, afinacao, acorde) DO UPDATE SET casas = excluded.casas`).run(usuario, instrumento, afinacao, s(acorde, 40), JSON.stringify(casas), nowISO());
    return true;
  },
  soltar: (usuario, instrumento, afinacao, acorde) =>
    db.prepare('DELETE FROM voicings_usuario WHERE usuario = ? AND instrumento = ? AND afinacao = ? AND acorde = ?').run(usuario, instrumento, afinacao, acorde).changes > 0,
};

const URL_MIDIA = /^https:\/\/[^\s<>"']{4,500}$/i;
const Midias = {
  adicionar(usuario, obraId, d = {}) {
    const o = Musicas.porId(obraId);
    const v = direitos.podeVer(o, usuario);
    if (!v.pode) throw erro(v.motivo, 403);
    const podeMexer = o.dono === usuario || acesso.bandasDaObraPara(obraId, usuario).some((b) => acesso.PODERES.editar_cifra.includes(b.papel));
    if (!podeMexer) throw erro('Seu papel não permite anexar mídia.', 403);
    const tipo = ['audio', 'video', 'playback', 'stem'].includes(d.tipo) ? d.tipo : 'audio';
    const url = s(d.url, 500);
    const mediaId = s(d.media_id, 40);
    if (!url && !mediaId) throw erro('Informe o link (https) ou envie o arquivo.');
    if (url && !URL_MIDIA.test(url)) throw erro('O link de referência precisa começar com https://.');
    if (mediaId) {
      const m = repo.Midias.porId(mediaId);
      if (!m || m.dono !== usuario) throw erro('Arquivo não encontrado.', 404);
    }
    const id = novoId();
    db.prepare(`INSERT INTO obra_midias (id, obra_id, tipo, titulo, url, media_id, marcadores, offset_ms, criado_por, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, obraId, tipo, s(d.titulo, 160), url, mediaId, JSON.stringify(Midias._marcadores(d.marcadores)),
      int(d.offset_ms, -600000, 600000), usuario, nowISO());
    return db.prepare('SELECT * FROM obra_midias WHERE id = ?').get(id);
  },
  _marcadores: (m) => (Array.isArray(m) ? m.slice(0, 200).map((x) => ({ secao_id: s(x.secao_id, 20), rotulo: s(x.rotulo, 60),
    inicio_ms: int(x.inicio_ms, 0, 36e5) })) : []),
  marcar(usuario, midiaId, marcadores) {
    const m = db.prepare('SELECT * FROM obra_midias WHERE id = ?').get(midiaId);
    if (!m) throw erro('Mídia não encontrada.', 404);
    const o = Musicas.porId(m.obra_id);
    if (!direitos.podeVer(o, usuario).pode) throw erro('Sem acesso.', 403);
    db.prepare('UPDATE obra_midias SET marcadores = ? WHERE id = ?').run(JSON.stringify(Midias._marcadores(marcadores)), midiaId);
    return true;
  },
  remover(usuario, midiaId) {
    const m = db.prepare('SELECT * FROM obra_midias WHERE id = ?').get(midiaId);
    if (!m) throw erro('Mídia não encontrada.', 404);
    const o = Musicas.porId(m.obra_id);
    if (m.criado_por !== usuario && o.dono !== usuario) throw erro('Sem permissão.', 403);
    db.prepare('DELETE FROM obra_midias WHERE id = ?').run(midiaId);
    return true;
  },
};

// ---------------------------------------------------------------------
// Atividade e notificação de banda (usado por vários módulos)
// ---------------------------------------------------------------------
function atividade(bandaId, ator, acao, alvo = '', detalhe = {}) {
  db.prepare('INSERT INTO banda_atividade (id, banda_id, ator, acao, alvo, detalhe, criado_em) VALUES (?,?,?,?,?,?,?)')
    .run(novoId(), bandaId, ator, acao, alvo, JSON.stringify(detalhe), nowISO());
}

function notificar(usuario, tipo, titulo, link = '') {
  db.prepare('INSERT INTO notificacoes_musica (id, usuario, tipo, titulo, link, criado_em) VALUES (?,?,?,?,?,?)')
    .run(novoId(), usuario, tipo, s(titulo, 200), s(link, 300), nowISO());
}

function notificarBandas(cifra, ator, tipo, titulo) {
  const bandas = db.prepare('SELECT banda_id FROM banda_obras WHERE obra_id = ?').all(cifra.obra_id);
  bandas.forEach((b) => {
    atividade(b.banda_id, ator, tipo, cifra.id);
    acesso.membros(b.banda_id).filter((m) => m.usuario !== ator).forEach((m) => notificar(m.usuario, tipo, titulo, '/music/app#cifra=' + cifra.id));
  });
}

module.exports = {
  normalizar, fingerprint, semelhanca, qualidade, reindexar, FTS: () => FTS,
  Musicas, Cifras, Arranjos, Preferencias, Visoes, Favoritos, Uso, Voicings, Midias,
  resumo, resumoCifra, resumoArranjo, atividade, notificar, validarExibicao, validarRolagem, documentoDe, erro,
};
