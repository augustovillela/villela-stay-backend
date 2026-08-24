// =====================================================================
// Villela Finance — caixa de aprovações (maker-checker).
//
// Ação material não roda direto: vira uma SOLICITAÇÃO com prévia do
// impacto. Outra pessoa, com alçada, decide. Só então o executor roda.
//
// Três coisas que este arquivo garante e que costumam faltar:
//   1. a prévia é calculada NA SOLICITAÇÃO e guardada — o aprovador vê o
//      que foi prometido, não um recálculo feito depois;
//   2. o executor roda UMA vez (status muda antes de executar);
//   3. falha na execução não fica silenciosa: vira status `falhou` com o
//      erro, e a solicitação continua visível.
// =====================================================================
'use strict';
const { transacao, nowISO, j } = require('./db');
const repo = require('./repo');
const rbac = require('./rbac');
const tenancy = require('./tenancy');
const auditoria = require('./auditoria');
const dinheiro = require('./dinheiro');

const EXECUTORES = new Map();

/** Registra quem sabe executar uma ação aprovada. */
const registrarExecutor = (acao, fn) => { EXECUTORES.set(acao, fn); };

class ErroDeAprovacao extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDeAprovacao'; this.status = 400; }
}

const HORAS_PADRAO = 72;

/**
 * Abre uma solicitação. `previa` deve descrever o impacto em linguagem
 * de quem decide — valor, contraparte, conta, o que muda.
 */
function solicitar({ acao, entidadeId = '', objetoTipo = '', objetoId = '', payload = {}, previa = {}, valorCents = 0, motivo = '', horasParaExpirar = HORAS_PADRAO }) {
  const catalogo = rbac.acao(acao);
  if (!catalogo) throw new ErroDeAprovacao(`Ação desconhecida: ${acao}.`);
  const nivel = rbac.nivelDe(acao);
  if (nivel >= rbac.NIVEIS.PROIBIDA) throw new rbac.ErroDePermissao(catalogo.motivo || 'Ação não autorizada.');
  if (nivel < rbac.NIVEIS.MATERIAL) {
    throw new ErroDeAprovacao(`A ação "${acao}" é de nível ${nivel} e não passa por aprovação — execute direto.`);
  }
  if (!String(motivo).trim()) throw new ErroDeAprovacao('Descreva o motivo da solicitação — o aprovador precisa dele.');
  dinheiro.centavos(valorCents, 'valor da solicitação');

  const expira = new Date(Date.now() + Math.max(1, horasParaExpirar) * 3600_000).toISOString();
  const solicitacao = transacao(() => {
    const a = repo.criarAprovacao({ acao, entidadeId, nivel, objetoTipo, objetoId, payload, previa, valorCents, motivo, expiraEm: expira });
    auditoria.registrar('aprovacao.solicitar', {
      objetoTipo: 'aprovacao', objetoId: a.id, motivo,
      detalhe: { acao, nivel, valor_cents: valorCents, objeto: `${objetoTipo}:${objetoId}` },
    });
    return a;
  });
  return solicitacao;
}

