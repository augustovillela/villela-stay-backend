// =====================================================================
// Villela CRM — rotas da tela "Conversas" (painel do assinante, /crm/api/app/conversas*).
// Mesmo gate do módulo `contatos` (não cria módulo novo de plano).
// =====================================================================
'use strict';
const Conversas = require('./conversas');

function registrarRotasConversas(server, { G, GE, h, tid, quem }) {
  server.get('/crm/api/app/conversas', ...G('contatos'), h((req, res) => res.json({ conversas: Conversas.listar(tid(req), req.query) })));
  server.get('/crm/api/app/conversas/resumo', ...G('contatos'), h((req, res) => res.json({ assuntos: Conversas.resumo(tid(req)) })));
  server.post('/crm/api/app/conversas/:id/decidir', ...GE('contatos', 'editar'), h((req, res) => res.json(Conversas.decidir(tid(req), req.params.id, (req.body || {}).acao, quem(req)))));
}

module.exports = { registrarRotasConversas };
