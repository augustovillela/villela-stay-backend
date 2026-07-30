// =====================================================================
// Villela Legal Intelligence — montagem do módulo no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./legal').montar(app, {
//     express, requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios,
//   });
// Fase 1 (fundação): identidade/permissões, clientes, processos,
// andamentos, publicações, prazos, tarefas, documentos, registro de IA,
// financeiro jurídico, auditoria e integrações. Sem coleta automática
// nem geração por IA ainda (Fases 2+ — ver README.md).
// =====================================================================
'use strict';
const dbmod = require('./db');
const repo = require('./repo');
const permissoes = require('./permissoes');
const feriados = require('./feriados');
const llm = require('./llm');
const ia = require('./ia');
const pecas = require('./pecas');
const contratos = require('./contratos');
const notif = require('./notificacoes');
const portalCliente = require('./portal-cliente');
const relatorios = require('./relatorios');
const coleta = require('./coleta');
const { semearIA } = require('./prompts-seed');
const { semearLivro } = require('./livro/seeds');
const { registrarRotasStaff } = require('./rotas-staff');

function montar(app, injected = {}) {
  const {
    express, requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios,
    enviarEmail, enviarWhatsApp, alertaAugusto, jwtSecret,
  } = injected;
  if (!express || !requireAuth || !requirePublishOrSession || !lerUsuarios) {
    throw new Error('legal.montar: faltam deps (express, requireAuth, requirePublishOrSession, lerUsuarios).');
  }
  // Isolamento por tenant (caminho B): cada escritório tem seu próprio banco.
  // Os seeds abaixo rodam POR BANCO na 1ª abertura (inicializador), dentro do
  // contexto do tenant — assim todo escritório novo nasce com perfis, FTS,
  // agentes/prompts de IA, modelos de contrato e feriados forenses.
  dbmod.registrarInicializador(() => {
    permissoes.semearPerfis();     // roles + matriz de permissões
    ia.garantirFTS();              // índice FTS5 (rag_index) do banco do tenant
    semearIA();                    // agentes especialistas + biblioteca de prompts
    contratos.semearTemplates();   // modelos de contrato + cláusulas (Módulo 13)
    feriados.semearFeriados();     // feriados forenses + suspensão art. 220 CPC
    semearLivro();                 // ONDA LIVRO: política de IA, cartas de agentes, POPs,
                                   // temporalidade, cláusulas em 3 níveis e planos de
                                   // continuidade — tudo como RASCUNHO a aprovar.
  });
  dbmod.garantirTenant(dbmod.TENANT_PADRAO); // aquece + semeia o escritório interno (Augusto)
  notif.configurar({ enviarEmail, enviarWhatsApp, alertaAugusto }); // canais reais do server.js
  registrarRotasStaff(app, {
    repo, permissoes, feriados, ia, llm, pecas, contratos, portalCliente, notif, relatorios, coleta, jwtSecret,
    requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios,
  });
  if (jwtSecret) portalCliente.registrarPortalCliente(app, { jwtSecret });
  else console.warn('[legal] jwtSecret ausente — Portal do Cliente NÃO montado.');
  coleta.iniciarRotinas(); // rotina diária server-side (LEGAL_ROTINAS=off desliga)
  console.log(`[legal] Villela Legal Intelligence montado (Fases 1-7). IA: ${llm.ativo() ? 'direto (' + llm.MODELOS[0] + ')' : 'fila (agente local)'} · RAG: ${ia.ftsOK ? 'FTS5 ok' : 'indisponível'}`);
  return { repo, permissoes, feriados, ia, llm, pecas, contratos, notif, portalCliente, relatorios, coleta };
}

