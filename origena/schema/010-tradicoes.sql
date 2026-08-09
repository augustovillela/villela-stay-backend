-- =====================================================================
-- ORIGENA — 010 tradições, receitas, saberes e relíquias (Fase 2.1,
-- §35–38).
--
-- É o bloco de MAIOR valor emocional e MENOR custo técnico do produto: o
-- que a família quer contar não é só quem nasceu quando — é o bolo da
-- avó, a reza do Natal, a frase que o avô repetia, o anel que passou de
-- mão em mão.
--
-- TRÊS DECISÕES QUE VALEM A LEITURA:
--
-- 1. UMA TABELA `traditions` PARA AS OITO CATEGORIAS, e `recipes` como
--    ESPECIALIZAÇÃO 1:1 (só a receita tem ingrediente e preparo). Oito
--    tabelas quase iguais dariam oito telas quase iguais e oito buscas
--    para manter em sincronia.
--
-- 2. A TRANSCRIÇÃO NÃO SUBSTITUI O MANUSCRITO. `manuscrito_media_id`
--    aponta a FOTO do papel com a letra de quem escreveu — o texto
--    digitado é uma leitura dele, não o original (DOMAIN_MODEL §2.7).
--
-- 3. CUSTÓDIA É HISTÓRICO, NÃO CAMPO. Quem tem a relíquia hoje é o
--    ÚLTIMO REGISTRO ABERTO de `heirloom_custody`, não uma coluna
--    `dono_atual` — que apagaria a linha de posse a cada transferência,
--    justamente a informação que o objeto carrega. O índice parcial
--    `ux_custodia_aberta` garante no banco que o objeto não está em duas
--    mãos ao mesmo tempo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TRADIÇÕES (§35). Sempre ligada à família, e quase sempre a uma pessoa
-- ("a receita é da vovó Maria", "o saber é do vô Antônio").
--
-- `desde_*` é o trio de data imprecisa da casa: "desde os anos 40" é uma
-- resposta legítima e a mais comum. Serve para a linha do tempo e para a
-- métrica norte (§80), que exige data de qualquer precisão.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS traditions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid NOT NULL REFERENCES families(id),
  categoria      text NOT NULL CHECK (categoria IN
                 ('RECEITA','CELEBRACAO','MUSICA','EXPRESSAO','SABER','RELIQUIA','LUGAR','HISTORIA')),
  titulo         text NOT NULL,
  corpo          text NOT NULL DEFAULT '',
  person_id      uuid REFERENCES persons(id),      -- de quem é
  origem         text NOT NULL DEFAULT '',         -- "veio da família da bisavó, em Portugal"
  ocasioes       text[] NOT NULL DEFAULT '{}',     -- Natal, aniversário, festa junina…
  desde_valor    text, desde_precisao text NOT NULL DEFAULT 'ANO',
  desde_ini      date, desde_fim date,
  local_texto    text NOT NULL DEFAULT '',
  capa_media_id  uuid REFERENCES media(id),
  privacidade    text NOT NULL DEFAULT 'FAMILY'
                 CHECK (privacidade IN ('PUBLIC','FAMILY','GROUP','PRIVATE')),
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX IF NOT EXISTS ix_tradicoes ON traditions (family_id, categoria, titulo)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_tradicoes_pessoa ON traditions (family_id, person_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- RECEITAS (§36) — especialização 1:1 de `traditions`.
-- `ingredientes` em jsonb porque é lista com forma variável ("2 xícaras
-- de fubá", "sal a gosto") e ninguém consulta ingrediente por coluna.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  tradition_id  uuid NOT NULL REFERENCES traditions(id),
  ingredientes  jsonb NOT NULL DEFAULT '[]',
  preparo       text NOT NULL DEFAULT '',
  rendimento    text NOT NULL DEFAULT '',
  tempo         text NOT NULL DEFAULT '',
  -- A FOTO do papel escrito à mão. O texto acima é a leitura dela.
  manuscrito_media_id uuid REFERENCES media(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_recipe_tradicao ON recipes (tradition_id);

-- Quem aprendeu a fazer. É o que mantém a receita viva depois que quem a
-- inventou morre — e a lacuna que o Historiador (§29) sabe cobrar.
CREATE TABLE IF NOT EXISTS recipe_learners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id),
  recipe_id    uuid NOT NULL REFERENCES recipes(id),
  person_id    uuid NOT NULL REFERENCES persons(id),
  aprendeu_valor text, aprendeu_precisao text NOT NULL DEFAULT 'ANO',
  aprendeu_ini date, aprendeu_fim date,
  nota         text NOT NULL DEFAULT '',
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_recipe_learner ON recipe_learners (recipe_id, person_id);

-- ---------------------------------------------------------------------
-- SABERES (§37): o que importa não é só o conhecimento — é a ARESTA DE
-- TRANSMISSÃO. "O vô ensinou o pai, que ensinou a mim" é uma corrente, e
-- é ela que vira grafo na 2.5.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tradition_transmissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id),
  tradition_id    uuid NOT NULL REFERENCES traditions(id),
  de_person_id    uuid NOT NULL REFERENCES persons(id),     -- quem ensinou
  para_person_id  uuid NOT NULL REFERENCES persons(id),     -- quem aprendeu
  quando_valor    text, quando_precisao text NOT NULL DEFAULT 'ANO',
  quando_ini      date, quando_fim date,
  nota            text NOT NULL DEFAULT '',
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transmissao_nao_reflexiva CHECK (de_person_id <> para_person_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_transmissao
  ON tradition_transmissions (tradition_id, de_person_id, para_person_id);
CREATE INDEX IF NOT EXISTS ix_transmissao_pessoa
  ON tradition_transmissions (family_id, para_person_id);

-- ---------------------------------------------------------------------
-- RELÍQUIAS (§38) — o objeto e a sua linha de posse.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS heirlooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  nome          text NOT NULL,
  descricao     text NOT NULL DEFAULT '',
  origem        text NOT NULL DEFAULT '',
  capa_media_id uuid REFERENCES media(id),
  local_texto   text NOT NULL DEFAULT '',            -- onde está / esteve
  privacidade   text NOT NULL DEFAULT 'FAMILY'
                CHECK (privacidade IN ('PUBLIC','FAMILY','GROUP','PRIVATE')),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS ix_heirlooms ON heirlooms (family_id, nome) WHERE deleted_at IS NULL;

-- Linha de custódia. Registro ABERTO (`ate_valor IS NULL`) = quem tem o
-- objeto agora. Transferir FECHA o anterior e ABRE o novo — nada é
-- sobrescrito, e a corrente inteira continua legível daqui a 50 anos.
--
-- `source_id` é a resposta a "como você sabe que estava com ela?": a
-- mesma proveniência do resto do sistema, não um campo de texto solto.
CREATE TABLE IF NOT EXISTS heirloom_custody (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id),
  heirloom_id  uuid NOT NULL REFERENCES heirlooms(id),
  person_id    uuid NOT NULL REFERENCES persons(id),
  de_valor     text, de_precisao text NOT NULL DEFAULT 'ANO',
  de_ini       date, de_fim date,
  ate_valor    text, ate_precisao text NOT NULL DEFAULT 'ANO',
  ate_ini      date, ate_fim date,
  nota         text NOT NULL DEFAULT '',
  source_id    uuid REFERENCES sources(id),
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- No banco, não só no código: um objeto não está em duas mãos ao mesmo tempo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_custodia_aberta
  ON heirloom_custody (heirloom_id) WHERE ate_valor IS NULL;
CREATE INDEX IF NOT EXISTS ix_custodia_ordem ON heirloom_custody (heirloom_id, de_ini NULLS FIRST);
CREATE INDEX IF NOT EXISTS ix_custodia_pessoa ON heirloom_custody (family_id, person_id);

-- ---------------------------------------------------------------------
-- Os CHECKs que já previam receita e relíquia agora precisam prever a
-- TRADIÇÃO genérica (celebração, música, expressão, saber). Alterar um
-- CHECK é aditivo — nenhuma linha existente deixa de valer.
-- ---------------------------------------------------------------------
ALTER TABLE busca DROP CONSTRAINT IF EXISTS busca_ref_tipo_check;
ALTER TABLE busca ADD CONSTRAINT busca_ref_tipo_check CHECK (ref_tipo IN
  ('person','media','story','contribution','document','recipe','heirloom','event','tradition'));

ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_alvo_tipo_check;
ALTER TABLE contributions ADD CONSTRAINT contributions_alvo_tipo_check CHECK (alvo_tipo IN
  ('person','media','story','recipe','heirloom','family','event','tradition'));

ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_sujeito_tipo_check;
ALTER TABLE claims ADD CONSTRAINT claims_sujeito_tipo_check CHECK (sujeito_tipo IN
  ('person','media','event','place','relationship','heirloom','recipe','tradition'));

SELECT aplicar_rls('traditions');
SELECT aplicar_rls('recipes');
SELECT aplicar_rls('recipe_learners');
SELECT aplicar_rls('tradition_transmissions');
SELECT aplicar_rls('heirlooms');
SELECT aplicar_rls('heirloom_custody');
