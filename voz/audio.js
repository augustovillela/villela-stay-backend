// =====================================================================
// Voz — obter os BYTES do áudio. Camada separada da transcrição de
// propósito: de onde o áudio vem e quem o transcreve são problemas
// diferentes, e o primeiro é o que tem travas de segurança.
//
// ⚠️ POR QUE NÃO BAIXAMOS DO WHATSAPP DIRETAMENTE
// A Cloud API entrega um `media id`, e trocá-lo por bytes exige um token
// da Graph API que **a casa não tem** — bloqueio documentado em
// 15/08/2026 (`stays\config-meta.ps1`): o app da Meta pertence ao Make,
// porque a conexão nasceu pelo embedded signup dele, então não há app
// para escolher ao gerar token de usuário do sistema.
//
// Consequência de projeto: o áudio TEM QUE CHEGAR até nós. Aceitamos
// (a) bytes em base64 no corpo — é o que o Make consegue enviar e o que
// o app da Fase 1 vai usar — e (b) uma URL pública já resolvida. Um
// `media id` cru é recusado com a explicação, e não com um 500 mudo.
//
// TRAVAS, porque isto é arquivo vindo de fora:
//   • teto de bytes conferido ANTES (Content-Length) e DURANTE o download
//     — só o `Content-Length` é promessa do outro lado, não fato;
//   • lista de tipos aceitos, não lista de proibidos;
//   • nada é gravado em disco. O disco do Render é de 1 GB para 15
//     produtos, e áudio de voz não tem por que ser retido.
// =====================================================================
'use strict';
const crypto = require('crypto');

// WhatsApp limita nota de voz a 16 MB, mas o corpo JSON do servidor vai
// até 15 MB e base64 infla ~33%. 10 MB de áudio (~13,4 MB em base64)
// cabe com folga e é MUITO mais do que qualquer comando falado.
const MAX_BYTES = Number(process.env.VOZ_AUDIO_MAX_BYTES || 10 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.VOZ_AUDIO_TIMEOUT_MS || 20000);

// Allowlist. Nota de voz do WhatsApp é audio/ogg (opus).
const TIPOS = {
  'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/webm': 'webm', 'video/webm': 'webm',
  'audio/flac': 'flac',
};

const recusa = (msg, status = 400) => Object.assign(new Error(msg), { status, permanente: true });

/** Normaliza o mime (o canal manda `audio/ogg; codecs=opus`, com espaço
 *  ou sem) e devolve a extensão, que é o que o transcritor precisa. */
function extensaoDe(mime) {
  const m = String(mime || '').toLowerCase().trim().replace(/;\s*/g, '; ');
  return TIPOS[m] || TIPOS[m.split(';')[0].trim()] || null;
}

const ehTipoAceito = (mime) => !!extensaoDe(mime);

/**
 * Uma origem de áudio → `{ bytes, mime, extensao, chave }`.
 *
 * `chave` identifica a ORIGEM para o cache de transcrição: o id da mídia
 * quando existe (dois reenvios do mesmo áudio têm o mesmo id) e, sem
 * ele, o hash dos bytes.
 *
 * Aceita:
 *   Buffer                                  — já são os bytes
 *   { base64, mime, id? }                   — o caminho do Make e do app
 *   { url, mime?, id? }                     — URL já resolvida e pública
 *   'data:audio/ogg;base64,...'             — data URI
 *   { id }                                  — RECUSADO, com o motivo
 */
async function obter(entrada) {
  if (!entrada) throw recusa('Sem áudio.');

  if (Buffer.isBuffer(entrada)) return montar(entrada, 'audio/ogg', '');

  if (typeof entrada === 'string') {
    const m = entrada.match(/^data:([^;,]+);base64,(.*)$/s);
    if (m) return deBase64(m[2], m[1], '');
    if (/^https?:\/\//i.test(entrada)) return deUrl(entrada, '', '');
    throw recusa('Formato de áudio não reconhecido.');
  }

  const { base64, url, mime = '', id = '' } = entrada;
  if (base64) return deBase64(base64, mime, id);
  if (url) return deUrl(url, mime, id);

  if (id) {
    // Explicação, não 500. Quem lê isto no log sabe o que falta fazer.
    throw recusa(
      'Recebi só o id da mídia do WhatsApp, e trocá-lo por bytes exige token da Graph API, '
      + 'que a casa não tem (bloqueio de 15/08/2026: o app da Meta pertence ao Make). '
      + 'O cenário do Make precisa baixar o áudio e mandar os bytes em base64.', 501);
  }
  throw recusa('Áudio sem `base64` nem `url`.');
}

function deBase64(base64, mime, id) {
  let bytes;
  try { bytes = Buffer.from(String(base64), 'base64'); }
  catch (_) { throw recusa('base64 inválido.'); }
  if (!bytes.length) throw recusa('Áudio vazio.');
  if (bytes.length > MAX_BYTES) {
    throw recusa(`Áudio de ${Math.round(bytes.length / 1024)} KB passa do teto de ${Math.round(MAX_BYTES / 1024)} KB.`);
  }
  return montar(bytes, mime || 'audio/ogg', id);
}

async function deUrl(url, mime, id) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) throw recusa(`O áudio não veio (HTTP ${r.status}).`, r.status === 404 ? 400 : 502);

    const tipo = mime || r.headers.get('content-type') || 'audio/ogg';
    if (!ehTipoAceito(tipo)) throw recusa(`Tipo de áudio não aceito: ${tipo}.`);

    // O Content-Length é PROMESSA do outro lado. Serve para recusar cedo
    // e barato; a garantia de verdade é a contagem durante a leitura.
    const prometido = Number(r.headers.get('content-length') || 0);
    if (prometido && prometido > MAX_BYTES) {
      throw recusa(`Áudio de ${Math.round(prometido / 1024)} KB passa do teto.`);
    }

    const partes = [];
    let total = 0;
    for await (const pedaco of r.body) {
      total += pedaco.length;
      if (total > MAX_BYTES) {
        ctrl.abort();   // corta a conexão em vez de terminar de baixar e só então recusar
        throw recusa(`O áudio passou do teto de ${Math.round(MAX_BYTES / 1024)} KB durante o download.`);
      }
      partes.push(pedaco);
    }
    const bytes = Buffer.concat(partes);
    if (!bytes.length) throw recusa('Áudio vazio.');
    return montar(bytes, tipo, id);
  } catch (e) {
    if (e.status) throw e;
    if (e.name === 'AbortError') throw recusa('O download do áudio demorou demais.', 504);
    throw recusa(`Falha ao baixar o áudio: ${e.message}`, 502);
  } finally { clearTimeout(timer); }
}

function montar(bytes, mime, id) {
  const extensao = extensaoDe(mime);
  if (!extensao) throw recusa(`Tipo de áudio não aceito: ${mime}.`);
  if (bytes.length > MAX_BYTES) throw recusa('Áudio acima do teto.');
  const chave = id ? `media:${id}` : `sha:${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32)}`;
  return { bytes, mime, extensao, chave, tamanho: bytes.length };
}

module.exports = { obter, ehTipoAceito, extensaoDe, MAX_BYTES, TIPOS };
