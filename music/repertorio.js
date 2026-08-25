// =====================================================================
// Musique — REPERTÓRIO, BANDA E PALCO (Fase 2).
//
// Quem paga por isto é o músico que toca fora: bar, casamento, culto,
// formatura. O que ele precisa não é "guardar música" — é chegar no
// palco sabendo a ORDEM, o TOM de cada uma e quanto tempo aquilo dura.
//
// TRÊS COISAS QUE ESTE ARQUIVO FAZ DIFERENTE DO ÓBVIO:
//
//   1. O TOM DE EXECUÇÃO É DO ITEM, NÃO DA OBRA. A mesma música vai em
//      tons diferentes conforme quem canta. Gravar o tom na obra
//      apagaria a versão do outro cantor no próximo show.
//
//   2. DURAÇÃO ESTIMADA VEM MARCADA COMO ESTIMATIVA. Um setlist que
//      soma estimativas e apresenta o total como se fosse medido faz o
//      músico estourar o horário do contratante.
//
//   3. CONFERIR O TOM PARA O CANTOR SÓ FUNCIONA COM MELODIA. Cifra tem
//      acorde, não melodia — dá para saber a harmonia e NÃO dá para
//      saber a nota mais aguda. Quando falta melodia, o sistema diz que
//      não sabe, em vez de chutar a partir do acorde.
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

// ---------------------------------------------------------------------
// Bandas
// ---------------------------------------------------------------------
const Bandas = {
  porId: (id) => db.prepare('SELECT * FROM bandas WHERE id = ?').get(id) || null,

  criar(dono, { nome, descricao = '' }) {
    if (!s(nome)) throw new Error('A banda precisa de um nome.');
    const id = novoId();
    db.prepare('INSERT INTO bandas (id, dono, nome, descricao, criado_em) VALUES (?,?,?,?,?)')
      .run(id, dono, s(nome, 120), s(descricao, 500), nowISO());
    db.prepare('INSERT INTO banda_membros (banda_id, usuario, papel, entrou_em) VALUES (?,?,?,?)')
      .run(id, dono, 'dono', nowISO());
    direitos.registrar({ ator: dono, acao: 'banda.criada', alvo: id, detalhe: { nome } });
    return Bandas.porId(id);
  },

  membros: (bandaId) => db.prepare('SELECT * FROM banda_membros WHERE banda_id = ? ORDER BY papel, entrou_em').all(bandaId),
  ehMembro: (bandaId, usuario) => !!db.prepare('SELECT 1 FROM banda_membros WHERE banda_id = ? AND usuario = ?').get(bandaId, usuario),
  doUsuario: (usuario) => db.prepare(
    `SELECT b.* FROM bandas b JOIN banda_membros m ON m.banda_id = b.id WHERE m.usuario = ? ORDER BY b.nome`).all(usuario),

  /** Convida por e-mail; a busca de conta é injetada (ADR-0001). */
  convidar(dono, bandaId, emails, buscarPorEmail) {
    const b = Bandas.porId(bandaId);
    if (!b || b.dono !== dono) throw new Error('Esta banda não é sua.');
    if (typeof buscarPorEmail !== 'function') {
      throw new Error('Busca de conta indisponível: a Musique não foi montada com a conta da Academia.');
    }
    const entraram = []; const naoEncontrados = [];
    for (const e of (emails || []).map((x) => String(x || '').trim()).filter(Boolean)) {
      const u = buscarPorEmail(e);
      if (!u || !u.id) { naoEncontrados.push(e); continue; }
      db.prepare(`INSERT INTO banda_membros (banda_id, usuario, papel, entrou_em) VALUES (?,?,'integrante',?)
                  ON CONFLICT(banda_id, usuario) DO NOTHING`).run(bandaId, u.id, nowISO());
      entraram.push(u.id);
    }
    direitos.registrar({ ator: dono, acao: 'banda.convidou', alvo: bandaId, detalhe: { entraram: entraram.length } });
    return { entraram: entraram.length, nao_encontrados: naoEncontrados };
  },

  sair(usuario, bandaId) {
    const b = Bandas.porId(bandaId);
    if (!b) throw new Error('Banda não encontrada.');
    if (b.dono === usuario) throw new Error('O dono não sai da própria banda. Exclua a banda, ou passe a outro integrante.');
    db.prepare('DELETE FROM banda_membros WHERE banda_id = ? AND usuario = ?').run(bandaId, usuario);
    return true;
  },
};

