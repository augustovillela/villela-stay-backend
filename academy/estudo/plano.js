// =====================================================================
// Villela Academy — ESTUDO · PLANO dentro do tempo que o aluno TEM. Puro.
//
// "Otimizar o tempo" aqui é não desperdiçar e priorizar sob restrição
// conhecida — não é garantir que tudo cabe (prompt mestre, seção 3.1).
// Três compromissos que este arquivo existe para cumprir:
//   1. nunca criar hora que o aluno não declarou;
//   2. nunca tirar item do programa em silêncio — o que não coube volta
//      em `pendentes`, com os minutos que faltam;
//   3. mostrar o déficit em FAIXA, porque o esforço é estimativa.
//
// ESTE ARQUIVO VAI AO NAVEGADOR (estudo/motores-navegador.js), servido cru:
// é escrito em ES5 — `var` e `function`, sem seta, sem `const`/`let`, sem
// texto com crase, sem espalhamento nem desestruturação, sem Map/Set
// (réplica de 11/10/2026, R3-B11). O teste de testes-auditoria-b2.js recusa
// sintaxe mais nova aqui.
// =====================================================================
'use strict';
var somarDias = require('./agenda').somarDias;

var DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
var MARGEM_PADRAO_PCT = 15;   // imprevistos
var REVISAO_PADRAO_PCT = 20;  // fatia de cada sessão reservada a retomadas
var HORIZONTE_SEM_PRAZO = 730;
// PISO DO BLOCO DE ESTUDO (réplica de 11/10/2026, R2-B9): o plano saía com blocos de 2 a 6 minutos ("1.1.30 · 2 min")
// — a sobra do fim de uma sessão virava o começo da aula seguinte, e o finzinho de uma aula virava o começo da
// sessão seguinte. Bloco menor que isto não é sessão de estudo. Ver `alocar`.
var SESSAO_MIN_MINUTOS = 10;

function int(v) { return Math.max(0, Math.round(Number(v) || 0)); }
function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
// cópia rasa de `a` com os campos de `b` por cima (o lugar do espalhamento de objeto)
function junta(a, b) {
  var r = {}, k;
  for (k in a) if (tem(a, k)) r[k] = a[k];
  for (k in (b || {})) if (tem(b, k)) r[k] = b[k];
  return r;
}
function primeiro(lista, fn) { for (var i = 0; i < lista.length; i++) if (fn(lista[i])) return lista[i]; return undefined; }

function minutosPorDia(disponibilidade) {
  var d = disponibilidade || {};
  var lista = Array.isArray(d) ? d.slice(0, 7) : DIAS.map(function (k) { return d[k]; });
  var r = lista.map(int);
  while (r.length < 7) r.push(0);
  if (r.some(function (m) { return m > 16 * 60; })) throw new Error('disponibilidade: mais de 16 horas de estudo num dia não é um plano.');
  return r;
}

// Dias de hoje (inclusive) até a véspera do fim, com os minutos declarados.
function capacidade(o) {
  var hoje = o.hoje, fim = o.fim, indisponiveis = o.indisponiveis === undefined ? [] : o.indisponiveis;
  var margemPct = o.margem_pct === undefined ? MARGEM_PADRAO_PCT : o.margem_pct;
  var porDia = minutosPorDia(o.disponibilidade);
  if (!porDia.some(Boolean)) throw new Error('Informe ao menos um dia da semana com tempo de estudo.');
  var fora = {};
  (indisponiveis || []).forEach(function (x) { fora[x] = true; });
  var dias = [];
  for (var data = hoje; data < fim; data = somarDias(data, 1)) {
    var minutos = tem(fora, data) ? 0 : porDia[new Date(data + 'T00:00:00Z').getUTCDay()];
    if (minutos) dias.push({ data: data, minutos: minutos });
  }
  var bruta = dias.reduce(function (a, d) { return a + d.minutos; }, 0);
  var margem = Math.round(bruta * (margemPct / 100));
  return { dias: dias, bruta_min: bruta, margem_min: margem, util_min: bruta - margem, margem_pct: margemPct };
}

// esforco_min de cada item é uma FAIXA [mínimo, máximo] em minutos.
function esforcoTotal(itens) {
  var sem = [], min = 0, max = 0;
  itens.forEach(function (it) {
    var f = Array.isArray(it.esforco_min) ? it.esforco_min.map(int) : null;
    if (!f || f.length < 2 || !f[1]) { sem.push(it.codigo); return; }
    min += Math.min(f[0], f[1]); max += Math.max(f[0], f[1]);
  });
  return { min: min, max: max, sem_estimativa: sem };
}

