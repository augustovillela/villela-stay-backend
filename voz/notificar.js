// =====================================================================
// Voz — a perna do WhatsApp. "A voz conversa; o WhatsApp registra."
//
// DUAS TRAVAS MORAM AQUI, e as duas já custaram caro na casa:
//
// 1. ERRO META 132018 / fila envenenada do Make.
//    Fora da janela de 24 h só passa template aprovado, e variável de
//    template NÃO aceita quebra de linha nem parâmetro vazio — bundle
//    inválido fica preso na fila do Make e derruba o cenário 6128257 a
//    cada religada (episódios de 08 e 11/08/2026).
//    Consequência de projeto: RELATÓRIO NUNCA VAI NO CORPO DA MENSAGEM.
//    O que sai é uma linha de resumo + um LINK para a página do Portal
//    Staff. Isso resolve o 132018 e a trava 4 de uma vez só.
//
// 2. DADO PESSOAL NÃO SAI POR MENSAGEM (regra 5 do CLAUDE.md).
//    CPF, RG, telefone e e-mail de terceiro ficam do lado de dentro. A
//    linha do WhatsApp é redigida para NÃO os conter; o detalhe fica na
//    página autenticada, que exige sessão do staff.
//    `higienizar` é a última barreira, não a primeira: o certo é o
//    resumo já nascer sem o dado. Ela existe porque "o certo" falha.
// =====================================================================
'use strict';
const repo = require('./repo');
const acoes = require('./acoes');

let _enviarWhatsApp = null;      // (to, texto) => Promise<bool>  — janela de 24 h
let _alertaAugusto = null;       // (resumo) => Promise<bool>     — template alerta_crm
let _baseUrl = '';
let _destino = '';

function configurar({ enviarWhatsApp, alertaAugusto, baseUrl, destino } = {}) {
  if (typeof enviarWhatsApp === 'function') _enviarWhatsApp = enviarWhatsApp;
  if (typeof alertaAugusto === 'function') _alertaAugusto = alertaAugusto;
  if (baseUrl) _baseUrl = String(baseUrl).replace(/\/+$/, '');
  if (destino) _destino = String(destino).replace(/\D/g, '');
  return { temEnvio: !!_enviarWhatsApp, temAlerta: !!_alertaAugusto, baseUrl: _baseUrl, destino: _destino };
}

const configurado = () => !!(_enviarWhatsApp || _alertaAugusto);

// ---------------------------------------------------------------------
// Higiene do texto que sai
// ---------------------------------------------------------------------
const PADROES_PESSOAIS = [
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]'],
  [/\b\d{1,2}\.?\d{3}\.?\d{3}-?[0-9Xx]\b/g, '[RG]'],
  [/\b(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[telefone]'],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[e-mail]'],
];

/** Troca dado pessoal por marcador. O detalhe continua existindo — na
 *  página autenticada, que é onde ele pode existir. */
function higienizar(texto) {
  let t = String(texto || '');
  for (const [re, marca] of PADROES_PESSOAIS) t = t.replace(re, marca);
  return t;
}

/**
 * Uma linha, sem quebra, sem tab, sem dado pessoal, com tamanho de
 * template. É este o formato que a Meta aceita — o resto vai no link.
 */
