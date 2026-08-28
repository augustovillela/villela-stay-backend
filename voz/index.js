// =====================================================================
// Voz — montagem no app Express. Uso no server.js (antes dos
// express.static e do app.listen):
//
//   require('./voz').montar(app, {
//     express, requireAuth, requireAdmin, requirePublishOrAdmin,
//     enviarWhatsApp, alertaAugusto, destino: AUGUSTO_WA, baseUrl: SITE_URL,
//     ferramentas: { 'listas.adicionar': fn, ... },
//   });
//
// FASE 0 — o cérebro, a fila, os níveis e as aprovações, com entrada
// por WhatsApp. Plano e decisões em docs/voz/PLANO-MVP.md (repo-pai).
//
// O que é diferente dos outros módulos, e por quê:
//   • NÃO tem regra de negócio própria. Quem sabe pôr item na lista é o
//     server.js; quem sabe ler a Stays é o proxy. As implementações são
//     INJETADAS (`ferramentas`), e o que não for injetado responde
//     "ainda não sei fazer" em vez de sumir do catálogo.
//   • NÃO tem base de contas: quem autoriza é a sessão do Portal Staff.
//   • A fila `codigo` nasce TRAVADA (decisão 4 do plano, em aberto).
//
// Sem ANTHROPIC_API_KEY o módulo sobe assim mesmo, com um interpretador
// determinístico mínimo, e diz no log o que falta.
// =====================================================================
'use strict';
const acoes = require('./acoes');
const repo = require('./repo');
const fila = require('./fila');
const cerebro = require('./cerebro');
const executor = require('./executor');
const servico = require('./servico');
const entrada = require('./entrada');
const notificar = require('./notificar');
const audio = require('./audio');
const transcricao = require('./transcricao');
const aprovacoes = require('./aprovacoes');
const { registrarRotas } = require('./rotas');

const INTERVALO_MS = Number(process.env.VOZ_FILA_INTERVALO_MS || 5000);
const FILA_DESLIGADA = () => String(process.env.VOZ_FILA_OFF || '') === '1';

let _timer = null;

/**
 * Consumidor da fila `rapida`, dentro do próprio processo web.
 *
 * Worker separado não serve aqui pelo mesmo motivo da Musique (ADR-0006
 * de lá): o disco do Render não é acessível por outro serviço e o banco
 * é SQLite. A fila `rapida` é leve — relatório, escrita interna, envio —
 * e cabe no web. A `codigo`, que é pesada, está travada justamente por
 * isso.
 */
function ligarFila() {
  if (_timer || FILA_DESLIGADA()) return null;
  _timer = setInterval(async () => {
    try {
      fila.destravar(15);
      aprovacoes.expirarVencidas();
      await fila.processarLote(5, 'rapida');
    } catch (e) { console.error('[voz/fila] ciclo falhou:', e.message); }
  }, INTERVALO_MS);
  if (_timer.unref) _timer.unref();   // não segura o processo no encerramento
  return _timer;
}

const desligarFila = () => { if (_timer) { clearInterval(_timer); _timer = null; } };

function montar(app, injected = {}) {
  const {
    express, requireAuth, requireAdmin, requirePublishOrAdmin,
    enviarWhatsApp, alertaAugusto, destino, baseUrl,
    transcrever, autorizados, ferramentas = {},
    resolverDestino,
    contextoDeNegocio,
  } = injected;

  if (!express || !requireAuth || !requireAdmin || !requirePublishOrAdmin) {
    throw new Error('voz.montar: faltam deps (express, requireAuth, requireAdmin, requirePublishOrAdmin).');
  }

  app.use('/staff/voz', (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const canal = notificar.configurar({ enviarWhatsApp, alertaAugusto, baseUrl, destino });
  // A lista de autorizados nasce do telefone do dono; VOZ_TELEFONES
  // acrescenta. Lista VAZIA significa que nada vira comando — o que é o
  // padrão seguro, não um defeito.
  const ent = entrada.configurar({
    transcrever,
    autorizados: [].concat(autorizados || []).concat(destino ? [destino] : []),
  });

  require('./paginas').configurar({ resolverDestino });
  // Contexto de negócio: carrega uma vez e reatualiza de tempos em
  // tempos. Falha NÃO impede o módulo de subir — sem contexto a Eva fica
  // pior, não quebrada.
  if (typeof contextoDeNegocio === 'function') {
    const carregar = () => Promise.resolve()
      .then(contextoDeNegocio)
      .then((t) => { const n = cerebro.definirContexto(t); console.log(`[voz] contexto de negocio: ${n} caracteres`); })
      .catch((e) => console.error('[voz] contexto de negocio falhou:', e.message));
    carregar();
    const tCtx = setInterval(carregar, Number(process.env.VOZ_CONTEXTO_MIN || 360) * 60000);
    if (tCtx.unref) tCtx.unref();
  }

  const registradas = executor.registrarTodas(ferramentas);
  servico.registrarHandlers();
  registrarRotas(app, { requirePublishOrAdmin, requireAuth, requireAdmin });
  ligarFila();

  const faltando = acoes.chaves().filter((a) => !executor.implementada(a));
  console.log('[voz] montado —',
    `${Object.keys(registradas).length}/${acoes.chaves().length} ações implementadas`,
    `· cérebro: ${cerebro.disponivel() ? cerebro.MODELO : 'determinístico (falta ANTHROPIC_API_KEY)'}`,
    `· whatsapp: ${canal.temEnvio || canal.temAlerta ? 'ok' : 'NÃO CONFIGURADO'}`,
    `· transcrição: ${ent.temTranscricao ? transcricao.MODELO() + ' (' + transcricao.PROVEDOR() + ')' : 'ausente — só texto'}`,
    `· autorizados: ${ent.autorizados.length}`,
    `· fila codigo: ${fila.codigoLiberado() ? 'aberta' : 'travada'}`);
  if (faltando.length) console.log('[voz] sem ferramenta (respondem "ainda não sei fazer"):', faltando.join(', '));
  if (!ent.autorizados.length) {
    console.warn('[voz] ⚠️ nenhum telefone autorizado — nada que chegar pelo WhatsApp vira comando.');
  }

  return { acoes, repo, fila, servico, executor, entrada, notificar, aprovacoes, audio, transcricao, desligarFila };
}

module.exports = {
  montar, ligarFila, desligarFila,
  acoes, repo, fila, cerebro, executor, servico, entrada, notificar, aprovacoes, audio, transcricao,
};
