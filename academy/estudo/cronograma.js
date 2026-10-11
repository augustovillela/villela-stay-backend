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
// =====================================================================
'use strict';
const plano = require('./plano');
const { somarDias } = require('./agenda');

// Do tempo de cada sessão de estudo (já sem a margem): quanto fica para retomadas e quanto para simulado.
const REVISAO_PCT = plano.REVISAO_PADRAO_PCT; // 20 — o mesmo do Plano
const SIMULADO_PCT = 10;
const SEMANAS_MAX = 160;

const int = (v) => Math.max(0, Math.round(Number(v) || 0));
// a semana do calendário começa na segunda-feira
const segundaDe = (data) => somarDias(data, -((new Date(data + 'T00:00:00Z').getUTCDay() + 6) % 7));

function rodar(e, nivel) {
  const fator = plano.fatorNivel(nivel);
  const itens = e.aulas.map((a, i) => { const t = Math.round(int(a.tempo_min) * fator); return { codigo: a.codigo, ordem: i, peso: 0, esforco_min: t ? [t, t] : null }; });
  const p = plano.planejar({ hoje: e.hoje, data_alvo: e.data_alvo || '', disponibilidade: e.disponibilidade, indisponiveis: e.indisponiveis, margem_pct: e.margem_pct,
    revisao_pct: REVISAO_PCT + SIMULADO_PCT, itens, vespera_dias: e.vespera_dias, revisao_geral_dias: e.revisao_geral_dias, foco: e.foco });
  return { p, itens };
}

// aulas: [{ codigo, titulo, disciplina, disciplina_nome, tempo_min }] — só as que FALTAM estudar, na ordem do programa.
function montar(entrada = {}) {
  const e = { ...entrada, aulas: Array.isArray(entrada.aulas) ? entrada.aulas : [] };
  const nivel = plano.NIVEIS.includes(Number(e.nivel)) ? Number(e.nivel) : 100;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.hoje || ''))) throw new Error('cronograma: informe a data de hoje.');
  const { p, itens } = rodar(e, nivel);
  const aula = new Map(e.aulas.map(a => [a.codigo, a]));
  const semanas = [], porSemana = new Map();
  for (const s of p.sessoes) {
    const ini = segundaDe(s.data);
    if (!porSemana.has(ini)) { const w = { inicio: ini, fim: somarDias(ini, 6), minutos: 0, estudo_min: 0, revisao_min: 0, simulado_min: 0, vespera_min: 0, disciplinas: [], dias: [] }; porSemana.set(ini, w); semanas.push(w); }
    const w = porSemana.get(ini);
    // véspera e revisão geral são retomada pura (regra do Plano); nos outros dias, a reserva se divide entre retomadas e simulado
    const reserva = s.revisao_min || 0, especial = s.fase === 'vespera' || s.fase === 'revisao_geral';
    const simulado = especial ? 0 : Math.round(reserva * SIMULADO_PCT / (REVISAO_PCT + SIMULADO_PCT));
    const blocos = s.estudo.map(b => { const a = aula.get(b.codigo) || {}; return { aula: b.codigo, titulo: a.titulo || b.codigo, disciplina: a.disciplina || '', disciplina_nome: a.disciplina_nome || '', minutos: b.minutos }; });
    const estudo = blocos.reduce((t, b) => t + b.minutos, 0);
    w.dias.push({ data: s.data, minutos: s.minutos, blocos, revisao_min: reserva - simulado, simulado_min: simulado, fase: s.fase || '' });
    w.minutos += s.minutos; w.estudo_min += estudo; w.simulado_min += simulado;
    if (s.fase === 'vespera') w.vespera_min += reserva; else w.revisao_min += reserva - simulado;
    for (const b of blocos) {
      let d = w.disciplinas.find(x => x.codigo === b.disciplina);
      if (!d) w.disciplinas.push(d = { codigo: b.disciplina, nome: b.disciplina_nome, minutos: 0, aulas: [] });
      d.minutos += b.minutos; if (!d.aulas.includes(b.aula)) d.aulas.push(b.aula);
    }
  }
  const esforco = itens.reduce((t, i) => t + (i.esforco_min ? i.esforco_min[0] : 0), 0);
  const alocado = semanas.reduce((t, w) => t + w.estudo_min, 0);
  const faltam = p.pendentes.reduce((t, x) => t + x.faltam_min, 0);
  const cabe = !p.pendentes.length;
  // não coube: o mesmo motor diz qual é o MAIOR nível de leitura que cabe (ou que nenhum cabe)
  let sugestao = null;
  if (!cabe) {
    for (const n of plano.NIVEIS.filter(x => x < nivel)) if (!rodar(e, n).p.pendentes.length) { sugestao = n; break; }
  }
  const pend = new Map();
  for (const x of p.pendentes) {
    const a = aula.get(x.codigo) || {}, k = a.disciplina || '';
    if (!pend.has(k)) pend.set(k, { codigo: k, nome: a.disciplina_nome || '', aulas: 0, minutos: 0 });
    pend.get(k).aulas++; pend.get(k).minutos += x.faltam_min;
  }
  return {
    hoje: e.hoje, data_alvo: p.data_alvo, nivel, cabe,
    esforco_min: esforco, alocado_min: alocado, faltam_min: faltam, sugestao_nivel: sugestao,
    aulas: e.aulas.length, sem_estimativa: itens.filter(i => !i.esforco_min).map(i => i.codigo),
    conclusao_estimada: p.conclusao_estimada || '', reta_final: p.reta_final || null,
    reservas: { margem_pct: e.margem_pct == null ? plano.MARGEM_PADRAO_PCT : Number(e.margem_pct), revisao_pct: REVISAO_PCT, simulado_pct: SIMULADO_PCT },
    pendentes: [...pend.values()], semanas: semanas.slice(0, SEMANAS_MAX), semanas_total: semanas.length,
    aviso: cabe ? '' : `Faltam ${horas(esforco)} de aula${nivel === 100 ? '' : ` (no nível ${nivel} %)`} e você tem ${horas(alocado)} de estudo até a prova: ` +
      (sugestao ? `considere o nível ${sugestao} %.` : 'nem o nível mais curto cabe — aumente as horas ou escolha o que priorizar.'),
  };
}
function horas(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return (h ? h + ' h' : '') + (h && m ? ' ' : '') + (m || !h ? m + ' min' : ''); }

module.exports = { montar, segundaDe, horas, REVISAO_PCT, SIMULADO_PCT, SEMANAS_MAX };
