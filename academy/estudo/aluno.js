// =====================================================================
// Villela Academy — ESTUDO · o percurso do ALUNO dentro de um escopo:
// painel, próxima tarefa, prática, cards, prova com relógio e plano.
//
// Três separações que este arquivo sustenta (prompt mestre, 1.1 e 9):
//   material produzido  ≠  conteúdo estudado  ≠  aprendizagem demonstrada
//   acerto com pista    ≠  acerto sem apoio
//   questão já vista    ≠  questão inédita
// O gabarito, a explicação e a pista ficam no servidor; o navegador só
// recebe depois de responder (ou de pedir a pista, que fica registrada).
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('../db');
const ct = require('../repo-conteudo');
const it = require('../interativo');
const R = require('./repo');
const banco = require('./banco');
const ev = require('./evidencia');
const agenda = require('./agenda');
const plano = require('./plano');
const pontuacao = require('./pontuacao');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const { erro } = R;
const hojeBR = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);

const LIMITE_REVISOES_DIA = 20;
const CARDS_NOVOS_DIA = 5;
const FALHAS_PARA_ESTAGNACAO = 3;   // falhas sem apoio seguidas → trocar a estratégia, não repetir
const MODOS_TENTATIVA = ['treino', 'simulado']; // o diagnóstico e o teste final (jornada-estude.js) são tentativas de outro molde, com porta própria
const CONFIANCAS = ['baixa', 'media', 'alta'];

// ---------------------------------------------------------------------
// ACESSO — a mesma porta do resto da Academy: quem tem o curso vê o
// publicado; dono e admin revisam o rascunho.
// ---------------------------------------------------------------------
function contexto(usuario, produto) {
  const revisor = it.podeRevisar(usuario, produto);
  const acesso = revisor || ct.temAcesso(usuario.id, produto.id);
  return { revisor, acesso, vis: revisor ? R.STATUS : ['publicado'], situacoes: revisor ? banco.SITUACOES : ['disponivel'] };
}
// PERCURSO PARTICULAR (ADR-0010, §6): só o DONO entra — para todos os outros (o produtor e o admin
// inclusive) ele responde como percurso que não existe. O dono o vê mesmo em rascunho (ele nunca é
// "publicado": não é do curso), mas só com o acesso ao curso em dia, que é onde o percurso mora.
function abrir(usuario, produto, slugEscopo) {
  const c = contexto(usuario, produto);
  if (!c.acesso) throw erro('Esta área é para quem tem acesso ao curso.', 403);
  const escopo = R.Escopos.porSlug(produto.id, R.slug(slugEscopo));
  if (escopo && escopo.dono_user_id) {
    if (escopo.dono_user_id !== usuario.id) throw erro('Percurso não encontrado.', 404);
    return { ...c, vis: R.STATUS, particular: true, escopo };
  }
  if (!escopo || !c.vis.includes(escopo.status)) throw erro('Percurso não encontrado.', 404);
  return { ...c, particular: false, escopo };
}
function escopos(usuario, produto) {
  const c = contexto(usuario, produto);
  if (!c.acesso) return { acesso: false, escopos: [] };
  const linha = (e) => ({ slug: e.slug, tipo: e.tipo, titulo: e.titulo, nivel: e.nivel, extensao: e.extensao, resumo: e.resumo, data_alvo: e.data_alvo, status: e.status, particular: !!e.dono_user_id });
  // os do curso primeiro; depois os particulares DESTE usuário (os de outro aluno não existem para ele)
  return { acesso: true, revisor: c.revisor, escopos: R.Escopos.doProduto(produto.id, c.vis).concat(R.Escopos.doDono(produto.id, usuario.id)).map(linha) };
}

// ---------------------------------------------------------------------
// EVIDÊNCIA e AGENDA
// ---------------------------------------------------------------------
// `tentativa_modo`: de que prova a resposta veio ('' = resposta avulsa: prática, quiz da aula, card). É o que separa
// o erro do DIAGNÓSTICO (ponto de partida) do erro de quem já estudou a matéria (dívida).
const evidencias = (userId, escopoId) => R.memo(`evs:${userId}:${escopoId}`, () => db.prepare(`SELECT e.*, COALESCE(t.modo, '') AS tentativa_modo FROM est_evidencias e LEFT JOIN est_tentativas t ON t.id = e.tentativa_id
    WHERE e.user_id = ? AND e.escopo_id = ? ORDER BY e.criado_em, e.rowid`).all(userId, escopoId) /* rowid: respostas da MESMA prova nascem no mesmo milissegundo, e o estado da competência depende da ordem (errou e depois acertou ≠ acertou e depois errou) */
  .map(e => ({ ...e, acerto: !!e.acerto, inedita: !!e.inedita, ajuda_humana: !!e.ajuda_humana })));
const jaViu = (userId, refId) => !!db.prepare('SELECT 1 FROM est_evidencias WHERE user_id = ? AND ref_id = ? LIMIT 1').get(userId, refId);
// tudo o que o aluno já respondeu, numa consulta só (quiz, praticar e prova perguntavam questão a questão)
const vistasDe = (userId) => R.memo(`evs:vistas:${userId}`, () => new Set(db.prepare('SELECT DISTINCT ref_id FROM est_evidencias WHERE user_id = ?').all(userId).map(r => r.ref_id)));
// as questões que o aluno ENXERGA neste percurso (situação visível para ele): questão retirada do banco não conta em nada
const questoesVivas = (c) => R.memo(`vivas:${c.escopo.id}:${c.situacoes.join(',')}`, () => new Set(db.prepare(`SELECT DISTINCT q.id FROM est_questoes q JOIN est_questao_vinculos v ON v.questao_id = q.id
    WHERE v.escopo_id = ? AND q.situacao IN (${c.situacoes.map(() => '?').join(',')})`).all(c.escopo.id, ...c.situacoes).map(r => r.id)));

function reagendar(userId, escopo, alvo, alvoId, resultado) {
  const atual = db.prepare('SELECT passo FROM est_revisoes WHERE user_id = ? AND escopo_id = ? AND alvo = ? AND alvo_id = ?').get(userId, escopo.id, alvo, alvoId);
  const prox = agenda.proxima({ passo: atual ? atual.passo : -1, resultado, hoje: hojeBR(), prazo: escopo.data_alvo });
  db.prepare(`INSERT INTO est_revisoes (user_id, escopo_id, alvo, alvo_id, passo, vencimento, ultimo_resultado, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, escopo_id, alvo, alvo_id) DO UPDATE SET passo = excluded.passo, vencimento = excluded.vencimento, ultimo_resultado = excluded.ultimo_resultado, atualizado_em = excluded.atualizado_em`)
    .run(userId, escopo.id, alvo, alvoId, prox.passo, prox.vencimento, resultado, nowISO());
  return prox;
}

