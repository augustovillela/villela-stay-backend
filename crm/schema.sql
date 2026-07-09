-- =====================================================================
-- Villela CRM — CRM inteligente multicanal do Grupo Villela Stay,
-- vendido como SaaS a assinantes externos (7º produto do portfólio).
--
-- Duas camadas no MESMO banco (DATA_DIR/crm/crm.db), isolamento lógico
-- por tenant_id (padrão vdocs/vsm):
--   1) CONTROL PLANE: planos, tenants, usuários por empresa (papéis),
--      assinaturas MP, uso/limites, tickets, auditoria.
--   2) APP CRM (prefixo crm_): funis/estágios, contatos, empresas,
--      oportunidades, tarefas/follow-ups, timeline, templates, propostas,
--      campanhas, scoring, config por tenant, logs de agentes.
--
-- Convenções do grupo: CREATE IF NOT EXISTS, IDs TEXT url-safe, datas
-- ISO-8601, dinheiro em CENTAVOS, JSON em TEXT.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, aplicada_em TEXT NOT NULL
);

-- ============================ CONTROL PLANE ============================

CREATE TABLE IF NOT EXISTS plans (
  id             TEXT PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,      -- trial|starter|professional|business|enterprise
  nome           TEXT NOT NULL,
  descricao      TEXT DEFAULT '',
  preco_centavos INTEGER DEFAULT 0,
  ciclo          TEXT DEFAULT 'mensal',
  limites        TEXT DEFAULT '{}',         -- JSON: {contatos, usuarios, funis, campanhas_mes, ia_mes, templates}
  modulos        TEXT DEFAULT '[]',         -- JSON: chaves liberadas
  flags          TEXT DEFAULT '{}',         -- JSON: {automacoes, ia, api_publica, whatsapp_api, white_label}
  ativo          INTEGER DEFAULT 1,
  ordem          INTEGER DEFAULT 0,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  nome            TEXT NOT NULL,             -- empresa assinante
  cnpj            TEXT DEFAULT '',
  site            TEXT DEFAULT '',
  email_contato   TEXT DEFAULT '',
  telefone        TEXT DEFAULT '',
  status          TEXT DEFAULT 'trial',      -- trial|ativa|inadimplente|suspensa|cancelada
  plan_id         TEXT DEFAULT '',
  trial_expira_em TEXT DEFAULT '',
  origem          TEXT DEFAULT '',           -- landing|indicacao|manual|interno
  obs             TEXT DEFAULT '',
  criado_em       TEXT NOT NULL,
  atualizado_em   TEXT DEFAULT '',
  criado_por      TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_tenants_status ON tenants(status);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id     TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  limites_over  TEXT DEFAULT '{}',
  modulos_extra TEXT DEFAULT '[]',
  flags_over    TEXT DEFAULT '{}',
  atualizado_em TEXT DEFAULT ''
);

