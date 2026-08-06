// =====================================================================
// Villela Alta Vista 360 — API do painel do CLIENTE (/alta-vista/api/app/*).
// Toda rota exige sessão (requireCliente) e TODO acesso é escopado pelo
// cliente_id da sessão — nunca por parâmetro do navegador (isolamento
// testado no selftest, padrão Growth OS).
// =====================================================================
'use strict';
const repo = require('./repo');
const billing = require('./billing');
const arquivos = require('./arquivos');
const { db } = require('./db');
const { SITE } = require('./paginas');
const { Clientes, Imoveis, Projetos, Mensagens, Propostas, STATUS_PROJETO, s, n } = repo;

// dono da versão/entrega = dono do projeto — TODO acesso passa por aqui
const versaoDoCliente = (clienteId, versaoId) => db.prepare(`SELECT v.* FROM entrega_versoes v
  JOIN entregas e ON e.id = v.entrega_id JOIN projetos p ON p.id = e.projeto_id
  WHERE v.id = ? AND p.cliente_id = ?`).get(String(versaoId || ''), String(clienteId));
const entregaDoCliente = (clienteId, entregaId) => db.prepare(`SELECT e.* FROM entregas e
  JOIN projetos p ON p.id = e.projeto_id WHERE e.id = ? AND p.cliente_id = ?`).get(String(entregaId || ''), String(clienteId));

