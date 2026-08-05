// =====================================================================
// Villela Growth OS — central de aprovações e níveis de autonomia
// (§20 do PROMPT_MASTER).
//
// Ação de risco não é executada e depois desfeita: ela NASCE como pedido.
// O nível é atributo do agente E da ação — vence o mais restritivo.
// Nível 4 é barrado aqui, no serviço, nunca só na interface.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const fila = require('./fila');
const { nowISO, j } = require('./db');

const NIVEIS = {
  0: 'somente leitura',
  1: 'analisar e sugerir',
  2: 'executar ações de baixo risco',
  3: 'solicitar aprovação antes de executar',
  4: 'ação proibida',
};

/**
 * Catálogo de ações e o nível MÍNIMO exigido de quem as executa.
 * Ação fora do catálogo é tratada como nível 3 — o desconhecido pede
 * aprovação, não passa direto.
 */
const ACOES = {
  'conversa.resumir': 1, 'conversa.classificar': 1, 'metrica.calcular': 1,
  'rascunho.criar': 2, 'tarefa.criar': 2, 'oportunidade.mover': 2,
  'contato.atualizar': 2, 'resposta.enviar_template_aprovado': 2,
  'mensagem.enviar_livre': 3, 'campanha.disparar': 3, 'conteudo.publicar': 3,
  'proposta.enviar': 3, 'anuncio.criar': 3, 'anuncio.orcamento_alterar': 3,
  'servico.contratar': 3, 'dados.excluir': 3, 'permissao.alterar': 3,
  'avaliacao.responder_publicamente': 3,
  'tenant.acessar_outro': 4, 'politica.contornar': 4, 'preco.inventar': 4,
  'mensagem.enviar_fora_da_janela': 4, 'opt_out.ignorar': 4,
};

const nivelDaAcao = (acao) => (ACOES[acao] === undefined ? 3 : ACOES[acao]);

/**
 * Decide o que fazer com uma ação proposta.
 * `nivelAutor` é o teto de autonomia de quem propõe (agente ou automação).
 * Devolve { permitido, precisaAprovacao, nivel, motivo }.
 */
function avaliar(acao, nivelAutor = 1) {
  const nivelAcao = nivelDaAcao(acao);
  if (nivelAcao === 4) {
    return { permitido: false, precisaAprovacao: false, nivel: 4, motivo: `Ação proibida: ${acao}.` };
  }
  if (nivelAcao === 3) {
    return { permitido: true, precisaAprovacao: true, nivel: 3, motivo: 'Ação de risco: exige aprovação humana.' };
  }
  if (nivelAutor < nivelAcao) {
    return { permitido: true, precisaAprovacao: true, nivel: nivelAcao, motivo: `Autor tem autonomia ${nivelAutor}, ação exige ${nivelAcao}.` };
  }
  return { permitido: true, precisaAprovacao: false, nivel: nivelAcao, motivo: '' };
}

/** Cria o pedido de aprovação. Nunca executa nada por conta própria. */
function solicitar({
  acao, titulo = '', justificativa = '', dados = {}, impacto = '',
  custoCentavos = 0, prazo = '', origemTipo = 'agente', origemId = '',
}) {
  if (!acao) throw erro(400, 'Pedido de aprovação precisa de ação.');
  const nivel = nivelDaAcao(acao);
  if (nivel === 4) throw erro(403, `Ação proibida, não é aprovável: ${acao}.`);

  const id = repo.inserir('gx_aprovacoes', {
    origem_tipo: origemTipo, origem_id: origemId, acao, nivel,
    titulo: titulo || acao, justificativa, dados: j.str(dados), impacto,
    custo_centavos: Number(custoCentavos) || 0, prazo,
    status: 'pendente', correlation_id: tenancy.correlationId(),
  });
  repo.auditar({ acao: 'aprovacao.solicitada', entidade: 'gx_aprovacoes', entidadeId: id, detalhe: acao });
  require('./eventos').publicar('approval.requested', {
    refTipo: 'aprovacao', refId: id,
    payload: { acao, nivel, custo_centavos: Number(custoCentavos) || 0, origem_tipo: origemTipo },
    chaveIdem: `aprov:${id}`, origem: origemTipo,
  });
  return repo.buscar('gx_aprovacoes', id);
}

