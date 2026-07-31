-- =====================================================================
-- Villela Stay Manager — ONDA LIVRO
-- Tabelas que fecham a paridade com o livro "Claude AI na Prática para
-- Hospedagens" (Augusto Villela). ADITIVO: nenhuma tabela do schema.sql é
-- alterada aqui. Carregado por repo-livro.js no mesmo handle do db.js.
--
-- Toda tabela é escopada por tenant_id (isolamento lógico, padrão do vdocs).
-- Convenções de número: Apêndice F do livro (competência por check-in,
-- bruto/líquido declarados, disponíveis excluem bloqueio de manutenção).
-- =====================================================================

-- ---- Cap. 6/10/35 · cadastro mestre da unidade (a fonte da verdade) ----
CREATE TABLE IF NOT EXISTS lv_ficha (
  imovel_id            TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  capacidade_confortavel INTEGER DEFAULT 0,
  capacidade_maxima    INTEGER DEFAULT 0,
  camas                TEXT DEFAULT '[]',   -- JSON [{comodo,tipo,qtd}]
  comodidades_verificadas TEXT DEFAULT '[]',-- JSON (só o que foi conferido na vistoria)
  nao_tem              TEXT DEFAULT '[]',   -- JSON — o que a casa NÃO tem (Cap. 14)
  preparacao_min       INTEGER DEFAULT 0,   -- tempo REAL medido, em minutos (Cap. 35)
  janela_minima_min    INTEGER DEFAULT 0,   -- janela mínima entre estadias
  acesso_particularidades TEXT DEFAULT '',  -- SEM senha/código (Cap. 32)
  estacionamento       TEXT DEFAULT '',
  wifi_rede            TEXT DEFAULT '',     -- só o NOME da rede; senha nunca entra aqui
  checkin_hora         TEXT DEFAULT '15:00',
  checkout_hora        TEXT DEFAULT '11:00',
  regras               TEXT DEFAULT '',
  tarifa_minima_centavos INTEGER DEFAULT 0, -- piso que nenhum desconto cruza (Cap. 21)
  custo_fixo_mes_centavos INTEGER DEFAULT 0,
  atualizado_em        TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lv_ficha_t ON lv_ficha(tenant_id);

-- ---- Cap. 13/20 · interligações entre anúncios (as DUAS direções) ----
CREATE TABLE IF NOT EXISTS lv_interligacoes (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  imovel_a   TEXT NOT NULL,
  imovel_b   TEXT NOT NULL,
  obs        TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_int_t ON lv_interligacoes(tenant_id, imovel_a);
CREATE INDEX IF NOT EXISTS ix_lv_int_b ON lv_interligacoes(tenant_id, imovel_b);

-- ---- Cap. 22/37 · bloqueios de calendário (saem das noites disponíveis) ----
CREATE TABLE IF NOT EXISTS lv_bloqueios (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  imovel_id  TEXT NOT NULL,
  de         TEXT NOT NULL,   -- YYYY-MM-DD
  ate        TEXT NOT NULL,   -- exclusivo (mesma convenção do checkout)
  motivo     TEXT DEFAULT 'manutencao', -- manutencao|reforma|proprietario|reserva_segurada
  detalhe    TEXT DEFAULT '',
  expira_em  TEXT DEFAULT '', -- data segurada tem prazo (Cap. 30)
  responsavel TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_blq ON lv_bloqueios(tenant_id, imovel_id, de);

-- ---- Cap. 20/39 · auditoria diária de sincronização (duvida, não confirma) ----
CREATE TABLE IF NOT EXISTS lv_auditorias (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  quando        TEXT NOT NULL,
  parcial       INTEGER DEFAULT 0,   -- 1 = alguma fonte não pôde ser lida
  fontes_indisponiveis TEXT DEFAULT '[]',
  divergencias  TEXT DEFAULT '[]',   -- JSON [{risco,unidade,data,canal,valor_a,valor_b,texto}]
  resumo        TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_lv_aud ON lv_auditorias(tenant_id, quando DESC);

-- ---- Cap. 39 · sinal de vida das rotinas (rotina morta não reclama) ----
CREATE TABLE IF NOT EXISTS lv_rotinas (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  nome           TEXT NOT NULL,
  descricao      TEXT DEFAULT '',
  periodicidade_min INTEGER DEFAULT 1440,
  ultima_execucao TEXT DEFAULT '',
  ultimo_status  TEXT DEFAULT '',     -- ok|falha
  ultimo_erro    TEXT DEFAULT '',
  ativa          INTEGER DEFAULT 1,
  criado_em      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lv_rotina ON lv_rotinas(tenant_id, nome);

-- ---- Cap. 31/34 + Apêndice D · régua de mensagens ----
CREATE TABLE IF NOT EXISTS lv_modelos (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  chave      TEXT NOT NULL,        -- d1_consulta, d3_confirmacao, d4_prechegada...
  gatilho    TEXT DEFAULT 'manual',-- confirmacao|dias_antes|vespera|checkout_vespera|pos_checkout|manual
  dias       INTEGER DEFAULT 0,    -- para gatilho dias_antes
  idioma     TEXT DEFAULT 'pt',    -- pt|en|es|fr
  titulo     TEXT DEFAULT '',
  texto      TEXT NOT NULL,
  ativo      INTEGER DEFAULT 1,
  criado_em  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lv_modelo ON lv_modelos(tenant_id, chave, idioma);

-- fila preparada para conferência humana. NADA sai daqui sozinho (Cap. 8, regra 4).
CREATE TABLE IF NOT EXISTS lv_fila_mensagens (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  reserva_id  TEXT NOT NULL,
  modelo      TEXT NOT NULL,
  idioma      TEXT DEFAULT 'pt',
  destino     TEXT DEFAULT '',
  texto       TEXT DEFAULT '',
  situacao    TEXT DEFAULT 'preparada', -- preparada|aprovada|enviada|descartada|contato_pessoal|falta_dado
  motivo      TEXT DEFAULT '',          -- por que virou contato_pessoal / falta_dado
  exige_insercao INTEGER DEFAULT 0,     -- contém [DADO DE ACESSO — INSERIR NO ENVIO]
  preparada_em TEXT NOT NULL,
  resolvida_em TEXT DEFAULT '',
  quem        TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lv_fila ON lv_fila_mensagens(tenant_id, situacao, preparada_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lv_fila ON lv_fila_mensagens(tenant_id, reserva_id, modelo);

-- ---- Cap. 31/33 · manual digital do hóspede (sai do cadastro mestre) ----
CREATE TABLE IF NOT EXISTS lv_manual (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  imovel_id  TEXT NOT NULL,
  assunto    TEXT NOT NULL,       -- buscável por assunto (Cap. 6)
  corpo      TEXT DEFAULT '',
  idioma     TEXT DEFAULT 'pt',
  ordem      INTEGER DEFAULT 0,
  criado_em  TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lv_manual ON lv_manual(tenant_id, imovel_id, ordem);

CREATE TABLE IF NOT EXISTS lv_manual_token (
  imovel_id  TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  token      TEXT NOT NULL,
  criado_em  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lv_manual_tk ON lv_manual_token(token);

-- ---- Cap. 33 · gatilhos de escalonamento do concierge ----
CREATE TABLE IF NOT EXISTS lv_gatilhos (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  termo      TEXT NOT NULL,
  categoria  TEXT DEFAULT 'outro', -- emergencia|seguranca|dinheiro|reserva|insatisfacao|acesso|pessoa
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_gat ON lv_gatilhos(tenant_id);

CREATE TABLE IF NOT EXISTS lv_plantao (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  faixa      TEXT NOT NULL,       -- ex.: 08:00-20:00
  responsavel TEXT DEFAULT '',
  contato    TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_plt ON lv_plantao(tenant_id);

-- registro de toda triagem (Cap. 33: conversa não registrada não ensina nem defende)
CREATE TABLE IF NOT EXISTS lv_triagens (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  reserva_id TEXT DEFAULT '',
  mensagem   TEXT DEFAULT '',
  decisao    TEXT DEFAULT '',     -- escalonar|responder|sem_fonte
  motivo     TEXT DEFAULT '',
  fonte      TEXT DEFAULT '',     -- de qual seção do manual saiu a resposta
  resposta   TEXT DEFAULT '',
  quando     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_tri ON lv_triagens(tenant_id, quando DESC);

-- ---- Cap. 23 · CRM: contatos, oportunidades, funil ----
CREATE TABLE IF NOT EXISTS lv_contatos (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  tipo        TEXT DEFAULT 'lead',  -- lead|hospede|proprietario
  nome        TEXT NOT NULL,
  telefone    TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  idioma      TEXT DEFAULT 'pt',
  origem      TEXT DEFAULT '',      -- sem origem registrada não entra em reativação
  primeiro_contato TEXT DEFAULT '',
  ultima_estadia   TEXT DEFAULT '',
  finalidade  TEXT DEFAULT '',      -- descanso|trabalho|formatura|casamento|comemoracao|evento|outro
  opt_out     INTEGER DEFAULT 0,    -- pediu para não ser contatado
  obs         TEXT DEFAULT '',
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lv_cont ON lv_contatos(tenant_id, tipo, nome);

CREATE TABLE IF NOT EXISTS lv_oportunidades (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  contato_id    TEXT NOT NULL,
  imovel_id     TEXT DEFAULT '',
  datas_de      TEXT DEFAULT '',
  datas_ate     TEXT DEFAULT '',
  hospedes_qtd  INTEGER DEFAULT 0,
  finalidade    TEXT DEFAULT '',
  visitantes    INTEGER DEFAULT 0,  -- pergunta que separa estadia de evento (Cap. 24)
  valor_cotado_centavos INTEGER DEFAULT 0,
  cotado_em     TEXT DEFAULT '',
  estagio       TEXT DEFAULT 'novo', -- novo|qualificado|cotado|negociacao|ganho|perdido
  proxima_acao  TEXT DEFAULT '',
  proxima_acao_em TEXT DEFAULT '',
  responsavel   TEXT DEFAULT '',
  motivo_perda  TEXT DEFAULT '',     -- categoria FECHADA (ver MOTIVOS_PERDA)
  reserva_id    TEXT DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lv_opo ON lv_oportunidades(tenant_id, estagio, proxima_acao_em);

-- ---- Cap. 21 · calendário de datas especiais ----
CREATE TABLE IF NOT EXISTS lv_datas_especiais (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  nome       TEXT NOT NULL,
  de         TEXT NOT NULL,
  ate        TEXT NOT NULL,
  imovel_id  TEXT DEFAULT '',      -- vazio = todas as unidades
  tarifa_proposta_centavos INTEGER DEFAULT 0,
  estadia_minima INTEGER DEFAULT 1,
  revisar_em TEXT DEFAULT '',
  aplicada   INTEGER DEFAULT 0,    -- publicação é humana (Cap. 21)
  justificativa TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_dtesp ON lv_datas_especiais(tenant_id, de);

-- ---- Cap. 35 · execução da limpeza (evidência, liberação, inspeção) ----
CREATE TABLE IF NOT EXISTS lv_limpeza_exec (
  limpeza_id   TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  executor     TEXT DEFAULT '',
  evidencias   TEXT DEFAULT '[]',  -- JSON de URLs/descrições (quarto, banheiro, cozinha, externa)
  pendencias   TEXT DEFAULT '',
  confirmada_em TEXT DEFAULT '',
  liberada     INTEGER DEFAULT 0,  -- estado formal "pronta para receber"
  liberada_em  TEXT DEFAULT '',
  liberada_por TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lv_lexec ON lv_limpeza_exec(tenant_id);

CREATE TABLE IF NOT EXISTS lv_inspecoes (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  imovel_id  TEXT NOT NULL,
  data       TEXT NOT NULL,
  inspetor   TEXT DEFAULT '',       -- precisa ser diferente de quem executou (Cap. 38)
  executor   TEXT DEFAULT '',
  desvios    TEXT DEFAULT '[]',     -- JSON [{item,classificacao}] — nunca por pessoa
  obs        TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_insp ON lv_inspecoes(tenant_id, data DESC);

-- ---- Cap. 36 · enxoval por lote (vida útil) e fornecedores ----
CREATE TABLE IF NOT EXISTS lv_enxoval (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  imovel_id  TEXT DEFAULT '',
  item       TEXT NOT NULL,
  lote       TEXT DEFAULT '',
  qtd        INTEGER DEFAULT 0,
  entrada_em TEXT DEFAULT '',
  vida_util_meses INTEGER DEFAULT 18,
  aposentado_em TEXT DEFAULT '',
  destino    TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_enx ON lv_enxoval(tenant_id, item);

CREATE TABLE IF NOT EXISTS lv_fornecedores (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  especialidade TEXT NOT NULL,     -- piscina|ar_condicionado|eletrica|hidraulica|chaveiro|enxoval|limpeza|outro
  nome         TEXT NOT NULL,
  contato      TEXT DEFAULT '',
  prazo_resposta TEXT DEFAULT '',
  obs          TEXT DEFAULT '',
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_forn ON lv_fornecedores(tenant_id, especialidade);

-- ---- Cap. 37 · plano preventivo por equipamento ----
CREATE TABLE IF NOT EXISTS lv_preventiva (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  imovel_id      TEXT NOT NULL,
  equipamento    TEXT NOT NULL,
  periodicidade_dias INTEGER DEFAULT 180,
  ultima_execucao TEXT DEFAULT '',  -- sem data não existe plano, existe intenção
  duracao_horas  INTEGER DEFAULT 4,
  fornecedor_id  TEXT DEFAULT '',
  obs            TEXT DEFAULT '',
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_prev ON lv_preventiva(tenant_id, imovel_id);

-- ---- Cap. 29 · avaliações e diagnóstico de reputação ----
CREATE TABLE IF NOT EXISTS lv_avaliacoes (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  imovel_id  TEXT DEFAULT '',
  reserva_id TEXT DEFAULT '',
  canal      TEXT DEFAULT 'direto',
  nota       REAL DEFAULT 0,
  texto      TEXT DEFAULT '',
  data       TEXT NOT NULL,
  assuntos   TEXT DEFAULT '[]',   -- JSON [{assunto,classe}] classe=fisico|processo|expectativa
  respondida_em TEXT DEFAULT '',
  resposta   TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_aval ON lv_avaliacoes(tenant_id, data DESC);

CREATE TABLE IF NOT EXISTS lv_correcoes (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  assunto    TEXT NOT NULL,
  classe     TEXT DEFAULT 'fisico',
  imovel_id  TEXT DEFAULT '',
  corrigido_em TEXT DEFAULT '',
  responsavel TEXT DEFAULT '',
  obs        TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_corr ON lv_correcoes(tenant_id, assunto);

-- ---- Cap. 12 · proprietários e prestação de contas (compartimentada) ----
CREATE TABLE IF NOT EXISTS lv_proprietarios (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  nome        TEXT NOT NULL,
  contato     TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  remuneracao_pct REAL DEFAULT 20,
  base_calculo TEXT DEFAULT 'liquido',  -- bruto|liquido (literal no contrato)
  fundo_manutencao_pct REAL DEFAULT 0,
  limite_autonomia_centavos INTEGER DEFAULT 0,
  limite_emergencia_centavos INTEGER DEFAULT 0,
  repasse_dia INTEGER DEFAULT 10,
  portal_token TEXT DEFAULT '',
  ultimo_contato TEXT DEFAULT '',
  criado_em   TEXT NOT NULL,
  atualizado_em TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lv_prop ON lv_proprietarios(tenant_id, nome);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lv_prop_tk ON lv_proprietarios(portal_token);

CREATE TABLE IF NOT EXISTS lv_imovel_proprietario (
  imovel_id      TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  proprietario_id TEXT NOT NULL,
  desde          TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lv_impr ON lv_imovel_proprietario(tenant_id, proprietario_id);

-- ---- Cap. 40 · provisões e rateio (critério escrito e estável) ----
CREATE TABLE IF NOT EXISTS lv_config_financeira (
  tenant_id            TEXT PRIMARY KEY,
  reconhecimento       TEXT DEFAULT 'competencia', -- competencia|caixa
  provisao_manutencao_pct REAL DEFAULT 5,
  provisao_reposicao_pct  REAL DEFAULT 3,
  provisao_vacancia_pct   REAL DEFAULT 0,
  rateio_criterio      TEXT DEFAULT 'receita',     -- receita|unidades|noites
  comissao_padrao_pct  REAL DEFAULT 0,
  atualizado_em        TEXT DEFAULT ''
);

-- ---- Cap. 25/30 · política de documentação por faixa de valor ----
CREATE TABLE IF NOT EXISTS lv_politica_doc (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  de_centavos  INTEGER DEFAULT 0,
  ate_centavos INTEGER DEFAULT 0,   -- 0 = sem teto
  exige_identificacao INTEGER DEFAULT 0,
  exige_contrato INTEGER DEFAULT 0,
  exige_caucao INTEGER DEFAULT 0,
  sinal_pct    REAL DEFAULT 0,
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_poldoc ON lv_politica_doc(tenant_id, de_centavos);

-- o que já foi documentado de cada reserva (Cap. 30, etapas 5 a 9)
CREATE TABLE IF NOT EXISTS lv_reserva_doc (
  reserva_id     TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  titular        TEXT DEFAULT '',
  identificacao_ok INTEGER DEFAULT 0,
  contrato_ok    INTEGER DEFAULT 0,
  caucao_centavos INTEGER DEFAULT 0,
  sinal_centavos INTEGER DEFAULT 0,
  saldo_vence_em TEXT DEFAULT '',
  saldo_recebido INTEGER DEFAULT 0,
  regras_aceitas_em TEXT DEFAULT '',
  confirmacao_enviada_em TEXT DEFAULT '',
  visitantes     INTEGER DEFAULT 0,
  finalidade     TEXT DEFAULT '',
  obs            TEXT DEFAULT '',
  atualizado_em  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lv_rdoc ON lv_reserva_doc(tenant_id);

-- ---- Cap. 7 + Apêndice E · POPs e checklists ----
CREATE TABLE IF NOT EXISTS lv_pops (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  chave      TEXT NOT NULL,      -- e1..e11
  titulo     TEXT NOT NULL,
  blocos     TEXT DEFAULT '[]',  -- JSON [{titulo,itens:[...]}]
  versao     INTEGER DEFAULT 1,
  atualizado_em TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lv_pop ON lv_pops(tenant_id, chave);

-- ---- Cap. 39 · catálogo de crises ----
CREATE TABLE IF NOT EXISTS lv_crises (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  chave      TEXT NOT NULL,
  titulo     TEXT NOT NULL,
  deteccao   TEXT DEFAULT '',
  quem_decide TEXT DEFAULT '',
  primeiras_2h TEXT DEFAULT '',
  o_que_dizer TEXT DEFAULT '',
  quem_paga  TEXT DEFAULT '',
  criado_em  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lv_crise ON lv_crises(tenant_id, chave);

-- ---- Apêndice A/B/C + Cap. 47/48 · biblioteca de prompts do livro ----
CREATE TABLE IF NOT EXISTS lv_prompts (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  chave      TEXT NOT NULL,
  area       TEXT DEFAULT 'operacao',
  capitulo   TEXT DEFAULT '',
  titulo     TEXT NOT NULL,
  corpo      TEXT NOT NULL,
  proprio    INTEGER DEFAULT 0,   -- 1 = escrito pelo assinante
  criado_em  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lv_prompt ON lv_prompts(tenant_id, chave);

-- ---- Cap. 8 · governança: trilha de auditoria do que a ONDA LIVRO escreve ----
CREATE TABLE IF NOT EXISTS lv_auditoria_dados (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  quem       TEXT DEFAULT '',
  acao       TEXT NOT NULL,
  entidade   TEXT DEFAULT '',
  entidade_id TEXT DEFAULT '',
  antes      TEXT DEFAULT '',
  depois     TEXT DEFAULT '',
  quando     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lv_audd ON lv_auditoria_dados(tenant_id, quando DESC);

-- matriz de permissões por papel (agente entra como se fosse pessoa, mais estreito)
CREATE TABLE IF NOT EXISTS lv_permissoes (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  papel       TEXT NOT NULL,      -- gestor|atendimento|operacao|financeiro|manutencao|contador|agente_*
  hospede     TEXT DEFAULT '',    -- ''|le|le_escreve
  operacao    TEXT DEFAULT '',
  financeiro  TEXT DEFAULT '',
  proprietario TEXT DEFAULT '',
  contratos   TEXT DEFAULT '',
  eh_agente   INTEGER DEFAULT 0,
  criado_em   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lv_perm ON lv_permissoes(tenant_id, papel);

-- marca de que o tenant já recebeu os seeds do livro (idempotência)
CREATE TABLE IF NOT EXISTS lv_seed (
  tenant_id  TEXT NOT NULL,
  chave      TEXT NOT NULL,
  quando     TEXT NOT NULL,
  PRIMARY KEY (tenant_id, chave)
);
