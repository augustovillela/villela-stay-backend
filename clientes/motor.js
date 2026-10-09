// =====================================================================
// Clientes — MOTOR: junta as fontes, marca o que não é venda, filtra,
// soma e exporta.
//
// A LISTA DE SISTEMAS NÃO É DAQUI: é o catálogo da central de comunicados
// (`comunicados/fontes.js`). Este módulo só diz, para cada sistema de lá,
// COMO se lê quem paga (LEITORES) ou POR QUE não se lê (FORA). Sistema novo
// na central sem uma das duas coisas aparece na página como "não integrada"
// — e o teste quebra, para ninguém esquecer.
//
// O QUE ENTRA NA RECEITA: pagamento registrado, de R$ 1,00 ou mais, de
// vínculo com natureza `pago`, de conta que não é interna. Cortesia, período
// de teste, compra de teste (Pix de centavo), produto gratuito e reembolso
// aparecem na lista e são CONTADOS À PARTE.
// =====================================================================
'use strict';
const fontes = require('../comunicados/fontes');
const L = require('./leitores');

// "Pix de centavo não é venda": abaixo disto é teste de checkout ou de chave.
const PISO_VENDA_CENTAVOS = 100;
const TEMPO_LIMITE_MS = Number(process.env.CLIENTES_TEMPO_LIMITE_MS || 8000);
const CACHE_MS = Number(process.env.CLIENTES_CACHE_MS || 20000);

const LEITORES = {
  academy: L.academy,
  livraria: L.livraria,
  vsm: L.saasSimples('vsm', 'admin'),
  'legal-saas': L.saasSimples('legal-saas', 'admin'),
  crm: L.saasSimples('crm', 'owner'),
  vdocs: L.saasGlobal('vdocs'),
  vpe: L.saasGlobal('vpe'),
  finance: L.finance,
  closet: L.closet,
  music: L.music,
  'alta-vista': L.altaVista,
};
// Sistemas do catálogo que NÃO entram — com o motivo que a página mostra.
const FORA = {
  vitrine: { estado: 'nao_se_aplica', motivo: 'Marketplace entre usuários: o pagamento é do comprador ao vendedor (a plataforma só retém comissão) e ainda não há credencial de pagamento em produção. Não há assinatura nem venda do grupo aqui.' },
  kids: { estado: 'nao_se_aplica', motivo: 'Invente está em beta fechado por convite, sem cobrança: não existe compra nem assinatura registrada.' },
  hospede: { estado: 'nao_se_aplica', motivo: 'Hóspedes das casas não são alunos, compradores de livro nem assinantes de sistema — as reservas ficam na Stays (menu Reservas).' },
  cozinhe: { estado: 'nao_integrada', motivo: 'O Cozinhe roda em serviço separado, sem preço nem modelo comercial definido, e não entrega a lista de contas ao backend (o painel só recebe e-mail mascarado). Falta uma rota no próprio Cozinhe.' },
};
// Produtos do grupo que a central de comunicados (ainda) não conhece.
const EXTRAS = [
  { chave: 'origena', nome: 'Origena', emoji: '🌳', ler: (dep) => L.origena(dep && dep.origena) },
  { chave: 'viver-de-chacara', nome: 'Viver de Chácara', emoji: '🌱', estado: 'nao_integrada',
    motivo: 'Aplicação à parte (Next.js + Supabase, outro repositório) e ainda não está no ar: não há clientes para ler.' },
];

function catalogo() {
  const doGrupo = fontes.todas().map((f) => {
    const base = { chave: f.chave, nome: f.nome, emoji: f.emoji || '' };
    if (LEITORES[f.chave]) return { ...base, ler: LEITORES[f.chave] };
    if (FORA[f.chave]) return { ...base, ...FORA[f.chave] };
    return { ...base, estado: 'nao_integrada', sem_classificacao: true,
      motivo: 'Sistema novo na central de comunicados, ainda sem leitor de clientes (falta classificar em clientes/motor.js).' };
  });
  return doGrupo.concat(EXTRAS);
}

