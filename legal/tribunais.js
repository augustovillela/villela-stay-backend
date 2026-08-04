// =====================================================================
// Villela Legal Intelligence — BUSCA EM TRIBUNAIS.
//
// Achar processos de uma pessoa/empresa em vários tribunais de uma vez e,
// com um clique, passar a acompanhá-los aqui dentro.
//
// POR QUE DUAS FONTES (medido em 03/08/2026, não é suposição):
//  · DJEN/Comunica ACHA por nome ou OAB, filtra por tribunal e é o único
//    que entrega NOME e POLO das partes (`destinatarios`). Mas o casamento
//    de nome é FROUXO ("Augusto Villela" traz "LUCIO AUGUSTO VILLELA DA
//    COSTA") e a API BLOQUEIA IP DE DATACENTER — do Render não responde.
//  · DataJud tem capa (classe, assunto, órgão, grau) e TODOS os movimentos
//    (283 num processo real), mas NÃO tem campo de partes e não busca por
//    nome. Funciona do Render.
// Logo: DJEN acha e nomeia, DataJud enriquece e traz o histórico.
//
// COMO O BLOQUEIO É CONTORNADO: a busca tenta rodar no servidor; quando o
// DJEN recusa, o pedido fica PENDENTE e o runner local
// (`stays\legal-busca-tribunais.ps1`, IP residencial) consulta e devolve as
// comunicações CRUAS por PUBLISH_KEY. O agrupamento por processo e a
// triagem de homônimo têm UMA implementação só, aqui — o runner só busca.
//
// TRIAGEM DE HOMÔNIMO é requisito, não enfeite: a tela mostra o nome que
// casou e marca correspondência exata, senão o usuário cadastra processo
// de estranho com um clique (no TJSP, 21 de 21 resultados eram de outros).
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const coleta = require('./coleta');

const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const DJEN_BASE = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const MODOS = ['nome', 'oab', 'processo'];
const STATUS = ['pendente', 'executando', 'concluida', 'erro'];

// ---- catálogo para a caixa de seleção (siglas do DJEN) ----------------
const ESTADUAIS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO'];
const TRIBUNAIS = [
  { sigla: 'STF', nome: 'Supremo Tribunal Federal', grupo: 'Superiores' },
  { sigla: 'STJ', nome: 'Superior Tribunal de Justiça', grupo: 'Superiores' },
  { sigla: 'TST', nome: 'Tribunal Superior do Trabalho', grupo: 'Superiores' },
  { sigla: 'TSE', nome: 'Tribunal Superior Eleitoral', grupo: 'Superiores' },
  { sigla: 'STM', nome: 'Superior Tribunal Militar', grupo: 'Superiores' },
  { sigla: 'TJDFT', nome: 'TJ do Distrito Federal e Territórios', grupo: 'Justiça Estadual' },
  ...ESTADUAIS.map(uf => ({ sigla: 'TJ' + uf, nome: 'Tribunal de Justiça — ' + uf, grupo: 'Justiça Estadual' })),
  ...[1, 2, 3, 4, 5, 6].map(n => ({ sigla: 'TRF' + n, nome: `Tribunal Regional Federal da ${n}ª Região`, grupo: 'Justiça Federal' })),
  ...Array.from({ length: 24 }, (_, i) => i + 1).map(n => ({ sigla: 'TRT' + n, nome: `Tribunal Regional do Trabalho da ${n}ª Região`, grupo: 'Justiça do Trabalho' })),
  ...['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE',
    'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO'].map(uf => ({ sigla: 'TRE' + uf, nome: 'Tribunal Regional Eleitoral — ' + uf, grupo: 'Justiça Eleitoral' })),
  { sigla: 'TJMMG', nome: 'TJ Militar de Minas Gerais', grupo: 'Justiça Militar Estadual' },
  { sigla: 'TJMRS', nome: 'TJ Militar do Rio Grande do Sul', grupo: 'Justiça Militar Estadual' },
  { sigla: 'TJMSP', nome: 'TJ Militar de São Paulo', grupo: 'Justiça Militar Estadual' },
];
// Atalho útil: os que o escritório usa de fato (pré-marcados na tela).
const FREQUENTES = ['TJDFT', 'TJES', 'TJSP', 'TJMG', 'TJRS', 'STJ', 'STF'];

