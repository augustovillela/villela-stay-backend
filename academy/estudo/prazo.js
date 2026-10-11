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
// =====================================================================
'use strict';

// Feriados nacionais de data fixa: [mês, dia, nome, a partir de que ano vale (0 = sempre)].
const FERIADOS_FIXOS = [
  [1, 1, 'Confraternização Universal', 0],
  [4, 21, 'Tiradentes', 0],
  [5, 1, 'Dia do Trabalho', 0],
  [9, 7, 'Independência do Brasil', 0],
  [10, 12, 'Nossa Senhora Aparecida', 0],
  [11, 2, 'Finados', 0],
  [11, 15, 'Proclamação da República', 0],
  [11, 20, 'Dia Nacional de Zumbi e da Consciência Negra', 2024], // feriado nacional só a partir de 2024
  [12, 25, 'Natal', 0],
];
// Datas que derivam da Páscoa: [dias em relação ao domingo de Páscoa, nome, é ponto facultativo?].
// Sexta-feira Santa é feriado; Carnaval e Corpus Christi costumam ser ponto facultativo (sem expediente
// forense na prática) — por isso têm chave própria (`facultativos`) e o aluno pode desligá-los.
const MOVEIS = [
  [-48, 'Carnaval (segunda-feira)', true],
  [-47, 'Carnaval (terça-feira)', true],
  [-2, 'Sexta-feira Santa', false],
  [60, 'Corpus Christi', true],
];
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MODOS = ['uteis', 'corridos'];
const MAX_DIAS = 3660; // dez anos: acima disso é erro de digitação, não prazo

const p2 = (n) => String(n).padStart(2, '0');
const iso = (ano, mes, dia) => `${ano}-${p2(mes)}-${p2(dia)}`;
const ms = (data) => Date.parse(data + 'T00:00:00Z');
const valida = (data) => /^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) && !Number.isNaN(ms(data)) && new Date(ms(data)).toISOString().slice(0, 10) === data;
const somar = (data, n) => new Date(ms(data) + n * 86400e3).toISOString().slice(0, 10);
const diaDaSemana = (data) => new Date(ms(data)).getUTCDay();
const dataBR = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;

// Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher (calendário gregoriano).
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

// Todos os feriados embutidos de um ano: [{ data, nome, movel, facultativo }], em ordem de data.
function feriadosDoAno(ano, { facultativos = true } = {}) {
  const fixos = FERIADOS_FIXOS.filter(([, , , desde]) => ano >= desde).map(([mes, dia, nome]) => ({ data: iso(ano, mes, dia), nome, movel: false, facultativo: false }));
  const p = pascoa(ano);
  const moveis = MOVEIS.filter(([, , fac]) => facultativos || !fac).map(([delta, nome, fac]) => ({ data: somar(p, delta), nome, movel: true, facultativo: fac }));
  return [...fixos, ...moveis].sort((x, y) => x.data.localeCompare(y.data));
}

// O que o aluno digita no campo de feriados locais e recessos: uma data por linha (dd/mm/aaaa ou aaaa-mm-dd),
// ou um período ("20/12/2026 a 06/01/2027"), com um nome opcional depois de " - ". Linha que não é data volta
// em `ignoradas` — nada é descartado em silêncio.
function lerDatas(texto) {
  const umaData = (t) => {
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t.trim());
    const d = br ? iso(Number(br[3]), Number(br[2]), Number(br[1])) : t.trim();
    return valida(d) ? d : '';
  };
  const datas = [], ignoradas = [];
  for (const linha of String(texto || '').split(/[\n;]+/).map(x => x.trim()).filter(Boolean)) {
    const [parte, ...resto] = linha.split(/\s+[-–—]\s+/);
    const nome = resto.join(' - ').trim().slice(0, 80) || 'informado por você';
    const lados = parte.split(/\s+(?:a|até|ate)\s+/i);
    const de = umaData(lados[0]), ate = lados.length > 1 ? umaData(lados[1]) : de;
    if (!de || !ate || ate < de || (ms(ate) - ms(de)) / 86400e3 > 400) { ignoradas.push(linha); continue; }
    for (let d = de; d <= ate; d = somar(d, 1)) datas.push({ data: d, nome });
  }
  return { datas, ignoradas };
}

