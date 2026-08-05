// =====================================================================
// Closet Club — campanhas patrocinadas (4ª fonte de receita, onda 3).
//
// O anunciante compra destaque avulso para uma peça: ela sobe ao topo da
// vitrine por N dias. Independente do Premium — quem é Premium tem alguns
// destaques inclusos, quem não é pode comprar um sem assinar nada.
//
// Regra de honestidade que vale a pena manter: destaque muda a ORDEM,
// nunca o conteúdo. Uma peça patrocinada continua sujeita a moderação,
// disponibilidade e avaliação real, e a vitrine marca visualmente que ela
// está em destaque — o `.selo.ouro` na interface. Sem isso, seria anúncio
// disfarçado de resultado orgânico.
// =====================================================================
'use strict';
const { db, nowISO, novoId, hojeISO } = require('./db');
const repo = require('./repo');
const { Config, Items, Users, Notificacoes, evento, lancar, s, n, cent } = repo;

const CONFIG_PADRAO = {
  destaque_dia_centavos: { valor: '900', descricao: 'Preço por dia de destaque patrocinado de uma peça.' },
  destaque_max_dias: { valor: '30', descricao: 'Máximo de dias que uma campanha pode durar.' },
};

function semearConfig() {
  for (const [chave, v] of Object.entries(CONFIG_PADRAO)) {
    if (db.prepare('SELECT 1 FROM config WHERE chave = ?').get(chave)) continue;
    db.prepare('INSERT INTO config (chave, valor, descricao, atualizado_em) VALUES (?,?,?,?)').run(chave, v.valor, v.descricao, nowISO());
  }
}

const precoDe = (dias) => Config.num('destaque_dia_centavos', 900) * Math.max(1, n(dias, 7));

