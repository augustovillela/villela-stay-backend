-- =====================================================================
-- ORIGENA — 002 contas, famílias, papéis, convites, consentimento e
-- auditoria.  É o MURO ANTES DA CASA (Fase 1 do ROADMAP): nada de domínio
-- entra antes disto estar de pé e testado.
--
-- USER ≠ PERSON (§13): aqui só existe USER, quem faz login. A pessoa
-- histórica — que pode ter morrido em 1958 e nunca ter visto um
-- computador — é a Fase 2. Confundir os dois é o erro que impede metade
-- dos ancestrais de existir no sistema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Contas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL,
  email             text NOT NULL,
  senha_hash        text NOT NULL,
  email_verificado  boolean NOT NULL DEFAULT false,
  verif_token       text,
  verif_expira_em   timestamptz,
  reset_token       text,
  reset_expira_em   timestamptz,
  -- MFA (TOTP). Segredo cifrado em repouso; obrigatório para OWNER —
  -- quem pode transferir um acervo de décadas não fica só com senha.
  mfa_segredo_cif   text,
  mfa_ativo         boolean NOT NULL DEFAULT false,
  mfa_backup_hashes text[] NOT NULL DEFAULT '{}',
  -- Invalida TODAS as sessões quando incrementado (logout global de verdade).
  sessao_versao     integer NOT NULL DEFAULT 1,
  idioma            text NOT NULL DEFAULT 'pt-BR',
  status            text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','suspenso','excluido')),
  ultimo_acesso_em  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_users_verif ON users (verif_token) WHERE verif_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_users_reset ON users (reset_token) WHERE reset_token IS NOT NULL;

-- ---------------------------------------------------------------------
-- Famílias (o workspace — unidade de cobrança, privacidade e isolamento)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS families (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                text NOT NULL,
  slug                text NOT NULL,
  sobrenomes          text[] NOT NULL DEFAULT '{}',
  -- Privacidade RESTRITIVA por padrão: o conteúdo é dado pessoal de gente
  -- que nunca aceitou termo nenhum (PRIVACY.md §1). PUBLIC nunca é padrão.
  privacidade_padrao  text NOT NULL DEFAULT 'FAMILY'
                      CHECK (privacidade_padrao IN ('PUBLIC','FAMILY','GROUP','PRIVATE')),
  status              text NOT NULL DEFAULT 'ativa'
                      CHECK (status IN ('ativa','suspensa','em_sucessao','encerrada')),
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_families_slug ON families (slug) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Vínculo pessoa-que-loga × família, com papel (§10)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS family_memberships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid NOT NULL REFERENCES families(id),
  user_id          uuid NOT NULL REFERENCES users(id),
  papel            text NOT NULL CHECK (papel IN
                   ('OWNER','ADMIN','HISTORIAN','EDITOR','CONTRIBUTOR','FAMILY_MEMBER','GUEST')),
  permissoes_extra jsonb NOT NULL DEFAULT '{}',   -- granularidade futura
  status           text NOT NULL DEFAULT 'ativo'
                   CHECK (status IN ('ativo','suspenso','removido')),
  convidado_por    uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_membership ON family_memberships (family_id, user_id)
  WHERE status <> 'removido';
CREATE INDEX IF NOT EXISTS ix_membership_user ON family_memberships (user_id) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS ix_membership_family ON family_memberships (family_id) WHERE status = 'ativo';

-- A família NUNCA fica sem dono. Regra de negócio no BANCO porque a
-- consequência de errar é perder o acesso a um acervo de décadas.
CREATE OR REPLACE FUNCTION trg_familia_sempre_com_dono() RETURNS trigger AS $$
DECLARE donos integer;
BEGIN
  IF (OLD.papel = 'OWNER' AND OLD.status = 'ativo')
     AND (TG_OP = 'DELETE' OR NEW.papel <> 'OWNER' OR NEW.status <> 'ativo') THEN
    SELECT count(*) INTO donos FROM family_memberships
      WHERE family_id = OLD.family_id AND papel = 'OWNER' AND status = 'ativo' AND id <> OLD.id;
    IF donos = 0 THEN
      RAISE EXCEPTION 'A família precisa de pelo menos um responsável (OWNER).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS familia_sempre_com_dono ON family_memberships;
CREATE TRIGGER familia_sempre_com_dono
  BEFORE UPDATE OR DELETE ON family_memberships
  FOR EACH ROW EXECUTE FUNCTION trg_familia_sempre_com_dono();

-- ---------------------------------------------------------------------
-- Convites (§51: convidado NÃO paga — a cobrança é do workspace)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id),
  email         text NOT NULL,
  papel         text NOT NULL CHECK (papel IN
                ('ADMIN','HISTORIAN','EDITOR','CONTRIBUTOR','FAMILY_MEMBER','GUEST')),
  -- guardamos o HASH do token, nunca o token: vazamento do banco não
  -- entrega acesso a família nenhuma.
  token_hash    text NOT NULL,
  mensagem      text NOT NULL DEFAULT '',
  convidado_por uuid NOT NULL REFERENCES users(id),
  expira_em     timestamptz NOT NULL,
  aceito_em     timestamptz,
  aceito_por    uuid REFERENCES users(id),
  revogado_em   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_invites_token ON invites (token_hash);
