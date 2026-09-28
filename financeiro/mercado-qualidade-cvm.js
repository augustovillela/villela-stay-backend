// =====================================================================
// Auditoria persistente da DFP 2025 mantida na quarentena.
//
// Execução: FINANCE_INV_CVM_QUALITY=on npm run finance:market-quality-cvm
// Não promove dados e não ativa parser, parecer ou operação financeira.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');
const { Readable, Transform } = require('stream');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');
const { parse } = require('csv-parse');
const storagePadrao = require('../storage-s3');
const preflight = require('./mercado-preflight');
const parser = require('./investimentos-parser');
const piloto = require('./mercado-piloto-cvm');

const REGRAS_VERSAO = 1;
const FONTE_CADASTRO = 'https://dados.cvm.gov.br/dados/cia_aberta/CAD/DADOS/cad_cia_aberta.csv';
const SCHEMA = 'fin_pilot_cvm_dfp_2025';
const LIMITE_CADASTRO = 8 * 1024 * 1024;
const TIMEOUT_MS = 60_000;
const AMOSTRAS_MAX = 50;

const QUALITY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS fin_quality_runs (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES fin_market_jobs(id),
  parser_versao integer NOT NULL,
  regras_versao integer NOT NULL,
  cadastro_sha256 text NOT NULL CHECK (length(cadastro_sha256)=64),
  cadastro_etag text NOT NULL DEFAULT '',
  cadastro_ultima_modificacao text NOT NULL DEFAULT '',
  chave_idempotencia text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('processando','concluida','falhou')),
  resultado text NOT NULL DEFAULT '',
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fin_quality_metrics (
  run_id text NOT NULL REFERENCES fin_quality_runs(id) ON DELETE CASCADE,
  regra text NOT NULL,
  escopo text NOT NULL DEFAULT '',
  valor jsonb NOT NULL,
  PRIMARY KEY (run_id, regra, escopo)
);
CREATE TABLE IF NOT EXISTS fin_quality_findings (
  run_id text NOT NULL REFERENCES fin_quality_runs(id) ON DELETE CASCADE,
  regra text NOT NULL,
  gravidade text NOT NULL CHECK (gravidade IN ('BLOQUEADOR','ALERTA')),
  agrupador text NOT NULL DEFAULT '',
  quantidade bigint NOT NULL CHECK (quantidade > 0),
  amostras jsonb NOT NULL DEFAULT '[]'::jsonb,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, regra, gravidade, agrupador)
);
`;

function configAmbiente(env = process.env) {
  if (String(env.FINANCE_INV_CVM_QUALITY || '').toLowerCase() !== 'on') {
    throw new Error('Auditoria recusada: defina FINANCE_INV_CVM_QUALITY=on somente na execução manual.');
  }
  if (String(env.FINANCE_INV_PARSE_WORKER || '').toLowerCase() !== 'off') {
    throw new Error('Auditoria recusada: FINANCE_INV_PARSE_WORKER precisa permanecer off.');
  }
  const connectionString = String(env.FINANCE_MARKET_DATABASE_URL || '').trim();
  const configS3 = {
    endpoint: String(env.FINANCE_S3_ENDPOINT || '').trim(),
    bucket: String(env.FINANCE_S3_BUCKET || '').trim(),
    key: String(env.FINANCE_S3_KEY || '').trim(),
    secret: String(env.FINANCE_S3_SECRET || '').trim(),
    region: String(env.FINANCE_S3_REGION || 'auto').trim(),
  };
  if (!connectionString) throw new Error('Auditoria recusada: PostgreSQL de mercado não configurado.');
  if (!configS3.endpoint || !configS3.bucket || !configS3.key || !configS3.secret) {
    throw new Error('Auditoria recusada: R2 não configurado.');
  }
  return { connectionString, configS3 };
}

const somenteDigitos = valor => String(valor || '').replace(/\D/g, '');
const codigoCvm = valor => somenteDigitos(valor).replace(/^0+(?=\d)/, '');
const textoComparavel = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const dataIsoValida = valor => {
  const s = String(valor || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

function decimalEscala10(valor) {
  const m = String(valor == null ? '' : valor).trim().match(/^(-?)(\d+)(?:\.(\d{1,10}))?$/);
  if (!m) return null;
  const inteiro = BigInt(m[2]) * 10_000_000_000n + BigInt((m[3] || '').padEnd(10, '0'));
  return m[1] ? -inteiro : inteiro;
}

function categoriaFormulario(valor) {
  const s = textoComparavel(valor);
  if (s.includes('BALANCO PATRIMONIAL ATIVO')) return 'BPA';
  if (s.includes('BALANCO PATRIMONIAL PASSIVO')) return 'BPP';
  if (s.includes('RESULTADO ABRANGENTE')) return 'DRA';
  if (s.includes('DEMONSTRACAO DO RESULTADO')) return 'DRE';
  if (s.includes('FLUXO DE CAIXA')) return 'DFC';
  if (s.includes('MUTACOES DO PATRIMONIO LIQUIDO')) return 'DMPL';
  if (s.includes('VALOR ADICIONADO')) return 'DVA';
  return '';
}

class Achados {
  constructor(maximo = AMOSTRAS_MAX) { this.maximo = maximo; this.mapa = new Map(); }
  adicionar(regra, gravidade, amostra = {}, agrupador = '', detalhes = {}) {
    const chave = `${regra}|${gravidade}|${agrupador}`;
    const atual = this.mapa.get(chave) || {
      regra, gravidade, agrupador, quantidade: 0, amostras: [], detalhes,
    };
    atual.quantidade++;
    if (atual.amostras.length < this.maximo) atual.amostras.push(amostra);
    this.mapa.set(chave, atual);
  }
  listar() { return [...this.mapa.values()].sort((a, b) => a.regra.localeCompare(b.regra)); }
  totais() {
    return this.listar().reduce((r, x) => {
      r[x.gravidade] += x.quantidade; return r;
    }, { BLOQUEADOR: 0, ALERTA: 0 });
  }
}

async function baixarCadastro(fetchImpl = global.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetchImpl(FONTE_CADASTRO, {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { accept: 'text/csv,application/octet-stream', 'user-agent': 'VillelaFinanceQuality/1.0' },
    });
    if (!resposta.ok || resposta.status !== 200 || !resposta.body) {
      throw new Error(`Cadastro CVM recusou a consulta (HTTP ${resposta.status}).`);
    }
    const informado = Number(resposta.headers.get('content-length') || 0);
    if (!Number.isSafeInteger(informado) || informado <= 0 || informado > LIMITE_CADASTRO) {
      throw new Error('Cadastro CVM sem tamanho confiável ou acima do limite.');
    }
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    const medidor = new Transform({ transform(chunk, _enc, cb) {
      bytes += chunk.length;
      if (bytes > LIMITE_CADASTRO) return cb(new Error('Cadastro CVM excedeu o limite durante a leitura.'));
      hash.update(chunk); cb(null, chunk);
    } });
    const linhas = Readable.fromWeb(resposta.body).pipe(medidor).pipe(parse({
      columns: true, delimiter: ';', bom: true, skip_empty_lines: true,
      encoding: 'latin1', relax_column_count: false, relax_quotes: true,
    }));
    const registros = [];
    for await (const linha of linhas) {
      const cnpj = somenteDigitos(linha.CNPJ_CIA);
      const codigo = codigoCvm(linha.CD_CVM);
      const nome = String(linha.DENOM_SOCIAL || '').trim();
      if (!cnpj || !codigo || !nome) continue;
      registros.push({ cnpj, codigo, nome, situacao: String(linha.SIT || '').trim() });
    }
    if (bytes !== informado || !registros.length) throw new Error('Cadastro CVM ficou incompleto.');
    return {
      registros, bytes, sha256: hash.digest('hex'),
      etag: String(resposta.headers.get('etag') || ''),
      ultimaModificacao: String(resposta.headers.get('last-modified') || ''),
    };
  } finally { clearTimeout(timer); }
}

function indexarCadastro(cadastro, achados = new Achados()) {
  const porCnpj = new Map(), porCodigo = new Map();
  for (const item of cadastro.registros || []) {
    const cnpjAnteriores = porCnpj.get(item.cnpj) || [];
    const codigoAnterior = porCodigo.get(item.codigo);
    if (cnpjAnteriores.length && !cnpjAnteriores.some(x => x.codigo === item.codigo)) {
      achados.adicionar('cadastro_cnpj_com_historico_multiplo', 'ALERTA',
        { cnpj: item.cnpj, codigos: [...cnpjAnteriores.map(x => x.codigo), item.codigo] });
    }
    if (codigoAnterior && codigoAnterior.cnpj !== item.cnpj) {
      achados.adicionar('cadastro_codigo_multiplos_cnpjs', 'BLOQUEADOR',
        { codigoCvm: item.codigo, cnpjs: [codigoAnterior.cnpj, item.cnpj] });
    }
    cnpjAnteriores.push(item);
    porCnpj.set(item.cnpj, cnpjAnteriores); porCodigo.set(item.codigo, item);
  }
  return { porCnpj, porCodigo, achados };
}

function chaveNatural(fato) {
  return [fato.identificador?.valor, fato.taxonomia, fato.formulario, fato.conceito,
    fato.periodoInicio, fato.periodoFim, fato.protocolo, fato.escopo,
    fato.contexto?.escalaMoeda].map(x => String(x || '')).join('|');
}

function escopoDemonstracao(formulario) {
  const s = textoComparavel(formulario);
  if (s.includes('CONSOLIDADO')) return 'consolidado';
  if (s.includes('INDIVIDUAL')) return 'individual';
  return 'outro';
}

function analisarFato(fato, contexto) {
  const { achados, indice, cobertura, balancos, parte, linha } = contexto;
  const referencia = { parte, linha, cnpj: fato?.identificador?.valor || '', conta: fato?.conceito || '' };
  if (!fato || fato.tipo !== 'fato' || typeof fato !== 'object') {
    achados.adicionar('contrato_tipo_invalido', 'BLOQUEADOR', referencia); return;
  }
  const cnpj = somenteDigitos(fato.identificador?.valor);
  const obrigatorios = {
    cnpj, taxonomia: fato.taxonomia, formulario: fato.formulario, conceito: fato.conceito,
    periodoFim: fato.periodoFim, protocolo: fato.protocolo, unidade: fato.unidade,
  };
  for (const [campo, valor] of Object.entries(obrigatorios)) {
    if (!String(valor || '').trim()) achados.adicionar('campo_obrigatorio_vazio', 'BLOQUEADOR', referencia, campo);
  }
  if (cnpj.length !== 14) achados.adicionar('cnpj_invalido', 'BLOQUEADOR', referencia);
  if (!dataIsoValida(fato.periodoFim) || (fato.periodoInicio && !dataIsoValida(fato.periodoInicio))) {
    achados.adicionar('data_invalida', 'BLOQUEADOR', { ...referencia, inicio: fato.periodoInicio, fim: fato.periodoFim });
  }
  const valor = decimalEscala10(fato.valorTexto);
  if (valor === null) achados.adicionar('valor_nao_numerico', 'BLOQUEADOR', { ...referencia, valor: fato.valorTexto });
  if (/\uFFFD/.test(JSON.stringify(fato))) achados.adicionar('caractere_corrompido', 'BLOQUEADOR', referencia);

  const chave = crypto.createHash('sha256').update(chaveNatural(fato)).digest();
  const valorHash = crypto.createHash('sha256').update(String(fato.valorTexto || '')).digest();
  const inserido = indice.inserir.run(chave, valorHash).changes;
  if (!inserido) {
    const anterior = indice.buscar.get(chave);
    const conflito = anterior && !Buffer.from(anterior.valor).equals(valorHash);
    achados.adicionar(conflito ? 'chave_natural_valor_conflitante' : 'chave_natural_duplicada',
      conflito ? 'BLOQUEADOR' : 'ALERTA', referencia);
  }

  const categoria = categoriaFormulario(fato.formulario);
  if (categoria) {
    if (!cobertura.has(cnpj)) cobertura.set(cnpj, new Set());
    cobertura.get(cnpj).add(categoria);
  }
  if (valor !== null && ((categoria === 'BPA' && String(fato.conceito) === '1')
      || (categoria === 'BPP' && String(fato.conceito) === '2'))) {
    const chaveBalanco = [cnpj, fato.protocolo, fato.periodoFim, fato.escopo,
      escopoDemonstracao(fato.formulario), fato.contexto?.escalaMoeda].join('|');
    const atual = balancos.get(chaveBalanco) || {};
    if (categoria === 'BPA') atual.ativo = valor;
    else atual.passivo = valor;
    atual.referencia = referencia;
    balancos.set(chaveBalanco, atual);
  }
}

async function auditarParticao(parte, contexto, fetchImpl = global.fetch, storage = storagePadrao) {
  const { configS3, prefixo, achados } = contexto;
  if (!String(parte.objeto_chave).startsWith(`${prefixo}normalizado/`)) {
    throw new Error('Partição fora da quarentena aprovada.');
  }
  const resposta = await fetchImpl(storage.presignS3(configS3, 'GET', parte.objeto_chave, 900), {
    method: 'GET', redirect: 'manual',
  });
  if (!resposta.ok || !resposta.body) throw new Error(`R2 recusou partição (HTTP ${resposta.status}).`);
  const hash = crypto.createHash('sha256');
  const medidor = new Transform({ transform(chunk, _enc, cb) { hash.update(chunk); cb(null, chunk); } });
  const rl = readline.createInterface({ input: Readable.fromWeb(resposta.body).pipe(medidor), crlfDelay: Infinity });
  let linhas = 0;
  for await (const texto of rl) {
    if (!texto) { achados.adicionar('linha_vazia', 'BLOQUEADOR', { parte: parte.sequencia, linha: linhas + 1 }); continue; }
    linhas++;
    let fato;
    try { fato = JSON.parse(texto); }
    catch {
      achados.adicionar('json_invalido', 'BLOQUEADOR', { parte: parte.sequencia, linha: linhas }); continue;
    }
    analisarFato(fato, { ...contexto, parte: parte.sequencia, linha: linhas });
  }
  const sha256 = hash.digest('hex');
  if (sha256 !== parte.sha256) achados.adicionar('hash_particao_divergente', 'BLOQUEADOR', { parte: parte.sequencia });
  if (linhas !== Number(parte.registros)) {
    achados.adicionar('contagem_particao_divergente', 'BLOQUEADOR',
      { parte: parte.sequencia, esperado: Number(parte.registros), encontrado: linhas });
  }
  return linhas;
}

function compararCadastros(identidades, cadastroIndex, cobertura, achados) {
  const cnpjsDfp = new Set();
  for (const identidade of identidades) {
    const cnpj = somenteDigitos(identidade.valor);
    cnpjsDfp.add(cnpj);
    const dados = identidade.dados && typeof identidade.dados === 'object' ? identidade.dados : {};
    const codigo = codigoCvm((dados.identificadores || []).find(x => x.sistema === 'cvm_codigo')?.valor);
    const oficiais = cadastroIndex.porCnpj.get(cnpj) || [];
    if (!oficiais.length) {
      achados.adicionar('identidade_dfp_ausente_cadastro', 'BLOQUEADOR', { cnpj, nome: identidade.nome });
      continue;
    }
    const oficial = oficiais.find(x => x.codigo === codigo) || oficiais[0];
    if (!codigo || !oficiais.some(x => x.codigo === codigo)) {
      achados.adicionar('codigo_cvm_divergente', 'BLOQUEADOR',
        { cnpj, dfp: codigo, cadastro: oficiais.map(x => x.codigo) });
    }
    if (textoComparavel(identidade.nome) !== textoComparavel(oficial.nome)) {
      achados.adicionar('denominacao_divergente', 'ALERTA',
        { cnpj, dfp: identidade.nome, cadastro: oficial.nome });
    }
  }
  for (const oficiais of cadastroIndex.porCnpj.values()) {
    const oficial = oficiais.find(x => textoComparavel(x.situacao) === 'ATIVO');
    if (oficial && !cnpjsDfp.has(oficial.cnpj)) {
      achados.adicionar('companhia_ativa_sem_dfp_2025', 'ALERTA',
        { cnpj: oficial.cnpj, codigoCvm: oficial.codigo, nome: oficial.nome });
    }
  }
  const categorias = ['BPA', 'BPP', 'DRE', 'DFC', 'DMPL', 'DRA', 'DVA'];
  for (const cnpj of cnpjsDfp) {
    const presentes = cobertura.get(cnpj) || new Set();
    for (const categoria of categorias) if (!presentes.has(categoria)) {
      achados.adicionar('demonstracao_ausente', 'ALERTA', { cnpj }, categoria);
    }
  }
  return { companhiasDfp: cnpjsDfp.size };
}

function reconciliarBalancos(balancos, achados) {
  let comparados = 0, divergentes = 0;
  for (const [chave, saldo] of balancos) {
    if (saldo.ativo === undefined || saldo.passivo === undefined) continue;
    comparados++;
    if (saldo.ativo !== saldo.passivo) {
      divergentes++;
      achados.adicionar('balanco_nao_fecha', 'ALERTA', {
        ...saldo.referencia, chave: crypto.createHash('sha256').update(chave).digest('hex').slice(0, 12),
        diferencaEscala10: (saldo.ativo - saldo.passivo).toString(),
      });
    }
  }
  return { comparados, divergentes };
}

function idAuditoria(jobId, cadastroSha, regrasVersao = REGRAS_VERSAO, parserVersao = parser.PARSER_VERSAO) {
  const chave = `${jobId}|parser-${parserVersao}|regras-${regrasVersao}|cadastro-${cadastroSha}`;
  const hash = crypto.createHash('sha256').update(chave).digest('hex');
  return { id: `quality-cvm-${hash.slice(0, 32)}`, chave };
}

async function persistirResultado(pool, runId, metricas, achados, resultado, resumo) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const m of metricas) await c.query(`INSERT INTO fin_quality_metrics
      (run_id,regra,escopo,valor) VALUES ($1,$2,$3,$4::jsonb)
      ON CONFLICT (run_id,regra,escopo) DO UPDATE SET valor=EXCLUDED.valor`,
    [runId, m.regra, m.escopo || '', JSON.stringify(m.valor)]);
    for (const a of achados.listar()) await c.query(`INSERT INTO fin_quality_findings
      (run_id,regra,gravidade,agrupador,quantidade,amostras,detalhes)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
      ON CONFLICT (run_id,regra,gravidade,agrupador) DO UPDATE SET
        quantidade=EXCLUDED.quantidade, amostras=EXCLUDED.amostras, detalhes=EXCLUDED.detalhes`,
    [runId, a.regra, a.gravidade, a.agrupador, a.quantidade,
      JSON.stringify(a.amostras), JSON.stringify(a.detalhes)]);
    await c.query(`UPDATE fin_quality_runs SET status='concluida', resultado=$2,
      resumo=$3::jsonb, concluido_em=now(), atualizado_em=now(), erro='' WHERE id=$1`,
    [runId, resultado, JSON.stringify(resumo)]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}

async function executar({ env = process.env, fetchImpl = global.fetch, storage = storagePadrao,
  PoolClass = Pool, logger = console } = {}) {
  const inicio = Date.now();
  const { connectionString, configS3 } = configAmbiente(env);
  let admin, lock, pool, indice, workDir = '';
  let runId = '';
  try {
    const saude = await preflight.executar({ configS3, postgresOpts: { connectionString }, r2Opts: { fetchImpl, storage } });
    if (!saude.ok) throw new Error(`Preflight da auditoria reprovado: postgres=${saude.postgres.categoria}; r2=${saude.r2.categoria}.`);
    admin = new PoolClass({ connectionString, max: 1 });
    lock = await admin.connect();
    const trava = await lock.query("SELECT pg_try_advisory_lock(hashtext('finance-market-quality-cvm-dfp-2025')) AS locked");
    if (!trava.rows[0]?.locked) throw new Error('Já existe uma auditoria CVM DFP 2025 em execução.');
    await lock.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    pool = new PoolClass({ connectionString, max: 1 });
    await pool.query(`SET search_path TO ${SCHEMA}`);
    await pool.query(QUALITY_SCHEMA_SQL);
    const jobs = await pool.query(`SELECT j.* FROM fin_market_jobs j
      WHERE j.status='concluida' AND j.conjunto='cvm_dfp_2025'
        AND EXISTS (SELECT 1 FROM fin_market_particoes p WHERE p.job_id=j.id AND p.parser_versao=$1)
      ORDER BY j.concluido_em DESC LIMIT 1`, [parser.PARSER_VERSAO]);
    const job = jobs.rows[0];
    if (!job) throw new Error(`Nenhum job concluído do parser v${parser.PARSER_VERSAO} na quarentena.`);
    const prefixo = String(job.objeto_chave || '').slice(0, String(job.objeto_chave || '').indexOf('raw/'));
    if (!prefixo.startsWith(piloto.PREFIXO_RAIZ)) throw new Error('Job selecionado fora da quarentena aprovada.');

    const cadastro = await baixarCadastro(fetchImpl);
    const identidade = idAuditoria(job.id, cadastro.sha256);
    runId = identidade.id;
    const anterior = await pool.query('SELECT status,resultado,resumo FROM fin_quality_runs WHERE chave_idempotencia=$1', [identidade.chave]);
    if (anterior.rows[0]) {
      if (anterior.rows[0].status !== 'concluida') throw new Error('A mesma auditoria possui tentativa incompleta; revise o histórico.');
      const resumo = anterior.rows[0].resumo || {};
      logger.log(`[finance-market-quality-cvm] OK idempotente=sim resultado=${anterior.rows[0].resultado} registros=${resumo.registros || 0} bloqueadores=${resumo.bloqueadores || 0} alertas=${resumo.alertas || 0}`);
      return { ok: true, idempotente: true, resultado: anterior.rows[0].resultado, ...resumo };
    }
    await pool.query(`INSERT INTO fin_quality_runs
      (id,job_id,parser_versao,regras_versao,cadastro_sha256,cadastro_etag,
       cadastro_ultima_modificacao,chave_idempotencia,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processando')`, [runId, job.id, parser.PARSER_VERSAO,
      REGRAS_VERSAO, cadastro.sha256, cadastro.etag, cadastro.ultimaModificacao, identidade.chave]);

    const [partesR, identidadesR] = await Promise.all([
      pool.query(`SELECT sequencia,objeto_chave,sha256,registros,parser_versao
        FROM fin_market_particoes WHERE job_id=$1 ORDER BY sequencia`, [job.id]),
      pool.query('SELECT valor,nome,dados FROM fin_market_identidades WHERE tenant_ref=$1', [job.tenant_ref]),
    ]);
    if (!partesR.rows.length || partesR.rows.some((p, i) => Number(p.sequencia) !== i + 1
      || Number(p.parser_versao) !== parser.PARSER_VERSAO)) {
      throw new Error('Sequência ou versão das partições da quarentena é inválida.');
    }

    const base = path.resolve(env.FINANCE_INV_WORK_DIR || path.join(os.tmpdir(), 'villela-finance-market-quality'));
    workDir = path.join(base, runId);
    if (path.dirname(path.resolve(workDir)) !== base) throw new Error('Staging da auditoria fora do diretório aprovado.');
    fs.mkdirSync(workDir, { recursive: true });
    indice = new DatabaseSync(path.join(workDir, 'quality-index.sqlite'));
    indice.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE chaves (chave BLOB PRIMARY KEY, valor BLOB NOT NULL) STRICT; BEGIN');
    const statements = {
      inserir: indice.prepare('INSERT OR IGNORE INTO chaves(chave,valor) VALUES (?,?)'),
      buscar: indice.prepare('SELECT valor FROM chaves WHERE chave=?'),
    };
    const achados = new Achados();
    const cadastroIndex = indexarCadastro(cadastro, achados);
    const cobertura = new Map(), balancos = new Map();
    let registros = 0;
    for (const parte of partesR.rows) registros += await auditarParticao(parte, {
      configS3, prefixo, achados, indice: statements, cobertura, balancos,
    }, fetchImpl, storage);
    indice.exec('COMMIT');
    const cruzamento = compararCadastros(identidadesR.rows, cadastroIndex, cobertura, achados);
    const reconciliacao = reconciliarBalancos(balancos, achados);
    const totais = achados.totais();
    const resultado = totais.BLOQUEADOR ? 'REPROVADO' : (totais.ALERTA ? 'ATENCAO' : 'APROVADO_TECNICAMENTE');
    const resumo = {
      registros, particoes: partesR.rows.length, identidades: identidadesR.rows.length,
      companhiasDfp: cruzamento.companhiasDfp, cadastroRegistros: cadastro.registros.length,
      cadastroSha: cadastro.sha256.slice(0, 12), bloqueadores: totais.BLOQUEADOR,
      alertas: totais.ALERTA, regrasComAchado: achados.listar().length,
      balancosComparados: reconciliacao.comparados, balancosDivergentes: reconciliacao.divergentes,
      duracao_ms: Date.now() - inicio,
    };
    const metricas = [
      { regra: 'volume', valor: { registros, particoes: partesR.rows.length, identidades: identidadesR.rows.length } },
      { regra: 'cadastro', valor: { registros: cadastro.registros.length, sha256: cadastro.sha256 } },
      { regra: 'reconciliacao_balanco', valor: reconciliacao },
      { regra: 'achados', valor: totais },
      ...['BPA', 'BPP', 'DRE', 'DFC', 'DMPL', 'DRA', 'DVA'].map(categoria => ({
        regra: 'cobertura_demonstracao', escopo: categoria,
        valor: { companhias: [...cobertura.values()].filter(x => x.has(categoria)).length },
      })),
    ];
    await persistirResultado(pool, runId, metricas, achados, resultado, resumo);
    logger.log(`[finance-market-quality-cvm] OK idempotente=nao resultado=${resultado} duracao=${resumo.duracao_ms}ms registros=${registros} particoes=${resumo.particoes} identidades=${resumo.identidades} cadastro=${resumo.cadastroRegistros} bloqueadores=${resumo.bloqueadores} alertas=${resumo.alertas} regras=${resumo.regrasComAchado} balancos=${resumo.balancosComparados}/${resumo.balancosDivergentes} cadastro_sha=${resumo.cadastroSha}`);
    return { ok: true, idempotente: false, resultado, ...resumo };
  } catch (e) {
    if (pool && runId) {
      try { await pool.query(`UPDATE fin_quality_runs SET status='falhou', erro=$2, atualizado_em=now() WHERE id=$1 AND status='processando'`, [runId, String(e.message || e).slice(0, 1000)]); } catch { /* erro original prevalece */ }
    }
    throw e;
  } finally {
    if (indice) { try { indice.close(); } catch { /* encerramento não altera resultado */ } }
    if (workDir) {
      const resolvido = path.resolve(workDir);
      if (path.basename(resolvido).startsWith('quality-cvm-')) {
        try { fs.rmSync(resolvido, { recursive: true, force: true }); } catch { /* relatório persistido prevalece */ }
      }
    }
    if (pool) { try { await pool.end(); } catch { /* encerramento não altera resultado */ } }
    if (lock) {
      try { await lock.query("SELECT pg_advisory_unlock(hashtext('finance-market-quality-cvm-dfp-2025'))"); } catch { /* conexão pode ter encerrado */ }
      try { lock.release(); } catch { /* conexão pode ter encerrado */ }
    }
    if (admin) { try { await admin.end(); } catch { /* encerramento não altera resultado */ } }
  }
}

if (require.main === module) executar().catch(e => {
  console.error(`[finance-market-quality-cvm] FALHA ${String(e && e.message || e).slice(0, 500)}`);
  process.exitCode = 1;
});

module.exports = {
  REGRAS_VERSAO, FONTE_CADASTRO, SCHEMA, LIMITE_CADASTRO, QUALITY_SCHEMA_SQL,
  configAmbiente, somenteDigitos, codigoCvm, textoComparavel, dataIsoValida,
  decimalEscala10, categoriaFormulario, Achados, baixarCadastro, indexarCadastro,
  chaveNatural, analisarFato, auditarParticao, compararCadastros, reconciliarBalancos,
  idAuditoria, persistirResultado, executar,
};
