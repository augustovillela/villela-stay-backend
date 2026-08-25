// =====================================================================
// Musique — ESCOLAS E TURMAS (Fase 3). O PORTÃO do multi-tenant.
//
// ⚠️ ESTE ARQUIVO É O ÚNICO QUE RESOLVE VÍNCULO COM ORGANIZAÇÃO
// (ADR-0007). Nenhuma rota monta `WHERE organizacao_id = ...` na mão:
// tudo passa por `escopo()`, que devolve o vínculo verificado ou recusa.
// O selftest varre os arquivos da Fase 3 e falha se achar consulta às
// tabelas de organização fora daqui — a disciplina não pode depender de
// memória.
//
// TRÊS REGRAS QUE VALEM PARA TUDO:
//
//   1. O `organizacao_id` NUNCA vem do cliente. Ele sai da membresia
//      verificada. Parâmetro mandado no corpo, na query ou em header é
//      ignorado.
//
//   2. ALUNO NÃO É MEMBRO. Membro é quem trabalha na escola (gestor,
//      professor, secretaria). O aluno alcança a escola pela MATRÍCULA,
//      e só o que a matrícula dele abre.
//
//   3. A ESCOLA NÃO SE APODERA DO ACERVO DO ALUNO. Organização é uma
//      camada A MAIS sobre `direitos.js`, nunca um substituto: obra de
//      terceiro continua sem poder ser distribuída, inclusive por
//      professor, inclusive "só para a turma".
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');
const direitos = require('./direitos');
const academia = require('./academia');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const PAPEIS = ['gestor', 'professor', 'secretaria'];
const podeGerir = (papel) => papel === 'gestor';
const podeLecionar = (papel) => papel === 'gestor' || papel === 'professor';
const podeSecretariar = (papel) => papel === 'gestor' || papel === 'secretaria';

function recusar(motivo) {
  const e = new Error(motivo);
  e.bloqueioDeDireitos = true;
  return e;
}

// ---------------------------------------------------------------------
// O portão
// ---------------------------------------------------------------------
/**
 * Resolve o vínculo de `usuario` com `orgId`. É a ÚNICA porta.
 *
 * `exigir` restringe: 'gestor' | 'ensino' | 'secretaria' | null.
 * Devolve `{ organizacao, papel }` — ou lança, com o motivo.
 */
function escopo(usuario, orgId, { exigir = null } = {}) {
  const org = db.prepare('SELECT * FROM organizacoes WHERE id = ?').get(orgId);
  if (!org) throw recusar('Escola não encontrada.');
  if (org.status !== 'ativa') throw recusar(`Esta escola está ${org.status}.`);

  const m = db.prepare('SELECT * FROM org_membros WHERE organizacao_id = ? AND usuario = ?').get(orgId, usuario);
  if (!m) throw recusar('Você não faz parte desta escola.');

  if (exigir === 'gestor' && !podeGerir(m.papel)) throw recusar('Só a gestão da escola faz isso.');
  if (exigir === 'ensino' && !podeLecionar(m.papel)) throw recusar('Só professor ou gestão faz isso.');
  if (exigir === 'secretaria' && !podeSecretariar(m.papel)) throw recusar('Só a secretaria ou a gestão faz isso.');

  return { organizacao: org, papel: m.papel };
}

/** Vínculo de ALUNO: existe matrícula ativa nesta organização? */
function escopoAluno(usuario, orgId) {
  const linhas = db.prepare(
    `SELECT * FROM matriculas WHERE organizacao_id = ? AND aluno = ? AND status = 'ativa'`).all(orgId, usuario);
  if (!linhas.length) throw recusar('Você não está matriculado nesta escola.');
  return { matriculas: linhas };
}

/** Alcança como membro OU como aluno matriculado. */
function escopoQualquer(usuario, orgId) {
  try { return { ...escopo(usuario, orgId), como: 'membro' }; }
  catch (_) { return { ...escopoAluno(usuario, orgId), como: 'aluno' }; }
}

