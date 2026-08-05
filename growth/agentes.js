// =====================================================================
// Villela Growth OS — motor de agentes de IA (§19–21 do PROMPT_MASTER).
//
// O que este arquivo NÃO faz, de propósito:
//   • não deixa o agente executar nada fora das ferramentas do papel dele;
//   • não deixa passar ação de nível 3 sem aprovação humana, nem nível 4
//     de jeito nenhum;
//   • não deixa o agente afirmar preço, prazo ou condição que não esteja
//     na base de conhecimento aprovada e dentro da validade;
//   • não finge que rodou LLM quando não há chave — registra o motor que
//     realmente rodou.
//
// Motor: `regras` é determinístico e está sempre disponível; `llm` só roda
// com ANTHROPIC_API_KEY. Sem chave, cai para regras e a execução registra
// isso — é a diferença entre "degradou com aviso" e "mentiu".
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const aprovacoes = require('./aprovacoes');
const entitlements = require('./entitlements');
const conhecimento = require('./conhecimento');
const { db, nowISO, j } = require('./db');

// ------------------------------------------------ catálogo (§19)
// nivel = autonomia padrão. Vence sempre o mais restritivo entre o nível
// do agente e o da ação (aprovacoes.avaliar).
const CATALOGO = [
  { chave: 'coordenador', nome: 'Coordenador de Receita', nivel: 1,
    objetivo: 'Acompanhar o funil, achar gargalo e convocar quem resolve.',
    ferramentas: ['crm.ler', 'relatorio.ler', 'agente.convocar'] },
  { chave: 'sdr', nome: 'SDR', nivel: 2,
    objetivo: 'Atender lead novo, entender a intenção, qualificar e passar adiante.',
    ferramentas: ['crm.ler', 'crm.atualizar_contato', 'crm.criar_tarefa', 'conhecimento.buscar', 'conversa.responder_template', 'conversa.transferir'] },
  { chave: 'vendas', nome: 'Vendas', nivel: 2,
    objetivo: 'Preparar a abordagem, tratar objeção e não deixar oportunidade parada.',
    ferramentas: ['crm.ler', 'crm.criar_tarefa', 'crm.mover_oportunidade', 'conhecimento.buscar', 'proposta.preparar'] },
  { chave: 'marketing', nome: 'Marketing', nivel: 1,
    objetivo: 'Planejar campanha, definir público e acompanhar resultado.',
    ferramentas: ['crm.ler', 'segmento.ler', 'relatorio.ler', 'conhecimento.buscar'] },
  { chave: 'conteudo', nome: 'Conteúdo', nivel: 2,
    objetivo: 'Escrever pauta, legenda e roteiro no tom da marca.',
    ferramentas: ['conhecimento.buscar', 'conteudo.rascunhar'] },
  { chave: 'social', nome: 'Social Media', nivel: 2,
    objetivo: 'Classificar interação, preparar resposta e encaminhar crise.',
    ferramentas: ['conhecimento.buscar', 'conversa.responder_template', 'conversa.transferir'] },
  { chave: 'midia', nome: 'Mídia Paga', nivel: 1,
    objetivo: 'Achar desperdício e recomendar mudança — nunca gastar sozinho.',
    ferramentas: ['relatorio.ler'] },
  { chave: 'cs', nome: 'Customer Success', nivel: 2,
    objetivo: 'Acompanhar cliente, prever risco de saída e organizar o pós-venda.',
    ferramentas: ['crm.ler', 'crm.criar_tarefa', 'conhecimento.buscar'] },
  { chave: 'reputacao', nome: 'Reputação', nivel: 1,
    objetivo: 'Ler avaliação, medir sentimento e sugerir resposta.',
    ferramentas: ['conhecimento.buscar', 'crm.criar_tarefa'] },
  { chave: 'analytics', nome: 'Analytics', nivel: 0,
    objetivo: 'Explicar variação e apontar gargalo — só leitura.',
    ferramentas: ['relatorio.ler'] },
  { chave: 'conformidade', nome: 'Conformidade', nivel: 1,
    objetivo: 'Verificar consentimento e barrar o que não pode sair.',
    ferramentas: ['crm.ler', 'lgpd.verificar'] },
  { chave: 'operacional', nome: 'Operacional', nivel: 2,
    objetivo: 'Vigiar integração, fila e token; abrir incidente quando cair.',
    ferramentas: ['sistema.saude', 'incidente.abrir'] },
];

