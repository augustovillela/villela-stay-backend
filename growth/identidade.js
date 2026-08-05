// =====================================================================
// Villela Growth OS — resolução de identidade (§6.1 do PROMPT_MASTER).
//
// O problema: o lead do Instagram, o contato do WhatsApp, o formulário
// preenchido, o e-mail e o visitante do site podem ser a MESMA pessoa —
// e hoje viram cinco fichas.
//
// A regra que governa tudo aqui: **mesclar sozinho só quando não há
// dúvida**. Match forte (a mesma chave verificada) une; match provável
// vira sugestão para revisão humana e NÃO altera dado nenhum. Errar para
// o lado de unir é pior do que errar para o lado de duplicar: unir duas
// pessoas diferentes mistura histórico, consentimento e conversa.
//
// A ficha continua sendo `crm_contatos` (Villela CRM). Aqui só se guarda
// por quais chaves aquela pessoa é conhecida.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const { db, nowISO, j } = require('./db');
const appRepo = require('../crm/app-repo');
const { normTelefone } = appRepo;

const TIPOS = ['email', 'telefone', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'linkedin', 'visitante', 'externo'];

// Quanto vale cada tipo de chave como prova de que é a mesma pessoa.
// Verificada (clique em link, código, login) sobe para 95+.
const PESO = {
  email: 80, telefone: 85, whatsapp: 85,
  instagram: 65, facebook: 65, tiktok: 60, linkedin: 65,
  externo: 70, visitante: 25,
};

const UNE_SOZINHO = 80;   // daqui para cima, o sistema une sem perguntar
const SUGERE = 50;        // entre SUGERE e UNE_SOZINHO, vira sugestão de revisão

/** Normaliza a chave. É por este valor que duas identidades se casam. */
function normalizar(tipo, valor) {
  const v = String(valor == null ? '' : valor).trim();
  if (!v) return '';
  switch (tipo) {
    case 'email': {
      const m = v.toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
      if (!m) return '';
      let [, local, dominio] = m;
      // Gmail ignora ponto e tudo depois do "+". Sem isso, a mesma pessoa
      // vira duas fichas por ter escrito o e-mail de outro jeito.
      if (dominio === 'gmail.com' || dominio === 'googlemail.com') {
        local = local.split('+')[0].replace(/\./g, '');
        dominio = 'gmail.com';
      } else {
        local = local.split('+')[0];
      }
      return `${local}@${dominio}`;
    }
    case 'telefone':
    case 'whatsapp':
      return normTelefone(v);
    case 'instagram': case 'facebook': case 'tiktok': case 'linkedin':
      return v.toLowerCase()
        .replace(/^https?:\/\/(www\.)?[a-z]+\.com\/?/, '')
        .replace(/^@/, '').replace(/\/+$/, '').split('?')[0];
    default:
      return v.toLowerCase();
  }
}

const pesoDe = (tipo, verificado) => Math.min(100, (PESO[tipo] || 40) + (verificado ? 15 : 0));

// ------------------------------------------------------------- consultas

const identidadesDo = (contatoId) =>
  repo.listar('gx_identidades', { onde: 'contato_id = :c', params: { c: contatoId }, ordem: 'confianca DESC, criado_em ASC' });

const porChave = (tipo, valorNorm) =>
  repo.um('SELECT * FROM gx_identidades WHERE tenant_id = :tenant AND tipo = :t AND valor_norm = :v AND excluido_em = \'\'',
    { t: tipo, v: valorNorm });

/** Registra (ou reforça) uma identidade apontando para um contato. */
function registrar({ contatoId, tipo, valor, verificado = false, origem = '' }) {
  if (!TIPOS.includes(tipo)) throw erro(400, `Tipo de identidade desconhecido: ${tipo}`);
  const norm = normalizar(tipo, valor);
  if (!norm) return null;

  const ja = porChave(tipo, norm);
  if (ja) {
    const dados = { ultimo_em: nowISO() };
    if (verificado && !ja.verificado) { dados.verificado = 1; dados.confianca = pesoDe(tipo, true); }
    repo.atualizar('gx_identidades', ja.id, dados);
    return ja.contato_id === contatoId ? ja.id : null;  // já é de outra pessoa: quem chamou decide
  }
  return repo.inserir('gx_identidades', {
    contato_id: contatoId, tipo, valor: String(valor).slice(0, 200), valor_norm: norm,
    confianca: pesoDe(tipo, verificado), verificado: verificado ? 1 : 0, origem,
    primeiro_em: nowISO(), ultimo_em: nowISO(),
  });
}

