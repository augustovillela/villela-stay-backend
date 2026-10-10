// =====================================================================
// Villela Academy — ESTUDO · regras do BANCO DE QUESTÕES. Puro.
//
// A trava central é a PROCEDÊNCIA (prompt mestre, seção 10.2). Quatro
// origens que nunca se misturam:
//   oficial   questão de prova real — exige banca/órgão, concurso, ano e fonte
//   adaptada  mexida a partir de uma oficial — exige dizer de qual e o que mudou
//   autoral   escrita para o curso (por gente ou por IA) — NÃO leva banca
//   relato    reconstrução de prova oral por candidato — nunca vira "oficial"
// "Inspirada no estilo da banca" é autoral com `inspirada_em`; atribuir à
// banca uma questão inventada é o erro que este arquivo existe para barrar.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { normal } = require('./edital');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

const TIPOS = ['objetiva', 'multipla', 'certo_errado', 'curta', 'discursiva', 'peca', 'oral'];
const FECHADOS = ['objetiva', 'multipla', 'certo_errado'];
const ORIGENS = ['oficial', 'adaptada', 'autoral', 'relato'];
const GABARITOS = ['definitivo', 'preliminar', 'alterado', 'anulada', 'sem_gabarito_oficial', 'pedagogico'];
const SITUACOES = ['rascunho', 'revisao', 'disponivel', 'suspensa', 'arquivada'];
const USOS = ['aprendizagem', 'revisao', 'reservada']; // reservada = só entra em simulado/aferição
const LETRAS = 'abcdefghij';

function validarProcedencia(q, onde) {
  const p = q.procedencia || {};
  const pr = {
    banca: s(p.banca, 80), comissao: s(p.comissao, 120), orgao: s(p.orgao, 120), cargo: s(p.cargo, 120),
    concurso: s(p.concurso, 160), ano: Math.round(Number(p.ano) || 0), etapa: s(p.etapa, 60),
    caderno: s(p.caderno, 40), numero_original: s(p.numero_original, 20), fonte: s(p.fonte, 400),
    adaptada_de: s(p.adaptada_de, 300), alteracao: s(p.alteracao, 400), inspirada_em: s(p.inspirada_em, 200),
    grau_verificacao: s(p.grau_verificacao, 80), consultado_em: s(p.consultado_em, 10),
  };
  const origem = s(q.origem, 12);
  if (!ORIGENS.includes(origem)) throw new Error(`${onde}: origem deve ser ${ORIGENS.join('|')}.`);
  const ia = !!q.gerada_por_ia;
  if (origem === 'oficial') {
    if (ia) throw new Error(`${onde}: questão gerada por IA não pode ter origem oficial.`);
    if (!(pr.banca || pr.orgao) || !pr.concurso || !pr.ano || !pr.fonte) throw new Error(`${onde}: questão oficial exige banca ou órgão, concurso, ano e fonte.`);
  } else if (origem === 'adaptada') {
    if (!pr.adaptada_de || !pr.alteracao) throw new Error(`${onde}: questão adaptada exige "adaptada_de" e "alteracao" (o que mudou).`);
  } else if (origem === 'autoral') {
    if (pr.banca || pr.concurso || pr.numero_original) throw new Error(`${onde}: questão autoral não leva banca nem concurso — use "inspirada_em" se for o caso.`);
  } else if (!pr.fonte || !pr.grau_verificacao) throw new Error(`${onde}: relato exige fonte e grau_verificacao.`);
  return { origem, gerada_por_ia: ia, procedencia: pr };
}

