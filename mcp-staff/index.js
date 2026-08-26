'use strict';

const crypto = require('crypto');
const oauth = require('./oauth');

const SCOPES = {
  read: 'staff:read', write: 'staff:write', email: 'staff:email',
};

function escapeHtml(v) {
  return String(v || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function bearer(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return m && m[1];
}

function hasScope(auth, scope) {
  return String(auth.scope || '').split(/\s+/).includes(scope);
}

function actor(user) { return user.email || user.nome || user.id; }
function textResult(value) { return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value }; }

function mount(app, deps) {
  if (String(process.env.STAFF_MCP_ENABLED || '').toLowerCase() !== 'on') {
    console.log('[mcp-staff] desligado (defina STAFF_MCP_ENABLED=on para ativar)');
    return { enabled: false };
  }
  const base = String(process.env.STAFF_PUBLIC_URL || 'https://staff.villelastay.com.br').replace(/\/$/, '');
  const resource = `${base}/mcp`;
  const issuer = base;
  const pendingSecret = deps.jwtSecret;

  app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_req, res) => res.json({
    resource, authorization_servers: [issuer], scopes_supported: Object.values(SCOPES), bearer_methods_supported: ['header'],
  }));
  app.get(['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/staff'], (_req, res) => res.json({
    issuer,
    authorization_endpoint: `${base}/staff/oauth/authorize`,
    token_endpoint: `${base}/staff/oauth/token`,
    registration_endpoint: `${base}/staff/oauth/register`,
    revocation_endpoint: `${base}/staff/oauth/revoke`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: Object.values(SCOPES),
  }));

  app.post('/staff/oauth/register', (req, res) => {
    try { res.status(201).json(oauth.register(req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.get('/staff/oauth/authorize', (req, res) => {
    try {
      const checked = oauth.validateAuthorization(req.query, resource);
      const tx = deps.jwt.sign({ tipo: 'mcp-oauth-tx', q: req.query }, pendingSecret, { expiresIn: '10m', issuer });
      res.cookie('staff_mcp_pending', tx, { httpOnly: true, secure: deps.cookieSecure, sameSite: 'lax', path: '/staff', maxAge: 600000 });
      if (!(req.cookies && req.cookies.staff_token)) return res.redirect('/staff/');
      return deps.requireAuth(req, res, () => {
        const scopes = checked.scope.split(' ').map(s => `<li>${escapeHtml(s)}</li>`).join('');
        res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Autorizar Codex</title>
          <body style="font:16px system-ui;max-width:640px;margin:48px auto;padding:20px"><h1>Autorizar Codex</h1>
          <p><b>${escapeHtml(checked.client.client_name)}</b> solicita acesso ao Staff como <b>${escapeHtml(req.user.nome || req.user.email)}</b>.</p>
          <ul>${scopes}</ul><p>O Codex terá somente as permissões que sua conta já possui.</p>
          <form method="post" action="/staff/oauth/consent"><input type="hidden" name="tx" value="${escapeHtml(tx)}">
          <button name="decision" value="allow">Autorizar</button> <button name="decision" value="deny">Cancelar</button></form></body></html>`);
      });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.get('/staff/oauth/resume', (req, res) => {
    const tx = req.cookies && req.cookies.staff_mcp_pending;
    if (!tx) return res.redirect('/staff/');
    try {
      const data = deps.jwt.verify(tx, pendingSecret, { issuer });
      const qs = new URLSearchParams(data.q).toString();
      return res.redirect(`/staff/oauth/authorize?${qs}`);
    } catch (_) { return res.redirect('/staff/'); }
  });

  app.post('/staff/oauth/consent', deps.requireAuth, (req, res) => {
    try {
      const data = deps.jwt.verify(req.body.tx, pendingSecret, { issuer });
      const q = data.q;
      oauth.validateAuthorization(q, resource);
      const url = new URL(q.redirect_uri);
      if (q.state) url.searchParams.set('state', q.state);
      if (req.body.decision !== 'allow') url.searchParams.set('error', 'access_denied');
      else url.searchParams.set('code', oauth.db.createCode({ clientId: q.client_id, uid: req.user.id, redirectUri: q.redirect_uri, resource, scope: oauth.normalizeScopes(q.scope), codeChallenge: q.code_challenge }));
      res.clearCookie('staff_mcp_pending', { path: '/staff' });
      return res.redirect(url.toString());
    } catch (e) { return res.status(400).json({ error: e.message }); }
  });

  app.post('/staff/oauth/token', (req, res) => {
    try { res.json(oauth.exchange(req.body, { jwt: deps.jwt, secret: deps.jwtSecret, issuer })); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/staff/oauth/revoke', (req, res) => { if (req.body.token) oauth.db.revoke(req.body.token); res.status(200).end(); });

  const attempts = new Map();
  function authenticate(req, res, next) {
    try {
      const raw = bearer(req);
      if (!raw) {
        res.set('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
        return res.status(401).json({ error: 'invalid_token' });
      }
      const claims = deps.jwt.verify(raw, deps.jwtSecret, { issuer, audience: resource });
      if (claims.tipo !== 'staff-mcp') throw new Error('wrong_token_type');
      const user = deps.lerUsuarios().find(u => u.id === claims.sub && u.ativo);
      if (!user) throw new Error('inactive_user');
      const key = `${user.id}:${Math.floor(Date.now() / 60000)}`;
      const count = (attempts.get(key) || 0) + 1; attempts.set(key, count);
      if (count > 120) return res.status(429).json({ error: 'rate_limited' });
      req.mcpAuth = { user, scope: claims.scope || '' };
      next();
    } catch (_) { res.status(401).json({ error: 'invalid_token' }); }
  }

  let sdkPromise;
  const sdk = () => sdkPromise || (sdkPromise = Promise.all([
    import('@modelcontextprotocol/server'), import('@modelcontextprotocol/node'), import('zod/v4'),
  ]));

  app.post('/mcp', authenticate, async (req, res) => {
    try {
      const [{ McpServer }, { NodeStreamableHTTPServerTransport }, { z }] = await sdk();
      const server = new McpServer({ name: 'villela-staff', version: '0.1.0' });
      const auth = req.mcpAuth, user = auth.user;
      const need = (scope, area) => {
        if (!hasScope(auth, scope)) throw new Error(`Escopo ausente: ${scope}`);
        if (area && !deps.podeArea(user, area)) throw new Error(`Sua conta Staff não tem acesso à área ${area}.`);
      };
      const ctx = { usuario: user, origem: 'codex_mcp' };
      const read = async (action, args, area) => { need(SCOPES.read, area); return textResult(await deps.voz.executor.rodar(action, args, { somenteLeitura: true, ctx })); };
      const write = async (action, args, area, requestId) => {
        need(SCOPES.write, area);
        const idem = requestId ? crypto.createHash('sha256').update(`${user.id}|${action}|${requestId}`).digest('hex').slice(0, 32) : null;
        const created = deps.voz.repo.criar({ canal: 'codex_mcp', ator: actor(user), texto: `${action}:${JSON.stringify(args)}`, modo: 'executar', idem });
        if (!created.repetido) deps.voz.repo.atualizar(created.pedido.id, { acao: action, parametros: args, nivel: deps.voz.acoes.nivelDe(action), status: 'pronto' });
        const result = await deps.voz.executor.executarPedido(created.pedido.id, { ctx });
        return textResult({ pedidoId: created.pedido.id, repetido: created.repetido, ...result.resultado });
      };
      server.registerTool('villela_consultar_agenda', { title: 'Consultar agenda', description: 'Consulta chegadas e saídas em uma data.', inputSchema: { data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }, annotations: { readOnlyHint: true } }, a => read('agenda.dia', a, 'operacoes'));
      server.registerTool('villela_consultar_ocupacao', { title: 'Consultar ocupação', description: 'Consulta ocupação entre duas datas.', inputSchema: { de: z.string().optional(), ate: z.string().optional() }, annotations: { readOnlyHint: true } }, a => read('ocupacao.periodo', a, 'operacoes'));
      server.registerTool('villela_consultar_lista', { title: 'Consultar lista', description: 'Mostra compras ou pendências.', inputSchema: { tipo: z.enum(['compras', 'pendencias']) }, annotations: { readOnlyHint: true } }, a => read('listas.ver', a, a.tipo === 'compras' ? 'compras' : 'ceo'));
      server.registerTool('villela_adicionar_item_compras', { title: 'Adicionar item de compras', description: 'Adiciona um item reversível à lista de compras.', inputSchema: { nome: z.string().min(1), quantidade: z.union([z.string(), z.number()]).optional(), obs: z.string().optional(), request_id: z.string().optional() }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }, ({ request_id, ...a }) => write('listas.adicionar', a, 'compras', request_id));
      server.registerTool('villela_criar_tarefa', { title: 'Criar tarefa', description: 'Cria uma pendência interna.', inputSchema: { nome: z.string().min(1), obs: z.string().optional(), categoria: z.string().optional(), responsavel: z.string().optional(), prazo: z.string().optional(), request_id: z.string().optional() }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }, ({ request_id, ...a }) => write('tarefa.criar', a, 'ceo', request_id));
      server.registerTool('villela_preparar_email', { title: 'Preparar e-mail', description: 'Prepara o e-mail e devolve um link; nunca envia sem aprovação autenticada no Staff.', inputSchema: { para: z.string().min(1), assunto: z.string().optional(), corpo: z.string().min(1), request_id: z.string().optional() }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true } }, async ({ request_id, ...a }) => {
        need(SCOPES.email, 'ceo');
        const idem = request_id ? crypto.createHash('sha256').update(`${user.id}|email|${request_id}`).digest('hex').slice(0, 32) : null;
        const made = deps.voz.repo.criar({ canal: 'codex_mcp', ator: actor(user), texto: `email.enviar:${JSON.stringify(a)}`, modo: 'executar', idem });
        if (made.repetido) return textResult({ pedidoId: made.pedido.id, status: made.pedido.status, approvalUrl: `${base}/staff/voz/pedidos/${made.pedido.id}` });
        deps.voz.repo.atualizar(made.pedido.id, { acao: 'email.enviar', parametros: a, nivel: deps.voz.acoes.nivelDe('email.enviar'), status: 'pronto' });
        const approval = deps.voz.aprovacoes.criar(made.pedido.id);
        return textResult({ pedidoId: made.pedido.id, status: 'aguardando_aprovacao', expiresAt: approval.expiraEm, approvalUrl: `${base}/staff/voz/aprovar?token=${encodeURIComponent(approval.token)}` });
      });
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
      await transport.handleRequest(req, res, req.body);
    } catch (e) { if (!res.headersSent) res.status(500).json({ error: 'mcp_error', message: e.message }); }
  });

  console.log('[mcp-staff] ativo em /mcp');
  return { enabled: true, resource };
}

module.exports = { mount };
