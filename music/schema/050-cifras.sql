-- =====================================================================
-- Musique CIFRAS (28/09/2026) — acervo, edição, versões, arranjos de
-- banda, setlists de palco, sessão ao vivo, importação e comunidade.
-- Decisões: docs/music/DECISIONS/ADR-0009 e ADR-0010.
--
-- A OBRA continua sendo `obras` (Fase 0): uma música tem N CIFRAS
-- (versões/transcrições), cada cifra tem N REVISÕES imutáveis e N
-- ARRANJOS (a leitura que uma banda faz dela), e cada pessoa tem a SUA
-- VISÃO (instrumento, tom pessoal, fonte) que não altera a dos outros.
--
-- ⚠️ O `schema/` roda ANTES das migrações: aqui só entra TABELA NOVA.
-- Coluna em tabela antiga vai por `garantirColuna` em db.js, e o índice
-- dela, por migração.
-- ⚠️ JSON só onde a flexibilidade se justifica — e o documento da cifra
-- só entra no banco depois de passar por `documento.validar()`.
-- =====================================================================

-- ---- CIFRA (ChartVersion) -------------------------------------------
CREATE TABLE IF NOT EXISTS cifras (
  id              TEXT PRIMARY KEY,
  obra_id         TEXT NOT NULL REFERENCES obras(id),
  nome            TEXT NOT NULL DEFAULT '',        -- "Versão acústica", "Cifra do Zé"
  tom             TEXT NOT NULL DEFAULT '',
  capo            INTEGER NOT NULL DEFAULT 0,
  afinacao        TEXT NOT NULL DEFAULT 'padrao',
  documento       TEXT NOT NULL,                   -- JSON validado (motor/documento.js)
  original        TEXT NOT NULL DEFAULT '',        -- a entrada como chegou (colada, arquivo)
  formato_original TEXT NOT NULL DEFAULT '',       -- texto | chordpro | docx | pdf | imagem | url | manual
  fonte_id        TEXT NOT NULL DEFAULT '',
  -- importada | comunitaria | revisada | verificada | rascunho
  status          TEXT NOT NULL DEFAULT 'importada',
  qualidade       INTEGER NOT NULL DEFAULT 0,      -- 0–100, calculada (cifras/qualidade.js)
  confianca       REAL NOT NULL DEFAULT 1,         -- confiança da EXTRAÇÃO, 0–1
  revisao_atual   INTEGER NOT NULL DEFAULT 1,
  versao          INTEGER NOT NULL DEFAULT 1,      -- trava otimista
  criado_por      TEXT NOT NULL,
  criado_em       TEXT NOT NULL DEFAULT '',
  atualizado_em   TEXT NOT NULL DEFAULT '',
  removido_em     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_cifras_obra ON cifras(obra_id, removido_em);
CREATE INDEX IF NOT EXISTS ix_cifras_autor ON cifras(criado_por, atualizado_em);

-- ---- REVISÃO (ChartRevision): imutável, numerada por cifra ----------
CREATE TABLE IF NOT EXISTS cifra_revisoes (
  id            TEXT PRIMARY KEY,
  cifra_id      TEXT NOT NULL REFERENCES cifras(id),
  numero        INTEGER NOT NULL,
  documento     TEXT NOT NULL,
  autor         TEXT NOT NULL,
  descricao     TEXT NOT NULL DEFAULT '',
  -- criacao | edicao | restauracao | importacao | fusao | transposicao | correcao
  tipo          TEXT NOT NULL DEFAULT 'edicao',
  resumo        TEXT NOT NULL DEFAULT '{}',      -- resumo do diff contra a anterior
  criado_em     TEXT NOT NULL DEFAULT '',
  UNIQUE (cifra_id, numero)
);

-- ---- RASCUNHO do editor (autosave), um por pessoa e cifra -----------
CREATE TABLE IF NOT EXISTS cifra_rascunhos (
  cifra_id       TEXT NOT NULL REFERENCES cifras(id),
  usuario        TEXT NOT NULL,
  documento      TEXT NOT NULL,
  base_revisao   INTEGER NOT NULL DEFAULT 0,
  atualizado_em  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (cifra_id, usuario)
);

-- ---- ARRANJO (Arrangement): a leitura de uma banda ------------------
-- Tom, capotraste, ordem das seções e notas da banda. Não copia a cifra:
-- aponta para ela, e por isso uma correção de acorde chega à banda.
CREATE TABLE IF NOT EXISTS cifra_arranjos (
  id            TEXT PRIMARY KEY,
  cifra_id      TEXT NOT NULL REFERENCES cifras(id),
  banda_id      TEXT NOT NULL DEFAULT '',        -- '' = arranjo pessoal
  nome          TEXT NOT NULL DEFAULT '',
  tom           TEXT NOT NULL DEFAULT '',
  capo          INTEGER NOT NULL DEFAULT 0,
  bpm           INTEGER NOT NULL DEFAULT 0,
  compasso      TEXT NOT NULL DEFAULT '',
  estrutura     TEXT NOT NULL DEFAULT '[]',      -- [{ secao_id, repetir }] — a ordem tocada
  notas_banda   TEXT NOT NULL DEFAULT '',
  vocalista     TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'rascunho', -- rascunho | em_revisao | aprovado
  aprovado_por  TEXT NOT NULL DEFAULT '',
  aprovado_em   TEXT NOT NULL DEFAULT '',
  versao        INTEGER NOT NULL DEFAULT 1,
  criado_por    TEXT NOT NULL,
  criado_em     TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT '',
  removido_em   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_arranjos_cifra ON cifra_arranjos(cifra_id, banda_id);
CREATE INDEX IF NOT EXISTS ix_arranjos_banda ON cifra_arranjos(banda_id, atualizado_em);

-- ---- VISÃO PESSOAL (ArrangementMemberView) --------------------------
-- O que é SÓ de quem lê: instrumento, tom pessoal, fonte, rolagem e
-- nota privada. Nunca altera o arranjo da banda.
CREATE TABLE IF NOT EXISTS cifra_visoes (
  usuario        TEXT NOT NULL,
  cifra_id       TEXT NOT NULL,
  arranjo_id     TEXT NOT NULL DEFAULT '',
  instrumento    TEXT NOT NULL DEFAULT '',
  afinacao       TEXT NOT NULL DEFAULT '',
  transposicao   INTEGER NOT NULL DEFAULT 0,     -- semitons SOBRE o tom do arranjo
  capo           INTEGER NOT NULL DEFAULT -1,    -- -1 = segue o arranjo
  simplificacao  INTEGER NOT NULL DEFAULT 0,
  exibicao       TEXT NOT NULL DEFAULT '{}',     -- fonte, tema, colunas, modo (validado)
  rolagem        TEXT NOT NULL DEFAULT '{}',     -- modo, velocidade, atraso, calibração
  notas_privadas TEXT NOT NULL DEFAULT '',
  atualizado_em  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, cifra_id, arranjo_id)
);

-- ---- PREFERÊNCIAS MUSICAIS globais (UserMusicPreference) ------------
CREATE TABLE IF NOT EXISTS preferencias_musicais (
  usuario        TEXT PRIMARY KEY,
  instrumento    TEXT NOT NULL DEFAULT 'violao',
  afinacao       TEXT NOT NULL DEFAULT 'padrao',
  canhoto        INTEGER NOT NULL DEFAULT 0,
  grafia         TEXT NOT NULL DEFAULT 'auto',      -- auto | sustenido | bemol
  notacao        TEXT NOT NULL DEFAULT 'internacional', -- internacional | latina
  estilo_acorde  TEXT NOT NULL DEFAULT 'original',  -- original | br | internacional
  exibicao       TEXT NOT NULL DEFAULT '{}',
  rolagem        TEXT NOT NULL DEFAULT '{}',
  atualizado_em  TEXT NOT NULL DEFAULT ''
);

-- ---- Voicing escolhido pelo usuário (ChordVoicing personalizado) ----
-- As formas são CALCULADAS (motor/instrumentos.js); aqui fica só a que
-- o músico fixou como "a minha" para um acorde.
CREATE TABLE IF NOT EXISTS voicings_usuario (
  usuario     TEXT NOT NULL,
  instrumento TEXT NOT NULL,
  afinacao    TEXT NOT NULL DEFAULT 'padrao',
  acorde      TEXT NOT NULL,
  casas       TEXT NOT NULL,                     -- JSON [int]
  criado_em   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, instrumento, afinacao, acorde)
);

