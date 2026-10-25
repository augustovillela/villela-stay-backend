// =====================================================================
// Villela Legal · ACERVO DE LEGISLAÇÃO (repo público ctresb/leis, MIT)
//
// Índice ÚNICO e compartilhado por todos os escritórios (é dado público):
// metadados + ementa em SQLite FTS5, em DATA_DIR/acervo-leis/leis.db — fora
// do padrão legal-<tenant>, que o db.js trata como banco de escritório.
// O texto integral NÃO mora no servidor (10,6 GB no acervo inteiro, o disco
// tem 1 GB): é buscado sob demanda no GitHub, no COMMIT FIXADO no índice,
// para o texto não mudar debaixo de quem leu.
//
// O acervo ACHA a norma; quem atesta vigência é gente. "Trazer para a Base
// normativa" cria a linha em `norms` com conferida_em VAZIO (trava 33.4) e
// fonte_url = fonte OFICIAL do cabeçalho, nunca o GitHub.
//
// O índice é gerado no PC por stays\leis_acervo.py exportar e enviado pela
// rota de admin registrada no montar() — nunca pela ponte do assinante.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const REPO = 'ctresb/leis';
const MAX_TEXTO = 6 * 1024 * 1024;
const CACHE_MAX = 200;

let dir = process.env.ACERVO_LEIS_DIR || path.join(DATA_DIR, 'acervo-leis');
let buscarTexto = (url) => fetch(url, { signal: AbortSignal.timeout(15000) });
let db = null, meta = null;
const cache = new Map();

const arquivoIndice = () => path.join(dir, 'leis.db');

function abrir() {
  if (db) return db;
  if (!fs.existsSync(arquivoIndice())) return null;
  db = new DatabaseSync(arquivoIndice(), { readOnly: true });
  meta = Object.fromEntries(db.prepare('SELECT chave, valor FROM meta').all().map(r => [r.chave, r.valor]));
  return db;
}

function fechar() {
  if (db) { try { db.close(); } catch (_) { /* já fechado */ } }
  db = null; meta = null; cache.clear();
}

function status() {
  const d = abrir();
  if (!d) return { instalado: false };
  return {
    instalado: true, commit: meta.commit || '', gerado_em: meta.gerado_em || '', escopo: meta.escopo || '',
    total: d.prepare('SELECT COUNT(*) n FROM normas').get().n,
    por_esfera: d.prepare('SELECT esfera, COUNT(*) n FROM normas GROUP BY esfera ORDER BY n DESC').all(),
  };
}

const VAZIAS = new Set(('a o e as os da de do das dos em no na nos nas um uma para por pelo pela com sem ao aos '
  + 'que se sobre entre ou lei art artigo').split(' '));
const semAcento = (p) => p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Singular/plural e masculino/feminino de cada palavra, como termos EXATOS. Prefixo (locac*) seria
// mais simples, mas no índice do texto integral "func*" expande para milhares de palavras e a
// busca levou 107 s; termo exato é uma consulta direta.
// só a PRIMEIRA terminação que casa vale (locacao termina em -cao, não deve virar "locacaa")
const TERMINACOES = [
  ['coes', ['cao']], ['cao', ['coes']], ['oes', ['ao']], ['aes', ['ao']], ['ao', ['oes', 'aes']],
  ['eis', ['el']], ['el', ['eis']], ['ais', ['al']], ['al', ['ais']],
  ['os', ['o', 'a', 'as']], ['as', ['a', 'o', 'os']], ['o', ['a', 'os', 'as']], ['a', ['o', 'as', 'os']],
  ['es', ['e', '']], ['e', ['es']], ['r', ['res']], ['z', ['zes']], ['s', ['']],
];
function variantes(p) {
  if (p.length < 4 || /^\d+$/.test(p)) return [p];
  const t = TERMINACOES.find(([fim]) => p.endsWith(fim) && p.length - fim.length >= 3);
  const v = t ? t[1].map(o => p.slice(0, -t[0].length) + o) : [p + 's'];
  return [...new Set([p, ...v])];
}

// Tudo entre aspas: hífen, dois-pontos e afins digitados pelo usuário não viram operador do FTS5.
// Devolve a forma E (todas as palavras, cada uma em qualquer variante) e a forma OU.
function consultaFTS(q) {
  const palavras = (String(q || '').match(/[\p{L}\p{N}]+/gu) || []).map(semAcento).filter(p => !VAZIAS.has(p));
  const grupos = [...new Set(palavras)].slice(0, 8).map(p => '(' + variantes(p).map(x => `"${x}"`).join(' OR ') + ')');
  return { e: grupos.join(' AND '), ou: grupos.join(' OR ') };
}

