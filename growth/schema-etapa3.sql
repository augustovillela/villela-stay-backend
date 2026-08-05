-- =====================================================================
-- Villela Growth OS — ETAPA 3: inbox omnichannel e comunicações.
--
-- Uma conversa é a unidade: ela pertence a um contato, chega por um canal
-- e tem N mensagens. O canal é plugável — o domínio não sabe se a
-- mensagem veio do WhatsApp, do chat do site ou do e-mail.
--
-- Convenções da Etapa 1 valem: prefixo gx_, tenant_id em toda tabela de
-- negócio (entra sozinha no teste anti-vazamento), datas ISO-8601.
-- =====================================================================

-- ====================== CONEXÕES DE CANAL ======================

-- Uma conta conectada a uma integração. As credenciais NÃO ficam aqui:
-- vão para gx_segredos, cifradas. Aqui fica só a referência e o estado.
CREATE TABLE IF NOT EXISTS gx_conexoes (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  integracao        TEXT NOT NULL,                -- chave em gx_integracoes
  nome              TEXT DEFAULT '',              -- como o assinante chama ("WhatsApp da recepção")
  conta_externa_id  TEXT DEFAULT '',              -- id da conta/página/número do outro lado
  status            TEXT DEFAULT 'pendente',      -- pendente|ativa|degradada|expirada|desconectada
  capacidades       TEXT DEFAULT '{}',            -- JSON: o CapabilitySet RESOLVIDO desta conta
  escopos           TEXT DEFAULT '[]',
  segredo_ref       TEXT DEFAULT '',              -- ref_id em gx_segredos
  webhook_segredo   TEXT DEFAULT '',              -- ref_id do segredo de verificação de assinatura
  token_expira_em   TEXT DEFAULT '',
  ultimo_health     TEXT DEFAULT '',              -- ok|falha
  ultimo_health_em  TEXT DEFAULT '',
  ultimo_erro       TEXT DEFAULT '',
  criado_em         TEXT NOT NULL,
  criado_por        TEXT DEFAULT '',
  atualizado_em     TEXT DEFAULT '',
  atualizado_por    TEXT DEFAULT '',
  excluido_em       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_conexoes_tenant ON gx_conexoes(tenant_id, integracao, status);

-- Payload BRUTO do que chegou. Guardado para auditoria e diagnóstico —
-- o domínio nunca lê daqui, só do evento normalizado (§27 do prompt).
CREATE TABLE IF NOT EXISTS gx_webhook_eventos (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT '',
  integracao     TEXT NOT NULL,
  conexao_id     TEXT DEFAULT '',
  assinatura_ok  INTEGER DEFAULT 0,
  payload        TEXT DEFAULT '',
  chave_idem     TEXT DEFAULT '',
  processado_em  TEXT DEFAULT '',
  erro           TEXT DEFAULT '',
  recebido_em    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_webhook_idem ON gx_webhook_eventos(chave_idem) WHERE chave_idem != '';
CREATE INDEX IF NOT EXISTS idx_gx_webhook_recebido ON gx_webhook_eventos(integracao, recebido_em);

-- =========================== FILAS E SLA ===========================

CREATE TABLE IF NOT EXISTS gx_filas (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  nome              TEXT NOT NULL,
  descricao         TEXT DEFAULT '',
  canais            TEXT DEFAULT '[]',            -- JSON: canais que caem nesta fila
  equipe_id         TEXT DEFAULT '',
  distribuicao      TEXT DEFAULT 'manual',        -- manual|round_robin|menos_ocupado
  sla_primeira_min  INTEGER DEFAULT 0,            -- 0 = sem SLA
  sla_resolucao_min INTEGER DEFAULT 0,
  padrao            INTEGER DEFAULT 0,
  criado_em         TEXT NOT NULL,
  criado_por        TEXT DEFAULT '',
  atualizado_em     TEXT DEFAULT '',
  atualizado_por    TEXT DEFAULT '',
  excluido_em       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_filas_tenant ON gx_filas(tenant_id, criado_em);

-- ============================ CONVERSAS ============================

CREATE TABLE IF NOT EXISTS gx_conversas (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  contato_id          TEXT DEFAULT '',
  canal               TEXT NOT NULL,              -- chat_site|whatsapp|email|instagram|facebook|sms
  conexao_id          TEXT DEFAULT '',
  chave_externa       TEXT NOT NULL,              -- id da thread do lado de lá (ou do visitante)
  assunto             TEXT DEFAULT '',
  status              TEXT DEFAULT 'aberta',      -- aberta|pendente|resolvida|encerrada
  prioridade          TEXT DEFAULT 'media',       -- alta|media|baixa
  fila_id             TEXT DEFAULT '',
  responsavel         TEXT DEFAULT '',            -- gx_users.id
  oportunidade_id     TEXT DEFAULT '',
  tags                TEXT DEFAULT '[]',
  -- SLA e métricas de atendimento
  primeira_em         TEXT DEFAULT '',            -- 1ª mensagem do cliente
  primeira_resposta_em TEXT DEFAULT '',           -- 1ª resposta nossa
  sla_primeira_venc   TEXT DEFAULT '',
  sla_estourado       INTEGER DEFAULT 0,
  ultima_em           TEXT DEFAULT '',
  ultima_de           TEXT DEFAULT '',            -- cliente|equipe|agente
  nao_lidas           INTEGER DEFAULT 0,
  total_mensagens     INTEGER DEFAULT 0,
  -- leitura por IA (Etapa 5 preenche; aqui só existe o campo)
  intencao            TEXT DEFAULT '',
  sentimento          TEXT DEFAULT '',
  resumo              TEXT DEFAULT '',
  -- trava anti-colisão: quem está digitando agora
  editando_por        TEXT DEFAULT '',
  editando_ate        TEXT DEFAULT '',
  encerrada_em        TEXT DEFAULT '',
  criado_em           TEXT NOT NULL,
  criado_por          TEXT DEFAULT '',
  atualizado_em       TEXT DEFAULT '',
  atualizado_por      TEXT DEFAULT '',
  excluido_em         TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_conversas_externa ON gx_conversas(tenant_id, canal, chave_externa);
CREATE INDEX IF NOT EXISTS idx_gx_conversas_caixa ON gx_conversas(tenant_id, status, ultima_em);
CREATE INDEX IF NOT EXISTS idx_gx_conversas_resp ON gx_conversas(tenant_id, responsavel, status);
CREATE INDEX IF NOT EXISTS idx_gx_conversas_contato ON gx_conversas(tenant_id, contato_id);

CREATE TABLE IF NOT EXISTS gx_mensagens (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  conversa_id    TEXT NOT NULL,
  contato_id     TEXT DEFAULT '',
  direcao        TEXT NOT NULL,                   -- entrada|saida
  autor_tipo     TEXT DEFAULT 'contato',          -- contato|usuario|agente|sistema
  autor_id       TEXT DEFAULT '',
  tipo           TEXT DEFAULT 'texto',            -- texto|imagem|audio|video|documento|localizacao|template|nota
  texto          TEXT DEFAULT '',
  anexos         TEXT DEFAULT '[]',               -- JSON [{url, nome, mime, tamanho}]
  interna        INTEGER DEFAULT 0,               -- nota interna: o cliente NÃO vê
  status         TEXT DEFAULT 'recebida',         -- recebida|enfileirada|enviada|entregue|lida|falhou
  erro           TEXT DEFAULT '',
  externa_id     TEXT DEFAULT '',                 -- id da mensagem do lado de lá
  chave_idem     TEXT DEFAULT '',
  template       TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_msg_conversa ON gx_mensagens(tenant_id, conversa_id, criado_em);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_msg_idem ON gx_mensagens(chave_idem) WHERE chave_idem != '';
CREATE INDEX IF NOT EXISTS idx_gx_msg_status ON gx_mensagens(tenant_id, status, criado_em);

-- Histórico de quem cuidou da conversa: transferência deixa rastro.
CREATE TABLE IF NOT EXISTS gx_atribuicoes (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  conversa_id  TEXT NOT NULL,
  de_usuario   TEXT DEFAULT '',
  para_usuario TEXT DEFAULT '',
  para_fila    TEXT DEFAULT '',
  motivo       TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  criado_por   TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_atrib ON gx_atribuicoes(tenant_id, conversa_id, criado_em);

-- Respostas salvas: texto pronto com variáveis, para não digitar de novo.
CREATE TABLE IF NOT EXISTS gx_respostas_salvas (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  atalho         TEXT NOT NULL,                   -- /precos
  titulo         TEXT NOT NULL,
  texto          TEXT NOT NULL,
  canais         TEXT DEFAULT '[]',
  usos           INTEGER DEFAULT 0,
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  excluido_em    TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_resp_atalho ON gx_respostas_salvas(tenant_id, atalho);

-- Templates de canal (WhatsApp exige aprovação prévia da Meta).
CREATE TABLE IF NOT EXISTS gx_templates_canal (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  integracao     TEXT NOT NULL,
  nome           TEXT NOT NULL,
  idioma         TEXT DEFAULT 'pt_BR',
  categoria      TEXT DEFAULT '',                 -- utilidade|marketing|autenticacao
  corpo          TEXT DEFAULT '',
  variaveis      TEXT DEFAULT '[]',
  exemplo        TEXT DEFAULT '',
  status         TEXT DEFAULT 'rascunho',         -- rascunho|submetido|aprovado|rejeitado|pausado
  motivo_recusa  TEXT DEFAULT '',
  externo_id     TEXT DEFAULT '',
  usos           INTEGER DEFAULT 0,
  respostas      INTEGER DEFAULT 0,
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  excluido_em    TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_tplcanal ON gx_templates_canal(tenant_id, integracao, nome, idioma);
