// =====================================================================
// Villela Growth OS — barramento de eventos (padrão outbox).
//
// O evento é gravado na MESMA transação da mudança de domínio: ou os dois
// existem, ou nenhum. O worker depois entrega aos assinantes; entrega
// pesada vira job na fila.
//
// Garantias: idempotência por chave_idem, correlação ponta a ponta,
// retentativa com backoff e limite de profundidade (anti-loop).
// Catálogo e contrato: docs/growth-os/EVENTS.md
// =====================================================================
'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const repo = require('./repo');
const tenancy = require('./tenancy');
const { db, nowISO, novoId, j } = require('./db');

const alsEvento = new AsyncLocalStorage();          // evento sendo processado
const PROFUNDIDADE_MAX = Number(process.env.GROWTH_EVENTO_PROFUNDIDADE || 12);
const MAX_TENTATIVAS = 5;

// Tipos conhecidos (docs/growth-os/EVENTS.md). Tipo fora da lista é aceito,
// mas fica registrado como desconhecido — melhor um aviso do que um evento
// perdido em silêncio.
const CATALOGO = new Set([
  'lead.created', 'lead.qualified', 'contact.updated', 'contact.consent_updated',
  'contact.identity_merged', 'form.submitted', 'opportunity.created',
  'opportunity.stage_changed', 'task.overdue',
  'message.received', 'message.sent', 'conversation.assigned',
  'meeting.booked', 'meeting.cancelled',
  'campaign.created', 'campaign.approved', 'content.published', 'publication.failed',
  'ad_budget_threshold_reached', 'review.received',
  'automation.started', 'automation.completed', 'automation.failed',
  'agent.action_requested', 'agent.approval_required', 'agent.action_completed',
  'subscription.changed', 'usage.limit_reached', 'integration.disconnected',
  'tenant.created', 'membership.granted', 'membership.revoked', 'role.changed',
  'approval.requested', 'approval.decided', 'job.dead_lettered',
  'incident.opened', 'incident.closed',
]);

// assinantes: tipo → [{ nome, fn, assincrono, fila }]
const assinantes = new Map();

/**
 * Registra um assinante.
 * `assincrono: true` → a entrega vira job na fila (trabalho pesado, chamada
 * externa). `false` → roda no próprio ciclo do worker.
 */
function assinar(tipo, nome, fn, { assincrono = false, fila = 'eventos' } = {}) {
  if (!assinantes.has(tipo)) assinantes.set(tipo, []);
  const lista = assinantes.get(tipo);
  if (lista.some(a => a.nome === nome)) return false;
  lista.push({ nome, fn, assincrono, fila });
  return true;
}
const assinantesDe = (tipo) => assinantes.get(tipo) || [];
const limparAssinantes = () => assinantes.clear();       // usado pelos testes

/**
 * Publica um evento. Roda dentro do contexto de tenant do chamador; para
 * evento de plataforma, use dentro de tenancy.comoPlataforma().
 * Devolve o id, ou null quando a chave de idempotência já existia.
 */
function publicar(tipo, { refTipo = '', refId = '', payload = {}, chaveIdem = '', causationId = null, origem = 'api' } = {}) {
  const pai = alsEvento.getStore() || null;
  const profundidade = pai ? Number(pai.profundidade || 0) + 1 : 0;

  if (profundidade > PROFUNDIDADE_MAX) {
    abrirIncidenteDeLoop(tipo, pai);
    return null;
  }

  const linha = {
    tipo,
    ref_tipo: refTipo, ref_id: refId,
    payload: j.str(payload),
    chave_idem: chaveIdem || '',
    correlation_id: tenancy.correlationId() || (pai && pai.correlation_id) || tenancy.novoCorrelationId(),
    causation_id: causationId || (pai ? pai.id : ''),
    origem, profundidade,
    status: 'pendente', tentativas: 0, proxima_em: nowISO(),
    quando: nowISO(),
  };

  try {
    const id = tenancy.ehPlataforma() && !(tenancy.atual() || {}).tenantId
      ? repo.inserirPlataforma('gx_eventos', linha)
      : repo.inserir('gx_eventos', linha);
    return id;
  } catch (e) {
    // índice único de chave_idem: já publicado, não é erro
    if (chaveIdem && /UNIQUE|constraint/i.test(String(e.message))) return null;
    throw e;
  }
}

function abrirIncidenteDeLoop(tipo, pai) {
  try {
    const dados = {
      natureza: 'fila', severidade: 'alta',
      titulo: `Encadeamento de eventos passou de ${PROFUNDIDADE_MAX} níveis`,
      detalhe: `Tipo bloqueado: ${tipo}. Correlação: ${pai ? pai.correlation_id : ''}`,
      ref_tipo: 'evento', ref_id: pai ? pai.id : '',
      correlation_id: pai ? pai.correlation_id : tenancy.correlationId(),
      status: 'aberto', criado_em: nowISO(),
    };
    if (tenancy.ehPlataforma() && !(tenancy.atual() || {}).tenantId) repo.inserirPlataforma('gx_incidentes', dados);
    else repo.inserir('gx_incidentes', dados);
  } catch (_) { /* incidente é melhor esforço; nunca derruba o publicador */ }
}

