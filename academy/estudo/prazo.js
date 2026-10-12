// =====================================================================
// Villela Academy — ESTUDO · CONTADOR DE PRAZO. Puro: roda no servidor
// (testes) e no navegador (pacote de estudo/motores-navegador.js).
//
// É uma calculadora de DATAS. Não sabe qual prazo se aplica a qual ato,
// nem se ele corre em dias úteis ou corridos — isso está no edital ou na
// lei, e quem confere é o aluno. O que ela faz:
//   · exclui o dia do começo e inclui o do vencimento;
//   · em dias ÚTEIS, pula sábado, domingo e feriado;
//   · em dias CORRIDOS, conta tudo;
//   · se o vencimento cai em dia sem expediente, prorroga para o primeiro
//     dia útil seguinte;
//   · mostra o passo a passo, dia a dia, com o motivo de cada dia pulado.
//
// FERIADOS embutidos: só os NACIONAIS de data fixa (lista explícita abaixo)
// e os que derivam da Páscoa, CALCULADOS pela fórmula (nunca digitados).
// Feriado estadual, municipal, recesso e suspensão de expediente entram
// pelo campo do aluno (`extras`).
//
// ESTE ARQUIVO VAI AO NAVEGADOR, servido cru: é escrito em ES5 — `var` e
// `function`, sem seta, sem `const`/`let`, sem texto com crase, sem
// espalhamento nem desestruturação, sem Map/Set, sem `padStart` (réplica de
// 11/10/2026, R3-B11). O teste de testes-auditoria-b2.js recusa sintaxe
// mais nova aqui.
// =====================================================================
'use strict';

// Feriados nacionais de data fixa: [mês, dia, nome, a partir de que ano vale (0 = sempre)].
var FERIADOS_FIXOS = [
  [1, 1, 'Confraternização Universal', 0],
  [4, 21, 'Tiradentes', 0],
  [5, 1, 'Dia do Trabalho', 0],
  [9, 7, 'Independência do Brasil', 0],
  [10, 12, 'Nossa Senhora Aparecida', 0],
  [11, 2, 'Finados', 0],
  [11, 15, 'Proclamação da República', 0],
  [11, 20, 'Dia Nacional de Zumbi e da Consciência Negra', 2024], // feriado nacional só a partir de 2024
  [12, 25, 'Natal', 0]
];
// Datas que derivam da Páscoa: [dias em relação ao domingo de Páscoa, nome, é ponto facultativo?].
// Sexta-feira Santa é feriado; Carnaval e Corpus Christi costumam ser ponto facultativo (sem expediente
// forense na prática) — por isso têm chave própria (`facultativos`) e o aluno pode desligá-los.
var MOVEIS = [
  [-48, 'Carnaval (segunda-feira)', true],
  [-47, 'Carnaval (terça-feira)', true],
  [-2, 'Sexta-feira Santa', false],
  [60, 'Corpus Christi', true]
];
var SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
var MODOS = ['uteis', 'corridos'];
var MAX_DIAS = 3660; // dez anos: acima disso é erro de digitação, não prazo

function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function p2(n) { var t = String(n); return t.length < 2 ? '0' + t : t; }
function iso(ano, mes, dia) { return ano + '-' + p2(mes) + '-' + p2(dia); }
function ms(data) { return Date.parse(data + 'T00:00:00Z'); }
function valida(data) { return /^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) && !isNaN(ms(data)) && new Date(ms(data)).toISOString().slice(0, 10) === data; }
function somar(data, n) { return new Date(ms(data) + n * 86400e3).toISOString().slice(0, 10); }
function diaDaSemana(data) { return new Date(ms(data)).getUTCDay(); }
function dataBR(data) { return data.slice(8, 10) + '/' + data.slice(5, 7) + '/' + data.slice(0, 4); }

// Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher (calendário gregoriano).
function pascoa(ano) {
  var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  var mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

// Todos os feriados embutidos de um ano: [{ data, nome, movel, facultativo }], em ordem de data.
function feriadosDoAno(ano, o) {
  o = o === undefined ? {} : o;
  var facultativos = o.facultativos === undefined ? true : o.facultativos;
  var fixos = FERIADOS_FIXOS.filter(function (f) { return ano >= f[3]; }).map(function (f) { return { data: iso(ano, f[0], f[1]), nome: f[2], movel: false, facultativo: false }; });
  var p = pascoa(ano);
  var moveis = MOVEIS.filter(function (m) { return facultativos || !m[2]; }).map(function (m) { return { data: somar(p, m[0]), nome: m[1], movel: true, facultativo: m[2] }; });
  return fixos.concat(moveis).sort(function (x, y) { return x.data.localeCompare(y.data); });
}

// O que o aluno digita no campo de feriados locais e recessos: uma data por linha (dd/mm/aaaa ou aaaa-mm-dd),
// ou um período ("20/12/2026 a 06/01/2027"), com um nome opcional depois de " - ". Linha que não é data volta
// em `ignoradas` — nada é descartado em silêncio.
function lerDatas(texto) {
  function umaData(t) {
    var br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t.trim());
    var d = br ? iso(Number(br[3]), Number(br[2]), Number(br[1])) : t.trim();
    return valida(d) ? d : '';
  }
  var datas = [], ignoradas = [];
  String(texto || '').split(/[\n;]+/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (linha) {
    var pedacos = linha.split(/\s+[-–—]\s+/), parte = pedacos[0], resto = pedacos.slice(1);
    var nome = resto.join(' - ').trim().slice(0, 80) || 'informado por você';
    var lados = parte.split(/\s+(?:a|até|ate)\s+/i);
    var de = umaData(lados[0]), ate = lados.length > 1 ? umaData(lados[1]) : de;
    if (!de || !ate || ate < de || (ms(ate) - ms(de)) / 86400e3 > 400) { ignoradas.push(linha); return; }
    for (var d = de; d <= ate; d = somar(d, 1)) datas.push({ data: d, nome: nome });
  });
  return { datas: datas, ignoradas: ignoradas };
}

