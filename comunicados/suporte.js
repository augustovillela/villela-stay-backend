// =====================================================================
// Comunicados — SUPORTE: chat de mão dupla entre o cliente (dentro do app
// de qualquer sistema) e a equipe (Portal Staff → 💬 Suporte dos sistemas).
//
// Travas:
//   • Dono da conversa = produto + usuario_ref, conferidos no SERVIDOR a
//     cada leitura/resposta. O id sozinho não abre conversa de ninguém.
//   • Limites contra abuso: texto até 2.000 caracteres, até 5 conversas
//     novas por dia e 30 mensagens por hora por usuário.
//   • Resposta da equipe avisa o cliente por push (onde o sistema tem) e
//     por e-mail — é resposta a pedido dele, não comunicado: não passa
//     pelo descadastro de "novidades".
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');
const fontes = require('./fontes');

const MAX_TEXTO = 2000;
const MAX_CONVERSAS_DIA = 5;
const MAX_MSGS_HORA = 30;

const s = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

let _avisos = { avisarStaff: null, enviarEmail: null };
function configurar({ avisarStaff, enviarEmail } = {}) {
  if (typeof avisarStaff === 'function') _avisos.avisarStaff = avisarStaff;
  if (typeof enviarEmail === 'function') _avisos.enviarEmail = enviarEmail;
}

function limitar(produto, ref) {
  const dia = new Date(Date.now() - 864e5).toISOString(), hora = new Date(Date.now() - 36e5).toISOString();
  const conv = db.prepare('SELECT COUNT(*) n FROM conversas WHERE produto = ? AND usuario_ref = ? AND criado_em >= ?').get(produto, ref, dia).n;
  const msgs = db.prepare(`SELECT COUNT(*) n FROM mensagens m JOIN conversas c ON c.id = m.conversa_id
    WHERE c.produto = ? AND c.usuario_ref = ? AND m.autor = 'usuario' AND m.criado_em >= ?`).get(produto, ref, hora).n;
  return { conv: Number(conv), msgs: Number(msgs) };
}
const hidr = (c) => c ? { ...c } : null;
const mensagensDe = (id) => db.prepare('SELECT id, autor, autor_nome, texto, criado_em FROM mensagens WHERE conversa_id = ? ORDER BY id').all(id);

function avisarEquipe(c, texto, nova) {
  if (!_avisos.avisarStaff) return;
  const f = fontes.obter(c.produto) || { nome: c.produto, emoji: '' };
  Promise.resolve(_avisos.avisarStaff({
    title: `${f.emoji} ${nova ? 'Novo pedido de suporte' : 'Nova mensagem'} — ${f.nome}`,
    body: `${c.nome || 'Cliente'}: ${String(texto).slice(0, 140)}`,
    url: '/staff/#suporte-sistemas',
  })).catch(() => {});
}

