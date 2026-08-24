// =====================================================================
// Villela Finance — plano de contas padrão.
//
// Um plano de contas de PME brasileira, com o vertical de hospedagem por
// temporada já aberto (diárias, taxa de limpeza, comissão de canal,
// caução). É semente, não camisa de força: o assinante acrescenta,
// renomeia e desativa o que quiser. Só as contas marcadas `sistema`
// ficam protegidas, porque o motor referencia o código delas.
//
// Convenção de código: 1=ativo · 2=passivo/PL · 3=receita · 4=despesa.
// Sintética (grupo) não aceita lançamento — o trigger recusa.
//
// NÃO é conselho contábil. O regime tributário, a classificação fiscal e
// o enquadramento de cada conta são responsabilidade do contador do
// assinante — o sistema organiza, não substitui.
// =====================================================================
'use strict';
const repo = require('./repo');

const A = 'ativo', P = 'passivo', PL = 'patrimonio', R = 'receita', D = 'despesa';
const DEV = 'devedora', CRE = 'credora';

// [codigo, nome, natureza, saldo_normal, analitica, subledger, sistema]
const PADRAO = [
  ['1', 'ATIVO', A, DEV, false, '', true],
  ['1.1', 'Ativo circulante', A, DEV, false, '', true],
  ['1.1.1', 'Caixa e equivalentes', A, DEV, false, '', true],
  ['1.1.1.001', 'Caixa', A, DEV, true, 'caixa', true],
  ['1.1.2', 'Contas a receber', A, DEV, false, '', true],
  ['1.1.2.001', 'Clientes e hóspedes', A, DEV, true, 'clientes', true],
  ['1.1.2.002', 'Recebíveis de canais (OTA)', A, DEV, true, 'clientes', true],
  ['1.1.2.003', 'Recebíveis de cartão e gateway', A, DEV, true, '', true],
  ['1.1.3', 'Adiantamentos', A, DEV, false, '', false],
  ['1.1.3.001', 'Adiantamentos a fornecedores', A, DEV, true, 'fornecedores', false],
  ['1.1.4', 'Tributos a recuperar', A, DEV, false, '', false],
  ['1.1.4.001', 'Tributos a recuperar', A, DEV, true, '', false],
  ['1.2', 'Ativo não circulante', A, DEV, false, '', true],
  ['1.2.1', 'Imobilizado', A, DEV, false, '', false],
  ['1.2.1.001', 'Imóveis', A, DEV, true, '', false],
  ['1.2.1.002', 'Móveis, utensílios e eletrodomésticos', A, DEV, true, '', false],
  ['1.2.1.003', 'Benfeitorias e reformas', A, DEV, true, '', false],
  ['1.2.1.900', '(-) Depreciação acumulada', A, CRE, true, '', false],

  ['2', 'PASSIVO', P, CRE, false, '', true],
  ['2.1', 'Passivo circulante', P, CRE, false, '', true],
  ['2.1.1', 'Fornecedores', P, CRE, false, '', true],
  ['2.1.1.001', 'Fornecedores', P, CRE, true, 'fornecedores', true],
  ['2.1.2', 'Obrigações com pessoal', P, CRE, false, '', false],
  ['2.1.2.001', 'Salários e encargos a pagar', P, CRE, true, '', false],
  ['2.1.3', 'Obrigações tributárias', P, CRE, false, '', false],
  ['2.1.3.001', 'Simples Nacional a recolher', P, CRE, true, '', false],
  ['2.1.3.002', 'ISS a recolher', P, CRE, true, '', false],
  ['2.1.3.003', 'Outros tributos a recolher', P, CRE, true, '', false],
  ['2.1.4', 'Valores de terceiros', P, CRE, false, '', true],
  ['2.1.4.001', 'Cauções de hóspedes', P, CRE, true, 'clientes', true],
  ['2.1.4.002', 'Sinais e antecipações de reserva', P, CRE, true, 'clientes', true],
  ['2.1.4.003', 'Repasses a proprietários', P, CRE, true, 'fornecedores', true],
  ['2.1.5', 'Empréstimos e financiamentos', P, CRE, false, '', false],
  ['2.1.5.001', 'Empréstimos a pagar', P, CRE, true, '', false],

  ['2.3', 'PATRIMÔNIO LÍQUIDO', PL, CRE, false, '', true],
  ['2.3.1', 'Capital', PL, CRE, false, '', true],
  ['2.3.1.001', 'Capital social', PL, CRE, true, '', true],
  ['2.3.2', 'Resultados', PL, CRE, false, '', true],
  ['2.3.2.001', 'Lucros ou prejuízos acumulados', PL, CRE, true, '', true],
  ['2.3.2.002', 'Distribuição de lucros', PL, DEV, true, '', false],

  ['3', 'RECEITAS', R, CRE, false, '', true],
  ['3.1', 'Receita de hospedagem', R, CRE, false, '', true],
  ['3.1.1.001', 'Diárias', R, CRE, true, '', true],
  ['3.1.1.002', 'Taxa de limpeza', R, CRE, true, '', false],
  ['3.1.1.003', 'Eventos e day use', R, CRE, true, '', false],
  ['3.1.1.004', 'Serviços e extras ao hóspede', R, CRE, true, '', false],
  ['3.1.1.005', 'Multas e no-show retido', R, CRE, true, '', false],
  ['3.2', 'Deduções da receita', R, DEV, false, '', true],
  ['3.2.1.001', 'Comissões de canais (OTA)', R, DEV, true, '', true],
  ['3.2.1.002', 'Taxas de meio de pagamento', R, DEV, true, '', true],
  ['3.2.1.003', 'Cancelamentos e reembolsos', R, DEV, true, '', false],
  ['3.2.1.004', 'Impostos sobre a receita', R, DEV, true, '', false],
  ['3.9', 'Outras receitas', R, CRE, false, '', true],
  ['3.9.1.001', 'Receitas financeiras', R, CRE, true, '', false],
  ['3.9.1.002', 'Outras receitas', R, CRE, true, '', false],
  // Conta-espera: entrada de banco sem classificação definida. Existir com
  // nome explícito é melhor do que empurrar para "outras receitas" e
  // esquecer — o painel cobra o saldo dela.
  ['3.9.9.999', 'Entradas a classificar', R, CRE, true, '', true],

  ['4', 'DESPESAS', D, DEV, false, '', true],
  ['4.1', 'Despesas das propriedades', D, DEV, false, '', true],
  ['4.1.1.001', 'Limpeza e lavanderia', D, DEV, true, '', false],
  ['4.1.1.002', 'Manutenção e reparos', D, DEV, true, '', false],
  ['4.1.1.003', 'Enxoval e utensílios', D, DEV, true, '', false],
  ['4.1.1.004', 'Amenities e consumíveis', D, DEV, true, '', false],
  ['4.1.1.005', 'Energia elétrica', D, DEV, true, '', false],
  ['4.1.1.006', 'Água e esgoto', D, DEV, true, '', false],
  ['4.1.1.007', 'Gás', D, DEV, true, '', false],
  ['4.1.1.008', 'Internet, TV e telefonia', D, DEV, true, '', false],
  ['4.1.1.009', 'Condomínio', D, DEV, true, '', false],
  ['4.1.1.010', 'IPTU e taxas municipais', D, DEV, true, '', false],
  ['4.1.1.011', 'Seguros', D, DEV, true, '', false],
  ['4.1.1.012', 'Piscina e jardinagem', D, DEV, true, '', false],
  ['4.1.1.013', 'Aluguel de imóvel', D, DEV, true, '', false],
  ['4.2', 'Despesas administrativas', D, DEV, false, '', true],
  ['4.2.1.001', 'Pessoal e encargos', D, DEV, true, '', false],
  ['4.2.1.002', 'Pró-labore', D, DEV, true, '', false],
  ['4.2.1.003', 'Honorários contábeis', D, DEV, true, '', false],
  ['4.2.1.004', 'Honorários jurídicos', D, DEV, true, '', false],
  ['4.2.1.005', 'Software e assinaturas', D, DEV, true, '', false],
  ['4.2.1.006', 'Material de escritório', D, DEV, true, '', false],
  ['4.2.1.007', 'Viagens e deslocamento', D, DEV, true, '', false],
  ['4.3', 'Comercial e marketing', D, DEV, false, '', true],
  ['4.3.1.001', 'Publicidade e anúncios', D, DEV, true, '', false],
  ['4.3.1.002', 'Fotografia e conteúdo', D, DEV, true, '', false],
  ['4.4', 'Despesas financeiras', D, DEV, false, '', true],
  ['4.4.1.001', 'Tarifas bancárias', D, DEV, true, '', true],
  ['4.4.1.002', 'Juros e multas pagos', D, DEV, true, '', false],
  ['4.4.1.003', 'IOF e impostos financeiros', D, DEV, true, '', false],
  ['4.9', 'Outras despesas', D, DEV, false, '', true],
  ['4.9.1.001', 'Despesas diversas', D, DEV, true, '', false],
  ['4.9.9.999', 'Saídas a classificar', D, DEV, true, '', true],
];

