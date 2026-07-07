# Villela Legal Intelligence — módulo jurídico

Sistema de gestão para escritório de advocacia, construído como **módulo do backend
existente da Villela Stay** (mesmo padrão da Livraria). Estado atual: **Fases 1-6 —
fundação, núcleo jurídico, IA, peças e contratos, portal do cliente/notificações e
relatórios gerenciais** (visão do sócio, por núcleo, financeiro com inadimplência e
margem, prestação de contas com CSV/HTML, arquivo dos relatórios gerados).

## FASE 0 — Diagnóstico técnico do projeto (06/07/2026)

| Item | Situação encontrada |
|---|---|
| Stack | Node.js ≥ 22, Express 4, monólito `server.js` + módulos por pasta (`livraria/` como referência) |
| Banco | Sem PostgreSQL. Padrão da casa: **`node:sqlite`** (embutido no Node 22+, sem compilação nativa) por módulo, em `DATA_DIR/<módulo>/`, + JSON simples p/ dados pequenos |
| Autenticação | Portal Staff: JWT em cookie httpOnly (`staff_token`), usuários em `usuarios.json` (bcrypt), papel `admin`/membro + `areas[]`; rate-limit de login; magic links |
| Autorização | Por área (`juridico`, `ceo`, …) no menu; módulos podem ter matriz própria (Livraria: papel funcional) |
| Frontend | SPA estática em `staff/` — scripts clássicos com escopo global, um `app-*.js` por domínio, menu por área em `app-core.js` |
| Deploy | Render (web service `starter`), disco persistente 1 GB em `/var/data` (`DATA_DIR`), `render.yaml`, health check `/health` |
| Auditoria | `auditoria.jsonl` global + endpoints por módulo |
| Integrações jurídicas já existentes | `stays/juridico.ps1` (DataJud/DJEN/LexML), monitor DJEN diário, agentes `juridico` e `controladoria-juridica`, telas Contratos/Prazos/LGPD no portal |
| Repositório | Branch de trabalho `feat/livraria`; este módulo nasce em **`feat/legal`** |

**Onde o módulo foi inserido:** `backend/legal/` (backend) + `staff/app-legal.js` (painel),
montado no `server.js` via injeção de dependências — **nenhuma rota ou tela existente foi alterada**
(3 pontos de contato: 1 bloco de montagem no `server.js`, 1 `<script>` no `index.html`,
1 item de menu + 1 rota no `app-core.js`).

## Decisões de arquitetura (e porquês)

1. **Módulo do backend existente, não um sistema separado.** Reusa autenticação, deploy, disco,
   auditoria e o Portal Staff. Um segundo serviço dobraria custo/operação sem ganho no estágio atual.
2. **SQLite (`node:sqlite`) em vez de PostgreSQL.** A infra é 1 web service + disco persistente;
   não há Postgres provisionado; escritório single-tenant com poucos usuários concorrentes (WAL atende).
   Zero dependência nova (better-sqlite3 compila nativo e quebra no Windows — lição da Livraria).
   *Caminho de migração*: schema ANSI-fiel; troca confinada a `db.js` + `repo.js`.
3. **Identidade = Portal Staff; o módulo só decide AUTORIZAÇÃO.** Tabela `users` mapeia usuário do
   portal → perfil jurídico. Admin do portal = `super_admin` implícito; área `juridico` sem perfil = `visualizador`.
4. **Matriz de permissões no código (`permissoes.js`), semeada nas tabelas `roles`/`role_permissions` a cada boot.**
   Versionada no git (auditável) e consultável por SQL. 12 perfis × 21 permissões; núcleos são tags do usuário.
5. **Ingestão por agentes via `PUBLISH_KEY`** (`requirePublishOrSession`, padrão da casa): rotinas
   locais (monitor DJEN, DataJud) alimentam andamentos/publicações/prazos/tarefas/IA com perfil
   efetivo `agente_ia` (não aprova, não envia, não protocola).
6. **Documentos**: arquivo no disco (`DATA_DIR/legal/docs/`), metadados + versões + sha256 no banco,
   log de acesso (visualizou/baixou) por exigência de auditoria. Upload base64 (limite 10 MB — o
   `express.json` global aceita 15 MB).
