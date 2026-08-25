// =====================================================================
// Musique — API da ACADEMIA MUSICAL (Fase 1).
//
// Três disciplinas que valem para toda rota daqui:
//
//   · O GABARITO NUNCA VAI PARA O CLIENTE antes da resposta. O item é
//     gerado por semente; corrigir regenera pela mesma semente. Mandar
//     o gabarito junto faria o exercício virar decoreba de inspetor.
//
//   · O CONTRATO DA MEDIDA VAI ANTES (decisão Q5): o que se mede, com
//     que tolerância e se aquilo pode valer nota — tudo isso chega junto
//     com o enunciado, não depois do resultado.
//
//   · RECUSA EXPLICA. 403 sem motivo faz o usuário achar que o produto
//     quebrou; com motivo, ele sabe o que fazer.
// =====================================================================
'use strict';
const academia = require('./academia');
const curriculo = require('./curriculo');
const avaliacao = require('./avaliacao');
const repo = require('./repo');

const s = (v, max = 2000) => String(v == null ? '' : v).trim().slice(0, max);

function registrarRotasAcademia(app, { requireUsuario, ehProfessor, buscarContaPorEmail }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    if (e && e.bloqueioDeDireitos) return res.status(403).json({ erro: e.message });
    res.status(400).json({ erro: e.message });
  });

  // Papel de professor vem da ACADEMIA (ADR-0001): quem é produtor
  // aprovado lá dá aula aqui. Sem a função injetada, ninguém é professor
  // — e a rota DIZ isso, em vez de devolver 403 mudo.
  const professorOuNao = typeof ehProfessor === 'function' ? ehProfessor : () => false;
  const requireProfessor = (req, res, next) => {
    if (!professorOuNao(req.usuario)) {
      return res.status(403).json({
        erro: 'Esta área é de professor. Para dar aula na Musique, ative o perfil de produtor na Academia.',
        onde: '/academy/app',
      });
    }
    next();
  };

  // =================================================================
  // Aluno — painel de estudo
  // =================================================================
  app.get('/music/api/estudo', requireUsuario, h(async (req, res) => {
    const u = req.usuario.id;
    res.json({
      revisar_hoje: academia.Pratica.paraRevisarHoje(u),
      trilhas: academia.Trilhas.listar().map((t) => academia.Trilhas.comProgresso(t.id, u)),
      estatisticas: academia.Pratica.estatisticas(u, { dias: 30 }),
      calibracao: academia.Calibracao.estado(u),
      tarefas: academia.Tarefas.doAluno(u).length,
      sou_professor: professorOuNao(req.usuario),
    });
  }));

  app.get('/music/api/trilhas', requireUsuario, h(async (req, res) => {
    const perfil = repo.Usuarios.publico(req.perfil) || {};
    const inst = req.query.instrumento || (perfil.instrumentos || [])[0] || '';
    res.json({ trilhas: academia.Trilhas.listar({ instrumento: inst }).map((t) => academia.Trilhas.comProgresso(t.id, req.usuario.id)) });
  }));

  app.get('/music/api/trilhas/:slug', requireUsuario, h(async (req, res) => {
    const t = academia.Trilhas.porSlug(req.params.slug);
    if (!t) return res.status(404).json({ erro: 'Trilha não encontrada.' });
    res.json({ trilha: academia.Trilhas.comProgresso(t.id, req.usuario.id) });
  }));

  app.post('/music/api/trilhas/:slug/avancar', requireUsuario, h(async (req, res) => {
    const t = academia.Trilhas.porSlug(req.params.slug);
    if (!t) return res.status(404).json({ erro: 'Trilha não encontrada.' });
    res.json({ ok: true, progresso: academia.Trilhas.avancar(req.usuario.id, t.id) });
  }));

  // =================================================================
  // Calibração — porta obrigatória dos exercícios por microfone
  // =================================================================
  app.get('/music/api/calibracao', requireUsuario, h(async (req, res) => {
    res.json({ calibracao: academia.Calibracao.estado(req.usuario.id), vale_dias: academia.CALIBRACAO_VALE_DIAS });
  }));

  app.post('/music/api/calibracao', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, calibracao: academia.Calibracao.registrar(req.usuario.id, d) });
  }));

  // =================================================================
  // Exercícios
  // =================================================================
  app.get('/music/api/exercicios/tipos', requireUsuario, h(async (req, res) => {
    res.json({
      tipos: curriculo.listarTipos().map((t) => ({
        ...t,
        contrato: avaliacao.contrato({ modo: t.modo }),
      })),
    });
  }));

  app.post('/music/api/exercicios/proximo', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    const item = academia.Pratica.proximoItem(req.usuario.id, {
      tipo: s(d.tipo, 60), trilhaId: s(d.trilha_id, 40),
      nivel: d.nivel == null ? null : Number(d.nivel),
    });
    // Exercício por microfone sem calibração não é bloqueado: é
    // AVISADO. Bloquear tiraria a prática de quem só quer treinar; o que
    // não pode é o resultado virar nota (decisão Q5).
    res.json({ item });
  }));

  app.post('/music/api/exercicios/responder', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    const r = academia.Pratica.responder(req.usuario.id, {
      tipo: s(d.tipo, 60), nivel: Number(d.nivel) || 1, semente: s(d.semente, 200),
      resposta: d.resposta, sessaoId: s(d.sessao_id, 40), trilhaId: s(d.trilha_id, 40),
      msGasto: Number(d.ms_gasto) || 0, polifonico: !!d.polifonico,
    });
    res.json(r);
  }));

  app.get('/music/api/historico', requireUsuario, h(async (req, res) => {
    res.json({ tentativas: academia.Pratica.historico(req.usuario.id, Number(req.query.n) || 50) });
  }));

  app.get('/music/api/estatisticas', requireUsuario, h(async (req, res) => {
    res.json({ estatisticas: academia.Pratica.estatisticas(req.usuario.id, { dias: Number(req.query.dias) || 30 }) });
  }));

  // =================================================================
  // Sessões de prática (diário de estudo)
  // =================================================================
  app.post('/music/api/sessoes', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, sessao: academia.Pratica.iniciarSessao(req.usuario.id, { trilhaId: s(d.trilha_id, 40), meta: s(d.meta, 200) }) });
  }));

  app.post('/music/api/sessoes/:id/encerrar', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, sessao: academia.Pratica.encerrarSessao(req.usuario.id, req.params.id, { anotacao: s((req.body || {}).anotacao, 1000) }) });
  }));

  // =================================================================
  // Tarefas — lado do ALUNO
  // =================================================================
  app.get('/music/api/tarefas', requireUsuario, h(async (req, res) => {
    res.json({ tarefas: academia.Tarefas.doAluno(req.usuario.id) });
  }));

  app.post('/music/api/tarefas/:id/enviar', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    const sub = academia.Submissoes.enviar(req.usuario.id, {
      tarefaId: req.params.id, texto: s(d.texto, 4000), mediaId: s(d.media_id, 40),
    });
    res.json({ ok: true, submissao: sub });
  }));

  app.get('/music/api/submissoes/:id', requireUsuario, h(async (req, res) => {
    const sub = academia.Submissoes.porId(req.params.id);
    const v = academia.Submissoes.podeVer(sub, req.usuario.id);
    if (!v.pode) return res.status(v.motivo === 'Submissão não encontrada.' ? 404 : 403).json({ erro: v.motivo });
    res.json({ submissao: sub, feedbacks: academia.Feedbacks.daSubmissao(sub.id) });
  }));

  // =================================================================
  // Contestação — a porta que faz a promessa de revisão existir
  // =================================================================
  app.post('/music/api/contestacoes', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, contestacao: academia.Contestacoes.abrir(req.usuario.id, {
      tentativaId: s(d.tentativa_id, 40), submissaoId: s(d.submissao_id, 40), motivo: s(d.motivo, 2000),
    }) });
  }));

  app.get('/music/api/contestacoes', requireUsuario, h(async (req, res) => {
    res.json({ contestacoes: academia.Contestacoes.doAluno(req.usuario.id) });
  }));

  // =================================================================
  // Professor
  // =================================================================
  app.get('/music/api/prof/tarefas', requireUsuario, requireProfessor, h(async (req, res) => {
    res.json({
      tarefas: academia.Tarefas.doProfessor(req.usuario.id, { status: req.query.status || 'ativa' }),
      contestacoes_abertas: academia.Contestacoes.abertasDoProfessor(req.usuario.id).length,
    });
  }));

  app.post('/music/api/prof/tarefas', requireUsuario, requireProfessor, h(async (req, res) => {
    res.json({ ok: true, tarefa: academia.Tarefas.criar(req.usuario.id, req.body || {}) });
  }));

  app.post('/music/api/prof/tarefas/:id/alunos', requireUsuario, requireProfessor, h(async (req, res) => {
    const d = req.body || {};
    // Por e-mail é o caminho normal (o professor sabe o e-mail do aluno);
    // por id existe para uso interno e para o teste.
    if (Array.isArray(d.emails) && d.emails.length) {
      const r = academia.Tarefas.atribuirPorEmail(req.usuario.id, req.params.id,
        d.emails.map((x) => s(x, 160)), buscarContaPorEmail);
      return res.json({ ok: true, ...r });
    }
    const alunos = (d.alunos || []).map((a) => s(a, 40));
    res.json({ ok: true, atribuidos: academia.Tarefas.atribuir(req.usuario.id, req.params.id, alunos), nao_encontrados: [] });
  }));

  app.post('/music/api/prof/tarefas/:id/arquivar', requireUsuario, requireProfessor, h(async (req, res) => {
    res.json({ ok: true, tarefa: academia.Tarefas.arquivar(req.usuario.id, req.params.id) });
  }));

  app.get('/music/api/prof/tarefas/:id/submissoes', requireUsuario, requireProfessor, h(async (req, res) => {
    res.json({ submissoes: academia.Submissoes.daTarefa(req.usuario.id, req.params.id) });
  }));

  app.post('/music/api/prof/submissoes/:id/feedback', requireUsuario, requireProfessor, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, feedbacks: academia.Feedbacks.dar(req.usuario.id, {
      submissaoId: req.params.id, texto: s(d.texto, 4000), audioMediaId: s(d.audio_media_id, 40),
      nota: d.nota, devolver: !!d.devolver, indicacaoSistema: d.indicacao_sistema || null,
    }) });
  }));

  app.get('/music/api/prof/contestacoes', requireUsuario, requireProfessor, h(async (req, res) => {
    res.json({ contestacoes: academia.Contestacoes.abertasDoProfessor(req.usuario.id) });
  }));

  app.post('/music/api/prof/contestacoes/:id', requireUsuario, requireProfessor, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, contestacao: academia.Contestacoes.resolver(req.usuario.id, {
      id: req.params.id, acolher: !!d.acolher, resposta: s(d.resposta, 2000),
      notaNova: d.nota_nova == null ? null : Number(d.nota_nova),
    }) });
  }));

  return { requireProfessor };
}

module.exports = { registrarRotasAcademia };
