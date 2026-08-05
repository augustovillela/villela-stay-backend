// =====================================================================
// Villela Growth OS — captura de leads (§7 e §8 do PROMPT_MASTER).
//
// Formulários com endpoint público, procedência completa e proteção
// contra spam, bot, duplicata e abuso. Toda submissão passa pela
// resolução de identidade: formulário preenchido por quem já é conhecido
// atualiza a ficha, não cria outra.
//
// Privacidade: o IP NUNCA é gravado em claro — só o hash, e só para
// limitar abuso. O que fica é a procedência (UTM, referrer, página).
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const identidade = require('./identidade');
const entitlements = require('./entitlements');
const { db, nowISO, novoId, j } = require('./db');

const TIPOS_CAMPO = ['texto', 'email', 'telefone', 'numero', 'data', 'selecao', 'multipla', 'textarea', 'checkbox', 'oculto'];

// Campos do contato que um campo de formulário pode alimentar.
const MAPEAVEIS = ['nome', 'sobrenome', 'email', 'telefone', 'whatsapp', 'empresa_nome', 'cargo',
  'cidade', 'estado', 'interesse', 'produto_interesse', 'primeira_mensagem', 'orcamento_centavos'];

const LIMITE_JANELA_MIN = 10;     // janela do rate limit
const LIMITE_POR_IP = 8;          // submissões por janela, por formulário
const JANELA_DEDUPE_MIN = 30;     // mesma pessoa, mesmo conteúdo, dentro disso = duplicata

// ------------------------------------------------------- formulários

function criar({ nome, slug, tipo = 'formulario', campos = [], config = {} }) {
  if (!nome) throw erro(400, 'O formulário precisa de um nome.');
  const s = (slug || nome).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  if (!s) throw erro(400, 'Não consegui gerar um endereço a partir desse nome.');
  if (repo.um('SELECT id FROM gx_formularios WHERE tenant_id = :tenant AND slug = :s', { s })) {
    throw erro(409, `Já existe um formulário com o endereço "${s}".`);
  }
  entitlements.exigirDentroDoLimite('formularios', repo.contar('gx_formularios'));

  const id = repo.inserir('gx_formularios', {
    nome, slug: s, tipo, campos: j.str(validarCampos(campos)), config: j.str(config),
    token: 'gf_' + crypto.randomBytes(12).toString('base64url'), status: 'rascunho',
  });
  repo.auditar({ acao: 'formulario.criado', entidade: 'gx_formularios', entidadeId: id, detalhe: nome });
  return repo.buscar('gx_formularios', id);
}

function validarCampos(campos) {
  const out = [];
  for (const c of (Array.isArray(campos) ? campos : [])) {
    if (!c || !c.chave) continue;
    const tipo = TIPOS_CAMPO.includes(c.tipo) ? c.tipo : 'texto';
    const mapeia = MAPEAVEIS.includes(c.mapeia) ? c.mapeia : '';
    out.push({
      chave: String(c.chave).slice(0, 40),
      rotulo: String(c.rotulo || c.chave).slice(0, 120),
      tipo, obrigatorio: !!c.obrigatorio, mapeia,
      opcoes: Array.isArray(c.opcoes) ? c.opcoes.slice(0, 50).map((o) => String(o).slice(0, 80)) : [],
    });
  }
  return out;
}

function atualizar(id, dados = {}) {
  const f = repo.buscar('gx_formularios', id);
  if (!f) throw erro(404, 'Formulário não encontrado.');
  const patch = {};
  if (dados.nome) patch.nome = dados.nome;
  if (dados.campos) patch.campos = j.str(validarCampos(dados.campos));
  if (dados.config) patch.config = j.str(dados.config);
  repo.atualizar('gx_formularios', id, patch);
  return repo.buscar('gx_formularios', id);
}

