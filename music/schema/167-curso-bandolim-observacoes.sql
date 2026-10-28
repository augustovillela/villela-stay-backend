CREATE TABLE IF NOT EXISTS curso_bandolim_observacoes (
  id TEXT PRIMARY KEY,
  professor TEXT NOT NULL,
  aluno TEXT NOT NULL,
  capitulo TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_bandolim_observacoes_aluno
  ON curso_bandolim_observacoes(aluno, criado_em);
