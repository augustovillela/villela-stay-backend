-- =====================================================================
-- ORIGENA — 019 a extensão `vector` mora em `public`, não no schema do
-- produto.
--
-- O QUE ACONTECEU. A 017 fez `CREATE EXTENSION IF NOT EXISTS vector` com
-- o `search_path` começando em `origena`, e o Postgres instalou a
-- extensão ALI. Extensão é por BANCO, não por schema: com o tipo `vector`
-- morando dentro de `origena`, qualquer outro schema do mesmo banco
-- deixou de enxergá-lo. Quem denunciou foi a suíte, ao criar seu schema
-- descartável: `type "vector" does not exist` logo após um
-- `CREATE EXTENSION` que não fez nada — porque a extensão já existia, em
-- outro lugar.
--
-- POR QUE `public`. O `search_path` de toda conexão é `<schema>, public`
-- (db.js). Em `public`, o tipo fica visível para o produto E para cada
-- schema de teste, sem depender de quem rodou a migração primeiro.
--
-- POR QUE DERRUBAR EM VEZ DE MOVER. `ALTER EXTENSION vector SET SCHEMA`
-- é recusado neste servidor ("must be owner of type vector") mesmo sendo
-- nossa a extensão. Então recriamos — e o preço é a coluna `embedding`,
-- que o CASCADE leva junto e a linha seguinte devolve. Isso é barato por
-- um motivo de desenho: `search_chunks` é PROJEÇÃO. O vetor se refaz a
-- partir de `busca`; nada de acervo mora aqui. (Na hora desta migração,
-- produção tinha 0 linhas.)
--
-- O BLOCO É CONDICIONAL de propósito: uma vez em `public`, nunca mais
-- roda. Sem essa guarda, um schema de teste derrubaria a coluna da
-- produção — extensão é do banco, e o CASCADE não conhece fronteira.
--
-- Isto NÃO edita a 017: migração aplicada não se reescreve. Corrige o
-- estado que ela deixou, que é para isso que migração serve.
-- =====================================================================

DO $$
DECLARE onde text;
BEGIN
  SELECT n.nspname INTO onde
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'vector';

  IF onde IS NOT NULL AND onde <> 'public' THEN
    EXECUTE 'DROP EXTENSION vector CASCADE';
    EXECUTE 'CREATE EXTENSION vector WITH SCHEMA public';
  END IF;
END $$;

-- Devolve a coluna que o CASCADE possa ter levado. `IF NOT EXISTS` porque
-- num banco novo a 017 já a criou e este passo é inofensivo.
ALTER TABLE search_chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
