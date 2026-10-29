CREATE TABLE IF NOT EXISTS curso_ukulele_observacoes (
  id TEXT PRIMARY KEY,
  professor TEXT NOT NULL,
  aluno TEXT NOT NULL,
  capitulo TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_ukulele_observacoes_aluno
  ON curso_ukulele_observacoes(aluno, criado_em);