// Uma linha por competência avaliada. `inedita` é medida ANTES de gravar.
// QUESTÃO SEM COMPETÊNCIA (vinculada só à disciplina, e não a um ponto do edital): a resposta é gravada do mesmo
// jeito, numa linha com a competência vazia. Sem isto ela nunca ficava "vista" — voltava ao topo do Praticar como
// inédita para sempre — e o erro nela não entrava no caderno de erros. Linha sem competência não move estado,
// nível, selo nem régua de aula: só registra que o aluno respondeu.
// `agendar: false` (diagnóstico de entrada): a resposta vale como evidência, mas o erro NÃO vira retomada com
// vencimento — é matéria que o aluno ainda não estudou; entra como ponto de partida, não como dívida.
const SEM_COMPETENCIA = '';
function registrar(usuario, escopo, { origem, refId, refVersao = 1, comps, modo, acerto, pistas = 0, tentativaId = '', tempo = 0, confianca = '', agendar = true }) {
  const inedita = !jaViu(usuario.id, refId);
  const versoes = Object.fromEntries(R.competencias(escopo.id).map(c => [c.codigo, c.versao]));
  const ins = db.prepare(`INSERT INTO est_evidencias (id, user_id, escopo_id, competencia_codigo, competencia_versao, origem, ref_id, ref_versao, tentativa_id, modo, acerto, pistas, inedita, tempo_seg, confianca, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const agora = nowISO();
  const resultado = !acerto ? 'erro' : (pistas > 0 || modo === 'estudo') ? 'acerto_com_ajuda' : 'acerto';
  const proximas = {};
  for (const c of (comps && comps.length ? comps : [SEM_COMPETENCIA])) {
    ins.run(novoId(), usuario.id, escopo.id, c, versoes[c] || 1, origem, refId, refVersao, tentativaId, modo, acerto ? 1 : 0, pistas, inedita ? 1 : 0,
      Math.max(0, Math.round(Number(tempo) || 0)), CONFIANCAS.includes(confianca) ? confianca : '', agora);
    if (origem === 'questao' && c !== SEM_COMPETENCIA && agendar) proximas[c] = reagendar(usuario.id, escopo, 'competencia', c, resultado);
  }
  R.esquecer('evs:'); // o que esta requisição já tinha lido das evidências deixou de valer
  return { inedita, resultado, proximas };
}

// ---------------------------------------------------------------------
// PAINEL — o que foi demonstrado, o que falta avaliar e a próxima tarefa útil
// ---------------------------------------------------------------------
function estadosDoAluno(usuario, escopo) {
  const evs = evidencias(usuario.id, escopo.id);
  const est = ev.estados(evs);
  const comps = R.competencias(escopo.id);
  // as evidências de cada competência, agrupadas UMA vez (antes: um filtro da lista inteira por competência)
  const porComp = new Map();
  for (const e of evs) { if (!porComp.has(e.competencia_codigo)) porComp.set(e.competencia_codigo, []); porComp.get(e.competencia_codigo).push(e); }
  const falhasSeguidas = (lista) => {
    let n = 0;
    for (let i = lista.length - 1; i >= 0; i--) { const e = lista[i]; if (!e.acerto && ev.independente(e)) n++; else if (e.acerto) break; }
    return n;
  };
  return comps.map(c => {
    const dela = porComp.get(c.codigo) || [];
    return {
      codigo: c.codigo, resultado: c.resultado, essencial: c.essencial, depende_de: c.depende_de,
      ...(est[c.codigo] || ev.estadoDaCompetencia([])),
      estagnada: falhasSeguidas(dela) >= FALHAS_PARA_ESTAGNACAO,
      // tudo o que se sabe desta competência veio do DIAGNÓSTICO de entrada: o erro ali não é "erro recente" de quem
      // estudou — a próxima tarefa a trata como matéria por começar
      so_diagnostico: dela.length > 0 && dela.every(e => e.tentativa_modo === 'diagnostico'),
      so_cards: dela.length > 0 && dela.every(e => e.origem === 'card'), // só avaliou card: a frase da próxima tarefa não fala em "pista"
    };
  });
}

function filaDeRevisao(usuario, escopo, limite = LIMITE_REVISOES_DIA) {
  const essenciais = new Set(R.competencias(escopo.id).filter(c => c.essencial).map(c => c.codigo));
  const linhas = db.prepare('SELECT alvo, alvo_id, passo, vencimento, ultimo_resultado FROM est_revisoes WHERE user_id = ? AND escopo_id = ?').all(usuario.id, escopo.id)
    .map(r => ({ ...r, essencial: r.alvo === 'competencia' && essenciais.has(r.alvo_id) }));
  return agenda.fila(linhas, { hoje: hojeBR(), limite });
}

// A recomendação vem sempre com o MOTIVO — o aluno pode discordar dela.
function proximaTarefa(usuario, escopo, c, est = estadosDoAluno(usuario, escopo)) {
  const uns = R.unidades(escopo.id, c.vis);
  const unidadeDe = (codigo) => (uns.find(u => u.competencias.includes(codigo)) || {}).codigo || '';
  const por = Object.fromEntries(est.map(e => [e.codigo, e]));
  const fila = filaDeRevisao(usuario, escopo);
  const rev = fila.hoje.find(r => r.alvo === 'competencia');
  if (rev) return { tipo: 'revisao', competencia: rev.alvo_id, motivo: `Retomada vencida em ${rev.vencimento}: recupere antes de reler.` };
  if (fila.hoje.length) return { tipo: 'cards', motivo: `${fila.hoje.length} card(s) para recordar hoje.` };

  const emPratica = est.find(e => e.estado === 'em_pratica' && !e.so_diagnostico);
  if (emPratica) {
    const falta = emPratica.depende_de.find(d => por[d] && !ev.demonstrada(por[d].estado));
    if (falta) return { tipo: 'pre_requisito', competencia: falta, unidade: unidadeDe(falta), motivo: `Você errou em "${emPratica.codigo}", que depende de "${falta}", ainda não demonstrada. Retome a base primeiro.` };
    if (emPratica.estagnada) return { tipo: 'mudar_estrategia', competencia: emPratica.codigo, unidade: unidadeDe(emPratica.codigo),
      motivo: `${FALHAS_PARA_ESTAGNACAO} tentativas sem apoio e sem acerto: repetir questão não está funcionando. Volte à explicação e ao exemplo resolvido — ou peça ajuda humana.` };
    return { tipo: 'intervencao', competencia: emPratica.codigo, unidade: unidadeDe(emPratica.codigo), motivo: 'Erro recente sem apoio: reveja o exemplo resolvido e tente uma questão diferente.' };
  }
  const comApoio = est.find(e => e.estado === 'demonstrada_com_apoio' && !e.so_diagnostico);
  if (comApoio) return { tipo: 'pratica_sem_apoio', competencia: comApoio.codigo, motivo: comApoio.so_cards ? 'Você recordou o card desta matéria — card é recordação, não demonstração. Falta acertar uma questão nova, sem apoio.' : 'Você acertou com pista ou em questão já vista. Falta acertar uma questão nova, sem apoio.' };
  // só entra na fila quem o aluno consegue demonstrar hoje; competência sem questão praticável vai para o fim
  const praticavel = R.competenciasComPratica(escopo.id, c.situacoes);
  // "por começar": nunca avaliada — ou só vista no diagnóstico de entrada, sem demonstração (o erro de lá é ponto de partida)
  const porComecar = (e) => e.estado === 'nao_avaliada' || (e.so_diagnostico && !ev.demonstrada(e.estado));
  const novas = est.filter(e => porComecar(e) && praticavel.has(e.codigo));
  const nova = novas.find(e => e.depende_de.every(d => !por[d] || ev.demonstrada(por[d].estado))) || novas[0];
  if (nova) return { tipo: 'aprender', competencia: nova.codigo, unidade: unidadeDe(nova.codigo), motivo: (nova.so_diagnostico ? 'Você a viu só no diagnóstico de entrada, que é ponto de partida: comece pela aula. ' : '') + (nova.depende_de.length ? 'Próxima competência do percurso: os pré-requisitos dela você já demonstrou.' : 'Competência do percurso que você ainda não começou e que não depende de outra.') };
  const semRetencao = est.find(e => e.estado === 'demonstrada_sem_apoio');
  if (semRetencao) return { tipo: 'aguardar_retencao', competencia: semRetencao.codigo, motivo: `Demonstrada, mas a retenção só se confirma com nova questão inédita após ${ev.INTERVALO_RETENCAO_DIAS} dias.` };
  const soLeitura = est.find(e => e.estado === 'nao_avaliada' && unidadeDe(e.codigo));
  if (soLeitura) return { tipo: 'aprender', competencia: soLeitura.codigo, unidade: unidadeDe(soLeitura.codigo), motivo: 'Esta parte ainda não tem questões para você demonstrar: estude a aula; ela não conta como demonstrada até haver questão.' };
  // há competência por avaliar, mas nem questão nem aula para ela (percurso só com o programa do edital):
  // dizer "tudo demonstrado" seria mentira — a tarefa é trazer questões
  const semMeio = est.filter(e => e.estado === 'nao_avaliada');
  if (semMeio.length) {
    return { tipo: 'sem_questoes', motivo: c.particular
      ? `Este percurso tem o programa, mas ainda não tem questões: ${semMeio.length} disciplina(s) esperam por elas.` + (pedidosLiberados(usuario) ? ' Importe uma prova em PDF (aba Escrita e oral › Importar prova) para praticar e fazer simulado.' : '')
      : `${semMeio.length} competência(s) deste percurso ainda não têm aula nem questão. Elas aparecem aqui assim que o conteúdo for publicado.` };
  }
  return { tipo: est.length ? 'concluido' : 'sem_competencias', motivo: est.length ? 'Todas as competências foram demonstradas e retidas até aqui.' : 'Este percurso ainda não tem competências definidas.' };
}

// PAINEL ENXUTO (réplica de 11/10/2026, R3-M9). O painel do curso real tem 365–386 KB, e era pedido INTEIRO a cada
// questão respondida no Praticar e a cada Voltar do navegador. Quase tudo ali é CONTEÚDO, que não muda com a resposta
// do aluno: o enunciado de cada competência, o título e a ficha de cada aula, o programa item a item. Por isso:
//   · o painel leva uma `assinatura` — a digital dessa parte fixa;
//   · `{ resumo: true }` devolve o MESMO painel sem a parte fixa das três listas grandes (competências, aulas, itens):
//     de cada entrada vão só o código e o que muda com o estudo. A tela junta ao painel que já tem (app-estudo.js ›
//     `juntarResumo`) — se a assinatura for outra (o curso publicou conteúdo), ela pede o painel inteiro;
//   · `responder` devolve esse resumo junto com a correção, quando a tela pede: responder uma questão não gera mais
//     pedido de painel nenhum.
// O resumo sai do painel inteiro, calculado do mesmo jeito — não há segunda conta para divergir.
const PAINEL_FIXOS = { competencias: ['codigo', 'resultado', 'essencial', 'depende_de'] };            // o resto da entrada é estado do aluno
const PAINEL_DINAMICOS = { unidades: ['estudada', 'aberta', 'video_assistido'], itens: ['estudado', 'dominio'] }; // o resto da entrada é conteúdo
const PAINEL_LISTAS = ['competencias', 'unidades', 'itens'];
const parteFixa = (lista, x) => Object.fromEntries(Object.entries(x).filter(([k]) => (PAINEL_FIXOS[lista] ? PAINEL_FIXOS[lista].includes(k) : !PAINEL_DINAMICOS[lista].includes(k))));
const parteViva = (lista, x) => Object.fromEntries(Object.entries(x).filter(([k]) => k === 'codigo' || (PAINEL_FIXOS[lista] ? !PAINEL_FIXOS[lista].includes(k) : PAINEL_DINAMICOS[lista].includes(k))));
const assinaturaDoPainel = (p) => require('crypto').createHash('sha1').update(JSON.stringify(PAINEL_LISTAS.map(l => p[l].map(x => parteFixa(l, x))))).digest('hex').slice(0, 16);
function painel(usuario, produto, slugEscopo, { resumo = false } = {}) {
  const p = painelInteiro(usuario, produto, slugEscopo);
  p.assinatura = assinaturaDoPainel(p);
  if (!resumo) return p;
  return { ...p, resumo: true, fixos: PAINEL_FIXOS, dinamicos: PAINEL_DINAMICOS, ...Object.fromEntries(PAINEL_LISTAS.map(l => [l, p[l].map(x => parteViva(l, x))])) };
}
function painelInteiro(usuario, produto, slugEscopo) {
  const c = abrir(usuario, produto, slugEscopo);
  const { escopo } = c;
  const est = estadosDoAluno(usuario, escopo);
  const por = Object.fromEntries(est.map(e => [e.codigo, e]));
  const cob = R.cobertura(escopo, c);
  // "estudado" (itens do programa e aulas) sai da régua única — a resposta dada no diagnóstico não entra nela
  const regua = reguaDeEstudo(usuario.id, escopo.id);
  const ordem = Object.fromEntries(ev.ESTADOS.map((e, i) => [e, i]));
  const uns = R.unidades(escopo.id, c.vis);
  // item ESTUDADO = alguma aula que o cobre está estudada (a régua única); item sem aula conta pela resposta em prática
  const estudadaPorCodigo = new Map(uns.map(u => [u.codigo, aulaEstudada(u, regua)]));
  // o domínio de um item é o da competência MAIS FRACA que o cobre
  const itens = cob.por_item.map(i => {
    const estados = i.competencias.map(k => (por[k.codigo] || {}).estado || 'nao_avaliada');
    const dominio = estados.length ? estados.sort((a, b) => ordem[a] - ordem[b])[0] : 'sem_competencia';
    const estudado = i.unidades.length ? i.unidades.some(cod => estudadaPorCodigo.get(cod)) : i.competencias.some(k => regua.comResposta.has(k.codigo));
    return { ...i, estudado, dominio };
  });
  const folhas = itens.filter(i => i.folha);
  const conta = (f) => folhas.filter(f).length;
  const fila = filaDeRevisao(usuario, escopo);
  const evs = evidencias(usuario.id, escopo.id);
  // por aula: estudada (a régua única de `aulaEstudada`) e videoaula assistida — a lista de aulas mostra
  const aulas = regua.aulas;
  // RETA FINAL (ADR-0007): em que fase o aluno está em relação à prova (a data é a do edital; sem ela, a do plano dele)
  const pl = db.prepare('SELECT entrada, plano FROM est_planos WHERE user_id = ? AND escopo_id = ?').get(usuario.id, escopo.id);
  const alvo = escopo.data_alvo || (pl ? j.parse(pl.entrada, {}).data_alvo || '' : '');
  const rf = (pl && j.parse(pl.plano, {}).reta_final) || {};
  const hj = hojeBR();
  const dias = alvo ? Math.round((Date.parse(alvo + 'T00:00:00Z') - Date.parse(hj + 'T00:00:00Z')) / 864e5) : null;
  const fase = dias == null || dias < 0 ? '' : dias === 0 ? 'dia_da_prova' : dias === 1 ? 'vespera_imediata'
    : rf.sem_materia_nova_desde && hj >= rf.sem_materia_nova_desde ? 'vespera' : rf.revisao_geral_desde && hj >= rf.revisao_geral_desde ? 'revisao_geral' : '';
  return {
    reta_final: alvo ? { data_alvo: alvo, dias, fase, foco: rf.foco || 'objetiva' } : null,
    erros_pendentes: errosPendentes(usuario.id, escopo.id, c).length,
    // PROVA EM ANDAMENTO (treino ou simulado): a aba Prova e a aba Hoje mostram "continuar", com o tempo que resta —
    // trocar de aba ou recarregar a página não pode esconder uma prova com o relógio correndo
    prova_aberta: provaAberta(usuario, escopo),
    escopo: { slug: escopo.slug, tipo: escopo.tipo, titulo: escopo.titulo, nivel: escopo.nivel, extensao: escopo.extensao, data_alvo: escopo.data_alvo, versao: escopo.versao, status: escopo.status, perfil: escopo.perfil, particular: !!c.particular },
    revisor: c.revisor,
    // três eixos, cada um com o seu denominador — nunca somados num percentual só
    cobertura: {
      folhas: cob.folhas, pendentes_de_leitura: cob.pendentes_de_leitura.length,
      material: { com: cob.material.com, sem: cob.material.sem.length },
      avaliacao: { com_questao_revisada: cob.avaliacao.com_questao_revisada, so_sugerida: cob.avaliacao.so_sugerida.length, sem: cob.avaliacao.sem.length },
      estudo: { estudados: conta(i => i.estudado) },
      dominio: { com_apoio: conta(i => i.dominio === 'demonstrada_com_apoio'), sem_apoio: conta(i => i.dominio === 'demonstrada_sem_apoio'), retidos: conta(i => i.dominio === 'retida') },
    },
    competencias: est,
    itens,
    // `mapa` diz à lista de aulas se há mapa mental para oferecer (ele mora no material de véspera)
    unidades: uns.map(u => ({ codigo: u.codigo, titulo: u.titulo, tempo_min: u.tempo_min, competencias: u.competencias, status: u.status,
      mapa: !!(u.vespera && u.vespera.objetiva && u.vespera.objetiva.mapa),
      // quais aulas animadas esta aula tem (fluxo, caso, erros) — o roteiro só vem quando o aluno abre
      animada: Object.keys(u.animacoes || {}), video: !!u.video_media_id,
      estudada: estudadaPorCodigo.get(u.codigo), aberta: !!(aulas.get(u.codigo) || {}).aberta_em, video_assistido: !!(aulas.get(u.codigo) || {}).video_assistido })),
    // o que falta para o certificado do curso (percurso particular não emite: vem `null`)
    conclusao: c.particular || escopo.status !== 'publicado' ? null : conclusao(usuario.id, produto.id),
    // ETAPA 2: o nível (pelo domínio demonstrado) e o diagnóstico — o cartão compacto da aba Hoje; a tela inteira é /jornada
    jornada: require('./jornada-estude').resumoParaPainel(usuario, c, est, regua, { cob, uns }),
    // CHAVE GERAL dos pedidos pagos (estudo_pedidos): sem ela, a aba "Escrita e oral" e as entradas de importar
    // prova e de ler edital não existem para este aluno — a tela não as desenha
    pedidos_disponiveis: pedidosLiberados(usuario),
    regra_pontuacao: escopo.regra_pontuacao,
    revisoes: { hoje: fila.hoje.length, adiadas: fila.adiadas },
    desempenho: {
      respostas: evs.length, acertos: evs.filter(e => e.acerto).length,
      ineditas: evs.filter(e => e.inedita).length, acertos_ineditas: evs.filter(e => e.inedita && e.acerto).length,
      sem_apoio: evs.filter(ev.independente).length, acertos_sem_apoio: evs.filter(e => ev.independente(e) && e.acerto).length,
    },
    proxima: proximaTarefa(usuario, escopo, c, est),
  };
}

// ---------------------------------------------------------------------
// UNIDADE (aula ativa): a solução de cada bloco só vai junto para o revisor;
// o aluno a recebe depois de tentar (rota própria).
// ---------------------------------------------------------------------
// ADR-0005: `nivel` 100 (padrão) | 50 | 25 | 10 troca só a EXPLICAÇÃO pela versão
// condensada; prática, aplicação e recordação não encolhem. Nível pedido que não
// existe ou está desatualizado (o 100 mudou depois) cai para o 100 e diz por quê.
// AULA ANIMADA: os roteiros de uma aula (fluxo com paradas, caso para decidir, erros da banca)
function animacoes(usuario, produto, slugEscopo, codigo) {
  const c = abrir(usuario, produto, slugEscopo);
  const u = R.unidadePorCodigo(c.escopo.id, c.vis, R.slug(codigo));
  if (!u) throw erro('Unidade não encontrada.', 404);
  return { codigo: u.codigo, titulo: u.titulo, ...(u.animacoes || {}) };
}
// `aberta`: a tela da aula avisa que o aluno ABRIU a aula (o mapa mental e a leitura também pedem a unidade,
// e não contam) — é o que o "Continuar" da biblioteca usa.
function unidade(usuario, produto, slugEscopo, codigo, { nivel = '100', aberta = false } = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const u = R.unidadePorCodigo(c.escopo.id, c.vis, R.slug(codigo));
  if (!u) throw erro('Unidade não encontrada.', 404);
  if (aberta) tocarAula(usuario.id, c.escopo.id, u.codigo, { aberta_em: nowISO() });
  const st = estadoDasAulas(usuario.id, c.escopo.id).get(u.codigo) || {};
  const atual = (k) => u.niveis[k] && u.niveis[k].derivado_de_versao === u.versao;
  const niveis = ['100', ...Object.keys(u.niveis)].map(k => ({ nivel: Number(k), disponivel: k === '100' || atual(k), desatualizado: k !== '100' && !!u.niveis[k] && !atual(k) }))
    .sort((a, b) => b.nivel - a.nivel); // do completo ao esqueleto: 100 · 50 · 25 · 10
  let usado = 100, motivo = '';
  const pedido = String(nivel);
  if (pedido !== '100') {
    if (atual(pedido)) usado = Number(pedido);
    else motivo = u.niveis[pedido] ? `O resumo de ${pedido} % ficou para trás: a aula completa mudou (versão ${u.versao}) e ele ainda é da versão ${u.niveis[pedido].derivado_de_versao}.` : `Esta aula ainda não tem o nível ${pedido} %.`;
  }
  let trocou = false;
  const blocos = u.blocos.map((b, i) => {
    let texto = b.texto;
    if (usado !== 100 && b.tipo === 'explicacao' && !trocou) { texto = u.niveis[pedido].texto; trocou = true; }
    else if (usado !== 100 && b.tipo === 'explicacao') texto = ''; // a condensação junta todas as explicações numa só
    return { n: i, tipo: b.tipo, titulo: b.titulo, texto, criterio: b.criterio, pistas_disponiveis: b.pistas.length, tem_solucao: !!b.solucao };
  }).filter(b => b.texto);
  const vespera = Object.fromEntries(Object.entries(u.vespera).map(([f, p]) => [f, { ...p, desatualizado: p.derivado_de_versao !== u.versao }]));
  // o tempo acompanha o nível: só a leitura encolhe (mesmo fator do plano)
  return { codigo: u.codigo, titulo: u.titulo, competencias: u.competencias, itens: u.itens, tempo_min: Math.round(u.tempo_min * plano.fatorNivel(usado)), versao: u.versao, status: u.status, fontes: u.fontes, midias: u.midias,
    // a videoaula entra no INÍCIO da aula; a entrega do arquivo passa por /academy/api/media/:id/link
    video: u.video_media_id ? { media_id: u.video_media_id, duracao_seg: u.video_duracao_seg || 0, posicao_seg: st.video_pos_seg || 0, assistido: !!st.video_assistido } : null,
    // o que o aluno já escreveu aqui: a tentativa de cada bloco e a nota livre da aula (voltam preenchidas)
    ...escritoNaAula(usuario.id, c.escopo.id, u.codigo, u),
    animada: Object.keys(u.animacoes || {}), // a aula interativa (fluxo, caso, erros) abre de dentro da aula
    // chegou ao fim do texto — e isso CONTA em toda aula (a régua é `aulaEstudada`): abrir + ler até o fim
    lida: !!st.lida_em, conta_pela_leitura: true, estudada: aulaEstudada(u, reguaDeEstudo(usuario.id, c.escopo.id)),
    // os destaques do autor são trechos literais do nível 100: nos resumos vale o negrito automático da norma
    destaques: usado === 100 ? (u.destaques || []) : [],
    nivel: usado, nivel_motivo: motivo, niveis, vespera, blocos };
}
// ---------------------------------------------------------------------
// LEITURA (ADR-0008) — a teoria em texto corrido, para ler e imprimir. A aula
// ativa começa pelo desafio e esconde a solução; quem quer LER a matéria
// precisa do texto inteiro, por disciplina, na ordem do edital. Só entram os
// blocos de exposição (explicação, exemplo, síntese): prática e aplicação têm
// solução guardada e continuam na aula.
// ---------------------------------------------------------------------
const BLOCOS_DE_LEITURA = ['explicacao', 'exemplo', 'sintese'];
// as aulas agrupadas pela disciplina-mãe do edital (ou no grupo geral, quando o programa não tem uma)
// (`cob` e `uns`: quem já calculou a cobertura e leu as aulas — o painel — passa adiante, para não refazer)
function aulasPorDisciplina(c, { cob = null, uns = null } = {}) {
  // Daqui só se usa o TEXTO de cada item do programa (o nome da disciplina). Quem não traz a cobertura pronta lê os
  // itens direto: calcular a cobertura inteira (≈ 50 ms no curso real, metade do custo da rota) só para tirar dela
  // o texto dos itens fazia `GET …/jornada`, a leitura, os mapas, o caderno e as ferramentas custarem como o painel
  // (réplica de 11/10/2026, baixa 11).
  const itens = new Map(cob ? cob.por_item.map(i => [i.codigo, i.texto]) : R.itens(c.escopo).map(i => [i.codigo, i.texto]));
  const disc = (u) => { const it = (u.itens[0] || ''); const d = it.split('.').slice(0, 2).join('.'); return it && itens.has(d) && d !== it ? d : ''; };
  const grupos = [], por = {};
  for (const u of uns || R.unidades(c.escopo.id, c.vis)) {
    const d = disc(u);
    if (!por[d]) grupos.push(por[d] = { codigo: d, nome: d ? itens.get(d) : 'Método de estudo', aulas: [] });
    por[d].aulas.push(u);
  }
  const achar = (disciplina) => {
    const g = por[disciplina === '_metodo' ? '' : s(disciplina, 20)];
    if (!g) throw erro('Disciplina não encontrada neste percurso.', 404);
    return g;
  };
  return { grupos, achar, itensDe: (u) => u.itens.map(i => ({ codigo: i, texto: itens.get(i) || '' })) };
}
function leitura(usuario, produto, slugEscopo, disciplina = '') {
  const c = abrir(usuario, produto, slugEscopo);
  const { grupos, achar, itensDe } = aulasPorDisciplina(c);
  // `n` é o endereço do bloco na aula: a marcação aponta para ele
  const blocosDe = (u) => u.blocos.map((b, n) => ({ ...b, n })).filter(b => BLOCOS_DE_LEITURA.includes(b.tipo) && b.texto);
  if (!disciplina) {
    return { disciplinas: grupos.map(g => ({ codigo: g.codigo, nome: g.nome, aulas: g.aulas.length,
      caracteres: g.aulas.reduce((n, u) => n + blocosDe(u).reduce((m, b) => m + b.texto.length, 0), 0) })) };
  }
  const g = achar(disciplina);
  return { codigo: g.codigo, nome: g.nome, escopo: c.escopo.titulo,
    aulas: g.aulas.map(u => ({ codigo: u.codigo, titulo: u.titulo, itens: itensDe(u), versao: u.versao, status: u.status,
      blocos: blocosDe(u).map(b => ({ n: b.n, tipo: b.tipo, titulo: b.titulo, texto: b.texto })), fontes: u.fontes, destaques: u.destaques || [] })) };
}
// ---------------------------------------------------------------------
// MAPAS — todos os mapas mentais do percurso num lugar só, por disciplina.
// O mapa mora no material de véspera de cada aula (um por foco de prova);
// aqui ele sai sozinho, sem fichas nem slides, para a página que os reúne.
// ---------------------------------------------------------------------
const FOCOS_MAPA = ['objetiva', 'escrita', 'oral'];
const mapasDe = (u) => Object.fromEntries(FOCOS_MAPA.map(f => [f, (u.vespera && u.vespera[f] && u.vespera[f].mapa) || '']));
function mapas(usuario, produto, slugEscopo, disciplina = '') {
  const c = abrir(usuario, produto, slugEscopo);
  const { grupos, achar, itensDe } = aulasPorDisciplina(c);
  if (!disciplina) {
    return { disciplinas: grupos.map(g => ({ codigo: g.codigo, nome: g.nome, aulas: g.aulas.length, com_mapa: g.aulas.filter(u => mapasDe(u).objetiva).length })) };
  }
  const g = achar(disciplina);
  return { codigo: g.codigo, nome: g.nome, escopo: c.escopo.titulo,
    aulas: g.aulas.map(u => ({ codigo: u.codigo, titulo: u.titulo, itens: itensDe(u), versao: u.versao, mapas: mapasDe(u) })) };
}

// ---------------------------------------------------------------------
// MARCA-TEXTO — o que o aluno grifa na leitura, para rever depois. É dele:
// ninguém mais vê. A âncora é o texto cru do bloco (aula, bloco, início, fim)
// e o trecho vai guardado junto: se a aula for reescrita, a marcação é
// reencontrada pelo trecho; se o trecho sumiu, ela não é apagada — aparece na
// lista como "solta", com o texto que ele tinha marcado.
// ---------------------------------------------------------------------
const CORES_MARCA = ['amarelo', 'verde', 'azul', 'rosa'];
// "marcador" não é grifo: é o marcador de página do leitor. Usa a mesma âncora (aula, bloco, trecho),
// e por isso também é reencontrado quando a aula é reescrita.
const MARCADOR = 'marcador';
const MAX_MARCA = 3000, MAX_MARCAS_POR_ESCOPO = 5000;
const marcaPublica = (m, extra = {}) => ({ id: m.id, unidade: m.unidade, bloco: m.bloco, inicio: m.inicio, fim: m.fim, texto: m.texto, cor: m.cor, nota: m.nota || '', atualizado_em: m.atualizado_em || '', criado_em: m.criado_em, solta: false, ...extra });
function marcacoes(usuario, produto, slugEscopo) {
  const c = abrir(usuario, produto, slugEscopo);
  const us = new Map(R.unidades(c.escopo.id, c.vis).map(u => [u.codigo, u]));
  const linhas = db.prepare('SELECT * FROM est_marcacoes WHERE user_id = ? AND escopo_id = ? ORDER BY criado_em').all(usuario.id, c.escopo.id);
  const ordem = new Map([...us.keys()].map((k, i) => [k, i]));
  return { cores: CORES_MARCA, marcacoes: linhas.map(m => {
    const u = us.get(m.unidade), b = u && u.blocos[m.bloco];
    let { inicio, fim } = m, solta = !b || !BLOCOS_DE_LEITURA.includes(b.tipo);
    if (!solta && b.texto.slice(inicio, fim) !== m.texto) {
      const i = b.texto.indexOf(m.texto);
      if (i < 0) solta = true; else { inicio = i; fim = i + m.texto.length; }
    }
    return marcaPublica(m, { inicio, fim, solta, titulo: u ? u.titulo : '' });
  }).sort((a, b) => (ordem.get(a.unidade) ?? 1e9) - (ordem.get(b.unidade) ?? 1e9) || a.bloco - b.bloco || a.inicio - b.inicio) };
}
function marcar(usuario, produto, slugEscopo, d = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const u = R.unidadePorCodigo(c.escopo.id, c.vis, R.slug(d.unidade));
  if (!u) throw erro('Aula não encontrada.', 404);
  const n = Number(d.bloco), b = Number.isInteger(n) ? u.blocos[n] : null;
  if (!b || !BLOCOS_DE_LEITURA.includes(b.tipo)) throw erro('Trecho não encontrado nesta aula.', 404);
  const inicio = Number(d.inicio), fim = Number(d.fim);
  if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio < 0 || fim <= inicio || fim > b.texto.length) throw erro('A seleção não cabe neste trecho.');
  if (fim - inicio > MAX_MARCA) throw erro(`Marque até ${MAX_MARCA} caracteres por vez.`);
  if (!CORES_MARCA.includes(d.cor) && d.cor !== MARCADOR) throw erro(`cor deve ser ${CORES_MARCA.join('|')}.`);
  if (db.prepare('SELECT COUNT(*) n FROM est_marcacoes WHERE user_id = ? AND escopo_id = ?').get(usuario.id, c.escopo.id).n >= MAX_MARCAS_POR_ESCOPO) throw erro('Você chegou ao limite de marcações deste percurso. Apague as que não usa mais.', 409);
  // o trecho é recortado AQUI, do texto do servidor: o cliente manda só as posições
  const m = { id: novoId(), unidade: u.codigo, bloco: n, inicio, fim, texto: b.texto.slice(inicio, fim), cor: d.cor, nota: s(textoDoAluno(d.nota), 500), criado_em: nowISO() };
  db.prepare('INSERT INTO est_marcacoes (id, user_id, escopo_id, unidade, bloco, inicio, fim, texto, cor, nota, versao_unidade, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(m.id, usuario.id, c.escopo.id, m.unidade, m.bloco, m.inicio, m.fim, m.texto, m.cor, m.nota, u.versao, m.criado_em);
  return { ok: true, marcacao: marcaPublica(m, { titulo: u.titulo }) };
}
function marcacaoDoAluno(usuario, c, id) {
  const m = db.prepare('SELECT * FROM est_marcacoes WHERE id = ? AND user_id = ? AND escopo_id = ?').get(s(id, 40), usuario.id, c.escopo.id);
  if (!m) throw erro('Marcação não encontrada.', 404);
  return m;
}
function editarMarcacao(usuario, produto, slugEscopo, id, d = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const m = marcacaoDoAluno(usuario, c, id);
  const cor = d.cor == null || m.cor === MARCADOR ? m.cor : d.cor; // marcador não vira grifo
  if (!CORES_MARCA.includes(cor) && cor !== MARCADOR) throw erro(`cor deve ser ${CORES_MARCA.join('|')}.`);
  const nota = d.nota == null ? m.nota : s(textoDoAluno(d.nota), 500);
  // DUAS ABAS (réplica de 11/10/2026, M5): a nota do grifo confere o `atualizado_em` que a tela leu (`lido_em`), como
  // a nota da aula — texto mais novo no servidor → 409 com o que está salvo, e nada é gravado. Trocar só a cor não
  // disputa texto com ninguém. Sem `lido_em` (tela antiga, chamada direta) vale o de sempre.
  const mudouNota = nota !== (m.nota || '');
  if (mudouNota && d.lido_em != null && String(d.lido_em) !== (m.atualizado_em || '')) {
    const e = erro('Esta anotação foi alterada em outra aba (ou em outro aparelho) depois que esta tela foi aberta. Nada foi gravado: veja o que está salvo e escolha.', 409);
    e.extra = { conflito: true, texto: m.nota || '', atualizado_em: m.atualizado_em || '' };
    throw e;
  }
  const em = mudouNota ? nowISO() : (m.atualizado_em || '');
  db.prepare('UPDATE est_marcacoes SET cor = ?, nota = ?, atualizado_em = ? WHERE id = ?').run(cor, nota, em, m.id);
  return { ok: true, marcacao: marcaPublica({ ...m, cor, nota, atualizado_em: em }) };
}
function removerMarcacao(usuario, produto, slugEscopo, id) {
  const c = abrir(usuario, produto, slugEscopo);
  db.prepare('DELETE FROM est_marcacoes WHERE id = ?').run(marcacaoDoAluno(usuario, c, id).id);
  return { ok: true };
}
function solucaoDoBloco(usuario, produto, slugEscopo, codigo, n, tentativa) {
  const c = abrir(usuario, produto, slugEscopo);
  const u = R.unidadePorCodigo(c.escopo.id, c.vis, R.slug(codigo));
  const b = u && u.blocos[Number(n)];
  if (!b || !b.solucao) throw erro('Bloco sem solução.', 404);
  // tentar antes de ver: a solução só sai contra uma tentativa escrita
  if (s(textoDoAluno(tentativa), 8000).length < 15) throw erro('Escreva a sua tentativa antes de ver a solução.');
  // …e fica guardada no caderno do aluno (antes só se conferia o tamanho e o texto era descartado)
  const gravada = gravarTentativa(usuario.id, c.escopo.id, u.codigo, Number(n), tentativa, u);
  // `texto` e `atualizado_em`: a tela acerta o "li em" do salvamento automático (senão o envio seguinte pareceria de outra aba)
  return { solucao: b.solucao, pistas: b.pistas, texto: gravada.texto, atualizado_em: gravada.atualizado_em };
}

// ---------------------------------------------------------------------
// PRÁTICA com questões do banco
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// CADERNO DE ERROS (ADR-0007) — "questão serve para achar lacuna". Pendente é a questão cuja
// ÚLTIMA resposta do aluno foi um erro; sai do caderno quando ele a acerta de novo. Refazer a
// questão não é demonstração (já foi vista): é prática — a evidência continua exigindo questão nova.
// ---------------------------------------------------------------------
// `c` (o contexto do aluno): com ele, questão RETIRADA do banco sai da conta — o painel dizia "1 questão no caderno
// de erros", o caderno abria vazio e a medalha "Caderno de erros zerado" ficava impossível naquela disciplina.
function errosPendentes(userId, escopoId, c = null) {
  const vivas = c ? questoesVivas(c) : null;
  const por = new Map();
  for (const e of evidencias(userId, escopoId)) {
    if (e.origem !== 'questao') continue;
    const x = por.get(e.ref_id) || { id: e.ref_id, erros: new Set(), ultima: '', pendente: false };
    if (!e.acerto) x.erros.add(e.criado_em);
    x.pendente = !e.acerto; x.ultima = e.criado_em; // as evidências vêm em ordem: a última manda
    por.set(e.ref_id, x);
  }
  return [...por.values()].filter(x => x.pendente && (!vivas || vivas.has(x.id))).map(x => ({ id: x.id, erros: x.erros.size, ultima: x.ultima })).sort((a, b) => b.ultima.localeCompare(a.ultima));
}
const anotacaoDe = (userId, questaoId) => (db.prepare('SELECT texto FROM est_anotacoes WHERE user_id = ? AND questao_id = ?').get(userId, questaoId) || {}).texto || '';
const anotacaoEm = (userId, questaoId) => (db.prepare('SELECT atualizado_em FROM est_anotacoes WHERE user_id = ? AND questao_id = ?').get(userId, questaoId) || {}).atualizado_em || '';
// TEXTO DO ALUNO TEM DE SER TEXTO (réplica de 11/10/2026, baixa 8): `{ "a": 1 }` era gravado como "[object Object]".
function textoDoAluno(v) {
  if (v != null && typeof v !== 'string') throw erro('O texto deve ser enviado como texto.');
  return v == null ? '' : v;
}
// DUAS ABAS OU DOIS APARELHOS (réplica de 11/10/2026, M5 / R3-B5). A nota da aula, a tentativa do bloco e a anotação
// da questão eram "vale a última": a tela aberta antes gravava o texto velho (ou vazio) por cima do que a outra tinha
// salvado, sem aviso. Agora a tela manda o `atualizado_em` que LEU (`lido_em`; '' = "li vazio"), e o servidor confere:
//   · é o mesmo do banco → ninguém mexeu: grava;
//   · é outro → 409 com `conflito`, o texto e o `atualizado_em` que estão no banco. NADA é gravado: a tela mostra o
//     texto da outra aba, mantém o que o aluno digitou e ele escolhe (ficar com um, com o outro, ou juntar);
//   · é outro e o envio é o de ÚLTIMA HORA (`ao_sair`: fechar a aba, F5 — não há ninguém para escolher) → o servidor
//     JUNTA: guarda o texto do banco e, abaixo dele, o que chegou (se um contém o outro, fica o maior). Nenhum some.
// Sem `lido_em` (tela antiga, chamada direta) o comportamento é o de sempre.
const SEPARADOR_DE_ABAS = '\n\n— escrito em outra aba —\n';
function conferirTextoLido(linha, lido, novo, aoSair, max) {
  if (lido == null) return { texto: novo, juntado: false };
  const noBanco = linha ? linha.texto : '', em = linha ? linha.atualizado_em : '';
  if (String(lido) === em || noBanco === novo) return { texto: novo, juntado: false };
  if (aoSair) {
    if (novo.includes(noBanco)) return { texto: novo, juntado: false };
    if (noBanco.includes(novo)) return { texto: noBanco, juntado: true };
    return { texto: s(noBanco + SEPARADOR_DE_ABAS + novo, max), juntado: true };
  }
  const e = erro('Este texto foi alterado em outra aba (ou em outro aparelho) depois que esta tela foi aberta. Nada foi gravado: veja abaixo o que está salvo e escolha.', 409);
  e.extra = { conflito: true, texto: noBanco, atualizado_em: em };
  throw e;
}
// Em PÁGINAS: com centenas de erros a lista era cortada em 100 sem aviso. O total é o do caderno inteiro; a tela
// mostra "1 a 100 de 689" e pede a página seguinte.
const ERROS_POR_PAGINA = 100;
function erros(usuario, produto, slugEscopo, { pagina = 1 } = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const pend = errosPendentes(usuario.id, c.escopo.id, c); // questão retirada do banco não fica cobrando o aluno
  const paginas = Math.max(1, Math.ceil(pend.length / ERROS_POR_PAGINA)), pg = Math.min(paginas, Math.max(1, Math.round(Number(pagina) || 1)));
  const lista = pend.slice((pg - 1) * ERROS_POR_PAGINA, pg * ERROS_POR_PAGINA).map(x => {
    const q = R.Questoes.obter(x.id);
    if (!q) return null;
    return { id: q.id, erros: x.erros, ultima: x.ultima, enunciado: q.enunciado, competencias: R.competenciasDaQuestao(q.id, c.escopo.id),
      alternativas: q.alternativas.map(a => ({ id: a.id, texto: a.texto, correta: a.correta, explicacao: a.explicacao })),
      comentario: q.comentario, origem: q.origem, vigencia: q.vigencia, anotacao: anotacaoDe(usuario.id, q.id), anotacao_em: anotacaoEm(usuario.id, q.id) };
  }).filter(Boolean);
  return { total: pend.length, pagina: pg, paginas, por_pagina: ERROS_POR_PAGINA, questoes: lista };
}
function anotar(usuario, produto, slugEscopo, questaoId, texto, { lido_em, ao_sair } = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const { q } = questaoDoEscopo(c, questaoId);
  if (!jaViu(usuario.id, q.id)) throw erro('Responda a questão antes de anotar: a anotação é sobre a sua resposta.', 409);
  const atual = db.prepare('SELECT texto, atualizado_em FROM est_anotacoes WHERE user_id = ? AND questao_id = ?').get(usuario.id, q.id);
  const { texto: t, juntado } = conferirTextoLido(atual, lido_em, s(textoDoAluno(texto), 2000), ao_sair === true, 2000);
  const agora = nowISO();
  if (!t) db.prepare('DELETE FROM est_anotacoes WHERE user_id = ? AND questao_id = ?').run(usuario.id, q.id);
  else db.prepare(`INSERT INTO est_anotacoes (user_id, questao_id, escopo_id, texto, atualizado_em) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, questao_id) DO UPDATE SET texto = excluded.texto, atualizado_em = excluded.atualizado_em`).run(usuario.id, q.id, c.escopo.id, t, agora);
  return { ok: true, anotacao: t, atualizado_em: t ? agora : '', juntado };
}

// O BANCO por eixo (ADR-0009): quantas questões de correção automática há por banca, órgão, cargo,
// ano e matéria — o aluno escolhe a banca do SEU edital e treina no estilo de quem vai aplicar a prova.
function bancoDeQuestoes(usuario, produto, slugEscopo) {
  const c = abrir(usuario, produto, slugEscopo);
  const lista = R.Questoes.doEscopo(c.escopo.id, { situacoes: c.situacoes }).filter(q => q.corrigivel);
  // a banca do edital DESTE percurso (está no edital: perfil.banca ou perfil.organizadora) — a tela a aponta no filtro
  const pf = (c.escopo.perfil && typeof c.escopo.perfil === 'object') ? c.escopo.perfil : {};
  const doEdital = pf.banca || pf.organizadora ? banco.bancaCanonica({ banca: String(pf.banca || pf.organizadora) }) : '';
  // MAIS COBRADO fala de "provas": a tela precisa dos números reais — quantas questões oficiais, de quantas provas
  // (órgão + ano), de que bancas e de que anos. Nada disso é escrito à mão na tela.
  const of = lista.filter(q => q.origem === 'oficial'), provas = new Map(), bancasOf = new Map(), anos = of.map(q => banco.eixos(q).ano).filter(Boolean);
  for (const q of of) {
    const e = banco.eixos(q), chave = (e.orgao || (q.procedencia || {}).concurso || '?') + ' · ' + (e.ano || '?');
    provas.set(chave, (provas.get(chave) || 0) + 1);
    if (e.banca) bancasOf.set(e.banca, (bancasOf.get(e.banca) || 0) + 1);
  }
  const oficiais_resumo = { questoes: of.length, provas: provas.size, lista_provas: [...provas.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => a.nome.localeCompare(b.nome)),
    bancas: [...bancasOf.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n), ano_de: anos.length ? Math.min(...anos) : 0, ano_ate: anos.length ? Math.max(...anos) : 0 };
  return { total: lista.length, oficiais: of.length, oficiais_resumo, banca_do_edital: doEdital, formato: formatoDoPercurso(c.escopo), ...banco.facetas(lista) };
}

function praticar(usuario, produto, slugEscopo, { competencia = '', n = 5, erradas = false, origem = '', ...resto } = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const eixo = banco.filtroDeEixos(resto);
  const pend = erradas ? new Set(errosPendentes(usuario.id, c.escopo.id).map(x => x.id)) : null;
  const emProva = questoesEmProvaAberta(usuario.id, c.escopo.id);
  const elegiveis = R.Questoes.doEscopo(c.escopo.id, { situacoes: c.situacoes, competencia: R.slug(competencia) })
    .filter(q => q.corrigivel && q.uso !== 'reservada') // reservada fica para aferição: não se gasta no treino
    .filter(q => !origem || q.origem === origem) // "só questões de prova oficial" (guia Mais cobrado)
    .filter(q => banco.casaEixos(q, eixo)) // banca, órgão, cargo, período (ADR-0009)
    .filter(q => !pend || pend.has(q.id))
    .filter(q => !emProva.has(q.id)); // a que está numa prova aberta dele fica para a prova
  const ja = vistasDe(usuario.id);
  const vistas = new Set(elegiveis.filter(q => ja.has(q.id)).map(q => q.id));
  const ordenadas = [...elegiveis.filter(q => !vistas.has(q.id)), ...elegiveis.filter(q => vistas.has(q.id))];
  const qtd = Math.min(20, Math.max(1, Math.round(Number(n) || 5)));
  return {
    elegiveis: elegiveis.length, ineditas: elegiveis.length - vistas.size,
    questoes: ordenadas.slice(0, qtd).map(q => ({ ...banco.paraAluno(q, usuario.id), ja_vista: vistas.has(q.id) })),
  };
}
// QUESTÃO EM PROVA ABERTA (segunda revisão, 11/10/2026): enquanto o aluno tem treino, simulado, diagnóstico ou
// teste final EM ANDAMENTO (e dentro do prazo), as questões daquela prova não saem no Praticar nem no quiz da aula,
// e `responder` as recusa (409). Antes, com o id de uma questão da prova, a rota devolvia gabarito, explicações e
// comentário na hora — e o teste final deixava de medir. Prova vencida ou encerrada não segura nada.
function questoesEmProvaAberta(userId, escopoId) {
  return new Set(db.prepare(`SELECT DISTINCT json_extract(i.value, '$.id') AS id FROM est_tentativas t, json_each(t.congelado, '$.itens') i
    WHERE t.user_id = ? AND t.escopo_id = ? AND t.estado = 'em_andamento' AND t.prazo_em > ?`).all(userId, escopoId, nowISO()).map(r => r.id));
}
function questaoDoEscopo(c, questaoId) {
  const q = R.Questoes.obter(s(questaoId, 40));
  const comps = q ? R.competenciasDaQuestao(q.id, c.escopo.id) : [];
  if (!q || !c.situacoes.includes(q.situacao) || !db.prepare('SELECT 1 FROM est_questao_vinculos WHERE questao_id = ? AND escopo_id = ?').get(q.id, c.escopo.id)) throw erro('Questão não encontrada.', 404);
  return { q, comps };
}
function pedirPista(usuario, produto, slugEscopo, questaoId) {
  const c = abrir(usuario, produto, slugEscopo);
  const { q } = questaoDoEscopo(c, questaoId);
  const linha = db.prepare('SELECT n FROM est_ajudas WHERE user_id = ? AND questao_id = ?').get(usuario.id, q.id);
  const n = linha ? linha.n : 0;
  if (n >= q.pistas.length) throw erro('Não há mais pistas para esta questão.');
  db.prepare('INSERT INTO est_ajudas (user_id, questao_id, n) VALUES (?, ?, 1) ON CONFLICT (user_id, questao_id) DO UPDATE SET n = n + 1').run(usuario.id, q.id);
  return { pista: q.pistas[n], usadas: n + 1, restantes: q.pistas.length - n - 1, aviso: 'Com pista, o acerto conta como prática com apoio.' };
}
function responder(usuario, produto, slugEscopo, questaoId, { resposta, confianca, tempo_seg, modo, painel: comPainel } = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const { q, comps } = questaoDoEscopo(c, questaoId);
  if (!q.corrigivel) throw erro('Esta questão não tem correção automática (aberta, anulada ou sem gabarito confirmado).');
  if (q.uso === 'reservada') throw erro('Questão reservada para simulado.', 403);
  if (questoesEmProvaAberta(usuario.id, c.escopo.id).has(q.id)) throw erro('Esta questão está numa prova sua em andamento: responda-a na prova. O gabarito aparece na correção, depois de enviar.', 409);
  // RESPOSTA TORTA É PEDIDO TORTO, não erro do aluno (réplica de 11/10/2026, baixa 8): uma LISTA numa questão de uma
  // alternativa só (`["a","b"]`) era corrigida como "errou" e ia para o caderno de erros; objeto e número, idem.
  const umaSo = q.tipo !== 'multipla';
  if (resposta != null && resposta !== '' && (umaSo ? typeof resposta !== 'string' : !(typeof resposta === 'string' || (Array.isArray(resposta) && resposta.every(x => typeof x === 'string'))))) {
    throw erro(umaSo ? 'Esta questão aceita uma alternativa só: envie o identificador dela, não uma lista.' : 'Envie a alternativa (ou a lista de alternativas) marcada.');
  }
  const sit = pontuacao.situacaoDoItem({ gabarito: banco.gabaritoDe(q) }, resposta);
  if (sit === 'em_branco') throw erro('Escolha uma alternativa.');
  // alternativa que não existe nesta questão não é "erro do aluno": é pedido torto (antes virava erro e ia para o caderno)
  const validas = new Set(q.alternativas.map(a => a.id));
  if (resposta !== pontuacao.ABSTENCAO && [].concat(resposta).some(x => !validas.has(String(x)))) throw erro('Alternativa inexistente nesta questão.');
  const acerto = sit === 'certa';
  const corrigida = transacao(() => {
    const pistas = (db.prepare('SELECT n FROM est_ajudas WHERE user_id = ? AND questao_id = ?').get(usuario.id, q.id) || {}).n || 0;
    db.prepare('DELETE FROM est_ajudas WHERE user_id = ? AND questao_id = ?').run(usuario.id, q.id);
    const r = registrar(usuario, c.escopo, { origem: 'questao', refId: q.id, refVersao: q.versao, comps,
      modo: modo === 'estudo' || pistas > 0 ? 'estudo' : 'pratica', acerto, pistas, tempo: tempo_seg, confianca });
    return {
      acerto, gabarito: banco.gabaritoDe(q), pistas_usadas: pistas, inedita: r.inedita,
      conta_como: r.resultado === 'acerto' ? (r.inedita ? 'demonstração sem apoio' : 'prática (questão já vista)') : r.resultado === 'acerto_com_ajuda' ? 'prática com apoio' : 'erro',
      alternativas: q.alternativas.map(a => ({ id: a.id, correta: a.correta, explicacao: a.explicacao })),
      comentario: q.comentario, procedencia: q.procedencia, vigencia: q.vigencia,
      competencias: comps, retomadas: r.proximas, anotacao: anotacaoDe(usuario.id, q.id), anotacao_em: anotacaoEm(usuario.id, q.id),
    };
  });
  // a tela pediu o painel junto (`painel: true`): vai o RESUMO, já com esta resposta contada — sem outro pedido
  return comPainel ? { ...corrigida, painel: painel(usuario, produto, slugEscopo, { resumo: true }) } : corrigida;
}

// ---------------------------------------------------------------------
// CARDS — recordar antes de ver o verso. A nota é do próprio aluno, então
// card nunca vira demonstração independente: entra como estudo.
// ---------------------------------------------------------------------
function cardsDoDia(usuario, produto, slugEscopo) {
  const c = abrir(usuario, produto, slugEscopo);
  const todos = R.cards(c.escopo.id, c.vis);
  const fila = filaDeRevisao(usuario, c.escopo);
  const vencidos = new Set(fila.hoje.filter(r => r.alvo === 'card').map(r => r.alvo_id));
  const agendados = new Set(db.prepare("SELECT alvo_id FROM est_revisoes WHERE user_id = ? AND escopo_id = ? AND alvo = 'card'").all(usuario.id, c.escopo.id).map(r => r.alvo_id));
  // "no máximo 5 cards novos por dia" É limite: conta os cards cuja PRIMEIRA avaliação foi hoje (data de Brasília).
  // Antes, avaliados os 5, a tela buscava outros 5 — dava para percorrer o acervo inteiro num dia.
  const novosHoje = db.prepare(`SELECT COUNT(*) n FROM (SELECT ref_id, MIN(criado_em) m FROM est_evidencias WHERE user_id = ? AND escopo_id = ? AND origem = 'card' GROUP BY ref_id) WHERE m >= ?`)
    .get(usuario.id, c.escopo.id, hojeBR() + 'T03:00:00.000Z').n;
  const novos = todos.filter(k => !agendados.has(k.id)).slice(0, Math.max(0, CARDS_NOVOS_DIA - novosHoje));
  const frente = (k, novo) => ({ id: k.id, competencia: k.competencia_codigo, frente: k.frente, novo });
  // os limites vão junto para a tela explicar "Card 1 de 5" — sem isso o aluno
  // lê a sessão do dia como se fosse o acervo inteiro e conclui que falta conteúdo
  return { vencidos: todos.filter(k => vencidos.has(k.id)).map(k => frente(k, false)), novos: novos.map(k => frente(k, true)), adiados: fila.adiadas, total: todos.length,
    limites: { novos_dia: CARDS_NOVOS_DIA, revisoes_dia: LIMITE_REVISOES_DIA }, novos_hoje: novosHoje, por_ver: todos.filter(k => !agendados.has(k.id)).length, revisor: c.revisor };
}
// REVISÃO DO ACERVO — quem responde pelo curso precisa ler todos os cards antes
// de publicar, e a fila do dia levaria meses. Só revisor; não agenda nem conta
// como estudo, porque ler o verso aberto não é recordar.
function todosOsCards(usuario, produto, slugEscopo) {
  const c = abrir(usuario, produto, slugEscopo);
  if (!c.revisor) throw erro('A lista completa é só para quem revisa o curso.', 403);
  // o título que o revisor reconhece é o da aula; a competência só tem o enunciado do resultado
  const titulos = new Map();
  for (const u of db.prepare('SELECT titulo, competencias FROM est_unidades WHERE escopo_id = ? ORDER BY ordem').all(c.escopo.id)) {
    for (const cod of j.parse(u.competencias, [])) if (!titulos.has(cod)) titulos.set(cod, u.titulo);
  }
  const grupos = [];
  for (const k of R.cards(c.escopo.id, c.vis)) {
    let g = grupos[grupos.length - 1];
    if (!g || g.competencia !== k.competencia_codigo) grupos.push(g = { competencia: k.competencia_codigo, titulo: titulos.get(k.competencia_codigo) || k.competencia_codigo, cards: [] });
    g.cards.push({ id: k.id, codigo: k.codigo, status: k.status, frente: k.frente, verso: k.verso, explicacao: k.explicacao, fonte: k.fonte });
  }
  return { total: grupos.reduce((n, g) => n + g.cards.length, 0), grupos };
}
function cardDoEscopo(c, cardId) {
  const k = R.cards(c.escopo.id, c.vis).find(x => x.id === s(cardId, 40));
  if (!k) throw erro('Card não encontrado.', 404);
  return k;
}
function revelarCard(usuario, produto, slugEscopo, cardId) {
  const k = cardDoEscopo(abrir(usuario, produto, slugEscopo), cardId);
  return { id: k.id, verso: k.verso, explicacao: k.explicacao, fonte: k.fonte };
}
function avaliarCard(usuario, produto, slugEscopo, cardId, resultado) {
  const c = abrir(usuario, produto, slugEscopo);
  const k = cardDoEscopo(c, cardId);
  if (!agenda.RESULTADOS.includes(resultado)) throw erro(`resultado deve ser ${agenda.RESULTADOS.join('|')}.`);
  return transacao(() => {
    // UMA AVALIAÇÃO POR CARD POR DIA (réplica de 11/10/2026, baixa 7): duplo clique ou duas abas avaliavam o mesmo card
    // duas vezes no mesmo instante, e ele subia dois degraus (revisão em 3 dias em vez de 1). O card avaliado HOJE
    // (data de Brasília) e ainda não vencido não é avaliado de novo: a segunda chamada devolve a agenda que já está
    // gravada (`repetida: true`), sem nova evidência e sem mexer no degrau. A fila do dia nunca o oferece duas vezes.
    const ja = db.prepare("SELECT passo, vencimento, atualizado_em FROM est_revisoes WHERE user_id = ? AND escopo_id = ? AND alvo = 'card' AND alvo_id = ?").get(usuario.id, c.escopo.id, k.id);
    if (ja && hojeBR(new Date(ja.atualizado_em)) === hojeBR() && !(ja.vencimento && ja.vencimento <= hojeBR())) {
      return { ok: true, repetida: true, passo: ja.passo, vencimento: ja.vencimento, motivo: 'Este card já foi avaliado hoje: vale a primeira avaliação.' };
    }
    registrar(usuario, c.escopo, { origem: 'card', refId: k.id, comps: [k.competencia_codigo], modo: 'estudo', acerto: resultado !== 'erro' });
    return { ok: true, ...reagendar(usuario.id, c.escopo, 'card', k.id, resultado) };
  });
}

// ---------------------------------------------------------------------
// PROVA com relógio do servidor. No início a prova é CONGELADA: itens,
// versões, ordem, gabarito e regra. Recarregar a página ou trocar de
// aparelho não reinicia o prazo; enviar duas vezes não gera duas notas.
// ---------------------------------------------------------------------
const abrirTentativa = (r) => r && { ...r, congelado: j.parse(r.congelado, {}), respostas: j.parse(r.respostas, {}), resultado: j.parse(r.resultado, null) };
// O FORMATO do percurso para o simulado: os blocos da regra com o peso de cada um e, se cadastrado, o total do edital
function formatoDoPercurso(escopo) {
  let f = null;
  try { f = pontuacao.blocosDaRegra(escopo.regra_pontuacao || {}); } catch (e) { f = null; } // regra torta não derruba a tela
  return f && { origem: f.origem, questoes: f.questoes, blocos: f.blocos.map(b => b.bloco), exemplo: pontuacao.repartirPorBloco(f.questoes || SIMULADO_QUESTOES_PADRAO, f.blocos) };
}
const SIMULADO_QUESTOES_PADRAO = 100; // o tamanho que a tela sugere para o simulado quando a regra não cadastra o total
const SIMULADO_PCT_RESERVADAS = 50;   // % das vagas de cada bloco do simulado que vão para questões reservadas inéditas (ver `iniciarTentativa`)
// a prova (treino ou simulado) que está aberta, sem carregar as questões: só o que o cartão "continuar" mostra
function provaAberta(usuario, escopo) {
  const r = db.prepare(`SELECT id, modo, inicio_em, prazo_em, posicao, respostas, json_array_length(congelado, '$.itens') AS total FROM est_tentativas
    WHERE user_id = ? AND escopo_id = ? AND estado = 'em_andamento' AND modo IN (${MODOS_TENTATIVA.map(() => '?').join(',')}) ORDER BY inicio_em DESC`).get(usuario.id, escopo.id, ...MODOS_TENTATIVA);
  if (!r) return null;
  if (prazoVenceu(r.prazo_em)) { consolidarSeExpirou(usuario, escopo, tentativaDe(usuario, r.id)); return null; } // venceu: vira resultado, com o que estava salvo
  return { id: r.id, modo: r.modo, inicio_em: r.inicio_em, prazo_em: r.prazo_em, agora: nowISO(), respondidas: Object.keys(j.parse(r.respostas, {})).length, total: r.total || 0, posicao: r.posicao || 0 };
}
const tentativaDe = (usuario, id) => abrirTentativa(db.prepare('SELECT * FROM est_tentativas WHERE id = ? AND user_id = ?').get(s(id, 40), usuario.id));

function iniciarTentativa(usuario, produto, slugEscopo, { modo = 'treino', competencias = [], n = 10, duracao_min = 0, aceitar_menos = false, ...resto } = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const eixo = banco.filtroDeEixos(resto);
  if (!MODOS_TENTATIVA.includes(modo)) throw erro(`modo deve ser ${MODOS_TENTATIVA.join('|')}.`);
  // só prova aberta segura outra prova: o diagnóstico pode ficar dias em andamento (faz-se em partes) sem travar o treino e o simulado
  const aberta = abrirTentativa(db.prepare(`SELECT * FROM est_tentativas WHERE user_id = ? AND escopo_id = ? AND estado = 'em_andamento' AND modo IN (${MODOS_TENTATIVA.map(() => '?').join(',')})`).get(usuario.id, c.escopo.id, ...MODOS_TENTATIVA));
  if (aberta) {
    const viva = consolidarSeExpirou(usuario, c.escopo, aberta);
    if (viva.estado === 'em_andamento') return { ...paraAlunoTentativa(viva), retomada: true };
  }
  const filtro = new Set((Array.isArray(competencias) ? competencias : []).map(R.slug).filter(Boolean));
  const compsDe = R.competenciasDasQuestoes(c.escopo.id);
  let elegiveis = R.Questoes.doEscopo(c.escopo.id, { situacoes: c.situacoes }).filter(q => q.corrigivel)
    .map(q => ({ q, comps: compsDe.get(q.id) || [] }))
    .filter(x => !filtro.size || x.comps.some(k => filtro.has(k)))
    .filter(x => banco.casaEixos(x.q, eixo)); // simulado só com a banca (órgão, cargo, período) escolhida
  // percurso sem questão nenhuma (só o programa do edital): não é "faltou questão para o filtro" — é dizer o que falta
  if (!elegiveis.length && !filtro.size && !banco.temFiltroDeEixos(eixo)) {
    throw erro(c.particular && pedidosLiberados(usuario) ? 'Este percurso ainda não tem questões — importe uma prova em PDF (aba Escrita e oral › Importar prova) para montar a prova.' : c.particular ? 'Este percurso ainda não tem questões.' : 'Este percurso ainda não tem questões de correção automática.', 409);
  }
  if (modo === 'treino') elegiveis = elegiveis.filter(x => x.q.uso !== 'reservada');
  // Prova simulada reproduz o edital: questão de competência TRANSVERSAL (método de estudo, técnica
  // de prova — competência que não cobre item do programa) não entra, a não ser que o aluno a peça.
  // Percurso SEM programa (o particular do aluno: só questões de prova) não tem o que separar — sem
  // esta guarda, nenhuma competência "cobre item" e o simulado sairia vazio.
  else if (!filtro.size) {
    const comItem = new Set(R.vinculos(c.escopo.id).map(v => v.competencia_codigo));
    if (comItem.size) elegiveis = elegiveis.filter(x => !x.comps.length || x.comps.some(k => comItem.has(k)));
  }
  const pedido = Math.min(200, Math.max(1, Math.round(Number(n) || 10)));
  const opcoes = ['reduzir a prova (aceitar_menos)', 'ampliar as competências'].concat(banco.temFiltroDeEixos(eixo) ? ['tirar o filtro de banca, órgão ou período'] : []);
  // SIMULADO NO FORMATO DO EDITAL (auditoria de 11/10/2026): sem matéria escolhida, o simulado segue a proporção dos
  // blocos da regra do percurso (o edital da magistratura do trabalho: 40/30/30 em 100). O sorteio é POR BLOCO —
  // antes saíam as `n` primeiras do sorteio geral, e um simulado de 100 vinha com 7 questões no Bloco III, onde o
  // mínimo do edital (0,9 ponto) era inalcançável. Com matéria escolhida, a prova é um recorte: não há o que repartir.
  // (banco sem o campo `bloco` nas questões — nenhuma cai em bloco da regra — não tem como repartir: sai o sorteio
  // geral, e o resultado dirá "fora do formato do edital")
  let fmt = modo === 'simulado' && !filtro.size ? formatoDoPercurso(c.escopo) && pontuacao.blocosDaRegra(c.escopo.regra_pontuacao || {}) : null;
  if (fmt && !elegiveis.some(x => fmt.blocos.some(b => b.bloco === (x.q.bloco || '')))) fmt = null;
  const partes = fmt ? pontuacao.repartirPorBloco(pedido, fmt.blocos).map(p => ({ ...p, lista: elegiveis.filter(x => (x.q.bloco || '') === p.bloco) })) : null;
  const faltas = partes ? partes.filter(p => p.lista.length < p.questoes).map(p => ({ bloco: p.bloco, pedidas: p.questoes, elegiveis: p.lista.length })) : [];
  // faltou questão: a lacuna é dita, nunca preenchida com repetição ou filtro afrouxado em silêncio
  if (partes && faltas.length && !aceitar_menos) {
    const e = erro('Faltam questões para montar o simulado no formato do edital: ' + faltas.map(f => `no bloco ${f.bloco} há ${f.elegiveis} questão(ões) elegível(is) para ${f.pedidas} pedida(s)`).join('; ') + '.', 409);
    e.extra = { elegiveis: partes.reduce((a, p) => a + Math.min(p.lista.length, p.questoes), 0), pedido, blocos: faltas, opcoes };
    throw e;
  }
  if (!partes && elegiveis.length < pedido && !aceitar_menos) {
    const e = erro(`Há ${elegiveis.length} questão(ões) elegível(is) para ${pedido} pedida(s).`, 409);
    e.extra = { elegiveis: elegiveis.length, pedido, opcoes };
    throw e;
  }
  if (!elegiveis.length) throw erro('Não há questões disponíveis para esta prova.', 409);
  const id = novoId();
  // TREINO: inéditas primeiro; o restante só completa.
  // SIMULADO: MISTURA de reservadas e banco (réplica de 11/10/2026, baixa 5). Antes as reservadas vinham SEMPRE na
  // frente: os dois primeiros simulados de 100 saíam só com as 249 reservadas (todas autorais), e as outras 1.373
  // questões — as 626 de prova oficial entre elas — só apareciam a partir do terceiro. Não há ADR que fixe a
  // proporção (o prompt mestre pede só "itens reservados para avaliação", fora do treino); a regra passa a ser:
  //   · em cada bloco, até `SIMULADO_PCT_RESERVADAS` % das vagas vão para reservadas INÉDITAS — a parte da prova que
  //     o aluno não tem como ter visto no Praticar, e que por isso mede;
  //   · as demais vagas vão para questões INÉDITAS do banco (autorais e de prova oficial), sorteadas sem distinção;
  //   · faltou de um lado, completa do outro (inédita reservada ↔ inédita do banco); só depois entram as já vistas
  //     (reservadas antes das demais).
  // Com 249 reservadas, o aluno passa a ter cinco simulados de 100 com reservada inédita (eram dois e meio), e
  // questão de prova oficial desde o primeiro. O peso é calculado UMA vez por questão.
  const ja = vistasDe(usuario.id);
  const sortearTreino = (lista, semente, quantas) => banco.embaralhar(lista, semente).map(x => ({ x, p: ja.has(x.q.id) ? 2 : 0 })).sort((a, b) => a.p - b.p).slice(0, quantas).map(y => y.x);
  const sortearSimulado = (lista, semente, quantas) => {
    const emb = banco.embaralhar(lista, semente), inedita = (x) => !ja.has(x.q.id), reservada = (x) => x.q.uso === 'reservada';
    const resNovas = emb.filter(x => reservada(x) && inedita(x)), bancoNovas = emb.filter(x => !reservada(x) && inedita(x));
    const a = resNovas.slice(0, Math.round(quantas * SIMULADO_PCT_RESERVADAS / 100)), b = bancoNovas.slice(0, quantas - a.length);
    let r = a.concat(b);
    for (const mais of [resNovas.slice(a.length), emb.filter(x => reservada(x) && !inedita(x)), emb.filter(x => !reservada(x) && !inedita(x))]) if (r.length < quantas) r = r.concat(mais.slice(0, quantas - r.length));
    return r;
  };
  const sortear = modo === 'simulado' ? sortearSimulado : sortearTreino;
  const escolhidas = partes ? partes.flatMap(p => sortear(p.lista, id + ':' + p.bloco, p.questoes)) : sortear(elegiveis, id, pedido);
  if (!escolhidas.length) throw erro('Não há questões disponíveis para esta prova.', 409);
  // a prova por blocos sai na ordem dos blocos do edital; dentro disso, questões do mesmo texto-base ficam juntas
  const ordemBloco = partes ? new Map(partes.map((p, i) => [p.bloco, i])) : null;
  const ordem = [...escolhidas].sort((a, b) => (ordemBloco ? ordemBloco.get(a.q.bloco || '') - ordemBloco.get(b.q.bloco || '') : 0) || (a.q.grupo || '~').localeCompare(b.q.grupo || '~'));
  const duracao = Math.round(Number(duracao_min) || 0) || Math.max(5, Math.ceil(ordem.reduce((t, x) => t + (x.q.tempo_estimado_seg || 180), 0) / 60));
  const inicio = new Date();
  const congelado = {
    modo, duracao_min: duracao, regra: c.escopo.regra_pontuacao || {}, escopo_versao: c.escopo.versao, filtro: eixo,
    por_bloco: partes ? partes.map(p => ({ bloco: p.bloco, pedidas: p.questoes, questoes: Math.min(p.questoes, p.lista.length) })) : null,
    // o bloco da pontuação é o campo `bloco` da questão; sem ele, a disciplina serve de bloco
    itens: ordem.map(x => ({ id: x.q.id, versao: x.q.versao, gabarito: banco.gabaritoDe(x.q), bloco: x.q.bloco || x.q.disciplina || '', competencias: x.comps, publico: banco.paraAluno(x.q, id) })),
  };
  db.prepare(`INSERT INTO est_tentativas (id, user_id, escopo_id, modo, congelado, inicio_em, prazo_em) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, usuario.id, c.escopo.id, modo, j.str(congelado), inicio.toISOString(), new Date(inicio.getTime() + duracao * 60e3).toISOString());
  return { ...paraAlunoTentativa(tentativaDe(usuario, id)), faltaram: pedido - ordem.length, faltas_por_bloco: faltas };
}

