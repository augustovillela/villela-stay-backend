// =====================================================================
// Villela Academy — ESTUDO · SEMÁFORO POR ASSUNTO e PROPORÇÕES POR FASE (21/11/2026).
// Piloto de método v2 (aula "Seu perfil e o seu método"). Tudo DERIVADO da prática contínua do aluno — não existe
// tabela de semáforo (ADR-0001): se a evidência muda, a cor muda junto.
//
// Assunto = competência (a unidade em que a evidência é gravada). Leitura:
//   vermelho = erra com frequência · amarelo = oscila · verde = acerta com segurança · cinza = poucos dados.
// "Nunca abandonar o verde": assunto verde que sai da rotina (sem resposta há `abandono_dias`) volta a AMARELO.
//
// Os números abaixo são CONFIGURAÇÃO INICIAL, não ciência. Estão num objeto só (PADRAO) e cada curso/edital pode
// sobrescrever em `escopo.perfil.semaforo` e `escopo.perfil.fases` — nada de constante solta pelo código.
// Mesmos 50/80 da régua do diagnóstico por disciplina (jornada-estude.js).
// =====================================================================
'use strict';

const PADRAO = Object.freeze({
  semaforo: Object.freeze({
    janela: 8,             // só as últimas N respostas do assunto contam (o passado distante não condena nem salva)
    min_respostas: 3,      // abaixo disto: cinza ("sem dados"), nunca vermelho nem verde
    vermelho_abaixo_pct: 50, // taxa de acerto na janela < isto: vermelho
    verde_a_partir_pct: 80,  // taxa >= isto E a última resposta certa: verde (senão amarelo)
    abandono_dias: 21,     // verde sem resposta há tantos dias volta a amarelo
  }),
  // proporções de estudo por fase, em % (teoria / questões / revisão). `ate` = último dia (inclusive) da fase; a última não tem.
  fases: Object.freeze([
    Object.freeze({ id: 'base', rotulo: 'Construção da base', ate: '2027-01-16', teoria: 40, questoes: 40, revisao: 20 }),
    Object.freeze({ id: 'reta', rotulo: 'Treino e revisão', ate: '', teoria: 20, questoes: 50, revisao: 30 }),
  ]),
});
const AVISO_PONTO_DE_PARTIDA = 'Ponto de partida, não ciência: ajuste conforme o seu ritmo, a sua prova e o que a sua prática mostra.';
const COR = { vermelho: 'vermelho', amarelo: 'amarelo', verde: 'verde', sem_dados: 'cinza' };
const ROTULO = { vermelho: 'Erra com frequência', amarelo: 'Oscila', verde: 'Acerta com segurança', sem_dados: 'Poucos dados' };

const num = (v, min, max, padrao) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : padrao; };
const dia = (iso) => { const t = String(iso || ''); if (t.length <= 10) return t; const ms = Date.parse(t); return Number.isFinite(ms) ? new Date(ms - 3 * 3600e3).toISOString().slice(0, 10) : t.slice(0, 10); };
const diasEntre = (a, b) => Math.round((Date.parse(dia(b) + 'T00:00:00Z') - Date.parse(dia(a) + 'T00:00:00Z')) / 86400e3);

// Limiares efetivos: o padrão, sobrescrito campo a campo pelo perfil do percurso (valor inválido é ignorado).
function limiares(perfil) {
  const p = (perfil && typeof perfil === 'object' && perfil.semaforo && typeof perfil.semaforo === 'object') ? perfil.semaforo : {};
  const d = PADRAO.semaforo;
  const r = {
    janela: Math.round(num(p.janela, 1, 50, d.janela)), min_respostas: Math.round(num(p.min_respostas, 1, 50, d.min_respostas)),
    vermelho_abaixo_pct: num(p.vermelho_abaixo_pct, 1, 100, d.vermelho_abaixo_pct), verde_a_partir_pct: num(p.verde_a_partir_pct, 1, 100, d.verde_a_partir_pct),
    abandono_dias: Math.round(num(p.abandono_dias, 1, 365, d.abandono_dias)),
  };
  if (r.verde_a_partir_pct <= r.vermelho_abaixo_pct) { r.vermelho_abaixo_pct = d.vermelho_abaixo_pct; r.verde_a_partir_pct = d.verde_a_partir_pct; } // faixas incoerentes: volta ao padrão
  if (r.min_respostas > r.janela) r.min_respostas = r.janela;
  return r;
}

