-- =====================================================================
-- ORIGENA — 015 Entrevistas (fase 2.4, §27/§28).
--
-- O PIPELINE DO §28 É UMA ORDEM, NÃO UMA SUGESTÃO:
--   voz → ÁUDIO ORIGINAL → transcrição → resumo → pessoas → datas →
--   lugares → eventos → claims → CONFIRMAÇÃO HUMANA.
-- Aqui entram os três primeiros elos com estado próprio; do quarto em
-- diante o caminho já existe (achados → confirmação → claim).
--
-- O ÁUDIO É O ATIVO, A TRANSCRIÇÃO É DERIVADA. A voz da avó é o que não
-- se refaz; o texto é conveniência de busca e pode ser corrigido à mão
-- quantas vezes for preciso. Por isso a resposta aponta uma `media` (o
-- original imutável, como toda mídia) e guarda o texto ao lado, com a
-- marca de quem o produziu — máquina ou gente.
--
-- ENTREVISTA NÃO É DOCUMENTO. O que sai daqui é RELATO: quando um achado
-- da transcrição virar fato, ele nasce `FAMILY_REPORTED`, nunca
-- `DOCUMENTED` — a diferença entre "a certidão registra" e "a vovó
-- contou" é o produto inteiro (§4).
-- =====================================================================

CREATE TABLE IF NOT EXISTS interviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  -- quem CONTA (pessoa do acervo) e quem CONDUZ (conta de usuário)
  person_id     uuid NOT NULL REFERENCES persons(id),
  roteiro       text NOT NULL,
  titulo        text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'em_andamento'
                CHECK (status IN ('em_andamento','concluida','arquivada')),
  privacidade   text NOT NULL DEFAULT 'FAMILY' CHECK (privacidade IN
                ('PUBLIC','FAMILY','GROUP','PRIVATE','TIME_LOCKED')),
  observacoes   text NOT NULL DEFAULT '',
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  concluida_em  timestamptz,
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS ix_entrevista_familia
  ON interviews (family_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_entrevista_pessoa
  ON interviews (person_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS interview_answers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  interview_id  uuid NOT NULL REFERENCES interviews(id),
  -- a pergunta viaja por CHAVE i18n, nunca como texto guardado: mudar a
  -- redação do roteiro amanhã não reescreve o que já foi respondido
  pergunta_chave text NOT NULL,
  pergunta_livre text NOT NULL DEFAULT '',   -- pergunta que a família inventou
  ordem         smallint NOT NULL DEFAULT 0,
  media_id      uuid REFERENCES media(id),   -- o ÁUDIO ORIGINAL
  duracao_seg   numeric(10,3),
  transcricao   text NOT NULL DEFAULT '',
  transcricao_origem text NOT NULL DEFAULT 'nenhuma'
                CHECK (transcricao_origem IN ('nenhuma','ia','humana','ia_corrigida')),
  transcricao_modelo text NOT NULL DEFAULT '',
  ai_job_id     uuid,
  contribution_id uuid REFERENCES contributions(id),
  status        text NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','gravada','transcrita','pulada')),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Transcrição sem origem declarada é texto órfão: ninguém saberia se
  -- aquilo foi a máquina que ouviu ou a família que digitou.
  CONSTRAINT transcricao_tem_origem CHECK
    (transcricao = '' OR transcricao_origem <> 'nenhuma')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_resposta
  ON interview_answers (interview_id, pergunta_chave, ordem);
CREATE INDEX IF NOT EXISTS ix_resposta_entrevista
  ON interview_answers (interview_id, ordem);

-- Capability de transcrição: a LINHA existe, DESLIGADA (ADR-0004). Ligar
-- é UPDATE na aba 🌳, sem deploy — mas só depois de (1) confirmar que a
-- conta do provedor é PAGA, porque tier gratuito costuma usar o conteúdo
-- para melhoria de produto, e (2) o parecer jurídico, porque aqui se
-- grava a voz de gente VIVA falando de terceiros (PRIVACY.md §10).
INSERT INTO provider_registry (provider, model, capability, ativo, prioridade,
  creditos, custo_estimado_centavos, margem_min_bp, notas)
VALUES ('google', 'gemini-2.5-flash', 'transcrever_audio', false, 5,
  4, 40, 3000, 'DESLIGADO: exige conta PAGA (o tier gratuito usa o conteúdo) e o parecer da Q4.')
ON CONFLICT (provider, model, capability) DO NOTHING;

-- ---------------------------------------------------------------------
-- Os ACHADOS da 2.3 passam a valer para a fala, não só para o papel. O
-- que a IA lê numa transcrição segue a MESMA fila de sugestões e a mesma
-- confirmação humana — muda só a fonte (ENTREVISTA em vez de DOCUMENTO),
-- e com ela o status do fato que nasce.
-- ---------------------------------------------------------------------
ALTER TABLE document_findings ALTER COLUMN media_id DROP NOT NULL;
ALTER TABLE document_findings ADD COLUMN IF NOT EXISTS interview_answer_id uuid
  REFERENCES interview_answers(id);
ALTER TABLE document_findings DROP CONSTRAINT IF EXISTS achado_tem_origem;
ALTER TABLE document_findings ADD CONSTRAINT achado_tem_origem CHECK
  (media_id IS NOT NULL OR interview_answer_id IS NOT NULL);

-- O índice de "não duplicar na releitura" passa a existir nas duas
-- origens (o antigo era total; vira parcial).
DROP INDEX IF EXISTS ux_achado;
CREATE UNIQUE INDEX IF NOT EXISTS ux_achado_midia
  ON document_findings (media_id, predicado, valor_norm) WHERE media_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_achado_resposta
  ON document_findings (interview_answer_id, predicado, valor_norm)
  WHERE interview_answer_id IS NOT NULL;

-- A entrevista precisa ser ENCONTRÁVEL como qualquer outra memória: sem
-- isto, a resposta transcrita ficaria guardada e invisível. CHECK aditivo.
ALTER TABLE busca DROP CONSTRAINT IF EXISTS busca_ref_tipo_check;
ALTER TABLE busca ADD CONSTRAINT busca_ref_tipo_check CHECK (ref_tipo IN
  ('person','media','story','contribution','document','recipe','heirloom','event','tradition',
   'interview'));

SELECT aplicar_rls('interviews');
SELECT aplicar_rls('interview_answers');
