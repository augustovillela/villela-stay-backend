// =====================================================================
// ORIGENA — fila durável (ADR-0005). Espelha o growth\fila.js, que já
// provou o desenho, trocando SQLite por Postgres + SKIP LOCKED.
//
// Contrato com quem escreve handler:
//   • entrega é NO MÍNIMO UMA VEZ → o handler PRECISA ser idempotente;
//   • handler que lança é reagendado com backoff exponencial;
//   • esgotadas as tentativas, o job vai para a DLQ — nunca some.
//
// Quem consome é o worker (worker.js), NUNCA o processo web: o web tem
// 2 GB para 12 produtos, e processar mídia lá derruba o grupo inteiro.
// =====================================================================
'use strict';
const crypto = require('crypto');
const db = require('./db');

const handlers = new Map();                       // tipo → async fn(payload, job)
const BASE_MS = Number(process.env.ORIGENA_FILA_BACKOFF_MS || 2000);
const ID_WORKER = `${process.pid}-${crypto.randomBytes(3).toString('hex')}`;

const registrar = (tipo, fn) => { handlers.set(tipo, fn); return true; };
const registrado = (tipo) => handlers.has(tipo);
const tiposRegistrados = () => [...handlers.keys()].sort();
const limparHandlers = () => handlers.clear();    // só para o selftest

/**
 * Enfileira trabalho. Devolve o job, ou `null` quando `chaveIdem` já
 * existia (não é erro — é a idempotência funcionando).
 *
 * `cliente` opcional: passe o cliente da transação para o job ser
 * gravado JUNTO com a mudança de domínio. É o ponto do desenho — ou os
 * dois acontecem, ou nenhum.
 */
async function enfileirar({
  tipo, payload = {}, fila = 'rapida', prioridade = 5,
  chaveIdem = null, familyId = null, rodarApos = null, maxTentativas = 5,
} = {}, cliente = null) {
  if (!tipo) throw new Error('fila.enfileirar: tipo é obrigatório.');
  // Aceita tanto o cliente cru do `pg` (.query) quanto o wrapper de
  // transação do db.js (.q). Exigir um dos dois seria um foot-gun: quem
  // chama tem `t` em mãos e passaria `t`, não `t.cliente`.
  const exec = !cliente ? (q, v) => db.q(q, v)
    : (typeof cliente.query === 'function' ? (q, v) => cliente.query(q, v) : (q, v) => cliente.q(q, v));
  const r = await exec(
    `INSERT INTO jobs (tipo, payload, fila, prioridade, chave_idem, family_id, rodar_apos, max_tentativas)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()), $8)
     ON CONFLICT (chave_idem) WHERE chave_idem IS NOT NULL DO NOTHING
     RETURNING *`,
    [tipo, JSON.stringify(payload), fila, prioridade, chaveIdem, familyId, rodarApos, maxTentativas],
  );
  return r.rows[0] || null;
}

/**
 * Pega até `limite` jobs prontos e os marca como `processando`.
 * SKIP LOCKED faz vários workers conviverem sem disputar a mesma linha.
 */
async function pegar(limite = 5, fila = null) {
  const r = await db.q(
    `UPDATE jobs SET status = 'processando', travado_por = $1, travado_em = now(),
            tentativas = tentativas + 1, updated_at = now()
     WHERE id IN (
       SELECT id FROM jobs
       WHERE status = 'na_fila' AND rodar_apos <= now() AND ($2::text IS NULL OR fila = $2)
       ORDER BY prioridade ASC, rodar_apos ASC
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [ID_WORKER, fila, limite],
  );
  return r.rows;
}

async function concluir(job, resultado) {
  await db.q(
    `UPDATE jobs SET status='concluido', resultado=$2, erro=NULL, travado_por=NULL,
            travado_em=NULL, updated_at=now() WHERE id=$1`,
    [job.id, resultado === undefined ? null : JSON.stringify(resultado)],
  );
}

/**
 * Falhou: reagenda com backoff exponencial, ou manda para a DLQ quando
 * esgotou. O job só sai de `jobs` depois de estar seguro em `jobs_dlq` —
 * a transação garante que não existe janela onde ele some.
 */
async function falhar(job, erro) {
  const msg = String((erro && erro.message) || erro || 'erro desconhecido').slice(0, 2000);
  if (job.tentativas >= job.max_tentativas) {
    await db.transacao(async (t) => {
      await t.q(
        `INSERT INTO jobs_dlq (id, fila, tipo, payload, family_id, tentativas, erro, criado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [job.id, job.fila, job.tipo, job.payload, job.family_id, job.tentativas, msg, job.created_at],
      );
      await t.q('DELETE FROM jobs WHERE id = $1', [job.id]);
    });
    console.error(`[origena/fila] job ${job.tipo} (${job.id}) foi para a DLQ após ${job.tentativas} tentativas: ${msg}`);
    return { dlq: true };
  }
  const esperaMs = BASE_MS * Math.pow(2, Math.max(0, job.tentativas - 1));
  await db.q(
    `UPDATE jobs SET status='na_fila', erro=$2, travado_por=NULL, travado_em=NULL,
            rodar_apos = now() + ($3 || ' milliseconds')::interval, updated_at=now()
     WHERE id=$1`,
    [job.id, msg, String(esperaMs)],
  );
  return { dlq: false, esperaMs };
}

