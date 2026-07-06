-- =====================================================================
-- Livraria Villela — schema SQLite (node:sqlite)
-- Todos os valores monetários em CENTAVOS (INTEGER) para evitar float.
-- Datas em ISO-8601 (TEXT). Booleans como INTEGER 0/1.
-- Cada tabela tem created_at / updated_at; status onde aplicável.
-- staff_users NÃO existe aqui: reaproveita usuarios.json do Portal Staff
-- (auth JWT já existente) + papéis da livraria (ver repo.js PAPEIS_LIVRARIA).
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------- books
CREATE TABLE IF NOT EXISTS books (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  titulo           TEXT NOT NULL,
  subtitulo        TEXT DEFAULT '',
  autor            TEXT DEFAULT 'Augusto Villela',
  descricao_curta  TEXT DEFAULT '',
  descricao_longa  TEXT DEFAULT '',
  sumario          TEXT DEFAULT '',          -- markdown/HTML simples
  categoria        TEXT DEFAULT '',
  tags             TEXT DEFAULT '[]',        -- JSON array
  publico_alvo     TEXT DEFAULT '',
  beneficios       TEXT DEFAULT '[]',        -- JSON array de strings
  bonus            TEXT DEFAULT '[]',        -- JSON array {titulo,descricao}
  depoimentos      TEXT DEFAULT '[]',        -- JSON array {nome,texto,nota}
  faq              TEXT DEFAULT '[]',        -- JSON array {pergunta,resposta}
  preco_pdf        INTEGER,                  -- centavos (NULL = não vende PDF)
  preco_impresso   INTEGER,                  -- centavos (NULL = sem impresso)
  preco_combo      INTEGER,                  -- centavos (NULL = sem combo)
  ativo            INTEGER NOT NULL DEFAULT 1,
  destaque         INTEGER NOT NULL DEFAULT 0,
  capa_url         TEXT DEFAULT '',
  seo_title        TEXT DEFAULT '',
  seo_description  TEXT DEFAULT '',
  og_image         TEXT DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_slug   ON books(slug);
CREATE INDEX IF NOT EXISTS idx_books_ativo  ON books(ativo, destaque);

-- ------------------------------------------------- book_assets (imagens extras)
CREATE TABLE IF NOT EXISTS book_assets (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  tipo        TEXT DEFAULT 'imagem',         -- imagem | amostra | video
  ordem       INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_book ON book_assets(book_id);

-- ------------------------------------------ book_files (PDF privado versionado)
-- O arquivo físico fica em DATA_DIR/livraria/pdfs/<filename> (nunca público).
CREATE TABLE IF NOT EXISTS book_files (
  id            TEXT PRIMARY KEY,
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,               -- nome no disco (opaco)
  original_name TEXT DEFAULT '',
  mime          TEXT DEFAULT 'application/pdf',
  tamanho       INTEGER DEFAULT 0,           -- bytes
  versao        INTEGER NOT NULL DEFAULT 1,
  ativo         INTEGER NOT NULL DEFAULT 1,  -- só um ativo por livro (o vigente)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_book ON book_files(book_id, ativo);

-- ------------------------------------------------------------- customers
CREATE TABLE IF NOT EXISTS customers (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  email          TEXT NOT NULL,
  whatsapp       TEXT DEFAULT '',
  doc            TEXT DEFAULT '',            -- CPF/CNPJ (dado pessoal — LGPD)
  pais           TEXT DEFAULT 'BR',
  estado         TEXT DEFAULT '',
  cidade         TEXT DEFAULT '',
  endereco       TEXT DEFAULT '{}',          -- JSON {cep,logradouro,numero,compl,bairro}
  observacoes    TEXT DEFAULT '',            -- notas internas do staff
  consentimentos TEXT DEFAULT '{}',          -- JSON {termos:true, marketing:false, em:ISO}
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- ------------------------------------------------------------- orders
CREATE TABLE IF NOT EXISTS orders (
  id                 TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL REFERENCES customers(id),
  status             TEXT NOT NULL DEFAULT 'pendente', -- pendente|pago|recusado|cancelado|reembolsado
  forma_pagamento    TEXT DEFAULT 'mercadopago',
  valor_bruto        INTEGER NOT NULL DEFAULT 0,       -- centavos, antes do cupom
  desconto           INTEGER NOT NULL DEFAULT 0,       -- centavos
  valor_total        INTEGER NOT NULL DEFAULT 0,       -- centavos, cobrado
  cupom_codigo       TEXT DEFAULT '',
  tem_pdf            INTEGER NOT NULL DEFAULT 0,
  tem_impresso       INTEGER NOT NULL DEFAULT 0,
  entrega_digital    TEXT NOT NULL DEFAULT 'pendente', -- pendente|liberado|bloqueado
  impressao_status   TEXT NOT NULL DEFAULT 'nenhum',   -- nenhum|aguardando|em_producao|enviado|entregue|cancelado
  endereco_entrega   TEXT DEFAULT '{}',                -- JSON (só p/ impresso)
  origem             TEXT DEFAULT '{}',                -- JSON {utm_source,utm_medium,utm_campaign,ref}
  nota               TEXT DEFAULT '',                  -- observação interna
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  pago_em            TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);

-- ------------------------------------------------------------- order_items
CREATE TABLE IF NOT EXISTS order_items (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  book_id        TEXT NOT NULL REFERENCES books(id),
  tipo           TEXT NOT NULL,             -- pdf|impresso|combo
  titulo_snapshot TEXT DEFAULT '',          -- título no momento da compra
  preco_unit     INTEGER NOT NULL,          -- centavos
  quantidade     INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_book  ON order_items(book_id);

-- ------------------------------------------------------------- payments
CREATE TABLE IF NOT EXISTS payments (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL DEFAULT 'mercadopago',
  provider_ref        TEXT DEFAULT '',       -- id da preference
  provider_payment_id TEXT DEFAULT '',       -- id do pagamento aprovado
  status              TEXT NOT NULL DEFAULT 'pendente', -- pendente|aprovado|recusado|cancelado|reembolsado
  valor               INTEGER NOT NULL DEFAULT 0,       -- centavos
  metodo              TEXT DEFAULT '',       -- pix|credit_card|...
  raw                 TEXT DEFAULT '{}',     -- JSON bruto do provedor
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_pid   ON payments(provider_payment_id);

-- ------------------------------------------------------ download_tokens
CREATE TABLE IF NOT EXISTS download_tokens (
  id             TEXT PRIMARY KEY,          -- o próprio token (random, opaco)
  order_id       TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  book_id        TEXT NOT NULL REFERENCES books(id),
  book_file_id   TEXT REFERENCES book_files(id),
  expires_at     TEXT NOT NULL,
  max_downloads  INTEGER NOT NULL DEFAULT 5,
  download_count INTEGER NOT NULL DEFAULT 0,
  ativo          INTEGER NOT NULL DEFAULT 1, -- staff pode bloquear (fraude/chargeback)
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_order ON download_tokens(order_id);

-- ------------------------------------------------------ download_logs
CREATE TABLE IF NOT EXISTS download_logs (
  id          TEXT PRIMARY KEY,
  token_id    TEXT NOT NULL REFERENCES download_tokens(id) ON DELETE CASCADE,
  order_id    TEXT,
  book_id     TEXT,
  ip          TEXT DEFAULT '',
  user_agent  TEXT DEFAULT '',
  resultado   TEXT DEFAULT 'ok',            -- ok|expirado|limite|bloqueado
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dlogs_token ON download_logs(token_id);

-- ------------------------------------------------------------- coupons
CREATE TABLE IF NOT EXISTS coupons (
  id                TEXT PRIMARY KEY,
  codigo            TEXT NOT NULL UNIQUE,
  tipo              TEXT NOT NULL DEFAULT 'percent', -- percent|fixo
  valor             INTEGER NOT NULL,               -- percent (0-100) ou centavos
  validade          TEXT,                            -- ISO date (NULL = sem validade)
  limite_uso        INTEGER DEFAULT 0,               -- 0 = ilimitado
  usos              INTEGER NOT NULL DEFAULT 0,
  livros_aplicaveis TEXT DEFAULT '[]',               -- JSON array de book_id ([] = todos)
  ativo             INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coupons_codigo ON coupons(codigo);

-- ------------------------------------------------------------- print_jobs
CREATE TABLE IF NOT EXISTS print_jobs (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  book_id          TEXT NOT NULL REFERENCES books(id),
  status           TEXT NOT NULL DEFAULT 'aguardando_producao',
                   -- aguardando_producao|enviado_grafica|em_producao|enviado|entregue|cancelado
  fornecedor       TEXT DEFAULT '',
  custo_impressao  INTEGER DEFAULT 0,        -- centavos
  custo_frete      INTEGER DEFAULT 0,        -- centavos
  margem           INTEGER DEFAULT 0,        -- centavos (calculado)
  rastreio         TEXT DEFAULT '',
  previsao         TEXT DEFAULT '',          -- ISO date
  observacoes      TEXT DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_print_status ON print_jobs(status);
CREATE INDEX IF NOT EXISTS idx_print_order  ON print_jobs(order_id);

-- ------------------------------------------------ webhook_events (idempotência)
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL DEFAULT 'mercadopago',
  event_id    TEXT NOT NULL,                -- id do evento/pagamento no provedor
  tipo        TEXT DEFAULT '',
  payload     TEXT DEFAULT '{}',            -- JSON
  processed   INTEGER NOT NULL DEFAULT 0,
  resultado   TEXT DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE(provider, event_id)                -- barra evento duplicado
);

-- ------------------------------------------------------------- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  staff_id    TEXT DEFAULT '',
  staff_nome  TEXT DEFAULT '',
  acao        TEXT NOT NULL,               -- livro.criar, pedido.status, link.reenviar, cliente.ver...
  entidade    TEXT DEFAULT '',
  entidade_id TEXT DEFAULT '',
  detalhe     TEXT DEFAULT '',
  ip          TEXT DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ------------------------------------------------------ notification_logs
CREATE TABLE IF NOT EXISTS notification_logs (
  id          TEXT PRIMARY KEY,
  tipo        TEXT NOT NULL,               -- email|whatsapp|webhook
  destino     TEXT DEFAULT '',
  assunto     TEXT DEFAULT '',
  order_id    TEXT,
  status      TEXT NOT NULL DEFAULT 'enviado', -- enviado|falha
  erro        TEXT DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_order ON notification_logs(order_id);
