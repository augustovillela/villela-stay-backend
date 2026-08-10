-- =====================================================================
-- ORIGENA — 016 a trava do último dono também vale em LOTE.
--
-- O QUE ESTAVA ABERTO. O gatilho de linha (schema 002/009) recusa quando
-- o dono que sai é o último — e para isso ele conta os OUTROS donos. Com
-- DOIS donos e um `DELETE ... WHERE papel = 'OWNER'`, cada linha vê a
-- outra ainda viva no momento em que é checada (o gatilho é BEFORE), as
-- duas passam, e a família termina SEM DONO. Uma família sem dono é um
-- acervo de décadas sem ninguém que possa administrá-lo, restaurá-lo ou
-- exportá-lo.
--
-- Achado por um teste que falhou de forma INTERMITENTE em 09/08/2026 —
-- só quebrava quando a família de teste tinha dois donos naquele ponto.
-- Teste que às vezes passa é a pior notícia possível sobre um invariante.
--
-- A CORREÇÃO. Um gatilho de STATEMENT que, depois da operação inteira,
-- confere cada família tocada. O gatilho de linha continua onde está: ele
-- dá o erro cedo e específico; este é a rede embaixo.
--
-- Família `encerrada` continua isenta, como em 009: ali o desmonte é
-- proposital (purga, §66).
-- =====================================================================

CREATE OR REPLACE FUNCTION trg_familia_com_dono_lote() RETURNS trigger AS $$
DECLARE f record;
BEGIN
  FOR f IN SELECT DISTINCT family_id FROM antigas LOOP
    IF (SELECT status FROM families WHERE id = f.family_id) IS DISTINCT FROM 'encerrada'
       AND NOT EXISTS (SELECT 1 FROM family_memberships
                        WHERE family_id = f.family_id AND papel = 'OWNER' AND status = 'ativo') THEN
      RAISE EXCEPTION 'A família precisa de pelo menos um responsável (OWNER).'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS familia_com_dono_lote_del ON family_memberships;
CREATE TRIGGER familia_com_dono_lote_del
  AFTER DELETE ON family_memberships
  REFERENCING OLD TABLE AS antigas
  FOR EACH STATEMENT EXECUTE FUNCTION trg_familia_com_dono_lote();

DROP TRIGGER IF EXISTS familia_com_dono_lote_upd ON family_memberships;
CREATE TRIGGER familia_com_dono_lote_upd
  AFTER UPDATE ON family_memberships
  REFERENCING OLD TABLE AS antigas
  FOR EACH STATEMENT EXECUTE FUNCTION trg_familia_com_dono_lote();
