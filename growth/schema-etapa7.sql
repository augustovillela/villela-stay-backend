-- =====================================================================
-- Villela Growth OS — ETAPA 7: anúncios e atribuição.
--
-- Duas partes com naturezas diferentes:
--
--   ANÚNCIOS dependem de conta aprovada nas plataformas. As tabelas
--   existem, a importação existe, mas os conectores lançam 501 até a
--   aprovação sair. Nada é inventado.
--
--   ATRIBUIÇÃO funciona HOJE, sobre dados que já temos: tracking com
--   first/last touch, procedência do contato e oportunidade ganha. É a
--   parte desta etapa que entrega valor sem depender de terceiros.
--
-- Toda alteração de ORÇAMENTO deixa rastro com justificativa. Dinheiro
-- que sai sem registro de quem mandou é o pior tipo de automação.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gx_contas_anuncio (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  plataforma        TEXT NOT NULL,             -- meta_ads|google_ads|linkedin_ads|tiktok_ads
  conexao_id        TEXT DEFAULT '',
  conta_externa_id  TEXT DEFAULT '',
  nome              TEXT NOT NULL,
  moeda             TEXT DEFAULT 'BRL',
  status            TEXT DEFAULT 'pendente',   -- pendente|ativa|pausada|sem_acesso
  -- travas de gasto (§15): teto que a plataforma NÃO conhece, mas nós sim
  teto_diario_cent  INTEGER DEFAULT 0,         -- 0 = sem teto definido
  teto_mensal_cent  INTEGER DEFAULT 0,
  gasto_mes_cent    INTEGER DEFAULT 0,
  ultima_sync       TEXT DEFAULT '',
  criado_em         TEXT NOT NULL,
  criado_por        TEXT DEFAULT '',
  atualizado_em     TEXT DEFAULT '',
  atualizado_por    TEXT DEFAULT '',
  excluido_em       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_contasads ON gx_contas_anuncio(tenant_id, plataforma, status);

CREATE TABLE IF NOT EXISTS gx_campanhas_anuncio (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  conta_id          TEXT NOT NULL,
  externa_id        TEXT DEFAULT '',
  nome              TEXT NOT NULL,
  objetivo          TEXT DEFAULT '',
  status            TEXT DEFAULT 'ativa',      -- ativa|pausada|encerrada|rascunho
  orcamento_cent    INTEGER DEFAULT 0,
  orcamento_tipo    TEXT DEFAULT 'diario',     -- diario|total
  teto_cent         INTEGER DEFAULT 0,         -- teto NOSSO para esta campanha
  utm_campaign      TEXT DEFAULT '',           -- amarra a campanha ao tracking
  inicio            TEXT DEFAULT '',
  fim               TEXT DEFAULT '',
  importada_em      TEXT DEFAULT '',
  criado_em         TEXT NOT NULL,
  criado_por        TEXT DEFAULT '',
  atualizado_em     TEXT DEFAULT '',
  atualizado_por    TEXT DEFAULT '',
  excluido_em       TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_campads_ext ON gx_campanhas_anuncio(tenant_id, conta_id, externa_id) WHERE externa_id != '';
CREATE INDEX IF NOT EXISTS idx_gx_campads ON gx_campanhas_anuncio(tenant_id, status);

CREATE TABLE IF NOT EXISTS gx_anuncios (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  campanha_id    TEXT NOT NULL,
  externa_id     TEXT DEFAULT '',
  nome           TEXT NOT NULL,
  grupo          TEXT DEFAULT '',
  criativo       TEXT DEFAULT '{}',
  status         TEXT DEFAULT 'ativo',
  conteudo_id    TEXT DEFAULT '',              -- liga ao conteúdo da Etapa 6
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_anuncios_ext ON gx_anuncios(tenant_id, campanha_id, externa_id) WHERE externa_id != '';

-- Snapshot diário. Guardar o histórico é o que permite comparar períodos
-- e detectar anomalia — a plataforma só devolve o presente.
CREATE TABLE IF NOT EXISTS gx_metricas_anuncio (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  conta_id       TEXT NOT NULL,
  campanha_id    TEXT DEFAULT '',
  anuncio_id     TEXT DEFAULT '',
  dia            TEXT NOT NULL,                -- YYYY-MM-DD
  impressoes     INTEGER DEFAULT 0,
  cliques        INTEGER DEFAULT 0,
  gasto_cent     INTEGER DEFAULT 0,
  conversoes     INTEGER DEFAULT 0,
  leads          INTEGER DEFAULT 0,
  importado_em   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_metads ON gx_metricas_anuncio(tenant_id, conta_id, campanha_id, anuncio_id, dia);
CREATE INDEX IF NOT EXISTS idx_gx_metads_dia ON gx_metricas_anuncio(tenant_id, dia);

-- Toda alteração de orçamento: quem, quanto, por quê e com qual aprovação.
CREATE TABLE IF NOT EXISTS gx_orcamento_alteracoes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  conta_id       TEXT DEFAULT '',
  campanha_id    TEXT DEFAULT '',
  de_cent        INTEGER DEFAULT 0,
  para_cent      INTEGER DEFAULT 0,
  variacao_pct   INTEGER DEFAULT 0,
  justificativa  TEXT DEFAULT '',
  origem_tipo    TEXT DEFAULT 'usuario',       -- usuario|agente|automacao
  origem_id      TEXT DEFAULT '',
  aprovacao_id   TEXT DEFAULT '',
  status         TEXT DEFAULT 'aguardando',    -- aguardando|aplicada|rejeitada|bloqueada
  motivo         TEXT DEFAULT '',
  aplicada_em    TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_orcalt ON gx_orcamento_alteracoes(tenant_id, status, criado_em);

-- Conversão atribuída: liga oportunidade ganha a uma origem/campanha.
CREATE TABLE IF NOT EXISTS gx_atribuicoes_conversao (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  contato_id     TEXT DEFAULT '',
  oportunidade_id TEXT DEFAULT '',
  valor_cent     INTEGER DEFAULT 0,
  modelo         TEXT DEFAULT 'last_touch',    -- first_touch|last_touch|linear|posicional
  origem         TEXT DEFAULT '',
  campanha       TEXT DEFAULT '',
  anuncio        TEXT DEFAULT '',
  canal          TEXT DEFAULT '',
  toques         INTEGER DEFAULT 0,
  calculado_em   TEXT NOT NULL,
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_atrib_op ON gx_atribuicoes_conversao(tenant_id, oportunidade_id, modelo);
CREATE INDEX IF NOT EXISTS idx_gx_atrib_camp ON gx_atribuicoes_conversao(tenant_id, campanha, calculado_em);
