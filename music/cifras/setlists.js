// =====================================================================
// Musique Cifras — SETLISTS de palco. Estende o repertório da Fase 2 (a
// mesma tabela, as mesmas rotas antigas continuam valendo) com o que um
// show de verdade tem: status, evento e local, BLOCOS/atos, bis, medley,
// intervalo, vocalista, contagem e BPM, tom confirmado, a cifra e o
// arranjo de cada música — e os ALERTAS que evitam o acidente no palco.
//
// O PACOTE OFFLINE é o produto: o setlist inteiro, com cada cifra já no
// tom do show, num JSON só com HASH. O aparelho guarda, e antes do show
// confere o hash — "está no celular" deixa de ser fé.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, transacao, nowISO, novoId, j } = require('../db');
const direitos = require('../direitos');
const repertorio = require('../repertorio');
const acesso = require('./acesso');
const D = require('./motor/documento');
const N = require('./motor/nota');
const { Musicas, Cifras, Arranjos, Visoes, Preferencias, resumoArranjo, atividade, erro } = require('./acervo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const int = (v, min, max, p = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : p; };
const STATUS = ['rascunho', 'em_revisao', 'aprovada', 'em_ensaio', 'pronta', 'arquivada'];

function exigirVer(rep, usuario) {
  const v = repertorio.Repertorios.podeVer(rep, usuario);
  if (!v.pode) throw erro(v.motivo, rep ? 403 : 404, { bloqueioDeDireitos: true });
}
function exigirEditar(rep, usuario) {
  const v = repertorio.Repertorios.podeEditar(rep, usuario);
  if (!v.pode) throw erro(v.motivo, rep ? 403 : 404, { bloqueioDeDireitos: true });
}
function historico(repId, autor, acao, detalhe = {}) {
  db.prepare('INSERT INTO repertorio_historico (id, repertorio_id, autor, acao, detalhe, criado_em) VALUES (?,?,?,?,?,?)')
    .run(novoId(), repId, autor, acao, JSON.stringify(detalhe), nowISO());
  db.prepare('UPDATE repertorios SET atualizado_em = ?, versao = versao + 1 WHERE id = ?').run(nowISO(), repId);
}

/** A cifra que vale para o item: a escolhida, ou a de melhor qualidade da música. */
function cifraDoItem(it) {
  if (it.cifra_id) { const c = Cifras.porId(it.cifra_id); if (c && !c.removido_em) return c; }
  if (!it.obra_id) return null;
  return db.prepare("SELECT * FROM cifras WHERE obra_id = ? AND removido_em = '' ORDER BY qualidade DESC, atualizado_em DESC LIMIT 1").get(it.obra_id) || null;
}

const Setlists = {
  criar(usuario, d = {}) {
    const rep = repertorio.Repertorios.criar(usuario, { nome: d.nome, bandaId: s(d.banda_id, 40), descricao: d.descricao,
      ocasiao: d.ocasiao, data: d.data });
    if (rep.banda_id) acesso.exigir(rep.banda_id, usuario, 'editar_setlist');
    Setlists.editar(usuario, rep.id, d);
    historico(rep.id, usuario, 'criado');
    if (rep.banda_id) atividade(rep.banda_id, usuario, 'setlist.criado', rep.id, { nome: rep.nome });
    return Setlists.completo(usuario, rep.id);
  },

  editar(usuario, repId, d = {}) {
    const rep = repertorio.Repertorios.porId(repId);
    exigirEditar(rep, usuario);
    if (d.status !== undefined && !STATUS.includes(d.status)) throw erro('Status inválido.');
    // "aprovada" num setlist de banda é decisão de quem aprova.
    if (d.status === 'aprovada' && rep.banda_id) acesso.exigir(rep.banda_id, usuario, 'aprovar', 'Só o maestro ou a administração aprova o setlist.');
    if (d.versao !== undefined && Number(d.versao) !== rep.versao) {
      throw erro('O setlist mudou desde que você abriu.', 409, { codigo: 'CONFLITO' });
    }
    const c = (k, f) => (d[k] !== undefined ? f(d[k]) : rep[k]);
    db.prepare(`UPDATE repertorios SET nome = ?, descricao = ?, ocasiao = ?, data = ?, status = ?, local = ?, evento = ?, imagem_url = ?,
      duracao_planejada_s = ?, modelo = ?, atualizado_em = ? WHERE id = ?`).run(
      c('nome', (v) => s(v, 120) || rep.nome), c('descricao', (v) => s(v, 1000)), c('ocasiao', (v) => s(v, 60)), c('data', (v) => s(v, 25)),
      c('status', (v) => v), c('local', (v) => s(v, 160)), c('evento', (v) => s(v, 160)),
      c('imagem_url', (v) => (/^https:\/\//.test(String(v)) ? s(v, 500) : '')), c('duracao_planejada_s', (v) => int(v, 0, 86400)),
      c('modelo', (v) => (v ? 1 : 0)), nowISO(), repId);
    if (Object.keys(d).some((k) => k !== 'versao')) historico(repId, usuario, 'editado', { campos: Object.keys(d).filter((k) => k !== 'versao') });
    return true;
  },

  // ---------------- blocos ----------------
  criarBloco(usuario, repId, { nome, tipo = 'ato', duracao_s = 0 }) {
    const rep = repertorio.Repertorios.porId(repId);
    exigirEditar(rep, usuario);
    const ordem = db.prepare('SELECT COALESCE(MAX(ordem), -1) m FROM repertorio_blocos WHERE repertorio_id = ?').get(repId).m + 1;
    const id = novoId();
    db.prepare('INSERT INTO repertorio_blocos (id, repertorio_id, nome, tipo, ordem, duracao_s) VALUES (?,?,?,?,?,?)').run(id, repId,
      s(nome, 80) || (tipo === 'bis' ? 'Bis' : tipo === 'intervalo' ? 'Intervalo' : 'Bloco ' + (ordem + 1)),
      ['ato', 'bis', 'intervalo'].includes(tipo) ? tipo : 'ato', ordem, int(duracao_s, 0, 7200));
    historico(repId, usuario, 'bloco.criado', { id });
    return db.prepare('SELECT * FROM repertorio_blocos WHERE id = ?').get(id);
  },
  editarBloco(usuario, blocoId, d = {}) {
    const b = db.prepare('SELECT * FROM repertorio_blocos WHERE id = ?').get(blocoId);
    if (!b) throw erro('Bloco não encontrado.', 404);
    exigirEditar(repertorio.Repertorios.porId(b.repertorio_id), usuario);
    db.prepare('UPDATE repertorio_blocos SET nome = ?, duracao_s = ? WHERE id = ?').run(d.nome !== undefined ? s(d.nome, 80) : b.nome,
      d.duracao_s !== undefined ? int(d.duracao_s, 0, 7200) : b.duracao_s, blocoId);
    historico(b.repertorio_id, usuario, 'bloco.editado', { id: blocoId });
    return true;
  },
  removerBloco(usuario, blocoId) {
    const b = db.prepare('SELECT * FROM repertorio_blocos WHERE id = ?').get(blocoId);
    if (!b) throw erro('Bloco não encontrado.', 404);
    exigirEditar(repertorio.Repertorios.porId(b.repertorio_id), usuario);
    // As músicas do bloco NÃO somem: voltam para "sem bloco".
    transacao(() => {
      db.prepare("UPDATE repertorio_itens SET bloco_id = '' WHERE bloco_id = ?").run(blocoId);
      db.prepare('DELETE FROM repertorio_blocos WHERE id = ?').run(blocoId);
    });
    historico(b.repertorio_id, usuario, 'bloco.removido', { id: blocoId });
    return true;
  },

  // ---------------- itens ----------------
  adicionar(usuario, repId, d = {}) {
    const rep = repertorio.Repertorios.porId(repId);
    exigirEditar(rep, usuario);
    let cifra = null;
    if (d.cifra_id) {
      cifra = Cifras.porId(d.cifra_id);
      if (!acesso.podeVerCifra(cifra, usuario).pode) throw erro('Sem acesso a esta cifra.', 403);
      d.obra_id = cifra.obra_id;
    }
    if (d.intervalo) {
      d.titulo_livre = s(d.titulo_livre, 160) || 'Intervalo';
    }
    const it = repertorio.Itens.adicionar(usuario, repId, { obraId: s(d.obra_id, 40), tituloLivre: d.titulo_livre,
      tomExecucao: d.tom_execucao, capotraste: d.capotraste, duracaoS: d.duracao_s, notaPalco: d.nota_palco });
    // Duração: a da cifra (estimada pelo documento) quando não há outra.
    if (!it.duracao_s && (cifra || it.obra_id)) {
      const c = cifra || cifraDoItem(it);
      if (c) {
        const est = D.duracaoEstimada(JSON.parse(c.documento));
        if (est) db.prepare('UPDATE repertorio_itens SET duracao_s = ?, duracao_estimada = 1 WHERE id = ?').run(est, it.id);
      }
    }
    Setlists.editarItem(usuario, it.id, { ...d, _silencioso: true });
    historico(repId, usuario, 'item.adicionado', { item: it.id });
    return db.prepare('SELECT * FROM repertorio_itens WHERE id = ?').get(it.id);
  },

  editarItem(usuario, itemId, d = {}) {
    const it = db.prepare('SELECT * FROM repertorio_itens WHERE id = ?').get(itemId);
    if (!it) throw erro('Item não encontrado.', 404);
    const rep = repertorio.Repertorios.porId(it.repertorio_id);
    exigirEditar(rep, usuario);
    if (d.bloco_id) {
      const b = db.prepare('SELECT * FROM repertorio_blocos WHERE id = ?').get(d.bloco_id);
      if (!b || b.repertorio_id !== rep.id) throw erro('Bloco não encontrado neste setlist.');
    }
    if (d.cifra_arranjo_id) {
      const a = Arranjos.porId(d.cifra_arranjo_id);
      if (!a || !acesso.podeVerArranjo(a, usuario)) throw erro('Arranjo não encontrado.', 404);
    }
    if (d.cifra_id && d.cifra_id !== it.cifra_id) {
      const c = Cifras.porId(d.cifra_id);
      if (!c || c.obra_id !== it.obra_id || !acesso.podeVerCifra(c, usuario).pode) throw erro('Cifra não pertence a esta música.');
    }
    // mudar o tom desconfirma — a banda confirmou OUTRO tom.
    const mudouTom = d.tom_execucao !== undefined && s(d.tom_execucao, 10) !== it.tom_execucao;
    const c = (k, f) => (d[k] !== undefined ? f(d[k]) : it[k]);
    db.prepare(`UPDATE repertorio_itens SET bloco_id = ?, bis = ?, medley = ?, vocalista = ?, bpm = ?, contagem = ?, cifra_id = ?,
      cifra_arranjo_id = ?, tom_confirmado = ?, intervalo = ?, tom_execucao = ?, capotraste = ?, nota_palco = ?, duracao_s = ?, duracao_estimada = ?
      WHERE id = ?`).run(c('bloco_id', (v) => s(v, 40)), c('bis', (v) => (v ? 1 : 0)), c('medley', (v) => s(v, 40)),
      c('vocalista', (v) => s(v, 120)), c('bpm', (v) => int(v, 0, 400)), c('contagem', (v) => s(v, 40)), c('cifra_id', (v) => s(v, 40)),
      c('cifra_arranjo_id', (v) => s(v, 40)), mudouTom && d.tom_confirmado === undefined ? 0 : c('tom_confirmado', (v) => (v ? 1 : 0)),
      c('intervalo', (v) => (v ? 1 : 0)), c('tom_execucao', (v) => s(v, 10)), c('capotraste', (v) => int(v, 0, 11)),
      c('nota_palco', (v) => s(v, 1000)), c('duracao_s', (v) => int(v, 0, 7200)),
      d.duracao_s !== undefined ? 0 : it.duracao_estimada, itemId);
    if (!d._silencioso) historico(rep.id, usuario, 'item.editado', { item: itemId, campos: Object.keys(d) });
    return db.prepare('SELECT * FROM repertorio_itens WHERE id = ?').get(itemId);
  },

  /** Reordena (arrastar e soltar), podendo trocar de bloco no caminho. */
  reordenar(usuario, repId, ordem) {
    const rep = repertorio.Repertorios.porId(repId);
    exigirEditar(rep, usuario);
    const lista = (Array.isArray(ordem) ? ordem : []).map((x) => (typeof x === 'string' ? { id: x } : x));
    repertorio.Itens.reordenar(usuario, repId, lista.map((x) => x.id));
    const blocos = new Set(db.prepare('SELECT id FROM repertorio_blocos WHERE repertorio_id = ?').all(repId).map((b) => b.id));
    lista.forEach((x) => { if (x.bloco_id !== undefined && (x.bloco_id === '' || blocos.has(x.bloco_id))) db.prepare('UPDATE repertorio_itens SET bloco_id = ? WHERE id = ? AND repertorio_id = ?').run(x.bloco_id, x.id, repId); });
    historico(repId, usuario, 'reordenado');
    return true;
  },

  remover(usuario, itemId) {
    const it = db.prepare('SELECT * FROM repertorio_itens WHERE id = ?').get(itemId);
    if (!it) throw erro('Item não encontrado.', 404);
    repertorio.Itens.remover(usuario, itemId);
    historico(it.repertorio_id, usuario, 'item.removido', { titulo: it.titulo_livre || it.obra_id });
    return true;
  },

  /** Duplica (também serve para "usar como modelo"). */
  duplicar(usuario, repId, { nome = '', banda_id } = {}) {
    const rep = repertorio.Repertorios.porId(repId);
    exigirVer(rep, usuario);
    const bandaId = banda_id !== undefined ? s(banda_id, 40) : rep.banda_id;
    if (bandaId) acesso.exigir(bandaId, usuario, 'editar_setlist');
    const novo = repertorio.Repertorios.criar(usuario, { nome: s(nome, 120) || rep.nome + ' (cópia)', bandaId, descricao: rep.descricao, ocasiao: rep.ocasiao });
    transacao(() => {
      db.prepare(`UPDATE repertorios SET local = ?, evento = ?, duracao_planejada_s = ?, status = 'rascunho' WHERE id = ?`)
        .run(rep.local, rep.evento, rep.duracao_planejada_s, novo.id);
      const mapaBlocos = {};
      db.prepare('SELECT * FROM repertorio_blocos WHERE repertorio_id = ? ORDER BY ordem').all(repId).forEach((b) => {
        const id = novoId(); mapaBlocos[b.id] = id;
        db.prepare('INSERT INTO repertorio_blocos (id, repertorio_id, nome, tipo, ordem, duracao_s) VALUES (?,?,?,?,?,?)').run(id, novo.id, b.nome, b.tipo, b.ordem, b.duracao_s);
      });
      db.prepare('SELECT * FROM repertorio_itens WHERE repertorio_id = ? ORDER BY ordem').all(repId).forEach((it) => {
        // Só copia música que QUEM DUPLICA pode ver: duplicar não é
        // caminho para levar o acervo alheio para outro lugar.
        if (it.obra_id && !direitos.podeVer(Musicas.porId(it.obra_id), usuario).pode) return;
        db.prepare(`INSERT INTO repertorio_itens (id, repertorio_id, obra_id, arranjo_id, titulo_livre, ordem, tom_execucao, capotraste,
          duracao_s, duracao_estimada, nota_palco, criado_em, bloco_id, bis, medley, vocalista, bpm, contagem, cifra_id, cifra_arranjo_id,
          tom_confirmado, intervalo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(novoId(), novo.id, it.obra_id, it.arranjo_id,
          it.titulo_livre, it.ordem, it.tom_execucao, it.capotraste, it.duracao_s, it.duracao_estimada, it.nota_palco, nowISO(),
          mapaBlocos[it.bloco_id] || '', it.bis, it.medley, it.vocalista, it.bpm, it.contagem, it.cifra_id,
          bandaId === rep.banda_id ? it.cifra_arranjo_id : '', 0, it.intervalo);
      });
    });
    historico(novo.id, usuario, 'duplicado', { de: repId });
    return Setlists.completo(usuario, novo.id);
  },

  historico(usuario, repId) {
    exigirVer(repertorio.Repertorios.porId(repId), usuario);
    return db.prepare('SELECT * FROM repertorio_historico WHERE repertorio_id = ? ORDER BY criado_em DESC LIMIT 200').all(repId)
      .map((h) => ({ ...h, detalhe: j.parse(h.detalhe, {}) }));
  },

  /** O setlist com blocos, itens enriquecidos, duração e ALERTAS. */
  completo(usuario, repId) {
    const base = repertorio.Repertorios.completo(repId, usuario);
    const rep = repertorio.Repertorios.porId(repId);
    const blocos = db.prepare('SELECT * FROM repertorio_blocos WHERE repertorio_id = ? ORDER BY ordem').all(repId);
    const pacote = db.prepare("SELECT * FROM pacotes_offline WHERE usuario = ? AND alvo_tipo = 'setlist' AND alvo_id = ? ORDER BY gerado_em DESC LIMIT 1").get(usuario, repId);
    const itens = base.itens.map((it) => {
      const c = it.acessivel ? cifraDoItem(it) : null;
      const arr = it.cifra_arranjo_id ? Arranjos.porId(it.cifra_arranjo_id) : null;
      return { ...it, cifra: c ? { id: c.id, tom: c.tom, nome: c.nome, atualizado_em: c.atualizado_em, qualidade: c.qualidade } : null,
        arranjo: arr && acesso.podeVerArranjo(arr, usuario) ? resumoArranjo(arr) : null };
    });
    const alertas = [];
    let total = 0;
    itens.forEach((it) => {
      total += it.duracao_s || 0;
      if (it.intervalo) return;
      const nome = '"' + (it.titulo || 'item') + '"';
      if (it.tem_acervo && !it.acessivel) alertas.push({ nivel: 'erro', item: it.id, texto: nome + ': você não tem acesso a esta música.' });
      else if (it.tem_acervo && !it.cifra) alertas.push({ nivel: 'erro', item: it.id, texto: nome + ': a música não tem cifra.' });
      if (it.cifra && !it.tom_confirmado) alertas.push({ nivel: 'aviso', item: it.id, texto: nome + ': tom não confirmado.' });
      if (it.arranjo && rep.banda_id && it.arranjo.status !== 'aprovado') alertas.push({ nivel: 'aviso', item: it.id, texto: nome + ': arranjo ainda não aprovado.' });
      if (it.cifra && pacote && it.cifra.atualizado_em > pacote.gerado_em) alertas.push({ nivel: 'aviso', item: it.id, texto: nome + ': a cifra mudou depois do último download — baixe de novo.' });
      if (!it.duracao_s) alertas.push({ nivel: 'info', item: it.id, texto: nome + ': sem duração.' });
    });
    blocos.forEach((b) => { if (b.tipo === 'intervalo') total += b.duracao_s || 0; });
    if (rep.duracao_planejada_s && total > rep.duracao_planejada_s) {
      alertas.push({ nivel: 'erro', texto: `Duração total (${Math.round(total / 60)} min) acima do planejado (${Math.round(rep.duracao_planejada_s / 60)} min).` });
    }
    if (!pacote && itens.length) alertas.push({ nivel: 'aviso', texto: 'Setlist ainda não baixado neste aparelho para uso sem internet.' });
    else if (pacote && rep.atualizado_em > pacote.gerado_em) alertas.push({ nivel: 'aviso', texto: 'O setlist mudou depois do último download.' });
    return {
      ...base,
      repertorio: { ...rep },
      blocos, itens, alertas,
      duracao: { ...base.duracao, total_com_intervalos_s: total, planejada_s: rep.duracao_planejada_s },
      pacote: pacote ? { hash: pacote.hash, gerado_em: pacote.gerado_em, itens: pacote.itens, bytes: pacote.bytes } : null,
      pode_editar: repertorio.Repertorios.podeEditar(rep, usuario).pode,
      pode_aprovar: rep.banda_id ? acesso.pode(rep.banda_id, usuario, 'aprovar') : rep.dono === usuario,
      pode_conduzir: rep.banda_id ? acesso.pode(rep.banda_id, usuario, 'conduzir_sessao') : rep.dono === usuario,
    };
  },

  /**
   * PACOTE OFFLINE: tudo o que o palco precisa, já no tom do show e na
   * visão de QUEM baixa (instrumento, transposição pessoal, capo). Um
   * JSON só, com hash — o aparelho confere antes de subir no palco.
   */
  pacote(usuario, repId) {
    const s0 = Setlists.completo(usuario, repId);
    const pref = Preferencias.obter(usuario);
    const musicas = s0.itens.map((it) => {
      if (it.intervalo || !it.cifra) return { item_id: it.id, titulo: it.titulo, intervalo: !!it.intervalo, nota_palco: it.nota_palco, duracao_s: it.duracao_s, sem_cifra: !it.intervalo };
      const c = Cifras.porId(it.cifra.id);
      const doc = JSON.parse(c.documento);
      const arr = it.arranjo;
      const visao = Visoes.obter(usuario, c.id, arr ? arr.id : '') || {};
      // Tom do show: o do item; senão o do arranjo; senão o da cifra.
      const alvo = it.tom_execucao || (arr && arr.tom) || c.tom;
      let semi = alvo ? D.semitonsAte(doc, alvo) || 0 : 0;
      // A transposição PESSOAL só vale no palco quando foi definida no
      // ARRANJO da banda (autorizada). A que o músico fez lendo a cifra
      // em casa não pode mudar o tom do show — capo e simplificação sim,
      // porque não mudam o som que a banda ouve.
      if (arr) semi += visao.transposicao || 0;
      const capo = visao.capo >= 0 && visao.capo !== undefined ? visao.capo : (it.capotraste || (arr && arr.capo) || 0);
      let final = semi ? D.transpor(doc, semi, { preferencia: pref.grafia }) : doc;
      if (visao.simplificacao) final = D.simplificar(final, visao.simplificacao).documento;
      const comCapo = D.comCapotraste(final, capo, { preferencia: pref.grafia });
      return {
        item_id: it.id, cifra_id: c.id, revisao: c.revisao_atual, titulo: it.titulo, artista: it.compositor || '',
        tom_soando: comCapo.tom_soando, tom_formas: comCapo.tom_das_formas, capo, bpm: it.bpm || (arr && arr.bpm) || Number(doc.meta.bpm) || 0,
        contagem: it.contagem, vocalista: it.vocalista || (arr && arr.vocalista) || '', nota_palco: it.nota_palco, bis: !!it.bis, medley: it.medley,
        bloco_id: it.bloco_id, duracao_s: it.duracao_s, estrutura: arr ? arr.estrutura : [], notas_banda: arr ? arr.notas_banda : '',
        notas_privadas: visao.notas_privadas || '', exibicao: { ...pref.exibicao, ...(visao.exibicao || {}) }, rolagem: { ...pref.rolagem, ...(visao.rolagem || {}) },
        documento: comCapo.documento,
      };
    });
    const corpo = { formato: 'musique.pacote', versao: 1, setlist: { id: s0.repertorio.id, nome: s0.repertorio.nome, data: s0.repertorio.data,
      local: s0.repertorio.local, evento: s0.repertorio.evento, banda_id: s0.repertorio.banda_id, versao: s0.repertorio.versao },
      blocos: s0.blocos, instrumento: pref.instrumento, afinacao: pref.afinacao, canhoto: pref.canhoto, musicas, gerado_em: nowISO() };
    const texto = JSON.stringify(corpo);
    const hash = crypto.createHash('sha256').update(texto).digest('hex');
    db.prepare('INSERT INTO pacotes_offline (id, usuario, alvo_tipo, alvo_id, hash, bytes, itens, gerado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(novoId(), usuario, 'setlist', repId, hash, Buffer.byteLength(texto), musicas.length, corpo.gerado_em);
    return { hash, bytes: Buffer.byteLength(texto), pacote: corpo };
  },

  /** O aparelho pergunta: o pacote que eu tenho ainda é o atual? */
  conferirPacote(usuario, repId, hash) {
    const s0 = Setlists.completo(usuario, repId);
    const ultimo = s0.pacote;
    const desatualizados = s0.itens.filter((it) => it.cifra && ultimo && it.cifra.atualizado_em > ultimo.gerado_em).map((it) => it.titulo);
    const setlistMudou = !!(ultimo && s0.repertorio.atualizado_em > ultimo.gerado_em);
    return { valido: !!(ultimo && ultimo.hash === hash) && !desatualizados.length && !setlistMudou,
      hash_atual: ultimo ? ultimo.hash : null, desatualizados, setlist_mudou: setlistMudou };
  },
};

module.exports = { Setlists, STATUS, cifraDoItem };
