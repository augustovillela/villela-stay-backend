-- =====================================================================
-- ORIGENA — 021 Origena Criar (fase 3.2, §92): o livro da família.
--
-- O LIVRO É UMA FOTOGRAFIA DO ACERVO, TIRADA POR ALGUÉM. Duas pessoas da
-- mesma família pedem o mesmo livro e recebem livros DIFERENTES — porque
-- cada uma enxerga uma parte do acervo. Por isso a linha guarda quem
-- pediu E com que papel: o worker compõe com a permissão de quem pediu,
-- não com a de quem processa a fila, e o colofão diz isso em português.
--
-- Sem essa coluna, o caminho mais natural seria compor com o que o worker
-- alcança — que é tudo. Um livro assim vazaria o acervo inteiro num PDF
-- que a família manda por e-mail.
--
-- O PDF vive no R2 como todo binário (ADR-0003) e tem validade: livro é
-- derivado do acervo num instante, não um documento permanente. Refazer
-- é barato; guardar para sempre um retrato velho do acervo, não.
-- =====================================================================

CREATE TABLE IF NOT EXISTS books (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  tipo          text NOT NULL DEFAULT 'familia'
                CHECK (tipo IN ('familia','pessoa')),
  person_id     uuid REFERENCES persons(id),      -- quando é o livro de UMA pessoa
  titulo        text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'na_fila'
                CHECK (status IN ('na_fila','gerando','pronto','falhou')),
  -- a permissão de quem PEDIU, congelada: o worker compõe com ela
  solicitado_por uuid REFERENCES users(id),
  papel         text NOT NULL DEFAULT 'GUEST',
  storage_key   text NOT NULL DEFAULT '',
  bytes         bigint NOT NULL DEFAULT 0,
  paginas       integer NOT NULL DEFAULT 0,
  conteudo      jsonb NOT NULL DEFAULT '{}',      -- contagens, nunca o acervo
  erro          text NOT NULL DEFAULT '',
  expira_em     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_books_familia ON books (family_id, created_at DESC);

SELECT aplicar_rls('books');
