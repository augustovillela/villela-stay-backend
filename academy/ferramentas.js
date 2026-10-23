// =====================================================================
// Villela Academy — EXEMPLOS das Ferramentas da jornada (Prompt Builder e
// gerador de agentes) POR CURSO. Fica em products.config.ferramentas:
//   { prompt: { funcao, objetivo, ... }, agente: { nome, missao, ... } }
// O curso só troca os TEXTOS DE EXEMPLO (placeholder de cada campo). Os
// campos, a ordem, o prompt montado e o "Lapidar com IA" são do app e não
// mudam por curso. Campo sem exemplo → o app usa o padrão (app-jornada.js).
// Gravação: POST /staff/api/academy/ferramentas (PUBLISH_KEY ou admin).
// =====================================================================
'use strict';

// mesmas chaves dos arrays PB e AG de app-jornada.js — campo novo lá entra aqui
const CAMPOS = {
  prompt: ['funcao', 'objetivo', 'publico', 'contexto', 'regras', 'estilo', 'formato', 'criterio', 'exemplo'],
  agente: ['nome', 'missao', 'area', 'fontes', 'rotina', 'categorias', 'alertas', 'confirmar', 'nunca', 'relatorio'],
};
const MAX = 400;

// valida a entrada do staff: só chaves conhecidas, só texto. Devolve o objeto
// limpo e o que foi ignorado (para a resposta dizer, não engolir calado).
function normalizar(entrada) {
  if (entrada == null) return { ferramentas: null, ignorados: [] };
  if (typeof entrada !== 'object' || Array.isArray(entrada)) throw new Error('"ferramentas" deve ser um objeto { prompt: {...}, agente: {...} }.');
  const out = {}, ignorados = [];
  for (const k of Object.keys(entrada)) if (!CAMPOS[k]) ignorados.push(k);
  for (const [grupo, campos] of Object.entries(CAMPOS)) {
    const g = entrada[grupo];
    if (g == null) continue;
    if (typeof g !== 'object' || Array.isArray(g)) throw new Error(`"ferramentas.${grupo}" deve ser um objeto.`);
    for (const k of Object.keys(g)) if (!campos.includes(k)) ignorados.push(`${grupo}.${k}`);
    const limpo = {};
    for (const c of campos) {
      if (g[c] == null || g[c] === '') continue;
      if (typeof g[c] !== 'string') throw new Error(`"ferramentas.${grupo}.${c}" deve ser texto.`);
      const t = g[c].replace(/\r\n?/g, '\n').trim().slice(0, MAX);
      if (t) limpo[c] = t;
    }
    if (Object.keys(limpo).length) out[grupo] = limpo;
  }
  return { ferramentas: Object.keys(out).length ? out : null, ignorados };
}

// o que o app do aluno recebe (no painel da jornada): só chaves conhecidas
function doProduto(produto) {
  let cfg = produto && produto.config;
  if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch (_) { cfg = {}; } }
  try { return normalizar(cfg && cfg.ferramentas).ferramentas || {}; } catch (_) { return {}; }
}

module.exports = { CAMPOS, normalizar, doProduto };
