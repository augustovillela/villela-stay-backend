-- =====================================================================
-- Voz — schema da FASE 0. SQLite próprio em DATA_DIR/voz/voz.db.
-- Plano e porquês em docs/voz/PLANO-MVP.md (repo-pai).
--
-- REGRAS QUE ESTE SCHEMA CARREGA, e que não são detalhe:
--   • `texto_original` é a TRANSCRIÇÃO EXATA, guardada sempre (trava 8).
--     Sem ela, um erro do reconhecedor de fala vira ação inexplicável:
--     ninguém consegue distinguir "o sistema fez besteira" de "ele
--     entendeu outra coisa".
--   • O nível fica GRAVADO no pedido, além de viver no catálogo. O
--     catálogo diz o nível de HOJE; o pedido tem que dizer sob qual
--     regra ele foi autorizado — senão promover uma ação a nível 3
--     reescreveria o passado.
--   • A aprovação guarda o HASH do token, nunca o token. Quem lê o banco
--     não consegue aprovar nada (mesma lógica de senha).
--   • Aprovação é de USO ÚNICO e datada: `usado_em` é fato, não flag.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  nome        TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- PEDIDOS — tudo que foi dito ao sistema, entendido ou não.
--
-- Pedido que o cérebro NÃO entendeu também vira linha. É a única forma
-- de descobrir o que as pessoas pedem e o sistema ainda não faz — e o
-- que o reconhecimento de fala erra com frequência.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  id              TEXT PRIMARY KEY,
  canal           TEXT NOT NULL DEFAULT 'whatsapp',  -- whatsapp | voz | staff | teste
  ator            TEXT NOT NULL DEFAULT '',          -- telefone, e-mail do staff ou 'chave'
  texto_original  TEXT NOT NULL DEFAULT '',          -- transcrição EXATA (trava 8)
  transcrito      INTEGER NOT NULL DEFAULT 0,        -- 1 = veio de áudio
  modo            TEXT NOT NULL DEFAULT 'executar',  -- consultar | executar
  acao            TEXT NOT NULL DEFAULT '',          -- chave do catálogo (voz/acoes.js)
  parametros      TEXT NOT NULL DEFAULT '{}',
  nivel           INTEGER NOT NULL DEFAULT 0,        -- nível SOB O QUAL foi autorizado
  status          TEXT NOT NULL DEFAULT 'recebido',
  -- recebido | respondido | aguardando_aprovacao | aprovado | recusado
  -- | executando | concluido | falhou | nao_entendido | nao_suportado | expirado
  fala            TEXT NOT NULL DEFAULT '',          -- o que a voz respondeu na hora
  resultado       TEXT NOT NULL DEFAULT '',          -- JSON do que a ferramenta devolveu
  erro            TEXT NOT NULL DEFAULT '',
  chave_idem      TEXT NOT NULL DEFAULT '',
  criado_em       TEXT NOT NULL DEFAULT '',
  decidido_em     TEXT NOT NULL DEFAULT '',
  concluido_em    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_pedidos_status ON pedidos(status, criado_em);
CREATE INDEX IF NOT EXISTS ix_pedidos_criado ON pedidos(criado_em DESC);
-- Índice PARCIAL: a chave de idempotência só é única quando existe.
-- Sem o WHERE, todo pedido sem chave colidiria com os outros no ''.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pedidos_idem ON pedidos(chave_idem) WHERE chave_idem <> '';

-- ---------------------------------------------------------------------
-- APROVAÇÕES — nível 3 e 4 (trava 3).
--
-- ⚠️ `token_hash`, nunca o token. E `usado_em` marca o consumo ANTES de
-- executar: aprovação de uso único que só é marcada depois pode ser
-- gasta duas vezes por dois cliques simultâneos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aprovacoes (
  id           TEXT PRIMARY KEY,
  pedido_id    TEXT NOT NULL REFERENCES pedidos(id),
  token_hash   TEXT NOT NULL,
  expira_em    TEXT NOT NULL,
  usado_em     TEXT NOT NULL DEFAULT '',
  decisao      TEXT NOT NULL DEFAULT '',        -- aprovar | recusar
  decidido_por TEXT NOT NULL DEFAULT '',        -- e-mail da sessão do staff que clicou
  criado_em    TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_aprovacoes_hash ON aprovacoes(token_hash);
CREATE INDEX IF NOT EXISTS ix_aprovacoes_pedido ON aprovacoes(pedido_id);

-- ---------------------------------------------------------------------
-- JOBS — fila durável. Espelha music/schema (ADR-0003 da Musique), que
-- já provou o desenho.
--
-- Filas: `rapida` (relatórios, escrita nível 2, envio) e `codigo`
-- (nível 4). A `codigo` está TRAVADA em `enfileirar` até existir
-- executor — ver voz/fila.js.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id             TEXT PRIMARY KEY,
  fila           TEXT NOT NULL DEFAULT 'rapida',   -- rapida | codigo
  tipo           TEXT NOT NULL,
  payload        TEXT NOT NULL DEFAULT '{}',
  prioridade     INTEGER NOT NULL DEFAULT 5,
  status         TEXT NOT NULL DEFAULT 'pendente', -- pendente|processando|concluido|dlq
  tentativas     INTEGER NOT NULL DEFAULT 0,
  max_tentativas INTEGER NOT NULL DEFAULT 5,
  proxima_em     TEXT NOT NULL DEFAULT '',
  chave_idem     TEXT NOT NULL DEFAULT '',
  dono           TEXT NOT NULL DEFAULT '',
  resultado      TEXT NOT NULL DEFAULT '',
  ultimo_erro    TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL DEFAULT '',
  iniciado_em    TEXT NOT NULL DEFAULT '',
  concluido_em   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_jobs_pendentes ON jobs(status, prioridade, criado_em);
CREATE UNIQUE INDEX IF NOT EXISTS ux_jobs_idem ON jobs(chave_idem) WHERE chave_idem <> '';

-- ---------------------------------------------------------------------
-- AUDITORIA — quem mandou, o quê, por qual canal (trava 8).
-- Separada dos pedidos de propósito: o pedido muda de status, a
-- auditoria é append-only e nunca é reescrita.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id         TEXT PRIMARY KEY,
  pedido_id  TEXT NOT NULL DEFAULT '',
  evento     TEXT NOT NULL,
  ator_tipo  TEXT NOT NULL DEFAULT 'voz',      -- voz | usuario | agente | sistema
  ator       TEXT NOT NULL DEFAULT '',
  detalhe    TEXT NOT NULL DEFAULT '{}',
  criado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_auditoria_pedido ON auditoria(pedido_id, criado_em);
CREATE INDEX IF NOT EXISTS ix_auditoria_criado ON auditoria(criado_em DESC);
