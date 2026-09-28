// =====================================================================
// Musique — TOTP (RFC 6238), para a verificação em duas etapas das
// contas próprias (ADR-0011). Próprio de propósito: o Musique não importa
// a Academia, e isto são 30 linhas testadas contra o vetor oficial da RFC.
// =====================================================================
'use strict';
const crypto = require('crypto');

const ALFA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PASSO_S = 30;

function base32(buf) {
  let bits = 0, valor = 0, out = '';
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { out += ALFA[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALFA[(valor << (5 - bits)) & 31];
  return out;
}
function deBase32(txt) {
  let bits = 0, valor = 0; const out = [];
  for (const ch of String(txt || '').toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | ALFA.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const novoSegredo = () => base32(crypto.randomBytes(20));
const passoAgora = (agoraMs = Date.now()) => Math.floor(agoraMs / 1000 / PASSO_S);

/** Código de 6 dígitos (ou `digitos`) do passo dado. */
function codigo(segredoB32, passo, digitos = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(passo));
  const h = crypto.createHmac('sha1', deBase32(segredoB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digitos).padStart(digitos, '0');
}

/** Confere com 1 passo de folga para cada lado (relógio do celular).
 *  Devolve o PASSO que bateu — quem chama guarda e recusa repetição. */
function conferir(segredoB32, cod, { agoraMs = Date.now(), folga = 1 } = {}) {
  const c = String(cod || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !segredoB32) return null;
  const p = passoAgora(agoraMs);
  for (let d = -folga; d <= folga; d++) {
    const alvo = Buffer.from(codigo(segredoB32, p + d));
    if (crypto.timingSafeEqual(alvo, Buffer.from(c))) return p + d;
  }
  return null;
}

const uri = (segredo, email) =>
  `otpauth://totp/${encodeURIComponent('Musique:' + email)}?secret=${segredo}&issuer=Musique&algorithm=SHA1&digits=6&period=${PASSO_S}`;

module.exports = { base32, deBase32, novoSegredo, passoAgora, codigo, conferir, uri, PASSO_S };
