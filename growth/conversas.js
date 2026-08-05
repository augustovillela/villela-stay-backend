// =====================================================================
// Villela Growth OS — inbox omnichannel (§9 do PROMPT_MASTER).
//
// A conversa é a unidade. Ela pertence a uma pessoa, chega por um canal e
// tem N mensagens. O domínio NÃO sabe se veio do WhatsApp, do chat do
// site ou do e-mail — quem sabe disso é o conector.
//
// Três regras que este arquivo faz valer, e que a interface não pode
// contornar porque a checagem é aqui:
//   1. supressão vence: quem pediu para não receber, não recebe;
//   2. política de janela do canal: fora da janela permitida, só template
//      aprovado (regra da plataforma, não nossa);
//   3. dois atendentes não respondem ao mesmo tempo sem aviso.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const identidade = require('./identidade');
const lgpd = require('./lgpd');
const { db, nowISO, novoId, j } = require('./db');

const CANAIS = ['chat_site', 'whatsapp', 'email', 'instagram', 'facebook', 'sms'];
const STATUS = ['aberta', 'pendente', 'resolvida', 'encerrada'];
const TRAVA_MIN = 2;                 // quanto tempo a trava de digitação dura

// Canal da conversa → canal de supressão. `chat_site` fica de fora de
// propósito: é o nosso widget, e quem escreve nele está pedindo resposta.
const SUPRESSAO_POR_CANAL = {
  email: { canal: 'email', campo: 'email', rotulo: 'e-mail' },
  whatsapp: { canal: 'whatsapp', campo: 'telefone', rotulo: 'WhatsApp' },
  sms: { canal: 'sms', campo: 'telefone', rotulo: 'SMS' },
};

// ------------------------------------------------------------- filas

function criarFila({ nome, descricao = '', canais = [], equipeId = '', distribuicao = 'manual',
  slaPrimeiraMin = 0, slaResolucaoMin = 0, padrao = false }) {
  if (!nome) throw erro(400, 'A fila precisa de um nome.');
  const id = repo.inserir('gx_filas', {
    nome, descricao, canais: j.str(canais), equipe_id: equipeId,
    distribuicao: ['manual', 'round_robin', 'menos_ocupado'].includes(distribuicao) ? distribuicao : 'manual',
    sla_primeira_min: Number(slaPrimeiraMin) || 0, sla_resolucao_min: Number(slaResolucaoMin) || 0,
    padrao: padrao ? 1 : 0,
  });
  return repo.buscar('gx_filas', id);
}

const filas = () => repo.listar('gx_filas', { ordem: 'padrao DESC, nome ASC' });

function filaDoCanal(canal) {
  const todas = filas();
  return todas.find((f) => (j.parse(f.canais, []) || []).includes(canal)) || todas.find((f) => f.padrao) || null;
}

// --------------------------------------------------------- conversas

/**
 * Acha a conversa pela chave do canal ou abre uma nova. O índice único
 * (tenant, canal, chave_externa) garante que a mesma thread não vire duas
 * conversas mesmo com dois webhooks chegando ao mesmo tempo.
 */
function localizarOuAbrir({ canal, chaveExterna, conexaoId = '', contatoId = '', assunto = '', filaId = '' }) {
  if (!CANAIS.includes(canal)) throw erro(400, `Canal desconhecido: ${canal}`);
  if (!chaveExterna) throw erro(400, 'A conversa precisa de uma chave de origem.');

  const existente = repo.um(
    'SELECT * FROM gx_conversas WHERE tenant_id = :tenant AND canal = :c AND chave_externa = :k',
    { c: canal, k: String(chaveExterna).slice(0, 200) }
  );
  if (existente) {
    // conversa encerrada que recebe mensagem nova volta a abrir
    if (existente.status === 'encerrada' || existente.status === 'resolvida') {
      repo.atualizar('gx_conversas', existente.id, { status: 'aberta', encerrada_em: '' });
    }
    if (contatoId && !existente.contato_id) repo.atualizar('gx_conversas', existente.id, { contato_id: contatoId });
    return repo.buscar('gx_conversas', existente.id);
  }

  const fila = filaId ? repo.buscar('gx_filas', filaId) : filaDoCanal(canal);
  const id = repo.inserir('gx_conversas', {
    contato_id: contatoId, canal, conexao_id: conexaoId,
    chave_externa: String(chaveExterna).slice(0, 200), assunto: String(assunto).slice(0, 200),
    status: 'aberta', fila_id: fila ? fila.id : '',
  });
  return repo.buscar('gx_conversas', id);
}

