-- =====================================================================
-- ORIGENA — 005 mídia (Fase 4).
--
-- Só entra agora porque a proveniência já existe (ADR-0006): cada foto
-- que chega tem onde gravar quem enviou, quando e de onde veio. Entrasse
-- antes, o acervo nasceria mudo.
--
-- O ORIGINAL É IMUTÁVEL (§7). Não por disciplina — por trava de banco.
-- Nenhuma operação de IA, nenhum "otimizar depois", nenhum script de
-- manutenção sobrescreve o arquivo que a família confiou.
--
-- A CADEIA DE DERIVAÇÃO é uma árvore, não uma lista:
--   ORIGINAL ├── thumb-256 / thumb-1024        (ai_class=ORIGINAL)
--            └── AI_RESTORED → AI_ENHANCED → AI_GENERATED
-- Derivado é regenerável; original não é. Se um dia for preciso
-- economizar, apaga-se derivado (ADR-0008).
-- =====================================================================

CREATE TABLE IF NOT EXISTS media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  tipo          text NOT NULL CHECK (tipo IN ('FOTO','VIDEO','AUDIO','DOCUMENTO')),

  -- arquivo
  storage_key   text NOT NULL,
  sha256        text NOT NULL,
  bytes         bigint NOT NULL DEFAULT 0,
  mime_declarado text NOT NULL DEFAULT '',     -- o que o navegador DISSE
  mime_real     text NOT NULL DEFAULT '',      -- o que o worker VIU (§75)
  extensao      text NOT NULL DEFAULT '',
  nome_original text NOT NULL DEFAULT '',      -- metadado, nunca caminho
  largura int, altura int, duracao_seg numeric(10,3), paginas int,

  -- derivação (§7, §8)
  derivado_de   uuid REFERENCES media(id),
  papel         text NOT NULL DEFAULT 'ORIGINAL'
                CHECK (papel IN ('ORIGINAL','THUMB','PREVIEW','PRINT','DERIVADO')),
  ai_class      text NOT NULL DEFAULT 'ORIGINAL' CHECK (ai_class IN
                ('ORIGINAL','AI_RESTORED','AI_ENHANCED','AI_RECONSTRUCTED','AI_GENERATED')),
  ai_job_id     uuid,
  derivacao     jsonb NOT NULL DEFAULT '{}',   -- provedor, modelo, params, custo

  -- contexto (o que transforma arquivo em memória)
  titulo        text NOT NULL DEFAULT '',
  descricao     text NOT NULL DEFAULT '',
  capturada_valor    text,                     -- data imprecisa, como todo o resto
  capturada_precisao text NOT NULL DEFAULT 'ANO',
  capturada_ini date, capturada_fim date,
  capturada_claim_id uuid,
  local_texto   text NOT NULL DEFAULT '',      -- vira place_id na Fase 6
  exif          jsonb NOT NULL DEFAULT '{}',

  privacidade   text NOT NULL DEFAULT 'FAMILY' CHECK (privacidade IN
                ('PUBLIC','FAMILY','GROUP','PRIVATE','TIME_LOCKED')),
  status        text NOT NULL DEFAULT 'aguardando' CHECK (status IN
                ('aguardando','recebida','processando','pronta','falhou','quarentena')),
  erro          text NOT NULL DEFAULT '',

  created_by    uuid REFERENCES users(id),
  created_by_kind text NOT NULL DEFAULT 'user'
                CHECK (created_by_kind IN ('user','ai','import','system')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,

  -- Original nunca é conteúdo de IA. Derivado de IA sempre tem pai.
  CONSTRAINT original_sem_ia CHECK (derivado_de IS NOT NULL OR ai_class = 'ORIGINAL'),
  CONSTRAINT derivado_tem_papel CHECK (derivado_de IS NULL OR papel <> 'ORIGINAL')
);

-- DEDUPE por família, só entre ORIGINAIS: a mesma foto mandada por dois
-- parentes é UMA foto no acervo — mas os dois envios ficam registrados
-- como contribuição (§21).
CREATE UNIQUE INDEX IF NOT EXISTS ux_media_dedupe ON media (family_id, sha256)
  WHERE derivado_de IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_media_galeria ON media (family_id, tipo, capturada_ini DESC NULLS LAST, created_at DESC)
  WHERE derivado_de IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_media_derivados ON media (derivado_de) WHERE derivado_de IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_media_status ON media (family_id, status) WHERE status <> 'pronta';

-- ---------------------------------------------------------------------
-- A TRAVA (§7). Depois de `pronta`, o original não muda de arquivo nem
-- de hash. Contexto (título, data, privacidade) continua editável — o
-- que é imutável é o BYTE, não a memória em volta dele.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_original_imutavel() RETURNS trigger AS $$
BEGIN
  IF OLD.derivado_de IS NULL AND OLD.status = 'pronta'
     AND (NEW.storage_key IS DISTINCT FROM OLD.storage_key
          OR NEW.sha256 IS DISTINCT FROM OLD.sha256) THEN
    RAISE EXCEPTION 'Original é imutável (media %). Derivado se cria; original não se altera.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS original_imutavel ON media;
CREATE TRIGGER original_imutavel BEFORE UPDATE ON media
  FOR EACH ROW EXECUTE FUNCTION trg_original_imutavel();

-- ---------------------------------------------------------------------
-- QUEM APARECE AQUI (§22). Sugestão da IA NUNCA conta como identificação.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_persons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  media_id      uuid NOT NULL REFERENCES media(id),
  person_id     uuid REFERENCES persons(id),        -- nulo = rosto ainda sem nome
  bbox          jsonb,
  origem        text NOT NULL CHECK (origem IN ('MANUAL','IA_SUGERIDA','CONFIRMADA')),
  confianca     smallint,
  confirmado_por uuid REFERENCES users(id),
  confirmado_em  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- "Possivelmente João — 87%" não é João até alguém dizer que é.
  CONSTRAINT confirmacao_humana CHECK
    (origem <> 'CONFIRMADA' OR (confirmado_por IS NOT NULL AND confirmado_em IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_media_person ON media_persons (media_id, person_id)
  WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mp_pessoa ON media_persons (family_id, person_id)
  WHERE origem IN ('MANUAL','CONFIRMADA');

-- ---------------------------------------------------------------------
-- Álbuns: coleção curada. NÃO duplica mídia — referencia.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS albums (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  titulo        text NOT NULL,
  descricao     text NOT NULL DEFAULT '',
  capa_media_id uuid REFERENCES media(id),
  privacidade   text NOT NULL DEFAULT 'FAMILY'
                CHECK (privacidade IN ('PUBLIC','FAMILY','GROUP','PRIVATE')),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS ix_albums_familia ON albums (family_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS album_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id),
  album_id   uuid NOT NULL REFERENCES albums(id),
  media_id   uuid NOT NULL REFERENCES media(id),
  ordem      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_album_item ON album_items (album_id, media_id);
CREATE INDEX IF NOT EXISTS ix_album_ordem ON album_items (album_id, ordem);

SELECT aplicar_rls('media');
SELECT aplicar_rls('media_persons');
SELECT aplicar_rls('albums');
SELECT aplicar_rls('album_items');
