# Villela Academy Marketplace

Plataforma de cursos online e produtos digitais (marketplace multi-produtor) da
Villela Stay / Augusto Villela Ltda: **alunos** compram e assistem, **produtores**
publicam e vendem, **afiliados** divulgam por comissão, **admin** governa a
plataforma. Conceito funcional inspirado em plataformas de infoprodutos, com
identidade, código e arquitetura próprios (nada copiado de terceiros).

**Status: FASES 1–8 concluídas (fundação, produtos e cursos, marketplace,
checkout Mercado Pago, afiliados e comissões, assinaturas e clubes,
storage/URLs assinadas/vídeo, comunicações) — vende, comissiona, cobra
recorrente, entrega protegido e conversa com aluno/produtor/afiliado.**
Fases seguintes em [ROADMAP.md](ROADMAP.md).

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
├── repo-conteudo.js  domínio F2: produtos, módulos/aulas/materiais, mídia privada, matrículas, progresso
├── rotas-cliente.js  API /academy/api/* (sessão própria academy_sess, path /academy)
├── rotas-conteudo.js API F2: produtor (builder/upload/alunos), aluno (biblioteca/curso/progresso), mídia, moderação
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

**FASE 2 (criado)**: `products` (com fluxo editorial), `course_modules`, `lessons`,
`lesson_materials`, `media_files`, `enrollments`, `student_progress`, `download_logs`.

**FASE 3 (criado)**: `sales_pages` (seções JSON), `reviews`, `moderation_reports`.

**FASE 4 (criado)**: `orders` (com snapshot de comissão), `payment_events`,
`webhook_events`, `refunds`.

**FASE 5 (criado)**: `affiliate_links`, `affiliate_clicks`, `commissions`;
colunas `products.afiliado_pct` e `orders.{affiliate_user_id,afiliado_pct,
comissao_afiliado_centavos}` via migração.

**FASE 6 (criado)**: `subscriptions`, `club_items`; colunas
`orders.{tipo,subscription_id}` via migração.

**Fases seguintes (planejado — criar quando a fase chegar)**:
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
6. **Streaming próprio de vídeo fica para F7** (storage S3-compatível + URLs
   assinadas); na F2, vídeo = URL externa (YouTube não listado/Vimeo) com embed.
7. **Conteúdo unificado (F2)**: todo tipo de produto (curso, e-book, PDF, áudio,
   pacote, mentoria) usa a mesma estrutura módulos→aulas→materiais — um e-book é
   um produto com 1 aula tipo pdf. Menos tabelas, entrega/progresso uniformes
   (a tabela `courses` planejada foi absorvida por `products.config`).
8. **Upload (F2)**: JSON base64 (padrão da casa, limite global 15 MB), máx. 10 MB
   por arquivo, mimes controlados (PDF/imagem/áudio/ZIP), gravado em
   `DATA_DIR/academy/arquivos/` (privado) e servido SÓ por `/academy/api/media/:id`
   com checagem de acesso (dono/admin/matriculado/degustação) + `download_logs`.
9. **Fluxo editorial (F2)**: transições válidas por papel em `TRANSICOES`
   (produtor: rascunho→em_revisao, aprovado→publicado, pausar/republicar;
   admin: em_revisao→aprovado/rejeitado, suspender/reativar/remover).
10. **Matrícula cortesia (F2)**: produtor/admin liberam acesso por e-mail de
   conta existente — é como se testa a entrega antes do checkout (F4).
11. **Vitrine server-rendered (F3)**: páginas públicas com SEO/OG renderizadas
   no servidor; TODO conteúdo de produtor é escapado (nunca HTML cru — testado).
   Vitrine só mostra `status='publicado'`; capa é o único arquivo servido sem
   login (e só de produto publicado). CTA pré-checkout = interesse→lead+alerta.
12. **Página de venda = seções JSON (F3)** validadas/limitadas no servidor
   (`SalesPages.salvar`), editadas em formulário simples no painel — construtor
   visual drag-and-drop fica para quando houver demanda real.
13. **Avaliações (F3)**: só aluno matriculado, 1 por produto (upsert), média na
   página; moderação oculta/republica sem apagar (trilha preservada).
14. **Checkout de produto único (F4)**: infoproduto raramente precisa de
   carrinho; `orders` referencia o produto direto (order_items só se/quando
   houver carrinho multi-item). Checkout Pro do MP via `mpFetch` injetado.
15. **Liberação de acesso (F4)**: SÓ por webhook confirmado ou consulta segura
   (`/v1/payments/search` server-side); o retorno do navegador nunca libera.
   Webhook idempotente; payload cru salvo em `webhook_events`/`payment_events`.
16. **Comissões (F4)**: plataforma 10% e afiliado padrão 10% — decisão oficial
   do Augusto (fonte: `regras\regras-negocio.md`; viva em `platform_settings`).
   O pedido guarda snapshot do % vigente; reembolso/chargeback revoga o acesso
   e cancela a comissão do afiliado.
17. **Atribuição de afiliado (F5) — estrita e last-click**: o link vale só para
   o produto dele; cookie `academy_ref` httpOnly (30d config.); nunca atribui
   auto-compra nem o próprio produtor; validação toda server-side no checkout.
18. **Comissão do afiliado sai da parte do produtor** (padrão do mercado de
   infoprodutos): líquido = valor − plataforma − afiliado.
19. **Ciclo da comissão (F5)**: pendente → disponível quando a garantia do
   produto vence (liberação preguiçosa ao consultar, sem scheduler) → paga
   (repasse manual via Pix marcado por admin/staff). Split automático do MP
   só quando houver volume que justifique.
20. **Clube = produto (F6)**: assinatura recorrente é um produto tipo 'clube'
   com mensalidade via preapproval do MP; dá acesso ao conteúdo próprio + aos
   produtos incluídos (sempre do mesmo produtor). `temAcesso` unifica
   matrícula/assinatura em TODA checagem de acesso.
21. **Cobrança recorrente vira pedido (F6)**: cada pagamento aprovado da
   assinatura entra em `orders` (tipo 'assinatura') — GMV, receita e líquido
   do produtor num lugar só. Pagamento em dia reativa assinatura pausada.
22. **Cancelamento encerra o acesso na hora (F6)** — manter acesso até o fim
   do ciclo pago é melhoria futura, documentada. Afiliado não comissiona
   assinatura nesta fase.
23. **Storage plugável (F7)**: `storage.js` isola local vs S3-compatível
   (SigV4 implementado à mão — zero dependência nova, padrão da casa). Ligar
   R2 = só setar env `ACADEMY_S3_{ENDPOINT,BUCKET,KEY,SECRET}` — nada de
   código. Uploads pequenos gravam onde o driver mandar; a entrega segue as
   mesmas rotas.
24. **URLs assinadas (F7)**: a autorização acontece SEMPRE em
   `/academy/api/media/:id[/link]` (cookie); o link emitido é temporário
   (10 min), pessoal (uid na assinatura) e funciona sem cookie — é o que
   permite player de vídeo, CDN e apps futuros sem afrouxar o controle.
25. **Vídeo nativo (F7)**: só via upload direto ao bucket (presigned PUT, até
   2 GB) — o servidor nunca segura o arquivo. Sem S3 configurado, vídeo
   continua por URL externa e o sistema explica isso ao produtor.
26. **Comunicação best-effort (F8)**: e-mail/notificação/webhook NUNCA derruba
   o fluxo de negócio — tudo em try/catch com log em `notification_logs`.
   Verificação de e-mail é soft (banner + flag, sem bloquear login) até haver
   motivo comercial para endurecer.
27. **Webhook de saída (F8)**: um único endpoint configurável
   (`webhook_saida` em platform_settings) com HMAC no corpo — é o plugue
   genérico p/ Make/n8n/CRM sem acoplar a plataforma a nenhum deles.
28. **Sem WhatsApp automático a clientes (F8)**: regra da casa — business só
   com template aprovado e nunca em massa; os alertas ao dono já cobrem o
   operacional. Integração de templates fica para quando houver demanda real.

## Rodar e testar

```
npm run test:academy      # suíte da fundação (24 testes)
npm start                 # sobe tudo; landing em http://localhost:3000/academy
```

## Documentos

- [ROADMAP.md](ROADMAP.md) — fases 2–10 com critérios de pronto
- [SEGURANCA.md](SEGURANCA.md) — checklist de segurança (vivo, revisar a cada fase)
- [LGPD.md](LGPD.md) — checklist LGPD (vivo; textos legais são MINUTA até revisão OAB)
