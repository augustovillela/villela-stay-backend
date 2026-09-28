// =====================================================================
// Musique Cifras — "ENCONTRAR OU IMPORTAR CIFRA": o pipeline.
//
//   1 identificar a entrada · 2 obter o conteúdo · 3 extrair metadados ·
//   4 detectar letra, acordes e estrutura · 5 normalizar os acordes ·
//   6 estimar tom e dificuldade · 7 apontar trechos ambíguos ·
//   8 PRÉVIA (nada é salvo antes) · 9 correção pelo músico ·
//   10 duplicata · 11 salvar como música, versão ou mescla ·
//   12 registrar fonte, data, método e confiança.
//
// Texto, ChordPro, TXT, DOCX e PDF com texto são processados NA HORA
// (milissegundos). URL, busca externa e leitura por IA viram TAREFA
// assíncrona (`importacoes`), com tempo máximo, novas tentativas para
// erro de rede e estado visível — o cliente acompanha e nunca fica
// olhando para uma tela parada.
//
// Nenhuma fonte que falha derruba a busca: cada candidato traz o próprio
// erro, nomeado.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('../../db');
const repo = require('../../repo');
const direitos = require('../../direitos');
const flags = require('../flags');
const ia = require('../ia');
const D = require('../motor/documento');
const H = require('../motor/harmonia');
const I = require('../motor/instrumentos');
const N = require('../motor/nota');
const rede = require('./rede');
const ext = require('./extratores');
const fontes = require('./fontes-externas');
const { Musicas, Cifras, qualidade, semelhanca, erro, normalizar } = require('../acervo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const MAX_TEXTO = 400000;
const MAX_ARQUIVO = 8 * 1024 * 1024;
const TEMPO_TAREFA_MS = 45000;
let rodando = 0;
const MAX_SIMULTANEAS = 3;
let transporteTeste = null;              // injetado pelo selftest

function log(evento, dados) {
  // Log estruturado SEM dado pessoal: tipo, estado, tempo, fonte.
  try { console.log(JSON.stringify({ m: 'music.cifras.import', evento, ...dados })); } catch (_) { /* log não derruba import */ }
}

// ---------------------------------------------------------------------
// Prévia: texto → documento + tudo que o músico precisa para revisar
// ---------------------------------------------------------------------
function pareceChordPro(t) {
  const x = String(t || '');
  if (/^\s*\{\s*(title|t|artist|key|start_of_\w+|soc|sov|sob|c|comment|ci)\s*[:}]/im.test(x)) return true;
  const inline = (x.match(/\[[A-G][^\]\n]{0,12}\]/g) || []).length;
  const linhas = x.split('\n').filter((l) => l.trim()).length;
  return inline >= 3 && inline >= linhas * 0.3;
}

function estimarDificuldade(doc) {
  const acs = D.acordesUsados(doc).filter((a) => a.reconhecido);
  if (!acs.length) return { nivel: '', confianca: 0 };
  let dificeis = 0;
  acs.forEach((a) => {
    const f = I.formas(a.acorde, 'violao', { quantas: 1 });
    if (!f.formas.length || f.formas[0].nivel !== 'fácil') dificeis++;
  });
  const r = dificeis / acs.length;
  const nivel = acs.length <= 5 && r <= 0.2 ? 'iniciante' : (r <= 0.5 && acs.length <= 12 ? 'intermediario' : 'avancado');
  return { nivel, confianca: 0.6, motivo: `${acs.length} acordes distintos, ${dificeis} com pestana ou posição (no violão).` };
}

/**
 * Monta a prévia a partir de TEXTO. `dica` traz o que a fonte já sabia
 * (título, artista, tom). Nada aqui grava cifra.
 */
