// =====================================================================
// Villela Growth OS — contexto de execução e trava de isolamento.
//
// Este banco NÃO tem Row-Level Security (SQLite — ver ADR-0001). Toda a
// separação entre clientes depende deste arquivo e do repo.js. Por isso:
//
//   1. o tenant vem SEMPRE do contexto, nunca do corpo da requisição;
//   2. sem contexto, o repositório se recusa a rodar;
//   3. leitura cruzada só como plataforma, e sempre auditada.
//
// O selftest tenta furar as três regras e exige falha.
// =====================================================================
'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const als = new AsyncLocalStorage();

const novoCorrelationId = () => 'c_' + crypto.randomBytes(9).toString('base64url');

/** Contexto atual, ou null fora de qualquer escopo. */
const atual = () => als.getStore() || null;

/**
 * Tenant do contexto. Lança se não houver — é o comportamento desejado:
 * não existe caminho silencioso para "consultar sem tenant".
 */
function tenantAtual() {
  const ctx = atual();
  if (!ctx || !ctx.tenantId) {
    throw new ErroDeIsolamento('Operação sem tenant no contexto. Use tenancy.comTenant().');
  }
  return ctx.tenantId;
}

const userAtual = () => (atual() || {}).userId || '';
const orgAtual = () => (atual() || {}).orgId || '';
const correlationId = () => (atual() || {}).correlationId || '';
const ehPlataforma = () => !!(atual() || {}).plataforma;

class ErroDeIsolamento extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDeIsolamento'; this.status = 403; }
}

/**
 * Executa `fn` no escopo de um tenant.
 * O tenantId tem de vir de uma fonte confiável (sessão, membership validado),
 * NUNCA direto de req.body/req.query.
 */
function comTenant({ tenantId, userId = '', orgId = '', correlationId: cid, papel = '', permissoes = null }, fn) {
  if (!tenantId) throw new ErroDeIsolamento('comTenant exige tenantId.');
  return als.run({
    tenantId: String(tenantId),
    userId: String(userId || ''),
    orgId: String(orgId || ''),
    correlationId: cid || novoCorrelationId(),
    papel: papel || '',
    permissoes,          // Set|null — resolvido pelo rbac.js
    plataforma: false,
  }, fn);
}

/**
 * Escape de administração: opera sem tenant fixo (ou atravessando contas).
 * Exige um motivo — que vai para a auditoria de quem chamar.
 */
function comoPlataforma({ userId = '', motivo = '', correlationId: cid, tenantId = '' }, fn) {
  if (!motivo) throw new ErroDeIsolamento('comoPlataforma exige um motivo (vai para a auditoria).');
  return als.run({
    tenantId: tenantId ? String(tenantId) : '',
    userId: String(userId || ''),
    orgId: '',
    correlationId: cid || novoCorrelationId(),
    papel: 'plataforma',
    permissoes: null,
    plataforma: true,
    motivo,
  }, fn);
}

/** Roda `fn` sem contexto nenhum (usado só por testes e por rotinas de boot). */
const semContexto = (fn) => als.run(undefined, fn);

/**
 * Middleware Express: carimba correlation id na requisição e na resposta.
 * NÃO define tenant — quem define é a rota, depois de validar a sessão.
 */
function middlewareCorrelacao(req, res, next) {
  req.correlationId = String(req.headers['x-correlation-id'] || '').slice(0, 64) || novoCorrelationId();
  res.set('X-Correlation-Id', req.correlationId);
  next();
}

module.exports = {
  atual, tenantAtual, userAtual, orgAtual, correlationId, ehPlataforma,
  comTenant, comoPlataforma, semContexto,
  novoCorrelationId, middlewareCorrelacao, ErroDeIsolamento,
};
