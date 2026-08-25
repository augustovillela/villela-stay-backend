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
// Fase 3 — contas a pagar e a receber: títulos com parcelamento e rateio,
//   liquidação com juros/multa/desconto, aging, inadimplência, detecção de
//   duplicidade e ordem de pagamento sob aprovação.
// Fase 4 — gestão e fechamento: balanço patrimonial, fluxo de caixa direto e
//   indireto (com a conciliação entre os dois), previsão por cenário,
//   orçamento x realizado, apuração de resultado e consolidação.
// Fase 9 — comercialização: landing /finance, catálogo do grupo, exportação.
// Fase 10 — resiliência: restauração provada por teste, TOTP real, LGPD e runbooks.
// Fase 6 — CFO inteligente: anomalias determinísticas, cada uma com os fatos
//   que a acionaram e o que a invalidaria; e o Conselho dos Mestres, com a
//   localização de cada princípio no manuscrito.
// Fase 5 — hospedagem: adaptador Stays.net reconciliando reserva → receita,
//   comissão de canal e recebível, por imóvel (centro de custo), com
//   conferência contra a própria Stays.
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
const stays = require('./stays');
const contrapartes = require('./contrapartes');
const titulos = require('./titulos');
const liquidacoes = require('./liquidacoes');
const apuracao = require('./apuracao');
const caixa = require('./caixa');
const orcamento = require('./orcamento');
const cfo = require('./cfo');
const conselho = require('./conselho');
const exportacao = require('./exportacao');
const paginas = require('./paginas');
const mfa = require('./mfa');
const restauracao = require('./restauracao');
const retencao = require('./retencao');
const seguranca = require('./seguranca');
const billing = require('./billing');
const mercadopago = require('./mercadopago');
const casamento = require('./casamento');
const ativos = require('./ativos');
const cobranca = require('./cobranca');
const { registrarRotasApp } = require('./rotas-app');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarRotasAgente } = require('./rotas-agente');