function previa(usuario, texto, { dica = {}, fonte = {}, confiancaBase = 1 } = {}) {
  const bruto = String(texto || '').slice(0, MAX_TEXTO);
  if (!bruto.trim()) throw erro('Não há texto para importar.');
  let doc, ambig = [], conf = 1, formato;
  if (pareceChordPro(bruto)) { doc = D.deChordPro(bruto); formato = 'chordpro'; }
  else { const r = D.deTexto(bruto); doc = r.documento; ambig = r.ambiguidades; conf = r.confianca; formato = 'texto'; }
  ['titulo', 'artista', 'tom', 'compositor'].forEach((k) => { if (!doc.meta[k] && dica[k]) doc.meta[k] = s(dica[k], 200); });
  const leitura = { latina: doc.meta.notacao === 'latina' };
  const tons = H.detectarTom(D.acordesEmOrdem(doc), leitura);
  const tomSugerido = !doc.meta.tom && tons[0] ? tons[0] : null;
  const confianca = Math.round(Math.min(1, conf * Math.max(0.1, confiancaBase)) * 100) / 100;
  const q = qualidade(doc, { confianca });
  return {
    formato, documento: doc, confianca, ambiguidades: ambig,
    nao_reconhecidos: D.acordesNaoReconhecidos(doc).map((a) => a.acorde),
    tons, tom_sugerido: tomSugerido,
    dificuldade: estimarDificuldade(doc),
    duracao_estimada_s: D.duracaoEstimada(doc),
    qualidade: q,
    duplicatas: doc.meta.titulo ? Musicas.duplicatas(usuario, doc.meta.titulo, doc.meta.artista) : [],
    texto_original: bruto.slice(0, 60000),
    texto_normalizado: D.paraTexto(doc, { cabecalho: false }),
    fonte,
  };
}

// ---------------------------------------------------------------------
// Tarefas
// ---------------------------------------------------------------------
function criarTarefa(usuario, tipo, resumo, { lote = '' } = {}) {
  const id = novoId();
  db.prepare(`INSERT INTO importacoes (id, usuario, lote_id, tipo_entrada, entrada_resumo, status, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,'pendente',?,?)`).run(id, usuario, lote, tipo, s(resumo, 300), nowISO(), nowISO());
  return id;
}
function concluir(id, resultado, { confianca = 0 } = {}) {
  db.prepare("UPDATE importacoes SET status = 'pronta', progresso = 100, resultado = ?, confianca = ?, erro = '', atualizado_em = ? WHERE id = ?")
    .run(JSON.stringify(resultado), confianca, nowISO(), id);
}
function falhar(id, e) {
  db.prepare("UPDATE importacoes SET status = 'falhou', erro = ?, atualizado_em = ? WHERE id = ?").run(s(e && e.message, 400), nowISO(), id);
}
function progresso(id, p) { db.prepare("UPDATE importacoes SET status = 'processando', progresso = ?, atualizado_em = ? WHERE id = ?").run(p, nowISO(), id); }

/**
 * Roda o trabalho da tarefa em segundo plano, com tempo máximo e novas
 * tentativas (só para erro de rede — erro permanente não se repete).
 * Devolve a Promise, para o teste poder esperar.
 */
function rodarEmSegundoPlano(id, trabalho) {
  const inicio = Date.now();
  const tentar = async (n) => {
    db.prepare('UPDATE importacoes SET tentativas = ? WHERE id = ?').run(n, id);
    try {
      return await Promise.race([trabalho(), new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('A importação demorou demais.'), { tempo: true })), TEMPO_TAREFA_MS))]);
    } catch (e) {
      // 4xx é recusa (desligado, cota, permissão): repetir não muda nada.
      if (!e.permanente && !e.tempo && !(e.status >= 400 && e.status < 500) && n < 3) { await new Promise((r) => setTimeout(r, n * 800)); return tentar(n + 1); }
      throw e;
    }
  };
  const executar = async () => {
    rodando++;
    progresso(id, 5);
    try {
      const r = await tentar(1);
      concluir(id, r, { confianca: r.confianca || 0 });
      log('pronta', { id, ms: Date.now() - inicio });
    } catch (e) {
      falhar(id, e);
      log('falhou', { id, ms: Date.now() - inicio, codigo: e.codigo || '', erro: s(e.message, 120) });
    } finally { rodando--; }
  };
  // Poucas ao mesmo tempo: o processo web é compartilhado por 15 produtos.
  const esperarVez = () => (rodando < MAX_SIMULTANEAS ? executar() : new Promise((r) => setTimeout(r, 300)).then(esperarVez));
  return esperarVez();
}

