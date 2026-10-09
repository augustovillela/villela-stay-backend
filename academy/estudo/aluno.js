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
const MODOS_TENTATIVA = ['treino', 'simulado'];
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
function abrir(usuario, produto, slugEscopo) {
  const c = contexto(usuario, produto);
  if (!c.acesso) throw erro('Esta área é para quem tem acesso ao curso.', 403);
  const escopo = R.Escopos.porSlug(produto.id, R.slug(slugEscopo));
  if (!escopo || !c.vis.includes(escopo.status)) throw erro('Percurso não encontrado.', 404);
  return { ...c, escopo };
}
function escopos(usuario, produto) {
  const c = contexto(usuario, produto);
  if (!c.acesso) return { acesso: false, escopos: [] };
  return { acesso: true, revisor: c.revisor, escopos: R.Escopos.doProduto(produto.id, c.vis)
    .map(e => ({ slug: e.slug, tipo: e.tipo, titulo: e.titulo, nivel: e.nivel, extensao: e.extensao, resumo: e.resumo, data_alvo: e.data_alvo, status: e.status })) };
}

// ---------------------------------------------------------------------
// EVIDÊNCIA e AGENDA
// ---------------------------------------------------------------------
const evidencias = (userId, escopoId) => db.prepare('SELECT * FROM est_evidencias WHERE user_id = ? AND escopo_id = ? ORDER BY criado_em').all(userId, escopoId)
  .map(e => ({ ...e, acerto: !!e.acerto, inedita: !!e.inedita, ajuda_humana: !!e.ajuda_humana }));
const jaViu = (userId, refId) => !!db.prepare('SELECT 1 FROM est_evidencias WHERE user_id = ? AND ref_id = ? LIMIT 1').get(userId, refId);

function reagendar(userId, escopo, alvo, alvoId, resultado) {
  const atual = db.prepare('SELECT passo FROM est_revisoes WHERE user_id = ? AND escopo_id = ? AND alvo = ? AND alvo_id = ?').get(userId, escopo.id, alvo, alvoId);
  const prox = agenda.proxima({ passo: atual ? atual.passo : -1, resultado, hoje: hojeBR(), prazo: escopo.data_alvo });
  db.prepare(`INSERT INTO est_revisoes (user_id, escopo_id, alvo, alvo_id, passo, vencimento, ultimo_resultado, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, escopo_id, alvo, alvo_id) DO UPDATE SET passo = excluded.passo, vencimento = excluded.vencimento, ultimo_resultado = excluded.ultimo_resultado, atualizado_em = excluded.atualizado_em`)
    .run(userId, escopo.id, alvo, alvoId, prox.passo, prox.vencimento, resultado, nowISO());
  return prox;
}

