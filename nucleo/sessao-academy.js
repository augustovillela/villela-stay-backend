// =====================================================================
// SESSÃO DA ACADEMIA — extraída do academy/rotas-cliente.js (ADR-0001).
//
// POR QUE ISTO EXISTE
//   A Musique (15º produto) reusa a CONTA da Academia em vez de criar a
//   15ª base de usuários. Sem isto, o mesmo professor teria dois logins
//   — um para vender o curso, outro para usar a biblioteca — e a
//   promessa do produto ("comece como aluno e evolua sem migrar")
//   nasceria quebrada.
//
// O QUE ESTE MÓDULO É E O QUE NÃO É
//   É o verificador de sessão e o emissor do cookie. NÃO conhece banco:
//   quem sabe buscar usuário e conferir revogação é injetado por quem
//   monta (`buscarUsuario`, `sessaoValida`). Assim a Academia continua
//   dona dos dados dela, e a Musique só consome identidade.
//
// A MUDANÇA DE ESCOPO DO COOKIE, E POR QUE ELA É SEGURA
//   O cookie nasceu com `path=/academy`, então /music nunca o receberia.
//   O escopo passa a ser `/`. Cookie é identificado por (nome, domínio,
//   PATH): emitir no path novo sem apagar o antigo deixa DOIS cookies
//   `academy_sess`, e o navegador manda os dois — com o mais específico
//   primeiro. Seria uma sessão fantasma difícil de diagnosticar.
//   Por isso `emitir()` sempre limpa o path antigo, e `requireUsuario`
//   faz o upgrade silencioso de quem já estava logado: mesmo `jti`,
//   mesma sessão, sem ninguém precisar entrar de novo.
//
//   ⚠️ A suíte da Academia NÃO enxerga esta mudança: o cookie jar dela
//   ignora `path`. Quem prova isto é o selftest da Musique, que confere
//   o atributo do Set-Cookie. Suíte verde aqui não é prova — foi de
//   propósito que o teste foi escrito do outro lado.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');

const COOKIE = 'academy_sess';
const PATH = '/';                 // escopo novo: serve /academy e /music
const PATH_ANTIGO = '/academy';   // escopo original, mantido só para limpeza
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

const seguroPadrao = () => process.env.NODE_ENV !== 'development';

const opcoes = (seguro = seguroPadrao()) => ({
  httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: MAX_AGE_MS, path: PATH,
});

/** Emite o cookie no escopo novo e apaga o do escopo antigo. Sempre os
 *  dois — emitir sem limpar é o que criaria a sessão fantasma. */
function emitir(res, token, seguro = seguroPadrao()) {
  res.clearCookie(COOKIE, { path: PATH_ANTIGO });
  res.cookie(COOKIE, token, opcoes(seguro));
}

/** Limpa nos dois escopos: quem faz logout tem de sair de verdade,
 *  inclusive se ainda carregava o cookie antigo. */
function limpar(res) {
  res.clearCookie(COOKIE, { path: PATH });
  res.clearCookie(COOKIE, { path: PATH_ANTIGO });
}

const assinar = (uid, jti, jwtSecret) => jwt.sign({ uid, jti }, jwtSecret, { expiresIn: '30d' });

/**
 * Cria o verificador de sessão.
 *
 * @param jwtSecret     segredo de assinatura (o mesmo do resto da casa)
 * @param buscarUsuario (uid) => usuário | null   — injetado pela Academia
 * @param sessaoValida  (jti) => boolean          — revogação (logout, troca de senha, suspensão)
 * @param exigirAtivo   conta precisa estar 'ativo' (padrão: sim)
 */
function criarVerificador({ jwtSecret, buscarUsuario, sessaoValida, exigirAtivo = true }) {
  if (!jwtSecret || typeof buscarUsuario !== 'function' || typeof sessaoValida !== 'function') {
    throw new Error('sessao-academy: faltam deps (jwtSecret, buscarUsuario, sessaoValida).');
  }

  /** Resolve a sessão sem responder nada. Devolve null quando não há
   *  sessão utilizável — cabe ao chamador decidir o que fazer. */
  function resolver(req) {
    try {
      const bruto = req.cookies && req.cookies[COOKIE];
      if (!bruto) return null;
      const { uid, jti } = jwt.verify(bruto, jwtSecret);
      if (!sessaoValida(jti)) return null;
      const u = buscarUsuario(uid);
      if (!u) return null;
      if (exigirAtivo && u.status !== 'ativo') return null;
      return { usuario: u, jti, token: bruto };
    } catch (_) { return null; }
  }

  /** Middleware. Faz o upgrade silencioso do cookie de escopo antigo:
   *  quem já estava logado continua logado, com o mesmo `jti`. */
  function requireUsuario(req, res, next) {
    const s = resolver(req);
    if (!s) return res.status(401).json({ erro: 'não autenticado' });
    req.usuario = s.usuario;
    req.jti = s.jti;
    if (!req._sessaoReemitida) { req._sessaoReemitida = true; emitir(res, s.token); }
    next();
  }

  /** Versão que não bloqueia: usa a sessão se houver, segue se não. */
  function comSessaoOpcional(req, res, next) {
    const s = resolver(req);
    if (s) { req.usuario = s.usuario; req.jti = s.jti; }
    next();
  }

  return { resolver, requireUsuario, comSessaoOpcional };
}

module.exports = {
  COOKIE, PATH, PATH_ANTIGO, MAX_AGE_MS,
  opcoes, emitir, limpar, assinar, criarVerificador,
};
