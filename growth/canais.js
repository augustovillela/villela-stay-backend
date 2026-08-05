// =====================================================================
// Villela Growth OS — conexões de canal, ingestão e entrega.
//
// É a fronteira entre o mundo lá fora e o domínio. Duas regras do §27 do
// PROMPT_MASTER vivem aqui:
//
//   1. objeto de plataforma NUNCA entra no domínio — o payload bruto fica
//      guardado em gx_webhook_eventos só para auditoria, e o domínio só vê
//      o evento normalizado pelo conector;
//   2. a interface não oferece o que getCapabilities() não confirmar — a
//      capacidade é resolvida POR CONEXÃO, porque duas contas da mesma
//      rede podem ter permissões diferentes.
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const conversas = require('./conversas');
const conectores = require('./conectores');
const segredos = require('./segredos');
const { db, nowISO, j } = require('./db');

// ------------------------------------------------------- conexões

/** Liga uma conta do assinante a uma integração. Credencial vai no cofre. */
async function conectar({ integracao, nome = '', contaExternaId = '', credenciais = null, webhookSegredo = null }) {
  const conector = conectores.obter(integracao);
  if (!conector) throw erro(404, `Integração desconhecida: ${integracao}`);

  const id = repo.inserir('gx_conexoes', {
    integracao, nome: nome || conector.nome, conta_externa_id: contaExternaId, status: 'pendente',
  });

  // credencial NUNCA na tabela da conexão: cofre cifrado, referência aqui
  if (credenciais) {
    for (const [chave, valor] of Object.entries(credenciais)) {
      segredos.guardar({ escopo: 'conexao', refId: id, chave, valor });
    }
    repo.atualizar('gx_conexoes', id, { segredo_ref: id });
  }
  if (webhookSegredo) {
    segredos.guardar({ escopo: 'conexao', refId: id, chave: 'webhook_segredo', valor: webhookSegredo });
    repo.atualizar('gx_conexoes', id, { webhook_segredo: id });
  }

  // capacidade real desta conta — não a promessa genérica da integração
  let capacidades = {};
  let status = 'pendente';
  let erroConexao = '';
  try {
    capacidades = await conector.getCapabilities(id);
    const saude = await conector.healthCheck(id);
    status = saude && saude.ok ? 'ativa' : 'pendente';
  } catch (e) {
    erroConexao = e.message;
    status = 'pendente';
  }
  repo.atualizar('gx_conexoes', id, { capacidades: j.str(capacidades), status, ultimo_erro: erroConexao });

  repo.auditar({ acao: 'canal.conectado', entidade: 'gx_conexoes', entidadeId: id, detalhe: `${integracao} (${status})` });
  return repo.buscar('gx_conexoes', id);
}

const conexoes = () => repo.listar('gx_conexoes', { ordem: 'criado_em DESC' }).map((c) =>
  Object.assign({}, c, { capacidades: j.parse(c.capacidades, {}) }));

const conexaoDe = (integracao) =>
  repo.um("SELECT * FROM gx_conexoes WHERE tenant_id = :tenant AND integracao = :i AND excluido_em = '' " +
    "ORDER BY CASE status WHEN 'ativa' THEN 0 ELSE 1 END LIMIT 1", { i: integracao });

/**
 * O que ESTA conta pode fazer. Vem da conexão, não da integração — é o que
 * a tela precisa ler antes de mostrar qualquer botão.
 */
function capacidades(integracao) {
  const c = conexaoDe(integracao);
  if (!c) {
    const conector = conectores.obter(integracao);
    return { conectado: false, capacidades: conector ? conector.capacidadesPadrao : {}, status: conector ? conector.status : 'indisponivel' };
  }
  return { conectado: c.status === 'ativa', capacidades: j.parse(c.capacidades, {}), status: c.status, conexaoId: c.id };
}

/** Verifica saúde de todas as conexões da conta e abre incidente se caiu. */
async function verificarSaude() {
  const out = [];
  for (const c of conexoes()) {
    const conector = conectores.obter(c.integracao);
    if (!conector) continue;
    let saude;
    try { saude = await conector.healthCheck(c.id); }
    catch (e) { saude = { ok: false, erro: e.message }; }
    const status = saude.ok ? 'ativa' : (c.status === 'ativa' ? 'degradada' : c.status);
    repo.atualizar('gx_conexoes', c.id, {
      ultimo_health: saude.ok ? 'ok' : 'falha', ultimo_health_em: nowISO(),
      ultimo_erro: saude.ok ? '' : (saude.erro || saude.bloqueio || ''), status,
    });
    if (!saude.ok && c.status === 'ativa') {
      require('./incidentes').abrir({
        natureza: 'integracao', severidade: 'alta',
        titulo: `Canal ${conector.nome} parou de responder`,
        detalhe: saude.erro || saude.bloqueio || '', refTipo: 'conexao', refId: c.id,
      });
      eventos.publicar('integration.disconnected', {
        refTipo: 'conexao', refId: c.id, payload: { integracao: c.integracao, motivo: saude.erro || '' },
      });
    }
    out.push({ integracao: c.integracao, ok: !!saude.ok, status });
  }
  return out;
}

// -------------------------------------------------------- ingestão

/**
 * Pipeline de entrada. A ordem importa e é a mesma do §31 do prompt:
 * webhook validado → deduplicado → payload bruto guardado → normalizado →
 * conversa localizada → contato identificado → evento emitido.
 *
 * Roda FORA de contexto de tenant: o tenant vem da conexão, nunca do corpo.
 */
