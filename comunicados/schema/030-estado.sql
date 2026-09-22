-- =====================================================================
-- Comunicados — estado curto da central (chave/valor). Hoje só o sinal de
-- vida da ponte do WhatsApp pessoal, que roda no PC do Augusto: o servidor
-- precisa saber se ela está viva para dizer, na tela, se o canal funciona.
-- Em memória não serve: o Render reinicia e o canal "sumiria".
-- =====================================================================
CREATE TABLE IF NOT EXISTS estado (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL,
  em     TEXT NOT NULL
);
