'use strict';
const Catalogo = require('./catalogo');

function montar(app, { requireUsuario } = {}) {
  if (typeof requireUsuario !== 'function') throw new Error('Catálogo precisa da sessão do Musique.');
  const B = '/music/api/tocar';
  // Montável isoladamente nos testes; a autorização continua sendo a do módulo.
  app.use([B + '/catalogo', B + '/gestao'], (req, res, next) => {
    res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); next();
  }, requireUsuario);
  const h = (fn) => (req, res, next) => {
    try { fn(req, res); }
    catch (e) {
      if (e.status && e.status < 500) return res.status(e.status).json({ erro: e.message, ...(e.revision ? { revision: e.revision } : {}) });
      if (e.status === 503) return res.status(503).json({ erro: e.message });
      next(e);
    }
  };
  const json = (req, res, next) => req.is('application/json') ? next() : res.status(415).json({ erro: 'Envie o arranjo como JSON.' });
  app.get(B + '/catalogo', h((req, res) => res.json(Catalogo.listar(req.usuario.id, req.query))));
  app.get(B + '/catalogo/:id', h((req, res) => res.json(Catalogo.obter(req.usuario.id, req.params.id))));
  app.get(B + '/catalogo/:id/versoes/:versionId', h((req, res) => res.json(Catalogo.obter(req.usuario.id, req.params.id, req.params.versionId))));
  app.get(B + '/catalogo/:id/versoes/:versionId/audio', h((req, res) => res.json(Catalogo.audio(req.usuario.id, req.params.id, req.params.versionId))));
  app.get(B + '/gestao/obras', h((req, res) => res.json(Catalogo.listarObras(req.usuario.id, req.query))));
  app.get(B + '/gestao/obras/:id', h((req, res) => res.json({ obra: Catalogo.obterObra(req.usuario.id, req.params.id) })));
  app.get(B + '/gestao/obras/:id/midias', h((req, res) => res.json(Catalogo.listarMidias(req.usuario.id, req.params.id, req.query))));
  app.get(B + '/gestao/arranjos', h((req, res) => res.json(Catalogo.listar(req.usuario.id, req.query, true))));
  app.get(B + '/gestao/arranjos/:id', h((req, res) => res.json({ arranjo: Catalogo.obterGestao(req.usuario.id, req.params.id) })));
  app.get(B + '/gestao/arranjos/:id/audio', h((req, res) => {
    const valor = req.query.revision;
    const revision = typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : NaN;
    res.json(Catalogo.audioGestao(req.usuario.id, req.params.id, revision));
  }));
  app.post(B + '/gestao/arranjos', json, h((req, res) => res.status(201).json({ arranjo: Catalogo.criar(req.usuario.id, req.body) })));
  app.put(B + '/gestao/arranjos/:id', json, h((req, res) => res.json({ arranjo: Catalogo.salvar(req.usuario.id, req.params.id, req.body) })));
  app.post(B + '/gestao/arranjos/:id/publicar', json, h((req, res) => res.json({ arranjo: Catalogo.publicar(req.usuario.id, req.params.id, req.body) })));
  app.post(B + '/gestao/arranjos/:id/retirar', json, h((req, res) => res.json({ arranjo: Catalogo.retirar(req.usuario.id, req.params.id, req.body) })));
}

module.exports = { montar };
