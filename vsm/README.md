# Villela Stay Manager (VSM) — control plane comercial da gestão de hospedagem

**Fonte da verdade técnica** deste produto. O 6º SaaS da Villela Stay: empacota o
próprio sistema de gestão de hospedagem por temporada (o Portal Staff) como produto
multi-tenant vendável a **outros anfitriões e gestores de aluguel por temporada**.

Segue o mesmo padrão de módulo dos SaaS anteriores (`legal-saas`/`vdocs`/`vpe`): banco
SQLite próprio, entitlements, cobrança recorrente Mercado Pago, painel da plataforma no
Portal Staff e landing/painel públicos. **Não altera** nenhum outro módulo.

## O que é (e o que NÃO é, ainda)

Esta fase entrega o **control plane comercial** — o funil de venda e a administração do
negócio SaaS, ponta a ponta:

> landing `/gestao` → signup/trial → definir senha → login `/gestao/app` → plano/uso/suporte
> · administração na aba 🏨 do Portal Staff.

**Fora desta fase (marco 2):** o *app de gestão real multi-tenant* que o assinante usaria
por dentro (reservas/limpeza/financeiro conectados ao channel manager de **cada** cliente).
Isso depende de cada cliente trazer a própria conta de OTA/channel manager e será uma ponte
de acesso + isolamento por tenant, como foi feito no `legal-saas` (ver §Roadmap).

## Fatos técnicos

- **Banco:** SQLite via `node:sqlite` em `DATA_DIR/vsm/vsm.db` (WAL). Isolamento por
  `tenant_id`. Arquivos: `db.js` + `schema.sql` (14 tabelas: plans, tenants, tenant_settings,
  workspaces, tenant_users, subscriptions, invoices, usage_records, cost_records,
  feature_flags, tickets, ticket_messages, leads, platform_events, audit_logs).
- **Entitlements (coração):** `repo.js` — `plano + overrides (tenant_settings) → módulos/limites/flags`
  efetivos. Helpers `entitlements/podeModulo/dentroLimite/flag`. É o que gateia a entrega.
  Acesso liberado só em `trial`/`ativa` (suspensa/cancelada/inadimplente = bloqueia).
- **Identidade PRÓPRIA:** usuários do produto NÃO são usuários do Portal Staff. Cookie próprio
  **`vsm_sess`** (path `/gestao`), JWT 30d. Setup de senha via JWT tipo `vsm-setup` (7d).
- **Cobrança:** Mercado Pago **preapproval** (recorrência mensal), reusa `mpFetch` do server.
  `external_reference` = `vsm:<tenantId>:<slug>`. Webhook `/gestao/webhooks/mercadopago`.
  Sem `MP_ACCESS_TOKEN` → o painel gerencia manualmente (marcar pago, suspender, reativar).
- **Ciclo de vida (dunning):** server-side ~6h Brasília — trial vencido → inadimplente;
  inadimplente há +7 dias → suspensa. `VSM_ROTINAS=off` desliga; `VSM_ROTINA_HORA`/`VSM_TRIAL_DIAS`.
- **URLs:** landing `/gestao`, assinar `/gestao/assinar?plano=`, painel do assinante
  `/gestao/app`, definir senha `/gestao/definir-senha`, API do assinante `/gestao/api/*`,
  administração `/staff/api/vsm/*` (só admin). Domínio sugerido: `gestao.villelastay.com.br`
  (redirect por prefixo de host no server.js ainda NÃO criado).
- **Leads** da landing caem na aba do staff e alertam o Augusto no WhatsApp (via `alertaAugusto`).
- **Testes:** `npm run test:vsm` (19/19 — landing, entitlements, overrides, suspensão,
  editar planos, upgrade/downgrade, custo/margem, signup, definir senha, tickets, assinatura
  MP mock, webhook, ciclo de vida, rate-limit, leads, auditoria).

## Catálogo do produto (editável no painel 🏨 → Planos)

- **Módulos (12):** imoveis · reservas · canais · checkin · limpeza · manutencao ·
  financeiro · hospede · precificacao · contratos · relatorios · ia.
- **Limites:** imoveis · usuarios · reservas_mes · ia_consultas_mes · armazenamento_mb · workspaces.
- **Flags:** ia_direta · api_publica · white_label · canais_ilimitados · dominio_proprio.
- **Planos-semente (preços PROVISÓRIOS, editáveis):** Trial 14d · **Starter R$ 99** ·
  **Pro R$ 249** (destaque) · **Business R$ 599** · **Enterprise** (sob consulta, ilimitado).
  Semear é idempotente e **preserva preço já editado** no painel.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `index.js` | montagem (`montar(app, {...})`) + webhook MP + agendador do ciclo de vida |
| `db.js` / `schema.sql` | SQLite (node:sqlite) + DDL |
| `repo.js` | entitlements + Planos/Tenants/Uso/Custo/Tickets/Flags/Leads/Auditoria/Dashboard |
| `billing.js` | MP preapproval, webhook, upgrade/downgrade, faturas, dunning |
| `rotas-staff.js` | API admin `/staff/api/vsm/*` (requireAuth + requireAdmin, auditado) |
| `rotas-cliente.js` | API assinante `/gestao/api/*` (cookie `vsm_sess`, rate-limit) |
| `paginas.js` | landing + assinar + painel do assinante + signup/lead (server-rendered) |
| `selftest.js` | suíte `npm run test:vsm` |
| `../staff/app-vsm.js` | painel da plataforma no Portal Staff (aba 🏨, `renderVsm`) |

## Pontos de montagem (no restante do backend)

- `server.js` — bloco `try { require('./vsm').montar(app, {...}) }` depois do `vpe`.
- `staff/index.html` — `<script src="/staff/app-vsm.js">` antes de `app-boot.js`.
- `staff/app-core.js` — item de menu `{ id:'vsm', rot:'🏨 Stay Manager' }` (áreas ti/ceo) +
  rota `vsm: renderVsm` no dispatch de `navegar()`.
- `package.json` — `"test:vsm": "node vsm/selftest.js"`.

## Deploy

Sobe no mesmo push do backend quando autorizado (padrão dos outros SaaS). Env opcionais:
`MP_ACCESS_TOKEN` (cobrança real), `VSM_TRIAL_DIAS`, `VSM_ROTINA_HORA`, `VSM_ROTINAS=off`.
Quando publicar: criar o custom domain `gestao.villelastay.com.br` no Render + redirect por
prefixo de host no `server.js` (padrão docs./juridico.).

## Roadmap (marco 2 — app de gestão real multi-tenant)

Espelhar o caminho do `legal-saas`: (1) isolamento por tenant do núcleo de gestão
(instância/escopo por operação), (2) ponte de acesso do assinante ao app real sob
`/gestao/api/...` gateada por `podeModulo`, (3) UI do assinante reusando o SPA do staff.
Cada cliente conecta a **própria** conta de channel manager/OTA. `repo.Tenants.usuarioAssinante`
já existe para servir de base à ponte.

## Pendências

1. **Comercial (Augusto):** marca definitiva (hoje "Villela Stay Manager" em `/gestao`),
   preços finais (editáveis no painel) e 1º cliente piloto. NÃO ativar 1º cliente pago antes
   de definir o comercial (mesma regra dos outros SaaS).
2. **DNS/redirect** de `gestao.villelastay.com.br` quando for publicar.
3. **Marco 2** (app multi-tenant) — quando houver demanda validada.
