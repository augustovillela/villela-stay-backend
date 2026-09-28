-- =====================================================================
-- Musique Cifras — SMART PLAY (28/09/2026): tocar a gravação (MP3 ou
-- YouTube) e a cifra acompanhar linha a linha (karaokê + rolagem).
-- =====================================================================

-- Em que momento da mídia começa cada LINHA da cifra. Automático (alinhador
-- do motor, só para arquivo de áudio) ou marcado à mão (toque a cada linha,
-- serve também para o YouTube). Uma sincronia por cifra × mídia.
CREATE TABLE IF NOT EXISTS cifra_sincronias (
  cifra_id       TEXT NOT NULL,
  midia_id       TEXT NOT NULL,
  marcas         TEXT NOT NULL DEFAULT '[]',   -- [{ linha, t_ms }]
  origem         TEXT NOT NULL DEFAULT 'manual', -- manual | auto
  confianca      REAL NOT NULL DEFAULT 0,
  atualizado_por TEXT NOT NULL DEFAULT '',
  atualizado_em  TEXT NOT NULL,
  PRIMARY KEY (cifra_id, midia_id)
);

-- Busca automática do vídeo no YouTube: uma tentativa por música (a cota
-- da API é pequena), com o resultado para não repetir.
CREATE TABLE IF NOT EXISTS youtube_buscas (
  obra_id    TEXT PRIMARY KEY,
  buscado_em TEXT NOT NULL,
  resultado  TEXT NOT NULL DEFAULT '',        -- id do vídeo ou motivo
  consulta   TEXT NOT NULL DEFAULT ''
);