/** Processa um lote. Devolve o resumo — é o que o worker loga. */
async function processarLote(limite = 5, fila = null) {
  const jobs = await pegar(limite, fila);
  let ok = 0, falhas = 0, semHandler = 0;
  for (const job of jobs) {
    const h = handlers.get(job.tipo);
    if (!h) {
      // Erro clássico e traiçoeiro: handler com nome errado faz o job
      // falhar em silêncio. Aqui ele falha ALTO e vai para a DLQ.
      semHandler++;
      await falhar(job, `Sem handler registrado para o tipo "${job.tipo}".`);
      continue;
    }
    try {
      const r = await h(job.payload, job);
      await concluir(job, r);
      ok++;
    } catch (e) {
      falhas++;
      await falhar(job, e);
    }
  }
  return { pegos: jobs.length, ok, falhas, semHandler };
}

/**
 * Job que ficou `processando` além do limite (worker morreu no meio)
 * volta para a fila. Sem isso ele fica preso para sempre.
 */
async function destravarPresos(minutos = 15, minutosCara = 40) {
  // A FILA CARA PRECISA DE PRAZO MAIOR. Geração de vídeo é assíncrona no
  // provedor e leva minutos: com o prazo curto, um job que estava só
  // DEMORANDO volta para a fila e é executado de novo — e vídeo já pago
  // seria pago duas vezes. Prazo apertado aqui não é zelo, é cobrança
  // em duplicidade.
  const r = await db.q(
    `UPDATE jobs SET status='na_fila', travado_por=NULL, travado_em=NULL, updated_at=now()
     WHERE status='processando'
       AND travado_em < now() - (CASE WHEN fila = 'cara' THEN $2 ELSE $1 END || ' minutes')::interval
     RETURNING id`,
    [String(minutos), String(minutosCara)],
  );
  if (r.rowCount) console.warn(`[origena/fila] ${r.rowCount} job(s) presos foram destravados.`);
  return r.rowCount;
}

/** Saúde da fila — vira cartão no Portal Staff e alerta ao Augusto. */
async function saude() {
  // FILTER só se aplica a agregado: ele vai no min(), não no EXTRACT.
  const r = await db.uma(`
    SELECT
      count(*) FILTER (WHERE status='na_fila')                 AS na_fila,
      count(*) FILTER (WHERE status='processando')             AS processando,
      count(*) FILTER (WHERE status='na_fila' AND fila='cara') AS cara_na_fila,
      COALESCE(EXTRACT(EPOCH FROM now() -
        min(rodar_apos) FILTER (WHERE status='na_fila')), 0)::int AS idade_mais_velho_seg
    FROM jobs`);
  const dlq = await db.uma('SELECT count(*)::int AS n FROM jobs_dlq');
  return {
    na_fila: Number(r.na_fila), processando: Number(r.processando),
    cara_na_fila: Number(r.cara_na_fila), idade_mais_velho_seg: Number(r.idade_mais_velho_seg),
    dlq: dlq.n, handlers: tiposRegistrados().length,
  };
}

module.exports = {
  registrar, registrado, tiposRegistrados, limparHandlers,
  enfileirar, pegar, concluir, falhar, processarLote, destravarPresos, saude, ID_WORKER,
};
