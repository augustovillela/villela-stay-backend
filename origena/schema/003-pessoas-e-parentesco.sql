-- =====================================================================
-- ORIGENA — 003 pessoas e parentesco (Fase 2).
--
-- USER ≠ PERSON (§13). Uma pessoa histórica pode ter morrido em 1958 e
-- nunca ter visto um computador: ela não tem e-mail, não tem senha, não
-- faz login. Confundir as duas é o erro que impede metade dos ancestrais
-- de existir no sistema.
--
-- DATAS IMPRECISAS SÃO CIDADÃS DE PRIMEIRA CLASSE. Um sistema de memória
-- familiar que só aceita dd/mm/aaaa perde metade do acervo real: "por
-- volta de 1890", "antes da guerra", "nos anos 40". Por isso todo campo
-- de data vem em trio — valor + precisão + intervalo ordenável.
--
-- AS PROJEÇÕES (nome_exibicao, nascimento_*) são só o que a tela mostra.
-- A VERDADE vai morar em `claims` na Fase 3, e cada projeção guarda o
-- `*_claim_id` que a originou. Enquanto a Fase 3 não chega, os campos
-- ficam preenchidos direto e o claim_id nulo — a coluna já existe para
-- que a migração seja preenchimento, não reestruturação.
-- =====================================================================

