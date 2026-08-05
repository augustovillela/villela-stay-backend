// =====================================================================
// Villela Growth OS — motor de automações (§12 do PROMPT_MASTER).
//
// Um workflow é DADO: gatilho + nós em JSON versionado. Publicar congela
// uma versão; a execução aponta para ela. Mudar o fluxo não reescreve o
// passado, e dá para voltar atrás.
//
// As travas deste arquivo existem porque automação errada não avisa que
// está errada — ela só continua rodando:
//   • limite de passos por execução (loop dentro do fluxo);
//   • workflow não é disparado por evento que ele mesmo gerou;
//   • teto por contato e por dia;
//   • simulação que NÃO produz efeito colateral;
//   • toda ação de risco passa pela central de aprovações;
//   • supressão e janela de canal continuam valendo — a automação não é
//     um caminho paralelo que fura as regras do envio.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const fila = require('./fila');
const entitlements = require('./entitlements');
const { db, nowISO, j } = require('./db');

const MAX_PASSOS = Number(process.env.GROWTH_WF_MAX_PASSOS || 50);
const TIMEOUT_ESPERA_DIAS = 30;

// Gatilhos aceitos: são tipos do catálogo de eventos (docs/growth-os/EVENTS.md).
const GATILHOS = {
  'lead.created': 'Novo lead',
  'lead.qualified': 'Lead qualificado',
  'form.submitted': 'Formulário enviado',
  'contact.updated': 'Contato atualizado',
  'contact.consent_updated': 'Consentimento alterado',
  'opportunity.created': 'Oportunidade criada',
  'opportunity.stage_changed': 'Oportunidade mudou de etapa',
  'message.received': 'Mensagem recebida',
  'conversation.assigned': 'Conversa atribuída',
  'task.overdue': 'Tarefa atrasada',
  'meeting.booked': 'Reunião marcada',
  'review.received': 'Avaliação recebida',
  'usage.limit_reached': 'Limite do plano atingido',
  'integration.disconnected': 'Integração caiu',
  agendado: 'Horário (condição temporal)',
};

const TIPOS_NO = ['condicao', 'ramificacao', 'espera', 'acao', 'aprovacao', 'fim'];

// ------------------------------------------------------------ CRUD

function criar({ nome, descricao = '', gatilhoTipo, gatilhoConfig = {}, definicao = null,
  maxPorContato = 0, maxPorDia = 0 }) {
  if (!nome) throw erro(400, 'A automação precisa de um nome.');
  if (!GATILHOS[gatilhoTipo]) throw erro(400, `Gatilho desconhecido: ${gatilhoTipo}`);
  entitlements.exigirFlag('automacoes');
  entitlements.exigirDentroDoLimite('workflows', repo.contar('gx_workflows'));

  const id = repo.inserir('gx_workflows', {
    nome, descricao, gatilho_tipo: gatilhoTipo, gatilho_config: j.str(gatilhoConfig),
    status: 'rascunho', versao_rascunho: 1,
    max_por_contato: Number(maxPorContato) || 0, max_por_dia: Number(maxPorDia) || 0,
  });
  salvarRascunho(id, definicao || { nos: [] });
  repo.auditar({ acao: 'automacao.criada', entidade: 'gx_workflows', entidadeId: id, detalhe: nome });
  return repo.buscar('gx_workflows', id);
}

/** Grava o rascunho. Valida a topologia antes — fluxo quebrado não salva. */
function salvarRascunho(workflowId, definicao) {
  const wf = repo.buscar('gx_workflows', workflowId);
  if (!wf) throw erro(404, 'Automação não encontrada.');
  validarDefinicao(definicao);
  const versao = Number(wf.versao_rascunho) || 1;
  const ja = repo.um('SELECT * FROM gx_workflow_versoes WHERE tenant_id = :tenant AND workflow_id = :w AND versao = :v',
    { w: workflowId, v: versao });
  if (ja) repo.atualizar('gx_workflow_versoes', ja.id, { definicao: j.str(definicao) });
  else repo.inserir('gx_workflow_versoes', {
    workflow_id: workflowId, versao, definicao: j.str(definicao),
    gatilho_tipo: wf.gatilho_tipo, gatilho_config: wf.gatilho_config,
  });
  return { versao };
}