/**
 * Mensagem que CHEGOU. Resolve a pessoa pela identidade do canal, abre ou
 * reabre a conversa, atualiza SLA e contadores.
 */
function registrarEntrada({
  canal, chaveExterna, conexaoId = '', texto = '', tipo = 'texto', anexos = [],
  externaId = '', identidades = [], dadosContato = {}, assunto = '', em = null,
}) {
  const conversaExiste = repo.um(
    'SELECT * FROM gx_conversas WHERE tenant_id = :tenant AND canal = :c AND chave_externa = :k',
    { c: canal, k: String(chaveExterna).slice(0, 200) }
  );

  // quem é? só resolve identidade se houver chave utilizável
  let contatoId = conversaExiste ? conversaExiste.contato_id : '';
  if (!contatoId && identidades.length) {
    contatoId = identidade.resolver({ identidades, dados: dadosContato, origem: canal }).contatoId;
  }

  const conversa = localizarOuAbrir({ canal, chaveExterna, conexaoId, contatoId, assunto });
  const agora = em || nowISO();

  const idem = externaId ? `msg:${conversa.tenant_id}:${canal}:${externaId}` : '';
  let mensagemId;
  try {
    mensagemId = repo.inserir('gx_mensagens', {
      conversa_id: conversa.id, contato_id: contatoId, direcao: 'entrada', autor_tipo: 'contato',
      autor_id: contatoId, tipo, texto: String(texto).slice(0, 8000), anexos: j.str(anexos),
      status: 'recebida', externa_id: externaId, chave_idem: idem, criado_em: agora,
    });
  } catch (e) {
    // reentrega do mesmo webhook: não duplica a mensagem
    if (idem && /UNIQUE|constraint/i.test(String(e.message))) {
      return { conversa, duplicada: true, mensagemId: null };
    }
    throw e;
  }

  // SLA de primeira resposta começa a contar na PRIMEIRA mensagem do cliente
  const patch = {
    ultima_em: agora, ultima_de: 'cliente',
    nao_lidas: Number(conversa.nao_lidas || 0) + 1,
    total_mensagens: Number(conversa.total_mensagens || 0) + 1,
  };
  if (!conversa.primeira_em) {
    patch.primeira_em = agora;
    const fila = conversa.fila_id ? repo.buscar('gx_filas', conversa.fila_id) : null;
    const min = fila ? Number(fila.sla_primeira_min) || 0 : 0;
    if (min) patch.sla_primeira_venc = new Date(new Date(agora).getTime() + min * 60000).toISOString();
  }
  repo.atualizar('gx_conversas', conversa.id, patch);

  eventos.publicar('message.received', {
    refTipo: 'conversa', refId: conversa.id,
    payload: { canal, contato_id: contatoId, mensagem_id: mensagemId, tipo, tem_texto: !!texto },
    chaveIdem: idem ? `ev:${idem}` : '', origem: 'webhook',
  });

  return { conversa: repo.buscar('gx_conversas', conversa.id), mensagemId, contatoId, duplicada: false };
}

// -------------------------------------------------------- saída

/**
 * Prepara e enfileira uma resposta. NÃO fala com a API do canal aqui: a
 * entrega é job, para ter retry, timeout e DLQ como qualquer trabalho.
 *
 * `forcar` só existe para o caso de o operador assumir a conversa de
 * outro atendente conscientemente.
 */
