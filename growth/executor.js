// =====================================================================
// Villela Growth OS — executor de ação aprovada (§20 do PROMPT_MASTER).
//
// Aprovar deixou de ser só registrar a decisão: cada ação do catálogo tem
// aqui um destino real, ou uma recusa explícita dizendo POR QUE não tem.
//
// Três regras deste arquivo:
//
// 1. **Ação sem destino não fica tentando.** Antes, um job sem handler ia
//    para a DLQ com "sem handler registrado" — mensagem de encanamento,
//    inútil para quem aprovou. Agora a recusa é permanente e explica o que
//    falta (conector, credencial, módulo), sem gastar 5 tentativas.
// 2. **A entrega é do módulo dono.** O executor não fala com rede social,
//    e-mail nem plataforma de anúncio: ele chama `conversas`, `conteudo`,
//    `anuncios`, e é lá que a honestidade da integração já está resolvida.
//    Se a rede não está conectada, quem recusa é o módulo, com o motivo dele.
// 3. **Ao menos uma vez.** A fila entrega o job de novo se o processo cair;
//    todo executor confere o status do pedido antes e sai calado se já
//    executou.
// =====================================================================
'use strict';
const repo = require('./repo');
const aprovacoes = require('./aprovacoes');
const fila = require('./fila');
const { nowISO } = require('./db');

/** Erro que a fila não deve tentar de novo — o motivo não muda com o tempo. */
function permanente(msg) { const e = new Error(msg); e.permanente = true; e.status = 422; return e; }

const exige = (dados, campo, comoObter) => {
  const v = dados[campo];
  if (v === undefined || v === null || v === '') throw permanente(`O pedido não trouxe "${campo}" — ${comoObter}.`);
  return v;
};

