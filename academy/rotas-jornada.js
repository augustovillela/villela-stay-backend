// =====================================================================
// Villela Academy — rotas da JORNADA (fases 2 e 3): diagnóstico e teste
// final, XP/níveis/selos, Villela Lab, desafio, simulações, recursos e o
// apoio de IA às ferramentas. Aluno: /academy/api/aluno/cursos/:id/...
// Importação e publicação: /staff/api/academy/jornada/... (PUBLISH_KEY ou admin).
// =====================================================================
'use strict';
const repo = require('./repo');
const ct = require('./repo-conteudo');
const ia = require('./ia');
const jr = require('./jornada');
const imp = require('./importacao');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const h = (fn) => (req, res) => {
  try { Promise.resolve(fn(req, res)).catch(e => res.status(e.status || 400).json({ erro: e.message })); }
  catch (e) { res.status(e.status || 400).json({ erro: e.message }); }
};
const escHtml = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function registrarRotasJornada(app, { requireUsuario, requirePapel }) {
  const AL = [requireUsuario, requirePapel('aluno')];
  const produto = (req) => {
    const p = ct.Produtos.obter(s(req.params.productId, 40));
    if (!p || ['suspenso', 'removido'].includes(p.status)) { const e = new Error('Curso não encontrado.'); e.status = 404; throw e; }
    return p;
  };
  const semCache = (res) => res.setHeader('Cache-Control', 'no-store');
  const base = '/academy/api/aluno/cursos/:productId';

  // painel: nível, XP, selos, medalhas e o que existe no curso
  app.get(`${base}/jornada`, ...AL, h((req, res) => { semCache(res); res.json(jr.painel(req.usuario, produto(req))); }));

  // ---- diagnóstico e teste final ----
  app.get(`${base}/avaliacao`, ...AL, h((req, res) => {
    const p = produto(req);
    const c = jr.contexto(req.usuario, p);
    if (!c.acesso) return res.status(403).json({ erro: 'A avaliação é para quem tem acesso ao curso.' });
    semCache(res);
    res.json({ estado: jr.estadoAvaliacao(req.usuario, p, c) });
  }));
  app.get(`${base}/avaliacao/:momento`, ...AL, h((req, res) => { semCache(res); res.json(jr.avaliacaoParaAluno(req.usuario, produto(req), s(req.params.momento, 20))); }));
  app.post(`${base}/avaliacao/:momento`, ...AL, h((req, res) => {
    res.json({ ok: true, ...jr.corrigirAvaliacao(req.usuario, produto(req), s(req.params.momento, 20), (req.body || {}).respostas) });
  }));

  // ---- Villela Lab ----
  app.get(`${base}/lab`, ...AL, h((req, res) => { semCache(res); res.json(jr.labParaAluno(req.usuario, produto(req))); }));
  app.put(`${base}/lab/:missao`, ...AL, h((req, res) => {
    res.json(jr.salvarEntrega(req.usuario, produto(req), req.params.missao, (req.body || {}).respostas));
  }));
  app.post(`${base}/lab/:missao/entregar`, ...AL, h((req, res) => { res.json(jr.entregar(req.usuario, produto(req), req.params.missao)); }));
  app.post(`${base}/lab/:missao/mentor`, ...AL, h(async (req, res) => {
    const p = produto(req);
    const { m, respostas } = jr.dadosParaMentor(req.usuario, p, req.params.missao);
    const r = await ia.Agentes.mentor(req.usuario.id, p, { missao: m, respostas });
    const AV = ['atende', 'parcial', 'nao_atende'];
    const fb = {
      criterios: (Array.isArray(r.criterios) ? r.criterios : []).slice(0, 12).map(x => ({
        criterio: s(x.criterio, 120), avaliacao: AV.includes(x.avaliacao) ? x.avaliacao : 'parcial', comentario: s(x.comentario, 600) })),
      pontos_fortes: (Array.isArray(r.pontos_fortes) ? r.pontos_fortes : []).map(x => s(x, 300)).filter(Boolean).slice(0, 3),
      melhorias: (Array.isArray(r.melhorias) ? r.melhorias : []).map(x => s(x, 300)).filter(Boolean).slice(0, 3),
      proximo_passo: s(r.proximo_passo, 400), resumo: s(r.resumo, 600),
    };
    jr.registrarFeedback(req.usuario, p, m.id, fb);
    repo.Auditoria.registrar({ quem: req.usuario.id, acao: 'ia.mentor', entidade: 'ia', entidade_id: p.id, detalhe: m.id, ip: '' });
    res.json({ ok: true, feedback: fb, restantes: Math.max(0, ia.limiteDia() - ia.usadasHoje(req.usuario.id)) });
  }));

  // ---- desafio ----
  app.get(`${base}/desafio`, ...AL, h((req, res) => { semCache(res); res.json(jr.desafioParaAluno(req.usuario, produto(req))); }));
  app.post(`${base}/desafio/iniciar`, ...AL, h((req, res) => { res.json(jr.iniciarDesafio(req.usuario, produto(req))); }));
  app.post(`${base}/desafio/checkin`, ...AL, h((req, res) => {
    const b = req.body || {};
    res.json(jr.checkin(req.usuario, produto(req), b.dia, b.nota));
  }));

  // ---- simulações ----
  app.get(`${base}/simulacoes`, ...AL, h((req, res) => { semCache(res); res.json(jr.simulacoes(req.usuario, produto(req))); }));
  app.post(`${base}/simulacoes/:sim/iniciar`, ...AL, h((req, res) => { res.json(jr.iniciarSimulacao(req.usuario, produto(req), req.params.sim)); }));
  app.post(`${base}/simulacoes/partidas/:partida`, ...AL, h((req, res) => {
    res.json(jr.escolher(req.usuario, produto(req), req.params.partida, (req.body || {}).opcao));
  }));

  // ---- recursos (cheat sheets e templates) ----
  app.get(`${base}/recursos`, ...AL, h((req, res) => { semCache(res); res.json(jr.recursos(req.usuario, produto(req))); }));
  app.get('/academy/aluno/recursos/:productId/:recurso', ...AL, h((req, res) => {
    const p = produto(req);
    const r = jr.recursos(req.usuario, p).itens.find(x => x.id === s(req.params.recurso, 60));
    if (!r) return res.status(404).send('Recurso não encontrado.');
    semCache(res);
    res.type('html').send(paginaRecurso(p, r));
  }));

  // ---- ferramentas: a IA lapida o prompt/agente que o formulário montou ----
  app.post(`${base}/ferramentas/refinar`, ...AL, h(async (req, res) => {
    const p = produto(req);
    if (!jr.contexto(req.usuario, p).acesso) return res.status(403).json({ erro: 'As ferramentas são para quem tem acesso ao curso.' });
    const b = req.body || {};
    const texto = s(b.texto, 8000);
    if (texto.length < 30) return res.status(400).json({ erro: 'Monte o texto no formulário antes de pedir a lapidação.' });
    const r = await ia.Agentes.refinar(req.usuario.id, p, { tipo: b.tipo === 'agente' ? 'agente' : 'prompt', texto });
    repo.Auditoria.registrar({ quem: req.usuario.id, acao: 'ia.refinar', entidade: 'ia', entidade_id: p.id, detalhe: s(b.tipo, 20), ip: '' });
    res.json({ ok: true, texto: s(r.texto, 10000), mudancas: (Array.isArray(r.mudancas) ? r.mudancas : []).map(x => s(x, 300)).filter(Boolean).slice(0, 5),
      restantes: Math.max(0, ia.limiteDia() - ia.usadasHoje(req.usuario.id)) });
  }));
}