/** Publica o rascunho. A versão publicada vira imutável. */
function publicar(workflowId, { notas = '' } = {}) {
  const wf = repo.buscar('gx_workflows', workflowId);
  if (!wf) throw erro(404, 'Automação não encontrada.');
  const versao = Number(wf.versao_rascunho) || 1;
  const v = repo.um('SELECT * FROM gx_workflow_versoes WHERE tenant_id = :tenant AND workflow_id = :w AND versao = :v',
    { w: workflowId, v: versao });
  if (!v) throw erro(400, 'Não há rascunho para publicar.');
  const def = j.parse(v.definicao, {});
  validarDefinicao(def, { publicando: true });

  repo.atualizar('gx_workflow_versoes', v.id, { publicada_em: nowISO(), publicada_por: tenancy.userAtual(), notas });
  repo.atualizar('gx_workflows', workflowId, {
    status: 'publicado', versao_publicada: versao, versao_rascunho: versao + 1,
  });
  // o próximo rascunho nasce como cópia da versão publicada
  repo.inserir('gx_workflow_versoes', {
    workflow_id: workflowId, versao: versao + 1, definicao: v.definicao,
    gatilho_tipo: wf.gatilho_tipo, gatilho_config: wf.gatilho_config,
  });
  repo.auditar({ acao: 'automacao.publicada', entidade: 'gx_workflows', entidadeId: workflowId, detalhe: `v${versao}. ${notas}` });
  return repo.buscar('gx_workflows', workflowId);
}

/** Volta para uma versão anterior já publicada. */
function reverter(workflowId, versaoAlvo) {
  const wf = repo.buscar('gx_workflows', workflowId);
  if (!wf) throw erro(404, 'Automação não encontrada.');
  const v = repo.um("SELECT * FROM gx_workflow_versoes WHERE tenant_id = :tenant AND workflow_id = :w AND versao = :v AND publicada_em != ''",
    { w: workflowId, v: Number(versaoAlvo) });
  if (!v) throw erro(404, `A versão ${versaoAlvo} não existe ou nunca foi publicada.`);
  repo.atualizar('gx_workflows', workflowId, { versao_publicada: Number(versaoAlvo), status: 'publicado' });
  repo.auditar({ acao: 'automacao.revertida', entidade: 'gx_workflows', entidadeId: workflowId, detalhe: `voltou para v${versaoAlvo}` });
  return repo.buscar('gx_workflows', workflowId);
}

const pausar = (workflowId) => {
  repo.atualizar('gx_workflows', workflowId, { status: 'pausado' });
  repo.auditar({ acao: 'automacao.pausada', entidade: 'gx_workflows', entidadeId: workflowId });
  return repo.buscar('gx_workflows', workflowId);
};

const listar = (limite = 200) => repo.listar('gx_workflows', { ordem: 'criado_em DESC', limite });

function definicaoPublicada(wf) {
  const v = repo.um('SELECT * FROM gx_workflow_versoes WHERE tenant_id = :tenant AND workflow_id = :w AND versao = :v',
    { w: wf.id, v: Number(wf.versao_publicada) || 0 });
  return v ? j.parse(v.definicao, { nos: [] }) : null;
}

/** Topologia: nós referenciados existem, tipos válidos, sem ciclo estático. */
function validarDefinicao(def, { publicando = false } = {}) {
  const nos = (def && Array.isArray(def.nos)) ? def.nos : [];
  if (publicando && !nos.length) throw erro(400, 'Publique com pelo menos um nó.');
  const ids = new Set();
  for (const n of nos) {
    if (!n.id) throw erro(400, 'Todo nó precisa de id.');
    if (ids.has(n.id)) throw erro(400, `Nó duplicado: ${n.id}`);
    if (!TIPOS_NO.includes(n.tipo)) throw erro(400, `Tipo de nó desconhecido: ${n.tipo}`);
    if (n.tipo === 'acao' && !ACOES[n.acao]) throw erro(400, `Ação desconhecida: ${n.acao}`);
    ids.add(n.id);
  }
  const destinos = [];
  for (const n of nos) {
    for (const d of [n.proximo, n.seVerdadeiro, n.seFalso].concat(Object.values(n.saidas || {}))) {
      if (d) destinos.push({ de: n.id, para: d });
    }
  }
  for (const d of destinos) {
    if (!ids.has(d.para)) throw erro(400, `O nó "${d.de}" aponta para "${d.para}", que não existe.`);
  }
  // ciclo estático: caminho que volta para um nó já visitado sem passar por espera
  detectarCiclo(nos);
  return true;
}

