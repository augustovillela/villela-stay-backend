-- =====================================================================
-- Voz — FASE 0, áudio. Arquivo separado (padrão do music/schema/): o
-- schema cresce por assunto, e ninguém precisa reler as fundações para
-- entender o que a transcrição acrescentou.
--
-- ⚠️ Tabela NOVA entra aqui (`CREATE TABLE IF NOT EXISTS` é idempotente).
-- ALTER de tabela que já existe vai para MIGRACOES em db.js — o schema
-- roda ANTES das migrações.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TRANSCRIÇÕES — cache por origem do áudio.
--
-- Isto NÃO é otimização: é controle de custo e de duplicidade.
-- O Make REENVIA o webhook quando a resposta demora ou falha, e cada
-- reenvio baixaria e transcreveria o MESMO áudio de novo — pagando duas
-- vezes e, pior, criando dois pedidos, porque a idempotência de `pedidos`
-- é sobre o TEXTO, que ainda não existe no momento em que o áudio chega.
--
-- A chave é a identidade da origem: o id da mídia quando há um, senão o
-- hash dos próprios bytes. Áudio idêntico reenviado = mesma linha.
--
-- O ÁUDIO NÃO É GUARDADO. Só o texto. O disco do Render é de 1 GB para
-- 15 produtos, e voz de terceiro que apareça numa gravação é dado
-- pessoal que não temos motivo para reter (regra 5 do CLAUDE.md).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transcricoes (
  chave      TEXT PRIMARY KEY,             -- id da mídia, ou sha256 dos bytes
  texto      TEXT NOT NULL DEFAULT '',
  provedor   TEXT NOT NULL DEFAULT '',
  modelo     TEXT NOT NULL DEFAULT '',
  mime       TEXT NOT NULL DEFAULT '',
  bytes      INTEGER NOT NULL DEFAULT 0,
  ms         INTEGER NOT NULL DEFAULT 0,   -- quanto demorou (orçamento de latência)
  erro       TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_transcricoes_criado ON transcricoes(criado_em DESC);
