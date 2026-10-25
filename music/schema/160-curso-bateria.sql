CREATE TABLE IF NOT EXISTS curso_bateria_progresso (
  aluno TEXT NOT NULL,
  rudimento INTEGER NOT NULL,
  bpm INTEGER NOT NULL DEFAULT 0,
  repeticoes_limpas INTEGER NOT NULL DEFAULT 0,
  diagnostico TEXT NOT NULL DEFAULT '',
  concluido INTEGER NOT NULL DEFAULT 0,
  ultima_pratica TEXT NOT NULL,
  proxima_revisao TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (aluno, rudimento)
);
CREATE INDEX IF NOT EXISTS ix_bateria_progresso_aluno ON curso_bateria_progresso(aluno, ultima_pratica);
CREATE TABLE IF NOT EXISTS curso_bateria_observacoes (
  id TEXT PRIMARY KEY,
  professor TEXT NOT NULL,
  aluno TEXT NOT NULL,
  rudimento INTEGER NOT NULL DEFAULT 0,
  tarefa_id TEXT NOT NULL DEFAULT '',
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_bateria_observacoes_aluno ON curso_bateria_observacoes(aluno, criado_em);