// ------------------------------------------------ ferramentas
// Toda ferramenta roda sob o MESMO tenancy das rotas: o agente não tem
// caminho privilegiado ao banco. `escrita` marca o que altera estado.
const FERRAMENTAS = {
  'crm.ler': {
    escrita: false,
    executar: ({ contatoId }) => {
      if (!contatoId) return null;
      const c = require('../crm/app-repo').Contatos.obter(tenancy.tenantAtual(), contatoId);
      if (!c) return null;
      return {
        nome: c.nome, tipo: c.tipo, origem: c.origem, cidade: c.cidade, score: c.score,
        interesse: c.interesse, produto: c.produto_interesse, ultima_interacao: c.ultima_interacao,
      };
    },
  },
  'conhecimento.buscar': {
    escrita: false,
    executar: ({ termo, limite = 4 }) => conhecimento.buscar(termo, { limite }),
  },
  'relatorio.ler': {
    escrita: false,
    executar: () => ({
      contatos: repo.contar('crm_contatos'),
      conversas_abertas: repo.contar('gx_conversas', { onde: "status = 'aberta'" }),
      execucoes_automacao: repo.contar('gx_workflow_execucoes'),
    }),
  },
  'segmento.ler': { escrita: false, executar: () => require('./segmentos').listar(50) },
  'lgpd.verificar': {
    escrita: false,
    executar: ({ canal, valor }) => ({ suprimido: require('./lgpd').estaSuprimido(canal || 'email', valor || '') }),
  },
  'sistema.saude': {
    escrita: false,
    executar: () => require('./fila').estatisticas(),
  },
  'crm.atualizar_contato': {
    escrita: true, acao: 'contato.atualizar',
    executar: ({ contatoId, campos }) => {
      require('../crm/app-repo').Contatos.atualizar(tenancy.tenantAtual(), contatoId, campos || {}, 'agente');
      return { atualizado: Object.keys(campos || {}) };
    },
  },
  'crm.criar_tarefa': {
    escrita: true, acao: 'tarefa.criar',
    executar: ({ titulo, contatoId, emDias = 1 }) => {
      const t = require('../crm/app-repo').Tarefas.criar(tenancy.tenantAtual(), {
        titulo: titulo || 'Follow-up sugerido pelo agente', contato_id: contatoId || '',
        vence_em: new Date(Date.now() + Number(emDias) * 86400000).toISOString().slice(0, 10),
      }, 'agente');
      return { tarefa: t && (t.id || t) };
    },
  },
  'crm.mover_oportunidade': {
    escrita: true, acao: 'oportunidade.mover',
    executar: ({ oportunidadeId, estagioId }) => {
      require('../crm/app-repo').Oportunidades.mover(tenancy.tenantAtual(), oportunidadeId, estagioId, 'agente');
      return { oportunidade: oportunidadeId };
    },
  },
  'conversa.responder_template': {
    escrita: true, acao: 'resposta.enviar_template_aprovado',
    executar: ({ conversaId, texto, template }) => {
      const r = require('./conversas').responder(conversaId, {
        texto, template: template || '', autorTipo: 'agente', autorId: 'agente',
      });
      return { mensagem: r.mensagemId };
    },
  },
  'conversa.transferir': {
    escrita: true, acao: 'conversa.transferir',
    executar: ({ conversaId, paraUsuario, paraFila }) => {
      require('./conversas').atribuir(conversaId, { paraUsuario, paraFila, motivo: 'transferido pelo agente' });
      return { conversa: conversaId };
    },
  },
  'incidente.abrir': {
    escrita: true, acao: 'incidente.abrir',
    executar: ({ titulo, detalhe, severidade }) =>
      require('./incidentes').abrir({ natureza: 'integracao', titulo, detalhe, severidade: severidade || 'media' }),
  },
  'proposta.preparar': {
    escrita: true, acao: 'proposta.enviar',
    executar: () => { const e = new Error('Preparar proposta exige o módulo comercial — ainda não implementado.'); e.status = 501; throw e; },
  },
  'conteudo.rascunhar': {
    escrita: true, acao: 'rascunho.criar',
    executar: ({ texto }) => ({ rascunho: String(texto || '').slice(0, 4000) }),
  },
  'agente.convocar': {
    escrita: true, acao: 'rascunho.criar',
    executar: ({ chave, entrada }) => executar(chave, entrada || {}),
  },
};

