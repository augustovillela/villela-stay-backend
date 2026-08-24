// =====================================================================
// Livraria Villela — camada de banco (SQLite via node:sqlite embutido)
// Sem dependência nativa (better-sqlite3 exige compilação). node:sqlite
// existe no Node 22+ (por isso package.json engines = ">=22").
//
// O arquivo do banco e os PDFs privados ficam sob DATA_DIR/livraria/,
// que é o disco persistente do Render (/var/data) — nunca no git nem
// em pasta pública.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LIVRARIA_DIR = path.join(DATA_DIR, 'livraria');
const PDF_DIR = path.join(LIVRARIA_DIR, 'pdfs');
fs.mkdirSync(PDF_DIR, { recursive: true });

const DB_PATH = path.join(LIVRARIA_DIR, 'livraria.db');
const db = new DatabaseSync(DB_PATH);

// WAL: leituras concorrentes durante escrita; melhor para servidor web.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');

// Aplica o schema (idempotente — tudo é CREATE ... IF NOT EXISTS).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---- Migrações de coluna (idempotentes) ----------------------------------
// O schema.sql roda ANTES daqui e não pode referenciar coluna nova (o CREATE
// INDEX abortaria o schema inteiro), então toda coluna acrescentada depois
// entra por aqui, conferindo o PRAGMA antes do ALTER.
function coluna(tabela, nome, definicao) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name);
    if (!cols.includes(nome)) {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${nome} ${definicao}`);
      console.log(`[livraria] migração: ${tabela}.${nome} criada`);
    }
  } catch (e) { console.error(`[livraria] migração ${tabela}.${nome}:`, e.message); }
}
// Marca do follow-up pós-compra (pedido de avaliação) — ver livraria/followup.js.
coluna('orders', 'followup_enviado_em', 'TEXT');

// Supressão de backfill (idempotente): quem comprou ANTES de a rotina existir
// não pode receber "faz alguns dias que você recebeu" semanas depois. Sem isto,
// ligar a feature varreria o histórico inteiro e escreveria para clientes
// antigos de uma vez — o pior jeito de estrear uma automação de mensagem.
try {
  const r = db.prepare(`UPDATE orders SET followup_enviado_em = 'suprimido: compra anterior à ativação'
    WHERE status = 'pago' AND followup_enviado_em IS NULL
      AND COALESCE(pago_em, created_at) < '2026-08-24T00:00:00.000Z'`).run();
  if (r.changes) console.log(`[livraria] follow-up: ${r.changes} pedido(s) antigo(s) suprimido(s)`);
} catch (e) { console.error('[livraria] supressão de backfill:', e.message); }

// Correção pontual (idempotente): a capa do 1º livro apontava para um link de
// VISUALIZAÇÃO do Google Drive, que não renderiza como <img>. Capa oficial agora
// hospedada no próprio backend em /assets/livros/ (só substitui se ainda for o Drive).
try {
  db.prepare(`UPDATE books SET
      capa_url = '/assets/livros/pilotagem-de-drones-na-pratica.jpg',
      og_image = 'https://livros.villelastay.com.br/assets/livros/pilotagem-de-drones-na-pratica.jpg'
    WHERE slug = 'pilotagem-de-drones-na-pratica-dji-mini-3' AND capa_url LIKE '%drive.google.com%'`).run();
} catch (e) { console.error('[livraria] fix capa:', e.message); }

// Correção pontual (idempotente): capa oficial do "Claude AI na Prática" hospedada em
// /assets/livros/ (só preenche se ainda estiver sem capa) + conserto do typo "Prátcia" nos textos
// e no SLUG do livro (era 'claude-ai-na-pratcia'; REPLACE é no-op quando não há ocorrência).
// O slug antigo já circulou, então `/livros/claude-ai-na-pratcia` responde 301 em rotas-publicas.js.
// A correção do slug fica aqui — e não só na chamada de API que a aplicou em 30/07/2026 — para
// sobreviver à restauração de um snapshot antigo do banco.
try {
  db.prepare(`UPDATE books SET slug = 'claude-ai-na-pratica'
    WHERE slug = 'claude-ai-na-pratcia'
      AND NOT EXISTS (SELECT 1 FROM books WHERE slug = 'claude-ai-na-pratica')`).run();
  db.prepare(`UPDATE books SET
      capa_url = '/assets/livros/claude-ai-na-pratica.jpg',
      og_image = 'https://livros.villelastay.com.br/assets/livros/claude-ai-na-pratica.jpg'
    WHERE slug = 'claude-ai-na-pratica' AND (capa_url IS NULL OR capa_url = '')`).run();
  db.prepare(`UPDATE books SET
      titulo = REPLACE(titulo, 'Prátcia', 'Prática'),
      subtitulo = REPLACE(subtitulo, 'Prátcia', 'Prática'),
      descricao_curta = REPLACE(descricao_curta, 'Prátcia', 'Prática'),
      descricao_longa = REPLACE(descricao_longa, 'Prátcia', 'Prática'),
      seo_title = REPLACE(seo_title, 'Prátcia', 'Prática'),
      seo_description = REPLACE(seo_description, 'Prátcia', 'Prática')
    WHERE slug = 'claude-ai-na-pratica'`).run();
} catch (e) { console.error('[livraria] fix capa claude:', e.message); }

// Rename definitivo (idempotente): o livro visual nasceu como 'domine-o-claude-na-advocacia'
// (07/08/2026, circulou por poucas horas) e virou "Claude AI para Advogados – Guia Visual".
// O slug antigo responde 301 em rotas-publicas.js; a migração fica aqui — e não só na chamada
// de API que a aplicou — para sobreviver à restauração de um snapshot antigo do banco.
try {
  db.prepare(`UPDATE books SET slug = 'claude-ai-para-advogados-guia-visual'
    WHERE slug = 'domine-o-claude-na-advocacia'
      AND NOT EXISTS (SELECT 1 FROM books WHERE slug = 'claude-ai-para-advogados-guia-visual')`).run();
  db.prepare(`UPDATE books SET
      titulo = 'Claude AI para Advogados – Guia Visual',
      capa_url = '/assets/livros/claude-ai-para-advogados-guia-visual.jpg',
      og_image = 'https://livros.villelastay.com.br/assets/livros/claude-ai-para-advogados-guia-visual.jpg'
    WHERE slug = 'claude-ai-para-advogados-guia-visual'
      AND capa_url = '/assets/livros/domine-o-claude-na-advocacia.jpg'`).run();
} catch (e) { console.error('[livraria] rename guia visual:', e.message); }

// ---- helpers ----
const nowISO = () => new Date().toISOString();
// ID curto, opaco e url-safe (mesmo estilo do server.js: base64url).
const novoId = () => crypto.randomBytes(9).toString('base64url');
// Token de download: mais longo e imprevisível (32 bytes).
const novoToken = () => crypto.randomBytes(32).toString('base64url');

// Executa fn dentro de uma transação (rollback em erro).
function transacao(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
}

// JSON seguro (colunas TEXT que guardam JSON).
const j = {
  parse(s, padrao) { try { return s == null || s === '' ? padrao : JSON.parse(s); } catch { return padrao; } },
  str(o) { try { return JSON.stringify(o == null ? null : o); } catch { return 'null'; } },
};

module.exports = {
  db, transacao, nowISO, novoId, novoToken, j,
  DATA_DIR, LIVRARIA_DIR, PDF_DIR, DB_PATH,
};
