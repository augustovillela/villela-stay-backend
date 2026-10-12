// =====================================================================
// Villela Academy — PÁGINA DE VENDA e páginas públicas vizinhas · testes da
// auditoria de 11/10/2026-b (frente P: produção vista de fora). Cada teste
// trava um achado de docs\estudo\auditoria-2026-10-11-b\p-producao-e-integridade.md:
//   A1  curso que hospeda o Estude conta pelo PERCURSO, não pela casca ("1 aula")
//   M1  descrição longa com listas e subtítulos — e nada de HTML do produtor
//   M6  barra de compra presa ao rodapé no celular
//   B1  og:image com a medida REAL da capa (ou sem medida)
//   B2  "o quiz" só é prometido a curso que tem quiz
//   B4  404 sem a faixa MINUTA
//   B5  noindex nas páginas de passagem
//   B6  relacionados só da mesma área; organização não é Person no JSON-LD
//   B9  `ordem_fixa` na rota de staff das questões
// (O /health — B7 — é do servidor, e o teste dele está em selftest-nucleo.js.)
//
// O QUE ESTE ARQUIVO PRESSUPÕE de quem o chama (o selftest):
//   · o app montado com as rotas da Academy e a chave de publicação de teste (`req` com { chave: true });
//   · a conta maria@t.com existente e APROVADA como produtora (é o começo do main() do selftest).
// Só isso: não usa sessão de ninguém (nenhum `jar`), cria os próprios cursos e percursos, e devolve
// como encontrou o que precisa mexer fora deles (a config `ia_cobranca` e o nome público da produtora).
// Publicar o produto é por SQL, como em testes-amostras.js: o fluxo editorial tem teste próprio.
// =====================================================================
'use strict';
const assert = require('assert');

