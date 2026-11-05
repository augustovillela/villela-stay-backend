// =====================================================================
// Villela Docs — de QUEM é a IA de cada empresa (fonte da IA).
//   'plataforma' = chave da Villela (ANTHROPIC_API_KEY do servidor), dentro da cota do plano;
//   'propria'    = chave de API que o ASSINANTE colou (Anthropic): a chamada roda e é cobrada na conta dele,
//                  não gasta a cota do plano e nunca cai na chave da plataforma (se a dele falhar, falha).
// A chave fica CIFRADA (AES-256-GCM) em tabela própria — NUNCA em tenant_settings, porque /config e o takeout
// devolvem tudo de lá. Só os 4 últimos caracteres voltam para a tela. Ver docs\integracoes\villela-docs.md.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO } = require('./db');
const repo = require('./repo');

let _segredo = '';
// Segredo do cofre: VDOCS_COFRE_SEGREDO (recomendado, não muda) ou, na falta, o jwtSecret do servidor.
// Trocar o segredo invalida as chaves guardadas (o assinante cola de novo) — não perde dado, só o acesso.
const iniciar = (jwtSecret) => { _segredo = String(process.env.VDOCS_COFRE_SEGREDO || jwtSecret || ''); };
const chaveAes = () => {
  if (!_segredo) throw new Error('Cofre de chaves sem segredo configurado.');
  return crypto.createHash('sha256').update('vdocs-ia-cofre:v1:' + _segredo).digest();
};
function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveAes(), iv);
  const ct = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}
function decifrar(pacote) {
  const [v, iv, tag, ct] = String(pacote || '').split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Formato de chave guardada desconhecido.');
  const d = crypto.createDecipheriv('aes-256-gcm', chaveAes(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

const linha = (tenantId) => db.prepare('SELECT * FROM tenant_ia WHERE tenant_id = ?').get(String(tenantId));

/** Estado para a tela — nunca devolve a chave. */
function estado(tenantId) {
  const r = linha(tenantId);
  return {
    provedor: 'anthropic',
    fonte: r && r.fonte === 'propria' && r.chave_cifrada ? 'propria' : 'plataforma',
    tem_chave: !!(r && r.chave_cifrada),
    chave_final: r ? r.chave_final || '' : '',
    validada_em: r ? r.validada_em || '' : '',
    plataforma_disponivel: !!process.env.ANTHROPIC_API_KEY,
  };
}

/** Chave em texto puro SÓ quando a empresa escolheu a própria; '' caso contrário (ou se não decifra). */
function chaveDoTenant(tenantId) {
  const r = linha(tenantId);
  if (!r || r.fonte !== 'propria' || !r.chave_cifrada) return '';
  try { return decifrar(r.chave_cifrada); } catch (_) { return ''; }
}
const usaChavePropria = (tenantId) => !!chaveDoTenant(tenantId);

const FORMATO_CHAVE = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

/** Grava a escolha. `chave` é opcional (só quando está trocando/colando); `validada` marca que o teste passou. */
function salvar(tenantId, { fonte, chave, validada }, ator, ip) {
  if (!['plataforma', 'propria'].includes(fonte)) throw new Error('Fonte de IA inválida.');
  const atual = linha(tenantId);
  let cifrada = atual ? atual.chave_cifrada : '', final = atual ? atual.chave_final : '', valEm = atual ? atual.validada_em : '';
  if (chave) {
    const c = String(chave).trim();
    if (!FORMATO_CHAVE.test(c)) throw new Error('Essa não parece uma chave de API da Anthropic (ela começa com sk-ant-…).');
    cifrada = cifrar(c); final = c.slice(-4); valEm = validada ? nowISO() : '';
  }
  if (fonte === 'propria' && !cifrada) throw new Error('Cole a sua chave de API antes de escolher "chave própria".');
  db.prepare(`INSERT INTO tenant_ia (tenant_id, fonte, chave_cifrada, chave_final, validada_em, atualizado_em, atualizado_por)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT (tenant_id) DO UPDATE SET fonte = excluded.fonte, chave_cifrada = excluded.chave_cifrada,
    chave_final = excluded.chave_final, validada_em = excluded.validada_em, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`)
    .run(String(tenantId), fonte, cifrada, final, valEm, nowISO(), repo.s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'ia.fonte.alterar', 'tenant_ia', String(tenantId), { fonte, trocou_chave: !!chave }, ip); // nunca a chave
  return estado(tenantId);
}

function removerChave(tenantId, ator, ip) {
  db.prepare("UPDATE tenant_ia SET fonte = 'plataforma', chave_cifrada = '', chave_final = '', validada_em = '', atualizado_em = ?, atualizado_por = ? WHERE tenant_id = ?")
    .run(nowISO(), repo.s(ator && ator.id, 40), String(tenantId));
  repo.auditar(tenantId, ator, 'ia.chave.remover', 'tenant_ia', String(tenantId), {}, ip);
  return estado(tenantId);
}

module.exports = { iniciar, estado, chaveDoTenant, usaChavePropria, salvar, removerChave, FORMATO_CHAVE, cifrar, decifrar };