function detectarCiclo(nos) {
  const mapa = new Map(nos.map((n) => [n.id, n]));
  const visitando = new Set();
  const ok = new Set();
  const anda = (id, caminho) => {
    if (!id || ok.has(id)) return;
    const no = mapa.get(id);
    if (!no) return;
    // espera quebra o ciclo: dá tempo de a condição mudar
    if (no.tipo === 'espera') { ok.add(id); return; }
    if (visitando.has(id)) {
      throw erro(400, `Ciclo sem espera detectado: ${caminho.concat(id).join(' → ')}. Insira uma espera ou remova o retorno.`);
    }
    visitando.add(id);
    for (const d of [no.proximo, no.seVerdadeiro, no.seFalso].concat(Object.values(no.saidas || {}))) {
      if (d) anda(d, caminho.concat(id));
    }
    visitando.delete(id);
    ok.add(id);
  };
  for (const n of nos) anda(n.id, []);
}

// ------------------------------------------------------ disparo

/** Liga o motor ao barramento. Um assinante por tipo de gatilho. */
function ligarGatilhos() {
  for (const tipo of Object.keys(GATILHOS)) {
    if (tipo === 'agendado') continue;
    eventos.assinar(tipo, 'automacoes', (payload, evento) => dispararPara(tipo, payload, evento));
  }
}

/**
 * Um evento chegou: quem se interessa? Cria uma execução por workflow
 * publicado cujo gatilho e filtros batem.
 */
function dispararPara(tipo, payload, evento) {
  // um workflow NÃO é disparado por evento que ele mesmo gerou
  const origemWf = payload && payload.__workflow_id;
  const candidatos = repo.listar('gx_workflows', {
    onde: "gatilho_tipo = :t AND status = 'publicado'", params: { t: tipo }, limite: 100,
  });
  const criadas = [];
  for (const wf of candidatos) {
    if (origemWf && origemWf === wf.id) continue;
    if (!filtroBate(j.parse(wf.gatilho_config, {}), payload)) continue;
    const exec = agendarExecucao(wf, { payload, evento });
    if (exec) criadas.push(exec.id);
  }
  return criadas;
}

/** Filtros do gatilho: igualdade simples sobre campos do payload. */
function filtroBate(config, payload) {
  const filtros = (config && config.filtros) || {};
  for (const [campo, valor] of Object.entries(filtros)) {
    if (String((payload || {})[campo] == null ? '' : (payload || {})[campo]) !== String(valor)) return false;
  }
  return true;
}

