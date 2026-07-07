-- =====================================================================
-- Villela Docs Intelligence — schema da FUNDAÇÃO SaaS (Fase 1).
-- SQLite (node:sqlite), ANSI-fiel para migração futura a PostgreSQL.
-- REGRA DE OURO: toda tabela de dados de cliente tem tenant_id e toda
-- query do repo exige tenant_id — o isolamento é verificado no selftest.
-- Tabelas das Fases 2+ (folders, documents, ocr_jobs, workflows, ai_*)
-- estão especificadas no README.md e só entram quando a fase chegar.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  nome        TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL
);

-- ---------- plataforma (sem tenant_id: dados do dono do SaaS) ----------

CREATE TABLE IF NOT EXISTS plans (
  id             TEXT PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,      -- starter|professional|business|enterprise
  nome           TEXT NOT NULL,
  descricao      TEXT DEFAULT '',
  preco_centavos INTEGER DEFAULT 0,         -- mensal; 0 = sob consulta (enterprise)
  limites        TEXT DEFAULT '{}',         -- JSON: usuarios, armazenamento_mb, documentos, ocr_paginas_mes, ia_consultas_mes, workflows_ativos, api, sso
  ativo          INTEGER DEFAULT 1,
  ordem          INTEGER DEFAULT 0,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS leads (
  id        TEXT PRIMARY KEY,
  nome      TEXT DEFAULT '',
  email     TEXT DEFAULT '',
  telefone  TEXT DEFAULT '',
  empresa   TEXT DEFAULT '',
  mensagem  TEXT DEFAULT '',
  origem    TEXT DEFAULT 'landing',         -- landing|precos|demo
  status    TEXT DEFAULT 'novo',            -- novo|contactado|convertido|descartado
  criado_em TEXT NOT NULL
);

-- ---------- tenants (empresas clientes) ----------

CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,     -- p/ subdomínio/URL futura
  nome            TEXT NOT NULL,
  cnpj            TEXT DEFAULT '',
  email_contato   TEXT DEFAULT '',
  telefone        TEXT DEFAULT '',
  status          TEXT DEFAULT 'trial',     -- trial|ativa|suspensa|cancelada
  trial_expira_em TEXT DEFAULT '',
  criado_em       TEXT NOT NULL,
  atualizado_em   TEXT DEFAULT '',
  criado_por      TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id      TEXT NOT NULL,
  chave          TEXT NOT NULL,
  valor          TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, chave)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  plan_id       TEXT NOT NULL,
  status        TEXT DEFAULT 'trial',       -- trial|ativa|suspensa|cancelada
  inicio        TEXT NOT NULL,
  fim           TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_subs_tenant ON subscriptions (tenant_id, status);

-- Uso mensal por métrica (upsert por tenant+período+métrica).
CREATE TABLE IF NOT EXISTS usage_records (
  tenant_id     TEXT NOT NULL,
  periodo       TEXT NOT NULL,              -- 'YYYY-MM'
  metrica       TEXT NOT NULL,              -- usuarios|documentos|armazenamento_mb|ocr_paginas|ia_consultas|api_chamadas
  quantidade    INTEGER DEFAULT 0,
  atualizado_em TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, periodo, metrica)
);

-- ---------- identidade ----------

-- Usuário é GLOBAL (um e-mail, uma senha) e participa de 1+ tenants via
-- tenant_users. Nada de dado de negócio aqui — só identidade.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,       -- sempre minúsculo
  nome          TEXT NOT NULL,
  senha_hash    TEXT DEFAULT '',            -- bcrypt; '' = convite pendente
  ativo         INTEGER DEFAULT 1,
  ultimo_login  TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tenant_users (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  papel         TEXT DEFAULT 'usuario',     -- papel embutido (permissoes.js) OU 'custom:<role_id>'
  status        TEXT DEFAULT 'ativo',       -- ativo|suspenso|removido
  departamento  TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT '',
  criado_por    TEXT DEFAULT '',
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tu_tenant ON tenant_users (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tu_user   ON tenant_users (user_id, status);

-- Papéis personalizados por tenant (RBAC; ABAC fica p/ fase enterprise).
CREATE TABLE IF NOT EXISTS roles (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  nome          TEXT NOT NULL,
  descricao     TEXT DEFAULT '',
  permissoes    TEXT DEFAULT '[]',          -- JSON array de chaves de permissoes.js
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT '',
  criado_por    TEXT DEFAULT '',
  UNIQUE (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS access_invites (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  email      TEXT NOT NULL,
  papel      TEXT DEFAULT 'usuario',
  token_hash TEXT NOT NULL,                 -- sha256 do token; o token em si não é gravado
  expira_em  TEXT NOT NULL,
  aceito_em  TEXT DEFAULT '',
  criado_em  TEXT NOT NULL,
  criado_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_inv_tenant ON access_invites (tenant_id);

-- ---------- auditoria ----------

-- tenant_id = '' registra evento da PLATAFORMA (ação do staff Villela).
CREATE TABLE IF NOT EXISTS audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    TEXT DEFAULT '',
  user_id      TEXT DEFAULT '',
  usuario_nome TEXT DEFAULT '',
  acao         TEXT NOT NULL,               -- ex.: tenant.criar, usuario.convidar, login.ok
  entidade     TEXT DEFAULT '',
  entidade_id  TEXT DEFAULT '',
  detalhes     TEXT DEFAULT '{}',           -- JSON (nunca senha/token)
  ip           TEXT DEFAULT '',
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs (tenant_id, criado_em);
