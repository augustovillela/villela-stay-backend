-- =====================================================================
-- Villela Projects & Events Intelligence — schema da FUNDAÇÃO (Fase 1).
-- SQLite (node:sqlite), ANSI-fiel p/ migração futura a PostgreSQL.
-- REGRA DE OURO (herdada e provada no Villela Docs): toda tabela de dado
-- de cliente tem tenant_id e todo acesso no repo exige tenantId.
-- O uso interno da Villela é um TENANT normal (slug villela-interno),
-- semeado com os 16 projetos — mesmo isolamento dos clientes SaaS.
-- Tabelas das Fases 2+ (tarefas, eventos, CRM, financeiro, IA...) estão
-- especificadas no README e entram fase a fase.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  nome        TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL
);

-- ---------- plataforma ----------

CREATE TABLE IF NOT EXISTS plans (
  id             TEXT PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,
  nome           TEXT NOT NULL,
  descricao      TEXT DEFAULT '',
  preco_centavos INTEGER DEFAULT 0,
  limites        TEXT DEFAULT '{}',   -- JSON: usuarios, projetos, eventos_mes, ia_consultas_mes, automacoes, portal_cliente, api
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
  origem    TEXT DEFAULT 'landing',
  status    TEXT DEFAULT 'novo',
  criado_em TEXT NOT NULL
);

-- ---------- tenants ----------

CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  nome            TEXT NOT NULL,
  cnpj            TEXT DEFAULT '',
  email_contato   TEXT DEFAULT '',
  telefone        TEXT DEFAULT '',
  status          TEXT DEFAULT 'trial',   -- trial|ativa|suspensa|cancelada
  interno         INTEGER DEFAULT 0,      -- 1 = workspace interno Villela (nunca suspende por billing)
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
  status        TEXT DEFAULT 'trial',
  inicio        TEXT NOT NULL,
  fim           TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vpe_subs ON subscriptions (tenant_id, status);

CREATE TABLE IF NOT EXISTS usage_records (
  tenant_id     TEXT NOT NULL,
  periodo       TEXT NOT NULL,
  metrica       TEXT NOT NULL,
  quantidade    INTEGER DEFAULT 0,
  atualizado_em TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, periodo, metrica)
);

