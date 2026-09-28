// =====================================================================
// Musique · Laboratório — hub, ambientes, lições, ferramentas, prática,
// jogos, busca e os arquivos servidos ao navegador (ADR-0013).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./html');
const { esc, pt, ouvir, pagina, naoAchou, visual, cartoes, portao, N, E, A, T, I, X, CAT } = { ...H, X: require('./nucleo/exercicios') };
const TE = require('./paginas-teoria');
const RF = require('./paginas-referencia');
const L = require('./licoes');
const ACESSO = require('./acesso');

// ------------------------------------------------------------------
// Arquivos do cliente: núcleo (isomórfico) + app + estilo
// ------------------------------------------------------------------
const NUCLEO_ARQS = ['notas', 'intervalos', 'escalas', 'acordes', 'tonalidades', 'ritmo', 'pauta', 'instrumentos', 'acustica', 'desenho', 'exercicios'];
const CLIENTE_ARQS = ['base', 'audio', 'ferramentas', 'criar', 'praticar', 'ensinar'];
let _cache = {};
function arquivo(chave, fn) { if (!_cache[chave] || process.env.NODE_ENV === 'development') _cache[chave] = fn(); return _cache[chave]; }
const ler = (...p) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');
function nucleoJs() { return arquivo('nucleo', () => NUCLEO_ARQS.map((n) => ler('nucleo', n + '.js')).concat([ler('catalogo.js')]).join('\n;\n')); }
function clienteJs() { return arquivo('cliente', () => CLIENTE_ARQS.map((n) => ler('cliente', n + '.js')).join('\n;\n')); }
function cssLab() { return arquivo('css', () => ler('cliente', 'estilo.css')); }

// Sem max-age: script de app com cache longo atravessa o service worker e
// prende o usuário em JS velho (lição da casa). no-cache + ETag.
function enviarArquivo(res, tipo, corpo) { res.set('Content-Type', tipo + '; charset=utf-8').set('Cache-Control', 'no-cache').send(corpo); }

function licoesComAcesso(ctx) {
  return L.LICOES.map((l, i) => ({ ...l, ordem: i + 1, aberta: i < ACESSO.LICOES_ABERTAS || ACESSO.pode('licoes-completas', ctx).ok }));
}

