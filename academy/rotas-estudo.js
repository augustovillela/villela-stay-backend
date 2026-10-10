// =====================================================================
// Villela Academy — rotas do ESTUDO (academy\estudo\): do assunto ou do
// edital à aprendizagem demonstrada.
// Aluno: /academy/api/aluno/cursos/:productId/estudo/...
// Importação e publicação: /staff/api/academy/estudo/... (PUBLISH_KEY ou admin).
// =====================================================================
'use strict';
const repo = require('./repo');
const ct = require('./repo-conteudo');
const imp = require('./importacao');
const est = require('./estudo/repo');
const al = require('./estudo/aluno');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
// `extra` leva o que a tela precisa para oferecer saída (ex.: quantas questões há de fato)
const h = (fn) => (req, res) => {
  const falha = (e) => res.status(e.status || 400).json({ erro: e.message, ...(e.extra || {}) });
  try { Promise.resolve(fn(req, res)).catch(falha); } catch (e) { falha(e); }
};

function registrarRotasEstudo(app, { requireUsuario, requirePapel }) {
  const AL = [requireUsuario, requirePapel('aluno')];
  const produto = (req) => {
    const p = ct.Produtos.obter(s(req.params.productId, 40));
    if (!p || ['suspenso', 'removido'].includes(p.status)) { const e = new Error('Curso não encontrado.'); e.status = 404; throw e; }
    return p;
  };
  const semCache = (res) => res.setHeader('Cache-Control', 'no-store');
  const curso = '/academy/api/aluno/cursos/:productId/estudo';
  const base = `${curso}/:escopo`;
  const a = (req) => [req.usuario, produto(req), req.params.escopo];
  const b = (req) => req.body || {};

  app.get(curso, ...AL, h((req, res) => { semCache(res); res.json(al.escopos(req.usuario, produto(req))); }));
  app.get(`${base}/painel`, ...AL, h((req, res) => { semCache(res); res.json(al.painel(...a(req))); }));

  // ---- aula ativa ----
  app.get(`${base}/leitura`, ...AL, h((req, res) => { semCache(res); res.json(al.leitura(...a(req), String(req.query.disciplina || ''))); }));
  app.get(`${base}/mapas`, ...AL, h((req, res) => { semCache(res); res.json(al.mapas(...a(req), String(req.query.disciplina || ''))); }));
  app.get(`${base}/marcacoes`, ...AL, h((req, res) => { semCache(res); res.json(al.marcacoes(...a(req))); }));
  app.post(`${base}/marcacoes`, ...AL, h((req, res) => { res.json(al.marcar(...a(req), b(req))); }));
  app.put(`${base}/marcacoes/:id`, ...AL, h((req, res) => { res.json(al.editarMarcacao(...a(req), req.params.id, b(req))); }));
  app.delete(`${base}/marcacoes/:id`, ...AL, h((req, res) => { res.json(al.removerMarcacao(...a(req), req.params.id)); }));
  app.get(`${base}/unidades/:unidade`, ...AL, h((req, res) => { semCache(res); res.json(al.unidade(...a(req), req.params.unidade, { nivel: String(req.query.nivel || '100') })); }));
  app.get(`${base}/unidades/:unidade/animacoes`, ...AL, h((req, res) => { semCache(res); res.json(al.animacoes(...a(req), req.params.unidade)); }));
  app.post(`${base}/unidades/:unidade/blocos/:n/solucao`, ...AL, h((req, res) => { res.json(al.solucaoDoBloco(...a(req), req.params.unidade, req.params.n, b(req).tentativa)); }));

  // ---- prática ----
  app.get(`${base}/praticar`, ...AL, h((req, res) => { semCache(res); res.json(al.praticar(...a(req), { competencia: req.query.competencia, n: req.query.n, erradas: req.query.erradas === '1', origem: s(req.query.origem, 20),
    banca: req.query.banca, orgao: req.query.orgao, cargo: req.query.cargo, ano_de: req.query.ano_de, ano_ate: req.query.ano_ate })); }));
  app.get(`${base}/banco`, ...AL, h((req, res) => { semCache(res); res.json(al.bancoDeQuestoes(...a(req))); }));
  // caderno de erros: a última resposta foi erro; a anotação é do próprio aluno
  app.get(`${base}/erros`, ...AL, h((req, res) => { semCache(res); res.json(al.erros(...a(req))); }));
  app.put(`${base}/questoes/:questao/anotacao`, ...AL, h((req, res) => { res.json(al.anotar(...a(req), req.params.questao, b(req).texto)); }));
  app.post(`${base}/questoes/:questao/pista`, ...AL, h((req, res) => { res.json(al.pedirPista(...a(req), req.params.questao)); }));
  app.post(`${base}/questoes/:questao/responder`, ...AL, h((req, res) => { res.json(al.responder(...a(req), req.params.questao, b(req))); }));

  // ---- cards ----
  app.get(`${base}/cards`, ...AL, h((req, res) => { semCache(res); res.json(al.cardsDoDia(...a(req))); }));
  app.get(`${base}/cards/todos`, ...AL, h((req, res) => { semCache(res); res.json(al.todosOsCards(...a(req))); }));
  app.post(`${base}/cards/:card/revelar`, ...AL, h((req, res) => { res.json(al.revelarCard(...a(req), req.params.card)); }));
  app.post(`${base}/cards/:card/avaliar`, ...AL, h((req, res) => { res.json(al.avaliarCard(...a(req), req.params.card, s(b(req).resultado, 20))); }));

  // ---- prova (relógio do servidor) ----
  app.post(`${base}/tentativas`, ...AL, h((req, res) => { res.json(al.iniciarTentativa(...a(req), b(req))); }));
  app.get(`${base}/tentativas/:tentativa`, ...AL, h((req, res) => { semCache(res); res.json(al.obterTentativa(...a(req), req.params.tentativa)); }));
  app.put(`${base}/tentativas/:tentativa/respostas`, ...AL, h((req, res) => { res.json(al.salvarRespostas(...a(req), req.params.tentativa, b(req).respostas)); }));
  app.post(`${base}/tentativas/:tentativa/enviar`, ...AL, h((req, res) => { res.json(al.enviarTentativa(...a(req), req.params.tentativa)); }));

  // ---- plano ----
  app.get(`${base}/plano`, ...AL, h((req, res) => { semCache(res); res.json(al.obterPlano(...a(req))); }));
  app.put(`${base}/plano`, ...AL, h((req, res) => { res.json(al.definirPlano(...a(req), b(req), s(b(req).motivo, 200) || undefined)); }));
}

