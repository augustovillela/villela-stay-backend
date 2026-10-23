// =====================================================================
// Núcleo — TOKENS DE API TEMPORÁRIOS para todos os sistemas do grupo.
// Alternativa estreita à PUBLISH_KEY (fixa, abre o backend inteiro) para dar
// acesso a um agente externo (ex.: Codex) por tempo curto.
//
// Cada sistema entra com registrarSistema(): a LISTA de rotas que aceitam
// token, o escopo de cada uma e, se houver, em nome de quem o token age
// (`dono`: um campo do pedido, ex.: produtor_email). Depois troca, nas suas
// rotas, a guarda da PUBLISH_KEY por guarda(sistema, requirePublishOrAdmin).
//
// Regras (não afrouxar):
// - EMISSÃO e REVOGAÇÃO só por SESSÃO de admin do Portal Staff
//   (/staff/api/tokens-api). Nem a PUBLISH_KEY nem um token emitem token:
//   a chave que pede não pode aprovar.
// - Token vale para UM sistema e só nas rotas da lista dele. Rota fora da
//   lista é recusada — rota nova nasce fechada. A guarda só é posta onde a
//   PUBLISH_KEY já valia, então rota só de admin nunca vê token.
// - Sistema com `dono`: o campo do pedido tem de ser o do token, senão 403.
// - Vence sozinho (1 h a 30 dias). Só o hash é guardado; o token aparece uma
//   vez, na emissão. Cada uso (aceito ou recusado) fica registrado.
// Banco próprio: DATA_DIR/tokens-api/tokens.db.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PREFIXO = 'vst_';
const HORAS_MIN = 1;
const HORAS_MAX = 24 * 30;
const HORAS_PADRAO = 24;
const MAX_ATIVOS = 20;
const GUARDA_USOS_DIAS = 90;
const BASE_STAFF = '/staff/api/tokens-api';