function registrar(app, { opcional, contextoDe }) {
  const ctxDe = (req) => contextoDe(req);

  app.get('/music/laboratorio-nucleo.js', (req, res) => enviarArquivo(res, 'application/javascript', nucleoJs()));
  app.get('/music/laboratorio.js', (req, res) => enviarArquivo(res, 'application/javascript', clienteJs()));
  app.get('/music/laboratorio.css', (req, res) => enviarArquivo(res, 'text/css', cssLab()));

  // ---------------------------------------------------------------- hub
  app.get('/music/laboratorio', (req, res) => {
    const destaque = ['laboratorio', 'piano', 'braco', 'circulo-de-quintas', 'identificar-acorde', 'transpositor', 'bpm', 'batidas'];
    const f = (s) => CAT.FERRAMENTAS.find((x) => x.slug === s);
    const corpo = `
<header class="lab-hero"><p class="lab-cab-tipo">Laboratório Musical</p>
<h1>Veja, ouça e pratique teoria musical</h1>
<p class="lab-lead">Um núcleo só de teoria, testado, por trás de tudo: a escala que aparece no piano é a mesma da pauta, do braço do violão e do exercício. Em português, com as notas em dó-ré-mi ou em cifra.</p>
<form class="lab-busca" action="/music/buscar" role="search"><label for="lab-q">O que você quer ver?</label>
<div class="lab-busca-linha"><input id="lab-q" name="q" type="search" placeholder="Ex.: ré dórico, G7(9), terça maior, campo harmônico de Mi" autocomplete="off" aria-describedby="lab-q-dica">
<button class="btn" type="submit">Buscar</button></div><p id="lab-q-dica" class="lab-dica">Aceita nomes em português ou em cifra, com ou sem acento.</p>
<ul class="lab-sugestoes" id="lab-sugestoes" aria-live="polite"></ul></form></header>
<section class="lab-caminhos" aria-labelledby="caminhos"><h2 id="caminhos" class="sr">Três caminhos</h2>
<a class="lab-caminho" href="/music/explorar"><span class="lab-caminho-ico" aria-hidden="true">⚡</span><strong>Usar agora</strong><span>Afinar, contar BPM, ver um acorde, transpor. Abre direto, sem cadastro.</span></a>
<a class="lab-caminho" href="/music/aprender"><span class="lab-caminho-ico" aria-hidden="true">📘</span><strong>Aprender passo a passo</strong><span>Uma trilha na ordem certa, do som ao campo harmônico, com prática em cada lição.</span></a>
<a class="lab-caminho" href="/music/explorar/laboratorio"><span class="lab-caminho-ico" aria-hidden="true">🧪</span><strong>Experimentar livre</strong><span>Tônica, escala e acorde num lugar só: tudo muda junto.</span></a></section>
<section aria-labelledby="amb"><h2 id="amb">Ambientes</h2>${cartoes(CAT.AMBIENTES.map((a) => ({ ...a, url: a.url })))}</section>
<section aria-labelledby="dest"><h2 id="dest">Mais usados</h2>${cartoes(destaque.map((s) => { const x = f(s); return { nome: x.nome, icone: x.icone, resumo: x.resumo, url: `/music/${x.ambiente}/${x.slug}` }; }))}
<p>E ainda: <a href="/music/ferramentas">afinador, metrônomo e gerador de tons</a>.</p></section>
<section class="lab-nota-convencao"><p>🔓 Ferramentas, referências e demonstrações são abertas. A trilha completa, o progresso guardado, a revisão espaçada e as atividades de professor fazem parte da <a href="/music">assinatura do Musique</a>.</p></section>`;
    pagina(res, { titulo: 'Laboratório Musical — teoria musical visual, interativa e em português | Musique', descricao: 'Escalas, acordes, intervalos, tonalidades, pauta, piano, braço do violão e círculo de quintas — para ver, ouvir e praticar. Ferramentas abertas, em português.', caminho: '/music/laboratorio', corpo, ferramenta: 'hub' });
  });

  // --------------------------------------------------------- ambientes
  app.get('/music/explorar', (req, res) => indiceFerramentas(res, 'explorar', 'Explorar', 'Visualizações que conversam entre si: mude a tônica e tudo acompanha.'));
  app.get('/music/criar', (req, res) => indiceFerramentas(res, 'criar', 'Criar', 'Instrumentos e ferramentas de estúdio de bolso, tocados no navegador. Sem gravação, sem envio: o som fica no seu aparelho.'));
  function indiceFerramentas(res, amb, nome, lead) {
    const lista = CAT.FERRAMENTAS.filter((x) => x.ambiente === amb);
    pagina(res, { titulo: `${nome} — Laboratório Musical | Musique`, descricao: lead, caminho: '/music/' + amb,
      corpo: `<header class="lab-cab"><h1>${esc(nome)}</h1><p class="lab-lead">${esc(lead)}</p></header>${cartoes(lista.map((x) => ({ nome: x.nome, icone: x.icone, resumo: x.resumo, url: `/music/${amb}/${x.slug}` })))}`,
      trilha: [[nome]] });
  }

  app.get('/music/:amb(explorar|criar)/:slug', opcional, (req, res) => {
    const f = CAT.FERRAMENTAS.find((x) => x.slug === req.params.slug && x.ambiente === req.params.amb);
    if (!f) return naoAchou(res, 'esta ferramenta');
    const ctx = ctxDe(req);
    const estado = { ...estadoInicial(req.query), exportar: ACESSO.pode('exportar', ctx).ok };
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">${esc(req.params.amb === 'criar' ? 'Criar' : 'Explorar')}</p><h1><span aria-hidden="true">${esc(f.icone)}</span> ${esc(f.nome)}</h1><p class="lab-lead">${esc(f.resumo)}</p></header>
<div id="lab-ferramenta" class="lab-ferramenta" aria-live="polite">${ssrFerramenta(f.slug, estado)}</div>
<noscript><p class="lab-nota-convencao">Esta ferramenta precisa de JavaScript para tocar e mudar. As páginas de <a href="/music/escalas">escalas</a>, <a href="/music/acordes">acordes</a> e <a href="/music/referencia">referências</a> funcionam sem ele.</p></noscript>
${relacionados(f.slug)}`;
    pagina(res, { titulo: `${f.nome} — Laboratório Musical | Musique`, descricao: f.resumo, caminho: `/music/${f.ambiente}/${f.slug}`, corpo, ferramenta: f.slug, estado,
      trilha: [[req.params.amb === 'criar' ? 'Criar' : 'Explorar', '/music/' + req.params.amb], [f.nome]] });
  });

  // ------------------------------------------------------------ aprender
  app.get('/music/aprender', opcional, (req, res) => {
    const ls = licoesComAcesso(ctxDe(req));
    const corpo = `<header class="lab-cab"><h1>Aprender passo a passo</h1><p class="lab-lead">Uma trilha na ordem dos pré-requisitos. Cada lição explica, mostra, toca e termina num exercício. As ${ACESSO.LICOES_ABERTAS} primeiras são abertas; a trilha completa faz parte da assinatura.</p></header>
<ol class="lab-trilha">${ls.map((l) => `<li class="${l.aberta ? '' : 'fechada'}"><a href="/music/aprender/${esc(l.slug)}"><span class="lab-trilha-n">${l.ordem}</span>
<span class="lab-trilha-t">${esc(l.titulo)} ${l.aberta ? '' : '<span class="lab-selo">assinatura</span>'}</span><span class="lab-trilha-r">${esc(l.resumo)} <em>${esc(l.nivel)}</em></span></a></li>`).join('')}</ol>
<p class="lab-nota-convencao">Quer ir direto a um assunto? As <a href="/music/referencia">referências</a> são abertas e cobrem cada tema.</p>`;
    pagina(res, { titulo: 'Aprender teoria musical passo a passo — Musique', descricao: 'Trilha de lições de teoria musical em português: som, notas, pauta, ritmo, intervalos, escalas, acordes, campo harmônico, modos e acústica.', caminho: '/music/aprender', corpo, trilha: [['Aprender']] });
  });

  app.get('/music/aprender/:slug', opcional, (req, res) => {
    const ls = licoesComAcesso(ctxDe(req));
    const i = ls.findIndex((x) => x.slug === req.params.slug);
    if (i < 0) return naoAchou(res, 'esta lição');
    const l = ls[i];
    const ant = ls[i - 1]; const prox = ls[i + 1];
    const pre = l.prereq.map((s) => L.POR_SLUG[s]).filter(Boolean);
    let conteudo;
    if (l.aberta) {
      conteudo = l.blocos.map(bloco).join('\n');
    } else {
      conteudo = bloco(l.blocos[0]) + portao(ACESSO.pode('licoes-completas', ctxDe(req)));
    }
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Lição ${l.ordem} de ${ls.length} · ${esc(l.nivel)}</p><h1>${esc(l.titulo)}</h1><p class="lab-lead">${esc(l.resumo)}</p>
${pre.length ? `<p class="lab-prereq">Antes, ajuda ter visto: ${pre.map((p) => `<a href="/music/aprender/${esc(p.slug)}">${esc(p.titulo)}</a>`).join(', ')}.</p>` : ''}</header>
<article class="lab-licao">${conteudo}</article>
<footer class="lab-licao-rodape"><p class="lab-autoria">Autoria: ${esc(L.AUTORIA.autor)} · Revisão técnica: ${esc(L.AUTORIA.revisao_tecnica)} · Revisão pedagógica: ${esc(L.AUTORIA.revisao_pedagogica)} · ${esc(L.AUTORIA.revisado_em)}</p>
${l.refs && l.refs.length ? `<details class="lab-det"><summary>Para ler mais</summary><ul>${l.refs.map((r) => `<li>${esc(L.REFS[r])}</li>`).join('')}</ul></details>` : ''}
<nav class="lab-licao-nav" aria-label="Lições">${ant ? `<a href="/music/aprender/${esc(ant.slug)}">← ${esc(ant.titulo)}</a>` : '<span></span>'}${prox ? `<a href="/music/aprender/${esc(prox.slug)}">${esc(prox.titulo)} →</a>` : ''}</nav></footer>`;
    pagina(res, { titulo: `${l.titulo} — lição de teoria musical | Musique`, descricao: l.resumo, caminho: '/music/aprender/' + l.slug, corpo,
      trilha: [['Aprender', '/music/aprender'], [l.titulo]],
      jsonld: { '@context': 'https://schema.org', '@type': 'LearningResource', name: l.titulo, description: l.resumo, inLanguage: 'pt-BR', learningResourceType: 'lesson', educationalLevel: l.nivel, isAccessibleForFree: l.aberta, author: { '@type': 'Organization', name: 'Musique · Villela Music' } } });
  });

  function bloco(b) {
    if (!b) return '';
    if (b.t === 'p') return `<p>${b.html}</p>`;
    if (b.t === 'lista') return `<ul>${b.itens.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    if (b.t === 'aprofundar') return `<details class="lab-det lab-aprofundar"><summary>Aprofundar</summary><p>${b.html}</p></details>`;
    if (b.t === 'visual') return visual(b.v);
    if (b.t === 'ouvir') {
      const seq = Array.isArray(b.midis[0]);
      return `<p class="lab-ouvir-bloco">${seq ? `<button type="button" class="lab-ouvir" data-sequencia="${esc(JSON.stringify(b.midis))}"><span aria-hidden="true">▶</span> ${esc(b.rotulo)}</button>` : ouvir(b.midis, { rotulo: b.rotulo, modo: b.modo })}</p>`;
    }
    if (b.t === 'ferramenta') { const f = CAT.FERRAMENTAS.find((x) => x.slug === b.slug); return f ? `<p class="lab-ferr-link"><a href="/music/${f.ambiente}/${f.slug}"><span aria-hidden="true">${esc(f.icone)}</span> Experimente: ${esc(f.nome)}</a> — ${esc(f.resumo)}</p>` : ''; }
    if (b.t === 'praticar') { const x = X.TIPOS[b.tipo]; return x ? `<div class="lab-mini-pratica" data-tipo="${esc(b.tipo)}" data-nivel="${esc(b.nivel || 1)}"><p><strong>Pratique:</strong> ${esc(x.nome)} (${esc(x.niveis[(b.nivel || 1) - 1])}) — <a href="/music/praticar/${esc(b.tipo)}?nivel=${esc(b.nivel || 1)}">abrir o exercício</a></p></div>` : ''; }
    return '';
  }

  // ------------------------------------------------------------ praticar
  app.get('/music/praticar', (req, res) => {
    const porHab = {};
    X.LISTA.forEach((x) => { (porHab[x.habilidade] = porHab[x.habilidade] || []).push(x); });
    const NOMES = { leitura: 'Leitura', intervalos: 'Intervalos', percepcao: 'Percepção (ouvido)', acordes: 'Acordes', escalas: 'Escalas', tonalidades: 'Tonalidades', teclado: 'Teclado', harmonia: 'Harmonia', ritmo: 'Ritmo', instrumentos: 'Instrumentos' };
    const corpo = `<header class="lab-cab"><h1>Praticar</h1><p class="lab-lead">Exercícios gerados na hora, com explicação de cada erro. Sem conta, você faz sessões de demonstração de ${ACESSO.DEMO_QUESTOES} questões; assinantes guardam o progresso, sobem de nível sozinhos e recebem revisão espaçada.</p></header>
${Object.keys(porHab).map((h) => `<section><h2>${esc(NOMES[h] || h)}</h2>${cartoes(porHab[h].map((x) => ({ nome: x.nome, icone: x.auditivo ? '👂' : '✏️', resumo: x.niveis.join(' · '), url: '/music/praticar/' + x.id })))}</section>`).join('')}
<p><a href="/music/jogar">Prefere contra o relógio? Veja os jogos →</a></p>`;
    pagina(res, { titulo: 'Exercícios de teoria musical e percepção — Musique', descricao: 'Leitura de notas, intervalos, acordes, escalas, armaduras, campo harmônico, ritmo e percepção auditiva, com explicação de cada erro.', caminho: '/music/praticar', corpo, trilha: [['Praticar']] });
  });

  app.get('/music/praticar/:tipo', opcional, (req, res) => {
    const x = X.TIPOS[req.params.tipo];
    if (!x) return naoAchou(res, 'este exercício');
    const ctx = ctxDe(req);
    const completo = ACESSO.pode('pratica-completa', ctx).ok;
    const nivel = Math.max(1, Math.min(x.niveis.length, Number(req.query.nivel) || 1));
    const estado = { tipo: req.params.tipo, nivel, niveis: x.niveis, completo, demo: completo ? 0 : ACESSO.DEMO_QUESTOES, auditivo: !!x.auditivo, logado: ctx.logado };
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Praticar · ${esc(x.habilidade)}</p><h1>${esc(x.nome)}</h1>
${x.auditivo ? '<p class="lab-nota-convencao">👂 Esta habilidade é auditiva: a questão é só o som. Depois de responder, você pode ver as notas no teclado. Use fone ou caixa em volume confortável.</p>' : ''}
${!completo ? `<p class="lab-nota-convencao">Modo demonstração: ${ACESSO.DEMO_QUESTOES} questões, sem histórico. ${ctx.logado ? '<a href="/music/app#conta">Assine</a>' : '<a href="/music/entrar">Entre ou comece o teste grátis</a>'} para guardar o progresso e ter revisão espaçada.</p>` : ''}</header>
<div id="lab-ferramenta" class="lab-pratica" aria-live="polite"><p>Carregando o exercício…</p></div>
<noscript><p>Os exercícios precisam de JavaScript.</p></noscript>`;
    pagina(res, { titulo: `${x.nome} — exercício | Musique`, descricao: `Exercício de ${x.nome.toLowerCase()} com níveis: ${x.niveis.join('; ')}.`, caminho: '/music/praticar/' + req.params.tipo, corpo, ferramenta: 'praticar', estado,
      trilha: [['Praticar', '/music/praticar'], [x.nome]] });
  });

  // -------------------------------------------------------------- jogar
  app.get('/music/jogar', (req, res) => {
    pagina(res, { titulo: 'Jogos de teoria musical e ouvido — Musique', descricao: 'Desafios curtos de leitura, teclado, braço, intervalos, acordes, ritmo e pulso.', caminho: '/music/jogar',
      corpo: `<header class="lab-cab"><h1>Jogar</h1><p class="lab-lead">Desafios curtos contra o relógio. Sem ranking público: você compete com a sua melhor marca.</p></header>${cartoes(CAT.JOGOS.map((j) => ({ nome: j.nome, icone: j.icone, resumo: j.resumo, url: '/music/jogar/' + j.slug })))}`,
      trilha: [['Jogar']] });
  });
  app.get('/music/jogar/:slug', opcional, (req, res) => {
    const j = CAT.JOGOS.find((x) => x.slug === req.params.slug);
    if (!j) return naoAchou(res, 'este jogo');
    const ctx = ctxDe(req);
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);   // dia de Brasília
    const estado = { jogo: j.slug, tipos: j.tipos, especial: j.especial || '', diario: !!j.diario, dia: hoje, historico: ACESSO.pode('jogos-historico', ctx).ok };
    pagina(res, { titulo: `${j.nome} — jogo | Musique`, descricao: j.resumo, caminho: '/music/jogar/' + j.slug, ferramenta: 'jogar', estado,
      corpo: `<header class="lab-cab"><p class="lab-cab-tipo">Jogar</p><h1><span aria-hidden="true">${esc(j.icone)}</span> ${esc(j.nome)}</h1><p class="lab-lead">${esc(j.resumo)}</p></header>
<div id="lab-ferramenta" class="lab-jogo" aria-live="polite"><p>Carregando…</p></div>`,
      trilha: [['Jogar', '/music/jogar'], [j.nome]] });
  });

  // ---------------------------------------------------------- consultar
  app.get('/music/referencia', (req, res) => {
    const corpo = `<header class="lab-cab"><h1>Consultar</h1><p class="lab-lead">Referência rápida e o atlas de escalas, acordes, tonalidades, intervalos e notas — tudo calculado pelo mesmo núcleo.</p></header>
<section><h2>Atlas</h2>${cartoes([
    { nome: 'Escalas e modos', icone: '🪜', resumo: `${E.CATALOGO.length} escalas em todas as tônicas.`, url: '/music/escalas' },
    { nome: 'Acordes', icone: '🎹', resumo: `${A.CATALOGO.length} tipos de acorde em todas as fundamentais.`, url: '/music/acordes' },
    { nome: 'Tonalidades', icone: '🗝️', resumo: 'As 30 tonalidades usuais com campo harmônico.', url: '/music/referencia/tonalidades' },
    { nome: 'Intervalos', icone: '↕️', resumo: 'Do uníssono à décima terceira.', url: '/music/intervalos' },
    { nome: 'Notas', icone: '♪', resumo: 'Cada nota, seus enarmônicos e frequências.', url: '/music/notas' }])}</section>
<section><h2>Referências</h2>${cartoes(CAT.REFERENCIAS.map((r) => ({ nome: r.nome, icone: r.icone, resumo: r.resumo, url: '/music/referencia/' + r.slug })))}</section>`;
    pagina(res, { titulo: 'Referência de teoria musical — Musique', descricao: 'Glossário, fórmulas de escalas e acordes, armaduras, intervalos, frequências, afinações, extensões e mais.', caminho: '/music/referencia', corpo, trilha: [['Consultar']] });
  });
  app.get('/music/referencia/:slug', (req, res) => RF.paginaReferencia(req, res));

  app.get('/music/escalas', (req, res) => {
    const niveis = ['Iniciante', 'Intermediário', 'Avançado', 'Especialista'];
    const corpo = `<header class="lab-cab"><h1>Atlas de escalas</h1><p class="lab-lead">Cada escala em qualquer tônica, com a grafia certa, no piano, na pauta e no braço.</p></header>
${niveis.map((n, i) => { const lista = E.CATALOGO.filter((e) => e.nivel === i + 1); return `<section><h2>${n}</h2><div class="lab-tabela-rolagem"><table class="lab-tabela lab-atlas"><thead><tr><th scope="col">Escala</th>${TE.DOZE.map((pc) => `<th scope="col">${esc(pt(N.deClasse(pc)))}</th>`).join('')}</tr></thead><tbody>
${lista.map((e) => `<tr><th scope="row">${esc(e.nome)}</th>${TE.DOZE.map((pc) => { const t = TE.tonicaCanonica(N.deClasse(pc), e.id); return `<td><a href="${CAT.urlEscala(t, e.id)}" aria-label="${esc(pt(t) + ' ' + e.nome)}">${esc(pt(t))}</a></td>`; }).join('')}</tr>`).join('')}</tbody></table></div></section>`; }).join('')}`;
    pagina(res, { titulo: 'Atlas de escalas e modos — Musique', descricao: 'Maior, menores, modos gregos, pentatônicas, blues, bebop, simétricas e escalas de outras tradições, em todas as tônicas.', caminho: '/music/escalas', corpo, trilha: [['Consultar', '/music/referencia'], ['Escalas']] });
  });
  app.get('/music/acordes', (req, res) => {
    const corpo = `<header class="lab-cab"><h1>Atlas de acordes</h1><p class="lab-lead">Tríades, tétrades e extensões em todas as fundamentais — com fórmula, inversões e digitação calculada.</p></header>
<div class="lab-tabela-rolagem"><table class="lab-tabela lab-atlas"><thead><tr><th scope="col">Tipo</th>${TE.DOZE.map((pc) => `<th scope="col">${esc(pt(N.deClasse(pc)))}</th>`).join('')}</tr></thead><tbody>
${A.CATALOGO.map((c) => `<tr><th scope="row">${esc(c.nome)}</th>${TE.DOZE.map((pc) => { const f = TE.fundamentalCanonica(N.deClasse(pc), c.id); return `<td><a href="${CAT.urlAcorde(f, c.id)}">${esc(A.simbolo(f, c.id))}</a></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
    pagina(res, { titulo: 'Atlas de acordes — Musique', descricao: 'Todos os acordes comuns em todas as fundamentais, com notas, fórmula, inversões e desenho no violão, cavaquinho e ukulele.', caminho: '/music/acordes', corpo, trilha: [['Consultar', '/music/referencia'], ['Acordes']] });
  });
  app.get('/music/intervalos', (req, res) => {
    pagina(res, { titulo: 'Intervalos musicais — Musique', descricao: 'Todos os intervalos usuais com semitons, exemplos, inversões e exercícios.', caminho: '/music/intervalos',
      corpo: `<header class="lab-cab"><h1>Intervalos</h1><p class="lab-lead">Número (letras) e qualidade (semitons). Clique para ver, ouvir e praticar.</p></header><ul class="lab-chips">${I.USUAIS.map((iv) => `<li><a href="/music/intervalos/${esc(iv.slug)}">${esc(iv.nome)} <small>${esc(iv.curto)}</small></a></li>`).join('')}</ul>`,
      trilha: [['Consultar', '/music/referencia'], ['Intervalos']] });
  });
  app.get('/music/notas', (req, res) => {
    const todas = [];
    for (let li = 0; li < 7; li++) [-1, 0, 1].forEach((alt) => todas.push({ li, alt, oitava: null }));
    pagina(res, { titulo: 'Notas musicais — Musique', descricao: 'As notas, seus nomes em português e cifra, enarmônicos, lugar na pauta e no teclado, e frequências.', caminho: '/music/notas',
      corpo: `<header class="lab-cab"><h1>Notas</h1></header><ul class="lab-chips">${todas.map((n) => `<li><a href="${CAT.urlNota(n)}">${esc(N.nomeDuplo(n))}</a></li>`).join('')}</ul>`,
      trilha: [['Consultar', '/music/referencia'], ['Notas']] });
  });
  app.get('/music/escalas/:tonica/:tipo', TE.paginaEscala);
  app.get('/music/acordes/:fundamental/:tipo', TE.paginaAcorde);
  app.get('/music/tonalidades/:slug', TE.paginaTonalidade);
  app.get('/music/intervalos/:slug', TE.paginaIntervalo);
  app.get('/music/notas/:slug', TE.paginaNota);

  // -------------------------------------------------------------- busca
  app.get('/music/buscar', (req, res) => {
    const q = String(req.query.q || '').slice(0, 80);
    const r = q ? CAT.buscar(q, { licoes: L.LICOES }) : [];
    const grupos = {};
    r.forEach((x) => { (grupos[x.grupo] = grupos[x.grupo] || []).push(x); });
    const corpo = `<header class="lab-cab"><h1>Buscar</h1>
<form class="lab-busca" action="/music/buscar" role="search"><label for="lab-q2" class="sr">Buscar</label><div class="lab-busca-linha"><input id="lab-q2" name="q" type="search" value="${esc(q)}" placeholder="dó#, 3M, G7(9), ré dórico…"><button class="btn" type="submit">Buscar</button></div></form></header>
${q && !r.length ? `<p>Nada encontrado para “${esc(q)}”. Tente o nome de uma nota, escala, acorde ou intervalo — por exemplo <a href="/music/buscar?q=sol%20mixol%C3%ADdio">sol mixolídio</a> ou <a href="/music/buscar?q=Bbm7(b5)">Bbm7(b5)</a>.</p>` : ''}
${Object.keys(grupos).map((g) => `<section><h2>${esc(g)}</h2><ul class="lab-resultados">${grupos[g].map((x) => `<li><a href="${esc(x.url)}">${esc(x.titulo)}</a><br><small>${esc(x.resumo)}</small></li>`).join('')}</ul></section>`).join('')}`;
    pagina(res, { titulo: q ? `“${q}” — busca no Laboratório | Musique` : 'Buscar — Laboratório Musical | Musique', caminho: '/music/buscar', corpo, indexar: false, trilha: [['Buscar']] });
  });

  // ------------------------------------------------------------ ensinar
  app.get('/music/ensinar', opcional, (req, res) => {
    const ctx = ctxDe(req);
    const r = ACESSO.pode('ensinar', ctx);
    const corpo = `<header class="lab-cab"><h1>Ensinar</h1><p class="lab-lead">Monte atividades a partir dos exercícios do Laboratório, atribua a alunos ou turmas e acompanhe acertos por habilidade. A nota, quando houver, é sempre sua: o sistema mostra evidência, não dá nota sozinho.</p></header>
${r.ok ? '<div id="lab-ferramenta" class="lab-ensinar"><p>Carregando…</p></div>' : portao(r)}
<section class="lab-bloco"><h2>Como funciona</h2><ol><li>Escolha os exercícios, o nível, o número de questões e se todos recebem as mesmas questões.</li>
<li>Pré-visualize exatamente o que o aluno verá.</li><li>Atribua por e-mail (ou à sua turma): a atividade aparece como tarefa no Musique do aluno.</li>
<li>Acompanhe tentativas, acertos por habilidade e erros recorrentes. Dê a nota e o comentário pela tarefa, como já faz hoje.</li></ol></section>`;
    pagina(res, { titulo: 'Ensinar com o Laboratório Musical — Musique', descricao: 'Para professores: atividades de teoria e percepção montadas em minutos, atribuídas à turma e acompanhadas por habilidade.', caminho: '/music/ensinar', corpo, ferramenta: r.ok ? 'ensinar' : '', trilha: [['Ensinar']] });
  });
}

// ------------------------------------------------------------------
// Estado inicial por URL (deep link) — só teoria, nunca dado pessoal.
// ------------------------------------------------------------------
function estadoInicial(q) {
  const t = N.deSlug(q.t) || N.ler(q.t);
  const e = E.porId(q.e);
  const a = A.porId(q.a);
  return {
    tonica: t && Math.abs(t.alt) <= 1 ? N.slug(t) : 'do',
    escala: e ? e.id : (a ? '' : 'maior'),
    acorde: a ? a.id : '',
    modo: q.m === 'menor' ? 'menor' : 'maior',
    instrumento: ['violao', 'guitarra', 'baixo', 'ukulele', 'cavaquinho', 'violao-7'].includes(q.i) ? q.i : 'violao',
    afinacao: typeof q.af === 'string' && /^[a-z0-9-]{1,20}$/.test(q.af) ? q.af : 'padrao',
    canhoto: q.canhoto === '1',
    notacao: q.n === 'cifra' ? 'cifra' : 'pt',
    clave: ['sol', 'fa', 'do3', 'do4'].includes(q.c) ? q.c : 'sol',
    bpm: Math.max(30, Math.min(300, Number(q.bpm) || 100)),
  };
}

/** Primeira pintura no servidor: a ferramenta já aparece antes do JS. */
function ssrFerramenta(slug, st) {
  const t = N.deSlug(st.tonica) || N.ler('C');
  const t4 = H.naOitavaBoa(t);
  const escNotas = st.escala ? E.notas(t4, st.escala) : null;
  const acNotas = st.acorde ? A.notas(t4, st.acorde) : null;
  const ns = acNotas || escNotas || [t4];
  if (slug === 'piano' || slug === 'piano-virtual') return H.pianoDe(ns, { raiz: t4, de: 48, ate: 84 });
  if (slug === 'pauta') return H.pautaDe(ns, { clave: st.clave });
  if (slug === 'braco') return H.bracoDe(ns, { raiz: t, instrumento: st.instrumento, afinacao: st.afinacao });
  if (slug === 'circulo-de-quintas') return H.circuloDeQuintas({ ativo: 0 });
  if (slug === 'laboratorio') return `<div class="lab-grade-2">${H.pautaDe(ns)}${H.pianoDe(ns, { raiz: t4 })}</div>${H.bracoDe(ns, { raiz: t })}`;
  return '';
}

function relacionados(slug) {
  const mapa = {
    piano: ['/music/aprender/tons-e-semitons', '/music/praticar/nota-no-teclado', '/music/jogar/teclado-relampago'],
    pauta: ['/music/aprender/pauta-e-claves', '/music/praticar/nota-na-pauta', '/music/referencia/pauta-e-claves'],
    braco: ['/music/praticar/nota-no-braco', '/music/jogar/mapa-do-braco', '/music/referencia/afinacoes'],
    'circulo-de-quintas': ['/music/aprender/armaduras', '/music/praticar/armadura-identificar', '/music/referencia/armaduras'],
    'identificar-acorde': ['/music/aprender/triades', '/music/praticar/acorde-identificar', '/music/referencia/formulas-de-acordes'],
    'identificar-escala': ['/music/aprender/escala-maior', '/music/praticar/escala-identificar', '/music/referencia/formulas-de-escalas'],
    progressoes: ['/music/aprender/campo-harmonico', '/music/praticar/campo-grau', '/music/referencia/cadencias-e-progressoes'],
    transpositor: ['/music/aprender/intervalos', '/music/referencia/tonalidades'],
    bpm: ['/music/aprender/pulso-e-compasso', '/music/jogar/mantenha-o-pulso', '/music/ferramentas'],
    batidas: ['/music/referencia/ritmo-e-groove', '/music/criar/polirritmos'],
    'serie-harmonica': ['/music/aprender/acustica', '/music/referencia/temperamento'],
  };
  const links = mapa[slug];
  if (!links) return '';
  const rot = (u) => {
    const l = u.match(/^\/music\/aprender\/(.+)$/); if (l && L.POR_SLUG[l[1]]) return 'Lição: ' + L.POR_SLUG[l[1]].titulo;
    const p = u.match(/^\/music\/praticar\/(.+)$/); if (p && X.TIPOS[p[1]]) return 'Praticar: ' + X.TIPOS[p[1]].nome;
    const j = u.match(/^\/music\/jogar\/(.+)$/); if (j) { const x = CAT.JOGOS.find((y) => y.slug === j[1]); if (x) return 'Jogo: ' + x.nome; }
    const r = u.match(/^\/music\/referencia\/(.+)$/); if (r) { const x = CAT.REFERENCIAS.find((y) => y.slug === r[1]); if (x) return 'Referência: ' + x.nome; }
    const c = u.match(/^\/music\/criar\/(.+)$/); if (c) { const x = CAT.FERRAMENTAS.find((y) => y.slug === c[1]); if (x) return 'Criar: ' + x.nome; }
    return u === '/music/ferramentas' ? 'Afinador e metrônomo' : u;
  };
  return `<aside class="lab-relacionados" aria-labelledby="rel-t"><h2 id="rel-t">Para aprender e praticar</h2><ul class="lab-chips">${links.map((u) => `<li><a href="${esc(u)}">${esc(rot(u))}</a></li>`).join('')}</ul></aside>`;
}

/** URLs públicas e CANÔNICAS para o sitemap (nunca as enarmônicas). */
function urlsDoSitemap() {
  const u = ['/laboratorio', '/aprender', '/explorar', '/criar', '/praticar', '/jogar', '/referencia', '/ensinar', '/escalas', '/acordes', '/intervalos', '/notas'].map((x) => '/music' + x);
  CAT.FERRAMENTAS.forEach((f) => u.push(`/music/${f.ambiente}/${f.slug}`));
  CAT.REFERENCIAS.forEach((r) => u.push('/music/referencia/' + r.slug));
  CAT.JOGOS.forEach((j) => u.push('/music/jogar/' + j.slug));
  X.LISTA.forEach((x) => u.push('/music/praticar/' + x.id));
  L.LICOES.forEach((l) => u.push('/music/aprender/' + l.slug));
  I.USUAIS.forEach((iv) => u.push('/music/intervalos/' + iv.slug));
  const vistos = new Set(u);
  const add = (x) => { if (!vistos.has(x)) { vistos.add(x); u.push(x); } };
  E.CATALOGO.forEach((e) => TE.DOZE.forEach((pc) => add(CAT.urlEscala(TE.tonicaCanonica(N.deClasse(pc), e.id), e.id))));
  A.CATALOGO.forEach((c) => TE.DOZE.forEach((pc) => add(CAT.urlAcorde(TE.fundamentalCanonica(N.deClasse(pc), c.id), c.id))));
  T.usuais().forEach(({ tonica, modo }) => add(CAT.urlTom(tonica, modo)));
  for (let li = 0; li < 7; li++) [-1, 0, 1].forEach((alt) => add(CAT.urlNota({ li, alt, oitava: null })));
  return u.map((url) => ({ url }));
}

module.exports = { registrar, urlsDoSitemap, estadoInicial, NUCLEO_ARQS, CLIENTE_ARQS, nucleoJs, clienteJs };
