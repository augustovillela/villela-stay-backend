// =====================================================================
// Villela Growth OS — cofre de credenciais (AES-256-GCM).
//
// Token de plataforma NUNCA aparece em frontend, log, mensagem de erro,
// analytics, prompt de IA ou arquivo versionado (§28 do prompt). Por isso
// este módulo só devolve o valor em claro por uma função explícita, e o
// listar() devolve apenas metadados.
//
// Chave: GROWTH_SECRET_KEY (32 bytes em hex ou base64). Sem ela, gravar
// segredo FALHA — não há modo silencioso "sem criptografia".
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const tenancy = require('./tenancy');
const { nowISO } = require('./db');

const ALGO = 'aes-256-gcm';

function chave() {
  const bruta = process.env.GROWTH_SECRET_KEY || '';
  if (!bruta) {
    const e = new Error('GROWTH_SECRET_KEY não configurada — o cofre não grava sem chave.');
    e.status = 500; e.configuracao = 'GROWTH_SECRET_KEY'; throw e;
  }
  const buf = /^[0-9a-f]{64}$/i.test(bruta) ? Buffer.from(bruta, 'hex') : Buffer.from(bruta, 'base64');
  if (buf.length !== 32) {
    const e = new Error('GROWTH_SECRET_KEY precisa ter 32 bytes (64 hex ou 44 base64).');
    e.status = 500; throw e;
  }
  return buf;
}

const configurado = () => { try { chave(); return true; } catch { return false; } };

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALGO, chave(), iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return { cifra: dados.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
}

function decifrar({ cifra, iv, tag }) {
  const d = crypto.createDecipheriv(ALGO, chave(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(cifra, 'base64')), d.final()]).toString('utf8');
}

/** Grava (ou substitui) um segredo da conta do contexto. */
function guardar({ escopo = 'conexao', refId = '', chave: nome, valor, expiraEm = '' }) {
  if (!nome) throw new Error('Segredo precisa de chave.');
  const tenantId = tenancy.tenantAtual();
  const { cifra, iv, tag } = cifrar(valor);
  const existente = repo.um(
    'SELECT * FROM gx_segredos WHERE tenant_id = :tenant AND escopo = :escopo AND ref_id = :ref AND chave = :chave',
    { escopo, ref: refId, chave: nome }
  );
  if (existente) {
    repo.atualizar('gx_segredos', existente.id, { cifra, iv, tag, expira_em: expiraEm, rotacionado_em: nowISO() });
    repo.auditar({ acao: 'segredo.rotacionado', entidade: 'gx_segredos', entidadeId: existente.id, detalhe: `${escopo}:${nome}` });
    return existente.id;
  }
  const id = repo.inserir('gx_segredos', { escopo, ref_id: refId, chave: nome, cifra, iv, tag, expira_em: expiraEm });
  repo.auditar({ acao: 'segredo.guardado', entidade: 'gx_segredos', entidadeId: id, detalhe: `${escopo}:${nome}` });
  void tenantId;
  return id;
}

/**
 * Devolve o valor em claro. Uso restrito ao conector que vai chamar a API.
 * Nunca passe o retorno para resposta HTTP, log ou prompt.
 */
function revelar({ escopo = 'conexao', refId = '', chave: nome }) {
  const linha = repo.um(
    'SELECT * FROM gx_segredos WHERE tenant_id = :tenant AND escopo = :escopo AND ref_id = :ref AND chave = :chave',
    { escopo, ref: refId, chave: nome }
  );
  if (!linha) return null;
  return decifrar(linha);
}

/** Metadados apenas — sem cifra, sem iv, sem tag. É o que pode ir para tela. */
function listar({ escopo = null, refId = null } = {}) {
  const cond = [];
  const params = {};
  if (escopo) { cond.push('escopo = :escopo'); params.escopo = escopo; }
  if (refId !== null) { cond.push('ref_id = :ref'); params.ref = refId; }
  const linhas = repo.listar('gx_segredos', { onde: cond.join(' AND '), params, ordem: 'criado_em DESC' });
  return linhas.map(l => ({
    id: l.id, escopo: l.escopo, ref_id: l.ref_id, chave: l.chave,
    expira_em: l.expira_em, criado_em: l.criado_em, rotacionado_em: l.rotacionado_em,
    vencido: !!(l.expira_em && l.expira_em < nowISO()),
  }));
}

function remover(id) {
  const n = repo.remover('gx_segredos', id);
  if (n) repo.auditar({ acao: 'segredo.removido', entidade: 'gx_segredos', entidadeId: id });
  return n;
}

/** Segredos vencendo nos próximos N dias — insumo do agente operacional. */
function vencendo(dias = 7) {
  const limite = new Date(Date.now() + dias * 86400000).toISOString();
  return listar().filter(s => s.expira_em && s.expira_em <= limite);
}

module.exports = { configurado, guardar, revelar, listar, remover, vencendo, cifrar, decifrar };
