// =====================================================================
// Villela Stay Manager (VSM) — repositório + MOTOR DE ENTITLEMENTS.
//
// Entitlements = coração do produto: dado o plano do tenant (+ overrides
// negociados em tenant_settings), resolve os MÓDULOS liberados, os LIMITES
// e as FEATURE FLAGS efetivas. É o que gateia a entrega do sistema de gestão
// de hospedagem a cada operação/anfitrião assinante.
//
// Números comerciais (preços/limites dos planos) são SEMENTES provisórias,
// editáveis no painel da plataforma — o Augusto define os finais. Ver README.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, periodoAtual, j } = require('./db');

const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const cent = (v) => Math.round(Number(v || 0));
const slugify = (t) => s(t, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('t' + novoId().toLowerCase());

// ---- catálogo de MÓDULOS do sistema de hospedagem (chaves) ----
const MODULOS = [
  ['imoveis', 'Imóveis e anúncios'], ['reservas', 'Reservas e calendário'],
  ['canais', 'Canais / OTAs (channel manager)'], ['checkin', 'Check-in / check-out'],
  ['limpeza', 'Limpeza e operações'], ['manutencao', 'Manutenção'],
  ['financeiro', 'Financeiro e repasses'], ['hospede', 'Comunicação e concierge'],
  ['precificacao', 'Precificação (revenue)'], ['contratos', 'Contratos de temporada'],
  ['relatorios', 'Relatórios e dashboards'], ['ia', 'IA (assistente)'],
  ['estoque', 'Estoque e insumos'],
];
const MODULOS_KEYS = MODULOS.map(m => m[0]);

// ---- catálogo de LIMITES (métrica → rótulo) ----
const LIMITES = [
  ['imoveis', 'Imóveis / anúncios'], ['usuarios', 'Usuários da equipe'],
  ['reservas_mes', 'Reservas / mês'], ['ia_consultas_mes', 'Consultas de IA / mês'],
  ['armazenamento_mb', 'Armazenamento (MB)'], ['workspaces', 'Workspaces (marcas/prédios)'],
];

// ---- FEATURE FLAGS globais (seed) ----
const FLAGS_SEED = [
  ['ia_direta', 'IA em modo direto', 'Respostas de IA na hora (assistente do anfitrião).', 0],
  ['api_publica', 'API pública', 'Acesso à API por chave (integrações do cliente).', 0],
  ['white_label', 'Marca própria (white-label)', 'Remove a marca Villela do painel e da área do hóspede.', 0],
  ['canais_ilimitados', 'Canais ilimitados', 'Conecta quantas OTAs/channel managers quiser.', 0],
  ['dominio_proprio', 'Domínio próprio', 'Painel e área do hóspede sob o domínio do cliente.', 0],
];

// ---- PLANOS (seed; preços FINAIS desde 11/07/2026 — seguem editáveis no painel) ----
const PLANOS_SEED = [
  {
    slug: 'trial', nome: 'Trial (14 dias)', descricao: 'Avaliação completa por 14 dias, sem cartão.',
    preco_centavos: 0, ordem: 0,
    limites: { imoveis: 3, usuarios: 2, reservas_mes: 30, ia_consultas_mes: 30, armazenamento_mb: 500, workspaces: 1 },
    modulos: MODULOS_KEYS, flags: { ia_direta: false, api_publica: false, white_label: false, canais_ilimitados: false, dominio_proprio: false },
  },
  {
    slug: 'starter', nome: 'Starter', descricao: 'Para o anfitrião com poucos imóveis começando a profissionalizar.',
    preco_centavos: 12900, ordem: 1,
    limites: { imoveis: 3, usuarios: 2, reservas_mes: 60, ia_consultas_mes: 0, armazenamento_mb: 2048, workspaces: 1 },
    modulos: ['imoveis', 'reservas', 'canais', 'checkin', 'limpeza', 'manutencao', 'financeiro', 'relatorios', 'estoque'],
    flags: { ia_direta: false, api_publica: false, white_label: false, canais_ilimitados: false, dominio_proprio: false },
  },
  {
    slug: 'pro', nome: 'Pro', descricao: 'Operação em crescimento: IA, precificação, API, estoque e concierge.',
    preco_centavos: 29900, ordem: 2,
    limites: { imoveis: 10, usuarios: 5, reservas_mes: 300, ia_consultas_mes: 300, armazenamento_mb: 10240, workspaces: 2 },
    modulos: ['imoveis', 'reservas', 'canais', 'checkin', 'limpeza', 'manutencao', 'financeiro', 'hospede', 'precificacao', 'contratos', 'relatorios', 'ia', 'estoque'],
    flags: { ia_direta: true, api_publica: true, white_label: false, canais_ilimitados: true, dominio_proprio: false },
  },
  {
    slug: 'business', nome: 'Business', descricao: 'Gestora estabelecida: tudo liberado, API, marca própria e domínio.',
    preco_centavos: 69900, ordem: 3,
    limites: { imoveis: 30, usuarios: 15, reservas_mes: 1500, ia_consultas_mes: 1500, armazenamento_mb: 51200, workspaces: 5 },
    modulos: MODULOS_KEYS, flags: { ia_direta: true, api_publica: true, white_label: true, canais_ilimitados: true, dominio_proprio: true },
  },
  {
    slug: 'enterprise', nome: 'Enterprise', descricao: 'Grandes gestoras e redes — sob consulta.',
    preco_centavos: 0, ordem: 4,
    limites: { imoveis: 0, usuarios: 0, reservas_mes: 0, ia_consultas_mes: 0, armazenamento_mb: 0, workspaces: 0 }, // 0 = ilimitado (enterprise)
    modulos: MODULOS_KEYS, flags: { ia_direta: true, api_publica: true, white_label: true, canais_ilimitados: true, dominio_proprio: true },
  },
];

function semear() {
  const agora = nowISO();
  const upP = db.prepare(`INSERT INTO plans (id, slug, nome, descricao, preco_centavos, ciclo, limites, modulos, flags, ativo, ordem, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,'mensal',?,?,?,1,?,?,?)
    ON CONFLICT(slug) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao, preco_centavos=excluded.preco_centavos,
      limites=excluded.limites, modulos=excluded.modulos, flags=excluded.flags, ordem=excluded.ordem, atualizado_em=excluded.atualizado_em`);
  for (const p of PLANOS_SEED) {
    // preserva preço já editado no painel: só semeia preço se o plano ainda não existe
    const existe = db.prepare('SELECT preco_centavos FROM plans WHERE slug = ?').get(p.slug);
    const preco = existe ? existe.preco_centavos : p.preco_centavos;
    upP.run(novoId(), p.slug, p.nome, p.descricao, preco, j.str(p.limites), j.str(p.modulos), j.str(p.flags), p.ordem, agora, agora);
  }
  const upF = db.prepare('INSERT INTO feature_flags (chave, nome, descricao, padrao, atualizado_em) VALUES (?,?,?,?,?) ON CONFLICT(chave) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao');
  for (const [ch, nome, desc, pad] of FLAGS_SEED) upF.run(ch, nome, desc, pad, agora);
}

// =====================================================================
// PLANOS
// =====================================================================
const Planos = {
  listar({ incluirInativos = false } = {}) {
    const rows = db.prepare(`SELECT * FROM plans ${incluirInativos ? '' : 'WHERE ativo = 1'} ORDER BY ordem`).all();
    return rows.map(hidratarPlano);
  },
  porSlug(slug) { const p = db.prepare('SELECT * FROM plans WHERE slug = ?').get(s(slug, 60)); return p ? hidratarPlano(p) : null; },
  porId(id) { const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(s(id, 40)); return p ? hidratarPlano(p) : null; },
  atualizar(id, d) {
    const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(s(id, 40));
    if (!p) throw new Error('Plano não encontrado.');
    const campos = {
      nome: d.nome != null ? s(d.nome, 120) : p.nome,
      descricao: d.descricao != null ? s(d.descricao, 500) : p.descricao,
      preco_centavos: d.preco_centavos != null ? cent(d.preco_centavos) : p.preco_centavos,
      limites: d.limites != null ? j.str(d.limites) : p.limites,
      modulos: d.modulos != null ? j.str((d.modulos || []).filter(m => MODULOS_KEYS.includes(m))) : p.modulos,
      flags: d.flags != null ? j.str(d.flags) : p.flags,
      ativo: d.ativo != null ? (d.ativo ? 1 : 0) : p.ativo,
    };
    db.prepare('UPDATE plans SET nome=?, descricao=?, preco_centavos=?, limites=?, modulos=?, flags=?, ativo=?, atualizado_em=? WHERE id=?')
      .run(campos.nome, campos.descricao, campos.preco_centavos, campos.limites, campos.modulos, campos.flags, campos.ativo, nowISO(), id);
    return Planos.porId(id);
  },
};
function hidratarPlano(p) {
  return { ...p, limites: j.parse(p.limites, {}), modulos: j.parse(p.modulos, []), flags: j.parse(p.flags, {}), preco_reais: (p.preco_centavos / 100) };
}

// =====================================================================
// TENANTS (operações / empresas de hospedagem)
// =====================================================================
const DIAS_TRIAL = parseInt(process.env.VSM_TRIAL_DIAS, 10) || 14;
const Tenants = {
  listar({ status = '', busca = '', limite = 200 } = {}) {
    let sql = `SELECT t.*, p.nome AS plano_nome, p.preco_centavos,
      (SELECT status FROM subscriptions sb WHERE sb.tenant_id = t.id ORDER BY criado_em DESC LIMIT 1) AS sub_status
      FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id`;
    const where = [], args = [];
    if (status) { where.push('t.status = ?'); args.push(status); }
    if (busca) { where.push('(t.nome LIKE ? OR t.cnpj LIKE ? OR t.email_contato LIKE ?)'); const b = `%${busca}%`; args.push(b, b, b); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY t.criado_em DESC LIMIT ?'; args.push(Math.min(Number(limite) || 200, 500));
    return db.prepare(sql).all(...args);
  },
  obter(id) {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(s(id, 40));
    if (!t) return null;
    t.plano = t.plan_id ? Planos.porId(t.plan_id) : null;
    t.settings = db.prepare('SELECT * FROM tenant_settings WHERE tenant_id = ?').get(t.id) || null;
    t.workspaces = db.prepare('SELECT * FROM workspaces WHERE tenant_id = ? ORDER BY criado_em').all(t.id);
    t.usuarios = db.prepare('SELECT id, nome, email, papel, ativo, ultimo_login FROM tenant_users WHERE tenant_id = ? ORDER BY criado_em').all(t.id);
    t.assinatura = db.prepare('SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT 1').get(t.id) || null;
    t.entitlements = entitlements(t.id);
    return t;
  },
  porEmail(email) {
    const u = db.prepare('SELECT tenant_id FROM tenant_users WHERE lower(email) = ? AND ativo = 1').get(s(email, 120).toLowerCase());
    return u ? Tenants.obter(u.tenant_id) : null;
  },
  // Resolve o usuário assinante (tenant_users.id do JWT vsm_sess) → dados da
  // operação (tenant). Retorna null se inativo/inexistente. Usado por uma
  // futura ponte de acesso ao app de gestão real (marco 2).
  usuarioAssinante(uid) {
    const u = db.prepare(`SELECT u.id, u.tenant_id, u.nome, u.email, u.papel, t.slug AS tenant_slug, t.status AS tenant_status
      FROM tenant_users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ? AND u.ativo = 1`).get(s(uid, 40));
    return u || null;
  },
  // cria operação + workspace padrão + usuário admin (sem senha ainda) + assinatura trial
  criar(d, quem) {
    const nome = s(d.nome, 200);
    if (!nome) throw new Error('Informe o nome da operação.');
    const email = s(d.email_contato || d.email, 120).toLowerCase();
    if (!email || !email.includes('@')) throw new Error('Informe um e-mail de contato válido.');
    const planoSlug = s(d.plano || 'trial', 60);
    const plano = Planos.porSlug(planoSlug) || Planos.porSlug('trial');
    return transacao(() => {
      const id = novoId(); const agora = nowISO();
      let slug = slugify(nome); let n = 1;
      while (db.prepare('SELECT 1 FROM tenants WHERE slug = ?').get(slug)) slug = slugify(nome) + '-' + (++n);
      const trialAte = new Date(Date.now() + DIAS_TRIAL * 86400000).toISOString();
      const ehTrial = plano.slug === 'trial' || plano.preco_centavos === 0 ? true : (d.iniciar_trial !== false);
      db.prepare(`INSERT INTO tenants (id, slug, nome, cnpj, site, email_contato, telefone, status, plan_id, trial_expira_em, origem, obs, criado_em, criado_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, slug, nome, s(d.cnpj, 20), s(d.site, 200), email, s(d.telefone, 20),
          ehTrial ? 'trial' : 'ativa', plano.id, ehTrial ? trialAte : '', s(d.origem, 30) || 'manual', s(d.obs, 1000), agora, s(quem, 60));
      db.prepare('INSERT INTO workspaces (id, tenant_id, nome, slug, criado_em) VALUES (?,?,?,?,?)').run(novoId(), id, 'Principal', 'principal', agora);
      db.prepare('INSERT INTO tenant_users (id, tenant_id, nome, email, papel, ativo, criado_em) VALUES (?,?,?,?,?,1,?)')
        .run(novoId(), id, s(d.nome_responsavel || nome, 120), email, 'admin', agora);
      db.prepare('INSERT INTO subscriptions (id, tenant_id, plan_id, status, ciclo, inicio, proximo_venc, criado_em) VALUES (?,?,?,?,?,?,?,?)')
        .run(novoId(), id, plano.id, ehTrial ? 'trial' : 'ativa', 'mensal', agora, ehTrial ? trialAte : '', agora);
      evento(id, 'tenant.criado', slug, { plano: plano.slug, trial: ehTrial });
      return Tenants.obter(id);
    });
  },
  atualizar(id, d, quem) {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(s(id, 40));
    if (!t) throw new Error('Operação não encontrada.');
    for (const c of ['nome', 'cnpj', 'site', 'email_contato', 'telefone', 'obs']) if (d[c] != null) t[c] = s(d[c], c === 'obs' ? 1000 : 200);
    db.prepare('UPDATE tenants SET nome=?, cnpj=?, site=?, email_contato=?, telefone=?, obs=?, atualizado_em=? WHERE id=?')
      .run(t.nome, t.cnpj, t.site, t.email_contato, t.telefone, t.obs, nowISO(), id);
    Auditoria.registrar({ tenant_id: id, quem, acao: 'tenant.editar', entidade: 'tenants', entidade_id: id });
    return Tenants.obter(id);
  },
  // muda status manualmente (suspender/reativar/cancelar pela plataforma)
  mudarStatus(id, status, quem, detalhe) {
    const ok = ['trial', 'ativa', 'inadimplente', 'suspensa', 'cancelada'];
    if (!ok.includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE tenants SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), s(id, 40));
    evento(id, 'tenant.status', status, { detalhe: detalhe || '' });
    Auditoria.registrar({ tenant_id: id, quem, acao: 'tenant.status:' + status, entidade: 'tenants', entidade_id: id, detalhe });
    return Tenants.obter(id);
  },
  definirPlano(id, planId, quem) {
    const plano = Planos.porId(planId) || Planos.porSlug(planId);
    if (!plano) throw new Error('Plano inválido.');
    db.prepare('UPDATE tenants SET plan_id = ?, atualizado_em = ? WHERE id = ?').run(plano.id, nowISO(), s(id, 40));
    Auditoria.registrar({ tenant_id: id, quem, acao: 'tenant.plano:' + plano.slug, entidade: 'tenants', entidade_id: id });
    evento(id, 'tenant.plano', plano.slug, {});
    return Tenants.obter(id);
  },
  addWorkspace(tenantId, nome) {
    const id = novoId();
    db.prepare('INSERT INTO workspaces (id, tenant_id, nome, slug, criado_em) VALUES (?,?,?,?,?)').run(id, s(tenantId, 40), s(nome, 120) || 'Workspace', slugify(nome || 'ws'), nowISO());
    return id;
  },
  addUsuario(tenantId, d) {
    const id = novoId();
    db.prepare('INSERT INTO tenant_users (id, tenant_id, nome, email, papel, ativo, criado_em) VALUES (?,?,?,?,?,1,?)')
      .run(id, s(tenantId, 40), s(d.nome, 120), s(d.email, 120).toLowerCase(), d.papel === 'usuario' ? 'usuario' : 'admin', nowISO());
    return id;
  },
};

// ---- Overrides negociados ----
function salvarSettings(tenantId, d) {
  const atual = db.prepare('SELECT * FROM tenant_settings WHERE tenant_id = ?').get(s(tenantId, 40)) || {};
  db.prepare(`INSERT INTO tenant_settings (tenant_id, limites_over, modulos_extra, flags_over, atualizado_em)
    VALUES (?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET limites_over=excluded.limites_over, modulos_extra=excluded.modulos_extra, flags_over=excluded.flags_over, atualizado_em=excluded.atualizado_em`)
    .run(s(tenantId, 40),
      d.limites_over != null ? j.str(d.limites_over) : (atual.limites_over || '{}'),
      d.modulos_extra != null ? j.str((d.modulos_extra || []).filter(m => MODULOS_KEYS.includes(m))) : (atual.modulos_extra || '[]'),
      d.flags_over != null ? j.str(d.flags_over) : (atual.flags_over || '{}'), nowISO());
}

// =====================================================================
// ENTITLEMENTS — plano + overrides → módulos/limites/flags efetivos
// =====================================================================
function entitlements(tenantId) {
  const t = db.prepare('SELECT id, status, plan_id, trial_expira_em FROM tenants WHERE id = ?').get(s(tenantId, 40));
  if (!t) return null;
  const plano = t.plan_id ? Planos.porId(t.plan_id) : null;
  const set = db.prepare('SELECT * FROM tenant_settings WHERE tenant_id = ?').get(t.id) || {};
  const limites = { ...(plano ? plano.limites : {}), ...j.parse(set.limites_over, {}) };
  const modulos = new Set([...(plano ? plano.modulos : []), ...j.parse(set.modulos_extra, [])]);
  const flags = { ...(plano ? plano.flags : {}), ...j.parse(set.flags_over, {}) };
  // acesso só quando trial/ativa; suspensa/cancelada/inadimplente = bloqueia entrega
  const acessoLiberado = ['trial', 'ativa'].includes(t.status);
  return {
    tenant_id: t.id, status: t.status, plano: plano ? plano.slug : null, acesso_liberado: acessoLiberado,
    modulos: [...modulos], limites, flags,
    trial_expira_em: t.trial_expira_em || '',
  };
}
// pode usar um módulo? (respeita status do tenant)
function podeModulo(tenantId, modulo) {
  const e = entitlements(tenantId);
  return !!(e && e.acesso_liberado && e.modulos.includes(modulo));
}
// está dentro do limite? (0 = ilimitado). Retorna {ok, limite, usado}
function dentroLimite(tenantId, metrica, incremento = 1) {
  const e = entitlements(tenantId);
  if (!e) return { ok: false, limite: 0, usado: 0 };
  const limite = Number(e.limites[metrica] || 0);
  const usado = Uso.atual(tenantId, metrica);
  if (limite === 0) return { ok: true, limite: 0, usado }; // ilimitado
  return { ok: (usado + incremento) <= limite, limite, usado };
}
function flag(tenantId, chave) {
  const e = entitlements(tenantId);
  if (e && chave in e.flags) return !!e.flags[chave];
  const f = db.prepare('SELECT padrao FROM feature_flags WHERE chave = ?').get(s(chave, 60));
  return !!(f && f.padrao);
}

// =====================================================================
// USO / MÉTRICAS
// =====================================================================
const Uso = {
  registrar(tenantId, metrica, delta = 1, periodo = periodoAtual()) {
    db.prepare(`INSERT INTO usage_records (tenant_id, periodo, metrica, quantidade, atualizado_em)
      VALUES (?,?,?,?,?) ON CONFLICT(tenant_id, periodo, metrica) DO UPDATE SET quantidade = quantidade + excluded.quantidade, atualizado_em = excluded.atualizado_em`)
      .run(s(tenantId, 40), periodo, s(metrica, 40), Math.round(Number(delta) || 0), nowISO());
  },
  set(tenantId, metrica, valor, periodo = periodoAtual()) {
    db.prepare(`INSERT INTO usage_records (tenant_id, periodo, metrica, quantidade, atualizado_em)
      VALUES (?,?,?,?,?) ON CONFLICT(tenant_id, periodo, metrica) DO UPDATE SET quantidade = excluded.quantidade, atualizado_em = excluded.atualizado_em`)
      .run(s(tenantId, 40), periodo, s(metrica, 40), Math.round(Number(valor) || 0), nowISO());
  },
  atual(tenantId, metrica, periodo = periodoAtual()) {
    const r = db.prepare('SELECT quantidade FROM usage_records WHERE tenant_id = ? AND periodo = ? AND metrica = ?').get(s(tenantId, 40), periodo, s(metrica, 40));
    return r ? r.quantidade : 0;
  },
  doTenant(tenantId, periodo = periodoAtual()) {
    const rows = db.prepare('SELECT metrica, quantidade FROM usage_records WHERE tenant_id = ? AND periodo = ?').all(s(tenantId, 40), periodo);
    const m = {}; for (const r of rows) m[r.metrica] = r.quantidade; return m;
  },
};

// =====================================================================
// CUSTO POR CLIENTE
// =====================================================================
const Custo = {
  registrar(tenantId, categoria, custoCentavos, detalhe, periodo = periodoAtual()) {
    db.prepare('INSERT INTO cost_records (id, tenant_id, periodo, categoria, custo_centavos, detalhe, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), s(tenantId, 40), periodo, s(categoria, 30) || 'outro', cent(custoCentavos), s(detalhe, 300), nowISO());
  },
  doTenant(tenantId, periodo = periodoAtual()) {
    return db.prepare('SELECT categoria, SUM(custo_centavos) total FROM cost_records WHERE tenant_id = ? AND periodo = ? GROUP BY categoria').all(s(tenantId, 40), periodo);
  },
  totalTenant(tenantId, periodo = periodoAtual()) {
    return db.prepare('SELECT COALESCE(SUM(custo_centavos),0) t FROM cost_records WHERE tenant_id = ? AND periodo = ?').get(s(tenantId, 40), periodo).t;
  },
};

// =====================================================================
// TICKETS / SUPORTE
// =====================================================================
const Tickets = {
  listar({ status = '', tenant_id = '', limite = 100 } = {}) {
    let sql = 'SELECT t.*, tn.nome AS tenant_nome FROM tickets t LEFT JOIN tenants tn ON tn.id = t.tenant_id';
    const where = [], args = [];
    if (status) { where.push('t.status = ?'); args.push(status); }
    if (tenant_id) { where.push('t.tenant_id = ?'); args.push(tenant_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY t.atualizado_em DESC, t.criado_em DESC LIMIT ?'; args.push(Math.min(Number(limite) || 100, 300));
    return db.prepare(sql).all(...args);
  },
  obter(id) {
    const t = db.prepare('SELECT t.*, tn.nome AS tenant_nome FROM tickets t LEFT JOIN tenants tn ON tn.id = t.tenant_id WHERE t.id = ?').get(s(id, 40));
    if (!t) return null;
    t.mensagens = db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY criado_em').all(t.id);
    return t;
  },
  abrir(tenantId, d, autorEmail) {
    const id = novoId(); const agora = nowISO();
    db.prepare('INSERT INTO tickets (id, tenant_id, assunto, prioridade, status, aberto_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, s(tenantId, 40), s(d.assunto, 200) || 'Suporte', ['alta', 'media', 'baixa'].includes(d.prioridade) ? d.prioridade : 'media', 'aberto', s(autorEmail, 120), agora, agora);
    if (d.texto) Tickets.responder(id, { texto: d.texto, lado: 'cliente', autor: autorEmail });
    evento(tenantId, 'ticket.aberto', id, { assunto: s(d.assunto, 120) });
    return id;
  },
  responder(id, { texto, lado, autor }) {
    const t = db.prepare('SELECT id, tenant_id FROM tickets WHERE id = ?').get(s(id, 40));
    if (!t) throw new Error('Ticket não encontrado.');
    const mid = novoId();
    db.prepare('INSERT INTO ticket_messages (id, ticket_id, autor, lado, texto, criado_em) VALUES (?,?,?,?,?,?)')
      .run(mid, id, s(autor, 120), lado === 'plataforma' ? 'plataforma' : 'cliente', s(texto, 4000), nowISO());
    const novoStatus = lado === 'plataforma' ? 'respondido' : 'em_andamento';
    db.prepare('UPDATE tickets SET status = ?, atualizado_em = ? WHERE id = ?').run(novoStatus, nowISO(), id);
    return mid;
  },
  mudarStatus(id, status) {
    const ok = ['aberto', 'em_andamento', 'respondido', 'resolvido', 'fechado'];
    if (!ok.includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE tickets SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), s(id, 40));
  },
};

// =====================================================================
// FEATURE FLAGS (catálogo) + LEADS + EVENTOS + AUDITORIA + DASHBOARD
// =====================================================================
const Flags = {
  listar: () => db.prepare('SELECT * FROM feature_flags ORDER BY chave').all(),
};

const Leads = {
  criar(d) {
    const id = novoId();
    db.prepare('INSERT INTO leads (id, nome, empresa, email, telefone, plano, mensagem, status, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, s(d.nome, 120), s(d.empresa, 200), s(d.email, 120), s(d.telefone, 20), s(d.plano, 60), s(d.mensagem, 2000), 'novo', nowISO());
    return id;
  },
  listar: (limite = 100) => db.prepare('SELECT * FROM leads ORDER BY criado_em DESC LIMIT ?').all(Math.min(Number(limite) || 100, 300)),
  status(id, st) { db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(s(st, 20), s(id, 40)); },
};

function evento(tenantId, tipo, ref, payload) {
  try {
    db.prepare('INSERT INTO platform_events (id, tenant_id, tipo, ref, payload, quando) VALUES (?,?,?,?,?,?)')
      .run(novoId(), s(tenantId, 40), s(tipo, 60), s(ref, 60), j.str(payload || {}).slice(0, 4000), nowISO());
  } catch (_) {}
}
const Eventos = { listar: (n = 100) => db.prepare('SELECT * FROM platform_events ORDER BY quando DESC LIMIT ?').all(Math.min(Number(n) || 100, 500)) };

const Auditoria = {
  registrar({ tenant_id, quem, acao, entidade, entidade_id, detalhe, ip }) {
    try {
      db.prepare('INSERT INTO audit_logs (id, quando, tenant_id, quem, acao, entidade, entidade_id, detalhe, ip) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(novoId(), nowISO(), s(tenant_id, 40), s(quem, 120) || 'plataforma', s(acao, 80), s(entidade, 40), s(entidade_id, 40), s(detalhe, 300), s(ip, 60));
    } catch (_) {}
  },
  listar: (n = 200) => db.prepare('SELECT * FROM audit_logs ORDER BY quando DESC LIMIT ?').all(Math.min(Number(n) || 200, 500)),
};

const Dashboard = {
  plataforma() {
    const um = (sql, ...a) => db.prepare(sql).get(...a).n;
    const periodo = periodoAtual();
    // MRR = soma do preço dos planos das assinaturas ativas
    const mrr = db.prepare(`SELECT COALESCE(SUM(p.preco_centavos),0) v FROM subscriptions sb
      JOIN plans p ON p.id = sb.plan_id JOIN tenants t ON t.id = sb.tenant_id
      WHERE sb.status = 'ativa' AND t.status = 'ativa'`).get().v;
    const custoMes = db.prepare('SELECT COALESCE(SUM(custo_centavos),0) v FROM cost_records WHERE periodo = ?').get(periodo).v;
    return {
      tenants_total: um('SELECT COUNT(*) n FROM tenants'),
      trials: um("SELECT COUNT(*) n FROM tenants WHERE status = 'trial'"),
      ativos: um("SELECT COUNT(*) n FROM tenants WHERE status = 'ativa'"),
      inadimplentes: um("SELECT COUNT(*) n FROM tenants WHERE status = 'inadimplente'"),
      suspensos: um("SELECT COUNT(*) n FROM tenants WHERE status IN ('suspensa','cancelada')"),
      trials_expirando_7d: um("SELECT COUNT(*) n FROM tenants WHERE status = 'trial' AND trial_expira_em != '' AND trial_expira_em <= ?", new Date(Date.now() + 7 * 86400000).toISOString()),
      tickets_abertos: um("SELECT COUNT(*) n FROM tickets WHERE status IN ('aberto','em_andamento')"),
      leads_novos: um("SELECT COUNT(*) n FROM leads WHERE status = 'novo'"),
      mrr_centavos: mrr, arr_centavos: mrr * 12, custo_mes_centavos: custoMes,
      por_plano: db.prepare(`SELECT p.nome, p.slug, COUNT(t.id) qtd FROM plans p LEFT JOIN tenants t ON t.plan_id = p.id AND t.status IN ('trial','ativa') GROUP BY p.id ORDER BY p.ordem`).all(),
    };
  },
  // margem por cliente: receita (preço do plano) − custo do período
  custoPorCliente(periodo = periodoAtual()) {
    return db.prepare(`SELECT t.id, t.nome, t.status, p.nome AS plano, p.preco_centavos AS receita_centavos,
      COALESCE((SELECT SUM(custo_centavos) FROM cost_records c WHERE c.tenant_id = t.id AND c.periodo = ?), 0) AS custo_centavos
      FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id ORDER BY t.criado_em DESC`).all(periodo)
      .map(r => ({ ...r, margem_centavos: (r.receita_centavos || 0) - (r.custo_centavos || 0) }));
  },
};

module.exports = {
  semear, slugify, MODULOS, MODULOS_KEYS, LIMITES, DIAS_TRIAL,
  Planos, Tenants, salvarSettings, entitlements, podeModulo, dentroLimite, flag,
  Uso, Custo, Tickets, Flags, Leads, evento, Eventos, Auditoria, Dashboard,
};
