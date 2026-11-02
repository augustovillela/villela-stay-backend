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

// Problema que continua aberto não pode virar um aviso a cada conferência. Esta
// é a porta: avisa quando o problema aparece ou MUDA (outra assinatura), e depois
// só lembra uma vez por dia enquanto ele seguir aberto. Assinatura vazia = o
// problema saiu, e a próxima ocorrência volta a avisar na hora. O estado fica
// em disco para que um deploy não reenvie tudo o que já foi avisado.
const DIA_MS = 24 * 60 * 60 * 1000;
let _arquivo = null;
let _estado = null;

function arquivoDeEstado() {
  if (_arquivo) return _arquivo;
  const path = require('path');
  return path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'avisos-repeticao.json');
}

function carregar() {
  if (_estado) return _estado;
  try { _estado = JSON.parse(require('fs').readFileSync(arquivoDeEstado(), 'utf8')) || {}; } catch (_) { _estado = {}; }
  return _estado;
}

function gravar() {
  const fs = require('fs');
  const path = require('path');
  try {
    const f = arquivoDeEstado();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(_estado));
  } catch (_) { /* sem disco, vale a memória até o próximo reinício */ }
}

// chave: 'growth:criticos'; assinatura: o que identifica o problema (ids, lista).
function deveAvisar(chave, assinatura, { agora = Date.now(), intervaloMs = DIA_MS } = {}) {
  const estado = carregar();
  const ass = String(assinatura || '');
  const antes = estado[chave];
  if (!ass) {
    if (antes) { delete estado[chave]; gravar(); }
    return false;
  }
  if (antes && antes.assinatura === ass && agora - antes.em < intervaloMs) return false;
  estado[chave] = { assinatura: ass, em: agora };
  gravar();
  return true;
}

// Só para testes: estado isolado num arquivo próprio.
function _usarArquivoDeEstado(arquivo) { _arquivo = arquivo; _estado = null; }

module.exports = { LIMITE_AVISO, montarAviso, paraModelo, pessoa, reais, deveAvisar, _usarArquivoDeEstado };