// achado só no corpo não tem relevância medível (índice sem posições): ordena pela hierarquia da norma
const HIERARQUIA = `CASE
  WHEN n.esfera = 'constituicao' OR n.tipo LIKE 'Emenda Constitucional%' THEN 0
  WHEN n.tipo IN ('Lei Complementar', 'Lei Ordinária', 'Lei Delegada', 'Decreto-Lei', 'Lei Orgânica') THEN 1
  WHEN n.tipo = 'Medida Provisória' THEN 2
  WHEN n.esfera = 'jurisprudencia' THEN 3
  ELSE 4 END`;

const ehRevogada = (n) => n.revogada === 'true' || /revogad/i.test(n.situacao || '');

function buscar({ q = '', esfera = '', uf = '', tipo = '', vigentes = '', n = 20 } = {}) {
  const d = abrir();
  if (!d) throw new Error('Acervo de legislação ainda não instalado neste servidor.');
  const fts = consultaFTS(q);
  if (!fts.e) throw new Error('Digite o que procurar.');
  const filtros = { esfera, uf, tipo, vigentes, n: Math.min(Math.max(parseInt(n, 10) || 20, 1), 50) };
  // todos os termos primeiro; se nada casar, qualquer um deles (a relevância ordena)
  const exatos = consulta(d, fts.e, filtros);
  return exatos.length || fts.e === fts.ou ? exatos : consulta(d, fts.ou, filtros);
}

function filtrar(sql, a, { esfera, uf, tipo, vigentes }) {
  for (const [col, val] of [['n.esfera', esfera], ['n.uf', String(uf).toUpperCase()], ['n.tipo', tipo]]) {
    if (val) { sql += ` AND ${col} = ?`; a.push(String(val).slice(0, 60)); }
  }
  if (vigentes === '1' || vigentes === true || vigentes === 'true') {
    sql += " AND n.revogada <> 'true' AND n.situacao NOT LIKE '%evogad%'";
  }
  return sql;
}

const COLUNAS = 'n.id, n.caminho, n.esfera, n.uf, n.tipo, n.numero, n.data, n.titulo, n.ementa, n.situacao, n.revogada, n.fonte';

// 1º o que casa no título/ementa (com trecho destacado); depois, se o índice tem o texto integral,
// o que só casa no corpo da norma (ex.: "temporada" está no art. 48 da Lei 8.245, não na ementa).
// O índice do texto não guarda o texto nem posições (detail=none), então não há trecho dele.
function consulta(d, match, filtros) {
  const a = [match];
  const sql = filtrar(`SELECT ${COLUNAS}, snippet(busca, 1, '[[', ']]', ' … ', 24) trecho
    FROM busca JOIN normas n ON n.id = busca.rowid WHERE busca MATCH ?`, a, filtros)
    + ' ORDER BY bm25(busca, 10.0, 3.0) LIMIT ?';
  const achados = d.prepare(sql).all(...a, filtros.n).map(r => ({ ...r, onde: 'ementa' }));
  if (meta.texto_indexado === '1' && achados.length < filtros.n) {
    const b = [match];
    const ids = achados.map(r => r.id);
    let sqlT = filtrar(`SELECT ${COLUNAS} FROM busca_texto JOIN normas n ON n.id = busca_texto.rowid
      WHERE busca_texto MATCH ?`, b, filtros);
    if (ids.length) sqlT += ` AND n.id NOT IN (${ids.map(() => '?').join(',')})`;
    sqlT += ` ORDER BY ${HIERARQUIA}, n.data DESC LIMIT ?`;
    for (const r of d.prepare(sqlT).all(...b, ...ids, filtros.n - achados.length)) achados.push({ ...r, trecho: '', onde: 'texto' });
  }
  return achados.map(({ id, ...r }) => ({ ...r, revogada: ehRevogada(r) }));
}

function obter(caminho) {
  const d = abrir();
  if (!d) return null;
  const n = d.prepare('SELECT caminho, esfera, uf, tipo, numero, data, titulo, ementa, situacao, revogada, urn, fonte FROM normas WHERE caminho = ?')
    .get(String(caminho || ''));
  return n ? { ...n, revogada: ehRevogada(n) } : null;
}

