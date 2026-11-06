// =====================================================================
// Villela CRM — rotas de "Aumentar meus leads" (painel do assinante, /crm/api/app/captura*,
// /crm/api/app/carteira*) e da administração (/staff/api/vcrm/carteira*, captura*).
// Gate: módulo `importacao` (o da busca ativa). Cofre e recarga exigem `gerir_conta`.
// Os erros devolvem o status certo (402 saldo, 409 pedir aceite do valor) e os campos que a tela usa.
// =====================================================================
'use strict';
const Captura = require('./captura');
const Cofre = require('./cofre');
const Carteira = require('./carteira');
const IA = require('./ia-provedor');
const buscas = require('./buscas');

// resposta de erro com o status e os campos úteis (nunca o texto cru de provedor: já vem limpo de quem lançou)
function responderErro(res, e) {
  const corpo = { erro: Cofre.limpar(e.message) };
  for (const k of ['orcamento_milesimos', 'orcamento', 'falta_milesimos', 'teto_milesimos', 'saldo_milesimos', 'configuracao']) if (e[k] != null) corpo[k] = e[k];
  res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 400).json(corpo);
}
const hs = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { responderErro(res, e); } };
const publico = (o) => { const { _m, _def, ...resto } = o; return resto; };

function registrarRotasCaptura(server, { G, GE, B, tid, quem }) {
  const base = (req) => `${req.headers['x-forwarded-proto'] || req.protocol || 'https'}://${req.get('host')}`;

  server.get('/crm/api/app/captura', ...G('importacao'), hs((req, res) => res.json(Captura.visao(tid(req)))));

  // ---- FORA: planeja uma busca para uma área e mostra o que seria cobrado ----
  server.post('/crm/api/app/captura/externa/planejar', ...GE('importacao', 'editar'), hs((req, res) => {
    const b = req.body || {};
    if (!Captura.AREAS.includes(b.area)) throw new Error('Escolha a área (WhatsApp, e-mail, Instagram, Facebook, TikTok ou LinkedIn).');
    const busca = buscas.criar(tid(req), { ...b, canal_alvo: b.area, frequencia_dias: 30 });
    res.json({ ok: true, busca, orcamento: Captura.orcamentoExterno(tid(req), busca.custo), situacao: Captura.situacaoExterna(tid(req)) });
  }));
  server.get('/crm/api/app/captura/externa/:id/orcamento', ...G('importacao'), hs((req, res) => {
    const busca = buscas.obter(tid(req), req.params.id);
    if (!busca) return res.status(404).json({ erro: 'Busca não encontrada.' });
    res.json({ orcamento: Captura.orcamentoExterno(tid(req), busca.custo), situacao: Captura.situacaoExterna(tid(req)) });
  }));

  // ---- DENTRO: upload do export ----
  server.post('/crm/api/app/captura/interna/importar', ...GE('importacao', 'editar'), hs((req, res) => res.json(Captura.importarExport(tid(req), req.body || {}, 'upload'))));
  server.get('/crm/api/app/captura/assuntos', ...G('importacao'), hs((req, res) => res.json({ assuntos: Captura.assuntosDoTenant(tid(req)) })));
  server.put('/crm/api/app/captura/assuntos', ...GE('importacao', 'editar'), hs((req, res) => res.json({ ok: true, assuntos: Captura.salvarAssuntos(tid(req), (req.body || {}).assuntos) })));

  // ---- COFRE ----
  server.put('/crm/api/app/captura/chaves/:nome', ...GE('importacao', 'gerir_conta'), hs((req, res) => {
    const meta = Cofre.guardar(tid(req), req.params.nome, (req.body || {}).valor, quem(req));
    require('./repo').Auditoria.registrar({ quem: quem(req), acao: 'cofre.guardar', entidade: 'crm_segredos', entidade_id: req.params.nome, detalhe: req.assinante.tenant_id });
    res.json({ ok: true, chave: meta }); // nunca o valor
  }));
  server.delete('/crm/api/app/captura/chaves/:nome', ...GE('importacao', 'gerir_conta'), hs((req, res) => {
    if (!Cofre.NOMES[req.params.nome]) throw new Error('Tipo de chave desconhecido.');
    require('./repo').Auditoria.registrar({ quem: quem(req), acao: 'cofre.remover', entidade: 'crm_segredos', entidade_id: req.params.nome, detalhe: req.assinante.tenant_id });
    res.json({ ok: true, ...Cofre.remover(tid(req), req.params.nome) });
  }));
  server.post('/crm/api/app/captura/chaves/:nome/testar', ...GE('importacao', 'gerir_conta'), hs(async (req, res) => res.json(await IA.testarChave(tid(req), req.params.nome))));

  // ---- IA ----
  server.post('/crm/api/app/captura/ia/orcar', ...GE('importacao', 'editar'), hs((req, res) => {
    const b = req.body || {};
    const o = IA.orcar(b.tarefa, b.entrada, { provedor: b.provedor === 'openai' ? 'openai' : 'anthropic' });
    const interno = Carteira.interno(tid(req));
    res.json({ orcamento: { ...publico(o), teto_usd: undefined, texto: interno ? 'conta interna (sem cobrança)' : Carteira.brl(o.teto_milesimos) } });
  }));
  server.post('/crm/api/app/captura/ia/executar', ...GE('importacao', 'editar'), hs(async (req, res) => res.json({ ok: true, ...(await IA.executar(tid(req), { ...(req.body || {}), quem: quem(req) })) })));

  // ---- CARTEIRA ----
  server.get('/crm/api/app/carteira', ...B, hs((req, res) => res.json(Carteira.estado(tid(req)))));
  server.post('/crm/api/app/carteira/recarga', ...GE('importacao', 'gerir_conta'), hs(async (req, res) => {
    const r = await Carteira.criarRecarga(tid(req), (req.body || {}).valor_centavos, base(req), { email: req.assinante.email, quem: quem(req) });
    res.json({ ok: true, ...r });
  }));
  server.post('/crm/api/app/carteira/recarga/:id/conferir', ...GE('importacao', 'gerir_conta'), hs(async (req, res) => res.json(await Carteira.conferirRecarga(tid(req), req.params.id))));
}

