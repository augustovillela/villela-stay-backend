// =====================================================================
// Villela Growth OS — montagem no app Express.
//
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./growth').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, jwtSecret });
//
// Etapa 1 — fundação SaaS: hierarquia, identidade, RBAC, entitlements,
//   eventos com outbox, fila durável, aprovações, incidentes e cofre.
// Etapa 2 — CRM e captura: resolução de identidade, formulários, tracking,
//   segmentos, LGPD e páginas de captura.
// Etapa 3 — inbox omnichannel: conversas, filas, SLA, conectores de canal
//   e ingestão de webhook com payload bruto preservado.
//
// Administração em /staff/api/growth/* · porta pública em /growth/*.
// Estado real (o que é implementação e o que é contrato): docs/growth-os/PROJECT_STATE.md
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
const { registrarRotasPublicas } = require('./rotas-publicas');
const { registrarRotasAssinante } = require('./rotas-assinante');
const identidade = require('./identidade');
const captura = require('./captura');
const segmentos = require('./segmentos');
const lgpd = require('./lgpd');
const conversas = require('./conversas');
const canais = require('./canais');
const automacoes = require('./automacoes');
const agentes = require('./agentes');
const conhecimento = require('./conhecimento');
const conteudo = require('./conteudo');
const comunidade = require('./comunidade');
const anuncios = require('./anuncios');
const atribuicao = require('./atribuicao');
const reputacao = require('./reputacao');
const reunioes = require('./reunioes');
const comercial = require('./comercial');

let _timer = null;

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, jwtSecret, alertaAugusto } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('growth.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }

  sessao.configurar({ jwtSecret });
  // o conector de e-mail só sai de "aguardando_credenciais" se houver
  // transporte real injetado — não existe modo "finge que enviou"
  const statusEmail = require('./conectores/email').configurar({ enviarEmail: injected.enviarEmail });
  semear();
  registrarHandlersDeFila();
  automacoes.ligarGatilhos();   // o motor passa a ouvir o barramento

  app.use('/staff/api/growth', tenancy.middlewareCorrelacao);
  app.use('/growth', tenancy.middlewareCorrelacao);
  app.use('/crm/api/growth', tenancy.middlewareCorrelacao);
  registrarRotasStaff(app, { requireAuth, requireAdmin });
  registrarRotasPublicas(app, { express });
  // O painel do assinante só existe se o CRM montou antes e cedeu a guarda
  // de sessão. Sem ela, o Growth sobe sem painel — e diz isso no log, em vez
  // de servir rota aberta.
  const painel = !!injected.requireAssinante;
  if (painel) registrarRotasAssinante(app, { requireAssinante: injected.requireAssinante });

  iniciarWorker(alertaAugusto);
  console.log(
    `[growth] Villela Growth OS (Etapas 1-9) montado. Admin: /staff/api/growth · ` +
    `captura: /growth/f/:token · páginas: /growth/p/:slug · ` +
    `painel do assinante: ${painel ? '/crm/app (abas do Growth)' : 'INDISPONÍVEL (CRM não montou)'} · ` +
    `perfis: ${rbac.PERFIS.length} · conectores: ${conectores.CONECTORES.length} · ` +
    `e-mail: ${statusEmail} · IA: ${agentes.temChaveLLM() ? 'llm disponivel' : 'so regras'} · cofre: ${segredos.configurado() ? 'ok' : 'SEM GROWTH_SECRET_KEY'}`
  );
  return {
    repo, contas, rbac, entitlements, eventos, fila, aprovacoes, incidentes, segredos, conectores, sessao,
    identidade, captura, segmentos, lgpd, conversas, canais, automacoes, agentes, conhecimento, conteudo, comunidade, anuncios, atribuicao, reputacao, reunioes, comercial,
  };
}

/** Semeadura idempotente: roda em todo boot, preserva o que já existe. */
function semear() {
  const org = contas.semearPlataforma();
  const perfis = rbac.semear();
  const integracoes = conectores.semear();
  // Etapa 9: os planos passam a carregar os recursos das oito etapas.
  // Conservador: mexe so em flags/limites, nunca em preco ou assinatura.
  const planos = comercial.semearRecursos();
  return { org: org && org.slug, perfis, integracoes, planos };
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
  // Etapa 3: a entrega da mensagem é job — retry, timeout e DLQ como
  // qualquer trabalho. Falhar aqui não perde a mensagem.
  fila.registrar('mensagem:entregar', (payload) => canais.entregar(payload));
  // Etapa 4: cada passo da automação é job — espera vira job agendado,
  // falha reagenda, e esgotado vai para a DLQ como qualquer trabalho.
  fila.registrar('automacao:passo', (payload) => automacoes.rodar(payload.execucaoId));
  // Etapa 6: publicar em rede social e importar metrica sao jobs — a rede
  // pode estar fora do ar, e a fila reagenda sem perder o conteudo.
  fila.registrar('conteudo:publicar', (payload) => conteudo.publicar(payload));
  // Etapa 7: a alteracao de orcamento aprovada e aplicada AQUI, nunca no
  // momento do pedido. Sem aprovacao registrada, aplicarAlteracao recusa.
  // Etapa 8: lembrete de reuniao e job agendado.
  fila.registrar('reuniao:lembrete', (payload) => reunioes.enviarLembrete(payload));
  fila.registrar('aprovacao:anuncio.orcamento_alterar', (payload) => {
    const dados = payload.dados || {};
    const alt = repo.um(
      "SELECT * FROM gx_orcamento_alteracoes WHERE tenant_id = :tenant AND campanha_id = :c AND status = 'aguardando' " +
      'ORDER BY criado_em DESC LIMIT 1', { c: dados.campanhaId }
    );
    if (!alt) { const e = new Error('Alteracao de orcamento nao encontrada ou ja resolvida.'); e.status = 404; throw e; }
    return anuncios.aplicarAlteracao(alt.id);
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
  identidade, captura, segmentos, lgpd, conversas, canais, automacoes, agentes, conhecimento, conteudo, comunidade, anuncios, atribuicao, reputacao, reunioes, comercial,
};