function responder(conversaId, {
  texto = '', tipo = 'texto', anexos = [], autorId = null, autorTipo = 'usuario',
  interna = false, template = '', forcar = false,
}) {
  const conversa = repo.buscar('gx_conversas', conversaId);
  if (!conversa) throw erro(404, 'Conversa não encontrada.');
  if (!texto && !anexos.length && !template) throw erro(400, 'A resposta está vazia.');
  const autor = autorId || tenancy.userAtual();

  // nota interna não sai para o cliente: pula todas as travas de canal
  if (interna) return gravarSaida(conversa, { texto, tipo: 'nota', anexos, autor, autorTipo, interna: true, status: 'enviada' });

  // 1) trava anti-colisão
  const dono = travaAtiva(conversa);
  if (dono && dono !== autor && !forcar) {
    throw erro(409, `${dono} está respondendo esta conversa agora. Avise antes de assumir, ou use forçar.`);
  }

  // 2) supressão vence automação — verificado aqui, não na tela.
  //
  // A supressão é POR CANAL e vale para o que NÓS iniciamos. Quem pediu
  // para não receber WhatsApp não fica impedido de ser respondido no chat
  // do site, onde ele mesmo acabou de escrever — silenciar alguém que está
  // falando conosco não é respeitar o opt-out, é abandonar o cliente.
  const supressao = SUPRESSAO_POR_CANAL[conversa.canal];
  if (supressao && conversa.contato_id) {
    const contato = require('../crm/app-repo').Contatos.obter(tenancy.tenantAtual(), conversa.contato_id);
    const valor = supressao.campo === 'email' ? (contato && contato.email) : (contato && (contato.whatsapp || contato.telefone));
    if (valor && lgpd.estaSuprimido(supressao.canal, valor)) {
      throw erro(403, `Este contato pediu para não receber mensagens por ${supressao.rotulo}. O envio foi bloqueado.`);
    }
  }

  // 3) política de janela do canal (regra da plataforma, não nossa)
  const politica = politicaDeJanela(conversa);
  if (!politica.podeTextoLivre && !template) {
    throw erro(422, politica.motivo);
  }

  return gravarSaida(conversa, { texto, tipo, anexos, autor, autorTipo, interna: false, template, status: 'enfileirada' });
}

function gravarSaida(conversa, { texto, tipo, anexos, autor, autorTipo, interna, template = '', status }) {
  const agora = nowISO();
  const mensagemId = repo.inserir('gx_mensagens', {
    conversa_id: conversa.id, contato_id: conversa.contato_id, direcao: 'saida',
    autor_tipo: autorTipo, autor_id: autor, tipo, texto: String(texto).slice(0, 8000),
    anexos: j.str(anexos), interna: interna ? 1 : 0, status, template, criado_em: agora,
  });

  const patch = {
    ultima_em: agora, ultima_de: autorTipo === 'agente' ? 'agente' : 'equipe',
    total_mensagens: Number(conversa.total_mensagens || 0) + 1,
  };
  if (!interna) {
    patch.nao_lidas = 0;
    if (!conversa.primeira_resposta_em) {
      patch.primeira_resposta_em = agora;
      if (conversa.sla_primeira_venc && agora > conversa.sla_primeira_venc) patch.sla_estourado = 1;
    }
  }
  repo.atualizar('gx_conversas', conversa.id, patch);

  if (!interna) {
    // a entrega vira job: retry, timeout e DLQ como qualquer trabalho
    require('./fila').enfileirar({
      tipo: 'mensagem:entregar', fila: 'mensagens', prioridade: 2,
      payload: { conversaId: conversa.id, mensagemId, canal: conversa.canal },
      chaveIdem: `entrega:${mensagemId}`,
    });
    eventos.publicar('message.sent', {
      refTipo: 'conversa', refId: conversa.id,
      payload: { canal: conversa.canal, mensagem_id: mensagemId, autor_tipo: autorTipo, template: template || null },
      chaveIdem: `msgsent:${mensagemId}`,
    });
  }
  return { mensagemId, conversa: repo.buscar('gx_conversas', conversa.id) };
}

/**
 * Regra de janela do canal. Para o WhatsApp, a plataforma só permite texto
 * livre dentro de 24h desde a última mensagem do cliente; fora disso, é
 * template aprovado. Está aqui porque é decisão de negócio verificável —
 * o conector real só executa.
 */
function politicaDeJanela(conversa) {
  if (conversa.canal !== 'whatsapp') return { podeTextoLivre: true, motivo: '' };
  const ultimaEntrada = repo.um(
    "SELECT criado_em FROM gx_mensagens WHERE tenant_id = :tenant AND conversa_id = :c AND direcao = 'entrada' " +
    'ORDER BY criado_em DESC LIMIT 1', { c: conversa.id }
  );
  if (!ultimaEntrada) {
    return { podeTextoLivre: false, motivo: 'Sem mensagem do cliente nesta conversa: o primeiro contato por WhatsApp exige template aprovado.' };
  }
  const horas = (Date.now() - new Date(ultimaEntrada.criado_em).getTime()) / 3600000;
  if (horas > 24) {
    return { podeTextoLivre: false, horas: Math.round(horas), motivo: `A janela de 24h do WhatsApp fechou (última mensagem do cliente há ${Math.round(horas)}h). Use um template aprovado.` };
  }
  return { podeTextoLivre: true, motivo: '', horasRestantes: Math.max(0, 24 - horas) };
}

