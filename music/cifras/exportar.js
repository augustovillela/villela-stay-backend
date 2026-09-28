// =====================================================================
// Musique Cifras — EXPORTAÇÃO e COMPARTILHAMENTO.
//
//   · TXT (acordes em cima), ChordPro e JSON do documento;
//   · PDF formatado (pdf-lib, sem dependência nativa), com acordes em
//     destaque, cabeçalho opcional, notas opcionais e DIAGRAMAS desenhados
//     — setlist inteiro num PDF só, uma música por página;
//   · link com expiração, revogação e contador; QR Code do link;
//   · exportação e exclusão de TODOS os dados da pessoa (LGPD).
//
// A exportação respeita a VISÃO escolhida (tom, instrumento, capo,
// simplificação): o PDF sai como o músico vai tocar.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, transacao, nowISO, novoId, novoToken, j } = require('../db');
const direitos = require('../direitos');
const repertorio = require('../repertorio');
const acesso = require('./acesso');
const D = require('./motor/documento');
const I = require('./motor/instrumentos');
const N = require('./motor/nota');
const { Musicas, Cifras, Arranjos, Visoes, Preferencias, erro } = require('./acervo');
const { Setlists } = require('./setlists');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

/** Aplica a visão pedida (tom/capo/simplificação) ao documento. */
function documentoNaVisao(doc, o = {}) {
  let d = doc;
  let semi = Number(o.semitons) || 0;
  if (o.tom) { const x = D.semitonsAte(d, o.tom); if (x !== null) semi += x; }
  if (semi) d = D.transpor(d, semi, { preferencia: o.grafia || 'auto' });
  if (o.simplificacao) d = D.simplificar(d, o.simplificacao).documento;
  if (o.capo) d = D.comCapotraste(d, o.capo, { preferencia: o.grafia || 'auto' }).documento;
  if (o.estilo && o.estilo !== 'original') d = D.normalizarGrafia(d, o.estilo);
  return d;
}

function cifraVisivel(usuario, cifraId) {
  const c = Cifras.porId(cifraId);
  const v = acesso.podeVerCifra(c, usuario);
  if (!v.pode) throw erro(v.motivo, c ? 403 : 404, { bloqueioDeDireitos: true });
  return c;
}

function registrar(usuario, tipo, id, formato, opcoes) {
  db.prepare('INSERT INTO exportacoes_cifras (id, usuario, alvo_tipo, alvo_id, formato, opcoes, criado_em) VALUES (?,?,?,?,?,?,?)')
    .run(novoId(), usuario, tipo, id, formato, JSON.stringify(opcoes || {}), nowISO());
}

// ---------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------
// Courier é WinAnsi: o que não cabe nele vira equivalente legível, e o
// resto some — pdf-lib LANÇA erro com caractere fora do conjunto, e um
// "♭" não pode derrubar a exportação do setlist inteiro.
const CP1252 = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
function paraWinAnsi(t) {
  return String(t || '').replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[ΔΔ∆]/g, 'maj').replace(/\t/g, '    ')
    .split('').filter((c) => c.charCodeAt(0) <= 0xff || CP1252.has(c)).join('');
}

/** Linhas tipadas para o PDF (acorde em destaque, seção em caixa alta). */
function linhasTipadas(doc, o = {}) {
  const out = [];
  const modo = o.modo || 'letra_cifra';
  doc.secoes.forEach((sec) => {
    if (sec.tipo !== 'sem_secao') out.push({ t: 'secao', x: (sec.rotulo || D.ROTULO_PADRAO[sec.tipo]).toUpperCase() + (sec.repetir > 1 ? ' (' + sec.repetir + 'x)' : '') + (sec.tom ? '  [tom: ' + sec.tom + ']' : '') });
    sec.linhas.forEach((l) => {
      if (l.tipo === 'vazia') out.push({ t: 'vazia', x: '' });
      else if (l.tipo === 'comentario' || l.tipo === 'instrucao') out.push({ t: 'comentario', x: l.texto });
      else if (l.tipo === 'tab') { if (modo !== 'letra') out.push({ t: 'tab', x: l.texto }); }
      else if (l.tipo === 'letra') {
        const r = D.renderizarPar(l.segmentos);
        const so = D.soAcordes(l);
        if (modo !== 'letra' && /\S/.test(r.acordes)) out.push({ t: 'acordes', x: r.acordes });
        if (modo !== 'acordes' && !so && /\S/.test(r.letra)) out.push({ t: 'letra', x: r.letra });
      }
    });
    out.push({ t: 'vazia', x: '' });
  });
  return out;
}

