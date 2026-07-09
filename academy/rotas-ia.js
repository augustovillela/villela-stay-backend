// =====================================================================
// Villela Academy — rotas de IA (FASE 9). Produtor: estruturar curso
// (+aplicar), copywriter, pedagógico. Aluno: suporte (escopo = acesso).
// Admin: relatório executivo. Staff: logs/custo. Saída da IA é SUGESTÃO
// — aplicar é sempre uma ação explícita do humano.
// =====================================================================
'use strict';
const repo = require('./repo');
const ct = require('./repo-conteudo');
const ia = require('./ia');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const h = (fn) => (req, res) => {
  try { Promise.resolve(fn(req, res)).catch(e => res.status(e.status || 400).json({ erro: e.message })); }
  catch (e) { res.status(e.status || 400).json({ erro: e.message }); }
};

function registrarRotasIA(app, { requireUsuario, requirePapel }) {
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const aud = (req, acao, id, det) => repo.Auditoria.registrar({
    quem: req.usuario.id, acao, entidade: 'ia', entidade_id: s(id, 40), detalhe: det, ip: ipDe(req),
  });
  const P = [requireUsuario, requirePapel('produtor')];
  const ADM = [requireUsuario, requirePapel('admin')];
  const doDono = (req) => ct.Produtos.obterDoDono(s((req.body || {}).product_id, 40), req.usuario.id);

  app.get('/academy/api/ia/status', requireUsuario, h((req, res) => {
    res.json({ ativo: ia.ativo(), limite_dia: ia.limiteDia(), usadas_hoje: ia.usadasHoje(req.usuario.id) });
  }));

  // ---- produtor ----
  app.post('/academy/api/ia/produtor/estruturar', ...P, h(async (req, res) => {
    const p = doDono(req);
    const r = await ia.Agentes.estruturar(req.usuario.id, p, req.body || {});
    aud(req, 'ia.estruturar', p.id, '');
    res.json({ ok: true, estrutura: r });
  }));
  // aplicar a estrutura sugerida: cria módulos/aulas RASCUNHO (objetivo vira texto da aula)
  app.post('/academy/api/ia/produtor/estruturar/aplicar', ...P, h((req, res) => {
    const p = doDono(req);
    const est = (req.body || {}).estrutura || {};
    let modulos = 0, aulas = 0;
    for (const m of (Array.isArray(est.modulos) ? est.modulos : []).slice(0, 8)) {
      const mid = ct.Conteudo.addModulo(p.id, s(m.titulo, 160) || 'Módulo');
      modulos++;
      for (const a of (Array.isArray(m.aulas) ? m.aulas : []).slice(0, 8)) {
        ct.Conteudo.addAula(p.id, mid, {
          titulo: s(a.titulo, 160) || 'Aula',
          tipo: ['video', 'texto', 'pdf', 'audio', 'arquivo', 'link'].includes(a.tipo) ? a.tipo : 'texto',
          conteudo: a.objetivo ? `Objetivo: ${s(a.objetivo, 500)}\n\n(Conteúdo a produzir)` : '',
        });
        aulas++;
      }
    }
    aud(req, 'ia.estruturar.aplicar', p.id, `${modulos} módulos, ${aulas} aulas`);
    res.json({ ok: true, modulos, aulas });
  }));
  app.post('/academy/api/ia/produtor/copy', ...P, h(async (req, res) => {
    const p = doDono(req);
    const r = await ia.Agentes.copy(req.usuario.id, p);
    aud(req, 'ia.copy', p.id, '');
    res.json({ ok: true, secoes: r });
  }));
  app.post('/academy/api/ia/produtor/pedagogico', ...P, h(async (req, res) => {
    const p = doDono(req);
    const r = await ia.Agentes.pedagogico(req.usuario.id, p);
    aud(req, 'ia.pedagogico', p.id, '');
    res.json({ ok: true, ...r });
  }));

  // ---- aluno: suporte com escopo = conteúdo a que ele tem acesso ----
  app.post('/academy/api/ia/aluno/perguntar', requireUsuario, requirePapel('aluno'), h(async (req, res) => {
    const p = ct.Produtos.obter(s((req.body || {}).product_id, 40));
    if (!p || !ct.temAcesso(req.usuario.id, p.id)) return res.status(404).json({ erro: 'Você não tem acesso a este produto.' });
    const r = await ia.Agentes.suporte(req.usuario.id, p, (req.body || {}).pergunta);
    aud(req, 'ia.suporte', p.id, s((req.body || {}).pergunta, 120));
    res.json({ ok: true, ...r });
  }));

  // ---- admin ----
  app.post('/academy/api/ia/admin/relatorio', ...ADM, h(async (req, res) => {
    const r = await ia.Agentes.relatorio(req.usuario.id);
    aud(req, 'ia.relatorio', '', '');
    res.json({ ok: true, ...r });
  }));
  app.get('/academy/api/admin/ia-logs', ...ADM, h((req, res) => {
    res.json({ eventos: ia.Logs.listar(req.query.n), ...ia.Logs.custoTotal() });
  }));
}

function registrarRotasIAStaff(app, { requireAuth, requireAdmin }) {
  const A = [requireAuth, requireAdmin];
  app.get('/staff/api/academy/ia-logs', ...A, h((req, res) => {
    res.json({ eventos: ia.Logs.listar(req.query.n), ...ia.Logs.custoTotal() });
  }));
}

module.exports = { registrarRotasIA, registrarRotasIAStaff };