// ------------------------------------------------------ provisionar

/** Cria os 12 agentes da conta, desligados. Ligar é decisão do assinante. */
function provisionar() {
  let criados = 0;
  for (const def of CATALOGO) {
    const ja = repo.um('SELECT id FROM gx_agentes WHERE tenant_id = :tenant AND chave = :c', { c: def.chave });
    if (ja) continue;
    const id = repo.inserir('gx_agentes', {
      chave: def.chave, nome: def.nome, funcao: def.nome, objetivo: def.objetivo,
      nivel_autonomia: def.nivel, motor: 'regras', ferramentas: j.str(def.ferramentas),
      ativo: 0, versao: 1,
    });
    repo.inserir('gx_agente_versoes', {
      agente_id: id, versao: 1, prompt: promptPadrao(def), publicada_em: nowISO(), publicada_por: 'sistema',
    });
    criados++;
  }
  return criados;
}

const promptPadrao = (def) => [
  `Você é o agente "${def.nome}" da plataforma Villela Growth OS.`,
  `Objetivo: ${def.objetivo}`,
  'Regras que você NÃO pode quebrar:',
  '- Nunca invente preço, prazo, condição comercial ou disponibilidade. Se não estiver na base de',
  '  conhecimento aprovada que te foi entregue, diga que não tem essa informação.',
  '- Sempre cite de qual documento saiu o que você afirmou.',
  '- Nunca prometa em nome da empresa algo que dependa de aprovação humana.',
  '- Se a pergunta for jurídica ou financeira, encaminhe para uma pessoa.',
  'Responda em português do Brasil, direto e sem enrolação.',
].join('\n');

const listar = () => repo.listar('gx_agentes', { ordem: 'chave ASC' });
const porChave = (chave) => repo.um('SELECT * FROM gx_agentes WHERE tenant_id = :tenant AND chave = :c', { c: chave });

function configurar(chave, dados = {}) {
  const ag = porChave(chave);
  if (!ag) throw erro(404, `Agente "${chave}" não existe nesta conta.`);
  const patch = {};
  for (const c of ['nome', 'objetivo', 'modelo']) if (dados[c] !== undefined) patch[c] = dados[c];
  if (dados.ativo !== undefined) patch.ativo = dados.ativo ? 1 : 0;
  if (dados.motor) {
    if (!['regras', 'llm'].includes(dados.motor)) throw erro(400, 'Motor inválido.');
    patch.motor = dados.motor;
  }
  if (dados.nivelAutonomia !== undefined) {
    const n = Number(dados.nivelAutonomia);
    if (n < 0 || n > 4) throw erro(400, 'Nível de autonomia vai de 0 a 4.');
    patch.nivel_autonomia = n;
  }
  if (dados.ferramentas) {
    const validas = dados.ferramentas.filter((f) => FERRAMENTAS[f]);
    const invalidas = dados.ferramentas.filter((f) => !FERRAMENTAS[f]);
    if (invalidas.length) throw erro(400, `Ferramenta desconhecida: ${invalidas.join(', ')}`);
    patch.ferramentas = j.str(validas);
  }
  for (const [k, col] of [['orcamentoTokensMes', 'orcamento_tokens_mes'], ['limiteCustoMesCent', 'limite_custo_mes_cent'], ['limiteAcoesDia', 'limite_acoes_dia']]) {
    if (dados[k] !== undefined) patch[col] = Number(dados[k]) || 0;
  }
  repo.atualizar('gx_agentes', ag.id, patch);
  repo.auditar({ acao: 'agente.configurado', entidade: 'gx_agentes', entidadeId: ag.id, detalhe: Object.keys(patch).join(',') });
  return repo.buscar('gx_agentes', ag.id);
}

/** Novo prompt = nova versão. Trocar o prompt não reescreve o que já rodou. */
function publicarPrompt(chave, { prompt, notas = '' }) {
  const ag = porChave(chave);
  if (!ag) throw erro(404, `Agente "${chave}" não existe.`);
  const versao = Number(ag.versao || 1) + 1;
  repo.inserir('gx_agente_versoes', {
    agente_id: ag.id, versao, prompt, notas, publicada_em: nowISO(), publicada_por: tenancy.userAtual(),
  });
  repo.atualizar('gx_agentes', ag.id, { versao });
  repo.auditar({ acao: 'agente.prompt_publicado', entidade: 'gx_agentes', entidadeId: ag.id, detalhe: `v${versao}` });
  return repo.buscar('gx_agentes', ag.id);
}

