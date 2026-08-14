// =====================================================================
// Invente Arena — MOTOR da prática adaptativa (fase A).
// Regras duras em código, LLM nenhum aqui:
//   • nivelamento "superpoderes": caminha pelos fios sondáveis a partir do
//     ano da criança — acertou sobe, errou desce (fios 🔥 3 e 4 têm sonda
//     mais profunda, contrato da camada de atenção especial);
//   • 5 estados por célula (Descoberta→Mestre): lição de 5 com ≥4 acertos
//     sobe, ≤2 desce e SONDA o pré-requisito (detecção de lacuna);
//   • revisão espaçada: intervalos 1/3/7/16/35 dias por estado;
//   • correção SEM sessão: exercício é determinístico por (célula, seed) —
//     o servidor recalcula na hora de corrigir.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, j } = require('../db');
const repo = require('../repo');
const registro = require('./grafos');
// compat: matematica e a materia padrao em todas as assinaturas
const grafoDe = (mat) => registro.materia(mat).grafo();
const moldesDe = (mat) => registro.materia(mat).moldes();

const ESTADOS = ['Descoberta', 'Aprendiz', 'Competente', 'Especialista', 'Mestre'];
const EMOJIS = ['🌱', '🔧', '💪', '🎯', '🏅'];
const INTERVALO_DIAS = [1, 3, 7, 16, 35];
const seedNovo = () => crypto.randomBytes(4).readUInt32BE(0) % 2000000000;
const emDias = (d) => new Date(Date.now() + d * 24 * 3600 * 1000).toISOString();

// Fios sondáveis = têm 2+ células com molde (o nivelamento caminha por eles).
const _sondaCache = {};
function fiosSonda(mat) {
  if (_sondaCache[mat]) return _sondaCache[mat];
  const g = grafoDe(mat), mo = moldesDe(mat);
  _sondaCache[mat] = g.FIOS
    .map((f) => ({ id: f.id, nome: f.nome, cands: f.celulas.filter(mo.temMolde) }))
    .filter((f) => f.cands.length >= 2);
  return _sondaCache[mat];
}
const SONDA_PROFUNDA = [3, 4]; // divisão e frações: o vale nacional (🔥)

// ---------------------------------------------------------------------
// Progresso por célula
// ---------------------------------------------------------------------
const Progresso = {
  todos(childId) {
    const m = {};
    for (const r of db.prepare('SELECT * FROM arena_progresso WHERE child_id = ?').all(childId)) m[r.celula] = r;
    return m;
  },
  obter(childId, celula) {
    return db.prepare('SELECT * FROM arena_progresso WHERE child_id = ? AND celula = ?').get(childId, celula)
      || { child_id: childId, celula, estado: 0, xp: 0, acertos: 0, erros: 0, proxima_revisao: '' };
  },
  gravar(childId, celula, campos) {
    const atual = Progresso.obter(childId, celula);
    const novo = { ...atual, ...campos };
    db.prepare(`INSERT INTO arena_progresso (child_id, celula, estado, xp, acertos, erros, proxima_revisao, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(child_id, celula) DO UPDATE SET estado=excluded.estado, xp=excluded.xp,
        acertos=excluded.acertos, erros=excluded.erros, proxima_revisao=excluded.proxima_revisao, atualizado_em=excluded.atualizado_em`)
      .run(childId, celula, novo.estado, novo.xp, novo.acertos, novo.erros, novo.proxima_revisao, nowISO());
    return novo;
  },
};

// ---------------------------------------------------------------------
// Nivelamento ("vamos descobrir seus superpoderes?")
// ---------------------------------------------------------------------
function nivelamentoRow(childId, mat = 'matematica') {
  return db.prepare('SELECT * FROM arena_nivelamento WHERE child_id = ? AND materia = ?').get(childId, mat) || null;
}
function salvarNivelamento(childId, dados, concluido, mat = 'matematica') {
  db.prepare(`INSERT INTO arena_nivelamento (child_id, materia, dados, concluido_em, atualizado_em) VALUES (?,?,?,?,?)
    ON CONFLICT(child_id, materia) DO UPDATE SET dados=excluded.dados, concluido_em=excluded.concluido_em, atualizado_em=excluded.atualizado_em`)
    .run(childId, mat, j.str(dados), concluido ? nowISO() : '', nowISO());
}

