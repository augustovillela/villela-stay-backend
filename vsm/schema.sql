-- =====================================================================
-- Villela Stay Manager (VSM) — plano comercial (control plane) do produto
-- "sistema de gestão de hospedagem por temporada" vendido a outros
-- anfitriões e gestores de aluguel por temporada.
--
-- Este é o MÓDULO COMERCIAL: cadastra operações/empresas (tenants),
-- gerencia planos/limites/módulos/flags, trial, cobrança recorrente
-- (Mercado Pago), upgrade/downgrade, suspensão por inadimplência, tickets,
-- métricas de uso, custo por cliente e o painel da plataforma. Banco próprio
-- em DATA_DIR/vsm/ — isolado dos demais SaaS.
--
-- Convenções (iguais aos outros módulos): CREATE ... IF NOT EXISTS,
-- IDs TEXT url-safe, datas ISO-8601, dinheiro em CENTAVOS, JSON em TEXT.
-- O app de gestão real multi-tenant (reservas/limpeza conectados ao channel
-- manager de cada cliente) é o próximo marco — ver README §Roadmap. Aqui mora
-- o relacionamento comercial + entitlements que gateiam a entrega.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, aplicada_em TEXT NOT NULL
);

-- ---- PLANOS (com módulos, limites e feature flags por plano) ----
CREATE TABLE IF NOT EXISTS plans (
  id             TEXT PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,      -- trial|starter|pro|business|enterprise
  nome           TEXT NOT NULL,
  descricao      TEXT DEFAULT '',
  preco_centavos INTEGER DEFAULT 0,         -- mensal; 0 = sob consulta (enterprise)
  ciclo          TEXT DEFAULT 'mensal',     -- mensal|anual
  limites        TEXT DEFAULT '{}',         -- JSON: {imoveis, usuarios, reservas_mes, ia_consultas_mes, armazenamento_mb, workspaces}
  modulos        TEXT DEFAULT '[]',         -- JSON: chaves liberadas (imoveis, reservas, canais, limpeza, financeiro, ia...)
  flags          TEXT DEFAULT '{}',         -- JSON: {ia_direta:true, api_publica:false, white_label:false}
  ativo          INTEGER DEFAULT 1,
  ordem          INTEGER DEFAULT 0,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT DEFAULT ''
);

-- ---- OPERAÇÕES / EMPRESAS (tenants) ----
CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,     -- p/ subdomínio/URL futura
  nome            TEXT NOT NULL,            -- razão social / nome da operação de hospedagem
  cnpj            TEXT DEFAULT '',
  site            TEXT DEFAULT '',          -- site/perfil do anfitrião (Airbnb/Booking/próprio)
  email_contato   TEXT DEFAULT '',
  telefone        TEXT DEFAULT '',
  status          TEXT DEFAULT 'trial',     -- trial|ativa|inadimplente|suspensa|cancelada
  plan_id         TEXT DEFAULT '',          -- plano corrente (denormalizado p/ rapidez)
  trial_expira_em TEXT DEFAULT '',
  origem          TEXT DEFAULT '',          -- landing|indicacao|manual
  obs             TEXT DEFAULT '',
  criado_em       TEXT NOT NULL,
  atualizado_em   TEXT DEFAULT '',
  criado_por      TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Overrides por tenant: limites/módulos/flags extras negociados (Enterprise etc.)
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id     TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  limites_over  TEXT DEFAULT '{}',   -- sobrepõe limites do plano (merge)
  modulos_extra TEXT DEFAULT '[]',   -- módulos adicionais além do plano
  flags_over    TEXT DEFAULT '{}',   -- sobrepõe flags do plano
  atualizado_em TEXT DEFAULT ''
);

-- ---- WORKSPACES (uma operação pode ter N espaços: marcas/prédios/regiões) ----
CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  slug          TEXT DEFAULT '',
  provisionado  INTEGER DEFAULT 0,   -- 1 = instância de gestão provisionada (marco futuro)
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspaces_tenant ON workspaces(tenant_id);