const versaoAtual = (ag) =>
  repo.um('SELECT * FROM gx_agente_versoes WHERE tenant_id = :tenant AND agente_id = :a AND versao = :v',
    { a: ag.id, v: Number(ag.versao) || 1 });

// -------------------------------------------------------- execução

/**
 * Roda o agente. Devolve a execução com resposta, fontes citadas e as
 * ações — inclusive as que foram bloqueadas.
 */
async function executar(chave, entrada = {}) {
  const ag = porChave(chave);
  if (!ag) throw erro(404, `Agente "${chave}" não existe nesta conta.`);
  if (!ag.ativo) throw erro(409, `O agente "${ag.nome}" está desligado.`);
  entitlements.exigirFlag('ia');

  const limites = verificarOrcamento(ag);
  if (!limites.ok) {
    const id = registrarExecucao(ag, entrada, { status: 'bloqueada', parada: limites.motivo, motor: ag.motor });
    return montarSaida(id);
  }

  const t0 = Date.now();
  const execId = registrarExecucao(ag, entrada, { status: 'rodando', motor: ag.motor });
  const ctx = {
    agente: ag, execId, entrada,
    contatoId: entrada.contatoId || entrada.contato_id || '',
    conversaId: entrada.conversaId || entrada.conversa_id || '',
  };

  try {
    const motorReal = (ag.motor === 'llm' && temChaveLLM()) ? 'llm' : 'regras';
    const r = motorReal === 'llm' ? await rodarLLM(ag, ctx) : rodarRegras(ag, ctx);

    // as ações propostas passam UMA A UMA pelo controle de autonomia
    const executadas = [];
    for (const acao of (r.acoes || [])) executadas.push(await despacharAcao(ag, ctx, acao));

    repo.atualizar('gx_agente_execucoes', execId, {
      status: 'concluida', motor: motorReal, modelo: motorReal === 'llm' ? (ag.modelo || MODELO_PADRAO) : '',
      saida: r.resposta || '', fontes_usadas: j.str(r.fontes || []),
      fundamentada: (r.fontes || []).length ? 1 : 0,
      tokens_entrada: r.tokensEntrada || 0, tokens_saida: r.tokensSaida || 0,
      custo_centavos: r.custoCentavos || 0, ms: Date.now() - t0,
      parada: r.parada || '',
    });
    repo.exec('UPDATE gx_agentes SET execucoes = execucoes + 1 WHERE id = :id AND tenant_id = :tenant', { id: ag.id });
    if ((r.fontes || []).length) conhecimento.registrarUso((r.fontes || []).map((f) => f.id).filter(Boolean));

    eventos.publicar('agent.action_completed', {
      refTipo: 'agente', refId: ag.id,
      payload: { execucao_id: execId, agente: ag.chave, acoes: executadas.length, motor: motorReal },
      chaveIdem: `agexec:${execId}`, origem: 'agente',
    });
    return montarSaida(execId);
  } catch (e) {
    repo.atualizar('gx_agente_execucoes', execId, { status: 'falha', erro: String(e.message).slice(0, 400), ms: Date.now() - t0 });
    throw e;
  }
}

function registrarExecucao(ag, entrada, extra = {}) {
  return repo.inserir('gx_agente_execucoes', Object.assign({
    agente_id: ag.id, versao: Number(ag.versao) || 1,
    gatilho: entrada.gatilho || 'manual',
    contato_id: entrada.contatoId || entrada.contato_id || '',
    conversa_id: entrada.conversaId || entrada.conversa_id || '',
    entrada: j.str(entrada), correlation_id: tenancy.correlationId(),
  }, extra));
}

const montarSaida = (execId) => ({
  execucao: repo.buscar('gx_agente_execucoes', execId),
  acoes: repo.listar('gx_agente_acoes', { onde: 'execucao_id = :e', params: { e: execId }, ordem: 'criado_em ASC', limite: 50 }),
});