// ---------------------------------------------------------------------
// Repertórios
// ---------------------------------------------------------------------
const Repertorios = {
  porId: (id) => db.prepare('SELECT * FROM repertorios WHERE id = ?').get(id) || null,

  /** Regra de acesso em UM lugar: dono, ou integrante da banda. */
  podeVer(rep, quem) {
    if (!rep) return { pode: false, motivo: 'Repertório não encontrado.' };
    if (rep.dono === quem) return { pode: true, dono: true };
    if (rep.banda_id && Bandas.ehMembro(rep.banda_id, quem)) return { pode: true, dono: false };
    return { pode: false, motivo: 'Este repertório não é seu.' };
  },
  podeEditar(rep, quem) {
    const v = Repertorios.podeVer(rep, quem);
    if (!v.pode) return v;
    // Integrante da banda edita o repertório da banda: é trabalho
    // conjunto, e travar em "só o dono" faria a banda inteira depender
    // de uma pessoa na hora da passagem de som.
    return { pode: true };
  },

  criar(dono, { nome, bandaId = '', descricao = '', ocasiao = '', data = '' }) {
    if (!s(nome)) throw new Error('O repertório precisa de um nome.');
    if (bandaId && !Bandas.ehMembro(bandaId, dono)) throw new Error('Você não é integrante dessa banda.');
    const id = novoId();
    db.prepare(`INSERT INTO repertorios (id, dono, banda_id, nome, descricao, ocasiao, data, criado_em, atualizado_em)
                VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, dono, bandaId, s(nome, 120), s(descricao, 1000), s(ocasiao, 60), s(data, 25), nowISO(), nowISO());
    return Repertorios.porId(id);
  },

  doUsuario(usuario) {
    const meus = db.prepare('SELECT * FROM repertorios WHERE dono = ? ORDER BY atualizado_em DESC').all(usuario);
    const bandas = Bandas.doUsuario(usuario).map((b) => b.id);
    const daBanda = bandas.length
      ? db.prepare(`SELECT * FROM repertorios WHERE banda_id IN (${bandas.map(() => '?').join(',')}) AND dono <> ?
                    ORDER BY atualizado_em DESC`).all(...bandas, usuario)
      : [];
    return [...meus, ...daBanda].map((r) => ({ ...r, itens: contarItens(r.id), duracao: duracaoDe(r.id) }));
  },

  /** O setlist inteiro, pronto para a tela e para o palco. */
  completo(id, quem) {
    const rep = Repertorios.porId(id);
    const v = Repertorios.podeVer(rep, quem);
    if (!v.pode) { const e = new Error(v.motivo); e.bloqueioDeDireitos = true; throw e; }
    const itens = db.prepare('SELECT * FROM repertorio_itens WHERE repertorio_id = ? ORDER BY ordem').all(id)
      .map((it) => {
        const obra = it.obra_id ? repo.Obras.porId(it.obra_id) : null;
        return {
          ...it,
          titulo: obra ? obra.titulo : it.titulo_livre,
          compositor: obra ? obra.compositor : '',
          tom_original: obra ? obra.tom_original : '',
          tem_acervo: !!obra,
          // Só entrega conteúdo de obra que o solicitante pode ver — um
          // integrante da banda vê o setlist, não o acervo privado alheio.
          acessivel: obra ? direitos.podeVer(obra, quem).pode : true,
        };
      });
    return {
      repertorio: rep, itens,
      duracao: duracaoDe(id),
      banda: rep.banda_id ? { ...Bandas.porId(rep.banda_id), membros: Bandas.membros(rep.banda_id) } : null,
      sou_dono: rep.dono === quem,
    };
  },

  excluir(quem, id) {
    const rep = Repertorios.porId(id);
    if (!rep || rep.dono !== quem) throw new Error('Este repertório não é seu.');
    db.prepare('DELETE FROM repertorio_itens WHERE repertorio_id = ?').run(id);
    db.prepare('DELETE FROM repertorios WHERE id = ?').run(id);
    return true;
  },
};

const contarItens = (repId) => db.prepare('SELECT COUNT(*) AS n FROM repertorio_itens WHERE repertorio_id = ?').get(repId).n;

/**
 * Duração do setlist. Separa MEDIDO de ESTIMADO, e conta quantos itens
 * não têm duração nenhuma — somar tudo num número só e chamar de
 * "duração" é o que faz o músico estourar o horário.
 */
function duracaoDe(repId) {
  const itens = db.prepare('SELECT duracao_s, duracao_estimada FROM repertorio_itens WHERE repertorio_id = ?').all(repId);
  let medido = 0; let estimado = 0; let semDuracao = 0;
  for (const i of itens) {
    if (!i.duracao_s) { semDuracao++; continue; }
    if (i.duracao_estimada) estimado += i.duracao_s; else medido += i.duracao_s;
  }
  return {
    medido_s: medido, estimado_s: estimado, total_s: medido + estimado,
    sem_duracao: semDuracao,
    total_min: Math.round((medido + estimado) / 60),
    confiavel: estimado === 0 && semDuracao === 0,
  };
}

// ---------------------------------------------------------------------
// Itens do setlist
// ---------------------------------------------------------------------
const Itens = {
  adicionar(quem, repId, { obraId = '', arranjoId = '', tituloLivre = '', tomExecucao = '', capotraste = 0, duracaoS = 0, notaPalco = '' }) {
    const rep = Repertorios.porId(repId);
    const v = Repertorios.podeEditar(rep, quem);
    if (!v.pode) { const e = new Error(v.motivo); e.bloqueioDeDireitos = true; throw e; }
    if (!obraId && !s(tituloLivre)) throw new Error('Escolha uma música do acervo ou dê um nome ao item.');

    let duracao = Number(duracaoS) || 0;
    let estimada = 0;
    if (obraId) {
      const o = repo.Obras.porId(obraId);
      if (!o) throw new Error('Música não encontrada.');
      const acesso = direitos.podeVer(o, quem);
      if (!acesso.pode) { const e = new Error(acesso.motivo); e.bloqueioDeDireitos = true; throw e; }
      if (!duracao) {
        const est = estimarDuracao(obraId);
        if (est) { duracao = est; estimada = 1; }
      }
    }

    const ordem = (db.prepare('SELECT COALESCE(MAX(ordem), -1) AS m FROM repertorio_itens WHERE repertorio_id = ?')
      .get(repId).m) + 1;
    const id = novoId();
    db.prepare(`INSERT INTO repertorio_itens (id, repertorio_id, obra_id, arranjo_id, titulo_livre, ordem,
                tom_execucao, capotraste, duracao_s, duracao_estimada, nota_palco, criado_em)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, repId, obraId, arranjoId, s(tituloLivre, 160), ordem, s(tomExecucao, 10),
           Number(capotraste) || 0, duracao, estimada, s(notaPalco, 1000), nowISO());
    tocarRepertorio(repId);
    return db.prepare('SELECT * FROM repertorio_itens WHERE id = ?').get(id);
  },

  editar(quem, itemId, d = {}) {
    const it = db.prepare('SELECT * FROM repertorio_itens WHERE id = ?').get(itemId);
    if (!it) throw new Error('Item não encontrado.');
    const v = Repertorios.podeEditar(Repertorios.porId(it.repertorio_id), quem);
    if (!v.pode) { const e = new Error(v.motivo); e.bloqueioDeDireitos = true; throw e; }
    const duracao = d.duracao_s !== undefined ? Number(d.duracao_s) || 0 : it.duracao_s;
    db.prepare(`UPDATE repertorio_itens SET tom_execucao = ?, capotraste = ?, duracao_s = ?,
                duracao_estimada = ?, nota_palco = ? WHERE id = ?`)
      .run(d.tom_execucao !== undefined ? s(d.tom_execucao, 10) : it.tom_execucao,
           d.capotraste !== undefined ? Number(d.capotraste) || 0 : it.capotraste,
           duracao,
           // duração informada à mão deixa de ser estimativa
           d.duracao_s !== undefined ? 0 : it.duracao_estimada,
           d.nota_palco !== undefined ? s(d.nota_palco, 1000) : it.nota_palco,
           itemId);
    tocarRepertorio(it.repertorio_id);
    return db.prepare('SELECT * FROM repertorio_itens WHERE id = ?').get(itemId);
  },

  /** Reordena por lista de ids. Ordem é o produto no palco. */
  reordenar(quem, repId, ids) {
    const v = Repertorios.podeEditar(Repertorios.porId(repId), quem);
    if (!v.pode) { const e = new Error(v.motivo); e.bloqueioDeDireitos = true; throw e; }
    const atuais = db.prepare('SELECT id FROM repertorio_itens WHERE repertorio_id = ?').all(repId).map((x) => x.id);
    const faltando = atuais.filter((x) => !ids.includes(x));
    if (faltando.length) {
      throw new Error('A nova ordem não inclui todos os itens. Reordenar não pode remover música do setlist sem você ver.');
    }
    ids.forEach((id, i) => db.prepare('UPDATE repertorio_itens SET ordem = ? WHERE id = ? AND repertorio_id = ?').run(i, id, repId));
    tocarRepertorio(repId);
    return true;
  },

  remover(quem, itemId) {
    const it = db.prepare('SELECT * FROM repertorio_itens WHERE id = ?').get(itemId);
    if (!it) throw new Error('Item não encontrado.');
    const v = Repertorios.podeEditar(Repertorios.porId(it.repertorio_id), quem);
    if (!v.pode) { const e = new Error(v.motivo); e.bloqueioDeDireitos = true; throw e; }
    db.prepare('DELETE FROM repertorio_itens WHERE id = ?').run(itemId);
    tocarRepertorio(it.repertorio_id);
    return true;
  },
};

