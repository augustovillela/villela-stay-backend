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