let _dep = { emailsInternos: () => [], origena: undefined, log: (m) => console.error(m) };
let _cache = null;
function configurar(dep = {}) { _dep = { ..._dep, ...dep }; _cache = null; return _dep; }

const normEmail = (e) => String(e || '').trim().toLowerCase();
function conjuntoInterno() {
  const lista = [];
  try { lista.push(...(_dep.emailsInternos() || [])); } catch (_) { /* staff ilegível não derruba a página */ }
  lista.push(...String(process.env.CLIENTES_EMAILS_INTERNOS || '').split(/[,;\s]+/), process.env.MUSIC_DONO_EMAIL || '');
  return new Set(lista.map(normEmail).filter(Boolean));
}

const dia = (v) => String(v || '').slice(0, 10);
const soma = (ps) => ps.reduce((s, p) => s + p.centavos, 0);
const juntarObs = (a, b) => [a, b].filter(Boolean).join(' · ');

// Completa a linha do leitor com o que só o motor sabe (interna, teste, receita).
function marcar(l, fonte, internos) {
  l.sistema = fonte.chave; l.sistema_nome = fonte.nome; l.sistema_emoji = fonte.emoji || '';
  if (fontes.ehContaDeDemonstracao(l.email)) { l.interna = true; l.obs = juntarObs(l.obs, 'conta de demonstração'); }
  else if (l.email && internos.has(l.email)) { l.interna = true; l.obs = juntarObs(l.obs, 'conta interna do grupo'); }
  else if (l.interna) l.obs = juntarObs(l.obs, 'conta interna do grupo');

  const validos = l.pagamentos.filter((p) => p.centavos >= PISO_VENDA_CENTAVOS);
  if (l.natureza === 'pago' && !validos.length) {
    l.natureza = 'compra_teste';
    l.obs = juntarObs(l.obs, 'pagamento abaixo de R$ 1,00 — tratado como teste, não como venda');
  }
  l.conta_na_receita = l.natureza === 'pago' && !l.interna;
  l.pagamentos_receita = l.conta_na_receita ? validos : [];
  // O que foi pago DE FATO. Sem registro de pagamento o campo é nulo — nunca preço de tabela.
  l.valor_pago_centavos = l.pagamentos.length ? soma(l.pagamentos) : null;
  l.pagamentos_n = l.pagamentos.length;
  l.ultimo_pagamento_em = l.pagamentos.map((p) => p.em).sort().pop() || '';
  if (l.valor_pago_centavos === null && !['cortesia', 'em_teste'].includes(l.natureza)) l.obs = juntarObs(l.obs, 'sem registro de pagamento');
  return l;
}

const comPrazo = (promessa, ms) => Promise.race([
  promessa, new Promise((_, nao) => { const t = setTimeout(() => nao(new Error(`sem resposta em ${ms} ms`)), ms); if (t.unref) t.unref(); }),
]);

// Lê TODAS as fontes. Uma fonte que falha vira "indisponível" — e as outras seguem.
async function coletar({ atualizar = false } = {}) {
  if (!atualizar && _cache && Date.now() - _cache.em < CACHE_MS) return _cache.valor;
  const internos = conjuntoInterno();
  const linhas = [], estado = [];
  await Promise.all(catalogo().map(async (f) => {
    const base = { chave: f.chave, nome: f.nome, emoji: f.emoji || '' };
    if (!f.ler) { estado.push({ ...base, estado: f.estado, motivo: f.motivo, linhas: 0, sem_classificacao: !!f.sem_classificacao }); return; }
    try {
      const lidas = await comPrazo(Promise.resolve().then(() => f.ler(_dep)), TEMPO_LIMITE_MS);
      for (const l of lidas) linhas.push(marcar(l, f, internos));
      estado.push({ ...base, estado: 'ok', motivo: lidas.aviso || '', linhas: lidas.length });
    } catch (e) {
      if (e && e.naoIntegrada) { estado.push({ ...base, estado: 'nao_integrada', motivo: e.message, linhas: 0 }); return; }
      // Só a mensagem técnica: erro de leitura não carrega dado de cliente.
      _dep.log(`[clientes] fonte ${f.chave} indisponível: ${e && e.message}`);
      estado.push({ ...base, estado: 'indisponivel', motivo: `Não consegui ler agora (${String((e && e.message) || 'erro').slice(0, 160)}).`, linhas: 0 });
    }
  }));
  const ordem = new Map(catalogo().map((f, i) => [f.chave, i]));
  estado.sort((a, b) => ordem.get(a.chave) - ordem.get(b.chave));
  linhas.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const valor = { linhas, fontes: estado, lido_em: new Date().toISOString() };
  _cache = { em: Date.now(), valor };
  return valor;
}

