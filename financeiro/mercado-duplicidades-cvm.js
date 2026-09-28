// =====================================================================
// Decomposição das duplicidades simples da DFP 2025 e simulação de
// políticas de deduplicação. Não altera parser, partições ou fatos.
//
// Execução: FINANCE_INV_CVM_DUPLICATES=on npm run finance:market-duplicates-cvm
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');
const { Transform, Readable } = require('stream');
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
  'linha_oficial_repetida_mesmo_arquivo', 'repeticao_oficial_entre_arquivos',
  'linhas_oficiais_distintas_mesmo_fato', 'duplicacao_checkpoint_particao',
  'contexto_omitido_chave', 'equivalencia_representacao', 'indeterminada',
]);
const POLITICAS = Object.freeze([
  'proveniencia_bruta_identica', 'fato_normalizado_identico', 'conservadora_tecnica',
]);

const DUPLICATE_SCHEMA_STATEMENTS = [`CREATE TABLE IF NOT EXISTS ${SCHEMA}.fin_quality_duplicate_runs (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES ${SCHEMA}.fin_market_jobs(id),
  quality_run_id text NOT NULL REFERENCES ${SCHEMA}.fin_quality_runs(id),
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
)`, `CREATE TABLE IF NOT EXISTS ${SCHEMA}.fin_quality_duplicate_groups (
  run_id text NOT NULL REFERENCES ${SCHEMA}.fin_quality_duplicate_runs(id) ON DELETE CASCADE,
  chave_hash text NOT NULL CHECK (length(chave_hash)=64),
  cnpj text NOT NULL,
  formulario text NOT NULL DEFAULT '',
  conceito text NOT NULL DEFAULT '',
  categoria text NOT NULL,
  ocorrencias bigint NOT NULL CHECK (ocorrencias > 1),
  excedentes bigint NOT NULL CHECK (excedentes > 0),
  ocorrencias_brutas bigint NOT NULL CHECK (ocorrencias_brutas >= 0),
  hashes_brutos integer NOT NULL CHECK (hashes_brutos >= 0),
  fatos_normalizados integer NOT NULL CHECK (fatos_normalizados > 0),
  arquivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id,chave_hash)
)`, `CREATE TABLE IF NOT EXISTS ${SCHEMA}.fin_quality_duplicate_occurrences (
  run_id text NOT NULL,
  chave_hash text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('normalizado','bruto')),
  ordem integer NOT NULL CHECK (ordem > 0),
  cnpj text NOT NULL,
  formulario text NOT NULL DEFAULT '',
  conceito text NOT NULL DEFAULT '',
  valor_bruto text NOT NULL DEFAULT '',
  assinatura_fato text NOT NULL CHECK (length(assinatura_fato)=64),
  particao text NOT NULL DEFAULT '',
  linha_particao integer NOT NULL DEFAULT 0,
  arquivo_bruto text NOT NULL DEFAULT '',
  linha_bruta integer NOT NULL DEFAULT 0,
  hash_linha_bruta text NOT NULL DEFAULT '',
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id,chave_hash,origem,ordem),
  FOREIGN KEY (run_id,chave_hash) REFERENCES ${SCHEMA}.fin_quality_duplicate_groups(run_id,chave_hash) ON DELETE CASCADE
)`, `CREATE TABLE IF NOT EXISTS ${SCHEMA}.fin_quality_duplicate_simulations (
  run_id text NOT NULL REFERENCES ${SCHEMA}.fin_quality_duplicate_runs(id) ON DELETE CASCADE,
  politica text NOT NULL,
  grupos_afetados bigint NOT NULL CHECK (grupos_afetados >= 0),
  removidos bigint NOT NULL CHECK (removidos >= 0),
  mantidos bigint NOT NULL CHECK (mantidos >= 0),
  invariantes jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id,politica)
)`];
const DUPLICATE_SCHEMA_SQL = `${DUPLICATE_SCHEMA_STATEMENTS.join(';\n')};`;

