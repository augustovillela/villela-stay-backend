CREATE TABLE IF NOT EXISTS riffs_catalogo (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  artista TEXT NOT NULL DEFAULT '',
  instrumento TEXT NOT NULL DEFAULT 'guitarra',
  dificuldade TEXT NOT NULL DEFAULT 'intermediario',
  origem TEXT NOT NULL DEFAULT 'referencia',
  fonte_url TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'sem_tablatura',
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_riffs_catalogo_artista ON riffs_catalogo(artista, titulo);
