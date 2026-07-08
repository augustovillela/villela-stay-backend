// =====================================================================
// Villela Projects & Events — repositório (Fase 1: fundação SaaS).
// REGRA (provada no Villela Docs): toda função que toca dado de empresa
// recebe tenantId como PRIMEIRO argumento e o usa no WHERE (anti-IDOR).
// LIÇÃO herdada: checarLimite mapeia métrica→chave do plano (as mensais
// têm sufixo _mes) — no vdocs esse mapa faltou e o limite não valia.
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, transacao, nowISO, novoId, sha256, j } = require('./db');
const { papelValido } = require('./permissoes');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const emailNorm = (v) => s(v, 160).toLowerCase();
const emailOK = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const periodoAtual = () => nowISO().slice(0, 7);

// ------------------------------------------------------------ planos
const PLANOS_SEED = [
  { slug: 'starter', nome: 'Starter', preco_centavos: 14900, ordem: 1, descricao: 'Portfólio e projetos para equipes pequenas.', limites: { usuarios: 5, projetos: 15, eventos_mes: 5, ia_consultas_mes: 50, automacoes: 3, portal_cliente: false, api: false } },
  { slug: 'professional', nome: 'Professional', preco_centavos: 34900, ordem: 2, descricao: 'Projetos + eventos + CRM com IA para operações em crescimento.', limites: { usuarios: 20, projetos: 60, eventos_mes: 25, ia_consultas_mes: 300, automacoes: 15, portal_cliente: true, api: false } },
  { slug: 'business', nome: 'Business', preco_centavos: 79900, ordem: 3, descricao: 'Operação completa com API, automações e dashboards avançados.', limites: { usuarios: 60, projetos: 300, eventos_mes: 100, ia_consultas_mes: 1500, automacoes: 60, portal_cliente: true, api: true } },
  { slug: 'enterprise', nome: 'Enterprise', preco_centavos: 0, ordem: 4, descricao: 'Limites sob medida, SSO e suporte dedicado. Sob consulta.', limites: { usuarios: 0, projetos: 0, eventos_mes: 0, ia_consultas_mes: 0, automacoes: 0, portal_cliente: true, api: true } },
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
  db.prepare('UPDATE plans SET nome = ?, descricao = ?, preco_centavos = ?, limites = ?, ativo = ?, atualizado_em = ? WHERE id = ?')
    .run(s(campos.nome || p.nome, 60), s(campos.descricao ?? p.descricao, 300),
      campos.preco_centavos != null ? Math.max(0, Math.trunc(Number(campos.preco_centavos) || 0)) : p.preco_centavos,
      campos.limites != null ? j.str(campos.limites) : p.limites,
      campos.ativo != null ? (campos.ativo ? 1 : 0) : p.ativo, nowISO(), p.id);
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
  if (antes) return db.prepare('SELECT * FROM audit_logs WHERE tenant_id = ? AND criado_em < ? ORDER BY criado_em DESC, id DESC LIMIT ?').all(String(tenantId), s(antes, 40), lim);
  return db.prepare('SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY criado_em DESC, id DESC LIMIT ?').all(String(tenantId), lim);
}

// ------------------------------------------------------------ uso e limites
function registrarUso(tenantId, metrica, delta = 1) {
  db.prepare(`INSERT INTO usage_records (tenant_id, periodo, metrica, quantidade, atualizado_em) VALUES (?,?,?,?,?)
    ON CONFLICT (tenant_id, periodo, metrica) DO UPDATE SET quantidade = quantidade + excluded.quantidade, atualizado_em = excluded.atualizado_em`)
    .run(String(tenantId), periodoAtual(), s(metrica, 40), Math.trunc(Number(delta) || 0), nowISO());
}
function usoDoMes(tenantId) {
  const uso = {};
  for (const r of db.prepare('SELECT metrica, quantidade FROM usage_records WHERE tenant_id = ? AND periodo = ?').all(String(tenantId), periodoAtual())) uso[r.metrica] = r.quantidade;
  uso.usuarios = db.prepare("SELECT COUNT(*) n FROM tenant_users WHERE tenant_id = ? AND status = 'ativo'").get(String(tenantId)).n;
  uso.projetos = db.prepare("SELECT COUNT(*) n FROM projects WHERE tenant_id = ? AND status IN ('ativo','pausado')").get(String(tenantId)).n;
  return uso;
}
function planoDoTenant(tenantId) {
  const sub = db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ? AND status IN ('trial','ativa') ORDER BY criado_em DESC LIMIT 1").get(String(tenantId));
  if (!sub) return null;
  const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(sub.plan_id);
  return p ? { ...p, limites: j.parse(p.limites, {}), subscription: sub } : null;
}
// mapa métrica→chave de limite (mensais têm sufixo _mes) — lição do vdocs
const LIMITE_POR_METRICA = { usuarios: 'usuarios', projetos: 'projetos', eventos: 'eventos_mes', ia_consultas: 'ia_consultas_mes', automacoes: 'automacoes' };
function checarLimite(tenantId, metrica, adicionando = 1) {
  const t = obterTenant(tenantId);
  if (t && t.interno) return; // workspace interno Villela nunca trava por limite
  const plano = planoDoTenant(tenantId);
  if (!plano) throw new Error('Empresa sem assinatura ativa.');
  const lim = Number(plano.limites[LIMITE_POR_METRICA[metrica] || metrica] || 0);
  if (!lim) return;
  const atual = Number(usoDoMes(tenantId)[metrica] || 0);
  if (atual + adicionando > lim) throw new Error(`Limite do plano ${plano.nome} atingido para ${metrica} (${atual}/${lim}). Faça upgrade para continuar.`);
}