/**
 * Decisão humana. `decisao`: aprovar | rejeitar | editar_aprovar.
 * Aprovar não executa aqui — enfileira o job da ação, para a execução ter
 * retry, timeout e DLQ como qualquer outro trabalho.
 */
function decidir(id, { decisao, obs = '', dadosEditados = null, quem = null }) {
  const pedido = repo.buscar('gx_aprovacoes', id);
  if (!pedido) throw erro(404, 'Pedido de aprovação não encontrado.');
  if (pedido.status !== 'pendente') throw erro(409, `Este pedido já foi ${pedido.status}.`);

  const decisor = quem || tenancy.userAtual();
  if (decisao === 'rejeitar') {
    repo.atualizar('gx_aprovacoes', id, { status: 'rejeitada', decidido_por: decisor, decidido_em: nowISO(), decisao_obs: obs });
    registrarDecisao(pedido, 'rejeitada', decisor, obs);
    return repo.buscar('gx_aprovacoes', id);
  }
  if (decisao !== 'aprovar' && decisao !== 'editar_aprovar') {
    throw erro(400, 'Decisão inválida. Use aprovar, rejeitar ou editar_aprovar.');
  }

  const dadosFinais = decisao === 'editar_aprovar' && dadosEditados ? dadosEditados : j.parse(pedido.dados, {});
  const jobId = fila.enfileirar({
    tipo: `aprovacao:${pedido.acao}`, fila: 'aprovadas', prioridade: 3,
    payload: { aprovacaoId: id, acao: pedido.acao, dados: dadosFinais },
    chaveIdem: `aprov-exec:${id}`, correlationId: pedido.correlation_id,
  });

  repo.atualizar('gx_aprovacoes', id, {
    status: 'aprovada', decidido_por: decisor, decidido_em: nowISO(), decisao_obs: obs,
    dados_editados: decisao === 'editar_aprovar' ? j.str(dadosFinais) : '',
    job_id: jobId || '',
  });
  registrarDecisao(pedido, 'aprovada', decisor, obs);
  return repo.buscar('gx_aprovacoes', id);
}

function registrarDecisao(pedido, status, decisor, obs) {
  repo.auditar({ acao: `aprovacao.${status}`, entidade: 'gx_aprovacoes', entidadeId: pedido.id, detalhe: `${pedido.acao} · ${obs}`, quem: decisor });
  require('./eventos').publicar('approval.decided', {
    refTipo: 'aprovacao', refId: pedido.id,
    payload: { acao: pedido.acao, status, decidido_por: decisor },
    chaveIdem: `aprov-dec:${pedido.id}`, origem: 'api',
  });
}

/** Marca o desfecho da execução (chamado pelo handler do job). */
function registrarExecucao(id, { ok, resultado = '' }) {
  repo.atualizar('gx_aprovacoes', id, {
    status: ok ? 'executada' : 'falhou',
    executada_em: nowISO(),
    resultado: typeof resultado === 'string' ? resultado : j.str(resultado),
  });
  return repo.buscar('gx_aprovacoes', id);
}

const pendentes = (limite = 100) =>
  repo.listar('gx_aprovacoes', { onde: "status = 'pendente'", ordem: 'criado_em ASC', limite });

/** Pedido vencido vira `expirada` — não fica pendente para sempre. */
function expirarVencidos() {
  const agora = nowISO();
  const vencidos = repo.listar('gx_aprovacoes', { onde: "status = 'pendente' AND prazo != '' AND prazo < :agora", params: { agora }, limite: 500 });
  for (const p of vencidos) repo.atualizar('gx_aprovacoes', p.id, { status: 'expirada', decidido_em: agora });
  return vencidos.length;
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = { NIVEIS, ACOES, nivelDaAcao, avaliar, solicitar, decidir, registrarExecucao, pendentes, expirarVencidos };