// O VEREDITO ("atingiu / não atingiu o critério") só existe para SIMULADO no formato da regra do percurso. Treino
// e prova curta mostram acertos e nota, com a frase "prova fora do formato do edital: sem veredito" — numa prova de
// 10 questões os mínimos do edital são inalcançáveis, e a tela dizia "Não atingiu" a quem acertava tudo.
//   atingiu | nao_atingiu   simulado no formato, pela regra cadastrada
//   fora_do_formato         treino, ou simulado em que algum mínimo é inalcançável (os motivos vão junto)
//   sem_criterio            a regra do percurso não define mínimo: não se inventa um
function vereditoDe(t) {
  const f = pontuacao.formatoDaProva(t.congelado.itens || [], t.congelado.regra || {});
  if (!f.definido) return { veredito: 'sem_criterio', motivos: [], no_formato: false };
  if (t.modo !== 'simulado') return { veredito: 'fora_do_formato', motivos: ['é um treino, não um simulado'], no_formato: false };
  if (!f.ok) return { veredito: 'fora_do_formato', motivos: f.motivos, no_formato: false };
  return { veredito: null, motivos: [], no_formato: true };
}
// A CORREÇÃO COMENTADA mostra a prova COMO O ALUNO A VIU: as alternativas na ordem congelada da tentativa, a letra
// pela POSIÇÃO (a mesma da tela da prova), o texto de cada uma e o enunciado. Antes saía o `id` original da
// alternativa ("D · sua resposta") — que, com as alternativas embaralhadas, era outra letra na tela: o aluno
// conferia o gabarito na alternativa errada. Montado na LEITURA, do que está congelado: vale para prova antiga.
const LETRAS_DA_TELA = 'ABCDEFGHIJ';
function resultadoParaAluno(t) {
  const r = t.resultado;
  if (!r) return r;
  const pub = new Map((t.congelado.itens || []).map(i => [i.id, i.publico || {}]));
  const itens = (r.itens || []).map(it => {
    const p = pub.get(it.id) || {}, det = new Map((it.alternativas || []).map(a => [a.id, a]));
    const naOrdem = p.alternativas && p.alternativas.length ? p.alternativas : (it.alternativas || []);
    const letra = new Map(naOrdem.map((a, k) => [a.id, LETRAS_DA_TELA[k] || String(k + 1)]));
    const marcadas = it.resposta == null || it.resposta === pontuacao.ABSTENCAO ? [] : [].concat(it.resposta).map(String), gab = it.gabarito == null ? [] : [].concat(it.gabarito).map(String);
    // `resposta` e `gabarito` seguem como dado (o id da alternativa); o que a TELA escreve é a letra pela posição
    return { id: it.id, situacao: it.situacao, resposta: it.resposta == null ? null : it.resposta, gabarito: it.gabarito, competencias: it.competencias, comentario: it.comentario || '', vigencia: it.vigencia || '', bloco: it.bloco || '',
      enunciado: p.enunciado || '', apoio: p.apoio || '', procedencia: p.procedencia || null, origem: p.origem || '',
      alternativas: naOrdem.map(a => ({ id: a.id, letra: letra.get(a.id), texto: a.texto || '', correta: !!(det.get(a.id) || {}).correta, marcada: marcadas.includes(a.id), explicacao: (det.get(a.id) || {}).explicacao || '' })),
      resposta_letra: marcadas.map(x => letra.get(x)).filter(Boolean).join(', '), gabarito_letra: gab.map(x => letra.get(x)).filter(Boolean).sort().join(', ') };
  });
  const v = vereditoDe(t);
  const veredito = v.veredito || (r.aprovado === null ? 'sem_criterio' : r.aprovado ? 'atingiu' : 'nao_atingiu');
  // `aprovado` só vai quando há veredito: fora do formato, o número cru da regra enganaria
  return { ...r, itens, veredito, veredito_motivos: v.motivos, no_formato: v.no_formato, aprovado: v.no_formato ? r.aprovado : null,
    respondidas: (r.certas || 0) + (r.erradas || 0) + (r.abstencoes || 0), total: (t.congelado.itens || []).length };
}
function paraAlunoTentativa(t) {
  const base = { id: t.id, modo: t.modo, estado: t.estado, inicio_em: t.inicio_em, prazo_em: t.prazo_em, agora: nowISO(), salvo_em: t.salvo_em, duracao_min: t.congelado.duracao_min };
  if (t.estado !== 'em_andamento') return { ...base, enviado_em: t.enviado_em, resultado: resultadoParaAluno(t) };
  const v = vereditoDe(t);
  // `posicao`: a questão em que o aluno estava — recarregar a página ou voltar pela aba retoma NELA, não na primeira
  // (prova iniciada antes de 11/10 congelou a `vigencia` dentro de `publico`: ela não vai — a nota de vigência
  // entrega a resposta, e só aparece na correção)
  return { ...base, questoes: t.congelado.itens.map(i => { const { vigencia, ...pub } = i.publico || {}; return pub; }), respostas: t.respostas, posicao: Math.min(Math.max(0, t.posicao || 0), Math.max(0, t.congelado.itens.length - 1)),
    por_bloco: t.congelado.por_bloco || null, sem_veredito: v.veredito === 'fora_do_formato', sem_veredito_motivos: v.motivos };
}

