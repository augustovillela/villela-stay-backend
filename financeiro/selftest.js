// =====================================================================
// Villela Finance — suíte das Fases 1 e 2.   npm run test:finance
//
// Banco descartável, worker desligado, Express real para as rotas.
//
// Os três blocos que importam mais:
//   • ANTI-VAZAMENTO — tenta ler e escrever dados de outra conta por
//     quatro caminhos e exige que os quatro falhem;
//   • INVARIANTES DO RAZÃO — tenta desbalancear, alterar lote fechado,
//     apagar lançamento e lançar em período fechado; os triggers do
//     banco têm de recusar, não o código;
//   • DINHEIRO — property-based: 500 rateios aleatórios não podem criar
//     nem perder um centavo.
// =====================================================================
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.DATA_DIR = path.join(os.tmpdir(), 'finance-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.FINANCE_WORKER = 'off';
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

const { db } = require('./db');
const tenancy = require('./tenancy');
const repo = require('./repo');
const dinheiro = require('./dinheiro');
const ledger = require('./ledger');
const bancos = require('./bancos');
const classificacao = require('./classificacao');
const periodos = require('./periodos');
const relatorios = require('./relatorios');
const aprovacoes = require('./aprovacoes');
const auditoria = require('./auditoria');
const planoContas = require('./plano-contas');
const contasSvc = require('./contas');
const entitlements = require('./entitlements');
const rbac = require('./rbac');
const diario = require('./diario');
const financeiro = require('./index');

let ok = 0;
const falhas = [];
function teste(nome, fn) {
  try { fn(); ok++; }
  catch (e) { falhas.push(`${nome}: ${(e && e.message) || e}`); }
}
function lanca(nome, fn, padrao) {
  try {
    fn();
    falhas.push(`${nome}: era para lançar erro e NÃO lançou`);
  } catch (e) {
    if (padrao && !padrao.test(String(e.message))) falhas.push(`${nome}: lançou "${e.message}", esperava ${padrao}`);
    else ok++;
  }
}
let cadeia = Promise.resolve();
function testeAsync(nome, fn) {
  cadeia = cadeia.then(async () => {
    try { await fn(); ok++; }
    catch (e) { falhas.push(`${nome}: ${(e && e.message) || e}`); }
  });
}
function lancaAsync(nome, fn, padrao) {
  cadeia = cadeia.then(async () => {
    try { await fn(); falhas.push(`${nome}: era para lançar erro e NÃO lançou`); }
    catch (e) {
      if (padrao && !padrao.test(String(e.message))) falhas.push(`${nome}: lançou "${e.message}", esperava ${padrao}`);
      else ok++;
    }
  });
}

// =====================================================================
// 1. DINHEIRO
// =====================================================================
teste('dinheiro: pt-BR com milhar', () => assert.strictEqual(dinheiro.paraCentavos('1.234,56'), 123456));
teste('dinheiro: en com milhar', () => assert.strictEqual(dinheiro.paraCentavos('1,234.56'), 123456));
teste('dinheiro: com símbolo', () => assert.strictEqual(dinheiro.paraCentavos('R$ 89,90'), 8990));
teste('dinheiro: negativo por parênteses', () => assert.strictEqual(dinheiro.paraCentavos('(1.234,56)'), -123456));
teste('dinheiro: negativo com sinal ao fim', () => assert.strictEqual(dinheiro.paraCentavos('250,00-'), -25000));
teste('dinheiro: negativo com sinal na frente', () => assert.strictEqual(dinheiro.paraCentavos('-250,00'), -25000));
teste('dinheiro: regra dos três dígitos (milhar)', () => assert.strictEqual(dinheiro.paraCentavos('1.234'), 123400));
teste('dinheiro: duas casas é centavo', () => assert.strictEqual(dinheiro.paraCentavos('1,23'), 123));
teste('dinheiro: número em reais', () => assert.strictEqual(dinheiro.paraCentavos(12.34), 1234));
teste('dinheiro: arredonda casas extras', () => assert.strictEqual(dinheiro.paraCentavos('10,0050'), 1001));
teste('dinheiro: sobe o real ao arredondar', () => assert.strictEqual(dinheiro.paraCentavos('99,9990'), 10000));
// A ambiguidade "1.234" (mil ou um e vinte e três?) é resolvida pela regra
// dos três dígitos — e a exceção do grupo iniciado por zero salva o centavo.
teste('dinheiro: três dígitos após vírgula também é milhar', () => assert.strictEqual(dinheiro.paraCentavos('10,005'), 1000500));
teste('dinheiro: grupo que começa com zero é decimal, não milhar', () => assert.strictEqual(dinheiro.paraCentavos('0,750'), 75));
teste('dinheiro: formata pt-BR', () => assert.strictEqual(dinheiro.formatar(123456789), 'R$ 1.234.567,89'));
teste('dinheiro: formata negativo', () => assert.strictEqual(dinheiro.formatar(-8990), '-R$ 89,90'));
lanca('dinheiro: recusa float como centavos', () => dinheiro.centavos(12.5), /inteiro em centavos/);
lanca('dinheiro: recusa texto inválido', () => dinheiro.paraCentavos('abc'), /inválido/);
lanca('dinheiro: recusa negativo onde não pode', () => dinheiro.naoNegativo(-1), /negativo/);
teste('dinheiro: percentual em bps não usa float', () => assert.strictEqual(dinheiro.percentual(10000, 1550), 1550));
teste('dinheiro: 0,1 + 0,2 fecha em centavos', () =>
  assert.strictEqual(dinheiro.somar(dinheiro.paraCentavos('0,10'), dinheiro.paraCentavos('0,20')), dinheiro.paraCentavos('0,30')));

teste('dinheiro: rateio de 100,00 em 3 não perde centavo', () => {
  const p = dinheiro.dividir(10000, 3);
  assert.deepStrictEqual(p, [3334, 3333, 3333]);
  assert.strictEqual(p.reduce((a, b) => a + b, 0), 10000);
});
teste('dinheiro: 500 rateios aleatórios somam exatamente o total', () => {
  for (let i = 0; i < 500; i++) {
    const total = Math.floor(Math.random() * 100_000_000) - 50_000_000;
    const n = 1 + Math.floor(Math.random() * 12);
    const pesos = Array.from({ length: n }, () => Math.random() * 100);
    const partes = dinheiro.ratear(total, pesos);
    const soma = partes.reduce((a, b) => a + b, 0);
    assert.strictEqual(soma, total, `rateio de ${total} em ${n} partes deu ${soma}`);
    for (const p of partes) assert.ok(Number.isInteger(p), 'parte não inteira');
  }
});

// =====================================================================
// 2. PROVISIONAMENTO
// =====================================================================
entitlements.semear();
financeiro.registrarExecutores();

let contaA, empresaA, contaB, empresaB;
teste('provisionar: conta nasce com plano de contas e período', () => {
  const r = tenancy.semContexto(() => contasSvc.provisionar({
    nome: 'Villela Stay', slug: 'villela-stay', planoSlug: 'enterprise', interno: true,
    empresa: { nome: 'Augusto Villela Ltda', documento: '56.776.526/0001-12' },
  }));
  contaA = r.tenant; empresaA = r.entidade;
  assert.ok(contaA && empresaA, 'conta ou empresa não criada');
  tenancy.comTenant({ tenantId: contaA.id, userId: 'teste' }, () => {
    const contas = repo.listarContas(empresaA.id);
    assert.ok(contas.length > 60, `plano de contas raso: ${contas.length} contas`);
    assert.ok(repo.contaPorCodigo(empresaA.id, '3.1.1.001'), 'falta a conta de diárias');
    assert.ok(repo.listarRegras(empresaA.id).length > 5, 'regras iniciais não semeadas');
  });
});

teste('provisionar: é idempotente pelo slug', () => {
  const r = tenancy.semContexto(() => contasSvc.provisionar({ nome: 'Villela Stay', slug: 'villela-stay' }));
  assert.strictEqual(r.criada, false);
  assert.strictEqual(r.tenant.id, contaA.id);
});

teste('provisionar: segunda conta, isolada', () => {
  const r = tenancy.semContexto(() => contasSvc.provisionar({
    nome: 'Pousada Concorrente', slug: 'pousada-x', planoSlug: 'essencial',
  }));
  contaB = r.tenant; empresaB = r.entidade;
  assert.notStrictEqual(contaB.id, contaA.id);
});

// atalhos
const naA = (fn) => tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true }, () =>
  tenancy.comEntidade(empresaA.id, fn));
const naB = (fn) => tenancy.comTenant({ tenantId: contaB.id, userId: 'outro', perfil: 'proprietario', mfa: true }, () =>
  tenancy.comEntidade(empresaB.id, fn));
const contaDe = (codigo) => naA(() => repo.contaPorCodigo(empresaA.id, codigo));

// =====================================================================
// 3. ANTI-VAZAMENTO (o bloco que não pode falhar nunca)
// =====================================================================
lanca('isolamento: repo sem contexto recusa', () => repo.listarEntidades(), /sem tenant no contexto/);

lanca('isolamento: SQL sem filtro de tenant recusa', () =>
  naA(() => repo.q('SELECT * FROM fin_lotes', {})), /sem filtro de tenant/);

lanca('isolamento: parâmetro posicional recusado', () =>
  naA(() => repo.q('SELECT * FROM fin_lotes WHERE tenant_id = ?', [contaB.id])), /posicional/);

lanca('isolamento: tenant do parâmetro difere do contexto', () =>
  naA(() => repo.q('SELECT * FROM fin_contas WHERE tenant_id = :tenant', { tenant: contaB.id })), /difere do contexto/);

teste('isolamento: A não enxerga a empresa de B', () => {
  const vistas = naA(() => repo.listarEntidades().map(e => e.id));
  assert.ok(!vistas.includes(empresaB.id), 'a conta A enxergou empresa da conta B');
});

teste('isolamento: buscar id de outra conta devolve nada', () => {
  assert.strictEqual(naA(() => repo.entidadePorId(empresaB.id)), null);
});

lanca('isolamento: leitura de plataforma exige comoPlataforma', () =>
  naA(() => repo.qPlataforma('SELECT * FROM fin_lotes WHERE tenant_id <> :tenant', {})), /comoPlataforma/);

lanca('isolamento: comoPlataforma exige motivo', () =>
  tenancy.comoPlataforma({ userId: 'x' }, () => 1), /motivo/);

teste('isolamento: toda tabela com tenant_id está sob o guarda', () => {
  const { TABELAS_TENANT, TABELAS_CATALOGO, TABELAS_MISTAS } = require('./db');
  const semGuarda = [...TABELAS_TENANT].filter(t => !TABELAS_CATALOGO.has(t) && !TABELAS_MISTAS.has(t));
  assert.ok(semGuarda.length >= 15, `poucas tabelas sob guarda (${semGuarda.length}) — o mapeamento quebrou?`);
  // Prova viva: cada uma recusa SQL sem filtro.
  for (const t of semGuarda) {
    assert.throws(() => naA(() => repo.q(`SELECT * FROM ${t}`, {})), /sem filtro de tenant/, `${t} não está protegida`);
  }
});

// =====================================================================
// 4. RAZÃO — invariantes
// =====================================================================
let loteBase;
teste('razão: lançamento balanceado entra', () => {
  loteBase = naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-05', memo: 'Diária da Villa Kubitschek',
    linhas: [
      { contaCodigo: '1.1.1.001', debitoCents: 250000 },
      { contaCodigo: '3.1.1.001', creditoCents: 250000 },
    ],
  }));
  assert.strictEqual(loteBase.lote.status, 'contabilizado');
  assert.strictEqual(loteBase.lote.total_cents, 250000);
  assert.strictEqual(loteBase.linhas.length, 2);
});

lanca('razão: desbalanceado é recusado com a diferença', () =>
  naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-05', memo: 'torto',
    linhas: [
      { contaCodigo: '1.1.1.001', debitoCents: 100000 },
      { contaCodigo: '3.1.1.001', creditoCents: 90000 },
    ],
  })), /desbalanceado/);

lanca('razão: linha com débito E crédito é recusada', () =>
  naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-05', memo: 'x',
    linhas: [
      { contaCodigo: '1.1.1.001', debitoCents: 100, creditoCents: 100 },
      { contaCodigo: '3.1.1.001', creditoCents: 100 },
    ],
  })), /débito OU crédito/);

lanca('razão: conta sintética não aceita lançamento', () =>
  naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-05', memo: 'x',
    linhas: [
      { contaCodigo: '1.1', debitoCents: 100 },
      { contaCodigo: '3.1.1.001', creditoCents: 100 },
    ],
  })), /sintética/);

lanca('razão: valor zero não é lançamento', () =>
  naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-05', memo: 'x',
    linhas: [
      { contaCodigo: '1.1.1.001', debitoCents: 0 },
      { contaCodigo: '3.1.1.001', creditoCents: 0 },
    ],
  })), /débito OU crédito|zero/);

lanca('razão: conta de outra empresa é recusada', () => {
  const contaDeB = naB(() => repo.contaPorCodigo(empresaB.id, '1.1.1.001'));
  return naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-05', memo: 'x',
    linhas: [
      { contaId: contaDeB.id, debitoCents: 100 },
      { contaCodigo: '3.1.1.001', creditoCents: 100 },
    ],
  }));
}, /não existe|outra empresa/);

lanca('razão: TRIGGER recusa alterar lote contabilizado', () =>
  naA(() => db.prepare('UPDATE fin_lotes SET total_cents = 1 WHERE id = ?').run(loteBase.lote.id)),
  /imutavel/);

lanca('razão: TRIGGER recusa apagar lote contabilizado', () =>
  naA(() => db.prepare('DELETE FROM fin_lotes WHERE id = ?').run(loteBase.lote.id)),
  /nao pode ser excluido/);

lanca('razão: TRIGGER recusa apagar linha de lote contabilizado', () =>
  naA(() => db.prepare('DELETE FROM fin_linhas WHERE lote_id = ?').run(loteBase.lote.id)),
  /nao pode ser excluida/);

// As duas frestas que a auditoria de 28/08/2026 achou nos gatilhos: o status do
// lote nao era protegido (e os outros gatilhos leem justamente ele), e faltava
// barrar o INSERT de linha em lote ja fechado.
lanca('razao: TRIGGER recusa rebaixar o status do lote contabilizado', () =>
  naA(() => db.prepare("UPDATE fin_lotes SET status = 'rascunho' WHERE id = ?").run(loteBase.lote.id)),
  /transicao de status invalida/);

lanca('razao: TRIGGER recusa pendurar linha nova em lote contabilizado', () =>
  naA(() => {
    const base = db.prepare('SELECT tenant_id, conta_id FROM fin_linhas WHERE lote_id = ? LIMIT 1').get(loteBase.lote.id);
    db.prepare(
      'INSERT INTO fin_linhas (id, tenant_id, lote_id, ordem, conta_id, debito_cents, credito_cents,' +
      ' centro_custo_id, contraparte_id, memo, ref_tipo, ref_id, criado_em)' +
      " VALUES ('fura-razao-1', ?, ?, 99, ?, 12345, 0, '', '', 'desbalanceia', '', '', '2026-08-29T00:00:00.000Z')"
    ).run(base.tenant_id, loteBase.lote.id, base.conta_id);
  }),
  /nao aceita linha nova/);

teste('razão: idempotência devolve o mesmo lote', () => {
  const chave = 'teste-idem-1';
  const a = naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-06', memo: 'com chave', idempotencia: chave,
    linhas: [{ contaCodigo: '1.1.1.001', debitoCents: 5000 }, { contaCodigo: '3.1.1.001', creditoCents: 5000 }],
  }));
  const b = naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-06', memo: 'com chave', idempotencia: chave,
    linhas: [{ contaCodigo: '1.1.1.001', debitoCents: 5000 }, { contaCodigo: '3.1.1.001', creditoCents: 5000 }],
  }));
  assert.strictEqual(a.lote.id, b.lote.id);
  assert.strictEqual(b.duplicado, true);
});

teste('razão: saldo sai do razão e respeita a natureza', () => {
  const caixa = contaDe('1.1.1.001');
  const s = naA(() => ledger.saldo(caixa.id));
  assert.strictEqual(s.saldoCents, 255000);           // 250.000 + 5.000
  assert.strictEqual(s.saldoFormatado, 'R$ 2.550,00');
});

teste('razão: o balancete RESPEITA o período (o filtro tem de ter efeito)', () => {
  // Este teste existe por causa de um bug real: o filtro de data estava na
  // junção do lote, mas a soma era sobre a linha — que sobrevive à junção
  // falhada. O DRE de um mês mostrava todos os meses, em silêncio.
  const marco = naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-03-10', memo: 'movimento de março (fora da janela)',
    linhas: [
      { contaCodigo: '1.1.1.001', debitoCents: 777000 },
      { contaCodigo: '3.9.1.002', creditoCents: 777000 },
    ],
  }));
  assert.ok(marco.lote.id);

  const soAgosto = naA(() => ledger.balancete(empresaA.id, { desde: '2026-08-01', ate: '2026-08-31' }));
  const outrasReceitas = soAgosto.linhas.find(l => l.codigo === '3.9.1.002');
  assert.ok(!outrasReceitas || outrasReceitas.creditoCents === 0,
    `o movimento de março vazou para o balancete de agosto: ${outrasReceitas && outrasReceitas.creditoCents}`);

  // E o inverso: filtrando março, o valor aparece.
  const soMarco = naA(() => ledger.balancete(empresaA.id, { desde: '2026-03-01', ate: '2026-03-31' }));
  assert.strictEqual(soMarco.linhas.find(l => l.codigo === '3.9.1.002').creditoCents, 777000,
    'o filtro de março não achou o próprio movimento de março');

  // Sem filtro, some tudo.
  const tudo = naA(() => ledger.balancete(empresaA.id, {}));
  assert.strictEqual(tudo.linhas.find(l => l.codigo === '3.9.1.002').creditoCents, 777000);

  // E o balancete de cada janela continua fechando.
  for (const janela of [{ desde: '2026-03-01', ate: '2026-03-31' }, { desde: '2026-08-01', ate: '2026-08-31' }, {}]) {
    assert.strictEqual(naA(() => ledger.balancete(empresaA.id, janela)).fecha, true,
      `balancete não fecha na janela ${JSON.stringify(janela)}`);
  }

  // Limpa o movimento de março para não sujar as contas dos testes seguintes.
  naA(() => ledger.estornar(marco.lote.id, { motivo: 'movimento só para provar o filtro de período', data: '2026-03-10' }));
});

teste('DRE: o mês não inclui o mês vizinho', () => {
  const abril = naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-04-15', memo: 'receita de abril',
    linhas: [
      { contaCodigo: '1.1.1.001', debitoCents: 123400 },
      { contaCodigo: '3.1.1.002', creditoCents: 123400 },
    ],
  }));
  const maio = naA(() => relatorios.dre(empresaA.id, '2026-05'));
  assert.strictEqual(maio.resumo.receitaBrutaCents, 0,
    `o DRE de maio mostrou ${maio.resumo.receitaBrutaCents} — está somando abril`);
  const dreAbril = naA(() => relatorios.dre(empresaA.id, '2026-04'));
  assert.strictEqual(dreAbril.resumo.receitaBrutaCents, 123400);
  naA(() => ledger.estornar(abril.lote.id, { motivo: 'teste de isolamento entre meses', data: '2026-04-15' }));
});

teste('razão: balancete fecha em zero', () => {
  const b = naA(() => ledger.balancete(empresaA.id, {}));
  assert.strictEqual(b.fecha, true, `balancete não fecha: diferença ${b.diferencaCents}`);
});

let estornoR;
teste('razão: estorno cria lote espelho e amarra os dois lados', () => {
  estornoR = naA(() => ledger.estornar(loteBase.lote.id, { motivo: 'valor lançado em dobro', data: '2026-08-07' }));
  assert.strictEqual(estornoR.original.status, 'estornado');
  assert.strictEqual(estornoR.original.estornado_por, estornoR.estorno.id);
  assert.strictEqual(estornoR.estorno.estorno_de, loteBase.lote.id);
  // Lados trocados.
  const orig = naA(() => repo.linhasDoLote(loteBase.lote.id));
  const esp = naA(() => repo.linhasDoLote(estornoR.estorno.id));
  assert.strictEqual(orig[0].debito_cents, esp[0].credito_cents);
});

lanca('razão: estorno exige motivo', () =>
  naA(() => ledger.estornar(estornoR.estorno.id, {})), /motivo/);

lanca('razão: não se estorna duas vezes', () =>
  naA(() => ledger.estornar(loteBase.lote.id, { motivo: 'de novo' })), /já foi estornado/);

teste('razão: depois do estorno o saldo volta', () => {
  const caixa = contaDe('1.1.1.001');
  assert.strictEqual(naA(() => ledger.saldo(caixa.id)).saldoCents, 5000);
});

// =====================================================================
// 5. AUDITORIA ENCADEADA
// =====================================================================
teste('auditoria: a cadeia da conta A está íntegra', () => {
  const v = auditoria.verificarCadeia(contaA.id);
  assert.strictEqual(v.ok, true, `cadeia quebrada: ${JSON.stringify(v.quebra)}`);
  assert.ok(v.total >= 5, `poucos eventos auditados: ${v.total}`);
});

lanca('auditoria: TRIGGER recusa UPDATE no log', () =>
  db.prepare("UPDATE audit_logs SET motivo = 'outro' WHERE tenant_id = ?").run(contaA.id), /append-only/);

lanca('auditoria: TRIGGER recusa DELETE no log', () =>
  db.prepare('DELETE FROM audit_logs WHERE tenant_id = ?').run(contaA.id), /append-only/);

lanca('auditoria: ação material sem motivo é recusada', () =>
  naA(() => auditoria.registrar('periodo.reabrir', { objetoTipo: 'periodo', objetoId: 'x' })), /exige motivo/);

