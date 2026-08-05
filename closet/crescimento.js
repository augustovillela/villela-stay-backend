// =====================================================================
// Closet Club — crescimento: indicação e créditos.
//
// Programa de indicação: cada pessoa tem um código curto. Quem entra por
// ele vira "afilhada"; quando ela CONCLUI o primeiro aluguel (não quando
// se cadastra — senão vira fábrica de conta falsa), os dois ganham crédito.
//
// Crédito é promoção da PLATAFORMA: ao ser usado numa reserva, sai da
// comissão e NUNCA do repasse do proprietário — a mesma regra do cupom e
// do desconto de look. Por isso o valor aplicável é limitado pela comissão
// bruta daquela reserva, e o que sobra continua no saldo.
// =====================================================================
'use strict';
const { db, nowISO, novoId, novoCodigoCurto, j } = require('./db');
const repo = require('./repo');
const { Config, Notificacoes, evento, lancar, s, n, cent } = repo;

const CONFIG_PADRAO = {
  indicacao_premio_convidado_centavos: { valor: '3000', descricao: 'Crédito para quem entra por indicação (liberado no 1º aluguel concluído).' },
  indicacao_premio_padrinho_centavos: { valor: '3000', descricao: 'Crédito para quem indicou (liberado no 1º aluguel da pessoa indicada).' },
  credito_validade_dias: { valor: '90', descricao: 'Validade do crédito de indicação, em dias.' },
};

function semearConfig() {
  for (const [chave, v] of Object.entries(CONFIG_PADRAO)) {
    if (db.prepare('SELECT 1 FROM config WHERE chave = ?').get(chave)) continue;
    db.prepare('INSERT INTO config (chave, valor, descricao, atualizado_em) VALUES (?,?,?,?)').run(chave, v.valor, v.descricao, nowISO());
  }
}