const TIPOS = ['aluno', 'comprador', 'assinante'];
const NATUREZAS = ['pago', 'cortesia', 'em_teste', 'compra_teste', 'gratuito', 'reembolsado', 'sem_pagamento'];
const lista = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function lerFiltros(q = {}) {
  const de = DATA.test(String(q.de || '')) ? String(q.de) : '';
  const ate = DATA.test(String(q.ate || '')) ? String(q.ate) : '';
  return {
    sistema: lista(q.sistema), tipo: lista(q.tipo).filter((t) => TIPOS.includes(t)),
    status: lista(q.status), natureza: lista(q.natureza).filter((n) => NATUREZAS.includes(n)),
    de, ate, q: String(q.q || q.busca || '').trim().toLowerCase().slice(0, 120),
    internas: String(q.internas == null ? '1' : q.internas) !== '0',
    agrupar: String(q.agrupar || '') === 'email',
    pagina: Math.max(1, parseInt(q.pagina, 10) || 1),
    por_pagina: Math.min(200, Math.max(1, parseInt(q.por_pagina, 10) || 50)),
  };
}
const noPeriodo = (quando, f) => { const d = dia(quando); return (!f.de || d >= f.de) && (!f.ate || d <= f.ate); };
function passa(l, f) {
  if (f.sistema.length && !f.sistema.includes(l.sistema)) return false;
  if (f.tipo.length && !f.tipo.includes(l.tipo)) return false;
  if (f.status.length && !f.status.includes(l.status)) return false;
  if (f.natureza.length && !f.natureza.includes(l.natureza)) return false;
  if (!f.internas && l.interna) return false;
  if (f.q && ![l.nome, l.email, l.item, l.conta].some((c) => String(c || '').toLowerCase().includes(f.q))) return false;
  return true;
}

const contar = (ls, campo) => ls.reduce((m, l) => { m[l[campo]] = (m[l[campo]] || 0) + 1; return m; }, {});
const distintos = (ls) => new Set(ls.map((l) => l.email || `${l.sistema}:${l.origem_id}`)).size;

