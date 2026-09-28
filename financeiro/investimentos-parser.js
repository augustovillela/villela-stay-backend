// =====================================================================
// Parser em lotes dos arquivos brutos CVM/SEC.
//
// ZIPs são catalogados antes do conteúdo e lidos com lazyEntries. O
// checkpoint lógico é entrada + registro, nunca offset comprimido.
// =====================================================================
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { Transform } = require('stream');
const { DatabaseSync } = require('node:sqlite');
const yauzl = require('yauzl');
const { parse } = require('csv-parse');
const contratos = require('./investimentos-contratos-mercado');

const PARSER_VERSAO = 3;
const MAX_JSON_ENTRADA = 64 * 1024 * 1024;

class ErroParserMercado extends Error {
  constructor(msg, { permanente = true } = {}) {
    super(msg);
    this.name = 'ErroParserMercado';
    this.permanente = permanente;
  }
}

const entradaMeta = (entry) => ({
  nome: entry.fileName,
  diretorio: /\/$/.test(entry.fileName),
  tamanhoCompactado: Number(entry.compressedSize),
  tamanhoDescompactado: Number(entry.uncompressedSize),
});

async function catalogarZip(caminho, catalogoPath, { limites = contratos.LIMITES_ZIP, onEntrada, onEntradas } = {}) {
  const catalogo = new DatabaseSync(catalogoPath);
  catalogo.exec(`CREATE TABLE IF NOT EXISTS entradas (
    nome TEXT PRIMARY KEY, ordem INTEGER NOT NULL UNIQUE,
    compactado INTEGER NOT NULL, descompactado INTEGER NOT NULL, diretorio INTEGER NOT NULL
  ); DELETE FROM entradas;`);
  const inserir = catalogo.prepare(`INSERT OR IGNORE INTO entradas
    (nome,ordem,compactado,descompactado,diretorio) VALUES (?,?,?,?,?)`);
  let ordem = 0;
  let lote = [];
  const validador = contratos.criarValidadorZip(limites, nome => {
    const existe = catalogo.prepare('SELECT 1 FROM entradas WHERE nome=?').get(nome);
    return !existe;
  });
  const zip = await yauzl.openPromise(caminho, {
    lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true,
  });
  try {
    for await (const entry of zip.eachEntry()) {
      ordem++;
      const meta = entradaMeta(entry);
      validador.adicionar(meta);
      inserir.run(meta.nome, ordem, meta.tamanhoCompactado, meta.tamanhoDescompactado, meta.diretorio ? 1 : 0);
      const completa = { ...meta, ordem };
      if (onEntrada) await onEntrada(completa);
      if (onEntradas) {
        lote.push(completa);
        if (lote.length >= 500) { await onEntradas(lote); lote = []; }
      }
    }
    if (lote.length && onEntradas) await onEntradas(lote);
    return { ...validador.resultado(), catalogoPath };
  } finally {
    try { zip.close(); } catch { /* autoClose pode já ter fechado */ }
    catalogo.close();
  }
}

async function lerBufferLimitado(stream, limite = MAX_JSON_ENTRADA) {
  const partes = [];
  let total = 0;
  const hash = crypto.createHash('sha256');
  for await (const bruto of stream) {
    const chunk = Buffer.from(bruto);
    total += chunk.length;
    if (total > limite) throw new ErroParserMercado('Entrada JSON excede o limite de memória do parser.');
    hash.update(chunk);
    partes.push(chunk);
  }
  return { buffer: Buffer.concat(partes, total), sha256: hash.digest('hex'), bytes: total };
}

const principal = identidade => {
  const p = (identidade.identificadores || []).find(x => x.principal)
    || (identidade.identificadores || [])[0] || {};
  return { sistema: p.sistema || '', valor: p.valor || '' };
};