/** Códigos que o motor referencia por nome — não podem ser apagados. */
const CHAVES = {
  caixa: '1.1.1.001',
  clientes: '1.1.2.001',
  canais: '1.1.2.002',
  gateway: '1.1.2.003',
  fornecedores: '2.1.1.001',
  caucoes: '2.1.4.001',
  sinais: '2.1.4.002',
  repasses: '2.1.4.003',
  diarias: '3.1.1.001',
  comissaoCanal: '3.2.1.001',
  taxaPagamento: '3.2.1.002',
  tarifaBancaria: '4.4.1.001',
  entradaAClassificar: '3.9.9.999',
  saidaAClassificar: '4.9.9.999',
};

const paiDe = (codigo) => {
  const partes = codigo.split('.');
  return partes.length <= 1 ? '' : partes.slice(0, -1).join('.');
};

/**
 * Semeia o plano na entidade. Idempotente: conta que já existe (pelo
 * código) é preservada como está — republicar não sobrescreve o que o
 * assinante renomeou.
 */
function semear(entidadeId) {
  const porCodigo = new Map();
  for (const c of repo.listarContas(entidadeId)) porCodigo.set(c.codigo, c);

  let criadas = 0;
  for (const [codigo, nome, natureza, saldoNormal, analitica, subledger, sistema] of PADRAO) {
    if (porCodigo.has(codigo)) continue;
    // O pai pode ter acabado de ser criado nesta mesma passada; a lista
    // está em ordem de código, então ele já está no mapa.
    let paiCodigo = paiDe(codigo);
    while (paiCodigo && !porCodigo.has(paiCodigo)) paiCodigo = paiDe(paiCodigo);
    const pai = paiCodigo ? porCodigo.get(paiCodigo) : null;
    const conta = repo.criarConta({
      entidadeId, codigo, nome, natureza, saldoNormal,
      paiId: pai ? pai.id : '',
      aceitaLancamento: analitica,
      subledger, sistema,
    });
    porCodigo.set(codigo, conta);
    criadas++;
  }
  return { criadas, total: porCodigo.size };
}