// ------------------------------------------------------------- resolução

/**
 * Descobre de quem é este conjunto de chaves e devolve o contato.
 *
 * @param {Array} identidades [{tipo, valor, verificado}]
 * @param {object} dados campos do contato (nome, origem, utm, …) — usados
 *   na criação e para preencher lacunas de uma ficha existente
 * @returns {{contatoId, criado, candidatos, sugestoes}}
 */
function resolver({ identidades = [], dados = {}, origem = '' } = {}) {
  const tid = tenancy.tenantAtual();
  const chaves = [];
  for (const i of identidades) {
    const norm = normalizar(i.tipo, i.valor);
    if (norm) chaves.push({ tipo: i.tipo, valor: i.valor, norm, verificado: !!i.verificado, peso: pesoDe(i.tipo, i.verificado) });
  }

  // 1) quem já é dono de alguma dessas chaves?
  const porContato = new Map();
  for (const c of chaves) {
    const achada = porChave(c.tipo, c.norm);
    if (!achada) continue;
    const atual = porContato.get(achada.contato_id) || { peso: 0, motivos: [] };
    atual.peso = Math.max(atual.peso, Number(achada.confianca) || c.peso);
    atual.motivos.push(`${c.tipo} ${c.norm}`);
    porContato.set(achada.contato_id, atual);
  }

  // 2) ninguém: tenta o dedupe legado do CRM (fichas anteriores à Etapa 2
  //    não têm identidade registrada — a ponte é feita aqui)
  if (!porContato.size) {
    const legado = acharNoLegado(tid, chaves);
    if (legado) porContato.set(legado.id, { peso: 85, motivos: ['ficha existente no CRM'] });
  }

  const candidatos = [...porContato.entries()]
    .map(([id, v]) => ({ contatoId: id, peso: v.peso, motivos: v.motivos }))
    .sort((a, b) => b.peso - a.peso);

  // 3) nenhum candidato: pessoa nova
  if (!candidatos.length) {
    const criacao = appRepo.Contatos.criar(tid, montarFicha(dados, chaves, origem), tenancy.userAtual() || 'growth');
    const contatoId = criacao.contato.id;
    for (const c of chaves) registrar({ contatoId, tipo: c.tipo, valor: c.valor, verificado: c.verificado, origem });
    eventos.publicar('lead.created', {
      refTipo: 'contato', refId: contatoId,
      payload: { origem, identidades: chaves.map((c) => c.tipo) },
    });
    return { contatoId, criado: true, candidatos: [], sugestoes: [] };
  }

  // 4) um candidato forte: adota, anexa as chaves novas e preenche lacunas
  const vencedor = candidatos[0];
  const contatoId = vencedor.contatoId;
  const sugestoes = [];

  if (vencedor.peso >= UNE_SOZINHO) {
    for (const c of chaves) {
      const dona = porChave(c.tipo, c.norm);
      if (!dona) registrar({ contatoId, tipo: c.tipo, valor: c.valor, verificado: c.verificado, origem });
      else if (dona.contato_id !== contatoId) {
        // a chave é de outra ficha: NÃO se muda de dono sozinho
        sugestoes.push(sugerir(contatoId, dona.contato_id, Math.min(vencedor.peso, Number(dona.confianca) || 60),
          [`chave ${c.tipo} pertence a outra ficha`]));
      }
    }
    preencherLacunas(tid, contatoId, dados);
  } else {
    // 5) match fraco: registra a suspeita, não mexe em nada
    for (const outro of candidatos.slice(1)) {
      sugestoes.push(sugerir(contatoId, outro.contatoId, Math.max(vencedor.peso, outro.peso), vencedor.motivos.concat(outro.motivos)));
    }
  }

  // 6) demais candidatos: possível duplicata, sempre por revisão humana
  for (const outro of candidatos.slice(1)) {
    if (sugestoes.some((s) => s && s.contato_b === outro.contatoId)) continue;
    sugestoes.push(sugerir(contatoId, outro.contatoId, Math.min(vencedor.peso, outro.peso), vencedor.motivos.concat(outro.motivos)));
  }

  return { contatoId, criado: false, candidatos, sugestoes: sugestoes.filter(Boolean) };
}

