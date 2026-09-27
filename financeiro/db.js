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
    // Consultas patrimoniais: documentos cifrados, agenda por alvo e
    // resultados append-only. O schema cobre banco novo; esta migracao
    // leva as mesmas tabelas para os bancos que ja estao em producao.
    nome: 'fin-0010-consultas-patrimoniais',
    aplicar() {
      db.exec(`CREATE TABLE IF NOT EXISTS fin_consulta_alvos (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entidade_id TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
        nome TEXT NOT NULL, tipo TEXT NOT NULL, documento_cifrado TEXT NOT NULL,
        documento_hash TEXT NOT NULL, documento_mascarado TEXT NOT NULL,
        frequencia TEXT NOT NULL DEFAULT 'trimestral', fontes TEXT NOT NULL DEFAULT '[]',
        proxima_consulta TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL, criado_por TEXT NOT NULL DEFAULT '',
        atualizado_em TEXT NOT NULL DEFAULT '',
        CHECK (tipo IN ('pf','pj')),
        CHECK (frequencia IN ('manual','mensal','trimestral','semestral','anual'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_consulta_alvo_doc
        ON fin_consulta_alvos(tenant_id, entidade_id, documento_hash);
      CREATE INDEX IF NOT EXISTS idx_fin_consulta_alvo_agenda
        ON fin_consulta_alvos(tenant_id, entidade_id, ativo, proxima_consulta);
      CREATE TABLE IF NOT EXISTS fin_consulta_resultados (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entidade_id TEXT NOT NULL REFERENCES fin_entidades(id) ON DELETE CASCADE,
        alvo_id TEXT NOT NULL REFERENCES fin_consulta_alvos(id) ON DELETE CASCADE, fonte TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'nao_verificado', resumo TEXT NOT NULL DEFAULT '',
        proxima_acao TEXT NOT NULL DEFAULT '', credito_ref TEXT NOT NULL DEFAULT '',
        valor_confirmado_cents INTEGER NOT NULL DEFAULT 0,
        valor_potencial_cents INTEGER NOT NULL DEFAULT 0,
        consultado_em TEXT NOT NULL, criado_por TEXT NOT NULL DEFAULT '',
        CHECK (status IN ('confirmado','possivel','consulta_pendente','nada_localizado','atencao','nao_verificado'))
      );
      CREATE INDEX IF NOT EXISTS idx_fin_consulta_resultado_alvo
        ON fin_consulta_resultados(tenant_id, entidade_id, alvo_id, consultado_em DESC);
      CREATE INDEX IF NOT EXISTS idx_fin_consulta_resultado_fonte
        ON fin_consulta_resultados(tenant_id, alvo_id, fonte, consultado_em DESC);`);
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
  {
    // Fases 7/8, Marco 1: fundacao privada da inteligencia de investimentos.
    // Nasce sem cotacao, recomendacao ou execucao: apenas acesso, configuracao
    // e os tres mandatos aprovados no desenho. A feature segue off por padrao.
    nome: 'fin-0011-investimentos-ceo-fundacao',
    aplicar() {
      db.exec(`CREATE TABLE IF NOT EXISTS fin_inv_acessos (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        usuario_id TEXT NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
        papel TEXT NOT NULL DEFAULT 'ceo', ativo INTEGER NOT NULL DEFAULT 1,
        concedido_em TEXT NOT NULL, concedido_por TEXT NOT NULL DEFAULT '',
        revogado_em TEXT NOT NULL DEFAULT '', revogado_por TEXT NOT NULL DEFAULT '',
        CHECK (papel IN ('ceo'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_inv_acesso_usuario
        ON fin_inv_acessos(tenant_id, usuario_id);
      CREATE TABLE IF NOT EXISTS fin_inv_config (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        moeda_base TEXT NOT NULL DEFAULT 'BRL', timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
        radar_hora TEXT NOT NULL DEFAULT '07:00', relatorio_dia_semana INTEGER NOT NULL DEFAULT 5,
        relatorio_hora TEXT NOT NULL DEFAULT '08:00', alertas_ativos INTEGER NOT NULL DEFAULT 1,
        metodologia_versao_ativa TEXT NOT NULL DEFAULT 'fundacao-v1',
        criado_em TEXT NOT NULL, criado_por TEXT NOT NULL DEFAULT '', atualizado_em TEXT NOT NULL DEFAULT '',
        UNIQUE (tenant_id), CHECK (relatorio_dia_semana BETWEEN 0 AND 6)
      );
      CREATE TABLE IF NOT EXISTS fin_inv_mandatos (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        chave TEXT NOT NULL, nome TEXT NOT NULL, horizonte_dias INTEGER NOT NULL DEFAULT 0,
        liquidez_minima_cents INTEGER NOT NULL DEFAULT 0, perda_maxima_ppm INTEGER NOT NULL DEFAULT 0,
        limites TEXT NOT NULL DEFAULT '{}', benchmarks TEXT NOT NULL DEFAULT '[]',
        ativo INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL, criado_por TEXT NOT NULL DEFAULT '',
        CHECK (chave IN ('caixa','longo_prazo','oportunidades')),
        CHECK (horizonte_dias >= 0), CHECK (liquidez_minima_cents >= 0), CHECK (perda_maxima_ppm >= 0)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_inv_mandato_versao
        ON fin_inv_mandatos(tenant_id, chave, versao);
      CREATE INDEX IF NOT EXISTS idx_fin_inv_mandato_ativo
        ON fin_inv_mandatos(tenant_id, ativo, chave);`);
    },
  },
  {
    // Fases 7/8, Marco 2: espinha dorsal de fontes, evidências, dupla análise
    // e memorandos. Nenhuma tabela transmite operação ou escreve no razão.
    nome: 'fin-0012-investimentos-cobertura-analitica',
    aplicar() {
      db.exec(`CREATE TABLE IF NOT EXISTS fin_inv_fontes (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        chave TEXT NOT NULL, nome TEXT NOT NULL, categoria TEXT NOT NULL,
        tipo_acesso TEXT NOT NULL, status TEXT NOT NULL, dominio TEXT NOT NULL DEFAULT '',
        atraso_minutos INTEGER NOT NULL DEFAULT 0, licenca_ref TEXT NOT NULL DEFAULT '',
        classes TEXT NOT NULL DEFAULT '[]', condicoes TEXT NOT NULL DEFAULT '',
        versao_catalogo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL,
        criado_por TEXT NOT NULL DEFAULT '', atualizado_em TEXT NOT NULL DEFAULT '',
        UNIQUE (tenant_id, chave),
        CHECK (tipo_acesso IN ('publica','licenciada','manual')),
        CHECK (status IN ('aprovada_prototipo','condicional','bloqueada','manual','ativa')),
        CHECK (atraso_minutos >= 0)
      );
      CREATE INDEX IF NOT EXISTS idx_fin_inv_fontes_status
        ON fin_inv_fontes(tenant_id, status, chave);
      CREATE TABLE IF NOT EXISTS fin_inv_instrumentos (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        classe TEXT NOT NULL, subclasse TEXT NOT NULL DEFAULT '', nome TEXT NOT NULL,
        ticker TEXT NOT NULL DEFAULT '', identificadores TEXT NOT NULL DEFAULT '{}',
        moeda TEXT NOT NULL DEFAULT '', pais TEXT NOT NULL DEFAULT '', bolsa TEXT NOT NULL DEFAULT '',
        emissor TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'observacao',
        metadados TEXT NOT NULL DEFAULT '{}', criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL,
        CHECK (status IN ('observacao','ativo','inativo','sem_cobertura'))
      );
      CREATE INDEX IF NOT EXISTS idx_fin_inv_instrumentos_classe
        ON fin_inv_instrumentos(tenant_id, classe, status, nome);
      CREATE TABLE IF NOT EXISTS fin_inv_evidencias (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        instrumento_id TEXT REFERENCES fin_inv_instrumentos(id) ON DELETE CASCADE,
        fonte_id TEXT NOT NULL REFERENCES fin_inv_fontes(id), tipo TEXT NOT NULL,
        periodo_ref TEXT NOT NULL DEFAULT '', capturado_em TEXT NOT NULL,
        valor_minor INTEGER, escala INTEGER, unidade TEXT NOT NULL DEFAULT '',
        moeda TEXT NOT NULL DEFAULT '', dados TEXT NOT NULL DEFAULT '{}',
        integridade TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', sha256 TEXT NOT NULL,
        expira_em TEXT NOT NULL DEFAULT '', criado_em TEXT NOT NULL,
        CHECK (integridade IN ('valida','atrasada','vencida','conflitante','incompleta')),
        CHECK (escala IS NULL OR escala BETWEEN 0 AND 12)
      );
      CREATE INDEX IF NOT EXISTS idx_fin_inv_evidencias_alvo
        ON fin_inv_evidencias(tenant_id, instrumento_id, tipo, capturado_em DESC);
      CREATE TABLE IF NOT EXISTS fin_inv_execucoes (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL, alvo_tipo TEXT NOT NULL, alvo_id TEXT NOT NULL DEFAULT '',
        dataset_hash TEXT NOT NULL, metodologia_versao TEXT NOT NULL,
        prompt_versao TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
        iniciada_em TEXT NOT NULL, concluida_em TEXT NOT NULL DEFAULT '',
        erro TEXT NOT NULL DEFAULT '', chave_idempotencia TEXT NOT NULL,
        CHECK (tipo IN ('radar','semanal','instrumento','carteira','imovel','leilao')),
        CHECK (status IN ('pendente','executando','concluida','falhou','bloqueada')),
        UNIQUE (tenant_id, chave_idempotencia)
      );
      CREATE TABLE IF NOT EXISTS fin_inv_resultados_motor (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        execucao_id TEXT NOT NULL REFERENCES fin_inv_execucoes(id) ON DELETE CASCADE,
        motor TEXT NOT NULL, status TEXT NOT NULL, resultado TEXT NOT NULL DEFAULT '{}',
        conclusao TEXT NOT NULL DEFAULT 'nao_conclusivo', confianca_ppm INTEGER NOT NULL DEFAULT 0,
        modelo TEXT NOT NULL DEFAULT '', tokens_entrada INTEGER NOT NULL DEFAULT 0,
        tokens_saida INTEGER NOT NULL DEFAULT 0, custo_usd_micros INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL, CHECK (motor IN ('quantitativo','critico_ia')),
        CHECK (status IN ('pendente','concluido','falhou','bloqueado')),
        CHECK (confianca_ppm BETWEEN 0 AND 1000000),
        UNIQUE (tenant_id, execucao_id, motor)
      );
      CREATE TABLE IF NOT EXISTS fin_inv_conciliacoes (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        execucao_id TEXT NOT NULL REFERENCES fin_inv_execucoes(id) ON DELETE CASCADE,
        convergencias TEXT NOT NULL DEFAULT '[]', divergencias TEXT NOT NULL DEFAULT '[]',
        questoes_abertas TEXT NOT NULL DEFAULT '[]', recomendacao TEXT NOT NULL,
        confianca_ppm INTEGER NOT NULL DEFAULT 0, validade_ate TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL, CHECK (recomendacao IN
          ('comprar','manter','reduzir','vender','evitar','nao_conclusivo')),
        CHECK (confianca_ppm BETWEEN 0 AND 1000000),
        UNIQUE (tenant_id, execucao_id)
      );
      CREATE TABLE IF NOT EXISTS fin_inv_memorandos (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        execucao_id TEXT NOT NULL REFERENCES fin_inv_execucoes(id) ON DELETE CASCADE,
        mandato_id TEXT NOT NULL REFERENCES fin_inv_mandatos(id), titulo TEXT NOT NULL,
        resumo TEXT NOT NULL DEFAULT '', recomendacao TEXT NOT NULL, status TEXT NOT NULL,
        cenarios TEXT NOT NULL DEFAULT '{}', riscos TEXT NOT NULL DEFAULT '[]',
        gatilhos TEXT NOT NULL DEFAULT '[]', fontes TEXT NOT NULL DEFAULT '[]',
        validade_ate TEXT NOT NULL, versao INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL, criado_por TEXT NOT NULL DEFAULT '',
        CHECK (recomendacao IN ('comprar','manter','reduzir','vender','evitar','nao_conclusivo')),
        CHECK (status IN ('rascunho','aguardando_ceo','aprovado','rejeitado','adiado','vencido'))
      );
      CREATE INDEX IF NOT EXISTS idx_fin_inv_memorandos_status
        ON fin_inv_memorandos(tenant_id, status, validade_ate);`);
    },
  },
  {
    // Histórico das sondagens oficiais. Sondar prova disponibilidade e
    // contrato de resposta, mas não ativa a fonte nem cria recomendação.
    nome: 'fin-0013-investimentos-coletas-fontes',
    aplicar() {
      db.exec(`CREATE TABLE IF NOT EXISTS fin_inv_coletas (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        fonte_id TEXT NOT NULL REFERENCES fin_inv_fontes(id) ON DELETE CASCADE,
        status TEXT NOT NULL, iniciada_em TEXT NOT NULL, concluida_em TEXT NOT NULL,
        registros INTEGER NOT NULL DEFAULT 0, dataset_hash TEXT NOT NULL DEFAULT '',
        resumo TEXT NOT NULL DEFAULT '{}', erro TEXT NOT NULL DEFAULT '',
        criado_por TEXT NOT NULL DEFAULT '',
        CHECK (status IN ('sucesso','falhou','bloqueada')),
        CHECK (registros >= 0)
      );
      CREATE INDEX IF NOT EXISTS idx_fin_inv_coletas_fonte
        ON fin_inv_coletas(tenant_id, fonte_id, iniciada_em DESC);`);
    },
  },
  {
    // Uma mesma observação normalizada não entra duas vezes. O índice não
    // transforma fonte de protótipo em fonte ativa nem habilita motores.
    nome: 'fin-0014-investimentos-evidencias-idempotentes',
    aplicar() {
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_inv_evidencia_unica
        ON fin_inv_evidencias(tenant_id, fonte_id, tipo, periodo_ref, sha256);
      CREATE INDEX IF NOT EXISTS idx_fin_inv_evidencias_integridade
        ON fin_inv_evidencias(tenant_id, integridade, capturado_em DESC);`);
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
// A data-FATO (competência, data do lançamento, vencimento) é a do fuso de
// quem lança, não a do servidor. Com UTC, das 21h à meia-noite de Brasília o
// sistema já estava no dia seguinte — e na virada do mês, na competência
// seguinte. `nowISO` continua UTC de propósito: carimbo de tempo é instante,
// não é dia.
const FUSO_PADRAO = process.env.FINANCE_TZ || 'America/Sao_Paulo';
// en-CA dá YYYY-MM-DD, que é o formato que o banco guarda.
const hojeEm = (tz) => new Date().toLocaleDateString('en-CA', { timeZone: tz || FUSO_PADRAO });
const competenciaEm = (tz) => hojeEm(tz).slice(0, 7);
const hojeISO = () => hojeEm(FUSO_PADRAO);
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
  db, transacao, emTransacao, nowISO, hojeEm, competenciaEm, FUSO_PADRAO, hojeISO, novoId, competenciaDe, j,
  DATA_DIR, SAAS_DIR, DB_PATH,
  colunas, temColuna, TABELAS_TENANT, TABELAS_CATALOGO, TABELAS_MISTAS,
};
