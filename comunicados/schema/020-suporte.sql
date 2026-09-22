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
  atualizado_em      TEXT NOT NULL
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
