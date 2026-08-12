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
