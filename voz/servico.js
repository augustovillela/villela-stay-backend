// =====================================================================
// Voz — o orquestrador. É aqui que moram as DUAS funções do contrato
// (plano §3), e a assimetria entre elas é a arquitetura:
//
//   consultar  — síncrono, somente leitura, responde na hora.
//   executar   — SEMPRE assíncrono, NUNCA devolve o resultado.
//
// ⚠️ Nunca criar uma terceira função que escreve e devolve o resultado
// junto. No instante em que ela existir, o modelo de voz vai preferi-la
// — e somem, de uma vez, o rastro, o orçamento de latência e a
// aprovação. Se um dia isso parecer uma boa ideia, releia esta linha.
// =====================================================================
'use strict';
const acoes = require('./acoes');
const repo = require('./repo');
const fila = require('./fila');
const cerebro = require('./cerebro');
const executor = require('./executor');
const aprovacoes = require('./aprovacoes');
const notificar = require('./notificar');
const { nowISO } = require('./db');

const TIPO_JOB = 'voz.executar';
// Abaixo disto, o cérebro não entendeu bem o bastante para agir. Voz
// erra muito mais que teclado: um "manda pro Ceará" que virou "manda pro
// Cesar" tem que parar aqui, não na caixa de entrada de alguém.
const LIMIAR_CONFIANCA = Number(process.env.VOZ_LIMIAR_CONFIANCA || 0.4);
const EXECUTAR_LIGADO = () => String(process.env.VOZ_EXECUTAR || 'on').toLowerCase() !== 'off';

// ---------------------------------------------------------------------
// Fala padrão. Curta, porque vai ser dita em voz alta.
// ---------------------------------------------------------------------
const FALAS = {
  naoEntendi: 'Não entendi o pedido. Pode repetir de outro jeito?',
  desligado: 'As ações por voz estão desligadas no momento. Só consulta.',
  cuidando: 'Certo, estou cuidando disso. Te aviso no WhatsApp.',
  autorizacao: 'Isso precisa da sua autorização. Mandei o link no WhatsApp.',
  semCodigo: 'Implementar isso eu ainda não consigo sozinho. Anotei o pedido e ele está no painel.',
  demorou: 'Essa resposta vai demorar. Mando no WhatsApp.',
  jaPendente: 'Esse pedido já está esperando autorização. Use o link que te mandei.',
  autorizaPeloLink: 'Autorização não se faz por mensagem — é no link, que exige o seu login. Mandei de novo.',
};

/**
 * "autorizo", "pode", "sim" — a resposta natural de quem recebe um
 * pedido de autorização por mensagem.
 *
 * Só é tratada como tentativa de autorizar quando existe autorização
 * ESPERANDO; fora disso, "pode" é uma frase qualquer e segue para o
 * cérebro. Sem essa guarda, um "sim" solto viraria comando.
 */
const TENTATIVA_DE_AUTORIZAR =
  /^\s*(sim|isso|ok|okay|blz|beleza|claro|confirmo|confirmado|confirma|autorizo|autorizado|autoriza|aprovo|aprovado|aprova|pode|pode ir|pode mandar|manda|t[aá] bom|tudo bem)\b[\s.!,]*$/i;

/**
 * A frase que vai no CORPO da mensagem de resultado (decisão de
 * 26/08/2026 — ver voz/notificar.js).
 *
 * Leitura pedida pelo WhatsApp entra por `executar`, e esse caminho NÃO
 * passa pela narração do `consultar` — sem narrar aqui, a resposta de
 * "como está a ocupação" seria um link em vez do número.
 *
 * Escrita não é narrada: `acoes.resumir` já diz o que foi feito ("pus
 * água na lista de compras"), de graça e sem chamar o modelo.
 *
 * Falha de narração devolve string vazia de propósito — o relatório cai
 * no formato antigo (título + link) em vez de não sair.
 */
async function falaDoResultado(pedido, resultado) {
  if (acoes.nivelDe(pedido.acao) !== acoes.NIVEIS.LEITURA) return '';
  if (resultado == null) return '';
  try {
    const n = await cerebro.narrar(pedido.texto_original, resultado);
    return String(n.fala || '').trim();
  } catch (e) {
    console.error('[voz/servico] narração do resultado falhou:', e.message);
    return '';
  }
}

