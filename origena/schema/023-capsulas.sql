-- =====================================================================
-- ORIGENA — 023 Cápsula do Tempo (fase 3.3, §39).
--
-- UMA CÁPSULA LACRADA NÃO SE LÊ — NEM PELO DONO, NEM POR QUEM ESCREVEU.
-- O corpo vive CIFRADO nesta linha (AES-256-GCM, chave fora do banco), e
-- `privacidade.podeVer` já trata `TIME_LOCKED` como o único nível que
-- vence o OWNER. A cápsula é a primeira coisa do produto a usar isso.
--
-- O QUE É PÚBLICO É A EXISTÊNCIA, NÃO O CONTEÚDO. Título, quem escreveu e
-- quando abre ficam em claro: uma cápsula que ninguém sabe que existe é
-- uma cápsula que ninguém abre — e o objetivo dela é ser aberta.
--
-- LIMITE HONESTO: a chave é do servidor, não da família. Isso protege
-- contra vazamento do BANCO e contra a própria aplicação mostrar cedo
-- demais. NÃO protege contra quem opera a plataforma. Chave na mão da
-- família seria mais forte e traz o risco de perder o conteúdo para
-- sempre — decisão registrada em PENDENCIAS.md, não escondida aqui.
-- =====================================================================

CREATE TABLE IF NOT EXISTS time_capsules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  titulo        text NOT NULL,
  recado        text NOT NULL DEFAULT '',        -- em claro: "para quando você fizer 18"

  -- para quem
  destino       text NOT NULL DEFAULT 'FAMILIA' CHECK (destino IN ('FAMILIA','PESSOA')),
  person_id     uuid REFERENCES persons(id),

  -- quando abre. IDADE precisa da data de nascimento da pessoa: sem ela a
  -- cápsula NÃO abre e diz por quê — nunca chuta uma idade.
  condicao      text NOT NULL CHECK (condicao IN ('DATA','IDADE')),
  abre_em       timestamptz,
  abre_na_idade smallint,

  -- conteúdo
  corpo_cifrado text NOT NULL DEFAULT '',
  midias        uuid[] NOT NULL DEFAULT '{}',
  -- privacidade que cada mídia tinha antes de ser lacrada, para devolver
  -- na abertura. Sem isto, abrir a cápsula tornaria pública uma foto que
  -- era privada antes de entrar nela.
  privacidade_anterior jsonb NOT NULL DEFAULT '{}',

  status        text NOT NULL DEFAULT 'lacrada'
                CHECK (status IN ('lacrada','aberta','cancelada')),
  aberta_em     timestamptz,
  aberta_por    uuid REFERENCES users(id),

  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,

  CONSTRAINT capsula_alvo CHECK (
        (destino  <> 'PESSOA' OR person_id IS NOT NULL)
    AND (condicao <> 'DATA'   OR abre_em IS NOT NULL)
    AND (condicao <> 'IDADE'  OR (abre_na_idade IS NOT NULL AND person_id IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS ix_capsulas_familia
  ON time_capsules (family_id, created_at DESC) WHERE deleted_at IS NULL;

SELECT aplicar_rls('time_capsules');