function viabilidade(cap, itens) {
  var e = esforcoTotal(itens);
  function falta(n) { return Math.max(0, n - cap.util_min); }
  return {
    capacidade_bruta_min: cap.bruta_min, margem_min: cap.margem_min, capacidade_util_min: cap.util_min,
    esforco_min: [e.min, e.max], deficit_min: [falta(e.min), falta(e.max)],
    situacao: e.max <= cap.util_min ? 'cabe' : e.min <= cap.util_min ? 'apertado' : 'nao_cabe',
    sem_estimativa: e.sem_estimativa
  };
}

// Pré-requisito antes de quem depende dele; depois peso maior; depois a ordem do programa.
function ordenar(itens) {
  var porCodigo = {}, visto = {}, saida = [];
  itens.forEach(function (i) { porCodigo[i.codigo] = i; });
  var base = itens.slice().sort(function (a, b) { return (Number(b.peso) || 0) - (Number(a.peso) || 0) || (a.ordem || 0) - (b.ordem || 0); });
  function visitar(it, pilha) {
    if (tem(visto, it.codigo)) return;
    if (tem(pilha, it.codigo)) throw new Error('plano: dependência circular em ' + it.codigo + '.');
    pilha[it.codigo] = true;
    (it.depende_de || []).forEach(function (d) { if (tem(porCodigo, d)) visitar(porCodigo[d], pilha); });
    delete pilha[it.codigo];
    visto[it.codigo] = true; saida.push(it);
  }
  base.forEach(function (it) { visitar(it, {}); });
  return saida;
}

// Distribui a fila de itens pelas sessões. A conta é exata, minuto a minuto: o que a sessão tem de tempo novo
// (`util − reserva de retomada`) sai da fila, e o que não coube volta em `pendentes`.
// PISO DO BLOCO (`SESSAO_MIN_MINUTOS`; `sessao_min: 0` desliga): dois ajustes que NÃO mexem na conta "cabe / não
// cabe" — só trocam minutos entre a retomada e o estudo de DUAS sessões vizinhas, e só quando a vizinha comporta:
//   (a) sobraram menos minutos que o piso no fim da sessão e a aula seguinte não termina neles → a sobra vira
//       retomada HOJE, e a sessão seguinte devolve os mesmos minutos da retomada dela ao estudo (a aula nova começa
//       lá, inteira);
//   (b) faltariam menos minutos que o piso para terminar a aula → ela TERMINA hoje, com minutos tirados da retomada
//       de hoje, e a sessão seguinte devolve os mesmos minutos do estudo à retomada.
// Nos dois casos o total de estudo e o total de retomada do par de sessões são os de antes, e nenhuma sessão passa
// do tempo que o aluno declarou. Quando a sessão vizinha não comporta a troca (é a última, ou não tem a folga), o
// bloco pequeno fica como está: a conta vem antes da estética. Aula cujo esforço INTEIRO é menor que o piso não é
// "bloco quebrado" e também fica.
function alocar(cap, itens, o) {
  o = o === undefined ? {} : o;
  var revisaoPct = o.revisao_pct === undefined ? REVISAO_PADRAO_PCT : o.revisao_pct;
  var piso = o.sessao_min === undefined ? SESSAO_MIN_MINUTOS : int(o.sessao_min);
  var fila = ordenar(itens.filter(function (i) { return Array.isArray(i.esforco_min) && i.esforco_min[1]; }))
    .map(function (i) { return { codigo: i.codigo, resta: Math.round((int(i.esforco_min[0]) + int(i.esforco_min[1])) / 2) }; });
  var fator = (1 - cap.margem_pct / 100);
  // o tempo do dia pela regra de sempre (antes de qualquer troca do piso)
  function doDia(d, comFila) {
    var util = Math.floor(d.minutos * fator);
    // na revisão geral (reta final) a matéria nova fica com a fração menor do dia; o resto é retomada
    var revisao = !comFila ? util : d.fase === 'revisao_geral' ? util - Math.floor(util * FRACAO_NOVA_NA_REVISAO_GERAL) : Math.floor(util * (revisaoPct / 100));
    return { util: util, revisao: revisao };
  }
  var sessoes = [], devo = 0; // `devo`: minutos que ESTA sessão passa do estudo à retomada (negativo: da retomada ao estudo)
  for (var k = 0; k < cap.dias.length; k++) {
    var d = cap.dias[k], t = doDia(d, fila.length > 0), util = t.util, revisao = t.revisao;
    if (devo) { if (fila.length) revisao += devo; devo = 0; }
    var prox = piso && k + 1 < cap.dias.length ? doDia(cap.dias[k + 1], true) : null;
    var livre = util - revisao;
    var blocos = [];
    while (livre > 0 && fila.length) {
      var resta = fila[0].resta;
      // (a) sobra menor que o piso, e a aula seguinte não termina nela: fica para a sessão seguinte
      if (prox && blocos.length && livre < piso && resta > livre && prox.revisao >= livre) { revisao += livre; devo = -livre; livre = 0; break; }
      var usa = Math.min(livre, resta), sobra = resta - usa;
      // (b) faltaria menos que o piso para terminar a aula: termina hoje (e a sessão seguinte ainda fica com um bloco inteiro)
      if (prox && sobra > 0 && sobra < piso && revisao >= sobra && prox.util - prox.revisao - sobra >= piso) { usa += sobra; livre += sobra; revisao -= sobra; devo = sobra; prox = null; }
      blocos.push({ codigo: fila[0].codigo, minutos: usa });
      fila[0].resta -= usa; livre -= usa;
      if (!fila[0].resta) fila.shift();
    }
    if (blocos.length || revisao) {
      var s = { data: d.data, minutos: d.minutos, estudo: blocos, revisao_min: revisao };
      if (d.fase) s.fase = d.fase;
      sessoes.push(s);
    }
  }
  return { sessoes: sessoes, pendentes: fila.map(function (f) { return { codigo: f.codigo, faltam_min: f.resta }; }) };
}

