// =====================================================================
// Villela Growth OS — hierarquia e acesso (§4 do PROMPT_MASTER).
//
//   plataforma → agência/revenda → conta cliente (tabela `tenants`)
//
// Identidade é GLOBAL (gx_users): a mesma pessoa opera várias contas.
// O acesso, porém, é sempre POR CONTA — resolverAcesso() decide se o
// usuário entra numa conta e com quais permissões, e cada entrada é
// auditada. Não existe "ver tudo de uma vez".
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const repo = require('./repo');
const rbac = require('./rbac');
const tenancy = require('./tenancy');
const { db, nowISO, novoId, j } = require('./db');

const ORG_PLATAFORMA = 'plataforma';

// ------------------------------------------------------------ organizações
function semearPlataforma() {
  const existe = db.prepare("SELECT * FROM gx_orgs WHERE tipo = 'plataforma' LIMIT 1").get();
  if (existe) return existe;
  const id = novoId();
  db.prepare(
    'INSERT INTO gx_orgs (id, tipo, slug, nome, parent_id, status, criado_em) VALUES (?,?,?,?,?,?,?)'
  ).run(id, 'plataforma', ORG_PLATAFORMA, 'Grupo Villela Stay', '', 'ativa', nowISO());
  return db.prepare('SELECT * FROM gx_orgs WHERE id = ?').get(id);
}

const plataforma = () => db.prepare("SELECT * FROM gx_orgs WHERE tipo = 'plataforma' LIMIT 1").get() || null;
const orgPorId = (id) => db.prepare('SELECT * FROM gx_orgs WHERE id = ?').get(id) || null;
const orgPorSlug = (slug) => db.prepare('SELECT * FROM gx_orgs WHERE slug = ?').get(slug) || null;

function criarOrg({ tipo = 'agencia', nome, slug, parentId = null, contatoEmail = '' }) {
  if (!nome || !slug) throw erro(400, 'Organização precisa de nome e slug.');
  if (orgPorSlug(slug)) throw erro(409, `Já existe organização com o slug "${slug}".`);
  const pai = parentId ? orgPorId(parentId) : plataforma();
  if (!pai) throw erro(400, 'Organização-mãe não encontrada (a plataforma foi semeada?).');
  const id = novoId();
  db.prepare(
    'INSERT INTO gx_orgs (id, tipo, slug, nome, parent_id, status, contato_email, criado_em, criado_por) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(id, tipo, slug, nome, pai.id, 'ativa', contatoEmail, nowISO(), tenancy.userAtual());
  repo.auditar({ acao: 'org.criada', entidade: 'gx_orgs', entidadeId: id, detalhe: `${tipo} ${slug}`, tenantId: '' });
  return orgPorId(id);
}

/**
 * Semeia a organização do próprio grupo e pendura nela a conta interna.
 *
 * Por que na semeadura e não por rota: é dado NOSSO, do dono da instalação,
 * e precisa existir igual em qualquer boot — como a organização plataforma.
 * Idempotente: se a org já existe, só confere o vínculo.
 *
 * Não inventa a conta. Se o tenant `villela-stay` ainda não existe (o
 * cadastro é manual, pelo Portal Staff), a org é criada e o vínculo fica
 * para o próximo boot — e o retorno diz isso, em vez de fingir.
 */
function semearGrupoInterno({ slugOrg = 'grupo-villela-stay', nomeOrg = 'Grupo Villela Stay', slugConta = 'villela-stay' } = {}) {
  let org = orgPorSlug(slugOrg);
  if (!org) {
    const pai = plataforma();
    if (!pai) return { org: null, motivo: 'plataforma ainda não semeada' };
    const id = novoId();
    db.prepare(
      'INSERT INTO gx_orgs (id, tipo, slug, nome, parent_id, status, contato_email, obs, criado_em, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(id, 'grupo', slugOrg, nomeOrg, pai.id, 'ativa', 'contato@villelastay.com.br',
      'Organização do próprio grupo (dono da instalação), não uma agência cliente.', nowISO(), 'semeadura');
    org = orgPorId(id);
  }
  const conta = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slugConta);
  if (!conta) return { org: org.slug, vinculada: false, motivo: `a conta "${slugConta}" ainda não existe` };
  const ja = db.prepare('SELECT * FROM gx_org_contas WHERE tenant_id = ?').get(conta.id);
  if (ja && ja.org_id === org.id) return { org: org.slug, vinculada: true, ja: true };
  vincularConta(org.id, conta.id);
  return { org: org.slug, vinculada: true, ja: false };
}

