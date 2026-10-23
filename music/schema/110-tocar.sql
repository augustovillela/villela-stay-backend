-- Musique · Tocar junto — resumo privado de prática de guitarra.
-- Dados declarados pelo navegador: não são nota, ranking ou avaliação formal.
-- Nenhum áudio, dispositivo, e-mail ou arquivo de arranjo é armazenado aqui.
-- Schema aditivo e idempotente; exportação/exclusão passam pelo Laboratório.
CREATE TABLE IF NOT EXISTS tocar_sessoes (
  id         TEXT PRIMARY KEY,
  usuario    TEXT NOT NULL,
  resumo     TEXT NOT NULL CHECK (json_valid(resumo)),
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_tocar_sessoes_usuario ON tocar_sessoes (usuario, criado_em);