// ADR-0005 — qual NÍVEL do material o tempo permite. A estimativa de esforço do
// item é do nível 100; só a parte de LEITURA encolhe nos níveis menores (a prática
// e a aplicação não), então o fator é 0,5 + 0,5 × nível. Escolhe o maior nível que
// cabe; se nem o 10 cabe, recomenda o 10 e deixa o déficit à mostra.
var NIVEIS = [100, 50, 25, 10];
function fatorNivel(n) { return 0.5 + 0.5 * (n / 100); }
function nivelRecomendado(cap, itens) {
  var e = esforcoTotal(itens);
  var util = cap.util_min;
  var opcoes = NIVEIS.map(function (n) { return { nivel: n, esforco_min: [Math.round(e.min * fatorNivel(n)), Math.round(e.max * fatorNivel(n))] }; })
    .map(function (x) { return junta(x, { cabe: x.esforco_min[1] <= util, apertado: x.esforco_min[0] <= util && x.esforco_min[1] > util }); });
  var escolha = primeiro(opcoes, function (x) { return x.cabe; }) || primeiro(opcoes, function (x) { return x.apertado; }) || opcoes[opcoes.length - 1];
  var motivo = escolha.cabe
    ? (escolha.nivel === 100 ? 'O tempo declarado cobre o material completo.' : 'O material completo não cabe no tempo declarado; o nível ' + escolha.nivel + ' % cabe.')
    : escolha.apertado ? 'Nem o completo cabe com folga; o nível ' + escolha.nivel + ' % cabe só na estimativa mínima.' : 'Nem o nível 10 % cabe no tempo declarado — veja o déficit e o que ficou pendente.';
  return { nivel: escolha.nivel, motivo: motivo, opcoes: opcoes };
}

// Véspera (ADR-0005): os últimos `vespera_dias` antes da data-alvo viram sessões
// de revisão de véspera no foco da etapa (objetiva | escrita | oral) — nada de
// matéria nova nesses dias. O foco vem do escopo (ordem das etapas do concurso).
// RETA FINAL (ADR-0007, do que os aprovados e os cursinhos convergem): a "revisão geral" começa
// 15 dias antes — o dia passa a ser sobretudo do que já foi visto, com uma fração pequena para
// matéria nova — e nos 5 últimos dias não entra conteúdo novo nenhum: só véspera, no foco da etapa.
var VESPERA_PADRAO_DIAS = 5;
var REVISAO_GERAL_PADRAO_DIAS = 15;
var FRACAO_NOVA_NA_REVISAO_GERAL = 0.3;
function marcarVespera(sessoes, fim, o) {
  o = o === undefined ? {} : o;
  var vesperaDias = o.vespera_dias === undefined ? VESPERA_PADRAO_DIAS : o.vespera_dias, foco = o.foco === undefined ? 'objetiva' : o.foco;
  if (!fim || !vesperaDias) return sessoes;
  var inicio = somarDias(fim, -int(vesperaDias));
  return sessoes.map(function (s) { return s.data >= inicio ? junta(s, { estudo: [], revisao_min: s.minutos, vespera: foco, fase: 'vespera' }) : s; });
}

