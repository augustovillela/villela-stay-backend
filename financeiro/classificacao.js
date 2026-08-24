// =====================================================================
// Villela Finance — classificação sugerida (motor determinístico).
//
// Regra, não IA. A meta de "95% de correspondência automática" se alcança
// com regras que o usuário entende, corrige e vê aprender — não com um
// modelo que acerta e ninguém sabe por quê. A sugestão sempre carrega
// POR QUE foi feita e QUAL regra a fez; aceitar ou recusar realimenta a
// contagem de acertos daquela regra.
//
// IA generativa pode, no futuro, PROPOR regras novas a partir do que o
// usuário classificou à mão. Ela não classifica sozinha e não escreve no
// razão — ver ARCHITECTURE.md, seção "IA".
// =====================================================================
'use strict';
const repo = require('./repo');
const auditoria = require('./auditoria');

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Confiança mínima para a sugestão poder ser aceita em massa. */
const CONFIANCA_ALTA = 85;

/**
 * Avalia as regras contra uma transação. Devolve a melhor sugestão ou
 * null. Empate resolve pela prioridade e, dentro dela, pelo histórico de
 * acertos — regra que erra muito perde para regra que acerta.
 */
function avaliar(transacao, regras) {
  const desc = semAcento(transacao.descricao + ' ' + (transacao.contraparte_nome || ''));
  const valor = Math.abs(transacao.valor_cents);
  const entrada = transacao.valor_cents > 0;

  const candidatas = [];
  for (const r of regras) {
    if (r.sentido === 'entrada' && !entrada) continue;
    if (r.sentido === 'saida' && entrada) continue;
    if (r.valor_min_cents && valor < r.valor_min_cents) continue;
    if (r.valor_max_cents && valor > r.valor_max_cents) continue;
    const padrao = semAcento(r.padrao);
    if (padrao && !desc.includes(padrao)) continue;
    if (!padrao && !r.valor_min_cents && !r.valor_max_cents) continue;   // regra vazia não casa com tudo

    // Padrão mais específico (mais longo) vale mais; regra que já errou
    // muito perde confiança efetiva.
    const total = r.acertos + r.erros;
    const taxa = total >= 5 ? r.acertos / total : 1;
    const confiancaEfetiva = Math.round(r.confianca * taxa);
    candidatas.push({ regra: r, especificidade: padrao.length, confiancaEfetiva });
  }
  if (!candidatas.length) return null;

  candidatas.sort((a, b) =>
    a.regra.prioridade - b.regra.prioridade ||
    b.confiancaEfetiva - a.confiancaEfetiva ||
    b.especificidade - a.especificidade);

  const melhor = candidatas[0];
  const conta = melhor.regra.conta_id ? repo.contaPorId(melhor.regra.conta_id) : null;
  if (!conta) return null;

  return {
    regraId: melhor.regra.id,
    regraNome: melhor.regra.nome,
    contaId: conta.id,
    contaCodigo: conta.codigo,
    contaNome: conta.nome,
    centroCustoId: melhor.regra.centro_custo_id || '',
    contraparteId: melhor.regra.contraparte_id || '',
    confianca: melhor.confiancaEfetiva,
    alta: melhor.confiancaEfetiva >= CONFIANCA_ALTA,
    // A frase que aparece na tela ao lado da sugestão.
    motivo: melhor.regra.padrao
      ? `A descrição contém "${melhor.regra.padrao}" (regra "${melhor.regra.nome}").`
      : `Faixa de valor da regra "${melhor.regra.nome}".`,
    alternativas: candidatas.slice(1, 4).map(c => ({
      regraId: c.regra.id, contaId: c.regra.conta_id, confianca: c.confiancaEfetiva, regraNome: c.regra.nome,
    })),
  };
}

/** Calcula e grava a sugestão de uma transação. Nível 1: reversível. */
function sugerirPara(transacao) {
  const regras = repo.listarRegras(transacao.entidade_id);
  const sugestao = avaliar(transacao, regras);
  if (!sugestao) return null;
  repo.atualizarTransacao(transacao.id, { sugestao, status: 'sugerida' });
  return sugestao;
}

/** Reprocessa as transações ainda não conciliadas de uma entidade. */
function reprocessar(entidadeId) {
  const pendentes = repo.listarTransacoes(entidadeId, { status: 'nova', limite: 1000 })
    .concat(repo.listarTransacoes(entidadeId, { status: 'sugerida', limite: 1000 }));
  let sugeridas = 0, altas = 0;
  for (const t of pendentes) {
    const s = sugerirPara(t);
    if (s) { sugeridas++; if (s.alta) altas++; }
  }
  return { avaliadas: pendentes.length, sugeridas, altaConfianca: altas };
}

/**
 * Aprende com uma classificação manual: cria (ou reforça) uma regra a
 * partir do termo mais distintivo da descrição. Nasce com confiança
 * moderada — ela sobe sozinha conforme acerta.
 */
function aprender({ entidadeId, transacao, contaId, centroCustoId = '', contraparteId = '' }) {
  const termo = termoDistintivo(transacao.descricao);
  if (!termo) return null;

  const existentes = repo.listarRegras(entidadeId);
  const ja = existentes.find(r => semAcento(r.padrao) === semAcento(termo) && r.conta_id === contaId);
  if (ja) { repo.registrarAcertoRegra(ja.id, true); return ja; }

  const regra = repo.criarRegra({
    entidadeId,
    nome: `Aprendida: ${termo}`,
    padrao: termo,
    sentido: transacao.valor_cents > 0 ? 'entrada' : 'saida',
    contaId, centroCustoId, contraparteId,
    confianca: 70,
    prioridade: 50,
    origem: 'aprendida',
  });
  auditoria.registrar('regra.criar', {
    objetoTipo: 'regra', objetoId: regra.id,
    motivo: 'aprendida a partir de classificação manual',
    detalhe: { padrao: termo, conta_id: contaId },
  });
  return regra;
}

// Palavras que não distinguem nada num extrato brasileiro.
const RUIDO = new Set([
  'pagamento', 'pgto', 'compra', 'debito', 'credito', 'transferencia', 'transf', 'pix',
  'ted', 'doc', 'tarifa', 'cartao', 'boleto', 'recebimento', 'deposito', 'saque',
  'enviado', 'recebido', 'para', 'de', 'da', 'do', 'com', 'ltda', 'me', 'sa', 'eireli',
]);

/** Termo mais provável de identificar o fornecedor na descrição. */
function termoDistintivo(descricao) {
  const palavras = semAcento(descricao)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(p => p.length >= 4 && !RUIDO.has(p) && !/^\d+$/.test(p));
  if (!palavras.length) return '';
  // A mais longa costuma ser o nome do estabelecimento.
  return palavras.sort((a, b) => b.length - a.length)[0];
}

module.exports = { avaliar, sugerirPara, reprocessar, aprender, termoDistintivo, CONFIANCA_ALTA, semAcento };