let _timer = null;

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, jwtSecret, alertaAugusto } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('financeiro.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }

  registrarExecutores();
  // O cliente da Stays vive no server.js (credenciais, paginação, cache de
  // clientes). Injetamos em vez de duplicar; sem ele o vertical de
  // hospedagem responde "não configurado" em vez de quebrar.
  const staysOk = stays.configurar({
    paginado: injected.staysPaginado,
    resolverClientes: injected.resolverClientes,
  });
  const semeadura = contas.semearPlataforma();
  // Plano de contas de conta ANTIGA recebe as contas novas que este boot
  // trouxe (é idempotente: só cria o que falta, nunca renomeia o que o
  // assinante mudou). Sem isto, o motor referenciaria conta inexistente
  // numa empresa criada antes da versão que a introduziu.
  const atualizadas = contas.atualizarPlanosDeConta();
  const usuarioInicial = contas.semearUsuarioInicial();

  app.use('/finance', tenancy.middlewareCorrelacao);
  app.use('/staff/api/finance', tenancy.middlewareCorrelacao);
  paginas.registrarPaginas(app, { express });          // landing pública em /finance
  registrarRotasApp(app, { jwtSecret, express });
  registrarRotasStaff(app, { requireAuth, requireAdmin, express });
  // Porta do agente: existe só se o server injetar a guarda da PUBLISH_KEY.
  // Sem ela, o módulo sobe sem a porta — e diz isso no log.
  const portaAgente = !!injected.requirePublishOrAdmin;
  if (portaAgente) registrarRotasAgente(app, { requirePublishOrAdmin: injected.requirePublishOrAdmin, express });

  // Extrato do Mercado Pago: mesmo `mpFetch` da cobrança. Sem ele o
  // adaptador diz "não configurado" em vez de quebrar.
  const mpOk = mercadopago.configurar({ mpFetch: injected.mpFetch });

  // ------------------------------------------------------------ cobrança
  // Recorrência mensal via preapproval do Mercado Pago (mesmo `mpFetch`
  // dos outros produtos). Sem MP configurado o módulo NÃO fica sem
  // cobrança: o painel do staff registra Pix/boleto à mão, auditado.
  billing.configurar({
    mpFetch: injected.mpFetch,
    notificar: alertaAugusto,
    baseUrl: process.env.SITE_URL || process.env.BASE_URL || '',
  });
  // O MP exige 200 rápido: respondemos antes de processar. Se o
  // processamento falhar, o MP reenvia — e o reenvio é idempotente
  // (billing.registrarPagamento confere o id do pagamento).
  app.post('/finance/webhooks/mercadopago', express.json({ type: () => true }), (req, res) => {
    res.sendStatus(200);
    Promise.resolve(billing.processarWebhook(req.body || {}, req.query || {}))
      .catch(e => console.error('[finance] webhook MP:', e.message));
  });

  iniciarWorker(alertaAugusto);

  console.log(
    `[finance] Villela Finance (Fases 1-6, 9 parcial, 10) montado. Landing: /finance · assinante: /finance/api · admin: /staff/api/finance · ` +
    `planos: ${semeadura.planos.total} · conta interna: ${semeadura.tenantInterno}${semeadura.criada ? ' (criada agora)' : ''} · ` +
    `diário: ${diario.configurada() ? 'replicando para R2' : 'LOCAL (defina FINANCE_S3_* para replicar)'} · ` +
    `Stays: ${staysOk.disponivel ? (staysOk.resolveNomes ? 'ligada' : 'ligada (sem nome de hóspede)') : 'NAO configurada'} · ` +
    `agente: ${portaAgente ? '/staff/api/finance/agente (so conta interna, nivel <= 2)' : 'INDISPONIVEL'} · ` +
    `cobrança: ${billing.ativo() ? 'Mercado Pago (recorrência)' : 'MANUAL (sem MP_ACCESS_TOKEN)'} · ` +
    `extrato MP: ${mpOk.disponivel ? 'disponível' : 'indisponível'} · ` +
    `acesso inicial: ${usuarioInicial.criado ? `criado (${usuarioInicial.email})` : usuarioInicial.motivo} · ` +
    `MFA: ${mfa.configurado() ? 'TOTP disponível' : 'INDISPONÍVEL (defina FINANCE_SECRET_KEY)'} · ` +
    `legado /staff/api/financeiro/* intacto` +
    (atualizadas.contasNovas ? ` · plano de contas: +${atualizadas.contasNovas} conta(s) em ${atualizadas.empresas} empresa(s)` : '')
  );

  return {
    repo, contas, entitlements, rbac, ledger, dinheiro, bancos, classificacao,
    periodos, relatorios, aprovacoes, auditoria, planoContas, diario, stays,
    contrapartes, titulos, liquidacoes, apuracao, caixa, orcamento, cfo, conselho, tenancy, billing, mercadopago, casamento, ativos, cobranca,
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

  // Mudança de dado bancário do favorecido: o vetor de fraude mais banal
  // que existe. Só se aplica depois que outra pessoa comparou antes/depois.
  aprovacoes.registrarExecutor('contraparte.dados_bancarios', (payload) =>
    contrapartes.aplicarDadosBancarios(payload));

  // Anonimização é irreversível e mexe no histórico: nível 3.
  aprovacoes.registrarExecutor('contraparte.anonimizar', (payload) =>
    contrapartes.anonimizar(payload.contraparteId, { motivo: payload.motivo }));

  // Apuração de resultado reescreve a leitura de um exercício inteiro
  // (depois dela o DRE do período zera). Por isso é material.
  aprovacoes.registrarExecutor('resultado.apurar', (payload) => {
    const r = apuracao.apurar(payload.entidadeId, {
      competencia: payload.competencia, desde: payload.desde, motivo: payload.motivo,
    });
    return { loteId: r.lote.id, resultadoCents: r.resultadoCents, tipo: r.tipo, contasZeradas: r.contasZeradas };
  });

  // Ordem de pagamento aprovada vira LIQUIDAÇÃO — o registro contábil de
  // que o pagamento foi feito. A transferência bancária em si continua
  // sendo ato humano: o produto não executa pagamento (ARCHITECTURE §11).
  aprovacoes.registrarExecutor('pagamento.executar', (payload) => {
    const r = liquidacoes.liquidar(Object.assign({}, payload, {
      idempotencia: `ordem:${payload.parcelaId}:${payload.data}:${payload.valorCents}`,
    }));
    return { liquidacaoId: r.liquidacaoId, loteId: r.lote.id, movimentadoCents: r.movimentadoCents };
  });
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
  const minutosStays = Number(process.env.FINANCE_STAYS_SYNC_MIN) || 0;   // 0 = desligado
  let ciclos = 0;
  let ultimaReplica = 0;
  let ultimaStays = 0;

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

    // Régua de cobrança: uma vez por dia. O marcador vive no banco (e não
    // em memória) porque o processo reinicia a cada deploy — e uma régua
    // que roda de novo a cada reinício notificaria o Augusto sem motivo.
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const ultimo = repo.ultimoEventoDePlataforma('billing.ciclo');
      if (!ultimo || String(ultimo.criado_em).slice(0, 10) < hoje) {
        const r = billing.cicloDeVida();
        repo.eventoDePlataforma('billing.ciclo', r);
        if (r.trialsVencidos.length || r.suspensas.length) {
          console.log(`[finance] cobrança: ${r.trialsVencidos.length} trial(s) vencido(s), ${r.suspensas.length} suspensa(s).`);
        }
      }
    } catch (e) { console.error('[finance] régua de cobrança:', e.message); }

    // Sincronização automática da Stays: DESLIGADA por padrão. Bater numa
    // API externa em laço, gravando no razão, é decisão do dono — não
    // efeito colateral de subir o servidor. Ligue com FINANCE_STAYS_SYNC_MIN.
    if (minutosStays && stays.configurado() && Date.now() - ultimaStays >= minutosStays * 60_000) {
      ultimaStays = Date.now();
      sincronizarStaysDeTodos().catch(e => console.error('[finance] sync Stays:', e.message));
    }

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
  console.log(
    `[finance] worker a cada ${intervalo}ms · réplica do diário a cada ${minutosReplica} min · ` +
    `sync Stays: ${minutosStays ? `a cada ${minutosStays} min` : 'DESLIGADO (defina FINANCE_STAYS_SYNC_MIN)'}.`);
  return _timer;
}

