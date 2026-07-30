-- =====================================================================
-- Villela Legal Intelligence — ONDA LIVRO
-- Tabelas que fecham a paridade com o livro "Claude AI na Prática
-- Jurídica" (Augusto Villela). Cada bloco cita o capítulo que o exige,
-- para que a conferência livro↔sistema seja mecânica.
--
-- Referência-mestra: Cap. 47 (os 12 protótipos) + Parte VIII (compliance,
-- LGPD, riscos) + Cap. 36-40 (gestão interna) + Cap. 13-17 (captação).
--
-- Mesmas convenções do schema.sql: CREATE ... IF NOT EXISTS, IDs TEXT
-- url-safe, datas ISO-8601, dinheiro em CENTAVOS, "JSON" = TEXT.
-- Enums validados em repo-livro.js.
-- =====================================================================

-- =====================================================================
-- 47.1 — CRM JURÍDICO (Cap. 15 captação/triagem · 16 funil · 17 conflitos)
-- =====================================================================

-- Lead/oportunidade. O funil do Cap. 16.1 vive em `estagio`.
-- Triagem do Cap. 15: área, urgência, risco de prescrição, competência,
-- capacidade de atendimento, classificação de oportunidade e antifraude.
CREATE TABLE IF NOT EXISTS crm_leads (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  email          TEXT DEFAULT '',
  telefone       TEXT DEFAULT '',
  documento      TEXT DEFAULT '',          -- CPF/CNPJ (sensível: mascarado sem ver_dados_sensiveis)
  origem         TEXT NOT NULL DEFAULT 'outro', -- 16.3: site|indicacao|conteudo|redes|evento|parceiro|cliente|outro
  area           TEXT DEFAULT '',          -- 15.2 área jurídica identificada
  resumo_fato    TEXT DEFAULT '',          -- 15.6 coleta inicial SEM antecipar parecer
  urgencia       TEXT NOT NULL DEFAULT 'normal',  -- 15.3: imediata|alta|normal|baixa
  risco_prescricao TEXT DEFAULT '',        -- 15.3 anotação do triador (nunca conclusão automática)
  competencia    TEXT DEFAULT '',          -- 15.4 territorial/material anotada
  pode_atender   TEXT NOT NULL DEFAULT 'a_avaliar', -- 15.5: sim|nao|a_avaliar
  motivo_recusa  TEXT DEFAULT '',
  score          INTEGER NOT NULL DEFAULT 0,       -- 15.7 classificação de oportunidade (0-100)
  spam_score     INTEGER NOT NULL DEFAULT 0,       -- 15.9 suspeita de spam/fraude (0-100)
  estagio        TEXT NOT NULL DEFAULT 'novo',     -- novo|triagem|qualificado|proposta|contratado|perdido|descartado
  responsavel_id TEXT DEFAULT '',          -- 15.8 advogado responsável
  client_id      TEXT DEFAULT '',          -- preenchido na conversão (16.2 lead→cliente)
  case_id        TEXT DEFAULT '',          -- 17.10 abertura formal do caso
  motivo_desfecho TEXT DEFAULT '',         -- 16.7 motivo de contratação ou de perda
  primeira_resposta_em TEXT DEFAULT '',    -- 16.10/40.7 tempo de resposta
  conflito_ok    INTEGER NOT NULL DEFAULT 0, -- 17.1 conflito pesquisado e liberado
  observacoes    TEXT DEFAULT '',
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL,
  fechado_em     TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_leads_estagio ON crm_leads(estagio, criado_em);
CREATE INDEX IF NOT EXISTS idx_leads_resp ON crm_leads(responsavel_id, estagio);

-- 16.4 histórico de comunicações (lead OU cliente)
CREATE TABLE IF NOT EXISTS crm_interactions (
  id        TEXT PRIMARY KEY,
  lead_id   TEXT DEFAULT '',
  client_id TEXT DEFAULT '',
  canal     TEXT NOT NULL DEFAULT 'outro', -- whatsapp|email|telefone|reuniao|portal|outro
  direcao   TEXT NOT NULL DEFAULT 'saida', -- entrada|saida
  resumo    TEXT NOT NULL,
  quem      TEXT DEFAULT '',
  quando    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crmint_lead ON crm_interactions(lead_id, quando);

-- 16.6 / 17.6 proposta de honorários. ENVIO EXIGE APROVAÇÃO HUMANA (47.1).
CREATE TABLE IF NOT EXISTS crm_proposals (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  escopo        TEXT NOT NULL DEFAULT '',       -- 17.5 escopo do que está e do que NÃO está incluído
  fora_escopo   TEXT DEFAULT '',
  modalidade    TEXT NOT NULL DEFAULT 'fixo',   -- 38.2: fixo|mensal|hora|exito|misto
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  percentual_exito REAL NOT NULL DEFAULT 0,
  parcelas      INTEGER NOT NULL DEFAULT 1,
  validade      TEXT DEFAULT '',
  texto         TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|aprovada|enviada|aceita|recusada|expirada
  aprovada_por  TEXT DEFAULT '',                  -- trava: sem isto não sai
  aprovada_em   TEXT DEFAULT '',
  enviada_em    TEXT DEFAULT '',
  respondida_em TEXT DEFAULT '',
  criado_por    TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prop_lead ON crm_proposals(lead_id, criado_em);

-- 17.1 pesquisa de conflito de interesses (registro do que foi pesquisado e decidido)
CREATE TABLE IF NOT EXISTS conflict_checks (
  id           TEXT PRIMARY KEY,
  termo        TEXT NOT NULL,             -- nome/documento pesquisado
  lead_id      TEXT DEFAULT '',
  client_id    TEXT DEFAULT '',
  resultados   TEXT NOT NULL DEFAULT '[]',-- JSON: [{tipo,id,nome,papel,detalhe}]
  veredito     TEXT NOT NULL DEFAULT 'atencao', -- livre|atencao|impedido
  justificativa TEXT DEFAULT '',
  decidido_por TEXT DEFAULT '',           -- veredito é decisão HUMANA
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conf_termo ON conflict_checks(termo, criado_em);

-- 17.4 KYC / validação documental do cliente
CREATE TABLE IF NOT EXISTS kyc_checks (
  id           TEXT PRIMARY KEY,
  client_id    TEXT DEFAULT '',
  lead_id      TEXT DEFAULT '',
  itens        TEXT NOT NULL DEFAULT '[]',-- JSON: [{item,situacao,observacao}]
  documento_ok INTEGER NOT NULL DEFAULT 0,
  procuracao_ok INTEGER NOT NULL DEFAULT 0, -- 17.3
  representacao TEXT DEFAULT '',             -- quem assina pela PJ e com que poderes
  pendencias   TEXT DEFAULT '',
  concluido_por TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- =====================================================================
-- 47.7 / 47.8 — PESQUISA JURÍDICA AUDITÁVEL (Cap. 32 jurisprudência ·
-- 33 legislação · 34 doutrina). Regra estrutural do 47.7: bloco
-- "localizado e conferido" SEPARADO de "hipótese a verificar".
-- =====================================================================
CREATE TABLE IF NOT EXISTS research_projects (
  id           TEXT PRIMARY KEY,
  titulo       TEXT NOT NULL,
  questao      TEXT NOT NULL DEFAULT '',   -- 32.1 questão jurídica delimitada
  area         TEXT DEFAULT '',
  case_id      TEXT DEFAULT '',
  client_id    TEXT DEFAULT '',
  tribunais    TEXT DEFAULT '',            -- 32.3 tribunais/órgãos-alvo
  periodo      TEXT DEFAULT '',
  plano_busca  TEXT DEFAULT '',            -- FASE 1: termos, teses, filtros (32.2)
  status       TEXT NOT NULL DEFAULT 'plano', -- plano|coleta|analise|concluida|arquivada
  conclusao    TEXT DEFAULT '',
  responsavel  TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- Um achado = um precedente, norma ou obra. `verificado` é o que separa os
-- dois blocos do relatório: só vale como fundamento se conferido no
-- INTEIRO TEOR oficial (Cap. 5.4 / 32.5 / 34.4).
CREATE TABLE IF NOT EXISTS research_findings (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL DEFAULT 'precedente', -- precedente|norma|doutrina|enunciado
  identificacao TEXT NOT NULL,             -- ex.: STJ, REsp 1.234.567/DF, 3ª T., DJe 01/01/2025
  orgao         TEXT DEFAULT '',
  data_julgamento TEXT DEFAULT '',
  hierarquia    TEXT NOT NULL DEFAULT 'persuasivo', -- 32.4: vinculante|persuasivo|superado|indefinido
  posicao       TEXT NOT NULL DEFAULT 'neutro',     -- 32.8: favoravel|desfavoravel|neutro
  ementa        TEXT DEFAULT '',
  ratio_decidendi TEXT DEFAULT '',          -- 32.6
  contexto_fatico TEXT DEFAULT '',
  distinguishing TEXT DEFAULT '',           -- 32.7
  fonte_url     TEXT DEFAULT '',            -- link oficial (não blog — Cap. 5.5)
  verificado    INTEGER NOT NULL DEFAULT 0, -- 1 = inteiro teor oficial conferido
  verificado_por TEXT DEFAULT '',
  verificado_em TEXT DEFAULT '',
  atualidade_em TEXT DEFAULT '',            -- 32.9 data da última conferência de vigência/superação
  observacao    TEXT DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_find_proj ON research_findings(project_id, verificado);

-- Base normativa interna (33.9) + vigência/histórico de redações (33.3/33.4/33.8)
CREATE TABLE IF NOT EXISTS norms (
  id            TEXT PRIMARY KEY,
  tipo          TEXT NOT NULL DEFAULT 'lei', -- constituicao|lei|lc|mp|decreto|resolucao|in|provimento|portaria|outro
  identificacao TEXT NOT NULL,               -- ex.: Lei 13.105/2015 (CPC)
  ambito        TEXT NOT NULL DEFAULT 'federal', -- federal|estadual|municipal|distrital
  area          TEXT DEFAULT '',
  ementa        TEXT DEFAULT '',
  artigos_chave TEXT DEFAULT '',
  vigente       INTEGER NOT NULL DEFAULT 1,
  vigencia_desde TEXT DEFAULT '',
  revogada_por  TEXT DEFAULT '',
  fonte_url     TEXT DEFAULT '',
  conferida_em  TEXT DEFAULT '',             -- 33.4 última conferência de vigência
  conferida_por TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_norms_area ON norms(area, vigente);

CREATE TABLE IF NOT EXISTS norm_versions (
  id        TEXT PRIMARY KEY,
  norm_id   TEXT NOT NULL REFERENCES norms(id) ON DELETE CASCADE,
  redacao   TEXT NOT NULL DEFAULT '',
  alterada_por TEXT DEFAULT '',   -- norma que alterou
  desde     TEXT DEFAULT '',
  ate       TEXT DEFAULT '',
  observacao TEXT DEFAULT '',
  criado_em TEXT NOT NULL
);

-- 33.7 / 31.3 / 31.4 monitoramento normativo por área e por setor econômico
CREATE TABLE IF NOT EXISTS norm_watches (
  id         TEXT PRIMARY KEY,
  titulo     TEXT NOT NULL,
  area       TEXT DEFAULT '',
  setor      TEXT DEFAULT '',        -- 31.4 setor econômico do cliente
  client_id  TEXT DEFAULT '',
  termos     TEXT NOT NULL DEFAULT '[]', -- JSON de termos monitorados
  fontes     TEXT DEFAULT '',        -- DOU, Sinj-DF, ANPD... (texto livre)
  frequencia TEXT NOT NULL DEFAULT 'semanal', -- diaria|semanal|mensal
  responsavel TEXT DEFAULT '',
  ativo      INTEGER NOT NULL DEFAULT 1,
  ultima_revisao TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS norm_alerts (
  id        TEXT PRIMARY KEY,
  watch_id  TEXT NOT NULL REFERENCES norm_watches(id) ON DELETE CASCADE,
  titulo    TEXT NOT NULL,
  resumo    TEXT DEFAULT '',
  fonte_url TEXT DEFAULT '',
  impacto   TEXT DEFAULT '',          -- 31.5 relatório de impacto (resumo)
  status    TEXT NOT NULL DEFAULT 'novo', -- novo|analisado|comunicado|descartado
  analisado_por TEXT DEFAULT '',
  criado_em TEXT NOT NULL
);

-- =====================================================================
-- ESTRATÉGIA E MATRIZES (Cap. 5.6 fatos · 21 diagnóstico · 23 estratégia ·
-- 24 provas · 26.3 recursos · 30 negociação)
-- =====================================================================
CREATE TABLE IF NOT EXISTS case_strategies (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  objetivo_juridico TEXT DEFAULT '',    -- 23.1
  objetivo_cliente  TEXT DEFAULT '',
  teses_principais  TEXT DEFAULT '',    -- 23.4
  teses_subsidiarias TEXT DEFAULT '',
  provas_necessarias TEXT DEFAULT '',   -- 23.5
  batna            TEXT DEFAULT '',     -- 30.3
  faixa_acordo_min INTEGER NOT NULL DEFAULT 0,
  faixa_acordo_max INTEGER NOT NULL DEFAULT 0,
  custo_estimado   INTEGER NOT NULL DEFAULT 0, -- 23.7 centavos
  duracao_estimada TEXT DEFAULT '',
  sigilosa         INTEGER NOT NULL DEFAULT 1, -- estratégia NUNCA vai ao portal do cliente nem ao RAG
  atualizado_por   TEXT DEFAULT '',
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_strat_case ON case_strategies(case_id);

-- 23.2/23.3 cenários com probabilidade, impacto e incerteza declarada
CREATE TABLE IF NOT EXISTS strategy_scenarios (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  cenario     TEXT NOT NULL,
  probabilidade TEXT NOT NULL DEFAULT 'possivel', -- provavel|possivel|remoto
  impacto_centavos INTEGER NOT NULL DEFAULT 0,
  incerteza   TEXT DEFAULT '',      -- o que NÃO se sabe (obrigatório pelo Cap. 23.3)
  providencia TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);

-- 23.9 registro das decisões estratégicas (quem decidiu, por quê, alternativas)
CREATE TABLE IF NOT EXISTS strategy_decisions (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  decisao     TEXT NOT NULL,
  alternativas TEXT DEFAULT '',
  motivo      TEXT DEFAULT '',
  quem        TEXT DEFAULT '',
  cliente_ciente INTEGER NOT NULL DEFAULT 0,
  revisar_em  TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);

-- 5.6 matriz de fatos: comprovado × alegado × controvertido
CREATE TABLE IF NOT EXISTS fact_matrix (
  id         TEXT PRIMARY KEY,
  case_id    TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  fato       TEXT NOT NULL,
  situacao   TEXT NOT NULL DEFAULT 'alegado', -- comprovado|alegado|controvertido|impugnado
  fonte      TEXT DEFAULT '',        -- documento/fl. dos autos que sustenta
  document_id TEXT DEFAULT '',
  quem_alega TEXT DEFAULT '',        -- nossa parte | contrária | terceiro
  observacao TEXT DEFAULT '',
  criado_em  TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fact_case ON fact_matrix(case_id, situacao);

-- 24.1 matriz de provas: fato → prova → pedido (+ autenticidade e custódia)
CREATE TABLE IF NOT EXISTS evidence_matrix (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  fato_id     TEXT DEFAULT '',        -- fact_matrix.id
  prova       TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'documental', -- documental|testemunhal|pericial|digital|audiovisual|outra
  document_id TEXT DEFAULT '',
  produzida_por TEXT DEFAULT '',
  pedido_vinculado TEXT DEFAULT '',   -- 24.3
  autenticidade TEXT DEFAULT '',      -- 24.4 (hash, ata notarial, original em poder de...)
  cadeia_custodia TEXT DEFAULT '',    -- 24.8
  contradicao TEXT DEFAULT '',        -- 24.9
  situacao    TEXT NOT NULL DEFAULT 'a_produzir', -- a_produzir|juntada|deferida|indeferida|impugnada
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ev_case ON evidence_matrix(case_id, situacao);

-- 21.9 relatório inicial (diagnóstico do processo). IA gera MINUTA; humano valida.
CREATE TABLE IF NOT EXISTS case_diagnostics (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  cronologia   TEXT DEFAULT '',       -- 21.2
  pecas_relevantes TEXT DEFAULT '',   -- 21.3
  alegacoes    TEXT DEFAULT '',       -- 21.4
  pedidos_fundamentos TEXT DEFAULT '',-- 21.5
  preliminares TEXT DEFAULT '',       -- 21.6
  controvertidos TEXT DEFAULT '',     -- 21.7
  riscos_lacunas TEXT DEFAULT '',     -- 21.8
  origem       TEXT NOT NULL DEFAULT 'humano', -- humano|ia
  status       TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|validado
  validado_por TEXT DEFAULT '',
  validado_em  TEXT DEFAULT '',
  criado_por   TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- 26.3 matriz de recursos cabíveis (prazo, custo, chance, efeito)
CREATE TABLE IF NOT EXISTS appeal_options (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  decisao     TEXT NOT NULL DEFAULT '',
  recurso     TEXT NOT NULL,
  prazo_dias  INTEGER NOT NULL DEFAULT 0,
  prazo_fatal TEXT DEFAULT '',
  custo_centavos INTEGER NOT NULL DEFAULT 0,   -- preparo + porte
  chance      TEXT NOT NULL DEFAULT 'possivel',-- provavel|possivel|remoto
  efeito      TEXT DEFAULT '',                 -- suspensivo/devolutivo
  recomendacao TEXT NOT NULL DEFAULT 'a_decidir', -- interpor|nao_interpor|a_decidir
  fundamento  TEXT DEFAULT '',
  decidido_por TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);

-- 30.6 registro das tratativas de negociação/mediação
CREATE TABLE IF NOT EXISTS negotiation_rounds (
  id         TEXT PRIMARY KEY,
  case_id    TEXT DEFAULT '',
  contract_id TEXT DEFAULT '',
  rodada     INTEGER NOT NULL DEFAULT 1,
  ponto      TEXT NOT NULL,
  posicao_nossa TEXT DEFAULT '',
  posicao_contraria TEXT DEFAULT '',
  resultado  TEXT NOT NULL DEFAULT 'aberto', -- aberto|acordado|impasse|retirado
  confidencial INTEGER NOT NULL DEFAULT 1,   -- 30.9
  quem       TEXT DEFAULT '',
  quando     TEXT NOT NULL
);

-- =====================================================================
-- 47.9 — CICLO DE VIDA CONTRATUAL (Cap. 29). O wizard/análise já existe;
-- aqui entram o CONTRATO como entidade, alçadas, obrigações e renovação.
-- =====================================================================
CREATE TABLE IF NOT EXISTS contract_records (
  id            TEXT PRIMARY KEY,
  titulo        TEXT NOT NULL,
  client_id     TEXT DEFAULT '',
  contraparte   TEXT DEFAULT '',
  tipo          TEXT NOT NULL DEFAULT 'outro', -- servicos|nda|honorarios|locacao|fornecimento|societario|outro
  objeto        TEXT DEFAULT '',
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  vigencia_inicio TEXT DEFAULT '',
  vigencia_fim  TEXT DEFAULT '',
  renovacao_automatica INTEGER NOT NULL DEFAULT 0,
  aviso_previo_dias INTEGER NOT NULL DEFAULT 30,   -- 29.11 alerta de denúncia
  alcada        TEXT NOT NULL DEFAULT 'socio',     -- 29.9: coordenador|socio|comite
  status        TEXT NOT NULL DEFAULT 'solicitado',-- solicitado|minuta|negociacao|aprovacao|assinatura|vigente|encerrado|rescindido
  draft_id      TEXT DEFAULT '',                   -- legal_drafts.id da minuta
  document_id   TEXT DEFAULT '',                   -- via assinada
  responsavel   TEXT DEFAULT '',
  risco         TEXT DEFAULT '',                   -- 29.5 resumo da análise de risco
  assinado_em   TEXT DEFAULT '',
  encerrado_em  TEXT DEFAULT '',
  observacoes   TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contr_status ON contract_records(status, vigencia_fim);

-- 29.9 aprovação por alçada — assinatura só depois de aprovada
CREATE TABLE IF NOT EXISTS contract_approvals (
  id          TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contract_records(id) ON DELETE CASCADE,
  nivel       TEXT NOT NULL DEFAULT 'socio',
  decisao     TEXT NOT NULL DEFAULT 'pendente', -- pendente|aprovado|reprovado|com_ressalva
  ressalvas   TEXT DEFAULT '',
  aprovador   TEXT DEFAULT '',
  quando      TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);

-- 29.11 obrigações, prazos e renovações (o que gera alerta)
CREATE TABLE IF NOT EXISTS contract_obligations (
  id          TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contract_records(id) ON DELETE CASCADE,
  descricao   TEXT NOT NULL,
  responsavel_parte TEXT NOT NULL DEFAULT 'nossa', -- nossa|contraparte|ambas
  responsavel_id TEXT DEFAULT '',
  tipo        TEXT NOT NULL DEFAULT 'obrigacao',   -- obrigacao|pagamento|entrega|renovacao|denuncia|relatorio
  data_limite TEXT DEFAULT '',
  periodicidade TEXT NOT NULL DEFAULT 'unica',     -- unica|mensal|trimestral|semestral|anual
  alerta_dias INTEGER NOT NULL DEFAULT 15,
  status      TEXT NOT NULL DEFAULT 'pendente',    -- pendente|cumprida|atrasada|dispensada
  cumprida_em TEXT DEFAULT '',
  task_id     TEXT DEFAULT '',
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obl_data ON contract_obligations(status, data_limite);

-- 29.3 biblioteca de cláusulas em TRÊS NÍVEIS (preferencial/aceitável/inaceitável)
CREATE TABLE IF NOT EXISTS clause_library (
  id          TEXT PRIMARY KEY,
  area        TEXT DEFAULT '',
  tema        TEXT NOT NULL,          -- ex.: limitação de responsabilidade
  nivel       TEXT NOT NULL DEFAULT 'preferencial', -- preferencial|aceitavel|inaceitavel
  texto       TEXT NOT NULL,
  justificativa TEXT DEFAULT '',
  risco       TEXT DEFAULT '',        -- alto|medio|baixo
  fallback    TEXT DEFAULT '',        -- posição de recuo (29.8)
  criado_por  TEXT DEFAULT '',
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clause_tema ON clause_library(tema, nivel);

-- =====================================================================
-- 47.10 — FINANCEIRO COMPLETO (Cap. 38) + APONTAMENTO DE HORAS (37.5)
-- =====================================================================
CREATE TABLE IF NOT EXISTS fee_agreements (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  case_id      TEXT DEFAULT '',
  modalidade   TEXT NOT NULL DEFAULT 'fixo', -- fixo|mensal|hora|exito|misto
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  valor_hora_centavos INTEGER NOT NULL DEFAULT 0,
  percentual_exito REAL NOT NULL DEFAULT 0,
  parcelas     INTEGER NOT NULL DEFAULT 1,
  dia_vencimento INTEGER NOT NULL DEFAULT 10,
  reajuste     TEXT DEFAULT '',
  inicio       TEXT DEFAULT '',
  fim          TEXT DEFAULT '',
  reembolsaveis TEXT DEFAULT '',       -- 38.6 o que é reembolsável
  status       TEXT NOT NULL DEFAULT 'ativo', -- ativo|suspenso|encerrado
  contract_id  TEXT DEFAULT '',
  observacoes  TEXT DEFAULT '',
  criado_em    TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- 37.5 apontamento de horas (base de honorário por hora, produtividade e capacidade)
CREATE TABLE IF NOT EXISTS time_entries (
  id         TEXT PRIMARY KEY,
  user_id    TEXT DEFAULT '',
  quem       TEXT DEFAULT '',
  case_id    TEXT DEFAULT '',
  client_id  TEXT DEFAULT '',
  data       TEXT NOT NULL,
  minutos    INTEGER NOT NULL DEFAULT 0,
  atividade  TEXT NOT NULL DEFAULT '',
  faturavel  INTEGER NOT NULL DEFAULT 1,
  valor_hora_centavos INTEGER NOT NULL DEFAULT 0,
  invoice_id TEXT DEFAULT '',           -- preenchido quando faturado
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_time_user ON time_entries(user_id, data);
CREATE INDEX IF NOT EXISTS idx_time_case ON time_entries(case_id, data);

-- 38.3/38.4 faturamento e contas a receber
CREATE TABLE IF NOT EXISTS invoices (
  id          TEXT PRIMARY KEY,
  numero      TEXT DEFAULT '',
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  case_id     TEXT DEFAULT '',
  competencia TEXT NOT NULL DEFAULT '',   -- AAAA-MM
  itens       TEXT NOT NULL DEFAULT '[]', -- JSON: [{descricao,quantidade,valor_centavos,tipo}]
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  emitida_em  TEXT DEFAULT '',
  vencimento  TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|emitida|enviada|paga|parcial|inadimplente|cancelada
  pago_centavos INTEGER NOT NULL DEFAULT 0,
  pago_em     TEXT DEFAULT '',
  nota_fiscal TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inv_status ON invoices(status, vencimento);

-- 38.5 cobrança escalonada. A PARTIR DO 2º AVISO exige aprovação humana (47.10).
CREATE TABLE IF NOT EXISTS collection_actions (
  id          TEXT PRIMARY KEY,
  invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  nivel       INTEGER NOT NULL DEFAULT 1,  -- 1 = lembrete; 2+ = cobrança (exige aprovação)
  canal       TEXT NOT NULL DEFAULT 'email', -- email|whatsapp|telefone|carta|juridico
  texto       TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|aprovada|enviada|cancelada
  aprovada_por TEXT DEFAULT '',
  enviada_em  TEXT DEFAULT '',
  resultado   TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);

-- 38.9 orçamento (previsto × realizado por categoria)
CREATE TABLE IF NOT EXISTS budget_entries (
  id        TEXT PRIMARY KEY,
  competencia TEXT NOT NULL,        -- AAAA-MM
  categoria TEXT NOT NULL,
  natureza  TEXT NOT NULL DEFAULT 'despesa', -- receita|despesa
  previsto_centavos INTEGER NOT NULL DEFAULT 0,
  realizado_centavos INTEGER NOT NULL DEFAULT 0,
  centro_custo TEXT DEFAULT '',      -- 39.3
  observacao TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_key ON budget_entries(competencia, categoria, natureza, centro_custo);

-- =====================================================================
-- 47.3 — PORTAL INTERNO DA EQUIPE (Cap. 36) + POPs (7.6) +
-- 47.12 CENTRAL DE AGENTES (10.10 limites) + 12.8/12.9 governança
-- =====================================================================
CREATE TABLE IF NOT EXISTS internal_posts (
  id        TEXT PRIMARY KEY,
  tipo      TEXT NOT NULL DEFAULT 'aviso', -- aviso|comunicado|noticia|treinamento
  titulo    TEXT NOT NULL,
  corpo     TEXT NOT NULL DEFAULT '',
  areas     TEXT NOT NULL DEFAULT '[]',    -- JSON de núcleos-alvo ([] = todos)
  exige_ciencia INTEGER NOT NULL DEFAULT 0,
  fixado    INTEGER NOT NULL DEFAULT 0,
  autor     TEXT DEFAULT '',
  publicado_em TEXT NOT NULL,
  expira_em TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS post_acks (
  id      TEXT PRIMARY KEY,
  ref_tipo TEXT NOT NULL DEFAULT 'post',   -- post|pop|policy
  ref_id  TEXT NOT NULL,
  user_id TEXT DEFAULT '',
  quem    TEXT DEFAULT '',
  quando  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ack_key ON post_acks(ref_tipo, ref_id, user_id);

-- 7.6 / 36.5 POPs versionados com passos e checklist
CREATE TABLE IF NOT EXISTS pops (
  id        TEXT PRIMARY KEY,
  codigo    TEXT DEFAULT '',
  titulo    TEXT NOT NULL,
  area      TEXT DEFAULT '',
  objetivo  TEXT DEFAULT '',
  gatilho   TEXT DEFAULT '',          -- quando o POP dispara
  responsavel TEXT DEFAULT '',
  passos    TEXT NOT NULL DEFAULT '[]', -- JSON: [{ordem,acao,responsavel,evidencia}]
  checklist TEXT NOT NULL DEFAULT '[]', -- JSON: [{item,obrigatorio}]
  versao    INTEGER NOT NULL DEFAULT 1,
  vigente_desde TEXT DEFAULT '',
  aprovado_por TEXT DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|vigente|revisao|arquivado
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- Execução de um POP/checklist (7.7): quem rodou, o que marcou
CREATE TABLE IF NOT EXISTS pop_runs (
  id        TEXT PRIMARY KEY,
  pop_id    TEXT NOT NULL REFERENCES pops(id) ON DELETE CASCADE,
  ref_tipo  TEXT DEFAULT '',   -- case|deadline|draft|contract...
  ref_id    TEXT DEFAULT '',
  marcados  TEXT NOT NULL DEFAULT '[]', -- JSON: [{item,ok,observacao}]
  concluido INTEGER NOT NULL DEFAULT 0,
  quem      TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  concluido_em TEXT DEFAULT ''
);

-- 36.8 registro de decisões internas
CREATE TABLE IF NOT EXISTS internal_decisions (
  id        TEXT PRIMARY KEY,
  assunto   TEXT NOT NULL,
  decisao   TEXT NOT NULL,
  motivo    TEXT DEFAULT '',
  participantes TEXT DEFAULT '',
  vigencia  TEXT DEFAULT '',
  revisar_em TEXT DEFAULT '',
  quem      TEXT DEFAULT '',
  criado_em TEXT NOT NULL
);

-- 36.9 solicitações entre departamentos/núcleos
CREATE TABLE IF NOT EXISTS internal_requests (
  id        TEXT PRIMARY KEY,
  de_area   TEXT DEFAULT '',
  para_area TEXT DEFAULT '',
  assunto   TEXT NOT NULL,
  pedido    TEXT DEFAULT '',
  prazo     TEXT DEFAULT '',
  prioridade TEXT NOT NULL DEFAULT 'media',
  status    TEXT NOT NULL DEFAULT 'aberta', -- aberta|em_andamento|concluida|recusada
  resposta  TEXT DEFAULT '',
  solicitante TEXT DEFAULT '',
  responsavel TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- 12.8 inventário de sistemas e automações + 12.9 plano de contingência
CREATE TABLE IF NOT EXISTS system_inventory (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'sistema', -- sistema|automacao|agente|integracao|fornecedor
  finalidade TEXT DEFAULT '',
  responsavel TEXT DEFAULT '',
  fornecedor TEXT DEFAULT '',
  dados_tratados TEXT DEFAULT '',      -- cruza com o inventário LGPD (42.2)
  criticidade TEXT NOT NULL DEFAULT 'media', -- critica|alta|media|baixa
  onde_roda  TEXT DEFAULT '',
  credencial_onde TEXT DEFAULT '',     -- ONDE fica (nunca a credencial em si)
  plano_contingencia TEXT DEFAULT '',  -- 12.9
  plano_saida TEXT DEFAULT '',         -- 12.7 como recuperar os dados
  ultima_revisao TEXT DEFAULT '',
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- 10.10 / 47.12 limites de autonomia por agente (os três blocos do livro)
CREATE TABLE IF NOT EXISTS agent_charters (
  id            TEXT PRIMARY KEY,
  agente        TEXT NOT NULL UNIQUE,   -- casa com ai_agents.slug quando existir
  nome          TEXT NOT NULL,
  escopo        TEXT DEFAULT '',
  pode_sozinho  TEXT NOT NULL DEFAULT '[]', -- JSON de ações permitidas sem humano
  exige_aprovacao TEXT NOT NULL DEFAULT '[]',
  proibido      TEXT NOT NULL DEFAULT '[]',
  dados_acessa  TEXT DEFAULT '',
  responsavel   TEXT DEFAULT '',
  ativo         INTEGER NOT NULL DEFAULT 1,
  ultima_revisao TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- =====================================================================
-- PARTE VIII — COMPLIANCE (41), LGPD (42), CRISES/CONTINUIDADE (44),
-- POLÍTICA DE IA (6.10 / 42.12), TEMPORALIDADE (8.8 / 35.11)
-- =====================================================================
CREATE TABLE IF NOT EXISTS policies (
  id        TEXT PRIMARY KEY,
  tipo      TEXT NOT NULL DEFAULT 'interna', -- codigo_conduta|politica_ia|privacidade|seguranca|interna|retencao
  titulo    TEXT NOT NULL,
  texto     TEXT NOT NULL DEFAULT '',
  versao    INTEGER NOT NULL DEFAULT 1,
  vigente_desde TEXT DEFAULT '',
  aprovado_por TEXT DEFAULT '',
  exige_ciencia INTEGER NOT NULL DEFAULT 1,
  status    TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|vigente|revisao|arquivada
  revisar_em TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- 41.2 / 31.8 registro de riscos (do escritório e do cliente)
CREATE TABLE IF NOT EXISTS risk_register (
  id         TEXT PRIMARY KEY,
  escopo     TEXT NOT NULL DEFAULT 'escritorio', -- escritorio|cliente|caso
  client_id  TEXT DEFAULT '',
  case_id    TEXT DEFAULT '',
  risco      TEXT NOT NULL,
  categoria  TEXT NOT NULL DEFAULT 'operacional', -- juridico|operacional|financeiro|tecnologico|reputacional|regulatorio|etico
  probabilidade TEXT NOT NULL DEFAULT 'possivel', -- provavel|possivel|remoto
  impacto    TEXT NOT NULL DEFAULT 'medio',        -- critico|alto|medio|baixo
  controles  TEXT DEFAULT '',
  plano_correcao TEXT DEFAULT '',          -- 41.10
  dono       TEXT DEFAULT '',
  prazo      TEXT DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'aberto', -- aberto|tratando|mitigado|aceito|fechado
  criado_em  TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_status ON risk_register(status, impacto);

-- 41.6 canal de denúncias (aceita anônimo; acesso restrito)
CREATE TABLE IF NOT EXISTS whistleblower_reports (
  id        TEXT PRIMARY KEY,
  protocolo TEXT NOT NULL UNIQUE,
  anonimo   INTEGER NOT NULL DEFAULT 1,
  relator   TEXT DEFAULT '',
  contato   TEXT DEFAULT '',
  categoria TEXT NOT NULL DEFAULT 'outro',
  relato    TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'recebida', -- recebida|em_apuracao|procedente|improcedente|arquivada
  apuracao  TEXT DEFAULT '',
  medidas   TEXT DEFAULT '',
  responsavel TEXT DEFAULT '',
  recebido_em TEXT NOT NULL,
  encerrado_em TEXT DEFAULT ''
);

-- 41.7 due diligence de terceiros
CREATE TABLE IF NOT EXISTS third_party_dd (
  id        TEXT PRIMARY KEY,
  terceiro  TEXT NOT NULL,
  documento TEXT DEFAULT '',
  tipo      TEXT NOT NULL DEFAULT 'fornecedor', -- fornecedor|parceiro|correspondente|cliente|contraparte
  checagens TEXT NOT NULL DEFAULT '[]', -- JSON: [{fonte,resultado,data}]
  resultado TEXT NOT NULL DEFAULT 'pendente', -- aprovado|aprovado_com_ressalva|reprovado|pendente
  ressalvas TEXT DEFAULT '',
  validade  TEXT DEFAULT '',
  responsavel TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- 42.2 inventário de dados + 42.3 bases legais
CREATE TABLE IF NOT EXISTS data_inventory (
  id         TEXT PRIMARY KEY,
  tratamento TEXT NOT NULL,             -- ex.: cadastro de cliente, autos digitalizados
  dados      TEXT DEFAULT '',
  titulares  TEXT DEFAULT '',           -- clientes|colaboradores|contrapartes|terceiros
  sensivel   INTEGER NOT NULL DEFAULT 0,-- 42.4
  base_legal TEXT NOT NULL DEFAULT 'exercicio_direitos', -- consentimento|contrato|obrigacao_legal|exercicio_direitos|legitimo_interesse|outra
  finalidade TEXT DEFAULT '',
  retencao   TEXT DEFAULT '',
  compartilhamentos TEXT DEFAULT '',    -- 42.5/42.6 (inclui plataformas de IA)
  medidas    TEXT DEFAULT '',
  responsavel TEXT DEFAULT '',
  revisado_em TEXT DEFAULT '',
  criado_em  TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- 42.10 resposta a titulares (prazo legal de 15 dias — art. 19 LGPD)
CREATE TABLE IF NOT EXISTS data_subject_requests (
  id        TEXT PRIMARY KEY,
  titular   TEXT NOT NULL,
  contato   TEXT DEFAULT '',
  tipo      TEXT NOT NULL DEFAULT 'acesso', -- acesso|correcao|eliminacao|portabilidade|revogacao|informacao|oposicao
  pedido    TEXT DEFAULT '',
  recebido_em TEXT NOT NULL,
  prazo_em  TEXT DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'recebido', -- recebido|em_analise|atendido|parcial|recusado
  resposta  TEXT DEFAULT '',
  respondido_em TEXT DEFAULT '',
  responsavel TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dsr_prazo ON data_subject_requests(status, prazo_em);

-- 42.9 / 44.7 incidentes de segurança (com comunicação ANPD/titulares)
CREATE TABLE IF NOT EXISTS security_incidents (
  id        TEXT PRIMARY KEY,
  titulo    TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  detectado_em TEXT NOT NULL,
  origem    TEXT DEFAULT '',
  dados_afetados TEXT DEFAULT '',
  titulares_afetados INTEGER NOT NULL DEFAULT 0,
  gravidade TEXT NOT NULL DEFAULT 'media', -- critica|alta|media|baixa
  contencao TEXT DEFAULT '',
  anpd_notificada INTEGER NOT NULL DEFAULT 0,
  anpd_em   TEXT DEFAULT '',
  titulares_comunicados INTEGER NOT NULL DEFAULT 0,
  medidas   TEXT DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'aberto', -- aberto|contido|encerrado
  responsavel TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- 8.8 / 35.11 tabela de temporalidade + 35.12 eliminação registrada
CREATE TABLE IF NOT EXISTS retention_schedule (
  id        TEXT PRIMARY KEY,
  tipo_documental TEXT NOT NULL,
  prazo_guarda TEXT NOT NULL DEFAULT '',   -- ex.: 5 anos após o trânsito em julgado
  contagem_desde TEXT DEFAULT '',
  destinacao TEXT NOT NULL DEFAULT 'eliminacao', -- eliminacao|guarda_permanente|devolucao_cliente
  base_legal TEXT DEFAULT '',
  observacao TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disposal_records (
  id        TEXT PRIMARY KEY,
  ref_tipo  TEXT NOT NULL DEFAULT 'document',
  ref_id    TEXT DEFAULT '',
  descricao TEXT NOT NULL,
  motivo    TEXT DEFAULT '',
  metodo    TEXT DEFAULT '',
  autorizado_por TEXT NOT NULL,           -- eliminação exige autorização nominal
  cliente_avisado INTEGER NOT NULL DEFAULT 0,
  executado_em TEXT NOT NULL
);

-- 44.5 investigações internas
CREATE TABLE IF NOT EXISTS investigations (
  id        TEXT PRIMARY KEY,
  objeto    TEXT NOT NULL,
  report_id TEXT DEFAULT '',               -- whistleblower_reports.id
  escopo    TEXT DEFAULT '',
  cronologia TEXT DEFAULT '',
  entrevistas TEXT DEFAULT '',
  conclusoes TEXT DEFAULT '',
  medidas   TEXT DEFAULT '',
  sigilosa  INTEGER NOT NULL DEFAULT 1,
  status    TEXT NOT NULL DEFAULT 'aberta', -- aberta|em_curso|concluida|arquivada
  responsavel TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- 44.9 plano de continuidade (com registro do último teste — 48.5)
CREATE TABLE IF NOT EXISTS continuity_plans (
  id        TEXT PRIMARY KEY,
  cenario   TEXT NOT NULL,
  impacto   TEXT DEFAULT '',
  rto       TEXT DEFAULT '',              -- tempo tolerável de indisponibilidade
  procedimento TEXT DEFAULT '',
  alternativa TEXT DEFAULT '',
  responsavel TEXT DEFAULT '',
  ultimo_teste TEXT DEFAULT '',
  resultado_teste TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- 31.2 matriz de obrigações legais do cliente (consultoria empresarial)
CREATE TABLE IF NOT EXISTS obligation_matrix (
  id        TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  obrigacao TEXT NOT NULL,
  norma     TEXT DEFAULT '',
  orgao     TEXT DEFAULT '',
  periodicidade TEXT NOT NULL DEFAULT 'anual', -- unica|mensal|trimestral|semestral|anual|eventual
  proximo_vencimento TEXT DEFAULT '',
  responsavel_cliente TEXT DEFAULT '',
  evidencia TEXT DEFAULT '',
  risco_descumprimento TEXT DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'em_dia', -- em_dia|pendente|vencida|nao_aplicavel
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oblm_cli ON obligation_matrix(client_id, status);

-- =====================================================================
-- CAP. 13/14 — MARKETING JURÍDICO COM REVISÃO ÉTICA (Provimento 205/2021)
-- =====================================================================
CREATE TABLE IF NOT EXISTS content_items (
  id        TEXT PRIMARY KEY,
  titulo    TEXT NOT NULL,
  tipo      TEXT NOT NULL DEFAULT 'artigo', -- artigo|post|video|podcast|newsletter|pagina
  area      TEXT DEFAULT '',
  canal     TEXT DEFAULT '',
  publico   TEXT DEFAULT '',
  data_prevista TEXT DEFAULT '',
  pauta     TEXT DEFAULT '',
  texto     TEXT DEFAULT '',
  palavras_chave TEXT DEFAULT '',          -- 14.6 SEO jurídico
  status    TEXT NOT NULL DEFAULT 'ideia', -- ideia|producao|revisao_etica|aprovado|publicado|arquivado|reprovado
  etica_status TEXT NOT NULL DEFAULT 'pendente', -- pendente|aprovado|reprovado
  etica_itens TEXT NOT NULL DEFAULT '[]',  -- JSON: [{item,ok,observacao}] (13.10)
  etica_por TEXT DEFAULT '',               -- revisão ética é HUMANA (advogado)
  etica_em  TEXT DEFAULT '',
  aprovado_por TEXT DEFAULT '',
  url_publicada TEXT DEFAULT '',
  publicado_em TEXT DEFAULT '',
  autor     TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cont_status ON content_items(status, data_prevista);

-- 14.10 arquivo das versões publicadas (o que foi ao ar, quando, com que texto)
CREATE TABLE IF NOT EXISTS content_versions (
  id        TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  versao    INTEGER NOT NULL DEFAULT 1,
  texto     TEXT NOT NULL DEFAULT '',
  url       TEXT DEFAULT '',
  quem      TEXT DEFAULT '',
  criado_em TEXT NOT NULL
);

-- 14.3 dúvidas do público → pauta
CREATE TABLE IF NOT EXISTS content_questions (
  id        TEXT PRIMARY KEY,
  pergunta  TEXT NOT NULL,
  origem    TEXT DEFAULT '',      -- lead|portal|atendimento|redes
  area      TEXT DEFAULT '',
  frequencia INTEGER NOT NULL DEFAULT 1,
  content_id TEXT DEFAULT '',     -- pauta que a respondeu
  criado_em TEXT NOT NULL
);

-- =====================================================================
-- 47.11 — CONTROLADORIA JURÍDICA (Cap. 40). Conferência INDEPENDENTE de
-- quem opera: varre os outros módulos e registra o que está fora do padrão.
-- =====================================================================
CREATE TABLE IF NOT EXISTS control_runs (
  id         TEXT PRIMARY KEY,
  escopo     TEXT NOT NULL DEFAULT 'diaria', -- diaria|semanal|manual
  achados    INTEGER NOT NULL DEFAULT 0,
  criticos   INTEGER NOT NULL DEFAULT 0,
  resumo     TEXT DEFAULT '',
  quem       TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS control_findings (
  id        TEXT PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES control_runs(id) ON DELETE CASCADE,
  regra     TEXT NOT NULL,            -- id da conferência (ex.: prazo_sem_validacao)
  gravidade TEXT NOT NULL DEFAULT 'media', -- critica|alta|media|baixa
  descricao TEXT NOT NULL,
  ref_tipo  TEXT DEFAULT '',
  ref_id    TEXT DEFAULT '',
  responsavel TEXT DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'aberto', -- aberto|tratado|falso_positivo
  tratado_por TEXT DEFAULT '',
  tratado_em TEXT DEFAULT '',
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cfind_status ON control_findings(status, gravidade);

-- =====================================================================
-- 47.4 — PUBLICAÇÕES E PRAZOS: alertas escalonados (19.7) e
-- confirmação de leitura (19.8)
-- =====================================================================
CREATE TABLE IF NOT EXISTS deadline_escalations (
  id         TEXT PRIMARY KEY,
  deadline_id TEXT NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  nivel      INTEGER NOT NULL DEFAULT 1,   -- 1 responsável · 2 coordenação · 3 sócio
  dias_antes INTEGER NOT NULL DEFAULT 0,
  destino    TEXT DEFAULT '',
  canal      TEXT NOT NULL DEFAULT 'interna', -- interna|email|whatsapp
  enviado_em TEXT NOT NULL,
  lido_em    TEXT DEFAULT '',
  lido_por   TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_esc_dl ON deadline_escalations(deadline_id, nivel);

CREATE TABLE IF NOT EXISTS publication_acks (
  id        TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES case_publications(id) ON DELETE CASCADE,
  user_id   TEXT DEFAULT '',
  quem      TEXT DEFAULT '',
  quando    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pack_key ON publication_acks(publication_id, user_id);

-- =====================================================================
-- 47.6 — DOCUMENTOS: classificação de BAIXA CONFIANÇA vai para FILA,
-- não para a pasta (regra do 47.6 / 35.5)
-- =====================================================================
CREATE TABLE IF NOT EXISTS doc_classification_queue (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  sugestao_tipo TEXT DEFAULT '',
  sugestao_nome TEXT DEFAULT '',
  sugestao_case_id TEXT DEFAULT '',
  confianca   REAL NOT NULL DEFAULT 0,
  origem      TEXT NOT NULL DEFAULT 'ia',
  status      TEXT NOT NULL DEFAULT 'pendente', -- pendente|aceita|corrigida|descartada
  decidido_por TEXT DEFAULT '',
  decidido_em TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dcq_status ON doc_classification_queue(status, confianca);

-- =====================================================================
-- 47.2 — PORTAL DO CLIENTE: tradução do andamento com APROVAÇÃO HUMANA
-- antes de ficar visível (18.3/18.11), pendências (18.5) e avaliação (18.10)
-- =====================================================================
CREATE TABLE IF NOT EXISTS movement_translations (
  id          TEXT PRIMARY KEY,
  movement_id TEXT NOT NULL REFERENCES case_movements(id) ON DELETE CASCADE,
  case_id     TEXT DEFAULT '',
  texto_simples TEXT NOT NULL DEFAULT '',
  origem      TEXT NOT NULL DEFAULT 'ia',   -- ia|humano
  sensivel    INTEGER NOT NULL DEFAULT 0,   -- 47.2: evento sensível NÃO publica antes da conversa
  status      TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|aprovada|publicada|reprovada
  aprovada_por TEXT DEFAULT '',
  aprovada_em TEXT DEFAULT '',
  publicada_em TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mtrad_mov ON movement_translations(movement_id);

CREATE TABLE IF NOT EXISTS client_pendencies (
  id        TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  case_id   TEXT DEFAULT '',
  titulo    TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  tipo      TEXT NOT NULL DEFAULT 'documento', -- documento|informacao|assinatura|pagamento
  prazo     TEXT DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'pendente',  -- pendente|atendida|dispensada
  atendida_em TEXT DEFAULT '',
  solicitado_por TEXT DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pend_cli ON client_pendencies(client_id, status);

CREATE TABLE IF NOT EXISTS client_satisfaction (
  id        TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  case_id   TEXT DEFAULT '',
  nota      INTEGER NOT NULL DEFAULT 0,   -- 0-10
  comentario TEXT DEFAULT '',
  momento   TEXT NOT NULL DEFAULT 'periodica', -- onboarding|periodica|encerramento
  respondido_em TEXT NOT NULL
);