/** Registra o handler da fila. Chamado uma vez, na montagem. */
function registrarHandlers() {
  fila.registrar(TIPO_JOB, async ({ pedidoId }) => {
    try {
      const { pedido, resultado, repetido, recusado } = await executor.executarPedido(pedidoId);
      if (recusado) return { recusado: true };
      if (!repetido) await notificar.relatorio(pedido, { fala: await falaDoResultado(pedido, resultado) });
      return { ok: true, resultado: resultado === undefined ? null : resultado };
    } catch (e) {
      const p = repo.porId(pedidoId);
      // Avisar a falha é obrigatório: a voz já disse "estou cuidando".
      // Entrega que falha em silêncio é pior que erro na cara.
      if (p) await notificar.falha(p, e.message || String(e));
      throw e;
    }
  });
  return TIPO_JOB;
}

// ---------------------------------------------------------------------
// consultar — síncrono, SOMENTE LEITURA
// ---------------------------------------------------------------------
/**
 * @returns {{ fala, pedidoId, relatorio, status, acao }}
 *
 * Quando a interpretação revela que o pedido não é leitura, esta função
 * NÃO executa a escrita por aqui: ela entrega o pedido ao caminho do
 * `executar`, que tem nível, aprovação e fila. O mapa de ferramentas de
 * escrita continua inalcançável a partir daqui (voz/executor.js).
 */
async function consultar({ texto, canal = 'voz', ator = '', transcrito = false } = {}) {
  const { pedido, repetido } = repo.criar({ canal, ator, texto, transcrito, modo: 'consultar' });
  if (repetido && pedido.fala) return respostaDe(pedido, { relatorio: false });

  const interp = await cerebro.interpretar(texto);
  if (!interp.acao || interp.confianca < LIMIAR_CONFIANCA) return naoEntendi(pedido, interp);

  const nivel = acoes.nivelDe(interp.acao);
  repo.atualizar(pedido.id, { acao: interp.acao, parametros: interp.parametros, nivel });

  // Não é leitura → segue pelo caminho certo, com as travas dele.
  if (nivel !== acoes.NIVEIS.LEITURA) {
    repo.auditar('consulta.encaminhada', {
      pedidoId: pedido.id, atorTipo: 'sistema',
      detalhe: { acao: interp.acao, nivel, motivo: 'pedido de escrita chegou pelo caminho de consulta' },
    });
    return despachar(repo.porId(pedido.id), interp, { canal });
  }

  const faltam = acoes.faltando(interp.acao, interp.parametros);
  if (faltam.length) return pedirDados(pedido, faltam);

  try {
    const inicio = Date.now();
    const dados = await executor.rodar(interp.acao, interp.parametros, { somenteLeitura: true });
    const narracao = await cerebro.narrar(texto, dados);
    const estourou = Date.now() - inicio > cerebro.ORCAMENTO_MS;
    const mandarRelatorio = !narracao.cabeNaFala || estourou;

    const atualizado = repo.atualizar(pedido.id, {
      status: 'concluido', resultado: dados, fala: narracao.fala, concluido_em: nowISO(),
    });
    repo.auditar('consulta.respondida', {
      pedidoId: pedido.id, atorTipo: 'voz', ator,
      detalhe: { acao: interp.acao, motor: interp.motor, relatorio: mandarRelatorio },
    });
    if (mandarRelatorio) {
      await notificar.relatorio(atualizado, {
        titulo: acoes.resumir(interp.acao, interp.parametros), fala: narracao.fala,
      });
    }
    return respostaDe(atualizado, { relatorio: mandarRelatorio });
  } catch (e) {
    const naoImplementada = e && e.status === 501;
    const atualizado = repo.atualizar(pedido.id, {
      status: naoImplementada ? 'nao_suportado' : 'falhou',
      erro: String(e.message || e).slice(0, 500),
      fala: naoImplementada ? 'Isso eu ainda não sei consultar.' : 'Não consegui consultar agora.',
      concluido_em: nowISO(),
    });
    return respostaDe(atualizado, { relatorio: false });
  }
}

// ---------------------------------------------------------------------
// executar — SEMPRE assíncrono, NUNCA devolve o resultado
// ---------------------------------------------------------------------
/**
 * @returns {{ fala, pedidoId, nivel, precisaAprovacao, status, acao }}
 *
 * O que volta é o RECIBO do pedido, para a voz confirmar que entendeu.
 * O resultado sai depois, pelo WhatsApp — sempre, mesmo quando foi
 * rápido. Uniformidade aqui vale mais que economia de uma mensagem: o
 * usuário aprende uma regra só.
 */
