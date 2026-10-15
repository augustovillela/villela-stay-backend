-- Tocar junto: rascunho editável e publicações imutáveis do chart monofônico.
-- A obra continua sendo a autoridade de propriedade e visibilidade.
-- Sem cascade para tocar_sessoes: os resumos privados de treino são independentes.
CREATE TABLE IF NOT EXISTS tocar_arranjos (
  id            TEXT PRIMARY KEY,
  obra_id       TEXT NOT NULL REFERENCES obras(id),
  documento     TEXT NOT NULL CHECK (json_valid(documento)),
  revisao       INTEGER NOT NULL DEFAULT 1 CHECK (revisao >= 1),
  publicada_id  TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_tocar_arranjos_obra ON tocar_arranjos (obra_id, atualizado_em);

CREATE TABLE IF NOT EXISTS tocar_versoes (
  id           TEXT PRIMARY KEY,
  arranjo_id   TEXT NOT NULL REFERENCES tocar_arranjos(id),
  numero       INTEGER NOT NULL CHECK (numero >= 1),
  documento    TEXT NOT NULL CHECK (json_valid(documento)),
  sha256       TEXT NOT NULL CHECK (length(sha256) = 64),
  publicado_em TEXT NOT NULL,
  UNIQUE (arranjo_id, numero)
);
CREATE INDEX IF NOT EXISTS ix_tocar_versoes_arranjo ON tocar_versoes (arranjo_id, numero);
-- A exclusão por privacidade continua permitida; editar uma publicação, não.
CREATE TRIGGER IF NOT EXISTS tocar_versoes_imutaveis
BEFORE UPDATE ON tocar_versoes
BEGIN
  SELECT RAISE(ABORT, 'Uma versão publicada não pode ser alterada.');
END;
