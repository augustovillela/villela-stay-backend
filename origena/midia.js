// =====================================================================
// ORIGENA — mídia: ingestão, derivação e contexto (Fase 4).
//
// O BINÁRIO NUNCA ATRAVESSA O PROCESSO WEB. Nem no upload, nem no
// download. O web valida, assina uma URL e grava metadado; o navegador
// fala direto com o R2. É o que protege a RAM compartilhada por 12
// produtos e resolve o §119 de graça.
//
// TRÊS MOMENTOS:
//   1. preparar()  — web: confere quota e duplicata, cria o registro
//                    `aguardando`, devolve a URL assinada de PUT.
//   2. confirmar() — web: marca `recebida` e enfileira a ingestão.
//   3. ingerir()   — WORKER: baixa, confere o hash, descobre o tipo REAL
//                    pelos bytes, lê EXIF, e só então marca `pronta`.
//
// MINIATURAS SÃO GERADAS NO NAVEGADOR, de propósito. O grupo não usa
// dependência nativa, e processar imagem no servidor exigiria uma. O
// cliente já tem o arquivo aberto para enviar: ele rasteriza em canvas e
// sobe a miniatura junto. O ORIGINAL sobe intacto e tem o hash conferido
// no worker — a miniatura é derivado, e derivado é regenerável. Se um dia
// entrar processamento de imagem no worker, ele reescreve as miniaturas
// sem tocar em nenhum original.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { erro } = require('./erros');
const storage = require('./storage');
const arquivos = require('./arquivos');
const datas = require('./datas');
const prov = require('./proveniencia');
const busca = require('./busca');
const { auditar } = require('./repo');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const SHA256 = /^[0-9a-f]{64}$/i;

// Limites por arquivo. O limite por PLANO entra na Fase 7 (billing).
const LIMITES = {
  FOTO: 60 * 1024 * 1024,
  DOCUMENTO: 100 * 1024 * 1024,
  AUDIO: 300 * 1024 * 1024,
  VIDEO: 2 * 1024 * 1024 * 1024,
};
const TIPOS = Object.keys(LIMITES);

/**
 * PASSO 1 — o navegador diz o que vai mandar; o servidor decide se pode.
 * A duplicata é detectada AQUI, antes de subir o byte: mandar de novo a
 * mesma foto não custa banda nem storage.
 */
async function preparar(t, { familyId, userId, nome, bytes, sha256, mimeDeclarado, tipoSugerido }) {
  if (!SHA256.test(String(sha256 || ''))) throw erro('erro.midia_sem_hash', 400);
  const tamanho = Number(bytes) || 0;
  if (tamanho <= 0) throw erro('erro.midia_vazia', 400);
  if (arquivos.ehProibido(mimeDeclarado)) throw erro('erro.midia_tipo_proibido', 415);

  const tipo = TIPOS.includes(tipoSugerido) ? tipoSugerido : 'FOTO';
  if (tamanho > LIMITES[tipo]) throw erro('erro.midia_grande_demais', 413);

  const jaTem = await t.uma(
    `SELECT id, status, titulo FROM media
      WHERE family_id = $1 AND sha256 = $2 AND derivado_de IS NULL AND deleted_at IS NULL`,
    [familyId, String(sha256).toLowerCase()]);
  if (jaTem) return { duplicado: true, media_id: jaTem.id, status: jaTem.status };

  const m = await t.uma(
    `INSERT INTO media (family_id, tipo, storage_key, sha256, bytes, mime_declarado,
       nome_original, status, created_by)
     VALUES ($1,$2,'',$3,$4,$5,$6,'aguardando',$7) RETURNING *`,
    [familyId, tipo, String(sha256).toLowerCase(), tamanho, s(mimeDeclarado, 100),
      s(nome, 200), userId]);

  // A chave carrega o hash: dois arquivos diferentes nunca colidem, e o
  // caminho por si já denuncia troca de conteúdo (ADR-0008).
  const chave = storage.chaveOriginal(familyId, m.id, sha256, (s(nome, 200).split('.').pop() || '').slice(0, 5));
  await t.q(`UPDATE media SET storage_key = $2 WHERE id = $1`, [m.id, chave]);

  return {
    duplicado: false,
    media_id: m.id,
    url_envio: storage.urlDeEnvio(chave),
    chave,
  };
}