async function rodar({ t, req }) {
  const { db, nowISO, novoId } = require('./db');
  const repo = require('./repo');
  const ct = require('./repo-conteudo');
  const R = require('./estudo/repo');
  const { textoRico, dimensoesDaImagem, inclusoNoPreco } = require('./paginas')._teste;

  console.log('\n— página de venda (auditoria 11/10-b): números do Estude, descrição com lista, barra de compra, og:image, quiz prometido, 404, noindex, relacionados, ordem fixa —');
  const PROD = 'maria@t.com', SLUG = 'venda-estude', SLUG_RASCUNHO = 'venda-rascunho';
  const maria = repo.Usuarios.porEmail(PROD);
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo });
  const b64 = (b) => b.toString('base64');
  // PNG só com o cabeçalho (assinatura + IHDR): é onde moram largura e altura
  const png = (w, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(b, 0); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[24] = 8; b[25] = 2; return b; };
  // JPEG mínimo: SOI, um APP0 de 16 bytes e o SOF0 com altura e largura
  const jpeg = (w, h) => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]), Buffer.alloc(14), Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3]), Buffer.alloc(12)]);
  const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([40, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(32)]);

  // a descrição do jeito que o produtor escreve: subtítulo, parágrafo, lista — e uma tentativa de injeção em cada forma
  const DESCRICAO = ['O que é', '', 'Um percurso construído item a item sobre o programa do edital.', 'Segunda linha do mesmo parágrafo.', '',
    'O que o curso tem hoje', '', '- 251 aulas: uma para cada ponto.', '- Questões comentadas, alternativa por alternativa.', '- "><img src=x onerror=alert(2)>', '',
    '<script>alert(1)</script>', '', '<b>Título com tag</b>', '', 'Acesso', '', 'Acesso por 1 ano a partir da compra.'].join('\n');
  const UN = (codigo, titulo, comp, item) => ({ codigo, titulo, competencias: [comp], itens: item ? [item] : [], tempo_min: 30,
    blocos: [{ tipo: 'explicacao', texto: `Explicação da ${titulo}: a regra geral e a exceção que a banca troca.` },
      { tipo: 'pratica', texto: `Exercício da ${titulo}: aplique a regra ao caso proposto.`, solucao: `Solução da ${titulo}.` }] });
  const Q = (i, comp, extra = {}) => ({ tipo: 'objetiva', origem: 'autoral', enunciado: `Página de venda, questão ${i}: qual é a regra aplicável ao ponto?`, competencias: [comp],
    alternativas: [{ texto: `certa ${i}`, correta: true, explicacao: 'Certa: é a regra.' }, { texto: `errada ${i}a`, correta: false, explicacao: 'Errada: é a exceção.' }, { texto: `errada ${i}b`, correta: false, explicacao: 'Errada: é outro instituto.' }], ...extra });
  const PROGRAMA = { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [
    { codigo: '1', texto: 'Programa' },
    { codigo: '1.1', texto: 'Direito das Coisas Vendidas' }, { codigo: '1.1.1', texto: 'Ponto a' }, { codigo: '1.1.2', texto: 'Ponto b' },
    { codigo: '1.2', texto: 'Direito do Balcão' }, { codigo: '1.2.1', texto: 'Ponto c' }] };
  const COMPS = ['a', 'b', 'c', 'm'].map(n => ({ codigo: 'v' + n, resultado: `Diante de um caso do ponto ${n}, o aluno aplica a regra e justifica a resposta.` }));

  let est = null, comum = null, outra = null; // os três produtos: com Estude (direito), comum (direito) e de outra área, com capa que não se sabe medir
  const E = (extra = {}) => ({ produtor_email: PROD, produto_id: est.id, ...extra });
  const pagina = async (p) => { const r = await req('GET', `/academy/cursos/${p.slug}`); assert.equal(r.st, 200, r.texto.slice(0, 200)); return r.texto; };
  const lds = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m => { const v = JSON.parse(m[1]); return Array.isArray(v) ? v : [v]; });
  const curso = (html) => lds(html).find(x => x['@type'] === 'Course');
  const meta = (html, prop) => (html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`)) || [])[1];
  const robots = (html) => (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '';

  await t('venda: os cursos de teste — um com percurso do Estude (casca de 1 aula), um comum da mesma área e um de outra área', async () => {
    const criar = async (produto, modulos) => {
      const r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD, produto, modulos });
      assert.equal(r.st, 200, r.texto);
      db.prepare("UPDATE products SET status = 'publicado' WHERE id = ?").run(r.json.produto.id);
      return ct.Produtos.obter(r.json.produto.id);
    };
    const CASCA = [{ titulo: 'Comece por aqui', aulas: [{ titulo: 'Como usar este percurso', tipo: 'texto', conteudo: 'O conteúdo está no Estude.' }] }];
    est = await criar({ titulo: 'Curso de Venda com Percurso', tipo: 'curso', categoria: 'direito', descricao_curta: 'Curso de teste da página de venda.', descricao_longa: DESCRICAO,
      preco_centavos: 98000, garantia_dias: 7, capa: { mime: 'image/png', conteudo_base64: b64(png(1920, 1080)) } }, CASCA);
    comum = await criar({ titulo: 'Curso Comum de Direito da Venda', tipo: 'curso', categoria: 'direito', descricao_curta: 'Curso comum, sem percurso.', preco_centavos: 9900 },
      [{ titulo: 'Módulo único', aulas: [{ titulo: 'Aula única em texto', tipo: 'texto', conteudo: 'Texto da aula.' }] }]);
    outra = await criar({ titulo: 'Curso de Outra Área da Venda', tipo: 'curso', categoria: 'gastronomia', descricao_curta: 'Curso de outra área.', preco_centavos: 4900,
      capa: { mime: 'image/webp', conteudo_base64: b64(WEBP) } }, CASCA);
    // o percurso: 2 disciplinas (2 + 1 aulas) e 1 aula de método; 5 questões (uma de ordem fixa) e 3 cards
    const r = await chave('POST', '/staff/api/academy/estudo/importar', E({
      escopo: { slug: SLUG, tipo: 'edital', titulo: 'Percurso da página de venda' }, programa: PROGRAMA, competencias: COMPS,
      vinculos: [['1.1.1', 'va'], ['1.1.2', 'vb'], ['1.2.1', 'vc']].map(([item, competencia]) => ({ item, competencia, justificativa: 'O item é a própria regra.' })),
      unidades: [UN('ven-a', 'Aula A da venda', 'va', '1.1.1'), UN('ven-b', 'Aula B da venda', 'vb', '1.1.2'), UN('ven-c', 'Aula C da venda', 'vc', '1.2.1'), UN('ven-m', 'Aula de método da venda', 'vm', '')],
      questoes: [Q(1, 'va', { ordem_fixa: true }), Q(2, 'va'), Q(3, 'vb'), Q(4, 'vc'), Q(5, 'vc')],
      cards: [1, 2, 3].map(i => ({ competencia: 'va', frente: `Card ${i} da venda: qual é a regra?`, verso: `A regra ${i}.` })) }));
    assert.equal(r.st, 200, r.texto);
  });

  // ================= A1 =================
  await t('A1: com o percurso ainda em RASCUNHO a página conta pela casca — e sem o "1 conteúdos"', async () => {
    assert.equal(ct.Marketplace.resumoDoEstude(est.id), null, 'percurso em rascunho não é o que se vende');
    const html = await pagina(est);
    assert.ok(html.includes('1 aula, do começo ao fim') && html.includes('Comece por aqui'), 'sem percurso publicado, vale a grade do curso');
    assert.ok(html.includes('1 conteúdo (vídeo, artigo, material)'), 'o plural acompanha o número');
    assert.ok(!html.includes('1 conteúdos') && !html.includes('1 materiais'), 'nada de "1 conteúdos"');
  });

  await t('A1: percurso publicado — aulas, videoaulas, horas de vídeo, questões, cards e disciplinas vêm do Estude; rascunho e percurso particular ficam fora', async () => {
    let r = await chave('POST', '/staff/api/academy/estudo/status', E({ escopo: SLUG, status: 'publicado', unidades: 'publicado', cards: 'publicado', questoes: 'disponivel' }));
    assert.equal(r.st, 200, r.texto);
    const eid = R.Escopos.porSlug(est.id, SLUG).id;
    const video = db.prepare('UPDATE est_unidades SET video_media_id = ?, video_duracao_seg = ? WHERE escopo_id = ? AND codigo = ?');
    video.run('video-venda-a', 3600, eid, 'ven-a'); video.run('video-venda-b', 1800, eid, 'ven-b'); video.run('video-venda-c', 600, eid, 'ven-c');
    // O QUE NÃO PODE ENTRAR NA CONTA —
    // (1) aula, questão e card em RASCUNHO dentro do percurso publicado (o que entra depois de publicar nasce em rascunho)
    r = await chave('POST', '/staff/api/academy/estudo/importar', E({ escopo: { slug: SLUG }, unidades: [UN('ven-ras', 'Aula AINDA em rascunho da venda', 'va', '1.1.1')],
      questoes: [Q(6, 'va'), Q(7, 'vb')], cards: [{ competencia: 'vb', frente: 'Card em rascunho da venda: qual é a regra?', verso: 'A regra em rascunho.' }] }));
    assert.equal(r.st, 200, r.texto);
    db.prepare("UPDATE est_unidades SET video_media_id = 'video-venda-ras', video_duracao_seg = 7200 WHERE escopo_id = ? AND codigo = 'ven-ras'").run(eid);
    // (2) um SEGUNDO percurso do curso, em rascunho, com as aulas dele já marcadas como publicadas
    r = await chave('POST', '/staff/api/academy/estudo/importar', E({ escopo: { slug: SLUG_RASCUNHO, tipo: 'edital', titulo: 'Percurso em rascunho da venda' }, programa: PROGRAMA, competencias: COMPS,
      unidades: [UN('ras-a', 'Aula do percurso em rascunho', 'va', '1.1.1'), UN('ras-b', 'Outra aula do percurso em rascunho', 'vc', '1.2.1')], questoes: [Q(8, 'va')] }));
    assert.equal(r.st, 200, r.texto);
    const eidRas = R.Escopos.porSlug(est.id, SLUG_RASCUNHO).id;
    db.prepare("UPDATE est_unidades SET status = 'publicado', video_media_id = 'video-venda-x', video_duracao_seg = 9000 WHERE escopo_id = ?").run(eidRas);
    // (3) o percurso PARTICULAR de um aluno (aqui, da própria produtora), forçado a "publicado" e com aula, vídeo, questão e card
    const particular = R.criarParticular(est, maria, 'Percurso particular da venda');
    db.prepare("UPDATE est_escopos SET status = 'publicado', versao = 1 WHERE id = ?").run(particular.id);
    db.prepare(`INSERT INTO est_unidades (id, escopo_id, codigo, ordem, titulo, competencias, itens, blocos, status, atualizado_em, video_media_id, video_duracao_seg)
      VALUES (?, ?, 'part-a', 0, 'Aula do percurso PARTICULAR', '[]', '[]', '[]', 'publicado', ?, 'video-venda-part', 5000)`).run(novoId(), particular.id, nowISO());
    const qNova = novoId();
    db.prepare(`INSERT INTO est_questoes (id, producer_id, hash, tipo, origem, uso, corrigivel, situacao, dados, criado_em, atualizado_em) VALUES (?, ?, ?, 'objetiva', 'autoral', 'pratica', 1, 'disponivel', '{}', ?, ?)`)
      .run(qNova, maria.id, 'hash-particular-venda', nowISO(), nowISO());
    db.prepare("INSERT INTO est_questao_vinculos (questao_id, escopo_id, alvo, codigo, justificativa, estado_revisao) VALUES (?, ?, 'competencia', 'x', '', 'sugerido')").run(qNova, particular.id);
    db.prepare(`INSERT INTO est_cards (id, escopo_id, codigo, ordem, competencia_codigo, frente, verso, status) VALUES (?, ?, 'card-part', 0, 'x', 'Card do percurso particular', 'verso', 'publicado')`).run(novoId(), particular.id);

    // a conta, direto na fonte
    const rs = ct.Marketplace.resumoDoEstude(est.id);
    assert.deepEqual({ percursos: rs.percursos, aulas: rs.aulas, videos: rs.videos, video_seg: rs.video_seg, questoes: rs.questoes, cards: rs.cards, disciplinas: rs.disciplinas },
      { percursos: 1, aulas: 4, videos: 3, video_seg: 6000, questoes: 5, cards: 3, disciplinas: 2 });
    assert.deepEqual(rs.grupos.map(g => [g.nome, g.aulas]), [['Direito das Coisas Vendidas', 2], ['Direito do Balcão', 1], ['Método de estudo', 1]], 'as disciplinas do programa, na ordem, com as aulas de cada uma');
    assert.equal(ct.Marketplace.resumoConteudo(est.id).total_aulas, 1, 'a casca continua lá, intacta: 1 aula');
    assert.equal(ct.Marketplace.resumoDoEstude(comum.id), null, 'curso comum não tem percurso');
    // a mesma régua do certificado: as aulas que contam para concluir são as que a página anuncia
    assert.equal(require('./estudo/aluno').conclusao(maria.id, est.id).total_aulas, rs.aulas, 'página de venda e certificado contam as mesmas aulas');

    // a página — os cinco lugares do achado
    const html = await pagina(est);
    assert.ok(/class="pv-chip">\s*<svg[^>]*>.*?<\/svg> 4 aulas<\/span>/.test(html), 'selo do topo: 4 aulas');
    assert.ok(html.includes('4 aulas, do começo ao fim'), 'caixa de compra: as aulas do percurso');
    assert.ok(html.includes('3 videoaulas · 1 h 40 min'), 'caixa de compra: videoaulas e horas de vídeo (soma de video_duracao_seg)');
    assert.ok(html.includes('5 questões para praticar') && html.includes('3 cards de revisão'), 'caixa de compra: questões disponíveis e cards publicados');
    assert.ok(html.includes('4 aulas em 2 disciplinas') && html.includes('3 videoaulas · 1 h 40 min de vídeo'), 'resumo do "Conteúdo do curso"');
    for (const [nome, n] of [['Direito das Coisas Vendidas', '2 aulas'], ['Direito do Balcão', '1 aula'], ['Método de estudo', '1 aula']]) {
      assert.ok(new RegExp(`<span>${nome}</span>\\s*<span class="dur">${n}</span>`).test(html), `"Conteúdo do curso" lista ${nome} com ${n}`);
    }
    // …e nada da casca nem do que está fora da conta
    for (const fora of ['1 aula, do começo ao fim', 'Comece por aqui', 'Como usar este percurso', 'conteúdos (vídeo', 'conteúdo (vídeo', 'conteúdo de leitura e prática',
      'rascunho da venda', 'percurso em rascunho', 'PARTICULAR', 'particular da venda', '5 aulas', '6 aulas', '7 aulas', '6 questões', '7 questões', '4 cards']) {
      assert.ok(!html.includes(fora), 'não pode aparecer na página: ' + fora);
    }
    // o JSON-LD acompanha: carga horária do vídeo do percurso e o programa por disciplina
    const ld = curso(html);
    assert.equal(ld.hasCourseInstance.courseWorkload, 'PT2H', '6.000 s de vídeo ≈ 2 h');
    assert.deepEqual(ld.syllabusSections.map(x => [x['@type'], x.name, x.description]),
      [['Syllabus', 'Direito das Coisas Vendidas', '2 aulas'], ['Syllabus', 'Direito do Balcão', '1 aula'], ['Syllabus', 'Método de estudo', '1 aula']]);
    assert.equal(ld.offers.price, '980.00'); assert.ok(!('aggregateRating' in ld), 'sem avaliação, sem nota (não regride)');
    // o curso comum segue como era
    const hc = await pagina(comum);
    assert.ok(hc.includes('1 aula, do começo ao fim') && hc.includes('Módulo único') && !('syllabusSections' in curso(hc)));
  });

  // ================= M1 =================
  await t('M1: descrição longa — "- " vira lista, linha curta isolada vira subtítulo, e HTML do produtor sai como texto', async () => {
    const html = await pagina(est);
    assert.ok(html.includes('<h3 class="pv-sub">O que é</h3>') && html.includes('<h3 class="pv-sub">O que o curso tem hoje</h3>') && html.includes('<h3 class="pv-sub">Acesso</h3>'), 'os títulos internos');
    assert.ok(html.includes('<ul class="pv-pontos"><li>251 aulas: uma para cada ponto.</li><li>Questões comentadas, alternativa por alternativa.</li>'), 'cada "- " é um item');
    assert.ok(html.includes('<p>Um percurso construído item a item sobre o programa do edital. Segunda linha do mesmo parágrafo.</p>'), 'linhas seguidas são o mesmo parágrafo');
    assert.ok(html.includes('<p>Acesso por 1 ano a partir da compra.</p>'), 'a última linha é parágrafo, mesmo curta: subtítulo tem de ter texto depois');
    // injeção: nada do que o produtor escreveu vira marcação
    assert.ok(!html.includes('<script>alert(1)') && !html.includes('<img src=x') && !html.includes('<b>Título com tag'), 'tag do produtor não chega viva à página');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && html.includes('<li>&quot;&gt;&lt;img src=x onerror=alert(2)&gt;</li>'), 'aparece como texto');
    // a função, sozinha: só saem as quatro tags que ela escreve
    const soTexto = (h) => h.replace(/<\/?(p|li)>|<\/(ul|h3)>|<ul class="pv-pontos">|<h3 class="pv-sub">/g, '');
    for (const ataque of [DESCRICAO, '<script>alert(1)</script>', '- <img src=x onerror=alert(1)>\n- </li></ul><script>x</script>', 'Título <svg onload=alert(1)>\n\ntexto',
      '"><img src=x onerror=alert(1)>\n\n\' onmouseover=\'alert(1)', '<h3 class="pv-sub">falso</h3>\n\n- <ul class="pv-pontos">', 'a\r\n\r\n- b\r\n- c']) {
      const saida = textoRico(ataque);
      assert.ok(!/[<>"']/.test(soTexto(saida)), 'fora das tags da função não sobra <, >, aspa: ' + saida.slice(0, 120));
    }
    assert.equal(textoRico('Só uma frase curta'), '<p>Só uma frase curta</p>', 'texto de uma linha só não vira subtítulo');
    assert.equal(textoRico('Título\n\n- um\n- dois\ntexto colado\n\nFim.'), '<h3 class="pv-sub">Título</h3><ul class="pv-pontos"><li>um</li><li>dois</li></ul><p>texto colado</p><p>Fim.</p>');
    assert.equal(textoRico('-sem espaço, não é item.\n\nFrase com ponto final.\n\nfim'), '<p>-sem espaço, não é item.</p><p>Frase com ponto final.</p><p>fim</p>', 'só "- " abre item; linha com ponto final não é subtítulo');
    assert.equal(textoRico('Uma linha isolada que passa bastante dos setenta caracteres não é título de nada\n\nfim'), '<p>Uma linha isolada que passa bastante dos setenta caracteres não é título de nada</p><p>fim</p>', 'linha longa não é subtítulo');
    assert.equal(textoRico(''), ''); assert.equal(textoRico(null), '');
  });

  // ================= M6 =================
  await t('M6: barra de compra presa ao rodapé em tela estreita — preço e botão, último elemento antes do <footer>, com respiro para não cobri-lo', async () => {
    const html = await pagina(est);
    const barra = (html.match(/<div class="pv-barra"[\s\S]*?<\/div>\s*<a class="pv-bt" href="([^"]*)">([^<]*)<\/a>\s*<\/div>/) || []);
    assert.ok(barra[0], 'a barra existe');
    assert.ok(barra[0].includes('<b>R$ 980,00</b>'), 'com o preço');
    assert.equal(barra[1], `/academy/checkout/${est.slug}`, 'o botão leva ao mesmo checkout dos outros dois');
    assert.ok(/Comprar agora|Quero|Matricular/.test(barra[2]));
    assert.ok(/<div class="pv-barra"[\s\S]*?<\/a>\s*<\/div>\s*<footer>/.test(html), 'é o último elemento antes do rodapé — o CSS abre o respiro nele (.pv-barra ~ footer)');
    assert.ok(html.includes('/academy/publico.css?v=2'), 'a folha mudou: versão nova no endereço');
    const css = (await req('GET', '/academy/publico.css?v=2')).texto.replace(/\s+/g, ' ');
    assert.ok(css.includes('.pv-barra{display:none}'), 'em tela larga a barra não existe (o cartão de compra já acompanha a rolagem)');
    const estreita = (css.match(/\.pv-barra\{display:none\} @media\(max-width:980px\)\{(.*?)\} @media print/) || [])[1] || '';
    assert.ok(/\.pv-barra\{display:flex;[^}]*position:fixed;[^}]*bottom:0;/.test(estreita), 'abaixo de 980 px (onde o cartão desce para o fim) ela fica fixa no rodapé da tela');
    assert.ok(/height:calc\(62px \+ env\(safe-area-inset-bottom,0px\)\)/.test(estreita) && /\.pv-barra ~ footer\{padding-bottom:calc\(30px \+ 62px \+ env\(safe-area-inset-bottom,0px\)\)\}/.test(estreita),
      'o rodapé ganha exatamente a altura da barra: ela não cobre as últimas linhas');
    // curso grátis: a barra diz "Grátis"
    db.prepare('UPDATE products SET preco_centavos = 0 WHERE id = ?').run(outra.id);
    try { assert.ok(/<div class="pv-barra-preco"><b>Grátis<\/b><\/div>/.test(await pagina(outra))); }
    finally { db.prepare('UPDATE products SET preco_centavos = 4900 WHERE id = ?').run(outra.id); }
  });

  // ================= B1 =================
  await t('B1: og:image declara a medida REAL da capa (1920×1080), a da marca (1200×630) sem capa, e nenhuma quando não sabe medir', async () => {
    const html = await pagina(est);
    assert.ok(meta(html, 'og:image').includes(`/academy/capa/${est.id}`));
    assert.deepEqual([meta(html, 'og:image:width'), meta(html, 'og:image:height')], ['1920', '1080'], 'a capa enviada é 1920×1080 — antes saía 1200×630');
    const hc = await pagina(comum);
    assert.ok(meta(hc, 'og:image').includes('/og-image.png'));
    assert.deepEqual([meta(hc, 'og:image:width'), meta(hc, 'og:image:height')], ['1200', '630'], 'sem capa: o cartão da marca, que é 1200×630 de verdade');
    const marca = require('fs').readFileSync(require('path').join(__dirname, '..', 'assets', 'brand', 'villela-academy', 'og-image.png'));
    assert.deepEqual(dimensoesDaImagem(marca), { largura: 1200, altura: 630 }, 'conferido no arquivo, não de memória');
    const ho = await pagina(outra);
    assert.ok(meta(ho, 'og:image').includes(`/academy/capa/${outra.id}`), 'a capa em WebP continua sendo a imagem');
    assert.ok(!ho.includes('og:image:width') && !ho.includes('og:image:height'), 'formato que não se sabe medir: dimensão OMITIDA, não inventada');
    assert.deepEqual(dimensoesDaImagem(jpeg(1280, 720)), { largura: 1280, altura: 720 }, 'JPEG: lido do SOF');
    assert.equal(dimensoesDaImagem(WEBP), null); assert.equal(dimensoesDaImagem(Buffer.from('PNGfake')), null); assert.equal(dimensoesDaImagem(null), null);
  });

  // ================= B2 =================
  await t('B2: o aviso do que o preço inclui só promete o que o curso tem — percurso do Estude: questões e caderno de erros; curso comum: quiz só quando há quiz publicado', async () => {
    assert.equal(inclusoNoPreco(est), 'O curso, as aulas, as videoaulas, as questões, o caderno de erros e o certificado estão incluídos no preço.');
    assert.equal(inclusoNoPreco(comum), 'O curso, os vídeos, os materiais e o certificado estão incluídos no preço.');
    // o aviso só aparece com a cobrança de IA ligada: liga, confere a página e o checkout, e devolve a config como estava
    const antes = db.prepare("SELECT valor FROM platform_settings WHERE chave = 'ia_cobranca'").get();
    const aula = db.prepare('SELECT id FROM lessons WHERE product_id = ? LIMIT 1').get(comum.id).id;
    try {
      repo.Config.salvar('ia_cobranca', { ...(repo.Config.obter('ia_cobranca', {}) || {}), ativa: true });
      for (const rota of [`/academy/cursos/${est.slug}`, `/academy/checkout/${est.slug}`]) {
        const html = (await req('GET', rota)).texto;
        assert.ok(html.includes('pagos à parte, por uso') && html.includes('as questões, o caderno de erros e o certificado estão incluídos no preço.'), rota);
        assert.ok(!html.includes('o quiz'), rota + ': este curso não tem o quiz da Academy');
      }
      for (const rota of [`/academy/cursos/${comum.slug}`, `/academy/checkout/${comum.slug}`]) {
        const html = (await req('GET', rota)).texto;
        assert.ok(html.includes('O curso, os vídeos, os materiais e o certificado estão incluídos no preço.') && !html.includes('o quiz'), rota + ': sem quiz, sem promessa de quiz');
      }
      // quiz em RASCUNHO o aluno não vê: ainda não se promete; publicado, entra na frase
      db.prepare("INSERT INTO aula_quiz (lesson_id, product_id, questoes, status, atualizado_em) VALUES (?, ?, '[]', 'rascunho', ?)").run(aula, comum.id, nowISO());
      assert.ok(!(await req('GET', `/academy/checkout/${comum.slug}`)).texto.includes('o quiz'));
      db.prepare("UPDATE aula_quiz SET status = 'publicado' WHERE lesson_id = ?").run(aula);
      for (const rota of [`/academy/cursos/${comum.slug}`, `/academy/checkout/${comum.slug}`]) {
        assert.ok((await req('GET', rota)).texto.includes('O curso, os vídeos, os materiais, o quiz e o certificado estão incluídos no preço.'), rota + ': com quiz publicado, o quiz está na frase');
      }
    } finally {
      db.prepare('DELETE FROM aula_quiz WHERE lesson_id = ?').run(aula);
      if (antes) db.prepare("UPDATE platform_settings SET valor = ? WHERE chave = 'ia_cobranca'").run(antes.valor);
      else db.prepare("DELETE FROM platform_settings WHERE chave = 'ia_cobranca'").run();
    }
    assert.ok(!(await pagina(est)).includes('pagos à parte, por uso') || !!(repo.Config.obter('ia_cobranca', {}) || {}).ativa, 'a config voltou ao que era');
    // o texto LEGAL não foi tocado (decisão do dono)
    assert.ok((await req('GET', '/academy/creditos-ia')).texto.includes('inclui as aulas, os vídeos, os materiais, o quiz, o caderno, a jornada e o certificado'));
  });

  // ================= B5 =================
  await t('B5: checkout, obrigado, obrigado-assinatura, verificar-email e redefinir-senha saem com noindex; a página do curso e a vitrine continuam indexáveis', async () => {
    for (const rota of [`/academy/checkout/${est.slug}`, '/academy/obrigado', '/academy/obrigado?pedido=x', '/academy/obrigado-assinatura', '/academy/verificar-email', '/academy/verificar-email?token=abc', '/academy/redefinir-senha', '/academy/redefinir-senha?token=abc']) {
      const r = await req('GET', rota);
      assert.equal(r.st, 200, rota);
      assert.equal(robots(r.texto), 'noindex,nofollow', rota);
      assert.ok(!r.texto.includes('rel="canonical"'), rota + ': sem canonical — página de passagem não tem endereço para o buscador');
    }
    for (const rota of [`/academy/cursos/${est.slug}`, '/academy/marketplace', `/academy/produtores/${repo.Perfis.produtor(maria.id).slug}`]) {
      assert.equal(robots((await req('GET', rota)).texto), 'index,follow,max-image-preview:large', rota + ' continua no buscador');
    }
    assert.ok((await pagina(est)).includes(`<link rel="canonical" href="https://academia.villelastay.com.br/academy/cursos/${est.slug}">`) || /rel="canonical" href="[^"]*\/academy\/cursos\//.test(await pagina(est)), 'a página do curso mantém o canonical');
  });

  // ================= B4 =================
  await t('B4: 404 de curso, de checkout, de produtor e de certificado — sem a faixa MINUTA, sem eco do que veio na URL, fora do buscador; as páginas legais continuam com a faixa', async () => {
    const casos = [['/academy/cursos/curso-que-nao-existe', 'Curso não encontrado'], ['/academy/checkout/curso-que-nao-existe', 'Curso não encontrado'],
      ['/academy/produtores/produtor-que-nao-existe', 'Produtor não encontrado'], ['/academy/certificados/CODIGO-QUE-NAO-EXISTE', 'Certificado não encontrado'],
      ['/academy/certificados/' + encodeURIComponent('<script>alert(1)</script>'), 'Certificado não encontrado'], ['/academy/cursos/' + encodeURIComponent('"><img src=x onerror=alert(1)>'), 'Curso não encontrado']];
    for (const [rota, titulo] of casos) {
      const r = await req('GET', rota);
      assert.equal(r.st, 404, rota);
      assert.ok(r.texto.includes(`>${titulo}</h1>`), rota + ': diz o que não foi encontrado');
      assert.ok(!r.texto.includes('MINUTA') && !r.texto.includes('documento em elaboração'), rota + ': erro não é minuta');
      assert.equal(robots(r.texto), 'noindex,nofollow', rota);
      assert.ok(!r.texto.includes('alert(1)') && !r.texto.includes('NAO-EXISTE') && !r.texto.includes('nao-existe'), rota + ': o que veio na URL não volta na página');
      assert.ok(r.texto.includes('href="/academy/marketplace"'), rota + ': tem saída para o catálogo');
    }
    // curso em RASCUNHO responde como inexistente (não vaza)
    db.prepare("UPDATE products SET status = 'rascunho' WHERE id = ?").run(outra.id);
    try { const r = await req('GET', `/academy/cursos/${outra.slug}`); assert.equal(r.st, 404); assert.ok(!r.texto.includes('Outra Área')); }
    finally { db.prepare("UPDATE products SET status = 'publicado' WHERE id = ?").run(outra.id); }
    for (const rota of ['/academy/termos', '/academy/privacidade', '/academy/reembolso', '/academy/creditos-ia', '/academy/termos-produtor', '/academy/termos-afiliado']) {
      const r = await req('GET', rota);
      assert.ok(r.st === 200 && r.texto.includes('<b>MINUTA</b>'), rota + ': a faixa das páginas legais fica (decisão do dono)');
    }
  });

  // ================= B6 =================
  await t('B6: "Cursos relacionados" só traz curso da mesma área — sem nenhum, a seção some; e o JSON-LD não marca a organização como Person', async () => {
    const cartoes = (html) => { const sec = (html.match(/<div class="pv-rel">([\s\S]*?)<div class="pv-barra"/) || [])[1] || ''; return [...sec.matchAll(/<a class="cardp" href="\/academy\/cursos\/([^"]+)"/g)].map(m => m[1]); };
    const areaDe = (slug) => { const p = ct.Marketplace.porSlug(slug); return p.categorias && p.categorias.length ? p.categorias : [p.categoria]; };
    const html = await pagina(est);
    const rel = cartoes(html);
    assert.ok(rel.length > 0 && rel.length <= 3 && html.includes('Cursos relacionados') && html.includes('Da mesma área: Direito.'), 'há curso de Direito para mostrar');
    assert.ok(rel.every(s => areaDe(s).includes('direito')), 'todos os relacionados são de Direito: ' + rel.join(', '));
    assert.ok(!rel.includes(outra.slug) && !rel.includes(est.slug), 'nem o curso de outra área, nem ele mesmo');
    assert.ok(!html.includes('De quem estuda o mesmo assunto'), 'a frase que prometia o que a lista não cumpria saiu');
    // a regra, na fonte: sem ninguém da área, lista vazia (antes: os três mais recentes do catálogo)
    const semArea = { excluir: [est.id], categorias: ['area-que-nao-existe'], tags: [], produtores: [], n: 3 };
    assert.deepEqual(ct.Marketplace.recomendados({ ...semArea, soDaCategoria: true }), []);
    assert.ok(ct.Marketplace.recomendados(semArea).length > 0, 'sem a trava (biblioteca do aluno), o catálogo recente continua valendo');
    // na página: o curso que fica sozinho na área não mostra a seção
    const antiga = db.prepare('SELECT categoria FROM products WHERE id = ?').get(outra.id).categoria;
    const sozinha = 'area-so-deste-teste';
    db.prepare('UPDATE products SET categoria = ? WHERE id = ?').run(sozinha, outra.id);
    db.prepare('DELETE FROM product_categories WHERE product_id = ?').run(outra.id);
    try {
      const ho = await pagina(outra);
      assert.deepEqual(cartoes(ho), []); assert.ok(!ho.includes('class="pv-rel"') && !ho.includes('Cursos relacionados'), 'sem curso da mesma área, a seção não aparece');
      // curso SEM área nenhuma: cai no catálogo, e o título diz isso
      db.prepare("UPDATE products SET categoria = '' WHERE id = ?").run(outra.id);
      const hs = await pagina(outra);
      assert.ok(hs.includes('Outros cursos da Villela Academy') && hs.includes('Os mais recentes do catálogo.') && !hs.includes('Cursos relacionados') && cartoes(hs).length > 0);
    } finally { db.prepare('UPDATE products SET categoria = ? WHERE id = ?').run(antiga, outra.id); }

    // JSON-LD: produtor pessoa = Person; curso da casa ("Villela Academy") = Organization
    const perfil = repo.Perfis.produtor(maria.id);
    let ld = curso(await pagina(est));
    assert.deepEqual([ld.author['@type'], ld.author.name, ld.hasCourseInstance.instructor['@type']], ['Person', perfil.nome_publico, 'Person']);
    db.prepare("UPDATE producer_profiles SET nome_publico = 'Villela Academy' WHERE user_id = ?").run(maria.id);
    try {
      ld = curso(await pagina(est));
      assert.deepEqual([ld.author['@type'], ld.author.name, ld.hasCourseInstance.instructor['@type'], ld.hasCourseInstance.instructor.name], ['Organization', 'Villela Academy', 'Organization', 'Villela Academy']);
      assert.equal(ld.provider['@type'], 'Organization');
    } finally { db.prepare('UPDATE producer_profiles SET nome_publico = ? WHERE user_id = ?').run(perfil.nome_publico, maria.id); }
  });

  // ================= B9 =================
  await t('B9: a rota de staff das questões devolve `ordem_fixa` de cada uma (booleano)', async () => {
    const r = await req('GET', `/staff/api/academy/estudo/questoes?produtor_email=${PROD}&produto_id=${est.id}&escopo=${SLUG}`, { semUser: true, chave: true });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.questoes.length, 7, 'as 5 disponíveis e as 2 em rascunho do percurso');
    assert.ok(r.json.questoes.every(q => typeof q.ordem_fixa === 'boolean'), 'o campo vem em todas');
    const fixa = db.prepare("SELECT id FROM est_questoes WHERE dados LIKE '%Página de venda, questão 1:%'").get().id;
    assert.deepEqual(r.json.questoes.filter(q => q.ordem_fixa).map(q => q.id), [fixa], 'só a questão importada com ordem fixa');
    // os campos de antes continuam (quem importa confere órfã pelo hash)
    for (const k of ['id', 'hash', 'origem', 'situacao', 'uso', 'versao', 'atualizado_em', 'itens']) assert.ok(k in r.json.questoes[0], k);
    assert.equal((await req('GET', `/staff/api/academy/estudo/questoes?produtor_email=${PROD}&produto_id=${est.id}&escopo=${SLUG}`, { semUser: true })).st, 401, 'sem chave e sem sessão: 401');
  });
}

module.exports = { rodar };
