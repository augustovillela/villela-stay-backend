// =====================================================================
// ORIGENA — contas, sessão e MFA (SECURITY.md T5).
//
// Cookie próprio `origena_sess` (o grupo não tem login único — cada
// produto tem o seu). JWT curto, httpOnly/Secure/SameSite, revogável em
// bloco por `users.sessao_versao`: trocar senha ou pedir "sair de todos
// os dispositivos" invalida tudo de verdade, não só o cookie atual.
//
// MFA: TOTP (RFC 6238) escrito à mão com `crypto` — o grupo não usa
// dependência nativa e não precisa de uma para 40 linhas de HMAC.
// O segredo fica CIFRADO em repouso (AES-256-GCM), no padrão do
// growth\segredos.js.
// =====================================================================
'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const COOKIE = 'origena_sess';
const DIAS = Number(process.env.ORIGENA_SESSAO_DIAS || 7);
const SEGURO = process.env.NODE_ENV !== 'development';
const CUSTO_BCRYPT = Number(process.env.ORIGENA_BCRYPT || 12);

let _jwtSecret = null;
const configurar = ({ jwtSecret }) => { _jwtSecret = jwtSecret; };
function segredo() {
  if (!_jwtSecret) throw new Error('sessao: jwtSecret não configurado.');
  return _jwtSecret;
}

// ------------------------------------------------------------------ senha
const hashSenha = (senha) => bcrypt.hash(String(senha), CUSTO_BCRYPT);
const conferirSenha = (senha, hash) => bcrypt.compare(String(senha || ''), String(hash || ''));

/** Regras mínimas. Comprimento vale mais que zoológico de símbolos. */
function senhaFraca(senha) {
  const s = String(senha || '');
  if (s.length < 10) return 'A senha precisa de pelo menos 10 caracteres.';
  if (/^(\d+|[a-z]+|[A-Z]+)$/.test(s)) return 'Misture letras e números.';
  if (['senha12345', '1234567890', 'origena123'].includes(s.toLowerCase())) return 'Essa senha é fácil demais.';
  return null;
}

// ------------------------------------------------------- cofre do segredo MFA
// Mesma decisão do Growth OS: sem chave, o cofre RECUSA gravar. Não
// existe modo silencioso sem criptografia.
function chaveCofre() {
  const bruta = process.env.ORIGENA_SECRET_KEY || '';
  if (!bruta) return null;
  const buf = /^[0-9a-f]{64}$/i.test(bruta) ? Buffer.from(bruta, 'hex') : Buffer.from(bruta, 'base64');
  if (buf.length !== 32) throw new Error('ORIGENA_SECRET_KEY precisa ter 32 bytes (hex ou base64).');
  return buf;
}
function cifrar(texto) {
  const k = chaveCofre();
  if (!k) throw new Error('MFA indisponível: defina ORIGENA_SECRET_KEY.');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), dados.toString('base64')].join('.');
}
function decifrar(pacote) {
  const k = chaveCofre();
  if (!k) throw new Error('MFA indisponível: defina ORIGENA_SECRET_KEY.');
  const [iv, tag, dados] = String(pacote).split('.');
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8');
}
const mfaDisponivel = () => !!chaveCofre();

// ------------------------------------------------------------------ TOTP
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const gerarSegredoTOTP = () => Array.from(crypto.randomBytes(20)).map((b) => B32[b % 32]).join('');

function base32Decode(s) {
  let bits = '';
  for (const c of String(s).toUpperCase().replace(/=+$/, '')) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    bits += i.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function codigoTOTP(segredoB32, janela = 0, agoraMs = Date.now()) {
  const contador = Math.floor(agoraMs / 30000) + janela;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(contador / 0x100000000), 0);
  buf.writeUInt32BE(contador >>> 0, 4);
  const h = crypto.createHmac('sha1', base32Decode(segredoB32)).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1000000).padStart(6, '0');
}

/** Aceita ±1 janela (30 s) — relógio de celular atrasa. */
function conferirTOTP(segredoB32, codigo, agoraMs = Date.now()) {
  const alvo = String(codigo || '').replace(/\D/g, '');
  if (alvo.length !== 6) return false;
  for (const j of [-1, 0, 1]) {
    // comparação em tempo constante: TOTP é força-bruta-ável
    const esperado = codigoTOTP(segredoB32, j, agoraMs);
    if (crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(alvo))) return true;
  }
  return false;
}

