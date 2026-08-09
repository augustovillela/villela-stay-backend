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
const sessao = require('./sessao');
const tenancy = require('./tenancy');
const rbac = require('./rbac');
const privacidade = require('./privacidade');
const repo = require('./repo');
const emails = require('./emails');
const i18n = require('./i18n');
const erros = require('./erros');
const { registrarRotasConta } = require('./rotas-conta');
const { registrarRotasApp } = require('./rotas-app');
const { registrarPaginas } = require('./paginas');

let _pronto = false;
const pronto = () => _pronto;

/**
 * Saúde do produto. Confere as três dependências DE VERDADE (o storage
 * faz PUT/GET/DELETE real) — a lição `heartbeat-verde-fonte-caida` é que
 * rotina verde com a fonte caída é pior que rotina vermelha.
 */
// Handlers que o worker PRECISA ter registrados. Faltando um, a saúde
// fica vermelha: job daquele tipo iria direto para a DLQ.
const HANDLERS_ESPERADOS = ['midia.ingerir', 'documento.extrair'];
const BATIDA_MAX_SEG = 300;

/**
 * Saúde do worker, lida do banco. Ele não fala HTTP; a batida dele é a
 * única evidência de que está vivo E de que está rodando o código certo.
 */
async function saudeDoWorker() {
  const r = await db.uma(`SELECT valor, atualizado_em FROM config WHERE chave = 'worker_heartbeat'`);
  if (!r) return { ok: false, motivo: 'o worker nunca bateu' };
  let e = {};
  try { e = JSON.parse(r.valor); } catch (_) {}
  const idade = Math.round((Date.now() - new Date(r.atualizado_em).getTime()) / 1000);
  const faltando = HANDLERS_ESPERADOS.filter((h) => !(e.handlers || []).includes(h));
  return {
    ok: idade <= BATIDA_MAX_SEG && faltando.length === 0,
    idade_seg: idade,
    commit: e.commit,
    handlers: e.handlers || [],
    faltando,
    motivo: idade > BATIDA_MAX_SEG ? 'worker calado' : (faltando.length ? 'worker sem handler' : undefined),
  };
}

async function saude({ comStorage = true } = {}) {
  const r = { produto: 'origena', pronto: _pronto, banco: null, fila: null, storage: null, worker: null };
  try { r.banco = await db.saude(); } catch (e) { r.banco = { ok: false, erro: e.message }; }
  try { r.fila = await fila.saude(); } catch (e) { r.fila = { erro: e.message }; }
  try { r.worker = await saudeDoWorker(); } catch (e) { r.worker = { ok: false, erro: e.message }; }
  if (comStorage) r.storage = await storage.saude();
  else r.storage = { ok: storage.configurado(), pulado: true };
  r.ok = !!(r.banco && r.banco.ok) && !!(r.storage && r.storage.ok) && !!(r.worker && r.worker.ok);
  return r;
}

function registrarRotas(app, { requireAuth, requireAdmin }) {
  // Saúde pública e barata (sem o teste de storage, que custa 3 chamadas).
  app.get('/origena/health', async (req, res) => {
    try {
      const s = await saude({ comStorage: false });
      // 503 quando o banco cai OU o worker está calado/desatualizado: um
      // produto que aceita foto e não a processa não está saudável.
      const bom = s.banco && s.banco.ok && s.worker && s.worker.ok;
      res.status(bom ? 200 : 503).json(s);
    } catch (e) {
      res.status(503).json({ produto: 'origena', ok: false, erro: e.message });
    }
  });

  // Saúde completa (com teste sintético de storage) — só admin do staff.
  app.get('/staff/api/origena/saude', requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await saude({ comStorage: true })); }
    catch (e) { res.status(500).json({ erro: e.message }); }
  });

  // Webhook do Mercado Pago: PÚBLICO e anônimo por definição do provedor.
  // Por isso ele não confia no corpo — só usa o id para PERGUNTAR ao MP o
  // que aconteceu (billing.js, regra 2). Responde 200 mesmo em falha
  // conhecida: 500 faz o MP reenviar em laço sem que nada mude.
  app.post('/origena/webhook/mercadopago', async (req, res) => {
    try { res.json(await require('./billing').webhook(req.body || {}, req.query || {})); }
    catch (e) { res.json({ ok: false, erro: e.message }); }
  });
}

