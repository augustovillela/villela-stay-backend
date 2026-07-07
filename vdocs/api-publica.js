// =====================================================================
// Villela Docs Intelligence — Fase 9: API pública + webhooks de saída.
//
// API v1 (/vdocs/api/v1/*) autenticada por chave (Authorization: Bearer
// vd_... ou X-Api-Key). Regras: (1) o plano precisa ter api=true (Business/
// Enterprise); (2) rate limit por MINUTO por chave (VDOCS_API_RPM, padrão
// 120) + consumo mensal em usage_records (api_chamadas); (3) a chave dá
// os poderes de um "gestor de documentos" — nunca gerencia usuários/billing.
//
// Webhooks de saída: o cliente cadastra URL + eventos + recebe um secret;
// cada evento vira uma entrega assinada (X-VDocs-Signature = HMAC-SHA256
// do corpo) com retentativa (1min, 5min, 30min — depois marca erro).
// SSRF: só https:// (http permitido apenas em NODE_ENV=development) e
// nunca para hosts internos óbvios (localhost/127.* em produção).
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId, sha256, j } = require('./db');
const repo = require('./repo');

const s = repo.s;
const RPM = parseInt(process.env.VDOCS_API_RPM, 10) || 120;

// ------------------------------------------------------------ chaves
function criarChave(tenantId, nome, ator, ip) {
  if (!s(nome, 60)) throw new Error('Dê um nome à chave (ex.: "ERP financeiro").');
  const bruta = 'vd_' + crypto.randomBytes(24).toString('base64url');
  const id = novoId();
  db.prepare('INSERT INTO api_keys (id, tenant_id, nome, prefixo, key_hash, criado_em, criado_por) VALUES (?,?,?,?,?,?,?)')
    .run(id, String(tenantId), s(nome, 60), bruta.slice(0, 11), sha256(Buffer.from(bruta)), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'api.chave_criada', 'api_keys', id, { nome: s(nome, 60) }, ip);
  return { id, chave: bruta }; // a chave completa SÓ aparece aqui
}
const listarChaves = (tenantId) =>
  db.prepare('SELECT id, nome, prefixo, ultimo_uso, revogada_em, criado_em FROM api_keys WHERE tenant_id = ? ORDER BY criado_em DESC').all(String(tenantId));
function revogarChave(tenantId, id, ator, ip) {
  const r = db.prepare("UPDATE api_keys SET revogada_em = ? WHERE id = ? AND tenant_id = ? AND revogada_em = ''").run(nowISO(), String(id), String(tenantId));
  if (!r.changes) throw new Error('Chave não encontrada (ou já revogada).');
  repo.auditar(tenantId, ator, 'api.chave_revogada', 'api_keys', String(id), {}, ip);
}

// ------------------------------------------------------------ auth + rate limit da API
const janela = new Map(); // key_id -> { minuto, n }
function requireApiKey(req, res, next) {
  const bruta = String(req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || '');
  if (!bruta.startsWith('vd_')) return res.status(401).json({ erro: 'Chave de API ausente (Authorization: Bearer vd_... ou X-Api-Key).' });
  const k = db.prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revogada_em = ''").get(sha256(Buffer.from(bruta)));
  if (!k) return res.status(401).json({ erro: 'Chave de API inválida ou revogada.' });
  const tenant = repo.obterTenant(k.tenant_id);
  if (!tenant || tenant.status === 'suspensa' || tenant.status === 'cancelada') return res.status(402).json({ erro: 'Conta suspensa.' });
  const plano = repo.planoDoTenant(k.tenant_id);
  if (!plano || !plano.limites.api) return res.status(403).json({ erro: `O plano ${plano ? plano.nome : 'atual'} não inclui API — faça upgrade para Business ou Enterprise.` });
  // rate limit por minuto por chave
  const minuto = Math.floor(Date.now() / 60000);
  const w = janela.get(k.id) || { minuto, n: 0 };
  if (w.minuto !== minuto) { w.minuto = minuto; w.n = 0; }
  w.n++;
  janela.set(k.id, w);
  res.setHeader('X-RateLimit-Limit', RPM);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RPM - w.n));
  if (w.n > RPM) return res.status(429).json({ erro: `Limite de ${RPM} requisições/minuto excedido — aguarde.` });
  db.prepare('UPDATE api_keys SET ultimo_uso = ? WHERE id = ?').run(nowISO(), k.id);
  repo.registrarUso(k.tenant_id, 'api_chamadas', 1);
  req.apiKey = k;
  req.apiAtor = { id: 'api:' + k.id, nome: `API (${k.nome})` };
  next();
}

