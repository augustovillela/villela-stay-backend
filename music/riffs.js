'use strict';

const { db, transacao, nowISO, novoId } = require('./db');
const D = require('./cifras/motor/documento');

const INSTRUMENTOS = ['guitarra', 'violao', 'baixo', 'cavaquinho', 'ukulele', 'bandolim'];
const DIFICULDADES = ['iniciante', 'intermediario', 'avancado'];
const ORIGENS = ['manual', 'proprio', 'dominio_publico', 'licenciado', 'terceiro_privado'];
const TUNING = [40, 45, 50, 55, 59, 64];
function texto(v, max, fallback) { const s = String(v == null ? '' : v).trim(); return (s || fallback || '').slice(0, max); }
function inteiro(v, fallback, min, max) { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback; }
function erro(message, status = 400, extra = {}) { const e = new Error(message); e.status = status; Object.assign(e, extra); return e; }
function documentoDe(d) {
  if (d && d.documento) return typeof d.documento === 'string' ? JSON.parse(d.documento) : d.documento;
  const bruto = String((d && (d.texto || d.tab)) || '');
  // A seção explícita impede que as primeiras linhas de tab sejam tomadas
  // pelo detector de cabeçalho título/artista do importador de cifras.
  const r = D.deTexto('[Tablatura]\n' + bruto);
  return r.documento;
}
function validarDocumento(doc) {
  const r = D.validar(doc);
  if (!r.ok) throw erro('Tablatura inválida: ' + r.erros.slice(0, 3).join(' '), 422, { erros: r.erros });
  const temTab = (doc.secoes || []).some((s) => (s.linhas || []).some((l) => l.tipo === 'tab'));
  if (!temTab) throw erro('Cole ao menos um bloco de tablatura (por exemplo, e|--0--|).', 422);
  return doc;
}
function resumo(r, versao) {
  return { id: r.id, titulo: r.titulo, artista: r.artista, instrumento: r.instrumento, afinacao: r.afinacao,
    bpm: r.bpm, dificuldade: r.dificuldade, origem: r.origem, licenca: r.licenca, privado: !!r.privado,
    criado_em: r.criado_em, atualizado_em: r.atualizado_em, versao: versao ? { id: versao.id, numero: versao.numero, descricao: versao.descricao, criado_em: versao.criado_em } : null };
}
function versaoAtual(id) { return db.prepare('SELECT * FROM riff_versoes WHERE riff_id = ? ORDER BY numero DESC LIMIT 1').get(id) || null; }
function chartDeTab(doc, opcoes = {}) {
  const bpm = inteiro(opcoes.bpm != null ? opcoes.bpm : doc.meta && doc.meta.bpm, 90, 20, 300), passo = 60 / bpm / 2;
  const linhas = [];
  (doc.secoes || []).forEach((s) => (s.linhas || []).forEach((l) => { if (l.tipo === 'tab') linhas.push(String(l.texto)); }));
  const porCorda = { e: 6, B: 5, b: 5, G: 4, D: 3, A: 2, E: 1 };
  const eventos = [];
  linhas.forEach((linha) => {
    const m = linha.match(/^\s*([eBGDA])\s*\|?(.*)$/); if (!m) return;
    const string = porCorda[m[1]], corpo = m[2];
    const re = /(?:\d{1,2}|[xX])/g; let x;
    while ((x = re.exec(corpo))) {
      const fret = /^x$/i.test(x[0]) ? 0 : Number(x[0]); if (!Number.isFinite(fret) || fret > 36) continue;
      const at = Math.max(0, Math.round((x.index / 3) * passo * 1000) / 1000);
      const midi = TUNING[string - 1] + fret;
      if (!eventos.some((e) => e.string === string && Math.abs(e.time - at) < 0.001)) eventos.push({ id: 'riff-' + (eventos.length + 1), time: at, duration: Math.max(0.12, passo * 0.85), string, fret, midi });
    }
  });
  eventos.sort((a, b) => a.time - b.time || a.string - b.string);
  const duration = eventos.length ? eventos[eventos.length - 1].time + passo : passo;
  if (!eventos.length) throw erro('A tablatura não contém notas reconhecíveis.', 422);
  return { id: texto(opcoes.id, 'riff-' + Date.now()), title: texto(opcoes.title, doc.meta && doc.meta.titulo || 'Riff'), bpm, duration, tuning: TUNING.slice(), notes: eventos, sections: [{ id: 'riff-inteiro', title: 'Riff inteiro', from: 0, to: duration }], metadata: { origem: 'musique.riff', aproximado: true } };
}

