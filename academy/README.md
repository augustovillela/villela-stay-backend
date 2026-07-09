# Villela Academy Marketplace

Plataforma de cursos online e produtos digitais (marketplace multi-produtor) da
Villela Stay / Augusto Villela Ltda: **alunos** compram e assistem, **produtores**
publicam e vendem, **afiliados** divulgam por comissão, **admin** governa a
plataforma. Conceito funcional inspirado em plataformas de infoprodutos, com
identidade, código e arquitetura próprios (nada copiado de terceiros).

**Status: FASE 1 (fundação) concluída.** Fases seguintes em [ROADMAP.md](ROADMAP.md).

## FASE 0 — Diagnóstico (por que o módulo é assim)

| Item | Achado |
|---|---|
| Stack | Node 22 + Express 4, JS clássico sem build; monólito `server.js` + módulos por produto |
| Banco | SQLite via `node:sqlite` (embutido, sem dependência nativa — **nunca** better-sqlite3), 1 banco por módulo em `DATA_DIR/<módulo>/` |
| Auth | Portal Staff: `requireAuth`/`requireAdmin` injetados; cada SaaS tem sessão própria (cookie JWT httpOnly restrito ao path) |
| Hospedagem | Render (deploy por push no repo `villela-stay-backend`); domínios `*.villelastay.com.br` |
| Padrão visual | Server-rendered + SPA sem build; CSS inline por módulo, identidade própria por produto |
| Pagamentos | `mpFetch` (Mercado Pago) compartilhado por injeção; webhooks por módulo |
| Precedentes | 6 produtos no mesmo padrão: livraria, legal, legal-saas, vdocs, vpe, vsm |
| Riscos mapeados | monólito grande (mitigado: módulo isolado + try/catch na montagem); PS 5.1/BOM não afeta (módulo é JS); credenciais fora do git |

**Decisão de inserção**: novo módulo `backend/academy/`, montado em `server.js`
como os demais — zero acoplamento com o site/portal existentes; se o módulo
falhar ao montar, o resto do sistema sobe normalmente.

## Arquitetura (FASE 1)

```
academy/
├── index.js          montagem (deps injetadas: express, requireAuth, requireAdmin, alertaAugusto, jwtSecret)
├── db.js             SQLite (node:sqlite) em DATA_DIR/academy/academy.db · WAL · migrações
├── schema.sql        tabelas da FASE 1 (idempotente, CREATE IF NOT EXISTS)
├── repo.js           domínio: usuários, papéis/permissões, perfis, sessões, auditoria, leads, config
├── rotas-cliente.js  API /academy/api/* (sessão própria academy_sess, path /academy)
├── rotas-staff.js    API /staff/api/academy/* (admin da plataforma = Portal Staff)
├── paginas.js        landing /academy + shell do app + termos/privacidade (MINUTA)
├── app-cliente.js    SPA do painel (aluno/produtor/afiliado/admin) — sem build
└── selftest.js       suíte (npm run test:academy)
```

Princípios: módulos por domínio, deps por injeção, dinheiro em centavos,
datas ISO-8601, IDs TEXT url-safe, tudo auditado, storage/vídeo/pagamento
entram como camadas novas nas fases seguintes sem tocar na fundação.

## Papéis e permissões

- Conta única; papéis acumuláveis: `aluno` (todos), `produtor`, `afiliado`, `admin`.
- `produtor`/`afiliado` exigem perfil **aprovado** pela plataforma (fluxo:
  `em_analise → aprovado|rejeitado`, e depois `suspenso|bloqueado` se preciso).
  O gate é duplo: papel no usuário **e** status do perfil.
- `admin` da Academy é concedido apenas pelo Portal Staff (dono da plataforma).
- Permissões derivadas por papel em `repo.PERMISSOES` (autorização via
  `requirePapel`, IDOR bloqueado por escopo de usuário nas queries).

## Autenticação e sessões

- Cookie `academy_sess` (httpOnly, secure em produção, SameSite=Lax, path `/academy`).
- JWT assinado com `JWT_SECRET` carregando `jti` → tabela `sessions` (revogável):
  logout revoga, troca de senha revoga todas, suspensão de conta revoga todas.
- bcrypt (custo 10), senha mínima 8, rate limit de 5 falhas/IP → 15 min.

## Modelo de dados