// Cor de UM assunto. `evs`: evidências da competência ({ acerto, criado_em }), qualquer ordem. `hoje`: AAAA-MM-DD.
function corDoAssunto(evs, hoje, lim = PADRAO.semaforo) {
  const lista = [...(evs || [])].sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em))).slice(-lim.janela);
  const total = lista.length, acertos = lista.filter(e => e.acerto).length, pct = total ? Math.round(100 * acertos / total) : 0;
  const ultima = total ? lista[total - 1] : null;
  const base = { total, acertos, pct, ultima_em: ultima ? dia(ultima.criado_em) : '', abandonado: false };
  if (total < lim.min_respostas) return { ...base, cor: 'sem_dados' };
  let cor = pct < lim.vermelho_abaixo_pct ? 'vermelho' : (pct >= lim.verde_a_partir_pct && ultima.acerto) ? 'verde' : 'amarelo';
  let abandonado = false;
  if (cor === 'verde' && hoje && diasEntre(base.ultima_em, hoje) >= lim.abandono_dias) { cor = 'amarelo'; abandonado = true; } // nunca abandonar o verde
  return { ...base, cor, abandonado };
}

// Semáforo do percurso: uma linha por competência COM evidência de resposta. `rotuloDe(codigo)` dá o nome legível.
function semaforoDoPercurso(evidencias, { perfil, hoje, rotuloDe = (k) => k } = {}) {
  const lim = limiares(perfil);
  const por = new Map();
  for (const e of evidencias || []) { if (!e.competencia_codigo) continue; (por.get(e.competencia_codigo) || por.set(e.competencia_codigo, []).get(e.competencia_codigo)).push(e); }
  const ordemCor = { vermelho: 0, amarelo: 1, verde: 2, sem_dados: 3 };
  const assuntos = [...por.entries()].map(([codigo, evs]) => { const r = corDoAssunto(evs, hoje, lim); return { codigo, nome: rotuloDe(codigo), ...r, cor_txt: ROTULO[r.cor], cor_tela: COR[r.cor] }; })
    .sort((a, b) => ordemCor[a.cor] - ordemCor[b.cor] || a.pct - b.pct || a.codigo.localeCompare(b.codigo));
  const n = (c) => assuntos.filter(a => a.cor === c).length;
  return { assuntos, resumo: { vermelho: n('vermelho'), amarelo: n('amarelo'), verde: n('verde'), sem_dados: n('sem_dados') },
    criterios: { ...lim, nota: 'Configuração inicial ajustável, não é dado científico: lê as suas últimas respostas em cada assunto. Verde que fica sem prática volta a amarelo — não abandone o verde.' } };
}

// Fases efetivas: as do perfil (se válidas: cada uma soma 100) ou o padrão.
function fasesDoPercurso(perfil) {
  const cru = perfil && typeof perfil === 'object' && Array.isArray(perfil.fases) ? perfil.fases : null;
  const ok = cru && cru.length && cru.every((f, i) => f && ['teoria', 'questoes', 'revisao'].every(k => Number.isFinite(Number(f[k])) && Number(f[k]) >= 0)
    && Math.round(Number(f.teoria) + Number(f.questoes) + Number(f.revisao)) === 100 && (i === cru.length - 1 || /^\d{4}-\d{2}-\d{2}$/.test(String(f.ate || ''))));
  const lista = ok ? cru : PADRAO.fases;
  return lista.map((f, i) => ({ id: String(f.id || `fase-${i + 1}`), rotulo: String(f.rotulo || `Fase ${i + 1}`), ate: i === lista.length - 1 ? '' : String(f.ate), teoria: Number(f.teoria), questoes: Number(f.questoes), revisao: Number(f.revisao) }));
}

// A fase de hoje e as proporções dela, sempre rotuladas como ponto de partida.
function proporcoesPorFase(perfil, hoje) {
  const fases = fasesDoPercurso(perfil);
  const atual = fases.find(f => !f.ate || hoje <= f.ate) || fases[fases.length - 1];
  return { hoje, atual: { ...atual }, fases, ponto_de_partida: true, nota: AVISO_PONTO_DE_PARTIDA, personalizada: fases !== PADRAO.fases && JSON.stringify(fases.map(f => [f.ate, f.teoria, f.questoes, f.revisao])) !== JSON.stringify(PADRAO.fases.map(f => [f.ate, f.teoria, f.questoes, f.revisao])) };
}

module.exports = { PADRAO, limiares, corDoAssunto, semaforoDoPercurso, fasesDoPercurso, proporcoesPorFase, AVISO_PONTO_DE_PARTIDA, COR, ROTULO };