function corrigirTentativa(usuario, escopo, t, estado) {
  const res = pontuacao.corrigir(t.congelado.itens, t.respostas, t.congelado.regra);
  const porId = Object.fromEntries(res.por_item.map(i => [i.id, i]));
  const detalhe = t.congelado.itens.map(i => {
    const q = R.Questoes.obter(i.id);
    return { id: i.id, situacao: porId[i.id].situacao, resposta: t.respostas[i.id] == null ? null : t.respostas[i.id], gabarito: i.gabarito, competencias: i.competencias, bloco: i.bloco || '',
      alternativas: q ? q.alternativas.map(a => ({ id: a.id, correta: a.correta, explicacao: a.explicacao })) : [], comentario: q ? q.comentario : '',
      vigencia: q ? q.vigencia || '' : '' }; // a nota de vigência só aparece AQUI, na correção — nunca durante a prova
  });
  const { por_item, ...nota } = res;
  const resultado = { ...nota, itens: detalhe, expirada: estado === 'expirada' };
  transacao(() => {
    // só certa e errada viram evidência: abstenção é decisão de prova e branco
    // por falta de tempo não prova que o aluno não sabia
    for (const i of t.congelado.itens) {
      const sit = porId[i.id].situacao;
      // o erro do DIAGNÓSTICO não vira retomada com vencimento (matéria ainda não estudada): `agendar: false`
      if (sit === 'certa' || sit === 'errada') registrar(usuario, escopo, { origem: 'questao', refId: i.id, refVersao: i.versao, comps: i.competencias, modo: 'avaliacao', acerto: sit === 'certa', tentativaId: t.id, agendar: t.modo !== 'diagnostico' });
    }
    db.prepare('UPDATE est_tentativas SET estado = ?, enviado_em = ?, resultado = ? WHERE id = ?').run(estado, nowISO(), j.str(resultado), t.id);
  });
  return tentativaDe(usuario, t.id);
}
// O DIAGNÓSTICO e o TESTE FINAL não têm relógio: vencer a validade NÃO os corrige nem os dá por feitos — ficam
// "não concluídos", e o aluno retoma ou recomeça (jornada-estude.js). Só treino e simulado expiram com o que foi salvo.
// TOLERÂNCIA DO PRAZO (segunda revisão, 11/10/2026): a prova só é dada por expirada PROVA_TOLERANCIA_SEG segundos
// depois do prazo que o aluno vê. A resposta marcada no último segundo, cujo salvamento chega um instante depois,
// era descartada. O relógio da tela continua zerando no prazo: a folga é só para o que já estava a caminho.
const PROVA_TOLERANCIA_SEG = 5;
const prazoVenceu = (prazoEm) => Date.now() > Date.parse(prazoEm) + PROVA_TOLERANCIA_SEG * 1000;
function consolidarSeExpirou(usuario, escopo, t) {
  if (MODOS_DE_AFERICAO.includes(t.modo)) return t;
  return t.estado === 'em_andamento' && prazoVenceu(t.prazo_em) ? corrigirTentativa(usuario, escopo, t, 'expirada') : t;
}
function tentativaAberta(usuario, produto, slugEscopo, id) {
  const c = abrir(usuario, produto, slugEscopo);
  const t = tentativaDe(usuario, id);
  if (!t || t.escopo_id !== c.escopo.id) throw erro('Tentativa não encontrada.', 404);
  return { c, t: consolidarSeExpirou(usuario, c.escopo, t) };
}
const obterTentativa = (usuario, produto, slugEscopo, id) => paraAlunoTentativa(tentativaAberta(usuario, produto, slugEscopo, id).t);

