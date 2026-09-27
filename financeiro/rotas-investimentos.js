// Rotas privadas da fundação de investimentos. Somente leitura nesta fase.
'use strict';
const investimentos = require('./investimentos-acesso');

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
}

module.exports = { registrarRotasInvestimentos };