/** Orçamento e limites do §20: sem isso, agente é conta aberta. */
function verificarOrcamento(ag) {
  const mes = new Date().toISOString().slice(0, 7);
  const uso = repo.um(
    "SELECT COALESCE(SUM(tokens_entrada + tokens_saida),0) AS tokens, COALESCE(SUM(custo_centavos),0) AS custo " +
    'FROM gx_agente_execucoes WHERE tenant_id = :tenant AND agente_id = :a AND criado_em >= :mes',
    { a: ag.id, mes }
  ) || { tokens: 0, custo: 0 };
  if (ag.orcamento_tokens_mes && uso.tokens >= ag.orcamento_tokens_mes) {
    return { ok: false, motivo: `orçamento de ${ag.orcamento_tokens_mes} tokens do mês esgotado` };
  }
  if (ag.limite_custo_mes_cent && uso.custo >= ag.limite_custo_mes_cent) {
    return { ok: false, motivo: `limite de custo do mês (R$ ${(ag.limite_custo_mes_cent / 100).toFixed(2)}) atingido` };
  }
  const hoje = nowISO().slice(0, 10);
  const acoesHoje = repo.um(
    "SELECT COUNT(*) AS n FROM gx_agente_acoes WHERE tenant_id = :tenant AND agente_id = :a AND status = 'executada' AND criado_em >= :hoje",
    { a: ag.id, hoje }
  );
  if (ag.limite_acoes_dia && acoesHoje && acoesHoje.n >= ag.limite_acoes_dia) {
    return { ok: false, motivo: `limite de ${ag.limite_acoes_dia} ações por dia atingido` };
  }
  return { ok: true };
}

/**
 * Controle de autonomia: é aqui que o agente encontra o limite dele.
 * Nível 4 é barrado; nível 3 vira pedido de aprovação; o resto executa —
 * se a ferramenta estiver no papel do agente.
 */
async function despacharAcao(ag, ctx, acao) {
  const ferramenta = FERRAMENTAS[acao.ferramenta];
  const permitidas = j.parse(ag.ferramentas, []);

  const registrar = (status, extra = {}) => repo.inserir('gx_agente_acoes', Object.assign({
    execucao_id: ctx.execId, agente_id: ag.id, acao: acao.ferramenta,
    nivel: ferramenta && ferramenta.acao ? aprovacoes.nivelDaAcao(ferramenta.acao) : 1,
    status, dados: j.str(acao.args || {}),
  }, extra));

  if (!ferramenta) return registrar('bloqueada', { motivo: `ferramenta desconhecida: ${acao.ferramenta}` });
  if (!permitidas.includes(acao.ferramenta)) {
    repo.exec('UPDATE gx_agentes SET acoes_bloqueadas = acoes_bloqueadas + 1 WHERE id = :id AND tenant_id = :tenant', { id: ag.id });
    return registrar('bloqueada', { motivo: `"${acao.ferramenta}" não está nas ferramentas deste agente` });
  }
  if (!ferramenta.escrita) {
    const r = ferramenta.executar(acao.args || {}, ctx);
    return registrar('executada', { resultado: j.str(r) });
  }

  const nomeAcao = ferramenta.acao || 'rascunho.criar';
  const veredito = aprovacoes.avaliar(nomeAcao, Number(ag.nivel_autonomia) || 1);
  repo.exec('UPDATE gx_agentes SET acoes_sugeridas = acoes_sugeridas + 1 WHERE id = :id AND tenant_id = :tenant', { id: ag.id });

  if (!veredito.permitido) {
    repo.exec('UPDATE gx_agentes SET acoes_bloqueadas = acoes_bloqueadas + 1 WHERE id = :id AND tenant_id = :tenant', { id: ag.id });
    return registrar('bloqueada', { motivo: veredito.motivo });
  }
  if (veredito.precisaAprovacao) {
    const pedido = aprovacoes.solicitar({
      acao: nomeAcao, titulo: `${ag.nome}: ${acao.ferramenta}`,
      justificativa: acao.justificativa || 'Proposto por agente de IA.',
      dados: { execucaoId: ctx.execId, ferramenta: acao.ferramenta, args: acao.args || {} },
      origemTipo: 'agente', origemId: ag.id,
    });
    eventos.publicar('agent.approval_required', {
      refTipo: 'agente', refId: ag.id,
      payload: { execucao_id: ctx.execId, acao: nomeAcao, aprovacao_id: pedido.id },
      chaveIdem: `agaprov:${pedido.id}`, origem: 'agente',
    });
    return registrar('aguardando_aprovacao', { aprovacao_id: pedido.id, motivo: veredito.motivo });
  }

  try {
    const r = ferramenta.executar(acao.args || {}, ctx);
    repo.exec('UPDATE gx_agentes SET acoes_executadas = acoes_executadas + 1 WHERE id = :id AND tenant_id = :tenant', { id: ag.id });
    return registrar('executada', { resultado: j.str(r) });
  } catch (e) {
    return registrar('falhou', { motivo: String(e.message).slice(0, 300) });
  }
}

