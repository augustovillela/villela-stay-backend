// =====================================================================
// Villela Finance — contexto de execução e trava de isolamento.
//
// Este banco NÃO tem Row-Level Security (SQLite — ADR-0003). Toda a
// separação entre clientes depende deste arquivo e do repo.js. Por isso:
//
//   1. o tenant vem SEMPRE do contexto, nunca do corpo da requisição;
//   2. sem contexto, o repositório se recusa a rodar;
//   3. leitura cruzada só como plataforma, com motivo e auditoria.
//
// Além do tenant, o contexto carrega a ENTIDADE LEGAL corrente: num
// financeiro multiempresa, misturar entidades dentro do mesmo tenant é
// tão grave quanto misturar tenants — o razão de uma empresa não pode
// receber lançamento de outra.
//
// O selftest tenta furar cada regra e exige falha.
// =====================================================================
'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const als = new AsyncLocalStorage();

const novoCorrelationId = () => 'c_' + crypto.randomBytes(9).toString('base64url');

/** Contexto atual, ou null fora de qualquer escopo. */
const atual = () => als.getStore() || null;

class ErroDeIsolamento extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDeIsolamento'; this.status = 403; }
}

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

/** Entidade legal corrente. Lança se a operação exigir uma e não houver. */
function entidadeAtual() {
  const ctx = atual();
  if (!ctx || !ctx.entidadeId) {
    throw new ErroDeIsolamento('Operação sem entidade legal no contexto. Escolha a empresa antes.');
  }
  return ctx.entidadeId;
}

const entidadeOpcional = () => (atual() || {}).entidadeId || '';
const userAtual = () => (atual() || {}).userId || '';
const perfilAtual = () => (atual() || {}).perfil || '';
const correlationId = () => (atual() || {}).correlationId || '';
const ehPlataforma = () => !!(atual() || {}).plataforma;
const motivoAtual = () => (atual() || {}).motivo || '';
const ipAtual = () => (atual() || {}).ip || '';
const mfaVerificado = () => !!(atual() || {}).mfa;

/**
 * Executa `fn` no escopo de um tenant.
 * O tenantId tem de vir de fonte confiável (sessão, membership validado),
 * NUNCA direto de req.body/req.query.
 */
function comTenant({ tenantId, entidadeId = '', userId = '', perfil = '', correlationId: cid, ip = '', mfa = false }, fn) {
  if (!tenantId) throw new ErroDeIsolamento('comTenant exige tenantId.');
  return als.run({
    tenantId: String(tenantId),
    entidadeId: String(entidadeId || ''),
    userId: String(userId || ''),
    perfil: String(perfil || ''),
    correlationId: cid || novoCorrelationId(),
    ip: String(ip || ''),
    mfa: !!mfa,
    plataforma: false,
  }, fn);
}

/** Mesmo tenant, trocando a entidade legal corrente (relatório consolidado). */
function comEntidade(entidadeId, fn) {
  const ctx = atual();
  if (!ctx) throw new ErroDeIsolamento('comEntidade exige um contexto de tenant.');
  if (!entidadeId) throw new ErroDeIsolamento('comEntidade exige entidadeId.');
  return als.run(Object.assign({}, ctx, { entidadeId: String(entidadeId) }), fn);
}

/**
 * Escape de administração: opera sem tenant fixo (ou atravessando contas).
 * Exige um motivo — que vai para a auditoria de quem chamar.
 */
function comoPlataforma({ userId = '', motivo = '', correlationId: cid, tenantId = '' }, fn) {
  if (!motivo) throw new ErroDeIsolamento('comoPlataforma exige um motivo (vai para a auditoria).');
  return als.run({
    tenantId: tenantId ? String(tenantId) : '',
    entidadeId: '',
    userId: String(userId || ''),
    perfil: 'plataforma',
    correlationId: cid || novoCorrelationId(),
    ip: '',
    mfa: false,
    plataforma: true,
    motivo,
  }, fn);
}

/** Roda `fn` sem contexto nenhum (só testes e rotinas de boot). */
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
  atual, tenantAtual, entidadeAtual, entidadeOpcional, userAtual, perfilAtual,
  correlationId, ehPlataforma, motivoAtual, ipAtual, mfaVerificado,
  comTenant, comEntidade, comoPlataforma, semContexto,
  novoCorrelationId, middlewareCorrelacao, ErroDeIsolamento,
};
