// =====================================================================
// Villela Docs Intelligence — repositório (Fase 1: fundação SaaS).
// REGRA: toda função que toca dado de empresa recebe tenantId como
// PRIMEIRO argumento e o usa no WHERE — nunca confiar em id "global"
// vindo do cliente (anti-IDOR). O selftest verifica o isolamento.
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, transacao, nowISO, novoId, sha256, j } = require('./db');
const { papelValido } = require('./permissoes');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const emailNorm = (v) => s(v, 160).toLowerCase();
const emailOK = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const periodoAtual = () => nowISO().slice(0, 7); // 'YYYY-MM'

// ------------------------------------------------------------ planos
const PLANOS_SEED = [
  { slug: 'starter', nome: 'Starter', preco_centavos: 9900, ordem: 1, descricao: 'Para equipes pequenas organizarem seus documentos.', limites: { usuarios: 5, armazenamento_mb: 10240, documentos: 2000, ocr_paginas_mes: 500, ia_consultas_mes: 50, workflows_ativos: 2, api: false, sso: false } },
  { slug: 'professional', nome: 'Professional', preco_centavos: 24900, ordem: 2, descricao: 'Workflows, IA documental e busca avançada.', limites: { usuarios: 20, armazenamento_mb: 51200, documentos: 20000, ocr_paginas_mes: 3000, ia_consultas_mes: 300, workflows_ativos: 10, api: false, sso: false } },
  { slug: 'business', nome: 'Business', preco_centavos: 59900, ordem: 3, descricao: 'Para operações com volume e integrações via API.', limites: { usuarios: 60, armazenamento_mb: 204800, documentos: 100000, ocr_paginas_mes: 15000, ia_consultas_mes: 1500, workflows_ativos: 50, api: true, sso: false } },
  { slug: 'enterprise', nome: 'Enterprise', preco_centavos: 0, ordem: 4, descricao: 'Limites customizados, SSO e suporte dedicado. Sob consulta.', limites: { usuarios: 0, armazenamento_mb: 0, documentos: 0, ocr_paginas_mes: 0, ia_consultas_mes: 0, workflows_ativos: 0, api: true, sso: true } }, // 0 = ilimitado/negociado
];
function semearPlanos() {
  for (const p of PLANOS_SEED) {
    if (db.prepare('SELECT 1 FROM plans WHERE slug = ?').get(p.slug)) continue;
    db.prepare('INSERT INTO plans (id, slug, nome, descricao, preco_centavos, limites, ativo, ordem, criado_em) VALUES (?,?,?,?,?,?,1,?,?)')
      .run(novoId(), p.slug, p.nome, p.descricao, p.preco_centavos, j.str(p.limites), p.ordem, nowISO());
  }
}
const listarPlanos = (soAtivos = true) =>
  db.prepare(`SELECT * FROM plans ${soAtivos ? 'WHERE ativo = 1' : ''} ORDER BY ordem`).all()
    .map(p => ({ ...p, limites: j.parse(p.limites, {}) }));
const planoPorSlug = (slug) => listarPlanos(false).find(p => p.slug === slug);
function atualizarPlano(id, campos) {
  const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(String(id));
  if (!p) throw new Error('Plano não encontrado.');
  const preco = campos.preco_centavos != null ? Math.max(0, Math.trunc(Number(campos.preco_centavos) || 0)) : p.preco_centavos;
  const limites = campos.limites != null ? j.str(campos.limites) : p.limites;
  const ativo = campos.ativo != null ? (campos.ativo ? 1 : 0) : p.ativo;
  db.prepare('UPDATE plans SET nome = ?, descricao = ?, preco_centavos = ?, limites = ?, ativo = ?, atualizado_em = ? WHERE id = ?')
    .run(s(campos.nome || p.nome, 60), s(campos.descricao ?? p.descricao, 300), preco, limites, ativo, nowISO(), p.id);
  return db.prepare('SELECT * FROM plans WHERE id = ?').get(p.id);
}

