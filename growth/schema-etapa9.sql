-- =====================================================================
-- Villela Growth OS — ETAPA 9: comercialização.
--
-- Quase nada de tabela nova aqui, e isso é proposital: planos,
-- assinaturas, faturas, uso, organizações e marcas já existem desde a
-- Etapa 1 e a fundação do Villela CRM. O trabalho desta etapa é AMARRAR —
-- fazer os planos carregarem de verdade os recursos das oito etapas.
--
-- A única coisa que precisa de estado próprio é o onboarding: o checklist
-- é CALCULADO do estado real da conta, mas o assinante precisa poder
-- dispensar um passo que não se aplica ao negócio dele.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gx_onboarding (
  tenant_id      TEXT NOT NULL,
  passo          TEXT NOT NULL,
  status         TEXT DEFAULT 'pendente',   -- pendente|feito|dispensado
  observacao     TEXT DEFAULT '',
  feito_em       TEXT DEFAULT '',
  feito_por      TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, passo)
);

-- Domínio próprio do assinante para as páginas públicas (white-label).
-- Separado de gx_marcas porque um domínio pode ser verificado ou não, e
-- o estado da verificação tem ciclo de vida próprio.
CREATE TABLE IF NOT EXISTS gx_dominios (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  marca_id       TEXT DEFAULT '',
  dominio        TEXT NOT NULL,
  status         TEXT DEFAULT 'pendente',   -- pendente|verificado|falhou
  token_verificacao TEXT DEFAULT '',
  verificado_em  TEXT DEFAULT '',
  ultimo_erro    TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  criado_por     TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT '',
  atualizado_por TEXT DEFAULT '',
  excluido_em    TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gx_dominios ON gx_dominios(dominio);
CREATE INDEX IF NOT EXISTS idx_gx_dominios_tenant ON gx_dominios(tenant_id, status);
