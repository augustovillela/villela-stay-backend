// =====================================================================
// Musique · Laboratório — API do que é PESSOAL (paga: passa pelo
// `requireUsuario`, que devolve 402 sem assinatura; ADR-0012/0013).
//
//   · a correção que VALE é a do servidor: regenera a questão pela
//     semente e corrige de novo — o navegador não grava acerto sozinho;
//   · as tentativas entram em `tentativas`/`agenda_revisao` (mesmo diário
//     e mesma revisão espaçada da Academia Musical);
//   · o professor só vê quem está na TAREFA da atividade dele (o vínculo
//     é a tarefa, como no resto do Musique — PAPEIS-E-JORNADAS §3.2);
//   · nenhuma tentativa do Laboratório vale nota sozinha (vale_nota = 0):
//     a nota é do professor, pela tarefa.
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('../db');
const X = require('./nucleo/exercicios');
const ACESSO = require('./acesso');

const s = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(e.status || 400).json({ erro: e.message }));
const erro = (status, msg) => Object.assign(new Error(msg), { status });

// Atividades prontas: pontos de partida curados; o professor ajusta antes de atribuir.
const BIBLIOTECA = [
  { titulo: 'Leitura na clave de sol — notas naturais', tipos: ['nota-na-pauta'], nivel: 1, questoes: 12, params: { clave: 'sol', extensao: 'pauta' } },
  { titulo: 'Leitura na clave de fá — com suplementares', tipos: ['nota-na-pauta'], nivel: 2, questoes: 12, params: { clave: 'fa', extensao: 'suplementares' } },
  { titulo: 'Clave de dó (viola e violoncelo)', tipos: ['nota-na-pauta'], nivel: 1, questoes: 10, params: { clave: 'do3' } },
  { titulo: 'Intervalos essenciais — ler e construir', tipos: ['intervalo-identificar', 'intervalo-construir'], nivel: 1, questoes: 10 },
  { titulo: 'Ouvido: intervalos e acordes', tipos: ['intervalo-ouvido', 'acorde-ouvido'], nivel: 1, questoes: 10 },
  { titulo: 'Tríades e campo harmônico', tipos: ['acorde-identificar', 'campo-grau'], nivel: 1, questoes: 10 },
  { titulo: 'Armaduras até 3 acidentes', tipos: ['armadura-identificar'], nivel: 1, questoes: 10 },
  { titulo: 'Ritmo: completar e ditar', tipos: ['ritmo-completar', 'ditado-ritmico'], nivel: 1, questoes: 8 },
  { titulo: 'Leitura à primeira vista — iniciante', tipos: ['leitura-primeira-vista'], nivel: 1, questoes: 6 },
  { titulo: 'Escala maior no braço do violão', tipos: ['escala-no-braco'], nivel: 1, questoes: 5, params: { instrumento: 'violao' } },
  { titulo: 'Cadências e transposição', tipos: ['cadencia-ouvido', 'transposicao'], nivel: 2, questoes: 8 },
  { titulo: 'Percepção avançada: duas vozes e cadências', tipos: ['ditado-duas-vozes', 'cadencia-ouvido'], nivel: 2, questoes: 8 },
];

