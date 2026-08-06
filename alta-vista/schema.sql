-- =====================================================================
-- Villela Alta Vista 360 — schema (Onda 1: catálogo, conteúdo público e leads).
-- Dinheiro SEMPRE em centavos (INTEGER). Datas em ISO-8601 (TEXT).
-- =====================================================================

CREATE TABLE IF NOT EXISTS migrations (
  nome        TEXT PRIMARY KEY,
  aplicada_em TEXT NOT NULL
);

-- Configuração da plataforma (chave/valor editável na aba do staff)
CREATE TABLE IF NOT EXISTS config (
  chave         TEXT PRIMARY KEY,
  valor         TEXT NOT NULL DEFAULT '',
  descricao     TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT ''
);

-- Catálogo: os 4 serviços e seus planos/adicionais. Preço vive AQUI, nunca
-- fixado na interface (critério de aceite nº 9 da spec).
CREATE TABLE IF NOT EXISTS servicos (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  nome           TEXT NOT NULL,
  categoria      TEXT NOT NULL,                    -- video_ia | drone | foto360 | tour | hospedagem | adicional
  resumo         TEXT NOT NULL DEFAULT '',         -- 1 linha para a tabela de preços
  entrega        TEXT NOT NULL DEFAULT '',         -- o que está incluído
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  preco_apartir  INTEGER NOT NULL DEFAULT 0,       -- 1 = "a partir de"
  unidade        TEXT NOT NULL DEFAULT 'projeto',  -- projeto | ponto | mes | ano
  prazo          TEXT NOT NULL DEFAULT '',
  revisoes       INTEGER NOT NULL DEFAULT 1,
  ativo          INTEGER NOT NULL DEFAULT 1,
  ordem          INTEGER NOT NULL DEFAULT 100,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS combos (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  nome           TEXT NOT NULL,
  resumo         TEXT NOT NULL DEFAULT '',
  itens          TEXT NOT NULL DEFAULT '[]',       -- JSON: linhas do que está incluído
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  preco_apartir  INTEGER NOT NULL DEFAULT 0,
  destaque       INTEGER NOT NULL DEFAULT 0,       -- 1 = recomendado na home/preços
  ativo          INTEGER NOT NULL DEFAULT 1,
  ordem          INTEGER NOT NULL DEFAULT 100,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL DEFAULT ''
);

-- Portfólio. conceitual=1 exibe SEMPRE o aviso obrigatório; virar caso real
-- (conceitual=0) exige consentimento registrado — regra aplicada no repo.
CREATE TABLE IF NOT EXISTS portfolio (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  titulo        TEXT NOT NULL,
  tipo_imovel   TEXT NOT NULL DEFAULT '',
  cidade        TEXT NOT NULL DEFAULT 'Brasília · DF',
  resumo        TEXT NOT NULL DEFAULT '',
  corpo         TEXT NOT NULL DEFAULT '',
  servicos      TEXT NOT NULL DEFAULT '[]',        -- JSON: slugs dos serviços demonstrados
  conceitual    INTEGER NOT NULL DEFAULT 1,
  consentimento TEXT NOT NULL DEFAULT '',          -- JSON {autorizado_por, data, escopo} quando real
  capa_url      TEXT NOT NULL DEFAULT '',
  publicado     INTEGER NOT NULL DEFAULT 1,
  ordem         INTEGER NOT NULL DEFAULT 100,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS faqs (
  id        TEXT PRIMARY KEY,
  pergunta  TEXT NOT NULL,
  resposta  TEXT NOT NULL,
  ordem     INTEGER NOT NULL DEFAULT 100,
  publicado INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);

-- Conteúdos (/alta-vista/conteudos — SEO de longo prazo)
CREATE TABLE IF NOT EXISTS conteudos (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  titulo        TEXT NOT NULL,
  resumo        TEXT NOT NULL DEFAULT '',
  corpo         TEXT NOT NULL DEFAULT '',          -- HTML simples
  status        TEXT NOT NULL DEFAULT 'rascunho',  -- rascunho | publicado
  publicado_em  TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);

-- Leads do orçamento/recomendador (Onda 2: funil completo)
CREATE TABLE IF NOT EXISTS leads (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  whatsapp      TEXT NOT NULL DEFAULT '',
  cidade        TEXT NOT NULL DEFAULT '',
  tipo_imovel   TEXT NOT NULL DEFAULT '',
  finalidade    TEXT NOT NULL DEFAULT '',
  interesses    TEXT NOT NULL DEFAULT '[]',        -- JSON: slugs de serviço/combo
  mensagem      TEXT NOT NULL DEFAULT '',
  origem        TEXT NOT NULL DEFAULT '',          -- página de origem
  utm           TEXT NOT NULL DEFAULT '{}',        -- JSON: utm_source/medium/campaign + referrer
  consentimento INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'novo',      -- novo | em_contato | proposta | ganho | perdido
  nota          TEXT NOT NULL DEFAULT '',
  respostas     TEXT NOT NULL DEFAULT '',          -- JSON: respostas completas do recomendador
  recomendacao  TEXT NOT NULL DEFAULT '',          -- JSON: pacote recomendado + motivos + preço-base
  pontuacao     INTEGER NOT NULL DEFAULT 0,        -- 0–10, calculada no servidor
  responsavel   TEXT NOT NULL DEFAULT '',
  proxima_acao  TEXT NOT NULL DEFAULT '',
  motivo_perda  TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status, criado_em);

-- Propostas comerciais. Itens são SNAPSHOT do catálogo no momento da criação:
-- editar preço depois NÃO muda proposta já emitida. Aceite formal registra
-- nome, IP, data e a VERSÃO dos termos vigente.
CREATE TABLE IF NOT EXISTS propostas (
  id             TEXT PRIMARY KEY,
  token          TEXT NOT NULL UNIQUE,             -- link público /alta-vista/proposta/<token>
  lead_id        TEXT NOT NULL,
  itens          TEXT NOT NULL DEFAULT '[]',       -- JSON: [{slug, nome, preco_centavos, qtd}]
  subtotal_centavos INTEGER NOT NULL DEFAULT 0,
  desconto_pct   INTEGER NOT NULL DEFAULT 0,
  motivo_desconto TEXT NOT NULL DEFAULT '',        -- ex.: Clientes Fundadores (autorização de portfólio)
  total_centavos INTEGER NOT NULL DEFAULT 0,
  validade_dias  INTEGER NOT NULL DEFAULT 7,
  nota           TEXT NOT NULL DEFAULT '',         -- observações visíveis ao cliente
  status         TEXT NOT NULL DEFAULT 'rascunho', -- rascunho | enviada | aceita | recusada | expirada
  enviada_em     TEXT NOT NULL DEFAULT '',
  aceite         TEXT NOT NULL DEFAULT '',         -- JSON: {nome, ip, em, termos_versao}
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_propostas_lead ON propostas (lead_id, criado_em);

-- Interações do CRM (histórico do relacionamento)
CREATE TABLE IF NOT EXISTS interacoes (
  id        TEXT PRIMARY KEY,
  lead_id   TEXT NOT NULL,
  tipo      TEXT NOT NULL DEFAULT 'nota',          -- nota | whatsapp | email | ligacao | sistema
  texto     TEXT NOT NULL DEFAULT '',
  quem      TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interacoes_lead ON interacoes (lead_id, criado_em);

-- Tarefas/lembretes do funil
CREATE TABLE IF NOT EXISTS tarefas (
  id        TEXT PRIMARY KEY,
  lead_id   TEXT NOT NULL DEFAULT '',
  texto     TEXT NOT NULL,
  vence_em  TEXT NOT NULL DEFAULT '',              -- ISO date
  feita     INTEGER NOT NULL DEFAULT 0,
  quem      TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  feita_em  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tarefas_pend ON tarefas (feita, vence_em);

-- ===================== Onda 3: cliente, imóveis e projetos =====================

-- Contas do cliente final (cookie av_sess, path /alta-vista)
CREATE TABLE IF NOT EXISTS clientes (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  senha_hash    TEXT NOT NULL DEFAULT '',          -- vazio = convite pendente (define pela recuperação)
  whatsapp      TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'ativo',     -- ativo | bloqueado | excluido
  aceite_termos TEXT NOT NULL DEFAULT '',          -- versão dos termos aceita no cadastro
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);

-- Imóveis do cliente. ENDEREÇO É PRIVADO: nunca aparece em página pública,
-- tour ou portfólio sem decisão expressa (spec §7.2 + LGPD).
CREATE TABLE IF NOT EXISTS imoveis (
  id            TEXT PRIMARY KEY,
  cliente_id    TEXT NOT NULL,
  nome          TEXT NOT NULL,                     -- nome interno ("Casa do Lago")
  tipo          TEXT NOT NULL DEFAULT '',
  finalidade    TEXT NOT NULL DEFAULT '',
  endereco      TEXT NOT NULL DEFAULT '',          -- PRIVADO
  cidade        TEXT NOT NULL DEFAULT '',
  area_m2       TEXT NOT NULL DEFAULT '',
  ambientes     INTEGER NOT NULL DEFAULT 0,
  plataformas   TEXT NOT NULL DEFAULT '[]',        -- JSON: [{nome, link}]
  acesso        TEXT NOT NULL DEFAULT '',          -- instruções de acesso (PRIVADO)
  contato_local TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_imoveis_cliente ON imoveis (cliente_id);

-- Projetos: a máquina de estados da spec (18 status; transições validadas no repo)
CREATE TABLE IF NOT EXISTS projetos (
  id            TEXT PRIMARY KEY,
  cliente_id    TEXT NOT NULL,
  imovel_id     TEXT NOT NULL DEFAULT '',
  lead_id       TEXT NOT NULL DEFAULT '',
  proposta_id   TEXT NOT NULL DEFAULT '',
  titulo        TEXT NOT NULL,
  itens         TEXT NOT NULL DEFAULT '[]',        -- JSON snapshot dos serviços contratados
  total_centavos INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'awaiting_payment',
  responsavel   TEXT NOT NULL DEFAULT '',
  prazo_em      TEXT NOT NULL DEFAULT '',          -- data-alvo de entrega
  agenda_em     TEXT NOT NULL DEFAULT '',          -- data/hora da captação
  briefing      TEXT NOT NULL DEFAULT '',          -- JSON preenchido pelo cliente
  briefing_em   TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_projetos_cliente ON projetos (cliente_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_projetos_status ON projetos (status);

-- Trilha de transições de status (autor, data e justificativa — spec §11)
CREATE TABLE IF NOT EXISTS projeto_eventos (
  id            TEXT PRIMARY KEY,
  projeto_id    TEXT NOT NULL,
  de            TEXT NOT NULL DEFAULT '',
  para          TEXT NOT NULL,
  quem          TEXT NOT NULL DEFAULT '',
  justificativa TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projeto_eventos ON projeto_eventos (projeto_id, criado_em);

-- Mensagens do projeto (cliente ↔ equipe)
CREATE TABLE IF NOT EXISTS mensagens (
  id         TEXT PRIMARY KEY,
  projeto_id TEXT NOT NULL,
  autor      TEXT NOT NULL,                        -- cliente | equipe
  autor_nome TEXT NOT NULL DEFAULT '',
  texto      TEXT NOT NULL,
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mensagens_projeto ON mensagens (projeto_id, criado_em);

-- ===================== Onda 4: pagamentos e financeiro =====================

-- Parcelas de cobrança do projeto. Regra comercial (spec §4.3):
-- remoto = integral antecipado · presencial ≤ R$ 1.000 = integral na reserva ·
-- acima = 50% na reserva + 50% antes da liberação final.
CREATE TABLE IF NOT EXISTS parcelas (
  id               TEXT PRIMARY KEY,
  projeto_id       TEXT NOT NULL,
  cliente_id       TEXT NOT NULL,
  rotulo           TEXT NOT NULL,                  -- "Sinal (50%)" | "Saldo final (50%)" | "Pagamento integral"
  ordem            INTEGER NOT NULL DEFAULT 1,
  valor_centavos   INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendente', -- pendente | aguardando | aprovado | rejeitado | cancelado | reembolsado | contestado
  mp_preference_id TEXT NOT NULL DEFAULT '',
  mp_init_point    TEXT NOT NULL DEFAULT '',
  mp_payment_id    TEXT NOT NULL DEFAULT '',
  pago_em          TEXT NOT NULL DEFAULT '',
  pago_via         TEXT NOT NULL DEFAULT '',       -- mercadopago | manual
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_parcelas_projeto ON parcelas (projeto_id, ordem);
CREATE INDEX IF NOT EXISTS idx_parcelas_status ON parcelas (status);

-- Trilha de eventos de pagamento (idempotência do webhook + auditoria financeira)
CREATE TABLE IF NOT EXISTS pagamento_eventos (
  id            TEXT PRIMARY KEY,
  parcela_id    TEXT NOT NULL DEFAULT '',
  mp_payment_id TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT '',
  detalhe       TEXT NOT NULL DEFAULT '',          -- payload mínimo necessário
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pg_eventos_pay ON pagamento_eventos (mp_payment_id, status);

-- Despesas manuais (financeiro gerencial: custo e margem por projeto)
CREATE TABLE IF NOT EXISTS despesas (
  id             TEXT PRIMARY KEY,
  projeto_id     TEXT NOT NULL DEFAULT '',         -- vazio = despesa geral do estúdio
  categoria      TEXT NOT NULL DEFAULT 'outros',   -- equipamento | deslocamento | software | terceiros | outros
  descricao      TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL,
  data           TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_despesas_projeto ON despesas (projeto_id, data);

-- ===================== Onda 5: arquivos, versões, revisão e entrega =====================

-- Entregáveis do projeto (ex.: "Vídeo vertical 45s", "Tour 360°"). Privados por padrão.
CREATE TABLE IF NOT EXISTS entregas (
  id           TEXT PRIMARY KEY,
  projeto_id   TEXT NOT NULL,
  titulo       TEXT NOT NULL,
  tipo         TEXT NOT NULL DEFAULT 'video',      -- video | foto | panorama | outro
  status       TEXT NOT NULL DEFAULT 'em_revisao', -- em_revisao | aprovada
  aprovada_em  TEXT NOT NULL DEFAULT '',
  aprovada_por TEXT NOT NULL DEFAULT '',
  criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entregas_projeto ON entregas (projeto_id);

-- Versões de cada entregável (histórico completo; a mais alta é a atual)
CREATE TABLE IF NOT EXISTS entrega_versoes (
  id            TEXT PRIMARY KEY,
  entrega_id    TEXT NOT NULL,
  numero        INTEGER NOT NULL,
  chave         TEXT NOT NULL,                     -- chave no storage
  mime          TEXT NOT NULL DEFAULT '',
  tamanho_bytes INTEGER NOT NULL DEFAULT 0,
  nota          TEXT NOT NULL DEFAULT '',          -- o que mudou nesta versão
  autor         TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versoes_entrega ON entrega_versoes (entrega_id, numero);

-- Comentários de revisão, ancorados: {"t": segundos} em vídeo, {"x","y"} (0–100%) em imagem
CREATE TABLE IF NOT EXISTS comentarios (
  id         TEXT PRIMARY KEY,
  versao_id  TEXT NOT NULL,
  autor      TEXT NOT NULL,                        -- cliente | equipe
  autor_nome TEXT NOT NULL DEFAULT '',
  texto      TEXT NOT NULL,
  ancora     TEXT NOT NULL DEFAULT '',             -- JSON
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comentarios_versao ON comentarios (versao_id, criado_em);

-- Materiais enviados PELO CLIENTE (fotos para vídeo IA, panoramas próprios, referências)
CREATE TABLE IF NOT EXISTS materiais (
  id            TEXT PRIMARY KEY,
  projeto_id    TEXT NOT NULL,
  cliente_id    TEXT NOT NULL,
  nome          TEXT NOT NULL,
  chave         TEXT NOT NULL,
  mime          TEXT NOT NULL DEFAULT '',
  tamanho_bytes INTEGER NOT NULL DEFAULT 0,
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materiais_projeto ON materiais (projeto_id);

-- Registro de download da entrega final (quem, quando, de onde)
CREATE TABLE IF NOT EXISTS downloads (
  id        TEXT PRIMARY KEY,
  versao_id TEXT NOT NULL,
  quem      TEXT NOT NULL DEFAULT '',
  ip        TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL
);

-- Uploads pendentes (o upload-url emite; o confirmar valida e consome)
CREATE TABLE IF NOT EXISTS uploads_pendentes (
  id         TEXT PRIMARY KEY,
  chave      TEXT NOT NULL,
  mime       TEXT NOT NULL DEFAULT '',
  contexto   TEXT NOT NULL DEFAULT '',             -- JSON: {tipo:'versao'|'material', ...}
  criado_em  TEXT NOT NULL
);

-- ===================== Onda 6: tours virtuais 360° =====================

-- Tour do cliente. Endereço exato NUNCA aparece aqui (spec §6) — só título e marca.
CREATE TABLE IF NOT EXISTS tours (
  id            TEXT PRIMARY KEY,
  cliente_id    TEXT NOT NULL,
  projeto_id    TEXT NOT NULL DEFAULT '',          -- a renovação cobra por aqui
  slug          TEXT NOT NULL UNIQUE,
  titulo        TEXT NOT NULL,
  marca_nome    TEXT NOT NULL DEFAULT '',          -- identidade do cliente no viewer
  marca_cor     TEXT NOT NULL DEFAULT '#0E7490',
  contato_url   TEXT NOT NULL DEFAULT '',          -- CTA "reservar/falar" (link do cliente)
  visibilidade  TEXT NOT NULL DEFAULT 'publico',   -- publico | nao_listado | senha
  senha_hash    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'rascunho',  -- rascunho | publicado
  cena_inicial  TEXT NOT NULL DEFAULT '',
  preview_token TEXT NOT NULL DEFAULT '',
  expira_em     TEXT NOT NULL DEFAULT '',          -- '' = sem expiração definida
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tour_cenas (
  id        TEXT PRIMARY KEY,
  tour_id   TEXT NOT NULL,
  ordem     INTEGER NOT NULL DEFAULT 100,          -- a ordem é o roteiro da visita
  titulo    TEXT NOT NULL,
  chave     TEXT NOT NULL,                         -- panorama no storage
  yaw       REAL NOT NULL DEFAULT 0,
  pitch     REAL NOT NULL DEFAULT 0,
  fov       REAL NOT NULL DEFAULT 75,
  hub       INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tour_cenas ON tour_cenas (tour_id, ordem);

CREATE TABLE IF NOT EXISTS tour_hotspots (
  id              TEXT PRIMARY KEY,
  tour_id         TEXT NOT NULL,
  cena_id         TEXT NOT NULL,
  yaw             REAL NOT NULL DEFAULT 0,
  pitch           REAL NOT NULL DEFAULT 0,
  tipo            TEXT NOT NULL DEFAULT 'cena',    -- cena | info
  texto           TEXT NOT NULL DEFAULT '',
  destino_cena_id TEXT NOT NULL DEFAULT '',
  criado_em       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tour_hotspots ON tour_hotspots (cena_id);

-- Estatística de visualização agregada por dia (LGPD: sem dado pessoal)
CREATE TABLE IF NOT EXISTS tour_views (
  tour_id TEXT NOT NULL,
  dia     TEXT NOT NULL,
  hits    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tour_id, dia)
);

-- ===================== Onda 7: operação, prontidão e lançamento =====================

-- Checklist de execução do projeto (instância criada a partir do template do serviço)
CREATE TABLE IF NOT EXISTS projeto_checklists (
  id            TEXT PRIMARY KEY,
  projeto_id    TEXT NOT NULL,
  categoria     TEXT NOT NULL,                     -- drone | video_ia | foto360 | tour
  itens         TEXT NOT NULL DEFAULT '[]',        -- JSON: [{id, texto, seguranca, feito, quem, em}]
  decisao       TEXT NOT NULL DEFAULT '',          -- drone: confirmado | reagendado
  decisao_quem  TEXT NOT NULL DEFAULT '',
  decisao_em    TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_pj_checklists ON projeto_checklists (projeto_id);

-- Portão de prontidão para mídia paga (spec §11.2 — os 12 itens fixos vivem no código)
CREATE TABLE IF NOT EXISTS prontidao (
  chave     TEXT PRIMARY KEY,
  feito     INTEGER NOT NULL DEFAULT 0,
  quem      TEXT NOT NULL DEFAULT '',
  em        TEXT NOT NULL DEFAULT '',
  nota      TEXT NOT NULL DEFAULT ''
);

-- Custos manuais da campanha de 90 dias (sem integração com contas de anúncio)
CREATE TABLE IF NOT EXISTS custos_marketing (
  id             TEXT PRIMARY KEY,
  data           TEXT NOT NULL,
  canal          TEXT NOT NULL DEFAULT 'google',   -- google | meta | testes | outro
  valor_centavos INTEGER NOT NULL,
  nota           TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_custos_mkt ON custos_marketing (data);

CREATE TABLE IF NOT EXISTS auditoria (
  id          TEXT PRIMARY KEY,
  quem        TEXT NOT NULL,
  acao        TEXT NOT NULL,
  entidade    TEXT NOT NULL DEFAULT '',
  entidade_id TEXT NOT NULL DEFAULT '',
  detalhe     TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  criado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auditoria_quando ON auditoria (criado_em);
