-- =====================================================================
-- ORIGENA — 012 preços (Q7 respondida em 09/08/2026).
--
-- OS NÚMEROS AQUI SÃO O PONTO DE PARTIDA, NÃO A DECISÃO FINAL. O Augusto
-- pediu "preços iguais aos da concorrência, compatíveis com os serviços e
-- com o custo das ferramentas de IA", e disse que ajusta depois — por isso
-- tudo isto é editável pela aba 🌳 do Portal Staff, sem deploy (§97).
--
-- COMO OS NÚMEROS FORAM ESCOLHIDOS (a conta inteira está em BILLING.md):
--
--   PISO DE CUSTO. Storage no R2 custa US$ 0,015/GB-mês (egress zero) e a
--   IA custa por token. Um plano cujo preço não cobre o custo do plano
--   CHEIO é um prejuízo que só aparece quando o cliente é bem-sucedido —
--   por isso cada plano fecha com margem POSITIVA a 100% de uso, e não só
--   no uso médio.
--
--   TETO DE MERCADO. MyHeritage começa em R$ 389/ano no Brasil; Storyworth
--   custa US$ 59–199/ano; Remento US$ 99. Nenhum deles guarda o acervo —
--   vendem árvore, registros ou um livro impresso. A Origena guarda dezenas
--   de GB por família, então não dá para competir com o Google One em preço
--   por GB; o que se cobra é o acervo COM proveniência, não o disco.
--
--   O CRÉDITO. R$ 0,20 no pacote menor. Cada capability cobra o número de
--   créditos que deixa margem ≥ 40% sobre o custo real do modelo — a conta
--   por operação está nos comentários do bloco de registry, mais abaixo.
--
-- CÂMBIO: os custos do R2 e da Anthropic são em dólar. A cotação vive em
-- `config.fx_usd_brl` para a margem do painel não mentir quando o dólar
-- mudar — não está embutida em número nenhum deste arquivo.
-- =====================================================================

-- Preço anual: o mercado inteiro vende assinatura de memória por ANO
-- (MyHeritage, Storyworth, Remento). Aqui o ano custa 10 mensalidades.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS preco_anual_centavos integer NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS familias integer NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS ordem smallint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- PRODUTOS avulsos (§48). Hoje só pacote de crédito; na 3.0 entram livro,
-- PDF e impressão — a tabela já nasce com `entrega` e `categoria` para não
-- exigir migração dolorosa depois.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         text NOT NULL UNIQUE,
  nome           text NOT NULL,
  categoria      text NOT NULL DEFAULT 'creditos'
                 CHECK (categoria IN ('creditos','livro','pdf','impresso','servico')),
  entrega        text NOT NULL DEFAULT 'digital'
                 CHECK (entrega IN ('digital','pdf','impresso')),
  preco_centavos integer NOT NULL DEFAULT 0,
  creditos       integer NOT NULL DEFAULT 0,
  custo_estimado_centavos integer NOT NULL DEFAULT 0,
  margem_min_bp  integer NOT NULL DEFAULT 3000,
  ordem          smallint NOT NULL DEFAULT 0,
  ativo          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- PLANOS. Piso de custo a 100% de uso, com dólar a 5,40:
--   Família   100 GB = R$  8,10 + 60 cr  = R$  7,02  → R$ 15,12 de R$ 39,90 (62%)
--   Legado    400 GB = R$ 32,40 + 200 cr = R$ 23,40  → R$ 55,80 de R$ 89,90 (38%)
--   Gerações 1024 GB = R$ 82,94 + 500 cr = R$ 58,50  → R$ 141,44 de R$ 199,90 (29%)
-- O plano gratuito NÃO dá crédito recorrente (seriam R$ 4/mês por família
-- que talvez nunca pague): dá o bônus único de boas-vindas e 5 GB, que é o
-- suficiente para a família experimentar com fotos de verdade.
-- ---------------------------------------------------------------------
UPDATE plans SET preco_centavos = 0, preco_anual_centavos = 0,
       storage_gb = 5, creditos_mes = 0, familias = 1, ordem = 1, ativo = true
 WHERE codigo = 'essencial';
