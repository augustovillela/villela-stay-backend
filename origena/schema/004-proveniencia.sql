-- =====================================================================
-- ORIGENA — 004 PROVENIÊNCIA (Fase 3). É o núcleo do produto.
--
-- O cenário do §4, que este schema existe para sustentar:
--   Maria diz que João nasceu em 1921. Carlos diz 1922. A certidão diz
--   1921. A Origena NÃO substitui isso por "João nasceu em 1921". Ela
--   guarda os três relatos, a autoria, as datas, a divergência e a
--   avaliação das evidências — e continua guardando depois de a família
--   escolher uma versão.
--
-- QUATRO ENTIDADES, DE PROPÓSITO SEPARADAS:
--   contribution — o que um ser humano disse, cru. Append-only.
--   source       — de onde a informação vem (documento, relato, IA…).
--   claim        — a afirmação estruturada (sujeito · predicado · valor).
--   evidence     — o que liga claim a source, e se SUPORTA ou CONTRADIZ.
--
-- Juntar claim e evidence numa tabela só pareceria mais simples e
-- impediria o principal: uma afirmação sustentada por várias fontes, e
-- uma fonte que contradiz.
--
-- SOBRE `DISPUTED` (§6/§17): o status de um claim é a força da evidência
-- DELE (documentado, relato, inferido…). "Estar em divergência" é
-- propriedade do GRUPO (sujeito+predicado), não de um claim isolado —
-- por isso é calculada pela view abaixo, e NÃO sobrescreve o status
-- original. Marcar o claim como DISPUTED apagaria a informação de que
-- ele é documentado, que é justamente o que decide a discussão.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CONTRIBUIÇÃO — o registro humano, cru. NUNCA é apagada porque uma
-- biografia foi gerada depois (§15). Editar cria REVISÃO; a original
-- continua consultável.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contributions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id),
  autor_user_id   uuid REFERENCES users(id),        -- quem escreveu
  autor_person_id uuid REFERENCES persons(id),      -- quem contou, se for outra pessoa
  alvo_tipo       text NOT NULL CHECK (alvo_tipo IN
                  ('person','media','story','recipe','heirloom','family','event')),
  alvo_id         uuid NOT NULL,
  tipo            text NOT NULL DEFAULT 'relato' CHECK (tipo IN
                  ('relato','correcao','identificacao','data','lugar','documento','outro')),
  corpo           text NOT NULL,
  privacidade     text NOT NULL DEFAULT 'FAMILY'
                  CHECK (privacidade IN ('PUBLIC','FAMILY','GROUP','PRIVATE')),
  status          text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','revisada','retirada')),
  revisao_de      uuid REFERENCES contributions(id),
  created_at      timestamptz NOT NULL DEFAULT now()
  -- SEM deleted_at: contribuição não se apaga por operação normal (§15).
  -- Retirar muda o status; o registro histórico permanece.
);
CREATE INDEX IF NOT EXISTS ix_contrib_alvo ON contributions (family_id, alvo_tipo, alvo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_contrib_autor ON contributions (family_id, autor_user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- FONTE — de onde veio.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id          uuid NOT NULL REFERENCES families(id),
  tipo               text NOT NULL CHECK (tipo IN
                     ('DOCUMENTO','RELATO','ENTREVISTA','MIDIA','REGISTRO_OFICIAL',
                      'PUBLICACAO','IMPORTACAO','IA')),
  titulo             text NOT NULL,
  contribution_id    uuid REFERENCES contributions(id),
  media_id           uuid,                            -- Fase 4
  interview_id       uuid,                            -- Fase 2.0
  referencia_externa text NOT NULL DEFAULT '',        -- cartório, livro, página, URL
  confiabilidade     text NOT NULL DEFAULT 'media'
                     CHECK (confiabilidade IN ('alta','media','baixa','desconhecida')),
  created_by         uuid REFERENCES users(id),
  created_by_kind    text NOT NULL DEFAULT 'user'
                     CHECK (created_by_kind IN ('user','ai','import','system')),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_sources_familia ON sources (family_id, tipo, created_at DESC);

-- ---------------------------------------------------------------------
-- CLAIM — a afirmação. NUNCA é deletada (§4).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claims (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  sujeito_tipo  text NOT NULL CHECK (sujeito_tipo IN
                ('person','media','event','place','relationship','heirloom','recipe')),
  sujeito_id    uuid NOT NULL,
  predicado     text NOT NULL,          -- nome · data_nascimento · profissao · …
  valor         text NOT NULL,
  valor_tipo    text NOT NULL DEFAULT 'texto'
                CHECK (valor_tipo IN ('texto','data','numero','person_ref','place_ref')),
  -- datas imprecisas valem aqui também (Fase 2)
  precisao      text NOT NULL DEFAULT 'EXATO' CHECK (precisao IN
                ('EXATO','DIA','MES','ANO','DECADA','CIRCA','ANTES_DE','DEPOIS_DE','ENTRE')),
  valor_ini     date, valor_fim date,
  -- Chave de comparação: é por ela que dois claims "discordam". Duas
  -- grafias do mesmo ano ("1921" e "ANO 1921") não podem virar divergência
  -- falsa, então normalizamos na aplicação e guardamos aqui.
  valor_norm    text NOT NULL,
  status        text NOT NULL CHECK (status IN
                ('DOCUMENTED','FAMILY_REPORTED','AI_INFERRED','PROBABLE','DISPUTED','UNCONFIRMED')),
  confianca     smallint CHECK (confianca IS NULL OR (confianca BETWEEN 0 AND 100)),
  created_by    uuid REFERENCES users(id),
  created_by_kind text NOT NULL CHECK (created_by_kind IN ('user','ai','import','system')),
  ai_job_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- §102/I4: a IA NUNCA cria fato confirmado. Esta é a trava mais
  -- importante do produto, e mora no BANCO — não numa revisão de código.
  CONSTRAINT ia_so_infere CHECK (created_by_kind <> 'ai' OR status = 'AI_INFERRED')
);
CREATE INDEX IF NOT EXISTS ix_claims_sujeito ON claims (family_id, sujeito_tipo, sujeito_id, predicado);
CREATE INDEX IF NOT EXISTS ix_claims_grupo ON claims (family_id, sujeito_id, predicado, valor_norm);

-- Mesma pessoa não afirma duas vezes o MESMO valor para o mesmo campo:
-- isso é ruído, não uma segunda fonte.
CREATE UNIQUE INDEX IF NOT EXISTS ux_claims_repetido
  ON claims (family_id, sujeito_id, predicado, valor_norm, created_by)
  WHERE created_by IS NOT NULL;

-- ---------------------------------------------------------------------
-- EVIDÊNCIA — liga claim a fonte, e diz de que lado ela está.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id),
  claim_id    uuid NOT NULL REFERENCES claims(id),
  source_id   uuid NOT NULL REFERENCES sources(id),
  posicao     text NOT NULL DEFAULT 'SUPORTA' CHECK (posicao IN ('SUPORTA','CONTRADIZ')),
  forca       text NOT NULL DEFAULT 'media' CHECK (forca IN ('forte','media','fraca')),
  nota        text NOT NULL DEFAULT '',
  trecho      text NOT NULL DEFAULT '',        -- citação exata do documento
  created_by  uuid REFERENCES users(id),
  created_by_kind text NOT NULL DEFAULT 'user'
              CHECK (created_by_kind IN ('user','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_evidence ON evidence (claim_id, source_id, posicao);
CREATE INDEX IF NOT EXISTS ix_evidence_claim ON evidence (claim_id);

-- ---------------------------------------------------------------------
-- RESOLUÇÃO — qual versão a família aceita HOJE.
-- Append-only: registra a escolha, JAMAIS apaga as outras. Reverter é um
-- INSERT novo, e a resolução anterior continua no histórico.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claim_resolutions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id),
  sujeito_tipo    text NOT NULL,
  sujeito_id      uuid NOT NULL,
  predicado       text NOT NULL,
  claim_aceito_id uuid NOT NULL REFERENCES claims(id),
  motivo          text NOT NULL DEFAULT '',
  decidido_por    uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_resolucao ON claim_resolutions
  (family_id, sujeito_tipo, sujeito_id, predicado, created_at DESC);

-- ---------------------------------------------------------------------
-- DIVERGÊNCIA — calculada, não gravada. Um grupo (sujeito+predicado) com
-- mais de um valor distinto está em divergência (§17).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_divergencias AS
SELECT family_id, sujeito_tipo, sujeito_id, predicado,
       count(DISTINCT valor_norm)::int AS valores_distintos,
       array_agg(DISTINCT valor) AS valores,
       count(*)::int AS total_claims
  FROM claims
 GROUP BY family_id, sujeito_tipo, sujeito_id, predicado
HAVING count(DISTINCT valor_norm) > 1;

-- Visão consolidada por grupo: o que a tela precisa para mostrar o fato,
-- o selo de status e o caminho de volta. A ordenação por força de
-- evidência decide qual valor APARECE quando ainda não houve resolução —
-- é escolha de exibição, e o selo de divergência vai junto, sempre.
CREATE OR REPLACE VIEW v_fatos AS
WITH ordenados AS (
  SELECT c.*,
         (SELECT r.claim_aceito_id FROM claim_resolutions r
           WHERE r.family_id = c.family_id AND r.sujeito_id = c.sujeito_id
             AND r.predicado = c.predicado
           ORDER BY r.created_at DESC LIMIT 1) AS aceito_id,
         row_number() OVER (
           PARTITION BY c.family_id, c.sujeito_id, c.predicado
           ORDER BY CASE c.status
                      WHEN 'DOCUMENTED' THEN 1 WHEN 'FAMILY_REPORTED' THEN 2
                      WHEN 'PROBABLE' THEN 3 WHEN 'DISPUTED' THEN 4
                      WHEN 'AI_INFERRED' THEN 5 ELSE 6 END,
                    c.created_at DESC) AS forca
    FROM claims c)
SELECT o.family_id, o.sujeito_tipo, o.sujeito_id, o.predicado,
       COALESCE(esc.id, o.id)          AS claim_id,
       COALESCE(esc.valor, o.valor)    AS valor,
       COALESCE(esc.precisao, o.precisao) AS precisao,
       COALESCE(esc.valor_ini, o.valor_ini) AS valor_ini,
       COALESCE(esc.valor_fim, o.valor_fim) AS valor_fim,
       COALESCE(esc.status, o.status)  AS status,
       (o.aceito_id IS NOT NULL)       AS resolvido,
       EXISTS (SELECT 1 FROM v_divergencias d
                WHERE d.family_id = o.family_id AND d.sujeito_id = o.sujeito_id
                  AND d.predicado = o.predicado) AS em_divergencia
  FROM ordenados o
  LEFT JOIN claims esc ON esc.id = o.aceito_id
 WHERE o.forca = 1;

SELECT aplicar_rls('contributions');
SELECT aplicar_rls('sources');
SELECT aplicar_rls('claims');
SELECT aplicar_rls('evidence');
SELECT aplicar_rls('claim_resolutions');