/** Vincula uma conta cliente a uma organização (uma conta = uma org). */
function vincularConta(orgId, tenantId) {
  if (!orgPorId(orgId)) throw erro(404, 'Organização não encontrada.');
  if (!db.prepare('SELECT 1 FROM tenants WHERE id = ?').get(tenantId)) throw erro(404, 'Conta não encontrada.');
  const atual = db.prepare('SELECT * FROM gx_org_contas WHERE tenant_id = ?').get(tenantId);
  if (atual && atual.org_id === orgId) return atual;
  if (atual) {
    db.prepare('UPDATE gx_org_contas SET org_id = ?, atualizado_em = ?, atualizado_por = ? WHERE tenant_id = ?')
      .run(orgId, nowISO(), tenancy.userAtual(), tenantId);
  } else {
    db.prepare('INSERT INTO gx_org_contas (id, org_id, tenant_id, criado_em, criado_por) VALUES (?,?,?,?,?)')
      .run(novoId(), orgId, tenantId, nowISO(), tenancy.userAtual());
  }
  repo.auditar({ acao: 'org.conta.vinculada', entidade: 'gx_org_contas', entidadeId: tenantId, detalhe: orgId, tenantId });
  return db.prepare('SELECT * FROM gx_org_contas WHERE tenant_id = ?').get(tenantId);
}

const orgDoTenant = (tenantId) => {
  const v = db.prepare('SELECT * FROM gx_org_contas WHERE tenant_id = ?').get(tenantId);
  return v ? orgPorId(v.org_id) : null;
};
const contasDaOrg = (orgId) =>
  db.prepare('SELECT t.* FROM gx_org_contas c JOIN tenants t ON t.id = c.tenant_id WHERE c.org_id = ? ORDER BY t.nome').all(orgId);

// --------------------------------------------------------------- usuários
const usuarioPorEmail = (email) =>
  db.prepare('SELECT * FROM gx_users WHERE lower(email) = lower(?)').get(String(email || '')) || null;
const usuarioPorId = (id) => db.prepare('SELECT * FROM gx_users WHERE id = ?').get(id) || null;

function criarUsuario({ nome = '', email, senha = '', status = 'ativo', tenantUserId = '' }) {
  if (!email) throw erro(400, 'Usuário precisa de e-mail.');
  const existente = usuarioPorEmail(email);
  if (existente) return existente;
  const id = novoId();
  db.prepare(
    'INSERT INTO gx_users (id, nome, email, senha_hash, status, tenant_user_id, criado_em, criado_por) VALUES (?,?,?,?,?,?,?,?)'
  ).run(id, nome, String(email).trim(), senha ? bcrypt.hashSync(senha, 10) : '', status, tenantUserId, nowISO(), tenancy.userAtual());
  repo.auditar({ acao: 'usuario.criado', entidade: 'gx_users', entidadeId: id, detalhe: email, tenantId: '' });
  return usuarioPorId(id);
}

const conferirSenha = (usuario, senha) => !!(usuario && usuario.senha_hash && bcrypt.compareSync(String(senha || ''), usuario.senha_hash));

function definirSenha(userId, senha) {
  if (!senha || String(senha).length < 8) throw erro(400, 'A senha precisa de pelo menos 8 caracteres.');
  db.prepare('UPDATE gx_users SET senha_hash = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?')
    .run(bcrypt.hashSync(String(senha), 10), nowISO(), tenancy.userAtual(), userId);
  repo.auditar({ acao: 'usuario.senha_alterada', entidade: 'gx_users', entidadeId: userId, tenantId: '' });
  return true;
}

