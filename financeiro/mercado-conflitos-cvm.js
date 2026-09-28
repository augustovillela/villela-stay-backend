// =====================================================================
// Decomposição forense dos conflitos de chave natural da DFP 2025.
//
// Execução: FINANCE_INV_CVM_CONFLICTS=on npm run finance:market-conflicts-cvm
// Somente lê bruto/normalizado da quarentena e persiste diagnóstico isolado.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');
const { Transform } = require('stream');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');
const { parse } = require('csv-parse');
const yauzl = require('yauzl');
const storagePadrao = require('../storage-s3');
const preflight = require('./mercado-preflight');
const parser = require('./investimentos-parser');
const contratos = require('./investimentos-contratos-mercado');
const worker = require('./mercado-worker');
const qualidade = require('./mercado-qualidade-cvm');

const DIAGNOSTICO_VERSAO = 1;
const SCHEMA = qualidade.SCHEMA;
const CATEGORIAS = Object.freeze([
  'equivalencia_numerica', 'contexto_omitido_chave', 'repeticao_oficial_entre_arquivos',
  'revisao_oficial_nao_representada', 'desalinhamento_csv_parser',
  'contradicao_fonte', 'indeterminada',
]);

const CONFLICT_SCHEMA_STATEMENTS = [`CREATE TABLE IF NOT EXISTS fin_quality_conflict_runs (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES fin_market_jobs(id),
  quality_run_id text NOT NULL REFERENCES fin_quality_runs(id),
  parser_versao integer NOT NULL,
  diagnostico_versao integer NOT NULL,
  fonte_sha256 text NOT NULL CHECK (length(fonte_sha256)=64),
  particoes_sha256 text NOT NULL CHECK (length(particoes_sha256)=64),
  chave_idempotencia text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('processando','concluida','falhou')),
  resultado text NOT NULL DEFAULT '',
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
)`, `CREATE TABLE IF NOT EXISTS fin_quality_conflict_groups (
  run_id text NOT NULL REFERENCES fin_quality_conflict_runs(id) ON DELETE CASCADE,
  chave_hash text NOT NULL CHECK (length(chave_hash)=64),
  cnpj text NOT NULL,
  formulario text NOT NULL DEFAULT '',
  conceito text NOT NULL DEFAULT '',
  categoria text NOT NULL,
  ocorrencias bigint NOT NULL CHECK (ocorrencias > 1),
  divergencias bigint NOT NULL CHECK (divergencias > 0),
  valores_brutos integer NOT NULL,
  valores_normalizados integer NOT NULL,
  campos_divergentes jsonb NOT NULL DEFAULT '[]'::jsonb,
  campos_resolutivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  arquivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id,chave_hash)
)`, `CREATE TABLE IF NOT EXISTS fin_quality_conflict_occurrences (
  run_id text NOT NULL,
  chave_hash text NOT NULL,
  ordem integer NOT NULL CHECK (ordem > 0),
  cnpj text NOT NULL,
  formulario text NOT NULL DEFAULT '',
  conceito text NOT NULL DEFAULT '',
  valor_bruto text NOT NULL DEFAULT '',
  valor_normalizado text,
  particao text NOT NULL DEFAULT '',
  linha_particao integer NOT NULL DEFAULT 0,
  arquivo_bruto text NOT NULL DEFAULT '',
  linha_bruta integer NOT NULL DEFAULT 0,
  hash_linha_bruta text NOT NULL DEFAULT '',
  campos_normalizados jsonb NOT NULL DEFAULT '{}'::jsonb,
  campos_brutos jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id,chave_hash,ordem),
  FOREIGN KEY (run_id,chave_hash) REFERENCES fin_quality_conflict_groups(run_id,chave_hash) ON DELETE CASCADE
)`];
const CONFLICT_SCHEMA_SQL = `${CONFLICT_SCHEMA_STATEMENTS.join(';\n')};`;

async function migrar(pool) {
  for (const sql of CONFLICT_SCHEMA_STATEMENTS) await pool.query(sql);
}

