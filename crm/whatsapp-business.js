// =====================================================================
// Villela CRM — WHATSAPP BUSINESS OFICIAL do assinante (Fase C), SÓ RECEBIMENTO.
//
// O assinante tem o próprio número na WhatsApp Business Platform (Cloud API da Meta) e aponta o webhook do app dele
// para `/crm/webhook/whatsapp/<token>`. Cada mensagem que um cliente manda vira SINAL de lead (assunto + razão) em
// "Conversas", por regras — o TEXTO NÃO É GUARDADO: só contadores por conversa.
//
// - Segurança: o `GET` de verificação confere o `verify_token`; todo `POST` só vale com a assinatura
//   `X-Hub-Signature-256` (HMAC-SHA256 do corpo bruto com o SEGREDO DO APP, guardado no cofre). Sem corpo bruto ou
//   sem segredo cadastrado, nada é processado.
// - Só pedimos o segredo do app: para RECEBER não é preciso token de acesso (mínimo necessário).
// - Esta fase NÃO ENVIA: fora da janela de 24 h só vale modelo aprovado pela Meta, com consentimento — o envio
//   continua assistido pela fila de campanhas. Responder "SAIR" marca o opt-out do canal.
// - Idempotente: a Meta reentrega; o id de cada mensagem (wamid) é lembrado.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, j } = require('./db');
const Cofre = require('./cofre');
const Canais = require('./canais');
const { classificarConversa, montarAssuntos } = require('./conversas-classificador');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const erro = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };
const LIMITE_PONTOS = 4; // o mesmo corte do classificador: ao menos 2 palavras fortes
const aleatorio = () => crypto.randomBytes(16).toString('hex');

function cfg(tid) {
  const l = db.prepare('SELECT config FROM crm_config WHERE tenant_id = ?').get(tid);
  const c = j.parse(l && l.config, {}); return c.whatsapp_business || {};
}
function salvarCfg(tid, wb) {
  const app = require('./app-repo');
  app.Config.salvar(tid, { whatsapp_business: wb });
}
function estado(tid) {
  const c = cfg(tid);
  const ev = db.prepare('SELECT COUNT(*) n, MAX(ultima_em) ultima FROM crm_wa_estado WHERE tenant_id = ?').get(tid);
  return { configurada: !!(c.webhook_token && Cofre.tem(tid, 'wa_secret')), phone_number_id: c.phone_number_id || '', webhook_caminho: c.webhook_token ? `/crm/webhook/whatsapp/${c.webhook_token}` : '', verify_token: c.verify_token || '', conversas_vistas: ev.n, ultimo_evento_em: c.ultimo_evento_em || ev.ultima || '' };
}
/** Guarda o segredo do app (cofre) e gera o endereço do webhook + o token de verificação (uma vez; trocar o segredo mantém o endereço). */
function configurar(tid, { phone_number_id, app_secret }, quem = '') {
  const pid = s(phone_number_id, 40).replace(/\D/g, '');
  if (!pid) throw erro('Informe o ID do número de telefone (Phone number ID) do WhatsApp Business.');
  Cofre.guardar(tid, 'wa_secret', s(app_secret, 80), quem);
  const c = cfg(tid);
  salvarCfg(tid, { ...c, phone_number_id: pid, webhook_token: c.webhook_token || aleatorio(), verify_token: c.verify_token || aleatorio() });
  return estado(tid);
}
function remover(tid) { Cofre.remover(tid, 'wa_secret'); const c = cfg(tid); salvarCfg(tid, { ...c, webhook_token: '', verify_token: '' }); return estado(tid); }

const tenantPorToken = (token) => {
  if (!/^[0-9a-f]{32}$/.test(String(token || ''))) return null;
  const l = db.prepare("SELECT tenant_id FROM crm_config WHERE config LIKE ?").all(`%"webhook_token":"${token}"%`)
    .find((x) => cfg(x.tenant_id).webhook_token === token);
  return l ? l.tenant_id : null;
};

