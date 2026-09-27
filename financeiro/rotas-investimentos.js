// Rotas privadas da fundação de investimentos. Somente leitura nesta fase.
'use strict';
const investimentos = require('./investimentos-acesso');
const fontes = require('./investimentos-fontes');
const evidencias = require('./investimentos-evidencias');

function registrarRotasInvestimentos(app, rota) {
  if (!app || !rota) throw new Error('rotas-investimentos: faltam app/rota.');

  app.get('/finance/api/investimentos/resumo', ...rota((req) =>
    investimentos.resumo(req.tenant, req.assinante),
  { permissao: 'ler' }));

  app.get('/finance/api/investimentos/mandatos', ...rota((req) => ({
    mandatos: investimentos.mandatos(req.tenant, req.assinante),
  }), { permissao: 'ler' }));

  app.get('/finance/api/investimentos/fontes', ...rota((req) => ({
    fontes: investimentos.fontes(req.tenant, req.assinante),
  }), { permissao: 'ler' }));

  app.get('/finance/api/investimentos/cobertura', ...rota((req) => ({
    cobertura: investimentos.cobertura(req.tenant, req.assinante),
  }), { permissao: 'ler' }));

  app.post('/finance/api/investimentos/fontes/:chave/sondar', ...rota(async (req) => ({
    resultado: await fontes.sondar(req.tenant, req.assinante, req.params.chave),
  }), { permissao: 'configurar' }));

  app.post('/finance/api/investimentos/fontes/:chave/coletar-evidencias', ...rota(async (req) => ({
    resultado: await fontes.coletarEvidencias(req.tenant, req.assinante, req.params.chave),
  }), { permissao: 'configurar' }));

  app.get('/finance/api/investimentos/evidencias', ...rota((req) => ({
    evidencias: evidencias.listar(req.tenant, req.assinante),
  }), { permissao: 'ler' }));
}

module.exports = { registrarRotasInvestimentos };