// ---------------------------------------------------------------------
// Catálogo de executores. A chave é a ação do catálogo de `aprovacoes.js`.
// Cada um devolve um resumo curto do que fez — vira o `resultado` do pedido
// e aparece no painel.
// ---------------------------------------------------------------------
const EXECUTORES = {

  // ---- leitura e cálculo (nível 1) ---------------------------------
  // Chegam aqui quando quem propôs tem autonomia AINDA menor (nível 0):
  // aí até resumir uma conversa passa pela sua aprovação.
  'conversa.classificar': (d) => {
    const conversaId = exige(d, 'conversaId', 'a classificação é de uma conversa');
    const c = repo.buscar('gx_conversas', conversaId);
    if (!c) throw permanente('A conversa não existe mais nesta conta.');
    const ultima = repo.um(
      "SELECT * FROM gx_mensagens WHERE tenant_id = :tenant AND conversa_id = :c AND direcao = 'entrada' " +
      'ORDER BY criado_em DESC LIMIT 1', { c: conversaId }
    );
    const intencao = require('./agentes').classificar((ultima && ultima.texto) || c.assunto || '');
    repo.atualizar('gx_conversas', conversaId, { intencao });
    return { resumo: `Conversa classificada como "${intencao}".` };
  },

  'metrica.calcular': (d) => {
    const n = require('./atribuicao').recalcular({ de: d.de || '', ate: d.ate || '' });
    return { resumo: `Atribuição recalculada em ${n} oportunidade(s) ganha(s).` };
  },

  // ---- ações de baixo risco (nível 2) -------------------------------
  'tarefa.criar': (d) => {
    const titulo = exige(d, 'titulo', 'quem propôs a ação precisa dizer o que fazer');
    const id = repo.inserir('crm_tarefas', {
      titulo, contato_id: d.contatoId || '', oportunidade_id: d.oportunidadeId || '',
      tipo: d.tipo || 'tarefa', vence_em: d.venceEm || '', responsavel: d.responsavel || '',
      status: 'aberta', origem: 'aprovacao', obs: d.obs || '',
    });
    return { criou: 'crm_tarefas', id, resumo: `Tarefa "${titulo}" criada.` };
  },

  'oportunidade.mover': (d) => {
    const id = exige(d, 'oportunidadeId', 'sem a oportunidade não há o que mover');
    const estagio = exige(d, 'estagioId', 'o destino da movimentação faz parte do pedido');
    const o = repo.buscar('crm_oportunidades', id);
    if (!o) throw permanente('A oportunidade não existe mais nesta conta.');
    repo.atualizar('crm_oportunidades', id, { estagio_id: estagio, atualizado_em: nowISO() });
    return { resumo: `Oportunidade "${o.titulo}" movida para o estágio ${estagio}.` };
  },

  'contato.atualizar': (d) => {
    const id = exige(d, 'contatoId', 'sem o contato não há o que atualizar');
    const c = repo.buscar('crm_contatos', id);
    if (!c) throw permanente('O contato não existe mais nesta conta.');
    // lista fechada: uma ação aprovada não é porta para reescrever a linha inteira
    const PERMITIDOS = ['nome', 'email', 'telefone', 'empresa', 'cargo', 'estagio', 'origem', 'obs', 'tags'];
    const campos = {};
    for (const k of PERMITIDOS) if (d[k] !== undefined) campos[k] = d[k];
    if (!Object.keys(campos).length) throw permanente(`O pedido não trouxe nenhum campo atualizável (${PERMITIDOS.join(', ')}).`);
    repo.atualizar('crm_contatos', id, campos);
    return { resumo: `Contato "${c.nome || c.email}" atualizado: ${Object.keys(campos).join(', ')}.` };
  },

  'rascunho.criar': (d) => {
    const conversaId = exige(d, 'conversaId', 'o rascunho pertence a uma conversa');
    const texto = exige(d, 'texto', 'rascunho vazio não ajuda ninguém');
    // nota INTERNA: rascunho aprovado não vira mensagem ao cliente sozinho
    const m = require('./conversas').responder(conversaId, {
      texto, interna: true, autorTipo: 'agente', autorId: d.autorId || 'aprovacao',
    });
    return { resumo: 'Rascunho gravado como nota interna na conversa.', mensagemId: m && m.id };
  },

  // ---- ações de risco (nível 3) -------------------------------------
  'resposta.enviar_template_aprovado': (d) => enviarNaConversa(d, { exigeTemplate: true }),
  'mensagem.enviar_livre': (d) => enviarNaConversa(d, { exigeTemplate: false }),

  'conteudo.publicar': (d) => {
    const conteudoId = exige(d, 'conteudoId', 'sem o conteúdo não há o que publicar');
    const redes = Array.isArray(d.redes) ? d.redes : [];
    if (!redes.length) throw permanente('O pedido não disse em quais redes publicar.');
    // quem decide se a rede aceita é o módulo de conteúdo, pela capability
    // matrix da conexão — aqui não se força publicação em rede não conectada
    const r = require('./conteudo').agendar(conteudoId, { redes, quando: d.quando || nowISO() });
    const agendadas = (r.resultados || []).filter((x) => x.status === 'agendada');
    const bloqueadas = (r.resultados || []).filter((x) => x.status === 'bloqueada');
    if (!agendadas.length) {
      throw permanente(`Nenhuma rede aceitou: ${bloqueadas.map((b) => `${b.rede} (${b.motivo})`).join('; ') || 'sem motivo registrado'}.`);
    }
    return {
      resumo: `Publicação agendada em ${agendadas.map((a) => a.rede).join(', ')}` +
        (bloqueadas.length ? ` · bloqueada em ${bloqueadas.map((b) => `${b.rede} (${b.motivo})`).join(', ')}` : '') + '.',
      resultados: r.resultados,
    };
  },

  'anuncio.criar': (d) => {
    const contaId = exige(d, 'contaId', 'campanha nasce dentro de uma conta de anúncio');
    const nome = exige(d, 'nome', 'a campanha precisa de nome');
    const c = require('./anuncios').registrarCampanha(contaId, {
      nome, objetivo: d.objetivo || '', status: d.status || 'pausada',
      orcamentoDiarioCentavos: Number(d.orcamentoDiarioCentavos) || 0,
      externaId: d.externaId || '',
    });
    return { resumo: `Campanha "${nome}" registrada (status ${c.status}).`, campanhaId: c.id };
  },

  'anuncio.orcamento_alterar': (d) => {
    const campanhaId = exige(d, 'campanhaId', 'sem a campanha não há orçamento a alterar');
    const alt = repo.um(
      "SELECT * FROM gx_orcamento_alteracoes WHERE tenant_id = :tenant AND campanha_id = :c AND status = 'aguardando' " +
      'ORDER BY criado_em DESC LIMIT 1', { c: campanhaId }
    );
    if (!alt) throw permanente('A alteração de orçamento não está mais aguardando — já foi aplicada ou cancelada.');
    const r = require('./anuncios').aplicarAlteracao(alt.id);
    return { resumo: `Orçamento da campanha alterado.`, alteracao: r && r.id };
  },

  'avaliacao.responder_publicamente': (d) => {
    const avaliacaoId = exige(d, 'avaliacaoId', 'sem a avaliação não há o que responder');
    const texto = exige(d, 'texto', 'resposta pública vazia não sai');
    const r = require('./reputacao').responderAvaliacao(avaliacaoId, { texto, forcar: true });
    // a resposta fica aprovada no nosso lado; publicar na fonte depende do
    // conector ter canReplyComments — e isso o módulo de reputação declara
    return { resumo: 'Resposta aprovada e gravada. A publicação na fonte depende do conector da plataforma.', avaliacao: r.avaliacao && r.avaliacao.id };
  },

  'dados.excluir': (d) => {
    const contatoId = exige(d, 'contatoId', 'exclusão de dados é sempre de um titular identificado');
    const lgpd = require('./lgpd');
    const modo = d.modo === 'eliminar' ? 'eliminar' : 'anonimizar';
    const opts = { motivo: d.motivo || 'ação aprovada na central de aprovações' };
    const r = modo === 'eliminar' ? lgpd.eliminar(contatoId, opts) : lgpd.anonimizar(contatoId, opts);
    return { resumo: `Titular ${modo === 'eliminar' ? 'eliminado' : 'anonimizado'} conforme a LGPD.`, detalhe: r };
  },

  'permissao.alterar': (d) => {
    const membershipId = exige(d, 'membershipId', 'a alteração é sobre um acesso existente');
    const contas = require('./contas');
    if (d.revogar) {
      if (!contas.revogar(membershipId)) throw permanente('Este acesso não existe mais.');
      return { resumo: 'Acesso revogado.' };
    }
    const perfil = exige(d, 'perfil', 'sem o novo perfil não há alteração a fazer');
    const m = repo.tenantRow('gx_memberships', membershipId);
    if (!m) throw permanente('Este acesso não existe mais.');
    contas.conceder({ userId: m.user_id, escopoTipo: m.escopo_tipo, escopoId: m.escopo_id, roleSlug: perfil });
    return { resumo: `Perfil do acesso alterado para ${perfil}.` };
  },

  // ---- ações que HOJE não têm destino ------------------------------
  // Estão aqui de propósito: recusar com o motivo certo é melhor do que
  // cair no "sem handler registrado" da fila.
  'conversa.resumir': () => {
    throw permanente(
      'Resumir conversa exige modelo de linguagem: sem chave configurada, o resumo seria inventado. ' +
      'Use o agente de IA, que registra qual motor rodou e se citou fonte.'
    );
  },
  'campanha.disparar': () => {
    throw permanente(
      'Disparo de campanha em massa ainda não tem executor: exige canal de envio verificado ' +
      '(domínio de e-mail autenticado ou WhatsApp Business aprovado). Enquanto isso, a campanha ' +
      'fica registrada e o envio é manual.'
    );
  },
  'proposta.enviar': () => {
    throw permanente(
      'O envio automático de proposta ainda não tem executor: falta decidir o canal de entrega ' +
      '(e-mail autenticado ou conversa do cliente). A proposta continua acessível pelo link público.'
    );
  },
  'servico.contratar': () => {
    throw permanente(
      'Contratar serviço gasta dinheiro real e não é executado por automação: aprovar aqui autoriza, ' +
      'mas a contratação é feita por uma pessoa.'
    );
  },
};