function configAmbiente(env = process.env) {
  if (String(env.FINANCE_INV_CVM_CONFLICTS || '').toLowerCase() !== 'on') {
    throw new Error('Diagnóstico recusado: defina FINANCE_INV_CVM_CONFLICTS=on somente na execução manual.');
  }
  if (String(env.FINANCE_INV_PARSE_WORKER || '').toLowerCase() !== 'off') {
    throw new Error('Diagnóstico recusado: FINANCE_INV_PARSE_WORKER precisa permanecer off.');
  }
  const connectionString = String(env.FINANCE_MARKET_DATABASE_URL || '').trim();
  const configS3 = {
    endpoint: String(env.FINANCE_S3_ENDPOINT || '').trim(), bucket: String(env.FINANCE_S3_BUCKET || '').trim(),
    key: String(env.FINANCE_S3_KEY || '').trim(), secret: String(env.FINANCE_S3_SECRET || '').trim(),
    region: String(env.FINANCE_S3_REGION || 'auto').trim(),
  };
  if (!connectionString) throw new Error('Diagnóstico recusado: PostgreSQL de mercado não configurado.');
  if (!configS3.endpoint || !configS3.bucket || !configS3.key || !configS3.secret) {
    throw new Error('Diagnóstico recusado: R2 não configurado.');
  }
  return { connectionString, configS3 };
}

const hashTexto = valor => crypto.createHash('sha256').update(String(valor || '')).digest('hex');
const normalizarDecimal = valor => {
  const n = qualidade.decimalEscala10(valor);
  return n === null ? null : n.toString();
};
const identificadorPrincipal = identidade => {
  const p = (identidade?.identificadores || []).find(x => x.principal)
    || (identidade?.identificadores || [])[0] || {};
  return { sistema: p.sistema || '', valor: p.valor || '' };
};
const fatoDaLinha = linha => {
  const fato = contratos.fatoCvm(linha);
  const { identidade, ...resto } = fato;
  return { tipo: 'fato', identificador: identificadorPrincipal(identidade), ...resto };
};
const chaveHash = fato => hashTexto(qualidade.chaveNatural(fato));
const mascaraCnpj = cnpj => {
  const d = String(cnpj || '').replace(/\D/g, '').padStart(14, '0');
  return `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

function criarIndice(caminho) {
  const sqlite = new DatabaseSync(caminho);
  sqlite.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=FILE;
    CREATE TABLE primeiros (chave TEXT PRIMARY KEY, valor_bruto TEXT NOT NULL);
    CREATE TABLE conflitos (chave TEXT PRIMARY KEY, divergencias INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE ocorrencias (
      chave TEXT NOT NULL, ordem INTEGER NOT NULL, cnpj TEXT NOT NULL, formulario TEXT NOT NULL,
      conceito TEXT NOT NULL, valor_bruto TEXT NOT NULL, valor_normalizado TEXT,
      particao TEXT NOT NULL, linha_particao INTEGER NOT NULL, arquivo_bruto TEXT NOT NULL DEFAULT '',
      linha_bruta INTEGER NOT NULL DEFAULT 0, hash_linha_bruta TEXT NOT NULL DEFAULT '',
      campos_normalizados TEXT NOT NULL, campos_brutos TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (chave,ordem)
    ); CREATE INDEX ocorrencias_chave ON ocorrencias(chave);`);
  return {
    sqlite,
    primeiroInserir: sqlite.prepare('INSERT OR IGNORE INTO primeiros(chave,valor_bruto) VALUES (?,?)'),
    primeiroBuscar: sqlite.prepare('SELECT valor_bruto FROM primeiros WHERE chave=?'),
    conflitoSomar: sqlite.prepare(`INSERT INTO conflitos(chave,divergencias) VALUES (?,1)
      ON CONFLICT(chave) DO UPDATE SET divergencias=divergencias+1`),
    conflitoExiste: sqlite.prepare('SELECT divergencias FROM conflitos WHERE chave=?'),
    ocorrenciaInserir: sqlite.prepare(`INSERT INTO ocorrencias
      (chave,ordem,cnpj,formulario,conceito,valor_bruto,valor_normalizado,particao,linha_particao,campos_normalizados)
      VALUES (?,?,?,?,?,?,?,?,?,?)`),
    ocorrenciaRaw: sqlite.prepare(`UPDATE ocorrencias SET arquivo_bruto=?,linha_bruta=?,hash_linha_bruta=?,campos_brutos=?
      WHERE chave=? AND ordem=?`),
  };
}

