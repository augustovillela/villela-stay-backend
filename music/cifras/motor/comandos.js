// =====================================================================
// Musique Cifras — MOTOR · comandos de voz. Puro e isomórfico.
//
// Recebe o que o reconhecimento de fala do navegador ouviu ("abrir tempo
// perdido", "subir meio tom", "transpor para ré menor", "pausar") e devolve
// UMA ação com os parâmetros. Não executa nada: quem executa é a tela.
// Sem IA de propósito — um conjunto pequeno de frases, previsível e sem
// custo por uso. O que não for entendido volta como `desconhecido`, com o
// texto, para a tela dizer o que ouviu.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else (raiz.MusiqueMotor = raiz.MusiqueMotor || {}).comandos = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizar(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Nota dita em solfejo ou letra → letra da cifra.
  var SOLFEJO = { 'do': 'C', 're': 'D', 'mi': 'E', 'fa': 'F', 'sol': 'G', 'la': 'A', 'si': 'B',
    'c': 'C', 'd': 'D', 'e': 'E', 'f': 'F', 'g': 'G', 'a': 'A', 'b': 'B', 'se': 'C', 'de': 'D', 'ge': 'G', 'efe': 'F' };
  function tomFalado(resto) {
    var m = /^(do|re|mi|fa|sol|la|si|[a-g]|se|de|ge|efe)( sustenido| bemol| #| b)?( maior| menor| m)?$/.exec(resto);
    if (!m || !SOLFEJO[m[1]]) return '';
    var nota = SOLFEJO[m[1]] + (m[2] ? (/sustenido|#/.test(m[2]) ? '#' : 'b') : '');
    return nota + (m[3] && /menor| m/.test(m[3]) ? 'm' : '');
  }

  var R = [
    [/^(tocar|toca|toque|play|continuar|continua|comecar|iniciar|inicia)$/, function () { return { acao: 'tocar' }; }],
    [/^(pausar|pausa|parar|para|pare|stop)( a musica| o audio| o player)?$/, function () { return { acao: 'pausar' }; }],
    [/^(proxima|proximo|avancar|seguinte)( musica)?$/, function () { return { acao: 'proxima' }; }],
    [/^(anterior|voltar a musica|musica anterior)$/, function () { return { acao: 'anterior' }; }],
    [/^(voltar|volta)$/, function () { return { acao: 'voltar' }; }],
    [/^(subir|sobe|aumentar|aumenta|levantar) (um )?meio tom$/, function () { return { acao: 'transpor', semitons: 1 }; }],
    [/^(subir|sobe|aumentar|aumenta|levantar) (um )?tom$/, function () { return { acao: 'transpor', semitons: 2 }; }],
    [/^(baixar|baixa|descer|desce|diminuir|diminui|abaixar|abaixa) (um )?meio tom$/, function () { return { acao: 'transpor', semitons: -1 }; }],
    [/^(baixar|baixa|descer|desce|diminuir|diminui|abaixar|abaixa) (um )?tom$/, function () { return { acao: 'transpor', semitons: -2 }; }],
    [/^(tom original|voltar ao tom original|tom normal)$/, function () { return { acao: 'tom_original' }; }],
    [/^(transpor|transpoe|mudar|muda|colocar|coloca|passar|passa)( o tom)?( para| pra| em| no)?( o)?( tom)?( de)? (.+)$/, function (m) {
      var t = tomFalado(m[7]); return t ? { acao: 'tom', tom: t } : null; }],
    [/^(tom de|no tom de|em) (.+)$/, function (m) { var t = tomFalado(m[2]); return t ? { acao: 'tom', tom: t } : null; }],
    [/^(parar|pausar|pare) (a )?rolagem$/, function () { return { acao: 'rolar', ligar: false }; }],
    [/^(rolar|rola|rolagem|iniciar rolagem|ligar rolagem|rolagem automatica)$/, function () { return { acao: 'rolar', ligar: true }; }],
    [/^(mais rapido|acelerar|acelera|mais depressa)$/, function () { return { acao: 'velocidade', passo: 1 }; }],
    [/^(mais devagar|devagar|desacelerar|desacelera|mais lento)$/, function () { return { acao: 'velocidade', passo: -1 }; }],
    [/^(aumentar|aumenta|aumente|maior) (a )?(letra|fonte|cifra)$/, function () { return { acao: 'fonte', passo: 1 }; }],
    [/^(diminuir|diminui|diminua|menor) (a )?(letra|fonte|cifra)$/, function () { return { acao: 'fonte', passo: -1 }; }],
    [/^(karaoke|modo karaoke|ligar karaoke|desligar karaoke)$/, function () { return { acao: 'karaoke' }; }],
    [/^(minimizar|esconder)( o)? player$/, function () { return { acao: 'player', aberto: false }; }],
    [/^(maximizar|mostrar|abrir)( o)? player$/, function () { return { acao: 'player', aberto: true }; }],
    [/^(smart play|tocar junto|acompanhar)$/, function () { return { acao: 'smartplay' }; }],
    [/^(modo palco|palco)$/, function () { return { acao: 'palco' }; }],
    [/^(buscar|busca|busque|procurar|procura|procure|pesquisar|pesquisa)( por| a musica| a cifra)? (.+)$/, function (m) { return { acao: 'buscar', q: m[3] }; }],
    [/^(abrir|abra|abre|mostrar|mostra|mostre|tocar|toca|toque|quero)( a)?( musica| cifra)?( de| da| do)? (.+)$/, function (m) { return { acao: 'abrir', q: m[5] }; }],
  ];

  /** Texto falado → { acao, ... } ou { acao: 'desconhecido', texto }. */
  function interpretar(falado) {
    var t = normalizar(falado).replace(/^(musique|ok musique|ei musique),? /, '');
    if (!t) return { acao: 'desconhecido', texto: '' };
    for (var i = 0; i < R.length; i++) {
      var m = R[i][0].exec(t);
      if (m) { var r = R[i][1](m); if (r) { r.ouvido = t; return r; } }
    }
    return { acao: 'desconhecido', texto: t };
  }

  var EXEMPLOS = ['abrir Tempo Perdido', 'buscar Legião Urbana', 'tocar / pausar', 'subir meio tom', 'baixar um tom',
    'transpor para ré menor', 'tom original', 'rolar / parar rolagem', 'mais rápido / mais devagar',
    'aumentar a letra', 'karaokê', 'minimizar player', 'próxima / anterior', 'modo palco'];

  return { interpretar: interpretar, normalizar: normalizar, tomFalado: tomFalado, EXEMPLOS: EXEMPLOS };
});