// `base` = passou em tudo MENOS o período; `noPer` = base cuja DATA cai no período.
// A receita olha a data de cada PAGAMENTO: assinante antigo que pagou neste mês conta neste mês.
function totais(base, noPer, f, estadoFontes) {
  const receita = { pago_centavos: 0, pagamentos: 0, por_sistema: {} };
  const fora = { cortesia: 0, em_teste: 0, gratuito: 0, sem_pagamento: 0, compra_teste: { linhas: 0, centavos: 0 }, internas: { linhas: 0, centavos: 0 }, reembolsado: { linhas: 0, centavos: 0 } };
  for (const l of base) {
    for (const p of l.pagamentos_receita) {
      if (!noPeriodo(p.em, f)) continue;
      receita.pago_centavos += p.centavos; receita.pagamentos++;
      receita.por_sistema[l.sistema] = (receita.por_sistema[l.sistema] || 0) + p.centavos;
    }
  }
  for (const l of noPer) {
    const pagoNaLinha = l.valor_pago_centavos || 0;
    if (l.interna) { fora.internas.linhas++; fora.internas.centavos += l.natureza === 'reembolsado' ? 0 : pagoNaLinha; }
    if (l.natureza === 'compra_teste') { fora.compra_teste.linhas++; fora.compra_teste.centavos += pagoNaLinha; }
    else if (l.natureza === 'reembolsado') { fora.reembolsado.linhas++; fora.reembolsado.centavos += l.reembolsado_centavos; }
    else if (fora[l.natureza] !== undefined && typeof fora[l.natureza] === 'number') fora[l.natureza]++;
  }
  const vivos = noPer.filter((l) => !l.interna);
  const assin = vivos.filter((l) => l.tipo === 'assinante');
  const porSistema = {};
  for (const l of noPer) {
    const s = porSistema[l.sistema] || (porSistema[l.sistema] = { nome: l.sistema_nome, linhas: 0, pessoas: new Set(), pago: 0, cortesia: 0, em_teste: 0, outras: 0, internas: 0 });
    s.linhas++; s.pessoas.add(l.email || l.origem_id);
    if (l.interna) s.internas++;
    if (l.natureza === 'pago') s.pago++; else if (l.natureza === 'cortesia') s.cortesia++; else if (l.natureza === 'em_teste') s.em_teste++; else s.outras++;
  }
  for (const k of Object.keys(porSistema)) porSistema[k] = { ...porSistema[k], pessoas: porSistema[k].pessoas.size, receita_centavos: receita.por_sistema[k] || 0 };
  return {
    linhas: noPer.length, pessoas: distintos(noPer),
    por_sistema: porSistema, por_tipo: contar(noPer, 'tipo'), por_natureza: contar(noPer, 'natureza'), por_status: contar(noPer, 'status'),
    destaques: {
      livros_vendidos: vivos.filter((l) => l.sistema === 'livraria' && l.natureza === 'pago').reduce((s, l) => s + l.quantidade, 0),
      pedidos_de_livro: vivos.filter((l) => l.sistema === 'livraria' && l.natureza === 'pago').length,
      alunos: distintos(vivos.filter((l) => l.tipo === 'aluno' && ['ativa', 'cortesia', 'paga'].includes(l.status))),
      alunos_pagantes: distintos(vivos.filter((l) => l.tipo === 'aluno' && l.natureza === 'pago' && ['ativa', 'paga'].includes(l.status))),
      assinantes_ativos: assin.filter((l) => l.status === 'ativa' && l.natureza === 'pago').length,
      assinantes_em_teste: assin.filter((l) => l.status === 'em_teste').length,
      assinantes_cortesia: assin.filter((l) => l.natureza === 'cortesia' && l.status !== 'cancelada').length,
      assinantes_ativos_sem_pagamento: assin.filter((l) => l.status === 'ativa' && l.natureza === 'sem_pagamento').length,
    },
    receita: { periodo: { de: f.de || null, ate: f.ate || null }, ...receita, piso_venda_centavos: PISO_VENDA_CENTAVOS, fora_da_receita: fora },
    fontes_indisponiveis: estadoFontes.filter((x) => x.estado === 'indisponivel').map((x) => x.nome),
    fontes_nao_integradas: estadoFontes.filter((x) => x.estado === 'nao_integrada').map((x) => x.nome),
  };
}

// O que sai para a tela e para o CSV: sem os vetores internos.
const CAMPOS = ['sistema', 'sistema_nome', 'sistema_emoji', 'tipo', 'nome', 'email', 'telefone', 'conta', 'item', 'data', 'status', 'status_origem',
  'natureza', 'valor_pago_centavos', 'mensalidade_centavos', 'pagamentos_n', 'ultimo_pagamento_em', 'reembolsado_centavos', 'quantidade',
  'conta_na_receita', 'interna', 'obs', 'origem_id'];
const publica = (l) => Object.fromEntries(CAMPOS.map((c) => [c, l[c]]));

