// =====================================================================
// Villela Academy — ESTUDO · MONTADOR DE CRONOGRAMA. Puro.
//
// É uma VISÃO DE CALENDÁRIO do mesmo plano — não um segundo plano. Quem
// distribui as horas é `plano.planejar` (o motor da aba Plano): mesma
// disponibilidade, mesma margem para imprevistos, mesma reta final (revisão
// geral e véspera), mesma ordem (a do programa). Este arquivo só:
//   · entrega ao motor as AULAS que o aluno ainda não estudou, com o tempo
//     de cada uma no nível de leitura escolhido (mesmo fator do plano);
//   · agrupa as sessões por semana e por disciplina;
//   · separa, do tempo reservado de cada sessão, a fatia do simulado;
//   · quando não cabe, pergunta ao MESMO motor qual nível caberia.
// Nunca cria hora que o aluno não declarou; o que não coube volta contado.
//
// ESTE ARQUIVO VAI AO NAVEGADOR (estudo/motores-navegador.js), servido cru:
// é escrito em ES5 — `var` e `function`, sem seta, sem `const`/`let`, sem
// texto com crase, sem espalhamento nem desestruturação, sem Map/Set
// (réplica de 11/10/2026, R3-B11). O teste de testes-auditoria-b2.js recusa
// sintaxe mais nova aqui.
// =====================================================================
'use strict';
var plano = require('./plano');
var somarDias = require('./agenda').somarDias;

// Do tempo de cada sessão de estudo (já sem a margem): quanto fica para retomadas e quanto para simulado.
var REVISAO_PCT = plano.REVISAO_PADRAO_PCT; // 20 — o mesmo do Plano
var SIMULADO_PCT = 10;
var SEMANAS_MAX = 160;

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
// a semana do calendário começa na segunda-feira
function segundaDe(data) { return somarDias(data, -((new Date(data + 'T00:00:00Z').getUTCDay() + 6) % 7)); }

function rodar(e, nivel) {
  var fator = plano.fatorNivel(nivel);
  var itens = e.aulas.map(function (a, i) { var t = Math.round(int(a.tempo_min) * fator); return { codigo: a.codigo, ordem: i, peso: 0, esforco_min: t ? [t, t] : null }; });
  var p = plano.planejar({ hoje: e.hoje, data_alvo: e.data_alvo || '', disponibilidade: e.disponibilidade, indisponiveis: e.indisponiveis, margem_pct: e.margem_pct,
    revisao_pct: REVISAO_PCT + SIMULADO_PCT, itens: itens, vespera_dias: e.vespera_dias, revisao_geral_dias: e.revisao_geral_dias, foco: e.foco, sessao_min: e.sessao_min });
  return { p: p, itens: itens };
}

