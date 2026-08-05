// =====================================================================
// Closet Club — API PÚBLICA da vitrine + fluxo de reserva + QR de posse.
// Tudo aqui é leitura livre (a vitrine precisa ser indexável e rápida),
// exceto reservar/pagar/registrar posse, que exigem sessão.
// =====================================================================
'use strict';
const repo = require('./repo');
const ia = require('./ia');
const billing = require('./billing');
const { Bookings, Reviews, Favoritos, Chat } = require('./bookings');
const { db, hojeISO, nowISO, novoId } = require('./db');
const { Items, Looks, Users, Agenda, Config, OCASIOES, CATEGORIAS, ESTILOS, TAMANHOS, s, n } = repo;

function registrarRotasPublicas(app, { requireUsuario, talvezUsuario, notificar }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  // ---- catálogo de filtros (alimenta a vitrine e os selects do app) ----
  app.get('/closet/api/catalogo', h(async (req, res) => {
    const cidades = db.prepare(`SELECT cidade, uf, COUNT(*) c FROM items WHERE status='ativo' AND moderacao='aprovado' AND cidade != ''
      GROUP BY cidade, uf ORDER BY c DESC LIMIT 40`).all();
    const marcas = db.prepare(`SELECT marca, COUNT(*) c FROM items WHERE status='ativo' AND moderacao='aprovado' AND marca != ''
      GROUP BY marca ORDER BY c DESC LIMIT 40`).all().map((m) => m.marca);
    const cores = db.prepare(`SELECT cor, COUNT(*) c FROM items WHERE status='ativo' AND moderacao='aprovado' AND cor != ''
      GROUP BY cor ORDER BY c DESC LIMIT 24`).all().map((m) => m.cor);
    res.json({ ocasioes: OCASIOES, categorias: CATEGORIAS, estilos: ESTILOS, tamanhos: TAMANHOS, cidades, marcas, cores });
  }));

  // ---- vitrine: busca com todos os filtros ----
  app.get('/closet/api/vitrine', talvezUsuario, h(async (req, res) => {
    const f = req.query || {};
    const r = Items.buscar({
      q: f.q, ocasiao: f.ocasiao, categoria: f.categoria, cor: f.cor, tamanho: f.tamanho, marca: f.marca,
      estilo: f.estilo, estacao: f.estacao, cidade: f.cidade, uf: f.uf, preco_min: f.preco_min, preco_max: f.preco_max,
      nota_min: f.nota_min, ordem: f.ordem, limite: f.limite, offset: f.offset, de: f.de, ate: f.ate,
    });
    const favoritos = req.usuario
      ? new Set(db.prepare("SELECT alvo_id FROM favorites WHERE user_id = ? AND alvo_tipo='item'").all(req.usuario.id).map((x) => x.alvo_id))
      : new Set();
    // impressão só das patrocinadas — é o que o anunciante está pagando para medir
    try { require('./campanhas').Campanhas.registrarImpressoes(r.itens.filter((i) => i.destacado).map((i) => i.id)); } catch (_) {}
    res.json({
      ...r,
      itens: r.itens.map((i) => ({
        id: i.id, slug: i.slug, titulo: i.titulo, categoria: i.categoria, cor: i.cor, tamanho: i.tamanho, marca: i.marca,
        ocasioes: i.ocasioes, cidade: i.cidade, uf: i.uf, preco_diaria_centavos: i.preco_diaria_centavos,
        caucao_centavos: i.caucao_centavos, foto: (i.fotos || [])[0] || null, fotos: (i.fotos || []).slice(0, 4),
        nota_media: i.nota_media, num_avaliacoes: i.num_avaliacoes, alugueis: i.alugueis, destacado: i.destacado,
        favoritado: favoritos.has(i.id),
      })),
    });
  }));

  // ---- vitrine de LOOKS (o diferencial) ----
  app.get('/closet/api/looks', h(async (req, res) => {
    res.json({ looks: Looks.buscar(req.query || {}) });
  }));

  app.get('/closet/api/looks/:id', h(async (req, res) => {
    const l = Looks.obter(req.params.id);
    if (!l || l.status !== 'ativo' || l.moderacao !== 'aprovado') return res.status(404).json({ erro: 'Look não encontrado.' });
    db.prepare('UPDATE looks SET visualizacoes = visualizacoes + 1 WHERE id = ?').run(l.id);
    res.json({ look: l });
  }));

  // ---- ficha da peça ----
  app.get('/closet/api/pecas/:id', talvezUsuario, h(async (req, res) => {
    const i = Items.obter(req.params.id, { comDono: true });
    if (!i || i.status !== 'ativo' || i.moderacao !== 'aprovado') return res.status(404).json({ erro: 'Peça não encontrada.' });
    Items.registrarVisualizacao(i.id, req.usuario ? req.usuario.id : '', s(req.query.origem, 60));
    if (i.destacado) { try { require('./campanhas').Campanhas.registrarClique(i.id); } catch (_) {} }
    res.json({
      peca: i,
      calendario: Agenda.calendario(i.id, hojeISO(), null),
      avaliacoes: Reviews.doAlvo('item', i.id, 20),
      avaliacoes_proprietario: Reviews.doAlvo('proprietario', i.owner_id, 8),
      combina_com: Items.complementares(i, 8),
      ultimas_locacoes: db.prepare(`SELECT b.data_retirada, b.data_devolucao FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id
        WHERE bi.item_id = ? AND b.status = 'concluido' ORDER BY b.data_retirada DESC LIMIT 5`).all(i.id),
      favoritado: req.usuario ? !!db.prepare("SELECT 1 FROM favorites WHERE user_id=? AND alvo_tipo='item' AND alvo_id=?").get(req.usuario.id, i.id) : false,
    });
  }));

  // ---- perfil público do proprietário ----
  app.get('/closet/api/pessoas/:id', h(async (req, res) => {
    const p = Users.publico(req.params.id);
    if (!p) return res.status(404).json({ erro: 'Perfil não encontrado.' });
    res.json({
      pessoa: p,
      pecas: Items.buscar({ owner_id: p.id, limite: 24 }).itens.map((i) => ({
        id: i.id, slug: i.slug, titulo: i.titulo, preco_diaria_centavos: i.preco_diaria_centavos,
        foto: (i.fotos || [])[0] || null, nota_media: i.nota_media, categoria: i.categoria,
      })),
      avaliacoes: Reviews.doAlvo('proprietario', p.id, 20),
    });
  }));

  // ---- disponibilidade de uma peça ----
  app.get('/closet/api/pecas/:id/disponibilidade', h(async (req, res) => {
    const { de, ate } = req.query || {};
    res.json({
      calendario: Agenda.calendario(req.params.id, s(de, 10) || hojeISO(), s(ate, 10)),
      ...(de && ate ? { periodo: Agenda.disponivel(req.params.id, s(de, 10), s(ate, 10)) } : {}),
    });
  }));

  // ---- IA: "Descubra seu look ideal" (aberto, sem login — é a isca) ----
  app.post('/closet/api/ia/looks', h(async (req, res) => {
    const brief = req.body || {};
    res.json(await ia.looksAuto(brief, { quantidade: Math.min(n(brief.quantidade, 6), 12) }));
  }));

  app.get('/closet/api/ia/para-voce', requireUsuario, h(async (req, res) => {
    res.json(ia.recomendar(req.usuario.id, { limite: n(req.query.limite, 12) }));
  }));

  // ---- cotação (sem gravar): a mesma conta que vira reserva ----
  app.post('/closet/api/cotar', talvezUsuario, h(async (req, res) => {
    res.json(Bookings.cotar({ ...(req.body || {}), clienteId: req.usuario ? req.usuario.id : '' }));
  }));

  // ---- reservar (exige login) ----
  app.post('/closet/api/reservas', requireUsuario, h(async (req, res) => {
    const b = Bookings.criar(req.usuario.id, req.body || {});
    // abre a conversa com cada proprietário já com o contexto da reserva
    for (const owner of b.donos) {
      try {
        const t = Chat.abrir(req.usuario.id, owner, { booking_id: b.id, assunto: `Reserva ${b.codigo}` });
        Chat.enviar(t, 'sistema', `Reserva ${b.codigo} criada: ${b.data_retirada} a ${b.data_devolucao}.`, { sistema: true });
      } catch (_) {}
    }
    if (notificar) notificar(`👗 Closet Club: nova reserva ${b.codigo} — R$ ${(b.total_centavos / 100).toFixed(2)}.`).catch(() => {});
    res.json({ ok: true, reserva: b });
  }));

  // ---- pagamento Pix da reserva ----
  app.post('/closet/api/reservas/:id/pix', requireUsuario, h(async (req, res) => {
    const b = Bookings.obter(req.params.id);
    if (!b || b.cliente_id !== req.usuario.id) return res.status(404).json({ erro: 'Reserva não encontrada.' });
    res.json(await billing.gerarPix(b.id, { email: req.usuario.email, nome: req.usuario.nome, cpf: req.usuario.cpf }));
  }));

  // ---- QR de posse: a mesma rota serve retirada e devolução ----
  // Quem abre o link precisa estar logado E participar da reserva. Assim o
  // registro tem autor — é isso que dá valor probatório ao "foi entregue".
  app.get('/closet/api/qr/:token', requireUsuario, h(async (req, res) => {
    const r = Bookings.porToken(req.params.token);
    if (!r) return res.status(404).json({ erro: 'QR Code inválido.' });
    if (!Bookings.podeVer(r.booking, req.usuario)) return res.status(403).json({ erro: 'Este QR Code não é de uma reserva sua.' });
    res.json({
      etapa: r.etapa,
      reserva: {
        codigo: r.booking.codigo, status: r.booking.status, status_rotulo: r.booking.status_rotulo,
        data_retirada: r.booking.data_retirada, data_devolucao: r.booking.data_devolucao,
        itens: r.booking.itens.map((i) => ({ titulo: i.titulo, foto: i.foto })),
        cliente: r.booking.cliente ? r.booking.cliente.nome : '',
      },
      pode_registrar: (r.etapa === 'retirada' && r.booking.status === 'confirmado') || (r.etapa === 'devolucao' && r.booking.status === 'retirado'),
    });
  }));

  app.post('/closet/api/qr/:token', requireUsuario, h(async (req, res) => {
    const r = Bookings.porToken(req.params.token);
    if (!r) return res.status(404).json({ erro: 'QR Code inválido.' });
    if (!Bookings.podeVer(r.booking, req.usuario)) return res.status(403).json({ erro: 'Este QR Code não é de uma reserva sua.' });
    const out = r.etapa === 'retirada'
      ? Bookings.registrarRetirada(req.params.token, req.usuario.id)
      : Bookings.registrarDevolucao(req.params.token, req.usuario.id);
    repo.Auditoria.registrar({ quem: req.usuario.email, acao: 'posse.' + r.etapa, entidade: 'bookings', entidade_id: r.booking.id, ip: ipDe(req) });
    res.json(out);
  }));

  // ---- favoritos ----
  app.post('/closet/api/favoritos', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json(Favoritos.alternar(req.usuario.id, s(d.alvo_tipo, 10) || 'item', s(d.alvo_id, 40)));
  }));

  // ---- serviços de parceiros disponíveis no checkout ----
  app.get('/closet/api/servicos', h(async (req, res) => {
    const { Parceiros, Entrega } = require('./parceiros');
    const cidade = s(req.query.cidade, 80);
    const bairro = s(req.query.bairro, 80);
    res.json({
      servicos: Parceiros.disponiveis({ cidade, bairro }),
      entrega: Entrega.cotar({ cidade, bairro }),
      tipos: Parceiros.TIPOS,
    });
  }));

  // ---- candidatura de parceiro (lavanderia, fotógrafo, stylist…) ----
  app.post('/closet/api/parceiros/candidatar', talvezUsuario, h(async (req, res) => {
    const p = require('./parceiros').Parceiros.candidatar(req.body || {}, { userId: req.usuario ? req.usuario.id : '' });
    if (notificar) notificar(`🤝 Closet Club: nova candidatura de parceiro — ${s((req.body || {}).nome, 60)} (${s((req.body || {}).tipo, 30)}).`).catch(() => {});
    res.json({ ok: true, id: p.id, status: p.status });
  }));

  // ---- indicação: /closet/i/:codigo leva ao cadastro já com o padrinho ----
  app.get('/closet/api/indicacao/:codigo', h(async (req, res) => {
    const padrinho = require('./crescimento').Indicacoes.porCodigo(req.params.codigo);
    if (!padrinho) return res.status(404).json({ erro: 'Código de convite inválido.' });
    res.json({ padrinho: { nome: padrinho.nome }, premio_centavos: repo.Config.num('indicacao_premio_convidado_centavos', 3000) });
  }));

  // ---- lead da landing (lista de espera / parceiro) ----
  app.post('/closet/api/lead', h(async (req, res) => {
    const d = req.body || {};
    const id = novoId();
    db.prepare('INSERT INTO leads (id, nome, email, telefone, cidade, perfil, mensagem, origem, status, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, s(d.nome, 120), s(d.email, 120), s(d.telefone, 30), s(d.cidade, 80), s(d.perfil, 30) || 'quero_alugar',
        s(d.mensagem, 2000), s(d.origem, 120), 'novo', nowISO());
    if (notificar) notificar(`📩 Closet Club: novo lead — ${s(d.nome, 60)} (${s(d.perfil, 30) || 'quero_alugar'}).`).catch(() => {});
    res.json({ ok: true, id });
  }));

  // ---- métricas públicas da home (prova social honesta: números reais) ----
  app.get('/closet/api/numeros', h(async (req, res) => {
    const q = (sql, ...p) => n((db.prepare(sql).get(...p) || {}).c, 0);
    res.json({
      pecas: q("SELECT COUNT(*) c FROM items WHERE status='ativo' AND moderacao='aprovado'"),
      looks: q("SELECT COUNT(*) c FROM looks WHERE status='ativo' AND moderacao='aprovado'"),
      cidades: q("SELECT COUNT(DISTINCT cidade) c FROM items WHERE status='ativo' AND moderacao='aprovado' AND cidade != ''"),
      alugueis: q("SELECT COUNT(*) c FROM bookings WHERE status='concluido'"),
      comissao_pct: Config.num('comissao_pct', 20),
    });
  }));
}

module.exports = { registrarRotasPublicas };
