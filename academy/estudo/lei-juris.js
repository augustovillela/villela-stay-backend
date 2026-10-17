// =====================================================================
// Villela Academy — ESTUDE · LEGISLAÇÃO E JURISPRUDÊNCIA POR ITEM DO EDITAL
// (ADR-0014, docs\estudo\DECISIONS). O contrato dos dados que entram está em
// dados\estude\concursos\…\lei-juris\BRIEF-pacote.md.
//
// O que mora aqui:
//   · IMPORTAÇÃO pela chave (um diploma por envio, jurisprudência em lotes de
//     até 500 itens, vínculos por disciplina) — validada, idempotente, cada
//     envio numa transação só;
//   · o que o ALUNO lê: a lei seca e os verbetes vinculados a cada aula/item,
//     o acervo de legislação (lista + diploma inteiro por demanda), o acervo
//     de jurisprudência (filtros, busca e paginação) e a busca única;
//   · a MARCAÇÃO DE LEITURA do aluno por dispositivo e por verbete (lido e
//     grifo em duas cores) — dele, exportada e apagada pela LGPD.
//
// Regras do ADR que o código sustenta:
//   · sem comentário: só texto oficial, com a fonte e a data de consulta;
//   · situação sempre explícita — revogado, alterado depois do edital, verbete
//     cancelado — e a redação na data do edital ao lado quando diferir;
//   · o texto mora UMA vez (diploma e verbete são do acervo); o que é de cada
//     percurso é o vínculo. Reenviar um diploma substitui o texto para todos.
//   · o acervo nasce em RASCUNHO: só dono do curso e admin veem até a
//     publicação (auditoria antes de abrir aos alunos, ADR-0014 etapa 4).
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, transacao, nowISO, j } = require('../db');
const R = require('./repo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const { erro } = R;

// ---------------------------------------------------------------------
// vocabulários e limites
// ---------------------------------------------------------------------
const TIPOS_DIPLOMA = ['constituicao', 'codigo', 'lei', 'lei_complementar', 'decreto_lei', 'decreto', 'medida_provisoria', 'emenda', 'resolucao',
  'instrucao_normativa', 'portaria', 'norma_regulamentadora', 'tratado', 'outro'];
const ABRANGENCIAS = ['integral', 'trechos'];
const SITUACOES = ['vigente', 'revogado', 'vetado', 'alterado_apos_edital', 'incluido_apos_edital', 'revogado_apos_edital'];
const APOS_EDITAL = ['alterado_apos_edital', 'incluido_apos_edital', 'revogado_apos_edital'];
// a situação do VERBETE (o contrato não fecha uma lista: esta é a da coleta J1–J3; nome novo entra aqui, de propósito)
const SITUACOES_JURIS = ['vigente', 'cancelado', 'convertido', 'alterado', 'superado', 'suspenso', 'revogado', 'julgado', 'merito_julgado', 'pendente',
  'prejudicado', 'encerrado', 'extinto', 'sem_tese', 'incluido_apos_edital', 'alterado_apos_edital', 'cancelado_apos_edital', 'sem_informacao'];
const SITUACOES_JURIS_EDITAL = SITUACOES_JURIS.concat(['inexistente']);
const ORIGENS = ['edital', 'aula', 'questao', 'leitura'];
const CONFIANCAS = ['alta', 'conferida']; // "inferida" não conferida NÃO entra (BRIEF-pacote, item 3)
const CORES = ['amarelo', 'verde'];       // grifo em duas cores (ADR-0007, etapa 5)
const STATUS = ['rascunho', 'publicado'];
const ID_DIPLOMA = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ID_DISP = /^[a-z0-9][a-z0-9.-]{0,119}$/;
const ID_PARTE = /^[a-z0-9][a-z0-9.-]{0,159}$/;
const ID_VERBETE = /^[a-z0-9][a-z0-9._-]{0,159}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DATA_NORMA = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const DISCIPLINA = /^\d{1,3}(\.\d{1,3}){0,6}$/;
const DATA_EDITAL_PADRAO = '2023-01-05';
// O maior diploma da coleta (Decreto 10.088/2019, as convenções da OIT consolidadas) tem 2,6 MB de JSON; o CC, 1,9 MB;
// o maior dispositivo, 147 mil caracteres (um anexo de tratado). O corpo da requisição já é limitado a 15 MB pelo
// servidor (server.js › express.json); o teto do diploma fica abaixo dele, com folga de 4× sobre o maior medido.
const LIMITE = { bytesDiploma: 12 * 1024 * 1024, dispositivos: 12000, partes: 1000, texto: 400000, textoParte: 100000, estrutura: 8000,
  lote: 500, textoVerbete: 400000, itensVinculo: 3000, refsPorItem: 3000, marcasPorEscopo: 30000, erros: 40 };
const POR_PAGINA = 30;
const ORDEM_TRIBUNAL = ['TST', 'TRT-10', 'STF', 'STJ'];

// ---------------------------------------------------------------------
// ÍNDICE DE BUSCA — FTS5 do SQLite (o node:sqlite do projeto tem; o jurídico já usa). Dois índices, um por acervo,
// com o rowid da própria linha: trocar um diploma apaga as entradas dele pelo rowid, sem varrer o índice inteiro.
// Sem FTS5 (SQLite compilado sem ele), a busca cai para LIKE e nada mais muda.
// ---------------------------------------------------------------------
let FTS = false;
try {
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS est_lj_fts_lei USING fts5(titulo, texto, tokenize = 'unicode61 remove_diacritics 2');
           CREATE VIRTUAL TABLE IF NOT EXISTS est_lj_fts_juris USING fts5(titulo, texto, tokenize = 'unicode61 remove_diacritics 2');`);
  FTS = true;
} catch (e) { console.error('[academy/estudo/lei-juris] FTS5 indisponível — a busca usa LIKE:', e.message); }
const temFTS = () => FTS;
// o texto do aluno vira uma consulta FTS segura: palavras soltas, cada uma entre aspas e com prefixo (E entre elas)
function consultaFTS(q) {
  const toks = s(q, 200).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 12);
  return toks.map(t => `"${t.replace(/"/g, '')}"*`).join(' ');
}
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MARCA_INI = '\u0002', MARCA_FIM = '\u0003'; // o trecho achado vem entre estes dois; a tela escapa e troca por <mark>

// ---------------------------------------------------------------------
// VALIDAÇÃO — junta os erros (até LIMITE.erros) e recusa o envio inteiro, com a lista
// ---------------------------------------------------------------------
function coletor() {
  const erros = [], avisos = [];
  return {
    erros, avisos,
    e(msg) { if (erros.length < LIMITE.erros) erros.push(msg); else if (erros.length === LIMITE.erros) erros.push('… (mais erros omitidos)'); },
    a(msg) { if (avisos.length < 200) avisos.push(msg); },
    falhar(titulo) {
      if (!erros.length) return;
      const x = erro(`${titulo}: ${erros.length > LIMITE.erros ? 'mais de ' + LIMITE.erros : erros.length} erro(s). Nada foi gravado.`);
      x.extra = { erros };
      throw x;
    },
  };
}
// texto: string ou null/undefined → '' ; outro tipo é erro
function texto(v, max, campo, k, { obrigatorio = false } = {}) {
  if (v == null) { if (obrigatorio) k.e(`${campo}: obrigatório.`); return ''; }
  if (typeof v !== 'string') { k.e(`${campo}: deve ser texto.`); return ''; }
  if (v.length > max) { k.e(`${campo}: passa de ${max} caracteres (${v.length}).`); return ''; }
  const t = v.trim();
  if (obrigatorio && !t) k.e(`${campo}: obrigatório.`);
  return t;
}
const url = (v, campo, k) => { const t = texto(v, 600, campo, k); if (t && !/^https?:\/\/\S+$/i.test(t)) k.e(`${campo}: deve ser um endereço http(s).`); return t; };
const data = (v, campo, k, { obrigatorio = false } = {}) => { const t = texto(v, 10, campo, k, { obrigatorio }); if (t && !DATA.test(t)) k.e(`${campo}: data no formato AAAA-MM-DD.`); return t; };
function alteradoPor(v, campo, k) {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) { k.e(`${campo}: deve ser { norma, data } ou null.`); return null; }
  const norma = texto(v.norma, 300, campo + '.norma', k, { obrigatorio: true });
  // a data da norma que alterou: dia, mês ou só o ano (a nota do Planalto às vezes só diz "Lei nº X, de 1966")
  const d = texto(v.data, 10, campo + '.data', k);
  if (d && !DATA_NORMA.test(d)) k.e(`${campo}.data: AAAA-MM-DD, AAAA-MM ou AAAA.`);
  return { norma, data: d };
}
// "Brasília, 1º de maio de 1943…" colado ao último artigo (o contrato pede que não venha)
const ASSINATURA = /\bBras[ií]lia,\s+\d{1,2}[ºo°]?\s+de\s+[a-zç]+\s+de\s+\d{4}/i;

