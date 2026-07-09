// =====================================================================
// Villela Academy — rotas de CONTEÚDO (FASE 2).
// Produtor: CRUD de produtos, builder (módulos/aulas/materiais), upload,
// fluxo editorial, alunos/matrícula cortesia. Aluno: biblioteca, curso,
// progresso. Admin: moderação. Mídia: entrega privada com checagem de
// acesso + log. Usa requireUsuario/requirePapel de rotas-cliente.
// =====================================================================
'use strict';
const repo = require('./repo');
const ct = require('./repo-conteudo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

function registrarRotasConteudo(app, { requireUsuario, requirePapel }) {
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const h = (fn) => (req, res) => { // captura erro síncrono E assíncrono → 400
    try { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); }
    catch (e) { res.status(400).json({ erro: e.message }); }
  };
  const aud = (req, acao, ent, id, det) => repo.Auditoria.registrar({
    quem: req.usuario.id, papel: req.papelAtivo || '', acao, entidade: ent, entidade_id: id, detalhe: det, ip: ipDe(req),
  });
  const P = [requireUsuario, requirePapel('produtor')];
  const ADM = [requireUsuario, requirePapel('admin')];

  // ============================ PRODUTOR ============================
  app.get('/academy/api/produtor/produtos', ...P, h((req, res) => {
    res.json({ produtos: ct.Produtos.doProdutor(req.usuario.id), categorias: ct.CATEGORIAS, tipos: ct.TIPOS_PRODUTO });
  }));
  app.post('/academy/api/produtor/produtos', ...P, h((req, res) => {
    const p = ct.Produtos.criar(req.usuario.id, req.body || {});
    aud(req, 'produto.criar', 'products', p.id, p.titulo);
    res.json({ ok: true, produto: p });
  }));
  app.get('/academy/api/produtor/produtos/:id', ...P, h((req, res) => {
    const p = ct.Produtos.obterDoDono(req.params.id, req.usuario.id);
    res.json({ produto: p, estrutura: ct.Produtos.estrutura(p.id), tipos_aula: ct.TIPOS_AULA });
  }));
  app.patch('/academy/api/produtor/produtos/:id', ...P, h((req, res) => {
    const p = ct.Produtos.editar(req.params.id, req.usuario.id, req.body || {});
    aud(req, 'produto.editar', 'products', p.id, '');
    res.json({ ok: true, produto: p });
  }));
  // fluxo editorial do produtor: enviar p/ revisão, publicar, pausar, reenviar
  app.post('/academy/api/produtor/produtos/:id/status', ...P, h((req, res) => {
    const p = ct.Produtos.transicionar(req.params.id, s((req.body || {}).status, 20), { comoPapel: 'produtor', producerId: req.usuario.id });
    aud(req, 'produto.status', 'products', p.id, p.status);
    res.json({ ok: true, produto: p });
  }));

  // builder: módulos / aulas / materiais (sempre validando o dono do produto)
  const doDono = (req) => ct.Produtos.obterDoDono(req.params.id, req.usuario.id);
  app.post('/academy/api/produtor/produtos/:id/modulos', ...P, h((req, res) => {
    const p = doDono(req);
    const mid = ct.Conteudo.addModulo(p.id, (req.body || {}).titulo);
    aud(req, 'modulo.criar', 'course_modules', mid, '');
    res.json({ ok: true, id: mid });
  }));
  app.patch('/academy/api/produtor/produtos/:id/modulos/:mid', ...P, h((req, res) => {
    ct.Conteudo.editarModulo(req.params.mid, doDono(req).id, req.body || {});
    res.json({ ok: true });
  }));
  app.delete('/academy/api/produtor/produtos/:id/modulos/:mid', ...P, h((req, res) => {
    ct.Conteudo.removerModulo(req.params.mid, doDono(req).id);
    aud(req, 'modulo.remover', 'course_modules', req.params.mid, '');
    res.json({ ok: true });
  }));
  app.post('/academy/api/produtor/produtos/:id/modulos/:mid/aulas', ...P, h((req, res) => {
    const aid = ct.Conteudo.addAula(doDono(req).id, req.params.mid, req.body || {});
    aud(req, 'aula.criar', 'lessons', aid, s((req.body || {}).titulo, 80));
    res.json({ ok: true, id: aid });
  }));
  app.patch('/academy/api/produtor/produtos/:id/aulas/:aid', ...P, h((req, res) => {
    ct.Conteudo.editarAula(req.params.aid, doDono(req).id, req.body || {});
    res.json({ ok: true });
  }));
  app.delete('/academy/api/produtor/produtos/:id/aulas/:aid', ...P, h((req, res) => {
    ct.Conteudo.removerAula(req.params.aid, doDono(req).id);
    aud(req, 'aula.remover', 'lessons', req.params.aid, '');
    res.json({ ok: true });
  }));
  app.post('/academy/api/produtor/produtos/:id/aulas/:aid/materiais', ...P, h((req, res) => {
    const mid = ct.Conteudo.addMaterial(req.params.aid, doDono(req).id, req.body || {});
    res.json({ ok: true, id: mid });
  }));
  app.delete('/academy/api/produtor/produtos/:id/materiais/:matId', ...P, h((req, res) => {
    ct.Conteudo.removerMaterial(req.params.matId, doDono(req).id);
    res.json({ ok: true });
  }));

  // upload privado (JSON base64 — padrão da casa; 10 MB; mimes controlados)
  app.post('/academy/api/produtor/upload', ...P, h(async (req, res) => {
    const r = await ct.Midia.salvar(req.usuario.id, req.body || {});
    aud(req, 'midia.upload', 'media_files', r.id, `${s((req.body || {}).nome, 80)} (${r.tamanho}b)`);
    res.json({ ok: true, ...r });
  }));

  // F7: upload GRANDE (vídeo) direto ao bucket S3/R2 (presigned PUT; exige storage externo)
  app.post('/academy/api/produtor/upload-grande', ...P, h((req, res) => {
    const r = ct.Midia.iniciarUploadGrande(req.usuario.id, req.body || {});
    aud(req, 'midia.upload-grande.iniciar', 'media_files', r.id, s((req.body || {}).nome, 80));
    res.json({ ok: true, ...r });
  }));
  app.post('/academy/api/produtor/upload-grande/:id/confirmar', ...P, h(async (req, res) => {
    const m = await ct.Midia.confirmarUploadGrande(req.params.id, req.usuario.id);
    aud(req, 'midia.upload-grande.confirmar', 'media_files', m.id, `${m.nome} (${m.tamanho}b)`);
    res.json({ ok: true, id: m.id, tamanho: m.tamanho });
  }));

  // alunos do produto + matrícula cortesia
  app.get('/academy/api/produtor/produtos/:id/alunos', ...P, h((req, res) => {
    const p = doDono(req);
    res.json({ alunos: ct.Matriculas.doProduto(p.id) });
  }));
  app.post('/academy/api/produtor/produtos/:id/matricular', ...P, h((req, res) => {
    const p = doDono(req);
    const id = ct.Matriculas.criar(p.id, s((req.body || {}).email, 120), req.usuario.id, 'cortesia');
    aud(req, 'matricula.cortesia', 'enrollments', id, s((req.body || {}).email, 120));
    const com = require('./emails'); // F8: avisa o aluno
    const aluno = repo.Usuarios.porEmail((req.body || {}).email);
    if (aluno) {
      com.Emails.cortesia(aluno, p.titulo, com.base());
      com.Notificacoes.criar(aluno.id, '🎁 Acesso liberado', `Você recebeu acesso de cortesia a "${p.titulo}".`, '/academy/app');
    }
    res.json({ ok: true, id });
  }));
  app.post('/academy/api/produtor/produtos/:id/matriculas/:eid/revogar', ...P, h((req, res) => {
    ct.Matriculas.revogar(req.params.eid, doDono(req).id);
    aud(req, 'matricula.revogar', 'enrollments', req.params.eid, '');
    res.json({ ok: true });
  }));

  // ============================ ALUNO ============================
  // biblioteca real (substitui o dashboard placeholder da FASE 1)
  app.get('/academy/api/aluno/biblioteca', requireUsuario, requirePapel('aluno'), h((req, res) => {
    const cursos = ct.Matriculas.doAluno(req.usuario.id)
      .map(e => ({ ...e, progresso: ct.Progresso.doProduto(req.usuario.id, e.product_id) }));
    const assinaturas = require('./billing').Assinaturas.doUsuario(req.usuario.id);
    res.json({ cursos, assinaturas, continuar: ct.Progresso.continuar(req.usuario.id) });
  }));
  // estrutura do curso p/ estudo (matrícula ativa OU aulas gratuitas)
  app.get('/academy/api/aluno/cursos/:productId', requireUsuario, requirePapel('aluno'), h((req, res) => {
    const p = ct.Produtos.obter(req.params.productId);
    if (!p || ['suspenso', 'removido'].includes(p.status)) return res.status(404).json({ erro: 'Produto não encontrado.' });
    const matriculado = ct.temAcesso(req.usuario.id, p.id); // matrícula OU assinatura (clube)
    const estrutura = ct.Produtos.estrutura(p.id).map(m => ({
      ...m,
      aulas: m.aulas.map(a => {
        const liberada = matriculado || !!a.gratuita;
        // aula bloqueada não expõe conteúdo/arquivos, só o título (vitrine)
        return liberada ? { ...a, liberada } : { id: a.id, titulo: a.titulo, tipo: a.tipo, gratuita: 0, liberada: false, materiais: [] };
      }),
    }));
    res.json({
      produto: { id: p.id, titulo: p.titulo, subtitulo: p.subtitulo, tipo: p.tipo, capa_media_id: matriculado ? p.capa_media_id : '' },
      matriculado, estrutura,
      incluidos: (p.tipo === 'clube' && matriculado) ? ct.Clube.itens(p.id).filter(i => i.status === 'publicado') : [],
      progresso: matriculado ? ct.Progresso.doProduto(req.usuario.id, p.id) : null,
      progresso_aulas: matriculado ? ct.Progresso.porAula(req.usuario.id, p.id) : {},
    });
  }));
  app.post('/academy/api/aluno/aulas/:lessonId/progresso', requireUsuario, requirePapel('aluno'), h((req, res) => {
    const prog = ct.Progresso.marcar(req.usuario.id, req.params.lessonId, req.body || {});
    res.json({ ok: true, progresso: prog });
  }));

  // ============================ FASE 3: página de venda / avaliações / denúncias ============================
  app.get('/academy/api/produtor/produtos/:id/pagina', ...P, h((req, res) => {
    const p = doDono(req);
    res.json({ secoes: ct.SalesPages.obter(p.id), url_publica: p.status === 'publicado' ? `/academy/cursos/${p.slug}` : null });
  }));
  app.put('/academy/api/produtor/produtos/:id/pagina', ...P, h((req, res) => {
    const p = doDono(req);
    const secoes = ct.SalesPages.salvar(p.id, req.body || {});
    aud(req, 'pagina-venda.salvar', 'sales_pages', p.id, '');
    res.json({ ok: true, secoes });
  }));

  app.post('/academy/api/aluno/cursos/:productId/avaliar', requireUsuario, requirePapel('aluno'), h((req, res) => {
    ct.Reviews.avaliar(req.params.productId, req.usuario.id, req.body || {});
    aud(req, 'avaliacao.criar', 'reviews', req.params.productId, `nota ${s((req.body || {}).nota, 3)}`);
    res.json({ ok: true });
  }));

  app.post('/academy/api/denunciar', requireUsuario, h((req, res) => {
    const d = req.body || {};
    const id = ct.Denuncias.criar(s(d.product_id, 40), req.usuario.id, d);
    aud(req, 'denuncia.criar', 'moderation_reports', id, s(d.motivo, 40));
    res.json({ ok: true, id });
  }));

  app.get('/academy/api/admin/denuncias', ...ADM, h((req, res) => {
    res.json({ denuncias: ct.Denuncias.abertas() });
  }));
  app.post('/academy/api/admin/denuncias/:id/resolver', ...ADM, h((req, res) => {
    ct.Denuncias.resolver(req.params.id, req.body || {});
    aud(req, 'denuncia.resolver', 'moderation_reports', req.params.id, s((req.body || {}).status, 20));
    res.json({ ok: true });
  }));
  app.get('/academy/api/admin/avaliacoes', ...ADM, h((req, res) => {
    res.json({ avaliacoes: ct.Reviews.listarAdmin(req.query.n) });
  }));
  app.post('/academy/api/admin/avaliacoes/:id/moderar', ...ADM, h((req, res) => {
    ct.Reviews.moderar(req.params.id, s((req.body || {}).status, 20));
    aud(req, 'avaliacao.moderar', 'reviews', req.params.id, s((req.body || {}).status, 20));
    res.json({ ok: true });
  }));

  // ============================ MÍDIA (entrega privada) ============================
  const storage = require('./storage');
  app.get('/academy/api/media/:id', requireUsuario, h((req, res) => {
    const m = ct.Midia.obter(req.params.id);
    if (!m || !ct.Midia.podeAcessar(m.id, req.usuario)) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    ct.Midia.logAcesso(req.usuario.id, m.id, ipDe(req));
    if (m.storage === 's3') { // no bucket: redireciona p/ URL presignada curta
      return res.redirect(302, ct.Midia.urlTemporaria(m, req.usuario.id, 600).url);
    }
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(m.nome)}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(ct.Midia.caminhoAbsoluto(m));
  }));

  // F7: emite URL ASSINADA temporária (player de vídeo, CDN futuro) — autoriza aqui, entrega sem cookie
  app.get('/academy/api/media/:id/link', requireUsuario, h((req, res) => {
    const m = ct.Midia.obter(req.params.id);
    if (!m || !ct.Midia.podeAcessar(m.id, req.usuario)) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    ct.Midia.logAcesso(req.usuario.id, m.id, ipDe(req));
    res.json({ ok: true, ...ct.Midia.urlTemporaria(m, req.usuario.id, 600) });
  }));
  // rota pública validada por HMAC + expiração (driver local; sem cookie)
  app.get('/academy/media-s/:id', h((req, res) => {
    const ok = storage.validarLocalAssinada(req.params.id, req.query);
    if (!ok) return res.status(403).json({ erro: 'Link expirado ou inválido.' });
    const m = ct.Midia.obter(req.params.id);
    if (!m || m.storage !== 'local') return res.sendStatus(404);
    ct.Midia.logAcesso(ok.uid, m.id, ipDe(req));
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(m.nome)}"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.sendFile(ct.Midia.caminhoAbsoluto(m));
  }));

  // ============================ ADMIN (moderação) ============================
  app.get('/academy/api/admin/produtos', ...ADM, h((req, res) => {
    res.json({ produtos: ct.Produtos.listarAdmin(req.query), em_revisao: ct.Produtos.emRevisao().length });
  }));
  app.post('/academy/api/admin/produtos/:id/decidir', ...ADM, h((req, res) => {
    const p = ct.Produtos.transicionar(req.params.id, s((req.body || {}).status, 20), { comoPapel: 'admin', motivo: (req.body || {}).motivo });
    aud(req, `produto.${p.status}`, 'products', p.id, s((req.body || {}).motivo, 200));
    res.json({ ok: true, produto: p });
  }));
  app.post('/academy/api/admin/produtos/:id/matricular', ...ADM, h((req, res) => {
    const id = ct.Matriculas.criar(req.params.id, s((req.body || {}).email, 120), 'admin:' + req.usuario.id, 'cortesia');
    aud(req, 'matricula.cortesia', 'enrollments', id, s((req.body || {}).email, 120));
    res.json({ ok: true, id });
  }));
}

module.exports = { registrarRotasConteudo };