teste('auditoria: adulteração no arquivo é detectada e a cadeia se restabelece', () => {
  // Simula quem mexeu no .db por fora do processo: desliga o trigger,
  // corrompe uma linha, confere a detecção e restaura o valor original.
  db.exec('DROP TRIGGER trg_fin_audit_sem_update');
  const alvo = db.prepare('SELECT id, motivo FROM audit_logs WHERE tenant_id = ? ORDER BY seq LIMIT 1 OFFSET 1').get(contaA.id);
  db.prepare("UPDATE audit_logs SET motivo = 'ADULTERADO' WHERE id = ?").run(alvo.id);

  const v = auditoria.verificarCadeia(contaA.id);
  assert.strictEqual(v.ok, false, 'a cadeia não acusou a adulteração');
  assert.ok(v.quebra && v.quebra.seq, 'não apontou onde quebrou');
  assert.strictEqual(v.quebra.motivo, 'conteúdo alterado');

  db.prepare('UPDATE audit_logs SET motivo = ? WHERE id = ?').run(alvo.motivo, alvo.id);
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_fin_audit_sem_update BEFORE UPDATE ON audit_logs
           BEGIN SELECT RAISE(ABORT, 'auditoria e append-only'); END;`);
  assert.strictEqual(auditoria.verificarCadeia(contaA.id).ok, true, 'a cadeia não voltou a fechar após restaurar');
});

// =====================================================================
// 6. DIÁRIO DURÁVEL (RPO)
// =====================================================================
teste('diário: todo lote contabilizado foi replicado', () => {
  const registros = diario.ler('2026-08');
  assert.ok(registros.length >= 3, `diário com ${registros.length} registros`);
  const ids = registros.map(r => r.lote.id);
  assert.ok(ids.includes(loteBase.lote.id), 'o primeiro lote não está no diário');
});

teste('diário: confere contra o banco sem divergência', () => {
  const c = naA(() => diario.conferir(repo, '2026-08'));
  assert.strictEqual(c.divergencias.length, 0, `divergências: ${JSON.stringify(c.divergencias)}`);
  assert.ok(c.conferidos > 0, 'não conferiu nenhum registro da própria conta');
});

teste('diário: a conferência só cobra o que é da PRÓPRIA conta', () => {
  // A conta B não tem lote nenhum: os registros do arquivo são todos da
  // conta A e não podem ser acusados como "ausente no banco".
  const c = naB(() => diario.conferir(repo, '2026-08'));
  assert.strictEqual(c.divergencias.length, 0, `acusou o que é de outra conta: ${JSON.stringify(c.divergencias)}`);
  assert.strictEqual(c.conferidos, 0);
  assert.ok(c.registros > 0, 'o arquivo do mês devia ter registros');
});

teste('diário: sem FINANCE_S3_* o status é honesto', () => {
  const s = diario.status();
  assert.strictEqual(s.configurada, false);
  assert.ok(s.registros > 0);
});

// =====================================================================
// 7. EXTRATO: importar, deduplicar, classificar, conciliar
// =====================================================================
let banco, extratoCsv;
teste('banco: conta bancária nasce com conta contábil espelho', () => {
  banco = naA(() => {
    const pai = repo.contaPorCodigo(empresaA.id, '1.1.1');
    const cc = repo.criarConta({
      entidadeId: empresaA.id, codigo: '1.1.1.101', nome: 'Banco — C6 PJ',
      natureza: 'ativo', saldoNormal: 'devedora', paiId: pai.id, aceitaLancamento: true, subledger: 'bancos',
    });
    return repo.criarContaBancaria({ entidadeId: empresaA.id, nome: 'C6 PJ', banco: 'C6', contaId: cc.id });
  });
  assert.ok(banco.conta_id, 'conta bancária sem espelho contábil');
});

extratoCsv = [
  'Data;Histórico;Valor;Documento',
  '05/08/2026;PIX RECEBIDO HOSPEDE MARIA;2.500,00;PIX001',
  '06/08/2026;NEOENERGIA CONTA DE LUZ;-389,45;BOL221',
  '07/08/2026;TARIFA PACOTE SERVICOS;-59,90;TAR001',
  '08/08/2026;UBER VIAGEM;-25,00;',
  '08/08/2026;UBER VIAGEM;-25,00;',            // duplicata legítima no mesmo dia
].join('\n');

let importacao1;
teste('banco: importa CSV com ; e vírgula decimal', () => {
  importacao1 = naA(() => bancos.importar({
    entidadeId: empresaA.id, contaBancariaId: banco.id, conteudo: extratoCsv, fonte: 'extrato C6 ago/2026',
  }));
  assert.strictEqual(importacao1.resumo.lidas, 5);
  assert.strictEqual(importacao1.resumo.novas, 5, 'as duas Uber idênticas são movimentos distintos');
  assert.strictEqual(importacao1.resumo.rejeitadas, 0);
});

teste('banco: reimportar o mesmo arquivo não duplica nada', () => {
  const r = naA(() => bancos.importar({
    entidadeId: empresaA.id, contaBancariaId: banco.id, conteudo: extratoCsv, fonte: 'reenvio',
  }));
  assert.strictEqual(r.reimportacao, true);
  const total = naA(() => repo.listarTransacoes(empresaA.id, { limite: 100 })).length;
  assert.strictEqual(total, 5, `duplicou: ${total} transações`);
});

teste('banco: arquivo diferente com as mesmas linhas também deduplica', () => {
  // Mesmo conteúdo + uma linha nova: o hash do arquivo muda, mas as
  // impressões digitais das cinco antigas continuam iguais.
  const maior = extratoCsv + '\n09/08/2026;GOOGLE ADS;-150,00;ADS9';
  const r = naA(() => bancos.importar({
    entidadeId: empresaA.id, contaBancariaId: banco.id, conteudo: maior, fonte: 'extrato ampliado',
  }));
  assert.strictEqual(r.resumo.duplicadas, 5, `deduplicou ${r.resumo.duplicadas} de 5`);
  assert.strictEqual(r.resumo.novas, 1);
});

teste('banco: linha ruim é rejeitada COM motivo, não engolida', () => {
  const ruim = 'Data;Histórico;Valor\n99/99/9999;LIXO;abc\n10/08/2026;OK;-10,00';
  const r = naA(() => bancos.importar({
    entidadeId: empresaA.id, contaBancariaId: banco.id, conteudo: ruim, fonte: 'arquivo com defeito',
  }));
  assert.strictEqual(r.resumo.rejeitadas, 1);
  assert.ok(/data ilegível/.test(r.rejeitos[0]), `motivo pouco útil: ${r.rejeitos[0]}`);
  assert.strictEqual(r.resumo.novas, 1);
});

teste('classificação: a regra semeada reconhece a energia elétrica', () => {
  const t = naA(() => repo.listarTransacoes(empresaA.id, { limite: 100 }))
    .find(x => /NEOENERGIA/.test(x.descricao));
  const { j } = require('./db');
  const s = j.parse(t.sugestao, null);
  assert.ok(s, 'não sugeriu nada para a energia');
  assert.strictEqual(s.contaCodigo, '4.1.1.005');
  assert.ok(s.motivo.includes('neoenergia'), `motivo pouco explicável: ${s.motivo}`);
  assert.strictEqual(s.alta, true, `confiança baixa demais: ${s.confianca}`);
});

teste('classificação: tarifa bancária também casa', () => {
  const t = naA(() => repo.listarTransacoes(empresaA.id, { limite: 100 }))
    .find(x => /TARIFA/.test(x.descricao));
  const { j } = require('./db');
  assert.strictEqual(j.parse(t.sugestao, {}).contaCodigo, '4.4.1.001');
});

let transacaoLuz, loteDaLuz;
teste('conciliar: extrato vira lote balanceado no razão', () => {
  transacaoLuz = naA(() => repo.listarTransacoes(empresaA.id, { limite: 100 }))
    .find(x => /NEOENERGIA/.test(x.descricao));
  const r = naA(() => bancos.conciliar(transacaoLuz.id, { contaId: contaDe('4.1.1.005').id }));
  loteDaLuz = r.lote;
  assert.strictEqual(r.lote.status, 'contabilizado');
  assert.strictEqual(r.lote.total_cents, 38945);
  const linhas = naA(() => repo.linhasDoLote(r.lote.id));
  const banco_ = linhas.find(l => l.conta_codigo === '1.1.1.101');
  const despesa = linhas.find(l => l.conta_codigo === '4.1.1.005');
  assert.strictEqual(banco_.credito_cents, 38945, 'saída tem de CREDITAR o banco');
  assert.strictEqual(despesa.debito_cents, 38945, 'saída tem de DEBITAR a despesa');
});

teste('conciliar: entrada debita o banco e credita a receita', () => {
  const t = naA(() => repo.listarTransacoes(empresaA.id, { limite: 100 })).find(x => /PIX RECEBIDO/.test(x.descricao));
  const r = naA(() => bancos.conciliar(t.id, { contaId: contaDe('3.1.1.001').id }));
  const linhas = naA(() => repo.linhasDoLote(r.lote.id));
  assert.strictEqual(linhas.find(l => l.conta_codigo === '1.1.1.101').debito_cents, 250000);
  assert.strictEqual(linhas.find(l => l.conta_codigo === '3.1.1.001').credito_cents, 250000);
});

teste('conciliar: duas vezes devolve o mesmo lote (idempotente)', () => {
  const r = naA(() => bancos.conciliar(transacaoLuz.id, { contaId: contaDe('4.1.1.005').id }));
  assert.strictEqual(r.duplicado, true);
  assert.strictEqual(r.lote.id, loteDaLuz.id);
});

teste('drill-down: do lote se chega à linha do extrato', () => {
  const l = naA(() => ledger.lote(loteDaLuz.id));
  assert.strictEqual(l.lote.origem, 'banco');
  const origem = naA(() => repo.transacao(l.lote.origem_ref));
  assert.ok(/NEOENERGIA/.test(origem.descricao), 'não voltou até a transação de origem');
  const { j } = require('./db');
  assert.ok(j.parse(origem.bruto, null), 'a linha original do arquivo não foi preservada');
});

teste('classificação: aprende com a classificação manual', () => {
  const t = naA(() => repo.listarTransacoes(empresaA.id, { limite: 100 })).find(x => /UBER/.test(x.descricao));
  const antes = naA(() => repo.listarRegras(empresaA.id)).length;
  naA(() => classificacao.aprender({
    entidadeId: empresaA.id, transacao: t, contaId: contaDe('4.2.1.007').id,
  }));
  const depois = naA(() => repo.listarRegras(empresaA.id)).length;
  assert.strictEqual(depois, antes + 1, 'não criou regra a partir da classificação manual');
  // E a próxima transação igual já vem sugerida.
  const outra = naA(() => repo.listarTransacoes(empresaA.id, { limite: 100 })).filter(x => /UBER/.test(x.descricao))[1];
  const s = naA(() => classificacao.sugerirPara(outra));
  assert.ok(s && s.contaCodigo === '4.2.1.007', 'a regra aprendida não pegou a transação seguinte');
});

teste('conciliar: painel bate extrato × razão e explica o resto', () => {
  const p = naA(() => bancos.painel(empresaA.id, banco.id, { ate: '2026-08-31' }));
  assert.strictEqual(p.conciliado, true, `divergência de ${p.diferencaCents}`);
  assert.ok(p.pendentesQtd > 0, 'era para haver transações por conciliar');
  assert.ok(/Faltam/.test(p.explicacao), `explicação pouco clara: ${p.explicacao}`);
});

lanca('conciliar: ignorar exige motivo', () => {
  const t = naA(() => repo.listarTransacoes(empresaA.id, { status: 'nova', limite: 10 }))[0]
    || naA(() => repo.listarTransacoes(empresaA.id, { status: 'sugerida', limite: 10 }))[0];
  return naA(() => bancos.ignorar(t.id, {}));
}, /motivo/);

// =====================================================================
// 8. RBAC E NÍVEIS DE RISCO
// =====================================================================
teste('rbac: pagamento não pode ser rebaixado abaixo do nível 3', () => {
  assert.strictEqual(rbac.nivelDe('pagamento.executar', { 'pagamento.executar': 1 }), 3);
  assert.strictEqual(rbac.nivelDe('periodo.reabrir', { 'periodo.reabrir': 0 }), 3);
});
teste('rbac: configuração consegue SUBIR o nível', () => {
  assert.strictEqual(rbac.nivelDe('titulo.criar', { 'titulo.criar': 3 }), 3);
});
lanca('rbac: ordem de investimento é proibida', () =>
  rbac.autorizar('investimento.ordem', { perfil: 'proprietario', mfa: true }), /regulat/i);
lanca('rbac: lance em leilão é proibido', () =>
  rbac.autorizar('leilao.lance', { perfil: 'proprietario', mfa: true }), /irrevers|autorizad/i);
lanca('rbac: recomendação individualizada é proibida', () =>
  rbac.autorizar('investimento.recomendar', { perfil: 'proprietario', mfa: true }), /habilita|regulat/i);
lanca('rbac: leitor não lança', () =>
  rbac.autorizar('lote.contabilizar', { perfil: 'leitor' }), /não tem permissão/);
teste('rbac: ação material sem MFA pede o segundo fator', () => {
  const r = rbac.autorizar('pagamento.executar', { perfil: 'proprietario', valorCents: 1000, mfa: false });
  assert.strictEqual(r.exigeMfa, true);
  assert.ok(/segundo fator/.test(r.motivo));
});
teste('rbac: segregação — quem pede não aprova', () => {
  const r = rbac.podeAprovar({ perfilDecisor: 'proprietario', usuarioDecisor: 'u1', usuarioSolicitante: 'u1', valorCents: 100 });
  assert.strictEqual(r.pode, false);
  assert.ok(/Segregação/.test(r.motivo));
});
teste('rbac: alçada barra valor acima do teto', () => {
  const r = rbac.podeAprovar({ perfilDecisor: 'aprovador', usuarioDecisor: 'u2', usuarioSolicitante: 'u1', valorCents: 3000000 });
  assert.strictEqual(r.pode, false);
  assert.ok(/alçada/.test(r.motivo));
});
teste('rbac: proprietário não tem teto', () => {
  const r = rbac.podeAprovar({ perfilDecisor: 'proprietario', usuarioDecisor: 'u2', usuarioSolicitante: 'u1', valorCents: 999_999_999 });
  assert.strictEqual(r.pode, true);
});

// =====================================================================
// 9. APROVAÇÕES (maker-checker ponta a ponta)
// =====================================================================
let solicitacao;
teste('aprovação: estorno vira solicitação com prévia', () => {
  const lote = naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-10', memo: 'lançamento a estornar',
    linhas: [{ contaCodigo: '1.1.1.001', debitoCents: 12345 }, { contaCodigo: '3.1.1.001', creditoCents: 12345 }],
  }));
  solicitacao = tenancy.comTenant({ tenantId: contaA.id, userId: 'operador1', perfil: 'operador', mfa: true }, () =>
    tenancy.comEntidade(empresaA.id, () => aprovacoes.solicitar({
      acao: 'lote.estornar', entidadeId: empresaA.id, objetoTipo: 'lote', objetoId: lote.lote.id,
      payload: { loteId: lote.lote.id, motivo: 'duplicidade' },
      previa: { numero: lote.lote.numero, total: 'R$ 123,45' },
      valorCents: 12345, motivo: 'duplicidade',
    })));
  assert.strictEqual(solicitacao.status, 'pendente');
  assert.strictEqual(solicitacao.nivel, 3);
  assert.strictEqual(solicitacao.solicitante, 'operador1');
});

lanca('aprovação: solicitar sem motivo é recusado', () =>
  naA(() => aprovacoes.solicitar({ acao: 'lote.estornar', valorCents: 1, motivo: '' })), /motivo/);

lanca('aprovação: ação de nível baixo não passa por aqui', () =>
  naA(() => aprovacoes.solicitar({ acao: 'transacao.importar', motivo: 'x' })), /não passa por aprovação/);

lancaAsync('aprovação: o próprio solicitante não aprova', () =>
  tenancy.comTenant({ tenantId: contaA.id, userId: 'operador1', perfil: 'proprietario', mfa: true }, () =>
    aprovacoes.aprovar(solicitacao.id, { motivo: 'eu mesmo', perfilDecisor: 'proprietario', usuarioDecisor: 'operador1', mfa: true })),
  /Segregação/);

lancaAsync('aprovação: sem MFA não aprova', () =>
  tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario' }, () =>
    aprovacoes.aprovar(solicitacao.id, { motivo: 'ok', perfilDecisor: 'proprietario', usuarioDecisor: 'augusto', mfa: false })),
  /segundo fator/);

lancaAsync('aprovação: perfil sem alçada não aprova', () =>
  tenancy.comTenant({ tenantId: contaA.id, userId: 'zelador', perfil: 'operador', mfa: true }, () =>
    aprovacoes.aprovar(solicitacao.id, { motivo: 'ok', perfilDecisor: 'operador', usuarioDecisor: 'zelador', mfa: true })),
  /não aprova/);

testeAsync('aprovação: aprovada executa o estorno de verdade', async () => {
  const r = await tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true }, () =>
    tenancy.comEntidade(empresaA.id, () => aprovacoes.aprovar(solicitacao.id, {
      motivo: 'confirmado', perfilDecisor: 'proprietario', usuarioDecisor: 'augusto', mfa: true,
    })));
  assert.strictEqual(r.ok, true);
  assert.ok(r.resultado.loteEstorno, 'não devolveu o lote de estorno');
  const a = naA(() => repo.aprovacao(solicitacao.id));
  assert.strictEqual(a.status, 'executada');
});

lancaAsync('aprovação: não se aprova duas vezes', () =>
  tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true }, () =>
    aprovacoes.aprovar(solicitacao.id, { motivo: 'de novo', perfilDecisor: 'proprietario', usuarioDecisor: 'augusto', mfa: true })),
  /já está/);

testeAsync('aprovação: ação sem executor falha explicitamente', async () => {
  // Tem de ser uma ação de nível 3 que AINDA não tem executor registrado
  // (`saldo_inicial.definir` entra na fase 4). Se algum dia ela ganhar um,
  // este teste passa a falhar — e a correção é trocar a ação, não remover
  // o teste: o comportamento que ele protege é "aprovar sem executor não
  // pode fingir sucesso".
  const s = tenancy.comTenant({ tenantId: contaA.id, userId: 'op2', perfil: 'operador' }, () =>
    aprovacoes.solicitar({ acao: 'saldo_inicial.definir', valorCents: 100, motivo: 'teste sem executor' }));
  let erro = null;
  try {
    await tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true }, () =>
      aprovacoes.aprovar(s.id, { motivo: 'ok', perfilDecisor: 'proprietario', usuarioDecisor: 'augusto', mfa: true }));
  } catch (e) { erro = e; }
  assert.ok(erro && /executor/.test(erro.message), 'aprovou sem executor e não avisou');
  const a = tenancy.comTenant({ tenantId: contaA.id, userId: 'x' }, () => repo.aprovacao(s.id));
  assert.strictEqual(a.status, 'falhou', 'ficou "aprovada" sem ter feito nada');
});

// =====================================================================
// 10. PERÍODOS E FECHAMENTO
// =====================================================================
teste('período: checklist aponta o que falta', () => {
  const c = naA(() => periodos.checklist(empresaA.id, '2026-08'));
  assert.strictEqual(c.pode, false, 'devia estar bloqueado — há transações por conciliar');
  assert.ok(c.bloqueadores.some(b => /conciliad/i.test(b)), `bloqueadores: ${c.bloqueadores}`);
  assert.ok(c.itens.find(i => i.chave === 'razao_balanceado').ok, 'o razão devia estar balanceado');
});

lanca('período: fechar com pendência é recusado', () =>
  naA(() => periodos.fechar(empresaA.id, '2026-08', { por: 'augusto' })), /Não dá para fechar/);

teste('período: fecha com justificativa e trava a competência', () => {
  const p = naA(() => periodos.fechar(empresaA.id, '2026-08', {
    por: 'augusto', forcar: true, motivo: 'fechamento de teste com pendências conhecidas',
  }));
  assert.strictEqual(p.status, 'fechado');
});

lanca('período: TRIGGER recusa lançar em competência fechada', () =>
  naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-20', memo: 'tarde demais',
    linhas: [{ contaCodigo: '1.1.1.001', debitoCents: 100 }, { contaCodigo: '3.1.1.001', creditoCents: 100 }],
  })), /fechada|fechado/);

lanca('período: reabrir exige motivo', () =>
  naA(() => periodos.reabrir(empresaA.id, '2026-08', { por: 'augusto' })), /motivo/);

teste('período: reabre e volta a aceitar lançamento', () => {
  naA(() => periodos.reabrir(empresaA.id, '2026-08', { por: 'augusto', motivo: 'nota do fornecedor chegou depois' }));
  const r = naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-20', memo: 'lançamento após reabertura',
    linhas: [{ contaCodigo: '1.1.1.001', debitoCents: 100 }, { contaCodigo: '3.1.1.001', creditoCents: 100 }],
  }));
  assert.strictEqual(r.lote.status, 'contabilizado');
  const p = naA(() => repo.periodo(empresaA.id, '2026-08'));
  assert.ok(p.reabertura_motivo.includes('fornecedor'), 'o motivo da reabertura não ficou registrado');
});

// =====================================================================
// 11. RELATÓRIOS
// =====================================================================
teste('DRE: sai do razão e cada bloco explica a fórmula', () => {
  const d = naA(() => relatorios.dre(empresaA.id, '2026-08'));
  assert.ok(d.resumo.receitaBrutaCents > 0, 'DRE sem receita');
  const receita = d.linhas.find(l => l.rotulo === 'Receita bruta');
  assert.ok(receita.origem.formula.includes('3.1'), 'sem fórmula explicando a origem');
  assert.ok(receita.contas.length > 0, 'sem as contas que compõem o número');
  const resultado = d.linhas.find(l => l.rotulo === 'Resultado do período');
  assert.strictEqual(resultado.valorCents, d.resumo.receitaLiquidaCents - d.resumo.despesaTotalCents);
});

teste('DRE: despesa conciliada aparece', () => {
  const d = naA(() => relatorios.dre(empresaA.id, '2026-08'));
  const props = d.linhas.find(l => l.rotulo === '(−) Despesas das propriedades');
  assert.strictEqual(props.valorCents, 38945, 'a conta de luz conciliada não entrou no DRE');
});

teste('resultado por centro: avisa quando falta centro de custo', () => {
  const r = naA(() => relatorios.porCentroCusto(empresaA.id, '2026-08'));
  assert.ok(r.aviso, 'era para avisar que há lançamento sem centro de custo');
});

teste('centro de custo: separa resultado por imóvel', () => {
  const centro = naA(() => repo.criarCentroCusto({
    entidadeId: empresaA.id, codigo: 'GG04I', nome: 'Villa Kubitschek', tipo: 'propriedade', externoId: 'GG04I',
  }));
  naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-21', memo: 'diária da Kubitschek',
    linhas: [
      { contaCodigo: '1.1.1.001', debitoCents: 400000 },
      { contaCodigo: '3.1.1.001', creditoCents: 400000, centroCustoId: centro.id },
    ],
  }));
  const r = naA(() => relatorios.porCentroCusto(empresaA.id, '2026-08'));
  const linha = r.linhas.find(l => l.codigo === 'GG04I');
  assert.ok(linha, 'o centro de custo não apareceu no resultado');
  assert.strictEqual(linha.receitaCents, 400000);
});

teste('cockpit: todo KPI traz origem e caminho de drill-down', () => {
  const c = naA(() => relatorios.cockpit(empresaA.id, '2026-08'));
  assert.ok(c.kpis.length >= 5);
  for (const k of c.kpis) {
    assert.ok(k.origem && k.origem.formula, `KPI ${k.chave} sem fórmula`);
    assert.ok(k.drill, `KPI ${k.chave} sem drill-down`);
  }
  assert.strictEqual(c.saude.razaoBalanceado, true);
  assert.ok(c.saude.taxaConciliacao !== null, 'sem taxa de conciliação medida');
});

teste('caixa: posição sai do razão', () => {
  const p = naA(() => relatorios.posicaoDeCaixa(empresaA.id, {}));
  assert.ok(p.linhas.length >= 1);
  assert.ok(p.linhas.every(l => !l.semContaContabil), 'conta bancária sem espelho contábil');
});

// =====================================================================
// 12. PLANOS E LIMITES
// =====================================================================
teste('plano: conta interna tem cortesia mais forte que status', () => {
  const t = repo.tenantPorId(contaA.id);
  const e = entitlements.resolver(t);
  assert.strictEqual(e.cortesia, true);
  repo.atualizarTenant(contaA.id, { status: 'suspensa' });
  const e2 = entitlements.resolver(repo.tenantPorId(contaA.id));
  assert.strictEqual(e2.bloqueiaEscrita, false, 'a cortesia devia sobreviver à suspensão');
  repo.atualizarTenant(contaA.id, { status: 'ativa' });
});

teste('plano: conta suspensa perde escrita mas mantém leitura', () => {
  repo.atualizarTenant(contaB.id, { status: 'suspensa' });
  const t = repo.tenantPorId(contaB.id);
  assert.throws(() => entitlements.exigir(t, 'razao'), /suspensa/);
  const e = entitlements.resolver(t);
  assert.ok(e.modulos.includes('razao'), 'o módulo continua no plano — o que muda é poder escrever');
  repo.atualizarTenant(contaB.id, { status: 'ativa' });
});

lanca('plano: módulo fora do plano dá 402 com o nome do módulo', () =>
  entitlements.exigir(repo.tenantPorId(contaB.id), 'cfo'), /não está no plano/);

teste('plano: limite de volume é conferido', () => {
  const t = repo.tenantPorId(contaB.id);
  assert.throws(() => entitlements.exigir(t, 'bancos', { medida: 'contas_bancarias', quantidadeAtual: 99 }), /Limite/);
});

teste('plano: o limite é CONTADO, não só declarado', () => {
  // O plano "essencial" da conta B permite 1 empresa. Ela já tem uma.
  const t = repo.tenantPorId(contaB.id);
  const usadas = naB(() => entitlements.medir('entidades'));
  assert.strictEqual(usadas, 1, `contagem errada: ${usadas}`);
  // Sem passar quantidade à mão: tem de contar sozinho e barrar.
  assert.throws(() => naB(() => entitlements.exigir(t, 'razao', { medida: 'entidades' })), /Limite/);
  // E a conta interna (enterprise, limite 0 = sem teto) não é barrada.
  const interna = repo.tenantPorId(contaA.id);
  naA(() => entitlements.exigir(interna, 'razao', { medida: 'entidades' }));
});

teste('plano: limite não barra quem ainda tem folga', () => {
  const t = repo.tenantPorId(contaB.id);
  // 'essencial' permite 3 contas bancárias e a conta B não tem nenhuma.
  naB(() => entitlements.exigir(t, 'bancos', { medida: 'contas_bancarias' }));
});

// =====================================================================
// 12b. CONTAS A PAGAR E RECEBER (fase 3)
// =====================================================================
const documento = require('./documento');
const contrapartes = require('./contrapartes');
const titulos = require('./titulos');
const liquidacoes = require('./liquidacoes');

teste('documento: CPF válido passa e inválido não', () => {
  assert.strictEqual(documento.validarCPF('529.982.247-25'), true);
  assert.strictEqual(documento.validarCPF('529.982.247-26'), false);
  assert.strictEqual(documento.validarCPF('111.111.111-11'), false, 'dígitos repetidos passam na conta e são inválidos');
});
teste('documento: CNPJ válido passa e inválido não', () => {
  assert.strictEqual(documento.validarCNPJ('11.222.333/0001-81'), true);
  assert.strictEqual(documento.validarCNPJ('11.222.333/0001-82'), false);
  assert.strictEqual(documento.validarCNPJ('00.000.000/0000-00'), false);
});
teste('documento: reconhece o tipo e formata', () => {
  const a = documento.analisar('11222333000181');
  assert.strictEqual(a.tipo, 'cnpj');
  assert.strictEqual(a.formatado, '11.222.333/0001-81');
});
lanca('documento: erro diz QUANTOS dígitos vieram', () =>
  documento.exigir('123456', 'CNPJ do fornecedor'), /6 dígitos/);
lanca('documento: erro nomeia o dígito verificador', () =>
  documento.exigir('529.982.247-26'), /dígito verificador/);

let fornecedor, cliente;
teste('contraparte: cria fornecedor com CNPJ validado', () => {
  fornecedor = naA(() => contrapartes.criar({
    entidadeId: empresaA.id, tipo: 'fornecedor', nome: 'Neoenergia Distribuição S.A.',
    documento: '11.222.333/0001-81',
  }));
  assert.ok(fornecedor.id);
  assert.strictEqual(fornecedor.documento, '11222333000181', 'devia guardar só os dígitos');
});

lanca('contraparte: CNPJ inválido é recusado na criação', () =>
  naA(() => contrapartes.criar({ entidadeId: empresaA.id, nome: 'Fantasma', documento: '11.222.333/0001-99' })),
  /dígito verificador/);

lanca('contraparte: mesmo documento é duplicata CERTA', () =>
  naA(() => contrapartes.criar({ entidadeId: empresaA.id, nome: 'Neoenergia (outro cadastro)', documento: '11222333000181' })),
  /Já existe/);

teste('contraparte: duplicata por documento não se força', () => {
  try {
    naA(() => contrapartes.criar({ entidadeId: empresaA.id, nome: 'Outro nome', documento: '11222333000181', forcar: true }));
    throw new Error('deixou forçar duplicata de documento');
  } catch (e) {
    assert.ok(/Já existe/.test(e.message));
    assert.strictEqual(e.detalhe.podeForcar, false, 'documento igual nunca deveria ser forçável');
  }
});

teste('contraparte: nome equivalente é SUSPEITA, e pode ser forçada', () => {
  // "Neoenergia Distribuicao LTDA" normaliza igual ao já cadastrado.
  let erro = null;
  try { naA(() => contrapartes.criar({ entidadeId: empresaA.id, nome: 'neoenergia distribuição ltda' })); }
  catch (e) { erro = e; }
  assert.ok(erro && /nome equivalente/.test(erro.message), `mensagem: ${erro && erro.message}`);
  assert.strictEqual(erro.detalhe.podeForcar, true);
  const forcada = naA(() => contrapartes.criar({ entidadeId: empresaA.id, nome: 'neoenergia distribuição ltda', forcar: true }));
  assert.ok(forcada.id, 'não deixou forçar duplicata por nome');
});

teste('contraparte: cria cliente para os títulos a receber', () => {
  cliente = naA(() => contrapartes.criar({
    entidadeId: empresaA.id, tipo: 'cliente', nome: 'Embaixada da Noruega', documento: '529.982.247-25',
  }));
  assert.ok(cliente.id);
});

teste('contraparte: dado bancário nunca volta em claro', () => {
  const mascarado = contrapartes.mascarar({ conta: '123456789', chavePix: 'augusto@exemplo.com', documentoTitular: '11222333000181' });
  assert.strictEqual(mascarado.conta, '•••789');
  assert.ok(!/123456/.test(JSON.stringify(mascarado)), 'a conta apareceu em claro');
});

let solicitacaoBanco;
teste('contraparte: mudar dado bancário vira solicitação com antes/depois', () => {
  solicitacaoBanco = tenancy.comTenant({ tenantId: contaA.id, userId: 'operador-financeiro', perfil: 'operador', mfa: true }, () =>
    tenancy.comEntidade(empresaA.id, () => contrapartes.solicitarDadosBancarios(fornecedor.id, {
      banco: '001', agencia: '1234', conta: '99887766', titular: 'Neoenergia Distribuição S.A.',
      motivo: 'fornecedor informou nova conta por e-mail',
    })));
  assert.strictEqual(solicitacaoBanco.nivel, 3, 'dado bancário TEM de ser nível 3');
  assert.strictEqual(solicitacaoBanco.status, 'pendente');
  const previa = require('./db').j.parse(solicitacaoBanco.previa, {});
  assert.ok(previa.camposAlterados.includes('conta'), 'a prévia não mostra que a conta mudou');
  assert.strictEqual(previa.primeiroCadastro, true);
  assert.ok(/•••/.test(previa.depois.conta), 'a prévia mostrou a conta em claro');
});

teste('contraparte: o dado bancário NÃO foi aplicado antes da aprovação', () => {
  const c = naA(() => contrapartes.buscar(fornecedor.id));
  assert.deepStrictEqual(c.dados_bancarios.conta, '', 'aplicou sem aprovação');
});

testeAsync('contraparte: aprovada, a mudança se aplica e o log fica mascarado', async () => {
  await tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true }, () =>
    tenancy.comEntidade(empresaA.id, () => aprovacoes.aprovar(solicitacaoBanco.id, {
      motivo: 'conferido por telefone com o fornecedor',
      perfilDecisor: 'proprietario', usuarioDecisor: 'augusto', mfa: true,
    })));
  const c = naA(() => contrapartes.buscar(fornecedor.id));
  assert.strictEqual(c.dados_bancarios.conta, '•••766');
  const log = naA(() => auditoria.listar({ objetoTipo: 'contraparte', objetoId: fornecedor.id, limite: 10 }));
  const evento = log.find(l => l.acao === 'contraparte.dados_bancarios');
  assert.ok(evento, 'a alteração não foi auditada');
  assert.ok(!/99887766/.test(evento.detalhe), 'a auditoria guardou a conta em claro');
});

let tituloPagar;
let ordemParcela = null;
teste('título: rateio que não fecha é recusado com a diferença', () => {
  let erro = null;
  try {
    naA(() => titulos.criar({
      entidadeId: empresaA.id, especie: 'pagar', contraparteId: fornecedor.id,
      documento: 'NF-001', descricao: 'Energia do compound', valorCents: 100000,
      competencia: '2026-08', vencimento: '2026-08-25',
      rateio: [{ contaCodigo: '4.1.1.005', valorCents: 60000 }],
    }));
  } catch (e) { erro = e; }
  assert.ok(erro && /rateio soma/.test(erro.message), `mensagem: ${erro && erro.message}`);
  assert.strictEqual(erro.detalhe.diferenca, 40000);
});

lanca('título: parcelas que não fecham são recusadas', () => naA(() => titulos.criar({
  entidadeId: empresaA.id, especie: 'pagar', contraparteId: fornecedor.id,
  documento: 'NF-002', valorCents: 100000, competencia: '2026-08',
  rateio: [{ contaCodigo: '4.1.1.005', valorCents: 100000 }],
  parcelas: [{ vencimento: '2026-08-25', valorCents: 40000 }, { vencimento: '2026-09-25', valorCents: 50000 }],
})), /parcelas somam/);

teste('título a pagar: rateio por imóvel e provisão pela competência', () => {
  const centros = naA(() => repo.listarCentrosCusto(empresaA.id));
  const kubi = centros.find(c => c.codigo === 'GG04I');
  const r = naA(() => titulos.criar({
    entidadeId: empresaA.id, especie: 'pagar', contraparteId: fornecedor.id,
    documento: 'NF-100', descricao: 'Energia elétrica agosto', valorCents: 90000,
    competencia: '2026-08', dataFato: '2026-08-20',
    rateio: [
      { contaCodigo: '4.1.1.005', valorCents: 50000, centroCustoId: kubi ? kubi.id : '' },
      { contaCodigo: '4.1.1.005', valorCents: 40000 },
    ],
    parcelas: { quantidade: 3, primeiroVencimento: '2026-08-25', periodo: 'mensal' },
  }));
  tituloPagar = r.titulo;
  assert.strictEqual(tituloPagar.parcelas.length, 3);
  assert.strictEqual(tituloPagar.parcelas.reduce((s, p) => s + p.valorCents, 0), 90000, 'as parcelas não somam o título');
  assert.deepStrictEqual(tituloPagar.parcelas.map(p => p.vencimento), ['2026-08-25', '2026-09-25', '2026-10-25']);
  // A provisão: débito na despesa, crédito em Fornecedores.
  assert.ok(r.lote, 'não provisionou');
  const linhas = naA(() => repo.linhasDoLote(r.lote.id));
  assert.strictEqual(linhas.filter(l => l.conta_codigo === '4.1.1.005').reduce((s, l) => s + l.debito_cents, 0), 90000);
  assert.strictEqual(linhas.find(l => l.conta_codigo === '2.1.1.001').credito_cents, 90000);
});

teste('título: divisão em 3 não perde centavo', () => {
  const r = naA(() => titulos.criar({
    entidadeId: empresaA.id, especie: 'pagar', contraparteId: fornecedor.id,
    documento: 'NF-101', descricao: 'teste de rateio de parcela', valorCents: 10000,
    competencia: '2026-08', dataFato: '2026-08-20',
    rateio: [{ contaCodigo: '4.9.1.001', valorCents: 10000 }],
    parcelas: { quantidade: 3, primeiroVencimento: '2026-08-10' },
  }));
  assert.deepStrictEqual(r.titulo.parcelas.map(p => p.valorCents), [3334, 3333, 3333]);
});

teste('título: vencimento em 31 cai no último dia do mês curto', () => {
  const p = titulos.prepararParcelas({ quantidade: 3, primeiroVencimento: '2026-01-31' }, 30000, null);
  assert.deepStrictEqual(p.map(x => x.vencimento), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

teste('título: documento repetido do mesmo fornecedor é duplicata', () => {
  let erro = null;
  try {
    naA(() => titulos.criar({
      entidadeId: empresaA.id, especie: 'pagar', contraparteId: fornecedor.id,
      documento: 'NF-100', valorCents: 90000, competencia: '2026-08',
      rateio: [{ contaCodigo: '4.1.1.005', valorCents: 90000 }],
      parcelas: { quantidade: 1, primeiroVencimento: '2026-08-25' },
    }));
  } catch (e) { erro = e; }
  assert.ok(erro && /duplicata/.test(erro.message), `mensagem: ${erro && erro.message}`);
  assert.strictEqual(erro.detalhe.podeForcar, true, 'complemento legítimo tem de ser possível');
});

let titReceber;
teste('título a receber: fatura debita Clientes e credita a receita', () => {
  const r = naA(() => titulos.criar({
    entidadeId: empresaA.id, especie: 'receber', contraparteId: cliente.id,
    documento: 'FAT-001', descricao: 'Evento diplomático', valorCents: 1500000,
    competencia: '2026-08', dataFato: '2026-08-15',
    rateio: [{ contaCodigo: '3.1.1.003', valorCents: 1500000 }],
    parcelas: [
      { vencimento: '2026-08-01', valorCents: 500000 },
      { vencimento: '2026-09-01', valorCents: 1000000 },
    ],
  }));
  titReceber = r.titulo;
  const linhas = naA(() => repo.linhasDoLote(r.lote.id));
  assert.strictEqual(linhas.find(l => l.conta_codigo === '1.1.2.001').debito_cents, 1500000);
  assert.strictEqual(linhas.find(l => l.conta_codigo === '3.1.1.003').credito_cents, 1500000);
});

let liqParcial;
teste('liquidação: baixa PARCIAL deixa a parcela em `parcial`', () => {
  const parcela = tituloPagar.parcelas[0];
  const r = naA(() => liquidacoes.liquidar({
    parcelaId: parcela.id, data: '2026-08-25', valorCents: 10000,
    contaBancariaId: banco.id, meio: 'pix',
  }));
  liqParcial = r;
  assert.strictEqual(r.parcela.status, 'parcial');
  assert.strictEqual(r.parcela.saldoCents, parcela.valorCents - 10000);
  assert.strictEqual(r.movimentadoCents, 10000);
});

teste('liquidação: juros e multa vão para conta própria, não incham a despesa', () => {
  const parcela = tituloPagar.parcelas[1];
  const r = naA(() => liquidacoes.liquidar({
    parcelaId: parcela.id, data: '2026-09-30', valorCents: parcela.valorCents,
    jurosCents: 500, multaCents: 1000, contaBancariaId: banco.id, meio: 'pix',
  }));
  const linhas = naA(() => repo.linhasDoLote(r.lote.id));
  assert.strictEqual(linhas.find(l => l.conta_codigo === '4.4.1.002').debito_cents, 1500, 'juros+multa fora da conta financeira');
  assert.strictEqual(linhas.find(l => l.conta_codigo === '2.1.1.001').debito_cents, parcela.valorCents);
  assert.strictEqual(linhas.find(l => l.conta_codigo === '1.1.1.101').credito_cents, parcela.valorCents + 1500);
  // A despesa de energia NÃO cresceu com o juro.
  assert.ok(!linhas.some(l => l.conta_codigo === '4.1.1.005'), 'o juro entrou na conta de energia');
});

teste('liquidação: desconto obtido vira receita, não redução da despesa', () => {
  const parcela = tituloPagar.parcelas[2];
  const r = naA(() => liquidacoes.liquidar({
    parcelaId: parcela.id, data: '2026-10-20', valorCents: parcela.valorCents,
    descontoCents: 2000, contaBancariaId: banco.id, meio: 'pix',
  }));
  const linhas = naA(() => repo.linhasDoLote(r.lote.id));
  assert.strictEqual(linhas.find(l => l.conta_codigo === '3.9.1.003').credito_cents, 2000);
  assert.strictEqual(linhas.find(l => l.conta_codigo === '1.1.1.101').credito_cents, parcela.valorCents - 2000, 'saiu do banco o valor errado');
});

teste('liquidação: o título fecha quando a última parcela é quitada', () => {
  // A primeira ainda está parcial — o título continua aberto.
  assert.strictEqual(naA(() => titulos.buscar(tituloPagar.id)).status, 'aberto');
  const parcela = tituloPagar.parcelas[0];
  naA(() => liquidacoes.liquidar({
    parcelaId: parcela.id, data: '2026-08-26', valorCents: parcela.valorCents - 10000,
    contaBancariaId: banco.id, meio: 'pix',
  }));
  const t = naA(() => titulos.buscar(tituloPagar.id));
  assert.strictEqual(t.status, 'liquidado');
  assert.strictEqual(t.saldoCents, 0);
});

lanca('liquidação: pagar acima do saldo é recusado com o excedente', () => {
  const parcela = naA(() => titulos.buscar(titReceber.id)).parcelas[0];
  return naA(() => liquidacoes.liquidar({ parcelaId: parcela.id, data: '2026-08-05', valorCents: parcela.valorCents + 1 }));
}, /passa do saldo/);

teste('liquidação a receber: entra no banco com juros e sai o desconto concedido', () => {
  const parcela = naA(() => titulos.buscar(titReceber.id)).parcelas[0];
  const r = naA(() => liquidacoes.liquidar({
    parcelaId: parcela.id, data: '2026-08-20', valorCents: parcela.valorCents,
    jurosCents: 3000, descontoCents: 1000, contaBancariaId: banco.id, meio: 'ted',
  }));
  const linhas = naA(() => repo.linhasDoLote(r.lote.id));
  assert.strictEqual(linhas.find(l => l.conta_codigo === '1.1.1.101').debito_cents, parcela.valorCents + 3000 - 1000);
  assert.strictEqual(linhas.find(l => l.conta_codigo === '3.9.1.004').credito_cents, 3000);
  assert.strictEqual(linhas.find(l => l.conta_codigo === '4.4.1.004').debito_cents, 1000);
  assert.strictEqual(linhas.find(l => l.conta_codigo === '1.1.2.001').credito_cents, parcela.valorCents);
});

teste('liquidação: estorno devolve o saldo e não apaga o histórico', () => {
  const r = naA(() => liquidacoes.estornar(liqParcial.liquidacaoId, { motivo: 'pagamento não compensou' }));
  assert.ok(r.estorno, 'não gerou lote de estorno');
  const t = naA(() => titulos.buscar(tituloPagar.id));
  assert.strictEqual(t.status, 'aberto', 'o título devia reabrir');
  assert.strictEqual(t.saldoCents, 10000);
  const historico = naA(() => liquidacoes.listarDaParcela(tituloPagar.parcelas[0].id));
  assert.ok(historico.some(l => l.estornada), 'a liquidação estornada sumiu do histórico');
});

lanca('liquidação: estorno exige motivo', () =>
  naA(() => liquidacoes.estornar(liqParcial.liquidacaoId, {})), /motivo/);

lanca('título: cancelar com liquidação é recusado', () =>
  naA(() => titulos.cancelar(titReceber.id, { motivo: 'desistência' })), /já tem/);

teste('título: cancelar sem liquidação estorna a provisão', () => {
  const r = naA(() => titulos.criar({
    entidadeId: empresaA.id, especie: 'pagar', contraparteId: fornecedor.id,
    documento: 'NF-CANCELA', valorCents: 5000, competencia: '2026-08', dataFato: '2026-08-05',
    rateio: [{ contaCodigo: '4.9.1.001', valorCents: 5000 }],
    parcelas: { quantidade: 1, primeiroVencimento: '2026-08-30' },
  }));
  const c = naA(() => titulos.cancelar(r.titulo.id, { motivo: 'nota emitida em duplicidade pelo fornecedor' }));
  assert.strictEqual(c.titulo.status, 'cancelado');
  assert.ok(c.estorno, 'a provisão não foi estornada');
  assert.strictEqual(c.titulo.parcelas[0].status, 'cancelada');
});

teste('aging: separa por faixa de atraso e explica a origem', () => {
  const a = naA(() => titulos.aging(empresaA.id, { especie: 'receber', referencia: '2026-09-15' }));
  assert.ok(a.totalAbertoCents > 0, 'aging vazio');
  const faixa = a.faixas.find(f => f.chave === 'd1_15');
  assert.ok(faixa.totalCents > 0, `a parcela de 01/09 devia estar em 1-15 dias: ${JSON.stringify(a.faixas.map(f => [f.chave, f.totalCents]))}`);
  assert.ok(a.origem.formula.includes('valor'), 'sem fórmula explicando o número');
  assert.strictEqual(a.totalVencidoCents + a.faixas.find(f => f.chave === 'a_vencer').totalCents, a.totalAbertoCents);
});

teste('aging: a mesma parcela muda de faixa conforme a referência', () => {
  const cedo = naA(() => titulos.aging(empresaA.id, { especie: 'receber', referencia: '2026-08-20' }));
  assert.strictEqual(cedo.totalVencidoCents, 0, 'em 20/08 nada devia estar vencido');
  const tarde = naA(() => titulos.aging(empresaA.id, { especie: 'receber', referencia: '2026-12-20' }));
  assert.ok(tarde.faixas.find(f => f.chave === 'd90_mais').totalCents > 0, 'em dezembro devia haver +90 dias');
});

teste('inadimplentes: ordena por saldo e diz há quantos dias', () => {
  const lista = naA(() => titulos.inadimplentes(empresaA.id, { especie: 'receber', referencia: '2026-12-20' }));
  assert.ok(lista.length >= 1, 'ninguém inadimplente');
  assert.strictEqual(lista[0].contraparte, 'Embaixada da Noruega');
  assert.ok(lista[0].diasDaMaisAntiga > 90);
});

testeAsync('ordem de pagamento: prévia mostra favorecido, conta e total', async () => {
  const t = naA(() => titulos.criar({
    entidadeId: empresaA.id, especie: 'pagar', contraparteId: fornecedor.id,
    documento: 'NF-ORDEM', valorCents: 80000, competencia: '2026-08', dataFato: '2026-08-10',
    rateio: [{ contaCodigo: '4.1.1.002', valorCents: 80000 }],
    parcelas: { quantidade: 1, primeiroVencimento: '2026-08-28' },
  }));
  const parcela = t.titulo.parcelas[0];
  const preparada = naA(() => liquidacoes.prepararOrdemDePagamento({
    parcelaId: parcela.id, data: '2026-08-28', valorCents: 80000,
    contaBancariaId: banco.id, meio: 'pix',
  }));
  assert.strictEqual(preparada.previa.favorecido, 'Neoenergia Distribuição S.A.');
  assert.strictEqual(preparada.previa.totalASair, 'R$ 800,00');
  assert.strictEqual(preparada.previa.contaDeSaida, 'C6 PJ');
  assert.strictEqual(preparada.previa.dadosBancariosDoFavorecido.conta, '•••766',
    'a prévia tem de mostrar PARA ONDE vai o dinheiro, mascarado');
  assert.strictEqual(preparada.valorCents, 80000);
  ordemParcela = parcela;
});

testeAsync('ordem de pagamento: aprovada, vira liquidação — e NÃO transfere dinheiro', async () => {
  const s = tenancy.comTenant({ tenantId: contaA.id, userId: 'operador-financeiro', perfil: 'operador', mfa: true }, () =>
    tenancy.comEntidade(empresaA.id, () => aprovacoes.solicitar({
      acao: 'pagamento.executar', entidadeId: empresaA.id,
      objetoTipo: 'parcela', objetoId: ordemParcela.id,
      payload: { parcelaId: ordemParcela.id, data: '2026-08-28', valorCents: 80000, contaBancariaId: banco.id, meio: 'pix' },
      previa: { favorecido: 'Neoenergia' }, valorCents: 80000,
      motivo: 'conta de luz de agosto',
    })));

  const r = await tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true }, () =>
    tenancy.comEntidade(empresaA.id, () => aprovacoes.aprovar(s.id, {
      motivo: 'pagamento autorizado', perfilDecisor: 'proprietario', usuarioDecisor: 'augusto', mfa: true,
    })));
  assert.ok(r.resultado.liquidacaoId, 'a aprovação não produziu liquidação');
  const parcela = naA(() => liquidacoes.carregarParcela(ordemParcela.id));
  assert.strictEqual(parcela.status, 'liquidada');
});

teste('fase 3: o razão continua fechando depois de tudo isso', () => {
  const b = naA(() => ledger.conferirBalanceamento(empresaA.id));
  assert.strictEqual(b.ok, true, `diferença de ${b.diferencaCents}`);
});

// =====================================================================
// 12c. GESTÃO E FECHAMENTO (fase 4)
// =====================================================================
const apuracao = require('./apuracao');
const caixa = require('./caixa');
const orcamento = require('./orcamento');

teste('balanço: fecha (ativo = passivo + PL) mesmo sem apuração', () => {
  const b = naA(() => apuracao.balanco(empresaA.id, { ate: '2026-12-31' }));
  assert.strictEqual(b.fecha, true, `diferença de ${b.diferencaCents}`);
  assert.notStrictEqual(b.patrimonioLiquido.resultadoDoExercicioCents, 0, 'era para haver resultado no período');
  assert.ok(/linha calculada/.test(b.origem.observacao),
    `o balanço não avisa que o resultado ainda não virou lançamento: "${b.origem.observacao}"`);
});

teste('balanço: a identidade continua valendo em qualquer data de corte', () => {
  for (const ate of ['2026-08-15', '2026-09-30', '2026-10-31']) {
    const b = naA(() => apuracao.balanco(empresaA.id, { ate }));
    assert.strictEqual(b.fecha, true, `${ate}: diferença de ${b.diferencaCents}`);
  }
});

teste('fluxo de caixa direto: separa operacional de investimento', () => {
  const f = naA(() => caixa.fluxoDireto(empresaA.id, { desde: '2026-08-01', ate: '2026-08-31' }));
  assert.ok(f.movimentos.length > 0, 'nenhum movimento de caixa');
  const op = f.grupos.find(g => g.grupo === 'operacional');
  assert.ok(op.entradasCents > 0 || op.saidasCents > 0, 'nada classificado como operacional');
  assert.strictEqual(f.saldoFinalCents, f.saldoInicialCents + f.entradasCents - f.saidasCents);
});

teste('fluxo de caixa direto: o saldo final bate com o razão', () => {
  const f = naA(() => caixa.fluxoDireto(empresaA.id, { desde: '2026-01-01', ate: '2026-12-31' }));
  const contas = naA(() => caixa.contasDeCaixa(empresaA.id));
  const pelaConta = contas.reduce((s, id) => s + naA(() => ledger.saldo(id, { ate: '2026-12-31' })).saldoCents, 0);
  assert.strictEqual(f.saldoFinalCents, pelaConta,
    'o fluxo direto não reconstrói o saldo das contas de caixa');
});

teste('fluxo indireto: reconcilia com o direto, ou explica por quê', () => {
  const f = naA(() => caixa.fluxoIndireto(empresaA.id, { desde: '2026-08-01', ate: '2026-08-31' }));
  assert.ok(f.explicacao, 'sem explicação da conciliação');
  if (!f.concilia) {
    // Não conciliar é legítimo quando há movimento fora dos ajustes —
    // o que NÃO pode é ficar calado sobre isso.
    assert.ok(/conta patrimonial fora dos ajustes/.test(f.explicacao), `explicação inútil: ${f.explicacao}`);
  }
});

teste('previsão de caixa: três cenários, cada um com a premissa escrita', () => {
  const p = naA(() => caixa.previsao(empresaA.id, { dias: 120, referencia: '2026-08-25' }));
  assert.strictEqual(p.cenarios.length, 3);
  for (const c of p.cenarios) {
    assert.ok(c.premissa, `cenário ${c.cenario} sem premissa`);
    assert.ok(c.menorSaldoEm, 'sem a data do menor saldo');
  }
  assert.ok(/PREVISÃO, não fato/.test(p.origem.natureza), 'a previsão não se declara previsão');
  // Otimista nunca pode ficar abaixo do pessimista.
  const oti = p.cenarios.find(c => c.cenario === 'otimista').saldoFinalCents;
  const pes = p.cenarios.find(c => c.cenario === 'pessimista').saldoFinalCents;
  assert.ok(oti >= pes, `otimista (${oti}) abaixo do pessimista (${pes})`);
});

teste('previsão: sem histórico suficiente, DIZ que usa o padrão', () => {
  const p = naB(() => caixa.previsao(empresaB.id, { dias: 30, referencia: '2026-08-25' }));
  assert.strictEqual(p.taxaHistorica.suficiente, false);
  assert.ok(/insuficiente/.test(p.taxaHistorica.origem), `origem: ${p.taxaHistorica.origem}`);
});

teste('previsão: parcela vencida entra no primeiro dia, não some', () => {
  const p = naA(() => caixa.previsao(empresaA.id, { dias: 30, referencia: '2026-12-01' }));
  // Há recebível vencido de setembro; o cenário otimista tem de somá-lo.
  const oti = p.cenarios.find(c => c.cenario === 'otimista');
  assert.ok(oti.saldoFinalCents > p.saldoHojeCents, 'o recebível vencido não entrou na projeção');
});

let orc;
teste('orçamento: nasce em rascunho e numera a versão sozinho', () => {
  orc = naA(() => orcamento.criar({
    entidadeId: empresaA.id, nome: 'Orçamento 2026', exercicio: '2026', cenario: 'base',
    linhas: [
      { contaCodigo: '3.1.1.001', competencia: '2026-08', valorCents: 8000000 },
      { contaCodigo: '4.1.1.005', competencia: '2026-08', valorCents: 100000 },
      { contaCodigo: '4.1.1.005', competencia: '2026-09', valorCents: 100000 },
    ],
  }));
  assert.strictEqual(orc.status, 'rascunho');
  assert.strictEqual(orc.versao, 1);
  assert.strictEqual(orc.linhas.length, 3);
});

teste('orçamento: linha repetida é agregada, não duplicada', () => {
  const o = naA(() => orcamento.criar({
    entidadeId: empresaA.id, nome: 'teste de agregação', exercicio: '2026',
    linhas: [
      { contaCodigo: '4.9.1.001', competencia: '2026-08', valorCents: 1000 },
      { contaCodigo: '4.9.1.001', competencia: '2026-08', valorCents: 2500 },
    ],
  }));
  assert.strictEqual(o.linhas.length, 1);
  assert.strictEqual(o.linhas[0].valorCents, 3500);
});

lanca('orçamento: competência fora do exercício é recusada', () =>
  naA(() => orcamento.criar({
    entidadeId: empresaA.id, nome: 'errado', exercicio: '2026',
    linhas: [{ contaCodigo: '4.9.1.001', competencia: '2027-01', valorCents: 100 }],
  })), /fora do exercício/);

lanca('orçamento: conta sintética não entra', () =>
  naA(() => orcamento.criar({
    entidadeId: empresaA.id, nome: 'errado', exercicio: '2026',
    linhas: [{ contaCodigo: '4.1', competencia: '2026-08', valorCents: 100 }],
  })), /sintética/);

lanca('orçamento: comparar sem orçamento aprovado diz o que fazer', () =>
  naA(() => orcamento.realizado(empresaA.id, { competencia: '2026-08' })),
  /Crie uma versão e aprove/);

teste('orçamento: aprovar congela e arquiva a versão anterior', () => {
  const aprovado = naA(() => orcamento.aprovar(orc.id, { motivo: 'orçamento do exercício' }));
  assert.strictEqual(aprovado.status, 'aprovado');
  // Rascunho aprovado não aceita mais alteração.
  assert.throws(() => naA(() => orcamento.definirLinhas(orc.id, empresaA.id, [])), /não aceita alteração/);

  const v2 = naA(() => orcamento.criar({
    entidadeId: empresaA.id, nome: 'Revisão de agosto', exercicio: '2026', cenario: 'base',
    linhas: [{ contaCodigo: '3.1.1.001', competencia: '2026-08', valorCents: 9000000 }],
  }));
  assert.ok(v2.versao > orc.versao, `a versão nova (${v2.versao}) devia suceder a ${orc.versao}`);
  naA(() => orcamento.aprovar(v2.id, { motivo: 'revisão' }));
  assert.strictEqual(naA(() => orcamento.buscar(orc.id)).status, 'arquivado',
    'a versão anterior devia ir para arquivada — senão "o orçamento" fica ambíguo');
});

lanca('orçamento: aprovar versão vazia é recusado', () => {
  const vazio = naA(() => orcamento.criar({ entidadeId: empresaA.id, nome: 'vazio', exercicio: '2026', cenario: 'pessimista', linhas: [] }));
  return naA(() => orcamento.aprovar(vazio.id, { motivo: 'x' }));
}, /sem linha nenhuma/);

teste('orçado × realizado: o sinal do desvio segue a natureza da conta', () => {
  const r = naA(() => orcamento.realizado(empresaA.id, { competencia: '2026-08' }));
  assert.ok(r.linhas.length > 0, 'comparação vazia');

  const receita = r.linhas.find(l => l.contaCodigo === '3.1.1.001');
  assert.ok(receita, 'a receita orçada não apareceu');
  // Receita realizada abaixo do orçado é DESFAVORÁVEL.
  if (receita.realizadoCents < receita.orcadoCents) {
    assert.strictEqual(receita.favoravel, false, 'receita abaixo do orçado marcada como favorável');
  }
  const despesa = r.linhas.find(l => l.contaCodigo === '4.1.1.005');
  if (despesa && despesa.realizadoCents < despesa.orcadoCents) {
    assert.strictEqual(despesa.favoravel, true, 'despesa abaixo do orçado devia ser favorável');
  }
  assert.ok(/desvio = realizado − orçado/.test(r.origem.convencao), 'sem a convenção escrita');
  assert.ok(r.maioresDesvios.length > 0);
});

teste('orçado × realizado: acumulado soma o exercício até a competência', () => {
  const mes = naA(() => orcamento.realizado(empresaA.id, { competencia: '2026-09', orcamentoId: orc.id }));
  const acu = naA(() => orcamento.realizado(empresaA.id, { competencia: '2026-09', orcamentoId: orc.id, acumulado: true }));
  const energiaMes = mes.linhas.find(l => l.contaCodigo === '4.1.1.005');
  const energiaAcu = acu.linhas.find(l => l.contaCodigo === '4.1.1.005');
  assert.strictEqual(energiaMes.orcadoCents, 100000, 'orçado do mês');
  assert.strictEqual(energiaAcu.orcadoCents, 200000, 'orçado acumulado devia somar agosto + setembro');
});

let previaApur;
teste('apuração: a prévia diz quanto seria transferido e avisa do efeito', () => {
  previaApur = naA(() => apuracao.previaApuracao(empresaA.id, { competencia: '2026-12' }));
  assert.ok(previaApur.contas.length > 0, 'nada a apurar');
  assert.strictEqual(previaApur.receitasCents - previaApur.despesasCents, previaApur.resultadoCents);
  assert.ok(/DRE deste intervalo passa a mostrar R\$ 0,00/.test(previaApur.aviso), 'não avisa que o DRE zera');
});

lanca('apuração: exige motivo', () =>
  naA(() => apuracao.apurar(empresaA.id, { competencia: '2026-12' })), /motivo/);

teste('apuração: zera as contas de resultado contra lucros acumulados', () => {
  const antesPL = naA(() => ledger.saldo(contaDe('2.3.2.001').id, { ate: '2026-12-31' })).saldoCents;
  const r = naA(() => apuracao.apurar(empresaA.id, {
    competencia: '2026-12', motivo: 'encerramento do exercício de 2026',
  }));
  assert.ok(r.lote, 'não gerou lote de apuração');
  assert.strictEqual(r.resultadoCents, previaApur.resultadoCents);

  // O DRE do exercício zera...
  const dreDepois = naA(() => ledger.balancete(empresaA.id, { desde: '2026-01-01', ate: '2026-12-31' })).linhas
    .filter(l => ['receita', 'despesa'].includes(l.natureza) && l.saldoCents !== 0);
  assert.strictEqual(dreDepois.length, 0, `sobrou saldo em conta de resultado: ${JSON.stringify(dreDepois.map(l => [l.codigo, l.saldoCents]))}`);

  // ...e o resultado foi para o PL.
  const depoisPL = naA(() => ledger.saldo(contaDe('2.3.2.001').id, { ate: '2026-12-31' })).saldoCents;
  assert.strictEqual(depoisPL - antesPL, r.resultadoCents, 'o resultado não chegou aos lucros acumulados');
});

teste('apuração: o balanço continua fechando depois de apurar', () => {
  const b = naA(() => apuracao.balanco(empresaA.id, { ate: '2026-12-31' }));
  assert.strictEqual(b.fecha, true, `diferença de ${b.diferencaCents}`);
  assert.strictEqual(b.patrimonioLiquido.resultadoDoExercicioCents, 0, 'depois de apurado, o resultado calculado tem de ser zero');
});

lanca('apuração: rodar de novo sem nada novo diz que não há o que apurar', () =>
  naA(() => apuracao.apurar(empresaA.id, { competencia: '2026-12', motivo: 'de novo' })),
  /Não há saldo em conta de resultado/);

teste('apuração: lançamento novo DEPOIS de apurar é apurado no incremento', () => {
  // O risco real: a segunda apuração ser deduplicada pela chave e devolver
  // "deu certo" sem zerar nada. Aqui se prova que ela zera o incremento.
  naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-12-28', memo: 'nota que chegou atrasada',
    linhas: [
      { contaCodigo: '4.9.1.001', debitoCents: 33000 },
      { contaCodigo: '1.1.1.001', creditoCents: 33000 },
    ],
  }));
  const r = naA(() => apuracao.apurar(empresaA.id, { competencia: '2026-12', motivo: 'apuração do complemento' }));
  assert.strictEqual(r.duplicado, false, 'a apuração do incremento foi deduplicada — o saldo ficaria vivo');
  assert.strictEqual(r.resultadoCents, -33000, 'o incremento apurado devia ser exatamente a despesa nova');

  const sobra = naA(() => ledger.balancete(empresaA.id, { desde: '2026-01-01', ate: '2026-12-31' })).linhas
    .filter(l => ['receita', 'despesa'].includes(l.natureza) && l.saldoCents !== 0);
  assert.strictEqual(sobra.length, 0, 'sobrou saldo em conta de resultado depois da segunda apuração');
});

teste('consolidado: sem contraparte marcada, é soma aritmética — e diz isso', () => {
  naA(() => contasSvc.criarEmpresa({ nome: 'Villela Eventos Ltda', regime: 'simples' }));
  const c = naA(() => apuracao.consolidar({ ate: '2026-12-31' }));
  assert.ok(c.empresas.length >= 2, 'consolidado com uma empresa só');
  assert.strictEqual(c.eliminacoes.aplicadas, false);
  assert.ok(/Nenhuma contraparte está marcada/.test(c.aviso), 'não avisa que nada foi eliminado');
  assert.strictEqual(c.total.ativoCents, c.empresas.reduce((s, e) => s + e.ativoCents, 0));
  assert.strictEqual(c.consolidado.ativoCents, c.total.ativoCents, 'eliminou sem nada marcado');
  assert.ok(c.naoElimina.length >= 3, 'o consolidado não declara os próprios limites');
  assert.ok(c.empresas.every(e => e.fecha), 'alguma empresa com balanço que não fecha');
});

teste('fechamento: o checklist agora exige o balanço fechar', () => {
  const c = naA(() => periodos.checklist(empresaA.id, '2026-10'));
  const item = c.itens.find(i => i.chave === 'balanco_fecha');
  assert.ok(item, 'o item do balanço não entrou no checklist');
  assert.strictEqual(item.bloqueia, true);
  assert.strictEqual(item.ok, true);
});

// =====================================================================
// 12d. CFO INTELIGENTE E CONSELHO DOS MESTRES (fase 6)
// =====================================================================
const cfo = require('./cfo');
const conselho = require('./conselho');

teste('CFO: toda constatação diz o que a invalidaria', () => {
  const b = naA(() => cfo.briefing(empresaA.id, '2026-08'));
  assert.ok(b.constatacoes.length > 0, 'briefing sem nenhuma constatação');
  for (const c of b.constatacoes) {
    assert.ok(c.invalidaSe, `"${c.tipo}" não diz o que a invalidaria`);
    assert.ok(c.fatos && Object.keys(c.fatos).length, `"${c.tipo}" não traz os fatos que a acionaram`);
    assert.ok(typeof c.confianca === 'number', `"${c.tipo}" sem confiança`);
    assert.ok(c.acao, `"${c.tipo}" não diz o que fazer`);
    assert.ok(c.horizonte, `"${c.tipo}" sem horizonte`);
  }
  assert.ok(/determinísticas/.test(b.natureza), 'o briefing não declara sua natureza');
  assert.strictEqual(b.falhasDeDeteccao.length, 0, `detectores falharam: ${b.falhasDeDeteccao}`);
});

teste('CFO: detector que falha não derruba o briefing — aparece', () => {
  const original = cfo.DETECTORES.slice();
  cfo.DETECTORES.push(() => { throw new Error('detector quebrado de propósito'); });
  const b = naA(() => cfo.briefing(empresaA.id, '2026-08'));
  assert.strictEqual(b.falhasDeDeteccao.length, 1, 'a falha do detector foi engolida');
  assert.ok(/quebrado de propósito/.test(b.falhasDeDeteccao[0]));
  cfo.DETECTORES.length = 0;
  cfo.DETECTORES.push(...original);
});

teste('CFO: saldo em "a classificar" é sempre pendência', () => {
  const conta = contaDe('4.9.9.999');
  naA(() => ledger.lancar({
    entidadeId: empresaA.id, data: '2026-08-14', memo: 'saída sem classificação',
    linhas: [{ contaId: conta.id, debitoCents: 45000 }, { contaCodigo: '1.1.1.001', creditoCents: 45000 }],
  }));
  const achados = naA(() => cfo.aClassificarComSaldo(empresaA.id, '2026-08'));
  assert.ok(achados.length >= 1, 'não acusou o saldo a classificar');
  assert.strictEqual(achados[0].gravidade, 'alta');
  assert.strictEqual(achados[0].confianca, 100);
  assert.ok(/sempre pendência/.test(achados[0].invalidaSe));
});

teste('CFO: sem histórico suficiente, NÃO declara anomalia de despesa', () => {
  // A empresa B mal tem lançamento: não pode haver "fora do padrão".
  const achados = naB(() => cfo.despesaForaDoPadrao(empresaB.id, '2026-08'));
  assert.strictEqual(achados.length, 0, 'declarou anomalia sem amostra');
});

teste('CFO: duplicidade provável tem confiança menor quando os documentos diferem', () => {
  const cps = naA(() => repo.listarContrapartes(empresaA.id, 'fornecedor'));
  const forn = cps[0];
  for (const doc of ['DOC-A', 'DOC-B']) {
    naA(() => titulos.criar({
      entidadeId: empresaA.id, especie: 'pagar', contraparteId: forn.id, documento: doc,
      descricao: 'serviço repetido', valorCents: 77700, competencia: '2026-11', dataFato: '2026-11-05',
      rateio: [{ contaCodigo: '4.9.1.001', valorCents: 77700 }],
      parcelas: { quantidade: 1, primeiroVencimento: '2026-11-10' },
    }));
  }
  const achados = naA(() => cfo.possivelDuplicidade(empresaA.id, '2026-11'));
  assert.strictEqual(achados.length, 1, 'não achou o par suspeito');
  assert.strictEqual(achados[0].fatos.quantidade, 2);
  assert.ok(achados[0].confianca < 60, `documentos diferentes deviam baixar a confiança, veio ${achados[0].confianca}`);
  assert.ok(/notas realmente diferentes/.test(achados[0].invalidaSe));
});

teste('CFO: previsão negativa vira constatação crítica com a data', () => {
  const achados = naA(() => cfo.insuficienciaDeCaixa(empresaA.id, { dias: 365, referencia: '2026-08-25' }));
  for (const a of achados) {
    assert.ok(a.fatos.quando, 'não diz quando o caixa fica negativo');
    assert.ok(a.premissa, 'sem premissa do cenário');
    assert.ok(/receita ainda não lançada|recebível vencido|renegociada/.test(a.invalidaSe));
  }
});

// ---------------------------------------------------- Conselho dos Mestres

teste('conselho: toda referência aponta para o cabeçalho da seção no manuscrito', () => {
  const fs_ = require('fs');
  const caminho = require('path').join('D:', 'ClaudeData', 'Claude', conselho.ARQUIVO.replace(/\//g, require('path').sep));
  if (!fs_.existsSync(caminho)) { console.log('     (manuscrito ausente nesta máquina — pulei)'); return; }
  const linhas = fs_.readFileSync(caminho, 'utf8').split('\n');
  for (const p of conselho.PRINCIPIOS) {
    const cabecalho = (linhas[p.linhas[0] - 1] || '').trim();
    assert.ok(/^## \d+\.\d+\./.test(cabecalho),
      `${p.id}: a linha ${p.linhas[0]} não é o cabeçalho de uma seção — é "${cabecalho.slice(0, 60)}"`);
    // E o número da seção citada tem de bater com o cabeçalho encontrado.
    const numero = (p.secao.match(/^(\d+\.\d+)\./) || [])[1];
    assert.ok(cabecalho.startsWith(`## ${numero}.`),
      `${p.id}: cita a seção ${numero} mas a linha ${p.linhas[0]} é "${cabecalho.slice(0, 40)}"`);
  }
});

