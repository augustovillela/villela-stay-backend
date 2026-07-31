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
3. **Integração Stays.net por tenant (módulo `canais`)** — cada assinante conecta a **própria**
   conta Stays.net (que já sincroniza Airbnb/Booking/Decolar/Vrbo/Expedia/Google e diretas) e
   o sistema **importa anúncios → imóveis e reservas → reservas** (upsert por id externo).
   Ver §Integração Stays.net.

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
- **Testes:** `npm run test:vsm` (75/75 — 41 do núcleo + 34 da ONDA LIVRO; landing, entitlements, overrides, suspensão,
  editar planos, upgrade/downgrade, custo/margem, signup, definir senha, tickets, assinatura
  MP mock, webhook MP, ciclo de vida, rate-limit, leads, auditoria, checklist de etapas,
  estoque, token de API, webhooks de eventos, funil de consultas, precificação e preços finais).

## Catálogo do produto (editável no painel 🏨 → Planos)

- **Módulos (18):** imoveis · reservas · canais · checkin · limpeza · manutencao ·
  financeiro · hospede · precificacao · contratos · relatorios · ia · estoque ·
  **crm · mensagens · reputacao · proprietarios · governanca** (ONDA LIVRO).
- **Limites:** imoveis · usuarios · reservas_mes · ia_consultas_mes · armazenamento_mb · workspaces.
- **Flags:** ia_direta · api_publica · white_label · canais_ilimitados · dominio_proprio.
  A flag `api_publica` agora vem LIGADA no plano Pro (além do Business/Enterprise) — decisão
  de produto 11/07/2026: o cliente-alvo do Pro é exatamente quem integra scripts/Claude Code.
  ⚠️ `semear()` sobrescreve módulos/flags dos planos a cada boot (só preço é preservado).
- **Planos (preços FINAIS 11/07/2026, autorizados pelo Augusto):** Trial 14d ·
  **Starter R$ 129** · **Pro R$ 299** (destaque; agora com API) · **Business R$ 699** ·
  **Enterprise** (sob consulta, ilimitado). Aplicados por MIGRAÇÃO `2026-07-11-precos-finais`
  (só troca quem estava no preço-semente antigo — edição manual no painel é preservada).
  Semear segue idempotente e **preserva preço já editado** no painel.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `index.js` | montagem (`montar(app, {...})`) + webhook MP + agendador do ciclo de vida |
| `db.js` / `schema.sql` | SQLite (node:sqlite) + DDL |
| `repo.js` | entitlements + Planos/Tenants/Uso/Custo/Tickets/Flags/Leads/Auditoria/Dashboard |
| `billing.js` | MP preapproval, webhook, upgrade/downgrade, faturas, dunning |
| `rotas-staff.js` | API admin `/staff/api/vsm/*` (requireAuth + requireAdmin, auditado) |
| `rotas-cliente.js` | API assinante `/gestao/api/*` (cookie `vsm_sess`, rate-limit) |
| `app-repo.js` | **app de gestão real**: imóveis/hóspedes/reservas (c/ checklist de etapas)/limpezas/manutenção/financeiro/estoque/painel (tudo por tenant_id) |
| `integracoes.js` | tokens de API (Bearer, hash SHA-256) + webhooks de eventos (HMAC) — flag `api_publica` |
| `stays.js` | cliente Stays.net **por tenant** (Basic Auth, paginação; fetch injetável p/ testes) |
| `app-stays-repo.js` | conta Stays do tenant + **sincronização** (import anúncios/reservas, upsert por id externo; fábrica injetável) |
| `rotas-app.js` | API do app `/gestao/api/app/*` (requireAssinante + requireAcesso + gateModulo) — inclui `/stays/*` |
| `app-cliente.js` | SPA do assinante servida em `/gestao/app.js` (JS clássico, sem build) |
| `paginas.js` | landing + assinar + painel do assinante + signup/lead (server-rendered) |
| `selftest.js` | suíte `npm run test:vsm` (control plane + app + idempotência de billing; chama `selftest-livro.js` ao final) |
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
- **Consultas — mini-funil pré-reserva** (11/07/2026, módulo `reservas`) — o interessado que
  ainda não fechou: `nova → respondida → pendencia → convertida | perdida` em `app_consultas`
  (nome, contato, canal, datas/valor cotado opcionais). `POST /consultas/:id/converter` cria a
  reserva (herda os dados; extras sobrepõem; nasce confirmada por padrão), grava `reserva_id`,
  marca as etapas consulta+pendência do checklist e dispara `consulta.convertida`; criar
  dispara `consulta.criada`. Status `convertida` só via conversão. Painel: `consultas_abertas`.
  UI: aba **📨 Consultas** (funil com botões + painel de conversão).
