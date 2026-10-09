// =====================================================================
// Villela Academy Marketplace — camada de banco (SQLite via node:sqlite).
// Banco próprio em DATA_DIR/academy/ (isolado dos outros SaaS). Sem
// dependência nativa (node:sqlite, Node 22+) — nunca better-sqlite3.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MOD_DIR = path.join(DATA_DIR, 'academy');
fs.mkdirSync(MOD_DIR, { recursive: true });

const DB_PATH = path.join(MOD_DIR, 'academy.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ---- migrações (ALTERs; roda uma vez cada) ----
const MIGRACOES = [
  // acrescentar no fim quando evoluir o schema
  { // comissões oficiais decididas pelo Augusto (regras\regras-negocio.md); corrige o seed provisório
    nome: 'comissoes-oficiais-2026-07-08',
    sql: `UPDATE platform_settings SET valor = '{"plataforma_pct":10,"afiliado_padrao_pct":10,"cookie_dias":30}', atualizado_em = '2026-07-08T00:00:00.000Z' WHERE chave = 'comissoes'`,
  },
  { // FASE 5: % de afiliado por produto (NULL = usa o padrão global; 0 = produto não comissiona)
    nome: 'products-afiliado-pct-2026-07-08',
    sql: 'ALTER TABLE products ADD COLUMN afiliado_pct INTEGER',
  },
  { // FASE 5: atribuição de afiliado no pedido (snapshot no momento da compra)
    nome: 'orders-afiliado-2026-07-08',
    sql: `ALTER TABLE orders ADD COLUMN affiliate_user_id TEXT DEFAULT '';
          ALTER TABLE orders ADD COLUMN afiliado_pct INTEGER DEFAULT 0;
          ALTER TABLE orders ADD COLUMN comissao_afiliado_centavos INTEGER DEFAULT 0;`,
  },
  { // FASE 6: pedido de cobrança recorrente de assinatura (GMV unificado)
    nome: 'orders-tipo-2026-07-08',
    sql: `ALTER TABLE orders ADD COLUMN tipo TEXT DEFAULT 'avulsa';
          ALTER TABLE orders ADD COLUMN subscription_id TEXT DEFAULT '';`,
  },
  { // FASE 7: onde o arquivo mora (local|s3) e confirmação de upload direto
    nome: 'media-storage-2026-07-09',
    sql: `ALTER TABLE media_files ADD COLUMN storage TEXT DEFAULT 'local';
          ALTER TABLE media_files ADD COLUMN confirmado INTEGER DEFAULT 1;`,
  },
  { // FASE 8: verificação de e-mail e lembrete de pedido abandonado
    nome: 'comunicacoes-2026-07-09',
    sql: `ALTER TABLE users ADD COLUMN email_verificado INTEGER DEFAULT 0;
          ALTER TABLE orders ADD COLUMN lembrete_em TEXT DEFAULT '';`,
  },
  { // FASE 10: 2FA opcional (TOTP, padrão vdocs)
    nome: 'totp-2026-07-09',
    sql: `ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT '';
          ALTER TABLE users ADD COLUMN totp_ativo INTEGER DEFAULT 0;`,
  },
  { // comissão oficial revisada pelo Augusto 09/07/2026 (benchmark de mercado):
    // plataforma 8,9% + R$1,00 fixo por venda (abaixo da Hotmart 9,9%+R$1); afiliado segue 10%
    nome: 'comissoes-oficiais-2026-07-09',
    sql: `UPDATE platform_settings SET valor = '{"plataforma_pct":8.9,"fixo_centavos":100,"afiliado_padrao_pct":10,"cookie_dias":30}', atualizado_em = '2026-07-09T00:00:00.000Z' WHERE chave = 'comissoes'`,
  },
  { // acesso de CORTESIA/BETA como FLAG do usuário: acesso TOTAL vitalício a
    // todos os produtos (inclusive catálogo vazio e produtos publicados no
    // futuro). 1 = cortesia ativa; 0 = sem cortesia (nunca teve ou revogada).
    nome: 'users-cortesia-2026-07-21',
    sql: 'ALTER TABLE users ADD COLUMN cortesia INTEGER DEFAULT 0',
  },
  { // categorias saem de const no código para tabela: o produtor escolhe uma das
    // do sistema ou cria a sua quando nenhuma serve. Estas 15 são as que já
    // existiam em repo-conteudo.CATEGORIAS, na mesma ordem.
    nome: 'categorias-tabela-2026-08-11',
    sql: [
      ['negocios', 'Negócios'], ['marketing', 'Marketing'], ['vendas', 'Vendas'],
      ['tecnologia', 'Tecnologia'], ['inteligencia-artificial', 'Inteligência Artificial'],
      ['direito', 'Direito'], ['gestao-documental', 'Gestão Documental'],
      ['aluguel-temporada', 'Aluguel por Temporada'], ['hospedagem', 'Hospedagem'],
      ['gastronomia', 'Gastronomia'], ['eventos', 'Eventos'], ['construcao', 'Construção'],
      ['financas', 'Finanças'], ['produtividade', 'Produtividade'],
      ['desenvolvimento-pessoal', 'Desenvolvimento Pessoal'],
    ].map(([slug, rot], i) => `INSERT OR IGNORE INTO categories (slug, rotulo, origem, ordem, criado_em)
        VALUES ('${slug}', '${rot.replace(/'/g, "''")}', 'sistema', ${i}, '2026-08-11T00:00:00.000Z');`).join('\n'),
  },

  { // um produto pode estar em MAIS DE UMA categoria (ex.: um curso de IA para
    // advogados vive em "Inteligência Artificial" e em "Direito"). A coluna
    // products.categoria continua sendo a PRINCIPAL (trilha, SEO, 1ª etiqueta);
    // esta tabela guarda TODAS, inclusive a principal, e é quem o filtro consulta.
    nome: 'product-categorias-multi-2026-09-18',
    sql: `CREATE TABLE IF NOT EXISTS product_categories (
            product_id TEXT NOT NULL REFERENCES products(id),
            slug       TEXT NOT NULL REFERENCES categories(slug),
            principal  INTEGER DEFAULT 0,
            PRIMARY KEY (product_id, slug)
          );
          CREATE INDEX IF NOT EXISTS idx_prodcat_slug ON product_categories(slug);
          INSERT OR IGNORE INTO product_categories (product_id, slug, principal)
            SELECT id, categoria, 1 FROM products WHERE categoria IS NOT NULL AND categoria != '';`,
  },

  { // AUDIOBOOK do curso: capítulos em áudio, ouvidos no player do site (tela
    // bloqueada, carro). Não é aula: não entra na grade nem no progresso. A
    // identidade do capítulo é a ORDEM — reenviar o capítulo 3 troca o áudio
    // e o título do 3, nunca cria outro. `amostra` = aberto a quem não comprou.
    nome: 'audiobook-faixas-2026-09-21',
    sql: `CREATE TABLE IF NOT EXISTS audiobook_faixas (
            id          TEXT PRIMARY KEY,
            product_id  TEXT NOT NULL REFERENCES products(id),
            ordem       INTEGER NOT NULL,
            titulo      TEXT NOT NULL,
            media_id    TEXT NOT NULL REFERENCES media_files(id),
            duracao_seg INTEGER DEFAULT 0,
            amostra     INTEGER DEFAULT 0,
            criado_em   TEXT NOT NULL,
            UNIQUE (product_id, ordem)
          );
          CREATE INDEX IF NOT EXISTS idx_abfaixa_media ON audiobook_faixas(media_id);`,
  },

  { // EXPERIÊNCIA DE APRENDIZAGEM (fase 1): Tutor Villela com base de conhecimento
    // real (transcrição das aulas, livro, tarefas), quiz por aula com feedback,
    // caderno de trabalho (Aprendi → Pratiquei → Apliquei → Resultado) com as
    // respostas do aluno, biblioteca de prompts e extras "em breve" do curso.
    // Conteúdo entra pela chave de publicação (interativo.js); nada é gerado ao vivo.
    nome: 'interativo-fase1-2026-09-22',
    sql: `CREATE TABLE IF NOT EXISTS tutor_trechos (
            id         TEXT PRIMARY KEY,
            product_id TEXT NOT NULL REFERENCES products(id),
            lesson_id  TEXT DEFAULT '',
            fonte      TEXT NOT NULL,            -- transcricao|livro|artigo|tarefas|faq
            rotulo     TEXT DEFAULT '',          -- o que o aluno lê como fonte ("Aula 3 · 4:12")
            ini_seg    INTEGER DEFAULT -1,       -- ponto do vídeo (transcrição), -1 = não se aplica
            ordem      INTEGER DEFAULT 0,
            texto      TEXT NOT NULL,
            criado_em  TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_trecho_prod ON tutor_trechos(product_id, fonte);
          CREATE TABLE IF NOT EXISTS tutor_conversas (
            id         TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL REFERENCES users(id),
            product_id TEXT NOT NULL,
            lesson_id  TEXT DEFAULT '',
            pergunta   TEXT NOT NULL,
            resposta   TEXT NOT NULL,
            fontes     TEXT DEFAULT '[]',
            criado_em  TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_tconv_user ON tutor_conversas(user_id, product_id, criado_em);
          CREATE TABLE IF NOT EXISTS aula_quiz (
            lesson_id     TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
            product_id    TEXT NOT NULL,
            questoes      TEXT NOT NULL,         -- JSON [{id,tipo,enunciado,alternativas:[{texto,correta,explicacao}]}]
            status        TEXT DEFAULT 'rascunho', -- rascunho (só o produtor vê) | publicado
            atualizado_em TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS quiz_tentativas (
            id         TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL REFERENCES users(id),
            lesson_id  TEXT NOT NULL,
            product_id TEXT NOT NULL,
            respostas  TEXT NOT NULL,
            acertos    INTEGER NOT NULL,
            total      INTEGER NOT NULL,
            criado_em  TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_qtent_user ON quiz_tentativas(user_id, product_id);
          CREATE TABLE IF NOT EXISTS aula_caderno (
            lesson_id     TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
            product_id    TEXT NOT NULL,
            dados         TEXT NOT NULL,         -- JSON {aprendi, pratiquei, apliquei, resultado}
            status        TEXT DEFAULT 'rascunho',
            atualizado_em TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS caderno_respostas (
            user_id       TEXT NOT NULL REFERENCES users(id),
            lesson_id     TEXT NOT NULL,
            product_id    TEXT NOT NULL,
            campo         TEXT NOT NULL,
            texto         TEXT DEFAULT '',
            atualizado_em TEXT NOT NULL,
            PRIMARY KEY (user_id, lesson_id, campo)
          );
          CREATE TABLE IF NOT EXISTS curso_prompts (
            id           TEXT PRIMARY KEY,
            product_id   TEXT NOT NULL REFERENCES products(id),
            ordem        INTEGER DEFAULT 0,
            categoria    TEXT DEFAULT '',
            titulo       TEXT NOT NULL,
            objetivo     TEXT DEFAULT '',
            prompt       TEXT NOT NULL,
            exemplo      TEXT DEFAULT '',
            personalizar TEXT DEFAULT '',
            aula_ref     TEXT DEFAULT '',
            status       TEXT DEFAULT 'rascunho',
            criado_em    TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_cprompt_prod ON curso_prompts(product_id, ordem);
          CREATE TABLE IF NOT EXISTS curso_extras (
            id         TEXT PRIMARY KEY,
            product_id TEXT NOT NULL REFERENCES products(id),
            ordem      INTEGER DEFAULT 0,
            titulo     TEXT NOT NULL,
            descricao  TEXT DEFAULT '',
            status     TEXT DEFAULT 'em_breve',  -- em_breve | disponivel
            url        TEXT DEFAULT '',
            criado_em  TEXT NOT NULL
          );`,
  },
  // Fases 2 e 3 da experiência de aprendizagem: a JORNADA do curso (jornada.js).
  // XP, nível e selos NÃO têm tabela — são derivados do que está aqui e na fase 1.
  {
    nome: 'jornada-fases2e3-2026-09-22',
    sql: `CREATE TABLE IF NOT EXISTS curso_jornada (
            product_id    TEXT NOT NULL REFERENCES products(id),
            secao         TEXT NOT NULL,         -- competencias|avaliacao|lab|desafio|simulacoes|recursos
            dados         TEXT NOT NULL,         -- JSON validado na importação
            status        TEXT DEFAULT 'rascunho',
            atualizado_em TEXT NOT NULL,
            PRIMARY KEY (product_id, secao)
          );
          CREATE TABLE IF NOT EXISTS avaliacao_tentativas (
            id              TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL REFERENCES users(id),
            product_id      TEXT NOT NULL,
            momento         TEXT NOT NULL,       -- diagnostico | final
            respostas       TEXT NOT NULL,
            pontos          INTEGER NOT NULL,
            total           INTEGER NOT NULL,
            pct             INTEGER NOT NULL,
            nivel           TEXT NOT NULL,
            por_competencia TEXT DEFAULT '{}',
            criado_em       TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_aval_user ON avaliacao_tentativas(user_id, product_id);
          CREATE TABLE IF NOT EXISTS lab_entregas (
            user_id       TEXT NOT NULL REFERENCES users(id),
            product_id    TEXT NOT NULL,
            missao_id     TEXT NOT NULL,
            respostas     TEXT DEFAULT '{}',
            entregue_em   TEXT DEFAULT '',
            feedback      TEXT DEFAULT '',        -- JSON da avaliação do mentor (IA): INDICAÇÃO, não nota
            avaliado_em   TEXT DEFAULT '',
            atualizado_em TEXT NOT NULL,
            PRIMARY KEY (user_id, product_id, missao_id)
          );
          CREATE TABLE IF NOT EXISTS desafio_inscricoes (
            user_id     TEXT NOT NULL REFERENCES users(id),
            product_id  TEXT NOT NULL,
            iniciado_em TEXT NOT NULL,            -- AAAA-MM-DD (Brasília)
            PRIMARY KEY (user_id, product_id)
          );
          CREATE TABLE IF NOT EXISTS desafio_checkins (
            user_id    TEXT NOT NULL REFERENCES users(id),
            product_id TEXT NOT NULL,
            dia        INTEGER NOT NULL,
            nota       TEXT DEFAULT '',
            criado_em  TEXT NOT NULL,
            PRIMARY KEY (user_id, product_id, dia)
          );
          CREATE TABLE IF NOT EXISTS simulacao_partidas (
            id            TEXT PRIMARY KEY,
            user_id       TEXT NOT NULL REFERENCES users(id),
            product_id    TEXT NOT NULL,
            simulacao_id  TEXT NOT NULL,
            no_atual      TEXT NOT NULL,
            caminho       TEXT DEFAULT '[]',
            pontos        INTEGER DEFAULT 0,
            final_id      TEXT DEFAULT '',
            criado_em     TEXT NOT NULL,
            atualizado_em TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_simp_user ON simulacao_partidas(user_id, product_id);`,
  },
  // ECOSSISTEMA (ecossistema.js): formatos de aula (Villela Express, Faça comigo),
  // trilhas, lives mensais e comunidade.
  {
    nome: 'ecossistema-2026-09-22',
    sql: `ALTER TABLE lessons ADD COLUMN formato TEXT DEFAULT '';      -- ''|express|faca-comigo|live
          ALTER TABLE lessons ADD COLUMN passos TEXT DEFAULT '[]';     -- Faça comigo: [{ini_seg,titulo,instrucao}]
          CREATE INDEX IF NOT EXISTS idx_lessons_formato ON lessons(formato);
          CREATE TABLE IF NOT EXISTS trilhas (
            id               TEXT PRIMARY KEY,
            producer_id      TEXT NOT NULL REFERENCES users(id),
            slug             TEXT NOT NULL UNIQUE,
            titulo           TEXT NOT NULL,
            subtitulo        TEXT DEFAULT '',
            descricao        TEXT DEFAULT '',
            icone            TEXT DEFAULT '',
            publico          TEXT DEFAULT '',
            clube_product_id TEXT DEFAULT '',     -- assinatura que libera a trilha (produto tipo clube)
            status           TEXT DEFAULT 'rascunho', -- rascunho|publicada
            ordem            INTEGER DEFAULT 0,
            criado_em        TEXT NOT NULL,
            atualizado_em    TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS trilha_itens (
            id         TEXT PRIMARY KEY,
            trilha_id  TEXT NOT NULL REFERENCES trilhas(id) ON DELETE CASCADE,
            ordem      INTEGER DEFAULT 0,
            product_id TEXT DEFAULT '',           -- vazio = curso "em breve"
            titulo     TEXT DEFAULT '',
            descricao  TEXT DEFAULT '',
            status     TEXT DEFAULT 'disponivel'
          );
          CREATE TABLE IF NOT EXISTS lives (
            id                 TEXT PRIMARY KEY,
            producer_id        TEXT NOT NULL REFERENCES users(id),
            titulo             TEXT NOT NULL,
            descricao          TEXT DEFAULT '',
            inicio_em          TEXT NOT NULL,
            duracao_min        INTEGER DEFAULT 60,
            link               TEXT DEFAULT '',     -- só para quem pode assistir, a partir de 30 min antes
            gravacao_url       TEXT DEFAULT '',
            gravacao_lesson_id TEXT DEFAULT '',
            status             TEXT DEFAULT 'agendada',
            produtos           TEXT DEFAULT '[]',   -- vazio = todos os alunos da casa
            publicada          INTEGER DEFAULT 0,
            novidades          TEXT DEFAULT '[]',   -- "O que mudou este mês": [{titulo,texto,fonte}]
            lembrete_em        TEXT DEFAULT '',
            criado_em          TEXT NOT NULL,
            atualizado_em      TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS live_inscricoes (
            live_id TEXT NOT NULL, user_id TEXT NOT NULL, criado_em TEXT NOT NULL, PRIMARY KEY (live_id, user_id)
          );
          CREATE TABLE IF NOT EXISTS live_perguntas (
            id TEXT PRIMARY KEY, live_id TEXT NOT NULL, user_id TEXT NOT NULL, texto TEXT NOT NULL,
            votos INTEGER DEFAULT 0, status TEXT DEFAULT 'aberta', criado_em TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS live_votos (pergunta_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (pergunta_id, user_id));
          CREATE TABLE IF NOT EXISTS com_topicos (
            id TEXT PRIMARY KEY, producer_id TEXT NOT NULL, area TEXT NOT NULL, product_id TEXT DEFAULT '',
            user_id TEXT NOT NULL REFERENCES users(id), titulo TEXT NOT NULL, texto TEXT NOT NULL,
            status TEXT DEFAULT 'visivel',          -- visivel|oculto|removido
            fixado INTEGER DEFAULT 0, solucao_id TEXT DEFAULT '', respostas_n INTEGER DEFAULT 0, denuncias INTEGER DEFAULT 0,
            criado_em TEXT NOT NULL, ultimo_em TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_comt_prod ON com_topicos(producer_id, area, ultimo_em);
          CREATE TABLE IF NOT EXISTS com_respostas (
            id TEXT PRIMARY KEY, topico_id TEXT NOT NULL REFERENCES com_topicos(id), user_id TEXT NOT NULL REFERENCES users(id),
            texto TEXT NOT NULL, status TEXT DEFAULT 'visivel', denuncias INTEGER DEFAULT 0, criado_em TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_comr_top ON com_respostas(topico_id, criado_em);
          CREATE TABLE IF NOT EXISTS com_curtidas (
            alvo_tipo TEXT NOT NULL, alvo_id TEXT NOT NULL, user_id TEXT NOT NULL, criado_em TEXT NOT NULL, PRIMARY KEY (alvo_tipo, alvo_id, user_id)
          );
          CREATE TABLE IF NOT EXISTS com_denuncias (
            id TEXT PRIMARY KEY, alvo_tipo TEXT NOT NULL, alvo_id TEXT NOT NULL, producer_id TEXT NOT NULL,
            user_id TEXT NOT NULL, motivo TEXT DEFAULT '', status TEXT DEFAULT 'aberta', criado_em TEXT NOT NULL
          );`,
  },
  { // Categoria MÚSICA: é por ela que o Musique mostra os cursos da Academia
    // (ADR-0011 da Musique, 28/09/2026 — os dois sistemas são independentes
    // e o curso é o único elo). Produtor que classifica o curso aqui aparece lá.
    nome: 'categoria-musica-2026-09-28',
    sql: `INSERT OR IGNORE INTO categories (slug, rotulo, origem, ordem, criado_em)
          VALUES ('musica', 'Música', 'sistema', 15, '2026-09-28T00:00:00.000Z');`,
  },
  // ESTUDO (academy\estudo\): o motor que leva de um assunto ou de um edital a
  // aprendizagem demonstrada. O ESCOPO é a unidade: um programa de itens
  // versionado (retificação = versão nova, a antiga fica), competências,
  // unidades de aula ativa, banco de questões com procedência e cards.
  // O estado de cada competência NÃO tem tabela — é derivado de est_evidencias
  // (mesma decisão do XP da jornada). Só a agenda de revisão guarda estado.
  {
    nome: 'estudo-fundacao-2026-10-08',
    sql: `CREATE TABLE IF NOT EXISTS est_escopos (
            id              TEXT PRIMARY KEY,
            product_id      TEXT NOT NULL REFERENCES products(id),
            slug            TEXT NOT NULL,
            tipo            TEXT NOT NULL,           -- assunto | edital
            titulo          TEXT NOT NULL,
            nivel           TEXT DEFAULT '',         -- nível de abordagem pedido
            extensao        TEXT DEFAULT '',         -- micro | modulo | curso | preparacao
            resumo          TEXT DEFAULT '',
            perfil          TEXT DEFAULT '{}',       -- concurso: carreira, órgão, cargo, banca, etapas, fontes
            regra_pontuacao TEXT DEFAULT '{}',       -- vem do edital-alvo, com fonte (pontuacao.js)
            data_alvo       TEXT DEFAULT '',         -- AAAA-MM-DD; vazio = sem prova marcada
            versao          INTEGER DEFAULT 0,       -- versão vigente do programa
            status          TEXT DEFAULT 'rascunho', -- rascunho (só dono/admin) | publicado
            criado_em       TEXT NOT NULL,
            atualizado_em   TEXT NOT NULL,
            UNIQUE (product_id, slug)
          );
          CREATE TABLE IF NOT EXISTS est_versoes (
            escopo_id TEXT NOT NULL REFERENCES est_escopos(id),
            versao    INTEGER NOT NULL,
            documento TEXT DEFAULT '{}',             -- nome, url, data, tipo (edital|retificacao|autoral)
            diff      TEXT DEFAULT '{}',             -- o que mudou em relação à versão anterior
            criado_em TEXT NOT NULL,
            PRIMARY KEY (escopo_id, versao)
          );
          CREATE TABLE IF NOT EXISTS est_itens (
            escopo_id   TEXT NOT NULL REFERENCES est_escopos(id),
            versao      INTEGER NOT NULL,
            codigo      TEXT NOT NULL,               -- numeração original do programa
            pai         TEXT DEFAULT '',
            ordem       INTEGER DEFAULT 0,
            texto       TEXT NOT NULL,               -- texto ORIGINAL, nunca resumido
            hash        TEXT NOT NULL,
            localizacao TEXT DEFAULT '',             -- documento, página, trecho
            pendente    TEXT DEFAULT '',             -- leitura incerta (OCR, regra ambígua)
            peso        REAL DEFAULT 0,
            esforco     TEXT DEFAULT '',             -- JSON [min, max] em minutos; vazio = sem estimativa
            folha       INTEGER DEFAULT 1,
            PRIMARY KEY (escopo_id, versao, codigo)
          );
          CREATE TABLE IF NOT EXISTS est_competencias (
            escopo_id    TEXT NOT NULL REFERENCES est_escopos(id),
            codigo       TEXT NOT NULL,
            ordem        INTEGER DEFAULT 0,
            resultado    TEXT NOT NULL,              -- "Diante de X, o aluno executará Y..."
            criterios    TEXT DEFAULT '[]',
            depende_de   TEXT DEFAULT '[]',
            erros_comuns TEXT DEFAULT '[]',
            essencial    INTEGER DEFAULT 1,
            versao       INTEGER DEFAULT 1,
            PRIMARY KEY (escopo_id, codigo)
          );
          CREATE TABLE IF NOT EXISTS est_vinculos (   -- item do programa ↔ competência
            escopo_id          TEXT NOT NULL REFERENCES est_escopos(id),
            item_codigo        TEXT NOT NULL,
            competencia_codigo TEXT NOT NULL,
            justificativa      TEXT DEFAULT '',
            estado_revisao     TEXT DEFAULT 'sugerido', -- sugerido | revisado
            PRIMARY KEY (escopo_id, item_codigo, competencia_codigo)
          );
          CREATE TABLE IF NOT EXISTS est_unidades (
            id            TEXT PRIMARY KEY,
            escopo_id     TEXT NOT NULL REFERENCES est_escopos(id),
            codigo        TEXT NOT NULL,
            ordem         INTEGER DEFAULT 0,
            titulo        TEXT NOT NULL,
            competencias  TEXT DEFAULT '[]',
            itens         TEXT DEFAULT '[]',
            blocos        TEXT NOT NULL,             -- a aula ativa: desafio, explicação, exemplo, prática...
            fontes        TEXT DEFAULT '[]',
            midias        TEXT DEFAULT '[]',         -- [{tipo, estado: planejado|roteirizado|gerado|revisado|publicado}]
            tempo_min     INTEGER DEFAULT 0,
            versao        INTEGER DEFAULT 1,
            status        TEXT DEFAULT 'rascunho',
            atualizado_em TEXT NOT NULL,
            UNIQUE (escopo_id, codigo)
          );
          CREATE TABLE IF NOT EXISTS est_questoes (   -- o banco é do PRODUTOR; o vínculo é que o liga a um escopo
            id            TEXT PRIMARY KEY,
            producer_id   TEXT NOT NULL REFERENCES users(id),
            hash          TEXT NOT NULL,             -- dedup: reimportar a prova não infla o acervo
            versao        INTEGER DEFAULT 1,
            tipo          TEXT NOT NULL,
            origem        TEXT NOT NULL,             -- oficial | adaptada | autoral | relato
            uso           TEXT DEFAULT 'aprendizagem', -- aprendizagem | revisao | reservada
            corrigivel    INTEGER DEFAULT 0,
            situacao      TEXT DEFAULT 'rascunho',   -- rascunho | revisao | disponivel | suspensa | arquivada
            dados         TEXT NOT NULL,             -- JSON validado por banco.js (gabarito fica AQUI, no servidor)
            criado_em     TEXT NOT NULL,
            atualizado_em TEXT NOT NULL,
            UNIQUE (producer_id, hash)
          );
          CREATE TABLE IF NOT EXISTS est_questao_vinculos (
            questao_id     TEXT NOT NULL REFERENCES est_questoes(id),
            escopo_id      TEXT NOT NULL REFERENCES est_escopos(id),
            alvo           TEXT NOT NULL,            -- competencia | item
            codigo         TEXT NOT NULL,
            justificativa  TEXT DEFAULT '',
            estado_revisao TEXT DEFAULT 'sugerido',
            PRIMARY KEY (questao_id, escopo_id, alvo, codigo)
          );
          CREATE INDEX IF NOT EXISTS idx_estqv_escopo ON est_questao_vinculos(escopo_id, alvo, codigo);
          CREATE TABLE IF NOT EXISTS est_cards (
            id                 TEXT PRIMARY KEY,
            escopo_id          TEXT NOT NULL REFERENCES est_escopos(id),
            codigo             TEXT NOT NULL,
            ordem              INTEGER DEFAULT 0,
            competencia_codigo TEXT NOT NULL,
            frente             TEXT NOT NULL,
            verso              TEXT NOT NULL,
            explicacao         TEXT DEFAULT '',
            fonte              TEXT DEFAULT '',
            status             TEXT DEFAULT 'rascunho',
            UNIQUE (escopo_id, codigo)
          );
          CREATE TABLE IF NOT EXISTS est_evidencias (
            id                 TEXT PRIMARY KEY,
            user_id            TEXT NOT NULL REFERENCES users(id),
            escopo_id          TEXT NOT NULL,
            competencia_codigo TEXT NOT NULL,
            competencia_versao INTEGER DEFAULT 1,
            origem             TEXT NOT NULL,        -- questao | card
            ref_id             TEXT NOT NULL,
            ref_versao         INTEGER DEFAULT 1,
            tentativa_id       TEXT DEFAULT '',
            modo               TEXT NOT NULL,        -- estudo | pratica | avaliacao
            acerto             INTEGER NOT NULL,
            pistas             INTEGER DEFAULT 0,
            ajuda_humana       INTEGER DEFAULT 0,
            inedita            INTEGER DEFAULT 0,    -- o aluno nunca tinha visto este item
            tempo_seg          INTEGER DEFAULT 0,
            confianca          TEXT DEFAULT '',      -- baixa | media | alta (declarada antes da correção)
            criado_em          TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_estev_user ON est_evidencias(user_id, escopo_id, competencia_codigo);
          CREATE INDEX IF NOT EXISTS idx_estev_ref ON est_evidencias(user_id, ref_id);
          CREATE TABLE IF NOT EXISTS est_ajudas (     -- pistas pedidas desde a última resposta: quem conta é o servidor
            user_id    TEXT NOT NULL REFERENCES users(id),
            questao_id TEXT NOT NULL,
            n          INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, questao_id)
          );
          CREATE TABLE IF NOT EXISTS est_revisoes (
            user_id          TEXT NOT NULL REFERENCES users(id),
            escopo_id        TEXT NOT NULL,
            alvo             TEXT NOT NULL,          -- competencia | card
            alvo_id          TEXT NOT NULL,
            passo            INTEGER DEFAULT 0,
            vencimento       TEXT DEFAULT '',        -- AAAA-MM-DD; vazio = sem retomada antes da prova
            ultimo_resultado TEXT DEFAULT '',
            atualizado_em    TEXT NOT NULL,
            PRIMARY KEY (user_id, escopo_id, alvo, alvo_id)
          );
          CREATE TABLE IF NOT EXISTS est_tentativas (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL REFERENCES users(id),
            escopo_id   TEXT NOT NULL,
            modo        TEXT NOT NULL,               -- treino | simulado
            congelado   TEXT NOT NULL,               -- itens, versões, ordem, gabarito e regra fixados no início
            inicio_em   TEXT NOT NULL,
            prazo_em    TEXT NOT NULL,               -- o relógio é do servidor
            respostas   TEXT DEFAULT '{}',
            salvo_em    TEXT DEFAULT '',
            enviado_em  TEXT DEFAULT '',
            resultado   TEXT DEFAULT '',
            estado      TEXT DEFAULT 'em_andamento'  -- em_andamento | enviada | expirada
          );
          CREATE INDEX IF NOT EXISTS idx_esttent_user ON est_tentativas(user_id, escopo_id, estado);
          CREATE TABLE IF NOT EXISTS est_planos (
            user_id       TEXT NOT NULL REFERENCES users(id),
            escopo_id     TEXT NOT NULL,
            entrada       TEXT NOT NULL,             -- disponibilidade, indisponíveis, data-alvo, margem
            plano         TEXT NOT NULL,
            historico     TEXT DEFAULT '[]',         -- o que mudou a cada replanejamento
            versao        INTEGER DEFAULT 1,
            atualizado_em TEXT NOT NULL,
            PRIMARY KEY (user_id, escopo_id)
          );`,
  },
  // CARTEIRA DE IA (carteira-ia.js): saldo pré-pago que paga o uso de provedor de
  // IA. O saldo é a SOMA do razão, em milésimos de real. O índice único parcial
  // é a idempotência da recarga: o mesmo pagamento não credita duas vezes.
  {
    nome: 'ia-carteira-2026-10-08',
    sql: `CREATE TABLE IF NOT EXISTS ia_movimentos (
            id        TEXT PRIMARY KEY,
            user_id   TEXT NOT NULL REFERENCES users(id),
            tipo      TEXT NOT NULL,   -- recarga | cortesia | ajuste | reserva | acerto | estorno | estorno_recarga
            milesimos INTEGER NOT NULL, -- R$ × 1000; crédito positivo, débito negativo
            ref       TEXT DEFAULT '',  -- recarga: id da recarga · uso: id que liga reserva e acerto
            detalhe   TEXT DEFAULT '',
            quem      TEXT DEFAULT '',
            criado_em TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_iamov_user ON ia_movimentos(user_id, criado_em);
          CREATE INDEX IF NOT EXISTS idx_iamov_ref ON ia_movimentos(ref);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_iamov_recarga ON ia_movimentos(tipo, ref) WHERE tipo IN ('recarga', 'estorno_recarga');
          CREATE TABLE IF NOT EXISTS ia_recargas (
            id               TEXT PRIMARY KEY,
            user_id          TEXT NOT NULL REFERENCES users(id),
            valor_centavos   INTEGER NOT NULL,
            status           TEXT DEFAULT 'pendente', -- pendente | paga | recusada | cancelada | reembolsada
            mp_preference_id TEXT DEFAULT '',
            mp_payment_id    TEXT DEFAULT '',
            criado_em        TEXT NOT NULL,
            pago_em          TEXT DEFAULT ''
          );
          ALTER TABLE ai_usage_logs ADD COLUMN cobranca TEXT DEFAULT '';   -- '' (antes da carteira) | franquia | paga | isento
          ALTER TABLE ai_usage_logs ADD COLUMN milesimos INTEGER DEFAULT 0; -- o que foi debitado do usuário
          ALTER TABLE ai_usage_logs ADD COLUMN product_id TEXT DEFAULT '';`,
  },
  {
    // ADR-0005: níveis do material (50/25/10 % derivados do nível 100 = blocos) e
    // pacotes de véspera por foco (objetiva | escrita | oral). Derivados guardam a
    // versão da unidade de que saíram: mudou o 100, o derivado fica desatualizado.
    nome: 'estudo-niveis-2026-10-09',
    sql: `ALTER TABLE est_unidades ADD COLUMN niveis TEXT DEFAULT '{}';
          ALTER TABLE est_unidades ADD COLUMN vespera TEXT DEFAULT '{}';`,
  },
  {
    // ADR-0007 — caderno de erros: a anotação do próprio aluno sobre a questão ("por que errei",
    // "por que cada alternativa está certa ou errada"). É dele: uma por questão, reescrita quando muda.
    nome: 'estudo-anotacoes-2026-10-09',
    sql: `CREATE TABLE IF NOT EXISTS est_anotacoes (
            user_id       TEXT NOT NULL REFERENCES users(id),
            questao_id    TEXT NOT NULL,
            escopo_id     TEXT NOT NULL REFERENCES est_escopos(id),
            texto         TEXT NOT NULL,
            atualizado_em TEXT NOT NULL,
            PRIMARY KEY (user_id, questao_id)
          );`,
  },
  {
    // Marca-texto da leitura: o trecho que o aluno grifou, com cor e anotação. Âncora no texto cru do
    // bloco (aula, bloco, início, fim) + o próprio trecho, para reencontrá-lo se a aula for reescrita.
    nome: 'estudo-marcacoes-2026-10-09',
    sql: `CREATE TABLE IF NOT EXISTS est_marcacoes (
            id             TEXT PRIMARY KEY,
            user_id        TEXT NOT NULL REFERENCES users(id),
            escopo_id      TEXT NOT NULL REFERENCES est_escopos(id),
            unidade        TEXT NOT NULL,
            bloco          INTEGER NOT NULL,
            inicio         INTEGER NOT NULL,
            fim            INTEGER NOT NULL,
            texto          TEXT NOT NULL,
            cor            TEXT NOT NULL,
            nota           TEXT DEFAULT '',
            versao_unidade INTEGER DEFAULT 1,
            criado_em      TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS ix_est_marcacoes_aluno ON est_marcacoes (user_id, escopo_id);`,
  },
];

for (const m of MIGRACOES) {
  if (db.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
  db.exec(m.sql);
  db.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)').run(m.nome, new Date().toISOString());
}

const nowISO = () => new Date().toISOString();
const novoId = () => crypto.randomBytes(9).toString('base64url');

let _txDepth = 0;
function transacao(fn) {
  if (_txDepth > 0) { _txDepth++; try { return fn(); } finally { _txDepth--; } }
  _txDepth = 1; db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  finally { _txDepth = 0; }
}

const j = {
  parse(s, padrao) { try { return s == null || s === '' ? padrao : JSON.parse(s); } catch { return padrao; } },
  str(o) { try { return JSON.stringify(o == null ? null : o); } catch { return 'null'; } },
};

module.exports = { db, transacao, nowISO, novoId, j, DATA_DIR, MOD_DIR, DB_PATH };
