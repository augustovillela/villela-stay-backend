-- ---- TEMPO DE USO (desde 07/11/2026) ----
-- Quanto tempo a PESSOA LOGADA passou usando o Musique, por área e por dia.
-- Alimentada pelo pulso do app (POST /music/api/uso/pulso); quanto somar
-- decide o servidor (music/uso-tempo.js), nunca o cliente. Só guarda
-- segundos agregados — nada do que a pessoa tocou, escreveu ou ouviu.
CREATE TABLE IF NOT EXISTS uso_tempo (
  usuario      TEXT NOT NULL,
  area         TEXT NOT NULL,
  dia          TEXT NOT NULL,
  segundos     INTEGER NOT NULL DEFAULT 0,
  pulsos       INTEGER NOT NULL DEFAULT 0,
  ultimo_pulso TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, area, dia)
);
CREATE INDEX IF NOT EXISTS ix_uso_tempo_dia ON uso_tempo(dia);