-- ---- USUÁRIOS da operação (login do assinante, isolado do staff) ----
CREATE TABLE IF NOT EXISTS tenant_users (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL,
  senha_hash   TEXT DEFAULT '',      -- vazio = convidado, senha não definida
  papel        TEXT DEFAULT 'admin', -- admin|usuario (dono da operação = admin)
  ativo        INTEGER DEFAULT 1,
  criado_em    TEXT NOT NULL,
  ultimo_login TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_users_email ON tenant_users(lower(email));

-- ---- ASSINATURAS (recorrência MP) ----
CREATE TABLE IF NOT EXISTS subscriptions (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id          TEXT NOT NULL,
  status           TEXT DEFAULT 'trial', -- trial|pendente|ativa|inadimplente|cancelada
  ciclo            TEXT DEFAULT 'mensal',
  inicio           TEXT NOT NULL,
  fim              TEXT DEFAULT '',
  proximo_venc     TEXT DEFAULT '',
  mp_preapproval_id TEXT DEFAULT '',
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_subs_tenant ON subscriptions(tenant_id, status);

-- ---- FATURAS / COBRANÇAS ----
CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  competencia   TEXT DEFAULT '',      -- 'YYYY-MM'
  vencimento    TEXT DEFAULT '',
  status        TEXT DEFAULT 'aberta', -- aberta|paga|vencida|cancelada
  mp_payment_id TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  pago_em       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vsm_invoices_mppay ON invoices(mp_payment_id) WHERE mp_payment_id != '';

-- ---- MÉTRICAS DE USO (por tenant / período / métrica) ----
CREATE TABLE IF NOT EXISTS usage_records (
  tenant_id     TEXT NOT NULL,
  periodo       TEXT NOT NULL,       -- 'YYYY-MM'
  metrica       TEXT NOT NULL,       -- imoveis|usuarios|reservas_mes|ia_consultas|armazenamento_mb|api_chamadas
  quantidade    INTEGER DEFAULT 0,
  atualizado_em TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, periodo, metrica)
);

-- ---- CUSTO POR CLIENTE (o que o tenant custa à plataforma) ----
CREATE TABLE IF NOT EXISTS cost_records (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  periodo       TEXT NOT NULL,       -- 'YYYY-MM'
  categoria     TEXT NOT NULL,       -- ia|armazenamento|infra|suporte|canais|outro
  custo_centavos INTEGER DEFAULT 0,  -- em CENTAVOS de BRL (estimado)
  detalhe       TEXT DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_tenant ON cost_records(tenant_id, periodo);

-- ---- FEATURE FLAGS globais (override por tenant vive em tenant_settings.flags_over) ----
CREATE TABLE IF NOT EXISTS feature_flags (
  chave       TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  descricao   TEXT DEFAULT '',
  padrao      INTEGER DEFAULT 0,     -- valor default quando plano/tenant não definem
  atualizado_em TEXT DEFAULT ''
);

-- ---- SUPORTE / TICKETS ----
CREATE TABLE IF NOT EXISTS tickets (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assunto      TEXT NOT NULL,
  prioridade   TEXT DEFAULT 'media', -- alta|media|baixa
  status       TEXT DEFAULT 'aberto', -- aberto|em_andamento|respondido|resolvido|fechado
  aberto_por   TEXT DEFAULT '',      -- e-mail do usuário do tenant
  criado_em    TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  autor      TEXT DEFAULT '',
  lado       TEXT NOT NULL DEFAULT 'cliente', -- cliente|plataforma
  texto      TEXT NOT NULL,
  criado_em  TEXT NOT NULL
);

-- ---- LEADS (signup/trial da landing antes de virar tenant, e "sob consulta") ----
CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  nome       TEXT DEFAULT '',
  empresa    TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  telefone   TEXT DEFAULT '',
  plano      TEXT DEFAULT '',
  mensagem   TEXT DEFAULT '',
  status     TEXT DEFAULT 'novo',  -- novo|contatado|convertido|descartado
  tenant_id  TEXT DEFAULT '',      -- preenchido quando converte
  criado_em  TEXT NOT NULL
);

-- ---- LOGS de eventos da plataforma (billing/webhook/lifecycle) ----
CREATE TABLE IF NOT EXISTS platform_events (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT DEFAULT '',
  tipo       TEXT NOT NULL,        -- ex.: tenant.criado, billing.assinar, webhook.mp, tenant.suspenso
  ref        TEXT DEFAULT '',
  payload    TEXT DEFAULT '',      -- JSON
  quando     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_quando ON platform_events(quando);

-- ---- AUDITORIA (ações administrativas) ----
CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  quando     TEXT NOT NULL,
  tenant_id  TEXT DEFAULT '',
  quem       TEXT DEFAULT '',      -- e-mail/nome ou 'plataforma'
  acao       TEXT NOT NULL,
  entidade   TEXT DEFAULT '',
  entidade_id TEXT DEFAULT '',
  detalhe    TEXT DEFAULT '',
  ip         TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vsm_audit_quando ON audit_logs(quando);

-- =====================================================================
-- APP DE GESTÃO REAL (marco 2) — mini-PMS multi-tenant que o ASSINANTE usa.
-- Todas as tabelas escopadas por tenant_id (isolamento lógico, igual vdocs).
-- Gateadas pelos entitlements do plano (podeModulo/dentroLimite). Cada
-- operação gerencia os PRÓPRIOS imóveis/reservas/limpezas/financeiro — nada
-- a ver com a conta Stays da Villela (control plane ≠ app do cliente).
-- =====================================================================

-- ---- IMÓVEIS / ANÚNCIOS do assinante ----
CREATE TABLE IF NOT EXISTS app_imoveis (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  workspace_id  TEXT DEFAULT '',
  codigo        TEXT DEFAULT '',       -- código interno do anfitrião
  nome          TEXT NOT NULL,
  tipo          TEXT DEFAULT 'casa',   -- casa|apartamento|flat|quarto|chale|pousada
  quartos       INTEGER DEFAULT 0,
  capacidade    INTEGER DEFAULT 1,
  endereco      TEXT DEFAULT '',
  comodidades   TEXT DEFAULT '[]',     -- JSON
  tarifa_base_centavos INTEGER DEFAULT 0,
  ativo         INTEGER DEFAULT 1,
  obs           TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_app_imoveis_tenant ON app_imoveis(tenant_id);

-- ---- HÓSPEDES do assinante ----
CREATE TABLE IF NOT EXISTS app_hospedes (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  nome       TEXT NOT NULL,
  email      TEXT DEFAULT '',
  telefone   TEXT DEFAULT '',
  documento  TEXT DEFAULT '',
  obs        TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_hospedes_tenant ON app_hospedes(tenant_id);

-- ---- RESERVAS do assinante ----
CREATE TABLE IF NOT EXISTS app_reservas (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  imovel_id     TEXT NOT NULL,
  hospede_id    TEXT DEFAULT '',
  hospede_nome  TEXT DEFAULT '',       -- denormalizado p/ listagem rápida
  checkin       TEXT NOT NULL,         -- YYYY-MM-DD
  checkout      TEXT NOT NULL,         -- YYYY-MM-DD
  noites        INTEGER DEFAULT 1,
  hospedes_qtd  INTEGER DEFAULT 1,
  valor_centavos INTEGER DEFAULT 0,
  canal         TEXT DEFAULT 'direto', -- direto|airbnb|booking|vrbo|decolar|outro
  status        TEXT DEFAULT 'confirmada', -- pendente|confirmada|cancelada|concluida
  obs           TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_app_reservas_tenant ON app_reservas(tenant_id, checkin);
CREATE INDEX IF NOT EXISTS idx_app_reservas_imovel ON app_reservas(imovel_id, status);

-- ---- LIMPEZAS / OPERAÇÕES ----
CREATE TABLE IF NOT EXISTS app_limpezas (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  imovel_id    TEXT NOT NULL,
  reserva_id   TEXT DEFAULT '',
  data         TEXT NOT NULL,          -- YYYY-MM-DD
  tipo         TEXT DEFAULT 'checkout', -- checkout|checkin|periodica
  status       TEXT DEFAULT 'pendente', -- pendente|concluida
  responsavel  TEXT DEFAULT '',
  obs          TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  concluida_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_app_limpezas_tenant ON app_limpezas(tenant_id, data);

-- ---- MANUTENÇÃO (chamados) ----
CREATE TABLE IF NOT EXISTS app_manutencao (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  imovel_id    TEXT DEFAULT '',
  titulo       TEXT NOT NULL,
  descricao    TEXT DEFAULT '',
  prioridade   TEXT DEFAULT 'media',  -- alta|media|baixa
  status       TEXT DEFAULT 'aberto', -- aberto|em_andamento|resolvido
  criado_em    TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_app_manut_tenant ON app_manutencao(tenant_id, status);

-- ---- FINANCEIRO (lançamentos: receitas/despesas) ----
CREATE TABLE IF NOT EXISTS app_financeiro (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  tipo          TEXT NOT NULL,         -- receita|despesa
  categoria     TEXT DEFAULT '',       -- hospedagem|limpeza|manutencao|comissao|imposto|outro
  descricao     TEXT DEFAULT '',
  valor_centavos INTEGER DEFAULT 0,
  data          TEXT NOT NULL,         -- YYYY-MM-DD
  imovel_id     TEXT DEFAULT '',
  reserva_id    TEXT DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_fin_tenant ON app_financeiro(tenant_id, data);

-- ---- CONEXÃO STAYS.NET do assinante (channel manager) ----
-- Cada operação traz a PRÓPRIA conta Stays.net (que já fala com Airbnb/Booking/
-- Decolar/Vrbo/Expedia/Google...). Guardamos as credenciais no disco do produto
-- (nunca em commit/resposta; a API só devolve versão mascarada). Módulo 'canais'.
CREATE TABLE IF NOT EXISTS app_stays_conta (
  tenant_id     TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  base_url      TEXT NOT NULL,          -- ex.: https://<conta>.stays.com.br/external/v1
  client_id     TEXT NOT NULL,
  secret        TEXT NOT NULL,          -- credencial do TENANT (nunca exposta)
  status        TEXT DEFAULT 'conectada', -- conectada|erro
  ultimo_sync   TEXT DEFAULT '',
  ultimo_erro   TEXT DEFAULT '',
  imoveis_sync  INTEGER DEFAULT 0,
  reservas_sync INTEGER DEFAULT 0,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);

-- ---- WEB PUSH do painel (PWA): assinaturas de notificação por usuário ----
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint   TEXT PRIMARY KEY,      -- endpoint único da PushSubscription
  tenant_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  dados      TEXT NOT NULL,         -- JSON completo da PushSubscription
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_subs_tenant ON push_subs(tenant_id);

-- ---- TOKENS DE API do assinante (flag api_publica) ----
-- Token fixo p/ integrações do cliente (scripts, Claude Code) sem depender do
-- cookie vsm_sess. Guardamos só o hash SHA-256; o token é exibido UMA vez.
CREATE TABLE IF NOT EXISTS app_api_tokens (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,         -- tenant_users.id que o token personifica
  nome        TEXT DEFAULT '',       -- rótulo ("Claude Code", "planilha"...)
  token_hash  TEXT NOT NULL UNIQUE,  -- sha256 hex do token
  prefixo     TEXT DEFAULT '',       -- 'vsm_ab12…' p/ identificação visual
  criado_em   TEXT NOT NULL,
  ultimo_uso  TEXT DEFAULT '',
  revogado_em TEXT DEFAULT ''        -- '' = ativo
);
CREATE INDEX IF NOT EXISTS idx_app_tokens_tenant ON app_api_tokens(tenant_id);

-- ---- ESTOQUE (módulo 'estoque'): insumos p/ receber o hóspede ----
CREATE TABLE IF NOT EXISTS app_estoque (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  nome          TEXT NOT NULL,
  categoria     TEXT DEFAULT 'limpeza', -- limpeza|pessoal|outro
  unidade       TEXT DEFAULT 'un',
  quantidade    INTEGER DEFAULT 0,
  minimo        INTEGER DEFAULT 0,      -- abaixo disso = em falta (alerta)
  por_reserva   INTEGER DEFAULT 0,      -- consumo padrão na baixa por reserva
  obs           TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_app_estoque_tenant ON app_estoque(tenant_id);

CREATE TABLE IF NOT EXISTS app_estoque_mov (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  delta      INTEGER NOT NULL,       -- + entrada / − baixa
  motivo     TEXT DEFAULT '',        -- compra|reserva|ajuste|perda
  reserva_id TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_estoque_mov ON app_estoque_mov(tenant_id, item_id);

-- ---- CONSULTAS (mini-funil pré-reserva; módulo 'reservas') ----
-- Interessado que ainda não fechou: nova → respondida → pendencia →
-- convertida (vira reserva, guarda reserva_id) | perdida.
CREATE TABLE IF NOT EXISTS app_consultas (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  imovel_id     TEXT DEFAULT '',
  hospede_nome  TEXT NOT NULL,
  contato       TEXT DEFAULT '',        -- telefone/e-mail/perfil
  canal         TEXT DEFAULT 'airbnb',  -- airbnb|booking|direto|instagram|outro
  checkin       TEXT DEFAULT '',        -- YYYY-MM-DD (se já falou datas)
  checkout      TEXT DEFAULT '',
  hospedes_qtd  INTEGER DEFAULT 1,
  valor_cotado_centavos INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'nova',    -- nova|respondida|pendencia|convertida|perdida
  obs           TEXT DEFAULT '',
  reserva_id    TEXT DEFAULT '',        -- preenchido ao converter
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_app_consultas_tenant ON app_consultas(tenant_id, status);

-- ---- PRECIFICAÇÃO assistida (módulo 'precificacao') ----
-- Parâmetros de custo por imóvel p/ calcular o PREÇO MÍNIMO com lucro:
-- (fixos/noites + variável/noite) / (1 − comissão% − imposto% − margem%).
CREATE TABLE IF NOT EXISTS app_precificacao (
  tenant_id     TEXT NOT NULL,
  imovel_id     TEXT NOT NULL,
  faxina_centavos      INTEGER DEFAULT 0,  -- custo fixo por estadia
  lavanderia_centavos  INTEGER DEFAULT 0,  -- custo fixo por estadia
  insumos_centavos     INTEGER DEFAULT 0,  -- kit/amenities por estadia
  custo_noite_centavos INTEGER DEFAULT 0,  -- variável por noite (luz, gás...)
  comissao_pct  REAL DEFAULT 15,           -- comissão do canal (Airbnb ~15)
  imposto_pct   REAL DEFAULT 0,            -- alíquota efetiva (DARF/DAS c/ contador)
  margem_pct    REAL DEFAULT 20,           -- lucro desejado
  atualizado_em TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, imovel_id)
);

-- ---- WEBHOOKS de eventos do app (flag api_publica) ----
-- Entrega assíncrona (fire-and-forget c/ HMAC) de reserva.criada/confirmada/
-- cancelada/concluida e estoque.baixo para integrações do assinante.
CREATE TABLE IF NOT EXISTS app_webhooks (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  segredo      TEXT NOT NULL,        -- HMAC-SHA256 do corpo (X-VSM-Assinatura)
  eventos      TEXT DEFAULT '[]',    -- JSON; [] = todos os eventos
  ativo        INTEGER DEFAULT 1,
  falhas       INTEGER DEFAULT 0,    -- consecutivas; 20+ desativa sozinho
  ultimo_envio TEXT DEFAULT '',
  ultimo_erro  TEXT DEFAULT '',
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_webhooks_tenant ON app_webhooks(tenant_id);
