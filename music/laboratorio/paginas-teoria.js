// =====================================================================
// Musique · Laboratório — páginas PROGRAMÁTICAS e de REFERÊNCIA.
//
// Nenhuma página de escala ou acorde foi escrita à mão: todas saem do
// catálogo e do núcleo. Enarmônicos (dó♯ maior e ré♭ maior) existem, mas
// o `canonical` aponta para a grafia com MENOS acidentes, e só as
// canônicas vão para o sitemap — senão o buscador veria centenas de
// páginas quase iguais (ADR-0013).
// =====================================================================
'use strict';
const H = require('./html');
const { esc, pt, ptO, cif, ouvir, pagina, naoAchou, pianoDe, bracoDe, pautaDe, naOitavaBoa, tabelaCampo, circuloDeQuintas, N, I, E, A, T, R, INS, D, AC, CAT } = H;

// Usos e caráter: texto editorial curto, sem "maior = feliz".
const USOS = {
  'maior': 'A base da música tonal ocidental e da maior parte do pop, do sertanejo e da MPB. Referência para medir todas as outras escalas.',
  'menor-natural': 'Mesmas notas da relativa maior. Comum no rock, no pop e em melodias folclóricas; sem sensível, soa menos "conclusivo" que a harmônica.',
  'menor-harmonica': 'Nasce da necessidade de uma sensível no tom menor: é dela que sai o acorde de dominante maior. O salto de tom e meio marca o som.',
  'menor-melodica': 'Suaviza o salto da harmônica. No jazz é uma "escala-mãe" de onde saem o lídio dominante e a alterada.',
  'dorico': 'Menor com sexta maior: muito usado em jazz modal, funk, rock e música celta.',
  'frigio': 'Menor com segunda menor, de som escuro e tenso logo no início. Presente no flamenco (em forma dominante) e no metal.',
  'lidio': 'Maior com quarta aumentada: som aberto e "suspenso", comum em trilhas de cinema e no jazz sobre acordes 7M(#11).',
  'mixolidio': 'Maior com sétima menor: a escala do acorde dominante, e muito comum no rock, no blues, no baião e no forró.',
  'locrio': 'Quinta diminuta sobre a tônica: raramente é centro tonal; usado sobre o acorde meio-diminuto.',
  'pentatonica-maior': 'Cinco notas sem semitons: difícil de "errar", base de melodias folclóricas no mundo inteiro e do country.',
  'pentatonica-menor': 'A escala de improviso mais usada no rock e no blues; cabe em quase qualquer progressão menor.',
  'blues-menor': 'A pentatônica menor com a "blue note" (quinta diminuta) de passagem.',
  'blues-maior': 'A pentatônica maior com a terça menor de passagem: o som do blues e do country em tom maior.',
  'lidio-dominante': 'Mixolídio com quarta aumentada; aparece na série harmônica ("escala acústica") e sobre acordes 7(#11).',
  'alterada': 'Todas as tensões alteradas do acorde dominante (b9, #9, #11, b13): usada no jazz para criar tensão antes da resolução.',
  'frigio-dominante': 'Frígio com terça maior: o som do flamenco e de muita música do Oriente Médio e do Leste Europeu.',
  'tons-inteiros': 'Só tons inteiros, sem centro tonal forte: som "flutuante", usado por Debussy e sobre acordes 7(#5).',
  'diminuta-tom-semitom': 'Alterna tom e semitom; simétrica (só existem três transposições diferentes). Usada sobre o acorde diminuto.',
  'diminuta-semitom-tom': 'Alterna semitom e tom; usada no jazz sobre o acorde dominante com 9ª menor e 13ª.',
  'cromatica': 'Todas as doze notas: não é uma escala de "tonalidade", e sim o conjunto completo de alturas.',
};