const urlOtpauth = (email, segredoB32) =>
  `otpauth://totp/${encodeURIComponent('Origena:' + email)}?secret=${segredoB32}&issuer=Origena&digits=6&period=30`;

const gerarCodigosBackup = () =>
  Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-'));

// ------------------------------------------------------------------ cookie
function emitir(res, usuario) {
  const token = jwt.sign(
    { sub: usuario.id, v: usuario.sessao_versao, mfa: !!usuario.mfa_ativo },
    segredo(), { expiresIn: `${DIAS}d` },
  );
  res.cookie(COOKIE, token, {
    httpOnly: true, secure: SEGURO, sameSite: 'lax',
    maxAge: DIAS * 24 * 3600 * 1000, path: '/origena',
  });
  return token;
}
const encerrar = (res) => res.clearCookie(COOKIE, { path: '/origena' });

/**
 * Middleware de sessão. `sessao_versao` diferente = sessão morta, mesmo
 * com JWT válido e não expirado.
 */
async function carregarUsuario(req) {
  const token = (req.cookies && req.cookies[COOKIE]) || '';
  if (!token) return null;
  let dados;
  try { dados = jwt.verify(token, segredo()); } catch (_) { return null; }
  const u = await db.uma(
    `SELECT id, nome, email, idioma, status, email_verificado, mfa_ativo, sessao_versao
       FROM users WHERE id = $1 AND deleted_at IS NULL`, [dados.sub]);
  if (!u || u.status !== 'ativo') return null;
  if (u.sessao_versao !== dados.v) return null;      // logout global
  return u;
}

function requireUsuario(req, res, next) {
  carregarUsuario(req).then((u) => {
    if (!u) return res.status(401).json({ erro: 'Faça login para continuar.' });
    req.usuario = u;
    next();
  }).catch(next);
}

/** Rota que não exige login, mas se aproveita dele quando existe. */
function usuarioOpcional(req, res, next) {
  carregarUsuario(req).then((u) => { req.usuario = u || null; next(); }).catch(() => { req.usuario = null; next(); });
}

/**
 * Ações capazes de esvaziar ou entregar o acervo exigem MFA de quem
 * administra a família. Não bloqueamos o cadastro (seria atrito onde não
 * há nada a proteger ainda) — bloqueamos o momento em que passa a haver.
 */
function exigirMFAparaAdmin(req, res, next) {
  const administra = ['OWNER', 'ADMIN'].includes(req.papel);
  const ligado = String(process.env.ORIGENA_MFA_ADMIN || 'on').toLowerCase() !== 'off';
  if (!administra || !ligado || !mfaDisponivel()) return next();
  if (req.usuario && req.usuario.mfa_ativo) return next();
  return res.status(428).json({
    erro: 'Ative a verificação em duas etapas para fazer isto.',
    acao: 'ativar_mfa', porque: 'Esta ação pode expor ou transferir o acervo da família.',
  });
}

// ------------------------------------------------------- throttle de login
const JANELA_MIN = 15;
const MAX_FALHAS = 8;

async function bloqueado(chave) {
  const r = await db.uma(
    `SELECT count(*)::int n FROM login_falhas
      WHERE chave = $1 AND created_at > now() - ($2 || ' minutes')::interval`,
    [chave, String(JANELA_MIN)]);
  return r.n >= MAX_FALHAS;
}
const registrarFalha = (chave) => db.q('INSERT INTO login_falhas (chave) VALUES ($1)', [chave]);
const limparFalhas = (chave) => db.q('DELETE FROM login_falhas WHERE chave = $1', [chave]);

module.exports = {
  COOKIE, configurar,
  hashSenha, conferirSenha, senhaFraca,
  cifrar, decifrar, mfaDisponivel,
  gerarSegredoTOTP, codigoTOTP, conferirTOTP, urlOtpauth, gerarCodigosBackup,
  emitir, encerrar, carregarUsuario, requireUsuario, usuarioOpcional, exigirMFAparaAdmin,
  bloqueado, registrarFalha, limparFalhas,
};
