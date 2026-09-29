// =====================================================================
// Musique · Laboratório — peças de HTML do servidor.
//
// A página chega PRONTA (desenho em SVG, tabelas, textos): útil sem
// JavaScript, indexável e acessível. O JS do cliente só acrescenta som e
// interação por cima. `esc` em tudo o que não é texto autoral da casa.
// =====================================================================
'use strict';
const { layout } = require('../paginas');
const N = require('./nucleo/notas');
const I = require('./nucleo/intervalos');
const E = require('./nucleo/escalas');
const A = require('./nucleo/acordes');
const T = require('./nucleo/tonalidades');
const R = require('./nucleo/ritmo');
const INS = require('./nucleo/instrumentos');
const D = require('./nucleo/desenho');
const AC = require('./nucleo/acustica');
const CAT = require('./catalogo');

const esc = D.esc;
const pt = (n) => N.nome(n, { notacao: 'pt', glifo: true, oitava: false });
const ptO = (n) => N.nome(n, { notacao: 'pt', glifo: true });
const cif = (n) => N.nome(n, { glifo: true, oitava: false });

/** Botão de ouvir: o cliente toca (o servidor só descreve). */
function ouvir(midis, { rotulo = 'Ouvir', modo = 'melodico', classe = '', dur = null, vel = null, passo = null } = {}) {
  return `<button type="button" class="lab-ouvir ${esc(classe)}" data-midis="${esc(JSON.stringify(midis))}" data-modo="${esc(modo)}"${dur ? ` data-dur="${esc(dur)}"` : ''}${vel ? ` data-vel="${esc(vel)}"` : ''}${passo ? ` data-passo="${esc(passo)}"` : ''}><span aria-hidden="true">▶</span> ${esc(rotulo)}</button>`;
}

const SUBNAV = () => `<nav class="lab-sub" aria-label="Laboratório Musical"><div class="wrap">
  <a class="lab-sub-home" href="/music/laboratorio"><span aria-hidden="true">🧪</span> Laboratório</a>
  ${CAT.AMBIENTES.map((a) => `<a href="${a.url}"><span aria-hidden="true">${a.icone}</span> ${esc(a.nome)}</a>`).join('')}
  <form class="lab-busca-mini" action="/music/buscar" role="search"><label class="sr" for="lab-q-top">Buscar no Laboratório</label>
    <input id="lab-q-top" name="q" type="search" placeholder="Buscar: dó#, 3M, G7(9)…" autocomplete="off"></form>
</div></nav>`;

/**
 * Casca de toda página do Laboratório. `estado`: objeto que o cliente
 * lê para montar a ferramenta (vai como JSON escapado num atributo).
 */
function pagina(res, { titulo, descricao = '', caminho, corpo, ferramenta = '', estado = null, trilha = [], jsonld = null, status = 200, indexar = true }) {
  const migalhas = trilha.length ? `<nav class="lab-migalhas" aria-label="Você está em"><a href="/music/laboratorio">Laboratório</a>${trilha.map(([t, u]) => ` <span aria-hidden="true">›</span> ${u ? `<a href="${esc(u)}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`}`).join('')}</nav>` : '';
  const html = layout(titulo, `
<link rel="stylesheet" href="/music/laboratorio.css">
${SUBNAV()}
<main class="wrap lab" id="lab-main"${ferramenta ? ` data-ferramenta="${esc(ferramenta)}"` : ''}${estado ? ` data-estado="${esc(JSON.stringify(estado))}"` : ''}>
${migalhas}
${corpo}
</main>
<div class="lab-som" id="lab-som" hidden><button type="button" id="lab-parar" class="lab-parar">■ Parar o som</button>
  <label>Volume <input type="range" id="lab-volume" min="0" max="100" value="45" aria-label="Volume"></label></div>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
<script src="/music/audio.js"></script>
<script src="/music/laboratorio-nucleo.js"></script>
<script src="/music/laboratorio.js"></script>`, { descricao, caminho });
  const final = indexar ? html : html.replace('<meta name="robots" content="index,follow,max-image-preview:large">', '<meta name="robots" content="noindex,follow">');
  res.status(status).set('Content-Type', 'text/html; charset=utf-8').send(final);
}

function naoAchou(res, oque) {
  pagina(res, { titulo: 'Não encontrado — Musique', caminho: '/music/laboratorio', status: 404, indexar: false,
    corpo: `<h1>Não encontrei ${esc(oque)}</h1><p>O endereço pode ter um nome que o Musique não reconhece. Tente a <a href="/music/buscar">busca</a> ou volte ao <a href="/music/laboratorio">Laboratório</a>.</p>` });
}