7. **Guardrails jurídicos na fundação** (não são promessa futura):
   - Prazo com `calculo_sugerido` **não avança de status** sem `validado_por` (humano) — trava no repo.
   - Resposta de IA nasce `rascunho`; `aprovado` exige revisor com permissão; toda resposta carrega fontes e aviso de minuta.
   - `aprovar`/`enviar_cliente`/`protocolar` em documentos exigem permissões próprias.
   - Estratégia do caso e notas internas nunca saem para o cliente; CPF/RG mascarados sem `ver_dados_sensiveis`.
8. **Valores em centavos** (INTEGER), datas ISO-8601, enums validados no repo — padrão da casa.

## Estrutura

```
legal/
  schema.sql       # 35+ tabelas (CREATE IF NOT EXISTS, idempotente) + tabela migrations
  db.js            # conexão node:sqlite (DATA_DIR/legal/legal.db, WAL), helpers
  permissoes.js    # perfis, matriz de permissões, seed, resolução de perfil
  feriados.js      # feriados forenses (seed nacional + art. 220 CPC) e cálculo SUGERIDO
                   #   de prazo (arts. 219/224 CPC) — todo cálculo é logado e exige validação
  repo.js          # CRUD/validações: Clientes, Processos, Andamentos, Publicações, Prazos,
                   #   Tarefas (Kanban+histórico), Audiências, Agenda, Documentos, IA,
                   #   Financeiro, Legado, Auditoria, Integrações, Dashboard
  rotas-staff.js   # API REST /staff/api/legal/* (auth sessão + PUBLISH_KEY p/ ingestão)
  index.js         # montar(app, deps) — chamado pelo server.js
  README.md        # este arquivo
staff/app-legal.js # painel (sub-app com abas) no Portal Staff — menu "⚖️ Villela Legal"
```

## Modelo de dados (MVP implementado)

- **Identidade**: `roles`, `role_permissions`, `users` (perfil jurídico por usuário do portal)
- **Clientes**: `clients`, `client_contacts`, `client_consents` (LGPD), `client_notes` (internas)
- **Processos**: `cases` (CNJ único, risco, núcleo, estratégia sigilosa), `case_parties`, `case_lawyers`
- **Andamentos**: `case_movements` (fonte, payload bruto, hash de dedupe, classificação)
- **Publicações**: `case_publications` (fluxo nova→lida→analisada→prazo_criado/descartada, dedupe)
- **Prazos**: `deadlines` (interno/fatal, 10 status, trava de validação humana), `deadline_events` (histórico)
- **Tarefas**: `tasks` (checklist JSON), `task_comments`
- **Documentos**: `documents` (sigilo, 6 status), `document_versions` (sha256), `document_access_logs`
- **IA**: `ai_queries`, `ai_responses` (confiança, status de revisão), `ai_sources` (citação/URL/tribunal)
- **Peças/contratos (fundação)**: `legal_drafts`, `legal_draft_versions`, `contract_reviews`
- **Financeiro**: `financial_accounts` (10 tipos, visível_cliente p/ prestação de contas)
- **Infra**: `notifications`, `audit_logs`, `integration_logs`, `webhook_events`, `migrations`
- **Fase 2**: `hearings` + `hearing_participants` + `hearing_followups` (audiências; roteiro interno,
  estratégia sigilosa, providência→tarefa), `court_holidays` (feriados por âmbito + suspensões art. 220),
  `deadline_calculation_logs` (memória auditável de cada cálculo), `task_status_history` (Kanban)

## API (prefixo `/staff/api/legal`)