function agendarExecucao(wf, { payload = {}, evento = null, simulacao = false, contexto = {} } = {}) {
  const contatoId = payload.contato_id || payload.contatoId || contexto.contato_id || '';

  // teto por contato: automação de boas-vindas não roda duas vezes
  if (!simulacao && wf.max_por_contato && contatoId) {
    const n = repo.um('SELECT COUNT(*) AS n FROM gx_workflow_execucoes WHERE tenant_id = :tenant AND workflow_id = :w AND contato_id = :c AND simulacao = 0',
      { w: wf.id, c: contatoId });
    if (n && n.n >= wf.max_por_contato) return null;
  }
  // teto diário do workflow
  if (!simulacao && wf.max_por_dia) {
    const hoje = new Date().toISOString().slice(0, 10);
    const n = repo.um("SELECT COUNT(*) AS n FROM gx_workflow_execucoes WHERE tenant_id = :tenant AND workflow_id = :w AND simulacao = 0 AND iniciada_em >= :d",
      { w: wf.id, d: hoje });
    if (n && n.n >= wf.max_por_dia) return null;
  }

  const idem = (!simulacao && evento) ? `wf:${wf.id}:${evento.id}` : '';
  let id;
  try {
    id = repo.inserir('gx_workflow_execucoes', {
      workflow_id: wf.id, versao: Number(wf.versao_publicada) || 0,
      gatilho_evento: evento ? evento.id : '', contato_id: contatoId,
      conversa_id: payload.conversa_id || '', status: 'pendente',
      contexto: j.str(Object.assign({ gatilho: payload }, contexto)),
      simulacao: simulacao ? 1 : 0,
      correlation_id: (evento && evento.correlation_id) || tenancy.correlationId(),
      chave_idem: idem, iniciada_em: nowISO(),
    });
  } catch (e) {
    if (idem && /UNIQUE|constraint/i.test(String(e.message))) return null;  // já agendada
    throw e;
  }

  if (!simulacao) {
    repo.exec('UPDATE gx_workflows SET execucoes = execucoes + 1, ultima_execucao = :em WHERE id = :id AND tenant_id = :tenant',
      { id: wf.id, em: nowISO() });
    entitlements.consumir('automacoes_execucoes', 1);
    fila.enfileirar({
      tipo: 'automacao:passo', fila: 'automacoes', prioridade: 4,
      payload: { execucaoId: id }, chaveIdem: `wfpasso:${id}:inicio`,
    });
    eventos.publicar('automation.started', {
      refTipo: 'workflow', refId: wf.id,
      payload: { execucao_id: id, contato_id: contatoId, __workflow_id: wf.id },
      chaveIdem: `wfstart:${id}`, origem: 'automacao',
    });
  }
  return repo.buscar('gx_workflow_execucoes', id);
}

// ------------------------------------------------------- execução

/**
 * Roda a execução até parar: fim, espera, aprovação ou erro.
 * Handler do job `automacao:passo` — retry e DLQ vêm de graça da fila.
 */
async function rodar(execucaoId) {
  const exec = repo.buscar('gx_workflow_execucoes', execucaoId);
  if (!exec) throw erro(404, 'Execução não encontrada.');
  if (['concluida', 'cancelada', 'falha', 'expirada'].includes(exec.status)) return { ok: true, jaEncerrada: true };

  const wf = repo.buscar('gx_workflows', exec.workflow_id);
  const versao = repo.um('SELECT * FROM gx_workflow_versoes WHERE tenant_id = :tenant AND workflow_id = :w AND versao = :v',
    { w: exec.workflow_id, v: exec.versao });
  if (!wf || !versao) return encerrar(exec, 'falha', 'Versão da automação não encontrada.');

  const def = j.parse(versao.definicao, { nos: [] });
  const mapa = new Map((def.nos || []).map((n) => [n.id, n]));
  let contexto = j.parse(exec.contexto, {});
  let atual = exec.no_atual || (def.nos[0] && def.nos[0].id) || '';
  let passos = Number(exec.passos_dados) || 0;

  repo.atualizar('gx_workflow_execucoes', execucaoId, { status: 'rodando' });

  while (atual) {
    // trava de loop: mesmo sem ciclo estático, espera + retorno pode girar
    if (++passos > MAX_PASSOS) {
      return encerrar(exec, 'falha', `Passou de ${MAX_PASSOS} passos — automação interrompida para não girar sem fim.`);
    }
    const no = mapa.get(atual);
    if (!no) return encerrar(exec, 'falha', `O nó "${atual}" não existe nesta versão.`);

    const t0 = Date.now();
    let r;
    try {
      r = await executarNo(no, { exec, contexto, wf, simulacao: !!exec.simulacao });
    } catch (e) {
      registrarPasso(exec, no, { status: 'falha', erro: e.message, ms: Date.now() - t0 });
      return encerrar(exec, 'falha', `${no.id}: ${e.message}`);
    }

    registrarPasso(exec, no, {
      status: r.status || 'ok', saida: r.saida || {}, motivo: r.motivo || '', ms: Date.now() - t0,
    });
    if (r.contexto) contexto = Object.assign({}, contexto, r.contexto);

    repo.atualizar('gx_workflow_execucoes', execucaoId, {
      no_atual: no.id, contexto: j.str(contexto), passos_dados: passos,
    });

    if (r.parar) {
      if (r.esperarAte) {
        repo.atualizar('gx_workflow_execucoes', execucaoId, {
          status: 'aguardando', retomar_em: r.esperarAte, no_atual: r.proximo || '',
        });
        if (!exec.simulacao) {
          fila.enfileirar({
            tipo: 'automacao:passo', fila: 'automacoes', prioridade: 5,
            payload: { execucaoId }, chaveIdem: `wfpasso:${execucaoId}:${no.id}`,
            agendarPara: r.esperarAte,
          });
        }
        return { ok: true, aguardando: true, ate: r.esperarAte };
      }
      if (r.aguardandoAprovacao) {
        repo.atualizar('gx_workflow_execucoes', execucaoId, { status: 'aguardando', no_atual: r.proximo || '' });
        return { ok: true, aguardandoAprovacao: true };
      }
      return encerrar(exec, r.statusFinal || 'concluida', r.motivo || '');
    }
    atual = r.proximo || '';
  }
  return encerrar(exec, 'concluida', '');
}

