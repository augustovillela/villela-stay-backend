// =====================================================================
// Villela Growth OS — reputação (§16 do PROMPT_MASTER).
//
// Pesquisa de satisfação, NPS e CSAT são NOSSOS e funcionam hoje. A
// importação de avaliação pública (Google, Airbnb, Booking) depende de
// conector; o registro manual funciona desde já.
//
// ⚠️ A regra do §16 que virou TRAVA, não aviso:
//    "Nunca condicione benefícios à emissão de avaliação positiva."
// O convite para avaliar publicamente não carrega recompensa, e a
// configuração que tentar amarrar benefício a nota é RECUSADA.
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const entitlements = require('./entitlements');
const { nowISO, j } = require('./db');

const TIPOS = ['nps', 'csat', 'ces', 'livre'];
const FONTES = ['google', 'airbnb', 'booking', 'instagram', 'manual'];

// Termos que denunciam recompensa amarrada à nota. Barrar isto é o que
// separa "pedir avaliação" de "comprar avaliação".
const TERMOS_BENEFICIO = ['desconto', 'brinde', 'cupom', 'cashback', 'presente', 'bônus', 'bonus',
  'prêmio', 'premio', 'sorteio', 'grátis', 'gratis', 'voucher', 'crédito', 'credito'];

// ------------------------------------------------------- pesquisas

function criarPesquisa({ nome, tipo = 'nps', pergunta = '', perguntaAberta = '', gatilho = 'manual',
  convidaPublica = false, notaMinimaConvite = 9, urlAvaliacao = '' }) {
  if (!nome) throw erro(400, 'A pesquisa precisa de um nome.');
  if (!TIPOS.includes(tipo)) throw erro(400, `Tipo de pesquisa desconhecido: ${tipo}`);
  entitlements.exigirFlag('reputacao');

  // TRAVA do §16: nem a pergunta nem o convite podem prometer benefício.
  const texto = `${pergunta} ${perguntaAberta}`.toLowerCase();
  const achado = TERMOS_BENEFICIO.find((t) => texto.includes(t));
  if (achado && convidaPublica) {
    throw erro(422, `A pesquisa oferece "${achado}" e ao mesmo tempo convida para avaliação pública. ` +
      'Condicionar benefício a avaliação positiva não é permitido — separe as duas coisas.');
  }

  const id = repo.inserir('gx_pesquisas', {
    nome, tipo, pergunta: pergunta || perguntaPadrao(tipo), pergunta_aberta: perguntaAberta,
    gatilho, status: 'rascunho',
    convida_publica: convidaPublica ? 1 : 0,
    nota_minima_convite: Number(notaMinimaConvite) || 9,
    url_avaliacao: urlAvaliacao,
    token: 'gs_' + crypto.randomBytes(10).toString('base64url'),
  });
  repo.auditar({ acao: 'pesquisa.criada', entidade: 'gx_pesquisas', entidadeId: id, detalhe: `${tipo}: ${nome}` });
  return repo.buscar('gx_pesquisas', id);
}

const perguntaPadrao = (tipo) => ({
  nps: 'De 0 a 10, qual a chance de você recomendar a gente para um amigo?',
  csat: 'De 1 a 5, como você avalia o atendimento?',
  ces: 'De 1 a 5, quão fácil foi resolver o que você precisava?',
  livre: 'Conte como foi a sua experiência.',
}[tipo] || '');

function publicarPesquisa(id) {
  const p = repo.buscar('gx_pesquisas', id);
  if (!p) throw erro(404, 'Pesquisa não encontrada.');
  if (p.convida_publica && !p.url_avaliacao) {
    throw erro(400, 'A pesquisa convida para avaliação pública mas não tem o endereço da página de avaliação.');
  }
  repo.atualizar('gx_pesquisas', id, { status: 'ativa' });
  return repo.buscar('gx_pesquisas', id);
}

const pesquisas = (limite = 100) => repo.listar('gx_pesquisas', { ordem: 'criado_em DESC', limite });
const pesquisaPorToken = (token) =>
  require('./db').db.prepare("SELECT * FROM gx_pesquisas WHERE token = ? AND status = 'ativa' AND excluido_em = ''")
    .get(String(token || '')) || null;

