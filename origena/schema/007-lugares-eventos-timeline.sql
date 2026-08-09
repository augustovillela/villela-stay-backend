-- =====================================================================
-- ORIGENA — 007 lugares, eventos e linha do tempo (Fase 6).
--
-- LUGAR PRESERVA O NOME HISTÓRICO. Cidade muda de nome ("Guanabara" não
-- vira "Rio de Janeiro" à força, §2.6 do DOMAIN_MODEL): renomear
-- acrescenta o nome antigo a `nomes_historicos`, nunca o apaga.
--
-- A TIMELINE É PROJEÇÃO, NUNCA FONTE DE VERDADE. `timeline_entries` é
-- reconstruível do zero a partir de pessoas, casamentos, eventos, fotos
-- e histórias — e o teste prova que reconstruir dá o mesmo resultado.
-- =====================================================================

CREATE TABLE IF NOT EXISTS places (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         uuid NOT NULL REFERENCES families(id),
  nome              text NOT NULL,
  nomes_historicos  text[] NOT NULL DEFAULT '{}',
  pais              text NOT NULL DEFAULT 'Brasil',
  uf                text NOT NULL DEFAULT '',
  municipio         text NOT NULL DEFAULT '',
  lat double precision, lon double precision,
  nota              text NOT NULL DEFAULT '',
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS ix_places_familia ON places (family_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  tipo          text NOT NULL DEFAULT 'outro' CHECK (tipo IN
                ('nascimento','casamento','mudanca','viagem','formatura','trabalho',
                 'reuniao','falecimento','outro')),
  titulo        text NOT NULL,
  descricao     text NOT NULL DEFAULT '',
  data_valor    text, data_precisao text NOT NULL DEFAULT 'ANO',
  data_ini      date, data_fim date,
  place_id      uuid REFERENCES places(id),
  local_texto   text NOT NULL DEFAULT '',
  privacidade   text NOT NULL DEFAULT 'FAMILY'
                CHECK (privacidade IN ('PUBLIC','FAMILY','GROUP','PRIVATE')),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS ix_events_familia ON events (family_id, data_ini) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS event_participants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id),
  event_id   uuid NOT NULL REFERENCES events(id),
  person_id  uuid NOT NULL REFERENCES persons(id),
  papel      text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_event_part ON event_participants (event_id, person_id);
CREATE INDEX IF NOT EXISTS ix_event_part_pessoa ON event_participants (family_id, person_id);

-- Projeção da linha do tempo. Cache derivado: apagar tudo e reconstruir
-- é operação normal, não perda de dado.
CREATE TABLE IF NOT EXISTS timeline_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id),
  tipo        text NOT NULL,          -- nascimento | falecimento | casamento | evento | foto | historia
  titulo      text NOT NULL,
  data_valor  text, precisao text NOT NULL DEFAULT 'ANO',
  data_ini    date, data_fim date,
  pessoas     uuid[] NOT NULL DEFAULT '{}',
  ref_tipo    text NOT NULL,
  ref_id      uuid NOT NULL,
  local_texto text NOT NULL DEFAULT '',
  privacidade text NOT NULL DEFAULT 'FAMILY',
  criado_por  uuid
);
CREATE INDEX IF NOT EXISTS ix_timeline ON timeline_entries (family_id, data_ini NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_timeline_pessoas ON timeline_entries USING gin (pessoas);

SELECT aplicar_rls('places');
SELECT aplicar_rls('events');
SELECT aplicar_rls('event_participants');
SELECT aplicar_rls('timeline_entries');
