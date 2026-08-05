// =====================================================================
// Closet Club — API do PAINEL (/closet/app), exige sessão.
// A mesma pessoa é proprietária e cliente: as rotas de "anunciar" e as de
// "alugar" convivem, e cada uma valida a titularidade do recurso.
// =====================================================================
'use strict';
const repo = require('./repo');
const ia = require('./ia');
const { db, nowISO, hojeISO, j } = require('./db');
const { Bookings, Payouts, Reviews, Favoritos, Chat } = require('./bookings');
const { Items, Looks, Users, Agenda, Notificacoes, s, n } = repo;

function registrarRotasApp(app, { requireUsuario }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));
  const A = requireUsuario;
  const exigePremium = (flag) => (req, res, next) => (req.usuario.entitlements.flags[flag]
    ? next()
    : res.status(402).json({ erro: 'Recurso do plano Premium.', precisa: 'premium' }));

  // ---------------- painel inicial ----------------
  app.get('/closet/api/app/dashboard', A, h(async (req, res) => {
    const u = req.usuario;
    const comoDono = Bookings.doOwner(u.id);
    const comoCliente = Bookings.doCliente(u.id);
    const precisaAcao = comoDono.filter((b) => b.status === 'pago_bloqueado' && b.itens.some((i) => i.owner_id === u.id && i.status === 'pendente'));
    const emCurso = comoCliente.filter((b) => repo.ABERTOS.includes(b.status));
    res.json({
      saldo: Payouts.saldo(u.id),
      precisa_confirmar: precisaAcao.map((b) => ({ id: b.id, codigo: b.codigo, data_retirada: b.data_retirada, total_centavos: b.total_centavos, prazo_confirmacao: b.prazo_confirmacao })),
      proximas_entregas: comoDono.filter((b) => ['confirmado', 'retirado'].includes(b.status)).slice(0, 8),
      minhas_reservas_em_curso: emCurso.slice(0, 8),
      pecas: { total: Items.doOwner(u.id).length, ativas: Items.doOwner(u.id, { status: 'ativo' }).length },
      mensagens_nao_lidas: Chat.listar(u.id).reduce((t, c) => t + n(c.nao_lidas, 0), 0),
      notificacoes: Notificacoes.listar(u.id, { naoLidas: true }).slice(0, 6),
      entitlements: u.entitlements,
    });
  }));

  // ---------------- peças (anunciante) ----------------
  app.get('/closet/api/app/pecas', A, h(async (req, res) => res.json({ pecas: Items.doOwner(req.usuario.id, { status: s(req.query.status, 20) }) })));

  app.post('/closet/api/app/pecas', A, h(async (req, res) => {
    const i = Items.criar(req.usuario.id, req.body || {});
    res.json({ ok: true, peca: i, qualidade_fotos: ia.qualidadeFotos(i.fotos) });
  }));

  app.get('/closet/api/app/pecas/:id', A, h(async (req, res) => {
    const i = Items.obter(req.params.id);
    if (!i || i.owner_id !== req.usuario.id) return res.status(404).json({ erro: 'Peça não encontrada.' });
    res.json({
      peca: i,
      agenda: Agenda.bloqueios(i.id),
      calendario: Agenda.calendario(i.id, hojeISO(), null),
      avaliacoes: Reviews.doAlvo('item', i.id, 20),
      qualidade_fotos: ia.qualidadeFotos(i.fotos),
    });
  }));

  app.patch('/closet/api/app/pecas/:id', A, h(async (req, res) => res.json({ ok: true, peca: Items.atualizar(req.params.id, req.usuario.id, req.body || {}) })));

  app.delete('/closet/api/app/pecas/:id', A, h(async (req, res) => {
    Items.atualizar(req.params.id, req.usuario.id, { status: 'removido' });
    res.json({ ok: true });
  }));

  // agenda: bloquear/desbloquear datas manualmente
  app.post('/closet/api/app/pecas/:id/bloqueios', A, h(async (req, res) => {
    const i = Items.obter(req.params.id);
    if (!i || i.owner_id !== req.usuario.id) return res.status(404).json({ erro: 'Peça não encontrada.' });
    const d = req.body || {};
    const conflito = Agenda.bloqueios(i.id, s(d.inicio, 10), s(d.fim, 10));
    if (conflito.length) return res.status(400).json({ erro: 'Já existe bloqueio ou reserva nesse período.' });
    res.json({ ok: true, id: Agenda.bloquear(i.id, s(d.inicio, 10), s(d.fim, 10), 'manual', '') });
  }));
  app.delete('/closet/api/app/bloqueios/:id', A, h(async (req, res) => res.json(Agenda.desbloquear(req.params.id, req.usuario.id))));

  // ---------------- looks ----------------
  app.get('/closet/api/app/looks', A, h(async (req, res) => res.json({ looks: Looks.doCurador(req.usuario.id) })));
  app.post('/closet/api/app/looks', A, h(async (req, res) => {
    const ent = req.usuario.entitlements;
    if (ent.limites.looks && Looks.doCurador(req.usuario.id).length >= ent.limites.looks) {
      return res.status(402).json({ erro: `Seu plano permite ${ent.limites.looks} look(s). Assine o Premium para criar sem limite.`, precisa: 'premium' });
    }
    res.json({ ok: true, look: Looks.criar(req.usuario.id, req.body || {}) });
  }));
  app.get('/closet/api/app/looks/:id', A, h(async (req, res) => {
    const l = Looks.obter(req.params.id);
    if (!l || l.curador_id !== req.usuario.id) return res.status(404).json({ erro: 'Look não encontrado.' });
    res.json({ look: l });
  }));
  app.patch('/closet/api/app/looks/:id', A, h(async (req, res) => res.json({ ok: true, look: Looks.atualizar(req.params.id, req.usuario.id, req.body || {}) })));

  // ---------------- reservas: como PROPRIETÁRIO ----------------
  app.get('/closet/api/app/reservas', A, h(async (req, res) => res.json({ reservas: Bookings.doOwner(req.usuario.id, { status: s(req.query.status, 30) }) })));

  app.get('/closet/api/app/reservas/:id', A, h(async (req, res) => {
    const b = Bookings.obter(req.params.id);
    if (!b || !Bookings.podeVer(b, req.usuario)) return res.status(404).json({ erro: 'Reserva não encontrada.' });
    // o QR só aparece para quem participa, e só quando faz sentido na etapa
    const meu = { ...b };
    if (b.cliente_id !== req.usuario.id && !b.donos.includes(req.usuario.id)) { meu.token_retirada = ''; meu.token_devolucao = ''; }
    res.json({ reserva: meu, sou_cliente: b.cliente_id === req.usuario.id, sou_proprietario: b.donos.includes(req.usuario.id) });
  }));

  app.post('/closet/api/app/reservas/:id/confirmar', A, h(async (req, res) => res.json(Bookings.confirmar(req.params.id, req.usuario.id))));
  app.post('/closet/api/app/reservas/:id/recusar', A, h(async (req, res) => res.json(Bookings.recusar(req.params.id, req.usuario.id, (req.body || {}).motivo))));

  // proprietário conferiu a peça e libera o repasse antes do fim da janela
  app.post('/closet/api/app/reservas/:id/liberar', A, h(async (req, res) => {
    const b = Bookings.obter(req.params.id);
    if (!b || !b.donos.includes(req.usuario.id)) return res.status(404).json({ erro: 'Reserva não encontrada.' });
    res.json(Bookings.concluir(b.id, { quem: req.usuario.email }));
  }));

  app.post('/closet/api/app/reservas/:id/disputa', A, h(async (req, res) => res.json(Bookings.abrirDisputa(req.params.id, req.usuario.id, req.body || {}))));

  // ---------------- reservas: como CLIENTE ----------------
  app.get('/closet/api/app/minhas-reservas', A, h(async (req, res) => res.json({ reservas: Bookings.doCliente(req.usuario.id, { status: s(req.query.status, 30) }) })));
  app.post('/closet/api/app/minhas-reservas/:id/cancelar', A, h(async (req, res) => res.json(Bookings.cancelar(req.params.id, req.usuario.id, (req.body || {}).motivo))));

  // ---------------- financeiro do proprietário ----------------
  app.get('/closet/api/app/financeiro', A, h(async (req, res) => {
    const u = req.usuario;
    const meses = db.prepare(`SELECT substr(b.concluido_em,1,7) mes, COALESCE(SUM(bi.repasse_centavos),0) v, COUNT(DISTINCT b.id) n
      FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id
      WHERE bi.owner_id = ? AND b.status = 'concluido' GROUP BY mes ORDER BY mes DESC LIMIT 12`).all(u.id);
    res.json({
      saldo: Payouts.saldo(u.id),
      repasses: Payouts.doOwner(u.id),
      por_mes: meses.reverse(),
      pix: { tipo: u.pix_tipo, chave: u.pix_chave, configurado: !!u.pix_chave },
      comissao_pct: u.entitlements.comissao_pct,
    });
  }));

  // ---------------- favoritos ----------------
  app.get('/closet/api/app/favoritos', A, h(async (req, res) => res.json(Favoritos.listar(req.usuario.id))));

  // ---------------- chat ----------------
  app.get('/closet/api/app/conversas', A, h(async (req, res) => res.json({ conversas: Chat.listar(req.usuario.id) })));
  app.get('/closet/api/app/conversas/:id', A, h(async (req, res) => res.json(Chat.mensagens(req.params.id, req.usuario.id))));
  app.post('/closet/api/app/conversas', A, h(async (req, res) => {
    const d = req.body || {};
    const item = d.item_id ? Items.obter(d.item_id) : null;
    const ownerId = s(d.owner_id, 40) || (item ? item.owner_id : '');
    if (!ownerId) throw new Error('Informe com quem quer falar.');
    const id = Chat.abrir(req.usuario.id, ownerId, { item_id: s(d.item_id, 40), assunto: s(d.assunto, 140) || (item ? item.titulo : '') });
    if (d.texto) Chat.enviar(id, req.usuario.id, d.texto);
    res.json({ ok: true, id });
  }));
  app.post('/closet/api/app/conversas/:id/mensagens', A, h(async (req, res) => res.json(Chat.enviar(req.params.id, req.usuario.id, (req.body || {}).texto))));

  // ---------------- avaliações ----------------
  app.post('/closet/api/app/avaliacoes', A, h(async (req, res) => res.json(Reviews.criar(req.usuario.id, req.body || {}))));
  app.post('/closet/api/app/avaliacoes/:id/responder', A, h(async (req, res) => res.json(Reviews.responder(req.params.id, req.usuario.id, (req.body || {}).texto))));

  // ---------------- IA do anunciante ----------------
  // Sugestão de preço e descrição são grátis (fazem o anúncio nascer bom);
  // analytics e classificação em lote são do Premium.
  app.post('/closet/api/app/ia/preco', A, h(async (req, res) => res.json(ia.sugerirPreco(req.body || {}))));
  app.post('/closet/api/app/ia/descricao', A, h(async (req, res) => {
    res.json(await ia.descricaoAuto(req.body || {}));
  }));
  app.post('/closet/api/app/ia/fotos', A, h(async (req, res) => res.json(ia.qualidadeFotos((req.body || {}).fotos || []))));
  app.get('/closet/api/app/ia/analytics', A, exigePremium('analytics'), h(async (req, res) => {
    res.json(ia.analyticsDoOwner(req.usuario.id, { dias: n(req.query.dias, 30) }));
  }));

  // ---------------- ONDA 2: fotos ----------------
  // O navegador redimensiona antes de enviar; aqui só chega base64 já leve.
  app.post('/closet/api/app/fotos', A, h(async (req, res) => {
    const storage = require('./storage');
    const lista = Array.isArray((req.body || {}).fotos) ? (req.body || {}).fotos : [(req.body || {}).foto];
    const max = Math.max(1, req.usuario.entitlements.limites.fotos_por_peca || 5);
    const salvas = [];
    for (const dataUrl of lista.filter(Boolean).slice(0, max)) {
      salvas.push(await storage.salvarDataUrl(dataUrl, { userId: req.usuario.id, origem: s((req.body || {}).origem, 20) || 'peca' }));
    }
    if (!salvas.length) throw new Error('Nenhuma imagem válida recebida.');
    res.json({ ok: true, fotos: salvas, uso: storage.uso(req.usuario.id) });
  }));

  // ---------------- ONDA 2: indicação e créditos ----------------
  app.get('/closet/api/app/indicacoes', A, h(async (req, res) => {
    const { Indicacoes, Creditos } = require('./crescimento');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const dados = Indicacoes.minhas(req.usuario.id);
    res.json({
      ...dados,
      link: `${proto}://${req.get('host')}/closet/i/${dados.codigo}`,
      saldo_centavos: Creditos.saldo(req.usuario.id),
      extrato: Creditos.extrato(req.usuario.id),
    });
  }));

  // ---------------- ONDA 2: chaves da API pública (Premium) ----------------
  app.get('/closet/api/app/chaves', A, h(async (req, res) => res.json({ chaves: require('./api-publica').Chaves.listar(req.usuario.id) })));
  app.post('/closet/api/app/chaves', A, exigePremium('api'), h(async (req, res) => {
    // a chave completa só existe nesta resposta — depois fica só o hash
    res.json({ ok: true, ...require('./api-publica').Chaves.criar(req.usuario.id, { nome: s((req.body || {}).nome, 120) }) });
  }));
  app.delete('/closet/api/app/chaves/:id', A, h(async (req, res) => res.json(require('./api-publica').Chaves.revogar(req.params.id, req.usuario.id))));

  // ---------------- ONDA 2: painel do parceiro ----------------
  // Parceiro é um usuário comum com papel 'parceiro' ligado a um registro
  // em `partners` — sem segundo sistema de login.
  const requireParceiro = (req, res, next) => {
    const p = require('./parceiros').Parceiros.doUsuario(req.usuario.id);
    if (!p || p.status !== 'ativo') return res.status(403).json({ erro: 'Sua conta não está vinculada a um parceiro ativo.' });
    req.parceiro = p;
    next();
  };
  app.get('/closet/api/app/parceiro', A, h(async (req, res) => {
    const p = require('./parceiros').Parceiros.doUsuario(req.usuario.id);
    if (!p) return res.json({ parceiro: null });
    res.json({ parceiro: p, agenda: require('./parceiros').Parceiros.agenda(p.id) });
  }));
  app.post('/closet/api/app/parceiro/servicos', A, requireParceiro, h(async (req, res) => {
    res.json({ ok: true, id: require('./parceiros').Parceiros.addServico(req.parceiro.id, req.body || {}) });
  }));
  app.patch('/closet/api/app/parceiro/servicos/:id', A, requireParceiro, h(async (req, res) => {
    res.json(require('./parceiros').Parceiros.mudarServico(req.params.id, req.parceiro.id, req.body || {}));
  }));
  app.post('/closet/api/app/parceiro/agenda/:id/concluir', A, requireParceiro, h(async (req, res) => {
    res.json(require('./parceiros').Parceiros.concluirServico(req.params.id, req.parceiro.id));
  }));

  // ---------------- ONDA 3: campanhas patrocinadas ----------------
  app.get('/closet/api/app/campanhas', A, h(async (req, res) => {
    const { Campanhas } = require('./campanhas');
    res.json({ campanhas: Campanhas.doUsuario(req.usuario.id), tabela: Campanhas.cotar(7) });
  }));
  app.post('/closet/api/app/campanhas/cotar', A, h(async (req, res) => {
    res.json(require('./campanhas').Campanhas.cotar((req.body || {}).dias));
  }));
  app.post('/closet/api/app/campanhas', A, h(async (req, res) => {
    res.json({ ok: true, campanha: require('./campanhas').Campanhas.criar(req.usuario.id, req.body || {}) });
  }));
  app.post('/closet/api/app/campanhas/:id/pix', A, h(async (req, res) => {
    const c = require('./campanhas').Campanhas.obter(req.params.id);
    if (!c || c.user_id !== req.usuario.id) return res.status(404).json({ erro: 'Campanha não encontrada.' });
    res.json(await require('./billing').gerarPixCampanha(c.id, { email: req.usuario.email, nome: req.usuario.nome }));
  }));
  app.delete('/closet/api/app/campanhas/:id', A, h(async (req, res) => {
    res.json(require('./campanhas').Campanhas.cancelar(req.params.id, req.usuario.id));
  }));

  // ---------------- destacar anúncio (Premium) ----------------
  app.post('/closet/api/app/pecas/:id/destacar', A, exigePremium('destaque'), h(async (req, res) => {
    const i = Items.obter(req.params.id);
    if (!i || i.owner_id !== req.usuario.id) return res.status(404).json({ erro: 'Peça não encontrada.' });
    res.json({ ok: true, peca: Items.destacar(i.id, n((req.body || {}).dias, 7), req.usuario.email) });
  }));
}

module.exports = { registrarRotasApp };
