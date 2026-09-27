// =====================================================================
// Processo do background worker de parsing de mercado.
//
// Execução: npm run finance:market-worker
// Nasce fechado por FINANCE_INV_PARSE_WORKER=off e não expõe HTTP.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const storagePadrao = require('../storage-s3');
const parser = require('./investimentos-parser');
const mercadoDbModulo = require('./investimentos-mercado-db');

const INTERVALO_PADRAO_MS = 15_000;
const LOTE_PADRAO_BYTES = 4 * 1024 * 1024;
const ligado = () => String(process.env.FINANCE_INV_PARSE_WORKER || '').toLowerCase() === 'on';
function configS3() {
  const cfg = {
    endpoint: String(process.env.FINANCE_S3_ENDPOINT || ''), bucket: String(process.env.FINANCE_S3_BUCKET || ''),
    key: String(process.env.FINANCE_S3_KEY || ''), secret: String(process.env.FINANCE_S3_SECRET || ''),
    region: String(process.env.FINANCE_S3_REGION || 'auto'),
  };
  return cfg.endpoint && cfg.bucket && cfg.key && cfg.secret ? cfg : null;
}

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
const shaArquivo = caminho => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  const s = fs.createReadStream(caminho);
  s.on('data', c => h.update(c)); s.on('error', reject); s.on('end', () => resolve(h.digest('hex')));
});

async function baixarObjeto(job, caminho, cfg, { storage = storagePadrao, fetchImpl = global.fetch } = {}) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const remoto = await storage.s3Existe(cfg, job.objeto_chave);
  if (!remoto || Number(remoto.tamanho) !== Number(job.tamanho_bytes)) {
    throw new parser.ErroParserMercado('Objeto bruto ausente ou com tamanho divergente no R2.');
  }
  let inicio = fs.existsSync(caminho) ? fs.statSync(caminho).size : 0;
  if (inicio > Number(job.tamanho_bytes)) { fs.truncateSync(caminho, 0); inicio = 0; }
  if (inicio < Number(job.tamanho_bytes)) {
    const url = storage.presignS3(cfg, 'GET', job.objeto_chave, 900);
    const headers = inicio ? { Range: `bytes=${inicio}-` } : {};
    const r = await fetchImpl(url, { method: 'GET', headers, redirect: 'manual' });
    if (!r.ok || (inicio && r.status !== 206) || !r.body) {
      throw new parser.ErroParserMercado(`R2 recusou retomada do objeto bruto (HTTP ${r.status}).`, { permanente: false });
    }
    if (inicio) {
      const faixa = String(r.headers.get('content-range') || '');
      const m = faixa.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
      if (!m || Number(m[1]) !== inicio || Number(m[2]) !== Number(job.tamanho_bytes) - 1
          || Number(m[3]) !== Number(job.tamanho_bytes)) {
        throw new parser.ErroParserMercado('R2 respondeu uma faixa diferente da retomada solicitada.');
      }
    }
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(caminho, { flags: inicio ? 'a' : 'w' }));
  }
  const tamanho = fs.statSync(caminho).size;
  if (tamanho !== Number(job.tamanho_bytes)) {
    throw new parser.ErroParserMercado(`Staging incompleto (${tamanho}/${job.tamanho_bytes}).`, { permanente: false });
  }
  const sha256 = await shaArquivo(caminho);
  if (sha256 !== job.sha256) throw new parser.ErroParserMercado('SHA-256 do staging diverge do manifesto.');
  return { caminho, tamanho, sha256 };
}

class EscritorParticoes {
  constructor({ job, db, cfg, storage = storagePadrao, limiteBytes = LOTE_PADRAO_BYTES, checkpoint = {} }) {
    this.job = job; this.db = db; this.cfg = cfg; this.storage = storage; this.limiteBytes = limiteBytes;
    this.sequencia = Number(checkpoint.proximaParticao || 1);
    this.linhas = []; this.bytes = 0; this.progresso = null;
  }

  async adicionar(registro, progresso) {
    const linha = JSON.stringify(registro) + '\n';
    const bytes = Buffer.byteLength(linha);
    if (bytes > this.limiteBytes) throw new parser.ErroParserMercado('Registro normalizado excede o limite da partição.');
    if (this.bytes && this.bytes + bytes > this.limiteBytes) await this.flush();
    this.linhas.push(linha); this.bytes += bytes; this.progresso = { ...progresso };
  }