/** Envio na conversa — o módulo de inbox aplica janela, supressão e canal. */
function enviarNaConversa(d, { exigeTemplate }) {
  const conversaId = exige(d, 'conversaId', 'a mensagem pertence a uma conversa');
  const texto = exige(d, 'texto', 'mensagem vazia não é enviada');
  if (exigeTemplate && !d.template) {
    throw permanente('Esta ação só envia template aprovado, e o pedido não trouxe qual.');
  }
  const m = require('./conversas').responder(conversaId, {
    texto, template: d.template || '', autorTipo: 'agente', autorId: d.autorId || 'aprovacao',
  });
  return { resumo: `Mensagem enviada na conversa${d.template ? ` (template ${d.template})` : ''}.`, mensagemId: m && m.id };
}

/**
 * Handler do job `aprovacao:<acao>`.
 * Idempotente: pedido já executado sai calado. Falha permanente marca o
 * pedido como `falhou` na hora, com o motivo — quem aprovou merece saber
 * que não aconteceu, e por quê.
 */
function executarPedido(payload, job) {
  const { aprovacaoId, acao, dados = {} } = payload || {};
  if (!aprovacaoId || !acao) throw permanente('Job de aprovação sem aprovacaoId/ação.');

  const pedido = repo.buscar('gx_aprovacoes', aprovacaoId);
  if (!pedido) throw permanente('O pedido de aprovação não existe mais.');
  if (pedido.status === 'executada') return { jaExecutada: true };
  if (pedido.status !== 'aprovada' && pedido.status !== 'falhou') {
    throw permanente(`O pedido está "${pedido.status}" — só executa o que foi aprovado.`);
  }

  const fn = EXECUTORES[acao];
  if (!fn) {
    const motivo = `Sem executor para "${acao}". A ação foi aprovada, mas nenhum módulo sabe executá-la.`;
    aprovacoes.registrarExecucao(aprovacaoId, { ok: false, resultado: motivo });
    throw permanente(motivo);
  }

  try {
    const resultado = fn(dados, { pedido, job });
    aprovacoes.registrarExecucao(aprovacaoId, { ok: true, resultado: (resultado && resultado.resumo) || 'Executada.' });
    repo.auditar({ acao: 'aprovacao.executada', entidade: 'gx_aprovacoes', entidadeId: aprovacaoId, detalhe: acao });
    require('./eventos').publicar('approval.executed', {
      refTipo: 'aprovacao', refId: aprovacaoId,
      payload: { acao, resumo: (resultado && resultado.resumo) || '' },
      chaveIdem: `aprov-exec-ok:${aprovacaoId}`, origem: 'worker',
    });
    return resultado;
  } catch (e) {
    const ultima = Number(job && job.tentativas || 0) + 1 >= Number(job && job.max_tentativas || 5);
    if (e.permanente || ultima) {
      aprovacoes.registrarExecucao(aprovacaoId, { ok: false, resultado: e.message });
      repo.auditar({ acao: 'aprovacao.falhou', entidade: 'gx_aprovacoes', entidadeId: aprovacaoId, detalhe: `${acao}: ${e.message}` });
    }
    throw e;   // a fila decide entre reagendar e DLQ
  }
}