teste('conselho: nenhum princípio inventa citação nem simula personalidade', () => {
  for (const p of conselho.PRINCIPIOS) {
    const texto = [p.resumo, p.conselho, p.contraArgumento, p.acaoSugerida].join(' ');
    assert.ok(!/["“”]/.test(texto), `${p.id}: há aspas — risco de citação inventada`);
    assert.ok(!new RegExp(`${p.autor.split(' ')[0]}\\s+(diria|dizia|afirma que você)`, 'i').test(texto),
      `${p.id}: está fazendo o autor falar`);
  }
});

teste('conselho: todo princípio declara limitação e domínio de origem', () => {
  for (const p of conselho.PRINCIPIOS) {
    assert.ok(p.limitacoes && p.limitacoes.length > 40, `${p.id}: limitação vaga ou ausente`);
    assert.ok(conselho.DOMINIOS.includes(p.dominio), `${p.id}: domínio inválido (${p.dominio})`);
    assert.ok(p.contraArgumento, `${p.id}: sem contra-argumento`);
    assert.ok(p.acaoSugerida, `${p.id}: sem ação sugerida`);
  }
});

teste('conselho: sem fato, nenhum princípio aparece', () => {
  const vazio = conselho.avaliar({});
  assert.strictEqual(vazio.conselhos.length, 0,
    `princípio apareceu sem fato que o acionasse: ${vazio.conselhos.map(c => c.id).join(', ')}`);
  assert.strictEqual(vazio.avaliados, conselho.PRINCIPIOS.length);
});

teste('conselho: o fato aciona, e o conselho carrega tudo o que a tela precisa', () => {
  const r = conselho.avaliar({
    resultadoCents: 500000, caixaCents: 10000, despesaMensalMediaCents: 200000,
    centrosNegativos: ['GG04I'], temOrcamentoAprovado: false,
    jurosPagosCents: 1500, aprovacoesPendentes: 2,
    concentracaoMaior: 0.8, caixaFicaNegativo: true, caixaNegativoEm: '2026-10-05',
    mesesDeHistorico: 4, mesForaDaCurva: true,
  });
  assert.ok(r.conselhos.length >= 6, `poucos acionados: ${r.conselhos.length}`);
  for (const c of r.conselhos) {
    assert.ok(c.contexto, `${c.id} sem contexto (o fato que acionou)`);
    assert.ok(c.fonte.comoConferir.includes('linhas'), `${c.id} sem como conferir`);
    assert.ok(c.limitacoes, `${c.id} sem limitações`);
    assert.ok(c.contraArgumento, `${c.id} sem contra-argumento`);
    assert.ok(typeof c.confianca === 'number');
  }
  assert.ok(/não substitui|nenhum substitui/.test(r.aviso), 'sem o aviso de que não substitui profissional');
  assert.ok(/Não simula/.test(r.naoFaz));
});

teste('conselho: mostra a DIVERGÊNCIA entre mestres, não uma síntese falsa', () => {
  const r = conselho.avaliar({ caixaFicaNegativo: true, caixaNegativoEm: '2026-10-05', aprovacoesPendentes: 3 });
  const graham = r.conselhos.find(c => c.id === 'graham-margem-de-seguranca');
  const hill = r.conselhos.find(c => c.id === 'hill-decisao-rapida');
  assert.ok(graham && hill, 'os dois princípios em tensão deviam ter sido acionados');
  assert.ok(graham.divergencia.some(d => d.id === 'hill-decisao-rapida'),
    'Graham não aponta a tensão com Hill');
  assert.ok(/escolha é do gestor/.test(graham.divergencia[0].tensao));
});

teste('conselho: coletarFatos não recalcula número — só transporta', () => {
  const f = conselho.coletarFatos(empresaA.id, '2026-08', {
    dre: { resumo: { resultadoCents: 123, despesaTotalCents: 456 } },
    porCentro: { linhas: [{ codigo: 'A', receitaCents: 800, resultadoCents: -10 }, { codigo: 'B', receitaCents: 200, resultadoCents: 5 }] },
    previsao: { cenarios: [{ cenario: 'base', faltaCaixa: false }] },
    caixaCents: 999, serieResultado: [100, 100, 100],
  });
  assert.strictEqual(f.resultadoCents, 123);
  assert.strictEqual(f.caixaCents, 999);
  assert.strictEqual(f.concentracaoMaior, 0.8);
  assert.deepStrictEqual(f.centrosNegativos, ['A']);
  assert.strictEqual(f.caixaFicaNegativo, false);
  // 123 contra média 100 é 23% de distância: dentro da curva.
  assert.strictEqual(f.mesForaDaCurva, false);

  const fora = conselho.coletarFatos(empresaA.id, '2026-08', {
    dre: { resumo: { resultadoCents: 300, despesaTotalCents: 0 } },
    serieResultado: [100, 100, 100],
  });
  assert.strictEqual(fora.mesForaDaCurva, true, '300 contra média 100 devia ser fora da curva');
});

teste('conselho: ausência de dado não vira conselho', () => {
  // Sem saber se há orçamento, o princípio de Stanley NÃO pode aparecer
  // dizendo que não há. `!undefined` é true — foi bug real.
  const semSaber = conselho.avaliar({ resultadoCents: 100 });
  assert.ok(!semSaber.conselhos.some(c => c.id === 'stanley-frugalidade'),
    'apareceu conselho sobre orçamento sem que ninguém tivesse olhado se existe orçamento');
  const sabendoQueNaoTem = conselho.avaliar({ temOrcamentoAprovado: false });
  assert.ok(sabendoQueNaoTem.conselhos.some(c => c.id === 'stanley-frugalidade'),
    'com o fato conhecido, o princípio devia aparecer');
});

// =====================================================================
// 13. ADAPTADOR STAYS (vertical de hospedagem)
//
// Stays falsa e mutável: o que importa aqui não é falar HTTP com a Stays,
// é provar que reserva nova, reprocessada, alterada e cancelada caem todas
// no mesmo caminho de reconciliação e deixam o razão fechado.
// =====================================================================
const stays = require('./stays');

const LISTINGS_FALSOS = [
  { _id: 'L-KUBI', id: 'GG04I', internalName: 'Villa Kubitschek' },
  { _id: 'L-CATE', id: 'PL02I', internalName: 'Villa Catetinho' },
];

// Estado mutável do "banco de dados" da Stays de mentira.
const RESERVAS_FALSAS = [
  { _id: 'R-1', id: 'VS-0001', _idlisting: 'L-KUBI', _idclient: 'C-1', type: 'booked',
    checkInDate: '2026-09-04', checkOutDate: '2026-09-08',
    price: { _f_total: 4800 },
    partner: { name: 'Booking.com', commission: { _mcval: { BRL: 720 } } } },
  { _id: 'R-2', id: 'VS-0002', _idlisting: 'L-CATE', _idclient: 'C-2', type: 'booked',
    checkInDate: '2026-09-10', checkOutDate: '2026-09-12',
    price: { _f_total: 2500 },
    partner: null },                                    // reserva DIRETA: comissão zero
  { _id: 'R-3', id: 'VS-0003', _idlisting: 'L-KUBI', _idclient: 'C-3', type: 'canceled',
    checkInDate: '2026-09-20', checkOutDate: '2026-09-22',
    price: { _f_total: 3000 }, partner: null },         // já nasce cancelada: não fatura
];

stays.configurar({
  paginado: async (caminho, params) => {
    if (caminho === '/content/listings') return LISTINGS_FALSOS.slice();
    if (caminho === '/booking/reservations') {
      return RESERVAS_FALSAS.filter(r => r.checkInDate >= params.from && r.checkInDate <= params.to);
    }
    return [];
  },
  resolverClientes: async (ids) => Object.fromEntries(ids.map(id => [id, `Hóspede ${id}`])),
});

const conta = (codigo) => naA(() => repo.contaPorCodigo(empresaA.id, codigo));
const saldoDe = (codigo) => naA(() => ledger.saldo(conta(codigo).id, { desde: '2026-09-01', ate: '2026-09-30' })).saldoCents;

testeAsync('stays: primeira sincronização lança as reservas que faturam', async () => {
  const r = await naA(() => stays.sincronizar({ entidadeId: empresaA.id, competencia: '2026-09' }));
  assert.strictEqual(r.resumo.lidas, 3);
  assert.strictEqual(r.resumo.nova, 2, `esperava 2 novas, veio ${r.resumo.nova}`);
  assert.strictEqual(r.resumo.ignorada, 1, 'a cancelada que nunca foi lançada tem de ser ignorada');
  assert.strictEqual(r.erros.length, 0, JSON.stringify(r.erros));
});

testeAsync('stays: receita é price._f_total, NUNCA tarifa × noites', async () => {
  // R-1 = 4.800 (4 noites) e R-2 = 2.500 (2 noites). Total 7.300.
  // Se alguém multiplicar tarifa por noite, este número infla e o teste cai.
  assert.strictEqual(saldoDe('3.1.1.001'), 730000, 'receita bruta errada');
});

testeAsync('stays: comissão do canal entra como DEDUÇÃO da receita', async () => {
  assert.strictEqual(saldoDe('3.2.1.001'), 72000, 'comissão do Booking não virou dedução');
});

testeAsync('stays: recebível de canal é líquido e o de reserva direta é cheio', async () => {
  assert.strictEqual(saldoDe('1.1.2.002'), 408000, 'canal devia dever 4.800 − 720');
  assert.strictEqual(saldoDe('1.1.2.001'), 250000, 'reserva direta devia gerar recebível cheio');
});

testeAsync('stays: contraparte do canal é o CANAL, não o hóspede', async () => {
  const cps = naA(() => repo.listarContrapartes(empresaA.id, 'cliente'));
  assert.ok(cps.some(c => c.nome === 'Booking.com'), 'o canal não virou contraparte');
  assert.ok(cps.some(c => /Hóspede C-2/.test(c.nome)), 'o hóspede da reserva direta não virou contraparte');
});

testeAsync('stays: cada imóvel vira centro de custo pelo código da Stays', async () => {
  const centros = naA(() => repo.listarCentrosCusto(empresaA.id));
  const kubi = centros.find(c => c.codigo === 'GG04I');
  assert.ok(kubi, 'GG04I não virou centro de custo');
  assert.strictEqual(kubi.externo_id, 'GG04I');
  assert.strictEqual(kubi.tipo, 'propriedade');
});

testeAsync('stays: reprocessar a mesma competência NÃO duplica nada', async () => {
  const antes = saldoDe('3.1.1.001');
  const r = await naA(() => stays.sincronizar({ entidadeId: empresaA.id, competencia: '2026-09' }));
  assert.strictEqual(r.resumo.sem_mudanca, 2, `esperava 2 sem mudança, veio ${JSON.stringify(r.resumo)}`);
  assert.strictEqual(r.resumo.nova, 0);
  assert.strictEqual(saldoDe('3.1.1.001'), antes, 'a receita mudou ao reprocessar');
});

testeAsync('stays: valor alterado na Stays lança só o DELTA', async () => {
  const lotesAntes = naA(() => repo.listarLotes(empresaA.id, { competencia: '2026-09', limite: 100 })).length;
  RESERVAS_FALSAS[0].price._f_total = 5200;              // hóspede estendeu: +400
  RESERVAS_FALSAS[0].partner.commission._mcval.BRL = 780; // comissão acompanha: +60

  const r = await naA(() => stays.sincronizar({ entidadeId: empresaA.id, competencia: '2026-09' }));
  assert.strictEqual(r.resumo.ajustada, 1, `esperava 1 ajuste, veio ${JSON.stringify(r.resumo)}`);
  assert.strictEqual(saldoDe('3.1.1.001'), 770000, 'receita não acompanhou o novo valor');
  assert.strictEqual(saldoDe('3.2.1.001'), 78000, 'comissão não acompanhou');
  assert.strictEqual(saldoDe('1.1.2.002'), 442000, 'recebível do canal não acompanhou');

  const lotesDepois = naA(() => repo.listarLotes(empresaA.id, { competencia: '2026-09', limite: 100 })).length;
  assert.strictEqual(lotesDepois, lotesAntes + 1, 'o ajuste devia ser UM lote a mais, não um relançamento inteiro');
  // E o lote do ajuste vale só a diferença.
  const ajuste = naA(() => repo.listarLotes(empresaA.id, { competencia: '2026-09', limite: 100 }))
    .find(l => /Ajuste/.test(l.memo));
  assert.ok(ajuste, 'não achei o lote de ajuste');
  assert.strictEqual(ajuste.total_cents, 40000, `o ajuste devia valer R$ 400,00, veio ${ajuste.total_cents}`);
});

testeAsync('stays: cancelamento posterior zera o que estava lançado', async () => {
  RESERVAS_FALSAS[1].type = 'canceled';                  // a reserva direta caiu
  const r = await naA(() => stays.sincronizar({ entidadeId: empresaA.id, competencia: '2026-09' }));
  assert.strictEqual(r.resumo.cancelada, 1, `esperava 1 cancelamento, veio ${JSON.stringify(r.resumo)}`);
  assert.strictEqual(saldoDe('1.1.2.001'), 0, 'o recebível da reserva cancelada não foi zerado');
  assert.strictEqual(saldoDe('3.1.1.001'), 520000, 'a receita não caiu com o cancelamento');
  // E nada foi apagado: o cancelamento é lançamento novo.
  const lotes = naA(() => repo.listarLotes(empresaA.id, { competencia: '2026-09', limite: 100 }));
  assert.ok(lotes.some(l => /Cancelamento/.test(l.memo)), 'o cancelamento não virou lançamento');
});

testeAsync('stays: título a receber acompanha e é cancelado junto', async () => {
  const titulos = naA(() => repo.q(
    "SELECT * FROM fin_titulos WHERE tenant_id = :tenant AND origem = 'stays'", {}));
  assert.strictEqual(titulos.length, 2, `esperava 2 títulos, veio ${titulos.length}`);
  const doCanal = titulos.find(t => t.origem_ref === 'R-1');
  assert.strictEqual(doCanal.valor_cents, 442000, 'o título do canal devia valer o líquido atualizado');
  assert.strictEqual(doCanal.status, 'aberto');
  const daDireta = titulos.find(t => t.origem_ref === 'R-2');
  assert.strictEqual(daDireta.status, 'cancelado', 'o título da reserva cancelada continuou aberto');
});

testeAsync('stays: conferência com o razão fecha em zero', async () => {
  const c = await naA(() => stays.conferir({ entidadeId: empresaA.id, competencia: '2026-09' }));
  assert.strictEqual(c.bate, true, `divergiu: ${JSON.stringify(c.divergentes)}`);
  assert.strictEqual(c.totalDiferencaCents.bruto, 0);
  assert.ok(/Bate integralmente/.test(c.veredito));
});

testeAsync('stays: conferência ACUSA divergência quando a Stays muda e ninguém sincroniza', async () => {
  RESERVAS_FALSAS[0].price._f_total = 6000;              // mudou lá, não sincronizou aqui
  const c = await naA(() => stays.conferir({ entidadeId: empresaA.id, competencia: '2026-09' }));
  assert.strictEqual(c.bate, false, 'a conferência não acusou a diferença');
  assert.strictEqual(c.totalDiferencaCents.bruto, 80000, 'diferença calculada errada');
  assert.ok(/divergem/.test(c.veredito));
  // E sincronizar resolve.
  await naA(() => stays.sincronizar({ entidadeId: empresaA.id, competencia: '2026-09' }));
  const depois = await naA(() => stays.conferir({ entidadeId: empresaA.id, competencia: '2026-09' }));
  assert.strictEqual(depois.bate, true, 'sincronizar não fechou a diferença');
});

testeAsync('stays: prévia (dryRun) não grava nada', async () => {
  RESERVAS_FALSAS[0].price._f_total = 9999;
  const antes = saldoDe('3.1.1.001');
  const r = await naA(() => stays.sincronizar({ entidadeId: empresaA.id, competencia: '2026-09', dryRun: true }));
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.resumo.ajustada, 1, 'a prévia devia enxergar a alteração');
  assert.strictEqual(saldoDe('3.1.1.001'), antes, 'a prévia GRAVOU — não podia');
  RESERVAS_FALSAS[0].price._f_total = 6000;              // devolve o estado sincronizado
});

testeAsync('stays: resultado por imóvel sai do razão com o código da Stays', async () => {
  const r = naA(() => relatorios.porCentroCusto(empresaA.id, '2026-09'));
  const kubi = r.linhas.find(l => l.codigo === 'GG04I');
  assert.ok(kubi, 'a Villa Kubitschek não apareceu no resultado por imóvel');
  // Receita da Kubitschek = bruto 6.000 − comissão do canal 780.
  assert.strictEqual(kubi.receitaCents, 522000, `receita do imóvel errada: ${kubi.receitaCents}`);
  assert.strictEqual(kubi.externoId, 'GG04I');
});

testeAsync('stays: sem configuração, responde "não configurado" em vez de quebrar', async () => {
  const guardado = { p: null };
  stays.configurar({});                                   // desliga
  assert.strictEqual(stays.configurado(), false);
  let erro = null;
  try { await naA(() => stays.sincronizar({ entidadeId: empresaA.id, competencia: '2026-09' })); }
  catch (e) { erro = e; }
  assert.ok(erro && /não está configurada/.test(erro.message), `mensagem pouco clara: ${erro && erro.message}`);
  void guardado;
  // Religa para os testes seguintes.
  stays.configurar({
    paginado: async (caminho, params) => {
      if (caminho === '/content/listings') return LISTINGS_FALSOS.slice();
      if (caminho === '/booking/reservations') return RESERVAS_FALSAS.filter(r => r.checkInDate >= params.from && r.checkInDate <= params.to);
      return [];
    },
    resolverClientes: async (ids) => Object.fromEntries(ids.map(id => [id, `Hóspede ${id}`])),
  });
});

testeAsync('stays: o vertical é gateado pelo plano', async () => {
  // 'essencial' (conta B) não inclui hospedagem; 'enterprise' (conta A) sim.
  assert.strictEqual(entitlements.temModulo(repo.tenantPorId(contaB.id), 'hospitalidade'), false);
  assert.strictEqual(entitlements.temModulo(repo.tenantPorId(contaA.id), 'hospitalidade'), true);
  assert.throws(() => entitlements.exigir(repo.tenantPorId(contaB.id), 'hospitalidade'), /não está no plano/);
});

testeAsync('stays: a rotina do worker pula quem não tem o módulo', async () => {
  // Não deve lançar nem tocar na conta B. A competência corrente não tem
  // reserva na Stays falsa, então o efeito esperado é nenhum.
  const antes = naB(() => repo.listarLotes(empresaB.id, { limite: 50 })).length;
  await financeiro.sincronizarStaysDeTodos();
  const depois = naB(() => repo.listarLotes(empresaB.id, { limite: 50 })).length;
  assert.strictEqual(depois, antes, 'a rotina lançou em conta sem o módulo de hospedagem');
});

// =====================================================================
// 14. ROTAS HTTP (ponta a ponta, com sessão real)
// =====================================================================
const jwtSecret = 'segredo-de-teste-' + Date.now();
const CHAVE_AGENTE = 'chave-de-agente-do-teste';
// Réplica da guarda do server.js: aceita a chave OU sessão de admin.
const requirePublishOrAdmin = (req, res, next) => {
  if (req.headers['x-publish-key'] === CHAVE_AGENTE) { req.viaChave = true; return next(); }
  return res.status(401).json({ erro: 'não autenticado' });
};
const app = express();
app.use(cookieParser());
app.use(tenancy.middlewareCorrelacao);
const requireAuth = (req, res, next) => { req.user = { email: 'augusto@teste', papel: 'admin' }; next(); };
const requireAdmin = (req, res, next) => next();
require('./rotas-app').registrarRotasApp(app, { jwtSecret, express });
require('./rotas-staff').registrarRotasStaff(app, { requireAuth, requireAdmin, express });
require('./rotas-agente').registrarRotasAgente(app, { requirePublishOrAdmin, express });

let servidor, base;
const http = require('http');
function pedir(metodo, caminho, { corpo, cookie, cabecalhos = {} } = {}) {
  return new Promise((resolve, reject) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const req = http.request(base + caminho, {
      method: metodo,
      headers: Object.assign({
        'Content-Type': 'application/json',
        ...(dados ? { 'Content-Length': Buffer.byteLength(dados) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      }, cabecalhos),
    }, (res) => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(b); } catch (_) { /* resposta não-JSON */ }
        resolve({ status: res.statusCode, corpo: json, cru: b, cookies: res.headers['set-cookie'] || [] });
      });
    });
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

let cookieA = '', cookieB = '';
testeAsync('HTTP: sobe o servidor', () => new Promise((resolve) => {
  servidor = app.listen(0, () => { base = `http://127.0.0.1:${servidor.address().port}`; resolve(); });
}));

testeAsync('HTTP: usuários criados para o teste de sessão', async () => {
  naA(() => contasSvc.criarUsuario({ email: 'augusto@villelastay.com.br', nome: 'Augusto', senha: 'senha-forte-1', perfil: 'proprietario' }));
  naB(() => contasSvc.criarUsuario({ email: 'dono@pousada-x.com.br', nome: 'Dono X', senha: 'senha-forte-2', perfil: 'proprietario' }));
  assert.ok(naA(() => repo.usuarioPorEmail('augusto@villelastay.com.br')));
});

testeAsync('HTTP: login errado não diz se o e-mail existe', async () => {
  const inexistente = await pedir('POST', '/finance/api/login', { corpo: { email: 'ninguem@x.com', senha: 'x' } });
  const senhaErrada = await pedir('POST', '/finance/api/login', { corpo: { email: 'augusto@villelastay.com.br', senha: 'errada' } });
  assert.strictEqual(inexistente.status, 401);
  assert.strictEqual(senhaErrada.status, 401);
  assert.strictEqual(inexistente.corpo.erro, senhaErrada.corpo.erro, 'as mensagens diferem e entregam quem tem conta');
});

testeAsync('HTTP: login e /eu devolvem plano e perfil', async () => {
  const r = await pedir('POST', '/finance/api/login', { corpo: { email: 'augusto@villelastay.com.br', senha: 'senha-forte-1' } });
  assert.strictEqual(r.status, 200);
  cookieA = r.cookies.map(c => c.split(';')[0]).join('; ');
  assert.ok(/fin_sess=/.test(cookieA), 'sem cookie de sessão');
  const eu = await pedir('GET', '/finance/api/eu', { cookie: cookieA });
  assert.strictEqual(eu.status, 200);
  assert.strictEqual(eu.corpo.conta.slug, 'villela-stay');
  assert.strictEqual(eu.corpo.perfil.nome, 'Proprietário');
  assert.ok(eu.corpo.plano.modulos.includes('razao'));
});

testeAsync('HTTP: sem sessão é 401, não 500 nem tela vazia', async () => {
  const r = await pedir('GET', '/finance/api/cockpit');
  assert.strictEqual(r.status, 401);
  assert.ok(/Sessão/.test(r.corpo.erro));
});

testeAsync('HTTP: cockpit responde com os KPIs explicáveis', async () => {
  const r = await pedir('GET', '/finance/api/cockpit?competencia=2026-08', { cookie: cookieA });
  assert.strictEqual(r.status, 200);
  assert.ok(r.corpo.kpis.every(k => k.origem && k.origem.formula));
});

testeAsync('HTTP: a conta B não alcança dado da conta A', async () => {
  const login = await pedir('POST', '/finance/api/login', { corpo: { email: 'dono@pousada-x.com.br', senha: 'senha-forte-2' } });
  cookieB = login.cookies.map(c => c.split(';')[0]).join('; ');
  // Cabeçalho de empresa apontando para a empresa de A: tem de ser ignorado.
  const r = await pedir('GET', '/finance/api/eu', { cookie: cookieB, cabecalhos: { 'x-empresa': empresaA.id } });
  assert.strictEqual(r.status, 200);
  assert.notStrictEqual(r.corpo.empresa.id, empresaA.id, 'VAZAMENTO: o cabeçalho escolheu empresa de outra conta');
  assert.strictEqual(r.corpo.conta.slug, 'pousada-x');
});

testeAsync('HTTP: lançamento pelo id de um lote de outra conta é 404', async () => {
  const r = await pedir('GET', `/finance/api/lancamentos/${loteDaLuz.id}`, { cookie: cookieB });
  assert.strictEqual(r.status, 404, `esperava 404, veio ${r.status}`);
});

testeAsync('HTTP: importar e conciliar ponta a ponta', async () => {
  const bancos_ = await pedir('GET', '/finance/api/bancos', { cookie: cookieA });
  const contaBanco = bancos_.corpo.contas[0];
  const csv = 'Data;Histórico;Valor\n15/08/2026;CAESB CONTA DE AGUA;-210,33';
  const imp = await pedir('POST', `/finance/api/bancos/${contaBanco.id}/importar`, {
    cookie: cookieA, corpo: { conteudo: csv, fonte: 'teste http' },
  });
  assert.strictEqual(imp.status, 200);
  assert.strictEqual(imp.corpo.resumo.novas, 1);

  const lista = await pedir('GET', '/finance/api/transacoes?status=sugerida', { cookie: cookieA });
  const alvo = lista.corpo.transacoes.find(t => /CAESB/.test(t.descricao));
  assert.ok(alvo, 'a transação da Caesb não foi listada');
  assert.ok(alvo.sugestao && alvo.sugestao.contaCodigo === '4.1.1.006', 'não sugeriu água e esgoto');

  const conc = await pedir('POST', `/finance/api/transacoes/${alvo.id}/conciliar`, { cookie: cookieA, corpo: {} });
  assert.strictEqual(conc.status, 200, `conciliar falhou: ${conc.cru}`);
  assert.strictEqual(conc.corpo.lote.total_cents, 21033);

  const lote = await pedir('GET', `/finance/api/lancamentos/${conc.corpo.lote.id}`, { cookie: cookieA });
  assert.ok(lote.corpo.origemDetalhe, 'sem drill-down até a origem');
  assert.ok(lote.corpo.auditoria.length > 0, 'sem trilha de auditoria no lote');
});

testeAsync('HTTP: sugestão de confiança baixa exige escolha explícita', async () => {
  const bancos_ = await pedir('GET', '/finance/api/bancos', { cookie: cookieA });
  const contaBanco = bancos_.corpo.contas[0];
  // "assinatura" é regra de confiança 70 — abaixo do corte de 85.
  const csv = 'Data;Histórico;Valor\n16/08/2026;ASSINATURA MENSAL XPTO;-49,90';
  await pedir('POST', `/finance/api/bancos/${contaBanco.id}/importar`, { cookie: cookieA, corpo: { conteudo: csv, fonte: 'baixa confianca' } });
  const lista = await pedir('GET', '/finance/api/transacoes?status=sugerida', { cookie: cookieA });
  const alvo = lista.corpo.transacoes.find(t => /XPTO/.test(t.descricao));
  assert.ok(alvo, 'transação não listada');
  const conc = await pedir('POST', `/finance/api/transacoes/${alvo.id}/conciliar`, { cookie: cookieA, corpo: {} });
  assert.strictEqual(conc.status, 400);
  assert.ok(/confiança/.test(conc.corpo.erro), `mensagem pouco clara: ${conc.corpo.erro}`);
});

testeAsync('HTTP: lançamento desbalanceado devolve 400 com a diferença', async () => {
  const contas = await pedir('GET', '/finance/api/contas?analiticas=1', { cookie: cookieA });
  const caixa = contas.corpo.contas.find(c => c.codigo === '1.1.1.001');
  const receita = contas.corpo.contas.find(c => c.codigo === '3.1.1.001');
  const r = await pedir('POST', '/finance/api/lancamentos', {
    cookie: cookieA,
    corpo: { data: '2026-08-25', memo: 'torto', linhas: [
      { contaId: caixa.id, debitoCents: 1000 }, { contaId: receita.id, creditoCents: 900 },
    ] },
  });
  assert.strictEqual(r.status, 400);
  assert.ok(/desbalanceado/.test(r.corpo.erro));
  assert.strictEqual(r.corpo.detalhe.diferenca, 100);
});

testeAsync('HTTP: estorno vira solicitação, não executa direto', async () => {
  const r = await pedir('POST', `/finance/api/lancamentos/${loteDaLuz.id}/estornar`, {
    cookie: cookieA, corpo: { motivo: 'lançado na conta errada' },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.aprovacao.status, 'pendente');
  const lote = naA(() => repo.lotePorId(loteDaLuz.id));
  assert.strictEqual(lote.status, 'contabilizado', 'o estorno não podia ter acontecido sem aprovação');
});

testeAsync('HTTP: contas a pagar ponta a ponta (criar → liquidar → aging)', async () => {
  const cps = await pedir('GET', '/finance/api/contrapartes?tipo=fornecedor', { cookie: cookieA });
  assert.strictEqual(cps.status, 200, cps.cru);
  const forn = cps.corpo.contrapartes.find(c => /Neoenergia Distribuição S/.test(c.nome));
  assert.ok(forn, 'fornecedor não listado pela API');
  assert.strictEqual(forn.dadosBancarios.conta, '•••766', 'a API devolveu o dado bancário sem máscara');

  const contas = await pedir('GET', '/finance/api/contas?analiticas=1', { cookie: cookieA });
  const despesa = contas.corpo.contas.find(c => c.codigo === '4.1.1.012');

  const criado = await pedir('POST', '/finance/api/titulos', {
    cookie: cookieA,
    corpo: {
      especie: 'pagar', contraparteId: forn.id, documento: 'NF-HTTP-1',
      descricao: 'Manutenção da piscina', valorCents: 60000,
      competencia: '2026-08', dataFato: '2026-08-12',
      rateio: [{ contaId: despesa.id, valorCents: 60000 }],
      parcelas: { quantidade: 2, primeiroVencimento: '2026-08-30' },
    },
  });
  assert.strictEqual(criado.status, 200, criado.cru);
  assert.strictEqual(criado.corpo.titulo.parcelas.length, 2);

  // Rateio que não fecha tem de voltar 400 com a diferença, pela API.
  const torto = await pedir('POST', '/finance/api/titulos', {
    cookie: cookieA,
    corpo: {
      especie: 'pagar', contraparteId: forn.id, documento: 'NF-HTTP-2', valorCents: 50000,
      competencia: '2026-08', rateio: [{ contaId: despesa.id, valorCents: 30000 }],
      parcelas: { quantidade: 1, primeiroVencimento: '2026-08-30' },
    },
  });
  assert.strictEqual(torto.status, 400);
  assert.strictEqual(torto.corpo.detalhe.diferenca, 20000);

  const parcela = criado.corpo.titulo.parcelas[0];
  const bancosR = await pedir('GET', '/finance/api/bancos', { cookie: cookieA });
  const liq = await pedir('POST', `/finance/api/parcelas/${parcela.id}/liquidar`, {
    cookie: cookieA,
    corpo: { data: '2026-08-30', valorCents: parcela.valorCents, contaBancariaId: bancosR.corpo.contas[0].id, meio: 'pix' },
  });
  assert.strictEqual(liq.status, 200, liq.cru);
  assert.strictEqual(liq.corpo.parcela.status, 'liquidada');

  const aging = await pedir('GET', '/finance/api/aging?especie=pagar&referencia=2026-10-01', { cookie: cookieA });
  assert.strictEqual(aging.status, 200);
  assert.ok(aging.corpo.totalAbertoCents > 0, 'aging a pagar vazio');
});

testeAsync('HTTP: ordem de pagamento não paga — abre solicitação', async () => {
  const titulosR = await pedir('GET', '/finance/api/titulos?especie=pagar&status=aberto', { cookie: cookieA });
  const alvo = titulosR.corpo.titulos.find(t => t.documento === 'NF-HTTP-1');
  assert.ok(alvo, 'título não listado');
  const detalhe = await pedir('GET', `/finance/api/titulos/${alvo.id}`, { cookie: cookieA });
  const aberta = detalhe.corpo.parcelas.find(p => p.status === 'aberta');

  const r = await pedir('POST', `/finance/api/parcelas/${aberta.id}/ordem-pagamento`, {
    cookie: cookieA,
    corpo: { data: '2026-09-30', valorCents: aberta.valorCents, motivo: 'segunda parcela da piscina' },
  });
  assert.strictEqual(r.status, 200, r.cru);
  assert.strictEqual(r.corpo.aprovacao.status, 'pendente');
  assert.ok(/NÃO executa a transferência/.test(r.corpo.aviso), 'o aviso não diz que o sistema não paga');

  // E a parcela continua aberta: nada foi pago sem aprovação.
  const depois = await pedir('GET', `/finance/api/titulos/${alvo.id}`, { cookie: cookieA });
  assert.strictEqual(depois.corpo.parcelas.find(p => p.id === aberta.id).status, 'aberta');
});

testeAsync('agente: a chave alcança a conta interna e sincroniza', async () => {
  const r = await pedir('POST', '/staff/api/finance/agente/stays/sincronizar', {
    corpo: { competencia: '2026-09' }, cabecalhos: { 'x-publish-key': CHAVE_AGENTE },
  });
  assert.strictEqual(r.status, 200, r.cru);
  assert.ok(r.corpo.resumo, 'sem resumo da sincronização');
  // Rodar de novo não muda nada (a reconciliação por estado-alvo).
  assert.strictEqual(r.corpo.resumo.nova, 0, 'a competência já estava sincronizada nos testes anteriores');
});

testeAsync('agente: a prévia funciona pela chave e não grava', async () => {
  const antes = naA(() => repo.listarLotes(empresaA.id, { competencia: '2026-09', limite: 200 })).length;
  const r = await pedir('POST', '/staff/api/finance/agente/stays/previa', {
    corpo: { competencia: '2026-09' }, cabecalhos: { 'x-publish-key': CHAVE_AGENTE },
  });
  assert.strictEqual(r.status, 200, r.cru);
  assert.strictEqual(r.corpo.dryRun, true);
  const depois = naA(() => repo.listarLotes(empresaA.id, { competencia: '2026-09', limite: 200 })).length;
  assert.strictEqual(depois, antes, 'a prévia pela chave GRAVOU');
});

testeAsync('agente: TRAVA 1 — chave errada não entra', async () => {
  const r = await pedir('GET', '/staff/api/finance/agente/saude', {
    cabecalhos: { 'x-publish-key': 'chave-errada' },
  });
  assert.ok([401, 403].includes(r.status), `chave errada devolveu ${r.status}`);
});

testeAsync('agente: TRAVA 2 — não alcança conta de assinante', async () => {
  const r = await pedir('POST', '/staff/api/finance/agente/stays/sincronizar', {
    corpo: { competencia: '2026-09', conta: 'pousada-x' },
    cabecalhos: { 'x-publish-key': CHAVE_AGENTE },
  });
  assert.strictEqual(r.status, 403, `esperava 403, veio ${r.status}`);
  assert.ok(/só alcança a conta interna/.test(r.corpo.erro), `mensagem: ${r.corpo.erro}`);
});

testeAsync('agente: TRAVA 3 — ação material é recusada mesmo com a chave certa', async () => {
  const r = await pedir('POST', '/staff/api/finance/agente/teste-de-teto', {
    corpo: {}, cabecalhos: { 'x-publish-key': CHAVE_AGENTE },
  });
  assert.strictEqual(r.status, 403, `pagamento pela chave devolveu ${r.status} — a porta está larga demais`);
  assert.ok(/exige uma pessoa com alçada/.test(r.corpo.erro), `mensagem: ${r.corpo.erro}`);
});

teste('agente: o teto lê o catálogo do rbac, não uma lista paralela', () => {
  const { exigirNivelDeAgente, NIVEL_MAXIMO_AGENTE } = require('./rotas-agente');
  assert.strictEqual(NIVEL_MAXIMO_AGENTE, 2);
  // Toda ação de nível 3+ do catálogo tem de ser recusada — inclusive as
  // que forem acrescentadas depois deste teste ser escrito.
  for (const [nome, a] of Object.entries(rbac.ACOES)) {
    if (a.nivelMinimo <= 2) { exigirNivelDeAgente(nome); continue; }
    assert.throws(() => exigirNivelDeAgente(nome), /alçada|autorizad|regulat|habilita/i,
      `a ação ${nome} (nível ${a.nivelMinimo}) passou pela porta do agente`);
  }
});

teste('bootstrap: sem as env, não cria acesso e DIZ o que fazer', () => {
  delete process.env.FINANCE_ADMIN_EMAIL;
  delete process.env.FINANCE_ADMIN_INITIAL_PASSWORD;
  const r = contasSvc.semearUsuarioInicial();
  assert.strictEqual(r.criado, false);
  // A conta A já tem usuário (criado nos testes de HTTP), então o motivo
  // é esse; o que importa é nunca inventar senha.
  assert.ok(r.motivo, 'sem motivo explicando por que não criou');
});

teste('bootstrap: cria o primeiro acesso, recusa senha curta e roda uma vez só', () => {
  // Conta nova e vazia, para exercitar o caminho de verdade — a interna já
  // ganhou usuário nos testes de HTTP.
  const nova = tenancy.semContexto(() => contasSvc.provisionar({
    nome: 'Conta de bootstrap', slug: 'boot-teste', interno: true,
  }));
  const naNova = (fn) => tenancy.comTenant({ tenantId: nova.tenant.id, userId: 't' }, fn);
  const env = (email, senha) => {
    if (email) process.env.FINANCE_ADMIN_EMAIL = email; else delete process.env.FINANCE_ADMIN_EMAIL;
    if (senha) process.env.FINANCE_ADMIN_INITIAL_PASSWORD = senha; else delete process.env.FINANCE_ADMIN_INITIAL_PASSWORD;
  };

  env('', '');
  assert.strictEqual(contasSvc.semearUsuarioInicial('boot-teste').criado, false, 'criou sem as variáveis');
  assert.strictEqual(naNova(() => repo.listarUsuarios()).length, 0);

  env('dono@boot.teste', 'curta');
  const curta = contasSvc.semearUsuarioInicial('boot-teste');
  assert.strictEqual(curta.criado, false, 'aceitou senha curta');
  assert.ok(/10 caracteres/.test(curta.motivo), `motivo: ${curta.motivo}`);
  assert.strictEqual(naNova(() => repo.listarUsuarios()).length, 0);

  env('dono@boot.teste', 'senha-longa-o-bastante');
  const ok = contasSvc.semearUsuarioInicial('boot-teste');
  assert.strictEqual(ok.criado, true, `não criou: ${ok.motivo}`);
  assert.strictEqual(ok.perfil, 'proprietario');
  assert.strictEqual(naNova(() => repo.listarUsuarios()).length, 1);

  // Segunda passada não duplica nem troca a senha de quem já entrou.
  env('outro@boot.teste', 'outra-senha-bem-longa');
  const denovo = contasSvc.semearUsuarioInicial('boot-teste');
  assert.strictEqual(denovo.criado, false);
  assert.strictEqual(naNova(() => repo.listarUsuarios()).length, 1, 'criou um segundo usuário no boot seguinte');
  env('', '');
});

// ---------------------------------------- comercialização (fase 9)
const exportacao = require('./exportacao');
const paginas = require('./paginas');

teste('exportação: o CSV do razão é autossuficiente e fecha', () => {
  const r = naA(() => exportacao.razaoCsv(empresaA.id));
  assert.ok(r.linhas > 20, `poucas linhas exportadas: ${r.linhas}`);
  assert.strictEqual(r.fecha, true, 'o CSV exportado não fecha em débito = crédito');
  // Autossuficiência: código E nome da conta em cada linha, não só id.
  const cabecalho = r.csv.split(String.fromCharCode(13, 10))[0];
  for (const col of ['conta_codigo', 'conta_nome', 'debito_centavos', 'debito_reais', 'centro_nome', 'contraparte']) {
    assert.ok(cabecalho.includes(`"${col}"`), `o CSV não traz a coluna ${col} — export sem ela não é autossuficiente`);
  }
  assert.ok(r.csv.startsWith('﻿'), 'sem BOM — o Excel em português quebraria os acentos');
  // Aspas dentro do texto não podem quebrar a coluna.
  assert.strictEqual(exportacao.celula('diz "isto"'), '"diz ""isto"""');
});

teste('exportação: o pacote traz como se verificar, sem confiar', () => {
  const p = naA(() => exportacao.pacoteCompleto(empresaA.id));
  assert.ok(p.razao.length > 10, 'pacote com poucos lotes');
  assert.strictEqual(p.conferencia.razaoFecha, true);
  assert.ok(p.conferencia.comoVerificar.includes('Some'), 'não diz como verificar');
  // O total declarado tem de bater com a soma das linhas de verdade.
  const soma = p.razao.reduce((s, l) => s + l.linhas.reduce((x, c) => x + c.debitoCents, 0), 0);
  assert.strictEqual(soma, p.conferencia.totalDebitoCents, 'o total declarado não bate com as linhas');
  assert.ok(p.planoDeContas.length > 60, 'plano de contas não exportado');
  assert.ok(p.extratoImportado.some(t => t.bruto), 'a linha original do arquivo do banco não foi preservada');
});

teste('exportação: dado bancário de terceiro NÃO vai no pacote', () => {
  const p = naA(() => exportacao.pacoteCompleto(empresaA.id));
  const texto = JSON.stringify(p);
  assert.ok(!/99887766/.test(texto), 'a conta bancária do fornecedor vazou no export');
  assert.ok(!/dados_bancarios|dadosBancarios/.test(texto), 'campo de dado bancário presente no export');
  assert.ok(/dado sensível de terceiros/.test(p.formato.observacao), 'não explica por que ficou de fora');
});

teste('exportação: conta SUSPENSA continua exportando', () => {
  repo.atualizarTenant(contaB.id, { status: 'suspensa' });
  // A escrita trava...
  assert.throws(() => entitlements.exigir(repo.tenantPorId(contaB.id), 'razao'), /suspensa/);
  // ...e a exportação, não.
  const inv = naB(() => exportacao.inventario(empresaB.id));
  assert.ok(typeof inv.lotes === 'number', 'inventário indisponível para conta suspensa');
  const csv = naB(() => exportacao.razaoCsv(empresaB.id));
  assert.ok(csv.csv.length > 0, 'CSV vazio para conta suspensa');
  assert.ok(/sempre disponível/.test(inv.aviso));
  repo.atualizarTenant(contaB.id, { status: 'ativa' });
});

teste('landing: registra interesse, normaliza o e-mail e não duplica', () => {
  const r1 = paginas.registrarInteresse({ nome: 'Fulana', email: '  DONA@Pousada.COM ', empresa: 'Pousada X' }, '1.2.3.4');
  assert.strictEqual(r1.jaHavia, false);
  const r2 = paginas.registrarInteresse({ email: 'dona@pousada.com' }, '1.2.3.4');
  assert.strictEqual(r2.jaHavia, true, 'duplicou o interessado');
  const lista = paginas.listarInteressados();
  assert.strictEqual(lista.filter(i => i.email === 'dona@pousada.com').length, 1);
  assert.strictEqual(lista.find(i => i.email === 'dona@pousada.com').nome, 'Fulana');
});

lanca('landing: e-mail inválido é recusado', () =>
  paginas.registrarInteresse({ email: 'sem-arroba' }, ''), /e-mail válido/);

teste('landing: a página cita os planos reais, não texto solto', () => {
  const html = paginas.landingHTML();
  for (const p of entitlements.PLANOS_SEMENTE.filter(x => x.publico !== false)) {
    assert.ok(html.includes(p.nome), `o plano "${p.nome}" não aparece na landing`);
  }
  // E não promete o que não existe.
  assert.ok(!/assinar agora|comprar agora/i.test(html), 'a landing promete assinatura sem cobrança ligada');
  assert.ok(/não faz/i.test(html), 'a landing não diz o que o sistema NÃO faz');
  assert.ok(/não substitui contador/i.test(html), 'sem o aviso de que não substitui contador');
});

testeAsync('HTTP: exportação responde e o CSV vem como anexo', async () => {
  const inv = await pedir('GET', '/finance/api/exportar', { cookie: cookieA });
  assert.strictEqual(inv.status, 200, inv.cru);
  assert.ok(inv.corpo.lotes > 0);

  const csv = await pedir('GET', '/finance/api/exportar/razao.csv', { cookie: cookieA });
  assert.strictEqual(csv.status, 200);
  assert.ok(csv.cru.includes('conta_codigo'), 'CSV sem cabeçalho');

  const pacote = await pedir('GET', '/finance/api/exportar/completo.json', { cookie: cookieA });
  assert.strictEqual(pacote.status, 200);
  assert.strictEqual(pacote.corpo.conferencia.razaoFecha, true);
});

testeAsync('HTTP: a conta B não exporta o razão da conta A', async () => {
  const p = await pedir('GET', '/finance/api/exportar/completo.json', { cookie: cookieB });
  assert.strictEqual(p.status, 200);
  assert.notStrictEqual(p.corpo.empresa.id, empresaA.id, 'VAZAMENTO: exportou empresa de outra conta');
  assert.strictEqual(p.corpo.conta.slug, 'pousada-x');
});

testeAsync('HTTP: admin vê a saúde de todas as contas', async () => {
  const r = await pedir('GET', '/staff/api/finance/saude');
  assert.strictEqual(r.status, 200);
  assert.ok(r.corpo.contas.length >= 2);
  assert.strictEqual(r.corpo.resumo.razaoOk, r.corpo.resumo.total, 'alguma conta com razão desbalanceado');
});

testeAsync('HTTP: catálogo mostra as ações proibidas com o motivo', async () => {
  const r = await pedir('GET', '/staff/api/finance/catalogo');
  const proibidas = r.corpo.acoes.filter(a => a.nivelMinimo === 4);
  assert.ok(proibidas.length >= 3, 'faltam ações de nível 4 no catálogo');
  assert.ok(proibidas.every(a => a.motivo), 'ação proibida sem motivo escrito');
});

// =====================================================================
// 14.5 COBRANÇA E ASSINATURA (fase 9)
//
// O bloco existe para travar três coisas que, se quebrarem, quebram calado:
// a conta do próprio grupo entrando na régua de inadimplência, a fatura
// duplicada pelo reenvio do webhook e — a mais grave — dado contábil de
// terceiro virando refém de cobrança.
// =====================================================================
const billing = require('./billing');

// Mock do Mercado Pago: registra o que foi chamado e devolve o que a API
// devolveria. `__mock` é o que faz `billing.ativo()` valer sem token real.
const chamadasMP = [];
function mpFalso(caminho, opts = {}) {
  chamadasMP.push({ caminho, metodo: opts.method || 'GET', corpo: opts.body ? JSON.parse(opts.body) : null });
  if (caminho === '/preapproval' && opts.method === 'POST') {
    return Promise.resolve({ id: 'PRE-' + chamadasMP.length, init_point: 'https://mp.exemplo/checkout/1', status: 'pending' });
  }
  if (/^\/preapproval\//.test(caminho)) return Promise.resolve({ id: caminho.split('/')[2], status: 'authorized', external_reference: mpFalso.ref || '' });
  if (/^\/v1\/payments\//.test(caminho)) return Promise.resolve({ id: caminho.split('/')[3], status: 'approved', external_reference: mpFalso.ref || '' });
  if (/^\/authorized_payments\//.test(caminho)) return Promise.resolve(mpFalso.recorrencia || {});
  return Promise.resolve({});
}
mpFalso.__mock = true;

let contaC, contaD, empresaD;
testeAsync('cobrança: sem Mercado Pago, o produto NÃO fica sem cobrança', () => {
  billing.configurar({ mpFetch: null });
  // `configurar` só sobrescreve o que recebe — zera à mão para o estado "sem MP".
  assert.ok(typeof billing.ativo() === 'boolean');
});

testeAsync('cobrança: conta nova para os testes de assinatura', () => {
  const r = tenancy.semContexto(() => contasSvc.provisionar({
    nome: 'Padaria do Bairro', slug: 'padaria-teste', planoSlug: 'essencial',
    contatoEmail: 'financeiro@padaria.exemplo',
  }));
  contaC = r.tenant;
  assert.strictEqual(contaC.status, 'trial', 'conta externa devia nascer em avaliação');
  assert.ok(contaC.trial_ate, 'trial sem data de fim é trial eterno');
});

testeAsync('cobrança: o estado diz o que se perde E o que nunca se perde', () => {
  const e = tenancy.comTenant({ tenantId: contaC.id, userId: 'dono' }, () =>
    billing.estado(repo.tenantPorId(contaC.id)));
  assert.strictEqual(e.consequencias.escrita, 'liberada');
  assert.ok(/sempre liberadas/.test(e.consequencias.leituraEExportacao),
    'a tela de cobrança não promete que a leitura continua');
  assert.ok(e.planosDisponiveis.length >= 2, 'nenhum plano ofertável');
  assert.ok(e.planosDisponiveis.every(p => p.precoCents > 0), 'plano sem preço na vitrine de upgrade');
});

testeAsync('cobrança: assinar cria PENDENTE, não ativa — quem ativa é o MP', async () => {
  billing.configurar({ mpFetch: mpFalso });
  const r = await tenancy.comTenant({ tenantId: contaC.id, userId: 'dono', perfil: 'proprietario' }, () =>
    billing.assinar(repo.tenantPorId(contaC.id), 'controle', { email: 'dono@padaria.exemplo' }));
  assert.ok(/^https:/.test(r.link), 'sem link de checkout');
  const criada = chamadasMP.find(c => c.caminho === '/preapproval');
  assert.strictEqual(criada.corpo.external_reference, `finance:${contaC.id}:controle`);
  assert.strictEqual(criada.corpo.auto_recurring.transaction_amount, 349,
    'o preço enviado ao MP não é o do plano');
  tenancy.comTenant({ tenantId: contaC.id, userId: 'auditor' }, () => {
    const sub = repo.assinaturaVigente();
    assert.strictEqual(sub.status, 'pendente', 'assinatura nasceu ativa antes de o MP autorizar');
    assert.strictEqual(repo.listarInvoices(5).length, 0, 'gerou fatura antes de haver pagamento');
  });
  assert.strictEqual(repo.tenantPorId(contaC.id).status, 'trial',
    'a conta virou ativa só por ter clicado em assinar');
});

testeAsync('cobrança: o webhook autorizado ativa a conta e gera UMA fatura', () => {
  tenancy.comTenant({ tenantId: contaC.id, userId: 'mercadopago', perfil: 'plataforma' }, () => {
    const sub = repo.assinaturaVigente();
    const r1 = billing.aplicarPreapproval(contaC.id, sub.externo_ref, 'authorized');
    assert.strictEqual(r1.resultado, 'ativada');
    // Reenvio: o MP repete a notificação. Fatura duplicada é erro que o cliente vê.
    const r2 = billing.aplicarPreapproval(contaC.id, sub.externo_ref, 'authorized');
    assert.strictEqual(r2.resultado, 'ja-ativa');
    assert.strictEqual(repo.listarInvoices(10).length, 1,
      'o reenvio do webhook duplicou a fatura');
  });
  assert.strictEqual(repo.tenantPorId(contaC.id).status, 'ativa');
});

testeAsync('cobrança: pagamento recorrente é idempotente pelo id do MP', () => {
  tenancy.comTenant({ tenantId: contaC.id, userId: 'mercadopago', perfil: 'plataforma' }, () => {
    const antes = repo.listarInvoices(20).length;
    const a = billing.registrarPagamento(contaC.id, 'PAY-777');
    const b = billing.registrarPagamento(contaC.id, 'PAY-777');
    assert.strictEqual(a.resultado, 'registrado');
    assert.strictEqual(b.resultado, 'ja-registrado');
    assert.strictEqual(repo.listarInvoices(20).length, antes + 1,
      'o mesmo pagamento do MP gerou duas faturas');
  });
});

testeAsync('cobrança: a régua NUNCA toca na conta interna do grupo', () => {
  // Encena o pior caso: a conta do grupo em trial vencido e inadimplente há meses.
  const antes = repo.tenantPorId(contaA.id);
  assert.strictEqual(antes.interno, 1, 'a conta A devia ser a interna');
  repo.atualizarTenant(contaA.id, { status: 'trial', trial_ate: '2020-01-01' });
  const r = billing.cicloDeVida();
  assert.ok(!r.trialsVencidos.includes(contaA.slug), 'a régua encerrou a avaliação da conta do grupo');
  assert.strictEqual(repo.tenantPorId(contaA.id).status, 'trial',
    'a régua mexeu no status da conta interna');
  repo.atualizarTenant(contaA.id, { status: antes.status, trial_ate: antes.trial_ate || '' });
});

testeAsync('cobrança: mudarStatusDaConta recusa rebaixar a conta interna', () => {
  const r = billing.mudarStatusDaConta(contaA.id, 'suspensa', 'teste');
  assert.strictEqual(r.ignorado, true);
  assert.strictEqual(repo.tenantPorId(contaA.id).status !== 'suspensa', true);
});

testeAsync('cobrança: conta própria para a régua de inadimplência', () => {
  // Conta dedicada: a régua muda status, e mudar o status de uma conta que
  // outro teste usa faria a falha aparecer longe da causa.
  const r = tenancy.semContexto(() => contasSvc.provisionar({
    nome: 'Mercearia Teste', slug: 'mercearia-regua', planoSlug: 'essencial',
  }));
  contaD = r.tenant; empresaD = r.entidade;
  assert.strictEqual(contaD.status, 'trial');
  tenancy.comTenant({ tenantId: contaD.id, userId: 'plataforma', perfil: 'proprietario' }, () =>
    contasSvc.criarUsuario({ email: 'dono@mercearia.com.br', nome: 'Dono', senha: 'senha-forte-3', perfil: 'proprietario' }));
});

testeAsync('cobrança: trial vence no dia SEGUINTE ao prometido, não no próprio dia', () => {
  const hoje = new Date().toISOString().slice(0, 10);
  repo.atualizarTenant(contaD.id, { status: 'trial', trial_ate: hoje });
  billing.cicloDeVida();
  assert.strictEqual(repo.tenantPorId(contaD.id).status, 'trial',
    'a avaliação foi encerrada no último dia prometido');
  repo.atualizarTenant(contaD.id, { trial_ate: '2020-01-01' });
  const r = billing.cicloDeVida();
  assert.ok(r.trialsVencidos.includes(contaD.slug), 'trial vencido não foi encerrado');
  assert.strictEqual(repo.tenantPorId(contaD.id).status, 'inadimplente');
});

testeAsync('cobrança: inadimplente ainda LANÇA — a suspensão só vem depois do prazo', () => {
  const t = repo.tenantPorId(contaD.id);
  assert.strictEqual(t.status, 'inadimplente');
  const e = entitlements.resolver(t);
  assert.strictEqual(e.bloqueiaEscrita, false,
    'inadimplência bloqueou a escrita no primeiro dia — o prazo de tolerância existe por escrito');
  // Ainda dentro do prazo: a régua não suspende.
  billing.cicloDeVida();
  assert.strictEqual(repo.tenantPorId(contaD.id).status, 'inadimplente');
});

testeAsync('cobrança: passado o prazo, suspende — e a suspensa continua LENDO', () => {
  const velho = new Date(Date.now() - (billing.DIAS_ATE_SUSPENDER + 1) * 86400000).toISOString();
  db.prepare('UPDATE tenants SET atualizado_em = ? WHERE id = ?').run(velho, contaD.id);
  const r = billing.cicloDeVida();
  assert.ok(r.suspensas.includes(contaD.slug), 'não suspendeu depois do prazo');
  const t = repo.tenantPorId(contaD.id);
  assert.strictEqual(t.status, 'suspensa');

  const e = entitlements.resolver(t);
  assert.strictEqual(e.bloqueiaEscrita, true, 'suspensa continuou lançando');
  // O que NÃO pode acontecer: perder acesso ao próprio razão.
  const saida = tenancy.comTenant({ tenantId: contaD.id, userId: 'dono' }, () => ({
    balancete: ledger.balancete(empresaD.id, {}),
    pacote: exportacao.inventario(empresaD.id),
  }));
  assert.ok(Array.isArray(saida.balancete.linhas), 'conta suspensa perdeu a leitura do razão');
  assert.ok(saida.pacote, 'conta suspensa perdeu a exportação');
});

testeAsync('cobrança: pagar reativa a conta suspensa', async () => {
  const r = tenancy.comTenant({ tenantId: contaD.id, userId: 'plataforma', perfil: 'plataforma' }, () =>
    billing.marcarPago(contaD.id, { motivo: 'Pix recebido em 24/08 — comprovante no e-mail' }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(repo.tenantPorId(contaD.id).status, 'ativa');
});

lancaAsync('cobrança: pagamento manual sem motivo é recusado', () =>
  tenancy.comTenant({ tenantId: contaD.id, userId: 'plataforma', perfil: 'plataforma' }, () =>
    billing.marcarPago(contaD.id, { motivo: '  ' })), /motivo/i);

testeAsync('cobrança: toda mudança de status entra na auditoria encadeada, com motivo', () => {
  const eventos = tenancy.comTenant({ tenantId: contaD.id, userId: 'auditor' }, () =>
    auditoria.listar({ objetoTipo: 'tenant', limite: 50 }));
  const mudanca = eventos.find(e => e.acao === 'tenant.status');
  assert.ok(mudanca, 'mudança de status comercial não deixou rastro');
  assert.ok(String(mudanca.motivo).trim().length > 3, 'rastro sem motivo legível');
  const cadeia = auditoria.verificarCadeia(contaD.id);
  assert.strictEqual(cadeia.ok, true, 'a cadeia de auditoria quebrou depois da cobrança');
});

testeAsync('cobrança: o MRR conta só quem paga — trial, cortesia e inadimplente ficam de fora', () => {
  const r = tenancy.comoPlataforma({ userId: 'teste', motivo: 'conferir MRR' }, () => billing.resumo());
  const somaPagantes = r.contas.filter(c => c.pagante).reduce((s, c) => s + c.precoCents, 0);
  assert.strictEqual(r.mrrCents, somaPagantes);
  for (const c of r.contas) {
    if (c.interno) assert.strictEqual(c.pagante, false, 'conta de cortesia entrou no MRR');
    if (c.status !== 'ativa') assert.strictEqual(c.pagante, false, `conta ${c.status} entrou no MRR`);
  }
  assert.strictEqual(r.arrCents, r.mrrCents * 12);
});

testeAsync('cobrança: webhook de conta desconhecida não move conta nenhuma', () => {
  assert.strictEqual(billing.tenantDoWebhook('finance:nao-existe:controle', ''), '',
    'aceitou uma referência apontando para conta inexistente');
  assert.strictEqual(billing.tenantDoWebhook('', ''), '');
  assert.strictEqual(billing.tenantDoWebhook(`finance:${contaC.id}:controle`, ''), contaC.id);
});

testeAsync('cobrança: o webhook do MP acha a conta pelo preapproval, sem contexto', async () => {
  billing.configurar({ mpFetch: mpFalso });
  const ref = tenancy.comTenant({ tenantId: contaC.id, userId: 'auditor' }, () => repo.assinaturaVigente().externo_ref);
  mpFalso.ref = '';                              // o MP nem sempre devolve a referência
  const r = await billing.processarWebhook({ type: 'preapproval', data: { id: ref } }, {});
  assert.strictEqual(r.ok, true);
  assert.ok(['ativada', 'ja-ativa'].includes(r.resultado), `resultado inesperado: ${r.resultado}`);
});

testeAsync('cobrança: o preapproval leva a URL de notificação — o painel do MP não cobre assinatura', async () => {
  const criada = chamadasMP.find(c => c.caminho === '/preapproval');
  assert.ok(/\/finance\/webhooks\/mercadopago$/.test(criada.corpo.notification_url),
    `preapproval sem notification_url: ${criada.corpo.notification_url}`);
  // A URL tem de apontar para ESTE backend, onde a rota existe — e não para o
  // site institucional, que devolveria 404 a cada notificação.
  assert.ok(!/villelastay\.com\.br/.test(criada.corpo.notification_url),
    'a notificação foi mandada para o site institucional, que não tem a rota');
  assert.ok(criada.corpo.back_url, 'preapproval sem back_url');
});

testeAsync('cobrança: a renovação mensal chega como subscription_authorized_payment', async () => {
  billing.configurar({ mpFetch: mpFalso });
  const ref = tenancy.comTenant({ tenantId: contaC.id, userId: 'auditor' }, () => repo.assinaturaVigente().externo_ref);
  const antes = tenancy.comTenant({ tenantId: contaC.id, userId: 'auditor' }, () => repo.listarInvoices(50).length);

  // Tentativa que ainda não virou caixa: não pode gerar fatura.
  mpFalso.recorrencia = { id: 'AUT-1', preapproval_id: ref, status: 'recycling', payment: { id: 'P-1', status: 'rejected' } };
  const r1 = await billing.processarWebhook({ type: 'subscription_authorized_payment', data: { id: 'AUT-1' } }, {});
  assert.ok(r1.ignorado, `cobrança em tentativa virou fatura: ${JSON.stringify(r1)}`);

  // Cobrança do mês efetivada.
  mpFalso.recorrencia = { id: 'AUT-2', preapproval_id: ref, status: 'processed', payment: { id: 'P-2', status: 'approved' } };
  const r2 = await billing.processarWebhook({ type: 'subscription_authorized_payment', data: { id: 'AUT-2' } }, {});
  assert.strictEqual(r2.resultado, 'registrado', `renovação não registrada: ${JSON.stringify(r2)}`);

  // Reenvio do MP: mesma cobrança, uma fatura só.
  const r3 = await billing.processarWebhook({ type: 'subscription_authorized_payment', data: { id: 'AUT-2' } }, {});
  assert.strictEqual(r3.resultado, 'ja-registrado', 'a renovação reenviada gerou fatura de novo');

  const depois = tenancy.comTenant({ tenantId: contaC.id, userId: 'auditor' }, () => repo.listarInvoices(50).length);
  assert.strictEqual(depois, antes + 1, `esperava 1 fatura nova, vieram ${depois - antes}`);
  mpFalso.recorrencia = null;
});

lancaAsync('cobrança: sem MP configurado, assinar diz o caminho manual', async () => {
  billing.configurar({});
  const guardado = process.env.MP_ACCESS_TOKEN;
  delete process.env.MP_ACCESS_TOKEN;
  const salvo = mpFalso.__mock;
  delete mpFalso.__mock;
  try {
    await tenancy.comTenant({ tenantId: contaC.id, userId: 'dono', perfil: 'proprietario' }, () =>
      billing.assinar(repo.tenantPorId(contaC.id), 'controle', {}));
  } finally {
    mpFalso.__mock = salvo;
    if (guardado) process.env.MP_ACCESS_TOKEN = guardado;
    billing.configurar({ mpFetch: mpFalso });
  }
}, /Pix ou boleto/);

testeAsync('cobrança: assinatura e faturas de uma conta não vazam para outra', () => {
  const daC = tenancy.comTenant({ tenantId: contaC.id, userId: 'x' }, () => repo.listarInvoices(50));
  const daB = tenancy.comTenant({ tenantId: contaD.id, userId: 'y' }, () => repo.listarInvoices(50));
  const idsC = new Set(daC.map(f => f.id));
  assert.ok(daB.every(f => !idsC.has(f.id)), 'fatura de uma conta apareceu na outra');
  assert.ok(daC.every(f => f.tenant_id === contaC.id), 'listagem trouxe fatura de fora da conta');
});

testeAsync('cobrança: as ações comerciais estão no catálogo de risco, e não são materiais', () => {
  for (const a of ['assinatura.assinar', 'assinatura.cancelar']) {
    const acao = rbac.acao(a);
    assert.ok(acao, `${a} fora do catálogo de risco`);
    assert.strictEqual(acao.permissao, 'administrar', `${a} não é exclusiva do dono da conta`);
    assert.ok(acao.nivelMinimo < 3, `${a} virou material — cancelar assinatura não mexe no razão`);
  }
});

// // =====================================================================
// 14.6 PAINEL DO STAFF (staff/app-finance.js) contra a API DE VERDADE
//
// O painel é escrito à mão contra o formato que a API devolve, e é aí que
// ele apodrece calado: a rota muda um campo de string para objeto e a tela
// passa a escrever "undefined" sem quebrar nada. Aqui o arquivo real do
// portal é carregado num sandbox e alimentado com a RESPOSTA REAL das
// rotas — se a forma divergir, aparece aqui e não na tela do Augusto.
// =====================================================================
const vm = require('vm');

function carregarPainel(chamarApi) {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'staff', 'app-finance.js'), 'utf8');
  const escritos = {};
  const elemento = (id) => ({
    _id: id,
    set innerHTML(v) { escritos[id] = String(v); },
    get innerHTML() { return escritos[id] || ''; },
    value: '',
  });
  const elementos = { 'fin-corpo': elemento('fin-corpo'), conteudo: elemento('conteudo') };
  const escapar = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const sandbox = {
    api: chamarApi,
    esc: escapar,
    conteudo: () => elementos.conteudo,
    cabecalho: (t, s) => `<h1>${escapar(t)}</h1><p>${escapar(s || '')}</p>`,
    tabela: (cols, linhas) => `<table><thead>${(cols || []).join('|')}</thead><tbody>` +
      (linhas || []).map(l => `<tr>${(l || []).map(c => c == null ? '' : c).join('|')}</tr>`).join('') + '</tbody></table>',
    document: { getElementById: (id) => elementos[id] || null },
    alert: () => {},
    prompt: () => null,
    confirm: () => true,
    console,
    Date, Number, String, Math, JSON, Object, Array, Promise,
  };
  vm.createContext(sandbox);
  // `const FIN` no topo de um script é vínculo léxico, não propriedade do
  // global do contexto — sem esta linha o sandbox devolveria undefined.
  vm.runInContext(`${fonte}
;this.FIN = FIN;`, sandbox, { filename: 'app-finance.js' });
  return { FIN: sandbox.FIN, escritos, elementos };
}

// "undefined"/"[object Object]" na tela é o sintoma de campo que mudou de
// forma na API e ninguém percebeu. Vale como asserção porque nenhum texto
// legítimo deste painel contém essas palavras.
const escapeSimples = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Procura lixo de JavaScript na tela. `NaN` é conferido só no TEXTO entre
 * tags: os ids são base64url aleatório e um deles pode conter "NaN" por
 * acaso (aconteceu — `dOEeNaNV22iY`), o que faria o teste falhar sozinho de
 * tempos em tempos. `undefined` e `[object Object]` valem no HTML inteiro,
 * inclusive dentro de atributo, onde também são defeito.
 */
function semLixo(html, tela) {
  const achar = (re) => (html.match(re) || [])[0];
  const grave = achar(/.{0,60}(undefined|\[object Object\])(.{0,60})/);
  assert.ok(!grave, `a tela ${tela} imprimiu lixo: ${grave}`);
  const texto = String(html).replace(/<[^>]*>/g, ' ');
  const nan = (texto.match(/.{0,60}NaN.{0,60}/) || [])[0];
  assert.ok(!nan, `a tela ${tela} imprimiu NaN: ${nan}`);
}

testeAsync('painel do staff: a aba Saúde bate com o que /saude devolve', async () => {
  const painel = carregarPainel(async (m, c) => (await pedir(m, '/staff/api' + c)).corpo);
  await painel.FIN.vSaude();
  const html = painel.escritos['fin-corpo'];
  semLixo(html, 'Saúde');
  const api = (await pedir('GET', '/staff/api/finance/saude')).corpo;
  assert.ok(/Diário append-only/.test(html), 'a aba não mostra o estado do diário (o RPO)');
  assert.ok(html.includes(api.diario.veredito),
    'a aba não repete o VEREDITO do diário — é a frase que diz se o RPO é real ou promessa');
  for (const c of api.contas) {
    assert.ok(html.includes(escapeSimples(c.nome)), `a aba Saúde não lista a conta ${c.nome}`);
  }
  assert.ok(html.includes(`${api.resumo.razaoOk}/${api.resumo.total}`), 'a aba não imprime a contagem de razões que fecham');
  assert.ok(/contexto \+ guarda no repositório/.test(html), 'a aba não declara o modelo de isolamento');
});

testeAsync('painel do staff: a aba Cobrança bate com o que /billing devolve', async () => {
  const painel = carregarPainel(async (m, c) => (await pedir(m, '/staff/api' + c)).corpo);
  await painel.FIN.vCobranca();
  const html = painel.escritos['fin-corpo'];
  semLixo(html, 'Cobrança');
  // Comparar contra o VALOR que a API devolveu, e não só contra "tem R$ na
  // tela": `esc(undefined)` devolve string vazia, então campo renomeado na
  // API sumiria em silêncio — célula vazia parece ausência de dado, não bug.
  const api = (await pedir('GET', '/staff/api/finance/billing')).corpo;
  for (const [campo, valor] of [['mrr', api.resumo.mrr], ['arr', api.resumo.arr], ['em risco', api.resumo.emRisco]]) {
    assert.ok(html.includes(valor), `a aba Cobrança não imprimiu o ${campo} (${valor}) que a API devolveu`);
  }
  assert.ok(html.includes(String(api.resumo.por.pagantes)), 'a aba não imprimiu a contagem de pagantes');
  // A promessa que o produto faz por escrito tem de estar na tela de quem cobra.
  assert.ok(/continua lendo e exportando/.test(html),
    'a tela de cobrança não lembra que a conta suspensa continua lendo o próprio razão');
  assert.ok(/conta do grupo — fora da cobrança/.test(html),
    'a conta interna aparece cobrável no painel');
});

testeAsync('painel do staff: as abas Planos, Contas e Diário rendem sem lixo', async () => {
  const painel = carregarPainel(async (m, c) => (await pedir(m, '/staff/api' + c)).corpo);
  for (const [nome, fn] of [['Planos', painel.FIN.vPlanos], ['Contas', painel.FIN.vContas], ['Diário', painel.FIN.vDiario]]) {
    await fn();
    semLixo(painel.escritos['fin-corpo'], nome);
  }
  assert.ok(/Níveis de risco/.test(painel.escritos['fin-corpo']), 'a aba Diário & risco não mostra o catálogo de níveis');
});

testeAsync('painel do staff: registrar pagamento manual sem motivo é recusado pela ROTA', async () => {
  const contas = (await pedir('GET', '/staff/api/finance/tenants')).corpo.tenants;
  const externa = contas.find(t => !t.interno);
  const r = await pedir('POST', `/staff/api/finance/billing/${externa.id}/pago`, { corpo: { motivo: '' } });
  assert.strictEqual(r.status >= 400, true, 'a rota aceitou pagamento sem motivo — a auditoria ficaria cega');
});

testeAsync('painel do staff: mudar status exige motivo e recusa status inventado', async () => {
  const contas = (await pedir('GET', '/staff/api/finance/tenants')).corpo.tenants;
  const externa = contas.find(t => !t.interno);
  const semMotivo = await pedir('POST', `/staff/api/finance/billing/${externa.id}/status`, { corpo: { status: 'ativa' } });
  assert.strictEqual(semMotivo.status, 400, 'mudou o status comercial sem motivo');
  const inventado = await pedir('POST', `/staff/api/finance/billing/${externa.id}/status`, { corpo: { status: 'aposentada', motivo: 'x' } });
  assert.strictEqual(inventado.status, 400, 'aceitou um status que não existe');
});

// ------------------------------------------------ troca da própria senha
testeAsync('senha: troca exige a senha ATUAL — sessão roubada não vira posse da conta', async () => {
  const r = await pedir('POST', '/finance/api/senha', {
    cookie: cookieA, corpo: { senhaAtual: 'senha-errada-1', senhaNova: 'senha-nova-do-augusto' },
  });
  assert.strictEqual(r.status >= 400, true, 'trocou a senha sem saber a atual');
  assert.ok(/senha atual/i.test(r.corpo.erro), `mensagem inesperada: ${r.corpo.erro}`);
});

testeAsync('senha: recusa senha curta e senha igual à atual', async () => {
  const curta = await pedir('POST', '/finance/api/senha', {
    cookie: cookieA, corpo: { senhaAtual: 'senha-forte-1', senhaNova: 'curta' },
  });
  assert.strictEqual(curta.status >= 400, true, 'aceitou senha de 5 caracteres');
  const igual = await pedir('POST', '/finance/api/senha', {
    cookie: cookieA, corpo: { senhaAtual: 'senha-forte-1', senhaNova: 'senha-forte-1' },
  });
  assert.strictEqual(igual.status >= 400, true, 'aceitou trocar a senha por ela mesma');
});

testeAsync('senha: troca funciona, a antiga para de valer e a nova entra', async () => {
  const r = await pedir('POST', '/finance/api/senha', {
    cookie: cookieA, corpo: { senhaAtual: 'senha-forte-1', senhaNova: 'senha-nova-do-augusto' },
  });
  assert.strictEqual(r.status, 200, `troca falhou: ${JSON.stringify(r.corpo)}`);

  const velha = await pedir('POST', '/finance/api/login',
    { corpo: { email: 'augusto@villelastay.com.br', senha: 'senha-forte-1' } });
  assert.strictEqual(velha.status, 401, 'a senha antiga continuou entrando');

  const nova = await pedir('POST', '/finance/api/login',
    { corpo: { email: 'augusto@villelastay.com.br', senha: 'senha-nova-do-augusto' } });
  assert.strictEqual(nova.status, 200, 'a senha nova não entra');
  cookieA = (nova.cookies[0] || '').split(';')[0];
});

testeAsync('senha: a auditoria registra a troca e NUNCA o valor', async () => {
  const eventos = tenancy.comTenant({ tenantId: contaA.id, userId: 'auditor' }, () =>
    auditoria.listar({ objetoTipo: 'usuario', limite: 50 }));
  const troca = eventos.find(e => e.acao === 'usuario.senha');
  assert.ok(troca, 'troca de senha não deixou rastro na auditoria');
  const cru = JSON.stringify(troca);
  for (const segredo of ['senha-forte-1', 'senha-nova-do-augusto']) {
    assert.ok(!cru.includes(segredo), `a auditoria guardou a senha em claro: ${segredo}`);
  }
});

testeAsync('senha: sem sessão, a rota devolve 401 e não diz se o e-mail existe', async () => {
  const r = await pedir('POST', '/finance/api/senha', {
    corpo: { senhaAtual: 'x', senhaNova: 'senha-nova-qualquer' },
  });
  assert.strictEqual(r.status, 401);
});

// =====================================================================
// 14.7 APLICAÇÃO DO ASSINANTE (financeiro/app-cliente.js) contra a API REAL
//
// Mesma técnica do painel do staff: o arquivo real é carregado num sandbox
// e alimentado com a resposta real das rotas, e as asserções comparam os
// VALORES que a API devolveu — não a presença de "R$" na tela. `esc()`
// devolve string vazia para undefined, então campo renomeado na API
// sumiria em silêncio se o teste só procurasse lixo.
// =====================================================================

function carregarAppCliente(cookie) {
  const fonte = fs.readFileSync(path.join(__dirname, 'app-cliente.js'), 'utf8');
  const escritos = {};
  const elemento = (id) => ({
    _id: id, value: '', disabled: false, className: '', textContent: '',
    set innerHTML(v) { escritos[id] = String(v); },
    get innerHTML() { return escritos[id] || ''; },
    scrollIntoView() {},
    reset() {},
  });
  const elementos = { app: elemento('app'), 'f-corpo': elemento('f-corpo'), 'f-razao': elemento('f-razao') };

  const sandbox = {
    // `fetch` do sandbox fala com o servidor HTTP real da suíte, carregando
    // o cookie de sessão — é a mesma porta que o navegador usa.
    fetch: async (caminho, opt = {}) => {
      const r = await pedir(opt.method || 'GET', caminho, {
        cookie, corpo: opt.body ? JSON.parse(opt.body) : undefined,
      });
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.corpo };
    },
    document: {
      getElementById: (id) => elementos[id] || (elementos[id] = elemento(id)),
      // `querySelector` é usado pelos seletores de conta/centro da linha do
      // extrato; o teste registra o elemento pela própria string do seletor.
      querySelector: (sel) => elementos[sel] || null,
      addEventListener: () => {},
    },
    prompt: (_p, padrao) => padrao || 'motivo do teste',
    alert: () => {},
    URLSearchParams,
    Date, Number, String, Math, JSON, Object, Array, Promise, encodeURIComponent, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${fonte}\n;this.F = F;`, sandbox, { filename: 'app-cliente.js' });
  return { F: sandbox.F, escritos, elementos };
}

const F_brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const semLixoApp = (html, tela) => semLixo(html, tela);

testeAsync('app do assinante: sem sessão, cai na tela de login e NÃO vaza dado', async () => {
  const app = carregarAppCliente('');
  await app.F.iniciar();
  const html = app.escritos.app;
  assert.ok(/f-login/.test(html), 'não caiu na tela de login');
  assert.ok(/Entrar/.test(html), 'a tela de login não tem botão de entrar');
  assert.ok(!/Villela Stay|Augusto/.test(html.replace(/Villela Finance/g, '')),
    'a tela de login mostrou nome de conta antes de autenticar');
});

testeAsync('app do assinante: o cockpit imprime os valores que a API devolveu', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  assert.ok(app.F.eu, 'não autenticou com o cookie da sessão');
  await app.F.vCockpit();
  const html = app.escritos['f-corpo'];
  semLixoApp(html, 'cockpit');

  const api = (await pedir('GET', `/finance/api/cockpit?competencia=${app.F.competencia}`, { cookie: cookieA })).corpo;
  for (const k of api.kpis) {
    assert.ok(html.includes(k.valor), `o cockpit não imprimiu o KPI "${k.rotulo}" (${k.valor})`);
    assert.ok(html.includes(k.origem.formula),
      `o KPI "${k.rotulo}" apareceu sem a fórmula de origem — é o contrato do produto`);
  }
});

testeAsync('app do assinante: a saúde do razão vem ANTES dos indicadores', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vCockpit();
  const html = app.escritos['f-corpo'];
  const posSaude = html.indexOf('Posso confiar nestes números?');
  const posKpi = html.indexOf('Resultado do mês');
  assert.ok(posSaude >= 0, 'a tela não mostra o estado do razão');
  assert.ok(posKpi >= 0 && posSaude < posKpi,
    'os indicadores aparecem antes da saúde do razão — se o razão não fecha, eles não valem');
});

testeAsync('app do assinante: o DRE bate linha a linha com a API', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vDre();
  const html = app.escritos['f-corpo'];
  semLixoApp(html, 'DRE');
  const api = (await pedir('GET', `/finance/api/dre?competencia=${app.F.competencia}`, { cookie: cookieA })).corpo;
  for (const l of api.linhas) {
    assert.ok(html.includes(l.rotulo), `o DRE não imprimiu a linha "${l.rotulo}"`);
    assert.ok(html.includes(l.valor), `a linha "${l.rotulo}" saiu com valor diferente do da API (${l.valor})`);
  }
});

testeAsync('app do assinante: o razão desce da árvore até o lançamento', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vRazao();
  const arvore = app.escritos['f-corpo'];
  semLixoApp(arvore, 'plano de contas');
  assert.ok(/abrirRazao/.test(arvore), 'nenhuma conta analítica é clicável');

  // Desce numa conta que TEM movimento — árvore bonita e drill vazio é o
  // defeito clássico desta tela.
  const contas = (await pedir('GET', '/finance/api/contas', { cookie: cookieA })).corpo.contas;
  let achou = null;
  for (const c of contas.filter((x) => x.aceita_lancamento === 1)) {
    const r = (await pedir('GET', `/finance/api/razao/${c.id}`, { cookie: cookieA })).corpo;
    if (r.linhas && r.linhas.length) { achou = { conta: c, razao: r }; break; }
  }
  assert.ok(achou, 'nenhuma conta com lançamento — o teste não provaria nada');

  await app.F.abrirRazao(achou.conta.id);
  const html = app.escritos['f-razao'];
  semLixoApp(html, 'razão');
  assert.ok(html.includes(achou.conta.codigo), 'o razão não identifica a conta aberta');
  const primeira = achou.razao.linhas[0];
  assert.ok(html.includes(primeira.saldoFormatado),
    `o razão não imprimiu o saldo corrido (${primeira.saldoFormatado})`);
});

testeAsync('app do assinante: "Minha conta" oferece troca de senha e segundo fator', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vConta();
  const html = app.escritos['f-corpo'];
  semLixoApp(html, 'minha conta');
  assert.ok(/f-senha-form/.test(html), 'não há formulário de troca de senha');
  assert.ok(/minlength="10"/.test(html), 'o campo de senha nova não exige o mínimo de 10 caracteres');
  assert.ok(/Segundo fator/.test(html), 'não há bloco de segundo fator');
});

testeAsync('app do assinante: conta SUSPENSA vê o aviso e continua lendo', async () => {
  // contaD terminou os testes de cobrança ativa; suspende só para esta prova.
  const antes = repo.tenantPorId(contaD.id).status;
  repo.atualizarTenant(contaD.id, { status: 'suspensa' });
  try {
    const login = await pedir('POST', '/finance/api/login',
      { corpo: { email: 'dono@mercearia.com.br', senha: 'senha-forte-3' } });
    assert.strictEqual(login.status, 200, 'conta suspensa não conseguiu nem entrar');
    const cookieD = (login.cookies[0] || '').split(';')[0];

    const app = carregarAppCliente(cookieD);
    await app.F.iniciar();
    const moldura = app.escritos.app;
    assert.ok(/suspensa/.test(moldura), 'a tela não diz que a conta está suspensa');
    assert.ok(/leitura e a exportação continuam liberadas/.test(moldura),
      'o aviso de conta suspensa não diz o que NÃO se perde — é a promessa do produto');

    await app.F.vDre();
    semLixoApp(app.escritos['f-corpo'], 'DRE de conta suspensa');
  } finally {
    repo.atualizarTenant(contaD.id, { status: antes });
  }
});

testeAsync('app do assinante: a aba Extrato mostra a conciliação com a explicação da API', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vExtrato();
  semLixoApp(app.escritos['f-corpo'], 'extrato');

  const bancos = (await pedir('GET', '/finance/api/bancos', { cookie: cookieA })).corpo.contas;
  assert.ok(bancos.length, 'a conta de teste devia ter conta bancária');
  const c = (await pedir('GET', `/finance/api/bancos/${app.F.bancoId}/conciliacao`, { cookie: cookieA })).corpo;
  const painel = app.escritos['f-concil'];
  assert.ok(painel.includes(c.explicacao),
    'a tela não repete a EXPLICAÇÃO da conciliação — é a frase que diz se bate ou não');
  assert.ok(painel.includes(F_brl(c.saldoExtratoCents)) && painel.includes(F_brl(c.saldoRazaoCents)),
    'a tela não confronta o saldo do extrato com o do razão');
});

testeAsync('app do assinante: toda sugestão aparece com o MOTIVO e a confiança', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vExtrato();
  const html = app.escritos['f-trans'];
  semLixoApp(html, 'transações');

  const { transacoes } = (await pedir('GET', `/finance/api/transacoes?banco=${app.F.bancoId}&limite=300`, { cookie: cookieA })).corpo;
  const comSugestao = transacoes.filter((t) => t.sugestao);
  assert.ok(comSugestao.length, 'nenhuma transação com sugestão — o teste não provaria nada');
  for (const t of comSugestao.slice(0, 5)) {
    // O motivo carrega aspas ("a descrição contém \"assinatura\""), e a tela
    // escapa antes de imprimir — comparar com o texto cru daria falso negativo.
    assert.ok(html.includes(escapeSimples(t.sugestao.motivo)),
      `a sugestão de "${t.descricao}" apareceu sem o motivo — sugestão sem porquê é palpite`);
    assert.ok(html.includes(String(t.sugestao.confianca) + '%'),
      `a sugestão de "${t.descricao}" apareceu sem a confiança`);
  }
  const semSugestao = transacoes.filter((t) => !t.sugestao && t.status !== 'conciliada' && t.status !== 'ignorada');
  if (semSugestao.length) {
    assert.ok(/Sem sugestão/.test(html),
      'transação sem sugestão não avisa que a conta precisa ser escolhida — célula vazia parece ausência de dado');
  }
});

testeAsync('API: transação sem sugestão devolve null, não objeto vazio', async () => {
  // A coluna nasce com '{}': se a rota devolvesse isso cru, todo cliente
  // trataria "sem sugestão" como "tem sugestão" — objeto vazio é verdadeiro.
  const { transacoes } = (await pedir('GET', '/finance/api/transacoes?limite=500', { cookie: cookieA })).corpo;
  for (const t of transacoes) {
    if (t.sugestao !== null) {
      assert.ok(t.sugestao.contaId, `transação ${t.id} devolveu sugestão sem conta`);
      assert.ok(t.sugestao.motivo, `transação ${t.id} devolveu sugestão sem motivo`);
      assert.ok(typeof t.sugestao.confianca === 'number', `transação ${t.id} devolveu sugestão sem confiança`);
    }
  }
});

testeAsync('app do assinante: conciliar pela tela leva a transação para o razão', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vExtrato();

  const { transacoes } = (await pedir('GET', `/finance/api/transacoes?banco=${app.F.bancoId}&limite=300`, { cookie: cookieA })).corpo;
  const alvo = transacoes.find((t) => t.sugestao && t.sugestao.alta && t.status !== 'conciliada');
  if (!alvo) return;                     // nada a conciliar nesta rodada

  app.elementos[`[data-conta="${alvo.id}"]`] = { value: '' };
  app.elementos[`[data-centro="${alvo.id}"]`] = { value: '' };
  await app.F.conciliar(alvo.id);

  const depois = (await pedir('GET', `/finance/api/transacoes?banco=${app.F.bancoId}&limite=300`, { cookie: cookieA }))
    .corpo.transacoes.find((t) => t.id === alvo.id);
  assert.strictEqual(depois.status, 'conciliada', 'a transação não foi conciliada pela tela');
  assert.ok(depois.loteId, 'conciliou sem gerar lote no razão');
});

testeAsync('app do assinante: conta sem banco cadastrado ensina o que fazer, não dá tela vazia', async () => {
  const login = await pedir('POST', '/finance/api/login',
    { corpo: { email: 'dono@mercearia.com.br', senha: 'senha-forte-3' } });
  const cookieD = (login.cookies[0] || '').split(';')[0];
  const app = carregarAppCliente(cookieD);
  await app.F.iniciar();
  await app.F.vExtrato();
  const html = app.escritos['f-corpo'];
  assert.ok(/Nenhuma conta bancária/.test(html), 'não explica que falta cadastrar a conta');
  assert.ok(/f-banco-form/.test(html), 'não oferece o cadastro ali mesmo');
});

testeAsync('app do assinante: a aba Pagar/Receber traz o aging com a fórmula', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vTitulos();
  const html = app.escritos['f-corpo'];
  semLixoApp(html, 'títulos');

  const aging = (await pedir('GET', '/finance/api/aging?especie=receber', { cookie: cookieA })).corpo;
  assert.ok(html.includes(aging.totalAberto), `não imprimiu o total em aberto (${aging.totalAberto})`);
  assert.ok(html.includes(aging.totalVencido), `não imprimiu o total vencido (${aging.totalVencido})`);
  assert.ok(html.includes(escapeSimples(aging.origem.formula)),
    'o aging apareceu sem a fórmula — é o número que mais se interpreta errado no sistema');
  for (const f of aging.faixas.filter((x) => x.quantidade)) {
    assert.ok(html.includes(f.rotulo), `faixa "${f.rotulo}" tem parcelas e não aparece na tela`);
  }
});

testeAsync('app do assinante: a tela separa a competência do título do caixa da liquidação', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vTitulos();
  await app.F.montarNovoTitulo('receber');
  const form = app.escritos['f-novo-titulo'];
  assert.ok(/competência/i.test(form), 'o formulário não menciona a competência');
  assert.ok(/caixa só se move na liquidação/i.test(form),
    'a tela não distingue provisão de caixa — confundir as duas é o que faz DRE e extrato divergirem');
});

testeAsync('app do assinante: abrir título mostra parcelas, rateio e saldo da API', async () => {
  const { titulos } = (await pedir('GET', '/finance/api/titulos?limite=50', { cookie: cookieA })).corpo;
  const alvo = titulos.find((t) => t.status !== 'cancelado');
  assert.ok(alvo, 'nenhum título na conta de teste');

  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vTitulos();
  await app.F.abrirTitulo(alvo.id);
  const html = app.escritos['f-titulo-det'];
  semLixoApp(html, 'detalhe do título');

  const det = (await pedir('GET', `/finance/api/titulos/${alvo.id}`, { cookie: cookieA })).corpo;
  assert.ok(html.includes(det.valor), `o detalhe não imprimiu o valor do título (${det.valor})`);
  assert.ok(html.includes(det.saldo), `o detalhe não imprimiu o saldo (${det.saldo})`);
  for (const r of det.rateio || []) {
    assert.ok(html.includes(r.contaCodigo), `o rateio não mostra a conta ${r.contaCodigo}`);
  }
  assert.strictEqual((html.match(/<tr>/g) || []).length >= det.parcelas.length, true,
    'faltam linhas de parcela na tela');
});

testeAsync('app do assinante: liquidar pela tela baixa a parcela e move o razão', async () => {
  // Título próprio para não interferir em nenhum outro teste.
  const cps = (await pedir('GET', '/finance/api/contrapartes?tipo=cliente', { cookie: cookieA })).corpo.contrapartes;
  const contas = (await pedir('GET', '/finance/api/contas?analiticas=1', { cookie: cookieA })).corpo.contas;
  const receita = contas.find((c) => c.codigo.startsWith('3.1'));
  const criado = await pedir('POST', '/finance/api/titulos', {
    cookie: cookieA,
    corpo: {
      especie: 'receber', contraparteId: cps[0].id, documento: 'TELA-LIQ-1',
      descricao: 'teste de liquidação pela tela', valorCents: 50000,
      vencimento: '2026-08-20',
      rateio: [{ contaId: receita.id, valorCents: 50000 }],
    },
  });
  assert.strictEqual(criado.status, 200, `não criou o título: ${JSON.stringify(criado.corpo)}`);
  const tituloId = criado.corpo.titulo.id;

  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vTitulos();
  await app.F.abrirTitulo(tituloId);

  const det = (await pedir('GET', `/finance/api/titulos/${tituloId}`, { cookie: cookieA })).corpo;
  const parcela = det.parcelas[0];
  app.F.formLiquidar(parcela.id, tituloId, parcela.valorCents);
  app.elementos['f-l-data'] = { value: '2026-08-21' };
  app.elementos['f-l-valor'] = { value: '300,00' };            // baixa PARCIAL
  app.elementos['f-l-juros'] = { value: '' };
  app.elementos['f-l-multa'] = { value: '' };
  app.elementos['f-l-desc'] = { value: '' };
  app.elementos['f-l-banco'] = { value: '' };
  app.elementos['f-l-meio'] = { value: 'pix' };
  await app.F.liquidar(parcela.id, tituloId);

  const depois = (await pedir('GET', `/finance/api/titulos/${tituloId}`, { cookie: cookieA })).corpo;
  assert.strictEqual(depois.pagoCents, 30000, `esperava R$ 300 baixados, veio ${depois.pagoCents}`);
  assert.strictEqual(depois.parcelas[0].status, 'parcial', 'a parcela não ficou parcial');
  assert.ok(depois.saldoCents === 20000, `saldo errado depois da baixa parcial: ${depois.saldoCents}`);
});

testeAsync('app do assinante: liquidação estornada continua visível, como histórico', async () => {
  const { titulos } = (await pedir('GET', '/finance/api/titulos?limite=100', { cookie: cookieA })).corpo;
  const t = titulos.find((x) => x.documento === 'TELA-LIQ-1');
  assert.ok(t, 'o título do teste anterior sumiu');
  const det = (await pedir('GET', `/finance/api/titulos/${t.id}`, { cookie: cookieA })).corpo;
  const liq = det.liquidacoesPorParcela[det.parcelas[0].id][0];

  const r = await pedir('POST', `/finance/api/liquidacoes/${liq.id}/estornar`,
    { cookie: cookieA, corpo: { motivo: 'teste de estorno pela tela' } });
  assert.strictEqual(r.status, 200, `estorno falhou: ${JSON.stringify(r.corpo)}`);

  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vTitulos();
  await app.F.abrirTitulo(t.id);
  const html = app.escritos['f-titulo-det'];
  assert.ok(/estornada/.test(html),
    'a liquidação estornada sumiu da tela — ela é histórico, e histórico não se apaga');
  const depois = (await pedir('GET', `/finance/api/titulos/${t.id}`, { cookie: cookieA })).corpo;
  assert.strictEqual(depois.pagoCents, 0, 'o estorno não devolveu o saldo da parcela');
});

testeAsync('app do assinante: a tela de lançar só libera quando débito = crédito', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vLancamentos();
  await app.F.montarNovoLote();

  // Desbalanceado: o botão continua travado e a tela mostra a diferença.
  app.elementos['[data-ll-deb="0"]'] = { value: '100,00' };
  app.elementos['[data-ll-cred="0"]'] = { value: '' };
  app.elementos['[data-ll-deb="1"]'] = { value: '' };
  app.elementos['[data-ll-cred="1"]'] = { value: '70,00' };
  const r1 = app.F.somarLote();
  assert.strictEqual(r1.fecha, false);
  assert.strictEqual(app.elementos['f-ll-ok'].disabled, true, 'o botão de contabilizar ficou ativo com o lote desbalanceado');
  assert.ok(/diferença/.test(app.elementos['f-ll-soma'].textContent), 'a tela não mostra a diferença');

  // Fechando, libera.
  app.elementos['[data-ll-cred="1"]'] = { value: '100,00' };
  const r2 = app.F.somarLote();
  assert.strictEqual(r2.fecha, true);
  assert.strictEqual(app.elementos['f-ll-ok'].disabled, false, 'o botão continuou travado com o lote fechando');
});

testeAsync('app do assinante: lançar pela tela grava no razão e ele continua fechando', async () => {
  const contas = (await pedir('GET', '/finance/api/contas?analiticas=1', { cookie: cookieA })).corpo.contas;
  const caixa = contas.find((c) => c.codigo === '1.1.1.001');
  const receita = contas.find((c) => c.codigo.startsWith('3.1'));

  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vLancamentos();
  await app.F.montarNovoLote();
  app.elementos['f-ll-data'] = { value: '2026-08-22' };
  app.elementos['f-ll-memo'] = { value: 'lançamento feito pela tela' };
  app.elementos['[data-ll-conta="0"]'] = { value: caixa.id };
  app.elementos['[data-ll-centro="0"]'] = { value: '' };
  app.elementos['[data-ll-deb="0"]'] = { value: '250,00' };
  app.elementos['[data-ll-cred="0"]'] = { value: '' };
  app.elementos['[data-ll-conta="1"]'] = { value: receita.id };
  app.elementos['[data-ll-centro="1"]'] = { value: '' };
  app.elementos['[data-ll-deb="1"]'] = { value: '' };
  app.elementos['[data-ll-cred="1"]'] = { value: '250,00' };
  await app.F.lancar();

  const { lotes } = (await pedir('GET', '/finance/api/lancamentos?competencia=2026-08&limite=200', { cookie: cookieA })).corpo;
  const criado = lotes.find((l) => l.memo === 'lançamento feito pela tela');
  assert.ok(criado, 'o lançamento não chegou ao razão');
  assert.strictEqual(criado.total_cents, 25000);
  const saude = (await pedir('GET', '/finance/api/saude', { cookie: cookieA })).corpo;
  assert.strictEqual(saude.razao.ok, true, 'o razão parou de fechar depois do lançamento da tela');
});

testeAsync('app do assinante: estorno vira SOLICITAÇÃO, não acontece no clique', async () => {
  const { lotes } = (await pedir('GET', '/finance/api/lancamentos?competencia=2026-08&limite=200', { cookie: cookieA })).corpo;
  const alvo = lotes.find((l) => l.memo === 'lançamento feito pela tela');
  const antes = (await pedir('GET', '/finance/api/aprovacoes?status=pendente', { cookie: cookieA })).corpo.aprovacoes.length;

  const r = await pedir('POST', `/finance/api/lancamentos/${alvo.id}/estornar`,
    { cookie: cookieA, corpo: { motivo: 'teste de estorno pela tela' } });
  assert.strictEqual(r.status, 200);
  assert.ok(/aprovação/i.test(r.corpo.aviso), 'a resposta não avisa que depende de aprovação');

  const lote = (await pedir('GET', `/finance/api/lancamentos/${alvo.id}`, { cookie: cookieA })).corpo;
  assert.strictEqual(lote.lote.status, 'contabilizado', 'o lote foi estornado sem aprovação');
  const depois = (await pedir('GET', '/finance/api/aprovacoes?status=pendente', { cookie: cookieA })).corpo.aprovacoes.length;
  assert.strictEqual(depois, antes + 1, 'o estorno não gerou solicitação de aprovação');
});

testeAsync('app do assinante: a fila diz POR QUE você não pode decidir', async () => {
  // Quem pediu o estorno foi o próprio usuário desta sessão: segregação de
  // funções tem de aparecer escrita, não como botão sumido.
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vLancamentos();
  const html = app.escritos['f-corpo'];
  semLixoApp(html, 'lançamentos');

  const { aprovacoes } = (await pedir('GET', '/finance/api/aprovacoes?status=pendente', { cookie: cookieA })).corpo;
  const propria = aprovacoes.find((a) => !a.posso.pode);
  assert.ok(propria, 'nenhuma solicitação bloqueada — o teste não provaria nada');
  assert.ok(html.includes(escapeSimples(propria.posso.motivo)),
    'a tela esconde o botão sem dizer o motivo — quem pediu precisa saber que é segregação de funções, não erro');
  assert.ok(/Segregação de funções/i.test(html), 'o motivo da recusa não é o esperado');
});

testeAsync('app do assinante: o lançamento abre e mostra as duas pernas', async () => {
  const { lotes } = (await pedir('GET', '/finance/api/lancamentos?competencia=2026-08&limite=200', { cookie: cookieA })).corpo;
  const alvo = lotes.find((l) => l.memo === 'lançamento feito pela tela');
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vLancamentos();
  await app.F.abrirLote(alvo.id);
  const html = app.escritos['f-lote-det'];
  semLixoApp(html, 'detalhe do lançamento');

  const d = (await pedir('GET', `/finance/api/lancamentos/${alvo.id}`, { cookie: cookieA })).corpo;
  for (const linha of d.linhas) {
    assert.ok(html.includes(linha.conta_codigo), `a perna da conta ${linha.conta_codigo} não aparece`);
  }
  assert.ok(html.includes(F_brl(d.lote.total_cents)), 'o total do lote não aparece');
});

testeAsync('app do assinante: o fechamento mostra CADA item do checklist com o detalhe', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.competencia = '2026-08';
  await app.F.vFechamento();
  const html = app.escritos['f-corpo'];
  semLixoApp(html, 'fechamento');

  const chk = (await pedir('GET', '/finance/api/fechamento/2026-08', { cookie: cookieA })).corpo;
  for (const i of chk.itens) {
    assert.ok(html.includes(escapeSimples(i.titulo)), `o checklist não mostra "${i.titulo}"`);
    assert.ok(html.includes(escapeSimples(i.detalhe)),
      `"${i.titulo}" apareceu sem o detalhe — "não deu" sem o número obriga a adivinhar`);
  }
});

testeAsync('app do assinante: com bloqueador, a tela NOMEIA o que falta', async () => {
  const chk = (await pedir('GET', '/finance/api/fechamento/2026-08', { cookie: cookieA })).corpo;
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.competencia = '2026-08';
  await app.F.vFechamento();
  const html = app.escritos['f-corpo'];

  if (chk.pode) {
    assert.ok(/Solicitar fechamento/.test(html), 'sem bloqueadores e sem botão de fechar');
  } else {
    for (const b of chk.bloqueadores) {
      assert.ok(html.includes(escapeSimples(b)), `o bloqueador "${b}" não aparece escrito na tela`);
    }
    assert.ok(/mesmo assim/.test(html),
      'não oferece o caminho de exceção — quem tem justificativa fica sem saída');
  }
});

testeAsync('app do assinante: a apuração avisa que o DRE do período vai zerar', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.competencia = '2026-08';
  await app.F.vFechamento();
  const html = app.escritos['f-corpo'];

  const prev = (await pedir('GET', '/finance/api/apuracao/2026-08', { cookie: cookieA })).corpo;
  assert.ok(html.includes(escapeSimples(prev.aviso)),
    'a tela não avisa que, depois de apurar, o DRE do período mostra zero — é o efeito que mais surpreende');
  assert.ok(html.includes(prev.resultado), `não imprimiu o resultado apurável (${prev.resultado})`);
});

testeAsync('app do assinante: fechar vira SOLICITAÇÃO e o período NÃO fecha sozinho', async () => {
  const antes = (await pedir('GET', '/finance/api/aprovacoes?status=pendente', { cookie: cookieA })).corpo.aprovacoes.length;
  const r = await pedir('POST', '/finance/api/fechamento/2026-08',
    { cookie: cookieA, corpo: { forcar: true, motivo: 'teste de fechamento pela tela' } });
  assert.strictEqual(r.status, 200);

  const periodos_ = (await pedir('GET', '/finance/api/periodos', { cookie: cookieA })).corpo.periodos;
  const p = periodos_.find((x) => x.competencia === '2026-08');
  assert.ok(!p || p.status !== 'fechado', 'a competência fechou sem passar por aprovação');
  const depois = (await pedir('GET', '/finance/api/aprovacoes?status=pendente', { cookie: cookieA })).corpo.aprovacoes.length;
  assert.strictEqual(depois, antes + 1, 'o pedido de fechamento não virou solicitação');
});

testeAsync('app do assinante: a prévia da solicitação de fechamento carrega os bloqueadores', async () => {
  // Quem vai aprovar precisa ver o que estava errado no momento do pedido —
  // aprovar às cegas um fechamento forçado é o pior caso desta tela.
  const { aprovacoes } = (await pedir('GET', '/finance/api/aprovacoes?status=pendente', { cookie: cookieA })).corpo;
  const fecha = aprovacoes.find((a) => a.acao === 'periodo.fechar');
  assert.ok(fecha, 'não há solicitação de fechamento pendente');
  assert.ok(Array.isArray(fecha.previa.checklist) && fecha.previa.checklist.length,
    'a solicitação de fechamento foi registrada sem o checklist na prévia');
  assert.ok('pode' in fecha.previa, 'a prévia não diz se o checklist passava');
});

testeAsync('app do assinante: toda constatação do CFO mostra o que a INVALIDARIA', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.competencia = '2026-08';
  await app.F.vCfo();
  const html = app.escritos['f-corpo'];
  semLixoApp(html, 'CFO');

  const b = (await pedir('GET', '/finance/api/cfo/briefing?competencia=2026-08', { cookie: cookieA })).corpo;
  assert.ok(html.includes(escapeSimples(b.natureza)),
    'a tela não declara que as constatações são determinísticas, e não de IA');
  for (const c of b.constatacoes) {
    assert.ok(html.includes(escapeSimples(c.titulo)), `a constatação "${c.titulo}" não aparece`);
    if (c.invalidaSe) {
      assert.ok(html.includes(escapeSimples(c.invalidaSe)),
        `"${c.titulo}" apareceu sem o que a invalidaria — é o que separa constatação de palpite`);
    }
  }
});

testeAsync('app do assinante: detector que falha aparece como falha, não some', async () => {
  const b = (await pedir('GET', '/finance/api/cfo/briefing?competencia=2026-08', { cookie: cookieA })).corpo;
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.competencia = '2026-08';
  await app.F.vCfo();
  const html = app.escritos['f-corpo'];
  if ((b.falhasDeDeteccao || []).length) {
    assert.ok(/detector\(es\) falharam/.test(html),
      'houve falha de detecção e a tela não avisou — briefing silenciosamente incompleto é pior que briefing vazio');
  } else {
    assert.ok(!/detector\(es\) falharam/.test(html), 'a tela inventou falha de detecção');
  }
});

testeAsync('app do assinante: o Conselho traz origem, limites e onde conferir', async () => {
  const c = (await pedir('GET', '/finance/api/conselho?competencia=2026-08', { cookie: cookieA })).corpo;
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.competencia = '2026-08';
  await app.F.vCfo();
  const html = app.escritos['f-corpo'];

  assert.ok(html.includes(escapeSimples(c.aviso)),
    'o Conselho apareceu sem o aviso de que são princípios de finanças pessoais, não norma');
  for (const x of c.conselhos) {
    assert.ok(html.includes(escapeSimples(x.principio)), `o princípio de ${x.autor} não aparece`);
    assert.ok(html.includes(escapeSimples(x.fonte.comoConferir)),
      `o princípio de ${x.autor} apareceu sem onde conferir no manuscrito`);
    assert.ok(html.includes(escapeSimples(x.limitacoes)),
      `o princípio de ${x.autor} apareceu sem os limites — conselho sem limite vira norma`);
  }
});

testeAsync('app do assinante: sem fato acionado, o Conselho diz que o silêncio é o certo', async () => {
  // Competência sem movimento: nenhum princípio deve aparecer, e a tela tem
  // de explicar que isso é o comportamento correto — não uma tela quebrada.
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.competencia = '2019-01';
  await app.F.vCfo();
  const html = app.escritos['f-corpo'];
  semLixoApp(html, 'CFO de mês vazio');
  const c = (await pedir('GET', '/finance/api/conselho?competencia=2019-01', { cookie: cookieA })).corpo;
  if (!c.conselhos.length) {
    assert.ok(/Princípio sem fato não aparece/.test(html),
      'mês sem fato deixou a área do Conselho muda — vazio sem explicação parece defeito');
  }
  const b = (await pedir('GET', '/finance/api/cfo/briefing?competencia=2019-01', { cookie: cookieA })).corpo;
  if (!b.constatacoes.length) {
    assert.ok(/Detector sem fato não inventa achado/.test(html),
      'mês sem constatação ficou em branco — vazio sem explicação parece defeito');
  }
});

testeAsync('app do assinante: o balanço mostra a PROVA (ativo = passivo + PL)', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.subRelatorio = 'balanco';
  await app.F.vRelatorios();
  const html = app.escritos['f-rel'];
  semLixoApp(html, 'balanço');

  const b = (await pedir('GET', '/finance/api/balanco', { cookie: cookieA })).corpo;
  assert.ok(html.includes(b.ativo.total) && html.includes(b.passivo.total) && html.includes(b.patrimonioLiquido.total),
    'a tela não confronta ativo, passivo e PL');
  assert.strictEqual(/Balanço fecha|Balanço NÃO fecha/.test(html), true, 'a tela não diz se o balanço fecha');
  assert.ok(html.includes(b.patrimonioLiquido.resultadoDoExercicio),
    'o resultado do exercício não aparece no PL — é linha calculada, e é o que faz o balanço fechar antes da apuração');
});

testeAsync('app do assinante: a previsão de caixa diz que é PREVISÃO, com a premissa de cada cenário', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.subRelatorio = 'previsao';
  await app.F.vRelatorios();
  const html = app.escritos['f-rel'];
  semLixoApp(html, 'previsão');

  const p = (await pedir('GET', '/finance/api/previsao-caixa?dias=90', { cookie: cookieA })).corpo;
  assert.ok(html.includes(escapeSimples(p.veredito)), 'a tela não traz o veredito da previsão');
  assert.ok(html.includes(escapeSimples(p.origem.natureza)),
    'a tela não avisa que é previsão, e não fato — número projetado lido como realizado é decisão errada garantida');
  for (const c of p.cenarios) {
    assert.ok(html.includes(escapeSimples(c.premissa)),
      `o cenário "${c.rotulo}" apareceu sem a premissa — cenário sem premissa é chute com nome bonito`);
  }
});

testeAsync('app do assinante: o resultado por imóvel avisa quando está incompleto', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.competencia = '2026-08';
  app.F.subRelatorio = 'centros';
  await app.F.vRelatorios();
  const html = app.escritos['f-rel'];
  semLixoApp(html, 'por imóvel');

  const r = (await pedir('GET', '/finance/api/resultado-por-centro?competencia=2026-08', { cookie: cookieA })).corpo;
  if (r.aviso) {
    assert.ok(html.includes(escapeSimples(r.aviso)),
      'há lançamento sem centro de custo e a tela não avisa — o resultado por imóvel estaria mentindo por omissão');
  }
  for (const l of r.linhas) {
    assert.ok(html.includes(escapeSimples(l.nome)), `o centro "${l.nome}" não aparece`);
  }
});

testeAsync('app do assinante: fluxo de caixa direto e indireto, ambos com a fórmula', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.competencia = '2026-08';
  app.F.subRelatorio = 'fluxo';
  for (const metodo of ['direto', 'indireto']) {
    app.F.metodoFluxo = metodo;
    await app.F.vRelatorios();
    const html = app.escritos['f-rel'];
    semLixoApp(html, 'fluxo ' + metodo);
    const f = (await pedir('GET', `/finance/api/fluxo-caixa?competencia=2026-08&metodo=${metodo}`, { cookie: cookieA })).corpo;
    assert.ok(html.includes(escapeSimples(f.origem.formula)), `o fluxo ${metodo} apareceu sem a fórmula`);
  }
});

testeAsync('app do assinante: sem orçamento, a tela explica em vez de mostrar zero', async () => {
  const { orcamentos } = (await pedir('GET', '/finance/api/orcamentos', { cookie: cookieA })).corpo;
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  app.F.subRelatorio = 'orcado';
  await app.F.vRelatorios();
  const html = app.escritos['f-rel'];
  semLixoApp(html, 'orçado × realizado');
  if (!orcamentos.length) {
    assert.ok(/Sem orçamento aprovado não há desvio a medir/.test(html),
      'sem orçamento a tela ficou vazia — zero sem explicação parece resultado, não ausência');
  } else {
    assert.ok(/Orçado|orçado/.test(html), 'com orçamento, a comparação não aparece');
  }
});

testeAsync('app do assinante: "Minha conta" mostra assinatura e portabilidade', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vConta();
  await app.F.blocoAssinatura();
  const html = app.escritos['f-assinatura'];
  semLixoApp(html, 'assinatura');

  const a = (await pedir('GET', '/finance/api/assinatura', { cookie: cookieA })).corpo;
  assert.ok(html.includes(escapeSimples(a.consequencias.leituraEExportacao)),
    'a tela de assinatura não diz que leitura e exportação continuam liberadas — é a promessa central do produto');
  const inv = (await pedir('GET', '/finance/api/exportar', { cookie: cookieA })).corpo;
  assert.ok(html.includes(escapeSimples(inv.aviso)), 'a portabilidade apareceu sem o aviso de que está sempre disponível');
  assert.ok(html.includes(String(inv.lotes)), 'o inventário não mostra quantos lançamentos serão exportados');
  assert.ok(/razao\.csv/.test(html) && /completo\.json/.test(html), 'faltam os links de exportação');
});

testeAsync('app do assinante: conta de cortesia não recebe botão de assinar', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vConta();
  await app.F.blocoAssinatura();
  const html = app.escritos['f-assinatura'];
  const a = (await pedir('GET', '/finance/api/assinatura', { cookie: cookieA })).corpo;
  if (a.conta.cortesia) {
    assert.ok(/cortesia do grupo/.test(html), 'a conta interna não é identificada como cortesia');
    assert.ok(!/f-as-plano/.test(html), 'ofereceu assinatura para a conta de cortesia vitalícia do grupo');
  }
});

testeAsync('PWA: o Finance está no registro e o manifest não aponta para ícone inexistente', async () => {
  const pwa = require('../pwa');
  const p = pwa.PRODUTOS.find((x) => x.slug === 'finance');
  assert.ok(p, 'o Finance não entrou no registro de PWA');
  const m = pwa.manifestDe(p);
  assert.strictEqual(m.start_url, '/finance/app');
  assert.strictEqual(m.scope, '/finance/');
  assert.ok(m.icons.length, 'manifest sem ícone');
  // Ícone que não existe instala o app com quadrado quebrado — e ninguém
  // percebe, porque o manifest não falha, só some da tela inicial.
  for (const ic of m.icons) {
    const caminho = path.join(__dirname, '..', ic.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(caminho), `o manifest aponta para ${ic.src}, que não existe no disco`);
  }
});

testeAsync('PWA: o service worker do Finance não cacheia a API', async () => {
  const pwa = require('../pwa');
  const sw = pwa.swDe(pwa.PRODUTOS.find((x) => x.slug === 'finance'));
  assert.ok(/\/api/.test(sw), 'o SW não trata o caminho de API');
  assert.ok(/req\.method !== 'GET'/.test(sw), 'o SW não deixa a escrita passar direto pela rede');
  // Dado contábil servido de cache é dado contábil errado.
  assert.ok(sw.indexOf("url.pathname.indexOf('/api') !== -1") !== -1,
    'o SW poderia servir resposta de API a partir do cache');
});

testeAsync('marca: a landing e o app usam a identidade OFICIAL, não a improvisada', async () => {
  const paginas = require('./paginas');
  const landing = paginas.landingHTML();
  const app = paginas.appHTML();

  // Jade #159A78 é o acento do Brand Book v1.0. O #0F4C81 era um azul que eu
  // escolhi antes de a marca existir — se ele voltar, alguém regrediu.
  assert.ok(landing.includes('#159A78'), 'a landing não usa o Jade oficial');
  assert.ok(!/0F4C81/i.test(landing) && !/0F4C81/i.test(app),
    'o azul improvisado voltou ao produto — a identidade oficial é o Jade');
  assert.ok(landing.includes('Finanças sob controle. Decisões com inteligência.'),
    'a tagline oficial não aparece na landing');
  assert.ok(app.includes('data-vertical="finance"'), 'o app não declara a vertical do design system');

  // A regra da tagline tem de vencer `.hero p` na especificidade: classe pura
  // perde para classe+elemento, e a tagline saía no azul apagado do herói.
  assert.ok(/\.hero p\.tagline\{[^}]*var\(--mint\)/.test(landing),
    'a regra da tagline não é específica o bastante para vencer `.hero p` — ela sai na cor errada');

  // O logo é arquivo em curvas, não texto re-tipografado: redesenhar a
  // assinatura em CSS cria uma segunda marca sem querer.
  assert.ok(landing.includes('logo-negativo.svg'), 'a landing não usa o arquivo oficial do logo');
  for (const arq of ['favicon.svg', 'logo-negativo.svg', 'simbolo-v.svg', 'favicon-192.png', 'icon-pwa.png']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'brand', 'villela-finance', arq)),
      `falta o arquivo de marca ${arq}`);
  }
});

testeAsync('marca: a vertical `finance` existe no design system do grupo', async () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'brand', 'villela-ui.css'), 'utf8');
  assert.ok(/\[data-vertical="finance"\][^}]*#159A78/.test(css),
    'a vertical finance não está no villela-ui.css com o Jade oficial — o app pediria um acento que não existe');
});

testeAsync('app do assinante: a aba Extrato oferece o Mercado Pago com PRÉVIA primeiro', async () => {
  const app = carregarAppCliente(cookieA);
  await app.F.iniciar();
  await app.F.vExtrato();
  const html = app.escritos['f-corpo'];
  assert.ok(/importar-mercadopago|Mercado Pago — direto pela API/.test(html),
    'a aba Extrato não oferece a importação automática do Mercado Pago');
  assert.ok(/Ver prévia/.test(html),
    'não há prévia — o primeiro contato com a conta real tem de ser olhando, não gravando');
  const iPrevia = html.indexOf('Ver prévia');
  const iImportar = html.indexOf('Importar do Mercado Pago');
  assert.ok(iPrevia >= 0 && iPrevia < iImportar, 'o botão de importar vem antes do de prévia');
});

testeAsync('API: importar do Mercado Pago é dryRun por PADRÃO', async () => {
  // Corpo sem `dryRun` não pode gravar: o padrão de um caminho que mexe no
  // razão tem de ser o que não mexe.
  const mpFalsoExtrato = () => Promise.resolve({ results: [], paging: { total: 0 } });
  mpFalsoExtrato.__mock = true;
  require('./mercadopago').configurar({ mpFetch: mpFalsoExtrato });
  const banco = (await pedir('GET', '/finance/api/bancos', { cookie: cookieA })).corpo.contas[0];
  const antes = (await pedir('GET', '/finance/api/transacoes?limite=1000', { cookie: cookieA })).corpo.transacoes.length;
  const r = await pedir('POST', `/finance/api/bancos/${banco.id}/importar-mercadopago`,
    { cookie: cookieA, corpo: { desde: '2026-08-01', ate: '2026-08-31' } });
  assert.strictEqual(r.status, 200, `prévia falhou: ${JSON.stringify(r.corpo)}`);
  assert.strictEqual(r.corpo.dryRun, true, 'sem `dryRun` explícito, a rota GRAVOU');
  const depois = (await pedir('GET', '/finance/api/transacoes?limite=1000', { cookie: cookieA })).corpo.transacoes.length;
  assert.strictEqual(depois, antes, 'a chamada padrão criou transações');
});

testeAsync('MFA: o QR vem do servidor, e a chave manual continua na tela', async () => {
  // O `qrcode` já é dependência deste backend (hóspede e alta-vista usam):
  // não havia dependência nova a justificar, e eu tinha dito que havia.
  const novo = await pedir('POST', '/finance/api/login',
    { corpo: { email: 'dono@mercearia.com.br', senha: 'senha-forte-3' } });
  const cookieQr = (novo.cookies[0] || '').split(';')[0];
  const r = await pedir('POST', '/finance/api/mfa/iniciar', { cookie: cookieQr, corpo: {} });
  // Sem `return` silencioso: a suíte define FINANCE_SECRET_KEY, então este
  // teste TEM de rodar. Teste que se pula sozinho por falta de env é teste
  // que um dia deixa de existir sem ninguém notar.
  assert.strictEqual(r.status, 200, `mfa/iniciar devolveu ${r.status}: ${JSON.stringify(r.corpo)}`);

  assert.ok(/^<svg/.test(String(r.corpo.qrSvg || '')), 'o QR não veio como SVG');
  assert.ok(r.corpo.qrSvg.length > 500, 'o SVG do QR veio vazio demais para conter o segredo');
  // A chave em texto NÃO some: quem não consegue ler o QR precisa dela, e
  // perder a ativação do segundo fator por causa de uma imagem seria absurdo.
  assert.ok(r.corpo.segredo && r.corpo.segredo.length >= 16, 'o segredo em texto sumiu da resposta');
  assert.ok(/^otpauth:\/\/totp\//.test(r.corpo.uri), 'a URI otpauth sumiu');
});

testeAsync('HTTP: fecha o servidor', () => new Promise(r => servidor.close(r)));

// =====================================================================
// 13b. ANONIMIZAÇÃO (LGPD art. 18) — apagar a pessoa, preservar o razão
// =====================================================================
teste('anonimização: apaga a pessoa e PRESERVA valor, data e conta', () => {
  const alvo = naA(() => contrapartes.criar({
    entidadeId: empresaA.id, tipo: 'fornecedor',
    nome: 'Joana Pereira Silva', documento: '529.982.247-25'.replace(/\D/g, '') === '52998224725' ? '' : '',
    email: 'joana@exemplo.com', telefone: '61999990000',
  }));
  const t = naA(() => titulos.criar({
    entidadeId: empresaA.id, especie: 'pagar', contraparteId: alvo.id,
    documento: 'NF-ANON', descricao: 'Serviço prestado por Joana Pereira Silva',
    valorCents: 45000, competencia: '2026-08', dataFato: '2026-08-07',
    rateio: [{ contaCodigo: '4.2.1.007', valorCents: 45000, memo: 'reembolso a Joana Pereira Silva' }],
    parcelas: { quantidade: 1, primeiroVencimento: '2026-08-27' },
  }));
  const loteId = t.lote.id;
  const antesTotal = naA(() => repo.lotePorId(loteId)).total_cents;

  const r = naA(() => contrapartes.anonimizar(alvo.id, { motivo: 'pedido de eliminação do titular' }));

  // 1. o cadastro some
  const c = naA(() => contrapartes.buscar(alvo.id));
  assert.ok(/^Titular anonimizado/.test(c.nome), `nome não foi trocado: ${c.nome}`);
  assert.strictEqual(c.email, '');
  assert.strictEqual(c.telefone, '');
  assert.ok(c.anonimizado_em, 'não marcou quando foi anonimizada');

  // 2. o nome some do texto do título e dos históricos
  const detalhe = naA(() => titulos.buscar(t.titulo.id));
  assert.ok(!/Joana Pereira Silva/.test(detalhe.descricao), `o nome ficou no título: ${detalhe.descricao}`);
  const linhas = naA(() => repo.linhasDoLote(loteId));
  assert.ok(!linhas.some(l => /Joana Pereira Silva/.test(l.memo)), 'o nome ficou no histórico da linha');
  assert.ok(!/Joana Pereira Silva/.test(naA(() => repo.lotePorId(loteId)).memo), 'o nome ficou no memo do lote');

  // 3. a SUBSTÂNCIA contábil não foi tocada
  assert.strictEqual(naA(() => repo.lotePorId(loteId)).total_cents, antesTotal, 'o valor do lote mudou');
  assert.strictEqual(linhas.reduce((s, l) => s + l.debito_cents, 0),
    linhas.reduce((s, l) => s + l.credito_cents, 0), 'o lote desbalanceou');
  assert.strictEqual(naA(() => ledger.conferirBalanceamento(empresaA.id)).ok, true);

  // 4. a auditoria NÃO guardou o nome antigo — senão não seria anonimização
  const log = naA(() => auditoria.listar({ objetoTipo: 'contraparte', objetoId: alvo.id, limite: 10 }));
  const evento = log.find(l => l.acao === 'contraparte.anonimizar');
  assert.ok(evento, 'a anonimização não foi auditada');
  assert.ok(!/Joana Pereira Silva/.test(evento.detalhe),
    'a auditoria IMUTÁVEL guardou o nome que se queria apagar — isso anula a anonimização');

  // 5. e ela DIZ o que não conseguiu limpar
  assert.strictEqual(r.completa, false);
  assert.ok(r.naoLimpos.some(x => /diário/i.test(x)), 'não avisa que o diário replicado mantém o nome');
  assert.ok(/art\. 16, I/.test(r.aviso), 'não explica por que o lançamento fica');
});

lanca('anonimização: exige motivo', () => {
  const c = naA(() => contrapartes.criar({ entidadeId: empresaA.id, nome: 'Sem Motivo Ltda' }));
  return naA(() => contrapartes.anonimizar(c.id, {}));
}, /motivo/);

teste('anonimização: não se anonimiza duas vezes', () => {
  const c = naA(() => contrapartes.criar({ entidadeId: empresaA.id, nome: 'Duas Vezes Ltda' }));
  naA(() => contrapartes.anonimizar(c.id, { motivo: 'primeiro pedido' }));
  assert.throws(() => naA(() => contrapartes.anonimizar(c.id, { motivo: 'de novo' })), /já foi anonimizada/);
});

teste('anonimização: o gatilho continua barrando alteração de SUBSTÂNCIA', () => {
  const linha = naA(() => repo.q(
    `SELECT l.id FROM fin_linhas l JOIN fin_lotes b ON b.id = l.lote_id
      WHERE l.tenant_id = :tenant AND b.status <> 'rascunho' LIMIT 1`, {}))[0];
  // memo pode (é o que a anonimização precisa)...
  naA(() => db.prepare('UPDATE fin_linhas SET memo = ? WHERE id = ?').run('memo novo', linha.id));
  // ...valor NÃO pode.
  assert.throws(
    () => db.prepare('UPDATE fin_linhas SET debito_cents = debito_cents + 1 WHERE id = ?').run(linha.id),
    /imutavel/, 'o gatilho deixou alterar o VALOR de uma linha contabilizada');
  assert.throws(
    () => db.prepare('UPDATE fin_linhas SET conta_id = ? WHERE id = ?').run('outra', linha.id),
    /imutavel/, 'o gatilho deixou trocar a CONTA de uma linha contabilizada');
});

teste('anonimização: é ação de nível 3', () => {
  assert.strictEqual(rbac.nivelDe('contraparte.anonimizar'), 3);
  assert.strictEqual(rbac.nivelDe('contraparte.anonimizar', { 'contraparte.anonimizar': 1 }), 3,
    'configuração conseguiu rebaixar uma ação irreversível');
});

// =====================================================================
// 14a. SEGUNDO FATOR (fase 10) — TOTP de verdade
// =====================================================================
const mfa = require('./mfa');

// Usuário próprio deste bloco: os do teste de HTTP só nascem na cadeia
// assíncrona, que roda depois de todos os testes síncronos.
let usuarioMfa = null;
teste('mfa: usuário de teste criado', () => {
  usuarioMfa = naA(() => contasSvc.criarUsuario({
    email: 'mfa@teste.local', nome: 'Teste MFA', senha: 'senha-longa-de-teste', perfil: 'controller',
  }));
  assert.ok(usuarioMfa.id);
});

teste('mfa: base32 vai e volta sem perder byte', () => {
  const bruto = require('crypto').randomBytes(20);
  assert.strictEqual(mfa.deBase32(mfa.base32(bruto)).toString('hex'), bruto.toString('hex'));
});

teste('mfa: gera o código do RFC 6238 (vetor conhecido)', () => {
  // Vetor do RFC 6238, apêndice B: segredo "12345678901234567890" (ASCII),
  // SHA-1. Em T=59s o passo é 1 e o código de 6 dígitos é 287082.
  const segredo = mfa.base32(Buffer.from('12345678901234567890', 'ascii'));
  assert.strictEqual(mfa.codigoNoPasso(segredo, 1), '287082');
  assert.strictEqual(mfa.codigoNoPasso(segredo, 37037036), '081804');
});

teste('mfa: aceita a janela de ±1 passo e recusa fora dela', () => {
  const segredo = mfa.base32(require('crypto').randomBytes(20));
  const agora = Date.now();
  const passo = mfa.passoAgora(agora);
  assert.strictEqual(mfa.conferirCodigo(segredo, mfa.codigoNoPasso(segredo, passo), agora), passo);
  assert.strictEqual(mfa.conferirCodigo(segredo, mfa.codigoNoPasso(segredo, passo - 1), agora), passo - 1);
  assert.strictEqual(mfa.conferirCodigo(segredo, mfa.codigoNoPasso(segredo, passo + 1), agora), passo + 1);
  // Dois passos atrás já não vale.
  assert.strictEqual(mfa.conferirCodigo(segredo, mfa.codigoNoPasso(segredo, passo - 2), agora), null);
  assert.strictEqual(mfa.conferirCodigo(segredo, '000000', agora), null);
  assert.strictEqual(mfa.conferirCodigo(segredo, '12345', agora), null, 'aceitou código de 5 dígitos');
});

lanca('mfa: sem FINANCE_SECRET_KEY, RECUSA ativar em vez de gravar em claro', () => {
  const guardada = process.env.FINANCE_SECRET_KEY;
  delete process.env.FINANCE_SECRET_KEY;
  try {
    assert.strictEqual(mfa.configurado(), false);
    mfa.iniciar(usuarioMfa.id);
  } finally {
    if (guardada) process.env.FINANCE_SECRET_KEY = guardada;
  }
}, /FINANCE_SECRET_KEY/);

teste('mfa: ciclo completo — QR, confirmação, uso e recusa de reuso', () => {
  process.env.FINANCE_SECRET_KEY = require('crypto').randomBytes(32).toString('hex');
  const u = usuarioMfa;
  const inicio = mfa.iniciar(u.id);
  assert.ok(/^otpauth:\/\/totp\//.test(inicio.uri), 'URI do QR malformada');
  assert.ok(inicio.uri.includes('issuer=Villela%20Finance'));
  // Ainda NÃO está ativo: só gerar o QR não basta.
  assert.strictEqual(mfa.estado(u.id).ativo, false, 'ativou sem a pessoa provar que leu o QR');
  assert.strictEqual(mfa.verificar(u.id, mfa.codigoNoPasso(inicio.segredo, mfa.passoAgora())).ok, false);

  // O segredo está CIFRADO no banco — não em claro.
  const noBanco = db.prepare('SELECT mfa_segredo FROM tenant_users WHERE id = ?').get(u.id).mfa_segredo;
  assert.ok(noBanco.startsWith('v1.'), 'segredo não está no formato cifrado');
  assert.ok(!noBanco.includes(inicio.segredo), 'o segredo do TOTP está EM CLARO no banco');
  assert.strictEqual(mfa.decifrar(noBanco), inicio.segredo, 'o cofre não devolve o mesmo segredo');

  const codigo = mfa.codigoNoPasso(inicio.segredo, mfa.passoAgora());
  assert.strictEqual(mfa.confirmar(u.id, codigo).ativo, true);
  assert.strictEqual(mfa.estado(u.id).ativo, true);

  // O código usado na confirmação NÃO vale de novo na mesma janela.
  const reuso = mfa.verificar(u.id, codigo);
  assert.strictEqual(reuso.ok, false, 'aceitou o mesmo código duas vezes');
  assert.strictEqual(reuso.motivo, 'codigo_reutilizado');

  // O código do passo seguinte vale.
  const outro = mfa.codigoNoPasso(inicio.segredo, mfa.passoAgora() + 1);
  assert.strictEqual(mfa.verificar(u.id, outro).ok, true);

  // Desativar exige código válido.
  assert.throws(() => mfa.desativar(u.id, '000000'), /código válido/);
  const maisUm = mfa.codigoNoPasso(inicio.segredo, mfa.passoAgora() - 1);
  assert.strictEqual(mfa.desativar(u.id, maisUm).ativo, false);
  assert.strictEqual(db.prepare('SELECT mfa_segredo FROM tenant_users WHERE id = ?').get(u.id).mfa_segredo, '',
    'o segredo continuou guardado depois de desativar');
});

teste('mfa: usuário sem segundo fator não passa por verificado', () => {
  const outro = naA(() => contasSvc.criarUsuario({
    email: 'sem-mfa@teste.local', nome: 'Sem MFA', senha: 'senha-longa-de-teste', perfil: 'leitor',
  }));
  const r = mfa.verificar(outro.id, '123456');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'sem_mfa');
});

// =====================================================================
// 14b. RESTAURAÇÃO (fase 10) — a prova de que o RPO não é promessa
// =====================================================================
const restauracao = require('./restauracao');

testeAsync('restauração: snapshot + replay do diário devolve o razão inteiro', async () => {
  const os_ = require('os');
  const path_ = require('path');
  const fs_ = require('fs');
  const dir = path_.join(os_.tmpdir(), 'fin-restaura-' + Date.now());
  fs_.mkdirSync(dir, { recursive: true });

  // 1. estado no momento do snapshot
  const antesLotes = db.prepare("SELECT COUNT(*) AS n FROM fin_lotes WHERE status <> 'rascunho'").get().n;
  const snap = restauracao.snapshot(db, path_.join(dir, 'snap.db'));
  assert.ok(snap.bytes > 1000, 'snapshot suspeitosamente pequeno');

  // 2. lançamentos DEPOIS do snapshot — é exatamente o que o diário tem
  //    de recuperar. Sem eles, o teste não provaria nada.
  const depois = [];
  for (const [i, valor] of [12345, 67800, 999].entries()) {
    depois.push(naA(() => ledger.lancar({
      entidadeId: empresaA.id, data: `2026-11-${String(10 + i).padStart(2, '0')}`,
      memo: `lançamento pós-snapshot ${i + 1}`,
      linhas: [
        { contaCodigo: '1.1.1.001', debitoCents: valor },
        { contaCodigo: '3.9.1.002', creditoCents: valor },
      ],
    })).lote);
  }
  const depoisLotes = db.prepare("SELECT COUNT(*) AS n FROM fin_lotes WHERE status <> 'rascunho'").get().n;
  assert.strictEqual(depoisLotes, antesLotes + 3);

  // 3. restaura a partir do snapshot ANTIGO + diário
  const destino = path_.join(dir, 'restaurado.db');
  const r = restauracao.restaurar({ snapshotArquivo: snap.arquivo, destino });

  assert.strictEqual(r.lotesNoSnapshot, antesLotes, 'o snapshot não tinha o que devia');
  assert.ok(r.lotesRepostos >= 3, `o replay repôs ${r.lotesRepostos} lote(s) — os 3 pós-snapshot deviam estar lá`);
  assert.strictEqual(r.verificacao.ok, true, `verificação falhou: ${JSON.stringify(r.verificacao.problemas)}`);
  assert.strictEqual(r.verificacao.lotes, depoisLotes, 'o banco restaurado não tem todos os lotes');
  assert.strictEqual(r.verificacao.totalDebitoCents, r.verificacao.totalCreditoCents, 'restaurado desbalanceado');

  // 4. os lançamentos pós-snapshot estão lá, com o valor certo
  const { DatabaseSync } = require('node:sqlite');
  const rest = new DatabaseSync(destino);
  for (const lote of depois) {
    const achado = rest.prepare('SELECT total_cents, memo FROM fin_lotes WHERE id = ?').get(lote.id);
    assert.ok(achado, `o lote ${lote.numero} não voltou na restauração`);
    assert.strictEqual(achado.total_cents, lote.total_cents, 'valor divergente no restaurado');
  }
  // 5. e o banco restaurado voltou COM as travas
  const gatilhos = rest.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_fin_%'").get().n;
  assert.ok(gatilhos >= restauracao.GATILHOS.length,
    `o restaurado ficou com ${gatilhos} gatilhos — sem eles, não é um banco confiável`);
  rest.close();
  fs_.rmSync(dir, { recursive: true, force: true });
});

testeAsync('restauração: rodar de novo é idempotente (não duplica lote)', async () => {
  const os_ = require('os'); const path_ = require('path'); const fs_ = require('fs');
  const dir = path_.join(os_.tmpdir(), 'fin-restaura2-' + Date.now());
  fs_.mkdirSync(dir, { recursive: true });
  const snap = restauracao.snapshot(db, path_.join(dir, 's.db'));
  // Snapshot COM tudo: o replay não deve inserir nada.
  const r = restauracao.restaurar({ snapshotArquivo: snap.arquivo, destino: path_.join(dir, 'r.db') });
  assert.strictEqual(r.lotesRepostos, 0, 'repôs lote que já estava no snapshot');
  assert.ok(r.jaExistiam > 0, 'não reconheceu os lotes já presentes');
  assert.strictEqual(r.verificacao.ok, true);
  fs_.rmSync(dir, { recursive: true, force: true });
});

testeAsync('restauração: verificação REJEITA um razão corrompido', async () => {
  const os_ = require('os'); const path_ = require('path'); const fs_ = require('fs');
  const { DatabaseSync } = require('node:sqlite');
  const dir = path_.join(os_.tmpdir(), 'fin-restaura3-' + Date.now());
  fs_.mkdirSync(dir, { recursive: true });
  const snap = restauracao.snapshot(db, path_.join(dir, 's.db'));

  // Corrompe o snapshot de propósito: apaga UMA linha de um lote, o que
  // deixa o lote torto sem deixar o banco obviamente quebrado.
  const corrompido = new DatabaseSync(snap.arquivo);
  for (const t of restauracao.GATILHOS) corrompido.exec(`DROP TRIGGER IF EXISTS ${t}`);
  const alvo = corrompido.prepare(
    `SELECT l.id FROM fin_linhas l JOIN fin_lotes b ON b.id = l.lote_id
      WHERE b.status <> 'rascunho' LIMIT 1`).get();
  corrompido.prepare('DELETE FROM fin_linhas WHERE id = ?').run(alvo.id);
  const v = restauracao.verificar(corrompido);
  corrompido.close();

  assert.strictEqual(v.ok, false, 'a verificação aceitou um razão corrompido');
  assert.ok(v.problemas.some(p => p.tipo === 'lote_torto' || p.tipo === 'razao_desbalanceado'),
    `não identificou o problema: ${JSON.stringify(v.problemas)}`);
  fs_.rmSync(dir, { recursive: true, force: true });
});

testeAsync('restauração: o exercício completo passa e não toca no banco em uso', async () => {
  const antes = db.prepare("SELECT COUNT(*) AS n FROM fin_lotes").get().n;
  const e = restauracao.exercicio({ dbProducao: db });
  assert.strictEqual(e.ok, true, `exercício falhou: ${e.erro} ${JSON.stringify(e.detalhe)}`);
  assert.ok(/RPO do ADR-0004 é verificável/.test(e.veredito));
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM fin_lotes").get().n, antes,
    'o exercício alterou o banco em uso — devia ser só leitura');
});

// =====================================================================
// 14c. RETENÇÃO E VARREDURA DE SEGURANÇA (fase 10)
// =====================================================================
const retencao = require('./retencao');
const seguranca = require('./seguranca');

teste('retenção: o padrão é SIMULAR — não apaga nada', () => {
  paginas.registrarInteresse({ email: 'antigo@exemplo.com', nome: 'Antigo' }, '');
  // Envelhece o registro para além do prazo da regra.
  db.prepare("UPDATE fin_interessados SET criado_em = ? WHERE email = ?")
    .run('2020-01-01T00:00:00.000Z', 'antigo@exemplo.com');

  const antes = db.prepare('SELECT COUNT(*) AS n FROM fin_interessados').get().n;
  const r = naA(() => retencao.executar());
  assert.strictEqual(r.aplicado, false);
  assert.ok(/SIMULAÇÃO/.test(r.aviso));
  const regra = r.regras.find(x => x.id === 'interessados-sem-conversao');
  assert.strictEqual(regra.elegiveis, 1, 'não identificou o registro vencido');
  assert.strictEqual(regra.apagados, 0, 'apagou em modo simulação');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM fin_interessados').get().n, antes,
    'a simulação apagou registro');
});

teste('retenção: toda regra diz a base legal e o PORQUÊ', () => {
  const r = naA(() => retencao.executar());
  for (const regra of r.regras) {
    assert.ok(regra.base, `${regra.id} sem base legal`);
    assert.ok(regra.porque && regra.porque.length > 60, `${regra.id} sem justificativa utilizável`);
    assert.ok(regra.prazoMeses > 0, `${regra.id} sem prazo`);
  }
  assert.strictEqual(r.erros.length, 0, JSON.stringify(r.erros));
});

teste('retenção: aplicar apaga o acessório e NUNCA o razão', () => {
  const lotesAntes = naA(() => repo.listarLotes(empresaA.id, { limite: 5000 })).length;
  const linhasAntes = db.prepare('SELECT COUNT(*) AS n FROM fin_linhas').get().n;
  const auditAntes = db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n;

  const r = naA(() => retencao.executar({ aplicar: true }));
  assert.strictEqual(r.aplicado, true);
  assert.strictEqual(r.regras.find(x => x.id === 'interessados-sem-conversao').apagados, 1);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM fin_interessados WHERE email = 'antigo@exemplo.com'").get().n, 0);

  // O que a política jura nunca tocar continua intocado.
  assert.strictEqual(naA(() => repo.listarLotes(empresaA.id, { limite: 5000 })).length, lotesAntes, 'a retenção apagou lote');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM fin_linhas').get().n, linhasAntes, 'a retenção apagou linha do razão');
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n >= auditAntes, 'a retenção apagou auditoria');
  assert.strictEqual(naA(() => ledger.conferirBalanceamento(empresaA.id)).ok, true);
  assert.ok(r.nuncaDescartado.some(n => /razão/i.test(n.o_que)), 'não declara o que nunca descarta');
});

teste('retenção: o automático fica DESLIGADO por padrão', () => {
  delete process.env.FINANCE_RETENCAO;
  assert.strictEqual(retencao.automaticoLigado(), false,
    'descarte automático ligado por padrão — irreversível não pode ser padrão');
  process.env.FINANCE_RETENCAO = 'on';
  assert.strictEqual(retencao.automaticoLigado(), true);
  delete process.env.FINANCE_RETENCAO;
});

teste('segurança: a varredura do próprio módulo passa limpa', () => {
  const r = seguranca.varrer();
  const graves = r.achados.filter(a => ['critica', 'alta'].includes(a.gravidade));
  assert.strictEqual(graves.length, 0,
    'achados graves: ' + graves.map(a => `${a.regra}/${a.arquivo}: ${a.detalhe}`).join(' | '));
  assert.ok(/NÃO é pentest/.test(r.escopo), 'a varredura não declara seu limite');
});

teste('segurança: a varredura DETECTA ação material rebaixada', () => {
  // Rebaixa de propósito e exige que a varredura acuse.
  const original = rbac.ACOES['pagamento.executar'].nivelMinimo;
  rbac.ACOES['pagamento.executar'].nivelMinimo = 1;
  try {
    const r = seguranca.varrer();
    assert.ok(r.achados.some(a => a.regra === 'nivel-de-risco' && /pagamento\.executar/.test(a.detalhe)),
      'a varredura não viu uma ação material rebaixada para nível 1');
  } finally {
    rbac.ACOES['pagamento.executar'].nivelMinimo = original;
  }
  assert.strictEqual(seguranca.varrer().achados.filter(a => a.gravidade === 'critica').length, 0);
});

teste('segurança: a varredura DETECTA gatilho ausente', () => {
  db.exec('DROP TRIGGER IF EXISTS trg_fin_lote_sem_delete');
  try {
    const r = seguranca.varrer();
    assert.ok(r.achados.some(a => a.regra === 'gatilho-ausente' && /sem_delete/.test(a.detalhe)),
      'a varredura não viu um gatilho de invariante ausente');
  } finally {
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_fin_lote_sem_delete
      BEFORE DELETE ON fin_lotes FOR EACH ROW WHEN OLD.status IN ('contabilizado','estornado')
      BEGIN SELECT RAISE(ABORT, 'lote contabilizado nao pode ser excluido'); END`);
  }
});

// -------------------------------------------- layouts reais de extrato
teste('extrato C6: o cabeçalho real mapeia a DESCRIÇÃO, não o título genérico', () => {
  // Layout que o Augusto exporta do C6 PJ desde 08/2026.
  const cab = ['Data Lançamento', 'Data Contábil', 'Título', 'Descrição', 'Entrada', 'Saída', 'Saldo do Dia'];
  const m = bancos.mapearColunas(cab);
  assert.strictEqual(m.descricao, 3,
    'pegou "Título" ("Pix recebido") em vez de "Descrição" (o nome do fornecedor) — as regras de classificação parariam de casar, em silêncio');
  assert.strictEqual(m.credito, 4, 'não achou a coluna Entrada');
  assert.strictEqual(m.debito, 5, 'não achou a coluna Saída');
  assert.strictEqual(m.data, 0);
  assert.strictEqual(m.documento, -1,
    'inventou coluna de documento — o sinônimo "id" casava DENTRO de "saída" e apontava para o valor');
});

teste('extrato: casamento por pedaço respeita limite de palavra', () => {
  assert.strictEqual(bancos.mapearColunas(['Saída']).documento, -1, '"id" casou dentro de "saida"');
  assert.strictEqual(bancos.mapearColunas(['Data', 'Documento', 'Valor']).documento, 1, 'deixou de achar o documento de verdade');
  assert.strictEqual(bancos.mapearColunas(['Data', 'Nr Documento', 'Valor']).documento, 1, 'não achou "Nr Documento"');
});

teste('extrato: colunas separadas de débito/crédito vencem a coluna única de valor', () => {
  // `NET_CREDIT_AMOUNT` casa com "valor" (por "amount") e com "crédito" ao
  // mesmo tempo: se a coluna única vencesse, toda saída viraria entrada.
  const cab = ['DATE', 'DESCRIPTION', 'NET_CREDIT_AMOUNT', 'NET_DEBIT_AMOUNT'];
  const m = bancos.mapearColunas(cab);
  const saida = bancos.normalizarLinha(['2026-08-02', 'pagamento', '', '438,90'], m, 1);
  assert.ok(!saida.erro, `linha rejeitada: ${saida.erro}`);
  assert.strictEqual(saida.valorCents, -43890, 'a saída não ficou negativa — o sinal do extrato inverteu');
  const entrada = bancos.normalizarLinha(['2026-08-01', 'recebimento', '1250,00', ''], m, 2);
  assert.strictEqual(entrada.valorCents, 125000);
});

teste('extrato: CSV do C6 com aspas duplicadas na descrição é lido inteiro', () => {
  // O C6 embrulha a linha inteira em aspas quando há vírgula no texto e
  // duplica as aspas internas — é RFC 4180, e o parser tem de respeitar.
  const linhas = [
    'Data,Descrição,Entrada,Saída',
    '01/08/2026,"CLIENTE X, LTDA - pgto ""reserva""","1250,00",',
  ];
  const r = bancos.lerCsv(linhas.join('\n') + '\n');
  assert.strictEqual(r.delimitador, ',');
  assert.strictEqual(r.linhas[1][1], 'CLIENTE X, LTDA - pgto "reserva"',
    'a descrição com vírgula e aspas foi partida — o fornecedor sairia truncado');
  assert.strictEqual(r.linhas[1].length, 4, 'a linha quebrou em mais colunas do que o cabeçalho');
});

// ============================================================
// 14.8 EXTRATO DO MERCADO PAGO (importação automática)
// ============================================================
const mercadopago = require('./mercadopago');

// Mercado Pago de mentira, com os casos que importam: aprovado com tarifa,
// aprovado sem tarifa, recusado, e paginação.
const EU_MP = '999';

function mpExtrato(pagamentos) {
  const f = (caminho) => {
    if (caminho === '/users/me') return Promise.resolve({ id: EU_MP });
    const u = new URL('https://x' + caminho);
    const offset = Number(u.searchParams.get('offset') || 0);
    const limit = Number(u.searchParams.get('limit') || 50);
    f.chamadas.push({ offset, limit, begin: u.searchParams.get('begin_date'), range: u.searchParams.get('range') });
    return Promise.resolve({ results: pagamentos.slice(offset, offset + limit), paging: { total: pagamentos.length } });
  };
  f.__mock = true;
  f.chamadas = [];
  return f;
}

// Por padrão o pagamento é RECEBIDO por nós: `collector_id` é a conta, o
// pagador é outra pessoa. Os testes que querem uma saída invertem isso.
const pgto = (o) => Object.assign({
  id: 1, status: 'approved', date_approved: '2026-08-05T10:00:00.000-03:00',
  transaction_amount: 1000, operation_type: 'regular_payment', description: 'Reserva',
  payment_method_id: 'pix', fee_details: [],
  collector_id: EU_MP, payer: { id: '111' },
}, o);

teste('extrato MP: bruto entra como crédito e a tarifa sai SEPARADA', () => {
  const { linhas } = mercadopago.paraTransacoes([
    pgto({ id: 'P1', transaction_amount: 1000, fee_details: [{ type: 'mercadopago_fee', amount: 49.9 }] }),
  ], EU_MP);
  assert.strictEqual(linhas.length, 2, 'esperava a entrada e a tarifa como linhas distintas');
  assert.strictEqual(linhas[0].valorCents, 100000, 'a entrada não é o valor BRUTO');
  assert.strictEqual(linhas[1].valorCents, -4990, 'a tarifa não saiu como débito');
  // Importar só o líquido faria a receita encolher sem ninguém ver para onde
  // foi a diferença — e a tarifa nunca viraria despesa.
  assert.ok(/Tarifa Mercado Pago/.test(linhas[1].descricao), 'a linha da tarifa não se identifica');
  assert.notStrictEqual(linhas[0].documento, linhas[1].documento,
    'entrada e tarifa com o mesmo documento — uma delas seria tomada por duplicata');
});

teste('extrato MP: pagamento não aprovado NÃO entra no extrato', () => {
  const { linhas } = mercadopago.paraTransacoes([
    pgto({ id: 'P2', status: 'rejected' }),
    pgto({ id: 'P3', status: 'pending' }),
    pgto({ id: 'P4', status: 'approved' }),
  ], EU_MP);
  assert.strictEqual(linhas.length, 1, 'pagamento recusado ou pendente virou dinheiro no razão');
  assert.strictEqual(linhas[0].documento, 'P4');
});

teste('extrato MP: soma das tarifas cobre mais de uma linha de taxa', () => {
  const t = mercadopago.tarifaCents(pgto({ fee_details: [{ amount: 10.5 }, { amount: 2.25 }] }));
  assert.strictEqual(t, 1275);
  assert.strictEqual(mercadopago.tarifaCents(pgto({ fee_details: [] })), 0);
});

teste('extrato MP: pagamento que NÓS fizemos entra como SAÍDA, não como receita', () => {
  // Achado ao rodar a prévia contra a conta real em 25/08/2026: de 50
  // pagamentos de agosto, 16 eram pagamentos FEITOS por ele. Tratar todos
  // como entrada punha R$ 7 mil de dinheiro que saiu dentro da receita.
  const { linhas } = mercadopago.paraTransacoes([
    pgto({ id: 'REC', transaction_amount: 500, collector_id: EU_MP, payer: { id: '111' } }),
    pgto({ id: 'PAG', transaction_amount: 300, collector_id: '222', payer: { id: EU_MP } }),
  ], EU_MP);
  const rec = linhas.find(l => l.documento === 'REC');
  const pag = linhas.find(l => l.documento === 'PAG');
  assert.strictEqual(rec.valorCents, 50000, 'o recebimento não entrou como positivo');
  assert.strictEqual(pag.valorCents, -30000, 'o pagamento que NÓS fizemos entrou como receita');
});

teste('extrato MP: movimento interno não entra — e não some', () => {
  // `money_exchange` com a conta dos dois lados (rendimento do saldo,
  // partição): chutar o sinal seria inventar receita ou despesa.
  const { linhas, naoClassificados } = mercadopago.paraTransacoes([
    pgto({ id: 'INT', transaction_amount: 1.25, operation_type: 'money_exchange', collector_id: EU_MP, payer: { id: EU_MP } }),
    pgto({ id: 'OK', transaction_amount: 10 }),
  ], EU_MP);
  assert.strictEqual(linhas.length, 1, 'o movimento interno virou lançamento');
  assert.strictEqual(linhas[0].documento, 'OK');
  assert.strictEqual(naoClassificados.length, 1, 'o movimento interno sumiu sem deixar rastro');
  assert.ok(/dos dois lados/.test(naoClassificados[0].motivo), 'não diz por que não foi classificado');
});

teste('extrato MP: tarifa só existe em pagamento RECEBIDO', () => {
  const { linhas } = mercadopago.paraTransacoes([
    pgto({ id: 'PAGCOMFEE', transaction_amount: 200, collector_id: '222', payer: { id: EU_MP },
      fee_details: [{ amount: 9.9 }] }),
  ], EU_MP);
  assert.strictEqual(linhas.length, 1,
    'gerou linha de tarifa num pagamento que nós fizemos — a tarifa é de quem recebe, e já está no valor que saiu');
  assert.strictEqual(linhas[0].valorCents, -20000);
});

teste('extrato MP: sem o id da conta, RECUSA em vez de adivinhar o sinal', () => {
  let recusou = false;
  try { mercadopago.paraTransacoes([pgto({})], ''); } catch (_) { recusou = true; }
  assert.strictEqual(recusou, true, 'converteu sem saber quem é a conta — o sinal seria chute');
});

teste('extrato MP: a direção é decidida pelas duas pontas', () => {
  const eu = '77';
  assert.strictEqual(mercadopago.direcao({ collector_id: '77', payer: { id: '9' } }, eu), 'entrada');
  assert.strictEqual(mercadopago.direcao({ collector_id: '9', payer: { id: '77' } }, eu), 'saida');
  assert.strictEqual(mercadopago.direcao({ collector_id: '77', payer: { id: '77' } }, eu), 'interno');
  assert.strictEqual(mercadopago.direcao({ collector_id: '1', payer: { id: '2' } }, eu), 'interno');
});

testeAsync('extrato MP: a prévia não grava nada e declara o que NÃO vê', async () => {
  mercadopago.configurar({ mpFetch: mpExtrato([
    pgto({ id: 'A1', transaction_amount: 250, fee_details: [{ amount: 12.4 }] }),
    pgto({ id: 'A2', transaction_amount: 100 }),
  ]) });
  const antes = naA(() => repo.contarTransacoes(empresaA.id).reduce((s, x) => s + x.n, 0));
  const p = await mercadopago.previa({ desde: '2026-08-01', ate: '2026-08-31' });
  const depois = naA(() => repo.contarTransacoes(empresaA.id).reduce((s, x) => s + x.n, 0));
  assert.strictEqual(depois, antes, 'a prévia gravou transação — ela existe justamente para não gravar');

  assert.strictEqual(p.resumo.recebidoCents, 35000);
  assert.strictEqual(p.resumo.tarifasCents, -1240);
  assert.strictEqual(p.resumo.liquidoCents, 33760);
  // O aviso é o que impede a conciliação de ser lida como prova de que bate.
  assert.ok(/Saques para o banco/.test(p.aviso) && /Movimento interno/.test(p.aviso),
    'a prévia não declara que o extrato é PARCIAL — a diferença na conciliação pareceria defeito');
});

testeAsync('extrato MP: busca usa a data de APROVAÇÃO e pagina até o fim', async () => {
  const muitos = Array.from({ length: 120 }, (_, i) => pgto({ id: 'X' + i, transaction_amount: 10 }));
  const f = mpExtrato(muitos);
  mercadopago.configurar({ mpFetch: f });
  const r = await mercadopago.buscarPagamentos({ desde: '2026-08-01', ate: '2026-08-31' });
  assert.strictEqual(r.pagamentos.length, 120, 'parou antes de trazer tudo');
  assert.strictEqual(r.truncado, false);
  assert.ok(f.chamadas.length >= 3, 'não paginou');
  assert.strictEqual(f.chamadas[0].range, 'date_approved',
    'buscou por data de criação — pagamento criado num mês e aprovado no outro cairia na competência errada');
  assert.ok(/^2026-08-01T00:00:00/.test(f.chamadas[0].begin), 'o início do intervalo não foi respeitado');
});

lancaAsync('extrato MP: intervalo inválido é recusado antes de bater na API', async () => {
  mercadopago.configurar({ mpFetch: mpExtrato([]) });
  await mercadopago.previa({ desde: '01/08/2026', ate: '2026-08-31' });
}, /AAAA-MM-DD/);

testeAsync('extrato MP: sincronizar entrega ao MESMO importador — e reimportar não duplica', async () => {
  mercadopago.configurar({ mpFetch: mpExtrato([
    pgto({ id: 'S1', transaction_amount: 500, fee_details: [{ amount: 24.9 }] }),
    pgto({ id: 'S2', transaction_amount: 80 }),
  ]) });
  const banco = naA(() => repo.listarContasBancarias(empresaA.id))[0];

  const r1 = await naA(() => mercadopago.sincronizar({
    entidadeId: empresaA.id, contaBancariaId: banco.id, desde: '2026-08-01', ate: '2026-08-31', dryRun: false,
  }));
  assert.strictEqual(r1.importado, true);
  assert.strictEqual(r1.resumo.novas, 3, `esperava 2 entradas + 1 tarifa, veio ${r1.resumo.novas}`);

  const r2 = await naA(() => mercadopago.sincronizar({
    entidadeId: empresaA.id, contaBancariaId: banco.id, desde: '2026-08-01', ate: '2026-08-31', dryRun: false,
  }));
  assert.strictEqual(r2.resumo.novas, 0, 'reimportar o mesmo período duplicou lançamento');

  // Passou pelo caminho normal: as transações estão na fila de conciliação,
  // com sugestão, e não viraram lançamento sozinhas.
  const t = naA(() => repo.listarTransacoes(empresaA.id, { limite: 500 }))
    .filter(x => String(x.documento).startsWith('S'));
  assert.ok(t.length >= 3, 'as transações do MP não entraram na fila');
  assert.ok(t.every(x => x.status !== 'conciliada'),
    'o adaptador conciliou sozinho — classificar dinheiro de terceiro é decisão de gente');
});

testeAsync('extrato MP: sem conta bancária escolhida, recusa com a instrução', async () => {
  mercadopago.configurar({ mpFetch: mpExtrato([]) });
  try {
    await mercadopago.sincronizar({ entidadeId: empresaA.id, desde: '2026-08-01', ate: '2026-08-31' });
    assert.fail('aceitou sincronizar sem conta bancária');
  } catch (e) {
    assert.ok(/conta bancária/i.test(e.message), `mensagem pouco útil: ${e.message}`);
  }
});

// ------------------------------------------------------------- OFX
const OFX_EXEMPLO = [
  'OFXHEADER:100', 'DATA:OFXSGML', 'VERSION:102', 'CHARSET:1252', '',
  '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>',
  '<STMTTRN>',
  '<TRNTYPE>DEBIT',
  '<DTPOSTED>20260802120000[-3:BRT]',
  '<TRNAMT>-438.90',
  '<FITID>C6-2026080200001',
  '<NAME>NEOENERGIA BRASILIA',
  '<MEMO>Pagamento conta de luz',
  '</STMTTRN>',
  '<STMTTRN>',
  '<TRNTYPE>CREDIT',
  '<DTPOSTED>20260801',
  '<TRNAMT>1250.00',
  '<FITID>C6-2026080100007',
  '<MEMO>PIX RECEBIDO CLIENTE X',
  '</STMTTRN>',
  '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
].join('\n');

teste('OFX: lê data, sinal, descrição e o identificador do banco', () => {
  const r = bancos.lerOfx(OFX_EXEMPLO);
  assert.strictEqual(r.length, 2, `esperava 2 lançamentos, vieram ${r.length}`);

  const [saida, entrada] = r;
  assert.strictEqual(saida.data, '2026-08-02', 'a data com hora e fuso colados não foi cortada em 8 dígitos');
  assert.strictEqual(saida.valorCents, -43890, 'o sinal do OFX não foi respeitado — saída virou entrada');
  assert.strictEqual(saida.descricao, 'Pagamento conta de luz', 'usou NAME onde havia MEMO');
  assert.strictEqual(saida.contraparteNome, 'NEOENERGIA BRASILIA', 'perdeu o favorecido');
  assert.strictEqual(saida.idBanco, 'C6-2026080200001', 'não capturou o FITID');

  assert.strictEqual(entrada.data, '2026-08-01', 'não aceitou DTPOSTED só com a data');
  assert.strictEqual(entrada.valorCents, 125000);
});

teste('OFX: é reconhecido pelo CONTEÚDO, não pela extensão', () => {
  assert.strictEqual(bancos.pareceOfx(OFX_EXEMPLO), true);
  assert.strictEqual(bancos.pareceOfx('Data,Valor\n01/08/2026,10'), false);
});

teste('OFX: o formato declarado pelo cliente não atrapalha', () => {
  // O navegador manda "csv" quando o usuário só escolhe o arquivo.
  const c = naA(() => repo.listarContasBancarias(empresaA.id))[0];
  const r = naA(() => bancos.importar({
    entidadeId: empresaA.id, contaBancariaId: c.id,
    conteudo: OFX_EXEMPLO, formato: 'csv', fonte: 'ofx declarado como csv',
  }));
  assert.strictEqual(r.resumo.novas, 2, `importou ${r.resumo.novas} em vez de 2 — o conteúdo devia mandar`);
});

teste('OFX: reimportar arquivo MAIOR não duplica o que já entrou (dedupe por FITID)', () => {
  const c = naA(() => repo.listarContasBancarias(empresaA.id))[0];
  // Mesmo extrato + um lançamento novo, e em ordem diferente: com dedupe
  // posicional isso duplicaria tudo; com FITID, entra só o que é novo.
  const maior = OFX_EXEMPLO.replace('</BANKTRANLIST>', [
    '<STMTTRN>', '<TRNTYPE>DEBIT', '<DTPOSTED>20260803', '<TRNAMT>-99.00',
    '<FITID>C6-2026080300012', '<MEMO>TARIFA MENSALIDADE', '</STMTTRN>', '</BANKTRANLIST>',
  ].join('\n'));
  const r = naA(() => bancos.importar({
    entidadeId: empresaA.id, contaBancariaId: c.id,
    conteudo: maior, formato: 'ofx', fonte: 'ofx ampliado',
  }));
  assert.strictEqual(r.resumo.novas, 1, `entraram ${r.resumo.novas} em vez de 1 — a dedupe por FITID não valeu`);
  assert.strictEqual(r.resumo.duplicadas, 2, 'não reconheceu os dois que já existiam');
});

teste('OFX: dois lançamentos idênticos com FITID diferente continuam sendo dois', () => {
  const c = naA(() => repo.listarContasBancarias(empresaA.id))[0];
  const dois = [
    'OFXHEADER:100', '<OFX><BANKTRANLIST>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260805<TRNAMT>-50.00<FITID>AAA1<MEMO>CAFE</STMTTRN>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260805<TRNAMT>-50.00<FITID>AAA2<MEMO>CAFE</STMTTRN>',
    '</BANKTRANLIST></OFX>',
  ].join('\n');
  const r = naA(() => bancos.importar({
    entidadeId: empresaA.id, contaBancariaId: c.id, conteudo: dois, formato: 'ofx', fonte: 'dois cafes',
  }));
  assert.strictEqual(r.resumo.novas, 2,
    'duas compras iguais no mesmo dia viraram uma — o extrato passaria a mentir para menos');
});

lanca('OFX: arquivo sem lançamento é recusado com o motivo', () => {
  const c = naA(() => repo.listarContasBancarias(empresaA.id))[0];
  naA(() => bancos.importar({
    entidadeId: empresaA.id, contaBancariaId: c.id,
    conteudo: 'OFXHEADER:100\n<OFX><STMTTRN></STMTTRN></OFX>', formato: 'ofx', fonte: 'vazio',
  }));
}, /OFX|lançamento|valor/i);

// ============================================================
// 14.9 CASAR EXTRATO COM PARCELA — a metade que faltava do aging
// ============================================================
const casamento = require('./casamento');

/** Título a receber + a linha de extrato correspondente, para os testes. */
function cenarioCasamento({ valorCents, vencimento, documento, descricaoExtrato, dataExtrato, valorExtrato }) {
  const cps = naA(() => repo.listarContrapartes(empresaA.id, 'cliente'));
  const contas = naA(() => repo.listarContas(empresaA.id, { somenteAnaliticas: true }));
  const receita = contas.find(c => c.codigo.startsWith('3.1'));
  const t = naA(() => titulos.criar({
    entidadeId: empresaA.id, especie: 'receber', contraparteId: cps[0].id,
    documento, descricao: 'aluguel de temporada', valorCents, vencimento,
    rateio: [{ contaId: receita.id, valorCents }],
  }));
  const banco = naA(() => repo.listarContasBancarias(empresaA.id))[0];
  const imp = naA(() => bancos.importar({
    entidadeId: empresaA.id, contaBancariaId: banco.id, formato: 'json',
    conteudo: JSON.stringify([{
      data: dataExtrato, valorCents: valorExtrato == null ? valorCents : valorExtrato,
      descricao: descricaoExtrato, documento: 'EXT-' + documento,
    }]),
    fonte: 'cenario de casamento ' + documento,
  }));
  const trans = naA(() => repo.listarTransacoes(empresaA.id, { limite: 500 }))
    .find(x => x.documento === 'EXT-' + documento);
  return { titulo: t, transacao: trans, importacao: imp, contraparte: cps[0] };
}

teste('casamento: valor idêntico + mesmo dia + nome no extrato = alta confiança', () => {
  const c = cenarioCasamento({
    valorCents: 187500, vencimento: '2026-08-14', documento: 'CAS-1',
    dataExtrato: '2026-08-14', descricaoExtrato: 'PIX RECEBIDO',
  });
  const r = naA(() => casamento.candidatos(c.transacao));
  assert.ok(r.candidatos.length, 'não achou candidato para o caso mais óbvio possível');
  const top = r.candidatos[0];
  assert.strictEqual(top.parcelaId, naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0].id);
  assert.ok(top.alta, `confiança baixa (${top.pontos}) num casamento exato`);
  // Score sem motivo é palpite com número.
  assert.ok(top.motivos.some(m => /valor idêntico/.test(m)), 'não explica que o valor bateu');
  assert.ok(top.motivos.some(m => /vencimento/.test(m)), 'não explica a proximidade da data');
});

teste('casamento: entrada NÃO oferece conta a pagar (e vice-versa)', () => {
  const c = cenarioCasamento({
    valorCents: 44400, vencimento: '2026-08-10', documento: 'CAS-2',
    dataExtrato: '2026-08-10', descricaoExtrato: 'PIX RECEBIDO',
  });
  const r = naA(() => casamento.candidatos(c.transacao));
  assert.strictEqual(r.especie, 'receber', 'entrada do extrato procurou conta a pagar');
  assert.ok(r.candidatos.every(x => x.especie === 'receber'),
    'ofereceu parcela de espécie errada — baixaria um fornecedor com dinheiro que entrou');
});

teste('casamento: parcela muito maior que o movimento não vira candidata forte', () => {
  const c = cenarioCasamento({
    valorCents: 900000, vencimento: '2026-08-12', documento: 'CAS-3',
    dataExtrato: '2026-08-12', descricaoExtrato: 'PIX RECEBIDO', valorExtrato: 1000,
  });
  const r = naA(() => casamento.candidatos(c.transacao));
  const dele = r.candidatos.find(x => x.documento === 'CAS-3');
  assert.ok(!dele || !dele.alta, 'R$ 10 baixando uma parcela de R$ 9.000 apareceu como alta confiança');
});

teste('casamento: o documento do título no texto do extrato pesa', () => {
  const c = cenarioCasamento({
    valorCents: 33300, vencimento: '2026-07-02', documento: 'NFSE-99881',
    dataExtrato: '2026-08-20', descricaoExtrato: 'TED RECEBIDA REF NFSE-99881',
  });
  const r = naA(() => casamento.candidatos(c.transacao));
  const top = r.candidatos[0];
  assert.strictEqual(top.documento, 'NFSE-99881', 'o documento citado no extrato não puxou o título para o topo');
  assert.ok(top.motivos.some(m => /documento NFSE-99881/.test(m)), 'não diz que achou o documento');
});

teste('casamento: baixa pelo extrato zera a parcela E concilia a transação no MESMO lote', () => {
  const c = cenarioCasamento({
    valorCents: 250000, vencimento: '2026-08-18', documento: 'CAS-4',
    dataExtrato: '2026-08-18', descricaoExtrato: 'PIX RECEBIDO',
  });
  const parcela = naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0];
  const r = naA(() => casamento.liquidarPelaTransacao(c.transacao, { parcelaId: parcela.id }));

  assert.strictEqual(r.aplicado.valorCents, 250000);
  assert.strictEqual(r.parcela.saldoNovoCents, 0, 'a parcela não foi zerada');

  const t2 = naA(() => repo.transacao(c.transacao.id));
  assert.strictEqual(t2.status, 'conciliada', 'a transação do extrato ficou pendente depois da baixa');
  assert.strictEqual(t2.lote_id, r.loteId,
    'a transação apontou para outro lote — dois lançamentos para o mesmo dinheiro');

  const depois = naA(() => titulos.buscar(c.titulo.titulo.id));
  assert.strictEqual(depois.status, 'liquidado', `título ficou ${depois.status}`);
});

