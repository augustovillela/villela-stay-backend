-- =====================================================================
-- Musique — FASE 2: biblioteca do músico, repertório, banda e palco.
--
-- A biblioteca é PRIVADA por decisão (Q2): o que existe aqui é o acervo
-- de cada um. Toda leitura continua passando por `direitos.js`, que é a
-- única autoridade sobre o que pode ser visto, publicado ou enviado a IA.
-- =====================================================================

-- ---- PASTAS: a organização que o músico já tem na cabeça ----
-- Hierárquicas porque é assim que o repertório de quem toca fora se
-- organiza: "Bar do Zé" > "primeira parte".
CREATE TABLE IF NOT EXISTS pastas (
  id        TEXT PRIMARY KEY,
  dono      TEXT NOT NULL,
  nome      TEXT NOT NULL,
  pai_id    TEXT NOT NULL DEFAULT '',
  ordem     INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_pastas_dono ON pastas(dono, pai_id, ordem);

-- ---- ANOTAÇÕES do músico sobre um arranjo ----
-- Dedilhado, respiração, "aqui entra o sax", "cuidado com o 2º refrão".
-- Separadas da partitura de propósito: a partitura pode ganhar versão
-- nova, e a anotação de palco não deveria morrer junto.
CREATE TABLE IF NOT EXISTS anotacoes (
  id         TEXT PRIMARY KEY,
  arranjo_id TEXT NOT NULL REFERENCES arranjos(id),
  usuario    TEXT NOT NULL,
  ancora     TEXT NOT NULL DEFAULT '',      -- ex.: "compasso 12" ou "refrão"
  texto      TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_anotacoes_arranjo ON anotacoes(arranjo_id, criado_em);

-- ---- BANDAS ----
-- Grupo de pessoas que compartilha repertório. Não é organização (isso é
-- Fase 3, com assentos e contrato): é o conjunto informal de quem toca
-- junto, que é o que existe de verdade em bar, igreja e casamento.
CREATE TABLE IF NOT EXISTS bandas (
  id        TEXT PRIMARY KEY,
  dono      TEXT NOT NULL,
  nome      TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_bandas_dono ON bandas(dono);

CREATE TABLE IF NOT EXISTS banda_membros (
  banda_id     TEXT NOT NULL REFERENCES bandas(id),
  usuario      TEXT NOT NULL,
  papel        TEXT NOT NULL DEFAULT 'integrante',  -- dono | integrante
  instrumento  TEXT NOT NULL DEFAULT '',
  entrou_em    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (banda_id, usuario)
);
CREATE INDEX IF NOT EXISTS ix_banda_membros_usuario ON banda_membros(usuario);

-- ---- REPERTÓRIOS E SETLISTS ----
-- `banda_id` vazio = repertório pessoal. Com banda, todo integrante vê.
CREATE TABLE IF NOT EXISTS repertorios (
  id         TEXT PRIMARY KEY,
  dono       TEXT NOT NULL,
  banda_id   TEXT NOT NULL DEFAULT '',
  nome       TEXT NOT NULL,
  descricao  TEXT NOT NULL DEFAULT '',
  ocasiao    TEXT NOT NULL DEFAULT '',        -- bar, casamento, culto, ensaio...
  data       TEXT NOT NULL DEFAULT '',
  criado_em  TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_repertorios_dono ON repertorios(dono, atualizado_em);
CREATE INDEX IF NOT EXISTS ix_repertorios_banda ON repertorios(banda_id);

-- O item guarda o TOM DE EXECUÇÃO e o CAPOTRASTE daquela apresentação —
-- não da obra. A mesma música vai em tons diferentes conforme quem canta,
-- e gravar isso na obra apagaria a versão do outro cantor.
CREATE TABLE IF NOT EXISTS repertorio_itens (
  id             TEXT PRIMARY KEY,
  repertorio_id  TEXT NOT NULL REFERENCES repertorios(id),
  obra_id        TEXT NOT NULL DEFAULT '',
  arranjo_id     TEXT NOT NULL DEFAULT '',
  titulo_livre   TEXT NOT NULL DEFAULT '',    -- item que não está no acervo (intervalo, fala)
  ordem          INTEGER NOT NULL DEFAULT 0,
  tom_execucao   TEXT NOT NULL DEFAULT '',
  capotraste     INTEGER NOT NULL DEFAULT 0,
  duracao_s      INTEGER NOT NULL DEFAULT 0,
  duracao_estimada INTEGER NOT NULL DEFAULT 0, -- 1 = o número acima é ESTIMATIVA
  nota_palco     TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_repertorio_itens ON repertorio_itens(repertorio_id, ordem);
