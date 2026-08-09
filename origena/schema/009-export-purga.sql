-- =====================================================================
-- ORIGENA — 009 exportação, purga e integridade (Fase 8).
--
-- A EXPORTAÇÃO É A PROMESSA DO §124 EM FORMA DE ARQUIVO: a família pode
-- sair a qualquer momento levando TUDO — inclusive a proveniência. É
-- também a defesa dela contra o fim da própria Origena.
-- =====================================================================

CREATE TABLE IF NOT EXISTS exports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id),
  status      text NOT NULL DEFAULT 'na_fila'
              CHECK (status IN ('na_fila','gerando','pronto','falhou')),
  storage_key text NOT NULL DEFAULT '',
  bytes       bigint NOT NULL DEFAULT 0,
  itens       jsonb NOT NULL DEFAULT '{}',
  erro        text NOT NULL DEFAULT '',
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE INDEX IF NOT EXISTS ix_exports ON exports (family_id, created_at DESC);
SELECT aplicar_rls('exports');

-- A trava "família nunca fica sem OWNER" ganha a EXCEÇÃO da purga: uma
-- família marcada `encerrada` está sendo desmontada de propósito — o
-- fluxo de purga (LGPD/encerramento) é o único que a coloca nesse estado.
CREATE OR REPLACE FUNCTION trg_familia_sempre_com_dono() RETURNS trigger AS $$
DECLARE donos integer; st text;
BEGIN
  IF (OLD.papel = 'OWNER' AND OLD.status = 'ativo')
     AND (TG_OP = 'DELETE' OR NEW.papel <> 'OWNER' OR NEW.status <> 'ativo') THEN
    SELECT f.status INTO st FROM families f WHERE f.id = OLD.family_id;
    IF st IS DISTINCT FROM 'encerrada' THEN
      SELECT count(*) INTO donos FROM family_memberships
        WHERE family_id = OLD.family_id AND papel = 'OWNER' AND status = 'ativo' AND id <> OLD.id;
      IF donos = 0 THEN
        RAISE EXCEPTION 'A família precisa de pelo menos um responsável (OWNER).'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;
