-- =====================================================================
-- ORIGENA — 006 documentos, histórias e busca (Fase 5).
--
-- Três coisas que só fazem sentido juntas: o documento vira texto, a
-- história vira registro versionado, e os dois viram encontráveis. Um
-- acervo que não se busca é um arquivo morto com interface bonita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Texto extraído de um documento. Fica FORA de `media` de propósito: é
-- derivado, pode ser refeito (OCR melhor amanhã) e não deve inchar a
-- linha que a galeria lê a cada rolagem.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_texts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id),
  media_id    uuid NOT NULL REFERENCES media(id),
  texto       text NOT NULL DEFAULT '',
  metodo      text NOT NULL DEFAULT '',        -- pdf | docx | txt | ocr | ...
  paginas     integer NOT NULL DEFAULT 0,
  caracteres  integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'pendente' CHECK (status IN
              ('pendente','extraido','ocr_pendente','sem_texto','falhou')),
  erro        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_doctext ON document_texts (media_id);
CREATE INDEX IF NOT EXISTS ix_doctext_status ON document_texts (family_id, status);

-- ---------------------------------------------------------------------
-- HISTÓRIAS. Versionadas (§67): editar acrescenta versão; a V1 continua
-- consultável para sempre, como a contribuição da Fase 3.
--
-- `contada_por_person_id` é QUEM contou (pode estar morto há 40 anos);
-- `autor_user_id` é quem digitou. Confundir os dois apaga a autoria real.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id),
  titulo          text NOT NULL,
  contada_por_person_id uuid REFERENCES persons(id),
  autor_user_id   uuid REFERENCES users(id),
  ocorrido_valor  text,
  ocorrido_precisao text NOT NULL DEFAULT 'ANO',
  ocorrido_ini    date, ocorrido_fim date,
  local_texto     text NOT NULL DEFAULT '',
  privacidade     text NOT NULL DEFAULT 'FAMILY'
                  CHECK (privacidade IN ('PUBLIC','FAMILY','GROUP','PRIVATE')),
  versao_atual    integer NOT NULL DEFAULT 1,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS ix_stories_familia ON stories (family_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS story_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id),
  story_id    uuid NOT NULL REFERENCES stories(id),
  versao      integer NOT NULL,
  titulo      text NOT NULL,
  corpo       text NOT NULL,
  editado_por uuid REFERENCES users(id),
  nota_edicao text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
  -- SEM deleted_at: versão de história não se apaga (§67).
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_story_versao ON story_versions (story_id, versao);
CREATE INDEX IF NOT EXISTS ix_story_versoes ON story_versions (story_id, versao DESC);

-- Quem/o que a história menciona. Vira aresta do grafo na 2.0 e já serve
-- para achar "todas as histórias em que a vovó aparece".
CREATE TABLE IF NOT EXISTS story_mentions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id),
  story_id   uuid NOT NULL REFERENCES stories(id),
  person_id  uuid REFERENCES persons(id),
  media_id   uuid REFERENCES media(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mencao_tem_alvo CHECK (person_id IS NOT NULL OR media_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mencao_pessoa ON story_mentions (story_id, person_id)
  WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mencao_midia ON story_mentions (story_id, media_id)
  WHERE media_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mencao_pessoa ON story_mentions (family_id, person_id);

-- ---------------------------------------------------------------------
-- BUSCA. Índice único para todos os tipos — a família procura "vovó
-- Pirapora", não "procurar em fotos" e depois "procurar em documentos".
--
-- O `tsv` é coluna GERADA: não existe caminho para o índice sair de
-- sincronia com o texto, porque não há passo manual de "atualizar o
-- índice". Quem escreve o registro escreve o texto; o Postgres faz o resto.
--
-- `portuguese` cuida de acento e radical: quem digita "casamento" acha
-- "casamentos", e quem digita "Jose" acha "José".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS busca (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id),
  ref_tipo    text NOT NULL CHECK (ref_tipo IN
              ('person','media','story','contribution','document','recipe','heirloom','event')),
  ref_id      uuid NOT NULL,
  titulo      text NOT NULL DEFAULT '',
  corpo       text NOT NULL DEFAULT '',
  -- filtros (§43): pessoa, data, lugar, tipo, evento, autor, fonte
  pessoas     uuid[] NOT NULL DEFAULT '{}',
  autor_id    uuid,
  data_ini    date, data_fim date,
  local_texto text NOT NULL DEFAULT '',
  privacidade text NOT NULL DEFAULT 'FAMILY',
  criado_por  uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  tsv         tsvector GENERATED ALWAYS AS (
                setweight(to_tsvector('portuguese', coalesce(titulo, '')), 'A') ||
                setweight(to_tsvector('portuguese', coalesce(local_texto, '')), 'B') ||
                setweight(to_tsvector('portuguese', coalesce(corpo, '')), 'C')
              ) STORED
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_busca_ref ON busca (family_id, ref_tipo, ref_id);
CREATE INDEX IF NOT EXISTS ix_busca_tsv ON busca USING gin (tsv);
CREATE INDEX IF NOT EXISTS ix_busca_pessoas ON busca USING gin (pessoas);
CREATE INDEX IF NOT EXISTS ix_busca_filtros ON busca (family_id, ref_tipo, data_ini);

SELECT aplicar_rls('document_texts');
SELECT aplicar_rls('stories');
SELECT aplicar_rls('story_versions');
SELECT aplicar_rls('story_mentions');
SELECT aplicar_rls('busca');