// normaliza para comparar nome sem acento/caixa/ruído
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------- BUSCAS
function catalogo() {
  return { tribunais: TRIBUNAIS, frequentes: FREQUENTES, modos: MODOS };
}

function criar(d, autor) {
  const modo = MODOS.includes(d.modo) ? d.modo : 'nome';
  const termo = s(d.termo, 200);
  if (!termo) throw new Error(modo === 'oab' ? 'Informe o número da OAB.' : (modo === 'processo' ? 'Informe o número do processo.' : 'Informe o nome a pesquisar.'));
  if (modo === 'oab' && !s(d.uf_oab, 2)) throw new Error('Informe a UF da OAB.');
  const tribunais = (Array.isArray(d.tribunais) ? d.tribunais : []).map(x => s(x, 12).toUpperCase())
    .filter(x => TRIBUNAIS.some(t => t.sigla === x));
  const id = novoId();
  db.prepare(`INSERT INTO court_searches (id, modo, termo, uf_oab, tribunais, dias, status, detalhe,
    executada_por, total_comunicacoes, total_processos, criado_por, criado_em, concluida_em)
    VALUES (?,?,?,?,?,?,'pendente','','',0,0,?,?,'')`)
    .run(id, modo, termo, s(d.uf_oab, 2).toUpperCase(), j.str(tribunais),
      Math.min(Math.max(Number(d.dias) || 90, 1), 365), s(autor, 40), nowISO());
  return obter(id);
}

function listar({ limite = 30 } = {}) {
  return db.prepare(`SELECT id, modo, termo, uf_oab, tribunais, dias, status, detalhe, executada_por,
      total_comunicacoes, total_processos, criado_por, criado_em, concluida_em
    FROM court_searches ORDER BY criado_em DESC LIMIT ?`).all(Math.min(Number(limite) || 30, 100))
    .map(b => ({ ...b, tribunais: j.parse(b.tribunais, []) }));
}

function obter(id) {
  const b = db.prepare('SELECT * FROM court_searches WHERE id = ?').get(id);
  if (!b) throw new Error('Busca não encontrada.');
  b.tribunais = j.parse(b.tribunais, []);
  b.resultados = db.prepare(`SELECT h.*, c.status AS case_status FROM court_search_hits h
    LEFT JOIN cases c ON c.id = h.case_id
    WHERE h.search_id = ? ORDER BY h.exato DESC, h.ultima_em DESC`).all(id)
    .map(h => ({ ...h, partes: j.parse(h.partes, []) }));
  return b;
}

// Devolve a busca para a fila. Sem isto, busca concluída fica congelada —
// e ela precisa ser refeita tanto para pegar processo novo quanto quando a
// execução anterior veio incompleta.
function refazer(id) {
  const b = db.prepare('SELECT id FROM court_searches WHERE id = ?').get(id);
  if (!b) throw new Error('Busca não encontrada.');
  db.prepare(`UPDATE court_searches SET status='pendente', detalhe='Refazendo — aguardando execução.',
    executada_por='', concluida_em='' WHERE id=?`).run(id);
  return obter(id);
}

// pedidos que o runner local precisa executar (IP residencial)
function pendentes(limite = 5) {
  return db.prepare("SELECT * FROM court_searches WHERE status IN ('pendente','executando') ORDER BY criado_em LIMIT ?")
    .all(Math.min(Number(limite) || 5, 20))
    .map(b => ({ ...b, tribunais: j.parse(b.tribunais, []), alvos: alvosDe({ ...b, tribunais: j.parse(b.tribunais, []) }) }));
}