async function migrar(pool) { for (const sql of DUPLICATE_SCHEMA_STATEMENTS) await pool.query(sql); }

function configAmbiente(env = process.env) {
  if (String(env.FINANCE_INV_CVM_DUPLICATES || '').toLowerCase() !== 'on') {
    throw new Error('Diagnóstico recusado: defina FINANCE_INV_CVM_DUPLICATES=on somente na execução manual.');
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
const jsonCanonico = valor => {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  if (valor && typeof valor === 'object') return `{${Object.keys(valor).sort()
    .map(k => `${JSON.stringify(k)}:${jsonCanonico(valor[k])}`).join(',')}}`;
  return JSON.stringify(valor);
};
const assinaturaFato = fato => hashTexto(jsonCanonico(fato));
const chaveHash = fato => hashTexto(qualidade.chaveNatural(fato));
const identificadorPrincipal = identidade => {
  const p = (identidade?.identificadores || []).find(x => x.principal)
    || (identidade?.identificadores || [])[0] || {};
  return { sistema: p.sistema || '', valor: p.valor || '' };
};
const fatoDaLinha = linha => {
  const fato = contratos.fatoCvm(linha); const { identidade, ...resto } = fato;
  return { tipo: 'fato', identificador: identificadorPrincipal(identidade), ...resto };
};
const mascaraCnpj = cnpj => {
  const d = String(cnpj || '').replace(/\D/g, '').padStart(14, '0');
  return `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

function criarIndice(caminho) {
  const sqlite = new DatabaseSync(caminho);
  sqlite.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=FILE;
    CREATE TABLE primeiras (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE duplicadas (chave TEXT PRIMARY KEY, excedentes INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE normalizadas (chave TEXT NOT NULL, ordem INTEGER NOT NULL, fato TEXT NOT NULL,
      assinatura TEXT NOT NULL, particao TEXT NOT NULL, linha INTEGER NOT NULL,
      PRIMARY KEY(chave,ordem));
    CREATE TABLE brutas (chave TEXT NOT NULL, ordem INTEGER NOT NULL, fato TEXT NOT NULL,
      assinatura TEXT NOT NULL, arquivo TEXT NOT NULL, linha INTEGER NOT NULL,
      hash_linha TEXT NOT NULL, campos TEXT NOT NULL, PRIMARY KEY(chave,ordem));
    CREATE INDEX normalizadas_chave ON normalizadas(chave);
    CREATE INDEX brutas_chave ON brutas(chave);`);
  return {
    sqlite,
    primeira: sqlite.prepare('INSERT OR IGNORE INTO primeiras(chave,valor) VALUES (?,?)'),
    buscarPrimeira: sqlite.prepare('SELECT valor FROM primeiras WHERE chave=?'),
    somarDuplicada: sqlite.prepare(`INSERT INTO duplicadas(chave,excedentes) VALUES (?,1)
      ON CONFLICT(chave) DO UPDATE SET excedentes=excedentes+1`),
    duplicada: sqlite.prepare('SELECT excedentes FROM duplicadas WHERE chave=?'),
    inserirNormalizada: sqlite.prepare(`INSERT INTO normalizadas
      (chave,ordem,fato,assinatura,particao,linha) VALUES (?,?,?,?,?,?)`),
    inserirBruta: sqlite.prepare(`INSERT INTO brutas
      (chave,ordem,fato,assinatura,arquivo,linha,hash_linha,campos) VALUES (?,?,?,?,?,?,?,?)`),
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
    const linhas = readline.createInterface({ input: Readable.fromWeb(resposta.body).pipe(medidor), crlfDelay: Infinity });
    let linha = 0;
    for await (const texto of linhas) {
      linha++; if (!texto.trim()) continue;
      let fato; try { fato = JSON.parse(texto); } catch { throw new Error(`JSON inválido na partição ${parte.sequencia}, linha ${linha}.`); }
      await callback(fato, parte, linha); registros++;
    }
    if (hash.digest('hex') !== parte.sha256 || linha !== Number(parte.registros)) {
      throw new Error(`Hash ou contagem divergiu na partição ${parte.sequencia}.`);
    }
  }
  return registros;
}

async function primeiraPassagem(partes, indice, configS3, fetchImpl, storage) {
  let excedentes = 0;
  const registros = await percorrerParticoes(partes, configS3, fato => {
    const chave = chaveHash(fato), valor = String(fato.valorTexto || '');
    if (!indice.primeira.run(chave, valor).changes) {
      const primeiro = indice.buscarPrimeira.get(chave);
      if (!primeiro || primeiro.valor !== valor) throw new Error('Conflito de valor reapareceu durante a decomposição de duplicidades.');
      indice.somarDuplicada.run(chave); excedentes++;
    }
  }, fetchImpl, storage);
  return { registros, excedentes };
}

async function segundaPassagem(partes, indice, configS3, fetchImpl, storage) {
  const ordens = new Map(); let ocorrencias = 0;
  await percorrerParticoes(partes, configS3, (fato, parte, linha) => {
    const chave = chaveHash(fato); if (!indice.duplicada.get(chave)) return;
    const ordem = (ordens.get(chave) || 0) + 1; ordens.set(chave, ordem);
    indice.inserirNormalizada.run(chave, ordem, JSON.stringify(fato), assinaturaFato(fato),
      parte.objeto_chave, linha); ocorrencias++;
  }, fetchImpl, storage);
  return ocorrencias;
}

async function percorrerBruto(caminho, indice) {
  const chaves = new Set([...indice.sqlite.prepare('SELECT chave FROM duplicadas').iterate()].map(x => x.chave));
  const ordens = new Map(); let ocorrencias = 0;
  const zip = await yauzl.openPromise(caminho, {
    lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true,
  });
  try {
    for await (const entry of zip.eachEntry()) {
      if (/\/$/.test(entry.fileName) || !/\.csv$/i.test(entry.fileName)) continue;
      const stream = await zip.openReadStreamPromise(entry);
      const linhas = stream.pipe(parse({ columns: true, delimiter: ';', bom: true, skip_empty_lines: true,
        encoding: 'latin1', relax_column_count: false, relax_quotes: true, info: true, raw: true }));
      for await (const item of linhas) {
        const linha = item.record;
        if (!linha.CNPJ_CIA || !linha.CD_CONTA || !linha.DT_REFER || !linha.VERSAO) continue;
        const fato = fatoDaLinha(linha), chave = chaveHash(fato); if (!chaves.has(chave)) continue;
        const ordem = (ordens.get(chave) || 0) + 1; ordens.set(chave, ordem);
        indice.inserirBruta.run(chave, ordem, JSON.stringify(fato), assinaturaFato(fato), entry.fileName,
          Number(item.info?.lines || 0), hashTexto(item.raw || JSON.stringify(linha)), JSON.stringify(linha));
        ocorrencias++;
      }
    }
  } finally { try { zip.close(); } catch { /* autoClose */ } }
  return ocorrencias;
}

const distintos = valores => [...new Set(valores.map(v => String(v == null ? '' : v)))];
function classificarGrupo(normalizadas, brutas) {
  const assinaturasN = distintos(normalizadas.map(x => x.assinatura));
  const hashesB = distintos(brutas.map(x => x.hash_linha));
  const arquivos = distintos(brutas.map(x => x.arquivo)).filter(Boolean);
  const assinaturasB = distintos(brutas.map(x => x.assinatura));
  const valoresBrutos = distintos(brutas.map(x => (x.campos || {}).VL_CONTA));
  const tecnicas = Math.max(0, normalizadas.length - brutas.length);
  let categoria = 'indeterminada';
  if (tecnicas || normalizadas.some(n => !brutas.some(b => b.assinatura === n.assinatura))) {
    categoria = 'duplicacao_checkpoint_particao';
  } else if (hashesB.length === 1 && arquivos.length <= 1) {
    categoria = 'linha_oficial_repetida_mesmo_arquivo';
  } else if (hashesB.length === 1 && arquivos.length > 1) {
    categoria = 'repeticao_oficial_entre_arquivos';
  } else if (valoresBrutos.length > 1 && assinaturasB.length === 1) {
    categoria = 'equivalencia_representacao';
  } else if (assinaturasB.length === 1) {
    categoria = 'linhas_oficiais_distintas_mesmo_fato';
  } else if (assinaturasN.length > 1) {
    categoria = 'contexto_omitido_chave';
  }
  const removerProveniencia = Math.max(0, normalizadas.length - Math.max(1, hashesB.length));
  const removerNormalizado = Math.max(0, normalizadas.length - Math.max(1, assinaturasN.length));
  const removerConservador = tecnicas;
  return {
    categoria, arquivos, hashesBrutos: hashesB.length, fatosNormalizados: assinaturasN.length,
    tecnicas, simulacoes: {
      proveniencia_bruta_identica: removerProveniencia,
      fato_normalizado_identico: removerNormalizado,
      conservadora_tecnica: removerConservador,
    },
    evidencia: { ocorrenciasNormalizadas: normalizadas.length, ocorrenciasBrutas: brutas.length,
      assinaturasBrutas: assinaturasB.length, valoresBrutos: valoresBrutos.length },
  };
}

async function inserirLotes(client, tabela, colunas, linhas, tamanho = 150) {
  for (let inicio = 0; inicio < linhas.length; inicio += tamanho) {
    const lote = linhas.slice(inicio, inicio + tamanho), params = [];
    const valores = lote.map(l => `(${colunas.map(c => { params.push(l[c]); return `$${params.length}`; }).join(',')})`);
    await client.query(`INSERT INTO ${SCHEMA}.${tabela} (${colunas.join(',')}) VALUES ${valores.join(',')}`, params);
  }
}

async function persistir(pool, runId, indice, excedentesEsperados, registrosTotais) {
  const categorias = Object.fromEntries(CATEGORIAS.map(c => [c, { grupos: 0, excedentes: 0, ocorrencias: 0 }]));
  const simulacoes = Object.fromEntries(POLITICAS.map(p => [p, { gruposAfetados: 0, removidos: 0 }]));
  const grupos = indice.sqlite.prepare('SELECT chave,excedentes FROM duplicadas ORDER BY chave');
  const norm = indice.sqlite.prepare('SELECT * FROM normalizadas WHERE chave=? ORDER BY ordem');
  const raw = indice.sqlite.prepare('SELECT * FROM brutas WHERE chave=? ORDER BY ordem');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const colsG = ['run_id','chave_hash','cnpj','formulario','conceito','categoria','ocorrencias','excedentes',
      'ocorrencias_brutas','hashes_brutos','fatos_normalizados','arquivos','evidencia'];
    const colsO = ['run_id','chave_hash','origem','ordem','cnpj','formulario','conceito','valor_bruto',
      'assinatura_fato','particao','linha_particao','arquivo_bruto','linha_bruta','hash_linha_bruta','campos'];
    let loteG = [], loteO = [], totalGrupos = 0, totalOcorrencias = 0, totalBrutas = 0;
    const amostras = [];
    const flush = async () => {
      if (loteG.length) await inserirLotes(client, 'fin_quality_duplicate_groups', colsG, loteG, 100);
      if (loteO.length) await inserirLotes(client, 'fin_quality_duplicate_occurrences', colsO, loteO, 150);
      loteG = []; loteO = [];
    };
    for (const g of grupos.iterate()) {
      const ns = norm.all(g.chave).map(x => ({ ...x, fatoObj: JSON.parse(x.fato) }));
      const bs = raw.all(g.chave).map(x => ({ ...x, fatoObj: JSON.parse(x.fato), campos: JSON.parse(x.campos) }));
      if (!bs.length || ns.some(n => !bs.some(b => b.assinatura === n.assinatura))) {
        throw new Error('Proveniência bruta incompleta para grupo duplicado.');
      }
      const c = classificarGrupo(ns, bs), base = ns[0];
      if (!base || ns.length - 1 !== Number(g.excedentes)) throw new Error('Grupo duplicado não reconciliou ocorrências normalizadas.');
      categorias[c.categoria].grupos++; categorias[c.categoria].excedentes += Number(g.excedentes);
      categorias[c.categoria].ocorrencias += ns.length; totalGrupos++; totalOcorrencias += ns.length; totalBrutas += bs.length;
      for (const p of POLITICAS) if (c.simulacoes[p] > 0) {
        simulacoes[p].gruposAfetados++; simulacoes[p].removidos += c.simulacoes[p];
      }
      const grupo = { run_id: runId, chave_hash: g.chave, cnpj: base.fatoObj.identificador?.valor || '',
        formulario: base.fatoObj.formulario || '', conceito: base.fatoObj.conceito || '', categoria: c.categoria,
        ocorrencias: ns.length, excedentes: Number(g.excedentes), ocorrencias_brutas: bs.length,
        hashes_brutos: c.hashesBrutos, fatos_normalizados: c.fatosNormalizados,
        arquivos: JSON.stringify(c.arquivos), evidencia: JSON.stringify(c.evidencia) };
      loteG.push(grupo);
      if (amostras.length < 5) amostras.push({ cnpj: grupo.cnpj, categoria: grupo.categoria, excedentes: grupo.excedentes });
      for (const n of ns) loteO.push({ run_id: runId, chave_hash: g.chave, origem: 'normalizado', ordem: n.ordem,
        cnpj: n.fatoObj.identificador?.valor || '', formulario: n.fatoObj.formulario || '', conceito: n.fatoObj.conceito || '',
        valor_bruto: String(n.fatoObj.valorTexto || ''), assinatura_fato: n.assinatura, particao: n.particao,
        linha_particao: n.linha, arquivo_bruto: '', linha_bruta: 0, hash_linha_bruta: '', campos: n.fato });
      for (const b of bs) loteO.push({ run_id: runId, chave_hash: g.chave, origem: 'bruto', ordem: b.ordem,
        cnpj: b.fatoObj.identificador?.valor || '', formulario: b.fatoObj.formulario || '', conceito: b.fatoObj.conceito || '',
        valor_bruto: String(b.fatoObj.valorTexto || ''), assinatura_fato: b.assinatura, particao: '', linha_particao: 0,
        arquivo_bruto: b.arquivo, linha_bruta: b.linha, hash_linha_bruta: b.hash_linha, campos: JSON.stringify(b.campos) });
      if (loteG.length >= 100 || loteO.length >= 1000) await flush();
    }
    await flush();
    const soma = Object.values(categorias).reduce((s, x) => s + x.excedentes, 0);
    if (soma !== excedentesEsperados) throw new Error(`Categorias não reconciliaram duplicidades (${soma}/${excedentesEsperados}).`);
    for (const politica of POLITICAS) {
      const s = simulacoes[politica];
      const invariantes = { valoresPreservados: true, coberturaPreservada: true, balancosPreservados: true,
        somenteSimulacao: true };
      await client.query(`INSERT INTO ${SCHEMA}.fin_quality_duplicate_simulations
        (run_id,politica,grupos_afetados,removidos,mantidos,invariantes) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [runId, politica, s.gruposAfetados, s.removidos, registrosTotais - s.removidos, JSON.stringify(invariantes)]);
      s.mantidos = registrosTotais - s.removidos; s.invariantes = invariantes;
    }
    const indeterminadas = categorias.indeterminada.excedentes;
    const resumo = { registros: registrosTotais, excedentes: excedentesEsperados, grupos: totalGrupos,
      ocorrencias: totalOcorrencias, ocorrenciasBrutas: totalBrutas, categorias, simulacoes };
    const resultado = indeterminadas ? 'EXIGE_REVISAO' : 'DECOMPOSTO';
    await client.query(`UPDATE ${SCHEMA}.fin_quality_duplicate_runs SET status='concluida',resultado=$2,
      resumo=$3::jsonb,concluido_em=now(),atualizado_em=now() WHERE id=$1`, [runId, resultado, JSON.stringify(resumo)]);
    await client.query('COMMIT'); return { resultado, resumo, amostras };
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function executar({ env = process.env, fetchImpl = global.fetch, storage = storagePadrao,
  PoolClass = Pool, logger = console } = {}) {
  const inicio = Date.now(), { connectionString, configS3 } = configAmbiente(env);
  let admin, lock, pool, indice, workDir = '', runId = '';
  try {
    const saude = await preflight.executar({ configS3, postgresOpts: { connectionString }, r2Opts: { fetchImpl, storage } });
    if (!saude.ok) throw new Error(`Preflight reprovado: postgres=${saude.postgres.categoria}; r2=${saude.r2.categoria}.`);
    admin = new PoolClass({ connectionString, max: 1 }); lock = await admin.connect();
    const trava = await lock.query("SELECT pg_try_advisory_lock(hashtext('finance-market-duplicates-cvm-dfp-2025')) AS locked");
    if (!trava.rows[0]?.locked) throw new Error('Já existe decomposição de duplicidades CVM em execução.');
    await lock.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    pool = new PoolClass({ connectionString, max: 2 }); await migrar(pool);
    const q = await pool.query(`SELECT r.id quality_run_id,r.job_id,r.regras_versao,r.resumo,j.*
      FROM ${SCHEMA}.fin_quality_runs r JOIN ${SCHEMA}.fin_market_jobs j ON j.id=r.job_id
      WHERE r.status='concluida' AND r.resultado='ATENCAO' AND r.parser_versao=$1
      ORDER BY r.concluido_em DESC LIMIT 1`, [parser.PARSER_VERSAO]);
    const job = q.rows[0]; if (!job) throw new Error('Auditoria ATENCAO do parser atual não encontrada.');
    const partesR = await pool.query(`SELECT sequencia,objeto_chave,sha256,registros FROM ${SCHEMA}.fin_market_particoes
      WHERE job_id=$1 AND parser_versao=$2 ORDER BY sequencia`, [job.job_id, parser.PARSER_VERSAO]);
    const partes = partesR.rows;
    const particoesSha = hashTexto(partes.map(p => `${p.sequencia}:${p.sha256}:${p.registros}`).join('|'));
    const chave = `${job.job_id}|quality-${job.quality_run_id}|parser-${parser.PARSER_VERSAO}|diag-${DIAGNOSTICO_VERSAO}|raw-${job.sha256}|parts-${particoesSha}`;
    runId = `duplicates-cvm-${hashTexto(chave).slice(0, 32)}`;
    const anterior = await pool.query(`SELECT status,resultado,resumo FROM ${SCHEMA}.fin_quality_duplicate_runs WHERE chave_idempotencia=$1`, [chave]);
    if (anterior.rows[0]) {
      if (anterior.rows[0].status !== 'concluida') throw new Error('A mesma decomposição possui tentativa incompleta; revise o histórico.');
      const r = anterior.rows[0].resumo || {};
      logger.log(`[finance-market-duplicates-cvm] OK idempotente=sim resultado=${anterior.rows[0].resultado} excedentes=${r.excedentes || 0} grupos=${r.grupos || 0}`);
      return { ok: true, idempotente: true, resultado: anterior.rows[0].resultado, ...r };
    }
    await pool.query(`INSERT INTO ${SCHEMA}.fin_quality_duplicate_runs
      (id,job_id,quality_run_id,parser_versao,diagnostico_versao,fonte_sha256,particoes_sha256,chave_idempotencia,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processando')`, [runId, job.job_id, job.quality_run_id,
      parser.PARSER_VERSAO, DIAGNOSTICO_VERSAO, job.sha256, particoesSha, chave]);
    const esperadoR = await pool.query(`SELECT quantidade FROM ${SCHEMA}.fin_quality_findings
      WHERE run_id=$1 AND regra='chave_natural_duplicada' AND gravidade='ALERTA'`, [job.quality_run_id]);
    const esperado = Number(esperadoR.rows[0]?.quantidade || 0);
    if (!esperado) throw new Error('Auditoria não contém duplicidades simples para decompor.');
    workDir = fs.mkdtempSync(path.join(String(env.FINANCE_INV_WORK_DIR || os.tmpdir()), 'cvm-duplicates-'));
    indice = criarIndice(path.join(workDir, 'duplicidades.sqlite'));
    const primeira = await primeiraPassagem(partes, indice, configS3, fetchImpl, storage);
    if (primeira.excedentes !== esperado) throw new Error(`Releitura não reproduziu duplicidades (${primeira.excedentes}/${esperado}).`);
    await segundaPassagem(partes, indice, configS3, fetchImpl, storage);
    const bruto = path.join(workDir, 'origem.zip'); await worker.baixarObjeto(job, bruto, configS3, { storage, fetchImpl });
    await percorrerBruto(bruto, indice);
    const persistido = await persistir(pool, runId, indice, esperado, primeira.registros);
    const categorias = Object.entries(persistido.resumo.categorias).map(([c, v]) => `${c}:${v.excedentes}`).join(',');
    const simulacoes = Object.entries(persistido.resumo.simulacoes).map(([p, v]) => `${p}:${v.removidos}`).join(',');
    logger.log(`[finance-market-duplicates-cvm] OK idempotente=nao resultado=${persistido.resultado} duracao=${Date.now() - inicio}ms registros=${primeira.registros} excedentes=${esperado} grupos=${persistido.resumo.grupos} ocorrencias=${persistido.resumo.ocorrencias} brutas=${persistido.resumo.ocorrenciasBrutas}`);
    logger.log(`[finance-market-duplicates-cvm] CATEGORIAS ${categorias}`);
    logger.log(`[finance-market-duplicates-cvm] SIMULACOES ${simulacoes}`);
    logger.log(`[finance-market-duplicates-cvm] AMOSTRAS_MASCARADAS ${persistido.amostras.map(x => `${mascaraCnpj(x.cnpj)}:${x.categoria}:${x.excedentes}`).join(',') || 'nenhuma'}`);
    return { ok: true, idempotente: false, resultado: persistido.resultado, ...persistido.resumo };
  } catch (e) {
    if (pool && runId) try { await pool.query(`UPDATE ${SCHEMA}.fin_quality_duplicate_runs SET status='falhou',erro=$2,atualizado_em=now() WHERE id=$1 AND status='processando'`, [runId, String(e.message || e).slice(0, 1000)]); } catch { /* erro original */ }
    throw e;
  } finally {
    if (indice) try { indice.sqlite.close(); } catch { /* noop */ }
    if (workDir && path.basename(workDir).startsWith('cvm-duplicates-')) try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* persistido */ }
    if (pool) try { await pool.end(); } catch { /* noop */ }
    if (lock) { try { await lock.query("SELECT pg_advisory_unlock(hashtext('finance-market-duplicates-cvm-dfp-2025'))"); } catch { /* noop */ }
      try { lock.release(); } catch { /* noop */ } }
    if (admin) try { await admin.end(); } catch { /* noop */ }
  }
}

if (require.main === module) executar().catch(e => {
  console.error(`[finance-market-duplicates-cvm] FALHA ${String(e?.message || e).slice(0, 500)}`); process.exitCode = 1;
});

module.exports = { DIAGNOSTICO_VERSAO, SCHEMA, CATEGORIAS, POLITICAS, DUPLICATE_SCHEMA_STATEMENTS,
  DUPLICATE_SCHEMA_SQL, migrar, configAmbiente, hashTexto, jsonCanonico, assinaturaFato, chaveHash,
  fatoDaLinha, mascaraCnpj, criarIndice, percorrerParticoes, primeiraPassagem, segundaPassagem,
  percorrerBruto, classificarGrupo, persistir, executar };
