// =====================================================================
// Villela Kids — API autenticada do app da família (/kids/api/*).
// Toda rota de criança valida NO SERVIDOR que o perfil pertence à sessão
// do responsável (repo.Criancas.exigir) — esconder botão não é segurança.
// A trilha, o iniciar/concluir e o portfólio moram no repo; aqui só HTTP.
// =====================================================================
'use strict';
const repo = require('./repo');
const { Criancas, Missoes, Portfolio } = repo;

function registrarRotasApp(app, { requireUsuario }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));

  // ---- perfis de criança ----
  app.get('/kids/api/criancas', requireUsuario, h(async (req, res) => res.json({ criancas: Criancas.listar(req.usuario.id) })));
  app.post('/kids/api/criancas', requireUsuario, h(async (req, res) => res.json({ ok: true, crianca: Criancas.criar(req.usuario.id, req.body || {}) })));
  app.patch('/kids/api/criancas/:id', requireUsuario, h(async (req, res) => res.json({ ok: true, crianca: Criancas.atualizar(req.usuario.id, req.params.id, req.body || {}) })));
  app.delete('/kids/api/criancas/:id', requireUsuario, h(async (req, res) => res.json(Criancas.arquivar(req.usuario.id, req.params.id))));

  // ---- trilha de missões da criança ----
  app.get('/kids/api/criancas/:id/missoes', requireUsuario, h(async (req, res) => {
    const c = Criancas.exigir(req.usuario.id, req.params.id);
    res.json({ crianca: c, missoes: Missoes.trilha(c.id) });
  }));
  app.post('/kids/api/criancas/:id/missoes/:mid/iniciar', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, missao: Missoes.iniciar(req.usuario.id, req.params.id, req.params.mid) });
  }));
  app.post('/kids/api/criancas/:id/missoes/:mid/concluir', requireUsuario, h(async (req, res) => {
    res.json(Missoes.concluir(req.usuario.id, req.params.id, req.params.mid, req.body || {}));
  }));

  // ---- portfólio (as criações — visíveis só à própria família) ----
  app.get('/kids/api/criancas/:id/portfolio', requireUsuario, h(async (req, res) => {
    res.json({ portfolio: Portfolio.listar(req.usuario.id, req.params.id) });
  }));
}

module.exports = { registrarRotasApp };
