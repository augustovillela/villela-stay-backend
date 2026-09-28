// =====================================================================
// Musique — CONTAS PRÓPRIAS (ADR-0011, 28/09/2026).
//
// POR QUE ISTO EXISTE
//   Até aqui a conta era a da Academia (ADR-0001). O Augusto decidiu que
//   são sistemas INDEPENDENTES: quem é aluno da Academia não entra no
//   Musique por isso, e vice-versa. Só três coisas ligam os dois — e
//   todas passam por funções INJETADAS (o módulo nunca importa a
//   Academia):
//     1. a conta DELE nasce aqui com a mesma senha (cópia do hash, uma
//        vez só; trocar a senha de um lado não muda o outro);
//     2. os CURSOS da Academia aparecem no Musique (vitrine e trilha →
//        curso);
//     3. PRODUTOR aprovado da Academia pode dar aula aqui — desde que
//        PROVE a conta de lá (e-mail + senha conferidos na Academia,
//        nunca guardados). Isso é o `academia_vinculo`.
//
// O QUE ESTE ARQUIVO NÃO FAZ
//   Não lê o cookie `academy_sess`. Ter sessão na Academia não dá sessão
//   aqui — a trava que o teste confere é justamente essa.
// =====================================================================
'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, nowISO } = require('./db');
const totp = require('./totp');

const COOKIE = 'musique_sess';
const PATH = '/music';
const DIAS = 30;
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const novoIdConta = () => 'mq_' + crypto.randomBytes(9).toString('base64url');
const normEmail = (e) => s(e, 160).toLowerCase();

function auditar(quem, acao, detalhe = '', ip = '') {
  db.prepare('INSERT INTO contas_auditoria (quando, quem, acao, detalhe, ip) VALUES (?, ?, ?, ?, ?)')
    .run(nowISO(), s(quem, 80) || 'anonimo', s(acao, 60), s(detalhe, 300), s(ip, 60));
}

const Contas = {
  porId: (id) => db.prepare('SELECT * FROM contas_music WHERE id = ?').get(s(id, 80)) || null,
  porEmail: (email) => db.prepare('SELECT * FROM contas_music WHERE email = ?').get(normEmail(email)) || null,

  /** Cadastro. `interno` só é usado pela semeadura da conta do dono e
   *  pelo teste: id e hash vindos de fora nunca chegam por HTTP. */
  criar({ nome, email, senha, telefone, marketing } = {}, interno = {}) {
    nome = s(nome, 120); email = normEmail(email);
    if (!nome || !email.includes('@') || email.length < 5) throw new Error('Informe nome e e-mail válidos.');
    if (!interno.senhaHash && String(senha || '').length < 8) throw new Error('A senha precisa de 8 ou mais caracteres.');
    if (Contas.porEmail(email)) throw new Error('Já existe uma conta do Musique com este e-mail. Use "Entrar".');
    const id = interno.id || novoIdConta();
    if (Contas.porId(id)) throw new Error('Conta já existe.');
    const agora = nowISO();
    db.prepare(`INSERT INTO contas_music (id, nome, email, senha_hash, telefone, status, consentimentos,
      academia_vinculo, origem, email_verificado, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, 'ativo', ?, ?, ?, ?, ?, ?)`).run(
      id, nome, email, interno.senhaHash || bcrypt.hashSync(String(senha), 10), s(telefone, 40),
      JSON.stringify({ termos_em: agora, privacidade_em: agora, marketing: !!marketing }),
      interno.vinculo || null, interno.origem || 'cadastro', interno.verificado ? 1 : 0, agora, agora);
    return Contas.porId(id);
  },

  conferirSenha: (c, senha) => !!(c && c.senha_hash && bcrypt.compareSync(String(senha || ''), c.senha_hash)),

  trocarSenha(id, nova) {
    if (String(nova || '').length < 8) throw new Error('A senha precisa de 8 ou mais caracteres.');
    db.prepare('UPDATE contas_music SET senha_hash = ?, atualizado_em = ? WHERE id = ?')
      .run(bcrypt.hashSync(String(nova), 10), nowISO(), id);
    Sessoes.revogarDaConta(id);
  },

  editar(id, { nome, telefone } = {}) {
    const c = Contas.porId(id); if (!c) throw new Error('Conta não encontrada.');
    db.prepare('UPDATE contas_music SET nome = ?, telefone = ?, atualizado_em = ? WHERE id = ?')
      .run(nome != null && s(nome, 120) ? s(nome, 120) : c.nome, telefone != null ? s(telefone, 40) : c.telefone, nowISO(), id);
    return Contas.porId(id);
  },

  mudarStatus(id, status) {
    if (!['ativo', 'suspenso'].includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE contas_music SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), id);
    if (status !== 'ativo') Sessoes.revogarDaConta(id);
    return Contas.porId(id);
  },

  vincularAcademia(id, academiaId) {
    const outro = db.prepare('SELECT id FROM contas_music WHERE academia_vinculo = ? AND id != ?').get(academiaId, id);
    if (outro) throw new Error('Esta conta da Academia já está vinculada a outra conta do Musique.');
    db.prepare('UPDATE contas_music SET academia_vinculo = ?, atualizado_em = ? WHERE id = ?').run(academiaId, nowISO(), id);
  },
  desvincularAcademia(id) {
    db.prepare('UPDATE contas_music SET academia_vinculo = NULL, atualizado_em = ? WHERE id = ?').run(nowISO(), id);
  },

  marcarEmailVerificado: (id) => db.prepare('UPDATE contas_music SET email_verificado = 1, atualizado_em = ? WHERE id = ?').run(nowISO(), id),

  /** O que o resto do módulo enxerga de uma conta. Sem hash, sem vínculo. */
  publica: (c) => (c ? { id: c.id, nome: c.nome, email: c.email, status: c.status, email_verificado: !!c.email_verificado } : null),

  // Buscas usadas por convite de banda, tarefa e escola. Antes vinham da
  // Academia; agora só enxergam contas DO MUSIQUE — convidar por e-mail
  // alguém que só tem Academia devolve "sem conta", como deve.
  // E só conta com e-mail CONFIRMADO: sem isso, quem se cadastrasse com o
  // e-mail de outra pessoa passaria a receber os convites dela.
  buscarPorEmail: (email) => { const c = Contas.porEmail(email); return c && c.email_verificado ? Contas.publica(c) : null; },
  buscarPorId: (id) => { const c = Contas.porId(id); return c ? { id: c.id, nome: c.nome } : null; },

  listar({ q = '', n = 200 } = {}) {
    const t = '%' + s(q, 80).toLowerCase() + '%';
    return db.prepare(`SELECT id, nome, email, status, origem, academia_vinculo IS NOT NULL AS vinculada,
      email_verificado, totp_ativo, criado_em, ultimo_login FROM contas_music WHERE lower(nome) LIKE ? OR email LIKE ?
      ORDER BY criado_em DESC LIMIT ?`).all(t, t, Math.min(parseInt(n, 10) || 200, 1000));
  },
  total: () => db.prepare('SELECT COUNT(*) n FROM contas_music').get().n,
};

