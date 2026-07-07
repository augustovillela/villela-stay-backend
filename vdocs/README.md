# Villela Docs Intelligence — SaaS de gestão documental

**Produto B2B multi-tenant** vendido pela Augusto Villela Ltda a outras empresas: plataforma de
gestão de documentos com organização, permissões, workflows, OCR, busca e IA documental.
**Este README é a fonte da verdade do assunto** (mesmo papel do `legal/README.md` no módulo jurídico).

Status: **Fases 1–7 EM PRODUÇÃO** (último deploy `cdc12f6`, 07/07/2026) · **Fase 8 (billing
Mercado Pago) COMPLETA** na branch `feat/vdocs-f8` (aguardando validação p/ merge).
Testes: `npm run test:vdocs` (177/177).

| O quê | Onde |
|---|---|
| Landing comercial | `/vdocs` (subdomínio futuro: `docs.villelastay.com.br` — redirect já no server.js) |
| Preços | `/vdocs/precos` |
| Cadastro (trial 14 dias) / Login | `/vdocs/cadastro` · `/vdocs/login` |
| Painel da empresa cliente | `/vdocs/app` (sessão própria, cookie `vdocs_sess`) |
| API do produto | `/vdocs/api/*` |
| Administração da plataforma | Portal Staff → aba **🗂️ Villela Docs** (áreas `ti`/`ceo`; escrita = admin) |
| Banco e arquivos | `DATA_DIR/vdocs/` (vdocs.db + storage/) |

---

## FASE 0 — Diagnóstico do repositório (07/07/2026)

**Stack existente**: Node.js ≥22 + Express 4, um único web service no Render (plano starter,
disco persistente 1 GB em `/var/data` = `DATA_DIR`), deploy por push no `master`.
Sem framework de frontend: SPAs em JS clássico (Portal Staff) e páginas server-rendered (Livraria).
Autenticação do portal: JWT em cookie (`staff_token`) + bcryptjs; usuários em JSON no disco.
Módulos de produto (Livraria, Legal) são **pacotes autocontidos** montados no `server.js` por
injeção de dependência (`require('./modulo').montar(app, deps)`), cada um com SQLite próprio via
`node:sqlite` (decisão registrada: better-sqlite3 compila nativo e quebra no Windows).

**Riscos identificados e como foram tratados**:
- *Sessões misturadas* → o vdocs usa cookie **próprio** (`vdocs_sess`, path `/vdocs`), nunca o do staff.
- *Vazamento entre empresas* → isolamento lógico por `tenant_id` obrigatório no repo + selftest dedicado.
- *Quebrar o site atual* → módulo 100% aditivo: 3 edições mínimas no server.js/staff (montagem,
  redirect de host, aba), tudo dentro de `try/catch` como os outros módulos.
- *SQLite mono-arquivo no futuro* → schema ANSI-fiel; troca de banco confinada a `db.js`+`repo.js`.

**Decisões da Fase 1** (razoáveis por padrão, reversíveis):
1. **SQLite + isolamento lógico** (não Postgres, não banco-por-tenant) — infra atual não tem Postgres;
   o produto nasce com poucos tenants; WAL atende. Migração p/ Postgres+S3+OpenSearch planejada (§Arquitetura).
2. **Usuário global + vínculo por tenant** (`users` + `tenant_users`) — um e-mail participa de N empresas,
   igual Slack/Notion; a troca de empresa reemite o cookie.
3. **RBAC embutido + papéis custom por tenant** — catálogo único de permissões (`permissoes.js`);
   ABAC fica p/ enterprise (ponto único de troca: `permissoesDe()`).
4. **Trial de 14 dias no plano Professional**, sem cartão; expirou → bloqueio 402 (dashboard avisa).
5. **Convite por link** (token só existe na resposta; no banco fica sha256) — e-mail automático na Fase 2.
6. **Preços em centavos**, seed: Starter 99 / Professional 249 / Business 599 / Enterprise sob consulta.

## Arquitetura

