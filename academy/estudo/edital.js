// =====================================================================
// Villela Academy — ESTUDO · o PROGRAMA como lista rastreável de itens.
// Serve ao edital de concurso e ao assunto avulso: nos dois, o escopo é
// uma árvore de itens com texto original, numeração e origem. Puro.
//
// O texto do item NUNCA é resumido nem reescrito aqui (prompt mestre,
// seção 3.1): reorganizar é trabalho das competências; este arquivo só
// preserva, valida e compara versões (retificação).
// =====================================================================
'use strict';
const crypto = require('crypto');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const normal = (t) => s(t, 20000).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const hash = (t) => crypto.createHash('sha1').update(normal(t)).digest('hex').slice(0, 16);

const NUMERACAO = /^\s*(\d{1,3}(?:\.\d{1,3}){0,5})[.)]?\s+(\S.*)$/;
const codigoPai = (codigo) => (codigo.includes('.') ? codigo.slice(0, codigo.lastIndexOf('.')) : '');

// Programa colado em texto → itens. Linha numerada abre item; linha sem
// número continua o item anterior (quebra de página, OCR). Texto antes do
// primeiro número volta em `sobras`: nada some calado.
function extrairDoTexto(texto) {
  const itens = [], sobras = [];
  for (const linha of String(texto || '').split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const m = linha.match(NUMERACAO);
    if (m) itens.push({ codigo: m[1], texto: m[2].trim() });
    else if (itens.length) itens[itens.length - 1].texto += ' ' + linha.trim();
    else sobras.push(linha.trim());
  }
  return { itens, sobras };
}

// Valida e completa: código único, pai existente, texto presente.
// `pendente` marca leitura incerta (OCR, regra ambígua) — o item entra,
// visível como pendência, e não conta como coberto.
function normalizarItens(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new Error('programa: informe ao menos um item.');
  if (lista.length > 5000) throw new Error('programa: mais de 5.000 itens — divida o escopo.');
  const codigos = new Set();
  const itens = lista.map((it, i) => {
    const codigo = s(it && it.codigo, 40);
    const texto = s(it && it.texto, 4000);
    if (!codigo) throw new Error(`programa: item ${i + 1} sem código.`);
    if (!texto) throw new Error(`programa: item ${codigo} sem texto.`);
    if (codigos.has(codigo)) throw new Error(`programa: código ${codigo} repetido.`);
    codigos.add(codigo);
    const faixa = Array.isArray(it.esforco_min) ? it.esforco_min.slice(0, 2).map(n => Math.max(0, Math.round(Number(n) || 0))) : null;
    return {
      codigo, pai: s(it.pai, 40) || codigoPai(codigo), ordem: i, texto, hash: hash(texto),
      localizacao: s(it.localizacao, 200), pendente: s(it.pendente, 300),
      peso: Number.isFinite(Number(it.peso)) ? Number(it.peso) : 0,
      esforco_min: faixa && faixa[1] ? faixa : null,
    };
  });
  for (const it of itens) {
    // pai que não veio no programa não é erro de digitação a esconder: o item sobe para a raiz
    if (it.pai && !codigos.has(it.pai)) it.pai = '';
  }
  const pais = new Set(itens.map(i => i.pai).filter(Boolean));
  itens.forEach(i => { i.folha = !pais.has(i.codigo); });
  return itens;
}

// Retificação: o que entrou, o que saiu e o que mudou de redação.
function comparar(antes, depois) {
  const a = new Map((antes || []).map(i => [i.codigo, i]));
  const d = new Map((depois || []).map(i => [i.codigo, i]));
  const r = { adicionados: [], removidos: [], alterados: [], iguais: 0 };
  for (const [codigo, it] of d) {
    const velho = a.get(codigo);
    if (!velho) r.adicionados.push({ codigo, texto: it.texto });
    else if (velho.hash !== it.hash) r.alterados.push({ codigo, antes: velho.texto, depois: it.texto });
    else r.iguais++;
  }
  for (const [codigo, it] of a) if (!d.has(codigo)) r.removidos.push({ codigo, texto: it.texto });
  r.mudou = !!(r.adicionados.length || r.removidos.length || r.alterados.length);
  return r;
}

module.exports = { extrairDoTexto, normalizarItens, comparar, hash, normal, codigoPai };