// ------------------------------------------------------------------
// Grafia canônica
// ------------------------------------------------------------------
function candidatos(pc) { return N.enarmonicos(N.deClasse(pc)).filter((x) => Math.abs(x.alt) <= 1); }
function tonicaCanonica(t, id) {
  const cs = candidatos(N.pc(t)).map((c) => ({ c, a: E.acidentes(c, id) })).filter((x) => x.a < Infinity);
  cs.sort((x, y) => (x.a - y.a) || (Math.abs(x.c.alt) - Math.abs(y.c.alt)) || (x.c.alt - y.c.alt));
  return cs.length ? cs[0].c : t;
}
function acidentesAcorde(f, id) { const ns = A.notas(f, id); return ns ? ns.reduce((a, n) => a + Math.abs(n.alt), 0) : Infinity; }
function fundamentalCanonica(f, id) {
  const cs = candidatos(N.pc(f)).map((c) => ({ c, a: acidentesAcorde(c, id) })).filter((x) => x.a < Infinity);
  cs.sort((x, y) => (x.a - y.a) || (Math.abs(x.c.alt) - Math.abs(y.c.alt)) || (x.c.alt - y.c.alt));
  return cs.length ? cs[0].c : f;
}
const DOZE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// ------------------------------------------------------------------
// Escala
// ------------------------------------------------------------------
function paginaEscala(req, res) {
  const t = N.deSlug(req.params.tonica);
  const e = E.porId(req.params.tipo);
  if (!t || !e || Math.abs(t.alt) > 1) return naoAchou(res, 'esta escala');
  const ns = E.notas(t, e.id);
  if (!ns) return naoAchou(res, 'uma grafia possível para esta escala (exigiria triplo acidente)');
  const can = tonicaCanonica(t, e.id);
  const caminho = CAT.urlEscala(can, e.id);
  const t4 = naOitavaBoa(t);
  const asc = E.notas(t4, e.id);
  const oitava = N.comOitava(t4, t4.oitava + 1);
  const subindo = asc.concat([oitava]);
  const nomeCompleto = `${pt(t)} ${e.nome}`;
  const graus = E.graus(e.formula);
  const ivs = E.intervalos(e.id);
  const hepta = graus.length === 7;
  const campo3 = hepta ? E.empilhar(t, e.id, 3).map((p) => ({ p, q: A.qualidadeDaPilha(p.notas) })) : null;
  const campo4 = hepta ? E.empilhar(t, e.id, 4).map((p) => ({ p, q: A.qualidadeDaPilha(p.notas) })) : null;
  const modos = E.modosRelacionados(t, e.id);
  const desc = `${nomeCompleto}: ${ns.map(pt).join(', ')}. Fórmula ${e.formula}, passos ${E.passos(e.id).join(' ')}. Veja no piano, na pauta e no violão, ouça e pratique.`;
  const corpo = `
<header class="lab-cab"><p class="lab-cab-tipo">Escala${e.familia === 'maior' && e.grau > 1 && e.id !== 'menor-natural' ? ' · modo' : ''}</p>
<h1>${esc(nomeCompleto)} <small>(${esc(cif(t))} ${esc(e.aliases[0] || e.nome)})</small></h1>
<p class="lab-lead">${esc(nomeCompleto)} tem as notas <strong>${esc(ns.map(pt).join(' – '))}</strong>. Fórmula <strong>${esc(e.formula)}</strong>; passos <strong>${esc(E.passos(e.id).join(' '))}</strong> (T = tom, S = semitom).</p>
${e.nota ? `<p class="lab-nota-convencao">ℹ️ ${esc(e.nota)}</p>` : ''}</header>
<section class="lab-bloco" aria-labelledby="ver"><h2 id="ver">Ver e ouvir</h2>
<div class="lab-acoes">${ouvir(subindo.map(N.midi), { rotulo: 'Ouvir subindo' })} ${ouvir(subindo.slice().reverse().map(N.midi), { rotulo: 'Ouvir descendo' })}
  <a class="lab-link-lab" href="/music/explorar/laboratorio?t=${esc(N.slug(t))}&amp;e=${esc(e.id)}">Abrir no Laboratório integrado →</a></div>
<figure class="lab-fig">${pautaDe(subindo, { titulo: `${nomeCompleto} na clave de sol` })}</figure>
<figure class="lab-fig">${pianoDe(asc, { raiz: t4, titulo: `${nomeCompleto} no teclado` })}</figure>
<figure class="lab-fig lab-fig-rola">${bracoDe(ns, { raiz: t, titulo: `${nomeCompleto} no braço do violão` })}
<figcaption>A fundamental (${esc(pt(t))}) aparece em quadrado. Outros instrumentos e afinações no <a href="/music/explorar/braco?t=${esc(N.slug(t))}&amp;e=${esc(e.id)}">explorador de braço</a>.</figcaption></figure>
</section>
<section class="lab-bloco" aria-labelledby="graus"><h2 id="graus">Graus e intervalos</h2>
<div class="lab-tabela-rolagem"><table class="lab-tabela"><thead><tr><th scope="col">Grau</th>${ns.map((_, i) => `<th scope="col">${esc(graus[i].alt ? (graus[i].alt > 0 ? '♯'.repeat(graus[i].alt) : '♭'.repeat(-graus[i].alt)) + graus[i].grau : String(graus[i].grau))}</th>`).join('')}</tr></thead>
<tbody><tr><th scope="row">Nota</th>${ns.map((n) => `<td>${esc(pt(n))} <small>${esc(cif(n))}</small></td>`).join('')}</tr>
<tr><th scope="row">Intervalo</th>${ivs.map((x) => { const iv = I.ler(x); return `<td>${iv && iv.slug ? `<a href="/music/intervalos/${esc(iv.slug)}">${esc(x)}</a>` : esc(x)}</td>`; }).join('')}</tr></tbody></table></div>
</section>
${campo3 ? `<section class="lab-bloco" aria-labelledby="acordes"><h2 id="acordes">Acordes da escala</h2>
<p>Empilhando terças só com as notas de ${esc(nomeCompleto)}:</p>
<div class="lab-tabela-rolagem"><table class="lab-tabela"><thead><tr><th scope="col">Grau</th><th scope="col">Tríade</th><th scope="col">Tétrade</th><th scope="col">Notas (tétrade)</th></tr></thead><tbody>
${campo3.map((x, i) => { const y = campo4[i]; const f = x.p.notas[0]; return `<tr><th scope="row">${esc(x.q ? T.romano(i + 1, x.q) : i + 1)}</th>
<td>${x.q ? `<a href="${CAT.urlAcorde(f, x.q)}">${esc(A.simbolo(f, x.q))}</a>` : '—'}</td><td>${y.q ? `<a href="${CAT.urlAcorde(f, y.q)}">${esc(A.simbolo(f, y.q))}</a>` : '—'}</td>
<td>${esc(y.p.notas.map(pt).join(' – '))}</td></tr>`; }).join('')}</tbody></table></div></section>` : ''}
${modos.length ? `<section class="lab-bloco" aria-labelledby="modos"><h2 id="modos">Mesmas notas, outras tônicas</h2>
<p>${esc(nomeCompleto)} tem as mesmas notas destes modos:</p><ul class="lab-chips">${modos.map((m) => `<li><a href="${CAT.urlEscala(m.tonica, m.id)}"${m.atual ? ' aria-current="page"' : ''}>${esc(pt(m.tonica))} ${esc(m.nome)}</a></li>`).join('')}</ul></section>` : ''}
<section class="lab-bloco" aria-labelledby="uso"><h2 id="uso">Caráter e uso</h2><p>${esc(USOS[e.id] || 'Escala de cor própria, útil para explorar sonoridades fora da tonalidade maior e menor. Ouça, compare com a escala maior de mesma tônica e note quais graus mudam.')}</p>
${e.aliases.length ? `<p class="lab-alias">Também chamada: ${esc(e.aliases.join(', '))}.</p>` : ''}</section>
<section class="lab-bloco" aria-labelledby="outras"><h2 id="outras">${esc(e.nome)} em outras tônicas</h2>
<ul class="lab-chips">${DOZE.map((pc) => { const c = tonicaCanonica(N.deClasse(pc), e.id); return `<li><a href="${CAT.urlEscala(c, e.id)}"${N.mesmaGrafia(c, t) ? ' aria-current="page"' : ''}>${esc(pt(c))}</a></li>`; }).join('')}</ul></section>
<section class="lab-bloco lab-praticar-cta"><h2>Praticar</h2><ul class="lab-chips"><li><a href="/music/praticar/escala-identificar">Identificar escalas</a></li><li><a href="/music/jogar/construtor-de-escalas">Detetive de escalas</a></li><li><a href="/music/criar/sequenciador?t=${esc(N.slug(t))}&amp;e=${esc(e.id)}">Criar uma melodia nesta escala</a></li></ul></section>`;
  pagina(res, { titulo: `Escala de ${nomeCompleto} — notas, fórmula e acordes | Musique`, descricao: desc, caminho, corpo,
    trilha: [['Consultar', '/music/referencia'], ['Escalas', '/music/escalas'], [nomeCompleto]],
    jsonld: { '@context': 'https://schema.org', '@type': 'LearningResource', name: `Escala de ${nomeCompleto}`, inLanguage: 'pt-BR', learningResourceType: 'reference', educationalLevel: ['iniciante', 'intermediário', 'avançado', 'especialista'][e.nivel - 1], about: 'teoria musical' } });
}