-- ---------- identidade (usuário global + vínculo por tenant) ----------

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  nome          TEXT NOT NULL,
  senha_hash    TEXT DEFAULT '',
  ativo         INTEGER DEFAULT 1,
  ultimo_login  TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tenant_users (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  papel         TEXT DEFAULT 'colaborador',   -- embutido (permissoes.js) OU 'custom:<role_id>'
  status        TEXT DEFAULT 'ativo',
  funcao        TEXT DEFAULT '',              -- rótulo livre (ex.: Produtor, Chef, Comercial)
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT '',
  criado_por    TEXT DEFAULT '',
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_vpe_tu_tenant ON tenant_users (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vpe_tu_user ON tenant_users (user_id, status);

CREATE TABLE IF NOT EXISTS roles (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  nome          TEXT NOT NULL,
  descricao     TEXT DEFAULT '',
  permissoes    TEXT DEFAULT '[]',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT '',
  criado_por    TEXT DEFAULT '',
  UNIQUE (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS access_invites (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  email      TEXT NOT NULL,
  papel      TEXT DEFAULT 'colaborador',
  token_hash TEXT NOT NULL,
  expira_em  TEXT NOT NULL,
  aceito_em  TEXT DEFAULT '',
  criado_em  TEXT NOT NULL,
  criado_por TEXT DEFAULT ''
);

-- ---------- auditoria ----------

CREATE TABLE IF NOT EXISTS audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    TEXT DEFAULT '',
  user_id      TEXT DEFAULT '',
  usuario_nome TEXT DEFAULT '',
  acao         TEXT NOT NULL,
  entidade     TEXT DEFAULT '',
  entidade_id  TEXT DEFAULT '',
  detalhes     TEXT DEFAULT '{}',
  ip           TEXT DEFAULT '',
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vpe_audit ON audit_logs (tenant_id, criado_em);

-- ---------- portfólio (mínimo p/ a Fase 1: cadastro + seed dos 16) ----------
-- Gestão completa (tarefas, marcos, Gantt, decisões) chega nas Fases 2-3;
-- este núcleo já sustenta o dashboard executivo e o ranking do portfólio.

CREATE TABLE IF NOT EXISTS projects (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  nome                  TEXT NOT NULL,
  descricao             TEXT DEFAULT '',
  categoria             TEXT DEFAULT 'outro',    -- hospedagem|containers|transporte|locacao|eventos|gastronomia|imobiliario|construcao|nautica|outro
  estagio               TEXT DEFAULT 'ideia',    -- ideia|incubacao|pesquisa|viabilidade|plano_negocio|planejamento|prototipo|desenvolvimento|pre_lancamento|lancamento|operacao|expansao|pausado|cancelado|arquivado
  horizonte             TEXT DEFAULT 'medio',    -- curto|medio|longo
  prioridade            TEXT DEFAULT 'media',    -- alta|media|baixa
  viabilidade           INTEGER DEFAULT 0,       -- score 0-100 (0 = não avaliado; motor completo na Fase 2)
  investimento_estimado INTEGER DEFAULT 0,       -- centavos
  receita_potencial     INTEGER DEFAULT 0,       -- centavos/ano (estimativa)
  riscos                TEXT DEFAULT '',
  proximos_passos       TEXT DEFAULT '',
  responsavel           TEXT DEFAULT '',
  tags                  TEXT DEFAULT '[]',
  status                TEXT DEFAULT 'ativo',    -- ativo|pausado|cancelado|arquivado
  ordem                 INTEGER DEFAULT 0,
  criado_em             TEXT NOT NULL,
  atualizado_em         TEXT DEFAULT '',
  criado_por            TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vpe_proj ON projects (tenant_id, status, estagio);

-- ---------- Fase 2: portfólio avançado ----------

-- Plano de negócio: 1 por projeto, seções em JSON (catálogo em portfolio.js).
-- Cada salvamento gera snapshot em business_plan_versions (controle de versões).
CREATE TABLE IF NOT EXISTS business_plans (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  project_id    TEXT UNIQUE NOT NULL,
  secoes        TEXT DEFAULT '{}',
  versao        INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'rascunho',   -- rascunho|em_analise|aprovado
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vpe_bp ON business_plans (tenant_id, project_id);

CREATE TABLE IF NOT EXISTS business_plan_versions (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  plan_id    TEXT NOT NULL,
  numero     INTEGER NOT NULL,
  secoes     TEXT DEFAULT '{}',
  criado_em  TEXT NOT NULL,
  criado_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vpe_bpv ON business_plan_versions (tenant_id, plan_id, numero);

-- Score de viabilidade guiado: 11 critérios 0-10 → score 0-100 (espelhado
-- em projects.viabilidade a cada salvamento).
CREATE TABLE IF NOT EXISTS viability_scores (
  tenant_id     TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  criterios     TEXT DEFAULT '{}',
  score         INTEGER DEFAULT 0,
  observacoes   TEXT DEFAULT '',
  atualizado_em TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, project_id)
);

-- Governança: decisões formais sobre cada projeto (histórico imutável).
CREATE TABLE IF NOT EXISTS project_decisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  decisao       TEXT NOT NULL,             -- avancar|amadurecer|pausar|descartar|retomar
  justificativa TEXT DEFAULT '',
  decidido_por  TEXT DEFAULT '',
  decidido_nome TEXT DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vpe_dec ON project_decisions (tenant_id, project_id, criado_em);

-- ---------- Fase 3: execução (tarefas, checklists, riscos) ----------

CREATE TABLE IF NOT EXISTS project_tasks (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  project_id     TEXT NOT NULL,
  parent_id      TEXT DEFAULT '',            -- subtarefa
  titulo         TEXT NOT NULL,
  descricao      TEXT DEFAULT '',
  responsavel_id TEXT DEFAULT '',            -- user_id do tenant
  prioridade     TEXT DEFAULT 'media',       -- alta|media|baixa
  prazo          TEXT DEFAULT '',            -- YYYY-MM-DD (atrasada = derivado)
  status         TEXT DEFAULT 'pendente',    -- pendente|em_andamento|aguardando|em_revisao|concluida|cancelada
  etiquetas      TEXT DEFAULT '[]',
  checklist      TEXT DEFAULT '[]',          -- [{t:'texto', feito:bool}]
  dependencia_de TEXT DEFAULT '',            -- task_id que precisa concluir antes
  ordem          INTEGER DEFAULT 0,
  concluida_em   TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT DEFAULT '',
  criado_por     TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vpe_task ON project_tasks (tenant_id, project_id, status);
CREATE INDEX IF NOT EXISTS idx_vpe_task_resp ON project_tasks (tenant_id, responsavel_id, status);
CREATE INDEX IF NOT EXISTS idx_vpe_task_prazo ON project_tasks (tenant_id, prazo);

CREATE TABLE IF NOT EXISTS project_risks (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL,
  project_id         TEXT NOT NULL,
  descricao          TEXT NOT NULL,
  probabilidade      TEXT DEFAULT 'media',   -- baixa|media|alta
  impacto            TEXT DEFAULT 'medio',   -- baixo|medio|alto
  plano_prevencao    TEXT DEFAULT '',
  plano_contingencia TEXT DEFAULT '',
  responsavel        TEXT DEFAULT '',
  status             TEXT DEFAULT 'aberto',  -- aberto|mitigado|ocorreu|encerrado
  criado_em          TEXT NOT NULL,
  atualizado_em      TEXT DEFAULT '',
  criado_por         TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vpe_risk ON project_risks (tenant_id, project_id, status);

-- ---------- Fase 4: eventos ----------

-- Fornecedores são do TENANT (reutilizáveis entre eventos), não do evento.
CREATE TABLE IF NOT EXISTS suppliers (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  nome          TEXT NOT NULL,
  categoria     TEXT DEFAULT 'outro',       -- buffet|chef|garcons|decoracao|som|iluminacao|dj|fotografo|filmagem|limpeza|transporte|mobiliario|seguranca|cerimonial|nautica|outro
  telefone      TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  observacoes   TEXT DEFAULT '',
  favorito      INTEGER DEFAULT 0,
  bloqueado     INTEGER DEFAULT 0,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT '',
  criado_por    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vpe_sup ON suppliers (tenant_id, categoria);

CREATE TABLE IF NOT EXISTS events (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  project_id           TEXT DEFAULT '',      -- vínculo opcional a um projeto do portfólio
  nome                 TEXT NOT NULL,
  tipo                 TEXT DEFAULT 'outro', -- casamento|aniversario|confraternizacao|churrasco|corporativo|infantil|jantar|brunch|coffee_break|curso|palestra|lancamento|hospedagem_evento|day_use|online|hibrido|outro
  cliente_nome         TEXT DEFAULT '',
  cliente_contato      TEXT DEFAULT '',
  local                TEXT DEFAULT '',
  data                 TEXT DEFAULT '',      -- YYYY-MM-DD
  hora                 TEXT DEFAULT '',
  convidados_previstos INTEGER DEFAULT 0,
  orcamento_centavos   INTEGER DEFAULT 0,    -- custo previsto
  receita_centavos     INTEGER DEFAULT 0,    -- valor fechado com o cliente
  status               TEXT DEFAULT 'lead',  -- lead|briefing|proposta|negociacao|aprovado|confirmado|em_preparacao|realizado|pos_evento|cancelado
  briefing             TEXT DEFAULT '{}',    -- JSON (seções em eventos.js)
  checklist            TEXT DEFAULT '[]',    -- [{t, feito}]
  pos_evento           TEXT DEFAULT '{}',    -- JSON: avaliacao, licoes, depoimento, pendencias
  observacoes          TEXT DEFAULT '',
  criado_em            TEXT NOT NULL,
  atualizado_em        TEXT DEFAULT '',
  criado_por           TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vpe_ev ON events (tenant_id, status, data);

-- Fornecedores alocados a um evento (com valor e status de contratação).
CREATE TABLE IF NOT EXISTS event_suppliers (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  event_id       TEXT NOT NULL,
  supplier_id    TEXT NOT NULL,
  categoria      TEXT DEFAULT '',
  valor_centavos INTEGER DEFAULT 0,
  status         TEXT DEFAULT 'cotado',      -- cotado|confirmado|pago|cancelado
  observacoes    TEXT DEFAULT '',
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vpe_evsup ON event_suppliers (tenant_id, event_id);

CREATE TABLE IF NOT EXISTS event_guests (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL,
  event_id           TEXT NOT NULL,
  nome               TEXT NOT NULL,
  contato            TEXT DEFAULT '',
  acompanhantes      INTEGER DEFAULT 0,
  rsvp               TEXT DEFAULT 'pendente', -- pendente|confirmado|recusado
  restricao_alimentar TEXT DEFAULT '',
  categoria          TEXT DEFAULT '',
  checkin_em         TEXT DEFAULT '',
  criado_em          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vpe_guest ON event_guests (tenant_id, event_id, rsvp);
