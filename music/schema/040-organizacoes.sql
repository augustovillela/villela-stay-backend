-- =====================================================================
-- Musique — FASE 3: escolas, turmas, presença e boletim.
--
-- Multi-tenant por GUARDA DE COLUNA (ADR-0007): toda tabela daqui tem
-- `organizacao_id`, e o filtro mora em um portão único
-- (`music/organizacoes.js`). O id NUNCA vem do cliente — sai da
-- membresia verificada na sessão.
--
-- ⚠️ Aluno de escola NÃO perde o acervo dele para a escola. Organização
-- é uma camada A MAIS sobre `direitos.js`, nunca um substituto.
-- =====================================================================

-- ---- ORGANIZAÇÃO (escola, estúdio, igreja, projeto social) ----
CREATE TABLE IF NOT EXISTS organizacoes (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'escola',   -- escola | estudio | igreja | projeto
  descricao     TEXT NOT NULL DEFAULT '',
  -- Identidade da ESCOLA, que é dela e legítima — diferente da marca da
  -- Musique, que é provisória e não se inventa (ADR-0005).
  cor           TEXT NOT NULL DEFAULT '',
  logo_media_id TEXT NOT NULL DEFAULT '',
  -- Assentos: quantos alunos a escola pode ter matriculados ao mesmo
  -- tempo. Zero = sem limite (usado pela conta interna do grupo).
  assentos      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'ativa',    -- ativa | suspensa | encerrada
  criado_por    TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT ''
);

-- ---- MEMBROS ----
-- `papel` decide o que a pessoa pode dentro DESTA organização. Fora
-- dela, o papel não vale nada.
CREATE TABLE IF NOT EXISTS org_membros (
  organizacao_id TEXT NOT NULL REFERENCES organizacoes(id),
  usuario        TEXT NOT NULL,
  papel          TEXT NOT NULL DEFAULT 'professor',  -- gestor | professor | secretaria
  entrou_em      TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (organizacao_id, usuario)
);
CREATE INDEX IF NOT EXISTS ix_org_membros_usuario ON org_membros(usuario);

-- ---- TURMAS ----
CREATE TABLE IF NOT EXISTS turmas (
  id             TEXT PRIMARY KEY,
  organizacao_id TEXT NOT NULL REFERENCES organizacoes(id),
  nome           TEXT NOT NULL,
  professor      TEXT NOT NULL DEFAULT '',
  instrumento    TEXT NOT NULL DEFAULT '',
  nivel          TEXT NOT NULL DEFAULT '',
  horario        TEXT NOT NULL DEFAULT '',
  periodo        TEXT NOT NULL DEFAULT '',          -- ex.: 2026.2
  status         TEXT NOT NULL DEFAULT 'ativa',     -- ativa | encerrada
  criado_em      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_turmas_org ON turmas(organizacao_id, status);
CREATE INDEX IF NOT EXISTS ix_turmas_professor ON turmas(professor, status);

-- ---- MATRÍCULAS ----
-- `responsavel` preenchido quando o aluno é MENOR (LGPD art. 14). A
-- conta continua sendo a da Academia; aqui fica quem responde por ele
-- naquela escola.
CREATE TABLE IF NOT EXISTS matriculas (
  id             TEXT PRIMARY KEY,
  organizacao_id TEXT NOT NULL REFERENCES organizacoes(id),
  turma_id       TEXT NOT NULL REFERENCES turmas(id),
  aluno          TEXT NOT NULL,
  responsavel    TEXT NOT NULL DEFAULT '',
  menor          INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'ativa',     -- ativa | trancada | encerrada
  matriculado_em TEXT NOT NULL DEFAULT '',
  encerrado_em   TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_matricula ON matriculas(turma_id, aluno);
CREATE INDEX IF NOT EXISTS ix_matriculas_org ON matriculas(organizacao_id, status);
CREATE INDEX IF NOT EXISTS ix_matriculas_aluno ON matriculas(aluno, status);

-- ---- AULAS (encontros da turma) ----
-- `link` guarda a sala de videoconferência. Aula ao vivo integrada é
-- fase futura; por ora o link é externo, e a tela diz isso.
CREATE TABLE IF NOT EXISTS aulas (
  id             TEXT PRIMARY KEY,
  organizacao_id TEXT NOT NULL REFERENCES organizacoes(id),
  turma_id       TEXT NOT NULL REFERENCES turmas(id),
  data           TEXT NOT NULL DEFAULT '',
  tema           TEXT NOT NULL DEFAULT '',
  link           TEXT NOT NULL DEFAULT '',
  observacao     TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_aulas_turma ON aulas(turma_id, data);

-- ---- PRESENÇA ----
-- Guarda QUEM registrou e QUANDO: chamada é documento de escola, e
-- "quem marcou falta" é a primeira pergunta quando alguém reclama.
CREATE TABLE IF NOT EXISTS presencas (
  aula_id        TEXT NOT NULL REFERENCES aulas(id),
  aluno          TEXT NOT NULL,
  organizacao_id TEXT NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'presente',  -- presente | falta | justificada
  motivo         TEXT NOT NULL DEFAULT '',
  registrado_por TEXT NOT NULL DEFAULT '',
  registrado_em  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (aula_id, aluno)
);
CREATE INDEX IF NOT EXISTS ix_presencas_aluno ON presencas(aluno, organizacao_id);

-- ---- BIBLIOTECA INSTITUCIONAL ----
-- A escola compartilha material com a turma. Continua valendo
-- `direitos.js`: obra de terceiro NÃO entra aqui, porque isto é
-- distribuição — e é justamente o que a decisão Q2 proíbe.
CREATE TABLE IF NOT EXISTS org_biblioteca (
  id             TEXT PRIMARY KEY,
  organizacao_id TEXT NOT NULL REFERENCES organizacoes(id),
  obra_id        TEXT NOT NULL REFERENCES obras(id),
  turma_id       TEXT NOT NULL DEFAULT '',          -- vazio = toda a escola
  adicionado_por TEXT NOT NULL DEFAULT '',
  nota           TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_org_biblioteca ON org_biblioteca(organizacao_id, obra_id, turma_id);
CREATE INDEX IF NOT EXISTS ix_org_biblioteca_turma ON org_biblioteca(turma_id);