- **Precificação assistida** (11/07/2026, módulo `precificacao`) — parâmetros por imóvel em
  `app_precificacao` (faxina/lavanderia/insumos por estadia, custo variável/noite, comissão %,
  imposto % — DARF/DAS com o contador —, margem %). `GET/PUT /precificacao/:imovelId` e
  `GET /precificacao/:imovelId/simular?noites=N` devolvem o **preço mínimo com lucro**:
  `(fixos/noites + variável) / (1 − comissão − imposto − margem)`; compara com a tarifa base
  (`tarifa_base_cobre`). Percentuais 0–90 e soma < 95. UI: aba **💲 Preços** com simulador e
  botão "aplicar o mínimo como tarifa base".
- **Checklist de etapas por reserva** (11/07/2026) — cada reserva carrega 10 etapas da jornada
  (consulta → pendência → reserva → cadastro → faxina → condomínio → estoque → boas-vindas →
  check-in → despedida; catálogo `ETAPAS_RESERVA` em app-repo.js), JSON na coluna
  `app_reservas.checklist` (migração). Confirmar marca as 3 pré-reserva; concluir marca
  check-in; a baixa de estoque marca "estoque". `POST /reservas/:id/checklist {etapa, feito}`;
  listagem devolve `checklist_feitas/checklist_total`; painel conta `etapas_pendentes`
  (check-ins em 7d com checklist incompleto). É o diferencial "o sistema que não deixa
  esquecer etapa".
- **Estoque (módulo `estoque`)** (11/07/2026) — itens com categoria (limpeza/pessoal/outro),
  mínimo (abaixo = **em falta**, vira lista de compras) e `por_reserva` (consumo padrão).
  `POST /estoque/:id/mov` (± com histórico em `app_estoque_mov`) e
  `POST /estoque/baixa-reserva` (idempotente por reserva; marca a etapa "estoque").
  Painel conta `estoque_em_falta`; cruzar o mínimo dispara webhook `estoque.baixo`.
- **Limpezas** — geradas do check-out ou manuais; concluir.
- **Manutenção** — chamados com prioridade e fluxo aberto→em_andamento→resolvido.
- **Financeiro** — receitas/despesas + resumo do mês (receita/despesa/resultado).
- **Painel** — imóveis, reservas ativas, check-ins/outs 7d, limpezas/manutenção pendentes,
  etapas pendentes 7d, estoque em falta, financeiro do mês e próximas reservas.

## Integrações do assinante (flag `api_publica`) — 11/07/2026

Arquivo `integracoes.js`; UI na aba **🔌 API** da SPA. Tudo gateado pela flag `api_publica`
(Pro/Business/Enterprise ou override por tenant).

- **Token de API fixo** — `POST /gestao/api/tokens` (admin, só via sessão) gera
  `vsm_<48 chars>`; guardamos **só o hash SHA-256** e o token aparece UMA vez. Autentica
  qualquer rota do assinante com `Authorization: Bearer vsm_…` (o `requireAssinante` tenta o
  Bearer antes do cookie `vsm_sess`); um token NÃO cria/revoga credenciais (`soSessao`).
  Máx. 5 ativos por tenant; cada chamada registra a métrica `api_chamadas` e o `ultimo_uso`.
  `GET /gestao/api/tokens` lista (mascarado); `DELETE /gestao/api/tokens/:id` revoga.