```
backend/vdocs/
├── db.js           SQLite (WAL) em DATA_DIR/vdocs/vdocs.db + migrações + helpers
├── schema.sql      Fundação: tenants, users, tenant_users, roles, invites, plans,
│                   subscriptions, usage_records, tenant_settings, audit_logs, leads
├── permissoes.js   Catálogo de permissões + 10 papéis embutidos + papéis custom
├── repo.js         Acesso a dados — TODA função de dado de cliente exige tenantId
├── auth.js         Sessão JWT própria + requireTenant/requirePerm + rate limit login
├── rotas-api.js    /vdocs/api/* (cadastro, login, me, dashboard, usuários, convites,
│                   papéis, auditoria, uso, config, leads)
├── rotas-staff.js  /staff/api/vdocs/* (resumo, tenants, planos, leads, auditoria)
├── paginas.js      Landing, preços, cadastro, login, convite + SPA /vdocs/app
├── index.js        montar(app, { express, requireAuth, requireAdmin, alertaAugusto, jwtSecret })
└── selftest.js     47 testes de rota real (npm run test:vdocs)
staff/app-vdocs.js  Aba da plataforma no Portal Staff (renderVdocs)
```

**Separação de identidades** (importante): usuários do *produto* (empresas clientes) vivem em
`vdocs.db` e NUNCA se misturam com os usuários do Portal Staff. O staff administra a plataforma
(status/plano dos tenants), mas não loga nos painéis das empresas.

**Evolução planejada da infra** (quando a escala pedir — nada disso bloqueia as Fases 2–5):
PostgreSQL (dados), Redis (filas/cache/rate limit), storage S3-compatível (arquivos privados +
URLs assinadas), OpenSearch (busca textual), pgvector/Qdrant (busca semântica), workers separados
(OCR/preview/embeddings/notificações). A abstração fica em `db.js`/`repo.js` + um futuro `storage.js`.

## Fluxo de autorização (toda rota autenticada)

1. `requireTenant` verifica o JWT do cookie → carrega `user` + `tenant` + `vinculo` → o
   **tenant vem do token, nunca de parâmetro** (anti-IDOR).
2. Tenant `suspensa`/`cancelada`/trial vencido → **402** em tudo exceto `/me` (a tela avisa).
3. `requirePerm('chave')` checa a permissão efetiva do papel (embutido ou custom).
4. Escrita relevante → `repo.auditar(tenantId, ator, acao, ...)` (ações da plataforma são
   gravadas 2×: no audit da plataforma `tenant_id=''` e no do tenant afetado — transparência).

## Papéis embutidos × permissões

Dono (tudo) · Administrador (tudo − cobrança) · Gestor de documentos · Gestor de departamento ·
Aprovador · Usuário interno · Auditor · Leitor · Colaborador temporário · Externo.
Catálogo completo em `permissoes.js` (22 permissões). Papéis custom: aba Usuários (Fase 1 via API).

## API (Fase 1)

Públicas: `POST /vdocs/api/cadastro` · `POST /vdocs/api/login` · `POST /vdocs/api/logout` ·
`POST /vdocs/api/convites/aceitar` · `POST /vdocs/api/leads`.
Autenticadas (cookie `vdocs_sess`): `GET /me` · `POST /trocar-tenant` · `GET /dashboard` ·
`GET|PATCH /config` · `GET /usuarios` · `PATCH /usuarios/:vinculoId` · `POST|DELETE /convites[/:id]` ·
`GET|POST|DELETE /papeis[/:id]` · `GET /auditoria` · `GET /uso`.
Plataforma (sessão staff, áreas ti/ceo; escrita admin): `GET /staff/api/vdocs/resumo|tenants[/:id]|planos|leads|auditoria`,
`PATCH /staff/api/vdocs/tenants/:id` (status/plano_slug), `PATCH /staff/api/vdocs/planos/:id`.

## Modelo de dados

**Fase 1 (criado)**: `plans`, `tenants`, `tenant_settings`, `subscriptions`, `usage_records`,
`users`, `tenant_users`, `roles`, `access_invites`, `audit_logs`, `leads`, `migrations`.
Convenções: id `base64url(9)`, datas ISO-8601 TEXT, JSON em TEXT (`j.parse/str`),
`tenant_id` obrigatório em tudo que é dado de cliente.

**Fase 2 (criado)**: `folders` (árvore com anti-ciclo), `documents` (tipo documental, tags,
validade, lixeira), `document_versions` (sha256, dedupe por conteúdo, restaurar = nova versão),
`document_metadata` (chave→valor por documento), `document_access_logs` (visualizar/baixar com
IP — LGPD). Domínio em `docs.js`; storage privado em `DATA_DIR/vdocs/storage/<tenant>/<doc>/`
com nome interno gerado, caminho validado (anti path-traversal) e download SEMPRE autenticado
com `Content-Disposition: attachment` + `nosniff`. Upload em base64 (JSON até 30 MB → arquivo
≤20 MB), lista fechada de extensões (executáveis recusados). Limites do plano aplicados em
documentos e armazenamento (uso "vivo" no `usoDoMes`). Convite agora dispara e-mail (best-effort).