async function receberWebhook({ integracao, corpo, cabecalhos = {}, conexaoId = '', tenantId = '' }) {
  const conector = conectores.obter(integracao);
  if (!conector) throw erro(404, `Integração desconhecida: ${integracao}`);

  // 1) assinatura. Conector que não sabe validar RECUSA — não passa reto.
  let assinaturaOk = false;
  let motivo = '';
  try {
    assinaturaOk = await conector.verifyWebhook({ corpo, cabecalhos, conexaoId });
  } catch (e) {
    motivo = e.message;
  }

  // 2) dedupe pelo conteúdo: reentrega do mesmo webhook não vira dois eventos
  const idem = 'wh:' + crypto.createHash('sha256')
    .update(integracao + '|' + JSON.stringify(corpo || {})).digest('base64url').slice(0, 32);

  const gravar = () => {
    try {
      return repo.inserirPlataforma('gx_webhook_eventos', {
        integracao, conexao_id: conexaoId, tenant_id: tenantId,
        assinatura_ok: assinaturaOk ? 1 : 0,
        payload: JSON.stringify(corpo || {}).slice(0, 20000),
        chave_idem: idem, recebido_em: nowISO(),
        erro: assinaturaOk ? '' : (motivo || 'assinatura não verificada'),
      });
    } catch (e) {
      if (/UNIQUE|constraint/i.test(String(e.message))) return null;   // já recebido
      throw e;
    }
  };

  const brutoId = tenancy.comoPlataforma({ userId: 'webhook', motivo: `webhook ${integracao}` }, gravar);
  if (!brutoId) return { ok: true, duplicado: true };
  if (!assinaturaOk) return { ok: false, recusado: 'assinatura', motivo: motivo || 'assinatura não verificada', brutoId };

  // 3) normaliza — daqui para dentro o domínio não vê objeto de plataforma
  const normalizados = await conector.normalizeInbound(corpo);
  if (!normalizados.length) {
    tenancy.comoPlataforma({ userId: 'webhook', motivo: 'webhook sem mensagem' }, () =>
      repo.execPlataforma("UPDATE gx_webhook_eventos SET processado_em = :em, erro = 'nada a processar' WHERE id = :id",
        { em: nowISO(), id: brutoId }));
    return { ok: true, mensagens: 0 };
  }

  // 4) o tenant vem da CONEXÃO
  const tid = tenantId || (conexaoId ? (db.prepare('SELECT tenant_id FROM gx_conexoes WHERE id = ?').get(conexaoId) || {}).tenant_id : '');
  if (!tid) throw erro(400, 'Não consegui identificar a conta dona deste webhook.');

  const resultados = tenancy.comTenant({ tenantId: tid, userId: 'webhook' }, () =>
    normalizados.map((m) => conversas.registrarEntrada(Object.assign({ conexaoId }, m))));

  tenancy.comoPlataforma({ userId: 'webhook', motivo: 'webhook processado' }, () =>
    repo.execPlataforma('UPDATE gx_webhook_eventos SET processado_em = :em WHERE id = :id', { em: nowISO(), id: brutoId }));

  return {
    ok: true, brutoId,
    mensagens: resultados.filter((r) => !r.duplicada).length,
    duplicadas: resultados.filter((r) => r.duplicada).length,
    conversas: resultados.map((r) => r.conversa.id),
  };
}

// --------------------------------------------------------- entrega

/**
 * Handler do job `mensagem:entregar`. Roda no contexto do tenant dono da
 * mensagem (a fila garante isso) e é idempotente por chave.
 */
async function entregar({ conversaId, mensagemId }) {
  const conversa = repo.buscar('gx_conversas', conversaId);
  const mensagem = repo.buscar('gx_mensagens', mensagemId);
  if (!conversa || !mensagem) throw erro(404, 'Mensagem ou conversa não encontrada.');
  if (mensagem.status === 'enviada' || mensagem.status === 'entregue') return { ok: true, jaEnviada: true };

  const integracao = INTEGRACAO_DO_CANAL[conversa.canal];
  const conector = integracao ? conectores.obter(integracao) : null;
  if (!conector) {
    repo.atualizar('gx_mensagens', mensagemId, { status: 'falhou', erro: `Sem conector para o canal ${conversa.canal}.` });
    throw erro(501, `Sem conector para o canal ${conversa.canal}.`);
  }

  // destino: como falar com essa pessoa neste canal
  const destino = destinoDe(conversa);
  try {
    const r = await conector.enviarMensagem({
      mensagemId, conexaoId: conversa.conexao_id, para: destino,
      texto: mensagem.texto, assunto: conversa.assunto, template: mensagem.template,
    });
    repo.atualizar('gx_mensagens', mensagemId, {
      status: r.status || 'enviada', externa_id: r.externaId || '', erro: '',
    });
    return { ok: true, externaId: r.externaId };
  } catch (e) {
    repo.atualizar('gx_mensagens', mensagemId, { status: 'falhou', erro: String(e.message).slice(0, 400) });
    throw e;   // deixa a fila reagendar; esgotado, vai para a DLQ e vira incidente
  }
}

const INTEGRACAO_DO_CANAL = {
  chat_site: 'chat_site',
  whatsapp: 'whatsapp_cloud',
  email: 'email',
  instagram: 'instagram_dm',
  facebook: 'facebook_messenger',
};

function destinoDe(conversa) {
  if (conversa.canal === 'chat_site') return conversa.chave_externa;
  if (!conversa.contato_id) return conversa.chave_externa;
  const c = require('../crm/app-repo').Contatos.obter(tenancy.tenantAtual(), conversa.contato_id);
  if (!c) return conversa.chave_externa;
  return conversa.canal === 'email' ? c.email : (c.whatsapp || c.telefone || conversa.chave_externa);
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  conectar, conexoes, conexaoDe, capacidades, verificarSaude,
  receberWebhook, entregar, INTEGRACAO_DO_CANAL,
};
