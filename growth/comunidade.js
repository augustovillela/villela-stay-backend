// =====================================================================
// Villela Growth OS — gestão de comunidade (§14 do PROMPT_MASTER).
//
// Comentário, menção e avaliação que chegam pelo lado público. A parte
// que importa não é listar: é a TRIAGEM. Cinco categorias nunca são
// respondidas por automação nem por agente sozinho —
//   crise · jurídico · cliente irritado · influenciador · alto valor
// — e o §14 é explícito: essas exigem aprovação humana antes da resposta.
//
// A classificação usa o mesmo motor de regras dos agentes, para o
// vocabulário ser um só no produto inteiro.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const agentes = require('./agentes');
const { nowISO, j } = require('./db');

const FILAS = ['crise', 'juridico', 'irritado', 'influenciador', 'alto_valor', 'padrao'];
const CLASSES = ['elogio', 'duvida', 'preco', 'reclamacao', 'crise', 'spam', 'oportunidade', 'suporte', 'compra'];

// Filas que NÃO podem ser respondidas sem uma pessoa aprovar.
const EXIGEM_HUMANO = ['crise', 'juridico', 'irritado', 'influenciador', 'alto_valor'];

const TERMOS_CRISE = ['processo', 'advogado', 'procon', 'imprensa', 'jornalista', 'denúncia', 'denuncia',
  'golpe', 'fraude', 'polícia', 'policia', 'boletim de ocorrência', 'vou expor', 'reclame aqui'];
const TERMOS_IRRITADO = ['absurdo', 'péssimo', 'pessimo', 'vergonha', 'nunca mais', 'horrível', 'horrivel',
  'inaceitável', 'inaceitavel', 'descaso', 'lixo'];

/**
 * Registra a interação e faz a triagem. Idempotente pelo id externo — a
 * mesma menção reentregue não vira duas.
 */
function registrar({ rede, tipo = 'comentario', externaId = '', publicacaoId = '', autorExterno = '',
  autorHandle = '', texto = '', contatoId = '', seguidores = 0, valorCliente = 0 }) {
  if (!rede) throw erro(400, 'A interação precisa da rede de origem.');

  if (externaId) {
    const ja = repo.um('SELECT * FROM gx_interacoes WHERE tenant_id = :tenant AND rede = :r AND externa_id = :e',
      { r: rede, e: externaId });
    if (ja) return { interacao: ja, duplicada: true };
  }

  const triagem = triar(texto, { seguidores, valorCliente });
  let id;
  try {
    id = repo.inserir('gx_interacoes', {
      rede, tipo, externa_id: externaId, publicacao_id: publicacaoId,
      autor_externo: autorExterno, autor_handle: autorHandle, contato_id: contatoId,
      texto: String(texto).slice(0, 4000),
      classificacao: triagem.classe, sentimento: triagem.sentimento,
      prioridade: triagem.prioridade, fila: triagem.fila,
      exige_aprovacao: triagem.exigeAprovacao ? 1 : 0, status: 'aberta',
    });
  } catch (e) {
    if (externaId && /UNIQUE|constraint/i.test(String(e.message))) {
      const ja = repo.um('SELECT * FROM gx_interacoes WHERE tenant_id = :tenant AND rede = :r AND externa_id = :e',
        { r: rede, e: externaId });
      return { interacao: ja, duplicada: true };
    }
    throw e;
  }

  if (triagem.fila === 'crise') {
    require('./incidentes').abrir({
      natureza: 'externo', severidade: 'alta',
      titulo: `Possível crise no ${rede}`,
      detalhe: String(texto).slice(0, 300), refTipo: 'interacao', refId: id,
    });
  }
  eventos.publicar('review.received', {
    refTipo: 'interacao', refId: id,
    payload: { rede, tipo, classe: triagem.classe, fila: triagem.fila, exige_aprovacao: triagem.exigeAprovacao },
    chaveIdem: externaId ? `inter:${rede}:${externaId}` : '', origem: 'webhook',
  });
  return { interacao: repo.buscar('gx_interacoes', id), duplicada: false, triagem };
}

/**
 * Triagem. Ordem importa: crise vence tudo, porque o custo de tratar um
 * elogio como crise é baixo e o inverso é caro.
 */
