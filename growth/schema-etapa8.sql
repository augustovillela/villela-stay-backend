-- =====================================================================
-- Villela Growth OS — ETAPA 8: reputação e reuniões.
--
-- Quase tudo aqui é domínio NOSSO e funciona hoje: pesquisa de satisfação,
-- NPS, CSAT, tipos de reunião, disponibilidade e agendamento com página
-- pública. Só dependem de terceiros a importação de avaliação pública
-- (Google Business e afins) e a sincronia de calendário.
--
-- Uma trava do §16 vive no schema: o convite para avaliação pública NÃO
-- carrega recompensa. Não existe campo de benefício por nota — porque
-- condicionar benefício a avaliação positiva é o que a regra proíbe.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gx_pesquisas (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  nome              TEXT NOT NULL,
  tipo              TEXT DEFAULT 'nps',        -- nps|csat|ces|livre
  pergunta          TEXT DEFAULT '',
  pergunta_aberta   TEXT DEFAULT '',
  token             TEXT NOT NULL,             -- página pública /growth/s/:token
  gatilho           TEXT DEFAULT 'manual',     -- manual|pos_atendimento|pos_venda|periodica
  status            TEXT DEFAULT 'rascunho',   -- rascunho|ativa|encerrada
  -- convite a avaliação pública para quem ficou satisfeito
  convida_publica   INTEGER DEFAULT 0,
  nota_minima_convite INTEGER DEFAULT 9,
  url_avaliacao     TEXT DEFAULT '',
  respostas         INTEGER DEFAULT 0,
  criado_em         TEXT NOT NULL,
  criado_por        TEXT DEFAULT '',
  atualizado_em     TEXT DEFAULT '',
  atualizado_por    TEXT DEFAULT '',
  excluido_em       TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_pesq_token ON gx_pesquisas(token);

CREATE TABLE IF NOT EXISTS gx_pesquisa_respostas (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  pesquisa_id    TEXT NOT NULL,
  contato_id     TEXT DEFAULT '',
  nota           INTEGER DEFAULT 0,
  faixa          TEXT DEFAULT '',            -- promotor|neutro|detrator (NPS) · satisfeito|neutro|insatisfeito (CSAT)
  comentario     TEXT DEFAULT '',
  unidade        TEXT DEFAULT '',            -- para comparar casas/filiais
  convidado_publica INTEGER DEFAULT 0,
  chave_idem     TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_pesqresp ON gx_pesquisa_respostas(tenant_id, pesquisa_id, criado_em);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_pesqresp_idem ON gx_pesquisa_respostas(chave_idem) WHERE chave_idem != '';

-- Avaliação pública vinda de fora (Google, Airbnb, Booking...). A coleta
-- depende de conector; o registro manual funciona desde já.
CREATE TABLE IF NOT EXISTS gx_avaliacoes_publicas (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  fonte          TEXT NOT NULL,              -- google|airbnb|booking|instagram|manual
  externa_id     TEXT DEFAULT '',
  autor          TEXT DEFAULT '',
  contato_id     TEXT DEFAULT '',
  nota           INTEGER DEFAULT 0,
  nota_maxima    INTEGER DEFAULT 5,
  texto          TEXT DEFAULT '',
  unidade        TEXT DEFAULT '',
  sentimento     TEXT DEFAULT '',
  problemas      TEXT DEFAULT '[]',          -- temas extraídos, para achar o recorrente
  -- resposta pública
  resposta       TEXT DEFAULT '',
  resposta_status TEXT DEFAULT '',           -- sugerida|aguardando_aprovacao|aprovada|publicada|recusada
  aprovacao_id   TEXT DEFAULT '',
  respondida_em  TEXT DEFAULT '',
  respondida_por TEXT DEFAULT '',
  tarefa_id      TEXT DEFAULT '',
  publicada_em   TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_avalpub_ext ON gx_avaliacoes_publicas(tenant_id, fonte, externa_id) WHERE externa_id != '';
CREATE INDEX IF NOT EXISTS idx_gx_avalpub ON gx_avaliacoes_publicas(tenant_id, fonte, criado_em);

-- ========================== REUNIÕES ==========================

CREATE TABLE IF NOT EXISTS gx_tipos_reuniao (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  nome              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  descricao         TEXT DEFAULT '',
  duracao_min       INTEGER DEFAULT 30,
  intervalo_min     INTEGER DEFAULT 0,        -- folga entre reuniões
  antecedencia_min  INTEGER DEFAULT 60,       -- não deixa marcar em cima da hora
  janela_dias       INTEGER DEFAULT 30,       -- até quando dá para marcar
  fuso              TEXT DEFAULT 'America/Sao_Paulo',
  responsaveis      TEXT DEFAULT '[]',        -- JSON de gx_users.id
  distribuicao      TEXT DEFAULT 'primeiro',  -- primeiro|round_robin|menos_ocupado
  equipe_id         TEXT DEFAULT '',
  formulario_id     TEXT DEFAULT '',
  local             TEXT DEFAULT '',          -- endereço ou "videoconferência"
  link_video        TEXT DEFAULT '',
  lembrete_horas    INTEGER DEFAULT 24,
  ativo             INTEGER DEFAULT 1,
  criado_em         TEXT NOT NULL,
  criado_por        TEXT DEFAULT '',
  atualizado_em     TEXT DEFAULT '',
  atualizado_por    TEXT DEFAULT '',
  excluido_em       TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_tiporeu ON gx_tipos_reuniao(tenant_id, slug);

-- Faixa de disponibilidade recorrente por dia da semana.
CREATE TABLE IF NOT EXISTS gx_disponibilidade (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  tipo_id       TEXT DEFAULT '',              -- '' = vale para todos os tipos
  user_id       TEXT DEFAULT '',              -- '' = vale para todos os responsáveis
  dia_semana    INTEGER NOT NULL,             -- 0 = domingo
  inicio        TEXT NOT NULL,                -- HH:MM
  fim           TEXT NOT NULL,
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_disp ON gx_disponibilidade(tenant_id, tipo_id, dia_semana);

-- Bloqueio pontual (férias, feriado, compromisso importado do calendário).
CREATE TABLE IF NOT EXISTS gx_bloqueios_agenda (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  user_id     TEXT DEFAULT '',
  inicio      TEXT NOT NULL,                  -- ISO
  fim         TEXT NOT NULL,
  motivo      TEXT DEFAULT '',
  origem      TEXT DEFAULT 'manual',          -- manual|calendario
  criado_em   TEXT NOT NULL,
  criado_por  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gx_bloq ON gx_bloqueios_agenda(tenant_id, user_id, inicio);

CREATE TABLE IF NOT EXISTS gx_agendamentos (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  tipo_id         TEXT NOT NULL,
  contato_id      TEXT DEFAULT '',
  oportunidade_id TEXT DEFAULT '',
  responsavel     TEXT DEFAULT '',
  inicio          TEXT NOT NULL,              -- ISO UTC
  fim             TEXT NOT NULL,
  fuso            TEXT DEFAULT 'America/Sao_Paulo',
  status          TEXT DEFAULT 'confirmado',  -- confirmado|reagendado|cancelado|realizado|no_show
  nome_convidado  TEXT DEFAULT '',
  email_convidado TEXT DEFAULT '',
  telefone_convidado TEXT DEFAULT '',
  observacao      TEXT DEFAULT '',
  respostas       TEXT DEFAULT '{}',          -- do formulário de marcação
  token           TEXT NOT NULL,              -- link de reagendar/cancelar
  lembrete_em     TEXT DEFAULT '',
  lembrete_enviado INTEGER DEFAULT 0,
  cancelado_por   TEXT DEFAULT '',
  motivo_cancelamento TEXT DEFAULT '',
  externo_id      TEXT DEFAULT '',            -- evento no calendário, quando houver
  criado_em       TEXT NOT NULL,
  criado_por      TEXT DEFAULT '',
  atualizado_em   TEXT DEFAULT '',
  atualizado_por  TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_agend_token ON gx_agendamentos(token);
CREATE INDEX IF NOT EXISTS idx_gx_agend ON gx_agendamentos(tenant_id, inicio, status);
CREATE INDEX IF NOT EXISTS idx_gx_agend_resp ON gx_agendamentos(tenant_id, responsavel, inicio);
