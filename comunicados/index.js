// =====================================================================
// Comunicados — central única de avisos aos usuários de TODOS os sistemas
// do grupo (aviso no app, e-mail, WhatsApp). Montagem no server.js,
// ANTES dos módulos de produto (as rotas da caixa moram sob o caminho de
// cada produto e precisam ganhar do 404 dele):
//
//   require('./comunicados').montar(app, {
//     express, requireAuth, requireAdmin, requirePublishOrAdmin, registrarAuditoria,
//     enviarEmail, enviarWhatsAppTemplate, jwtSecret, baseUrl,
//   });
//
// Doc: docs/integracoes/comunicados.md (repo-pai).
// =====================================================================
'use strict';
const motor = require('./motor');
const fontes = require('./fontes');
const suporte = require('./suporte');
const privacidade = require('./privacidade');
const { registrarRotas } = require('./rotas');

const INTERVALO_MS = Number(process.env.COMUNICADOS_INTERVALO_MS || 60000);
let _timer = null;

function ligarFila() {
  if (_timer || String(process.env.COMUNICADOS_FILA_OFF || '') === '1') return null;
  _timer = setInterval(() => {
    motor.processarLote().catch((e) => console.error('[comunicados] ciclo falhou:', e.message));
  }, INTERVALO_MS);
  if (_timer.unref) _timer.unref();
  return _timer;
}
const desligarFila = () => { if (_timer) { clearInterval(_timer); _timer = null; } };

// Uma hora: conversa de suporte esquecida. Um dia: LGPD (esquecer quem saiu
// + retenção). As duas são idempotentes e best-effort.
let _timerRotinas = null;
function ligarRotinas() {
  if (_timerRotinas || String(process.env.COMUNICADOS_ROTINAS_OFF || '') === '1') return null;
  let ultimoDia = '';
  const ciclo = async () => {
    try { await suporte.alertarEsquecidas(); } catch (e) { console.error('[comunicados] alerta de suporte falhou:', e.message); }
    const hoje = new Date().toISOString().slice(0, 10);
    if (hoje !== ultimoDia) { ultimoDia = hoje; try { await privacidade.rodar(); } catch (e) { console.error('[comunicados/lgpd] falhou:', e.message); } }
  };
  _timerRotinas = setInterval(() => { ciclo().catch(() => {}); }, 3600e3);
  if (_timerRotinas.unref) _timerRotinas.unref();
  setTimeout(() => { ciclo().catch(() => {}); }, 120e3);   // pouco depois do boot
  return _timerRotinas;
}
const desligarRotinas = () => { if (_timerRotinas) { clearInterval(_timerRotinas); _timerRotinas = null; } };

function montar(app, deps = {}) {
  const { express, requireAuth, requireAdmin, requirePublishOrAdmin, registrarAuditoria, enviarEmail, enviarWhatsAppTemplate, emailPronto, whatsappPronto, avisarStaff, jwtSecret, baseUrl } = deps;
  if (!express || !requireAuth || !requireAdmin || !requirePublishOrAdmin || !jwtSecret) {
    throw new Error('comunicados.montar: faltam deps (express, requireAuth, requireAdmin, requirePublishOrAdmin, jwtSecret).');
  }
  fontes.configurar({ jwtSecret });
  const disp = motor.configurar({ enviarEmail, enviarWhatsAppTemplate, emailPronto, whatsappPronto, baseUrl, segredo: jwtSecret });
  suporte.configurar({ avisarStaff, enviarEmail: motor.enviarEmailCentral, alertaDono: deps.alertaAugusto });
  registrarRotas(app, { express, requireAuth, requireAdmin, requirePublishOrAdmin, registrarAuditoria });
  ligarFila();
  ligarRotinas();
  console.log('[comunicados] montado —', `${fontes.todas().length} sistemas`,
    `· e-mail: ${disp.email.ok ? 'ok' : 'NÃO'}`, `· whatsapp: ${disp.whatsapp.ok ? disp.whatsapp.template : 'sem modelo'}`);
}

module.exports = { montar, motor, fontes, suporte, privacidade, ligarFila, desligarFila, ligarRotinas, desligarRotinas };