function nivelamentoIniciar(crianca, mat = 'matematica') {
  // retomável: se já há entrevista em andamento, continua de onde parou
  const existente = nivelamentoRow(crianca.id, mat);
  if (existente && !existente.concluido_em) {
    const dados = j.parse(existente.dados, null);
    if (dados && Array.isArray(dados.fios)) return proximaPergunta(crianca.id, dados);
  }
  const anoAlvo = crianca.faixa === '7-8' ? 3 : 5;
  const fios = fiosSonda(mat).map((f) => {
    let idx = f.cands.findIndex((c) => grafoDe(mat).ANO_DE(c) >= anoAlvo);
    if (idx === -1) idx = f.cands.length - 1;
    return { id: f.id, nome: f.nome, cands: f.cands, idx, topo: -1, feitas: 0, max: SONDA_PROFUNDA.includes(f.id) ? 4 : 3, fim: false };
  });
  const dados = { materia: mat, fios, fioAtual: 0, seed: seedNovo(), perguntas: 0 };
  salvarNivelamento(crianca.id, dados, false);
  return proximaPergunta(crianca.id, dados);
}

function proximaPergunta(childId, dados) {
  const mat = dados.materia || 'matematica';
  while (dados.fioAtual < dados.fios.length && dados.fios[dados.fioAtual].fim) dados.fioAtual++;
  if (dados.fioAtual >= dados.fios.length) return nivelamentoConcluir(childId, dados);
  const f = dados.fios[dados.fioAtual];
  const celula = f.cands[f.idx];
  const ex = moldesDe(mat).exercicio(celula, dados.seed);
  salvarNivelamento(childId, dados, false, mat);
  return {
    concluido: false,
    progresso: { atual: dados.fioAtual + 1, total: dados.fios.length, fio: f.nome },
    exercicio: { celula, seed: dados.seed, enunciado: ex.enunciado, tipo: ex.tipo, opcoes: ex.opcoes || null },
  };
}

function nivelamentoResponder(crianca, resposta, mat = 'matematica') {
  const row = nivelamentoRow(crianca.id, mat);
  if (!row || row.concluido_em) throw new Error('Nivelamento não está em andamento.');
  const dados = j.parse(row.dados, {});
  const f = dados.fios[dados.fioAtual];
  const celula = f.cands[f.idx];
  const resultado = moldesDe(dados.materia || 'matematica').conferir(celula, dados.seed, resposta);
  f.feitas++;
  dados.perguntas++;
  if (resultado.certo) {
    f.topo = Math.max(f.topo, f.idx);
    if (f.idx < f.cands.length - 1) f.idx++; else f.fim = true;
  } else if (f.idx > 0) f.idx--; else f.fim = true;
  if (f.feitas >= f.max) f.fim = true;
  dados.seed = seedNovo();
  return { certo: resultado.certo, ...proximaPergunta(crianca.id, dados) };
}

// Aplica o resultado: no fio, tudo até o topo acertado vira Competente;
// a próxima vira Aprendiz; o resto fica Descoberta (0, padrão).
function nivelamentoConcluir(childId, dados) {
  const mat = dados.materia || 'matematica';
  for (const f of dados.fios) {
    const fioCompleto = grafoDe(mat).FIOS.find((x) => x.id === f.id).celulas;
    if (f.topo >= 0) {
      const topoCodigo = f.cands[f.topo];
      const corte = fioCompleto.indexOf(topoCodigo);
      fioCompleto.forEach((c, i) => {
        if (i <= corte) Progresso.gravar(childId, c, { estado: 2, proxima_revisao: emDias(INTERVALO_DIAS[2]) });
      });
      if (corte + 1 < fioCompleto.length) Progresso.gravar(childId, fioCompleto[corte + 1], { estado: 1, proxima_revisao: '' });
    } else if (f.cands.length) {
      // errou tudo: começa do começo do fio, sem punição — só ponto de partida
      Progresso.gravar(childId, fioCompleto[0], { estado: 1, proxima_revisao: '' });
    }
  }
  salvarNivelamento(childId, dados, true, mat);
  return { concluido: true, resumo: mapa(childId, mat) };
}

