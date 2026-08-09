-- =====================================================================
-- ORIGENA — 013 pedidos e assinatura com gateway (L7, §5/§6 do BILLING).
--
-- O PREÇO É CONGELADO NO PEDIDO. `orders.total_centavos` e
-- `orders.creditos` são cópia do catálogo no instante da compra: quando o
-- Augusto mexer no preço amanhã, o histórico do pedido de hoje continua
-- dizendo o que a família realmente pagou. Catálogo é presente; pedido é
-- passado, e passado não se reescreve.
--
-- IDEMPOTÊNCIA DO WEBHOOK. `ux_orders_gateway` impede que o mesmo
-- pagamento do Mercado Pago seja aplicado duas vezes — o webhook chega
-- repetido por desenho do provedor, e o índice único é a garantia real,
-- não a checagem prévia (que duas entregas simultâneas atravessam).
-- =====================================================================

CREATE TABLE IF NOT EXISTS orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid NOT NULL REFERENCES families(id),
  codigo         text NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('creditos','assinatura')),
  product_id     uuid REFERENCES products(id),
  plan_id        uuid REFERENCES plans(id),
  ciclo          text NOT NULL DEFAULT 'mensal' CHECK (ciclo IN ('mensal','anual')),
  -- congelados no momento da compra
  descricao      text NOT NULL DEFAULT '',
  total_centavos integer NOT NULL DEFAULT 0,
  creditos       integer NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'aguardando_pagamento'
                 CHECK (status IN ('aguardando_pagamento','pago','cancelado','reembolsado')),
  gateway        text NOT NULL DEFAULT 'manual',
  gateway_ref    text NOT NULL DEFAULT '',
  pix_copia_cola text NOT NULL DEFAULT '',
  pago_em        timestamptz,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_codigo ON orders (codigo);
-- o MESMO pagamento não entra duas vezes, venha o webhook quantas vezes vier
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_gateway ON orders (gateway, gateway_ref)
  WHERE gateway_ref <> '';
CREATE INDEX IF NOT EXISTS ix_orders_familia ON orders (family_id, created_at DESC);

-- Assinatura: guarda o ciclo e o preço CONTRATADO. Mudança de tabela de
-- preços vale para as próximas assinaturas; quem já assinou mantém o que
-- combinou até o fim do ciclo (§7 do BILLING).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ciclo text NOT NULL DEFAULT 'mensal';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS preco_centavos integer NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ate date;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

SELECT aplicar_rls('orders');
