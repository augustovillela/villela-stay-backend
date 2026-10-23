// =====================================================================
// Villela Academy — ESTUDO · correção OBJETIVA. Puro e determinístico:
// mesma prova + mesmas respostas + mesma regra = mesma nota, sempre. A IA
// pode redigir comentário; nunca decide ponto (prompt mestre, seção 10.5).
//
// A regra vem do ESCOPO (edital-alvo), com fonte e data — este arquivo não
// traz regra de concurso nenhum embutida. Três situações que NÃO se
// confundem, porque há edital que as trata de forma diferente:
//   errada     marcou alternativa que não é o gabarito
//   abstencao  marcou explicitamente "não respondida"
//   em_branco  não marcou nada
//
// ESTE ARQUIVO VAI AO NAVEGADOR (estudo/motores-navegador.js), servido cru:
// é escrito em ES5 — `var` e `function`, sem seta, sem `const`/`let`, sem
// texto com crase, sem espalhamento nem desestruturação, sem Map/Set, sem
// Object.entries/values (réplica de 11/10/2026, R3-B11). O teste de
// testes-auditoria-b2.js recusa sintaxe mais nova aqui.
// =====================================================================
'use strict';

var ABSTENCAO = '__abstencao__';
var SITUACOES = ['certa', 'errada', 'abstencao', 'em_branco', 'anulada'];

// cópia rasa de `a` com os campos de `b` por cima (o lugar do espalhamento de objeto)
function junta(a, b) {
  var r = {}, k;
  for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) r[k] = a[k];
  for (k in (b || {})) if (Object.prototype.hasOwnProperty.call(b, k)) r[k] = b[k];
  return r;
}
function valores(o) { return Object.keys(o).map(function (k) { return o[k]; }); }

// `null`, `undefined` e '' NÃO são zero: `Number(null)` é 0, e uma regra com `min_pct: null` virava "mínimo de 0 %"
// (aprovado sempre) em vez de "sem critério".
function num(v, padrao) { return v == null || v === '' || !isFinite(Number(v)) ? padrao : Number(v); }
// Soma de pontos fracionários (0,1 por acerto) acumula ruído de ponto flutuante: nove acertos de 0,1 dão
// 0,8999999999999999 e ficariam ABAIXO de um mínimo de 0,9. Toda soma de pontos passa por aqui antes de ser comparada.
function arr(n) { return Math.round(n * 1e6) / 1e6; }
function conjunto(v) { return (Array.isArray(v) ? v : [v]).map(String).sort().join('|'); }

