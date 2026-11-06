'use strict';
// =====================================================================
// Villela Legal SaaS — rota do painel do assinante (/juridico/app).
// Faz o F5 e o Voltar do navegador manterem a tela: o endereço guarda
// `#<tela>` (plano | uso | equipe | ia | suporte).
//
// As duas funções abaixo são PURAS: rodam no navegador (o texto delas é
// injetado no script da página por `fonte`) e no node (selftest). Nada de
// `window`/`location` aqui dentro.
// =====================================================================
function lerHash(h) {
  var m = /^#\/?([a-z0-9_-]+)/i.exec(String(h || ''));
  return m ? m[1].toLowerCase() : '';
}
// Qual tela abrir. `?creditos=1` (volta do pagamento da recarga) manda para a IA,
// como sempre; conta sem acesso liberado cai em "plano"; hash válido mantém a tela;
// vazio ou desconhecido cai em "plano" (a tela padrão de antes).
function resolverTela(hash, search, liberado, validas) {
  if (/(^|[?&])creditos=1(&|$)/.test(String(search || ''))) return 'ia';
  if (!liberado) return 'plano';
  var id = lerHash(hash);
  return id && validas.indexOf(id) >= 0 ? id : 'plano';
}
const TELAS = ['plano', 'uso', 'equipe', 'ia', 'suporte'];
module.exports = { lerHash, resolverTela, TELAS, fonte: [lerHash, resolverTela].map((f) => f.toString()).join('\n') };