let _db = null;
function db() {
  if (_db) return _db;
  const dir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'tokens-api');
  fs.mkdirSync(dir, { recursive: true });
  _db = new DatabaseSync(path.join(dir, 'tokens.db'));
  _db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 4000;');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      sistema TEXT NOT NULL,
      nome TEXT NOT NULL,
      prefixo TEXT NOT NULL,            -- 12 primeiros caracteres, para reconhecer
      hash TEXT NOT NULL UNIQUE,        -- sha256 do token inteiro
      escopos TEXT NOT NULL,            -- JSON
      dono TEXT NOT NULL DEFAULT '',    -- valor do campo de dono do sistema (ex.: e-mail do produtor)
      criado_por TEXT NOT NULL,
      criado_em TEXT NOT NULL,
      expira_em TEXT NOT NULL,
      revogado_em TEXT,
      revogado_por TEXT,
      ultimo_uso_em TEXT,
      usos INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS api_token_usos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id TEXT NOT NULL,
      quando TEXT NOT NULL,
      metodo TEXT NOT NULL,
      caminho TEXT NOT NULL,
      status INTEGER,
      ip TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_api_token_usos ON api_token_usos(token_id, id);
  `);
  return _db;
}

const agoraISO = () => new Date().toISOString();
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const hashDe = (bruto) => crypto.createHash('sha256').update(String(bruto)).digest('hex');
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- registro dos sistemas ----
const SISTEMAS = new Map();
// def = { rotulo, base: '/staff/api/academy', escopos: { id: 'descrição' },
//         rotas: [[método, caminho depois da base, escopo]],   (':id' = um segmento)
//         dono: { campo, rotulo, validar(valor) → valor normalizado | lança erro } | null }
function registrarSistema(id, def) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) throw new Error(`tokens-api: id de sistema inválido: ${id}`);
  const rotas = (def.rotas || []).map(([metodo, cam, escopo]) => {
    if (!def.escopos[escopo]) throw new Error(`tokens-api: ${id} ${metodo} ${cam} usa escopo desconhecido ${escopo}`);
    return { metodo, caminho: cam, escopo,
      re: new RegExp('^' + reEsc(def.base) + cam.split(':id').map(reEsc).join('[^/]+') + '$') };
  });
  SISTEMAS.set(id, { id, rotulo: def.rotulo || id, base: def.base, escopos: def.escopos, rotas, dono: def.dono || null });
}

function rotaDe(sistemaId, metodo, caminho) {
  const sis = SISTEMAS.get(sistemaId);
  if (!sis) return null;
  const c = caminho.length > 1 ? caminho.replace(/\/+$/, '') : caminho;
  return sis.rotas.find(r => r.metodo === metodo && r.re.test(c)) || null;
}

function publico(t) {
  const sis = SISTEMAS.get(t.sistema);
  return {
    id: t.id, sistema: t.sistema, sistema_rotulo: sis ? sis.rotulo : t.sistema,
    nome: t.nome, prefixo: t.prefixo, escopos: JSON.parse(t.escopos || '[]'), dono: t.dono || null,
    criado_por: t.criado_por, criado_em: t.criado_em, expira_em: t.expira_em,
    revogado_em: t.revogado_em || null, revogado_por: t.revogado_por || null,
    ultimo_uso_em: t.ultimo_uso_em || null, usos: t.usos || 0,
    situacao: t.revogado_em ? 'revogado' : (t.expira_em <= agoraISO() ? 'vencido' : 'ativo'),
  };
}

const Tokens = {
  // devolve { token (bruto, só agora), registro }
  emitir({ sistema, nome, dono, escopos, horas }, quem) {
    const sis = SISTEMAS.get(s(sistema, 40));
    if (!sis) throw new Error('Escolha um sistema que aceite token.');
    const n = s(nome, 60);
    if (!n) throw new Error('Dê um nome ao token (ex.: "Codex — importar curso").');
    let valorDono = '';
    if (sis.dono) {
      valorDono = s(dono, 160);
      if (!valorDono) throw new Error(`Informe: ${sis.dono.rotulo}.`);
      valorDono = sis.dono.validar ? sis.dono.validar(valorDono) : valorDono;
    }
    const esc = [...new Set((Array.isArray(escopos) ? escopos : []).map(x => s(x, 20)))];
    if (!esc.length) throw new Error('Escolha ao menos um escopo.');
    const desconhecido = esc.find(x => !sis.escopos[x]);
    if (desconhecido) throw new Error(`Escopo desconhecido em ${sis.rotulo}: ${desconhecido}.`);
    const h = horas == null || horas === '' ? HORAS_PADRAO : Number(horas);
    if (!Number.isFinite(h) || h < HORAS_MIN || h > HORAS_MAX) throw new Error(`Validade entre ${HORAS_MIN} hora e ${HORAS_MAX / 24} dias.`);
    const agora = agoraISO();
    const ativos = db().prepare('SELECT COUNT(*) n FROM api_tokens WHERE revogado_em IS NULL AND expira_em > ?').get(agora).n;
    if (ativos >= MAX_ATIVOS) throw new Error(`Já há ${ativos} tokens ativos. Revogue algum antes de emitir outro.`);

    const bruto = PREFIXO + crypto.randomBytes(32).toString('base64url');
    const id = crypto.randomUUID();
    const expira = new Date(Date.now() + h * 3600e3).toISOString();
    db().prepare(`INSERT INTO api_tokens (id, sistema, nome, prefixo, hash, escopos, dono, criado_por, criado_em, expira_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, sis.id, n, bruto.slice(0, 12), hashDe(bruto), JSON.stringify(esc), valorDono, s(quem, 120), agora, expira);
    db().prepare('DELETE FROM api_token_usos WHERE quando < ?').run(new Date(Date.now() - GUARDA_USOS_DIAS * 864e5).toISOString());
    return { token: bruto, registro: Tokens.obter(id) };
  },
  obter(id) {
    const t = db().prepare('SELECT * FROM api_tokens WHERE id = ?').get(s(id, 40));
    return t ? publico(t) : null;
  },
  listar() {
    return db().prepare('SELECT * FROM api_tokens ORDER BY criado_em DESC LIMIT 200').all().map(publico);
  },
  revogar(id, quem) {
    const t = db().prepare('SELECT * FROM api_tokens WHERE id = ?').get(s(id, 40));
    if (!t) throw new Error('Token não encontrado.');
    if (!t.revogado_em) db().prepare('UPDATE api_tokens SET revogado_em = ?, revogado_por = ? WHERE id = ?').run(agoraISO(), s(quem, 120), t.id);
    return Tokens.obter(t.id);
  },
  usos(id, n = 100) {
    return db().prepare('SELECT quando, metodo, caminho, status, ip FROM api_token_usos WHERE token_id = ? ORDER BY id DESC LIMIT ?')
      .all(s(id, 40), Math.min(500, Math.max(1, parseInt(n, 10) || 100)));
  },

  // { ok, status, erro, token, escopo } — o coração da guarda, testável sem HTTP
  autorizar(sistemaId, bruto, metodo, caminho, dados = {}) {
    const t = bruto ? db().prepare('SELECT * FROM api_tokens WHERE hash = ?').get(hashDe(bruto)) : null;
    if (!t) return { ok: false, status: 401, erro: 'Token inválido.' };
    if (t.revogado_em) return { ok: false, status: 401, erro: 'Token revogado.', token: t };
    if (t.expira_em <= agoraISO()) return { ok: false, status: 401, erro: 'Token vencido.', token: t };
    if (t.sistema !== sistemaId) return { ok: false, status: 403, erro: `Este token é do sistema "${t.sistema}", não deste.`, token: t };
    const sis = SISTEMAS.get(sistemaId);
    const rota = rotaDe(sistemaId, String(metodo).toUpperCase(), caminho);
    if (!sis || !rota) return { ok: false, status: 403, erro: 'Esta rota não aceita token de API.', token: t };
    if (!JSON.parse(t.escopos || '[]').includes(rota.escopo)) return { ok: false, status: 403, erro: `Este token não tem o escopo "${rota.escopo}".`, token: t };
    if (sis.dono) {
      const enviado = s(dados[sis.dono.campo], 160).toLowerCase();
      if (enviado !== String(t.dono).toLowerCase()) {
        return { ok: false, status: 403, erro: `Este token só age em nome de ${t.dono} — envie esse "${sis.dono.campo}".`, token: t };
      }
    }
    return { ok: true, status: 200, token: t, escopo: rota.escopo };
  },
};