/** Decide e, se aprovada, executa. O executor roda FORA da transação. */
async function aprovar(id, { motivo = '', perfilDecisor, usuarioDecisor, mfa = false } = {}) {
  const a = repo.aprovacao(id);
  if (!a) throw new ErroDeAprovacao('Solicitação não encontrada.');
  if (a.status !== 'pendente') throw new ErroDeAprovacao(`Esta solicitação já está ${a.status}.`);
  if (a.expira_em && a.expira_em < nowISO()) {
    repo.decidirAprovacao(id, { status: 'expirada', decisor: usuarioDecisor || '', motivo: 'expirou antes da decisão' });
    throw new ErroDeAprovacao('Esta solicitação expirou. Peça de novo, com a prévia atualizada.');
  }
  if (!mfa) throw new ErroDeAprovacao('Aprovar ação material exige segundo fator de autenticação.');

  const veredito = rbac.podeAprovar({
    perfilDecisor: perfilDecisor || tenancy.perfilAtual(),
    usuarioDecisor: usuarioDecisor || tenancy.userAtual(),
    usuarioSolicitante: a.solicitante,
    valorCents: a.valor_cents,
  });
  if (!veredito.pode) throw new rbac.ErroDePermissao(veredito.motivo);

  // Muda o status ANTES de executar: se o executor demorar ou o processo
  // cair, ninguém aprova de novo e ninguém executa duas vezes.
  transacao(() => {
    const r = repo.decidirAprovacao(id, { status: 'aprovada', decisor: usuarioDecisor || tenancy.userAtual(), motivo });
    if (!r.changes) throw new ErroDeAprovacao('A solicitação mudou de estado — recarregue a caixa de aprovações.');
    auditoria.registrar('aprovacao.aprovar', {
      objetoTipo: 'aprovacao', objetoId: id, motivo,
      detalhe: { acao: a.acao, valor_cents: a.valor_cents, solicitante: a.solicitante },
    });
  });

  const executor = EXECUTORES.get(a.acao);
  if (!executor) {
    repo.registrarExecucao(id, { status: 'falhou', resultado: { erro: `Sem executor registrado para "${a.acao}".` } });
    throw new ErroDeAprovacao(`Aprovada, mas não há executor registrado para "${a.acao}". Nada foi feito.`);
  }

  try {
    const resultado = await executor(j.parse(a.payload, {}), a);
    repo.registrarExecucao(id, { status: 'executada', resultado: resultado || {} });
    auditoria.registrar('aprovacao.executar', {
      objetoTipo: 'aprovacao', objetoId: id,
      detalhe: { acao: a.acao, resultado: resultado || {} },
    });
    return { ok: true, aprovacao: repo.aprovacao(id), resultado };
  } catch (e) {
    repo.registrarExecucao(id, { status: 'falhou', resultado: { erro: String(e.message).slice(0, 500) } });
    auditoria.registrar('aprovacao.falhar', {
      objetoTipo: 'aprovacao', objetoId: id,
      detalhe: { acao: a.acao, erro: String(e.message).slice(0, 300) },
    });
    throw e;
  }
}

function recusar(id, { motivo = '', usuarioDecisor, perfilDecisor } = {}) {
  if (!String(motivo).trim()) throw new ErroDeAprovacao('Recusa exige motivo — quem pediu precisa saber por quê.');
  const a = repo.aprovacao(id);
  if (!a) throw new ErroDeAprovacao('Solicitação não encontrada.');
  if (a.status !== 'pendente') throw new ErroDeAprovacao(`Esta solicitação já está ${a.status}.`);

  const veredito = rbac.podeAprovar({
    perfilDecisor: perfilDecisor || tenancy.perfilAtual(),
    usuarioDecisor: usuarioDecisor || tenancy.userAtual(),
    usuarioSolicitante: a.solicitante,
    valorCents: 0,                        // recusar não consome alçada
  });
  if (!veredito.pode) throw new rbac.ErroDePermissao(veredito.motivo);

  return transacao(() => {
    repo.decidirAprovacao(id, { status: 'recusada', decisor: usuarioDecisor || tenancy.userAtual(), motivo });
    auditoria.registrar('aprovacao.recusar', {
      objetoTipo: 'aprovacao', objetoId: id, motivo,
      detalhe: { acao: a.acao, solicitante: a.solicitante },
    });
    return repo.aprovacao(id);
  });
}

const pendentes = (limite = 100) => repo.listarAprovacoes('pendente', limite);
const listar = (status = '', limite = 100) => repo.listarAprovacoes(status, limite);
const expirarVencidas = () => repo.expirarAprovacoesVencidas(nowISO());

module.exports = {
  ErroDeAprovacao, registrarExecutor, solicitar, aprovar, recusar,
  pendentes, listar, expirarVencidas, EXECUTORES,
};
