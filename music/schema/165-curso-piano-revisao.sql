ALTER TABLE curso_piano_progresso ADD COLUMN proxima_revisao TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS ix_piano_progresso_revisao ON curso_piano_progresso(aluno, proxima_revisao);
