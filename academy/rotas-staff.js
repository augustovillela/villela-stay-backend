// =====================================================================
// Villela Academy Marketplace — API de ADMINISTRAÇÃO DA PLATAFORMA
// (Portal Staff). Prefixo /staff/api/academy/*. requireAuth + requireAdmin
// (dono da plataforma). É por aqui que se concede o papel 'admin' da
// Academy a um usuário. Tudo auditado.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');

function registrarRotasStaff(app, { requireAuth, requireAdmin, jwtSecret }) {
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const quem = (req) => 'staff:' + ((req.user && (req.user.nome || req.user.email)) || 'plataforma');
  const A = [requireAuth, requireAdmin];
  const h = (fn) => (req, res) => { // captura erro síncrono E assíncrono → 400
    try { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); }
    catch (e) { res.status(400).json({ erro: e.message }); }
  };
  const aud = (req, acao, ent, id, det) => repo.Auditoria.registrar({ quem: quem(req), papel: 'staff', acao, entidade: ent, entidade_id: id, detalhe: det, ip: ipDe(req) });

  app.use('/staff/api/academy', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // visão geral da plataforma
  app.get('/staff/api/academy/dashboard', ...A, h((req, res) => {
    res.json({ resumo: repo.Dashboard.plataforma(), pendentes: repo.Perfis.pendentes(), config: { comissoes: repo.Config.obter('comissoes', {}) } });
  }));

  // usuários
  app.get('/staff/api/academy/usuarios', ...A, h((req, res) => res.json({ usuarios: repo.Usuarios.listar(req.query) })));
  app.post('/staff/api/academy/usuarios/:id/papeis', ...A, h((req, res) => {
    const { conceder, revogar } = req.body || {};
    let u;
    if (conceder) { u = repo.Usuarios.concederPapel(req.params.id, String(conceder)); aud(req, 'papel.conceder', 'users', u.id, String(conceder)); }
    if (revogar) { u = repo.Usuarios.revogarPapel(req.params.id, String(revogar)); aud(req, 'papel.revogar', 'users', u.id, String(revogar)); }
    if (!u) return res.status(400).json({ erro: 'Informe conceder ou revogar.' });
    res.json({ ok: true, usuario: repo.semSegredos(u) });
  }));
  app.post('/staff/api/academy/usuarios/:id/status', ...A, h((req, res) => {
    const u = repo.Usuarios.mudarStatus(req.params.id, String((req.body || {}).status || ''));
    aud(req, 'usuario.status', 'users', u.id, u.status);
    res.json({ ok: true, usuario: repo.semSegredos(u) });
  }));

  // aprovação de perfis (produtor/afiliado)
  app.get('/staff/api/academy/pendentes', ...A, h((req, res) => res.json(repo.Perfis.pendentes())));
  app.post('/staff/api/academy/perfis/:tipo/:userId/decidir', ...A, h((req, res) => {
    const { tipo, userId } = req.params;
    if (!['produtor', 'afiliado'].includes(tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
    const p = repo.Perfis.decidir(tipo, userId, String((req.body || {}).status || ''), (req.body || {}).motivo);
    aud(req, `perfil.${tipo}.${p.status}`, tipo === 'produtor' ? 'producer_profiles' : 'affiliate_profiles', userId, String((req.body || {}).motivo || ''));
    const com = require('./emails'); // F8: avisa o solicitante
    const alvo = repo.Usuarios.porId(userId);
    if (alvo) {
      com.Emails.perfilDecidido(alvo, tipo, p.status, (req.body || {}).motivo);
      com.Notificacoes.criar(alvo.id, `Cadastro de ${tipo}: ${p.status}`, p.status === 'aprovado' ? 'A nova aba já está no seu painel.' : String((req.body || {}).motivo || ''), '/academy/app');
    }
    res.json({ ok: true, perfil: { status: p.status } });
  }));

  // F8: log de comunicações (e-mail/webhook/interna) + disparo manual da rotina de abandono
  app.get('/staff/api/academy/comunicacoes-log', ...A, h((req, res) => {
    res.json({ eventos: require('./emails').Logs.listar(req.query.n) });
  }));
  app.post('/staff/api/academy/pedidos-abandonados/processar', ...A, h(async (req, res) => {
    const n = await require('./emails').processarPedidosAbandonados(require('./emails').base());
    res.json({ ok: true, lembretes_enviados: n });
  }));

  // config comercial (comissões padrão etc.)
  app.get('/staff/api/academy/config', ...A, h((req, res) => res.json({ comissoes: repo.Config.obter('comissoes', {}) })));
  app.post('/staff/api/academy/config', ...A, h((req, res) => {
    const { chave, valor } = req.body || {};
    if (!chave) return res.status(400).json({ erro: 'Informe chave e valor.' });
    repo.Config.salvar(String(chave), valor);
    aud(req, 'config.salvar', 'platform_settings', String(chave), '');
    res.json({ ok: true });
  }));

  // produtos (moderação da plataforma) e matrícula cortesia
  const ct = require('./repo-conteudo');
  app.get('/staff/api/academy/produtos', ...A, h((req, res) => res.json({ produtos: ct.Produtos.listarAdmin(req.query) })));
  app.post('/staff/api/academy/produtos/:id/decidir', ...A, h((req, res) => {
    const p = ct.Produtos.transicionar(req.params.id, String((req.body || {}).status || ''), { comoPapel: 'admin', motivo: (req.body || {}).motivo });
    aud(req, `produto.${p.status}`, 'products', p.id, String((req.body || {}).motivo || ''));
    res.json({ ok: true, produto: p });
  }));
  app.post('/staff/api/academy/produtos/:id/matricular', ...A, h((req, res) => {
    const id = ct.Matriculas.criar(req.params.id, String((req.body || {}).email || ''), quem(req), 'cortesia');
    aud(req, 'matricula.cortesia', 'enrollments', id, String((req.body || {}).email || ''));
    res.json({ ok: true, id });
  }));

  // ---- ACESSO DE CORTESIA / BETA (acesso vitalício a TUDO, sem pagamento; revogável) ----
  // Marketplace B2C: o acesso é por USUÁRIO — garante matrícula cortesia em todos
  // os produtos publicados (+ itens de clubes publicados) a partir de um e-mail.
  app.get('/staff/api/academy/cortesia', ...A, h((req, res) => {
    res.json({ acessos: ct.Cortesia.listar() });
  }));
  app.post('/staff/api/academy/cortesia', ...A, h((req, res) => {
    const b = req.body || {};
    if (!b.email || !String(b.email).includes('@')) return res.status(400).json({ erro: 'Informe o e-mail do testador.' });
    const r = ct.Cortesia.concederTotal({ nome: b.nome, email: b.email }, quem(req)); // seed_demo ignorado (B2C não tem tenant)
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const base = `${proto}://${req.get('host')}`;
    const token = jwt.sign({ tipo: 'academy-reset', uid: r.usuario.id }, jwtSecret, { expiresIn: '30d' });
    aud(req, 'cortesia.conceder', 'enrollments', r.usuario.id, `${r.usuario.email} — ${r.produtos_liberados} produto(s)`);
    const acesso = {
      email: r.usuario.email,
      definir_senha_url: `${base}/academy/redefinir-senha?token=${token}`,
      painel_url: `${base}/academy/app`,
      validade_link: '30 dias',
      produtos_liberados: r.produtos_liberados,
    };
    if (r.senha_temporaria) acesso.senha_temporaria = r.senha_temporaria; // conta nova: fallback se não usar o link
    res.json({ ok: true, usuario: { id: r.usuario.id, nome: r.usuario.nome, email: r.usuario.email }, acesso });
  }));
  app.post('/staff/api/academy/cortesia/:userId/revogar', ...A, h((req, res) => {
    const r = ct.Cortesia.revogarTotal(req.params.userId);
    aud(req, 'cortesia.revogar', 'enrollments', req.params.userId, `${r.revogadas} matrícula(s)`);
    res.json({ ok: true });
  }));
  app.post('/staff/api/academy/cortesia/:userId/reativar', ...A, h((req, res) => {
    const r = ct.Cortesia.reativarTotal(req.params.userId, quem(req));
    aud(req, 'cortesia.reativar', 'enrollments', req.params.userId, `${r.produtos_liberados} produto(s)`);
    res.json({ ok: true });
  }));

  // denúncias e avaliações (FASE 3)
  app.get('/staff/api/academy/denuncias', ...A, h((req, res) => res.json({ denuncias: ct.Denuncias.abertas() })));
  app.post('/staff/api/academy/denuncias/:id/resolver', ...A, h((req, res) => {
    ct.Denuncias.resolver(req.params.id, req.body || {});
    aud(req, 'denuncia.resolver', 'moderation_reports', req.params.id, String((req.body || {}).status || ''));
    res.json({ ok: true });
  }));
  app.get('/staff/api/academy/avaliacoes', ...A, h((req, res) => res.json({ avaliacoes: ct.Reviews.listarAdmin(req.query.n) })));
  app.post('/staff/api/academy/avaliacoes/:id/moderar', ...A, h((req, res) => {
    ct.Reviews.moderar(req.params.id, String((req.body || {}).status || ''));
    aud(req, 'avaliacao.moderar', 'reviews', req.params.id, String((req.body || {}).status || ''));
    res.json({ ok: true });
  }));

  // leads / auditoria
  app.get('/staff/api/academy/leads', ...A, h((req, res) => res.json({ leads: repo.Leads.listar(req.query.n) })));
  app.post('/staff/api/academy/leads/:id/status', ...A, h((req, res) => { repo.Leads.status(req.params.id, (req.body || {}).status); res.json({ ok: true }); }));
  app.get('/staff/api/academy/auditoria', ...A, h((req, res) => res.json({ eventos: repo.Auditoria.listar(req.query.n) })));
}

module.exports = { registrarRotasStaff };
