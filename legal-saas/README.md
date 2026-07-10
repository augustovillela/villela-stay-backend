# Villela Legal SaaS — plano comercial do produto jurídico

Módulo que transforma o **Villela Legal Intelligence** (sistema interno, em `legal/`) em
**produto SaaS vendável a outros escritórios de advocacia**. É o *control plane* comercial:
cadastro de escritórios, planos, cobrança recorrente, trial, suspensão, painel da plataforma,
suporte, métricas e custo por cliente. Construído como módulo do backend (padrão vdocs/vpe),
banco SQLite próprio em `DATA_DIR/legal-saas/`, montado no `server.js`.

## O que entrega (mapa da lista pedida)

| Pedido | Onde |
|---|---|
| cadastro de empresas | `tenants` (escritórios) + `tenant_users` (login próprio) |
| workspaces | `workspaces` (filiais/núcleos por escritório) |
| planos | `plans` (5 seed: Trial, Essencial, Profissional, Escritório, Enterprise) editáveis no painel |
| limites | `plans.limites` (JSON) + `usage_records` + enforcement `dentroLimite()` |
| trial | 14 dias (`LEGALSAAS_TRIAL_DIAS`); trial→inadimplente no vencimento |
| cobrança recorrente | Mercado Pago **preapproval** (`billing.js`), reusa `mpFetch` do server |
| upgrade / downgrade | `billing.trocarPlano()` — detecta up/down e se exige reassinar no MP |
| suspensão por inadimplência | webhook MP `paused`/`cancelled` + dunning (inadimplente 7d → suspensa) |
| painel da plataforma | aba **⚖️💼 Legal SaaS** no Portal Staff (`staff/app-legal-saas.js`) |
| suporte / tickets | `tickets` + `ticket_messages` (assinante abre, plataforma responde) |
| logs | `platform_events` (ciclo/billing/webhook) + `audit_logs` (ações admin) |
| métricas de uso | `usage_records` por tenant/período/métrica + `Uso.*` |
| custo por cliente | `cost_records` + `Dashboard.custoPorCliente()` (receita − custo = margem) |
| feature flags | `feature_flags` (global) + override por tenant em `tenant_settings.flags_over` |
| módulos por plano | `plans.modulos` (JSON) + `entitlements()` + `podeModulo()` |

## Arquitetura

```
legal-saas/
  schema.sql       # 16 tabelas (tenants, workspaces, plans, subscriptions, invoices,
                   #   usage_records, cost_records, feature_flags, tickets, leads, logs...)
  db.js            # conexão node:sqlite (DATA_DIR/legal-saas/) + migrações
  repo.js          # planos, tenants, MOTOR DE ENTITLEMENTS, uso, custo, tickets, leads, dashboard
  billing.js       # Mercado Pago preapproval + ciclo de vida (trial→ativa→inadimplente→suspensa)
  rotas-staff.js   # API de administração da plataforma (/staff/api/legal-saas/*, requireAdmin)
  rotas-cliente.js # API do assinante (/juridico/api/*, sessão própria 'jur_saas')
  paginas.js       # landing/preços/signup (/juridico) + painel do assinante (/juridico/app)
  index.js         # montar(app, deps) + agendador do ciclo de vida
  selftest.js      # 19 testes (npm run test:legal-saas)
staff/app-legal-saas.js  # painel da plataforma no Portal Staff (aba ⚖️💼)
```

## Motor de entitlements (o coração)

`entitlements(tenantId)` resolve, a partir do **plano** + **overrides negociados** (Enterprise),
os **módulos** liberados, os **limites** e as **flags** efetivas — e se o acesso está liberado
(só `trial`/`ativa`; `inadimplente`/`suspensa`/`cancelada` bloqueiam a entrega). Helpers:

- `podeModulo(tenant, 'ia')` → boolean (respeita status do tenant)
- `dentroLimite(tenant, 'processos_ativos', +1)` → `{ok, limite, usado}` (0 = ilimitado)
- `flag(tenant, 'white_label')` → boolean

**É este motor que o produto jurídico (`legal/`) deve consultar** para gatear cada escritório.

## Rotas

**Público / assinante** (`/juridico`): landing, `/juridico/assinar?plano=`, `/juridico/app`
(painel), `/juridico/definir-senha`. API: `/juridico/api/{signup,login,logout,definir-senha,me,
cobranca,cobranca/assinar,cobranca/cancelar,tickets,lead}`. Webhook MP:
`/juridico/webhooks/mercadopago`.

**Plataforma** (`/staff/api/legal-saas/*`, admin): `dashboard`, `planos` (GET/PATCH), `tenants`
(GET/POST/PATCH, `/:id/status`, `/:id/plano`, `/:id/settings`, `/:id/marcar-pago`, `/:id/custo`,
`/:id/link-acesso`), `custo-por-cliente`, `tickets`, `leads`, `eventos`, `auditoria`,
`ciclo-diario`.

## Ciclo de vida (server-side)

Rotina interna 1×/dia (~6h Brasília, `LEGALSAAS_ROTINA_HORA`; `LEGALSAAS_ROTINAS=off` desliga):
trial vencido → `inadimplente`; inadimplente há +7 dias → `suspensa`. Também disparável no painel
(Logs → "Rodar ciclo de vida agora").

## Configuração (env, todas opcionais)

- `MP_ACCESS_TOKEN` — liga a cobrança recorrente real (sem ela, o painel gerencia manualmente:
  criar escritório, marcar pago, suspender/reativar).
- `LEGALSAAS_TRIAL_DIAS` (14), `LEGALSAAS_ROTINAS` (on), `LEGALSAAS_ROTINA_HORA` (6).

## Decisões

1. **Módulo separado, banco separado** (não mexe em `legal/`): o control plane comercial é
   independente do sistema jurídico. Assim o SaaS pode existir e vender antes de o núcleo virar
   multi-tenant de dados.
2. **Mercado Pago preapproval** — mesma infra dos outros SaaS (vdocs/vpe); um plano pago por
   escritório; trocar de plano com MP ativo exige reassinar (limitação do preapproval).
3. **Números comerciais são SEMENTES** editáveis no painel — o Augusto define os preços finais.
4. **Entitlements = fonte da verdade da entrega**; o núcleo jurídico consulta este módulo.

## Roadmap (próximo marco — fora deste módulo)

O que ESTE módulo entrega: relacionamento comercial + billing + entitlements + operação da
plataforma. O que **falta** para vender de fato: **isolamento de dados por tenant no núcleo
`legal/`** (hoje single-tenant do escritório do Augusto). Caminhos:

- **A) Multi-tenant no `legal/`**: adicionar `tenant_id` às tabelas do `legal/` e escopar as
  queries pelo tenant resolvido (via `entitlements`). Refactor grande, mas um só deploy serve todos.
- **B) Instância por escritório**: provisionar um `DATA_DIR/legal-<tenant>/` por assinante
  (`workspaces.provisionado`) — isolamento forte, orquestração mais pesada.

A tabela `workspaces` e o campo `provisionado` já modelam esse marco; o gancho de provisionamento
entra quando o caminho for escolhido.

## Testes

`npm run test:legal-saas` — 20 casos (landing, permissões, tenant/entitlements, overrides,
suspensão, planos, upgrade/downgrade, custo/margem, signup→senha→login, tickets, assinatura MP
mockada, webhook, ciclo de vida, rate-limit, leads, auditoria).