- **Webhooks de eventos** — `POST /gestao/api/app/webhooks {url, eventos[]}` (máx. 3; devolve
  o `segredo` whsec_ UMA vez). Eventos: `consulta.criada` · `consulta.convertida` ·
  `reserva.criada` · `reserva.confirmada` · `reserva.cancelada` · `reserva.concluida` ·
  `estoque.baixo` (lista vazia = todos). Entrega
  fire-and-forget (timeout 6 s) com HMAC-SHA256 do corpo no header `X-VSM-Assinatura:
  sha256=…`; 20 falhas consecutivas desativam o endpoint sozinho (`falhas`/`ultimo_erro` na
  listagem). `POST …/webhooks/:id/testar` envia evento `teste`. Import da Stays NÃO dispara
  webhooks (upsert direto, não passa por `Reservas.criar`).

SPA: `app-cliente.js` servida em `/gestao/app.js`, montada por `bootGestao()` no shell
(`paginas.js` → `/gestao/app`). Mostra só as abas dos módulos do plano; conta bloqueada
(suspensa) cai no Plano/Suporte.

## Integração Stays.net (marco 3 — channel manager por tenant)

Decisão comercial: as plataformas de hospedagem só liberam API a **channel managers
credenciados**, então o produto se integra **só à Stays.net** (que já fala com Airbnb, Booking,
Decolar, Vrbo, Expedia, Google Rentals e diretas). **Quem contrata o Villela Stay Manager
precisa também ter conta na Stays.net** e conectá-la aqui.

- **Credenciais por tenant** em `app_stays_conta` (base_url + client_id + secret do PRÓPRIO
  cliente). Guardadas no disco do produto; **nunca devolvidas cruas** (a API só mostra versão
  mascarada). Validadas (`testar()` = 1 página de anúncios) antes de gravar.
- **Cliente** `stays.js`: Basic Auth, paginação 20/pág (espelha `server.js`); `fetch` injetável.
- **Sincronização** `app-stays-repo.sincronizar(tenantId)`: importa `/content/listings` →
  `app_imoveis` e `/booking/reservations` (chegadas, janela −30d/+365d) → `app_reservas`,
  **upsert por id externo** (`stays_id`) — idempotente, não duplica; marca `origem='stays'`.
  Import ignora anti-overbooking/limite (é dado real que já existe). Nomes de hóspede via
  `/booking/clients/{id}` (best-effort). Canal normalizado do `partner.name`.
- **Rotas** (módulo `canais`): `GET /gestao/api/app/stays` (status mascarado), `POST .../conectar`,
  `POST .../sincronizar`, `POST .../desconectar`. UI = aba **🔗 Canais** na SPA.
- **Colunas** `stays_id`/`origem` em `app_imoveis`/`app_reservas` adicionadas por MIGRAÇÃO
  (db.js) — as tabelas já existiam em produção.

Futuro (quando houver demanda): sincronização incremental por webhook da Stays, push de
disponibilidade/bloqueios de volta, e mapa de `_idlisting` para múltiplos workspaces.

## ONDA LIVRO — paridade com o livro (31/07/2026)

O livro **"Claude AI na Prática para Hospedagens"** (Augusto Villela, 50 capítulos + 8
apêndices) virou a régua do produto: cada capítulo que descreve um sistema tem agora a tela
correspondente, e cada tela cita o capítulo que a justifica. O padrão é o mesmo da ONDA LIVRO
do Villela Legal: **arquivos novos que estendem, sem reescrever o núcleo**.

### Arquivos

