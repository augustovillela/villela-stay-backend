// =====================================================================
// ORIGENA — ler documento com IA (fase 2.3, §24).
//
// O QUE MUDA EM RELAÇÃO AO `documentos.js`: aquele extrai texto que já
// existe DENTRO do arquivo (PDF digital, .docx). Este lê o que só existe
// como IMAGEM — a certidão de 1938 fotografada, a carta manuscrita, o
// verso de retrato com data a lápis. Era o buraco declarado do produto:
// "imagem escaneada e manuscrito NÃO viram texto".
//
// POR QUE MODELO DE LINGUAGEM E NÃO OCR DEDICADO. OCR devolve letras;
// o que a Origena precisa é de ENTENDIMENTO — o tabelião que abreviou,
// a data por extenso, o "Anna" com dois enes. E o volume aqui é baixo e
// o valor por documento é altíssimo: uma certidão entra uma vez na vida.
//
// DUAS COISAS SAEM DE CADA LEITURA:
//   1. a TRANSCRIÇÃO, que vai para `document_texts` e para a busca — é o
//      que torna o escaneado finalmente encontrável. Fica marcada como
//      `ia:<modelo>`, porque texto de máquina se confere;
//   2. os ACHADOS, que ficam numa fila de sugestões e NÃO são fatos.
//      Viram claim quando uma pessoa disser de quem o papel fala (§24).
//
// O conteúdo do documento é DADO, não instrução (SECURITY.md T7): uma
// carta digitalizada pode conter "ignore as instruções anteriores".
// =====================================================================
'use strict';
const { erro } = require('./erros');
const tenancy = require('./tenancy');
const privacidade = require('./privacidade');
const storage = require('./storage');
const busca = require('./busca');
const prov = require('./proveniencia');
const conhecimento = require('./conhecimento');
const { auditar } = require('./repo');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

// Teto do que se manda ao modelo. Acima disso a conta cresce sem que a
// leitura melhore, e o provedor recusa — melhor recusar aqui, com
// mensagem que a família entende.
const MAX_BYTES_VISAO = 5 * 1024 * 1024;
const MAX_TRANSCRICAO = 60000;
// Formatos que o modelo enxerga. PDF vai como documento; o resto, imagem.
const IMAGENS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Monta o que vai ao modelo. Preferimos o texto JÁ extraído: quando o PDF
 * é digital, mandar a imagem seria pagar visão para ler o que já está em
 * caracteres. Só cai para o arquivo quando não há texto — que é
 * exatamente o caso do escaneado.
 */
async function entradaDoDocumento(t, m) {
  const d = await t.uma(`SELECT texto, status FROM document_texts WHERE media_id = $1`, [m.id]);
  if (d && d.status === 'extraido' && String(d.texto || '').trim().length > 40) {
    return { contexto: [{ id: 'documento:' + m.id, tipo: 'documento', status: 'DOCUMENTED',
      texto: String(d.texto).slice(0, 60000) }] };
  }
  const mime = m.mime_real || m.mime_declarado;
  const ehPdf = mime === 'application/pdf';
  if (!ehPdf && !IMAGENS.includes(mime)) throw erro('erro.documento_formato_nao_lido', 415);
  if (Number(m.bytes) > MAX_BYTES_VISAO) throw erro('erro.documento_grande_demais', 413);

  const buf = await storage.baixar(m.storage_key);
  return { arquivo: { mime, base64: buf.toString('base64'), nome: m.nome_original },
    contexto: [] };
}

/**
 * Lê o documento e guarda o que voltou. Segue o ciclo de créditos do §53
 * (cotar → confirmar → reservar → executar → consumir), reaproveitando o
 * mesmo executor da biografia: preço, estorno e job ficam num lugar só.
 */