const Campanhas = {
  precoDe,

  cotar(dias) {
    const d = Math.min(Math.max(1, n(dias, 7)), Config.num('destaque_max_dias', 30));
    return { dias: d, preco_centavos: precoDe(d), preco_dia_centavos: Config.num('destaque_dia_centavos', 900) };
  },

  criar(userId, { item_id, dias = 7 } = {}) {
    const item = Items.obter(item_id);
    if (!item) throw new Error('Peça não encontrada.');
    if (item.owner_id !== s(userId, 40)) throw new Error('Esta peça não é sua.');
    if (item.status !== 'ativo' || item.moderacao !== 'aprovado') {
      throw new Error('Só é possível destacar peça aprovada e ativa na vitrine.');
    }
    if (db.prepare("SELECT 1 FROM campanhas WHERE item_id = ? AND status IN ('aguardando_pagamento','ativa')").get(item.id)) {
      throw new Error('Esta peça já tem uma campanha em andamento.');
    }
    const c = Campanhas.cotar(dias);
    const id = novoId();
    db.prepare(`INSERT INTO campanhas (id, user_id, item_id, tipo, ocasiao, dias, preco_centavos, status, criado_em)
      VALUES (?,?,?,'destaque',?,?,?, 'aguardando_pagamento', ?)`)
      .run(id, s(userId, 40), item.id, (item.ocasioes || [])[0] || '', c.dias, c.preco_centavos, nowISO());
    evento(userId, 'campanha.criada', id, { item: item.id, dias: c.dias, preco: c.preco_centavos });
    return Campanhas.obter(id);
  },

  obter(id) {
    const c = db.prepare('SELECT * FROM campanhas WHERE id = ?').get(s(id, 40));
    if (!c) return null;
    const item = Items.obter(c.item_id);
    return { ...c, peca: item ? { id: item.id, titulo: item.titulo, foto: (item.fotos || [])[0] || null } : null };
  },

  // chamada pelo webhook do MP (ou pelo staff, manualmente)
  ativar(id, { mp_payment_id = '', quem = 'mercadopago' } = {}) {
    const c = db.prepare('SELECT * FROM campanhas WHERE id = ?').get(s(id, 40));
    if (!c) throw new Error('Campanha não encontrada.');
    if (c.status === 'ativa') return { ok: true, ja: true };
    if (c.status !== 'aguardando_pagamento') throw new Error('Esta campanha não está aguardando pagamento.');
    const agora = nowISO();
    const fim = new Date(Date.now() + c.dias * 86400000).toISOString();
    db.prepare("UPDATE campanhas SET status='ativa', inicio=?, fim=?, mp_payment_id=?, pago_em=? WHERE id=?")
      .run(agora, fim, s(mp_payment_id, 60), agora, c.id);
    // o destaque em si vive no item — a vitrine já ordena por destaque_ate
    db.prepare('UPDATE items SET destaque_ate = ?, atualizado_em = ? WHERE id = ?').run(fim, agora, c.item_id);
    lancar('campanha', c.preco_centavos, { userId: c.user_id, descricao: `Campanha patrocinada ${c.dias} dia(s)` });
    Notificacoes.criar(c.user_id, {
      titulo: '📣 Campanha no ar',
      texto: `Sua peça está em destaque na vitrine por ${c.dias} dia(s).`,
      url: '/closet/app#campanhas',
    });
    evento(c.user_id, 'campanha.ativa', c.id, { quem: s(quem, 60), fim });
    return { ok: true, fim };
  },

  cancelar(id, userId) {
    const c = db.prepare('SELECT * FROM campanhas WHERE id = ?').get(s(id, 40));
    if (!c) throw new Error('Campanha não encontrada.');
    if (userId && c.user_id !== s(userId, 40)) throw new Error('Esta campanha não é sua.');
    if (c.status === 'ativa') throw new Error('Campanha já paga e no ar não pode ser cancelada — ela encerra sozinha no fim do período.');
    db.prepare("UPDATE campanhas SET status='cancelada' WHERE id=?").run(c.id);
    return { ok: true };
  },

  doUsuario(userId) {
    return db.prepare('SELECT * FROM campanhas WHERE user_id = ? ORDER BY criado_em DESC LIMIT 100')
      .all(s(userId, 40)).map((c) => Campanhas.obter(c.id));
  },

  listar({ status = '' } = {}) {
    const q = status ? 'SELECT * FROM campanhas WHERE status = ? ORDER BY criado_em DESC LIMIT 200'
      : 'SELECT * FROM campanhas ORDER BY criado_em DESC LIMIT 200';
    const linhas = status ? db.prepare(q).all(s(status, 30)) : db.prepare(q).all();
    return linhas.map((c) => ({ ...Campanhas.obter(c.id), anunciante: (Users.publico(c.user_id) || {}).nome || '' }));
  },

  // ---- métricas: impressão quando a peça patrocinada aparece; clique na ficha ----
  registrarImpressoes(itemIds = []) {
    const ids = (Array.isArray(itemIds) ? itemIds : []).map((i) => s(i, 40)).filter(Boolean);
    if (!ids.length) return 0;
    const marcas = ids.map(() => '?').join(',');
    const r = db.prepare(`UPDATE campanhas SET impressoes = impressoes + 1
      WHERE status = 'ativa' AND item_id IN (${marcas})`).run(...ids);
    return r.changes || 0;
  },
  registrarClique(itemId) {
    db.prepare("UPDATE campanhas SET cliques = cliques + 1 WHERE status = 'ativa' AND item_id = ?").run(s(itemId, 40));
  },

  // ---- rotina: encerra o que venceu ----
  rotina() {
    const agora = nowISO();
    let encerradas = 0;
    for (const c of db.prepare("SELECT * FROM campanhas WHERE status = 'ativa' AND fim != '' AND fim < ?").all(agora)) {
      db.prepare("UPDATE campanhas SET status='encerrada' WHERE id=?").run(c.id);
      Notificacoes.criar(c.user_id, {
        titulo: 'Campanha encerrada',
        texto: `${c.impressoes} exibição(ões) e ${c.cliques} clique(s) no período.`,
        url: '/closet/app#campanhas',
      });
      encerradas++;
    }
    return { encerradas };
  },

  resumo() {
    const c = (sql, ...p) => n((db.prepare(sql).get(...p) || {}).c, 0);
    return {
      ativas: c("SELECT COUNT(*) c FROM campanhas WHERE status = 'ativa'"),
      aguardando: c("SELECT COUNT(*) c FROM campanhas WHERE status = 'aguardando_pagamento'"),
      receita_centavos: n((db.prepare("SELECT COALESCE(SUM(valor_centavos),0) c FROM ledger WHERE tipo = 'campanha'").get() || {}).c, 0),
      impressoes: c('SELECT COALESCE(SUM(impressoes),0) c FROM campanhas'),
      cliques: c('SELECT COALESCE(SUM(cliques),0) c FROM campanhas'),
      preco_dia_centavos: Config.num('destaque_dia_centavos', 900),
    };
  },
};

module.exports = { Campanhas, semearConfig, CONFIG_PADRAO };