**Fase 3 (criado)**: `processing_jobs` (fila com retentativa ≤3, status
aguardando|processando|concluido|erro|ocr_pendente), `document_texts` (texto da versão vigente),
`docs_fts` (FTS5/BM25 — mesma técnica do RAG do legal). Motor em `extrair.js` (SEM dependência
nativa): txt/csv/md/json/xml direto; docx/xlsx/pptx/odt/ods/odp via leitor ZIP próprio (zlib);
**PDF via `pdfjs-dist`** (JS puro; PDF escaneado sem camada de texto → `ocr_pendente`).
Worker in-process (`jobs.js`, timer 7 s, 1 job por vez — upload nunca espera extração) +
**rotina diária de vencimentos** (~8h Brasília: documents.validade ≤30 dias → e-mail ao contato
da empresa + banner no dashboard). Busca agora cobre CONTEÚDO (snippet destacado; resultado de
outra pasta vem marcado). `VDOCS_ROTINAS=off` desliga os timers (testes).
DECISÕES F3: OCR de imagem/escaneado NÃO embarcado (tesseract.js é pesado p/ a instância starter)
— fica na fila como `ocr_pendente` e pluga depois sem mudar o fluxo; formatos legados .doc/.xls/
.ppt → orientar conversão; previews/miniaturas exigiriam renderer nativo → adiado.

**Fase 4 (criado)**: `search_queries` (histórico p/ sugestões — só termo/filtros, nunca conteúdo)
e `saved_searches` (pessoais por usuário, upsert por nome). Motor em `busca.js`: busca HÍBRIDA
(nome via LIKE + conteúdo via FTS5/BM25, casar nos dois sobe no ranking) com **operadores**
(`"frase exata"`, `OR`, `-excluir`; cada token escapado — sem injeção de sintaxe FTS) e filtros
(tipo, tag, pasta, período de criação, só vencendo em 30 dias). Tela 🔎 Busca no painel com
buscas salvas e recentes. Rotas: `GET /busca`, `GET /busca/contexto`, `POST|DELETE /buscas-salvas`.
ADIADO p/ fase futura: alertas de busca salva (documento novo que casa com a busca) e busca
semântica por embeddings (F5 usa o FTS como RAG; vetores só se a qualidade pedir — decisão igual à do legal).

**Fase 5 (criado)**: `ai_conversations`/`ai_messages` (conversa pessoal com escopo base|pasta|
documento), `ai_feedback` (útil/incorreta/sensível) e `ai_runs` (tokens + custo estimado POR
TENANT — insumo da margem no Módulo 20). Motor em `ia.js`: **modo DIRETO com a
ANTHROPIC_API_KEY do Render** (decisão do Augusto 07/07 — SaaS não tem fila de agente local;
sem chave → indisponível com aviso claro), modelos `VDOCS_LLM_MODELS` (default opus-4-8 →
sonnet-4-6, fallback), structured output (resposta + fontes_usadas + nao_encontrado +
nivel_confianca), guardrails: responde SÓ com base nos trechos, cita [n], diz quando não achou,
não transcreve dado pessoal. RAG = FTS5 (termos da pergunta em OR, BM25 top 8, filtrado pelo
ESCOPO e sempre pelo tenant). Pergunta consome `ia_consultas` do plano (checado ANTES da
chamada). Tela 🤖 no painel com conversas, fontes clicáveis e feedback; botão "Perguntar à IA"
no detalhe do documento. Selftest usa `ia.__mockParaTeste` — nunca chama a API real.
BUG CORRIGIDO de tabela: `checarLimite` agora mapeia métrica→chave do plano
(ia_consultas→ia_consultas_mes, ocr_paginas→ocr_paginas_mes) — antes essas duas nunca limitavam.

