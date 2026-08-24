// =====================================================================
// Villela Finance — diário durável do razão (RPO).
//
// O SQLite fica no disco do Render, com snapshot diário (snapshots.js →
// OneDrive). Isso dá RPO de ~24 h — inaceitável para lançamento contábil.
//
// Como o razão é APPEND-ONLY e IMUTÁVEL, não é preciso replicar o banco
// inteiro: basta replicar o que foi acrescentado. Todo lote contabilizado
// é gravado aqui como uma linha JSONL, com fsync, e o arquivo do mês é
// enviado ao R2 a cada poucos minutos.
//
//   restauração = último snapshot + replay deste diário.
//
// A cadeia de hash torna o diário verificável contra o banco: se um lote
// existe no diário e não no banco (ou com valor diferente), `conferir()`
// aponta. É a prova de que a réplica serve, não a esperança de que sirva.
//
// Env: FINANCE_S3_ENDPOINT · FINANCE_S3_BUCKET · FINANCE_S3_KEY ·
// FINANCE_S3_SECRET · FINANCE_S3_PREFIXO (padrão "diario/").
// Sem elas o diário continua gravando em disco e o status diz "local".
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SAAS_DIR, nowISO } = require('./db');

const DIR = path.join(SAAS_DIR, 'diario');
fs.mkdirSync(DIR, { recursive: true });

const ESTADO = path.join(DIR, '_estado.json');
const arquivoDoMes = (competencia) => path.join(DIR, `${competencia}.jsonl`);

function lerEstado() {
  try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); }
  catch { return { seq: 0, hash: '', replicado: {} }; }
}
function gravarEstado(e) {
  const tmp = ESTADO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(e, null, 2));
  fs.renameSync(tmp, ESTADO);           // troca atômica: nunca meio-estado
}

/**
 * Acrescenta um lote contabilizado ao diário. Grava com fsync: quando esta
 * função retorna, o dado sobrevive a uma queda do processo.
 *
 * Chamada DEPOIS do COMMIT — se o commit falhar, não há o que replicar; se
 * o diário falhar depois do commit, o lote existe no banco e a conferência
 * acusa a falta (melhor do que perder o lote por causa do diário).
 */
function acrescentar(lote, linhas) {
  const estado = lerEstado();
  const registro = {
    seq: estado.seq + 1,
    gravado_em: nowISO(),
    tenant_id: lote.tenant_id,
    entidade_id: lote.entidade_id,
    lote: {
      id: lote.id, numero: lote.numero, data: lote.data, competencia: lote.competencia,
      memo: lote.memo, origem: lote.origem, origem_ref: lote.origem_ref,
      idempotencia: lote.idempotencia, status: lote.status, estorno_de: lote.estorno_de,
      total_cents: lote.total_cents, contabilizado_em: lote.contabilizado_em,
      contabilizado_por: lote.contabilizado_por, criado_por: lote.criado_por,
    },
    linhas: linhas.map(l => ({
      id: l.id, conta_id: l.conta_id, debito_cents: l.debito_cents, credito_cents: l.credito_cents,
      centro_custo_id: l.centro_custo_id, contraparte_id: l.contraparte_id,
      memo: l.memo, ref_tipo: l.ref_tipo, ref_id: l.ref_id,
    })),
    hash_anterior: estado.hash,
  };
  registro.hash = crypto.createHash('sha256')
    .update(registro.hash_anterior + JSON.stringify(registro.lote) + JSON.stringify(registro.linhas))
    .digest('hex');

  const arquivo = arquivoDoMes(lote.competencia);
  const fd = fs.openSync(arquivo, 'a');
  try {
    fs.writeSync(fd, JSON.stringify(registro) + '\n');
    fs.fsyncSync(fd);                   // é isto que faz o RPO valer
  } finally {
    fs.closeSync(fd);
  }
  gravarEstado({ seq: registro.seq, hash: registro.hash, replicado: estado.replicado });
  return registro;
}

/** Lê o diário de um mês. Linha corrompida vira `{ erro }`, não exceção. */
function ler(competencia) {
  const arquivo = arquivoDoMes(competencia);
  if (!fs.existsSync(arquivo)) return [];
  return fs.readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((linha, i) => {
    try { return JSON.parse(linha); }
    catch { return { erro: 'linha ilegível', numero_linha: i + 1 }; }
  });
}