// ---- duas etapas (TOTP + códigos de recuperação) ----------------------
const hashRec = (cod) => crypto.createHash('sha256').update(String(cod || '').replace(/[\s-]/g, '').toLowerCase()).digest('hex');
const DoisFatores = {
  /** Gera o segredo PENDENTE: só passa a valer depois de `ativar` com um
   *  código certo — assim ninguém se tranca fora por ter lido mal o QR. */
  iniciar(id) {
    const seg = totp.novoSegredo();
    db.prepare('UPDATE contas_music SET totp_secret = ?, totp_ativo = 0, atualizado_em = ? WHERE id = ?').run(seg, nowISO(), id);
    return seg;
  },
  ativar(id, cod) {
    const c = Contas.porId(id);
    const passo = c && !c.totp_ativo && totp.conferir(c.totp_secret, cod);
    if (!passo) throw new Error('Código não confere. Confira a hora do celular e digite o código que está na tela agora.');
    const codigos = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').replace(/(.{5})(.{5})/, '$1-$2'));
    db.prepare('UPDATE contas_music SET totp_ativo = 1, totp_ultimo_passo = ?, recuperacao = ?, atualizado_em = ? WHERE id = ?')
      .run(passo, JSON.stringify(codigos.map(hashRec)), nowISO(), id);
    Sessoes.revogarDaConta(id);   // quem já estava logado em outro aparelho entra de novo, agora com o código
    return codigos;
  },
  /** Confere o código do app OU um de recuperação (que é gasto).
   *  Recusa código já usado: quem viu o código por cima do ombro não o reusa. */
  conferir(id, cod) {
    const c = Contas.porId(id);
    if (!c || !c.totp_ativo) return true;
    const passo = totp.conferir(c.totp_secret, cod);
    if (passo) {
      if (passo <= c.totp_ultimo_passo) return false;
      db.prepare('UPDATE contas_music SET totp_ultimo_passo = ? WHERE id = ?').run(passo, id);
      return true;
    }
    let rec = []; try { rec = JSON.parse(c.recuperacao || '[]'); } catch (_) { rec = []; }
    const h = hashRec(cod), i = rec.indexOf(h);
    if (!cod || i < 0) return false;
    rec.splice(i, 1);
    db.prepare('UPDATE contas_music SET recuperacao = ? WHERE id = ?').run(JSON.stringify(rec), id);
    auditar(id, 'conta.2fa.recuperacao-usada', rec.length + ' restante(s)');
    return true;
  },
  desativar(id) {
    db.prepare("UPDATE contas_music SET totp_secret = '', totp_ativo = 0, totp_ultimo_passo = 0, recuperacao = '[]', atualizado_em = ? WHERE id = ?").run(nowISO(), id);
  },
  restantes(id) { const c = Contas.porId(id); try { return JSON.parse(c.recuperacao || '[]').length; } catch (_) { return 0; } },
};

