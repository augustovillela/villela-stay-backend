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

-- ---------- Fase 2: gestão documental básica ----------

CREATE TABLE IF NOT EXISTS folders (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  parent_id     TEXT DEFAULT '',            -- '' = raiz
  nome          TEXT NOT NULL,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT '',
  criado_por    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_folders_tenant ON folders (tenant_id, parent_id);

CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  folder_id       TEXT DEFAULT '',          -- '' = raiz
  nome            TEXT NOT NULL,            -- nome de exibição (editável)
  descricao       TEXT DEFAULT '',
  tipo_documental TEXT DEFAULT '',          -- contrato|nota_fiscal|recibo|politica|rh|juridico|outro...
  tags            TEXT DEFAULT '[]',        -- JSON array
  status          TEXT DEFAULT 'ativo',     -- ativo|lixeira
  versao_atual    INTEGER DEFAULT 1,
  validade        TEXT DEFAULT '',          -- data ISO p/ alertas de vencimento (rotina na F3+)
  criado_em       TEXT NOT NULL,
  atualizado_em   TEXT DEFAULT '',
  criado_por      TEXT DEFAULT '',
  excluido_em     TEXT DEFAULT '',
  excluido_por    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_docs_tenant ON documents (tenant_id, status, folder_id);

CREATE TABLE IF NOT EXISTS document_versions (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  document_id  TEXT NOT NULL,
  numero       INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,               -- nome original do upload
  mime         TEXT DEFAULT '',
  tamanho      INTEGER DEFAULT 0,           -- bytes
  sha256       TEXT NOT NULL,
  file_path    TEXT NOT NULL,               -- relativo a STORAGE_DIR (nunca exposto ao cliente)
  comentario   TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  criado_por   TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vers_doc ON document_versions (tenant_id, document_id, numero);
CREATE INDEX IF NOT EXISTS idx_vers_hash ON document_versions (tenant_id, sha256);

-- Metadados personalizados (chave→valor por documento; campos padrão ficam em documents).
CREATE TABLE IF NOT EXISTS document_metadata (
  tenant_id   TEXT NOT NULL,
  document_id TEXT NOT NULL,
  chave       TEXT NOT NULL,
  valor       TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, document_id, chave)
);

-- LGPD/auditoria fina: quem viu/baixou cada documento.
CREATE TABLE IF NOT EXISTS document_access_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL,
  document_id TEXT NOT NULL,
  user_id     TEXT DEFAULT '',
  acao        TEXT NOT NULL,                -- visualizar|baixar
  versao      INTEGER DEFAULT 0,
  ip          TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_acc_doc ON document_access_logs (tenant_id, document_id, criado_em);

-- ---------- Fase 3: processamento assíncrono (extração de texto e indexação) ----------

CREATE TABLE IF NOT EXISTS processing_jobs (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  document_id   TEXT NOT NULL,
  versao        INTEGER DEFAULT 0,
  tipo          TEXT NOT NULL,              -- extrair_texto (OCR real pluga aqui no futuro)
  status        TEXT DEFAULT 'aguardando',  -- aguardando|processando|concluido|erro|ocr_pendente
  tentativas    INTEGER DEFAULT 0,
  erro          TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON processing_jobs (status, criado_em);
CREATE INDEX IF NOT EXISTS idx_jobs_doc ON processing_jobs (tenant_id, document_id);

-- Texto extraído da versão VIGENTE do documento (re-extraído a cada versão nova).
CREATE TABLE IF NOT EXISTS document_texts (
  tenant_id   TEXT NOT NULL,
  document_id TEXT NOT NULL,
  versao      INTEGER DEFAULT 0,
  texto       TEXT DEFAULT '',
  metodo      TEXT DEFAULT '',              -- texto|pdf|docx|xlsx|pptx|ocr (futuro)
  paginas     INTEGER DEFAULT 0,
  chars       INTEGER DEFAULT 0,
  extraido_em TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, document_id)
);

-- Índice de busca por conteúdo (BM25). tenant_id/document_id UNINDEXED = filtro pós-match.
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  tenant_id UNINDEXED, document_id UNINDEXED, nome, texto, tokenize='unicode61'
);

-- ---------- Fase 4: busca avançada ----------

-- Histórico de buscas (sugestões + auditoria de uso; LGPD: só termo/filtros, nunca conteúdo).
CREATE TABLE IF NOT EXISTS search_queries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  TEXT NOT NULL,
  user_id    TEXT DEFAULT '',
  termo      TEXT DEFAULT '',
  filtros    TEXT DEFAULT '{}',             -- JSON
  resultados INTEGER DEFAULT 0,
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sq_tenant ON search_queries (tenant_id, user_id, criado_em);