function encerrar(exec, status, motivo) {
  repo.atualizar('gx_workflow_execucoes', exec.id, {
    status, erro: status === 'falha' ? motivo : '', concluida_em: nowISO(),
  });
  if (!exec.simulacao) {
    const campo = status === 'concluida' ? 'concluidas' : (status === 'falha' ? 'falhas' : null);
    if (campo) {
      repo.exec(`UPDATE gx_workflows SET ${campo} = ${campo} + 1 WHERE id = :id AND tenant_id = :tenant`, { id: exec.workflow_id });
    }
    eventos.publicar(status === 'falha' ? 'automation.failed' : 'automation.completed', {
      refTipo: 'workflow', refId: exec.workflow_id,
      payload: { execucao_id: exec.id, motivo, __workflow_id: exec.workflow_id },
      chaveIdem: `wfend:${exec.id}`, origem: 'automacao',
    });
  }
  return { ok: status !== 'falha', status, motivo };
}

const registrarPasso = (exec, no, { status, saida = {}, motivo = '', erro = '', ms = 0 }) =>
  repo.inserir('gx_workflow_passos', {
    execucao_id: exec.id, no_id: no.id, tipo: no.tipo, entrada: j.str(no),
    saida: j.str(saida), status, motivo, erro, ms, criado_em: nowISO(),
  });

// ------------------------------------------------------------- nós

async function executarNo(no, ctx) {
  switch (no.tipo) {
    case 'fim':
      return { parar: true, statusFinal: no.status === 'falha' ? 'falha' : 'concluida', motivo: no.motivo || '' };

    case 'condicao': {
      const passou = avaliarCondicoes(no.condicoes || [], no.juncao || 'todas', ctx);
      return {
        proximo: passou ? no.seVerdadeiro : no.seFalso,
        parar: !(passou ? no.seVerdadeiro : no.seFalso),
        status: 'ok', saida: { passou },
        motivo: passou ? '' : 'condição não atendida',
      };
    }

    case 'ramificacao': {
      const valor = String(valorDe(no.campo, ctx) == null ? '' : valorDe(no.campo, ctx));
      const destino = (no.saidas || {})[valor] || no.proximo;
      return { proximo: destino, parar: !destino, saida: { valor } };
    }

    case 'espera': {
      const ate = calcularEspera(no);
      return { parar: true, esperarAte: ate, proximo: no.proximo, status: 'aguardando', saida: { ate } };
    }

    case 'aprovacao': {
      if (ctx.simulacao) return { proximo: no.proximo, status: 'simulado', motivo: 'aprovação não solicitada em simulação' };
      const aprovacoes = require('./aprovacoes');
      const pedido = aprovacoes.solicitar({
        acao: no.acao || 'mensagem.enviar_livre',
        titulo: no.titulo || `Automação ${ctx.wf.nome}`,
        justificativa: no.justificativa || 'Solicitado por automação.',
        dados: { execucaoId: ctx.exec.id, no: no.id, config: no.config || {} },
        origemTipo: 'automacao', origemId: ctx.wf.id,
      });
      return { parar: true, aguardandoAprovacao: true, proximo: no.proximo, status: 'aguardando', saida: { aprovacao_id: pedido.id } };
    }

    case 'acao': {
      const acao = ACOES[no.acao];
      if (!acao) throw erro(400, `Ação desconhecida: ${no.acao}`);
      if (ctx.simulacao) {
        return { proximo: no.proximo, parar: !no.proximo, status: 'simulado', saida: { acao: no.acao, config: no.config || {} }, motivo: 'simulação: nada foi executado' };
      }
      const saida = await acao.executar(no.config || {}, ctx);
      if (saida && saida.bloqueado) {
        return { proximo: no.proximo, parar: !no.proximo, status: 'bloqueado', motivo: saida.motivo, saida };
      }
      return { proximo: no.proximo, parar: !no.proximo, status: 'ok', saida, contexto: saida && saida.contexto };
    }

    default:
      throw erro(400, `Tipo de nó não executável: ${no.tipo}`);
  }
}