// Regra normalizada. Tudo que não vier cai no comportamento mais simples
// (1 ponto por acerto, sem desconto) — nunca num desconto presumido.
function normalizarRegra(r) {
  r = r === undefined ? {} : r;
  var d = r.desconto || {};
  var regra = {
    valor_certa: num(r.valor_certa, 1),
    // N erradas anulam o valor de 1 certa. 'inteiro' = só conjuntos completos.
    desconto: num(d.a_cada, 0) > 0 ? { a_cada: num(d.a_cada, 0), modo: d.modo === 'proporcional' ? 'proporcional' : 'inteiro' } : null,
    em_branco_conta_erro: !!r.em_branco_conta_erro,
    abstencao_conta_erro: !!r.abstencao_conta_erro,
    // item anulado: 'ponto_para_todos' (o usual) ou 'excluida' (sai do denominador)
    anulada: r.anulada === 'excluida' ? 'excluida' : 'ponto_para_todos',
    piso_zero: r.piso_zero !== false,
    minimos: (Array.isArray(r.minimos) ? r.minimos : []).map(function (m) { return { bloco: String(m.bloco || ''), min_pct: num(m.min_pct, null), min_pontos: num(m.min_pontos, null) }; }),
    // aprovação declarada SEM número nenhum (`{ min_pct: null }`) não é critério: fica nula, e o resultado diz "sem
    // critério cadastrado" — antes o nulo virava 0, e todo mundo "atingia o critério"
    aprovacao: r.aprovacao && (num(r.aprovacao.min_pct, null) != null || num(r.aprovacao.min_pontos, null) != null) ? { min_pct: num(r.aprovacao.min_pct, null), min_pontos: num(r.aprovacao.min_pontos, null) } : null,
    fonte: String(r.fonte || ''),
    formato: normalizarFormato(r.formato),
    // de que campo da questão sai o bloco desta regra: 'bloco' (o usual) ou 'disciplina' (prova repartida por
    // disciplina, como o ENAM: 16 de Constitucional, 10 de Administrativo...). Quem lê é a montagem da prova (aluno.js).
    bloco_por: r.bloco_por === 'disciplina' ? 'disciplina' : 'bloco',
    // o nome da linha geral quando há linhas a mais (`aprovacao.rotulo`; ex.: "ampla concorrência")
    rotulo_geral: String((r.aprovacao && r.aprovacao.rotulo) || '').trim().slice(0, 160),
    // LINHAS DE CORTE A MAIS, mostradas ao lado da geral, que NUNCA decidem o `aprovado`: o corte de quem concorre
    // por cota depende de uma declaração do candidato, e o Estude não pergunta isso (dado sensível) — mostra as duas.
    cortes_adicionais: normalizarCortes(r.cortes_adicionais, !!(r.aprovacao && (num(r.aprovacao.min_pct, null) != null || num(r.aprovacao.min_pontos, null) != null))),
    // REGRAS POR RAIZ DO PROGRAMA (ADR-0016): a prova montada só com questões de uma raiz que tem regra própria (a
    // trilha ENAM dentro do curso do TJDFT) é corrigida pela regra dela. Aqui só a lista; a regra vem de `regraDaRaiz`.
    raizes: normalizarRaizes(r.regras_por_raiz)
  };
  if (regra.valor_certa <= 0) throw new Error('regra de pontuação: valor_certa deve ser positivo.');
  return regra;
}
// [{ rotulo, min_pct?, min_pontos? }] — cada linha precisa de nome e de número; sem a linha geral não há linha a mais
function normalizarCortes(lista, temGeral) {
  if (lista == null) return [];
  if (!Array.isArray(lista)) throw new Error('regra de pontuação: cortes_adicionais deve ser uma lista.');
  if (lista.length && !temGeral) throw new Error('regra de pontuação: cortes_adicionais exige a linha geral (aprovacao).');
  return lista.map(function (c, i) {
    var x = { rotulo: String((c && c.rotulo) || '').trim().slice(0, 160), min_pct: num(c && c.min_pct, null), min_pontos: num(c && c.min_pontos, null) };
    if (!x.rotulo) throw new Error('regra de pontuação: cortes_adicionais[' + i + '] sem "rotulo".');
    if (x.min_pct == null && x.min_pontos == null) throw new Error('regra de pontuação: cortes_adicionais[' + i + '] sem min_pct nem min_pontos.');
    return x;
  });
}
// { "<código da raiz>": regra } — uma camada só: a regra da raiz não tem `regras_por_raiz` dentro
function normalizarRaizes(m) {
  if (m == null) return [];
  if (typeof m !== 'object' || Array.isArray(m)) throw new Error('regra de pontuação: regras_por_raiz deve ser um objeto { "<raiz do programa>": regra }.');
  return Object.keys(m).map(function (k) {
    var sub = m[k];
    if (!String(k).trim()) throw new Error('regra de pontuação: regras_por_raiz tem raiz sem código.');
    if (!sub || typeof sub !== 'object' || Array.isArray(sub)) throw new Error('regra de pontuação: a regra da raiz ' + k + ' deve ser um objeto.');
    if (sub.regras_por_raiz != null) throw new Error('regra de pontuação: a regra da raiz ' + k + ' não pode ter regras_por_raiz (uma camada só).');
    normalizarRegra(sub); // a regra da raiz passa pelas mesmas travas
    return String(k);
  });
}
// a regra CRUA da raiz (a que se congela na prova), ou null se a raiz não tem regra própria
function regraDaRaiz(regraCrua, raiz) {
  var m = regraCrua && regraCrua.regras_por_raiz;
  return m && typeof m === 'object' && !Array.isArray(m) && Object.prototype.hasOwnProperty.call(m, raiz) ? m[raiz] : null;
}

