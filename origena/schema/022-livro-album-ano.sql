-- =====================================================================
-- ORIGENA — 022 Origena Criar (3.2, §92): scrapbook e retrospectiva.
--
-- Os dois novos tipos de livro não trazem tabela nova: são o MESMO livro
-- — mesmo worker, mesmo R2, mesma trava de recorte — apontando para um
-- recorte diferente do acervo. O álbum aponta para um `album_id`; a
-- retrospectiva aponta para um ANO.
--
-- O CHECK de alvo existe para que um livro nunca fique órfão do que ele
-- promete ser: álbum sem álbum e retrospectiva sem ano são linhas que só
-- descobririam o problema no worker, tarde, com o job já pago.
-- =====================================================================

ALTER TABLE books ADD COLUMN IF NOT EXISTS album_id uuid REFERENCES albums(id);
ALTER TABLE books ADD COLUMN IF NOT EXISTS ano      integer;

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_tipo_check;
ALTER TABLE books ADD  CONSTRAINT books_tipo_check
  CHECK (tipo IN ('familia','pessoa','album','retrospectiva'));

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_alvo;
ALTER TABLE books ADD  CONSTRAINT books_alvo CHECK (
      (tipo <> 'pessoa'        OR person_id IS NOT NULL)
  AND (tipo <> 'album'         OR album_id  IS NOT NULL)
  AND (tipo <> 'retrospectiva' OR ano       IS NOT NULL));