async function percorrerParticoes(partes, configS3, callback, fetchImpl = global.fetch, storage = storagePadrao) {
  let registros = 0;
  for (const parte of partes) {
    const resposta = await fetchImpl(storage.presignS3(configS3, 'GET', parte.objeto_chave, 900), {
      method: 'GET', redirect: 'manual',
    });
    if (!resposta.ok || !resposta.body) throw new Error(`R2 recusou partição ${parte.sequencia} (HTTP ${resposta.status}).`);
    const hash = crypto.createHash('sha256');
    const medidor = new Transform({ transform(chunk, _enc, cb) { hash.update(chunk); cb(null, chunk); } });
    const linhas = readline.createInterface({ input: require('stream').Readable.fromWeb(resposta.body).pipe(medidor), crlfDelay: Infinity });
    let linha = 0;
    for await (const texto of linhas) {
      linha++; if (!texto.trim()) continue;
      let fato;
      try { fato = JSON.parse(texto); } catch { throw new Error(`JSON inválido na partição ${parte.sequencia}, linha ${linha}.`); }
      await callback(fato, parte, linha);
      registros++;
    }
    if (hash.digest('hex') !== parte.sha256 || linha !== Number(parte.registros)) {
      throw new Error(`Hash ou contagem divergiu na partição ${parte.sequencia}.`);
    }
  }
  return registros;
}

function camposNormalizados(fato) {
  return {
    periodoInicio: fato.periodoInicio || '', periodoFim: fato.periodoFim || '', protocolo: fato.protocolo || '',
    escopo: fato.escopo || '', escalaMoeda: fato.contexto?.escalaMoeda || '',
    contaFixa: fato.contexto?.contaFixa || '', unidade: fato.unidade || '', rotulo: fato.rotulo || '',
    entregueEm: fato.entregueEm || '',
  };
}

async function primeiraPassagem(partes, indice, configS3, fetchImpl, storage) {
  let divergencias = 0;
  const registros = await percorrerParticoes(partes, configS3, fato => {
    const chave = chaveHash(fato), bruto = String(fato.valorTexto || '');
    if (!indice.primeiroInserir.run(chave, bruto).changes) {
      const primeiro = indice.primeiroBuscar.get(chave);
      if (primeiro && primeiro.valor_bruto !== bruto) {
        indice.conflitoSomar.run(chave); divergencias++;
      }
    }
  }, fetchImpl, storage);
  return { registros, divergencias };
}

async function segundaPassagem(partes, indice, configS3, fetchImpl, storage) {
  const ordens = new Map();
  let ocorrencias = 0;
  await percorrerParticoes(partes, configS3, (fato, parte, linha) => {
    const chave = chaveHash(fato);
    if (!indice.conflitoExiste.get(chave)) return;
    const ordem = (ordens.get(chave) || 0) + 1; ordens.set(chave, ordem);
    indice.ocorrenciaInserir.run(chave, ordem, fato.identificador?.valor || '', fato.formulario || '',
      fato.conceito || '', String(fato.valorTexto || ''), normalizarDecimal(fato.valorTexto),
      parte.objeto_chave, linha, JSON.stringify(camposNormalizados(fato)));
    ocorrencias++;
  }, fetchImpl, storage);
  return ocorrencias;
}

async function percorrerBruto(caminho, indice) {
  const conflitos = new Set([...indice.sqlite.prepare('SELECT chave FROM conflitos').iterate()].map(x => x.chave));
  const ordens = new Map();
  let encontradas = 0;
  const zip = await yauzl.openPromise(caminho, {
    lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true,
  });
  try {
    for await (const entry of zip.eachEntry()) {
      if (/\/$/.test(entry.fileName) || !/\.csv$/i.test(entry.fileName)) continue;
      const stream = await zip.openReadStreamPromise(entry);
      const linhas = stream.pipe(parse({
        columns: true, delimiter: ';', bom: true, skip_empty_lines: true, encoding: 'latin1',
        relax_column_count: false, relax_quotes: true, info: true, raw: true,
      }));
      for await (const item of linhas) {
        const linha = item.record;
        if (!linha.CNPJ_CIA || !linha.CD_CONTA || !linha.DT_REFER || !linha.VERSAO) continue;
        const fato = fatoDaLinha(linha), chave = chaveHash(fato);
        if (!conflitos.has(chave)) continue;
        const ordem = (ordens.get(chave) || 0) + 1; ordens.set(chave, ordem);
        const mudou = indice.ocorrenciaRaw.run(entry.fileName, Number(item.info?.lines || 0),
          hashTexto(item.raw || JSON.stringify(linha)), JSON.stringify(linha), chave, ordem).changes;
        if (mudou) encontradas++;
      }
    }
  } finally { try { zip.close(); } catch { /* autoClose */ } }
  return encontradas;
}

