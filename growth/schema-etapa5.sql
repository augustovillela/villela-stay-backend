-- =====================================================================
-- Villela Growth OS — ETAPA 5: agentes de IA.
--
-- Governança do §20 do PROMPT_MASTER virada em tabela: cada agente tem
-- prompt versionado, orçamento de tokens, limite de custo e de ações,
-- ferramentas nomeadas, critérios de parada e regras de handoff.
--
-- Duas separações que não podem ser afrouxadas:
--   • MEMÓRIA tem escopo rígido (sistema/tenant/marca/contato/conversa/
--     execução) e NUNCA cruza conta;
--   • toda AÇÃO proposta é registrada, mesmo quando bloqueada — é o que
--     permite auditar o que o agente quis fazer, não só o que fez.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gx_agentes (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  chave                 TEXT NOT NULL,            -- sdr|vendas|marketing|conteudo|social|midia|cs|reputacao|analytics|conformidade|operacional|coordenador
  nome                  TEXT NOT NULL,
  funcao                TEXT DEFAULT '',
  objetivo              TEXT DEFAULT '',
  nivel_autonomia       INTEGER DEFAULT 1,        -- 0..4 (§20)
  motor                 TEXT DEFAULT 'regras',    -- regras|llm
  modelo                TEXT DEFAULT '',
  ferramentas           TEXT DEFAULT '[]',        -- JSON: nomes do registro de ferramentas
  fontes                TEXT DEFAULT '[]',        -- JSON: ids/tags da base de conhecimento
  eventos_ativacao      TEXT DEFAULT '[]',
  criterios_parada      TEXT DEFAULT '{}',
  handoff               TEXT DEFAULT '{}',
  memoria_permitida     TEXT DEFAULT '["execucao","conversa","contato"]',
  -- orçamento e limites (§20): sem isso, agente vira conta aberta
  orcamento_tokens_mes  INTEGER DEFAULT 200000,
  limite_custo_mes_cent INTEGER DEFAULT 5000,
  limite_acoes_dia      INTEGER DEFAULT 50,
  versao                INTEGER DEFAULT 1,
  ativo                 INTEGER DEFAULT 0,
  -- métricas
  execucoes             INTEGER DEFAULT 0,
  acoes_sugeridas       INTEGER DEFAULT 0,
  acoes_executadas      INTEGER DEFAULT 0,
  acoes_bloqueadas      INTEGER DEFAULT 0,
  correcoes_humanas     INTEGER DEFAULT 0,
  criado_em             TEXT NOT NULL,
  criado_por            TEXT DEFAULT '',
  atualizado_em         TEXT DEFAULT '',
  atualizado_por        TEXT DEFAULT '',
  excluido_em           TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_agentes_chave ON gx_agentes(tenant_id, chave);

-- Prompt é versionado: trocar o prompt não reescreve o que já rodou.
CREATE TABLE IF NOT EXISTS gx_agente_versoes (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  agente_id     TEXT NOT NULL,
  versao        INTEGER NOT NULL,
  prompt        TEXT DEFAULT '',
  config        TEXT DEFAULT '{}',
  notas         TEXT DEFAULT '',
  publicada_em  TEXT DEFAULT '',
  publicada_por TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_agver ON gx_agente_versoes(tenant_id, agente_id, versao);

CREATE TABLE IF NOT EXISTS gx_agente_execucoes (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  agente_id       TEXT NOT NULL,
  versao          INTEGER DEFAULT 1,
  gatilho         TEXT DEFAULT '',
  contato_id      TEXT DEFAULT '',
  conversa_id     TEXT DEFAULT '',
  status          TEXT DEFAULT 'rodando',   -- rodando|concluida|parada|falha|bloqueada
  motor           TEXT DEFAULT 'regras',    -- qual motor REALMENTE rodou
  modelo          TEXT DEFAULT '',
  entrada         TEXT DEFAULT '{}',
  saida           TEXT DEFAULT '',
  fontes_usadas   TEXT DEFAULT '[]',        -- citação: de onde saiu o que ele afirmou
  fundamentada    INTEGER DEFAULT 0,        -- 0 = respondeu sem fonte
  tokens_entrada  INTEGER DEFAULT 0,
  tokens_saida    INTEGER DEFAULT 0,
  custo_centavos  INTEGER DEFAULT 0,
  ms              INTEGER DEFAULT 0,
  parada          TEXT DEFAULT '',          -- por que parou
  erro            TEXT DEFAULT '',
  correlation_id  TEXT DEFAULT '',
  chave_idem      TEXT DEFAULT '',
  criado_em       TEXT NOT NULL,
  criado_por      TEXT DEFAULT '',
  atualizado_em   TEXT DEFAULT '',
  atualizado_por  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_agexec ON gx_agente_execucoes(tenant_id, agente_id, criado_em);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_agexec_idem ON gx_agente_execucoes(chave_idem) WHERE chave_idem != '';

-- Toda ação PROPOSTA, inclusive a que foi barrada. Sem isso não dá para
-- auditar o que o agente quis fazer — só o que conseguiu.
CREATE TABLE IF NOT EXISTS gx_agente_acoes (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  execucao_id   TEXT NOT NULL,
  agente_id     TEXT NOT NULL,
  acao          TEXT NOT NULL,
  nivel         INTEGER DEFAULT 1,
  status        TEXT DEFAULT 'sugerida',  -- sugerida|aguardando_aprovacao|executada|bloqueada|rejeitada|falhou
  motivo        TEXT DEFAULT '',
  dados         TEXT DEFAULT '{}',
  resultado     TEXT DEFAULT '',
  aprovacao_id  TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_agacoes ON gx_agente_acoes(tenant_id, execucao_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_gx_agacoes_ag ON gx_agente_acoes(tenant_id, agente_id, status, criado_em);

-- Memória com escopo rígido. A chave única impede duas memórias do mesmo
-- escopo se sobreporem sem querer.
CREATE TABLE IF NOT EXISTS gx_agente_memoria (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  escopo         TEXT NOT NULL,            -- tenant|marca|produto|contato|conversa|execucao
  escopo_id      TEXT DEFAULT '',
  agente_id      TEXT DEFAULT '',          -- '' = memória compartilhada entre agentes da conta
  chave          TEXT NOT NULL,
  valor          TEXT DEFAULT '',
  origem         TEXT DEFAULT '',
  expira_em      TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_agmem ON gx_agente_memoria(tenant_id, escopo, escopo_id, agente_id, chave);

-- ===================== BASE DE CONHECIMENTO =====================

CREATE TABLE IF NOT EXISTS gx_conhecimento (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  titulo         TEXT NOT NULL,
  tipo           TEXT DEFAULT 'documento',  -- documento|faq|politica|produto|preco|script|condicao
  corpo          TEXT DEFAULT '',
  resumo         TEXT DEFAULT '',
  tags           TEXT DEFAULT '[]',
  fonte          TEXT DEFAULT '',
  url            TEXT DEFAULT '',
  proprietario   TEXT DEFAULT '',
  versao         INTEGER DEFAULT 1,
  status         TEXT DEFAULT 'rascunho',   -- rascunho|aprovado|vencido
  valido_ate     TEXT DEFAULT '',
  aprovado_por   TEXT DEFAULT '',
  aprovado_em    TEXT DEFAULT '',
  usos           INTEGER DEFAULT 0,
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  excluido_em    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_conhec ON gx_conhecimento(tenant_id, status, tipo);

-- Índice de busca (FTS5). NÃO tem tenant_id: o filtro por conta é feito
-- no JOIN com gx_conhecimento — nunca consultar esta tabela sozinha.
--
-- Tabela FTS COMUM (não `content=''`): a contentless não aceita DELETE por
-- rowid, e aqui o documento é editado e reindexado o tempo todo. O custo é
-- guardar uma segunda cópia do texto; a alternativa seria manter índice
-- sujo depois de cada edição.
CREATE VIRTUAL TABLE IF NOT EXISTS gx_conhecimento_fts USING fts5(titulo, corpo, tags);

CREATE TABLE IF NOT EXISTS gx_avaliacoes (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  agente_id    TEXT NOT NULL,
  execucao_id  TEXT DEFAULT '',
  criterio     TEXT NOT NULL,             -- util|correto|fundamentado|tom|seguranca
  nota         INTEGER DEFAULT 0,         -- -1 ruim, 0 neutro, 1 bom
  avaliador    TEXT DEFAULT 'humano',     -- humano|automatico
  comentario   TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  criado_por   TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_aval ON gx_avaliacoes(tenant_id, agente_id, criado_em);