// Quais consultas o executor (servidor ou runner) precisa fazer. Lista vazia
// de tribunais = varredura nacional numa chamada só.
function alvosDe(b) {
  const base = { dias: b.dias, modo: b.modo, termo: b.termo, uf_oab: b.uf_oab };
  const tribs = b.tribunais && b.tribunais.length ? b.tribunais : [''];
  return tribs.map(t => ({ ...base, tribunal: t, url: urlDJEN(b, t) }));
}

function urlDJEN(b, tribunal) {
  const ate = nowISO().slice(0, 10);
  const de = new Date(Date.now() - (Number(b.dias) || 90) * 86400000).toISOString().slice(0, 10);
  const p = new URLSearchParams({ dataDisponibilizacaoInicio: de, dataDisponibilizacaoFim: ate, itensPorPagina: '100' });
  if (b.modo === 'nome') p.set('nomeParte', b.termo);
  else if (b.modo === 'oab') { p.set('numeroOab', String(b.termo).replace(/\D/g, '')); p.set('ufOab', b.uf_oab); }
  else p.set('numeroProcesso', String(b.termo).replace(/\D/g, ''));
  if (tribunal) p.set('siglaTribunal', tribunal);
  return `${DJEN_BASE}?${p.toString()}`;
}

// -------------------------------------------------- AGRUPAMENTO (uma só)
// Recebe as comunicações CRUAS (do servidor ou do runner local) e as
// transforma em UM registro por processo, com a triagem de homônimo.
function registrarResultado(searchId, { comunicacoes = [], por = 'servidor', erro = '' } = {}) {
  const b = db.prepare('SELECT * FROM court_searches WHERE id = ?').get(searchId);
  if (!b) throw new Error('Busca não encontrada.');
  if (erro) {
    db.prepare("UPDATE court_searches SET status='erro', detalhe=?, executada_por=?, concluida_em=? WHERE id=?")
      .run(s(erro, 500), s(por, 40), nowISO(), searchId);
    return { status: 'erro' };
  }
  const alvo = norm(b.modo === 'nome' ? b.termo : '');
  const porProcesso = new Map();
  for (const it of comunicacoes) {
    const cnj = repo.normCNJ(it.numeroprocessocommascara || it.numero_processo || '');
    if (!cnj) continue;
    const chave = cnj;
    const partes = (it.destinatarios || []).map(x => ({ nome: s(x.nome, 200), polo: s(x.polo, 4) })).filter(x => x.nome);
    const data = String(it.data_disponibilizacao || it.datadisponibilizacao || '').slice(0, 10);
    const atual = porProcesso.get(chave) || {
      numero_cnj: cnj, tribunal: s(it.siglaTribunal || it.siglatribunal, 12),
      orgao: s(it.nomeOrgao || it.nomeorgao, 200), classe: s(it.nomeClasse || it.nomeclasse, 200),
      partes: [], comunicacoes: 0, primeira_em: data, ultima_em: data, amostra: '',
    };
    atual.comunicacoes++;
    if (data && (!atual.primeira_em || data < atual.primeira_em)) atual.primeira_em = data;
    if (data && (!atual.ultima_em || data > atual.ultima_em)) atual.ultima_em = data;
    if (!atual.amostra) atual.amostra = s(String(it.texto || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), 400);
    for (const p of partes) if (!atual.partes.some(x => x.nome === p.nome && x.polo === p.polo)) atual.partes.push(p);
    if (!atual.orgao && (it.nomeOrgao || it.nomeorgao)) atual.orgao = s(it.nomeOrgao || it.nomeorgao, 200);
    if (!atual.classe && (it.nomeClasse || it.nomeclasse)) atual.classe = s(it.nomeClasse || it.nomeclasse, 200);
    porProcesso.set(chave, atual);
  }

  return transacao(gravar);
  function gravar() {
    db.prepare('DELETE FROM court_search_hits WHERE search_id = ?').run(searchId);
    const ins = db.prepare(`INSERT INTO court_search_hits (id, search_id, numero_cnj, tribunal, orgao, classe,
      partes, nome_casado, exato, comunicacoes, primeira_em, ultima_em, amostra, case_id, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const p of porProcesso.values()) {
      // triagem de homônimo: qual nome casou e se bate EXATAMENTE com o buscado
      let casado = '', exato = 0;
      if (alvo) {
        const igual = p.partes.find(x => norm(x.nome) === alvo);
        if (igual) { casado = igual.nome; exato = 1; }
        else {
          const contem = p.partes.find(x => norm(x.nome).includes(alvo));
          casado = contem ? contem.nome : (p.partes[0] ? p.partes[0].nome : '');
        }
      } else if (p.partes[0]) { casado = p.partes[0].nome; exato = 1; } // OAB/nº processo: não há homônimo de nome
      // processo já cadastrado no sistema? mostra em vez de deixar duplicar
      const jaTem = db.prepare('SELECT id FROM cases WHERE numero_cnj = ?').get(p.numero_cnj);
      ins.run(novoId(), searchId, p.numero_cnj, p.tribunal, p.orgao, p.classe, j.str(p.partes),
        casado, exato, p.comunicacoes, p.primeira_em, p.ultima_em, p.amostra, jaTem ? jaTem.id : '', nowISO());
    }
    db.prepare(`UPDATE court_searches SET status='concluida', detalhe='', executada_por=?,
      total_comunicacoes=?, total_processos=?, concluida_em=? WHERE id=?`)
      .run(s(por, 40), comunicacoes.length, porProcesso.size, nowISO(), searchId);
    repo.Integracoes.log('djen', 'busca-tribunais', 'ok',
      `${b.modo}="${b.termo}": ${comunicacoes.length} comunicação(ões) → ${porProcesso.size} processo(s) [${por}]`, porProcesso.size);
    return { status: 'concluida', processos: porProcesso.size, comunicacoes: comunicacoes.length };
  }
}

// Tenta executar NO SERVIDOR. O DJEN bloqueia IP de datacenter, então isto
// falha em produção hoje — e falhar é o caminho previsto: a busca fica
// pendente para o runner local. Se o CNJ liberar o IP um dia, passa a
// funcionar sozinho, sem mudar nada.
// `_buscar` é costura de teste: em produção bate no DJEN de verdade; a suíte
// injeta um dublê para exercitar o caminho bloqueado sem depender de rede.
let _buscar = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`DJEN HTTP ${r.status}${r.status === 403 ? ' (IP bloqueado — use o runner local)' : ''}`);
  return r.json();
};
function __mockBuscaParaTeste(fn) { _buscar = fn || (async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('DJEN HTTP ' + r.status); return r.json(); }); }

async function executarNoServidor(searchId) {
  const b = obter(searchId);
  db.prepare("UPDATE court_searches SET status='executando' WHERE id=?").run(searchId);
  const todas = [];
  try {
    for (const alvo of alvosDe(b)) {
      const d = await _buscar(alvo.url);
      for (const it of (d.items || [])) todas.push(it);
    }
    return registrarResultado(searchId, { comunicacoes: todas, por: 'servidor' });
  } catch (e) {
    db.prepare("UPDATE court_searches SET status='pendente', detalhe=? WHERE id=?")
      .run('Servidor não alcançou o DJEN (' + s(e.message, 200) + '). Aguardando o runner local.', searchId);
    return { status: 'pendente', detalhe: e.message };
  }
}

// ------------------------------------------------ CADASTRO EM 1 CLIQUE
// Cria o processo com o que o DJEN deu (tribunal, número, classe, órgão,
// partes) e ENRIQUECE pelo DataJud: capa oficial + TODOS os movimentos
// viram andamentos. Como nasce 'ativo' com numero_cnj, a rotina diária
// que já existe passa a acompanhá-lo sem mais nada.
async function cadastrar(hitId, d, autor, { consultar = coleta.consultarDataJud } = {}) {
  const h = db.prepare('SELECT * FROM court_search_hits WHERE id = ?').get(hitId);
  if (!h) throw new Error('Resultado não encontrado.');
  const partes = j.parse(h.partes, []);
  let caseId = h.case_id;
  let criado = false;

  if (!caseId) {
    const existente = db.prepare('SELECT id FROM cases WHERE numero_cnj = ?').get(h.numero_cnj);
    if (existente) caseId = existente.id;
    else {
      const c = repo.Processos.criar({
        numero_cnj: h.numero_cnj, tribunal: h.tribunal, classe: h.classe, orgao_julgador: h.orgao,
        assunto: s(d.assunto, 300) || h.classe || 'Importado da busca em tribunais',
        nucleo: s(d.nucleo, 30), client_id: s(d.client_id, 40), polo_cliente: s(d.polo_cliente, 20),
        status: 'ativo',
      }, autor);
      caseId = c.id; criado = true;
    }
    db.prepare('UPDATE court_search_hits SET case_id = ? WHERE id = ?').run(caseId, hitId);
  }

  // partes do DJEN (o DataJud não tem esse campo)
  let partesNovas = 0;
  for (const p of partes) {
    const polo = p.polo === 'A' ? 'ativo' : (p.polo === 'P' ? 'passivo' : 'terceiro');
    const ja = db.prepare('SELECT id FROM case_parties WHERE case_id = ? AND nome = ?').get(caseId, p.nome);
    if (ja) continue;
    db.prepare('INSERT INTO case_parties (id, case_id, polo, nome, doc, tipo) VALUES (?,?,?,?,?,?)')
      .run(novoId(), caseId, polo, p.nome, '', '');
    partesNovas++;
  }

  // capa + histórico completo pelo DataJud
  let andamentos = 0, capa = false, aviso = '';
  try {
    const fontes = await consultar(h.numero_cnj);
    const p = fontes && fontes[0];
    if (p) {
      capa = true;
      repo.Processos.atualizar(caseId, {
        classe: (p.classe && p.classe.nome) || h.classe,
        assunto: (p.assuntos && p.assuntos[0] && p.assuntos[0].nome) || undefined,
        orgao_julgador: (p.orgaoJulgador && p.orgaoJulgador.nome) || h.orgao,
        instancia: p.grau || '',
        sigiloso: Number(p.nivelSigilo) > 0 ? 1 : 0,
      });
      for (const m of (p.movimentos || [])) {
        const descricao = s(m.nome, 4000);
        if (!descricao) continue;
        const data = String(m.dataHora || '').slice(0, 10);
        try {
          const r = repo.Andamentos.criar(caseId, {
            data, descricao, classificacao: coleta.classificarMovimento(descricao),
            fonte: 'datajud', payload_raw: { codigo: m.codigo, origem: 'busca-tribunais' },
          }, autor);
          if (!r.duplicado) andamentos++;
        } catch (_) { /* movimento problemático não derruba a importação */ }
      }
    } else aviso = 'DataJud não retornou este processo (pode não estar na base pública ou estar em segredo).';
  } catch (e) { aviso = 'Capa/andamentos não importados agora: ' + s(e.message, 200) + '. A rotina diária tenta de novo.'; }

  return { case_id: caseId, criado, partes: partesNovas, andamentos, capa, aviso, numero_cnj: h.numero_cnj };
}

module.exports = {
  catalogo, criar, listar, obter, refazer, pendentes, registrarResultado, executarNoServidor, cadastrar,
  alvosDe, urlDJEN, TRIBUNAIS, FREQUENTES, MODOS, STATUS, norm, __mockBuscaParaTeste,
};