function salvarRespostas(usuario, produto, slugEscopo, id, respostas, posicao) {
  const { t } = tentativaAberta(usuario, produto, slugEscopo, id);
  if (t.estado !== 'em_andamento') return { salvo: false, motivo: t.estado === 'expirada' ? 'O prazo terminou: valeram as respostas já salvas.' : 'Prova já enviada.', ...paraAlunoTentativa(t) };
  const validos = new Set(t.congelado.itens.map(i => i.id));
  const novas = { ...t.respostas };
  for (const [k, v] of Object.entries(respostas && typeof respostas === 'object' ? respostas : {})) {
    if (!validos.has(k)) continue;
    if (v == null || v === '') delete novas[k];
    else novas[k] = Array.isArray(v) ? v.map(x => s(x, 20)).slice(0, 10) : s(v, 20);
  }
  const agora = nowISO();
  // a questão em que o aluno está (para retomar nela); só muda se veio um número que cabe na prova
  const pos = Number.isInteger(posicao) && posicao >= 0 && posicao < validos.size ? posicao : (t.posicao || 0);
  db.prepare('UPDATE est_tentativas SET respostas = ?, salvo_em = ?, posicao = ? WHERE id = ?').run(j.str(novas), agora, pos, t.id);
  return { salvo: true, salvo_em: agora, respondidas: Object.keys(novas).length, total: validos.size, prazo_em: t.prazo_em, agora };
}
function enviarTentativa(usuario, produto, slugEscopo, id) {
  const { c, t } = tentativaAberta(usuario, produto, slugEscopo, id);
  return paraAlunoTentativa(t.estado === 'em_andamento' ? corrigirTentativa(usuario, c.escopo, t, 'enviada') : t);
}

