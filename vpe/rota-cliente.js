// =====================================================================
// Villela Projects — rota do painel pelo endereço (F5 continua na mesma tela).
// Este MESMO arquivo é colado dentro do script do painel (paginas.js) e
// carregado pelo selftest: o que o teste valida é o que o navegador roda.
// Formatos:  #<tela>            (ex.: #tarefas)
//            #projeto/<id>/<aba> (ex.: #projeto/abc123/plano)
// Sem crase, sem ${ e sem barra invertida: o texto entra num template literal.
// =====================================================================
var ABAS_PROJETO = ['dados', 'plano', 'viab', 'tar', 'risco', 'dec'];

function hashDe(tela, projeto, aba) {
  if (projeto) return '#projeto/' + encodeURIComponent(projeto) + '/' + (ABAS_PROJETO.indexOf(aba) < 0 ? 'dados' : aba);
  return '#' + encodeURIComponent(tela || 'dashboard');
}

// visiveis = ids das telas que esta pessoa pode ver (permissão e plano já aplicados).
function rotaDeHash(hash, visiveis) {
  var h = String(hash || '');
  if (h.charAt(0) === '#') h = h.slice(1);
  var p = h.split('/').map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
  var padrao = { tela: 'dashboard', projeto: '', aba: '' };
  if (p[0] === 'projeto' && p[1]) {
    if (visiveis.indexOf('portfolio') < 0) return padrao;   // sem acesso a projetos: tela padrão
    return { tela: 'portfolio', projeto: p[1], aba: ABAS_PROJETO.indexOf(p[2]) < 0 ? 'dados' : p[2] };
  }
  if (p.length === 1 && p[0] && visiveis.indexOf(p[0]) >= 0) return { tela: p[0], projeto: '', aba: '' };
  return padrao;
}

// empurra = true grava uma entrada nova no histórico (clique); false troca a atual (boot, hash inválido).
function marcaHash(novo, empurra) {
  if (location.hash === novo) return;
  try { history[empurra ? 'pushState' : 'replaceState'](null, '', novo); } catch (e) { /* sem history: segue sem endereço */ }
}