// ------------------------------------------------------------ auditoria
function auditar(tenantId, ator, acao, entidade, entidadeId, detalhes, ip) {
  db.prepare('INSERT INTO audit_logs (tenant_id, user_id, usuario_nome, acao, entidade, entidade_id, detalhes, ip, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(String(tenantId || ''), s(ator && ator.id, 40), s(ator && ator.nome, 120),
      s(acao, 80), s(entidade, 40), s(entidadeId, 40), j.str(detalhes || {}), s(ip, 60), nowISO());
}
function listarAuditoria(tenantId, { limite = 100, antes = '' } = {}) {
  const lim = Math.min(Math.max(1, Number(limite) || 100), 500);
  if (antes) {
    return db.prepare('SELECT * FROM audit_logs WHERE tenant_id = ? AND criado_em < ? ORDER BY criado_em DESC, id DESC LIMIT ?')
      .all(String(tenantId), s(antes, 40), lim);
  }
  return db.prepare('SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY criado_em DESC, id DESC LIMIT ?')
    .all(String(tenantId), lim);
}

// ------------------------------------------------------------ uso e limites
function registrarUso(tenantId, metrica, delta = 1) {
  db.prepare(`INSERT INTO usage_records (tenant_id, periodo, metrica, quantidade, atualizado_em) VALUES (?,?,?,?,?)
    ON CONFLICT (tenant_id, periodo, metrica) DO UPDATE SET quantidade = quantidade + excluded.quantidade, atualizado_em = excluded.atualizado_em`)
    .run(String(tenantId), periodoAtual(), s(metrica, 40), Math.trunc(Number(delta) || 0), nowISO());
}
function usoDoMes(tenantId) {
  const rows = db.prepare('SELECT metrica, quantidade FROM usage_records WHERE tenant_id = ? AND periodo = ?')
    .all(String(tenantId), periodoAtual());
  const uso = {};
  for (const r of rows) uso[r.metrica] = r.quantidade;
  // métricas "vivas" (contadas na hora, não acumuladas no mês)
  uso.usuarios = db.prepare("SELECT COUNT(*) n FROM tenant_users WHERE tenant_id = ? AND status = 'ativo'").get(String(tenantId)).n;
  uso.documentos = db.prepare("SELECT COUNT(*) n FROM documents WHERE tenant_id = ? AND status = 'ativo'").get(String(tenantId)).n;
  uso.armazenamento_mb = Math.ceil(db.prepare('SELECT COALESCE(SUM(tamanho),0) t FROM document_versions WHERE tenant_id = ?').get(String(tenantId)).t / (1024 * 1024));
  return uso;
}
function planoDoTenant(tenantId) {
  const sub = db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ? AND status IN ('trial','ativa') ORDER BY criado_em DESC LIMIT 1").get(String(tenantId));
  if (!sub) return null;
  const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(sub.plan_id);
  return p ? { ...p, limites: j.parse(p.limites, {}), subscription: sub } : null;
}
// Lança erro se a métrica estourar o limite do plano (0 = ilimitado).
// Métricas mensais têm sufixo _mes na chave de limites do plano.
const LIMITE_POR_METRICA = { usuarios: 'usuarios', documentos: 'documentos', armazenamento_mb: 'armazenamento_mb', ia_consultas: 'ia_consultas_mes', ocr_paginas: 'ocr_paginas_mes' };
function checarLimite(tenantId, metrica, adicionando = 1) {
  const plano = planoDoTenant(tenantId);
  if (!plano) throw new Error('Empresa sem assinatura ativa.');
  const lim = Number(plano.limites[LIMITE_POR_METRICA[metrica] || metrica] || 0);
  if (!lim) return; // ilimitado/negociado
  const atual = Number(usoDoMes(tenantId)[metrica] || 0);
  if (atual + adicionando > lim) {
    throw new Error(`Limite do plano ${plano.nome} atingido para ${metrica} (${atual}/${lim}). Faça upgrade para continuar.`);
  }
}

// ------------------------------------------------------------ tenants
function slugDisponivel(base) {
  let slug = s(base, 60).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'empresa';
  let n = 1, cand = slug;
  while (db.prepare('SELECT 1 FROM tenants WHERE slug = ?').get(cand)) cand = `${slug}-${++n}`;
  return cand;
}