function calcularEspera(no) {
  const min = Number(no.minutos || 0) + Number(no.horas || 0) * 60 + Number(no.dias || 0) * 1440;
  const ms = Math.min(Math.max(min, 1) * 60000, TIMEOUT_ESPERA_DIAS * 86400000);
  return new Date(Date.now() + ms).toISOString();
}

// -------------------------------------------------------- condições

/** Fonte permitida: `gatilho.*`, `contato.*` e `contexto.*`. Nada além. */
function valorDe(caminho, ctx) {
  const p = String(caminho || '').split('.');
  const raiz = p.shift();
  let base;
  if (raiz === 'contato') {
    if (!ctx.exec.contato_id) return null;
    base = require('../crm/app-repo').Contatos.obter(tenancy.tenantAtual(), ctx.exec.contato_id) || {};
  } else if (raiz === 'gatilho') {
    base = ctx.contexto.gatilho || {};
  } else if (raiz === 'contexto') {
    base = ctx.contexto;
  } else {
    return null;                       // fonte não permitida
  }
  return p.reduce((o, k) => (o == null ? null : o[k]), base);
}

const OPS = {
  igual: (a, b) => String(a == null ? '' : a) === String(b),
  diferente: (a, b) => String(a == null ? '' : a) !== String(b),
  contem: (a, b) => String(a == null ? '' : a).toLowerCase().includes(String(b).toLowerCase()),
  maior: (a, b) => Number(a) > Number(b),
  menor: (a, b) => Number(a) < Number(b),
  preenchido: (a) => !!String(a == null ? '' : a).trim(),
  vazio: (a) => !String(a == null ? '' : a).trim(),
  em: (a, b) => (Array.isArray(b) ? b : String(b).split(',')).map((x) => String(x).trim()).includes(String(a)),
};

function avaliarCondicoes(condicoes, juncao, ctx) {
  if (!condicoes.length) return true;
  const testar = (c) => {
    const op = OPS[c.operador];
    if (!op) return false;             // operador fora da lista: não passa
    return !!op(valorDe(c.campo, ctx), c.valor);
  };
  return juncao === 'qualquer' ? condicoes.some(testar) : condicoes.every(testar);
}

// ---------------------------------------------------------- ações
// Cada ação chama o serviço que JÁ existe. Nenhuma reimplementa regra:
// mensagem passa por conversas.responder e portanto continua sujeita a
// supressão e janela de canal. A automação não é caminho paralelo.