// ---------------------------------------------------------------------
// PLANO — cabe ou não cabe no tempo declarado, e o que fica de fora
// ---------------------------------------------------------------------
function itensDoPlano(escopo, c) {
  const padrao = Array.isArray(escopo.perfil.esforco_padrao_min) ? escopo.perfil.esforco_padrao_min : null;
  const uns = R.unidades(escopo.id, c.vis);
  return R.itens(escopo).filter(i => i.folha).map(i => {
    // a estimativa vem do item; sem ela, do tempo das unidades que o cobrem; sem isso, do padrão do escopo
    const tempo = uns.filter(u => u.itens.includes(i.codigo) && u.tempo_min).reduce((a, u) => a + u.tempo_min / Math.max(1, u.itens.length), 0);
    const faixa = i.esforco_min || (tempo ? [Math.round(tempo), Math.round(tempo * 1.5)] : padrao);
    return { codigo: i.codigo, ordem: i.ordem, peso: i.peso, esforco_min: faixa };
  });
}
// ADR-0007 — "o edital é o mapa; a prova anterior é a bússola". Quando o programa NÃO cabe no tempo,
// a prioridade passa a seguir o padrão da banca: o ponto já cobrado em prova oficial vem antes, e o
// que fica de fora é o que ela ainda não cobrou. Quando cabe, a ordem é a do edital — sem reordenar.
function pesosDaBanca(escopo, c, itens) {
  const cob = R.cobertura(escopo, c);
  const of = Object.fromEntries(cob.por_item.map(i => [i.codigo, i.oficiais || 0]));
  if (!Object.values(of).some(Boolean)) return null; // sem prova oficial vinculada a ponto, não há padrão a seguir
  return itens.map(i => ({ ...i, peso: (Number(i.peso) || 0) + (of[i.codigo] || 0) }));
}
// A RETA FINAL do percurso: foco da véspera e quantos dias de véspera e de revisão geral. Um lugar só — o Plano
// e o cronograma das Ferramentas (que é uma visão de calendário do mesmo plano) pedem daqui.
function retaFinalDoEscopo(escopo) {
  // ADR-0005: a véspera segue a 1ª etapa do concurso (perfil.etapas, ordem do edital); sem perfil, objetiva
  const perfil = (escopo.perfil && typeof escopo.perfil === 'object') ? escopo.perfil : {};
  const etapa1 = Array.isArray(perfil.etapas) && perfil.etapas[0] ? String(perfil.etapas[0].foco || perfil.etapas[0].tipo || perfil.etapas[0].nome || perfil.etapas[0]) : '';
  const foco = /oral/i.test(etapa1) ? 'oral' : /discurs|escrit|senten|peça|peca/i.test(etapa1) ? 'escrita' : 'objetiva';
  // véspera só no escopo de edital (o perfil pode mudar os dias); assunto avulso não tem prova marcada
  const vesperaDias = perfil.vespera_dias != null && Number.isFinite(Number(perfil.vespera_dias)) ? Number(perfil.vespera_dias) : (escopo.tipo === 'edital' ? plano.VESPERA_PADRAO_DIAS : 0);
  const rgDias = perfil.revisao_geral_dias != null && Number.isFinite(Number(perfil.revisao_geral_dias)) ? Number(perfil.revisao_geral_dias) : (escopo.tipo === 'edital' ? plano.REVISAO_GERAL_PADRAO_DIAS : 0);
  return { foco, vespera_dias: vesperaDias, revisao_geral_dias: rgDias };
}
function definirPlano(usuario, produto, slugEscopo, entrada = {}, motivo = 'definido pelo aluno') {
  const c = abrir(usuario, produto, slugEscopo);
  // data em formato torto ("31/12/2026") era ignorada em silêncio, e o plano saía "sem prova marcada"
  if (!c.escopo.data_alvo && entrada.data_alvo != null && entrada.data_alvo !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(entrada.data_alvo))) throw erro('A data da prova deve vir como AAAA-MM-DD (ex.: 2026-12-31).');
  const e = {
    disponibilidade: plano.minutosPorDia(entrada.disponibilidade),
    indisponiveis: (Array.isArray(entrada.indisponiveis) ? entrada.indisponiveis : []).map(d => s(d, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 400),
    // a data da prova é do edital; o aluno só informa a dele quando o escopo não tem
    data_alvo: c.escopo.data_alvo || (/^\d{4}-\d{2}-\d{2}$/.test(entrada.data_alvo || '') ? entrada.data_alvo : ''),
    margem_pct: Math.min(50, Math.max(0, Number.isFinite(Number(entrada.margem_pct)) ? Number(entrada.margem_pct) : plano.MARGEM_PADRAO_PCT)),
  };
  const itensP = itensDoPlano(c.escopo, c);
  const base = { hoje: hojeBR(), ...e, ...retaFinalDoEscopo(c.escopo) };
  let p = plano.planejar({ ...base, itens: itensP });
  if (['nao_cabe', 'apertado'].includes(p.viabilidade.situacao)) {
    const pesados = pesosDaBanca(c.escopo, c, itensP);
    if (pesados) p = { ...plano.planejar({ ...base, itens: pesados }),
      prioridade: { criterio: 'banca', motivo: 'O programa não cabe inteiro no seu tempo: a ordem passou a seguir o que a banca já cobrou em prova oficial. O que ficou de fora são pontos que ela ainda não cobrou.' } };
  }
  const atual = db.prepare('SELECT versao, historico FROM est_planos WHERE user_id = ? AND escopo_id = ?').get(usuario.id, c.escopo.id);
  const historico = [...j.parse(atual && atual.historico, []), { em: nowISO(), motivo: s(motivo, 200), situacao: p.viabilidade.situacao, deficit_min: p.viabilidade.deficit_min || null, pendentes: p.pendentes.length }].slice(-20);
  db.prepare(`INSERT INTO est_planos (user_id, escopo_id, entrada, plano, historico, versao, atualizado_em) VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT (user_id, escopo_id) DO UPDATE SET entrada = excluded.entrada, plano = excluded.plano, historico = excluded.historico, versao = versao + 1, atualizado_em = excluded.atualizado_em`)
    .run(usuario.id, c.escopo.id, j.str(e), j.str(p), j.str(historico), nowISO());
  return obterPlano(usuario, produto, slugEscopo);
}
function obterPlano(usuario, produto, slugEscopo) {
  const c = abrir(usuario, produto, slugEscopo);
  const r = db.prepare('SELECT * FROM est_planos WHERE user_id = ? AND escopo_id = ?').get(usuario.id, c.escopo.id);
  if (!r) return { plano: null };
  // o plano inteiro pode ter centenas de sessões: a tela recebe hoje e as próximas duas semanas
  const { sessoes = [], ...p } = j.parse(r.plano, {});
  const hoje = hojeBR();
  return { entrada: j.parse(r.entrada, {}), versao: r.versao, atualizado_em: r.atualizado_em, historico: j.parse(r.historico, []),
    plano: { ...p, sessoes_total: sessoes.length, hoje: sessoes.find(x => x.data === hoje) || null, proximas: sessoes.filter(x => x.data >= hoje).slice(0, 14) } };
}