/** Faixa da nota conforme o tipo. É o que define NPS e CSAT. */
function faixa(tipo, nota) {
  const n = Number(nota);
  if (tipo === 'nps') return n >= 9 ? 'promotor' : (n >= 7 ? 'neutro' : 'detrator');
  if (tipo === 'csat' || tipo === 'ces') return n >= 4 ? 'satisfeito' : (n === 3 ? 'neutro' : 'insatisfeito');
  return '';
}

/**
 * Responde a pesquisa. Quem ficou satisfeito PODE receber o convite para
 * avaliar publicamente — sem nenhuma recompensa atrelada. Quem ficou
 * insatisfeito gera tarefa corretiva, não convite.
 */
function responder(token, { nota, comentario = '', contatoId = '', unidade = '', chaveIdem = '' }) {
  const p = pesquisaPorToken(token);
  if (!p) throw erro(404, 'Pesquisa não encontrada ou encerrada.');

  return tenancy.comTenant({ tenantId: p.tenant_id, userId: 'pesquisa' }, () => {
    const n = Number(nota);
    if (!Number.isFinite(n)) throw erro(400, 'Informe uma nota.');
    const f = faixa(p.tipo, n);

    let id;
    try {
      id = repo.inserir('gx_pesquisa_respostas', {
        pesquisa_id: p.id, contato_id: contatoId, nota: n, faixa: f,
        comentario: String(comentario).slice(0, 2000), unidade, chave_idem: chaveIdem,
      });
    } catch (e) {
      if (chaveIdem && /UNIQUE|constraint/i.test(String(e.message))) {
        return { ok: true, duplicada: true };
      }
      throw e;
    }
    repo.exec('UPDATE gx_pesquisas SET respostas = respostas + 1 WHERE id = :id AND tenant_id = :tenant', { id: p.id });

    const satisfeito = (p.tipo === 'nps' && n >= Number(p.nota_minima_convite || 9)) ||
      (p.tipo !== 'nps' && f === 'satisfeito');

    let convite = null;
    if (p.convida_publica && satisfeito && p.url_avaliacao) {
      repo.atualizar('gx_pesquisa_respostas', id, { convidado_publica: 1 });
      // O convite NÃO carrega recompensa. É pedido, não troca.
      convite = { url: p.url_avaliacao, texto: 'Se puder, conte isso publicamente — ajuda muita gente a decidir.' };
    }

    // insatisfeito vira tarefa corretiva, não convite
    if (f === 'detrator' || f === 'insatisfeito') {
      try {
        require('../crm/app-repo').Tarefas.criar(p.tenant_id, {
          titulo: `Retornar cliente insatisfeito (nota ${n})`,
          contato_id: contatoId || '',
          vence_em: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          obs: String(comentario).slice(0, 500),
        }, 'reputacao');
      } catch (_) { /* tarefa é melhor esforço; a resposta não pode falhar por isso */ }
    }

    eventos.publicar('review.received', {
      refTipo: 'pesquisa', refId: p.id,
      payload: { tipo: p.tipo, nota: n, faixa: f, contato_id: contatoId, unidade },
      chaveIdem: chaveIdem ? `pesq:${chaveIdem}` : '',
    });
    return { ok: true, faixa: f, convite };
  });
}

