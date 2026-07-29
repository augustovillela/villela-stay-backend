// =====================================================================
// Livraria Villela — montagem do módulo no app Express do server.js
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./livraria').montar(app, {
//     express, requireAuth, requireAdmin, lerUsuarios, salvarUsuarios,
//     enviarEmail, enviarWhatsApp, alertaAugusto, mpFetch,
//   });
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const downloads = require('./downloads');
const storefront = require('./storefront');
const legais = require('./paginas-legais');
const atualizacoes = require('./paginas-atualizacoes');
const { criarPagamentos } = require('./pagamentos');
const { criarEventos } = require('./eventos');
const emails = require('./emails');
const { criarFluxo } = require('./fluxo');
const { registrarRotasPublicas } = require('./rotas-publicas');
const { registrarRotasStaff } = require('./rotas-staff');

function montar(app, injected = {}) {
  const {
    express, requireAuth, requireAdmin, lerUsuarios, salvarUsuarios,
    enviarEmail = async () => false, enviarWhatsApp = async () => false, alertaAugusto = async () => {}, mpFetch,
  } = injected;
  if (!express || !requireAuth) throw new Error('livraria.montar: faltam deps (express, requireAuth).');

  // Escrita por agentes (mesmo padrão do Legal e da config do portal): a PUBLISH_KEY no header
  // x-publish-key vale como sessão admin, auditada como "Agente (PUBLISH_KEY)". Comparação em
  // tempo constante. Sem a chave (ou sem env), cai no requireAuth normal do portal.
  const chaveOk = (key) => {
    const esperada = process.env.PUBLISH_KEY || '';
    if (!esperada || !key) return false;
    const a = Buffer.from(String(key)), b = Buffer.from(esperada);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const authComChave = (req, res, next) => {
    if (chaveOk(req.headers['x-publish-key'])) {
      req.user = { id: 'agente-publish-key', nome: 'Agente (PUBLISH_KEY)', papel: 'admin', ativo: true };
      return next();
    }
    return requireAuth(req, res, next);
  };

  const SITE = storefront.SITE;
  const primeiroSlug = (order) => {
    const it = (order.itens || [])[0]; if (!it) return '';
    const b = repo.Books.obter(it.book_id); return b ? b.slug : '';
    };
  const urls = {
    download: (t) => `${SITE}/download/${t}`,
    biblioteca: (id) => `${SITE}/minha-biblioteca?p=${id}`,
    obrigado: (id) => `${SITE}/obrigado?p=${id}`,
    webhook: () => `${SITE}/livraria/webhooks/mercadopago`,
    checkoutRetry: (order) => { const s = primeiroSlug(order); return s ? `${SITE}/checkout?livro=${s}` : `${SITE}/livros`; },
  };

  const pagamentos = criarPagamentos({ mpFetch });
  const eventos = criarEventos({ repo });
  const fluxo = criarFluxo({ repo, eventos, emails, enviarEmail, enviarWhatsApp, alertaAugusto, urls });

  const deps = {
    repo, pagamentos, eventos, emails, fluxo, downloads, storefront, legais, atualizacoes, urls,
    express, requireAuth: authComChave, requireAdmin, lerUsuarios, salvarUsuarios, enviarEmail, enviarWhatsApp, alertaAugusto,
  };

  registrarRotasPublicas(app, deps);
  registrarRotasStaff(app, deps);
  console.log('[livraria] módulo montado (loja pública + Portal Staff). Loja:', SITE);
  return { repo, fluxo, pagamentos };
}

module.exports = { montar, repo };