// ---------------------------------------------------------------------
// PARIDADE com os outros cursos (docs\estudo\paridade-com-os-outros-cursos.md) — o que os cursos comuns
// têm por `lesson_id` e o Estude passa a ter por AULA do percurso: o quiz dentro da aula, o caderno (a
// tentativa de cada bloco, a nota livre da aula), o vídeo que lembra onde parou, o "continuar" da biblioteca
// e a conclusão do curso (certificado). Nada aqui corrige questão: o quiz responde pelos caminhos de sempre.
// ---------------------------------------------------------------------
// AULA ESTUDADA — a RÉGUA ÚNICA (decisão do Augusto, 11/10/2026, depois da auditoria; substitui a de 10/10):
//
//   a aula está estudada quando o aluno ABRIU a aula  E  fez ao menos uma destas três coisas:
//     · leu o texto até o fim;
//     · assistiu a pelo menos 90 % da videoaula (`VIDEO_ASSISTIDO_PCT`);
//     · respondeu ao menos uma QUESTÃO do quiz ou da prática dessa aula, em modo de estudo ou de prática
//       (resposta avulsa, fora de prova, de uma competência da aula).
//
// O que NÃO marca aula como estudada: resposta em TREINO, SIMULADO, DIAGNÓSTICO ou TESTE FINAL (é prova: mede o
// que o aluno sabe, não prova que ele estudou a aula) e avaliação de CARD. Tudo isso continua valendo como
// evidência de DOMÍNIO da competência (estado, nível, selos prata e ouro) — isso é em evidencia.js, e não muda.
// Antes, um simulado de 200 questões marcava como "estudadas" aulas que o aluno nunca abriu, e o certificado saía
// com a carga horária de todas. Aula cuja competência só tem card (ou nada): a leitura e o vídeo contam, como em
// qualquer outra — não existe mais o caso especial da "aula sem questão".
//
// A biblioteca, a lista de aulas, "Estudados por você", o cronograma, o selo bronze, a liberação do teste final e
// o certificado usam ESTA régua (`reguaDeEstudo` + `aulaEstudada`) — não criar outra ao lado.
const MODOS_DE_AFERICAO = ['diagnostico', 'teste_final'];
const MODOS_DE_ESTUDO = ['estudo', 'pratica']; // o que o Praticar e o quiz da aula gravam (prova grava 'avaliacao')
const estadoDasAulas = (userId, escopoId) => new Map(db.prepare('SELECT * FROM est_aula_estado WHERE user_id = ? AND escopo_id = ?').all(userId, escopoId).map(r => [r.unidade, r]));
function reguaDeEstudo(userId, escopoId) {
  return R.memo(`evs:regua:${userId}:${escopoId}`, () => {
    // competências em que o aluno respondeu QUESTÃO fora de prova (`tentativa_id` vazio), em estudo ou prática
    const comResposta = new Set(db.prepare(`SELECT DISTINCT competencia_codigo c FROM est_evidencias
      WHERE user_id = ? AND escopo_id = ? AND origem = 'questao' AND tentativa_id = '' AND competencia_codigo != '' AND modo IN (${MODOS_DE_ESTUDO.map(() => '?').join(',')})`).all(userId, escopoId, ...MODOS_DE_ESTUDO).map(r => r.c));
    return { comResposta, aulas: estadoDasAulas(userId, escopoId) };
  });
}
function aulaEstudada(u, regua) {
  const st = regua.aulas.get(u.codigo);
  if (!st || !st.aberta_em) return false; // sem abrir a aula, nada conta
  return !!st.lida_em || !!st.video_assistido || u.competencias.some(k => regua.comResposta.has(k));
}
// a chave geral dos pedidos pagos mora em pedidos.js (que depende deste módulo): por isso o require é tardio
const pedidosLiberados = (usuario) => require('./pedidos').liberadoPara(usuario);
function unidadeDoAluno(usuario, produto, slugEscopo, codigo) {
  const c = abrir(usuario, produto, slugEscopo);
  const u = R.unidadePorCodigo(c.escopo.id, c.vis, R.slug(codigo)); // UMA aula: a nota, a tentativa e o vídeo (a cada ~10 s) não leem as outras 250
  if (!u) throw erro('Aula não encontrada.', 404);
  return { c, u };
}
function tocarAula(userId, escopoId, unidade, campos = {}) {
  db.prepare(`INSERT INTO est_aula_estado (user_id, escopo_id, unidade) VALUES (?, ?, ?) ON CONFLICT (user_id, escopo_id, unidade) DO NOTHING`).run(userId, escopoId, unidade);
  for (const [k, v] of Object.entries(campos)) db.prepare(`UPDATE est_aula_estado SET ${k} = ? WHERE user_id = ? AND escopo_id = ? AND unidade = ?`).run(v, userId, escopoId, unidade);
  R.esquecer('evs:regua:'); // a régua lida nesta requisição deixou de valer
}

