// =====================================================================
// ORIGENA — montagem no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./origena').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, jwtSecret });
//
// Plataforma SaaS de memória, história e legado familiar — o 12º produto
// do Grupo Villela Stay. Landing em /origena, app da família em
// /origena/app (Fase 1), administração na aba 🌳 do Portal Staff.
//
// DIFERENÇAS DELIBERADAS EM RELAÇÃO AOS OUTROS 11 PRODUTOS:
//   • banco PostgreSQL próprio, não SQLite no disco  (ADR-0002)
//   • todo binário no R2, nada no disco do Render     (ADR-0003)
//   • trabalho pesado num worker SEPARADO             (ADR-0005)
// O porquê de cada uma está em docs\origena\DECISIONS\.
//
// FASE 0 (esta): só o encanamento — banco, migrações, fila, storage,
// saúde e a porta de entrada. Domínio entra na Fase 1, e a ordem é
// proveniência ANTES da mídia (ADR-0006).
// =====================================================================
'use strict';
const db = require('./db');
const fila = require('./fila');
const storage = require('./storage');
const { registrarPaginas } = require('./paginas');

let _pronto = false;
const pronto = () => _pronto;

/**
 * Saúde do produto. Confere as três dependências DE VERDADE (o storage
 * faz PUT/GET/DELETE real) — a lição `heartbeat-verde-fonte-caida` é que
 * rotina verde com a fonte caída é pior que rotina vermelha.
 */
async function saude({ comStorage = true } = {}) {
  const r = { produto: 'origena', pronto: _pronto, banco: null, fila: null, storage: null };
  try { r.banco = await db.saude(); } catch (e) { r.banco = { ok: false, erro: e.message }; }
  try { r.fila = await fila.saude(); } catch (e) { r.fila = { erro: e.message }; }
  if (comStorage) r.storage = await storage.saude();
  else r.storage = { ok: storage.configurado(), pulado: true };
  r.ok = !!(r.banco && r.banco.ok) && !!(r.storage && r.storage.ok);
  return r;
}

function registrarRotas(app, { requireAuth, requireAdmin }) {
  // Saúde pública e barata (sem o teste de storage, que custa 3 chamadas).
  app.get('/origena/health', async (req, res) => {
    try {
      const s = await saude({ comStorage: false });
      res.status(s.banco && s.banco.ok ? 200 : 503).json(s);
    } catch (e) {
      res.status(503).json({ produto: 'origena', ok: false, erro: e.message });
    }
  });

  // Saúde completa (com teste sintético de storage) — só admin do staff.
  app.get('/staff/api/origena/saude', requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await saude({ comStorage: true })); }
    catch (e) { res.status(500).json({ erro: e.message }); }
  });
}

/**
 * Monta o produto. NUNCA lança: o server.js já envolve em try/catch, mas
 * uma exceção aqui pararia a montagem dos produtos seguintes. Sem banco
 * configurado, a landing sobe e o resto fica desligado, com log claro.
 */
async function montar(app, injected = {}) {
  const { requireAuth, requireAdmin } = injected;
  if (!requireAuth || !requireAdmin) throw new Error('origena.montar: faltam deps (requireAuth, requireAdmin).');

  registrarPaginas(app);
  registrarRotas(app, { requireAuth, requireAdmin });

  if (!db.configurado()) {
    console.warn('[origena] ORIGENA_DATABASE_URL não definida — landing no ar, banco e fila DESLIGADOS.');
    return { db, fila, storage, pronto };
  }

  try {
    const aplicadas = await db.migrar();
    _pronto = true;
    console.log(`[origena] Origena montada. Landing: /origena · saúde: /origena/health`
      + ` · schema: ${db.SCHEMA}`
      + ` · migrações novas: ${aplicadas.length}`
      + ` · storage: ${storage.configurado() ? process.env.ORIGENA_S3_BUCKET : 'NÃO configurado'}`
      + ` · handlers de fila: ${fila.tiposRegistrados().length}`);
  } catch (e) {
    console.error('[origena] falha ao migrar — produto sobe SEM banco:', e.message);
  }

  return { db, fila, storage, saude, pronto };
}

module.exports = { montar, saude, pronto, db, fila, storage };
