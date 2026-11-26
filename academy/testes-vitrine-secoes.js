// =====================================================================
// Villela Academy — MARKETPLACE EM SEÇÕES (vitrine-secoes.js), pedido do Augusto de 26/11/2026:
// uma seção por área, índice preso no topo, cada curso uma vez só; filtro e busca como antes.
// Pressupõe o mesmo que testes-pagina-venda.js: app montado e maria@t.com produtora aprovada.
// Cria os próprios cursos e áreas e remove tudo ao fim.
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function rodar({ t, req }) {
  const { db } = require('./db');
  const repo = require('./repo');
  const ct = require('./repo-conteudo');
  const { agrupar, areaDe, encurtar, nomesCurtos, NOMES_DE_BOTAO } = require('./vitrine-secoes');

  console.log('\n— marketplace em seções: uma área por seção, cada curso uma vez, índice fixo, filtro e busca como antes —');
  const c = (slug, titulo, categorias, extra = {}) => ({ slug, titulo, categorias, ...extra });
  const slugs = (secoes, area) => (secoes.find(x => x.area === area) || { cursos: [] }).cursos.map(x => x.slug);

  await t('seções: com duas áreas o curso vai para a mais específica', () => {
    assert.equal(areaDe(c('a', 'A', ['direito', 'concursos-publicos'])), 'concursos-publicos');
    assert.equal(areaDe(c('b', 'B', ['direito', 'inteligencia-artificial'])), 'inteligencia-artificial');
    assert.equal(areaDe(c('d', 'D', ['desenvolvimento-pessoal', 'musica'])), 'musica');
    assert.equal(areaDe(c('e', 'E', ['marketing', 'vendas'])), 'marketing', 'fora das conhecidas vale a principal');
    assert.equal(areaDe(c('f', 'F', [])), 'outros');
  });

  await t('seções: ordem das áreas fixa, área nova entra sozinha depois (na ordem do cadastro) e sem área vai por último', () => {
    const itens = [c('s', 'S', []), c('m', 'M', ['marketing']), c('v', 'V', ['vendas']), c('g', 'G', ['gastronomia']), c('ch', 'Ch', ['viver-de-chacara']),
      c('dp', 'Dp', ['desenvolvimento-pessoal']), c('mu', 'Mu', ['musica']), c('ia', 'Ia', ['inteligencia-artificial']), c('co', 'Co', ['concursos-publicos'])];
    const r = agrupar(itens, { ordemDasAreas: ['vendas', 'marketing'], rotuloDe: (a) => `rótulo ${a}` });
    assert.deepEqual(r.map(x => x.area), ['concursos-publicos', 'inteligencia-artificial', 'musica', 'desenvolvimento-pessoal', 'viver-de-chacara', 'gastronomia', 'vendas', 'marketing', 'outros']);
    assert.equal(r[0].rotulo, 'Concursos Públicos e OAB');
    assert.equal(r[2].rotulo, 'Música — Villela Music');
    assert.equal(r[6].rotulo, 'rótulo vendas');
    assert.equal(r[8].rotulo, 'Outros cursos');
    assert.equal(r.reduce((n, x) => n + x.cursos.length, 0), itens.length);
  });

  await t('seções: concursos por carreira lida no título — OAB, Magistratura, Ministério Público, Defensoria; o que não casa vai depois', () => {
    const k = (slug, titulo) => c(slug, titulo, ['concursos-publicos']);
    const r = agrupar([k('trf3', 'Curso para o Concurso do TRF da 3ª Região'), k('dpu', 'Curso para Defensor Público da União'), k('mpt', 'Curso de Procurador do Trabalho'),
      k('juiz', 'Juiz do Trabalho'), k('mpdft', 'Curso para Promotor de Justiça (MPDFT)'), k('oab', 'Curso para o Exame de Ordem (OAB)'),
      k('federal', 'Curso para a Magistratura Federal'), k('mpf', 'Curso de Procurador da República')]);
    assert.deepEqual(slugs(r, 'concursos-publicos'), ['oab', 'federal', 'juiz', 'mpf', 'mpt', 'mpdft', 'dpu', 'trf3']);
  });

  await t('seções: preferidos na frente, curso novo depois em ordem alfabética (em breve por último) e a data não muda nada', () => {
    const k = (slug, titulo, extra) => c(slug, titulo, ['musica'], extra);
    const itens = [k('violao-x', 'Violão', { atualizado_em: '2030-01-01' }), k('ouvido-de-musico-a-base', 'Ouvido de Músico', { em_breve: true }),
      k('acordeao', 'Acordeão', { em_breve: true }), k('piano-x', 'Piano'), k('teoria-musical-do-zero', 'Teoria Musical'), k('flauta', 'Flauta')];
    const esperado = ['teoria-musical-do-zero', 'ouvido-de-musico-a-base', 'flauta', 'piano-x', 'violao-x', 'acordeao'];
    assert.deepEqual(slugs(agrupar(itens), 'musica'), esperado);
    assert.deepEqual(slugs(agrupar(itens.slice().reverse()), 'musica'), esperado, 'a ordem de entrada (data de atualização) não interfere');
    const ia = ['a-segunda-onda-da-ia', 'o-locador-inteligente', 'claude-ai-na-pratica-juridica', 'google-ai-na-pratica', 'claude-ai-na-pratica', 'chatgpt-ai-na-pratica']
      .map(s => c(s, s, ['inteligencia-artificial']));
    assert.deepEqual(slugs(agrupar(ia), 'inteligencia-artificial'),
      ['chatgpt-ai-na-pratica', 'claude-ai-na-pratica', 'google-ai-na-pratica', 'claude-ai-na-pratica-juridica', 'o-locador-inteligente', 'a-segunda-onda-da-ia']);
    const ch = ['decoracao-de', 'piscineiro-na', 'paisagismo-na', 'irrigacao-na', 'construcao-com', 'pedreiro-completo'].map(s => c(s, s, ['viver-de-chacara']));
    assert.deepEqual(slugs(agrupar(ch), 'viver-de-chacara'), ['pedreiro-completo', 'construcao-com', 'irrigacao-na', 'paisagismo-na', 'piscineiro-na', 'decoracao-de']);
  });

  await t('atalhos: o nome curto tira o que se repete e preserva a sigla', () => {
    const casos = {
      'Curso Preparatório para o Exame de Ordem (OAB)': 'Exame de Ordem (OAB)',
      'Curso Preparatório para o Concurso de Procurador do Trabalho': 'Procurador do Trabalho',
      'Curso Preparatório de Procurador da República': 'Procurador da República',
      'Curso Preparatório para Defensor Público da União': 'Defensor Público da União',
      'Curso Preparatório para a Magistratura Federal (TRF-1 e demais TRFs)': 'Magistratura Federal',
      'Curso Preparatório para o Concurso do TRF da 3ª Região (2026)': 'TRF da 3ª Região',
      'Curso Preparatório para o Concurso de Promotor de Justiça do Distrito Federal (MPDFT)': 'Promotor de Justiça do DF (MPDFT)',
      'Juiz do Trabalho — Magistratura do Trabalho (TRT 10ª Região)': 'Juiz do Trabalho',
      'Violão: do Zero ao Avançado': 'Violão',
      'Piscineiro na Prática': 'Piscineiro na Prática',
      'Formação Completa em Gastronomia — Villela Table': 'Gastronomia',
      'O Locador Inteligente na era da Inteligência Artificial': 'O Locador Inteligente',
      'Curso de culinária': 'Culinária',
    };
    for (const [titulo, curto] of Object.entries(casos)) assert.equal(encurtar(titulo), curto, titulo);
  });

  await t('atalhos: nunca dois botões iguais — quem colide volta ao nome inteiro', () => {
    const k = (titulo) => ({ titulo });
    assert.deepEqual(nomesCurtos([k('Violão: do Zero ao Avançado'), k('Violão — para crianças'), k('Piano: do Zero ao Avançado')]),
      ['Violão: do Zero ao Avançado', 'Violão — para crianças', 'Piano']);
    const iguais = nomesCurtos([k('Gaita'), k('Gaita'), k('Gaita (2)'), k('GAITA')]);
    assert.equal(new Set(iguais.map(x => x.toLowerCase())).size, 4, iguais.join(' | '));
  });

  await t('atalhos: os nomes escolhidos valem por slug, curso novo segue a regra automática e nunca saem botões iguais', () => {
    const escolhidos = Object.entries(NOMES_DE_BOTAO);
    assert.deepEqual(escolhidos.map(x => x[1]), ['OAB', 'Juiz Federal', 'Juiz de Direito', 'Juiz do Trabalho', 'Procurador da República',
      'Procurador do Trabalho', 'Promotor', 'Defensor Público', 'TRF 3ª Região', 'Bandolim', 'Contrabaixo', 'Pedreiro',
      'Construção de Contêineres', 'Irrigação', 'Paisagismo', 'Piscineiro', 'Decoração']);
    const itens = escolhidos.map(([slug]) => ({ slug, titulo: 'Título inteiro de ' + slug }));
    assert.deepEqual(nomesCurtos(itens), escolhidos.map(x => x[1]));
    const novo = { slug: 'violino-do-zero-ao-avancado', titulo: 'Violino: do Zero ao Avançado' };
    assert.deepEqual(nomesCurtos([novo, { slug: 'constructor', titulo: 'Curso de Gaita' }]), ['Violino', 'Gaita']);
    // curso novo cujo nome automático bate com um escolhido: os dois voltam ao nome inteiro
    const colide = nomesCurtos([...itens, { slug: 'outro-promotor', titulo: 'Curso de Promotor' }]);
    assert.equal(new Set(colide.map(x => x.toLowerCase())).size, colide.length, colide.join(' | '));
  });

  // ================= a página =================
  const maria = repo.Usuarios.porEmail('maria@t.com');
  const areasCriadas = ['Concursos Públicos', 'Música'].filter(r => !ct.Categorias.existe(r === 'Música' ? 'musica' : 'concursos-publicos'));
  areasCriadas.forEach(r => ct.Categorias.criar(r, maria.id));
  const novos = [];
  const criar = (titulo, categorias) => {
    const p = ct.Produtos.criar(maria.id, { titulo, categorias, preco_centavos: 1000, descricao_curta: 'Curso de teste das seções.' });
    db.prepare("UPDATE products SET status = 'publicado' WHERE id = ?").run(p.id);
    novos.push(p);
    return p;
  };
  const cards = (html) => [...html.matchAll(/<a class="cardp" href="\/academy\/cursos\/([^"]+)"/g)].map(m => m[1]);
  const lista = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]).mainEntity;

  try {
    const oab = criar('Seções: Exame de Ordem (OAB)', ['direito', 'concursos-publicos']);
    const ouvido = criar('Seções: Ouvido', ['desenvolvimento-pessoal', 'musica']);
    const juridica = criar('Seções: IA Jurídica', ['direito', 'inteligencia-artificial']);

    await t('página sem filtro: h1 único, h2 por seção, cada curso uma vez e na área certa', async () => {
      const r = await req('GET', '/academy/marketplace');
      assert.equal(r.st, 200);
      assert.equal((r.texto.match(/<h1\b/g) || []).length, 1);
      const vistos = cards(r.texto);
      assert.equal(new Set(vistos).size, vistos.length, 'nenhum curso repetido');
      assert.equal(vistos.length, ct.Marketplace.listar({ n: 200 }).length, 'o catálogo inteiro está na página');
      const secoes = [...r.texto.matchAll(/<section class="pv-secao" id="([^"]+)"[\s\S]*?<\/section>/g)].map(m => ({ id: m[1], html: m[0] }));
      assert.ok(secoes.length >= 3);
      secoes.forEach(x => assert.equal((x.html.match(/<h2\b/g) || []).length, 1, 'um h2 em ' + x.id));
      const de = (p) => (secoes.find(x => cards(x.html).includes(p.slug)) || {}).id;
      assert.equal(de(oab), 'area-concursos-publicos');
      assert.equal(de(ouvido), 'area-musica');
      assert.equal(de(juridica), 'area-inteligencia-artificial');
      assert.equal(secoes[0].id, 'area-concursos-publicos', 'Concursos abre a página');
    });

    await t('índice: um link por seção, na mesma ordem, com a contagem de cartões dela', async () => {
      const html = (await req('GET', '/academy/marketplace')).texto;
      const indice = [...html.match(/<nav class="pv-indice"[\s\S]*?<\/nav>/)[0].matchAll(/<a href="#([^"]+)">[^<]*<span class="n">(\d+)<\/span>/g)].map(m => [m[1], +m[2]]);
      const secoes = [...html.matchAll(/<section class="pv-secao" id="([^"]+)"[\s\S]*?<\/section>/g)].map(m => [m[1], cards(m[0]).length]);
      assert.deepEqual(indice, secoes);
      const css = fs.readFileSync(path.join(__dirname, 'publico.css'), 'utf8');
      assert.ok(/\.pv-indice\{position:sticky;top:0;/.test(css), 'o índice fica preso no topo');
      assert.ok(/\.pv-secao\{scroll-margin-top:\d+px/.test(css), 'e não cobre o título da seção');
      assert.ok(html.includes('/academy/publico.css?v=5'), 'a folha mudou: versão nova no endereço');
    });

    await t('contagens: total no topo e número ao lado de cada título de seção, calculados', async () => {
      const html = (await req('GET', '/academy/marketplace')).texto;
      const total = cards(html).length;
      const secoes = [...html.matchAll(/<section class="pv-secao"[\s\S]*?<\/section>/g)].map(m => m[0]);
      // a palavra é "cursos" quando só há cursos; com e-book ou clube no meio, "produtos"
      const topo = (h) => h.match(/<p class="pv-total"><b>(\d+) (cursos|produtos)<\/b> em (\d+) áreas<\/p>/) || [];
      assert.deepEqual([+topo(html)[1], +topo(html)[3]], [total, secoes.length], 'total no topo');
      secoes.forEach(x => {
        const m = x.match(/<span class="pv-qt">(\d+) (cursos?|produtos?)<\/span><\/h2>/) || [];
        assert.equal(+m[1], cards(x).length, 'contagem da seção');
        assert.equal(m[2].endsWith('s'), cards(x).length !== 1, 'singular e plural');
      });
      criar('Seções: curso novo', ['marketing']);
      assert.equal(+topo((await req('GET', '/academy/marketplace')).texto)[1], total + 1, 'o total acompanha o catálogo');
    });

    await t('atalhos: um botão por curso, entre o índice e as seções, na ordem delas, com o nome inteiro em title e aria-label', async () => {
      const html = (await req('GET', '/academy/marketplace')).texto;
      const ini = html.indexOf('<nav class="pv-atalhos"');
      assert.ok(ini > html.indexOf('<nav class="pv-indice"') && ini < html.indexOf('<section class="pv-secao"'), 'posição');
      const bloco = html.slice(ini, html.indexOf('</nav>', ini));
      const botoes = [...bloco.matchAll(/<a href="\/academy\/cursos\/([^"]+)" title="([^"]*)" aria-label="([^"]*)">([^<]*)<\/a>/g)];
      assert.deepEqual(botoes.map(m => m[1]), cards(html), 'mesmos cursos, mesma ordem');
      assert.equal(new Set(botoes.map(m => m[4])).size, botoes.length, 'sem botões iguais');
      const titulos = new Map(ct.Marketplace.listar({ n: 200 }).map(p => [p.slug, p.titulo]));
      botoes.forEach(m => { assert.equal(m[2], m[3]); assert.equal(m[2].replace(/&amp;/g, '&'), titulos.get(m[1])); });
      assert.equal((bloco.match(/class="area"/g) || []).length, (html.match(/<section class="pv-secao"/g) || []).length, 'um rótulo por área');
      assert.ok(!/<h[1-6]/.test(bloco), 'o bloco não cria títulos');
    });

    await t('SEO: ItemList na ordem da página, canonical sem parâmetro e os links ?categoria= continuam', async () => {
      const html = (await req('GET', '/academy/marketplace')).texto;
      const il = lista(html);
      assert.equal(il.numberOfItems, cards(html).length);
      assert.deepEqual(il.itemListElement.map(x => x.url.split('/').pop()), cards(html));
      assert.ok(/<link rel="canonical" href="[^"]*\/academy\/marketplace">/.test(html));
      assert.ok(html.includes('href="/academy/marketplace?categoria=direito"'), 'área sem seção própria continua alcançável pelo filtro');
    });

    await t('filtro e busca: grade única como antes, sem índice nem seções — e o curso aparece em qualquer área dele', async () => {
      for (const rota of ['/academy/marketplace?categoria=direito', '/academy/marketplace?q=' + encodeURIComponent('Seções:')]) {
        const html = (await req('GET', rota)).texto;
        assert.ok(!/pv-indice|pv-secao|pv-atalhos|pv-total|pv-qt/.test(html), rota);
        assert.ok(html.includes('pv-areas') && cards(html).includes(oab.slug) && cards(html).includes(juridica.slug), rota);
      }
      assert.ok((await req('GET', '/academy/marketplace?categoria=direito')).texto.includes('/academy/marketplace?categoria=direito">'), 'canonical do filtro');
    });

    await t('a home /academy continua com a barra de filtros, sem o índice das seções', async () => {
      const html = (await req('GET', '/academy')).texto;
      assert.ok(html.includes('pv-areas') && !html.includes('pv-indice'));
    });
  } finally {
    novos.forEach(p => db.prepare("UPDATE products SET status = 'removido' WHERE id = ?").run(p.id));
    for (const p of novos) db.prepare('DELETE FROM product_categories WHERE product_id = ?').run(p.id);
    for (const p of novos) db.prepare("UPDATE products SET categoria = '' WHERE id = ?").run(p.id);
    areasCriadas.forEach(r => { try { ct.Categorias.remover(r === 'Música' ? 'musica' : 'concursos-publicos'); } catch (_) { /* em uso por outro teste */ } });
  }
}

module.exports = { rodar };