/** GET de verificação da Meta: devolve o `hub.challenge` só se o token confere. */
function verificar(token, q = {}) {
  const tid = tenantPorToken(token); if (!tid) return null;
  const c = cfg(tid);
  return q['hub.mode'] === 'subscribe' && c.verify_token && q['hub.verify_token'] === c.verify_token ? String(q['hub.challenge'] || '') : null;
}
function assinaturaOk(tid, bruto, cabecalho) {
  const seg = Cofre.revelar(tid, 'wa_secret'); if (!seg || !bruto) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', seg).update(bruto).digest('hex');
  const a = Buffer.from(esperado), b = Buffer.from(String(cabecalho || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function textoDe(m) {
  if (m.type === 'text') return s(m.text && m.text.body, 1000);
  if (m.type === 'button') return s(m.button && m.button.text, 200);
  if (m.type === 'interactive') { const i = m.interactive || {}; return s((i.button_reply || i.list_reply || {}).title, 200); }
  return '';
}
const SAIR = /^\s*(sair|parar|pare|stop|cancelar|descadastrar)\s*[.!]?\s*$/i;

function tratar(tid, m, nomePerfil) {
  const ident = Canais.normalizar('whatsapp', s(m.from, 20)); if (!ident) return { ignorada: true };
  const ex = db.prepare('SELECT * FROM crm_wa_estado WHERE tenant_id = ? AND ident = ?').get(tid, ident);
  const ids = ex ? j.parse(ex.ids, []) : [];
  const wamid = s(m.id, 120);
  if (wamid && ids.includes(wamid)) return { repetida: true };
  const t = Number(m.timestamp) ? Number(m.timestamp) * 1000 : Date.now();
  const texto = textoDe(m);
  // opt-out por canal: "SAIR" exato
  if (SAIR.test(texto)) {
    const dono = Canais.contatoPorCanal(tid, 'whatsapp', ident);
    if (dono) { const k = Canais.doContato(tid, dono).find((x) => x.canal === 'whatsapp' && x.identificador === ident); if (k) Canais.optOut(tid, dono, k.id, true); }
  }
  // classifica SÓ esta mensagem; o que fica é o contador por assunto (o texto é descartado aqui)
  const tab = montarAssuntos(require('./captura').assuntosDoTenant(tid));
  const r = texto ? classificarConversa({ canal: 'whatsapp', assuntos: tab, mensagens: [{ t: t - 1000, deMim: true, texto: '' }, { t, deMim: false, texto }] }) : null;
  const pontos = ex ? j.parse(ex.pontos, {}) : {};
  for (const a of (r && r.assuntos) || []) pontos[a.assunto] = (pontos[a.assunto] || 0) + (Number(a.pontos) || 0);
  const evid = new Set(ex ? j.parse(ex.evidencias, []) : []); for (const e of (r && r.evidencias) || []) evid.add(e);
  const razao = (r && r.razao) || (ex && ex.razao) || ''; const razaoRot = (r && r.razao_rotulo) || (ex && ex.razao_rotulo) || '';
  const deles = (ex ? ex.deles : 0) + 1;
  const primeira = ex ? ex.primeira_em : new Date(t).toISOString();
  ids.push(wamid); while (ids.length > 30) ids.shift();
  const nome = s(nomePerfil, 120) || (ex && ex.nome) || '';
  const campos = [j.str(pontos), deles, nome, primeira, new Date(t).toISOString(), razao, razaoRot, j.str([...evid].slice(0, 8)), j.str(ids)];
  if (ex) db.prepare('UPDATE crm_wa_estado SET pontos=?, deles=?, nome=?, primeira_em=?, ultima_em=?, razao=?, razao_rotulo=?, evidencias=?, ids=? WHERE tenant_id=? AND ident=?').run(...campos, tid, ident);
  else db.prepare('INSERT INTO crm_wa_estado (pontos, deles, nome, primeira_em, ultima_em, razao, razao_rotulo, evidencias, ids, tenant_id, ident) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...campos, tid, ident);
  // vira sinal de lead quando o acumulado de UM assunto passa do corte
  const melhor = Object.entries(pontos).sort((a, b) => b[1] - a[1])[0];
  if (!melhor || melhor[1] < LIMITE_PONTOS) return { acumulada: true };
  const sit = (r && r.qualificacao) || 'morno';
  require('./conversas').ingerir(tid, [{
    canal: 'whatsapp', identificador: ident, nome, assunto: melhor[0], assuntos: Object.entries(pontos).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([assunto, p]) => ({ assunto, pontos: p })),
    razao, razao_rotulo: razaoRot, situacao: 'aguardando_nos', qualificacao: sit, confianca: Math.round((melhor[1] / (melhor[1] + 3)) * 100) / 100, evidencias: [...evid].slice(0, 6),
    total: deles, minhas: 0, deles, primeira_em: primeira, ultima_em: new Date(t).toISOString(), ultima_de_mim: false,
  }], 'whatsapp-business');
  return { lead: true };
}

/**
 * Processa um POST da Meta. Devolve { status, ... } — o chamador responde 200 rápido quando válido.
 * `bruto` = corpo exato recebido (Buffer), para a assinatura.
 */
function receber(token, bruto, cabecalhoAssinatura, corpo) {
  const tid = tenantPorToken(token); if (!tid) return { status: 404 };
  if (!assinaturaOk(tid, bruto, cabecalhoAssinatura)) return { status: 401 };
  const c = cfg(tid); let lidas = 0, leads = 0;
  for (const e of (corpo && corpo.entry) || []) for (const ch of e.changes || []) {
    const v = ch.value || {};
    if (!v.metadata || String(v.metadata.phone_number_id) !== String(c.phone_number_id)) continue; // outro número: não é deste assinante
    const nomes = Object.fromEntries((v.contacts || []).map((x) => [String(x.wa_id), (x.profile || {}).name]));
    for (const m of v.messages || []) { const r = tratar(tid, m, nomes[String(m.from)]); if (!r.ignorada && !r.repetida) lidas++; if (r.lead) leads++; }
  }
  if (lidas) salvarCfg(tid, { ...cfg(tid), ultimo_evento_em: nowISO() });
  return { status: 200, tenant_id: tid, lidas, leads };
}

module.exports = { estado, configurar, remover, verificar, receber, tenantPorToken };