/** Resolve uma conta-chave do motor. Lança se a semeadura não rodou. */
function chave(entidadeId, nome) {
  const codigo = CHAVES[nome];
  if (!codigo) throw new Error(`Conta-chave desconhecida: ${nome}.`);
  const c = repo.contaPorCodigo(entidadeId, codigo);
  if (!c) throw new Error(`A conta ${codigo} (${nome}) não existe nesta empresa — rode a semeadura do plano de contas.`);
  return c;
};

/** Árvore para a tela: filhos aninhados, com saldo quando fornecido. */
function arvore(entidadeId, saldos = {}) {
  const contas = repo.listarContas(entidadeId);
  const nos = new Map();
  for (const c of contas) {
    nos.set(c.id, {
      id: c.id, codigo: c.codigo, nome: c.nome, natureza: c.natureza,
      saldoNormal: c.saldo_normal, analitica: c.aceita_lancamento === 1,
      subledger: c.subledger, sistema: c.sistema === 1,
      saldoCents: saldos[c.id] || 0, filhos: [],
    });
  }
  const raiz = [];
  for (const c of contas) {
    const no = nos.get(c.id);
    const pai = c.pai_id && nos.get(c.pai_id);
    if (pai) pai.filhos.push(no); else raiz.push(no);
  }
  // Saldo de sintética = soma dos filhos (pós-ordem).
  const somar = (no) => { for (const f of no.filhos) no.saldoCents += somar(f); return no.saldoCents; };
  for (const r of raiz) somar(r);
  return raiz;
}

module.exports = { PADRAO, CHAVES, semear, chave, arvore, paiDe };
