// =====================================================================
// Musique — API das ESCOLAS, TURMAS, PRESENÇA e BOLETIM (Fase 3).
//
// ⚠️ NENHUMA ROTA DAQUI CONSULTA AS TABELAS DE ORGANIZAÇÃO. Tudo passa
// por `organizacoes.js`, que é o portão do multi-tenant (ADR-0007) — e o
// selftest varre este arquivo para garantir isso. O `organizacao_id`
// chega pela URL, mas quem decide se ele vale é a membresia verificada,
// nunca o parâmetro.
// =====================================================================
'use strict';
const org = require('./organizacoes');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

function registrarRotasOrganizacoes(app, { requireUsuario, buscarContaPorEmail, buscarContaPorId }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    if (e && e.bloqueioDeDireitos) return res.status(403).json({ erro: e.message });
    res.status(400).json({ erro: e.message });
  });

  // ---- nomes ------------------------------------------------------
  // Chamada e boletim são listas de PESSOAS. Devolver `usuario: "u-7a3"`
  // e deixar a tela se virar produz uma lista ilegível, que o professor
  // lê como defeito. O nome vem da Academia, dona das contas (ADR-0001);
  // a Musique só pergunta, e pergunta só o nome.
  //
  // Quando a busca não está injetada — ou a conta sumiu —, o campo diz
  // isso em vez de ficar vazio: célula vazia parece dado perdido.
  const nomeDe = (id) => {
    if (!id) return '';
    try {
      const c = typeof buscarContaPorId === 'function' ? buscarContaPorId(id) : null;
      return (c && c.nome) || 'Conta não encontrada';
    } catch (_) { return 'Conta não encontrada'; }
  };
  const comNome = (linha, campo) => ({ ...linha, nome: nomeDe(linha[campo]) });

  // =================================================================
  // Escolas
  // =================================================================
  app.get('/music/api/escolas', requireUsuario, h(async (req, res) => {
    res.json(org.Organizacoes.doUsuario(req.usuario.id));
  }));

  app.post('/music/api/escolas', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, escola: org.Organizacoes.criar(req.usuario.id, req.body || {}) });
  }));

  app.get('/music/api/escolas/:id', requireUsuario, h(async (req, res) => {
    const v = org.escopo(req.usuario.id, req.params.id);
    res.json({
      escola: v.organizacao, papel: v.papel,
      membros: org.Organizacoes.membros(req.params.id).map((m) => comNome(m, 'usuario')),
      turmas: org.Turmas.daOrganizacao(req.usuario.id, req.params.id),
    });
  }));

  app.post('/music/api/escolas/:id/membros', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, ...org.Organizacoes.convidar(req.usuario.id, req.params.id,
      (d.emails || []).map((x) => s(x, 160)), s(d.papel, 20) || 'professor', buscarContaPorEmail) });
  }));

  app.delete('/music/api/escolas/:id/membros/:quem', requireUsuario, h(async (req, res) => {
    res.json({ ok: org.Organizacoes.remover(req.usuario.id, req.params.id, req.params.quem) });
  }));

  // =================================================================
  // Turmas
  // =================================================================
  app.post('/music/api/escolas/:id/turmas', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, turma: org.Turmas.criar(req.usuario.id, req.params.id, req.body || {}) });
  }));

  app.get('/music/api/turmas/:id', requireUsuario, h(async (req, res) => {
    const d = org.Turmas.detalhe(req.usuario.id, req.params.id);
    res.json({ ...d, alunos: d.alunos.map((a) => comNome(a, 'aluno')),
      professor_nome: nomeDe(d.turma.professor) });
  }));

  app.post('/music/api/turmas/:id/encerrar', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, turma: org.Turmas.encerrar(req.usuario.id, req.params.id) });
  }));

  // =================================================================
  // Matrículas
  // =================================================================
  app.post('/music/api/turmas/:id/matriculas', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, ...org.Matriculas.matricular(req.usuario.id, req.params.id, {
      emails: (d.emails || []).map((x) => s(x, 160)),
      menor: !!d.menor, responsavelEmail: s(d.responsavel_email, 160),
    }, buscarContaPorEmail) });
  }));

  app.post('/music/api/matriculas/:id/encerrar', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, matricula: org.Matriculas.encerrar(req.usuario.id, req.params.id,
      { motivo: s((req.body || {}).motivo, 300) }) });
  }));

  /** Onde eu estudo — e por quem eu respondo. */
  app.get('/music/api/minhas-turmas', requireUsuario, h(async (req, res) => {
    res.json({
      matriculas: org.Matriculas.doAluno(req.usuario.id),
      dependentes: org.Matriculas.deQuemEuRespondo(req.usuario.id).map((m) => comNome(m, 'aluno')),
    });
  }));

  // =================================================================
  // Aulas e chamada
  // =================================================================
  app.post('/music/api/turmas/:id/aulas', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, aula: org.Aulas.criar(req.usuario.id, req.params.id, req.body || {}) });
  }));

  /** Quem já foi marcado nesta aula — a chamada abre no que está lá. */
  app.get('/music/api/aulas/:id/chamada', requireUsuario, h(async (req, res) => {
    const d = org.Aulas.presencas(req.usuario.id, req.params.id);
    res.json({ ...d, presencas: d.presencas.map((p) => comNome(p, 'aluno')),
      alunos: d.alunos.map((a) => comNome(a, 'aluno')) });
  }));

  app.post('/music/api/aulas/:id/chamada', requireUsuario, h(async (req, res) => {
    const marcacoes = ((req.body || {}).marcacoes || []).map((m) => ({
      aluno: s(m.aluno, 40), estado: s(m.estado, 20), motivo: s(m.motivo, 300),
    }));
    res.json({ ok: true, ...org.Aulas.chamada(req.usuario.id, req.params.id, marcacoes) });
  }));

  // =================================================================
  // Biblioteca institucional
  // =================================================================
  app.post('/music/api/escolas/:id/biblioteca', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: org.BibliotecaOrg.adicionar(req.usuario.id, req.params.id, {
      obraId: s(d.obra_id, 40), turmaId: s(d.turma_id, 40), nota: s(d.nota, 500),
    }) });
  }));

  app.delete('/music/api/escolas/:id/biblioteca/:obraId', requireUsuario, h(async (req, res) => {
    res.json({ ok: org.BibliotecaOrg.remover(req.usuario.id, req.params.id, req.params.obraId,
      s(req.query.turma_id, 40)) });
  }));

  // =================================================================
  // Boletim
  // =================================================================
  app.get('/music/api/turmas/:id/boletim', requireUsuario, h(async (req, res) => {
    res.json({ boletim: org.Boletim.daTurma(req.usuario.id, req.params.id).map((b) => comNome(b, 'aluno')) });
  }));

  app.get('/music/api/turmas/:id/boletim/:aluno', requireUsuario, h(async (req, res) => {
    const b = org.Boletim.doAluno(req.usuario.id, req.params.id, req.params.aluno);
    res.json({ ...b, aluno_nome: nomeDe(b.aluno) });
  }));
}

module.exports = { registrarRotasOrganizacoes };
