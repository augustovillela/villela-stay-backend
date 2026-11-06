// =====================================================================
// Villela CRM — COFRE do assinante (chave de API de IA, token Apify).
//
// AES-256-GCM. A chave de cifra é DERIVADA (HKDF, contexto "villela-crm-cofre-v1") da
// GROWTH_SECRET_KEY que já existe no servidor: nenhuma variável nova, e a chave do CRM
// fica separada da do Growth. tenant_id + nome entram como dado autenticado (AAD): uma
// linha copiada para outro tenant (ou outro nome) não decifra.
//
// O valor em claro só sai por `revelar()`, usado pelo código que chama o provedor.
// NUNCA vai para resposta HTTP, log, mensagem de erro, prompt nem auditoria — `limpar()`
// tira qualquer chave conhecida de um texto antes de ele virar erro.
// Segue o padrão de growth/segredos.js (rotação por GROWTH_SECRET_KEY_ANTERIOR incluída).
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId } = require('./db');

const NOMES = {
  ia_anthropic: { rotulo: 'Chave de API da Anthropic (Claude)', prefixo: /^sk-ant-[A-Za-z0-9_\-]{20,}$/ },
  ia_openai: { rotulo: 'Chave de API da OpenAI', prefixo: /^sk-[A-Za-z0-9_\-]{20,}$/ },
  apify: { rotulo: 'Token do Apify (busca no Google Maps)', prefixo: /^apify_api_[A-Za-z0-9]{10,}$/ },
  // e-mail por IMAP: o servidor monta {provedor, usuario, senha} em base64 (a senha de aplicativo nunca aparece em texto)
  imap: { rotulo: 'Caixa de e-mail (IMAP, senha de aplicativo)', prefixo: /^[A-Za-z0-9+/=]{20,2000}$/ },
  // segredo do app da Meta: serve para conferir a assinatura do webhook do WhatsApp Business
  wa_secret: { rotulo: 'Segredo do app da Meta (WhatsApp Business)', prefixo: /^[A-Za-z0-9]{16,64}$/ },
};
// nestes, nem os 4 últimos caracteres aparecem na tela (poderiam ser parte da senha)
const SEM_FINAL = ['imap', 'wa_secret'];
const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const erro = (msg, status = 400, extra) => { const e = new Error(msg); e.status = status; if (extra) Object.assign(e, extra); return e; };

function materializar(bruta, nomeVar) {
  const buf = /^[0-9a-f]{64}$/i.test(bruta) ? Buffer.from(bruta, 'hex') : Buffer.from(bruta, 'base64');
  if (buf.length !== 32) throw erro(`${nomeVar} precisa ter 32 bytes (64 hex ou 44 base64).`, 500);
  return buf;
}
const derivar = (base) => Buffer.from(crypto.hkdfSync('sha256', base, Buffer.alloc(0), 'villela-crm-cofre-v1', 32));
function chave() {
  const bruta = process.env.GROWTH_SECRET_KEY || '';
  if (!bruta) throw erro('Cofre indisponível: GROWTH_SECRET_KEY não configurada no servidor — nada é gravado sem chave.', 500, { configuracao: 'GROWTH_SECRET_KEY' });
  return derivar(materializar(bruta, 'GROWTH_SECRET_KEY'));
}
function chaveAnterior() {
  const bruta = process.env.GROWTH_SECRET_KEY_ANTERIOR || '';
  if (!bruta) return null;
  try { return derivar(materializar(bruta, 'GROWTH_SECRET_KEY_ANTERIOR')); } catch (_) { return null; }
}
const configurado = () => { try { chave(); return true; } catch (_) { return false; } };
const aad = (tid, nome) => Buffer.from(`crm:${tid}:${nome}`, 'utf8');

function cifrar(tid, nome, texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  c.setAAD(aad(tid, nome));
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return { cifra: dados.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
}
function decifrarCom(k, tid, nome, l) {
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(l.iv, 'base64'));
  d.setAAD(aad(tid, nome));
  d.setAuthTag(Buffer.from(l.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(l.cifra, 'base64')), d.final()]).toString('utf8');
}
function decifrar(tid, nome, l) {
  try { return decifrarCom(chave(), tid, nome, l); } catch (e) {
    const antiga = chaveAnterior();
    if (!antiga) throw erro('Não foi possível ler a chave guardada. Cadastre-a de novo.', 500);
    try { return decifrarCom(antiga, tid, nome, l); } catch (_) { throw erro('Não foi possível ler a chave guardada. Cadastre-a de novo.', 500); }
  }
}

