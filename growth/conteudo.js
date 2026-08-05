// =====================================================================
// Villela Growth OS — conteúdo e publicação (§13 do PROMPT_MASTER).
//
// O fluxo editorial é NOSSO e funciona sem nenhuma rede conectada:
//   ideia → briefing → produção → revisão → aprovado → agendado → publicado
//
// A PUBLICAÇÃO é que depende da conta conectada, e obedece a regra mais
// importante do §13.2: **não oferecer o que a rede não suporta.** Se a
// capacidade da conexão não confirma o formato, a publicação nasce
// `bloqueada` com o motivo — nunca "agendada" para falhar depois.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const entitlements = require('./entitlements');
const canais = require('./canais');
const { nowISO, j } = require('./db');

const STATUS = ['ideia', 'briefing', 'producao', 'revisao', 'aprovado', 'agendado', 'publicado', 'erro', 'arquivado'];
const REDES = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'];
const FORMATOS = ['post', 'imagem', 'carrossel', 'video', 'video_curto', 'story', 'artigo'];

// Formato → capacidade que a conexão precisa confirmar. É o contrato do
// §13.2: a tela lê isto antes de oferecer o botão.
const CAPACIDADE_DO_FORMATO = {
  post: 'canPublishImage',
  imagem: 'canPublishImage',
  carrossel: 'canPublishCarousel',
  video: 'canPublishVideo',
  video_curto: 'canPublishShortVideo',
  story: 'canPublishStory',
  artigo: 'canPublishImage',
};

// rede → chave da integração no catálogo de conectores
const INTEGRACAO_DA_REDE = {
  instagram: 'instagram_publicacao',
  facebook: 'facebook_paginas',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
  youtube: 'youtube',
};

const LIMITE_LEGENDA = { instagram: 2200, facebook: 5000, tiktok: 2200, linkedin: 3000, youtube: 5000 };

// ------------------------------------------------------- editorial

function criar({ titulo, formato = 'post', objetivo = '', persona = '', etapaFunil = '', tom = '',
  briefing = '', campanha = '', responsavel = '', geradoPorAgente = '' }) {
  if (!titulo) throw erro(400, 'O conteúdo precisa de um título.');
  if (!FORMATOS.includes(formato)) throw erro(400, `Formato desconhecido: ${formato}`);
  entitlements.exigirFlag('redes_sociais');
  const id = repo.inserir('gx_conteudos', {
    titulo, formato, objetivo, persona, etapa_funil: etapaFunil, tom, briefing,
    campanha, responsavel, status: 'ideia', versao: 1, gerado_por_agente: geradoPorAgente,
  });
  versionar(id, 'criado');
  repo.auditar({ acao: 'conteudo.criado', entidade: 'gx_conteudos', entidadeId: id, detalhe: titulo });
  return repo.buscar('gx_conteudos', id);
}

/** Edita e versiona. Mexer no texto de um aprovado volta para revisão. */
function atualizar(id, dados = {}) {
  const c = repo.buscar('gx_conteudos', id);
  if (!c) throw erro(404, 'Conteúdo não encontrado.');
  if (c.status === 'publicado') throw erro(409, 'Conteúdo já publicado não é editado — duplique.');

  const patch = {};
  for (const campo of ['titulo', 'objetivo', 'persona', 'tom', 'briefing', 'legenda', 'roteiro', 'cta', 'link', 'campanha', 'responsavel'])
    if (dados[campo] !== undefined) patch[campo] = dados[campo];
  if (dados.etapaFunil !== undefined) patch.etapa_funil = dados.etapaFunil;
  if (dados.hashtags) patch.hashtags = j.str(dados.hashtags);
  if (dados.midias) patch.midias = j.str(dados.midias);
  if (dados.formato) {
    if (!FORMATOS.includes(dados.formato)) throw erro(400, `Formato desconhecido: ${dados.formato}`);
    patch.formato = dados.formato;
  }

  // texto mudou depois de aprovado → a aprovação não vale mais
  const mudouTexto = ['legenda', 'roteiro', 'titulo', 'cta', 'link'].some((k) => patch[k] !== undefined);
  if (mudouTexto && ['aprovado', 'agendado'].includes(c.status)) {
    patch.status = 'revisao'; patch.aprovado_por = ''; patch.aprovado_em = '';
  }
  patch.versao = Number(c.versao || 1) + 1;
  repo.atualizar('gx_conteudos', id, patch);
  versionar(id, dados.notas || 'editado');
  return repo.buscar('gx_conteudos', id);
}