// --------------------------------------------------- motor de regras

const INTENCOES = [
  { chave: 'preco', termos: ['preço', 'preco', 'valor', 'quanto custa', 'orçamento', 'orcamento', 'tabela'] },
  { chave: 'disponibilidade', termos: ['disponível', 'disponivel', 'tem vaga', 'livre', 'data', 'agenda'] },
  { chave: 'reclamacao', termos: ['reclamação', 'reclamacao', 'problema', 'péssimo', 'pessimo', 'ruim', 'não funcionou', 'cancelar'] },
  { chave: 'juridico', termos: ['contrato', 'processo', 'advogado', 'jurídico', 'juridico', 'multa', 'rescisão'] },
  { chave: 'suporte', termos: ['ajuda', 'como faço', 'não consigo', 'erro', 'dúvida', 'duvida'] },
  { chave: 'compra', termos: ['quero', 'fechar', 'reservar', 'contratar', 'comprar'] },
];

function classificar(texto) {
  const t = String(texto || '').toLowerCase();
  for (const i of INTENCOES) if (i.termos.some((x) => t.includes(x))) return i.chave;
  return 'outro';
}

/**
 * Motor determinístico. Sempre disponível, auditável e sem custo. Quando
 * não sabe, ele DIZ que não sabe — que é exatamente o comportamento que
 * se quer de um agente sem fonte.
 */
function rodarRegras(ag, ctx) {
  const texto = String(ctx.entrada.texto || ctx.entrada.mensagem || '');
  const intencao = classificar(texto);
  const fontes = texto ? conhecimento.buscar(texto, { limite: 3 }) : [];
  const acoes = [];

  // temas sensíveis nunca são respondidos pelo agente
  if (intencao === 'juridico' || intencao === 'reclamacao') {
    if (ctx.conversaId) {
      acoes.push({ ferramenta: 'conversa.transferir', args: { conversaId: ctx.conversaId, paraFila: '' },
        justificativa: `intenção "${intencao}" exige pessoa` });
    }
    return {
      resposta: `Assunto de "${intencao}" — encaminhando para uma pessoa do time. Não respondi por conta própria.`,
      fontes: [], parada: 'tema sensível: handoff obrigatório', acoes,
    };
  }

  // preço/condição sem fonte aprovada: não inventa
  if ((intencao === 'preco' || intencao === 'disponibilidade') && !fontes.length) {
    return {
      resposta: 'Não encontrei essa informação na base aprovada, então não vou arriscar um número. Encaminhando para o time confirmar.',
      fontes: [], parada: 'sem fonte para pergunta de preço/condição',
      acoes: ctx.conversaId ? [{ ferramenta: 'conversa.transferir', args: { conversaId: ctx.conversaId }, justificativa: 'sem fonte' }] : [],
    };
  }

  const contato = ctx.contatoId ? FERRAMENTAS['crm.ler'].executar({ contatoId: ctx.contatoId }) : null;

  if (ag.chave === 'sdr') {
    if (ctx.contatoId) {
      acoes.push({ ferramenta: 'crm.atualizar_contato',
        args: { contatoId: ctx.contatoId, campos: { interesse: intencao } }, justificativa: 'registrar a intenção detectada' });
      acoes.push({ ferramenta: 'crm.criar_tarefa',
        args: { titulo: `Retornar lead (${intencao})`, contatoId: ctx.contatoId, emDias: 1 }, justificativa: 'não deixar o lead esfriar' });
    }
  } else if (ag.chave === 'operacional') {
    const saude = FERRAMENTAS['sistema.saude'].executar({});
    if (saude.dlq > 0) {
      acoes.push({ ferramenta: 'incidente.abrir',
        args: { titulo: `${saude.dlq} job(s) na DLQ`, detalhe: JSON.stringify(saude), severidade: 'alta' },
        justificativa: 'trabalho morto na fila' });
    }
    return { resposta: `Fila: ${saude.pendente} pendente(s), ${saude.dlq} na DLQ.`, fontes: [], acoes };
  }

  const resposta = fontes.length
    ? `Intenção detectada: ${intencao}. Segundo ${fontes[0].fonte}: ${fontes[0].trecho}`
    : `Intenção detectada: ${intencao}. Não há documento aprovado que cubra isso.`;

  return { resposta, fontes, acoes, parada: '' };
}

