-- =====================================================================
-- Villela Growth OS — ETAPA 2: CRM e captura.
--
-- O núcleo do CRM (contatos, empresas, funis, oportunidades) já existe em
-- crm_* e continua sendo a fonte. Aqui entra o que faltava: reconhecer a
-- MESMA PESSOA vinda de canais diferentes, capturar com procedência
-- completa, segmentar por regra auditável e atender o titular (LGPD).
--
-- Mesmas convenções da Etapa 1: prefixo gx_, tenant_id em toda tabela de
-- negócio (entra sozinha no teste anti-vazamento), IDs TEXT url-safe,
-- datas ISO-8601, JSON em TEXT.
-- =====================================================================

-- ===================== RESOLUÇÃO DE IDENTIDADE =====================

-- Cada jeito conhecido de identificar uma pessoa. O contato é a ficha; a
-- identidade é a chave por onde ela chegou. Uma pessoa tem N identidades.
CREATE TABLE IF NOT EXISTS gx_identidades (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  contato_id     TEXT NOT NULL,                  -- crm_contatos.id
  tipo           TEXT NOT NULL,                  -- email|telefone|whatsapp|instagram|facebook|tiktok|linkedin|visitante|externo
  valor          TEXT NOT NULL,                  -- como veio
  valor_norm     TEXT NOT NULL,                  -- normalizado: é por aqui que se casa
  confianca      INTEGER DEFAULT 50,             -- 0-100 na ligação identidade → contato
  verificado     INTEGER DEFAULT 0,              -- houve confirmação (clique em link, código, login)
  origem         TEXT DEFAULT '',
  primeiro_em    TEXT DEFAULT '',
  ultimo_em      TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  excluido_em    TEXT DEFAULT ''
);
-- a mesma chave não pode apontar para duas pessoas dentro do mesmo tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_ident_chave ON gx_identidades(tenant_id, tipo, valor_norm);
CREATE INDEX IF NOT EXISTS idx_gx_ident_contato ON gx_identidades(tenant_id, contato_id);

-- Match provável, mas não certo: NÃO se mescla sozinho. Vai para revisão.
CREATE TABLE IF NOT EXISTS gx_merge_sugestoes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  contato_a      TEXT NOT NULL,                  -- o mais antigo: sobrevive na mesclagem
  contato_b      TEXT NOT NULL,
  confianca      INTEGER DEFAULT 0,
  motivos        TEXT DEFAULT '[]',              -- JSON: por que o sistema achou que é a mesma pessoa
  status         TEXT DEFAULT 'pendente',        -- pendente|aplicada|rejeitada
  decidido_por   TEXT DEFAULT '',
  decidido_em    TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_merge_par ON gx_merge_sugestoes(tenant_id, contato_a, contato_b);
CREATE INDEX IF NOT EXISTS idx_gx_merge_status ON gx_merge_sugestoes(tenant_id, status, criado_em);

-- ============================ SEGMENTOS ============================