const meses = () => fs.readdirSync(DIR).filter(n => /^\d{4}-\d{2}\.jsonl$/.test(n)).map(n => n.slice(0, 7)).sort();

/**
 * Confere o diário contra o banco: todo lote do diário existe, está
 * contabilizado e com o mesmo total? Devolve as divergências.
 */
function conferir(repo, competencia) {
  const registros = ler(competencia);
  const divergencias = [];
  let anterior = '';
  for (const r of registros) {
    if (r.erro) { divergencias.push({ tipo: 'linha_ilegivel', ...r }); continue; }
    if (r.hash_anterior !== anterior) {
      divergencias.push({ tipo: 'cadeia_quebrada', seq: r.seq, lote_id: r.lote.id });
    }
    anterior = r.hash;
    const noBanco = repo.lotePorId(r.lote.id);
    if (!noBanco) { divergencias.push({ tipo: 'ausente_no_banco', seq: r.seq, lote_id: r.lote.id }); continue; }
    if (noBanco.total_cents !== r.lote.total_cents) {
      divergencias.push({ tipo: 'total_divergente', lote_id: r.lote.id, diario: r.lote.total_cents, banco: noBanco.total_cents });
    }
    if (noBanco.status === 'rascunho') {
      divergencias.push({ tipo: 'status_divergente', lote_id: r.lote.id, banco: noBanco.status });
    }
  }
  return { competencia, registros: registros.length, divergencias, ok: divergencias.length === 0 };
}

// ------------------------------------------------------------ replicação
function configS3() {
  const endpoint = process.env.FINANCE_S3_ENDPOINT || '';
  const bucket = process.env.FINANCE_S3_BUCKET || '';
  const key = process.env.FINANCE_S3_KEY || '';
  const secret = process.env.FINANCE_S3_SECRET || '';
  if (!endpoint || !bucket || !key || !secret) return null;
  return { endpoint, bucket, key, secret, region: process.env.FINANCE_S3_REGION || 'auto' };
}

const configurada = () => !!configS3();

/**
 * Envia ao R2 os arquivos que mudaram desde a última replicação.
 * Idempotente: compara tamanho + sha256 antes de subir.
 */
async function replicar() {
  const cfg = configS3();
  if (!cfg) return { modo: 'local', enviados: 0, motivo: 'FINANCE_S3_* não configurado' };
  const { s3Put } = require('../storage-s3');
  const prefixo = process.env.FINANCE_S3_PREFIXO || 'diario/';
  const estado = lerEstado();
  const replicado = estado.replicado || {};
  const enviados = [];
  const falhas = [];

  for (const mes of meses()) {
    const arquivo = arquivoDoMes(mes);
    const conteudo = fs.readFileSync(arquivo);
    const hash = crypto.createHash('sha256').update(conteudo).digest('hex');
    if (replicado[mes] === hash) continue;
    try {
      await s3Put(cfg, `${prefixo}${mes}.jsonl`, conteudo, 'application/x-ndjson');
      replicado[mes] = hash;
      enviados.push(mes);
    } catch (e) {
      falhas.push({ mes, erro: e.message });
    }
  }
  if (enviados.length) gravarEstado({ seq: estado.seq, hash: estado.hash, replicado });
  return { modo: 'r2', enviados: enviados.length, meses: enviados, falhas };
}

/** Status para o painel: até onde o diário está replicado. */
function status() {
  const estado = lerEstado();
  const lista = meses();
  const pendentes = lista.filter(m => {
    const h = crypto.createHash('sha256').update(fs.readFileSync(arquivoDoMes(m))).digest('hex');
    return (estado.replicado || {})[m] !== h;
  });
  return {
    configurada: configurada(),
    registros: estado.seq,
    meses: lista.length,
    pendentes,
    rpoMinutos: Number(process.env.FINANCE_REPLICA_MIN) || 5,
  };
}

module.exports = { acrescentar, ler, meses, conferir, replicar, status, configurada, DIR };