/** Ponte com o CRM legado: acha ficha por telefone ou e-mail já gravados. */
function acharNoLegado(tid, chaves) {
  for (const c of chaves) {
    if (c.tipo === 'telefone' || c.tipo === 'whatsapp') {
      const r = db.prepare("SELECT * FROM crm_contatos WHERE tenant_id = ? AND (telefone = ? OR whatsapp = ?) AND status != 'arquivado' LIMIT 1")
        .get(tid, c.norm, c.norm);
      if (r) return r;
    }
  }
  for (const c of chaves) {
    if (c.tipo !== 'email') continue;
    // compara pelo e-mail normalizado dos dois lados
    const linhas = db.prepare("SELECT * FROM crm_contatos WHERE tenant_id = ? AND email != '' AND status != 'arquivado'").all(tid);
    const achado = linhas.find((l) => normalizar('email', l.email) === c.norm);
    if (achado) return achado;
  }
  return null;
}

function montarFicha(dados, chaves, origem) {
  const email = (chaves.find((c) => c.tipo === 'email') || {}).norm || '';
  const tel = (chaves.find((c) => c.tipo === 'telefone' || c.tipo === 'whatsapp') || {}).norm || '';
  return Object.assign({}, dados, {
    email: dados.email || email,
    telefone: dados.telefone || tel,
    origem: dados.origem || origem || 'api',
  });
}

/** Só completa o que está vazio. Nunca sobrescreve o que a pessoa já disse. */
function preencherLacunas(tid, contatoId, dados) {
  const atual = appRepo.Contatos.obter(tid, contatoId);
  if (!atual) return;
  const merge = {};
  for (const campo of ['nome', 'sobrenome', 'email', 'telefone', 'cidade', 'estado', 'cargo',
    'empresa_nome', 'interesse', 'produto_interesse', 'campanha', 'pagina_entrada', 'primeira_mensagem']) {
    if (!atual[campo] && dados[campo]) merge[campo] = dados[campo];
  }
  if (Object.keys(merge).length) {
    appRepo.Contatos.atualizar(tid, contatoId, merge, tenancy.userAtual() || 'growth');
    eventos.publicar('contact.updated', {
      refTipo: 'contato', refId: contatoId, payload: { campos: Object.keys(merge) },
    });
  }
}

// ------------------------------------------------------- sugestão e merge

/** Registra a suspeita de duplicata. Idempotente por par. */
function sugerir(a, b, confianca, motivos = []) {
  if (!a || !b || a === b) return null;
  const [x, y] = [a, b].sort();     // par canônico: a sugestão não duplica invertida
  const ja = repo.um('SELECT * FROM gx_merge_sugestoes WHERE tenant_id = :tenant AND contato_a = :a AND contato_b = :b', { a: x, b: y });
  if (ja) {
    if (ja.status === 'pendente' && Number(confianca) > Number(ja.confianca)) {
      repo.atualizar('gx_merge_sugestoes', ja.id, { confianca: Math.round(confianca), motivos: j.str(motivos) });
    }
    return ja;
  }
  if (Number(confianca) < SUGERE) return null;   // fraco demais: nem sugere
  const id = repo.inserir('gx_merge_sugestoes', {
    contato_a: x, contato_b: y, confianca: Math.round(confianca), motivos: j.str(motivos), status: 'pendente',
  });
  return repo.buscar('gx_merge_sugestoes', id);
}

const sugestoesPendentes = (limite = 100) =>
  repo.listar('gx_merge_sugestoes', { onde: "status = 'pendente'", ordem: 'confianca DESC, criado_em ASC', limite });

/**
 * Une duas fichas. `mantido` sobrevive; `absorvido` é arquivado com
 * ponteiro. Tudo que apontava para o absorvido passa a apontar para o
 * mantido — histórico não se perde.
 */
