-- =====================================================================
-- Musique · por Villela Music (15º produto) — schema da FASE 0.
-- SQLite próprio em DATA_DIR/music/music.db. Escopo e porquês em
-- docs/music/ (repo-pai), decisões em docs/music/DECISIONS/.
--
-- REGRAS QUE ESTE SCHEMA CARREGA, e que não são detalhe:
--   • A identidade NÃO mora aqui (ADR-0001). O usuário é a conta da
--     Academia; aqui só existe a PROJEÇÃO musical dele.
--   • `organizacao_id` já existe em tudo que é conteúdo, mesmo sem
--     organizações na v1 (ADR-0002): multi-tenancy retroativo é caro,
--     a coluna é barata.
--   • Direitos e consentimento são tabelas de PRIMEIRA CLASSE, não
--     anexo — é o que sustenta a decisão Q2 (acervo privado).
--   • Áudio NÃO fica aqui nem no disco do Render: `midias` guarda a
--     chave no R2 (ADR-0003).
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  nome        TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL
);

-- ---- CONFIG da plataforma (chave→JSON; upsert idempotente) ----
CREATE TABLE IF NOT EXISTS config (
  chave         TEXT PRIMARY KEY,
  valor         TEXT NOT NULL DEFAULT '{}',
  atualizado_em TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------
-- PROJEÇÃO DO USUÁRIO (ADR-0001)
-- `academy_user_id` é a chave. Nunca há senha, e-mail nem papel aqui —
-- isso é da Academia. Duplicar identidade é como se criam duas verdades.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios_music (
  academy_user_id TEXT PRIMARY KEY,
  apelido         TEXT NOT NULL DEFAULT '',
  instrumentos    TEXT NOT NULL DEFAULT '[]',   -- JSON: ['violao','voz']
  nivel           TEXT NOT NULL DEFAULT '',     -- iniciante|intermediario|avancado
  extensao_vocal  TEXT NOT NULL DEFAULT '',     -- JSON {grave,agudo} em notas
  modo_interface  TEXT NOT NULL DEFAULT 'iniciante',
  calibracao      TEXT NOT NULL DEFAULT '{}',   -- JSON: microfone, ruído de fundo, latência medida
  preferencias    TEXT NOT NULL DEFAULT '{}',
  criado_em       TEXT NOT NULL DEFAULT '',
  atualizado_em   TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------
-- CONTEÚDO MUSICAL (núcleo simbólico)
-- ---------------------------------------------------------------------
-- `titularidade` rege TUDO que se pode fazer com a obra. O padrão é o
-- mais restritivo de propósito: quem sobe sem declarar, sobe como obra
-- de terceiro em acervo privado.
CREATE TABLE IF NOT EXISTS obras (
  id             TEXT PRIMARY KEY,
  dono           TEXT NOT NULL,                  -- academy_user_id
  organizacao_id TEXT NOT NULL DEFAULT '',
  titulo         TEXT NOT NULL,
  compositor     TEXT NOT NULL DEFAULT '',
  tom_original   TEXT NOT NULL DEFAULT '',
  andamento_bpm  INTEGER NOT NULL DEFAULT 0,
  compasso       TEXT NOT NULL DEFAULT '',
  -- propria | dominio_publico | licenciada | terceiro_privado
  titularidade   TEXT NOT NULL DEFAULT 'terceiro_privado',
  -- privada | compartilhada | publica
  visibilidade   TEXT NOT NULL DEFAULT 'privada',
  origem         TEXT NOT NULL DEFAULT 'upload',  -- upload|import|gerada
  tags           TEXT NOT NULL DEFAULT '[]',
  criado_em      TEXT NOT NULL DEFAULT '',
  atualizado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_obras_dono ON obras(dono);
CREATE INDEX IF NOT EXISTS ix_obras_visib ON obras(visibilidade, titularidade);

CREATE TABLE IF NOT EXISTS arranjos (
  id            TEXT PRIMARY KEY,
  obra_id       TEXT NOT NULL REFERENCES obras(id),
  nome          TEXT NOT NULL DEFAULT '',
  instrumentacao TEXT NOT NULL DEFAULT '[]',
  tom           TEXT NOT NULL DEFAULT '',
  dificuldade   TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_arranjos_obra ON arranjos(obra_id);

-- O corpo simbólico. `formato` decide o que dá para fazer:
-- chordpro/musicxml/midi transpõem e tocam; pdf é ANEXO, não partitura
-- editável (regra de produto, docs/music/ARCHITECTURE.md §5.1).
CREATE TABLE IF NOT EXISTS partituras (
  id          TEXT PRIMARY KEY,
  arranjo_id  TEXT NOT NULL REFERENCES arranjos(id),
  formato     TEXT NOT NULL,                  -- chordpro|musicxml|midi|pdf
  conteudo    TEXT NOT NULL DEFAULT '',       -- texto, quando simbólico
  media_id    TEXT NOT NULL DEFAULT '',       -- binário no R2, quando não
  versao      INTEGER NOT NULL DEFAULT 1,
  pai_versao  INTEGER NOT NULL DEFAULT 0,
  criado_por  TEXT NOT NULL DEFAULT '',
  criado_em   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_partituras_arranjo ON partituras(arranjo_id, versao);

-- ---------------------------------------------------------------------
-- MÍDIA (ADR-0003) — o byte mora no R2; aqui só o metadado e o estado.
-- `estado` existe para que falha NUNCA seja silêncio: a tela mostra
-- 'falhou' com `erro`, em vez de um arquivo que some.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS midias (
  id             TEXT PRIMARY KEY,
  dono           TEXT NOT NULL,
  organizacao_id TEXT NOT NULL DEFAULT '',
  chave          TEXT NOT NULL,                  -- caminho no bucket
  mime           TEXT NOT NULL DEFAULT '',
  bytes          INTEGER NOT NULL DEFAULT 0,
  duracao_ms     INTEGER NOT NULL DEFAULT 0,
  sha256         TEXT NOT NULL DEFAULT '',
  -- enviando | processando | pronta | falhou
  estado         TEXT NOT NULL DEFAULT 'enviando',
  erro           TEXT NOT NULL DEFAULT '',
  derivado_de    TEXT NOT NULL DEFAULT '',
  privada        INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL DEFAULT '',
  atualizado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_midias_dono ON midias(dono, estado);

-- ---------------------------------------------------------------------
-- FILA DURÁVEL (ADR-0003) — é uma tabela, de propósito: herda a
-- transação e o backup do banco. Entrega no MÍNIMO uma vez; handler
-- precisa ser idempotente. Esgotadas as tentativas vai para `dlq` —
-- nunca some, nunca gira para sempre.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id             TEXT PRIMARY KEY,
  fila           TEXT NOT NULL DEFAULT 'rapida',  -- rapida | cara
  tipo           TEXT NOT NULL,
  payload        TEXT NOT NULL DEFAULT '{}',
  prioridade     INTEGER NOT NULL DEFAULT 5,
  status         TEXT NOT NULL DEFAULT 'pendente', -- pendente|processando|concluido|dlq
  tentativas     INTEGER NOT NULL DEFAULT 0,
  max_tentativas INTEGER NOT NULL DEFAULT 5,
  proxima_em     TEXT NOT NULL DEFAULT '',
  chave_idem     TEXT NOT NULL DEFAULT '',
  dono           TEXT NOT NULL DEFAULT '',
  resultado      TEXT NOT NULL DEFAULT '',
  ultimo_erro    TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL DEFAULT '',
  iniciado_em    TEXT NOT NULL DEFAULT '',
  concluido_em   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_jobs_pendentes ON jobs(status, prioridade, criado_em);
-- Índice PARCIAL: a chave só é única quando existe. Sem o WHERE, todos os
-- jobs sem chave colidiriam entre si no '' .
CREATE UNIQUE INDEX IF NOT EXISTS ux_jobs_idem ON jobs(chave_idem) WHERE chave_idem <> '';

-- ---------------------------------------------------------------------
-- DIREITOS E CONSENTIMENTO — primeira classe (Q2, Q5, §12 do prompt)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS titularidades (
  id            TEXT PRIMARY KEY,
  obra_id       TEXT NOT NULL REFERENCES obras(id),
  declarada_por TEXT NOT NULL,                  -- academy_user_id
  tipo          TEXT NOT NULL,                  -- propria|dominio_publico|licenciada|terceiro_privado
  evidencia     TEXT NOT NULL DEFAULT '',       -- texto livre / referência de licença
  ip            TEXT NOT NULL DEFAULT '',
  declarada_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_titularidades_obra ON titularidades(obra_id);

-- Consentimento de voz e gravação. Sempre revogável; a revogação é um
-- fato datado, não a ausência de um registro.
CREATE TABLE IF NOT EXISTS consentimentos (
  id             TEXT PRIMARY KEY,
  usuario        TEXT NOT NULL,                 -- academy_user_id do titular da voz
  responsavel    TEXT NOT NULL DEFAULT '',      -- preenchido quando o titular é menor (LGPD art. 14)
  escopo         TEXT NOT NULL,                 -- ex.: voz.clonar_propria
  texto_versao   TEXT NOT NULL DEFAULT '',
  ip             TEXT NOT NULL DEFAULT '',
  concedido_em   TEXT NOT NULL DEFAULT '',
  expira_em      TEXT NOT NULL DEFAULT '',
  revogado_em    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_consentimentos_usuario ON consentimentos(usuario, escopo);

-- De onde veio cada artefato gerado. Sem isto não há como responder
-- "quem fez isso, com qual modelo, a que custo".
CREATE TABLE IF NOT EXISTS proveniencia (
  id             TEXT PRIMARY KEY,
  artefato_tipo  TEXT NOT NULL DEFAULT '',
  artefato_id    TEXT NOT NULL DEFAULT '',
  capability     TEXT NOT NULL DEFAULT '',
  provider       TEXT NOT NULL DEFAULT '',
  model          TEXT NOT NULL DEFAULT '',
  prompt_versao  TEXT NOT NULL DEFAULT '',
  entrada_resumo TEXT NOT NULL DEFAULT '',
  custo_centavos INTEGER NOT NULL DEFAULT 0,
  usuario        TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_proveniencia_artefato ON proveniencia(artefato_tipo, artefato_id);

-- ---------------------------------------------------------------------
-- AI ROUTER (ADR-0004) — provider e model são LINHAS, nunca código.
-- Trocar de fornecedor é UPDATE, não deploy. Capability sem linha ativa
-- não aparece na tela.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ia_providers (
  id                     TEXT PRIMARY KEY,
  capability             TEXT NOT NULL,
  provider               TEXT NOT NULL,
  model                  TEXT NOT NULL DEFAULT '',
  prioridade             INTEGER NOT NULL DEFAULT 5,
  ativo                  INTEGER NOT NULL DEFAULT 0,
  creditos               INTEGER NOT NULL DEFAULT 1,
  custo_estimado_centavos INTEGER NOT NULL DEFAULT 0,
  prompt_versao          TEXT NOT NULL DEFAULT '',
  observacao             TEXT NOT NULL DEFAULT '',
  atualizado_em          TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ia_prov ON ia_providers(capability, provider, model);

CREATE TABLE IF NOT EXISTS ia_usos (
  id             TEXT PRIMARY KEY,
  usuario        TEXT NOT NULL DEFAULT '',
  capability     TEXT NOT NULL DEFAULT '',
  provider       TEXT NOT NULL DEFAULT '',
  creditos       INTEGER NOT NULL DEFAULT 0,
  custo_centavos INTEGER NOT NULL DEFAULT 0,
  ok             INTEGER NOT NULL DEFAULT 1,
  erro           TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_ia_usos_usuario ON ia_usos(usuario, criado_em);

-- ---------------------------------------------------------------------
-- AUDITORIA — ator, ação, alvo, motivo. Toda ação sobre direito,
-- acesso, publicação ou consentimento passa por aqui.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id        TEXT PRIMARY KEY,
  ator      TEXT NOT NULL DEFAULT '',
  acao      TEXT NOT NULL,
  alvo      TEXT NOT NULL DEFAULT '',
  motivo    TEXT NOT NULL DEFAULT '',
  detalhe   TEXT NOT NULL DEFAULT '{}',
  ip        TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_auditoria_criado ON auditoria(criado_em);
