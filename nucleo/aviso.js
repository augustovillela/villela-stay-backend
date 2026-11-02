// =====================================================================
// Aviso ao dono pelo WhatsApp: o que aconteceu, com quem, quanto e o que FAZER.
// Sai pelo modelo alerta_crm da Meta, que tem UMA variável, sem quebra de linha,
// num corpo de no máximo 1.024 caracteres. Por isso o aviso é uma linha só,
// separada por " | ", e o "o que fazer" nunca é o pedaço que se corta.
// =====================================================================
'use strict';

// Corpo do alerta_crm (118 caracteres) + nome. O resto é o que cabe na variável.
const LIMITE_AVISO = 880;

const SEP = ' | ';
const limpa = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

// Centavos inteiros -> "R$ 1.234,50".
function reais(centavos) {
  return 'R$ ' + (Number(centavos || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Junta as formas de contato conhecidas: "Maria · maria@x.com · 5561999990000".
function pessoa(...partes) {
  return partes.map(limpa).filter(Boolean).join(' · ');
}

// titulo: 'Livraria: venda'; campos: [['Valor', 'R$ 10,00'], ...]; fazer: 'Enviar o livro...'.
// Campo sem valor some da mensagem: nunca sai "Comprador: undefined".
function montarAviso({ titulo, campos = [], fazer = '' }, limite = LIMITE_AVISO) {
  const cabeca = limpa(titulo);
  const cauda = limpa(fazer) ? SEP + 'O QUE FAZER: ' + limpa(fazer) : '';
  let meio = campos
    .filter((c) => c && limpa(c[1]))
    .map((c) => SEP + limpa(c[0]) + ': ' + limpa(c[1]))
    .join('');
  const espaco = limite - cabeca.length - cauda.length;
  if (meio.length > espaco) meio = meio.slice(0, Math.max(0, espaco - 1)).trimEnd() + '…';
  return cabeca + meio + cauda;
}

// A variável do modelo não aceita quebra de linha e o corpo já continua com ". Veja os
// detalhes...": linhas viram " | " e o ponto final sai, para não sair "..".
function paraModelo(texto, limite = LIMITE_AVISO) {
  return String(texto == null ? '' : texto)
    .replace(/\s*[\r\n]+\s*/g, SEP)
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, limite)
    .replace(/[.\s]+$/, '');
}

module.exports = { LIMITE_AVISO, montarAviso, paraModelo, pessoa, reais };