// Uma linha por competência avaliada. `inedita` é medida ANTES de gravar.
function registrar(usuario, escopo, { origem, refId, refVersao = 1, comps, modo, acerto, pistas = 0, tentativaId = '', tempo = 0, confianca = '' }) {
  const inedita = !jaViu(usuario.id, refId);
  const versoes = Object.fromEntries(R.competencias(escopo.id).map(c => [c.codigo, c.versao]));
  const ins = db.prepare(`INSERT INTO est_evidencias (id, user_id, escopo_id, competencia_codigo, competencia_versao, origem, ref_id, ref_versao, tentativa_id, modo, acerto, pistas, inedita, tempo_seg, confianca, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const agora = nowISO();
  const resultado = !acerto ? 'erro' : (pistas > 0 || modo === 'estudo') ? 'acerto_com_ajuda' : 'acerto';
  const proximas = {};
  for (const c of comps) {
    ins.run(novoId(), usuario.id, escopo.id, c, versoes[c] || 1, origem, refId, refVersao, tentativaId, modo, acerto ? 1 : 0, pistas, inedita ? 1 : 0,
      Math.max(0, Math.round(Number(tempo) || 0)), CONFIANCAS.includes(confianca) ? confianca : '', agora);
    if (origem === 'questao') proximas[c] = reagendar(usuario.id, escopo, 'competencia', c, resultado);
  }
  return { inedita, resultado, proximas };
}

// ---------------------------------------------------------------------
// PAINEL — o que foi demonstrado, o que falta avaliar e a próxima tarefa útil
// ---------------------------------------------------------------------
function estadosDoAluno(usuario, escopo) {
  const evs = evidencias(usuario.id, escopo.id);
  const est = ev.estados(evs);
  const comps = R.competencias(escopo.id);
  const falhasSeguidas = (codigo) => {
    let n = 0;
    for (const e of evs.filter(x => x.competencia_codigo === codigo).reverse()) {
      if (!e.acerto && ev.independente(e)) n++; else if (e.acerto) break;
    }
    return n;
  };
  return comps.map(c => ({
    codigo: c.codigo, resultado: c.resultado, essencial: c.essencial, depende_de: c.depende_de,
    ...(est[c.codigo] || ev.estadoDaCompetencia([])),
    estagnada: falhasSeguidas(c.codigo) >= FALHAS_PARA_ESTAGNACAO,
  }));
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

  const emPratica = est.find(e => e.estado === 'em_pratica');
  if (emPratica) {
    const falta = emPratica.depende_de.find(d => por[d] && !ev.demonstrada(por[d].estado));
    if (falta) return { tipo: 'pre_requisito', competencia: falta, unidade: unidadeDe(falta), motivo: `Você errou em "${emPratica.codigo}", que depende de "${falta}", ainda não demonstrada. Retome a base primeiro.` };
    if (emPratica.estagnada) return { tipo: 'mudar_estrategia', competencia: emPratica.codigo, unidade: unidadeDe(emPratica.codigo),
      motivo: `${FALHAS_PARA_ESTAGNACAO} tentativas sem apoio e sem acerto: repetir questão não está funcionando. Volte à explicação e ao exemplo resolvido — ou peça ajuda humana.` };
    return { tipo: 'intervencao', competencia: emPratica.codigo, unidade: unidadeDe(emPratica.codigo), motivo: 'Erro recente sem apoio: reveja o exemplo resolvido e tente uma questão diferente.' };
  }
  const comApoio = est.find(e => e.estado === 'demonstrada_com_apoio');
  if (comApoio) return { tipo: 'pratica_sem_apoio', competencia: comApoio.codigo, motivo: 'Você acertou com pista ou em questão já vista. Falta acertar uma questão nova, sem apoio.' };
  // só entra na fila quem o aluno consegue demonstrar hoje; competência sem questão praticável vai para o fim
  const praticavel = R.competenciasComPratica(escopo.id, c.situacoes);
  const novas = est.filter(e => e.estado === 'nao_avaliada' && praticavel.has(e.codigo));
  const nova = novas.find(e => e.depende_de.every(d => !por[d] || ev.demonstrada(por[d].estado))) || novas[0];
  if (nova) return { tipo: 'aprender', competencia: nova.codigo, unidade: unidadeDe(nova.codigo), motivo: nova.depende_de.length ? 'Próxima competência do percurso: os pré-requisitos dela você já demonstrou.' : 'Competência do percurso que você ainda não começou e que não depende de outra.' };
  const semRetencao = est.find(e => e.estado === 'demonstrada_sem_apoio');
  if (semRetencao) return { tipo: 'aguardar_retencao', competencia: semRetencao.codigo, motivo: `Demonstrada, mas a retenção só se confirma com nova questão inédita após ${ev.INTERVALO_RETENCAO_DIAS} dias.` };
  const soLeitura = est.find(e => e.estado === 'nao_avaliada' && unidadeDe(e.codigo));
  if (soLeitura) return { tipo: 'aprender', competencia: soLeitura.codigo, unidade: unidadeDe(soLeitura.codigo), motivo: 'Esta parte ainda não tem questões para você demonstrar: estude a aula; ela não conta como demonstrada até haver questão.' };
  return { tipo: est.length ? 'concluido' : 'sem_competencias', motivo: est.length ? 'Todas as competências foram demonstradas e retidas até aqui.' : 'Este percurso ainda não tem competências definidas.' };
}

function painel(usuario, produto, slugEscopo) {
  const c = abrir(usuario, produto, slugEscopo);
  const { escopo } = c;
  const est = estadosDoAluno(usuario, escopo);
  const por = Object.fromEntries(est.map(e => [e.codigo, e]));
  const cob = R.cobertura(escopo, c);
  const ordem = Object.fromEntries(ev.ESTADOS.map((e, i) => [e, i]));
  // o domínio de um item é o da competência MAIS FRACA que o cobre
  const itens = cob.por_item.map(i => {
    const estados = i.competencias.map(k => (por[k.codigo] || {}).estado || 'nao_avaliada');
    const dominio = estados.length ? estados.sort((a, b) => ordem[a] - ordem[b])[0] : 'sem_competencia';
    return { ...i, estudado: i.competencias.some(k => (por[k.codigo] || {}).tentativas > 0), dominio };
  });
  const folhas = itens.filter(i => i.folha);
  const conta = (f) => folhas.filter(f).length;
  const fila = filaDeRevisao(usuario, escopo);
  const evs = evidencias(usuario.id, escopo.id);
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
    erros_pendentes: errosPendentes(usuario.id, escopo.id).length,
    escopo: { slug: escopo.slug, tipo: escopo.tipo, titulo: escopo.titulo, nivel: escopo.nivel, extensao: escopo.extensao, data_alvo: escopo.data_alvo, versao: escopo.versao, status: escopo.status, perfil: escopo.perfil },
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
    unidades: R.unidades(escopo.id, c.vis).map(u => ({ codigo: u.codigo, titulo: u.titulo, tempo_min: u.tempo_min, competencias: u.competencias, status: u.status,
      mapa: !!(u.vespera && u.vespera.objetiva && u.vespera.objetiva.mapa) })),
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
function unidade(usuario, produto, slugEscopo, codigo, { nivel = '100' } = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const u = R.unidades(c.escopo.id, c.vis).find(x => x.codigo === R.slug(codigo));
  if (!u) throw erro('Unidade não encontrada.', 404);
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
function leitura(usuario, produto, slugEscopo, disciplina = '') {
  const c = abrir(usuario, produto, slugEscopo);
  const itens = new Map(R.cobertura(c.escopo, c).por_item.map(i => [i.codigo, i.texto]));
  const disc = (u) => { const it = (u.itens[0] || ''); const d = it.split('.').slice(0, 2).join('.'); return it && itens.has(d) && d !== it ? d : ''; };
  const grupos = [], por = {};
  for (const u of R.unidades(c.escopo.id, c.vis)) {
    const d = disc(u);
    if (!por[d]) grupos.push(por[d] = { codigo: d, nome: d ? itens.get(d) : 'Método de estudo', aulas: [] });
    const blocos = u.blocos.map((b, n) => ({ ...b, n })).filter(b => BLOCOS_DE_LEITURA.includes(b.tipo) && b.texto); // `n` é o endereço do bloco na aula: a marcação aponta para ele
    por[d].aulas.push({ u, blocos, caracteres: blocos.reduce((n, b) => n + b.texto.length, 0) });
  }
  if (!disciplina) {
    return { disciplinas: grupos.map(g => ({ codigo: g.codigo, nome: g.nome, aulas: g.aulas.length, caracteres: g.aulas.reduce((n, a) => n + a.caracteres, 0) })) };
  }
  const g = por[disciplina === '_metodo' ? '' : s(disciplina, 20)];
  if (!g) throw erro('Disciplina não encontrada neste percurso.', 404);
  return { codigo: g.codigo, nome: g.nome, escopo: c.escopo.titulo,
    aulas: g.aulas.map(({ u, blocos }) => ({ codigo: u.codigo, titulo: u.titulo, itens: u.itens.map(i => ({ codigo: i, texto: itens.get(i) || '' })), versao: u.versao, status: u.status,
      blocos: blocos.map(b => ({ n: b.n, tipo: b.tipo, titulo: b.titulo, texto: b.texto })), fontes: u.fontes })) };
}

// ---------------------------------------------------------------------
// MARCA-TEXTO — o que o aluno grifa na leitura, para rever depois. É dele:
// ninguém mais vê. A âncora é o texto cru do bloco (aula, bloco, início, fim)
// e o trecho vai guardado junto: se a aula for reescrita, a marcação é
// reencontrada pelo trecho; se o trecho sumiu, ela não é apagada — aparece na
// lista como "solta", com o texto que ele tinha marcado.
// ---------------------------------------------------------------------
const CORES_MARCA = ['amarelo', 'verde', 'azul', 'rosa'];
const MAX_MARCA = 3000, MAX_MARCAS_POR_ESCOPO = 5000;
const marcaPublica = (m, extra = {}) => ({ id: m.id, unidade: m.unidade, bloco: m.bloco, inicio: m.inicio, fim: m.fim, texto: m.texto, cor: m.cor, nota: m.nota || '', criado_em: m.criado_em, solta: false, ...extra });
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
  const u = R.unidades(c.escopo.id, c.vis).find(x => x.codigo === R.slug(d.unidade));
  if (!u) throw erro('Aula não encontrada.', 404);
  const n = Number(d.bloco), b = Number.isInteger(n) ? u.blocos[n] : null;
  if (!b || !BLOCOS_DE_LEITURA.includes(b.tipo)) throw erro('Trecho não encontrado nesta aula.', 404);
  const inicio = Number(d.inicio), fim = Number(d.fim);
  if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio < 0 || fim <= inicio || fim > b.texto.length) throw erro('A seleção não cabe neste trecho.');
  if (fim - inicio > MAX_MARCA) throw erro(`Marque até ${MAX_MARCA} caracteres por vez.`);
  if (!CORES_MARCA.includes(d.cor)) throw erro(`cor deve ser ${CORES_MARCA.join('|')}.`);
  if (db.prepare('SELECT COUNT(*) n FROM est_marcacoes WHERE user_id = ? AND escopo_id = ?').get(usuario.id, c.escopo.id).n >= MAX_MARCAS_POR_ESCOPO) throw erro('Você chegou ao limite de marcações deste percurso. Apague as que não usa mais.', 409);
  // o trecho é recortado AQUI, do texto do servidor: o cliente manda só as posições
  const m = { id: novoId(), unidade: u.codigo, bloco: n, inicio, fim, texto: b.texto.slice(inicio, fim), cor: d.cor, nota: s(d.nota, 500), criado_em: nowISO() };
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
  const cor = d.cor == null ? m.cor : d.cor;
  if (!CORES_MARCA.includes(cor)) throw erro(`cor deve ser ${CORES_MARCA.join('|')}.`);
  const nota = d.nota == null ? m.nota : s(d.nota, 500);
  db.prepare('UPDATE est_marcacoes SET cor = ?, nota = ? WHERE id = ?').run(cor, nota, m.id);
  return { ok: true, marcacao: marcaPublica({ ...m, cor, nota }) };
}
function removerMarcacao(usuario, produto, slugEscopo, id) {
  const c = abrir(usuario, produto, slugEscopo);
  db.prepare('DELETE FROM est_marcacoes WHERE id = ?').run(marcacaoDoAluno(usuario, c, id).id);
  return { ok: true };
}
function solucaoDoBloco(usuario, produto, slugEscopo, codigo, n, tentativa) {
  const c = abrir(usuario, produto, slugEscopo);
  const u = R.unidades(c.escopo.id, c.vis).find(x => x.codigo === R.slug(codigo));
  const b = u && u.blocos[Number(n)];
  if (!b || !b.solucao) throw erro('Bloco sem solução.', 404);
  // tentar antes de ver: a solução só sai contra uma tentativa escrita
  if (s(tentativa, 8000).length < 15) throw erro('Escreva a sua tentativa antes de ver a solução.');
  return { solucao: b.solucao, pistas: b.pistas };
}

// ---------------------------------------------------------------------
// PRÁTICA com questões do banco
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// CADERNO DE ERROS (ADR-0007) — "questão serve para achar lacuna". Pendente é a questão cuja
// ÚLTIMA resposta do aluno foi um erro; sai do caderno quando ele a acerta de novo. Refazer a
// questão não é demonstração (já foi vista): é prática — a evidência continua exigindo questão nova.
// ---------------------------------------------------------------------
function errosPendentes(userId, escopoId) {
  const por = new Map();
  for (const e of evidencias(userId, escopoId)) {
    if (e.origem !== 'questao') continue;
    const x = por.get(e.ref_id) || { id: e.ref_id, erros: new Set(), ultima: '', pendente: false };
    if (!e.acerto) x.erros.add(e.criado_em);
    x.pendente = !e.acerto; x.ultima = e.criado_em; // as evidências vêm em ordem: a última manda
    por.set(e.ref_id, x);
  }
  return [...por.values()].filter(x => x.pendente).map(x => ({ id: x.id, erros: x.erros.size, ultima: x.ultima })).sort((a, b) => b.ultima.localeCompare(a.ultima));
}
const anotacaoDe = (userId, questaoId) => (db.prepare('SELECT texto FROM est_anotacoes WHERE user_id = ? AND questao_id = ?').get(userId, questaoId) || {}).texto || '';
function erros(usuario, produto, slugEscopo) {
  const c = abrir(usuario, produto, slugEscopo);
  const lista = errosPendentes(usuario.id, c.escopo.id).map(x => {
    const q = R.Questoes.obter(x.id);
    if (!q || !c.situacoes.includes(q.situacao)) return null; // questão retirada do banco não fica cobrando o aluno
    return { id: q.id, erros: x.erros, ultima: x.ultima, enunciado: q.enunciado, competencias: R.competenciasDaQuestao(q.id, c.escopo.id),
      alternativas: q.alternativas.map(a => ({ id: a.id, texto: a.texto, correta: a.correta, explicacao: a.explicacao })),
      comentario: q.comentario, origem: q.origem, vigencia: q.vigencia, anotacao: anotacaoDe(usuario.id, q.id) };
  }).filter(Boolean);
  return { total: lista.length, questoes: lista.slice(0, 100) };
}
function anotar(usuario, produto, slugEscopo, questaoId, texto) {
  const c = abrir(usuario, produto, slugEscopo);
  const { q } = questaoDoEscopo(c, questaoId);
  if (!jaViu(usuario.id, q.id)) throw erro('Responda a questão antes de anotar: a anotação é sobre a sua resposta.', 409);
  const t = s(texto, 2000);
  if (!t) db.prepare('DELETE FROM est_anotacoes WHERE user_id = ? AND questao_id = ?').run(usuario.id, q.id);
  else db.prepare(`INSERT INTO est_anotacoes (user_id, questao_id, escopo_id, texto, atualizado_em) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, questao_id) DO UPDATE SET texto = excluded.texto, atualizado_em = excluded.atualizado_em`).run(usuario.id, q.id, c.escopo.id, t, nowISO());
  return { ok: true, anotacao: t };
}

function praticar(usuario, produto, slugEscopo, { competencia = '', n = 5, erradas = false } = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const pend = erradas ? new Set(errosPendentes(usuario.id, c.escopo.id).map(x => x.id)) : null;
  const elegiveis = R.Questoes.doEscopo(c.escopo.id, { situacoes: c.situacoes, competencia: R.slug(competencia) })
    .filter(q => q.corrigivel && q.uso !== 'reservada') // reservada fica para aferição: não se gasta no treino
    .filter(q => !pend || pend.has(q.id));
  const vistas = new Set(elegiveis.filter(q => jaViu(usuario.id, q.id)).map(q => q.id));
  const ordenadas = [...elegiveis.filter(q => !vistas.has(q.id)), ...elegiveis.filter(q => vistas.has(q.id))];
  const qtd = Math.min(20, Math.max(1, Math.round(Number(n) || 5)));
  return {
    elegiveis: elegiveis.length, ineditas: elegiveis.length - vistas.size,
    questoes: ordenadas.slice(0, qtd).map(q => ({ ...banco.paraAluno(q, usuario.id), ja_vista: vistas.has(q.id) })),
  };
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
function responder(usuario, produto, slugEscopo, questaoId, { resposta, confianca, tempo_seg, modo } = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  const { q, comps } = questaoDoEscopo(c, questaoId);
  if (!q.corrigivel) throw erro('Esta questão não tem correção automática (aberta, anulada ou sem gabarito confirmado).');
  if (q.uso === 'reservada') throw erro('Questão reservada para simulado.', 403);
  const sit = pontuacao.situacaoDoItem({ gabarito: banco.gabaritoDe(q) }, resposta);
  if (sit === 'em_branco') throw erro('Escolha uma alternativa.');
  const acerto = sit === 'certa';
  return transacao(() => {
    const pistas = (db.prepare('SELECT n FROM est_ajudas WHERE user_id = ? AND questao_id = ?').get(usuario.id, q.id) || {}).n || 0;
    db.prepare('DELETE FROM est_ajudas WHERE user_id = ? AND questao_id = ?').run(usuario.id, q.id);
    const r = registrar(usuario, c.escopo, { origem: 'questao', refId: q.id, refVersao: q.versao, comps,
      modo: modo === 'estudo' || pistas > 0 ? 'estudo' : 'pratica', acerto, pistas, tempo: tempo_seg, confianca });
    return {
      acerto, gabarito: banco.gabaritoDe(q), pistas_usadas: pistas, inedita: r.inedita,
      conta_como: r.resultado === 'acerto' ? (r.inedita ? 'demonstração sem apoio' : 'prática (questão já vista)') : r.resultado === 'acerto_com_ajuda' ? 'prática com apoio' : 'erro',
      alternativas: q.alternativas.map(a => ({ id: a.id, correta: a.correta, explicacao: a.explicacao })),
      comentario: q.comentario, procedencia: q.procedencia, vigencia: q.vigencia,
      competencias: comps, retomadas: r.proximas, anotacao: anotacaoDe(usuario.id, q.id),
    };
  });
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
  const novos = todos.filter(k => !agendados.has(k.id)).slice(0, CARDS_NOVOS_DIA);
  const frente = (k, novo) => ({ id: k.id, competencia: k.competencia_codigo, frente: k.frente, novo });
  // os limites vão junto para a tela explicar "Card 1 de 5" — sem isso o aluno
  // lê a sessão do dia como se fosse o acervo inteiro e conclui que falta conteúdo
  return { vencidos: todos.filter(k => vencidos.has(k.id)).map(k => frente(k, false)), novos: novos.map(k => frente(k, true)), adiados: fila.adiadas, total: todos.length,
    limites: { novos_dia: CARDS_NOVOS_DIA, revisoes_dia: LIMITE_REVISOES_DIA }, revisor: c.revisor };
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
const tentativaDe = (usuario, id) => abrirTentativa(db.prepare('SELECT * FROM est_tentativas WHERE id = ? AND user_id = ?').get(s(id, 40), usuario.id));

function iniciarTentativa(usuario, produto, slugEscopo, { modo = 'treino', competencias = [], n = 10, duracao_min = 0, aceitar_menos = false } = {}) {
  const c = abrir(usuario, produto, slugEscopo);
  if (!MODOS_TENTATIVA.includes(modo)) throw erro(`modo deve ser ${MODOS_TENTATIVA.join('|')}.`);
  const aberta = abrirTentativa(db.prepare("SELECT * FROM est_tentativas WHERE user_id = ? AND escopo_id = ? AND estado = 'em_andamento'").get(usuario.id, c.escopo.id));
  if (aberta) {
    const viva = consolidarSeExpirou(usuario, c.escopo, aberta);
    if (viva.estado === 'em_andamento') return { ...paraAlunoTentativa(viva), retomada: true };
  }
  const filtro = new Set((Array.isArray(competencias) ? competencias : []).map(R.slug).filter(Boolean));
  let elegiveis = R.Questoes.doEscopo(c.escopo.id, { situacoes: c.situacoes }).filter(q => q.corrigivel)
    .map(q => ({ q, comps: R.competenciasDaQuestao(q.id, c.escopo.id) }))
    .filter(x => !filtro.size || x.comps.some(k => filtro.has(k)));
  if (modo === 'treino') elegiveis = elegiveis.filter(x => x.q.uso !== 'reservada');
  // Prova simulada reproduz o edital: questão de competência TRANSVERSAL (método de estudo, técnica
  // de prova — competência que não cobre item do programa) não entra, a não ser que o aluno a peça.
  else if (!filtro.size) {
    const comItem = new Set(R.vinculos(c.escopo.id).map(v => v.competencia_codigo));
    elegiveis = elegiveis.filter(x => !x.comps.length || x.comps.some(k => comItem.has(k)));
  }
  const pedido = Math.min(200, Math.max(1, Math.round(Number(n) || 10)));
  // faltou questão: a lacuna é dita, nunca preenchida com repetição ou filtro afrouxado em silêncio
  if (elegiveis.length < pedido && !aceitar_menos) {
    const e = erro(`Há ${elegiveis.length} questão(ões) elegível(is) para ${pedido} pedida(s).`, 409);
    e.extra = { elegiveis: elegiveis.length, pedido, opcoes: ['reduzir a prova (aceitar_menos)', 'ampliar as competências'] };
    throw e;
  }
  if (!elegiveis.length) throw erro('Não há questões disponíveis para esta prova.', 409);
  const id = novoId();
  // inéditas (e, no simulado, reservadas) primeiro; o restante só completa
  const peso = (x) => (jaViu(usuario.id, x.q.id) ? 2 : 0) + (modo === 'simulado' && x.q.uso === 'reservada' ? -1 : 0);
  const escolhidas = banco.embaralhar(elegiveis, id).sort((a, b) => peso(a) - peso(b)).slice(0, pedido);
  // questões do mesmo texto-base ficam juntas
  const ordem = [...escolhidas].sort((a, b) => (a.q.grupo || '~').localeCompare(b.q.grupo || '~'));
  const duracao = Math.round(Number(duracao_min) || 0) || Math.max(5, Math.ceil(ordem.reduce((t, x) => t + (x.q.tempo_estimado_seg || 180), 0) / 60));
  const inicio = new Date();
  const congelado = {
    modo, duracao_min: duracao, regra: c.escopo.regra_pontuacao || {}, escopo_versao: c.escopo.versao,
    // o bloco da pontuação é o campo `bloco` da questão; sem ele, a disciplina serve de bloco
    itens: ordem.map(x => ({ id: x.q.id, versao: x.q.versao, gabarito: banco.gabaritoDe(x.q), bloco: x.q.bloco || x.q.disciplina || '', competencias: x.comps, publico: banco.paraAluno(x.q, id) })),
  };
  db.prepare(`INSERT INTO est_tentativas (id, user_id, escopo_id, modo, congelado, inicio_em, prazo_em) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, usuario.id, c.escopo.id, modo, j.str(congelado), inicio.toISOString(), new Date(inicio.getTime() + duracao * 60e3).toISOString());
  return { ...paraAlunoTentativa(tentativaDe(usuario, id)), faltaram: pedido - ordem.length };
}