// ------------------------------------------------------------------
// Desenhos prontos
// ------------------------------------------------------------------
/** Piano com um conjunto de notas grafadas (a raiz com marca própria). */
function pianoDe(notas, { raiz = null, titulo = 'Teclado', de = null, ate = null, rotulos = true } = {}) {
  const ms = notas.map(N.midi).filter((m) => m != null);
  const destaques = {};
  notas.forEach((n) => { const m = N.midi(n); if (m != null) destaques[m] = { rotulo: rotulos ? pt(n) : '', tipo: raiz && N.mesmaAltura(N.semOitava(n), N.semOitava(raiz)) ? 'raiz' : 'nota' }; });
  const lo = de != null ? de : Math.min(...ms, 60) - 2;
  const hi = ate != null ? ate : Math.max(...ms, 71) + 1;
  return D.piano({ de: Math.max(21, lo - ((lo % 12 + 12) % 12 === 0 ? 0 : 0)), ate: Math.min(108, hi), destaques, titulo });
}

/** Posições de um conjunto de notas no braço (até a casa 12). */
function bracoDe(notas, { raiz = null, instrumento = 'violao', afinacao = 'padrao', casas = 12, titulo } = {}) {
  const af = INS.afinacao(instrumento, afinacao);
  const porPc = {};
  notas.forEach((n) => { porPc[N.pc(n)] = n; });
  const pos = INS.posicoes(af, Object.keys(porPc).map(Number), casas);
  const destaques = pos.map((p) => ({ corda: p.corda, casa: p.casa, rotulo: pt(porPc[p.pc]), tipo: raiz && p.pc === N.pc(raiz) ? 'raiz' : 'nota' }));
  return D.braco({ afinacao: af, casas, destaques, titulo: titulo || `Braço do ${INS.instrumento(instrumento).nome}` });
}

/** Oitava de partida para a escala caber bem na clave de sol. */
function naOitavaBoa(tonica, oitava = 4) {
  const t = N.ler(tonica);
  const o = t.oitava != null ? t.oitava : (t.li >= 4 ? oitava - 1 : oitava);
  return N.comOitava(t, o);
}

function pautaDe(notas, { clave = 'sol', acorde = false, rotulos = true, titulo, armadura = 0 } = {}) {
  return D.pauta({ clave, acorde, armadura, titulo, notas: notas.map((n) => ({ nota: N.nome(n), rotulo: rotulos ? pt(n) : '' })) });
}