CREATE TABLE IF NOT EXISTS gx_segmentos (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  nome              TEXT NOT NULL,
  descricao         TEXT DEFAULT '',
  regras            TEXT DEFAULT '{}',           -- JSON auditável: {juncao:'todas'|'qualquer', condicoes:[...]}
  dinamico          INTEGER DEFAULT 1,
  ultima_contagem   INTEGER DEFAULT 0,
  ultima_avaliacao  TEXT DEFAULT '',
  criado_em         TEXT NOT NULL,
  criado_por        TEXT DEFAULT '',
  atualizado_em     TEXT DEFAULT '',
  atualizado_por    TEXT DEFAULT '',
  excluido_em       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_segmentos_tenant ON gx_segmentos(tenant_id, criado_em);

-- ===================== FORMULÁRIOS E CAPTURA =====================

CREATE TABLE IF NOT EXISTS gx_formularios (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  nome           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  tipo           TEXT DEFAULT 'formulario',      -- formulario|pesquisa|quiz
  campos         TEXT DEFAULT '[]',              -- JSON [{chave,rotulo,tipo,obrigatorio,opcoes,mapeia}]
  config         TEXT DEFAULT '{}',              -- JSON {mensagem_ok, redirect, consentimento_texto, base_legal, tags, responsavel}
  token          TEXT NOT NULL,                  -- endpoint público /growth/f/:token
  status         TEXT DEFAULT 'rascunho',        -- rascunho|publicado|encerrado
  respostas      INTEGER DEFAULT 0,
  publicado_em   TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  excluido_em    TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_form_token ON gx_formularios(token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_form_slug ON gx_formularios(tenant_id, slug);

CREATE TABLE IF NOT EXISTS gx_form_respostas (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  formulario_id  TEXT NOT NULL,
  contato_id     TEXT DEFAULT '',
  dados          TEXT DEFAULT '{}',
  procedencia    TEXT DEFAULT '{}',              -- JSON {url, referrer, utm, dispositivo, pagina}
  ip_hash        TEXT DEFAULT '',                -- hash, NUNCA o IP em claro
  user_agent     TEXT DEFAULT '',
  spam           INTEGER DEFAULT 0,
  motivo_spam    TEXT DEFAULT '',
  chave_idem     TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_formresp_form ON gx_form_respostas(tenant_id, formulario_id, criado_em);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_formresp_idem ON gx_form_respostas(chave_idem) WHERE chave_idem != '';

-- Rastreamento de origem. NÃO guarda IP em claro nem dado pessoal: só o
-- visitante anônimo e a procedência, até a identidade ser resolvida.
CREATE TABLE IF NOT EXISTS gx_tracking (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  visitante_id  TEXT NOT NULL,                   -- id anônimo de primeira parte
  contato_id    TEXT DEFAULT '',                 -- preenchido quando a identidade é resolvida
  tipo          TEXT DEFAULT 'pageview',         -- pageview|evento|conversao
  nome          TEXT DEFAULT '',
  url           TEXT DEFAULT '',
  referrer      TEXT DEFAULT '',
  utm           TEXT DEFAULT '{}',
  dispositivo   TEXT DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gx_track_visitante ON gx_tracking(tenant_id, visitante_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_gx_track_contato ON gx_tracking(tenant_id, contato_id, criado_em);

-- =========================== PÁGINAS ===========================
-- Templates e blocos controlados (§8 do prompt: não é um WordPress).

CREATE TABLE IF NOT EXISTS gx_paginas (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  slug           TEXT NOT NULL,
  titulo         TEXT NOT NULL,
  template       TEXT DEFAULT 'captura',
  blocos         TEXT DEFAULT '[]',
  seo            TEXT DEFAULT '{}',              -- JSON {descricao, og_imagem, indexavel}
  formulario_id  TEXT DEFAULT '',
  status         TEXT DEFAULT 'rascunho',        -- rascunho|publicada|arquivada
  versao         INTEGER DEFAULT 1,
  visitas        INTEGER DEFAULT 0,
  publicado_em   TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  excluido_em    TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_paginas_slug ON gx_paginas(tenant_id, slug);

CREATE TABLE IF NOT EXISTS gx_pagina_versoes (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  pagina_id   TEXT NOT NULL,
  versao      INTEGER NOT NULL,
  conteudo    TEXT DEFAULT '{}',
  criado_em   TEXT NOT NULL,
  criado_por  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_pagver ON gx_pagina_versoes(tenant_id, pagina_id, versao);

-- ============================== LGPD ==============================

CREATE TABLE IF NOT EXISTS gx_lgpd_config (
  tenant_id       TEXT PRIMARY KEY,
  papel           TEXT DEFAULT 'controlador',    -- controlador|operador
  retencao_dias   INTEGER DEFAULT 0,             -- 0 = sem purga automática
  politica_url    TEXT DEFAULT '',
  encarregado     TEXT DEFAULT '',
  atualizado_em   TEXT DEFAULT '',
  atualizado_por  TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS gx_lgpd_solicitacoes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  contato_id     TEXT DEFAULT '',
  titular_email  TEXT DEFAULT '',
  tipo           TEXT NOT NULL,                  -- acesso|correcao|portabilidade|eliminacao|anonimizacao|oposicao|informacao
  canal          TEXT DEFAULT '',
  detalhe        TEXT DEFAULT '',
  status         TEXT DEFAULT 'aberta',          -- aberta|em_analise|atendida|recusada
  prazo          TEXT DEFAULT '',
  resultado      TEXT DEFAULT '',
  responsavel    TEXT DEFAULT '',
  atendida_em    TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_lgpd_sol ON gx_lgpd_solicitacoes(tenant_id, status, prazo);

-- Lista de supressão: quem pediu para não receber. Vence qualquer automação.
CREATE TABLE IF NOT EXISTS gx_supressao (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  canal          TEXT NOT NULL,                  -- email|whatsapp|sms|telefone|todos
  valor_norm     TEXT NOT NULL,
  motivo         TEXT DEFAULT '',                -- opt_out|bounce|reclamacao|manual|lgpd
  origem         TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_supressao ON gx_supressao(tenant_id, canal, valor_norm);