// aulas: [{ codigo, titulo, disciplina, disciplina_nome, tempo_min }] — só as que FALTAM estudar, na ordem do programa.
function montar(entrada) {
  entrada = entrada === undefined ? {} : entrada;
  var e = junta(entrada, { aulas: Array.isArray(entrada.aulas) ? entrada.aulas : [] });
  var nivel = plano.NIVEIS.indexOf(Number(e.nivel)) >= 0 ? Number(e.nivel) : 100;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.hoje || ''))) throw new Error('cronograma: informe a data de hoje.');
  var feito = rodar(e, nivel), p = feito.p, itens = feito.itens;
  var aula = {};
  e.aulas.forEach(function (a) { aula[a.codigo] = a; });
  function aulaDe(codigo) { return tem(aula, codigo) ? aula[codigo] : {}; }
  var semanas = [], porSemana = {};
  p.sessoes.forEach(function (s) {
    var ini = segundaDe(s.data);
    if (!tem(porSemana, ini)) { porSemana[ini] = { inicio: ini, fim: somarDias(ini, 6), minutos: 0, estudo_min: 0, revisao_min: 0, simulado_min: 0, vespera_min: 0, disciplinas: [], dias: [] }; semanas.push(porSemana[ini]); }
    var w = porSemana[ini];
    // véspera e revisão geral são retomada pura (regra do Plano); nos outros dias, a reserva se divide entre retomadas e simulado
    var reserva = s.revisao_min || 0, especial = s.fase === 'vespera' || s.fase === 'revisao_geral';
    var simulado = especial ? 0 : Math.round(reserva * SIMULADO_PCT / (REVISAO_PCT + SIMULADO_PCT));
    var blocos = s.estudo.map(function (b) { var a = aulaDe(b.codigo); return { aula: b.codigo, titulo: a.titulo || b.codigo, disciplina: a.disciplina || '', disciplina_nome: a.disciplina_nome || '', minutos: b.minutos }; });
    var estudo = blocos.reduce(function (t, b) { return t + b.minutos; }, 0);
    w.dias.push({ data: s.data, minutos: s.minutos, blocos: blocos, revisao_min: reserva - simulado, simulado_min: simulado, fase: s.fase || '' });
    w.minutos += s.minutos; w.estudo_min += estudo; w.simulado_min += simulado;
    if (s.fase === 'vespera') w.vespera_min += reserva; else w.revisao_min += reserva - simulado;
    blocos.forEach(function (b) {
      var d = primeiro(w.disciplinas, function (x) { return x.codigo === b.disciplina; });
      if (!d) w.disciplinas.push(d = { codigo: b.disciplina, nome: b.disciplina_nome, minutos: 0, aulas: [] });
      d.minutos += b.minutos; if (d.aulas.indexOf(b.aula) < 0) d.aulas.push(b.aula);
    });
  });
  var esforco = itens.reduce(function (t, i) { return t + (i.esforco_min ? i.esforco_min[0] : 0); }, 0);
  var alocado = semanas.reduce(function (t, w) { return t + w.estudo_min; }, 0);
  var faltam = p.pendentes.reduce(function (t, x) { return t + x.faltam_min; }, 0);
  var cabe = !p.pendentes.length;
  // não coube: o mesmo motor diz qual é o MAIOR nível de leitura que cabe (ou que nenhum cabe)
  var sugestao = null;
  if (!cabe) {
    var menores = plano.NIVEIS.filter(function (x) { return x < nivel; });
    for (var k = 0; k < menores.length; k++) if (!rodar(e, menores[k]).p.pendentes.length) { sugestao = menores[k]; break; }
  }
  var pend = {}, pendentes = [];
  p.pendentes.forEach(function (x) {
    var a = aulaDe(x.codigo), ch = a.disciplina || '';
    if (!tem(pend, ch)) { pend[ch] = { codigo: ch, nome: a.disciplina_nome || '', aulas: 0, minutos: 0 }; pendentes.push(pend[ch]); }
    pend[ch].aulas++; pend[ch].minutos += x.faltam_min;
  });
  return {
    hoje: e.hoje, data_alvo: p.data_alvo, nivel: nivel, cabe: cabe,
    esforco_min: esforco, alocado_min: alocado, faltam_min: faltam, sugestao_nivel: sugestao,
    aulas: e.aulas.length, sem_estimativa: itens.filter(function (i) { return !i.esforco_min; }).map(function (i) { return i.codigo; }),
    conclusao_estimada: p.conclusao_estimada || '', reta_final: p.reta_final || null,
    reservas: { margem_pct: e.margem_pct == null ? plano.MARGEM_PADRAO_PCT : Number(e.margem_pct), revisao_pct: REVISAO_PCT, simulado_pct: SIMULADO_PCT },
    pendentes: pendentes, semanas: semanas.slice(0, SEMANAS_MAX), semanas_total: semanas.length,
    aviso: cabe ? '' : 'Faltam ' + horas(esforco) + ' de aula' + (nivel === 100 ? '' : ' (no nível ' + nivel + ' %)') + ' e você tem ' + horas(alocado) + ' de estudo até a prova: ' +
      (sugestao ? 'considere o nível ' + sugestao + ' %.' : 'nem o nível mais curto cabe — aumente as horas ou escolha o que priorizar.')
  };
}
function horas(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return (h ? h + ' h' : '') + (h && m ? ' ' : '') + (m || !h ? m + ' min' : ''); }

module.exports = { montar: montar, segundaDe: segundaDe, horas: horas, REVISAO_PCT: REVISAO_PCT, SIMULADO_PCT: SIMULADO_PCT, SEMANAS_MAX: SEMANAS_MAX };