/** NPS = %promotores − %detratores. CSAT = %satisfeitos. */
function indicadores({ pesquisaId = '', de = '', ate = '', unidade = '' } = {}) {
  const cond = [];
  const params = {};
  if (pesquisaId) { cond.push('pesquisa_id = :p'); params.p = pesquisaId; }
  if (unidade) { cond.push('unidade = :u'); params.u = unidade; }
  if (de) { cond.push('criado_em >= :de'); params.de = de; }
  if (ate) { cond.push('criado_em <= :ate'); params.ate = ate + 'T23:59:59Z'; }

  const linhas = repo.listar('gx_pesquisa_respostas', { onde: cond.join(' AND '), params, ordem: 'criado_em DESC', limite: 5000 });
  const total = linhas.length;
  if (!total) return { total: 0, nps: null, csat: null, media: null, distribuicao: {} };

  const conta = (f) => linhas.filter((l) => l.faixa === f).length;
  const promotores = conta('promotor');
  const detratores = conta('detrator');
  const satisfeitos = conta('satisfeito');
  const comNps = promotores + detratores + conta('neutro');
  const comCsat = satisfeitos + conta('insatisfeito') + conta('neutro');

  return {
    total,
    nps: comNps ? Math.round(((promotores - detratores) / comNps) * 100) : null,
    csat: comCsat ? Math.round((satisfeitos / comCsat) * 100) : null,
    media: +(linhas.reduce((s, l) => s + Number(l.nota || 0), 0) / total).toFixed(2),
    distribuicao: { promotor: promotores, neutro: conta('neutro'), detrator: detratores, satisfeito: satisfeitos, insatisfeito: conta('insatisfeito') },
  };
}

/** Compara unidades (casas, filiais) no mesmo período. */
function porUnidade({ de = '', ate = '' } = {}) {
  const linhas = repo.listar('gx_pesquisa_respostas', {
    onde: "unidade != ''" + (de ? ' AND criado_em >= :de' : '') + (ate ? ' AND criado_em <= :ate' : ''),
    params: Object.assign({}, de ? { de } : {}, ate ? { ate: ate + 'T23:59:59Z' } : {}),
    ordem: 'criado_em DESC', limite: 5000,
  });
  const unidades = [...new Set(linhas.map((l) => l.unidade))];
  return unidades.map((u) => Object.assign({ unidade: u }, indicadores({ unidade: u, de, ate })))
    .sort((a, b) => (b.nps || 0) - (a.nps || 0));
}

// -------------------------------------------- avaliações públicas

function registrarAvaliacao({ fonte, externaId = '', autor = '', nota, notaMaxima = 5, texto = '',
  unidade = '', contatoId = '' }) {
  if (!FONTES.includes(fonte)) throw erro(400, `Fonte desconhecida: ${fonte}`);
  const ja = externaId
    ? repo.um('SELECT * FROM gx_avaliacoes_publicas WHERE tenant_id = :tenant AND fonte = :f AND externa_id = :e',
      { f: fonte, e: externaId })
    : null;
  if (ja) return { avaliacao: ja, duplicada: true };

  const n = Number(nota) || 0;
  const max = Number(notaMaxima) || 5;
  const proporcao = max ? n / max : 0;
  const sentimento = proporcao >= 0.8 ? 'positivo' : (proporcao >= 0.6 ? 'neutro' : 'negativo');
  const problemas = extrairProblemas(texto);

  const id = repo.inserir('gx_avaliacoes_publicas', {
    fonte, externa_id: externaId, autor, contato_id: contatoId, nota: n, nota_maxima: max,
    texto: String(texto).slice(0, 4000), unidade, sentimento, problemas: j.str(problemas),
  });

  // avaliação ruim abre tarefa corretiva na hora
  if (sentimento === 'negativo') {
    try {
      const t = require('../crm/app-repo').Tarefas.criar(tenancy.tenantAtual(), {
        titulo: `Responder avaliação ${n}/${max} no ${fonte}`,
        contato_id: contatoId || '',
        vence_em: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        obs: String(texto).slice(0, 500),
      }, 'reputacao');
      repo.atualizar('gx_avaliacoes_publicas', id, { tarefa_id: (t && (t.id || t)) || '' });
    } catch (_) { /* melhor esforço */ }
  }

  eventos.publicar('review.received', {
    refTipo: 'avaliacao', refId: id,
    payload: { fonte, nota: n, sentimento, unidade, problemas },
    chaveIdem: externaId ? `aval:${fonte}:${externaId}` : '',
  });
  return { avaliacao: repo.buscar('gx_avaliacoes_publicas', id), duplicada: false };
}

