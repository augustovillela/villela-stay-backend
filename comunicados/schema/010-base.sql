-- =====================================================================
-- Comunicados — schema. SQLite próprio em DATA_DIR/comunicados/.
--
-- A central NÃO guarda a base de usuários de ninguém: quem sabe quem é
-- aluno, assinante ou produtor é cada produto (fontes.js lê na hora).
-- Aqui fica só o que foi DITO, a QUEM e o que aconteceu com cada envio.
--
-- REGRAS QUE ESTE SCHEMA CARREGA:
--   • `entregas` tem UNIQUE por (comunicado, canal, chave). É isso que
--     impede a mesma pessoa de receber duas vezes o mesmo e-mail quando
--     ela é aluna da Academy E usuária da Musique (mesma conta), ou quando
--     o envio é retomado depois de um reinício do servidor.
--   • O público é CONGELADO no envio (as entregas são materializadas).
--     Quem se cadastra depois não recebe um e-mail de ontem.
--   • Descadastro é por CONTATO (e-mail ou telefone), não por conta: é o
--     contato que reclama do spam, e a mesma pessoa tem conta em vários
--     produtos.
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  nome        TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comunicados (
  id             TEXT PRIMARY KEY,
  titulo         TEXT NOT NULL,
  corpo          TEXT NOT NULL,              -- texto simples; parágrafos por linha em branco
  categoria      TEXT NOT NULL,              -- novidade|melhoria|dica|instabilidade|manutencao|suporte|resolvido
  alvos          TEXT NOT NULL DEFAULT '[]', -- JSON [{produto, segmento}]
  canais         TEXT NOT NULL DEFAULT '[]', -- JSON ["app","email","whatsapp"]
  link_url       TEXT,
  link_rotulo    TEXT,
  destaque       INTEGER NOT NULL DEFAULT 0, -- 1 = faixa no topo do app (instabilidade)
  expira_em      TEXT,                       -- some do app depois disso
  status         TEXT NOT NULL DEFAULT 'rascunho', -- rascunho|agendado|enviando|enviado|cancelado|arquivado
  agendado_para  TEXT,
  criado_por     TEXT,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL,
  enviado_por    TEXT,
  enviado_em     TEXT,
  concluido_em   TEXT,
  publico_total  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_com_status ON comunicados(status);

-- Uma linha por (comunicado, canal, destinatário). `chave` é o que
-- deduplica: e-mail normalizado, telefone só dígitos, ou produto:id
-- no canal do app.
CREATE TABLE IF NOT EXISTS entregas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  comunicado_id  TEXT NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
  canal          TEXT NOT NULL,              -- app|email|whatsapp
  chave          TEXT NOT NULL,
  produto        TEXT NOT NULL,
  usuario_ref    TEXT NOT NULL,              -- id do usuário no produto
  nome           TEXT,
  destino        TEXT,                       -- e-mail / telefone (vazio no app)
  status         TEXT NOT NULL DEFAULT 'pendente', -- pendente|enviado|erro|pulado|disponivel|lido
  motivo         TEXT,
  tentativas     INTEGER NOT NULL DEFAULT 0,
  atualizado_em  TEXT NOT NULL,
  UNIQUE (comunicado_id, canal, chave)
);
CREATE INDEX IF NOT EXISTS ix_ent_fila ON entregas(status, canal);
CREATE INDEX IF NOT EXISTS ix_ent_caixa ON entregas(canal, produto, usuario_ref);

-- Leitura no app de comunicados enviados para "todos" (que não geram
-- linha em `entregas` por usuário — ver fontes.js / caixaDoUsuario).
CREATE TABLE IF NOT EXISTS leituras (
  comunicado_id  TEXT NOT NULL,
  produto        TEXT NOT NULL,
  usuario_ref    TEXT NOT NULL,
  lido_em        TEXT NOT NULL,
  PRIMARY KEY (comunicado_id, produto, usuario_ref)
);

-- Descadastro. `escopo` = 'avisos' (novidades, melhorias, dicas) ou
-- 'tudo'. Aviso operacional (instabilidade, manutenção, suporte) só é
-- barrado por 'tudo' — quem paga pelo sistema precisa saber que ele caiu.
CREATE TABLE IF NOT EXISTS descadastros (
  contato    TEXT NOT NULL,                  -- e-mail normalizado ou telefone só dígitos
  canal      TEXT NOT NULL,                  -- email|whatsapp
  escopo     TEXT NOT NULL DEFAULT 'avisos',
  origem     TEXT,
  criado_em  TEXT NOT NULL,
  PRIMARY KEY (contato, canal)
);
