-- =====================================================================
-- ORIGENA — 024 Guardiões do Legado (fase 3.3b, §40): sucessão digital.
--
-- A REGRA QUE MANDA NESTE ARQUIVO: **nada automático**. Transferir o
-- acervo de uma família porque um sistema "concluiu" que alguém morreu é
-- o pior erro que este produto pode cometer — e o único jeito de nunca
-- cometê-lo é não ter esse caminho no código.
--
-- Por isso a sucessão tem QUATRO barreiras em série, e cada uma pode
-- parar tudo sozinha:
--   1. QUÓRUM de guardiões confirmando (voto por voto, com nome no
--      audit_log);
--   2. UM ÚNICO "contesta" derruba o pedido — não é maioria. Se um
--      guardião diz "ela está viva", nenhuma contagem vence isso;
--   3. REVISÃO HUMANA da plataforma, com motivo registrado;
--   4. JANELA DE CONTESTAÇÃO antes de valer, com aviso por e-mail
--      PARA A PRÓPRIA PESSOA. Se alguém falsificar a morte de alguém,
--      a vítima recebe um e-mail e tem dias para derrubar o pedido.
--
-- E o efeito é ADITIVO: os guardiões viram OWNER, e ninguém é removido,
-- nada é apagado. Sucessão errada tem de ser reversível; sucessão que
-- apaga o titular não é.
--
-- O QUE NÃO É MEU PARA DECIDIR: o que conta como prova de óbito no
-- Brasil e quanto tempo de contestação é razoável. Isso é do advogado
-- (PENDENCIAS §8). Por isso são PARÂMETROS em `config`, não números
-- escondidos no código.
-- =====================================================================

CREATE TABLE IF NOT EXISTS legacy_guardians (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id),
  email        text NOT NULL,
  nome         text NOT NULL DEFAULT '',
  user_id      uuid REFERENCES users(id),          -- preenchido ao aceitar
  status       text NOT NULL DEFAULT 'convidado'
               CHECK (status IN ('convidado','ativo','recusou','removido')),
  indicado_por uuid REFERENCES users(id),
  aceito_em    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_guardiao_email
  ON legacy_guardians (family_id, lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS succession_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  sobre_user_id uuid NOT NULL REFERENCES users(id),   -- de quem é o acervo
  motivo        text NOT NULL CHECK (motivo IN ('FALECIMENTO','INCAPACIDADE')),
  documento_media_id uuid REFERENCES media(id),
  aberta_por    uuid NOT NULL REFERENCES users(id),
  status        text NOT NULL DEFAULT 'aguardando_quorum' CHECK (status IN
                ('aguardando_quorum','aguardando_revisao','em_contestacao',
                 'efetivada','recusada','contestada','cancelada')),
  quorum_necessario smallint NOT NULL DEFAULT 2,
  revisada_por  uuid REFERENCES users(id),
  revisada_em   timestamptz,
  nota_revisao  text NOT NULL DEFAULT '',
  contesta_ate  timestamptz,
  contestada_por uuid REFERENCES users(id),
  efetivada_em  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_sucessao_familia
  ON succession_requests (family_id, created_at DESC);
-- Um pedido aberto por vez sobre a mesma pessoa: dois pedidos paralelos
-- dividiriam o quórum e cada um pareceria legítimo sozinho.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sucessao_em_curso
  ON succession_requests (family_id, sobre_user_id)
  WHERE status IN ('aguardando_quorum','aguardando_revisao','em_contestacao');

CREATE TABLE IF NOT EXISTS succession_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id),
  request_id  uuid NOT NULL REFERENCES succession_requests(id),
  guardian_id uuid NOT NULL REFERENCES legacy_guardians(id),
  voto        text NOT NULL CHECK (voto IN ('confirma','contesta')),
  nota        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_voto_por_guardiao
  ON succession_votes (request_id, guardian_id);

SELECT aplicar_rls('legacy_guardians');
SELECT aplicar_rls('succession_requests');
SELECT aplicar_rls('succession_votes');

-- Parâmetros que são do ADVOGADO, não do código. Ficam visíveis e
-- editáveis em vez de enterrados numa constante.
INSERT INTO config (chave, valor, descricao) VALUES
  ('sucessao.dias_contestacao', '30',
   'Dias entre a aprovação e a sucessão valer. A pessoa sobre quem é o pedido recebe e-mail e pode derrubá-lo nesse prazo. Prazo razoável = pergunta jurídica.'),
  ('sucessao.quorum_minimo', '2',
   'Quantos guardiões precisam confirmar. Um único voto "contesta" derruba o pedido, independentemente do quórum.'),
  ('sucessao.exige_documento', 'sim',
   'Se o pedido exige documento anexado (certidão de óbito, laudo). O que conta como prova válida é pergunta jurídica em aberto.')
ON CONFLICT (chave) DO NOTHING;
