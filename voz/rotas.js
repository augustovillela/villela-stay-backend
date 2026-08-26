// =====================================================================
// Voz — rotas. Plano §6.
//
// ⚠️ A DISTINÇÃO MAIS IMPORTANTE DESTE ARQUIVO:
//
//   /staff/api/voz/*      → `requirePublishOrAdmin` (chave OU sessão).
//                           É por onde o agente de voz fala. Ele PEDE.
//
//   /staff/voz/aprovar/*  → `requireAuth` + `requireAdmin`, SEMPRE.
//                           Nunca a chave. É por onde uma PESSOA decide.
//
// Se a chave pudesse aprovar, o próprio agente de voz — que carrega a
// chave — autorizaria os próprios pedidos de nível 3 e 4, e a aprovação
// inteira viraria enfeite. Toda a Fase 0 depende desta linha.
// =====================================================================
'use strict';
const servico = require('./servico');
const entrada = require('./entrada');
const audio = require('./audio');
const transcricao = require('./transcricao');
const repo = require('./repo');
const acoes = require('./acoes');
const fila = require('./fila');
const cerebro = require('./cerebro');
const aprovacoes = require('./aprovacoes');
const notificar = require('./notificar');
const paginas = require('./paginas');
const realtime = require('./realtime');
const paginaVoz = require('./pagina-voz');

const B = '/staff/api/voz';

function responderErro(res, e) {
  const status = e && e.status ? e.status : 500;
  if (status >= 500) console.error('[voz]', e && e.message ? e.message : e);
  return res.status(status).json({ erro: (e && e.message) ? e.message : 'Falha inesperada.' });
}