const tocarRepertorio = (id) => db.prepare('UPDATE repertorios SET atualizado_em = ? WHERE id = ?').run(nowISO(), id);

/** Estimativa em segundos, a partir da cifra. É ESTIMATIVA, e quem
 *  guarda marca como tal. */
function estimarDuracao(obraId) {
  const p = db.prepare(
    `SELECT p.conteudo FROM partituras p JOIN arranjos a ON a.id = p.arranjo_id
     WHERE a.obra_id = ? AND p.formato = 'chordpro' ORDER BY p.versao DESC LIMIT 1`).get(obraId);
  if (!p) return 0;
  const min = chordpro.duracaoEstimadaMin(chordpro.analisar(p.conteudo));
  return min ? min * 60 : 0;
}

// ---------------------------------------------------------------------
// Montar por duração
// ---------------------------------------------------------------------
/**
 * Sugere um setlist que caiba no tempo pedido, usando SÓ o acervo de
 * quem pede. Não recomenda obra de terceiro nem de outro usuário — a
 * trava é a mesma de `direitos.filtrarParaDescoberta`.
 *
 * Devolve SUGESTÃO. Quem monta o show é o músico.
 */
function sugerirPorDuracao(dono, { minutos = 45, tag = '', margemPct = 10 } = {}) {
  const alvo = Math.max(1, Number(minutos) || 45) * 60;
  const candidatas = repo.Obras.doUsuario(dono, { limite: 500 })
    .filter((o) => !tag || (j.parse(o.tags, []) || []).some((x) => String(x).toLowerCase() === String(tag).toLowerCase()))
    .map((o) => ({ obra: o, duracao: estimarDuracao(o.id) }))
    .filter((x) => x.duracao > 0);

  if (!candidatas.length) {
    return { itens: [], total_s: 0, alvo_s: alvo, aviso:
      'Não consegui estimar a duração de nenhuma música do seu acervo. Guarde as cifras e eu passo a estimar — '
      + 'ou informe a duração de cada uma no setlist.' };
  }

  // Guloso, do mais longo ao mais curto: encher com as longas primeiro e
  // ajustar com as curtas erra menos o alvo do que o contrário.
  const ordenadas = [...candidatas].sort((a, b) => b.duracao - a.duracao);
  const escolhidas = [];
  let total = 0;
  const teto = alvo * (1 + (Number(margemPct) || 0) / 100);
  for (const c of ordenadas) {
    if (total + c.duracao <= teto) { escolhidas.push(c); total += c.duracao; }
    if (total >= alvo) break;
  }
  return {
    itens: escolhidas.map((c) => ({ obra_id: c.obra.id, titulo: c.obra.titulo, duracao_s: c.duracao, estimada: true })),
    total_s: total, alvo_s: alvo,
    aviso: 'Todas as durações são ESTIMATIVAS a partir do tamanho da cifra. '
      + 'Confira antes de combinar horário com quem contratou.',
  };
}

