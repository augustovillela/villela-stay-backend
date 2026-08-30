// =====================================================================
// Closet Club — montagem no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./closet').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, mpFetch, jwtSecret });
//
// Marketplace de aluguel de roupas entre pessoas ("o Airbnb dos guarda-
// roupas"): vitrine pública em /closet, painel do usuário em /closet/app
// (cookie 'closet_sess'), administração na aba 👗 do Portal Staff
// (/staff/api/closet/*). SQLite próprio em DATA_DIR/closet/.
// CLOSET_ROTINAS=off desliga o ciclo diário.
// =====================================================================
'use strict';
const repo = require('./repo');
const ia = require('./ia');
const billing = require('./billing');
const bookings = require('./bookings');
const Push = require('./push');
const storage = require('./storage');
const conteudo = require('./conteudo');
const crescimento = require('./crescimento');
const parceiros = require('./parceiros');
const apiPublica = require('./api-publica');
const campanhas = require('./campanhas');
const emails = require('./emails');
const iaLlm = require('./ia-llm');
const { registrarRotasConta } = require('./rotas-conta');
const { registrarRotasApp } = require('./rotas-app');
const { registrarRotasPublicas } = require('./rotas-publicas');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarPaginas } = require('./paginas');
const webhookMP = require('../nucleo/webhook-mp');

let _timer = null;

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('closet.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semear();              // planos free/premium + configuração (comissão, prazos, política)
  crescimento.semearConfig(); // regras do programa de indicação
  campanhas.semearConfig();   // preço do destaque patrocinado
  conteudo.semear();          // 3 posts iniciais do blog (não sobrescreve o que já existe)
  emails.configurar({ enviarEmail });

  const notificar = (m) => Promise.resolve((alertaAugusto || (async () => {}))(m)).catch(() => {});
  billing.configurar({ mpFetch, notificar });
  // o motor de reservas devolve dinheiro e avisa gente pelo PSP/push — injetado aqui
  bookings.configurar({
    reembolsar: (paymentId, valor, ref) => billing.reembolsar(paymentId, valor, ref),
    notificar,
    push: (userId, payload) => Push.notificarUsuario(userId, payload).catch(() => {}),
    email: (userId, chave, reserva, extra) => emails.enviar(userId, chave, reserva, extra).catch(() => {}),
  });

  const conta = registrarRotasConta(app, { jwtSecret, enviarEmail });
  registrarRotasPublicas(app, { requireUsuario: conta.requireUsuario, talvezUsuario: conta.talvezUsuario, notificar });
  registrarRotasApp(app, { requireUsuario: conta.requireUsuario });
  registrarRotasStaff(app, { requireAuth, requireAdmin });
  apiPublica.registrarApiPublica(app); // /closet/api/v1/* — só leitura, por chave
  storage.registrarRotaFotos(app);     // /closet/fotos/<hash>.<ext> quando o driver é local
  registrarPaginas(app);

  // webhook do Mercado Pago (Pix da reserva + assinatura Premium)
  app.post('/closet/webhooks/mercadopago', express.json({ type: () => true }), async (req, res) => {
    res.sendStatus(200); // o MP exige 200 rápido
    // Confere a assinatura quando ha segredo configurado; sem segredo apenas
    // avisa (a re-busca na API do MP segue sendo a defesa contra payload forjado).
    const idMP = ((req.body || {}).data || {}).id || (req.query || {})['data.id'] || (req.query || {}).id;
    const confMP = webhookMP.conferir({ headers: req.headers, dataId: idMP,
      segredo: process.env.CLOSET_MP_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET, rotulo: 'closet' });
    if (!confMP.ok) return console.warn('[closet] webhook MP recusado:', confMP.motivo);
    if (!webhookMP.idSeguro(idMP)) return console.warn('[closet] webhook MP com id inválido');
    try { await billing.processarWebhook(req.body || {}, req.query || {}); } catch (_) {}
  });

  iniciarRotinas(notificar);
  console.log(`[closet] Closet Club montado. Vitrine: /closet · painel: /closet/app · blog: /closet/blog · API: /closet/api/v1`
    + ` · pagamento: ${billing.ativo() ? 'Pix (MP)' : 'manual'} · fotos: ${storage.s3Ativo() ? 'S3/R2' : 'disco local'}`
    + ` · IA: ${iaLlm.disponivel() ? 'LLM (' + iaLlm.MODELO + ')' : 'regras'} · e-mail: ${emails.ativo() ? 'ligado' : 'desligado'}`);
  return { repo, ia, billing, bookings, storage, conteudo, crescimento, parceiros, apiPublica, campanhas, emails, iaLlm };
}

// Agendador interno. Roda de 15 em 15 min e só dispara o ciclo uma vez por dia
// — mas o ciclo em si (expirar Pix, estornar quem não confirmou, concluir
// vistoria vencida) é sensível a hora, então também roda de hora em hora.
function iniciarRotinas(notificar) {
  if (String(process.env.CLOSET_ROTINAS || 'on').toLowerCase() === 'off') return;
  const hora = parseInt(process.env.CLOSET_ROTINA_HORA, 10) || 6;
  const { db } = require('./db');
  const jaRodouHoje = () => {
    const hoje = new Date().toISOString().slice(0, 10);
    return !!db.prepare("SELECT 1 FROM platform_events WHERE tipo = 'ciclo.diario' AND quando >= ? LIMIT 1").get(hoje);
  };
  let ultimaHora = -1;
  _timer = setInterval(() => {
    try {
      const agora = new Date();
      const hb = (agora.getUTCHours() + 24 - 3) % 24; // Brasília (UTC-3)
      if (hb === hora && !jaRodouHoje()) {
        const r = billing.cicloDiario();
        if (r.nao_confirmadas || r.expiradas) {
          notificar(`👗 Closet Club: ${r.expiradas} reserva(s) expirada(s), ${r.nao_confirmadas} não confirmada(s) e estornada(s), ${r.concluidas} concluída(s).`);
        }
      } else if (hb !== ultimaHora) {
        ultimaHora = hb;
        bookings.Bookings.rotina(); // prazos de Pix/confirmação/vistoria não podem esperar o dia seguinte
      }
    } catch (e) { console.error('[closet] rotina:', e.message); }
  }, 15 * 60 * 1000);
  if (_timer.unref) _timer.unref();
  console.log(`[closet] ciclo diário ~${hora}h de Brasília + varredura de prazos a cada hora`);
}

module.exports = {
  montar, repo, ia, billing, bookings, Push, storage, conteudo,
  crescimento, parceiros, apiPublica, campanhas, emails, iaLlm,
};
