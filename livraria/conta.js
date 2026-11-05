// =====================================================================
// Livraria Villela — CONTA DO LEITOR (05/11/2026)
//
// POR QUE EXISTE
//   A loja nasceu sem login: o "cliente" era só um cadastro criado no checkout e o
//   acesso à biblioteca era por link de pedido. O leitor não conseguia ver o
//   histórico, corrigir dados, nem exercer os direitos da LGPD sozinho.
//
// SÓ CÓDIGO POR E-MAIL (decisão do Augusto, 05/11/2026 — sem senha)
//   O leitor informa o e-mail, recebe um código de 6 dígitos e entra. Serve para
//   criar a conta e para entrar de novo. Não há senha para esquecer, vazar ou
//   reaproveitar de outro site; o e-mail JÁ é a prova de identidade. (A coluna
//   `customers.senha_hash` ficou na tabela, sem uso, e a exclusão a zera.)
//
// REGRAS QUE NÃO SE QUEBRAM
//   - Conta é INDEPENDENTE da Academia, do Musique e do Portal Staff: cookie e
//     tabelas próprias. Sessão de um não abre o outro.
//   - O cadastro de `customers` já existe (nasce no checkout, com qualquer e-mail
//     que a pessoa digitar). Por isso NADA se abre sem o código: quem digitou o
//     e-mail alheio numa compra não enxerga os pedidos do dono.
//   - Nenhuma resposta revela se um e-mail tem conta (cadastro e pedido de código
//     respondem igual).
//   - Como a SESSÃO é a única credencial, trocar o e-mail e excluir a conta exigem
//     código novo, e a troca avisa o e-mail antigo.
//   - Exclusão = ANONIMIZAÇÃO. O pedido pago fica (obrigação fiscal e de defesa em
//     juízo), sem nome, e-mail, telefone, CPF nem endereço.
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const { db, transacao, nowISO, novoId, j } = require('./db');
const emails = require('./emails');

const COOKIE = 'livraria_sess';
const DIAS_SESSAO = 30;
const COD_MINUTOS = 10;
const COD_TENTATIVAS = 5;

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const normEmail = (e) => s(e, 160).toLowerCase();
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160;
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
const iguais = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---- limitador em memória (por processo; o Render tem 1 instância) -------------
const janelas = new Map();
function limitar(chave, max, ms) {
  const agora = Date.now();
  const lista = (janelas.get(chave) || []).filter((t) => agora - t < ms);
  if (lista.length >= max) { janelas.set(chave, lista); return true; }
  lista.push(agora); janelas.set(chave, lista);
  if (janelas.size > 20000) janelas.clear();
  return false;
}

// ---- cookie ---------------------------------------------------------------------
function lerCookie(req, nome) {
  const h = String(req.headers.cookie || '');
  for (const par of h.split(';')) {
    const i = par.indexOf('=');
    if (i > 0 && par.slice(0, i).trim() === nome) { try { return decodeURIComponent(par.slice(i + 1).trim()); } catch (_) { return ''; } }
  }
  return '';
}

// ---- cliente (linha completa) ---------------------------------------------------
const cruCliente = (id) => db.prepare('SELECT * FROM customers WHERE id = ?').get(id) || null;
const cruPorEmail = (email) => db.prepare('SELECT * FROM customers WHERE email = ? ORDER BY created_at LIMIT 1').get(normEmail(email)) || null;

function perfil(c) {
  if (!c) return null;
  const cons = j.parse(c.consentimentos, {});
  return {
    nome: c.nome, email: c.email, whatsapp: c.whatsapp || '', doc: c.doc || '', pais: c.pais || 'BR',
    estado: c.estado || '', cidade: c.cidade || '', endereco: j.parse(c.endereco, {}),
    marketing: !!cons.marketing, email_verificado: !!c.email_verificado,
    conta_criada_em: c.conta_criada_em || null, ultimo_login: c.ultimo_login || null,
  };
}