function publicar(id) {
  const f = repo.buscar('gx_formularios', id);
  if (!f) throw erro(404, 'Formulário não encontrado.');
  const campos = j.parse(f.campos, []);
  if (!campos.length) throw erro(400, 'Publique com pelo menos um campo.');
  if (!campos.some((c) => c.mapeia === 'email' || c.mapeia === 'telefone' || c.mapeia === 'whatsapp')) {
    throw erro(400, 'O formulário precisa capturar ao menos e-mail ou telefone — sem isso não há como identificar quem respondeu.');
  }
  repo.atualizar('gx_formularios', id, { status: 'publicado', publicado_em: nowISO() });
  repo.auditar({ acao: 'formulario.publicado', entidade: 'gx_formularios', entidadeId: id });
  return repo.buscar('gx_formularios', id);
}

const listar = (limite = 200) => repo.listar('gx_formularios', { ordem: 'criado_em DESC', limite });

/** Busca pelo token público. Fora de contexto de tenant — é a porta de entrada. */
function porToken(token) {
  const f = db.prepare("SELECT * FROM gx_formularios WHERE token = ? AND status = 'publicado' AND excluido_em = ''").get(String(token || ''));
  return f || null;
}

// -------------------------------------------------------- submissão

const hashIp = (ip, tenantId) =>
  crypto.createHash('sha256').update(`${tenantId}|${ip || ''}|${process.env.JWT_SECRET || 'sal'}`).digest('base64url').slice(0, 22);

/**
 * Recebe uma submissão pública. Devolve {ok, contatoId, respostaId} ou
 * lança com status HTTP adequado. Roda dentro do tenant DONO do formulário
 * — nunca do que veio na requisição.
 */