-- usuários da empresa assinante (papéis do produto: owner|admin|gestor|vendedor|atendente|financeiro|marketing|leitura)
CREATE TABLE IF NOT EXISTS tenant_users (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL,
  senha_hash   TEXT DEFAULT '',
  papel        TEXT DEFAULT 'owner',
  ativo        INTEGER DEFAULT 1,
  criado_em    TEXT NOT NULL,
  ultimo_login TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_tusers_email ON tenant_users(lower(email));

CREATE TABLE IF NOT EXISTS subscriptions (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id           TEXT NOT NULL,
  status            TEXT DEFAULT 'trial',   -- trial|pendente|ativa|inadimplente|cancelada
  ciclo             TEXT DEFAULT 'mensal',
  inicio            TEXT NOT NULL,
  fim               TEXT DEFAULT '',
  proximo_venc      TEXT DEFAULT '',
  mp_preapproval_id TEXT DEFAULT '',
  criado_em         TEXT NOT NULL,
  atualizado_em     TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_subs_tenant ON subscriptions(tenant_id, status);

CREATE TABLE IF NOT EXISTS invoices (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  competencia    TEXT DEFAULT '',
  vencimento     TEXT DEFAULT '',
  status         TEXT DEFAULT 'aberta',     -- aberta|paga|vencida|cancelada
  mp_payment_id  TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  pago_em        TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_invoices_tenant ON invoices(tenant_id, status);

CREATE TABLE IF NOT EXISTS usage_records (
  tenant_id     TEXT NOT NULL,
  periodo       TEXT NOT NULL,
  metrica       TEXT NOT NULL,
  quantidade    INTEGER DEFAULT 0,
  atualizado_em TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, periodo, metrica)
);

CREATE TABLE IF NOT EXISTS feature_flags (
  chave         TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  descricao     TEXT DEFAULT '',
  padrao        INTEGER DEFAULT 0,
  atualizado_em TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tickets (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assunto       TEXT NOT NULL,
  prioridade    TEXT DEFAULT 'media',
  status        TEXT DEFAULT 'aberto',
  aberto_por    TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id        TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  autor     TEXT DEFAULT '',
  lado      TEXT NOT NULL DEFAULT 'cliente',
  texto     TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

-- leads da LANDING do produto (interessados em assinar o Villela CRM)
CREATE TABLE IF NOT EXISTS saas_leads (
  id        TEXT PRIMARY KEY,
  nome      TEXT DEFAULT '',
  empresa   TEXT DEFAULT '',
  email     TEXT DEFAULT '',
  telefone  TEXT DEFAULT '',
  plano     TEXT DEFAULT '',
  mensagem  TEXT DEFAULT '',
  status    TEXT DEFAULT 'novo',
  tenant_id TEXT DEFAULT '',
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_events (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT DEFAULT '',
  tipo      TEXT NOT NULL,
  ref       TEXT DEFAULT '',
  payload   TEXT DEFAULT '',
  quando    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_events_quando ON platform_events(quando);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  quando      TEXT NOT NULL,
  tenant_id   TEXT DEFAULT '',
  quem        TEXT DEFAULT '',
  acao        TEXT NOT NULL,
  entidade    TEXT DEFAULT '',
  entidade_id TEXT DEFAULT '',
  detalhe     TEXT DEFAULT '',
  ip          TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_audit_quando ON audit_logs(quando);

-- ============================ APP CRM (por tenant) ============================

-- configuração do CRM do tenant: origens extras, motivos, regras de scoring,
-- SLA, token do webhook de entrada, canais — tudo JSON editável.
CREATE TABLE IF NOT EXISTS crm_config (
  tenant_id     TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  config        TEXT DEFAULT '{}',
  webhook_token TEXT DEFAULT '',
  atualizado_em TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_config_token ON crm_config(webhook_token);

-- ---- FUNIS (pipelines) configuráveis + estágios ----
CREATE TABLE IF NOT EXISTS crm_funis (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  nome      TEXT NOT NULL,
  slug      TEXT DEFAULT '',
  padrao    INTEGER DEFAULT 0,
  ativo     INTEGER DEFAULT 1,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_funis_tenant ON crm_funis(tenant_id);

CREATE TABLE IF NOT EXISTS crm_estagios (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  funil_id  TEXT NOT NULL REFERENCES crm_funis(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  ordem     INTEGER DEFAULT 0,
  tipo      TEXT DEFAULT 'aberto',   -- aberto|ganho|perdido
  cor       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_estagios_funil ON crm_estagios(funil_id, ordem);

-- ---- EMPRESAS (contas B2B) ----
CREATE TABLE IF NOT EXISTS crm_empresas (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  nome          TEXT NOT NULL,
  cnpj          TEXT DEFAULT '',
  site          TEXT DEFAULT '',
  segmento      TEXT DEFAULT '',
  cidade        TEXT DEFAULT '',
  estado        TEXT DEFAULT '',
  telefone      TEXT DEFAULT '',
  obs           TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_empresas_tenant ON crm_empresas(tenant_id);

-- ---- CONTATOS / LEADS (ficha completa) ----
CREATE TABLE IF NOT EXISTS crm_contatos (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  nome              TEXT DEFAULT '',
  sobrenome         TEXT DEFAULT '',
  telefone          TEXT DEFAULT '',      -- E.164 normalizado (chave de dedupe c/ email)
  whatsapp          TEXT DEFAULT '',
  email             TEXT DEFAULT '',
  empresa_id        TEXT DEFAULT '',
  empresa_nome      TEXT DEFAULT '',      -- texto livre quando não há ficha de empresa
  cargo             TEXT DEFAULT '',
  cidade            TEXT DEFAULT '',
  estado            TEXT DEFAULT '',
  pais              TEXT DEFAULT 'BR',
  idioma            TEXT DEFAULT 'pt',
  tipo              TEXT DEFAULT 'lead',  -- lead-hospedagem|lead-evento|hospede|cliente-recorrente|proprietario|parceiro|fornecedor|aluno|comprador-livro|cliente-juridico|lead-b2b|assinante-saas|empresa|outro|lead
  -- procedência
  origem            TEXT DEFAULT '',      -- site|landing|whatsapp|instagram|facebook|tiktok|google-ads|meta-ads|indicacao|airbnb|booking|decolar|google-business|email|ligacao|qrcode|evento|campanha|importacao|busca-ativa|agente-ia|api|formulario-externo|outro
  canal_entrada     TEXT DEFAULT '',
  campanha          TEXT DEFAULT '',
  anuncio           TEXT DEFAULT '',
  palavra_chave     TEXT DEFAULT '',
  utm               TEXT DEFAULT '{}',    -- JSON {source, medium, campaign, content, term}
  pagina_entrada    TEXT DEFAULT '',
  formulario        TEXT DEFAULT '',
  dispositivo       TEXT DEFAULT '',
  localizacao       TEXT DEFAULT '',
  primeira_mensagem TEXT DEFAULT '',
  -- interesse comercial
  interesse         TEXT DEFAULT '',
  produto_interesse TEXT DEFAULT '',
  orcamento_centavos INTEGER DEFAULT 0,   -- orçamento estimado do cliente
  ticket_centavos   INTEGER DEFAULT 0,    -- ticket potencial p/ nós
  -- gestão
  status            TEXT DEFAULT 'ativo', -- ativo|arquivado
  responsavel       TEXT DEFAULT '',      -- tenant_users.id (ou nome livre)
  prioridade        TEXT DEFAULT 'media', -- alta|media|baixa
  score             INTEGER DEFAULT 0,    -- 0-100 (lead scoring)
  tags              TEXT DEFAULT '[]',    -- JSON array
  obs               TEXT DEFAULT '',
  proxima_acao      TEXT DEFAULT '',
  proxima_acao_em   TEXT DEFAULT '',      -- YYYY-MM-DD
  motivo_perda      TEXT DEFAULT '',
  motivo_ganho      TEXT DEFAULT '',
  consentimento     TEXT DEFAULT '{}',    -- JSON {optIn, base, em, origem} — LGPD
  ultima_interacao  TEXT DEFAULT '',
  criado_em         TEXT NOT NULL,
  atualizado_em     TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_contatos_tenant ON crm_contatos(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_contatos_tel ON crm_contatos(tenant_id, telefone);
CREATE INDEX IF NOT EXISTS idx_crm_contatos_email ON crm_contatos(tenant_id, email);

-- ---- OPORTUNIDADES (negócios; N por contato) ----
CREATE TABLE IF NOT EXISTS crm_oportunidades (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  contato_id     TEXT NOT NULL,
  funil_id       TEXT NOT NULL,
  estagio_id     TEXT NOT NULL,
  titulo         TEXT NOT NULL,
  produto        TEXT DEFAULT '',
  valor_centavos INTEGER DEFAULT 0,
  moeda          TEXT DEFAULT 'BRL',
  previsao       TEXT DEFAULT '',       -- YYYY-MM-DD (data prevista de fechamento/check-in)
  responsavel    TEXT DEFAULT '',
  prioridade     TEXT DEFAULT 'media',
  status         TEXT DEFAULT 'aberta', -- aberta|ganha|perdida
  motivo         TEXT DEFAULT '',       -- motivo de ganho/perda
  fechada_em     TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_oport_tenant ON crm_oportunidades(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_oport_estagio ON crm_oportunidades(estagio_id);
CREATE INDEX IF NOT EXISTS idx_crm_oport_contato ON crm_oportunidades(contato_id);

-- ---- TIMELINE (histórico de relacionamento, append-only) ----
CREATE TABLE IF NOT EXISTS crm_atividades (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  contato_id      TEXT NOT NULL,
  oportunidade_id TEXT DEFAULT '',
  tipo            TEXT NOT NULL,      -- nota|mensagem-enviada|mensagem-recebida|email|whatsapp|ligacao|proposta|tarefa|mudanca-estagio|mudanca-responsavel|campanha|automacao|reserva|pagamento|documento|criacao|ganho|perda|ia
  canal           TEXT DEFAULT '',    -- whatsapp|email|telefone|sms|messenger|instagram|tiktok|linkedin|site|chat|manual
  texto           TEXT DEFAULT '',
  autor           TEXT DEFAULT '',
  data            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_ativ_contato ON crm_atividades(contato_id, data);
CREATE INDEX IF NOT EXISTS idx_crm_ativ_tenant ON crm_atividades(tenant_id, data);

-- ---- TAREFAS / FOLLOW-UPS ----
CREATE TABLE IF NOT EXISTS crm_tarefas (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  contato_id      TEXT DEFAULT '',
  oportunidade_id TEXT DEFAULT '',
  titulo          TEXT NOT NULL,
  tipo            TEXT DEFAULT 'followup', -- followup|ligacao|mensagem|email|visita|proposta|outro
  vence_em        TEXT DEFAULT '',         -- YYYY-MM-DD
  responsavel     TEXT DEFAULT '',
  status          TEXT DEFAULT 'aberta',   -- aberta|concluida|cancelada
  origem          TEXT DEFAULT 'manual',   -- manual|automacao|ia
  obs             TEXT DEFAULT '',
  criado_em       TEXT NOT NULL,
  concluida_em    TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_tarefas_tenant ON crm_tarefas(tenant_id, status, vence_em);
CREATE INDEX IF NOT EXISTS idx_crm_tarefas_contato ON crm_tarefas(contato_id);

-- ---- TEMPLATES de mensagens ----
CREATE TABLE IF NOT EXISTS crm_templates (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  nome          TEXT NOT NULL,
  categoria     TEXT DEFAULT '',       -- primeira-resposta|qualificacao|orcamento|proposta|followup|recuperacao|pagamento|checkin|pos-venda|avaliacao|reativacao|campanha|demo|onboarding|outro
  canal         TEXT DEFAULT 'whatsapp', -- whatsapp|email|sms|outro
  assunto       TEXT DEFAULT '',
  corpo         TEXT NOT NULL,
  idioma        TEXT DEFAULT 'pt',
  vertical      TEXT DEFAULT '',
  etapa         TEXT DEFAULT '',
  objetivo      TEXT DEFAULT '',
  ativo         INTEGER DEFAULT 1,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_templates_tenant ON crm_templates(tenant_id, ativo);

-- ---- PROPOSTAS comerciais ----
CREATE TABLE IF NOT EXISTS crm_propostas (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  contato_id      TEXT NOT NULL,
  oportunidade_id TEXT DEFAULT '',
  titulo          TEXT NOT NULL,
  itens           TEXT DEFAULT '[]',      -- JSON [{descricao, qtd, valor_centavos}]
  valor_centavos  INTEGER DEFAULT 0,
  desconto_centavos INTEGER DEFAULT 0,
  validade        TEXT DEFAULT '',        -- YYYY-MM-DD
  condicoes       TEXT DEFAULT '',
  link_pagamento  TEXT DEFAULT '',
  link_reserva    TEXT DEFAULT '',
  status          TEXT DEFAULT 'rascunho',-- rascunho|enviada|visualizada|negociacao|aceita|recusada|vencida
  token           TEXT DEFAULT '',        -- link público /crm/p/:token
  enviada_em      TEXT DEFAULT '',
  respondida_em   TEXT DEFAULT '',
  obs             TEXT DEFAULT '',
  criado_em       TEXT NOT NULL,
  atualizado_em   TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_prop_tenant ON crm_propostas(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_prop_token ON crm_propostas(token) WHERE token != '';

-- ---- CAMPANHAS + alvos (semiautomáticas: lista + mensagem + controle) ----
CREATE TABLE IF NOT EXISTS crm_campanhas (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  nome        TEXT NOT NULL,
  tipo        TEXT DEFAULT 'whatsapp',  -- whatsapp|email|tarefa|ligacao|social|remarketing|sequencia
  segmento    TEXT DEFAULT '{}',        -- JSON de filtros usados na geração
  template_id TEXT DEFAULT '',
  mensagem    TEXT DEFAULT '',
  status      TEXT DEFAULT 'rascunho',  -- rascunho|em_andamento|concluida|cancelada
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_camp_tenant ON crm_campanhas(tenant_id);

CREATE TABLE IF NOT EXISTS crm_campanha_alvos (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  campanha_id TEXT NOT NULL REFERENCES crm_campanhas(id) ON DELETE CASCADE,
  contato_id  TEXT NOT NULL,
  status      TEXT DEFAULT 'pendente',  -- pendente|enviado|respondido|pulado
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_alvos_camp ON crm_campanha_alvos(campanha_id, status);

-- ---- AGENTES (IA): execuções com log e revisão humana ----
CREATE TABLE IF NOT EXISTS crm_ia_logs (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  agente     TEXT NOT NULL,       -- qualificacao|followup|reativacao|marketing|prospeccao|enriquecimento|perdas|resposta
  contato_id TEXT DEFAULT '',
  entrada    TEXT DEFAULT '',     -- JSON resumido do que foi analisado
  saida      TEXT DEFAULT '',     -- JSON da sugestão (sempre sugestão; revisão humana)
  motor      TEXT DEFAULT 'regras', -- regras|llm
  status     TEXT DEFAULT 'sugerido', -- sugerido|aceito|descartado
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_ia_tenant ON crm_ia_logs(tenant_id, criado_em);

-- ---- CHAVES DE API pública do tenant (receber/enviar leads via API) ----
CREATE TABLE IF NOT EXISTS crm_api_keys (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  chave      TEXT UNIQUE NOT NULL,  -- 'vc_' + aleatório
  nome       TEXT DEFAULT '',
  ativo      INTEGER DEFAULT 1,
  criado_em  TEXT NOT NULL,
  ultimo_uso TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_apikeys_tenant ON crm_api_keys(tenant_id);