async function analisar({ familyId, userId, mediaId, quem, confirmar }) {
  const m = await tenancy.comEscopo(familyId, (t) => t.uma(
    `SELECT * FROM media WHERE id = $1 AND deleted_at IS NULL`, [mediaId]));
  if (!m) throw erro('erro.midia_nao_encontrada', 404);
  if (!privacidade.podeVerDocumento(m, quem).pode) throw erro('erro.midia_nao_encontrada', 404);

  const entrada = await tenancy.comEscopo(familyId, (t) => entradaDoDocumento(t, m));
  const r = await conhecimento.executarComCreditos({ familyId, userId,
    capability: 'analisar_documento', entrada, confirmar });
  if (r.cotacao && !r.resultado) return r;               // só o preço (§53)

  const saida = r.resultado.saida || {};
  return tenancy.comEscopo(familyId, async (t) => {
    const transcricao = s(saida.transcricao, MAX_TRANSCRICAO);
    if (transcricao) await guardarTranscricao(t, { m, familyId, userId, transcricao,
      modelo: r.resultado.model });

    const achados = [];
    for (const a of (saida.achados || []).slice(0, 40)) {
      const salvo = await guardarAchado(t, { familyId, mediaId, aiJobId: r.job.id, achado: a });
      if (salvo) achados.push(salvo);
    }
    await auditar({ familyId, atorUserId: userId, acao: 'documento.lido_por_ia',
      alvoTipo: 'media', alvoId: mediaId,
      depois: { modelo: r.resultado.model, achados: achados.length,
        caracteres: transcricao.length } }, t);

    return { tipo_documento: s(saida.tipo_documento, 120), transcricao_caracteres: transcricao.length,
      achados: await achadosDe(t, mediaId), job: r.job.id };
  });
}

/**
 * A transcrição entra no MESMO lugar do texto extraído — é isso que faz o
 * escaneado aparecer na busca. `metodo` guarda que veio de IA: quem lê a
 * tela precisa saber que aquilo é leitura de máquina, não o papel.
 */
async function guardarTranscricao(t, { m, familyId, userId, transcricao, modelo }) {
  await t.q(
    `INSERT INTO document_texts (family_id, media_id, texto, metodo, paginas, caracteres, status)
     VALUES ($1,$2,$3,$4,$5,$6,'extraido')
     ON CONFLICT (media_id) DO UPDATE SET texto = EXCLUDED.texto, metodo = EXCLUDED.metodo,
       caracteres = EXCLUDED.caracteres, status = 'extraido', erro = '', updated_at = now()`,
    [familyId, m.id, transcricao, 'ia:' + modelo, m.paginas || 0, transcricao.length]);
  await busca.indexar(t, {
    familyId, refTipo: 'document', refId: m.id,
    titulo: m.titulo || m.nome_original, corpo: transcricao,
    dataIni: m.capturada_ini, dataFim: m.capturada_fim, localTexto: m.local_texto,
    privacidade: m.privacidade, criadoPor: m.created_by,
  });
  await auditar({ familyId, atorUserId: userId, atorKind: 'system', acao: 'documento.transcrito',
    alvoTipo: 'media', alvoId: m.id, depois: { metodo: 'ia:' + modelo, caracteres: transcricao.length } }, t);
}

/**
 * Guarda uma sugestão. Predicado que o produto não conhece é DESCARTADO
 * em silêncio — o modelo pode inventar categoria, e não é papel dele
 * ampliar o vocabulário do domínio.
 */
async function guardarAchado(t, { familyId, mediaId, aiJobId, achado }) {
  const pred = s(achado.predicado, 40);
  const def = prov.PREDICADOS[pred];
  if (!def) return null;
  const valor = s(achado.valor, 300);
  if (!valor) return null;
  // Reler o documento não pode ressuscitar o que a família já descartou:
  // o índice único faz a segunda leitura esbarrar na primeira.
  return t.uma(
    `INSERT INTO document_findings (family_id, media_id, ai_job_id, predicado, valor,
       valor_norm, pessoa_texto, trecho)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (media_id, predicado, valor_norm) DO NOTHING
     RETURNING *`,
    [familyId, mediaId, aiJobId, pred, valor, prov.normalizar(valor, def.tipo),
      s(achado.pessoa, 200), s(achado.trecho, 600)]);
}

