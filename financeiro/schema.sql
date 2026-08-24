-- =====================================================================
-- Villela Finance — schema do núcleo financeiro (Fase 1 + 2).
--
-- Banco PRÓPRIO em DATA_DIR/financeiro/financeiro.db (node:sqlite). Não
-- compartilha arquivo com nenhum outro produto — ver DECISIONS/ADR-0002.
--
-- Convenções do grupo: CREATE IF NOT EXISTS · IDs TEXT url-safe · datas
-- ISO-8601 · JSON em TEXT · **dinheiro SEMPRE em INTEGER de centavos**.
--
-- REGRA: toda tabela de negócio nasce com tenant_id + criado_em/por.
-- Tabela com tenant_id entra AUTOMATICAMENTE no teste anti-vazamento
-- (selftest.js lê o schema) — é de propósito.
--
-- REGRA DO RAZÃO: lote contabilizado é IMUTÁVEL. Isso não é convenção de
-- código — são os triggers no fim deste arquivo. Correção é por estorno.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  nome        TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL
);

-- ========================== CONTROL PLANE ============================
-- Comercial do SaaS. Mesma forma dos outros produtos (vsm/vdocs), para
-- que o painel da plataforma no Portal Staff reuse os mesmos conceitos.

CREATE TABLE IF NOT EXISTS plans (
  id            TEXT PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  nome          TEXT NOT NULL,
  preco_cents   INTEGER NOT NULL DEFAULT 0,
  periodo       TEXT NOT NULL DEFAULT 'mensal',
  modulos       TEXT NOT NULL DEFAULT '[]',        -- JSON: módulos liberados
  limites       TEXT NOT NULL DEFAULT '{}',        -- JSON: {entidades, usuarios, lancamentos_mes, contas_bancarias}
  flags         TEXT NOT NULL DEFAULT '{}',        -- JSON: recursos on/off
  ordem         INTEGER NOT NULL DEFAULT 0,
  publico       INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tenants (
  id             TEXT PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,
  nome           TEXT NOT NULL,
  documento      TEXT DEFAULT '',                  -- CNPJ do contratante
  status         TEXT NOT NULL DEFAULT 'trial',    -- trial|ativa|suspensa|inadimplente|cancelada
  plano_id       TEXT DEFAULT '' REFERENCES plans(id),
  overrides      TEXT NOT NULL DEFAULT '{}',       -- JSON: módulos/limites por exceção
  trial_ate      TEXT DEFAULT '',
  contato_email  TEXT DEFAULT '',
  contato_nome   TEXT DEFAULT '',
  interno        INTEGER NOT NULL DEFAULT 0,       -- 1 = conta do próprio grupo (cortesia vitalícia)
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  cancelado_em   TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tenant_users (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  nome           TEXT NOT NULL DEFAULT '',
  senha_hash     TEXT NOT NULL DEFAULT '',
  perfil         TEXT NOT NULL DEFAULT 'operador',  -- ver rbac.js
  status         TEXT NOT NULL DEFAULT 'ativo',     -- ativo|suspenso
  mfa_ativo      INTEGER NOT NULL DEFAULT 0,
  mfa_segredo    TEXT DEFAULT '',                   -- cifrado; nunca devolvido cru
  ultimo_acesso  TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_users_email ON tenant_users(tenant_id, email);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plano_id      TEXT NOT NULL REFERENCES plans(id),
  status        TEXT NOT NULL DEFAULT 'ativa',
  externo_ref   TEXT DEFAULT '',                   -- preapproval do Mercado Pago
  inicio        TEXT NOT NULL,
  fim           TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fin_subs_tenant ON subscriptions(tenant_id, status);

CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  competencia   TEXT NOT NULL,                     -- YYYY-MM
  valor_cents   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'aberta',    -- aberta|paga|vencida|cancelada
  vencimento    TEXT DEFAULT '',
  pago_em       TEXT DEFAULT '',
  externo_ref   TEXT DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_invoices_tenant ON invoices(tenant_id, competencia);

CREATE TABLE IF NOT EXISTS usage_records (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metrica     TEXT NOT NULL,
  competencia TEXT NOT NULL,
  quantidade  INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_uso ON usage_records(tenant_id, metrica, competencia);

-- ========================== AUDITORIA ================================
-- Encadeada por hash: alterar/remover uma linha quebra a cadeia e o
-- selftest detecta. É o "quem fez, quando, por quê, com que evidência".

CREATE TABLE IF NOT EXISTS audit_logs (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT '',
  seq            INTEGER NOT NULL,
  quando         TEXT NOT NULL,
  ator           TEXT NOT NULL DEFAULT '',
  ator_tipo      TEXT NOT NULL DEFAULT 'usuario',  -- usuario|agente|plataforma|sistema
  acao           TEXT NOT NULL,
  objeto_tipo    TEXT NOT NULL DEFAULT '',
  objeto_id      TEXT NOT NULL DEFAULT '',
  motivo         TEXT NOT NULL DEFAULT '',
  detalhe        TEXT NOT NULL DEFAULT '{}',       -- JSON
  correlation_id TEXT NOT NULL DEFAULT '',
  origem_ip      TEXT NOT NULL DEFAULT '',
  hash_anterior  TEXT NOT NULL DEFAULT '',
  hash           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fin_audit_tenant ON audit_logs(tenant_id, seq DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_objeto ON audit_logs(tenant_id, objeto_tipo, objeto_id);

-- ===================== ESTRUTURA CONTÁBIL ============================

-- Entidade legal: uma conta (tenant) pode ter várias empresas.
CREATE TABLE IF NOT EXISTS fin_entidades (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  documento      TEXT NOT NULL DEFAULT '',         -- CNPJ/CPF
  regime         TEXT NOT NULL DEFAULT 'simples',  -- simples|presumido|real|mei|pf
  moeda          TEXT NOT NULL DEFAULT 'BRL',
  timezone       TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  status         TEXT NOT NULL DEFAULT 'ativa',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fin_entidades_tenant ON fin_entidades(tenant_id, status);

-- Plano de contas. `aceita_lancamento = 0` em conta sintética (grupo).
CREATE TABLE IF NOT EXISTS fin_contas (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id       TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  codigo            TEXT NOT NULL,                 -- 1.1.01.001
  nome              TEXT NOT NULL,
  natureza          TEXT NOT NULL,                 -- ativo|passivo|patrimonio|receita|despesa
  -- Lado que AUMENTA a conta. Ativo/despesa = devedora; o resto = credora.
  saldo_normal      TEXT NOT NULL,                 -- devedora|credora
  pai_id            TEXT NOT NULL DEFAULT '',
  aceita_lancamento INTEGER NOT NULL DEFAULT 1,
  -- Subledger que ESTA conta representa; obriga contraparte na linha.
  subledger         TEXT NOT NULL DEFAULT '',      -- ''|clientes|fornecedores|bancos|caixa
  conta_bancaria_id TEXT NOT NULL DEFAULT '',      -- quando subledger='bancos'
  sistema           INTEGER NOT NULL DEFAULT 0,    -- 1 = criada pela semeadura, não editável
  status            TEXT NOT NULL DEFAULT 'ativa', -- ativa|inativa
  criado_em         TEXT NOT NULL,
  criado_por        TEXT DEFAULT '',
  atualizado_em     TEXT DEFAULT '',
  atualizado_por    TEXT DEFAULT '',
  CHECK (natureza IN ('ativo','passivo','patrimonio','receita','despesa')),
  CHECK (saldo_normal IN ('devedora','credora'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_contas_codigo ON fin_contas(tenant_id, entidade_id, codigo);
CREATE INDEX IF NOT EXISTS idx_fin_contas_pai ON fin_contas(tenant_id, entidade_id, pai_id);

CREATE TABLE IF NOT EXISTS fin_centros_custo (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  codigo      TEXT NOT NULL,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'centro',     -- centro|projeto|propriedade
  externo_id  TEXT NOT NULL DEFAULT '',           -- código do imóvel na Stays, p.ex.
  status      TEXT NOT NULL DEFAULT 'ativo',
  criado_em   TEXT NOT NULL,
  criado_por  TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_cc_codigo ON fin_centros_custo(tenant_id, entidade_id, codigo);

-- Período contábil. Fechado NÃO aceita lançamento (trigger no fim).
CREATE TABLE IF NOT EXISTS fin_periodos (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id   TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  competencia   TEXT NOT NULL,                    -- YYYY-MM
  status        TEXT NOT NULL DEFAULT 'aberto',   -- aberto|fechado
  fechado_em    TEXT NOT NULL DEFAULT '',
  fechado_por   TEXT NOT NULL DEFAULT '',
  reaberto_em   TEXT NOT NULL DEFAULT '',
  reaberto_por  TEXT NOT NULL DEFAULT '',
  reabertura_motivo TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL,
  CHECK (status IN ('aberto','fechado'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_periodos ON fin_periodos(tenant_id, entidade_id, competencia);

-- ======================= RAZÃO (LEDGER) ==============================
-- Fonte oficial do estado contábil. Nada calcula saldo somando tabela
-- transacional: saldo vem daqui.

CREATE TABLE IF NOT EXISTS fin_lotes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id    TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  numero         INTEGER NOT NULL,                -- sequencial por entidade
  data           TEXT NOT NULL,                   -- data do fato (YYYY-MM-DD)
  competencia    TEXT NOT NULL,                   -- YYYY-MM (define o período)
  memo           TEXT NOT NULL DEFAULT '',
  origem         TEXT NOT NULL DEFAULT 'manual',  -- manual|banco|stays|mercadopago|migracao|fechamento
  origem_ref     TEXT NOT NULL DEFAULT '',        -- id no sistema de origem
  -- Chave de idempotência: mesmo comando externo nunca gera dois lotes.
  idempotencia   TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'rascunho',-- rascunho|contabilizado|estornado
  estorno_de     TEXT NOT NULL DEFAULT '',        -- id do lote estornado
  estornado_por  TEXT NOT NULL DEFAULT '',        -- id do lote de estorno
  estorno_motivo TEXT NOT NULL DEFAULT '',
  total_cents    INTEGER NOT NULL DEFAULT 0,      -- soma dos débitos (== créditos)
  contabilizado_em  TEXT NOT NULL DEFAULT '',
  contabilizado_por TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT NOT NULL DEFAULT '',
  correlation_id TEXT NOT NULL DEFAULT '',
  CHECK (status IN ('rascunho','contabilizado','estornado')),
  CHECK (total_cents >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_lotes_numero ON fin_lotes(tenant_id, entidade_id, numero);
CREATE INDEX IF NOT EXISTS idx_fin_lotes_comp ON fin_lotes(tenant_id, entidade_id, competencia, status);
CREATE INDEX IF NOT EXISTS idx_fin_lotes_origem ON fin_lotes(tenant_id, origem, origem_ref);
-- Idempotência real: duas chamadas com a mesma chave não criam dois lotes.
-- Índice PARCIAL (só quando há chave) — ON CONFLICT não infere índice
-- parcial, então o código consulta antes de inserir (ver ledger.js).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_lotes_idem
  ON fin_lotes(tenant_id, idempotencia) WHERE idempotencia <> '';

CREATE TABLE IF NOT EXISTS fin_linhas (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lote_id        TEXT NOT NULL REFERENCES fin_lotes(id),
  ordem          INTEGER NOT NULL DEFAULT 0,
  conta_id       TEXT NOT NULL REFERENCES fin_contas(id),
  debito_cents   INTEGER NOT NULL DEFAULT 0,
  credito_cents  INTEGER NOT NULL DEFAULT 0,
  centro_custo_id TEXT NOT NULL DEFAULT '',
  contraparte_id TEXT NOT NULL DEFAULT '',
  memo           TEXT NOT NULL DEFAULT '',
  -- Rastro até a origem: qual parcela/transação/reserva gerou esta linha.
  ref_tipo       TEXT NOT NULL DEFAULT '',
  ref_id         TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL,
  CHECK (debito_cents >= 0 AND credito_cents >= 0),
  -- Uma linha é débito OU crédito, nunca os dois, nunca nenhum.
  CHECK ((debito_cents = 0) <> (credito_cents = 0))
);
CREATE INDEX IF NOT EXISTS idx_fin_linhas_lote ON fin_linhas(tenant_id, lote_id, ordem);
CREATE INDEX IF NOT EXISTS idx_fin_linhas_conta ON fin_linhas(tenant_id, conta_id);
CREATE INDEX IF NOT EXISTS idx_fin_linhas_ref ON fin_linhas(tenant_id, ref_tipo, ref_id);

-- ==================== CONTRAPARTES E TÍTULOS =========================

CREATE TABLE IF NOT EXISTS fin_contrapartes (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id  TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL DEFAULT 'fornecedor', -- fornecedor|cliente|ambos|socio|banco
  nome         TEXT NOT NULL,
  documento    TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  telefone     TEXT NOT NULL DEFAULT '',
  -- Dados bancários são alteração de nível 3 (maker-checker) — ver rbac.js
  dados_bancarios TEXT NOT NULL DEFAULT '{}',
  externo_id   TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'ativo',
  criado_em    TEXT NOT NULL,
  criado_por   TEXT DEFAULT '',
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fin_contrapartes ON fin_contrapartes(tenant_id, entidade_id, tipo, status);
CREATE INDEX IF NOT EXISTS idx_fin_contrapartes_doc ON fin_contrapartes(tenant_id, documento);

-- Título a pagar ou a receber. O saldo devedor vem das parcelas.
CREATE TABLE IF NOT EXISTS fin_titulos (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id    TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  especie        TEXT NOT NULL,                   -- pagar|receber
  contraparte_id TEXT NOT NULL DEFAULT '',
  documento      TEXT NOT NULL DEFAULT '',        -- nº da nota/fatura
  descricao      TEXT NOT NULL DEFAULT '',
  competencia    TEXT NOT NULL,
  valor_cents    INTEGER NOT NULL DEFAULT 0,
  conta_id       TEXT NOT NULL DEFAULT '',        -- despesa/receita a apropriar
  centro_custo_id TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'aberto',  -- aberto|liquidado|cancelado
  origem         TEXT NOT NULL DEFAULT 'manual',
  origem_ref     TEXT NOT NULL DEFAULT '',
  lote_id        TEXT NOT NULL DEFAULT '',        -- lote da provisão/competência
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  cancelado_em   TEXT DEFAULT '',
  cancelado_motivo TEXT DEFAULT '',
  CHECK (especie IN ('pagar','receber')),
  CHECK (valor_cents >= 0)
);
CREATE INDEX IF NOT EXISTS idx_fin_titulos ON fin_titulos(tenant_id, entidade_id, especie, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_titulos_origem
  ON fin_titulos(tenant_id, origem, origem_ref) WHERE origem_ref <> '';

CREATE TABLE IF NOT EXISTS fin_parcelas (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo_id     TEXT NOT NULL REFERENCES fin_titulos(id),
  numero        INTEGER NOT NULL DEFAULT 1,
  vencimento    TEXT NOT NULL,
  valor_cents   INTEGER NOT NULL DEFAULT 0,
  pago_cents    INTEGER NOT NULL DEFAULT 0,       -- soma das liquidações
  status        TEXT NOT NULL DEFAULT 'aberta',   -- aberta|parcial|liquidada|cancelada
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT '',
  CHECK (valor_cents >= 0 AND pago_cents >= 0)
);
CREATE INDEX IF NOT EXISTS idx_fin_parcelas ON fin_parcelas(tenant_id, titulo_id, numero);
CREATE INDEX IF NOT EXISTS idx_fin_parcelas_venc ON fin_parcelas(tenant_id, status, vencimento);

-- Rateio do título: a mesma nota pode se dividir entre contas e centros de
-- custo (a conta de luz do compound rateada entre as quatro casas). Sem
-- isto, "resultado por imóvel" seria chute.
CREATE TABLE IF NOT EXISTS fin_titulo_rateio (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo_id       TEXT NOT NULL REFERENCES fin_titulos(id),
  ordem           INTEGER NOT NULL DEFAULT 0,
  conta_id        TEXT NOT NULL REFERENCES fin_contas(id),
  centro_custo_id TEXT NOT NULL DEFAULT '',
  valor_cents     INTEGER NOT NULL DEFAULT 0,
  memo            TEXT NOT NULL DEFAULT '',
  criado_em       TEXT NOT NULL,
  CHECK (valor_cents >= 0)
);
CREATE INDEX IF NOT EXISTS idx_fin_rateio ON fin_titulo_rateio(tenant_id, titulo_id, ordem);

-- Pagamento/recebimento efetivo. Gera lote no razão.
CREATE TABLE IF NOT EXISTS fin_liquidacoes (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parcela_id       TEXT NOT NULL REFERENCES fin_parcelas(id),
  data             TEXT NOT NULL,
  valor_cents      INTEGER NOT NULL DEFAULT 0,
  juros_cents      INTEGER NOT NULL DEFAULT 0,
  multa_cents      INTEGER NOT NULL DEFAULT 0,
  desconto_cents   INTEGER NOT NULL DEFAULT 0,
  conta_bancaria_id TEXT NOT NULL DEFAULT '',
  meio             TEXT NOT NULL DEFAULT '',      -- pix|boleto|cartao|ted|dinheiro
  lote_id          TEXT NOT NULL DEFAULT '',
  estornada        INTEGER NOT NULL DEFAULT 0,
  criado_em        TEXT NOT NULL,
  criado_por       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fin_liq ON fin_liquidacoes(tenant_id, parcela_id);

-- ==================== BANCOS E CONCILIAÇÃO ===========================

CREATE TABLE IF NOT EXISTS fin_contas_bancarias (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id   TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  banco         TEXT NOT NULL DEFAULT '',
  agencia       TEXT NOT NULL DEFAULT '',
  numero        TEXT NOT NULL DEFAULT '',
  tipo          TEXT NOT NULL DEFAULT 'corrente', -- corrente|poupanca|carteira|caixa
  moeda         TEXT NOT NULL DEFAULT 'BRL',
  conta_id      TEXT NOT NULL DEFAULT '',         -- conta contábil espelho
  saldo_inicial_cents INTEGER NOT NULL DEFAULT 0,
  saldo_inicial_data  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'ativa',
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fin_cb ON fin_contas_bancarias(tenant_id, entidade_id, status);

-- Lote de importação: proveniência de onde cada transação veio.
CREATE TABLE IF NOT EXISTS fin_importacoes (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id       TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  conta_bancaria_id TEXT NOT NULL DEFAULT '',
  formato           TEXT NOT NULL DEFAULT 'csv',  -- csv|ofx|json|api
  fonte             TEXT NOT NULL DEFAULT '',     -- 'extrato C6 2026-08', 'mercadopago'
  arquivo_hash      TEXT NOT NULL DEFAULT '',     -- sha256 do conteúdo
  linhas_lidas      INTEGER NOT NULL DEFAULT 0,
  linhas_novas      INTEGER NOT NULL DEFAULT 0,
  linhas_duplicadas INTEGER NOT NULL DEFAULT 0,
  linhas_rejeitadas INTEGER NOT NULL DEFAULT 0,
  rejeitos          TEXT NOT NULL DEFAULT '[]',   -- JSON: motivo por linha
  criado_em         TEXT NOT NULL,
  criado_por        TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fin_imp ON fin_importacoes(tenant_id, entidade_id, criado_em DESC);

-- Transação bancária importada. NÃO é lançamento contábil — é o extrato.
-- Só vira lote depois de classificada e (se preciso) aprovada.
CREATE TABLE IF NOT EXISTS fin_transacoes_banco (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id       TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  conta_bancaria_id TEXT NOT NULL REFERENCES fin_contas_bancarias(id),
  importacao_id     TEXT NOT NULL DEFAULT '',
  data              TEXT NOT NULL,
  -- Positivo = entrada, negativo = saída. Em CENTAVOS, inteiro.
  valor_cents       INTEGER NOT NULL,
  descricao         TEXT NOT NULL DEFAULT '',
  documento         TEXT NOT NULL DEFAULT '',
  contraparte_nome  TEXT NOT NULL DEFAULT '',
  contraparte_doc   TEXT NOT NULL DEFAULT '',
  -- Impressão digital para deduplicar reimportação do mesmo extrato.
  fingerprint       TEXT NOT NULL,
  bruto             TEXT NOT NULL DEFAULT '{}',   -- JSON: linha original preservada
  status            TEXT NOT NULL DEFAULT 'nova', -- nova|sugerida|aguardando_aprovacao|conciliada|ignorada
  sugestao          TEXT NOT NULL DEFAULT '{}',   -- JSON: {conta_id, centro_custo_id, confianca, regra_id, motivo}
  lote_id           TEXT NOT NULL DEFAULT '',     -- lote gerado ao conciliar
  ignorada_motivo   TEXT NOT NULL DEFAULT '',
  criado_em         TEXT NOT NULL,
  atualizado_em     TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_tb_fp ON fin_transacoes_banco(tenant_id, conta_bancaria_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_fin_tb_status ON fin_transacoes_banco(tenant_id, entidade_id, status, data);

-- Regra de classificação: casa descrição/valor → conta + centro de custo.
CREATE TABLE IF NOT EXISTS fin_regras_classificacao (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id     TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  prioridade      INTEGER NOT NULL DEFAULT 100,
  padrao          TEXT NOT NULL DEFAULT '',       -- termo buscado na descrição (case/acento-insensível)
  sentido         TEXT NOT NULL DEFAULT 'ambos',  -- entrada|saida|ambos
  valor_min_cents INTEGER NOT NULL DEFAULT 0,
  valor_max_cents INTEGER NOT NULL DEFAULT 0,     -- 0 = sem teto
  conta_id        TEXT NOT NULL DEFAULT '',
  centro_custo_id TEXT NOT NULL DEFAULT '',
  contraparte_id  TEXT NOT NULL DEFAULT '',
  confianca       INTEGER NOT NULL DEFAULT 80,    -- 0-100
  -- Aprendida com o usuário confirmando uma sugestão, ou escrita à mão.
  origem          TEXT NOT NULL DEFAULT 'manual', -- manual|aprendida|sistema
  acertos         INTEGER NOT NULL DEFAULT 0,
  erros           INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'ativa',
  criado_em       TEXT NOT NULL,
  criado_por      TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fin_regras ON fin_regras_classificacao(tenant_id, entidade_id, status, prioridade);

-- ====================== ORÇAMENTO (fase 4) ===========================
-- Versionado de propósito: "o orçamento aprovado em janeiro" e "a revisão
-- de julho" são coisas diferentes, e comparar o realizado com a versão
-- errada é pior do que não comparar.

CREATE TABLE IF NOT EXISTS fin_orcamentos (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id   TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  exercicio     TEXT NOT NULL,                   -- AAAA
  versao        INTEGER NOT NULL DEFAULT 1,
  cenario       TEXT NOT NULL DEFAULT 'base',    -- base|otimista|pessimista
  status        TEXT NOT NULL DEFAULT 'rascunho',-- rascunho|aprovado|arquivado
  aprovado_em   TEXT NOT NULL DEFAULT '',
  aprovado_por  TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL,
  criado_por    TEXT DEFAULT '',
  CHECK (status IN ('rascunho','aprovado','arquivado'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_orc ON fin_orcamentos(tenant_id, entidade_id, exercicio, cenario, versao);

CREATE TABLE IF NOT EXISTS fin_orcamento_linhas (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  orcamento_id    TEXT NOT NULL REFERENCES fin_orcamentos(id) ON DELETE CASCADE,
  conta_id        TEXT NOT NULL REFERENCES fin_contas(id),
  centro_custo_id TEXT NOT NULL DEFAULT '',
  competencia     TEXT NOT NULL,                 -- AAAA-MM
  valor_cents     INTEGER NOT NULL DEFAULT 0,
  memo            TEXT NOT NULL DEFAULT '',
  criado_em       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_orc_linha
  ON fin_orcamento_linhas(tenant_id, orcamento_id, conta_id, centro_custo_id, competencia);
CREATE INDEX IF NOT EXISTS idx_fin_orc_linha_comp ON fin_orcamento_linhas(tenant_id, orcamento_id, competencia);

-- ==================== APROVAÇÕES (maker-checker) =====================

CREATE TABLE IF NOT EXISTS fin_aprovacoes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade_id    TEXT NOT NULL DEFAULT '',
  acao           TEXT NOT NULL,                   -- catálogo em rbac.js
  nivel          INTEGER NOT NULL DEFAULT 2,      -- 0..4 (níveis de risco)
  objeto_tipo    TEXT NOT NULL DEFAULT '',
  objeto_id      TEXT NOT NULL DEFAULT '',
  payload        TEXT NOT NULL DEFAULT '{}',      -- JSON: o que será feito
  previa         TEXT NOT NULL DEFAULT '{}',      -- JSON: impacto calculado antes
  valor_cents    INTEGER NOT NULL DEFAULT 0,      -- para alçada
  solicitante    TEXT NOT NULL DEFAULT '',
  solicitado_em  TEXT NOT NULL,
  motivo         TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pendente',-- pendente|aprovada|recusada|expirada|executada|falhou
  decisor        TEXT NOT NULL DEFAULT '',
  decidido_em    TEXT NOT NULL DEFAULT '',
  decisao_motivo TEXT NOT NULL DEFAULT '',
  expira_em      TEXT NOT NULL DEFAULT '',
  resultado      TEXT NOT NULL DEFAULT '{}',      -- JSON: o que a execução produziu
  executado_em   TEXT NOT NULL DEFAULT '',
  correlation_id TEXT NOT NULL DEFAULT '',
  CHECK (nivel BETWEEN 0 AND 4)
);
CREATE INDEX IF NOT EXISTS idx_fin_aprov ON fin_aprovacoes(tenant_id, status, solicitado_em DESC);

-- ==================== EVIDÊNCIAS E EVENTOS ===========================

CREATE TABLE IF NOT EXISTS fin_evidencias (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  objeto_tipo TEXT NOT NULL,
  objeto_id   TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'documento',
  nome        TEXT NOT NULL DEFAULT '',
  mime        TEXT NOT NULL DEFAULT '',
  tamanho     INTEGER NOT NULL DEFAULT 0,
  sha256      TEXT NOT NULL DEFAULT '',
  chave       TEXT NOT NULL DEFAULT '',           -- caminho no R2
  criado_em   TEXT NOT NULL,
  criado_por  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fin_evid ON fin_evidencias(tenant_id, objeto_tipo, objeto_id);

-- Outbox: mudança de estado que precisa de processamento assíncrono.
CREATE TABLE IF NOT EXISTS fin_eventos (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT '',
  tipo           TEXT NOT NULL,
  payload        TEXT NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'pendente',-- pendente|processado|falhou
  tentativas     INTEGER NOT NULL DEFAULT 0,
  proxima_em     TEXT NOT NULL DEFAULT '',
  erro           TEXT NOT NULL DEFAULT '',
  correlation_id TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL,
  processado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fin_eventos ON fin_eventos(status, proxima_em);

-- ======================== TRIGGERS (invariantes) =====================
-- Isto não é cinto de segurança de código — é do banco. Um bug futuro em
-- qualquer serviço esbarra aqui antes de corromper o razão.

-- 1. Lote contabilizado é imutável. Só as colunas de estorno podem mudar.
CREATE TRIGGER IF NOT EXISTS trg_fin_lote_imutavel
BEFORE UPDATE ON fin_lotes
FOR EACH ROW WHEN OLD.status = 'contabilizado' AND (
     NEW.entidade_id <> OLD.entidade_id
  OR NEW.numero      <> OLD.numero
  OR NEW.data        <> OLD.data
  OR NEW.competencia <> OLD.competencia
  OR NEW.total_cents <> OLD.total_cents
  OR NEW.origem      <> OLD.origem
  OR NEW.criado_em   <> OLD.criado_em
  OR NEW.contabilizado_em <> OLD.contabilizado_em
)
BEGIN
  SELECT RAISE(ABORT, 'lote contabilizado e imutavel: corrija por estorno');
END;

-- 2. Lote contabilizado não se apaga. Nunca.
CREATE TRIGGER IF NOT EXISTS trg_fin_lote_sem_delete
BEFORE DELETE ON fin_lotes
FOR EACH ROW WHEN OLD.status IN ('contabilizado','estornado')
BEGIN
  SELECT RAISE(ABORT, 'lote contabilizado nao pode ser excluido');
END;

-- 3. Linha de lote contabilizado é imutável.
CREATE TRIGGER IF NOT EXISTS trg_fin_linha_imutavel
BEFORE UPDATE ON fin_linhas
FOR EACH ROW WHEN (SELECT status FROM fin_lotes WHERE id = OLD.lote_id) <> 'rascunho'
BEGIN
  SELECT RAISE(ABORT, 'linha de lote contabilizado e imutavel');
END;

CREATE TRIGGER IF NOT EXISTS trg_fin_linha_sem_delete
BEFORE DELETE ON fin_linhas
FOR EACH ROW WHEN (SELECT status FROM fin_lotes WHERE id = OLD.lote_id) <> 'rascunho'
BEGIN
  SELECT RAISE(ABORT, 'linha de lote contabilizado nao pode ser excluida');
END;

-- 4. Período fechado não recebe lançamento novo. A reabertura é
--    autorizada e auditada (ver periodos.js) — não se contorna aqui.
CREATE TRIGGER IF NOT EXISTS trg_fin_periodo_fechado
BEFORE INSERT ON fin_lotes
FOR EACH ROW WHEN EXISTS (
  SELECT 1 FROM fin_periodos p
   WHERE p.tenant_id = NEW.tenant_id AND p.entidade_id = NEW.entidade_id
     AND p.competencia = NEW.competencia AND p.status = 'fechado'
)
BEGIN
  SELECT RAISE(ABORT, 'periodo fechado: reabra o periodo para lancar nesta competencia');
END;

-- 5. Lançamento só em conta analítica e ativa.
CREATE TRIGGER IF NOT EXISTS trg_fin_linha_conta_analitica
BEFORE INSERT ON fin_linhas
FOR EACH ROW WHEN (
  SELECT aceita_lancamento FROM fin_contas WHERE id = NEW.conta_id
) <> 1
BEGIN
  SELECT RAISE(ABORT, 'conta sintetica nao aceita lancamento');
END;

-- 6. Auditoria é append-only.
CREATE TRIGGER IF NOT EXISTS trg_fin_audit_sem_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'auditoria e append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_fin_audit_sem_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'auditoria e append-only');
END;