// FORMATO DA PROVA (opcional na regra): quantas questões a prova do edital tem, e quantas por bloco.
//   formato: { questoes: 100, blocos: { I: 40, II: 30, III: 30 } }
// Sem ele, a PROPORÇÃO dos blocos sai dos mínimos por bloco (edital com mínimo de 12, 9 e 9 acertos = 40/30/30),
// e "estar no formato" quer dizer: a prova segue essa proporção e todo mínimo da regra é alcançável nela.
function normalizarFormato(f) {
  if (!f || typeof f !== 'object') return null;
  var blocos = {}, origem = f.blocos && typeof f.blocos === 'object' ? f.blocos : {};
  Object.keys(origem).forEach(function (k) { var n = Math.round(num(origem[k], 0)); if (n > 0) blocos[String(k)] = n; });
  var soma = valores(blocos).reduce(function (a, b) { return a + b; }, 0), questoes = Math.round(num(f.questoes, 0)) || soma;
  return questoes > 0 ? { questoes: questoes, blocos: blocos } : null;
}
// Os blocos da regra com o PESO de cada um na prova: do formato cadastrado; sem ele, dos mínimos por bloco.
// `null` = a regra não divide a prova em blocos (não há o que repartir).
function blocosDaRegra(regraCrua) {
  var regra = normalizarRegra(regraCrua === undefined ? {} : regraCrua);
  if (regra.formato && Object.keys(regra.formato.blocos).length) return { origem: 'formato', questoes: regra.formato.questoes, blocos: Object.keys(regra.formato.blocos).map(function (bloco) { return { bloco: bloco, peso: regra.formato.blocos[bloco] }; }) };
  var comMin = regra.minimos.filter(function (m) { return m.bloco && (m.min_pontos > 0 || m.min_pct > 0); });
  if (comMin.length < 2) return null;
  // mínimo em pontos → proporção pelos pontos; só percentual → partes iguais
  var emPontos = comMin.every(function (m) { return m.min_pontos > 0; });
  return { origem: 'minimos', questoes: regra.formato ? regra.formato.questoes : null, blocos: comMin.map(function (m) { return { bloco: m.bloco, peso: emPontos ? m.min_pontos : 1 }; }) };
}
// Reparte `n` questões pelos blocos, na proporção dos pesos (maiores restos): 100 → 40/30/30; 10 → 4/3/3.
function repartirPorBloco(n, blocos) {
  var total = blocos.reduce(function (a, b) { return a + b.peso; }, 0);
  var partes = blocos.map(function (b, i) { var exato = n * b.peso / total; return { bloco: b.bloco, n: Math.floor(exato + 1e-9), resto: exato - Math.floor(exato + 1e-9), i: i }; });
  var falta = n - partes.reduce(function (a, p) { return a + p.n; }, 0);
  var porResto = partes.slice().sort(function (a, b) { return b.resto - a.resto || a.i - b.i; });
  for (var k = 0; k < porResto.length; k++) { if (falta <= 0) break; porResto[k].n++; falta--; }
  return partes.map(function (p) { return { bloco: p.bloco, questoes: p.n }; });
}
// A prova (os itens congelados) cabe na regra? → { definido, ok, motivos[], questoes, maximo, por_bloco }
//   definido  a regra tem critério (mínimo por bloco ou mínimo geral); sem isso não há veredito a dar
//   ok        a prova tem O FORMATO da regra — só então "atingiu / não atingiu" faz sentido
// O FORMATO (réplica de 11/10/2026, M1): os mínimos do edital são PONTOS ABSOLUTOS (1,2 · 0,9 · 0,9 · 6,0 na
// magistratura do trabalho), pensados para a prova de 100 questões. Só perguntar "o mínimo é alcançável?" dava
// "atingiu" a quem acertava 30 % de um simulado de 200 e "não atingiu" a quem acertava 59 de 60. Agora:
//   · regra COM `formato` cadastrado: a prova tem de ter EXATAMENTE o total e as questões por bloco do edital —
//     nem menor, nem MAIOR;
//   · regra SEM `formato`: os blocos têm de estar na proporção dos mínimos (a mesma repartição que monta o
//     simulado) e todo mínimo tem de ser alcançável. Sem o total cadastrado não há como saber que a prova é maior
//     que a do edital: quem fecha esse caso é o cadastro do `formato` no escopo.
// Prova de 10 questões num edital de 100 continua fora do formato: os mínimos são inalcançáveis, e a tela diz
// "prova fora do formato do edital: sem veredito" em vez de "Não atingiu".
function formatoDaProva(itens, regraCrua) {
  var regra = normalizarRegra(regraCrua === undefined ? {} : regraCrua);
  var definido = !!(regra.aprovacao || regra.minimos.length);
  var porBloco = {}, maximo = 0, questoes = 0;
  (itens || []).forEach(function (i) {
    // o FORMATO conta toda questão da prova; a anulada que a regra tira do denominador só não soma no máximo
    var b = String(i.bloco || ''), vale = i.anulada && regra.anulada === 'excluida' ? 0 : regra.valor_certa * num(i.peso, 1);
    porBloco[b] = porBloco[b] || { bloco: b, questoes: 0, maximo: 0 };
    porBloco[b].questoes++; porBloco[b].maximo = arr(porBloco[b].maximo + vale); maximo = arr(maximo + vale); questoes++;
  });
  var motivos = [];
  function br(n) { return String(n).replace('.', ','); } // o motivo vai à tela: número com vírgula
  function tem(b) { return (porBloco[b] || {}).questoes || 0; }
  if (regra.formato) {
    var F = regra.formato, doEdital = Object.keys(F.blocos);
    if (questoes !== F.questoes) motivos.push('a prova tem ' + questoes + ' questões; a do edital tem ' + F.questoes);
    doEdital.forEach(function (b) {
      var n = F.blocos[b];
      if (tem(b) < n) motivos.push('o bloco ' + b + ' tem ' + tem(b) + ' de ' + n + ' questões');
      else if (tem(b) > n) motivos.push('o bloco ' + b + ' tem ' + tem(b) + ' questões; o do edital tem ' + n);
    });
    if (doEdital.length) Object.keys(porBloco).forEach(function (b) { if (doEdital.indexOf(b) < 0) motivos.push(b ? 'o bloco ' + b + ' não é bloco da prova do edital' : 'há ' + tem(b) + ' questão(ões) fora dos blocos do edital'); });
  } else {
    var rep = blocosDaRegra(regra);
    if (rep && questoes > 0) {
      var nomes = rep.blocos.map(function (b) { return b.bloco; });
      repartirPorBloco(questoes, rep.blocos).forEach(function (p) {
        if (tem(p.bloco) && tem(p.bloco) !== p.questoes) motivos.push('o bloco ' + p.bloco + ' tem ' + tem(p.bloco) + ' questões; na proporção do edital seriam ' + p.questoes + ' de ' + questoes);
      });
      Object.keys(porBloco).forEach(function (b) { if (nomes.indexOf(b) < 0) motivos.push(b ? 'o bloco ' + b + ' não é bloco da regra do edital' : 'há ' + tem(b) + ' questão(ões) fora dos blocos do edital'); });
    }
  }
  regra.minimos.forEach(function (m) {
    var b = porBloco[m.bloco];
    if (!b) motivos.push('o bloco ' + m.bloco + ' não tem questão nesta prova');
    else if (m.min_pontos != null && b.maximo < m.min_pontos) motivos.push('o bloco ' + m.bloco + ' vale no máximo ' + br(b.maximo) + ' e o mínimo dele é ' + br(m.min_pontos));
  });
  if (regra.aprovacao && regra.aprovacao.min_pontos != null && maximo < regra.aprovacao.min_pontos) motivos.push('a prova vale no máximo ' + br(maximo) + ' e o mínimo geral é ' + br(regra.aprovacao.min_pontos));
  var unicos = motivos.filter(function (m, i) { return motivos.indexOf(m) === i; });
  return { definido: definido, ok: definido && !unicos.length, motivos: unicos, questoes: questoes, maximo: maximo, por_bloco: valores(porBloco) };
}

