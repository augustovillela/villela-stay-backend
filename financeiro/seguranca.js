// =====================================================================
// Villela Finance — varredura de segurança do próprio código.
//
// Isto NÃO é um pentest e não se apresenta como tal. É uma varredura
// estática das regras que ESTE módulo se impôs: as que, se quebradas em
// silêncio, derrubariam o isolamento ou vazariam segredo. Rodá-la no CI
// faz a regressão aparecer no pull request, não em produção.
//
//   npm run seguranca:finance
//
// O que ela alcança: SQL fora do repositório, segredo no código, tabela
// nova sem guarda, ação material rebaixada, dependência vulnerável.
// O que NÃO alcança: lógica de autorização errada, IDOR, injeção em
// caminho não previsto, engenharia social. Isso é trabalho de pentest —
// ver docs/financeiro/PENTEST.md.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const arquivos = () => fs.readdirSync(DIR).filter(f => f.endsWith('.js') && f !== 'selftest.js');
const ler = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const achados = [];
const achar = (gravidade, regra, arquivo, detalhe) => achados.push({ gravidade, regra, arquivo, detalhe });

// ---------------------------------------------------------------------
// 1. SQL cru fora dos arquivos autorizados.
//    O guarda de isolamento vive no repo.js; `db.prepare` fora dele passa
//    por cima dele. As exceções são explícitas e poucas.
// ---------------------------------------------------------------------
// Exceção com o MOTIVO junto: lista sem justificativa vira lixeira onde
// se joga o que incomoda o scanner.
const PODEM_SQL_CRU = {
  'repo.js': 'é o próprio guarda',
  'db.js': 'conexão, schema e migrações',
  'sessao.js': 'consultas PRÉ-CONTEXTO do login — circular por natureza, e são só estas',
  'restauracao.js': 'opera sobre o banco RESTAURADO, não sobre o de produção',
  'paginas.js': 'fin_interessados é da plataforma, não tem tenant_id',
  'seguranca.js': 'introspecção do sqlite_master para conferir os gatilhos',
};
function sqlCru() {
  for (const f of arquivos()) {
    if (PODEM_SQL_CRU[f]) continue;
    const linhas = ler(f).split('\n');
    linhas.forEach((linha, i) => {
      if (/\bdb\.prepare\s*\(/.test(linha) && !/^\s*(\/\/|\*)/.test(linha)) {
        achar('alta', 'sql-cru-fora-do-repo', f,
          `linha ${i + 1}: db.prepare fora do repo.js — passa por cima do guarda de isolamento`);
      }
    });
  }
}

// ---------------------------------------------------------------------
// 2. Segredo no código. Nunca deve haver valor; só nome de variável.
// ---------------------------------------------------------------------
const PADROES_SEGREDO = [
  [/sk-ant-[A-Za-z0-9-]{20,}/, 'chave da Anthropic'],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'chave privada'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'chave da AWS'],
  [/\bAPP_USR-[0-9a-f-]{20,}/, 'token do Mercado Pago'],
  [/(senha|password|secret|token)\s*[:=]\s*['"][^'"\s$]{12,}['"]/i, 'literal com cara de segredo'],
];
const FALSOS = /senha-forte|senha-errada|senha-de-teste|senha-longa|dev-local|exemplo|placeholder|process\.env|randomBytes|<senha/i;

function segredoNoCodigo() {
  for (const f of arquivos()) {
    ler(f).split('\n').forEach((linha, i) => {
      if (FALSOS.test(linha)) return;
      for (const [re, nome] of PADROES_SEGREDO) {
        if (re.test(linha)) achar('critica', 'segredo-no-codigo', f, `linha ${i + 1}: ${nome}`);
      }
    });
  }
}

// ---------------------------------------------------------------------
// 3. Toda tabela com tenant_id tem de estar sob o guarda.
//    O db.js descobre pelo schema; aqui se confere que nada foi
//    silenciosamente movido para as listas de exceção.
// ---------------------------------------------------------------------
function guardaDeTenant() {
  const { TABELAS_TENANT, TABELAS_CATALOGO, TABELAS_MISTAS } = require('./db');
  const excecoes = [...TABELAS_CATALOGO, ...TABELAS_MISTAS];
  const sobGuarda = [...TABELAS_TENANT].filter(t => !excecoes.includes(t));
  if (sobGuarda.length < 15) {
    achar('critica', 'guarda-de-tenant', 'db.js',
      `só ${sobGuarda.length} tabela(s) sob guarda — alguém moveu tabela para as exceções?`);
  }
  // Exceção com tenant_id é aceitável só para as MISTAS, que são duas.
  const catalogoComTenant = [...TABELAS_CATALOGO].filter(t => TABELAS_TENANT.has(t));
  for (const t of catalogoComTenant) {
    achar('critica', 'guarda-de-tenant', 'db.js',
      `${t} tem tenant_id e está listada como CATÁLOGO — o guarda a ignora`);
  }
}

// ---------------------------------------------------------------------
// 4. Ação material não pode ter sido rebaixada no catálogo.
// ---------------------------------------------------------------------
const MATERIAIS = [
  'pagamento.executar', 'pagamento.lote', 'contraparte.dados_bancarios',
  'periodo.fechar', 'periodo.reabrir', 'lote.estornar', 'usuario.perfil',
  'conta_bancaria.alterar', 'saldo_inicial.definir', 'importacao.desfazer',
  'resultado.apurar', 'contraparte.anonimizar',
];
const PROIBIDAS = ['investimento.ordem', 'investimento.recomendar', 'leilao.lance'];

