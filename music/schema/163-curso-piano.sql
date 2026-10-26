CREATE TABLE IF NOT EXISTS curso_piano_observacoes (
  id TEXT PRIMARY KEY,
  professor TEXT NOT NULL,
  aluno TEXT NOT NULL,
  capitulo INTEGER NOT NULL DEFAULT 0,
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_piano_observacoes_aluno ON curso_piano_observacoes(aluno, criado_em);
