// =====================================================================
// Villela Stay Manager (VSM) — APP DE GESTÃO REAL (mini-PMS multi-tenant).
//
// Tudo escopado por tenant_id (isolamento lógico). É o que o ASSINANTE usa
// por dentro: imóveis, hóspedes, reservas (com anti-overbooking), limpezas,
// manutenção e financeiro. Limites e módulos vêm dos entitlements do plano
// (repo.entitlements/dentroLimite/podeModulo) — este arquivo aplica as regras
// de negócio; o gating de acesso mora nas rotas (rotas-app.js).
// =====================================================================
'use strict';
const { db, nowISO, novoId, periodoAtual, j } = require('./db');
const repo = require('./repo');

const s = (v, max = 2000) => String(v == null ? '' : v).trim().slice(0, max);
const cent = (v) => Math.round(Number(v || 0));
const dia = (v) => s(v, 10).slice(0, 10); // YYYY-MM-DD
const noitesEntre = (ci, co) => Math.max(0, Math.round((Date.parse(co + 'T00:00:00Z') - Date.parse(ci + 'T00:00:00Z')) / 86400000));

// atualiza a métrica de uso "imoveis" = nº de imóveis ativos do tenant
function sincronizarUsoImoveis(tenantId) {
  const n = db.prepare("SELECT COUNT(*) n FROM app_imoveis WHERE tenant_id = ? AND ativo = 1").get(tenantId).n;
  repo.Uso.set(tenantId, 'imoveis', n);
  return n;
}

// =====================================================================
// IMÓVEIS
// =====================================================================
const Imoveis = {
  listar(tenantId, { incluirInativos = true } = {}) {
    return db.prepare(`SELECT * FROM app_imoveis WHERE tenant_id = ? ${incluirInativos ? '' : 'AND ativo = 1'} ORDER BY nome`).all(tenantId)
      .map(i => ({ ...i, comodidades: j.parse(i.comodidades, []) }));
  },
  obter(tenantId, id) {
    const i = db.prepare('SELECT * FROM app_imoveis WHERE id = ? AND tenant_id = ?').get(s(id, 40), tenantId);
    return i ? { ...i, comodidades: j.parse(i.comodidades, []) } : null;
  },
  criar(tenantId, d) {
    const nome = s(d.nome, 200);
    if (!nome) throw new Error('Informe o nome do imóvel.');
    // limite de imóveis do plano (0 = ilimitado)
    const lim = repo.dentroLimite(tenantId, 'imoveis', 1);
    if (!lim.ok) throw new Error(`Limite de imóveis do plano atingido (${lim.usado}/${lim.limite}). Faça upgrade para cadastrar mais.`);
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO app_imoveis (id, tenant_id, workspace_id, codigo, nome, tipo, quartos, capacidade, endereco, comodidades, tarifa_base_centavos, ativo, obs, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, tenantId, s(d.workspace_id, 40), s(d.codigo, 40), nome, s(d.tipo, 30) || 'casa', Math.max(0, Number(d.quartos) || 0), Math.max(1, Number(d.capacidade) || 1),
        s(d.endereco, 300), j.str((d.comodidades || []).map(x => s(x, 60)).slice(0, 60)), cent(d.tarifa_base_centavos), 1, s(d.obs, 1000), agora, agora);
    sincronizarUsoImoveis(tenantId);
    return Imoveis.obter(tenantId, id);
  },
  atualizar(tenantId, id, d) {
    const i = db.prepare('SELECT * FROM app_imoveis WHERE id = ? AND tenant_id = ?').get(s(id, 40), tenantId);
    if (!i) throw new Error('Imóvel não encontrado.');
    const c = {
      codigo: d.codigo != null ? s(d.codigo, 40) : i.codigo,
      nome: d.nome != null ? s(d.nome, 200) : i.nome,
      tipo: d.tipo != null ? s(d.tipo, 30) : i.tipo,
      quartos: d.quartos != null ? Math.max(0, Number(d.quartos) || 0) : i.quartos,
      capacidade: d.capacidade != null ? Math.max(1, Number(d.capacidade) || 1) : i.capacidade,
      endereco: d.endereco != null ? s(d.endereco, 300) : i.endereco,
      comodidades: d.comodidades != null ? j.str((d.comodidades || []).map(x => s(x, 60)).slice(0, 60)) : i.comodidades,
      tarifa: d.tarifa_base_centavos != null ? cent(d.tarifa_base_centavos) : i.tarifa_base_centavos,
      ativo: d.ativo != null ? (d.ativo ? 1 : 0) : i.ativo,
      obs: d.obs != null ? s(d.obs, 1000) : i.obs,
    };
    db.prepare('UPDATE app_imoveis SET codigo=?, nome=?, tipo=?, quartos=?, capacidade=?, endereco=?, comodidades=?, tarifa_base_centavos=?, ativo=?, obs=?, atualizado_em=? WHERE id=? AND tenant_id=?')
      .run(c.codigo, c.nome, c.tipo, c.quartos, c.capacidade, c.endereco, c.comodidades, c.tarifa, c.ativo, c.obs, nowISO(), i.id, tenantId);
    sincronizarUsoImoveis(tenantId);
    return Imoveis.obter(tenantId, id);
  },
  remover(tenantId, id) {
    const r = db.prepare('DELETE FROM app_imoveis WHERE id = ? AND tenant_id = ?').run(s(id, 40), tenantId);
    sincronizarUsoImoveis(tenantId);
    return { removidos: r.changes };
  },
};