// Cadastro do trial: cria tenant + usuário dono + assinatura trial, tudo em transação.
function criarTenantComDono({ empresa, nome, email, senha, ip }) {
  const em = emailNorm(email);
  if (!s(empresa, 120)) throw new Error('Informe o nome da empresa.');
  if (!s(nome, 120)) throw new Error('Informe o seu nome.');
  if (!emailOK(em)) throw new Error('E-mail inválido.');
  if (String(senha || '').length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(em)) {
    throw new Error('Este e-mail já tem conta. Entre pelo login e crie a empresa por lá, ou use outro e-mail.');
  }
  const plano = planoPorSlug('professional'); // trial roda no Professional
  if (!plano) throw new Error('Planos não configurados.');
  return transacao(() => {
    const agora = nowISO();
    const trialFim = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    const tenant = { id: novoId(), slug: slugDisponivel(empresa), nome: s(empresa, 120) };
    db.prepare('INSERT INTO tenants (id, slug, nome, email_contato, status, trial_expira_em, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(tenant.id, tenant.slug, tenant.nome, em, 'trial', trialFim, agora);
    const user = { id: novoId(), email: em, nome: s(nome, 120) };
    db.prepare('INSERT INTO users (id, email, nome, senha_hash, ativo, criado_em) VALUES (?,?,?,?,1,?)')
      .run(user.id, em, user.nome, bcrypt.hashSync(String(senha), 10), agora);
    db.prepare('INSERT INTO tenant_users (id, tenant_id, user_id, papel, status, criado_em, criado_por) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), tenant.id, user.id, 'dono', 'ativo', agora, user.id);
    db.prepare('INSERT INTO subscriptions (id, tenant_id, plan_id, status, inicio, fim, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), tenant.id, plano.id, 'trial', agora, trialFim, agora);
    auditar(tenant.id, user, 'tenant.criar', 'tenant', tenant.id, { empresa: tenant.nome, plano: plano.slug, trial_expira_em: trialFim }, ip);
    return { tenant: obterTenant(tenant.id), user };
  });
}
const obterTenant = (id) => db.prepare('SELECT * FROM tenants WHERE id = ?').get(String(id));
function atualizarTenant(tenantId, campos, ator, ip) {
  const t = obterTenant(tenantId);
  if (!t) throw new Error('Empresa não encontrada.');
  db.prepare('UPDATE tenants SET nome = ?, cnpj = ?, email_contato = ?, telefone = ?, atualizado_em = ? WHERE id = ?')
    .run(s(campos.nome || t.nome, 120), s(campos.cnpj ?? t.cnpj, 20), emailNorm(campos.email_contato ?? t.email_contato),
      s(campos.telefone ?? t.telefone, 30), nowISO(), t.id);
  auditar(t.id, ator, 'tenant.atualizar', 'tenant', t.id, { campos: Object.keys(campos) }, ip);
  return obterTenant(t.id);
}
// Ação da PLATAFORMA (staff Villela): muda status/plano do tenant.
function administrarTenant(tenantId, { status, plano_slug }, ator, ip) {
  const t = obterTenant(tenantId);
  if (!t) throw new Error('Empresa não encontrada.');
  if (status) {
    if (!['trial', 'ativa', 'suspensa', 'cancelada'].includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE tenants SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), t.id);
  }
  if (plano_slug) {
    const p = planoPorSlug(plano_slug);
    if (!p) throw new Error('Plano inválido.');
    transacao(() => {
      db.prepare("UPDATE subscriptions SET status = 'cancelada', fim = ?, atualizado_em = ? WHERE tenant_id = ? AND status IN ('trial','ativa')")
        .run(nowISO(), nowISO(), t.id);
      db.prepare('INSERT INTO subscriptions (id, tenant_id, plan_id, status, inicio, criado_em) VALUES (?,?,?,?,?,?)')
        .run(novoId(), t.id, p.id, 'ativa', nowISO(), nowISO());
    });
  }
  auditar('', ator, 'plataforma.tenant.administrar', 'tenant', t.id, { status: status || '', plano_slug: plano_slug || '' }, ip);
  auditar(t.id, ator, 'tenant.administrado_pela_plataforma', 'tenant', t.id, { status: status || '', plano_slug: plano_slug || '' }, ip);
  return obterTenant(t.id);
}

// ------------------------------------------------------------ settings
const CONFIG_PERMITIDAS = ['idioma', 'fuso', 'logo_url', 'cor_primaria', 'retencao_padrao_dias', 'retencao_lixeira_dias', 'notificar_email'];
function lerSettings(tenantId) {
  const out = {};
  for (const r of db.prepare('SELECT chave, valor FROM tenant_settings WHERE tenant_id = ?').all(String(tenantId))) out[r.chave] = r.valor;
  return out;
}
function gravarSetting(tenantId, chave, valor, ator, ip) {
  if (!CONFIG_PERMITIDAS.includes(chave)) throw new Error(`Configuração desconhecida: ${chave}`);
  db.prepare(`INSERT INTO tenant_settings (tenant_id, chave, valor, atualizado_em, atualizado_por) VALUES (?,?,?,?,?)
    ON CONFLICT (tenant_id, chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`)
    .run(String(tenantId), chave, s(valor, 500), nowISO(), s(ator && ator.id, 40));
  auditar(tenantId, ator, 'config.gravar', 'tenant_settings', chave, {}, ip);
}

// ------------------------------------------------------------ usuários e vínculos
const userPorEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(emailNorm(email));
const userPorId = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(String(id));
function vinculo(tenantId, userId) {
  return db.prepare('SELECT * FROM tenant_users WHERE tenant_id = ? AND user_id = ?').get(String(tenantId), String(userId));
}
function tenantsDoUsuario(userId) {
  return db.prepare(`SELECT t.id, t.slug, t.nome, t.status, tu.papel FROM tenant_users tu
    JOIN tenants t ON t.id = tu.tenant_id WHERE tu.user_id = ? AND tu.status = 'ativo' ORDER BY t.nome`).all(String(userId));
}
function listarUsuarios(tenantId) {
  return db.prepare(`SELECT tu.id AS vinculo_id, tu.papel, tu.status, tu.departamento, tu.criado_em,
      u.id AS user_id, u.nome, u.email, u.ultimo_login
    FROM tenant_users tu JOIN users u ON u.id = tu.user_id
    WHERE tu.tenant_id = ? AND tu.status != 'removido' ORDER BY u.nome`).all(String(tenantId));
}
function alterarVinculo(tenantId, vinculoId, { papel, status, departamento }, ator, ip) {
  const v = db.prepare('SELECT * FROM tenant_users WHERE id = ? AND tenant_id = ?').get(String(vinculoId), String(tenantId));
  if (!v) throw new Error('Usuário não encontrado nesta empresa.');
  if (v.papel === 'dono' && ((papel && papel !== 'dono') || (status && status !== 'ativo'))) {
    const donos = db.prepare("SELECT COUNT(*) n FROM tenant_users WHERE tenant_id = ? AND papel = 'dono' AND status = 'ativo'").get(v.tenant_id).n;
    if (donos <= 1) throw new Error('A empresa precisa manter pelo menos um Dono ativo.');
  }
  if (papel && !papelValido(papel, tenantId)) throw new Error('Papel inválido.');
  if (status && !['ativo', 'suspenso', 'removido'].includes(status)) throw new Error('Status inválido.');
  db.prepare('UPDATE tenant_users SET papel = ?, status = ?, departamento = ?, atualizado_em = ? WHERE id = ?')
    .run(papel || v.papel, status || v.status, s(departamento ?? v.departamento, 80), nowISO(), v.id);
  auditar(tenantId, ator, 'usuario.alterar_vinculo', 'tenant_users', v.id, { papel: papel || v.papel, status: status || v.status }, ip);
  return db.prepare('SELECT * FROM tenant_users WHERE id = ?').get(v.id);
}

// ------------------------------------------------------------ convites
function criarConvite(tenantId, { email, papel }, ator, ip) {
  const em = emailNorm(email);
  if (!emailOK(em)) throw new Error('E-mail inválido.');
  if (!papelValido(papel || 'usuario', tenantId)) throw new Error('Papel inválido.');
  if ((papel || '') === 'dono') throw new Error('Convite não pode conceder o papel Dono.');
  const existente = userPorEmail(em);
  if (existente && vinculo(tenantId, existente.id) && vinculo(tenantId, existente.id).status !== 'removido') {
    throw new Error('Este e-mail já participa da empresa.');
  }
  checarLimite(tenantId, 'usuarios', 1);
  const token = crypto.randomBytes(24).toString('base64url');
  const id = novoId();
  db.prepare('INSERT INTO access_invites (id, tenant_id, email, papel, token_hash, expira_em, criado_em, criado_por) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, String(tenantId), em, s(papel || 'usuario', 60), sha256(Buffer.from(token)),
      new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(), nowISO(), s(ator && ator.id, 40));
  auditar(tenantId, ator, 'usuario.convidar', 'access_invites', id, { email: em, papel: papel || 'usuario' }, ip);
  return { id, email: em, token }; // o token só existe aqui (vai no link); no banco fica o hash
}
const listarConvites = (tenantId) =>
  db.prepare("SELECT id, email, papel, expira_em, aceito_em, criado_em FROM access_invites WHERE tenant_id = ? AND aceito_em = '' ORDER BY criado_em DESC").all(String(tenantId));
function revogarConvite(tenantId, id, ator, ip) {
  const r = db.prepare("DELETE FROM access_invites WHERE id = ? AND tenant_id = ? AND aceito_em = ''").run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Convite não encontrado.');
  auditar(tenantId, ator, 'usuario.revogar_convite', 'access_invites', String(id), {}, ip);
}
// Aceite é público (via token) — cria/reaproveita o usuário global e vincula ao tenant.
function aceitarConvite(token, { nome, senha }, ip) {
  const inv = db.prepare("SELECT * FROM access_invites WHERE token_hash = ? AND aceito_em = ''").get(sha256(Buffer.from(String(token || ''))));
  if (!inv) throw new Error('Convite inválido ou já utilizado.');
  if (inv.expira_em < nowISO()) throw new Error('Convite expirado — peça um novo ao administrador.');
  checarLimite(inv.tenant_id, 'usuarios', 1);
  return transacao(() => {
    let user = userPorEmail(inv.email);
    if (!user) {
      if (!s(nome, 120)) throw new Error('Informe o seu nome.');
      if (String(senha || '').length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
      const id = novoId();
      db.prepare('INSERT INTO users (id, email, nome, senha_hash, ativo, criado_em) VALUES (?,?,?,?,1,?)')
        .run(id, inv.email, s(nome, 120), bcrypt.hashSync(String(senha), 10), nowISO());
      user = userPorId(id);
    }
    const v = vinculo(inv.tenant_id, user.id);
    if (v) {
      db.prepare("UPDATE tenant_users SET papel = ?, status = 'ativo', atualizado_em = ? WHERE id = ?").run(inv.papel, nowISO(), v.id);
    } else {
      db.prepare('INSERT INTO tenant_users (id, tenant_id, user_id, papel, status, criado_em, criado_por) VALUES (?,?,?,?,?,?,?)')
        .run(novoId(), inv.tenant_id, user.id, inv.papel, 'ativo', nowISO(), inv.criado_por);
    }
    db.prepare('UPDATE access_invites SET aceito_em = ? WHERE id = ?').run(nowISO(), inv.id);
    auditar(inv.tenant_id, user, 'usuario.aceitar_convite', 'access_invites', inv.id, { email: inv.email, papel: inv.papel }, ip);
    return { user, tenantId: inv.tenant_id };
  });
}

// ------------------------------------------------------------ papéis personalizados
const { PERMISSOES } = require('./permissoes');
const listarRoles = (tenantId) =>
  db.prepare('SELECT * FROM roles WHERE tenant_id = ? ORDER BY nome').all(String(tenantId))
    .map(r => ({ ...r, permissoes: j.parse(r.permissoes, []) }));
function salvarRole(tenantId, { id, nome, descricao, permissoes }, ator, ip) {
  const perms = (Array.isArray(permissoes) ? permissoes : []).filter(p => PERMISSOES[p]);
  if (!s(nome, 60)) throw new Error('Informe o nome do papel.');
  if (id) {
    const r = db.prepare('SELECT * FROM roles WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
    if (!r) throw new Error('Papel não encontrado.');
    db.prepare('UPDATE roles SET nome = ?, descricao = ?, permissoes = ?, atualizado_em = ? WHERE id = ?')
      .run(s(nome, 60), s(descricao, 200), j.str(perms), nowISO(), r.id);
    auditar(tenantId, ator, 'papel.atualizar', 'roles', r.id, { nome: s(nome, 60), permissoes: perms }, ip);
    return r.id;
  }
  const novo = novoId();
  db.prepare('INSERT INTO roles (id, tenant_id, nome, descricao, permissoes, criado_em, criado_por) VALUES (?,?,?,?,?,?,?)')
    .run(novo, String(tenantId), s(nome, 60), s(descricao, 200), j.str(perms), nowISO(), s(ator && ator.id, 40));
  auditar(tenantId, ator, 'papel.criar', 'roles', novo, { nome: s(nome, 60), permissoes: perms }, ip);
  return novo;
}
function excluirRole(tenantId, id, ator, ip) {
  const emUso = db.prepare('SELECT COUNT(*) n FROM tenant_users WHERE tenant_id = ? AND papel = ?').get(String(tenantId), 'custom:' + String(id)).n;
  if (emUso) throw new Error(`Papel em uso por ${emUso} usuário(s) — troque o papel deles antes.`);
  const r = db.prepare('DELETE FROM roles WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Papel não encontrado.');
  auditar(tenantId, ator, 'papel.excluir', 'roles', String(id), {}, ip);
}

// ------------------------------------------------------------ leads (landing)
function criarLead({ nome, email, telefone, empresa, mensagem, origem }) {
  const id = novoId();
  db.prepare('INSERT INTO leads (id, nome, email, telefone, empresa, mensagem, origem, criado_em) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, s(nome, 120), emailNorm(email), s(telefone, 30), s(empresa, 120), s(mensagem, 1000), s(origem || 'landing', 30), nowISO());
  return id;
}
const listarLeads = () => db.prepare('SELECT * FROM leads ORDER BY criado_em DESC LIMIT 500').all();
function atualizarLead(id, status) {
  if (!['novo', 'contactado', 'convertido', 'descartado'].includes(status)) throw new Error('Status inválido.');
  const r = db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, String(id));
  if (!r.changes) throw new Error('Lead não encontrado.');
}

// ------------------------------------------------------------ dashboards
function dashboardTenant(tenantId) {
  const uso = usoDoMes(tenantId);
  const plano = planoDoTenant(tenantId);
  const t = obterTenant(tenantId);
  const vencendo = require('./jobs').documentosVencendo(tenantId, 30); // require tardio (jobs → docs → repo)
  return {
    vencendo_30dias: vencendo.length,
    vencidos: vencendo.filter(d => d.vencido).length,
    docs_vencendo: vencendo.slice(0, 10),
    empresa: { nome: t.nome, status: t.status, trial_expira_em: t.trial_expira_em },
    usuarios_ativos: uso.usuarios,
    convites_pendentes: listarConvites(tenantId).length,
    documentos: uso.documentos || 0,           // Fase 2 passa a contar de verdade
    armazenamento_mb: uso.armazenamento_mb || 0,
    plano: plano ? { nome: plano.nome, slug: plano.slug, limites: plano.limites, status: plano.subscription.status } : null,
    uso,
    auditoria_recente: listarAuditoria(tenantId, { limite: 12 }),
  };
}
function resumoPlataforma() {
  const porStatus = {};
  for (const r of db.prepare('SELECT status, COUNT(*) n FROM tenants GROUP BY status').all()) porStatus[r.status] = r.n;
  const mrr = db.prepare(`SELECT COALESCE(SUM(p.preco_centavos),0) v FROM subscriptions sb
    JOIN plans p ON p.id = sb.plan_id JOIN tenants t ON t.id = sb.tenant_id
    WHERE sb.status = 'ativa' AND t.status = 'ativa'`).get().v;
  return {
    tenants_por_status: porStatus,
    tenants_total: db.prepare('SELECT COUNT(*) n FROM tenants').get().n,
    usuarios_total: db.prepare('SELECT COUNT(*) n FROM users WHERE ativo = 1').get().n,
    mrr_centavos: mrr,
    leads_novos: db.prepare("SELECT COUNT(*) n FROM leads WHERE status = 'novo'").get().n,
  };
}
function listarTenantsPlataforma() {
  return db.prepare('SELECT * FROM tenants ORDER BY criado_em DESC').all().map(t => {
    const plano = planoDoTenant(t.id);
    return { ...t, plano: plano ? plano.slug : '', usuarios: usoDoMes(t.id).usuarios };
  });
}

module.exports = {
  s, emailNorm, emailOK, periodoAtual,
  semearPlanos, listarPlanos, planoPorSlug, atualizarPlano,
  auditar, listarAuditoria,
  registrarUso, usoDoMes, planoDoTenant, checarLimite,
  criarTenantComDono, obterTenant, atualizarTenant, administrarTenant,
  lerSettings, gravarSetting, CONFIG_PERMITIDAS,
  userPorEmail, userPorId, vinculo, tenantsDoUsuario, listarUsuarios, alterarVinculo,
  criarConvite, listarConvites, revogarConvite, aceitarConvite,
  listarRoles, salvarRole, excluirRole,
  criarLead, listarLeads, atualizarLead,
  dashboardTenant, resumoPlataforma, listarTenantsPlataforma,
};
