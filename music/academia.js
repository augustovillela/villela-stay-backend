// =====================================================================
// Musique — ACADEMIA MUSICAL (Fase 1). O domínio do aprendizado:
// calibração, prática, avaliação registrada, repetição espaçada,
// tarefa do professor, submissão do aluno, nota e contestação.
//
// Este arquivo ORQUESTRA. Ele não mede nada: quem mede é
// `avaliacao/` (puro) e quem gera o item é `curriculo.js` (puro).
// Aqui só existe o que precisa de banco e de identidade.
//
// TRÊS REGRAS QUE VALEM PARA TUDO AQUI:
//
//   1. A tentativa é gravada COM o critério e a tolerância da época.
//      Sem isso, contestar uma nota três meses depois seria impossível:
//      o gerador pode ter mudado.
//
//   2. NOTA QUE CONTA É DE HUMANO. A medida automática entra como
//      `indicacao_sistema`, em coluna separada da `nota`. Juntar as duas
//      faria a indicação virar nota por descuido, algum dia.
//
//   3. PERMISSÃO É DO VÍNCULO, NÃO DA PESSOA. O professor vê a
//      submissão enquanto a tarefa está ativa. Arquivou, acabou.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const direitos = require('./direitos');
const curriculo = require('./curriculo');
const avaliacao = require('./avaliacao');
const catalogo = require('./trilhas-catalogo');

