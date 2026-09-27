// Rotas privadas da fundação de investimentos. Somente leitura nesta fase.
'use strict';
const investimentos = require('./investimentos-acesso');
const fontes = require('./investimentos-fontes');

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
}

module.exports = { registrarRotasInvestimentos };