// ---------------------------------------------------------------------
// Organizações
// ---------------------------------------------------------------------
const Organizacoes = {
  porId: (id) => db.prepare('SELECT * FROM organizacoes WHERE id = ?').get(id) || null,
  porSlug: (slug) => db.prepare('SELECT * FROM organizacoes WHERE slug = ?').get(slug) || null,

  criar(dono, { nome, tipo = 'escola', descricao = '', cor = '', assentos = 0 } = {}) {
    if (!s(nome)) throw new Error('A escola precisa de um nome.');
    const base = s(nome, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'escola';
    let slug = base; let n = 1;
    while (Organizacoes.porSlug(slug)) slug = `${base}-${++n}`;

    const id = novoId();
    db.prepare(`INSERT INTO organizacoes (id, slug, nome, tipo, descricao, cor, assentos, status,
                criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?, 'ativa', ?,?,?)`)
      .run(id, slug, s(nome, 160), s(tipo, 20), s(descricao, 1000), s(cor, 12),
           Math.max(0, Number(assentos) || 0), dono, nowISO(), nowISO());
    db.prepare(`INSERT INTO org_membros (organizacao_id, usuario, papel, entrou_em)
                VALUES (?, ?, 'gestor', ?)`).run(id, dono, nowISO());
    direitos.registrar({ ator: dono, acao: 'escola.criada', alvo: id, detalhe: { nome, slug } });
    return Organizacoes.porId(id);
  },

  /** Escolas em que a pessoa trabalha, e escolas em que ela estuda. */
  doUsuario(usuario) {
    const comoMembro = db.prepare(
      `SELECT o.*, m.papel FROM organizacoes o JOIN org_membros m ON m.organizacao_id = o.id
       WHERE m.usuario = ? AND o.status = 'ativa' ORDER BY o.nome`).all(usuario);
    const comoAluno = db.prepare(
      `SELECT DISTINCT o.* FROM organizacoes o JOIN matriculas mt ON mt.organizacao_id = o.id
       WHERE mt.aluno = ? AND mt.status = 'ativa' AND o.status = 'ativa' ORDER BY o.nome`).all(usuario);
    return {
      trabalho: comoMembro.map((o) => ({ ...o, uso: contagem(o.id) })),
      estudo: comoAluno.filter((o) => !comoMembro.some((x) => x.id === o.id)),
    };
  },

  membros: (orgId) => db.prepare('SELECT * FROM org_membros WHERE organizacao_id = ? ORDER BY papel, entrou_em').all(orgId),

  /**
   * A pessoa leciona em ALGUMA escola ativa?
   *
   * Existe porque "quem pode dar aula" tem DOIS caminhos, e o produto
   * confundia os dois: ser produtor aprovado na Academia (o professor
   * independente, que vende curso) e ser professor contratado por uma
   * escola. Exigir o primeiro do segundo obrigaria todo professor de
   * escola a passar pela aprovação de produtor do marketplace — que
   * existe para liberar VENDA, não para liberar aula.
   */
  /** A pessoa estuda em alguma escola, ou responde por quem estuda? */
  temTurma: (usuario) => !!db.prepare(
    `SELECT 1 FROM matriculas WHERE status = 'ativa' AND (aluno = ? OR (menor = 1 AND responsavel = ?))`)
    .get(usuario, usuario),

  lecionaEmAlguma: (usuario) => !!db.prepare(
    `SELECT 1 FROM org_membros m JOIN organizacoes o ON o.id = m.organizacao_id
     WHERE m.usuario = ? AND o.status = 'ativa' AND m.papel IN ('gestor','professor')`).get(usuario),

  /** Convida por e-mail; a busca de conta é injetada (ADR-0001). */
  convidar(usuario, orgId, emails, papel, buscarPorEmail) {
    escopo(usuario, orgId, { exigir: 'gestor' });
    if (!PAPEIS.includes(papel)) throw new Error(`Papel desconhecido: "${papel}".`);
    if (typeof buscarPorEmail !== 'function') {
      throw new Error('Busca de conta indisponível: a Musique não foi montada com a conta da Academia.');
    }
    const entraram = []; const naoEncontrados = [];
    for (const e of (emails || []).map((x) => String(x || '').trim()).filter(Boolean)) {
      const u = buscarPorEmail(e);
      if (!u || !u.id) { naoEncontrados.push(e); continue; }
      db.prepare(`INSERT INTO org_membros (organizacao_id, usuario, papel, entrou_em) VALUES (?,?,?,?)
                  ON CONFLICT(organizacao_id, usuario) DO UPDATE SET papel = excluded.papel`)
        .run(orgId, u.id, papel, nowISO());
      entraram.push(u.id);
    }
    direitos.registrar({ ator: usuario, acao: 'escola.membro', alvo: orgId, detalhe: { papel, entraram: entraram.length } });
    return { entraram: entraram.length, nao_encontrados: naoEncontrados };
  },

  remover(usuario, orgId, alvo) {
    const { organizacao } = escopo(usuario, orgId, { exigir: 'gestor' });
    if (alvo === organizacao.criado_por) {
      throw new Error('Quem criou a escola não pode ser removido. Passe a gestão antes.');
    }
    db.prepare('DELETE FROM org_membros WHERE organizacao_id = ? AND usuario = ?').run(orgId, alvo);
    direitos.registrar({ ator: usuario, acao: 'escola.membro.removido', alvo: orgId, detalhe: { quem: alvo } });
    return true;
  },
};

const contagem = (orgId) => ({
  turmas: db.prepare("SELECT COUNT(*) AS n FROM turmas WHERE organizacao_id = ? AND status = 'ativa'").get(orgId).n,
  alunos: db.prepare("SELECT COUNT(DISTINCT aluno) AS n FROM matriculas WHERE organizacao_id = ? AND status = 'ativa'").get(orgId).n,
  membros: db.prepare('SELECT COUNT(*) AS n FROM org_membros WHERE organizacao_id = ?').get(orgId).n,
});

// ---------------------------------------------------------------------
// Turmas
// ---------------------------------------------------------------------
const Turmas = {
  porId: (id) => db.prepare('SELECT * FROM turmas WHERE id = ?').get(id) || null,

  criar(usuario, orgId, d = {}) {
    escopo(usuario, orgId, { exigir: 'ensino' });
    if (!s(d.nome)) throw new Error('A turma precisa de um nome.');
    const id = novoId();
    db.prepare(`INSERT INTO turmas (id, organizacao_id, nome, professor, instrumento, nivel,
                horario, periodo, status, criado_em) VALUES (?,?,?,?,?,?,?,?, 'ativa', ?)`)
      .run(id, orgId, s(d.nome, 120), s(d.professor, 40) || usuario, s(d.instrumento, 40),
           s(d.nivel, 20), s(d.horario, 60), s(d.periodo, 20), nowISO());
    direitos.registrar({ ator: usuario, acao: 'turma.criada', alvo: id, detalhe: { escola: orgId, nome: d.nome } });
    return Turmas.porId(id);
  },

  daOrganizacao(usuario, orgId) {
    const { papel } = escopo(usuario, orgId);
    const todas = db.prepare("SELECT * FROM turmas WHERE organizacao_id = ? AND status = 'ativa' ORDER BY nome").all(orgId);
    // Professor vê as turmas DELE; gestão e secretaria veem todas.
    const minhas = papel === 'professor' ? todas.filter((t) => t.professor === usuario) : todas;
    return minhas.map((t) => ({ ...t, alunos: alunosDaTurma(t.id).length, aulas: aulasDaTurma(t.id).length }));
  },

  /** Detalhe. Quem alcança: membro da escola OU aluno matriculado nela. */
  detalhe(usuario, turmaId) {
    const t = Turmas.porId(turmaId);
    if (!t) throw recusar('Turma não encontrada.');
    const v = escopoQualquer(usuario, t.organizacao_id);
    // Aluno só vê a turma em que ESTÁ matriculado.
    if (v.como === 'aluno' && !v.matriculas.some((m) => m.turma_id === turmaId)) {
      throw recusar('Você não está matriculado nesta turma.');
    }
    if (v.como === 'membro' && v.papel === 'professor' && t.professor !== usuario) {
      throw recusar('Esta turma não é sua.');
    }
    return {
      turma: t,
      organizacao: Organizacoes.porId(t.organizacao_id),
      // Aluno não vê a lista de colegas: numa escola com menor de idade,
      // a lista de quem estuda ali é dado de terceiro.
      alunos: v.como === 'membro' ? alunosDaTurma(turmaId) : [],
      aulas: aulasDaTurma(turmaId),
      biblioteca: BibliotecaOrg.daTurma(t.organizacao_id, turmaId),
      como: v.como, papel: v.papel || 'aluno',
    };
  },

  encerrar(usuario, turmaId) {
    const t = Turmas.porId(turmaId);
    if (!t) throw recusar('Turma não encontrada.');
    escopo(usuario, t.organizacao_id, { exigir: 'ensino' });
    db.prepare("UPDATE turmas SET status = 'encerrada' WHERE id = ?").run(turmaId);
    direitos.registrar({ ator: usuario, acao: 'turma.encerrada', alvo: turmaId });
    return Turmas.porId(turmaId);
  },
};

const alunosDaTurma = (turmaId) =>
  db.prepare("SELECT * FROM matriculas WHERE turma_id = ? AND status = 'ativa' ORDER BY matriculado_em").all(turmaId);
const aulasDaTurma = (turmaId) =>
  db.prepare('SELECT * FROM aulas WHERE turma_id = ? ORDER BY data DESC, criado_em DESC').all(turmaId);

// ---------------------------------------------------------------------
// Matrículas
// ---------------------------------------------------------------------
const Matriculas = {
  porId: (id) => db.prepare('SELECT * FROM matriculas WHERE id = ?').get(id) || null,

  /**
   * Matricula por e-mail. Confere ASSENTOS e, para menor de idade,
   * exige responsável (LGPD art. 14).
   */
  matricular(usuario, turmaId, { emails = [], menor = false, responsavelEmail = '' } = {}, buscarPorEmail) {
    const t = Turmas.porId(turmaId);
    if (!t) throw recusar('Turma não encontrada.');
    const { organizacao } = escopo(usuario, t.organizacao_id, { exigir: 'secretaria' });
    if (typeof buscarPorEmail !== 'function') {
      throw new Error('Busca de conta indisponível: a Musique não foi montada com a conta da Academia.');
    }

    let responsavel = '';
    if (menor) {
      const r = responsavelEmail ? buscarPorEmail(responsavelEmail) : null;
      if (!r || !r.id) {
        throw new Error('Aluno menor de idade precisa de um responsável com conta na plataforma '
          + '(LGPD, art. 14). Informe o e-mail do responsável.');
      }
      responsavel = r.id;
    }

    const ocupados = db.prepare(
      "SELECT COUNT(DISTINCT aluno) AS n FROM matriculas WHERE organizacao_id = ? AND status = 'ativa'")
      .get(organizacao.id).n;

    const entraram = []; const naoEncontrados = []; const jaEstavam = [];
    for (const e of emails.map((x) => String(x || '').trim()).filter(Boolean)) {
      const u = buscarPorEmail(e);
      if (!u || !u.id) { naoEncontrados.push(e); continue; }
      const ja = db.prepare('SELECT * FROM matriculas WHERE turma_id = ? AND aluno = ?').get(turmaId, u.id);
      if (ja && ja.status === 'ativa') { jaEstavam.push(e); continue; }

      // Assento se conta por ALUNO na escola, não por matrícula: o
      // mesmo aluno em duas turmas ocupa um assento, não dois.
      const novoNaEscola = !db.prepare(
        "SELECT 1 FROM matriculas WHERE organizacao_id = ? AND aluno = ? AND status = 'ativa'")
        .get(organizacao.id, u.id);
      if (novoNaEscola && organizacao.assentos && ocupados + entraram.length >= organizacao.assentos) {
        throw new Error(`A escola tem ${organizacao.assentos} assento(s) e ${ocupados} aluno(s) ativo(s). `
          + 'Encerre matrículas ou aumente o plano antes de matricular mais.');
      }

      if (ja) {
        db.prepare(`UPDATE matriculas SET status = 'ativa', responsavel = ?, menor = ?,
                    matriculado_em = ?, encerrado_em = '' WHERE id = ?`)
          .run(responsavel, menor ? 1 : 0, nowISO(), ja.id);
      } else {
        db.prepare(`INSERT INTO matriculas (id, organizacao_id, turma_id, aluno, responsavel, menor,
                    status, matriculado_em) VALUES (?,?,?,?,?,?, 'ativa', ?)`)
          .run(novoId(), organizacao.id, turmaId, u.id, responsavel, menor ? 1 : 0, nowISO());
      }
      entraram.push(u.id);
    }
    direitos.registrar({ ator: usuario, acao: 'matricula', alvo: turmaId,
      detalhe: { entraram: entraram.length, menor: !!menor } });
    return { entraram: entraram.length, nao_encontrados: naoEncontrados, ja_estavam: jaEstavam };
  },

  encerrar(usuario, matriculaId, { motivo = '' } = {}) {
    const m = Matriculas.porId(matriculaId);
    if (!m) throw recusar('Matrícula não encontrada.');
    escopo(usuario, m.organizacao_id, { exigir: 'secretaria' });
    db.prepare("UPDATE matriculas SET status = 'encerrada', encerrado_em = ? WHERE id = ?").run(nowISO(), matriculaId);
    direitos.registrar({ ator: usuario, acao: 'matricula.encerrada', alvo: matriculaId, motivo });
    return Matriculas.porId(matriculaId);
  },

  doAluno: (aluno) => db.prepare(
    `SELECT m.*, t.nome AS turma_nome, o.nome AS escola_nome, o.id AS escola_id
     FROM matriculas m JOIN turmas t ON t.id = m.turma_id JOIN organizacoes o ON o.id = m.organizacao_id
     WHERE m.aluno = ? AND m.status = 'ativa' ORDER BY o.nome, t.nome`).all(aluno),

  /**
   * As matrículas de quem a pessoa RESPONDE (menor de idade).
   *
   * Existe porque faltava a porta: o boletim já reconhecia o
   * responsável, mas ele não tinha por onde chegar nele — nenhuma tela
   * listava a turma do filho, e a única entrada seria adivinhar a URL.
   * Permissão sem caminho é permissão que não existe.
   */
  deQuemEuRespondo: (responsavel) => db.prepare(
    `SELECT m.*, t.nome AS turma_nome, o.nome AS escola_nome, o.id AS escola_id
     FROM matriculas m JOIN turmas t ON t.id = m.turma_id JOIN organizacoes o ON o.id = m.organizacao_id
     WHERE m.responsavel = ? AND m.menor = 1 AND m.status = 'ativa'
     ORDER BY o.nome, t.nome`).all(responsavel),
};

// ---------------------------------------------------------------------
// Aulas e presença
// ---------------------------------------------------------------------
const Aulas = {
  porId: (id) => db.prepare('SELECT * FROM aulas WHERE id = ?').get(id) || null,

  criar(usuario, turmaId, d = {}) {
    const t = Turmas.porId(turmaId);
    if (!t) throw recusar('Turma não encontrada.');
    escopo(usuario, t.organizacao_id, { exigir: 'ensino' });
    const id = novoId();
    db.prepare(`INSERT INTO aulas (id, organizacao_id, turma_id, data, tema, link, observacao, criado_em)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, t.organizacao_id, turmaId, s(d.data, 25), s(d.tema, 200), s(d.link, 500),
           s(d.observacao, 1000), nowISO());
    return Aulas.porId(id);
  },

  /**
   * Chamada. Recebe a lista inteira de uma vez, porque chamada é um ato
   * só — marcar aluno por aluno com uma requisição cada deixaria a
   * chamada pela metade quando a rede oscilar.
   */
  chamada(usuario, aulaId, marcacoes = []) {
    const a = Aulas.porId(aulaId);
    if (!a) throw recusar('Aula não encontrada.');
    escopo(usuario, a.organizacao_id, { exigir: 'ensino' });

    const matriculados = new Set(alunosDaTurma(a.turma_id).map((m) => m.aluno));
    const fora = marcacoes.map((m) => m.aluno).filter((x) => !matriculados.has(x));
    if (fora.length) {
      throw new Error(`${fora.length} pessoa(s) da chamada não estão matriculadas nesta turma. `
        + 'Confira a lista antes de salvar.');
    }

    let n = 0;
    for (const m of marcacoes) {
      const estado = ['presente', 'falta', 'justificada'].includes(m.estado) ? m.estado : 'presente';
      db.prepare(`INSERT INTO presencas (aula_id, aluno, organizacao_id, estado, motivo, registrado_por, registrado_em)
                  VALUES (?,?,?,?,?,?,?)
                  ON CONFLICT(aula_id, aluno) DO UPDATE SET estado = excluded.estado, motivo = excluded.motivo,
                    registrado_por = excluded.registrado_por, registrado_em = excluded.registrado_em`)
        .run(aulaId, m.aluno, a.organizacao_id, estado, s(m.motivo, 300), usuario, nowISO());
      n++;
    }
    direitos.registrar({ ator: usuario, acao: 'chamada', alvo: aulaId, detalhe: { marcados: n } });
    return { marcados: n };
  },

  daAula: (aulaId) => db.prepare('SELECT * FROM presencas WHERE aula_id = ?').all(aulaId),

  /**
   * O que a tela de chamada precisa para ABRIR: a aula, quem está
   * matriculado e o que já foi marcado.
   *
   * A chamada abre no estado atual de propósito. Abrir sempre em branco
   * faria toda correção começar do zero e, pior, faria o professor
   * remarcar por engano quem já estava certo.
   */
  presencas(usuario, aulaId) {
    const a = Aulas.porId(aulaId);
    if (!a) throw recusar('Aula não encontrada.');
    escopo(usuario, a.organizacao_id, { exigir: 'ensino' });
    return { aula: a, turma: Turmas.porId(a.turma_id),
      alunos: alunosDaTurma(a.turma_id), presencas: Aulas.daAula(aulaId) };
  },
};

// ---------------------------------------------------------------------
// Biblioteca institucional
// ---------------------------------------------------------------------
const BibliotecaOrg = {
  /**
   * Compartilha uma obra com a escola ou com uma turma.
   *
   * ⚠️ Passa por `direitos.podeCompartilhar`. Obra de terceiro NÃO entra
   * aqui, inclusive quando quem tenta é professor e inclusive "só para a
   * turma": distribuir para trinta alunos é distribuir.
   */
  adicionar(usuario, orgId, { obraId, turmaId = '', nota = '' }) {
    escopo(usuario, orgId, { exigir: 'ensino' });
    const o = repo.Obras.porId(obraId);
    if (!o) throw new Error('Música não encontrada.');
    if (o.dono !== usuario) throw recusar('Só o dono da música pode compartilhá-la com a escola.');
    const v = direitos.podeCompartilhar(o);
    if (!v.pode) throw recusar(v.motivo + ' Compartilhar com a turma também é distribuir.');
    if (turmaId) {
      const t = Turmas.porId(turmaId);
      if (!t || t.organizacao_id !== orgId) throw recusar('Turma não encontrada nesta escola.');
    }
    const id = novoId();
    db.prepare(`INSERT INTO org_biblioteca (id, organizacao_id, obra_id, turma_id, adicionado_por, nota, criado_em)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(organizacao_id, obra_id, turma_id) DO UPDATE SET nota = excluded.nota`)
      .run(id, orgId, obraId, turmaId, usuario, s(nota, 500), nowISO());
    direitos.registrar({ ator: usuario, acao: 'escola.biblioteca', alvo: orgId, detalhe: { obra: obraId, turma: turmaId } });
    return true;
  },

  daTurma: (orgId, turmaId) => db.prepare(
    `SELECT b.*, o.titulo, o.compositor, o.tom_original FROM org_biblioteca b JOIN obras o ON o.id = b.obra_id
     WHERE b.organizacao_id = ? AND (b.turma_id = '' OR b.turma_id = ?) ORDER BY o.titulo`).all(orgId, turmaId),

  remover(usuario, orgId, obraId, turmaId = '') {
    escopo(usuario, orgId, { exigir: 'ensino' });
    db.prepare('DELETE FROM org_biblioteca WHERE organizacao_id = ? AND obra_id = ? AND turma_id = ?')
      .run(orgId, obraId, turmaId);
    return true;
  },
};

// ---------------------------------------------------------------------
// Boletim
// ---------------------------------------------------------------------
const Boletim = {
  /**
   * Boletim de um aluno numa turma. TUDO é derivado do que aconteceu —
   * nota de tarefa, exercícios feitos e presença. Não existe campo de
   * nota "digitada no boletim": nota vem de uma correção com autor e
   * data, ou não existe.
   */
  doAluno(quem, turmaId, aluno) {
    const t = Turmas.porId(turmaId);
    if (!t) throw recusar('Turma não encontrada.');

    // Quem pode ver: a escola (ensino/secretaria), o próprio aluno, e o
    // responsável por ele quando é menor.
    let permitido = false;
    try { escopo(quem, t.organizacao_id, { exigir: 'ensino' }); permitido = true; } catch (_) { /* segue */ }
    if (!permitido) {
      try { escopo(quem, t.organizacao_id, { exigir: 'secretaria' }); permitido = true; } catch (_) { /* segue */ }
    }
    if (!permitido && quem === aluno) permitido = true;
    if (!permitido) {
      const m = db.prepare('SELECT * FROM matriculas WHERE turma_id = ? AND aluno = ?').get(turmaId, aluno);
      if (m && m.menor && m.responsavel === quem) permitido = true;
    }
    if (!permitido) throw recusar('Este boletim não é seu.');

    const mat = db.prepare('SELECT * FROM matriculas WHERE turma_id = ? AND aluno = ?').get(turmaId, aluno);
    if (!mat) throw recusar('Este aluno não está nesta turma.');

    // ---- notas: vêm das tarefas do professor da turma ----
    const notas = db.prepare(
      `SELECT t.id AS tarefa_id, t.titulo, t.nota_maxima, f.nota, f.origem, f.criado_em, f.autor
       FROM tarefas t
       JOIN submissoes s ON s.tarefa_id = t.id AND s.aluno = ?
       JOIN feedbacks f ON f.submissao_id = s.id
       WHERE t.turma_id = ? AND f.nota IS NOT NULL
       ORDER BY f.criado_em`).all(aluno, turmaId);

    // A nota que vale é a MAIS RECENTE de cada tarefa: se houve revisão
    // de contestação, é ela que conta — e as duas continuam no histórico.
    const porTarefa = {};
    for (const n of notas) porTarefa[n.tarefa_id] = n;
    const validas = Object.values(porTarefa);
    const media = validas.length
      ? Number((validas.reduce((a, n) => a + (n.nota / n.nota_maxima) * 10, 0) / validas.length).toFixed(2))
      : null;

    // ---- presença ----
    const aulas = aulasDaTurma(turmaId);
    const pres = db.prepare(
      `SELECT p.* FROM presencas p JOIN aulas a ON a.id = p.aula_id WHERE a.turma_id = ? AND p.aluno = ?`)
      .all(turmaId, aluno);
    const presentes = pres.filter((p) => p.estado === 'presente').length;
    const justificadas = pres.filter((p) => p.estado === 'justificada').length;
    const faltas = pres.filter((p) => p.estado === 'falta').length;

    // ---- prática (o que o aluno fez por conta) ----
    const est = academia.Pratica.estatisticas(aluno, { dias: 180 });

    return {
      aluno, turma: t, matricula: mat,
      notas: validas.map((n) => ({ tarefa: n.titulo, nota: n.nota, de: n.nota_maxima,
        origem: n.origem, em: n.criado_em })),
      media_geral: media,
      historico_de_notas: notas.length,
      presenca: {
        aulas_registradas: aulas.length,
        chamadas_do_aluno: pres.length,
        presentes, faltas, justificadas,
        // Aula sem chamada NÃO é falta. Contar assim reprovaria o aluno
        // por o professor não ter feito a chamada.
        sem_chamada: Math.max(0, aulas.length - pres.length),
        percentual: pres.length ? Math.round(100 * (presentes + justificadas) / pres.length) : null,
      },
      pratica: {
        exercicios: est.tentativas, acertos: est.acertos,
        valeram_nota: est.valeram_nota, minutos: est.minutos_praticados,
        sequencia_dias: est.sequencia_dias,
      },
      // O boletim DIZ de onde veio cada número. Boletim que não explica a
      // média é boletim que ninguém consegue contestar.
      procedencia: {
        media: 'média das notas mais recentes de cada tarefa da turma, normalizadas para 10',
        presenca: 'só as aulas em que houve chamada; aula sem chamada não conta como falta',
        pratica: 'exercícios feitos pelo aluno nos últimos 180 dias, dentro e fora da turma',
      },
    };
  },

  /** Boletim da turma inteira — a visão da secretaria. */
  daTurma(quem, turmaId) {
    const t = Turmas.porId(turmaId);
    if (!t) throw recusar('Turma não encontrada.');
    escopo(quem, t.organizacao_id, { exigir: 'ensino' });
    return alunosDaTurma(turmaId).map((m) => {
      const b = Boletim.doAluno(quem, turmaId, m.aluno);
      return { aluno: m.aluno, menor: !!m.menor, media_geral: b.media_geral,
        presenca: b.presenca.percentual, exercicios: b.pratica.exercicios };
    });
  },
};

module.exports = {
  PAPEIS, escopo, escopoAluno, escopoQualquer, podeGerir, podeLecionar, podeSecretariar,
  Organizacoes, Turmas, Matriculas, Aulas, BibliotecaOrg, Boletim,
  alunosDaTurma, aulasDaTurma,
};
