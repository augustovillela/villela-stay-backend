'use strict';
const Catalogo = require('./catalogo');
const { db } = require('../db');
const Acompanhamento = require('../cifras/motor/acompanhamento');

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
  app.post(B + '/gestao/acompanhamentos-cifras', json, h((req, res) => {
    const body = req.body || {};
    const instrumento = body.instrument === undefined ? 'violao' : body.instrument;
    if (instrumento !== 'violao' && instrumento !== 'guitarra') {
      const e = new Error('O acompanhamento rítmico de cifras aceita violão ou guitarra.'); e.status = 400; throw e;
    }
    const limite = body.limit === undefined ? 500 : Number(body.limit);
    if (!Number.isSafeInteger(limite) || limite < 1 || limite > 500) {
      const e = new Error('O limite deve ser um inteiro entre 1 e 500.'); e.status = 400; throw e;
    }
    const cifras = db.prepare(`SELECT c.id, c.documento, c.obra_id, o.titulo
      FROM cifras c JOIN obras o ON o.id = c.obra_id
      WHERE o.dono = ? AND o.removido_em = '' AND c.removido_em = ''
      ORDER BY o.atualizado_em DESC, c.atualizado_em DESC, c.id LIMIT ?`).all(req.usuario.id, limite);
    const criados = [], ignorados = [], erros = [];
    for (const cifra of cifras) {
      const titulo = String(cifra.titulo || 'Cifra') + ' · acompanhamento rítmico';
      const existentes = db.prepare(`SELECT documento FROM tocar_arranjos WHERE obra_id = ?`).all(cifra.obra_id)
        .some((row) => { try { const d = JSON.parse(row.documento); return d.instrument === instrumento && d.title === titulo; } catch (_) { return false; } });
      if (existentes) { ignorados.push({ cifraId: cifra.id, obraId: cifra.obra_id, motivo: 'rascunho já existente' }); continue; }
      try {
        const doc = JSON.parse(cifra.documento);
        const chart = Acompanhamento.gerar(doc, { id: 'cifra-' + cifra.id + '-ritmo', title: titulo });
        const documento = { title: titulo, instrument: instrumento, level: 'iniciante', technique: 'troca-de-cordas',
          objective: 'Acompanhamento rítmico aproximado gerado a partir da cifra. Revise as batidas antes de publicar.',
          credits: 'Fonte: cifra do Acervo (' + cifra.id + '). Conversão automática por fundamentais em pulsos.', mediaId: '', chart };
        const criado = Catalogo.criar(req.usuario.id, { obraId: cifra.obra_id, documento });
        criados.push({ cifraId: cifra.id, obraId: cifra.obra_id, arranjoId: criado.id, titulo });
      } catch (e) { erros.push({ cifraId: cifra.id, obraId: cifra.obra_id, erro: e.message }); }
    }
    res.status(200).json({ total: cifras.length, criados, ignorados, erros, aproximado: true });
  }));
  app.put(B + '/gestao/arranjos/:id', json, h((req, res) => res.json({ arranjo: Catalogo.salvar(req.usuario.id, req.params.id, req.body) })));
  app.post(B + '/gestao/arranjos/:id/publicar', json, h((req, res) => res.json({ arranjo: Catalogo.publicar(req.usuario.id, req.params.id, req.body) })));
  app.post(B + '/gestao/arranjos/:id/retirar', json, h((req, res) => res.json({ arranjo: Catalogo.retirar(req.usuario.id, req.params.id, req.body) })));
}

module.exports = { montar };
