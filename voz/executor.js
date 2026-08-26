// =====================================================================
// Voz — EXECUTOR. Despacha uma ação já autorizada para a ferramenta que
// a implementa de verdade.
//
// O módulo de voz NÃO implementa regra de negócio (plano §6). Quem sabe
// pôr item na lista é o server.js; quem sabe ler a Stays é o proxy; quem
// sabe o financeiro é o módulo do Finance. Aqui só existe o despacho —
// e as travas em volta dele.
//
// TRAVA 2 — `consultar` fisicamente não escreve.
// Não é um `if` no meio da rota: são DOIS MAPAS separados. O caminho de
// consulta só enxerga `leitura`, e uma ferramenta de escrita não está
// lá para ser chamada nem por engano. O `if` do nível continua existindo
// por cima, porque duas travas independentes falham juntas com muito
// menos frequência do que uma.
//
// `registrar` recusa ferramenta cujo nível no catálogo não bate com o
// mapa em que ela está sendo posta. É o erro que ninguém veria a olho
// nu: uma ferramenta de escrita registrada como leitura abriria a porta
// inteira, em silêncio, para sempre.
// =====================================================================
'use strict';
const acoes = require('./acoes');
const repo = require('./repo');
const { nowISO } = require('./db');

const MAPAS = { leitura: new Map(), escrita: new Map() };

/**
 * Registra a implementação de uma ação.
 * @param {string} acao   chave do catálogo
 * @param {function} fn   async (parametros, ctx) => resultado
 */
function registrar(acao, fn) {
  if (!acoes.existe(acao)) {
    throw new Error(`voz/executor: "${acao}" não está no catálogo (voz/acoes.js). `
      + 'Ferramenta sem entrada no catálogo não tem nível, e sem nível não há trava.');
  }
  if (typeof fn !== 'function') throw new Error(`voz/executor: implementação de "${acao}" não é função.`);
  const mapa = acoes.nivelDe(acao) === acoes.NIVEIS.LEITURA ? 'leitura' : 'escrita';
  MAPAS[mapa].set(acao, fn);
  return mapa;
}

/** Registra várias de uma vez: `{ 'agenda.dia': fn, ... }`. */
function registrarTodas(mapa = {}) {
  const feitas = {};
  for (const [acao, fn] of Object.entries(mapa)) {
    if (typeof fn !== 'function') continue;
    feitas[acao] = registrar(acao, fn);
  }
  return feitas;
}

const limpar = () => { MAPAS.leitura.clear(); MAPAS.escrita.clear(); };

/** Ação com implementação injetada? Ação sem ferramenta NÃO é erro de
 *  programação — é funcionalidade que ainda não existe (acoes.js). */
const implementada = (acao) => MAPAS.leitura.has(acao) || MAPAS.escrita.has(acao);
const implementadas = () => [...MAPAS.leitura.keys(), ...MAPAS.escrita.keys()].sort();

/**
 * Roda a ferramenta.
 *
 * @param {object} opts.somenteLeitura  caminho do `consultar` — só o mapa de leitura.
 */
async function rodar(acao, parametros = {}, { somenteLeitura = false, ctx = {} } = {}) {
  if (!acoes.existe(acao)) {
    throw Object.assign(new Error(`Ação desconhecida: ${acao}.`), { status: 400 });
  }
  const nivel = acoes.nivelDe(acao);

  if (somenteLeitura) {
    // Trava por NÍVEL...
    if (nivel !== acoes.NIVEIS.LEITURA) {
      throw Object.assign(
        new Error(`A ação "${acao}" é de nível ${nivel} e não pode rodar pelo caminho de consulta.`),
        { status: 403 });
    }
    // ...e trava por MAPA. As duas, de propósito.
    const fn = MAPAS.leitura.get(acao);
    if (!fn) throw Object.assign(new Error(`Ainda não sei fazer "${acao}".`), { status: 501 });
    return fn(parametros, ctx);
  }

  const fn = MAPAS.escrita.get(acao) || MAPAS.leitura.get(acao);
  if (!fn) throw Object.assign(new Error(`Ainda não sei fazer "${acao}".`), { status: 501 });
  return fn(parametros, ctx);
}

/**
 * Executa um PEDIDO já autorizado e grava o desfecho.
 *
 * Idempotente por status: pedido já concluído devolve o resultado que
 * está gravado, sem rodar de novo. A fila entrega no mínimo uma vez, e
 * "uma vez a mais" não pode virar um segundo e-mail enviado.
 */
async function executarPedido(pedidoId, { ctx = {} } = {}) {
  const pedido = repo.porId(pedidoId);
  if (!pedido) throw new Error(`voz/executor: pedido ${pedidoId} não existe.`);
  if (pedido.status === 'concluido') return { pedido, resultado: pedido.resultado, repetido: true };
  if (pedido.status === 'recusado' || pedido.status === 'expirado') {
    return { pedido, resultado: null, recusado: true };
  }
  // Nível 3 e 4 só rodam depois de aprovados. Esta checagem existe
  // porque a fila é reprocessável: um job antigo não pode executar um
  // pedido cuja aprovação nunca veio.
  if (acoes.exigeAprovacao(pedido.acao) && pedido.status !== 'aprovado') {
    throw Object.assign(
      new Error(`O pedido ${pedidoId} é nível ${acoes.nivelDe(pedido.acao)} e não está aprovado (status: ${pedido.status}).`),
      { permanente: true });
  }

  repo.atualizar(pedidoId, { status: 'executando' });
  try {
    const resultado = await rodar(pedido.acao, pedido.parametros, { ctx });
    const atualizado = repo.atualizar(pedidoId, {
      status: 'concluido', resultado, erro: '', concluido_em: nowISO(),
    });
    repo.auditar('pedido.executado', {
      pedidoId, atorTipo: 'voz', ator: pedido.ator,
      detalhe: { acao: pedido.acao, nivel: pedido.nivel },
    });
    return { pedido: atualizado, resultado };
  } catch (e) {
    const permanente = e && (e.status === 501 || e.status === 400 || e.permanente);
    repo.atualizar(pedidoId, {
      status: permanente ? 'nao_suportado' : 'falhou',
      erro: String(e && e.message ? e.message : e).slice(0, 500),
      concluido_em: permanente ? nowISO() : '',
    });
    repo.auditar('pedido.falhou', {
      pedidoId, atorTipo: 'sistema',
      detalhe: { acao: pedido.acao, erro: String(e && e.message ? e.message : e).slice(0, 300) },
    });
    throw e;
  }
}

module.exports = { registrar, registrarTodas, limpar, implementada, implementadas, rodar, executarPedido };
