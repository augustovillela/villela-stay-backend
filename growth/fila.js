// =====================================================================
// Villela Growth OS — fila durável de trabalho.
//
// Sem Redis/BullMQ (ADR-0001): a fila é uma tabela. Em compensação, ela
// herda a transação e o backup do banco — job enfileirado junto com a
// mudança de domínio não se perde se o processo cair no meio.
//
// Entrega: no mínimo uma vez. O handler PRECISA ser idempotente.
// Esgotadas as tentativas, o job vai para `dlq` — nunca some, nunca fica
// girando para sempre.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const { db, nowISO, j } = require('./db');

const handlers = new Map();                     // tipo → fn(payload, job)
const BASE_MS = Number(process.env.GROWTH_FILA_BACKOFF_MS || 2000);

const registrar = (tipo, fn) => { handlers.set(tipo, fn); return true; };
const registrado = (tipo) => handlers.has(tipo);
const limparHandlers = () => handlers.clear();  // usado pelos testes

/**
 * Enfileira trabalho. `chaveIdem` evita duplicata (o índice único é a
 * garantia real, não a checagem prévia).
 * Devolve o id, ou null quando a chave já existia.
 */
function enfileirar({
  tipo, payload = {}, fila = 'padrao', prioridade = 5,
  maxTentativas = 5, timeoutMs = 30000, chaveIdem = '',
  correlationId = null, eventoId = '', agendarPara = null,
}) {
  if (!tipo) throw new Error('Job precisa de tipo.');
  const linha = {
    fila, tipo, payload: j.str(payload),
    prioridade: Number(prioridade) || 5,
    status: 'pendente', tentativas: 0,
    max_tentativas: Number(maxTentativas) || 5,
    proxima_em: agendarPara || nowISO(),
    timeout_ms: Number(timeoutMs) || 30000,
    chave_idem: chaveIdem || '',
    correlation_id: correlationId || tenancy.correlationId() || '',
    evento_id: eventoId || '',
    criado_em: nowISO(),
  };
  try {
    return tenancy.ehPlataforma() && !(tenancy.atual() || {}).tenantId
      ? repo.inserirPlataforma('gx_jobs', linha)
      : repo.inserir('gx_jobs', linha);
  } catch (e) {
    if (chaveIdem && /UNIQUE|constraint/i.test(String(e.message))) return null;
    throw e;
  }
}

const proximos = (limite = 20) => db.prepare(
  "SELECT * FROM gx_jobs WHERE status = 'pendente' AND (proxima_em = '' OR proxima_em <= ?) " +
  'ORDER BY prioridade ASC, criado_em ASC LIMIT ?'
).all(nowISO(), Math.min(Number(limite) || 20, 200));

/**
 * Executa um job. O handler roda no contexto do tenant dono do job — ou
 * seja, um job não enxerga mais do que a conta dele enxerga.
 */
function executar(job) {
  const fn = handlers.get(job.tipo);
  if (!fn) {
    return falhar(job, `Sem handler registrado para "${job.tipo}".`, { semHandler: true });
  }
  db.prepare("UPDATE gx_jobs SET status = 'processando', iniciado_em = ?, tentativas = tentativas + 1 WHERE id = ?")
    .run(nowISO(), job.id);

  const payload = j.parse(job.payload, {});
  const rodar = () => fn(payload, job);

  try {
    const resultado = job.tenant_id
      ? tenancy.comTenant({ tenantId: job.tenant_id, userId: 'sistema', correlationId: job.correlation_id }, rodar)
      : tenancy.comoPlataforma({ userId: 'sistema', motivo: `job ${job.tipo}`, correlationId: job.correlation_id }, rodar);

    if (resultado && typeof resultado.then === 'function') {
      // handler assíncrono: o lote não espera — conclui quando resolver
      return resultado.then(
        (r) => concluir(job, r),
        (e) => falhar(job, e && e.message ? e.message : String(e), { permanente: !!(e && e.permanente) })
      );
    }
    return concluir(job, resultado);
  } catch (e) {
    return falhar(job, e && e.message ? e.message : String(e), { permanente: !!(e && e.permanente) });
  }
}

function concluir(job, resultado) {
  db.prepare("UPDATE gx_jobs SET status = 'concluido', concluido_em = ?, resultado = ?, ultimo_erro = '' WHERE id = ?")
    .run(nowISO(), typeof resultado === 'string' ? resultado : j.str(resultado === undefined ? null : resultado), job.id);
  return { ok: true, id: job.id };
}

/**
 * `permanente` = o motivo não muda com o tempo (ação sem destino, pedido
 * que não existe mais, payload inválido). Repetir 5 vezes só atrasa o
 * diagnóstico — vai direto para a DLQ, que é onde alguém olha.
 */