// ------------------------------------------------------------------
// Acorde
// ------------------------------------------------------------------
let _formas = null;
function formasCifras() { if (!_formas) _formas = require('../cifras/motor/instrumentos'); return _formas; }

function diagramas(f, id) {
  const simb = A.simbolo(f, id).replace(/°7/, 'dim7').replace(/°/, 'dim');
  const ns = A.notas(f, id);
  const porPc = {}; ns.forEach((n) => { porPc[N.pc(n)] = n; });
  const out = [];
  [['violao', 'violão'], ['cavaquinho', 'cavaquinho'], ['ukulele', 'ukulele']].forEach(([inst, nome]) => {
    let r = null;
    try { r = formasCifras().formas(simb, inst, { quantas: 2 }); } catch (_) { r = null; }
    if (!r || !r.formas || !r.formas.length) return;
    const af = INS.afinacao(inst, 'padrao');
    r.formas.forEach((fm, k) => {
      const presas = fm.casas.filter((c) => c > 0);
      const casas = Math.max(5, presas.length ? Math.max(...presas) + 1 : 5);
      const dest = fm.casas.map((c, i) => (c < 0 ? null : { corda: i, casa: c, rotulo: pt(porPc[N.mod(af.midi[i] + c, 12)] || N.deMidi(af.midi[i] + c)), tipo: N.mod(af.midi[i] + c, 12) === N.pc(f) ? 'raiz' : 'nota' })).filter(Boolean);
      out.push(`<figure class="lab-fig lab-fig-rola lab-diag">${D.braco({ afinacao: af, casas: Math.min(casas, 15), destaques: dest, titulo: `${A.simbolo(f, id)} no ${nome}, forma ${k + 1}` })}
      <figcaption>${esc(nome)}: <code>${esc(fm.desenho)}</code> (${esc(fm.nivel)}; x = corda que não soa) ${ouvir(fm.casas.map((c, i) => (c < 0 ? null : af.midi[i] + c)).filter((x) => x != null), { rotulo: 'Ouvir', modo: 'dedilhado', classe: 'mini' })}</figcaption></figure>`);
    });
  });
  return out.join('');
}