const ACOES = {
  'crm.atualizar_contato': {
    rotulo: 'Atualizar contato',
    async executar(config, ctx) {
      if (!ctx.exec.contato_id) return { bloqueado: true, motivo: 'a execução não tem contato' };
      const campos = {};
      for (const c of ['tipo', 'origem', 'responsavel', 'prioridade', 'interesse', 'produto_interesse', 'obs'])
        if (config[c] !== undefined) campos[c] = config[c];
      if (config.tags) campos.tags = config.tags;
      require('../crm/app-repo').Contatos.atualizar(tenancy.tenantAtual(), ctx.exec.contato_id, campos, 'automacao');
      return { campos: Object.keys(campos) };
    },
  },

  'crm.criar_tarefa': {
    rotulo: 'Criar tarefa',
    async executar(config, ctx) {
      const appRepo = require('../crm/app-repo');
      const t = appRepo.Tarefas.criar(tenancy.tenantAtual(), {
        titulo: config.titulo || 'Tarefa da automação',
        contato_id: ctx.exec.contato_id || '',
        responsavel: config.responsavel || '',
        vence_em: config.venceEm || new Date(Date.now() + (Number(config.emDias) || 1) * 86400000).toISOString().slice(0, 10),
        obs: config.obs || '',
      }, 'automacao');
      return { tarefa_id: t && (t.id || t) };
    },
  },

  'crm.mover_oportunidade': {
    rotulo: 'Mover oportunidade de etapa',
    async executar(config, ctx) {
      const oid = config.oportunidadeId || ctx.contexto.oportunidade_id;
      if (!oid) return { bloqueado: true, motivo: 'sem oportunidade no contexto' };
      require('../crm/app-repo').Oportunidades.mover(tenancy.tenantAtual(), oid, config.estagioId, 'automacao');
      return { oportunidade_id: oid, estagio: config.estagioId };
    },
  },

  'mensagem.enviar': {
    rotulo: 'Enviar mensagem na conversa',
    async executar(config, ctx) {
      const conversas = require('./conversas');
      const conversaId = config.conversaId || ctx.exec.conversa_id || ctx.contexto.conversa_id;
      if (!conversaId) return { bloqueado: true, motivo: 'sem conversa no contexto' };
      try {
        // passa por conversas.responder: supressão e janela continuam valendo
        const r = conversas.responder(conversaId, {
          texto: interpolar(config.texto || '', ctx),
          template: config.template || '', autorTipo: 'agente', autorId: 'automacao',
        });
        return { mensagem_id: r.mensagemId };
      } catch (e) {
        // bloqueio por supressão/janela não é falha da automação: é a regra funcionando
        if (e.status === 403 || e.status === 422) return { bloqueado: true, motivo: e.message };
        throw e;
      }
    },
  },

  'conversa.atribuir': {
    rotulo: 'Atribuir conversa',
    async executar(config, ctx) {
      const conversaId = config.conversaId || ctx.exec.conversa_id || ctx.contexto.conversa_id;
      if (!conversaId) return { bloqueado: true, motivo: 'sem conversa no contexto' };
      require('./conversas').atribuir(conversaId, { paraUsuario: config.usuario || '', paraFila: config.fila || '', motivo: 'automação' });
      return { conversa_id: conversaId };
    },
  },

  'contato.suprimir': {
    rotulo: 'Registrar opt-out',
    async executar(config, ctx) {
      const contato = ctx.exec.contato_id
        ? require('../crm/app-repo').Contatos.obter(tenancy.tenantAtual(), ctx.exec.contato_id) : null;
      if (!contato) return { bloqueado: true, motivo: 'sem contato' };
      const canal = config.canal || 'todos';
      require('./lgpd').suprimir({
        canal, valor: canal === 'email' ? contato.email : contato.telefone,
        motivo: 'opt_out', origem: 'automacao',
      });
      return { canal };
    },
  },

  'webhook.chamar': {
    rotulo: 'Chamar webhook externo',
    async executar(config, ctx) {
      const url = String(config.url || '');
      await validarUrlExterna(url);          // SSRF: sem isso a automação vira scanner da rede interna
      const resp = await fetch(url, {
        method: config.metodo === 'GET' ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: config.metodo === 'GET' ? undefined : JSON.stringify({
          workflow: ctx.wf.nome, execucao: ctx.exec.id,
          contato_id: ctx.exec.contato_id || null, dados: config.dados || {},
        }),
        redirect: 'manual',                  // redirecionamento pode levar para rede interna
        signal: AbortSignal.timeout(Number(config.timeoutMs) || 8000),
      });
      return { status: resp.status, ok: resp.ok };
    },
  },

  'agente.executar': {
    rotulo: 'Acionar agente de IA',
    async executar() {
      const e = new Error('Agentes chegam na Etapa 5 — esta ação ainda não tem executor.');
      e.status = 501; throw e;
    },
  },
};