// ------------------------------------------------------ motor LLM

const MODELO_PADRAO = 'claude-sonnet-5';
// Estimativa para controle de orçamento. NÃO é tabela oficial de preço:
// serve para o limite de custo ter alguma base. Ajustável por ambiente.
const CUSTO_POR_MTOKEN = {
  entrada: Number(process.env.GROWTH_IA_CUSTO_ENTRADA || 300),   // centavos por milhão
  saida: Number(process.env.GROWTH_IA_CUSTO_SAIDA || 1500),
};

const temChaveLLM = () => !!process.env.ANTHROPIC_API_KEY;

async function rodarLLM(ag, ctx) {
  const texto = String(ctx.entrada.texto || ctx.entrada.mensagem || '');
  const fontes = texto ? conhecimento.buscar(texto, { limite: 5 }) : [];
  const versao = versaoAtual(ag);
  const contato = ctx.contatoId ? FERRAMENTAS['crm.ler'].executar({ contatoId: ctx.contatoId }) : null;

  const contexto = [
    fontes.length
      ? 'Base de conhecimento aprovada (use SÓ isto para afirmar fatos):\n' +
        fontes.map((f, i) => `[${i + 1}] ${f.fonte}: ${f.trecho}`).join('\n')
      : 'Base de conhecimento: NENHUM documento aprovado bate com a pergunta.',
    contato ? `Contato: ${JSON.stringify(contato)}` : '',
    `Ferramentas disponíveis: ${j.parse(ag.ferramentas, []).join(', ')}`,
    'Responda em JSON: {"resposta": "...", "fontes": [1,2], "acoes": [{"ferramenta":"...","args":{},"justificativa":"..."}]}',
  ].filter(Boolean).join('\n\n');

  const Anthropic = require('@anthropic-ai/sdk');
  const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await cliente.messages.create({
    model: ag.modelo || MODELO_PADRAO,
    max_tokens: 1200,
    system: (versao && versao.prompt) || promptPadrao({ nome: ag.nome, objetivo: ag.objetivo }),
    messages: [{ role: 'user', content: `${contexto}\n\nMensagem: ${texto}` }],
  });

  const bruto = (resp.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  let parsed = {};
  try { parsed = JSON.parse(bruto.slice(bruto.indexOf('{'), bruto.lastIndexOf('}') + 1)); }
  catch { parsed = { resposta: bruto, fontes: [], acoes: [] }; }

  const usadas = (parsed.fontes || []).map((n) => fontes[Number(n) - 1]).filter(Boolean);
  const tIn = (resp.usage && resp.usage.input_tokens) || 0;
  const tOut = (resp.usage && resp.usage.output_tokens) || 0;

  return {
    resposta: String(parsed.resposta || bruto).slice(0, 6000),
    fontes: usadas,
    acoes: Array.isArray(parsed.acoes) ? parsed.acoes.slice(0, 10) : [],
    tokensEntrada: tIn, tokensSaida: tOut,
    custoCentavos: Math.ceil((tIn * CUSTO_POR_MTOKEN.entrada + tOut * CUSTO_POR_MTOKEN.saida) / 1e6),
    parada: usadas.length ? '' : 'respondeu sem citar fonte',
  };
}

// --------------------------------------------------------- memória

const ESCOPOS = ['tenant', 'marca', 'produto', 'contato', 'conversa', 'execucao'];

function lembrar({ escopo, escopoId = '', agenteId = '', chave, valor, expiraEm = '' }) {
  if (!ESCOPOS.includes(escopo)) throw erro(400, `Escopo de memória inválido: ${escopo}`);
  const ja = repo.um(
    'SELECT * FROM gx_agente_memoria WHERE tenant_id = :tenant AND escopo = :e AND escopo_id = :ei AND agente_id = :a AND chave = :c',
    { e: escopo, ei: escopoId, a: agenteId, c: chave }
  );
  if (ja) { repo.atualizar('gx_agente_memoria', ja.id, { valor: j.str(valor), expira_em: expiraEm }); return ja.id; }
  return repo.inserir('gx_agente_memoria', {
    escopo, escopo_id: escopoId, agente_id: agenteId, chave, valor: j.str(valor), expira_em: expiraEm,
  });
}

function recordar({ escopo, escopoId = '', agenteId = '' }) {
  const linhas = repo.listar('gx_agente_memoria', {
    onde: 'escopo = :e AND escopo_id = :ei AND (agente_id = :a OR agente_id = \'\')',
    params: { e: escopo, ei: escopoId, a: agenteId }, ordem: 'criado_em ASC', limite: 100,
  });
  const agora = nowISO();
  return linhas.filter((l) => !l.expira_em || l.expira_em > agora)
    .reduce((acc, l) => { acc[l.chave] = j.parse(l.valor, l.valor); return acc; }, {});
}

const esquecer = (escopo, escopoId) => repo.exec(
  'DELETE FROM gx_agente_memoria WHERE tenant_id = :tenant AND escopo = :e AND escopo_id = :ei',
  { e: escopo, ei: escopoId }
).changes;

// ------------------------------------------------------ avaliações

function avaliar(execucaoId, { criterio, nota, comentario = '', avaliador = 'humano' }) {
  const exec = repo.buscar('gx_agente_execucoes', execucaoId);
  if (!exec) throw erro(404, 'Execução não encontrada.');
  const id = repo.inserir('gx_avaliacoes', {
    agente_id: exec.agente_id, execucao_id: execucaoId, criterio,
    nota: Math.max(-1, Math.min(1, Number(nota) || 0)), comentario, avaliador,
  });
  if (Number(nota) < 0) {
    repo.exec('UPDATE gx_agentes SET correcoes_humanas = correcoes_humanas + 1 WHERE id = :id AND tenant_id = :tenant', { id: exec.agente_id });
  }
  return repo.buscar('gx_avaliacoes', id);
}

/** Painel do §22: o que o agente fez, quanto custou e quanto acertou. */
function metricas(chave) {
  const ag = porChave(chave);
  if (!ag) throw erro(404, 'Agente não encontrado.');
  const mes = new Date().toISOString().slice(0, 7);
  const uso = repo.um(
    'SELECT COUNT(*) AS execucoes, COALESCE(SUM(tokens_entrada + tokens_saida),0) AS tokens, ' +
    'COALESCE(SUM(custo_centavos),0) AS custo, COALESCE(SUM(fundamentada),0) AS fundamentadas ' +
    'FROM gx_agente_execucoes WHERE tenant_id = :tenant AND agente_id = :a AND criado_em >= :mes',
    { a: ag.id, mes }
  ) || {};
  const notas = repo.um(
    'SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN nota > 0 THEN 1 ELSE 0 END),0) AS boas ' +
    'FROM gx_avaliacoes WHERE tenant_id = :tenant AND agente_id = :a', { a: ag.id }
  ) || {};
  return {
    agente: ag.chave, nome: ag.nome, ativo: !!ag.ativo, motor: ag.motor, nivel: ag.nivel_autonomia,
    mes: Object.assign({}, uso, {
      custo_reais: ((uso.custo || 0) / 100).toFixed(2),
      orcamento_tokens: ag.orcamento_tokens_mes,
      pct_fundamentadas: uso.execucoes ? Math.round((uso.fundamentadas / uso.execucoes) * 100) : null,
    }),
    acoes: { sugeridas: ag.acoes_sugeridas, executadas: ag.acoes_executadas, bloqueadas: ag.acoes_bloqueadas },
    correcoes_humanas: ag.correcoes_humanas,
    avaliacoes: { total: notas.n || 0, boas: notas.boas || 0 },
  };
}

const execucoes = (chave, limite = 50) => {
  const ag = porChave(chave);
  return ag ? repo.listar('gx_agente_execucoes', { onde: 'agente_id = :a', params: { a: ag.id }, ordem: 'criado_em DESC', limite }) : [];
};

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  CATALOGO, FERRAMENTAS, ESCOPOS, MODELO_PADRAO, INTENCOES,
  provisionar, listar, porChave, configurar, publicarPrompt, versaoAtual,
  executar, despacharAcao, verificarOrcamento, classificar,
  lembrar, recordar, esquecer, avaliar, metricas, execucoes, temChaveLLM,
};