// ---------------------------------------------------------------------
// Créditos
// ---------------------------------------------------------------------
const Creditos = {
  // saldo = créditos não vencidos + usos (negativos, sempre contam)
  saldo(userId) {
    const r = db.prepare(`SELECT COALESCE(SUM(valor_centavos),0) v FROM credits
      WHERE user_id = ? AND (expira_em = '' OR expira_em >= ?)`).get(s(userId, 40), nowISO());
    return Math.max(0, n(r.v, 0));
  },

  conceder(userId, valorCentavos, { tipo = 'cortesia', descricao = '', validadeDias = 0, bookingId = '' } = {}) {
    const valor = cent(valorCentavos);
    if (valor <= 0) return null;
    const dias = n(validadeDias, 0) || Config.num('credito_validade_dias', 90);
    const id = novoId();
    db.prepare(`INSERT INTO credits (id, user_id, valor_centavos, tipo, descricao, booking_id, expira_em, criado_em)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, s(userId, 40), valor, s(tipo, 20), s(descricao, 300), s(bookingId, 40),
        new Date(Date.now() + dias * 86400000).toISOString(), nowISO());
    Notificacoes.criar(userId, {
      titulo: '🎁 Você ganhou crédito',
      texto: `R$ ${(valor / 100).toFixed(2)} para usar no seu próximo aluguel${dias ? ` (vale ${dias} dias)` : ''}.`,
      url: '/closet/app#conta',
    });
    evento(userId, 'credito.concedido', id, { valor, tipo });
    return id;
  },

  // consome crédito numa reserva (valor já validado pelo orçamento)
  usar(userId, valorCentavos, bookingId) {
    const valor = cent(valorCentavos);
    if (valor <= 0) return 0;
    const disponivel = Creditos.saldo(userId);
    const usado = Math.min(valor, disponivel);
    if (usado <= 0) return 0;
    db.prepare(`INSERT INTO credits (id, user_id, valor_centavos, tipo, descricao, booking_id, expira_em, criado_em)
      VALUES (?,?,?,'uso',?,?,'',?)`)
      .run(novoId(), s(userId, 40), -usado, 'Crédito usado na reserva', s(bookingId, 40), nowISO());
    evento(userId, 'credito.usado', bookingId, { valor: usado });
    return usado;
  },

  // devolve o crédito quando a reserva não acontece (cancelada/recusada/expirada)
  devolver(userId, bookingId) {
    const usado = db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v FROM credits WHERE booking_id = ? AND tipo = 'uso'").get(s(bookingId, 40));
    const valor = Math.abs(n(usado.v, 0));
    if (valor <= 0) return 0;
    if (db.prepare("SELECT 1 FROM credits WHERE booking_id = ? AND tipo = 'estorno'").get(s(bookingId, 40))) return 0; // idempotente
    db.prepare(`INSERT INTO credits (id, user_id, valor_centavos, tipo, descricao, booking_id, expira_em, criado_em)
      VALUES (?,?,?,'estorno',?,?,?,?)`)
      .run(novoId(), s(userId, 40), valor, 'Crédito devolvido (reserva não concluída)', s(bookingId, 40),
        new Date(Date.now() + Config.num('credito_validade_dias', 90) * 86400000).toISOString(), nowISO());
    return valor;
  },

  extrato(userId) {
    return db.prepare('SELECT * FROM credits WHERE user_id = ? ORDER BY criado_em DESC LIMIT 100').all(s(userId, 40));
  },
};

// ---------------------------------------------------------------------
// Indicações
// ---------------------------------------------------------------------
const Indicacoes = {
  // código pessoal: gerado sob demanda e estável
  codigoDe(userId) {
    const u = db.prepare('SELECT id, nome, codigo_indicacao FROM users WHERE id = ?').get(s(userId, 40));
    if (!u) throw new Error('Usuário não encontrado.');
    if (u.codigo_indicacao) return u.codigo_indicacao;
    let codigo = '';
    for (let tentativa = 0; tentativa < 30 && !codigo; tentativa++) {
      const c = novoCodigoCurto(6);
      if (!db.prepare('SELECT 1 FROM users WHERE codigo_indicacao = ?').get(c)) codigo = c;
    }
    if (!codigo) codigo = 'CC' + novoCodigoCurto(8);
    db.prepare('UPDATE users SET codigo_indicacao = ? WHERE id = ?').run(codigo, u.id);
    return codigo;
  },

  porCodigo(codigo) {
    const c = s(codigo, 40).toUpperCase();
    if (!c) return null;
    return db.prepare('SELECT id, nome FROM users WHERE codigo_indicacao = ? AND status = ?').get(c, 'ativo') || null;
  },

  // registra o vínculo no cadastro (o prêmio só sai no 1º aluguel concluído)
  registrar(padrinhoId, convidadoId, codigo) {
    if (!padrinhoId || padrinhoId === convidadoId) return null;
    const id = novoId();
    db.prepare(`INSERT INTO referrals (id, padrinho_id, codigo, convidado_id, status, premio_centavos, criado_em)
      VALUES (?,?,?,?,'cadastrado',0,?)`).run(id, s(padrinhoId, 40), s(codigo, 40).toUpperCase(), s(convidadoId, 40), nowISO());
    Notificacoes.criar(padrinhoId, {
      titulo: '🎉 Alguém entrou pelo seu convite',
      texto: 'Quando essa pessoa concluir o primeiro aluguel, vocês dois ganham crédito.',
      url: '/closet/app#conta',
    });
    evento(convidadoId, 'indicacao.cadastrada', id, { padrinho: padrinhoId });
    return id;
  },

  // chamada quando uma reserva é concluída: premia se for o 1º aluguel do convidado
  premiarSePrimeira(clienteId, bookingId) {
    const r = db.prepare("SELECT * FROM referrals WHERE convidado_id = ? AND status = 'cadastrado' ORDER BY criado_em LIMIT 1").get(s(clienteId, 40));
    if (!r) return null;
    const premioConvidado = Config.num('indicacao_premio_convidado_centavos', 3000);
    const premioPadrinho = Config.num('indicacao_premio_padrinho_centavos', 3000);
    Creditos.conceder(clienteId, premioConvidado, { tipo: 'indicacao', descricao: 'Boas-vindas por indicação', bookingId });
    Creditos.conceder(r.padrinho_id, premioPadrinho, { tipo: 'indicacao', descricao: 'Sua indicação alugou pela primeira vez', bookingId });
    db.prepare("UPDATE referrals SET status = 'premiado', premio_centavos = ? WHERE id = ?").run(premioConvidado + premioPadrinho, r.id);
    // o crédito é uma promoção: entra no razão como custo de aquisição
    lancar('credito', -(premioConvidado + premioPadrinho), { bookingId, userId: r.padrinho_id, descricao: 'Programa de indicação (padrinho + convidado)' });
    evento(clienteId, 'indicacao.premiada', r.id, { total: premioConvidado + premioPadrinho });
    return { referral_id: r.id, premio_convidado: premioConvidado, premio_padrinho: premioPadrinho };
  },

  // painel da pessoa: quem ela indicou e quanto rendeu
  minhas(userId) {
    const linhas = db.prepare(`SELECT r.*, u.nome AS convidado_nome FROM referrals r
      LEFT JOIN users u ON u.id = r.convidado_id WHERE r.padrinho_id = ? ORDER BY r.criado_em DESC LIMIT 100`).all(s(userId, 40));
    return {
      codigo: Indicacoes.codigoDe(userId),
      convites: linhas.map((l) => ({
        nome: l.convidado_nome || 'Convidada', status: l.status, premio_centavos: l.premio_centavos, criado_em: l.criado_em,
      })),
      premiados: linhas.filter((l) => l.status === 'premiado').length,
      premio_por_indicacao_centavos: Config.num('indicacao_premio_padrinho_centavos', 3000),
    };
  },

  // relatório da plataforma
  resumo() {
    const c = (sql) => n((db.prepare(sql).get() || {}).c, 0);
    return {
      convites: c('SELECT COUNT(*) c FROM referrals'),
      premiados: c("SELECT COUNT(*) c FROM referrals WHERE status = 'premiado'"),
      credito_concedido_centavos: n((db.prepare("SELECT COALESCE(SUM(valor_centavos),0) c FROM credits WHERE valor_centavos > 0").get() || {}).c, 0),
      credito_usado_centavos: Math.abs(n((db.prepare("SELECT COALESCE(SUM(valor_centavos),0) c FROM credits WHERE tipo = 'uso'").get() || {}).c, 0)),
    };
  },
};

module.exports = { Creditos, Indicacoes, semearConfig, CONFIG_PADRAO };