// ------------------------------------------------------------- entrega

const pendentes = (limite = 50) => db.prepare(
  "SELECT * FROM gx_eventos WHERE status = 'pendente' AND (proxima_em = '' OR proxima_em <= ?) ORDER BY quando LIMIT ?"
).all(nowISO(), Math.min(Number(limite) || 50, 500));

/**
 * Entrega um evento aos assinantes. Handler síncrono roda aqui; handler
 * assíncrono vira job. Falha de um assinante não impede os outros — o
 * evento só é marcado como falho se ninguém entregou.
 */
function despachar(evento) {
  const lista = assinantesDe(evento.tipo);
  const erros = [];
  const fila = require('./fila');

  const executar = () => {
    for (const a of lista) {
      try {
        if (a.assincrono) {
          fila.enfileirar({
            tipo: `evento:${evento.tipo}:${a.nome}`, fila: a.fila,
            payload: { eventoId: evento.id, tipo: evento.tipo, payload: j.parse(evento.payload, {}) },
            chaveIdem: `ev:${evento.id}:${a.nome}`,
            correlationId: evento.correlation_id, eventoId: evento.id,
          });
        } else {
          a.fn(j.parse(evento.payload, {}), evento);
        }
      } catch (e) {
        erros.push(`${a.nome}: ${e.message}`);
      }
    }
  };

  // handler roda no contexto do tenant dono do evento
  alsEvento.run(evento, () => {
    if (evento.tenant_id) {
      tenancy.comTenant({ tenantId: evento.tenant_id, correlationId: evento.correlation_id, userId: 'sistema' }, executar);
    } else {
      tenancy.comoPlataforma({ userId: 'sistema', motivo: `evento ${evento.tipo}`, correlationId: evento.correlation_id }, executar);
    }
  });

  if (!erros.length) {
    db.prepare("UPDATE gx_eventos SET status = 'processado', processado_em = ?, ultimo_erro = '' WHERE id = ?")
      .run(nowISO(), evento.id);
    return { ok: true, assinantes: lista.length };
  }

  const tentativas = Number(evento.tentativas || 0) + 1;
  const desiste = tentativas >= MAX_TENTATIVAS;
  db.prepare('UPDATE gx_eventos SET status = ?, tentativas = ?, proxima_em = ?, ultimo_erro = ? WHERE id = ?')
    .run(desiste ? 'falha' : 'pendente', tentativas, desiste ? '' : proximaTentativa(tentativas), erros.join(' | ').slice(0, 500), evento.id);
  return { ok: false, erros, desistiu: desiste };
}

/** Backoff exponencial com teto de 1 hora. */
function proximaTentativa(tentativas) {
  const ms = Math.min(1000 * Math.pow(2, tentativas), 60 * 60 * 1000);
  return new Date(Date.now() + ms).toISOString();
}

/** Lote do worker. Roda em escopo de plataforma (varre todas as contas). */
function processarPendentes(limite = 50) {
  const lote = pendentes(limite);
  let ok = 0, falhas = 0;
  for (const ev of lote) {
    const r = despachar(ev);
    if (r.ok) ok++; else falhas++;
  }
  return { total: lote.length, ok, falhas };
}

/** Reprocesso controlado (§ replay do EVENTS.md): sempre explícito e auditado. */
function reprocessar(eventoId, { motivo = '' } = {}) {
  if (!tenancy.ehPlataforma()) {
    const e = new Error('Replay de evento é operação de plataforma.'); e.status = 403; throw e;
  }
  const ev = db.prepare('SELECT * FROM gx_eventos WHERE id = ?').get(eventoId);
  if (!ev) return null;
  db.prepare("UPDATE gx_eventos SET status = 'pendente', tentativas = 0, proxima_em = ?, ultimo_erro = '' WHERE id = ?")
    .run(nowISO(), eventoId);
  repo.auditar({ acao: 'evento.replay', entidade: 'gx_eventos', entidadeId: eventoId, detalhe: motivo, tenantId: ev.tenant_id || '' });
  return db.prepare('SELECT * FROM gx_eventos WHERE id = ?').get(eventoId);
}

const eventoAtual = () => alsEvento.getStore() || null;

module.exports = {
  CATALOGO, PROFUNDIDADE_MAX,
  publicar, assinar, assinantesDe, limparAssinantes,
  pendentes, despachar, processarPendentes, reprocessar, eventoAtual, proximaTentativa,
};
