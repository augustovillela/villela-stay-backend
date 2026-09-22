// =====================================================================
// Villela Academy — rotas do ECOSSISTEMA: Villela Express e Faça comigo
// (bibliotecas por formato), trilhas, lives mensais e comunidade.
// Aluno: /academy/api/aluno/... · Staff (PUBLISH_KEY ou admin):
// /staff/api/academy/trilhas|lives/...
// =====================================================================
'use strict';
const repo = require('./repo');
const eco = require('./ecossistema');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const h = (fn) => (req, res) => {
  try { Promise.resolve(fn(req, res)).catch(e => res.status(e.status || 400).json({ erro: e.message })); }
  catch (e) { res.status(e.status || 400).json({ erro: e.message }); }
};
const semCache = (res) => res.setHeader('Cache-Control', 'no-store');

function registrarRotasEcossistema(app, { requireUsuario, requirePapel }) {
  const AL = [requireUsuario, requirePapel('aluno')];
  const A = '/academy/api/aluno';

  // resumo para o menu: o que existe para este aluno
  app.get(`${A}/ecossistema`, ...AL, h((req, res) => {
    semCache(res);
    const casas = eco.casasDoUsuario(req.usuario).filter(c => eco.membro(req.usuario, c.producer_id));
    const lv = eco.lives(req.usuario);
    const agora = Date.now();
    res.json({
      casas,
      express: eco.biblioteca(req.usuario, 'express').length,
      faca_comigo: eco.biblioteca(req.usuario, 'faca-comigo').length,
      trilhas: eco.trilhasPublicas(req.usuario).length,
      proxima_live: lv.filter(l => ['agendada', 'ao_vivo'].includes(l.status) && Date.parse(l.inicio_em) + l.duracao_min * 60e3 > agora)
        .sort((a, b) => Date.parse(a.inicio_em) - Date.parse(b.inicio_em))[0] || null,
    });
  }));

  // ---- bibliotecas por formato ----
  app.get(`${A}/formato/:formato`, ...AL, h((req, res) => { semCache(res); res.json({ aulas: eco.biblioteca(req.usuario, s(req.params.formato, 20)) }); }));

  // ---- trilhas ----
  app.get(`${A}/trilhas`, ...AL, h((req, res) => { semCache(res); res.json({ trilhas: eco.trilhasPublicas(req.usuario) }); }));
  app.get(`${A}/trilhas/:slug`, ...AL, h((req, res) => {
    const t = eco.trilhaPorSlug(req.params.slug, req.usuario);
    if (!t) return res.status(404).json({ erro: 'Trilha não encontrada.' });
    semCache(res); res.json({ trilha: t });
  }));

  // ---- lives ----
  app.get(`${A}/lives`, ...AL, h((req, res) => { semCache(res); res.json({ lives: eco.lives(req.usuario) }); }));
  app.post(`${A}/lives/:id/inscricao`, ...AL, h((req, res) => { res.json({ live: eco.inscrever(req.usuario, req.params.id, (req.body || {}).sim !== false) }); }));
  app.get(`${A}/lives/:id/perguntas`, ...AL, h((req, res) => { semCache(res); res.json({ perguntas: eco.perguntas(req.usuario, req.params.id) }); }));
  app.post(`${A}/lives/:id/perguntas`, ...AL, h((req, res) => { res.json({ perguntas: eco.perguntar(req.usuario, req.params.id, (req.body || {}).texto) }); }));
  app.post(`${A}/lives/perguntas/:pid/voto`, ...AL, h((req, res) => { res.json({ perguntas: eco.votar(req.usuario, req.params.pid) }); }));
  app.post(`${A}/lives/perguntas/:pid/moderar`, ...AL, h((req, res) => { res.json({ perguntas: eco.moderarPergunta(req.usuario, req.params.pid, s((req.body || {}).status, 20)) }); }));

  // ---- comunidade ----
  app.get(`${A}/comunidade/:producerId`, ...AL, h((req, res) => {
    semCache(res);
    const q = req.query || {};
    res.json(eco.listarTopicos(req.usuario, s(req.params.producerId, 40), { area: q.area, busca: q.busca, produto: q.produto }));
  }));
  app.post(`${A}/comunidade/:producerId/topicos`, ...AL, h((req, res) => {
    const t = eco.criarTopico(req.usuario, s(req.params.producerId, 40), req.body || {});
    repo.Auditoria.registrar({ quem: req.usuario.id, acao: 'comunidade.topico', entidade: 'com_topicos', entidade_id: t.id, detalhe: s(t.titulo, 100), ip: '' });
    res.json({ topico: t });
  }));
  app.get(`${A}/comunidade/topicos/:id`, ...AL, h((req, res) => { semCache(res); res.json({ topico: eco.topico(req.usuario, req.params.id) }); }));
  app.post(`${A}/comunidade/topicos/:id/respostas`, ...AL, h((req, res) => { res.json({ topico: eco.responder(req.usuario, req.params.id, (req.body || {}).texto) }); }));
  app.post(`${A}/comunidade/topicos/:id/solucao`, ...AL, h((req, res) => { res.json({ topico: eco.marcarSolucao(req.usuario, req.params.id, (req.body || {}).resposta_id) }); }));
  app.post(`${A}/comunidade/curtir`, ...AL, h((req, res) => { const b = req.body || {}; res.json(eco.curtir(req.usuario, s(b.tipo, 20), b.id)); }));
  app.post(`${A}/comunidade/denunciar`, ...AL, h((req, res) => { const b = req.body || {}; res.json(eco.denunciar(req.usuario, s(b.tipo, 20), b.id, b.motivo)); }));
  app.post(`${A}/comunidade/moderar`, ...AL, h((req, res) => {
    const b = req.body || {};
    const r = eco.moderar(req.usuario, s(b.tipo, 20), b.id, s(b.acao, 20));
    repo.Auditoria.registrar({ quem: req.usuario.id, acao: 'comunidade.moderar', entidade: 'com_' + s(b.tipo, 20), entidade_id: s(b.id, 40), detalhe: s(b.acao, 20), ip: '' });
    res.json(r);
  }));
  app.post(`${A}/comunidade/apagar`, ...AL, h((req, res) => { const b = req.body || {}; res.json(eco.apagarMeu(req.usuario, s(b.tipo, 20), b.id)); }));
  app.get(`${A}/comunidade/:producerId/denuncias`, ...AL, h((req, res) => { semCache(res); res.json({ denuncias: eco.denunciasAbertas(req.usuario, s(req.params.producerId, 40)) }); }));
}