**Fase 6 (criado)**: `workflows` (modelos por tenant; etapas SEQUENCIAIS em JSON com nome,
aprovadores e prazo_dias), `workflow_instances` (etapas CONGELADAS na abertura; versão do
documento submetida registrada; status em_andamento|aprovado|rejeitado|cancelado) e
`workflow_approvals` (histórico de decisões). DECISÕES MVP: dentro da etapa QUALQUER aprovador
listado decide sozinho (paralelismo/unanimidade ficam p/ evolução); rejeição exige justificativa
e ENCERRA a instância (reenvio = nova); 1 aprovação em andamento por documento; só o solicitante
cancela. Notificações: e-mail ao(s) aprovador(es) da etapa e ao solicitante no desfecho
(best-effort); lembrete diário de atrasadas na rotina do jobs.js. Tela ✅ Aprovações (pendentes
p/ mim com aprovar/rejeitar, minhas solicitações, histórico, modelos com aprovadores por
e-mail) + envio p/ aprovação e status no detalhe do documento + KPI no dashboard.

**Fase 7 (criado)**: `shares` (link p/ DOCUMENTO ou PASTA = "sala segura"; token de 24 bytes só
existe na criação — no banco fica sha256; senha opcional em bcrypt com throttle por IP;
expiração; modo só-visualização mostra o TEXTO EXTRAÍDO sem download; revogação imediata),
`share_access_logs` (visualizar/baixar/senha_errada com IP — LGPD) e `document_requests`
(solicitação de upload externo: página pública onde o convidado envia arquivos que viram
documentos normais na pasta escolhida — mesma validação de extensão/tamanho/limites do plano,
`forcar_duplicado` pois o externo não decide dedupe; e-mail ao solicitante a cada recebimento).
Páginas públicas `/vdocs/s/:token` e `/vdocs/r/:token` (noindex; download por POST p/ senha
nunca ir em query/log). Tela 🔗 Compartilhamentos no painel + botão no detalhe do documento.

**Fase 8 (criado)**: `payments` (recorrência recebida; idempotente por mp_payment_id),
`billing_events` (webhooks brutos p/ auditoria/replay) e migração `mp_preapproval_id` em
subscriptions. Motor em `billing.js`: assinatura MENSAL via **Mercado Pago preapproval**
(mesma conta MP do backend, `mpFetch` injetado; nenhum dado de cartão no nosso lado) —
dono clica Assinar → autoriza no MP → webhook `POST /vdocs/api/billing/webhook` relê o
recurso na API do MP (padrão da Livraria; payload é só aviso) → assinatura ativa + tenant
ativa (encerra o trial); cancelamento/pausa (inadimplência) → tenant SUSPENSA + alerta ao
Augusto; pagamento aprovado → payments + alerta. Tela Plano e uso ganhou 💳 Assinatura
(assinar/cancelar/pagamentos; sem MP_ACCESS_TOKEN mostra fallback de contato) e o staff
ganhou aba 💰 Receita (MRR, recebido/mês, trials expirando 7d — também na rotina diária via
WhatsApp —, assinaturas e CUSTO DE IA POR TENANT p/ margem).
DECISÕES F8 (padrão razoável até o Augusto definir): só mensal (anual = evolução); sem cupons
na v1; trocar de plano = cancelar e assinar de novo (ou manual pelo staff).
⚠️ CONFIGURAR NO MP (pós-deploy): webhook de assinaturas apontando p/
`https://villela-stay-backend.onrender.com/vdocs/api/billing/webhook` (painel do MP →
notificações), senão a ativação depende de conferência manual.

**Fases 9+ (especificado, não criado)** — na ordem do roadmap:
- F2/F3 extras adiados: `document_permissions` finas por pasta/documento (hoje o RBAC de papel
  cobre), `document_shares`/links externos (F7), previews/miniaturas, upload multipart resumable,
  OCR real (tesseract/serviço externo) plugando em `processing_jobs`.
- F3 processamento: `ocr_jobs`, `document_texts`, `document_pages`, `document_previews`, `indexing_jobs`, `processing_logs`.
- F4 busca: `search_queries`, `saved_searches` (FTS5/BM25 do node:sqlite — mesmo caminho provado no legal).
- F5 IA: `ai_conversations`, `ai_messages`, `ai_sources` (citação obrigatória), `ai_feedback`,
  `ai_usage_logs`, `ai_prompt_templates` (modo duplo direto/fila igual ao legal).
- F6 workflows: `workflows`, `workflow_templates`, `workflow_steps`, `workflow_instances`,
  `workflow_approvals`, `workflow_comments`.
