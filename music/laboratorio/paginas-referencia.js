// =====================================================================
// Musique · Laboratório — REFERÊNCIAS (Consultar). Tabelas calculadas
// pelo núcleo + texto curto original. Nada tabelado à mão que o núcleo
// saiba calcular.
// =====================================================================
'use strict';
const H = require('./html');
const { esc, pt, ptO, cif, ouvir, pagina, naoAchou, pautaDe, pianoDe, tabelaFiguras, tabelaSerie, N, I, E, A, T, R, INS, D, AC, CAT } = H;
const TE = require('./paginas-teoria');

const tab = (cab, linhas, legenda = '') => `<div class="lab-tabela-rolagem"><table class="lab-tabela">${legenda ? `<caption>${esc(legenda)}</caption>` : ''}
<thead><tr>${cab.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;

const REF = {
  'glossario': () => `<p>Termos de teoria musical com definição curta e o equivalente em inglês — útil para ler material estrangeiro e usar programas de música.</p>
<dl class="lab-glossario">${CAT.GLOSSARIO.slice().sort((a, b) => a[0].localeCompare(b[0], 'pt')).map((g) => `<div id="${esc(CAT.norm(g[0]).replace(/ /g, '-'))}"><dt>${esc(g[0])} <span lang="en">(${esc(g[1])})</span></dt><dd>${esc(g[2])}</dd></div>`).join('')}</dl>`,

  'pauta-e-claves': () => {
    const claves = ['sol', 'fa', 'do3', 'do4'];
    const faixas = { sol: ['E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5'], fa: ['G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3'], do3: ['F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4'], do4: ['D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4'] };
    return `<p>A pauta tem cinco linhas e quatro espaços, contados de baixo para cima. A clave dá nome a uma linha e, com ela, a todas. Abaixo, as linhas e espaços de cada clave, da 1ª linha à 5ª.</p>
${claves.map((c) => { const cl = D && require('./nucleo/pauta').clave(c); return `<h2>${esc(cl.nome)}</h2><p>Referência: ${esc(cl.referencia)}.</p><figure class="lab-fig">${pautaDe(faixas[c].map(N.ler), { clave: c })}</figure>`; }).join('')}
<h2>Linhas suplementares e o dó central</h2><p>O dó4 (dó central) fica na 1ª linha suplementar <em>abaixo</em> da clave de sol e na 1ª <em>acima</em> da clave de fá. Na grande pauta do piano, ele é a ponte entre as duas.</p>
<div class="lab-grade-2"><figure class="lab-fig">${pautaDe([N.ler('C4')])}</figure><figure class="lab-fig">${pautaDe([N.ler('C4')], { clave: 'fa' })}</figure></div>
<p><a href="/music/explorar/pauta">Explorar a pauta</a> · <a href="/music/praticar/nota-na-pauta">Praticar leitura</a></p>`;
  },

  'figuras-e-compassos': () => `${tabelaFiguras()}