// ---- sessões --------------------------------------------------------------------
const Sessoes = {
  criar(customerId, req) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO conta_sessoes (id, customer_id, criada_em, expira_em, ip, user_agent) VALUES (?,?,?,?,?,?)')
      .run(sha(token), customerId, nowISO(), new Date(Date.now() + DIAS_SESSAO * 864e5).toISOString(), s(req.ip, 60), s(req.headers['user-agent'], 200));
    db.prepare('UPDATE customers SET ultimo_login = ? WHERE id = ?').run(nowISO(), customerId);
    return token;
  },
  daRequisicao(req) {
    const token = lerCookie(req, COOKIE);
    if (!token) return null;
    const x = db.prepare('SELECT * FROM conta_sessoes WHERE id = ?').get(sha(token));
    if (!x || x.revogada || x.expira_em <= nowISO()) return null;
    const c = cruCliente(x.customer_id);
    if (!c || c.excluido_em || !c.email_verificado) return null;
    return { sessaoId: x.id, cliente: c };
  },
  revogar: (id) => db.prepare('UPDATE conta_sessoes SET revogada = 1 WHERE id = ?').run(id),
  revogarDaConta: (customerId, exceto = null) =>
    db.prepare('UPDATE conta_sessoes SET revogada = 1 WHERE customer_id = ? AND id != ?').run(customerId, exceto || ''),
};

