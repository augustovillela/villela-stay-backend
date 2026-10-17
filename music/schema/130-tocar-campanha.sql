-- Progresso privado da campanha autoral por conta e instrumento.
-- O estado é derivado pelo núcleo da campanha e não representa nota escolar.
CREATE TABLE IF NOT EXISTS tocar_campanhas (
  usuario       TEXT NOT NULL,
  instrumento   TEXT NOT NULL,
  estado        TEXT NOT NULL CHECK (json_valid(estado)),
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (usuario, instrumento)
);
CREATE INDEX IF NOT EXISTS ix_tocar_campanhas_usuario ON tocar_campanhas (usuario, atualizado_em);