function lerToken(req) {
  const a = String(req.headers.authorization || '').trim();
  if (a.startsWith('Bearer ' + PREFIXO)) return a.slice(7).trim();
  const x = req.headers['x-api-token'];
  return x ? String(x).trim() : '';
}

// Envolve a guarda da PUBLISH_KEY de um sistema: sem token no pedido, tudo segue como antes.
function guarda(sistemaId, requirePublishOrAdmin) {
  if (!SISTEMAS.has(sistemaId)) throw new Error(`tokens-api: sistema não registrado: ${sistemaId}`);
  const fn = function guardaTokenOuChave(req, res, next) {
    const bruto = lerToken(req);
    if (!bruto) return requirePublishOrAdmin(req, res, next);
    const caminho = String(req.originalUrl || req.url || '').split('?')[0];
    const dados = req.method === 'GET' ? (req.query || {}) : (req.body || {});
    const r = Tokens.autorizar(sistemaId, bruto, req.method, caminho, dados);
    if (r.token) {
      const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
      const tokenId = r.token.id;
      res.on('finish', () => {
        try {
          db().prepare('INSERT INTO api_token_usos (token_id, quando, metodo, caminho, status, ip) VALUES (?, ?, ?, ?, ?, ?)')
            .run(tokenId, agoraISO(), req.method, caminho.slice(0, 200), res.statusCode, ip.slice(0, 60));
        } catch (_) { /* registro de uso nunca derruba a resposta */ }
      });
    }
    if (!r.ok) return res.status(r.status).json({ erro: r.erro });
    db().prepare('UPDATE api_tokens SET usos = usos + 1, ultimo_uso_em = ? WHERE id = ?').run(agoraISO(), r.token.id);
    req.viaChave = true;
    req.viaToken = { id: r.token.id, sistema: sistemaId, nome: r.token.nome, escopo: r.escopo };
    req.rotuloChave = `token:${r.token.nome} (${r.token.prefixo})`;
    next();
  };
  fn.sistemaToken = sistemaId;
  return fn;
}

