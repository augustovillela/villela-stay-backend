// =====================================================================
// Villela Finance — consultas patrimoniais periodicas.
//
// Este modulo organiza a auditoria; ele NAO finge atravessar gov.br,
// CAPTCHA, certificado ou 2FA. Fontes publicas podem ganhar conectores
// proprios, mas toda fonte protegida permanece como acao do titular.
// CPF/CNPJ so entra em claro nesta fronteira, e nunca sai pela API.
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const documento = require('./documento');
const dinheiro = require('./dinheiro');
const mfa = require('./mfa');
const auditoria = require('./auditoria');
const tenancy = require('./tenancy');
const { hojeISO } = require('./db');

const FONTES = [
  { id: 'bcb_svr', nome: 'Banco Central — Valores a Receber', tipos: ['pf', 'pj'], acesso: 'titular', url: 'https://valoresareceber.bcb.gov.br/publico', instrucao: 'Consulte a existência com o documento e os dados complementares. Para ver o valor e pedir devolução, o titular entra com gov.br e verificação em duas etapas.' },
  { id: 'receita_restituicao', nome: 'Receita Federal — Restituições', tipos: ['pf'], acesso: 'titular', url: 'https://www.gov.br/receitafederal/pt-br/assuntos/restituicoes-e-compensacoes/consultar-restituicao', instrucao: 'Abra Consultar restituição do imposto de renda e confira exercício, lote, banco e eventual pendência.' },
  { id: 'receita_creditos', nome: 'Receita Federal — Créditos e PER/DCOMP', tipos: ['pf', 'pj'], acesso: 'govbr', url: 'https://www.gov.br/receitafederal/pt-br/assuntos/restituicoes-e-compensacoes/consultar-restituicao', instrucao: 'Entre no serviço correspondente com a credencial do titular ou representante e consulte pedidos, compensações e pagamentos indevidos.' },
  { id: 'fgts', nome: 'Caixa — FGTS', tipos: ['pf'], acesso: 'titular', url: 'https://www.caixa.gov.br/beneficios-trabalhador/fgts/Paginas/default.aspx', instrucao: 'O titular consulta contas e modalidades no aplicativo FGTS ou canal oficial da Caixa. Não envie senha ou código ao Villela Finance.' },
  { id: 'pis_pasep', nome: 'PIS/Pasep e abono salarial', tipos: ['pf'], acesso: 'titular', url: 'https://www.gov.br/trabalho-e-emprego/pt-br/servicos/trabalhador/abono-salarial', instrucao: 'Consulte elegibilidade e pagamento no canal oficial indicado pelo Ministério do Trabalho.' },
  { id: 'inss', nome: 'INSS e Previdência', tipos: ['pf'], acesso: 'govbr', url: 'https://meu.inss.gov.br/', instrucao: 'O titular entra no Meu INSS e verifica benefícios, pagamentos, revisões e valores pendentes.' },
  { id: 'justica_federal', nome: 'Justiça Federal', tipos: ['pf', 'pj'], acesso: 'publica', url: 'https://www.cjf.jus.br/cjf', instrucao: 'Pesquisar nos TRFs aplicáveis e confirmar cada ocorrência no tribunal de origem.' },
  { id: 'justica_estadual', nome: 'Justiça Estadual', tipos: ['pf', 'pj'], acesso: 'publica', url: 'https://www.cnj.jus.br/poder-judiciario/tribunais/', instrucao: 'Pesquisar nos TJs dos estados relevantes e confirmar número, partes e movimentação na fonte oficial.' },
  { id: 'justica_trabalho', nome: 'Justiça do Trabalho', tipos: ['pf', 'pj'], acesso: 'publica', url: 'https://www.tst.jus.br/processos-do-tst', instrucao: 'Pesquisar no TST e nos TRTs aplicáveis; depósito ou alvará só conta quando constar do processo oficial.' },
  { id: 'precatorios_rpv', nome: 'Precatórios e RPVs', tipos: ['pf', 'pj'], acesso: 'publica', url: 'https://www.cnj.jus.br/programas-e-acoes/precatorios/', instrucao: 'Cruzar tribunal de origem, beneficiário e situação do pagamento. Valor do processo não é automaticamente valor disponível.' },
  { id: 'diarios_oficiais', nome: 'Diários Oficiais', tipos: ['pf', 'pj'], acesso: 'publica', url: 'https://www.in.gov.br/consulta', instrucao: 'Usar nome completo e razão social como pista; confirmar qualquer crédito no processo ou órgão responsável.' },
];