function validarQuestao(q, i = 0) {
  const onde = `questão ${i + 1}`;
  if (!q || typeof q !== 'object') throw new Error(`${onde}: inválida.`);
  const tipo = s(q.tipo || 'objetiva', 20);
  if (!TIPOS.includes(tipo)) throw new Error(`${onde}: tipo deve ser ${TIPOS.join('|')}.`);
  const enunciado = s(q.enunciado, 12000);
  if (enunciado.length < 10) throw new Error(`${onde}: enunciado muito curto.`);
  const proc = validarProcedencia(q, onde);
  let gabSit = s(q.gabarito_situacao, 24) || (proc.origem === 'oficial' ? '' : 'pedagogico');
  if (!GABARITOS.includes(gabSit)) throw new Error(`${onde}: gabarito_situacao deve ser ${GABARITOS.join('|')}.`);
  if (proc.origem !== 'oficial' && ['definitivo', 'preliminar', 'alterado'].includes(gabSit)) throw new Error(`${onde}: só questão oficial tem gabarito de banca; use "pedagogico".`);

  const r = {
    tipo, enunciado, apoio: s(q.apoio, 20000), grupo: s(q.grupo, 60), ordem_fixa: !!q.ordem_fixa,
    ...proc, gabarito_situacao: gabSit, comentario: s(q.comentario, 6000),
    // bloco = a divisão que a REGRA DE PONTUAÇÃO usa (mínimo por bloco); não é a disciplina —
    // no concurso da magistratura do trabalho o Bloco I reúne cinco disciplinas
    area: s(q.area, 80), bloco: s(q.bloco, 20), disciplina: s(q.disciplina, 80), assunto: s(q.assunto, 120), subassunto: s(q.subassunto, 120),
    dificuldade_estimada: Math.min(5, Math.max(0, Math.round(Number(q.dificuldade_estimada) || 0))),
    tempo_estimado_seg: Math.max(0, Math.round(Number(q.tempo_estimado_seg) || 0)),
    uso: USOS.includes(q.uso) ? q.uso : 'aprendizagem',
    vigencia: s(q.vigencia, 300), // ex.: "desatualizada desde a Lei X" — separa simulação histórica de estudo atual
    pistas: (Array.isArray(q.pistas) ? q.pistas : []).map(p => s(p, 500)).filter(Boolean).slice(0, 5),
    alternativas: [], rubrica: [],
  };

  if (FECHADOS.includes(tipo)) {
    const alts = Array.isArray(q.alternativas) ? q.alternativas : [];
    if (alts.length < 2 || alts.length > LETRAS.length) throw new Error(`${onde}: de 2 a ${LETRAS.length} alternativas.`);
    r.alternativas = alts.map((a, k) => {
      const texto = s(a && a.texto, 3000);
      if (!texto) throw new Error(`${onde}: alternativa ${k + 1} sem texto.`);
      return { id: LETRAS[k], texto, correta: !!(a && a.correta), explicacao: s(a && a.explicacao, 2000) };
    });
    const certas = r.alternativas.filter(a => a.correta).length;
    if (gabSit === 'anulada' || gabSit === 'sem_gabarito_oficial') {
      // sem gabarito confiável: a questão entra para leitura, fora da correção automática
    } else if (tipo === 'multipla' ? certas < 1 : certas !== 1) throw new Error(`${onde}: ${tipo === 'multipla' ? 'ao menos uma' : 'exatamente uma'} alternativa correta.`);
    // questão escrita para o curso tem de explicar por que cada distrator falha
    if (proc.origem !== 'oficial' && r.alternativas.some(a => !a.explicacao)) throw new Error(`${onde}: toda alternativa precisa de explicação.`);
  } else {
    const rub = Array.isArray(q.rubrica) ? q.rubrica : [];
    r.rubrica = rub.map(c => ({ criterio: s(c && c.criterio, 200), peso: Math.max(1, Math.round(Number(c && c.peso) || 1)), nivel3: s(c && c.nivel3, 600) })).filter(c => c.criterio);
    if (r.rubrica.length < 2) throw new Error(`${onde}: questão aberta exige rubrica com ao menos 2 critérios.`);
    r.espelho_oficial = !!q.espelho_oficial && proc.origem === 'oficial';
    r.erros_criticos = (Array.isArray(q.erros_criticos) ? q.erros_criticos : []).map(e => s(e, 300)).filter(Boolean).slice(0, 8);
  }
  r.corrigivel = FECHADOS.includes(tipo) && !['anulada', 'sem_gabarito_oficial'].includes(gabSit);
  r.hash = hashQuestao(r);
  return r;
}

// Mesma questão em outro caderno (alternativas em outra ordem) = mesmo hash.
function hashQuestao(q) {
  const alts = (q.alternativas || []).map(a => normal(a.texto)).sort().join('\u0001');
  return crypto.createHash('sha1').update(normal(q.enunciado) + '\u0002' + normal(q.apoio || '') + '\u0002' + alts).digest('hex').slice(0, 20);
}

// Embaralha por semente (aluno + tentativa): a correção refaz a mesma ordem.
function embaralhar(lista, semente) {
  const r = [...lista];
  let h = crypto.createHash('sha1').update(String(semente)).digest();
  for (let i = r.length - 1, k = 0; i > 0; i--, k++) {
    if (k >= h.length - 1) { h = crypto.createHash('sha1').update(h).digest(); k = 0; }
    const jx = h[k] % (i + 1);
    [r[i], r[jx]] = [r[jx], r[i]];
  }
  return r;
}

// O que vai ao navegador: nunca `correta`, `explicacao`, comentário ou rubrica interna.
function paraAluno(q, semente) {
  const alts = q.ordem_fixa || q.tipo === 'certo_errado' ? q.alternativas : embaralhar(q.alternativas, semente + ':' + q.id);
  return {
    id: q.id, tipo: q.tipo, enunciado: q.enunciado, apoio: q.apoio, grupo: q.grupo,
    alternativas: alts.map(a => ({ id: a.id, texto: a.texto })),
    rubrica_publica: (q.rubrica || []).map(c => ({ criterio: c.criterio, peso: c.peso })),
    origem: q.origem, gerada_por_ia: q.gerada_por_ia, gabarito_situacao: q.gabarito_situacao, vigencia: q.vigencia,
    procedencia: q.origem === 'autoral' ? { inspirada_em: q.procedencia.inspirada_em } : q.procedencia,
    pistas_disponiveis: (q.pistas || []).length,
  };
}