// =====================================================================
// PONTE DE ACESSO DO ASSINANTE (Legal SaaS → núcleo jurídico)
// Remonta TODAS as rotas do núcleo sob /juridico/api/legal para o assinante
// logado no /juridico/app (sessão jur_saas), sem duplicar código: um "app
// proxy" reescreve o prefixo /staff/api/legal → /juridico/api/legal e injeta
// auth+tenant+entitlements do assinante. Assim o cookie jur_saas (path
// /juridico) é enviado pelo navegador e o núcleo roda no BANCO do escritório.
//
// injected:
//  - express (obrigatório)
//  - jwtSecret (p/ tokens do portal do cliente-do-assinante)
//  - assinanteDeReq(req) -> null | {
//       uid, tenantSlug, tenantId, papel, nome, email,
//       acessoLiberado: bool, podeModulo: (modulo)=>bool }
//    (montado no server.js usando o cookie jur_saas + repo do legal-saas)
// =====================================================================
const PREFIXO_ASSINANTE = '/juridico/api/legal';
const BASE_STAFF = '/staff/api/legal';
// 1º segmento do caminho → módulo do produto (entitlements). Segmentos sem
// módulo (clientes, financeiro, equipe, dashboard, auditoria...) são baseline.
const SEGMENTO_MODULO = {
  processos: 'processos', andamentos: 'processos', publicacoes: 'publicacoes',
  prazos: 'prazos', audiencias: 'audiencias', tarefas: 'tarefas', documentos: 'documentos',
  ia: 'ia', pecas: 'pecas', contratos: 'contratos', relatorios: 'relatorios',
  // ---- ONDA LIVRO (Cap. 47 + Parte VIII) ----
  crm: 'crm',                                     // 47.1
  pesquisa: 'pesquisa',                           // 47.7 + 47.8
  estrategia: 'estrategia', matrizes: 'estrategia',// Cap. 23/24/5.6/21
  'contratos-ciclo': 'contratos', clausulas: 'contratos', // 47.9 (mesmo módulo comercial)
  fin: 'financeiro',                              // 47.10
  interno: 'portal_interno', agentes: 'portal_interno',   // 47.3 + 47.12
  compliance: 'compliance', lgpd: 'compliance', crises: 'compliance', // Parte VIII
  conteudo: 'conteudo', 'conteudo-perguntas': 'conteudo', // Cap. 13/14
  controladoria: 'controladoria',                 // 47.11
  portal: 'portal_cliente',                       // 47.2 (traduções/pendências/NPS)
  'prazos-escalonamento': 'prazos',               // 47.4
  'documentos-fila': 'documentos',                // 47.6
};

function montarAssinante(app, injected = {}) {
  const { express, assinanteDeReq, jwtSecret } = injected;
  if (!express || typeof assinanteDeReq !== 'function') {
    throw new Error('legal.montarAssinante: faltam deps (express, assinanteDeReq).');
  }

  // adapta a sessão do assinante ao formato que o núcleo espera (req.user + tenant)
  function requireAssinanteLegal(req, res, next) {
    let a; try { a = assinanteDeReq(req); } catch (_) { a = null; }
    if (!a) return res.status(401).json({ erro: 'não autenticado' });
    if (!a.acessoLiberado) return res.status(403).json({ erro: 'Assinatura inativa (trial vencido, inadimplente ou suspensa). Regularize no painel para acessar.' });
    req.tenantLegal = a.tenantSlug;      // resolverTenant do núcleo escopa o banco do escritório
    req.assinanteLegal = a;
    // usuário sintético: admin do escritório = super_admin do próprio workspace; demais = leitura
    req.user = { id: 'assinante:' + a.uid, nome: a.nome || a.email, email: a.email, papel: a.papel === 'admin' ? 'admin' : 'membro', areas: ['juridico'] };
    next();
  }

  // bloqueia módulo fora do plano do escritório
  function gateModulo(req, res, next) {
    const p = String(req.originalUrl || '').split('?')[0];
    const resto = p.startsWith(PREFIXO_ASSINANTE) ? p.slice(PREFIXO_ASSINANTE.length) : p;
    const seg = resto.replace(/^\/+/, '').split('/')[0];
    const mod = SEGMENTO_MODULO[seg];
    if (mod && req.assinanteLegal && !req.assinanteLegal.podeModulo(mod)) {
      return res.status(403).json({ erro: `O módulo "${mod}" não está incluído no seu plano.` });
    }
    next();
  }

  // guardas ANTES das rotas (rodam antes do tenantMw e dos handlers do núcleo)
  app.use(PREFIXO_ASSINANTE, requireAssinanteLegal, gateModulo);

  // app proxy: reescreve o prefixo; os handlers são os MESMOS do núcleo
  const proxyApp = {};
  for (const m of ['get', 'post', 'patch', 'put', 'delete', 'use']) {
    proxyApp[m] = (caminho, ...handlers) => {
      const novo = typeof caminho === 'string' ? caminho.replace(BASE_STAFF, PREFIXO_ASSINANTE) : caminho;
      return app[m](novo, ...handlers);
    };
  }

  // registra as 106 rotas do núcleo sob o novo prefixo, com deps do assinante.
  // auth por-rota é no-op: a autenticação já foi feita pelo app.use acima.
  const passa = (req, res, n) => n();
  registrarRotasStaff(proxyApp, {
    repo, permissoes, feriados, ia, llm, pecas, contratos, portalCliente, notif, relatorios, coleta, jwtSecret,
    requireAuth: passa, requireAdmin: passa, requirePublishOrSession: passa,
    lerUsuarios: () => [], // gestão de equipe do escritório fica no painel do assinante (fora desta ponte)
  });

  console.log(`[legal] Ponte do assinante montada em ${PREFIXO_ASSINANTE}/* (sessão jur_saas → banco do escritório, gating por plano).`);
  return { PREFIXO: PREFIXO_ASSINANTE };
}

module.exports = { montar, montarAssinante, repo, permissoes, feriados, ia, llm, pecas, contratos, notif, portalCliente, relatorios, coleta };