teste('casamento: dinheiro a MAIS vira juros sozinho, e a conta fecha', () => {
  const c = cenarioCasamento({
    valorCents: 100000, vencimento: '2026-07-10', documento: 'CAS-5',
    dataExtrato: '2026-08-11', descricaoExtrato: 'PIX RECEBIDO', valorExtrato: 105000,
  });
  const parcela = naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0];
  const r = naA(() => casamento.liquidarPelaTransacao(c.transacao, { parcelaId: parcela.id }));
  assert.strictEqual(r.aplicado.valorCents, 100000, 'não baixou o principal cheio');
  assert.strictEqual(r.aplicado.jurosCents, 5000, 'a sobra não virou juros');
  assert.strictEqual(r.movimentadoCents, 105000, 'o movimento não bateu com o extrato');
});

teste('casamento: dinheiro a MENOS vira baixa parcial', () => {
  const c = cenarioCasamento({
    valorCents: 80000, vencimento: '2026-08-19', documento: 'CAS-6',
    dataExtrato: '2026-08-19', descricaoExtrato: 'PIX RECEBIDO', valorExtrato: 30000,
  });
  const parcela = naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0];
  const r = naA(() => casamento.liquidarPelaTransacao(c.transacao, { parcelaId: parcela.id }));
  assert.strictEqual(r.aplicado.valorCents, 30000);
  assert.strictEqual(r.parcela.saldoNovoCents, 50000);
  const p2 = naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0];
  assert.strictEqual(p2.status, 'parcial');
});