/** Administração da plataforma (Portal Staff). `A` = [requireAuth, requireAdmin]; `aud` registra auditoria. */
function registrarRotasCapturaStaff(app, { A, h, aud, quem }) {
  app.get('/staff/api/vcrm/carteira', ...A, h((req, res) => res.json({ ...Carteira.painelStaff(), captura: { externa_ativa: Captura.ligadoExterna(), apify_token_servidor: !!process.env.APIFY_TOKEN }, cofre_configurado: Cofre.configurado() })));
  app.post('/staff/api/vcrm/carteira/config', ...A, h((req, res) => {
    const c = Carteira.salvarConfig(req.body || {});
    aud(req, 'carteira.config', 'crm_plataforma', 'carteira', JSON.stringify({ ativa: c.ligada, margem: c.margem_pct, folga: c.cambio_folga_pct }));
    res.json({ ok: true, config: c });
  }));
  app.post('/staff/api/vcrm/carteira/ptax', ...A, h(async (req, res) => res.json(await Carteira.atualizarPTAX())));
  app.post('/staff/api/vcrm/carteira/cortesia', ...A, h((req, res) => {
    const b = req.body || {};
    const r = Carteira.creditar(String(b.tenant_id || ''), { valor_centavos: b.valor_centavos, tipo: b.tipo === 'ajuste' ? 'ajuste' : 'cortesia', motivo: b.motivo, quem: quem(req) });
    aud(req, 'carteira.' + (b.tipo === 'ajuste' ? 'ajuste' : 'cortesia'), 'crm_carteira_mov', String(b.tenant_id || ''), `${b.valor_centavos} centavos — ${String(b.motivo || '').slice(0, 80)}`);
    res.json({ ok: true, ...r });
  }));
  app.post('/staff/api/vcrm/captura/config', ...A, h((req, res) => {
    const c = Captura.configurarPlataforma(req.body || {});
    aud(req, 'captura.config', 'crm_plataforma', 'captura', JSON.stringify(c));
    res.json({ ok: true, config: c });
  }));
}

module.exports = { registrarRotasCaptura, registrarRotasCapturaStaff };
