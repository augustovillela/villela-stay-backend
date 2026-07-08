# Villela Projects & Events Intelligence — SaaS de gestão de projetos e eventos

**Produto B2B multi-tenant** da Augusto Villela Ltda com dupla natureza: (1) gestão do
portfólio INTERNO de negócios da Villela (16 projetos, workspace `villela-interno`) e
(2) SaaS vendável a outras empresas. **Este README é a fonte da verdade do assunto.**

Status: **Fase 1 (fundação SaaS + portfólio) COMPLETA** — branch `feat/vpe`, aguardando
validação do Augusto p/ merge. Testes: `npm run test:vpe` (49/49).

| O quê | Onde |
|---|---|
| Landing comercial | `/vpe` (host futuro: `projetos.villelastay.com` — redirect já no server.js) |
| Cadastro (trial 14d) / Login | `/vpe/cadastro` · `/vpe/login` |
| Painel da empresa | `/vpe/app` (sessão própria, cookie `vpe_sess`) |
| API do produto | `/vpe/api/*` |
| Administração da plataforma | Portal Staff → aba **📋 Villela Projects** (áreas `ti`/`ceo`; escrita = admin) |
| Workspace interno Villela | tenant `villela-interno` (semeado pela aba do staff — botão "Semear") |
| Banco | `DATA_DIR/vpe/vpe.db` (node:sqlite, WAL) |

---

## FASE 0 — Diagnóstico (07/07/2026)

Mesma stack já diagnosticada e PROVADA em produção pelo Villela Docs (10 fases no ar em
07/07/2026): Node ≥22 + Express 4, 1 web service Render com disco persistente (`DATA_DIR`),
módulos autocontidos com SQLite via `node:sqlite`, injeção de deps no server.js, SPAs em JS
clássico. O vpe é o 4º módulo-irmão (Livraria → Legal → vdocs → vpe) e **herda as lições**:

- **Identidade própria por produto** (cookie `vpe_sess`, path `/vpe`) — nunca misturar com
  staff/vdocs/jurídico.
- **Tenant SEMPRE do token**, nunca de parâmetro (anti-IDOR, testado).
- **checarLimite com mapa métrica→chave do plano** (mensais com sufixo `_mes`) — bug corrigido
  no vdocs, aqui já nasce certo.
- **Links gerados usam x-forwarded-proto** (proxy do Render).
- **Landing/painel server-rendered sem framework** — padrão validado.

**Diferenças de desenho vs vdocs** (decisões da Fase 1):
1. **Tenant interno** (`tenants.interno=1`): plano Enterprise, sem trial, **nunca suspende por
   billing e não trava por limite** — é a Villela usando o próprio produto (dogfooding).
2. **Portfólio no núcleo da fundação**: tabela `projects` mínima já na F1 (nome, categoria,
   15 estágios, horizonte, prioridade, viabilidade 0-100, investimento, receita potencial,
   riscos, próximos passos) — o suficiente p/ o dashboard executivo e o seed dos 16; o motor
   completo (tarefas, marcos, decisões, score guiado) chega nas F2-3.
3. **Sem billing na F1** (chega na F5+ reaproveitando o adapter Mercado Pago do vdocs);
   plano é gerido pelo staff.
4. **Seed interno via botão no staff** (admin): cria o tenant + dono
   (augusto.villela@gmail.com) com senha inicial mostrada UMA vez + 16 projetos. Idempotente.

## Os 16 projetos internos semeados

Villela Stay (operação) · Compra/venda de containers (viabilidade) · Compra/aluguel de
containers (viabilidade) · Construção/venda de unidades em containers (plano de negócio) ·
Construção/aluguel de unidades (plano de negócio) · Hospedagens itinerantes (incubação) ·
Transporte de cargas (pesquisa) · Aluguel de máquinas (pesquisa) · Transporte de pessoas
(incubação) · Aluguel de carros (ideia) · Aluguel de lanchas (ideia) · Domos geodésicos
(ideia) · Buffet (planejamento) · Aluguel de equipamentos p/ eventos (planejamento) ·
Loteamento com containers (ideia) · Prédios de quitinetes (ideia).
Cada um com categoria, horizonte, prioridade, riscos e próximos passos — dados em
`repo.js → PROJETOS_VILLELA` (edite lá e rode o seed de novo p/ completar).

## Arquitetura (Fase 1)

```
backend/vpe/
├── db.js          SQLite WAL em DATA_DIR/vpe/vpe.db + migrações
├── schema.sql     tenants (c/ flag interno), users, tenant_users, roles, invites,
│                  plans, subscriptions, usage_records, audit_logs, leads, projects
├── permissoes.js  26 permissões × 10 papéis embutidos + papéis custom por tenant
├── repo.js        acesso a dados (tenantId obrigatório) + seed interno + dashboards
├── auth.js        cookie vpe_sess + requireTenant/requirePerm + throttle de login
├── rotas-api.js   /vpe/api/* (cadastro, login, me, projetos, usuários, convites,
│                  papéis, auditoria, uso, config, leads)
├── rotas-staff.js /staff/api/vpe/* (resumo, tenants, planos, leads, semear-interno)
├── paginas.js     landing + cadastro/login/convite + SPA /vpe/app
├── index.js       montar(app, deps)
└── selftest.js    49 testes (npm run test:vpe)
staff/app-vpe.js   aba 📋 no Portal Staff (com o botão de seed interno)
```