const versionar = (id, notas) => {
  const c = repo.buscar('gx_conteudos', id);
  if (!c) return null;
  return repo.inserir('gx_conteudo_versoes', {
    conteudo_id: id, versao: Number(c.versao || 1), conteudo: j.str(c),
    autor: tenancy.userAtual(), notas, criado_em: nowISO(),
  });
};

function mover(id, status) {
  if (!STATUS.includes(status)) throw erro(400, `Status desconhecido: ${status}`);
  const c = repo.buscar('gx_conteudos', id);
  if (!c) throw erro(404, 'Conteúdo não encontrado.');
  repo.atualizar('gx_conteudos', id, { status });
  return repo.buscar('gx_conteudos', id);
}

/**
 * Aprovar é o portão: valida palavras proibidas, direitos das mídias e
 * limite de caracteres de cada rede antes de deixar passar.
 */
function aprovar(id) {
  const c = repo.buscar('gx_conteudos', id);
  if (!c) throw erro(404, 'Conteúdo não encontrado.');
  const problemas = validar(c);
  if (problemas.length) {
    const e = new Error(`Não dá para aprovar: ${problemas.join(' · ')}`);
    e.status = 422; e.problemas = problemas; throw e;
  }
  repo.atualizar('gx_conteudos', id, {
    status: 'aprovado', aprovado_por: tenancy.userAtual(), aprovado_em: nowISO(),
  });
  repo.auditar({ acao: 'conteudo.aprovado', entidade: 'gx_conteudos', entidadeId: id, detalhe: c.titulo });
  eventos.publicar('campaign.approved', {
    refTipo: 'conteudo', refId: id, payload: { titulo: c.titulo, formato: c.formato },
  });
  return repo.buscar('gx_conteudos', id);
}

/** Tudo que impede um conteúdo de sair. Devolve lista, não só o primeiro. */
function validar(c) {
  const problemas = [];
  if (!c.legenda && !c.roteiro) problemas.push('sem legenda nem roteiro');

  const proibidas = palavrasProibidas();
  const texto = `${c.titulo} ${c.legenda} ${c.roteiro} ${c.cta}`.toLowerCase();
  const achadas = proibidas.filter((p) => texto.includes(String(p).toLowerCase()));
  if (achadas.length) problemas.push(`palavra proibida: ${achadas.join(', ')}`);

  // direitos autorais das mídias — o §13.3 pede controle, não só campo
  for (const mid of j.parse(c.midias, [])) {
    const m = repo.buscar('gx_midias', mid);
    if (!m) { problemas.push(`mídia ${mid} não existe`); continue; }
    if (m.origem === 'terceiro' && !m.licenca) problemas.push(`mídia "${m.nome}" é de terceiro e não tem licença registrada`);
    if (m.expira_em && m.expira_em < nowISO().slice(0, 10)) problemas.push(`direito de uso da mídia "${m.nome}" venceu em ${m.expira_em}`);
  }

  // limite de caracteres por rede, nas variações já criadas
  for (const v of variacoes(c.id)) {
    const limite = LIMITE_LEGENDA[v.rede];
    if (limite && (v.legenda || '').length > limite) {
      problemas.push(`legenda do ${v.rede} tem ${v.legenda.length} caracteres (máximo ${limite})`);
    }
  }
  return problemas;
}

function palavrasProibidas() {
  const cfg = repo.um("SELECT valor FROM gx_entitlements WHERE tenant_id = :tenant AND chave = 'palavras_proibidas'");
  return cfg ? (j.parse(cfg.valor, []) || []) : [];
}

const definirPalavrasProibidas = (lista) => entitlements.definirLimite('palavras_proibidas', lista);

// ------------------------------------------------------ variações