function registrarRotas(app, { requirePublishOrAdmin, requireAuth, requireAdmin }) {
  if (!requirePublishOrAdmin || !requireAuth || !requireAdmin) {
    throw new Error('voz/rotas: faltam deps (requirePublishOrAdmin, requireAuth, requireAdmin).');
  }

  const ator = (req) => (req.viaChave ? 'chave' : ((req.user && (req.user.email || req.user.nome)) || 'staff'));

  // ---- as DUAS funções do contrato ----

  app.post(`${B}/consultar`, requirePublishOrAdmin, async (req, res) => {
    try {
      const texto = String((req.body && (req.body.pergunta || req.body.texto)) || '').trim();
      if (!texto) return res.status(400).json({ erro: 'Faltou a pergunta.' });
      const r = await servico.consultar({ texto, canal: req.body.canal || 'voz', ator: ator(req) });
      return res.json(r);
    } catch (e) { return responderErro(res, e); }
  });

  app.post(`${B}/executar`, requirePublishOrAdmin, async (req, res) => {
    try {
      const texto = String((req.body && (req.body.pedido || req.body.texto)) || '').trim();
      if (!texto) return res.status(400).json({ erro: 'Faltou o pedido.' });
      const r = await servico.executar({ texto, canal: req.body.canal || 'voz', ator: ator(req) });
      return res.json(r);
    } catch (e) { return responderErro(res, e); }
  });

  // ---- entrada do WhatsApp (cenário 5666811 do Make) ----
  //
  // ⚠️ Responde 200 mesmo quando IGNORA a mensagem. Devolver erro ao Make
  // conta para o `maxErrors=3` e derruba o cenário — foi assim que o canal
  // caiu em 08 e 11/08/2026. Mensagem não autorizada não é erro do canal.
  app.post(`${B}/whatsapp`, requirePublishOrAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      // Aceita o áudio aninhado (`audio: {...}`, corpo JSON) OU em campos
      // PLANOS (`audio_base64`, ...). O plano existe porque montar JSON
      // aninhado à mão no Make é onde se erra — e um campo a menos para
      // errar num canal que já caiu duas vezes vale as três linhas.
      const audioPlano = (b.audio_base64 || b.audio_url || b.audio_id)
        ? { base64: b.audio_base64 || '', url: b.audio_url || '', mime: b.audio_mime || '', id: b.audio_id || '' }
        : null;
      const r = await entrada.receber({
        de: b.de || b.from || b.telefone || '',
        texto: b.texto || b.text || b.body || '',
        audio: b.audio || audioPlano || b.audioUrl || b.media || null,
        modo: b.modo || null,
      });
      return res.json({ ok: true, ...r });
    } catch (e) {
      console.error('[voz/whatsapp]', e && e.message ? e.message : e);
      return res.json({ ok: false, aceito: false, motivo: 'erro_interno' });
    }
  });

  // ---- áudio direto (sem Make, sem token da Meta) ----
  //
  // É por aqui que o app da Fase 1 vai mandar a gravação: o celular
  // grava, manda os bytes, e o backend transcreve e despacha. Não
  // depende do cenário do Make nem da Graph API — o que importa,
  // porque o token da Graph não existe (bloqueio de 15/08/2026).
  //
  // Exige chave OU sessão admin: quem chega aqui já está autenticado, e
  // por isso NÃO passa pela lista de telefones (que é a trava do canal
  // aberto do WhatsApp, não desta porta).
  app.post(`${B}/audio`, requirePublishOrAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.base64 && !b.url && !b.audio) return res.status(400).json({ erro: 'Faltou o áudio (base64 ou url).' });
      const bytes = await audio.obter(b.audio || { base64: b.base64, url: b.url, mime: b.mime, id: b.id });
      const t = await transcricao.transcrever(bytes);

      const modo = b.modo === 'consultar' ? 'consultar' : 'executar';
      const r = await servico[modo]({
        texto: t.texto, canal: b.canal || 'voz', ator: ator(req), transcrito: true,
      });
      return res.json({ ...r, transcricao: { texto: t.texto, doCache: t.doCache, ms: t.ms, modelo: t.modelo } });
    } catch (e) { return responderErro(res, e); }
  });

  // ---- painel ----

  app.get(`${B}/pedidos`, requirePublishOrAdmin, (req, res) => {
    try {
      aprovacoes.expirarVencidas();
      return res.json({
        pedidos: repo.listar({ limite: Number(req.query.limite) || 50, status: req.query.status || null }),
        resumo: repo.resumo(),
      });
    } catch (e) { return responderErro(res, e); }
  });

  app.get(`${B}/pedidos/:id`, requirePublishOrAdmin, (req, res) => {
    try {
      const pedido = repo.porId(req.params.id);
      if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
      return res.json({ pedido, trilha: repo.auditoriaDo(pedido.id) });
    } catch (e) { return responderErro(res, e); }
  });

  /** Diagnóstico honesto: o que está de pé e o que falta. */
  app.get(`${B}/saude`, requirePublishOrAdmin, (req, res) => {
    try {
      return res.json({
        cerebro: { llm: cerebro.disponivel(), modelo: cerebro.MODELO },
        transcricao: { pronta: entrada.temTranscricao(), ...transcricao.resumo(), audioMaxKB: Math.round(audio.MAX_BYTES / 1024) },
        whatsapp: notificar.configurado(),
        tempoReal: { pronto: realtime.disponivel(), modelo: realtime.MODELO(), voz: realtime.VOZ_TIMBRE() },
        // So os APELIDOS: endereco de terceiro nao sai por API.
        destinatarios: require('./destinatarios').apelidos(
          require('./destinatarios').parse(process.env.VOZ_EMAILS || '')),
        executar: String(process.env.VOZ_EXECUTAR || 'on').toLowerCase() !== 'off',
        filaCodigo: fila.codigoLiberado(),
        acoes: { catalogo: acoes.chaves().length, implementadas: require('./executor').implementadas() },
        fila: fila.resumo(),
        pedidos: repo.resumo(),
      });
    } catch (e) { return responderErro(res, e); }
  });

  // ---- FASE 1: a voz em tempo real ----
  //
  // ⚠️ A cunhagem exige SESSAO DE ADMIN, nao a chave. A chave e do
  // agente, e agente nao abre microfone: quem abre sessao de voz e uma
  // pessoa logada. E cada sessao custa por minuto, entao ela tambem e
  // limitada por taxa e auditada.
  app.post(`${B}/sessao`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const ator = (req.user && (req.user.email || req.user.nome)) || 'staff';
      const s = await realtime.criarSessao({ ator });
      repo.auditar('voz.sessao_aberta', {
        atorTipo: 'usuario', ator,
        detalhe: { modelo: s.modelo, voz: s.voz, expiraEm: s.expiraEm },
      });
      // Devolve SO o segredo efemero. A chave permanente nunca sai daqui.
      return res.json({ segredo: s.valor, expiraEm: s.expiraEm, modelo: s.modelo, voz: s.voz });
    } catch (e) { return responderErro(res, e); }
  });

  app.get('/staff/voz', paginas.paginaAutenticada(requireAuth, (req, res) => {
    const pronto = realtime.disponivel();
    res.type('html').send(paginaVoz.pagina({
      disponivel: pronto,
      motivo: pronto ? '' : (process.env.OPENAI_API_KEY
        ? 'A voz em tempo real esta desligada (VOZ_REALTIME=off).'
        : 'Falta a OPENAI_API_KEY no servidor.'),
    }));
  }));

  // ---- páginas: SESSÃO, nunca chave ----

  app.get('/staff/voz/aprovar/:token', paginas.paginaAutenticada(requireAuth, (req, res) => {
    res.type('html').send(paginas.paginaAprovacao(req.params.token));
  }));

  app.post('/staff/voz/aprovar/:token', requireAuth, requireAdmin, async (req, res) => {
    try {
      const decisao = (req.body && req.body.decisao) === 'aprovar' ? 'aprovar' : 'recusar';
      const r = aprovacoes.decidir(req.params.token, {
        decisao, por: (req.user && (req.user.email || req.user.nome)) || 'staff',
      });
      if (!r.ok) {
        const msg = { inexistente: 'Link inválido.', usado: 'Este pedido já foi decidido.', expirado: 'Este link venceu.' };
        return res.status(409).json({ erro: msg[r.motivo] || 'Não foi possível decidir.' });
      }
      if (decisao === 'aprovar') servico.aposAprovacao(r.pedido.id);
      return res.json({ ok: true, decisao, pedidoId: r.pedido.id, status: r.pedido.status });
    } catch (e) { return responderErro(res, e); }
  });

  app.get('/staff/voz/pedido/:id', paginas.paginaAutenticada(requireAuth, (req, res) => {
    res.type('html').send(paginas.paginaPedido(req.params.id));
  }));

  return B;
}

module.exports = { registrarRotas, B };
