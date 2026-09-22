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