| Arquivo | Papel |
|---|---|
| `schema-livro.sql` | 30 tabelas `lv_*`, todas por `tenant_id`. Carregado por `livro/base.js` no mesmo handle do `db.js`. **Nenhuma tabela do `schema.sql` é alterada.** |
| `seed-livro.js` | catálogos do livro: 11 checklists (Apêndice E), 9 crises (Cap. 39), 50+ gatilhos de escalonamento (Cap. 33), 11 modelos × 4 idiomas (Apêndice D), 22 prompts dos capítulos, dicionário de métricas (Apêndice F), matriz de permissões e as 7 decisões humanas (Cap. 8), roteiro de adoção do Cap. 49 |
| `livro/base.js` | governança (permissões, auditoria de dados, POPs, crises, prompts), config financeira e `semearTenant()` (idempotente via `lv_seed`) |
| `livro/operacao.js` | ficha mestre, interligações, bloqueios, auditoria de sincronização, rotinas/heartbeat |
| `livro/campo.js` | escala do dia, evidência/liberação, inspeção, preventiva, fornecedores, suprimentos, **painel do dia** |
| `livro/comercial.js` | CRM (contatos/oportunidades/pauta), datas especiais + revisão semanal, política de documentação, conferência e risco |
| `livro/hospede.js` | régua de mensagens, manual digital, triagem do concierge, reputação |
| `livro/financeiro.js` | métricas (Apêndice F), DRE por unidade, proprietários e prestação de contas |
| `repo-livro.js` | índice; instala a guarda de interligação na montagem |
| `rotas-livro.js` | API `/gestao/api/app/livro/*` + as 2 páginas públicas |
| `app-cliente-livro.js` | 18 abas novas na SPA (servida em `/gestao/app-livro.js`) |
| `selftest-livro.js` | 34 testes da onda (rodam dentro de `npm run test:vsm`) |
| `../staff/app-vsm-livro.js` | aba **📘 Livro & sistema** no Portal Staff: mapa capítulo↔tela, cobertura por plano, o que o sistema NÃO faz |

### O que a onda entrega (e o capítulo que manda)

- **Cadastro mestre** (Cap. 6) — capacidade confortável × máxima (validação de coerência), o que a
  casa NÃO tem, tempo REAL de preparação, janela mínima, tarifa mínima. Régua, escala e manual
  saem daqui; ficha incompleta vira **FALTA DADO**, não mensagem inventada.
- **Interligações** (Caps. 13/20) — `lv_interligacoes` + fecho transitivo (`Interligacoes.espacos`).
  A trava roda de verdade: `instalarGuardaInterligacao()` **envolve** `app-repo.Reservas.criar`
  (não o reescreve) e rejeita venda do mesmo espaço nos dois sentidos e sobre bloqueio.
- **Auditoria de sincronização** (Cap. 20) — compara sistema × Stays, confere as duas direções,
  acha reserva não propagada, data segurada vencida e valor divergente. **Falha alto**: fonte
  ilegível ⇒ `parcial: true` e veredito "PARCIAL", nunca "tudo certo".
- **Painel do dia** (Cap. 39) — as cinco perguntas + heartbeat. Rotina que nunca rodou é
  `nao_iniciada` (informativo); a que **parou** de reportar é `sem_sinal` (crítico).
  `POST …/rotinas/:nome/heartbeat` — erro reportado nunca vira `ok`.