- F7 compartilhamento externo: `shares`, `share_access_logs`, `external_users`, `document_requests`, `secure_rooms`.
- F8 billing: `invoices`, `payments`, `billing_events`, `coupons` (gateway: Mercado Pago já integrado no backend).
- F9 integrações: `api_keys`, `api_usage_logs`, `webhook_subscriptions`, `webhook_events`, `integrations`.
- F10 enterprise: `legal_holds`, `retention_policies`, `disposal_requests`, SSO/2FA.

## Checklist de segurança (Fase 1)

- [x] Senhas bcrypt (custo 10); nunca em log/auditoria
- [x] Sessão JWT httpOnly + sameSite lax + secure (fora de dev), cookie restrito a /vdocs
- [x] Rate limit de login/cadastro (5 falhas/IP → 15 min) e de leads (30 s/IP)
- [x] Tenant SEMPRE do token; ids de rota validados contra o tenant (anti-IDOR — testado)
- [x] RBAC negando por padrão; papel `dono` não concedível por convite; último dono protegido
- [x] Token de convite: sha256 no banco, expiração 7 dias, uso único (testado)
- [x] Escapamento HTML em toda renderização (`esc()`), inputs truncados (`s()`), settings por lista branca
- [x] Auditoria de toda escrita (com IP), sem dados sensíveis nos detalhes
- [x] `Cache-Control: no-store` nas APIs; nada de credencial no repositório
- [ ] F2: validação de MIME/extensão/tamanho de upload, storage privado com URL assinada, antivírus pipeline
- [ ] F8: bloqueio automático por inadimplência · F10: 2FA, SSO, CSP estrita

## Checklist LGPD (Fase 1)

- [x] Minimização: fundação só guarda nome/e-mail de usuários e dados cadastrais da empresa
- [x] Isolamento por tenant (testado) — dados de uma empresa nunca aparecem para outra
- [x] Trilha de auditoria por tenant (acesso do titular ao histórico) + transparência de ações da plataforma
- [x] Retenção configurável (`retencao_padrao_dias` em tenant_settings — aplicada aos docs na F2)
- [x] Landing informa privacidade/LGPD; leads com finalidade explícita (contato comercial)
- [ ] F2: registro de acesso a documento (document_access_logs), classificação de docs sensíveis
- [ ] F7: exportação completa dos dados do tenant (takeout) e exclusão/anonimização no cancelamento
- [ ] F8: DPA (contrato de processamento de dados) no onboarding; política de privacidade e termos formais

## Roadmap (10 fases — spec completa com o Augusto; ordem confirmada em 07/07/2026)

~~F0 diagnóstico~~ ✅ · ~~F1 fundação SaaS~~ ✅ (produção) · ~~F2 documentos~~ ✅ (produção) ·
~~F3 processamento~~ ✅ (produção) · ~~F4 busca avançada~~ ✅ (produção) · ~~F5 IA documental~~
✅ (produção) · ~~F6 workflows~~ ✅ (produção) · ~~F7 compartilhamento externo~~ ✅ (produção) ·
~~F8 billing~~ ✅ (branch) → **F9 API pública + integrações** (api_keys por tenant, rate limit
por plano, webhooks de eventos, docs da API) → F10 enterprise (SSO, 2FA, retenção avançada,
observabilidade).

## Próximos passos imediatos (checklist)

1. [ ] Augusto valida a Fase 8 (tela 💳 Assinatura + aba 💰 Receita no staff) e autoriza merge
   `feat/vdocs-f8` → master (deploy Render).
2. [ ] Pós-deploy F8: configurar o webhook de assinaturas no painel do Mercado Pago →
   `https://villela-stay-backend.onrender.com/vdocs/api/billing/webhook`.
3. [ ] **DNS pendente (Augusto)**: criar CNAMEs `docs.`, `livros.` e `juridico.` villelastay.com.br
   → Render + adicioná-los em Custom Domains do serviço (verificado 07/07: os 3 não resolvem).
4. [ ] Decisões de billing quando quiser evoluir: plano anual com desconto? cupons?
5. [ ] Iniciar Fase 9 (API pública + integrações) — sem env var nova.

## Teste local

`node stays/start-staff-dev.js` → produto em `http://localhost:3000/vdocs`, staff em `/staff/`
(admin teste@villelastay.com.br / TesteLocal123!). Suíte: `npm run test:vdocs` (banco temporário, 142 testes).