function situacaoDoItem(item, resposta) {
  if (item.anulada) return 'anulada';
  if (resposta === ABSTENCAO) return 'abstencao';
  if (resposta == null || resposta === '' || (Array.isArray(resposta) && !resposta.length)) return 'em_branco';
  return conjunto(resposta) === conjunto(item.gabarito) ? 'certa' : 'errada';
}

// itens: [{ id, gabarito, bloco?, peso?, anulada? }] · respostas: { [id]: valor }
function corrigir(itens, respostas, regraCrua) {
  respostas = respostas === undefined ? {} : respostas;
  var regra = normalizarRegra(regraCrua === undefined ? {} : regraCrua);
  var blocos = {};
  // erradas = marcou a alternativa errada. erros_contados = o que a REGRA trata como erro para o
  // desconto (pode incluir em branco e abstenção). Somar as duas coisas num número só confunde quem lê a nota.
  function bloco(nome) { return (blocos[nome] = blocos[nome] || { bloco: nome, certas: 0, erradas: 0, erros_contados: 0, abstencoes: 0, em_branco: 0, anuladas: 0, pontos_brutos: 0, maximo: 0 }); }
  var porItem = [];
  itens.forEach(function (item) {
    if (item.gabarito == null && !item.anulada) throw new Error('item ' + item.id + ': sem gabarito — não entra em correção automática.');
    var sit = situacaoDoItem(item, respostas[item.id]);
    var peso = num(item.peso, 1);
    var b = bloco(String(item.bloco || ''));
    var vale = regra.valor_certa * peso;
    var pontos = 0, conta = true;
    if (sit === 'anulada') {
      b.anuladas++;
      if (regra.anulada === 'excluida') conta = false; else pontos = vale;
    } else if (sit === 'certa') { b.certas++; pontos = vale; }
    else if (sit === 'abstencao') { b.abstencoes++; if (regra.abstencao_conta_erro) b.erros_contados++; }
    else if (sit === 'em_branco') { b.em_branco++; if (regra.em_branco_conta_erro) b.erros_contados++; }
    else { b.erradas++; b.erros_contados++; }
    if (conta) b.maximo += vale;
    b.pontos_brutos += pontos;
    porItem.push({ id: item.id, situacao: sit, pontos: pontos, bloco: b.bloco });
  });
  var lista = valores(blocos);
  lista.forEach(function (b) { b.pontos_brutos = arr(b.pontos_brutos); b.maximo = arr(b.maximo); });
  function soma(k) { return lista.reduce(function (a, b) { return a + b[k]; }, 0); }
  var bruta = arr(soma('pontos_brutos')), maximo = arr(soma('maximo')), erros = soma('erros_contados');
  var descontados = 0;
  if (regra.desconto) {
    var conjuntos = regra.desconto.modo === 'inteiro' ? Math.floor(erros / regra.desconto.a_cada) : erros / regra.desconto.a_cada;
    descontados = arr(conjuntos * regra.valor_certa);
  }
  var liquida = arr(bruta - descontados);
  if (regra.piso_zero && liquida < 0) liquida = 0;
  function pct(p, m) { return m > 0 ? Math.round((p / m) * 1000) / 10 : 0; }

  var minimos = regra.minimos.map(function (m) {
    var b = blocos[m.bloco];
    if (!b) return junta(m, { atendido: null, motivo: 'bloco sem itens nesta prova' });
    var atendido = (m.min_pct == null || pct(b.pontos_brutos, b.maximo) >= m.min_pct) && (m.min_pontos == null || b.pontos_brutos >= m.min_pontos);
    return junta(m, { obtido_pct: pct(b.pontos_brutos, b.maximo), obtido_pontos: b.pontos_brutos, atendido: atendido });
  });
  var aprovado = null; // null = a regra não define critério; não se inventa um
  if (regra.aprovacao) {
    aprovado = (regra.aprovacao.min_pct == null || pct(liquida, maximo) >= regra.aprovacao.min_pct)
      && (regra.aprovacao.min_pontos == null || liquida >= regra.aprovacao.min_pontos)
      && minimos.every(function (m) { return m.atendido !== false; });
  }
  var saida = {
    nota_bruta: bruta, descontados: descontados, nota_liquida: liquida, maximo: maximo, pct_liquido: pct(liquida, maximo),
    certas: soma('certas'), erradas: soma('erradas'), erros_contados: erros, abstencoes: soma('abstencoes'), em_branco: soma('em_branco'), anuladas: soma('anuladas'),
    por_bloco: lista, minimos: minimos, aprovado: aprovado, por_item: porItem, regra: regra
  };
  // as LINHAS DE CORTE lado a lado (só quando a regra tem linha a mais): a geral e as adicionais, cada uma com o seu
  // "atingiu". O `aprovado` continua o da linha geral.
  if (regra.aprovacao && regra.cortes_adicionais.length) {
    var atinge = function (c) {
      return (c.min_pct == null || pct(liquida, maximo) >= c.min_pct) && (c.min_pontos == null || liquida >= c.min_pontos) && minimos.every(function (m) { return m.atendido !== false; });
    };
    saida.cortes = [{ rotulo: regra.rotulo_geral || 'geral', min_pct: regra.aprovacao.min_pct, min_pontos: regra.aprovacao.min_pontos, atingido: aprovado }]
      .concat(regra.cortes_adicionais.map(function (c) { return junta(c, { atingido: atinge(c) }); }));
  }
  return saida;
}

module.exports = { corrigir: corrigir, normalizarRegra: normalizarRegra, situacaoDoItem: situacaoDoItem, blocosDaRegra: blocosDaRegra, repartirPorBloco: repartirPorBloco, formatoDaProva: formatoDaProva, regraDaRaiz: regraDaRaiz, ABSTENCAO: ABSTENCAO, SITUACOES: SITUACOES };
