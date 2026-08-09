-- =====================================================================
-- ORIGENA — 008 comércio e IA (Fase 7).
--
-- CRÉDITO É LEDGER, NUNCA UM CAMPO (§52). `credit_wallets.saldo` é
-- cache; a verdade é SUM(delta) de `credit_transactions`, e a
-- reconciliação confere os dois. Não existe UPDATE de saldo à mão — nem
-- em reembolso, nem em suporte.
--
-- PROVEDOR É LINHA DE TABELA, NUNCA CÓDIGO (§56). Trocar de modelo é
-- UPDATE no registry, não deploy.
-- =====================================================================

CREATE TABLE IF NOT EXISTS plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         text NOT NULL UNIQUE,
  nome           text NOT NULL,
  preco_centavos integer NOT NULL DEFAULT 0,
  storage_gb     integer NOT NULL DEFAULT 25,
  creditos_mes   integer NOT NULL DEFAULT 0,
  limites        jsonb NOT NULL DEFAULT '{}',
  ativo          boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- Estrutura dos 4 planos (§50). Preços NÃO definidos: decisão do Augusto
-- (PENDENCIAS Q7). Só o Essencial nasce ativo, gratuito, para o beta.
INSERT INTO plans (codigo, nome, preco_centavos, storage_gb, creditos_mes, ativo)
VALUES ('essencial', 'Origena Essencial', 0, 25, 20, true),
       ('familia',   'Origena Família',   0, 150, 100, false),
       ('legado',    'Origena Legado',    0, 500, 300, false),
       ('geracoes',  'Origena Gerações',  0, 2048, 1000, false)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id),
  plan_id      uuid NOT NULL REFERENCES plans(id),
  status       text NOT NULL DEFAULT 'ativa'
               CHECK (status IN ('trial','ativa','inadimplente','cancelada','suspensa')),
  gateway      text NOT NULL DEFAULT 'manual',     -- manual | mercadopago
  gateway_ref  text NOT NULL DEFAULT '',
  inicio       timestamptz NOT NULL DEFAULT now(),
  proximo_ciclo date,
  cancelada_em timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sub_familia ON subscriptions (family_id)
  WHERE status IN ('trial','ativa','inadimplente');

CREATE TABLE IF NOT EXISTS credit_wallets (
  family_id    uuid PRIMARY KEY REFERENCES families(id),
  saldo        integer NOT NULL DEFAULT 0,      -- cache; a verdade é o ledger
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id),
  tipo         text NOT NULL CHECK (tipo IN
               ('compra','bonus','reserva','consumo','estorno','ajuste')),
  delta        integer NOT NULL,                -- consumo = 0 (converte a reserva)
  saldo_depois integer NOT NULL,
  ref_tipo     text NOT NULL DEFAULT '',
  ref_id       text NOT NULL DEFAULT '',
  motivo       text NOT NULL DEFAULT '',
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ledger ON credit_transactions (family_id, created_at DESC);
-- Idempotência de crédito externo: a MESMA referência não credita duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_ref ON credit_transactions (family_id, tipo, ref_tipo, ref_id)
  WHERE tipo IN ('compra','bonus') AND ref_id <> '';

CREATE TABLE IF NOT EXISTS provider_registry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,
  model         text NOT NULL,
  capability    text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  prioridade    integer NOT NULL DEFAULT 5,
  creditos      integer NOT NULL DEFAULT 1,     -- preço da operação, em créditos
  custo_estimado_centavos integer NOT NULL DEFAULT 0,
  margem_min_bp integer NOT NULL DEFAULT 0,
  notas         text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_registry ON provider_registry (provider, model, capability);
-- Capabilities de texto que o grupo JÁ TEM COMO servir (Anthropic).
-- OCR/transcrição/imagem ficam FORA até existir provedor (ADR-0004 §4).
INSERT INTO provider_registry (provider, model, capability, creditos, custo_estimado_centavos)
VALUES ('anthropic', 'claude-opus-5', 'gerar_biografia', 10, 30),
       ('anthropic', 'claude-opus-5', 'responder_familia', 1, 5),
       ('anthropic', 'claude-opus-5', 'analisar_documento', 5, 15)
ON CONFLICT (provider, model, capability) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id),
  capability   text NOT NULL,
  entrada      jsonb NOT NULL DEFAULT '{}',     -- REFERÊNCIAS, nunca o conteúdo
  status       text NOT NULL DEFAULT 'reservado'
               CHECK (status IN ('reservado','executando','concluido','falhou','estornado')),
  provider     text NOT NULL DEFAULT '',
  model        text NOT NULL DEFAULT '',
  creditos     integer NOT NULL DEFAULT 0,
  erro         text NOT NULL DEFAULT '',
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ai_jobs ON ai_jobs (family_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_cost_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_job_id        uuid NOT NULL REFERENCES ai_jobs(id),
  family_id        uuid NOT NULL REFERENCES families(id),
  provider         text NOT NULL, model text NOT NULL, capability text NOT NULL,
  tokens_in        integer NOT NULL DEFAULT 0,
  tokens_out       integer NOT NULL DEFAULT 0,
  custo_centavos   integer NOT NULL DEFAULT 0,
  creditos_cobrados integer NOT NULL DEFAULT 0,
  margem_bp        integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_custo_ia ON ai_cost_ledger (family_id, created_at DESC);

-- Biografia viva (§18): versionada; V1 nunca some; cada versão guarda AS
-- FONTES que a sustentaram — biografia sem fontes é ficção com nome real.
CREATE TABLE IF NOT EXISTS biographies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  person_id     uuid NOT NULL REFERENCES persons(id),
  versao_atual  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_bio_pessoa ON biographies (person_id);

CREATE TABLE IF NOT EXISTS biography_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  biography_id  uuid NOT NULL REFERENCES biographies(id),
  versao        integer NOT NULL,
  corpo         text NOT NULL,
  fontes        jsonb NOT NULL DEFAULT '[]',    -- ids de claims/contribuições/histórias usadas
  provider      text NOT NULL DEFAULT '', model text NOT NULL DEFAULT '',
  ai_job_id     uuid,
  gerada_por    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_bio_versao ON biography_versions (biography_id, versao);

SELECT aplicar_rls('subscriptions');
SELECT aplicar_rls('credit_wallets');
SELECT aplicar_rls('credit_transactions');
SELECT aplicar_rls('ai_jobs');
SELECT aplicar_rls('ai_cost_ledger');
SELECT aplicar_rls('biographies');
SELECT aplicar_rls('biography_versions');

-- Bônus de boas-vindas configurável (§97) — nunca número em código.
INSERT INTO config (chave, valor, descricao)
VALUES ('creditos_bonus_inicial', '20', 'Créditos de boas-vindas de cada família nova')
ON CONFLICT (chave) DO NOTHING;
