// =====================================================================
// Villela Academy — GOVERNANÇA (FASE 10): certificados com validação
// pública, tickets de suporte, relatórios avançados (série mensal,
// conversão, churn) e 2FA opcional (TOTP RFC 6238, padrão vdocs).
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');
const ct = require('./repo-conteudo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

// ------------------------------------------------------------ TOTP (RFC 6238)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, valor = 0, out = '';
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += B32[(valor << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  let bits = 0, valor = 0;
  const out = [];
  for (const c of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(secretB32, contador) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const cod = ((h[off] & 0x7f) << 24 | h[off + 1] << 16 | h[off + 2] << 8 | h[off + 3]) % 1e6;
  return String(cod).padStart(6, '0');
}
const totpAgora = (secret, delta = 0) => hotp(secret, Math.floor(Date.now() / 30000) + delta);
const totpConfere = (secret, codigo) => [-1, 0, 1].some(d => {
  const esperado = totpAgora(secret, d);
  return esperado.length === String(codigo).length && crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(String(codigo)));
});

const DoisFA = {
  gerar(user) {
    if (user.totp_ativo) throw new Error('2FA já está ativo — desative antes de reconfigurar.');
    const secret = base32Encode(crypto.randomBytes(20));
    db.prepare('UPDATE users SET totp_secret = ?, totp_ativo = 0 WHERE id = ?').run(secret, user.id);
    const otpauth = `otpauth://totp/${encodeURIComponent('Villela Academy:' + user.email)}?secret=${secret}&issuer=${encodeURIComponent('Villela Academy')}`;
    return { secret, otpauth };
  },
  ativar(user, codigo) {
    const u = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(user.id);
    if (!u || !u.totp_secret) throw new Error('Gere o 2FA antes de ativar.');
    if (!totpConfere(u.totp_secret, s(codigo, 10))) throw new Error('Código incorreto — confira o app autenticador.');
    db.prepare('UPDATE users SET totp_ativo = 1 WHERE id = ?').run(user.id);
    repo.Auditoria.registrar({ quem: user.id, acao: 'auth.2fa.ativar', entidade: 'users', entidade_id: user.id });
  },
  desativar(user, codigo) {
    const u = db.prepare('SELECT totp_secret, totp_ativo FROM users WHERE id = ?').get(user.id);
    if (!u || !u.totp_ativo) return;
    if (!totpConfere(u.totp_secret, s(codigo, 10))) throw new Error('Código incorreto.');
    db.prepare("UPDATE users SET totp_ativo = 0, totp_secret = '' WHERE id = ?").run(user.id);
    repo.Auditoria.registrar({ quem: user.id, acao: 'auth.2fa.desativar', entidade: 'users', entidade_id: user.id });
  },
  // usado no login: exige código quando o usuário tem 2FA ativo
  conferirLogin(userId, codigo) {
    const u = db.prepare('SELECT totp_secret, totp_ativo FROM users WHERE id = ?').get(userId);
    if (!u || !u.totp_ativo) return { precisa: false, ok: true };
    if (!codigo) return { precisa: true, ok: false };
    return { precisa: true, ok: totpConfere(u.totp_secret, s(codigo, 10)) };
  },
};

// ------------------------------------------------------------ certificados
const Certificados = {
  // emite quando o aluno tem acesso e concluiu 100% das aulas
  emitir(usuario, productId) {
    const p = ct.Produtos.obter(productId);
    if (!p || !ct.temAcesso(usuario.id, p.id)) throw new Error('Você não tem acesso a este produto.');
    const prog = ct.Progresso.doProduto(usuario.id, p.id);
    if (!prog.total_aulas || prog.pct < 100) throw new Error(`Conclua todas as aulas antes de emitir (${prog.concluidas}/${prog.total_aulas}).`);
    const existente = db.prepare('SELECT * FROM certificates WHERE user_id = ? AND product_id = ?').get(usuario.id, p.id);
    if (existente) return existente;
    const produtor = db.prepare('SELECT nome_publico FROM producer_profiles WHERE user_id = ?').get(p.producer_id);
    const codigo = 'VA-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    db.prepare(`INSERT INTO certificates (id, user_id, product_id, aluno_nome, produto_titulo, produtor_nome, total_aulas, emitido_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(codigo, usuario.id, p.id, usuario.nome, p.titulo, (produtor && produtor.nome_publico) || '', prog.total_aulas, nowISO());
    repo.Auditoria.registrar({ quem: usuario.id, acao: 'certificado.emitir', entidade: 'certificates', entidade_id: codigo, detalhe: p.titulo });
    return db.prepare('SELECT * FROM certificates WHERE id = ?').get(codigo);
  },
  porCodigo(codigo) { return db.prepare('SELECT * FROM certificates WHERE id = ?').get(s(codigo, 30)) || null; },
  doAluno(userId) { return db.prepare('SELECT * FROM certificates WHERE user_id = ? ORDER BY emitido_em DESC').all(userId); },
};

// ------------------------------------------------------------ tickets de suporte
const Tickets = {
  abrir(usuario, { assunto, categoria, texto }) {
    assunto = s(assunto, 160);
    if (!assunto || !s(texto, 4000)) throw new Error('Informe assunto e mensagem.');
    const id = novoId();
    db.prepare('INSERT INTO support_tickets (id, user_id, assunto, categoria, status, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, usuario.id, assunto, ['geral', 'pagamento', 'conteudo', 'conta', 'denuncia'].includes(categoria) ? categoria : 'geral', 'aberto', nowISO(), nowISO());
    db.prepare('INSERT INTO support_messages (id, ticket_id, lado, autor, texto, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(novoId(), id, 'usuario', usuario.email, s(texto, 4000), nowISO());
    return id;
  },
  obter(id) {
    const t = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);
    if (!t) return null;
    t.mensagens = db.prepare('SELECT lado, autor, texto, criado_em FROM support_messages WHERE ticket_id = ? ORDER BY criado_em').all(id);
    return t;
  },
  doUsuario(userId) { return db.prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY atualizado_em DESC').all(userId); },
  listarAdmin({ status, n } = {}) {
    let sql = 'SELECT t.*, u.nome, u.email FROM support_tickets t JOIN users u ON u.id = t.user_id';
    const args = [];
    if (status) { sql += ' WHERE t.status = ?'; args.push(status); }
    sql += ' ORDER BY t.atualizado_em DESC LIMIT ?'; args.push(Math.min(parseInt(n, 10) || 100, 500));
    return db.prepare(sql).all(...args);
  },
  responder(id, { lado, autor, texto }) {
    const t = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);
    if (!t) throw new Error('Ticket não encontrado.');
    db.prepare('INSERT INTO support_messages (id, ticket_id, lado, autor, texto, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(novoId(), id, lado === 'plataforma' ? 'plataforma' : 'usuario', s(autor, 120), s(texto, 4000), nowISO());
    db.prepare('UPDATE support_tickets SET status = ?, atualizado_em = ? WHERE id = ?')
      .run(lado === 'plataforma' ? 'respondido' : 'aberto', nowISO(), id);
    if (lado === 'plataforma') { // avisa o usuário (sininho)
      require('./emails').Notificacoes.criar(t.user_id, '🎧 Suporte respondeu', `Seu ticket "${t.assunto}" tem resposta nova.`, '/academy/app');
    }
  },
  mudarStatus(id, status) {
    if (!['aberto', 'respondido', 'fechado'].includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE support_tickets SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), id);
  },
};

// ------------------------------------------------------------ relatórios avançados
const Relatorios = {
  executivo() {
    // série mensal (últimos 6 meses): GMV, receita, vendas, novos usuários, novas matrículas
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      meses.push(d.toISOString().slice(0, 7));
    }
    const serie = meses.map(m => ({
      mes: m,
      gmv_centavos: db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v FROM orders WHERE status = 'paga' AND pago_em LIKE ?").get(m + '%').v,
      receita_centavos: db.prepare("SELECT COALESCE(SUM(comissao_plataforma_centavos),0) v FROM orders WHERE status = 'paga' AND pago_em LIKE ?").get(m + '%').v,
      vendas: db.prepare("SELECT COUNT(*) n FROM orders WHERE status = 'paga' AND pago_em LIKE ?").get(m + '%').n,
      novos_usuarios: db.prepare('SELECT COUNT(*) n FROM users WHERE criado_em LIKE ?').get(m + '%').n,
      novas_matriculas: db.prepare('SELECT COUNT(*) n FROM enrollments WHERE criado_em LIKE ?').get(m + '%').n,
    }));
    // conversão de pedidos (histórico): pagas / (pagas+recusadas+canceladas+expiradas+pendentes)
    const tot = db.prepare("SELECT COUNT(*) n FROM orders WHERE tipo = 'avulsa'").get().n;
    const pagas = db.prepare("SELECT COUNT(*) n FROM orders WHERE tipo = 'avulsa' AND status = 'paga'").get().n;
    // churn de assinaturas: canceladas no mês corrente / (ativas + canceladas no mês)
    const mesAtual = new Date().toISOString().slice(0, 7);
    const ativas = db.prepare("SELECT COUNT(*) n FROM subscriptions WHERE status = 'ativa'").get().n;
    const canceladasMes = db.prepare("SELECT COUNT(*) n FROM subscriptions WHERE status = 'cancelada' AND cancelada_em LIKE ?").get(mesAtual + '%').n;
    return {
      serie_mensal: serie,
      conversao: { pedidos: tot, pagos: pagas, pct: tot ? Math.round(1000 * pagas / tot) / 10 : null },
      churn: { assinaturas_ativas: ativas, canceladas_no_mes: canceladasMes, pct: (ativas + canceladasMes) ? Math.round(1000 * canceladasMes / (ativas + canceladasMes)) / 10 : null },
      tickets_abertos: db.prepare("SELECT COUNT(*) n FROM support_tickets WHERE status != 'fechado'").get().n,
      certificados_emitidos: db.prepare('SELECT COUNT(*) n FROM certificates').get().n,
    };
  },
};

module.exports = { DoisFA, Certificados, Tickets, Relatorios, totpAgora, totpConfere, base32Encode };
