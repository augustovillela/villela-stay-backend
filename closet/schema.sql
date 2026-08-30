-- =====================================================================
-- Closet Club — marketplace de aluguel de roupas (o Airbnb dos guarda-roupas)
-- SQLite (node:sqlite). Dinheiro SEMPRE em centavos (INTEGER). Datas em
-- TEXT ISO-8601. Colunas JSON guardam listas/objetos (parse via db.j).
--
-- Não é multi-tenant: é UMA plataforma com N proprietários e N clientes.
-- O isolamento é por owner_id / cliente_id, validado em toda rota.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  nome        TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL
);

-- Configuração da plataforma (comissão, prazos, políticas). Editável no Portal Staff.
CREATE TABLE IF NOT EXISTS config (
  chave        TEXT PRIMARY KEY,
  valor        TEXT NOT NULL DEFAULT '',
  descricao    TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------
-- PESSOAS — uma única conta aluga E anuncia (como Airbnb)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  senha_hash     TEXT NOT NULL DEFAULT '',
  telefone       TEXT NOT NULL DEFAULT '',
  -- Dado sensível (LGPD): nunca sai em rota pública nem em listagem. Só admin e o próprio dono.
  cpf            TEXT NOT NULL DEFAULT '',
  nascimento     TEXT NOT NULL DEFAULT '',
  bio            TEXT NOT NULL DEFAULT '',
  avatar_url     TEXT NOT NULL DEFAULT '',
  cidade         TEXT NOT NULL DEFAULT '',
  uf             TEXT NOT NULL DEFAULT '',
  bairro         TEXT NOT NULL DEFAULT '',
  cep            TEXT NOT NULL DEFAULT '',
  lat            REAL NOT NULL DEFAULT 0,
  lng            REAL NOT NULL DEFAULT 0,
  -- medidas do próprio corpo (para a IA recomendar o que veste bem)
  perfil_corpo   TEXT NOT NULL DEFAULT '{}',    -- JSON {altura_cm,peso_kg,manequim,busto,cintura,quadril,calcado,tom_pele,estilo[]}
  papel          TEXT NOT NULL DEFAULT 'usuario', -- usuario | admin | moderador | parceiro
  plano          TEXT NOT NULL DEFAULT 'free',    -- free | premium (assinatura do anunciante)
  premium_ate    TEXT NOT NULL DEFAULT '',
  pix_tipo       TEXT NOT NULL DEFAULT '',        -- cpf | cnpj | email | telefone | aleatoria
  pix_chave      TEXT NOT NULL DEFAULT '',
  verificado     INTEGER NOT NULL DEFAULT 0,      -- 1 = documento conferido
  verificacao_status TEXT NOT NULL DEFAULT 'nao_enviado', -- nao_enviado|pendente|aprovado|reprovado
  nota_media     REAL NOT NULL DEFAULT 0,
  num_avaliacoes INTEGER NOT NULL DEFAULT 0,
  num_alugueis   INTEGER NOT NULL DEFAULT 0,      -- como proprietário
  num_locacoes   INTEGER NOT NULL DEFAULT 0,      -- como cliente
  resposta_min   INTEGER NOT NULL DEFAULT 0,      -- tempo médio de resposta, em minutos
  strikes        INTEGER NOT NULL DEFAULT 0,      -- reincidência (antifraude)
  status         TEXT NOT NULL DEFAULT 'ativo',   -- ativo | bloqueado | excluido
  motivo_status  TEXT NOT NULL DEFAULT '',
  aceite_termos_em TEXT NOT NULL DEFAULT '',
  consentimento  TEXT NOT NULL DEFAULT '{}',      -- JSON {marketing:bool, dados:bool, em:ISO, ip}
  origem         TEXT NOT NULL DEFAULT '',        -- utm/campanha de aquisição
  indicado_por   TEXT NOT NULL DEFAULT '',        -- user.id de quem indicou
  codigo_indicacao TEXT NOT NULL DEFAULT '',      -- o código que ESTA pessoa divulga
  ultimo_login   TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_users_cidade ON users(cidade, uf);
CREATE INDEX IF NOT EXISTS ix_users_status ON users(status);

-- ---------------------------------------------------------------------
-- ACERVO — peças e LOOKS (o diferencial: aluga-se o conjunto)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL DEFAULT '',
  titulo         TEXT NOT NULL,
  descricao      TEXT NOT NULL DEFAULT '',
  categoria      TEXT NOT NULL DEFAULT 'vestido', -- vestido|terno|bolsa|sapato|joia|acessorio|infantil|fantasia|gestante|plus|externo
  subcategoria   TEXT NOT NULL DEFAULT '',
  ocasioes       TEXT NOT NULL DEFAULT '[]',      -- JSON: casamento|praia|executivo|noite|jantar|festival|formatura|reveillon|natal|sessao-fotos
  cor            TEXT NOT NULL DEFAULT '',
  cores          TEXT NOT NULL DEFAULT '[]',      -- JSON de cores secundárias
  tamanho        TEXT NOT NULL DEFAULT '',        -- PP|P|M|G|GG|XGG ou numérico (36, 42...)
  marca          TEXT NOT NULL DEFAULT '',
  estilo         TEXT NOT NULL DEFAULT '',        -- classico|moderno|boho|minimalista|romantico|street|alfaiataria
  estacao        TEXT NOT NULL DEFAULT 'todas',   -- verao|inverno|meia-estacao|todas
  condicao       TEXT NOT NULL DEFAULT 'seminovo',-- novo|seminovo|usado
  medidas        TEXT NOT NULL DEFAULT '{}',      -- JSON {busto,cintura,quadril,comprimento,ombro,manga} em cm
  modelo         TEXT NOT NULL DEFAULT '{}',      -- JSON {altura_cm,peso_kg,vestiu} — "a modelo tem 1,70m, 62kg e vestiu M"
  preco_diaria_centavos    INTEGER NOT NULL DEFAULT 0,
  preco_3dias_centavos     INTEGER NOT NULL DEFAULT 0,  -- pacote fim de semana (0 = calcula por diária)
  caucao_centavos          INTEGER NOT NULL DEFAULT 0,  -- depósito reembolsável
  valor_reposicao_centavos INTEGER NOT NULL DEFAULT 0,  -- valor da peça, base do seguro
  min_dias       INTEGER NOT NULL DEFAULT 1,
  prep_dias      INTEGER NOT NULL DEFAULT 1,      -- buffer de higienização entre locações
  antecedencia_dias INTEGER NOT NULL DEFAULT 0,   -- pedido mínimo com N dias de antecedência
  fotos          TEXT NOT NULL DEFAULT '[]',      -- JSON [{url,alt,capa}]
  video_url      TEXT NOT NULL DEFAULT '',
  cidade         TEXT NOT NULL DEFAULT '',
  uf             TEXT NOT NULL DEFAULT '',
  bairro         TEXT NOT NULL DEFAULT '',
  lat            REAL NOT NULL DEFAULT 0,
  lng            REAL NOT NULL DEFAULT 0,
  entrega        TEXT NOT NULL DEFAULT '["retirada"]', -- JSON: retirada|entrega|correios
  seo_keywords   TEXT NOT NULL DEFAULT '[]',
  status         TEXT NOT NULL DEFAULT 'rascunho',-- rascunho|ativo|pausado|removido
  moderacao      TEXT NOT NULL DEFAULT 'pendente',-- pendente|aprovado|reprovado
  moderacao_nota TEXT NOT NULL DEFAULT '',
  destaque_ate   TEXT NOT NULL DEFAULT '',        -- anúncio patrocinado/premium até
  qualidade_fotos INTEGER NOT NULL DEFAULT 0,     -- score 0-100 do detector de foto ruim
  visualizacoes  INTEGER NOT NULL DEFAULT 0,
  favoritos      INTEGER NOT NULL DEFAULT 0,
  alugueis       INTEGER NOT NULL DEFAULT 0,
  nota_media     REAL NOT NULL DEFAULT 0,
  num_avaliacoes INTEGER NOT NULL DEFAULT 0,
  ia             TEXT NOT NULL DEFAULT '{}',      -- JSON com o que a IA sugeriu (preço, descrição, tags)
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_items_owner ON items(owner_id);
CREATE INDEX IF NOT EXISTS ix_items_vitrine ON items(status, moderacao, cidade);
CREATE INDEX IF NOT EXISTS ix_items_cat ON items(categoria, tamanho);

CREATE TABLE IF NOT EXISTS looks (
  id            TEXT PRIMARY KEY,
  curador_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  curadoria     TEXT NOT NULL DEFAULT 'proprietario', -- proprietario|plataforma|stylist|ia
  slug          TEXT NOT NULL DEFAULT '',
  titulo        TEXT NOT NULL,                    -- "Look Casamento no Campo"
  descricao     TEXT NOT NULL DEFAULT '',
  ocasiao       TEXT NOT NULL DEFAULT '',
  estilo        TEXT NOT NULL DEFAULT '',
  cidade        TEXT NOT NULL DEFAULT '',
  uf            TEXT NOT NULL DEFAULT '',
  desconto_pct  INTEGER NOT NULL DEFAULT 10,      -- o combo sai mais barato que as peças soltas
  foto_capa     TEXT NOT NULL DEFAULT '',
  fotos         TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|ativo|pausado|removido
  moderacao     TEXT NOT NULL DEFAULT 'pendente',
  visualizacoes INTEGER NOT NULL DEFAULT 0,
  alugueis      INTEGER NOT NULL DEFAULT 0,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_looks_vitrine ON looks(status, moderacao, ocasiao);

-- Um look pode juntar peças de VÁRIOS proprietários — o repasse é dividido por dono.
CREATE TABLE IF NOT EXISTS look_items (
  look_id  TEXT NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  papel    TEXT NOT NULL DEFAULT '',              -- peça-chave, complemento, acessório
  ordem    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (look_id, item_id)
);

-- Bloqueios de agenda (reserva confirmada, higienização, indisponibilidade manual)
CREATE TABLE IF NOT EXISTS item_blocks (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  inicio     TEXT NOT NULL,                       -- YYYY-MM-DD
  fim        TEXT NOT NULL,                       -- YYYY-MM-DD (inclusive)
  motivo     TEXT NOT NULL DEFAULT 'manual',      -- reserva|prep|manual
  booking_id TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_blocks_item ON item_blocks(item_id, inicio, fim);

-- ---------------------------------------------------------------------
-- TRANSAÇÃO — reserva com pagamento bloqueado (escrow) e QR de posse
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id               TEXT PRIMARY KEY,
  codigo           TEXT NOT NULL UNIQUE,          -- CC-8H3K2 (legível, usado no chat e no QR)
  cliente_id       TEXT NOT NULL REFERENCES users(id),
  tipo             TEXT NOT NULL DEFAULT 'peca',  -- peca | look
  look_id          TEXT NOT NULL DEFAULT '',
  data_retirada    TEXT NOT NULL,                 -- YYYY-MM-DD
  data_devolucao   TEXT NOT NULL,                 -- YYYY-MM-DD (inclusive)
  dias             INTEGER NOT NULL DEFAULT 1,
  ocasiao          TEXT NOT NULL DEFAULT '',
  modo_entrega     TEXT NOT NULL DEFAULT 'retirada',
  endereco_entrega TEXT NOT NULL DEFAULT '',
  observacoes      TEXT NOT NULL DEFAULT '',
  -- dinheiro (tudo em centavos)
  subtotal_centavos    INTEGER NOT NULL DEFAULT 0, -- soma das diárias das peças
  desconto_centavos    INTEGER NOT NULL DEFAULT 0, -- look + cupom + crédito (tudo bancado pela comissão)
  cupom                TEXT NOT NULL DEFAULT '',
  credito_centavos     INTEGER NOT NULL DEFAULT 0, -- crédito de indicação usado nesta reserva
  zona_entrega_id      TEXT NOT NULL DEFAULT '',
  seguro_centavos      INTEGER NOT NULL DEFAULT 0,
  entrega_centavos     INTEGER NOT NULL DEFAULT 0,
  servicos_centavos    INTEGER NOT NULL DEFAULT 0, -- lavanderia/foto/styling contratados
  caucao_centavos      INTEGER NOT NULL DEFAULT 0, -- reembolsável na devolução sem dano
  total_centavos       INTEGER NOT NULL DEFAULT 0, -- o que o cliente paga
  comissao_centavos    INTEGER NOT NULL DEFAULT 0, -- fica com a plataforma
  comissao_pct         REAL NOT NULL DEFAULT 20,
  repasse_centavos     INTEGER NOT NULL DEFAULT 0, -- soma dos repasses aos proprietários
  -- máquina de estados do escrow
  status           TEXT NOT NULL DEFAULT 'aguardando_pagamento',
  -- aguardando_pagamento → pago_bloqueado → confirmado → retirado → devolvido → concluido
  -- laterais: recusado | cancelado | expirado | em_disputa | reembolsado
  motivo_status    TEXT NOT NULL DEFAULT '',
  prazo_confirmacao TEXT NOT NULL DEFAULT '',     -- dono precisa confirmar até (senão estorna)
  janela_vistoria  TEXT NOT NULL DEFAULT '',      -- dono pode abrir disputa até (senão libera repasse)
  -- pagamento
  mp_payment_id    TEXT NOT NULL DEFAULT '',
  pix_qr           TEXT NOT NULL DEFAULT '',      -- imagem base64 (quando o PSP devolve)
  pix_copia_cola   TEXT NOT NULL DEFAULT '',
  pix_expira_em    TEXT NOT NULL DEFAULT '',
  pago_em          TEXT NOT NULL DEFAULT '',
  -- posse (QR)
  token_retirada   TEXT NOT NULL DEFAULT '',
  token_devolucao  TEXT NOT NULL DEFAULT '',
  retirada_em      TEXT NOT NULL DEFAULT '',
  retirada_por     TEXT NOT NULL DEFAULT '',
  devolucao_em     TEXT NOT NULL DEFAULT '',
  devolucao_por    TEXT NOT NULL DEFAULT '',
  devolucao_cliente_em TEXT NOT NULL DEFAULT '',   -- quem devolve confirma
  devolucao_dono_em    TEXT NOT NULL DEFAULT '',   -- quem recebe confirma
  prazo_devolucao      TEXT NOT NULL DEFAULT '',   -- 1a confirmacao arma o relogio
  confirmado_em    TEXT NOT NULL DEFAULT '',
  concluido_em     TEXT NOT NULL DEFAULT '',
  cancelado_em     TEXT NOT NULL DEFAULT '',
  reembolso_centavos INTEGER NOT NULL DEFAULT 0,
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_bookings_cliente ON bookings(cliente_id, status);
CREATE INDEX IF NOT EXISTS ix_bookings_status ON bookings(status, criado_em);

-- Uma linha por peça da reserva. É aqui que mora o repasse por proprietário.
CREATE TABLE IF NOT EXISTS booking_items (
  id                TEXT PRIMARY KEY,
  booking_id        TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_id           TEXT NOT NULL REFERENCES items(id),
  owner_id          TEXT NOT NULL REFERENCES users(id),
  titulo            TEXT NOT NULL DEFAULT '',      -- congelado no momento da reserva
  preco_diaria_centavos INTEGER NOT NULL DEFAULT 0,
  dias              INTEGER NOT NULL DEFAULT 1,
  subtotal_centavos INTEGER NOT NULL DEFAULT 0,
  desconto_centavos INTEGER NOT NULL DEFAULT 0,
  comissao_centavos INTEGER NOT NULL DEFAULT 0,
  repasse_centavos  INTEGER NOT NULL DEFAULT 0,
  caucao_centavos   INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pendente', -- pendente|confirmado|recusado|retirado|devolvido|danificado
  confirmado_em     TEXT NOT NULL DEFAULT '',
  criado_em         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_bitems_booking ON booking_items(booking_id);
CREATE INDEX IF NOT EXISTS ix_bitems_owner ON booking_items(owner_id, status);
CREATE INDEX IF NOT EXISTS ix_bitems_item ON booking_items(item_id);

-- Repasse Pix ao proprietário (saída de dinheiro). Uma linha por dono por reserva.
CREATE TABLE IF NOT EXISTS payouts (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id),
  booking_id     TEXT NOT NULL REFERENCES bookings(id),
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  pix_tipo       TEXT NOT NULL DEFAULT '',
  pix_chave      TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pendente', -- pendente|liberado|pago|falhou|retido
  motivo         TEXT NOT NULL DEFAULT '',
  mp_transfer_id TEXT NOT NULL DEFAULT '',
  liberado_em    TEXT NOT NULL DEFAULT '',
  pago_em        TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_payouts_owner ON payouts(owner_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_payouts_booking_owner ON payouts(booking_id, owner_id);

-- Razão financeiro da plataforma: toda entrada e saída de dinheiro passa aqui.
CREATE TABLE IF NOT EXISTS ledger (
  id             TEXT PRIMARY KEY,
  booking_id     TEXT NOT NULL DEFAULT '',
  user_id        TEXT NOT NULL DEFAULT '',
  tipo           TEXT NOT NULL,                    -- entrada|comissao|repasse|caucao|reembolso|assinatura|servico
  valor_centavos INTEGER NOT NULL DEFAULT 0,       -- positivo = entra na plataforma; negativo = sai
  descricao      TEXT NOT NULL DEFAULT '',
  competencia    TEXT NOT NULL DEFAULT '',         -- YYYY-MM
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ledger_comp ON ledger(competencia, tipo);

-- ---------------------------------------------------------------------
-- CONFIANÇA — avaliações, chat, disputas, moderação
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL DEFAULT '',
  autor_id    TEXT NOT NULL REFERENCES users(id),
  alvo_tipo   TEXT NOT NULL,                       -- item | proprietario | cliente
  alvo_id     TEXT NOT NULL,
  nota        INTEGER NOT NULL DEFAULT 5,
  texto       TEXT NOT NULL DEFAULT '',
  detalhes    TEXT NOT NULL DEFAULT '{}',          -- JSON {caimento, conservacao, pontualidade, comunicacao}
  resposta    TEXT NOT NULL DEFAULT '',            -- direito de resposta do avaliado
  publicada   INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_reviews_alvo ON reviews(alvo_tipo, alvo_id, publicada);
CREATE UNIQUE INDEX IF NOT EXISTS ux_reviews_unica ON reviews(booking_id, autor_id, alvo_tipo, alvo_id);

CREATE TABLE IF NOT EXISTS threads (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL DEFAULT '',
  item_id     TEXT NOT NULL DEFAULT '',
  cliente_id  TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  assunto     TEXT NOT NULL DEFAULT '',
  ultima_em   TEXT NOT NULL DEFAULT '',
  criado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_threads_pessoas ON threads(cliente_id, owner_id);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  autor_id   TEXT NOT NULL,
  texto      TEXT NOT NULL DEFAULT '',
  anexos     TEXT NOT NULL DEFAULT '[]',
  sistema    INTEGER NOT NULL DEFAULT 0,           -- 1 = mensagem automática da plataforma
  lida_em    TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_messages_thread ON messages(thread_id, criado_em);

CREATE TABLE IF NOT EXISTS disputes (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL REFERENCES bookings(id),
  aberta_por    TEXT NOT NULL,
  contra        TEXT NOT NULL DEFAULT '',
  motivo        TEXT NOT NULL DEFAULT 'dano',      -- dano|nao_devolvido|nao_entregue|nao_confere|atraso|outro
  descricao     TEXT NOT NULL DEFAULT '',
  evidencias    TEXT NOT NULL DEFAULT '[]',
  valor_pedido_centavos INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'aberta',    -- aberta|analise|resolvida|rejeitada
  decisao       TEXT NOT NULL DEFAULT '',
  valor_retido_centavos INTEGER NOT NULL DEFAULT 0,
  decidida_por  TEXT NOT NULL DEFAULT '',
  decidida_em   TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_disputes_status ON disputes(status);

-- ---------------------------------------------------------------------
-- CRESCIMENTO — favoritos, cupons, indicação, serviços de parceiros
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  user_id   TEXT NOT NULL,
  alvo_tipo TEXT NOT NULL DEFAULT 'item',          -- item | look
  alvo_id   TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  PRIMARY KEY (user_id, alvo_tipo, alvo_id)
);

CREATE TABLE IF NOT EXISTS coupons (
  codigo         TEXT PRIMARY KEY,
  descricao      TEXT NOT NULL DEFAULT '',
  tipo           TEXT NOT NULL DEFAULT 'pct',      -- pct | valor
  valor          INTEGER NOT NULL DEFAULT 0,       -- pct (0-100) ou centavos
  minimo_centavos INTEGER NOT NULL DEFAULT 0,
  usos_max       INTEGER NOT NULL DEFAULT 0,       -- 0 = ilimitado
  usos           INTEGER NOT NULL DEFAULT 0,
  por_usuario    INTEGER NOT NULL DEFAULT 1,
  valido_de      TEXT NOT NULL DEFAULT '',
  valido_ate     TEXT NOT NULL DEFAULT '',
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coupon_uses (
  codigo     TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  criado_em  TEXT NOT NULL,
  PRIMARY KEY (codigo, booking_id)
);

CREATE TABLE IF NOT EXISTS referrals (
  id          TEXT PRIMARY KEY,
  padrinho_id TEXT NOT NULL,
  codigo      TEXT NOT NULL,
  convidado_id TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'convidado',   -- convidado|cadastrado|premiado
  premio_centavos INTEGER NOT NULL DEFAULT 0,
  criado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_referrals_cod ON referrals(codigo);

CREATE TABLE IF NOT EXISTS partners (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT '',           -- conta que administra o parceiro (papel 'parceiro')
  slug        TEXT NOT NULL DEFAULT '',
  logo_url    TEXT NOT NULL DEFAULT '',
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'lavanderia',  -- lavanderia|fotografo|costureira|stylist|maquiador|cabeleireiro|entrega|joalheria
  descricao   TEXT NOT NULL DEFAULT '',
  cidade      TEXT NOT NULL DEFAULT '',
  uf          TEXT NOT NULL DEFAULT '',
  telefone    TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  comissao_pct REAL NOT NULL DEFAULT 15,
  nota_media  REAL NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'ativo',
  criado_em   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS partner_services (
  id             TEXT PRIMARY KEY,
  partner_id     TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  tipo           TEXT NOT NULL DEFAULT 'lavanderia',
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  descricao      TEXT NOT NULL DEFAULT '',
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_services (
  id             TEXT PRIMARY KEY,
  booking_id     TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id     TEXT NOT NULL DEFAULT '',
  partner_id     TEXT NOT NULL DEFAULT '',
  nome           TEXT NOT NULL DEFAULT '',
  tipo           TEXT NOT NULL DEFAULT '',
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'contratado',
  criado_em      TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- ASSINATURA PREMIUM DO ANUNCIANTE (2ª fonte de receita)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  nome           TEXT NOT NULL,
  descricao      TEXT NOT NULL DEFAULT '',
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  comissao_pct   REAL NOT NULL DEFAULT 20,
  limites        TEXT NOT NULL DEFAULT '{}',       -- JSON {pecas, fotos_por_peca, videos, destaques_mes}
  flags          TEXT NOT NULL DEFAULT '{}',       -- JSON {ia, analytics, agenda_auto, video, destaque, sem_fundo}
  ordem          INTEGER NOT NULL DEFAULT 0,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id            TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'pendente', -- pendente|ativa|inadimplente|cancelada
  inicio             TEXT NOT NULL DEFAULT '',
  fim                TEXT NOT NULL DEFAULT '',
  proximo_venc       TEXT NOT NULL DEFAULT '',
  mp_preapproval_id  TEXT NOT NULL DEFAULT '',
  criado_em          TEXT NOT NULL,
  atualizado_em      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_subs_user ON subscriptions(user_id, status);
CREATE TABLE IF NOT EXISTS invoices (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  competencia    TEXT NOT NULL DEFAULT '',
  vencimento     TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'aberta',
  mp_payment_id  TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL,
  pago_em        TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------
-- PLATAFORMA — notificações, eventos, auditoria, leads, analytics
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  titulo    TEXT NOT NULL DEFAULT '',
  texto     TEXT NOT NULL DEFAULT '',
  url       TEXT NOT NULL DEFAULT '',
  tipo      TEXT NOT NULL DEFAULT 'info',
  lida_em   TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notif_user ON notifications(user_id, lida_em);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint  TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL DEFAULT '',
  dados     TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_events (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  tipo    TEXT NOT NULL,
  ref     TEXT NOT NULL DEFAULT '',
  dados   TEXT NOT NULL DEFAULT '{}',
  quando  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_events_tipo ON platform_events(tipo, quando);

CREATE TABLE IF NOT EXISTS auditoria (
  id         TEXT PRIMARY KEY,
  quem       TEXT NOT NULL DEFAULT '',
  acao       TEXT NOT NULL,
  entidade   TEXT NOT NULL DEFAULT '',
  entidade_id TEXT NOT NULL DEFAULT '',
  detalhe    TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  quando     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_aud_quando ON auditoria(quando);

CREATE TABLE IF NOT EXISTS leads (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL DEFAULT '',
  email     TEXT NOT NULL DEFAULT '',
  telefone  TEXT NOT NULL DEFAULT '',
  cidade    TEXT NOT NULL DEFAULT '',
  perfil    TEXT NOT NULL DEFAULT '',              -- quero_alugar | quero_anunciar | parceiro
  mensagem  TEXT NOT NULL DEFAULT '',
  origem    TEXT NOT NULL DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'novo',
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_views (
  id        TEXT PRIMARY KEY,
  item_id   TEXT NOT NULL,
  user_id   TEXT NOT NULL DEFAULT '',
  origem    TEXT NOT NULL DEFAULT '',
  dia       TEXT NOT NULL DEFAULT '',
  quando    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_views_item ON item_views(item_id, dia);

-- =====================================================================
-- ONDA 2 — fotos, conteúdo, indicação, entrega e API pública
-- =====================================================================

-- Arquivos públicos (fotos de peças, looks, blog). O binário fica no driver
-- de storage (disco local ou S3/R2); aqui só o registro e a deduplicação.
CREATE TABLE IF NOT EXISTS uploads (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL DEFAULT '',
  hash      TEXT NOT NULL,                        -- sha256 do binário (dedupe + nome do arquivo)
  arquivo   TEXT NOT NULL,                        -- <hash>.<ext>
  mime      TEXT NOT NULL DEFAULT '',
  bytes     INTEGER NOT NULL DEFAULT 0,
  largura   INTEGER NOT NULL DEFAULT 0,
  altura    INTEGER NOT NULL DEFAULT 0,
  storage   TEXT NOT NULL DEFAULT 'local',        -- local | s3
  origem    TEXT NOT NULL DEFAULT 'peca',         -- peca | look | blog | avatar
  criado_em TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_uploads_hash ON uploads(hash);
CREATE INDEX IF NOT EXISTS ix_uploads_user ON uploads(user_id);

-- Blog / conteúdo (SEO: é o que traz gente que ainda não sabe que dá para alugar)
CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  titulo        TEXT NOT NULL,
  resumo        TEXT NOT NULL DEFAULT '',
  corpo         TEXT NOT NULL DEFAULT '',         -- markdown leve (##, **, -, links)
  capa          TEXT NOT NULL DEFAULT '',
  autor         TEXT NOT NULL DEFAULT 'Closet Club',
  ocasiao       TEXT NOT NULL DEFAULT '',         -- liga o post à vitrine daquela ocasião
  categoria     TEXT NOT NULL DEFAULT 'guia',     -- guia | tendencia | etiqueta | historia
  tags          TEXT NOT NULL DEFAULT '[]',
  seo_titulo    TEXT NOT NULL DEFAULT '',
  seo_descricao TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'rascunho', -- rascunho | publicado
  publicado_em  TEXT NOT NULL DEFAULT '',
  visualizacoes INTEGER NOT NULL DEFAULT 0,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_posts_pub ON posts(status, publicado_em);

-- Créditos do usuário (indicação, cortesia, compensação). Saldo = soma.
-- Crédito é promoção da PLATAFORMA: ao ser usado, sai da comissão — nunca do
-- repasse do proprietário (mesma regra do cupom e do desconto de look).
CREATE TABLE IF NOT EXISTS credits (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL DEFAULT 0,      -- positivo = ganhou; negativo = usou
  tipo           TEXT NOT NULL DEFAULT 'indicacao', -- indicacao | cortesia | compensacao | uso | expiracao
  descricao      TEXT NOT NULL DEFAULT '',
  booking_id     TEXT NOT NULL DEFAULT '',
  expira_em      TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_credits_user ON credits(user_id, expira_em);

-- Entrega: zonas com preço e prazo (substitui o frete fixo da onda 1)
CREATE TABLE IF NOT EXISTS zonas_entrega (
  id             TEXT PRIMARY KEY,
  cidade         TEXT NOT NULL,
  uf             TEXT NOT NULL DEFAULT '',
  bairro         TEXT NOT NULL DEFAULT '',        -- vazio = toda a cidade
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  prazo_h        INTEGER NOT NULL DEFAULT 24,
  partner_id     TEXT NOT NULL DEFAULT '',        -- transportadora parceira, se houver
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_zonas ON zonas_entrega(cidade, bairro, ativo);

-- Cobertura do parceiro (onde ele atende)
CREATE TABLE IF NOT EXISTS partner_areas (
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  cidade     TEXT NOT NULL,
  uf         TEXT NOT NULL DEFAULT '',
  bairro     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (partner_id, cidade, bairro)
);

-- Campanhas patrocinadas (4ª fonte de receita): o anunciante paga para a peça
-- aparecer no topo da vitrine por N dias. Compra avulsa, independente do Premium.
CREATE TABLE IF NOT EXISTS campanhas (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  item_id        TEXT NOT NULL,
  tipo           TEXT NOT NULL DEFAULT 'destaque',   -- destaque | topo_ocasiao
  ocasiao        TEXT NOT NULL DEFAULT '',
  dias           INTEGER NOT NULL DEFAULT 7,
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'aguardando_pagamento', -- aguardando_pagamento|ativa|encerrada|cancelada
  inicio         TEXT NOT NULL DEFAULT '',
  fim            TEXT NOT NULL DEFAULT '',
  mp_payment_id  TEXT NOT NULL DEFAULT '',
  pago_em        TEXT NOT NULL DEFAULT '',
  impressoes     INTEGER NOT NULL DEFAULT 0,
  cliques        INTEGER NOT NULL DEFAULT 0,
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_campanhas_user ON campanhas(user_id, status);
CREATE INDEX IF NOT EXISTS ix_campanhas_item ON campanhas(item_id, status);

-- API pública: chave por usuário (prefixo visível + hash da chave)
CREATE TABLE IF NOT EXISTS api_keys (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  nome       TEXT NOT NULL DEFAULT '',
  prefixo    TEXT NOT NULL,                       -- cc_xxxxxxxx (mostrado no painel)
  chave_hash TEXT NOT NULL,                       -- sha256 da chave completa
  escopos    TEXT NOT NULL DEFAULT '["leitura"]',
  ativa      INTEGER NOT NULL DEFAULT 1,
  chamadas   INTEGER NOT NULL DEFAULT 0,
  ultimo_uso TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_apikeys_user ON api_keys(user_id, ativa);
