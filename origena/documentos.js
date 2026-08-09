// =====================================================================
// ORIGENA — documentos: extração de texto (§24).
//
// REAPROVEITA `vdocs/extrair.js`, que já resolve PDF (pdfjs-dist), Office
// e OpenDocument com um leitor ZIP próprio — tudo em JS puro, sem
// dependência nativa. Reescrever isso aqui seria duplicar 150 linhas
// testadas por 234 testes do Villela Docs.
//
// O QUE NÃO TEMOS, E DIZEMOS: imagem escaneada e manuscrito NÃO viram
// texto. Não existe OCR contratado no grupo. Em vez de fingir, o
// documento fica `ocr_pendente` e a tela avisa — a família precisa saber
// que aquela certidão ainda não é buscável.
//
// Pipeline (§24): OCR → transcrição → entidades → datas → lugares →
// pessoas → possíveis claims → CONFIRMAÇÃO HUMANA. Desta fase entram os
// dois primeiros passos; a sugestão de claims é da Fase 7 (IA), e nada
// dela vira fato sem confirmação.
// =====================================================================
'use strict';
const { erro } = require('./erros');
const storage = require('./storage');
const busca = require('./busca');
const { auditar } = require('./repo');

// Limite de texto guardado por documento. Um PDF de 800 páginas não
// precisa virar 40 MB de linha para ser encontrável.
const MAX_TEXTO = 400000;

/**
 * Roda no WORKER. Baixa, extrai, guarda e indexa.
 * Idempotente: reprocessar um documento já extraído não faz nada.
 */
async function extrair(t, { mediaId, familyId, userId }) {
  const m = await t.uma(
    `SELECT id, nome_original, extensao, mime_real, tipo, titulo, privacidade, created_by,
            storage_key, capturada_ini, capturada_fim, local_texto
       FROM media WHERE id = $1 AND deleted_at IS NULL`, [mediaId]);
  if (!m) return { ignorado: 'mídia sumiu' };

  const ja = await t.uma(`SELECT status FROM document_texts WHERE media_id = $1`, [mediaId]);
  if (ja && ja.status === 'extraido') return { ignorado: 'já extraído' };

  const gravar = (status, dados = {}) => t.q(
    `INSERT INTO document_texts (family_id, media_id, texto, metodo, paginas, caracteres, status, erro)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (media_id) DO UPDATE SET texto = EXCLUDED.texto, metodo = EXCLUDED.metodo,
       paginas = EXCLUDED.paginas, caracteres = EXCLUDED.caracteres, status = EXCLUDED.status,
       erro = EXCLUDED.erro, updated_at = now()`,
    [familyId, mediaId, dados.texto || '', dados.metodo || '', dados.paginas || 0,
      (dados.texto || '').length, status, dados.erro || '']);

  let extraido;
  try {
    const buf = await storage.baixar(m.storage_key);
    // O nome guia a extração; usamos a EXTENSÃO REAL descoberta pelos
    // magic bytes, não a que o usuário digitou no arquivo.
    const nome = `documento.${m.extensao || (m.nome_original.split('.').pop() || 'bin')}`;
    extraido = await require('../vdocs/extrair').extrairTexto(nome, buf);
  } catch (e) {
    if (e.ocrPendente) {
      await gravar('ocr_pendente', { erro: 'erro.documento_ocr_pendente' });
      return { ocr_pendente: true, motivo: e.message };
    }
    await gravar('falhou', { erro: String(e.message || e).slice(0, 400) });
    return { falhou: e.message };
  }

  const texto = String(extraido.texto || '').slice(0, MAX_TEXTO);
  if (!texto.trim()) {
    await gravar('sem_texto', { metodo: extraido.metodo, paginas: extraido.paginas });
    return { sem_texto: true };
  }

  await gravar('extraido', { texto, metodo: extraido.metodo, paginas: extraido.paginas });

  // Sem indexar, extrair não serve para nada: o documento continuaria
  // invisível na busca.
  await busca.indexar(t, {
    familyId, refTipo: 'document', refId: mediaId,
    titulo: m.titulo || m.nome_original,
    corpo: texto,
    dataIni: m.capturada_ini, dataFim: m.capturada_fim,
    localTexto: m.local_texto,
    privacidade: m.privacidade, criadoPor: m.created_by,
  });

  await auditar({ familyId, atorUserId: userId, atorKind: 'system', acao: 'documento.extraido',
    alvoTipo: 'media', alvoId: mediaId,
    depois: { metodo: extraido.metodo, paginas: extraido.paginas, caracteres: texto.length } }, t);

  return { ok: true, metodo: extraido.metodo, paginas: extraido.paginas, caracteres: texto.length };
}

const textoDe = (t, mediaId) => t.uma(
  `SELECT texto, metodo, paginas, caracteres, status, erro, updated_at
     FROM document_texts WHERE media_id = $1`, [mediaId]);

/** Fila do que ainda não é buscável — a tela precisa poder dizer isso. */
const pendentes = (t, familyId) => t.todas(
  `SELECT d.media_id, d.status, m.nome_original, m.titulo
     FROM document_texts d JOIN media m ON m.id = d.media_id
    WHERE d.family_id = $1 AND d.status IN ('ocr_pendente','falhou','sem_texto')
      AND m.deleted_at IS NULL
    ORDER BY d.updated_at DESC LIMIT 100`, [familyId]);

module.exports = { extrair, textoDe, pendentes, MAX_TEXTO };