function triar(texto, { seguidores = 0, valorCliente = 0 } = {}) {
  const t = String(texto || '').toLowerCase();
  const classe = agentes.classificar(texto);

  if (TERMOS_CRISE.some((x) => t.includes(x))) {
    return { classe: 'crise', sentimento: 'negativo', fila: 'crise', prioridade: 'alta', exigeAprovacao: true };
  }
  if (classe === 'juridico') {
    return { classe: 'reclamacao', sentimento: 'negativo', fila: 'juridico', prioridade: 'alta', exigeAprovacao: true };
  }
  if (TERMOS_IRRITADO.some((x) => t.includes(x)) || classe === 'reclamacao') {
    return { classe: 'reclamacao', sentimento: 'negativo', fila: 'irritado', prioridade: 'alta', exigeAprovacao: true };
  }
  if (seguidores >= 10000) {
    return { classe, sentimento: 'neutro', fila: 'influenciador', prioridade: 'alta', exigeAprovacao: true };
  }
  if (valorCliente >= 500000) {   // R$ 5.000 em centavos
    return { classe, sentimento: 'neutro', fila: 'alto_valor', prioridade: 'alta', exigeAprovacao: true };
  }
  if (classe === 'preco' || classe === 'compra') {
    return { classe: classe === 'compra' ? 'oportunidade' : 'preco', sentimento: 'positivo', fila: 'padrao', prioridade: 'alta', exigeAprovacao: false };
  }
  if (classe === 'suporte' || classe === 'duvida') {
    return { classe: 'duvida', sentimento: 'neutro', fila: 'padrao', prioridade: 'media', exigeAprovacao: false };
  }
  return { classe: 'elogio', sentimento: 'positivo', fila: 'padrao', prioridade: 'baixa', exigeAprovacao: false };
}

/**
 * Responder. Se a fila exige humano, a resposta NÃO sai direto: vira
 * pedido na central de aprovações — mesmo vinda de um usuário logado,
 * porque o §14 pede aprovação para essas categorias.
 */
function responder(id, { texto, autorId = null, forcar = false }) {
  const i = repo.buscar('gx_interacoes', id);
  if (!i) throw erro(404, 'Interação não encontrada.');
  if (i.status === 'respondida') throw erro(409, 'Esta interação já foi respondida.');
  if (!String(texto || '').trim()) throw erro(400, 'A resposta está vazia.');
  const autor = autorId || tenancy.userAtual();

  if (i.exige_aprovacao && !forcar) {
    const pedido = require('./aprovacoes').solicitar({
      acao: 'avaliacao.responder_publicamente',
      titulo: `Resposta pública na fila "${i.fila}" (${i.rede})`,
      justificativa: `Interação classificada como "${i.classificacao}" exige revisão antes de sair.`,
      dados: { interacaoId: id, texto, rede: i.rede },
      origemTipo: 'usuario', origemId: autor,
    });
    repo.atualizar('gx_interacoes', id, { status: 'escalada', resposta: texto });
    return { aguardandoAprovacao: true, aprovacaoId: pedido.id, interacao: repo.buscar('gx_interacoes', id) };
  }

  repo.atualizar('gx_interacoes', id, {
    status: 'respondida', resposta: texto, respondida_por: autor, respondida_em: nowISO(),
  });
  repo.auditar({ acao: 'comunidade.respondida', entidade: 'gx_interacoes', entidadeId: id, detalhe: i.fila });
  // A entrega depende do conector ter canReplyComments — enquanto nenhuma
  // rede está conectada, fica registrado como resposta preparada.
  return { aguardandoAprovacao: false, interacao: repo.buscar('gx_interacoes', id) };
}

const caixa = ({ fila = '', status = 'aberta', rede = '', limite = 100 } = {}) => {
  const cond = [];
  const params = {};
  if (status && status !== 'todas') { cond.push('status = :st'); params.st = status; }
  if (fila) { cond.push('fila = :fi'); params.fi = fila; }
  if (rede) { cond.push('rede = :re'); params.re = rede; }
  return repo.listar('gx_interacoes', {
    onde: cond.join(' AND '), params,
    ordem: "CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, criado_em DESC",
    limite,
  });
};

/** Painel: quanto tem em cada fila e o que está esperando pessoa. */
function panorama() {
  const abertas = caixa({ status: 'aberta', limite: 500 });
  const porFila = FILAS.reduce((acc, f) => { acc[f] = abertas.filter((i) => i.fila === f).length; return acc; }, {});
  return {
    abertas: abertas.length,
    por_fila: porFila,
    exigem_humano: abertas.filter((i) => i.exige_aprovacao).length,
    escaladas: caixa({ status: 'escalada', limite: 200 }).length,
  };
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = { FILAS, CLASSES, EXIGEM_HUMANO, registrar, triar, responder, caixa, panorama };
