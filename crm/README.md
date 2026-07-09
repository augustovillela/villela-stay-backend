# Villela CRM — CRM inteligente multicanal (SaaS)

CRM do Grupo Villela Stay vendido como SaaS a assinantes externos (7º produto do portfólio),
e usado internamente como tenant próprio (dogfooding). Módulo autocontido no padrão dos demais
SaaS (legal-saas/vdocs/vpe/vsm/academy).

## Superfícies

| URL | O quê |
|---|---|
| `/crm` | Landing comercial + preços + signup (trial 14 dias sem cartão) |
| `/crm/app` | Painel do assinante (SPA `app-cliente.js`, cookie `crm_sess` restrito a /crm) |
| `/crm/p/:token` | Proposta pública (visualização registrada + aceite/recusa) |
| `/crm/webhook/:token` | Entrada de leads (formulários, Make/n8n/Zapier) |
| `/crm/api/v1/*` | API pública por chave `vc_` (header `x-api-key`) |
| `/crm/webhooks/mercadopago` | Webhook de cobrança recorrente |
| `/staff/api/vcrm/*` | Administração da plataforma (Portal Staff, aba 🤝) — `vcrm` ≠ CRM legado do staff (`/staff/api/crm/*`) |

## Arquitetura

- **Banco**: SQLite próprio (`node:sqlite`, sem dependência nativa) em `DATA_DIR/crm/crm.db`.
  Isolamento lógico por `tenant_id` em TODAS as tabelas `crm_*` (padrão vdocs/vsm).
- **Control plane** (`repo.js` + `billing.js`): planos/limites/módulos/flags → entitlements;
  trial→ativa→inadimplente→suspensa; MP preapproval (`external_reference crm:<tenant>`);
  tickets; auditoria; MRR.
- **Motor do CRM** (`app-repo.js`): funis+estágios (5 seeds por tenant), contatos (ficha completa
  com origem/UTM/consentimento, dedupe telefone E.164 > e-mail com merge), empresas,
  oportunidades (kanban, ganho/perda com motivo), timeline append-only, tarefas/follow-ups
  (caixa "precisa de ação"), lead scoring 0-100 (motor de regras, recalcula a cada escrita),
  templates com `{{variaveis}}`, propostas com token público, campanhas segmentadas
  (opt-out respeitado), automações (5 regras), agentes (qualificação/follow-up/reativação/perdas/
  resposta — motor de regras v1, campo `motor` pronto p/ LLM; toda saída = sugestão logada),
  import/export CSV, chaves de API.
- **Papéis por empresa**: owner/admin/gestor/vendedor/atendente/financeiro/marketing/leitura,
  validados no backend (`repo.podePapel` + `requirePapel`).
- **Rotina diária interna** (~6h Brasília): ciclo de vida (trial/dunning) + automações de
  follow-up por tenant com flag `automacoes`. Desliga com `CRM_ROTINAS=off`.

## Planos (sementes — preços PROVISÓRIOS, o Augusto define no painel)

trial (14d, tudo) · starter R$ 79 (contatos+funil+tarefas) · professional R$ 189 (multi-funil,
automações, propostas, campanhas, scoring, relatórios) · business R$ 449 (IA, API pública,
WhatsApp API) · enterprise sob consulta (white label, ilimitado).

## Migração do CRM legado

O CRM do Portal Staff (contatos.json + /staff/api/crm/*) **continua funcionando**. Para trazer a
base: criar tenant com slug `villela-stay` (aba 🤝) e clicar "Importar CRM legado" — dedupe por
telefone; estágios abertos viram oportunidades no funil de hospedagem.

## Testes

`npm run test:crm` — 35 testes (signup/login/papéis, dedupe/UTM/scoring, kanban, automações,
templates, proposta pública, campanhas+opt-out, agentes, webhook/CSV/API pública, isolamento
entre tenants, limites, billing MP mock, ciclo de vida, importação do legado, LGPD).

## Identidade

Sistema V-Portal do Grupo Villela Stay; acento da vertical CRM `#BE123C`; assets em
`/assets/brand/villela-crm/` (pictograma = funil de vendas).