const Riffs = {
  listar(usuario, q = {}) {
    const termo = texto(q.q, 120, '');
    const rows = termo ? db.prepare(`SELECT * FROM riffs WHERE usuario = ? AND (titulo LIKE ? OR artista LIKE ?) ORDER BY atualizado_em DESC`).all(usuario, '%' + termo + '%', '%' + termo + '%')
      : db.prepare('SELECT * FROM riffs WHERE usuario = ? ORDER BY atualizado_em DESC').all(usuario);
    return { itens: rows.slice(0, inteiro(q.limite, 100, 1, 200)).map((r) => resumo(r, versaoAtual(r.id))), total: rows.length };
  },
  detalhe(usuario, id) {
    const r = db.prepare('SELECT * FROM riffs WHERE id = ? AND usuario = ?').get(String(id), usuario);
    if (!r) throw erro('Riff não encontrado.', 404);
    const v = versaoAtual(r.id);
    return { riff: resumo(r, v), documento: v ? JSON.parse(v.documento) : null, versoes: db.prepare('SELECT id, numero, descricao, criado_por, criado_em FROM riff_versoes WHERE riff_id = ? ORDER BY numero DESC').all(r.id) };
  },
  criar(usuario, entrada = {}) {
    const titulo = texto(entrada.titulo, 160, '');
    if (!titulo) throw erro('Informe um título para o riff.');
    const instrumento = INSTRUMENTOS.includes(String(entrada.instrumento)) ? String(entrada.instrumento) : 'guitarra';
    const dificuldade = DIFICULDADES.includes(String(entrada.dificuldade)) ? String(entrada.dificuldade) : 'iniciante';
    const origem = ORIGENS.includes(String(entrada.origem)) ? String(entrada.origem) : 'manual';
    const doc = validarDocumento(documentoDe(entrada));
    doc.meta = Object.assign({}, doc.meta, { titulo, artista: texto(entrada.artista, 160, ''), afinacao: texto(entrada.afinacao, 80, 'padrao'), bpm: String(inteiro(entrada.bpm, 0, 0, 300) || '') });
    const id = novoId(), agora = nowISO();
    transacao(() => {
      db.prepare(`INSERT INTO riffs (id, usuario, titulo, artista, instrumento, afinacao, bpm, dificuldade, origem, licenca, privado, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, usuario, titulo, texto(entrada.artista, 160, ''), instrumento, texto(entrada.afinacao, 80, 'padrao'), inteiro(entrada.bpm, 0, 0, 300), dificuldade, origem, texto(entrada.licenca, 240, ''), entrada.privado === false ? 0 : 1, agora, agora);
      db.prepare(`INSERT INTO riff_versoes (id, riff_id, numero, documento, descricao, criado_por, criado_em) VALUES (?,?,?,?,?,?,?)`)
        .run(novoId(), id, 1, JSON.stringify(doc), texto(entrada.descricao, 300, 'Versão inicial'), usuario, agora);
    });
    return this.detalhe(usuario, id);
  },
  adicionarVersao(usuario, id, entrada = {}) {
    const r = db.prepare('SELECT * FROM riffs WHERE id = ? AND usuario = ?').get(String(id), usuario);
    if (!r) throw erro('Riff não encontrado.', 404);
    const doc = validarDocumento(documentoDe(entrada));
    const atual = versaoAtual(r.id), numero = (atual ? atual.numero : 0) + 1, agora = nowISO();
    transacao(() => {
      db.prepare('INSERT INTO riff_versoes (id, riff_id, numero, documento, descricao, criado_por, criado_em) VALUES (?,?,?,?,?,?,?)')
        .run(novoId(), r.id, numero, JSON.stringify(doc), texto(entrada.descricao, 300, 'Nova versão'), usuario, agora);
      db.prepare('UPDATE riffs SET atualizado_em = ? WHERE id = ?').run(agora, r.id);
    });
    return this.detalhe(usuario, id);
  },
  porId(usuario, id) { return this.detalhe(usuario, id); },
};

module.exports = { Riffs, INSTRUMENTOS, DIFICULDADES, ORIGENS, chartDeTab };
