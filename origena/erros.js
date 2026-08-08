// =====================================================================
// ORIGENA — erros de aplicação e tratamento central (§117, §118).
//
// Erro nascido no fundo do domínio não sabe o idioma de quem pediu — e
// não deveria saber. Ele carrega uma CHAVE; a tradução acontece na
// fronteira HTTP, onde o idioma já foi resolvido.
//
// Nada de "500 Internal Server Error" na cara do usuário: falha não
// prevista vira mensagem útil, e o detalhe técnico vai só para o log.
// =====================================================================
'use strict';
const i18n = require('./i18n');

class ErroApp extends Error {
  constructor(chave, status = 400, vars = null) {
    super(chave);              // a mensagem crua é a chave — útil no log
    this.name = 'ErroApp';
    this.chave = chave;
    this.status = status;
    this.vars = vars;
  }
}

const erro = (chave, status = 400, vars = null) => new ErroApp(chave, status, vars);

/** Atalhos para os casos mais comuns. */
const naoEncontrado = (chave = 'erro.familia_nao_encontrada') => erro(chave, 404);
const semPermissao = (chave = 'erro.sem_permissao') => erro(chave, 403);
const semSessao = () => erro('erro.faca_login', 401);

/**
 * Tratador central. Registrar por ÚLTIMO, depois de todas as rotas da
 * Origena, e restrito ao prefixo /origena para não sequestrar o
 * tratamento de erro dos outros 11 produtos do mesmo processo.
 */
function tratador(err, req, res, next) {
  if (res.headersSent) return next(err);
  const idioma = (req && req.idioma) || i18n.PADRAO;

  if (err instanceof ErroApp) {
    return res.status(err.status).json({
      erro: i18n.t(idioma, err.chave, err.vars),
      codigo: err.chave,
    });
  }

  // Violações do banco que são regra de negócio, não bug: a trava do
  // último OWNER chega aqui como check_violation.
  if (err && err.code === '23514' && /responsável/i.test(err.message || '')) {
    return res.status(409).json({ erro: i18n.t(idioma, 'erro.familia_sem_dono'), codigo: 'erro.familia_sem_dono' });
  }
  if (err && err.code === '23505') {
    return res.status(409).json({ erro: i18n.t(idioma, 'erro.ja_existe'), codigo: 'erro.ja_existe' });
  }

  // Daqui para baixo é falha nossa. O usuário recebe uma frase; o log
  // recebe o rastro — nunca o contrário.
  console.error('[origena] erro não tratado em', req && req.method, req && req.originalUrl, '→', err);
  return res.status(500).json({ erro: i18n.t(idioma, 'erro.generico'), codigo: 'erro.generico' });
}

module.exports = { ErroApp, erro, naoEncontrado, semPermissao, semSessao, tratador };