function paginaAcorde(req, res) {
  const f = N.deSlug(req.params.fundamental);
  const c = A.porId(req.params.tipo);
  if (!f || !c || Math.abs(f.alt) > 1) return naoAchou(res, 'este acorde');
  const ns = A.notas(f, c.id);
  if (!ns) return naoAchou(res, 'uma grafia possível para este acorde');
  const can = fundamentalCanonica(f, c.id);
  const f3 = naOitavaBoa(f, 4);
  const n4 = A.notas(f3, c.id);
  const simb = A.simbolo(f, c.id);
  const ivs = A.intervalos(c.id);
  const invs = [];
  for (let k = 0; k < Math.min(ns.length, 4); k++) {
    const inv = A.inversao(f3, c.id, k);
    invs.push({ k, notas: inv, simbolo: A.simbolo(f, c.id, k ? inv[0] : null) });
  }
  // em que tons ele é diatônico (tríades e tétrades dos 30 tons usuais)
  const tons = [];
  T.usuais().forEach(({ tonica, modo }) => {
    [false, true].forEach((tet) => {
      const campo = T.campo(tonica, modo, { tetrades: tet }) || [];
      campo.forEach((g) => { if (g.acorde === c.id && N.mesmaGrafia(g.fundamental, f)) tons.push({ tonica, modo, romano: g.romano }); });
    });
  });
  const desc = `${simb} (${pt(f)} ${c.nome}): notas ${ns.map(pt).join(', ')}; fórmula ${c.formula}. Inversões, desenho no violão, cavaquinho e ukulele, e em que tons aparece.`;
  const corpo = `
<header class="lab-cab"><p class="lab-cab-tipo">Acorde</p><h1>${esc(simb)} <small>${esc(pt(f))} ${esc(c.nome)}</small></h1>
<p class="lab-lead">Notas: <strong>${esc(ns.map(pt).join(' – '))}</strong> (${esc(ns.map(cif).join(' '))}). Fórmula <strong>${esc(c.formula)}</strong>: ${esc(ivs.slice(1).join(', '))} a partir da fundamental.</p>
<p class="lab-alias">Outras formas de escrever: ${esc(c.simbolos.map((s) => cif(f) + s).join(' · '))}</p>
${c.id === '9' || c.id === 'add9' ? '<p class="lab-nota-convencao">ℹ️ No Brasil, "C9" às vezes indica a nona <em>sem</em> sétima. O Musique segue a convenção internacional: C9 = C7(9); a nona sem sétima é C(9) ou Cadd9.</p>' : ''}</header>
<section class="lab-bloco" aria-labelledby="ver"><h2 id="ver">Ver e ouvir</h2>
<div class="lab-acoes">${ouvir(n4.map(N.midi), { rotulo: 'Ouvir junto', modo: 'harmonico' })} ${ouvir(n4.map(N.midi), { rotulo: 'Ouvir arpejado' })}
<a class="lab-link-lab" href="/music/explorar/laboratorio?t=${esc(N.slug(f))}&amp;a=${esc(encodeURIComponent(c.id))}">Abrir no Laboratório integrado →</a></div>
<figure class="lab-fig">${pautaDe(n4, { acorde: true, titulo: `${simb} na pauta` })}</figure>
<figure class="lab-fig">${pianoDe(n4, { raiz: f3, titulo: `${simb} no teclado` })}</figure></section>
<section class="lab-bloco" aria-labelledby="inv"><h2 id="inv">Inversões</h2><div class="lab-grade-inv">
${invs.map((x) => `<figure class="lab-fig">${pautaDe(x.notas, { acorde: true, rotulos: false, titulo: A.NOME_INVERSAO[x.k] })}<figcaption><strong>${esc(x.simbolo)}</strong> — ${esc(A.NOME_INVERSAO[x.k])} ${ouvir(x.notas.map(N.midi), { rotulo: 'Ouvir', modo: 'harmonico', classe: 'mini' })}</figcaption></figure>`).join('')}
</div></section>
<section class="lab-bloco" aria-labelledby="dig"><h2 id="dig">No instrumento</h2>
<p>Digitações <strong>calculadas</strong> pelo mesmo motor das cifras do Musique (não são desenhos copiados). O quadrado marca a fundamental.</p>
<div class="lab-grade-diag">${diagramas(f, c.id) || '<p>Não há digitação confortável calculada para este acorde nesses instrumentos.</p>'}</div></section>
${tons.length ? `<section class="lab-bloco" aria-labelledby="tons"><h2 id="tons">Em que tons ${esc(simb)} aparece</h2><ul class="lab-chips">${tons.map((x) => `<li><a href="${CAT.urlTom(x.tonica, x.modo)}">${esc(x.romano)} de ${esc(T.nome(x.tonica, x.modo))}</a></li>`).join('')}</ul></section>` : ''}
<section class="lab-bloco" aria-labelledby="outros"><h2 id="outros">${esc(c.nome)} em outras fundamentais</h2>
<ul class="lab-chips">${DOZE.map((pc) => { const x = fundamentalCanonica(N.deClasse(pc), c.id); return `<li><a href="${CAT.urlAcorde(x, c.id)}"${N.mesmaGrafia(x, f) ? ' aria-current="page"' : ''}>${esc(A.simbolo(x, c.id))}</a></li>`; }).join('')}</ul>
<p>Outros acordes de ${esc(pt(f))}: ${A.CATALOGO.filter((x) => x.nivel <= 2 && x.id !== c.id).map((x) => `<a href="${CAT.urlAcorde(f, x.id)}">${esc(A.simbolo(f, x.id))}</a>`).join(' · ')}</p></section>
<section class="lab-bloco lab-praticar-cta"><h2>Praticar</h2><ul class="lab-chips"><li><a href="/music/praticar/acorde-identificar">Nomear acordes</a></li><li><a href="/music/praticar/acorde-ouvido">Acordes de ouvido</a></li><li><a href="/music/explorar/identificar-acorde">Identificador de acordes</a></li></ul></section>`;
  pagina(res, { titulo: `Acorde ${simb} — notas, fórmula e digitação | Musique`, descricao: desc, caminho: CAT.urlAcorde(can, c.id), corpo,
    trilha: [['Consultar', '/music/referencia'], ['Acordes', '/music/acordes'], [simb]],
    jsonld: { '@context': 'https://schema.org', '@type': 'LearningResource', name: `Acorde ${simb}`, inLanguage: 'pt-BR', learningResourceType: 'reference', about: 'teoria musical' } });
}