function registrarRotasJornadaStaff(app, { requirePublishOrAdmin, requireAuth, requireAdmin }) {
  const PA = requirePublishOrAdmin ? [requirePublishOrAdmin] : [requireAuth, requireAdmin];
  const quem = (req) => 'staff:' + ((req.user && (req.user.nome || req.user.email)) || (req.viaChave ? 'chave-de-publicacao' : 'plataforma'));
  const aud = (req, acao, id, det) => repo.Auditoria.registrar({ quem: quem(req), acao, entidade: 'jornada', entidade_id: s(id, 40), detalhe: s(det, 500), ip: '' });
  app.post('/staff/api/academy/jornada/importar', ...PA, h((req, res) => {
    const b = req.body || {};
    const { produto } = imp.produtorDono(b);
    const r = jr.importar(produto, b, imp.aulaPorTitulo);
    aud(req, 'jornada.importar', produto.id, JSON.stringify(r));
    res.json({ ok: true, importado: r, resumo: jr.resumo(produto.id) });
  }));
  app.post('/staff/api/academy/jornada/status', ...PA, h((req, res) => {
    const b = req.body || {};
    const { produto } = imp.produtorDono(b);
    const r = jr.definirStatus(produto, b);
    aud(req, 'jornada.status', produto.id, JSON.stringify(r));
    res.json({ ok: true, alterados: r, resumo: jr.resumo(produto.id) });
  }));
  app.get('/staff/api/academy/jornada/resumo', ...PA, h((req, res) => {
    const { produto } = imp.produtorDono(req.query || {});
    res.json({ resumo: jr.resumo(produto.id) });
  }));
}

