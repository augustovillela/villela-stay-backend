// Relatório diário privado de investimentos do CEO.
// Publica análise; nunca cria ordem, lance, transferência, alavancagem ou
// lançamento contábil. Conclusão exige convergência de dois motores.
'use strict';
const crypto = require('crypto');
const { j, nowISO } = require('./db');
const repo = require('./repo');
const tenancy = require('./tenancy');
const auditoria = require('./auditoria');
const acesso = require('./investimentos-acesso');
const evidenciasSvc = require('./investimentos-evidencias');
const catalogo = require('./investimentos-catalogo');
const politica = require('./investimentos-politica');
const ia = require('./investimentos-ia');

const TZ = 'America/Sao_Paulo';
const HORA = '15:00';
const CONCLUSIVAS = new Set(['comprar', 'manter', 'reduzir', 'vender', 'evitar']);

class ErroRelatorioInvestimentos extends Error {
  constructor(msg, status = 422, detalhe = null) {
    super(msg); this.name = 'ErroRelatorioInvestimentos'; this.status = status; this.detalhe = detalhe;
  }
}

function hash(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function validarPosicao(d) {
  const classes = new Set(catalogo.CLASSES.map(c => c.chave));
  const mandatos = new Set(['caixa', 'longo_prazo', 'oportunidades']);
  const nome = String(d.nome || '').trim();
  const classe = String(d.classe || '').trim();
  const mandatoChave = String(d.mandatoChave || '').trim();
  if (!nome) throw new ErroRelatorioInvestimentos('Informe o nome do ativo.', 400);
  if (!classes.has(classe)) throw new ErroRelatorioInvestimentos('Classe de ativo inválida.', 400);
  if (!mandatos.has(mandatoChave)) throw new ErroRelatorioInvestimentos('Mandato inválido.', 400);
  return {
    id: d.id || '', instrumentoId: d.instrumentoId || null, nome: nome.slice(0, 160), classe,
    ticker: String(d.ticker || '').trim().slice(0, 40), mandatoChave,
    tese: String(d.tese || '').trim().slice(0, 2000),
    observacoes: String(d.observacoes || '').trim().slice(0, 2000),
  };
}

function listarPosicoes(tenant, usuario, opts) {
  acesso.exigir(tenant, usuario);
  return repo.listarPosicoesInvestimentos(opts).map(p => ({
    id: p.id, instrumentoId: p.instrumento_id || null, classe: p.classe, nome: p.nome,
    ticker: p.ticker, mandatoChave: p.mandato_chave, tese: p.tese,
    observacoes: p.observacoes, ativo: p.ativo === 1, atualizadoEm: p.atualizado_em,
  }));
}

function salvarPosicao(tenant, usuario, dados) {
  acesso.exigir(tenant, usuario);
  const d = validarPosicao(dados || {});
  const linha = repo.salvarPosicaoInvestimentos(d);
  auditoria.registrar('investimento.posicao_acompanhamento_salvar', {
    objetoTipo: 'posicao_acompanhamento', objetoId: linha.id,
    detalhe: { classe: linha.classe, mandato: linha.mandato_chave, semValorObrigatorio: true },
  });
  return listarPosicoes(tenant, usuario).find(x => x.id === linha.id);
}

function desativarPosicao(tenant, usuario, id) {
  acesso.exigir(tenant, usuario);
  const atual = repo.posicaoInvestimentos(id);
  if (!atual) throw new ErroRelatorioInvestimentos('Posição de acompanhamento não encontrada.', 404);
  repo.desativarPosicaoInvestimentos(id);
  auditoria.registrar('investimento.posicao_acompanhamento_desativar', {
    objetoTipo: 'posicao_acompanhamento', objetoId: id,
  });
  return { ok: true };
}

function ativar(tenant, usuario, { motivo = '' } = {}) {
  const estado = acesso.exigir(tenant, usuario);
  if (!tenancy.mfaVerificado()) throw new ErroRelatorioInvestimentos('Confirme a ativação com seu segundo fator.', 403);
  if (!estado.pareceres.habilitados) {
    throw new ErroRelatorioInvestimentos('Os pareceres privados dependem das flags de habilitação e da validação jurídica registrada.', 409, estado.pareceres);
  }
  const justificativa = String(motivo || '').trim();
  if (!justificativa) throw new ErroRelatorioInvestimentos('Registre o motivo da ativação.', 400);
  const config = repo.ativarRelatoriosInvestimentos({ destinatarioId: usuario.id, hora: HORA });
  auditoria.registrar('investimento.relatorios_diarios_ativar', {
    objetoTipo: 'usuario', objetoId: usuario.id, motivo: justificativa,
    detalhe: { hora: HORA, timezone: TZ, somenteCeo: true, operacoes: false },
  });
  return apresentarConfig(config);
}

function apresentarConfig(c) {
  return c ? {
    ativos: c.relatorios_diarios_ativos === 1,
    hora: c.relatorio_diario_hora || HORA,
    timezone: c.timezone || TZ,
    ultimoDia: c.relatorio_diario_ultimo_dia || '',
    destinatarioId: c.relatorio_diario_destinatario_id || '',
    ativadosEm: c.relatorios_ativados_em || '',
  } : { ativos: false, hora: HORA, timezone: TZ, ultimoDia: '', destinatarioId: '', ativadosEm: '' };
}

function avaliarQuantitativo(posicoes, evidencias) {
  const porInstrumento = new Map();
  for (const e of evidencias.filter(x => x.aptaParaAnalise && x.instrumentoId)) {
    if (!porInstrumento.has(e.instrumentoId)) porInstrumento.set(e.instrumentoId, []);
    porInstrumento.get(e.instrumentoId).push(e);
  }
  return posicoes.map(p => {
    const fatos = porInstrumento.get(p.instrumentoId) || [];
    const preco = fatos.find(e => e.tipo === 'preco_mercado');
    const justo = fatos.find(e => e.tipo === 'valor_justo');
    if (!preco || !justo || !preco.valorMinor || !justo.valorMinor || preco.escala !== justo.escala) {
      return { id: p.id, nome: p.nome, classe: p.classe, conclusao: 'nao_conclusivo', confiancaPpm: 0,
        fundamento: 'Faltam preço atual e valor justo comparáveis em fontes ativas.',
        evidencias: fatos.map(e => e.id), lacunas: ['preco_atual', 'valor_justo', 'metodologia_verificavel'] };
    }
    const razao = preco.valorMinor / justo.valorMinor;
    let conclusao = 'manter';
    if (razao <= 0.85) conclusao = 'comprar';
    else if (razao > 1.20) conclusao = 'vender';
    else if (razao > 1.05) conclusao = 'reduzir';
    return { id: p.id, nome: p.nome, classe: p.classe, conclusao, confiancaPpm: 650_000,
      fundamento: `Preço/valor justo = ${razao.toFixed(3)} segundo evidências normalizadas.`,
      evidencias: [preco.id, justo.id], lacunas: [] };
  });
}

function conciliar(quantitativo, critico) {
  const mapa = new Map((critico.analises || []).map(x => [x.id, x]));
  return quantitativo.map(q => {
    const c = mapa.get(q.id);
    const convergiu = !!c && q.conclusao === c.conclusao && CONCLUSIVAS.has(q.conclusao);
    return {
      id: q.id, nome: q.nome, classe: q.classe,
      recomendacao: convergiu ? q.conclusao : 'nao_conclusivo',
      confiancaPpm: convergiu ? Math.min(q.confiancaPpm, c.confiancaPpm) : 0,
      fundamentoQuantitativo: q.fundamento,
      fundamentoCritico: c ? c.fundamento : 'Motor crítico indisponível ou sem resposta válida.',
      riscos: c ? c.riscos : [], lacunas: [...new Set([...(q.lacunas || []), ...((c && c.lacunas) || [])])],
      divergencia: !convergiu && q.conclusao !== 'nao_conclusivo' ? `${q.conclusao}/${c ? c.conclusao : 'sem_leitura'}` : '',
      evidencias: q.evidencias || [],
    };
  });
}

function apresentarRelatorio(linha) {
  if (!linha) return null;
  return {
    id: linha.id, dia: linha.dia_local, timezone: linha.timezone, versao: linha.versao,
    status: linha.status, recomendacoesConclusivas: linha.recomendacoes_conclusivas,
    metodologiaVersao: linha.metodologia_versao, criadoEm: linha.criado_em,
    conteudo: j.parse(linha.conteudo, {}),
  };
}

async function gerar(tenant, usuario, { agora = nowISO(), clienteIa } = {}) {
  const estado = acesso.exigir(tenant, usuario);
  if (!estado.pareceres.habilitados) throw new ErroRelatorioInvestimentos('Pareceres privados não habilitados.', 409, estado.pareceres);
  const config = repo.garantirConfigInvestimentos();
  if (config.relatorios_diarios_ativos !== 1 || config.relatorio_diario_destinatario_id !== usuario.id) {
    throw new ErroRelatorioInvestimentos('Relatórios diários ainda não foram ativados por este CEO.', 409);
  }
  const dia = partesNoFuso(agora, config.timezone || TZ).dia;
  const posicoes = listarPosicoes(tenant, usuario);
  const evidencias = evidenciasSvc.listar(tenant, usuario);
  const cobertura = acesso.cobertura(tenant, usuario);
  const base = { dia, posicoes, evidencias: evidencias.map(e => ({
    id: e.id, instrumentoId: e.instrumentoId, tipo: e.tipo, periodo: e.periodoReferencia,
    valorMinor: e.valorMinor, escala: e.escala, unidade: e.unidade, fonte: e.fonte,
    integridade: e.integridade, apta: e.aptaParaAnalise,
  })), cobertura, metodologia: politica.METODOLOGIA };
  const datasetHash = hash(base);
  const chave = `diario:${dia}:${datasetHash}:${politica.METODOLOGIA}`;
  const existente = repo.relatorioDiarioPorChave(chave);
  if (existente) return apresentarRelatorio(existente);

  const quantitativo = avaliarQuantitativo(posicoes, evidencias);
  const critico = await ia.analisar(quantitativo.map(q => ({
    id: q.id, nome: q.nome, classe: q.classe, conclusao_quantitativa: q.conclusao,
    fundamento_quantitativo: q.fundamento, evidencias: q.evidencias, lacunas: q.lacunas,
  })), { clienteImpl: clienteIa });
  const recomendacoes = conciliar(quantitativo, critico);
  const conclusivas = recomendacoes.filter(r => CONCLUSIVAS.has(r.recomendacao)).length;
  const versao = repo.proximaVersaoRelatorioDiario(dia);
  const conteudo = {
    titulo: `Parecer diário privado — ${dia}`,
    escopo: 'Exclusivo do CEO do Grupo Villela',
    aviso: 'Análise informacional. O sistema não executa operações. Qualquer decisão e implementação são exclusivamente humanas.',
    geradoEm: agora, agenda: { todosOsDias: true, hora: HORA, timezone: TZ },
    motores: {
      quantitativo: { status: 'concluido', metodologia: politica.METODOLOGIA, analises: quantitativo },
      criticoIa: critico,
    },
    recomendacoes,
    cobertura: cobertura.map(c => ({ ...c,
      conclusao: c.fontesAtivas > 0 ? 'cobertura_em_validacao' : 'nao_conclusivo',
    })),
    carteira: { itens: posicoes.length, valoresObrigatorios: false },
    salvaguardas: { ordens: false, lances: false, alavancagem: false, escritaNoRazao: false },
  };
  const linha = repo.inserirRelatorioDiarioInvestimentos({
    destinatarioId: usuario.id, diaLocal: dia, timezone: config.timezone || TZ, versao,
    datasetHash, metodologiaVersao: politica.METODOLOGIA,
    status: conclusivas ? 'publicado' : 'nao_conclusivo', recomendacoesConclusivas: conclusivas,
    conteudo, chaveIdempotencia: chave,
  });
  repo.marcarRelatorioDiarioExecutado(dia);
  auditoria.registrar('investimento.relatorio_diario_publicar', {
    objetoTipo: 'relatorio_investimentos', objetoId: linha.id,
    detalhe: { dia, versao, conclusivas, datasetHash, somenteCeo: true, operacoes: false },
  });
  return apresentarRelatorio(linha);
}

function listar(tenant, usuario, limite) {
  acesso.exigir(tenant, usuario);
  const c = repo.garantirConfigInvestimentos();
  if (c.relatorio_diario_destinatario_id && c.relatorio_diario_destinatario_id !== usuario.id) {
    throw new ErroRelatorioInvestimentos('Relatórios disponíveis somente ao CEO destinatário.', 403);
  }
  return repo.listarRelatoriosDiariosInvestimentos(limite).map(apresentarRelatorio);
}

function obter(tenant, usuario, id) {
  acesso.exigir(tenant, usuario);
  const c = repo.garantirConfigInvestimentos();
  if (c.relatorio_diario_destinatario_id && c.relatorio_diario_destinatario_id !== usuario.id) {
    throw new ErroRelatorioInvestimentos('Relatório disponível somente ao CEO destinatário.', 403);
  }
  const r = apresentarRelatorio(repo.relatorioDiarioInvestimentos(id));
  if (!r) throw new ErroRelatorioInvestimentos('Relatório não encontrado.', 404);
  return r;
}

function estado(tenant, usuario) {
  acesso.exigir(tenant, usuario);
  return { configuracao: apresentarConfig(repo.garantirConfigInvestimentos()), iaDisponivel: ia.disponivel(),
    proximaJanela: { todosOsDias: true, hora: HORA, timezone: TZ },
    operacoes: { ordens: false, lances: false, alavancagem: false, escritaNoRazao: false } };
}

function partesNoFuso(instante, timezone = TZ) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(instante)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

async function executarAgendados({ agora = new Date() } = {}) {
  const resultados = [];
  for (const tenant of repo.listarTenants().filter(t => t.interno === 1)) {
    let acessos = [];
    tenancy.comTenant({ tenantId: tenant.id, userId: 'worker-investimentos' }, () => {
      acessos = repo.listarAcessosInvestimentos().filter(a => a.ativo === 1 && a.papel === 'ceo');
    });
    for (const a of acessos) {
      const usuario = { id: a.usuario_id, nome: a.usuario_nome, email: a.usuario_email,
        perfil: a.usuario_perfil, status: 'ativo', tenant_id: tenant.id };
      try {
        const r = await tenancy.comTenant({ tenantId: tenant.id, userId: usuario.id, perfil: usuario.perfil }, async () => {
          const c = repo.garantirConfigInvestimentos();
          const local = partesNoFuso(agora, c.timezone || TZ);
          if (c.relatorios_diarios_ativos !== 1 || c.relatorio_diario_destinatario_id !== usuario.id
              || local.hora < (c.relatorio_diario_hora || HORA) || c.relatorio_diario_ultimo_dia === local.dia) return null;
          return gerar(tenant, usuario, { agora: new Date(agora).toISOString() });
        });
        if (r) resultados.push({ tenantId: tenant.id, usuarioId: usuario.id, relatorioId: r.id, status: r.status });
      } catch (e) {
        resultados.push({ tenantId: tenant.id, usuarioId: usuario.id, erro: String(e.message || e) });
      }
    }
  }
  return resultados;
}

module.exports = {
  TZ, HORA, CONCLUSIVAS, ErroRelatorioInvestimentos, validarPosicao, listarPosicoes,
  salvarPosicao, desativarPosicao, ativar, estado, avaliarQuantitativo, conciliar,
  gerar, listar, obter, partesNoFuso, executarAgendados,
};