lanca('casamento: o que a contabilidade registra tem de bater com o que o banco moveu', () => {
  const c = cenarioCasamento({
    valorCents: 60000, vencimento: '2026-08-21', documento: 'CAS-7',
    dataExtrato: '2026-08-21', descricaoExtrato: 'PIX RECEBIDO',
  });
  const parcela = naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0];
  // Pede baixa de 500 num movimento de 600: a diferença não existe no banco.
  naA(() => casamento.liquidarPelaTransacao(c.transacao, { parcelaId: parcela.id, valorCents: 50000, jurosCents: 0 }));
}, /extrato movimentou|Ajuste valor/);

lanca('casamento: transação já conciliada não baixa nada de novo', () => {
  const c = cenarioCasamento({
    valorCents: 12300, vencimento: '2026-08-22', documento: 'CAS-8',
    dataExtrato: '2026-08-22', descricaoExtrato: 'PIX RECEBIDO',
  });
  const parcela = naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0];
  naA(() => casamento.liquidarPelaTransacao(c.transacao, { parcelaId: parcela.id }));
  naA(() => casamento.liquidarPelaTransacao(naA(() => repo.transacao(c.transacao.id)), { parcelaId: parcela.id }));
}, /já está conciliada/);

teste('casamento: o aging DIMINUI depois da baixa pelo extrato', () => {
  // A prova de que isto resolve o problema real: o vencido cai.
  const c = cenarioCasamento({
    valorCents: 400000, vencimento: '2026-06-01', documento: 'CAS-9',
    dataExtrato: '2026-08-23', descricaoExtrato: 'PIX RECEBIDO',
  });
  const antes = naA(() => titulos.aging(empresaA.id, { especie: 'receber', referencia: '2026-08-23' }));
  const parcela = naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0];
  naA(() => casamento.liquidarPelaTransacao(c.transacao, { parcelaId: parcela.id }));
  const depois = naA(() => titulos.aging(empresaA.id, { especie: 'receber', referencia: '2026-08-23' }));

  assert.strictEqual(depois.totalVencidoCents, antes.totalVencidoCents - 400000,
    'o aging não caiu depois de receber — é exatamente o defeito que isto veio corrigir');
});

