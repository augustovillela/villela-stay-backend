-- =====================================================================
-- Villela Kids — MVP "Clube de Missões" (fase 1 do PROMPT_MASTER).
-- SQLite próprio em DATA_DIR/kids/kids.db. LGPD art. 14: a conta é SEMPRE
-- do responsável; a criança é um perfil mínimo (apelido + faixa etária +
-- emoji) sem e-mail, sem login e sem dado pessoal além do apelido.
-- O currículo (missões) mora em código curado (missoes-catalogo.js);
-- o banco guarda progresso e criações, nunca o conteúdo pedagógico.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  nome TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT ''
);

-- Responsáveis (pai/mãe/tutor). Titular da conta e do consentimento.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',            -- ativo | bloqueado | excluido
  email_verificado INTEGER NOT NULL DEFAULT 0,
  verif_token TEXT NOT NULL DEFAULT '',
  aceite_termos_em TEXT NOT NULL DEFAULT '',
  consentimento TEXT NOT NULL DEFAULT '',          -- JSON: termos, consentimento parental (art. 14 LGPD), ip
  origem TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kids_users_email ON users (lower(email));

-- Perfis de criança: dado MÍNIMO de propósito (minimização LGPD).
CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  apelido TEXT NOT NULL,                           -- como a criança quer ser chamada; nunca nome completo
  faixa TEXT NOT NULL DEFAULT '9-12',              -- 7-8 | 9-12 (calibra a linguagem do tutor)
  avatar TEXT NOT NULL DEFAULT '🙂',               -- um emoji escolhido pela criança
  status TEXT NOT NULL DEFAULT 'ativo',            -- ativo | arquivado
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_kids_children_user ON children (user_id, status);

-- Catálogo de missões (upsert no boot a partir de missoes-catalogo.js).
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,                             -- slug estável (m01-meu-assistente…)
  ordem INTEGER NOT NULL,
  emoji TEXT NOT NULL DEFAULT '⭐',
  titulo TEXT NOT NULL,
  eixo TEXT NOT NULL DEFAULT 'criar',              -- criar | pensar | comunicar | realizar
  resumo TEXT NOT NULL DEFAULT '',                 -- o convite, na voz para a criança
  produto_final TEXT NOT NULL DEFAULT '',          -- o que vai para o portfólio
  momento_familia TEXT NOT NULL DEFAULT '',        -- como a família participa no final
  ativa INTEGER NOT NULL DEFAULT 1
);

-- Progresso de cada criança em cada missão. Desbloqueio é CALCULADO
-- (missão N+1 abre quando a N conclui) — aqui só entra o que começou.
CREATE TABLE IF NOT EXISTS child_missions (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id),
  mission_id TEXT NOT NULL REFERENCES missions(id),
  status TEXT NOT NULL DEFAULT 'em_andamento',     -- em_andamento | concluida
  iniciado_em TEXT NOT NULL,
  concluido_em TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL DEFAULT '{}'                 -- JSON: estado da conversa/etapas (onda 2)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kids_cm ON child_missions (child_id, mission_id);

-- Portfólio: as criações da criança — a evidência de aprendizagem que
-- substitui nota. Visível só à própria família (e ao staff/admin).
CREATE TABLE IF NOT EXISTS portfolio (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id),
  mission_id TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'texto',              -- texto (onda 1) | imagem (onda 5, Estúdio)
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL DEFAULT '',
  arquivo TEXT NOT NULL DEFAULT '',                -- nome do PNG em DATA_DIR/kids/ilustracoes/ (tipo imagem)
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_kids_portfolio_child ON portfolio (child_id, criado_em);

-- Notificações do RESPONSÁVEL (a criança não recebe notificação — regra
-- do PROMPT_MASTER: push/aviso é canal dos pais).
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  titulo TEXT NOT NULL DEFAULT '',
  texto TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'info',
  lida_em TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_kids_notif_user ON notifications (user_id, lida_em);

-- Push web dos responsáveis (usada a partir da onda 4; schema já nasce).
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auditoria (
  id TEXT PRIMARY KEY,
  quem TEXT NOT NULL DEFAULT '',
  acao TEXT NOT NULL DEFAULT '',
  entidade TEXT NOT NULL DEFAULT '',
  entidade_id TEXT NOT NULL DEFAULT '',
  detalhe TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  quando TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL DEFAULT '{}',
  quando TEXT NOT NULL
);
