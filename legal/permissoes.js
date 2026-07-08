// =====================================================================
// Villela Legal Intelligence — perfis (roles) e matriz de permissões.
//
// A MATRIZ mora aqui no código (versionada no git = auditável) e é
// SEMEADA nas tabelas roles/role_permissions a cada boot (upsert),
// satisfazendo o modelo de dados do MVP e permitindo consulta via SQL.
//
// Autenticação = Portal Staff (JWT). Este módulo só resolve AUTORIZAÇÃO:
// qual perfil jurídico o usuário do portal tem e o que ele pode fazer.
// Regras fixas:
//  * admin do portal  → super_admin (implícito, sem cadastro).
//  * usuário com área 'juridico' sem perfil cadastrado → visualizador.
//  * demais usuários → sem acesso.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');

// ---- catálogo de permissões (§2 do plano) ----
const PERMISSOES = [
  'ver_processos', 'criar_processos', 'editar_processos',
  'ver_documentos', 'criar_documentos', 'editar_documentos', 'aprovar_documentos',
  'enviar_cliente', 'protocolar',
  'ver_financeiro', 'gerir_financeiro', 'ver_prestacao_contas',
  'gerir_clientes', 'gerir_usuarios',
  'gerir_prazos', 'gerir_tarefas', 'gerir_publicacoes',
  'usar_ia', 'ver_dados_sensiveis', 'exportar_relatorios', 'ver_auditoria',
];

const TODAS = PERMISSOES.slice();
const sem = (...tira) => TODAS.filter(p => !tira.includes(p));

// ---- perfis (roles) — núcleos são TAGS no usuário (users.nucleos), não perfis ----
const PERFIS = [
  { id: 'super_admin', nome: 'Super Admin', nivel: 100, permissoes: TODAS },
  { id: 'socio_admin', nome: 'Sócio administrador', nivel: 90, permissoes: TODAS },
  { id: 'adv_senior', nome: 'Advogado sênior', nivel: 70, permissoes: sem('gerir_usuarios') },
  { id: 'adv_pleno', nome: 'Advogado pleno', nivel: 60, permissoes: sem('gerir_usuarios', 'ver_auditoria', 'gerir_financeiro') },
  { id: 'adv_junior', nome: 'Advogado júnior', nivel: 50, permissoes: sem('gerir_usuarios', 'ver_auditoria', 'gerir_financeiro', 'aprovar_documentos', 'protocolar', 'enviar_cliente') },
  {
    id: 'estagiario', nome: 'Estagiário', nivel: 30,
    permissoes: ['ver_processos', 'ver_documentos', 'criar_documentos', 'editar_documentos', 'gerir_tarefas', 'usar_ia'],
  },
  {
    id: 'paralegal', nome: 'Paralegal', nivel: 35,
    permissoes: ['ver_processos', 'ver_documentos', 'criar_documentos', 'editar_documentos', 'gerir_prazos', 'gerir_tarefas', 'gerir_publicacoes', 'usar_ia'],
  },
  {
    id: 'financeiro', nome: 'Financeiro', nivel: 40,
    permissoes: ['ver_processos', 'ver_financeiro', 'gerir_financeiro', 'ver_prestacao_contas', 'exportar_relatorios'],
  },
  {
    id: 'atendimento', nome: 'Atendimento / Relacionamento', nivel: 30,
    permissoes: ['ver_processos', 'gerir_clientes', 'gerir_tarefas'],
  },
  // Cliente: acessa só o Portal do Cliente (Fase 5) — NUNCA o painel interno.
  { id: 'cliente', nome: 'Cliente', nivel: 10, permissoes: ['ver_prestacao_contas'] },
  // Agente de IA: ingestão e leitura, sem aprovar/enviar/protocolar nada.
  // editar_processos = registrar andamentos via PUBLISH_KEY (as rotas de
  // alteração de capa/status são requireAuth — a chave não chega nelas).
  {
    id: 'agente_ia', nome: 'Agente de IA jurídico', nivel: 20,
    permissoes: ['ver_processos', 'editar_processos', 'ver_documentos', 'criar_documentos', 'gerir_prazos', 'gerir_tarefas', 'gerir_publicacoes', 'usar_ia'],
  },
  { id: 'visualizador', nome: 'Visualizador (somente leitura)', nivel: 15, permissoes: ['ver_processos', 'ver_documentos'] },
];

const NUCLEOS = ['civel', 'penal', 'trabalhista', 'empresarial', 'contratual', 'contencioso', 'consultivo', 'audiencias'];

// ---- seed idempotente da matriz nas tabelas roles/role_permissions ----
function semearPerfis() {
  const upRole = db.prepare('INSERT INTO roles (id, nome, descricao, nivel) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, nivel=excluded.nivel');
  const delPerms = db.prepare('DELETE FROM role_permissions WHERE role_id = ?');
  const addPerm = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permissao) VALUES (?, ?)');
  for (const p of PERFIS) {
    upRole.run(p.id, p.nome, '', p.nivel);
    delPerms.run(p.id); // a matriz do código é a fonte da verdade
    for (const perm of p.permissoes) addPerm.run(p.id, perm);
  }
}
// NÃO semeia no load: o db é multi-tenant (db.js) e no carregamento ainda não
// há tenant/handle. A semeadura roda por-banco via inicializador (index.js).

const porId = new Map(PERFIS.map(p => [p.id, p]));

// ---- resolução do perfil de um usuário do Portal Staff ----
function perfilDe(portalUser) {
  if (!portalUser) return null;
  if (portalUser.papel === 'admin') return 'super_admin';
  const row = db.prepare('SELECT role_id, ativo FROM users WHERE id = ?').get(portalUser.id);
  if (row && row.ativo) return row.role_id;
  const areas = portalUser.areas || [];
  if (areas.includes('*') || areas.includes('juridico')) return 'visualizador';
  return null; // sem acesso ao módulo
}

function permissoesDe(portalUser) {
  const perfil = perfilDe(portalUser);
  if (!perfil) return null;
  const def = porId.get(perfil);
  const set = {};
  for (const p of PERMISSOES) set[p] = false;
  for (const p of (def ? def.permissoes : [])) set[p] = true;
  return { perfil, nome: def ? def.nome : perfil, permissoes: set };
}

// ---- cadastro do perfil jurídico (tabela users) ----
function listarEquipe() {
  return db.prepare('SELECT * FROM users ORDER BY nome').all()
    .map(u => ({ ...u, nucleos: j.parse(u.nucleos, []) }));
}
function salvarMembro({ id, nome, email, role_id, oab, nucleos, ativo }) {
  if (!porId.has(role_id)) throw new Error('Perfil inválido: ' + role_id);
  if (role_id === 'super_admin') throw new Error('super_admin é implícito do admin do portal — não se atribui.');
  const nucs = (Array.isArray(nucleos) ? nucleos : []).filter(n => NUCLEOS.includes(n));
  const agora = nowISO();
  db.prepare(`INSERT INTO users (id, nome, email, role_id, oab, nucleos, ativo, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, email=excluded.email, role_id=excluded.role_id,
      oab=excluded.oab, nucleos=excluded.nucleos, ativo=excluded.ativo, atualizado_em=excluded.atualizado_em`)
    .run(id, String(nome || ''), String(email || ''), role_id, String(oab || ''), j.str(nucs), ativo === false ? 0 : 1, agora, agora);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

module.exports = { PERMISSOES, PERFIS, NUCLEOS, perfilDe, permissoesDe, listarEquipe, salvarMembro, semearPerfis };