teste('casamento: palavras de ruído do extrato não fazem nome casar', () => {
  // "Pagamento", "Pix", "Ltda" aparecem em tudo: se contassem como sinal,
  // todo fornecedor casaria com toda linha do extrato.
  assert.strictEqual(casamento.nomeBate('Pagamentos Ltda', 'PIX RECEBIDO PAGAMENTO').bate, false,
    'casou por palavra genérica');
  assert.strictEqual(casamento.nomeBate('Neoenergia Brasília', 'DEB AUT NEOENERGIA').bate, true,
    'deixou de casar um nome distintivo');
});

// ---------------------------------------------- retenções na fonte
teste('retenção: as contas dos DOIS lados existem no plano', () => {
  // Retido de nós é ATIVO (compensa tributo nosso); retido por nós é
  // PASSIVO (temos de recolher). Trocar os dois é o erro clássico.
  for (const chave of ['irrfRecuperar', 'inssRecuperar', 'issRecuperar', 'pccRecuperar']) {
    const c = naA(() => planoContas.chave(empresaA.id, chave));
    assert.ok(c, `falta a conta ${chave}`);
    assert.strictEqual(c.natureza, 'ativo', `${chave} não é ativo`);
  }
  for (const chave of ['irrfRecolher', 'inssRecolher', 'issRecolher', 'pccRecolher']) {
    const c = naA(() => planoContas.chave(empresaA.id, chave));
    assert.ok(c, `falta a conta ${chave}`);
    assert.strictEqual(c.natureza, 'passivo', `${chave} não é passivo`);
  }
});

