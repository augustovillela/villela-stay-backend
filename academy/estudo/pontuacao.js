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
    minimos: normalizarMinimos(r.minimos),
    // aprovação declarada SEM número nenhum (`{ min_pct: null }`) não é critério: fica nula, e o resultado diz "sem
    // critério cadastrado" — antes o nulo virava 0, e todo mundo "atingia o critério"
    aprovacao: temCorte(r.aprovacao) ? comNota({ min_pct: num(r.aprovacao.min_pct, null), min_pontos: num(r.aprovacao.min_pontos, null) }, r.aprovacao) : null,
    fonte: String(r.fonte || ''),
    formato: normalizarFormato(r.formato),
    // de que campo da questão sai o bloco desta regra: 'bloco' (o usual), 'disciplina' (prova repartida por
    // disciplina, como o ENAM: 16 de Constitucional, 10 de Administrativo...) ou 'escopo' (cada bloco é um percurso do
    // MESMO curso: ADR-0019). Quem lê é a montagem da prova (aluno.js).
    bloco_por: r.bloco_por === 'disciplina' || r.bloco_por === 'escopo' ? r.bloco_por : 'bloco',
    // o nome da linha geral quando há linhas a mais (`aprovacao.rotulo`; ex.: "ampla concorrência")
    rotulo_geral: String((r.aprovacao && r.aprovacao.rotulo) || '').trim().slice(0, 160),
    // LINHAS DE CORTE A MAIS, mostradas ao lado da geral, que NUNCA decidem o `aprovado`: o corte de quem concorre
    // por cota depende de uma declaração do candidato, e o Estude não pergunta isso (dado sensível) — mostra as duas.
    cortes_adicionais: normalizarCortes(r.cortes_adicionais, temCorte(r.aprovacao)),
    // REGRAS POR RAIZ DO PROGRAMA (ADR-0016): a prova montada só com questões de uma raiz que tem regra própria (a
    // trilha ENAM dentro do curso do TJDFT) é corrigida pela regra dela. Aqui só a lista; a regra vem de `regraDaRaiz`.
    raizes: normalizarRaizes(r.regras_por_raiz)
  };
  if (regra.valor_certa <= 0) throw new Error('regra de pontuação: valor_certa deve ser positivo.');
  if (regra.bloco_por === 'escopo') regra.blocos_escopos = normalizarBlocosEscopos(r.blocos_escopos, regra.formato);
  if (r.modo === 'media_ponderada') normalizarMedia(regra, r);
  else {
    if (r.modo != null && r.modo !== '' && r.modo !== 'soma') throw new Error('regra de pontuação: modo deve ser soma ou media_ponderada.');
    if ((regra.aprovacao && regra.aprovacao.min_nota != null) || regra.cortes_adicionais.some(function (c) { return c.min_nota != null; })) throw new Error('regra de pontuação: min_nota só existe no modo media_ponderada.');
  }
  return regra;
}
function normalizarMinimos(lista) {
  return (Array.isArray(lista) ? lista : []).map(function (m) { return { bloco: String(m.bloco || ''), min_pct: num(m.min_pct, null), min_pontos: num(m.min_pontos, null) }; });
}
function temCorte(a) { return !!a && (num(a.min_pct, null) != null || num(a.min_pontos, null) != null || num(a.min_nota, null) != null); }
// `min_nota` só entra no objeto quando existe: a regra de soma continua com a forma de sempre
function comNota(x, cru) { if (num(cru.min_nota, null) != null) x.min_nota = num(cru.min_nota, null); return x; }
function mesmasChaves(a, b) { return Object.keys(a).sort().join('|') === Object.keys(b).sort().join('|'); }
// MÉDIA PONDERADA (ADR-0019): cada bloco vira nota numa escala (acertos ÷ máximo do bloco × escala) e só então se pondera.
// É outra conta, não a soma com outro nome: com 24 de 24 em Gerais (peso 1) e 0 de 36 em Específicos (peso 2), a média dá
// 3,33 e a soma daria 40 %. O corte da média é `min_nota`; os mínimos por bloco continuam em `minimos`, em pontos do bloco.
function normalizarMedia(regra, r) {
  regra.modo = 'media_ponderada';
  regra.escala = num(r.escala, 10);
  if (regra.escala <= 0) throw new Error('regra de pontuação: escala deve ser positiva.');
  var p = r.pesos, pesos = {};
  if (!p || typeof p !== 'object' || Array.isArray(p) || !Object.keys(p).length) throw new Error('regra de pontuação: media_ponderada exige pesos { "<bloco>": peso }.');
  Object.keys(p).forEach(function (b) {
    if (!(num(p[b], 0) > 0)) throw new Error('regra de pontuação: o peso do bloco ' + b + ' deve ser positivo.');
    pesos[b] = num(p[b], 0);
  });
  regra.pesos = pesos;
  // desconto é por prova inteira no modo soma; por bloco normalizado ninguém definiu como é, e não se presume
  if (regra.desconto) throw new Error('regra de pontuação: media_ponderada não aceita desconto.');
  function foraDosPesos(lista, onde) { lista.forEach(function (m) { if (!Object.prototype.hasOwnProperty.call(pesos, m.bloco)) throw new Error('regra de pontuação: ' + onde + ' cita o bloco ' + m.bloco + ', que não está em pesos.'); }); }
  function so(x, onde) {
    if (x.min_pct != null || x.min_pontos != null) throw new Error('regra de pontuação: ' + onde + ' de media_ponderada usa min_nota, não min_pct nem min_pontos.');
    if (x.min_nota == null) throw new Error('regra de pontuação: ' + onde + ' de media_ponderada exige min_nota.');
    if (x.min_nota > regra.escala) throw new Error('regra de pontuação: ' + onde + ' tem min_nota acima da escala.');
  }
  foraDosPesos(regra.minimos, 'minimos');
  if (regra.aprovacao) so(regra.aprovacao, 'aprovacao');
  regra.cortes_adicionais.forEach(function (c) { so(c, 'o corte "' + c.rotulo + '"'); if (c.minimos) foraDosPesos(c.minimos, 'o corte "' + c.rotulo + '"'); });
  if (regra.formato && Object.keys(regra.formato.blocos).length && !mesmasChaves(regra.formato.blocos, pesos)) throw new Error('regra de pontuação: os blocos do formato e os de pesos têm de ser os mesmos.');
}
// BLOCO POR PERCURSO (ADR-0019): { "<bloco>": "<slug de um percurso do mesmo curso>" }. Aqui só a forma; que o slug existe no
// curso, a importação confere (repo.js). O formato é obrigatório: sem ele não há quantas questões tirar de cada percurso.
function normalizarBlocosEscopos(m, formato) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || !Object.keys(m).length) throw new Error('regra de pontuação: bloco_por "escopo" exige blocos_escopos { "<bloco>": "<percurso>" }.');
  if (!formato || !mesmasChaves(formato.blocos, m)) throw new Error('regra de pontuação: bloco_por "escopo" exige formato com os mesmos blocos de blocos_escopos.');
  var r = {}, vistos = [];
  Object.keys(m).forEach(function (b) {
    var slug = String(m[b] || '').trim();
    if (!slug) throw new Error('regra de pontuação: o bloco ' + b + ' está sem percurso em blocos_escopos.');
    if (vistos.indexOf(slug) >= 0) throw new Error('regra de pontuação: o percurso ' + slug + ' aparece em dois blocos de blocos_escopos.');
    vistos.push(slug); r[b] = slug;
  });
  return r;
}
// [{ rotulo, min_pct?, min_pontos? }] — cada linha precisa de nome e de número; sem a linha geral não há linha a mais
function normalizarCortes(lista, temGeral) {
  if (lista == null) return [];
  if (!Array.isArray(lista)) throw new Error('regra de pontuação: cortes_adicionais deve ser uma lista.');
  if (lista.length && !temGeral) throw new Error('regra de pontuação: cortes_adicionais exige a linha geral (aprovacao).');
  return lista.map(function (c, i) {
    var x = comNota({ rotulo: String((c && c.rotulo) || '').trim().slice(0, 160), min_pct: num(c && c.min_pct, null), min_pontos: num(c && c.min_pontos, null) }, c || {});
    if (!x.rotulo) throw new Error('regra de pontuação: cortes_adicionais[' + i + '] sem "rotulo".');
    if (x.min_pct == null && x.min_pontos == null && x.min_nota == null) throw new Error('regra de pontuação: cortes_adicionais[' + i + '] sem min_pct nem min_pontos nem min_nota.');
    // a linha pode ter mínimos por bloco próprios (TRF-3: 10 e 15 para cotistas, contra 12 e 18); sem eles, valem os da regra
    if (Array.isArray(c.minimos)) x.minimos = normalizarMinimos(c.minimos);
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
    // a regra da raiz passa pelas mesmas travas; o bloco por percurso (ADR-0019) é só da regra do percurso
    if (normalizarRegra(sub).bloco_por === 'escopo') throw new Error('regra de pontuação: a regra da raiz ' + k + ' não pode ter bloco_por "escopo".');
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
  if (regra.modo === 'media_ponderada') {
    // média sem um dos blocos ponderados não é a média do edital, e bloco fora dos pesos não entraria na conta
    Object.keys(regra.pesos).forEach(function (b) { if (!tem(b)) motivos.push('o bloco ' + b + ' não tem questão nesta prova'); });
    Object.keys(porBloco).forEach(function (b) { if (!Object.prototype.hasOwnProperty.call(regra.pesos, b)) motivos.push(b ? 'o bloco ' + b + ' não é bloco da regra do edital' : 'há ' + tem(b) + ' questão(ões) fora dos blocos do edital'); });
  }
  var unicos = motivos.filter(function (m, i) { return motivos.indexOf(m) === i; });
  return { definido: definido, ok: definido && !unicos.length, motivos: unicos, questoes: questoes, maximo: maximo, por_bloco: valores(porBloco) };
}

function situacaoDoItem(item, resposta) {
  if (item.anulada) return 'anulada';
  if (resposta === ABSTENCAO) return 'abstencao';
  if (resposta == null || resposta === '' || (Array.isArray(resposta) && !resposta.length)) return 'em_branco';
  return conjunto(resposta) === conjunto(item.gabarito) ? 'certa' : 'errada';
}

// A nota de cada bloco na escala e a média pelos pesos. Bloco ponderado sem questão na prova (ou com o máximo zerado por
// anulação) fica de fora da média e vai em `ausentes`: a nota de um treino só de um bloco é a dele, sem veredito.
function notaPonderada(regra, blocos) {
  var pesoTotal = 0, acumulado = 0, ausentes = [];
  var linhas = Object.keys(regra.pesos).map(function (nome) {
    var b = blocos[nome], peso = regra.pesos[nome];
    if (!b || !(b.maximo > 0)) { ausentes.push(nome); return { bloco: nome, peso: peso, nota: null }; }
    var nota = b.pontos_brutos / b.maximo * regra.escala;
    pesoTotal += peso; acumulado += nota * peso;
    b.peso = peso; b.nota = arr(nota);
    return { bloco: nome, peso: peso, nota: arr(nota) };
  });
  return { escala: regra.escala, nota: pesoTotal > 0 ? arr(acumulado / pesoTotal) : 0, blocos: linhas, ausentes: ausentes };
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
  // na média ponderada, a nota da prova é a média (e o máximo, a escala): a tela e o resto do motor leem os mesmos campos
  var media = regra.modo === 'media_ponderada' ? notaPonderada(regra, blocos) : null;
  var bruta = media ? media.nota : arr(soma('pontos_brutos')), maximo = media ? regra.escala : arr(soma('maximo')), erros = soma('erros_contados');
  var descontados = 0;
  if (regra.desconto) {
    var conjuntos = regra.desconto.modo === 'inteiro' ? Math.floor(erros / regra.desconto.a_cada) : erros / regra.desconto.a_cada;
    descontados = arr(conjuntos * regra.valor_certa);
  }
  var liquida = arr(bruta - descontados);
  if (regra.piso_zero && liquida < 0) liquida = 0;
  function pct(p, m) { return m > 0 ? Math.round((p / m) * 1000) / 10 : 0; }

  function avaliarMinimos(lista) {
    return lista.map(function (m) {
      var b = blocos[m.bloco];
      if (!b) return junta(m, { atendido: null, motivo: 'bloco sem itens nesta prova' });
      var atendido = (m.min_pct == null || pct(b.pontos_brutos, b.maximo) >= m.min_pct) && (m.min_pontos == null || b.pontos_brutos >= m.min_pontos);
      return junta(m, { obtido_pct: pct(b.pontos_brutos, b.maximo), obtido_pontos: b.pontos_brutos, atendido: atendido });
    });
  }
  var minimos = avaliarMinimos(regra.minimos);
  // uma linha de corte: a nota dela e os mínimos dela (a linha sem mínimos próprios usa os da regra)
  // média sem um dos blocos ponderados não decide nada: `null`, e não um "não atingiu" que a prova não mediu
  function cumpre(c, mins) {
    if (media && media.ausentes.length) return null;
    return (c.min_pct == null || pct(liquida, maximo) >= c.min_pct) && (c.min_pontos == null || liquida >= c.min_pontos) && (c.min_nota == null || liquida >= c.min_nota)
      && mins.every(function (m) { return m.atendido !== false; });
  }
  var aprovado = regra.aprovacao ? cumpre(regra.aprovacao, minimos) : null; // null = a regra não define critério; não se inventa um
  var saida = {
    nota_bruta: bruta, descontados: descontados, nota_liquida: liquida, maximo: maximo, pct_liquido: pct(liquida, maximo),
    certas: soma('certas'), erradas: soma('erradas'), erros_contados: erros, abstencoes: soma('abstencoes'), em_branco: soma('em_branco'), anuladas: soma('anuladas'),
    por_bloco: lista, minimos: minimos, aprovado: aprovado, por_item: porItem, regra: regra
  };
  if (media) saida.media_ponderada = media;
  // as LINHAS DE CORTE lado a lado (só quando a regra tem linha a mais): a geral e as adicionais, cada uma com o seu
  // "atingiu". O `aprovado` continua o da linha geral.
  if (regra.aprovacao && regra.cortes_adicionais.length) {
    saida.cortes = [comNota({ rotulo: regra.rotulo_geral || 'geral', min_pct: regra.aprovacao.min_pct, min_pontos: regra.aprovacao.min_pontos, atingido: aprovado }, regra.aprovacao)]
      .concat(regra.cortes_adicionais.map(function (c) {
        var mins = c.minimos ? avaliarMinimos(c.minimos) : minimos, x = junta(c, { atingido: cumpre(c, mins) });
        if (c.minimos) x.minimos = mins;
        return x;
      }));
  }
  return saida;
}

module.exports = { corrigir: corrigir, normalizarRegra: normalizarRegra, situacaoDoItem: situacaoDoItem, blocosDaRegra: blocosDaRegra, repartirPorBloco: repartirPorBloco, formatoDaProva: formatoDaProva, regraDaRaiz: regraDaRaiz, ABSTENCAO: ABSTENCAO, SITUACOES: SITUACOES };
