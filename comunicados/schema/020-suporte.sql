-- =====================================================================
-- Comunicados — SUPORTE (chat de mão dupla entre o cliente e o staff).
--
-- Uma conversa pertence a UM usuário de UM produto (produto + usuario_ref).
-- É essa dupla que o servidor confere em toda leitura e resposta: o id da
-- conversa sozinho não abre nada — quem sabe o id de outra pessoa não
-- lê a conversa dela.
--
-- Os contadores de não lidas ficam na própria conversa (não por mensagem)
-- porque só há dois lados: o cliente e a equipe.
-- =====================================================================

CREATE TABLE IF NOT EXISTS conversas (
  id                 TEXT PRIMARY KEY,
  produto            TEXT NOT NULL,
  usuario_ref        TEXT NOT NULL,
  nome               TEXT,
  email              TEXT,
  assunto            TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'aberta',   -- aberta|respondida|resolvida
  pagina             TEXT,                             -- onde o cliente estava ao abrir
  nao_lidas_staff    INTEGER NOT NULL DEFAULT 0,
  nao_lidas_usuario  INTEGER NOT NULL DEFAULT 0,
  ultima_origem      TEXT NOT NULL DEFAULT 'usuario',  -- usuario|staff
  criado_em          TEXT NOT NULL,
  atualizado_em      TEXT NOT NULL,
  alertado_em        TEXT
);
CREATE INDEX IF NOT EXISTS ix_conv_usuario ON conversas(produto, usuario_ref, atualizado_em);
CREATE INDEX IF NOT EXISTS ix_conv_status ON conversas(status, atualizado_em);

CREATE TABLE IF NOT EXISTS mensagens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id  TEXT NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  autor        TEXT NOT NULL,          -- usuario|staff
  autor_nome   TEXT,
  texto        TEXT NOT NULL,
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_msg_conversa ON mensagens(conversa_id, id);

-- (alertado_em fica no CREATE acima: guarda QUANDO avisamos, para não avisar
-- de novo a cada passada; zera quando o cliente escreve de novo.)

-- Anexos (print, foto, PDF). O binário NÃO fica aqui: `chave` aponta para o
-- disco (DATA_DIR/comunicados/anexos) ou para o bucket S3/R2, conforme o
-- driver. Apagar a conversa apaga a linha — quem apaga o binário é
-- privacidade.js, que lê `driver`+`chave` antes de remover.
CREATE TABLE IF NOT EXISTS anexos (
  id           TEXT PRIMARY KEY,
  conversa_id  TEXT NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  mensagem_id  INTEGER,
  autor        TEXT NOT NULL,
  nome         TEXT NOT NULL,
  mime         TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  driver       TEXT NOT NULL,
  chave        TEXT NOT NULL,
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_anexos_conversa ON anexos(conversa_id);
CREATE INDEX IF NOT EXISTS ix_anexos_mensagem ON anexos(mensagem_id);