// =====================================================================
// HÓSPEDES
// =====================================================================
const Hospedes = {
  listar(tenantId, busca = '') {
    if (busca) { const b = `%${s(busca, 60)}%`; return db.prepare('SELECT * FROM app_hospedes WHERE tenant_id = ? AND (nome LIKE ? OR email LIKE ? OR telefone LIKE ?) ORDER BY nome LIMIT 200').all(tenantId, b, b, b); }
    return db.prepare('SELECT * FROM app_hospedes WHERE tenant_id = ? ORDER BY nome LIMIT 500').all(tenantId);
  },
  criar(tenantId, d) {
    const nome = s(d.nome, 200);
    if (!nome) throw new Error('Informe o nome do hóspede.');
    const id = novoId();
    db.prepare('INSERT INTO app_hospedes (id, tenant_id, nome, email, telefone, documento, obs, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, tenantId, nome, s(d.email, 120), s(d.telefone, 30), s(d.documento, 40), s(d.obs, 1000), nowISO());
    return db.prepare('SELECT * FROM app_hospedes WHERE id = ?').get(id);
  },
};

// =====================================================================
// RESERVAS (com anti-overbooking e limite mensal do plano)
// =====================================================================
function conflitoReserva(tenantId, imovelId, checkin, checkout, ignoreId = '') {
  // sobreposição: novo.checkin < existente.checkout E novo.checkout > existente.checkin
  return db.prepare(`SELECT id, checkin, checkout FROM app_reservas
    WHERE tenant_id = ? AND imovel_id = ? AND status IN ('pendente','confirmada') AND id != ?
      AND checkin < ? AND checkout > ?`).get(tenantId, imovelId, s(ignoreId, 40), checkout, checkin) || null;
}

const Reservas = {
  listar(tenantId, { status = '', imovel_id = '', de = '', ate = '', limite = 300 } = {}) {
    let sql = `SELECT r.*, i.nome AS imovel_nome FROM app_reservas r LEFT JOIN app_imoveis i ON i.id = r.imovel_id WHERE r.tenant_id = ?`;
    const args = [tenantId];
    if (status) { sql += ' AND r.status = ?'; args.push(status); }
    if (imovel_id) { sql += ' AND r.imovel_id = ?'; args.push(s(imovel_id, 40)); }
    if (de) { sql += ' AND r.checkout >= ?'; args.push(dia(de)); }
    if (ate) { sql += ' AND r.checkin <= ?'; args.push(dia(ate)); }
    sql += ' ORDER BY r.checkin DESC LIMIT ?'; args.push(Math.min(Number(limite) || 300, 1000));
    return db.prepare(sql).all(...args);
  },
  obter(tenantId, id) {
    return db.prepare('SELECT r.*, i.nome AS imovel_nome FROM app_reservas r LEFT JOIN app_imoveis i ON i.id = r.imovel_id WHERE r.id = ? AND r.tenant_id = ?').get(s(id, 40), tenantId) || null;
  },
  criar(tenantId, d) {
    const imovel = Imoveis.obter(tenantId, d.imovel_id);
    if (!imovel) throw new Error('Selecione um imóvel válido.');
    const checkin = dia(d.checkin), checkout = dia(d.checkout);
    if (!checkin || !checkout || checkout <= checkin) throw new Error('Datas inválidas: o check-out deve ser depois do check-in.');
    const status = ['pendente', 'confirmada', 'cancelada', 'concluida'].includes(d.status) ? d.status : 'confirmada';
    if (status !== 'cancelada') {
      const conf = conflitoReserva(tenantId, imovel.id, checkin, checkout);
      if (conf) throw new Error(`Conflito de datas: já existe reserva nesse imóvel de ${conf.checkin} a ${conf.checkout} (overbooking).`);
    }
    // limite mensal de reservas do plano (0 = ilimitado)
    const lim = repo.dentroLimite(tenantId, 'reservas_mes', 1);
    if (!lim.ok) throw new Error(`Limite de reservas do mês atingido (${lim.usado}/${lim.limite}). Faça upgrade para lançar mais.`);

    let hospedeNome = s(d.hospede_nome, 200), hospedeId = s(d.hospede_id, 40);
    if (hospedeId) { const hp = db.prepare('SELECT nome FROM app_hospedes WHERE id = ? AND tenant_id = ?').get(hospedeId, tenantId); if (hp) hospedeNome = hp.nome; }
    const id = novoId(); const agora = nowISO();
    const noites = noitesEntre(checkin, checkout);
    db.prepare(`INSERT INTO app_reservas (id, tenant_id, imovel_id, hospede_id, hospede_nome, checkin, checkout, noites, hospedes_qtd, valor_centavos, canal, status, obs, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, tenantId, imovel.id, hospedeId, hospedeNome, checkin, checkout, noites, Math.max(1, Number(d.hospedes_qtd) || 1),
        cent(d.valor_centavos), s(d.canal, 20) || 'direto', status, s(d.obs, 1000), agora, agora);
    repo.Uso.registrar(tenantId, 'reservas_mes', 1);
    // efeitos: gera limpeza de check-out + lança receita (se houver valor)
    if (status === 'confirmada' || status === 'concluida') {
      Limpezas.criar(tenantId, { imovel_id: imovel.id, reserva_id: id, data: checkout, tipo: 'checkout' }, true);
      if (cent(d.valor_centavos) > 0) Financeiro.criar(tenantId, { tipo: 'receita', categoria: 'hospedagem', descricao: `Reserva ${hospedeNome || imovel.nome}`, valor_centavos: d.valor_centavos, data: checkin, imovel_id: imovel.id, reserva_id: id }, true);
    }
    return Reservas.obter(tenantId, id);
  },
  mudarStatus(tenantId, id, status) {
    if (!['pendente', 'confirmada', 'cancelada', 'concluida'].includes(status)) throw new Error('Status inválido.');
    const r = db.prepare('UPDATE app_reservas SET status = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?').run(status, nowISO(), s(id, 40), tenantId);
    if (!r.changes) throw new Error('Reserva não encontrada.');
    return Reservas.obter(tenantId, id);
  },
  // ocupação de um mês por imóvel (para o calendário)
  calendario(tenantId, ano, mes) {
    const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const fim = `${ano}-${String(mes).padStart(2, '0')}-31`;
    return db.prepare(`SELECT r.id, r.imovel_id, i.nome AS imovel_nome, r.hospede_nome, r.checkin, r.checkout, r.canal, r.status
      FROM app_reservas r LEFT JOIN app_imoveis i ON i.id = r.imovel_id
      WHERE r.tenant_id = ? AND r.status IN ('pendente','confirmada','concluida') AND r.checkin <= ? AND r.checkout >= ?
      ORDER BY i.nome, r.checkin`).all(tenantId, fim, ini);
  },
};

// =====================================================================
// LIMPEZAS
// =====================================================================
const Limpezas = {
  listar(tenantId, { status = '', de = '', ate = '', limite = 300 } = {}) {
    let sql = `SELECT l.*, i.nome AS imovel_nome FROM app_limpezas l LEFT JOIN app_imoveis i ON i.id = l.imovel_id WHERE l.tenant_id = ?`;
    const args = [tenantId];
    if (status) { sql += ' AND l.status = ?'; args.push(status); }
    if (de) { sql += ' AND l.data >= ?'; args.push(dia(de)); }
    if (ate) { sql += ' AND l.data <= ?'; args.push(dia(ate)); }
    sql += ' ORDER BY l.data DESC LIMIT ?'; args.push(Math.min(Number(limite) || 300, 1000));
    return db.prepare(sql).all(...args);
  },
  criar(tenantId, d, interno = false) {
    const imovel = Imoveis.obter(tenantId, d.imovel_id);
    if (!imovel) { if (interno) return null; throw new Error('Selecione um imóvel válido.'); }
    const data = dia(d.data);
    if (!data) { if (interno) return null; throw new Error('Informe a data.'); }
    // evita duplicar a limpeza automática da mesma reserva/tipo
    if (d.reserva_id) { const ex = db.prepare('SELECT id FROM app_limpezas WHERE tenant_id = ? AND reserva_id = ? AND tipo = ?').get(tenantId, s(d.reserva_id, 40), s(d.tipo, 20) || 'checkout'); if (ex) return ex; }
    const id = novoId();
    db.prepare('INSERT INTO app_limpezas (id, tenant_id, imovel_id, reserva_id, data, tipo, status, responsavel, obs, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, tenantId, imovel.id, s(d.reserva_id, 40), data, s(d.tipo, 20) || 'checkout', 'pendente', s(d.responsavel, 120), s(d.obs, 500), nowISO());
    return db.prepare('SELECT * FROM app_limpezas WHERE id = ?').get(id);
  },
  concluir(tenantId, id, concluir = true) {
    const r = db.prepare('UPDATE app_limpezas SET status = ?, concluida_em = ? WHERE id = ? AND tenant_id = ?')
      .run(concluir ? 'concluida' : 'pendente', concluir ? nowISO() : '', s(id, 40), tenantId);
    if (!r.changes) throw new Error('Limpeza não encontrada.');
    return { ok: true };
  },
};

// =====================================================================
// MANUTENÇÃO
// =====================================================================
const Manutencao = {
  listar(tenantId, { status = '' } = {}) {
    let sql = 'SELECT m.*, i.nome AS imovel_nome FROM app_manutencao m LEFT JOIN app_imoveis i ON i.id = m.imovel_id WHERE m.tenant_id = ?';
    const args = [tenantId];
    if (status) { sql += ' AND m.status = ?'; args.push(status); }
    sql += ' ORDER BY CASE m.prioridade WHEN \'alta\' THEN 0 WHEN \'media\' THEN 1 ELSE 2 END, m.criado_em DESC LIMIT 300';
    return db.prepare(sql).all(...args);
  },
  criar(tenantId, d) {
    const titulo = s(d.titulo, 200);
    if (!titulo) throw new Error('Informe o título do chamado.');
    const id = novoId(); const agora = nowISO();
    db.prepare('INSERT INTO app_manutencao (id, tenant_id, imovel_id, titulo, descricao, prioridade, status, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, tenantId, s(d.imovel_id, 40), titulo, s(d.descricao, 1000), ['alta', 'media', 'baixa'].includes(d.prioridade) ? d.prioridade : 'media', 'aberto', agora, agora);
    return db.prepare('SELECT * FROM app_manutencao WHERE id = ?').get(id);
  },
  mudarStatus(tenantId, id, status) {
    if (!['aberto', 'em_andamento', 'resolvido'].includes(status)) throw new Error('Status inválido.');
    const r = db.prepare('UPDATE app_manutencao SET status = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?').run(status, nowISO(), s(id, 40), tenantId);
    if (!r.changes) throw new Error('Chamado não encontrado.');
    return { ok: true };
  },
};

// =====================================================================
// FINANCEIRO
// =====================================================================
const Financeiro = {
  listar(tenantId, { de = '', ate = '', tipo = '', limite = 500 } = {}) {
    let sql = 'SELECT f.*, i.nome AS imovel_nome FROM app_financeiro f LEFT JOIN app_imoveis i ON i.id = f.imovel_id WHERE f.tenant_id = ?';
    const args = [tenantId];
    if (tipo) { sql += ' AND f.tipo = ?'; args.push(tipo); }
    if (de) { sql += ' AND f.data >= ?'; args.push(dia(de)); }
    if (ate) { sql += ' AND f.data <= ?'; args.push(dia(ate)); }
    sql += ' ORDER BY f.data DESC LIMIT ?'; args.push(Math.min(Number(limite) || 500, 2000));
    return db.prepare(sql).all(...args);
  },
  criar(tenantId, d, interno = false) {
    const tipo = d.tipo === 'despesa' ? 'despesa' : 'receita';
    const valor = cent(d.valor_centavos);
    if (!valor && !interno) throw new Error('Informe um valor.');
    const id = novoId();
    db.prepare('INSERT INTO app_financeiro (id, tenant_id, tipo, categoria, descricao, valor_centavos, data, imovel_id, reserva_id, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, tenantId, tipo, s(d.categoria, 30), s(d.descricao, 300), valor, dia(d.data) || new Date().toISOString().slice(0, 10), s(d.imovel_id, 40), s(d.reserva_id, 40), nowISO());
    return db.prepare('SELECT * FROM app_financeiro WHERE id = ?').get(id);
  },
  resumo(tenantId, periodo = periodoAtual()) {
    const like = periodo + '%';
    const rec = db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v FROM app_financeiro WHERE tenant_id = ? AND tipo = 'receita' AND data LIKE ?").get(tenantId, like).v;
    const des = db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v FROM app_financeiro WHERE tenant_id = ? AND tipo = 'despesa' AND data LIKE ?").get(tenantId, like).v;
    return { periodo, receita_centavos: rec, despesa_centavos: des, resultado_centavos: rec - des };
  },
};

// =====================================================================
// PAINEL do assinante (visão geral da operação)
// =====================================================================
function painel(tenantId) {
  const hoje = new Date().toISOString().slice(0, 10);
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const um = (sql, ...a) => db.prepare(sql).get(tenantId, ...a).n;
  return {
    imoveis: um('SELECT COUNT(*) n FROM app_imoveis WHERE tenant_id = ? AND ativo = 1'),
    reservas_ativas: um("SELECT COUNT(*) n FROM app_reservas WHERE tenant_id = ? AND status IN ('pendente','confirmada')"),
    checkins_7d: um("SELECT COUNT(*) n FROM app_reservas WHERE tenant_id = ? AND status IN ('pendente','confirmada') AND checkin >= ? AND checkin <= ?", hoje, em7),
    checkouts_7d: um("SELECT COUNT(*) n FROM app_reservas WHERE tenant_id = ? AND status IN ('pendente','confirmada','concluida') AND checkout >= ? AND checkout <= ?", hoje, em7),
    limpezas_pendentes: um("SELECT COUNT(*) n FROM app_limpezas WHERE tenant_id = ? AND status = 'pendente'"),
    manutencao_aberta: um("SELECT COUNT(*) n FROM app_manutencao WHERE tenant_id = ? AND status IN ('aberto','em_andamento')"),
    financeiro_mes: Financeiro.resumo(tenantId),
    proximas: db.prepare(`SELECT r.checkin, r.checkout, r.hospede_nome, r.status, i.nome AS imovel_nome
      FROM app_reservas r LEFT JOIN app_imoveis i ON i.id = r.imovel_id
      WHERE r.tenant_id = ? AND r.status IN ('pendente','confirmada') AND r.checkout >= ? ORDER BY r.checkin LIMIT 8`).all(tenantId, hoje),
  };
}

module.exports = { Imoveis, Hospedes, Reservas, Limpezas, Manutencao, Financeiro, painel, sincronizarUsoImoveis, conflitoReserva };
