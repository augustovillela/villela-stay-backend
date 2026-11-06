// =====================================================================
// Villela CRM — CANAIS DO CONTATO (multicanal).
// Um contato tem N canais (WhatsApp, e-mail, Instagram, Facebook, TikTok,
// LinkedIn). Cada canal guarda identificador normalizado, opt-out PRÓPRIO
// e a fonte do dado. É o que a campanha multicanal usa para montar a fila.
//
// ⚠️ Instagram/Facebook/TikTok/LinkedIn NÃO têm API para abrir conversa com
// uma lista: a campanha nesses canais é ASSISTIDA (o CRM monta a fila, abre o
// perfil e deixa a mensagem pronta; a pessoa envia e marca como enviado).
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

// canal → { rotulo, tipo: 'auto'|'link'|'assistido' }
const CANAIS = {
  whatsapp: { rotulo: 'WhatsApp', assistido: false },
  email: { rotulo: 'E-mail', assistido: false },
  instagram: { rotulo: 'Instagram', assistido: true },
  facebook: { rotulo: 'Facebook', assistido: true },
  tiktok: { rotulo: 'TikTok', assistido: true },
  linkedin: { rotulo: 'LinkedIn', assistido: true },
};
const CANAIS_LISTA = Object.keys(CANAIS);
// campanhas antigas (sem canal): continuam funcionando
const TIPOS_SEM_CANAL = ['tarefa', 'ligacao'];

function normTelefone(t) {
  let d = String(t == null ? '' : t).replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.slice(0, 15);
}