// ---------------------------------------------------------------------
// Mapa e recomendação
// ---------------------------------------------------------------------
function mapa(childId, mat = 'matematica') {
  const g = grafoDe(mat), mo = moldesDe(mat);
  const prog = Progresso.todos(childId);
  const fios = g.FIOS.map((f) => {
    const celulas = f.celulas.map((c) => {
      const cel = g.celula(c);
      const p = prog[c];
      return { codigo: c, resumo: cel.resumo, ano: cel.ano, atencao: cel.atencao, treinavel: mo.temMolde(c), estado: p ? p.estado : 0, estadoNome: ESTADOS[p ? p.estado : 0], emoji: EMOJIS[p ? p.estado : 0] };
    });
    const soma = celulas.reduce((t, c) => t + c.estado, 0);
    return { id: f.id, nome: f.nome, celulas, dominio: Math.round((soma / (celulas.length * 4)) * 100) };
  });
  const xp = Object.values(prog).reduce((t, p) => t + (p.xp || 0), 0);
  return { fios, xp, nivelamento_feito: !!(nivelamentoRow(childId, mat) || {}).concluido_em };
}

function recomendada(childId, mat = 'matematica') {
  const g = grafoDe(mat), mo = moldesDe(mat);
  const prog = Progresso.todos(childId);
  const agora = nowISO();
  // 1) revisão vencida (🔥 primeiro)
  const vencidas = Object.values(prog)
    .filter((p) => p.proxima_revisao && p.proxima_revisao <= agora && mo.temMolde(p.celula))
    .sort((a, b) => {
      const ca = g.celula(a.celula), cb = g.celula(b.celula);
      return (cb.atencao === 'critica') - (ca.atencao === 'critica') || a.proxima_revisao.localeCompare(b.proxima_revisao);
    });
  if (vencidas.length) return { motivo: 'revisao', celula: vencidas[0].celula };
  // 2) menor estado entre células treináveis já abertas (estado>=1) — 🔥 primeiro, ano menor primeiro
  const abertas = mo.CELULAS_COM_MOLDE
    .map((c) => ({ c, cel: g.celula(c), p: prog[c] }))
    .filter((x) => x.p && x.p.estado >= 1 && x.p.estado < 4);
  abertas.sort((a, b) => a.p.estado - b.p.estado || (b.cel.atencao === 'critica') - (a.cel.atencao === 'critica') || a.cel.ano - b.cel.ano);
  if (abertas.length) return { motivo: abertas[0].p.estado === 1 ? 'aprender' : 'avancar', celula: abertas[0].c };
  // 3) nada aberto: primeira célula treinável do fio 2 (ponto de partida universal)
  return { motivo: 'comecar', celula: 'EF02MA05' };
}

// ---------------------------------------------------------------------
// Lição (5 exercícios) — gerar e corrigir sem sessão
// ---------------------------------------------------------------------
function gerarLicao(childId, celulaId, mat = 'matematica') {
  const mo = moldesDe(mat);
  const alvo = celulaId && mo.temMolde(celulaId) ? celulaId : recomendada(childId, mat).celula;
  const cel = grafoDe(mat).celula(alvo);
  const exercicios = [];
  const usados = new Set();
  while (exercicios.length < 5) {
    const seed = seedNovo();
    if (usados.has(seed)) continue;
    usados.add(seed);
    const ex = mo.exercicio(alvo, seed);
    exercicios.push({ seed, enunciado: ex.enunciado, tipo: ex.tipo, opcoes: ex.opcoes || null, dica: ex.dica });
  }
  const p = Progresso.obter(childId, alvo);
  return { celula: { codigo: alvo, resumo: cel.resumo, fioNome: cel.fioNome, atencao: cel.atencao, estado: p.estado, estadoNome: ESTADOS[p.estado] }, exercicios };
}