- **Escala** (Cap. 35) — faxina/preparação/**VIRADA** com janela × preparo real (RISCO),
  SEM RESPONSÁVEL sinalizado, confirmação com evidência e **liberação** formal (exige as duas).
- **Inspeção** (Cap. 38) — sorteio, recusa autoinspeção, e item que falha em unidades diferentes
  vira **SISTÊMICO** (problema do POP). Nunca ranqueia pessoas.
- **Preventiva** (Cap. 37) — janelas SEM HÓSPEDE (considerando interligados), SEM JANELA,
  reincidência com custo. Não bloqueia calendário nem aciona técnico.
- **Suprimentos** (Cap. 36) — previsão pelo calendário, **consumo atípico sinalizado e nunca
  corrigido**, enxoval por lote com vida útil e destino obrigatório na aposentadoria.
- **CRM** (Cap. 23) — 3 públicos, funil de 5 estágios, **próxima ação com data obrigatória**,
  motivo de perda em categoria fechada, pauta semanal com o cruzamento cancelamento × quem
  consultou. Converter passa pelas travas de reserva.
- **Revenue** (Cap. 21) — datas especiais (recusa tarifa abaixo do piso da unidade), revisão
  semanal com o **silêncio como saída válida**. `marcarAplicada` só REGISTRA que uma pessoa
  publicou — o sistema não publica preço.
- **Documentação e risco** (Caps. 25/30) — política por faixa de valor, conferência que marca
  **NÃO REGISTRADO**, evento disfarçado de estadia escalonado, sinais de risco só em conjunto e
  sem rotular ninguém.
- **Régua** (Caps. 31/34 + Apêndice D) — prepara e **nunca envia**; sabe o estado da reserva;
  estadia com problema vira **CONTATO PESSOAL**; idempotente por (reserva, modelo).
- **Manual** (Cap. 31) — página pública `/gestao/manual/:token`, sem login.
- **Concierge** (Cap. 33) — escalonamento verificado ANTES da resposta; responde só das fontes
  autorizadas, com a fonte declarada; avisa quando não há plantão.
- **Reputação** (Cap. 29) — impacto = menções × queda de nota; ciclo com **AMOSTRA INSUFICIENTE**.
- **Números** (Cap. 22/40 + Apêndice F) — os seis do painel por **espaço físico** (interligados
  contam uma vez), contra o mesmo mês do ano anterior, com as convenções no cabeçalho; DRE por
  unidade com provisões, rateio estável, caução separada e "a conferir".
- **Proprietários** (Cap. 12) — contrato, relatório em 4 blocos e portal público
  `/gestao/proprietario/:token`. **Compartimentação por arquitetura**: a consulta parte do
  proprietário e só alcança as unidades dele.
- **Governança** (Cap. 8) — matriz de permissões (o sistema **recusa** agente com escrita em
  financeiro/proprietário/contratos), as 7 decisões humanas, a lista do que a máquina PODE fazer
  sozinha, e trilha `lv_auditoria_dados` com antes/depois/quem/quando.

### Módulos novos no catálogo

`crm` · `mensagens` · `reputacao` · `proprietarios` · `governanca` — distribuídos pela ordem do
Cap. 49: **Nível 1** (painel do dia, auditoria, escala, régua) já no **Starter**; **Nível 2**
(CRM, indicadores, DRE, reputação, governança) no **Pro**; **Nível 3** (portal do proprietário)
no **Business**. ⚠️ `semear()` re-semeia módulos a cada boot — alterar a distribuição é editar
`PLANOS_SEED` em `repo.js`.

### Detalhes que economizam tempo

- O ponto de extensão da SPA é `window.VSM` (fim do `app-cliente.js`): a extensão empurra abas em
  `VSM.TABS` e o grupo "Hóspede" em `VSM.ORDEM_GRUPOS`. `render()` reconstrói `MAPA_VIEWS` a
  partir de `TABS`, então o núcleo não sabe que a extensão existe.
- No Portal Staff o mesmo padrão: `app-vsm-livro.js` envolve `VSM.abas()` e `VSM.pintar()`.
- Detector de dado de acesso (`pareceAcesso` em `livro/hospede.js`): casa quando senha/código/PIN
  aparece na mesma linha que `:`/`=` seguido de valor concreto — e deixa passar marcador entre
  colchetes e "a senha é enviada pelo anfitrião".
- `metricas()`/`dre()` tratam `ano=0`/`mes=0` como ausentes (a rota manda 0 quando não há query).

## Pendências

1. **Comercial (Augusto):** marca definitiva (hoje "Villela Stay Manager" em `/gestao`),
   preços finais (editáveis no painel) e 1º cliente piloto. NÃO ativar 1º cliente pago antes
   de definir o comercial (mesma regra dos outros SaaS).
2. **Validação com conta Stays real** de um cliente (o import foi testado com cliente mockado;
   um piloto com conta Stays de verdade fecha o ciclo).
