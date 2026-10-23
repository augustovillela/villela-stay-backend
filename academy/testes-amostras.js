// =====================================================================
// Villela Academy — AMOSTRAS GRÁTIS · testes. Chamado pelo selftest
// (npm run test:academy). Cria os próprios cursos (um publicado, um em
// rascunho, um sem amostra) em nome da Maria, produtora já aprovada.
// As rotas são as reais; só o bucket do último bloco é falso.
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function rodar({ t, req, base, emailProdutor }) {
  const { db } = require('./db');
  const repo = require('./repo');
  const ct = require('./repo-conteudo');
  const storage = require('./storage');
  const am = require('./amostras');
  const { faixaDe } = require('./rotas-amostras');

  console.log('\n— amostras grátis: envio idempotente, porta pública, Range, CORS, página de venda —');
  const maria = repo.Usuarios.porEmail(emailProdutor);
  const novoCurso = (titulo, status) => {
    const p = ct.Produtos.criar(maria.id, { titulo, descricao_curta: 'Curso de teste das amostras.', preco_centavos: 9900 });
    db.prepare('UPDATE products SET status = ? WHERE id = ?').run(status, p.id);
    return ct.Produtos.obter(p.id);
  };
  const NO_AR = novoCurso('Curso com Amostras No Ar', 'publicado');
  const RASCUNHO = novoCurso('Curso com Amostras em Rascunho', 'rascunho');
  const SEM = novoCurso('Curso Publicado sem Amostra', 'publicado');
  // a grade: nos cursos da casa o módulo "Aula NN — ..." é a aula
  ct.Conteudo.addModulo(NO_AR.id, 'Aula 01 — Por onde começar');
  const modPago = ct.Conteudo.addModulo(NO_AR.id, 'Aula 02 — O que quase ninguém conta');
  // um vídeo de aula PAGA, do jeito que a Academy guarda: arquivo no storage + media_files + aula
  const MEDIA_PAGA = 'vidPagoTeste1';
  const SEGREDO = Buffer.from('CONTEUDO-DA-AULA-PAGA-' + 'x'.repeat(200));
  fs.writeFileSync(storage.caminhoLocal(MEDIA_PAGA + '.mp4'), SEGREDO);
  db.prepare("INSERT INTO media_files (id, owner_user_id, nome, mime, tamanho, file_path, storage, confirmado, criado_em) VALUES (?, ?, 'aula-paga.mp4', 'video/mp4', ?, ?, 'local', 1, ?)")
    .run(MEDIA_PAGA, maria.id, SEGREDO.length, MEDIA_PAGA + '.mp4', new Date().toISOString());
  const aulaPaga = ct.Conteudo.addAula(NO_AR.id, modPago, { titulo: '2.1 Aula paga', tipo: 'video', media_id: MEDIA_PAGA });

  // MP4 de mentira: basta a caixa "ftyp" no começo (é o que a validação confere) + bytes reconhecíveis
  const mp4 = (marca, n = 600) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.from(String(marca).repeat(n))]);
  const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.from('capa-de-teste-jpeg')]);
  const b64 = (b) => b.toString('base64');
  const corpo = (produto, amostras) => ({ produtor_email: emailProdutor, produto_id: produto.id, amostras });
  const enviar = (produto, amostras, opc = {}) => req('POST', '/staff/api/academy/amostras/importar', { semUser: true, chave: true, corpo: corpo(produto, amostras), ...opc });
  const item = (aula, extra = {}) => ({
    aula, chamada: `Chamada da aula ${aula}`, ponte: `No curso, o resto da aula ${aula}.`, duracao: 38.6,
    video: { mime: 'video/mp4', conteudo_base64: b64(mp4('A' + aula)) }, capa: { mime: 'image/jpeg', conteudo_base64: b64(JPG) }, ...extra,
  });
  const linhas = (produto) => db.prepare('SELECT * FROM amostras WHERE product_id = ? ORDER BY aula_num').all(produto.id);
  const arquivosDe = (produto) => {
    const dir = path.join(storage.ARQUIVOS_DIR, 'amostras', produto.id);
    return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  };
  const pagina = async (produto) => (await fetch(`${base()}/academy/cursos/${produto.slug}`)).text();
  const cache = (r) => r.headers.get('cache-control') || '';

  // fotografia das páginas ANTES de existir qualquer amostra — é a "página de hoje"
  const paginaAntes = await pagina(NO_AR);
  const semAntes = await pagina(SEM);
  const vitrineAntes = await (await fetch(`${base()}/academy/marketplace`)).text();

  await t('amostras: importar exige PUBLISH_KEY ou admin; operador comum e anônimo ficam de fora', async () => {
    assert.equal((await req('POST', '/staff/api/academy/amostras/importar', { semUser: true, corpo: corpo(NO_AR, [item(1)]) })).st, 401);
    assert.equal((await req('POST', '/staff/api/academy/amostras/importar', { user: 'op', corpo: corpo(NO_AR, [item(1)]) })).st, 403);
    assert.equal((await req('GET', `/staff/api/academy/amostras?produtor_email=${emailProdutor}&produto_id=${NO_AR.id}`, { semUser: true })).st, 401);
    assert.equal((await req('POST', '/staff/api/academy/amostras/remover', { semUser: true, corpo: { ...corpo(NO_AR), aula: 1 } })).st, 401);
    assert.equal(linhas(NO_AR).length, 0, 'nada foi gravado pelas tentativas recusadas');
    const outro = await enviar(NO_AR, [item(1)], { corpo: { produtor_email: 'ninguem@t.com', produto_id: NO_AR.id, amostras: [item(1)] } });
    assert.equal(outro.st, 400, 'produtor que não é o dono do curso não envia');
  });

  let id1 = '';
  await t('amostras: envio em lote cria uma por aula, com vídeo e capa sob o prefixo próprio', async () => {
    const r = await enviar(NO_AR, [item(1), item(2)]);
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.resumo, { criadas: 2, atualizadas: 0, arquivos_trocados: 0 });
    assert.equal(r.json.visivel_ao_publico, true);
    assert.equal(r.json.amostras.length, 2);
    const a = r.json.amostras[0];
    id1 = a.id;
    assert.equal(a.aula, 1); assert.equal(a.chave, 'aula-1'); assert.equal(a.titulo, 'Chamada da aula 1');
    assert.equal(a.duracao_seg, 39, 'duração fracionada do trechos.json é arredondada');
    assert.equal(a.aula_titulo, 'Aula 01 — Por onde começar', 'o título da aula vem do módulo da grade');
    for (const l of linhas(NO_AR)) {
      assert.ok(l.video_path.startsWith(`amostras/${NO_AR.id}/`), 'vídeo no prefixo das amostras: ' + l.video_path);
      assert.ok(l.capa_path.startsWith(`amostras/${NO_AR.id}/`), 'capa no prefixo das amostras');
      assert.ok(fs.existsSync(storage.caminhoLocal(l.video_path)) && fs.existsSync(storage.caminhoLocal(l.capa_path)));
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM media_files WHERE file_path LIKE 'amostras/%'").get().n, 0, 'amostra NÃO entra em media_files (a tabela das aulas)');
    const lista = await req('GET', `/staff/api/academy/amostras?produtor_email=${emailProdutor}&produto_id=${NO_AR.id}`, { semUser: true, chave: true });
    assert.equal(lista.st, 200); assert.equal(lista.json.amostras.length, 2);
  });

  await t('amostras: reenviar a mesma aula SUBSTITUI (mesmo id, versão +1, arquivo antigo sai); só o texto não mexe no arquivo', async () => {
    const antes = linhas(NO_AR)[0];
    const r = await enviar(NO_AR, [item(1, { chamada: 'Chamada nova da aula 1', video: { mime: 'video/mp4', conteudo_base64: b64(mp4('NOVO')) } })]);
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.resumo, { criadas: 0, atualizadas: 1, arquivos_trocados: 1 });
    const depois = linhas(NO_AR);
    assert.equal(depois.length, 2, 'não duplicou');
    assert.equal(depois[0].id, antes.id, 'a identidade (produto, aula) manteve o id — a URL pública continua a mesma');
    assert.equal(depois[0].versao, antes.versao + 1);
    assert.notEqual(depois[0].video_path, antes.video_path);
    assert.ok(!fs.existsSync(storage.caminhoLocal(antes.video_path)), 'o vídeo antigo saiu do storage');
    assert.equal(arquivosDe(NO_AR).length, 4, '2 vídeos + 2 capas, sem sobra: ' + arquivosDe(NO_AR).join(', '));
    const bytes = Buffer.from(await (await fetch(`${base()}/academy/api/amostras/${antes.id}/video.mp4`)).arrayBuffer());
    assert.ok(bytes.equals(mp4('NOVO')), 'a rota pública entrega o vídeo NOVO');

    // o MESMO envio de novo (mesmos bytes): nada troca, a versão — que é a chave de cache — não sobe
    const igual = await enviar(NO_AR, [item(1, { chamada: 'Chamada nova da aula 1', video: { mime: 'video/mp4', conteudo_base64: b64(mp4('NOVO')) } })]);
    assert.deepEqual(igual.json.resumo, { criadas: 0, atualizadas: 1, arquivos_trocados: 0 });
    assert.equal(linhas(NO_AR)[0].versao, antes.versao + 1, 'reenvio idêntico não sobe a versão');
    assert.equal(linhas(NO_AR)[0].video_path, depois[0].video_path, 'nem troca o arquivo');
    assert.equal(arquivosDe(NO_AR).length, 4);
    assert.ok(igual.json.amostras[0].video_url.startsWith('https://'), 'a resposta de quem envia traz a URL pública absoluta');

    const soTexto = await enviar(NO_AR, [{ aula: 1, ponte: 'Ponte reescrita.' }]);
    assert.equal(soTexto.st, 200, soTexto.texto);
    const l = linhas(NO_AR)[0];
    assert.equal(l.ponte, 'Ponte reescrita.'); assert.equal(l.chamada, 'Chamada nova da aula 1', 'o que não veio fica');
    assert.equal(l.versao, antes.versao + 1, 'sem arquivo novo a versão não sobe');
    assert.equal(l.video_path, depois[0].video_path);
  });

  await t('amostras: envio inválido é recusado INTEIRO — erro no 2º item não grava o 1º nem deixa arquivo órfão', async () => {
    const arquivos = arquivosDe(NO_AR).join('|');
    const ruim = async (amostras, trecho) => {
      const r = await enviar(NO_AR, amostras);
      assert.equal(r.st, 400, 'deveria recusar: ' + trecho);
      assert.ok(r.json.erro.includes(trecho), `erro "${r.json.erro}" devia citar "${trecho}"`);
    };
    await ruim([item(7), { aula: 8, chamada: 'sem vídeo', duracao: 30 }], 'amostra 2: amostra nova precisa do vídeo');
    await ruim([item(7), item(8, { video: { mime: 'video/mp4', conteudo_base64: b64(Buffer.from('isto não é mp4, é texto puro')) } })], 'não é um MP4 válido');
    await ruim([item(7, { video: { mime: 'application/pdf', conteudo_base64: b64(mp4('x')) } })], 'precisa ser MP4');
    await ruim([item(7, { duracao: 900 })], 'o limite é 180 s');
    await ruim([item(7, { capa: { mime: 'image/jpeg', conteudo_base64: b64(Buffer.from('<svg onload=alert(1)>')) } })], 'não é uma imagem válida');
    await ruim([item(7), item(7)], 'aparece duas vezes');
    await ruim([item(7, { chamada: '' })], 'precisa da "chamada"');
    assert.equal(linhas(NO_AR).length, 2, 'nenhuma linha nova');
    assert.equal(arquivosDe(NO_AR).join('|'), arquivos, 'nenhum arquivo novo no storage');
  });

  await t('amostras: API pública lista as amostras do curso PUBLICADO pelo slug, com URLs absolutas', async () => {
    const r = await fetch(`${base()}/academy/api/cursos/${NO_AR.slug}/amostras`);
    assert.equal(r.status, 200);
    assert.ok(cache(r).includes('public') && cache(r).includes('max-age'), 'lista cacheável: ' + cache(r));
    const j = await r.json();
    assert.equal(j.curso.slug, NO_AR.slug);
    assert.ok(/^https:\/\/[^/]+\/academy\/cursos\//.test(j.curso.url));
    assert.equal(j.amostras.length, 2);
    const a = j.amostras[0];
    assert.deepEqual(Object.keys(a).sort(), ['aula', 'aula_titulo', 'capa_url', 'duracao_seg', 'id', 'ordem', 'ponte', 'titulo', 'video_mime', 'video_url'].sort(),
      'só o que é público — nada de caminho de storage nem chave interna');
    assert.ok(/^https:\/\/[^/]+\/academy\/api\/amostras\/[\w-]+\/video\.mp4\?v=\d+$/.test(a.video_url), a.video_url);
    assert.ok(/\/capa\.jpg\?v=\d+$/.test(a.capa_url), a.capa_url);
    assert.equal(a.titulo, 'Chamada nova da aula 1'); assert.equal(a.ponte, 'Ponte reescrita.'); assert.equal(a.aula, 1);
    const vazio = await fetch(`${base()}/academy/api/cursos/${SEM.slug}/amostras`);
    assert.equal(vazio.status, 200); assert.deepEqual((await vazio.json()).amostras, [], 'curso publicado sem amostra: lista vazia, não erro');
    const nada = await fetch(`${base()}/academy/api/cursos/slug-que-nao-existe/amostras`);
    assert.equal(nada.status, 404); assert.ok(!cache(nada).includes('max-age'), '404 sem cache');
  });

  await t('amostras: a rota pública entrega vídeo e capa sem login, com tipo certo e cache longo só no sucesso', async () => {
    const l = linhas(NO_AR)[0];
    const v = await fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4?v=${l.versao}`);
    assert.equal(v.status, 200);
    assert.equal(v.headers.get('content-type'), 'video/mp4');
    assert.equal(v.headers.get('accept-ranges'), 'bytes', 'o <video> precisa saber que pode pedir pedaços');
    assert.equal(Number(v.headers.get('content-length')), l.video_tamanho);
    assert.ok(cache(v).includes('max-age=31536000') && cache(v).includes('immutable'), 'com ?v= da versão atual, cache longo: ' + cache(v));
    assert.ok(Buffer.from(await v.arrayBuffer()).equals(mp4('NOVO')));
    const semV = await fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4`);
    assert.ok(cache(semV).includes('max-age=3600') && !cache(semV).includes('immutable'), 'sem a chave de versão, cache curto: ' + cache(semV));
    const velha = await fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4?v=${l.versao - 1}`);
    assert.ok(!cache(velha).includes('immutable'), 'versão antiga na URL não ganha cache eterno com o arquivo novo');
    const c = await fetch(`${base()}/academy/api/amostras/${l.id}/capa.jpg?v=${l.versao}`);
    assert.equal(c.status, 200); assert.equal(c.headers.get('content-type'), 'image/jpeg');
    assert.ok(Buffer.from(await c.arrayBuffer()).equals(JPG));
    const cabeca = await fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4`, { method: 'HEAD' });
    assert.equal(cabeca.status, 200); assert.equal(Number(cabeca.headers.get('content-length')), l.video_tamanho);
    const condicional = await fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4`, { headers: { 'If-None-Match': v.headers.get('etag') } });
    assert.equal(condicional.status, 304);
    for (const ruim of [`/academy/api/amostras/nao-existe/video.mp4`, `/academy/api/amostras/nao-existe/capa.jpg`]) {
      const r = await fetch(base() + ruim);
      assert.equal(r.status, 404); assert.ok(!cache(r).includes('max-age'), `404 não pode ser cacheado, veio: ${cache(r)}`);
    }
  });

  await t('amostras: Range — o player busca pedaços (206, Content-Range) e pedido fora do arquivo dá 416 sem cache', async () => {
    const l = linhas(NO_AR)[0];
    const inteiro = mp4('NOVO');
    const pede = (faixa) => fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4?v=${l.versao}`, { headers: { Range: faixa } });
    const confere = async (faixa, ini, fim) => {
      const r = await pede(faixa);
      assert.equal(r.status, 206, faixa);
      assert.equal(r.headers.get('content-range'), `bytes ${ini}-${fim}/${inteiro.length}`, faixa);
      assert.equal(Number(r.headers.get('content-length')), fim - ini + 1);
      assert.ok(Buffer.from(await r.arrayBuffer()).equals(inteiro.subarray(ini, fim + 1)), 'os bytes do pedaço: ' + faixa);
      assert.ok(cache(r).includes('max-age'), 'pedaço também é cacheável');
    };
    await confere('bytes=0-9', 0, 9);
    await confere('bytes=100-', 100, inteiro.length - 1);
    await confere('bytes=-16', inteiro.length - 16, inteiro.length - 1);
    await confere(`bytes=10-${inteiro.length + 999}`, 10, inteiro.length - 1);
    const fora = await pede(`bytes=${inteiro.length + 5}-`);
    assert.equal(fora.status, 416);
    assert.equal(fora.headers.get('content-range'), `bytes */${inteiro.length}`);
    assert.ok(!cache(fora).includes('max-age'), '416 não herda o cache do sucesso: ' + cache(fora));
    assert.equal((await pede('linhas=1-2')).status, 200, 'Range malformado é ignorado: arquivo inteiro');
    // a função pura, nos cantos
    assert.equal(faixaDe('', 10), null); assert.equal(faixaDe('bytes=0-1,4-5', 10), null);
    assert.equal(faixaDe('bytes=10-', 10), false); assert.equal(faixaDe('bytes=-0', 10), false);
    assert.deepEqual(faixaDe('bytes=-99', 10), { ini: 0, fim: 9 });
  });

  await t('amostras: a rota pública NÃO serve mídia de aula — nem pelo id do vídeo pago, nem com a linha adulterada', async () => {
    const mediaId = MEDIA_PAGA, aula = aulaPaga;
    assert.equal(db.prepare('SELECT media_id FROM lessons WHERE id = ?').get(aula).media_id, mediaId, 'a aula paga existe e aponta para o vídeo');
    const tentativas = [mediaId, aula, modPago, NO_AR.id, mediaId + '.mp4', encodeURIComponent('../' + mediaId)];
    for (const x of tentativas) {
      for (const arq of ['video.mp4', 'capa.jpg']) {
        const r = await fetch(`${base()}/academy/api/amostras/${x}/${arq}`);
        assert.equal(r.status, 404, `id "${x}" (${arq}) tinha de dar 404, deu ${r.status}`);
        assert.ok(!Buffer.from(await r.arrayBuffer()).includes(Buffer.from('CONTEUDO-DA-AULA-PAGA')), 'nenhum byte da aula saiu');
      }
    }
    // a aula continua onde sempre esteve: privada (sem sessão, a rota de mídia nem responde o arquivo)
    const priv = await fetch(`${base()}/academy/api/media/${mediaId}`, { redirect: 'manual' });
    assert.ok(priv.status === 401 || priv.status === 403, 'mídia de aula segue exigindo login: ' + priv.status);
    // cinto e suspensório: linha de amostra apontando para o arquivo da aula → 404, não o vídeo
    const l = linhas(NO_AR)[0];
    for (const alvo of [mediaId + '.mp4', '../' + mediaId + '.mp4', 'amostras/../' + mediaId + '.mp4']) {
      db.prepare('UPDATE amostras SET video_path = ? WHERE id = ?').run(alvo, l.id);
      const r = await fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4`);
      assert.equal(r.status, 404, `caminho "${alvo}" fora do prefixo tinha de dar 404`);
    }
    db.prepare('UPDATE amostras SET video_path = ? WHERE id = ?').run(l.video_path, l.id);
    assert.equal((await fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4`)).status, 200, 'restaurada, volta a servir');
  });

  await t('amostras: curso em rascunho guarda a amostra mas não lista nem entrega; publicar libera; pausar recolhe', async () => {
    const r = await enviar(RASCUNHO, [item(1)]);
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.visivel_ao_publico, false, 'a resposta avisa que ainda não aparece');
    const idR = r.json.amostras[0].id;
    const lista = await fetch(`${base()}/academy/api/cursos/${RASCUNHO.slug}/amostras`);
    assert.equal(lista.status, 404, 'rascunho → 404 na lista');
    assert.ok(!cache(lista).includes('max-age'));
    for (const arq of ['video.mp4', 'capa.jpg']) {
      const b = await fetch(`${base()}/academy/api/amostras/${idR}/${arq}`);
      assert.equal(b.status, 404, `rascunho → 404 em ${arq}`);
      assert.ok(!cache(b).includes('max-age'), 'e o 404 não fica guardado para depois da publicação');
    }
    db.prepare("UPDATE products SET status = 'publicado' WHERE id = ?").run(RASCUNHO.id);
    assert.equal((await fetch(`${base()}/academy/api/cursos/${RASCUNHO.slug}/amostras`)).status, 200);
    assert.equal((await fetch(`${base()}/academy/api/amostras/${idR}/video.mp4`)).status, 200);
    for (const st of ['pausado', 'suspenso', 'removido', 'em_revisao']) {
      db.prepare('UPDATE products SET status = ? WHERE id = ?').run(st, RASCUNHO.id);
      assert.equal((await fetch(`${base()}/academy/api/amostras/${idR}/video.mp4`)).status, 404, `curso ${st} recolhe a amostra`);
      assert.equal((await fetch(`${base()}/academy/api/cursos/${RASCUNHO.slug}/amostras`)).status, 404);
    }
    db.prepare("UPDATE products SET status = 'rascunho' WHERE id = ?").run(RASCUNHO.id);
  });

  await t('amostras: CORS — preflight e leitura a partir do site do grupo; origem estranha não ganha cabeçalho', async () => {
    const l = linhas(NO_AR)[0];
    const alvos = [`/academy/api/cursos/${NO_AR.slug}/amostras`, `/academy/api/amostras/${l.id}/video.mp4`, `/academy/api/amostras/${l.id}/capa.jpg`];
    for (const origem of ['https://villelastay.com.br', 'https://www.villelastay.com.br']) {
      for (const alvo of alvos) {
        const pre = await fetch(base() + alvo, { method: 'OPTIONS', headers: { Origin: origem, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range' } });
        assert.equal(pre.status, 204, 'preflight de ' + alvo);
        assert.equal(pre.headers.get('access-control-allow-origin'), origem);
        assert.ok(/GET/.test(pre.headers.get('access-control-allow-methods') || ''));
        assert.ok(/range/i.test(pre.headers.get('access-control-allow-headers') || ''), 'o pedido com Range é aceito');
        const r = await fetch(base() + alvo, { headers: { Origin: origem } });
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('access-control-allow-origin'), origem, alvo);
        assert.ok(/origin/i.test(r.headers.get('vary') || ''), 'resposta cacheável que muda por origem precisa de Vary: Origin');
      }
    }
    for (const alvo of alvos) {
      const r = await fetch(base() + alvo, { headers: { Origin: 'https://site-estranho.example' } });
      assert.equal(r.status, 200, 'público continua público (o <video> não depende de CORS)');
      assert.equal(r.headers.get('access-control-allow-origin'), null, 'mas origem estranha não recebe o cabeçalho');
      assert.ok(/origin/i.test(r.headers.get('vary') || ''));
      const semOrigem = await fetch(base() + alvo);
      assert.equal(semOrigem.headers.get('access-control-allow-origin'), null);
    }
    const v = await fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4`, { headers: { Origin: 'https://villelastay.com.br' } });
    assert.equal(v.headers.get('cross-origin-resource-policy'), 'cross-origin', 'o blog pode embutir o vídeo');
  });

  await t('amostras: página de venda ganha a seção "Amostras grátis" (toca no lugar, preload none, sem autoplay) e o texto é escapado', async () => {
    await enviar(NO_AR, [{ aula: 2, chamada: 'Aula <script>alert(1)</script> "dois"', ponte: 'Ponte com <b>marcação</b> & e-comercial.' }]);
    const html = await pagina(NO_AR);
    assert.ok(html.includes('<section class="pv-sec" id="amostras"><h2>Amostras grátis</h2>'), 'o rótulo é "Amostras grátis"');
    const secao = html.slice(html.indexOf('id="amostras"'), html.indexOf('</section>', html.indexOf('id="amostras"')));
    const videos = secao.match(/<video[^>]*>/g) || [];
    assert.equal(videos.length, 2, 'um player por amostra');
    for (const v of videos) {
      assert.ok(v.includes('preload="none"'), 'nada baixa antes do clique: ' + v);
      assert.ok(v.includes('controls') && v.includes('playsinline'), 'controles nativos, toca no lugar no celular');
      assert.ok(!/autoplay/i.test(v), 'sem autoplay');
      assert.ok(/poster="\/academy\/api\/amostras\/[\w-]+\/capa\.jpg\?v=\d+"/.test(v), 'a capa é o pôster');
    }
    const l = linhas(NO_AR);
    assert.ok(secao.includes(`/academy/api/amostras/${l[0].id}/video.mp4?v=${l[0].versao}`), 'URL versionada do vídeo');
    assert.ok(secao.includes('Chamada nova da aula 1') && secao.includes('Ponte reescrita.'));
    assert.ok(secao.includes('Aula 1 · 39 s'), 'rótulo com aula e duração');
    assert.ok(!html.includes('<script>alert(1)</script>'), 'chamada do produtor nunca vira marcação');
    assert.ok(secao.includes('Aula &lt;script&gt;alert(1)&lt;/script&gt; &quot;dois&quot;'));
    assert.ok(secao.includes('Ponte com &lt;b&gt;marcação&lt;/b&gt; &amp; e-comercial.'));
    assert.ok(html.includes("querySelectorAll('video[data-amostra]')"), 'script de "um por vez" presente');
    assert.ok(/<link rel="stylesheet" href="\/academy\/publico\.css/.test(html));
    assert.ok(fs.readFileSync(path.join(__dirname, 'publico.css'), 'utf8').includes('.pv-amostras{'), 'o estilo da seção existe na folha pública');
  });

  await t('amostras: sem video_url a 1ª amostra vira o vídeo de apresentação; com video_url o vídeo de vendas manda', async () => {
    const l = linhas(NO_AR)[0];
    const cartaoDe = (html) => html.slice(html.indexOf('<aside class="pv-compra">'), html.indexOf('<div class="in">', html.indexOf('<aside class="pv-compra">')));
    const semVideo = cartaoDe(await pagina(NO_AR));
    assert.ok(semVideo.includes('<video class="capa"') && semVideo.includes(`/academy/api/amostras/${l.id}/video.mp4`), 'a primeira amostra no cartão de compra');
    assert.ok(semVideo.includes('preload="none"') && !/autoplay/i.test(semVideo));
    ct.SalesPages.salvar(NO_AR.id, { video_url: 'https://www.youtube.com/watch?v=abcdefghijk' });
    const comVideo = cartaoDe(await pagina(NO_AR));
    assert.ok(comVideo.includes('<iframe') && !comVideo.includes('<video'), 'video_url preenchido continua mandando');
    assert.ok((await pagina(NO_AR)).includes('id="amostras"'), 'e a seção de amostras continua lá');
    ct.SalesPages.salvar(NO_AR.id, {});
  });

  await t('amostras: selo "amostras grátis" no card do marketplace só de quem tem; curso sem amostra não muda em nada', async () => {
    const vitrine = await (await fetch(`${base()}/academy/marketplace`)).text();
    const cardDe = (html, p) => { const i = html.indexOf(`<a class="cardp" href="/academy/cursos/${p.slug}"`); return i < 0 ? '' : html.slice(i, html.indexOf('</a>', i)); };
    assert.ok(cardDe(vitrine, NO_AR).includes('<span class="tag amostra">▶ amostras grátis</span>'), 'card do curso com amostra leva o selo');
    assert.ok(cardDe(vitrine, SEM) && !cardDe(vitrine, SEM).includes('tag amostra') && !cardDe(vitrine, SEM).includes('amostras grátis'), 'card de curso sem amostra não leva');
    assert.equal(cardDe(vitrine, SEM), cardDe(vitrineAntes, SEM), 'e é byte a byte o card de antes');
    assert.equal(cardDe(vitrine, RASCUNHO), '', 'rascunho segue fora da vitrine');
    const sem = await pagina(SEM);
    assert.ok(!sem.includes('id="amostras"') && !sem.includes('Amostras grátis') && !sem.includes('data-amostra') && !sem.includes('<video'),
      'página de curso sem amostra não ganha seção, player nem script');
    // a página do SEM só pode ter mudado no card do vizinho (o NO_AR aparece em "relacionados")
    const semSelo = (h) => h.split('<span class="tag amostra">▶ amostras grátis</span>').join('');
    assert.equal(semSelo(sem), semAntes, 'a página do curso sem amostra é a de antes');
  });

  await t('amostras: o mesmo ciclo com o storage no R2 — bucket só recebe chave amostras/…, Range vai adiante, troca apaga a antiga', async () => {
    const ENVS = ['ACADEMY_S3_ENDPOINT', 'ACADEMY_S3_BUCKET', 'ACADEMY_S3_KEY', 'ACADEMY_S3_SECRET'];
    const envAntes = ENVS.map((k) => process.env[k]);
    const bucket = new Map(); const pedidos = [];
    const fetchReal = globalThis.fetch;
    process.env.ACADEMY_S3_ENDPOINT = 'https://conta-teste.r2.cloudflarestorage.com';
    process.env.ACADEMY_S3_BUCKET = 'academy-teste';
    process.env.ACADEMY_S3_KEY = 'AKIATESTE';
    process.env.ACADEMY_S3_SECRET = 'segredo-teste';
    globalThis.fetch = async (url, opc) => {
      const u = String(url && url.url ? url.url : url);
      if (!u.includes('r2.cloudflarestorage.com')) return fetchReal(url, opc);
      const chave = decodeURIComponent(new URL(u).pathname.split('/').slice(2).join('/'));
      const met = (opc && opc.method) || 'GET';
      const faixa = opc && opc.headers && (opc.headers.Range || opc.headers.range);
      pedidos.push({ met, chave, faixa });
      if (met === 'PUT') { bucket.set(chave, Buffer.from(opc.body)); return new Response('', { status: 200 }); }
      if (met === 'DELETE') { bucket.delete(chave); return new Response(null, { status: 204 }); }
      if (!bucket.has(chave)) return new Response('', { status: 404 });
      const tudo = bucket.get(chave);
      if (faixa) {
        const m = /^bytes=(\d+)-(\d+)$/.exec(faixa);
        const pedaco = tudo.subarray(Number(m[1]), Number(m[2]) + 1);
        return new Response(pedaco, { status: 206, headers: { 'content-range': `bytes ${m[1]}-${m[2]}/${tudo.length}` } });
      }
      return new Response(tudo, { status: 200 });
    };
    try {
      const v1 = mp4('R2a'), v2 = mp4('R2b', 900);
      const r = await enviar(SEM, [item(5, { video: { mime: 'video/mp4', conteudo_base64: b64(v1) } })]);
      assert.equal(r.st, 200, r.texto);
      const l = linhas(SEM)[0];
      assert.equal(l.video_storage, 's3'); assert.equal(l.capa_storage, 's3');
      assert.ok([...bucket.keys()].every(k => k.startsWith(`amostras/${SEM.id}/`)), 'tudo no prefixo das amostras: ' + [...bucket.keys()].join(', '));
      assert.equal(bucket.size, 2);
      assert.ok(!fs.existsSync(path.join(storage.ARQUIVOS_DIR, 'amostras', SEM.id)), 'nada no disco quando o bucket está ligado');

      const inteiro = await fetchReal(`${base()}/academy/api/amostras/${l.id}/video.mp4?v=1`);
      assert.equal(inteiro.status, 200);
      assert.equal(inteiro.headers.get('content-type'), 'video/mp4');
      assert.ok(cache(inteiro).includes('immutable'));
      assert.ok(Buffer.from(await inteiro.arrayBuffer()).equals(v1), 'os bytes vêm do bucket, pelo servidor (URL estável)');
      const pedaco = await fetchReal(`${base()}/academy/api/amostras/${l.id}/video.mp4`, { headers: { Range: 'bytes=4-11' } });
      assert.equal(pedaco.status, 206);
      assert.equal(pedaco.headers.get('content-range'), `bytes 4-11/${v1.length}`);
      assert.equal(Buffer.from(await pedaco.arrayBuffer()).toString(), 'ftypisom');
      assert.equal(pedidos[pedidos.length - 1].faixa, 'bytes=4-11', 'o Range do visitante foi repassado ao bucket (não baixou o arquivo inteiro)');
      const capa = await fetchReal(`${base()}/academy/api/amostras/${l.id}/capa.jpg`);
      assert.equal(capa.status, 200); assert.ok(Buffer.from(await capa.arrayBuffer()).equals(JPG));

      const troca = await enviar(SEM, [{ aula: 5, video: { mime: 'video/mp4', conteudo_base64: b64(v2) } }]);
      assert.equal(troca.st, 200, troca.texto);
      assert.equal(bucket.size, 2, 'vídeo novo entrou e o antigo saiu do bucket');
      assert.ok(!bucket.has(l.video_path));
      assert.ok(Buffer.from(await (await fetchReal(`${base()}/academy/api/amostras/${l.id}/video.mp4`)).arrayBuffer()).equals(v2));

      // objeto que sumiu do bucket: 404 SEM cache (o erro não pode grudar)
      const l2 = linhas(SEM)[0];
      const guardado = bucket.get(l2.video_path); bucket.delete(l2.video_path);
      const sumiu = await fetchReal(`${base()}/academy/api/amostras/${l.id}/video.mp4?v=${l2.versao}`);
      assert.equal(sumiu.status, 404); assert.ok(!cache(sumiu).includes('max-age'), 'veio: ' + cache(sumiu));
      bucket.set(l2.video_path, guardado);

      const rem = await req('POST', '/staff/api/academy/amostras/remover', { semUser: true, chave: true, corpo: { ...corpo(SEM), aula: 5 } });
      assert.equal(rem.st, 200, rem.texto);
      assert.equal(bucket.size, 0, 'remover a amostra tira vídeo e capa do bucket');
      assert.equal(linhas(SEM).length, 0);
    } finally {
      globalThis.fetch = fetchReal;
      ENVS.forEach((k, i) => { if (envAntes[i] == null) delete process.env[k]; else process.env[k] = envAntes[i]; });
    }
  });

  await t('amostras: arquivo que sumiu do disco responde 404 sem cache; remover apaga linha e arquivos, e a página volta a ser a de antes', async () => {
    const l = linhas(NO_AR)[1];
    const caminho = storage.caminhoLocal(l.video_path);
    const guardado = fs.readFileSync(caminho); fs.unlinkSync(caminho);
    const sumiu = await fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4?v=${l.versao}`);
    assert.equal(sumiu.status, 404); assert.ok(!cache(sumiu).includes('max-age'), 'veio: ' + cache(sumiu));
    fs.writeFileSync(caminho, guardado);

    const naoHa = await req('POST', '/staff/api/academy/amostras/remover', { semUser: true, chave: true, corpo: { ...corpo(NO_AR), aula: 99 } });
    assert.equal(naoHa.st, 400);
    const alheia = await req('POST', '/staff/api/academy/amostras/remover', { semUser: true, chave: true, corpo: { ...corpo(SEM), id: l.id } });
    assert.equal(alheia.st, 400, 'não se apaga amostra de um curso passando o id por outro');
    const r1 = await req('POST', '/staff/api/academy/amostras/remover', { semUser: true, chave: true, corpo: { ...corpo(NO_AR), aula: 2 } });
    assert.equal(r1.st, 200, r1.texto); assert.equal(r1.json.amostras.length, 1);
    assert.equal((await fetch(`${base()}/academy/api/amostras/${l.id}/video.mp4`)).status, 404, 'removida → 404');
    const r2 = await req('POST', '/staff/api/academy/amostras/remover', { semUser: true, chave: true, corpo: { ...corpo(NO_AR), id: id1 } });
    assert.equal(r2.st, 200, r2.texto);
    assert.equal(linhas(NO_AR).length, 0);
    assert.deepEqual(arquivosDe(NO_AR), [], 'nenhum arquivo ficou para trás');
    assert.equal(am.tem(NO_AR.id), false);
    assert.equal(await pagina(NO_AR), paginaAntes, 'sem amostras, a página de venda é byte a byte a de antes da função');
    assert.equal(await (await fetch(`${base()}/academy/marketplace`)).text(), vitrineAntes, 'e a vitrine também');
  });
}

module.exports = { rodar };
