// =====================================================================
// Musique — BIBLIOTECA DO MÚSICO (Fase 2). Pastas, partituras nos três
// formatos simbólicos, transposição sob demanda, anotações e busca.
//
// DUAS DECISÕES QUE MANDAM AQUI:
//
//   1. TRANSPOSIÇÃO NÃO SE GUARDA — se calcula. Guardar uma cópia por
//      tom multiplicaria versões que dessincronizam: corrigir um acorde
//      obrigaria a corrigir em sete tons. O tom de leitura é PARÂMETRO
//      da consulta. Quem quiser fixar um tom cria uma VERSÃO nova, de
//      propósito e sabendo o que está fazendo.
//
//   2. O QUE CADA FORMATO PERMITE É DITO, NÃO SUPOSTO. ChordPro,
//      MusicXML e MIDI transpõem com aritmética exata. PDF é ANEXO:
//      não transpõe, não toca, não edita — e a resposta diz isso em vez
//      de mostrar um botão que não faz nada.
//
// MIDI cabe INLINE (base64, teto de 512 KB) porque arquivo MIDI real
// tem alguns kilobytes: é símbolo, não áudio. Áudio continua indo para
// o R2 (ADR-0003) — a diferença é de três ordens de grandeza.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const direitos = require('./direitos');
const T = require('./teoria');
const chordpro = require('./chordpro');
const musicxml = require('./musicxml');
const midi = require('./midi');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const MIDI_MAX_BYTES = 512 * 1024;
// MusicXML nao tinha teto: o conteudo e reprocessado por regex a cada leitura
// e a cada transposicao. Partitura de verdade nao chega perto disto.
const XML_MAX_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------
// Pastas
// ---------------------------------------------------------------------
const Pastas = {
  porId: (id) => db.prepare('SELECT * FROM pastas WHERE id = ?').get(id) || null,

  criar(dono, { nome, paiId = '' } = {}) {
    if (!s(nome)) throw new Error('A pasta precisa de um nome.');
    if (paiId) {
      const pai = Pastas.porId(paiId);
      if (!pai || pai.dono !== dono) throw new Error('Pasta de destino não encontrada.');
    }
    const id = novoId();
    const ordem = (db.prepare('SELECT COALESCE(MAX(ordem), -1) AS m FROM pastas WHERE dono = ? AND pai_id = ?')
      .get(dono, paiId).m || 0) + 1;
    db.prepare('INSERT INTO pastas (id, dono, nome, pai_id, ordem, criado_em) VALUES (?,?,?,?,?,?)')
      .run(id, dono, s(nome, 120), paiId, ordem, nowISO());
    return Pastas.porId(id);
  },

  renomear(dono, id, nome) {
    const p = Pastas.porId(id);
    if (!p || p.dono !== dono) throw new Error('Pasta não encontrada.');
    if (!s(nome)) throw new Error('A pasta precisa de um nome.');
    db.prepare('UPDATE pastas SET nome = ? WHERE id = ?').run(s(nome, 120), id);
    return Pastas.porId(id);
  },

  /** Árvore com a contagem de obras em cada nó. */
  arvore(dono) {
    const todas = db.prepare('SELECT * FROM pastas WHERE dono = ? ORDER BY pai_id, ordem, nome').all(dono);
    const contagem = {};
    for (const l of db.prepare('SELECT pasta_id, COUNT(*) AS n FROM obras WHERE dono = ? GROUP BY pasta_id').all(dono)) {
      contagem[l.pasta_id] = l.n;
    }
    const nos = todas.map((p) => ({ ...p, obras: contagem[p.id] || 0, filhas: [] }));
    const porId = Object.fromEntries(nos.map((n) => [n.id, n]));
    const raiz = [];
    for (const n of nos) (porId[n.pai_id] ? porId[n.pai_id].filhas : raiz).push(n);
    return { raiz, sem_pasta: contagem[''] || 0 };
  },

  /** Exclui só pasta VAZIA. Apagar em cascata levaria junto o acervo do
   *  usuário por um clique — e acervo não se recupera de memória. */
  excluir(dono, id) {
    const p = Pastas.porId(id);
    if (!p || p.dono !== dono) throw new Error('Pasta não encontrada.');
    const obras = db.prepare('SELECT COUNT(*) AS n FROM obras WHERE pasta_id = ?').get(id).n;
    const filhas = db.prepare('SELECT COUNT(*) AS n FROM pastas WHERE pai_id = ?').get(id).n;
    if (obras || filhas) {
      throw new Error(`Esta pasta tem ${obras} música(s) e ${filhas} subpasta(s). `
        + 'Mova o conteúdo antes de excluir — assim nada some sem você ver.');
    }
    db.prepare('DELETE FROM pastas WHERE id = ?').run(id);
    return true;
  },
};