function umaLinha(texto, max = 700) {
  const t = higienizar(texto).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const linkPedido = (id) => (_baseUrl ? `${_baseUrl}/staff/voz/pedido/${id}` : `/staff/voz/pedido/${id}`);
const linkAprovacao = (token) => (_baseUrl ? `${_baseUrl}/staff/voz/aprovar/${token}` : `/staff/voz/aprovar/${token}`);

/**
 * Envia. Prefere a janela de 24 h (texto livre, mais legível) e cai no
 * template quando ela não está aberta — mas o texto é montado para
 * servir aos dois casos, porque não dá para saber daqui se a janela
 * está aberta.
 *
 * ⚠️ Devolve `false` em vez de lançar quando não há canal configurado:
 * ficar sem WhatsApp não pode derrubar a execução do pedido, que já
 * aconteceu. Mas o log diz — silêncio aqui é o que faz uma entrega
 * sumir sem ninguém notar.
 */
async function enviar(texto) {
  const linha = umaLinha(texto);
  if (!linha) { console.error('[voz/notificar] envio recusado: texto vazio.'); return false; }
  if (_enviarWhatsApp && _destino) {
    try { if (await _enviarWhatsApp(_destino, linha)) return true; }
    catch (e) { console.error('[voz/notificar] texto livre falhou:', e.message); }
  }
  if (_alertaAugusto) {
    try { return await _alertaAugusto(linha); }
    catch (e) { console.error('[voz/notificar] template falhou:', e.message); return false; }
  }
  console.error('[voz/notificar] sem canal configurado — a mensagem NÃO saiu:', linha.slice(0, 120));
  return false;
}

// ---------------------------------------------------------------------
// As quatro mensagens da Fase 0
// ---------------------------------------------------------------------

/** Caminho B: o pedido foi feito e o documento está pronto. */
async function relatorio(pedido, { titulo = '' } = {}) {
  const t = titulo || acoes.resumir(pedido.acao, pedido.parametros);
  const ok = await enviar(`✅ ${t} — pronto. Detalhe: ${linkPedido(pedido.id)}`);
  repo.auditar('notificacao.relatorio', { pedidoId: pedido.id, atorTipo: 'sistema', detalhe: { entregue: ok } });
  return ok;
}

/** Caminho C: precisa de autorização (nível 3 e 4). */
async function pedirAprovacao(pedido, token, { expiraEm = '' } = {}) {
  const resumo = acoes.resumir(pedido.acao, pedido.parametros);
  const minutos = expiraEm ? Math.max(1, Math.round((Date.parse(expiraEm) - Date.now()) / 60000)) : 15;
  const ok = await enviar(
    `🔐 Autorização: ${resumo}. Vence em ${minutos} min. Autorize em ${linkAprovacao(token)}`);
  repo.auditar('notificacao.aprovacao', { pedidoId: pedido.id, atorTipo: 'sistema', detalhe: { entregue: ok } });
  return ok;
}

/** O pedido falhou depois de a voz já ter dito "estou cuidando". */
async function falha(pedido, erro) {
  const ok = await enviar(
    `⚠️ Não consegui: ${acoes.resumir(pedido.acao, pedido.parametros)}. Motivo: ${String(erro).slice(0, 200)}. ${linkPedido(pedido.id)}`);
  repo.auditar('notificacao.falha', { pedidoId: pedido.id, atorTipo: 'sistema', detalhe: { entregue: ok } });
  return ok;
}

/**
 * Trava 7 — aviso por FORA do canal de origem.
 *
 * Todo nível 3 e 4 avisa o Augusto, mesmo quando foi ele quem pediu, e
 * mesmo quando o pedido nasceu no próprio WhatsApp. Se um dia a chave
 * for usada por outra pessoa, ele fica sabendo por um caminho que não é
 * o que foi usado.
 */
async function avisarUsoSensivel(pedido, { canal = '' } = {}) {
  if (acoes.nivelDe(pedido.acao) < acoes.NIVEIS.EXTERNO) return false;
  const ok = await enviar(
    `🔔 Pedido de nível ${acoes.nivelDe(pedido.acao)} por ${canal || pedido.canal}: ${acoes.resumir(pedido.acao, pedido.parametros)}`);
  repo.auditar('notificacao.sensivel', { pedidoId: pedido.id, atorTipo: 'sistema', detalhe: { entregue: ok, canal } });
  return ok;
}

module.exports = {
  configurar, configurado, enviar, higienizar, umaLinha,
  linkPedido, linkAprovacao, relatorio, pedirAprovacao, falha, avisarUsoSensivel,
};