async function processarCsv(stream, job, handlers, progresso) {
  const hash = crypto.createHash('sha256');
  const medidor = new Transform({ transform(chunk, _enc, cb) { hash.update(chunk); cb(null, chunk); } });
  const linhas = stream.pipe(medidor).pipe(parse({
    columns: true, delimiter: ';', bom: true, skip_empty_lines: true,
    // Os CSVs oficiais da CVM usam Windows-1252/ISO-8859-1 e existem
    // descrições não delimitadas com aspas literais, por exemplo ("VJORA").
    // A tolerância é restrita às aspas; a contagem de colunas continua rígida.
    encoding: 'latin1', relax_column_count: false, relax_quotes: true,
  }));
  let registros = 0;
  for await (const obj of linhas) {
    let identidade;
    let registro;
    if (job.conjunto === 'cvm_cadastro_companhias') {
      identidade = contratos.identidadeCvm(obj);
      registro = { tipo: 'identidade', identidade };
    } else if (obj.CNPJ_CIA && obj.CD_CONTA && obj.DT_REFER && obj.VERSAO) {
      const fato = contratos.fatoCvm(obj);
      identidade = fato.identidade;
      const id = principal(identidade);
      const { identidade: _omitida, ...fatoSemIdentidade } = fato;
      registro = { tipo: 'fato', identificador: id, ...fatoSemIdentidade };
    } else continue;
    registros++;
    if (handlers.onIdentidade) await handlers.onIdentidade(identidade);
    if (registros > progresso.pular) await handlers.onRegistro(registro, registros);
  }
  return { registros, sha256: hash.digest('hex') };
}

async function processarJson(stream, job, handlers, progresso) {
  const lido = await lerBufferLimitado(stream);
  let doc;
  try { doc = JSON.parse(lido.buffer.toString('utf8')); }
  catch { throw new ErroParserMercado('Entrada SEC contém JSON inválido.'); }
  const identidade = contratos.identidadeSec(doc);
  if (handlers.onIdentidade) await handlers.onIdentidade(identidade);
  let registros = 0;
  if (job.conjunto === 'sec_companyfacts_integral') {
    for (const fato of contratos.fatosSec(doc)) {
      registros++;
      if (registros <= progresso.pular) continue;
      const id = principal(fato.identidade);
      const { identidade: _omitida, ...fatoSemIdentidade } = fato;
      await handlers.onRegistro({ tipo: 'fato', identificador: id, ...fatoSemIdentidade }, registros);
    }
  } else {
    registros = 1;
    if (registros > progresso.pular) await handlers.onRegistro({ tipo: 'identidade', identidade }, registros);
  }
  return { registros, sha256: lido.sha256 };
}

async function processarZip(caminho, job, handlers, checkpoint = {}) {
  const inicioOrdem = Number(checkpoint.entradaOrdem || 1);
  const pularInicial = Number(checkpoint.registroNaEntrada || 0);
  const zip = await yauzl.openPromise(caminho, {
    lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true,
  });
  let ordem = 0;
  const saida = { entradas: 0, registros: 0, ignoradas: 0 };
  try {
    for await (const entry of zip.eachEntry()) {
      ordem++;
      if (/\/$/.test(entry.fileName) || ordem < inicioOrdem) continue;
      const ext = String(entry.fileName).toLowerCase().split('.').pop();
      if (!['csv', 'json'].includes(ext)) { saida.ignoradas++; continue; }
      const stream = await zip.openReadStreamPromise(entry);
      const progresso = { entradaOrdem: ordem, nome: entry.fileName, pular: ordem === inicioOrdem ? pularInicial : 0 };
      if (handlers.onEntradaIniciada) await handlers.onEntradaIniciada(progresso);
      let r;
      if (ext === 'csv' && job.jurisdicao === 'BR') r = await processarCsv(stream, job, handlers, progresso);
      else if (ext === 'json' && job.jurisdicao === 'US') r = await processarJson(stream, job, handlers, progresso);
      else { stream.resume(); saida.ignoradas++; continue; }
      saida.entradas++;
      saida.registros += r.registros;
      if (handlers.onEntradaConcluida) await handlers.onEntradaConcluida({
        ...progresso, registros: r.registros, sha256: r.sha256,
      });
    }
    return saida;
  } finally {
    try { zip.close(); } catch { /* autoClose pode já ter fechado */ }
  }
}

async function processarArquivo(caminho, job, handlers, checkpoint = {}) {
  if (job.formato === 'zip') return processarZip(caminho, job, handlers, checkpoint);
  const stream = fs.createReadStream(caminho);
  const progresso = {
    entradaOrdem: 1, nome: caminho, pular: Number(checkpoint.registroNaEntrada || 0),
  };
  if (handlers.onEntradaIniciada) await handlers.onEntradaIniciada(progresso);
  const r = await processarCsv(stream, job, handlers, progresso);
  if (handlers.onEntradaConcluida) await handlers.onEntradaConcluida({
    entradaOrdem: 1, nome: caminho, registros: r.registros, sha256: r.sha256,
  });
  return { entradas: 1, registros: r.registros, ignoradas: 0 };
}

module.exports = {
  PARSER_VERSAO, MAX_JSON_ENTRADA, ErroParserMercado,
  catalogarZip, lerBufferLimitado, processarCsv, processarJson, processarZip, processarArquivo,
};