/** PASSO 2 — o navegador terminou o PUT. Enfileira a conferência. */
async function confirmar(t, { familyId, userId, mediaId, fila }) {
  const m = await t.uma(
    `UPDATE media SET status = 'recebida', updated_at = now()
      WHERE id = $1 AND status = 'aguardando' RETURNING *`, [mediaId]);
  if (!m) throw erro('erro.midia_nao_encontrada', 404);
  await fila.enfileirar({
    tipo: 'midia.ingerir', fila: 'rapida', familyId,
    payload: { mediaId, familyId, userId },
    chaveIdem: 'ingerir:' + mediaId,
  }, t);
  await auditar({ familyId, atorUserId: userId, acao: 'midia.enviada',
    alvoTipo: 'media', alvoId: mediaId, depois: { bytes: Number(m.bytes) } }, t);
  return m;
}

/**
 * PASSO 3 — no WORKER. Aqui o arquivo é olhado de verdade.
 *
 * O `sha256` do cliente serviu para dedupe barata; agora ele é
 * RECONFERIDO. Cliente não é fonte de verdade (§75).
 */
async function ingerir(t, { mediaId, familyId, userId }) {
  const m = await t.uma(`SELECT * FROM media WHERE id = $1`, [mediaId]);
  if (!m) return { ignorado: 'mídia sumiu' };
  if (m.status === 'pronta') return { ignorado: 'já processada' };   // handler idempotente

  await t.q(`UPDATE media SET status = 'processando', updated_at = now() WHERE id = $1`, [mediaId]);

  const buf = await storage.baixar(m.storage_key);

  // 1. o hash bate com o que o cliente prometeu?
  const hashReal = crypto.createHash('sha256').update(buf).digest('hex');
  if (hashReal !== m.sha256) {
    await quarentena(t, mediaId, 'erro.midia_hash_diferente');
    return { quarentena: 'hash não confere' };
  }
  // 2. o tamanho bate?
  if (buf.length !== Number(m.bytes)) {
    await quarentena(t, mediaId, 'erro.midia_tamanho_diferente');
    return { quarentena: 'tamanho não confere' };
  }
  // 3. o que é ISTO, de verdade? (o MIME do navegador não vale nada)
  const real = arquivos.tipoReal(buf);
  if (!real || arquivos.ehProibido(real.mime)) {
    await quarentena(t, mediaId, 'erro.midia_tipo_nao_reconhecido');
    return { quarentena: 'tipo não reconhecido: ' + (real ? real.mime : 'desconhecido') };
  }

  const exif = real.tipo === 'FOTO' ? arquivos.lerExif(buf) : {};
  const dim = real.tipo === 'FOTO' ? arquivos.dimensoes(buf) : {};
  const largura = dim.largura || exif.largura || null;
  const altura = dim.altura || exif.altura || null;

  await t.q(
    `UPDATE media SET tipo = $2, mime_real = $3, extensao = $4, largura = $5, altura = $6,
            exif = $7, status = 'pronta', erro = '', updated_at = now()
      WHERE id = $1`,
    [mediaId, real.tipo, real.mime, real.ext, largura, altura, JSON.stringify(exif)]);

  // A data da câmera vira FATO COM FONTE — não verdade absoluta. O
  // relógio do aparelho erra, e a família precisa poder discordar dele.
  const dataExif = arquivos.dataDoExif(exif);
  if (dataExif) {
    const fonte = await prov.criarFonte(t, {
      familyId, userId, tipo: 'MIDIA',
      titulo: 'Dados da câmera (EXIF)',
      referenciaExterna: [exif.fabricante, exif.modelo].filter(Boolean).join(' ') });
    const d = datas.interpretar(dataExif);
    await t.q(
      `UPDATE media SET capturada_valor = $2, capturada_precisao = $3,
              capturada_ini = $4, capturada_fim = $5 WHERE id = $1`,
      [mediaId, d.valor, d.precisao, d.ini, d.fim]);
    await t.q(
      `INSERT INTO claims (family_id, sujeito_tipo, sujeito_id, predicado, valor, valor_tipo,
         precisao, valor_ini, valor_fim, valor_norm, status, created_by, created_by_kind)
       VALUES ($1,'media',$2,'data_captura',$3,'data',$4,$5,$6,$7,'DOCUMENTED',$8,'system')
       ON CONFLICT DO NOTHING`,
      [familyId, mediaId, d.valor, d.precisao, d.ini, d.fim,
        `${d.ini || ''}..${d.fim || ''}`, userId]);
  }

  // A mídia entra na busca já na ingestão: título, lugar e data. O texto
  // do documento chega depois, no job de extração, e faz upsert por cima.
  await busca.indexar(t, {
    familyId, refTipo: real.tipo === 'DOCUMENTO' ? 'document' : 'media', refId: mediaId,
    titulo: m.titulo || m.nome_original, corpo: m.descricao || '',
    dataIni: m.capturada_ini, dataFim: m.capturada_fim, localTexto: m.local_texto,
    privacidade: m.privacidade, criadoPor: m.created_by,
  });

  return { ok: true, tipo: real.tipo, mime: real.mime, largura, altura,
    exif: Object.keys(exif).length, documento: real.tipo === 'DOCUMENTO' };
}