// ------------------------------------------------------------ tenants
function slugDisponivel(base) {
  let slug = s(base, 60).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'empresa';
  let n = 1, cand = slug;
  while (db.prepare('SELECT 1 FROM tenants WHERE slug = ?').get(cand)) cand = `${slug}-${++n}`;
  return cand;
}
const obterTenant = (id) => db.prepare('SELECT * FROM tenants WHERE id = ?').get(String(id));
const tenantPorSlug = (slug) => db.prepare('SELECT * FROM tenants WHERE slug = ?').get(String(slug));

function criarTenantComDono({ empresa, nome, email, senha, ip, interno = false, planoSlug = 'professional', trialDias = 14 }) {
  const em = emailNorm(email);
  if (!s(empresa, 120)) throw new Error('Informe o nome da empresa.');
  if (!s(nome, 120)) throw new Error('Informe o seu nome.');
  if (!emailOK(em)) throw new Error('E-mail inválido.');
  if (String(senha || '').length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
  const plano = planoPorSlug(planoSlug);
  if (!plano) throw new Error('Planos não configurados.');
  return transacao(() => {
    const agora = nowISO();
    const trialFim = interno ? '' : new Date(Date.now() + trialDias * 24 * 3600 * 1000).toISOString();
    const tenant = { id: novoId(), slug: slugDisponivel(empresa), nome: s(empresa, 120) };
    db.prepare('INSERT INTO tenants (id, slug, nome, email_contato, status, interno, trial_expira_em, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(tenant.id, tenant.slug, tenant.nome, em, interno ? 'ativa' : 'trial', interno ? 1 : 0, trialFim, agora);
    let user = userPorEmail(em);
    if (user) {
      if (!bcrypt.compareSync(String(senha), user.senha_hash || '')) throw new Error('Este e-mail já tem conta com outra senha — entre pelo login.');
    } else {
      const id = novoId();
      db.prepare('INSERT INTO users (id, email, nome, senha_hash, ativo, criado_em) VALUES (?,?,?,?,1,?)')
        .run(id, em, s(nome, 120), bcrypt.hashSync(String(senha), 10), agora);
      user = userPorId(id);
    }
    db.prepare('INSERT INTO tenant_users (id, tenant_id, user_id, papel, status, criado_em, criado_por) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), tenant.id, user.id, 'dono', 'ativo', agora, user.id);
    db.prepare('INSERT INTO subscriptions (id, tenant_id, plan_id, status, inicio, fim, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), tenant.id, plano.id, interno ? 'ativa' : 'trial', agora, trialFim, agora);
    auditar(tenant.id, user, 'tenant.criar', 'tenant', tenant.id, { empresa: tenant.nome, plano: plano.slug, interno }, ip);
    return { tenant: obterTenant(tenant.id), user };
  });
}
function atualizarTenant(tenantId, campos, ator, ip) {
  const t = obterTenant(tenantId);
  if (!t) throw new Error('Empresa não encontrada.');
  db.prepare('UPDATE tenants SET nome = ?, cnpj = ?, email_contato = ?, telefone = ?, atualizado_em = ? WHERE id = ?')
    .run(s(campos.nome || t.nome, 120), s(campos.cnpj ?? t.cnpj, 20), emailNorm(campos.email_contato ?? t.email_contato), s(campos.telefone ?? t.telefone, 30), nowISO(), t.id);
  auditar(t.id, ator, 'tenant.atualizar', 'tenant', t.id, { campos: Object.keys(campos) }, ip);
  return obterTenant(t.id);
}
function administrarTenant(tenantId, { status, plano_slug }, ator, ip) {
  const t = obterTenant(tenantId);
  if (!t) throw new Error('Empresa não encontrada.');
  if (status) {
    if (!['trial', 'ativa', 'suspensa', 'cancelada'].includes(status)) throw new Error('Status inválido.');
    if (t.interno && ['suspensa', 'cancelada'].includes(status)) throw new Error('O workspace interno da Villela não pode ser suspenso.');
    db.prepare('UPDATE tenants SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), t.id);
  }
  if (plano_slug) {
    const p = planoPorSlug(plano_slug);
    if (!p) throw new Error('Plano inválido.');
    transacao(() => {
      db.prepare("UPDATE subscriptions SET status = 'cancelada', fim = ?, atualizado_em = ? WHERE tenant_id = ? AND status IN ('trial','ativa')").run(nowISO(), nowISO(), t.id);
      db.prepare('INSERT INTO subscriptions (id, tenant_id, plan_id, status, inicio, criado_em) VALUES (?,?,?,?,?,?)').run(novoId(), t.id, p.id, 'ativa', nowISO(), nowISO());
    });
  }
  auditar('', ator, 'plataforma.tenant.administrar', 'tenant', t.id, { status: status || '', plano_slug: plano_slug || '' }, ip);
  auditar(t.id, ator, 'tenant.administrado_pela_plataforma', 'tenant', t.id, { status: status || '', plano_slug: plano_slug || '' }, ip);
  return obterTenant(t.id);
}

// ------------------------------------------------------------ settings
const CONFIG_PERMITIDAS = ['idioma', 'fuso', 'logo_url', 'cor_primaria', 'notificar_email'];
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

// ------------------------------------------------------------ usuários / convites / papéis
const userPorEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(emailNorm(email));
const userPorId = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(String(id));
const vinculo = (tenantId, userId) => db.prepare('SELECT * FROM tenant_users WHERE tenant_id = ? AND user_id = ?').get(String(tenantId), String(userId));
const tenantsDoUsuario = (userId) => db.prepare(`SELECT t.id, t.slug, t.nome, t.status, t.interno, tu.papel FROM tenant_users tu
  JOIN tenants t ON t.id = tu.tenant_id WHERE tu.user_id = ? AND tu.status = 'ativo' ORDER BY t.interno DESC, t.nome`).all(String(userId));
const listarUsuarios = (tenantId) => db.prepare(`SELECT tu.id AS vinculo_id, tu.papel, tu.status, tu.funcao, tu.criado_em,
    u.id AS user_id, u.nome, u.email, u.ultimo_login
  FROM tenant_users tu JOIN users u ON u.id = tu.user_id
  WHERE tu.tenant_id = ? AND tu.status != 'removido' ORDER BY u.nome`).all(String(tenantId));

function alterarVinculo(tenantId, vinculoId, { papel, status, funcao }, ator, ip) {
  const v = db.prepare('SELECT * FROM tenant_users WHERE id = ? AND tenant_id = ?').get(String(vinculoId), String(tenantId));
  if (!v) throw new Error('Usuário não encontrado nesta empresa.');
  if (v.papel === 'dono' && ((papel && papel !== 'dono') || (status && status !== 'ativo'))) {
    const donos = db.prepare("SELECT COUNT(*) n FROM tenant_users WHERE tenant_id = ? AND papel = 'dono' AND status = 'ativo'").get(v.tenant_id).n;
    if (donos <= 1) throw new Error('A empresa precisa manter pelo menos um Dono ativo.');
  }
  if (papel && !papelValido(papel, tenantId)) throw new Error('Papel inválido.');
  if (status && !['ativo', 'suspenso', 'removido'].includes(status)) throw new Error('Status inválido.');
  db.prepare('UPDATE tenant_users SET papel = ?, status = ?, funcao = ?, atualizado_em = ? WHERE id = ?')
    .run(papel || v.papel, status || v.status, s(funcao ?? v.funcao, 80), nowISO(), v.id);
  auditar(tenantId, ator, 'usuario.alterar_vinculo', 'tenant_users', v.id, { papel: papel || v.papel, status: status || v.status }, ip);
  return db.prepare('SELECT * FROM tenant_users WHERE id = ?').get(v.id);
}

function criarConvite(tenantId, { email, papel, funcao }, ator, ip) {
  const em = emailNorm(email);
  if (!emailOK(em)) throw new Error('E-mail inválido.');
  if (!papelValido(papel || 'colaborador', tenantId)) throw new Error('Papel inválido.');
  if ((papel || '') === 'dono') throw new Error('Convite não pode conceder o papel Dono.');
  const existente = userPorEmail(em);
  if (existente) {
    const v = vinculo(tenantId, existente.id);
    if (v && v.status !== 'removido') throw new Error('Este e-mail já participa da empresa.');
  }
  checarLimite(tenantId, 'usuarios', 1);
  const token = crypto.randomBytes(24).toString('base64url');
  const id = novoId();
  db.prepare('INSERT INTO access_invites (id, tenant_id, email, papel, token_hash, expira_em, criado_em, criado_por) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, String(tenantId), em, s(papel || 'colaborador', 60), sha256(Buffer.from(token)),
      new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(), nowISO(), s(ator && ator.id, 40));
  auditar(tenantId, ator, 'usuario.convidar', 'access_invites', id, { email: em, papel: papel || 'colaborador' }, ip);
  return { id, email: em, token };
}
const listarConvites = (tenantId) => db.prepare("SELECT id, email, papel, expira_em, criado_em FROM access_invites WHERE tenant_id = ? AND aceito_em = '' ORDER BY criado_em DESC").all(String(tenantId));
function revogarConvite(tenantId, id, ator, ip) {
  const r = db.prepare("DELETE FROM access_invites WHERE id = ? AND tenant_id = ? AND aceito_em = ''").run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Convite não encontrado.');
  auditar(tenantId, ator, 'usuario.revogar_convite', 'access_invites', String(id), {}, ip);
}
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
    if (v) db.prepare("UPDATE tenant_users SET papel = ?, status = 'ativo', atualizado_em = ? WHERE id = ?").run(inv.papel, nowISO(), v.id);
    else db.prepare('INSERT INTO tenant_users (id, tenant_id, user_id, papel, status, criado_em, criado_por) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), inv.tenant_id, user.id, inv.papel, 'ativo', nowISO(), inv.criado_por);
    db.prepare('UPDATE access_invites SET aceito_em = ? WHERE id = ?').run(nowISO(), inv.id);
    auditar(inv.tenant_id, user, 'usuario.aceitar_convite', 'access_invites', inv.id, { email: inv.email, papel: inv.papel }, ip);
    return { user, tenantId: inv.tenant_id };
  });
}

const { PERMISSOES } = require('./permissoes');
const listarRoles = (tenantId) => db.prepare('SELECT * FROM roles WHERE tenant_id = ? ORDER BY nome').all(String(tenantId)).map(r => ({ ...r, permissoes: j.parse(r.permissoes, []) }));
function salvarRole(tenantId, { id, nome, descricao, permissoes }, ator, ip) {
  const perms = (Array.isArray(permissoes) ? permissoes : []).filter(p => PERMISSOES[p]);
  if (!s(nome, 60)) throw new Error('Informe o nome do papel.');
  if (id) {
    const r = db.prepare('SELECT * FROM roles WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
    if (!r) throw new Error('Papel não encontrado.');
    db.prepare('UPDATE roles SET nome = ?, descricao = ?, permissoes = ?, atualizado_em = ? WHERE id = ?').run(s(nome, 60), s(descricao, 200), j.str(perms), nowISO(), r.id);
    auditar(tenantId, ator, 'papel.atualizar', 'roles', r.id, { nome: s(nome, 60) }, ip);
    return r.id;
  }
  const novo = novoId();
  db.prepare('INSERT INTO roles (id, tenant_id, nome, descricao, permissoes, criado_em, criado_por) VALUES (?,?,?,?,?,?,?)')
    .run(novo, String(tenantId), s(nome, 60), s(descricao, 200), j.str(perms), nowISO(), s(ator && ator.id, 40));
  auditar(tenantId, ator, 'papel.criar', 'roles', novo, { nome: s(nome, 60) }, ip);
  return novo;
}
function excluirRole(tenantId, id, ator, ip) {
  const emUso = db.prepare('SELECT COUNT(*) n FROM tenant_users WHERE tenant_id = ? AND papel = ?').get(String(tenantId), 'custom:' + String(id)).n;
  if (emUso) throw new Error(`Papel em uso por ${emUso} usuário(s) — troque o papel deles antes.`);
  const r = db.prepare('DELETE FROM roles WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Papel não encontrado.');
  auditar(tenantId, ator, 'papel.excluir', 'roles', String(id), {}, ip);
}

// ------------------------------------------------------------ portfólio (núcleo Fase 1)
const ESTAGIOS = ['ideia', 'incubacao', 'pesquisa', 'viabilidade', 'plano_negocio', 'planejamento', 'prototipo', 'desenvolvimento', 'pre_lancamento', 'lancamento', 'operacao', 'expansao', 'pausado', 'cancelado', 'arquivado'];
const CATEGORIAS = ['hospedagem', 'containers', 'transporte', 'locacao', 'eventos', 'gastronomia', 'imobiliario', 'construcao', 'nautica', 'saas', 'outro'];
const HORIZONTES = ['curto', 'medio', 'longo'];
const PRIORIDADES = ['alta', 'media', 'baixa'];

function criarProjeto(tenantId, campos, ator, ip) {
  if (!s(campos.nome, 160)) throw new Error('Dê um nome ao projeto/ideia.');
  checarLimite(tenantId, 'projetos', 1);
  const id = novoId();
  db.prepare(`INSERT INTO projects (id, tenant_id, nome, descricao, categoria, estagio, horizonte, prioridade, viabilidade,
      investimento_estimado, receita_potencial, riscos, proximos_passos, responsavel, tags, status, ordem, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ativo',?,?,?)`)
    .run(id, String(tenantId), s(campos.nome, 160), s(campos.descricao, 2000),
      CATEGORIAS.includes(campos.categoria) ? campos.categoria : 'outro',
      ESTAGIOS.includes(campos.estagio) ? campos.estagio : 'ideia',
      HORIZONTES.includes(campos.horizonte) ? campos.horizonte : 'medio',
      PRIORIDADES.includes(campos.prioridade) ? campos.prioridade : 'media',
      Math.min(Math.max(0, Math.trunc(Number(campos.viabilidade) || 0)), 100),
      Math.max(0, Math.trunc(Number(campos.investimento_estimado) || 0)),
      Math.max(0, Math.trunc(Number(campos.receita_potencial) || 0)),
      s(campos.riscos, 1000), s(campos.proximos_passos, 1000), s(campos.responsavel, 120),
      j.str((Array.isArray(campos.tags) ? campos.tags : []).map(t => s(t, 40)).filter(Boolean).slice(0, 15)),
      Math.trunc(Number(campos.ordem) || 0), nowISO(), s(ator && ator.id, 40));
  auditar(tenantId, ator, 'projeto.criar', 'projects', id, { nome: s(campos.nome, 160), estagio: campos.estagio || 'ideia' }, ip);
  return obterProjeto(tenantId, id);
}
function obterProjeto(tenantId, id) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!p) throw new Error('Projeto não encontrado.');
  p.tags = j.parse(p.tags, []);
  return p;
}
function listarProjetos(tenantId, { status = '', estagio = '', categoria = '', busca = '' } = {}) {
  let sql = 'SELECT * FROM projects WHERE tenant_id = ?';
  const args = [String(tenantId)];
  if (status) { sql += ' AND status = ?'; args.push(s(status, 20)); } else { sql += " AND status != 'arquivado'"; }
  if (estagio) { sql += ' AND estagio = ?'; args.push(s(estagio, 30)); }
  if (categoria) { sql += ' AND categoria = ?'; args.push(s(categoria, 30)); }
  if (busca) { sql += ' AND (nome LIKE ? OR descricao LIKE ?)'; const t = `%${s(busca, 80)}%`; args.push(t, t); }
  sql += " ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, ordem, nome LIMIT 500";
  return db.prepare(sql).all(...args).map(p => ({ ...p, tags: j.parse(p.tags, []) }));
}
function atualizarProjeto(tenantId, id, campos, ator, ip) {
  const p = obterProjeto(tenantId, id);
  const val = (chave, lista, atual) => lista.includes(campos[chave]) ? campos[chave] : atual;
  db.prepare(`UPDATE projects SET nome = ?, descricao = ?, categoria = ?, estagio = ?, horizonte = ?, prioridade = ?,
      viabilidade = ?, investimento_estimado = ?, receita_potencial = ?, riscos = ?, proximos_passos = ?, responsavel = ?,
      tags = ?, status = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?`)
    .run(s(campos.nome || p.nome, 160), s(campos.descricao ?? p.descricao, 2000),
      val('categoria', CATEGORIAS, p.categoria), val('estagio', ESTAGIOS, p.estagio),
      val('horizonte', HORIZONTES, p.horizonte), val('prioridade', PRIORIDADES, p.prioridade),
      campos.viabilidade != null ? Math.min(Math.max(0, Math.trunc(Number(campos.viabilidade) || 0)), 100) : p.viabilidade,
      campos.investimento_estimado != null ? Math.max(0, Math.trunc(Number(campos.investimento_estimado) || 0)) : p.investimento_estimado,
      campos.receita_potencial != null ? Math.max(0, Math.trunc(Number(campos.receita_potencial) || 0)) : p.receita_potencial,
      s(campos.riscos ?? p.riscos, 1000), s(campos.proximos_passos ?? p.proximos_passos, 1000), s(campos.responsavel ?? p.responsavel, 120),
      campos.tags != null ? j.str((Array.isArray(campos.tags) ? campos.tags : []).map(t => s(t, 40)).filter(Boolean).slice(0, 15)) : j.str(p.tags),
      ['ativo', 'pausado', 'cancelado', 'arquivado'].includes(campos.status) ? campos.status : p.status,
      nowISO(), p.id, String(tenantId));
  const mudouEstagio = campos.estagio && campos.estagio !== p.estagio;
  auditar(tenantId, ator, mudouEstagio ? 'projeto.mudar_estagio' : 'projeto.atualizar', 'projects', p.id,
    mudouEstagio ? { de: p.estagio, para: campos.estagio } : { campos: Object.keys(campos) }, ip);
  return obterProjeto(tenantId, p.id);
}

// ------------------------------------------------------------ seed interno Villela (os 16 projetos)
const cem = (reais) => Math.round(reais * 100);
const PROJETOS_VILLELA = [
  { nome: 'Villela Stay — Hospedagens Inteligentes', categoria: 'hospedagem', estagio: 'operacao', horizonte: 'curto', prioridade: 'alta', descricao: '4 casas no Lago Sul alugadas por temporada para grupos de 10 a 70 pessoas. 15 containers construídos, faltam 15 para concluir. Objetivo: elevar hospedagens standard a padrão de luxo — hotel boutique em formato de temporada.', proximos_passos: 'Concluir os 15 containers restantes; elevar padrão das unidades; estruturar operação boutique; manuais, processos, automações e métricas.', riscos: 'Capex dos containers; sazonalidade; dependência de OTAs.' },
  { nome: 'Compra e venda de containers usados', categoria: 'containers', estagio: 'viabilidade', horizonte: 'curto', prioridade: 'alta', descricao: 'Operação comercial de compra de containers usados, reforma quando necessário e revenda a terceiros.', proximos_passos: 'Mapear fornecedores e preços de compra; definir margem-alvo; canal de venda.', riscos: 'Capital de giro; qualidade dos usados; logística.' },
  { nome: 'Compra e aluguel de containers usados', categoria: 'containers', estagio: 'viabilidade', horizonte: 'medio', prioridade: 'media', descricao: 'Carteira de containers para aluguel mensal ou por temporada, com contratos, logística, manutenção e seguro.', proximos_passos: 'Modelar receita recorrente vs capex; minuta de contrato de locação; seguro.', riscos: 'Inadimplência; avarias; ociosidade.' },
  { nome: 'Construção e venda de casas/escritórios/banheiros em containers', categoria: 'construcao', estagio: 'plano_negocio', horizonte: 'medio', prioridade: 'alta', descricao: 'Projetar, construir e vender unidades modulares em containers (residencial, comercial e sanitário).', proximos_passos: 'Portfólio de modelos; custo por unidade; licenciamentos; canal de vendas.', riscos: 'Normas/ART; prazo de obra; precificação.' },
  { nome: 'Construção e aluguel de unidades em containers', categoria: 'construcao', estagio: 'plano_negocio', horizonte: 'medio', prioridade: 'media', descricao: 'Construir casas, escritórios e banheiros em containers para aluguel recorrente.', proximos_passos: 'Definir praças-alvo; contratos; manutenção preventiva.', riscos: 'Vacância; manutenção; regulatório local.' },
  { nome: 'Hospedagens itinerantes (containers sobre rodas)', categoria: 'hospedagem', estagio: 'incubacao', horizonte: 'medio', prioridade: 'media', descricao: 'Containers sobre rodas alugados e instalados temporariamente em propriedades de terceiros, eventos, fazendas e empreendimentos parceiros.', proximos_passos: 'Prototipar 1 unidade; validar demanda com parceiros; logística de deslocamento.', riscos: 'Licenças de trânsito; instalação (água/energia); seguro.' },
  { nome: 'Transporte de cargas (carretas + containers)', categoria: 'transporte', estagio: 'pesquisa', horizonte: 'longo', prioridade: 'baixa', descricao: 'Serviço para mudanças particulares, eletrônicos, cargas de maior valor, containers e cargas especiais.', proximos_passos: 'Estudo regulatório (ANTT/RNTRC); frota própria vs agregados; seguro de carga.', riscos: 'Regulatório; sinistros; concorrência de frete.' },
  { nome: 'Aluguel de máquinas para construção civil', categoria: 'locacao', estagio: 'pesquisa', horizonte: 'longo', prioridade: 'baixa', descricao: 'Locação de equipamentos: munck, betoneiras, tratores e máquinas auxiliares.', proximos_passos: 'Levantar demanda local; capex por máquina; manutenção.', riscos: 'Capex alto; manutenção; ociosidade.' },
  { nome: 'Transporte de pessoas (motorhome, ônibus, vans)', categoria: 'transporte', estagio: 'incubacao', horizonte: 'medio', prioridade: 'media', descricao: 'Turismo, eventos, transfers, grupos e experiências — sinergia direta com hospedagem e eventos Villela.', proximos_passos: 'Licenciamento fretamento; 1º veículo; pacotes com hospedagem.', riscos: 'Regulatório; motorista; manutenção.' },
  { nome: 'Aluguel de carros', categoria: 'locacao', estagio: 'ideia', horizonte: 'longo', prioridade: 'baixa', descricao: 'Frota própria ou terceirizada para locação de veículos.', proximos_passos: 'Avaliar modelo (frota própria vs P2P); seguro; praça.', riscos: 'Depreciação; sinistros; concorrência de apps.' },
  { nome: 'Aluguel de lanchas', categoria: 'nautica', estagio: 'ideia', horizonte: 'medio', prioridade: 'media', descricao: 'Locação de lanchas para lazer, turismo e experiências premium no Lago Paranoá — upsell natural das hospedagens.', proximos_passos: 'Parcerias com marinas; requisitos Marinha; pacote hóspede+lancha.', riscos: 'Sazonalidade; manutenção náutica; habilitação/arrais.' },
  { nome: 'Construção de domos geodésicos', categoria: 'construcao', estagio: 'ideia', horizonte: 'medio', prioridade: 'media', descricao: 'Hospedagem, eventos e estruturas diferenciadas com domos geodésicos.', proximos_passos: 'Prototipar 1 domo; custo/prazo; usar como suíte premium ou espaço de evento.', riscos: 'Fornecedores; conforto térmico; licenças.' },
  { nome: 'Serviços de buffet', categoria: 'gastronomia', estagio: 'planejamento', horizonte: 'curto', prioridade: 'alta', descricao: 'Gastronomia para eventos e hospedagens: brunches, churrascos, almoços, jantares e experiências premium — receita adicional imediata nas casas.', proximos_passos: 'Cardápios e fichas técnicas; equipe (chef/garçons); precificação por pessoa.', riscos: 'Vigilância sanitária; equipe sob demanda; padrão de qualidade.' },
  { nome: 'Aluguel de equipamentos de buffet e mobílias para eventos', categoria: 'eventos', estagio: 'planejamento', horizonte: 'curto', prioridade: 'media', descricao: 'Locação de mesas, cadeiras, louças, talheres, taças, toalhas, decoração e mobiliário para eventos.', proximos_passos: 'Inventariar itens existentes; tabela de locação; logística de entrega/retirada.', riscos: 'Perdas/danos; armazenagem; logística.' },
  { nome: 'Loteamento com containers', categoria: 'imobiliario', estagio: 'ideia', horizonte: 'longo', prioridade: 'baixa', descricao: 'Projeto imobiliário com lotes, infraestrutura e unidades em containers.', proximos_passos: 'Prospectar terreno; estudo urbanístico; modelo de venda.', riscos: 'Regulatório/urbanístico; capital; prazo longo.' },
  { nome: 'Prédios de quitinetes com containers', categoria: 'imobiliario', estagio: 'ideia', horizonte: 'longo', prioridade: 'baixa', descricao: 'Edifícios compactos, modulares e rentáveis usando containers (quitinetes para renda recorrente).', proximos_passos: 'Estudo estrutural (empilhamento); terreno-alvo; modelo de renda.', riscos: 'Aprovação de projeto; financiamento; obra.' },
];
// Cria (ou completa) o workspace interno da Villela com os 16 projetos. Idempotente.
function semearInterno({ email, nome, senha }, ator, ip) {
  let t = tenantPorSlug('villela-interno');
  let senhaGerada = '';
  if (!t) {
    senhaGerada = senha || ('Villela-' + crypto.randomBytes(6).toString('base64url'));
    const r = criarTenantComDono({ empresa: 'Villela (interno)', nome: nome || 'Augusto Villela', email: email || 'augusto.villela@gmail.com', senha: senhaGerada, ip, interno: true, planoSlug: 'enterprise' });
    t = r.tenant;
    db.prepare("UPDATE tenants SET slug = 'villela-interno' WHERE id = ?").run(t.id);
    t = obterTenant(t.id);
  }
  let criados = 0;
  for (const p of PROJETOS_VILLELA) {
    if (db.prepare('SELECT 1 FROM projects WHERE tenant_id = ? AND nome = ?').get(t.id, p.nome)) continue;
    criarProjeto(t.id, { ...p, responsavel: 'Augusto Villela' }, ator || { id: 'seed', nome: 'Seed Villela' }, ip || 'seed');
    criados++;
  }
  auditar(t.id, ator || { id: 'seed', nome: 'Seed Villela' }, 'portfolio.seed_interno', 'projects', '', { criados, total: PROJETOS_VILLELA.length }, ip || 'seed');
  return { tenant: t, criados, total: PROJETOS_VILLELA.length, senha_inicial: senhaGerada || undefined };
}

// ------------------------------------------------------------ dashboards
function dashboardTenant(tenantId) {
  const t = obterTenant(tenantId);
  const uso = usoDoMes(tenantId);
  const plano = planoDoTenant(tenantId);
  const projs = listarProjetos(tenantId, {});
  const porEstagio = {};
  for (const p of projs) porEstagio[p.estagio] = (porEstagio[p.estagio] || 0) + 1;
  return {
    empresa: { nome: t.nome, status: t.status, interno: !!t.interno, trial_expira_em: t.trial_expira_em },
    usuarios_ativos: uso.usuarios,
    convites_pendentes: listarConvites(tenantId).length,
    projetos_total: projs.length,
    projetos_por_estagio: porEstagio,
    projetos_alta_prioridade: projs.filter(p => p.prioridade === 'alta' && p.status === 'ativo').slice(0, 8),
    investimento_estimado_total: projs.reduce((a, p) => a + (p.investimento_estimado || 0), 0),
    receita_potencial_total: projs.reduce((a, p) => a + (p.receita_potencial || 0), 0),
    plano: plano ? { nome: plano.nome, slug: plano.slug, limites: plano.limites, status: plano.subscription.status } : null,
    uso,
    auditoria_recente: listarAuditoria(tenantId, { limite: 10 }),
  };
}
function resumoPlataforma() {
  const porStatus = {};
  for (const r of db.prepare('SELECT status, COUNT(*) n FROM tenants GROUP BY status').all()) porStatus[r.status] = r.n;
  const mrr = db.prepare(`SELECT COALESCE(SUM(p.preco_centavos),0) v FROM subscriptions sb
    JOIN plans p ON p.id = sb.plan_id JOIN tenants t ON t.id = sb.tenant_id
    WHERE sb.status = 'ativa' AND t.status = 'ativa' AND t.interno = 0`).get().v;
  return {
    tenants_por_status: porStatus,
    tenants_total: db.prepare('SELECT COUNT(*) n FROM tenants').get().n,
    usuarios_total: db.prepare('SELECT COUNT(*) n FROM users WHERE ativo = 1').get().n,
    projetos_total: db.prepare('SELECT COUNT(*) n FROM projects').get().n,
    mrr_centavos: mrr,
    leads_novos: db.prepare("SELECT COUNT(*) n FROM leads WHERE status = 'novo'").get().n,
  };
}
function listarTenantsPlataforma() {
  return db.prepare('SELECT * FROM tenants ORDER BY interno DESC, criado_em DESC').all().map(t => {
    const plano = planoDoTenant(t.id);
    return { ...t, plano: plano ? plano.slug : '', usuarios: usoDoMes(t.id).usuarios, projetos: usoDoMes(t.id).projetos };
  });
}

// ------------------------------------------------------------ leads
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

module.exports = {
  s, emailNorm, emailOK, periodoAtual,
  semearPlanos, listarPlanos, planoPorSlug, atualizarPlano,
  auditar, listarAuditoria,
  registrarUso, usoDoMes, planoDoTenant, checarLimite,
  criarTenantComDono, obterTenant, tenantPorSlug, atualizarTenant, administrarTenant,
  lerSettings, gravarSetting, CONFIG_PERMITIDAS,
  userPorEmail, userPorId, vinculo, tenantsDoUsuario, listarUsuarios, alterarVinculo,
  criarConvite, listarConvites, revogarConvite, aceitarConvite,
  listarRoles, salvarRole, excluirRole,
  ESTAGIOS, CATEGORIAS, HORIZONTES, PRIORIDADES,
  criarProjeto, obterProjeto, listarProjetos, atualizarProjeto,
  PROJETOS_VILLELA, semearInterno,
  dashboardTenant, resumoPlataforma, listarTenantsPlataforma,
  criarLead, listarLeads, atualizarLead,
};
