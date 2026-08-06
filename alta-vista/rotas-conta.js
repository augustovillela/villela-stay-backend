// =====================================================================
// Villela Alta Vista 360 — conta do CLIENTE (cadastro, login, sessão).
// Cookie 'av_sess' com path /alta-vista (o path isola a sessão dos outros
// produtos — padrão closet/vdocs). JWT assinado com o JWT_SECRET global.
// Rate limit 5 falhas/IP → 15 min. Reset de senha por JWT curto de 2 h com
// resposta neutra (não revela se o e-mail existe).
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const { Clientes, s } = repo;

const COOKIE = 'av_sess';
const DIAS_SESSAO = 60;

// rate limit de login em memória (5 falhas por IP → 15 min)
const _falhas = new Map();
function bloqueado(ip) {
  const r = _falhas.get(ip);
  return !!(r && r.ate > Date.now());
}
function registraFalha(ip) {
  const r = _falhas.get(ip) || { n: 0, ate: 0 };
  r.n += 1;
  if (r.n >= 5) { r.ate = Date.now() + 15 * 60 * 1000; r.n = 0; }
  _falhas.set(ip, r);
}
const limpaFalhas = (ip) => _falhas.delete(ip);
const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function registrarRotasConta(app, { jwtSecret, enviarEmail = null, baseUrl = '' }) {
  const setSessao = (res, uid) => {
    const tok = jwt.sign({ uid }, jwtSecret, { expiresIn: DIAS_SESSAO + 'd' });
    res.cookie(COOKIE, tok, {
      httpOnly: true, sameSite: 'lax', path: '/alta-vista',
      secure: process.env.NODE_ENV !== 'development',
      maxAge: DIAS_SESSAO * 24 * 3600 * 1000,
    });
  };

  const clienteDe = (req) => {
    const tok = req.cookies && req.cookies[COOKIE];
    if (!tok) return null;
    let uid;
    try { ({ uid } = jwt.verify(tok, jwtSecret)); } catch (_) { return null; }
    const c = Clientes.obter(uid);
    return c && c.status === 'ativo' ? c : null;
  };

  const requireCliente = (req, res, next) => {
    const c = clienteDe(req);
    if (!c) return res.status(401).json({ erro: 'não autenticado' });
    req.cliente = c;
    next();
  };

  app.post('/alta-vista/api/conta/criar', (req, res) => {
    const d = req.body || {};
    if (s(d.website, 200)) return res.json({ ok: true }); // honeypot
    try {
      const c = Clientes.criar({ nome: d.nome, email: d.email, senha: d.senha, whatsapp: d.whatsapp, aceite_termos: !!d.aceite_termos });
      setSessao(res, c.id);
      res.json({ ok: true, cliente: c });
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });

  app.post('/alta-vista/api/conta/entrar', (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
    const d = req.body || {};
    const c = Clientes.autenticar(d.email, d.senha);
    if (!c) { registraFalha(ip); return res.status(401).json({ erro: 'E-mail ou senha incorretos.' }); }
    limpaFalhas(ip);
    setSessao(res, c.id);
    res.json({ ok: true, cliente: c });
  });

  app.post('/alta-vista/api/conta/sair', (req, res) => {
    res.clearCookie(COOKIE, { path: '/alta-vista' });
    res.json({ ok: true });
  });

  // esqueci a senha: resposta SEMPRE neutra (não confirma se o e-mail existe)
  app.post('/alta-vista/api/conta/esqueci', async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
    const email = s((req.body || {}).email, 200).toLowerCase();
    const c = Clientes.porEmail(email);
    if (c && c.status === 'ativo' && typeof enviarEmail === 'function') {
      const tok = jwt.sign({ tipo: 'av-senha', uid: c.id }, jwtSecret, { expiresIn: '2h' });
      const link = `${baseUrl}/alta-vista/definir-senha?token=${tok}`;
      await enviarEmail(email, 'Definir senha — Villela Alta Vista 360',
        `<p>Olá, ${c.nome}!</p><p>Para ${c.senha_hash ? 'redefinir' : 'criar'} sua senha na Villela Alta Vista 360, use o link abaixo (vale por 2 horas):</p>
         <p><a href="${link}">Definir minha senha</a></p>
         <p>Se você não pediu isso, ignore este e-mail.</p>`).catch(() => {});
    }
    res.json({ ok: true, msg: 'Se este e-mail tiver conta, o link de definição de senha chega em instantes.' });
  });

  app.post('/alta-vista/api/conta/definir-senha', (req, res) => {
    const d = req.body || {};
    let dados;
    try { dados = jwt.verify(s(d.token, 800), jwtSecret); } catch (_) { return res.status(400).json({ erro: 'Link inválido ou vencido. Peça um novo em "esqueci a senha".' }); }
    if (dados.tipo !== 'av-senha') return res.status(400).json({ erro: 'Link inválido.' });
    try {
      Clientes.definirSenha(dados.uid, d.senha);
      setSessao(res, dados.uid);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });

  return { requireCliente, clienteDe, COOKIE };
}

module.exports = { registrarRotasConta };