async function quarentena(t, mediaId, chaveErro) {
  await t.q(`UPDATE media SET status = 'quarentena', erro = $2, updated_at = now() WHERE id = $1`,
    [mediaId, chaveErro]);
}

/**
 * Registra um DERIVADO (miniatura agora; restauração por IA na 3.0).
 * O original não é tocado — nunca (§7).
 */
async function registrarDerivado(t, { familyId, userId, originalId, papel, aiClass = 'ORIGINAL',
  sha256, bytes, mime, largura, altura, derivacao = {} }) {
  const pai = await t.uma(`SELECT * FROM media WHERE id = $1`, [originalId]);
  if (!pai) throw erro('erro.midia_nao_encontrada', 404);
  if (pai.derivado_de) throw erro('erro.derivado_de_derivado', 400);

  const id = crypto.randomUUID();
  const chave = storage.chaveDerivado(familyId, originalId, id,
    (mime || '').split('/')[1] || 'bin');
  const d = await t.uma(
    `INSERT INTO media (id, family_id, tipo, storage_key, sha256, bytes, mime_real,
       derivado_de, papel, ai_class, derivacao, largura, altura, status,
       privacidade, created_by, created_by_kind)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pronta',$14,$15,$16) RETURNING *`,
    [id, familyId, pai.tipo, chave, String(sha256 || '').toLowerCase(), Number(bytes) || 0,
      s(mime, 100), originalId, papel, aiClass, JSON.stringify(derivacao),
      largura || null, altura || null, pai.privacidade, userId,
      aiClass === 'ORIGINAL' ? 'user' : 'ai']);
  return { derivado: d, url_envio: storage.urlDeEnvio(chave), chave };
}

// ------------------------------------------------------------- galeria
const COLS = `id, tipo, titulo, descricao, capturada_valor, capturada_precisao, capturada_ini,
  local_texto, privacidade, status, largura, altura, bytes, created_by, created_at,
  (SELECT d.id FROM media d WHERE d.derivado_de = m.id AND d.papel = 'THUMB'
    ORDER BY d.bytes LIMIT 1) AS thumb_id,
  (SELECT count(*)::int FROM media_persons mp
    WHERE mp.media_id = m.id AND mp.origem IN ('MANUAL','CONFIRMADA')) AS pessoas`;

