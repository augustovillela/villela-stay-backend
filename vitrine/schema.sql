-- =====================================================================
-- Vitrine — marketplace de produtos novos e usados (venda, não aluguel).
-- SQLite próprio em DATA_DIR/vitrine/vitrine.db. Dinheiro SEMPRE em
-- centavos (INTEGER); percentuais de comissão em basis points (INTEGER,
-- 500 = 5%) para nunca haver ponto flutuante em cálculo financeiro.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  nome TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL
);

-- platform_settings: configuração viva da plataforma (comissão, prazos…)
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT ''
);

-- users + profiles (perfil embutido: bio/cidade/avatar são colunas)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  telefone TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  papel TEXT NOT NULL DEFAULT 'usuario',           -- usuario | moderador | admin
  status TEXT NOT NULL DEFAULT 'ativo',            -- ativo | bloqueado | excluido
  email_verificado INTEGER NOT NULL DEFAULT 0,
  verif_token TEXT NOT NULL DEFAULT '',
  aceite_termos_em TEXT NOT NULL DEFAULT '',
  consentimento TEXT NOT NULL DEFAULT '',
  origem TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email));

CREATE TABLE IF NOT EXISTS seller_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  loja_nome TEXT NOT NULL,
  loja_slug TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  cep_origem TEXT NOT NULL DEFAULT '',
  retirada_habilitada INTEGER NOT NULL DEFAULT 0,
  pix_tipo TEXT NOT NULL DEFAULT '',
  pix_chave TEXT NOT NULL DEFAULT '',
  mp_conectado INTEGER NOT NULL DEFAULT 0,         -- OAuth Split (fase 6)
  mp_user_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ativo',            -- ativo | suspenso
  vendas_concluidas INTEGER NOT NULL DEFAULT 0,
  nota_media REAL NOT NULL DEFAULT 0,              -- só exibição; nunca dinheiro
  num_avaliacoes INTEGER NOT NULL DEFAULT 0,
  entregas_no_prazo INTEGER NOT NULL DEFAULT 0,
  entregas_total INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  rotulo TEXT NOT NULL DEFAULT '',
  destinatario TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '',
  logradouro TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  complemento TEXT NOT NULL DEFAULT '',
  bairro TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  padrao INTEGER NOT NULL DEFAULT 0,
  excluido INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_addresses_user ON addresses (user_id, excluido);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  parent_id TEXT NOT NULL DEFAULT '',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id),
  titulo TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL DEFAULT '',
  categoria_id TEXT NOT NULL DEFAULT '',
  condicao TEXT NOT NULL DEFAULT 'usado',          -- novo | seminovo | usado
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  preco_anterior_centavos INTEGER NOT NULL DEFAULT 0,
  quantidade INTEGER NOT NULL DEFAULT 1,
  marca TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  cep_origem TEXT NOT NULL DEFAULT '',
  peso_gramas INTEGER NOT NULL DEFAULT 500,
  comp_cm INTEGER NOT NULL DEFAULT 20,
  larg_cm INTEGER NOT NULL DEFAULT 20,
  alt_cm INTEGER NOT NULL DEFAULT 10,
  defeitos TEXT NOT NULL DEFAULT '',               -- obrigatório p/ usado/seminovo
  garantia TEXT NOT NULL DEFAULT '',
  entrega_envio INTEGER NOT NULL DEFAULT 1,
  entrega_retirada INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'rascunho',         -- rascunho | aguardando_aprovacao | ativo | pausado | vendido | rejeitado | arquivado
  motivo_rejeicao TEXT NOT NULL DEFAULT '',
  vistos INTEGER NOT NULL DEFAULT 0,
  vendidos INTEGER NOT NULL DEFAULT 0,
  excluido INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_products_vitrine ON products (status, excluido, categoria_id, condicao);
CREATE INDEX IF NOT EXISTS ix_products_seller ON products (seller_id, excluido);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  url TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_images_product ON product_images (product_id, ordem);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  criado_em TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantidade INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  UNIQUE (cart_id, product_id)
);

-- Pedido: 1 vendedor por pedido (MVP). Todos os valores da composição
-- financeira são gravados no momento da compra e nunca recalculados.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'aguardando_pagamento',
  comissao_pct_bp INTEGER NOT NULL DEFAULT 0,      -- basis points vigentes na compra (500 = 5%)
  subtotal_centavos INTEGER NOT NULL DEFAULT 0,
  frete_centavos INTEGER NOT NULL DEFAULT 0,
  desconto_centavos INTEGER NOT NULL DEFAULT 0,
  comissao_centavos INTEGER NOT NULL DEFAULT 0,
  tarifa_processador_centavos INTEGER NOT NULL DEFAULT 0,
  total_centavos INTEGER NOT NULL DEFAULT 0,
  repasse_vendedor_centavos INTEGER NOT NULL DEFAULT 0,
  frete_tipo TEXT NOT NULL DEFAULT '',             -- economica | expressa | retirada
  frete_prazo_dias INTEGER NOT NULL DEFAULT 0,
  endereco_json TEXT NOT NULL DEFAULT '',          -- snapshot do endereço de entrega
  pago_em TEXT NOT NULL DEFAULT '',
  entregue_em TEXT NOT NULL DEFAULT '',
  concluido_em TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_orders_buyer ON orders (buyer_id, status);
