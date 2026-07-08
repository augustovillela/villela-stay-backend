-- =====================================================================
-- Villela Legal SaaS — plano comercial (control plane) do produto
-- "Villela Legal Intelligence" vendido a outros escritórios.
--
-- Este é o MÓDULO COMERCIAL: cadastra escritórios (tenants), gerencia
-- planos/limites/módulos/flags, trial, cobrança recorrente (Mercado Pago),
-- upgrade/downgrade, suspensão por inadimplência, tickets, métricas de uso,
-- custo por cliente e o painel da plataforma. Banco próprio em
-- DATA_DIR/legal-saas/ — isolado do módulo jurídico interno (legal/).
--
-- Convenções (iguais aos outros módulos): CREATE ... IF NOT EXISTS,
-- IDs TEXT url-safe, datas ISO-8601, dinheiro em CENTAVOS, JSON em TEXT.
-- Isolamento de DADOS do produto por tenant (cases/clients isolados por
-- escritório) é o próximo marco — ver README §Roadmap. Aqui mora o
-- relacionamento comercial + entitlements que gateiam a entrega.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, aplicada_em TEXT NOT NULL
);

-- ---- PLANOS (com módulos, limites e feature flags por plano) ----
CREATE TABLE IF NOT EXISTS plans (
  id             TEXT PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,      -- trial|essencial|profissional|escritorio|enterprise
  nome           TEXT NOT NULL,
  descricao      TEXT DEFAULT '',
  preco_centavos INTEGER DEFAULT 0,         -- mensal; 0 = sob consulta (enterprise)
  ciclo          TEXT DEFAULT 'mensal',     -- mensal|anual
  limites        TEXT DEFAULT '{}',         -- JSON: {advogados, processos_ativos, ia_consultas_mes, armazenamento_mb, clientes_portal}
  modulos        TEXT DEFAULT '[]',         -- JSON: chaves liberadas (processos, ia, pecas, contratos, portal_cliente, coleta_datajud...)
  flags          TEXT DEFAULT '{}',         -- JSON: {ia_direta:true, api_publica:false, white_label:false}
  ativo          INTEGER DEFAULT 1,
  ordem          INTEGER DEFAULT 0,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT DEFAULT ''
);

-- ---- ESCRITÓRIOS (tenants) ----
CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,     -- p/ subdomínio/URL futura
  nome            TEXT NOT NULL,            -- razão social / nome do escritório
  cnpj            TEXT DEFAULT '',
  oab_secional    TEXT DEFAULT '',          -- ex.: OAB/DF (contexto jurídico)
  email_contato   TEXT DEFAULT '',
  telefone        TEXT DEFAULT '',
  status          TEXT DEFAULT 'trial',     -- trial|ativa|inadimplente|suspensa|cancelada
  plan_id         TEXT DEFAULT '',          -- plano corrente (denormalizado p/ rapidez)
  trial_expira_em TEXT DEFAULT '',
  origem          TEXT DEFAULT '',          -- landing|indicacao|manual
  obs             TEXT DEFAULT '',
  criado_em       TEXT NOT NULL,
  atualizado_em   TEXT DEFAULT '',
  criado_por      TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Overrides por tenant: limites/módulos/flags extras negociados (Enterprise etc.)
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id     TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  limites_over  TEXT DEFAULT '{}',   -- sobrepõe limites do plano (merge)
  modulos_extra TEXT DEFAULT '[]',   -- módulos adicionais além do plano
  flags_over    TEXT DEFAULT '{}',   -- sobrepõe flags do plano
  atualizado_em TEXT DEFAULT ''
);

-- ---- WORKSPACES (um escritório pode ter N espaços: filiais/núcleos) ----
CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  slug          TEXT DEFAULT '',
  provisionado  INTEGER DEFAULT 0,   -- 1 = instância jurídica provisionada (marco futuro)
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspaces_tenant ON workspaces(tenant_id);