**FASE 1 (criado)**: `users`, `producer_profiles`, `affiliate_profiles`,
`sessions`, `audit_logs`, `leads`, `platform_settings`, `migrations`.

**Fases seguintes (planejado — criar quando a fase chegar)**:
- F2 produtos/cursos: `products`, `product_categories`, `courses`, `course_modules`,
  `lessons`, `lesson_materials`, `enrollments`, `student_progress`, `media_files`,
  `upload_sessions`, `download_logs`
- F3 marketplace: `sales_pages`, `page_sections`, `reviews`
- F4 checkout/MP: `orders`, `order_items`, `payments`, `payment_events`,
  `webhook_events`, `refunds`, `chargebacks`, `coupons`, `abandoned_checkouts`
- F5 afiliados: `affiliate_links`, `affiliate_clicks`, `affiliate_conversions`,
  `commission_rules`, `commissions`, `commission_splits`, `producer_balances`,
  `affiliate_balances`, `payout_requests`
- F6 assinaturas: `subscription_plans`, `subscriptions`, `subscription_events`
- F7+ conteúdo/comunidade/IA: `video_assets`, `certificates`, `quizzes`,
  `communities`, `support_tickets`, `notifications`, `ai_agent_runs`, `ai_usage_logs`,
  `moderation_reports`, `moderation_actions`

Todas com `id`, `criado_em`, `atualizado_em`, `status` quando aplicável
(convenção da casa; `deleted_at` vira anonimização/soft-status).

## Rotas

**Públicas**: `/academy` (landing) · `/academy/app` (login/painel) ·
`/academy/termos` · `/academy/privacidade` · `POST /academy/api/lead`
· subdomínios `academy.`/`cursos.` → `/academy`.
Planejadas (F3): `/academy/marketplace`, `/academy/cursos/[slug]`,
`/academy/produtores/[slug]`, `/academy/checkout/[slug]` (F4).

**API do usuário** (`/academy/api/*`, sessão própria):
`signup · login · logout · me (GET/PATCH) · me/senha · me/exportar · me/excluir ·
tornar-se-produtor · tornar-se-afiliado · aluno/dashboard · produtor/dashboard ·
afiliado/dashboard · admin/{dashboard,usuarios,perfis/:tipo/:id/decidir,usuarios/:id/status,auditoria}`

**API da plataforma** (`/staff/api/academy/*`, requireAuth+requireAdmin do Portal Staff):
`dashboard · usuarios · usuarios/:id/{papeis,status} · pendentes ·
perfis/:tipo/:userId/decidir · config · leads · auditoria`

**Webhook (F4)**: `POST /academy/webhooks/mercadopago` — validação, payload salvo
em `webhook_events`, idempotência por id de evento, liberação de acesso SÓ por
webhook/consulta segura (nunca pelo retorno do navegador).

## Decisões técnicas registradas

1. **SQLite por módulo, não PostgreSQL**: padrão da casa (6 produtos), zero infra
   extra, suficiente para os primeiros milhares de usuários. A camada `repo.js`
   isola o SQL — migrar para Postgres depois é troca de camada, não reescrita.
2. **Sessão com jti revogável**: JWT puro não permite logout servidor; a tabela
   `sessions` resolve com uma consulta por request.
3. **Exclusão LGPD = anonimização**: preserva integridade referencial e a trilha
   financeira/auditoria exigível legalmente.
4. **Aprovar perfil concede papel; suspender NÃO revoga papel**: o gate por
   status do perfil já bloqueia, e o histórico do usuário fica preservado.
5. **Comissões padrão em `platform_settings`** (plataforma 10%, afiliado 30%,
   cookie 30 dias): números **provisórios** — decisão comercial do Augusto antes da F5.
6. **Uploads/vídeo ficam para F7** com storage S3-compatível + URLs assinadas;
   nunca arquivos em pasta pública (regra já registrada no checklist de segurança).

## Rodar e testar

```
npm run test:academy      # suíte da fundação (24 testes)
npm start                 # sobe tudo; landing em http://localhost:3000/academy
```

## Documentos

- [ROADMAP.md](ROADMAP.md) — fases 2–10 com critérios de pronto
- [SEGURANCA.md](SEGURANCA.md) — checklist de segurança (vivo, revisar a cada fase)
- [LGPD.md](LGPD.md) — checklist LGPD (vivo; textos legais são MINUTA até revisão OAB)