| Recurso | Rotas | Permissão |
|---|---|---|
| Sessão/catálogos | `GET /eu`, `GET /dashboard` | acesso ao módulo / `ver_processos` |
| Equipe | `GET/POST /equipe` | `gerir_usuarios` |
| Clientes | `GET/POST /clientes`, `GET/PATCH /clientes/:id`, `POST .../contatos|consentimentos|notas` | `gerir_clientes` (+`ver_dados_sensiveis` p/ CPF/RG) |
| Processos | `GET/POST /processos`, `GET/PATCH /processos/:id`, `POST .../partes|advogados` | `ver_/criar_/editar_processos` |
| Andamentos | `GET/POST /processos/:id/andamentos` † | `editar_processos` |
| Publicações | `GET/POST /publicacoes` †, `PATCH /publicacoes/:id` | `gerir_publicacoes` |
| Prazos | `GET/POST † /prazos`, `POST /prazos/calcular` †, `PATCH /prazos/:id`, `GET /prazos/:id/eventos` | `gerir_prazos` |
| Audiências | `GET/POST † /audiencias`, `GET/PATCH /audiencias/:id`, `POST .../participantes`, `POST .../providencias` (opção criar_tarefa), `PATCH /providencias/:id` | `ver_processos` / `gerir_prazos` |
| Agenda/Feriados | `GET /agenda?dias=`, `GET/POST/DELETE /feriados` | `ver_processos` / `gerir_prazos` |
| Legado | `POST /importar/prazos-legado` (idempotente, marca `[legado:id]`), `POST /importar/contratos-legado` (idempotente, `documents.legado_id`) | `gerir_prazos` / `criar_documentos` |
| Peças | `GET/POST /pecas`, `GET/PATCH /pecas/:id` (gates aprovar/protocolar/enviar), `POST /pecas/:id/versoes` †, `POST /pecas/:id/gerar`, `GET /pecas/:id/exportar?formato=html\|doc` | `ver_/criar_/editar_documentos` + especiais |
| Contratos | `GET /contratos/templates`, `POST /contratos/gerar` (wizard), `GET/POST /contratos/analises`, `GET/PATCH † /contratos/analises/:id` | `ver_documentos` / `criar_documentos` / `usar_ia` |
| Portal do cliente (staff) | `GET/POST /clientes/:id/portal-acesso` (cria conta + link de senha), `GET /notificacoes` (alertas da equipe) | `gerir_clientes` / `ver_processos` |
| Relatórios | `GET /relatorios/socio(/exportar)`, `GET /relatorios/nucleo/:n`, `GET /relatorios/financeiro`, `GET /relatorios/prestacao-contas/:cid(/exportar?formato=csv\|html)`, `GET /relatorios/gerados(/:id)` | `ver_financeiro` / `ver_processos` / `ver_prestacao_contas` / `exportar_relatorios` |
| Portal do cliente (público) | `/cliente-juridico` (app) + `/cliente-juridico/api/*`: login/logout/definir-senha, me, processos(/:id), documentos (listar/baixar/enviar), conta, mensagens, notificações | cookie próprio do cliente |
| Tarefas | `GET/POST † /tarefas`, `GET /tarefas/kanban`, `PATCH /tarefas/:id`, `GET .../historico`, `GET/POST .../comentarios` | `gerir_tarefas` |
| Documentos | `GET/POST /documentos`, `GET/PATCH /documentos/:id`, `POST .../versao`, `GET .../download` | `ver_/criar_/editar_documentos` (+especiais p/ aprovar/enviar/protocolar) |
| IA | `GET /ia`, `GET /ia/status`, `GET /ia/agentes`, `GET /ia/prompts`, `GET /ia/buscar?q=`, `POST /ia/consultas`, `GET /ia/consultas/pendentes` †, `POST /ia/consultas/:id/responder` †, `GET/POST †/DELETE /ia/conhecimento`, `POST /ia/extracao` †, `POST /ia/reindexar`, `GET /ia/runs` (custos), `GET /ia/respostas/:id`, `POST /ia/registrar` †, `POST /ia/respostas/:id/revisar` | `usar_ia` / `aprovar_documentos` / `ver_auditoria` |
| Financeiro | `GET/POST /financeiro`, `PATCH /financeiro/:id` | `ver_/gerir_financeiro` |
| Auditoria | `GET /auditoria`, `GET /integracoes`, `POST /integracoes/log` †, `POST /webhooks/:origem` † | `ver_auditoria` / `gerir_publicacoes` |

† = aceita também `x-publish-key: PUBLISH_KEY` (ingestão por agentes, perfil efetivo `agente_ia`).

## Como testar localmente