CREATE INDEX IF NOT EXISTS ix_orders_seller ON orders (seller_id, status);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  titulo TEXT NOT NULL,                            -- snapshot (produto pode mudar depois)
  condicao TEXT NOT NULL DEFAULT '',
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  quantidade INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_order_items_order ON order_items (order_id);

-- Histórico IMUTÁVEL: o código só INSERE aqui, nunca altera nem apaga.
CREATE TABLE IF NOT EXISTS order_status_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  de TEXT NOT NULL DEFAULT '',
  para TEXT NOT NULL,
  quem TEXT NOT NULL DEFAULT '',
  papel TEXT NOT NULL DEFAULT '',                  -- comprador | vendedor | admin | sistema | webhook
  detalhe TEXT NOT NULL DEFAULT '',
  quando TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_osh_order ON order_status_history (order_id, quando);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  provedor TEXT NOT NULL DEFAULT 'simulado',       -- simulado | mercadopago-split
  provedor_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente',         -- pendente | em_analise | aprovado | recusado | reembolsado
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  tarifa_centavos INTEGER NOT NULL DEFAULT 0,
  checkout_url TEXT NOT NULL DEFAULT '',           -- init_point do Checkout Pro (mp-split)
  dados TEXT NOT NULL DEFAULT '',                  -- JSON do provedor (preference id, mp payment id…)
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_payments_order ON payments (order_id);
CREATE INDEX IF NOT EXISTS ix_payments_ref ON payments (provedor_ref);

-- Idempotência do webhook: evento_id é ÚNICO — o mesmo evento entregue
-- duas vezes é registrado uma e ignorado na segunda.
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL DEFAULT '',
  evento_id TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '',
  processado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seller_payouts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'previsto',         -- previsto | liberado | pago | cancelado
  liberado_em TEXT NOT NULL DEFAULT '',
  pago_em TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_payouts_seller ON seller_payouts (seller_id, status);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  provedor TEXT NOT NULL DEFAULT 'simulado',
  servico TEXT NOT NULL DEFAULT '',
  codigo_rastreio TEXT NOT NULL DEFAULT '',
  url_rastreio TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aguardando_postagem',
  postado_em TEXT NOT NULL DEFAULT '',
  previsao_entrega TEXT NOT NULL DEFAULT '',
  entregue_em TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tracking_events (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id),
  status TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  local TEXT NOT NULL DEFAULT '',
  quando TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_tracking_shipment ON tracking_events (shipment_id, quando);

-- Avaliação por item do pedido; só nasce com pedido entregue/concluído.
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_item_id TEXT NOT NULL UNIQUE REFERENCES order_items(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  nota_produto INTEGER NOT NULL DEFAULT 0,
  nota_descricao INTEGER NOT NULL DEFAULT 0,
  nota_embalagem INTEGER NOT NULL DEFAULT 0,
  nota_envio INTEGER NOT NULL DEFAULT 0,
  nota_atendimento INTEGER NOT NULL DEFAULT 0,
  comentario TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'publicada',        -- publicada | oculta
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_reviews_product ON reviews (product_id, status);
CREATE INDEX IF NOT EXISTS ix_reviews_seller ON reviews (seller_id, status);

CREATE TABLE IF NOT EXISTS product_questions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  autor_id TEXT NOT NULL REFERENCES users(id),
  pergunta TEXT NOT NULL,
  resposta TEXT NOT NULL DEFAULT '',
  respondida_em TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'publicada',        -- publicada | oculta
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_questions_product ON product_questions (product_id, status);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'produto',            -- produto | usuario
  alvo_id TEXT NOT NULL,
  autor_id TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  detalhe TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aberta',           -- aberta | resolvida
  resolucao TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  resolvido_em TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  aberto_por TEXT NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  detalhe TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aberta',           -- aberta | resolvida
  resolucao TEXT NOT NULL DEFAULT '',              -- reembolso_total | reembolso_parcial | liberar_vendedor
  valor_reembolso_centavos INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  resolvido_em TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  titulo TEXT NOT NULL DEFAULT '',
  texto TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'info',
  lida_em TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications (user_id, lida_em);

-- admin_audit_logs
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

-- Tokens OAuth do Mercado Pago por vendedor (Split Payments, fase 6).
-- O pagamento é criado com o token do VENDEDOR + marketplace_fee da plataforma.
CREATE TABLE IF NOT EXISTS seller_mp_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  mp_user_id TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL DEFAULT '',
  public_key TEXT NOT NULL DEFAULT '',
  live_mode INTEGER NOT NULL DEFAULT 0,
  expira_em TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS platform_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL DEFAULT '',
  quando TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_events_tipo ON platform_events (tipo, quando);
