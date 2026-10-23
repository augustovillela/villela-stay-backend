// =====================================================================
// ATRIBUIÇÃO DO ALUNO — quem é o aluno logado nas visitas dos sites.
//
// POR QUE ISTO EXISTE
//   As visitas do grupo (nucleo/visitas.js) são anônimas de propósito.
//   O Augusto pediu para saber, do ALUNO DA ACADEMY (só de quem tem conta
//   e entrou), quantas vezes ele visitou os sites — Academy, Livraria,
//   sistemas — e quanto tempo passou nas aulas. Visitante sem conta segue
//   anônimo, com o identificador de sal diário de sempre.
//
// O QUE O COOKIE É E O QUE NÃO É
//   `vs_aluno` carrega só `uid.assinatura` (HMAC). NÃO é sessão: não abre
//   conta nenhuma, não vale como login, não passa por requireUsuario.
//   Serve apenas para o middleware de visitas pôr o `uid` na linha.
//   Por isso ele pode valer em todo *.villelastay.com.br (Domain=), coisa
//   que o `academy_sess` NUNCA deve fazer: a sessão continua host-only.
//
//   A assinatura impede que alguém forje visita no nome de outro aluno
//   escrevendo o cookie à mão. Assinatura inválida = visita anônima.
// =====================================================================
'use strict';
const crypto = require('crypto');

const COOKIE = 'vs_aluno';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;   // mesmo prazo da sessão
const RE_UID = /^[A-Za-z0-9_-]{1,64}$/;

// Chave derivada do JWT_SECRET (com rótulo próprio, para uma assinatura
// daqui nunca valer em outro lugar). Sem JWT_SECRET o servidor já usa um
// segredo efêmero; aqui também — o pior caso é a atribuição cair no
// reinício, nunca a visita ser atribuída a outra pessoa.
const EFEMERO = crypto.randomBytes(32).toString('hex');
const chave = () => crypto.createHash('sha256')
  .update('vs_aluno.v1|' + (process.env.JWT_SECRET || EFEMERO)).digest();

const assinatura = (uid) => crypto.createHmac('sha256', chave()).update(String(uid)).digest('base64url').slice(0, 27);

function valorDe(uid) {
  if (!RE_UID.test(String(uid || ''))) return '';
  return uid + '.' + assinatura(uid);
}

/** Lê e confere o cookie. Devolve o uid ou '' (ausente, malformado ou forjado). */
function verificar(valor) {
  const v = String(valor || '');
  const i = v.lastIndexOf('.');
  if (i <= 0) return '';
  const uid = v.slice(0, i), sig = v.slice(i + 1);
  if (!RE_UID.test(uid)) return '';
  const esperado = Buffer.from(assinatura(uid));
  const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length) return '';
  return crypto.timingSafeEqual(esperado, recebido) ? uid : '';
}

const ler = (req) => verificar(req && req.cookies && req.cookies[COOKIE]);

/** Domínio do cookie: a família inteira do grupo quando o host é dela;
 *  fora disso (onrender.com, localhost) fica host-only. */
function dominioDe(host) {
  const h = String(host || '').toLowerCase().split(':')[0];
  for (const base of ['villelastay.com.br', 'villelastay.com']) {
    if (h === base || h.endsWith('.' + base)) return '.' + base;
  }
  return undefined;
}

const seguroPadrao = () => process.env.NODE_ENV !== 'development';

function emitir(res, uid, seguro = seguroPadrao()) {
  const valor = valorDe(uid);
  if (!valor) return;
  const req = res.req || {};
  const domain = dominioDe(req.hostname || (req.headers && req.headers.host));
  res.cookie(COOKIE, valor, {
    httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: MAX_AGE_MS, path: '/',
    ...(domain ? { domain } : {}),
  });
}

/** Sai nos dois escopos (família e host), para logout sair de verdade. */
function limpar(res) {
  const req = res.req || {};
  const domain = dominioDe(req.hostname || (req.headers && req.headers.host));
  res.clearCookie(COOKIE, { path: '/' });
  if (domain) res.clearCookie(COOKIE, { path: '/', domain });
}

module.exports = { COOKIE, MAX_AGE_MS, valorDe, verificar, ler, dominioDe, emitir, limpar };
