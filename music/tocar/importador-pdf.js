'use strict';

// Classifica PDFs musicais sem confundir texto de partitura com notas MIDI.
// Cifras com camada de texto podem seguir para ChordPro; partituras precisam
// de OMR para virar MusicXML/MXL.
const { dePdf } = require('../cifras/importar/extratores');

const LIMITE_BYTES = 10 * 1024 * 1024;
const RE_ACORDE_TOKEN = /^[A-G](?:#|b)?(?:\d+)?(?:maj|min|m|M|dim|aug|sus|add)?\d*(?:\/[A-G](?:#|b)?)?$/;
const RE_NOTACAO = /[]/g;

function erro(mensagem, status = 400) { return Object.assign(new Error(mensagem), { status }); }

function classificarTexto(texto) {
  const t = String(texto || '');
  const acordes = t.split(/\s+/).map((token) => token.replace(/^[\[({]+|[\]})]+$/g, '')).filter((token) => RE_ACORDE_TOKEN.test(token)).length;
  const simbolos = (t.match(RE_NOTACAO) || []).length;
  const linhas = t.split(/\r?\n/).filter(Boolean).length;
  if (acordes >= 3 && acordes >= simbolos) return { tipo: 'cifra', confianca: Math.min(0.98, 0.65 + acordes / 100), acordes, simbolos, linhas };
  if (simbolos >= 3 || /piano\s+solo|sheet\s+music|partitura/i.test(t)) return { tipo: 'partitura', confianca: Math.min(0.96, 0.7 + simbolos / 100), acordes, simbolos, linhas };
  return { tipo: 'desconhecido', confianca: 0.25, acordes, simbolos, linhas };
}

async function analisarPdf(bytes, nome = '') {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!buf.length) throw erro('O PDF está vazio.');
  if (buf.length > LIMITE_BYTES) throw erro('O PDF deve ter no máximo 10 MiB.');
  if (buf.subarray(0, 5).toString('ascii') !== '%PDF-') throw erro('O arquivo não é um PDF válido.');
  try {
    const extraido = await dePdf(buf);
    const classificacao = classificarTexto(extraido.texto);
    return { nome: String(nome || '').slice(0, 160), metodo: extraido.metodo, paginas: extraido.paginas,
      texto: extraido.texto, ...classificacao, proximo: classificacao.tipo === 'cifra' ? 'chordpro' : classificacao.tipo === 'partitura' ? 'omr-musicxml' : 'revisao-manual' };
  } catch (e) {
    if (e.ocrPendente) return { nome: String(nome || '').slice(0, 160), metodo: 'pdf-sem-texto', paginas: e.paginas || 0,
      texto: '', tipo: 'desconhecido', confianca: 0, acordes: 0, simbolos: 0, linhas: 0, proximo: 'ocr-ou-omr' };
    throw e;
  }
}

module.exports = { analisarPdf, classificarTexto, LIMITE_BYTES };