function registrarRotasEstudoStaff(app, { requirePublishOrAdmin, requireAuth, requireAdmin }) {
  const PA = requirePublishOrAdmin ? [requirePublishOrAdmin] : [requireAuth, requireAdmin];
  const quem = (req) => 'staff:' + ((req.user && (req.user.nome || req.user.email)) || (req.viaChave ? 'chave-de-publicacao' : 'plataforma'));
  const aud = (req, acao, id, det) => repo.Auditoria.registrar({ quem: quem(req), acao, entidade: 'estudo', entidade_id: s(id, 40), detalhe: s(det, 500), ip: '' });
  app.post('/staff/api/academy/estudo/importar', ...PA, h((req, res) => {
    const b = req.body || {};
    const { produto } = imp.produtorDono(b);
    const r = est.importar(produto, b);
    aud(req, 'estudo.importar', produto.id, JSON.stringify(r));
    res.json({ ok: true, importado: r, resumo: est.resumo(produto.id).find(e => e.slug === r.escopo) });
  }));
  app.post('/staff/api/academy/estudo/status', ...PA, h((req, res) => {
    const b = req.body || {};
    const { produto } = imp.produtorDono(b);
    const r = est.definirStatus(produto, b);
    aud(req, 'estudo.status', produto.id, JSON.stringify(r));
    res.json({ ok: true, alterados: r });
  }));
  app.get('/staff/api/academy/estudo/resumo', ...PA, h((req, res) => {
    const { produto } = imp.produtorDono(req.query || {});
    res.json({ resumo: est.resumo(produto.id) });
  }));
  // as questões do escopo com o hash de cada uma — para achar a versão antiga que ficou órfã depois de uma correção
  app.get('/staff/api/academy/estudo/questoes', ...PA, h((req, res) => {
    const { produto } = imp.produtorDono(req.query || {});
    const escopo = est.Escopos.porSlug(produto.id, est.slug(req.query.escopo));
    if (!escopo) return res.status(404).json({ erro: 'Escopo não encontrado.' });
    res.json({ questoes: est.questoesDoEscopo(escopo) });
  }));
  // o programa inteiro com o destino de cada item — é a auditoria do edital
  app.get('/staff/api/academy/estudo/cobertura', ...PA, h((req, res) => {
    const { produto } = imp.produtorDono(req.query || {});
    const escopo = est.Escopos.porSlug(produto.id, est.slug(req.query.escopo));
    if (!escopo || !escopo.versao) return res.status(404).json({ erro: 'Escopo sem programa.' });
    res.json({ cobertura: est.cobertura(escopo, { vis: est.STATUS, situacoes: require('./estudo/banco').SITUACOES }) });
  }));
}

module.exports = { registrarRotasEstudo, registrarRotasEstudoStaff };