function agruparPorEmail(ls) {
  const m = new Map();
  for (const l of ls) {
    const k = l.email || `sem-email:${l.sistema}:${l.origem_id}`;
    let g = m.get(k);
    if (!g) { g = { email: l.email, nome: l.nome, telefones: new Set(), sistemas: new Set(), linhas: [], total_pago_centavos: 0, ultima_data: '', interna: false }; m.set(k, g); }
    g.linhas.push(publica(l));
    g.sistemas.add(l.sistema_nome);
    if (l.telefone) g.telefones.add(l.telefone);
    if (l.conta_na_receita) g.total_pago_centavos += soma(l.pagamentos_receita);
    if (String(l.data) > g.ultima_data) g.ultima_data = l.data;
    if (l.interna) g.interna = true;
  }
  return [...m.values()].map((g) => ({ ...g, telefones: [...g.telefones], sistemas: [...g.sistemas], vinculos: g.linhas.length }))
    .sort((a, b) => String(b.ultima_data).localeCompare(String(a.ultima_data)));
}

async function consultar(query = {}) {
  const f = lerFiltros(query);
  const { linhas, fontes: estadoFontes, lido_em } = await coletar({ atualizar: String(query.atualizar || '') === '1' });
  const base = linhas.filter((l) => passa(l, f));
  const noPer = base.filter((l) => noPeriodo(l.data, f));
  const itens = f.agrupar ? agruparPorEmail(noPer) : noPer.map(publica);
  const ini = (f.pagina - 1) * f.por_pagina;
  return {
    filtros: f, lido_em, fontes: estadoFontes, totais: totais(base, noPer, f, estadoFontes),
    paginacao: { pagina: f.pagina, por_pagina: f.por_pagina, total: itens.length, paginas: Math.max(1, Math.ceil(itens.length / f.por_pagina)) },
    [f.agrupar ? 'grupos' : 'clientes']: itens.slice(ini, ini + f.por_pagina),
    opcoes: { tipos: TIPOS, naturezas: NATUREZAS, status: [...new Set(linhas.map((l) => l.status))].sort(),
      sistemas: estadoFontes.map((x) => ({ chave: x.chave, nome: x.nome, emoji: x.emoji, estado: x.estado })) },
  };
}

// ---------------- CSV (mesmos filtros, sem paginação) ----------------
const reais = (c) => c == null ? '' : (c / 100).toFixed(2).replace('.', ',');
// Planilha executa célula que começa com = + - @: neutraliza (nome e item vêm de cadastro de cliente).
const celula = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const COLUNAS = [
  ['Sistema', (l) => l.sistema_nome], ['Tipo', (l) => l.tipo], ['Nome', (l) => l.nome], ['E-mail', (l) => l.email],
  ['Telefone', (l) => l.telefone], ['Conta', (l) => l.conta], ['Item', (l) => l.item], ['Data', (l) => dia(l.data)],
  ['Status', (l) => l.status], ['Natureza', (l) => l.natureza], ['Valor pago (R$)', (l) => reais(l.valor_pago_centavos)],
  ['Mensalidade (R$)', (l) => reais(l.mensalidade_centavos)], ['Pagamentos', (l) => l.pagamentos_n],
  ['Último pagamento', (l) => dia(l.ultimo_pagamento_em)], ['Reembolsado (R$)', (l) => l.reembolsado_centavos ? reais(l.reembolsado_centavos) : ''],
  ['Conta na receita', (l) => l.conta_na_receita ? 'sim' : 'não'], ['Conta interna', (l) => l.interna ? 'sim' : 'não'],
  ['Observação', (l) => l.obs], ['ID de origem', (l) => l.origem_id],
];
async function csv(query = {}) {
  const f = lerFiltros(query);
  const { linhas } = await coletar({ atualizar: String(query.atualizar || '') === '1' });
  const sel = linhas.filter((l) => passa(l, f) && noPeriodo(l.data, f));
  const corpo = [COLUNAS.map((c) => celula(c[0])).join(';')]
    .concat(sel.map((l) => COLUNAS.map((c) => celula(c[1](l))).join(';'))).join('\r\n');
  return { texto: '﻿' + corpo + '\r\n', linhas: sel.length };   // BOM: o Excel abre com acento certo
}

module.exports = { configurar, catalogo, coletar, consultar, csv, lerFiltros, PISO_VENDA_CENTAVOS, TIPOS, NATUREZAS,
  _int: { marcar, totais, agruparPorEmail, celula, LEITORES, FORA, EXTRAS, limparCache: () => { _cache = null; } } };