UPDATE plans SET preco_centavos = 3990, preco_anual_centavos = 39900,
       storage_gb = 100, creditos_mes = 60, familias = 1, ordem = 2, ativo = true
 WHERE codigo = 'familia';
UPDATE plans SET preco_centavos = 8990, preco_anual_centavos = 89900,
       storage_gb = 400, creditos_mes = 200, familias = 3, ordem = 3, ativo = true
 WHERE codigo = 'legado';
UPDATE plans SET preco_centavos = 19990, preco_anual_centavos = 199900,
       storage_gb = 1024, creditos_mes = 500, familias = 10, ordem = 4, ativo = true
 WHERE codigo = 'geracoes';

-- ---------------------------------------------------------------------
-- PACOTES DE CRÉDITO. Desconto por volume, como todo mundo faz — e o preço
-- unitário do pacote menor (R$ 0,20) é o que define a margem por operação.
-- ---------------------------------------------------------------------
INSERT INTO products (codigo, nome, categoria, entrega, preco_centavos, creditos, ordem)
VALUES ('creditos_100',  'Pacote de 100 créditos',   'creditos', 'digital',  2490,  100, 1),
       ('creditos_300',  'Pacote de 300 créditos',   'creditos', 'digital',  5990,  300, 2),
       ('creditos_1000', 'Pacote de 1.000 créditos', 'creditos', 'digital', 16990, 1000, 3)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------
-- CUSTO POR OPERAÇÃO, medido com o modelo do registry (Claude Opus 5:
-- US$ 5 por milhão de tokens de entrada, US$ 25 de saída) e o tamanho real
-- do contexto que `conhecimento.js` monta:
--
--   responder_familia   ~8k entrada + ~1k saída  = US$ 0,065 ≈ R$ 0,35
--   gerar_biografia    ~15k entrada + ~2,5k saída = US$ 0,138 ≈ R$ 0,74
--   analisar_documento  ~6k entrada + ~1k saída  = US$ 0,055 ≈ R$ 0,30
--
-- Cobrança em créditos (a R$ 0,20 cada) com margem sobre o custo real:
--   responder_familia   3 créditos = R$ 0,60  → 42%
--   gerar_biografia     8 créditos = R$ 1,60  → 54%
--   analisar_documento  3 créditos = R$ 0,60  → 50%
--
-- `custo_estimado_centavos` deixa de ser chute: é a conta acima. O painel
-- compara essa estimativa com o custo MEDIDO no `ai_cost_ledger` — é assim
-- que uma mudança de preço do provedor vira alerta e não prejuízo mudo.
-- ---------------------------------------------------------------------
UPDATE provider_registry SET creditos = 3, custo_estimado_centavos = 35
 WHERE capability = 'responder_familia';
UPDATE provider_registry SET creditos = 8, custo_estimado_centavos = 74
 WHERE capability = 'gerar_biografia';
UPDATE provider_registry SET creditos = 3, custo_estimado_centavos = 30
 WHERE capability = 'analisar_documento';

-- ---------------------------------------------------------------------
-- Configuração de preço. Vive aqui para mudar sem deploy (§97).
-- ---------------------------------------------------------------------
INSERT INTO config (chave, valor, descricao) VALUES
  ('creditos_preco_centavos', '20',
   'Preço de 1 crédito em centavos (pacote menor). Base do cálculo de margem'),
  ('storage_excedente_centavos_gb', '15',
   'Excedente de armazenamento por GB/mês além do plano, em centavos (custo ~8)'),
  ('fx_usd_brl', '5.40',
   'Cotação usada para converter os custos em dólar (R2 e IA) — atualizar quando mudar'),
  ('custo_r2_usd_gb_mes', '0.015',
   'Custo do Cloudflare R2 por GB-mês, em dólar. Egress é zero'),
  ('trial_dias', '14',
   'Dias de teste do plano pago, sem cartão. 0 desliga o teste'),
  ('precos_definidos_em', '2026-08-09',
   'Quando os preços foram definidos. Q7 respondida: partida, não decisão final')
ON CONFLICT (chave) DO NOTHING;
