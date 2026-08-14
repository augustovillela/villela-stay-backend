-- =====================================================================
-- ORIGENA — 027 COFRE DAS CÁPSULAS (§39, decisão do Augusto 12/08/2026).
--
-- Até aqui a cápsula era cifrada com a chave do SERVIDOR. A partir do
-- cofre, a chave é de PESSOAS — e o servidor deixa de conseguir ler.
--
-- ⚠️ SENHA DO COFRE PERDIDA = CARTAS PERDIDAS PARA SEMPRE. Não existe
-- recuperação, e não pode existir: se existisse, o servidor teria como
-- abrir, e o cofre seria teatro. É o único ponto do produto com falha
-- irreversível — e é por isso que a tela precisa dizer isso antes, não
-- depois.
--
-- POR QUE PAR DE CHAVES. O Augusto lacra hoje uma cápsula que a Renata e
-- a Sofia também podem abrir — mas elas não estão presentes para digitar
-- senha. A parte PÚBLICA de cada uma fica em claro aqui; a PRIVADA vive
-- cifrada pela senha dela e só existe em claro na memória do servidor
-- durante os segundos de uma abertura.
--
-- ENVELOPE, NÃO RECIFRAGEM: o conteúdo é cifrado uma vez com uma chave
-- sorteada por cápsula; essa chave é embrulhada uma vez para cada pessoa.
-- Acrescentar ou tirar alguém reescreve ~100 bytes, nunca o acervo.
-- =====================================================================

-- A chave de cada pessoa. NÃO tem family_id: a mesma pessoa usa a mesma
-- chave em qualquer família de que participe — é dela, não da família.
CREATE TABLE IF NOT EXISTS capsule_keys (
  user_id          uuid PRIMARY KEY REFERENCES users(id),
  sal              text NOT NULL,
  publica          text NOT NULL,          -- em claro, de propósito
  privada_cifrada  text NOT NULL,          -- só a senha dela abre
  verificador      text NOT NULL,          -- confere a senha sem guardá-la
  criada_em        timestamptz NOT NULL DEFAULT now(),
  -- Trocar a senha REEMBRULHA os envelopes; não recifra conteúdo.
  atualizada_em    timestamptz NOT NULL DEFAULT now()
);

-- Um envelope por (cápsula, pessoa). A chave da cápsula, embrulhada.
CREATE TABLE IF NOT EXISTS capsule_envelopes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id),
  capsule_id  uuid NOT NULL REFERENCES time_capsules(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  efemera     text NOT NULL,               -- pública efêmera deste envelope
  pacote      text NOT NULL,               -- iv.tag.dados
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_envelope ON capsule_envelopes (capsule_id, user_id);
CREATE INDEX IF NOT EXISTS ix_envelope_pessoa ON capsule_envelopes (user_id);

SELECT aplicar_rls('capsule_envelopes');

-- Qual chave lacrou esta cápsula. `servidor` é o que existe hoje; `cofre`
-- é a nova. A coluna existe para a MIGRAÇÃO poder ser gradual e visível —
-- e para a tela saber qual promessa fazer, já que "ninguém lê, nem o dono
-- da conta" deixa de ser verdade nas do cofre.
ALTER TABLE time_capsules ADD COLUMN IF NOT EXISTS chave_modo text NOT NULL DEFAULT 'servidor'
  CHECK (chave_modo IN ('servidor', 'cofre'));
