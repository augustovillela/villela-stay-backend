// =====================================================================
// Voz — fila durável. Espelha music/fila.js (ADR-0003 da Musique), que
// já provou o desenho, inclusive nos detalhes que parecem paranoia.
//
// CONTRATO COM QUEM ESCREVE HANDLER:
//   • entrega é NO MÍNIMO UMA VEZ → o handler PRECISA ser idempotente;
//   • handler que lança é reagendado com backoff exponencial;
//   • esgotadas as tentativas, o job vai para a DLQ — nunca some.
//
// AS DUAS FILAS:
//   `rapida` — relatório, escrita de nível 2, envio de mensagem.
//              Consumida pelo próprio processo web.
//   `codigo` — nível 4. TRAVADA em `enfileirar` até existir executor
//              headless (decisão 4 do plano, ainda em aberto).
//
// A trava da `codigo` é deliberada e não é preguiça: sem consumidor, o
// job ficaria "pendente" para sempre — e pendente-para-sempre não parece
// erro, o que é o pior jeito de falhar. Melhor recusar na cara de quem
// enfileira, para que o pedido de código responda "isso ainda não sei
// fazer sozinho, anotei" em vez de prometer em silêncio.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');

const handlers = new Map();                       // tipo → fn(payload, job)
const BASE_MS = Number(process.env.VOZ_FILA_BACKOFF_MS || 2000);
// Liga a fila `codigo` — só faz sentido quando existir executor de
// verdade. Ver decisão 4 de docs/voz/PLANO-MVP.md.
const FILA_CODIGO_LIBERADA = process.env.VOZ_FILA_CODIGO === 'on';

const registrar = (tipo, fn) => { handlers.set(tipo, fn); return true; };
const registrado = (tipo) => handlers.has(tipo);
const tiposRegistrados = () => [...handlers.keys()].sort();
const limparHandlers = () => handlers.clear();    // só para o selftest

/** A fila `codigo` está aberta? Quem pergunta é o cérebro, para dizer a
 *  verdade ao usuário ANTES de aceitar o pedido. */
const codigoLiberado = () => FILA_CODIGO_LIBERADA;

/**
 * Enfileira trabalho. Devolve o job, ou `null` quando `chaveIdem` já
 * existia — o que não é erro, é a idempotência funcionando.
 *
 * A garantia real é o índice ÚNICO PARCIAL, não a checagem prévia: duas
 * chamadas simultâneas passariam as duas por um `SELECT` antes.
 */
