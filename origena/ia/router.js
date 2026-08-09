// =====================================================================
// ORIGENA — AI Router (ADR-0004). A ÚNICA superfície de IA que o domínio
// conhece. Capability entra, resultado sai; provedor e modelo são LINHAS
// da provider_registry, nunca código.
//
// §102 — ESTE DIRETÓRIO NÃO DECIDE AUTORIZAÇÃO. Nada aqui importa rbac,
// privacidade ou tenancy (o selftest varre e falha se importar). Quem
// monta o contexto permitido é o domínio; aqui só se executa.
//
// `disponivel()` controla a UI: capability sem provedor ativo (ou sem
// chave) NÃO aparece na tela. A Origena nunca oferece botão que não
// funciona e nunca simula resultado.
// =====================================================================
'use strict';
const ADAPTERS = { anthropic: require('./adapters/anthropic') };

// Injeção para teste: o selftest pluga um executor falso por provider.
const injetados = new Map();
const injetarParaTeste = (provider, fn) => { fn ? injetados.set(provider, { executar: fn, pronto: () => true }) : injetados.delete(provider); };

const adapterDe = (provider) => injetados.get(provider) || ADAPTERS[provider] || null;

/** Provedores ativos e UTILIZÁVEIS (registry ligado E adapter com chave). */
async function ativos(t, capability) {
  const linhas = await t.todas(
    `SELECT * FROM provider_registry WHERE capability = $1 AND ativo ORDER BY prioridade, provider`,
    [capability]);
  return linhas.filter((l) => { const a = adapterDe(l.provider); return a && a.pronto(); });
}

const disponivel = async (t, capability) => (await ativos(t, capability)).length > 0;

/** O preço, ANTES de qualquer execução (§53). Vem do registry, não de código. */
async function cotar(t, capability) {
  const lista = await ativos(t, capability);
  if (!lista.length) return null;
  const p = lista[0];
  return { capability, creditos: p.creditos, provider: p.provider, model: p.model };
}

/**
 * Executa com fallback: falha transitória tenta o próximo provedor da
 * fila. Devolve { saida, tokens_in, tokens_out, custo_centavos,
 * provider, model } ou lança com a chave i18n.
 */
async function executar(t, { capability, entrada }) {
  const lista = await ativos(t, capability);
  if (!lista.length) throw Object.assign(new Error('capability indisponível'),
    { chave: 'erro.ia_indisponivel', status: 503 });
  let ultimo;
  for (const p of lista) {
    try {
      const r = await adapterDe(p.provider).executar({ model: p.model, capability, entrada });
      return { ...r, provider: p.provider, model: p.model };
    } catch (e) { ultimo = e; }
  }
  throw Object.assign(new Error(ultimo ? ultimo.message : 'todos os provedores falharam'),
    { chave: 'erro.ia_falhou', status: 502 });
}

module.exports = { disponivel, cotar, executar, ativos, injetarParaTeste };