<h2>Ponto, ligadura e quiálteras</h2><ul><li><strong>Ponto de aumento</strong>: soma metade do valor. Semínima pontuada = ${esc(R.texto(R.duracao('seminima', { pontos: 1 })))}; com dois pontos = ${esc(R.texto(R.duracao('seminima', { pontos: 2 })))}.</li>
<li><strong>Ligadura de valor</strong>: soma a duração de duas notas iguais, sem novo ataque.</li><li><strong>Tercina</strong>: três figuras no tempo de duas — cada colcheia de tercina vale ${esc(R.texto(R.duracao('colcheia', { quialtera: [3, 2] })))}.</li></ul>
<h2>Fórmulas de compasso</h2>${tab(['Compasso', 'Tipo', 'Pulsos', 'Unidade de pulso', 'Agrupamento'], ['2/4', '3/4', '4/4', '2/2', '6/8', '9/8', '12/8', '5/8', '7/8'].map((c) => { const x = R.compasso(c); const f = R.FIGURAS.find((y) => R.iguais(y.valor, x.unidade_pulso)); return [x.texto, x.tipo, x.pulsos, f ? f.nome : R.FIGURAS.find((y) => R.iguais(R.duracao(y, { pontos: 1 }), x.unidade_pulso)).nome + ' pontuada', x.agrupamento.join(' + ')]; }))}
<p>No compasso composto, o pulso é uma figura pontuada dividida em três. <a href="/music/praticar/ritmo-completar">Praticar: complete o compasso</a>.</p>`,

  'intervalos': () => tab(['Curto', 'Nome', 'Semitons', 'Inversão', 'Inglês', 'Exemplo (a partir de dó)'], I.USUAIS.map((iv) => { const inv = I.inverter(iv); const b = I.construir('C4', iv); return [`<a href="/music/intervalos/${esc(iv.slug)}">${esc(iv.curto)}</a>`, esc(iv.nome), iv.semitons, inv ? esc(inv.curto) : '', `<span lang="en">${esc(iv.nome_en)}</span>`, b ? esc('dó → ' + ptO(b)) : '']; }))
    + '<p>Número = letras contadas incluindo as duas pontas. Qualidade = semitons em relação ao intervalo de referência. <a href="/music/aprender/intervalos">Lição sobre intervalos</a>.</p>',

  'formulas-de-escalas': () => ['1', '2', '3', '4'].map((nv) => { const lista = E.CATALOGO.filter((e) => String(e.nivel) === nv); return lista.length ? `<h2>${['Iniciante', 'Intermediário', 'Avançado', 'Especialista'][nv - 1]}</h2>` + tab(['Escala', 'Fórmula', 'Passos', 'Em dó'], lista.map((e) => { const ns = E.notas(N.ler('C'), e.id); return [`<a href="${CAT.urlEscala(TE.tonicaCanonica(N.ler('C'), e.id), e.id)}">${esc(e.nome)}</a>`, esc(e.formula), esc(E.passos(e.id).join(' ')), esc(ns ? ns.map(pt).join(' ') : '—')]; })) : ''; }).join(''),

  'formulas-de-acordes': () => tab(['Acorde', 'Fórmula', 'Intervalos', 'Símbolos aceitos', 'Em dó'], A.CATALOGO.map((c) => { const ns = A.notas(N.ler('C'), c.id); return [`<a href="${CAT.urlAcorde(N.ler('C'), c.id)}">${esc(c.nome)}</a>`, esc(c.formula), esc(A.intervalos(c.id).join(' ')), esc(c.simbolos.map((s) => 'C' + s).join(' · ')), esc(ns ? ns.map(pt).join(' ') : '')]; }))
    + '<p>⚠️ "C9" segue a convenção internacional (C7(9)). A nona sem sétima é C(9) ou Cadd9. <a href="/music/explorar/identificar-acorde">Identificar um acorde pelas notas</a>.</p>',

  'armaduras': () => `<p>Ordem dos sustenidos: <strong>${esc(T.ORDEM_SUST.map((l) => pt(N.ler(l))).join(' – '))}</strong>. Ordem dos bemóis: <strong>${esc(T.ORDEM_BEMOL.map((l) => pt(N.ler(l))).join(' – '))}</strong> (a mesma, ao contrário).</p>`
    + tab(['Acidentes', 'Maior', 'Menor relativa', 'Armadura'], [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7].map((q) => { const t = T.daArmadura(q); return [q ? `${Math.abs(q)} ${q > 0 ? '♯' : '♭'}` : '—', `<a href="${CAT.urlTom(t.maior, 'maior')}">${esc(T.nome(t.maior, 'maior'))}</a>`, `<a href="${CAT.urlTom(t.menor, 'menor')}">${esc(T.nome(t.menor, 'menor'))}</a>`, esc(T.armadura(t.maior, 'maior').acidentes.map(pt).join(' ') || 'nenhum')]; }))
    + '<p>Regra rápida: com sustenidos, a tônica maior está meio tom acima do último sustenido; com bemóis, é o penúltimo bemol. <a href="/music/explorar/circulo-de-quintas">Círculo de quintas</a>.</p>',

  'tonalidades': () => `<div class="lab-grade-2"><div><h2>Maiores</h2><ul class="lab-chips">${T.MAIORES.map((t) => `<li><a href="${CAT.urlTom(N.ler(t), 'maior')}">${esc(T.nome(N.ler(t), 'maior'))}</a></li>`).join('')}</ul></div>