/**
 * Monta o produto. NUNCA lança: o server.js já envolve em try/catch, mas
 * uma exceção aqui pararia a montagem dos produtos seguintes. Sem banco
 * configurado, a landing sobe e o resto fica desligado, com log claro.
 */
async function montar(app, injected = {}) {
  const { requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret } = injected;
  if (!requireAuth || !requireAdmin) throw new Error('origena.montar: faltam deps (requireAuth, requireAdmin).');
  if (!jwtSecret) throw new Error('origena.montar: falta jwtSecret.');

  emails.configurar({ enviarEmail });
  // Sem `mpFetch` (ou sem MP_ACCESS_TOKEN) a cobrança fica em modo manual —
  // o produto continua inteiro, só o botão de pagar some.
  require('./billing').configurar({ mpFetch, alertaAugusto });

  // i18n ANTES de qualquer rota da Origena: daqui para baixo `req.t`
  // existe, e nenhuma mensagem precisa nascer em português no código.
  // Restrito ao prefixo do produto para não tocar os outros 11.
  app.use('/origena', i18n.middleware);
  app.use('/staff/api/origena', i18n.middleware);

  registrarPaginas(app);
  registrarRotas(app, { requireAuth, requireAdmin });

  if (!db.configurado()) {
    console.warn('[origena] ORIGENA_DATABASE_URL não definida — landing no ar, banco e fila DESLIGADOS.');
    return { db, fila, storage, pronto };
  }

  // Ordem importa: migrar ANTES de abrir rotas que leem tabela.
  let aplicadas = [];
  try {
    aplicadas = await db.migrar();
    _pronto = true;
  } catch (e) {
    console.error('[origena] falha ao migrar — produto sobe SEM banco:', e.message);
    return { db, fila, storage, saude, pronto };
  }

  registrarRotasConta(app, { jwtSecret });
  const { ROTAS_ESCOPADAS } = registrarRotasApp(app);
  require('./rotas-staff').registrarRotasStaff(app, { requireAuth, requireAdmin });

  // Tratador central de erros: por ÚLTIMO e restrito a /origena, para não
  // sequestrar o tratamento dos outros 11 produtos do mesmo processo.
  app.use('/origena', erros.tratador);
  app.use('/staff/api/origena', erros.tratador);

  const cob = i18n.cobertura();
  console.log(`[origena] Origena montada. Landing: /origena · app: /origena/app · saúde: /origena/health`
    + ` · schema: ${db.SCHEMA}`
    + ` · migrações novas: ${aplicadas.length}`
    + ` · storage: ${storage.configurado() ? process.env.ORIGENA_S3_BUCKET : 'NÃO configurado'}`
    + ` · rotas escopadas por família: ${ROTAS_ESCOPADAS.length}`
    + ` · MFA: ${sessao.mfaDisponivel() ? 'disponível' : 'SEM ORIGENA_SECRET_KEY'}`
    + ` · e-mail: ${emails.ativo() ? 'ligado' : 'desligado'}`
    + ` · pagamento: ${require('./billing').ativo() ? 'Mercado Pago' : 'manual'}`
    + ` · i18n: ${i18n.chaves().length} chaves, `
    + i18n.IDIOMAS.map((l) => `${l} ${Math.round(100 * cob[l].traduzidas / cob[l].total)}%`).join(' · '));

  return { db, fila, storage, saude, pronto, ROTAS_ESCOPADAS };
}

module.exports = {
  montar, saude, pronto,
  db, fila, storage, sessao, tenancy, rbac, privacidade, repo, emails,
};
