-- Perfil vocal evolutivo. Guarda somente medidas agregadas; áudio bruto fica no navegador.
CREATE TABLE IF NOT EXISTS avaliacoes_vocais (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  cifra_id TEXT NOT NULL DEFAULT '',
  nota_min_midi INTEGER NOT NULL,
  nota_max_midi INTEGER NOT NULL,
  regiao_min_midi INTEGER NOT NULL,
  regiao_max_midi INTEGER NOT NULL,
  estabilidade REAL NOT NULL DEFAULT 0,
  confianca REAL NOT NULL DEFAULT 0,
  amostras INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_avaliacoes_vocais_usuario ON avaliacoes_vocais(usuario, criado_em);