const POR_ID = Object.fromEntries(FONTES.map((f) => [f.id, f]));
const FREQUENCIAS = { manual: 0, mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
const STATUS = new Set(['confirmado', 'possivel', 'consulta_pendente', 'nada_localizado', 'atencao', 'nao_verificado']);

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

function segredoHash() {
  const s = process.env.FINANCE_SECRET_KEY || '';
  if (!s) throw erro('FINANCE_SECRET_KEY não está definida — não é seguro guardar CPF/CNPJ sem o cofre.', 503);
  return s;
}

const hashDocumento = (normalizado) => crypto.createHmac('sha256', segredoHash()).update(normalizado).digest('hex');

function mascarar(normalizado, tipo) {
  if (tipo === 'pf') return `***.***.***-${normalizado.slice(-2)}`;
  return `**.***.***/${normalizado.slice(8, 12)}-${normalizado.slice(-2)}`;
}

function fontesPara(tipo, pedidas) {
  const aplicaveis = FONTES.filter((f) => f.tipos.includes(tipo)).map((f) => f.id);
  if (!Array.isArray(pedidas) || !pedidas.length) return aplicaveis;
  const unicas = [...new Set(pedidas.map(String))];
  for (const id of unicas) if (!aplicaveis.includes(id)) throw erro(`Fonte ${id} não se aplica a este cadastro.`);
  return unicas;
}

function somarMeses(data, meses) {
  if (!meses) return '';
  const [a, m, d] = String(data || hojeISO()).slice(0, 10).split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

const proximaData = (frequencia, base = hojeISO()) => FREQUENCIAS[frequencia] ? somarMeses(base, FREQUENCIAS[frequencia]) : '';

function normalizarAlvo(a) {
  return {
    id: a.id, nome: a.nome, tipo: a.tipo, documento: a.documento_mascarado,
    frequencia: a.frequencia, fontes: JSON.parse(a.fontes || '[]'),
    proximaConsulta: a.proxima_consulta, ativo: a.ativo === 1,
    criadoEm: a.criado_em, atualizadoEm: a.atualizado_em,
  };
}

function normalizarResultado(r) {
  return {
    id: r.id, fonte: r.fonte, status: r.status, resumo: r.resumo,
    proximaAcao: r.proxima_acao, creditoRef: r.credito_ref,
    valorConfirmadoCents: r.valor_confirmado_cents,
    valorPotencialCents: r.valor_potencial_cents,
    valorConfirmado: dinheiro.formatar(r.valor_confirmado_cents),
    valorPotencial: dinheiro.formatar(r.valor_potencial_cents),
    consultadoEm: r.consultado_em,
  };
}

function criar(d) {
  const nome = String(d.nome || '').trim().slice(0, 160);
  if (nome.length < 3) throw erro('Informe o nome completo ou a razão social.');
  const doc = documento.exigir(d.documento, 'CPF/CNPJ');
  const tipo = doc.tipo === 'cpf' ? 'pf' : 'pj';
  if (d.tipo && d.tipo !== tipo) throw erro(`O documento informado é de ${tipo === 'pf' ? 'pessoa física' : 'pessoa jurídica'}.`);
  const frequencia = String(d.frequencia || 'trimestral');
  if (!(frequencia in FREQUENCIAS)) throw erro('Frequência inválida.');
  const hash = hashDocumento(doc.normalizado);
  if (repo.consultaAlvoPorHash(hash)) throw erro('Este CPF/CNPJ já está cadastrado nesta empresa.', 409);
  const fontes = fontesPara(tipo, d.fontes);
  const salvo = repo.criarConsultaAlvo({
    entidadeId: tenancy.entidadeAtual(), nome, tipo,
    documentoCifrado: mfa.cifrar(doc.normalizado), documentoHash: hash,
    documentoMascarado: mascarar(doc.normalizado, tipo), frequencia, fontes,
    // O primeiro ciclo fica vencendo hoje: a pessoa ve imediatamente o que
    // precisa consultar, em vez de esperar tres meses pela primeira rodada.
    proximaConsulta: frequencia === 'manual' ? '' : hojeISO(),
  });
  auditoria.registrar('consulta.alvo_criar', {
    objetoTipo: 'consulta_alvo', objetoId: salvo.id,
    detalhe: { nome, tipo, documento: salvo.documento_mascarado, frequencia, fontes },
  });
  return normalizarAlvo(salvo);
}

function configurar(id, d) {
  const atual = repo.consultaAlvo(id);
  if (!atual) throw erro('Cadastro de consulta não encontrado.', 404);
  const frequencia = String(d.frequencia || atual.frequencia);
  if (!(frequencia in FREQUENCIAS)) throw erro('Frequência inválida.');
  const fontes = fontesPara(atual.tipo, d.fontes || JSON.parse(atual.fontes || '[]'));
  const ativo = d.ativo === undefined ? atual.ativo === 1 : !!d.ativo;
  const proxima = ativo && frequencia !== 'manual'
    ? String(d.proximaConsulta || atual.proxima_consulta || hojeISO()).slice(0, 10) : '';
  const salvo = repo.atualizarAgendaConsulta(id, { frequencia, fontes, ativo, proximaConsulta: proxima });
  auditoria.registrar('consulta.alvo_configurar', {
    objetoTipo: 'consulta_alvo', objetoId: id,
    detalhe: { frequencia, fontes, ativo, proximaConsulta: proxima },
  });
  return normalizarAlvo(salvo);
}

function registrarResultado(alvoId, d) {
  const alvo = repo.consultaAlvo(alvoId);
  if (!alvo) throw erro('Cadastro de consulta não encontrado.', 404);
  const fonte = String(d.fonte || '');
  if (!JSON.parse(alvo.fontes || '[]').includes(fonte) || !POR_ID[fonte]) throw erro('Fonte não habilitada para este cadastro.');
  const status = String(d.status || 'nao_verificado');
  if (!STATUS.has(status)) throw erro('Status de consulta inválido.');
  let confirmado = d.valorConfirmado == null || d.valorConfirmado === '' ? 0 : dinheiro.paraCentavos(d.valorConfirmado);
  let potencial = d.valorPotencial == null || d.valorPotencial === '' ? 0 : dinheiro.paraCentavos(d.valorPotencial);
  if (confirmado < 0 || potencial < 0) throw erro('Valores de consulta não podem ser negativos.');
  if (status !== 'confirmado') confirmado = 0;
  if (status !== 'possivel') potencial = 0;
  const r = repo.registrarConsultaResultado({
    entidadeId: tenancy.entidadeAtual(), alvoId, fonte, status,
    resumo: String(d.resumo || '').trim().slice(0, 800),
    proximaAcao: String(d.proximaAcao || '').trim().slice(0, 800),
    creditoRef: String(d.creditoRef || '').trim().toLowerCase().slice(0, 160),
    valorConfirmadoCents: confirmado, valorPotencialCents: potencial,
  });
  // A rodada só termina quando TODAS as fontes escolhidas ganharam um
  // registro desde o vencimento atual. Salvar só o SVR não pode empurrar
  // Receita, Justiça e demais fontes para três meses depois.
  const fontes = JSON.parse(alvo.fontes || '[]');
  const resultados = repo.listarConsultaResultados(alvoId);
  const inicioDaRodada = alvo.proxima_consulta || hojeISO();
  const rodadaCompleta = alvo.frequencia !== 'manual' && fontes.every((id) =>
    resultados.some((x) => x.fonte === id && String(x.consultado_em).slice(0, 10) >= inicioDaRodada));
  const proxima = rodadaCompleta ? proximaData(alvo.frequencia, hojeISO()) : alvo.proxima_consulta;
  repo.atualizarAgendaConsulta(alvoId, {
    frequencia: alvo.frequencia, fontes,
    ativo: alvo.ativo === 1, proximaConsulta: proxima,
  });
  auditoria.registrar('consulta.resultado_registrar', {
    objetoTipo: 'consulta_resultado', objetoId: r.id,
    detalhe: { alvoId, fonte, status, valorConfirmadoCents: confirmado, valorPotencialCents: potencial },
  });
  return normalizarResultado(r);
}

function detalhes(id) {
  const alvo = repo.consultaAlvo(id);
  if (!alvo) throw erro('Cadastro de consulta não encontrado.', 404);
  const resultados = repo.listarConsultaResultados(id).map(normalizarResultado);
  const ultimos = {};
  for (const r of resultados) if (!ultimos[r.fonte]) ultimos[r.fonte] = r;
  const selecionadas = JSON.parse(alvo.fontes || '[]').map((fid) => ({ ...POR_ID[fid], ultimo: ultimos[fid] || null }));
  return { alvo: normalizarAlvo(alvo), fontes: selecionadas, resultados, totais: totais(resultados, true) };
}

function totais(resultados, somenteUltimos = false) {
  let lista = resultados;
  if (somenteUltimos) {
    const vistos = new Set();
    lista = resultados.filter((r) => !vistos.has(r.fonte) && vistos.add(r.fonte));
  }
  const confirmados = new Map(), potenciais = new Map();
  for (const r of lista) {
    const chave = r.creditoRef ? `credito:${r.creditoRef}` : `resultado:${r.id}`;
    if (r.status === 'confirmado') confirmados.set(chave, r.valorConfirmadoCents);
    if (r.status === 'possivel') potenciais.set(chave, r.valorPotencialCents);
  }
  const confirmadoCents = [...confirmados.values()].reduce((a, b) => a + b, 0);
  const potencialCents = [...potenciais.values()].reduce((a, b) => a + b, 0);
  return { confirmadoCents, potencialCents, confirmado: dinheiro.formatar(confirmadoCents), potencial: dinheiro.formatar(potencialCents) };
}

function painel(entidadeId) {
  const hoje = hojeISO();
  const alvos = repo.listarConsultaAlvos(entidadeId, { incluirInativos: true }).map((a) => {
    const d = detalhes(a.id);
    const pendencias = d.fontes.filter((f) => !f.ultimo || f.ultimo.status === 'consulta_pendente' || f.ultimo.status === 'nao_verificado').length;
    const acoesTitular = d.fontes.filter((f) => f.acesso !== 'publica' && (!f.ultimo || f.ultimo.status === 'consulta_pendente' || f.ultimo.status === 'nao_verificado')).length;
    return { ...d.alvo, totais: d.totais, pendencias, acoesTitular, vencida: d.alvo.ativo && !!d.alvo.proximaConsulta && d.alvo.proximaConsulta <= hoje };
  });
  const confirmadoCents = alvos.reduce((n, a) => n + a.totais.confirmadoCents, 0);
  const potencialCents = alvos.reduce((n, a) => n + a.totais.potencialCents, 0);
  return {
    alvos,
    totais: {
      confirmadoCents, potencialCents,
      confirmado: dinheiro.formatar(confirmadoCents), potencial: dinheiro.formatar(potencialCents),
    },
    resumo: {
      cadastrosAtivos: alvos.filter((a) => a.ativo).length,
      consultasVencidas: alvos.filter((a) => a.vencida).length,
      acoesDoTitular: alvos.reduce((n, a) => n + a.acoesTitular, 0),
    },
    fontes: FONTES,
    aviso: 'O aplicativo organiza e registra a auditoria. Consultas com gov.br, senha, CAPTCHA, certificado ou 2FA permanecem sob controle do titular.',
  };
}

module.exports = {
  FONTES, FREQUENCIAS, STATUS, criar, configurar, registrarResultado,
  detalhes, painel, mascarar, somarMeses, proximaData, hashDocumento,
};