// Porta única. → { vencimento, prorrogado, contados, passos: [{ data, semana, n, conta, motivo }], feriados }
// `extras`: [{ data, nome }] ou ['aaaa-mm-dd']. `comeco_em_dia_util`: em dias corridos, a contagem só começa
// no primeiro dia útil depois do dia do começo (em dias úteis isso já acontece sozinho).
function contar(o) {
  o = o === undefined ? {} : o;
  var inicio = o.inicio, dias = o.dias, modo = o.modo === undefined ? 'uteis' : o.modo, extras = o.extras === undefined ? [] : o.extras;
  var facultativos = o.facultativos === undefined ? true : o.facultativos, comecoEmDiaUtil = o.comeco_em_dia_util === undefined ? false : o.comeco_em_dia_util;
  if (!valida(inicio)) throw new Error('Informe a data de início.');
  var n = Math.round(Number(dias));
  if (!isFinite(n) || n < 1 || n > MAX_DIAS) throw new Error('Informe a quantidade de dias (de 1 a ' + MAX_DIAS + ').');
  if (MODOS.indexOf(modo) < 0) throw new Error('A contagem é em dias úteis ou em dias corridos.');
  var proprios = {};
  (extras || []).forEach(function (x) {
    var d = typeof x === 'string' ? x : x && x.data;
    if (valida(d)) proprios[d] = (x && x.nome) || 'informado por você';
  });
  var porAno = {};
  function embutido(data) {
    var ano = Number(data.slice(0, 4));
    if (!tem(porAno, ano)) { var doAno = {}; feriadosDoAno(ano, { facultativos: facultativos }).forEach(function (f) { doAno[f.data] = f.nome; }); porAno[ano] = doAno; }
    return porAno[ano][data] || '';
  }
  // por que este dia não tem expediente ('' = dia útil)
  function semExpediente(data) {
    var s = diaDaSemana(data);
    if (s === 6) return 'sábado';
    if (s === 0) return 'domingo';
    if (embutido(data)) return 'feriado: ' + embutido(data);
    if (tem(proprios, data)) return 'sem expediente: ' + proprios[data];
    return '';
  }
  var passos = [{ data: inicio, semana: SEMANA[diaDaSemana(inicio)], n: 0, conta: false, motivo: 'dia do começo: não entra na contagem' }];
  var usados = {};
  function anotar(data, motivo) { if (/^(feriado|sem expediente)/.test(motivo)) usados[data] = motivo.replace(/^[^:]+: /, ''); }
  var data = inicio, contados = 0, comecou = modo !== 'corridos' || !comecoEmDiaUtil, motivo;
  while (contados < n) {
    data = somar(data, 1);
    motivo = semExpediente(data);
    if (!comecou && motivo) { passos.push({ data: data, semana: SEMANA[diaDaSemana(data)], n: 0, conta: false, motivo: motivo + ' — a contagem começa no primeiro dia útil' }); anotar(data, motivo); continue; }
    comecou = true;
    if (modo === 'uteis' && motivo) { passos.push({ data: data, semana: SEMANA[diaDaSemana(data)], n: 0, conta: false, motivo: motivo }); anotar(data, motivo); continue; }
    contados++;
    passos.push({ data: data, semana: SEMANA[diaDaSemana(data)], n: contados, conta: true, motivo: modo === 'corridos' && motivo ? motivo + ' — em dias corridos, conta' : '' });
  }
  var ultimo = data;
  var prorrogado = false;
  while (semExpediente(data)) {
    motivo = semExpediente(data);
    anotar(data, motivo);
    if (data !== ultimo) passos.push({ data: data, semana: SEMANA[diaDaSemana(data)], n: 0, conta: false, motivo: motivo + ' — prorroga' });
    else passos[passos.length - 1].motivo = motivo + ' — o último dia caiu em dia sem expediente: prorroga';
    data = somar(data, 1); prorrogado = true;
  }
  if (prorrogado) passos.push({ data: data, semana: SEMANA[diaDaSemana(data)], n: 0, conta: false, motivo: 'primeiro dia útil seguinte: vencimento' });
  return {
    inicio: inicio, dias: n, modo: modo, vencimento: data, semana: SEMANA[diaDaSemana(data)], ultimo_dia_contado: ultimo, prorrogado: prorrogado, contados: contados, passos: passos,
    feriados: Object.keys(usados).map(function (d) { return { data: d, nome: usados[d] }; }).sort(function (x, y) { return x.data.localeCompare(y.data); })
  };
}

module.exports = { contar: contar, pascoa: pascoa, feriadosDoAno: feriadosDoAno, lerDatas: lerDatas, dataBR: dataBR, FERIADOS_FIXOS: FERIADOS_FIXOS, MOVEIS: MOVEIS, MODOS: MODOS, MAX_DIAS: MAX_DIAS };