```
node stays/start-staff-dev.js   # (ou preview "staff-backend" do launch.json)
# admin de teste: teste@villelastay.com.br / TesteLocal123! · PUBLISH_KEY=chave-teste
# portal: http://localhost:3298/staff/ → menu "⚖️ Villela Legal"
```

## Plano de evolução (próximas fases — sem retrabalho da fundação)

- **Fase 2 — CONCLUÍDA (06/07/2026)**: audiências com participantes/roteiro/providências→tarefa;
  agenda unificada (prazos+audiências, 30 dias); feriados forenses por âmbito + suspensão art. 220
  CPC semeados; calculadora de prazo (arts. 219/224) com log auditável e trava de validação humana;
  Kanban de tarefas com histórico de status; importação idempotente de `prazos-juridicos.json`.
  *Nota*: a importação de contratos legados ficou para a Fase 4 (módulo de contratos).
- **Fase 3 — CONCLUÍDA (06/07/2026)**: IA jurídica em MODO DUPLO.
  *Arquitetura*: `llm.js` (camada abstrata Anthropic — SDK oficial `@anthropic-ai/sdk`, modelo
  `claude-opus-4-8` c/ fallback `claude-sonnet-4-6` via `LEGAL_LLM_MODELS`, adaptive thinking,
  structured outputs JSON com schema §9, prompt caching nos guardrails, custo/latência logados em
  `ai_agent_runs`) + `ia.js` (RAG: FTS5/BM25 nativo do node:sqlite — sem dependência de embeddings;
  índice `rag_index` sobre conhecimento curado, extrações de documentos, minutas, publicações,
  andamentos e processos — estratégia sigilosa fica FORA do índice) + `prompts-seed.js` (16 agentes
  especialistas do Módulo 11 + 18 prompts do §6, versionados e semeados por upsert).
  *Modo direto*: com `ANTHROPIC_API_KEY` no Render, `POST /ia/consultas` responde na hora.
  *Modo fila*: sem chave, a consulta fica pendente; o agente jurídico local consome
  `GET /ia/consultas/pendentes` (pergunta + prompt do especialista + guardrails + contexto RAG)
  e devolve por `POST /ia/consultas/:id/responder` — ambos via PUBLISH_KEY.
  *Decisão embeddings*: sem provedor de embeddings na infra, o retrieval é lexical (BM25); a
  migração para vetores (`sqlite-vec`/pgvector + API de embeddings) fica isolada em `ia.js`.
- **Fase 4 — CONCLUÍDA (06/07/2026)**: peças e contratos.
  *Peças (Módulo 10, `pecas.js`)*: `legal_drafts` + versões; 28 tipos de peça; fluxo
  rascunho→revisão→aprovado→protocolado/enviado com gates de permissão; TRAVAS: aprovar exige
  sessão humana identificada, e peça `gerado_por_ia` não protocola/envia sem `aprovado_por`;
  geração assistida (modo direto `llm.executar` texto, ou FILA — ai_query com
  `{finalidade:'gerar-peca', draft_id}`; o agente local devolve em `POST /pecas/:id/versoes`);
  toda versão entra no RAG; exportação HTML (imprimir→PDF) e .doc (HTML+mime Word — decisão:
  zero dependência; DOCX real fica p/ quando houver lib aprovada) com carimbo MINUTA enquanto
  não aprovada e log em `legal_draft_exports`.
  *Contratos (Módulos 12+13, `contratos.js`)*: mapeamento — contrato recebido/assinado =
  `documents` (tipo contrato); minuta em elaboração = `legal_drafts`; análise =
  `contract_reviews` (+`analise_json` via migração). Biblioteca de 4 modelos seed
  (prestação de serviços, NDA, honorários, hospedagem/temporada padrão Villela) com cláusulas
  obrigatórias/opcionais e placeholders `{{campo}}`; wizard grava a sessão em
  `contract_generation_sessions`; análise por IA com schema JSON próprio (direto ou fila,
  agente `contratual`); migração idempotente de `contratos.json` + arquivos do portal antigo
  (`documents.legado_id`, migração 001/002 no runner novo do `db.js`).