async function desenharMusica(pdfDoc, fontes, { doc, titulo, subtitulo, notas = '', diagramas = null, cabecalho = true, rodape = '' }) {
  const { rgb } = require('pdf-lib');
  const A4 = [595.28, 841.89];
  const M = 42, TAM = 10.5, ALT = TAM * 1.32;
  let pag = pdfDoc.addPage(A4);
  let y = A4[1] - M;
  const novaPag = () => { pag = pdfDoc.addPage(A4); y = A4[1] - M; };
  const escrever = (txt, { fonte = fontes.mono, tam = TAM, cor = rgb(0.12, 0.16, 0.2), x = M } = {}) => {
    pag.drawText(paraWinAnsi(txt), { x, y, size: tam, font: fonte, color: cor });
  };
  if (cabecalho) {
    escrever(titulo || 'Sem título', { fonte: fontes.titulo, tam: 17, cor: rgb(0.106, 0.165, 0.29) }); y -= 21;
    if (subtitulo) { escrever(subtitulo, { fonte: fontes.sans, tam: 10, cor: rgb(0.36, 0.39, 0.47) }); y -= 16; }
    y -= 6;
  }
  if (diagramas && diagramas.length) {
    const cols = Math.floor((A4[0] - 2 * M) / 70);
    diagramas.slice(0, cols * 2).forEach((dg, i) => {
      const cx = M + (i % cols) * 70, cy = y - Math.floor(i / cols) * 92;
      desenharDiagrama(pag, fontes, dg, cx, cy, rgb);
    });
    y -= Math.ceil(Math.min(diagramas.length, cols * 2) / cols) * 92 + 6;
  }
  const linhas = linhasTipadas(doc);
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    // Não separa o acorde da letra de baixo entre páginas.
    const precisa = l.t === 'acordes' && linhas[i + 1] && linhas[i + 1].t === 'letra' ? ALT * 2 : ALT;
    if (y - precisa < M + 14) novaPag();
    if (l.t === 'secao') { y -= 4; escrever(l.x, { fonte: fontes.sansBold, tam: 9.5, cor: rgb(0.106, 0.165, 0.29) }); y -= ALT; continue; }
    if (l.t === 'acordes') escrever(l.x, { fonte: fontes.monoBold, cor: rgb(0.106, 0.165, 0.29) });
    else if (l.t === 'comentario') escrever(l.x, { fonte: fontes.sans, tam: 9.5, cor: rgb(0.36, 0.39, 0.47) });
    else if (l.t !== 'vazia') escrever(l.x);
    y -= l.t === 'vazia' ? ALT * 0.55 : ALT;
  }
  if (notas) {
    if (y < M + 60) novaPag();
    y -= 6; escrever('Notas', { fonte: fontes.sansBold, tam: 9.5 }); y -= ALT;
    String(notas).split('\n').forEach((n) => { if (y < M + 14) novaPag(); escrever(n.slice(0, 95), { fonte: fontes.sans, tam: 9.5 }); y -= ALT; });
  }
  pdfDoc.getPages().forEach((p) => { if (rodape) p.drawText(paraWinAnsi(rodape), { x: M, y: 22, size: 7.5, font: fontes.sans, color: rgb(0.55, 0.58, 0.63) }); });
}