async function executar({ texto, canal = 'voz', ator = '', transcrito = false } = {}) {
  const { pedido, repetido } = repo.criar({ canal, ator, texto, transcrito, modo: 'executar' });
  // Trava 6: repetição devolve a MESMA resposta, não uma segunda compra.
  if (repetido) {
    repo.auditar('pedido.repetido', { pedidoId: pedido.id, atorTipo: 'sistema', detalhe: { canal } });
    return respostaDe(pedido, { repetido: true });
  }

  // "autorizo", "pode", "sim" — a resposta natural de quem recebeu um
  // pedido de autorizacao por mensagem. Nao autoriza (a decisao continua
  // sendo o clique em sessao), mas nao pode virar "nao entendi" nem, pior,
  // um comando novo. Responde o que fazer e reenvia o link.
  const esperando = TENTATIVA_DE_AUTORIZAR.test(String(texto || '')) ? aprovacoes.algumaPendente() : null;
  if (esperando) return responderTentativaDeAutorizar(pedido, esperando);

  const interp = await cerebro.interpretar(texto);
  if (!interp.acao || interp.confianca < LIMIAR_CONFIANCA) return naoEntendi(pedido, interp);

  repo.atualizar(pedido.id, {
    acao: interp.acao, parametros: interp.parametros, nivel: acoes.nivelDe(interp.acao),
  });
  return despachar(repo.porId(pedido.id), interp, { canal });
}

/** Reenvia o link do pedido que espera, e diz por que a mensagem nao vale. */
async function responderTentativaDeAutorizar(pedido, esperando) {
  const alvo = repo.porId(esperando.pedido_id);
  if (!alvo) return naoEntendi(pedido, { motivo: 'O pedido que esperava autorizacao sumiu.', confianca: 0 });
  const { token, expiraEm } = aprovacoes.criar(alvo.id);
  await notificar.pedirAprovacao(alvo, token, { expiraEm });
  const p = repo.atualizar(pedido.id, {
    status: 'recusado', fala: FALAS.autorizaPeloLink, concluido_em: nowISO(),
  });
  repo.auditar('autorizacao.tentada_por_mensagem', {
    pedidoId: pedido.id, atorTipo: 'usuario', ator: pedido.ator,
    detalhe: { alvo: alvo.id, acao: alvo.acao },
  });
  return respostaDe(p, { autorizacaoPeloLink: alvo.id });
}

/** O roteador por nível. Um lugar só — é o que mantém as travas juntas. */
async function despachar(pedido, interp, { canal = 'voz' } = {}) {
  const nivel = acoes.nivelDe(pedido.acao);

  // Trava 7 (parte 1): o interruptor. Consulta continua funcionando.
  if (!EXECUTAR_LIGADO()) {
    const p = repo.atualizar(pedido.id, { status: 'recusado', fala: FALAS.desligado, concluido_em: nowISO() });
    repo.auditar('pedido.bloqueado', { pedidoId: pedido.id, atorTipo: 'sistema', detalhe: { motivo: 'VOZ_EXECUTAR=off' } });
    return respostaDe(p);
  }

  const faltam = acoes.faltando(pedido.acao, pedido.parametros);
  if (faltam.length) return pedirDados(pedido, faltam);

  // Trava 7 (parte 2): nível sensível avisa por fora, ANTES de agir.
  if (nivel >= acoes.NIVEIS.EXTERNO) await notificar.avisarUsoSensivel(pedido, { canal });

  // ---- nível 4: código ----
  if (nivel === acoes.NIVEIS.CODIGO) return despacharCodigo(pedido);

  // ---- nível 3: precisa de autorização ----
  if (acoes.exigeAprovacao(pedido.acao)) {
    // Pedido IDÊNTICO já esperando? Não cria um segundo. Quem responde à
    // mensagem de autorização repetindo o resumo (o gesto natural, e o
    // que aconteceu no primeiro uso real) chegaria aqui com a mesma ação
    // e os mesmos parâmetros — e receberia outro link, outro par de
    // mensagens e nenhuma autorização.
    const jaPendente = aprovacoes.pendenteEquivalente(pedido.acao, pedido.parametros);
    if (jaPendente && jaPendente.pedido_id !== pedido.id) {
      const p = repo.atualizar(pedido.id, {
        status: 'recusado', fala: FALAS.jaPendente, concluido_em: nowISO(),
      });
      repo.auditar('pedido.duplicado', {
        pedidoId: pedido.id, atorTipo: 'sistema',
        detalhe: { acao: pedido.acao, original: jaPendente.pedido_id },
      });
      await notificar.enviar(
        `⏳ Esse pedido já está esperando sua autorização: ${acoes.resumir(pedido.acao, pedido.parametros)}. `
        + 'Use o link que mandei antes — autorização é por lá, não por mensagem.');
      return respostaDe(p, { jaPendente: jaPendente.pedido_id });
    }

    const { token, expiraEm } = aprovacoes.criar(pedido.id);
    await notificar.pedirAprovacao(pedido, token, { expiraEm });
    const p = repo.atualizar(pedido.id, { fala: FALAS.autorizacao });
    return respostaDe(p, { precisaAprovacao: true });
  }

  // ---- nível 1 e 2: pode rodar; mas o resultado sai pelo WhatsApp ----
  fila.enfileirar({
    tipo: TIPO_JOB, payload: { pedidoId: pedido.id }, fila: acoes.filaDe(pedido.acao),
    chaveIdem: `exec:${pedido.id}`, dono: pedido.ator || '',
  });
  const p = repo.atualizar(pedido.id, { fala: FALAS.cuidando });
  return respostaDe(p);
}