function paraAlunoTentativa(t) {
  const base = { id: t.id, modo: t.modo, estado: t.estado, inicio_em: t.inicio_em, prazo_em: t.prazo_em, agora: nowISO(), salvo_em: t.salvo_em, duracao_min: t.congelado.duracao_min };
  if (t.estado !== 'em_andamento') return { ...base, enviado_em: t.enviado_em, resultado: t.resultado };
  return { ...base, questoes: t.congelado.itens.map(i => i.publico), respostas: t.respostas };
}

function corrigirTentativa(usuario, escopo, t, estado) {
  const res = pontuacao.corrigir(t.congelado.itens, t.respostas, t.congelado.regra);
  const porId = Object.fromEntries(res.por_item.map(i => [i.id, i]));
  const detalhe = t.congelado.itens.map(i => {
    const q = R.Questoes.obter(i.id);
    return { id: i.id, situacao: porId[i.id].situacao, resposta: t.respostas[i.id] == null ? null : t.respostas[i.id], gabarito: i.gabarito, competencias: i.competencias,
      alternativas: q ? q.alternativas.map(a => ({ id: a.id, correta: a.correta, explicacao: a.explicacao })) : [], comentario: q ? q.comentario : '' };
  });
  const { por_item, ...nota } = res;
  const resultado = { ...nota, itens: detalhe, expirada: estado === 'expirada' };
  transacao(() => {
    // só certa e errada viram evidência: abstenção é decisão de prova e branco
    // por falta de tempo não prova que o aluno não sabia
    for (const i of t.congelado.itens) {
      const sit = porId[i.id].situacao;
      if (sit === 'certa' || sit === 'errada') registrar(usuario, escopo, { origem: 'questao', refId: i.id, refVersao: i.versao, comps: i.competencias, modo: 'avaliacao', acerto: sit === 'certa', tentativaId: t.id });
    }
    db.prepare('UPDATE est_tentativas SET estado = ?, enviado_em = ?, resultado = ? WHERE id = ?').run(estado, nowISO(), j.str(resultado), t.id);
  });
  return tentativaDe(usuario, t.id);
}
function consolidarSeExpirou(usuario, escopo, t) {
  return t.estado === 'em_andamento' && nowISO() > t.prazo_em ? corrigirTentativa(usuario, escopo, t, 'expirada') : t;
}
function tentativaAberta(usuario, produto, slugEscopo, id) {
  const c = abrir(usuario, produto, slugEscopo);
  const t = tentativaDe(usuario, id);
  if (!t || t.escopo_id !== c.escopo.id) throw erro('Tentativa não encontrada.', 404);
  return { c, t: consolidarSeExpirou(usuario, c.escopo, t) };
}
const obterTentativa = (usuario, produto, slugEscopo, id) => paraAlunoTentativa(tentativaAberta(usuario, produto, slugEscopo, id).t);

