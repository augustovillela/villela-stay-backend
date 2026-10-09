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
// =====================================================================
'use strict';
const { somarDias } = require('./agenda');

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const MARGEM_PADRAO_PCT = 15;   // imprevistos
const REVISAO_PADRAO_PCT = 20;  // fatia de cada sessão reservada a retomadas
const HORIZONTE_SEM_PRAZO = 730;

const int = (v) => Math.max(0, Math.round(Number(v) || 0));

function minutosPorDia(disponibilidade) {
  const d = disponibilidade || {};
  const lista = Array.isArray(d) ? d.slice(0, 7) : DIAS.map(k => d[k]);
  const r = lista.map(int);
  while (r.length < 7) r.push(0);
  if (r.some(m => m > 16 * 60)) throw new Error('disponibilidade: mais de 16 horas de estudo num dia não é um plano.');
  return r;
}

// Dias de hoje (inclusive) até a véspera do fim, com os minutos declarados.
function capacidade({ hoje, fim, disponibilidade, indisponiveis = [], margem_pct = MARGEM_PADRAO_PCT }) {
  const porDia = minutosPorDia(disponibilidade);
  if (!porDia.some(Boolean)) throw new Error('Informe ao menos um dia da semana com tempo de estudo.');
  const fora = new Set(indisponiveis);
  const dias = [];
  for (let data = hoje; data < fim; data = somarDias(data, 1)) {
    const minutos = fora.has(data) ? 0 : porDia[new Date(data + 'T00:00:00Z').getUTCDay()];
    if (minutos) dias.push({ data, minutos });
  }
  const bruta = dias.reduce((a, d) => a + d.minutos, 0);
  const margem = Math.round(bruta * (margem_pct / 100));
  return { dias, bruta_min: bruta, margem_min: margem, util_min: bruta - margem, margem_pct };
}

// esforco_min de cada item é uma FAIXA [mínimo, máximo] em minutos.
function esforcoTotal(itens) {
  const sem = [];
  let min = 0, max = 0;
  for (const it of itens) {
    const f = Array.isArray(it.esforco_min) ? it.esforco_min.map(int) : null;
    if (!f || f.length < 2 || !f[1]) { sem.push(it.codigo); continue; }
    min += Math.min(f[0], f[1]); max += Math.max(f[0], f[1]);
  }
  return { min, max, sem_estimativa: sem };
}

function viabilidade(cap, itens) {
  const e = esforcoTotal(itens);
  const falta = (n) => Math.max(0, n - cap.util_min);
  return {
    capacidade_bruta_min: cap.bruta_min, margem_min: cap.margem_min, capacidade_util_min: cap.util_min,
    esforco_min: [e.min, e.max], deficit_min: [falta(e.min), falta(e.max)],
    situacao: e.max <= cap.util_min ? 'cabe' : e.min <= cap.util_min ? 'apertado' : 'nao_cabe',
    sem_estimativa: e.sem_estimativa,
  };
}

// Pré-requisito antes de quem depende dele; depois peso maior; depois a ordem do programa.
function ordenar(itens) {
  const porCodigo = new Map(itens.map(i => [i.codigo, i]));
  const visto = new Set(), saida = [];
  const base = [...itens].sort((a, b) => (Number(b.peso) || 0) - (Number(a.peso) || 0) || (a.ordem || 0) - (b.ordem || 0));
  const visitar = (it, pilha) => {
    if (visto.has(it.codigo)) return;
    if (pilha.has(it.codigo)) throw new Error(`plano: dependência circular em ${it.codigo}.`);
    pilha.add(it.codigo);
    for (const d of it.depende_de || []) if (porCodigo.has(d)) visitar(porCodigo.get(d), pilha);
    pilha.delete(it.codigo);
    visto.add(it.codigo); saida.push(it);
  };
  base.forEach(it => visitar(it, new Set()));
  return saida;
}

function alocar(cap, itens, { revisao_pct = REVISAO_PADRAO_PCT } = {}) {
  const fila = ordenar(itens.filter(i => Array.isArray(i.esforco_min) && i.esforco_min[1]))
    .map(i => ({ codigo: i.codigo, resta: Math.round((int(i.esforco_min[0]) + int(i.esforco_min[1])) / 2) }));
  const fator = (1 - cap.margem_pct / 100);
  const sessoes = [];
  for (const d of cap.dias) {
    const util = Math.floor(d.minutos * fator);
    const revisao = fila.length ? Math.floor(util * (revisao_pct / 100)) : util;
    let livre = util - revisao;
    const blocos = [];
    while (livre > 0 && fila.length) {
      const usa = Math.min(livre, fila[0].resta);
      blocos.push({ codigo: fila[0].codigo, minutos: usa });
      fila[0].resta -= usa; livre -= usa;
      if (!fila[0].resta) fila.shift();
    }
    if (blocos.length || revisao) sessoes.push({ data: d.data, minutos: d.minutos, estudo: blocos, revisao_min: revisao });
  }
  return { sessoes, pendentes: fila.map(f => ({ codigo: f.codigo, faltam_min: f.resta })) };
}

// Porta única. Sem data-alvo (assunto avulso), o plano diz quando termina
// no ritmo declarado em vez de fingir um prazo.
function planejar({ hoje, data_alvo = '', disponibilidade, indisponiveis, margem_pct, revisao_pct, itens }) {
  const base = { hoje, disponibilidade, indisponiveis, margem_pct };
  if (data_alvo) {
    if (data_alvo <= hoje) throw new Error('A data-alvo precisa ser futura.');
    const cap = capacidade({ ...base, fim: data_alvo });
    const plano = alocar(cap, itens, { revisao_pct });
    return { data_alvo, viabilidade: viabilidade(cap, itens), ...plano, conclusao_estimada: plano.pendentes.length ? '' : (plano.sessoes.filter(s => s.estudo.length).pop() || {}).data || '' };
  }
  const cap = capacidade({ ...base, fim: somarDias(hoje, HORIZONTE_SEM_PRAZO) });
  const plano = alocar(cap, itens, { revisao_pct });
  const ultima = plano.sessoes.filter(s => s.estudo.length).pop();
  const corte = ultima ? plano.sessoes.findIndex(s => s === ultima) + 1 : 0;
  const e = esforcoTotal(itens);
  return { data_alvo: '', viabilidade: { situacao: 'sem_prazo', esforco_min: [e.min, e.max], sem_estimativa: e.sem_estimativa },
    sessoes: plano.sessoes.slice(0, corte), pendentes: plano.pendentes, conclusao_estimada: ultima ? ultima.data : '' };
}

module.exports = { planejar, capacidade, viabilidade, alocar, ordenar, esforcoTotal, minutosPorDia, DIAS, MARGEM_PADRAO_PCT, REVISAO_PADRAO_PCT };
