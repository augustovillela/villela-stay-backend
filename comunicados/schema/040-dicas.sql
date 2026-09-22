-- =====================================================================
-- Comunicados — DICAS ("você sabia?").
--
-- Ideia: ninguém lê manual. A cada vez que a pessoa abre o sistema, um
-- post-it mostra UMA dica que ela ainda não viu, ensinando um recurso.
-- Em algumas semanas ela conhece a plataforma sem nunca ter aberto um
-- manual — e quem quiser ler tudo de uma vez tem a aba "Dicas".
--
-- `vistas` é por PESSOA e fica no servidor (não no navegador): quem troca
-- de aparelho não recomeça do zero e não vê a mesma dica duas vezes.
-- =====================================================================

CREATE TABLE IF NOT EXISTS dicas (
  id            TEXT PRIMARY KEY,
  produto       TEXT NOT NULL,
  curso_id      TEXT NOT NULL DEFAULT '',     -- '' = vale para o sistema inteiro; senão, só para quem tem esse curso
  titulo        TEXT NOT NULL,
  corpo         TEXT NOT NULL DEFAULT '',     -- a frase de abertura
  passos        TEXT NOT NULL DEFAULT '[]',   -- JSON: ["Abra o curso", "Toque em…"]
  link_url      TEXT,
  link_rotulo   TEXT,
  ordem         INTEGER NOT NULL DEFAULT 100,
  ativa         INTEGER NOT NULL DEFAULT 1,
  origem        TEXT NOT NULL DEFAULT 'staff', -- staff|semente
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_dicas_produto ON dicas(produto, ativa, ordem);

CREATE TABLE IF NOT EXISTS dicas_vistas (
  produto      TEXT NOT NULL,
  usuario_ref  TEXT NOT NULL,
  dica_id      TEXT NOT NULL,
  visto_em     TEXT NOT NULL,
  PRIMARY KEY (produto, usuario_ref, dica_id)
);

-- Quem não quer o post-it. A aba "Dicas" continua lá para quem procurar.
CREATE TABLE IF NOT EXISTS dicas_pref (
  produto      TEXT NOT NULL,
  usuario_ref  TEXT NOT NULL,
  mostrar      INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (produto, usuario_ref)
);