function desenharDiagrama(pag, fontes, dg, x, yTopo, rgb) {
  const cordas = dg.casas.length, larg = 48, alt = 56;
  const esp = larg / (cordas - 1), trastes = 5;
  const base = dg.posicao > 1 ? dg.posicao : 1;
  const cinza = rgb(0.35, 0.38, 0.45), escuro = rgb(0.106, 0.165, 0.29);
  pag.drawText(paraWinAnsi(dg.cifra), { x, y: yTopo, size: 9, font: fontes.sansBold, color: escuro });
  const y0 = yTopo - 14;
  for (let t = 0; t <= trastes; t++) pag.drawLine({ start: { x, y: y0 - t * (alt / trastes) }, end: { x: x + larg, y: y0 - t * (alt / trastes) }, thickness: t === 0 && base === 1 ? 2 : 0.6, color: cinza });
  for (let c = 0; c < cordas; c++) pag.drawLine({ start: { x: x + c * esp, y: y0 }, end: { x: x + c * esp, y: y0 - alt }, thickness: 0.6, color: cinza });
  if (base > 1) pag.drawText(String(base), { x: x + larg + 3, y: y0 - alt / trastes + 2, size: 7, font: fontes.sans, color: cinza });
  dg.casas.forEach((cs, c) => {
    const cx = x + c * esp;
    if (cs < 0) pag.drawText('x', { x: cx - 2, y: y0 + 3, size: 7, font: fontes.sans, color: cinza });
    else if (cs === 0) pag.drawCircle({ x: cx, y: y0 + 5, size: 2.2, borderColor: cinza, borderWidth: 0.7 });
    else {
      const t = cs - base + 1;
      pag.drawCircle({ x: cx, y: y0 - (t - 0.5) * (alt / trastes), size: 3.2, color: escuro });
    }
  });
}

async function carregarFontes(pdfDoc) {
  const { StandardFonts } = require('pdf-lib');
  return {
    mono: await pdfDoc.embedFont(StandardFonts.Courier), monoBold: await pdfDoc.embedFont(StandardFonts.CourierBold),
    sans: await pdfDoc.embedFont(StandardFonts.Helvetica), sansBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    titulo: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
  };
}

function diagramasDe(doc, instrumento, afinacao) {
  const inst = I.INSTRUMENTOS[instrumento];
  if (!inst || inst.tipo !== 'trastes') return [];
  return D.acordesUsados(doc).filter((a) => a.reconhecido).slice(0, 24).map((a) => {
    const f = I.formas(a.acorde, instrumento, { afinacao, quantas: 1, latina: doc.meta.notacao === 'latina' });
    return f.formas[0] ? { cifra: a.acorde, casas: f.formas[0].casas, posicao: f.formas[0].posicao } : null;
  }).filter(Boolean);
}