// ------------------------------------------------------------ rotas v1
function registrarApiPublica(app, { express }) {
  const docs = require('./docs');
  const buscaMod = require('./busca');
  const v1 = express.Router();
  v1.use(express.json({ limit: '30mb' }));
  v1.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  v1.use(requireApiKey);
  const h = (fn) => (req, res) => { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); };
  const t = (req) => req.apiKey.tenant_id;

  v1.get('/ping', (req, res) => res.json({ ok: true, tenant: t(req), chave: req.apiKey.prefixo }));
  v1.get('/pastas', h(async (req, res) => res.json({ pastas: docs.listarPastas(t(req)) })));
  v1.post('/pastas', h(async (req, res) => res.json({ ok: true, id: docs.criarPasta(t(req), req.body || {}, req.apiAtor, 'api') })));
  v1.get('/documentos', h(async (req, res) => {
    const q = req.query || {};
    if (q.busca) return res.json({ resultados: buscaMod.buscar(t(req), { q: q.busca, tipo: q.tipo, tag: q.tag, pasta: q.pasta }, req.apiAtor) });
    res.json({ documentos: docs.listarDocumentos(t(req), { folder_id: q.pasta || '', tipo: q.tipo, tag: q.tag }) });
  }));
  v1.post('/documentos', h(async (req, res) => {
    try { res.json({ ok: true, documento: docs.criarDocumento(t(req), req.body || {}, req.apiAtor, 'api') }); }
    catch (e) { if (e.duplicado) return res.status(409).json({ erro: e.message, duplicado: e.duplicado }); throw e; }
  }));
  v1.get('/documentos/:id', h(async (req, res) => res.json({ documento: docs.obterDocumento(t(req), req.params.id, { comVersoes: true }) })));
  v1.get('/documentos/:id/baixar', h(async (req, res) => {
    const { buffer, nome, mime } = docs.baixar(t(req), req.params.id, req.query.versao, req.apiAtor, 'api');
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.send(buffer);
  }));
  v1.get('/uso', h(async (req, res) => res.json({ uso: repo.usoDoMes(t(req)), plano: (repo.planoDoTenant(t(req)) || {}).slug })));
  app.use('/vdocs/api/v1', v1);
}

// ------------------------------------------------------------ webhooks de saída
function validarUrlWebhook(url) {
  let u;
  try { u = new URL(String(url || '')); } catch { throw new Error('URL inválida.'); }
  const dev = process.env.NODE_ENV === 'development';
  if (!['https:', 'http:'].includes(u.protocol)) throw new Error('Webhook precisa ser https://');
  if (u.protocol !== 'https:' && !dev) throw new Error('Webhook precisa ser https://');
  if (!dev && /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) throw new Error('Host interno não permitido.');
  return u.toString();
}
const EVENTOS = ['documento.criado', 'documento.excluido', 'aprovacao.finalizada'];
function criarWebhook(tenantId, { url, eventos }, ator, ip) {
  const alvo = validarUrlWebhook(url);
  const evs = (Array.isArray(eventos) ? eventos : []).filter(e => EVENTOS.includes(e));
  if (!evs.length) throw new Error(`Escolha os eventos: ${EVENTOS.join(', ')}.`);
  const id = novoId();
  const secret = 'whsec_' + crypto.randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO webhook_subscriptions (id, tenant_id, url, eventos, secret, ativo, criado_em, criado_por) VALUES (?,?,?,?,?,1,?,?)')
    .run(id, String(tenantId), alvo, j.str(evs), secret, nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'webhook.criado', 'webhook_subscriptions', id, { url: alvo, eventos: evs }, ip);
  return { id, secret }; // o secret só aparece aqui
}
const listarWebhooks = (tenantId) =>
  db.prepare('SELECT id, url, eventos, ativo, criado_em FROM webhook_subscriptions WHERE tenant_id = ? ORDER BY criado_em DESC').all(String(tenantId))
    .map(w => ({ ...w, eventos: j.parse(w.eventos, []) }));