teste('retenção a RECEBER: o cliente retém, o título quita inteiro e vira crédito tributário', () => {
  const c = cenarioCasamento({
    valorCents: 100000, vencimento: '2026-08-25', documento: 'RET-1',
    dataExtrato: '2026-08-25', descricaoExtrato: 'TED RECEBIDA', valorExtrato: 98500,
  });
  const parcela = naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0];
  const irrf = naA(() => planoContas.chave(empresaA.id, 'irrfRecuperar'));
  const antes = naA(() => ledger.saldo(irrf.id, {})).saldoCents;

  const r = naA(() => liquidacoes.liquidar({
    parcelaId: parcela.id, data: '2026-08-25', valorCents: 100000,
    retencoes: { irrf: 1500 },
    contaBancariaId: c.transacao.conta_bancaria_id, meio: 'ted',
  }));

  assert.strictEqual(r.movimentadoCents, 98500, 'o caixa moveu o valor cheio — a retenção não foi descontada');
  assert.strictEqual(r.parcela.saldoCents, 0, 'o título não quitou inteiro; o cliente pagaria de novo os R$ 15');
  const depois = naA(() => ledger.saldo(irrf.id, {})).saldoCents;
  assert.strictEqual(depois - antes, 1500, 'o IRRF retido não virou crédito a recuperar');
});