CREATE INDEX IF NOT EXISTS ix_invites_familia ON invites (family_id, created_at DESC);
-- Um convite aberto por e-mail e família (reenviar revoga o anterior).
CREATE UNIQUE INDEX IF NOT EXISTS ux_invites_aberto ON invites (family_id, lower(email))
  WHERE aceito_em IS NULL AND revogado_em IS NULL;

-- ---------------------------------------------------------------------
-- Consentimento (§71) — revogar é NOVA linha, nunca UPDATE: o histórico
-- de consentimento precisa sobreviver.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  family_id     uuid REFERENCES families(id),
  finalidade    text NOT NULL CHECK (finalidade IN
                ('termos','ia_sobre_acervo','biometria','memorial_publico','comunicacoes')),
  versao_texto  text NOT NULL DEFAULT '',
  concedido     boolean NOT NULL,
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_consents ON consents (user_id, finalidade, created_at DESC);

-- ---------------------------------------------------------------------
-- Auditoria (§65). Guarda METADADO, nunca conteúdo de família.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid,
  ator_user_id uuid,
  ator_kind   text NOT NULL DEFAULT 'user' CHECK (ator_kind IN ('user','staff','ai','system')),
  acao        text NOT NULL,
  alvo_tipo   text,
  alvo_id     uuid,
  antes       jsonb,
  depois      jsonb,
  motivo      text,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_familia ON audit_log (family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_ator ON audit_log (ator_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_acao ON audit_log (acao, created_at DESC);

-- ---------------------------------------------------------------------
-- Tentativas de login (throttle por conta e por IP)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_falhas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave      text NOT NULL,        -- 'email:<x>' ou 'ip:<x>'
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_login_falhas ON login_falhas (chave, created_at DESC);

-- =====================================================================
-- RLS — o muro que o SQLite não sabe dar (SECURITY.md T1).
--
-- Toda tabela de CONTEÚDO (escopada por família) recebe a política. Sem
-- `SET LOCAL app.family_id`, `current_setting(...,true)` devolve NULL, a
-- comparação vira NULL, e a linha não aparece: um bug de aplicação que
-- esqueça o WHERE family_id devolve ZERO linhas, não as linhas da outra
-- família.
--
-- FORCE é obrigatório: o dono da tabela (nosso `origena_app`) ignoraria
-- a política sem ele — é a pegadinha clássica de RLS.
--
-- `users`, `family_memberships` e `invites` NÃO entram: elas são
-- escopadas por USUÁRIO (é preciso listar "minhas famílias" antes de ter
-- uma família escolhida) e o escopo delas é imposto no repo, com teste.
-- =====================================================================
CREATE OR REPLACE FUNCTION aplicar_rls(nome_tabela text) RETURNS void AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', nome_tabela);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', nome_tabela);
  EXECUTE format('DROP POLICY IF EXISTS p_familia ON %I', nome_tabela);
  EXECUTE format($f$CREATE POLICY p_familia ON %I USING (
      family_id = nullif(current_setting('app.family_id', true), '')::uuid
    ) WITH CHECK (
      family_id = nullif(current_setting('app.family_id', true), '')::uuid
    )$f$, nome_tabela);
END $$ LANGUAGE plpgsql;

-- audit_log tem linhas SEM família (cadastro, login) — política própria:
-- linha global é visível, linha de família só dentro do escopo dela.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_familia ON audit_log;
CREATE POLICY p_familia ON audit_log USING (
  family_id IS NULL OR family_id = nullif(current_setting('app.family_id', true), '')::uuid
) WITH CHECK (
  family_id IS NULL OR family_id = nullif(current_setting('app.family_id', true), '')::uuid
);