// ---------------------------------------------------------------------
// Tom adequado ao cantor
// ---------------------------------------------------------------------
/**
 * Diz se o tom de execução cabe na extensão do cantor, e sugere um que
 * caiba.
 *
 * ⚠️ SÓ FUNCIONA COM MELODIA. Cifra guarda acorde, não melodia: dá para
 * saber a harmonia e NÃO dá para saber a nota mais aguda que o cantor vai
 * ter de alcançar. Quando só há cifra, a resposta é "não sei" — chutar a
 * partir do acorde mandaria o cantor para um tom que não serve.
 */
function conferirTom(obraId, extensao, { semitons = 0 } = {}) {
  const alcance = melodiaDaObra(obraId);
  if (!alcance) {
    return {
      sabe: false,
      motivo: 'Esta música só tem cifra guardada. A cifra traz os acordes, não a melodia — '
        + 'para conferir o tom pela extensão da voz, guarde a melodia em MusicXML ou MIDI.',
    };
  }
  const g = T.midiDe(extensao && extensao.grave);
  const a = T.midiDe(extensao && extensao.agudo);
  if (g == null || a == null) return { sabe: false, motivo: 'Informe a extensão vocal (nota mais grave e mais aguda).' };

  const n = Number(semitons) || 0;
  const cabe = T.cabeNaExtensao([alcance.min + n, alcance.max + n], extensao);
  if (cabe && cabe.cabe) {
    return { sabe: true, cabe: true, semitons: n,
      melodia: { grave: nomeDe(alcance.min + n), agudo: nomeDe(alcance.max + n) } };
  }
  // procura o deslocamento mais próximo de zero que caiba
  for (let d = 1; d <= 11; d++) {
    for (const cand of [n + d, n - d]) {
      const r = T.cabeNaExtensao([alcance.min + cand, alcance.max + cand], extensao);
      if (r && r.cabe) {
        return { sabe: true, cabe: false, semitons: n, sugestao_semitons: cand,
          melodia: { grave: nomeDe(alcance.min + n), agudo: nomeDe(alcance.max + n) },
          motivo: `Neste tom a melodia vai de ${nomeDe(alcance.min + n)} a ${nomeDe(alcance.max + n)}, `
            + `fora da extensão informada. Transpondo ${cand > 0 ? '+' : ''}${cand} semitons, cabe.` };
      }
    }
  }
  return { sabe: true, cabe: false, semitons: n, sugestao_semitons: null,
    melodia: { grave: nomeDe(alcance.min + n), agudo: nomeDe(alcance.max + n) },
    motivo: 'A melodia é mais larga do que a extensão informada: não existe tom em que ela caiba inteira. '
      + 'Nesses casos costuma-se mudar a melodia, não o tom.' };
}

const nomeDe = (m) => T.nomePt(((m % 12) + 12) % 12) + (Math.floor(m / 12) - 1);

/** Faixa da melodia, quando existe partitura simbólica com notas. */
function melodiaDaObra(obraId) {
  const linhas = db.prepare(
    `SELECT p.formato, p.conteudo FROM partituras p JOIN arranjos a ON a.id = p.arranjo_id
     WHERE a.obra_id = ? AND p.formato IN ('musicxml','midi') ORDER BY p.versao DESC`).all(obraId);
  for (const l of linhas) {
    try {
      const midis = l.formato === 'musicxml'
        ? musicxml.notas(l.conteudo).eventos.map((e) => e.midi)
        : midi.notas(Buffer.from(l.conteudo, 'base64'), { incluirPercussao: false }).map((e) => e.midi);
      if (midis.length) return { min: Math.min(...midis), max: Math.max(...midis) };
    } catch (_) { /* arquivo ilegível não vira exceção na tela do setlist */ }
  }
  return null;
}

module.exports = { Bandas, Repertorios, Itens, duracaoDe, sugerirPorDuracao, conferirTom, melodiaDaObra, estimarDuracao };
