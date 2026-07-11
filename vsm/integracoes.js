// =====================================================================
// Villela Stay Manager (VSM) — INTEGRAÇÕES do assinante (flag api_publica):
// tokens de API fixos (Bearer) + webhooks de eventos do app.
//
// Token: 'vsm_' + 48 chars url-safe; guardamos só o hash SHA-256 e mostramos
// o token UMA vez na criação. Autentica como o tenant_user que o criou.
// Webhook: POST JSON assinado (HMAC-SHA256 do corpo no header
// X-VSM-Assinatura), fire-and-forget com timeout; 20 falhas seguidas desativa.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

// eventos que o app dispara (catálogo p/ validação e UI)
const EVENTOS = ['reserva.criada', 'reserva.confirmada', 'reserva.cancelada', 'reserva.concluida', 'estoque.baixo'];

const MAX_TOKENS = 5;
const MAX_WEBHOOKS = 3;
const MAX_FALHAS = 20;

// =====================================================================
// TOKENS DE API
// =====================================================================
const Tokens = {
  listar(tenantId) {
    return db.prepare(`SELECT id, nome, prefixo, criado_em, ultimo_uso FROM app_api_tokens
      WHERE tenant_id = ? AND revogado_em = '' ORDER BY criado_em DESC`).all(s(tenantId, 40));
  },
  criar(tenantId, userId, nome) {
    const ativos = Tokens.listar(tenantId).length;
    if (ativos >= MAX_TOKENS) throw new Error(`Limite de ${MAX_TOKENS} tokens ativos atingido — revogue um token antigo.`);
    const token = 'vsm_' + crypto.randomBytes(36).toString('base64url');
    const id = novoId();
    db.prepare('INSERT INTO app_api_tokens (id, tenant_id, user_id, nome, token_hash, prefixo, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(id, s(tenantId, 40), s(userId, 40), s(nome, 80) || 'Integração', sha256(token), token.slice(0, 12) + '…', nowISO());
    // o token NÃO é guardado em claro — esta é a única vez que ele aparece
    return { id, token };
  },
  revogar(tenantId, id) {
    const r = db.prepare("UPDATE app_api_tokens SET revogado_em = ? WHERE id = ? AND tenant_id = ? AND revogado_em = ''")
      .run(nowISO(), s(id, 40), s(tenantId, 40));
    if (!r.changes) throw new Error('Token não encontrado.');
    return { ok: true };
  },
  // Bearer → tenant_user (mesma forma do requireAssinante por cookie) ou null.
  autenticar(tokenStr) {
    const t = s(tokenStr, 200);
    if (!t.startsWith('vsm_')) return null;
    const row = db.prepare("SELECT id, tenant_id, user_id FROM app_api_tokens WHERE token_hash = ? AND revogado_em = ''").get(sha256(t));
    if (!row) return null;
    const u = db.prepare(`SELECT u.*, t.nome AS tenant_nome, t.status AS tenant_status FROM tenant_users u
      JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ? AND u.ativo = 1`).get(row.user_id);
    if (!u) return null;
    db.prepare('UPDATE app_api_tokens SET ultimo_uso = ? WHERE id = ?').run(nowISO(), row.id);
    try { repo.Uso.registrar(u.tenant_id, 'api_chamadas', 1); } catch (_) {}
    return u;
  },
};

// =====================================================================
// WEBHOOKS
// =====================================================================
let _fetch = (...a) => fetch(...a); // injetável p/ teste
function setFetch(f) { _fetch = f; }

const Webhooks = {
  listar(tenantId) {
    return db.prepare('SELECT * FROM app_webhooks WHERE tenant_id = ? ORDER BY criado_em').all(s(tenantId, 40))
      .map(w => ({ ...w, eventos: j.parse(w.eventos, []), segredo: w.segredo.slice(0, 6) + '…' })); // segredo nunca volta cru
  },
  criar(tenantId, d) {
    const url = s(d.url, 500);
    if (!/^https?:\/\/.+/i.test(url)) throw new Error('Informe uma URL http(s) válida.');
    const atuais = db.prepare('SELECT COUNT(*) n FROM app_webhooks WHERE tenant_id = ?').get(s(tenantId, 40)).n;
    if (atuais >= MAX_WEBHOOKS) throw new Error(`Limite de ${MAX_WEBHOOKS} webhooks atingido — remova um antes.`);
    const eventos = (Array.isArray(d.eventos) ? d.eventos : []).filter(e => EVENTOS.includes(e));
    const id = novoId();
    const segredo = 'whsec_' + crypto.randomBytes(24).toString('base64url');
    db.prepare('INSERT INTO app_webhooks (id, tenant_id, url, segredo, eventos, ativo, criado_em) VALUES (?,?,?,?,?,1,?)')
      .run(id, s(tenantId, 40), url, segredo, j.str(eventos), nowISO());
    // o segredo completo só aparece na criação (p/ o cliente validar o HMAC)
    return { id, url, eventos, segredo };
  },
  remover(tenantId, id) {
    const r = db.prepare('DELETE FROM app_webhooks WHERE id = ? AND tenant_id = ?').run(s(id, 40), s(tenantId, 40));
    if (!r.changes) throw new Error('Webhook não encontrado.');
    return { ok: true };
  },
  // dispara um evento p/ todos os webhooks do tenant que o escutam.
  // Fire-and-forget: nunca bloqueia nem lança; devolve a Promise só p/ teste.
  disparar(tenantId, evento, dados) {
    try {
      if (!repo.flag(tenantId, 'api_publica')) return Promise.resolve(0);
      const hooks = db.prepare('SELECT * FROM app_webhooks WHERE tenant_id = ? AND ativo = 1').all(s(tenantId, 40))
        .filter(w => { const evs = j.parse(w.eventos, []); return evs.length === 0 || evs.includes(evento); });
      if (!hooks.length) return Promise.resolve(0);
      const corpo = JSON.stringify({ evento, quando: nowISO(), dados: dados || {} });
      return Promise.allSettled(hooks.map(w => entregar(w, corpo))).then(rs => rs.filter(r => r.status === 'fulfilled' && r.value).length);
    } catch (_) { return Promise.resolve(0); }
  },
  testar(tenantId, id) {
    const w = db.prepare('SELECT * FROM app_webhooks WHERE id = ? AND tenant_id = ?').get(s(id, 40), s(tenantId, 40));
    if (!w) throw new Error('Webhook não encontrado.');
    const corpo = JSON.stringify({ evento: 'teste', quando: nowISO(), dados: { mensagem: 'Olá do Villela Stay Manager 👋' } });
    return entregar(w, corpo);
  },
  EVENTOS,
};

async function entregar(w, corpo) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await _fetch(w.url, {
      method: 'POST', signal: ac.signal, body: corpo,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VillelaStayManager-Webhook/1',
        'X-VSM-Assinatura': 'sha256=' + crypto.createHmac('sha256', w.segredo).update(corpo).digest('hex'),
      },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    db.prepare("UPDATE app_webhooks SET falhas = 0, ultimo_envio = ?, ultimo_erro = '' WHERE id = ?").run(nowISO(), w.id);
    return true;
  } catch (e) {
    const falhas = (w.falhas || 0) + 1;
    db.prepare('UPDATE app_webhooks SET falhas = ?, ultimo_erro = ?, ativo = ? WHERE id = ?')
      .run(falhas, s(e.message, 200), falhas >= MAX_FALHAS ? 0 : 1, w.id);
    return false;
  } finally { clearTimeout(timer); }
}

module.exports = { Tokens, Webhooks, EVENTOS, setFetch };