-- ---- USUÁRIOS do escritório (login do assinante, isolado do staff) ----
CREATE TABLE IF NOT EXISTS tenant_users (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL,
  senha_hash   TEXT DEFAULT '',      -- vazio = convidado, senha não definida
  papel        TEXT DEFAULT 'admin', -- admin|usuario (dono do escritório = admin)
  ativo        INTEGER DEFAULT 1,
  criado_em    TEXT NOT NULL,
  ultimo_login TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_users_email ON tenant_users(lower(email));

-- ---- ASSINATURAS (recorrência MP) ----
CREATE TABLE IF NOT EXISTS subscriptions (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id          TEXT NOT NULL,
  status           TEXT DEFAULT 'trial', -- trial|pendente|ativa|inadimplente|cancelada
  ciclo            TEXT DEFAULT 'mensal',
  inicio           TEXT NOT NULL,
  fim              TEXT DEFAULT '',
  proximo_venc     TEXT DEFAULT '',
  mp_preapproval_id TEXT DEFAULT '',
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_subs_tenant ON subscriptions(tenant_id, status);

-- ---- FATURAS / COBRANÇAS ----
CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  competencia   TEXT DEFAULT '',      -- 'YYYY-MM'
  vencimento    TEXT DEFAULT '',
  status        TEXT DEFAULT 'aberta', -- aberta|paga|vencida|cancelada
  mp_payment_id TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  pago_em       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, status);

-- ---- MÉTRICAS DE USO (por tenant / período / métrica) ----
CREATE TABLE IF NOT EXISTS usage_records (
  tenant_id     TEXT NOT NULL,
  periodo       TEXT NOT NULL,       -- 'YYYY-MM'
  metrica       TEXT NOT NULL,       -- advogados|processos_ativos|ia_consultas|armazenamento_mb|clientes_portal|api_chamadas
  quantidade    INTEGER DEFAULT 0,
  atualizado_em TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, periodo, metrica)
);

-- ---- CUSTO POR CLIENTE (o que o tenant custa à plataforma) ----
CREATE TABLE IF NOT EXISTS cost_records (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  periodo       TEXT NOT NULL,       -- 'YYYY-MM'
  categoria     TEXT NOT NULL,       -- ia|armazenamento|infra|suporte|outro
  custo_centavos INTEGER DEFAULT 0,  -- em CENTAVOS de BRL (estimado)
  detalhe       TEXT DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_tenant ON cost_records(tenant_id, periodo);

-- ---- FEATURE FLAGS globais (override por tenant vive em tenant_settings.flags_over) ----
CREATE TABLE IF NOT EXISTS feature_flags (
  chave       TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  descricao   TEXT DEFAULT '',
  padrao      INTEGER DEFAULT 0,     -- valor default quando plano/tenant não definem
  atualizado_em TEXT DEFAULT ''
);

-- ---- SUPORTE / TICKETS ----
CREATE TABLE IF NOT EXISTS tickets (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assunto      TEXT NOT NULL,
  prioridade   TEXT DEFAULT 'media', -- alta|media|baixa
  status       TEXT DEFAULT 'aberto', -- aberto|em_andamento|respondido|resolvido|fechado
  aberto_por   TEXT DEFAULT '',      -- e-mail do usuário do tenant
  criado_em    TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  autor      TEXT DEFAULT '',
  lado       TEXT NOT NULL DEFAULT 'cliente', -- cliente|plataforma
  texto      TEXT NOT NULL,
  criado_em  TEXT NOT NULL
);

-- ---- LEADS (signup/trial da landing antes de virar tenant, e "sob consulta") ----
CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  nome       TEXT DEFAULT '',
  escritorio TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  telefone   TEXT DEFAULT '',
  plano      TEXT DEFAULT '',
  mensagem   TEXT DEFAULT '',
  status     TEXT DEFAULT 'novo',  -- novo|contatado|convertido|descartado
  tenant_id  TEXT DEFAULT '',      -- preenchido quando converte
  criado_em  TEXT NOT NULL
);

-- ---- LOGS de eventos da plataforma (billing/webhook/lifecycle) ----
CREATE TABLE IF NOT EXISTS platform_events (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT DEFAULT '',
  tipo       TEXT NOT NULL,        -- ex.: tenant.criado, billing.assinar, webhook.mp, tenant.suspenso
  ref        TEXT DEFAULT '',
  payload    TEXT DEFAULT '',      -- JSON
  quando     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_quando ON platform_events(quando);

-- ---- AUDITORIA (ações administrativas) ----
CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  quando     TEXT NOT NULL,
  tenant_id  TEXT DEFAULT '',
  quem       TEXT DEFAULT '',      -- e-mail/nome ou 'plataforma'
  acao       TEXT NOT NULL,
  entidade   TEXT DEFAULT '',
  entidade_id TEXT DEFAULT '',
  detalhe    TEXT DEFAULT '',
  ip         TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_saas_audit_quando ON audit_logs(quando);
