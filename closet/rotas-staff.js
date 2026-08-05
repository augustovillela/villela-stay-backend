// =====================================================================
// Closet Club — ADMINISTRAÇÃO DA PLATAFORMA (Portal Staff).
// Prefixo /staff/api/closet/*, protegido por requireAuth + requireAdmin do
// Portal Staff. Aqui mora o que só a plataforma pode fazer: moderação,
// fraude, comissão, disputas, repasses, cupons, parceiros e LGPD.
// =====================================================================
'use strict';
const repo = require('./repo');
const billing = require('./billing');
const ia = require('./ia');
const { Bookings, Payouts, Reviews } = require('./bookings');
const { db, nowISO, novoId, hojeISO, j } = require('./db');
const { Users, Items, Looks, Config, Planos, Cupons, Auditoria, s, n, cent } = repo;

function registrarRotasStaff(app, { requireAuth, requireAdmin }) {
  const A = [requireAuth, requireAdmin];
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));
  const quem = (req) => (req.user && (req.user.nome || req.user.email)) || 'plataforma';
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const aud = (req, acao, ent, id, det) => Auditoria.registrar({ quem: quem(req), acao, entidade: ent, entidade_id: id, detalhe: det, ip: ipDe(req) });

  app.use('/staff/api/closet', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---------------- visão geral ----------------
  app.get('/staff/api/closet/dashboard', ...A, h((req, res) => {
    const c = (sql, ...p) => n((db.prepare(sql).get(...p) || {}).c, 0);
    const fin = billing.financeiroPlataforma({});
    res.json({
      usuarios: { total: c('SELECT COUNT(*) c FROM users'), ativos: c("SELECT COUNT(*) c FROM users WHERE status='ativo'"), premium: c("SELECT COUNT(*) c FROM users WHERE plano='premium'"), bloqueados: c("SELECT COUNT(*) c FROM users WHERE status='bloqueado'") },
      acervo: {
        pecas: c("SELECT COUNT(*) c FROM items WHERE status='ativo' AND moderacao='aprovado'"),
        moderacao_pendente: c("SELECT COUNT(*) c FROM items WHERE moderacao='pendente' AND status != 'rascunho'"),
        looks: c("SELECT COUNT(*) c FROM looks WHERE status='ativo' AND moderacao='aprovado'"),
        looks_pendentes: c("SELECT COUNT(*) c FROM looks WHERE moderacao='pendente' AND status != 'rascunho'"),
      },
      reservas: {
        abertas: c(`SELECT COUNT(*) c FROM bookings WHERE status IN ('pago_bloqueado','confirmado','retirado','devolvido')`),
        aguardando_confirmacao: c("SELECT COUNT(*) c FROM bookings WHERE status='pago_bloqueado'"),
        concluidas: c("SELECT COUNT(*) c FROM bookings WHERE status='concluido'"),
        em_disputa: c("SELECT COUNT(*) c FROM bookings WHERE status='em_disputa'"),
        mes: c("SELECT COUNT(*) c FROM bookings WHERE substr(criado_em,1,7) = ?", new Date().toISOString().slice(0, 7)),
      },
      financeiro: fin,
      leads: c("SELECT COUNT(*) c FROM leads WHERE status='novo'"),
      config: Config.todos(),
      planos: Planos.listar({ incluirInativos: true }),
    });
  }));

  // ---------------- configuração da plataforma (comissão, prazos, política) ----------------
  app.get('/staff/api/closet/config', ...A, h((req, res) => res.json({ config: Config.todos() })));
  app.patch('/staff/api/closet/config', ...A, h((req, res) => {
    const d = req.body || {};
    for (const [k, v] of Object.entries(d)) Config.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
    aud(req, 'config.editar', 'config', '', Object.keys(d).join(','));
    res.json({ ok: true, config: Config.todos() });
  }));

  app.patch('/staff/api/closet/planos/:id', ...A, h((req, res) => {
    const p = Planos.atualizar(req.params.id, req.body || {});
    aud(req, 'plano.editar', 'plans', req.params.id, p.slug);
    res.json({ ok: true, plano: p });
  }));

  // ---------------- usuários ----------------
  app.get('/staff/api/closet/usuarios', ...A, h((req, res) => res.json({ usuarios: Users.listar(req.query || {}) })));
  app.get('/staff/api/closet/usuarios/:id', ...A, h((req, res) => {
    const u = Users.obter(req.params.id);
    if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json({
      usuario: u,
      pecas: Items.doOwner(u.id),
      reservas_cliente: Bookings.doCliente(u.id),
      reservas_dono: Bookings.doOwner(u.id),
      repasses: Payouts.doOwner(u.id),
      saldo: Payouts.saldo(u.id),
    });
  }));
  app.post('/staff/api/closet/usuarios/:id/status', ...A, h((req, res) => {
    const d = req.body || {};
    const u = Users.mudarStatus(req.params.id, s(d.status, 20), quem(req), s(d.motivo, 300));
    aud(req, 'usuario.status', 'users', req.params.id, s(d.status, 20));
    res.json({ ok: true, usuario: u });
  }));
  app.post('/staff/api/closet/usuarios/:id/papel', ...A, h((req, res) => {
    const u = Users.papel(req.params.id, s((req.body || {}).papel, 20));
    aud(req, 'usuario.papel', 'users', req.params.id, u.papel);
    res.json({ ok: true, usuario: u });
  }));
  app.post('/staff/api/closet/usuarios/:id/verificar', ...A, h((req, res) => {
    const u = Users.verificar(req.params.id, (req.body || {}).aprovado !== false, quem(req));
    aud(req, 'usuario.verificar', 'users', req.params.id, String(u.verificado));
    res.json({ ok: true, usuario: u });
  }));
  app.post('/staff/api/closet/usuarios/:id/premium', ...A, h((req, res) => {
    const ate = billing.ativarPremium(req.params.id, { dias: n((req.body || {}).dias, 30), origem: 'cortesia-staff' });
    aud(req, 'usuario.premium', 'users', req.params.id, String(ate));
    res.json({ ok: true, premium_ate: ate });
  }));
  // LGPD — exclusão a pedido do titular, feita pela plataforma
  app.post('/staff/api/closet/usuarios/:id/excluir', ...A, h((req, res) => {
    const r = Users.anonimizar(req.params.id, quem(req));
    aud(req, 'lgpd.excluir', 'users', req.params.id, 'anonimização');
    res.json(r);
  }));

  // ---------------- moderação do acervo ----------------
  app.get('/staff/api/closet/moderacao', ...A, h((req, res) => {
    const pecas = db.prepare("SELECT * FROM items WHERE moderacao='pendente' AND status != 'rascunho' ORDER BY criado_em LIMIT 100").all()
      .map((i) => {
        const m = repo.mapItem(i);
        return { ...m, proprietario: Users.publico(i.owner_id), qualidade_fotos: ia.qualidadeFotos(m.fotos) };
      });
    const looks = db.prepare("SELECT id FROM looks WHERE moderacao='pendente' AND status != 'rascunho' ORDER BY criado_em LIMIT 100").all()
      .map((l) => Looks.obter(l.id));
    res.json({ pecas, looks });
  }));
  app.post('/staff/api/closet/pecas/:id/moderar', ...A, h((req, res) => {
    const d = req.body || {};
    const i = Items.moderar(req.params.id, d.aprovado !== false, s(d.nota, 400), quem(req));
    repo.Notificacoes.criar(i.owner_id, {
      titulo: d.aprovado !== false ? '✅ Anúncio aprovado' : '⚠️ Anúncio precisa de ajuste',
      texto: d.aprovado !== false ? `"${i.titulo}" já está na vitrine.` : `"${i.titulo}": ${s(d.nota, 200)}`,
      url: '/closet/app#pecas',
    });
    aud(req, 'peca.moderar', 'items', i.id, d.aprovado !== false ? 'aprovado' : 'reprovado');
    res.json({ ok: true, peca: i });
  }));
  app.post('/staff/api/closet/looks/:id/moderar', ...A, h((req, res) => {
    const l = Looks.moderar(req.params.id, (req.body || {}).aprovado !== false, quem(req));
    aud(req, 'look.moderar', 'looks', req.params.id, l.moderacao);
    res.json({ ok: true, look: l });
  }));
  app.post('/staff/api/closet/pecas/:id/destacar', ...A, h((req, res) => {
    const i = Items.destacar(req.params.id, n((req.body || {}).dias, 7), quem(req));
    aud(req, 'peca.destacar', 'items', req.params.id, i.destaque_ate);
    res.json({ ok: true, peca: i });
  }));
  app.post('/staff/api/closet/avaliacoes/:id/moderar', ...A, h((req, res) => {
    aud(req, 'avaliacao.moderar', 'reviews', req.params.id, String((req.body || {}).publicada));
    res.json(Reviews.moderar(req.params.id, (req.body || {}).publicada !== false, quem(req)));
  }));

  // ---------------- reservas e disputas ----------------
  app.get('/staff/api/closet/reservas', ...A, h((req, res) => {
    const st = s(req.query.status, 30);
    const q = st ? 'SELECT * FROM bookings WHERE status = ? ORDER BY criado_em DESC LIMIT 200' : 'SELECT * FROM bookings ORDER BY criado_em DESC LIMIT 200';
    const linhas = st ? db.prepare(q).all(st) : db.prepare(q).all();
    res.json({ reservas: linhas.map((b) => Bookings.obter(b.id, { detalhe: false })), status: repo.STATUS_BOOKING });
  }));
  app.get('/staff/api/closet/reservas/:id', ...A, h((req, res) => {
    const b = Bookings.obter(req.params.id);
    if (!b) return res.status(404).json({ erro: 'Reserva não encontrada.' });
    res.json({ reserva: b });
  }));
  // confirmação manual de pagamento (modo sem PSP, ou Pix recebido fora da plataforma)
  app.post('/staff/api/closet/reservas/:id/marcar-pago', ...A, h((req, res) => {
    aud(req, 'reserva.marcar-pago', 'bookings', req.params.id, 'manual');
    res.json(Bookings.marcarPago(req.params.id, { mp_payment_id: s((req.body || {}).mp_payment_id, 60) }));
  }));
  app.post('/staff/api/closet/reservas/:id/cancelar', ...A, h((req, res) => {
    aud(req, 'reserva.cancelar', 'bookings', req.params.id, s((req.body || {}).motivo, 200));
    res.json(Bookings.cancelar(req.params.id, '', s((req.body || {}).motivo, 300) || 'cancelada pela plataforma'));
  }));
  app.post('/staff/api/closet/reservas/:id/concluir', ...A, h((req, res) => {
    aud(req, 'reserva.concluir', 'bookings', req.params.id, 'manual');
    res.json(Bookings.concluir(req.params.id, { quem: quem(req), forcar: true }));
  }));

  app.get('/staff/api/closet/disputas', ...A, h((req, res) => res.json({ disputas: Bookings.listarDisputas(req.query || {}) })));
  app.post('/staff/api/closet/disputas/:id/resolver', ...A, h((req, res) => {
    const d = req.body || {};
    const r = Bookings.resolverDisputa(req.params.id, {
      decisao: s(d.decisao, 2000), valor_retido_centavos: cent(d.valor_retido_centavos),
      favor: s(d.favor, 20) === 'cliente' ? 'cliente' : 'proprietario', quem: quem(req),
    });
    aud(req, 'disputa.resolver', 'disputes', req.params.id, r.favor);
    res.json(r);
  }));

  // ---------------- repasses (fila de Pix a enviar) ----------------
  app.get('/staff/api/closet/repasses', ...A, h((req, res) => res.json({
    liberados: Payouts.listar({ status: 'liberado' }),
    retidos: Payouts.listar({ status: 'retido' }),
    pagos: Payouts.listar({ status: 'pago' }).slice(0, 50),
  })));
  app.post('/staff/api/closet/repasses/:id/pagar', ...A, h(async (req, res) => {
    const r = await billing.pagarRepasse(req.params.id, { quem: quem(req) });
    aud(req, 'repasse.pagar', 'payouts', req.params.id, r.manual ? 'manual' : 'automático');
    res.json(r);
  }));
  app.post('/staff/api/closet/repasses/:id/marcar-pago', ...A, h((req, res) => {
    aud(req, 'repasse.marcar-pago', 'payouts', req.params.id, 'manual');
    res.json(Payouts.marcarPago(req.params.id, { quem: quem(req) }));
  }));

  // ---------------- financeiro ----------------
  app.get('/staff/api/closet/financeiro', ...A, h((req, res) => res.json(billing.financeiroPlataforma({ competencia: s(req.query.competencia, 7) }))));
  app.get('/staff/api/closet/ledger', ...A, h((req, res) => {
    const comp = s(req.query.competencia, 7) || new Date().toISOString().slice(0, 7);
    res.json({ competencia: comp, lancamentos: db.prepare('SELECT * FROM ledger WHERE competencia = ? ORDER BY criado_em DESC LIMIT 500').all(comp) });
  }));

  // ---------------- cupons e parceiros ----------------
  app.get('/staff/api/closet/cupons', ...A, h((req, res) => res.json({ cupons: Cupons.listar() })));
  app.post('/staff/api/closet/cupons', ...A, h((req, res) => {
    const c = Cupons.criar(req.body || {});
    aud(req, 'cupom.salvar', 'coupons', c.codigo, `${c.tipo} ${c.valor}`);
    res.json({ ok: true, cupom: c });
  }));

  app.get('/staff/api/closet/parceiros', ...A, h((req, res) => {
    const parceiros = db.prepare('SELECT * FROM partners ORDER BY criado_em DESC LIMIT 200').all();
    return res.json({
      parceiros: parceiros.map((p) => ({ ...p, servicos: db.prepare('SELECT * FROM partner_services WHERE partner_id = ?').all(p.id) })),
    });
  }));
  app.post('/staff/api/closet/parceiros', ...A, h((req, res) => {
    const d = req.body || {};
    const id = novoId();
    db.prepare('INSERT INTO partners (id, user_id, nome, tipo, descricao, cidade, uf, telefone, email, comissao_pct, status, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, s(d.user_id, 40), s(d.nome, 140), s(d.tipo, 30) || 'lavanderia', s(d.descricao, 1000), s(d.cidade, 80),
        s(d.uf, 2).toUpperCase(), s(d.telefone, 30), s(d.email, 120), n(d.comissao_pct, 15), 'ativo', nowISO());
    for (const sv of (Array.isArray(d.servicos) ? d.servicos : [])) {
      db.prepare('INSERT INTO partner_services (id, partner_id, nome, tipo, preco_centavos, descricao, ativo, criado_em) VALUES (?,?,?,?,?,?,1,?)')
        .run(novoId(), id, s(sv.nome, 140), s(sv.tipo, 30) || s(d.tipo, 30), cent(sv.preco_centavos), s(sv.descricao, 500), nowISO());
    }
    aud(req, 'parceiro.criar', 'partners', id, s(d.nome, 60));
    res.json({ ok: true, id });
  }));

  // ---------------- leads da landing ----------------
  app.get('/staff/api/closet/leads', ...A, h((req, res) => res.json({ leads: db.prepare('SELECT * FROM leads ORDER BY criado_em DESC LIMIT 300').all() })));
  app.patch('/staff/api/closet/leads/:id', ...A, h((req, res) => {
    db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(s((req.body || {}).status, 30) || 'novo', req.params.id);
    res.json({ ok: true });
  }));

  // ---------------- ONDA 2: blog / conteúdo ----------------
  app.get('/staff/api/closet/posts', ...A, h((req, res) => {
    const { Posts } = require('./conteudo');
    res.json({ posts: Posts.todos(), categorias: Posts.CATEGORIAS, ocasioes: repo.OCASIOES });
  }));
  app.post('/staff/api/closet/posts', ...A, h((req, res) => {
    const p = require('./conteudo').Posts.salvar(req.body || {}, quem(req));
    aud(req, 'post.salvar', 'posts', p.id, p.status);
    res.json({ ok: true, post: p });
  }));
  app.delete('/staff/api/closet/posts/:id', ...A, h((req, res) => {
    aud(req, 'post.remover', 'posts', req.params.id, '');
    res.json(require('./conteudo').Posts.remover(req.params.id));
  }));

  // ---------------- ONDA 2: parceiros e entrega ----------------
  app.get('/staff/api/closet/parceiros', ...A, h((req, res) => {
    const { Parceiros, Entrega } = require('./parceiros');
    res.json({
      parceiros: Parceiros.listar(req.query || {}),
      resumo: Parceiros.resumo(),
      tipos: Parceiros.TIPOS,
      zonas: Entrega.listar({}),
    });
  }));
  app.post('/staff/api/closet/parceiros', ...A, h((req, res) => {
    const p = require('./parceiros').Parceiros.candidatar(req.body || {}, { userId: s((req.body || {}).user_id, 40) });
    aud(req, 'parceiro.criar', 'partners', p.id, p.nome);
    res.json({ ok: true, parceiro: p });
  }));
  app.post('/staff/api/closet/parceiros/:id/aprovar', ...A, h((req, res) => {
    const p = require('./parceiros').Parceiros.aprovar(req.params.id, (req.body || {}).aprovado !== false, quem(req));
    aud(req, 'parceiro.aprovar', 'partners', req.params.id, p.status);
    res.json({ ok: true, parceiro: p });
  }));
  app.post('/staff/api/closet/zonas', ...A, h((req, res) => {
    const z = require('./parceiros').Entrega.salvar(req.body || {});
    aud(req, 'zona.salvar', 'zonas_entrega', z.id, `${z.cidade}/${z.bairro || 'toda a cidade'}`);
    res.json({ ok: true, zona: z });
  }));
  app.delete('/staff/api/closet/zonas/:id', ...A, h((req, res) => {
    aud(req, 'zona.remover', 'zonas_entrega', req.params.id, '');
    res.json(require('./parceiros').Entrega.remover(req.params.id));
  }));

  // ---------------- ONDA 2: indicação e créditos ----------------
  app.get('/staff/api/closet/crescimento', ...A, h((req, res) => {
    const { Indicacoes } = require('./crescimento');
    res.json({
      indicacoes: Indicacoes.resumo(),
      ultimos: db.prepare(`SELECT r.*, p.nome AS padrinho, c.nome AS convidado FROM referrals r
        LEFT JOIN users p ON p.id = r.padrinho_id LEFT JOIN users c ON c.id = r.convidado_id
        ORDER BY r.criado_em DESC LIMIT 50`).all(),
      creditos_abertos_centavos: n((db.prepare("SELECT COALESCE(SUM(valor_centavos),0) c FROM credits WHERE expira_em = '' OR expira_em >= ?").get(nowISO()) || {}).c, 0),
      api: {
        chaves_ativas: n((db.prepare('SELECT COUNT(*) c FROM api_keys WHERE ativa = 1').get() || {}).c, 0),
        chamadas: n((db.prepare('SELECT COALESCE(SUM(chamadas),0) c FROM api_keys').get() || {}).c, 0),
      },
      fotos: db.prepare("SELECT COUNT(*) c, COALESCE(SUM(bytes),0) b, storage FROM uploads GROUP BY storage").all(),
    });
  }));
  app.post('/staff/api/closet/usuarios/:id/credito', ...A, h((req, res) => {
    const d = req.body || {};
    const id = require('./crescimento').Creditos.conceder(req.params.id, cent(d.valor_centavos), {
      tipo: s(d.tipo, 20) || 'cortesia', descricao: s(d.descricao, 300) || 'Crédito concedido pela plataforma',
    });
    aud(req, 'credito.conceder', 'credits', String(id), String(cent(d.valor_centavos)));
    res.json({ ok: true, id });
  }));

  // ---------------- ONDA 3: campanhas patrocinadas ----------------
  app.get('/staff/api/closet/campanhas', ...A, h((req, res) => {
    const { Campanhas } = require('./campanhas');
    res.json({ campanhas: Campanhas.listar(req.query || {}), resumo: Campanhas.resumo() });
  }));
  app.post('/staff/api/closet/campanhas/:id/ativar', ...A, h((req, res) => {
    aud(req, 'campanha.ativar', 'campanhas', req.params.id, 'manual');
    res.json(require('./campanhas').Campanhas.ativar(req.params.id, { quem: quem(req) }));
  }));

  // ---------------- auditoria e rotina ----------------
  app.get('/staff/api/closet/auditoria', ...A, h((req, res) => res.json({ auditoria: Auditoria.listar({ limite: n(req.query.limite, 200) }) })));
  app.get('/staff/api/closet/eventos', ...A, h((req, res) => res.json({
    eventos: db.prepare('SELECT * FROM platform_events ORDER BY quando DESC LIMIT 200').all().map((e) => ({ ...e, dados: j.parse(e.dados, {}) })),
  })));
  app.post('/staff/api/closet/rodar-ciclo', ...A, h((req, res) => {
    aud(req, 'ciclo.manual', '', '', '');
    res.json(billing.cicloDiario());
  }));
}

module.exports = { registrarRotasStaff };
