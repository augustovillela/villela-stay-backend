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

-- =====================================================================
-- FASE 2 — Produtos, cursos, conteúdo, matrículas e progresso.
-- Decisão: conteúdo UNIFICADO — todo produto (curso, e-book, PDF, áudio,
-- pacote, mentoria) usa a mesma estrutura módulos→aulas→materiais; um
-- e-book é um produto com 1 aula tipo pdf. Vídeo = URL externa até a F7.
-- =====================================================================

-- ---- PRODUTOS (dono = produtor aprovado; fluxo editorial da plataforma) ----
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  producer_id     TEXT NOT NULL REFERENCES users(id),
  tipo            TEXT DEFAULT 'curso',    -- curso|ebook|pdf|audio|pacote|mentoria
  titulo          TEXT NOT NULL,
  subtitulo       TEXT DEFAULT '',
  slug            TEXT UNIQUE,
  categoria       TEXT DEFAULT '',
  descricao_curta TEXT DEFAULT '',
  descricao_longa TEXT DEFAULT '',
  capa_media_id   TEXT DEFAULT '',
  preco_centavos  INTEGER DEFAULT 0,
  preco_promo_centavos INTEGER DEFAULT 0,  -- 0 = sem promoção
  garantia_dias   INTEGER DEFAULT 7,
  status          TEXT DEFAULT 'rascunho', -- rascunho|em_revisao|aprovado|rejeitado|publicado|pausado|suspenso|removido
  motivo_status   TEXT DEFAULT '',
  tags            TEXT DEFAULT '[]',       -- JSON
  config          TEXT DEFAULT '{}',       -- JSON: {liberacao:'imediata'} (progressiva/por_data = F6+)
  criado_em       TEXT NOT NULL,
  atualizado_em   TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_products_producer ON products(producer_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- ---- MÓDULOS e AULAS ----
CREATE TABLE IF NOT EXISTS course_modules (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  titulo     TEXT NOT NULL,
  ordem      INTEGER DEFAULT 0,
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modules_product ON course_modules(product_id);

CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY,
  module_id   TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  tipo        TEXT DEFAULT 'texto',        -- video|texto|pdf|audio|arquivo|link
  conteudo    TEXT DEFAULT '',             -- texto/markdown da aula
  media_id    TEXT DEFAULT '',             -- arquivo principal (pdf/audio/arquivo)
  url_externa TEXT DEFAULT '',             -- vídeo embed (YouTube/Vimeo) ou link
  duracao_seg INTEGER DEFAULT 0,
  gratuita    INTEGER DEFAULT 0,           -- 1 = aula de degustação (aberta a logados)
  ordem       INTEGER DEFAULT 0,
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_lessons_product ON lessons(product_id);

CREATE TABLE IF NOT EXISTS lesson_materials (
  id        TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  media_id  TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_lesson ON lesson_materials(lesson_id);

-- ---- ARQUIVOS (storage privado em DATA_DIR/academy/arquivos/; NUNCA público) ----
CREATE TABLE IF NOT EXISTS media_files (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  nome          TEXT NOT NULL,             -- nome original
  mime          TEXT DEFAULT '',
  tamanho       INTEGER DEFAULT 0,
  sha256        TEXT DEFAULT '',
  file_path     TEXT NOT NULL,             -- relativo a ARQUIVOS_DIR
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media_files(owner_user_id);

-- ---- MATRÍCULAS (F2 = cortesia; F4 = compra) ----
CREATE TABLE IF NOT EXISTS enrollments (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  origem     TEXT DEFAULT 'cortesia',      -- cortesia|compra (F4)|assinatura (F6)
  status     TEXT DEFAULT 'ativa',         -- ativa|suspensa|revogada
  criado_em  TEXT NOT NULL,
  criado_por TEXT DEFAULT '',
  UNIQUE(user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_enroll_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enroll_product ON enrollments(product_id);

-- ---- PROGRESSO do aluno ----
CREATE TABLE IF NOT EXISTS student_progress (
  user_id       TEXT NOT NULL REFERENCES users(id),
  lesson_id     TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL,
  concluida     INTEGER DEFAULT 0,
  posicao_seg   INTEGER DEFAULT 0,         -- retomar áudio/vídeo de onde parou
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_user_product ON student_progress(user_id, product_id);

-- ---- LOG de acesso a arquivos (base p/ antipirataria e LGPD) ----
CREATE TABLE IF NOT EXISTS download_logs (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  quando   TEXT NOT NULL,
  user_id  TEXT DEFAULT '',
  media_id TEXT DEFAULT '',
  ip       TEXT DEFAULT ''
);

-- =====================================================================
-- FASE 3 — Marketplace público, páginas de venda, avaliações, denúncias.
-- Páginas públicas são server-rendered (SEO/OG); TODO conteúdo de
-- produtor é escapado na renderização (nunca HTML cru).
-- =====================================================================

-- ---- PÁGINA DE VENDA (seções em JSON, editadas pelo produtor) ----
CREATE TABLE IF NOT EXISTS sales_pages (
  product_id    TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  secoes        TEXT DEFAULT '{}',  -- JSON: {headline, subheadline, video_url, promessa,
                                    --  beneficios[], para_quem[], aprender[], bonus[],
                                    --  depoimentos[{nome,texto}], faq[{p,r}], garantia_texto}
  atualizado_em TEXT DEFAULT ''
);

-- ---- AVALIAÇÕES (só aluno matriculado; 1 por aluno/produto; moderável) ----
CREATE TABLE IF NOT EXISTS reviews (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  nota       INTEGER NOT NULL,     -- 1..5
  texto      TEXT DEFAULT '',
  status     TEXT DEFAULT 'publicada', -- publicada|oculta (moderação)
  criado_em  TEXT NOT NULL,
  UNIQUE(product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

-- ---- DENÚNCIAS de conteúdo (usuário logado; admin resolve) ----
CREATE TABLE IF NOT EXISTS moderation_reports (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    TEXT DEFAULT '',
  motivo     TEXT DEFAULT '',      -- direitos-autorais|enganoso|ilegal|adulto|outro
  texto      TEXT DEFAULT '',
  status     TEXT DEFAULT 'aberta',-- aberta|resolvida|descartada
  resolucao  TEXT DEFAULT '',
  criado_em  TEXT NOT NULL,
  resolvido_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON moderation_reports(status);
