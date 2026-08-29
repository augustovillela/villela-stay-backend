// =====================================================================
// Villela Finance — camada de banco (SQLite via node:sqlite).
//
// Banco PRÓPRIO em DATA_DIR/financeiro/financeiro.db, isolado dos outros
// SaaS (ADR-0002). Sem dependência nativa — node:sqlite, Node 22+.
//
// Aqui só ficam conexão, schema, migrations e introspecção. Regra de
// negócio mora nos serviços; SQL de domínio mora no repo.js.
//
// ATENÇÃO: schema.sql roda ANTES das migrações. Índice ou trigger que
// dependa de coluna criada por migração aborta o schema inteiro e o
// módulo não monta — crie a coluna na migração e o índice também nela.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SAAS_DIR = path.join(DATA_DIR, 'financeiro');
fs.mkdirSync(SAAS_DIR, { recursive: true });

const DB_PATH = path.join(SAAS_DIR, 'financeiro.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');
// Durabilidade: o razão não pode perder um COMMIT confirmado por causa de
// um crash do processo. FULL custa fsync por commit — aceitável no volume
// de um financeiro, e é a diferença entre "o lote existe" e "achamos que sim".
db.exec('PRAGMA synchronous = FULL;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ---- helpers de introspecção (usados por migrations e pelo guarda) ----
function colunas(tabela) {
  try { return db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name); }
  catch { return []; }
}
const temColuna = (tabela, coluna) => colunas(tabela).includes(coluna);

