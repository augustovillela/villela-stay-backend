// =====================================================================
// Villela Finance — montagem no app Express.
//
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./financeiro').montar(app, { express, requireAuth,
//     requireAdmin, jwtSecret, alertaAugusto });
//
// Fase 1 — fundação: tenancy com trava, razão de partida dobrada, plano
//   de contas, períodos, auditoria encadeada, RBAC por nível de risco,
//   aprovações maker-checker e diário durável.
// Fase 2 — primeiro vertical slice: extrato → normalização idempotente →
//   sugestão explicável → conciliação → lote balanceado → cockpit com
//   drill-down até a linha do extrato.
//
// Assinante em /finance/* · administração em /staff/api/finance/*.
// O módulo LEGADO (`/staff/api/financeiro/*`, em server.js) segue no ar:
// a substituição é por feature flag, módulo a módulo, com reconciliação.
// Estado real: docs/financeiro/PROJECT_STATE.md
// =====================================================================
'use strict';
const tenancy = require('./tenancy');
const repo = require('./repo');
const contas = require('./contas');
const entitlements = require('./entitlements');
const rbac = require('./rbac');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');
const bancos = require('./bancos');
const classificacao = require('./classificacao');
const periodos = require('./periodos');
const relatorios = require('./relatorios');
const aprovacoes = require('./aprovacoes');
const auditoria = require('./auditoria');
const planoContas = require('./plano-contas');
const diario = require('./diario');
const { registrarRotasApp } = require('./rotas-app');
const { registrarRotasStaff } = require('./rotas-staff');

let _timer = null;

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, jwtSecret, alertaAugusto } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('financeiro.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }

  registrarExecutores();
  const semeadura = contas.semearPlataforma();

  app.use('/finance', tenancy.middlewareCorrelacao);
  app.use('/staff/api/finance', tenancy.middlewareCorrelacao);
  registrarRotasApp(app, { jwtSecret, express });
  registrarRotasStaff(app, { requireAuth, requireAdmin, express });

  iniciarWorker(alertaAugusto);

  console.log(
    `[finance] Villela Finance (Fases 1-2) montado. Assinante: /finance/api · admin: /staff/api/finance · ` +
    `planos: ${semeadura.planos.total} · conta interna: ${semeadura.tenantInterno}${semeadura.criada ? ' (criada agora)' : ''} · ` +
    `diário: ${diario.configurada() ? 'replicando para R2' : 'LOCAL (defina FINANCE_S3_* para replicar)'} · ` +
    `legado /staff/api/financeiro/* intacto`
  );

  return {
    repo, contas, entitlements, rbac, ledger, dinheiro, bancos, classificacao,
    periodos, relatorios, aprovacoes, auditoria, planoContas, diario, tenancy,
  };
}

/**
 * Liga cada ação material ao que a executa depois de aprovada. Sem isto,
 * a aprovação "passa" e nada acontece — por isso `aprovacoes.aprovar()`
 * recusa ação sem executor em vez de fingir sucesso.
 */
function registrarExecutores() {
  aprovacoes.registrarExecutor('lote.estornar', (payload) => {
    const r = ledger.estornar(payload.loteId, { motivo: payload.motivo });
    return { loteEstorno: r.estorno.id, numero: r.estorno.numero };
  });

  aprovacoes.registrarExecutor('periodo.fechar', (payload) => {
    const p = periodos.fechar(payload.entidadeId, payload.competencia, {
      por: tenancy.userAtual(), forcar: !!payload.forcar, motivo: payload.motivo,
    });
    return { competencia: p.competencia, fechadoEm: p.fechado_em };
  });

  aprovacoes.registrarExecutor('periodo.reabrir', (payload) => {
    const p = periodos.reabrir(payload.entidadeId, payload.competencia, {
      por: tenancy.userAtual(), motivo: payload.motivo,
    });
    return { competencia: p.competencia, reabertoEm: p.reaberto_em };
  });

  aprovacoes.registrarExecutor('importacao.desfazer', (payload) =>
    bancos.desfazerImportacao(payload.importacaoId, { motivo: payload.motivo }));
}

/**
 * Worker: replicação do diário (o RPO), expiração de aprovações e
 * conferência periódica do razão. Lote pequeno, `unref()` para não
 * segurar o processo. FINANCE_WORKER=off desliga.
 */
function iniciarWorker(alertaAugusto) {
  if (String(process.env.FINANCE_WORKER || 'on').toLowerCase() === 'off') {
    console.log('[finance] worker desligado (FINANCE_WORKER=off).');
    return null;
  }
  const intervalo = Number(process.env.FINANCE_WORKER_MS) || 60_000;
  const minutosReplica = Number(process.env.FINANCE_REPLICA_MIN) || 5;
  let ciclos = 0;
  let ultimaReplica = 0;

  _timer = setInterval(() => {
    ciclos++;
    // Replicação: é o que transforma "temos backup diário" em RPO de
    // minutos. Falha aqui vira log, não derruba o worker.
    if (Date.now() - ultimaReplica >= minutosReplica * 60_000) {
      ultimaReplica = Date.now();
      Promise.resolve(diario.replicar())
        .then(r => { if (r.falhas && r.falhas.length) console.error('[finance] réplica do diário falhou:', r.falhas); })
        .catch(e => console.error('[finance] réplica do diário:', e.message));
    }

    try {
      for (const t of repo.listarTenants()) {
        tenancy.comTenant({ tenantId: t.id, userId: 'worker' }, () => aprovacoes.expirarVencidas());
      }
    } catch (e) { console.error('[finance] expirar aprovações:', e.message); }

    // A cada ~30 min: o razão continua batendo? Desbalanceamento é
    // incidente crítico — o Augusto tem de saber na hora, não no fechamento.
    if (ciclos % Math.max(1, Math.round(1_800_000 / intervalo)) === 0) {
      try {
        const quebrados = [];
        for (const t of repo.listarTenants()) {
          tenancy.comTenant({ tenantId: t.id, userId: 'worker' }, () => {
            for (const e of repo.listarEntidades()) {
              const b = ledger.conferirBalanceamento(e.id);
              if (!b.ok) quebrados.push(`${t.slug}/${e.nome}: ${dinheiro.formatar(b.diferencaCents)}`);
            }
            const cadeia = auditoria.verificarCadeia(t.id);
            if (!cadeia.ok) quebrados.push(`${t.slug}: auditoria adulterada no seq ${cadeia.quebra.seq}`);
          });
        }
        if (quebrados.length && typeof alertaAugusto === 'function') {
          alertaAugusto(`🚨 Villela Finance: integridade comprometida — ${quebrados.join(' · ')}`);
        }
      } catch (e) { console.error('[finance] conferência de integridade:', e.message); }
    }
  }, intervalo);

  if (_timer.unref) _timer.unref();
  console.log(`[finance] worker a cada ${intervalo}ms (réplica do diário a cada ${minutosReplica} min).`);
  return _timer;
}

const pararWorker = () => { if (_timer) { clearInterval(_timer); _timer = null; } };

module.exports = {
  montar, pararWorker, registrarExecutores,
  tenancy, repo, contas, entitlements, rbac, ledger, dinheiro, bancos,
  classificacao, periodos, relatorios, aprovacoes, auditoria, planoContas, diario,
};