function validarDiploma(d) {
  const k = coletor();
  if (!d || typeof d !== 'object' || Array.isArray(d)) { k.e('diploma: objeto obrigatório.'); k.falhar('Diploma recusado'); }
  const bytes = Buffer.byteLength(JSON.stringify(d), 'utf8');
  if (bytes > LIMITE.bytesDiploma) { const x = erro(`Diploma grande demais: ${(bytes / 1048576).toFixed(1)} MB (teto ${LIMITE.bytesDiploma / 1048576} MB). Divida-o em partes com ids próprios.`, 413); throw x; }
  const id = texto(d.id, 80, 'id', k, { obrigatorio: true });
  if (id && !ID_DIPLOMA.test(id)) k.e(`id "${id}": use letras minúsculas, números e hífen.`);
  const out = {
    id, nome: texto(d.nome, 300, 'nome', k, { obrigatorio: true }), norma: texto(d.norma, 300, 'norma', k), sigla: texto(d.sigla, 40, 'sigla', k),
    tipo: texto(d.tipo, 40, 'tipo', k, { obrigatorio: true }), abrangencia: texto(d.abrangencia, 20, 'abrangencia', k, { obrigatorio: true }),
    fonte_url: url(d.fonte_url, 'fonte_url', k), consultado_em: data(d.consultado_em, 'consultado_em', k, { obrigatorio: true }),
    data_edital: data(d.data_referencia_edital, 'data_referencia_edital', k) || DATA_EDITAL_PADRAO,
  };
  if (out.tipo && !TIPOS_DIPLOMA.includes(out.tipo)) k.e(`tipo "${out.tipo}": deve ser ${TIPOS_DIPLOMA.join('|')}.`);
  if (out.abrangencia && !ABRANGENCIAS.includes(out.abrangencia)) k.e(`abrangencia "${out.abrangencia}": deve ser ${ABRANGENCIAS.join('|')}.`);
  if (!out.fonte_url) k.e('fonte_url: obrigatório (fonte oficial lida na fonte).');
  // estrutura (títulos, capítulos, seções) — só para navegar; o caminho de cada dispositivo vem nele mesmo
  if (d.estrutura != null && !Array.isArray(d.estrutura)) k.e('estrutura: deve ser lista.');
  const est = Array.isArray(d.estrutura) ? d.estrutura : [];
  if (est.length > LIMITE.estrutura) k.e(`estrutura: mais de ${LIMITE.estrutura} entradas.`);
  out.estrutura = est.slice(0, LIMITE.estrutura).map((x, i) => ({ tipo: s(x && x.tipo, 40), rotulo: s(x && x.rotulo, 120), nome: s(x && x.nome, 400), ordem: Number.isFinite(Number(x && x.ordem)) ? Number(x.ordem) : i + 1 }));
  // dispositivos
  if (!Array.isArray(d.dispositivos) || !d.dispositivos.length) k.e('dispositivos: lista com ao menos um dispositivo.');
  const ds = Array.isArray(d.dispositivos) ? d.dispositivos : [];
  if (ds.length > LIMITE.dispositivos) k.e(`dispositivos: ${ds.length} passa do teto de ${LIMITE.dispositivos}.`);
  const vistos = new Set();
  out.dispositivos = ds.slice(0, LIMITE.dispositivos).map((x, i) => {
    const c = `dispositivos[${i}]`;
    if (!x || typeof x !== 'object') { k.e(`${c}: objeto.`); return null; }
    const did = texto(x.id, 120, c + '.id', k, { obrigatorio: true });
    if (did && !ID_DISP.test(did)) k.e(`${c}.id "${did}": use letras minúsculas, números, ponto e hífen (ex.: art-477, art-4a).`);
    if (did && vistos.has(did)) k.e(`${c}.id "${did}" repetido.`);
    vistos.add(did);
    const sit = texto(x.situacao, 30, c + '.situacao', k, { obrigatorio: true });
    if (sit && !SITUACOES.includes(sit)) k.e(`${c}.situacao "${sit}": deve ser ${SITUACOES.join('|')}.`);
    const disp = {
      id: did, rotulo: texto(x.rotulo, 120, c + '.rotulo', k, { obrigatorio: true }), ordem: Number.isFinite(Number(x.ordem)) ? Number(x.ordem) : i + 1,
      estrutura: texto(x.estrutura, 1500, c + '.estrutura', k), epigrafe: texto(x.epigrafe, 600, c + '.epigrafe', k), texto: texto(x.texto, LIMITE.texto, c + '.texto', k),
      situacao: sit, nota: texto(x.nota, 1500, c + '.nota', k), alterado_por: alteradoPor(x.alterado_por, c + '.alterado_por', k),
      texto_edital: x.texto_na_data_do_edital == null ? null : texto(x.texto_na_data_do_edital, LIMITE.texto, c + '.texto_na_data_do_edital', k),
      edital_indisponivel: x.texto_na_data_do_edital_indisponivel === true,
    };
    if (APOS_EDITAL.includes(sit) && !(disp.alterado_por && disp.alterado_por.data)) k.a(`${did}: situação "${sit}" sem a data da norma que alterou (alterado_por.data).`);
    if (x.partes != null && !Array.isArray(x.partes)) k.e(`${c}.partes: deve ser lista.`);
    const ps = Array.isArray(x.partes) ? x.partes : [];
    if (ps.length > LIMITE.partes) k.e(`${c}.partes: ${ps.length} passa do teto de ${LIMITE.partes}.`);
    disp.partes = ps.slice(0, LIMITE.partes).map((p, n) => {
      const cp = `${c}.partes[${n}]`;
      if (!p || typeof p !== 'object') { k.e(`${cp}: objeto.`); return null; }
      const pid = texto(p.id, 160, cp + '.id', k, { obrigatorio: true });
      if (pid && (!ID_PARTE.test(pid) || !pid.startsWith(did + '.'))) k.e(`${cp}.id "${pid}": deve começar por "${did}." (ex.: ${did}.p1, ${did}.inc13).`);
      if (pid && vistos.has(pid)) k.e(`${cp}.id "${pid}" repetido.`);
      vistos.add(pid);
      const psit = texto(p.situacao, 30, cp + '.situacao', k, { obrigatorio: true });
      if (psit && !SITUACOES.includes(psit)) k.e(`${cp}.situacao "${psit}": deve ser ${SITUACOES.join('|')}.`);
      return { id: pid, caminho: texto(p.caminho, 300, cp + '.caminho', k), rotulo: texto(p.rotulo, 120, cp + '.rotulo', k), texto: texto(p.texto, LIMITE.textoParte, cp + '.texto', k),
        situacao: psit, nota: texto(p.nota, 1500, cp + '.nota', k), alterado_por: alteradoPor(p.alterado_por, cp + '.alterado_por', k),
        texto_na_data_do_edital: p.texto_na_data_do_edital == null ? null : texto(p.texto_na_data_do_edital, LIMITE.textoParte, cp + '.texto_na_data_do_edital', k),
        ...(p.texto_na_data_do_edital_indisponivel === true ? { texto_na_data_do_edital_indisponivel: true } : {}) };
    }).filter(Boolean);
    return disp;
  }).filter(Boolean);
  const ult = out.dispositivos[out.dispositivos.length - 1];
  if (ult && ASSINATURA.test(ult.texto + ' ' + ((ult.partes[ult.partes.length - 1] || {}).texto || ''))) k.a(`${ult.id}: parece trazer a assinatura ("Brasília, …") colada ao texto.`);
  k.falhar('Diploma recusado');
  return { d: out, avisos: k.avisos };
}

// ---------------------------------------------------------------------
// ESCOPO do curso (as rotas do staff mandam produto + slug; percurso particular não tem acervo)
// ---------------------------------------------------------------------
function escopoDoCurso(produto, slugEscopo) {
  const escopo = R.Escopos.doCursoPorSlug(produto.id, R.slug(slugEscopo));
  if (!escopo) throw erro('Escopo não encontrado neste curso (informe "escopo" com o slug).', 404);
  return escopo;
}
const estadoDo = (escopoId) => (db.prepare('SELECT status FROM est_lj_estado WHERE escopo_id = ?').get(escopoId) || {}).status || 'rascunho';
function garantirEstado(escopoId) { db.prepare('INSERT OR IGNORE INTO est_lj_estado (escopo_id, status, atualizado_em) VALUES (?, ?, ?)').run(escopoId, 'rascunho', nowISO()); }
const hashDe = (o) => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex');

// o que o índice de busca guarda de um dispositivo: rótulo e epígrafe no título; caput e partes no texto
function ftsDoDispositivo(diploma, x) {
  const titulo = [diploma.sigla, x.rotulo, x.epigrafe].filter(Boolean).join(' ');
  const corpo = [x.texto].concat(x.partes.map(p => [p.rotulo, p.texto].filter(Boolean).join(' '))).filter(Boolean).join('\n');
  return [titulo, corpo];
}

