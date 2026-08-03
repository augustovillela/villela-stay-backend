-- =====================================================================
-- Villela Legal Intelligence — schema do banco (SQLite via node:sqlite)
-- FASE 1 (fundação): identidade/permissões, clientes, processos,
-- andamentos, publicações, prazos, tarefas, documentos, IA (registro),
-- financeiro jurídico, notificações, auditoria e integrações.
--
-- Convenções:
--  * Tudo é CREATE ... IF NOT EXISTS (idempotente; roda a cada boot).
--  * IDs: TEXT curto url-safe (novoId() do db.js). Datas: TEXT ISO-8601.
--  * Valores monetários em CENTAVOS (INTEGER) — mesmo padrão da Livraria.
--  * Campos "JSON" são TEXT com JSON serializado (helpers j.parse/j.str).
--  * Enums são validados na camada repo/rotas (SQLite não tem ENUM).
--  * Decisão: SQLite no disco persistente do Render (não PostgreSQL) —
--    ver README.md §Decisões. A troca futura fica isolada em db.js/repo.js.
-- =====================================================================

-- ---- controle de migrações (expansões das Fases 2+ entram como arquivos numerados)
CREATE TABLE IF NOT EXISTS migrations (
  id      INTEGER PRIMARY KEY,
  nome    TEXT NOT NULL UNIQUE,
  aplicada_em TEXT NOT NULL
);

-- =====================================================================
-- IDENTIDADE E PERMISSÕES
-- Autenticação = Portal Staff (JWT em cookie, usuarios.json). Aqui mora o
-- PERFIL JURÍDICO de cada usuário do portal + a matriz papel→permissões
-- (seed feito pelo permissoes.js a cada boot, com upsert).
-- =====================================================================
CREATE TABLE IF NOT EXISTS roles (
  id        TEXT PRIMARY KEY,          -- ex.: super_admin, socio_admin, adv_senior...
  nome      TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  nivel     INTEGER NOT NULL DEFAULT 0 -- ordenação/hierarquia p/ telas
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id   TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permissao TEXT NOT NULL,             -- ex.: ver_processos, aprovar_documentos...
  PRIMARY KEY (role_id, permissao)
);

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,        -- MESMO id do usuário do Portal Staff (usuarios.json)
  nome        TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  role_id     TEXT NOT NULL REFERENCES roles(id),
  oab         TEXT DEFAULT '',         -- nº OAB (advogados)
  nucleos     TEXT DEFAULT '[]',       -- JSON: ['civel','contratual',...]
  cliente_id  TEXT DEFAULT '',         -- preenchido quando perfil = cliente (Portal do Cliente, Fase 5)
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- =====================================================================
-- MÓDULO 1 — CRM JURÍDICO E CLIENTES
-- =====================================================================
CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  tipo_pessoa   TEXT NOT NULL DEFAULT 'PF',   -- PF | PJ
  nome          TEXT NOT NULL,
  cpf_cnpj      TEXT DEFAULT '',              -- dado pessoal: NUNCA sai em relatório publicado
  rg            TEXT DEFAULT '',
  estado_civil  TEXT DEFAULT '',
  profissao     TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  whatsapp      TEXT DEFAULT '',
  endereco      TEXT DEFAULT '',
  tipo_cliente  TEXT NOT NULL DEFAULT 'potencial', -- potencial|ativo|inativo|ex_cliente|estrategico
  origem        TEXT DEFAULT '',
  preferencias_comunicacao TEXT DEFAULT '{}', -- JSON: {canal, horario, idioma...}
  obs           TEXT DEFAULT '',
  criado_por    TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_nome ON clients(nome);
CREATE INDEX IF NOT EXISTS idx_clients_tipo ON clients(tipo_cliente);

