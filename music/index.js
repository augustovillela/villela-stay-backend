// =====================================================================
// Musique · por Villela Music (15º produto) — montagem no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./music').montar(app, { express, requireAuth, requireAdmin,
//     academia, enviarEmail, alertaAugusto, jwtSecret });
//
// FASE 0 — fundações. Escopo e decisões em docs/music/ (repo-pai).
//
// O que é diferente dos outros 14 módulos, e por quê:
//   • Conta PRÓPRIA desde a ADR-0011 (28/09/2026; a conta única da
//     ADR-0001 foi revogada pelo Augusto). Musique e Academia são
//     independentes; o que os liga são os CURSOS, por funções injetadas
//     em `academia` (vitrine, trilha → curso, produtor que dá aula) e a
//     conta do dono, semeada com a mesma senha. Sem `academia`, o módulo
//     sobe inteiro — só não mostra cursos nem aceita vínculo.
//   • Áudio vai para o R2 por upload direto (ADR-0003). Nada de arquivo
//     no disco do Render, que é de 1 GB para 15 produtos.
//   • Trabalho pesado NÃO roda aqui: vai para a fila e é consumido pelo
//     `music-worker`, serviço separado (worker.js).
//   • IA passa pelo AI Router (ADR-0004): provider é linha de banco.
// =====================================================================
'use strict';
const repo = require('./repo');
const direitos = require('./direitos');
const fila = require('./fila');
const storage = require('./storage');
const router = require('./ia/router');
const sessao = require('./sessao');
const contas = require('./contas');
const { registrarRotasContas } = require('./rotas-contas');
const academia = require('./academia');
const { registrarRotasApp } = require('./rotas-app');
const { registrarRotasAcademia } = require('./rotas-academia');
const { registrarRotasBiblioteca } = require('./rotas-biblioteca');
const { registrarRotasOrganizacoes } = require('./rotas-organizacoes');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarPaginas } = require('./paginas');

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, jwtSecret, enviarEmail, mpFetch, alertaAugusto } = injected;
  const academiaVillela = injected.academia || {};
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('music.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }

  repo.semear();
  storage.configurar({ segredo: jwtSecret });
  semearRegistryIA();
  // Currículo em código, semeado por upsert: trilha é conteúdo
  // pedagógico, não configuração — muda por revisão e deploy, com
  // histórico no git.
  const trilhas = academia.Trilhas.semear();

  // Identidade: conta PRÓPRIA (ADR-0011). `criar` devolve a camada DESTA
  // montagem: sem estado de módulo, sem duas montagens se contaminando.
  const dono = contas.semearDono(academiaVillela.contaDoDono);
  const sessaoDoModulo = sessao.criar(contas.criarVerificador({ jwtSecret }));
  const buscarContaPorEmail = contas.Contas.buscarPorEmail;
  const buscarContaPorId = contas.Contas.buscarPorId;
  // Professor pelo caminho da Academia (ADR-0008) só para quem PROVOU a
  // conta de produtor de lá (vínculo em "Minha conta"). O papel continua
  // sendo lido na Academia a cada pedido: produtor suspenso lá deixa de
  // dar aula aqui sem ninguém precisar lembrar.
  const ehProfessor = typeof academiaVillela.ehProdutor === 'function' ? (u) => {
    const c = u && contas.Contas.porId(u.id);
    try { return !!(c && c.academia_vinculo && academiaVillela.ehProdutor(c.academia_vinculo)); } catch (_) { return false; }
  } : null;

  // Hardening do módulo, no padrão do academy/index.js.
  app.use('/music', (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
  if (process.env.NODE_ENV !== 'development') {
    const janelas = new Map();
    app.use('/music/api', (req, res, next) => {
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
      const chave = ip + ':' + Math.floor(Date.now() / 60000);
      const n = (janelas.get(chave) || 0) + 1;
      janelas.set(chave, n);
      if (janelas.size > 10000) janelas.clear();
      if (n > 600) return res.status(429).json({ erro: 'Muitas requisições — aguarde um minuto.' });
      next();
    });
  }

  registrarRotasStaff(app, { requireAuth, requireAdmin });
  const { cursoDaTrilha } = registrarRotasContas(app, { jwtSecret, enviarEmail, academia: academiaVillela,
    requireUsuario: sessaoDoModulo.requireUsuario, requireAuth, requireAdmin });
  registrarRotasApp(app, { requireUsuario: sessaoDoModulo.requireUsuario });
  const { ehDocente } = registrarRotasAcademia(app, { requireUsuario: sessaoDoModulo.requireUsuario, ehProfessor, buscarContaPorEmail, cursoDaTrilha });
  registrarRotasBiblioteca(app, { requireUsuario: sessaoDoModulo.requireUsuario, buscarContaPorEmail });
  registrarRotasOrganizacoes(app, { requireUsuario: sessaoDoModulo.requireUsuario, buscarContaPorEmail, buscarContaPorId });
  // CIFRAS (28/09/2026): acervo, editor, versões, arranjos de banda,
  // setlists de palco, Modo Maestro, importação e comunidade.
  // ADR-0009 (revisão da Q2) e ADR-0010 em docs/music/DECISIONS.
  require('./cifras').montar(app, { requireUsuario: sessaoDoModulo.requireUsuario, requireAuth, requireAdmin,
    buscarContaPorEmail, buscarContaPorId });
  // ASSINATURA (28/09/2026): R$ 250,00/mês no Mercado Pago; dá cortesia dos
  // cursos de música da Academia pelo mesmo e-mail enquanto estiver ativa.
  const assinatura = require('./assinatura');
  const cobranca = assinatura.configurar({ mpFetch, cortesia: academiaVillela.cortesia, avisar: alertaAugusto,
    baseApi: process.env.MUSIC_BASE_API, baseSite: process.env.MUSIC_BASE_SITE });
  assinatura.garantirDono();
  require('./rotas-assinatura').registrarRotasAssinatura(app, { requireUsuario: sessaoDoModulo.requireUsuario, requireAuth, requireAdmin });
  // LABORATÓRIO MUSICAL (ADR-0013): teoria visual, prática, jogos, criação
  // e professor, sobre um núcleo único com grafia. Registrado ANTES das
  // páginas gerais para que as rotas dele não sejam engolidas.
  require('./laboratorio').montar(app, { requireUsuario: sessaoDoModulo.requireUsuario, opcional: sessaoDoModulo.opcional,
    ehDocente, buscarContaPorEmail, buscarContaPorId });
  registrarPaginas(app);
  // Rotina da assinatura: tolerância vencida tira o acesso; curso novo
  // publicado chega a quem assina. De hora em hora, e 1 min após subir.
  if (process.env.MUSIC_ASSINATURA_CICLO_OFF !== '1') {
    const rodar = () => assinatura.ciclo().catch((e) => console.error('[music/assinatura] ciclo:', e.message));
    const t1 = setTimeout(rodar, 60000); if (t1.unref) t1.unref();
    const t2 = setInterval(rodar, 3600000); if (t2.unref) t2.unref();
  }

  // Consumo da fila (ADR-0006). Roda AQUI, no web, e só a fila `rapida`.
  // Não é preguiça: no Render o disco de um serviço não é acessível por
  // outro, e o banco é SQLite no disco — worker separado não enxergaria
  // a tabela `jobs`. Em Fase 0 os jobs rápidos são um HEAD no bucket e
  // uma remoção de arquivo; nada disso pressiona os 2 GB do web.
  // A fila `cara` está travada em `fila.enfileirar` até haver worker.
  // MUSIC_FILA_OFF=1 desliga (usado pelo selftest, que processa à mão).
  if (process.env.MUSIC_FILA_OFF !== '1') {
    require('./worker').registrarHandlers();
    const t = setInterval(() => {
      fila.destravar(15);
      fila.processarLote(3, 'rapida').catch((e) => console.error('[music/fila]', e.message));
    }, Number(process.env.MUSIC_FILA_MS) || 5000);
    if (t.unref) t.unref();
  }

  console.log('[music] Musique montada. Landing: /music · app: /music/app · staff: /staff/api/music'
    + ` · conta: própria (ADR-0011), dono ${dono.ok ? (dono.criada ? 'semeado agora' : 'ok') : 'NÃO semeado — ' + dono.motivo}`
    + ` · cursos da Academia: ${typeof academiaVillela.cursosDeMusica === 'function' ? 'sim' : 'não'}`
    + ` · assinatura: cobrança ${cobranca.cobranca ? 'LIGADA' : 'desligada (sem MP)'}, cortesia na Academia ${cobranca.cortesia ? 'sim' : 'não'}`
    + ` · armazenamento: ${storage.ativo() ? 'R2' : 'desligado (faltam ' + storage.faltando().join(', ') + ')'}`
    + ` · IA disponível: ${router.disponiveis().length}/${router.CAPABILITIES.length} capabilities`
    + ` · trilhas: ${trilhas.total}`
    + ` · formatos: chordpro, musicxml, midi (+ pdf como anexo)`
    + ` · professor: ${typeof ehProfessor === 'function' ? 'produtor da Academia' : 'só por escola'}`
    + ` ou professor de escola`
    + ` · nomes na chamada/boletim: ${typeof buscarContaPorId === 'function' ? 'sim' : 'NÃO (a tela mostraria id de usuário)'}`);

  return { repo, direitos, fila, storage, router, academia, sessao: sessaoDoModulo, contas, dono };
}

/**
 * Semeia o registry de IA. TODAS as linhas nascem DESLIGADAS: ligar é
 * decisão comercial (custo por uso) e passa pelo painel do staff.
 *
 * `musica.gerar` entra de propósito, e de propósito fica sem provedor:
 * o Suno não tem API pública, e a decisão Q6 do Augusto foi não anunciar
 * geração de música. Como capability sem provedor ativo não aparece na
 * tela, a trava é mecânica — ninguém precisa lembrar da política.
 */
function semearRegistryIA() {
  if (router.registry().length) return false;
  const linhas = [
    { capability: 'letra.metrificar', provider: 'anthropic', model: 'claude-sonnet-5', creditos: 1, custoEstimadoCentavos: 2, promptVersao: 'v1' },
    { capability: 'letra.sugerir', provider: 'anthropic', model: 'claude-sonnet-5', creditos: 1, custoEstimadoCentavos: 2, promptVersao: 'v1' },
    { capability: 'estrutura.propor', provider: 'anthropic', model: 'claude-sonnet-5', creditos: 1, custoEstimadoCentavos: 2, promptVersao: 'v1' },
    { capability: 'harmonia.sugerir', provider: 'anthropic', model: 'claude-sonnet-5', creditos: 1, custoEstimadoCentavos: 2, promptVersao: 'v1' },
    { capability: 'tutor.explicar', provider: 'anthropic', model: 'claude-haiku-4-5', creditos: 1, custoEstimadoCentavos: 1, promptVersao: 'v1' },
    { capability: 'exercicio.gerar', provider: 'anthropic', model: 'claude-sonnet-5', creditos: 1, custoEstimadoCentavos: 2, promptVersao: 'v1' },
  ];
  for (const l of linhas) router.definirProvedor({ ...l, ativo: 0, prioridade: 5, observacao: 'semeado na Fase 0; ligar é decisão comercial' });
  router.definirProvedor({
    capability: 'musica.gerar', provider: 'nenhum', model: '', ativo: 0, prioridade: 9,
    observacao: 'SEM fornecedor com API pública (Suno só tem programa de parceiros, 07/2026). '
      + 'Decisão Q6: não anunciar geração de música. Linha existe para deixar o vazio visível.',
  });
  return true;
}

module.exports = { montar, repo, direitos, fila, storage, router, academia };