function excluirWebhook(tenantId, id, ator, ip) {
  const r = db.prepare('DELETE FROM webhook_subscriptions WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Webhook não encontrado.');
  repo.auditar(tenantId, ator, 'webhook.excluido', 'webhook_subscriptions', String(id), {}, ip);
}
const entregasRecentes = (tenantId, limite = 30) =>
  db.prepare('SELECT id, subscription_id, evento, status, tentativas, resposta, criado_em FROM webhook_deliveries WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT ?')
    .all(String(tenantId), Math.min(Number(limite) || 30, 100));

// Emite um evento: cria 1 entrega por assinatura interessada (não bloqueia quem chamou).
function emitir(tenantId, evento, dados) {
  try {
    const subs = db.prepare('SELECT id, eventos FROM webhook_subscriptions WHERE tenant_id = ? AND ativo = 1').all(String(tenantId));
    for (const sub of subs) {
      if (!j.parse(sub.eventos, []).includes(evento)) continue;
      db.prepare(`INSERT INTO webhook_deliveries (id, tenant_id, subscription_id, evento, payload, status, proximo_em, criado_em)
        VALUES (?,?,?,?,?,'pendente',?,?)`)
        .run(novoId(), String(tenantId), sub.id, evento, j.str({ evento, dados, quando: nowISO() }), nowISO(), nowISO());
    }
  } catch (e) { console.error('[vdocs webhooks] emitir:', e.message); }
}

// Processa entregas pendentes (chamado pelo tick do jobs.js). Retentativas: 1min, 5min, 30min.
const ESPERAS_MIN = [1, 5, 30];
async function processarEntregas(max = 10) {
  const pendentes = db.prepare("SELECT * FROM webhook_deliveries WHERE status = 'pendente' AND proximo_em <= ? ORDER BY criado_em LIMIT ?").all(nowISO(), max);
  for (const d of pendentes) {
    const sub = db.prepare('SELECT * FROM webhook_subscriptions WHERE id = ?').get(d.subscription_id);
    if (!sub || !sub.ativo) { db.prepare("UPDATE webhook_deliveries SET status = 'erro', resposta = 'assinatura removida' WHERE id = ?").run(d.id); continue; }
    const corpo = d.payload;
    const assinatura = crypto.createHmac('sha256', sub.secret).update(corpo).digest('hex');
    let ok = false, resposta = '';
    try {
      const r = await fetch(sub.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VDocs-Event': d.evento, 'X-VDocs-Signature': 'sha256=' + assinatura },
        body: corpo, signal: AbortSignal.timeout(10000),
      });
      ok = r.status >= 200 && r.status < 300;
      resposta = 'HTTP ' + r.status;
    } catch (e) { resposta = String(e.message).slice(0, 200); }
    const tentativas = d.tentativas + 1;
    if (ok) db.prepare("UPDATE webhook_deliveries SET status = 'entregue', tentativas = ?, resposta = ? WHERE id = ?").run(tentativas, resposta, d.id);
    else if (tentativas >= ESPERAS_MIN.length + 1) db.prepare("UPDATE webhook_deliveries SET status = 'erro', tentativas = ?, resposta = ? WHERE id = ?").run(tentativas, resposta, d.id);
    else db.prepare("UPDATE webhook_deliveries SET tentativas = ?, resposta = ?, proximo_em = ? WHERE id = ?")
      .run(tentativas, resposta, new Date(Date.now() + ESPERAS_MIN[tentativas - 1] * 60000).toISOString(), d.id);
  }
  return pendentes.length;
}

module.exports = {
  criarChave, listarChaves, revogarChave, requireApiKey, registrarApiPublica,
  EVENTOS, criarWebhook, listarWebhooks, excluirWebhook, entregasRecentes, emitir, processarEntregas,
};
