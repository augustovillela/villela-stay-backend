-- =====================================================================
-- Villela Growth OS — ETAPA 4: motor de automações.
--
-- Um workflow é DADO, não código: gatilho + nós, tudo em JSON versionado.
-- Publicar cria uma versão imutável; a execução guarda em qual versão
-- rodou, então mudar o fluxo não reescreve o passado — e dá para voltar.
--
-- Cada passo grava entrada, saída e erro. Sem isso, automação vira caixa
-- preta: ninguém consegue explicar por que aquele cliente recebeu aquilo.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gx_workflows (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  nome              TEXT NOT NULL,
  descricao         TEXT DEFAULT '',
  gatilho_tipo      TEXT NOT NULL,                -- evento do catálogo, ou 'agendado'
  gatilho_config    TEXT DEFAULT '{}',            -- JSON: filtros do gatilho
  status            TEXT DEFAULT 'rascunho',      -- rascunho|publicado|pausado|arquivado
  versao_publicada  INTEGER DEFAULT 0,
  versao_rascunho   INTEGER DEFAULT 1,
  execucoes         INTEGER DEFAULT 0,
  concluidas        INTEGER DEFAULT 0,
  falhas            INTEGER DEFAULT 0,
  ultima_execucao   TEXT DEFAULT '',
  -- travas por workflow (o plano ainda limita por cima)
  max_por_contato   INTEGER DEFAULT 0,            -- 0 = sem limite; 1 = uma vez por pessoa
  max_por_dia       INTEGER DEFAULT 0,
  criado_em         TEXT NOT NULL,
  criado_por        TEXT DEFAULT '',
  atualizado_em     TEXT DEFAULT '',
  atualizado_por    TEXT DEFAULT '',
  excluido_em       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_wf_gatilho ON gx_workflows(tenant_id, gatilho_tipo, status);

-- Versão publicada é IMUTÁVEL: é para ela que a execução aponta.
CREATE TABLE IF NOT EXISTS gx_workflow_versoes (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  workflow_id   TEXT NOT NULL,
  versao        INTEGER NOT NULL,
  definicao     TEXT NOT NULL,                    -- JSON {nos:[{id,tipo,...,proximo}]}
  gatilho_tipo  TEXT DEFAULT '',
  gatilho_config TEXT DEFAULT '{}',
  notas         TEXT DEFAULT '',
  publicada_em  TEXT DEFAULT '',
  publicada_por TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_wfver ON gx_workflow_versoes(tenant_id, workflow_id, versao);

CREATE TABLE IF NOT EXISTS gx_workflow_execucoes (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  workflow_id     TEXT NOT NULL,
  versao          INTEGER NOT NULL,
  gatilho_evento  TEXT DEFAULT '',                -- id em gx_eventos
  contato_id      TEXT DEFAULT '',
  conversa_id     TEXT DEFAULT '',
  status          TEXT DEFAULT 'pendente',        -- pendente|rodando|aguardando|concluida|falha|cancelada|expirada
  no_atual        TEXT DEFAULT '',
  contexto        TEXT DEFAULT '{}',              -- JSON: dados do gatilho + o que os passos produziram
  passos_dados    INTEGER DEFAULT 0,              -- anti-loop dentro da própria execução
  simulacao       INTEGER DEFAULT 0,              -- 1 = nada de efeito colateral
  correlation_id  TEXT DEFAULT '',
  chave_idem      TEXT DEFAULT '',
  retomar_em      TEXT DEFAULT '',                -- quando está em espera
  erro            TEXT DEFAULT '',
  iniciada_em     TEXT NOT NULL,
  concluida_em    TEXT DEFAULT '',
  criado_em       TEXT NOT NULL,
  criado_por      TEXT DEFAULT '',
  atualizado_em   TEXT DEFAULT '',
  atualizado_por  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_wfexec_wf ON gx_workflow_execucoes(tenant_id, workflow_id, iniciada_em);
CREATE INDEX IF NOT EXISTS idx_gx_wfexec_espera ON gx_workflow_execucoes(status, retomar_em);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_wfexec_idem ON gx_workflow_execucoes(chave_idem) WHERE chave_idem != '';

-- Cada passo com entrada, saída e erro: é o que permite explicar depois
-- por que aquele contato recebeu aquilo.
CREATE TABLE IF NOT EXISTS gx_workflow_passos (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  execucao_id   TEXT NOT NULL,
  no_id         TEXT NOT NULL,
  tipo          TEXT NOT NULL,
  entrada       TEXT DEFAULT '{}',
  saida         TEXT DEFAULT '{}',
  status        TEXT DEFAULT 'ok',                -- ok|pulado|falha|bloqueado|simulado|aguardando
  motivo        TEXT DEFAULT '',
  erro          TEXT DEFAULT '',
  ms            INTEGER DEFAULT 0,
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gx_wfpasso ON gx_workflow_passos(tenant_id, execucao_id, criado_em);