-- ---- Pessoas (Artist/Composer), títulos alternativos e créditos -----
CREATE TABLE IF NOT EXISTS pessoas_musicais (
  id           TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,
  normalizado  TEXT NOT NULL,
  tipo         TEXT NOT NULL DEFAULT 'artista',   -- artista | banda | compositor
  criado_em    TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pessoas_norm ON pessoas_musicais(normalizado, tipo);

CREATE TABLE IF NOT EXISTS obra_creditos (
  obra_id   TEXT NOT NULL REFERENCES obras(id),
  pessoa_id TEXT NOT NULL REFERENCES pessoas_musicais(id),
  papel     TEXT NOT NULL DEFAULT 'artista',      -- artista | compositor | letrista | arranjador
  PRIMARY KEY (obra_id, pessoa_id, papel)
);
CREATE INDEX IF NOT EXISTS ix_creditos_pessoa ON obra_creditos(pessoa_id);

CREATE TABLE IF NOT EXISTS obra_aliases (
  id          TEXT PRIMARY KEY,
  obra_id     TEXT NOT NULL REFERENCES obras(id),
  titulo      TEXT NOT NULL,
  normalizado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_aliases_norm ON obra_aliases(normalizado);
CREATE INDEX IF NOT EXISTS ix_aliases_obra ON obra_aliases(obra_id);

-- ---- Mídia de referência (SongMedia) --------------------------------
CREATE TABLE IF NOT EXISTS obra_midias (
  id          TEXT PRIMARY KEY,
  obra_id     TEXT NOT NULL REFERENCES obras(id),
  tipo        TEXT NOT NULL DEFAULT 'audio',     -- audio | video | playback | stem
  titulo      TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',          -- vínculo externo (YouTube, Spotify...)
  media_id    TEXT NOT NULL DEFAULT '',          -- arquivo no R2 (tabela midias)
  marcadores  TEXT NOT NULL DEFAULT '[]',        -- [{ secao_id, inicio_ms }]
  offset_ms   INTEGER NOT NULL DEFAULT 0,
  criado_por  TEXT NOT NULL,
  criado_em   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_obra_midias ON obra_midias(obra_id);

-- ---- Procedência (SongSource) ---------------------------------------
-- Toda cifra importada guarda DE ONDE veio, QUANDO, COMO e com que
-- confiança. É o que permite responder "quem escreveu isto".
CREATE TABLE IF NOT EXISTS cifra_fontes (
  id            TEXT PRIMARY KEY,
  obra_id       TEXT NOT NULL DEFAULT '',
  tipo          TEXT NOT NULL,                   -- texto|arquivo|url|busca|manual|ocr|ia|lote
  url           TEXT NOT NULL DEFAULT '',
  adaptador     TEXT NOT NULL DEFAULT '',
  metodo        TEXT NOT NULL DEFAULT '',
  confianca     REAL NOT NULL DEFAULT 1,
  importado_por TEXT NOT NULL,
  importado_em  TEXT NOT NULL DEFAULT '',
  detalhe       TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_fontes_obra ON cifra_fontes(obra_id);

-- ---- Favoritos e uso (recentes / mais tocadas) ----------------------
CREATE TABLE IF NOT EXISTS favoritos (
  usuario    TEXT NOT NULL,
  alvo_tipo  TEXT NOT NULL,                      -- obra | cifra | setlist
  alvo_id    TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, alvo_tipo, alvo_id)
);
CREATE TABLE IF NOT EXISTS uso_cifras (
  usuario    TEXT NOT NULL,
  cifra_id   TEXT NOT NULL,
  vezes      INTEGER NOT NULL DEFAULT 0,
  ultima_em  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario, cifra_id)
);
CREATE INDEX IF NOT EXISTS ix_uso_recente ON uso_cifras(usuario, ultima_em);

-- ---- Banda: obras compartilhadas, convites, atividade ---------------
CREATE TABLE IF NOT EXISTS banda_obras (
  banda_id          TEXT NOT NULL,
  obra_id           TEXT NOT NULL REFERENCES obras(id),
  compartilhada_por TEXT NOT NULL,
  compartilhada_em  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (banda_id, obra_id)
);
CREATE INDEX IF NOT EXISTS ix_banda_obras_obra ON banda_obras(obra_id);

CREATE TABLE IF NOT EXISTS banda_convites (
  id          TEXT PRIMARY KEY,
  banda_id    TEXT NOT NULL,
  email       TEXT NOT NULL DEFAULT '',           -- vazio = convite por link/QR
  token_hash  TEXT NOT NULL,
  papel       TEXT NOT NULL DEFAULT 'musico',
  criado_por  TEXT NOT NULL,
  expira_em   TEXT NOT NULL,
  usos_max    INTEGER NOT NULL DEFAULT 1,
  usos        INTEGER NOT NULL DEFAULT 0,
  revogado_em TEXT NOT NULL DEFAULT '',
  criado_em   TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_convites_token ON banda_convites(token_hash);
CREATE INDEX IF NOT EXISTS ix_convites_banda ON banda_convites(banda_id);

CREATE TABLE IF NOT EXISTS banda_atividade (
  id         TEXT PRIMARY KEY,
  banda_id   TEXT NOT NULL,
  ator       TEXT NOT NULL,
  acao       TEXT NOT NULL,
  alvo       TEXT NOT NULL DEFAULT '',
  detalhe    TEXT NOT NULL DEFAULT '{}',
  criado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_banda_atividade ON banda_atividade(banda_id, criado_em);

-- ---- Setlist: blocos e histórico ------------------------------------
CREATE TABLE IF NOT EXISTS repertorio_blocos (
  id            TEXT PRIMARY KEY,
  repertorio_id TEXT NOT NULL REFERENCES repertorios(id),
  nome          TEXT NOT NULL DEFAULT '',
  tipo          TEXT NOT NULL DEFAULT 'ato',     -- ato | bis | intervalo
  ordem         INTEGER NOT NULL DEFAULT 0,
  duracao_s     INTEGER NOT NULL DEFAULT 0       -- intervalo tem duração própria
);
CREATE INDEX IF NOT EXISTS ix_blocos_rep ON repertorio_blocos(repertorio_id, ordem);

CREATE TABLE IF NOT EXISTS repertorio_historico (
  id            TEXT PRIMARY KEY,
  repertorio_id TEXT NOT NULL,
  autor         TEXT NOT NULL,
  acao          TEXT NOT NULL,
  detalhe       TEXT NOT NULL DEFAULT '{}',
  criado_em     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_rep_hist ON repertorio_historico(repertorio_id, criado_em);

-- ---- Sessão ao vivo / Modo Maestro ----------------------------------
CREATE TABLE IF NOT EXISTS sessoes_vivo (
  id            TEXT PRIMARY KEY,
  repertorio_id TEXT NOT NULL,
  banda_id      TEXT NOT NULL DEFAULT '',
  maestro       TEXT NOT NULL,
  codigo        TEXT NOT NULL,                   -- código curto para entrar (QR / digitado)
  estado        TEXT NOT NULL DEFAULT '{}',      -- item, seção, rolagem, contagem, tom
  seq           INTEGER NOT NULL DEFAULT 0,
  iniciada_em   TEXT NOT NULL DEFAULT '',
  encerrada_em  TEXT NOT NULL DEFAULT '',
  expira_em     TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sessao_codigo ON sessoes_vivo(codigo);

CREATE TABLE IF NOT EXISTS sessao_participantes (
  sessao_id   TEXT NOT NULL,
  usuario     TEXT NOT NULL,
  instrumento TEXT NOT NULL DEFAULT '',
  entrou_em   TEXT NOT NULL DEFAULT '',
  visto_em    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (sessao_id, usuario)
);

CREATE TABLE IF NOT EXISTS sessao_eventos (
  id         TEXT PRIMARY KEY,
  sessao_id  TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  tipo       TEXT NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  autor      TEXT NOT NULL,
  chave_idem TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT '',
  UNIQUE (sessao_id, chave_idem)
);
CREATE INDEX IF NOT EXISTS ix_sessao_eventos ON sessao_eventos(sessao_id, seq);

-- ---- Comentários, menções, notificações, tarefas --------------------
CREATE TABLE IF NOT EXISTS comentarios (
  id          TEXT PRIMARY KEY,
  alvo_tipo   TEXT NOT NULL,                     -- cifra | arranjo | setlist
  alvo_id     TEXT NOT NULL,
  ancora      TEXT NOT NULL DEFAULT '{}',        -- { secao_id, linha_id, acorde }
  pai_id      TEXT NOT NULL DEFAULT '',
  texto       TEXT NOT NULL,
  autor       TEXT NOT NULL,
  banda_id    TEXT NOT NULL DEFAULT '',          -- '' = nota privada do autor
  resolvido_em TEXT NOT NULL DEFAULT '',
  criado_em   TEXT NOT NULL DEFAULT '',
  removido_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_comentarios_alvo ON comentarios(alvo_tipo, alvo_id, criado_em);

CREATE TABLE IF NOT EXISTS notificacoes_musica (
  id         TEXT PRIMARY KEY,
  usuario    TEXT NOT NULL,
  tipo       TEXT NOT NULL,
  titulo     TEXT NOT NULL,
  link       TEXT NOT NULL DEFAULT '',
  lida_em    TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_notif_usuario ON notificacoes_musica(usuario, lida_em, criado_em);

CREATE TABLE IF NOT EXISTS tarefas_revisao (
  id           TEXT PRIMARY KEY,
  banda_id     TEXT NOT NULL,
  alvo_tipo    TEXT NOT NULL,
  alvo_id      TEXT NOT NULL,
  titulo       TEXT NOT NULL,
  responsavel  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'aberta',   -- aberta | feita | cancelada
  prazo        TEXT NOT NULL DEFAULT '',
  criado_por   TEXT NOT NULL,
  criado_em    TEXT NOT NULL DEFAULT '',
  concluido_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_tarefas_rev ON tarefas_revisao(banda_id, status);

-- ---- Links compartilhados (com expiração e revogação) ---------------
CREATE TABLE IF NOT EXISTS links_cifras (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL,
  alvo_tipo   TEXT NOT NULL,                     -- cifra | setlist
  alvo_id     TEXT NOT NULL,
  criado_por  TEXT NOT NULL,
  opcoes      TEXT NOT NULL DEFAULT '{}',        -- visão: instrumento, tom, notas, diagramas
  expira_em   TEXT NOT NULL DEFAULT '',
  revogado_em TEXT NOT NULL DEFAULT '',
  acessos     INTEGER NOT NULL DEFAULT 0,
  criado_em   TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_links_token ON links_cifras(token_hash);

-- ---- Pacote offline (registro do que está no aparelho) --------------
CREATE TABLE IF NOT EXISTS pacotes_offline (
  id         TEXT PRIMARY KEY,
  usuario    TEXT NOT NULL,
  alvo_tipo  TEXT NOT NULL,
  alvo_id    TEXT NOT NULL,
  hash       TEXT NOT NULL,
  bytes      INTEGER NOT NULL DEFAULT 0,
  itens      INTEGER NOT NULL DEFAULT 0,
  gerado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_pacotes_usuario ON pacotes_offline(usuario, gerado_em);

-- ---- Importação (ImportJob / ImportCandidate) -----------------------
CREATE TABLE IF NOT EXISTS importacoes (
  id              TEXT PRIMARY KEY,
  usuario         TEXT NOT NULL,
  lote_id         TEXT NOT NULL DEFAULT '',
  tipo_entrada    TEXT NOT NULL,                 -- texto|chordpro|arquivo|url|busca|imagem|lote|manual
  entrada_resumo  TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pendente', -- pendente|processando|pronta|falhou|salva|descartada
  progresso       INTEGER NOT NULL DEFAULT 0,
  erro            TEXT NOT NULL DEFAULT '',
  resultado       TEXT NOT NULL DEFAULT '{}',
  confianca       REAL NOT NULL DEFAULT 0,
  tentativas      INTEGER NOT NULL DEFAULT 0,
  obra_id         TEXT NOT NULL DEFAULT '',
  cifra_id        TEXT NOT NULL DEFAULT '',
  criado_em       TEXT NOT NULL DEFAULT '',
  atualizado_em   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_importacoes_usuario ON importacoes(usuario, criado_em);
CREATE INDEX IF NOT EXISTS ix_importacoes_status ON importacoes(status, atualizado_em);

CREATE TABLE IF NOT EXISTS importacao_candidatos (
  id             TEXT PRIMARY KEY,
  importacao_id  TEXT NOT NULL,
  fonte          TEXT NOT NULL,
  url            TEXT NOT NULL DEFAULT '',
  titulo         TEXT NOT NULL DEFAULT '',
  artista        TEXT NOT NULL DEFAULT '',
  documento      TEXT NOT NULL DEFAULT '',
  qualidade      INTEGER NOT NULL DEFAULT 0,
  confianca      REAL NOT NULL DEFAULT 0,
  ranking        TEXT NOT NULL DEFAULT '{}',
  criado_em      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_candidatos_imp ON importacao_candidatos(importacao_id);

-- ---- Exportação (registro) ------------------------------------------
CREATE TABLE IF NOT EXISTS exportacoes_cifras (
  id         TEXT PRIMARY KEY,
  usuario    TEXT NOT NULL,
  alvo_tipo  TEXT NOT NULL,
  alvo_id    TEXT NOT NULL,
  formato    TEXT NOT NULL,
  opcoes     TEXT NOT NULL DEFAULT '{}',
  criado_em  TEXT NOT NULL DEFAULT ''
);

-- ---- Prática (histórico e progresso por cifra) ----------------------
CREATE TABLE IF NOT EXISTS pratica_cifras (
  id         TEXT PRIMARY KEY,
  usuario    TEXT NOT NULL,
  cifra_id   TEXT NOT NULL,
  duracao_s  INTEGER NOT NULL DEFAULT 0,
  bpm        INTEGER NOT NULL DEFAULT 0,
  velocidade REAL NOT NULL DEFAULT 1,
  loop       TEXT NOT NULL DEFAULT '{}',
  ocultacao  INTEGER NOT NULL DEFAULT 0,          -- nível de memorização (0–3)
  notas      TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_pratica_cifras ON pratica_cifras(usuario, cifra_id, criado_em);

-- ---- Comunidade: avaliação, proposta de correção, denúncia ----------
CREATE TABLE IF NOT EXISTS avaliacoes_cifra (
  cifra_id   TEXT NOT NULL,
  usuario    TEXT NOT NULL,
  precisao   INTEGER NOT NULL,                    -- 1–5
  facilidade INTEGER NOT NULL,                    -- 1–5
  comentario TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (cifra_id, usuario)
);
CREATE TABLE IF NOT EXISTS propostas_correcao (
  id            TEXT PRIMARY KEY,
  cifra_id      TEXT NOT NULL,
  autor         TEXT NOT NULL,
  base_revisao  INTEGER NOT NULL,
  documento     TEXT NOT NULL,
  descricao     TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'aberta',  -- aberta | aceita | recusada
  revisado_por  TEXT NOT NULL DEFAULT '',
  revisado_em   TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_propostas ON propostas_correcao(cifra_id, status);
CREATE TABLE IF NOT EXISTS denuncias_cifras (
  id           TEXT PRIMARY KEY,
  alvo_tipo    TEXT NOT NULL,
  alvo_id      TEXT NOT NULL,
  autor        TEXT NOT NULL,
  motivo       TEXT NOT NULL,
  trecho       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'aberta',   -- aberta | procedente | improcedente
  resolvido_por TEXT NOT NULL DEFAULT '',
  resolvido_em TEXT NOT NULL DEFAULT '',
  criado_em    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_denuncias ON denuncias_cifras(status, criado_em);

-- ---- Feature flags do módulo ----------------------------------------
CREATE TABLE IF NOT EXISTS cifras_flags (
  chave          TEXT PRIMARY KEY,
  ligado         INTEGER NOT NULL DEFAULT 0,
  descricao      TEXT NOT NULL DEFAULT '',
  atualizado_por TEXT NOT NULL DEFAULT '',
  atualizado_em  TEXT NOT NULL DEFAULT ''
);
