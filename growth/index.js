// =====================================================================
// Villela Growth OS — montagem no app Express.
//
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./growth').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, jwtSecret });
//
// Etapa 1 (fundação SaaS): hierarquia, identidade, RBAC, entitlements,
// eventos com outbox, fila durável, aprovações, incidentes, cofre e
// catálogo de conectores. Administração em /staff/api/growth/*.
// Estado real: docs/growth-os/PROJECT_STATE.md
// =====================================================================
'use strict';
const tenancy = require('./tenancy');
const repo = require('./repo');
const rbac = require('./rbac');
const contas = require('./contas');
const sessao = require('./sessao');
const entitlements = require('./entitlements');
const eventos = require('./eventos');
const fila = require('./fila');
const aprovacoes = require('./aprovacoes');
const incidentes = require('./incidentes');
const segredos = require('./segredos');
const conectores = require('./conectores');
const { registrarRotasStaff } = require('./rotas-staff');

let _timer = null;

function montar(app, injected = {}) {
  const { requireAuth, requireAdmin, jwtSecret, alertaAugusto } = injected;
  if (!requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('growth.montar: faltam deps (requireAuth, requireAdmin, jwtSecret).');
  }

  sessao.configurar({ jwtSecret });
  semear();
  registrarHandlersDeFila();

  app.use('/staff/api/growth', tenancy.middlewareCorrelacao);
  registrarRotasStaff(app, { requireAuth, requireAdmin });

  iniciarWorker(alertaAugusto);
  console.log(
    `[growth] Villela Growth OS (Etapa 1) montado. Admin: /staff/api/growth · ` +
    `perfis: ${rbac.PERFIS.length} · conectores: ${conectores.CONECTORES.length} · ` +
    `cofre: ${segredos.configurado() ? 'ok' : 'SEM GROWTH_SECRET_KEY'}`
  );
  return { repo, contas, rbac, entitlements, eventos, fila, aprovacoes, incidentes, segredos, conectores, sessao };
}

/** Semeadura idempotente: roda em todo boot, preserva o que já existe. */
function semear() {
  const org = contas.semearPlataforma();
  const perfis = rbac.semear();
  const integracoes = conectores.semear();
  return { org: org && org.slug, perfis, integracoes };
}

/**
 * Handlers de fila da Etapa 1. Ação aprovada ainda não tem executor real —
 * e é assim que tem de ser: sem módulo de destino, a execução falha com
 * mensagem clara em vez de fingir que funcionou.
 */
function registrarHandlersDeFila() {
  fila.registrar('aprovacao:executar', (payload) => {
    const e = new Error(`Sem executor para a ação "${payload.acao}" — o módulo de destino ainda não existe.`);
    e.status = 501; throw e;
  });
}

/**
 * Worker: eventos pendentes + fila + higiene. Lote pequeno, unref() para
 * não segurar o processo. GROWTH_WORKER=off desliga.
 */
function iniciarWorker(alertaAugusto) {
  if (String(process.env.GROWTH_WORKER || 'on').toLowerCase() === 'off') {
    console.log('[growth] worker desligado (GROWTH_WORKER=off).');
    return null;
  }
  const intervalo = Number(process.env.GROWTH_WORKER_MS) || 5000;
  let ciclos = 0;

  _timer = setInterval(() => {
    tenancy.comoPlataforma({ userId: 'worker', motivo: 'ciclo do worker' }, () => {
      try {
        eventos.processarPendentes(50);
        const r = fila.processarLote(20);
        if (r && typeof r.then === 'function') r.catch(() => {});
      } catch (e) {
        console.error('[growth] worker:', e.message);
      }
      // higiene a cada ~5 min
      if (++ciclos % Math.max(1, Math.round(300000 / intervalo)) === 0) {
        try {
          const travados = fila.recuperarTravados();
          const expirados = aprovacoes.expirarVencidos();
          const criticos = incidentes.abertos(50).filter(i => i.severidade === 'critica');
          if (criticos.length && typeof alertaAugusto === 'function') {
            alertaAugusto(`🚨 Growth OS: ${criticos.length} incidente(s) crítico(s) aberto(s).`);
          }
          void travados; void expirados;
        } catch (_) { /* higiene é melhor esforço */ }
      }
    });
  }, intervalo);

  if (_timer.unref) _timer.unref();
  console.log(`[growth] worker a cada ${intervalo}ms (eventos + fila + higiene).`);
  return _timer;
}

const pararWorker = () => { if (_timer) { clearInterval(_timer); _timer = null; } };

module.exports = {
  montar, semear, iniciarWorker, pararWorker, registrarHandlersDeFila,
  tenancy, repo, rbac, contas, sessao, entitlements, eventos, fila,
  aprovacoes, incidentes, segredos, conectores,
};