/** Renderiza um bloco `visual` de lição. */
function visual(v) {
  if (v.tipo === 'piano') {
    const dest = {};
    (v.marcar || []).forEach(([m, r]) => { dest[m] = { rotulo: r, tipo: 'nota' }; });
    return `<figure class="lab-fig">${D.piano({ de: v.de, ate: v.ate, destaques: dest, rotulos: v.rotulos || 'dos', titulo: 'Teclado' })}</figure>`;
  }
  if (v.tipo === 'pauta') {
    const ns = v.notas.map(N.ler);
    const rot = v.rotulos || (v.rotular ? ns.map(pt) : []);
    return `<figure class="lab-fig">${D.pauta({ clave: v.clave, armadura: v.armadura || 0, notas: ns.map((n, i) => ({ nota: N.nome(n), rotulo: rot[i] || '' })) })}
      ${ns.length ? ouvir(ns.map(N.midi), { rotulo: 'Ouvir' }) : ''}</figure>`;
  }
  if (v.tipo === 'escala') {
    const ns = E.notas(v.tonica, v.escala);
    const t = N.ler(v.tonica);
    const com8 = ns.concat([N.comOitava(t, t.oitava + 1)]);
    return `<figure class="lab-fig">${pautaDe(com8)}${pianoDe(ns, { raiz: t })}
      <figcaption>${esc(pt(t))} ${esc(E.porId(v.escala).nome)}: ${esc(ns.map(pt).join(' – '))} · ${esc(E.passos(v.escala).join(' '))}
      ${ouvir(com8.map(N.midi), { rotulo: 'Ouvir subindo' })} <a href="${CAT.urlEscala(t, v.escala)}">Abrir a escala</a></figcaption></figure>`;
  }
  if (v.tipo === 'acorde') {
    const ns = A.notas(v.fundamental, v.acorde);
    return `<figure class="lab-fig">${pautaDe(ns, { acorde: true })}${pianoDe(ns, { raiz: v.fundamental })}
      <figcaption>${esc(A.simbolo(v.fundamental, v.acorde))} — ${esc(ns.map(pt).join(', '))} ${ouvir(ns.map(N.midi), { modo: 'harmonico' })}
      <a href="${CAT.urlAcorde(N.ler(v.fundamental), v.acorde)}">Abrir o acorde</a></figcaption></figure>`;
  }
  if (v.tipo === 'vozes') {
    const cols = v.colunas.map((c) => c.map(N.ler));
    return `<figure class="lab-fig">${D.pauta({ clave: v.clave || 'sol', armadura: v.armadura || 0, colunas: v.colunas, titulo: v.titulo || 'Duas vozes' })}
      <figcaption>${v.legenda ? esc(v.legenda) + ' ' : ''}<button type="button" class="lab-ouvir" data-sequencia="${esc(JSON.stringify(cols.map((c) => c.map(N.midi))))}"><span aria-hidden="true">▶</span> Ouvir</button></figcaption></figure>`;
  }
  if (v.tipo === 'progressao') {
    const acs = v.simbolos.map((s) => ({ s, a: A.ler(s) }));
    let ant = null;
    const seq = acs.map(({ a }) => {
      if (!a) return [];
      const c = A.conduzir(ant, a.fundamental, a.id);
      const ns = c ? c.notas : A.notas(N.comOitava(a.fundamental, 4), a.id);
      ant = ns;
      const baixo = a.baixo || a.fundamental;
      return [N.midi(N.comOitava(baixo, 2))].concat(ns.map(N.midi));
    });
    return `<figure class="lab-fig lab-prog"><p class="lab-prog-acordes">${acs.map(({ s, a }, i) => (a ? `<a href="${CAT.urlAcorde(a.fundamental, a.id)}">${esc(s)}</a>` : esc(s)) + (v.graus ? ` <small>${esc(v.graus[i] || '')}</small>` : '')).join(' → ')}</p>
      <figcaption>${v.legenda ? esc(v.legenda) + ' ' : ''}<button type="button" class="lab-ouvir" data-sequencia="${esc(JSON.stringify(seq))}"><span aria-hidden="true">▶</span> Ouvir</button></figcaption></figure>`;
  }
  if (v.tipo === 'campo') return tabelaCampo(N.ler(v.tonica), v.modo, { tetrades: v.tetrades });
  if (v.tipo === 'circulo-quintas') return `<figure class="lab-fig lab-fig-circ">${circuloDeQuintas({})}</figure>`;
  if (v.tipo === 'serie') return tabelaSerie(v.fundamental);
  if (v.tipo === 'figuras') return tabelaFiguras();
  return '';
}

function circuloDeQuintas({ ativo = null, modo = 'maior' } = {}) {
  const itens = T.CIRCULO.map((c, i) => {
    const q = T.armadura(c.maior, 'maior').quantidade;
    const sel = ativo != null && i === ativo;
    return { rotulo: cif(N.ler(c.maior)) + (c.alt ? '/' + cif(N.ler(c.alt)) : ''), sub: q ? Math.abs(q) + (q > 0 ? '♯' : '♭') : '',
      tipo: sel && modo === 'maior' ? 'ativo' : (ativo != null && (i === (ativo + 1) % 12 || i === (ativo + 11) % 12) ? 'vizinho' : ''), dado: 'M' + i,
      acessivel: T.nome(N.ler(c.maior), 'maior') + ', ' + (q ? Math.abs(q) + (q > 0 ? ' sustenido(s)' : ' bemol(is)') : 'sem acidentes') };
  });
  const internos = T.CIRCULO.map((c, i) => ({ rotulo: cif(N.ler(c.menor)) + 'm', tipo: ativo != null && i === ativo && modo === 'menor' ? 'ativo' : '', dado: 'm' + i,
    acessivel: T.nome(N.ler(c.menor), 'menor') }));
  return D.anel({ itens, interno: internos, titulo: 'Círculo de quintas', centro: 'quintas ↻',
    descricao: 'Tons maiores por fora e relativos menores por dentro; no sentido horário, cada passo sobe uma quinta e acrescenta um sustenido.', interativo: true });
}