function registrarRotasApp(app, { requireCliente, notificar = async () => {} }) {
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { res.status(400).json({ erro: e.message }); }
  };

  app.use('/alta-vista/api/app', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  app.get('/alta-vista/api/app/me', requireCliente, h((req, res) => {
    res.json({
      cliente: req.cliente,
      status_rotulos: STATUS_PROJETO,
      resumo: {
        projetos: Projetos.doCliente(req.cliente.id).length,
        imoveis: Imoveis.doCliente(req.cliente.id).length,
      },
    });
  }));

  app.patch('/alta-vista/api/app/me', requireCliente, h((req, res) => {
    res.json({ ok: true, cliente: Clientes.atualizar(req.cliente.id, req.body || {}) });
  }));

  // ---------------- imóveis ----------------
  app.get('/alta-vista/api/app/imoveis', requireCliente, h((req, res) => {
    res.json({ imoveis: Imoveis.doCliente(req.cliente.id) });
  }));
  app.post('/alta-vista/api/app/imoveis', requireCliente, h((req, res) => {
    res.json({ ok: true, imovel: Imoveis.salvar(req.cliente.id, req.body || {}) });
  }));
  app.delete('/alta-vista/api/app/imoveis/:id', requireCliente, h((req, res) => {
    Imoveis.remover(req.cliente.id, req.params.id);
    res.json({ ok: true });
  }));

  // ---------------- projetos ----------------
  app.get('/alta-vista/api/app/projetos', requireCliente, h((req, res) => {
    res.json({ projetos: Projetos.doCliente(req.cliente.id), status_rotulos: STATUS_PROJETO });
  }));
  app.get('/alta-vista/api/app/projetos/:id', requireCliente, h((req, res) => {
    const p = Projetos.doCliente(req.cliente.id, req.params.id);
    if (!p) return res.status(404).json({ erro: 'Projeto não encontrado.' });
    res.json({
      projeto: p,
      imovel: p.imovel_id ? Imoveis.obter(req.cliente.id, p.imovel_id) : null,
      eventos: Projetos.eventos(p.id),
      mensagens: Mensagens.doProjeto(p.id),
      proposta: p.proposta_id ? (() => { const pr = Propostas.listar({ lead_id: '' }).find((x) => x.id === p.proposta_id); return pr ? { total_centavos: pr.total_centavos, status: pr.status } : null; })() : null,
      parcelas: billing.Parcelas.doProjeto(p.id),
      saldo_centavos: billing.saldo(p.id),
      pagamento_online: billing.ativo(),
      entregas: arquivos.Entregas.doProjeto(p.id),
      materiais: arquivos.Materiais.doProjeto(p.id),
      status_rotulos: STATUS_PROJETO,
    });
  }));

  // pagamento: o cliente só cria checkout de parcela PRÓPRIA
  app.post('/alta-vista/api/app/parcelas/:id/checkout', requireCliente, h(async (req, res) => {
    const parc = billing.Parcelas.doCliente(req.cliente.id, req.params.id);
    if (!parc) return res.status(404).json({ erro: 'Parcela não encontrada.' });
    const r = await billing.criarCheckout(parc.id, { baseUrl: SITE });
    res.json({ ok: true, init_point: r.init_point });
  }));
  app.put('/alta-vista/api/app/projetos/:id/briefing', requireCliente, h((req, res) => {
    const p = Projetos.salvarBriefing(req.cliente.id, req.params.id, req.body || {});
    notificar(`📝 Alta Vista 360 — briefing preenchido por ${req.cliente.nome} no projeto "${p.titulo}".`).catch(() => {});
    res.json({ ok: true, projeto: p });
  }));
  app.post('/alta-vista/api/app/projetos/:id/imovel', requireCliente, h((req, res) => {
    // vincular um imóvel PRÓPRIO ao projeto (escopado pelos dois lados)
    const p = Projetos.doCliente(req.cliente.id, req.params.id);
    if (!p) return res.status(404).json({ erro: 'Projeto não encontrado.' });
    const imovelId = s((req.body || {}).imovel_id, 40);
    if (imovelId && !Imoveis.obter(req.cliente.id, imovelId)) return res.status(400).json({ erro: 'Imóvel não encontrado.' });
    res.json({ ok: true, projeto: Projetos.atualizar(p.id, { imovel_id: imovelId }, { quem: req.cliente.email }) });
  }));

  // ---------------- mensagens ----------------
  app.post('/alta-vista/api/app/projetos/:id/mensagens', requireCliente, h((req, res) => {
    const p = Projetos.doCliente(req.cliente.id, req.params.id);
    if (!p) return res.status(404).json({ erro: 'Projeto não encontrado.' });
    const m = Mensagens.enviar(p.id, { autor: 'cliente', autor_nome: req.cliente.nome, texto: (req.body || {}).texto });
    notificar(`💬 Alta Vista 360 — mensagem de ${req.cliente.nome} no projeto "${p.titulo}":\n${m.texto.slice(0, 300)}`).catch(() => {});
    res.json({ ok: true, mensagens: Mensagens.doProjeto(p.id) });
  }));

  // ---------------- Onda 5: materiais do cliente ----------------
  app.post('/alta-vista/api/app/projetos/:id/materiais/upload-url', requireCliente, h((req, res) => {
    const p = Projetos.doCliente(req.cliente.id, req.params.id);
    if (!p) return res.status(404).json({ erro: 'Projeto não encontrado.' });
    const d = req.body || {};
    res.json({ ok: true, ...arquivos.Uploads.criar(s(d.mime, 60), { tipo: 'material', projeto_id: p.id, tamanho: n(d.tamanho, 0) }) });
  }));
  app.post('/alta-vista/api/app/projetos/:id/materiais/confirmar', requireCliente, h(async (req, res) => {
    const d = req.body || {};
    const m = await arquivos.Materiais.criar(req.cliente.id, req.params.id, { upload_id: d.upload_id, nome: d.nome });
    res.json({ ok: true, material: m });
  }));
  app.get('/alta-vista/api/app/materiais/:id/ver', requireCliente, h((req, res) => {
    const m = db.prepare('SELECT * FROM materiais WHERE id = ? AND cliente_id = ?').get(req.params.id, req.cliente.id);
    if (!m) return res.status(404).json({ erro: 'Material não encontrado.' });
    res.json({ ok: true, ...arquivos.Materiais.ver(m.id) });
  }));
  app.delete('/alta-vista/api/app/materiais/:id', requireCliente, h((req, res) => {
    arquivos.Materiais.remover(req.cliente.id, req.params.id);
    res.json({ ok: true });
  }));

  // ---------------- Onda 5: revisão das entregas ----------------
  app.get('/alta-vista/api/app/versoes/:id/previa', requireCliente, h((req, res) => {
    const v = versaoDoCliente(req.cliente.id, req.params.id);
    if (!v) return res.status(404).json({ erro: 'Versão não encontrada.' });
    res.json({ ok: true, ...arquivos.Versoes.verPrevia(v.id) });
  }));
  app.post('/alta-vista/api/app/versoes/:id/comentarios', requireCliente, h((req, res) => {
    const v = versaoDoCliente(req.cliente.id, req.params.id);
    if (!v) return res.status(404).json({ erro: 'Versão não encontrada.' });
    const d = req.body || {};
    const c = arquivos.Comentarios.criar(v.id, { autor: 'cliente', autor_nome: req.cliente.nome, texto: d.texto, ancora: d.ancora });
    notificar(`💬 Alta Vista 360 — comentário de revisão de ${req.cliente.nome}${c.ancora && c.ancora.t != null ? ` (aos ${Math.round(c.ancora.t)}s)` : ''}:\n${c.texto.slice(0, 300)}`).catch(() => {});
    res.json({ ok: true, comentarios: arquivos.Comentarios.daVersao(v.id) });
  }));
  app.post('/alta-vista/api/app/entregas/:id/aprovar', requireCliente, h((req, res) => {
    const e = arquivos.Entregas.aprovar(req.cliente.id, req.params.id, { nome: req.cliente.nome });
    notificar(`✅ Alta Vista 360 — ${req.cliente.nome} APROVOU a entrega "${e.titulo}".`).catch(() => {});
    res.json({ ok: true, entrega: e });
  }));
  app.get('/alta-vista/api/app/versoes/:id/download', requireCliente, h((req, res) => {
    const v = versaoDoCliente(req.cliente.id, req.params.id);
    if (!v) return res.status(404).json({ erro: 'Versão não encontrada.' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    res.json({ ok: true, ...arquivos.Versoes.download(v.id, { quem: req.cliente.email, ip }) });
  }));

  // ---------------- Onda 6: tours do cliente ----------------
  const { Tours } = require('./tours');
  app.get('/alta-vista/api/app/tours', requireCliente, h((req, res) => {
    const tours = Tours.listar({ cliente_id: req.cliente.id }).map((t) => ({
      id: t.id, slug: t.slug, titulo: t.titulo, status: t.status, visibilidade: t.visibilidade,
      expira_em: t.expira_em, cenas_total: t.cenas_total, views_total: t.views_total,
      url: `${SITE}/alta-vista/t/${t.slug}`,
      embed: `<iframe src="${SITE}/alta-vista/t/${t.slug}" width="100%" height="480" style="border:0;border-radius:12px" allowfullscreen loading="lazy" title="${t.titulo} — tour virtual 360°"></iframe>`,
      expirado: Tours.expirado(t),
    }));
    res.json({ tours });
  }));
  app.get('/alta-vista/api/app/tours/:id/stats', requireCliente, h((req, res) => {
    const t = db.prepare('SELECT * FROM tours WHERE id = ? AND cliente_id = ?').get(req.params.id, req.cliente.id);
    if (!t) return res.status(404).json({ erro: 'Tour não encontrado.' });
    res.json({ ok: true, ...Tours.stats(t.id) });
  }));
  app.get('/alta-vista/api/app/tours/:id/qr', requireCliente, h(async (req, res) => {
    const t = db.prepare('SELECT * FROM tours WHERE id = ? AND cliente_id = ?').get(req.params.id, req.cliente.id);
    if (!t) return res.status(404).json({ erro: 'Tour não encontrado.' });
    const QRCode = require('qrcode');
    const svg = await QRCode.toString(`${SITE}/alta-vista/t/${t.slug}`, { type: 'svg', margin: 1, width: 280, color: { dark: '#071A2B', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  }));
  app.post('/alta-vista/api/app/tours/:id/renovar', requireCliente, h(async (req, res) => {
    const t = db.prepare('SELECT * FROM tours WHERE id = ? AND cliente_id = ?').get(req.params.id, req.cliente.id);
    if (!t) return res.status(404).json({ erro: 'Tour não encontrado.' });
    if (!t.projeto_id) return res.status(400).json({ erro: 'Este tour não tem projeto vinculado — fale com a equipe para renovar.' });
    const plano = (req.body || {}).plano === 'anual' ? 'anual' : 'mensal';
    const sv = repo.Servicos.porSlug(plano === 'anual' ? 'hospedagem-anual' : 'hospedagem-mensal');
    if (!sv) return res.status(400).json({ erro: 'Plano de hospedagem indisponível no catálogo.' });
    const parcela = billing.criarParcelaAvulsa(t.projeto_id, `Hospedagem do tour (${plano})`, sv.preco_centavos, { quem: req.cliente.email });
    let init_point = null;
    if (billing.ativo()) {
      const r = await billing.criarCheckout(parcela.id, { baseUrl: SITE });
      init_point = r.init_point;
    }
    notificar(`🔁 Alta Vista 360 — ${req.cliente.nome} pediu renovação ${plano} do tour "${t.titulo}"${init_point ? ' (checkout aberto)' : ' — cobrar manualmente'}.`).catch(() => {});
    res.json({ ok: true, parcela, init_point, aviso: init_point ? null : 'Pagamento on-line indisponível — a equipe combina a cobrança com você.' });
  }));

  // ---------------- LGPD ----------------
  app.get('/alta-vista/api/app/meus-dados', requireCliente, h((req, res) => {
    const projetos = Projetos.doCliente(req.cliente.id);
    res.json({
      exportado_em: new Date().toISOString(),
      cliente: req.cliente,
      imoveis: Imoveis.doCliente(req.cliente.id),
      projetos: projetos.map((p) => ({ ...p, eventos: Projetos.eventos(p.id), mensagens: Mensagens.doProjeto(p.id) })),
    });
  }));
  app.post('/alta-vista/api/app/excluir-conta', requireCliente, h((req, res) => {
    const c = Clientes.autenticar(req.cliente.email, (req.body || {}).senha);
    if (!c) return res.status(401).json({ erro: 'Senha incorreta — confirmação necessária para excluir a conta.' });
    Clientes.excluir(req.cliente.id);
    res.clearCookie('av_sess', { path: '/alta-vista' });
    res.json({ ok: true, msg: 'Conta excluída e dados pessoais anonimizados.' });
  }));
}

module.exports = { registrarRotasApp };