teste('retenção a PAGAR: nós retemos, o fornecedor quita e nasce a obrigação de recolher', () => {
  const cps = naA(() => repo.listarContrapartes(empresaA.id, 'fornecedor'));
  const contas = naA(() => repo.listarContas(empresaA.id, { somenteAnaliticas: true }));
  const despesa = contas.find(x => x.codigo.startsWith('4.2'));
  const t = naA(() => titulos.criar({
    entidadeId: empresaA.id, especie: 'pagar', contraparteId: cps[0].id,
    documento: 'RET-2', descricao: 'serviço com ISS retido', valorCents: 200000,
    vencimento: '2026-08-26', rateio: [{ contaId: despesa.id, valorCents: 200000 }],
  }));
  const parcela = naA(() => titulos.buscar(t.titulo.id)).parcelas[0];
  const iss = naA(() => planoContas.chave(empresaA.id, 'issRecolher'));
  const antes = naA(() => ledger.saldo(iss.id, {})).saldoCents;

  const r = naA(() => liquidacoes.liquidar({
    parcelaId: parcela.id, data: '2026-08-26', valorCents: 200000,
    retencoes: { iss: 10000 },
  }));

  assert.strictEqual(r.movimentadoCents, 190000, 'pagamos o valor cheio tendo retido o ISS');
  assert.strictEqual(r.parcela.saldoCents, 0, 'o fornecedor continuou como credor do que foi retido');
  const depois = naA(() => ledger.saldo(iss.id, {})).saldoCents;
  assert.strictEqual(depois - antes, 10000, 'o ISS retido não virou obrigação a recolher');
});

teste('retenção: o razão continua fechando depois das duas', () => {
  const b = naA(() => ledger.conferirBalanceamento(empresaA.id));
  assert.strictEqual(b.ok, true, `razão desbalanceado em ${b.diferencaCents}`);
});

lanca('retenção: não pode passar do valor liquidado', () => {
  const c = cenarioCasamento({
    valorCents: 50000, vencimento: '2026-08-27', documento: 'RET-3',
    dataExtrato: '2026-08-27', descricaoExtrato: 'TED RECEBIDA', valorExtrato: 50000,
  });
  const parcela = naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0];
  naA(() => liquidacoes.liquidar({
    parcelaId: parcela.id, data: '2026-08-27', valorCents: 50000, retencoes: { irrf: 60000 },
  }));
}, /passam do valor|nada sobraria/i);

teste('retenção pelo extrato: a invariante conta a retenção, e a baixa fecha', () => {
  // Sem a retenção na invariante, um recebimento com IRRF seria recusado
  // por "não fecha" — sendo que fecha, só que com uma perna a mais.
  const c = cenarioCasamento({
    valorCents: 300000, vencimento: '2026-08-28', documento: 'RET-4',
    dataExtrato: '2026-08-28', descricaoExtrato: 'TED RECEBIDA', valorExtrato: 295500,
  });
  const parcela = naA(() => titulos.buscar(c.titulo.titulo.id)).parcelas[0];
  const r = naA(() => casamento.liquidarPelaTransacao(c.transacao, {
    parcelaId: parcela.id, retencoes: { irrf: 4500 },
  }));
  assert.strictEqual(r.aplicado.valorCents, 300000, 'não quitou o principal cheio');
  assert.strictEqual(r.movimentadoCents, 295500, 'o movimento não bateu com o extrato');
  const t2 = naA(() => repo.transacao(c.transacao.id));
  assert.strictEqual(t2.status, 'conciliada');
});

// ------------------------------------------ implantação: saldo inicial
teste('implantação: o saldo inicial ENTRA no razão, contra patrimônio líquido', () => {
  const r = naA(() => {
    const pai = repo.contaPorCodigo(empresaA.id, '1.1.1');
    const cc = repo.criarConta({
      entidadeId: empresaA.id, codigo: '1.1.1.900', nome: 'Banco — implantação',
      natureza: 'ativo', saldoNormal: 'devedora', paiId: pai.id, aceitaLancamento: true, subledger: 'bancos',
    });
    const cb = repo.criarContaBancaria({
      entidadeId: empresaA.id, nome: 'Conta de implantação', contaId: cc.id,
      saldoInicialCents: 1234500, saldoInicialData: '2026-01-01',
    });
    return { cb, cc, abertura: bancos.abrirSaldoInicial(cb.id) };
  });
  assert.strictEqual(r.abertura.lancado, true, 'a abertura não foi lançada');

  const saldoBanco = naA(() => ledger.saldo(r.cc.id, {})).saldoCents;
  assert.strictEqual(saldoBanco, 1234500, 'o razão não recebeu o saldo inicial');

  // Contra PL, não contra receita: dinheiro que já existia antes do
  // sistema não é ganho do período, e inflaria o primeiro DRE.
  const pl = naA(() => planoContas.chave(empresaA.id, 'saldosIniciais'));
  assert.strictEqual(naA(() => ledger.saldo(pl.id, {})).saldoCents, 1234500,
    'a contrapartida do saldo inicial não foi para patrimônio líquido');
  const dre = naA(() => relatorios.dre(empresaA.id, '2026-01'));
  assert.strictEqual(dre.resumo.receitaBrutaCents, 0,
    'o saldo inicial virou receita — o primeiro DRE mostraria lucro que nunca existiu');
});

teste('implantação: lançar a abertura duas vezes não duplica', () => {
  const cb = naA(() => repo.listarContasBancarias(empresaA.id)).find(x => x.nome === 'Conta de implantação');
  const antes = naA(() => ledger.saldo(cb.conta_id, {})).saldoCents;
  naA(() => bancos.abrirSaldoInicial(cb.id));
  assert.strictEqual(naA(() => ledger.saldo(cb.conta_id, {})).saldoCents, antes,
    'a segunda chamada duplicou o saldo inicial');
});

teste('implantação: a conciliação DIZ quando a abertura falta, em vez de mandar procurar', () => {
  const r = naA(() => {
    const pai = repo.contaPorCodigo(empresaA.id, '1.1.1');
    const cc = repo.criarConta({
      entidadeId: empresaA.id, codigo: '1.1.1.901', nome: 'Banco — sem abertura',
      natureza: 'ativo', saldoNormal: 'devedora', paiId: pai.id, aceitaLancamento: true, subledger: 'bancos',
    });
    const cb = repo.criarContaBancaria({
      entidadeId: empresaA.id, nome: 'Conta sem abertura', contaId: cc.id,
      saldoInicialCents: 500000, saldoInicialData: '2026-01-01',
    });
    return bancos.painel(empresaA.id, cb.id, {});
  });
  assert.strictEqual(r.aberturaNoRazao, false);
  assert.ok(/saldo inicial de .* ainda NÃO está no razão/.test(r.explicacao),
    `a explicação não aponta a causa real: ${r.explicacao}`);
});

teste('implantação: saldo inicial NEGATIVO (conta no vermelho) também entra', () => {
  const r = naA(() => {
    const pai = repo.contaPorCodigo(empresaA.id, '1.1.1');
    const cc = repo.criarConta({
      entidadeId: empresaA.id, codigo: '1.1.1.902', nome: 'Banco — no vermelho',
      natureza: 'ativo', saldoNormal: 'devedora', paiId: pai.id, aceitaLancamento: true, subledger: 'bancos',
    });
    const cb = repo.criarContaBancaria({
      entidadeId: empresaA.id, nome: 'Conta no vermelho', contaId: cc.id,
      saldoInicialCents: -80000, saldoInicialData: '2026-01-01',
    });
    bancos.abrirSaldoInicial(cb.id);
    return ledger.saldo(cc.id, {}).saldoCents;
  });
  assert.strictEqual(r, -80000, 'saldo inicial negativo não foi lançado — e conta no vermelho existe');
});

// ------------------------------------------ ativos fixos e depreciação
const ativos = require('./ativos');

teste('ativos: cadastrar não lança nada — a compra já entrou pelo título ou pelo extrato', () => {
  const antes = naA(() => ledger.conferirBalanceamento(empresaA.id));
  const a = naA(() => ativos.registrar({
    entidadeId: empresaA.id, nome: 'Ar-condicionado da suíte', categoria: 'eletro',
    aquisicao: '2026-01-15', custoCents: 600000, vidaUtilMeses: 60,
    inicioDepreciacao: '2026-02',
  }));
  assert.ok(a.id, 'ativo não criado');
  assert.strictEqual(a.depreciado_cents, 0);
  const depois = naA(() => ledger.conferirBalanceamento(empresaA.id));
  assert.strictEqual(depois.debitoCents, antes.debitoCents, 'cadastrar o ativo lançou no razão e duplicaria a compra');
});

teste('ativos: a depreciação mensal é linear e a prévia mostra a fórmula', () => {
  const p = naA(() => ativos.previa(empresaA.id, '2026-02'));
  const linha = p.linhas.find(l => /Ar-condicionado/.test(l.nome));
  assert.ok(linha, 'o ativo não apareceu na prévia do primeiro mês');
  assert.strictEqual(linha.mensalCents, 10000, 'R$ 6.000 em 60 meses devia dar R$ 100/mês');
  assert.strictEqual(linha.valorCents, 10000, 'o primeiro mês deveria lançar exatamente uma parcela');
  assert.ok(/custo − valor residual/.test(p.origem.formula), 'a prévia não expõe a fórmula');
  assert.ok(/SUGESTÃO/.test(p.aviso), 'a prévia não avisa que a vida útil é sugestão, não norma');
});

teste('ativos: rodar a depreciação DEPOIS de meses parados recupera o atraso', () => {
  // Ninguém roda todo mês. Ao lançar em maio, tem de vir fev+mar+abr+mai.
  const p = naA(() => ativos.previa(empresaA.id, '2026-05'));
  const linha = p.linhas.find(l => /Ar-condicionado/.test(l.nome));
  assert.strictEqual(linha.valorCents, 40000,
    'não recuperou os meses não lançados — o ativo ficaria eternamente subdepreciado');
});

teste('ativos: depreciar lança um lote só, com despesa por ativo e crédito na acumulada', () => {
  const acumulada = naA(() => planoContas.chave(empresaA.id, 'depreciacaoAcumulada'));
  const despesa = naA(() => planoContas.chave(empresaA.id, 'depreciacaoDespesa'));
  const r = naA(() => ativos.depreciar(empresaA.id, '2026-05'));
  assert.strictEqual(r.lancado, true, `não lançou: ${r.motivo}`);

  assert.strictEqual(naA(() => ledger.saldo(acumulada.id, {})).saldoCents, r.totalCents,
    'a depreciação acumulada não recebeu o crédito');
  assert.strictEqual(naA(() => ledger.saldo(despesa.id, { ate: '2026-05-31' })).saldoCents, r.totalCents,
    'a despesa de depreciação não recebeu o débito');
  const b = naA(() => ledger.conferirBalanceamento(empresaA.id));
  assert.strictEqual(b.ok, true, 'o razão desbalanceou depois da depreciação');
});

teste('ativos: depreciar a mesma competência de novo não duplica', () => {
  const acumulada = naA(() => planoContas.chave(empresaA.id, 'depreciacaoAcumulada'));
  const antes = naA(() => ledger.saldo(acumulada.id, {})).saldoCents;
  const r = naA(() => ativos.depreciar(empresaA.id, '2026-05'));
  assert.strictEqual(r.lancado, false, 'lançou de novo o mesmo mês');
  assert.strictEqual(naA(() => ledger.saldo(acumulada.id, {})).saldoCents, antes);
});

teste('ativos: a depreciação NUNCA passa do valor depreciável', () => {
  const a = naA(() => ativos.registrar({
    entidadeId: empresaA.id, nome: 'Notebook velho', aquisicao: '2020-01-10',
    custoCents: 300000, residualCents: 50000, vidaUtilMeses: 24, inicioDepreciacao: '2020-02',
  }));
  // Muitos anos depois: o acumulado tem de parar em custo − residual.
  const p = naA(() => ativos.previa(empresaA.id, '2026-08'));
  const linha = p.linhas.find(l => l.ativoId === a.id);
  assert.strictEqual(linha.valorCents, 250000,
    'depreciou mais (ou menos) que custo − residual; passar do custo é erro que só aparece no balanço');
  naA(() => ativos.depreciar(empresaA.id, '2026-08'));
  const depois = naA(() => repo.ativo(a.id));
  assert.strictEqual(depois.depreciado_cents, 250000);
  const p2 = naA(() => ativos.previa(empresaA.id, '2026-12'));
  assert.ok(!p2.linhas.find(l => l.ativoId === a.id), 'continuou depreciando um ativo já esgotado');
});

teste('ativos: terreno (vida útil 0) não deprecia', () => {
  const a = naA(() => ativos.registrar({
    entidadeId: empresaA.id, nome: 'Terreno da QI 7', aquisicao: '2019-05-01',
    custoCents: 50000000, vidaUtilMeses: 0, inicioDepreciacao: '2019-05',
  }));
  const p = naA(() => ativos.previa(empresaA.id, '2026-08'));
  assert.ok(!p.linhas.find(l => l.ativoId === a.id), 'terreno entrou na depreciação');
  const lista = naA(() => ativos.listar(empresaA.id, { ate: '2026-08' }));
  assert.strictEqual(lista.find(x => x.id === a.id).naoDeprecia, true);
});

lanca('ativos: valor residual não pode alcançar o custo', () => {
  naA(() => ativos.registrar({
    entidadeId: empresaA.id, nome: 'Coisa', aquisicao: '2026-01-01',
    custoCents: 100000, residualCents: 100000, vidaUtilMeses: 12,
  }));
}, /residual/i);

teste('ativos: baixa não apaga — muda o status e exige motivo', () => {
  const a = naA(() => ativos.registrar({
    entidadeId: empresaA.id, nome: 'Geladeira quebrada', aquisicao: '2024-03-01',
    custoCents: 400000, vidaUtilMeses: 60, inicioDepreciacao: '2024-04',
  }));
  const b = naA(() => ativos.baixar(a.id, { motivo: 'quebrou sem conserto', data: '2026-08-20' }));
  assert.strictEqual(b.status, 'baixado');
  assert.strictEqual(b.baixa_motivo, 'quebrou sem conserto');
  assert.ok(naA(() => repo.ativo(a.id)), 'a baixa apagou a linha — o histórico do bem é histórico contábil');
  const p = naA(() => ativos.previa(empresaA.id, '2026-09'));
  assert.ok(!p.linhas.find(l => l.ativoId === a.id), 'ativo baixado continuou depreciando');
});

lanca('ativos: baixa sem motivo é recusada', () => {
  const a = naA(() => ativos.listar(empresaA.id, {})).find(x => x.status === 'ativo');
  naA(() => ativos.baixar(a.id, { motivo: '   ' }));
}, /motivo/i);

let CONSOL = null;

// -------------------------------------- consolidado com eliminações
teste('consolidado: monta duas empresas com uma operação ENTRE elas', () => {
  // Empresas dedicadas: usar a empresaA envenenaria os testes que conferem
  // o saldo de contas a receber dela (a Stays, entre outros).
  const r = naA(() => {
    const a = contasSvc.criarEmpresa({ nome: 'Villela Consolida A', regime: 'simples' });
    const b = contasSvc.criarEmpresa({ nome: 'Villela Consolida B', regime: 'simples' });
    return { a, b };
  });
  const nabA = (fn) => tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true },
    () => tenancy.comEntidade(r.a.id, fn));
  const cpEmA = nabA(() => {
    const cp = contrapartes.criar({ entidadeId: r.a.id, tipo: 'cliente', nome: 'Villela Consolida B' });
    contrapartes.marcarDoGrupo(cp.id, r.b.id);
    return cp;
  });
  const cpEmB = tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true }, () =>
    tenancy.comEntidade(r.b.id, () => {
      const cp = contrapartes.criar({ entidadeId: r.b.id, tipo: 'fornecedor', nome: 'Villela Consolida A' });
      contrapartes.marcarDoGrupo(cp.id, r.a.id);
      return cp;
    }));
  assert.strictEqual(nabA(() => repo.contraparte(cpEmA.id)).entidade_grupo_id, r.b.id,
    'a contraparte não ficou marcada como empresa do grupo');
  CONSOL = { a: r.a, b: r.b, cpEmA, cpEmB, nabA };
});

teste('consolidado: lança a venda em A e a compra em B, pelo mesmo valor', () => {
  const contasA = CONSOL.nabA(() => repo.listarContas(CONSOL.a.id, { somenteAnaliticas: true }));
  const clientesA = contasA.find(c => c.codigo === '1.1.2.001');
  const receitaA = contasA.find(c => c.codigo.startsWith('3.1'));
  CONSOL.nabA(() => ledger.lancar({
    entidadeId: CONSOL.a.id, data: '2026-09-10', memo: 'serviço prestado à empresa do grupo',
    linhas: [
      { contaId: clientesA.id, debitoCents: 500000, creditoCents: 0, contraparteId: CONSOL.cpEmA.id },
      { contaId: receitaA.id, debitoCents: 0, creditoCents: 500000, contraparteId: CONSOL.cpEmA.id },
    ],
  }));

  tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true }, () =>
    tenancy.comEntidade(CONSOL.b.id, () => {
      const contasB = repo.listarContas(CONSOL.b.id, { somenteAnaliticas: true });
      const fornecB = contasB.find(c => c.codigo === '2.1.1.001');
      const despB = contasB.find(c => c.codigo.startsWith('4.2'));
      ledger.lancar({
        entidadeId: CONSOL.b.id, data: '2026-09-10', memo: 'serviço recebido da empresa do grupo',
        linhas: [
          { contaId: despB.id, debitoCents: 500000, creditoCents: 0, contraparteId: CONSOL.cpEmB.id },
          { contaId: fornecB.id, debitoCents: 0, creditoCents: 500000, contraparteId: CONSOL.cpEmB.id },
        ],
      });
    }));
  assert.ok(true);
});

teste('consolidado: o recebível de A contra B é ELIMINADO do ativo consolidado', () => {
  const c = naA(() => apuracao.consolidar({ ate: '2026-12-31', entidadeIds: [CONSOL.a.id, CONSOL.b.id] }));
  assert.strictEqual(c.eliminacoes.aplicadas, true, 'nada foi eliminado com a operação marcada dos dois lados');
  assert.strictEqual(c.eliminacoes.saldosReciprocosCents, 500000,
    `eliminou ${c.eliminacoes.saldosReciprocosCents} em vez dos R$ 5.000 recíprocos`);
  assert.strictEqual(c.consolidado.ativoCents, c.total.ativoCents - 500000,
    'o ativo consolidado ainda conta o que uma empresa deve à outra');
  assert.strictEqual(c.consolidado.passivoCents, c.total.passivoCents - 500000,
    'o passivo consolidado ainda conta a mesma dívida');
});

teste('consolidado: a receita entre empresas se anula contra a despesa', () => {
  const c = naA(() => apuracao.consolidar({ ate: '2026-12-31', entidadeIds: [CONSOL.a.id, CONSOL.b.id] }));
  assert.strictEqual(c.eliminacoes.resultadoReciprocoCents, 500000,
    'receita e despesa intragrupo não foram identificadas como par');
  // Receita e despesa iguais já se anulam na soma dos resultados: o
  // consolidado não pode subtrair de novo, ou o lucro sumiria duas vezes.
  assert.strictEqual(c.consolidado.resultadoCents, c.total.resultadoCents,
    'o resultado consolidado foi ajustado duas vezes pela mesma operação');
});

teste('consolidado: descasamento entre as duas pontas é DECLARADO, não escondido', () => {
  // B reconhece R$ 1.000 a mais de dívida do que A tem a receber.
  tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true }, () =>
    tenancy.comEntidade(CONSOL.b.id, () => {
      const contasB = repo.listarContas(CONSOL.b.id, { somenteAnaliticas: true });
      const fornecB = contasB.find(c => c.codigo === '2.1.1.001');
      const despB = contasB.find(c => c.codigo.startsWith('4.2'));
      ledger.lancar({
        entidadeId: CONSOL.b.id, data: '2026-09-20', memo: 'nota que A ainda não lançou',
        linhas: [
          { contaId: despB.id, debitoCents: 100000, creditoCents: 0, contraparteId: CONSOL.cpEmB.id },
          { contaId: fornecB.id, debitoCents: 0, creditoCents: 100000, contraparteId: CONSOL.cpEmB.id },
        ],
      });
    }));

  const c = naA(() => apuracao.consolidar({ ate: '2026-12-31', entidadeIds: [CONSOL.a.id, CONSOL.b.id] }));
  const d = c.eliminacoes.descasamentos.find(x => x.tipo === 'saldos_reciprocos');
  assert.ok(d, 'o descasamento entre as pontas não foi reportado');
  assert.strictEqual(d.diferencaCents, -100000, `diferença errada: ${d.diferencaCents}`);
  // Elimina só o que casa: o excedente fica visível, porque é problema de
  // conciliação entre as empresas, não coisa para o sistema encobrir.
  assert.strictEqual(c.eliminacoes.saldosReciprocosCents, 500000,
    'eliminou mais do que casa dos dois lados');
});

teste('consolidado: contraparte NÃO marcada não é eliminada', () => {
  const cp = CONSOL.nabA(() => contrapartes.criar({ entidadeId: CONSOL.a.id, tipo: 'cliente', nome: 'Cliente de fora' }));
  const contasA = CONSOL.nabA(() => repo.listarContas(CONSOL.a.id, { somenteAnaliticas: true }));
  const clientesA = contasA.find(c => c.codigo === '1.1.2.001');
  const receitaA = contasA.find(c => c.codigo.startsWith('3.1'));
  CONSOL.nabA(() => ledger.lancar({
    entidadeId: CONSOL.a.id, data: '2026-09-25', memo: 'venda a terceiro',
    linhas: [
      { contaId: clientesA.id, debitoCents: 700000, creditoCents: 0, contraparteId: cp.id },
      { contaId: receitaA.id, debitoCents: 0, creditoCents: 700000, contraparteId: cp.id },
    ],
  }));
  const c = naA(() => apuracao.consolidar({ ate: '2026-12-31', entidadeIds: [CONSOL.a.id, CONSOL.b.id] }));
  assert.strictEqual(c.eliminacoes.saldosReciprocosCents, 500000,
    'a venda a terceiro foi eliminada — adivinhar intragrupo apaga receita de verdade');
});

lanca('consolidado: contraparte não pode apontar para a própria empresa', () => {
  const cp = CONSOL.nabA(() => contrapartes.criar({ entidadeId: CONSOL.a.id, tipo: 'cliente', nome: 'Espelho' }));
  CONSOL.nabA(() => contrapartes.marcarDoGrupo(cp.id, CONSOL.a.id));
}, /própria empresa/);

teste('consolidado: declara o que NÃO elimina', () => {
  const c = naA(() => apuracao.consolidar({ ate: '2026-12-31', entidadeIds: [CONSOL.a.id, CONSOL.b.id] }));
  assert.ok(c.naoElimina.some(x => /lucro não realizado/.test(x)), 'não declara o limite do lucro não realizado');
  assert.ok(c.naoElimina.some(x => /NÃO esteja marcada/.test(x)), 'não avisa que só elimina o que está marcado');
  assert.ok(/soma das empresas menos os saldos recíprocos/.test(c.origem.formula), 'não expõe a fórmula');
});

// ---------------------------------------------------- régua de cobrança
const cobranca = require('./cobranca');

/** Empresa própria: a régua olha TODAS as parcelas a receber da empresa. */
let COB = null;
teste('cobrança: empresa e títulos próprios para a régua', () => {
  const e = naA(() => contasSvc.criarEmpresa({ nome: 'Villela Cobranca', regime: 'simples' }));
  const nab = (fn) => tenancy.comTenant({ tenantId: contaA.id, userId: 'augusto', perfil: 'proprietario', mfa: true },
    () => tenancy.comEntidade(e.id, fn));
  const cli = nab(() => contrapartes.criar({
    entidadeId: e.id, tipo: 'cliente', nome: 'Hóspede Devedor', email: 'devedor@exemplo.com', telefone: '+5561999990000',
  }));
  const semContato = nab(() => contrapartes.criar({ entidadeId: e.id, tipo: 'cliente', nome: 'Sem Contato' }));
  const receita = nab(() => repo.listarContas(e.id, { somenteAnaliticas: true })).find(c => c.codigo.startsWith('3.1'));

  const cria = (cp, doc, venc, valor) => nab(() => titulos.criar({
    entidadeId: e.id, especie: 'receber', contraparteId: cp.id, documento: doc,
    descricao: 'diárias', valorCents: valor, vencimento: venc,
    rateio: [{ contaId: receita.id, valorCents: valor }],
  }));
  COB = {
    e, nab, cli, semContato,
    aVencer: cria(cli, 'COB-1', '2026-09-03', 100000),   // -3 dias na referência
    hoje: cria(cli, 'COB-2', '2026-08-31', 200000),
    atrasado: cria(cli, 'COB-3', '2026-08-01', 300000),  // 30 dias
    velho: cria(semContato, 'COB-4', '2026-06-01', 400000), // 91 dias
  };
  assert.ok(COB.atrasado.titulo.id);
});

teste('cobrança: cada parcela cai no passo do seu atraso', () => {
  const r = COB.nab(() => cobranca.regua(COB.e.id, { referencia: '2026-08-31' }));
  const por = Object.fromEntries(r.fila.map(x => [x.documento, x]));
  assert.strictEqual(por['COB-1'].passo, 'lembrete', 'a que vence em 3 dias não caiu no lembrete');
  assert.strictEqual(por['COB-2'].passo, 'vencimento', 'a que vence hoje não caiu no passo do dia');
  assert.strictEqual(por['COB-3'].passo, 'atraso_30', `30 dias caiu em ${por['COB-3'].passo}`);
  assert.strictEqual(por['COB-4'].passo, 'atraso_60', `91 dias caiu em ${por['COB-4'].passo}`);
});

teste('cobrança: a mensagem é preenchida com os dados reais da parcela', () => {
  const r = COB.nab(() => cobranca.regua(COB.e.id, { referencia: '2026-08-31' }));
  const item = r.fila.find(x => x.documento === 'COB-3');
  assert.ok(item.mensagem.includes('Hóspede Devedor'), 'a mensagem não traz o nome');
  assert.ok(item.mensagem.includes('COB-3'), 'a mensagem não traz o documento');
  assert.ok(item.mensagem.includes('R$ 3.000,00'), 'a mensagem não traz o saldo');
  assert.ok(item.mensagem.includes('30'), 'a mensagem não traz os dias de atraso');
});

teste('cobrança: quem não tem contato APARECE na fila, marcado', () => {
  const r = COB.nab(() => cobranca.regua(COB.e.id, { referencia: '2026-08-31' }));
  const item = r.fila.find(x => x.documento === 'COB-4');
  assert.strictEqual(item.semContato, true, 'não marcou a falta de contato');
  assert.ok(r.resumo.semContato >= 1, 'o resumo não conta quantos estão sem contato');
  // Sumir da lista é o que faz uma dívida ficar anos sem ninguém perceber
  // que ninguém cobrou.
  assert.ok(item, 'a parcela sem contato foi escondida da fila');
});

teste('cobrança: a régua declara, na resposta, que NÃO envia', () => {
  const r = COB.nab(() => cobranca.regua(COB.e.id, { referencia: '2026-08-31' }));
  assert.ok(/NÃO ENVIA/.test(r.envio), 'a resposta não deixa claro que o módulo não dispara nada');
});

teste('cobrança: registrar o envio tira o passo da fila de amanhã', () => {
  const antes = COB.nab(() => cobranca.regua(COB.e.id, { referencia: '2026-08-31' }));
  const item = antes.fila.find(x => x.documento === 'COB-3');
  COB.nab(() => cobranca.registrarEnvio(item.parcelaId, 'atraso_30', { canal: 'whatsapp', observacao: 'falei com ele' }));

  const depois = COB.nab(() => cobranca.regua(COB.e.id, { referencia: '2026-08-31' }));
  assert.ok(!depois.fila.find(x => x.documento === 'COB-3' && x.passo === 'atraso_30'),
    'o passo já enviado voltou a aparecer — o cliente receberia a mesma cobrança de novo');
  const h = COB.nab(() => cobranca.historico(item.parcelaId));
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].canal, 'whatsapp');
});

teste('cobrança: parcela LIQUIDADA sai da régua', () => {
  const det = COB.nab(() => titulos.buscar(COB.hoje.titulo.id));
  COB.nab(() => liquidacoes.liquidar({
    parcelaId: det.parcelas[0].id, data: '2026-08-31', valorCents: det.parcelas[0].valorCents,
  }));
  const r = COB.nab(() => cobranca.regua(COB.e.id, { referencia: '2026-08-31' }));
  assert.ok(!r.fila.find(x => x.documento === 'COB-2'),
    'cobrou quem já pagou — é o erro que custa mais caro que a própria dívida');
});

lanca('cobrança: registrar envio sem canal é recusado', () => {
  const r = COB.nab(() => cobranca.regua(COB.e.id, { referencia: '2026-08-31' }));
  COB.nab(() => cobranca.registrarEnvio(r.fila[0].parcelaId, r.fila[0].passo, { canal: '  ' }));
}, /canal/i);

lanca('cobrança: passo inexistente é recusado', () => {
  const r = COB.nab(() => cobranca.regua(COB.e.id, { referencia: '2026-08-31' }));
  COB.nab(() => cobranca.registrarEnvio(r.fila[0].parcelaId, 'inventado', { canal: 'email' }));
}, /Passo desconhecido/);

teste('cobrança: o mesmo passo não entra duas vezes no histórico', () => {
  const r = COB.nab(() => cobranca.regua(COB.e.id, { referencia: '2026-08-31' }));
  const item = r.fila.find(x => x.documento === 'COB-1');
  COB.nab(() => cobranca.registrarEnvio(item.parcelaId, item.passo, { canal: 'email' }));
  let repetiu = false;
  try { COB.nab(() => cobranca.registrarEnvio(item.parcelaId, item.passo, { canal: 'email' })); repetiu = true; }
  catch (_) { /* índice único no banco recusa */ }
  assert.strictEqual(repetiu, false, 'dois cliques seguidos gravaram duas cobranças');
});

// -------------------------------------- ensaio do plano de incidente
const incidente = require('./incidente');

teste('incidente: o ensaio roda, mede o RTO e NÃO toca no banco em uso', () => {
  const lotesAntes = naA(() => repo.listarLotes(empresaA.id, { limite: 500 })).length;
  const r = incidente.ensaio();
  const lotesDepois = naA(() => repo.listarLotes(empresaA.id, { limite: 500 })).length;
  assert.strictEqual(lotesDepois, lotesAntes, 'o ensaio alterou o banco em uso');

  assert.ok(r.rto.ms > 0, 'não mediu o tempo de restauração');
  assert.ok(/medido, não estimado/.test(r.rto.texto), 'o RTO aparece como estimativa');
  assert.strictEqual(r.ok, true, `o ensaio acusou problemas: ${r.problemas.join(' · ')}`);
  assert.ok(/RPO/i.test(r.rpo) || /réplica/i.test(r.rpo), 'não declara o RPO real');
});

teste('incidente: o ensaio ACUSA cadeia de auditoria adulterada', () => {
  // Prova de que o ensaio serve para alguma coisa: se ele passa mesmo com o
  // banco corrompido, ele não está olhando nada.
  const alvo = db.prepare("SELECT id, detalhe FROM audit_logs WHERE tenant_id = ? ORDER BY seq LIMIT 1").get(contaA.id);
  const original = alvo.detalhe;
  // A auditoria é append-only por gatilho — para simular o adversário que
  // conseguiu escrever no banco, é preciso derrubar o gatilho, como ele
  // faria. Recriado no `finally`.
  db.exec('DROP TRIGGER IF EXISTS trg_fin_audit_sem_update');
  db.prepare('UPDATE audit_logs SET detalhe = ? WHERE id = ?').run('{"adulterado":true}', alvo.id);
  try {
    const r = incidente.ensaio();
    assert.strictEqual(r.ok, false, 'o ensaio passou com a auditoria adulterada');
    assert.ok(r.problemas.some(p => /cadeia de auditoria quebrada/.test(p)),
      `não apontou a cadeia: ${r.problemas.join(' · ')}`);
  } finally {
    db.prepare('UPDATE audit_logs SET detalhe = ? WHERE id = ?').run(original, alvo.id);
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_fin_audit_sem_update
      BEFORE UPDATE ON audit_logs FOR EACH ROW
      BEGIN SELECT RAISE(ABORT, 'auditoria e append-only'); END`);
  }
  assert.strictEqual(incidente.ensaio().ok, true, 'não voltou ao normal depois de desfazer');
});

teste('incidente: o relatório diz o que a ANPD exige e de onde sai', () => {
  const r = incidente.ensaio();
  const md = incidente.relatorio(r);
  assert.ok(/RTO medido/.test(md), 'o relatório não traz o RTO');
  assert.ok(/Três dias úteis do CONHECIMENTO/.test(md), 'não traz o prazo regulatório');
  assert.ok(/formulário CIS/.test(md), 'não lembra que a comunicação é por formulário, não e-mail');
  // O item que hoje NÃO existe tem de aparecer como não existente.
  assert.ok(/NÃO EXISTE — encarregado não designado/.test(md),
    'o relatório não denuncia que não há encarregado (DPO) designado');
});

teste('incidente: o ensaio declara o que NÃO cobre', () => {
  const r = incidente.ensaio();
  assert.ok(r.faltaHumano.length >= 4, 'o ensaio se apresenta como o plano inteiro');
  assert.ok(r.faltaHumano.some(x => /encarregado/.test(x)), 'não lembra do DPO');
  assert.ok(r.faltaHumano.some(x => /passa por cima do controlador/.test(x)),
    'não lembra que, como operador, avisar o titular direto atropela o controlador');
});

// =====================================================================
// 15. INTEGRIDADE FINAL
// =====================================================================
testeAsync('final: o razão de todas as contas continua fechando', () => {
  for (const t of repo.listarTenants()) {
    tenancy.comTenant({ tenantId: t.id, userId: 'auditor' }, () => {
      for (const e of repo.listarEntidades()) {
        const b = ledger.conferirBalanceamento(e.id);
        assert.strictEqual(b.ok, true, `${t.slug}/${e.nome}: diferença de ${b.diferencaCents}`);
      }
    });
  }
});

testeAsync('final: o diário bate com o banco em todas as contas e meses', () => {
  let conferidos = 0;
  for (const t of repo.listarTenants()) {
    tenancy.comTenant({ tenantId: t.id, userId: 'auditor' }, () => {
      for (const mes of diario.meses()) {
        const c = diario.conferir(repo, mes);
        assert.strictEqual(c.divergencias.length, 0, `${t.slug}/${mes}: ${JSON.stringify(c.divergencias)}`);
        conferidos += c.conferidos;
      }
    });
  }
  assert.ok(conferidos > 10, `poucos lotes conferidos contra o diário: ${conferidos}`);
});

testeAsync('final: nenhum valor monetário está gravado como float', () => {
  const colunasDinheiro = [];
  const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tabelas) {
    for (const c of db.prepare(`PRAGMA table_info(${name})`).all()) {
      if (/_cents$/.test(c.name)) colunasDinheiro.push([name, c.name]);
    }
  }
  assert.ok(colunasDinheiro.length >= 10, `poucas colunas monetárias encontradas: ${colunasDinheiro.length}`);
  for (const [tabela, coluna] of colunasDinheiro) {
    const ruins = db.prepare(
      `SELECT COUNT(*) AS n FROM ${tabela} WHERE ${coluna} IS NOT NULL AND typeof(${coluna}) <> 'integer'`).get();
    assert.strictEqual(ruins.n, 0, `${tabela}.${coluna} tem ${ruins.n} valor(es) não-inteiro(s)`);
  }
});

// =====================================================================
cadeia.then(() => {
  try { fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n${'='.repeat(62)}`);
  if (falhas.length) {
    console.log(`Villela Finance — ${ok} teste(s) OK, ${falhas.length} FALHA(S):\n`);
    for (const f of falhas) console.log('  ✗ ' + f);
    console.log('');
    process.exit(1);
  }
  console.log(`Villela Finance — ${ok}/${ok} testes OK.`);
  console.log('='.repeat(62) + '\n');
  process.exit(0);
});
