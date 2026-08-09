-- =====================================================================
-- ORIGENA — 014 leitura de documento pela IA (fase 2.3, §24).
--
-- ACHADO NÃO É FATO. O que a IA lê num documento entra AQUI, numa fila de
-- sugestões — não vira claim nenhum enquanto uma pessoa não disser "sim, é
-- disto que este papel fala, e é desta pessoa". É a mesma regra do
-- reconhecimento de rosto (§7): "possivelmente João — 87%" não é João.
--
-- Por que tabela própria, e não claim `AI_INFERRED` direto: um claim
-- precisa de SUJEITO, e um escaneado recém-chegado ainda não tem pessoa.
-- Guardar a sugestão sem sujeito é honesto; inventar o sujeito não é.
--
-- Aceitar um achado cria um claim DOCUMENTED — porque a fonte é o
-- documento, não a IA. A IA leu; a pessoa conferiu. Os dois ficam
-- registrados (`ai_job_id` e quem decidiu).
-- =====================================================================

CREATE TABLE IF NOT EXISTS document_findings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  media_id      uuid NOT NULL REFERENCES media(id),
  ai_job_id     uuid,
  predicado     text NOT NULL,
  valor         text NOT NULL,
  valor_norm    text NOT NULL DEFAULT '',
  -- o nome que aparece no papel; vira `person_id` só quando alguém
  -- apontar de quem se trata
  pessoa_texto  text NOT NULL DEFAULT '',
  person_id     uuid REFERENCES persons(id),
  trecho        text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'sugerido'
                CHECK (status IN ('sugerido','aceito','descartado')),
  claim_id      uuid REFERENCES claims(id),
  decidido_por  uuid REFERENCES users(id),
  decidido_em   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Aceito TEM claim; descartado nunca tem. O banco não deixa a tela
  -- mentir sobre o que aconteceu com a sugestão.
  CONSTRAINT achado_decidido CHECK (
    (status = 'aceito'    AND claim_id IS NOT NULL AND decidido_por IS NOT NULL) OR
    (status = 'descartado' AND claim_id IS NULL     AND decidido_por IS NOT NULL) OR
    (status = 'sugerido'   AND claim_id IS NULL     AND decidido_por IS NULL))
);
-- Reler o mesmo documento não duplica sugestão: a segunda leitura
-- reconhece o que já está ali (e o que a família já descartou continua
-- descartado, em vez de voltar do túmulo a cada análise).
CREATE UNIQUE INDEX IF NOT EXISTS ux_achado
  ON document_findings (media_id, predicado, valor_norm);
CREATE INDEX IF NOT EXISTS ix_achado_familia
  ON document_findings (family_id, status, created_at DESC);

-- A transcrição feita por IA é texto do MODELO, não do arquivo. O
-- `document_texts.metodo` já diz como o texto nasceu ('ia:<modelo>'), e a
-- tela precisa avisar — texto transcrito por máquina se confere.
SELECT aplicar_rls('document_findings');