<div><h2>Menores</h2><ul class="lab-chips">${T.MENORES.map((t) => `<li><a href="${CAT.urlTom(N.ler(t), 'menor')}">${esc(T.nome(N.ler(t), 'menor'))}</a></li>`).join('')}</ul></div></div>`,

  'graus-e-funcoes': () => `<p>Os graus da escala se escrevem em algarismos romanos: <strong>maiúsculo</strong> para acorde maior, <strong>minúsculo</strong> para menor, <strong>°</strong> diminuto, <strong>ø</strong> meio-diminuto, <strong>+</strong> aumentado.</p>`
    + tab(['Grau', 'Nome do grau', 'Maior (em dó)', 'Função', 'Menor (em lá)', 'Função'], T.campo(N.ler('C'), 'maior').map((g, i) => { const m = T.realizar(N.ler('A'), 'menor', [i + 1])[0]; return [String(i + 1), ['tônica', 'supertônica', 'mediante', 'subdominante', 'dominante', 'superdominante (submediante)', 'sensível / subtônica'][i], `${esc(g.romano)} · ${esc(g.simbolo)}`, `<span class="lab-func lab-func-${g.funcao}">${g.funcao}</span>`, `${esc(m.romano)} · ${esc(m.simbolo)}`, `<span class="lab-func lab-func-${m.funcao}">${m.funcao}</span>`]; }))
    + '<p>T = tônica (repouso), S = subdominante (afastamento), D = dominante (tensão). É a leitura funcional clássica — útil, mas simplificada: o contexto e o estilo podem mudar o papel de um acorde. No menor, o V maior vem da escala harmônica.</p>',

  'cadencias-e-progressoes': () => `<h2>Cadências</h2>${tab(['Cadência', 'Graus', 'Em dó maior', 'O que faz'], T.CADENCIAS.map((c) => [esc(c.nome), esc(c.graus.map((g) => T.campo(N.ler('C'), 'maior')[g - 1].romano).join(' – ')), esc(T.realizar(N.ler('C'), 'maior', c.graus).map((x) => x.simbolo).join(' → ')), esc(c.texto)]))}
<h2>Progressões comuns</h2><p>Padrões de graus de domínio comum, usados em incontáveis músicas — o padrão é abstrato; cada gravação é de quem a fez.</p>
${tab(['Progressão', 'Estilos', 'Em dó (ou lá menor)', 'Nota'], T.PROGRESSOES.map((p) => [esc(p.nome), esc(p.genero), esc(T.realizar(N.ler(p.modo === 'menor' ? 'A' : 'C'), p.modo || 'maior', p.graus, { dominantes: p.dominantes }).map((x) => x.simbolo).join(' → ')), esc(p.texto)]))}
<p><a href="/music/criar/progressoes">Montar e ouvir progressões</a>.</p>`,

  'enarmonia': () => `<p>No temperamento igual, dó♯ e ré♭ são a mesma tecla e a mesma frequência. Mas são notas diferentes na escrita: dó♯ fica na linha (ou espaço) do dó, ré♭ na do ré. Qual usar depende do contexto — da escala, do acorde, da direção da melodia.</p>