function submeter(token, {
  dados = {}, procedencia = {}, ip = '', userAgent = '', honeypot = '', visitanteId = '', consentimento = false,
} = {}) {
  const form = porToken(token);
  if (!form) throw erro(404, 'Formulário não encontrado ou fora do ar.');

  return tenancy.comTenant({ tenantId: form.tenant_id, userId: 'captura', correlationId: tenancy.correlationId() }, () => {
    const ipHash = hashIp(ip, form.tenant_id);

    // 1) armadilha de bot: campo invisível preenchido = robô
    if (String(honeypot || '').trim()) return descartar(form, dados, ipHash, userAgent, 'honeypot');

    // 2) excesso de submissões da mesma origem
    const desde = new Date(Date.now() - LIMITE_JANELA_MIN * 60000).toISOString();
    const recentes = repo.um(
      'SELECT COUNT(*) AS n FROM gx_form_respostas WHERE tenant_id = :tenant AND formulario_id = :f AND ip_hash = :ip AND criado_em >= :desde',
      { f: form.id, ip: ipHash, desde }
    );
    if (recentes && recentes.n >= LIMITE_POR_IP) {
      descartar(form, dados, ipHash, userAgent, 'excesso de envios');
      throw erro(429, 'Muitos envios seguidos. Aguarde alguns minutos e tente de novo.');
    }

    // 3) campos obrigatórios
    const campos = j.parse(form.campos, []);
    const limpos = {};
    for (const c of campos) {
      const bruto = dados[c.chave];
      const valor = c.tipo === 'multipla' && Array.isArray(bruto)
        ? bruto.map((v) => String(v).slice(0, 200)) : String(bruto == null ? '' : bruto).slice(0, 2000);
      const vazio = Array.isArray(valor) ? !valor.length : !valor.trim();
      if (c.obrigatorio && vazio) throw erro(400, `Preencha o campo "${c.rotulo}".`);
      if (!vazio) limpos[c.chave] = valor;
    }

    // 4) consentimento, quando o formulário exige
    // o aceite vem FORA de `dados`: é declaração do titular, não campo do formulário
    const config = j.parse(form.config, {});
    const aceitou = consentimento === true || consentimento === 'true' || consentimento === 1 || consentimento === '1';
    if (config.consentimento_obrigatorio && !aceitou) {
      throw erro(400, 'É preciso aceitar o consentimento para enviar.');
    }

    // 5) duplicata: mesmo conteúdo, mesma origem, dentro da janela
    const impressao = crypto.createHash('sha256').update(form.id + '|' + ipHash + '|' + JSON.stringify(limpos)).digest('base64url').slice(0, 24);
    const janela = Math.floor(Date.now() / (JANELA_DEDUPE_MIN * 60000));
    const chaveIdem = `form:${impressao}:${janela}`;
    const jaEnviado = repo.um('SELECT * FROM gx_form_respostas WHERE tenant_id = :tenant AND chave_idem = :k', { k: chaveIdem });
    if (jaEnviado) return { ok: true, duplicada: true, contatoId: jaEnviado.contato_id, respostaId: jaEnviado.id, mensagem: mensagemOk(config) };

    // 6) quem é essa pessoa?
    const paraContato = {};
    for (const c of campos) if (c.mapeia && limpos[c.chave] !== undefined) paraContato[c.mapeia] = limpos[c.chave];

    const identidades = [];
    if (paraContato.email) identidades.push({ tipo: 'email', valor: paraContato.email });
    if (paraContato.telefone) identidades.push({ tipo: 'telefone', valor: paraContato.telefone });
    if (paraContato.whatsapp) identidades.push({ tipo: 'whatsapp', valor: paraContato.whatsapp });
    if (visitanteId) identidades.push({ tipo: 'visitante', valor: visitanteId });
    if (!identidades.length) throw erro(400, 'Informe ao menos um e-mail ou telefone.');

    const proc = normalizarProcedencia(procedencia);
    const resolucao = identidade.resolver({
      identidades,
      dados: Object.assign({}, paraContato, {
        origem: proc.origem || config.origem || 'formulario',
        campanha: proc.utm.campaign || '',
        anuncio: proc.utm.content || '',
        palavra_chave: proc.utm.term || '',
        utm: proc.utm,
        pagina_entrada: proc.url || '',
        formulario: form.nome,
        dispositivo: proc.dispositivo || '',
        tags: config.tags || [],
        responsavel: config.responsavel || '',
      }),
      origem: proc.origem || 'formulario',
    });

    // 7) grava a resposta e amarra o visitante anônimo à pessoa
    const respostaId = repo.inserir('gx_form_respostas', {
      formulario_id: form.id, contato_id: resolucao.contatoId,
      dados: j.str(limpos), procedencia: j.str(proc),
      ip_hash: ipHash, user_agent: String(userAgent).slice(0, 250), chave_idem: chaveIdem,
    });
    repo.exec('UPDATE gx_formularios SET respostas = respostas + 1 WHERE id = :id AND tenant_id = :tenant', { id: form.id });
    if (visitanteId) vincularVisitante(visitanteId, resolucao.contatoId);

    // 8) consentimento declarado vira registro no contato
    if (aceitou) registrarConsentimento(form.tenant_id, resolucao.contatoId, config, proc);

    entitlements.consumir('formularios_respostas', 1);
    eventos.publicar('form.submitted', {
      refTipo: 'formulario', refId: form.id,
      payload: { formulario: form.nome, contato_id: resolucao.contatoId, criado: resolucao.criado, origem: proc.origem },
      chaveIdem: `formresp:${respostaId}`, origem: 'api',
    });

    return {
      ok: true, contatoId: resolucao.contatoId, respostaId,
      novoContato: resolucao.criado, mensagem: mensagemOk(config), redirect: config.redirect || '',
    };
  });
}

const mensagemOk = (config) => config.mensagem_ok || 'Recebemos seus dados. Em breve entramos em contato.';

/** Registra a submissão como spam sem criar contato. O lixo fica visível. */
function descartar(form, dados, ipHash, userAgent, motivo) {
  repo.inserir('gx_form_respostas', {
    formulario_id: form.id, contato_id: '', dados: j.str(dados || {}),
    ip_hash: ipHash, user_agent: String(userAgent).slice(0, 250), spam: 1, motivo_spam: motivo,
  });
  return { ok: true, descartada: true, mensagem: mensagemOk(j.parse(form.config, {})) };
}

function registrarConsentimento(tenantId, contatoId, config, proc) {
  const appRepo = require('../crm/app-repo');
  appRepo.Contatos.atualizar(tenantId, contatoId, {
    consentimento: {
      optIn: true,
      base: config.base_legal || 'consentimento',
      finalidade: config.finalidade || 'contato comercial',
      texto_versao: config.consentimento_versao || '1',
      em: nowISO(),
      origem: proc.url || 'formulario',
    },
  }, 'captura');
  eventos.publicar('contact.consent_updated', {
    refTipo: 'contato', refId: contatoId,
    payload: { optIn: true, base: config.base_legal || 'consentimento' },
  });
}

