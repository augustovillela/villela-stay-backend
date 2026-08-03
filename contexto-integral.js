// =====================================================================
// CONTEXTO INTEGRAL — peça compartilhada entre os produtos.
//
// O problema que ela resolve: todo módulo com IA da casa monta contexto
// por TRECHOS (RAG/BM25, ~8 snippets). Isso é ótimo para PERGUNTAR e
// insuficiente para REDIGIR — quem escreve uma peça, um parecer, um
// contrato ou um relatório precisa dos documentos inteiros, não de
// pedaços escolhidos por relevância lexical.
//
// Aqui mora só a montagem do contexto (texto + proveniência + orçamento).
// A CHAMADA do modelo continua em cada produto (legal/llm.js,
// vdocs/ia.js, ...), porque cada um tem seus guardrails, seu log de custo
// e seu controle de limite por plano. Nada de rede, nada de banco.
//
// Usado por: legal/peticionar.js (peça a partir dos autos),
//            vdocs/redigir.js  (documento a partir da base do cliente).
// =====================================================================
'use strict';

const TETO_PADRAO = 180000; // ~45k tokens — cabe um processo comum sem estourar custo

const corta = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

// Monta o bloco de contexto a partir de fontes com TEXTO INTEGRAL.
//
//   fontes: [{ id, titulo, texto, rotulo? }]  (ordem = prioridade)
//   cabecalho: string opcional que sempre entra inteira (dados do caso)
//   teto: orçamento total de caracteres
//   rotulo: como cada fonte é anunciada ao modelo (ex.: 'CÓPIA DOS AUTOS')
//
// Devolve { texto, usadas, fontes, caracteres }: `usadas` diz o que entrou
// e o que foi truncado — informação que a TELA deve mostrar, senão o
// usuário acha que o modelo leu tudo quando não leu.
function montar({ fontes = [], cabecalho = '', teto = TETO_PADRAO, rotulo = 'DOCUMENTO', separador = '\n\n---\n\n' } = {}) {
  const partes = [];
  const usadas = [];
  const proveniencia = [];
  let orcamento = Math.max(Number(teto) || TETO_PADRAO, 2000);

  if (cabecalho) { partes.push(cabecalho); orcamento -= cabecalho.length; }

  for (const f of fontes) {
    const texto = corta(f.texto, 2000000);
    if (!texto) continue;
    if (orcamento <= 2000) { usadas.push({ id: f.id, titulo: f.titulo, caracteres: 0, truncado: true, fora: true }); continue; }
    const corte = texto.slice(0, orcamento);
    const truncado = corte.length < texto.length;
    partes.push(`[${f.rotulo || rotulo}: ${corta(f.titulo, 200)}]\n${corte}`
      + (truncado ? '\n[...] (documento truncado pelo limite de contexto)' : ''));
    usadas.push({ id: f.id, titulo: f.titulo, caracteres: corte.length, truncado, fora: false });
    proveniencia.push({ id: f.id, titulo: f.titulo });
    orcamento -= corte.length;
  }
  const texto = partes.join(separador);
  return { texto, usadas, fontes: proveniencia, caracteres: texto.length };
}

// Aviso honesto para o prompt quando algo não coube. Sem isto o modelo
// escreve como se tivesse lido o processo inteiro.
function avisoTruncamento(usadas = []) {
  const cortados = usadas.filter(u => u.truncado || u.fora);
  if (!cortados.length) return '';
  return `\n\nATENÇÃO: ${cortados.length} documento(s) não couberam por inteiro no contexto (`
    + cortados.map(u => corta(u.titulo, 80)).join('; ')
    + '). NÃO afirme nada sobre o conteúdo que não recebeu — registre a limitação nos pontos de atenção.';
}

module.exports = { montar, avisoTruncamento, TETO_PADRAO };
