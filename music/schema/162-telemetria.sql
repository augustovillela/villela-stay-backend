CREATE TABLE IF NOT EXISTS music_telemetria (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  evento     TEXT NOT NULL,
  rota       TEXT NOT NULL DEFAULT '',
  navegador  TEXT NOT NULL DEFAULT '',
  sistema    TEXT NOT NULL DEFAULT '',
  versao_app TEXT NOT NULL DEFAULT '',
  duracao_ms INTEGER NOT NULL DEFAULT 0,
  codigo     TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_music_telemetria_data ON music_telemetria(criado_em);
