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
const carteira = require('./carteira-ia');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const h = (fn) => (req, res) => {
  // `extra` leva o orcamento da IA (402): a tela precisa do valor para pedir o aceite
  try { Promise.resolve(fn(req, res)).catch(e => res.status(e.status || 400).json({ erro: e.message, ...(e.extra || {}) })); }
  catch (e) { res.status(e.status || 400).json({ erro: e.message, ...(e.extra || {}) }); }
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

  // ---- CARTEIRA DE IA: saldo, extrato e recarga (carteira-ia.js) ----
  // `product_id` diz como ESTE curso seria cobrado agora (franquia de quem comprou antes, ou saldo)
  app.get('/academy/api/ia/carteira', requireUsuario, h((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const pid = s(req.query.product_id, 40);
    res.json({ ...carteira.carteiraDoUsuario(req.usuario), limite_dia: ia.limiteDia(), usadas_hoje: ia.usadasHoje(req.usuario.id),
      cobranca_agora: ia.comoCobrar(req.usuario.id, pid), franquia_neste_curso: pid ? carteira.temFranquia(req.usuario.id, pid) : false });
  }));
  app.post('/academy/api/ia/carteira/recarga', requireUsuario, h(async (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const r = await carteira.criarRecarga(req.usuario, (req.body || {}).valor_centavos, `${proto}://${req.get('host')}`);
    aud(req, 'ia.recarga.criar', r.recarga_id, String((req.body || {}).valor_centavos));
    res.json({ ok: true, ...r });
  }));
  app.post('/academy/api/ia/carteira/recarga/:id/conferir', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, ...(await carteira.conferirRecarga(req.usuario, req.params.id)) });
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
  // ---- carteira de IA: visão do dono e crédito manual ----
  // Crédito é dinheiro: só SESSÃO de admin do portal. A chave de publicação não entra aqui
  // de propósito — quem automatiza não pode se dar saldo.
  app.get('/staff/api/academy/ia/carteiras', ...A, h((req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(carteira.painelStaff()); }));
  app.post('/staff/api/academy/ia/creditos', ...A, h((req, res) => {
    const b = req.body || {};
    const quem = 'staff:' + ((req.user && (req.user.nome || req.user.email)) || 'admin');
    const r = carteira.creditar({ email: b.email, valor_centavos: b.valor_centavos, motivo: b.motivo, tipo: b.tipo === 'ajuste' ? 'ajuste' : 'cortesia', quem });
    repo.Auditoria.registrar({ quem, acao: 'ia.credito.' + (b.tipo === 'ajuste' ? 'ajuste' : 'cortesia'), entidade: 'ia_movimentos', entidade_id: r.user_id,
      detalhe: `${r.email}: R$ ${(Math.round(Number(b.valor_centavos)) / 100).toFixed(2)} — ${s(b.motivo, 200)}`, ip: '' });
    res.json({ ok: true, ...r });
  }));
}

module.exports = { registrarRotasIA, registrarRotasIAStaff };
