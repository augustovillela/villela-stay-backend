// =====================================================================
// Villela Academy — rotas da EXPERIÊNCIA DE APRENDIZAGEM (fase 1):
// Tutor Villela, quiz por aula, caderno de trabalho, biblioteca de
// prompts e extras. Aluno: /academy/api/aluno/... · Importação e
// publicação: /staff/api/academy/interativo/... (PUBLISH_KEY ou admin).
// =====================================================================
'use strict';
const repo = require('./repo');
const ct = require('./repo-conteudo');
const ia = require('./ia');
const it = require('./interativo');
const imp = require('./importacao');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const h = (fn) => (req, res) => {
  try { Promise.resolve(fn(req, res)).catch(e => res.status(e.status || 400).json({ erro: e.message })); }
  catch (e) { res.status(e.status || 400).json({ erro: e.message }); }
};
const escHtml = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function registrarRotasInterativo(app, { requireUsuario, requirePapel }) {
  const AL = [requireUsuario, requirePapel('aluno')];
  const produtoVisivel = (id) => {
    const p = ct.Produtos.obter(s(id, 40));
    return p && !['suspenso', 'removido'].includes(p.status) ? p : null;
  };

  // ---- TUTOR VILLELA ----
  app.post('/academy/api/aluno/tutor/perguntar', ...AL, h(async (req, res) => {
    const b = req.body || {};
    const p = produtoVisivel(b.product_id);
    if (!p) return res.status(404).json({ erro: 'Curso não encontrado.' });
    const pergunta = s(b.pergunta, 1200);
    if (pergunta.length < 3) return res.status(400).json({ erro: 'Escreva a sua pergunta.' });
    const acesso = ct.temAcesso(req.usuario.id, p.id) || it.podeRevisar(req.usuario, p);
    const aula = b.lesson_id ? ct.Produtos.estrutura(p.id).flatMap(m => m.aulas).find(a => a.id === s(b.lesson_id, 40)) : null;
    if (!acesso && !(aula && aula.gratuita)) return res.status(403).json({ erro: 'O Tutor Villela é para quem tem acesso ao curso.' });
    const trechos = it.contextoTutor(req.usuario, p, pergunta, aula ? aula.id : '');
    let r;
    if (trechos.length || !acesso) {
      r = await ia.Agentes.tutor(req.usuario.id, p, {
        pergunta, trechos, historico: it.historico(req.usuario.id, p.id), aulaAtual: aula ? aula.titulo : '',
      });
    } else { // curso ainda sem base própria: o tutor antigo, pelo texto das aulas
      const x = await ia.Agentes.suporte(req.usuario.id, p, pergunta);
      r = { resposta: x.resposta, fontes: [], nao_encontrado: !!x.nao_encontrado, sugestoes: [] };
    }
    // só as fontes que existem no contexto — e sem o texto do trecho (é conteúdo pago)
    const usadas = (Array.isArray(r.fontes) ? r.fontes : []).map(n => trechos.find(t => t.n === Number(n))).filter(Boolean)
      .map(t => ({ n: t.n, fonte: t.fonte, aula: t.aula, lesson_id: t.lesson_id, rotulo: t.rotulo, ini_seg: t.ini_seg }));
    const resposta = s(r.resposta, 6000);
    it.registrarConversa(req.usuario.id, p.id, aula ? aula.id : '', pergunta, resposta, usadas);
    repo.Auditoria.registrar({ quem: req.usuario.id, acao: 'ia.tutor', entidade: 'ia', entidade_id: p.id, detalhe: pergunta.slice(0, 120), ip: '' });
    res.json({
      ok: true, resposta, fontes: usadas, nao_encontrado: !!r.nao_encontrado,
      sugestoes: (Array.isArray(r.sugestoes) ? r.sugestoes : []).map(x => s(x, 160)).filter(Boolean).slice(0, 3),
      restantes: Math.max(0, ia.limiteDia() - ia.usadasHoje(req.usuario.id)),
    });
  }));
  app.get('/academy/api/aluno/tutor/:productId/conversa', ...AL, h((req, res) => {
    const p = produtoVisivel(req.params.productId);
    if (!p) return res.status(404).json({ erro: 'Curso não encontrado.' });
    res.json({ conversa: it.conversas(req.usuario.id, p.id, req.query.n), ativo: ia.ativo(),
      restantes: Math.max(0, ia.limiteDia() - ia.usadasHoje(req.usuario.id)) });
  }));

  // ---- resumo para o estúdio montar as abas ----
  app.get('/academy/api/aluno/cursos/:productId/interativo', ...AL, h((req, res) => {
    const p = produtoVisivel(req.params.productId);
    if (!p) return res.status(404).json({ erro: 'Curso não encontrado.' });
    res.json(it.resumoParaAluno(req.usuario, p));
  }));

  // ---- QUIZ ----
  app.get('/academy/api/aluno/aulas/:lessonId/quiz', ...AL, h((req, res) => {
    const q = it.quizParaAluno(req.usuario, req.params.lessonId);
    if (!q) return res.status(404).json({ erro: 'Esta aula não tem quiz disponível para você.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json(q);
  }));
  app.post('/academy/api/aluno/aulas/:lessonId/quiz', ...AL, h((req, res) => {
    res.json({ ok: true, ...it.corrigirQuiz(req.usuario, req.params.lessonId, (req.body || {}).respostas) });
  }));

  // ---- CADERNO ----
  app.get('/academy/api/aluno/aulas/:lessonId/caderno', ...AL, h((req, res) => {
    const c = it.cadernoParaAluno(req.usuario, req.params.lessonId);
    if (!c) return res.status(404).json({ erro: 'Esta aula não tem caderno disponível para você.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json(c);
  }));
  app.put('/academy/api/aluno/aulas/:lessonId/caderno', ...AL, h((req, res) => {
    const b = req.body || {};
    res.json(it.salvarResposta(req.usuario, req.params.lessonId, s(b.campo, 40), b.texto));
  }));
  // o caderno do curso inteiro, preenchido, pronto para imprimir ou salvar em PDF
  app.get('/academy/aluno/caderno/:productId', ...AL, h((req, res) => {
    const p = produtoVisivel(req.params.productId);
    if (!p) return res.status(404).send('Curso não encontrado.');
    const aulas = it.cadernoCompleto(req.usuario, p);
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(paginaCaderno(p, req.usuario, aulas));
  }));

  // ---- PROMPTS ----
  app.get('/academy/api/aluno/cursos/:productId/prompts', ...AL, h((req, res) => {
    const p = produtoVisivel(req.params.productId);
    if (!p) return res.status(404).json({ erro: 'Curso não encontrado.' });
    const lista = it.promptsParaAluno(req.usuario, p);
    if (!lista) return res.status(403).json({ erro: 'A biblioteca de prompts é para quem tem acesso ao curso.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ prompts: lista });
  }));
}

function registrarRotasInterativoStaff(app, { requirePublishOrAdmin, requireAuth, requireAdmin }) {
  const PA = requirePublishOrAdmin ? [requirePublishOrAdmin] : [requireAuth, requireAdmin];
  const quem = (req) => 'staff:' + ((req.user && (req.user.nome || req.user.email)) || (req.viaChave ? 'chave-de-publicacao' : 'plataforma'));
  const aud = (req, acao, id, det) => repo.Auditoria.registrar({ quem: quem(req), acao, entidade: 'interativo', entidade_id: s(id, 40), detalhe: det, ip: '' });
  app.post('/staff/api/academy/interativo/importar', ...PA, h((req, res) => {
    const b = req.body || {};
    const { produto } = imp.produtorDono(b);
    const r = it.importar(produto, b, imp.aulaPorTitulo);
    aud(req, 'interativo.importar', produto.id, JSON.stringify(r));
    res.json({ ok: true, importado: r, resumo: it.resumo(produto.id) });
  }));
  app.post('/staff/api/academy/interativo/status', ...PA, h((req, res) => {
    const b = req.body || {};
    const { produto } = imp.produtorDono(b);
    const r = it.definirStatus(produto, b);
    aud(req, 'interativo.status', produto.id, JSON.stringify({ pedido: { quizzes: b.quizzes, cadernos: b.cadernos, prompts: b.prompts }, r }));
    res.json({ ok: true, alterados: r, resumo: it.resumo(produto.id) });
  }));
  app.get('/staff/api/academy/interativo/resumo', ...PA, h((req, res) => {
    const { produto } = imp.produtorDono(req.query || {});
    res.json({ resumo: it.resumo(produto.id) });
  }));
}

// ---- página imprimível do caderno (o aluno salva em PDF pelo navegador) ----
function paginaCaderno(p, u, aulas) {
  const e = escHtml;
  const bloco = (rot, corpo) => corpo ? `<section><h4>${rot}</h4>${corpo}</section>` : '';
  const resp = (t) => `<div class="resp">${t ? e(t).replace(/\n/g, '<br>') : '<span class="vazio">— em branco —</span>'}</div>`;
  const lista = (xs) => xs && xs.length ? '<ul>' + xs.map(x => `<li>${e(x)}</li>`).join('') + '</ul>' : '';
  const corpo = aulas.map(a => {
    const c = a.caderno || {}, r = a.respostas || {};
    const ap = c.aprendi || {}, pr = c.pratiquei || {}, ae = c.apliquei || {}, rs = c.resultado || {};
    return `<article><p class="mod">${e(a.modulo)}</p><h2>${e(a.aula)}</h2>
      ${bloco('Aprendi', (ap.resumo ? `<p>${e(ap.resumo)}</p>` : '') + lista(ap.pontos))}
      ${bloco('Pratiquei', ((pr.checklist || []).length ? '<ul class="chk">' + pr.checklist.map((x, i) => `<li>${r['check_' + (i + 1)] === '1' ? '☑' : '☐'} ${e(x)}</li>`).join('') + '</ul>' : '') +
        (pr.exercicio ? `<p><b>Exercício.</b> ${e(pr.exercicio)}</p>${resp(r.exercicio)}` : '') +
        (pr.prompt_modelo ? `<p><b>Prompt modelo</b></p><pre>${e(pr.prompt_modelo)}</pre>` : ''))}
      ${bloco('Apliquei', (ae.tarefas || []).map((t, i) => `<p><b>Tarefa ${i + 1}.</b> ${e(t)}</p>${resp(r['tarefa_' + (i + 1)])}`).join('') +
        (ae.desafio ? `<p><b>Desafio.</b> ${e(ae.desafio)}</p>${resp(r.desafio)}` : ''))}
      ${bloco('Resultado', (rs.esperado ? `<p class="esp"><b>O que se espera:</b> ${e(rs.esperado)}</p>` : '') + `<p><b>O meu resultado</b></p>${resp(r.resultado)}`)}
    </article>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Caderno de trabalho — ${e(p.titulo)}</title>
<style>
body{font:15px/1.55 Georgia,'Times New Roman',serif;color:#1d2433;max-width:820px;margin:0 auto;padding:28px 22px;background:#fff}
header{border-bottom:3px solid #1B2A4A;margin-bottom:26px;padding-bottom:14px}
header p{margin:0;color:#B45309;font:600 12px/1.4 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}
h1{font:700 26px/1.2 Arial,sans-serif;margin:6px 0 4px;color:#1B2A4A}
.al{font:13px Arial,sans-serif;color:#5b6474}
article{break-inside:auto;border-top:1px solid #d9dee8;padding-top:18px;margin-top:24px}
article+article{break-before:page}
.mod{font:12px Arial,sans-serif;color:#5b6474;margin:0}
h2{font:700 20px/1.25 Arial,sans-serif;color:#1B2A4A;margin:4px 0 12px}
h4{font:700 12px Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#159A78;margin:16px 0 6px}
pre{white-space:pre-wrap;background:#f4f6fa;border:1px solid #d9dee8;border-radius:6px;padding:10px;font:12.5px/1.5 Consolas,monospace}
.resp{border:1px dashed #b9c1d0;border-radius:6px;padding:9px 11px;min-height:34px;margin:4px 0 12px;background:#fbfcfe}
.vazio{color:#9aa3b3;font-style:italic}.chk{list-style:none;padding-left:0}.esp{color:#3d4658}
.imp{font:600 14px Arial,sans-serif;background:#1B2A4A;color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}
@media print{.imp{display:none}body{padding:0}}
</style></head><body>
<header><p>Villela Academy · Caderno de trabalho</p><h1>${e(p.titulo)}</h1>
<div class="al">${e(u.nome || '')} · ${new Date().toLocaleDateString('pt-BR')}</div>
<p style="margin-top:12px"><button class="imp" onclick="window.print()">Imprimir ou salvar em PDF</button></p></header>
${corpo || '<p>Nenhum caderno disponível neste curso ainda.</p>'}
</body></html>`;
}

module.exports = { registrarRotasInterativo, registrarRotasInterativoStaff };