const s = (v, max = 2000) => String(v == null ? '' : v).trim().slice(0, max);
const hoje = () => nowISO().slice(0, 10);
const emDias = (n) => new Date(Date.now() + Number(n) * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------
// Calibração do microfone
// ---------------------------------------------------------------------
// Vale por poucos dias de propósito: sala muda, aparelho muda, fone
// muda. Calibração eterna daria a impressão de medida confiável num
// ambiente que já não é o medido.
const CALIBRACAO_VALE_DIAS = 7;

const Calibracao = {
  registrar(usuario, { ruido_db, latencia_ms, dispositivo = '' } = {}) {
    const ruido = Number(ruido_db);
    if (!Number.isFinite(ruido)) throw new Error('Calibração precisa do nível de ruído medido.');
    const dados = {
      microfone_ok: ruido <= -30,
      ruido_db: Number(ruido.toFixed(1)),
      latencia_ms: Number(latencia_ms) || 0,
      dispositivo: s(dispositivo, 120),
      em: nowISO(),
    };
    repo.Usuarios.editar(usuario, { calibracao: dados });
    return {
      ...dados,
      // O aluno precisa saber o que fazer, não só que "falhou".
      aviso: dados.microfone_ok ? '' :
        (ruido > -20
          ? 'O ambiente está muito barulhento. Exercícios com microfone não vão medir bem aqui.'
          : 'Há ruído de fundo relevante. Dá para praticar, mas o resultado sai como indicação, não como nota.'),
    };
  },

  /** Estado atual: válida, vencida ou inexistente — e por quê. */
  estado(usuario) {
    const u = repo.Usuarios.porId(usuario);
    const c = (u && j.parse(u.calibracao, {})) || {};
    if (!c.em) return { calibrado: false, motivo: 'Você ainda não calibrou o microfone.', ruido_db: null };
    const dias = (Date.now() - new Date(c.em).getTime()) / 86400000;
    if (dias > CALIBRACAO_VALE_DIAS) {
      return { calibrado: false, vencida: true, ruido_db: c.ruido_db,
        motivo: `A calibração é de ${Math.floor(dias)} dias atrás. Refaça — o ambiente muda.` };
    }
    return { calibrado: !!c.microfone_ok, ruido_db: c.ruido_db, latencia_ms: c.latencia_ms,
      em: c.em, motivo: c.microfone_ok ? '' : 'O ruído medido está alto para valer nota.' };
  },
};

// ---------------------------------------------------------------------
// Trilhas
// ---------------------------------------------------------------------
const Trilhas = {
  semear: () => catalogo.semear({ db, novoId, nowISO }),

  listar: ({ instrumento = '', publicadas = true } = {}) => {
    const base = publicadas
      ? db.prepare('SELECT * FROM trilhas WHERE publicada = 1 ORDER BY ordem, titulo').all()
      : db.prepare('SELECT * FROM trilhas ORDER BY ordem, titulo').all();
    return instrumento ? base.filter((t) => t.instrumento === instrumento || t.instrumento === 'geral') : base;
  },

  porSlug: (slug) => db.prepare('SELECT * FROM trilhas WHERE slug = ?').get(slug) || null,
  porId: (id) => db.prepare('SELECT * FROM trilhas WHERE id = ?').get(id) || null,
  itens: (trilhaId) => db.prepare('SELECT * FROM trilha_itens WHERE trilha_id = ? ORDER BY ordem').all(trilhaId),

  /** Trilha com o progresso do aluno — e o item onde ele parou. */
  comProgresso(trilhaId, usuario) {
    const t = Trilhas.porId(trilhaId);
    if (!t) return null;
    const itens = Trilhas.itens(trilhaId);
    const p = db.prepare('SELECT * FROM progresso_trilha WHERE usuario = ? AND trilha_id = ?').get(usuario, trilhaId);
    const atual = p ? p.item_atual : 0;
    return {
      ...t,
      itens: itens.map((it, i) => ({ ...it, estado: i < atual ? 'concluido' : i === atual ? 'atual' : 'travado' })),
      progresso: { item_atual: atual, total: itens.length, concluida_em: (p && p.concluida_em) || '' },
    };
  },

  avancar(usuario, trilhaId) {
    const itens = Trilhas.itens(trilhaId);
    const p = db.prepare('SELECT * FROM progresso_trilha WHERE usuario = ? AND trilha_id = ?').get(usuario, trilhaId);
    const atual = p ? p.item_atual : 0;
    const proximo = Math.min(itens.length, atual + 1);
    const concluiu = proximo >= itens.length;
    db.prepare(`INSERT INTO progresso_trilha (usuario, trilha_id, item_atual, concluida_em, atualizado_em)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(usuario, trilha_id) DO UPDATE SET item_atual = excluded.item_atual,
                  concluida_em = excluded.concluida_em, atualizado_em = excluded.atualizado_em`)
      .run(usuario, trilhaId, proximo, concluiu ? nowISO() : ((p && p.concluida_em) || ''), nowISO());
    return { item_atual: proximo, total: itens.length, concluiu };
  },
};

// ---------------------------------------------------------------------
// Prática: gerar item, avaliar, registrar
// ---------------------------------------------------------------------
const Pratica = {
  iniciarSessao(usuario, { trilhaId = '', meta = '' } = {}) {
    const id = novoId();
    db.prepare(`INSERT INTO sessoes_pratica (id, usuario, trilha_id, meta, iniciada_em)
                VALUES (?, ?, ?, ?, ?)`).run(id, usuario, trilhaId, s(meta, 200), nowISO());
    return db.prepare('SELECT * FROM sessoes_pratica WHERE id = ?').get(id);
  },

  encerrarSessao(usuario, sessaoId, { anotacao = '' } = {}) {
    const ses = db.prepare('SELECT * FROM sessoes_pratica WHERE id = ? AND usuario = ?').get(sessaoId, usuario);
    if (!ses) throw new Error('Sessão não encontrada.');
    const agg = db.prepare(`SELECT COUNT(*) AS n, SUM(acerto) AS ac, SUM(ms_gasto) AS ms
                            FROM tentativas WHERE sessao_id = ?`).get(sessaoId);
    db.prepare(`UPDATE sessoes_pratica SET itens = ?, acertos = ?, ms_total = ?, anotacao = ?, encerrada_em = ?
                WHERE id = ?`)
      .run(agg.n || 0, agg.ac || 0, agg.ms || 0, s(anotacao, 1000), nowISO(), sessaoId);
    return db.prepare('SELECT * FROM sessoes_pratica WHERE id = ?').get(sessaoId);
  },

  /**
   * Próximo item. `nivel` sai do desempenho recente do aluno naquela
   * família, não de um campo que ele escolheu uma vez e esqueceu.
   *
   * A semente inclui a contagem de tentativas: recarregar a página
   * devolve o MESMO item (o aluno não perde o exercício), mas responder
   * traz outro.
   */
  proximoItem(usuario, { tipo, trilhaId = '', nivel = null } = {}) {
    const def = curriculo.TIPOS[tipo];
    if (!def) throw new Error(`Tipo de exercício desconhecido: "${tipo}".`);

    const n = nivel != null ? Number(nivel) : Pratica.nivelSugerido(usuario, def.familia, def.nivel_min);
    const feitas = db.prepare('SELECT COUNT(*) AS n FROM tentativas WHERE usuario = ? AND tipo = ?')
      .get(usuario, tipo).n || 0;
    const item = curriculo.gerarItem({ tipo, nivel: n, sem: `${usuario}|${tipo}|${feitas}` });

    const cal = Calibracao.estado(usuario);
    const contrato = avaliacao.contrato({ modo: item.modo, tolerancia: item.tolerancia || {} });

    // O gabarito NÃO vai junto. Ele fica no servidor, recalculado pela
    // mesma semente na hora de corrigir — senão bastaria abrir o
    // inspetor do navegador para "estudar".
    const { esperado, ...semGabarito } = item;
    return {
      ...semGabarito,
      trilha_id: trilhaId,
      // Decisão Q5: o aluno vê o que vai ser medido ANTES de responder.
      contrato: {
        ...contrato,
        exige_calibracao: contrato.exige_microfone,
        calibrado: cal.calibrado,
        aviso_calibracao: contrato.exige_microfone && !cal.calibrado ? cal.motivo : '',
      },
    };
  },

  /** Nível para a próxima tentativa, olhando as últimas 10 daquela família. */
  nivelSugerido(usuario, familia, minimo = 1) {
    const linha = db.prepare('SELECT * FROM agenda_revisao WHERE usuario = ? AND familia = ?').get(usuario, familia);
    const base = linha ? linha.nivel : minimo;
    const ultimas = db.prepare(`SELECT acerto, vale_nota FROM tentativas
                                WHERE usuario = ? AND familia = ? ORDER BY criado_em DESC LIMIT 10`)
      .all(usuario, familia)
      .map((t) => ({ acerto: !!t.acerto, vale_nota: !!t.vale_nota }));
    const r = curriculo.ajustarNivel(base, ultimas);
    return Math.max(minimo, r.nivel);
  },

  /**
   * Corrige. Regenera o item pela MESMA semente para obter o gabarito —
   * é o que permite não mandar o gabarito para o cliente.
   */
  responder(usuario, { tipo, nivel, semente, resposta, sessaoId = '', trilhaId = '', msGasto = 0, polifonico = false } = {}) {
    const def = curriculo.TIPOS[tipo];
    if (!def) throw new Error(`Tipo de exercício desconhecido: "${tipo}".`);
    if (!semente) throw new Error('Falta a semente do item — sem ela não dá para conferir o gabarito.');

    const item = curriculo.gerarItem({ tipo, nivel, sem: semente });
    const cal = Calibracao.estado(usuario);

    const r = avaliacao.avaliar({
      modo: item.modo,
      esperado: item.esperado,
      resposta,
      tolerancia: item.tolerancia || {},
      contexto: { calibrado: cal.calibrado, ruido_db: cal.ruido_db, polifonico },
    });

    const id = novoId();
    db.prepare(`INSERT INTO tentativas (id, usuario, tipo, familia, nivel, semente, modo, enunciado,
                esperado, resposta, acerto, confianca, vale_nota, medida, criterio, tolerancia,
                explicacao, ressalvas, sessao_id, trilha_id, ms_gasto, criado_em)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, usuario, tipo, item.familia, item.nivel, String(semente), item.modo, s(item.enunciado, 500),
           j.str(item.esperado), j.str(resposta), r.acerto ? 1 : 0, r.confianca, r.vale_nota ? 1 : 0,
           j.str(r.medida), s(r.criterio, 500), j.str(r.tolerancia), s(r.explicacao, 1000),
           j.str(r.ressalvas || []), sessaoId, trilhaId, Number(msGasto) || 0, nowISO());

    const revisao = Pratica.atualizarRevisao(usuario, item.familia, item.nivel, r);

    return {
      tentativa_id: id,
      acerto: r.acerto,
      confianca: r.confianca,
      vale_nota: r.vale_nota,
      medida: r.medida,
      criterio: r.criterio,
      tolerancia: r.tolerancia,
      explicacao: r.explicacao,
      ressalvas: r.ressalvas || [],
      // Mostrar o gabarito DEPOIS de responder é o que transforma erro em
      // aprendizado. Esconder faria o aluno errar de novo amanhã.
      gabarito: item.esperado,
      proxima_revisao_dias: revisao.revisar_em_dias,
      nivel: item.nivel,
    };
  },

  atualizarRevisao(usuario, familia, nivel, r) {
    const atual = db.prepare('SELECT * FROM agenda_revisao WHERE usuario = ? AND familia = ?').get(usuario, familia);
    const novo = curriculo.proximaRevisao(atual || {}, { acertou: r.acerto, confianca: r.confianca });
    const nivelNovo = curriculo.ajustarNivel(atual ? atual.nivel : nivel, [{ acerto: r.acerto, vale_nota: r.vale_nota }]).nivel;
    db.prepare(`INSERT INTO agenda_revisao (usuario, familia, nivel, acertos_seguidos, intervalo_dias,
                facilidade, revisar_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(usuario, familia) DO UPDATE SET nivel = excluded.nivel,
                  acertos_seguidos = excluded.acertos_seguidos, intervalo_dias = excluded.intervalo_dias,
                  facilidade = excluded.facilidade, revisar_em = excluded.revisar_em,
                  atualizado_em = excluded.atualizado_em`)
      .run(usuario, familia, Math.max(nivel, nivelNovo), novo.acertos_seguidos, novo.intervalo_dias,
           novo.facilidade, emDias(novo.revisar_em_dias), nowISO());
    return novo;
  },

  /** O que está vencido para revisar hoje. É a porta de entrada do estudo. */
  paraRevisarHoje(usuario) {
    const linhas = db.prepare(`SELECT * FROM agenda_revisao WHERE usuario = ? AND revisar_em <= ?
                               ORDER BY revisar_em`).all(usuario, hoje());
    return linhas.map((l) => ({
      familia: l.familia, nivel: l.nivel, revisar_em: l.revisar_em,
      tipos: Object.entries(curriculo.TIPOS).filter(([, t]) => t.familia === l.familia).map(([id]) => id),
    }));
  },

  /** Estatísticas honestas: separa o que valeu nota do que foi indicação. */
  estatisticas(usuario, { dias = 30 } = {}) {
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const t = db.prepare('SELECT * FROM tentativas WHERE usuario = ? AND criado_em >= ?').all(usuario, desde);
    const porFamilia = {};
    for (const x of t) {
      const f = porFamilia[x.familia] || (porFamilia[x.familia] = { total: 0, acertos: 0, com_nota: 0, indicacoes: 0, nivel: 1 });
      f.total++; if (x.acerto) f.acertos++;
      if (x.vale_nota) f.com_nota++; else f.indicacoes++;
      f.nivel = Math.max(f.nivel, x.nivel);
    }
    const sessoes = db.prepare(`SELECT COUNT(*) AS n, SUM(ms_total) AS ms FROM sessoes_pratica
                                WHERE usuario = ? AND iniciada_em >= ?`).get(usuario, desde);
    return {
      periodo_dias: dias,
      tentativas: t.length,
      acertos: t.filter((x) => x.acerto).length,
      valeram_nota: t.filter((x) => x.vale_nota).length,
      minutos_praticados: Math.round((sessoes.ms || 0) / 60000),
      sessoes: sessoes.n || 0,
      sequencia_dias: Pratica.sequencia(usuario),
      por_familia: porFamilia,
    };
  },

  /** Dias seguidos com prática. Gamificação moderada: conta o hábito,
   *  não a quantidade — quem estuda 10 minutos por dia progride mais
   *  do que quem faz três horas no domingo. */
  sequencia(usuario) {
    const dias = db.prepare(`SELECT DISTINCT substr(criado_em, 1, 10) AS d FROM tentativas
                             WHERE usuario = ? ORDER BY d DESC LIMIT 400`).all(usuario).map((x) => x.d);
    if (!dias.length) return 0;
    const umDia = 86400000;
    const base = new Date(hoje()).getTime();
    // Deixa a sequência viva se a pessoa ainda não praticou HOJE mas
    // praticou ontem — cortar a sequência às 00:01 seria punir o fuso.
    let ref = dias[0] === hoje() ? base : base - umDia;
    if (new Date(dias[0]).getTime() < ref) return 0;
    let n = 0;
    for (const d of dias) {
      if (new Date(d).getTime() === ref) { n++; ref -= umDia; } else if (new Date(d).getTime() < ref) break;
    }
    return n;
  },

  historico: (usuario, limite = 50) =>
    db.prepare('SELECT * FROM tentativas WHERE usuario = ? ORDER BY criado_em DESC LIMIT ?')
      .all(usuario, Math.min(limite, 200)),

  tentativa: (id) => db.prepare('SELECT * FROM tentativas WHERE id = ?').get(id) || null,
};

// ---------------------------------------------------------------------
// Tarefas, submissões e nota
// ---------------------------------------------------------------------
const Tarefas = {
  criar(professor, d = {}) {
    if (!s(d.titulo)) throw new Error('A tarefa precisa de um título.');
    const id = novoId();
    db.prepare(`INSERT INTO tarefas (id, professor, titulo, descricao, instrucoes, exige_audio,
                nota_maxima, prazo, status, criado_em, atualizado_em)
                VALUES (?,?,?,?,?,?,?,?, 'ativa', ?, ?)`)
      .run(id, professor, s(d.titulo, 200), s(d.descricao, 2000), s(d.instrucoes, 4000),
           d.exige_audio === false ? 0 : 1, Number(d.nota_maxima) || 10, s(d.prazo, 25), nowISO(), nowISO());
    direitos.registrar({ ator: professor, acao: 'tarefa.criada', alvo: id, detalhe: { titulo: d.titulo } });
    return Tarefas.porId(id);
  },

  porId: (id) => db.prepare('SELECT * FROM tarefas WHERE id = ?').get(id) || null,

  /**
   * Atribui por E-MAIL. O professor conhece o e-mail do aluno, não o id
   * interno dele — pedir o id seria pedir que ele fosse ao banco.
   * A busca é injetada (ADR-0001): a conta é da Academia.
   *
   * Devolve também `nao_encontrados`, porque errar um e-mail é comum e
   * "atribuí 3 de 4" é informação que o professor precisa ver.
   */
  atribuirPorEmail(professor, tarefaId, emails = [], buscarPorEmail) {
    if (typeof buscarPorEmail !== 'function') {
      throw new Error('Busca de conta indisponível: a Musique não foi montada com a conta da Academia.');
    }
    const ids = []; const naoEncontrados = [];
    for (const e of (emails || []).map((x) => String(x || '').trim()).filter(Boolean)) {
      const u = buscarPorEmail(e);
      if (u && u.id) ids.push(u.id); else naoEncontrados.push(e);
    }
    const n = ids.length ? Tarefas.atribuir(professor, tarefaId, ids) : 0;
    return { atribuidos: n, nao_encontrados: naoEncontrados };
  },

  atribuir(professor, tarefaId, alunos = []) {
    const t = Tarefas.porId(tarefaId);
    if (!t) throw new Error('Tarefa não encontrada.');
    if (t.professor !== professor) throw new Error('Esta tarefa não é sua.');
    if (t.status !== 'ativa') throw new Error('Tarefa arquivada não recebe aluno novo.');
    let n = 0;
    for (const a of alunos.filter(Boolean)) {
      db.prepare(`INSERT INTO tarefa_alunos (tarefa_id, aluno, atribuida_em) VALUES (?, ?, ?)
                  ON CONFLICT(tarefa_id, aluno) DO NOTHING`).run(tarefaId, a, nowISO());
      n++;
    }
    direitos.registrar({ ator: professor, acao: 'tarefa.atribuida', alvo: tarefaId, detalhe: { alunos: n } });
    return n;
  },

  arquivar(professor, tarefaId) {
    const t = Tarefas.porId(tarefaId);
    if (!t) throw new Error('Tarefa não encontrada.');
    if (t.professor !== professor) throw new Error('Esta tarefa não é sua.');
    db.prepare("UPDATE tarefas SET status = 'arquivada', atualizado_em = ? WHERE id = ?").run(nowISO(), tarefaId);
    // Arquivar ENCERRA o acesso do professor às submissões. É o ponto do
    // desenho: permissão acompanha o vínculo.
    direitos.registrar({ ator: professor, acao: 'tarefa.arquivada', alvo: tarefaId,
      motivo: 'encerra o acesso do professor às submissões desta tarefa' });
    return Tarefas.porId(tarefaId);
  },

  doProfessor: (professor, { status = 'ativa' } = {}) =>
    db.prepare('SELECT * FROM tarefas WHERE professor = ? AND status = ? ORDER BY criado_em DESC')
      .all(professor, status)
      .map((t) => ({
        ...t,
        alunos: db.prepare('SELECT COUNT(*) AS n FROM tarefa_alunos WHERE tarefa_id = ?').get(t.id).n,
        enviadas: db.prepare("SELECT COUNT(*) AS n FROM submissoes WHERE tarefa_id = ? AND status = 'enviada'").get(t.id).n,
      })),

  doAluno: (aluno) => db.prepare(`SELECT t.* FROM tarefas t JOIN tarefa_alunos ta ON ta.tarefa_id = t.id
                                  WHERE ta.aluno = ? AND t.status = 'ativa' ORDER BY t.prazo, t.criado_em DESC`)
    .all(aluno)
    .map((t) => ({ ...t, minha_submissao: Submissoes.doAlunoNaTarefa(aluno, t.id) })),

  temAluno: (tarefaId, aluno) => !!db.prepare('SELECT 1 FROM tarefa_alunos WHERE tarefa_id = ? AND aluno = ?')
    .get(tarefaId, aluno),

  alunosDa: (tarefaId) => db.prepare('SELECT * FROM tarefa_alunos WHERE tarefa_id = ? ORDER BY atribuida_em').all(tarefaId),
};

const Submissoes = {
  porId: (id) => db.prepare('SELECT * FROM submissoes WHERE id = ?').get(id) || null,

  doAlunoNaTarefa: (aluno, tarefaId) =>
    db.prepare('SELECT * FROM submissoes WHERE aluno = ? AND tarefa_id = ? ORDER BY enviada_em DESC')
      .get(aluno, tarefaId) || null,

  enviar(aluno, { tarefaId, texto = '', mediaId = '' } = {}) {
    const t = Tarefas.porId(tarefaId);
    if (!t) throw new Error('Tarefa não encontrada.');
    if (t.status !== 'ativa') throw new Error('Esta tarefa foi encerrada pelo professor.');
    if (!Tarefas.temAluno(tarefaId, aluno)) throw new Error('Esta tarefa não é sua.');
    if (t.exige_audio && !mediaId) throw new Error('Esta tarefa pede uma gravação. Envie o áudio.');

    const ex = Submissoes.doAlunoNaTarefa(aluno, tarefaId);
    // Reenvio NÃO é duplicata: é o único conserto que o aluno tem
    // quando gravou errado. Recusar trancaria o caminho dele.
    if (ex && ex.status !== 'avaliada') {
      db.prepare(`UPDATE submissoes SET texto = ?, media_id = ?, status = 'enviada', atualizado_em = ?
                  WHERE id = ?`).run(s(texto, 4000), s(mediaId, 40), nowISO(), ex.id);
      return Submissoes.porId(ex.id);
    }
    const id = novoId();
    db.prepare(`INSERT INTO submissoes (id, tarefa_id, aluno, texto, media_id, status, enviada_em, atualizado_em)
                VALUES (?,?,?,?,?, 'enviada', ?, ?)`)
      .run(id, tarefaId, aluno, s(texto, 4000), s(mediaId, 40), nowISO(), nowISO());
    return Submissoes.porId(id);
  },

  /**
   * Quem pode ver esta submissão. É a regra do vínculo, e mora em um
   * lugar só — duplicar faria o caminho novo esquecer o caso especial.
   */
  podeVer(submissao, quem, { papel = 'aluno' } = {}) {
    if (!submissao) return { pode: false, motivo: 'Submissão não encontrada.' };
    if (submissao.aluno === quem) return { pode: true };
    const t = Tarefas.porId(submissao.tarefa_id);
    if (!t) return { pode: false, motivo: 'Tarefa não encontrada.' };
    if (t.professor === quem) {
      if (t.status !== 'ativa') {
        return { pode: false, motivo: 'A tarefa foi arquivada: o acesso às submissões dela terminou.' };
      }
      return { pode: true };
    }
    return { pode: false, motivo: 'Esta submissão não é sua.' };
  },

  daTarefa(professor, tarefaId) {
    const t = Tarefas.porId(tarefaId);
    if (!t) throw new Error('Tarefa não encontrada.');
    if (t.professor !== professor) throw new Error('Esta tarefa não é sua.');
    if (t.status !== 'ativa') throw new Error('A tarefa foi arquivada: o acesso às submissões dela terminou.');
    return db.prepare('SELECT * FROM submissoes WHERE tarefa_id = ? ORDER BY enviada_em').all(tarefaId)
      .map((sub) => ({ ...sub, feedbacks: Feedbacks.daSubmissao(sub.id) }));
  },
};

const Feedbacks = {
  daSubmissao: (submissaoId) =>
    db.prepare('SELECT * FROM feedbacks WHERE submissao_id = ? ORDER BY criado_em').all(submissaoId)
      .map((f) => ({ ...f, indicacao_sistema: j.parse(f.indicacao_sistema, {}) })),

  /**
   * Dá feedback e, opcionalmente, NOTA. A nota é do humano; o que o
   * sistema mediu entra em `indicacao_sistema`, separado.
   */
  dar(autor, { submissaoId, texto = '', audioMediaId = '', nota = null, devolver = false, indicacaoSistema = null } = {}) {
    const sub = Submissoes.porId(submissaoId);
    if (!sub) throw new Error('Submissão não encontrada.');
    const t = Tarefas.porId(sub.tarefa_id);
    if (!t || t.professor !== autor) throw new Error('Só o professor da tarefa dá o retorno.');
    if (t.status !== 'ativa') throw new Error('A tarefa foi arquivada.');
    if (!s(texto) && nota == null && !audioMediaId) throw new Error('Escreva o retorno, grave um áudio ou dê a nota.');

    let n = null;
    if (nota != null && nota !== '') {
      n = Number(nota);
      if (!Number.isFinite(n) || n < 0 || n > t.nota_maxima) {
        throw new Error(`A nota precisa ficar entre 0 e ${t.nota_maxima}.`);
      }
    }

    const id = novoId();
    db.prepare(`INSERT INTO feedbacks (id, submissao_id, autor, texto, audio_media_id, nota, origem,
                indicacao_sistema, criado_em) VALUES (?,?,?,?,?,?, 'professor', ?, ?)`)
      .run(id, submissaoId, autor, s(texto, 4000), s(audioMediaId, 40), n,
           j.str(indicacaoSistema || {}), nowISO());
    db.prepare('UPDATE submissoes SET status = ?, atualizado_em = ? WHERE id = ?')
      .run(devolver ? 'devolvida' : (n != null ? 'avaliada' : sub.status), nowISO(), submissaoId);
    direitos.registrar({ ator: autor, acao: n != null ? 'nota.dada' : 'feedback.dado', alvo: submissaoId,
      detalhe: { nota: n, devolvida: !!devolver } });
    return Feedbacks.daSubmissao(submissaoId);
  },
};

const Contestacoes = {
  /** O aluno contesta uma nota ou uma correção automática. */
  abrir(aluno, { tentativaId = '', submissaoId = '', motivo = '' } = {}) {
    if (!tentativaId && !submissaoId) throw new Error('Diga o que está sendo contestado.');
    if (!s(motivo)) throw new Error('Escreva o motivo da contestação.');
    if (tentativaId) {
      const t = Pratica.tentativa(tentativaId);
      if (!t || t.usuario !== aluno) throw new Error('Tentativa não encontrada.');
    }
    if (submissaoId) {
      const sub = Submissoes.porId(submissaoId);
      if (!sub || sub.aluno !== aluno) throw new Error('Submissão não encontrada.');
    }
    const id = novoId();
    db.prepare(`INSERT INTO contestacoes (id, tentativa_id, submissao_id, aluno, motivo, status, criado_em)
                VALUES (?,?,?,?,?, 'aberta', ?)`)
      .run(id, tentativaId, submissaoId, aluno, s(motivo, 2000), nowISO());
    direitos.registrar({ ator: aluno, acao: 'contestacao.aberta', alvo: id,
      detalhe: { tentativa: tentativaId, submissao: submissaoId } });
    return db.prepare('SELECT * FROM contestacoes WHERE id = ?').get(id);
  },

  /** Resolver acolhendo ou mantendo. Acolher com nota nova grava um
   *  feedback de `origem = 'revisao'` — o histórico mostra as duas. */
  resolver(revisor, { id, acolher, resposta = '', notaNova = null } = {}) {
    const c = db.prepare('SELECT * FROM contestacoes WHERE id = ?').get(id);
    if (!c) throw new Error('Contestação não encontrada.');
    if (c.status !== 'aberta') throw new Error('Esta contestação já foi resolvida.');
    if (acolher && notaNova != null && c.submissao_id) {
      db.prepare(`INSERT INTO feedbacks (id, submissao_id, autor, texto, nota, origem, criado_em)
                  VALUES (?,?,?,?,?, 'revisao', ?)`)
        .run(novoId(), c.submissao_id, revisor, s(resposta, 2000), Number(notaNova), nowISO());
    }
    db.prepare(`UPDATE contestacoes SET status = ?, resposta = ?, revisor = ?, resolvido_em = ? WHERE id = ?`)
      .run(acolher ? 'acolhida' : 'mantida', s(resposta, 2000), revisor, nowISO(), id);
    direitos.registrar({ ator: revisor, acao: 'contestacao.resolvida', alvo: id,
      detalhe: { acolhida: !!acolher, nota_nova: notaNova } });
    return db.prepare('SELECT * FROM contestacoes WHERE id = ?').get(id);
  },

  doAluno: (aluno) => db.prepare('SELECT * FROM contestacoes WHERE aluno = ? ORDER BY criado_em DESC').all(aluno),

  abertasDoProfessor: (professor) => db.prepare(
    `SELECT c.* FROM contestacoes c
     JOIN submissoes s ON s.id = c.submissao_id
     JOIN tarefas t ON t.id = s.tarefa_id
     WHERE t.professor = ? AND c.status = 'aberta' ORDER BY c.criado_em`).all(professor),
};

module.exports = { Calibracao, Trilhas, Pratica, Tarefas, Submissoes, Feedbacks, Contestacoes, CALIBRACAO_VALE_DIAS };