const Sessoes = {
  criar(contaId, { ip = '', userAgent = '' } = {}) {
    const id = crypto.randomBytes(12).toString('base64url');
    db.prepare('INSERT INTO sessoes_music (id, conta_id, criada_em, expira_em, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, contaId, nowISO(), new Date(Date.now() + DIAS * 864e5).toISOString(), s(ip, 60), s(userAgent, 200));
    return id;
  },
  valida(jti, contaId) {
    const x = db.prepare('SELECT * FROM sessoes_music WHERE id = ?').get(s(jti, 80));
    return !!(x && !x.revogada && x.conta_id === contaId && x.expira_em > nowISO());
  },
  revogar: (jti) => db.prepare('UPDATE sessoes_music SET revogada = 1 WHERE id = ?').run(s(jti, 80)),
  revogarDaConta: (id) => db.prepare('UPDATE sessoes_music SET revogada = 1 WHERE conta_id = ?').run(id),
};

/**
 * Semeia a conta do DONO com a mesma senha da Academia (decisão do
 * Augusto: "duas contas, mesma senha"). Roda na montagem e é idempotente:
 * se a conta já existe, NÃO toca nela — senão uma troca de senha feita
 * aqui seria desfeita no próximo deploy.
 *
 * O id da conta nova é o MESMO id que ele já tinha na Academia: é esse
 * valor que está gravado nas cifras, bandas e trilhas que ele criou
 * enquanto a conta era única, e assim nada dele se perde.
 */
function semearDono(contaDoDono) {
  if (typeof contaDoDono !== 'function') return { ok: false, motivo: 'sem função de dono injetada' };
  let a = null;
  try { a = contaDoDono(); } catch (_) { a = null; }
  if (!a || !a.id || !a.email || !a.senha_hash) return { ok: false, motivo: 'conta do dono não encontrada na Academia' };
  if (Contas.porEmail(a.email) || Contas.porId(a.id)) return { ok: true, ja_existia: true };
  Contas.criar({ nome: a.nome || 'Augusto Villela', email: a.email, telefone: a.telefone || '' },
    { id: a.id, senhaHash: a.senha_hash, origem: 'dono', vinculo: a.id, verificado: true });
  auditar(a.id, 'conta.semeada-dono', 'mesma senha da Academia (cópia única do hash)');
  return { ok: true, criada: true };
}

/** Verificador no MESMO formato que `sessao.js` já consumia — assim as
 *  rotas não mudam: continuam recebendo `req.usuario = {id,nome,email}`. */
function criarVerificador({ jwtSecret }) {
  if (!jwtSecret) throw new Error('contas: falta jwtSecret.');
  function resolver(req) {
    try {
      const bruto = req.cookies && req.cookies[COOKIE];
      if (!bruto) return null;
      const d = jwt.verify(bruto, jwtSecret);
      if (d.tipo !== 'musique') return null;          // token de outro produto não vale aqui
      if (!Sessoes.valida(d.jti, d.cid)) return null;
      const c = Contas.porId(d.cid);
      if (!c || c.status !== 'ativo') return null;
      return { usuario: Contas.publica(c), jti: d.jti };
    } catch (_) { return null; }
  }
  return { resolver };
}

const assinar = (contaId, jti, jwtSecret) => jwt.sign({ tipo: 'musique', cid: contaId, jti }, jwtSecret, { expiresIn: DIAS + 'd' });

function emitir(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax', maxAge: DIAS * 864e5, path: PATH });
}
const limpar = (res) => res.clearCookie(COOKIE, { path: PATH });

module.exports = { COOKIE, PATH, Contas, Sessoes, DoisFatores, semearDono, criarVerificador, assinar, emitir, limpar, auditar, normEmail };
