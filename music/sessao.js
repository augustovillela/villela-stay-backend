// =====================================================================
// Musique — sessão (ADR-0001). NÃO existe login aqui.
//
// A conta é a da Academia. Este arquivo recebe o verificador pronto
// (montado em `nucleo/sessao-academy.js`, com as funções de leitura da
// Academia injetadas por quem monta) e o adapta ao domínio musical:
// resolve a identidade e garante a PROJEÇÃO musical do usuário.
//
// ⚠️ É uma FÁBRICA, não um singleton com estado de módulo. Estado global
// aqui faria duas montagens no mesmo processo compartilharem a mesma
// sessão — o que em produção não acontece (há uma montagem só), mas
// esconde o caminho "montei sem conta configurada" justamente do teste
// que existe para verificá-lo.
//
// Quem não tem conta não vê erro críptico: recebe 401 com o caminho de
// entrada, que é a tela de login da Academia.
// =====================================================================
'use strict';
const repo = require('./repo');

const ENTRAR = '/academy/app';

/** Cria a camada de sessão desta montagem. `verificador` pode ser nulo:
 *  nesse caso a landing continua de pé e a API do usuário responde 503
 *  dizendo o que falta — módulo que exige tudo para subir é módulo que
 *  derruba o grupo quando falta uma env. */
function criar(verificador) {
  const configurado = () => !!(verificador && typeof verificador.resolver === 'function');

  function requireUsuario(req, res, next) {
    if (!configurado()) {
      return res.status(503).json({
        erro: 'Sessão indisponível: a Musique não foi montada com a conta da Academia.',
      });
    }
    const s = verificador.resolver(req);
    if (!s) return res.status(401).json({ erro: 'Entre com a sua conta para usar a Musique.', entrar: ENTRAR });
    req.usuario = s.usuario;                 // usuário da Academia (fonte da verdade)
    req.jti = s.jti;
    req.perfil = repo.Usuarios.garantir(s.usuario.id, { apelido: s.usuario.nome || '' });
    next();
  }

  /** Usa a sessão se houver, segue se não — para páginas públicas que
   *  mudam de cara quando a pessoa está logada. */
  function opcional(req, res, next) {
    const s = configurado() && verificador.resolver(req);
    if (s) { req.usuario = s.usuario; req.jti = s.jti; req.perfil = repo.Usuarios.garantir(s.usuario.id); }
    next();
  }

  return { requireUsuario, opcional, configurado, ENTRAR };
}

module.exports = { criar, ENTRAR };
