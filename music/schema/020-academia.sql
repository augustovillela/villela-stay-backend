-- =====================================================================
-- Musique — FASE 1, Academia Musical: exercícios, avaliação, progresso,
-- tarefas e contestação.
--
-- Arquivo separado de propósito (padrão do origena/schema/): o schema
-- cresce por FASE, e ninguém precisa reler as fundações para entender o
-- que a Fase 1 acrescentou.
--
-- ⚠️ Tabela NOVA entra aqui (`CREATE TABLE IF NOT EXISTS` é idempotente).
-- ALTER de tabela que já existe vai para MIGRACOES em db.js — schema roda
-- ANTES das migrações, e índice sobre coluna que ainda não existe aborta
-- o schema inteiro e o módulo não monta.
-- =====================================================================

-- ---- TRILHAS: sequências curadas de exercícios ----
-- O catálogo curado vive em `trilhas-catalogo.js` e é semeado por upsert.
-- A tabela existe para o progresso ter onde se pendurar e para o professor
-- criar as dele.
CREATE TABLE IF NOT EXISTS trilhas (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  titulo         TEXT NOT NULL,
  descricao      TEXT NOT NULL DEFAULT '',
  instrumento    TEXT NOT NULL DEFAULT 'geral',
  nivel          INTEGER NOT NULL DEFAULT 1,
  objetivo       TEXT NOT NULL DEFAULT '',
  origem         TEXT NOT NULL DEFAULT 'sistema',   -- sistema | professor
  criado_por     TEXT NOT NULL DEFAULT '',
  organizacao_id TEXT NOT NULL DEFAULT '',
  publicada      INTEGER NOT NULL DEFAULT 1,
  ordem          INTEGER NOT NULL DEFAULT 0,
  criado_em      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS trilha_itens (
  id         TEXT PRIMARY KEY,
  trilha_id  TEXT NOT NULL REFERENCES trilhas(id),
  ordem      INTEGER NOT NULL DEFAULT 0,
  tipo       TEXT NOT NULL,                    -- id do catálogo de curriculo.js
  nivel      INTEGER NOT NULL DEFAULT 1,
  quantidade INTEGER NOT NULL DEFAULT 5,       -- itens por sessão
  titulo     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_trilha_itens ON trilha_itens(trilha_id, ordem);

-- ---- TENTATIVAS ----
-- `medida`, `criterio` e `tolerancia` ficam GRAVADOS junto com a resposta.
-- Sem isso, uma contestação de nota meses depois não teria como ser
-- conferida: o gerador pode ter mudado, e o critério da época seria
-- irrecuperável. Guardar o critério é o que torna a nota contestável.
CREATE TABLE IF NOT EXISTS tentativas (
  id           TEXT PRIMARY KEY,
  usuario      TEXT NOT NULL,
  tipo         TEXT NOT NULL,
  familia      TEXT NOT NULL DEFAULT '',
  nivel        INTEGER NOT NULL DEFAULT 1,
  semente      TEXT NOT NULL DEFAULT '',
  modo         TEXT NOT NULL DEFAULT '',
  enunciado    TEXT NOT NULL DEFAULT '',
  esperado     TEXT NOT NULL DEFAULT '{}',
  resposta     TEXT NOT NULL DEFAULT '{}',
  acerto       INTEGER NOT NULL DEFAULT 0,
  confianca    REAL NOT NULL DEFAULT 0,
  vale_nota    INTEGER NOT NULL DEFAULT 0,
  medida       TEXT NOT NULL DEFAULT '{}',
  criterio     TEXT NOT NULL DEFAULT '',
  tolerancia   TEXT NOT NULL DEFAULT '{}',
  explicacao   TEXT NOT NULL DEFAULT '',
  ressalvas    TEXT NOT NULL DEFAULT '[]',
  sessao_id    TEXT NOT NULL DEFAULT '',
  trilha_id    TEXT NOT NULL DEFAULT '',
  ms_gasto     INTEGER NOT NULL DEFAULT 0,
  criado_em    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_tentativas_usuario ON tentativas(usuario, criado_em);
CREATE INDEX IF NOT EXISTS ix_tentativas_familia ON tentativas(usuario, familia, criado_em);

-- ---- REPETIÇÃO ESPAÇADA ----
-- Por (usuário, família) — NÃO por item. O item é gerado e nunca se
-- repete igual; o que se revisa é a habilidade.
CREATE TABLE IF NOT EXISTS agenda_revisao (
  usuario          TEXT NOT NULL,
  familia          TEXT NOT NULL,
  nivel            INTEGER NOT NULL DEFAULT 1,
  acertos_seguidos INTEGER NOT NULL DEFAULT 0,
  intervalo_dias   INTEGER NOT NULL DEFAULT 0,
  facilidade       REAL NOT NULL DEFAULT 2.5,
  revisar_em       TEXT NOT NULL DEFAULT '',
  atualizado_em    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, familia)
);
CREATE INDEX IF NOT EXISTS ix_revisao_quando ON agenda_revisao(usuario, revisar_em);

-- ---- SESSÕES DE PRÁTICA (diário de estudo) ----
CREATE TABLE IF NOT EXISTS sessoes_pratica (
  id           TEXT PRIMARY KEY,
  usuario      TEXT NOT NULL,
  trilha_id    TEXT NOT NULL DEFAULT '',
  meta         TEXT NOT NULL DEFAULT '',
  itens        INTEGER NOT NULL DEFAULT 0,
  acertos      INTEGER NOT NULL DEFAULT 0,
  ms_total     INTEGER NOT NULL DEFAULT 0,
  anotacao     TEXT NOT NULL DEFAULT '',
  iniciada_em  TEXT NOT NULL DEFAULT '',
  encerrada_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_sessoes_usuario ON sessoes_pratica(usuario, iniciada_em);

-- ---- PROGRESSO POR TRILHA ----
CREATE TABLE IF NOT EXISTS progresso_trilha (
  usuario       TEXT NOT NULL,
  trilha_id     TEXT NOT NULL,
  item_atual    INTEGER NOT NULL DEFAULT 0,
  concluida_em  TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, trilha_id)
);

-- ---- TAREFA → SUBMISSÃO → FEEDBACK E NOTA ----
-- O vínculo professor↔aluno da Fase 1 É a tarefa: o professor enxerga a
-- submissão enquanto a tarefa está ativa. Arquivar encerra o acesso —
-- permissão é do VÍNCULO, não da pessoa (PAPEIS-E-JORNADAS §3.2).
CREATE TABLE IF NOT EXISTS tarefas (
  id             TEXT PRIMARY KEY,
  professor      TEXT NOT NULL,
  titulo         TEXT NOT NULL,
  descricao      TEXT NOT NULL DEFAULT '',
  instrucoes     TEXT NOT NULL DEFAULT '',
  exige_audio    INTEGER NOT NULL DEFAULT 1,
  nota_maxima    REAL NOT NULL DEFAULT 10,
  prazo          TEXT NOT NULL DEFAULT '',
  organizacao_id TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'ativa',      -- ativa | arquivada
  criado_em      TEXT NOT NULL DEFAULT '',
  atualizado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_tarefas_professor ON tarefas(professor, status);

CREATE TABLE IF NOT EXISTS tarefa_alunos (
  tarefa_id    TEXT NOT NULL REFERENCES tarefas(id),
  aluno        TEXT NOT NULL,
  atribuida_em TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tarefa_id, aluno)
);
CREATE INDEX IF NOT EXISTS ix_tarefa_alunos_aluno ON tarefa_alunos(aluno);

CREATE TABLE IF NOT EXISTS submissoes (
  id            TEXT PRIMARY KEY,
  tarefa_id     TEXT NOT NULL REFERENCES tarefas(id),
  aluno         TEXT NOT NULL,
  texto         TEXT NOT NULL DEFAULT '',
  media_id      TEXT NOT NULL DEFAULT '',
  -- enviada | avaliada | devolvida (professor pediu para refazer)
  status        TEXT NOT NULL DEFAULT 'enviada',
  enviada_em    TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_submissoes_tarefa ON submissoes(tarefa_id, status);
CREATE INDEX IF NOT EXISTS ix_submissoes_aluno ON submissoes(aluno, enviada_em);

-- A NOTA é sempre de um humano nesta fase (decisão Q5). `nota` é o que o
-- professor deu; `indicacao_sistema` é o que a medida automática sugeriu.
-- Ficam em colunas SEPARADAS de propósito: no dia em que a indicação
-- virar nota sozinha, isso terá de ser uma decisão explícita, não um
-- efeito colateral de os dois números morarem no mesmo lugar.
CREATE TABLE IF NOT EXISTS feedbacks (
  id                TEXT PRIMARY KEY,
  submissao_id      TEXT NOT NULL REFERENCES submissoes(id),
  autor             TEXT NOT NULL,
  texto             TEXT NOT NULL DEFAULT '',
  audio_media_id    TEXT NOT NULL DEFAULT '',
  nota              REAL,
  origem            TEXT NOT NULL DEFAULT 'professor',   -- professor | revisao
  indicacao_sistema TEXT NOT NULL DEFAULT '{}',
  criado_em         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_feedbacks_submissao ON feedbacks(submissao_id, criado_em);

-- ---- CONTESTAÇÃO ----
-- Existe porque a matriz de papéis promete revisão da nota. Promessa de
-- revisão sem porta para pedir revisão é promessa que o produto não cumpre.
CREATE TABLE IF NOT EXISTS contestacoes (
  id           TEXT PRIMARY KEY,
  tentativa_id TEXT NOT NULL DEFAULT '',
  submissao_id TEXT NOT NULL DEFAULT '',
  aluno        TEXT NOT NULL,
  motivo       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'aberta',        -- aberta | acolhida | mantida
  resposta     TEXT NOT NULL DEFAULT '',
  revisor      TEXT NOT NULL DEFAULT '',
  criado_em    TEXT NOT NULL DEFAULT '',
  resolvido_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_contestacoes_status ON contestacoes(status, criado_em);
CREATE INDEX IF NOT EXISTS ix_contestacoes_aluno ON contestacoes(aluno, criado_em);