/** Adapta para uma rede. O que não cabe fica só naquela variação. */
function definirVariacao(conteudoId, rede, { legenda = '', hashtags = [], formato = '', primeiroComentario = '' }) {
  if (!REDES.includes(rede)) throw erro(400, `Rede desconhecida: ${rede}`);
  const c = repo.buscar('gx_conteudos', conteudoId);
  if (!c) throw erro(404, 'Conteúdo não encontrado.');
  const ja = repo.um('SELECT * FROM gx_conteudo_variacoes WHERE tenant_id = :tenant AND conteudo_id = :c AND rede = :r',
    { c: conteudoId, r: rede });
  const dados = {
    legenda: legenda || c.legenda, hashtags: j.str(hashtags.length ? hashtags : j.parse(c.hashtags, [])),
    formato: formato || c.formato, primeiro_comentario: primeiroComentario,
  };
  if (ja) { repo.atualizar('gx_conteudo_variacoes', ja.id, dados); return repo.buscar('gx_conteudo_variacoes', ja.id); }
  const id = repo.inserir('gx_conteudo_variacoes', Object.assign({ conteudo_id: conteudoId, rede }, dados));
  return repo.buscar('gx_conteudo_variacoes', id);
}

const variacoes = (conteudoId) =>
  repo.listar('gx_conteudo_variacoes', { onde: 'conteudo_id = :c', params: { c: conteudoId }, ordem: 'rede ASC', limite: 20 });

/** Link com UTM montado a partir da campanha — atribuição sem digitação. */
function linkComUtm(c, rede) {
  if (!c.link) return '';
  try {
    const u = new URL(c.link);
    const utm = j.parse(c.utm, {});
    u.searchParams.set('utm_source', utm.source || rede);
    u.searchParams.set('utm_medium', utm.medium || 'social');
    if (c.campanha || utm.campaign) u.searchParams.set('utm_campaign', utm.campaign || c.campanha);
    u.searchParams.set('utm_content', utm.content || c.id);
    return u.toString();
  } catch { return c.link; }
}

// ----------------------------------------------------- publicação

/**
 * Prepara a publicação em cada rede pedida. NÃO tenta publicar aqui:
 * primeiro confere se a conta pode. O que a rede não suporta nasce
 * `bloqueada` com motivo, em vez de agendada para falhar depois.
 */
function agendar(conteudoId, { redes = [], quando = null } = {}) {
  const c = repo.buscar('gx_conteudos', conteudoId);
  if (!c) throw erro(404, 'Conteúdo não encontrado.');
  if (c.status !== 'aprovado' && c.status !== 'agendado') {
    throw erro(409, `Só conteúdo aprovado é agendado (este está em "${c.status}").`);
  }
  const quandoISO = quando || nowISO();
  const resultados = [];

  for (const rede of redes) {
    if (!REDES.includes(rede)) { resultados.push({ rede, status: 'bloqueada', motivo: 'rede desconhecida' }); continue; }
    const variacao = repo.um('SELECT * FROM gx_conteudo_variacoes WHERE tenant_id = :tenant AND conteudo_id = :c AND rede = :r',
      { c: conteudoId, r: rede });
    const formato = (variacao && variacao.formato) || c.formato;

    const veredito = podePublicar(rede, formato);
    const dados = {
      conteudo_id: conteudoId, rede, formato,
      conexao_id: veredito.conexaoId || '',
      status: veredito.pode ? 'agendada' : 'bloqueada',
      motivo: veredito.motivo, agendada_para: veredito.pode ? quandoISO : '',
    };
    const ja = repo.um('SELECT * FROM gx_publicacoes WHERE tenant_id = :tenant AND conteudo_id = :c AND rede = :r',
      { c: conteudoId, r: rede });
    const id = ja ? (repo.atualizar('gx_publicacoes', ja.id, dados), ja.id) : repo.inserir('gx_publicacoes', dados);

    if (veredito.pode) {
      require('./fila').enfileirar({
        tipo: 'conteudo:publicar', fila: 'conteudo', prioridade: 4,
        payload: { publicacaoId: id }, chaveIdem: `pub:${id}`, agendarPara: quandoISO,
      });
    }
    resultados.push({ rede, id, status: dados.status, motivo: dados.motivo });
  }

  const algumaAgendada = resultados.some((r) => r.status === 'agendada');
  repo.atualizar('gx_conteudos', conteudoId, {
    status: algumaAgendada ? 'agendado' : c.status, agendado_para: algumaAgendada ? quandoISO : '',
  });
  return { conteudo: repo.buscar('gx_conteudos', conteudoId), publicacoes: resultados };
}