/** Tarefa presa em "processando" por deploy/reinício vira falha visível. */
function recuperarPresas() {
  const limite = new Date(Date.now() - 3 * 60000).toISOString();
  return db.prepare("UPDATE importacoes SET status = 'falhou', erro = 'Interrompida (o servidor reiniciou). Tente de novo.', atualizado_em = ? WHERE status IN ('pendente','processando') AND atualizado_em < ?")
    .run(nowISO(), limite).changes;
}

// ---------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------
const Importar = {
  _transporte: (fn) => { transporteTeste = fn; },

  /** Texto colado ou ChordPro: prévia imediata, registrada como tarefa pronta. */
  texto(usuario, { texto, titulo = '', artista = '' } = {}) {
    flags.exigir('cifras.importar.texto');
    const id = criarTarefa(usuario, pareceChordPro(texto) ? 'chordpro' : 'texto', s(titulo || String(texto).split('\n')[0], 120));
    try {
      const p = previa(usuario, texto, { dica: { titulo, artista }, fonte: { tipo: 'texto', metodo: 'colado' } });
      concluir(id, p, { confianca: p.confianca });
      return Importar.obter(usuario, id);
    } catch (e) { falhar(id, e); throw e; }
  },

  /** Arquivo (base64). TXT/ChordPro/DOCX/PDF na hora; imagem e PDF escaneado por IA. */
  async arquivo(usuario, { nome = '', base64 = '', lote = '' } = {}) {
    flags.exigir('cifras.importar.texto');
    const buf = Buffer.from(String(base64 || ''), 'base64');
    if (!buf.length) throw erro('Arquivo vazio.');
    if (buf.length > MAX_ARQUIVO) throw erro('Arquivo acima de 8 MB.');
    const tp = ext.tipoDeArquivo(nome, buf);
    if (tp.tipo === 'recusado') throw erro(tp.motivo, 415);
    const id = criarTarefa(usuario, tp.tipo === 'imagem' ? 'imagem' : 'arquivo', s(nome, 120), { lote });
    const fonte = { tipo: 'arquivo', metodo: tp.tipo, nome: s(nome, 120) };
    const viaIA = async (mime) => {
      if (!flags.ligada('cifras.importar.imagem_ia')) throw Object.assign(erro('A leitura de imagem por IA está desligada.', 403), { permanente: true });
      const r = await ia.executar(usuario, 'cifra.ler_imagem', { arquivo: { mime, base64: buf.toString('base64') }, nome: s(nome, 120) });
      const d = r.dados || {};
      const p = previa(usuario, d.texto || '', { dica: d, fonte: { ...fonte, metodo: 'ia.ler_imagem' }, confiancaBase: Math.max(0.1, Math.min(1, Number(d.confianca) || 0.5)) });
      p.observacoes_ia = s(d.observacoes, 1000);
      p.ambiguidades.unshift({ linha: 0, texto: '', motivo: 'Lido por IA a partir de imagem: confira acorde por acorde.' });
      return p;
    };
    try {
      if (tp.tipo === 'imagem') {
        rodarEmSegundoPlano(id, () => viaIA(tp.mime));
        return Importar.obter(usuario, id);
      }
      let r;
      if (tp.tipo === 'pdf') {
        try { r = await ext.dePdf(buf); }
        catch (e) {
          if (!e.ocrPendente) throw e;
          rodarEmSegundoPlano(id, () => viaIA('application/pdf'));
          return Importar.obter(usuario, id);
        }
      } else if (tp.tipo === 'docx') r = ext.deDocx(buf);
      else r = ext.deTxt(buf);
      const p = previa(usuario, r.texto, { fonte: { ...fonte, metodo: r.metodo }, confiancaBase: r.confianca });
      concluir(id, p, { confianca: p.confianca });
      return Importar.obter(usuario, id);
    } catch (e) { falhar(id, e); throw e; }
  },

  /** URL de página pública: tarefa assíncrona com todas as travas de rede. */
  url(usuario, { url, lote = '' } = {}) {
    flags.exigir('cifras.importar.url');
    const u = rede.validarUrl(url);                 // recusa ANTES de criar tarefa
    const id = criarTarefa(usuario, 'url', u.host + u.pathname + u.search, { lote });
    const adaptador = fontes.paraUrl(u.toString());
    const promessa = rodarEmSegundoPlano(id, async () => {
      progresso(id, 20);
      const r = await rede.obter(u.toString(), { transporte: transporteTeste });
      progresso(id, 70);
      const x = adaptador.extrair(r.texto, r.url);
      if (!x.texto || !x.texto.trim()) throw Object.assign(new Error('Não encontrei uma cifra nesta página.'), { permanente: true });
      return previa(usuario, x.texto, { dica: x, fonte: { tipo: 'url', url: r.url, adaptador: adaptador.id, metodo: x.metodo },
        confiancaBase: x.confianca * (adaptador.confiabilidade + 0.2) });
    });
    const res = Importar.obter(usuario, id);
    res._promessa = promessa;
    return res;
  },

  /**
   * "Encontrar": busca no acervo (na hora) e nas fontes externas (tarefa).
   * Os candidatos externos voltam ranqueados por qualidade, completude,
   * semelhança e confiabilidade da fonte.
   */
  buscar(usuario, { q = '', titulo = '', artista = '' } = {}) {
    const termo = s(q || [titulo, artista].filter(Boolean).join(' '), 200);
    if (!termo) throw erro('Diga o nome da música (e, se souber, o artista).');
    const internos = Musicas.buscar(usuario, { q: termo, limite: 10 }).itens;
    let tarefa = null;
    const tit = s(titulo, 200) || s(q.split(/\s+[-–—]\s+/)[0], 200);
    const art = s(artista, 200) || s((q.split(/\s+[-–—]\s+/)[1] || ''), 200);
    if (flags.ligada('cifras.importar.busca_externa') && tit && art) {
      const id = criarTarefa(usuario, 'busca', tit + ' — ' + art);
      const promessa = rodarEmSegundoPlano(id, async () => {
        const cands = [];
        const falhas = [];
        await Promise.all(fontes.ADAPTADORES.map(async (a) => {
          for (const c of a.candidatos({ titulo: tit, artista: art })) {
            try {
              const r = await rede.obter(c.url, { transporte: transporteTeste });
              const x = a.extrair(r.texto, r.url);
              if (!x.texto || !x.texto.trim()) { falhas.push({ fonte: a.nome, erro: 'sem cifra na página' }); continue; }
              const p = previa(usuario, x.texto, { dica: { titulo: x.titulo || tit, artista: x.artista || art, tom: x.tom },
                fonte: { tipo: 'busca', url: r.url, adaptador: a.id, metodo: x.metodo }, confiancaBase: x.confianca });
              const sim = semelhanca(p.documento.meta.titulo || '', tit) * 0.6 + semelhanca(p.documento.meta.artista || art, art) * 0.4;
              const score = Math.round(p.qualidade.nota * 0.5 + sim * 25 + a.confiabilidade * 15 + p.confianca * 10);
              cands.push({ id: novoId(), fonte: a.nome, adaptador: a.id, url: r.url, previa: p, ranking: { score, semelhanca: Math.round(sim * 100) / 100,
                qualidade: p.qualidade.nota, confiabilidade: a.confiabilidade, confianca: p.confianca } });
            } catch (e) { falhas.push({ fonte: a.nome, erro: s(e.message, 160), codigo: e.codigo || '' }); }
          }
        }));
        cands.sort((x, y) => y.ranking.score - x.ranking.score);
        cands.forEach((c) => db.prepare(`INSERT INTO importacao_candidatos (id, importacao_id, fonte, url, titulo, artista, documento, qualidade, confianca, ranking, criado_em)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(c.id, id, c.adaptador, c.url, s(c.previa.documento.meta.titulo, 200), s(c.previa.documento.meta.artista, 200),
          JSON.stringify(c.previa.documento), c.ranking.qualidade, c.previa.confianca, JSON.stringify(c.ranking), nowISO()));
        return { candidatos: cands, falhas, confianca: cands[0] ? cands[0].previa.confianca : 0 };
      });
      tarefa = Importar.obter(usuario, id);
      tarefa._promessa = promessa;
    }
    return { internos, tarefa, busca_externa: flags.ligada('cifras.importar.busca_externa'),
      precisa_artista: !(tit && art) };
  },

  /** Vários textos/arquivos/URLs de uma vez. Cada um vira tarefa do lote. */
  async lote(usuario, { itens = [] } = {}) {
    if (!Array.isArray(itens) || !itens.length) throw erro('O lote está vazio.');
    if (itens.length > 50) throw erro('No máximo 50 itens por lote.');
    const loteId = novoId();
    const resultado = [];
    for (const it of itens) {
      try {
        if (it.url) resultado.push(Importar.url(usuario, { url: it.url, lote: loteId }).importacao);
        else if (it.base64) resultado.push((await Importar.arquivo(usuario, { nome: it.nome, base64: it.base64, lote: loteId })).importacao);
        else if (it.texto) {
          const r = Importar.texto(usuario, { texto: it.texto, titulo: it.titulo, artista: it.artista });
          db.prepare('UPDATE importacoes SET lote_id = ? WHERE id = ?').run(loteId, r.importacao.id);
          resultado.push(r.importacao);
        }
      } catch (e) { resultado.push({ erro: s(e.message, 200), item: s(it.nome || it.url || (it.texto || '').slice(0, 40), 120) }); }
    }
    return { lote_id: loteId, itens: resultado };
  },

  obter(usuario, id) {
    const t = db.prepare('SELECT * FROM importacoes WHERE id = ?').get(id);
    if (!t || t.usuario !== usuario) throw erro('Importação não encontrada.', 404);
    const cands = db.prepare('SELECT id, fonte, url, titulo, artista, qualidade, confianca, ranking FROM importacao_candidatos WHERE importacao_id = ? ORDER BY qualidade DESC')
      .all(id).map((c) => ({ ...c, ranking: j.parse(c.ranking, {}) }));
    const resultado = j.parse(t.resultado, {});
    return { importacao: { id: t.id, status: t.status, progresso: t.progresso, erro: t.erro, tipo: t.tipo_entrada, resumo: t.entrada_resumo,
      confianca: t.confianca, tentativas: t.tentativas, lote_id: t.lote_id, obra_id: t.obra_id, cifra_id: t.cifra_id,
      criado_em: t.criado_em, atualizado_em: t.atualizado_em }, resultado, candidatos: cands };
  },

  listar(usuario, { limite = 30 } = {}) {
    recuperarPresas();
    return db.prepare('SELECT id, status, progresso, erro, tipo_entrada, entrada_resumo, confianca, obra_id, cifra_id, criado_em FROM importacoes WHERE usuario = ? ORDER BY criado_em DESC LIMIT ?')
      .all(usuario, Math.min(100, Number(limite) || 30));
  },

  /** A prévia de um candidato da busca externa (para abrir/comparar). */
  candidato(usuario, importacaoId, candId) {
    Importar.obter(usuario, importacaoId);
    const c = db.prepare('SELECT * FROM importacao_candidatos WHERE id = ? AND importacao_id = ?').get(candId, importacaoId);
    if (!c) throw erro('Candidato não encontrado.', 404);
    const doc = JSON.parse(c.documento);
    return { id: c.id, fonte: c.fonte, url: c.url, documento: doc, ranking: j.parse(c.ranking, {}),
      nao_reconhecidos: D.acordesNaoReconhecidos(doc).map((a) => a.acorde), texto: D.paraTexto(doc, { cabecalho: false }) };
  },

  /** Compara candidatos entre si: o primeiro é a base. */
  comparar(usuario, importacaoId, ids) {
    const docs = (ids || []).slice(0, 5).map((cid) => Importar.candidato(usuario, importacaoId, cid));
    if (docs.length < 2) throw erro('Escolha ao menos duas versões para comparar.');
    return { base: docs[0].id, comparacoes: docs.slice(1).map((d) => ({ com: d.id, fonte: d.fonte, diff: D.diff(docs[0].documento, d.documento, { soMudancas: true }) })) };
  },

  /** "Criar melhor versão": fusão assistida — PRÉVIA, nunca salva sozinha. */
  melhorVersao(usuario, importacaoId, ids) {
    const docs = (ids || []).slice(0, 5).map((cid) => Importar.candidato(usuario, importacaoId, cid));
    if (docs.length < 2) throw erro('Escolha ao menos duas versões.');
    const m = D.mesclar(docs[0].documento, docs.slice(1).map((d) => d.documento));
    return { ...m, texto: D.paraTexto(m.documento, { cabecalho: false }), aviso: 'Prévia da fusão: revise as divergências antes de salvar.' };
  },

  /**
   * Salva. `destino`: 'nova_musica' (padrão) | 'nova_versao' (em obra_id)
   * | 'mesclar' (preenche o que falta em obra_id e cria a versão).
   * O documento pode vir CORRIGIDO pelo músico; senão, o da prévia.
   */
  salvar(usuario, importacaoId, d = {}) {
    const t = db.prepare('SELECT * FROM importacoes WHERE id = ?').get(importacaoId);
    if (!t || t.usuario !== usuario) throw erro('Importação não encontrada.', 404);
    if (t.status === 'salva') throw erro('Esta importação já foi salva.', 409, { obra_id: t.obra_id, cifra_id: t.cifra_id });
    const r = j.parse(t.resultado, {});
    let doc = d.documento || null;
    let fonte = r.fonte || {};
    let conf = r.confianca || t.confianca || 0;
    let original = r.texto_original || '';
    if (!doc && d.candidato_id) {
      const c = Importar.candidato(usuario, importacaoId, d.candidato_id);
      doc = c.documento; fonte = { tipo: 'busca', url: c.url, adaptador: c.fonte, metodo: 'busca' }; conf = c.ranking.confianca || conf;
      original = c.texto;
    }
    if (!doc && d.texto) { const p = previa(usuario, d.texto, { fonte }); doc = p.documento; }
    if (!doc) doc = r.documento;
    if (!doc) throw erro('Não há cifra para salvar.');
    const v = D.validar(doc);
    if (!v.ok) throw erro('Cifra inválida: ' + v.erros.slice(0, 2).join(' '), 422);
    const meta = { ...doc.meta, ...(d.meta || {}) };
    if (d.meta) doc.meta = Object.fromEntries(Object.entries(meta).filter(([k]) => D.META_CHAVES.includes(k)).map(([k, x]) => [k, s(x, 200)]));
    if (!doc.meta.tom && d.aceitar_tom_sugerido && r.tom_sugerido) doc.meta.tom = r.tom_sugerido.nome;
    const destino = d.destino || 'nova_musica';
    let obra;
    if (destino === 'nova_musica') {
      obra = Musicas.criar(usuario, { titulo: s(meta.titulo, 200) || s(d.titulo, 200), artista: meta.artista, compositor: meta.compositor,
        tom: doc.meta.tom, bpm: meta.bpm, compasso: meta.compasso, separada: !!d.separada, titularidade: d.titularidade,
        dificuldade: d.dificuldade || (r.dificuldade && r.dificuldade.nivel) || '', genero: d.genero, idioma: d.idioma,
        duracao_s: r.duracao_estimada_s || 0, origem: 'import', pasta_id: d.pasta_id });
    } else {
      obra = Musicas.porId(d.obra_id);
      if (!obra) throw erro('Escolha a música de destino.', 404);
      if (destino === 'mesclar') {
        const falta = {};
        ['artista', 'compositor', 'genero', 'idioma'].forEach((k) => { if (!obra[k] && meta[k]) falta[k] = meta[k]; });
        if (!obra.tom_original && doc.meta.tom) falta.tom_original = doc.meta.tom;
        if (Object.keys(falta).length && obra.dono === usuario) Musicas.editar(usuario, obra.id, falta);
      }
    }
    const fonteId = novoId();
    db.prepare(`INSERT INTO cifra_fontes (id, obra_id, tipo, url, adaptador, metodo, confianca, importado_por, importado_em, detalhe)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(fonteId, obra.id, s(fonte.tipo || t.tipo_entrada, 20), s(fonte.url, 500), s(fonte.adaptador, 40),
      s(fonte.metodo, 60), conf, usuario, nowISO(), JSON.stringify({ importacao: importacaoId, nome: fonte.nome || '' }));
    const cifra = Cifras.criar(usuario, obra.id, { documento: doc, original, formato_original: s(fonte.metodo || t.tipo_entrada, 20),
      fonte_id: fonteId, confianca: conf, nome: s(d.nome, 120) || (fonte.adaptador ? 'Importada de ' + fonte.adaptador : 'Versão importada'),
      descricao: 'Importada (' + (fonte.tipo || t.tipo_entrada) + ')', status: 'importada' });
    db.prepare(`UPDATE cifra_fontes SET detalhe = ? WHERE id = ?`).run(JSON.stringify({ importacao: importacaoId, cifra: cifra.cifra.id }), fonteId);
    db.prepare("UPDATE importacoes SET status = 'salva', obra_id = ?, cifra_id = ?, atualizado_em = ? WHERE id = ?").run(obra.id, cifra.cifra.id, nowISO(), importacaoId);
    direitos.registrar({ ator: usuario, acao: 'cifra.importada', alvo: cifra.cifra.id, detalhe: { tipo: fonte.tipo || t.tipo_entrada, adaptador: fonte.adaptador || '' } });
    log('salva', { id: importacaoId, tipo: fonte.tipo || t.tipo_entrada });
    return { obra_id: obra.id, cifra_id: cifra.cifra.id };
  },

  descartar(usuario, id) {
    const t = db.prepare('SELECT * FROM importacoes WHERE id = ?').get(id);
    if (!t || t.usuario !== usuario) throw erro('Importação não encontrada.', 404);
    db.prepare("UPDATE importacoes SET status = 'descartada', resultado = '{}', atualizado_em = ? WHERE id = ? AND status <> 'salva'").run(nowISO(), id);
    db.prepare('DELETE FROM importacao_candidatos WHERE importacao_id = ?').run(id);
    return true;
  },

  /** Reprocessar (staff): só o que tem entrada reconstituível (URL). */
  reprocessar(id) {
    const t = db.prepare('SELECT * FROM importacoes WHERE id = ?').get(id);
    if (!t) throw erro('Importação não encontrada.', 404);
    if (t.status === 'salva') throw erro('Importação já salva: reprocessar criaria cifra duplicada.', 409);
    if (t.tipo_entrada !== 'url') throw erro('Só importação por URL pode ser reprocessada (as outras exigem a entrada original).');
    const url = 'https://' + t.entrada_resumo;
    db.prepare("UPDATE importacoes SET status = 'pendente', erro = '', atualizado_em = ? WHERE id = ?").run(nowISO(), id);
    const adaptador = fontes.paraUrl(url);
    return rodarEmSegundoPlano(id, async () => {
      const r = await rede.obter(url, { transporte: transporteTeste });
      const x = adaptador.extrair(r.texto, r.url);
      return previa(t.usuario, x.texto, { dica: x, fonte: { tipo: 'url', url: r.url, adaptador: adaptador.id, metodo: x.metodo }, confiancaBase: x.confianca });
    });
  },

  resumoStaff() {
    const porStatus = db.prepare('SELECT status, COUNT(*) n FROM importacoes GROUP BY status').all();
    const porTipo = db.prepare("SELECT tipo_entrada, COUNT(*) n, SUM(status = 'falhou') falhas FROM importacoes GROUP BY tipo_entrada").all();
    const falhas = db.prepare("SELECT id, tipo_entrada, entrada_resumo, erro, tentativas, atualizado_em FROM importacoes WHERE status = 'falhou' ORDER BY atualizado_em DESC LIMIT 50").all();
    const porFonte = db.prepare('SELECT adaptador, tipo, COUNT(*) n, AVG(confianca) conf FROM cifra_fontes GROUP BY adaptador, tipo ORDER BY n DESC').all();
    return { por_status: porStatus, por_tipo: porTipo, falhas, por_fonte: porFonte, rede: rede.estado(), rodando };
  },
};

module.exports = { Importar, previa, pareceChordPro, estimarDificuldade, recuperarPresas };