CREATE TABLE IF NOT EXISTS persons (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         uuid NOT NULL REFERENCES families(id),

  -- projeções de exibição (a fonte vira claim na Fase 3)
  nome_exibicao     text NOT NULL,
  nome_claim_id     uuid,
  sobrenome         text NOT NULL DEFAULT '',      -- ajuda busca e sugestão de parentesco
  apelido           text NOT NULL DEFAULT '',

  nascimento_valor    text,
  nascimento_precisao text NOT NULL DEFAULT 'ANO',
  nascimento_ini      date,                        -- intervalo ordenável
  nascimento_fim      date,
  nascimento_claim_id uuid,

  falecimento_valor    text,
  falecimento_precisao text NOT NULL DEFAULT 'ANO',
  falecimento_ini      date,
  falecimento_fim      date,
  falecimento_claim_id uuid,

  vitalidade        text NOT NULL DEFAULT 'desconhecido'
                    CHECK (vitalidade IN ('viva','falecida','desconhecido')),
  genero            text NOT NULL DEFAULT '',      -- livre e NUNCA obrigatório
  local_nascimento  text NOT NULL DEFAULT '',      -- vira place_id na Fase 6
  profissao         text NOT NULL DEFAULT '',
  resumo            text NOT NULL DEFAULT '',

  capa_media_id     uuid,
  privacidade       text NOT NULL DEFAULT 'FAMILY'
                    CHECK (privacidade IN ('PUBLIC','FAMILY','GROUP','PRIVATE')),
  -- §73: perfil de menor tem regime próprio — nunca vai a público, nunca
  -- entra em processamento facial.
  eh_menor          boolean NOT NULL DEFAULT false,

  created_by        uuid REFERENCES users(id),
  created_by_kind   text NOT NULL DEFAULT 'user'
                    CHECK (created_by_kind IN ('user','ai','import','system')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,

  CONSTRAINT precisao_nasc CHECK (nascimento_precisao IN
    ('EXATO','DIA','MES','ANO','DECADA','CIRCA','ANTES_DE','DEPOIS_DE','ENTRE')),
  CONSTRAINT precisao_falec CHECK (falecimento_precisao IN
    ('EXATO','DIA','MES','ANO','DECADA','CIRCA','ANTES_DE','DEPOIS_DE','ENTRE')),
  -- não se morre antes de nascer (quando as duas pontas são conhecidas)
  CONSTRAINT ordem_da_vida CHECK (
    nascimento_ini IS NULL OR falecimento_fim IS NULL OR falecimento_fim >= nascimento_ini)
);
CREATE INDEX IF NOT EXISTS ix_persons_familia ON persons (family_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_persons_ordem ON persons (family_id, nascimento_ini) WHERE deleted_at IS NULL;
-- busca por nome, sem acento e sem caso (a família escreve "Jose" e "José")
CREATE INDEX IF NOT EXISTS ix_persons_busca ON persons
  USING gin (to_tsvector('portuguese', coalesce(nome_exibicao,'') || ' ' || coalesce(apelido,'')));

-- Liga uma conta de login à pessoa que ela é dentro da família.
CREATE TABLE IF NOT EXISTS person_user_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id),
  person_id  uuid NOT NULL REFERENCES persons(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Um usuário é no máximo UMA pessoa por família, e vice-versa.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pul_user ON person_user_links (family_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pul_person ON person_user_links (person_id);

-- ---------------------------------------------------------------------
-- Parentesco. Aresta TIPADA com NATUREZA e período.
--
-- Adoção NÃO substitui filiação biológica: as duas coexistem, com
-- natureza diferente. Apagar uma seria apagar história (§4).
--
-- Irmão é DERIVADO (dois filhos do mesmo pai), não declarado. A aresta
-- SIBLING_OF existe só para o caso em que não se conhece o ascendente
-- comum — é o que acontece com muita família antiga.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS relationships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id),
  -- em PARENT_OF: person_a é o ascendente, person_b o descendente.
  person_a     uuid NOT NULL REFERENCES persons(id),
  person_b     uuid NOT NULL REFERENCES persons(id),
  tipo         text NOT NULL CHECK (tipo IN
               ('PARENT_OF','SPOUSE_OF','PARTNER_OF','SIBLING_OF','GUARDIAN_OF')),
  natureza     text NOT NULL DEFAULT 'biologico' CHECK (natureza IN
               ('biologico','adotivo','socioafetivo','enteado','desconhecido')),
  inicio_valor text, inicio_precisao text NOT NULL DEFAULT 'ANO', inicio_ini date, inicio_fim date,
  fim_valor    text, fim_precisao    text NOT NULL DEFAULT 'ANO', fim_ini    date, fim_fim    date,
  claim_id     uuid,                    -- a aresta também é fato com proveniência
  nota         text NOT NULL DEFAULT '',
  created_by   uuid REFERENCES users(id),
  created_by_kind text NOT NULL DEFAULT 'user'
               CHECK (created_by_kind IN ('user','ai','import','system')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT nao_e_parente_de_si CHECK (person_a <> person_b)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rel ON relationships (family_id, person_a, person_b, tipo, natureza)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_rel_a ON relationships (family_id, person_a, tipo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_rel_b ON relationships (family_id, person_b, tipo) WHERE deleted_at IS NULL;

-- Casamento e união são SIMÉTRICOS: guardar as duas direções faria a
-- consulta divergir conforme o lado. Guardamos uma aresta só, sempre com
-- o menor uuid em person_a — assim "Ana × Bruno" e "Bruno × Ana" são a
-- MESMA linha e o índice único acima realmente impede a duplicata.
CREATE OR REPLACE FUNCTION trg_ordenar_simetrico() RETURNS trigger AS $$
DECLARE tmp uuid;
BEGIN
  IF NEW.tipo IN ('SPOUSE_OF','PARTNER_OF','SIBLING_OF') AND NEW.person_a > NEW.person_b THEN
    tmp := NEW.person_a; NEW.person_a := NEW.person_b; NEW.person_b := tmp;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ordenar_simetrico ON relationships;
CREATE TRIGGER ordenar_simetrico BEFORE INSERT OR UPDATE ON relationships
  FOR EACH ROW EXECUTE FUNCTION trg_ordenar_simetrico();

-- RLS nas duas tabelas de conteúdo desta fase.
SELECT aplicar_rls('persons');
SELECT aplicar_rls('relationships');
SELECT aplicar_rls('person_user_links');