function corrigirLicao(childId, celulaId, itens, mat = 'matematica') {
  const mo = moldesDe(mat), g = grafoDe(mat);
  if (!mo.temMolde(celulaId)) throw new Error('Célula sem exercícios ainda.');
  if (!Array.isArray(itens) || !itens.length || itens.length > 10) throw new Error('Lição inválida.');
  const resultados = itens.map((it) => {
    const r = mo.conferir(celulaId, Number(it.seed) || 0, it.resposta);
    return { seed: it.seed, certo: !!(r && r.certo), resposta_certa: r ? r.resposta : '' };
  });
  const acertos = resultados.filter((x) => x.certo).length;
  const p = Progresso.obter(childId, celulaId);
  let estado = p.estado;
  if (acertos >= 4) estado = Math.min(4, estado + 1);
  else if (acertos <= 2) estado = Math.max(0, estado - 1);
  Progresso.gravar(childId, celulaId, {
    estado, xp: (p.xp || 0) + acertos * 10,
    acertos: (p.acertos || 0) + acertos, erros: (p.erros || 0) + (itens.length - acertos),
    proxima_revisao: emDias(INTERVALO_DIAS[estado]),
  });
  // Detecção de lacuna: foi mal → o pré-requisito volta para revisão imediata.
  let lacuna = null;
  const cel = g.celula(celulaId);
  if (acertos <= 2 && cel.prereq && mo.temMolde(cel.prereq)) {
    Progresso.gravar(childId, cel.prereq, { proxima_revisao: nowISO(), estado: Math.max(1, Progresso.obter(childId, cel.prereq).estado) });
    lacuna = { celula: cel.prereq, resumo: g.celula(cel.prereq).resumo };
  }
  return {
    resultados, acertos, total: itens.length,
    estado, estadoNome: ESTADOS[estado], emoji: EMOJIS[estado],
    subiu: estado > p.estado, desceu: estado < p.estado, lacuna,
  };
}

// ---------------------------------------------------------------------
// Pista — dica determinística do molde + tutor socrático (best-effort)
// ---------------------------------------------------------------------
async function pista(crianca, celulaId, seed, tentativa, mat = 'matematica') {
  const ex = moldesDe(mat).exercicio(celulaId, Number(seed) || 0);
  if (!ex) throw new Error('Exercício não encontrado.');
  const base = { dica: ex.dica, motor: 'molde' };
  try {
    const llm = require('../ia-llm');
    if (!llm.disponivel()) return base;
    const cel = grafoDe(mat).celula(celulaId);
    const r = await llm.responderComoTutor({
      crianca: { apelido: crianca.apelido, faixa: crianca.faixa },
      assistente: 'tutor da Arena',
      missao: { titulo: registro.MATERIAS[mat].nome },
      etapa: { titulo: cel.resumo },
      objetivo: 'TUTOR SOCRÁTICO da Arena: a criança pediu uma pista neste exercício. NÃO dê a resposta nem faça a conta por ela — faça UMA pergunta curta que a leve ao próximo passo, ou aponte o primeiro passo sem completar. Erro é tentativa.',
      historico: [], respostas: {},
      mensagem: `Exercício: "${ex.enunciado}". ${tentativa ? `Minha tentativa foi: "${String(tentativa).slice(0, 60)}".` : 'Ainda não tentei.'} Me dá uma pista?`,
    });
    if (r.resposta) return { dica: r.resposta, motor: 'llm' };
  } catch (_) { /* modo simples */ }
  return base;
}

module.exports = { ESTADOS, EMOJIS, fiosSonda, Progresso, materias: registro.ativas, nivelamentoIniciar, nivelamentoResponder, nivelamentoRow, mapa, recomendada, gerarLicao, corrigirLicao, pista };
