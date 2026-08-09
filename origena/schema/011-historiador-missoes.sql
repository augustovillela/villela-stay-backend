-- =====================================================================
-- ORIGENA — 011 historiador, missões e índice de memória (Fase 2.2,
-- §29–32).
--
-- O QUE ESTE BLOCO FAZ: transforma "falta coisa no acervo" — que hoje só
-- existe na cabeça de quem olha — em LACUNA NOMEADA, PERGUNTA ENDEREÇADA
-- e ÍNDICE POR PESSOA. É a diferença entre um arquivo que espera e um
-- sistema que puxa a memória de quem ainda pode contar.
--
-- TRÊS DECISÕES:
--
-- 1. A PERGUNTA NÃO É GUARDADA EM PORTUGUÊS. `pergunta_chave` +
--    `pergunta_vars` (i18n, §86): a missão criada hoje sai em espanhol
--    para a prima em Madri, e continua legível quando o texto mudar.
--
-- 2. `missions.chave` É A IDEMPOTÊNCIA. Sincronizar as lacunas dez vezes
--    não cria dez perguntas iguais; e uma missão DISPENSADA não volta a
--    nascer, porque a chave continua ocupada. Recusar uma pergunta é uma
--    decisão da família, e decisão da família não se apaga sozinha.
--
-- 3. `memory_index` É PROJEÇÃO, como a timeline: apagar e recalcular dá o
--    mesmo resultado. E NÃO EXISTE RANKING (§31) — a tabela guarda o
--    índice DE UMA PESSOA DO ACERVO (que pode ter morrido em 1958), nunca
--    um placar entre os familiares vivos que contribuem.
-- =====================================================================

CREATE TABLE IF NOT EXISTS missions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid NOT NULL REFERENCES families(id),
  tipo           text NOT NULL,                    -- pessoa_sem_foto, foto_sem_pessoa, …
  alvo_tipo      text NOT NULL,                    -- person | media | heirloom | tradition | family
  alvo_id        uuid,
  -- a pergunta, por chave de catálogo — nunca texto pronto
  pergunta_chave text NOT NULL,
  pergunta_vars  jsonb NOT NULL DEFAULT '{}',
  -- chave de idempotência: tipo + alvo. Uma lacuna, uma pergunta.
  chave          text NOT NULL,
  peso           smallint NOT NULL DEFAULT 5,      -- ordena a fila; não é placar
  sugerido_para_user_id uuid REFERENCES users(id),
  status         text NOT NULL DEFAULT 'aberta'
                 CHECK (status IN ('aberta','respondida','resolvida','dispensada')),
  respondida_por uuid REFERENCES users(id),
  respondida_em  timestamptz,
  resposta_tipo  text,
  resposta_id    uuid,
  motivo         text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_missions_chave ON missions (family_id, chave);
CREATE INDEX IF NOT EXISTS ix_missions_abertas ON missions (family_id, status, peso DESC);

-- ---------------------------------------------------------------------
-- ÍNDICE DE MEMÓRIA (§31). `dimensoes` guarda o que foi conferido e
-- `lacunas` o que falta, POR NOME — "74%" sozinho não ajuda ninguém; o
-- valor está em "falta a voz dela e a infância".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_index (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id),
  person_id    uuid NOT NULL REFERENCES persons(id),
  score        smallint NOT NULL DEFAULT 0,
  dimensoes    jsonb NOT NULL DEFAULT '{}',
  lacunas      jsonb NOT NULL DEFAULT '[]',
  calculado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_memory_index ON memory_index (person_id);
CREATE INDEX IF NOT EXISTS ix_memory_index_familia ON memory_index (family_id);

-- ---------------------------------------------------------------------
-- NOTIFICAÇÕES (§87): OPT-IN de verdade. A linha só existe quando a
-- pessoa escolheu receber; sem linha, o padrão é `nunca`. É o contrário
-- do padrão da indústria, e é deliberado — ninguém pediu para ser
-- lembrado da morte de um parente por push.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_prefs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  evento      text NOT NULL,                       -- missoes | …
  canal       text NOT NULL DEFAULT 'email' CHECK (canal IN ('email')),
  frequencia  text NOT NULL DEFAULT 'nunca' CHECK (frequencia IN ('nunca','imediato')),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_notif_pref
  ON notification_prefs (family_id, user_id, evento, canal);

SELECT aplicar_rls('missions');
SELECT aplicar_rls('memory_index');
SELECT aplicar_rls('notification_prefs');