function mesclar(mantidoId, absorvidoId, { motivo = '' } = {}) {
  const tid = tenancy.tenantAtual();
  if (mantidoId === absorvidoId) throw erro(400, 'Não dá para mesclar uma ficha com ela mesma.');
  const mantido = appRepo.Contatos.obter(tid, mantidoId);
  const absorvido = appRepo.Contatos.obter(tid, absorvidoId);
  if (!mantido || !absorvido) throw erro(404, 'Ficha não encontrada nesta conta.');

  const { transacao } = require('./db');
  transacao(() => {
    // 1) o que estava vazio no mantido, herda do absorvido
    const merge = {};
    for (const campo of ['nome', 'sobrenome', 'telefone', 'whatsapp', 'email', 'cidade', 'estado', 'cargo',
      'empresa_nome', 'interesse', 'produto_interesse', 'campanha', 'anuncio', 'pagina_entrada', 'primeira_mensagem', 'obs']) {
      if (!mantido[campo] && absorvido[campo]) merge[campo] = absorvido[campo];
    }
    if (Object.keys(merge).length) appRepo.Contatos.atualizar(tid, mantidoId, merge, tenancy.userAtual() || 'growth');

    // 2) identidades passam de dono (a chave única impede duplicar)
    for (const ident of identidadesDo(absorvidoId)) {
      const conflito = porChave(ident.tipo, ident.valor_norm);
      if (conflito && conflito.contato_id === mantidoId) repo.remover('gx_identidades', ident.id);
      else repo.atualizar('gx_identidades', ident.id, { contato_id: mantidoId });
    }

    // 3) histórico segue a pessoa
    for (const tabela of ['crm_atividades', 'crm_tarefas', 'crm_oportunidades', 'crm_propostas']) {
      try {
        db.prepare(`UPDATE ${tabela} SET contato_id = ? WHERE tenant_id = ? AND contato_id = ?`).run(mantidoId, tid, absorvidoId);
      } catch (_) { /* tabela sem contato_id: ignora */ }
    }
    db.prepare('UPDATE gx_form_respostas SET contato_id = ? WHERE tenant_id = ? AND contato_id = ?').run(mantidoId, tid, absorvidoId);
    db.prepare('UPDATE gx_tracking SET contato_id = ? WHERE tenant_id = ? AND contato_id = ?').run(mantidoId, tid, absorvidoId);

    // 4) o absorvido não some: fica arquivado com o ponteiro, para auditoria
    appRepo.Contatos.atualizar(tid, absorvidoId, {
      status: 'arquivado',
      obs: `${absorvido.obs ? absorvido.obs + ' | ' : ''}Mesclado em ${mantidoId} (${nowISO()}). ${motivo}`.trim(),
    }, tenancy.userAtual() || 'growth');
  });

  repo.auditar({ acao: 'contato.mesclado', entidade: 'crm_contatos', entidadeId: mantidoId, detalhe: `absorveu ${absorvidoId}. ${motivo}` });
  eventos.publicar('contact.identity_merged', {
    refTipo: 'contato', refId: mantidoId,
    payload: { mantido: mantidoId, absorvido: absorvidoId, motivo },
    chaveIdem: `merge:${tid}:${mantidoId}:${absorvidoId}`,
  });
  return appRepo.Contatos.obter(tid, mantidoId);
}

/** Decisão humana sobre a sugestão. */
function decidirSugestao(id, { decisao, quem = null, motivo = '' }) {
  const sug = repo.buscar('gx_merge_sugestoes', id);
  if (!sug) throw erro(404, 'Sugestão não encontrada.');
  if (sug.status !== 'pendente') throw erro(409, `Esta sugestão já foi ${sug.status}.`);
  const decisor = quem || tenancy.userAtual();

  if (decisao === 'rejeitar') {
    repo.atualizar('gx_merge_sugestoes', id, { status: 'rejeitada', decidido_por: decisor, decidido_em: nowISO() });
    return repo.buscar('gx_merge_sugestoes', id);
  }
  if (decisao !== 'aplicar') throw erro(400, 'Decisão inválida. Use aplicar ou rejeitar.');

  // o mais antigo sobrevive: preserva o histórico mais longo
  const a = appRepo.Contatos.obter(tenancy.tenantAtual(), sug.contato_a);
  const b = appRepo.Contatos.obter(tenancy.tenantAtual(), sug.contato_b);
  const [mantido, absorvido] = (a && b && a.criado_em <= b.criado_em) ? [sug.contato_a, sug.contato_b] : [sug.contato_b, sug.contato_a];
  mesclar(mantido, absorvido, { motivo: motivo || `sugestão ${id} aprovada` });
  repo.atualizar('gx_merge_sugestoes', id, { status: 'aplicada', decidido_por: decisor, decidido_em: nowISO() });
  return repo.buscar('gx_merge_sugestoes', id);
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  TIPOS, PESO, UNE_SOZINHO, SUGERE,
  normalizar, pesoDe, registrar, identidadesDo, porChave,
  resolver, sugerir, sugestoesPendentes, mesclar, decidirSugestao,
};