function niveisDeRisco() {
  const rbac = require('./rbac');
  for (const a of MATERIAIS) {
    const acao = rbac.acao(a);
    if (!acao) { achar('alta', 'nivel-de-risco', 'rbac.js', `a ação material ${a} sumiu do catálogo`); continue; }
    if (acao.nivelMinimo < 3) {
      achar('critica', 'nivel-de-risco', 'rbac.js', `${a} está no nível ${acao.nivelMinimo}; material é 3`);
    }
  }
  for (const a of PROIBIDAS) {
    const acao = rbac.acao(a);
    if (!acao) { achar('alta', 'nivel-de-risco', 'rbac.js', `a ação proibida ${a} sumiu do catálogo`); continue; }
    if (acao.nivelMinimo < 4) {
      achar('critica', 'nivel-de-risco', 'rbac.js',
        `${a} deixou de ser nível 4 — só sai de lá por decisão registrada (ROADMAP fases 7-8)`);
    }
    if (!acao.motivo) achar('media', 'nivel-de-risco', 'rbac.js', `${a} é proibida mas não diz por quê`);
  }
  // A porta do agente lê o catálogo; o teto não pode ter subido.
  const { NIVEL_MAXIMO_AGENTE } = require('./rotas-agente');
  if (NIVEL_MAXIMO_AGENTE > 2) {
    achar('critica', 'porta-do-agente', 'rotas-agente.js',
      `o teto da chave de agente subiu para ${NIVEL_MAXIMO_AGENTE} — ela alcançaria ação material`);
  }
}

// ---------------------------------------------------------------------
// 5. Os gatilhos que sustentam as invariantes têm de estar no schema.
// ---------------------------------------------------------------------
const GATILHOS = [
  'trg_fin_lote_imutavel', 'trg_fin_lote_sem_delete', 'trg_fin_linha_imutavel',
  'trg_fin_linha_sem_delete', 'trg_fin_periodo_fechado', 'trg_fin_linha_conta_analitica',
  'trg_fin_audit_sem_update', 'trg_fin_audit_sem_delete',
];
function gatilhos() {
  const { db } = require('./db');
  const presentes = new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map(r => r.name));
  for (const g of GATILHOS) {
    if (!presentes.has(g)) achar('critica', 'gatilho-ausente', 'schema.sql', `${g} não existe no banco`);
  }
}

// ---------------------------------------------------------------------
// 6. Dependências com vulnerabilidade conhecida (npm audit).
// ---------------------------------------------------------------------
function dependencias() {
  const { execFileSync } = require('child_process');
  try {
    const saida = execFileSync('npm', ['audit', '--json', '--audit-level=high'],
      { cwd: path.join(DIR, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const j = JSON.parse(saida);
    const v = (j.metadata && j.metadata.vulnerabilities) || {};
    if (v.critical) achar('critica', 'dependencia', 'package.json', `${v.critical} dependência(s) com vulnerabilidade crítica`);
    if (v.high) achar('alta', 'dependencia', 'package.json', `${v.high} dependência(s) com vulnerabilidade alta`);
    return { criticas: v.critical || 0, altas: v.high || 0, medias: v.moderate || 0 };
  } catch (e) {
    // `npm audit` sai com código != 0 quando ACHA vulnerabilidade — a saída
    // ainda é JSON útil, e é o caso normal, não erro.
    try {
      const j = JSON.parse(String(e.stdout || '{}'));
      const v = (j.metadata && j.metadata.vulnerabilities) || {};
      if (v.critical) achar('critica', 'dependencia', 'package.json', `${v.critical} crítica(s)`);
      if (v.high) achar('alta', 'dependencia', 'package.json', `${v.high} alta(s)`);
      return { criticas: v.critical || 0, altas: v.high || 0, medias: v.moderate || 0 };
    } catch (_) {
      achar('informativa', 'dependencia', 'package.json', 'npm audit não pôde rodar (offline?)');
      return null;
    }
  }
}

function varrer() {
  achados.length = 0;
  sqlCru();
  segredoNoCodigo();
  guardaDeTenant();
  niveisDeRisco();
  gatilhos();
  const deps = dependencias();
  const porGravidade = (g) => achados.filter(a => a.gravidade === g);
  return {
    achados,
    criticas: porGravidade('critica').length,
    altas: porGravidade('alta').length,
    medias: porGravidade('media').length,
    dependencias: deps,
    ok: porGravidade('critica').length === 0 && porGravidade('alta').length === 0,
    escopo: 'Varredura estática das regras deste módulo. NÃO é pentest — ver docs/financeiro/PENTEST.md.',
  };
}

if (require.main === module) {
  process.env.DATA_DIR = process.env.DATA_DIR ||
    path.join(require('os').tmpdir(), 'finance-seguranca-' + Date.now());
  fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
  const r = varrer();
  console.log('\nVillela Finance — varredura de segurança\n' + '='.repeat(46));
  if (!r.achados.length) console.log('  Nenhum achado.');
  for (const a of r.achados) console.log(`  [${a.gravidade.toUpperCase()}] ${a.regra} · ${a.arquivo}\n      ${a.detalhe}`);
  if (r.dependencias) {
    console.log(`\n  dependências: ${r.dependencias.criticas} crítica(s), ${r.dependencias.altas} alta(s), ${r.dependencias.medias} média(s)`);
  }
  console.log('\n  ' + r.escopo);
  console.log('='.repeat(46) + '\n');
  process.exit(r.ok ? 0 : 1);
}

module.exports = { varrer, GATILHOS, MATERIAIS, PROIBIDAS, PODEM_SQL_CRU };
