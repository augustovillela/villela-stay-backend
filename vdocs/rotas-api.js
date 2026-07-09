// =====================================================================
// Villela Docs Intelligence — API do produto (/vdocs/api/*), Fase 1.
// Rotas públicas: cadastro (trial), login, aceite de convite, lead.
// Rotas autenticadas: sempre requireTenant → req.vd.tenant.id é a única
// fonte do tenant (isolamento). Permissão fina via requirePerm.
// =====================================================================
'use strict';
const repo = require('./repo');
const docs = require('./docs');
const jobs = require('./jobs');
const busca = require('./busca');
const ia = require('./ia');
const wf = require('./workflows');
const comp = require('./compartilhar');
const billing = require('./billing');
const apiPub = require('./api-publica');
const ent = require('./enterprise');
const push = require('./push');
const { PERMISSOES, PAPEIS } = require('./permissoes');

function registrarRotasApi(app, { express, auth, notificar, enviarEmail }) {
  const r = express.Router();
  // 30mb: uploads da Fase 2 vêm em base64 no JSON (arquivo de até 20 MB ≈ 27 MB em base64)
  r.use(express.json({ limit: '30mb' }));
  r.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const h = (fn) => (req, res) => { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); };
  // atrás do proxy do Render req.protocol é 'http' — links gerados devem usar o protocolo real
  const protoDe = (req) => String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const { requireTenant, requirePerm } = auth;

  // ------------------------------------------------ públicas
  r.post('/cadastro', h(async (req, res) => {
    const ip = auth.ipDe(req);
    if (auth.bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
    const b = req.body || {};
    let criado;
    try { criado = repo.criarTenantComDono({ empresa: b.empresa, nome: b.nome, email: b.email, senha: b.senha, ip }); }
    catch (e) { auth.registraFalha(ip); throw e; }
    auth.limpaFalhas(ip);
    auth.emitirSessao(res, criado.user.id, criado.tenant.id);
    notificar(`🗂️ Villela Docs: novo trial — ${criado.tenant.nome} (${criado.user.email}).`);
    res.json({ ok: true, tenant: { id: criado.tenant.id, nome: criado.tenant.nome, slug: criado.tenant.slug } });
  }));

  r.post('/login', h(async (req, res) => {
    const b = req.body || {};
    const sessao = auth.login(req, res, { email: b.email, senha: b.senha, tenant_id: b.tenant_id });
    if (!sessao) return; // resposta de erro já enviada
    res.json({ ok: true, tenant: { id: sessao.tenant.id, nome: sessao.tenant.nome }, tenants: sessao.tenants });
  }));

  r.post('/logout', (req, res) => { auth.limparSessao(res); res.json({ ok: true }); });

  // 2º passo do login quando o usuário tem 2FA (Fase 10)
  r.post('/login-2fa', h(async (req, res) => {
    const b = req.body || {};
    const sessao = auth.login2fa(req, res, { tfa_token: b.tfa_token, codigo: b.codigo });
    if (!sessao) return;
    res.json({ ok: true, tenant: { id: sessao.tenant.id, nome: sessao.tenant.nome } });
  }));

  r.post('/convites/aceitar', h(async (req, res) => {
    const b = req.body || {};
    const { user, tenantId } = repo.aceitarConvite(b.token, { nome: b.nome, senha: b.senha }, auth.ipDe(req));
    auth.emitirSessao(res, user.id, tenantId);
    res.json({ ok: true });
  }));

  // Lead da landing (sem sessão) — rate limit leve por IP p/ não virar spam.
  const leadsPorIp = new Map();
  r.post('/leads', h(async (req, res) => {
    const ip = auth.ipDe(req);
    const agora = Date.now();
    const marca = leadsPorIp.get(ip) || 0;
    if (agora - marca < 30 * 1000) return res.status(429).json({ erro: 'Aguarde um instante e tente de novo.' });
    leadsPorIp.set(ip, agora);
    const b = req.body || {};
    if (!repo.emailOK(repo.emailNorm(b.email))) throw new Error('Informe um e-mail válido.');
    repo.criarLead(b);
    notificar(`🗂️ Villela Docs: novo lead — ${repo.s(b.nome, 80) || 'sem nome'} <${repo.emailNorm(b.email)}> ${repo.s(b.empresa, 80)}`.trim());
    res.json({ ok: true });
  }));

  // ------------------------------------------------ sessão / contexto
  r.get('/me', requireTenant, h(async (req, res) => {
    const { user, tenant, vinculo, permissoes, papelNome, bloqueado } = req.vd;
    res.json({
      user: { id: user.id, nome: user.nome, email: user.email },
      totp_ativo: !!user.totp_ativo,
      tenant: { id: tenant.id, nome: tenant.nome, slug: tenant.slug, status: tenant.status, trial_expira_em: tenant.trial_expira_em },
      papel: vinculo.papel, papel_nome: papelNome, permissoes, bloqueado,
      tenants: repo.tenantsDoUsuario(user.id),
      catalogo_permissoes: PERMISSOES,
      papeis_embutidos: Object.fromEntries(Object.entries(PAPEIS).map(([k, v]) => [k, v.nome])),
    });
  }));

  r.post('/trocar-tenant', requireTenant, h(async (req, res) => {
    const alvo = String((req.body || {}).tenant_id || '');
    const meus = repo.tenantsDoUsuario(req.vd.user.id);
    if (!meus.some(t => t.id === alvo)) throw new Error('Você não participa dessa empresa.');
    auth.emitirSessao(res, req.vd.user.id, alvo);
    res.json({ ok: true });
  }));

  r.get('/dashboard', requireTenant, h(async (req, res) => {
    res.json({ ...repo.dashboardTenant(req.vd.tenant.id), aprovacoes_pendentes: wf.listar(req.vd.tenant.id, req.vd.user.id).pendentes.length });
  }));

  // ------------------------------------------------ empresa (config)
  r.get('/config', requireTenant, requirePerm('gerir_configuracoes'), h(async (req, res) => {
    res.json({ tenant: repo.obterTenant(req.vd.tenant.id), settings: repo.lerSettings(req.vd.tenant.id), chaves: repo.CONFIG_PERMITIDAS });
  }));
  r.patch('/config', requireTenant, requirePerm('gerir_configuracoes'), h(async (req, res) => {
    const b = req.body || {};
    if (b.tenant) repo.atualizarTenant(req.vd.tenant.id, b.tenant, req.vd.user, req.vd.ip);
    for (const [k, v] of Object.entries(b.settings || {})) repo.gravarSetting(req.vd.tenant.id, k, v, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ usuários / convites / papéis
  r.get('/usuarios', requireTenant, requirePerm('gerir_usuarios'), h(async (req, res) => {
    res.json({ usuarios: repo.listarUsuarios(req.vd.tenant.id), convites: repo.listarConvites(req.vd.tenant.id) });
  }));
  r.patch('/usuarios/:vinculoId', requireTenant, requirePerm('gerir_usuarios'), h(async (req, res) => {
    res.json({ ok: true, vinculo: repo.alterarVinculo(req.vd.tenant.id, req.params.vinculoId, req.body || {}, req.vd.user, req.vd.ip) });
  }));
  r.post('/convites', requireTenant, requirePerm('gerir_usuarios'), h(async (req, res) => {
    const b = req.body || {};
    const conv = repo.criarConvite(req.vd.tenant.id, { email: b.email, papel: b.papel }, req.vd.user, req.vd.ip);
    const link = `${protoDe(req)}://${req.get('host')}/vdocs/convite/${conv.token}`;
    // e-mail automático (best-effort — o link também volta na resposta p/ envio manual)
    let email_enviado = false;
    if (typeof enviarEmail === 'function') {
      email_enviado = await Promise.resolve(enviarEmail(conv.email,
        `Convite — ${req.vd.tenant.nome} no Villela Docs`,
        `<p>${repo.s(req.vd.user.nome, 120)} convidou você para a área de documentos de <b>${repo.s(req.vd.tenant.nome, 120)}</b> no Villela Docs Intelligence.</p>
         <p><a href="${link}">Aceitar o convite</a> (válido por 7 dias)</p>
         <p style="color:#888;font-size:13px">Se você não esperava este convite, ignore este e-mail.</p>`)).catch(() => false);
    }
    res.json({ ok: true, convite: { id: conv.id, email: conv.email }, link, email_enviado });
  }));
  r.delete('/convites/:id', requireTenant, requirePerm('gerir_usuarios'), h(async (req, res) => {
    repo.revogarConvite(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));
  r.get('/papeis', requireTenant, requirePerm('gerir_usuarios'), h(async (req, res) => {
    res.json({ papeis: repo.listarRoles(req.vd.tenant.id) });
  }));
  r.post('/papeis', requireTenant, requirePerm('gerir_papeis'), h(async (req, res) => {
    res.json({ ok: true, id: repo.salvarRole(req.vd.tenant.id, req.body || {}, req.vd.user, req.vd.ip) });
  }));
  r.delete('/papeis/:id', requireTenant, requirePerm('gerir_papeis'), h(async (req, res) => {
    repo.excluirRole(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ pastas (Fase 2)
  r.get('/pastas', requireTenant, requirePerm('ver_documentos'), h(async (req, res) => {
    res.json({ pastas: docs.listarPastas(req.vd.tenant.id) });
  }));
  r.post('/pastas', requireTenant, requirePerm('criar_pasta'), h(async (req, res) => {
    res.json({ ok: true, id: docs.criarPasta(req.vd.tenant.id, req.body || {}, req.vd.user, req.vd.ip) });
  }));
  r.patch('/pastas/:id', requireTenant, requirePerm('criar_pasta'), h(async (req, res) => {
    const b = req.body || {};
    if (b.nome) docs.renomearPasta(req.vd.tenant.id, req.params.id, b.nome, req.vd.user, req.vd.ip);
    if (b.parent_id !== undefined) docs.moverPasta(req.vd.tenant.id, req.params.id, b.parent_id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));
  r.delete('/pastas/:id', requireTenant, requirePerm('excluir_documento'), h(async (req, res) => {
    docs.excluirPasta(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ documentos (Fase 2)
  r.get('/documentos', requireTenant, requirePerm('ver_documentos'), h(async (req, res) => {
    const q = req.query || {};
    const lista = docs.listarDocumentos(req.vd.tenant.id, { folder_id: q.pasta, status: q.status, busca: q.busca, tipo: q.tipo, tag: q.tag });
    // busca também no CONTEÚDO extraído (FTS) — resultados fora da pasta atual entram marcados
    let porConteudo = [];
    if (q.busca && q.status !== 'lixeira') {
      const hits = jobs.buscarPorConteudo(req.vd.tenant.id, q.busca);
      const jaTem = new Set(lista.map(d => d.id));
      for (const hit of hits) {
        if (jaTem.has(hit.document_id)) { const d = lista.find(x => x.id === hit.document_id); d.trecho = hit.trecho; continue; }
        try {
          const d = docs.obterDocumento(req.vd.tenant.id, hit.document_id);
          if (d.status === 'ativo') porConteudo.push({ id: d.id, folder_id: d.folder_id, nome: d.nome, tipo_documental: d.tipo_documental, tags: d.tags, status: d.status, versao_atual: d.versao_atual, validade: d.validade, criado_em: d.criado_em, atualizado_em: d.atualizado_em, trecho: hit.trecho, fora_da_pasta: true });
        } catch (_) {}
      }
    }
    res.json({ documentos: lista.concat(porConteudo), tipos: docs.TIPOS_DOCUMENTAIS });
  }));
  r.post('/documentos', requireTenant, requirePerm('criar_documento'), h(async (req, res) => {
    try {
      res.json({ ok: true, documento: docs.criarDocumento(req.vd.tenant.id, req.body || {}, req.vd.user, req.vd.ip) });
    } catch (e) {
      if (e.duplicado) return res.status(409).json({ erro: e.message, duplicado: e.duplicado });
      throw e;
    }
  }));
  r.get('/documentos/:id', requireTenant, requirePerm('ver_documentos'), h(async (req, res) => {
    const d = docs.obterDocumento(req.vd.tenant.id, req.params.id, { comVersoes: true });
    docs.logVisualizacao(req.vd.tenant.id, d.id, req.vd.user, req.vd.ip);
    res.json({
      documento: d,
      processamento: jobs.statusProcessamento(req.vd.tenant.id, d.id),
      aprovacoes: wf.doDocumento(req.vd.tenant.id, d.id),
      acessos: req.vd.permissoes.ver_auditoria ? docs.acessosDoDocumento(req.vd.tenant.id, d.id, 30) : [],
    });
  }));
  r.post('/documentos/:id/reprocessar', requireTenant, requirePerm('criar_documento'), h(async (req, res) => {
    res.json({ ok: true, job: jobs.reprocessar(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip) });
  }));
  r.patch('/documentos/:id', requireTenant, requirePerm('editar_metadados'), h(async (req, res) => {
    res.json({ ok: true, documento: docs.atualizarDocumento(req.vd.tenant.id, req.params.id, req.body || {}, req.vd.user, req.vd.ip) });
  }));
  r.post('/documentos/:id/mover', requireTenant, requirePerm('mover_documento'), h(async (req, res) => {
    docs.moverDocumento(req.vd.tenant.id, req.params.id, (req.body || {}).folder_id || '', req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));
  r.post('/documentos/:id/versoes', requireTenant, requirePerm('criar_documento'), h(async (req, res) => {
    res.json({ ok: true, versao: docs.novaVersao(req.vd.tenant.id, req.params.id, req.body || {}, req.vd.user, req.vd.ip) });
  }));
  r.post('/documentos/:id/versoes/:numero/restaurar', requireTenant, requirePerm('criar_documento'), h(async (req, res) => {
    res.json({ ok: true, versao: docs.restaurarVersao(req.vd.tenant.id, req.params.id, req.params.numero, req.vd.user, req.vd.ip) });
  }));
  r.get('/documentos/:id/baixar', requireTenant, requirePerm('baixar_documento'), h(async (req, res) => {
    const { buffer, nome, mime } = docs.baixar(req.vd.tenant.id, req.params.id, req.query.versao, req.vd.user, req.vd.ip);
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.send(buffer);
  }));
  r.post('/documentos/:id/lixeira', requireTenant, requirePerm('excluir_documento'), h(async (req, res) => {
    docs.paraLixeira(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));
  r.post('/documentos/:id/restaurar', requireTenant, requirePerm('restaurar_documento'), h(async (req, res) => {
    docs.restaurarDaLixeira(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));
  r.delete('/documentos/:id', requireTenant, requirePerm('excluir_documento'), h(async (req, res) => {
    docs.excluirDefinitivo(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ busca avançada (Fase 4)
  r.get('/busca', requireTenant, requirePerm('ver_documentos'), h(async (req, res) => {
    const q = req.query || {};
    res.json({
      resultados: busca.buscar(req.vd.tenant.id, { q: q.q, tipo: q.tipo, tag: q.tag, pasta: q.pasta, de: q.de, ate: q.ate, vencendo: q.vencendo }, req.vd.user),
    });
  }));
  r.get('/busca/contexto', requireTenant, requirePerm('ver_documentos'), h(async (req, res) => {
    res.json({
      salvas: busca.listarSalvas(req.vd.tenant.id, req.vd.user.id),
      historico: busca.historico(req.vd.tenant.id, req.vd.user.id),
      tipos: docs.TIPOS_DOCUMENTAIS,
      pastas: docs.listarPastas(req.vd.tenant.id),
    });
  }));
  r.post('/buscas-salvas', requireTenant, requirePerm('ver_documentos'), h(async (req, res) => {
    res.json({ ok: true, id: busca.salvarBusca(req.vd.tenant.id, req.vd.user.id, req.body || {}, req.vd.ip) });
  }));
  r.delete('/buscas-salvas/:id', requireTenant, requirePerm('ver_documentos'), h(async (req, res) => {
    busca.excluirSalva(req.vd.tenant.id, req.vd.user.id, req.params.id);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ enterprise (Fase 10)
  r.post('/seguranca/2fa/iniciar', requireTenant, h(async (req, res) => {
    res.json({ ok: true, ...(await ent.iniciar2fa(req.vd.user)) });
  }));
  r.post('/seguranca/2fa/confirmar', requireTenant, h(async (req, res) => {
    res.json({ ok: true, ...ent.confirmar2fa(req.vd.tenant.id, req.vd.user, (req.body || {}).codigo, req.vd.ip) });
  }));
  r.post('/seguranca/2fa/desativar', requireTenant, h(async (req, res) => {
    ent.desativar2fa(req.vd.tenant.id, req.vd.user, (req.body || {}).codigo, req.vd.ip);
    res.json({ ok: true });
  }));
  r.post('/documentos/:id/retencao-legal', requireTenant, requirePerm('gerir_configuracoes'), h(async (req, res) => {
    docs.alternarLegalHold(req.vd.tenant.id, req.params.id, !!(req.body || {}).ativo, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));
  // takeout LGPD: exportação completa (dados + arquivos vigentes) em ZIP
  r.get('/exportacao', requireTenant, requirePerm('exportar_dados'), h(async (req, res) => {
    const zip = ent.exportarTenant(req.vd.tenant.id, req.vd.user, req.vd.ip);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('villela-docs-' + req.vd.tenant.slug + '.zip')}`);
    res.send(zip);
  }));

  // ------------------------------------------------ integrações/API (Fase 9)
  r.get('/integracoes', requireTenant, requirePerm('configurar_integracoes'), h(async (req, res) => {
    const plano = repo.planoDoTenant(req.vd.tenant.id);
    res.json({
      api_disponivel: !!(plano && plano.limites.api),
      chaves: apiPub.listarChaves(req.vd.tenant.id),
      webhooks: apiPub.listarWebhooks(req.vd.tenant.id),
      entregas: apiPub.entregasRecentes(req.vd.tenant.id),
      eventos: apiPub.EVENTOS,
      base_url: `${protoDe(req)}://${req.get('host')}/vdocs/api/v1`,
    });
  }));
  r.post('/integracoes/chaves', requireTenant, requirePerm('configurar_integracoes'), h(async (req, res) => {
    res.json({ ok: true, ...apiPub.criarChave(req.vd.tenant.id, (req.body || {}).nome, req.vd.user, req.vd.ip) });
  }));
  r.delete('/integracoes/chaves/:id', requireTenant, requirePerm('configurar_integracoes'), h(async (req, res) => {
    apiPub.revogarChave(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));
  r.post('/integracoes/webhooks', requireTenant, requirePerm('configurar_integracoes'), h(async (req, res) => {
    res.json({ ok: true, ...apiPub.criarWebhook(req.vd.tenant.id, req.body || {}, req.vd.user, req.vd.ip) });
  }));
  r.delete('/integracoes/webhooks/:id', requireTenant, requirePerm('configurar_integracoes'), h(async (req, res) => {
    apiPub.excluirWebhook(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ billing (Fase 8)
  r.get('/billing', requireTenant, h(async (req, res) => {
    if (!req.vd.permissoes.administrar_cobranca && !req.vd.permissoes.ver_uso) return res.status(403).json({ erro: 'Sem permissão: administrar_cobranca' });
    res.json(billing.estado(req.vd.tenant.id));
  }));
  r.post('/billing/assinar', requireTenant, requirePerm('administrar_cobranca'), h(async (req, res) => {
    const base = `${protoDe(req)}://${req.get('host')}`;
    res.json({ ok: true, ...(await billing.assinar(req.vd.tenant.id, (req.body || {}).plano_slug, req.vd.user, base, req.vd.ip)) });
  }));
  r.post('/billing/cancelar', requireTenant, requirePerm('administrar_cobranca'), h(async (req, res) => {
    await billing.cancelarAssinatura(req.vd.tenant.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));
  // webhook do Mercado Pago (público; o estado real é relido da API do MP)
  r.post('/billing/webhook', h(async (req, res) => {
    res.json(await billing.processarWebhook(req.body || {}, req.query || {}));
  }));

  // ------------------------------------------------ compartilhamento externo (Fase 7)
  const linkBase = (req) => `${protoDe(req)}://${req.get('host')}`;
  r.get('/compartilhamentos', requireTenant, requirePerm('compartilhar_documento'), h(async (req, res) => {
    res.json({ shares: comp.listarShares(req.vd.tenant.id), solicitacoes: comp.listarSolicitacoes(req.vd.tenant.id) });
  }));
  r.post('/compartilhamentos', requireTenant, requirePerm('compartilhar_documento'), h(async (req, res) => {
    const { id, token } = comp.criarShare(req.vd.tenant.id, req.body || {}, req.vd.user, req.vd.ip);
    res.json({ ok: true, id, link: `${linkBase(req)}/vdocs/s/${token}` });
  }));
  r.delete('/compartilhamentos/:id', requireTenant, requirePerm('compartilhar_documento'), h(async (req, res) => {
    comp.revogarShare(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));
  r.get('/compartilhamentos/:id/acessos', requireTenant, requirePerm('compartilhar_documento'), h(async (req, res) => {
    res.json({ acessos: comp.acessosDoShare(req.vd.tenant.id, req.params.id) });
  }));
  r.post('/solicitacoes', requireTenant, requirePerm('criar_documento'), h(async (req, res) => {
    const { id, token } = comp.criarSolicitacao(req.vd.tenant.id, req.body || {}, req.vd.user, req.vd.ip);
    res.json({ ok: true, id, link: `${linkBase(req)}/vdocs/r/${token}` });
  }));
  r.delete('/solicitacoes/:id', requireTenant, requirePerm('criar_documento'), h(async (req, res) => {
    comp.revogarSolicitacao(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ workflows de aprovação (Fase 6)
  r.get('/workflows', requireTenant, requirePerm('ver_documentos'), h(async (req, res) => {
    res.json({ modelos: wf.listarModelos(req.vd.tenant.id, !req.query.todos), usuarios: repo.listarUsuarios(req.vd.tenant.id).filter(u => u.status === 'ativo').map(u => ({ user_id: u.user_id, nome: u.nome })) });
  }));
  r.post('/workflows', requireTenant, requirePerm('criar_workflow'), h(async (req, res) => {
    res.json({ ok: true, id: wf.salvarModelo(req.vd.tenant.id, req.body || {}, req.vd.user, req.vd.ip) });
  }));
  r.get('/aprovacoes', requireTenant, requirePerm('ver_documentos'), h(async (req, res) => {
    res.json(wf.listar(req.vd.tenant.id, req.vd.user.id));
  }));
  r.get('/aprovacoes/:id', requireTenant, requirePerm('ver_documentos'), h(async (req, res) => {
    res.json({ aprovacao: wf.obterInstancia(req.vd.tenant.id, req.params.id) });
  }));
  r.post('/documentos/:id/aprovacao', requireTenant, requirePerm('criar_workflow'), h(async (req, res) => {
    res.json({ ok: true, id: wf.iniciar(req.vd.tenant.id, { document_id: req.params.id, workflow_id: (req.body || {}).workflow_id }, req.vd.user, req.vd.ip) });
  }));
  r.post('/aprovacoes/:id/decidir', requireTenant, requirePerm('aprovar_documento'), h(async (req, res) => {
    const b = req.body || {};
    res.json({ ok: true, ...wf.decidir(req.vd.tenant.id, req.params.id, { decisao: b.decisao, justificativa: b.justificativa }, req.vd.user, req.vd.ip) });
  }));
  r.post('/aprovacoes/:id/cancelar', requireTenant, requirePerm('criar_workflow'), h(async (req, res) => {
    wf.cancelar(req.vd.tenant.id, req.params.id, req.vd.user, req.vd.ip);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ IA documental (Fase 5)
  r.get('/ia/conversas', requireTenant, requirePerm('usar_ia'), h(async (req, res) => {
    res.json({ ativo: ia.ativo(), conversas: ia.listarConversas(req.vd.tenant.id, req.vd.user.id) });
  }));
  r.get('/ia/conversas/:id', requireTenant, requirePerm('usar_ia'), h(async (req, res) => {
    res.json({ conversa: ia.obterConversa(req.vd.tenant.id, req.vd.user.id, req.params.id) });
  }));
  r.delete('/ia/conversas/:id', requireTenant, requirePerm('usar_ia'), h(async (req, res) => {
    ia.excluirConversa(req.vd.tenant.id, req.vd.user.id, req.params.id);
    res.json({ ok: true });
  }));
  r.post('/ia/perguntar', requireTenant, requirePerm('usar_ia'), h(async (req, res) => {
    const b = req.body || {};
    res.json(await ia.perguntar(req.vd.tenant.id, req.vd.user, {
      conversation_id: b.conversation_id, escopo_tipo: b.escopo_tipo, escopo_ref: b.escopo_ref, pergunta: b.pergunta,
    }, req.vd.ip));
  }));
  r.post('/ia/mensagens/:id/feedback', requireTenant, requirePerm('usar_ia'), h(async (req, res) => {
    const b = req.body || {};
    ia.darFeedback(req.vd.tenant.id, req.vd.user.id, req.params.id, b.tipo, b.comentario);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ notificações push do painel (PWA)
  // Por usuário logado, sem gate de permissão fina: qualquer membro ativo
  // pode ativar os avisos no próprio celular. tenant + user vêm da sessão.
  r.get('/push/chave', requireTenant, h(async (req, res) => res.json({ publicKey: push.chavePublica() })));
  r.post('/push/subscribe', requireTenant, h(async (req, res) => {
    push.salvar(req.vd.tenant.id, req.vd.user.id, (req.body || {}).subscription);
    res.json({ ok: true });
  }));
  r.post('/push/unsubscribe', requireTenant, h(async (req, res) => {
    push.remover((req.body || {}).endpoint);
    res.json({ ok: true });
  }));

  // ------------------------------------------------ auditoria / uso
  r.get('/auditoria', requireTenant, requirePerm('ver_auditoria'), h(async (req, res) => {
    res.json({ eventos: repo.listarAuditoria(req.vd.tenant.id, { limite: req.query.limite, antes: req.query.antes }) });
  }));
  r.get('/uso', requireTenant, h(async (req, res) => {
    if (!req.vd.permissoes.ver_uso && !req.vd.permissoes.administrar_cobranca) return res.status(403).json({ erro: 'Sem permissão: ver_uso' });
    res.json({ uso: repo.usoDoMes(req.vd.tenant.id), plano: repo.planoDoTenant(req.vd.tenant.id), planos: repo.listarPlanos() });
  }));

  app.use('/vdocs/api', r);
}

module.exports = { registrarRotasApi };