CREATE TABLE IF NOT EXISTS client_contacts (
  id        TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  papel     TEXT DEFAULT '',   -- ex.: sócio, contador, preposto
  email     TEXT DEFAULT '',
  telefone  TEXT DEFAULT '',
  obs       TEXT DEFAULT '',
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_consents (
  id        TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  finalidade TEXT NOT NULL,    -- ex.: comunicacao-processual, marketing, portal-cliente
  base_legal TEXT DEFAULT '',  -- LGPD art. 7º (consentimento, contrato, legítimo interesse...)
  concedido INTEGER NOT NULL DEFAULT 1,
  evidencia TEXT DEFAULT '',   -- como foi colhido (mensagem, contrato, formulário)
  quando    TEXT NOT NULL,
  revogado_em TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS client_notes (
  id        TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  autor     TEXT DEFAULT '',
  texto     TEXT NOT NULL,
  interna   INTEGER NOT NULL DEFAULT 1, -- 1 = nunca visível ao cliente
  criado_em TEXT NOT NULL
);

-- =====================================================================
-- MÓDULO 2 — GESTÃO DE PROCESSOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS cases (
  id             TEXT PRIMARY KEY,
  numero_cnj     TEXT NOT NULL DEFAULT '',  -- 0000000-00.0000.0.00.0000 (único quando informado)
  tribunal       TEXT DEFAULT '',           -- ex.: TJDFT, STJ
  instancia      TEXT DEFAULT '',
  classe         TEXT DEFAULT '',
  assunto        TEXT DEFAULT '',
  orgao_julgador TEXT DEFAULT '',
  relator        TEXT DEFAULT '',
  valor_causa    INTEGER DEFAULT 0,         -- centavos
  status         TEXT NOT NULL DEFAULT 'ativo', -- ativo|suspenso|arquivado|encerrado|consultivo
  fase           TEXT DEFAULT '',           -- conhecimento|recursal|execucao|cumprimento...
  risco          TEXT DEFAULT '',           -- provavel|possivel|remoto (classificação CPC/CVM usual)
  prognostico    TEXT DEFAULT '',
  nucleo         TEXT DEFAULT '',           -- civel|penal|trabalhista|empresarial|contratual|contencioso|consultivo|audiencias
  advogado_resp  TEXT DEFAULT '',           -- users.id
  client_id      TEXT REFERENCES clients(id),          -- NULL = sem vínculo
  polo_cliente   TEXT DEFAULT '',           -- ativo|passivo|terceiro
  estrategia     TEXT DEFAULT '',           -- SIGILOSO: nunca visível ao cliente
  proximas_acoes TEXT DEFAULT '',
  sigiloso       INTEGER NOT NULL DEFAULT 0,-- segredo de justiça / acesso restrito
  criado_por     TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_cnj ON cases(numero_cnj) WHERE numero_cnj != '';
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);

CREATE TABLE IF NOT EXISTS case_parties (
  id      TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  polo    TEXT NOT NULL DEFAULT '',  -- ativo|passivo|terceiro
  nome    TEXT NOT NULL,
  doc     TEXT DEFAULT '',           -- CPF/CNPJ (dado pessoal — local)
  tipo    TEXT DEFAULT ''            -- autor|reu|litisconsorte|assistente...
);

CREATE TABLE IF NOT EXISTS case_lawyers (
  id      TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  nome    TEXT NOT NULL,
  oab     TEXT DEFAULT '',
  lado    TEXT DEFAULT '',           -- nosso|contrario
  user_id TEXT DEFAULT ''            -- vínculo quando é da equipe
);

-- ---- andamentos: fonte + payload bruto preservados (auditoria da coleta)
CREATE TABLE IF NOT EXISTS case_movements (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  data         TEXT NOT NULL,       -- data do andamento no tribunal
  descricao    TEXT NOT NULL,
  classificacao TEXT DEFAULT '',    -- informativo|prazo|decisao|despacho|sentenca|acordao|audiencia|intimacao|recurso|cumprimento|execucao|baixa|arquivamento
  resumo       TEXT DEFAULT '',     -- resumo gerado (IA nas Fases 3+; manual antes)
  fonte        TEXT DEFAULT '',     -- datajud|djen|manual|agente
  payload_raw  TEXT DEFAULT '',     -- JSON bruto da coleta (quando permitido)
  hash_dedupe  TEXT DEFAULT '',     -- sha256(case+data+descricao) — evita duplicar na coleta diária
  coletado_em  TEXT NOT NULL,
  criado_por   TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_movements_dedupe ON case_movements(hash_dedupe) WHERE hash_dedupe != '';
CREATE INDEX IF NOT EXISTS idx_movements_case ON case_movements(case_id, data);

-- ---- publicações (DJEN e diários) — status do fluxo de triagem
CREATE TABLE IF NOT EXISTS case_publications (
  id           TEXT PRIMARY KEY,
  case_id      TEXT REFERENCES cases(id),          -- NULL = ainda não vinculada
  fonte        TEXT DEFAULT '',   -- djen|diario-oficial|recorte|manual
  data_publicacao TEXT DEFAULT '',
  orgao        TEXT DEFAULT '',
  texto        TEXT NOT NULL DEFAULT '',
  match_por    TEXT DEFAULT '',   -- oab|nome-advogado|nome-parte|numero-processo
  tem_prazo    INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'nova', -- nova|lida|analisada|prazo_criado|cumprida|descartada|erro
  resumo       TEXT DEFAULT '',
  payload_raw  TEXT DEFAULT '',
  hash_dedupe  TEXT DEFAULT '',
  coletado_em  TEXT NOT NULL,
  criado_por   TEXT DEFAULT '',
  movement_id  TEXT DEFAULT ''    -- andamento gerado a partir desta publicação (case_movements.id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_publications_dedupe ON case_publications(hash_dedupe) WHERE hash_dedupe != '';
CREATE INDEX IF NOT EXISTS idx_publications_status ON case_publications(status);
CREATE INDEX IF NOT EXISTS idx_publications_data ON case_publications(data_publicacao);

-- =====================================================================
-- MÓDULO 5 — PRAZOS (cálculo sugerido SEMPRE exige validação humana)
-- =====================================================================
CREATE TABLE IF NOT EXISTS deadlines (
  id            TEXT PRIMARY KEY,
  case_id       TEXT REFERENCES cases(id),
  publication_id TEXT DEFAULT '',
  movement_id   TEXT DEFAULT '',
  titulo        TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'interno', -- interno|fatal
  data_interna  TEXT DEFAULT '',   -- prazo de segurança da equipe
  data_fatal    TEXT DEFAULT '',   -- prazo legal
  responsavel   TEXT DEFAULT '',   -- users.id
  revisor       TEXT DEFAULT '',
  prioridade    TEXT NOT NULL DEFAULT 'media',   -- alta|media|baixa
  status        TEXT NOT NULL DEFAULT 'identificado',
  -- identificado|em_analise|distribuido|em_elaboracao|em_revisao|aprovado|protocolado|cumprido|perdido|cancelado
  calculo_sugerido TEXT DEFAULT '', -- memória do cálculo (dias, termo inicial, feriados considerados)
  validado_por  TEXT DEFAULT '',    -- OBRIGATÓRIO preencher (humano) antes de status >= em_elaboracao
  obs           TEXT DEFAULT '',
  criado_por    TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deadlines_fatal ON deadlines(data_fatal);
CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(status);

CREATE TABLE IF NOT EXISTS deadline_events (
  id          TEXT PRIMARY KEY,
  deadline_id TEXT NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  quando      TEXT NOT NULL,
  quem        TEXT DEFAULT '',
  evento      TEXT NOT NULL     -- ex.: "status: identificado → em_analise", "responsável alterado"
);

-- =====================================================================
-- MÓDULO 19 — TAREFAS
-- =====================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  case_id      TEXT REFERENCES cases(id),
  client_id    TEXT REFERENCES clients(id),
  deadline_id  TEXT DEFAULT '',
  titulo       TEXT NOT NULL,
  descricao    TEXT DEFAULT '',
  nucleo       TEXT DEFAULT '',
  responsavel  TEXT DEFAULT '',
  prazo        TEXT DEFAULT '',
  prioridade   TEXT NOT NULL DEFAULT 'media',  -- alta|media|baixa
  status       TEXT NOT NULL DEFAULT 'aberta', -- aberta|em_andamento|em_revisao|concluida|cancelada
  checklist    TEXT DEFAULT '[]',              -- JSON: [{item, feito}]
  criado_por   TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_resp ON tasks(responsavel);

CREATE TABLE IF NOT EXISTS task_comments (
  id       TEXT PRIMARY KEY,
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  autor    TEXT DEFAULT '',
  texto    TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

-- =====================================================================
-- MÓDULO 6 — DOCUMENTOS (arquivos no disco em DATA_DIR/legal/docs/)
-- =====================================================================
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  client_id    TEXT REFERENCES clients(id),
  case_id      TEXT REFERENCES cases(id),
  task_id      TEXT DEFAULT '',
  titulo       TEXT NOT NULL,
  tipo         TEXT DEFAULT '',        -- procuracao|contrato|peca|prova|documento-pessoal|comprovante|outro
  pasta        TEXT DEFAULT '',        -- organização livre
  sigilo       TEXT NOT NULL DEFAULT 'interno', -- interno|restrito|cliente (o que o cliente PODE ver)
  status       TEXT NOT NULL DEFAULT 'rascunho',
  -- rascunho|revisao_pendente|aprovado|protocolado|enviado_cliente|arquivado
  versao_atual INTEGER NOT NULL DEFAULT 1,
  criado_por   TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);

CREATE TABLE IF NOT EXISTS document_versions (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  versao      INTEGER NOT NULL,
  arquivo     TEXT NOT NULL,      -- caminho relativo dentro de DATA_DIR/legal/docs/
  nome_original TEXT DEFAULT '',
  mime        TEXT DEFAULT '',
  tamanho     INTEGER DEFAULT 0,
  sha256      TEXT DEFAULT '',    -- integridade + dedupe
  motivo      TEXT DEFAULT '',    -- o que mudou nesta versão
  criado_por  TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);

-- quem viu/baixou/exportou cada documento (exigência de auditoria)
CREATE TABLE IF NOT EXISTS document_access_logs (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  user_id     TEXT DEFAULT '',
  quem        TEXT DEFAULT '',
  acao        TEXT NOT NULL,     -- visualizou|baixou|exportou|enviou_cliente
  ip          TEXT DEFAULT '',
  quando      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docaccess_doc ON document_access_logs(document_id);

-- =====================================================================
-- MÓDULO 7 — IA JURÍDICA (Fase 1: só o REGISTRO; RAG/geração = Fase 3)
-- Toda chamada relevante de IA fica logada com fontes e nível de confiança.
-- =====================================================================
CREATE TABLE IF NOT EXISTS ai_queries (
  id         TEXT PRIMARY KEY,
  user_id    TEXT DEFAULT '',
  case_id    TEXT DEFAULT '',
  client_id  TEXT DEFAULT '',
  agente     TEXT DEFAULT '',    -- qual agente/prompt (Fase 3: ai_agents)
  pergunta   TEXT NOT NULL,
  contexto   TEXT DEFAULT '',    -- JSON: docs/normas usados como base
  modelo     TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_responses (
  id         TEXT PRIMARY KEY,
  query_id   TEXT NOT NULL REFERENCES ai_queries(id) ON DELETE CASCADE,
  resposta   TEXT NOT NULL,
  riscos     TEXT DEFAULT '',
  lacunas    TEXT DEFAULT '',
  nivel_confianca TEXT DEFAULT '', -- alto|medio|baixo
  status     TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|revisado|aprovado|descartado
  revisado_por TEXT DEFAULT '',    -- advogado humano (obrigatório p/ "aprovado")
  feedback   TEXT DEFAULT '',      -- avaliação do advogado
  criado_em  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_sources (
  id          TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,    -- legislacao|jurisprudencia|documento|processo|doutrina
  citacao     TEXT NOT NULL,    -- ex.: "Lei 8.245/91, art. 48" / "STJ, REsp 1.192.678"
  url         TEXT DEFAULT '',
  tribunal    TEXT DEFAULT '',
  processo    TEXT DEFAULT '',
  orgao_julgador TEXT DEFAULT '',
  relator     TEXT DEFAULT '',
  data_julgado TEXT DEFAULT '',
  trecho      TEXT DEFAULT '',
  data_coleta TEXT NOT NULL
);

-- =====================================================================
-- MÓDULO 10 (fundação) — PEÇAS: minutas com versão e revisão humana
-- =====================================================================
CREATE TABLE IF NOT EXISTS legal_drafts (
  id          TEXT PRIMARY KEY,
  case_id     TEXT REFERENCES cases(id),
  client_id   TEXT REFERENCES clients(id),
  tipo_peca   TEXT NOT NULL,    -- peticao-inicial|contestacao|recurso|parecer|notificacao|contrato...
  objetivo    TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'rascunho',
  -- rascunho|revisao_pendente|aprovado|protocolado|enviado_cliente|arquivado
  gerado_por_ia INTEGER NOT NULL DEFAULT 0, -- 1 = carrega aviso obrigatório de revisão
  revisor     TEXT DEFAULT '',
  aprovado_por TEXT DEFAULT '',  -- advogado humano — obrigatório antes de "aprovado"
  criado_por  TEXT DEFAULT '',
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legal_draft_versions (
  id        TEXT PRIMARY KEY,
  draft_id  TEXT NOT NULL REFERENCES legal_drafts(id) ON DELETE CASCADE,
  versao    INTEGER NOT NULL,
  conteudo  TEXT NOT NULL,      -- texto integral da minuta
  fontes    TEXT DEFAULT '[]',  -- JSON de citações (mesma estrutura de ai_sources)
  pontos_atencao TEXT DEFAULT '',
  criado_por TEXT DEFAULT '',
  criado_em TEXT NOT NULL
);

-- =====================================================================
-- MÓDULO 12 (fundação) — ANÁLISE DE CONTRATOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS contract_reviews (
  id          TEXT PRIMARY KEY,
  document_id TEXT DEFAULT '',   -- contrato analisado (documents.id)
  client_id   TEXT REFERENCES clients(id),
  tipo_contrato TEXT DEFAULT '',
  partes      TEXT DEFAULT '',
  resumo      TEXT DEFAULT '',
  riscos      TEXT DEFAULT '',
  lacunas     TEXT DEFAULT '',
  sugestoes   TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|revisao_pendente|aprovado|arquivado
  revisado_por TEXT DEFAULT '',
  criado_por  TEXT DEFAULT '',
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- =====================================================================
-- MÓDULO 16 (fundação) — FINANCEIRO JURÍDICO / PRESTAÇÃO DE CONTAS
-- =====================================================================
CREATE TABLE IF NOT EXISTS financial_accounts (
  id          TEXT PRIMARY KEY,
  client_id   TEXT REFERENCES clients(id),
  case_id     TEXT REFERENCES cases(id),
  tipo        TEXT NOT NULL,    -- honorario_contratual|honorario_exito|custas|diligencia|despesa|reembolso|repasse|recebimento_judicial|alvara|acordo
  descricao   TEXT NOT NULL,
  valor       INTEGER NOT NULL DEFAULT 0, -- centavos; sinal: + a receber/recebido do cliente, - a repassar/despesa
  vencimento  TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'previsto', -- previsto|faturado|pago|repassado|cancelado
  comprovante_doc_id TEXT DEFAULT '',
  visivel_cliente INTEGER NOT NULL DEFAULT 1,   -- entra na prestação de contas do cliente
  criado_por  TEXT DEFAULT '',
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_client ON financial_accounts(client_id);

-- =====================================================================
-- MÓDULO 18 (fundação) — NOTIFICAÇÕES (envio real nas Fases 5+)
-- =====================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  destinatario_tipo TEXT NOT NULL DEFAULT 'user', -- user|cliente|nucleo
  destinatario TEXT NOT NULL,
  canal       TEXT NOT NULL DEFAULT 'interna',    -- interna|email|whatsapp
  titulo      TEXT NOT NULL,
  corpo       TEXT DEFAULT '',
  ref_tipo    TEXT DEFAULT '',   -- deadline|publication|task|case|document|financeiro
  ref_id      TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pendente',   -- pendente|enviada|lida|erro
  criado_em   TEXT NOT NULL,
  enviado_em  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_notif_dest ON notifications(destinatario_tipo, destinatario, status);

-- =====================================================================
-- AUDITORIA E INTEGRAÇÕES
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id        TEXT PRIMARY KEY,
  quando    TEXT NOT NULL,
  user_id   TEXT DEFAULT '',
  quem      TEXT DEFAULT '',    -- nome/e-mail ou 'agente/chave'
  acao      TEXT NOT NULL,      -- ex.: cliente.criar, processo.editar, documento.baixar
  entidade  TEXT DEFAULT '',    -- tabela/tipo
  entidade_id TEXT DEFAULT '',
  detalhe   TEXT DEFAULT '',
  ip        TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_quando ON audit_logs(quando);
CREATE INDEX IF NOT EXISTS idx_audit_entidade ON audit_logs(entidade, entidade_id);

CREATE TABLE IF NOT EXISTS integration_logs (
  id        TEXT PRIMARY KEY,
  fonte     TEXT NOT NULL,      -- datajud|djen|lexml|email|whatsapp|outro
  operacao  TEXT NOT NULL,      -- ex.: coleta-andamentos, busca-publicacoes
  status    TEXT NOT NULL DEFAULT 'ok', -- ok|erro
  detalhe   TEXT DEFAULT '',
  itens     INTEGER DEFAULT 0,  -- quantos registros a operação trouxe/afetou
  quando    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intlog_quando ON integration_logs(quando);

CREATE TABLE IF NOT EXISTS webhook_events (
  id        TEXT PRIMARY KEY,
  origem    TEXT NOT NULL,
  evento    TEXT DEFAULT '',
  payload   TEXT DEFAULT '',    -- JSON bruto
  status    TEXT NOT NULL DEFAULT 'recebido', -- recebido|processado|erro
  detalhe   TEXT DEFAULT '',
  quando    TEXT NOT NULL
);

-- =====================================================================
-- FASE 2 — MÓDULO 15: AUDIÊNCIAS
-- Roteiro/estratégia são internos (nunca visíveis ao cliente); a ata é um
-- documento vinculado (documents.id). Providências viram tarefas.
-- =====================================================================
CREATE TABLE IF NOT EXISTS hearings (
  id           TEXT PRIMARY KEY,
  case_id      TEXT REFERENCES cases(id),
  tipo         TEXT NOT NULL DEFAULT 'conciliacao', -- conciliacao|instrucao|julgamento|una|justificacao|custodia|outra
  data_hora    TEXT NOT NULL,      -- ISO local: 2026-08-01T14:00
  modalidade   TEXT NOT NULL DEFAULT 'presencial', -- presencial|virtual|hibrida
  local_link   TEXT DEFAULT '',    -- endereço da vara OU link da sala virtual
  juizo        TEXT DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'agendada',   -- agendada|realizada|adiada|cancelada
  docs_necessarios TEXT DEFAULT '',
  roteiro      TEXT DEFAULT '',    -- INTERNO: perguntas, ordem, pontos a provar
  estrategia   TEXT DEFAULT '',    -- SIGILOSO: nunca visível ao cliente
  resultado    TEXT DEFAULT '',
  ata_doc_id   TEXT DEFAULT '',    -- documents.id da ata, quando arquivada
  obs          TEXT DEFAULT '',
  criado_por   TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hearings_data ON hearings(data_hora);
CREATE INDEX IF NOT EXISTS idx_hearings_case ON hearings(case_id);

CREATE TABLE IF NOT EXISTS hearing_participants (
  id         TEXT PRIMARY KEY,
  hearing_id TEXT NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL DEFAULT 'testemunha', -- parte|testemunha|advogado|preposto|perito|outro
  nome       TEXT NOT NULL,
  contato    TEXT DEFAULT '',   -- dado pessoal — só local
  intimado   INTEGER NOT NULL DEFAULT 0,
  obs        TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS hearing_followups (
  id         TEXT PRIMARY KEY,
  hearing_id TEXT NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
  descricao  TEXT NOT NULL,
  responsavel TEXT DEFAULT '',
  prazo      TEXT DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pendente', -- pendente|concluida|cancelada
  task_id    TEXT DEFAULT '',   -- tarefa gerada a partir da providência
  criado_em  TEXT NOT NULL
);

-- =====================================================================
-- FASE 2 — MÓDULO 5 (complemento): FERIADOS FORENSES E CÁLCULO DE PRAZO
-- O cálculo é SUGESTÃO: fica em deadlines.calculo_sugerido e o prazo só
-- avança com validado_por humano (trava da Fase 1). Cada cálculo é logado.
-- =====================================================================
CREATE TABLE IF NOT EXISTS court_holidays (
  data      TEXT NOT NULL,      -- YYYY-MM-DD
  ambito    TEXT NOT NULL DEFAULT 'nacional', -- nacional|TJDFT|STJ|... (feriado local por tribunal)
  descricao TEXT NOT NULL,
  tipo      TEXT NOT NULL DEFAULT 'feriado',  -- feriado|suspensao (ex.: art. 220 CPC, 20/12–20/01)
  PRIMARY KEY (data, ambito)
);

CREATE TABLE IF NOT EXISTS deadline_calculation_logs (
  id            TEXT PRIMARY KEY,
  deadline_id   TEXT DEFAULT '',   -- preenchido quando o cálculo virou prazo
  termo_inicial TEXT NOT NULL,
  dias          INTEGER NOT NULL,
  modo          TEXT NOT NULL,     -- uteis|corridos
  ambito        TEXT DEFAULT 'nacional',
  resultado     TEXT NOT NULL,     -- data sugerida
  memoria       TEXT DEFAULT '',   -- explicação do cálculo (dias pulados etc.)
  quem          TEXT DEFAULT '',
  quando        TEXT NOT NULL
);

-- =====================================================================
-- FASE 2 — MÓDULO 19 (complemento): HISTÓRICO DE STATUS DA TAREFA (Kanban)
-- =====================================================================
CREATE TABLE IF NOT EXISTS task_status_history (
  id       TEXT PRIMARY KEY,
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  de       TEXT NOT NULL,
  para     TEXT NOT NULL,
  quem     TEXT DEFAULT '',
  quando   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_taskhist_task ON task_status_history(task_id);

-- =====================================================================
-- FASE 3 — MÓDULOS 7/11 (IA JURÍDICA): RAG, agentes, prompts, conhecimento
-- O índice de busca (FTS5, tabela virtual rag_index) é criado pelo ia.js —
-- fora deste arquivo de propósito, para degradar com aviso se FTS5 faltar.
-- =====================================================================

-- Biblioteca de prompts versionados (§6 do plano) — seed no boot (upsert)
CREATE TABLE IF NOT EXISTS prompt_templates (
  id        TEXT PRIMARY KEY,   -- ex.: resumo-andamento, parecer-juridico
  nome      TEXT NOT NULL,
  versao    INTEGER NOT NULL DEFAULT 1,
  conteudo  TEXT NOT NULL,      -- o prompt em si (estrutura §6)
  formato   TEXT NOT NULL DEFAULT 'json', -- json|texto
  atualizado_em TEXT NOT NULL
);

-- Agentes especialistas (Módulo 11) — prompt próprio, escopo e limites
CREATE TABLE IF NOT EXISTS ai_agents (
  id           TEXT PRIMARY KEY, -- ex.: civel, penal, contratual...
  nome         TEXT NOT NULL,
  especialidade TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  versao       INTEGER NOT NULL DEFAULT 1,
  ativo        INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL
);

-- Registro de cada execução de IA (custo/latência/modelo) — controle de custos
CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id          TEXT PRIMARY KEY,
  agente      TEXT DEFAULT '',
  query_id    TEXT DEFAULT '',
  modelo      TEXT DEFAULT '',
  input_tokens  INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  custo_centavos_usd INTEGER DEFAULT 0, -- estimado, em centavos de USD
  duracao_ms  INTEGER DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'ok', -- ok|erro|recusado
  detalhe     TEXT DEFAULT '',
  quando      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_airuns_quando ON ai_agent_runs(quando);

-- Base de conhecimento curada (teses, precedentes favoritos, pareceres aprovados,
-- trechos de legislação) — entra no RAG com prioridade
CREATE TABLE IF NOT EXISTS legal_knowledge_base (
  id        TEXT PRIMARY KEY,
  tipo      TEXT NOT NULL DEFAULT 'tese', -- legislacao|jurisprudencia|tese|parecer|modelo|doutrina
  titulo    TEXT NOT NULL,
  citacao   TEXT DEFAULT '',   -- ex.: "STJ, REsp 1.192.678" / "Lei 8.245/91, art. 48"
  url       TEXT DEFAULT '',
  corpo     TEXT NOT NULL,     -- o conteúdo pesquisável
  tags      TEXT DEFAULT '',
  criado_por TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- Texto extraído de documentos (OCR/extração feita pelo agente local) — alimenta o RAG
CREATE TABLE IF NOT EXISTS document_text_extractions (
  document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  texto       TEXT NOT NULL,
  metodo      TEXT DEFAULT '',  -- ex.: pdftotext, ocr, manual
  extraido_em TEXT NOT NULL,
  por         TEXT DEFAULT ''
);

-- =====================================================================
-- FASE 4 — MÓDULOS 10/12/13: PEÇAS E CONTRATOS
-- Mapeamento vs. o plano: contrato ASSINADO/recebido = documents (tipo
-- 'contrato') + document_versions; análise = contract_reviews (+ coluna
-- analise_json via migração); minuta em elaboração = legal_drafts.
-- =====================================================================

-- Registro de exportações de peça (auditoria: quem exportou o quê)
CREATE TABLE IF NOT EXISTS legal_draft_exports (
  id        TEXT PRIMARY KEY,
  draft_id  TEXT NOT NULL REFERENCES legal_drafts(id) ON DELETE CASCADE,
  versao    INTEGER NOT NULL,
  formato   TEXT NOT NULL,     -- html|doc
  quem      TEXT DEFAULT '',
  quando    TEXT NOT NULL
);

-- Biblioteca de modelos de contrato (Módulo 13) — seed versionado no código
CREATE TABLE IF NOT EXISTS contract_templates (
  id        TEXT PRIMARY KEY,  -- ex.: prestacao-servicos, nda, honorarios
  nome      TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  campos    TEXT NOT NULL DEFAULT '[]', -- JSON: [{id, rotulo, tipo(text|date|money), obrigatorio}]
  versao    INTEGER NOT NULL DEFAULT 1,
  ativo     INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contract_template_clauses (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
  ordem       INTEGER NOT NULL DEFAULT 0,
  titulo      TEXT NOT NULL,
  texto       TEXT NOT NULL,    -- com placeholders {{campo}}
  obrigatoria INTEGER NOT NULL DEFAULT 1, -- 0 = opcional (checkbox no wizard)
  alternativa_de TEXT DEFAULT ''          -- id da cláusula da qual esta é variação
);

-- Sessão do wizard (Módulo 13): o que foi respondido e qual minuta saiu
CREATE TABLE IF NOT EXISTS contract_generation_sessions (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  respostas   TEXT NOT NULL DEFAULT '{}', -- JSON: {campo: valor}
  clausulas   TEXT NOT NULL DEFAULT '[]', -- JSON: ids das cláusulas escolhidas
  draft_id    TEXT DEFAULT '',            -- legal_drafts.id da minuta gerada
  criado_por  TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);

-- =====================================================================
-- FASE 5 — MÓDULO 17: PORTAL DO CLIENTE
-- Conta de acesso do cliente (login próprio, separado do Portal Staff).
-- Preferências de notificação moram em clients.preferencias_comunicacao
-- (JSON já existente) — decisão registrada no README.
-- =====================================================================
CREATE TABLE IF NOT EXISTS client_accounts (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  senha_hash  TEXT DEFAULT '',   -- vazio = acesso criado, senha ainda não definida
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL,
  ultimo_login TEXT DEFAULT ''
);

-- =====================================================================
-- FASE 6 — MÓDULO 20: RELATÓRIOS GERENCIAIS
-- Métricas são calculadas AO VIVO (relatorios.js) — sem dashboard_metrics
-- materializada (decisão no README). Aqui fica só o arquivo dos relatórios
-- exportados (auditoria: o que foi gerado, por quem, com que conteúdo).
-- =====================================================================
CREATE TABLE IF NOT EXISTS generated_reports (
  id         TEXT PRIMARY KEY,
  tipo       TEXT NOT NULL,     -- socio|nucleo|financeiro|prestacao-contas
  titulo     TEXT NOT NULL,
  parametros TEXT DEFAULT '{}', -- JSON (ex.: {nucleo}, {client_id})
  conteudo   TEXT NOT NULL,     -- HTML/CSV gerado (re-download fiel ao momento)
  formato    TEXT NOT NULL DEFAULT 'html', -- html|csv
  criado_por TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_tipo ON generated_reports(tipo, criado_em);