CREATE TABLE IF NOT EXISTS saved_searches (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,                 -- busca salva é pessoal
  nome       TEXT NOT NULL,
  termo      TEXT DEFAULT '',
  filtros    TEXT DEFAULT '{}',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ss_tenant ON saved_searches (tenant_id, user_id);

-- ---------- Fase 5: IA documental ----------

CREATE TABLE IF NOT EXISTS ai_conversations (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL,              -- conversa é pessoal
  titulo        TEXT DEFAULT '',
  escopo_tipo   TEXT DEFAULT 'base',        -- base|pasta|documento
  escopo_ref    TEXT DEFAULT '',            -- folder_id/document_id conforme o tipo
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_aic_tenant ON ai_conversations (tenant_id, user_id, atualizado_em);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  papel           TEXT NOT NULL,            -- usuario|assistente
  conteudo        TEXT DEFAULT '',
  fontes          TEXT DEFAULT '[]',        -- JSON [{document_id, nome, trecho}]
  nao_encontrado  INTEGER DEFAULT 0,
  nivel_confianca TEXT DEFAULT '',
  modelo          TEXT DEFAULT '',
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  criado_em       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aim_conv ON ai_messages (tenant_id, conversation_id, criado_em);

CREATE TABLE IF NOT EXISTS ai_feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id    TEXT DEFAULT '',
  tipo       TEXT NOT NULL,                 -- util|incorreta|sensivel
  comentario TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);

-- Log de cada chamada ao LLM (custo por tenant p/ margem — Módulo 20).
CREATE TABLE IF NOT EXISTS ai_runs (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL,
  modelo             TEXT DEFAULT '',
  input_tokens       INTEGER DEFAULT 0,
  output_tokens      INTEGER DEFAULT 0,
  custo_centavos_usd INTEGER DEFAULT 0,
  duracao_ms         INTEGER DEFAULT 0,
  status             TEXT DEFAULT 'ok',
  detalhe            TEXT DEFAULT '',
  criado_em          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_air_tenant ON ai_runs (tenant_id, criado_em);

-- ---------- Fase 6: workflows de aprovação ----------

-- Modelo de fluxo por tenant. Etapas em JSON:
--   [{ nome, aprovadores: [user_id...], prazo_dias }]  (etapas sequenciais;
--   dentro da etapa QUALQUER aprovador listado decide — decisão no README)
CREATE TABLE IF NOT EXISTS workflows (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  nome       TEXT NOT NULL,
  descricao  TEXT DEFAULT '',
  etapas     TEXT DEFAULT '[]',
  ativo      INTEGER DEFAULT 1,
  criado_em  TEXT NOT NULL,
  criado_por TEXT DEFAULT '',
  UNIQUE (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  workflow_id   TEXT NOT NULL,
  workflow_nome TEXT DEFAULT '',            -- congelado (modelo pode mudar depois)
  etapas        TEXT DEFAULT '[]',          -- congeladas na abertura
  document_id   TEXT NOT NULL,
  versao        INTEGER DEFAULT 0,          -- versão do documento submetida
  etapa_atual   INTEGER DEFAULT 0,          -- índice da etapa em andamento
  status        TEXT DEFAULT 'em_andamento',-- em_andamento|aprovado|rejeitado|cancelado
  prazo_em      TEXT DEFAULT '',            -- prazo da etapa atual
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT '',
  finalizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_wfi_tenant ON workflow_instances (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wfi_doc ON workflow_instances (tenant_id, document_id);

CREATE TABLE IF NOT EXISTS workflow_approvals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     TEXT NOT NULL,
  instance_id   TEXT NOT NULL,
  etapa         INTEGER DEFAULT 0,
  aprovador_id  TEXT NOT NULL,
  decisao       TEXT NOT NULL,              -- aprovar|rejeitar
  justificativa TEXT DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wfa_inst ON workflow_approvals (tenant_id, instance_id);

-- ---------- Fase 7: compartilhamento externo ----------

-- Link seguro p/ documento OU pasta ("sala segura" = share de pasta).
-- token NUNCA é gravado — só o sha256; senha opcional em bcrypt.
CREATE TABLE IF NOT EXISTS shares (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  alvo_tipo        TEXT NOT NULL,            -- documento|pasta
  alvo_id          TEXT NOT NULL,
  token_hash       TEXT NOT NULL,
  senha_hash       TEXT DEFAULT '',          -- '' = sem senha
  permite_download INTEGER DEFAULT 1,        -- 0 = só visualização
  expira_em        TEXT DEFAULT '',          -- '' = sem expiração
  revogado_em      TEXT DEFAULT '',
  rotulo           TEXT DEFAULT '',          -- p/ quem é (aparece na gestão, não no público)
  criado_em        TEXT NOT NULL,
  criado_por       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sh_tenant ON shares (tenant_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_sh_token ON shares (token_hash);

CREATE TABLE IF NOT EXISTS share_access_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL,
  share_id    TEXT NOT NULL,
  acao        TEXT NOT NULL,                 -- visualizar|baixar|senha_errada
  document_id TEXT DEFAULT '',
  ip          TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shl_share ON share_access_logs (tenant_id, share_id, criado_em);

-- Solicitação de documentos a alguém de fora (upload externo p/ uma pasta).
CREATE TABLE IF NOT EXISTS document_requests (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  folder_id    TEXT DEFAULT '',
  titulo       TEXT NOT NULL,
  instrucoes   TEXT DEFAULT '',
  token_hash   TEXT NOT NULL,
  expira_em    TEXT DEFAULT '',
  max_arquivos INTEGER DEFAULT 10,
  recebidos    INTEGER DEFAULT 0,
  revogado_em  TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  criado_por   TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_dr_token ON document_requests (token_hash);