  async flush() {
    if (!this.linhas.length) return null;
    const buffer = Buffer.from(this.linhas.join(''));
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const prefixo = String(process.env.FINANCE_INV_NORM_PREFIXO || 'financeiro/investimentos/normalizado/')
      .replace(/^\/+/, '').replace(/\/*$/, '/');
    const chave = `${prefixo}${this.job.jurisdicao.toLowerCase()}/${this.job.conjunto}/${this.job.id}/part-${String(this.sequencia).padStart(6, '0')}.jsonl`;
    await this.storage.s3Put(this.cfg, chave, buffer, 'application/x-ndjson');
    const registros = this.linhas.length;
    const docs = this.linhas.map(x => JSON.parse(x));
    const periodos = docs.map(x => x.periodoFim || '').filter(Boolean).sort();
    const taxonomias = [...new Set(docs.map(x => x.taxonomia || '').filter(Boolean))].sort();
    await this.db.registrarParticao(this.job.id, {
      sequencia: this.sequencia, objetoChave: chave, sha256, registros,
      periodoMin: periodos[0] || '', periodoMax: periodos.at(-1) || '', taxonomias,
      parserVersao: parser.PARSER_VERSAO,
    });
    this.sequencia++;
    await this.db.checkpoint(this.job.id, {
      ...(this.progresso || {}), proximaParticao: this.sequencia, parserVersao: parser.PARSER_VERSAO,
    });
    this.linhas = []; this.bytes = 0;
    return { chave, sha256, registros };
  }
}

async function executarJob(job, { db, cfg, storage = storagePadrao, fetchImpl = global.fetch,
  workDir, limiteLoteBytes } = {}) {
  const raiz = workDir || process.env.FINANCE_INV_WORK_DIR || path.join(os.tmpdir(), 'villela-finance-market');
  const extensao = job.formato === 'zip' ? 'zip' : 'csv';
  const caminho = path.join(raiz, `${job.id}.${extensao}`);
  const catalogo = path.join(raiz, `${job.id}.catalog.sqlite`);
  const checkpoint = typeof job.checkpoint === 'string' ? JSON.parse(job.checkpoint || '{}') : (job.checkpoint || {});
  await baixarObjeto(job, caminho, cfg, { storage, fetchImpl });

  if (job.formato === 'zip') {
    await parser.catalogarZip(caminho, catalogo, {
      onEntradas: entradas => db.registrarEntradas(job.id, entradas),
    });
  }

  const escritor = new EscritorParticoes({
    job, db, cfg, storage, checkpoint, limiteBytes: limiteLoteBytes || LOTE_PADRAO_BYTES,
  });
  const identidades = new Set();
  const handlers = {
    onEntradaIniciada: async e => { handlers.entradaAtual = { ordem: e.entradaOrdem, nome: e.nome }; },
    onIdentidade: async identidade => {
      const p = (identidade.identificadores || []).find(x => x.principal)
        || (identidade.identificadores || [])[0];
      const chave = p ? `${p.sistema}|${p.valor}` : '';
      if (!chave || identidades.has(chave)) return;
      identidades.add(chave);
      await db.registrarIdentidade(job.tenant_ref, identidade);
    },
    onRegistro: (registro, numero) => escritor.adicionar(registro, {
      entradaOrdem: handlers.entradaAtual.ordem,
      registroNaEntrada: numero,
      entradaNome: handlers.entradaAtual.nome,
    }),
    onEntradaConcluida: async e => {
      handlers.entradaAtual = { ordem: e.entradaOrdem, nome: e.nome };
      await escritor.flush();
      await db.concluirEntrada(job.id, e.nome, { registros: e.registros, sha256: e.sha256, status: 'concluida' });
      await db.checkpoint(job.id, {
        entradaOrdem: e.entradaOrdem + 1, registroNaEntrada: 0,
        proximaParticao: escritor.sequencia, parserVersao: parser.PARSER_VERSAO,
      });
    },
    entradaAtual: { ordem: Number(checkpoint.entradaOrdem || 1), nome: checkpoint.entradaNome || '' },
  };

  const resumo = await parser.processarArquivo(caminho, job, handlers, checkpoint);
  await escritor.flush();
  await db.concluir(job.id, { ...resumo, parserVersao: parser.PARSER_VERSAO });
  try { fs.unlinkSync(caminho); } catch { /* staging pode já ter sido removido */ }
  try { fs.unlinkSync(catalogo); } catch { /* CSV não cria catálogo */ }
  return resumo;
}

async function iniciar() {
  if (!ligado()) {
    console.log('[finance-market-worker] DESLIGADO (FINANCE_INV_PARSE_WORKER=off).');
    // Background workers do Render precisam manter um processo vivo. Ficar
    // dormente evita um ciclo de restart enquanto o portão operacional está
    // fechado. A mudança da env no painel provoca novo deploy/restart.
    await new Promise(resolve => {
      const pulso = setInterval(() => {}, 60_000);
      const concluir = () => { clearInterval(pulso); resolve(); };
      process.once('SIGTERM', concluir);
      process.once('SIGINT', concluir);
    });
    return;
  }
  if (!mercadoDbModulo.configurado()) throw new Error('FINANCE_MARKET_DATABASE_URL não configurada.');
  const cfg = configS3();
  if (!cfg) throw new Error('FINANCE_S3_* não configurado para o worker de mercado.');
  const db = new mercadoDbModulo.MercadoDb();
  await db.migrar();
  const workerId = `${os.hostname()}:${process.pid}`;
  let encerrando = false;
  process.once('SIGTERM', () => { encerrando = true; });
  process.once('SIGINT', () => { encerrando = true; });
  console.log(`[finance-market-worker] ativo como ${workerId}; uma carga por vez.`);
  while (!encerrando) {
    const job = await db.reivindicar(workerId);
    if (!job) { await esperar(Number(process.env.FINANCE_INV_PARSE_INTERVAL_MS || INTERVALO_PADRAO_MS)); continue; }
    try { await executarJob(job, { db, cfg }); }
    catch (e) {
      console.error(`[finance-market-worker] job ${job.id}: ${e.message}`);
      await db.falhar(job.id, e.message, !!e.permanente);
    }
  }
  await db.fechar();
}

if (require.main === module) iniciar().catch(e => { console.error('[finance-market-worker]', e.message); process.exitCode = 1; });

module.exports = {
  INTERVALO_PADRAO_MS, LOTE_PADRAO_BYTES, ligado, baixarObjeto,
  EscritorParticoes, executarJob, iniciar,
};