// ---- CADERNO: a tentativa de cada bloco e a nota livre da aula ----
const BLOCOS_COM_TENTATIVA = ['desafio', 'recordacao', 'pratica', 'aplicacao']; // onde a tela pede "escreva antes de ver"
const MAX_TENTATIVA = 8000, MAX_NOTA_AULA = 6000;
// A TENTATIVA É DO BLOCO, NÃO DA POSIÇÃO (auditoria de 11/10/2026): ela era presa só ao ÍNDICE do bloco — reimportar
// a aula com os blocos em outra ordem colava o texto do aluno no exercício errado. Agora cada tentativa guarda a
// `bloco_ref` (a digital do enunciado do bloco em que foi escrita), e na leitura ela é reencontrada pelo enunciado:
//   · o bloco continua no mesmo lugar, com o mesmo texto → fica onde está;
//   · o bloco mudou de posição → a tentativa vai com ele;
//   · o enunciado foi reescrito e outro bloco tomou aquele índice → ela NÃO é colada no exercício novo: fica no
//     caderno como tentativa de versão anterior da aula, com o que o aluno escreveu.
// Tentativa de antes desta regra (sem `bloco_ref`) fica no índice em que foi gravada.
const refDoBloco = (b) => (b ? require('crypto').createHash('sha1').update(b.tipo + '\u0001' + b.texto).digest('hex').slice(0, 16) : '');
// `u` = a aula (com os blocos de hoje). Antes de gravar, as tentativas já guardadas da aula são postas no lugar em que
// os blocos delas estão HOJE — senão a gravação no índice novo passaria por cima da tentativa de outro exercício.
// `lido`: o `atualizado_em` que a tela leu ANTES de o aluno escrever (`conferirTextoLido`: duas abas não se sobrescrevem)
function gravarTentativa(userId, escopoId, unidade, bloco, texto, u = null, { lido_em, ao_sair } = {}) {
  const ref = u ? refDoBloco(u.blocos[bloco]) : '';
  if (u) arrumarTentativas(userId, escopoId, u);
  const atual = db.prepare('SELECT texto, atualizado_em FROM est_tentativas_bloco WHERE user_id = ? AND escopo_id = ? AND unidade = ? AND bloco = ?').get(userId, escopoId, unidade, bloco);
  const { texto: t, juntado } = conferirTextoLido(atual, lido_em, s(textoDoAluno(texto), MAX_TENTATIVA), ao_sair === true, MAX_TENTATIVA);
  if (!t) { db.prepare('DELETE FROM est_tentativas_bloco WHERE user_id = ? AND escopo_id = ? AND unidade = ? AND bloco = ?').run(userId, escopoId, unidade, bloco); return { texto: '', atualizado_em: '', juntado }; }
  const agora = nowISO();
  db.prepare(`INSERT INTO est_tentativas_bloco (user_id, escopo_id, unidade, bloco, texto, atualizado_em, bloco_ref) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, escopo_id, unidade, bloco) DO UPDATE SET texto = excluded.texto, atualizado_em = excluded.atualizado_em, bloco_ref = excluded.bloco_ref`).run(userId, escopoId, unidade, bloco, t, agora, ref);
  return { texto: t, atualizado_em: agora, juntado };
}
// regrava as tentativas da aula no índice ATUAL do bloco de cada uma (só quando alguma saiu do lugar). A que ficou
// sem bloco (o exercício foi reescrito) vai para um índice negativo: continua no caderno e não ocupa o lugar de ninguém.
function arrumarTentativas(userId, escopoId, u) {
  const linhas = db.prepare('SELECT bloco, texto, atualizado_em, bloco_ref FROM est_tentativas_bloco WHERE user_id = ? AND escopo_id = ? AND unidade = ?').all(userId, escopoId, u.codigo);
  const postas = tentativasNoLugar(u, linhas);
  if (!postas.some(p => p.n !== p.linha.bloco && !(p.n < 0 && p.linha.bloco < 0))) return;
  transacao(() => {
    db.prepare('DELETE FROM est_tentativas_bloco WHERE user_id = ? AND escopo_id = ? AND unidade = ?').run(userId, escopoId, u.codigo);
    const ins = db.prepare('INSERT INTO est_tentativas_bloco (user_id, escopo_id, unidade, bloco, texto, atualizado_em, bloco_ref) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let solta = 0;
    for (const p of postas) ins.run(userId, escopoId, u.codigo, p.n >= 0 ? p.n : -(++solta), p.linha.texto, p.linha.atualizado_em, p.linha.bloco_ref || '');
  });
}
// onde cada tentativa guardada mora HOJE na aula: { linha, n } — `n` é o índice atual do bloco, ou -1 (o bloco dela não existe mais)
function tentativasNoLugar(u, linhas) {
  const refs = u.blocos.map(refDoBloco), usados = new Set();
  const postas = linhas.map(l => {
    if (!l.bloco_ref || refs[l.bloco] === l.bloco_ref) return { linha: l, n: u.blocos[l.bloco] ? l.bloco : -1 };
    return { linha: l, n: refs.indexOf(l.bloco_ref) };
  });
  // dois registros no mesmo bloco (resto de reordenação): vale o mais recente
  return postas.sort((a, b) => String(b.linha.atualizado_em).localeCompare(String(a.linha.atualizado_em)))
    .map(p => { if (p.n >= 0 && usados.has(p.n)) return { ...p, n: -1 }; if (p.n >= 0) usados.add(p.n); return p; });
}
// salva sozinha enquanto o aluno escreve (a tela chama com atraso); bloco que não pede tentativa é recusado
function guardarTentativa(usuario, produto, slugEscopo, codigo, n, texto, lido = {}) {
  const { c, u } = unidadeDoAluno(usuario, produto, slugEscopo, codigo);
  const k = Number(n), b = Number.isInteger(k) ? u.blocos[k] : null;
  if (!b || !BLOCOS_COM_TENTATIVA.includes(b.tipo)) throw erro('Este trecho da aula não pede tentativa.', 404);
  return { ok: true, ...gravarTentativa(usuario.id, c.escopo.id, u.codigo, k, texto, u, lido) };
}
function anotarAula(usuario, produto, slugEscopo, codigo, texto, { lido_em, ao_sair } = {}) {
  const { c, u } = unidadeDoAluno(usuario, produto, slugEscopo, codigo);
  const atual = db.prepare('SELECT texto, atualizado_em FROM est_notas_aula WHERE user_id = ? AND escopo_id = ? AND unidade = ?').get(usuario.id, c.escopo.id, u.codigo);
  const { texto: t, juntado } = conferirTextoLido(atual, lido_em, s(textoDoAluno(texto), MAX_NOTA_AULA), ao_sair === true, MAX_NOTA_AULA);
  const agora = nowISO();
  if (!t) db.prepare('DELETE FROM est_notas_aula WHERE user_id = ? AND escopo_id = ? AND unidade = ?').run(usuario.id, c.escopo.id, u.codigo);
  else db.prepare(`INSERT INTO est_notas_aula (user_id, escopo_id, unidade, texto, atualizado_em) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, escopo_id, unidade) DO UPDATE SET texto = excluded.texto, atualizado_em = excluded.atualizado_em`).run(usuario.id, c.escopo.id, u.codigo, t, agora);
  return { ok: true, texto: t, atualizado_em: t ? agora : '', juntado };
}
// o que o aluno já escreveu NESTA aula — vai junto com a aula, para os campos voltarem preenchidos
function escritoNaAula(userId, escopoId, unidade, u = null) {
  const tentativas = {};
  const linhas = db.prepare('SELECT bloco, texto, atualizado_em, bloco_ref FROM est_tentativas_bloco WHERE user_id = ? AND escopo_id = ? AND unidade = ?').all(userId, escopoId, unidade);
  // cada tentativa volta no bloco em que foi escrita, ainda que ele tenha mudado de posição na aula
  for (const p of (u ? tentativasNoLugar(u, linhas) : linhas.map(l => ({ linha: l, n: l.bloco })))) if (p.n >= 0) tentativas[p.n] = { texto: p.linha.texto, atualizado_em: p.linha.atualizado_em };
  const nota = db.prepare('SELECT texto, atualizado_em FROM est_notas_aula WHERE user_id = ? AND escopo_id = ? AND unidade = ?').get(userId, escopoId, unidade);
  return { tentativas, nota: nota || { texto: '', atualizado_em: '' } };
}

// ---- MEU CADERNO: tudo o que o aluno escreveu no percurso, por disciplina e aula ----
// Tentativas, nota da aula, marcações COM nota e anotações do caderno de erros. É dele: a consulta é sempre
// por `user_id`, e o percurso passa pela mesma porta (`abrir`) do resto. A busca e a impressão são da tela.
function caderno(usuario, produto, slugEscopo) {
  const c = abrir(usuario, produto, slugEscopo);
  const uid = usuario.id, eid = c.escopo.id;
  const { grupos } = aulasPorDisciplina(c);
  const por = (sql) => db.prepare(sql).all(uid, eid);
  const agrupar = (linhas, chave = 'unidade') => { const m = new Map(); for (const l of linhas) { if (!m.has(l[chave])) m.set(l[chave], []); m.get(l[chave]).push(l); } return m; };
  const tent = agrupar(por('SELECT unidade, bloco, texto, atualizado_em, bloco_ref FROM est_tentativas_bloco WHERE user_id = ? AND escopo_id = ? ORDER BY bloco'));
  const notas = new Map(por('SELECT unidade, texto, atualizado_em FROM est_notas_aula WHERE user_id = ? AND escopo_id = ?').map(n => [n.unidade, n]));
  const marcas = agrupar(por("SELECT unidade, bloco, inicio, texto, cor, nota, criado_em FROM est_marcacoes WHERE user_id = ? AND escopo_id = ? AND nota != '' ORDER BY bloco, inicio"));
  // a anotação do caderno de erros é por QUESTÃO: fica na primeira aula que cobre uma competência dela
  const todas = grupos.flatMap(g => g.aulas);
  const anot = new Map(), avulsas = [];
  for (const a of por('SELECT questao_id, texto, atualizado_em FROM est_anotacoes WHERE user_id = ? AND escopo_id = ? ORDER BY atualizado_em')) {
    const q = R.Questoes.obter(a.questao_id);
    const comps = q ? R.competenciasDaQuestao(q.id, eid) : [];
    const u = todas.find(x => x.competencias.some(k => comps.includes(k)));
    const item = { questao: a.questao_id, enunciado: q ? s(q.enunciado, 400) : '(questão retirada do banco)', texto: a.texto, em: a.atualizado_em };
    if (u) { if (!anot.has(u.codigo)) anot.set(u.codigo, []); anot.get(u.codigo).push(item); } else avulsas.push(item);
  }
  const total = { tentativas: 0, notas: 0, marcacoes: 0, anotacoes: avulsas.length };
  const disciplinas = grupos.map(g => ({ codigo: g.codigo || '_metodo', nome: g.nome, aulas: g.aulas.map(u => {
    // o enunciado ao lado da tentativa é o do bloco em que ela foi escrita (reencontrado pela digital); bloco que saiu da aula: sem enunciado, com o aviso
    const t = tentativasNoLugar(u, tent.get(u.codigo) || []).sort((a, b) => (a.n < 0 ? 1e9 : a.n) - (b.n < 0 ? 1e9 : b.n)).map(p => { const b = p.n >= 0 ? u.blocos[p.n] : null, x = p.linha;
      return { bloco: p.n >= 0 ? p.n : x.bloco, tipo: b ? b.tipo : '', titulo: b ? b.titulo || '' : 'Exercício de uma versão anterior da aula', enunciado: b ? s(b.texto, 600) : '', texto: x.texto, em: x.atualizado_em, solta: p.n < 0 }; });
    const n = notas.get(u.codigo), m = (marcas.get(u.codigo) || []).map(x => ({ texto: x.texto, nota: x.nota, cor: x.cor, em: x.criado_em })), an = anot.get(u.codigo) || [];
    total.tentativas += t.length; total.notas += n ? 1 : 0; total.marcacoes += m.length; total.anotacoes += an.length;
    return { codigo: u.codigo, titulo: u.titulo, nota: n ? { texto: n.texto, em: n.atualizado_em } : null, tentativas: t, marcacoes: m, anotacoes: an };
  }).filter(a => a.nota || a.tentativas.length || a.marcacoes.length || a.anotacoes.length) })).filter(d => d.aulas.length);
  return { escopo: c.escopo.titulo, curso: produto.titulo, aluno: usuario.nome || '', total, disciplinas, avulsas };
}

// ---- QUIZ DESTA AULA: até 5 questões das competências e dos itens da aula ----
// Só ESCOLHE as questões: quem corrige, conta pista, explica e registra a evidência são `pedirPista` e
// `responder`, pelas rotas de sempre. Inédita primeiro, já vista depois — a mesma ordem do Praticar.
const QUIZ_DA_AULA = 5;
function quizDaAula(usuario, produto, slugEscopo, codigo) {
  const { c, u } = unidadeDoAluno(usuario, produto, slugEscopo, codigo);
  const comps = new Set(u.competencias), itens = new Set(u.itens);
  const doItem = itens.size ? new Set(db.prepare("SELECT questao_id q, codigo FROM est_questao_vinculos WHERE escopo_id = ? AND alvo = 'item'").all(c.escopo.id).filter(v => itens.has(v.codigo)).map(v => v.q)) : new Set();
  const compsDe = R.competenciasDasQuestoes(c.escopo.id), ja = vistasDe(usuario.id);
  const emProva = questoesEmProvaAberta(usuario.id, c.escopo.id);
  const elegiveis = R.Questoes.doEscopo(c.escopo.id, { situacoes: c.situacoes })
    .filter(q => q.corrigivel && q.uso !== 'reservada' && !emProva.has(q.id))
    .filter(q => doItem.has(q.id) || (compsDe.get(q.id) || []).some(k => comps.has(k)));
  const vistas = new Set(elegiveis.filter(q => ja.has(q.id)).map(q => q.id));
  const ordenadas = [...elegiveis.filter(q => !vistas.has(q.id)), ...elegiveis.filter(q => vistas.has(q.id))];
  return { total: elegiveis.length, ineditas: elegiveis.length - vistas.size, limite: QUIZ_DA_AULA, competencia: u.competencias[0] || '',
    questoes: ordenadas.slice(0, QUIZ_DA_AULA).map(q => ({ ...banco.paraAluno(q, usuario.id), ja_vista: vistas.has(q.id) })) };
}

// ---- VÍDEO DA AULA: lembra a posição e registra "assistiu" (a partir de 90 %) ----
const VIDEO_ASSISTIDO_PCT = 90;
function registrarVideo(usuario, produto, slugEscopo, codigo, { posicao_seg, duracao_seg } = {}) {
  const { c, u } = unidadeDoAluno(usuario, produto, slugEscopo, codigo);
  if (!u.video_media_id) throw erro('Esta aula não tem videoaula.', 404);
  // a duração que vale é a do cadastro do vídeo; a do navegador só serve quando o cadastro não tem
  const dur = Number(u.video_duracao_seg) || Math.max(0, Math.round(Number(duracao_seg) || 0));
  let pos = Math.max(0, Math.round(Number(posicao_seg) || 0));
  if (dur) pos = Math.min(pos, dur);
  const assistiu = !!dur && pos * 100 >= dur * VIDEO_ASSISTIDO_PCT;
  const antes = estadoDasAulas(usuario.id, c.escopo.id).get(u.codigo);
  // chegou ao fim: da próxima vez começa do início; "assistido" não volta atrás
  tocarAula(usuario.id, c.escopo.id, u.codigo, { video_pos_seg: dur && pos >= dur - 15 ? 0 : pos, video_assistido: assistiu || (antes && antes.video_assistido) ? 1 : 0, video_em: nowISO() });
  const st = estadoDasAulas(usuario.id, c.escopo.id).get(u.codigo);
  return { ok: true, posicao_seg: st.video_pos_seg, assistido: !!st.video_assistido };
}

// ---- LEITURA ATÉ O FIM: a tela avisa quando o fim do texto da aula entrou na tela ----
// Só registra em aula que o aluno ABRIU (a tela da aula; o leitor e o mapa não contam), e não volta atrás.
// Conta em TODA aula: abrir + ler até o fim é uma das três formas de estudar a aula (`aulaEstudada`).
function registrarLeitura(usuario, produto, slugEscopo, codigo) {
  const { c, u } = unidadeDoAluno(usuario, produto, slugEscopo, codigo);
  const antes = estadoDasAulas(usuario.id, c.escopo.id).get(u.codigo);
  if (!antes || !antes.aberta_em) throw erro('Abra a aula antes de registrar a leitura.', 409);
  if (!antes.lida_em) tocarAula(usuario.id, c.escopo.id, u.codigo, { lida_em: nowISO() });
  return { ok: true, lida: true, estudada: aulaEstudada(u, reguaDeEstudo(usuario.id, c.escopo.id)) };
}

// ---- CONCLUSÃO DO CURSO (certificado) e PROGRESSO da biblioteca ----
// Critério DECIDIDO pelo Augusto em 11/10/2026 (constantes nomeadas): todas as aulas publicadas do percurso do
// curso estudadas (pela régua de `aulaEstudada`) e ao menos um SIMULADO QUE CONTA. A aula-casca do curso não
// entra em conta nenhuma. Percurso particular do aluno não emite certificado nem soma aqui.
// O simulado que conta: ENVIADO pelo aluno (prova que expirou não conta), NO FORMATO da regra do percurso (todo
// mínimo do edital alcançável — `pontuacao.formatoDaProva`) e com ao menos 80 % das questões RESPONDIDAS. Antes
// valia um simulado de 1 questão enviado em branco. A carga horária do certificado continua a soma dos tempos das aulas.
const CERT_PCT_AULAS_ESTUDADAS = 100;
const CERT_PROVAS_ENVIADAS = 1;
const CERT_MODOS_DE_PROVA = ['simulado'];     // "Treino" é prática com relógio; quem prova o percurso é o simulado
const CERT_SIMULADO_PCT_RESPONDIDAS = 80;     // % mínimo de questões respondidas no simulado que conta
const CERT_SIMULADO_QUESTOES_MIN = 5;         // percurso cuja regra NÃO define mínimos (não há formato a conferir): tamanho mínimo do simulado
const SIMULADOS_CONFERIDOS = new Map();       // tentativa enviada não muda mais: a conferência é guardada pelo id
function simuladoQueConta(linha) {
  if (SIMULADOS_CONFERIDOS.has(linha.id)) return SIMULADOS_CONFERIDOS.get(linha.id);
  const t = abrirTentativa(linha), itens = t.congelado.itens || [];
  const f = pontuacao.formatoDaProva(itens, t.congelado.regra || {});
  // RESPONDIDA = marcou uma alternativa. "Não respondida" (abstenção) é decisão de prova, mas não é resposta:
  // um simulado inteiro em abstenção cumpria os 80 % e liberava o certificado.
  const respondidas = itens.filter(i => t.respostas[i.id] != null && t.respostas[i.id] !== '' && t.respostas[i.id] !== pontuacao.ABSTENCAO).length;
  const noFormato = f.definido ? f.ok : itens.length >= CERT_SIMULADO_QUESTOES_MIN;
  const r = { no_formato: noFormato, respondidas, total: itens.length, conta: noFormato && itens.length > 0 && respondidas * 100 >= itens.length * CERT_SIMULADO_PCT_RESPONDIDAS };
  if (SIMULADOS_CONFERIDOS.size > 5000) SIMULADOS_CONFERIDOS.clear();
  SIMULADOS_CONFERIDOS.set(linha.id, r);
  return r;
}
function percursosDoCurso(productId) { return R.Escopos.doProduto(productId, ['publicado']); }
function conclusao(userId, productId) {
 return R.comCache(() => {
  const escopos = percursosDoCurso(productId);
  let total = 0, estudadas = 0, carga = 0, provas = 0, enviados = 0;
  for (const e of escopos) {
    const regua = reguaDeEstudo(userId, e.id);
    for (const u of R.unidades(e.id, ['publicado'])) {
      total++; carga += u.tempo_min || 0;
      if (aulaEstudada(u, regua)) estudadas++;
    }
    // só os ids primeiro: a prova inteira (o congelado) só é aberta para simulado ainda não conferido
    for (const s0 of db.prepare(`SELECT id FROM est_tentativas WHERE user_id = ? AND escopo_id = ? AND estado = 'enviada' AND modo IN (${CERT_MODOS_DE_PROVA.map(() => '?').join(',')})`).all(userId, e.id, ...CERT_MODOS_DE_PROVA)) {
      enviados++;
      const v = SIMULADOS_CONFERIDOS.get(s0.id) || simuladoQueConta(db.prepare('SELECT * FROM est_tentativas WHERE id = ?').get(s0.id));
      if (v.conta) provas++;
    }
  }
  const exigidas = Math.ceil(total * CERT_PCT_AULAS_ESTUDADAS / 100);
  const faltamAulas = Math.max(0, exigidas - estudadas), faltamProvas = Math.max(0, CERT_PROVAS_ENVIADAS - provas);
  const cumprido = total > 0 && !faltamAulas && !faltamProvas;
  const partes = [faltamAulas ? `${faltamAulas} aula${faltamAulas > 1 ? 's' : ''}` : '', faltamProvas ? `${faltamProvas} simulado${faltamProvas > 1 ? 's' : ''}` : ''].filter(Boolean);
  const cert = db.prepare("SELECT id FROM certificates WHERE user_id = ? AND product_id = ? AND COALESCE(revogado_em, '') = ''").get(userId, productId);
  return { total_aulas: total, estudadas, faltam_aulas: faltamAulas, provas_enviadas: provas, simulados_enviados: enviados, faltam_provas: faltamProvas, carga_horaria_min: carga, cumprido,
    simulado_pct_respondidas: CERT_SIMULADO_PCT_RESPONDIDAS,
    certificado: cert ? cert.id : '',
    falta_txt: !total ? 'Este curso ainda não emite certificado: o percurso dele ainda não foi publicado.'
      : cumprido ? '' : `Para emitir o certificado falta${partes.length > 1 || faltamAulas > 1 || faltamProvas > 1 ? 'm' : ''} ${partes.join(' e ')}: estude todas as aulas do percurso (abra cada aula e leia até o fim, assista à videoaula ou responda uma questão do quiz dela) e envie, na aba Prova, um simulado no formato do edital com ao menos ${CERT_SIMULADO_PCT_RESPONDIDAS} % das questões respondidas.` + (enviados > provas ? ` Você já enviou ${enviados - provas} simulado(s) que não conta(m): fora do formato do edital ou com menos de ${CERT_SIMULADO_PCT_RESPONDIDAS} % respondido.` : '') };
 });
}
// O cartão da biblioteca: para curso com percurso publicado, "aulas estudadas / aulas do percurso" no lugar de
// "0 de 1 conteúdos" (a casca), e a última aula aberta para o botão Continuar. `null` = curso comum.
function progressoDoCurso(userId, productId) { return R.comCache(() => progressoDoCurso_(userId, productId)); }
function progressoDoCurso_(userId, productId) {
  const escopos = percursosDoCurso(productId);
  if (!escopos.length) return null;
  let total = 0, estudadas = 0, ultima = null;
  for (const e of escopos) {
    const regua = reguaDeEstudo(userId, e.id), uns = R.unidades(e.id, ['publicado']);
    total += uns.length; estudadas += uns.filter(u => aulaEstudada(u, regua)).length;
    const st = db.prepare("SELECT unidade, aberta_em FROM est_aula_estado WHERE user_id = ? AND escopo_id = ? AND aberta_em != '' ORDER BY aberta_em DESC").all(userId, e.id)
      .map(x => ({ ...x, u: uns.find(u => u.codigo === x.unidade) })).find(x => x.u); // aula despublicada não é para onde voltar
    if (st && (!ultima || st.aberta_em > ultima.aberta_em)) ultima = { slug: e.slug, unidade: st.unidade, titulo: st.u.titulo, aberta_em: st.aberta_em };
  }
  return { progresso: { total_aulas: total, concluidas: estudadas, pct: total ? Math.round(100 * estudadas / total) : 0, estude: true }, continuar: ultima, slug: escopos[0].slug };
}

module.exports = {
  guardarTentativa, anotarAula, caderno, quizDaAula, registrarVideo, registrarLeitura, conclusao, progressoDoCurso, aulaEstudada, reguaDeEstudo, MODOS_DE_AFERICAO,
  QUIZ_DA_AULA, VIDEO_ASSISTIDO_PCT, PROVA_TOLERANCIA_SEG, SIMULADO_PCT_RESERVADAS, SEPARADOR_DE_ABAS, questoesEmProvaAberta, CERT_PCT_AULAS_ESTUDADAS, CERT_PROVAS_ENVIADAS, CERT_MODOS_DE_PROVA, CERT_SIMULADO_PCT_RESPONDIDAS, CERT_SIMULADO_QUESTOES_MIN, MODOS_DE_ESTUDO,
  CARDS_NOVOS_DIA, ERROS_POR_PAGINA, simuladoQueConta, provaAberta, formatoDoPercurso, vereditoDe, vistasDe, corrigirTentativa,
  contexto, abrir, escopos, painel, unidade, animacoes, leitura, mapas, marcacoes, marcar, editarMarcacao, removerMarcacao, solucaoDoBloco, praticar, bancoDeQuestoes, pedirPista, responder, erros, anotar,
  cardsDoDia, todosOsCards, revelarCard, avaliarCard, iniciarTentativa, obterTentativa, salvarRespostas, enviarTentativa,
  definirPlano, obterPlano, estadosDoAluno, proximaTarefa, hojeBR,
  // para a jornada do Estude (jornada-estude.js): o diagnóstico é uma tentativa, e o nível, os selos e as medalhas saem das mesmas evidências
  evidencias, jaViu, errosPendentes, aulasPorDisciplina, abrirTentativa, tentativaDe, paraAlunoTentativa, consolidarSeExpirou, retaFinalDoEscopo,
};