// ------------------------------------------------------------------
// Tonalidade
// ------------------------------------------------------------------
function paginaTonalidade(req, res) {
  const x = T.deSlug(req.params.slug);
  if (!x || Math.abs(x.tonica.alt) > 1) return naoAchou(res, 'esta tonalidade');
  const { tonica, modo } = x;
  const arm = T.armadura(tonica, modo);
  if (!arm) return naoAchou(res, 'esta tonalidade');
  const nome = T.nome(tonica, modo);
  const idEsc = modo === 'menor' ? 'menor-natural' : 'maior';
  const ns = E.notas(tonica, idEsc);
  const rel = T.relativa(tonica, modo);
  const viz = T.vizinhas(tonica, modo);
  const t4 = naOitavaBoa(tonica);
  const subindo = E.notas(t4, idEsc).concat([N.comOitava(t4, t4.oitava + 1)]);
  const q = arm.quantidade;
  const usual = arm.usual;
  // canônica: dentro das usuais, a própria; fora (ex.: G# maior), a enarmônica usual
  let can = { tonica, modo };
  if (!usual) { const alt = candidatos(N.pc(tonica)).map((c) => ({ c, a: T.armadura(c, modo) })).filter((y) => y.a && y.a.usual).sort((a, b) => Math.abs(a.a.quantidade) - Math.abs(b.a.quantidade))[0]; if (alt) can = { tonica: alt.c, modo }; }
  const cadencias = T.CADENCIAS.map((cd) => ({ cd, acs: T.realizar(tonica, modo, cd.graus) }));
  const progs = T.PROGRESSOES.filter((p) => (p.modo || 'maior') === modo).map((p) => ({ p, acs: T.realizar(tonica, modo, p.graus, { dominantes: p.dominantes }) }));
  const desc = `${nome}: armadura com ${q ? Math.abs(q) + (q > 0 ? ' sustenido(s)' : ' bemol(is)') : 'nenhum acidente'}, escala, campo harmônico com funções, cadências, relativa ${T.nome(rel.tonica, rel.modo)} e tons vizinhos.`;
  const prog = (acs) => acs.map((g) => `<a href="${CAT.urlAcorde(g.fundamental, g.acorde)}">${esc(g.simbolo)}</a>`).join(' → ');
  const progMidis = (acs) => JSON.stringify(acs.map((g) => A.notas(naOitavaBoa(g.fundamental, 3), g.acorde).map(N.midi)));
  const corpo = `
<header class="lab-cab"><p class="lab-cab-tipo">Tonalidade</p><h1>${esc(nome)} <small>${esc(cif(tonica))}${modo === 'menor' ? 'm' : ''}</small></h1>
<p class="lab-lead">Armadura: <strong>${q ? `${Math.abs(q)} ${q > 0 ? 'sustenido(s)' : 'bemol(is)'} — ${esc(arm.acidentes.map(pt).join(', '))}` : 'nenhum acidente'}</strong>. Relativa: <a href="${CAT.urlTom(rel.tonica, rel.modo)}">${esc(T.nome(rel.tonica, rel.modo))}</a>.</p>
${!usual ? `<p class="lab-nota-convencao">ℹ️ Tonalidade teórica: a armadura exigiria dobrados. Na prática escreve-se na enarmônica <a href="${CAT.urlTom(can.tonica, can.modo)}">${esc(T.nome(can.tonica, can.modo))}</a>.</p>` : ''}</header>
<section class="lab-bloco" aria-labelledby="ver"><h2 id="ver">Armadura e escala</h2>
<div class="lab-grade-2"><figure class="lab-fig">${D.pauta({ clave: 'sol', armadura: usual ? q : 0, notas: [], titulo: 'Armadura na clave de sol' })}<figcaption>Clave de sol</figcaption></figure>
<figure class="lab-fig">${D.pauta({ clave: 'fa', armadura: usual ? q : 0, notas: [], titulo: 'Armadura na clave de fá' })}<figcaption>Clave de fá</figcaption></figure></div>
<figure class="lab-fig">${pautaDe(subindo)}<figcaption>Escala de ${esc(nome)}${modo === 'menor' ? ' (natural)' : ''}: ${esc(ns.map(pt).join(' – '))} ${ouvir(subindo.map(N.midi), { rotulo: 'Ouvir' })} <a href="${CAT.urlEscala(tonica, idEsc)}">página da escala</a></figcaption></figure>
</section>
<section class="lab-bloco" aria-labelledby="campo"><h2 id="campo">Campo harmônico</h2>
${tabelaCampo(tonica, modo)}${tabelaCampo(tonica, modo, { tetrades: true })}
${modo === 'menor' ? `<details class="lab-det"><summary>Campo da menor harmônica e da melódica</summary>${tabelaCampo(tonica, 'menor', { variante: 'harmonica' })}${tabelaCampo(tonica, 'menor', { variante: 'melodica' })}
<p>No tom menor, a prática mistura os campos: o V maior (e o V7) vem da harmônica, porque a natural não tem sensível.</p></details>` : ''}
<p class="lab-legenda"><span class="lab-func lab-func-T">T</span> tônica · <span class="lab-func lab-func-S">S</span> subdominante · <span class="lab-func lab-func-D">D</span> dominante. Funções são uma leitura simplificada: o contexto pode mudar o papel de um acorde.</p></section>
<section class="lab-bloco" aria-labelledby="cad"><h2 id="cad">Cadências em ${esc(nome)}</h2><ul class="lab-lista-prog">
${cadencias.map(({ cd, acs }) => `<li><strong>${esc(cd.nome)}</strong>: ${prog(acs)} <button type="button" class="lab-ouvir mini" data-sequencia="${esc(progMidis(acs))}"><span aria-hidden="true">▶</span> Ouvir</button><br><small>${esc(cd.texto)}</small></li>`).join('')}</ul></section>
${progs.length ? `<section class="lab-bloco" aria-labelledby="prog"><h2 id="prog">Progressões comuns</h2><ul class="lab-lista-prog">
${progs.map(({ p, acs }) => `<li><strong>${esc(p.nome)}</strong> <small>(${esc(p.genero)})</small>: ${prog(acs)} <button type="button" class="lab-ouvir mini" data-sequencia="${esc(progMidis(acs))}"><span aria-hidden="true">▶</span> Ouvir</button><br><small>${esc(p.texto)}</small></li>`).join('')}</ul>
<p><a href="/music/criar/progressoes?t=${esc(N.slug(tonica))}&amp;m=${esc(modo)}">Montar a sua progressão em ${esc(nome)} →</a></p></section>` : ''}
<section class="lab-bloco" aria-labelledby="viz"><h2 id="viz">Tons vizinhos</h2><ul class="lab-chips">${viz.map((v) => `<li><a href="${CAT.urlTom(v.tonica, v.modo)}">${esc(T.nome(v.tonica, v.modo))}</a> <small>${esc(v.rel)}</small></li>`).join('')}</ul>
<details class="lab-det"><summary>Dominantes secundárias (avançado)</summary><ul class="lab-chips">${T.dominantesSecundarias(tonica, modo).map((d) => `<li><a href="${CAT.urlAcorde(d.fundamental, '7')}">${esc(d.simbolo)}</a> <small>${esc(d.rotulo)}</small></li>`).join('')}</ul>
<p>Cada uma é a dominante (V7) de um grau do campo: prepara aquele acorde como se ele fosse uma tônica momentânea.</p></details></section>
<figure class="lab-fig lab-fig-circ">${circuloDeQuintas({ ativo: T.CIRCULO.findIndex((c) => N.pc(modo === 'menor' ? c.menor : c.maior) === N.pc(tonica)), modo })}</figure>
<section class="lab-bloco lab-praticar-cta"><h2>Praticar</h2><ul class="lab-chips"><li><a href="/music/praticar/campo-grau">Campo harmônico</a></li><li><a href="/music/praticar/armadura-identificar">Armaduras</a></li><li><a href="/music/explorar/laboratorio?t=${esc(N.slug(tonica))}&amp;e=${esc(idEsc)}">Laboratório</a></li></ul></section>`;
  pagina(res, { titulo: `${nome} — armadura, campo harmônico e acordes | Musique`, descricao: desc, caminho: CAT.urlTom(can.tonica, can.modo), corpo,
    trilha: [['Consultar', '/music/referencia'], ['Tonalidades', '/music/referencia/tonalidades'], [nome]] });
}

