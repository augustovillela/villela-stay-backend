CREATE TABLE IF NOT EXISTS curso_cavaquinho_progresso (
  aluno TEXT NOT NULL,
  capitulo TEXT NOT NULL,
  concluido INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (aluno, capitulo)
);
CREATE INDEX IF NOT EXISTS ix_cavaquinho_progresso_aluno ON curso_cavaquinho_progresso(aluno, atualizado_em);