- **Fase 5 — CONCLUÍDA (07/07/2026)**: portal do cliente + notificações.
  *Portal (Módulo 17, `portal-cliente.js`)*: páginas server-rendered em `/cliente-juridico`
  (login próprio — `client_accounts`, bcrypt, cookie JWT restrito ao path; staff cria o acesso na
  ficha do cliente e envia link de definição de senha com validade de 7 dias). O cliente vê:
  processos (SEM sigilosos; SEM estratégia/prognóstico/risco/valor), andamentos em linguagem
  simples (resumo>descrição), próximas datas (só prazos VALIDADOS e ativos), documentos
  `sigilo='cliente'` (download logado), prestação de contas (`visivel_cliente=1` + total em
  aberto), upload de documentos ao escritório e mensagens bidirecionais (= `client_notes` com
  `interna=0`; a nota interna continua invisível).
  *Notificações (Módulo 18, `notificacoes.js`)*: serviço único — linha `interna` sempre (sino do
  portal) + e-mail (padrão ligado se houver endereço) + WhatsApp (só opt-in explícito em
  `clients.preferencias_comunicacao` — decisão: preferências nesse JSON já existente, sem tabela
  nova); envio best-effort com status por canal na tabela `notifications`. Ganchos ativos:
  novo andamento → cliente (desativável com `notificar_cliente:false`); documento
  liberado/enviado → cliente; mensagem do escritório → cliente; mensagem/upload do cliente →
  equipe (interna + WhatsApp do Augusto). Digests agendados ficam nas rotinas da Fase 7.
- **Fase 6 — CONCLUÍDA (07/07/2026)**: relatórios gerenciais (`relatorios.js`).
  *Visões (Módulo 20)*: **sócio** (processos ativos/núcleo/fase, risco da carteira com valor em
  causa, prazos vencidos/7d/sem validação + críticos, publicações/peças/IA pendentes, financeiro,
  clientes estratégicos, produtividade 30d via `task_status_history`, gargalos por responsável,
  processos parados 30d+); **núcleo** (fases, tarefas, prazos, audiências 30d, atrasos);
  **financeiro** (a receber, inadimplência = faturado vencido, receita recebida − despesas pagas
  = margem, repasses pendentes, por tipo×status, inadimplentes, top clientes); **prestação de
  contas por cliente** (extrato completo + totais). *Decisão*: métricas calculadas AO VIVO (sem
  `dashboard_metrics` materializada — volume de escritório não justifica); exportações HTML
  imprimível e CSV (com BOM p/ Excel) ficam ARQUIVADAS em `generated_reports` (re-download fiel
  ao momento + auditoria de quem gerou). Relatórios diários automáticos = rotinas da Fase 7.
- **Fase 7 — Integrações**: rotina diária DataJud/DJEN gravando via API deste módulo (reusar
  `stays/juridico.ps1` + monitor DJEN existente → `POST /publicacoes` e `/processos/:id/andamentos`),
  LexML, fornecedores licenciados via `webhook_events`.
- **Fase 8 — Testes, segurança, deploy**: suíte de testes de rotas, revisão LGPD, deploy Render.

## Checklists

**Segurança/LGPD (estado atual)**
- [x] Autenticação por sessão JWT httpOnly (reuso do portal) + rate-limit de login
- [x] Autorização por perfil (12 perfis × 21 permissões) + trava de dados sensíveis (CPF/RG/estratégia)
- [x] Auditoria de escrita (audit_logs) e de acesso a documento (document_access_logs)
- [x] Registro de consentimento LGPD por finalidade/base legal
- [x] Upload validado (extensão allowlist, 10 MB, sha256) fora de pasta pública
- [x] Ingestão externa só com PUBLISH_KEY; payload bruto preservado p/ auditoria
- [ ] Criptografia em repouso de campos sensíveis (avaliar na Fase 8)
- [ ] Política de retenção/anonimização (Fase 8)
- [ ] Backup do `legal.db` no snapshot OneDrive/repo (incluir na rotina existente)

**Regras invioláveis herdadas do projeto**
- Coleta processual só por API oficial (DataJud/DJEN/LexML) — sem scraping/captcha-bypass.
- Nada gerado por IA é peça final: sempre MINUTA com revisão de advogado (OAB).
- Dados pessoais e credenciais nunca em commit, portal público ou resposta.
