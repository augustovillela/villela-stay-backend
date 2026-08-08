-- =====================================================================
-- ORIGENA — 001 fundação (Fase 0).
--
-- Só o encanamento: configuração e fila durável. Nada de domínio ainda —
-- pessoas, proveniência e mídia entram nas migrações 002+ (Fase 1),
-- respeitando a ordem do ADR-0006 (proveniência ANTES da mídia).
--
-- Convenções (docs\origena\DATABASE.md):
--   • PK uuid com gen_random_uuid() (pgcrypto, no schema public)
--   • timestamptz sempre
--   • enum = text + CHECK, para o dump continuar legível daqui a 20 anos
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuração: preço, limite, crédito e flag NUNCA em código (§97).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config (
  chave         text PRIMARY KEY,
  valor         text NOT NULL DEFAULT '',
  descricao     text NOT NULL DEFAULT '',
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);

-- ---------------------------------------------------------------------
-- Feature flags (§96) — recurso caro ou sensível nasce desligado.
-- `escopo` já prevê flag por família, mesmo sem a tabela families ainda.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_flags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo     text NOT NULL DEFAULT 'global' CHECK (escopo IN ('global','family')),
  family_id  uuid,
  chave      text NOT NULL,
  ligada     boolean NOT NULL DEFAULT false,
  motivo     text NOT NULL DEFAULT '',
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flag_family_coerente CHECK ((escopo = 'family') = (family_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_flags_global ON feature_flags (chave) WHERE escopo = 'global';
CREATE UNIQUE INDEX IF NOT EXISTS ux_flags_family ON feature_flags (family_id, chave) WHERE escopo = 'family';

-- ---------------------------------------------------------------------
-- Fila durável (§62, §63 · ADR-0005).
--
-- Sem Redis: a fila é uma tabela, então herda a transação e o backup do
-- banco — job enfileirado junto com a mudança de domínio não se perde se
-- o processo cair no meio. Entrega NO MÍNIMO UMA VEZ: todo handler
-- PRECISA ser idempotente. Consumo com FOR UPDATE SKIP LOCKED, que é o
-- que permite vários workers sem um pisar no job do outro.
--
-- Duas filas por classe de custo: 'rapida' (thumb, EXIF, índice, e-mail)
-- e 'cara' (IA, vídeo, exportação). Dá para pausar a cara sob estouro de
-- custo sem parar o produto.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fila           text NOT NULL DEFAULT 'rapida' CHECK (fila IN ('rapida','cara')),
  tipo           text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}',
  family_id      uuid,
  -- chave de idempotência: o índice único é a garantia real, não a
  -- checagem prévia (duas requisições simultâneas passariam por ela).
  chave_idem     text,
  prioridade     smallint NOT NULL DEFAULT 5,
  tentativas     smallint NOT NULL DEFAULT 0,
  max_tentativas smallint NOT NULL DEFAULT 5,
  rodar_apos     timestamptz NOT NULL DEFAULT now(),
  travado_por    text,
  travado_em     timestamptz,
  status         text NOT NULL DEFAULT 'na_fila'
                 CHECK (status IN ('na_fila','processando','concluido','falhou')),
  erro           text,
  resultado      jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_jobs_idem ON jobs (chave_idem) WHERE chave_idem IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_jobs_pegar ON jobs (fila, prioridade, rodar_apos)
  WHERE status = 'na_fila';
CREATE INDEX IF NOT EXISTS ix_jobs_presos ON jobs (travado_em) WHERE status = 'processando';

-- Dead-letter: job que esgotou as tentativas NUNCA some e NUNCA fica
-- girando para sempre. É daqui que sai o alerta ao Augusto.
CREATE TABLE IF NOT EXISTS jobs_dlq (
  id          uuid PRIMARY KEY,
  fila        text NOT NULL,
  tipo        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  family_id   uuid,
  tentativas  smallint NOT NULL,
  erro        text NOT NULL DEFAULT '',
  criado_em   timestamptz NOT NULL,
  morto_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dlq_tipo ON jobs_dlq (tipo, morto_em DESC);
