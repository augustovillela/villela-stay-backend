// =====================================================================
// Villela Legal Intelligence — ONDA LIVRO: repositório.
// Paridade com "Claude AI na Prática Jurídica" (Cap. 47 + Parte VIII).
//
// Mesmas regras do repo.js: aqui mora a validação de enum/entrada e as
// TRAVAS de negócio que o livro exige (aprovação humana antes de sair
// para o mundo). Permissão é sempre das rotas/permissoes.js.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');

// ---- helpers (mesmos idiomas do repo.js) ----
const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const cent = (v) => Math.round(Number(v || 0));
const int = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : d; };
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true') ? 1 : 0;
const fk = (v) => { const x = s(v, 40); return x === '' ? null : x; };
const arr = (v) => Array.isArray(v) ? v : [];
const valida = (valor, lista, campo) => {
  if (valor == null || valor === '') return lista.includes('') ? '' : lista[0];
  if (!lista.includes(valor)) throw new Error(`Valor inválido para ${campo}: ${valor}`);
  return valor;
};
const hoje = () => nowISO().slice(0, 10);
const maisDias = (dias, base) => {
  const d = new Date((base || hoje()) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
};
// Colunas reais de uma tabela (cache por nome — o schema é o mesmo em todo
// tenant). Serve para o patch() não tentar gravar coluna que não existe.
const _colsCache = new Map();
function colunas(tabela) {
  if (_colsCache.has(tabela)) return _colsCache.get(tabela);
  const set = new Set(db.prepare(`PRAGMA table_info(${tabela})`).all().map(r => r.name));
  if (set.size) _colsCache.set(tabela, set);
  return set;
}

// UPDATE dinâmico só com os campos enviados (evita apagar o que não veio).
// Toca `atualizado_em` apenas nas tabelas que têm a coluna, e ignora chaves
// que não são colunas — assim uma rota descuidada não derruba a requisição.
function patch(tabela, id, campos) {
  const disponiveis = colunas(tabela);
  const cols = Object.keys(campos).filter(k => campos[k] !== undefined && disponiveis.has(k));
  if (!cols.length) return 0;
  if (disponiveis.has('atualizado_em') && !cols.includes('atualizado_em')) { cols.push('atualizado_em'); campos.atualizado_em = nowISO(); }
  const sql = `UPDATE ${tabela} SET ${cols.map(c => c + ' = ?').join(', ')} WHERE id = ?`;
  return db.prepare(sql).run(...cols.map(c => campos[c]), id).changes;
}
const um = (sql, ...a) => db.prepare(sql).get(...a);
const todos = (sql, ...a) => db.prepare(sql).all(...a);

// ---- enums da onda (validados na escrita) ----
const EL = {
  origemLead: ['site', 'indicacao', 'conteudo', 'redes', 'evento', 'parceiro', 'cliente', 'outro'],
  urgencia: ['imediata', 'alta', 'normal', 'baixa'],
  podeAtender: ['sim', 'nao', 'a_avaliar'],
  estagioLead: ['novo', 'triagem', 'qualificado', 'proposta', 'contratado', 'perdido', 'descartado'],
  canalInter: ['whatsapp', 'email', 'telefone', 'reuniao', 'portal', 'outro'],
  direcao: ['entrada', 'saida'],
  modalidadeHon: ['fixo', 'mensal', 'hora', 'exito', 'misto'],
  statusProposta: ['rascunho', 'aprovada', 'enviada', 'aceita', 'recusada', 'expirada'],
  veredito: ['livre', 'atencao', 'impedido'],
  statusPesquisa: ['plano', 'coleta', 'analise', 'concluida', 'arquivada'],
  tipoAchado: ['precedente', 'norma', 'doutrina', 'enunciado'],
  hierarquia: ['vinculante', 'persuasivo', 'superado', 'indefinido'],
  posicao: ['favoravel', 'desfavoravel', 'neutro'],
  tipoNorma: ['constituicao', 'lei', 'lc', 'mp', 'decreto', 'resolucao', 'in', 'provimento', 'portaria', 'outro'],
  ambito: ['federal', 'estadual', 'municipal', 'distrital'],
  frequencia: ['diaria', 'semanal', 'mensal'],
  statusAlerta: ['novo', 'analisado', 'comunicado', 'descartado'],
  probabilidade: ['provavel', 'possivel', 'remoto'],
  situacaoFato: ['comprovado', 'alegado', 'controvertido', 'impugnado'],
  tipoProva: ['documental', 'testemunhal', 'pericial', 'digital', 'audiovisual', 'outra'],
  situacaoProva: ['a_produzir', 'juntada', 'deferida', 'indeferida', 'impugnada'],
  statusDiag: ['rascunho', 'validado'],
  recomendacaoRec: ['interpor', 'nao_interpor', 'a_decidir'],
  resultadoNeg: ['aberto', 'acordado', 'impasse', 'retirado'],
  tipoContrato: ['servicos', 'nda', 'honorarios', 'locacao', 'fornecimento', 'societario', 'outro'],
  alcada: ['coordenador', 'socio', 'comite'],
  statusContrato: ['solicitado', 'minuta', 'negociacao', 'aprovacao', 'assinatura', 'vigente', 'encerrado', 'rescindido'],
  decisaoAprov: ['pendente', 'aprovado', 'reprovado', 'com_ressalva'],
  parteObrig: ['nossa', 'contraparte', 'ambas'],
  tipoObrig: ['obrigacao', 'pagamento', 'entrega', 'renovacao', 'denuncia', 'relatorio'],
  periodicidade: ['unica', 'mensal', 'trimestral', 'semestral', 'anual'],
  statusObrig: ['pendente', 'cumprida', 'atrasada', 'dispensada'],
  nivelClausula: ['preferencial', 'aceitavel', 'inaceitavel'],
  statusFee: ['ativo', 'suspenso', 'encerrado'],
  statusInvoice: ['rascunho', 'emitida', 'enviada', 'paga', 'parcial', 'inadimplente', 'cancelada'],
  canalCobranca: ['email', 'whatsapp', 'telefone', 'carta', 'juridico'],
  statusCobranca: ['rascunho', 'aprovada', 'enviada', 'cancelada'],
  natureza: ['receita', 'despesa'],
  tipoPost: ['aviso', 'comunicado', 'noticia', 'treinamento'],
  statusPop: ['rascunho', 'vigente', 'revisao', 'arquivado'],
  statusPedido: ['aberta', 'em_andamento', 'concluida', 'recusada'],
  prioridade: ['alta', 'media', 'baixa'],
  tipoInventario: ['sistema', 'automacao', 'agente', 'integracao', 'fornecedor'],
  criticidade: ['critica', 'alta', 'media', 'baixa'],
  tipoPolitica: ['codigo_conduta', 'politica_ia', 'privacidade', 'seguranca', 'interna', 'retencao'],
  statusPolitica: ['rascunho', 'vigente', 'revisao', 'arquivada'],
  escopoRisco: ['escritorio', 'cliente', 'caso'],
  categoriaRisco: ['juridico', 'operacional', 'financeiro', 'tecnologico', 'reputacional', 'regulatorio', 'etico'],
  impacto: ['critico', 'alto', 'medio', 'baixo'],
  statusRisco: ['aberto', 'tratando', 'mitigado', 'aceito', 'fechado'],
  statusDenuncia: ['recebida', 'em_apuracao', 'procedente', 'improcedente', 'arquivada'],
  tipoTerceiro: ['fornecedor', 'parceiro', 'correspondente', 'cliente', 'contraparte'],
  resultadoDD: ['aprovado', 'aprovado_com_ressalva', 'reprovado', 'pendente'],
  baseLegal: ['consentimento', 'contrato', 'obrigacao_legal', 'exercicio_direitos', 'legitimo_interesse', 'outra'],
  tipoDSR: ['acesso', 'correcao', 'eliminacao', 'portabilidade', 'revogacao', 'informacao', 'oposicao'],
  statusDSR: ['recebido', 'em_analise', 'atendido', 'parcial', 'recusado'],
  gravidade: ['critica', 'alta', 'media', 'baixa'],
  statusIncidente: ['aberto', 'contido', 'encerrado'],
  destinacao: ['eliminacao', 'guarda_permanente', 'devolucao_cliente'],
  statusInvestigacao: ['aberta', 'em_curso', 'concluida', 'arquivada'],
  periodicidadeObrig: ['unica', 'mensal', 'trimestral', 'semestral', 'anual', 'eventual'],
  statusObrigMatriz: ['em_dia', 'pendente', 'vencida', 'nao_aplicavel'],
  tipoConteudo: ['artigo', 'post', 'video', 'podcast', 'newsletter', 'pagina'],
  statusConteudo: ['ideia', 'producao', 'revisao_etica', 'aprovado', 'publicado', 'arquivado', 'reprovado'],
  statusEtica: ['pendente', 'aprovado', 'reprovado'],
  statusAchado: ['aberto', 'tratado', 'falso_positivo'],
  statusFila: ['pendente', 'aceita', 'corrigida', 'descartada'],
  statusTraducao: ['rascunho', 'aprovada', 'publicada', 'reprovada'],
  tipoPendencia: ['documento', 'informacao', 'assinatura', 'pagamento'],
  statusPendencia: ['pendente', 'atendida', 'dispensada'],
  momentoNPS: ['onboarding', 'periodica', 'encerramento'],
};

// Exporta os helpers ANTES de carregar os submódulos (eles requerem este
// arquivo — a atribuição prévia resolve o ciclo).
module.exports = { EL, s, cent, int, bool, fk, arr, valida, hoje, maisDias, patch, colunas, um, todos, novoId, nowISO, j, db };

// ---- submódulos da onda (um por bloco do livro) ----
Object.assign(module.exports,
  require('./livro/crm'),
  require('./livro/pesquisa'),
  require('./livro/estrategia'),
  require('./livro/contratos-ciclo'),
  require('./livro/financeiro'),
  require('./livro/interno'),
  require('./livro/compliance'),
  require('./livro/conteudo'),
  require('./livro/controladoria'),
  require('./livro/portal-extras'),
);
