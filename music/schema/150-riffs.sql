-- Riffs e tablaturas: acervo privado e versionado do músico.
CREATE TABLE IF NOT EXISTS riffs (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  titulo TEXT NOT NULL,
  artista TEXT NOT NULL DEFAULT '',
  instrumento TEXT NOT NULL DEFAULT 'guitarra',
  afinacao TEXT NOT NULL DEFAULT 'padrao',
  bpm INTEGER NOT NULL DEFAULT 0,
  dificuldade TEXT NOT NULL DEFAULT 'iniciante',
  origem TEXT NOT NULL DEFAULT 'manual',
  licenca TEXT NOT NULL DEFAULT '',
  privado INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS riff_versoes (
  id TEXT PRIMARY KEY,
  riff_id TEXT NOT NULL REFERENCES riffs(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  documento TEXT NOT NULL CHECK (json_valid(documento)),
  descricao TEXT NOT NULL DEFAULT '',
  criado_por TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  UNIQUE (riff_id, numero)
);
CREATE INDEX IF NOT EXISTS ix_riffs_usuario ON riffs(usuario, atualizado_em);
CREATE INDEX IF NOT EXISTS ix_riff_versoes_riff ON riff_versoes(riff_id, numero DESC);
