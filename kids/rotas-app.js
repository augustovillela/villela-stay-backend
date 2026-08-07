// =====================================================================
// Villela Kids — API autenticada do app da família (/kids/api/*).
// Toda rota de criança valida NO SERVIDOR que o perfil pertence à sessão
// do responsável (repo.Criancas.exigir) — esconder botão não é segurança.
// A trilha, o iniciar/concluir e o portfólio moram no repo; aqui só HTTP.
// =====================================================================
'use strict';
const repo = require('./repo');
const ia = require('./ia');
const push = require('./push');
const imagens = require('./imagens');
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
    res.json({
      crianca: { ...c, nivel: repo.nivelDaCrianca(c.id) },
      missoes: Missoes.trilha(c.id).map((m) => ({ ...m, tem_roteiro: ia.temRoteiro(m.id) })),
    });
  }));
  app.post('/kids/api/criancas/:id/missoes/:mid/iniciar', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, missao: Missoes.iniciar(req.usuario.id, req.params.id, req.params.mid) });
  }));
  app.post('/kids/api/criancas/:id/missoes/:mid/concluir', requireUsuario, h(async (req, res) => {
    res.json(Missoes.concluir(req.usuario.id, req.params.id, req.params.mid, req.body || {}));
  }));

  // ---- missão guiada (onda 2): estado, avançar, chat com o tutor, concluir ----
  app.get('/kids/api/criancas/:id/missoes/:mid/jogo', requireUsuario, h(async (req, res) => {
    res.json({ jogo: ia.estado(req.usuario.id, req.params.id, req.params.mid) });
  }));
  app.post('/kids/api/criancas/:id/missoes/:mid/jogo/avancar', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, jogo: ia.avancar(req.usuario.id, req.params.id, req.params.mid, req.body || {}) });
  }));
  app.post('/kids/api/criancas/:id/missoes/:mid/jogo/responder', requireUsuario, h(async (req, res) => {
    res.json(await ia.responder(req.usuario.id, req.params.id, req.params.mid, (req.body || {}).texto));
  }));
  app.post('/kids/api/criancas/:id/missoes/:mid/jogo/concluir', requireUsuario, h(async (req, res) => {
    res.json(ia.concluirGuiada(req.usuario.id, req.params.id, req.params.mid, req.body || {}));
  }));

  // ---- portfólio (as criações — visíveis só à própria família) ----
  app.get('/kids/api/criancas/:id/portfolio', requireUsuario, h(async (req, res) => {
    res.json({ portfolio: Portfolio.listar(req.usuario.id, req.params.id) });
  }));

  // ---- Estúdio de Ilustração com IA (onda 5, gated por credencial) ----
  app.post('/kids/api/criancas/:id/ilustrar', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, ilustracao: await imagens.ilustrar(req.usuario.id, req.params.id, req.body || {}) });
  }));
  app.get('/kids/api/criancas/:id/ilustracoes/:pid', requireUsuario, (req, res) => {
    // Perfil de outra família cai no exigir() lá dentro — aqui vira 404 igual
    // ao id inexistente: quem não é dono nem descobre que a imagem existe.
    let abs = null;
    try { abs = imagens.caminhoDaImagem(req.usuario.id, req.params.id, req.params.pid); } catch (_) { abs = null; }
    if (!abs) return res.status(404).json({ erro: 'Imagem não encontrada.' });
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(abs);
  });

  // ---- painel dos pais (onda 4): evidências e atividade por criança ----
  app.get('/kids/api/painel', requireUsuario, h(async (req, res) => {
    res.json({ painel: repo.painelDosPais(req.usuario.id) });
  }));

  // ---- Web Push do responsável (onda 4) ----
  app.get('/kids/api/push/chave', h(async (req, res) => {
    const chave = push.chavePublica();
    res.json({ disponivel: !!chave, chave: chave || '' });
  }));
  app.post('/kids/api/push/inscrever', requireUsuario, h(async (req, res) => {
    push.salvar(req.usuario.id, (req.body || {}).assinatura || req.body);
    res.json({ ok: true });
  }));
  app.post('/kids/api/push/remover', requireUsuario, h(async (req, res) => {
    push.remover((req.body || {}).endpoint);
    res.json({ ok: true });
  }));
}

module.exports = { registrarRotasApp };
