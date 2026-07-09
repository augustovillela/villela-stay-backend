-- =====================================================================
-- Villela Academy Marketplace — FASE 1 (fundação).
-- Plataforma de cursos online e produtos digitais (marketplace multi-
-- produtor): alunos, produtores, afiliados e admin, com permissões,
-- sessões revogáveis e auditoria. Banco próprio em DATA_DIR/academy/ —
-- isolado dos demais SaaS (legal-saas/, vdocs/, vpe/, vsm/).
--
-- Convenções (iguais aos outros módulos): CREATE ... IF NOT EXISTS,
-- IDs TEXT url-safe, datas ISO-8601, dinheiro em CENTAVOS, JSON em TEXT.
-- Cursos/produtos/checkout/comissões são as FASES 2+ — ver ROADMAP.md.
-- O modelo completo (orders, payments, commissions, courses, lessons...)
-- está documentado no README §Modelo de dados; aqui só o que a FASE 1 usa.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, aplicada_em TEXT NOT NULL
);

-- ---- USUÁRIOS (conta única; papéis acumuláveis: aluno|produtor|afiliado|admin) ----
-- Todo usuário nasce aluno. Produtor/afiliado dependem de perfil APROVADO.
-- Admin da Academy é concedido pelo Portal Staff (dono da plataforma).
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,      -- sempre minúsculo
  senha_hash    TEXT DEFAULT '',
  papeis        TEXT DEFAULT '["aluno"]',  -- JSON: subconjunto de aluno|produtor|afiliado|admin
  telefone      TEXT DEFAULT '',
  status        TEXT DEFAULT 'ativo',      -- ativo|suspenso|bloqueado|excluido (anonimizado LGPD)
  consentimentos TEXT DEFAULT '{}',        -- JSON: {termos_em, privacidade_em, marketing:true|false}
  ultimo_login  TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ---- PERFIL DE PRODUTOR (onboarding com aprovação da plataforma) ----
CREATE TABLE IF NOT EXISTS producer_profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nome_publico  TEXT DEFAULT '',           -- nome/marca exibido no marketplace
  slug          TEXT UNIQUE,               -- /produtores/<slug> (FASE 3)
  tipo_pessoa   TEXT DEFAULT 'pf',         -- pf|pj
  documento     TEXT DEFAULT '',           -- CPF/CNPJ (só admin vê; nunca em página pública)
  bio           TEXT DEFAULT '',
  site          TEXT DEFAULT '',
  status        TEXT DEFAULT 'em_analise', -- em_analise|aprovado|rejeitado|suspenso|bloqueado
  motivo_status TEXT DEFAULT '',
  dados_pagamento TEXT DEFAULT '{}',       -- JSON: conta MP/banco p/ repasse (FASE 5)
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_producer_status ON producer_profiles(status);

-- ---- PERFIL DE AFILIADO (aprovação da plataforma) ----
CREATE TABLE IF NOT EXISTS affiliate_profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nome_publico  TEXT DEFAULT '',
  canais        TEXT DEFAULT '',           -- onde divulga (Instagram, YouTube, lista...)
  documento     TEXT DEFAULT '',           -- CPF/CNPJ p/ comissão (só admin vê)
  status        TEXT DEFAULT 'em_analise', -- em_analise|aprovado|rejeitado|suspenso|bloqueado
  motivo_status TEXT DEFAULT '',
  dados_pagamento TEXT DEFAULT '{}',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_affiliate_status ON affiliate_profiles(status);

-- ---- SESSÕES (revogáveis; o JWT carrega o jti e a linha manda) ----
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,             -- jti do JWT
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criada_em  TEXT NOT NULL,
  expira_em  TEXT NOT NULL,
  ip         TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  revogada   INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---- AUDITORIA (toda ação sensível; base de compliance/LGPD) ----
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quando      TEXT NOT NULL,
  quem        TEXT DEFAULT '',             -- user_id | 'staff:<nome>' | 'sistema'
  papel       TEXT DEFAULT '',
  acao        TEXT NOT NULL,               -- ex.: auth.login, perfil.produtor.aprovar
  entidade    TEXT DEFAULT '',
  entidade_id TEXT DEFAULT '',
  detalhe     TEXT DEFAULT '',
  ip          TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_quando ON audit_logs(quando);
CREATE INDEX IF NOT EXISTS idx_audit_quem ON audit_logs(quem);

-- ---- LEADS da landing (interessados em vender na plataforma) ----
CREATE TABLE IF NOT EXISTS leads (
  id        TEXT PRIMARY KEY,
  nome      TEXT DEFAULT '', email TEXT DEFAULT '', telefone TEXT DEFAULT '',
  interesse TEXT DEFAULT '',               -- produtor|afiliado|aluno|outro
  mensagem  TEXT DEFAULT '',
  status    TEXT DEFAULT 'novo',           -- novo|contatado|convertido|descartado
  criado_em TEXT NOT NULL
);

-- ---- CONFIG DA PLATAFORMA (chave-valor; comissões padrão, flags, textos) ----
CREATE TABLE IF NOT EXISTS platform_settings (
  chave         TEXT PRIMARY KEY,
  valor         TEXT DEFAULT '',           -- JSON
  atualizado_em TEXT DEFAULT ''
);
