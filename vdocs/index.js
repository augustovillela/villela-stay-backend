// =====================================================================
// Villela Docs Intelligence — montagem do módulo no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./vdocs').montar(app, { express, requireAuth, requireAdmin,
//     alertaAugusto, jwtSecret });
//
// Fase 1 (fundação SaaS): multi-tenant, identidade, RBAC, convites,
// auditoria, planos/limites, landing/preços, painel do cliente e
// administração da plataforma no Portal Staff. Documentos, OCR, busca,
// IA e workflows = Fases 2+ (ver README.md).
// =====================================================================
'use strict';
const repo = require('./repo');
const permissoes = require('./permissoes');
const { criarAuth } = require('./auth');
const { registrarRotasApi } = require('./rotas-api');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarPaginas } = require('./paginas');

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, alertaAugusto, enviarEmail, mpFetch, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('vdocs.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semearPlanos(); // Starter/Professional/Business/Enterprise (upsert idempotente)
  const auth = criarAuth({ jwtSecret });
  const notificar = (msg) => Promise.resolve((alertaAugusto || (async () => {}))(msg)).catch(() => {});
  registrarRotasApi(app, { express, auth, notificar, enviarEmail, jwtSecret });
  registrarRotasStaff(app, { express, requireAuth, requireAdmin, jwtSecret });
  registrarPaginas(app, { express });
  const jobs = require('./jobs');
  jobs.configurar({ enviarEmail, notificar });
  jobs.iniciar(); // worker de extração + rotinas diárias (VDOCS_ROTINAS=off desliga)
  require('./workflows').configurar({ enviarEmail });
  require('./compartilhar').configurar({ enviarEmail, notificar });
  require('./billing').configurar({ mpFetch, notificar });
  require('./api-publica').registrarApiPublica(app, { express }); // API v1 por chave (Fase 9)
  // Make -> WhatsApp Business: o cenário já guarda a PUBLISH_KEY (rotas do CRM e da voz), então a entrada de
  // mídia usa a MESMA chave em vez de pôr uma credencial nova no Make. A empresa vem do número cadastrado.
  const { publishKeyOk } = injected;
  if (typeof publishKeyOk === 'function') {
    const entrada = require('./entrada');
    app.post('/staff/api/vdocs-entrada/whatsapp', express.json({ limit: '30mb' }), (req, res) => {
      if (!publishKeyOk(req)) return res.status(401).json({ erro: 'chave inválida' });
      try {
        const corpo = req.body || {};
        const tenantId = entrada.tenantDoCanal('whatsapp', corpo.identificador);
        if (!tenantId) return res.json({ ok: true, status: 'ignorado', motivo: 'número não cadastrado (ou cadastrado em mais de uma empresa)' });
        const r = entrada.receber(tenantId, { ...corpo, tipo: 'whatsapp' }, { id: 'make', nome: 'WhatsApp Business (Make)' }, 'make');
        res.json({ ok: true, ...r });
      } catch (e) { res.status(400).json({ erro: e.message }); }
    });
  }
  console.log('[vdocs] Villela Docs Intelligence montado (Fases 1-6: fundação, documentos, processamento, busca, IA e workflows).');
  return { repo, permissoes, auth, jobs };
}

module.exports = { montar, repo, permissoes };