// ---------------------------------------------------------------------
// IMPORTAÇÃO — um diploma por envio. Idempotente: o mesmo conteúdo (hash) não regrava nada; conteúdo novo substitui
// o diploma INTEIRO (dispositivos e índice) numa transação só. O vínculo com o percurso é criado se faltar.
// ---------------------------------------------------------------------
function importarDiploma(produto, dados = {}) {
  const escopo = escopoDoCurso(produto, dados.escopo);
  const { d, avisos } = validarDiploma(dados.diploma);
  const alterados = d.dispositivos.filter(x => APOS_EDITAL.includes(x.situacao) || x.partes.some(p => APOS_EDITAL.includes(p.situacao))).length;
  const artigos = d.dispositivos.length;
  const hash = hashDe(d);
  const porSituacao = {};
  for (const x of d.dispositivos) { porSituacao[x.situacao] = (porSituacao[x.situacao] || 0) + 1; for (const p of x.partes) porSituacao['parte:' + p.situacao] = (porSituacao['parte:' + p.situacao] || 0) + 1; }
  const r = transacao(() => {
    garantirEstado(escopo.id);
    const antes = db.prepare('SELECT hash FROM est_lj_diplomas WHERE id = ?').get(d.id);
    const ligar = () => db.prepare('INSERT OR IGNORE INTO est_lj_escopo_diplomas (escopo_id, diploma_id, ligado_em) VALUES (?, ?, ?)').run(escopo.id, d.id, nowISO()).changes > 0;
    if (antes && antes.hash === hash) return { inalterado: true, substituiu: false, ligado_agora: ligar() };
    if (antes) {
      if (FTS) db.prepare('DELETE FROM est_lj_fts_lei WHERE rowid IN (SELECT rowid FROM est_lj_dispositivos WHERE diploma_id = ?)').run(d.id);
      db.prepare('DELETE FROM est_lj_dispositivos WHERE diploma_id = ?').run(d.id);
    }
    db.prepare(`INSERT INTO est_lj_diplomas (id, nome, norma, sigla, tipo, abrangencia, fonte_url, consultado_em, data_edital, estrutura, artigos, alterados, hash, importado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET nome = excluded.nome, norma = excluded.norma, sigla = excluded.sigla, tipo = excluded.tipo, abrangencia = excluded.abrangencia,
        fonte_url = excluded.fonte_url, consultado_em = excluded.consultado_em, data_edital = excluded.data_edital, estrutura = excluded.estrutura,
        artigos = excluded.artigos, alterados = excluded.alterados, hash = excluded.hash, importado_em = excluded.importado_em`)
      .run(d.id, d.nome, d.norma, d.sigla, d.tipo, d.abrangencia, d.fonte_url, d.consultado_em, d.data_edital, j.str(d.estrutura), artigos, alterados, hash, nowISO());
    const ins = db.prepare(`INSERT INTO est_lj_dispositivos (diploma_id, id, ordem, rotulo, estrutura, epigrafe, texto, partes, situacao, nota, alterado_por, texto_edital, edital_indisponivel)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const fts = FTS ? db.prepare('INSERT INTO est_lj_fts_lei (rowid, titulo, texto) VALUES (?, ?, ?)') : null;
    for (const x of d.dispositivos) {
      const rr = ins.run(d.id, x.id, x.ordem, x.rotulo, x.estrutura, x.epigrafe, x.texto, j.str(x.partes), x.situacao, x.nota, x.alterado_por ? j.str(x.alterado_por) : '', x.texto_edital, x.edital_indisponivel ? 1 : 0);
      if (fts) fts.run(Number(rr.lastInsertRowid), ...ftsDoDispositivo(d, x));
    }
    return { inalterado: false, substituiu: !!antes, ligado_agora: ligar() };
  });
  // vínculos (de qualquer percurso) que apontam para dispositivo que este envio não trouxe mais
  const orfaos = db.prepare(`SELECT v.escopo_id, v.item, v.dispositivo_id FROM est_lj_vinculos v LEFT JOIN est_lj_dispositivos d ON d.diploma_id = v.diploma_id AND d.id = v.dispositivo_id
    WHERE v.tipo = 'lei' AND v.diploma_id = ? AND d.id IS NULL`).all(d.id);
  return { diploma: d.id, escopo: escopo.slug, ...r, dispositivos: artigos, partes: d.dispositivos.reduce((n, x) => n + x.partes.length, 0),
    alterados_apos_edital: alterados, por_situacao: porSituacao, vinculos_orfaos: orfaos.length, vinculos_orfaos_exemplos: orfaos.slice(0, 20), avisos, busca: FTS ? 'fts5' : 'like' };
}

// ---------------------------------------------------------------------
// IMPORTAÇÃO — jurisprudência em LOTES de até 500 itens (coleções junto, quando novas). Idempotente pelo id do
// verbete; o lote inteiro numa transação: um item inválido recusa o lote.
// ---------------------------------------------------------------------
const numeroOrd = (n) => { const m = String(n || '').match(/\d+/); return m ? Number(m[0]) : 0; };
function validarColecao(x, i, k) {
  const c = `colecoes[${i}]`;
  if (!x || typeof x !== 'object') { k.e(`${c}: objeto.`); return null; }
  const id = texto(x.id, 80, c + '.id', k, { obrigatorio: true });
  if (id && !ID_DIPLOMA.test(id)) k.e(`${c}.id "${id}": letras minúsculas, números e hífen.`);
  return { id, nome: texto(x.nome, 300, c + '.nome', k, { obrigatorio: true }), tribunal: texto(x.tribunal, 40, c + '.tribunal', k, { obrigatorio: true }),
    fonte_url: url(x.fonte_url, c + '.fonte_url', k), consultado_em: data(x.consultado_em, c + '.consultado_em', k) };
}
function validarVerbete(x, i, k, colecoes) {
  const c = `itens[${i}]`;
  if (!x || typeof x !== 'object') { k.e(`${c}: objeto.`); return null; }
  const id = texto(x.id, 160, c + '.id', k, { obrigatorio: true });
  if (id && !ID_VERBETE.test(id)) k.e(`${c}.id "${id}": letras, números, ponto, hífen e sublinhado.`);
  const v = {
    id, colecao: texto(x.colecao, 80, c + '.colecao', k, { obrigatorio: true }), tipo: texto(x.tipo, 40, c + '.tipo', k, { obrigatorio: true }),
    tribunal: texto(x.tribunal, 40, c + '.tribunal', k, { obrigatorio: true }), orgao: texto(x.orgao, 300, c + '.orgao', k), numero: texto(x.numero, 160, c + '.numero', k),
    titulo: texto(x.titulo, 3000, c + '.titulo', k), texto: texto(x.texto, LIMITE.textoVerbete, c + '.texto', k), tese: texto(x.tese, 60000, c + '.tese', k),
    situacao: texto(x.situacao, 40, c + '.situacao', k), situacao_detalhe: texto(x.situacao_detalhe, 3000, c + '.situacao_detalhe', k),
    situacao_edital: texto(x.situacao_na_data_do_edital, 60, c + '.situacao_na_data_do_edital', k),
    historico: texto(typeof x.historico === 'string' || x.historico == null ? x.historico : JSON.stringify(x.historico), 20000, c + '.historico', k),
    leading_case: texto(typeof x.leading_case === 'string' || x.leading_case == null ? x.leading_case : JSON.stringify(x.leading_case), 1000, c + '.leading_case', k),
    julgamento: texto(typeof x.julgamento === 'string' || x.julgamento == null ? x.julgamento : JSON.stringify(x.julgamento), 1000, c + '.julgamento', k),
    fonte_tipo: texto(x.fonte_tipo, 60, c + '.fonte_tipo', k), fonte_url: url(x.fonte_url, c + '.fonte_url', k), consultado_em: data(x.consultado_em, c + '.consultado_em', k),
  };
  if (v.tipo && !/^[A-Za-z_]{1,40}$/.test(v.tipo)) k.e(`${c}.tipo "${v.tipo}": letras e sublinhado.`);
  if (v.colecao && !colecoes.has(v.colecao)) k.e(`${c}.colecao "${v.colecao}": coleção não enviada neste lote nem importada antes.`);
  if (v.situacao && !SITUACOES_JURIS.includes(v.situacao)) k.e(`${c}.situacao "${v.situacao}": deve ser ${SITUACOES_JURIS.join('|')}.`);
  if (!v.situacao) k.e(`${c}.situacao: obrigatória (situação sempre explícita).`);
  if (v.situacao_edital && !SITUACOES_JURIS_EDITAL.includes(v.situacao_edital)) k.e(`${c}.situacao_na_data_do_edital "${v.situacao_edital}": deve ser ${SITUACOES_JURIS_EDITAL.join('|')}.`);
  if (!v.texto && !v.tese && !v.titulo) k.e(`${c}: sem texto, tese nem título.`);
  if (!v.fonte_url) k.e(`${c}.fonte_url: obrigatório (fonte oficial lida na fonte).`);
  return v;
}
function importarJurisprudencia(produto, dados = {}) {
  const escopo = escopoDoCurso(produto, dados.escopo);
  const k = coletor();
  if (dados.colecoes != null && !Array.isArray(dados.colecoes)) k.e('colecoes: deve ser lista.');
  if (dados.itens != null && !Array.isArray(dados.itens)) k.e('itens: deve ser lista.');
  const cols = (Array.isArray(dados.colecoes) ? dados.colecoes : []).slice(0, 200).map((x, i) => validarColecao(x, i, k)).filter(Boolean);
  const its = Array.isArray(dados.itens) ? dados.itens : [];
  if (its.length > LIMITE.lote) k.e(`itens: ${its.length} passa do lote de ${LIMITE.lote}. Envie em partes.`);
  if (!its.length && !cols.length) k.e('Nada a importar: envie "colecoes" e/ou "itens".');
  const conhecidas = new Set(db.prepare('SELECT id FROM est_lj_colecoes').all().map(x => x.id).concat(cols.map(x => x.id)));
  const vistos = new Set();
  const vs = its.slice(0, LIMITE.lote).map((x, i) => {
    const v = validarVerbete(x, i, k, conhecidas);
    if (v && v.id) { if (vistos.has(v.id)) k.e(`itens[${i}].id "${v.id}" repetido no lote.`); vistos.add(v.id); }
    return v;
  }).filter(Boolean);
  k.falhar('Lote de jurisprudência recusado');
  const porSituacao = {};
  const r = transacao(() => {
    garantirEstado(escopo.id);
    const upCol = db.prepare(`INSERT INTO est_lj_colecoes (id, nome, tribunal, fonte_url, consultado_em) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET nome = excluded.nome, tribunal = excluded.tribunal, fonte_url = excluded.fonte_url, consultado_em = excluded.consultado_em`);
    for (const c of cols) upCol.run(c.id, c.nome, c.tribunal, c.fonte_url, c.consultado_em);
    const atual = db.prepare('SELECT rowid AS rid, hash FROM est_lj_verbetes WHERE id = ?');
    const up = db.prepare(`INSERT INTO est_lj_verbetes (id, colecao, tipo, tribunal, orgao, numero, numero_ord, titulo, texto, tese, situacao, situacao_detalhe, situacao_edital,
        historico, leading_case, julgamento, fonte_tipo, fonte_url, consultado_em, hash, importado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET colecao = excluded.colecao, tipo = excluded.tipo, tribunal = excluded.tribunal, orgao = excluded.orgao, numero = excluded.numero,
        numero_ord = excluded.numero_ord, titulo = excluded.titulo, texto = excluded.texto, tese = excluded.tese, situacao = excluded.situacao,
        situacao_detalhe = excluded.situacao_detalhe, situacao_edital = excluded.situacao_edital, historico = excluded.historico, leading_case = excluded.leading_case,
        julgamento = excluded.julgamento, fonte_tipo = excluded.fonte_tipo, fonte_url = excluded.fonte_url, consultado_em = excluded.consultado_em,
        hash = excluded.hash, importado_em = excluded.importado_em`);
    const ligar = db.prepare('INSERT OR IGNORE INTO est_lj_escopo_verbetes (escopo_id, verbete_id, ligado_em) VALUES (?, ?, ?)');
    const ftsDel = FTS ? db.prepare('DELETE FROM est_lj_fts_juris WHERE rowid = ?') : null;
    const ftsIns = FTS ? db.prepare('INSERT INTO est_lj_fts_juris (rowid, titulo, texto) VALUES (?, ?, ?)') : null;
    let novos = 0, atualizados = 0, inalterados = 0, ligados = 0;
    for (const v of vs) {
      porSituacao[v.situacao] = (porSituacao[v.situacao] || 0) + 1;
      const hash = hashDe(v), a = atual.get(v.id);
      if (a && a.hash === hash) inalterados++;
      else {
        up.run(v.id, v.colecao, v.tipo, v.tribunal, v.orgao, v.numero, numeroOrd(v.numero), v.titulo, v.texto, v.tese, v.situacao, v.situacao_detalhe, v.situacao_edital,
          v.historico, v.leading_case, v.julgamento, v.fonte_tipo, v.fonte_url, v.consultado_em, hash, nowISO());
        const rid = a ? a.rid : atual.get(v.id).rid; // ON CONFLICT DO UPDATE mantém o rowid: o índice é trocado no mesmo lugar
        if (FTS) { ftsDel.run(rid); ftsIns.run(rid, [v.tribunal, v.tipo.replace(/_/g, ' '), v.numero, v.titulo].filter(Boolean).join(' '), [v.texto, v.tese].filter(Boolean).join('\n')); }
        if (a) atualizados++; else novos++;
      }
      ligados += ligar.run(escopo.id, v.id, nowISO()).changes;
    }
    return { novos, atualizados, inalterados, ligados_agora: ligados };
  });
  return { escopo: escopo.slug, recebidos: vs.length, colecoes: cols.length, ...r, por_situacao: porSituacao, busca: FTS ? 'fts5' : 'like' };
}

// ---------------------------------------------------------------------
// IMPORTAÇÃO — vínculos item → dispositivo/verbete, POR DISCIPLINA: o envio substitui todos os vínculos dos itens
// daquela disciplina (o item "1.1" e os de baixo dele) no percurso. Cada referência é conferida: o item existe no
// programa e é da disciplina; o dispositivo (e a parte) existe num diploma do percurso; o verbete é do percurso.
// Referência que não confere recusa o envio — ou, com `ignorar_faltantes: true`, fica de fora e vai no relatório.
// ---------------------------------------------------------------------
function importarVinculos(produto, dados = {}) {
  const escopo = escopoDoCurso(produto, dados.escopo);
  if (!escopo.versao) throw erro('O percurso ainda não tem programa: importe o programa antes dos vínculos.');
  const k = coletor();
  const disc = s(dados.disciplina, 30);
  if (!DISCIPLINA.test(disc)) k.e('disciplina: o código da disciplina no programa (ex.: "1.1").');
  if (!Array.isArray(dados.itens) || !dados.itens.length) k.e('itens: lista com ao menos um item.');
  const its = Array.isArray(dados.itens) ? dados.itens : [];
  if (its.length > LIMITE.itensVinculo) k.e(`itens: ${its.length} passa do teto de ${LIMITE.itensVinculo}.`);
  k.falhar('Vínculos recusados');
  const programa = new Map(R.itens(escopo).map(i => [i.codigo, i]));
  if (!programa.has(disc)) k.e(`disciplina "${disc}": não existe no programa do percurso.`);
  const daDisc = (cod) => cod === disc || cod.startsWith(disc + '.');
  const diplomas = new Set(db.prepare('SELECT diploma_id FROM est_lj_escopo_diplomas WHERE escopo_id = ?').all(escopo.id).map(x => x.diploma_id));
  const verbetes = new Set(db.prepare('SELECT verbete_id FROM est_lj_escopo_verbetes WHERE escopo_id = ?').all(escopo.id).map(x => x.verbete_id));
  const partesDe = new Map(); // "diploma|dispositivo" → Set das partes (ou null: dispositivo não existe)
  const disp = (dip, did) => {
    const ch = dip + '|' + did;
    if (!partesDe.has(ch)) {
      const r = db.prepare('SELECT partes FROM est_lj_dispositivos WHERE diploma_id = ? AND id = ?').get(dip, did);
      partesDe.set(ch, r ? new Set(j.parse(r.partes, []).map(p => p.id)) : null);
    }
    return partesDe.get(ch);
  };
  const faltantes = [], linhas = new Map(), codigosVistos = new Set();
  let ignorados = 0;
  const falta = (msg) => { ignorados++; if (faltantes.length < 200) faltantes.push(msg); };
  its.forEach((it, i) => {
    const c = `itens[${i}]`;
    if (!it || typeof it !== 'object') return k.e(`${c}: objeto.`);
    const cod = s(it.codigo, 40);
    if (!cod) return k.e(`${c}.codigo: obrigatório.`);
    if (codigosVistos.has(cod)) return k.e(`${c}.codigo "${cod}" repetido.`);
    codigosVistos.add(cod);
    if (!daDisc(cod)) return k.e(`${c}.codigo "${cod}": não é da disciplina ${disc}.`);
    if (!programa.has(cod)) return k.e(`${c}.codigo "${cod}": não existe no programa do percurso.`);
    const lei = it.legislacao == null ? [] : it.legislacao, jur = it.jurisprudencia == null ? [] : it.jurisprudencia;
    if (!Array.isArray(lei) || !Array.isArray(jur)) return k.e(`${c}: "legislacao" e "jurisprudencia" devem ser listas.`);
    if (lei.length + jur.length > LIMITE.refsPorItem) return k.e(`${c}: mais de ${LIMITE.refsPorItem} referências.`);
    lei.forEach((x, n) => {
      const cc = `${c}.legislacao[${n}]`;
      const o = { diploma: s(x && x.diploma, 80), dispositivo: s(x && x.dispositivo, 120), parte: s(x && x.parte, 160), origem: s(x && x.origem, 20), confianca: s(x && x.confianca, 20) };
      if (!o.diploma || !o.dispositivo) return k.e(`${cc}: "diploma" e "dispositivo" obrigatórios.`);
      if (!ORIGENS.includes(o.origem)) return k.e(`${cc}.origem "${o.origem}": deve ser ${ORIGENS.join('|')}.`);
      if (!CONFIANCAS.includes(o.confianca)) return k.e(`${cc}.confianca "${o.confianca}": deve ser ${CONFIANCAS.join('|')} (inferida sem conferência não entra).`);
      if (!diplomas.has(o.diploma)) return falta(`${cod}: diploma "${o.diploma}" não está no acervo do percurso.`);
      const ps = disp(o.diploma, o.dispositivo);
      if (!ps) return falta(`${cod}: ${o.diploma} › ${o.dispositivo} não existe.`);
      if (o.parte && !ps.has(o.parte)) return falta(`${cod}: ${o.diploma} › ${o.parte} não existe.`);
      linhas.set(['lei', cod, o.diploma, o.dispositivo, o.parte, ''].join('\u0001'), { item: cod, tipo: 'lei', diploma_id: o.diploma, dispositivo_id: o.dispositivo, parte: o.parte, verbete_id: '', origem: o.origem, confianca: o.confianca, motivo: '' });
    });
    jur.forEach((x, n) => {
      const cc = `${c}.jurisprudencia[${n}]`;
      const o = { id: s(x && x.id, 160), origem: s(x && x.origem, 20), confianca: s(x && x.confianca, 20), motivo: s(x && x.motivo, 600) };
      if (!o.id) return k.e(`${cc}.id: obrigatório.`);
      if (!ORIGENS.includes(o.origem)) return k.e(`${cc}.origem "${o.origem}": deve ser ${ORIGENS.join('|')}.`);
      if (!CONFIANCAS.includes(o.confianca)) return k.e(`${cc}.confianca "${o.confianca}": deve ser ${CONFIANCAS.join('|')}.`);
      if (!verbetes.has(o.id)) return falta(`${cod}: verbete "${o.id}" não está no acervo do percurso.`);
      linhas.set(['juris', cod, '', '', '', o.id].join('\u0001'), { item: cod, tipo: 'juris', diploma_id: '', dispositivo_id: '', parte: '', verbete_id: o.id, origem: o.origem, confianca: o.confianca, motivo: o.motivo });
    });
  });
  k.falhar('Vínculos recusados');
  if (ignorados && dados.ignorar_faltantes !== true) {
    const x = erro(`${ignorados} referência(s) não conferem com o acervo do percurso. Nada foi gravado. Importe os diplomas e a jurisprudência antes, ou reenvie com "ignorar_faltantes": true.`);
    x.extra = { faltantes };
    throw x;
  }
  const r = transacao(() => {
    const apagados = db.prepare("DELETE FROM est_lj_vinculos WHERE escopo_id = ? AND (item = ? OR item LIKE ? || '.%')").run(escopo.id, disc, disc).changes;
    const ins = db.prepare(`INSERT INTO est_lj_vinculos (escopo_id, item, tipo, diploma_id, dispositivo_id, parte, verbete_id, origem, confianca, motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const l of linhas.values()) ins.run(escopo.id, l.item, l.tipo, l.diploma_id, l.dispositivo_id, l.parte, l.verbete_id, l.origem, l.confianca, l.motivo);
    return { apagados };
  });
  const comVinculo = new Set([...linhas.values()].map(l => l.item));
  const folhasSem = [...programa.values()].filter(i => i.folha && daDisc(i.codigo) && !comVinculo.has(i.codigo)).map(i => i.codigo);
  const ls = [...linhas.values()];
  return { escopo: escopo.slug, disciplina: disc, itens: comVinculo.size, legislacao: ls.filter(l => l.tipo === 'lei').length, jurisprudencia: ls.filter(l => l.tipo === 'juris').length,
    substituidos: r.apagados, ignorados, faltantes, itens_sem_vinculo: folhasSem };
}

// ---------------------------------------------------------------------
// STAFF — abrir/fechar o acervo aos alunos, tirar diploma/verbete do percurso e o resumo da importação
// ---------------------------------------------------------------------
function definirEstado(produto, dados = {}) {
  const escopo = escopoDoCurso(produto, dados.escopo);
  const st = s(dados.status, 20);
  if (!STATUS.includes(st)) throw erro(`status deve ser ${STATUS.join('|')}.`);
  db.prepare(`INSERT INTO est_lj_estado (escopo_id, status, atualizado_em) VALUES (?, ?, ?)
    ON CONFLICT (escopo_id) DO UPDATE SET status = excluded.status, atualizado_em = excluded.atualizado_em`).run(escopo.id, st, nowISO());
  return { escopo: escopo.slug, status: st };
}
// tira do percurso (o texto só sai do banco quando nenhum outro percurso o usa)
function remover(produto, dados = {}) {
  const escopo = escopoDoCurso(produto, dados.escopo);
  const dips = (Array.isArray(dados.diplomas) ? dados.diplomas : []).map(x => s(x, 80)).filter(Boolean).slice(0, 1000);
  const vers = (Array.isArray(dados.verbetes) ? dados.verbetes : []).map(x => s(x, 160)).filter(Boolean).slice(0, 5000);
  if (!dips.length && !vers.length) throw erro('Informe "diplomas" e/ou "verbetes" (ids) a tirar do percurso.');
  return transacao(() => {
    const out = { diplomas: 0, verbetes: 0, apagados_do_acervo: 0, vinculos: 0 };
    for (const id of dips) {
      out.vinculos += db.prepare("DELETE FROM est_lj_vinculos WHERE escopo_id = ? AND tipo = 'lei' AND diploma_id = ?").run(escopo.id, id).changes;
      out.diplomas += db.prepare('DELETE FROM est_lj_escopo_diplomas WHERE escopo_id = ? AND diploma_id = ?').run(escopo.id, id).changes;
      if (!db.prepare('SELECT 1 FROM est_lj_escopo_diplomas WHERE diploma_id = ? LIMIT 1').get(id)) {
        if (FTS) db.prepare('DELETE FROM est_lj_fts_lei WHERE rowid IN (SELECT rowid FROM est_lj_dispositivos WHERE diploma_id = ?)').run(id);
        out.apagados_do_acervo += db.prepare('DELETE FROM est_lj_diplomas WHERE id = ?').run(id).changes; // dispositivos saem em cascata
      }
    }
    for (const id of vers) {
      out.vinculos += db.prepare("DELETE FROM est_lj_vinculos WHERE escopo_id = ? AND tipo = 'juris' AND verbete_id = ?").run(escopo.id, id).changes;
      out.verbetes += db.prepare('DELETE FROM est_lj_escopo_verbetes WHERE escopo_id = ? AND verbete_id = ?').run(escopo.id, id).changes;
      if (!db.prepare('SELECT 1 FROM est_lj_escopo_verbetes WHERE verbete_id = ? LIMIT 1').get(id)) {
        const r = db.prepare('SELECT rowid AS rid FROM est_lj_verbetes WHERE id = ?').get(id);
        if (r && FTS) db.prepare('DELETE FROM est_lj_fts_juris WHERE rowid = ?').run(r.rid);
        out.apagados_do_acervo += db.prepare('DELETE FROM est_lj_verbetes WHERE id = ?').run(id).changes;
      }
    }
    return out;
  });
}
function resumoStaff(produto, slugEscopo) {
  const escopo = escopoDoCurso(produto, slugEscopo);
  const e = escopo.id;
  const diplomas = db.prepare(`SELECT d.id, d.nome, d.sigla, d.tipo, d.abrangencia, d.artigos, d.alterados, d.consultado_em, d.importado_em,
      (SELECT COUNT(DISTINCT v.dispositivo_id) FROM est_lj_vinculos v WHERE v.escopo_id = ed.escopo_id AND v.tipo = 'lei' AND v.diploma_id = d.id) AS cobrados
    FROM est_lj_escopo_diplomas ed JOIN est_lj_diplomas d ON d.id = ed.diploma_id WHERE ed.escopo_id = ? ORDER BY d.nome`).all(e);
  const colecoes = db.prepare(`SELECT c.id, c.nome, c.tribunal, COUNT(*) AS itens, SUM(v.situacao = 'vigente') AS vigentes FROM est_lj_escopo_verbetes ev
    JOIN est_lj_verbetes v ON v.id = ev.verbete_id JOIN est_lj_colecoes c ON c.id = v.colecao WHERE ev.escopo_id = ? GROUP BY c.id ORDER BY c.tribunal, c.nome`).all(e);
  const vinc = db.prepare("SELECT tipo, COUNT(*) AS n, COUNT(DISTINCT item) AS itens FROM est_lj_vinculos WHERE escopo_id = ? GROUP BY tipo").all(e);
  const comVinculo = new Set(db.prepare('SELECT DISTINCT item FROM est_lj_vinculos WHERE escopo_id = ?').all(e).map(x => x.item));
  const folhas = escopo.versao ? R.itens(escopo).filter(i => i.folha) : [];
  const orfaos = db.prepare(`SELECT COUNT(*) AS n FROM est_lj_vinculos v LEFT JOIN est_lj_dispositivos d ON d.diploma_id = v.diploma_id AND d.id = v.dispositivo_id
    WHERE v.escopo_id = ? AND v.tipo = 'lei' AND d.id IS NULL`).get(e).n;
  return { escopo: escopo.slug, status: estadoDo(e), busca: FTS ? 'fts5' : 'like', diplomas, colecoes,
    vinculos: Object.fromEntries(vinc.map(x => [x.tipo, { vinculos: x.n, itens: x.itens }])), vinculos_orfaos: orfaos,
    itens_folha: folhas.length, itens_sem_vinculo: folhas.filter(i => !comVinculo.has(i.codigo)).map(i => i.codigo) };
}

// =====================================================================
// O QUE O ALUNO LÊ
// =====================================================================
// A mesma porta do resto do Estude (estudo/aluno.js › abrir: quem tem o curso vê o publicado; dono e admin
// revisam). O acervo tem a sua: enquanto não for publicado, só o revisor o vê. Percurso particular não tem acervo.
function abrirAcervo(usuario, produto, slugEscopo) {
  const c = require('./aluno').abrir(usuario, produto, slugEscopo);
  if (c.particular) throw erro('Este percurso não tem legislação nem jurisprudência.', 404);
  if (!c.revisor && estadoDo(c.escopo.id) !== 'publicado') throw erro('A legislação e a jurisprudência deste percurso ainda não estão disponíveis.', 404);
  return c;
}
// para o painel: o acervo existe para este aluno? (as abas da tela só aparecem com ele)
function resumoParaPainel(c) {
  if (c.particular) return null;
  const st = estadoDo(c.escopo.id);
  if (!c.revisor && st !== 'publicado') return null;
  const nd = db.prepare('SELECT COUNT(*) AS n FROM est_lj_escopo_diplomas WHERE escopo_id = ?').get(c.escopo.id).n;
  const nv = db.prepare('SELECT COUNT(*) AS n FROM est_lj_escopo_verbetes WHERE escopo_id = ?').get(c.escopo.id).n;
  if (!nd && !nv) return null;
  return { legislacao: nd, jurisprudencia: nv, status: st };
}

// o programa e as aulas: o texto de cada item e, para cada item, as aulas que o cobrem
function mapaDoPercurso(c) {
  return R.memo(`lj:mapa:${c.escopo.id}:${c.vis.join(',')}`, () => {
    const itens = new Map(c.escopo.versao ? R.itens(c.escopo).map(i => [i.codigo, i.texto]) : []);
    const pares = [];
    const titulos = new Map();
    for (const u of R.unidades(c.escopo.id, c.vis)) { titulos.set(u.codigo, u.titulo); for (const it of u.itens) pares.push([it, u.codigo]); }
    // as aulas de um item: as que o cobrem direto e as que cobrem um item de baixo dele
    const aulasDe = (item) => [...new Set(pares.filter(([it]) => it === item || it.startsWith(item + '.')).map(([, u]) => u))];
    return { itens, titulos, aulasDe };
  });
}
const marcasDe = (usuario, c, tipo, refs) => {
  const out = {};
  if (!refs.length) return out;
  for (let i = 0; i < refs.length; i += 500) {
    const lote = refs.slice(i, i + 500);
    for (const m of db.prepare(`SELECT ref, lido, cor, atualizado_em FROM est_lj_marcas WHERE user_id = ? AND escopo_id = ? AND tipo = ? AND ref IN (${lote.map(() => '?').join(',')})`)
      .all(usuario.id, c.escopo.id, tipo, ...lote)) out[m.ref] = { lido: !!m.lido, cor: m.cor || '', atualizado_em: m.atualizado_em };
  }
  return out;
};
const diplomaPublico = (d) => ({ id: d.id, nome: d.nome, norma: d.norma, sigla: d.sigla, tipo: d.tipo, abrangencia: d.abrangencia, fonte_url: d.fonte_url,
  consultado_em: d.consultado_em, data_referencia_edital: d.data_edital, artigos: d.artigos, alterados_apos_edital: d.alterados });
function dispositivoPublico(x) {
  return { id: x.id, rotulo: x.rotulo, ordem: x.ordem, estrutura: x.estrutura, epigrafe: x.epigrafe, texto: x.texto, situacao: x.situacao, nota: x.nota,
    alterado_por: j.parse(x.alterado_por, null), texto_na_data_do_edital: x.texto_edital == null ? null : x.texto_edital, edital_indisponivel: !!x.edital_indisponivel,
    partes: j.parse(x.partes, []) };
}
const verbetePublico = (v) => ({ id: v.id, colecao: v.colecao, tipo: v.tipo, tribunal: v.tribunal, orgao: v.orgao, numero: v.numero, titulo: v.titulo, texto: v.texto, tese: v.tese,
  situacao: v.situacao, situacao_detalhe: v.situacao_detalhe, situacao_na_data_do_edital: v.situacao_edital, historico: v.historico, leading_case: v.leading_case,
  julgamento: v.julgamento, fonte_url: v.fonte_url, consultado_em: v.consultado_em });
const emLotes = (lista, fn) => { const out = []; for (let i = 0; i < lista.length; i += 500) out.push(...fn(lista.slice(i, i + 500))); return out; };
const marcadores = (n) => Array(n).fill('?').join(',');

// os itens pedidos: os da aula (`unidade`) ou um item do programa e os de baixo dele (`item`)
function itensPedidos(c, { unidade = '', item = '' } = {}) {
  const m = mapaDoPercurso(c);
  if (unidade) {
    const u = R.unidadePorCodigo(c.escopo.id, c.vis, R.slug(unidade));
    if (!u) throw erro('Aula não encontrada.', 404);
    return { codigos: u.itens.slice(), unidade: u.codigo, m };
  }
  const it = s(item, 40);
  if (!it || !m.itens.has(it)) throw erro('Item do programa não encontrado.', 404);
  return { codigos: [...m.itens.keys()].filter(k => k === it || k.startsWith(it + '.')), unidade: '', m };
}
const ordemTribunal = (t) => { const i = ORDEM_TRIBUNAL.indexOf(t); return i < 0 ? 99 : i; };
const ordemTipo = (t) => { const i = ORDEM_TIPO.indexOf(t); return i < 0 ? 99 : i; };

// (a) a LEI SECA do item: os dispositivos vinculados, por diploma, em texto oficial, com a situação e a redação na
// data do edital. O dispositivo vem inteiro; as partes que o item cita vêm marcadas (`citadas`).
function legislacaoVinculada(usuario, produto, slugEscopo, q = {}) {
  const c = abrirAcervo(usuario, produto, slugEscopo);
  const { codigos, unidade, m } = itensPedidos(c, q);
  const vs = codigos.length ? emLotes(codigos, (l) => db.prepare(`SELECT v.* FROM est_lj_vinculos v JOIN est_lj_escopo_diplomas ed ON ed.escopo_id = v.escopo_id AND ed.diploma_id = v.diploma_id
    WHERE v.escopo_id = ? AND v.tipo = 'lei' AND v.item IN (${marcadores(l.length)})`).all(c.escopo.id, ...l)) : [];
  const porDip = new Map();
  for (const v of vs) {
    if (!porDip.has(v.diploma_id)) porDip.set(v.diploma_id, new Map());
    const dm = porDip.get(v.diploma_id);
    if (!dm.has(v.dispositivo_id)) dm.set(v.dispositivo_id, { partes: new Set(), inteiro: false, itens: new Set() });
    const x = dm.get(v.dispositivo_id);
    if (v.parte) x.partes.add(v.parte); else x.inteiro = true;
    x.itens.add(v.item);
  }
  const diplomas = [];
  const refs = [];
  for (const [dip, dm] of porDip) {
    const d = db.prepare('SELECT * FROM est_lj_diplomas WHERE id = ?').get(dip);
    if (!d) continue;
    const linhas = emLotes([...dm.keys()], (l) => db.prepare(`SELECT * FROM est_lj_dispositivos WHERE diploma_id = ? AND id IN (${marcadores(l.length)})`).all(dip, ...l))
      .sort((a, b) => a.ordem - b.ordem);
    if (!linhas.length) continue;
    diplomas.push({ ...diplomaPublico(d), dispositivos: linhas.map(x => {
      const cit = dm.get(x.id);
      refs.push(dip + '|' + x.id);
      return { ...dispositivoPublico(x), citado_inteiro: cit.inteiro, citadas: [...cit.partes], itens: [...cit.itens].sort() };
    }) });
  }
  // a CF primeiro, depois os códigos; dentro do mesmo tipo, o que o item mais usa
  const peso = (t) => ({ constituicao: 0, codigo: 1 }[t] ?? 2);
  diplomas.sort((a, b) => peso(a.tipo) - peso(b.tipo) || b.dispositivos.length - a.dispositivos.length || a.nome.localeCompare(b.nome, 'pt'));
  return { unidade, itens: codigos.map(k => ({ codigo: k, texto: m.itens.get(k) || '' })), diplomas, total: refs.length, marcas: marcasDe(usuario, c, 'dispositivo', refs) };
}

// (b) a JURISPRUDÊNCIA do item: os verbetes vinculados, por tribunal e tipo, com a situação e a data
function jurisprudenciaVinculada(usuario, produto, slugEscopo, q = {}) {
  const c = abrirAcervo(usuario, produto, slugEscopo);
  const { codigos, unidade, m } = itensPedidos(c, q);
  const vs = codigos.length ? emLotes(codigos, (l) => db.prepare(`SELECT v.item, v.motivo, x.* FROM est_lj_vinculos v JOIN est_lj_escopo_verbetes ev ON ev.escopo_id = v.escopo_id AND ev.verbete_id = v.verbete_id
    JOIN est_lj_verbetes x ON x.id = v.verbete_id WHERE v.escopo_id = ? AND v.tipo = 'juris' AND v.item IN (${marcadores(l.length)})`).all(c.escopo.id, ...l)) : [];
  const por = new Map();
  for (const v of vs) {
    if (!por.has(v.id)) por.set(v.id, { ...verbetePublico(v), numero_ord: v.numero_ord, itens: new Set(), motivos: new Set() });
    por.get(v.id).itens.add(v.item);
    if (v.motivo) por.get(v.id).motivos.add(v.motivo);
  }
  const lista = [...por.values()].map(v => ({ ...v, itens: [...v.itens].sort(), motivos: [...v.motivos] }));
  const trib = new Map();
  for (const v of lista) {
    if (!trib.has(v.tribunal)) trib.set(v.tribunal, new Map());
    const tm = trib.get(v.tribunal);
    if (!tm.has(v.tipo)) tm.set(v.tipo, []);
    tm.get(v.tipo).push(v);
  }
  const tribunais = [...trib.entries()].sort((a, b) => ordemTribunal(a[0]) - ordemTribunal(b[0]) || a[0].localeCompare(b[0]))
    .map(([tribunal, tm]) => ({ tribunal, tipos: [...tm.entries()].sort((a, b) => ordemTipo(a[0]) - ordemTipo(b[0]) || a[0].localeCompare(b[0]))
      .map(([tipo, vs2]) => ({ tipo, verbetes: vs2.sort((a, b) => a.numero_ord - b.numero_ord || a.numero.localeCompare(b.numero)).map(({ numero_ord, ...v }) => v) })) }));
  return { unidade, itens: codigos.map(k => ({ codigo: k, texto: m.itens.get(k) || '' })), tribunais, total: lista.length, marcas: marcasDe(usuario, c, 'verbete', lista.map(v => v.id)) };
}

// (c) ACERVO DE LEGISLAÇÃO — a lista dos diplomas do percurso (com busca pelo nome) e o diploma inteiro por demanda
function acervoLegislacao(usuario, produto, slugEscopo, { q = '' } = {}) {
  const c = abrirAcervo(usuario, produto, slugEscopo);
  let ds = db.prepare(`SELECT d.*, (SELECT COUNT(DISTINCT v.dispositivo_id) FROM est_lj_vinculos v WHERE v.escopo_id = ed.escopo_id AND v.tipo = 'lei' AND v.diploma_id = d.id) AS cobrados
    FROM est_lj_escopo_diplomas ed JOIN est_lj_diplomas d ON d.id = ed.diploma_id WHERE ed.escopo_id = ?`).all(c.escopo.id);
  const total = ds.length;
  const termo = semAcento(s(q, 120));
  if (termo) ds = ds.filter(d => termo.split(/\s+/).every(t => semAcento([d.nome, d.norma, d.sigla, d.id].join(' ')).includes(t)));
  const peso = (t) => ({ constituicao: 0, codigo: 1 }[t] ?? 2);
  ds.sort((a, b) => peso(a.tipo) - peso(b.tipo) || (b.cobrados > 0) - (a.cobrados > 0) || a.nome.localeCompare(b.nome, 'pt'));
  return { total, diplomas: ds.map(d => ({ ...diplomaPublico(d), cobrados: d.cobrados })) };
}
function diplomaInteiro(usuario, produto, slugEscopo, diplomaId) {
  const c = abrirAcervo(usuario, produto, slugEscopo);
  const id = s(diplomaId, 80);
  const d = db.prepare('SELECT d.* FROM est_lj_escopo_diplomas ed JOIN est_lj_diplomas d ON d.id = ed.diploma_id WHERE ed.escopo_id = ? AND d.id = ?').get(c.escopo.id, id);
  if (!d) throw erro('Diploma não encontrado neste percurso.', 404);
  const m = mapaDoPercurso(c);
  const cob = new Map();
  for (const v of db.prepare("SELECT item, dispositivo_id, parte FROM est_lj_vinculos WHERE escopo_id = ? AND tipo = 'lei' AND diploma_id = ?").all(c.escopo.id, id)) {
    if (!cob.has(v.dispositivo_id)) cob.set(v.dispositivo_id, { itens: new Set(), partes: new Set(), inteiro: false });
    const x = cob.get(v.dispositivo_id);
    x.itens.add(v.item);
    if (v.parte) x.partes.add(v.parte); else x.inteiro = true;
  }
  const aulasUsadas = new Set();
  const dispositivos = db.prepare('SELECT * FROM est_lj_dispositivos WHERE diploma_id = ? ORDER BY ordem').all(id).map(x => {
    const cb = cob.get(x.id);
    const o = dispositivoPublico(x);
    if (cb) {
      const itens = [...cb.itens].sort();
      const aulas = [...new Set(itens.flatMap(it => m.aulasDe(it)))];
      aulas.forEach(a => aulasUsadas.add(a));
      Object.assign(o, { cobrado: true, itens, aulas, citado_inteiro: cb.inteiro, citadas: [...cb.partes] });
    }
    return o;
  });
  const marcas = {};
  const pref = id + '|';
  for (const mk of db.prepare("SELECT ref, lido, cor FROM est_lj_marcas WHERE user_id = ? AND escopo_id = ? AND tipo = 'dispositivo' AND substr(ref, 1, ?) = ?").all(usuario.id, c.escopo.id, pref.length, pref)) {
    marcas[mk.ref] = { lido: !!mk.lido, cor: mk.cor || '' };
  }
  return { diploma: { ...diplomaPublico(d), estrutura: j.parse(d.estrutura, []) }, dispositivos, cobrados: cob.size,
    aulas: Object.fromEntries([...aulasUsadas].map(a => [a, m.titulos.get(a) || a])), itens: Object.fromEntries([...new Set([...cob.values()].flatMap(x => [...x.itens]))].map(i => [i, m.itens.get(i) || ''])), marcas };
}

// (d) ACERVO DE JURISPRUDÊNCIA — filtros (tribunal, coleção, tipo, situação, disciplina), busca de texto e páginas
function filtrosJuris(c, f) {
  const onde = ['ev.escopo_id = ?'], args = [c.escopo.id];
  const tribunal = s(f.tribunal, 40), colecao = s(f.colecao, 80), tipo = s(f.tipo, 40), situacao = s(f.situacao, 40), disciplina = s(f.disciplina, 30), q = s(f.q, 200);
  if (tribunal) { onde.push('v.tribunal = ?'); args.push(tribunal); }
  if (colecao) { onde.push('v.colecao = ?'); args.push(colecao); }
  if (tipo) { onde.push('v.tipo = ?'); args.push(tipo); }
  if (situacao) { onde.push('v.situacao = ?'); args.push(situacao); }
  if (disciplina) {
    if (!DISCIPLINA.test(disciplina)) throw erro('Disciplina inválida.');
    onde.push("v.id IN (SELECT verbete_id FROM est_lj_vinculos WHERE escopo_id = ? AND tipo = 'juris' AND (item = ? OR item LIKE ? || '.%'))");
    args.push(c.escopo.id, disciplina, disciplina);
  }
  if (q) {
    const fq = consultaFTS(q);
    if (FTS && fq) { onde.push('v.rowid IN (SELECT rowid FROM est_lj_fts_juris WHERE est_lj_fts_juris MATCH ?)'); args.push(fq); }
    else {
      for (const t of q.split(/\s+/).filter(Boolean).slice(0, 8)) {
        onde.push("(v.texto LIKE ? ESCAPE '\\' OR v.titulo LIKE ? ESCAPE '\\' OR v.tese LIKE ? ESCAPE '\\' OR v.numero LIKE ? ESCAPE '\\')");
        const lk = '%' + t.replace(/[\\%_]/g, (x) => '\\' + x) + '%';
        args.push(lk, lk, lk, lk);
      }
    }
  }
  return { onde: onde.join(' AND '), args, aplicados: { tribunal, colecao, tipo, situacao, disciplina, q } };
}
// a ordem do acervo: o tribunal (TST, TRT-10, STF, STJ), o tipo (súmula antes de OJ, OJ antes de precedente e tema) e o número
const ORDEM_TIPO = ['sumula_vinculante', 'sumula', 'oj', 'precedente_normativo', 'tema_irr', 'tema_iac', 'tema_irdr', 'irdr', 'iac', 'iuj', 'tema_rg', 'tema_repetitivo'];
const ORDEM_JURIS = `CASE v.tribunal ${ORDEM_TRIBUNAL.map((t, i) => `WHEN '${t}' THEN ${i}`).join(' ')} ELSE 99 END,
  CASE v.tipo ${ORDEM_TIPO.map((t, i) => `WHEN '${t}' THEN ${i}`).join(' ')} ELSE 99 END, v.colecao, v.numero_ord, v.numero, v.id`;
function acervoJurisprudencia(usuario, produto, slugEscopo, f = {}) {
  const c = abrirAcervo(usuario, produto, slugEscopo);
  const { onde, args, aplicados } = filtrosJuris(c, f);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM est_lj_escopo_verbetes ev JOIN est_lj_verbetes v ON v.id = ev.verbete_id WHERE ${onde}`).get(...args).n;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(paginas, Math.max(1, parseInt(f.pagina, 10) || 1));
  const linhas = db.prepare(`SELECT v.* FROM est_lj_escopo_verbetes ev JOIN est_lj_verbetes v ON v.id = ev.verbete_id WHERE ${onde} ORDER BY ${ORDEM_JURIS} LIMIT ? OFFSET ?`)
    .all(...args, POR_PAGINA, (pagina - 1) * POR_PAGINA);
  const m = mapaDoPercurso(c);
  const ids = linhas.map(v => v.id);
  const itensDe = new Map();
  if (ids.length) for (const v of db.prepare(`SELECT verbete_id, item FROM est_lj_vinculos WHERE escopo_id = ? AND tipo = 'juris' AND verbete_id IN (${marcadores(ids.length)})`).all(c.escopo.id, ...ids)) {
    if (!itensDe.has(v.verbete_id)) itensDe.set(v.verbete_id, new Set());
    itensDe.get(v.verbete_id).add(v.item);
  }
  const aulasUsadas = new Set();
  const itens = linhas.map(v => {
    const its = [...(itensDe.get(v.id) || [])].sort();
    const aulas = [...new Set(its.flatMap(it => m.aulasDe(it)))];
    aulas.forEach(a => aulasUsadas.add(a));
    return { ...verbetePublico(v), itens: its, aulas };
  });
  return { total, pagina, paginas, por_pagina: POR_PAGINA, filtros: aplicados, itens, facetas: facetasJuris(c),
    aulas: Object.fromEntries([...aulasUsadas].map(a => [a, m.titulos.get(a) || a])), marcas: marcasDe(usuario, c, 'verbete', ids) };
}
// as opções dos filtros, com quantos verbetes cada uma tem no percurso (não dependem do filtro aplicado)
function facetasJuris(c) {
  return R.memo(`lj:facetas:${c.escopo.id}`, () => {
    const e = c.escopo.id;
    const base = 'FROM est_lj_escopo_verbetes ev JOIN est_lj_verbetes v ON v.id = ev.verbete_id WHERE ev.escopo_id = ?';
    const tribunais = db.prepare(`SELECT v.tribunal AS valor, COUNT(*) AS n ${base} GROUP BY v.tribunal`).all(e).sort((a, b) => ordemTribunal(a.valor) - ordemTribunal(b.valor) || a.valor.localeCompare(b.valor));
    const colecoes = db.prepare(`SELECT c.id AS valor, c.nome, c.tribunal, COUNT(*) AS n ${base.replace('WHERE', 'JOIN est_lj_colecoes c ON c.id = v.colecao WHERE')} GROUP BY c.id`).all(e)
      .sort((a, b) => ordemTribunal(a.tribunal) - ordemTribunal(b.tribunal) || a.nome.localeCompare(b.nome, 'pt'));
    const tipos = db.prepare(`SELECT v.tipo AS valor, COUNT(*) AS n ${base} GROUP BY v.tipo ORDER BY n DESC`).all(e);
    const situacoes = db.prepare(`SELECT v.situacao AS valor, COUNT(*) AS n ${base} GROUP BY v.situacao ORDER BY n DESC`).all(e);
    // as disciplinas do programa (o item de dois níveis, "1.1") que têm verbete vinculado
    const m = mapaDoPercurso(c);
    const porDisc = new Map();
    for (const v of db.prepare("SELECT item, verbete_id FROM est_lj_vinculos WHERE escopo_id = ? AND tipo = 'juris'").all(e)) {
      const d = v.item.split('.').slice(0, 2).join('.');
      if (!porDisc.has(d)) porDisc.set(d, new Set());
      porDisc.get(d).add(v.verbete_id);
    }
    const disciplinas = [...porDisc.entries()].map(([codigo, set]) => ({ valor: codigo, nome: m.itens.get(codigo) || codigo, n: set.size }))
      .sort((a, b) => a.valor.localeCompare(b.valor, 'pt', { numeric: true }));
    return { tribunais, colecoes, tipos, situacoes, disciplinas };
  });
}
function verbete(usuario, produto, slugEscopo, id) {
  const c = abrirAcervo(usuario, produto, slugEscopo);
  const v = db.prepare('SELECT v.* FROM est_lj_escopo_verbetes ev JOIN est_lj_verbetes v ON v.id = ev.verbete_id WHERE ev.escopo_id = ? AND v.id = ?').get(c.escopo.id, s(id, 160));
  if (!v) throw erro('Verbete não encontrado neste percurso.', 404);
  const m = mapaDoPercurso(c);
  const itens = db.prepare("SELECT DISTINCT item FROM est_lj_vinculos WHERE escopo_id = ? AND tipo = 'juris' AND verbete_id = ? ORDER BY item").all(c.escopo.id, v.id).map(x => x.item);
  const aulas = [...new Set(itens.flatMap(it => m.aulasDe(it)))];
  return { verbete: { ...verbetePublico(v), itens, aulas }, aulas: Object.fromEntries(aulas.map(a => [a, m.titulos.get(a) || a])),
    itens: Object.fromEntries(itens.map(i => [i, m.itens.get(i) || ''])), marcas: marcasDe(usuario, c, 'verbete', [v.id]) };
}

// (e) BUSCA ÚNICA nos dois acervos — o trecho achado vem entre MARCA_INI e MARCA_FIM
const POR_BUSCA = 20;
function trechoLike(txt, termos) {
  const t = String(txt || ''), base = semAcento(t);
  let i = -1;
  for (const x of termos) { i = base.indexOf(semAcento(x)); if (i >= 0) break; }
  if (i < 0) return t.slice(0, 160) + (t.length > 160 ? '…' : '');
  const ini = Math.max(0, i - 70), fim = Math.min(t.length, i + 110);
  return (ini > 0 ? '…' : '') + t.slice(ini, fim) + (fim < t.length ? '…' : '');
}
function busca(usuario, produto, slugEscopo, { q = '', onde = 'todos', pagina = 1 } = {}) {
  const c = abrirAcervo(usuario, produto, slugEscopo);
  const termo = s(q, 200);
  if (termo.length < 2) throw erro('Digite ao menos duas letras para buscar.');
  const pg = Math.max(1, Math.min(50, parseInt(pagina, 10) || 1)), off = (pg - 1) * POR_BUSCA;
  const fq = consultaFTS(termo);
  const out = { q: termo, pagina: pg, por_pagina: POR_BUSCA, lei: [], juris: [], total_lei: 0, total_juris: 0 };
  const termos = termo.split(/\s+/).filter(Boolean).slice(0, 8);
  const like = (t) => '%' + t.replace(/[\\%_]/g, (x) => '\\' + x) + '%';
  if (onde !== 'juris') {
    if (FTS && fq) {
      const de = `FROM est_lj_fts_lei f JOIN est_lj_dispositivos d ON d.rowid = f.rowid JOIN est_lj_escopo_diplomas ed ON ed.diploma_id = d.diploma_id AND ed.escopo_id = ?
        JOIN est_lj_diplomas p ON p.id = d.diploma_id WHERE est_lj_fts_lei MATCH ?`;
      out.total_lei = db.prepare(`SELECT COUNT(*) AS n ${de}`).get(c.escopo.id, fq).n;
      out.lei = db.prepare(`SELECT d.diploma_id, d.id, d.rotulo, d.situacao, p.nome, p.sigla, snippet(est_lj_fts_lei, 1, '${MARCA_INI}', '${MARCA_FIM}', '…', 24) AS trecho ${de} ORDER BY rank LIMIT ? OFFSET ?`)
        .all(c.escopo.id, fq, POR_BUSCA, off);
    } else {
      const cond = termos.map(() => "d.texto || ' ' || d.partes LIKE ? ESCAPE '\\'").join(' AND ');
      const de = `FROM est_lj_dispositivos d JOIN est_lj_escopo_diplomas ed ON ed.diploma_id = d.diploma_id AND ed.escopo_id = ? JOIN est_lj_diplomas p ON p.id = d.diploma_id WHERE ${cond}`;
      const as = termos.map(like);
      out.total_lei = db.prepare(`SELECT COUNT(*) AS n ${de}`).get(c.escopo.id, ...as).n;
      out.lei = db.prepare(`SELECT d.diploma_id, d.id, d.rotulo, d.situacao, d.texto, p.nome, p.sigla ${de} ORDER BY p.nome, d.ordem LIMIT ? OFFSET ?`).all(c.escopo.id, ...as, POR_BUSCA, off)
        .map(({ texto: t, ...x }) => ({ ...x, trecho: trechoLike(t, termos) }));
    }
  }
  if (onde !== 'lei') {
    if (FTS && fq) {
      const de = `FROM est_lj_fts_juris f JOIN est_lj_verbetes v ON v.rowid = f.rowid JOIN est_lj_escopo_verbetes ev ON ev.verbete_id = v.id AND ev.escopo_id = ? WHERE est_lj_fts_juris MATCH ?`;
      out.total_juris = db.prepare(`SELECT COUNT(*) AS n ${de}`).get(c.escopo.id, fq).n;
      out.juris = db.prepare(`SELECT v.id, v.tribunal, v.tipo, v.numero, v.titulo, v.situacao, snippet(est_lj_fts_juris, 1, '${MARCA_INI}', '${MARCA_FIM}', '…', 24) AS trecho ${de} ORDER BY rank LIMIT ? OFFSET ?`)
        .all(c.escopo.id, fq, POR_BUSCA, off);
    } else {
      const cond = termos.map(() => "(v.texto || ' ' || v.titulo || ' ' || v.tese) LIKE ? ESCAPE '\\'").join(' AND ');
      const de = `FROM est_lj_verbetes v JOIN est_lj_escopo_verbetes ev ON ev.verbete_id = v.id AND ev.escopo_id = ? WHERE ${cond}`;
      const as = termos.map(like);
      out.total_juris = db.prepare(`SELECT COUNT(*) AS n ${de}`).get(c.escopo.id, ...as).n;
      out.juris = db.prepare(`SELECT v.id, v.tribunal, v.tipo, v.numero, v.titulo, v.situacao, v.texto ${de} ORDER BY ${ORDEM_JURIS} LIMIT ? OFFSET ?`).all(c.escopo.id, ...as, POR_BUSCA, off)
        .map(({ texto: t, ...x }) => ({ ...x, trecho: trechoLike(t, termos) }));
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// MARCAÇÃO DE LEITURA — "lido" e grifo (amarelo | verde), por dispositivo e por verbete. É do aluno: ninguém mais
// vê; sai na exportação e na exclusão (repo.js › TEXTOS_DO_ALUNO). Desmarcar tudo apaga a linha.
// ---------------------------------------------------------------------
function confereAlvo(c, tipo, ref) {
  if (tipo === 'dispositivo') {
    const [dip, did] = ref.split('|');
    if (!dip || !did || !db.prepare('SELECT 1 FROM est_lj_escopo_diplomas ed JOIN est_lj_dispositivos d ON d.diploma_id = ed.diploma_id WHERE ed.escopo_id = ? AND d.diploma_id = ? AND d.id = ?').get(c.escopo.id, dip, did)) throw erro('Dispositivo não encontrado neste percurso.', 404);
  } else if (tipo === 'verbete') {
    if (!db.prepare('SELECT 1 FROM est_lj_escopo_verbetes WHERE escopo_id = ? AND verbete_id = ?').get(c.escopo.id, ref)) throw erro('Verbete não encontrado neste percurso.', 404);
  } else throw erro('tipo deve ser dispositivo|verbete.');
}
function marcar(usuario, produto, slugEscopo, d = {}) {
  const c = abrirAcervo(usuario, produto, slugEscopo);
  const tipo = s(d.tipo, 20), ref = s(d.ref, 300);
  confereAlvo(c, tipo, ref);
  const atual = db.prepare('SELECT lido, cor FROM est_lj_marcas WHERE user_id = ? AND escopo_id = ? AND tipo = ? AND ref = ?').get(usuario.id, c.escopo.id, tipo, ref);
  const lido = d.lido == null ? !!(atual && atual.lido) : d.lido === true;
  const cor = d.cor == null ? ((atual && atual.cor) || '') : s(d.cor, 20);
  if (cor && !CORES.includes(cor)) throw erro(`cor deve ser ${CORES.join('|')} (ou vazia, para tirar o grifo).`);
  if (!lido && !cor) {
    db.prepare('DELETE FROM est_lj_marcas WHERE user_id = ? AND escopo_id = ? AND tipo = ? AND ref = ?').run(usuario.id, c.escopo.id, tipo, ref);
    return { ok: true, marca: { tipo, ref, lido: false, cor: '' } };
  }
  if (!atual && db.prepare('SELECT COUNT(*) AS n FROM est_lj_marcas WHERE user_id = ? AND escopo_id = ?').get(usuario.id, c.escopo.id).n >= LIMITE.marcasPorEscopo) {
    throw erro('Você chegou ao limite de marcações de leitura deste percurso.', 409);
  }
  const em = nowISO();
  db.prepare(`INSERT INTO est_lj_marcas (user_id, escopo_id, tipo, ref, lido, cor, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, escopo_id, tipo, ref) DO UPDATE SET lido = excluded.lido, cor = excluded.cor, atualizado_em = excluded.atualizado_em`)
    .run(usuario.id, c.escopo.id, tipo, ref, lido ? 1 : 0, cor, em);
  return { ok: true, marca: { tipo, ref, lido, cor, atualizado_em: em } };
}
function marcas(usuario, produto, slugEscopo, { tipo = '' } = {}) {
  const c = abrirAcervo(usuario, produto, slugEscopo);
  const t = s(tipo, 20);
  const linhas = db.prepare(`SELECT tipo, ref, lido, cor, atualizado_em FROM est_lj_marcas WHERE user_id = ? AND escopo_id = ?${t ? ' AND tipo = ?' : ''} ORDER BY atualizado_em DESC`)
    .all(usuario.id, c.escopo.id, ...(t ? [t] : []));
  return { cores: CORES, marcas: linhas.map(m => ({ tipo: m.tipo, ref: m.ref, lido: !!m.lido, cor: m.cor || '', atualizado_em: m.atualizado_em })) };
}

module.exports = {
  // staff
  importarDiploma, importarJurisprudencia, importarVinculos, definirEstado, remover, resumoStaff,
  // aluno
  abrirAcervo, resumoParaPainel, legislacaoVinculada, jurisprudenciaVinculada, acervoLegislacao, diplomaInteiro, acervoJurisprudencia, verbete, busca, marcar, marcas,
  // para os testes
  validarDiploma, consultaFTS, temFTS, SITUACOES, SITUACOES_JURIS, CORES, LIMITE, POR_PAGINA, MARCA_INI, MARCA_FIM,
};