/** Paginação por cursor: acervo grande não se navega por OFFSET (§119). */
const listar = (t, familyId, { tipo = null, limite = 60, antesDe = null, pessoaId = null } = {}) => t.todas(
  `SELECT ${COLS} FROM media m
    WHERE m.family_id = $1 AND m.derivado_de IS NULL AND m.deleted_at IS NULL
      AND ($2::text IS NULL OR m.tipo = $2)
      AND ($3::timestamptz IS NULL OR m.created_at < $3)
      AND ($4::uuid IS NULL OR EXISTS (
            SELECT 1 FROM media_persons mp WHERE mp.media_id = m.id AND mp.person_id = $4
              AND mp.origem IN ('MANUAL','CONFIRMADA')))
    ORDER BY m.created_at DESC
    LIMIT $5`, [familyId, tipo, antesDe, pessoaId, Math.min(limite, 200)]);

const obter = (t, id) => t.uma(
  `SELECT * FROM media WHERE id = $1 AND deleted_at IS NULL`, [id]);

const pessoasDe = (t, mediaId) => t.todas(
  `SELECT mp.id, mp.person_id, mp.origem, mp.confianca, mp.bbox, mp.confirmado_em,
          p.nome_exibicao, u.nome AS confirmado_por_nome
     FROM media_persons mp
     LEFT JOIN persons p ON p.id = mp.person_id
     LEFT JOIN users u ON u.id = mp.confirmado_por
    WHERE mp.media_id = $1 ORDER BY mp.origem, p.nome_exibicao`, [mediaId]);

/**
 * "Quem aparece aqui". Identificação MANUAL de gente é identificação;
 * sugestão da IA entra como IA_SUGERIDA e não vale como tal (§22).
 */
