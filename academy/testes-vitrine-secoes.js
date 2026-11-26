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
  const { agrupar, areaDe } = require('./vitrine-secoes');

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
      assert.ok(html.includes('/academy/publico.css?v=3'), 'a folha mudou: versão nova no endereço');
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
        assert.ok(!html.includes('pv-indice') && !html.includes('pv-secao'), rota);
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