function registrarApi(app, { requireUsuario, opcional, ehDocente, buscarContaPorEmail, buscarContaPorId }) {
  const academia = require('../academia');
  const tarefasCampanha = require('../tocar/tarefas-campanha');
  const B = '/music/api/lab';
  app.use(B, (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---- curso de bateria: progresso mensurável e acompanhamento ----
  const bateriaRevisao = (dias) => new Date(Date.now() + Math.max(1, dias) * 86400000).toISOString().slice(0, 10);
  const bateriaAluno = (req) => req.usuario.id;
  app.get(B + '/bateria/progresso', requireUsuario, h(async (req, res) => {
    const linhas = db.prepare('SELECT * FROM curso_bateria_progresso WHERE aluno = ? ORDER BY rudimento').all(bateriaAluno(req));
    res.json({ progresso: linhas, revisao_hoje: linhas.filter((x) => x.proxima_revisao && x.proxima_revisao <= nowISO().slice(0, 10)) });
  }));
  app.get(B + '/bateria/painel', requireUsuario, h(async (req, res) => {
    const row = db.prepare('SELECT dados FROM lab_jornada_progresso WHERE usuario = ?').get(bateriaAluno(req));
    let dados = {}; try { dados = row ? JSON.parse(row.dados || '{}') : {}; } catch (_) {}
    const progresso = db.prepare('SELECT * FROM curso_bateria_progresso WHERE aluno = ? ORDER BY rudimento').all(bateriaAluno(req));
    res.json({ capitulos: dados.curso_bateria || {}, progresso, revisao_hoje: progresso.filter((x) => x.proxima_revisao && x.proxima_revisao <= nowISO().slice(0, 10)) });
  }));
  app.put(B + '/bateria/progresso/:rudimento', requireUsuario, h(async (req, res) => {
    const n = Math.floor(Number(req.params.rudimento));
    if (n < 1 || n > 40) throw erro(400, 'Rudimento inválido.');
    const b = req.body || {};
    const bpm = Math.max(0, Math.min(300, Math.floor(Number(b.bpm) || 0)));
    const reps = Math.max(0, Math.min(1000, Math.floor(Number(b.repeticoes_limpas) || 0)));
    const diagnostico = s(b.diagnostico, 1000);
    const concluido = b.concluido ? 1 : 0;
    const dias = concluido && reps >= 3 ? 7 : 1;
    const agora = nowISO();
    db.prepare(`INSERT INTO curso_bateria_progresso (aluno,rudimento,bpm,repeticoes_limpas,diagnostico,concluido,ultima_pratica,proxima_revisao)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(aluno,rudimento) DO UPDATE SET bpm=excluded.bpm,repeticoes_limpas=excluded.repeticoes_limpas,diagnostico=excluded.diagnostico,concluido=excluded.concluido,ultima_pratica=excluded.ultima_pratica,proxima_revisao=excluded.proxima_revisao`)
      .run(bateriaAluno(req), n, bpm, reps, diagnostico, concluido, agora, bateriaRevisao(dias));
    res.json({ ok: true, progresso: db.prepare('SELECT * FROM curso_bateria_progresso WHERE aluno = ? AND rudimento = ?').get(bateriaAluno(req), n) });
  }));
  app.get(B + '/prof/bateria/aluno/:aluno/progresso', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem consultar este acompanhamento.');
    res.json({ progresso: db.prepare('SELECT * FROM curso_bateria_progresso WHERE aluno = ? ORDER BY rudimento').all(s(req.params.aluno, 120)), observacoes: db.prepare('SELECT * FROM curso_bateria_observacoes WHERE aluno = ? ORDER BY criado_em DESC LIMIT 100').all(s(req.params.aluno, 120)) });
  }));
  app.get(B + '/prof/bateria/alunos', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem consultar este acompanhamento.');
    const alunos = db.prepare(`SELECT aluno, COUNT(*) AS rudimentos_registrados, SUM(concluido) AS rudimentos_consolidados,
      MAX(bpm) AS melhor_bpm, MAX(ultima_pratica) AS ultima_pratica FROM curso_bateria_progresso GROUP BY aluno ORDER BY ultima_pratica DESC`).all();
    res.json({ alunos });
  }));
  app.post(B + '/prof/bateria/tarefas', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem criar tarefas.');
    const b = req.body || {}, tipo = s(b.tipo, 20), alvo = Math.max(0, Math.min(40, Math.floor(Number(b.alvo) || 0)));
    if (!['capitulo', 'rudimento'].includes(tipo) || !alvo) throw erro(400, 'Informe capítulo ou rudimento válido.');
    const tarefa = academia.Tarefas.criar(req.usuario.id, { titulo: s(b.titulo, 200) || `Bateria · ${tipo} ${alvo}`, descricao: `Curso de bateria · ${tipo} ${alvo}. Meta de BPM: ${Math.max(0, Math.min(300, Number(b.bpm) || 0))}.`, instrucoes: s(b.instrucoes, 4000), exige_audio: b.exige_audio !== false, prazo: s(b.prazo, 25) });
    const emails = Array.isArray(b.emails) ? b.emails.map((x) => s(x, 160)) : String(b.emails || '').split(/[,;\s]+/).filter(Boolean).map((x) => s(x, 160));
    const r = emails.length ? academia.Tarefas.atribuirPorEmail(req.usuario.id, tarefa.id, emails, buscarContaPorEmail) : { atribuidos: 0, nao_encontrados: [] };
    res.json({ ok: true, tarefa, ...r, curso_bateria: { tipo, alvo, bpm: Number(b.bpm) || 0 } });
  }));
  app.post(B + '/prof/bateria/observacoes', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem registrar observações.');
    const b = req.body || {}, aluno = s(b.aluno, 120), texto = s(b.texto, 2000);
    if (!aluno || !texto) throw erro(400, 'Informe aluno e observação.');
    const n = Math.max(0, Math.min(40, Math.floor(Number(b.rudimento) || 0)));
    const id = novoId(); db.prepare('INSERT INTO curso_bateria_observacoes (id,professor,aluno,rudimento,tarefa_id,texto,criado_em) VALUES (?,?,?,?,?,?,?)').run(id, req.usuario.id, aluno, n, s(b.tarefa_id, 120), texto, nowISO());
    res.json({ ok: true, observacao: db.prepare('SELECT * FROM curso_bateria_observacoes WHERE id = ?').get(id) });
  }));

  // ---- curso de contrabaixo: leitura do progresso sincronizado ----
  const baixoProgresso = (linha) => {
    let dados = {};
    try { dados = JSON.parse(linha.dados || '{}'); } catch (_) {}
    const concluidas = dados['curso-contrabaixo-concluidas-v1'] || dados.curso_contrabaixo || {};
    const itens = Object.entries(concluidas).filter(([, valor]) => !!valor).map(([slug, data]) => ({ slug, concluido_em: data }));
    return { aluno: linha.usuario, concluidas: itens, total: itens.length, percentual: Math.round(itens.length / 43 * 100) };
  };
  app.get(B + '/prof/contrabaixo/alunos', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem consultar este acompanhamento.');
    const alunos = db.prepare("SELECT usuario, dados FROM lab_jornada_progresso WHERE dados LIKE '%curso-contrabaixo%'").all().map(baixoProgresso).sort((a, b) => b.total - a.total || a.aluno.localeCompare(b.aluno));
    res.json({ curso: 'curso-contrabaixo-livro', total_capitulos: 43, alunos });
  }));
  app.get(B + '/prof/contrabaixo/aluno/:aluno/progresso', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem consultar este acompanhamento.');
    const aluno = s(req.params.aluno, 120);
    const linha = db.prepare('SELECT usuario, dados FROM lab_jornada_progresso WHERE usuario = ?').get(aluno);
    const sessoes = db.prepare(`SELECT id, trilha_id, meta, anotacao, iniciada_em FROM sessoes_pratica WHERE usuario = ? AND trilha_id LIKE 'contrabaixo:%' ORDER BY iniciada_em DESC LIMIT 50`).all(aluno).map((x) => { let meta = {}; try { meta = JSON.parse(x.meta || '{}'); } catch (_) {} return { id: x.id, capitulo: x.trilha_id.slice('contrabaixo:'.length), ...meta, notas: x.anotacao, data: x.iniciada_em }; });
    res.json({ curso: 'curso-contrabaixo-livro', total_capitulos: 43, progresso: linha ? baixoProgresso(linha) : { aluno, concluidas: [], total: 0, percentual: 0 }, sessoes, observacoes: db.prepare('SELECT * FROM curso_contrabaixo_observacoes WHERE aluno = ? ORDER BY criado_em DESC LIMIT 100').all(aluno) });
  }));
  app.post(B + '/prof/contrabaixo/observacoes', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem registrar observações.');
    const b = req.body || {}, aluno = s(b.aluno, 120), texto = s(b.texto, 2000), capitulo = Math.max(0, Math.min(43, Math.floor(Number(b.capitulo) || 0)));
    if (!aluno || !texto) throw erro(400, 'Informe aluno e observação.');
    const id = novoId();
    db.prepare('INSERT INTO curso_contrabaixo_observacoes (id,professor,aluno,capitulo,texto,criado_em) VALUES (?,?,?,?,?,?)').run(id, req.usuario.id, aluno, capitulo, texto, nowISO());
    res.json({ ok: true, observacao: db.prepare('SELECT * FROM curso_contrabaixo_observacoes WHERE id = ?').get(id) });
  }));
  app.post(B + '/prof/contrabaixo/tarefas', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem criar tarefas.');
    const b = req.body || {}, capitulo = Math.max(1, Math.min(43, Math.floor(Number(b.capitulo) || 0))), bpm = Math.max(0, Math.min(300, Math.floor(Number(b.bpm) || 0)));
    if (!capitulo) throw erro(400, 'Informe um capítulo válido.');
    const tarefa = academia.Tarefas.criar(req.usuario.id, { titulo: s(b.titulo, 200) || `Contrabaixo · capítulo ${capitulo}`, descricao: `Curso de contrabaixo · capítulo ${capitulo}. Meta de BPM: ${bpm}.`, instrucoes: s(b.instrucoes, 4000), exige_audio: b.exige_audio !== false, prazo: s(b.prazo, 25) });
    const emails = Array.isArray(b.emails) ? b.emails.map((x) => s(x, 160)) : String(b.emails || '').split(/[,;\s]+/).filter(Boolean).map((x) => s(x, 160));
    const r = emails.length ? academia.Tarefas.atribuirPorEmail(req.usuario.id, tarefa.id, emails, buscarContaPorEmail) : { atribuidos: 0, nao_encontrados: [] };
    res.json({ ok: true, tarefa, ...r, curso_contrabaixo: { capitulo, bpm } });
  }));

  // ---- Tocar junto: tarefas ligadas a uma campanha de estudo ----
  // Mantém a tarefa na Academia (permissões, submissões e devolutivas) e
  // guarda apenas o vínculo específico do estudo neste módulo.
  app.post(B + '/prof/tocar/tarefas', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    const b = req.body || {};
    const vinculo = tarefasCampanha.normalizar(b);
    const tarefa = academia.Tarefas.criar(req.usuario.id, {
      titulo: s(b.titulo, 200) || `Tocar junto · ${vinculo.instrumento}`,
      descricao: s(b.descricao, 2000) || `Estudo ${vinculo.estudo_id} no instrumento ${vinculo.instrumento}.`,
      instrucoes: s(b.instrucoes, 4000), exige_audio: b.exige_audio !== false, prazo: s(b.prazo, 25),
    });
    tarefasCampanha.vincular(tarefa.id, vinculo);
    const emails = (Array.isArray(b.emails) ? b.emails : String(b.emails || '').split(/[\s,;]+/))
      .map((x) => s(x, 160)).filter(Boolean).slice(0, 200);
    const atribuicao = emails.length ? academia.Tarefas.atribuirPorEmail(req.usuario.id, tarefa.id, emails, buscarContaPorEmail) : { atribuidos: 0, nao_encontrados: [] };
    res.status(201).json({ ok: true, tarefa, campanha: tarefasCampanha.porTarefa(tarefa.id), ...atribuicao });
  }));

  app.get(B + '/prof/tocar/tarefas', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    const tarefas = academia.Tarefas.doProfessor(req.usuario.id).map((t) => ({ ...t, campanha: tarefasCampanha.porTarefa(t.id) })).filter((t) => t.campanha);
    res.json({ tarefas });
  }));

  app.get(B + '/tocar/tarefas', requireUsuario, h(async (req, res) => {
    const tarefas = academia.Tarefas.doAluno(req.usuario.id).map((t) => ({ ...t, campanha: tarefasCampanha.porTarefa(t.id) })).filter((t) => t.campanha);
    res.json({ tarefas });
  }));

  app.get(B + '/prof/tocar/tarefas/:id', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    const tarefa = academia.Tarefas.porId(s(req.params.id, 120));
    if (!tarefa || tarefa.professor !== req.usuario.id) throw erro(404, 'Tarefa não encontrada.');
    if (!tarefasCampanha.porTarefa(tarefa.id)) throw erro(404, 'Vínculo de campanha não encontrado.');
    res.json({ tarefa, campanha: tarefasCampanha.porTarefa(tarefa.id), alunos: academia.Tarefas.alunosDa(tarefa.id), submissoes: academia.Submissoes.daTarefa(req.usuario.id, tarefa.id) });
  }));

  /** Corrige de novo, grava e agenda a revisão. */
  function gravarResposta(usuario, { tipo, nivel, semente, params = {}, resposta, ms = 0, sessao = '' }) {
    if (!X.TIPOS[tipo]) throw erro(400, 'Exercício desconhecido.');
    if (semente == null || semente === '') throw erro(400, 'Falta a semente da questão.');
    const q = X.gerar(tipo, { nivel, semente, params: params && typeof params === 'object' ? params : {} });   // gerar() só aceita os parâmetros declarados
    const c = X.corrigir(q, String(resposta == null ? '' : resposta).slice(0, 2000));
    const familia = 'lab:' + q.habilidade;
    db.prepare(`INSERT INTO tentativas (id, usuario, tipo, familia, nivel, semente, modo, enunciado, esperado, resposta,
                acerto, confianca, vale_nota, medida, criterio, tolerancia, explicacao, ressalvas, sessao_id, trilha_id, ms_gasto, criado_em)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,'{}',?,'{}',?,'[]',?,'',?,?)`)
      .run(novoId(), usuario, 'lab:' + tipo, familia, q.nivel, String(semente), q.mede, s(q.enunciado, 500),
        JSON.stringify({ resposta: q.resposta, versao: q.versao, params: q.params }), JSON.stringify({ resposta: s(resposta, 400) }),
        c.certo ? 1 : 0, 1, 'mede ' + q.mede, s(c.explicacao, 1000), s(sessao, 60), Math.max(0, Math.min(600000, Number(ms) || 0)), nowISO());
    const rev = academia.Pratica.atualizarRevisao(usuario, familia, q.nivel, { acerto: c.certo, confianca: 1, vale_nota: false });
    return { ...c, proxima_revisao_dias: rev.revisar_em_dias };
  }

  app.post(B + '/responder', requireUsuario, h(async (req, res) => {
    const b = req.body || {};
    const sessao = s(b.sessao, 60);
    // tentativa de atividade só conta se o aluno está na tarefa dela
    if (sessao.startsWith('atv:')) {
      const at = Atividades.porId(sessao.split(':')[1]);
      if (!at || !academia.Tarefas.temAluno(at.tarefa_id, req.usuario.id)) throw erro(403, 'Esta atividade não foi atribuída a você.');
    }
    res.json(gravarResposta(req.usuario.id, { tipo: s(b.tipo, 40), nivel: Number(b.nivel) || 1, semente: b.semente, params: b.params, resposta: b.resposta, ms: b.ms, sessao }));
  }));

  /** Progresso por exercício e por habilidade; erros recentes; revisão. */
  app.get(B + '/progresso', requireUsuario, h(async (req, res) => {
    const u = req.usuario.id;
    const linhas = db.prepare(`SELECT tipo, familia, nivel, acerto, explicacao, criado_em, enunciado FROM tentativas
                               WHERE usuario = ? AND tipo LIKE 'lab:%' ORDER BY criado_em DESC LIMIT 2000`).all(u);
    const porTipo = {};
    linhas.forEach((l) => {
      const k = l.tipo.slice(4);
      const x = porTipo[k] || (porTipo[k] = { tentativas: 0, acertos: 0, recentes: [], nivel: 1 });
      x.tentativas++; if (l.acerto) x.acertos++;
      if (x.recentes.length < 10) x.recentes.push(l.acerto ? 1 : 0);
      x.nivel = Math.max(x.nivel, l.nivel);
    });
    Object.values(porTipo).forEach((x) => {
      const taxa = x.recentes.length ? x.recentes.reduce((a, b) => a + b, 0) / x.recentes.length : 0;
      // domínio com regra LEGÍVEL: 10 recentes, ≥ 90% = dominado; ≥ 70% = firmando
      x.dominio = x.recentes.length >= 10 && taxa >= 0.9 ? 'dominado' : taxa >= 0.7 ? 'firmando' : 'praticando';
      x.taxa_recente = Math.round(taxa * 100);
    });
    const revisar = db.prepare(`SELECT familia, nivel, revisar_em FROM agenda_revisao WHERE usuario = ? AND familia LIKE 'lab:%'
                                AND revisar_em <= ? ORDER BY revisar_em`).all(u, nowISO().slice(0, 10));
    const erros = linhas.filter((l) => !l.acerto).slice(0, 15).map((l) => ({ tipo: l.tipo.slice(4), enunciado: l.enunciado, explicacao: l.explicacao, em: l.criado_em }));
    res.json({ por_tipo: porTipo, revisar_hoje: revisar.map((r) => ({ ...r, habilidade: r.familia.slice(4), tipos: X.LISTA.filter((x) => 'lab:' + x.habilidade === r.familia).map((x) => x.id) })), erros_recentes: erros });
  }));

  /** Nível sugerido (dificuldade adaptativa com a regra do currículo). */
  app.get(B + '/nivel/:tipo', requireUsuario, h(async (req, res) => {
    const t = X.TIPOS[req.params.tipo];
    if (!t) throw erro(404, 'Exercício desconhecido.');
    const n = academia.Pratica.nivelSugerido(req.usuario.id, 'lab:' + t.habilidade, 1);
    res.json({ nivel: Math.min(t.niveis.length, n) });
  }));

  // ---- perfil ("por onde começar?") ----
  const PERFIL = { nivel: ['comecando', 'toco', 'avancado'], instrumento: ['violao', 'guitarra', 'teclado', 'voz', 'baixo', 'cavaquinho', 'ukulele', 'violao-7', 'outro'], objetivo: ['teoria', 'tocar', 'ouvido', 'compor', 'ensinar'] };
  app.get(B + '/perfil', requireUsuario, h(async (req, res) => {
    const p = db.prepare('SELECT nivel, instrumento, objetivo FROM lab_perfil WHERE usuario = ?').get(req.usuario.id);
    res.json({ perfil: p || null });
  }));
  app.post(B + '/perfil', requireUsuario, h(async (req, res) => {
    const b = req.body || {};
    const v = {}; Object.keys(PERFIL).forEach((k) => { if (!PERFIL[k].includes(b[k])) throw erro(400, 'Valor inválido: ' + k); v[k] = b[k]; });
    db.prepare(`INSERT INTO lab_perfil (usuario, nivel, instrumento, objetivo, atualizado_em) VALUES (?,?,?,?,?)
                ON CONFLICT(usuario) DO UPDATE SET nivel = excluded.nivel, instrumento = excluded.instrumento, objetivo = excluded.objetivo, atualizado_em = excluded.atualizado_em`)
      .run(req.usuario.id, v.nivel, v.instrumento, v.objetivo, nowISO());
    res.json({ ok: true });
  }));

  // ---- diário de prática do curso de contrabaixo -----------------------
  app.get(B + '/contrabaixo/praticas', requireUsuario, h(async (req, res) => {
    const slug = s(req.query.capitulo, 80);
    const linhas = db.prepare(`SELECT id, meta, anotacao, iniciada_em FROM sessoes_pratica
      WHERE usuario = ? AND trilha_id = ? ORDER BY iniciada_em DESC LIMIT 20`).all(req.usuario.id, 'contrabaixo:' + slug);
    res.json({ praticas: linhas.map((x) => { let meta = {}; try { meta = JSON.parse(x.meta || '{}'); } catch (_) {} return { id: x.id, ...meta, notas: x.anotacao, data: x.iniciada_em }; }) });
  }));
  app.post(B + '/contrabaixo/praticas', requireUsuario, h(async (req, res) => {
    const b = req.body || {}, capitulo = s(b.capitulo, 80), foco = s(b.foco, 30), notas = s(b.notas, 500), bpm = Number(b.bpm);
    const numeroCapitulo = Number(capitulo.slice('contrabaixo-'.length));
    if (!/^contrabaixo-\d{2}$/.test(capitulo) || numeroCapitulo < 1 || numeroCapitulo > 43 || !['som', 'tempo', 'tecnica', 'leitura', 'expressao'].includes(foco) || !(bpm >= 20 && bpm <= 300)) throw erro(400, 'Capítulo, foco ou BPM inválido.');
    const id = novoId(), quando = nowISO();
    db.prepare(`INSERT INTO sessoes_pratica (id, usuario, trilha_id, meta, anotacao, iniciada_em, encerrada_em) VALUES (?,?,?,?,?,?,?)`)
      .run(id, req.usuario.id, 'contrabaixo:' + capitulo, JSON.stringify({ bpm, foco }), notas, quando, quando);
    res.status(201).json({ ok: true, pratica: { id, bpm, foco, notas, data: quando } });
  }));

  // ---- diário de prática do curso de cavaquinho ------------------------
  app.get(B + '/cavaquinho/praticas', requireUsuario, h(async (req, res) => {
    const slug = s(req.query.capitulo, 80);
    const linhas = db.prepare(`SELECT id, meta, anotacao, iniciada_em FROM sessoes_pratica
      WHERE usuario = ? AND trilha_id = ? ORDER BY iniciada_em DESC LIMIT 20`).all(req.usuario.id, 'cavaquinho:' + slug);
    res.json({ praticas: linhas.map((x) => { let meta = {}; try { meta = JSON.parse(x.meta || '{}'); } catch (_) {} return { id: x.id, ...meta, notas: x.anotacao, data: x.iniciada_em }; }) });
  }));
  app.get(B + '/cavaquinho/progresso', requireUsuario, h(async (req, res) => {
    const linhas = db.prepare('SELECT capitulo, concluido, atualizado_em FROM curso_cavaquinho_progresso WHERE aluno = ? ORDER BY capitulo').all(req.usuario.id);
    res.json({ curso: 'curso-cavaquinho', total_capitulos: 38, progresso: linhas });
  }));
  app.put(B + '/cavaquinho/progresso/:capitulo', requireUsuario, h(async (req, res) => {
    const capitulo = s(req.params.capitulo, 80), n = Number(capitulo.slice('cavaquinho-'.length));
    if (!/^cavaquinho-\d{2}$/.test(capitulo) || n < 1 || n > 38) throw erro(400, 'Capítulo de cavaquinho inválido.');
    const concluido = req.body && req.body.concluido ? 1 : 0, quando = nowISO();
    db.prepare(`INSERT INTO curso_cavaquinho_progresso (aluno,capitulo,concluido,atualizado_em) VALUES (?,?,?,?) ON CONFLICT(aluno,capitulo) DO UPDATE SET concluido=excluded.concluido, atualizado_em=excluded.atualizado_em`).run(req.usuario.id, capitulo, concluido, quando);
    res.json({ ok: true, capitulo, concluido: !!concluido, atualizado_em: quando });
  }));
  app.post(B + '/cavaquinho/praticas', requireUsuario, h(async (req, res) => {
    const b = req.body || {}, capitulo = s(b.capitulo, 80), foco = s(b.foco, 30), notas = s(b.notas, 500), bpm = Number(b.bpm);
    const numeroCapitulo = Number(capitulo.slice('cavaquinho-'.length));
    if (!/^cavaquinho-\d{2}$/.test(capitulo) || numeroCapitulo < 1 || numeroCapitulo > 38 || !['som', 'tempo', 'tecnica', 'leitura', 'expressao'].includes(foco) || !(bpm >= 20 && bpm <= 300)) throw erro(400, 'Capítulo, foco ou BPM inválido.');
    const id = novoId(), quando = nowISO();
    db.prepare(`INSERT INTO sessoes_pratica (id, usuario, trilha_id, meta, anotacao, iniciada_em, encerrada_em) VALUES (?,?,?,?,?,?,?)`)
      .run(id, req.usuario.id, 'cavaquinho:' + capitulo, JSON.stringify({ bpm, foco }), notas, quando, quando);
    res.status(201).json({ ok: true, pratica: { id, bpm, foco, notas, data: quando } });
  }));
  app.get(B + '/prof/cavaquinho/alunos', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem consultar este acompanhamento.');
    const alunos = db.prepare("SELECT s.usuario, COUNT(DISTINCT s.id) AS sessoes, MAX(s.iniciada_em) AS ultima_pratica, COALESCE(p.concluidos, 0) AS concluidos FROM sessoes_pratica s LEFT JOIN (SELECT aluno, COUNT(*) AS concluidos FROM curso_cavaquinho_progresso WHERE concluido = 1 GROUP BY aluno) p ON p.aluno = s.usuario WHERE s.trilha_id LIKE 'cavaquinho:%' GROUP BY s.usuario, p.concluidos ORDER BY ultima_pratica DESC").all().map((a) => ({ ...a, percentual: Math.round(a.concluidos / 38 * 100) }));
    res.json({ curso: 'curso-cavaquinho', total_capitulos: 38, alunos });
  }));
  app.get(B + '/prof/cavaquinho/aluno/:aluno/praticas', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem consultar este acompanhamento.');
    const aluno = s(req.params.aluno, 120);
    const sessoes = db.prepare("SELECT id, trilha_id, meta, anotacao, iniciada_em FROM sessoes_pratica WHERE usuario = ? AND trilha_id LIKE 'cavaquinho:%' ORDER BY iniciada_em DESC LIMIT 100").all(aluno).map((x) => { let meta = {}; try { meta = JSON.parse(x.meta || '{}'); } catch (_) {} return { id: x.id, capitulo: x.trilha_id.slice('cavaquinho:'.length), ...meta, notas: x.anotacao, data: x.iniciada_em }; });
    const observacoes = db.prepare('SELECT * FROM curso_cavaquinho_observacoes WHERE aluno = ? ORDER BY criado_em DESC LIMIT 100').all(aluno);
    res.json({ curso: 'curso-cavaquinho', aluno, sessoes, observacoes });
  }));
  app.post(B + '/prof/cavaquinho/observacoes', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem registrar observações.');
    const b = req.body || {}, aluno = s(b.aluno, 120), texto = s(b.texto, 2000), capitulo = Math.max(0, Math.min(38, Math.floor(Number(b.capitulo) || 0)));
    if (!aluno || !texto) throw erro(400, 'Informe aluno e observação.');
    const id = novoId();
    db.prepare('INSERT INTO curso_cavaquinho_observacoes (id,professor,aluno,capitulo,texto,criado_em) VALUES (?,?,?,?,?,?)').run(id, req.usuario.id, aluno, capitulo, texto, nowISO());
    res.json({ ok: true, observacao: db.prepare('SELECT * FROM curso_cavaquinho_observacoes WHERE id = ?').get(id) });
  }));
  app.post(B + '/prof/cavaquinho/tarefas', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem criar tarefas.');
    const b = req.body || {}, capitulo = Math.max(1, Math.min(38, Math.floor(Number(b.capitulo) || 0))), bpm = Math.max(0, Math.min(300, Math.floor(Number(b.bpm) || 0)));
    if (!capitulo) throw erro(400, 'Informe um capítulo válido.');
    const tarefa = academia.Tarefas.criar(req.usuario.id, { titulo: s(b.titulo, 200) || `Cavaquinho · capítulo ${capitulo}`, descricao: `Curso de cavaquinho · capítulo ${capitulo}. Meta de BPM: ${bpm}.`, instrucoes: s(b.instrucoes, 4000), exige_audio: b.exige_audio !== false, prazo: s(b.prazo, 25) });
    const emails = String(b.emails || '').split(/[,;\s]+/).filter(Boolean).map((x) => s(x, 160));
    const atribuicao = emails.length ? academia.Tarefas.atribuirPorEmail(req.usuario.id, tarefa.id, emails, buscarContaPorEmail) : { atribuidos: 0, nao_encontrados: [] };
    res.json({ ok: true, tarefa, ...atribuicao, curso_cavaquinho: { capitulo, bpm } });
  }));

  // ---- diário de prática do curso de piano -----------------------------
  app.get(B + '/piano/praticas', requireUsuario, h(async (req, res) => {
    const slug = s(req.query.capitulo, 80);
    const linhas = db.prepare(`SELECT id, meta, anotacao, iniciada_em FROM sessoes_pratica
      WHERE usuario = ? AND trilha_id = ? ORDER BY iniciada_em DESC LIMIT 20`).all(req.usuario.id, 'piano:' + slug);
    res.json({ praticas: linhas.map((x) => { let meta = {}; try { meta = JSON.parse(x.meta || '{}'); } catch (_) {} return { id: x.id, ...meta, notas: x.anotacao, data: x.iniciada_em }; }) });
  }));
  app.post(B + '/piano/praticas', requireUsuario, h(async (req, res) => {
    const b = req.body || {}, capitulo = s(b.capitulo, 80), foco = s(b.foco, 30), notas = s(b.notas, 500), bpm = Number(b.bpm);
    const numeroCapitulo = Number(capitulo.slice('piano-'.length));
    if (!/^piano-\d{2}$/.test(capitulo) || numeroCapitulo < 1 || numeroCapitulo > 42 || !['som', 'tempo', 'tecnica', 'leitura', 'expressao', 'criacao'].includes(foco) || !(bpm >= 20 && bpm <= 300)) throw erro(400, 'Capítulo, foco ou BPM inválido.');
    const id = novoId(), quando = nowISO();
    db.prepare(`INSERT INTO sessoes_pratica (id, usuario, trilha_id, meta, anotacao, iniciada_em, encerrada_em) VALUES (?,?,?,?,?,?,?)`)
      .run(id, req.usuario.id, 'piano:' + capitulo, JSON.stringify({ bpm, foco }), notas, quando, quando);
    res.status(201).json({ ok: true, pratica: { id, bpm, foco, notas, data: quando } });
  }));
  app.get(B + '/piano/progresso', requireUsuario, h(async (req, res) => {
    const linhas = db.prepare('SELECT capitulo, checklist, concluido, atualizado_em, proxima_revisao FROM curso_piano_progresso WHERE aluno = ? ORDER BY capitulo').all(req.usuario.id);
    res.json({ curso: 'curso-piano-livro', progresso: linhas.map((x) => { let checklist = {}; try { checklist = JSON.parse(x.checklist || '{}'); } catch (_) {} return { capitulo: x.capitulo, checklist, concluido: !!x.concluido, atualizado_em: x.atualizado_em, proxima_revisao: x.proxima_revisao }; }) });
  }));
  app.get(B + '/piano/revisoes', requireUsuario, h(async (req, res) => {
    const agora = nowISO();
    const linhas = db.prepare('SELECT capitulo, proxima_revisao, concluido FROM curso_piano_progresso WHERE aluno = ? AND proxima_revisao <> ? AND proxima_revisao <= ? ORDER BY proxima_revisao').all(req.usuario.id, '', agora);
    res.json({ curso: 'curso-piano-livro', revisoes: linhas });
  }));
  app.put(B + '/piano/progresso/:capitulo', requireUsuario, h(async (req, res) => {
    const capitulo = s(req.params.capitulo, 40), n = Number(capitulo.slice('piano-'.length));
    if (!/^piano-\d{2}$/.test(capitulo) || n < 1 || n > 42) throw erro(400, 'Capítulo de Piano inválido.');
    const b = req.body || {}, existente = db.prepare('SELECT checklist FROM curso_piano_progresso WHERE aluno = ? AND capitulo = ?').get(req.usuario.id, capitulo), checklist = b.checklist && typeof b.checklist === 'object' ? b.checklist : (() => { try { return JSON.parse((existente && existente.checklist) || '{}'); } catch (_) { return {}; } })(), concluido = b.concluido ? 1 : 0, quando = nowISO(), revisao = new Date(Date.now() + (concluido ? 7 : 1) * 86400000).toISOString();
    db.prepare(`INSERT INTO curso_piano_progresso (aluno,capitulo,checklist,concluido,atualizado_em,proxima_revisao) VALUES (?,?,?,?,?,?) ON CONFLICT(aluno,capitulo) DO UPDATE SET checklist=excluded.checklist, concluido=excluded.concluido, atualizado_em=excluded.atualizado_em, proxima_revisao=excluded.proxima_revisao`).run(req.usuario.id, capitulo, JSON.stringify(checklist), concluido, quando, revisao);
    res.json({ ok: true, capitulo, checklist, concluido: !!concluido, atualizado_em: quando, proxima_revisao: revisao });
  }));
  app.get(B + '/prof/piano/alunos', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem consultar este acompanhamento.');
    const alunos = db.prepare("SELECT usuario, COUNT(*) AS sessoes, MAX(iniciada_em) AS ultima_pratica FROM sessoes_pratica WHERE trilha_id LIKE 'piano:%' GROUP BY usuario ORDER BY ultima_pratica DESC").all();
    res.json({ curso: 'curso-piano-livro', total_capitulos: 42, alunos });
  }));
  app.get(B + '/prof/piano/aluno/:aluno/praticas', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem consultar este acompanhamento.');
    const aluno = s(req.params.aluno, 120);
    const sessoes = db.prepare("SELECT id, trilha_id, meta, anotacao, iniciada_em FROM sessoes_pratica WHERE usuario = ? AND trilha_id LIKE 'piano:%' ORDER BY iniciada_em DESC LIMIT 100").all(aluno).map((x) => { let meta = {}; try { meta = JSON.parse(x.meta || '{}'); } catch (_) {} return { id: x.id, capitulo: x.trilha_id.slice('piano:'.length), ...meta, notas: x.anotacao, data: x.iniciada_em }; });
    res.json({ curso: 'curso-piano-livro', aluno, sessoes });
  }));
  app.get(B + '/prof/piano/aluno/:aluno/progresso', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem consultar este acompanhamento.');
    const aluno = s(req.params.aluno, 120), progresso = db.prepare('SELECT capitulo, checklist, concluido, atualizado_em, proxima_revisao FROM curso_piano_progresso WHERE aluno = ? ORDER BY capitulo').all(aluno).map((x) => { let checklist = {}; try { checklist = JSON.parse(x.checklist || '{}'); } catch (_) {} return { capitulo: x.capitulo, checklist, concluido: !!x.concluido, atualizado_em: x.atualizado_em, proxima_revisao: x.proxima_revisao }; });
    res.json({ curso: 'curso-piano-livro', aluno, total_capitulos: 42, concluidos: progresso.filter((x) => x.concluido).length, progresso });
  }));
  app.post(B + '/prof/piano/tarefas', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem criar tarefas.');
    const b = req.body || {}, capitulo = Math.max(1, Math.min(42, Math.floor(Number(b.capitulo) || 0))), bpm = Math.max(0, Math.min(300, Math.floor(Number(b.bpm) || 0)));
    if (!capitulo) throw erro(400, 'Informe um capítulo válido.');
    const tarefa = academia.Tarefas.criar(req.usuario.id, { titulo: s(b.titulo, 200) || `Piano · capítulo ${capitulo}`, descricao: `Curso de Piano · capítulo ${capitulo}. Meta de BPM: ${bpm || 'conforme a aula'}.`, instrucoes: s(b.instrucoes, 4000), exige_audio: b.exige_audio !== false, prazo: s(b.prazo, 25) });
    const emails = Array.isArray(b.emails) ? b.emails.map((x) => s(x, 160)) : String(b.emails || '').split(/[,;\s]+/).filter(Boolean).map((x) => s(x, 160));
    const atribuicao = emails.length ? academia.Tarefas.atribuirPorEmail(req.usuario.id, tarefa.id, emails, buscarContaPorEmail) : { atribuidos: 0, nao_encontrados: [] };
    res.json({ ok: true, tarefa, curso_piano: { capitulo, bpm }, ...atribuicao });
  }));
  app.post(B + '/prof/piano/observacoes', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem registrar observações.');
    const b = req.body || {}, aluno = s(b.aluno, 120), texto = s(b.texto, 2000), capitulo = Math.max(0, Math.min(42, Math.floor(Number(b.capitulo) || 0)));
    if (!aluno || !texto) throw erro(400, 'Informe aluno e observação.');
    const id = novoId();
    db.prepare('INSERT INTO curso_piano_observacoes (id,professor,aluno,capitulo,texto,criado_em) VALUES (?,?,?,?,?,?)').run(id, req.usuario.id, aluno, capitulo, texto, nowISO());
    res.json({ ok: true, observacao: db.prepare('SELECT * FROM curso_piano_observacoes WHERE id = ?').get(id) });
  }));
  app.get(B + '/prof/piano/aluno/:aluno/observacoes', requireUsuario, h(async (req, res) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Apenas professores podem consultar observações.');
    const aluno = s(req.params.aluno, 120);
    res.json({ curso: 'curso-piano-livro', aluno, observacoes: db.prepare('SELECT * FROM curso_piano_observacoes WHERE aluno = ? ORDER BY criado_em DESC LIMIT 100').all(aluno) });
  }));

  // ---- jornada de violão/guitarra: sincronização entre dispositivos ----
  app.get(B + '/jornada-guitarra', requireUsuario, h(async (req, res) => {
    const row = db.prepare('SELECT dados, atualizado_em FROM lab_jornada_progresso WHERE usuario = ?').get(req.usuario.id);
    let progresso = null;
    if (row) {
      try { progresso = JSON.parse(row.dados || '{}'); } catch (_) { progresso = null; }
    }
    res.json({ progresso, atualizado_em: row ? row.atualizado_em : '' });
  }));
  app.put(B + '/jornada-guitarra', requireUsuario, h(async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const dados = {
      versao: 1,
      jornada: b.jornada && typeof b.jornada === 'object' ? b.jornada : {},
      favoritos: b.favoritos && typeof b.favoritos === 'object' ? b.favoritos : {},
      curso: b.curso && typeof b.curso === 'object' ? b.curso : {},
      repertorio: Array.isArray(b.repertorio) ? b.repertorio.slice(0, 100) : [],
      aquecimentos: Math.max(0, Math.min(1000000, Number(b.aquecimentos) || 0)),
      sessoes_focadas: Math.max(0, Math.min(1000000, Number(b.sessoes_focadas) || 0)),
      checkin: b.checkin && typeof b.checkin === 'object' ? b.checkin : {},
      curso_teoria: b.curso_teoria && typeof b.curso_teoria === 'object' ? b.curso_teoria : {},
      curso_bateria: b.curso_bateria && typeof b.curso_bateria === 'object' ? b.curso_bateria : {},
    };
    const texto = JSON.stringify(dados);
    if (texto.length > 250000) throw erro(400, 'O progresso excede o limite permitido.');
    const quando = nowISO();
    db.prepare(`INSERT INTO lab_jornada_progresso (usuario, dados, atualizado_em) VALUES (?,?,?)
                ON CONFLICT(usuario) DO UPDATE SET dados = excluded.dados, atualizado_em = excluded.atualizado_em`)
      .run(req.usuario.id, texto, quando);
    res.json({ ok: true, progresso: dados, atualizado_em: quando });
  }));

  // ---- JSON gerado pelas ferramentas: salvar na conta ----
  app.get(B + '/arquivos-json', requireUsuario, h(async (req, res) => {
    const linhas = db.prepare('SELECT nome, dados, criado_em, atualizado_em FROM lab_arquivos_json WHERE usuario = ? ORDER BY atualizado_em DESC').all(req.usuario.id);
    res.json({ arquivos: linhas.map((x) => { let dados = {}; try { dados = JSON.parse(x.dados || '{}'); } catch (_) {} return { ...x, dados }; }) });
  }));
  app.put(B + '/arquivos-json', requireUsuario, h(async (req, res) => {
    const b = req.body || {};
    const nome = s(b.nome, 160);
    if (!/^[a-z0-9][a-z0-9._-]*\.json$/i.test(nome)) throw erro(400, 'Nome de JSON inválido.');
    const dados = b.dados && typeof b.dados === 'object' ? b.dados : null;
    if (!dados) throw erro(400, 'O JSON precisa ser um objeto.');
    const texto = JSON.stringify(dados);
    if (texto.length > 250000) throw erro(400, 'O JSON excede o limite permitido.');
    const agora = nowISO();
    db.prepare(`INSERT INTO lab_arquivos_json (usuario, nome, dados, criado_em, atualizado_em) VALUES (?,?,?,?,?)
                ON CONFLICT(usuario, nome) DO UPDATE SET dados = excluded.dados, atualizado_em = excluded.atualizado_em`)
      .run(req.usuario.id, nome, texto, agora, agora);
    res.json({ ok: true, nome, atualizado_em: agora });
  }));
  app.delete(B + '/arquivos-json', requireUsuario, h(async (req, res) => {
    const nome = s((req.body || {}).nome || req.query.nome, 160);
    db.prepare('DELETE FROM lab_arquivos_json WHERE usuario = ? AND nome = ?').run(req.usuario.id, nome);
    res.json({ ok: true });
  }));

  // ---- favoritos ----
  app.get(B + '/favoritos', requireUsuario, h(async (req, res) => {
    res.json({ favoritos: db.prepare('SELECT url, titulo, criado_em FROM lab_favoritos WHERE usuario = ? ORDER BY criado_em DESC').all(req.usuario.id) });
  }));
  app.post(B + '/favoritos', requireUsuario, h(async (req, res) => {
    const url = s((req.body || {}).url, 300);
    if (!/^\/music\/[a-z0-9/%#_.-]+$/i.test(url)) throw erro(400, 'Só páginas do Musique viram favorito.');
    db.prepare(`INSERT INTO lab_favoritos (usuario, url, titulo, criado_em) VALUES (?,?,?,?)
                ON CONFLICT(usuario, url) DO UPDATE SET titulo = excluded.titulo`).run(req.usuario.id, url, s((req.body || {}).titulo, 200), nowISO());
    res.json({ ok: true });
  }));
  app.delete(B + '/favoritos', requireUsuario, h(async (req, res) => {
    db.prepare('DELETE FROM lab_favoritos WHERE usuario = ? AND url = ?').run(req.usuario.id, s((req.body || {}).url || req.query.url, 300));
    res.json({ ok: true });
  }));

  // ---- jogos: melhor marca e desafio do dia ----
  app.post(B + '/jogos', requireUsuario, h(async (req, res) => {
    const b = req.body || {};
    const jogo = s(b.jogo, 40);
    if (!/^[a-z-]+$/.test(jogo)) throw erro(400, 'Jogo inválido.');
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(b.dia) ? b.dia : nowISO().slice(0, 10);
    const pontos = Math.max(0, Math.min(100000, Math.round(Number(b.pontos) || 0)));
    db.prepare(`INSERT INTO lab_jogos (usuario, jogo, dia, pontos, acertos, total, criado_em) VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(usuario, jogo, dia) DO UPDATE SET pontos = MAX(pontos, excluded.pontos), acertos = excluded.acertos, total = excluded.total`)
      .run(req.usuario.id, jogo, dia, pontos, Math.max(0, Number(b.acertos) || 0), Math.max(0, Number(b.total) || 0), nowISO());
    const melhor = db.prepare('SELECT MAX(pontos) AS m FROM lab_jogos WHERE usuario = ? AND jogo = ?').get(req.usuario.id, jogo).m || 0;
    const dias = db.prepare('SELECT COUNT(*) AS n FROM lab_jogos WHERE usuario = ? AND jogo = ?').get(req.usuario.id, jogo).n;
    res.json({ melhor, dias });
  }));
  app.get(B + '/jogos/:jogo', requireUsuario, h(async (req, res) => {
    const r = db.prepare('SELECT dia, pontos, acertos, total FROM lab_jogos WHERE usuario = ? AND jogo = ? ORDER BY dia DESC LIMIT 30').all(req.usuario.id, s(req.params.jogo, 40));
    res.json({ historico: r, melhor: r.reduce((a, x) => Math.max(a, x.pontos), 0) });
  }));

  // ---- LGPD: exportar e excluir o que o Laboratório guarda ----
  // (livres de assinatura em sessao.js: dado pessoal não fica refém de pagamento)
  app.get(B + '/meus-dados', requireUsuario, h(async (req, res) => {
    const u = req.usuario.id;
    const corpo = {
      gerado_em: nowISO(), usuario: u,
      tentativas: db.prepare("SELECT tipo, nivel, semente, acerto, ms_gasto, criado_em FROM tentativas WHERE usuario = ? AND tipo LIKE 'lab:%'").all(u),
      revisao: db.prepare("SELECT * FROM agenda_revisao WHERE usuario = ? AND familia LIKE 'lab:%'").all(u),
      favoritos: db.prepare('SELECT * FROM lab_favoritos WHERE usuario = ?').all(u),
      jogos: db.prepare('SELECT * FROM lab_jogos WHERE usuario = ?').all(u),
      perfil: db.prepare('SELECT * FROM lab_perfil WHERE usuario = ?').get(u) || null,
      jornada_guitarra: db.prepare('SELECT dados, atualizado_em FROM lab_jornada_progresso WHERE usuario = ?').get(u) || null,
      arquivos_json: db.prepare('SELECT nome, dados, criado_em, atualizado_em FROM lab_arquivos_json WHERE usuario = ?').all(u),
      atividades_criadas: db.prepare('SELECT id, titulo, config, criado_em FROM lab_atividades WHERE professor = ?').all(u),
      tutor_de_braco: require('./tutor-braco').dadosDe(u),
      tocar_junto: require('../tocar').dadosDe(u),
      tocar_campanhas: require('../tocar').dadosCampanhasDe(u),
    };
    res.set('Content-Disposition', 'attachment; filename="musique-laboratorio-meus-dados.json"').json(corpo);
  }));
  app.post(B + '/meus-dados/excluir', requireUsuario, h(async (req, res) => {
    if (s((req.body || {}).confirmacao, 20).toUpperCase() !== 'EXCLUIR') throw erro(400, 'Digite EXCLUIR para confirmar.');
    const u = req.usuario.id;
    const n = db.prepare("DELETE FROM tentativas WHERE usuario = ? AND tipo LIKE 'lab:%'").run(u).changes;
    db.prepare("DELETE FROM agenda_revisao WHERE usuario = ? AND familia LIKE 'lab:%'").run(u);
    db.prepare('DELETE FROM lab_favoritos WHERE usuario = ?').run(u);
    db.prepare('DELETE FROM lab_jogos WHERE usuario = ?').run(u);
    db.prepare('DELETE FROM lab_perfil WHERE usuario = ?').run(u);
    db.prepare('DELETE FROM lab_jornada_progresso WHERE usuario = ?').run(u);
    db.prepare('DELETE FROM lab_arquivos_json WHERE usuario = ?').run(u);
    require('./tutor-braco').excluirDe(u);
    require('../tocar').excluirDe(u);
    require('../tocar').excluirCampanhasDe(u);
    res.json({ ok: true, tentativas_excluidas: n });
  }));

  // =================================================================
  // ENSINAR — atividades do professor
  // =================================================================
  const Atividades = {
    porId: (id) => db.prepare('SELECT * FROM lab_atividades WHERE id = ?').get(String(id || '')) || null,
  };
  const exigeDocente = (req) => {
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, ACESSO.pode('ensinar', { logado: true, assinante: true, docente: false }).motivo);
  };
  function config(b) {
    const tipos = (Array.isArray(b.tipos) ? b.tipos : []).map((t) => s(t, 40)).filter((t) => X.TIPOS[t]);
    if (!tipos.length) throw erro(400, 'Escolha pelo menos um exercício.');
    const maxNivel = Math.min(...tipos.map((t) => X.TIPOS[t].niveis.length));
    return {
      tipos: [...new Set(tipos)].slice(0, 6),
      nivel: Math.max(1, Math.min(maxNivel, Number(b.nivel) || 1)),
      questoes: Math.max(3, Math.min(40, Number(b.questoes) || 10)),
      semente_fixa: b.semente_fixa !== false,
      semente: Math.floor(Math.random() * 1e9),
      tempo_s: Math.max(0, Math.min(3600, Number(b.tempo_s) || 0)),
      // parâmetros por exercício (ex.: clave e extensão); gerar() só aceita os declarados
      params: b.params && typeof b.params === 'object' ? JSON.parse(JSON.stringify(b.params)) : {},
    };
  }
  /** As questões da atividade (iguais para todos quando `semente_fixa`). */
  function questoesDa(at, aluno) {
    const c = typeof at.config === 'string' ? JSON.parse(at.config) : at.config;
    const base = c.semente_fixa ? String(c.semente) : String(c.semente) + ':' + aluno;
    const out = [];
    for (let i = 0; i < c.questoes; i++) {
      const tipo = c.tipos[i % c.tipos.length];
      const sem = base + ':' + i;
      out.push(X.publica(X.gerar(tipo, { nivel: Math.min(c.nivel, X.TIPOS[tipo].niveis.length), semente: sem, params: c.params || {} })));
    }
    return out;
  }

  // pré-visualização: exatamente o que o aluno vê (sem salvar nada)
  app.post(B + '/atividades/previa', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    const c = config(req.body || {});
    res.json({ config: c, questoes: questoesDa({ config: c }, 'previa').map((q) => ({ ...q, resposta: undefined })) });
  }));

  app.post(B + '/atividades', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    const b = req.body || {};
    const titulo = s(b.titulo, 120);
    if (!titulo) throw erro(400, 'Dê um título à atividade.');
    const c = config(b);
    const id = novoId();
    const nomes = c.tipos.map((t) => X.TIPOS[t].nome).join(', ');
    const tarefa = academia.Tarefas.criar(req.usuario.id, {
      titulo, exige_audio: false, prazo: s(b.prazo, 25), nota_maxima: Number(b.nota_maxima) || 10,
      descricao: `Atividade do Laboratório Musical: ${c.questoes} questões (${nomes}), nível ${c.nivel}.`,
      instrucoes: `Faça a atividade em /music/atividade/${id} e depois envie esta tarefa. O resultado de cada questão chega ao professor; a nota é dada por ele.`,
    });
    db.prepare(`INSERT INTO lab_atividades (id, professor, tarefa_id, titulo, config, versao, status, criado_em, atualizado_em)
                VALUES (?,?,?,?,?,?, 'ativa', ?, ?)`).run(id, req.usuario.id, tarefa.id, titulo, JSON.stringify(c), X.VERSAO, nowISO(), nowISO());
    const emails = (Array.isArray(b.emails) ? b.emails : String(b.emails || '').split(/[\s,;]+/)).filter(Boolean).slice(0, 200);
    const atrib = emails.length ? academia.Tarefas.atribuirPorEmail(req.usuario.id, tarefa.id, emails, buscarContaPorEmail) : { atribuidos: 0, nao_encontrados: [] };
    if (b.turma_id) atrib.atribuidos += atribuirTurma(req.usuario, tarefa.id, s(b.turma_id, 40));
    res.json({ ok: true, id, tarefa_id: tarefa.id, ...atrib, link: `/music/atividade/${id}` });
  }));

  // ---- turma inteira: pelo PORTÃO das organizações (ADR-0007) ----
  // Nada de consulta direta às tabelas de escola aqui: o portão diz quais
  // turmas a pessoa alcança e quem está matriculado nelas.
  function minhasTurmas(u) {
    const O = require('../organizacoes');
    const out = [];
    O.Organizacoes.doUsuario(u.id).trabalho.forEach((org) => {
      let ts = [];
      try { ts = O.Turmas.daOrganizacao(u.id, org.id); } catch (_) { ts = []; }
      ts.forEach((t) => out.push({ id: t.id, nome: t.nome, escola: org.nome, alunos: t.alunos }));
    });
    return out;
  }
  function atribuirTurma(u, tarefaId, turmaId) {
    const O = require('../organizacoes');
    if (!minhasTurmas(u).some((t) => t.id === turmaId)) throw erro(403, 'Esta turma não é sua.');
    const det = O.Turmas.detalhe(u.id, turmaId);
    const alunos = (det.alunos || []).map((m) => m.aluno).filter(Boolean);
    return alunos.length ? academia.Tarefas.atribuir(u.id, tarefaId, alunos) : 0;
  }
  app.get(B + '/turmas', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    res.json({ turmas: minhasTurmas(req.usuario) });
  }));
  app.post(B + '/atividades/:id/turma', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    const at = Atividades.porId(req.params.id);
    if (!at || at.professor !== req.usuario.id) throw erro(404, 'Atividade não encontrada.');
    res.json({ atribuidos: atribuirTurma(req.usuario, at.tarefa_id, s((req.body || {}).turma_id, 40)) });
  }));

  // ---- atividades prontas (curadas pela casa; o professor ajusta) ----
  app.get(B + '/biblioteca', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    res.json({ atividades: BIBLIOTECA });
  }));

  // ---- versão para imprimir (o navegador salva em PDF) ----
  app.get('/music/atividade/:id/imprimir', opcional || ((q, r, n) => n()), h(async (req, res) => {
    const H = require('./html');
    if (!req.usuario) return res.redirect('/music/entrar?voltar=' + encodeURIComponent(req.originalUrl.slice(0, 80)));
    if (!ehDocente || !ehDocente(req.usuario)) throw erro(403, 'Só o professor imprime a atividade.');
    const at = Atividades.porId(req.params.id);
    if (!at || at.professor !== req.usuario.id) return H.naoAchou(res, 'esta atividade');
    const qs = questoesDa(at, 'impressao');
    const letras = 'abcdefgh';
    const visual = (q) => {
      const v = q.visual || {};
      if (v.tipo === 'pauta') return H.D.pauta({ clave: v.clave, acorde: v.acorde, armadura: v.armadura || 0, notas: v.notas || [], titulo: 'Questão' });
      if (v.tipo === 'ritmo') return H.D.ritmo({ compasso: v.compasso, figuras: v.figuras });
      if (v.tipo === 'braco') return H.D.braco({ afinacao: require('./nucleo/instrumentos').afinacao(v.instrumento || 'violao', 'padrao'), casas: v.casas || 7, destaques: v.destaques || [] });
      if (v.tipo === 'piano') return H.D.piano({ de: v.de || 48, ate: v.ate || 71, rotulos: 'nenhum' });
      return '';
    };
    const corpo = `<div class="lab-impressao"><header class="lab-cab"><h1>${H.esc(at.titulo)}</h1>
<p>Nome: ______________________________ &nbsp; Data: ____/____/______</p>
<button type="button" class="btn lab-nao-imprime" onclick="window.print()">Imprimir ou salvar em PDF</button></header>
<ol class="lab-imp-questoes">${qs.map((q) => `<li><p><strong>${H.esc(q.enunciado)}</strong>${q.auditivo ? ' <em>(questão de ouvido: o professor toca)</em>' : ''}</p>${visual(q)}
${q.opcoes ? `<ol class="lab-imp-opcoes" type="a">${q.opcoes.map((o) => `<li>${H.esc(o.rotulo)}</li>`).join('')}</ol>` : '<p class="lab-imp-linha">Resposta: ________________________________</p>'}</li>`).join('')}</ol>
${req.query.gabarito === '1' ? `<section class="lab-imp-gabarito"><h2>Gabarito</h2><ol>${qs.map((q) => { const cheia = X.gerar(q.tipo, { nivel: q.nivel, semente: q.semente, params: q.params }); const i = (cheia.opcoes || []).findIndex((o) => o.valor === cheia.resposta); return `<li>${i >= 0 ? letras[i] + ') ' + H.esc(cheia.opcoes[i].rotulo) : H.esc(X.corrigir(cheia, cheia.resposta).esperado)}</li>`; }).join('')}</ol></section>` : `<p class="lab-nao-imprime"><a href="?gabarito=1">Versão com gabarito</a></p>`}
</div>`;
    H.pagina(res, { titulo: at.titulo + ' — para imprimir', caminho: '/music/atividade', corpo, indexar: false });
  }));

  app.get(B + '/atividades', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    const lista = db.prepare("SELECT * FROM lab_atividades WHERE professor = ? AND status = 'ativa' ORDER BY criado_em DESC").all(req.usuario.id)
      .map((a) => ({ id: a.id, titulo: a.titulo, config: JSON.parse(a.config), tarefa_id: a.tarefa_id, criado_em: a.criado_em,
        alunos: db.prepare('SELECT COUNT(*) AS n FROM tarefa_alunos WHERE tarefa_id = ?').get(a.tarefa_id).n }));
    res.json({ atividades: lista, exercicios: X.LISTA });
  }));

  app.post(B + '/atividades/:id/atribuir', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    const at = Atividades.porId(req.params.id);
    if (!at || at.professor !== req.usuario.id) throw erro(404, 'Atividade não encontrada.');
    const emails = String((req.body || {}).emails || '').split(/[\s,;]+/).filter(Boolean).slice(0, 200);
    res.json(academia.Tarefas.atribuirPorEmail(req.usuario.id, at.tarefa_id, emails, buscarContaPorEmail));
  }));

  /** Relatório: só o DONO da atividade, só os alunos da tarefa dela. */
  app.get(B + '/atividades/:id/relatorio', requireUsuario, h(async (req, res) => {
    exigeDocente(req);
    const at = Atividades.porId(req.params.id);
    if (!at || at.professor !== req.usuario.id) throw erro(404, 'Atividade não encontrada.');
    const alunos = academia.Tarefas.alunosDa(at.tarefa_id);
    const porHab = {};
    const linhas = alunos.map((a) => {
      const t = db.prepare(`SELECT tipo, familia, acerto, ms_gasto, explicacao, criado_em FROM tentativas WHERE usuario = ? AND sessao_id = ? ORDER BY criado_em`).all(a.aluno, 'atv:' + at.id);
      t.forEach((x) => { const k = x.familia.slice(4); const p = porHab[k] || (porHab[k] = { acertos: 0, total: 0 }); p.total++; if (x.acerto) p.acertos++; });
      const conta = typeof buscarContaPorId === 'function' ? buscarContaPorId(a.aluno) : null;
      const erros = {};
      t.filter((x) => !x.acerto).forEach((x) => { erros[x.tipo.slice(4)] = (erros[x.tipo.slice(4)] || 0) + 1; });
      return { aluno: conta ? (conta.nome || conta.email) : 'aluno', respondidas: t.length, acertos: t.filter((x) => x.acerto).length,
        tempo_medio_s: t.length ? Math.round(t.reduce((a, x) => a + x.ms_gasto, 0) / t.length / 1000) : 0, erros_por_exercicio: erros };
    });
    res.json({ atividade: { id: at.id, titulo: at.titulo, config: JSON.parse(at.config), versao: at.versao }, alunos: linhas, por_habilidade: porHab,
      aviso: 'Evidência para a sua avaliação — não é nota. A nota, se houver, é dada por você na tarefa.' });
  }));

  // o aluno busca as questões da atividade (só se estiver na tarefa)
  app.get(B + '/atividades/:id/questoes', requireUsuario, h(async (req, res) => {
    const at = Atividades.porId(req.params.id);
    if (!at || at.status !== 'ativa') throw erro(404, 'Atividade não encontrada.');
    const ehDono = at.professor === req.usuario.id;
    if (!ehDono && !academia.Tarefas.temAluno(at.tarefa_id, req.usuario.id)) throw erro(403, 'Esta atividade não foi atribuída a você.');
    res.json({ titulo: at.titulo, config: JSON.parse(at.config), questoes: questoesDa(at, req.usuario.id).map((q) => ({ ...q, resposta: undefined })), sessao: 'atv:' + at.id });
  }));

  return { Atividades, BIBLIOTECA };
}

module.exports = { registrarApi };