// Rotas de gestão (Portal Staff → 🔑 Tokens de API) — SÓ sessão de admin.
function montar(app, { requireAuth, requireAdmin, registrarAuditoria } = {}) {
  if (!requireAuth || !requireAdmin) throw new Error('tokens-api.montar: faltam requireAuth/requireAdmin.');
  const somenteSessao = (req, res, next) => (req.viaChave || req.viaToken || lerToken(req))
    ? res.status(403).json({ erro: 'Token de API só se emite e revoga com sessão de admin no Portal Staff.' })
    : next();
  const A = [requireAuth, requireAdmin, somenteSessao];
  const quem = (req) => (req.user && (req.user.nome || req.user.email)) || 'admin';
  const aud = (req, acao, det) => { try { if (registrarAuditoria) registrarAuditoria(req, acao, det); } catch (_) {} };
  const h = (fn) => (req, res) => { res.setHeader('Cache-Control', 'no-store'); try { fn(req, res); } catch (e) { res.status(400).json({ erro: e.message }); } };

  app.get(BASE_STAFF, ...A, h((req, res) => {
    res.json({
      tokens: Tokens.listar(),
      sistemas: [...SISTEMAS.values()].map(x => ({
        id: x.id, rotulo: x.rotulo, escopos: x.escopos,
        dono: x.dono ? { campo: x.dono.campo, rotulo: x.dono.rotulo, padrao: x.dono.padrao || '' } : null,
        rotas: x.rotas.map(r => ({ metodo: r.metodo, caminho: x.base + r.caminho, escopo: r.escopo })),
      })),
      limites: { horas_min: HORAS_MIN, horas_max: HORAS_MAX, horas_padrao: HORAS_PADRAO, max_ativos: MAX_ATIVOS },
    });
  }));
  app.post(BASE_STAFF, ...A, h((req, res) => {
    const r = Tokens.emitir(req.body || {}, quem(req));
    const g = r.registro;
    aud(req, 'token-api.emitir', `${g.sistema} · ${g.nome} · ${g.prefixo} · ${g.escopos.join('+')}${g.dono ? ' · ' + g.dono : ''} · até ${g.expira_em}`);
    res.json({ ok: true, token: r.token, registro: g, aviso: 'Copie agora: o token não será mostrado de novo.' });
  }));
  app.post(`${BASE_STAFF}/:id/revogar`, ...A, h((req, res) => {
    const t = Tokens.revogar(req.params.id, quem(req));
    aud(req, 'token-api.revogar', `${t.sistema} · ${t.nome} · ${t.prefixo}`);
    res.json({ ok: true, registro: t });
  }));
  app.get(`${BASE_STAFF}/:id/usos`, ...A, h((req, res) => {
    if (!Tokens.obter(req.params.id)) return res.status(404).json({ erro: 'Token não encontrado.' });
    res.json({ usos: Tokens.usos(req.params.id, req.query.n) });
  }));
}

module.exports = { registrarSistema, guarda, montar, Tokens, rotaDe, SISTEMAS, PREFIXO, _db: db };