// ------------------------------------------------------------ memberships
function conceder({ userId, escopoTipo = 'tenant', escopoId, roleSlug = null, roleId = null, escopos = {}, equipeId = '' }) {
  if (!usuarioPorId(userId)) throw erro(404, 'Usuário não encontrado.');
  if (!escopoId && escopoTipo !== 'plataforma') throw erro(400, 'Membership precisa de escopo.');
  let papelId = roleId;
  if (!papelId) {
    const papel = rbac.papelPorSlug(roleSlug || rbac.PERFIL_PADRAO);
    if (!papel) throw erro(404, `Perfil "${roleSlug}" não existe.`);
    papelId = papel.id;
  }
  const atual = db.prepare('SELECT * FROM gx_memberships WHERE user_id = ? AND escopo_tipo = ? AND escopo_id = ?')
    .get(userId, escopoTipo, escopoId || '');
  if (atual) {
    db.prepare('UPDATE gx_memberships SET role_id = ?, escopos = ?, equipe_id = ?, status = ?, revogado_em = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?')
      .run(papelId, j.str(escopos), equipeId, 'ativo', '', nowISO(), tenancy.userAtual(), atual.id);
    repo.auditar({ acao: 'membership.alterada', entidade: 'gx_memberships', entidadeId: atual.id, detalhe: `${escopoTipo}:${escopoId}`, tenantId: escopoTipo === 'tenant' ? escopoId : '' });
    return db.prepare('SELECT * FROM gx_memberships WHERE id = ?').get(atual.id);
  }
  const id = novoId();
  db.prepare(
    'INSERT INTO gx_memberships (id, user_id, escopo_tipo, escopo_id, role_id, equipe_id, escopos, status, criado_em, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(id, userId, escopoTipo, escopoId || '', papelId, equipeId, j.str(escopos), 'ativo', nowISO(), tenancy.userAtual());
  repo.auditar({ acao: 'membership.concedida', entidade: 'gx_memberships', entidadeId: id, detalhe: `${escopoTipo}:${escopoId}`, tenantId: escopoTipo === 'tenant' ? escopoId : '' });
  return db.prepare('SELECT * FROM gx_memberships WHERE id = ?').get(id);
}

function revogar(membershipId) {
  const m = db.prepare('SELECT * FROM gx_memberships WHERE id = ?').get(membershipId);
  if (!m) return false;
  db.prepare("UPDATE gx_memberships SET status = 'revogado', revogado_em = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?")
    .run(nowISO(), nowISO(), tenancy.userAtual(), membershipId);
  repo.auditar({ acao: 'membership.revogada', entidade: 'gx_memberships', entidadeId: membershipId, tenantId: m.escopo_tipo === 'tenant' ? m.escopo_id : '' });
  return true;
}

const membershipsDoUsuario = (userId) =>
  db.prepare("SELECT * FROM gx_memberships WHERE user_id = ? AND status = 'ativo'").all(userId);

/**
 * O usuário pode entrar nesta conta? Com quais permissões e por qual via?
 * Ordem: membership direto na conta > membership na organização dona da
 * conta > membership de plataforma. Devolve null quando não pode.
 */
function resolverAcesso(userId, tenantId) {
  const usuario = usuarioPorId(userId);
  if (!usuario || usuario.status !== 'ativo' || usuario.excluido_em) return null;

  const direto = db.prepare("SELECT * FROM gx_memberships WHERE user_id = ? AND escopo_tipo = 'tenant' AND escopo_id = ? AND status = 'ativo'")
    .get(userId, tenantId);
  if (direto) return montarAcesso(direto, 'tenant', tenantId);

  const org = orgDoTenant(tenantId);
  if (org) {
    const naOrg = db.prepare("SELECT * FROM gx_memberships WHERE user_id = ? AND escopo_tipo = 'org' AND escopo_id = ? AND status = 'ativo'")
      .get(userId, org.id);
    if (naOrg) return montarAcesso(naOrg, 'org', tenantId, org.id);
  }

  const naPlataforma = db.prepare("SELECT * FROM gx_memberships WHERE user_id = ? AND escopo_tipo = 'plataforma' AND status = 'ativo'")
    .get(userId);
  if (naPlataforma) return montarAcesso(naPlataforma, 'plataforma', tenantId);

  return null;
}

function montarAcesso(membership, via, tenantId, orgId = '') {
  return {
    membership, via, tenantId, orgId,
    permissoes: rbac.permissoesDoMembership(membership),
    escopos: j.parse(membership.escopos, {}),
  };
}

/** Contas que este usuário pode operar (direto, por agência ou plataforma). */
function contasDoUsuario(userId) {
  const ms = membershipsDoUsuario(userId);
  const ids = new Set();
  for (const m of ms) {
    if (m.escopo_tipo === 'tenant') ids.add(m.escopo_id);
    else if (m.escopo_tipo === 'org') for (const t of contasDaOrg(m.escopo_id)) ids.add(t.id);
    else if (m.escopo_tipo === 'plataforma') for (const t of db.prepare('SELECT id FROM tenants').all()) ids.add(t.id);
  }
  if (!ids.size) return [];
  const lista = [...ids].map(id => db.prepare('SELECT id, slug, nome, status, plan_id FROM tenants WHERE id = ?').get(id)).filter(Boolean);
  return lista.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

// ------------------------------------------------- equipes e marcas (por conta)
const criarEquipe = ({ nome, descricao = '', liderUserId = '' }) => {
  if (!nome) throw erro(400, 'Equipe precisa de nome.');
  return repo.inserir('gx_equipes', { nome, descricao, lider_user_id: liderUserId });
};
const equipes = () => repo.listar('gx_equipes', { ordem: 'nome ASC' });

function adicionarNaEquipe(equipeId, userId, papelEquipe = 'membro') {
  if (!repo.buscar('gx_equipes', equipeId)) throw erro(404, 'Equipe não encontrada.');
  const ja = repo.um('SELECT * FROM gx_equipe_membros WHERE equipe_id = :e AND user_id = :u AND tenant_id = :tenant', { e: equipeId, u: userId });
  if (ja) return ja.id;
  return repo.inserir('gx_equipe_membros', { equipe_id: equipeId, user_id: userId, papel_equipe: papelEquipe });
}

const criarMarca = ({ nome, slug, logoUrl = '', cores = {}, dominio = '', remetenteEmail = '', principal = 0 }) => {
  if (!nome || !slug) throw erro(400, 'Marca precisa de nome e slug.');
  return repo.inserir('gx_marcas', { nome, slug, logo_url: logoUrl, cores, dominio, remetente_email: remetenteEmail, principal });
};
const marcas = () => repo.listar('gx_marcas', { ordem: 'principal DESC, nome ASC' });

// ------------------------------------------- ponte com o Villela CRM (legado)
/**
 * Traz os usuários de `tenant_users` (Villela CRM) para a identidade global,
 * mapeando o papel legado no perfil equivalente. Idempotente: pode repetir.
 */
function sincronizarUsuariosLegados() {
  const legados = db.prepare("SELECT * FROM tenant_users WHERE ativo = 1").all();
  let criados = 0, vinculados = 0;
  for (const l of legados) {
    let u = usuarioPorEmail(l.email);
    if (!u) { u = criarUsuario({ nome: l.nome, email: l.email, tenantUserId: l.id }); criados++; }
    else if (!u.tenant_user_id) {
      db.prepare('UPDATE gx_users SET tenant_user_id = ? WHERE id = ?').run(l.id, u.id);
    }
    const slug = rbac.MAPA_PAPEL_LEGADO[l.papel] || rbac.PERFIL_PADRAO;
    conceder({ userId: u.id, escopoTipo: 'tenant', escopoId: l.tenant_id, roleSlug: slug });
    vinculados++;
  }
  return { criados, vinculados, total: legados.length };
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  semearPlataforma, semearGrupoInterno, plataforma, criarOrg, orgPorId, orgPorSlug, vincularConta, orgDoTenant, contasDaOrg,
  criarUsuario, usuarioPorEmail, usuarioPorId, conferirSenha, definirSenha,
  conceder, revogar, membershipsDoUsuario, resolverAcesso, contasDoUsuario,
  criarEquipe, equipes, adicionarNaEquipe, criarMarca, marcas,
  sincronizarUsuariosLegados,
};
