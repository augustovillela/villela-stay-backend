-- =====================================================================
-- ORIGENA — 026: a volta do acervo deixa de passar pelo corpo da requisição.
--
-- O DEFEITO QUE ISTO CORRIGE. A Origena exportava um acervo que ela mesma
-- não conseguia reimportar: a importação chegava no corpo JSON, e o
-- servidor aceita 15 MB. O `dados.json` de uma família de verdade passa
-- disso — então a promessa de "leve seu acervo quando quiser" valia só
-- para famílias pequenas, e o dono só descobriria no dia em que
-- precisasse voltar.
--
-- A exportação já resolvia isso do jeito certo (R2 + job). A importação
-- passa a fazer o mesmo caminho, ao contrário: o zip sobe direto ao R2
-- por URL assinada, e o WORKER lê. O processo web nunca segura o arquivo.
-- =====================================================================

CREATE TABLE IF NOT EXISTS imports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id),
  status      text NOT NULL DEFAULT 'aguardando'
              CHECK (status IN ('aguardando','na_fila','importando','pronto','falhou')),
  storage_key text NOT NULL DEFAULT '',
  bytes       bigint NOT NULL DEFAULT 0,
  -- o que ENTROU, tabela a tabela. Contagem, nunca conteúdo.
  resultado   jsonb NOT NULL DEFAULT '{}',
  erro        text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_imports ON imports (family_id, created_at DESC);
SELECT aplicar_rls('imports');