// só caminho que ESTÁ no índice vira URL — o GitHub nunca recebe entrada livre do usuário
async function texto(caminho) {
  const n = obter(caminho);
  if (!n) return null;
  const chave = meta.commit + ':' + n.caminho;
  if (cache.has(chave)) return cache.get(chave);
  const url = `https://raw.githubusercontent.com/${REPO}/${encodeURIComponent(meta.commit)}/`
    + n.caminho.split('/').map(encodeURIComponent).join('/');
  const r = await buscarTexto(url);
  if (!r.ok) throw new Error(`Texto indisponível no acervo agora (HTTP ${r.status}). Use a fonte oficial.`);
  let md = await r.text();
  if (md.length > MAX_TEXTO) md = md.slice(0, MAX_TEXTO) + '\n\n[… texto cortado — abra a fonte oficial]';
  if (md.startsWith('---')) { const fim = md.indexOf('\n---', 3); if (fim > 0) md = md.slice(fim + 4).replace(/^\n+/, ''); }
  const saida = { ...n, texto: md, acervo_url: `https://github.com/${REPO}/blob/${meta.commit}/${n.caminho}` };
  cache.set(chave, saida);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return saida;
}

// ------------------------------------------------- para a Base normativa
const TIPOS = [
  [/^constitui|emenda constitucional|lei constitucional/i, 'constituicao'],
  [/^lei complementar|decreto-lei complementar/i, 'lc'],
  [/^medida provis/i, 'mp'],
  [/^decreto/i, 'decreto'],
  [/^instru[cç][aã]o normativa/i, 'in'],
  [/^resolu/i, 'resolucao'],
  [/^portaria/i, 'portaria'],
  [/^provimento/i, 'provimento'],
  [/^lei/i, 'lei'],
];

function paraNorma(n, area = '') {
  const tipo = (TIPOS.find(([re]) => re.test(n.tipo || n.titulo || '')) || [null, 'outro'])[1];
  const ambito = n.esfera === 'estadual' ? (n.uf === 'DF' ? 'distrital' : 'estadual')
    : n.esfera === 'municipal' ? 'municipal' : 'federal';
  const ident = (n.titulo || n.caminho) + (n.esfera === 'estadual' && n.uf && n.uf !== 'DF' ? ` (${n.uf})` : '');
  return {
    tipo, ambito, identificacao: ident, area, ementa: n.ementa || '',
    vigente: !n.revogada, vigencia_desde: /^\d{4}-\d{2}-\d{2}$/.test(n.data || '') ? n.data : '',
    revogada_por: n.revogada ? (n.situacao || 'revogada (segundo o acervo)') : '',
    fonte_url: n.fonte || '',
    // conferida_em fica VAZIO de propósito: a norma nasce pendente de conferência (33.4)
  };
}

// --------------------------------------------- instalação de índice novo
function instalar(gz) {
  if (!Buffer.isBuffer(gz) || !gz.length) throw new Error('Envie o índice (.db.gz) no corpo.');
  let bruto;
  try { bruto = zlib.gunzipSync(gz, { maxOutputLength: 900 * 1024 * 1024 }); } catch (_) { throw new Error('Corpo não é um gzip válido.'); }
  if (bruto.slice(0, 16).toString('latin1') !== 'SQLite format 3\u0000') throw new Error('Conteúdo não é um banco SQLite.');
  fs.mkdirSync(dir, { recursive: true });
  const novo = arquivoIndice() + '.novo';
  fs.writeFileSync(novo, bruto);
  try {
    const t = new DatabaseSync(novo, { readOnly: true });
    const m = Object.fromEntries(t.prepare('SELECT chave, valor FROM meta').all().map(r => [r.chave, r.valor]));
    const total = t.prepare('SELECT COUNT(*) n FROM normas').get().n;
    t.prepare("SELECT rowid FROM busca WHERE busca MATCH '\"lei\"' LIMIT 1").all();
    t.close();
    if (!/^[0-9a-f]{40}$/.test(m.commit || '')) throw new Error('meta.commit ausente ou inválido.');
    if (!total) throw new Error('índice sem normas.');
  } catch (e) {
    fs.rmSync(novo, { force: true });
    throw new Error('Índice recusado: ' + e.message);
  }
  fechar();
  fs.renameSync(novo, arquivoIndice());
  return status();
}

// costuras da suíte (sem rede e sem DATA_DIR real)
function _configurar({ diretorio, fetcher } = {}) {
  fechar();
  if (diretorio) dir = diretorio;
  if (fetcher) buscarTexto = fetcher;
}

module.exports = { status, buscar, obter, texto, paraNorma, instalar, fechar, consultaFTS, _configurar };
