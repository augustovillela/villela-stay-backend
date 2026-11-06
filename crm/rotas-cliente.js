// =====================================================================
// Villela CRM — API do ASSINANTE (conta/sessão), cookie `crm_sess`
// restrito ao path /crm. Isolado do Portal Staff e dos demais SaaS.
// Aqui: login/senha/me, equipe (papéis), cobrança e tickets. O CRM em si
// (contatos/funis/etc.) vive em rotas-app.js.
// =====================================================================
'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, nowISO } = require('./db');
const repo = require('./repo');
const billing = require('./billing');

const COOKIE = 'crm_sess';
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

// Impressão da senha atual: entra no link de redefinição e na sessão. Trocar a
// senha muda a impressão, então o link vira de uso único e as demais sessões caem.
const impressao = (hash) => crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);
const SENHA_MIN = 8;

function registrarRotasCliente(app, { jwtSecret, enviarEmail }) {
  const seguro = process.env.NODE_ENV !== 'development';
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  // rate limit login
  const tentativas = new Map();
  const bloqueado = (ip) => { const t = tentativas.get(ip); return !!(t && t.ate && t.ate > Date.now()); };
  const falha = (ip) => { const t = tentativas.get(ip) || { n: 0, ate: 0 }; if (++t.n >= 5) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; } tentativas.set(ip, t); };

  function requireAssinante(req, res, next) {
    try {
      const { uid, fp } = jwt.verify(req.cookies && req.cookies[COOKIE], jwtSecret);
      const u = db.prepare('SELECT u.*, t.nome AS tenant_nome, t.status AS tenant_status, t.slug AS tenant_slug FROM tenant_users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ? AND u.ativo = 1').get(uid);
      if (!u) throw new Error('x');
      // sessão aberta com outra senha não vale mais (sessões antigas, sem `fp`, seguem até expirar)
      if (fp && fp !== impressao(u.senha_hash)) throw new Error('x');
      req.assinante = u;
      next();
    } catch (_) { res.status(401).json({ erro: 'não autenticado' }); }
  }
  // exige que o papel do usuário possa executar a ação (validação no backend)
  const requirePapel = (acao) => (req, res, next) => repo.podePapel(req.assinante.papel, acao) ? next()
    : res.status(403).json({ erro: `Seu papel (${req.assinante.papel}) não permite esta ação.` });

  app.use('/crm/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // Abre a sessão de verdade. Um só lugar cria o cookie — com ou sem MFA.
  const abrirSessao = (res, u, { contaLogin = true } = {}) => {
    if (contaLogin) db.prepare('UPDATE tenant_users SET ultimo_login = ? WHERE id = ?').run(nowISO(), u.id);
    const token = jwt.sign({ uid: u.id, fp: impressao(u.senha_hash) }, jwtSecret, { expiresIn: '30d' });
    res.cookie(COOKIE, token, { httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/crm' });
    res.json({ ok: true });
  };

  /**
   * Segundo fator (Villela Growth OS). `require` tardio de propósito: o
   * módulo growth já depende de `crm/db`, e exigi-lo no topo daqui fecharia
   * um ciclo. Em tempo de requisição tudo já está carregado.
   * Se o módulo não estiver montado, o login segue sem MFA em vez de cair.
   */
  const mfaDe = (u) => {
    if (!u.mfa_ativo) return null;
    try {
      const growth = require('../growth');
      return { mfa: require('../growth/mfa'), comTenant: growth.tenancy.comTenant };
    } catch (_) { return null; }
  };

  app.post('/crm/api/login', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    const email = s((req.body || {}).email, 120).toLowerCase();
    const u = db.prepare('SELECT * FROM tenant_users WHERE lower(email) = ? AND ativo = 1').get(email);
    if (!u || !u.senha_hash || !bcrypt.compareSync(String((req.body || {}).senha || ''), u.senha_hash)) {
      falha(ip); return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }
    tentativas.delete(ip);

    // senha certa + MFA ligado = ainda NÃO é sessão: é um desafio de 5 min
    if (mfaDe(u)) {
      const desafio = jwt.sign({ uid: u.id, tipo: 'crm-mfa' }, jwtSecret, { expiresIn: '5m' });
      return res.json({ ok: false, mfa: true, desafio });
    }
    abrirSessao(res, u);
  }));

  app.post('/crm/api/login/mfa', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    let dec;
    try { dec = jwt.verify(s((req.body || {}).desafio, 4000), jwtSecret); } catch (_) { return res.status(401).json({ erro: 'Desafio expirado. Entre de novo.' }); }
    if (dec.tipo !== 'crm-mfa') return res.status(400).json({ erro: 'Desafio inválido.' });

    const u = db.prepare('SELECT * FROM tenant_users WHERE id = ? AND ativo = 1').get(dec.uid);
    if (!u) return res.status(401).json({ erro: 'Usuário inativo.' });
    const dep = mfaDe(u);
    if (!dep) return res.status(409).json({ erro: 'Este usuário não tem segundo fator ativo.' });

    const r = dep.comTenant({ tenantId: u.tenant_id, userId: u.id }, () =>
      dep.mfa.verificarLogin({ userId: u.id, codigo: s((req.body || {}).codigo, 40) }));
    // código errado conta como tentativa: senão o segundo fator vira só
    // um campo a mais para tentar à vontade
    if (!r.ok) { falha(ip); return res.status(401).json({ erro: 'Código incorreto ou já usado.' }); }
    tentativas.delete(ip);
    abrirSessao(res, u);
  }));
  app.post('/crm/api/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/crm' }); res.json({ ok: true }); });

  app.post('/crm/api/definir-senha', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    let dec; try { dec = jwt.verify(s((req.body || {}).token, 4000), jwtSecret); } catch (_) { falha(ip); return res.status(400).json({ erro: 'Link inválido ou expirado.' }); }
    if (dec.tipo !== 'crm-setup') return res.status(400).json({ erro: 'Link inválido.' });
    if (String((req.body || {}).senha || '').length < 8) return res.status(400).json({ erro: 'A senha precisa de 8+ caracteres.' });
    db.prepare('UPDATE tenant_users SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(req.body.senha), 10), dec.uid);
    res.json({ ok: true });
  }));

  // ---- esqueci minha senha: link por e-mail, 1h, uso único ----
  // Resposta é SEMPRE a mesma, exista a conta ou não (não revela quem é cliente).
  const pedidos = new Map(); // chave (ip ou e-mail) -> { n, desde }
  const pedidoDemais = (chave) => {
    const agora = Date.now(); const p = pedidos.get(chave);
    if (!p || agora - p.desde > 15 * 60 * 1000) { pedidos.set(chave, { n: 1, desde: agora }); return false; }
    return ++p.n > 5;
  };
  // Em produção o link NUNCA nasce do cabeçalho Host (envenenaria o e-mail de reset).
  const baseDoLink = (req) => process.env.CRM_BASE_URL
    || (process.env.NODE_ENV === 'development' ? `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}` : 'https://crm.villelastay.com.br');
  const RESPOSTA_ESQUECI = { ok: true, mensagem: 'Se este e-mail tiver conta, enviamos um link para criar uma nova senha. Ele vale por 1 hora.' };

  app.post('/crm/api/esqueci-senha', h(async (req, res) => {
    const email = s((req.body || {}).email, 120).toLowerCase();
    if (pedidoDemais('ip:' + ipDe(req)) || (email && pedidoDemais('em:' + email))) return res.status(429).json({ erro: 'Muitos pedidos. Tente em 15 minutos.' });
    const u = email ? db.prepare('SELECT * FROM tenant_users WHERE lower(email) = ? AND ativo = 1').get(email) : null;
    if (u && enviarEmail) {
      const token = jwt.sign({ tipo: 'crm-reset', uid: u.id, fp: impressao(u.senha_hash) }, jwtSecret, { expiresIn: '1h' });
      const link = `${baseDoLink(req)}/crm/redefinir-senha?token=${token}`;
      enviarEmail(u.email, 'Villela CRM — redefinir sua senha',
        `<p>Recebemos um pedido para redefinir a senha da sua conta no Villela CRM.</p><p><a href="${link}">Criar uma nova senha</a> (o link vale por 1 hora e só pode ser usado uma vez).</p><p>Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`).catch(() => {});
    }
    res.json(RESPOSTA_ESQUECI);
  }));

  app.post('/crm/api/redefinir-senha', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    let dec; try { dec = jwt.verify(s((req.body || {}).token, 4000), jwtSecret); } catch (_) { falha(ip); return res.status(400).json({ erro: 'Link inválido ou expirado. Peça um novo em "Esqueci minha senha".' }); }
    if (dec.tipo !== 'crm-reset') { falha(ip); return res.status(400).json({ erro: 'Link inválido.' }); }
    const u = db.prepare('SELECT * FROM tenant_users WHERE id = ? AND ativo = 1').get(dec.uid);
    if (!u || dec.fp !== impressao(u.senha_hash)) return res.status(400).json({ erro: 'Este link já foi usado ou perdeu a validade. Peça um novo em "Esqueci minha senha".' });
    const nova = String((req.body || {}).senha || '');
    if (nova.length < SENHA_MIN) return res.status(400).json({ erro: `A senha precisa de ${SENHA_MIN}+ caracteres.` });
    db.prepare('UPDATE tenant_users SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(nova, 10), u.id);
    res.json({ ok: true }); // não abre sessão: a pessoa entra com a senha nova (e o 2º fator, se tiver)
  }));

  // ---- trocar senha (logado): exige a senha atual ----
  app.post('/crm/api/trocar-senha', requireAssinante, h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente em 15 minutos.' });
    const atual = String((req.body || {}).senha_atual || '');
    const nova = String((req.body || {}).nova_senha || '');
    const u = db.prepare('SELECT * FROM tenant_users WHERE id = ? AND ativo = 1').get(req.assinante.id);
    if (!u || !u.senha_hash || !bcrypt.compareSync(atual, u.senha_hash)) { falha(ip); return res.status(400).json({ erro: 'A senha atual está incorreta.' }); } // 400, não 401: o painel trata 401 como sessão expirada
    if (nova.length < SENHA_MIN) return res.status(400).json({ erro: `A nova senha precisa de ${SENHA_MIN}+ caracteres.` });
    if (nova === atual) return res.status(400).json({ erro: 'A nova senha precisa ser diferente da atual.' });
    tentativas.delete(ip);
    db.prepare('UPDATE tenant_users SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(nova, 10), u.id);
    // derruba as outras sessões (mudou a impressão) e mantém esta aberta
    abrirSessao(res, db.prepare('SELECT * FROM tenant_users WHERE id = ?').get(u.id), { contaLogin: false });
  }));

  app.get('/crm/api/me', requireAssinante, h(async (req, res) => {
    const t = repo.Tenants.obter(req.assinante.tenant_id);
    res.json({
      usuario: { id: req.assinante.id, nome: req.assinante.nome, email: req.assinante.email, papel: req.assinante.papel },
      empresa: { nome: t.nome, status: t.status, slug: t.slug },
      entitlements: t.entitlements,
      uso: repo.Uso.doTenant(t.id),
    });
  }));

  // ---- equipe (usuários da empresa, com papéis) ----
  app.get('/crm/api/equipe', requireAssinante, h(async (req, res) => {
    res.json({ usuarios: repo.Tenants.obter(req.assinante.tenant_id).usuarios, papeis: repo.PAPEIS });
  }));
  app.post('/crm/api/equipe', requireAssinante, requirePapel('gerir_conta'), h(async (req, res) => {
    const uid = repo.Tenants.addUsuario(req.assinante.tenant_id, req.body || {}, req.assinante.email);
    // link de definição de senha para o novo usuário
    const token = jwt.sign({ tipo: 'crm-setup', uid }, jwtSecret, { expiresIn: '7d' });
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    res.json({ ok: true, id: uid, link_setup: `${proto}://${req.get('host')}/crm/definir-senha?token=${token}` });
  }));
  app.patch('/crm/api/equipe/:id', requireAssinante, requirePapel('gerir_conta'), h(async (req, res) => {
    repo.Tenants.mudarUsuario(req.assinante.tenant_id, req.params.id, req.body || {}, req.assinante.email);
    res.json({ ok: true });
  }));

  // ---- cobrança / plano (self-service) ----
  app.get('/crm/api/cobranca', requireAssinante, h(async (req, res) => res.json(billing.estado(req.assinante.tenant_id))));
  app.post('/crm/api/cobranca/assinar', requireAssinante, requirePapel('gerir_conta'), h(async (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const r = await billing.assinar(req.assinante.tenant_id, s((req.body || {}).plano, 60), req.assinante.email, `${proto}://${req.get('host')}`, ipDe(req), s((req.body || {}).ciclo, 10) || 'mensal');
    res.json({ ok: true, ...r });
  }));
  app.post('/crm/api/cobranca/cancelar', requireAssinante, requirePapel('gerir_conta'), h(async (req, res) => {
    res.json(await billing.cancelarAssinatura(req.assinante.tenant_id, req.assinante.email, ipDe(req)));
  }));

  // ---- suporte / tickets ----
  app.get('/crm/api/tickets', requireAssinante, h(async (req, res) => res.json({ tickets: repo.Tickets.listar({ tenant_id: req.assinante.tenant_id }) })));
  app.get('/crm/api/tickets/:id', requireAssinante, h(async (req, res) => {
    const t = repo.Tickets.obter(req.params.id);
    if (!t || t.tenant_id !== req.assinante.tenant_id) return res.status(404).json({ erro: 'Ticket não encontrado.' });
    res.json({ ticket: t });
  }));
  app.post('/crm/api/tickets', requireAssinante, h(async (req, res) => res.json({ ok: true, id: repo.Tickets.abrir(req.assinante.tenant_id, req.body || {}, req.assinante.email) })));
  app.post('/crm/api/tickets/:id/responder', requireAssinante, h(async (req, res) => {
    const t = repo.Tickets.obter(req.params.id);
    if (!t || t.tenant_id !== req.assinante.tenant_id) return res.status(404).json({ erro: 'Ticket não encontrado.' });
    repo.Tickets.responder(req.params.id, { texto: s((req.body || {}).texto, 4000), lado: 'cliente', autor: req.assinante.email });
    res.json({ ok: true });
  }));

  return { requireAssinante, requirePapel, COOKIE };
}

module.exports = { registrarRotasCliente, COOKIE };