<div class="lab-grade-2"><figure class="lab-fig">${pautaDe([N.ler('C#4'), N.ler('Db4')])}<figcaption>dó♯4 e ré♭4: mesmo som, posições diferentes.</figcaption></figure>
<figure class="lab-fig">${pautaDe([N.ler('E#4'), N.ler('Fb4'), N.ler('B#3'), N.ler('Cb5')])}<figcaption>mi♯ = fá, fá♭ = mi, si♯ = dó, dó♭ = si.</figcaption></figure></div>`
    + tab(['Tecla', 'Grafias possíveis'], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((pc) => [esc(pt(N.deClasse(pc))), esc(N.enarmonicos(N.deClasse(pc)).map(pt).join(' · '))]))
    + '<p>Um exemplo onde importa: a escala de sol♯ menor harmônica precisa de fá𝄪 (e não de sol), para ter uma nota de cada letra. <a href="/music/escalas/sol-sustenido/menor-harmonica">Veja</a>.</p>',

  'afinacoes': () => Object.keys(INS.CORDAS).filter((k) => k !== 'guitarra').map((k) => { const ins = INS.CORDAS[k]; return `<h2>${esc(ins.nome)}</h2>` + tab(['Afinação', 'Cordas (grave → aguda)', 'Ouvir'], Object.keys(ins.afinacoes).map((a) => { const af = INS.afinacao(k, a); return [esc(af.nome), esc(af.notas.map(ptO).join(' – ')), ouvir(af.midi, { rotulo: 'Ouvir', classe: 'mini' })]; })); }).join('')
    + '<p>A guitarra usa as mesmas afinações do violão. No ukulele padrão, a 4ª corda (sol4) é mais aguda que a 3ª: afinação reentrante. <a href="/music/explorar/braco">Explorar o braço</a>.</p>',

  'extensoes': () => tab(['Instrumento', 'Mais grave', 'Mais aguda', 'Escrita × som'], INS.extensoes().map((e) => [esc(e.nome), esc(ptO(e.grave)), esc(ptO(e.agudo)), esc(e.soa || 'soa como escrito')]), 'Extensões aproximadas (altura real)')
    + `<h2>Vozes</h2><p class="lab-nota-convencao">⚠️ Faixas comuns em livros de canto coral. <strong>Não é classificação vocal nem diagnóstico</strong>: classificar uma voz exige professor e leva em conta timbre, conforto e tessitura, não só a extensão.</p>`
    + tab(['Voz', 'Grave', 'Aguda'], INS.VOZES.map((v) => [esc(v.nome), esc(ptO(N.ler(v.grave))), esc(ptO(N.ler(v.agudo)))])),

  'frequencias': () => `<p>Com lá4 = 440 Hz (a referência padrão). Cada semitom multiplica a frequência por 2<sup>1/12</sup> ≈ 1,0595; cada oitava, por 2.</p>`
    + tab(['Nota', 'MIDI', 'Hz', 'Ouvir'], AC.tabela(21, 108).map((x) => [esc(ptO(x.nota) + ' · ' + N.nome(x.nota)), x.midi, x.hz.toFixed(2).replace('.', ','), `<button type="button" class="lab-ouvir mini" data-midis="[${x.midi}]"><span aria-hidden="true">▶</span></button>`])),

  'temperamento': () => `<p>A afinação <strong>justa</strong> usa razões simples entre frequências (3:2 na quinta, 5:4 na terça maior): intervalos "puros", sem batimento. O <strong>temperamento igual</strong> divide a oitava em 12 semitons idênticos (100 cents cada), para que todos os tons soem igualmente bem — ao preço de pequenas diferenças em relação aos intervalos puros.</p>`
    + tab(['Intervalo', 'Razão justa', 'Justa (cents)', 'Igual (cents)', 'Diferença'], AC.comparacaoTemperamento().map((x) => [esc(x.nome), esc(x.razao), String(x.cents_justo).replace('.', ','), x.cents_igual, (x.diferenca > 0 ? '+' : '') + String(x.diferenca).replace('.', ',')]))
    + '<p>A terça maior temperada é cerca de 14 cents mais aguda que a justa — é por isso que coros e quartetos de cordas afinam as terças "por ouvido", mais baixas que o piano. <a href="/music/criar/batimentos">Ouça os batimentos</a>.</p>',

  'solfejo': () => {
    const t = N.ler('G');
    const ns = E.notas(N.comOitava(t, 4), 'maior');
    const MOVEL = ['dó', 'ré', 'mi', 'fá', 'sol', 'lá', 'si'];
    return `<p><strong>Solfejar</strong> é cantar dizendo o nome das notas. Há duas escolas, e as duas são legítimas:</p>
<ul><li><strong>Dó fixo</strong>: a sílaba é o nome da nota. Sol é sempre "sol", em qualquer tom. É o sistema mais comum no Brasil e na Europa latina, e treina a leitura.</li>
<li><strong>Dó móvel</strong>: a sílaba é o <em>grau</em>. A tônica é sempre "dó", seja qual for a tonalidade. Treina o ouvido relativo: a sensível é sempre "si", subindo para "dó".</li></ul>
${tab(['Grau', 'Nota em sol maior', 'Dó fixo', 'Dó móvel', 'Ouvir'], ns.map((n, i) => [String(i + 1), esc(pt(n)), esc(pt(n)), esc(MOVEL[i]), ouvir([N.midi(n)], { classe: 'mini' })]), 'Sol maior nos dois sistemas')}
<h2>Sílabas alteradas (dó móvel)</h2>
<p>Para as notas cromáticas, muda a vogal: subindo, <strong>di, ri, fi, si, li</strong> (♯1, ♯2, ♯4, ♯5, ♯6); descendo, <strong>ra, me, se, le, te</strong> (♭2, ♭3, ♭5, ♭6, ♭7). No tom menor há duas convenções: menor com base em "lá" (relativa) ou em "dó" (com me, le e te).</p>
<p>${ouvir(ns.concat([N.comOitava(t, 5)]).map(N.midi), { rotulo: 'Cantar junto: a escala de sol maior' })}</p>
<p><a href="/music/aprender/escala-maior">Lição: a escala maior</a> · <a href="/music/praticar/intervalo-ouvido">Praticar intervalos de ouvido</a></p>`;
  },

  'ritmo-e-groove': () => `<ul><li><strong>Síncope</strong>: ataque num tempo (ou parte) fraco que se prolonga pelo forte — o acento se desloca.</li>
