-- Vínculo opcional entre uma tarefa do professor e uma etapa da campanha Tocar junto.
-- Tarefas antigas permanecem sem vínculo e continuam funcionando normalmente.
CREATE TABLE IF NOT EXISTS tocar_tarefas (
  tarefa_id   TEXT PRIMARY KEY REFERENCES tarefas(id),
  instrumento TEXT NOT NULL,
  estudo_id   TEXT NOT NULL,
  meta_tipo   TEXT NOT NULL DEFAULT 'conclusao',
  meta_valor  REAL NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_tocar_tarefas_campanha ON tocar_tarefas(instrumento, estudo_id);