/**
 * A regra do §13.2 em uma função: a conta pode publicar ESTE formato
 * NESTA rede? Consulta a capacidade RESOLVIDA da conexão, não a promessa
 * genérica da integração.
 */
function podePublicar(rede, formato) {
  const integracao = INTEGRACAO_DA_REDE[rede];
  if (!integracao) return { pode: false, motivo: 'rede sem conector no catálogo' };

  const c = canais.capacidades(integracao);
  if (!c.conectado) {
    return { pode: false, motivo: `a conta não tem ${rede} conectado (status da integração: ${c.status})` };
  }
  const chave = CAPACIDADE_DO_FORMATO[formato];
  if (!chave) return { pode: false, motivo: `formato "${formato}" sem capacidade mapeada` };
  if (!c.capacidades[chave]) {
    return { pode: false, motivo: `esta conta do ${rede} não confirma "${chave}" — formato "${formato}" indisponível`, conexaoId: c.conexaoId };
  }
  return { pode: true, motivo: '', conexaoId: c.conexaoId };
}

/**
 * O que a tela deve oferecer para esta conta. Formato sem capacidade NÃO
 * aparece — nem desabilitado com tooltip.
 */
function formatosDisponiveis() {
  const out = {};
  for (const rede of REDES) {
    const c = canais.capacidades(INTEGRACAO_DA_REDE[rede]);
    out[rede] = {
      conectado: !!c.conectado, status: c.status,
      formatos: FORMATOS.filter((f) => c.conectado && c.capacidades[CAPACIDADE_DO_FORMATO[f]]),
    };
  }
  return out;
}

/** Handler do job. Publica de verdade — ou registra por que não deu. */
async function publicar({ publicacaoId }) {
  const p = repo.buscar('gx_publicacoes', publicacaoId);
  if (!p) throw erro(404, 'Publicação não encontrada.');
  if (p.status === 'publicada') return { ok: true, jaPublicada: true };
  const c = repo.buscar('gx_conteudos', p.conteudo_id);
  if (!c) throw erro(404, 'Conteúdo não encontrado.');

  // a capacidade é reconferida na hora: o token pode ter caído desde o agendamento
  const veredito = podePublicar(p.rede, p.formato);
  if (!veredito.pode) {
    repo.atualizar('gx_publicacoes', publicacaoId, { status: 'bloqueada', motivo: veredito.motivo });
    eventos.publicar('publication.failed', {
      refTipo: 'publicacao', refId: publicacaoId,
      payload: { rede: p.rede, motivo: veredito.motivo }, chaveIdem: `pubfail:${publicacaoId}`,
    });
    return { ok: false, bloqueada: true, motivo: veredito.motivo };
  }

  const conectores = require('./conectores');
  const conector = conectores.obter(INTEGRACAO_DA_REDE[p.rede]);
  const variacao = repo.um('SELECT * FROM gx_conteudo_variacoes WHERE tenant_id = :tenant AND conteudo_id = :c AND rede = :r',
    { c: p.conteudo_id, r: p.rede });

  repo.atualizar('gx_publicacoes', publicacaoId, { tentativas: Number(p.tentativas || 0) + 1 });
  try {
    const r = await conector.publicar({
      conexaoId: p.conexao_id, formato: p.formato,
      legenda: (variacao && variacao.legenda) || c.legenda,
      hashtags: j.parse((variacao && variacao.hashtags) || c.hashtags, []),
      midias: j.parse(c.midias, []).map((id) => repo.buscar('gx_midias', id)).filter(Boolean),
      link: linkComUtm(c, p.rede),
    });
    repo.atualizar('gx_publicacoes', publicacaoId, {
      status: 'publicada', publicada_em: nowISO(), externa_id: (r && r.externaId) || '', url_publica: (r && r.url) || '', erro: '',
    });
    if (todasResolvidas(p.conteudo_id)) repo.atualizar('gx_conteudos', p.conteudo_id, { status: 'publicado' });
    eventos.publicar('content.published', {
      refTipo: 'publicacao', refId: publicacaoId,
      payload: { conteudo_id: p.conteudo_id, rede: p.rede, formato: p.formato },
      chaveIdem: `pubok:${publicacaoId}`,
    });
    return { ok: true };
  } catch (e) {
    repo.atualizar('gx_publicacoes', publicacaoId, { status: 'falhou', erro: String(e.message).slice(0, 400) });
    repo.atualizar('gx_conteudos', p.conteudo_id, { status: 'erro' });
    eventos.publicar('publication.failed', {
      refTipo: 'publicacao', refId: publicacaoId,
      payload: { rede: p.rede, erro: String(e.message).slice(0, 200) }, chaveIdem: `pubfail:${publicacaoId}`,
    });
    throw e;   // a fila reagenda; esgotado vai para a DLQ
  }
}