/**
 * Nível 4 com a fila `codigo` travada.
 *
 * Registrar o pedido e dizer a verdade — "anotei, mas ainda não sei
 * fazer" — é melhor que aceitar e nunca entregar. O pedido fica no
 * painel: é dali que sai a lista do que o sistema deveria saber fazer.
 */
function despacharCodigo(pedido) {
  try {
    fila.enfileirar({
      tipo: TIPO_JOB, payload: { pedidoId: pedido.id }, fila: 'codigo',
      chaveIdem: `exec:${pedido.id}`, dono: pedido.ator || '',
    });
    const p = repo.atualizar(pedido.id, { fala: FALAS.cuidando });
    return respostaDe(p);
  } catch (e) {
    if (!e.filaTravada) throw e;
    const p = repo.atualizar(pedido.id, {
      status: 'nao_suportado', fala: FALAS.semCodigo,
      erro: 'Fila de código travada: falta executor (decisão 4 do plano).', concluido_em: nowISO(),
    });
    repo.auditar('codigo.anotado', {
      pedidoId: pedido.id, atorTipo: 'sistema',
      detalhe: { pedido: (pedido.parametros || {}).pedido || pedido.texto_original },
    });
    notificar.enviar(`📝 Anotei um pedido de implementação: ${acoes.resumir(pedido.acao, pedido.parametros)}. ${notificar.linkPedido(pedido.id)}`)
      .catch((err) => console.error('[voz/servico] aviso de código não saiu:', err.message));
    return respostaDe(p);
  }
}

/** Depois do clique de autorização, o trabalho vai para a fila. */
function aposAprovacao(pedidoId) {
  const pedido = repo.porId(pedidoId);
  if (!pedido) throw new Error('voz/servico: pedido inexistente.');
  if (pedido.status !== 'aprovado') return { enfileirado: false, pedido };
  const job = fila.enfileirar({
    tipo: TIPO_JOB, payload: { pedidoId }, fila: acoes.filaDe(pedido.acao),
    chaveIdem: `exec:${pedidoId}`, dono: pedido.ator || '',
  });
  return { enfileirado: !!job, pedido };
}

// ---------------------------------------------------------------------
// respostas
// ---------------------------------------------------------------------
function naoEntendi(pedido, interp) {
  const p = repo.atualizar(pedido.id, {
    status: 'nao_entendido', fala: FALAS.naoEntendi,
    erro: String(interp.motivo || '').slice(0, 500),
    nivel: 0, concluido_em: nowISO(),
  });
  repo.auditar('pedido.nao_entendido', {
    pedidoId: pedido.id, atorTipo: 'sistema',
    // Guardar o que ELE achou que era, mesmo abaixo do limiar, é o que
    // permite descobrir depois o que a casa pede e o sistema não faz.
    detalhe: { motivo: interp.motivo, palpite: interp.acao || null, confianca: interp.confianca, motor: interp.motor },
  });
  return respostaDe(p);
}

function pedirDados(pedido, faltam) {
  // A frase vai ser DITA em voz alta: usa o rotulo falado de cada
  // parametro, e "a, b e c" em vez de "a e b e c".
  const fala = `Preciso saber ${acoes.listarEmPortugues(faltam.map(acoes.rotularParametro))}.`;
  const p = repo.atualizar(pedido.id, { status: 'recebido', fala });
  return respostaDe(p, { faltando: faltam });
}

const respostaDe = (pedido, extra = {}) => ({
  pedidoId: pedido.id,
  fala: pedido.fala || FALAS.naoEntendi,
  status: pedido.status,
  acao: pedido.acao || null,
  nivel: pedido.nivel || 0,
  precisaAprovacao: pedido.status === 'aguardando_aprovacao',
  ...extra,
});

module.exports = {
  consultar, executar, aposAprovacao, registrarHandlers,
  TIPO_JOB, FALAS, LIMIAR_CONFIANCA,
};
