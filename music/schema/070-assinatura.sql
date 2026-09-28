-- =====================================================================
-- Musique — ASSINATURA (28/09/2026, aprovada pelo Augusto).
-- R$ 250,00/mês por preapproval do Mercado Pago. O app continua todo
-- grátis; a assinatura dá CORTESIA dos cursos de música da Academia,
-- pelo mesmo e-mail (confirmado no Musique), enquanto estiver ativa.
-- =====================================================================

CREATE TABLE IF NOT EXISTS assinaturas_music (
  id                  TEXT PRIMARY KEY,
  conta_id            TEXT NOT NULL,
  -- pendente | ativa | inadimplente | cancelada | cortesia
  status              TEXT NOT NULL,
  origem              TEXT NOT NULL DEFAULT 'mp',      -- mp | cortesia | dono
  plano               TEXT NOT NULL DEFAULT 'individual', -- individual | banda
  vagas               INTEGER NOT NULL DEFAULT 1,
  preco_cents         INTEGER NOT NULL DEFAULT 0,
  preapproval_id      TEXT NOT NULL DEFAULT '',
  link                TEXT NOT NULL DEFAULT '',
  inadimplente_desde  TEXT NOT NULL DEFAULT '',
  ultimo_pagamento_em TEXT NOT NULL DEFAULT '',
  motivo              TEXT NOT NULL DEFAULT '',
  criado_em           TEXT NOT NULL,
  atualizado_em       TEXT NOT NULL,
  encerrada_em        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_assin_conta ON assinaturas_music(conta_id, criado_em);
CREATE INDEX IF NOT EXISTS ix_assin_pre ON assinaturas_music(preapproval_id);

-- Pagamento recebido: idempotência pela referência do MP (ele reenvia).
CREATE TABLE IF NOT EXISTS assinatura_pagamentos (
  ref           TEXT PRIMARY KEY,
  assinatura_id TEXT NOT NULL,
  valor_cents   INTEGER NOT NULL DEFAULT 0,
  pago_em       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assinatura_eventos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assinatura_id TEXT NOT NULL DEFAULT '',
  conta_id      TEXT NOT NULL DEFAULT '',
  tipo          TEXT NOT NULL,
  detalhe       TEXT NOT NULL DEFAULT '',
  quando        TEXT NOT NULL
);

-- PLANO BANDA (28/09/2026): 5 assinaturas de uma vez, 30% de desconto. A
-- titular ocupa uma vaga e distribui as outras por e-mail (conta Musique).
CREATE TABLE IF NOT EXISTS assinatura_vagas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assinatura_id TEXT NOT NULL,
  conta_id      TEXT NOT NULL,
  adicionada_em TEXT NOT NULL,
  removida_em   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_vagas_assin ON assinatura_vagas(assinatura_id, removida_em);
CREATE INDEX IF NOT EXISTS ix_vagas_conta ON assinatura_vagas(conta_id, removida_em);

-- O que o Musique concedeu na Academia, para revogar SÓ isso depois.
CREATE TABLE IF NOT EXISTS cortesia_academia (
  conta_id         TEXT PRIMARY KEY,
  email            TEXT NOT NULL,
  academia_user_id TEXT NOT NULL DEFAULT '',
  cursos           INTEGER NOT NULL DEFAULT 0,
  concedida_em     TEXT NOT NULL DEFAULT '',
  revogada_em      TEXT NOT NULL DEFAULT '',
  ultimo_sync      TEXT NOT NULL DEFAULT ''
);