// ------------------------------------------------- atribuição e trava

function atribuir(conversaId, { paraUsuario = '', paraFila = '', motivo = '' }) {
  const conversa = repo.buscar('gx_conversas', conversaId);
  if (!conversa) throw erro(404, 'Conversa não encontrada.');
  const de = conversa.responsavel;
  repo.inserir('gx_atribuicoes', {
    conversa_id: conversaId, de_usuario: de, para_usuario: paraUsuario, para_fila: paraFila, motivo,
  });
  repo.atualizar('gx_conversas', conversaId, {
    responsavel: paraUsuario || '', fila_id: paraFila || conversa.fila_id, editando_por: '', editando_ate: '',
  });
  eventos.publicar('conversation.assigned', {
    refTipo: 'conversa', refId: conversaId,
    payload: { de, para: paraUsuario || paraFila, motivo },
  });
  repo.auditar({ acao: 'conversa.atribuida', entidade: 'gx_conversas', entidadeId: conversaId, detalhe: `${de || '—'} → ${paraUsuario || paraFila}` });
  return repo.buscar('gx_conversas', conversaId);
}

/** Distribuição automática da fila. Devolve o usuário escolhido, ou ''. */
function proximoAtendente(filaId) {
  const fila = repo.buscar('gx_filas', filaId);
  if (!fila || fila.distribuicao === 'manual') return '';
  const membros = fila.equipe_id
    ? repo.listar('gx_equipe_membros', { onde: 'equipe_id = :e', params: { e: fila.equipe_id }, limite: 200 }).map((m) => m.user_id)
    : [];
  if (!membros.length) return '';
  if (fila.distribuicao === 'menos_ocupado') {
    const carga = membros.map((u) => ({
      u, n: (repo.um("SELECT COUNT(*) AS n FROM gx_conversas WHERE tenant_id = :tenant AND responsavel = :u AND status = 'aberta'", { u }) || {}).n || 0,
    }));
    carga.sort((a, b) => a.n - b.n);
    return carga[0].u;
  }
  // round robin: quem recebeu há mais tempo
  const ultima = repo.um('SELECT para_usuario FROM gx_atribuicoes WHERE tenant_id = :tenant ORDER BY criado_em DESC LIMIT 1');
  const i = ultima ? membros.indexOf(ultima.para_usuario) : -1;
  return membros[(i + 1) % membros.length];
}

const travaAtiva = (conversa) =>
  (conversa.editando_por && conversa.editando_ate && conversa.editando_ate > nowISO()) ? conversa.editando_por : '';

/** Avisa que estou digitando. Devolve quem já estava, se houver conflito. */
function assumirDigitacao(conversaId, userId = null) {
  const conversa = repo.buscar('gx_conversas', conversaId);
  if (!conversa) throw erro(404, 'Conversa não encontrada.');
  const eu = userId || tenancy.userAtual();
  const dono = travaAtiva(conversa);
  if (dono && dono !== eu) return { ok: false, ocupadaPor: dono };
  repo.atualizar('gx_conversas', conversaId, {
    editando_por: eu, editando_ate: new Date(Date.now() + TRAVA_MIN * 60000).toISOString(),
  });
  return { ok: true, ocupadaPor: '' };
}

const liberarDigitacao = (conversaId) => repo.atualizar('gx_conversas', conversaId, { editando_por: '', editando_ate: '' });

function encerrar(conversaId, { status = 'resolvida', motivo = '' } = {}) {
  if (!STATUS.includes(status)) throw erro(400, `Status inválido: ${status}`);
  const conversa = repo.buscar('gx_conversas', conversaId);
  if (!conversa) throw erro(404, 'Conversa não encontrada.');
  repo.atualizar('gx_conversas', conversaId, {
    status, encerrada_em: nowISO(), editando_por: '', editando_ate: '', nao_lidas: 0,
  });
  repo.auditar({ acao: 'conversa.encerrada', entidade: 'gx_conversas', entidadeId: conversaId, detalhe: `${status}. ${motivo}` });
  return repo.buscar('gx_conversas', conversaId);
}

