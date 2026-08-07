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

  // ---- Certificado de Conquista (onda 7, pág. 31 do brand book) ----
  // Conteúdo mínimo do book: nome preferido, missão, data, ambiente e
  // assinatura do mentor (o responsável). Servido SÓ à família, imprimível.
  app.get('/kids/api/criancas/:id/missoes/:mid/certificado', requireUsuario, h(async (req, res) => {
    const c = Criancas.exigir(req.usuario.id, req.params.id);
    const m = Missoes.obter(req.params.mid);
    const p = Missoes.progresso(c.id, req.params.mid);
    if (!m || !p || p.status !== 'concluida') throw new Error('Certificado só existe para missão concluída.');
    const data = new Date(p.concluido_em).toLocaleDateString('pt-BR');
    res.set('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Certificado — ${m.titulo}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@700;800;900&family=Inter:wght@400;600&display=swap">
<style>
body{margin:0;background:#14265C;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:20px;box-sizing:border-box}
.cert{background:#F7F8FF;border-radius:24px;max-width:680px;width:100%;overflow:hidden;text-align:center;color:#111A3A}
.faixa{display:flex;height:14px}.faixa div{flex:1}
.corpo{padding:44px 40px 36px}
h1{font-family:'Nunito Sans',sans-serif;font-size:15px;letter-spacing:3px;color:#6C4DFF;margin:18px 0 6px}
.nome{font-family:'Nunito Sans',sans-serif;font-size:38px;font-weight:900;margin:4px 0}
.missao{font-size:18px;margin:6px 0 26px}
.linhas{display:flex;justify-content:space-around;gap:20px;margin-top:34px;font-size:13px;color:#5B6478}
.linhas div{border-top:2px solid #C9CEE6;padding-top:8px;min-width:150px}
.rodape{font-size:12px;color:#5B6478;padding:0 0 22px}
@media print{body{background:#fff;padding:0}.cert{max-width:none;border:2px solid #14265C}}
</style></head><body><div class="cert">
<div class="faixa"><div style="background:#6C4DFF"></div><div style="background:#23C7E8"></div><div style="background:#FF8A34"></div><div style="background:#F05AA6"></div><div style="background:#A9E34B"></div></div>
<div class="corpo">
<svg width="72" height="72" viewBox="0 0 120 120" aria-hidden="true"><polyline points="18,15 60,105 102,15" fill="none" stroke="#6C4DFF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/></svg>
<h1>CERTIFICADO DE CONQUISTA</h1>
<div class="nome">${c.apelido}</div>
<p class="missao">concluiu a missão <b>${m.emoji} ${m.titulo}</b><br><small>criando: ${m.produto_final}</small></p>
<div class="linhas"><div>Responsável / Mentor</div><div>Invente Lab · ${data}</div></div>
</div>
<p class="rodape">Invente · uma plataforma Villela Kids · aprenda criando</p>
</div></body></html>`);
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
