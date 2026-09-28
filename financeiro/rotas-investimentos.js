// Rotas privadas da fundação de investimentos. Somente leitura nesta fase.
'use strict';
const investimentos = require('./investimentos-acesso');
const fontes = require('./investimentos-fontes');
const evidencias = require('./investimentos-evidencias');
const ingestao = require('./investimentos-ingestao');
const relatorios = require('./investimentos-relatorios');

function registrarRotasInvestimentos(app, rota) {
  if (!app || !rota) throw new Error('rotas-investimentos: faltam app/rota.');

  // O proprietário pode liberar SOMENTE o próprio acesso. O identificador
  // vem da sessão, nunca do corpo: assim esta rota não vira um atalho para
  // conceder o módulo a terceiros. `conceder` ainda exige conta interna,
  // Enterprise, perfil proprietário e um TOTP válido nesta mesma chamada.
  app.post('/finance/api/investimentos/acesso-proprio', ...rota((req) => ({
    ok: true,
    acesso: investimentos.conceder(
      req.tenant,
      req.assinante.id,
      'Liberação nominal solicitada pelo próprio CEO no Villela Finance',
    ),
  }), { permissao: 'administrar', json: true }));

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

  app.get('/finance/api/investimentos/ingestao', ...rota((req) => ({
    ingestao: ingestao.estado(req.tenant, req.assinante),
  }), { permissao: 'ler' }));

  app.post('/finance/api/investimentos/ingestao/inventariar', ...rota(async (req) => ({
    cargas: await ingestao.inventariar(req.tenant, req.assinante, {
      conjuntos: req.body && req.body.conjuntos,
    }),
  }), { permissao: 'configurar' }));

  app.get('/finance/api/investimentos/relatorios/estado', ...rota((req) =>
    relatorios.estado(req.tenant, req.assinante), { permissao: 'ler' }));

  app.get('/finance/api/investimentos/relatorios', ...rota((req) => ({
    relatorios: relatorios.listar(req.tenant, req.assinante, req.query.limite),
  }), { permissao: 'ler' }));

  app.get('/finance/api/investimentos/relatorios/:id', ...rota((req) =>
    relatorios.obter(req.tenant, req.assinante, req.params.id), { permissao: 'ler' }));

  app.post('/finance/api/investimentos/relatorios/ativar', ...rota((req) => ({
    configuracao: relatorios.ativar(req.tenant, req.assinante, req.body || {}),
  }), { permissao: 'configurar', json: true }));

  app.post('/finance/api/investimentos/relatorios/gerar', ...rota(async (req) => ({
    relatorio: await relatorios.gerar(req.tenant, req.assinante),
  }), { permissao: 'configurar', json: true }));

  app.get('/finance/api/investimentos/carteira', ...rota((req) => ({
    posicoes: relatorios.listarPosicoes(req.tenant, req.assinante),
  }), { permissao: 'ler' }));

  app.post('/finance/api/investimentos/carteira', ...rota((req) => ({
    posicao: relatorios.salvarPosicao(req.tenant, req.assinante, req.body || {}),
  }), { permissao: 'configurar', json: true }));

  app.post('/finance/api/investimentos/carteira/:id/desativar', ...rota((req) =>
    relatorios.desativarPosicao(req.tenant, req.assinante, req.params.id),
  { permissao: 'configurar', json: true }));
}

module.exports = { registrarRotasInvestimentos };