const achadosDe = (t, mediaId) => t.todas(
  `SELECT f.id, f.predicado, f.valor, f.pessoa_texto, f.trecho, f.status, f.claim_id,
          f.person_id, p.nome_exibicao AS pessoa_nome, u.nome AS decidido_por_nome, f.decidido_em
     FROM document_findings f
     LEFT JOIN persons p ON p.id = f.person_id
     LEFT JOIN users u ON u.id = f.decidido_por
    WHERE f.media_id = $1 ORDER BY f.status, f.created_at`, [mediaId]);

/** Fila da família: o que a IA leu e ninguém decidiu ainda. */
const pendentesDaFamilia = (t, familyId, limite = 100) => t.todas(
  `SELECT f.id, f.media_id, f.predicado, f.valor, f.pessoa_texto, f.trecho,
          m.titulo, m.nome_original
     FROM document_findings f JOIN media m ON m.id = f.media_id
    WHERE f.family_id = $1 AND f.status = 'sugerido' AND m.deleted_at IS NULL
    ORDER BY f.created_at DESC LIMIT $2`, [familyId, Math.min(Number(limite) || 100, 200)]);

/**
 * Aceitar: a pessoa diz de quem o papel fala, e SÓ AÍ nasce o fato.
 *
 * O claim sai como DOCUMENTED, não `AI_INFERRED`: a fonte é o documento —
 * a IA apenas leu, e um humano conferiu. Quem quiser auditar o caminho
 * inteiro encontra o `ai_job_id` no achado e o trecho citado na evidência.
 */
async function aceitar(t, { familyId, userId, achadoId, personId }) {
  const f = await t.uma(`SELECT * FROM document_findings WHERE id = $1`, [achadoId]);
  if (!f) throw erro('erro.achado_nao_encontrado', 404);
  if (f.status !== 'sugerido') throw erro('erro.achado_ja_decidido', 409);
  const p = await t.uma(`SELECT id FROM persons WHERE id = $1 AND deleted_at IS NULL`, [personId]);
  if (!p) throw erro('erro.pessoa_nao_encontrada', 404);

  const m = await t.uma(`SELECT titulo, nome_original FROM media WHERE id = $1`, [f.media_id]);
  const fonte = await prov.criarFonte(t, { familyId, userId, tipo: 'DOCUMENTO',
    titulo: (m && (m.titulo || m.nome_original)) || 'Documento da família',
    referenciaExterna: 'media:' + f.media_id, confiabilidade: 'alta' });

  const claim = await prov.afirmar(t, { familyId, userId, sujeitoTipo: 'person', sujeitoId: personId,
    predicado: f.predicado, valor: f.valor, fonte, aiJobId: f.ai_job_id, trecho: f.trecho });

  await t.q(
    `UPDATE document_findings SET status = 'aceito', claim_id = $2, person_id = $3,
            decidido_por = $4, decidido_em = now() WHERE id = $1`,
    [achadoId, claim.id, personId, userId]);
  await auditar({ familyId, atorUserId: userId, acao: 'achado.aceito', alvoTipo: 'claim',
    alvoId: claim.id, depois: { achado: achadoId, predicado: f.predicado } }, t);
  return { claim, achado: achadoId };
}

/** Descartar não apaga: a sugestão errada fica registrada, e não volta. */
async function descartar(t, { familyId, userId, achadoId }) {
  const f = await t.uma(
    `UPDATE document_findings SET status = 'descartado', decidido_por = $2, decidido_em = now()
      WHERE id = $1 AND status = 'sugerido' RETURNING *`, [achadoId, userId]);
  if (!f) throw erro('erro.achado_nao_encontrado', 404);
  await auditar({ familyId, atorUserId: userId, acao: 'achado.descartado',
    alvoTipo: 'media', alvoId: f.media_id, depois: { predicado: f.predicado } }, t);
  return f;
}

module.exports = { analisar, achadosDe, pendentesDaFamilia, aceitar, descartar,
  MAX_BYTES_VISAO, IMAGENS };