// ------------------------------------------------------------------
// Intervalo
// ------------------------------------------------------------------
function paginaIntervalo(req, res) {
  const iv = I.porSlug(req.params.slug);
  if (!iv) return naoAchou(res, 'este intervalo');
  const raizes = ['C4', 'D4', 'F4', 'G4', 'Bb3', 'E4'].map(N.ler);
  const exemplos = raizes.map((r) => ({ r, b: I.construir(r, iv) })).filter((x) => x.b && Math.abs(x.b.alt) <= 1).slice(0, 4);
  const inv = I.inverter(iv);
  const mesmos = I.porSemitons(iv.semitons).filter((y) => y.curto !== iv.curto && y.numero <= 15 && I.porSlug(y.slug));
  const ex0 = exemplos[0];
  const corpo = `
<header class="lab-cab"><p class="lab-cab-tipo">Intervalo</p><h1>${esc(iv.nome.charAt(0).toUpperCase() + iv.nome.slice(1))} <small>${esc(iv.curto)} · ${esc(iv.en)}</small></h1>
<p class="lab-lead"><strong>${iv.semitons} semitons</strong> ${iv.semitons >= 2 ? `(${esc(String(iv.semitons / 2).replace('.', ','))} tons)` : ''}. Número: ${esc(I.NUMEROS[iv.numero])} (${iv.numero} letras, contando as duas pontas). Qualidade: ${esc(I.QUAL_F[iv.qualidade])}${iv.composto ? ` — é composto: ${esc(I.ler(I.simples(iv.numero) + iv.qualidade) ? I.ler(I.simples(iv.numero) + iv.qualidade).nome : '')} mais uma oitava` : ''}.</p></header>
<section class="lab-bloco" aria-labelledby="ver"><h2 id="ver">Ver e ouvir</h2>
${ex0 ? `<div class="lab-acoes">${ouvir([N.midi(ex0.r), N.midi(ex0.b)], { rotulo: 'Subindo' })} ${ouvir([N.midi(ex0.b), N.midi(ex0.r)], { rotulo: 'Descendo' })} ${ouvir([N.midi(ex0.r), N.midi(ex0.b)], { rotulo: 'Junto (harmônico)', modo: 'harmonico' })}</div>` : ''}
<div class="lab-grade-2">${exemplos.map((x) => `<figure class="lab-fig">${pautaDe([x.r, x.b], { titulo: `${iv.nome} a partir de ${pt(x.r)}` })}<figcaption>${esc(pt(x.r))} → ${esc(pt(x.b))} ${ouvir([N.midi(x.r), N.midi(x.b)], { classe: 'mini' })}</figcaption></figure>`).join('')}</div>
${ex0 ? `<figure class="lab-fig">${pianoDe([ex0.r, ex0.b], { raiz: ex0.r, titulo: `${iv.nome} no teclado` })}</figure>` : ''}</section>
<section class="lab-bloco" aria-labelledby="rel"><h2 id="rel">Relações</h2>
<ul>${inv && inv.slug ? `<li>Inversão: <a href="/music/intervalos/${esc(inv.slug)}">${esc(inv.nome)} (${esc(inv.curto)})</a> — some ${iv.numero <= 8 ? `${iv.numero} + ${inv.numero} = 9` : 'a oitava'}.</li>` : ''}
${mesmos.length ? `<li>Mesmo som, outra grafia (enarmônicos): ${mesmos.map((y) => `<a href="/music/intervalos/${esc(y.slug)}">${esc(y.nome)}</a>`).join(', ')}.</li>` : ''}
<li>Na música tonal, ${esc(['1J', '8J', '5J', '4J'].indexOf(iv.curto) >= 0 ? 'é uma consonância perfeita (a quarta, sobre o baixo, é tratada como dissonância no contraponto).' : ['3M', '3m', '6M', '6m', '10M', '10m'].indexOf(iv.curto) >= 0 ? 'é uma consonância imperfeita: a base das terças e sextas paralelas.' : 'costuma ser tratado como dissonância, que pede resolução.')}</li></ul></section>
<section class="lab-bloco lab-praticar-cta"><h2>Praticar</h2><ul class="lab-chips"><li><a href="/music/praticar/intervalo-identificar">Ler intervalos</a></li><li><a href="/music/praticar/intervalo-construir">Construir intervalos</a></li><li><a href="/music/praticar/intervalo-ouvido">Intervalos de ouvido</a></li></ul>
<p>Todos os intervalos: <a href="/music/referencia/intervalos">tabela completa</a>.</p></section>`;
  pagina(res, { titulo: `${iv.nome.charAt(0).toUpperCase() + iv.nome.slice(1)} (${iv.curto}) — ouvir, ver e praticar | Musique`,
    descricao: `${iv.nome}: ${iv.semitons} semitons. Exemplos na pauta e no teclado, inversão, enarmônicos e exercícios.`, caminho: '/music/intervalos/' + iv.slug, corpo,
    trilha: [['Consultar', '/music/referencia'], ['Intervalos', '/music/intervalos'], [iv.nome]] });
}