**Papéis embutidos**: Dono · Administrador · Gerente de projetos · Produtor de eventos ·
Comercial · Financeiro · Colaborador · Auditor · Leitor · Cliente externo (portal na F7).
Permissão especial `decidir_projeto`: pausar/cancelar/arquivar exige-a além de `editar_projeto`.

## Modelo de dados das próximas fases (especificado, não criado)

- **F2 Portfólio avançado**: `business_plans` (canvas/SWOT/projeções), `viability_scores`
  (score guiado por 11 critérios), `project_decisions` (governança), `project_milestones`.
- **F3 Execução**: `project_tasks` (+subtarefas, dependências, recorrência), `checklists`,
  visão Kanban/Gantt/calendário, `project_risks`, `project_meetings`.
- **F4 Eventos**: `events`, `event_briefings`, `event_checklists`, `event_guests`,
  `event_layouts`, `event_occurrences`, `event_postmortems`, fornecedores (`suppliers`,
  `supplier_quotes`), equipe/escalas (`staff_assignments`).
- **F5 Comercial+financeiro**: `crm_leads`, `deals`, `proposals(+items)`, `contracts
  (+versions)`, `budgets`, `revenues/expenses`, contas a pagar/receber, margem — billing SaaS
  via Mercado Pago (adapter do vdocs).
- **F6 IA+automações**: `ai_agents/ai_runs` (modo direto ANTHROPIC_API_KEY, padrão vdocs),
  17 agentes especialistas, motor de automações (gatilho→ação) + relatório diário do CEO.
- **F7 Portal do cliente + SaaS admin completo** · **F8 Integrações/segurança/deploy**
  (Google Calendar, Make/n8n, API pública por chave — padrão vdocs F9; documentos: INTEGRAR
  com o Villela Docs em vez de duplicar).

## Checklist de segurança (Fase 1)

- [x] bcrypt (custo 10); sessão httpOnly+sameSite+secure; cookie restrito a /vpe
- [x] Throttle de login/cadastro (5 falhas/IP → 15 min) e leads (30 s/IP)
- [x] Tenant do token; ids validados contra o tenant (anti-IDOR testado)
- [x] RBAC negando por padrão; `dono` não concedível por convite; último dono protegido;
      decisões de projeto exigem `decidir_projeto`
- [x] Convite: token sha256, 7 dias, uso único (testado)
- [x] Auditoria de toda escrita com IP (inclui `projeto.mudar_estagio` = governança)
- [x] esc() em toda renderização; inputs truncados; Cache-Control: no-store nas APIs
- [ ] F2+: upload/anexos com validação (reusar padrão vdocs), 2FA (reusar enterprise.js do vdocs)

## Checklist LGPD (Fase 1)

- [x] Minimização (só nome/e-mail de usuários + dados cadastrais da empresa)
- [x] Isolamento por tenant (testado — inclusive o interno não vaza p/ clientes)
- [x] Trilha de auditoria por tenant; ações da plataforma espelhadas
- [x] Landing com finalidade explícita do lead
- [ ] F7: exportação total (takeout — reusar zipStored do vdocs) e exclusão/anonimização
- [ ] F5: DPA no onboarding; termos e política formais

## Roadmap (8 fases do plano-mestre)

~~F0 diagnóstico~~ ✅ · ~~F1 fundação SaaS + portfólio + seed 16~~ ✅ (branch) →
**F2 portfólio avançado** (plano de negócio, score de viabilidade guiado, decisões,
comparação/ranking de ideias) → F3 execução (tarefas, Kanban, Gantt, riscos) → F4 eventos
(briefing→pós-evento, fornecedores, equipe, convidados) → F5 comercial+financeiro (CRM,
propostas, contratos, orçamentos, billing SaaS) → F6 IA+automações (17 agentes, relatório
diário do CEO) → F7 portal do cliente + SaaS admin → F8 integrações+deploy final.

## Próximos passos imediatos

1. [ ] Augusto valida a Fase 1 local (`node stays/start-staff-dev.js` → /vpe e /vpe/app;
   staff → aba 📋 → "Semear workspace interno") e autoriza merge `feat/vpe` → master.
2. [ ] Pós-deploy: clicar "Semear workspace interno" em produção (guarda a senha inicial!)
   e revisar os 16 projetos (prioridades/estágios são propostas minhas).
3. [ ] Preços dos planos (149/349/799/sob consulta) são proposta — ajustar na aba Planos.
4. [ ] DNS `projetos.villelastay.com(.br)` quando quiser divulgar (Custom Domain no Render
   via Claude + CNAME na Locaweb — processo já dominado).
5. [ ] Iniciar Fase 2 (portfólio avançado) — sem env var nova.

## Teste local

`node stays/start-staff-dev.js` → produto em `http://localhost:3000/vpe`, staff em `/staff/`.
Suíte: `npm run test:vpe` (banco temporário, 49 testes).