function registrarRotasEcossistemaStaff(app, { requirePublishOrAdmin, requireAuth, requireAdmin }) {
  const PA = requirePublishOrAdmin ? [requirePublishOrAdmin] : [requireAuth, requireAdmin];
  const quem = (req) => 'staff:' + ((req.user && (req.user.nome || req.user.email)) || (req.viaChave ? 'chave-de-publicacao' : 'plataforma'));
  const aud = (req, acao, id, det) => repo.Auditoria.registrar({ quem: quem(req), acao, entidade: 'ecossistema', entidade_id: s(id, 40), detalhe: s(det, 500), ip: '' });
  const produtor = (dados = {}) => {
    const email = s(dados.produtor_email, 120).toLowerCase();
    const u = email && repo.Usuarios.porEmail(email);
    if (!u || u.status !== 'ativo') throw new Error('Informe o "produtor_email" de uma conta ativa.');
    const perfil = repo.Perfis.produtor(u.id);
    if (!perfil || perfil.status !== 'aprovado') throw new Error('Essa conta não é de produtor aprovado.');
    return u;
  };

  app.post('/staff/api/academy/trilhas/importar', ...PA, h((req, res) => {
    const u = produtor(req.body);
    const r = eco.importarTrilhas(u, (req.body || {}).trilhas);
    aud(req, 'trilhas.importar', u.id, JSON.stringify(r));
    res.json({ ok: true, trilhas: r });
  }));
  app.post('/staff/api/academy/trilhas/status', ...PA, h((req, res) => {
    const u = produtor(req.body); const b = req.body || {};
    const r = eco.statusTrilha(u, b.slug, s(b.status, 20));
    aud(req, 'trilhas.status', u.id, `${s(b.slug, 80)}=${s(b.status, 20)}`);
    res.json(r);
  }));
  // cria/atualiza a live (com "id" atualiza). Publicar = "publicada": true. NÃO avisa ninguém.
  app.post('/staff/api/academy/lives', ...PA, h((req, res) => {
    const u = produtor(req.body);
    const l = eco.salvarLive(u, req.body || {});
    aud(req, 'lives.salvar', l.id, `${l.titulo} · ${l.inicio_em} · publicada=${l.publicada}`);
    res.json({ ok: true, live: l });
  }));
  app.get('/staff/api/academy/lives', ...PA, h((req, res) => {
    const u = produtor(req.query || {});
    res.json({ lives: eco.lives({ id: u.id, papeis: [] }) });
  }));
  // aviso aos alunos de uma live publicada: ato explícito, com confirmação no corpo
  // (é mensagem para gente real — sininho + push). Uma vez só por live, salvo "forcar".
  app.post('/staff/api/academy/lives/:id/avisar', ...PA, h((req, res) => {
    const u = produtor(req.body); const b = req.body || {};
    if (b.confirmar !== true) return res.status(400).json({ erro: 'Aviso a alunos exige "confirmar": true — é mensagem para pessoas reais.' });
    const { db, nowISO } = require('./db');
    const l = db.prepare('SELECT * FROM lives WHERE id = ? AND producer_id = ?').get(s(req.params.id, 40), u.id);
    if (!l || !l.publicada) return res.status(404).json({ erro: 'Live não encontrada ou não publicada.' });
    const ja = db.prepare("SELECT 1 FROM audit_logs WHERE acao = 'lives.avisar' AND entidade_id = ?").get(l.id);
    if (ja && b.forcar !== true) return res.status(409).json({ erro: 'Os alunos já foram avisados desta live. Use "forcar": true para avisar de novo.' });
    const quando = new Date(l.inicio_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    const alvo = eco.destinatarios(l);
    const N = require('./emails').Notificacoes;
    for (const uid of alvo) N.criar(uid, `📡 Live: ${s(l.titulo, 100)}`, `${quando} (Brasília). Inscreva-se e mande a sua pergunta antes.`, '/academy/app');
    aud(req, 'lives.avisar', l.id, `${alvo.length} aluno(s) · ${nowISO()}`);
    res.json({ ok: true, avisados: alvo.length });
  }));
}

// lembrete ~1h antes para quem SE INSCREVEU (o aluno pediu para ser lembrado)
function rotinaLembretes() {
  const N = require('./emails').Notificacoes;
  for (const l of eco.lembretesPendentes()) {
    eco.marcarLembrete(l.id); // marca antes: se o envio cair no meio, não repete em loop
    for (const uid of eco.inscritos(l.id)) {
      try { N.criar(uid, `⏰ Começa em 1 hora: ${s(l.titulo, 100)}`, 'O link da live já está na aba Lives da Academy.', '/academy/app'); } catch (_) {}
    }
  }
}

module.exports = { registrarRotasEcossistema, registrarRotasEcossistemaStaff, rotinaLembretes };
