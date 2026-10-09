// =====================================================================
// Villela Academy — ESTUDO · estado de cada COMPETÊNCIA, derivado das
// evidências. Não existe tabela de "domínio": como o XP da jornada, o
// estado é recalculado do que o aluno FEZ, e por isso nunca fica dessincronizado.
//
// Cinco estados (prompt mestre, seção 9):
//   nao_avaliada → em_pratica → demonstrada_com_apoio → demonstrada_sem_apoio → retida
//
// O que conta como demonstração INDEPENDENTE (decisão de projeto, a calibrar):
// acerto, fora do modo estudo, sem pista, sem ajuda humana, em item que o
// aluno ainda não tinha visto. Acertar de novo a mesma questão é lembrança
// da questão — vale como prática, não como prova de domínio.
// Retenção exige nova demonstração independente depois de um intervalo, e
// não é permanente: falha independente posterior reabre a prática.
// =====================================================================
'use strict';

const ESTADOS = ['nao_avaliada', 'em_pratica', 'demonstrada_com_apoio', 'demonstrada_sem_apoio', 'retida'];
const MODOS = ['estudo', 'pratica', 'avaliacao'];
const INTERVALO_RETENCAO_DIAS = 7; // hipótese inicial (seção 16: 7 e 30 dias são opções, não garantias)

const dia = (iso) => String(iso || '').slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(dia(b) + 'T00:00:00Z') - Date.parse(dia(a) + 'T00:00:00Z')) / 86400e3);

function independente(ev) {
  return ev.modo !== 'estudo' && !(ev.pistas > 0) && !ev.ajuda_humana;
}

// evidencias: [{ acerto, modo, pistas, ajuda_humana, inedita, criado_em }] de UMA competência
function estadoDaCompetencia(evidencias, { intervaloRetencaoDias = INTERVALO_RETENCAO_DIAS } = {}) {
  const evs = [...(evidencias || [])].sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
  const r = { estado: 'nao_avaliada', desde: '', retida_em: '', intervalo_dias: 0, tentativas: evs.length, acertos: 0, com_ajuda: 0, ineditas: 0, ultima_em: '' };
  let base = ''; // data da demonstração independente que está de pé
  const ir = (estado, ev) => { if (r.estado !== estado) { r.estado = estado; r.desde = ev.criado_em; } };
  for (const ev of evs) {
    const ind = independente(ev);
    if (ev.acerto) r.acertos++;
    if (!ind) r.com_ajuda++;
    if (ev.inedita) r.ineditas++;
    r.ultima_em = ev.criado_em;
    if (ev.acerto) {
      if (ind && ev.inedita) {
        if (!base) { base = ev.criado_em; ir('demonstrada_sem_apoio', ev); }
        else if (diasEntre(base, ev.criado_em) >= intervaloRetencaoDias) {
          ir('retida', ev);
          r.retida_em = ev.criado_em;
          r.intervalo_dias = diasEntre(base, ev.criado_em);
        }
      } else if (r.estado === 'nao_avaliada' || r.estado === 'em_pratica') ir('demonstrada_com_apoio', ev);
    } else if (ind) {
      // falha sem apoio derruba o que estava de pé — inclusive a retenção
      base = ''; r.retida_em = ''; r.intervalo_dias = 0;
      ir('em_pratica', ev);
    } else if (r.estado === 'nao_avaliada') ir('em_pratica', ev);
  }
  return r;
}

// Agrupa evidências por competência e devolve { [codigo]: estado }.
function estados(evidencias, opcoes) {
  const grupos = {};
  for (const ev of evidencias || []) (grupos[ev.competencia_codigo] = grupos[ev.competencia_codigo] || []).push(ev);
  return Object.fromEntries(Object.entries(grupos).map(([c, lista]) => [c, estadoDaCompetencia(lista, opcoes)]));
}

const demonstrada = (estado) => estado === 'demonstrada_sem_apoio' || estado === 'retida';

module.exports = { estadoDaCompetencia, estados, independente, demonstrada, diasEntre, ESTADOS, MODOS, INTERVALO_RETENCAO_DIAS };