// ---- códigos por e-mail ---------------------------------------------------------
const Codigos = {
  /** Gera (e invalida os anteriores da mesma finalidade). `null` = recusado por excesso de pedidos. */
  gerar({ email, finalidade, customerId = null, dados = {} }) {
    email = normEmail(email);
    const ult = db.prepare('SELECT criado_em FROM conta_codigos WHERE email = ? AND finalidade = ? ORDER BY criado_em DESC LIMIT 1').get(email, finalidade);
    if (ult && Date.now() - Date.parse(ult.criado_em) < 45 * 1000) return null;          // reenvio: 45 s
    const hora = db.prepare('SELECT COUNT(*) n FROM conta_codigos WHERE email = ? AND criado_em > ?').get(email, new Date(Date.now() - 3600e3).toISOString()).n;
    if (hora >= 6) return null;                                                          // 6 códigos/h por e-mail
    db.prepare('UPDATE conta_codigos SET usado = 1 WHERE email = ? AND finalidade = ? AND usado = 0').run(email, finalidade);
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const id = novoId();
    db.prepare(`INSERT INTO conta_codigos (id,email,finalidade,customer_id,codigo_hash,dados,expira_em,criado_em) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, email, finalidade, customerId, sha(id + ':' + codigo), j.str(dados), new Date(Date.now() + COD_MINUTOS * 60e3).toISOString(), nowISO());
    return codigo;
  },
  /** Confere o código mais recente ainda aberto. Devolve a linha (com `dados` já lido) ou null. */
  conferir({ email, finalidade, codigo }) {
    email = normEmail(email);
    const x = db.prepare('SELECT * FROM conta_codigos WHERE email = ? AND finalidade = ? AND usado = 0 ORDER BY criado_em DESC LIMIT 1').get(email, finalidade);
    if (!x || x.expira_em <= nowISO()) return null;
    const limpo = String(codigo || '').replace(/\D/g, '');
    if (limpo.length !== 6) return null;
    if (x.tentativas >= COD_TENTATIVAS) return null;
    db.prepare('UPDATE conta_codigos SET tentativas = tentativas + 1 WHERE id = ?').run(x.id);
    if (!iguais(sha(x.id + ':' + limpo), x.codigo_hash)) {
      if (x.tentativas + 1 >= COD_TENTATIVAS) db.prepare('UPDATE conta_codigos SET usado = 1 WHERE id = ?').run(x.id);
      return null;
    }
    db.prepare('UPDATE conta_codigos SET usado = 1 WHERE id = ?').run(x.id);
    return { ...x, dados: j.parse(x.dados, {}) };
  },
};

// ---- pedidos do leitor ----------------------------------------------------------
const ROTULO_PEDIDO = { pendente: 'Aguardando pagamento', pago: 'Pago', recusado: 'Pagamento recusado', cancelado: 'Cancelado', reembolsado: 'Reembolsado' };
const ROTULO_IMPRESSO = {
  aguardando_producao: 'Na fila de produção', enviado_grafica: 'Enviado à gráfica', em_producao: 'Em produção',
  enviado: 'Enviado pelos Correios', entregue: 'Entregue', cancelado: 'Cancelado',
};

function pedidosDe(customerId) {
  const linhas = db.prepare('SELECT id FROM orders WHERE customer_id = ? AND teste = 0 ORDER BY created_at DESC LIMIT 200').all(customerId);
  return linhas.map(({ id }) => {
    const o = repo.Orders.obter(id);
    const tokens = repo.Tokens.daOrder(o.id);
    const jobs = repo.Print.daOrder(o.id);
    const pago = o.status === 'pago';
    const itens = (o.itens || []).map((it) => {
      const livro = repo.Books.obter(it.book_id);
      const temPdf = it.tipo === 'pdf' || it.tipo === 'combo';
      let download = null, novoLink = false;
      if (pago && temPdf) {
        const valido = tokens.filter((t) => t.book_id === it.book_id).find((t) => repo.Tokens.validar(t.id).ok);
        if (valido) download = '/download/' + valido.id; else novoLink = true;
      }
      return { titulo: it.titulo_snapshot, tipo: it.tipo, quantidade: it.quantidade, slug: livro ? livro.slug : '', download, novo_link: novoLink };
    });
    const impressos = jobs.map((jb) => {
      const livro = repo.Books.obter(jb.book_id);
      return { titulo: livro ? livro.titulo : '', status: jb.status, rotulo: ROTULO_IMPRESSO[jb.status] || jb.status, rastreio: jb.rastreio || '', previsao: jb.previsao || '' };
    });
    return {
      id: o.id, criado_em: o.created_at, pago_em: o.pago_em || null, status: o.status, rotulo: ROTULO_PEDIDO[o.status] || o.status,
      valor_total: o.valor_total, valor_texto: repo.brl(o.valor_total), cupom: o.cupom_codigo || '', itens, impressos,
    };
  });
}

// ---- exportação e exclusão (LGPD) -------------------------------------------------
function exportarDados(c) {
  const pedidos = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at').all(c.id).map((o) => ({
    id: o.id, criado_em: o.created_at, status: o.status, valor_total_centavos: o.valor_total, desconto_centavos: o.desconto,
    cupom: o.cupom_codigo, endereco_entrega: j.parse(o.endereco_entrega, {}),
    itens: db.prepare('SELECT titulo_snapshot titulo, tipo, quantidade, preco_unit preco_unitario_centavos FROM order_items WHERE order_id = ?').all(o.id),
    pagamentos: db.prepare('SELECT metodo, status, valor valor_centavos, created_at FROM payments WHERE order_id = ?').all(o.id),
    impressao: db.prepare('SELECT book_id, status, rastreio, previsao FROM print_jobs WHERE order_id = ?').all(o.id),
    downloads: db.prepare('SELECT created_at, resultado FROM download_logs WHERE order_id = ? ORDER BY created_at').all(o.id),
  }));
  return {
    gerado_em: nowISO(),
    aviso: 'Cópia dos dados pessoais da sua conta na Livraria Villela (LGPD, art. 18). Valores em centavos.',
    controlador: 'Augusto Villela Ltda — CNPJ 56.776.526/0001-12',
    cadastro: {
      nome: c.nome, email: c.email, whatsapp: c.whatsapp, cpf_cnpj: c.doc, pais: c.pais, estado: c.estado, cidade: c.cidade,
      endereco: j.parse(c.endereco, {}), consentimentos: j.parse(c.consentimentos, {}),
      cadastro_criado_em: c.created_at, conta_criada_em: c.conta_criada_em, ultimo_login: c.ultimo_login,
    },
    pedidos,
  };
}

/** Texto do que impede a exclusão agora (ou null). Conferido ANTES de gastar o código do leitor. */
function impedimentoExclusao(c) {
  const impressoAberto = db.prepare(`SELECT COUNT(*) n FROM print_jobs p JOIN orders o ON o.id = p.order_id
    WHERE o.customer_id = ? AND p.status NOT IN ('entregue','cancelado')`).get(c.id).n;
  if (impressoAberto) return 'Há um livro impresso seu em produção ou a caminho. Para excluir a conta é preciso esperar a entrega — ou falar com o suporte.';
  const recente = db.prepare(`SELECT COUNT(*) n FROM orders WHERE customer_id = ? AND status = 'pendente' AND created_at > ?`)
    .get(c.id, new Date(Date.now() - 48 * 3600e3).toISOString()).n;
  if (recente) return 'Há um pedido aguardando pagamento. Conclua ou cancele o pedido antes de excluir a conta.';
  return null;
}

/** Anonimiza a conta. Devolve { ok } ou { erro } quando há algo em andamento que impede. */
function excluirConta(c) {
  const impedimento = impedimentoExclusao(c);
  if (impedimento) return { erro: impedimento };
  const emailAntigo = c.email;
  transacao(() => {
    db.prepare(`UPDATE customers SET nome = 'Conta excluída', email = ?, whatsapp = '', doc = '', estado = '', cidade = '',
      endereco = '{}', observacoes = '', senha_hash = NULL, email_verificado = 0, consentimentos = ?, excluido_em = ?, updated_at = ?
      WHERE id = ?`).run(`excluido+${c.id}@invalido.local`, j.str({ excluido: true }), nowISO(), nowISO(), c.id);
    db.prepare(`UPDATE orders SET endereco_entrega = '{}', updated_at = ? WHERE customer_id = ?`).run(nowISO(), c.id);
    db.prepare(`UPDATE payments SET raw = '{}' WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ?)`).run(c.id);
    db.prepare(`UPDATE download_tokens SET ativo = 0, updated_at = ? WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ?)`).run(nowISO(), c.id);
    db.prepare(`UPDATE download_logs SET ip = '', user_agent = '' WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ?)`).run(c.id);
    db.prepare(`UPDATE notification_logs SET destino = '[excluído]' WHERE destino = ?`).run(emailAntigo);
    db.prepare('DELETE FROM conta_sessoes WHERE customer_id = ?').run(c.id);
    db.prepare('DELETE FROM conta_codigos WHERE email = ?').run(emailAntigo);
    repo.Audit.log({ id: 'leitor', nome: 'Leitor (autoatendimento)' }, 'conta.excluir', { entidade: 'customer', entidade_id: c.id, detalhe: 'anonimizada a pedido do titular' });
  });
  return { ok: true, emailAntigo, nome: c.nome };
}

// ---- rotas ------------------------------------------------------------------------
function registrarConta(app, deps) {
  const { enviarEmail = async () => false, urls } = deps;
  const BASE = '/livraria/api/conta';
  const producao = process.env.NODE_ENV === 'production';

  const opcoesCookie = (req) => ({ httpOnly: true, sameSite: 'lax', secure: producao || !!req.secure, path: '/', maxAge: DIAS_SESSAO * 864e5 });
  const abrirSessao = (req, res, customerId) => res.cookie(COOKIE, Sessoes.criar(customerId, req), opcoesCookie(req));
  const fecharCookie = (req, res) => res.clearCookie(COOKIE, { ...opcoesCookie(req), maxAge: undefined });

  async function mandarCodigo({ email, finalidade, nome, customerId, dados }) {
    const codigo = Codigos.gerar({ email, finalidade, customerId, dados });
    if (!codigo) return false;
    const t = emails.codigoAcesso({ nome, codigo, finalidade, minutos: COD_MINUTOS });
    let ok = false;
    try { ok = await enviarEmail(email, t.assunto, t.html); } catch (e) { console.error('[livraria/conta] e-mail:', e.message); }
    repo.Notif.log('email', { destino: email, assunto: 'codigo-' + finalidade, status: ok ? 'enviado' : 'falha' });
    return ok;
  }

  // ---------- páginas ----------
  const storefront = require('./storefront');
  const fs = require('fs');
  const path = require('path');
  const CSS_CONTA = `