const todasResolvidas = (conteudoId) => {
  const pubs = repo.listar('gx_publicacoes', { onde: 'conteudo_id = :c', params: { c: conteudoId }, limite: 20 });
  return pubs.length > 0 && pubs.every((p) => ['publicada', 'bloqueada', 'cancelada'].includes(p.status));
};

// ------------------------------------------------------ calendário

/** A visão do §13.1: o que está em cada estágio, por período. */
function calendario({ de = '', ate = '', status = '' } = {}) {
  const cond = [];
  const params = {};
  if (status) { cond.push('status = :st'); params.st = status; }
  if (de) { cond.push('(agendado_para >= :de OR agendado_para = \'\')'); params.de = de; }
  if (ate) { cond.push('(agendado_para <= :ate OR agendado_para = \'\')'); params.ate = ate; }
  const itens = repo.listar('gx_conteudos', { onde: cond.join(' AND '), params, ordem: 'agendado_para ASC, criado_em DESC', limite: 300 });
  const porStatus = STATUS.reduce((acc, s) => { acc[s] = itens.filter((i) => i.status === s).length; return acc; }, {});
  return {
    itens: itens.map((i) => Object.assign({}, i, { publicacoes: repo.listar('gx_publicacoes', { onde: 'conteudo_id = :c', params: { c: i.id }, limite: 10 }) })),
    resumo: porStatus,
    disponibilidade: formatosDisponiveis(),
  };
}

// --------------------------------------------------- biblioteca

function guardarMidia({ nome, tipo = 'imagem', url = '', mime = '', tamanho = 0, origem = 'proprio',
  licenca = '', autor = '', usoPermitido = '', expiraEm = '', tags = [] }) {
  if (!nome) throw erro(400, 'A mídia precisa de nome.');
  if (origem === 'terceiro' && !licenca) throw erro(400, 'Mídia de terceiro exige licença registrada.');
  const id = repo.inserir('gx_midias', {
    nome, tipo, url, mime, tamanho: Number(tamanho) || 0, origem, licenca, autor,
    uso_permitido: usoPermitido, expira_em: expiraEm, tags: j.str(tags),
  });
  return repo.buscar('gx_midias', id);
}

const midias = (limite = 200) => repo.listar('gx_midias', { ordem: 'criado_em DESC', limite });

/** Mídias com direito de uso vencendo — evita publicar fora da licença. */
const midiasVencendo = (dias = 30) => repo.listar('gx_midias', {
  onde: "expira_em != '' AND expira_em <= :limite",
  params: { limite: new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10) },
  ordem: 'expira_em ASC', limite: 100,
});

const listar = (limite = 200) => repo.listar('gx_conteudos', { ordem: 'criado_em DESC', limite });

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  STATUS, REDES, FORMATOS, CAPACIDADE_DO_FORMATO, INTEGRACAO_DA_REDE, LIMITE_LEGENDA,
  criar, atualizar, mover, aprovar, validar, versionar, listar,
  definirVariacao, variacoes, linkComUtm, definirPalavrasProibidas, palavrasProibidas,
  agendar, podePublicar, formatosDisponiveis, publicar, calendario,
  guardarMidia, midias, midiasVencendo,
};