const gabaritoDe = (q) => {
  const certas = q.alternativas.filter(a => a.correta).map(a => a.id);
  return q.tipo === 'multipla' ? certas : certas[0];
};

// ---------------------------------------------------------------------
// EIXOS DO BANCO (ADR-0009) — cargo, matéria, banca/organizadora, órgão e ano, num vocabulário único.
// O caderno de cada concurso escreve a banca e o órgão de um jeito; o filtro precisa de UM nome.
// O assunto é o vínculo com o programa (item do edital / competência) e já tem filtro próprio.
// ---------------------------------------------------------------------
const semAcento = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const COMISSAO = 'Comissão do próprio tribunal';
const BANCAS = [[/\bfgv\b|getulio vargas/, 'FGV'], [/\bfcc\b|carlos chagas/, 'FCC'], [/cespe|cebraspe/, 'Cebraspe (Cespe)'], [/comiss|proprio tribunal|propria corte/, COMISSAO]];
function bancaCanonica(p) {
  const b = semAcento(p.banca);
  if (!b) return p.orgao || p.comissao ? COMISSAO : '';
  const achada = BANCAS.find(([re]) => re.test(b));
  return achada ? achada[1] : s(p.banca, 80);
}
function orgaoCanonico(p) {
  const o = semAcento(p.orgao || p.concurso);
  const trt = o.match(/tribunal regional do trabalho da (\d+)|\btrt[\s-]*(\d+)/);
  if (trt) return 'TRT-' + Number(trt[1] || trt[2]);
  if (/conselho superior da justica do trabalho|\bcsjt\b|concurso (publico )?nacional/.test(o)) return 'CSJT (concurso nacional)';
  return s(p.orgao, 120);
}
function cargoCanonico(p) {
  const c = semAcento(p.cargo);
  if (/ju[ií]z.*trabalho/.test(c)) return 'Juiz do Trabalho Substituto';
  return s(p.cargo, 120);
}
function eixos(q) {
  const p = q.procedencia || {};
  // banca, órgão, cargo e ano são da PROVA: questão autoral não tem (e "inspirada em" não é procedência)
  if (q.origem !== 'oficial') return { banca: '', orgao: '', cargo: '', ano: 0, materia: s(q.disciplina, 120) };
  return { banca: bancaCanonica(p), orgao: orgaoCanonico(p), cargo: cargoCanonico(p), ano: Math.round(Number(p.ano) || 0), materia: s(q.disciplina, 120) };
}
const filtroDeEixos = (o = {}) => ({ banca: s(o.banca, 80), orgao: s(o.orgao, 120), cargo: s(o.cargo, 120), ano_de: Math.round(Number(o.ano_de) || 0), ano_ate: Math.round(Number(o.ano_ate) || 0) });
const temFiltroDeEixos = (f) => !!(f.banca || f.orgao || f.cargo || f.ano_de || f.ano_ate);
function casaEixos(q, f) {
  if (!temFiltroDeEixos(f)) return true;
  const e = eixos(q);
  return (!f.banca || e.banca === f.banca) && (!f.orgao || e.orgao === f.orgao) && (!f.cargo || e.cargo === f.cargo)
    && (!f.ano_de || e.ano >= f.ano_de) && (!f.ano_ate || (e.ano && e.ano <= f.ano_ate));
}
// quantas questões há em cada valor de cada eixo — é o que a tela oferece para filtrar
function facetas(lista) {
  const conta = { banca: new Map(), orgao: new Map(), cargo: new Map(), ano: new Map(), materia: new Map() };
  for (const q of lista) { const e = eixos(q); for (const k of Object.keys(conta)) if (e[k]) conta[k].set(e[k], (conta[k].get(e[k]) || 0) + 1); }
  const lista_ = (m, porNumero) => [...m.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => porNumero ? b.valor - a.valor : b.n - a.n || String(a.valor).localeCompare(String(b.valor)));
  return { bancas: lista_(conta.banca), orgaos: lista_(conta.orgao), cargos: lista_(conta.cargo), anos: lista_(conta.ano, true), materias: lista_(conta.materia) };
}

module.exports = { bancaCanonica, eixos, filtroDeEixos, temFiltroDeEixos, casaEixos, facetas, validarQuestao, hashQuestao, embaralhar, paraAluno, gabaritoDe, TIPOS, FECHADOS, ORIGENS, GABARITOS, SITUACOES, USOS };