const marcarLida = (conversaId) => repo.atualizar('gx_conversas', conversaId, { nao_lidas: 0 });

// ------------------------------------------------------------ leitura

/** A caixa de entrada. Filtros são os que a tela realmente usa. */
function caixa({ status = 'aberta', canal = '', responsavel = '', filaId = '', busca = '', limite = 100 } = {}) {
  const cond = [];
  const params = {};
  if (status && status !== 'todas') { cond.push('status = :st'); params.st = status; }
  if (canal) { cond.push('canal = :ca'); params.ca = canal; }
  if (responsavel) { cond.push('responsavel = :re'); params.re = responsavel; }
  if (filaId) { cond.push('fila_id = :fi'); params.fi = filaId; }
  if (busca) { cond.push('(assunto LIKE :bu OR resumo LIKE :bu)'); params.bu = `%${busca}%`; }
  return repo.listar('gx_conversas', {
    onde: cond.join(' AND '), params, ordem: 'ultima_em DESC, criado_em DESC', limite,
  });
}

function conversa(id, { limiteMensagens = 200 } = {}) {
  const c = repo.buscar('gx_conversas', id);
  if (!c) return null;
  return Object.assign({}, c, {
    mensagens: repo.listar('gx_mensagens', {
      onde: 'conversa_id = :c', params: { c: id }, ordem: 'criado_em ASC', limite: limiteMensagens,
    }),
    atribuicoes: repo.listar('gx_atribuicoes', { onde: 'conversa_id = :c', params: { c: id }, ordem: 'criado_em ASC', limite: 50 }),
    janela: politicaDeJanela(c),
    trava: travaAtiva(c),
  });
}

/** Conversas com SLA de primeira resposta vencendo ou vencido. */
function slaEmRisco() {
  return repo.listar('gx_conversas', {
    onde: "status = 'aberta' AND primeira_resposta_em = '' AND sla_primeira_venc != '' AND sla_primeira_venc <= :limite",
    params: { limite: new Date(Date.now() + 15 * 60000).toISOString() },
    ordem: 'sla_primeira_venc ASC', limite: 100,
  });
}

// -------------------------------------------------- respostas salvas

function salvarResposta({ atalho, titulo, texto, canais = [] }) {
  if (!atalho || !texto) throw erro(400, 'A resposta salva precisa de atalho e texto.');
  const a = atalho.startsWith('/') ? atalho : '/' + atalho;
  const id = repo.inserir('gx_respostas_salvas', { atalho: a, titulo: titulo || a, texto, canais: j.str(canais) });
  return repo.buscar('gx_respostas_salvas', id);
}

const respostasSalvas = () => repo.listar('gx_respostas_salvas', { ordem: 'usos DESC, atalho ASC' });

/** Aplica as variáveis do contato no texto salvo. */
function aplicarResposta(atalho, contatoId) {
  const r = repo.um('SELECT * FROM gx_respostas_salvas WHERE tenant_id = :tenant AND atalho = :a', { a: atalho });
  if (!r) throw erro(404, `Resposta salva "${atalho}" não existe.`);
  let texto = r.texto;
  if (contatoId) {
    const c = require('../crm/app-repo').Contatos.obter(tenancy.tenantAtual(), contatoId);
    if (c) {
      texto = texto.replace(/\{\{\s*nome\s*\}\}/gi, c.nome || '')
        .replace(/\{\{\s*empresa\s*\}\}/gi, c.empresa_nome || '')
        .replace(/\{\{\s*cidade\s*\}\}/gi, c.cidade || '');
    }
  }
  repo.exec('UPDATE gx_respostas_salvas SET usos = usos + 1 WHERE id = :id AND tenant_id = :tenant', { id: r.id });
  return texto;
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  CANAIS, STATUS, TRAVA_MIN,
  criarFila, filas, filaDoCanal,
  localizarOuAbrir, registrarEntrada, responder, politicaDeJanela,
  atribuir, proximoAtendente, assumirDigitacao, liberarDigitacao, travaAtiva,
  encerrar, marcarLida, caixa, conversa, slaEmRisco,
  salvarResposta, respostasSalvas, aplicarResposta,
};