// formato mínimo — recusa colar o que claramente não é a chave (ex.: uma frase) sem validar com o provedor
function formatoOk(nome, valor) {
  const v = s(valor, 2000);
  if (!NOMES[nome]) return false;
  if (/\s/.test(v)) return false;
  if (nome === 'ia_openai') return NOMES.ia_openai.prefixo.test(v) && !v.startsWith('sk-ant-');
  return NOMES[nome].prefixo.test(v);
}

const Cofre = {
  NOMES, configurado,

  guardar(tid, nome, valor, quem = '') {
    if (!NOMES[nome]) throw erro('Tipo de chave desconhecido.');
    const v = s(valor, 2000);
    if (!formatoOk(nome, v)) throw erro(`Isso não parece ${NOMES[nome].rotulo.toLowerCase()}. Confira se copiou a chave inteira, sem espaços.`);
    const { cifra, iv, tag } = cifrar(tid, nome, v);
    const ex = db.prepare('SELECT id FROM crm_segredos WHERE tenant_id = ? AND nome = ?').get(tid, nome);
    if (ex) db.prepare("UPDATE crm_segredos SET cifra=?, iv=?, tag=?, ultimos4=?, rotacionado_em=?, testado_em='', criado_por=? WHERE id=?").run(cifra, iv, tag, (SEM_FINAL.includes(nome) ? '' : v.slice(-4)), nowISO(), s(quem, 120), ex.id);
    else db.prepare('INSERT INTO crm_segredos (id, tenant_id, nome, cifra, iv, tag, ultimos4, criado_em, criado_por) VALUES (?,?,?,?,?,?,?,?,?)').run(novoId(), tid, nome, cifra, iv, tag, (SEM_FINAL.includes(nome) ? '' : v.slice(-4)), nowISO(), s(quem, 120));
    return Cofre.meta(tid).find((m) => m.nome === nome);
  },

  /** Valor em claro. Só para o código que chama o provedor — nunca para resposta, log ou prompt. */
  revelar(tid, nome) {
    const l = db.prepare('SELECT * FROM crm_segredos WHERE tenant_id = ? AND nome = ?').get(tid, nome);
    return l ? decifrar(tid, nome, l) : null;
  },

  tem: (tid, nome) => !!db.prepare('SELECT 1 FROM crm_segredos WHERE tenant_id = ? AND nome = ?').get(tid, nome),

  /** Só metadado: é o que pode ir para a tela. */
  meta(tid) {
    const linhas = db.prepare('SELECT nome, ultimos4, criado_em, rotacionado_em, testado_em FROM crm_segredos WHERE tenant_id = ?').all(tid);
    return linhas.map((l) => ({ nome: l.nome, rotulo: (NOMES[l.nome] || {}).rotulo || l.nome, final: l.ultimos4 ? '••••' + l.ultimos4 : '••••••••', cadastrada_em: l.rotacionado_em || l.criado_em, testada_em: l.testado_em }));
  },

  marcarTestada(tid, nome) { db.prepare('UPDATE crm_segredos SET testado_em = ? WHERE tenant_id = ? AND nome = ?').run(nowISO(), tid, nome); },

  remover(tid, nome) { return { removida: db.prepare('DELETE FROM crm_segredos WHERE tenant_id = ? AND nome = ?').run(tid, nome).changes > 0 }; },

  /**
   * Tira de um texto qualquer chave conhecida (a do tenant e o formato de chaves de provedor).
   * Todo erro que vem de fora (provedor, rede) passa por aqui antes de virar mensagem.
   */
  limpar(texto, tid = '') {
    let t = String(texto == null ? '' : texto);
    if (tid) for (const nome of Object.keys(NOMES)) {
      try { const v = Cofre.revelar(tid, nome); if (v && v.length >= 8) t = t.split(v).join('[chave]'); } catch (_) { /* sem chave legível */ }
    }
    return t
      .replace(/sk-ant-[A-Za-z0-9_\-]{8,}/g, '[chave]').replace(/sk-[A-Za-z0-9_\-]{16,}/g, '[chave]')
      .replace(/apify_api_[A-Za-z0-9]{6,}/g, '[chave]').replace(/Bearer\s+[A-Za-z0-9._\-]{12,}/gi, 'Bearer [chave]');
  },
};

module.exports = Cofre;
