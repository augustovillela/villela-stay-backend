CREATE TABLE IF NOT EXISTS curso_piano_progresso (
  aluno TEXT NOT NULL,
  capitulo TEXT NOT NULL,
  checklist TEXT NOT NULL DEFAULT '{}',
  concluido INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL,
  proxima_revisao TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (aluno, capitulo)
);
CREATE INDEX IF NOT EXISTS ix_piano_progresso_aluno ON curso_piano_progresso(aluno, atualizado_em);