// Normaliza o identificador por canal. Devolve '' quando não dá para aproveitar.
function normalizar(canal, valor) {
  let v = s(valor, 300);
  if (!v) return '';
  switch (canal) {
    case 'whatsapp': { const n = normTelefone(v); return n.length >= 10 ? n : ''; }
    case 'email': { v = v.toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ''; }
    case 'instagram': {
      const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
      v = (m ? m[1] : v).replace(/^@/, '').toLowerCase();
      return /^[a-z0-9._]{1,30}$/.test(v) && !['p', 'reel', 'reels', 'stories', 'explore', 'accounts'].includes(v) ? v : '';
    }
    case 'tiktok': {
      const m = v.match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
      v = (m ? m[1] : v).replace(/^@/, '').toLowerCase();
      return /^[a-z0-9._]{1,40}$/.test(v) ? v : '';
    }
    case 'facebook': {
      let m = v.match(/(?:facebook|fb)\.com\/profile\.php\?id=(\d+)/i);
      if (m) return 'id:' + m[1];
      m = v.match(/(?:facebook|fb|m\.me)(?:\.com)?\/([A-Za-z0-9.\-_]+)/i);
      v = (m ? m[1] : v).replace(/^@/, '').toLowerCase();
      return /^[a-z0-9.\-_]{3,80}$/.test(v) ? v : '';
    }
    case 'linkedin': {
      const m = v.match(/linkedin\.com\/in\/([^\/?#\s]+)/i);
      v = (m ? m[1] : v).replace(/^@/, '').toLowerCase();
      try { v = decodeURIComponent(v); } catch (_) {}
      return /^[\p{L}0-9\-_%.]{2,100}$/u.test(v) ? v : '';
    }
    default: return '';
  }
}

// Link que abre a conversa/perfil (o envio em si é de quem opera).
function link(canal, ident, msg) {
  const e = encodeURIComponent;
  switch (canal) {
    case 'whatsapp': return 'https://wa.me/' + ident + (msg ? '?text=' + e(msg) : '');
    case 'email': return 'mailto:' + ident + (msg ? '?body=' + e(msg) : '');
    case 'instagram': return 'https://ig.me/m/' + ident;
    case 'tiktok': return 'https://www.tiktok.com/@' + ident;
    case 'facebook': return ident.startsWith('id:') ? 'https://www.facebook.com/profile.php?id=' + ident.slice(3) : 'https://m.me/' + ident;
    case 'linkedin': return 'https://www.linkedin.com/in/' + ident + '/';
    default: return '';
  }
}

const Canais = {
  CANAIS, CANAIS_LISTA, TIPOS_SEM_CANAL, normalizar, link,

  doContato(tid, contatoId) {
    return db.prepare('SELECT * FROM crm_contato_canais WHERE tenant_id = ? AND contato_id = ? ORDER BY criado_em').all(s(tid, 40), s(contatoId, 40));
  },

  // acha o contato dono de um canal (dedupe por perfil)
  contatoPorCanal(tid, canal, ident) {
    const r = db.prepare('SELECT contato_id FROM crm_contato_canais WHERE tenant_id = ? AND canal = ? AND identificador = ?').get(s(tid, 40), canal, ident);
    return r ? r.contato_id : null;
  },

  // adiciona (ou mantém) um canal. Se já pertence a OUTRO contato, não rouba: devolve {conflito}.
  adicionar(tid, contatoId, canal, valor, { fonte = 'manual', rotulo = '' } = {}) {
    if (!CANAIS[canal]) throw new Error('Canal inválido: ' + canal);
    const ident = normalizar(canal, valor);
    if (!ident) throw new Error(`${CANAIS[canal].rotulo}: identificador inválido.`);
    const dono = Canais.contatoPorCanal(tid, canal, ident);
    if (dono && dono !== contatoId) return { conflito: dono, canal, identificador: ident };
    if (dono) return { ok: true, existente: true, canal, identificador: ident };
    db.prepare('INSERT INTO crm_contato_canais (id, tenant_id, contato_id, canal, identificador, rotulo, fonte, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(novoId(), s(tid, 40), s(contatoId, 40), canal, ident, s(rotulo, 60), s(fonte, 40), nowISO());
    return { ok: true, canal, identificador: ident };
  },

  remover(tid, contatoId, canalId) {
    const r = db.prepare('DELETE FROM crm_contato_canais WHERE tenant_id = ? AND contato_id = ? AND id = ?').run(s(tid, 40), s(contatoId, 40), s(canalId, 40));
    return { removido: r.changes > 0 };
  },

  // opt-out POR CANAL (a pessoa pode sair do e-mail e continuar no WhatsApp)
  optOut(tid, contatoId, canalId, sair) {
    const r = db.prepare('UPDATE crm_contato_canais SET opt_out = ? WHERE tenant_id = ? AND contato_id = ? AND id = ?')
      .run(sair ? 1 : 0, s(tid, 40), s(contatoId, 40), s(canalId, 40));
    return { ok: r.changes > 0 };
  },

  // espelha os campos clássicos (telefone/whatsapp/email) e os perfis informados no cadastro
  sincronizar(tid, c, extras = {}) {
    const fonte = s(extras.fonte, 40) || 'cadastro';
    const conflitos = [];
    const tenta = (canal, v) => {
      if (!v) return;
      try { const r = Canais.adicionar(tid, c.id, canal, v, { fonte }); if (r.conflito) conflitos.push(r); } catch (_) { /* valor inválido: ignora */ }
    };
    tenta('whatsapp', c.whatsapp || c.telefone);
    tenta('email', c.email);
    for (const k of ['instagram', 'facebook', 'tiktok', 'linkedin']) tenta(k, extras[k]);
    if (Array.isArray(extras.canais)) for (const x of extras.canais) if (x && CANAIS[x.canal]) tenta(x.canal, x.identificador || x.valor);
    return conflitos;
  },

  // mapa canal → identificador utilizável, já descontando opt-out (do canal e do contato)
  disponiveis(tid, c) {
    const optGeral = c.consentimento && c.consentimento.optIn === false;
    if (optGeral) return {};
    const out = {};
    const rows = Canais.doContato(tid, c.id);
    for (const r of rows) if (!r.opt_out && !out[r.canal]) out[r.canal] = r.identificador;
    // contatos antigos ainda sem linha em crm_contato_canais
    if (!out.whatsapp && (c.whatsapp || c.telefone) && !rows.some(r => r.canal === 'whatsapp')) out.whatsapp = c.whatsapp || c.telefone;
    if (!out.email && c.email && !rows.some(r => r.canal === 'email')) out.email = String(c.email).toLowerCase();
    return out;
  },

  // quantos contatos têm cada canal (para a tela de campanha mostrar o alcance)
  alcance(tid) {
    const rows = db.prepare(`SELECT canal, COUNT(*) n FROM crm_contato_canais k JOIN crm_contatos c ON c.id = k.contato_id
      WHERE k.tenant_id = ? AND k.opt_out = 0 AND c.status = 'ativo' GROUP BY canal`).all(s(tid, 40));
    const out = {}; for (const c of CANAIS_LISTA) out[c] = 0;
    for (const r of rows) out[r.canal] = r.n;
    return out;
  },
};

module.exports = Canais;