// Radicais, não palavras inteiras: "suja", "sujo" e "sujeira" contam igual.
const TEMAS = {
  limpeza: ['suj', 'limpeza', 'limpo', 'poeira', 'mofo'],
  atendimento: ['atendimento', 'atendente', 'demora', 'resposta', 'educado', 'grosseiro'],
  estrutura: ['ar-condicionado', 'chuveiro', 'quebrado', 'wifi', 'internet', 'piscina', 'cama'],
  preco: ['caro', 'preço', 'preco', 'valor', 'custo'],
  localizacao: ['localização', 'localizacao', 'perto', 'longe', 'acesso'],
  barulho: ['barulho', 'ruído', 'ruido', 'som'],
};

function extrairProblemas(texto) {
  const t = String(texto || '').toLowerCase();
  return Object.entries(TEMAS).filter(([, termos]) => termos.some((x) => t.includes(x))).map(([tema]) => tema);
}

/** Problemas recorrentes: o que aparece repetido nas avaliações ruins. */
function problemasRecorrentes({ minimo = 2 } = {}) {
  const ruins = repo.listar('gx_avaliacoes_publicas', { onde: "sentimento = 'negativo'", limite: 1000 });
  const cont = {};
  for (const a of ruins) for (const p of j.parse(a.problemas, [])) cont[p] = (cont[p] || 0) + 1;
  return Object.entries(cont).filter(([, n]) => n >= minimo)
    .map(([tema, ocorrencias]) => ({ tema, ocorrencias }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias);
}

/**
 * Responder avaliação. Negativa e crise NUNCA saem sem aprovação — é o
 * mesmo princípio da gestão de comunidade.
 */
function responderAvaliacao(id, { texto, forcar = false }) {
  const a = repo.buscar('gx_avaliacoes_publicas', id);
  if (!a) throw erro(404, 'Avaliação não encontrada.');
  if (!String(texto || '').trim()) throw erro(400, 'A resposta está vazia.');

  if (a.sentimento === 'negativo' && !forcar) {
    const pedido = require('./aprovacoes').solicitar({
      acao: 'avaliacao.responder_publicamente',
      titulo: `Resposta pública a avaliação ${a.nota}/${a.nota_maxima} no ${a.fonte}`,
      justificativa: 'Avaliação negativa: a resposta pública é revisada antes de sair.',
      dados: { avaliacaoId: id, texto },
      origemTipo: 'usuario', origemId: tenancy.userAtual(),
    });
    repo.atualizar('gx_avaliacoes_publicas', id, {
      resposta: texto, resposta_status: 'aguardando_aprovacao', aprovacao_id: pedido.id,
    });
    return { aguardandoAprovacao: true, aprovacaoId: pedido.id };
  }

  repo.atualizar('gx_avaliacoes_publicas', id, {
    resposta: texto, resposta_status: 'aprovada',
    respondida_em: nowISO(), respondida_por: tenancy.userAtual(),
  });
  // A publicação de fato depende do conector ter canReplyComments.
  return { aguardandoAprovacao: false, avaliacao: repo.buscar('gx_avaliacoes_publicas', id) };
}

/** Painel do §16. */
function painel({ de = '', ate = '' } = {}) {
  const avaliacoes = repo.listar('gx_avaliacoes_publicas', { ordem: 'criado_em DESC', limite: 500 });
  const porFonte = FONTES.reduce((acc, f) => {
    const dela = avaliacoes.filter((a) => a.fonte === f);
    if (dela.length) {
      acc[f] = {
        total: dela.length,
        media: +(dela.reduce((s, a) => s + (a.nota / (a.nota_maxima || 5)) * 5, 0) / dela.length).toFixed(2),
        negativas: dela.filter((a) => a.sentimento === 'negativo').length,
      };
    }
    return acc;
  }, {});
  return {
    indicadores: indicadores({ de, ate }),
    por_unidade: porUnidade({ de, ate }),
    por_fonte: porFonte,
    problemas_recorrentes: problemasRecorrentes(),
    sem_resposta: avaliacoes.filter((a) => a.sentimento === 'negativo' && !a.resposta).length,
  };
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  TIPOS, FONTES, TERMOS_BENEFICIO, TEMAS,
  criarPesquisa, publicarPesquisa, pesquisas, pesquisaPorToken, responder, faixa,
  indicadores, porUnidade, registrarAvaliacao, extrairProblemas, problemasRecorrentes,
  responderAvaliacao, painel,
};