// ---- migrations (nome único, roda uma vez, NUNCA destrutiva) ----
const MIGRACOES = [
  {
    // Fase 10: quando o segundo fator foi ativado. Vai por migração porque
    // `CREATE TABLE IF NOT EXISTS` não acrescenta coluna em tabela que já
    // existe — banco em produção nunca receberia a do schema.
    nome: 'fin-0001-tenant-users-mfa-ativado-em',
    aplicar() {
      if (!temColuna('tenant_users', 'mfa_ativado_em')) {
        db.exec("ALTER TABLE tenant_users ADD COLUMN mfa_ativado_em TEXT DEFAULT ''");
      }
    },
  },
  {
    // Anonimização (LGPD art. 18): a contraparte ganha marca de quando foi
    // anonimizada, e o gatilho da linha passa a permitir alterar SÓ o memo
    // — a substância contábil segue intocável. Sem isso, o nome de uma
    // pessoa ficaria preso dentro do histórico para sempre.
    nome: 'fin-0002-anonimizacao-de-contraparte',
    aplicar() {
      if (!temColuna('fin_contrapartes', 'anonimizado_em')) {
        db.exec("ALTER TABLE fin_contrapartes ADD COLUMN anonimizado_em TEXT NOT NULL DEFAULT ''");
      }
      db.exec('DROP TRIGGER IF EXISTS trg_fin_linha_imutavel');
      db.exec(`CREATE TRIGGER trg_fin_linha_imutavel
        BEFORE UPDATE ON fin_linhas
        FOR EACH ROW WHEN (SELECT status FROM fin_lotes WHERE id = OLD.lote_id) <> 'rascunho' AND (
             NEW.lote_id         <> OLD.lote_id
          OR NEW.conta_id        <> OLD.conta_id
          OR NEW.debito_cents    <> OLD.debito_cents
          OR NEW.credito_cents   <> OLD.credito_cents
          OR NEW.centro_custo_id <> OLD.centro_custo_id
          OR NEW.contraparte_id  <> OLD.contraparte_id
          OR NEW.ordem           <> OLD.ordem
        )
        BEGIN
          SELECT RAISE(ABORT, 'linha de lote contabilizado e imutavel');
        END`);
    },
  },
  {
    // Ativos fixos: `CREATE TABLE IF NOT EXISTS` cria em banco novo, mas o
    // banco de produção já existe — sem a migração, a tabela nunca nasceria
    // lá. Idempotente: o próprio CREATE já é condicional.
    nome: 'fin-0003-ativos-fixos',
    aplicar() {
      db.exec(`CREATE TABLE IF NOT EXISTS fin_ativos (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, entidade_id TEXT NOT NULL,
        nome TEXT NOT NULL, categoria TEXT NOT NULL DEFAULT '',
        conta_id TEXT NOT NULL DEFAULT '', centro_custo_id TEXT NOT NULL DEFAULT '',
        aquisicao TEXT NOT NULL, custo_cents INTEGER NOT NULL DEFAULT 0,
        residual_cents INTEGER NOT NULL DEFAULT 0, vida_util_meses INTEGER NOT NULL DEFAULT 0,
        inicio_depreciacao TEXT NOT NULL DEFAULT '', depreciado_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ativo', baixa_data TEXT NOT NULL DEFAULT '',
        baixa_motivo TEXT NOT NULL DEFAULT '', criado_em TEXT NOT NULL,
        criado_por TEXT NOT NULL DEFAULT '')`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_fin_ativos ON fin_ativos(tenant_id, entidade_id, status)');
    },
  },
  {
    // Consolidação com eliminações: a contraparte pode APONTAR para outra
    // empresa da mesma conta. É o que permite dizer "isto é operação entre
    // as nossas empresas" sem adivinhar por nome ou CNPJ.
    nome: 'fin-0004-contraparte-do-grupo',
    aplicar() {
      if (!temColuna('fin_contrapartes', 'entidade_grupo_id')) {
        db.exec("ALTER TABLE fin_contrapartes ADD COLUMN entidade_grupo_id TEXT NOT NULL DEFAULT ''");
      }
    },
  },
  {
    // Régua de cobrança: o índice ÚNICO por (parcela, passo) é a trava que
    // impede o mesmo passo de ser registrado duas vezes — sem ele, dois
    // cliques seguidos gerariam duas cobranças no histórico.
    nome: 'fin-0005-cobrancas',
    aplicar() {
      db.exec(`CREATE TABLE IF NOT EXISTS fin_cobrancas (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, entidade_id TEXT NOT NULL,
        parcela_id TEXT NOT NULL, passo TEXT NOT NULL, canal TEXT NOT NULL DEFAULT '',
        observacao TEXT NOT NULL DEFAULT '', criado_em TEXT NOT NULL,
        criado_por TEXT NOT NULL DEFAULT '')`);
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_cobrancas_passo ON fin_cobrancas(tenant_id, parcela_id, passo)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_fin_cobrancas_ent ON fin_cobrancas(tenant_id, entidade_id)');
    },
  },
  {
    // F5: a idempotencia do pagamento recorrente era so de codigo (consulta
    // antes de inserir). Num processo so isso basta, porque registrarPagamento
    // e sincrona do inicio ao fim e nada interrompe no meio — mas basta o
    // Render subir uma segunda instancia, ou alguem pos um await ali dentro,
    // para nascer fatura duplicada, que e erro que o cliente VE. O indice
    // torna a invariante do banco, nao da rotina.
    //
    // Parcial (externo_ref <> '') porque fatura manual nasce sem referencia
    // externa e sao muitas com string vazia. Atencao ao gotcha da casa: um
    // UNIQUE parcial NAO e inferido por ON CONFLICT — a consulta previa
    // continua sendo o caminho normal; o indice e a rede.
    nome: 'fin-0009-invoices-externo-ref-unico',
    aplicar() {
      const dup = db.prepare(
        `SELECT tenant_id, externo_ref, COUNT(*) n FROM invoices
          WHERE externo_ref <> '' GROUP BY tenant_id, externo_ref HAVING n > 1`).all();
      if (dup.length) {
        // NAO derruba o modulo por dado sujo: avisa alto e deixa o indice para
        // depois da limpeza. Migracao que aborta aqui tira o Finance do ar.
        console.error('[finance] fatura duplicada por referencia externa em '
          + dup.length + ' caso(s) — indice unico NAO criado. Limpe e rode de novo:');
        dup.slice(0, 5).forEach((d) => console.error('  tenant=' + d.tenant_id + ' ref=' + d.externo_ref + ' x' + d.n));
        return;
      }
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_invoices_ref
                 ON invoices(tenant_id, externo_ref) WHERE externo_ref <> ''`);
    },
  },
];

for (const m of MIGRACOES) {
  if (db.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
  if (typeof m.aplicar === 'function') m.aplicar(); else db.exec(m.sql);
  db.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)').run(m.nome, new Date().toISOString());
}

// ---- tabelas sob isolamento de tenant --------------------------------
// Descobertas do próprio schema: qualquer tabela com coluna tenant_id.
// É isto que faz uma tabela nova entrar sozinha no teste anti-vazamento.
function mapearTabelasComTenant() {
  const nomes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(r => r.name);
  const set = new Set();
  for (const t of nomes) if (colunas(t).includes('tenant_id')) set.add(t);
  return set;
}
const TABELAS_TENANT = mapearTabelasComTenant();

// Catálogos globais: nenhum guarda dado de cliente.
const TABELAS_CATALOGO = new Set(['plans', 'migrations']);

// MISTAS: guardam linhas de plataforma (tenant_id = '') e de cliente na
// mesma tabela. O guarda exige predicado de tenant_id no SQL, mas não
// exige contexto — a auditoria de plataforma grava sem tenant escolhido.
const TABELAS_MISTAS = new Set(['audit_logs', 'fin_eventos']);

const nowISO = () => new Date().toISOString();
const hojeISO = () => new Date().toISOString().slice(0, 10);
const novoId = () => crypto.randomBytes(9).toString('base64url');
const competenciaDe = (data) => String(data || '').slice(0, 7);

let _txDepth = 0;
function transacao(fn) {
  if (_txDepth > 0) { _txDepth++; try { return fn(); } finally { _txDepth--; } }
  _txDepth = 1; db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  finally { _txDepth = 0; }
}
const emTransacao = () => _txDepth > 0;

const j = {
  parse(s, padrao) { try { return s == null || s === '' ? padrao : JSON.parse(s); } catch { return padrao; } },
  str(o) { try { return JSON.stringify(o == null ? null : o); } catch { return 'null'; } },
};

module.exports = {
  db, transacao, emTransacao, nowISO, hojeISO, novoId, competenciaDe, j,
  DATA_DIR, SAAS_DIR, DB_PATH,
  colunas, temColuna, TABELAS_TENANT, TABELAS_CATALOGO, TABELAS_MISTAS,
};