// Porta única. Sem data-alvo (assunto avulso), o plano diz quando termina
// no ritmo declarado em vez de fingir um prazo.
function planejar(o) {
  var hoje = o.hoje, dataAlvo = o.data_alvo === undefined ? '' : o.data_alvo, itens = o.itens, foco = o.foco;
  var base = { hoje: hoje, disponibilidade: o.disponibilidade, indisponiveis: o.indisponiveis, margem_pct: o.margem_pct };
  var opcoesDeAlocar = { revisao_pct: o.revisao_pct, sessao_min: o.sessao_min };
  function comEstudo(lista) { return lista.filter(function (s) { return s.estudo.length; }); }
  if (dataAlvo) {
    if (dataAlvo <= hoje) throw new Error('A data-alvo precisa ser futura.');
    var cap = capacidade(junta(base, { fim: dataAlvo }));
    // os dias de véspera não recebem matéria nova: a alocação usa só os dias anteriores.
    // Véspera só existe se quem chama a pedir (o escopo de edital pede; assunto avulso não) —
    // o motor puro não tira dia nenhum por conta própria.
    var vd = int(o.vespera_dias), rg = Math.max(vd, int(o.revisao_geral_dias));
    var iniV = somarDias(dataAlvo, -vd), iniRG = somarDias(dataAlvo, -rg);
    var fase = function (data) { return vd && data >= iniV ? 'vespera' : rg > vd && data >= iniRG ? 'revisao_geral' : ''; };
    var capEstudo = junta(cap, { dias: cap.dias.map(function (d) { return junta(d, { fase: fase(d.data) }); }).filter(function (d) { return d.fase !== 'vespera'; }) });
    // capacidade para matéria NOVA: o dia de revisão geral conta só pela fração que ainda admite conteúdo novo
    capEstudo.bruta_min = capEstudo.dias.reduce(function (a, d) { return a + (d.fase === 'revisao_geral' ? Math.floor(d.minutos * FRACAO_NOVA_NA_REVISAO_GERAL) : d.minutos); }, 0);
    capEstudo.margem_min = Math.round(capEstudo.bruta_min * (cap.margem_pct / 100));
    capEstudo.util_min = capEstudo.bruta_min - capEstudo.margem_min;
    var plano = alocar(capEstudo, itens, opcoesDeAlocar);
    var vesperas = marcarVespera(cap.dias.map(function (d) { return { data: d.data, minutos: d.minutos, estudo: [], revisao_min: 0 }; }), dataAlvo, { vespera_dias: int(o.vespera_dias), foco: foco }).filter(function (s) { return s.vespera; });
    var sessoes = plano.sessoes.concat(vesperas).sort(function (a, b) { return a.data.localeCompare(b.data); });
    var retaFinal = vd || rg ? { revisao_geral_desde: rg > vd ? iniRG : '', sem_materia_nova_desde: vd ? iniV : '', foco: foco || 'objetiva' } : null;
    return { data_alvo: dataAlvo, viabilidade: viabilidade(capEstudo, itens), nivel_recomendado: nivelRecomendado(capEstudo, itens), reta_final: retaFinal, sessoes: sessoes, pendentes: plano.pendentes,
      conclusao_estimada: plano.pendentes.length ? '' : (comEstudo(plano.sessoes).pop() || {}).data || '' };
  }
  var capLivre = capacidade(junta(base, { fim: somarDias(hoje, HORIZONTE_SEM_PRAZO) }));
  var planoLivre = alocar(capLivre, itens, opcoesDeAlocar);
  var ultima = comEstudo(planoLivre.sessoes).pop();
  var corte = ultima ? planoLivre.sessoes.indexOf(ultima) + 1 : 0;
  var e = esforcoTotal(itens);
  return { data_alvo: '', viabilidade: { situacao: 'sem_prazo', esforco_min: [e.min, e.max], sem_estimativa: e.sem_estimativa },
    sessoes: planoLivre.sessoes.slice(0, corte), pendentes: planoLivre.pendentes, conclusao_estimada: ultima ? ultima.data : '' };
}

module.exports = { planejar: planejar, capacidade: capacidade, viabilidade: viabilidade, alocar: alocar, ordenar: ordenar, esforcoTotal: esforcoTotal, minutosPorDia: minutosPorDia, nivelRecomendado: nivelRecomendado, marcarVespera: marcarVespera, fatorNivel: fatorNivel,
  NIVEIS: NIVEIS, DIAS: DIAS, MARGEM_PADRAO_PCT: MARGEM_PADRAO_PCT, REVISAO_PADRAO_PCT: REVISAO_PADRAO_PCT, VESPERA_PADRAO_DIAS: VESPERA_PADRAO_DIAS, REVISAO_GERAL_PADRAO_DIAS: REVISAO_GERAL_PADRAO_DIAS, FRACAO_NOVA_NA_REVISAO_GERAL: FRACAO_NOVA_NA_REVISAO_GERAL, SESSAO_MIN_MINUTOS: SESSAO_MIN_MINUTOS };