/** `{{contato.nome}}` no texto da automação. */
function interpolar(texto, ctx) {
  return String(texto).replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, caminho) => {
    const v = valorDe(caminho, ctx);
    return v == null ? '' : String(v);
  });
}

/**
 * Proteção SSRF: sem isto, um assinante configura um webhook para
 * 169.254.169.254 ou 127.0.0.1 e usa a nossa automação para varrer a rede
 * interna do servidor.
 */
async function validarUrlExterna(url) {
  let u;
  try { u = new URL(url); } catch { throw erro(400, 'URL do webhook inválida.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw erro(400, 'O webhook precisa ser http ou https.');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw erro(400, 'Webhook para endereço interno não é permitido.');
  }
  const ips = [];
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) ips.push(host);
  else {
    try {
      const dns = require('dns').promises;
      const r = await dns.lookup(host, { all: true });
      for (const a of r) ips.push(a.address);
    } catch { throw erro(400, 'Não consegui resolver o endereço do webhook.'); }
  }
  for (const ip of ips) if (ehPrivado(ip)) throw erro(400, `Webhook aponta para endereço interno (${ip}) — bloqueado.`);
  return true;
}

function ehPrivado(ip) {
  if (ip.includes(':')) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

// ------------------------------------------------------- simulação

/** Roda sem efeito colateral: mostra o caminho que seria percorrido. */
async function simular(workflowId, { contato_id = '', gatilho = {} } = {}) {
  const wf = repo.buscar('gx_workflows', workflowId);
  if (!wf) throw erro(404, 'Automação não encontrada.');
  const versao = Number(wf.versao_publicada) || Number(wf.versao_rascunho) || 1;
  const exec = agendarExecucao(Object.assign({}, wf, { versao_publicada: versao }), {
    payload: Object.assign({ contato_id }, gatilho), simulacao: true,
  });
  if (!exec) throw erro(409, 'Não consegui montar a simulação.');
  await rodar(exec.id);
  return {
    execucao: repo.buscar('gx_workflow_execucoes', exec.id),
    passos: repo.listar('gx_workflow_passos', { onde: 'execucao_id = :e', params: { e: exec.id }, ordem: 'criado_em ASC', limite: 200 }),
  };
}

const execucoes = (workflowId, limite = 100) =>
  repo.listar('gx_workflow_execucoes', {
    onde: workflowId ? 'workflow_id = :w' : '', params: workflowId ? { w: workflowId } : {},
    ordem: 'iniciada_em DESC', limite,
  });

const passosDe = (execucaoId) =>
  repo.listar('gx_workflow_passos', { onde: 'execucao_id = :e', params: { e: execucaoId }, ordem: 'criado_em ASC', limite: 200 });

function cancelar(execucaoId, { motivo = '' } = {}) {
  const e = repo.buscar('gx_workflow_execucoes', execucaoId);
  if (!e) throw erro(404, 'Execução não encontrada.');
  if (['concluida', 'falha', 'cancelada'].includes(e.status)) return e;
  repo.atualizar('gx_workflow_execucoes', execucaoId, { status: 'cancelada', erro: motivo, concluida_em: nowISO() });
  repo.auditar({ acao: 'automacao.execucao_cancelada', entidade: 'gx_workflow_execucoes', entidadeId: execucaoId, detalhe: motivo });
  return repo.buscar('gx_workflow_execucoes', execucaoId);
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  GATILHOS, TIPOS_NO, ACOES, MAX_PASSOS,
  criar, salvarRascunho, publicar, reverter, pausar, listar, definicaoPublicada, validarDefinicao,
  ligarGatilhos, dispararPara, agendarExecucao, rodar, simular,
  execucoes, passosDe, cancelar, avaliarCondicoes, valorDe, interpolar, validarUrlExterna,
};
