CREATE TABLE IF NOT EXISTS curso_cavaquinho_observacoes (
  id TEXT PRIMARY KEY,
  professor TEXT NOT NULL,
  aluno TEXT NOT NULL,
  capitulo INTEGER NOT NULL DEFAULT 0,
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_cavaquinho_observacoes_aluno ON curso_cavaquinho_observacoes(aluno, criado_em);