const distintos = valores => [...new Set(valores.map(v => v == null ? '' : String(v)))];
function deterministico(linhas, campos) {
  const mapa = new Map();
  for (const l of linhas) {
    const bruto = l.bruto || {};
    const assinatura = campos.map(c => c === '__arquivo' ? l.arquivo_bruto : bruto[c]).join('\u001f');
    if (!mapa.has(assinatura)) mapa.set(assinatura, new Set());
    mapa.get(assinatura).add(l.valor_normalizado == null ? `raw:${l.valor_bruto}` : l.valor_normalizado);
  }
  return [...mapa.values()].every(v => v.size === 1);
}

function classificarGrupo(linhas) {
  const brutos = distintos(linhas.map(x => x.valor_bruto));
  const normalizados = distintos(linhas.map(x => x.valor_normalizado == null ? `raw:${x.valor_bruto}` : x.valor_normalizado));
  const semBruto = linhas.some(x => !x.arquivo_bruto || !x.hash_linha_bruta);
  const desalinhado = linhas.some(x => x.bruto && String(x.bruto.VL_CONTA ?? '').trim() !== String(x.valor_bruto).trim());
  const ignorar = new Set(['VL_CONTA', 'CNPJ_CIA', 'CD_CVM', 'DENOM_CIA', 'DENOM_SOCIAL',
    'GRUPO_DFP', 'CD_CONTA', 'DT_INI_EXERC', 'DT_FIM_EXERC', 'VERSAO', 'ORDEM_EXERC', 'ESCALA_MOEDA']);
  const campos = [...new Set(linhas.flatMap(x => Object.keys(x.bruto || {})))]
    .filter(c => !ignorar.has(c) && distintos(linhas.map(x => (x.bruto || {})[c])).length > 1)
    .sort();
  const resolutivos = campos.filter(c => deterministico(linhas, [c]));
  if (distintos(linhas.map(x => x.arquivo_bruto)).length > 1 && deterministico(linhas, ['__arquivo'])) {
    resolutivos.push('__arquivo');
  }
  const todosResolvem = campos.length > 1 && deterministico(linhas, campos);
  let categoria = 'indeterminada';
  if (semBruto || desalinhado) categoria = 'desalinhamento_csv_parser';
  else if (normalizados.length === 1) categoria = 'equivalencia_numerica';
  else if (resolutivos.some(x => ['DT_REFER', 'DT_RECEB'].includes(x))
      || (todosResolvem && campos.some(x => ['DT_REFER', 'DT_RECEB'].includes(x)))) categoria = 'revisao_oficial_nao_representada';
  else if (resolutivos.includes('__arquivo')) categoria = 'repeticao_oficial_entre_arquivos';
  else if (resolutivos.length || todosResolvem) categoria = 'contexto_omitido_chave';
  else {
    const semValor = linhas.map(x => {
      const r = { ...(x.bruto || {}) }; delete r.VL_CONTA; return JSON.stringify(r);
    });
    const porContexto = new Map();
    semValor.forEach((s, i) => {
      if (!porContexto.has(s)) porContexto.set(s, new Set());
      porContexto.get(s).add(normalizados[i]);
    });
    if ([...porContexto.values()].some(v => v.size > 1)) categoria = 'contradicao_fonte';
  }
  return {
    categoria, valoresBrutos: brutos.length, valoresNormalizados: normalizados.length,
    camposDivergentes: campos, camposResolutivos: [...new Set(resolutivos)],
    arquivos: distintos(linhas.map(x => x.arquivo_bruto)).filter(Boolean),
    evidencia: { todosCamposResolvem: todosResolvem, semBruto, desalinhado },
  };
}