/** Registra um handler por ação — inclusive as que recusam com motivo. */
function registrarHandlers() {
  const acoes = new Set(Object.keys(aprovacoes.ACOES).concat(Object.keys(EXECUTORES)));
  let n = 0;
  for (const acao of acoes) {
    if (aprovacoes.nivelDaAcao(acao) === 4) continue;   // proibida nunca vira job
    fila.registrar(`aprovacao:${acao}`, executarPedido);
    n++;
  }
  return n;
}

/**
 * Ações que EXISTEM no catálogo mas ainda não têm destino, com o motivo.
 * Declarado aqui, não deduzido: o painel mostra esta lista tal como está,
 * e o teste confere que toda ação nível 2/3 ou executa ou aparece aqui.
 */
const SEM_DESTINO = {
  'conversa.resumir': 'resumir exige modelo de linguagem — sem chave configurada, o resumo seria inventado. Peça pelo agente de IA, que registra qual motor rodou',
  'campanha.disparar': 'exige canal de envio verificado (domínio de e-mail autenticado ou WhatsApp Business aprovado)',
  'proposta.enviar': 'falta decidir o canal de entrega (e-mail autenticado ou conversa do cliente)',
  'servico.contratar': 'gasta dinheiro real — aprovar autoriza, mas quem contrata é uma pessoa',
};

/** O que o painel mostra: quais ações têm destino de verdade hoje. */
const catalogo = () => Object.keys(aprovacoes.ACOES)
  .filter((a) => aprovacoes.nivelDaAcao(a) !== 4)
  .map((acao) => ({
    acao,
    nivel: aprovacoes.nivelDaAcao(acao),
    executavel: !!EXECUTORES[acao] && !SEM_DESTINO[acao],
    motivo: SEM_DESTINO[acao] || '',
  }));

module.exports = { EXECUTORES, SEM_DESTINO, executarPedido, registrarHandlers, catalogo, permanente };
