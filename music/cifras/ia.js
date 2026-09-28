// =====================================================================
// Musique Cifras — ASSISTÊNCIA DE IA. Tudo passa por três portões:
//
//   1. `direitos.podeMandarParaIA(obra)` quando a entrada é de uma obra
//      guardada — hoje libera tudo (ADR-0009), mas é o único lugar que
//      decide, e o selftest garante que ninguém o contorna;
//   2. `router.disponivel(capability)` — capability sem provedor ativo
//      NÃO aparece na tela (as de cifra nascem desligadas: ligar é
//      decisão comercial do Augusto, pelo painel 🎵);
//   3. COTA diária por pessoa (config `cifras.cota_ia_dia`), porque IA
//      custa por chamada e o custo tem de ter teto.
//
// E uma regra de apresentação: toda resposta volta como SUGESTÃO, com a
// confiança que o modelo declarou. A tela mostra prévia e pede
// confirmação antes de qualquer mudança — nunca aplica sozinha.
// =====================================================================
'use strict';
const { db, nowISO } = require('../db');
const repo = require('../repo');
const direitos = require('../direitos');
const router = require('../ia/router');
const flags = require('./flags');
const { erro } = require('./acervo');

const COTA_PADRAO = 40;
const cota = () => Number((repo.Config.get('cifras.cota_ia_dia', COTA_PADRAO))) || COTA_PADRAO;

function usadasHoje(usuario) {
  const hoje = nowISO().slice(0, 10);
  return db.prepare("SELECT COUNT(*) n FROM ia_usos WHERE usuario = ? AND capability LIKE 'cifra.%' AND criado_em >= ?").get(usuario, hoje).n;
}

/** O que a tela pode oferecer AGORA a esta pessoa. */
function disponiveis(usuario) {
  if (!flags.ligada('cifras.ia')) return { ligada: false, capabilities: [], restante: 0 };
  const caps = router.CAPABILITIES.filter((c) => c.startsWith('cifra.') && router.disponivel(c));
  return { ligada: true, capabilities: caps, restante: Math.max(0, cota() - usadasHoje(usuario)), cota: cota() };
}

/**
 * Executa uma capability de cifra. `obra` (opcional) passa pelo portão
 * de direitos. Devolve { sugestao: true, dados, confianca, custo }.
 */
async function executar(usuario, capability, entrada, { obra = null } = {}) {
  flags.exigir('cifras.ia');
  if (!String(capability).startsWith('cifra.')) throw erro('Capability fora do módulo de cifras.');
  if (!router.disponivel(capability)) throw erro('Este recurso de IA está desligado no momento.', 403, { semProvedor: true });
  if (obra) {
    const v = direitos.podeMandarParaIA(obra);
    if (!v.pode) throw erro(v.motivo, 403, { bloqueioDeDireitos: true });
  }
  if (usadasHoje(usuario) >= cota()) throw erro('Você atingiu o limite diário de uso de IA. Amanhã ele se renova.', 429);
  const cotacao = router.cotar(capability);
  const r = await router.executar(capability, entrada, { usuario });
  if (obra) {
    direitos.registrarProveniencia({ artefatoTipo: 'cifra_ia', artefatoId: obra.id, capability, provider: r._provider,
      model: r._model, promptVersao: r._prompt_versao, entradaResumo: capability, custoCentavos: r._custo_centavos, usuario });
  }
  const dados = { ...r };
  ['_provider', '_model', '_prompt_versao', '_custo_centavos'].forEach((k) => delete dados[k]);
  return { sugestao: true, capability, dados, confianca: Number(dados.confianca) || null,
    custo: cotacao ? { creditos: cotacao.creditos, centavos: cotacao.custo_estimado_centavos } : null };
}

/**
 * Semeia as capabilities de cifra no registry — DESLIGADAS. Não mexe em
 * linha que já existe: quem ligou pelo staff continua ligado.
 */
function semear() {
  const LINHAS = [
    ['cifra.ler_imagem', 'claude-sonnet-5', 3, 4],
    ['cifra.interpretar', 'claude-sonnet-5', 1, 2],
    ['cifra.metadados', 'claude-haiku-4-5', 1, 1],
    ['cifra.revisar_harmonia', 'claude-sonnet-5', 1, 2],
    ['cifra.comando', 'claude-haiku-4-5', 1, 1],
    ['cifra.resumir_mudancas', 'claude-haiku-4-5', 1, 1],
    ['cifra.guia_instrumento', 'claude-sonnet-5', 1, 2],
  ];
  const existentes = new Set(router.registry().map((l) => l.capability));
  LINHAS.forEach(([cap, model, creditos, centavos]) => {
    if (existentes.has(cap)) return;
    router.definirProvedor({ capability: cap, provider: 'anthropic', model, prioridade: 5, ativo: 0, creditos,
      custoEstimadoCentavos: centavos, promptVersao: 'cifras-v1', observacao: 'Cifras (28/09/2026); ligar é decisão comercial' });
  });
}

module.exports = { disponiveis, executar, semear, cota, usadasHoje };
