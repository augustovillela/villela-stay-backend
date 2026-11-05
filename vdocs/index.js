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
  require('./ia-fonte').iniciar(jwtSecret); // segredo do cofre das chaves de IA dos assinantes
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
    // Anel das últimas chamadas (só metadados: o Make ignora o erro desta rota de propósito, e sem isto uma falha
    // aqui seria invisível). Lido por GET /vdocs/api/v1/entrada/make.
    const ring = [];
    const marca = (o) => { ring.unshift({ em: new Date().toISOString(), ...o }); ring.length = Math.min(ring.length, 30); };
    entrada.__ringMake = ring;
    const jsonMake = express.json({ limit: '30mb' });
    app.post('/staff/api/vdocs-entrada/whatsapp', (req, res, next) => jsonMake(req, res, (err) => {
      if (err) { marca({ resultado: 'corpo inválido', erro: err.message, bytes: Number(req.headers['content-length']) || 0 }); return res.status(400).json({ erro: 'corpo inválido' }); }
      next();
    }), (req, res) => {
      if (!publishKeyOk(req)) { marca({ resultado: 'chave inválida' }); return res.status(401).json({ erro: 'chave inválida' }); }
      const corpo = req.body || {};
      const meta = { origem: String(corpo.origem_id || '').slice(0, 40), mime: String(corpo.mime || '').slice(0, 40), b64: String(corpo.conteudo_base64 || '').length, telefone: String(corpo.telefone || '').slice(0, 20) };
      try {
        const tenantId = entrada.tenantDoCanal('whatsapp', corpo.identificador);
        if (!tenantId) { marca({ ...meta, resultado: 'ignorado: número não cadastrado/ambíguo', identificador: String(corpo.identificador || '').slice(0, 20) }); return res.json({ ok: true, status: 'ignorado', motivo: 'número não cadastrado (ou cadastrado em mais de uma empresa)' }); }
        const r = entrada.receber(tenantId, { ...corpo, tipo: 'whatsapp' }, { id: 'make', nome: 'WhatsApp Business (Make)' }, 'make');
        marca({ ...meta, tenant: tenantId, resultado: r.status, motivo: r.motivo || '' });
        res.json({ ok: true, ...r });
      } catch (e) { marca({ ...meta, resultado: 'erro', erro: e.message }); res.status(400).json({ erro: e.message }); }
    });
  }
  console.log('[vdocs] Villela Docs Intelligence montado (Fases 1-6: fundação, documentos, processamento, busca, IA e workflows).');
  return { repo, permissoes, auth, jobs };
}

module.exports = { montar, repo, permissoes };
