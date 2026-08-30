// =====================================================================
// Assinatura de webhook do Mercado Pago — conferência compartilhada.
//
// O algoritmo é o documentado pelo MP e já estava implementado na Vitrine
// (vitrine/pagamentos.js); aqui ele vira peça única para os outros produtos
// não escreverem cada um a sua versão — foi assim que o `esc()` virou 39
// cópias, metade delas incompleta.
//
// DECISÃO IMPORTANTE, e ela não é óbvia: sem segredo configurado, isto NÃO
// recusa. A defesa real contra payload forjado é outra e já existe em todos
// os handlers — eles nunca confiam no corpo, vão buscar o pagamento na API
// do MP com a credencial da casa. A assinatura acrescenta defesa contra
// ruído e custo, não contra fraude. Recusar sem segredo pararia a cobrança
// em produção no dia do deploy, trocando um risco pequeno por uma queda
// grande. Com a env configurada, passa a valer de verdade.
// =====================================================================
'use strict';
const crypto = require('crypto');

/** Esquema do MP: header `x-signature: ts=...,v1=...` sobre um manifesto fixo. */
function assinaturaValida(headers, dataId, segredo) {
  const bruto = String((headers && headers['x-signature']) || '');
  const partes = Object.fromEntries(
    bruto.split(',').map((p) => p.trim().split('=').map((x) => (x || '').trim())));
  if (!partes.ts || !partes.v1) return false;
  const manifesto = `id:${String(dataId).toLowerCase()};request-id:${String((headers && headers['x-request-id']) || '')};ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(String(partes.v1)));
  } catch (_) { return false; }   // tamanhos diferentes: não é a assinatura
}

const _avisados = new Set();

/**
 * O segredo vem de `MP_WEBHOOK_SECRET` — um só, porque todos os produtos usam a
 * MESMA conta do Mercado Pago. O nome por produto (FINANCE_…, ACADEMY_…) existe
 * como sobrescrita, para o dia em que algum ganhar aplicação própria; configurar
 * sete variáveis com o mesmo valor seria criar sete lugares para errar na rotação.
 *
 * @returns {{ok: boolean, motivo: string}} — `ok:false` só quando HÁ segredo
 * configurado e a assinatura não confere.
 */
function conferir({ headers, dataId, segredo, rotulo = 'mp' }) {
  if (!dataId) return { ok: false, motivo: 'sem id' };
  if (!segredo) {
    if (!_avisados.has(rotulo)) {                 // uma vez por processo, não por request
      _avisados.add(rotulo);
      console.warn(`[${rotulo}] webhook do MP sem segredo configurado: a assinatura NÃO é conferida.`
        + ' O payload segue sendo reconferido na API do MP, mas configure o segredo para fechar a porta.');
    }
    return { ok: true, motivo: 'sem segredo configurado' };
  }
  return assinaturaValida(headers, dataId, segredo)
    ? { ok: true, motivo: 'assinatura confere' }
    : { ok: false, motivo: 'assinatura inválida' };
}

/**
 * O id vai para dentro da URL da API do MP (`/preapproval/<id>`). Sem isto,
 * um `..%2Fv1%2Fpayments%2F123` navegava no caminho com a credencial da casa.
 */
const idSeguro = (id) => /^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''));

module.exports = { assinaturaValida, conferir, idSeguro };