async function inserirLotes(client, tabela, colunas, linhas, tamanho = 150) {
  for (let inicio = 0; inicio < linhas.length; inicio += tamanho) {
    const lote = linhas.slice(inicio, inicio + tamanho), params = [];
    const valores = lote.map(l => `(${colunas.map(c => { params.push(l[c]); return `$${params.length}`; }).join(',')})`);
    await client.query(`INSERT INTO ${SCHEMA}.${tabela} (${colunas.join(',')}) VALUES ${valores.join(',')}`, params);
  }
}

async function persistir(pool, runId, indice, divergenciasEsperadas) {
  const categorias = Object.fromEntries(CATEGORIAS.map(c => [c, { grupos: 0, divergencias: 0, ocorrencias: 0 }]));
  const grupoStmt = indice.sqlite.prepare('SELECT chave,divergencias FROM conflitos ORDER BY chave');
  const ocorrStmt = indice.sqlite.prepare('SELECT * FROM ocorrencias WHERE chave=? ORDER BY ordem');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const colsG = ['run_id','chave_hash','cnpj','formulario','conceito','categoria','ocorrencias','divergencias',
      'valores_brutos','valores_normalizados','campos_divergentes','campos_resolutivos','arquivos','evidencia'];
    const colsO = ['run_id','chave_hash','ordem','cnpj','formulario','conceito','valor_bruto','valor_normalizado',
      'particao','linha_particao','arquivo_bruto','linha_bruta','hash_linha_bruta','campos_normalizados','campos_brutos'];
    let loteGrupos = [], loteOcorrencias = [], totalGrupos = 0, totalOcorrencias = 0;
    const amostras = [];
    const flush = async () => {
      if (loteGrupos.length) await inserirLotes(client, 'fin_quality_conflict_groups', colsG, loteGrupos, 100);
      if (loteOcorrencias.length) await inserirLotes(client, 'fin_quality_conflict_occurrences', colsO, loteOcorrencias, 150);
      loteGrupos = []; loteOcorrencias = [];
    };
    for (const g of grupoStmt.iterate()) {
      const linhas = ocorrStmt.all(g.chave).map(l => ({ ...l,
        bruto: JSON.parse(l.campos_brutos || '{}'), normalizado: JSON.parse(l.campos_normalizados || '{}'),
      }));
      const c = classificarGrupo(linhas), base = linhas[0];
      categorias[c.categoria].grupos++;
      categorias[c.categoria].divergencias += Number(g.divergencias);
      categorias[c.categoria].ocorrencias += linhas.length;
      totalGrupos++; totalOcorrencias += linhas.length;
      const grupo = {
        run_id: runId, chave_hash: g.chave, cnpj: base.cnpj, formulario: base.formulario,
        conceito: base.conceito, categoria: c.categoria, ocorrencias: linhas.length,
        divergencias: Number(g.divergencias), valores_brutos: c.valoresBrutos,
        valores_normalizados: c.valoresNormalizados,
        campos_divergentes: JSON.stringify(c.camposDivergentes),
        campos_resolutivos: JSON.stringify(c.camposResolutivos), arquivos: JSON.stringify(c.arquivos),
        evidencia: JSON.stringify(c.evidencia),
      };
      loteGrupos.push(grupo);
      if (amostras.length < 5) amostras.push({ cnpj: grupo.cnpj, categoria: grupo.categoria, divergencias: grupo.divergencias });
      for (const l of linhas) loteOcorrencias.push({
        run_id: runId, chave_hash: grupo.chave_hash, ordem: l.ordem, cnpj: l.cnpj,
        formulario: l.formulario, conceito: l.conceito, valor_bruto: l.valor_bruto,
        valor_normalizado: l.valor_normalizado, particao: l.particao, linha_particao: l.linha_particao,
        arquivo_bruto: l.arquivo_bruto, linha_bruta: l.linha_bruta, hash_linha_bruta: l.hash_linha_bruta,
        campos_normalizados: l.campos_normalizados, campos_brutos: l.campos_brutos,
      });
      if (loteGrupos.length >= 100 || loteOcorrencias.length >= 1000) await flush();
    }
    await flush();
    const soma = Object.values(categorias).reduce((s, x) => s + x.divergencias, 0);
    if (soma !== divergenciasEsperadas) throw new Error(`Categorias não reconciliaram divergências (${soma}/${divergenciasEsperadas}).`);
    const resumo = { divergencias: divergenciasEsperadas, grupos: totalGrupos,
      ocorrencias: totalOcorrencias, categorias };
    const indeterminadas = categorias.indeterminada.divergencias + categorias.desalinhamento_csv_parser.divergencias;
    const resultado = indeterminadas ? 'EXIGE_REVISAO' : 'DECOMPOSTO';
    await client.query(`UPDATE ${SCHEMA}.fin_quality_conflict_runs SET status='concluida',resultado=$2,
      resumo=$3::jsonb,concluido_em=now(),atualizado_em=now() WHERE id=$1`, [runId, resultado, JSON.stringify(resumo)]);
    await client.query('COMMIT');
    return { resultado, resumo, amostras };
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

async function executar({ env = process.env, fetchImpl = global.fetch, storage = storagePadrao,
  PoolClass = Pool, logger = console } = {}) {
  const inicio = Date.now(), { connectionString, configS3 } = configAmbiente(env);
  let admin, lock, pool, indice, workDir = '', runId = '';
  try {
    const saude = await preflight.executar({ configS3, postgresOpts: { connectionString }, r2Opts: { fetchImpl, storage } });
    if (!saude.ok) throw new Error(`Preflight reprovado: postgres=${saude.postgres.categoria}; r2=${saude.r2.categoria}.`);
    admin = new PoolClass({ connectionString, max: 1 }); lock = await admin.connect();
    const trava = await lock.query("SELECT pg_try_advisory_lock(hashtext('finance-market-conflicts-cvm-dfp-2025')) AS locked");
    if (!trava.rows[0]?.locked) throw new Error('Já existe decomposição CVM em execução.');
    await lock.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    pool = new PoolClass({ connectionString, max: 2 }); await migrar(pool);
    const q = await pool.query(`SELECT r.id quality_run_id,r.job_id,r.resumo,j.*
      FROM ${SCHEMA}.fin_quality_runs r JOIN ${SCHEMA}.fin_market_jobs j ON j.id=r.job_id
      WHERE r.status='concluida' AND r.resultado='REPROVADO' AND r.parser_versao=$1
      ORDER BY r.concluido_em DESC LIMIT 1`, [parser.PARSER_VERSAO]);
    const job = q.rows[0]; if (!job) throw new Error('Auditoria reprovada do parser atual não encontrada.');
    const partesR = await pool.query(`SELECT sequencia,objeto_chave,sha256,registros FROM ${SCHEMA}.fin_market_particoes
      WHERE job_id=$1 AND parser_versao=$2 ORDER BY sequencia`, [job.job_id, parser.PARSER_VERSAO]);
    const partes = partesR.rows;
    const particoesSha = hashTexto(partes.map(p => `${p.sequencia}:${p.sha256}:${p.registros}`).join('|'));
    const chave = `${job.job_id}|quality-${job.quality_run_id}|parser-${parser.PARSER_VERSAO}|diag-${DIAGNOSTICO_VERSAO}|raw-${job.sha256}|parts-${particoesSha}`;
    runId = `conflicts-cvm-${hashTexto(chave).slice(0, 32)}`;
    const anterior = await pool.query(`SELECT status,resultado,resumo FROM ${SCHEMA}.fin_quality_conflict_runs WHERE chave_idempotencia=$1`, [chave]);
    if (anterior.rows[0]) {
      if (anterior.rows[0].status !== 'concluida') throw new Error('A mesma decomposição possui tentativa incompleta; revise o histórico.');
      const r = anterior.rows[0].resumo || {};
      logger.log(`[finance-market-conflicts-cvm] OK idempotente=sim resultado=${anterior.rows[0].resultado} divergencias=${r.divergencias || 0} grupos=${r.grupos || 0}`);
      return { ok: true, idempotente: true, resultado: anterior.rows[0].resultado, ...r };
    }
    await pool.query(`INSERT INTO ${SCHEMA}.fin_quality_conflict_runs
      (id,job_id,quality_run_id,parser_versao,diagnostico_versao,fonte_sha256,particoes_sha256,chave_idempotencia,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processando')`, [runId, job.job_id, job.quality_run_id,
      parser.PARSER_VERSAO, DIAGNOSTICO_VERSAO, job.sha256, particoesSha, chave]);
    const esperadoR = await pool.query(`SELECT quantidade FROM ${SCHEMA}.fin_quality_findings
      WHERE run_id=$1 AND regra='chave_natural_valor_conflitante' AND gravidade='BLOQUEADOR'`, [job.quality_run_id]);
    const esperado = Number(esperadoR.rows[0]?.quantidade || 0);
    workDir = fs.mkdtempSync(path.join(String(env.FINANCE_INV_WORK_DIR || os.tmpdir()), 'cvm-conflicts-'));
    indice = criarIndice(path.join(workDir, 'conflitos.sqlite'));
    const primeira = await primeiraPassagem(partes, indice, configS3, fetchImpl, storage);
    if (primeira.divergencias !== esperado) throw new Error(`Releitura não reproduziu divergências (${primeira.divergencias}/${esperado}).`);
    const ocorrencias = await segundaPassagem(partes, indice, configS3, fetchImpl, storage);
    const bruto = path.join(workDir, 'origem.zip');
    await worker.baixarObjeto(job, bruto, configS3, { storage, fetchImpl });
    const brutas = await percorrerBruto(bruto, indice);
    if (brutas !== ocorrencias) throw new Error(`Proveniência bruta incompleta (${brutas}/${ocorrencias}).`);
    const persistido = await persistir(pool, runId, indice, esperado);
    const resumoCategorias = Object.entries(persistido.resumo.categorias)
      .map(([c, v]) => `${c}:${v.divergencias}`).join(',');
    logger.log(`[finance-market-conflicts-cvm] OK idempotente=nao resultado=${persistido.resultado} duracao=${Date.now() - inicio}ms registros=${primeira.registros} divergencias=${esperado} grupos=${persistido.resumo.grupos} ocorrencias=${persistido.resumo.ocorrencias}`);
    logger.log(`[finance-market-conflicts-cvm] CATEGORIAS ${resumoCategorias}`);
    const amostras = persistido.amostras.map(g => `${mascaraCnpj(g.cnpj)}:${g.categoria}:${g.divergencias}`).join(',');
    logger.log(`[finance-market-conflicts-cvm] AMOSTRAS_MASCARADAS ${amostras || 'nenhuma'}`);
    return { ok: true, idempotente: false, resultado: persistido.resultado, ...persistido.resumo };
  } catch (e) {
    if (pool && runId) try { await pool.query(`UPDATE ${SCHEMA}.fin_quality_conflict_runs SET status='falhou',erro=$2,atualizado_em=now() WHERE id=$1 AND status='processando'`, [runId, String(e.message || e).slice(0, 1000)]); } catch { /* erro original */ }
    throw e;
  } finally {
    if (indice) try { indice.sqlite.close(); } catch { /* noop */ }
    if (workDir && path.basename(workDir).startsWith('cvm-conflicts-')) try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* evidência já persistida */ }
    if (pool) try { await pool.end(); } catch { /* noop */ }
    if (lock) {
      try { await lock.query("SELECT pg_advisory_unlock(hashtext('finance-market-conflicts-cvm-dfp-2025'))"); } catch { /* noop */ }
      try { lock.release(); } catch { /* noop */ }
    }
    if (admin) try { await admin.end(); } catch { /* noop */ }
  }
}

if (require.main === module) executar().catch(e => {
  console.error(`[finance-market-conflicts-cvm] FALHA ${String(e?.message || e).slice(0, 500)}`);
  process.exitCode = 1;
});

module.exports = {
  DIAGNOSTICO_VERSAO, SCHEMA, CATEGORIAS, CONFLICT_SCHEMA_STATEMENTS, CONFLICT_SCHEMA_SQL,
  migrar, configAmbiente, normalizarDecimal, mascaraCnpj, fatoDaLinha, chaveHash,
  deterministico, classificarGrupo, criarIndice, primeiraPassagem, segundaPassagem,
  percorrerBruto, persistir, executar,
};