/**
 * Sincroniza a competência corrente de todas as contas que têm o módulo de
 * hospedagem. Erro numa conta não impede as outras — e nunca fica calado.
 */
async function sincronizarStaysDeTodos() {
  const competencia = new Date().toISOString().slice(0, 7);
  for (const t of repo.listarTenants()) {
    if (!entitlements.temModulo(t, 'hospitalidade')) continue;
    if (entitlements.resolver(t).bloqueiaEscrita) continue;
    try {
      const entidades = tenancy.comTenant({ tenantId: t.id, userId: 'worker' }, () => repo.listarEntidades());
      for (const e of entidades) {
        const r = await tenancy.comTenant({ tenantId: t.id, userId: 'worker', perfil: 'controller' }, () =>
          tenancy.comEntidade(e.id, () => stays.sincronizar({ entidadeId: e.id, competencia })));
        const mudou = r.resumo.nova + r.resumo.ajustada + r.resumo.cancelada;
        if (mudou || r.erros.length) {
          console.log(`[finance] Stays ${t.slug}/${e.nome} ${competencia}: ` +
            `${r.resumo.nova} nova(s), ${r.resumo.ajustada} ajuste(s), ${r.resumo.cancelada} cancelamento(s)` +
            (r.erros.length ? ` · ${r.erros.length} ERRO(S)` : ''));
        }
      }
    } catch (e) {
      console.error(`[finance] Stays ${t.slug}:`, e.message);
    }
  }
}

const pararWorker = () => { if (_timer) { clearInterval(_timer); _timer = null; } };

module.exports = {
  montar, pararWorker, registrarExecutores, sincronizarStaysDeTodos,
  tenancy, repo, contas, entitlements, rbac, ledger, dinheiro, bancos,
  classificacao, periodos, relatorios, aprovacoes, auditoria, planoContas, diario, stays,
  contrapartes, titulos, liquidacoes, billing, mercadopago, casamento, ativos,
};