// ---------------- lado do cliente ----------------
async function abrir(produto, ref, { assunto, texto, pagina } = {}) {
  const t = s(texto, MAX_TEXTO), a = s(assunto, 120) || t.slice(0, 60);
  if (!t) throw erro('Escreva a sua mensagem.');
  const lim = limitar(produto, ref);
  if (lim.conv >= MAX_CONVERSAS_DIA) throw erro('Você abriu muitas conversas hoje. Continue numa das que já existem.', 429);
  if (lim.msgs >= MAX_MSGS_HORA) throw erro('Muitas mensagens em pouco tempo. Tente de novo daqui a pouco.', 429);
  const p = await fontes.perfil(produto, ref) || {};
  const id = novoId(), agora = nowISO();
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO conversas (id, produto, usuario_ref, nome, email, assunto, status, pagina, nao_lidas_staff, ultima_origem, criado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, 'aberta', ?, 1, 'usuario', ?, ?)`).run(id, produto, ref, s(p.nome, 120), s(p.email, 160), a, s(pagina, 300), agora, agora);
    db.prepare("INSERT INTO mensagens (conversa_id, autor, autor_nome, texto, criado_em) VALUES (?, 'usuario', ?, ?, ?)").run(id, s(p.nome, 120), t, agora);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  const c = db.prepare('SELECT * FROM conversas WHERE id = ?').get(id);
  avisarEquipe(c, t, true);
  return { ...c, mensagens: mensagensDe(id) };
}
function daConta(produto, ref, id) {
  const c = db.prepare('SELECT * FROM conversas WHERE id = ? AND produto = ? AND usuario_ref = ?').get(String(id || ''), produto, ref);
  if (!c) throw erro('Conversa não encontrada.', 404);
  return c;
}
function responderUsuario(produto, ref, id, texto) {
  const c = daConta(produto, ref, id);
  const t = s(texto, MAX_TEXTO);
  if (!t) throw erro('Escreva a sua mensagem.');
  if (limitar(produto, ref).msgs >= MAX_MSGS_HORA) throw erro('Muitas mensagens em pouco tempo. Tente de novo daqui a pouco.', 429);
  const agora = nowISO();
  db.prepare("INSERT INTO mensagens (conversa_id, autor, autor_nome, texto, criado_em) VALUES (?, 'usuario', ?, ?, ?)").run(c.id, c.nome, t, agora);
  // Cliente que escreve numa conversa resolvida a reabre.
  db.prepare("UPDATE conversas SET status = 'aberta', nao_lidas_staff = nao_lidas_staff + 1, ultima_origem = 'usuario', atualizado_em = ? WHERE id = ?").run(agora, c.id);
  avisarEquipe(c, t, false);
  return abrirDoUsuario(produto, ref, c.id);
}
function listarDoUsuario(produto, ref) {
  return db.prepare(`SELECT id, assunto, status, nao_lidas_usuario, ultima_origem, criado_em, atualizado_em,
      (SELECT texto FROM mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) ultima
    FROM conversas c WHERE produto = ? AND usuario_ref = ? ORDER BY atualizado_em DESC LIMIT 30`).all(produto, ref);
}
// Abrir a conversa conta como leitura das respostas da equipe.
function abrirDoUsuario(produto, ref, id) {
  const c = daConta(produto, ref, id);
  if (c.nao_lidas_usuario) db.prepare('UPDATE conversas SET nao_lidas_usuario = 0 WHERE id = ?').run(c.id);
  return { ...c, nao_lidas_usuario: 0, mensagens: mensagensDe(c.id) };
}
const naoLidasDoUsuario = (produto, ref) => Number((db.prepare('SELECT COALESCE(SUM(nao_lidas_usuario), 0) n FROM conversas WHERE produto = ? AND usuario_ref = ?').get(produto, ref) || {}).n || 0);

// ---------------- lado da equipe ----------------
function listarStaff({ status, produto, busca, limite = 200 } = {}) {
  const cond = [], args = [];
  if (status === 'aguardando') cond.push("status = 'aberta'");
  else if (status && status !== 'todas') { cond.push('status = ?'); args.push(status); }
  if (produto) { cond.push('produto = ?'); args.push(produto); }
  if (busca) { cond.push("(nome LIKE ? OR email LIKE ? OR assunto LIKE ? OR EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa_id = c.id AND m.texto LIKE ?))"); const b = `%${s(busca, 80)}%`; args.push(b, b, b, b); }
  return db.prepare(`SELECT c.*, (SELECT texto FROM mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) ultima,
      (SELECT COUNT(*) FROM mensagens m WHERE m.conversa_id = c.id) total
    FROM conversas c ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY (status = 'aberta') DESC, atualizado_em DESC LIMIT ?`)
    .all(...args, Math.min(Number(limite) || 200, 500));
}
function resumoStaff() {
  const r = db.prepare(`SELECT
      SUM(status = 'aberta') aguardando, SUM(status = 'respondida') respondidas, SUM(status = 'resolvida') resolvidas,
      SUM(nao_lidas_staff) nao_lidas FROM conversas`).get() || {};
  return { aguardando: Number(r.aguardando || 0), respondidas: Number(r.respondidas || 0), resolvidas: Number(r.resolvidas || 0), nao_lidas: Number(r.nao_lidas || 0) };
}
function abrirStaff(id) {
  const c = db.prepare('SELECT * FROM conversas WHERE id = ?').get(String(id || ''));
  if (!c) throw erro('Conversa não encontrada.', 404);
  if (c.nao_lidas_staff) db.prepare('UPDATE conversas SET nao_lidas_staff = 0 WHERE id = ?').run(c.id);
  return { ...c, nao_lidas_staff: 0, mensagens: mensagensDe(c.id) };
}
async function responderStaff(id, texto, autorNome, { resolver = false } = {}) {
  const c = db.prepare('SELECT * FROM conversas WHERE id = ?').get(String(id || ''));
  if (!c) throw erro('Conversa não encontrada.', 404);
  const t = s(texto, MAX_TEXTO);
  if (!t) throw erro('Escreva a resposta.');
  const agora = nowISO();
  db.prepare("INSERT INTO mensagens (conversa_id, autor, autor_nome, texto, criado_em) VALUES (?, 'staff', ?, ?, ?)").run(c.id, s(autorNome, 80) || 'Equipe', t, agora);
  db.prepare("UPDATE conversas SET status = ?, nao_lidas_usuario = nao_lidas_usuario + 1, nao_lidas_staff = 0, ultima_origem = 'staff', atualizado_em = ? WHERE id = ?")
    .run(resolver ? 'resolvida' : 'respondida', agora, c.id);
  const avisos = await avisarCliente(c, t);
  return { ...abrirStaff(c.id), avisos };
}
function mudarStatus(id, status) {
  if (!['aberta', 'respondida', 'resolvida'].includes(status)) throw erro('Status inválido.');
  const r = db.prepare('UPDATE conversas SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), String(id || ''));
  if (!Number(r.changes)) throw erro('Conversa não encontrada.', 404);
  return abrirStaff(id);
}

// Resposta da equipe: push (onde o sistema tem) + e-mail com o texto e o link
// para continuar a conversa no app. Best-effort: falha de aviso não desfaz a resposta.
async function avisarCliente(c, texto) {
  const f = fontes.obter(c.produto) || { nome: 'Grupo Villela Stay', cor: '#1B2A4A' };
  const out = { push: false, email: false };
  try { out.push = !!(await fontes.pushUsuario(c.produto, c.usuario_ref, { title: `💬 ${f.nome}: resposta do suporte`, body: texto.slice(0, 160), tag: 'suporte' })); } catch (_) {}
  if (_avisos.enviarEmail && c.email) {
    const primeiro = String(c.nome || '').split(' ')[0];
    const html = `<div style="font-family:Inter,system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1F2933">
      <div style="background:${f.cor || '#1B2A4A'};border-radius:12px 12px 0 0;padding:16px 24px"><span style="color:#fff;font-weight:800">${f.emoji || ''} ${esc(f.nome)} · Suporte</span></div>
      <div style="border:1px solid #E2E6EC;border-top:0;border-radius:0 0 12px 12px;padding:24px">
        <p>Olá${primeiro ? ', ' + esc(primeiro) : ''}! Respondemos a sua mensagem sobre <b>${esc(c.assunto)}</b>:</p>
        <blockquote style="margin:14px 0;padding:12px 16px;background:#F4F6F9;border-left:4px solid ${f.cor || '#1B2A4A'};border-radius:6px">${esc(texto).replace(/\n/g, '<br>')}</blockquote>
        ${f.url ? `<p style="margin:20px 0"><a href="${esc(f.url)}" style="background:${f.cor || '#1B2A4A'};color:#fff;font-weight:700;padding:11px 24px;border-radius:24px;text-decoration:none">Continuar a conversa</a></p>` : ''}
        <p style="color:#6B7280;font-size:.8rem">Para responder, abra o ${esc(f.nome)} e toque no botão 💬 no canto da tela.</p>
      </div></div>`;
    try { out.email = !!(await _avisos.enviarEmail(c.email, `💬 ${f.nome}: respondemos a sua mensagem`, html)); } catch (_) {}
  }
  return out;
}

module.exports = {
  configurar, abrir, responderUsuario, listarDoUsuario, abrirDoUsuario, naoLidasDoUsuario,
  listarStaff, resumoStaff, abrirStaff, responderStaff, mudarStatus,
  LIMITES: { MAX_TEXTO, MAX_CONVERSAS_DIA, MAX_MSGS_HORA },
};
