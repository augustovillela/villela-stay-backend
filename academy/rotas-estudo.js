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
const ped = require('./estudo/pedidos');
const jr = require('./estudo/jornada-estude');
const lj = require('./estudo/lei-juris');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
// `extra` leva o que a tela precisa para oferecer saída (ex.: quantas questões há de fato)
// Cada rota roda dentro da MEMÓRIA DA REQUISIÇÃO (estudo/repo.js › comCache): a mesma leitura do conteúdo é feita
// uma vez por chamada. Em rota assíncrona ela vale até o primeiro `await` — depois disso as leituras voltam ao banco.
const h = (fn) => (req, res) => {
  const falha = (e) => res.status(e.status || 400).json({ erro: e.message, ...(e.extra || {}) });
  try { Promise.resolve(est.comCache(() => fn(req, res))).catch(falha); } catch (e) { falha(e); }
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
  // `?resumo=1`: o painel sem a parte fixa das listas grandes — a tela junta ao que já tem (estudo/aluno.js › painel)
  app.get(`${base}/painel`, ...AL, h((req, res) => { semCache(res); res.json(al.painel(...a(req), { resumo: req.query.resumo === '1' })); }));

  // ---- aula ativa ----
  app.get(`${base}/leitura`, ...AL, h((req, res) => { semCache(res); res.json(al.leitura(...a(req), String(req.query.disciplina || ''))); }));
  app.get(`${base}/mapas`, ...AL, h((req, res) => { semCache(res); res.json(al.mapas(...a(req), String(req.query.disciplina || ''))); }));
  app.get(`${base}/marcacoes`, ...AL, h((req, res) => { semCache(res); res.json(al.marcacoes(...a(req))); }));
  app.post(`${base}/marcacoes`, ...AL, h((req, res) => { res.json(al.marcar(...a(req), b(req))); }));
  app.put(`${base}/marcacoes/:id`, ...AL, h((req, res) => { res.json(al.editarMarcacao(...a(req), req.params.id, b(req))); }));
  app.delete(`${base}/marcacoes/:id`, ...AL, h((req, res) => { res.json(al.removerMarcacao(...a(req), req.params.id)); }));
  app.get(`${base}/unidades/:unidade`, ...AL, h((req, res) => { semCache(res); res.json(al.unidade(...a(req), req.params.unidade, { nivel: String(req.query.nivel || '100'), aberta: req.query.aberta === '1' })); }));
  // ---- paridade com os outros cursos: quiz dentro da aula, caderno (tentativa e nota), vídeo que lembra onde parou ----
  // o quiz só ESCOLHE as questões da aula; responder e pedir pista são as rotas de /questoes, mais abaixo
  app.get(`${base}/unidades/:unidade/quiz`, ...AL, h((req, res) => { semCache(res); res.json(al.quizDaAula(...a(req), req.params.unidade)); }));
  // `lido_em` (o `atualizado_em` que a tela leu) e `ao_sair` (envio de última hora): duas abas não se sobrescrevem — 409 com o texto atual
  const lido = (req) => ({ lido_em: b(req).lido_em, ao_sair: b(req).ao_sair });
  app.put(`${base}/unidades/:unidade/blocos/:n/tentativa`, ...AL, h((req, res) => { res.json(al.guardarTentativa(...a(req), req.params.unidade, req.params.n, b(req).texto, lido(req))); }));
  app.put(`${base}/unidades/:unidade/nota`, ...AL, h((req, res) => { res.json(al.anotarAula(...a(req), req.params.unidade, b(req).texto, lido(req))); }));
  app.put(`${base}/unidades/:unidade/video`, ...AL, h((req, res) => { res.json(al.registrarVideo(...a(req), req.params.unidade, b(req))); }));
  // chegou ao fim do texto da aula (abrir + ler até o fim é uma das formas de estudar a aula — a régua é `aulaEstudada`)
  app.put(`${base}/unidades/:unidade/lida`, ...AL, h((req, res) => { res.json(al.registrarLeitura(...a(req), req.params.unidade)); }));
  // "Meu caderno": tentativas, notas de aula, marcações com nota e anotações do caderno de erros — só as de quem pede
  app.get(`${base}/caderno`, ...AL, h((req, res) => { semCache(res); res.json(al.caderno(...a(req))); }));
  app.get(`${base}/unidades/:unidade/animacoes`, ...AL, h((req, res) => { semCache(res); res.json(al.animacoes(...a(req), req.params.unidade)); }));
  app.post(`${base}/unidades/:unidade/blocos/:n/solucao`, ...AL, h((req, res) => { res.json(al.solucaoDoBloco(...a(req), req.params.unidade, req.params.n, b(req).tentativa)); }));

  // ---- prática ----
  app.get(`${base}/praticar`, ...AL, h((req, res) => { semCache(res); res.json(al.praticar(...a(req), { competencia: req.query.competencia, n: req.query.n, erradas: req.query.erradas === '1', origem: s(req.query.origem, 20),
    banca: req.query.banca, orgao: req.query.orgao, cargo: req.query.cargo, ano_de: req.query.ano_de, ano_ate: req.query.ano_ate })); }));
  app.get(`${base}/banco`, ...AL, h((req, res) => { semCache(res); res.json(al.bancoDeQuestoes(...a(req))); }));
  // caderno de erros: a última resposta foi erro; a anotação é do próprio aluno
  app.get(`${base}/erros`, ...AL, h((req, res) => { semCache(res); res.json(al.erros(...a(req), { pagina: req.query.pagina })); }));
  app.put(`${base}/questoes/:questao/anotacao`, ...AL, h((req, res) => { res.json(al.anotar(...a(req), req.params.questao, b(req).texto, lido(req))); }));
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
  app.put(`${base}/tentativas/:tentativa/respostas`, ...AL, h((req, res) => { res.json(al.salvarRespostas(...a(req), req.params.tentativa, b(req).respostas, b(req).posicao)); }));
  app.post(`${base}/tentativas/:tentativa/enviar`, ...AL, h((req, res) => { res.json(al.enviarTentativa(...a(req), req.params.tentativa)); }));

  // ---- jornada do Estude (etapa 2): nível pelo domínio, selos, medalhas, diagnóstico de entrada e teste final ----
  // o diagnóstico e o teste final são tentativas: começam aqui e seguem pelas rotas de /tentativas (salvar, abrir, enviar)
  app.get(`${base}/jornada`, ...AL, h((req, res) => { semCache(res); res.json(jr.jornada(...a(req))); }));
  app.post(`${base}/diagnostico`, ...AL, h((req, res) => { res.json(jr.iniciar(...a(req), { tipo: s(b(req).tipo, 20) || 'diagnostico', recomecar: b(req).recomecar === true })); }));
  // ---- ferramentas do concurseiro: só os DADOS (regra com fonte, data da prova, aulas que faltam); a conta roda no navegador ----
  app.get(`${base}/ferramentas`, ...AL, h((req, res) => { semCache(res); res.json(jr.ferramentas(...a(req))); }));

  // ---- plano ----
  app.get(`${base}/plano`, ...AL, h((req, res) => { semCache(res); res.json(al.obterPlano(...a(req))); }));
  app.put(`${base}/plano`, ...AL, h((req, res) => { res.json(al.definirPlano(...a(req), b(req), s(b(req).motivo, 200) || undefined)); }));

  // ---- escrita e oral: questões abertas e PEDIDOS PAGOS de correção (ADR-0010) ----
  // criar → orçamento (nada cobrado) → confirmar (402 com o valor, pelo `h`; a tela pede o aceite e refaz) →
  // roda em segundo plano → a tela consulta o estado. O pedido é de quem pediu: outro usuário recebe 404.
  const baseUrl = (req) => `${req.headers['x-forwarded-proto'] || req.protocol || 'https'}://${req.get('host')}`;
  // CHAVE GERAL (estudo_pedidos, em estudo/pedidos.js): desligada, tudo o que mora em /pedidos e /abertas responde
  // 404 a quem não está liberado — como rota que não existe. É um `use` no prefixo, e não uma guarda rota a rota,
  // para a rota de pedido que nascer depois já nascer atrás da porta.
  app.use([`${base}/pedidos`, `${base}/abertas`], ...AL, (req, res, next) => (ped.liberadoPara(req.usuario) ? next() : res.status(404).json({ erro: ped.AINDA_NAO })));
  app.get(`${base}/abertas`, ...AL, h((req, res) => { semCache(res); res.json(ped.abertas(...a(req))); }));
  app.get(`${base}/pedidos`, ...AL, h((req, res) => { semCache(res); res.json(ped.listar(...a(req), { questao: req.query.questao })); }));
  app.post(`${base}/pedidos`, ...AL, h(async (req, res) => { res.json(await ped.criar(...a(req), b(req))); }));
  // envio de arquivo do aluno, só para pedido: pequeno em base64; grande direto ao storage (URL assinada)
  app.post(`${base}/pedidos/arquivo`, ...AL, h(async (req, res) => { res.json({ ok: true, ...(await ped.enviarArquivo(...a(req), b(req))) }); }));
  app.post(`${base}/pedidos/arquivo-grande`, ...AL, h((req, res) => { res.json({ ok: true, ...ped.iniciarArquivoGrande(...a(req), b(req)) }); }));
  app.post(`${base}/pedidos/arquivo-grande/:media/confirmar`, ...AL, h(async (req, res) => { res.json({ ok: true, ...(await ped.confirmarArquivoGrande(...a(req), req.params.media)) }); }));
  app.get(`${base}/pedidos/:pedido`, ...AL, h((req, res) => { semCache(res); res.json(ped.obter(...a(req), req.params.pedido)); }));
  app.post(`${base}/pedidos/:pedido/confirmar`, ...AL, h((req, res) => { res.json(ped.confirmar(...a(req), req.params.pedido)); }));
  app.post(`${base}/pedidos/:pedido/cancelar`, ...AL, h((req, res) => { res.json(ped.cancelar(...a(req), req.params.pedido)); }));
  // o áudio da resposta oral: só o dono do pedido, por URL temporária (guardado por 6 meses; depois, 404)
  app.get(`${base}/pedidos/:pedido/audio`, ...AL, h((req, res) => { semCache(res); res.json({ ok: true, ...ped.linkDoAudio(...a(req), req.params.pedido) }); }));
  app.post(`${base}/pedidos/:pedido/contestar`, ...AL, h((req, res) => { res.json(ped.contestar(...a(req), req.params.pedido, b(req).motivo)); }));
  // importar prova em PDF: o que a tela precisa antes de pedir; outra faixa de páginas (reorça); e APLICAR
  // ao percurso as questões escolhidas — passo próprio, sem custo
  app.get(`${base}/pedidos/prova/opcoes`, ...AL, h((req, res) => { semCache(res); res.json(ped.opcoesDeProva(...a(req))); }));
  app.post(`${base}/pedidos/:pedido/paginas`, ...AL, h(async (req, res) => { res.json(await ped.reorcar(...a(req), req.params.pedido, b(req))); }));
  app.post(`${base}/pedidos/:pedido/aplicar`, ...AL, h((req, res) => { res.json({ ok: true, ...ped.aplicar(...a(req), req.params.pedido, b(req)) }); }));
  // ler edital em PDF (fase 4): o que a tela precisa antes de pedir; e a PRÉVIA do aplicar — o que entra no programa
  // e, em percurso que já tem programa, o diff da retificação. Reorçar (/paginas) e aplicar são as rotas da prova.
  app.get(`${base}/pedidos/edital/opcoes`, ...AL, h((req, res) => { semCache(res); res.json(ped.opcoesDeEdital(...a(req))); }));
  app.post(`${base}/pedidos/:pedido/previa`, ...AL, h((req, res) => { semCache(res); res.json({ ok: true, ...ped.previaDoEdital(...a(req), req.params.pedido, b(req)) }); }));
  // falta saldo: recarga do valor que falta, ligada ao pedido — creditou, o pedido começa sozinho
  app.post(`${base}/pedidos/:pedido/recarga`, ...AL, h(async (req, res) => { res.json({ ok: true, ...(await ped.recarga(...a(req), req.params.pedido, b(req), baseUrl(req))) }); }));
  // ---- LEGISLAÇÃO E JURISPRUDÊNCIA POR ITEM DO EDITAL (ADR-0014; estudo/lei-juris.js) — nada aqui é cobrado ----
  // a lei seca e os verbetes que a AULA (`?unidade=`) ou o ITEM do programa (`?item=`) cobram
  app.get(`${base}/legislacao/vinculada`, ...AL, h((req, res) => { semCache(res); res.json(lj.legislacaoVinculada(...a(req), { unidade: s(req.query.unidade, 80), item: s(req.query.item, 40) })); }));
  app.get(`${base}/jurisprudencia/vinculada`, ...AL, h((req, res) => { semCache(res); res.json(lj.jurisprudenciaVinculada(...a(req), { unidade: s(req.query.unidade, 80), item: s(req.query.item, 40) })); }));
  // os acervos: a lista dos diplomas (`?q=` filtra pelo nome) e o diploma INTEIRO por demanda; a jurisprudência com filtros e páginas
  app.get(`${base}/legislacao`, ...AL, h((req, res) => { semCache(res); res.json(lj.acervoLegislacao(...a(req), { q: req.query.q })); }));
  app.get(`${base}/legislacao/:diploma`, ...AL, h((req, res) => { semCache(res); res.json(lj.diplomaInteiro(...a(req), req.params.diploma)); }));
  app.get(`${base}/jurisprudencia`, ...AL, h((req, res) => { semCache(res); const q = req.query; res.json(lj.acervoJurisprudencia(...a(req), { tribunal: q.tribunal, colecao: q.colecao, tipo: q.tipo, situacao: q.situacao, disciplina: q.disciplina, q: q.q, pagina: q.pagina })); }));
  app.get(`${base}/jurisprudencia/verbete/:id`, ...AL, h((req, res) => { semCache(res); res.json(lj.verbete(...a(req), req.params.id)); }));
  // a busca única nos dois acervos (`?onde=lei|juris|todos`)
  app.get(`${base}/lei-juris/busca`, ...AL, h((req, res) => { semCache(res); res.json(lj.busca(...a(req), { q: req.query.q, onde: s(req.query.onde, 10) || 'todos', pagina: req.query.pagina })); }));
  // a marcação de leitura do aluno: { tipo: dispositivo|verbete, ref, lido?, cor? } — só dele
  app.get(`${base}/lei-juris/marcas`, ...AL, h((req, res) => { semCache(res); res.json(lj.marcas(...a(req), { tipo: req.query.tipo })); }));
  app.put(`${base}/lei-juris/marcas`, ...AL, h((req, res) => { res.json(lj.marcar(...a(req), b(req))); }));
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
  // vídeo da aula: o arquivo vai do PC direto ao bucket; o servidor só recebe o id
  app.post('/staff/api/academy/estudo/video', ...PA, h((req, res) => {
    const r = imp.iniciarVideoEstudo(req.body || {});
    aud(req, 'estudo.video.iniciar', r.media_id, r.unidade.codigo);
    res.json({ ok: true, ...r });
  }));
  app.post('/staff/api/academy/estudo/video/:mediaId/confirmar', ...PA, h(async (req, res) => {
    const r = await imp.confirmarVideoEstudo(req.params.mediaId, req.body || {});
    aud(req, 'estudo.video.confirmar', r.media.id, `${r.unidade.codigo} (${r.media.tamanho}b)`);
    res.json({ ok: true, ...r });
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
    const escopo = est.Escopos.doCursoPorSlug(produto.id, est.slug(req.query.escopo));
    if (!escopo) return res.status(404).json({ erro: 'Escopo não encontrado.' });
    res.json({ questoes: est.questoesDoEscopo(escopo) });
  }));
  // PEDIDOS PAGOS (ADR-0010): volume por tipo e estado, total cobrado e as contestações abertas. A listagem
  // não leva o texto das respostas dos alunos; abrir um pedido (aí sim, com a resposta) e responder a uma
  // contestação exigem SESSÃO de admin — a chave de publicação conta, mas não lê o que o aluno escreveu.
  // Pela chave saem SÓ as contagens: o motivo da contestação (texto livre do aluno), o nome e o e-mail de
  // quem discordou só vão a quem entrou com sessão de admin.
  const ADM = [requireAuth, requireAdmin];
  const sessaoDeAdmin = (req) => !req.viaChave && !!req.user && req.user.papel === 'admin';
  app.get('/staff/api/academy/estudo/pedidos', ...PA, h((req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(ped.painelStaff({ admin: sessaoDeAdmin(req) })); }));
  // CHAVE GERAL dos pedidos pagos (estudo_pedidos). A chave de publicação LÊ e edita a lista de liberados
  // ({ liberar: "e-mail" }, { remover: "e-mail" } ou { liberados: [...] }); LIGAR para todos ({ ativos: true })
  // só com sessão de admin — quem pede não aprova (a recusa é de `prepararConfigPedidos`, 403).
  app.get('/staff/api/academy/estudo/pedidos-config', ...PA, h((req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ estudo_pedidos: ped.cfgPedidos(), pode_ligar: sessaoDeAdmin(req) }); }));
  app.post('/staff/api/academy/estudo/pedidos-config', ...PA, h((req, res) => {
    const r = ped.salvarConfigPedidos(req.body || {}, { admin: sessaoDeAdmin(req) });
    aud(req, 'estudo.pedidos.config', ped.CFG_PEDIDOS, `ativos ${r.antes.ativos} → ${r.estudo_pedidos.ativos}; liberados ${r.antes.liberados.length} → ${r.estudo_pedidos.liberados.length}`);
    res.json({ ok: true, estudo_pedidos: r.estudo_pedidos });
  }));
  app.get('/staff/api/academy/estudo/pedidos/:id', ...ADM, h((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const r = ped.abrirParaStaff(req.params.id);
    aud(req, 'estudo.pedido.abrir', r.pedido.id, r.pedido.tipo);
    res.json(r);
  }));
  app.post('/staff/api/academy/estudo/pedidos/:id/contestacao', ...ADM, h((req, res) => {
    const r = ped.resolverContestacao(req.params.id, { resposta: (req.body || {}).resposta, quem: quem(req) });
    aud(req, 'estudo.pedido.contestacao', r.pedido.id, '');
    res.json({ ok: true, ...r });
  }));
  // LEGISLAÇÃO E JURISPRUDÊNCIA (ADR-0014; contrato em dados\estude\concursos\…\lei-juris\BRIEF-pacote.md). Ordem de envio:
  // os diplomas (um por envio) → a jurisprudência (lotes de até 500) → os vínculos (por disciplina) → o status.
  // Tudo nasce em RASCUNHO (só dono e admin veem); abrir aos alunos é o `status` publicado, depois da auditoria.
  const ljRota = (caminho, acao, fn) => app.post('/staff/api/academy/estudo/lei-juris/' + caminho, ...PA, h((req, res) => {
    const b = req.body || {};
    const { produto } = imp.produtorDono(b);
    const r = fn(produto, b);
    aud(req, 'estudo.lei-juris.' + acao, produto.id, JSON.stringify({ ...r, avisos: undefined, faltantes: undefined, vinculos_orfaos_exemplos: undefined, itens_sem_vinculo: undefined }));
    res.json({ ok: true, ...r });
  }));
  ljRota('diploma', 'diploma', lj.importarDiploma);
  ljRota('jurisprudencia', 'jurisprudencia', lj.importarJurisprudencia);
  ljRota('vinculos', 'vinculos', lj.importarVinculos);
  ljRota('status', 'status', lj.definirEstado);
  ljRota('remover', 'remover', lj.remover);
  // ADR-0015: a situação e a redação "na data" PRÓPRIAS de um percurso com data de referência diferente da do acervo
  ljRota('textos-do-escopo', 'textos-do-escopo', lj.importarTextosDoEscopo);
  app.get('/staff/api/academy/estudo/lei-juris/resumo', ...PA, h((req, res) => {
    const { produto } = imp.produtorDono(req.query || {});
    res.setHeader('Cache-Control', 'no-store');
    res.json(lj.resumoStaff(produto, req.query.escopo));
  }));
  // o programa inteiro com o destino de cada item — é a auditoria do edital
  app.get('/staff/api/academy/estudo/cobertura', ...PA, h((req, res) => {
    const { produto } = imp.produtorDono(req.query || {});
    const escopo = est.Escopos.doCursoPorSlug(produto.id, est.slug(req.query.escopo));
    if (!escopo || !escopo.versao) return res.status(404).json({ erro: 'Escopo sem programa.' });
    res.json({ cobertura: est.cobertura(escopo, { vis: est.STATUS, situacoes: require('./estudo/banco').SITUACOES }) });
  }));
}

module.exports = { registrarRotasEstudo, registrarRotasEstudoStaff };