async function identificar(t, { familyId, userId, mediaId, personId, origem = 'MANUAL', bbox = null, confianca = null }) {
  if (!['MANUAL', 'IA_SUGERIDA'].includes(origem)) throw erro('erro.identificacao_origem_invalida', 400);
  const confirmado = origem === 'MANUAL';
  let r;
  try {
    r = await t.uma(
      `INSERT INTO media_persons (family_id, media_id, person_id, origem, bbox, confianca,
         confirmado_por, confirmado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [familyId, mediaId, personId, confirmado ? 'CONFIRMADA' : 'IA_SUGERIDA',
        bbox ? JSON.stringify(bbox) : null, confianca,
        confirmado ? userId : null, confirmado ? new Date() : null]);
  } catch (e) {
    if (e.code === '23505') throw erro('erro.identificacao_repetida', 409);
    throw e;
  }
  await auditar({ familyId, atorUserId: userId, acao: 'midia.pessoa_identificada',
    alvoTipo: 'media', alvoId: mediaId, depois: { person_id: personId, origem: r.origem } }, t);
  return r;
}

/** Confirmar sugestão da IA é ato humano, registrado com nome e data. */
async function confirmarIdentificacao(t, { familyId, userId, id }) {
  const r = await t.uma(
    `UPDATE media_persons SET origem = 'CONFIRMADA', confirmado_por = $2, confirmado_em = now()
      WHERE id = $1 AND origem = 'IA_SUGERIDA' RETURNING *`, [id, userId]);
  if (!r) throw erro('erro.identificacao_nao_encontrada', 404);
  await auditar({ familyId, atorUserId: userId, acao: 'midia.identificacao_confirmada',
    alvoTipo: 'media', alvoId: r.media_id, depois: { person_id: r.person_id } }, t);
  return r;
}

/**
 * "CONTE A HISTÓRIA DESTA FOTO" (§23) — a experiência que transforma
 * arquivo em memória.
 *
 * As respostas viram COISAS DIFERENTES, e é isso que importa:
 *   quem aparece      → identificações (media_persons)
 *   quando/onde       → fatos com fonte (claims sobre a mídia)
 *   o que aconteceu   → contribuição, com autoria e data
 * Nada vira texto solto num campo `descricao`.
 */
async function contarHistoria(t, { familyId, userId, mediaId, respostas }) {
  const m = await obter(t, mediaId);
  if (!m) throw erro('erro.midia_nao_encontrada', 404);
  const feito = { pessoas: 0, fatos: 0, contribuicao: null };

  for (const personId of (respostas.pessoas || []).slice(0, 60)) {
    try {
      await identificar(t, { familyId, userId, mediaId, personId, origem: 'MANUAL' });
      feito.pessoas++;
    } catch (e) { if (e.chave !== 'erro.identificacao_repetida') throw e; }
  }

  const fonte = (respostas.quando || respostas.onde || respostas.ocasiao)
    ? await prov.criarFonte(t, { familyId, userId, tipo: 'RELATO',
      titulo: s(respostas.fonte_titulo, 200) || 'Contado por quem enviou a foto' })
    : null;

  if (respostas.quando) {
    const d = datas.interpretar(respostas.quando);
    if (d.erro) throw erro(d.erro, 400);
    await t.q(
      `UPDATE media SET capturada_valor = $2, capturada_precisao = $3, capturada_ini = $4,
              capturada_fim = $5, updated_at = now() WHERE id = $1`,
      [mediaId, d.valor, d.precisao, d.ini, d.fim]);
    await t.q(
      `INSERT INTO claims (family_id, sujeito_tipo, sujeito_id, predicado, valor, valor_tipo,
         precisao, valor_ini, valor_fim, valor_norm, status, created_by, created_by_kind)
       VALUES ($1,'media',$2,'data_captura',$3,'data',$4,$5,$6,$7,'FAMILY_REPORTED',$8,'user')
       ON CONFLICT DO NOTHING`,
      [familyId, mediaId, d.valor, d.precisao, d.ini, d.fim, `${d.ini || ''}..${d.fim || ''}`, userId]);
    feito.fatos++;
  }

  if (respostas.onde) {
    await t.q(`UPDATE media SET local_texto = $2, updated_at = now() WHERE id = $1`,
      [mediaId, s(respostas.onde, 200)]);
    feito.fatos++;
  }

  if (respostas.titulo) {
    await t.q(`UPDATE media SET titulo = $2, updated_at = now() WHERE id = $1`,
      [mediaId, s(respostas.titulo, 200)]);
  }

  // A história em si vira CONTRIBUIÇÃO: com autor, data e para sempre.
  const texto = [respostas.ocasiao, respostas.aconteceu, respostas.porque_importa]
    .map((x) => s(x, 5000)).filter(Boolean).join('\n\n');
  if (texto) {
    feito.contribuicao = await prov.contribuir(t, {
      familyId, userId, alvoTipo: 'media', alvoId: mediaId, corpo: texto, tipo: 'relato' });
  }

  // O contexto novo muda o que a busca encontra — reindexar aqui é o que
  // faz "aniversário na fazenda" achar esta foto.
  const atual = await obter(t, mediaId);
  await busca.indexar(t, {
    familyId, refTipo: atual.tipo === 'DOCUMENTO' ? 'document' : 'media', refId: mediaId,
    titulo: atual.titulo || atual.nome_original,
    corpo: [atual.descricao, texto].filter(Boolean).join('\n'),
    pessoas: (respostas.pessoas || []).filter(Boolean),
    dataIni: atual.capturada_ini, dataFim: atual.capturada_fim,
    localTexto: atual.local_texto, privacidade: atual.privacidade, criadoPor: atual.created_by,
  });
  await auditar({ familyId, atorUserId: userId, acao: 'midia.historia_contada',
    alvoTipo: 'media', alvoId: mediaId, depois: feito }, t);
  if (fonte) feito.fonte_id = fonte.id;
  return feito;
}

/** Soft delete. Derivado some junto; o byte fica no R2 até a purga (§66). */
async function arquivar(t, { familyId, userId, mediaId }) {
  const m = await obter(t, mediaId);
  if (!m) throw erro('erro.midia_nao_encontrada', 404);
  await t.q(`UPDATE media SET deleted_at = now() WHERE id = $1 OR derivado_de = $1`, [mediaId]);
  await busca.remover(t, 'media', mediaId);
  await busca.remover(t, 'document', mediaId);
  await auditar({ familyId, atorUserId: userId, acao: 'midia.arquivada',
    alvoTipo: 'media', alvoId: mediaId }, t);
  return true;
}

module.exports = {
  LIMITES, TIPOS, preparar, confirmar, ingerir, registrarDerivado,
  listar, obter, pessoasDe, identificar, confirmarIdentificacao,
  contarHistoria, arquivar, quarentena,
};