// -------------------------------------------------------- procedência

/** Extrai UTM da URL quando não vieram explícitos. Nada é inventado. */
function normalizarProcedencia(p = {}) {
  const url = String(p.url || '').slice(0, 500);
  const utm = Object.assign({}, p.utm || {});
  if (url) {
    try {
      const q = new URL(url).searchParams;
      for (const k of ['source', 'medium', 'campaign', 'content', 'term']) {
        if (!utm[k] && q.get('utm_' + k)) utm[k] = q.get('utm_' + k);
      }
    } catch (_) { /* URL inválida: segue sem UTM */ }
  }
  return {
    url,
    referrer: String(p.referrer || '').slice(0, 500),
    utm,
    dispositivo: String(p.dispositivo || '').slice(0, 40),
    origem: String(p.origem || utm.source || '').slice(0, 40),
    pagina: String(p.pagina || '').slice(0, 200),
  };
}

// ---------------------------------------------------------- tracking

/** Registra visita ou evento anônimo. Sem IP, sem dado pessoal. */
function rastrear({ tenantId, visitanteId, tipo = 'pageview', nome = '', url = '', referrer = '', utm = {}, dispositivo = '' }) {
  if (!visitanteId) return null;
  const proc = normalizarProcedencia({ url, referrer, utm, dispositivo });
  const executar = () => repo.inserir('gx_tracking', {
    visitante_id: String(visitanteId).slice(0, 60), tipo, nome: String(nome).slice(0, 80),
    url: proc.url, referrer: proc.referrer, utm: proc.utm, dispositivo: proc.dispositivo,
    contato_id: contatoDoVisitante(visitanteId) || '',
    criado_em: nowISO(),
  });
  return tenantId
    ? tenancy.comTenant({ tenantId, userId: 'tracking' }, executar)
    : executar();
}

function contatoDoVisitante(visitanteId) {
  const ident = identidade.porChave('visitante', identidade.normalizar('visitante', visitanteId));
  return ident ? ident.contato_id : '';
}

/**
 * Liga a trilha anônima à pessoa: tudo o que o visitante fez ANTES de se
 * identificar passa a pertencer ao contato. É o que dá first touch honesto.
 */
function vincularVisitante(visitanteId, contatoId) {
  const norm = identidade.normalizar('visitante', visitanteId);
  if (!norm) return 0;
  identidade.registrar({ contatoId, tipo: 'visitante', valor: visitanteId, origem: 'tracking' });
  return repo.exec(
    "UPDATE gx_tracking SET contato_id = :c WHERE tenant_id = :tenant AND visitante_id = :v AND contato_id = ''",
    { c: contatoId, v: String(visitanteId).slice(0, 60) }
  ).changes;
}

/** Primeira e última origem conhecidas do contato — base da atribuição. */
function atribuicao(contatoId) {
  const trilha = repo.listar('gx_tracking', {
    onde: 'contato_id = :c', params: { c: contatoId }, ordem: 'criado_em ASC', limite: 500,
  });
  if (!trilha.length) return { first: null, last: null, toques: 0 };
  const comOrigem = trilha.filter((t) => { const u = j.parse(t.utm, {}); return u.source || t.referrer; });
  const resumo = (t) => t && { url: t.url, referrer: t.referrer, utm: j.parse(t.utm, {}), em: t.criado_em };
  return {
    first: resumo(comOrigem[0] || trilha[0]),
    last: resumo(comOrigem[comOrigem.length - 1] || trilha[trilha.length - 1]),
    toques: trilha.length,
  };
}

const respostas = (formularioId, limite = 200) =>
  repo.listar('gx_form_respostas', {
    onde: formularioId ? 'formulario_id = :f AND spam = 0' : 'spam = 0',
    params: formularioId ? { f: formularioId } : {}, ordem: 'criado_em DESC', limite,
  });

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  TIPOS_CAMPO, MAPEAVEIS, LIMITE_POR_IP,
  criar, atualizar, publicar, listar, porToken, submeter, respostas,
  rastrear, vincularVisitante, atribuicao, normalizarProcedencia, hashIp,
};