// ---------------------------------------------------------------------
// Exportações
// ---------------------------------------------------------------------
const Exportar = {
  documentoNaVisao,

  /** Cifra: txt | chordpro | json | pdf. `o` = visão + inclusões. */
  async cifra(usuario, cifraId, formato, o = {}) {
    const c = cifraVisivel(usuario, cifraId);
    const obra = Musicas.porId(c.obra_id);
    const pref = Preferencias.obter(usuario);
    const doc = documentoNaVisao(JSON.parse(c.documento), { grafia: pref.grafia, ...o });
    registrar(usuario, 'cifra', cifraId, formato, o);
    const nome = (obra.titulo || 'cifra').replace(/[^\p{L}\p{N} _-]+/gu, '').slice(0, 60) || 'cifra';
    if (formato === 'txt') return { mime: 'text/plain; charset=utf-8', nome: nome + '.txt', corpo: D.paraTexto(doc, { cabecalho: o.metadados !== false, acordes: o.modo !== 'letra', letra: o.modo !== 'acordes' }) };
    if (formato === 'chordpro') return { mime: 'text/plain; charset=utf-8', nome: nome + '.chopro', corpo: D.paraChordPro(doc) };
    if (formato === 'json') return { mime: 'application/json', nome: nome + '.json', corpo: JSON.stringify({ musica: { titulo: obra.titulo, artista: obra.artista }, documento: doc }, null, 2) };
    if (formato === 'pdf') {
      const { PDFDocument } = require('pdf-lib');
      const pdf = await PDFDocument.create();
      pdf.setTitle(obra.titulo); pdf.setCreator('Musique · por Villela Music'); pdf.setProducer('Musique Cifras');
      const fontes = await carregarFontes(pdf);
      const inst = o.instrumento || pref.instrumento;
      const visao = Visoes.obter(usuario, cifraId, s(o.arranjo_id, 40)) || {};
      await desenharMusica(pdf, fontes, { doc, titulo: obra.titulo,
        subtitulo: [obra.artista, doc.meta.tom ? 'Tom: ' + doc.meta.tom : '', o.capo ? 'Capotraste na ' + o.capo + 'ª casa' : ''].filter(Boolean).join('  ·  '),
        notas: o.notas ? visao.notas_privadas || '' : '', diagramas: o.diagramas ? diagramasDe(doc, inst, o.afinacao || pref.afinacao) : null,
        cabecalho: o.metadados !== false, rodape: 'Musique · por Villela Music — exportado em ' + nowISO().slice(0, 10) });
      return { mime: 'application/pdf', nome: nome + '.pdf', corpo: Buffer.from(await pdf.save()) };
    }
    throw erro('Formato de exportação desconhecido.');
  },

  /** Setlist inteiro: pdf (uma música por página) | txt | json (pacote). */
  async setlist(usuario, repId, formato, o = {}) {
    const p = Setlists.pacote(usuario, repId);
    registrar(usuario, 'setlist', repId, formato, o);
    const nome = (p.pacote.setlist.nome || 'setlist').replace(/[^\p{L}\p{N} _-]+/gu, '').slice(0, 60);
    if (formato === 'json') return { mime: 'application/json', nome: nome + '.musique.json', corpo: JSON.stringify(p.pacote) };
    if (formato === 'txt') {
      const partes = p.pacote.musicas.map((m, i) => (i + 1) + '. ' + m.titulo + (m.tom_soando ? ' (' + m.tom_soando + ')' : '') + '\n\n' + (m.documento ? D.paraTexto(m.documento, { cabecalho: false }) : m.intervalo ? '[intervalo]' : '[sem cifra]'));
      return { mime: 'text/plain; charset=utf-8', nome: nome + '.txt', corpo: p.pacote.setlist.nome + '\n\n' + partes.join('\n\n----------\n\n') };
    }
    if (formato !== 'pdf') throw erro('Formato de exportação desconhecido.');
    const { PDFDocument, rgb } = require('pdf-lib');
    const pdf = await PDFDocument.create();
    pdf.setTitle(p.pacote.setlist.nome); pdf.setCreator('Musique · por Villela Music');
    const fontes = await carregarFontes(pdf);
    // Índice
    const capa = pdf.addPage([595.28, 841.89]);
    let y = 800;
    capa.drawText(paraWinAnsi(p.pacote.setlist.nome), { x: 42, y, size: 20, font: fontes.titulo, color: rgb(0.106, 0.165, 0.29) }); y -= 24;
    capa.drawText(paraWinAnsi([p.pacote.setlist.evento, p.pacote.setlist.local, p.pacote.setlist.data].filter(Boolean).join(' · ')), { x: 42, y, size: 10, font: fontes.sans }); y -= 30;
    p.pacote.musicas.forEach((m, i) => {
      if (y < 60) return;
      capa.drawText(paraWinAnsi((i + 1) + '. ' + m.titulo + (m.intervalo ? '' : m.tom_soando ? '   ' + m.tom_soando + (m.capo ? ' (capo ' + m.capo + ')' : '') : '') + (m.bis ? '   [bis]' : '')), { x: 42, y, size: 11, font: m.intervalo ? fontes.sans : fontes.mono });
      y -= 17;
    });
    for (const m of p.pacote.musicas) {
      if (!m.documento) continue;
      await desenharMusica(pdf, fontes, { doc: m.documento, titulo: m.titulo,
        subtitulo: ['Tom: ' + (m.tom_soando || '-'), m.capo ? 'capo ' + m.capo : '', m.bpm ? m.bpm + ' bpm' : '', m.vocalista ? 'voz: ' + m.vocalista : ''].filter(Boolean).join('  ·  '),
        notas: [m.nota_palco, o.notas ? m.notas_privadas : ''].filter(Boolean).join('\n'),
        diagramas: o.diagramas ? diagramasDe(m.documento, p.pacote.instrumento, p.pacote.afinacao) : null });
    }
    return { mime: 'application/pdf', nome: nome + '.pdf', corpo: Buffer.from(await pdf.save()) };
  },

  // -------------------------- links --------------------------
  criarLink(usuario, { alvo_tipo, alvo_id, dias = 30, opcoes = {} }) {
    if (alvo_tipo === 'cifra') {
      const c = cifraVisivel(usuario, alvo_id);
      const obra = Musicas.porId(c.obra_id);
      if (obra.dono !== usuario && !acesso.podeEditarCifra(c, usuario)) throw erro('Só quem guarda ou edita a música cria link.', 403);
      const v = direitos.podeCompartilharPorLink(obra);
      if (!v.pode) throw erro(v.motivo, 403, { bloqueioDeDireitos: true });
    } else if (alvo_tipo === 'setlist') {
      const rep = repertorio.Repertorios.porId(alvo_id);
      if (!repertorio.Repertorios.podeEditar(rep, usuario).pode) throw erro('Sem permissão para compartilhar este setlist.', 403);
    } else throw erro('Tipo de link inválido.');
    const token = novoToken();
    const expira = new Date(Date.now() + Math.max(1, Math.min(365, Number(dias) || 30)) * 864e5).toISOString();
    const op = { instrumento: s(opcoes.instrumento, 20), tom: s(opcoes.tom, 10), capo: Math.max(0, Math.min(11, Number(opcoes.capo) || 0)),
      notas: !!opcoes.notas, diagramas: opcoes.diagramas !== false, metadados: opcoes.metadados !== false, modo: s(opcoes.modo, 20) };
    const id = novoId();
    db.prepare(`INSERT INTO links_cifras (id, token_hash, alvo_tipo, alvo_id, criado_por, opcoes, expira_em, criado_em) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, hash(token), alvo_tipo, alvo_id, usuario, JSON.stringify(op), expira, nowISO());
    direitos.registrar({ ator: usuario, acao: 'link.criado', alvo: alvo_id, detalhe: { tipo: alvo_tipo, expira } });
    return { id, token, url: '/music/c/' + token, expira_em: expira, opcoes: op };
  },

  links(usuario, alvo_tipo, alvo_id) {
    return db.prepare('SELECT id, alvo_tipo, alvo_id, opcoes, expira_em, revogado_em, acessos, criado_em FROM links_cifras WHERE criado_por = ? AND alvo_tipo = ? AND alvo_id = ? ORDER BY criado_em DESC')
      .all(usuario, alvo_tipo, alvo_id).map((l) => ({ ...l, opcoes: j.parse(l.opcoes, {}), ativo: !l.revogado_em && l.expira_em > nowISO() }));
  },

  revogarLink(usuario, id) {
    const l = db.prepare('SELECT * FROM links_cifras WHERE id = ?').get(id);
    if (!l || l.criado_por !== usuario) throw erro('Link não encontrado.', 404);
    db.prepare('UPDATE links_cifras SET revogado_em = ? WHERE id = ?').run(nowISO(), id);
    direitos.registrar({ ator: usuario, acao: 'link.revogado', alvo: l.alvo_id });
    return true;
  },

  /**
   * Abre um link. A política é conferida DE NOVO na abertura: se a obra
   * virou de terceiro, ou a política foi desligada depois de criado o
   * link, ele deixa de abrir — link é permissão viva, não fotografia.
   */
  abrirLink(token) {
    const l = db.prepare('SELECT * FROM links_cifras WHERE token_hash = ?').get(hash(String(token || '')));
    if (!l || l.revogado_em || l.expira_em < nowISO()) throw erro('Link inválido, expirado ou revogado.', 404);
    const op = j.parse(l.opcoes, {});
    db.prepare('UPDATE links_cifras SET acessos = acessos + 1 WHERE id = ?').run(l.id);
    if (l.alvo_tipo === 'cifra') {
      const c = Cifras.porId(l.alvo_id);
      const obra = c ? Musicas.porId(c.obra_id) : null;
      if (!c || c.removido_em || !obra || obra.removido_em) throw erro('Esta cifra não está mais disponível.', 410);
      const v = direitos.podeCompartilharPorLink(obra);
      if (!v.pode) throw erro('Este link não pode mais ser aberto.', 403);
      const doc = documentoNaVisao(JSON.parse(c.documento), op);
      return { tipo: 'cifra', titulo: obra.titulo, artista: op.metadados ? obra.artista : '', opcoes: op, documento: doc,
        diagramas: op.diagramas && op.instrumento ? diagramasDe(doc, op.instrumento, 'padrao') : [] };
    }
    const rep = repertorio.Repertorios.porId(l.alvo_id);
    if (!rep) throw erro('Este setlist não existe mais.', 410);
    const itens = db.prepare('SELECT * FROM repertorio_itens WHERE repertorio_id = ? ORDER BY ordem').all(rep.id).map((it) => {
      const obra = it.obra_id ? Musicas.porId(it.obra_id) : null;
      const ok = obra ? direitos.podeCompartilharPorLink(obra).pode && !obra.removido_em : true;
      return { titulo: obra ? obra.titulo : it.titulo_livre, tom: it.tom_execucao, bis: !!it.bis, intervalo: !!it.intervalo, compartilhavel: ok };
    });
    return { tipo: 'setlist', titulo: rep.nome, data: rep.data, evento: rep.evento, local: rep.local, itens, opcoes: op };
  },

  async qr(texto) {
    const QR = require('qrcode');
    return QR.toString(String(texto || '').slice(0, 500), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  },

  // -------------------------- LGPD --------------------------
  /** Tudo o que a pessoa criou no módulo de cifras, em JSON. */
  tudo(usuario) {
    const obras = db.prepare('SELECT * FROM obras WHERE dono = ?').all(usuario);
    const ids = obras.map((o) => o.id);
    const ph = ids.map(() => '?').join(',') || "''";
    const cifras = ids.length ? db.prepare(`SELECT * FROM cifras WHERE obra_id IN (${ph})`).all(...ids) : [];
    const cids = cifras.map((c) => c.id);
    const cph = cids.map(() => '?').join(',') || "''";
    return {
      gerado_em: nowISO(), formato: 'musique.backup', versao: 1,
      musicas: obras.map((o) => ({ ...o, tags: j.parse(o.tags, []) })),
      cifras: cifras.map((c) => ({ ...c, documento: JSON.parse(c.documento) })),
      revisoes: cids.length ? db.prepare(`SELECT * FROM cifra_revisoes WHERE cifra_id IN (${cph})`).all(...cids).map((r) => ({ ...r, documento: JSON.parse(r.documento) })) : [],
      arranjos: db.prepare('SELECT * FROM cifra_arranjos WHERE criado_por = ?').all(usuario),
      visoes: db.prepare('SELECT * FROM cifra_visoes WHERE usuario = ?').all(usuario),
      preferencias: Preferencias.obter(usuario),
      voicings: db.prepare('SELECT * FROM voicings_usuario WHERE usuario = ?').all(usuario),
      favoritos: db.prepare('SELECT * FROM favoritos WHERE usuario = ?').all(usuario),
      comentarios: db.prepare('SELECT * FROM comentarios WHERE autor = ?').all(usuario),
      setlists: db.prepare('SELECT * FROM repertorios WHERE dono = ?').all(usuario).map((r) => ({ ...r,
        itens: db.prepare('SELECT * FROM repertorio_itens WHERE repertorio_id = ?').all(r.id),
        blocos: db.prepare('SELECT * FROM repertorio_blocos WHERE repertorio_id = ?').all(r.id) })),
      pratica: db.prepare('SELECT * FROM pratica_cifras WHERE usuario = ?').all(usuario),
      importacoes: db.prepare('SELECT id, tipo_entrada, entrada_resumo, status, criado_em FROM importacoes WHERE usuario = ?').all(usuario),
    };
  },

  /**
   * Exclui DE VERDADE o que é da pessoa no módulo de cifras (LGPD). Exige
   * a frase de confirmação. Bandas de que ela é proprietária precisam ser
   * transferidas antes — excluir a pessoa não pode apagar o trabalho dos
   * outros integrantes.
   */
  excluirTudo(usuario, confirmacao) {
    if (confirmacao !== 'EXCLUIR MINHAS CIFRAS') throw erro('Digite exatamente: EXCLUIR MINHAS CIFRAS');
    const donas = acesso.bandasDe(usuario).filter((b) => b.papel === 'proprietario');
    if (donas.length) throw erro('Você é proprietário de ' + donas.length + ' banda(s). Transfira ou exclua antes.', 409);
    const obras = db.prepare('SELECT id FROM obras WHERE dono = ?').all(usuario).map((o) => o.id);
    transacao(() => {
      obras.forEach((oid) => {
        const cids = db.prepare('SELECT id FROM cifras WHERE obra_id = ?').all(oid).map((c) => c.id);
        cids.forEach((cid) => {
          ['cifra_revisoes', 'cifra_rascunhos'].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE cifra_id = ?`).run(cid));
          db.prepare('DELETE FROM cifra_arranjos WHERE cifra_id = ?').run(cid);
          db.prepare('DELETE FROM cifra_visoes WHERE cifra_id = ?').run(cid);
          db.prepare('DELETE FROM avaliacoes_cifra WHERE cifra_id = ?').run(cid);
          db.prepare('DELETE FROM propostas_correcao WHERE cifra_id = ?').run(cid);
          db.prepare("DELETE FROM links_cifras WHERE alvo_tipo = 'cifra' AND alvo_id = ?").run(cid);
          db.prepare('DELETE FROM uso_cifras WHERE cifra_id = ?').run(cid);
        });
        db.prepare('DELETE FROM cifras WHERE obra_id = ?').run(oid);
        ['banda_obras', 'obra_midias', 'obra_aliases', 'obra_creditos', 'cifra_fontes'].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE obra_id = ?`).run(oid));
        try { db.prepare('DELETE FROM busca_cifras WHERE obra_id = ?').run(oid); } catch (_) { /* sem FTS */ }
        // A obra e o que a Fase 2 pendurou nela (arranjos, partituras,
        // anotações, titularidade) — na ordem que as chaves estrangeiras pedem.
        const arrs = db.prepare('SELECT id FROM arranjos WHERE obra_id = ?').all(oid).map((a) => a.id);
        arrs.forEach((aid) => { db.prepare('DELETE FROM anotacoes WHERE arranjo_id = ?').run(aid); db.prepare('DELETE FROM partituras WHERE arranjo_id = ?').run(aid); });
        db.prepare('DELETE FROM arranjos WHERE obra_id = ?').run(oid);
        db.prepare('DELETE FROM titularidades WHERE obra_id = ?').run(oid);
        db.prepare("UPDATE repertorio_itens SET obra_id = '', cifra_id = '', titulo_livre = '[música excluída]' WHERE obra_id = ?").run(oid);
        db.prepare('DELETE FROM obras WHERE id = ?').run(oid);
      });
      ['cifra_visoes', 'preferencias_musicais', 'voicings_usuario', 'favoritos', 'uso_cifras', 'pratica_cifras', 'notificacoes_musica', 'pacotes_offline']
        .forEach((t) => db.prepare(`DELETE FROM ${t} WHERE usuario = ?`).run(usuario));
      db.prepare("UPDATE comentarios SET texto = '[removido a pedido do autor]', removido_em = ? WHERE autor = ?").run(nowISO(), usuario);
      db.prepare('DELETE FROM importacao_candidatos WHERE importacao_id IN (SELECT id FROM importacoes WHERE usuario = ?)').run(usuario);
      db.prepare('DELETE FROM importacoes WHERE usuario = ?').run(usuario);
      db.prepare('DELETE FROM banda_membros WHERE usuario = ?').run(usuario);
    });
    direitos.registrar({ ator: usuario, acao: 'cifras.dados_excluidos', alvo: usuario, detalhe: { musicas: obras.length } });
    return { musicas_excluidas: obras.length };
  },
};

module.exports = { Exportar, documentoNaVisao, linhasTipadas, paraWinAnsi, diagramasDe };
