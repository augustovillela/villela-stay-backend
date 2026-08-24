// =====================================================================
// Villela Finance — auditoria encadeada por hash.
//
// "100% das ações materiais com autor, momento, motivo e evidência" só
// vale se ninguém puder reescrever o log depois. Aqui cada registro
// carrega o hash do anterior: alterar ou remover uma linha quebra a
// cadeia a partir dali, e `verificarCadeia()` aponta exatamente onde.
//
// Os triggers do schema já recusam UPDATE e DELETE nesta tabela. A cadeia
// é a segunda trava — ela pega inclusive quem mexer no arquivo .db por
// fora do processo.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { novoId, nowISO, j } = require('./db');
const repo = require('./repo');
const tenancy = require('./tenancy');

/** Ações materiais: registrar sem motivo é recusado. */
const EXIGEM_MOTIVO = new Set([
  'periodo.reabrir', 'lote.estornar', 'titulo.cancelar', 'contraparte.dados_bancarios',
  'aprovacao.recusar', 'usuario.perfil', 'tenant.suspender', 'importacao.desfazer',
  'resultado.apurar', 'contraparte.anonimizar',
]);

function calcularHash(d) {
  return crypto.createHash('sha256').update([
    d.hashAnterior, d.seq, d.quando, d.ator, d.atorTipo, d.acao,
    d.objetoTipo, d.objetoId, d.motivo, d.detalhe,
  ].join('')).digest('hex');
}

/**
 * Registra uma ação. Nunca lança por problema de log — exceto quando a
 * própria chamada está malformada (ação sem motivo onde o motivo é
 * obrigatório), que é erro de programação e tem de aparecer no teste.
 */
function registrar(acao, { objetoTipo = '', objetoId = '', motivo = '', detalhe = {}, atorTipo = '' } = {}) {
  if (EXIGEM_MOTIVO.has(acao) && !String(motivo).trim()) {
    throw new Error(`A ação "${acao}" exige motivo — ele vai para a auditoria.`);
  }
  const ctx = tenancy.atual() || {};
  const tenantId = ctx.tenantId || '';
  const anterior = repo.ultimoAudit(tenantId);
  const registro = {
    id: novoId(),
    tenantId,
    seq: ((anterior && anterior.seq) || 0) + 1,
    quando: nowISO(),
    ator: ctx.userId || (ctx.plataforma ? 'plataforma' : 'sistema'),
    atorTipo: atorTipo || (ctx.plataforma ? 'plataforma' : (ctx.userId ? 'usuario' : 'sistema')),
    acao,
    objetoTipo, objetoId,
    motivo: String(motivo || ctx.motivo || '').slice(0, 500),
    detalhe: j.str(detalhe || {}).slice(0, 4000),
    correlationId: ctx.correlationId || '',
    origemIp: ctx.ip || '',
    hashAnterior: (anterior && anterior.hash) || '',
  };
  registro.hash = calcularHash(registro);
  repo.inserirAudit(registro);
  return registro;
}

/**
 * Recalcula a cadeia inteira de um tenant. Devolve { ok, total, quebra }
 * — `quebra` traz o primeiro registro divergente, que é onde a violação
 * começou.
 */
function verificarCadeia(tenantId) {
  const linhas = repo.auditEmOrdem(tenantId || '');
  let anterior = '';
  for (let i = 0; i < linhas.length; i++) {
    const r = linhas[i];
    if (r.hash_anterior !== anterior) {
      return { ok: false, total: linhas.length, quebra: { seq: r.seq, id: r.id, motivo: 'elo anterior não confere' } };
    }
    const esperado = calcularHash({
      hashAnterior: r.hash_anterior, seq: r.seq, quando: r.quando, ator: r.ator,
      atorTipo: r.ator_tipo, acao: r.acao, objetoTipo: r.objeto_tipo, objetoId: r.objeto_id,
      motivo: r.motivo, detalhe: r.detalhe,
    });
    if (esperado !== r.hash) {
      return { ok: false, total: linhas.length, quebra: { seq: r.seq, id: r.id, motivo: 'conteúdo alterado' } };
    }
    anterior = r.hash;
  }
  return { ok: true, total: linhas.length, quebra: null };
}

const listar = (filtros) => repo.listarAudit(filtros);

module.exports = { registrar, verificarCadeia, listar, calcularHash, EXIGEM_MOTIVO };
