// =====================================================================
// Musique — sessão. Desde a ADR-0011 (28/09/2026) a conta é DO MUSIQUE
// (`contas.js`, cookie `musique_sess`); a sessão da Academia não abre
// nada aqui. Este arquivo recebe o verificador pronto e o adapta ao
// domínio musical: resolve a identidade e garante a PROJEÇÃO musical.
//
// ⚠️ É uma FÁBRICA, não um singleton com estado de módulo. Estado global
// aqui faria duas montagens no mesmo processo compartilharem a mesma
// sessão — e esconderia o caminho "montei sem conta configurada" do
// teste que existe para verificá-lo.
//
// Quem não tem sessão não vê erro críptico: recebe 401 com o caminho de
// entrada, que é a tela de entrada do PRÓPRIO Musique.
// =====================================================================
'use strict';
const repo = require('./repo');

const ENTRAR = '/music/entrar';

/** Cria a camada de sessão desta montagem. `verificador` pode ser nulo:
 *  nesse caso a landing continua de pé e a API do usuário responde 503
 *  dizendo o que falta — módulo que exige tudo para subir é módulo que
 *  derruba o grupo quando falta uma env. */
function criar(verificador) {
  const configurado = () => !!(verificador && typeof verificador.resolver === 'function');

  function requireUsuario(req, res, next) {
    if (!configurado()) {
      return res.status(503).json({
        erro: 'Sessão indisponível: a Musique foi montada sem o verificador de contas.',
      });
    }
    const s = verificador.resolver(req);
    if (!s) return res.status(401).json({ erro: 'Entre com a sua conta para usar a Musique.', entrar: ENTRAR });
    req.usuario = s.usuario;                 // conta do Musique: { id, nome, email, status }
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
