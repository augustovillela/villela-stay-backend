// =====================================================================
// Musique — administração pela aba 🎵 do Portal Staff
// (/staff/api/music/*). Padrão dos outros 14 módulos: requireAuth do
// staff + requireAdmin onde a ação muda estado.
//
// O painel existe na Fase 0 por um motivo prático: fila e IA precisam
// ser OBSERVÁVEIS desde o primeiro job. DLQ que ninguém vê é falha
// silenciosa com outro nome.
// =====================================================================
'use strict';
const repo = require('./repo');
const direitos = require('./direitos');
const fila = require('./fila');
const router = require('./ia/router');
const storage = require('./storage');
const { db } = require('./db');

function registrarRotasStaff(app, { requireAuth, requireAdmin }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));
  const ADM = [requireAuth, requireAdmin];

  // ---- painel ----
  app.get('/staff/api/music/painel', requireAuth, h(async (req, res) => {
    const conta = (t) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() || {}).n || 0;
    const porTitularidade = db.prepare('SELECT titularidade, COUNT(*) AS n FROM obras GROUP BY titularidade').all();
    res.json({
      produto: repo.Config.get('produto', {}),
      numeros: {
        usuarios: conta('usuarios_music'), obras: conta('obras'),
        arranjos: conta('arranjos'), partituras: conta('partituras'), midias: conta('midias'),
      },
      acervo_por_titularidade: porTitularidade,
      fila: fila.resumo(),
      ia: {
        capacidades_disponiveis: router.disponiveis(),
        capacidades_conhecidas: router.CAPABILITIES,
      },
      armazenamento: storage.ativo() ? { pronto: true } : { pronto: false, faltando: storage.faltando() },
    });
  }));

  // ---- fila: o que morreu, e por quê ----
  app.get('/staff/api/music/fila', requireAuth, h(async (req, res) => {
    res.json({ resumo: fila.resumo(), dlq: fila.dlq(Number(req.query.n) || 50), handlers: fila.tiposRegistrados() });
  }));

  app.post('/staff/api/music/fila/destravar', ...ADM, h(async (req, res) => {
    res.json({ ok: true, destravados: fila.destravar(Number((req.body || {}).minutos) || 15) });
  }));

  // ---- registry de IA: trocar fornecedor é UPDATE, não deploy ----
  app.get('/staff/api/music/ia', requireAuth, h(async (req, res) => {
    res.json({
      registry: router.registry(),
      disponiveis: router.disponiveis(),
      custo_por_usuario: router.custoPorUsuario((req.query.desde || '')),
    });
  }));

  app.post('/staff/api/music/ia', ...ADM, h(async (req, res) => {
    const d = req.body || {};
    const id = router.definirProvedor({
      capability: d.capability, provider: d.provider, model: d.model || '',
      prioridade: Number(d.prioridade) || 5, ativo: !!d.ativo,
      creditos: Number(d.creditos) || 1, custoEstimadoCentavos: Number(d.custo_estimado_centavos) || 0,
      promptVersao: d.prompt_versao || '', observacao: d.observacao || '',
    });
    direitos.registrar({ ator: req.user && req.user.email, acao: 'ia.provedor', alvo: id, detalhe: d });
    res.json({ ok: true, id });
  }));

  // ---- direitos: auditoria e proveniência ----
  app.get('/staff/api/music/auditoria', requireAuth, h(async (req, res) => {
    res.json({ eventos: direitos.auditoria(Number(req.query.n) || 100) });
  }));

  // ---- config ----
  app.get('/staff/api/music/config', requireAuth, h(async (req, res) => {
    res.json({ config: repo.Config.tudo() });
  }));

  app.put('/staff/api/music/config/:chave', ...ADM, h(async (req, res) => {
    const v = repo.Config.set(req.params.chave, (req.body || {}).valor);
    direitos.registrar({ ator: req.user && req.user.email, acao: 'config.alterada', alvo: req.params.chave });
    res.json({ ok: true, valor: v });
  }));
}

module.exports = { registrarRotasStaff };