// ---- cheat sheet / template em página própria (imprimir ou salvar em PDF) ----
function paginaRecurso(p, r) {
  const e = escHtml;
  const corpo = r.tipo === 'cheatsheet'
    ? `<div class="grade">${r.secoes.map(x => `<section><h3>${e(x.titulo)}</h3><ul>${x.itens.map(i => `<li>${e(i)}</li>`).join('')}</ul></section>`).join('')}</div>`
    : `<pre>${e(r.corpo)}</pre>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${e(r.titulo)} — ${e(p.titulo)}</title>
<style>
body{font:14px/1.5 Arial,Helvetica,sans-serif;color:#1d2433;max-width:980px;margin:0 auto;padding:24px 18px;background:#fff}
header{border-bottom:3px solid #1B2A4A;margin-bottom:18px;padding-bottom:10px;display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap}
header p{margin:0;color:#B45309;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase}
h1{font-size:24px;margin:4px 0 2px;color:#1B2A4A}.sub{color:#5b6474;font-size:13px;margin:0}
.grade{columns:2 300px;column-gap:18px}section{break-inside:avoid;border:1px solid #d9dee8;border-radius:8px;padding:10px 12px;margin:0 0 14px}
h3{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#159A78;margin:0 0 6px}ul{margin:0;padding-left:18px}li{margin:3px 0}
pre{white-space:pre-wrap;background:#f4f6fa;border:1px solid #d9dee8;border-radius:8px;padding:14px;font:13px/1.55 Consolas,monospace}
.uso{background:#fff8ec;border-left:3px solid #B45309;padding:8px 12px;border-radius:4px;margin:0 0 16px}
button{font:600 13px Arial;background:#1B2A4A;color:#fff;border:0;border-radius:8px;padding:9px 14px;cursor:pointer}
@media print{button{display:none}body{padding:0}}
</style></head><body>
<header><div><p>Villela Academy · ${r.tipo === 'cheatsheet' ? 'Cheat sheet' : 'Template'}</p><h1>${e(r.titulo)}</h1><p class="sub">${e(p.titulo)}${r.descricao ? ' — ' + e(r.descricao) : ''}</p></div>
<button onclick="window.print()">Imprimir ou salvar em PDF</button></header>
${r.como_usar ? `<p class="uso"><b>Como usar.</b> ${e(r.como_usar)}</p>` : ''}
${corpo}
</body></html>`;
}

module.exports = { registrarRotasJornada, registrarRotasJornadaStaff };
