// =====================================================================
// Musique — API de CONTA (ADR-0011): cadastro, entrada, saída, senha,
// vínculo de professor com a Academia e a vitrine de cursos.
//
// Tudo o que toca a Academia chega por `academia` (injetado):
//   conferirCredencial(email, senha, codigo) → { id } | { precisa_2fa } | null
//   ehProdutor(academiaId) → boolean
//   cursosDeMusica() → [{ titulo, subtitulo, slug, produtor, preco_centavos, ... }]
//   cursoPorSlug(slug) → { titulo, slug } | null
// Sem a injeção, o Musique funciona inteiro — só não mostra cursos nem
// aceita vínculo. Módulo que exige o vizinho para subir derruba o grupo.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const contas = require('./contas');
const { db, nowISO } = require('./db');

const { Contas, Sessoes } = contas;
const ACADEMIA = process.env.ACADEMY_PUBLIC_URL || 'https://academia.villelastay.com.br';
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();

function moldura(titulo, corpo) {
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1F2933">
    <div style="background:#1B2A4A;border-radius:12px 12px 0 0;padding:18px 24px">
      <span style="color:#C9A227;font-weight:800;font-size:1.1rem">Musique</span></div>
    <div style="border:1px solid #E4E7EC;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <h2 style="margin:0 0 12px;color:#1B2A4A">${titulo}</h2>${corpo}
      <p style="color:#5B6478;font-size:.85rem;margin-top:24px">Musique · por Villela Music — uma empresa do Grupo Villela Stay.</p>
    </div></div>`;
}

function registrarRotasContas(app, { jwtSecret, enviarEmail, academia = {}, requireUsuario, requireAuth, requireAdmin }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));
  // E-mail é best-effort: falha de transporte nunca derruba cadastro nem login.
  const mandar = (para, assunto, html) => Promise.resolve().then(() => enviarEmail(para, assunto, html)).catch((e) => console.error('[music/contas] e-mail:', e.message));
  const base = (req) => `${req.headers['x-forwarded-proto'] || req.protocol || 'https'}://${req.get('host')}`;

  // 5 falhas por IP → 15 minutos de espera (mesma régua da Academia). A
  // suíte sobe o teto: ela erra de propósito dezenas de vezes do mesmo IP.
  const LIMITE = Number(process.env.MUSIC_CONTAS_LIMITE) || 5;
  const tentativas = new Map();
  const bloqueado = (ip) => { const t = tentativas.get(ip); return !!(t && t.ate > Date.now()); };
  const falha = (ip) => {
    const t = tentativas.get(ip) || { n: 0, ate: 0 };
    if (++t.n >= LIMITE) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; }
    tentativas.set(ip, t);
    if (tentativas.size > 20000) tentativas.clear();
  };
  const abrirSessao = (req, res, c) => {
    const jti = Sessoes.criar(c.id, { ip: ipDe(req), userAgent: req.headers['user-agent'] });
    db.prepare('UPDATE contas_music SET ultimo_login = ? WHERE id = ?').run(nowISO(), c.id);
    contas.emitir(res, contas.assinar(c.id, jti, jwtSecret));
    return jti;
  };

  app.use('/music/api/conta', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  app.post('/music/api/conta/cadastrar', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
    const d = req.body || {};
    if (!d.aceite_termos) return res.status(400).json({ erro: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.' });
    let c;
    try { c = Contas.criar(d); } catch (e) { falha(ip); throw e; }
    contas.auditar(c.id, 'conta.cadastro', c.email, ip);
    abrirSessao(req, res, c);
    if (typeof enviarEmail === 'function') {
      mandar(c.email, 'Bem-vindo ao Musique', moldura('Sua conta está pronta',
        `<p>Olá, ${esc(c.nome)}! Sua conta do Musique foi criada. Cifras, estudo, setlists e palco em
         <a href="${base(req)}/music/app">${base(req)}/music/app</a>.</p>
         <p style="color:#5B6478;font-size:.9rem">Se não foi você, responda este e-mail.</p>`));
    }
    res.json({ ok: true });
  }));

  app.post('/music/api/conta/entrar', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
    const d = req.body || {};
    const c = Contas.porEmail(d.email);
    if (!c || c.status !== 'ativo' || !Contas.conferirSenha(c, d.senha)) {
      falha(ip);
      contas.auditar(c ? c.id : 'anonimo', 'conta.entrar.falha', s(d.email, 120), ip);
      return res.status(401).json({ erro: 'E-mail ou senha incorretos. A conta do Musique é separada da Academia: se você nunca se cadastrou aqui, use "Criar conta".' });
    }
    tentativas.delete(ip);
    const jti = abrirSessao(req, res, c);
    contas.auditar(c.id, 'conta.entrar', jti, ip);
    res.json({ ok: true });
  }));

  app.post('/music/api/conta/sair', h(async (req, res) => {
    const s0 = contas.criarVerificador({ jwtSecret }).resolver(req);
    if (s0) { Sessoes.revogar(s0.jti); contas.auditar(s0.usuario.id, 'conta.sair', '', ipDe(req)); }
    contas.limpar(res);
    res.json({ ok: true });
  }));

  // Sempre responde igual, exista ou não a conta: sem enumeração de e-mails.
  app.post('/music/api/conta/senha/esquecer', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
    falha(ip);
    const c = Contas.porEmail((req.body || {}).email);
    if (c && c.status === 'ativo' && typeof enviarEmail === 'function') {
      // O hash atual entra no token: usado uma vez, a senha muda e o link morre.
      const tok = jwt.sign({ tipo: 'musique-reset', cid: c.id, h: c.senha_hash.slice(-12) }, jwtSecret, { expiresIn: '30m' });
      mandar(c.email, 'Musique — criar uma senha nova', moldura('Criar uma senha nova',
        `<p>Recebemos um pedido para trocar a senha da sua conta do Musique. O link vale por 30 minutos:</p>
         <p style="margin:20px 0"><a href="${base(req)}/music/redefinir-senha?token=${tok}" style="background:#1B2A4A;color:#fff;font-weight:700;padding:12px 26px;border-radius:24px;text-decoration:none">Criar senha nova</a></p>
         <p style="color:#5B6478;font-size:.9rem">Se não foi você, ignore: a senha continua a mesma.</p>`));
      contas.auditar(c.id, 'conta.senha.esquecer', '', ip);
    }
    res.json({ ok: true });
  }));

  app.post('/music/api/conta/senha/redefinir', h(async (req, res) => {
    let d;
    try { d = jwt.verify(s((req.body || {}).token, 2000), jwtSecret); } catch (_) { return res.status(400).json({ erro: 'Link inválido ou vencido. Peça outro em "Esqueci minha senha".' }); }
    const c = d && d.tipo === 'musique-reset' ? Contas.porId(d.cid) : null;
    if (!c || c.senha_hash.slice(-12) !== d.h) return res.status(400).json({ erro: 'Link já usado ou inválido. Peça outro em "Esqueci minha senha".' });
    Contas.trocarSenha(c.id, (req.body || {}).senha);
    contas.auditar(c.id, 'conta.senha.redefinida', '', ipDe(req));
    res.json({ ok: true });
  }));

  // ---- conta logada ----
  app.get('/music/api/conta', requireUsuario, h(async (req, res) => {
    const c = Contas.porId(req.usuario.id);
    const vinc = c.academia_vinculo;
    res.json({
      conta: { id: c.id, nome: c.nome, email: c.email, telefone: c.telefone, criado_em: c.criado_em },
      academia: {
        disponivel: typeof academia.conferirCredencial === 'function',
        vinculada: !!vinc,
        produtor: !!(vinc && typeof academia.ehProdutor === 'function' && academia.ehProdutor(vinc)),
      },
    });
  }));

  app.patch('/music/api/conta', requireUsuario, h(async (req, res) => {
    const c = Contas.editar(req.usuario.id, req.body || {});
    res.json({ ok: true, conta: Contas.publica(c) });
  }));

  app.post('/music/api/conta/senha', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    if (!Contas.conferirSenha(Contas.porId(req.usuario.id), d.senha_atual)) return res.status(400).json({ erro: 'A senha atual não confere.' });
    Contas.trocarSenha(req.usuario.id, d.senha_nova);        // derruba todas as sessões…
    abrirSessao(req, res, Contas.porId(req.usuario.id));      // …menos esta, que quem trocou continua dentro
    contas.auditar(req.usuario.id, 'conta.senha.trocada', '', ipDe(req));
    res.json({ ok: true });
  }));

  // Vínculo de PROFESSOR: a pessoa prova a conta de produtor da Academia.
  // A senha vai para a Academia conferir e não é guardada aqui.
  app.post('/music/api/conta/vincular-academia', requireUsuario, h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
    if (typeof academia.conferirCredencial !== 'function') return res.status(503).json({ erro: 'Vínculo com a Academia indisponível agora.' });
    const d = req.body || {};
    const a = academia.conferirCredencial(s(d.email, 160), String(d.senha || ''), s(d.codigo, 10));
    if (!a) { falha(ip); return res.status(400).json({ erro: 'E-mail ou senha da Academia não conferem.' }); }
    if (a.precisa_2fa) {
      if (d.codigo) falha(ip);
      return res.status(400).json({ erro: 'Essa conta da Academia usa verificação em duas etapas: informe o código do autenticador.', precisa_2fa: true });
    }
    if (typeof academia.ehProdutor !== 'function' || !academia.ehProdutor(a.id)) {
      return res.status(400).json({ erro: 'Essa conta da Academia não é de produtor aprovado. O vínculo serve só para dar aula no Musique; para estudar, a conta do Musique basta.' });
    }
    Contas.vincularAcademia(req.usuario.id, a.id);
    contas.auditar(req.usuario.id, 'conta.vinculo.academia', a.id, ip);
    res.json({ ok: true });
  }));
  app.delete('/music/api/conta/vincular-academia', requireUsuario, h(async (req, res) => {
    Contas.desvincularAcademia(req.usuario.id);
    contas.auditar(req.usuario.id, 'conta.vinculo.removido', '', ipDe(req));
    res.json({ ok: true });
  }));

  // ---- cursos da Academia (vitrine) — público: a landing também mostra ----
  app.get('/music/api/cursos', h(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    let cursos = [];
    try { cursos = typeof academia.cursosDeMusica === 'function' ? (academia.cursosDeMusica() || []) : []; } catch (_) { cursos = []; }
    res.json({ cursos: cursos.slice(0, 24).map(cursoPublico) });
  }));

  // ---- staff: contas e trilha → curso ----
  if (requireAuth && requireAdmin) {
    app.get('/staff/api/music/contas', requireAuth, h(async (req, res) => {
      res.json({ total: Contas.total(), contas: Contas.listar(req.query) });
    }));
    app.post('/staff/api/music/contas/:id/status', requireAuth, requireAdmin, h(async (req, res) => {
      const c = Contas.mudarStatus(req.params.id, s((req.body || {}).status, 20));
      contas.auditar('staff:' + (req.user && req.user.id), 'conta.status', c.id + ' → ' + c.status, ipDe(req));
      res.json({ ok: true, conta: Contas.publica(c) });
    }));
    app.get('/staff/api/music/trilhas-cursos', requireAuth, h(async (req, res) => {
      let cursos = [];
      try { cursos = typeof academia.cursosDeMusica === 'function' ? (academia.cursosDeMusica() || []).map(cursoPublico) : []; } catch (_) { cursos = []; }
      res.json({
        ligacoes: db.prepare('SELECT * FROM trilha_cursos').all(),
        trilhas: require('./academia').Trilhas.listar().map((t) => ({ id: t.id, titulo: t.titulo, instrumento: t.instrumento || '' })),
        cursos,
      });
    }));
    app.put('/staff/api/music/trilhas-cursos/:trilha', requireAuth, requireAdmin, h(async (req, res) => {
      const slug = s((req.body || {}).curso_slug, 160);
      if (!slug) {
        db.prepare('DELETE FROM trilha_cursos WHERE trilha_id = ?').run(req.params.trilha);
        return res.json({ ok: true, removida: true });
      }
      if (typeof academia.cursoPorSlug === 'function' && !academia.cursoPorSlug(slug)) {
        throw new Error('Não há curso PUBLICADO na Academia com esse endereço.');
      }
      db.prepare(`INSERT INTO trilha_cursos (trilha_id, curso_slug, atualizado_em, por) VALUES (?, ?, ?, ?)
        ON CONFLICT(trilha_id) DO UPDATE SET curso_slug = excluded.curso_slug, atualizado_em = excluded.atualizado_em, por = excluded.por`)
        .run(req.params.trilha, slug, nowISO(), s(req.user && req.user.id, 80));
      res.json({ ok: true });
    }));
  }

  /** Curso ligado a uma trilha, já pronto para a tela (ou null). Só
   *  aparece se o curso continua publicado — link para curso retirado
   *  seria um 404 dentro do estudo. */
  function cursoDaTrilha(trilhaId) {
    const l = db.prepare('SELECT curso_slug FROM trilha_cursos WHERE trilha_id = ?').get(trilhaId);
    if (!l) return null;
    let c = null;
    try { c = typeof academia.cursoPorSlug === 'function' ? academia.cursoPorSlug(l.curso_slug) : null; } catch (_) { c = null; }
    return c ? cursoPublico(c) : null;
  }
  return { cursoDaTrilha };
}

const cursoPublico = (c) => ({
  titulo: s(c.titulo, 160), subtitulo: s(c.subtitulo || c.descricao_curta, 240), slug: s(c.slug, 160),
  produtor: s(c.produtor_nome, 120), preco_centavos: c.preco_promo_centavos || c.preco_centavos || 0,
  // Endereço ABSOLUTO: no host do Musique, /academy/... seria redirecionado
  // para /music/academy/... (o redirect de subdomínio prefixa tudo) e daria 404.
  url: ACADEMIA + '/academy/cursos/' + encodeURIComponent(s(c.slug, 160)),
});
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = { registrarRotasContas };