// ---------------------------------------------------------------------
// Partituras: criar em cada formato
// ---------------------------------------------------------------------
const FORMATOS_SIMBOLICOS = ['chordpro', 'musicxml', 'midi'];

const Partituras = {
  /**
   * Guarda uma partitura. Valida ANTES de gravar: arquivo que não é o
   * que diz ser vira erro na hora, e não uma linha morta no acervo que
   * só quebra quando alguém for abrir.
   */
  criar(dono, { arranjoId, formato, conteudo = '', mediaId = '' } = {}) {
    const arr = repo.Arranjos.porId(arranjoId);
    if (!arr) throw new Error('Arranjo não encontrado.');
    const obra = repo.Obras.porId(arr.obra_id);
    if (!obra || obra.dono !== dono) throw new Error('Esta obra não é sua.');

    if (formato === 'chordpro') {
      const doc = chordpro.analisar(conteudo);
      if (!doc.linhas.some((l) => l.tipo === 'letra')) throw new Error('A cifra está vazia.');
    } else if (formato === 'musicxml') {
      if (Buffer.byteLength(String(conteudo || ''), 'utf8') > XML_MAX_BYTES) {
        throw new Error('Arquivo MusicXML acima de 2 MB. Isso não parece uma partitura.');
      }
      if (!musicxml.ehXml(conteudo)) {
        throw new Error('Isto não parece um arquivo MusicXML. Exporte do seu editor como MusicXML (.musicxml ou .xml).');
      }
    } else if (formato === 'midi') {
      const buf = Buffer.from(String(conteudo || ''), 'base64');
      if (buf.length > MIDI_MAX_BYTES) throw new Error('Arquivo MIDI acima de 512 KB. Isso não parece um MIDI de partitura.');
      if (!midi.ehMidi(buf)) throw new Error('Isto não parece um arquivo MIDI (.mid).');
    } else if (formato === 'pdf') {
      if (!mediaId) throw new Error('PDF é anexo: envie o arquivo primeiro.');
    } else {
      throw new Error(`Formato desconhecido: "${formato}".`);
    }

    const p = repo.Partituras.criar({ arranjoId, formato, conteudo, mediaId, criadoPor: dono });
    direitos.registrar({ ator: dono, acao: 'partitura.criada', alvo: p.id,
      detalhe: { obra: obra.id, formato, versao: p.versao } });
    return p;
  },

  /**
   * Lê uma partitura já transformada para leitura.
   *
   * `semitons`, `capotraste` e `instrumento` compõem: primeiro o tom que
   * o usuário pediu, depois o capotraste (que só muda a FORMA), depois o
   * instrumento transpositor (que só muda o ESCRITO).
   */
  ver(id, quem, { semitons = 0, capotraste = 0, instrumento = 'do' } = {}) {
    const p = repo.Partituras.porId(id);
    if (!p) throw new Error('Partitura não encontrada.');
    const arr = repo.Arranjos.porId(p.arranjo_id);
    const obra = repo.Obras.porId(arr.obra_id);
    const v = direitos.podeVer(obra, quem);
    if (!v.pode) { const e = new Error(v.motivo); e.bloqueioDeDireitos = true; throw e; }

    const cap = repo.Partituras.capacidades(p.formato);
    const base = { partitura: { id: p.id, formato: p.formato, versao: p.versao }, obra, capacidades: cap };

    if (p.formato === 'pdf') {
      // PDF não transpõe, e a resposta DIZ isso — em vez de a tela
      // mostrar um seletor de tom que não faz nada.
      return { ...base, media_id: p.media_id,
        aviso: 'PDF é uma imagem da partitura: não dá para transpor nem tocar. '
          + 'Para transpor, guarde a música em cifra, MusicXML ou MIDI.' };
    }

    const n = Number(semitons) || 0;
    if (p.formato === 'chordpro') {
      let doc = chordpro.analisar(p.conteudo);
      if (n) doc = chordpro.transpor(doc, n);
      const comCapo = chordpro.comCapotraste(doc, capotraste);
      const final = instrumento && instrumento !== 'do'
        ? chordpro.paraInstrumento(comCapo.documento, instrumento)
        : { documento: comCapo.documento };
      return {
        ...base,
        tom_original: doc.tom, capotraste: comCapo.capotraste,
        tom_soando: comCapo.tom_soando, tom_das_formas: comCapo.tom_das_formas,
        instrumento: final.instrumento || 'do', tom_escrito: final.tom_escrito || comCapo.tom_das_formas,
        documento: final.documento,
        texto: chordpro.serializar(final.documento),
        acordes: chordpro.acordesUsados(final.documento),
      };
    }

    if (p.formato === 'musicxml') {
      const total = n + (instrumento && instrumento !== 'do'
        ? (chordpro.INSTRUMENTOS_TRANSPOSITORES[instrumento] || { semitons: 0 }).semitons : 0);
      const xml = total ? musicxml.transpor(p.conteudo, total) : p.conteudo;
      return { ...base, resumo: musicxml.resumo(xml), notas: musicxml.notas(xml), xml };
    }

    // midi
    const buf = Buffer.from(p.conteudo, 'base64');
    const total = n + (instrumento && instrumento !== 'do'
      ? (chordpro.INSTRUMENTOS_TRANSPOSITORES[instrumento] || { semitons: 0 }).semitons : 0);
    let saida = buf; let avisoMidi = '';
    if (total) {
      try { saida = midi.transpor(buf, total); }
      catch (e) { if (!e.podeForcar) throw e; avisoMidi = e.message; saida = buf; }
    }
    const info = midi.resumo(saida);
    return {
      ...base, resumo: info, notas: midi.notas(saida, { incluirPercussao: true }),
      midi_base64: saida.toString('base64'),
      aviso: [avisoMidi, info.tem_percussao
        ? 'A faixa de percussão não foi transposta: no MIDI, o número da nota escolhe o instrumento de bateria, não a altura.'
        : ''].filter(Boolean).join(' '),
    };
  },

  /** Fixa um tom criando uma VERSÃO nova — o caminho explícito para
   *  quem quer guardar a transposição em vez de recalculá-la. */
  salvarTransposta(dono, id, { semitons }) {
    const p = repo.Partituras.porId(id);
    if (!p) throw new Error('Partitura não encontrada.');
    const arr = repo.Arranjos.porId(p.arranjo_id);
    const obra = repo.Obras.porId(arr.obra_id);
    if (!obra || obra.dono !== dono) throw new Error('Esta obra não é sua.');
    if (p.formato === 'pdf') throw new Error('PDF não transpõe.');
    const n = Number(semitons) || 0;
    if (!n) throw new Error('Escolha em quantos semitons transpor.');

    let conteudo;
    if (p.formato === 'chordpro') conteudo = chordpro.serializar(chordpro.transpor(chordpro.analisar(p.conteudo), n));
    else if (p.formato === 'musicxml') conteudo = musicxml.transpor(p.conteudo, n);
    else conteudo = midi.transpor(Buffer.from(p.conteudo, 'base64'), n).toString('base64');

    const nova = repo.Partituras.criar({ arranjoId: p.arranjo_id, formato: p.formato, conteudo, criadoPor: dono });
    direitos.registrar({ ator: dono, acao: 'partitura.transposta', alvo: nova.id,
      detalhe: { de: p.id, semitons: n, versao: nova.versao } });
    return nova;
  },
};

