-- =====================================================================
-- Villela Growth OS — Etapa 1 (fundação SaaS).
--
-- Roda no MESMO banco do Villela CRM (DATA_DIR/crm/crm.db) — ver
-- docs/growth-os/DECISIONS/ADR-0002. Tabelas do control plane (tenants,
-- plans, subscriptions, invoices, usage_records, audit_logs) e as crm_*
-- são COMPARTILHADAS e não são recriadas aqui.
--
-- Prefixo gx_ em tudo que é do Growth OS. Convenções do grupo:
-- CREATE IF NOT EXISTS, IDs TEXT url-safe, datas ISO-8601, dinheiro em
-- CENTAVOS, JSON em TEXT.
--
-- REGRA: toda tabela de negócio nasce com tenant_id + criado_em/por +
-- atualizado_em/por, e com excluido_em quando o dado for recuperável.
-- Tabela com tenant_id entra AUTOMATICAMENTE no teste anti-vazamento
-- (selftest.js lê o schema) — é de propósito.
-- =====================================================================

-- ======================= HIERARQUIA E IDENTIDADE =======================

-- plataforma → agência/revenda → (contas cliente ficam em `tenants`)
CREATE TABLE IF NOT EXISTS gx_orgs (
  id            TEXT PRIMARY KEY,
  tipo          TEXT NOT NULL DEFAULT 'agencia',   -- plataforma|agencia|revenda
  slug          TEXT UNIQUE NOT NULL,
  nome          TEXT NOT NULL,
  parent_id     TEXT DEFAULT '',                   -- '' só para a plataforma
  status        TEXT DEFAULT 'ativa',              -- ativa|suspensa|encerrada
  contato_email TEXT DEFAULT '',
  obs           TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT '',
  atualizado_em TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  excluido_em   TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_orgs_parent ON gx_orgs(parent_id, status);

-- uma conta cliente pertence a EXATAMENTE uma organização
CREATE TABLE IF NOT EXISTS gx_org_contas (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES gx_orgs(id) ON DELETE CASCADE,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT '',
  atualizado_em TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_orgcontas_tenant ON gx_org_contas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gx_orgcontas_org ON gx_org_contas(org_id);

-- identidade GLOBAL: a mesma pessoa pode operar várias contas (agência)
CREATE TABLE IF NOT EXISTS gx_users (
  id              TEXT PRIMARY KEY,
  nome            TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL,
  senha_hash      TEXT DEFAULT '',
  mfa_ativo       INTEGER DEFAULT 0,
  mfa_segredo     TEXT DEFAULT '',                 -- cifrado (segredos.js)
  status          TEXT DEFAULT 'ativo',            -- ativo|convidado|suspenso
  tenant_user_id  TEXT DEFAULT '',                 -- ponte com tenant_users do Villela CRM
  ultimo_login    TEXT DEFAULT '',
  criado_em       TEXT NOT NULL,
  criado_por      TEXT DEFAULT '',
  atualizado_em   TEXT DEFAULT '',
  atualizado_por  TEXT DEFAULT '',
  excluido_em     TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_users_email ON gx_users(lower(email));

-- sessões revogáveis (§28 do prompt)
-- NOTA: a coluna da conta ativa se chama `tenant_ativo`, não `tenant_id`.
-- Sessão é infraestrutura de autenticação, não dado pertencente a um
-- tenant — e o guarda do repo.js trata QUALQUER coluna `tenant_id` como
-- dado de cliente. Nomear diferente evita uma exceção no guarda.
CREATE TABLE IF NOT EXISTS gx_sessoes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES gx_users(id) ON DELETE CASCADE,
  tenant_ativo TEXT DEFAULT '',                    -- conta selecionada na sessão
  ip          TEXT DEFAULT '',
  user_agent  TEXT DEFAULT '',
  criado_em   TEXT NOT NULL,
  expira_em   TEXT DEFAULT '',
  revogada_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_sessoes_user ON gx_sessoes(user_id, revogada_em);

-- perfis. tenant_id = '' → perfil de sistema (não editável)
CREATE TABLE IF NOT EXISTS gx_roles (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL DEFAULT '',
  slug          TEXT NOT NULL,
  nome          TEXT NOT NULL,
  descricao     TEXT DEFAULT '',
  nivel         TEXT DEFAULT 'tenant',             -- plataforma|org|tenant
  permissoes    TEXT DEFAULT '[]',                 -- JSON: ["crm.contato.ler", ...]
  sistema       INTEGER DEFAULT 0,
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT '',
  atualizado_em TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_roles_slug ON gx_roles(tenant_id, slug);

-- vínculo usuário ↔ escopo (org OU tenant) com um perfil
CREATE TABLE IF NOT EXISTS gx_memberships (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES gx_users(id) ON DELETE CASCADE,
  escopo_tipo   TEXT NOT NULL DEFAULT 'tenant',    -- plataforma|org|tenant
  escopo_id     TEXT NOT NULL DEFAULT '',
  role_id       TEXT NOT NULL,
  equipe_id     TEXT DEFAULT '',
  escopos       TEXT DEFAULT '{}',                 -- JSON: {pipelines[],canais[],marcas[],ad_accounts[]}
  status        TEXT DEFAULT 'ativo',              -- ativo|suspenso|revogado
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT '',
  atualizado_em TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  revogado_em   TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_memb_unico ON gx_memberships(user_id, escopo_tipo, escopo_id);
CREATE INDEX IF NOT EXISTS idx_gx_memb_escopo ON gx_memberships(escopo_tipo, escopo_id, status);

CREATE TABLE IF NOT EXISTS gx_equipes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  descricao      TEXT DEFAULT '',
  lider_user_id  TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  excluido_em    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_equipes_tenant ON gx_equipes(tenant_id, criado_em);

CREATE TABLE IF NOT EXISTS gx_equipe_membros (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  equipe_id      TEXT NOT NULL REFERENCES gx_equipes(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,
  papel_equipe   TEXT DEFAULT 'membro',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_eqmemb ON gx_equipe_membros(equipe_id, user_id);

-- marca / white-label (escopo por marca e identidade das páginas públicas)
CREATE TABLE IF NOT EXISTS gx_marcas (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  logo_url        TEXT DEFAULT '',
  cores           TEXT DEFAULT '{}',
  dominio         TEXT DEFAULT '',
  remetente_email TEXT DEFAULT '',
  principal       INTEGER DEFAULT 0,
  criado_em       TEXT NOT NULL,
  criado_por      TEXT DEFAULT '',
  atualizado_em   TEXT DEFAULT '',
  atualizado_por  TEXT DEFAULT '',
  excluido_em     TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_marcas_slug ON gx_marcas(tenant_id, slug);

-- ===================== PLANOS, LIMITES E FLAGS =====================

-- valor EFETIVO por (tenant, chave): vem do plano ou de override manual
CREATE TABLE IF NOT EXISTS gx_entitlements (
  tenant_id      TEXT NOT NULL,
  chave          TEXT NOT NULL,
  valor          TEXT DEFAULT '',                  -- JSON escalar: número, booleano ou string
  origem         TEXT DEFAULT 'plano',             -- plano|override
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, chave)
);

CREATE TABLE IF NOT EXISTS gx_tenant_flags (
  tenant_id      TEXT NOT NULL,
  chave          TEXT NOT NULL,
  ligada         INTEGER DEFAULT 0,
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, chave)
);

-- ===================== EVENTOS (OUTBOX) E FILA =====================

CREATE TABLE IF NOT EXISTS gx_eventos (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT '',
  tipo           TEXT NOT NULL,
  ref_tipo       TEXT DEFAULT '',
  ref_id         TEXT DEFAULT '',
  payload        TEXT DEFAULT '{}',
  chave_idem     TEXT DEFAULT '',
  correlation_id TEXT DEFAULT '',
  causation_id   TEXT DEFAULT '',
  origem         TEXT DEFAULT 'api',               -- api|webhook|worker|automacao|agente
  profundidade   INTEGER DEFAULT 0,                -- anti-loop de automação
  status         TEXT DEFAULT 'pendente',          -- pendente|processado|falha|descartado
  tentativas     INTEGER DEFAULT 0,
  proxima_em     TEXT DEFAULT '',
  ultimo_erro    TEXT DEFAULT '',
  quando         TEXT NOT NULL,
  processado_em  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_eventos_pend ON gx_eventos(status, proxima_em);
CREATE INDEX IF NOT EXISTS idx_gx_eventos_tenant ON gx_eventos(tenant_id, quando);
CREATE INDEX IF NOT EXISTS idx_gx_eventos_corr ON gx_eventos(correlation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_eventos_idem ON gx_eventos(chave_idem) WHERE chave_idem != '';

CREATE TABLE IF NOT EXISTS gx_jobs (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT '',
  fila           TEXT DEFAULT 'padrao',
  tipo           TEXT NOT NULL,
  payload        TEXT DEFAULT '{}',
  prioridade     INTEGER DEFAULT 5,                -- 1 = mais urgente
  status         TEXT DEFAULT 'pendente',          -- pendente|processando|concluido|falha|dlq|cancelado
  tentativas     INTEGER DEFAULT 0,
  max_tentativas INTEGER DEFAULT 5,
  proxima_em     TEXT DEFAULT '',
  timeout_ms     INTEGER DEFAULT 30000,
  chave_idem     TEXT DEFAULT '',
  correlation_id TEXT DEFAULT '',
  evento_id      TEXT DEFAULT '',
  ultimo_erro    TEXT DEFAULT '',
  resultado      TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  iniciado_em    TEXT DEFAULT '',
  concluido_em   TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_jobs_pend ON gx_jobs(status, proxima_em, prioridade);
CREATE INDEX IF NOT EXISTS idx_gx_jobs_tenant ON gx_jobs(tenant_id, criado_em);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_jobs_idem ON gx_jobs(chave_idem) WHERE chave_idem != '';

-- ===================== APROVAÇÕES E INCIDENTES =====================

CREATE TABLE IF NOT EXISTS gx_aprovacoes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  origem_tipo    TEXT DEFAULT 'agente',            -- agente|automacao|usuario
  origem_id      TEXT DEFAULT '',
  acao           TEXT NOT NULL,                    -- chave do catálogo de ações
  nivel          INTEGER DEFAULT 3,                -- nível de autonomia exigido
  titulo         TEXT DEFAULT '',
  justificativa  TEXT DEFAULT '',
  dados          TEXT DEFAULT '{}',                -- o que será executado, na íntegra
  impacto        TEXT DEFAULT '',
  custo_centavos INTEGER DEFAULT 0,
  prazo          TEXT DEFAULT '',
  status         TEXT DEFAULT 'pendente',          -- pendente|aprovada|rejeitada|expirada|executada|falhou
  decidido_por   TEXT DEFAULT '',
  decidido_em    TEXT DEFAULT '',
  decisao_obs    TEXT DEFAULT '',
  dados_editados TEXT DEFAULT '',                  -- quando o humano edita antes de aprovar
  job_id         TEXT DEFAULT '',
  executada_em   TEXT DEFAULT '',
  resultado      TEXT DEFAULT '',
  correlation_id TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_aprov_tenant ON gx_aprovacoes(tenant_id, status, criado_em);

CREATE TABLE IF NOT EXISTS gx_incidentes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT '',
  natureza       TEXT NOT NULL,                    -- integracao|fila|seguranca|dados|externo
  severidade     TEXT DEFAULT 'media',             -- baixa|media|alta|critica
  titulo         TEXT NOT NULL,
  detalhe        TEXT DEFAULT '',
  ref_tipo       TEXT DEFAULT '',
  ref_id         TEXT DEFAULT '',
  status         TEXT DEFAULT 'aberto',            -- aberto|mitigado|fechado
  correlation_id TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  fechado_em     TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_incid_status ON gx_incidentes(status, severidade, criado_em);

-- ===================== INTEGRAÇÕES E COFRE =====================

-- catálogo de conectores. status conforme docs/growth-os/INTEGRATIONS.md.
-- SEM tenant_id: é catálogo global, não dado de cliente.
CREATE TABLE IF NOT EXISTS gx_integracoes (
  chave         TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  categoria     TEXT NOT NULL,                     -- messaging|social|ads|email|calendar|review|billing|interno
  status        TEXT DEFAULT 'planejada',
  versao_api    TEXT DEFAULT '',
  verificado_em TEXT DEFAULT '',                   -- vazio = doc oficial ainda NÃO consultada
  doc_url       TEXT DEFAULT '',
  escopos       TEXT DEFAULT '[]',
  capacidades   TEXT DEFAULT '{}',
  limitacoes    TEXT DEFAULT '[]',
  bloqueio      TEXT DEFAULT '',                   -- o que falta para ativar de verdade
  atualizado_em TEXT DEFAULT ''
);

-- cofre: valor SEMPRE cifrado (AES-256-GCM). O repositório devolve
-- referência e metadados — nunca o valor em claro.
CREATE TABLE IF NOT EXISTS gx_segredos (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  escopo         TEXT DEFAULT 'conexao',           -- conexao|integracao|tenant
  ref_id         TEXT DEFAULT '',
  chave          TEXT NOT NULL,                    -- access_token|refresh_token|api_key|mfa
  cifra          TEXT NOT NULL,                    -- base64
  iv             TEXT NOT NULL,
  tag            TEXT NOT NULL,
  expira_em      TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  rotacionado_em TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_segredos_ref ON gx_segredos(tenant_id, escopo, ref_id, chave);