function enfileirar({
  tipo, payload = {}, fila = 'rapida', prioridade = 5,
  chaveIdem = '', dono = '', maxTentativas = 5, rodarApos = null,
} = {}) {
  if (!tipo) throw new Error('fila.enfileirar: tipo é obrigatório.');
  if (fila === 'codigo' && !FILA_CODIGO_LIBERADA) {
    throw Object.assign(
      new Error('fila.enfileirar: a fila "codigo" exige executor dedicado, que ainda não existe '
        + '(decisão 4 do plano). Enquanto isso, só a fila "rapida" é consumida.'),
      { filaTravada: true });
  }
  const id = novoId();
  try {
    db.prepare(`INSERT INTO jobs (id, fila, tipo, payload, prioridade, status, max_tentativas,
                                  proxima_em, chave_idem, dono, criado_em)
                VALUES (?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?)`)
      .run(id, fila, tipo, j.str(payload), Number(prioridade) || 5,
           Number(maxTentativas) || 5, rodarApos || nowISO(), chaveIdem || '', dono || '', nowISO());
  } catch (e) {
    if (chaveIdem && /UNIQUE|constraint/i.test(String(e.message))) return null;
    throw e;
  }
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

/** Jobs prontos para rodar, do mais prioritário ao mais antigo. */
function proximos(limite = 5, fila = null) {
  const lim = Math.min(Number(limite) || 5, 200);
  return fila
    ? db.prepare("SELECT * FROM jobs WHERE status = 'pendente' AND proxima_em <= ? AND fila = ? " +
                 'ORDER BY prioridade ASC, criado_em ASC LIMIT ?').all(nowISO(), fila, lim)
    : db.prepare("SELECT * FROM jobs WHERE status = 'pendente' AND proxima_em <= ? " +
                 'ORDER BY prioridade ASC, criado_em ASC LIMIT ?').all(nowISO(), lim);
}

const backoff = (tentativas) =>
  new Date(Date.now() + BASE_MS * Math.pow(2, Math.max(0, tentativas - 1))).toISOString();

function concluir(job, resultado) {
  db.prepare("UPDATE jobs SET status = 'concluido', concluido_em = ?, resultado = ?, ultimo_erro = '' WHERE id = ?")
    .run(nowISO(), typeof resultado === 'string' ? resultado : j.str(resultado === undefined ? null : resultado), job.id);
  return { ok: true, id: job.id };
}

/**
 * `permanente` = o motivo não muda com o tempo (payload inválido, alvo
 * que não existe mais, handler ausente). Vai direto para a DLQ, que é
 * onde alguém olha.
 */
function falhar(job, mensagem, { semHandler = false, permanente = false } = {}) {
  // `job.tentativas` JÁ vem incrementado por `executar` — somar de novo
  // aqui faria a 1ª falha contar como 2 e encurtaria as tentativas pela
  // metade, em silêncio.
  const tentativas = Math.max(1, Number(job.tentativas || 0));
  const esgotou = semHandler || permanente || tentativas >= Number(job.max_tentativas || 5);
  const erro = String(mensagem).slice(0, 500);
  if (esgotou) {
    db.prepare("UPDATE jobs SET status = 'dlq', ultimo_erro = ?, concluido_em = ? WHERE id = ?")
      .run(erro, nowISO(), job.id);
    console.error(`[voz/fila] job ${job.id} (${job.tipo}) foi para a DLQ: ${erro}`);
  } else {
    db.prepare("UPDATE jobs SET status = 'pendente', proxima_em = ?, ultimo_erro = ? WHERE id = ?")
      .run(backoff(tentativas), erro, job.id);
  }
  return { ok: false, id: job.id, erro: mensagem, dlq: esgotou };
}

/** Executa um job. Sempre assíncrono, para que handler sync e async
 *  sigam exatamente o mesmo caminho de erro. */
async function executar(job) {
  const fn = handlers.get(job.tipo);
  // Handler com nome diferente do tipo enfileirado falha em SILÊNCIO em
  // muitas filas. Aqui não: DLQ na primeira tentativa e log alto —
  // repetir 5 vezes um job sem handler só atrasa o diagnóstico.
  if (!fn) return falhar(job, `Sem handler registrado para "${job.tipo}".`, { semHandler: true });

  db.prepare("UPDATE jobs SET status = 'processando', iniciado_em = ?, tentativas = tentativas + 1 WHERE id = ?")
    .run(nowISO(), job.id);
  const atualizado = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id);
  try {
    const r = await fn(j.parse(job.payload, {}), atualizado);
    return concluir(atualizado, r);
  } catch (e) {
    return falhar(atualizado, e && e.message ? e.message : String(e), { permanente: !!(e && e.permanente) });
  }
}

/** Um ciclo do worker. Devolve quantos jobs rodaram. */
async function processarLote(limite = 5, fila = null) {
  const lote = proximos(limite, fila);
  for (const job of lote) await executar(job);
  return lote.length;
}

/** Job travado em `processando` (processo morreu no meio) volta para a
 *  fila. Sem isto, um deploy no momento errado deixa trabalho parado
 *  para sempre — e ninguém percebe, porque não é erro. */
function destravar(minutos = 15) {
  const limite = new Date(Date.now() - minutos * 60000).toISOString();
  const r = db.prepare("UPDATE jobs SET status = 'pendente', proxima_em = ? " +
                       "WHERE status = 'processando' AND iniciado_em <> '' AND iniciado_em < ?")
    .run(nowISO(), limite);
  return r.changes || 0;
}

const dlq = (limite = 50) =>
  db.prepare("SELECT * FROM jobs WHERE status = 'dlq' ORDER BY concluido_em DESC LIMIT ?").all(Math.min(limite, 200));

const resumo = () => {
  const linhas = db.prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status').all();
  const r = { pendente: 0, processando: 0, concluido: 0, dlq: 0 };
  for (const l of linhas) r[l.status] = l.n;
  return r;
};

module.exports = {
  registrar, registrado, tiposRegistrados, limparHandlers, codigoLiberado,
  enfileirar, proximos, executar, processarLote, destravar, dlq, resumo,
};