function tabelaCampo(tonica, modo, { tetrades = false, variante } = {}) {
  const c = T.campo(tonica, modo, { tetrades, variante });
  if (!c) return '';
  return `<div class="lab-tabela-rolagem"><table class="lab-tabela"><caption>Campo harmônico de ${esc(T.nome(tonica, modo))}${tetrades ? ' (tétrades)' : ' (tríades)'}${variante ? ' — menor ' + esc(variante === 'harmonica' ? 'harmônica' : variante === 'melodica' ? 'melódica' : 'natural') : ''}</caption>
  <thead><tr><th scope="col">Grau</th><th scope="col">Acorde</th><th scope="col">Notas</th><th scope="col">Função</th><th scope="col"><span class="sr">Ouvir</span></th></tr></thead><tbody>
  ${c.map((g) => {
    const ms = A.notas(naOitavaBoa(g.fundamental, 3), g.acorde);
    return `<tr><th scope="row">${esc(g.romano)}</th><td><a href="${CAT.urlAcorde(g.fundamental, g.acorde)}">${esc(g.simbolo)}</a></td>
    <td>${esc(g.notas.map(pt).join(' – '))}</td><td><span class="lab-func lab-func-${esc(g.funcao)}" title="${esc(g.funcao_nome)}">${esc(g.funcao)}</span> <small>${esc(g.funcao_nome)}</small></td>
    <td>${ms ? ouvir(ms.map(N.midi), { rotulo: 'Ouvir', modo: 'harmonico', classe: 'mini' }) : ''}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function tabelaSerie(fundamental) {
  const s = AC.serieHarmonica(fundamental, 16);
  return `<div class="lab-tabela-rolagem"><table class="lab-tabela"><caption>Série harmônica de ${esc(ptO(N.ler(fundamental)))}</caption>
  <thead><tr><th scope="col">Harmônico</th><th scope="col">Frequência</th><th scope="col">Nota mais próxima</th><th scope="col">Desvio do piano</th><th scope="col"><span class="sr">Ouvir</span></th></tr></thead><tbody>
  ${s.map((h) => `<tr><th scope="row">${h.harmonico}º</th><td>${h.hz.toFixed(1).replace('.', ',')} Hz</td><td>${esc(ptO(h.nota))}</td>
    <td>${h.cents === 0 ? 'afinado' : (h.cents > 0 ? '+' : '') + h.cents + ' cents'}</td><td><button type="button" class="lab-ouvir mini" data-hz="${h.hz.toFixed(3)}"><span aria-hidden="true">▶</span> Ouvir</button></td></tr>`).join('')}
  </tbody></table></div>`;
}

function tabelaFiguras() {
  return `<div class="lab-tabela-rolagem"><table class="lab-tabela lab-figuras"><caption>Figuras e pausas (valor em semibreves)</caption>
  <thead><tr><th scope="col">Figura</th><th scope="col">Nota</th><th scope="col">Pausa</th><th scope="col">Valor</th><th scope="col">Em 4/4</th><th scope="col">Inglês</th></tr></thead><tbody>
  ${R.FIGURAS.map((f) => `<tr><th scope="row">${esc(f.nome)}</th><td class="glifo" aria-hidden="true">${D.figura({ id: f.id, nome: f.nome })}</td><td class="glifo" aria-hidden="true">${D.figura({ id: f.id, nome: f.nome, pausa: true })}</td>
    <td>${esc(R.texto(f.valor))}</td><td>${esc(emTempos(f.valor))}</td><td lang="en">${esc(f.en)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function emTempos(v) { const t = R.mult(v, R.fr(4, 1)); return R.texto(t) + (t.n === t.d ? ' tempo' : ' tempos'); }

function cartoes(itens) {
  return `<ul class="lab-cartoes">${itens.map((i) => `<li><a class="lab-cartao" href="${esc(i.url)}">
    <span class="lab-cartao-ico" aria-hidden="true">${esc(i.icone || '♪')}</span>
    <span class="lab-cartao-t">${esc(i.nome)}${i.selo ? ` <span class="lab-selo">${esc(i.selo)}</span>` : ''}</span>
    <span class="lab-cartao-r">${esc(i.resumo || '')}</span></a></li>`).join('')}</ul>`;
}

/** Aviso de acesso pago: diz o motivo e o caminho (nunca erro genérico). */
function portao(r) {
  return `<div class="lab-portao" role="note"><p><strong>🔒 ${esc(r.motivo)}</strong></p>
  <p>A assinatura inclui a trilha completa, o seu progresso guardado, a revisão espaçada e as atividades de professor. As ferramentas e as referências continuam abertas para todos.</p>
  ${r.acao ? `<a class="btn" href="${esc(r.acao.url)}">${esc(r.acao.rotulo)}</a>` : ''}</div>`;
}

module.exports = { esc, pt, ptO, cif, ouvir, pagina, naoAchou, pianoDe, bracoDe, pautaDe, naOitavaBoa, visual, circuloDeQuintas,
  tabelaCampo, tabelaSerie, tabelaFiguras, cartoes, portao, N, I, E, A, T, R, INS, D, AC, CAT };