.mc-wrap{max-width:760px;margin:0 auto;padding:30px 20px 50px}
.mc-caixa{max-width:460px;margin:0 auto}
.mc-caixa h1,.mc-topo h1{margin:0 0 6px}
.mc-topo{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
.mc-links{margin:14px 0;font-size:15px}.mc-hr{border:0;border-top:1px solid #e2e6ec;margin:22px 0}
.mc-peq{font-size:13px}.mc-aviso{margin:12px 0;padding:10px 14px;border-radius:8px}
.mc-aviso.erro{background:#fdecec;color:#8a1c1c;border:1px solid #f3c2c2}.mc-aviso.ok{background:#eaf6ec;color:#1f5d2b;border:1px solid #bfe0c5}
.mc-chk{display:flex;gap:8px;align-items:flex-start;margin:10px 0;font-size:14px;line-height:1.4}.mc-chk input{margin-top:3px}
.mc-cod{font-size:26px;letter-spacing:8px;text-align:center;font-family:'Courier New',monospace}
.mc-abas{display:flex;gap:4px;border-bottom:2px solid #e2e6ec;margin:16px 0 20px;overflow-x:auto}
.mc-abas button{background:none;border:0;padding:10px 14px;font:inherit;font-weight:600;color:#5a6b72;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap}
.mc-abas button.on{color:#7F1D1D;border-bottom-color:#7F1D1D}
.mc-pedido{border:1px solid #e2e6ec;border-radius:12px;margin:0 0 16px;overflow:hidden;background:#fff}
.mc-pedido header{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #e2e6ec}
.mc-item{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f0f2f5}
.mc-imp{padding:10px 16px;font-size:14px;background:#fffaf0}
.mc-st{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:#eef1f5;color:#44525a;white-space:nowrap}
.mc-st-pago{background:#e3f4e6;color:#1f5d2b}.mc-st-pendente{background:#fff3d6;color:#7a5a00}
.mc-st-recusado,.mc-st-cancelado,.mc-st-reembolsado{background:#fdecec;color:#8a1c1c}
.mc-vazio{text-align:center;padding:30px 10px}.mc-form{max-width:460px}
.mc-perigo{border-color:#b42318;color:#b42318}.mc-perigo-cheio{background:#b42318;color:#fff;border:0}
@media(max-width:560px){.mc-item{flex-direction:column;align-items:flex-start}.mc-pedido header{flex-direction:column;align-items:flex-start}}`;
  app.get('/minha-conta', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(storefront.pagina({
      title: 'Minha conta — Livraria Villela', description: 'Seus pedidos, downloads e dados na Livraria Villela.', path: '/minha-conta',
      extraHead: '<meta name="robots" content="noindex,nofollow"><style>' + CSS_CONTA + '</style>',
      body: '<section><div class="mc-wrap" id="mc"><noscript><p>Ative o JavaScript para usar a sua conta.</p></noscript><p class="muted">Carregando…</p></div></section><script src="/minha-conta/app.js?v=1" defer></script>',
    }));
  });
  app.get('/minha-conta/app.js', (req, res) => {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(fs.readFileSync(path.join(__dirname, 'conta-cliente.js'), 'utf8'));
  });
  app.get('/conta', (req, res) => res.redirect(302, '/minha-conta'));

  // Defesa de CSRF: toda escrita é JSON (formulário de outro site não consegue enviar
  // application/json sem pré-voo) e, se o navegador mandou Origin, tem de ser a própria loja.
  app.use(BASE, (req, res, next) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      if (!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ erro: 'Requisição inválida.' });
      const origem = req.headers.origin;
      if (origem) {
        let host = ''; try { host = new URL(origem).host; } catch (_) { /* inválida */ }
        if (host !== req.headers.host) return res.status(403).json({ erro: 'Origem não permitida.' });
      }
    }
    next();
  });

  const exigir = (req, res, next) => {
    const sessao = Sessoes.daRequisicao(req);
    if (!sessao) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.', sessao: false });
    req.leitor = sessao;
    next();
  };
  const freio = (req, res, nome, max = 12) => {
    if (limitar(`${nome}:${req.ip}`, max, 15 * 60e3)) { res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em alguns minutos.' }); return true; }
    return false;
  };
  const MSG_CODIGO = 'Se o e-mail estiver correto, enviamos um código de 6 dígitos. Ele vale por ' + COD_MINUTOS + ' minutos.';
  // ---------- criar conta: nome + e-mail + aceite → código → conta ----------
  app.post(BASE + '/cadastro', async (req, res) => {
    if (freio(req, res, 'cad')) return;
    const d = req.body || {};
    const nome = s(d.nome, 120), email = normEmail(d.email);
    if (nome.length < 2) return res.status(400).json({ erro: 'Informe o seu nome.' });
    if (!emailValido(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    if (d.aceite !== true) return res.status(400).json({ erro: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.' });
    if (limitar('cad-email:' + email, 4, 3600e3)) return res.status(429).json({ erro: 'Muitas tentativas para este e-mail. Tente mais tarde.' });
    await mandarCodigo({ email, finalidade: 'cadastro', nome, dados: { nome, marketing: d.marketing === true } });
    res.json({ ok: true, etapa: 'codigo', email, mensagem: MSG_CODIGO });
  });

  app.post(BASE + '/cadastro/confirmar', (req, res) => {
    if (freio(req, res, 'cadc')) return;
    const d = req.body || {};
    const x = Codigos.conferir({ email: d.email, finalidade: 'cadastro', codigo: d.codigo });
    if (!x) return res.status(400).json({ erro: 'Código inválido ou expirado. Peça um novo.' });
    const email = normEmail(d.email);
    const agora = nowISO();
    let cli = cruPorEmail(email);
    if (cli && cli.excluido_em) return res.status(400).json({ erro: 'Código inválido ou expirado. Peça um novo.' });
    if (!cli) {
      const novo = repo.Customers.upsert({ nome: x.dados.nome, email, consentimentos: {} });
      cli = cruCliente(novo.id);
    }
    // quem já era cliente mantém o nome e o perfil; o aceite e o consentimento de marketing são registrados
    const cons = Object.assign(j.parse(cli.consentimentos, {}), { termos: true, termos_em: agora, marketing: !!x.dados.marketing, marketing_em: agora });
    db.prepare(`UPDATE customers SET email_verificado = 1, conta_criada_em = COALESCE(conta_criada_em, ?),
      nome = CASE WHEN nome = '' THEN ? ELSE nome END, consentimentos = ?, updated_at = ? WHERE id = ?`)
      .run(agora, x.dados.nome, j.str(cons), agora, cli.id);
    abrirSessao(req, res, cli.id);
    res.json({ ok: true, perfil: perfil(cruCliente(cli.id)) });
  });

  // ---------- entrar: e-mail → código ----------
  app.post(BASE + '/codigo', async (req, res) => {
    if (freio(req, res, 'cod')) return;
    const d = req.body || {};
    const email = normEmail(d.email);
    if (!emailValido(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    const c = cruPorEmail(email);
    // Só envia se o e-mail já existe como cliente; a resposta é a mesma de qualquer forma.
    if (c && !c.excluido_em) await mandarCodigo({ email, finalidade: 'entrar', nome: c.nome, customerId: c.id });
    res.json({ ok: true, mensagem: MSG_CODIGO });
  });

  app.post(BASE + '/entrar-codigo', (req, res) => {
    if (freio(req, res, 'entc')) return;
    const d = req.body || {};
    const x = Codigos.conferir({ email: d.email, finalidade: 'entrar', codigo: d.codigo });
    const c = x ? cruPorEmail(d.email) : null;
    if (!x || !c || c.excluido_em) return res.status(400).json({ erro: 'Código inválido ou expirado. Peça um novo.' });
    db.prepare('UPDATE customers SET email_verificado = 1, conta_criada_em = COALESCE(conta_criada_em, ?), updated_at = ? WHERE id = ?').run(nowISO(), nowISO(), c.id);
    abrirSessao(req, res, c.id);
    res.json({ ok: true, perfil: perfil(cruCliente(c.id)) });
  });

  app.post(BASE + '/sair', (req, res) => {
    const sessao = Sessoes.daRequisicao(req);
    if (sessao) Sessoes.revogar(sessao.sessaoId);
    fecharCookie(req, res);
    res.json({ ok: true });
  });

  // ---------- área logada ----------
  app.get(BASE + '/eu', exigir, (req, res) => {
    res.json({ ok: true, perfil: perfil(req.leitor.cliente), pedidos: pedidosDe(req.leitor.cliente.id) });
  });

  app.patch(BASE + '/eu', exigir, (req, res) => {
    const c = req.leitor.cliente, d = req.body || {};
    const set = { updated_at: nowISO() };
    if (d.nome !== undefined) { const n = s(d.nome, 120); if (n.length < 2) return res.status(400).json({ erro: 'Informe o seu nome.' }); set.nome = n; }
    if (d.whatsapp !== undefined) set.whatsapp = s(d.whatsapp, 40);
    if (d.doc !== undefined) {
      const doc = s(d.doc, 30), dig = doc.replace(/\D/g, '');
      if (doc && dig.length !== 11 && dig.length !== 14) return res.status(400).json({ erro: 'CPF ou CNPJ com número de dígitos inválido.' });
      set.doc = doc;
    }
    if (d.pais !== undefined) set.pais = s(d.pais, 3).toUpperCase() || 'BR';
    if (d.estado !== undefined) set.estado = s(d.estado, 40);
    if (d.cidade !== undefined) set.cidade = s(d.cidade, 80);
    if (d.endereco && typeof d.endereco === 'object') {
      const e = {}; for (const k of ['cep', 'logradouro', 'numero', 'compl', 'bairro']) e[k] = s(d.endereco[k], 120);
      set.endereco = j.str(e);
    }
    if (d.marketing !== undefined) {
      const cons = j.parse(c.consentimentos, {});
      cons.marketing = d.marketing === true; cons.marketing_em = nowISO();
      set.consentimentos = j.str(cons);
    }
    const cols = Object.keys(set);
    db.prepare(`UPDATE customers SET ${cols.map((k) => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...set, id: c.id });
    res.json({ ok: true, perfil: perfil(cruCliente(c.id)) });
  });

  // encerra a sessão em TODOS os aparelhos (inclusive este)
  app.post(BASE + '/sair-todos', exigir, (req, res) => {
    Sessoes.revogarDaConta(req.leitor.cliente.id);
    fecharCookie(req, res);
    res.json({ ok: true });
  });

  // troca de e-mail: o código vai para o e-mail NOVO e o antigo é avisado da troca. Sem isso, quem
  // roubasse a sessão trocaria o e-mail e tomaria a conta.
  app.post(BASE + '/email/pedir', exigir, async (req, res) => {
    if (freio(req, res, 'em')) return;
    const c = req.leitor.cliente, d = req.body || {};
    const novo = normEmail(d.novo_email);
    if (!emailValido(novo)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    if (novo === c.email) return res.status(400).json({ erro: 'Este já é o e-mail da conta.' });
    if (!cruPorEmail(novo)) await mandarCodigo({ email: novo, finalidade: 'email', nome: c.nome, customerId: c.id });
    res.json({ ok: true, mensagem: 'Se o e-mail puder ser usado, enviamos um código para ele.' });
  });
  app.post(BASE + '/email/confirmar', exigir, (req, res) => {
    if (freio(req, res, 'emc')) return;
    const c = req.leitor.cliente, d = req.body || {};
    const novo = normEmail(d.novo_email);
    const x = Codigos.conferir({ email: novo, finalidade: 'email', codigo: d.codigo });
    if (!x || x.customer_id !== c.id) return res.status(400).json({ erro: 'Código inválido ou expirado. Peça um novo.' });
    if (cruPorEmail(novo)) return res.status(409).json({ erro: 'Este e-mail não pode ser usado.' });
    db.prepare('UPDATE customers SET email = ?, email_verificado = 1, updated_at = ? WHERE id = ?').run(novo, nowISO(), c.id);
    Sessoes.revogarDaConta(c.id, req.leitor.sessaoId);      // outros aparelhos saem
    const aviso = emails.suporte({ nome: c.nome, mensagem: 'O e-mail da sua conta na Livraria Villela foi trocado para ' + novo + '. Se não foi você, responda este e-mail ou fale com o suporte agora.' });
    Promise.resolve(enviarEmail(c.email, 'O e-mail da sua conta foi alterado — Livraria Villela', aviso.html)).catch(() => {});
    res.json({ ok: true, perfil: perfil(cruCliente(c.id)) });
  });

  // PDF com link vencido ou esgotado: o dono do pedido PAGO gera outro sozinho. Se o staff
  // bloqueou algum link do pedido (fraude/reembolso), não gera — vai para o suporte.
  app.post(BASE + '/pedidos/:id/novo-link', exigir, (req, res) => {
    if (freio(req, res, 'lnk', 20)) return;
    const c = req.leitor.cliente;
    const o = repo.Orders.obter(s(req.params.id, 40));
    if (!o || o.customer_id !== c.id || o.teste) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (o.status !== 'pago') return res.status(409).json({ erro: 'O pedido ainda não está pago.' });
    const tokens = repo.Tokens.daOrder(o.id);
    if (tokens.some((t) => !t.ativo)) return res.status(409).json({ erro: 'Este pedido tem um link bloqueado. Fale com o suporte para liberar.' });
    let gerados = 0;
    for (const it of (o.itens || [])) {
      if (it.tipo === 'impresso') continue;
      if (tokens.some((t) => t.book_id === it.book_id && repo.Tokens.validar(t.id).ok)) continue;
      if (!repo.Files.ativo(it.book_id)) continue;
      repo.Tokens.gerar(o.id, it.book_id, { horas: 72, max: 5 });
      gerados++;
    }
    repo.Audit.log({ id: 'leitor', nome: 'Leitor (autoatendimento)' }, 'link.novo', { entidade: 'order', entidade_id: o.id, detalhe: gerados + ' link(s)' });
    res.json({ ok: true, gerados, pedidos: pedidosDe(c.id) });
  });

  // ---------- LGPD ----------
  app.get(BASE + '/dados', exigir, (req, res) => {
    const c = req.leitor.cliente;
    repo.Audit.log({ id: 'leitor', nome: 'Leitor (autoatendimento)' }, 'conta.exportar', { entidade: 'customer', entidade_id: c.id });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-livraria-villela.json"');
    res.send(JSON.stringify(exportarDados(c), null, 2));
  });

  app.post(BASE + '/excluir/pedir', exigir, async (req, res) => {
    if (freio(req, res, 'exp')) return;
    const c = req.leitor.cliente;
    await mandarCodigo({ email: c.email, finalidade: 'excluir', nome: c.nome, customerId: c.id });
    res.json({ ok: true, mensagem: 'Enviamos um código de confirmação para ' + c.email + '.' });
  });
  app.post(BASE + '/excluir', exigir, async (req, res) => {
    if (freio(req, res, 'exc')) return;
    const c = req.leitor.cliente, d = req.body || {};
    if (String(d.confirmacao || '').trim().toUpperCase() !== 'EXCLUIR') return res.status(400).json({ erro: 'Digite EXCLUIR para confirmar.' });
    const impedimento = impedimentoExclusao(c);
    if (impedimento) return res.status(409).json({ erro: impedimento });     // antes do código: não o gasta à toa
    const x = Codigos.conferir({ email: c.email, finalidade: 'excluir', codigo: d.codigo });
    if (!x || x.customer_id !== c.id) return res.status(400).json({ erro: 'Código inválido ou expirado. Peça um novo.' });
    const r = excluirConta(c);
    if (r.erro) return res.status(409).json({ erro: r.erro });
    fecharCookie(req, res);
    try {
      const t = emails.suporte({ nome: r.nome, mensagem: 'Confirmamos a exclusão da sua conta na Livraria Villela. Seus dados pessoais foram apagados; guardamos apenas os registros fiscais dos pedidos, sem identificação. Os links de download foram desativados.' });
      await enviarEmail(r.emailAntigo, 'Conta excluída — Livraria Villela', t.html);
    } catch (_) { /* a exclusão já aconteceu */ }
    res.json({ ok: true });
  });
}

module.exports = { registrarConta, Codigos, Sessoes, excluirConta, exportarDados, pedidosDe, perfil, COOKIE };
