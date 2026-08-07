// =====================================================================
// Villela Kids — administração na aba 🧒 do Portal Staff
// (/staff/api/kids/*). Leitura com requireAuth; ação que altera estado
// (bloquear conta, despublicar missão) exige requireAdmin e audita.
// O staff enxerga progresso e criações para acompanhar o beta — dado de
// criança continua mínimo por construção (apelido + faixa + emoji).
// =====================================================================
'use strict';
const { db } = require('./db');
const repo = require('./repo');
const { Users, Missoes, Auditoria } = repo;

function registrarRotasStaff(app, { requireAuth, requireAdmin }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));
  const quem = (req) => (req.user && (req.user.email || req.user.nome)) || 'staff';
  const B = '/staff/api/kids';
  app.use(B, (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  app.get(B + '/dashboard', requireAuth, h(async (req, res) => {
    const q1 = (sql) => db.prepare(sql).get();
    res.json({
      familias: q1("SELECT COUNT(*) AS c FROM users WHERE status = 'ativo'").c,
      criancas: q1("SELECT COUNT(*) AS c FROM children WHERE status = 'ativo'").c,
      missoes_iniciadas: q1('SELECT COUNT(*) AS c FROM child_missions').c,
      missoes_concluidas: q1("SELECT COUNT(*) AS c FROM child_missions WHERE status = 'concluida'").c,
      criacoes: q1('SELECT COUNT(*) AS c FROM portfolio').c,
      // funil por missão: onde o interesse cai é o dado que decide a fase 2
      funil: db.prepare(`SELECT m.id, m.ordem, m.emoji, m.titulo,
          (SELECT COUNT(*) FROM child_missions cm WHERE cm.mission_id = m.id) AS iniciadas,
          (SELECT COUNT(*) FROM child_missions cm WHERE cm.mission_id = m.id AND cm.status = 'concluida') AS concluidas
        FROM missions m ORDER BY m.ordem`).all(),
      ultimas_criacoes: db.prepare(`SELECT p.id, p.titulo, p.criado_em, m.titulo AS missao, c.apelido, c.avatar
        FROM portfolio p LEFT JOIN missions m ON m.id = p.mission_id JOIN children c ON c.id = p.child_id
        ORDER BY p.criado_em DESC LIMIT 12`).all(),
    });
  }));

  app.get(B + '/familias', requireAuth, h(async (req, res) => {
    res.json({ familias: Users.listar({ busca: String(req.query.busca || ''), limite: 200 }) });
  }));

  app.get(B + '/missoes', requireAuth, h(async (req, res) => {
    res.json({ missoes: Missoes.catalogo({ incluirInativas: true }) });
  }));

  app.patch(B + '/missoes/:id', requireAuth, requireAdmin, h(async (req, res) => {
    res.json({ ok: true, missao: Missoes.ativar(req.params.id, !!(req.body || {}).ativa, quem(req)) });
  }));

  app.post(B + '/familias/:id/bloquear', requireAuth, requireAdmin, h(async (req, res) => {
    Users.bloquear(req.params.id, (req.body || {}).motivo, quem(req));
    res.json({ ok: true });
  }));
  app.post(B + '/familias/:id/reativar', requireAuth, requireAdmin, h(async (req, res) => {
    Users.reativar(req.params.id, quem(req));
    res.json({ ok: true });
  }));

  app.get(B + '/auditoria', requireAuth, h(async (req, res) => res.json({ auditoria: Auditoria.listar() })));
}

module.exports = { registrarRotasStaff };
