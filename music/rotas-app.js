// =====================================================================
// Musique — API do usuário (/music/api/*). Fase 0: identidade, acervo,
// direitos, upload direto ao R2 e estado da IA.
//
// Duas disciplinas que valem para toda rota daqui:
//   • bloqueio de direitos responde 403 com o MOTIVO e o que fazer —
//     recusa sem explicação faz o usuário achar que o produto quebrou;
//   • nenhuma rota faz UPDATE de visibilidade ou decide acesso na mão:
//     isso é `direitos.js`, e só ele.
// =====================================================================
'use strict';
const repo = require('./repo');
const direitos = require('./direitos');
const storage = require('./storage');
const fila = require('./fila');
const router = require('./ia/router');

const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function registrarRotasApp(app, { requireUsuario }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    if (e && e.bloqueioDeDireitos) return res.status(403).json({ erro: e.message });
    res.status(400).json({ erro: e.message });
  });

  app.use('/music/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---- quem sou eu aqui ----
  app.get('/music/api/me', requireUsuario, h(async (req, res) => {
    res.json({
      conta: { id: req.usuario.id, nome: req.usuario.nome, email: req.usuario.email },
      perfil: repo.Usuarios.publico(req.perfil),
      capacidades_ia: router.disponiveis(),   // capability sem provedor NÃO aparece
      upload: storage.ativo() ? { pronto: true } : { pronto: false, faltando: storage.faltando() },
    });
  }));

  app.patch('/music/api/me', requireUsuario, h(async (req, res) => {
    const p = repo.Usuarios.editar(req.usuario.id, req.body || {});
    res.json({ ok: true, perfil: repo.Usuarios.publico(p) });
  }));

  // ---- acervo ----
  app.get('/music/api/obras', requireUsuario, h(async (req, res) => {
    res.json({ obras: repo.Obras.doUsuario(req.usuario.id) });
  }));

  app.post('/music/api/obras', requireUsuario, h(async (req, res) => {
    const o = repo.Obras.criar({ ...(req.body || {}), dono: req.usuario.id });
    res.json({ ok: true, obra: o, aviso: direitos.ehDeTerceiro(o)
      ? 'Registrada como obra de terceiro em acervo pessoal: fica só para você. Declare a titularidade se a obra é sua ou está em domínio público.'
      : '' });
  }));

  // A visão detalhada da obra mora em `rotas-biblioteca.js` (Fase 2):
  // ela precisa de arranjos, partituras, anotações e capacidades por
  // formato. Uma rota tem um dono só.

  app.delete('/music/api/obras/:id', requireUsuario, h(async (req, res) => {
    repo.Obras.excluir(req.params.id, req.usuario.id);
    res.json({ ok: true });
  }));

  // ---- direitos ----
  app.post('/music/api/obras/:id/titularidade', requireUsuario, h(async (req, res) => {
    const o = direitos.declararTitularidade({
      obraId: req.params.id, usuario: req.usuario.id,
      tipo: (req.body || {}).tipo, evidencia: (req.body || {}).evidencia, ip: ipDe(req),
    });
    res.json({ ok: true, obra: o });
  }));

  app.post('/music/api/obras/:id/visibilidade', requireUsuario, h(async (req, res) => {
    const o = direitos.definirVisibilidade({
      obraId: req.params.id, usuario: req.usuario.id, visibilidade: (req.body || {}).visibilidade,
    });
    res.json({ ok: true, obra: o });
  }));

  // Descoberta: só alcança o que se pode alcançar. O filtro é do
  // repositório/direitos, não desta rota.
  app.get('/music/api/descobrir', requireUsuario, h(async (req, res) => {
    res.json({ obras: repo.Obras.descobrir(req.usuario.id, { termo: req.query.q || '' }) });
  }));

  // ---- arranjos e partituras ----
  app.post('/music/api/obras/:id/arranjos', requireUsuario, h(async (req, res) => {
    const o = repo.Obras.porId(req.params.id);
    if (!o || o.dono !== req.usuario.id) return res.status(403).json({ erro: 'Esta obra não é sua.' });
    res.json({ ok: true, arranjo: repo.Arranjos.criar({ obraId: o.id, ...(req.body || {}) }) });
  }));

  // Criar partitura também é da biblioteca: lá o conteúdo é VALIDADO
  // por formato antes de gravar.

  // ---- mídia: upload DIRETO ao bucket (o byte não passa por aqui) ----
  app.post('/music/api/midias/upload', requireUsuario, h(async (req, res) => {
    if (!storage.ativo()) {
      return res.status(503).json({ erro: 'Envio de arquivo indisponível: falta configurar o armazenamento.',
        faltando: storage.faltando() });
    }
    const d = req.body || {};
    const limites = repo.Config.get('limites', {}) || {};
    const tetoBytes = (Number(limites.upload_mb) || 200) * 1024 * 1024;
    if (Number(d.bytes) > tetoBytes) {
      return res.status(413).json({ erro: `Arquivo acima do limite de ${limites.upload_mb} MB.` });
    }
    const id = require('./db').novoId();
    const chave = storage.chaveDe({ dono: req.usuario.id, tipo: d.tipo || 'originais', id, ext: d.ext || 'bin' });
    const m = repo.Midias.criar({ dono: req.usuario.id, chave, mime: d.mime });
    res.json({ ok: true, midia_id: m.id, chave, url: storage.urlDeUpload(chave), expira_em_s: 900 });
  }));

  /** Confirmação. Não acredita no cliente: confere no bucket que o
   *  objeto existe e que o tamanho bate. Confirmação que acredita no
   *  cliente não é confirmação. */
  app.post('/music/api/midias/:id/confirmar', requireUsuario, h(async (req, res) => {
    const m = repo.Midias.porId(req.params.id);
    if (!m || m.dono !== req.usuario.id) return res.status(404).json({ erro: 'Mídia não encontrada.' });
    const obj = await storage.existe(m.chave);
    if (!obj) {
      repo.Midias.estado(m.id, 'falhou', { erro: 'O arquivo não chegou ao armazenamento.' });
      return res.status(409).json({ erro: 'O arquivo não chegou ao armazenamento. Tente enviar de novo.' });
    }
    // Teto conferido contra o tamanho REAL do objeto: a URL presignada de PUT
    // nao impoe limite, e o `bytes` que o cliente declarou no pedido nao vale
    // como prova. Excedeu, o objeto sai do bucket — senao o teto seria so um
    // aviso e o custo ficaria de pe.
    const limitesConf = repo.Config.get('limites', {}) || {};
    const tetoConf = (Number(limitesConf.upload_mb) || 200) * 1024 * 1024;
    if (Number(obj.bytes) > tetoConf) {
      await storage.remover(m.chave).catch(() => {});
      repo.Midias.estado(m.id, 'falhou', { erro: 'Arquivo acima do limite.' });
      return res.status(413).json({ erro: `Arquivo acima do limite de ${limitesConf.upload_mb || 200} MB.` });
    }
    const sha = (req.body || {}).sha256 || '';
    repo.Midias.estado(m.id, 'processando', { bytes: obj.bytes, sha256: sha });
    fila.enfileirar({ tipo: 'midia.ingerir', fila: 'rapida', dono: req.usuario.id,
      payload: { midiaId: m.id, sha256: sha }, chaveIdem: 'ingerir:' + m.id });
    res.json({ ok: true, midia: repo.Midias.porId(m.id) });
  }));

  app.get('/music/api/midias/:id', requireUsuario, h(async (req, res) => {
    const m = repo.Midias.porId(req.params.id);
    if (!m || m.dono !== req.usuario.id) return res.status(404).json({ erro: 'Mídia não encontrada.' });
    // Estado é informação de produto: 'falhou' vem com o motivo, para
    // que o arquivo nunca simplesmente "suma".
    const corpo = { midia: m };
    if (m.estado === 'pronta' && storage.ativo()) corpo.url = storage.urlDeLeitura(m.chave, 600);
    res.json(corpo);
  }));

  // ---- consentimento de voz ----
  app.post('/music/api/consentimentos', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    const c = direitos.concederConsentimento({
      usuario: req.usuario.id, escopo: d.escopo, textoVersao: d.texto_versao || 'v1',
      responsavel: d.responsavel || '', menor: !!d.menor, expiraEm: d.expira_em || '', ip: ipDe(req),
    });
    res.json({ ok: true, consentimento: { id: c.id, escopo: c.escopo, concedido_em: c.concedido_em } });
  }));

  app.delete('/music/api/consentimentos/:escopo', requireUsuario, h(async (req, res) => {
    const n = direitos.revogarConsentimento({ usuario: req.usuario.id, escopo: req.params.escopo, por: req.usuario.id });
    // Revogar não é só apagar a permissão: o que foi derivado da voz
    // precisa sair junto. O job existe para que isso não dependa de
    // alguém lembrar.
    if (n) fila.enfileirar({ tipo: 'voz.purgar_derivados', fila: 'rapida', dono: req.usuario.id,
      payload: { usuario: req.usuario.id, escopo: req.params.escopo } });
    res.json({ ok: true, revogados: n });
  }));

  // ---- IA: o que existe, e quanto custa ANTES de rodar ----
  app.get('/music/api/ia/capacidades', requireUsuario, h(async (req, res) => {
    res.json({ disponiveis: router.disponiveis(), todas: router.CAPABILITIES });
  }));

  app.post('/music/api/ia/cotar', requireUsuario, h(async (req, res) => {
    const c = router.cotar((req.body || {}).capability);
    if (!c) return res.status(503).json({ erro: 'Este recurso ainda não está disponível.' });
    res.json({ cotacao: c });
  }));

  return { requireUsuario };
}

module.exports = { registrarRotasApp };
