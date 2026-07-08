# Villela Stay Manager (VSM) — control plane comercial da gestão de hospedagem

**Fonte da verdade técnica** deste produto. O 6º SaaS da Villela Stay: empacota o
próprio sistema de gestão de hospedagem por temporada (o Portal Staff) como produto
multi-tenant vendável a **outros anfitriões e gestores de aluguel por temporada**.

Segue o mesmo padrão de módulo dos SaaS anteriores (`legal-saas`/`vdocs`/`vpe`): banco
SQLite próprio, entitlements, cobrança recorrente Mercado Pago, painel da plataforma no
Portal Staff e landing/painel públicos. **Não altera** nenhum outro módulo.

## O que é

Duas camadas, ambas no ar:

1. **Control plane comercial** — funil de venda + administração do negócio SaaS:
   landing `/gestao` → signup/trial → definir senha → login `/gestao/app` · administração na
   aba 🏨 do Portal Staff (`/staff/api/vsm/*`).
2. **App de gestão real (mini-PMS multi-tenant)** — o que o assinante usa por dentro do
   `/gestao/app`, escopado no próprio tenant e gateado pelos módulos/limites do plano:
   imóveis, hóspedes, reservas (com **anti-overbooking** e limite mensal), limpezas (geradas
   automaticamente no check-out), manutenção, financeiro (receita automática da reserva) e
   painel. Cada operação gerencia os **próprios** dados — nada a ver com a conta Stays da
   Villela. Ver §App de gestão real.

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
| `app-repo.js` | **app de gestão real**: imóveis/hóspedes/reservas/limpezas/manutenção/financeiro/painel (tudo por tenant_id) |
| `rotas-app.js` | API do app `/gestao/api/app/*` (requireAssinante + requireAcesso + gateModulo) |
| `app-cliente.js` | SPA do assinante servida em `/gestao/app.js` (JS clássico, sem build) |
| `paginas.js` | landing + assinar + painel do assinante + signup/lead (server-rendered) |
| `selftest.js` | suíte `npm run test:vsm` (25 testes: control plane + app) |
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

## App de gestão real (mini-PMS multi-tenant)

Isolamento **lógico** por `tenant_id` (padrão vdocs) nas tabelas `app_*`. Acesso protegido em
3 camadas em `rotas-app.js`: `requireAssinante` (cookie) → `requireAcesso` (bloqueia trial
vencido/suspensa/inadimplente → 403) → `gateModulo(mod)` (respeita os módulos do plano → 403).

- **Imóveis** — CRUD; limite `imoveis` do plano aplicado no cadastro; uso sincronizado.
- **Hóspedes** — CRUD (módulo `hospede`).
- **Reservas** — CRUD + calendário; **anti-overbooking** por imóvel (rejeita sobreposição de
  datas em reservas pendentes/confirmadas); limite `reservas_mes` do plano; ao confirmar,
  **gera a limpeza de check-out** e **lança a receita** automaticamente.
- **Limpezas** — geradas do check-out ou manuais; concluir.
- **Manutenção** — chamados com prioridade e fluxo aberto→em_andamento→resolvido.
- **Financeiro** — receitas/despesas + resumo do mês (receita/despesa/resultado).
- **Painel** — imóveis, reservas ativas, check-ins/outs 7d, limpezas/manutenção pendentes,
  financeiro do mês e próximas reservas.

SPA: `app-cliente.js` servida em `/gestao/app.js`, montada por `bootGestao()` no shell
(`paginas.js` → `/gestao/app`). Mostra só as abas dos módulos do plano; conta bloqueada
(suspensa) cai no Plano/Suporte.

## Roadmap (marco 3 — integração com channel manager)

Conectar a conta de OTA/channel manager **de cada cliente** (Airbnb/Booking/Stays do próprio
anfitrião) para sincronizar disponibilidade e importar reservas — hoje o app é o registro
central próprio da operação. `repo.Tenants.usuarioAssinante` e o escopo por tenant já servem
de base.

## Pendências

1. **Comercial (Augusto):** marca definitiva (hoje "Villela Stay Manager" em `/gestao`),
   preços finais (editáveis no painel) e 1º cliente piloto. NÃO ativar 1º cliente pago antes
   de definir o comercial (mesma regra dos outros SaaS).
2. **Marco 3** (integração com channel manager de cada cliente) — quando houver demanda.
