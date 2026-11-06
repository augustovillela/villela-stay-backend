// =====================================================================
// Grupo Villela Stay — ERRO DE PLANO PADRÃO (HTTP 402) com o caminho do upgrade.
//
// Antes, cada sistema respondia "Faça upgrade" em texto (400 ou 403) e o painel mostrava um
// alert(). O assinante não sabia QUAL plano resolvia nem tinha um botão. Agora o servidor
// devolve um corpo estruturado e o front (assets/brand/villela-upgrade.js) mostra o cartão
// "Disponível no <plano> (R$ X/mês) [Fazer upgrade] [Ver planos]".
//
// Corpo (nunca leva id de tenant nem dado interno):
//   { erro, codigo: 'limite'|'modulo'|'recurso'|'conta', recurso, rotulo, usado, limite,
//     plano_atual: {slug,nome}|null,
//     plano_sugerido: {slug,nome,preco_centavos,preco_anual_centavos,novo_limite}|null }
//
// Uso (cada sistema só fornece os dados dele):
//   throw Upgrade.erroDePlano({ codigo:'limite', recurso:'contatos', rotulo:'contatos', usado, limite,
//     planos, atualSlug, atende:(p)=> Upgrade.ilimitado(p.limites.contatos) || p.limites.contatos > usado });
//   // e no catch do roteador:  if (Upgrade.responder(res, e)) return;
// =====================================================================
'use strict';

const num = (v) => Number(v);
/** 0 ou negativo = ilimitado (convenção do CRM e do Growth OS; ver correção de 06/11/2026). */
const ilimitado = (v) => !(num(v) > 0);
const reais = (c) => 'R$ ' + (num(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: num(c) % 100 ? 2 : 0, maximumFractionDigits: 2 });

/**
 * Menor plano PAGO e mais caro que o atual que satisfaz `atende`. Planos sem preço
 * (avaliação, "sob consulta") nunca são sugeridos: não dá para assinar por autoatendimento.
 * @param {Array<{slug,nome,preco_centavos}>} planos
 */
function menorPlanoQue(planos, atualSlug, atende) {
  const lista = (planos || []).filter((p) => num(p.preco_centavos) > 0).sort((a, b) => num(a.preco_centavos) - num(b.preco_centavos));
  const atual = (planos || []).find((p) => p.slug === atualSlug);
  const piso = atual ? num(atual.preco_centavos) || 0 : -1;
  return lista.find((p) => num(p.preco_centavos) > piso && p.slug !== atualSlug && atende(p)) || null;
}

function dizerLimite(v) { return ilimitado(v) ? 'sem limite' : String(v); }

/**
 * @param {object} d
 *   codigo: 'limite' | 'modulo' | 'recurso' | 'conta'
 *   recurso, rotulo: o que bloqueou ("contatos", "o módulo de campanhas")
 *   usado, limite: só em 'limite'
 *   planos: [{slug,nome,preco_centavos,preco_anual_centavos,limites,modulos,flags}]; atualSlug
 *   atende(plano): o plano resolve? ; valorNoPlano(plano): valor novo do limite (para o texto)
 *   mensagem: texto completo (opcional; sobrepõe o gerado)
 */
function erroDePlano(d) {
  const planos = d.planos || [];
  const atual = planos.find((p) => p.slug === d.atualSlug) || null;
  const sug = d.codigo === 'conta' || typeof d.atende !== 'function' ? null : menorPlanoQue(planos, d.atualSlug, d.atende);
  const nomeAtual = atual ? atual.nome : 'atual';
  const novo = sug && typeof d.valorNoPlano === 'function' ? d.valorNoPlano(sug) : undefined;

  let msg = d.mensagem;
  if (!msg) {
    if (d.codigo === 'limite') {
      msg = `Você chegou ao limite de ${dizerLimite(d.limite)} ${d.rotulo || d.recurso} do plano ${nomeAtual}.`;
      msg += sug ? ` O plano ${sug.nome} (${reais(sug.preco_centavos)}/mês) ${novo !== undefined ? `libera ${dizerLimite(novo)}` : 'amplia esse limite'}.` : ' Fale com a gente para ampliar.';
    } else if (d.codigo === 'conta') {
      msg = 'Sua assinatura precisa de atenção para continuar usando o sistema.';
    } else {
      msg = `${d.rotulo || d.recurso} não está no plano ${nomeAtual}.`;
      msg += sug ? ` Disponível no plano ${sug.nome} (${reais(sug.preco_centavos)}/mês).` : ' Fale com a gente para liberar.';
    }
  }

  const e = new Error(msg);
  e.status = 402;
  e.corpo = {
    erro: msg,
    codigo: d.codigo || 'limite',
    recurso: d.recurso || '',
    rotulo: d.rotulo || '',
    usado: d.usado == null ? null : num(d.usado),
    limite: d.limite == null ? null : num(d.limite),
    plano_atual: atual ? { slug: atual.slug, nome: atual.nome } : null,
    plano_sugerido: sug ? {
      slug: sug.slug, nome: sug.nome, preco_centavos: num(sug.preco_centavos),
      preco_anual_centavos: num(sug.preco_anual_centavos) || 0, novo_limite: novo === undefined ? null : num(novo),
    } : null,
  };
  return e;
}

/** No catch do roteador: se for erro de plano, responde 402 estruturado e devolve true. */
function responder(res, e) {
  if (e && e.corpo && e.status === 402) { res.status(402).json(e.corpo); return true; }
  return false;
}

module.exports = { ilimitado, reais, menorPlanoQue, erroDePlano, responder };