function falhar(job, mensagem, { semHandler = false, permanente = false } = {}) {
  const tentativas = Number(job.tentativas || 0) + 1;
  const esgotou = semHandler || permanente || tentativas >= Number(job.max_tentativas || 5);
  if (esgotou) {
    db.prepare("UPDATE gx_jobs SET status = 'dlq', ultimo_erro = ?, concluido_em = ? WHERE id = ?")
      .run(String(mensagem).slice(0, 500), nowISO(), job.id);
    aoMorrer(job, mensagem);
  } else {
    db.prepare("UPDATE gx_jobs SET status = 'pendente', proxima_em = ?, ultimo_erro = ? WHERE id = ?")
      .run(backoff(tentativas), String(mensagem).slice(0, 500), job.id);
  }
  return { ok: false, id: job.id, erro: mensagem, dlq: esgotou };
}

/** Job morto vira evento + incidente: falha silenciosa é o pior desfecho. */
function aoMorrer(job, mensagem) {
  try {
    const eventos = require('./eventos');
    const publicar = () => eventos.publicar('job.dead_lettered', {
      refTipo: 'job', refId: job.id,
      payload: { tipo: job.tipo, fila: job.fila, erro: String(mensagem).slice(0, 300) },
      chaveIdem: `dlq:${job.id}`, origem: 'worker',
    });
    if (job.tenant_id) tenancy.comTenant({ tenantId: job.tenant_id, userId: 'sistema', correlationId: job.correlation_id }, publicar);
    else tenancy.comoPlataforma({ userId: 'sistema', motivo: 'dead letter', correlationId: job.correlation_id }, publicar);
  } catch (_) { /* melhor esforço */ }
}

function backoff(tentativas) {
  const ms = Math.min(BASE_MS * Math.pow(2, tentativas - 1), 60 * 60 * 1000);
  return new Date(Date.now() + ms).toISOString();
}

/** Um lote do worker. Roda em escopo de plataforma. */
function processarLote(limite = 20) {
  const lote = proximos(limite);
  let ok = 0, falhas = 0;
  const pendentesAsync = [];
  for (const job of lote) {
    const r = executar(job);
    if (r && typeof r.then === 'function') pendentesAsync.push(r);
    else if (r && r.ok) ok++; else falhas++;
  }
  if (pendentesAsync.length) {
    return Promise.all(pendentesAsync).then(rs => ({
      total: lote.length,
      ok: ok + rs.filter(r => r && r.ok).length,
      falhas: falhas + rs.filter(r => !r || !r.ok).length,
    }));
  }
  return { total: lote.length, ok, falhas };
}

/** Reprocessa job da DLQ. Sempre explícito e auditado. */
function reenfileirar(jobId, { motivo = '' } = {}) {
  const job = db.prepare('SELECT * FROM gx_jobs WHERE id = ?').get(jobId);
  if (!job) return null;
  db.prepare("UPDATE gx_jobs SET status = 'pendente', tentativas = 0, proxima_em = ?, ultimo_erro = '' WHERE id = ?")
    .run(nowISO(), jobId);
  repo.auditar({ acao: 'job.reenfileirado', entidade: 'gx_jobs', entidadeId: jobId, detalhe: motivo, tenantId: job.tenant_id || '' });
  return db.prepare('SELECT * FROM gx_jobs WHERE id = ?').get(jobId);
}

function cancelar(jobId) {
  const n = db.prepare("UPDATE gx_jobs SET status = 'cancelado', concluido_em = ? WHERE id = ? AND status IN ('pendente','dlq')")
    .run(nowISO(), jobId).changes;
  return n > 0;
}

/** Painel operacional: o que está preso, o que morreu, o que está atrasado. */
function estatisticas() {
  const porStatus = db.prepare('SELECT status, COUNT(*) AS n FROM gx_jobs GROUP BY status').all();
  const out = { pendente: 0, processando: 0, concluido: 0, falha: 0, dlq: 0, cancelado: 0 };
  for (const r of porStatus) out[r.status] = r.n;
  out.atrasados = db.prepare("SELECT COUNT(*) AS n FROM gx_jobs WHERE status = 'pendente' AND proxima_em != '' AND proxima_em < ?")
    .get(new Date(Date.now() - 5 * 60 * 1000).toISOString()).n;
  out.eventos_pendentes = db.prepare("SELECT COUNT(*) AS n FROM gx_eventos WHERE status = 'pendente'").get().n;
  out.eventos_falha = db.prepare("SELECT COUNT(*) AS n FROM gx_eventos WHERE status = 'falha'").get().n;
  return out;
}

/** Job "processando" há mais que o timeout: o processo caiu no meio. */
function recuperarTravados() {
  const travados = db.prepare("SELECT * FROM gx_jobs WHERE status = 'processando'").all();
  let n = 0;
  for (const job of travados) {
    const limite = new Date(new Date(job.iniciado_em || job.criado_em).getTime() + (Number(job.timeout_ms) || 30000) * 2);
    if (limite > new Date()) continue;
    falhar(job, 'Job travado: processo interrompido antes de concluir.');
    n++;
  }
  return n;
}

module.exports = {
  registrar, registrado, limparHandlers, enfileirar, proximos, executar,
  processarLote, reenfileirar, cancelar, estatisticas, recuperarTravados, backoff,
};
