-- =====================================================================
-- Villela Growth OS — ETAPA 6: conteúdo e redes sociais.
--
-- O fluxo editorial é NOSSO e funciona sem nenhuma rede conectada:
-- ideia → briefing → rascunho → aprovação → agendado → publicado.
-- A PUBLICAÇÃO é que depende da capacidade real da conta conectada.
--
-- Por isso `gx_publicacoes` é separada de `gx_conteudos`: um conteúdo
-- rende N publicações (uma por rede), cada uma com resultado próprio.
-- Falhar no Instagram não invalida o que já saiu no LinkedIn.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gx_conteudos (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  titulo           TEXT NOT NULL,
  status           TEXT DEFAULT 'ideia',      -- ideia|briefing|producao|revisao|aprovado|agendado|publicado|erro|arquivado
  formato          TEXT DEFAULT 'post',       -- post|imagem|carrossel|video|video_curto|story|artigo
  -- briefing (§13.3)
  objetivo         TEXT DEFAULT '',
  persona          TEXT DEFAULT '',
  etapa_funil      TEXT DEFAULT '',           -- topo|meio|fundo
  tom              TEXT DEFAULT '',
  briefing         TEXT DEFAULT '',
  -- conteúdo base (cada rede recebe uma variação)
  legenda          TEXT DEFAULT '',
  roteiro          TEXT DEFAULT '',
  hashtags         TEXT DEFAULT '[]',
  cta              TEXT DEFAULT '',
  link             TEXT DEFAULT '',
  utm              TEXT DEFAULT '{}',
  midias           TEXT DEFAULT '[]',         -- ids em gx_midias
  campanha         TEXT DEFAULT '',
  responsavel      TEXT DEFAULT '',
  agendado_para    TEXT DEFAULT '',
  versao           INTEGER DEFAULT 1,
  aprovado_por     TEXT DEFAULT '',
  aprovado_em      TEXT DEFAULT '',
  gerado_por_agente TEXT DEFAULT '',
  criado_em        TEXT NOT NULL,
  criado_por       TEXT DEFAULT '',
  atualizado_em    TEXT DEFAULT '',
  atualizado_por   TEXT DEFAULT '',
  excluido_em      TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_conteudos ON gx_conteudos(tenant_id, status, agendado_para);

CREATE TABLE IF NOT EXISTS gx_conteudo_versoes (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  conteudo_id  TEXT NOT NULL,
  versao       INTEGER NOT NULL,
  conteudo     TEXT DEFAULT '{}',
  autor        TEXT DEFAULT '',
  notas        TEXT DEFAULT '',
  criado_em    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_contver ON gx_conteudo_versoes(tenant_id, conteudo_id, versao);

-- A mesma ideia, adaptada por rede. O que não couber numa rede fica só
-- naquela variação — não vira "post genérico" em todo lugar.
CREATE TABLE IF NOT EXISTS gx_conteudo_variacoes (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  conteudo_id   TEXT NOT NULL,
  rede          TEXT NOT NULL,               -- instagram|facebook|tiktok|linkedin|youtube
  formato       TEXT DEFAULT 'post',
  legenda       TEXT DEFAULT '',
  hashtags      TEXT DEFAULT '[]',
  primeiro_comentario TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT '',
  atualizado_em TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_contvar ON gx_conteudo_variacoes(tenant_id, conteudo_id, rede);

-- Biblioteca de mídia com controle de direitos: sem isso, a plataforma
-- vira depósito de foto de terceiro sem licença.
CREATE TABLE IF NOT EXISTS gx_midias (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  nome           TEXT NOT NULL,
  tipo           TEXT DEFAULT 'imagem',      -- imagem|video|audio|documento
  url            TEXT DEFAULT '',
  mime           TEXT DEFAULT '',
  tamanho        INTEGER DEFAULT 0,
  largura        INTEGER DEFAULT 0,
  altura         INTEGER DEFAULT 0,
  duracao_s      INTEGER DEFAULT 0,
  -- direitos autorais (§13.3)
  origem         TEXT DEFAULT '',            -- proprio|banco|cliente|terceiro
  licenca        TEXT DEFAULT '',
  autor          TEXT DEFAULT '',
  uso_permitido  TEXT DEFAULT '',
  expira_em      TEXT DEFAULT '',
  tags           TEXT DEFAULT '[]',
  usos           INTEGER DEFAULT 0,
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  excluido_em    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_midias ON gx_midias(tenant_id, tipo, criado_em);

-- Uma tentativa de publicação por rede. Guarda o motivo quando NÃO deu.
CREATE TABLE IF NOT EXISTS gx_publicacoes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  conteudo_id    TEXT NOT NULL,
  rede           TEXT NOT NULL,
  conexao_id     TEXT DEFAULT '',
  formato        TEXT DEFAULT 'post',
  status         TEXT DEFAULT 'pendente',    -- pendente|agendada|publicada|falhou|bloqueada|cancelada
  motivo         TEXT DEFAULT '',            -- por que não deu (capacidade, conexão, validação)
  agendada_para  TEXT DEFAULT '',
  publicada_em   TEXT DEFAULT '',
  externa_id     TEXT DEFAULT '',
  url_publica    TEXT DEFAULT '',
  tentativas     INTEGER DEFAULT 0,
  erro           TEXT DEFAULT '',
  -- métricas importadas depois
  alcance        INTEGER DEFAULT 0,
  interacoes     INTEGER DEFAULT 0,
  cliques        INTEGER DEFAULT 0,
  metricas_em    TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_pub_unica ON gx_publicacoes(tenant_id, conteudo_id, rede);
CREATE INDEX IF NOT EXISTS idx_gx_pub_status ON gx_publicacoes(tenant_id, status, agendada_para);

-- Gestão de comunidade (§14): comentário, menção, avaliação — tudo que
-- chega pelo lado público e precisa de triagem.
CREATE TABLE IF NOT EXISTS gx_interacoes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  rede           TEXT NOT NULL,
  tipo           TEXT DEFAULT 'comentario',  -- comentario|mencao|avaliacao|mensagem
  publicacao_id  TEXT DEFAULT '',
  externa_id     TEXT DEFAULT '',
  autor_externo  TEXT DEFAULT '',
  autor_handle   TEXT DEFAULT '',
  contato_id     TEXT DEFAULT '',
  texto          TEXT DEFAULT '',
  classificacao  TEXT DEFAULT '',            -- elogio|duvida|preco|reclamacao|crise|spam|oportunidade|suporte|compra
  sentimento     TEXT DEFAULT '',            -- positivo|neutro|negativo
  prioridade     TEXT DEFAULT 'media',
  fila           TEXT DEFAULT '',            -- crise|juridico|influenciador|alto_valor|padrao
  status         TEXT DEFAULT 'aberta',      -- aberta|respondida|ignorada|escalada
  exige_aprovacao INTEGER DEFAULT 0,
  resposta       TEXT DEFAULT '',
  respondida_por TEXT DEFAULT '',
  respondida_em  TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_interacoes ON gx_interacoes(tenant_id, status, fila, criado_em);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_inter_ext ON gx_interacoes(tenant_id, rede, externa_id) WHERE externa_id != '';