<li><strong>Contratempo</strong>: ataque na parte fraca, com a parte forte em silêncio.</li>
<li><strong>Swing</strong>: colcheias desiguais, longa-curta (aproximadamente 2:1, como numa tercina), com acento na curta.</li>
<li><strong>Shuffle</strong>: o swing aplicado à levada inteira, comum no blues.</li>
<li><strong>Subdivisão</strong>: dividir o tempo em 2, 3, 4 ou 6 partes; sentir a subdivisão é o que estabiliza o pulso.</li></ul>
<h2>Rudimentos de caixa</h2>${tab(['Rudimento', 'Mãos (D = direita, E = esquerda)', 'Inglês'], R.RUDIMENTOS.map((r) => [esc(r.nome), `<code>${esc(r.padrao)}</code>`, `<span lang="en">${esc(r.en)}</span>`]))}
<p><a href="/music/criar/batidas">Fazedor de batidas (com swing)</a> · <a href="/music/criar/polirritmos">Polirritmos e rudimentos</a> · <a href="/music/jogar/mantenha-o-pulso">Mantenha o pulso</a></p>`,

  'cheat-sheet': () => `<div class="lab-cheat">
<section><h2>Notas</h2><p>dó ré mi fá sol lá si = C D E F G A B. Meio tom entre mi–fá e si–dó. ♯ sobe, ♭ desce meio tom.</p></section>
<section><h2>Intervalos</h2><p>${I.USUAIS.slice(0, 16).map((iv) => `${esc(iv.curto)} = ${iv.semitons}`).join(' · ')} (semitons)</p></section>
<section><h2>Escalas</h2><p>Maior: T T S T T T S. Menor natural: T S T T S T T. Harmônica: sobe o 7º. Melódica: sobe o 6º e o 7º. Pentatônica maior: 1 2 3 5 6.</p></section>
<section><h2>Tríades</h2><p>Maior 1 3 5 · menor 1 ♭3 5 · diminuta 1 ♭3 ♭5 · aumentada 1 3 ♯5.</p></section>
<section><h2>Tétrades</h2><p>7M: 1 3 5 7 · 7: 1 3 5 ♭7 · m7: 1 ♭3 5 ♭7 · m7(♭5): 1 ♭3 ♭5 ♭7 · °7: 1 ♭3 ♭5 𝄫7.</p></section>
<section><h2>Campo maior</h2><p>I ii iii IV V vi vii° — com sétimas: I7M ii7 iii7 IV7M V7 vi7 viiø.</p></section>
<section><h2>Funções</h2><p>T: I iii vi · S: ii IV · D: V vii°.</p></section>
<section><h2>Armadura</h2><p>♯: fá dó sol ré lá mi si · ♭: si mi lá ré sol dó fá.</p></section>
<section><h2>Figuras</h2><p>semibreve 1 · mínima ½ · semínima ¼ · colcheia ⅛ · semicolcheia 1/16. Ponto: + metade.</p></section>
<section><h2>Compassos</h2><p>Simples: 2/4 3/4 4/4 · compostos: 6/8 9/8 12/8 (pulso pontuado) · irregulares: 5/8 7/8.</p></section>
</div>`,
};

function paginaReferencia(req, res) {
  const r = CAT.REFERENCIAS.find((x) => x.slug === req.params.slug);
  if (!r || !REF[r.slug]) return naoAchou(res, 'esta referência');
  pagina(res, { titulo: `${r.nome} — Musique`, descricao: r.resumo, caminho: '/music/referencia/' + r.slug,
    corpo: `<header class="lab-cab"><p class="lab-cab-tipo">Consultar</p><h1>${esc(r.nome)}</h1><p class="lab-lead">${esc(r.resumo)}</p></header>${REF[r.slug]()}`,
    trilha: [['Consultar', '/music/referencia'], [r.nome]] });
}

module.exports = { paginaReferencia, REF };
