-- =====================================================================
-- Musique · Laboratório — TUTOR DE BRAÇO (29/09/2026).
--
-- Guarda só a MARCA de cada exercício por pessoa (melhor andamento limpo,
-- último andamento, precisão da última rodada). O áudio NUNCA sai do
-- aparelho: a escuta e a medida rodam no navegador, e aqui chega só o
-- número. É indicação de treino, não nota (Q5).
-- Entra na exportação e na exclusão LGPD do Laboratório.
-- Migração aditiva e idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS lab_tutor (
  usuario        TEXT NOT NULL,
  exercicio      TEXT NOT NULL,          -- chave estável do exercício (instrumento|tipo|tônica|escala…)
  titulo         TEXT NOT NULL DEFAULT '',
  melhor_bpm     INTEGER NOT NULL DEFAULT 0,   -- maior andamento com rodada limpa (≥ 95%)
  ultimo_bpm     INTEGER NOT NULL DEFAULT 0,
  precisao       INTEGER NOT NULL DEFAULT 0,   -- % da última rodada
  desvio_ms      INTEGER NOT NULL DEFAULT 0,
  rodadas        INTEGER NOT NULL DEFAULT 0,
  atualizado_em  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, exercicio)
);
CREATE INDEX IF NOT EXISTS ix_lab_tutor_usuario ON lab_tutor (usuario, atualizado_em);