function salvarRespostas(usuario, produto, slugEscopo, id, respostas) {
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
  db.prepare('UPDATE est_tentativas SET respostas = ?, salvo_em = ? WHERE id = ?').run(j.str(novas), agora, t.id);
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
function definirPlano(usuario, produto, slugEscopo, entrada = {}, motivo = 'definido pelo aluno') {
  const c = abrir(usuario, produto, slugEscopo);
  const e = {
    disponibilidade: plano.minutosPorDia(entrada.disponibilidade),
    indisponiveis: (Array.isArray(entrada.indisponiveis) ? entrada.indisponiveis : []).map(d => s(d, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 400),
    // a data da prova é do edital; o aluno só informa a dele quando o escopo não tem
    data_alvo: c.escopo.data_alvo || (/^\d{4}-\d{2}-\d{2}$/.test(entrada.data_alvo || '') ? entrada.data_alvo : ''),
    margem_pct: Math.min(50, Math.max(0, Number.isFinite(Number(entrada.margem_pct)) ? Number(entrada.margem_pct) : plano.MARGEM_PADRAO_PCT)),
  };
  // ADR-0005: a véspera segue a 1ª etapa do concurso (perfil.etapas, ordem do edital); sem perfil, objetiva
  const perfil = (c.escopo.perfil && typeof c.escopo.perfil === 'object') ? c.escopo.perfil : {};
  const etapa1 = Array.isArray(perfil.etapas) && perfil.etapas[0] ? String(perfil.etapas[0].foco || perfil.etapas[0].tipo || perfil.etapas[0].nome || perfil.etapas[0]) : '';
  const foco = /oral/i.test(etapa1) ? 'oral' : /discurs|escrit|senten|peça|peca/i.test(etapa1) ? 'escrita' : 'objetiva';
  // véspera só no escopo de edital (padrão 7 dias; o perfil pode mudar); assunto avulso não tem prova marcada
  const vesperaDias = perfil.vespera_dias != null && Number.isFinite(Number(perfil.vespera_dias)) ? Number(perfil.vespera_dias) : (c.escopo.tipo === 'edital' ? plano.VESPERA_PADRAO_DIAS : 0);
  const itensP = itensDoPlano(c.escopo, c);
  const rgDias = perfil.revisao_geral_dias != null && Number.isFinite(Number(perfil.revisao_geral_dias)) ? Number(perfil.revisao_geral_dias) : (c.escopo.tipo === 'edital' ? plano.REVISAO_GERAL_PADRAO_DIAS : 0);
  const base = { hoje: hojeBR(), ...e, foco, vespera_dias: vesperaDias, revisao_geral_dias: rgDias };
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

module.exports = {
  contexto, escopos, painel, unidade, leitura, marcacoes, marcar, editarMarcacao, removerMarcacao, solucaoDoBloco, praticar, pedirPista, responder, erros, anotar,
  cardsDoDia, todosOsCards, revelarCard, avaliarCard, iniciarTentativa, obterTentativa, salvarRespostas, enviarTentativa,
  definirPlano, obterPlano, estadosDoAluno, proximaTarefa, hojeBR,
};