// Porta única. → { vencimento, prorrogado, contados, passos: [{ data, semana, n, conta, motivo }], feriados }
// `extras`: [{ data, nome }] ou ['aaaa-mm-dd']. `comeco_em_dia_util`: em dias corridos, a contagem só começa
// no primeiro dia útil depois do dia do começo (em dias úteis isso já acontece sozinho).
function contar({ inicio, dias, modo = 'uteis', extras = [], facultativos = true, comeco_em_dia_util = false } = {}) {
  if (!valida(inicio)) throw new Error('Informe a data de início.');
  const n = Math.round(Number(dias));
  if (!Number.isFinite(n) || n < 1 || n > MAX_DIAS) throw new Error(`Informe a quantidade de dias (de 1 a ${MAX_DIAS}).`);
  if (!MODOS.includes(modo)) throw new Error('A contagem é em dias úteis ou em dias corridos.');
  const proprios = new Map();
  for (const x of extras || []) {
    const d = typeof x === 'string' ? x : x && x.data;
    if (valida(d)) proprios.set(d, (x && x.nome) || 'informado por você');
  }
  const porAno = new Map();
  const embutido = (data) => {
    const ano = Number(data.slice(0, 4));
    if (!porAno.has(ano)) porAno.set(ano, new Map(feriadosDoAno(ano, { facultativos }).map(f => [f.data, f.nome])));
    return porAno.get(ano).get(data) || '';
  };
  // por que este dia não tem expediente ('' = dia útil)
  const semExpediente = (data) => {
    const s = diaDaSemana(data);
    if (s === 6) return 'sábado';
    if (s === 0) return 'domingo';
    if (embutido(data)) return 'feriado: ' + embutido(data);
    if (proprios.has(data)) return 'sem expediente: ' + proprios.get(data);
    return '';
  };
  const passos = [{ data: inicio, semana: SEMANA[diaDaSemana(inicio)], n: 0, conta: false, motivo: 'dia do começo: não entra na contagem' }];
  const usados = new Map();
  const anotar = (data, motivo) => { if (/^(feriado|sem expediente)/.test(motivo)) usados.set(data, motivo.replace(/^[^:]+: /, '')); };
  let data = inicio, contados = 0, comecou = modo !== 'corridos' || !comeco_em_dia_util;
  while (contados < n) {
    data = somar(data, 1);
    const motivo = semExpediente(data);
    if (!comecou && motivo) { passos.push({ data, semana: SEMANA[diaDaSemana(data)], n: 0, conta: false, motivo: motivo + ' — a contagem começa no primeiro dia útil' }); anotar(data, motivo); continue; }
    comecou = true;
    if (modo === 'uteis' && motivo) { passos.push({ data, semana: SEMANA[diaDaSemana(data)], n: 0, conta: false, motivo }); anotar(data, motivo); continue; }
    contados++;
    passos.push({ data, semana: SEMANA[diaDaSemana(data)], n: contados, conta: true, motivo: modo === 'corridos' && motivo ? motivo + ' — em dias corridos, conta' : '' });
  }
  const ultimo = data;
  let prorrogado = false;
  while (semExpediente(data)) {
    const motivo = semExpediente(data);
    anotar(data, motivo);
    if (data !== ultimo) passos.push({ data, semana: SEMANA[diaDaSemana(data)], n: 0, conta: false, motivo: motivo + ' — prorroga' });
    else passos[passos.length - 1].motivo = motivo + ' — o último dia caiu em dia sem expediente: prorroga';
    data = somar(data, 1); prorrogado = true;
  }
  if (prorrogado) passos.push({ data, semana: SEMANA[diaDaSemana(data)], n: 0, conta: false, motivo: 'primeiro dia útil seguinte: vencimento' });
  return {
    inicio, dias: n, modo, vencimento: data, semana: SEMANA[diaDaSemana(data)], ultimo_dia_contado: ultimo, prorrogado, contados, passos,
    feriados: [...usados.entries()].map(([d, nome]) => ({ data: d, nome })).sort((x, y) => x.data.localeCompare(y.data)),
  };
}

module.exports = { contar, pascoa, feriadosDoAno, lerDatas, dataBR, FERIADOS_FIXOS, MOVEIS, MODOS, MAX_DIAS };
