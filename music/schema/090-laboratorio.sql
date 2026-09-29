-- =====================================================================
-- Musique · LABORATÓRIO MUSICAL (ADR-0013, 28/09/2026).
--
-- Teoria NÃO mora no banco: escalas, acordes e tonalidades são
-- calculados do catálogo em código. Aqui fica só o que MUDA por pessoa.
--
-- As tentativas e a repetição espaçada REUSAM `tentativas` e
-- `agenda_revisao` (020-academia.sql), com tipo `lab:<exercício>` e
-- família `lab:<habilidade>` — o progresso do Laboratório entra no mesmo
-- diário de estudo, sem uma segunda contabilidade.
-- Migração aditiva e idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS lab_favoritos (
  usuario    TEXT NOT NULL,
  url        TEXT NOT NULL,
  titulo     TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, url)
);

-- Melhor marca por jogo e o desafio do dia (um registro por dia).
CREATE TABLE IF NOT EXISTS lab_jogos (
  usuario    TEXT NOT NULL,
  jogo       TEXT NOT NULL,
  dia        TEXT NOT NULL,          -- AAAA-MM-DD (Brasília)
  pontos     INTEGER NOT NULL DEFAULT 0,
  acertos    INTEGER NOT NULL DEFAULT 0,
  total      INTEGER NOT NULL DEFAULT 0,
  criado_em  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, jogo, dia)
);
CREATE INDEX IF NOT EXISTS ix_lab_jogos_usuario ON lab_jogos(usuario, jogo);

-- Atividade do professor: a CONFIGURAÇÃO do exercício. O vínculo com os
-- alunos, a nota e a contestação são os da TAREFA (020-academia.sql):
-- uma atividade cria uma tarefa, e quem vê o quê segue a tarefa.
CREATE TABLE IF NOT EXISTS lab_atividades (
  id            TEXT PRIMARY KEY,
  professor     TEXT NOT NULL,
  tarefa_id     TEXT NOT NULL DEFAULT '',
  titulo        TEXT NOT NULL,
  config        TEXT NOT NULL DEFAULT '{}',   -- { tipos, nivel, questoes, semente_fixa, tempo_s }
  versao        INTEGER NOT NULL DEFAULT 1,   -- versão do gerador (tentativa antiga continua explicável)
  status        TEXT NOT NULL DEFAULT 'ativa',
  criado_em     TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lab_atividades_prof ON lab_atividades(professor, status);

-- "Por onde começar?": nível, instrumento e objetivo da pessoa.
CREATE TABLE IF NOT EXISTS lab_perfil (
  usuario       TEXT PRIMARY KEY,
  nivel         TEXT NOT NULL DEFAULT '',
  instrumento   TEXT NOT NULL DEFAULT '',
  objetivo      TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT ''
);
