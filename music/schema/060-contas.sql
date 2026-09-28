-- =====================================================================
-- Musique — CONTAS PRÓPRIAS (ADR-0011, 28/09/2026; revoga a conta única
-- da ADR-0001). Decisão do Augusto: Musique e Academia são sistemas
-- INDEPENDENTES. Só a conta dele nasce com a mesma senha (cópia do hash,
-- uma vez; depois cada lado segue sozinho) e só o que liga os dois são
-- os CURSOS: vitrine, trilha → curso e professor que é produtor.
--
-- O `id` da conta é o mesmo valor gravado nas colunas `academy_user_id`,
-- `dono`, `usuario` etc. das outras tabelas. O nome dessas colunas ficou
-- por história: hoje guardam o id da CONTA MUSIQUE.
-- =====================================================================

CREATE TABLE IF NOT EXISTS contas_music (
  id               TEXT PRIMARY KEY,
  nome             TEXT NOT NULL,
  email            TEXT NOT NULL,
  senha_hash       TEXT NOT NULL,
  telefone         TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'ativo',     -- ativo | suspenso
  consentimentos   TEXT NOT NULL DEFAULT '{}',
  -- Conta de PRODUTOR da Academia provada por quem é dono dela (e-mail +
  -- senha da Academia, conferidos lá e nunca guardados aqui). Só serve
  -- para dar aula (ADR-0008). Nulo para quase todo mundo.
  academia_vinculo TEXT,
  origem           TEXT NOT NULL DEFAULT 'cadastro',  -- cadastro | dono
  -- Confirmação de e-mail e duas etapas (28/09/2026). Também entram por
  -- `garantirColuna` no db.js: a tabela já existia em produção sem elas.
  email_verificado   INTEGER NOT NULL DEFAULT 0,
  totp_secret        TEXT NOT NULL DEFAULT '',
  totp_ativo         INTEGER NOT NULL DEFAULT 0,
  totp_ultimo_passo  INTEGER NOT NULL DEFAULT 0,
  recuperacao        TEXT NOT NULL DEFAULT '[]',
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT NOT NULL,
  ultimo_login     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_contas_music_email ON contas_music(email);
CREATE UNIQUE INDEX IF NOT EXISTS ux_contas_music_vinculo ON contas_music(academia_vinculo) WHERE academia_vinculo IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessoes_music (
  id         TEXT PRIMARY KEY,
  conta_id   TEXT NOT NULL,
  criada_em  TEXT NOT NULL,
  expira_em  TEXT NOT NULL,
  revogada   INTEGER NOT NULL DEFAULT 0,
  ip         TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_sessoes_music_conta ON sessoes_music(conta_id);

CREATE TABLE IF NOT EXISTS contas_auditoria (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  quando  TEXT NOT NULL,
  quem    TEXT NOT NULL,
  acao    TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT '',
  ip      TEXT NOT NULL DEFAULT ''
);

-- Trilha do Musique → curso da Academia (complemento). A trilha é
-- currículo em código; o curso recomendado é escolha editorial do staff.
CREATE TABLE IF NOT EXISTS trilha_cursos (
  trilha_id     TEXT PRIMARY KEY,
  curso_slug    TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  por           TEXT NOT NULL DEFAULT ''
);