// ------------------------------------------------------------------
// Nota
// ------------------------------------------------------------------
function paginaNota(req, res) {
  const n = N.deSlug(req.params.slug);
  if (!n || Math.abs(n.alt) > 2) return naoAchou(res, 'esta nota');
  const enh = N.enarmonicos(n).filter((x) => !N.mesmaGrafia(x, n));
  const oits = [1, 2, 3, 4, 5, 6, 7].map((o) => N.comOitava(n, o)).filter((x) => N.midi(x) >= 21 && N.midi(x) <= 108);
  const n4 = N.comOitava(n, 4);
  const canon = Math.abs(n.alt) <= 1 ? n : enh[0];
  const corpo = `
<header class="lab-cab"><p class="lab-cab-tipo">Nota</p><h1>${esc(N.nome(n, { notacao: 'extenso' }))} <small>${esc(pt(n))} · ${esc(cif(n))}</small></h1>
<p class="lab-lead">${enh.length ? `Soa igual a ${esc(enh.map(pt).join(' e '))} (enarmônicos) — mas é outra nota na escrita: outra linha da pauta, outra função.` : 'Nota natural.'}</p></header>
<section class="lab-bloco" aria-labelledby="ver"><h2 id="ver">Onde fica</h2>
<div class="lab-grade-2"><figure class="lab-fig">${pautaDe([n4])}<figcaption>Clave de sol (${esc(ptO(n4))})</figcaption></figure>
<figure class="lab-fig">${pautaDe([N.comOitava(n, 3)], { clave: 'fa' })}<figcaption>Clave de fá (${esc(ptO(N.comOitava(n, 3)))})</figcaption></figure></div>
<figure class="lab-fig">${pianoDe(oits.filter((x) => N.midi(x) >= 36 && N.midi(x) <= 84), { titulo: `${pt(n)} no teclado`, de: 36, ate: 84 })}</figure>
<figure class="lab-fig lab-fig-rola">${bracoDe([n], { titulo: `${pt(n)} no braço do violão` })}</figure></section>
<section class="lab-bloco" aria-labelledby="freq"><h2 id="freq">Frequências (lá4 = 440 Hz)</h2><div class="lab-tabela-rolagem"><table class="lab-tabela"><thead><tr><th scope="col">Oitava</th><th scope="col">Nota</th><th scope="col">Hz</th><th scope="col"><span class="sr">Ouvir</span></th></tr></thead><tbody>
${oits.map((x) => `<tr><th scope="row">${x.oitava}</th><td>${esc(ptO(x))}</td><td>${N.freq(x).toFixed(2).replace('.', ',')}</td><td>${ouvir([N.midi(x)], { classe: 'mini' })}</td></tr>`).join('')}</tbody></table></div></section>
<section class="lab-bloco" aria-labelledby="mais"><h2 id="mais">A partir de ${esc(pt(n))}</h2><ul class="lab-chips">
<li><a href="${CAT.urlEscala(canon, 'maior')}">Escala maior</a></li><li><a href="${CAT.urlEscala(canon, 'menor-natural')}">Escala menor</a></li>
<li><a href="${CAT.urlAcorde(canon, 'maior')}">Acorde ${esc(A.simbolo(canon, 'maior'))}</a></li><li><a href="${CAT.urlAcorde(canon, 'menor')}">Acorde ${esc(A.simbolo(canon, 'menor'))}</a></li>
<li><a href="${CAT.urlTom(canon, 'maior')}">Tom de ${esc(pt(canon))} maior</a></li></ul></section>`;
  pagina(res, { titulo: `Nota ${N.nome(n, { notacao: 'extenso' })} (${cif(n)}) — pauta, teclado e frequência | Musique`,
    descricao: `${N.nome(n, { notacao: 'extenso' })}: onde fica na pauta, no teclado e no violão; enarmônicos e frequências.`, caminho: CAT.urlNota(canon), corpo,
    trilha: [['Consultar', '/music/referencia'], ['Notas', '/music/notas'], [pt(n)]] });
}

module.exports = { paginaEscala, paginaAcorde, paginaTonalidade, paginaIntervalo, paginaNota, tonicaCanonica, fundamentalCanonica, candidatos, DOZE, USOS };
