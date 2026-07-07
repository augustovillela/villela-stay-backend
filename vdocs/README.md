# Villela Docs Intelligence — SaaS de gestão documental

**Produto B2B multi-tenant** vendido pela Augusto Villela Ltda a outras empresas: plataforma de
gestão de documentos com organização, permissões, workflows, OCR, busca e IA documental.
**Este README é a fonte da verdade do assunto** (mesmo papel do `legal/README.md` no módulo jurídico).

Status: **Fase 1 (fundação SaaS) COMPLETA** — branch `feat/vdocs`, testes `npm run test:vdocs` (47/47).

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

**Fases 2+ (especificado, não criado)** — na ordem do roadmap:
- F2 documentos: `folders`, `documents`, `document_files` (hash sha256, dedupe), `document_versions`,
  `document_metadata`, `document_types`, `document_permissions`, `document_shares`, `upload_sessions`.
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

## Roadmap (10 fases — spec completa com o Augusto)

~~F0 diagnóstico~~ ✅ · ~~F1 fundação SaaS~~ ✅ · **F2 documentos** (pastas, upload seguro,
versões, metadados, lixeira, e-mail de convite) → F3 processamento (OCR/preview/indexação em
jobs) → F4 busca (FTS5 híbrida, filtros, buscas salvas) → F5 IA documental (chat com fontes,
análise, classificação — reusar padrão modo duplo do legal) → F6 workflows → F7 compartilhamento
externo + portal → F8 billing (Mercado Pago) + relatórios SaaS → F9 API pública + integrações →
F10 enterprise (SSO, 2FA, retenção avançada, observabilidade).

## Próximos passos imediatos (checklist)

1. [ ] Augusto valida a Fase 1 local: `node stays/start-staff-dev.js` → http://localhost:3000/vdocs
   (criar conta trial) e Portal Staff → aba 🗂️ Villela Docs.
2. [ ] Ajustar preços/limites reais dos planos (aba Planos ou `PATCH /staff/api/vdocs/planos/:id`).
3. [ ] Decidir domínio comercial (docs.villelastay.com.br já redireciona; marca própria depois?).
4. [ ] Merge `feat/vdocs` → `master` + push (deploy Render) quando aprovado — **decisão do Augusto**.
5. [ ] Iniciar Fase 2 (documentos) — não precisa de env var nova.

## Teste local

`node stays/start-staff-dev.js` → produto em `http://localhost:3000/vdocs`, staff em `/staff/`
(admin teste@villelastay.com.br / TesteLocal123!). Suíte: `npm run test:vdocs` (banco temporário, 47 testes).
