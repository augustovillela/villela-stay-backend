-- =====================================================================
-- ORIGENA — 017 busca semântica (fim da fase 2.5, §43).
--
-- COMPLEMENTA A BUSCA TEXTUAL, NÃO A SUBSTITUI. Quem procura "Pirapora"
-- quer a palavra exata, e o `tsvector` já resolve isso melhor e de graça.
-- A semântica serve para o que a família NÃO sabe escrever: "aquela
-- história do carro velho na estrada de terra" encontra a história que
-- fala em "caminhonete atolada no caminho da fazenda". Uma responde por
-- termo, a outra por sentido; o resultado é a união, com a origem de cada
-- achado à vista.
--
-- OS TRECHOS SÃO PROJEÇÃO. `search_chunks` se refaz a partir da tabela
-- `busca` — mesma disciplina da linha do tempo e do grafo. Apagar e
-- reconstruir tem de dar o mesmo resultado; se um dia não der, o índice
-- não era derivável e o problema é outro.
--
-- PRIVACIDADE VIAJA COM O TRECHO. `privacidade` e `criado_por` são
-- copiados de `busca` para cá de propósito: o filtro roda ANTES de o
-- modelo ver qualquer coisa (§45), e sem esses campos a única forma de
-- filtrar seria um join que alguém esqueceria um dia.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS search_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  ref_tipo      text NOT NULL,
  ref_id        uuid NOT NULL,
  ordem         smallint NOT NULL DEFAULT 0,
  texto         text NOT NULL,
  -- 768 dimensões (não as 3072 do padrão do provedor): o índice cabe num
  -- banco pequeno e a perda é marginal em acervo de família. Mudar isto
  -- exige reconstruir tudo — por isso a dimensão também vive em `config`.
  embedding     vector(768),
  modelo        text NOT NULL DEFAULT '',
  privacidade   text NOT NULL DEFAULT 'FAMILY',
  criado_por    uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_chunk ON search_chunks (ref_tipo, ref_id, ordem);
CREATE INDEX IF NOT EXISTS ix_chunk_familia ON search_chunks (family_id);
-- Índice aproximado só compensa com volume; em acervo pequeno o Postgres
-- prefere varredura e o resultado é EXATO. Fica declarado para quando o
-- primeiro acervo grande chegar:
--   CREATE INDEX ix_chunk_vec ON search_chunks
--     USING hnsw (embedding vector_cosine_ops);

-- Capabilities: a de embeddings nasce LIGADA (a chave do grupo foi
-- conferida como paga em 10/08/2026) e a transcrição é LIGADA por decisão
-- do Augusto na mesma data — o parecer jurídico ficou para depois,
-- registrado como pendência com gatilho, enquanto o uso é da família dele.
INSERT INTO provider_registry (provider, model, capability, ativo, prioridade,
  creditos, custo_estimado_centavos, margem_min_bp, notas)
VALUES ('google', 'gemini-embedding-001', 'embedding', true, 5,
  0, 0, 0, 'Busca semântica: recurso do plano, NÃO cobra crédito. 768 dimensões.')
ON CONFLICT (provider, model, capability) DO UPDATE SET ativo = true;

UPDATE provider_registry SET ativo = true WHERE capability = 'transcrever_audio';

INSERT INTO config (chave, valor, descricao) VALUES
  ('embedding_dimensoes', '768', 'Dimensão do vetor. Mudar exige reconstruir search_chunks inteiro.'),
  ('embedding_trecho_max', '1200', 'Tamanho do trecho enviado ao provedor, em caracteres.')
ON CONFLICT (chave) DO NOTHING;

SELECT aplicar_rls('search_chunks');
