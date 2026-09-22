// =====================================================================
// Comunicados — rotas.
//
//   /staff/api/comunicados/*        Portal Staff (admin). ENVIAR exige
//                                    sessão de admin: a PUBLISH_KEY pode
//                                    PREPARAR rascunho, nunca disparar —
//                                    a chave que pede não pode aprovar.
//   <base do produto>/comunicados*   caixa do usuário no app (sino), com
//                                    a sessão do PRÓPRIO produto.
//   /comunicados/descadastro         link de descadastro dos e-mails.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const motor = require('./motor');
const fontes = require('./fontes');

const WIDGET_JS = path.join(__dirname, 'widget.js');

function registrarRotas(app, { express, requireAuth, requireAdmin, requirePublishOrAdmin, registrarAuditoria = () => {} }) {
  const json = express.json({ limit: '64kb' });
  const R = '/staff/api/comunicados';
  const quem = (req) => req.viaChave ? 'agente/chave' : ((req.user && (req.user.nome || req.user.email)) || 'admin');
  const erro = (res, e) => res.status(e.status || 500).json({ erro: e.status ? e.message : 'Falha interna: ' + e.message });
  const admin = [requireAuth, requireAdmin];

  app.get(`${R}/config`, ...admin, (req, res) => {
    res.json({
      produtos: fontes.catalogo(),
      categorias: motor.CATEGORIAS,
      canais: motor.disponibilidade(),
      minha_conta: { email: (req.user && req.user.email) || '', telefone: process.env.AUGUSTO_WA || '556192113000' },
    });
  });
  app.get(R, ...admin, (req, res) => { try { res.json({ comunicados: motor.listar({ limite: req.query.limite }) }); } catch (e) { erro(res, e); } });
  app.get(`${R}/descadastros`, ...admin, (req, res) => res.json({ descadastros: motor.listarDescadastros() }));
  app.get(`${R}/:id`, ...admin, (req, res) => {
    const c = motor.obter(req.params.id);
    if (!c) return res.status(404).json({ erro: 'não encontrado' });
    res.json({ comunicado: c });
  });
  app.get(`${R}/:id/entregas`, ...admin, (req, res) => {
    res.json({ entregas: motor.entregas(req.params.id, { status: req.query.status, canal: req.query.canal, limite: req.query.limite }) });
  });
  app.post(`${R}/previa`, ...admin, json, async (req, res) => {
    try { res.json(await motor.previa(req.body || {})); } catch (e) { erro(res, e); }
  });
  // Rascunho aceita a chave (um agente pode deixar o texto pronto para o Augusto revisar).
  app.post(R, requirePublishOrAdmin, json, (req, res) => {
    try {
      const c = motor.criar(req.body || {}, quem(req));
      registrarAuditoria(req, 'comunicado.rascunho', `${c.titulo} (${c.id})`);
      res.status(201).json({ comunicado: c });
    } catch (e) { erro(res, e); }
  });
  app.put(`${R}/:id`, requirePublishOrAdmin, json, (req, res) => {
    try { res.json({ comunicado: motor.atualizar(req.params.id, req.body || {}) }); } catch (e) { erro(res, e); }
  });
  app.delete(`${R}/:id`, ...admin, (req, res) => {
    try { res.json({ ok: motor.excluirRascunho(req.params.id) }); } catch (e) { erro(res, e); }
  });
  app.post(`${R}/:id/teste`, ...admin, json, async (req, res) => {
    try {
      const b = req.body || {};
      res.json({ resultado: await motor.enviarTeste(req.params.id, { email: b.email || (req.user && req.user.email), telefone: b.telefone, produto: b.produto }) });
    } catch (e) { erro(res, e); }
  });
  // Disparo: sessão de admin + confirmação explícita no corpo (o botão da
  // tela manda `confirmar: true` só depois do diálogo com os números).
  app.post(`${R}/:id/enviar`, ...admin, json, async (req, res) => {
    try {
      const b = req.body || {};
      if (b.confirmar !== true) return res.status(400).json({ erro: 'Confirmação ausente.' });
      const c = await motor.disparar(req.params.id, { autor: quem(req), agendarPara: b.agendar_para || null });
      registrarAuditoria(req, c.status === 'agendado' ? 'comunicado.agendar' : 'comunicado.enviar',
        `${c.titulo} · ${c.canais.join('+')} · ${c.alvos.map((a) => a.produto + '/' + a.segmento).join(', ')} · ${c.publico_total} pessoa(s)`);
      res.json({ comunicado: c });
    } catch (e) { erro(res, e); }
  });
  app.post(`${R}/:id/cancelar`, ...admin, (req, res) => {
    try { const c = motor.cancelar(req.params.id); registrarAuditoria(req, 'comunicado.cancelar', c.titulo); res.json({ comunicado: c }); } catch (e) { erro(res, e); }
  });
  app.post(`${R}/:id/arquivar`, ...admin, (req, res) => {
    try { res.json({ comunicado: motor.arquivar(req.params.id) }); } catch (e) { erro(res, e); }
  });
  app.post(`${R}/:id/reenviar-erros`, ...admin, (req, res) => {
    try { res.json({ reenfileirados: motor.reenviarErros(req.params.id) }); } catch (e) { erro(res, e); }
  });
  app.post(`${R}/descadastros/remover`, ...admin, json, (req, res) => {
    const b = req.body || {};
    motor.recadastrar(String(b.contato || ''), String(b.canal || ''));
    registrarAuditoria(req, 'comunicado.recadastrar', `${b.canal}:${b.contato}`);
    res.json({ ok: true });
  });

  // ---------------- descadastro (público) ----------------
  const pagina = (titulo, corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
    <title>${titulo}</title><style>body{font-family:Inter,system-ui,Arial,sans-serif;background:#F4F6F9;color:#1F2933;margin:0;padding:40px 16px}
    .c{max-width:480px;margin:0 auto;background:#fff;border:1px solid #E2E6EC;border-radius:14px;padding:28px}
    h1{font-size:1.2rem;color:#1B2A4A;margin:0 0 12px}button{background:#1B2A4A;color:#fff;border:0;border-radius:22px;padding:11px 22px;font-weight:700;cursor:pointer;margin:6px 6px 0 0}
    button.sec{background:#fff;color:#1B2A4A;border:1px solid #1B2A4A}p{line-height:1.55}.obs{color:#6B7280;font-size:.85rem}</style></head>
    <body><div class="c">${corpo}</div></body></html>`;
  app.get('/comunicados/descadastro', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const t = motor.lerTokenDescadastro(req.query.t);
    if (!t) return res.status(400).type('html').send(pagina('Link inválido', '<h1>Link inválido</h1><p>Este link de descadastro não é válido. Responda ao e-mail pedindo a remoção e nós tiramos você da lista.</p>'));
    const tok = String(req.query.t).replace(/[^A-Za-z0-9_.-]/g, '');
    res.type('html').send(pagina('Preferências de e-mail', `<h1>Preferências de e-mail</h1>
      <p>O que você não quer mais receber?</p>
      <form method="post" action="/comunicados/descadastro"><input type="hidden" name="t" value="${tok}">
        <button name="escopo" value="avisos">Só novidades e dicas</button>
        <button name="escopo" value="tudo" class="sec">Todos os avisos</button></form>
      <p class="obs">Avisos de instabilidade e manutenção existem para você não ser pego de surpresa quando o sistema estiver fora do ar. E-mails da sua conta (senha, compra, pagamento) continuam chegando.</p>`));
  });
  app.post('/comunicados/descadastro', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const t = motor.lerTokenDescadastro(req.body && req.body.t);
    if (!t) return res.status(400).type('html').send(pagina('Link inválido', '<h1>Link inválido</h1>'));
    const escopo = req.body.escopo === 'tudo' ? 'tudo' : 'avisos';
    motor.descadastrar(t.contato, t.canal, escopo, 'link-email');
    res.type('html').send(pagina('Pronto', `<h1>Pronto.</h1><p>${escopo === 'tudo' ? 'Você não vai mais receber avisos por e-mail.' : 'Você não vai mais receber novidades e dicas por e-mail. Avisos de instabilidade continuam chegando.'}</p>`));
  });

  // ---------------- caixa do usuário (dentro de cada app) ----------------
  // Montada sob o caminho de CADA produto, para o cookie de sessão dele
  // (que pode ter `path` restrito) chegar na requisição.
  const widget = () => { try { return fs.readFileSync(WIDGET_JS, 'utf8'); } catch (_) { return '/* widget indisponível */'; } };
  for (const f of fontes.todas()) {
    if (!f.caminhoApp || typeof f.sessao !== 'function') continue;
    const base = f.caminhoApp;
    app.get(`${base}/comunicados.js`, (req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type('application/javascript').send(widget());
    });
    const resolver = async (req) => { try { return await f.sessao(req); } catch (_) { return null; } };
    app.get(`${base}/api/comunicados`, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const ref = await resolver(req);
      if (!ref) return res.json({ itens: [], nao_lidos: 0, anonimo: true });
      res.json(motor.caixa(f.chave, String(ref)));
    });
    app.post(`${base}/api/comunicados/:id/lido`, async (req, res) => {
      const ref = await resolver(req);
      if (!ref) return res.status(401).json({ erro: 'não autenticado' });
      res.json({ marcados: motor.marcarLido(f.chave, String(ref), req.params.id) });
    });
  }
}

module.exports = { registrarRotas };