// ---------------------------------------------------------------------
// Anotações
// ---------------------------------------------------------------------
const Anotacoes = {
  daArranjo: (arranjoId, usuario) =>
    db.prepare('SELECT * FROM anotacoes WHERE arranjo_id = ? AND usuario = ? ORDER BY criado_em').all(arranjoId, usuario),

  criar(usuario, { arranjoId, texto, ancora = '' }) {
    if (!repo.Arranjos.porId(arranjoId)) throw new Error('Arranjo não encontrado.');
    if (!s(texto)) throw new Error('A anotação está vazia.');
    const id = novoId();
    db.prepare('INSERT INTO anotacoes (id, arranjo_id, usuario, ancora, texto, criado_em) VALUES (?,?,?,?,?,?)')
      .run(id, arranjoId, usuario, s(ancora, 80), s(texto, 2000), nowISO());
    return db.prepare('SELECT * FROM anotacoes WHERE id = ?').get(id);
  },

  excluir(usuario, id) {
    const r = db.prepare('DELETE FROM anotacoes WHERE id = ? AND usuario = ?').run(id, usuario);
    return (r.changes || 0) > 0;
  },
};

// ---------------------------------------------------------------------
// Acervo e busca
// ---------------------------------------------------------------------
const Acervo = {
  mover(dono, obraId, pastaId) {
    const o = repo.Obras.porId(obraId);
    if (!o || o.dono !== dono) throw new Error('Esta obra não é sua.');
    if (pastaId) {
      const p = Pastas.porId(pastaId);
      if (!p || p.dono !== dono) throw new Error('Pasta não encontrada.');
    }
    db.prepare('UPDATE obras SET pasta_id = ?, atualizado_em = ? WHERE id = ?').run(pastaId || '', nowISO(), obraId);
    return repo.Obras.porId(obraId);
  },

  /**
   * Busca no acervo do PRÓPRIO usuário: título, compositor, tag e
   * LETRA. Buscar pela letra é o que o músico realmente faz — ele
   * lembra do verso, não do título.
   */
  buscar(dono, { termo = '', pastaId = null, tag = '', formato = '' } = {}) {
    const t = s(termo, 80).toLowerCase();
    let obras = pastaId === null
      ? repo.Obras.doUsuario(dono, { limite: 500 })
      : db.prepare('SELECT * FROM obras WHERE dono = ? AND pasta_id = ? ORDER BY titulo').all(dono, pastaId || '');

    if (tag) obras = obras.filter((o) => (j.parse(o.tags, []) || []).some((x) => String(x).toLowerCase() === tag.toLowerCase()));

    const enriquecidas = obras.map((o) => ({ ...o, tags: j.parse(o.tags, []), formatos: formatosDa(o.id) }));
    const porFormato = formato ? enriquecidas.filter((o) => o.formatos.includes(formato)) : enriquecidas;
    if (!t) return porFormato;

    const semAcento = (v) => T.semAcento(String(v || '')).toLowerCase();
    return porFormato.filter((o) => {
      if (semAcento(o.titulo).includes(semAcento(t))) return true;
      if (semAcento(o.compositor).includes(semAcento(t))) return true;
      if ((o.tags || []).some((x) => semAcento(x).includes(semAcento(t)))) return true;
      return letraDaObra(o.id).some((l) => semAcento(l).includes(semAcento(t)));
    });
  },

  /** Tudo que a tela da obra precisa, de uma vez. */
  obra(dono, obraId) {
    const o = repo.Obras.porId(obraId);
    const v = direitos.podeVer(o, dono);
    if (!v.pode) { const e = new Error(v.motivo); e.bloqueioDeDireitos = true; throw e; }
    const arranjos = repo.Arranjos.daObra(o.id).map((a) => ({
      ...a,
      instrumentacao: j.parse(a.instrumentacao, []),
      partituras: repo.Partituras.doArranjo(a.id).map((p) => ({
        id: p.id, formato: p.formato, versao: p.versao, criado_em: p.criado_em,
        capacidades: repo.Partituras.capacidades(p.formato),
        bytes: p.conteudo ? Buffer.byteLength(p.conteudo, 'utf8') : 0,
      })),
      anotacoes: Anotacoes.daArranjo(a.id, dono),
    }));
    return {
      obra: { ...o, tags: j.parse(o.tags, []) },
      arranjos,
      titularidade: direitos.historicoTitularidade(o.id),
      permissoes: {
        publicar: direitos.podePublicar(o),
        compartilhar: direitos.podeCompartilhar(o),
        ia: direitos.podeMandarParaIA(o),
      },
    };
  },

  tags(dono) {
    const contagem = {};
    for (const o of repo.Obras.doUsuario(dono, { limite: 500 })) {
      for (const t of j.parse(o.tags, []) || []) contagem[t] = (contagem[t] || 0) + 1;
    }
    return Object.entries(contagem).map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n);
  },
};

const formatosDa = (obraId) => [...new Set(db.prepare(
  `SELECT p.formato FROM partituras p JOIN arranjos a ON a.id = p.arranjo_id WHERE a.obra_id = ?`)
  .all(obraId).map((x) => x.formato))];

/** Letra de todas as cifras da obra, para a busca. */
function letraDaObra(obraId) {
  const linhas = db.prepare(
    `SELECT p.conteudo FROM partituras p JOIN arranjos a ON a.id = p.arranjo_id
     WHERE a.obra_id = ? AND p.formato = 'chordpro'`).all(obraId);
  return linhas.map((l) => chordpro.somenteLetra(chordpro.analisar(l.conteudo)));
}

module.exports = { Pastas, Partituras, Anotacoes, Acervo, FORMATOS_SIMBOLICOS, MIDI_MAX_BYTES, letraDaObra };
