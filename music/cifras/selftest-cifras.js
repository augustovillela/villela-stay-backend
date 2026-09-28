// =====================================================================
// Musique Cifras — testes de INTEGRAÇÃO (HTTP de verdade, banco de
// verdade). Rodam dentro do `npm run test:music`.
//
// A regra da casa: permissão se testa TENTANDO violar. Cada papel da
// banda, o link, a política do ADR-0009, a URL maliciosa e o comando do
// maestro têm um teste que tenta passar por onde não devia.
// =====================================================================
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const router = require('../ia/router');
const rede = require('./importar/rede');
const { Importar } = require('./importar');
const repo = require('../repo');

const B = '/music/api/cifras';

// ZIP mínimo (método "stored") para montar um DOCX de teste sem dependência.
function zip(arquivos) {
  const partes = [], central = [];
  let off = 0;
  Object.entries(arquivos).forEach(([nome, conteudo]) => {
    const dados = Buffer.from(conteudo, 'utf8');
    const n = Buffer.from(nome, 'utf8');
    const crc = zlib.crc32(dados) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(dados.length, 18); lh.writeUInt32LE(dados.length, 22); lh.writeUInt16LE(n.length, 26);
    partes.push(lh, n, dados);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(dados.length, 20); ch.writeUInt32LE(dados.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, n);
    off += 30 + n.length + dados.length;
  });
  const cd = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(Object.keys(arquivos).length, 8); fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, cd, fim]);
}

const COLADA = [
  'Garota de Ipanema - Tom Jobim', 'Tom: F', '',
  '[Intro] F7M  G7(13)  Gm7  Gb7(#11)', '',
  '[Primeira Parte]',
  'F7M                     G7(13)', '  Olha que coisa mais linda',
  '                    Gm7', 'Mais cheia de graça',
  '             Gb7(#11)', 'É ela menina', '',
  '[Refrão]', '         Gb7M', 'Ah, porque estou tão sozinho',
].join('\n');

async function rodar({ t, secao, req, assert }) {
  let obra, cifra, banda, setlist, sessao;

  // ===================================================================
  secao('Cifras · biblioteca, busca e duplicata');

  await t('criar música COLANDO a cifra: vira documento estruturado, revisão 1 e fica privada', async () => {
    const r = await req('POST', B + '/musicas', { como: 'ana', corpo: { titulo: 'Garota de Ipanema', artista: 'Tom Jobim', texto: COLADA } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    obra = r.json.musica; cifra = r.json.cifra;
    assert.equal(obra.titularidade, 'terceiro_privado');
    const c = await req('GET', `${B}/cifras/${cifra.id}`, { como: 'ana' });
    assert.equal(c.status, 200);
    assert.deepEqual(c.json.documento.secoes.map((s) => s.tipo), ['intro', 'verso', 'refrao']);
    assert.equal(c.json.cifra.revisao_atual, 1);
    assert.equal(c.json.cifra.tom, 'F');
  });

  await t('busca tolera ERRO DE DIGITAÇÃO e acha pela LETRA', async () => {
    const a = await req('GET', `${B}/musicas?q=ipanmea`, { como: 'ana' });
    assert.ok(a.json.itens.some((x) => x.id === obra.id), 'typo "ipanmea"');
    const b = await req('GET', `${B}/musicas?q=${encodeURIComponent('coisa mais linda')}`, { como: 'ana' });
    assert.ok(b.json.itens.some((x) => x.id === obra.id), 'trecho da letra');
    const c = await req('GET', `${B}/musicas?q=jobim`, { como: 'ana' });
    assert.ok(c.json.itens.some((x) => x.id === obra.id), 'pelo artista');
  });

  await t('outra pessoa NÃO acha nem abre a música privada (busca e detalhe)', async () => {
    const b = await req('GET', `${B}/musicas?q=ipanema`, { como: 'bruno' });
    assert.ok(!b.json.itens.some((x) => x.id === obra.id));
    const d = await req('GET', `${B}/musicas/${obra.id}`, { como: 'bruno' });
    assert.equal(d.status, 403);
    const c = await req('GET', `${B}/cifras/${cifra.id}`, { como: 'bruno' });
    assert.equal(c.status, 403);
    const e = await req('GET', `${B}/cifras/${cifra.id}/exportar/txt`, { como: 'bruno', cru: true });
    assert.equal(e.status, 403, 'exportar também é leitura');
  });

  await t('duplicata provável → 409 com as quatro opções; "salvar separada" passa', async () => {
    const r = await req('POST', B + '/musicas', { como: 'ana', corpo: { titulo: 'Garota de Ipanema (Ao Vivo)', artista: 'tom jobim' } });
    assert.equal(r.status, 409);
    assert.equal(r.json.codigo, 'DUPLICATA');
    assert.deepEqual(r.json.opcoes, ['abrir', 'nova_versao', 'mesclar_metadados', 'salvar_separada']);
    assert.equal(r.json.duplicatas[0].obra.id, obra.id);
    const s = await req('POST', B + '/musicas', { como: 'ana', corpo: { titulo: 'Garota de Ipanema (Ao Vivo)', artista: 'tom jobim', separada: true } });
    assert.equal(s.status, 200);
  });

  await t('filtros combináveis, favoritas e facetas', async () => {
    await req('PATCH', `${B}/musicas/${obra.id}`, { como: 'ana', corpo: { genero: 'Bossa nova', dificuldade: 'avancado', tags: ['bossa'] } });
    await req('POST', `${B}/musicas/${obra.id}/favorito`, { como: 'ana' });
    const f = await req('GET', `${B}/musicas?genero=${encodeURIComponent('Bossa nova')}&favoritas=1`, { como: 'ana' });
    assert.deepEqual(f.json.itens.map((x) => x.id), [obra.id]);
    const fa = await req('GET', `${B}/facetas`, { como: 'ana' });
    assert.ok(fa.json.generos.some((g) => g.v === 'Bossa nova'));
    const tg = await req('GET', `${B}/musicas?tag=bossa`, { como: 'ana' });
    assert.ok(tg.json.itens.some((x) => x.id === obra.id));
  });

  await t('exclusão SUAVE: some da lista, fica na lixeira, volta com restaurar', async () => {
    const extra = (await req('POST', B + '/musicas', { como: 'ana', corpo: { titulo: 'Para apagar', criar_cifra: false } })).json.musica;
    await req('DELETE', `${B}/musicas/${extra.id}`, { como: 'ana' });
    const l = await req('GET', `${B}/musicas?q=apagar`, { como: 'ana' });
    assert.ok(!l.json.itens.some((x) => x.id === extra.id));
    const lx = await req('GET', `${B}/musicas?lixeira=1`, { como: 'ana' });
    assert.ok(lx.json.itens.some((x) => x.id === extra.id));
    await req('POST', `${B}/musicas/${extra.id}/restaurar`, { como: 'ana' });
    const v = await req('GET', `${B}/musicas?q=apagar`, { como: 'ana' });
    assert.ok(v.json.itens.some((x) => x.id === extra.id));
  });

  // ===================================================================
  secao('Cifras · revisões, conflito, rascunho e visão pessoal');

  let doc1;
  await t('salvar cria REVISÃO; versão velha dá 409 COM o diff, sem apagar ninguém', async () => {
    const c = (await req('GET', `${B}/cifras/${cifra.id}`, { como: 'ana' })).json;
    doc1 = c.documento;
    const doc2 = JSON.parse(JSON.stringify(doc1));
    doc2.secoes[1].linhas[0].segmentos[1].acorde = 'G7(9)';
    const s = await req('PUT', `${B}/cifras/${cifra.id}`, { como: 'ana', corpo: { documento: doc2, versao: c.cifra.versao, descricao: 'nona no G7' } });
    assert.equal(s.status, 200, JSON.stringify(s.json));
    assert.equal(s.json.cifra.revisao_atual, 2);
    const velho = await req('PUT', `${B}/cifras/${cifra.id}`, { como: 'ana', corpo: { documento: doc1, versao: c.cifra.versao } });
    assert.equal(velho.status, 409);
    assert.equal(velho.json.codigo, 'CONFLITO');
    assert.ok(velho.json.diff && velho.json.documento_atual, 'o conflito traz o que mudou e o estado atual');
    assert.equal((await req('GET', `${B}/cifras/${cifra.id}`, { como: 'ana' })).json.cifra.revisao_atual, 2, 'nada foi sobrescrito');
  });

  await t('histórico comparável e RESTAURÁVEL (restaurar = nova revisão)', async () => {
    const h = await req('GET', `${B}/cifras/${cifra.id}/revisoes`, { como: 'ana' });
    assert.deepEqual(h.json.revisoes.map((r) => r.numero), [2, 1]);
    const cmp = await req('GET', `${B}/cifras/${cifra.id}/comparar?a=1&b=2`, { como: 'ana' });
    assert.equal(cmp.json.diff.resumo.acordes, 1);
    const r = await req('POST', `${B}/cifras/${cifra.id}/restaurar`, { como: 'ana', corpo: { numero: 1 } });
    assert.equal(r.json.cifra.revisao_atual, 3);
    const h2 = await req('GET', `${B}/cifras/${cifra.id}/revisoes`, { como: 'ana' });
    assert.equal(h2.json.revisoes[0].tipo, 'restauracao');
  });

  await t('salvar sem mudança NÃO gera revisão vazia', async () => {
    const c = (await req('GET', `${B}/cifras/${cifra.id}`, { como: 'ana' })).json;
    const s = await req('PUT', `${B}/cifras/${cifra.id}`, { como: 'ana', corpo: { documento: c.documento, versao: c.cifra.versao } });
    assert.ok(s.json.sem_mudancas);
    assert.equal(s.json.cifra.revisao_atual, 3);
  });

  await t('documento inválido é recusado na borda (422)', async () => {
    const c = (await req('GET', `${B}/cifras/${cifra.id}`, { como: 'ana' })).json;
    const r = await req('PUT', `${B}/cifras/${cifra.id}`, { como: 'ana', corpo: { documento: { formato: 'x', secoes: [] }, versao: c.cifra.versao } });
    assert.equal(r.status, 422);
  });

  await t('rascunho automático: salva, volta e some ao salvar a revisão', async () => {
    const c = (await req('GET', `${B}/cifras/${cifra.id}`, { como: 'ana' })).json;
    await req('PUT', `${B}/cifras/${cifra.id}/rascunho`, { como: 'ana', corpo: { documento: c.documento, base_revisao: 3 } });
    const r = await req('GET', `${B}/cifras/${cifra.id}/rascunho`, { como: 'ana' });
    assert.equal(r.json.rascunho.base_revisao, 3);
  });

  await t('visão PESSOAL (fonte, instrumento, tom) não muda o documento nem a visão de outro', async () => {
    await req('PUT', `${B}/cifras/${cifra.id}/visao`, { como: 'ana', corpo: { instrumento: 'ukulele', transposicao: 2, exibicao: { fonte: 30, tema: 'preto' } } });
    const v = await req('GET', `${B}/cifras/${cifra.id}/visao`, { como: 'ana' });
    assert.equal(v.json.visao.exibicao.fonte, 30);
    assert.equal(v.json.visao.instrumento, 'ukulele');
    const c = (await req('GET', `${B}/cifras/${cifra.id}`, { como: 'ana' })).json;
    assert.equal(c.cifra.tom, 'F', 'o tom da cifra não mudou');
    const lixo = await req('PUT', `${B}/cifras/${cifra.id}/visao`, { como: 'ana', corpo: { exibicao: { fonte: 9999, tema: '<script>' } } });
    assert.equal(lixo.json.visao.exibicao.fonte, 72, 'valor fora da faixa é limitado');
    assert.equal(lixo.json.visao.exibicao.tema, 'claro', 'enumeração inválida vira padrão');
  });

  await t('diagramas por instrumento e capotraste inteligente pela API', async () => {
    const d = await req('GET', `${B}/acordes?instrumento=cavaquinho&c=${encodeURIComponent('G,C,D7')}`, { como: 'ana' });
    assert.equal(d.json.acordes[0].formas[0].desenho, '0000');
    const p = await req('GET', `${B}/acordes?instrumento=piano&c=C,Am`, { como: 'ana' });
    assert.ok(p.json.acordes[1].movimento <= 3);
    const b = await req('GET', `${B}/acordes?instrumento=baixo&c=C,G`, { como: 'ana' });
    assert.equal(b.json.linha_guia.length, 2);
    const k = await req('GET', `${B}/capotraste?c=${encodeURIComponent('Eb,Cm,Ab,Bb')}`, { como: 'ana' });
    assert.ok(k.json.sugestoes.length >= 3);
  });

  // ===================================================================
  secao('Cifras · banda, papéis e a revisão da Q2 (ADR-0009)');

  await t('criar banda e convidar por e-mail: quem tem conta entra NA HORA como músico', async () => {
    const r = await req('POST', B + '/bandas', { como: 'ana', corpo: { nome: 'Trio do Lago' } });
    banda = r.json.banda;
    assert.equal(r.json.meu_papel, 'proprietario');
    const c = await req('POST', `${B}/bandas/${banda.id}/convites`, { como: 'ana', corpo: { emails: ['bruno@t'], papel: 'musico' } });
    assert.deepEqual(c.json.entraram, ['bruno@t']);
  });

  await t('membro NÃO vê a música antes de ela ser compartilhada com a banda', async () => {
    assert.equal((await req('GET', `${B}/cifras/${cifra.id}`, { como: 'bruno' })).status, 403);
  });

  await t('ADR-0009: obra de TERCEIRO pode ser compartilhada com a banda fechada', async () => {
    const r = await req('POST', `${B}/bandas/${banda.id}/musicas`, { como: 'ana', corpo: { obra_id: obra.id } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const c = await req('GET', `${B}/cifras/${cifra.id}`, { como: 'bruno' });
    assert.equal(c.status, 200, 'o membro agora vê');
    const b = await req('GET', `${B}/musicas?q=ipanema`, { como: 'bruno' });
    assert.ok(b.json.itens.some((x) => x.id === obra.id), 'e acha na busca');
  });

  await t('quem NÃO é da banda continua sem acesso (detalhe, cifra, busca)', async () => {
    assert.equal((await req('GET', `${B}/cifras/${cifra.id}`, { como: 'forasteiro' })).status, 403);
    const b = await req('GET', `${B}/musicas?q=ipanema`, { como: 'forasteiro' });
    assert.ok(!b.json.itens.some((x) => x.id === obra.id));
  });

  await t('papel MÚSICO lê mas não edita a cifra; EDITOR edita', async () => {
    const c = (await req('GET', `${B}/cifras/${cifra.id}`, { como: 'bruno' })).json;
    assert.equal(c.pode.editar, false);
    const tenta = await req('PUT', `${B}/cifras/${cifra.id}`, { como: 'bruno', corpo: { documento: c.documento, versao: c.cifra.versao } });
    assert.equal(tenta.status, 403);
    await req('PATCH', `${B}/bandas/${banda.id}/membros/u-bruno`, { como: 'ana', corpo: { papel: 'editor' } });
    const doc = JSON.parse(JSON.stringify(c.documento));
    doc.meta.bpm = '120';
    const ok = await req('PUT', `${B}/cifras/${cifra.id}`, { como: 'bruno', corpo: { documento: doc, versao: c.cifra.versao, descricao: 'BPM' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
  });

  await t('editor não mexe em papéis; ninguém se promove a proprietário', async () => {
    assert.equal((await req('PATCH', `${B}/bandas/${banda.id}/membros/u-ana`, { como: 'bruno', corpo: { papel: 'musico' } })).status, 403);
    assert.equal((await req('PATCH', `${B}/bandas/${banda.id}/membros/u-bruno`, { como: 'ana', corpo: { papel: 'proprietario' } })).status, 400);
  });

  let conviteToken;
  await t('convite por LINK/QR: token só na URL, hash no banco; entra como convidado', async () => {
    const c = await req('POST', `${B}/bandas/${banda.id}/convites`, { como: 'ana', corpo: { link: true, papel: 'convidado', usos: 1 } });
    conviteToken = c.json.link.token;
    assert.ok(!db.prepare('SELECT 1 FROM banda_convites WHERE token_hash = ?').get(conviteToken), 'o token em claro não está no banco');
    const v = await req('GET', `${B}/convites/${conviteToken}`, { como: 'forasteiro' });
    assert.equal(v.json.banda, 'Trio do Lago');
    const a = await req('POST', `${B}/convites/${conviteToken}/aceitar`, { como: 'forasteiro' });
    assert.equal(a.status, 200);
    const de_novo = await req('POST', `${B}/convites/${conviteToken}/aceitar`, { como: 'sec' });
    assert.equal(de_novo.status, 404, 'convite de uso único não serve duas vezes');
  });

  await t('CONVIDADO só lê: não comenta, não edita setlist, não cria arranjo', async () => {
    assert.equal((await req('GET', `${B}/cifras/${cifra.id}`, { como: 'forasteiro' })).status, 200);
    const cm = await req('POST', B + '/comentarios', { como: 'forasteiro', corpo: { alvo_tipo: 'cifra', alvo_id: cifra.id, texto: 'oi', banda_id: banda.id } });
    assert.equal(cm.status, 403);
    const ar = await req('POST', `${B}/cifras/${cifra.id}/arranjos`, { como: 'forasteiro', corpo: { banda_id: banda.id } });
    assert.equal(ar.status, 403);
  });

  await t('link ABERTO de obra de terceiro: recusado com a política desligada', async () => {
    const r = await req('POST', B + '/links', { como: 'ana', corpo: { alvo_tipo: 'cifra', alvo_id: cifra.id } });
    assert.equal(r.status, 403);
    assert.match(r.json.erro, /política/);
  });

  let linkToken;
  await t('política é do STAFF, exige motivo, fica na auditoria — e o link é permissão VIVA', async () => {
    const semMotivo = await req('PUT', '/staff/api/music/cifras/flags/cifras.politica.terceiro_por_link', { corpo: { ligado: true } });
    assert.equal(semMotivo.status, 400);
    const naoAdmin = await req('PUT', '/staff/api/music/cifras/flags/cifras.politica.terceiro_por_link', { staff: 'op', corpo: { ligado: true, motivo: 'x' } });
    assert.equal(naoAdmin.status, 403);
    const liga = await req('PUT', '/staff/api/music/cifras/flags/cifras.politica.terceiro_por_link', { corpo: { ligado: true, motivo: 'teste' } });
    assert.equal(liga.status, 200);
    const l = await req('POST', B + '/links', { como: 'ana', corpo: { alvo_tipo: 'cifra', alvo_id: cifra.id, opcoes: { tom: 'G', instrumento: 'violao' } } });
    assert.equal(l.status, 200, JSON.stringify(l.json));
    linkToken = l.json.token;
    const pub = await req('GET', '/music/c/' + linkToken, { cru: true });
    assert.equal(pub.status, 200);
    assert.ok(pub.texto.includes('G7M'), 'o link abre na visão pedida (tom G)');
    assert.ok(!/<script/i.test(pub.texto), 'página pública sem script');
    await req('PUT', '/staff/api/music/cifras/flags/cifras.politica.terceiro_por_link', { corpo: { ligado: false, motivo: 'fim do teste' } });
    const depois = await req('GET', '/music/c/' + linkToken, { cru: true });
    assert.equal(depois.status, 403, 'política desligada fecha o link que já existia');
    assert.ok(db.prepare("SELECT 1 FROM auditoria WHERE acao = 'cifras.flag'").get());
  });

  await t('a escola CONTINUA fechada para obra de terceiro (a decisão abriu a banda, não a escola)', async () => {
    const direitos = require('../direitos');
    const v = direitos.podeCompartilhar(repo.Obras.porId(obra.id));
    assert.equal(v.pode, false);
  });

  await t('privada ⇄ pública com um clique: obra própria aparece e some para os outros; terceiro recusa pela política', async () => {
    const m = (await req('POST', B + '/musicas', { como: 'ana', corpo: { titulo: 'Composição da Ana', titularidade: 'propria', texto: 'C  G\nminha música' } })).json.musica;
    assert.equal((await req('POST', `/music/api/obras/${m.id}/visibilidade`, { como: 'ana', corpo: { visibilidade: 'publica' } })).status, 200);
    let b = await req('GET', `${B}/musicas?q=${encodeURIComponent('Composição da Ana')}`, { como: 'sec' });
    assert.ok(b.json.itens.some((x) => x.id === m.id), 'pública: outra pessoa acha');
    assert.equal((await req('GET', `${B}/musicas/${m.id}`, { como: 'sec' })).status, 200);
    await req('POST', `/music/api/obras/${m.id}/visibilidade`, { como: 'ana', corpo: { visibilidade: 'privada' } });
    b = await req('GET', `${B}/musicas?q=${encodeURIComponent('Composição da Ana')}`, { como: 'sec' });
    assert.ok(!b.json.itens.some((x) => x.id === m.id), 'privada de novo: some');
    const t3 = await req('POST', `/music/api/obras/${obra.id}/visibilidade`, { como: 'ana', corpo: { visibilidade: 'publica' } });
    assert.equal(t3.status, 403, 'terceiro com a política desligada');
    const det = await req('GET', `${B}/musicas/${obra.id}`, { como: 'ana' });
    assert.equal(det.json.permissoes.publicar.pode, false, 'a tela recebe o motivo para mostrar ao lado do botão');
    assert.equal((await req('POST', `/music/api/obras/${m.id}/visibilidade`, { como: 'bruno', corpo: { visibilidade: 'publica' } })).status >= 400, true, 'só o dono muda');
  });

  await t('PORTÃO ÚNICO: nenhum arquivo lê banda_membros fora de acesso.js, direitos.js e repertorio.js', async () => {
    const raiz = path.join(__dirname, '..');
    const ok = new Set(['cifras/acesso.js', 'direitos.js', 'repertorio.js']);
    const varrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return varrer(p);
      if (!e.name.endsWith('.js') || /selftest/.test(e.name)) return;
      const rel = path.relative(raiz, p).split(path.sep).join('/');
      if (ok.has(rel)) return;
      const txt = fs.readFileSync(p, 'utf8');
      if (/(?<!DELETE\s)FROM\s+banda_membros|JOIN\s+banda_membros/i.test(txt)) throw new Error(rel + ' consulta banda_membros fora do portão');
    });
    varrer(raiz);
  });

  await t('toda chamada de IA das cifras passa pelo portão (cifras/ia.js)', async () => {
    const dir = __dirname;
    const varrer = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return varrer(p);
      if (!e.name.endsWith('.js') || /selftest/.test(e.name) || e.name === 'ia.js') return;
      if (/router\.executar\s*\(/.test(fs.readFileSync(p, 'utf8'))) throw new Error(path.relative(dir, p) + ' chama o router direto');
    });
    varrer(dir);
  });

  // ===================================================================
  secao('Cifras · arranjo da banda e aprovação');

  let arranjo;
  await t('arranjo da banda: tom e estrutura próprios; aprovar é do maestro/proprietário', async () => {
    const c = (await req('GET', `${B}/cifras/${cifra.id}`, { como: 'ana' })).json;
    const est = c.documento.secoes.map((s) => ({ secao_id: s.id, repetir: s.tipo === 'refrao' ? 2 : 1 }));
    const r = await req('POST', `${B}/cifras/${cifra.id}/arranjos`, { como: 'bruno', corpo: { banda_id: banda.id, tom: 'G', estrutura: est.concat([{ secao_id: 'inexistente' }]) } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    arranjo = r.json.arranjo;
    assert.equal(arranjo.estrutura.length, est.length, 'seção inexistente é descartada');
    assert.equal((await req('POST', `${B}/arranjos/${arranjo.id}/aprovar`, { como: 'bruno' })).status, 403, 'editor não aprova');
    const ap = await req('POST', `${B}/arranjos/${arranjo.id}/aprovar`, { como: 'ana' });
    assert.equal(ap.json.arranjo.status, 'aprovado');
    const muda = await req('PATCH', `${B}/arranjos/${arranjo.id}`, { como: 'bruno', corpo: { tom: 'A' } });
    assert.equal(muda.json.arranjo.status, 'em_revisao', 'mudar o tom de arranjo aprovado volta para revisão');
    await req('POST', `${B}/arranjos/${arranjo.id}/aprovar`, { como: 'ana' });
  });

  await t('comentário ancorado no ACORDE, visível só para a banda; nota privada só para o autor', async () => {
    const c = (await req('GET', `${B}/cifras/${cifra.id}`, { como: 'ana' })).json;
    const sec = c.documento.secoes[1];
    await req('POST', B + '/comentarios', { como: 'ana', corpo: { alvo_tipo: 'cifra', alvo_id: cifra.id, banda_id: banda.id,
      ancora: { secao_id: sec.id, linha_id: sec.linhas[0].id, acorde: 'G7(13)' }, texto: '@Bruno segura esse G7(13)' } });
    await req('POST', B + '/comentarios', { como: 'ana', corpo: { alvo_tipo: 'cifra', alvo_id: cifra.id, texto: 'lembrar de respirar' } });
    const doBruno = await req('GET', `${B}/comentarios?alvo_tipo=cifra&alvo_id=${cifra.id}`, { como: 'bruno' });
    assert.equal(doBruno.json.comentarios.length, 1, 'bruno vê o da banda, não a nota privada da Ana');
    assert.equal(doBruno.json.comentarios[0].ancora.acorde, 'G7(13)');
    const n = await req('GET', B + '/notificacoes', { como: 'bruno' });
    assert.ok(n.json.notificacoes.some((x) => x.tipo === 'mencao'), 'a menção notifica');
  });

  await t('tarefa de revisão ("confirmar tom") atribuída a um membro', async () => {
    const r = await req('POST', `${B}/bandas/${banda.id}/tarefas`, { como: 'ana', corpo: { alvo_tipo: 'arranjo', alvo_id: arranjo.id, titulo: 'Confirmar tom', responsavel: 'u-bruno' } });
    assert.equal(r.status, 200);
    await req('PATCH', `${B}/tarefas/${r.json.tarefa.id}`, { como: 'bruno', corpo: { status: 'feita' } });
    const l = await req('GET', `${B}/bandas/${banda.id}/tarefas`, { como: 'ana' });
    assert.equal(l.json.tarefas[0].status, 'feita');
    const at = await req('GET', `${B}/bandas/${banda.id}/atividade`, { como: 'ana' });
    assert.ok(at.json.atividade.length >= 5, 'histórico de atividade da banda');
  });

  // ===================================================================
  secao('Cifras · setlist de palco, alertas e pacote offline');

  let item, pacote;
  await t('setlist da banda com bloco, item com arranjo e tom do show; alertas certos', async () => {
    const s = await req('POST', B + '/setlists', { como: 'ana', corpo: { nome: 'Casamento Sábado', banda_id: banda.id, local: 'Lago Sul', duracao_planejada_s: 60 } });
    assert.equal(s.status, 200, JSON.stringify(s.json));
    setlist = s.json.repertorio;
    const b = await req('POST', `${B}/setlists/${setlist.id}/blocos`, { como: 'ana', corpo: { nome: 'Cerimônia' } });
    const i = await req('POST', `${B}/setlists/${setlist.id}/itens`, { como: 'bruno', corpo: { cifra_id: cifra.id, cifra_arranjo_id: arranjo.id, tom_execucao: 'G', bloco_id: b.json.bloco.id } });
    assert.equal(i.status, 200, JSON.stringify(i.json));
    item = i.json.item;
    await req('POST', `${B}/setlists/${setlist.id}/itens`, { como: 'ana', corpo: { intervalo: true, titulo_livre: 'Intervalo', duracao_s: 600 } });
    const c = (await req('GET', `${B}/setlists/${setlist.id}`, { como: 'ana' })).json;
    const textos = c.alertas.map((a) => a.texto).join(' | ');
    assert.match(textos, /tom não confirmado/);
    assert.match(textos, /acima do planejado/);
    assert.match(textos, /não baixado/);
    assert.equal(c.itens[0].bloco_id, b.json.bloco.id);
  });

  await t('convidado NÃO edita o setlist da banda', async () => {
    const r = await req('POST', `${B}/setlists/${setlist.id}/itens`, { como: 'forasteiro', corpo: { titulo_livre: 'intruso' } });
    assert.equal(r.status, 403);
  });

  await t('pacote offline: setlist inteiro no TOM DO SHOW, com hash; conferir diz se está atual', async () => {
    await req('PATCH', `${B}/itens/${item.id}`, { como: 'ana', corpo: { tom_confirmado: true } });
    const p = await req('GET', `${B}/setlists/${setlist.id}/pacote`, { como: 'bruno' });
    assert.equal(p.status, 200);
    pacote = p.json;
    const m = pacote.pacote.musicas.find((x) => x.item_id === item.id);
    assert.equal(m.tom_soando, 'G');
    const D = require('./motor/documento');
    assert.equal(D.acordesEmOrdem(m.documento)[0], 'G7M', 'F7M transposto para G');
    assert.ok(pacote.hash.length === 64);
    const ok = await req('POST', `${B}/setlists/${setlist.id}/pacote/conferir`, { como: 'bruno', corpo: { hash: pacote.hash } });
    assert.equal(ok.json.valido, true);
  });

  await t('transposição pessoal de LEITURA não muda o tom do SHOW no pacote (só capo e simplificação)', async () => {
    await req('PUT', `${B}/cifras/${cifra.id}/visao`, { como: 'bruno', corpo: { transposicao: 3, simplificacao: 2 } });
    const semArranjo = (await req('POST', `${B}/setlists/${setlist.id}/itens`, { como: 'ana', corpo: { cifra_id: cifra.id, tom_execucao: 'G' } })).json.item;
    const p = await req('GET', `${B}/setlists/${setlist.id}/pacote`, { como: 'bruno' });
    const m = p.json.pacote.musicas.find((x) => x.item_id === semArranjo.id);
    assert.equal(m.tom_soando, 'G', 'o show é em G, mesmo o bruno tendo transposto +3 lendo em casa');
    const D = require('./motor/documento');
    assert.equal(D.acordesEmOrdem(m.documento)[0], 'G', 'a simplificação pessoal vale (G7M → G)');
    await req('DELETE', `${B}/itens/${semArranjo.id}`, { como: 'ana' });
    await req('PUT', `${B}/cifras/${cifra.id}/visao`, { como: 'bruno', corpo: { transposicao: 0, simplificacao: 0 } });
  });

  await t('mudou a cifra depois do download → o pacote é acusado como DESATUALIZADO', async () => {
    const c = (await req('GET', `${B}/cifras/${cifra.id}`, { como: 'ana' })).json;
    const doc = JSON.parse(JSON.stringify(c.documento));
    doc.meta.compasso = '4/4';
    await new Promise((r) => setTimeout(r, 15));
    await req('PUT', `${B}/cifras/${cifra.id}`, { como: 'ana', corpo: { documento: doc, versao: c.cifra.versao } });
    const v = await req('POST', `${B}/setlists/${setlist.id}/pacote/conferir`, { como: 'bruno', corpo: { hash: pacote.hash } });
    assert.equal(v.json.valido, false);
    assert.ok(v.json.desatualizados.length === 1);
  });

  await t('duplicar como modelo e histórico de alterações', async () => {
    const d = await req('POST', `${B}/setlists/${setlist.id}/duplicar`, { como: 'ana', corpo: { nome: 'Modelo casamento' } });
    assert.equal(d.status, 200);
    assert.equal(d.json.itens.length, 2);
    assert.equal(d.json.blocos.length, 1);
    const h = await req('GET', `${B}/setlists/${setlist.id}/historico`, { como: 'ana' });
    assert.ok(h.json.historico.length >= 3);
  });

  await t('reordenar por arrastar trocando de bloco, sem perder item', async () => {
    const c = (await req('GET', `${B}/setlists/${setlist.id}`, { como: 'ana' })).json;
    const ids = c.itens.map((x) => x.id).reverse();
    const r = await req('PUT', `${B}/setlists/${setlist.id}/ordem`, { como: 'bruno', corpo: { ordem: ids.map((id) => ({ id, bloco_id: '' })) } });
    assert.equal(r.status, 200);
    const c2 = (await req('GET', `${B}/setlists/${setlist.id}`, { como: 'ana' })).json;
    assert.deepEqual(c2.itens.map((x) => x.id), ids);
    assert.ok(c2.itens.every((x) => x.bloco_id === ''));
    const falta = await req('PUT', `${B}/setlists/${setlist.id}/ordem`, { como: 'bruno', corpo: { ordem: [ids[0]] } });
    assert.equal(falta.status, 400, 'reordenar não remove música');
  });

  // ===================================================================
  secao('Cifras · sessão ao vivo / Modo Maestro');

  await t('só quem conduz inicia; o código entra pelo QR ou digitado', async () => {
    assert.equal((await req('POST', B + '/vivo', { como: 'bruno', corpo: { repertorio_id: setlist.id } })).status, 403, 'editor não conduz');
    const s = await req('POST', B + '/vivo', { como: 'ana', corpo: { repertorio_id: setlist.id } });
    assert.equal(s.status, 200, JSON.stringify(s.json));
    sessao = s.json.sessao;
    assert.match(sessao.codigo, /^[A-HJ-NP-Z2-9]{6}$/);
    const e = await req('POST', B + '/vivo/entrar', { como: 'bruno', corpo: { codigo: sessao.codigo.toLowerCase(), instrumento: 'baixo' } });
    assert.equal(e.status, 200);
    const fora = await req('POST', B + '/vivo/entrar', { como: 'sec', corpo: { codigo: sessao.codigo } });
    assert.equal(fora.status, 403, 'quem não é da banda não entra, nem com o código');
  });

  await t('o integrante RECEBE o comando do maestro em tempo real (SSE)', async () => {
    const recebidos = [];
    const ctrl = new AbortController();
    const cookie = req.cookieDe('bruno');
    const r = await fetch(req.base() + `${B}/vivo/${sessao.id}/fluxo`, { headers: { Cookie: cookie }, signal: ctrl.signal });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /event-stream/);
    const leitor = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const ler = (async () => {
      try {
        for (;;) {
          const { value, done } = await leitor.read();
          if (done) break;
          buf += dec.decode(value);
          buf.split('\n\n').slice(0, -1).forEach((bloco) => { if (/event: comando/.test(bloco)) recebidos.push(bloco); });
          buf = buf.split('\n\n').slice(-1)[0];
        }
      } catch (_) { /* abortado */ }
    })();
    await new Promise((x) => setTimeout(x, 80));
    const c = await req('POST', `${B}/vivo/${sessao.id}/comando`, { como: 'ana', corpo: { tipo: 'proximo', chave_idem: 'k1' } });
    assert.equal(c.json.seq, 1);
    await new Promise((x) => setTimeout(x, 120));
    ctrl.abort(); await ler;
    assert.equal(recebidos.length, 1, 'um evento de comando chegou');
    assert.match(recebidos[0], /"tipo":"proximo"/);
    assert.match(recebidos[0], /id: 1/);
  });

  await t('comando repetido (mesma chave) não se aplica duas vezes; integrante não conduz', async () => {
    const r = await req('POST', `${B}/vivo/${sessao.id}/comando`, { como: 'ana', corpo: { tipo: 'proximo', chave_idem: 'k1' } });
    assert.equal(r.json.repetido, true);
    assert.equal(r.json.seq, 1);
    const b = await req('POST', `${B}/vivo/${sessao.id}/comando`, { como: 'bruno', corpo: { tipo: 'anterior', chave_idem: 'kb' } });
    assert.equal(b.status, 403);
  });

  await t('RECONEXÃO: com Last-Event-ID, o aparelho recebe só o que perdeu, em ordem', async () => {
    await req('POST', `${B}/vivo/${sessao.id}/comando`, { como: 'ana', corpo: { tipo: 'cue', payload: { texto: 'Final!' }, chave_idem: 'k2' } });
    await req('POST', `${B}/vivo/${sessao.id}/comando`, { como: 'ana', corpo: { tipo: 'tom_emergencia', payload: { semitons: -2 }, chave_idem: 'k3' } });
    const ctrl = new AbortController();
    const r = await fetch(req.base() + `${B}/vivo/${sessao.id}/fluxo`, { headers: { Cookie: req.cookieDe('bruno'), 'Last-Event-ID': '1' }, signal: ctrl.signal });
    const leitor = r.body.getReader();
    let txt = '';
    const limite = Date.now() + 1500;
    while (Date.now() < limite && !/event: estado/.test(txt)) { const { value, done } = await leitor.read(); if (done) break; txt += new TextDecoder().decode(value); }
    ctrl.abort();
    const ids = [...txt.matchAll(/id: (\d+)\nevent: comando/g)].map((m) => Number(m[1]));
    assert.deepEqual(ids, [2, 3], 'replay dos eventos 2 e 3');
    assert.match(txt, /"semitons":-2/);
    const snap = await req('GET', `${B}/vivo/${sessao.id}`, { como: 'bruno' });
    assert.equal(snap.json.estado.item_idx, 1);
    assert.equal(snap.json.estado.cue.texto, 'Final!');
  });

  await t('encerrar: a sessão para de aceitar comando', async () => {
    await req('POST', `${B}/vivo/${sessao.id}/encerrar`, { como: 'ana' });
    const r = await req('POST', `${B}/vivo/${sessao.id}/comando`, { como: 'ana', corpo: { tipo: 'proximo', chave_idem: 'k9' } });
    assert.equal(r.status, 409);
  });

  // ===================================================================
  secao('Cifras · importação (texto, arquivo, URL, busca, IA) e SSRF');

  let imp;
  await t('texto colado → PRÉVIA com tom, dificuldade, qualidade e duplicata — nada salvo ainda', async () => {
    const r = await req('POST', B + '/importar/texto', { como: 'ana', corpo: { texto: COLADA } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    imp = r.json;
    assert.equal(imp.importacao.status, 'pronta');
    assert.ok(imp.resultado.qualidade.nota > 50);
    assert.ok(imp.resultado.duplicatas.length >= 1, 'avisa que a música já está no acervo');
    assert.ok(imp.resultado.dificuldade.nivel);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cifras WHERE obra_id = ?').get(obra.id).n, 1, 'a prévia não gravou cifra');
  });

  await t('salvar como NOVA VERSÃO da música existente, registrando a procedência', async () => {
    const r = await req('POST', `${B}/importar/${imp.importacao.id}/salvar`, { como: 'ana', corpo: { destino: 'nova_versao', obra_id: obra.id, nome: 'Versão colada' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cifras WHERE obra_id = ? AND removido_em = ''").get(obra.id).n, 2);
    const f = db.prepare('SELECT * FROM cifra_fontes WHERE obra_id = ? ORDER BY importado_em DESC').get(obra.id);
    assert.equal(f.tipo, 'texto');
    const de_novo = await req('POST', `${B}/importar/${imp.importacao.id}/salvar`, { como: 'ana', corpo: { destino: 'nova_versao', obra_id: obra.id } });
    assert.equal(de_novo.status, 409, 'salvar duas vezes não duplica');
  });

  await t('comparar e FUNDIR duas versões da mesma música (prévia, sem gravar)', async () => {
    const det = (await req('GET', `${B}/musicas/${obra.id}`, { como: 'ana' })).json;
    const ids = det.cifras.map((c) => c.id);
    const cmp = await req('POST', B + '/cifras/comparar', { como: 'ana', corpo: { ids } });
    assert.equal(cmp.status, 200);
    const fu = await req('POST', B + '/cifras/fundir', { como: 'ana', corpo: { base: ids[0], outras: ids.slice(1) } });
    assert.equal(fu.status, 200);
    assert.match(fu.json.aviso, /Prévia/);
  });

  await t('arquivo TXT (Latin-1) e DOCX: acorde continua na sílaba certa', async () => {
    const txt = Buffer.from('C      G\nOlha a canção', 'latin1').toString('base64');
    const a = await req('POST', B + '/importar/arquivo', { como: 'ana', corpo: { nome: 'x.txt', base64: txt } });
    assert.equal(a.status, 200, JSON.stringify(a.json));
    assert.equal(a.json.resultado.documento.secoes[0].linhas[0].segmentos[1].texto, 'canção');
    const xml = '<?xml version="1.0"?><w:document xmlns:w="w"><w:body>'
      + '<w:p><w:r><w:t xml:space="preserve">Am      Dm</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t xml:space="preserve">Vou cantar</w:t></w:r></w:p></w:body></w:document>';
    const docx = zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': xml });
    const d = await req('POST', B + '/importar/arquivo', { como: 'ana', corpo: { nome: 'c.docx', base64: docx.toString('base64') } });
    assert.equal(d.status, 200, JSON.stringify(d.json));
    const segs = d.json.resultado.documento.secoes[0].linhas[0].segmentos;
    assert.deepEqual(segs.map((s) => s.acorde), ['Am', 'Dm']);
    assert.equal(segs[0].texto, 'Vou cant');
  });

  await t('PDF com camada de texto: a COLUNA do acorde é reconstruída pela posição', async () => {
    const { PDFDocument, StandardFonts } = require('pdf-lib');
    const pdf = await PDFDocument.create();
    const p = pdf.addPage([400, 300]);
    const f = await pdf.embedFont(StandardFonts.Courier);
    p.drawText('G', { x: 40, y: 200, size: 12, font: f });
    p.drawText('D', { x: 40 + f.widthOfTextAtSize('Olha que ', 12), y: 200, size: 12, font: f });
    p.drawText('Olha que coisa', { x: 40, y: 186, size: 12, font: f });
    const b64 = Buffer.from(await pdf.save()).toString('base64');
    const r = await req('POST', B + '/importar/arquivo', { como: 'ana', corpo: { nome: 'c.pdf', base64: b64 } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const segs = r.json.resultado.documento.secoes[0].linhas[0].segmentos;
    assert.deepEqual(segs.map((s) => s.acorde), ['G', 'D']);
    assert.equal(segs[1].texto, 'coisa');
  });

  await t('arquivo que mente a extensão é recusado', async () => {
    const r = await req('POST', B + '/importar/arquivo', { como: 'ana', corpo: { nome: 'x.docx', base64: Buffer.from('não sou zip').toString('base64') } });
    assert.equal(r.status, 415);
  });

  await t('SSRF: loopback, metadados da nuvem, IPv6 interno, .local e porta estranha são recusados ANTES da rede', async () => {
    for (const u of ['http://127.0.0.1/x', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://[::ffff:10.0.0.1]/',
      'http://intranet.local/', 'http://localhost:3000/', 'https://exemplo.com:8443/', 'file:///etc/passwd', 'http://user:senha@exemplo.com/', 'http://10.1.2.3/']) {
      const r = await req('POST', B + '/importar/url', { como: 'ana', corpo: { url: u } });
      assert.equal(r.status, 400, u + ' → ' + r.status);
    }
    assert.ok(rede.ipBloqueado('100.64.0.1') && rede.ipBloqueado('fd00::1') && rede.ipBloqueado('64:ff9b::a00:1'));
    assert.ok(!rede.ipBloqueado('8.8.8.8') && !rede.ipBloqueado('2606:4700::1111'));
  });

  await t('DNS que resolve para rede interna é recusado no lookup (sem rebinding)', async () => {
    const erro = await new Promise((r) => rede.lookupSeguro('localhost', {}, (e) => r(e)));
    assert.ok(erro && erro.codigo === 'SSRF');
  });

  // Transporte falso: o pipeline inteiro roda, sem sair para a internet.
  const PAGINAS = {
    'https://www.cifraclub.com.br/robots.txt': { status: 200, tipo: 'text/plain', corpo: 'User-agent: *\nDisallow: /proibido/\n' },
    'https://www.cifraclub.com.br/tom-jobim/wave/': { status: 200, tipo: 'text/html; charset=utf-8',
      corpo: '<html><head><title>Wave - Tom Jobim</title><script>alert(1)</script></head><body><h1 class="t1">Wave</h1><h2 class="t3"><a>Tom Jobim</a></h2>'
        + '<span id="cifra_tom"><a>D</a></span><pre>[Intro] <b>D7M</b>  <b>Bb°</b>\n\n<b>D7M</b>          <b>Bb°</b>\nVou te contar\n<b>Am7</b>      <b>D7(9)</b>\nos olhos já não podem ver</pre></body></html>' },
    'https://www.cifras.com.br/robots.txt': { status: 404, tipo: 'text/plain', corpo: '' },
    'https://www.cifras.com.br/cifra/tom-jobim/wave': { status: 500, tipo: 'text/html', corpo: 'erro' },
    'https://exemplo.com.br/robots.txt': { status: 200, tipo: 'text/plain', corpo: 'User-agent: *\nDisallow: /privado\n' },
    'https://exemplo.com.br/privado/c': { status: 200, tipo: 'text/html', corpo: '<pre>C\nx</pre>' },
    'https://exemplo.com.br/r': { status: 301, local: 'http://127.0.0.1/admin' },
  };
  const transporte = async (u) => {
    const pg = PAGINAS[u.toString()];
    if (!pg) { const e = new Error('404'); e.status = 404; e.permanente = true; throw e; }
    if (pg.local) return { redirecionar: pg.local, status: pg.status };
    if (pg.status >= 400) { const e = new Error('A página respondeu ' + pg.status + '.'); e.status = pg.status; e.permanente = pg.status < 500; throw e; }
    return { status: pg.status, tipo: pg.tipo, corpo: Buffer.from(pg.corpo) };
  };

  await t('URL de site de cifra: adaptador extrai o <pre>, título, artista e tom; script da página é ignorado', async () => {
    rede._limpar(); Importar._transporte(transporte);
    const r = Importar.url('u-ana', { url: 'https://www.cifraclub.com.br/tom-jobim/wave/' });
    await r._promessa;
    const o = Importar.obter('u-ana', r.importacao.id);
    assert.equal(o.importacao.status, 'pronta', o.importacao.erro);
    assert.equal(o.resultado.documento.meta.titulo, 'Wave');
    assert.equal(o.resultado.documento.meta.artista, 'Tom Jobim');
    assert.equal(o.resultado.documento.meta.tom, 'D');
    assert.ok(!/alert/.test(JSON.stringify(o.resultado.documento)));
    assert.equal(o.resultado.fonte.adaptador, 'cifraclub');
  });

  await t('robots.txt que proíbe é respeitado; redirecionamento para rede interna é recusado', async () => {
    const a = Importar.url('u-ana', { url: 'https://exemplo.com.br/privado/c' }); await a._promessa;
    const oa = Importar.obter('u-ana', a.importacao.id);
    assert.equal(oa.importacao.status, 'falhou');
    assert.match(oa.importacao.erro, /robots/);
    const b = Importar.url('u-ana', { url: 'https://exemplo.com.br/r' }); await b._promessa;
    const ob = Importar.obter('u-ana', b.importacao.id);
    assert.equal(ob.importacao.status, 'falhou');
    assert.match(ob.importacao.erro, /interna/);
  });

  await t('BUSCA externa: uma fonte cai (500) e a outra responde — a busca NÃO cai, e a falha vem NOMEADA', async () => {
    rede._limpar();
    const r = Importar.buscar('u-ana', { titulo: 'Wave', artista: 'Tom Jobim' });
    await r.tarefa._promessa;
    const o = Importar.obter('u-ana', r.tarefa.importacao.id);
    assert.equal(o.importacao.status, 'pronta', o.importacao.erro);
    assert.equal(o.resultado.candidatos.length, 1);
    assert.equal(o.resultado.candidatos[0].adaptador, 'cifraclub');
    assert.ok(o.resultado.falhas.some((f) => f.fonte === 'Cifras.com.br'));
    assert.ok(o.resultado.candidatos[0].ranking.score > 0);
    const salvo = Importar.salvar('u-ana', r.tarefa.importacao.id, { candidato_id: o.candidatos[0].id });
    assert.ok(salvo.cifra_id);
    const f = db.prepare('SELECT * FROM cifra_fontes WHERE obra_id = ?').get(salvo.obra_id);
    assert.equal(f.adaptador, 'Cifra Club'.length ? f.adaptador : '');
    assert.match(f.url, /cifraclub/);
  });

  await t('LEITURA DE FOTO por IA: desligada por padrão; ligada, vira prévia marcada "confira"; e respeita a cota', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
    const off = await Importar.arquivo('u-ana', { nome: 'foto.png', base64: png });
    await new Promise((x) => setTimeout(x, 50));
    const o1 = Importar.obter('u-ana', off.importacao.id);
    assert.equal(o1.importacao.status, 'falhou', 'sem provedor ativo, não finge que leu');
    router.injetarParaTeste('anthropic', async ({ capability }) => (capability === 'cifra.ler_imagem'
      ? { texto: 'Em       C\nNa foto estava', titulo: 'Foto', confianca: 0.7 } : {}));
    router.definirProvedor({ capability: 'cifra.ler_imagem', provider: 'anthropic', model: 'claude-sonnet-5', ativo: 1, creditos: 3, custoEstimadoCentavos: 4, promptVersao: 'cifras-v1' });
    repo.Config.set('cifras.cota_ia_dia', 1);
    const on = await Importar.arquivo('u-ana', { nome: 'foto.png', base64: png });
    for (let k = 0; k < 20 && Importar.obter('u-ana', on.importacao.id).importacao.status !== 'pronta'; k++) await new Promise((x) => setTimeout(x, 30));
    const o2 = Importar.obter('u-ana', on.importacao.id);
    assert.equal(o2.importacao.status, 'pronta', o2.importacao.erro);
    assert.ok(o2.resultado.ambiguidades.some((a) => /IA/.test(a.motivo)));
    const cheia = await Importar.arquivo('u-ana', { nome: 'foto.png', base64: png });
    for (let k = 0; k < 20 && ['pendente', 'processando'].includes(Importar.obter('u-ana', cheia.importacao.id).importacao.status); k++) await new Promise((x) => setTimeout(x, 30));
    assert.match(Importar.obter('u-ana', cheia.importacao.id).importacao.erro, /limite diário/);
    repo.Config.set('cifras.cota_ia_dia', 40);
    router.definirProvedor({ capability: 'cifra.ler_imagem', provider: 'anthropic', model: 'claude-sonnet-5', ativo: 0, creditos: 3, custoEstimadoCentavos: 4, promptVersao: 'cifras-v1' });
    router.injetarParaTeste('anthropic', null);
    Importar._transporte(null);
  });

  await t('importação de outra pessoa é invisível', async () => {
    assert.equal((await req('GET', `${B}/importar/${imp.importacao.id}`, { como: 'bruno' })).status, 404);
  });

  // ===================================================================
  secao('Cifras · exportação, LGPD e comunidade');

  await t('exporta TXT, ChordPro (ida e volta) e PDF de verdade, na visão pedida', async () => {
    const t1 = await req('GET', `${B}/cifras/${cifra.id}/exportar/txt?tom=G`, { como: 'ana', cru: true });
    assert.equal(t1.status, 200);
    assert.ok(t1.texto.includes('G7M'));
    const cp = await req('GET', `${B}/cifras/${cifra.id}/exportar/chordpro`, { como: 'ana', cru: true });
    const D = require('./motor/documento');
    const volta = D.deChordPro(cp.texto);
    assert.equal(D.acordesEmOrdem(volta)[0], 'F7M');
    const pdf = await fetch(req.base() + `${B}/cifras/${cifra.id}/exportar/pdf?diagramas=1`, { headers: { Cookie: req.cookieDe('ana') } });
    const buf = Buffer.from(await pdf.arrayBuffer());
    assert.equal(buf.slice(0, 4).toString(), '%PDF');
    assert.ok(buf.length > 1500);
    const sp = await fetch(req.base() + `${B}/setlists/${setlist.id}/exportar/pdf`, { headers: { Cookie: req.cookieDe('bruno') } });
    assert.equal(Buffer.from(await sp.arrayBuffer()).slice(0, 4).toString(), '%PDF');
  });

  await t('proposta de correção: quem não edita PROPÕE; o dono aceita e vira revisão "correcao"', async () => {
    const c = (await req('GET', `${B}/cifras/${cifra.id}`, { como: 'forasteiro' })).json;
    const doc = JSON.parse(JSON.stringify(c.documento));
    doc.secoes[0].linhas[0].segmentos[0].acorde = 'Fmaj7';
    doc.secoes[1].linhas[1].segmentos[1].acorde = 'Gm7(9)';
    const p = await req('POST', `${B}/cifras/${cifra.id}/propostas`, { como: 'forasteiro', corpo: { documento: doc, descricao: 'nona' } });
    assert.equal(p.status, 200, JSON.stringify(p.json));
    const lista = await req('GET', `${B}/cifras/${cifra.id}/propostas`, { como: 'ana' });
    await req('POST', `${B}/propostas/${lista.json.propostas[0].id}/decidir`, { como: 'ana', corpo: { aceitar: true } });
    const h = await req('GET', `${B}/cifras/${cifra.id}/revisoes`, { como: 'ana' });
    assert.equal(h.json.revisoes[0].tipo, 'correcao');
    const rep = await req('GET', B + '/reputacao', { como: 'forasteiro' });
    assert.equal(rep.json.correcoes_aceitas, 1);
  });

  await t('avaliação: dono não avalia a própria; denúncia procedente RECOLHE a cifra', async () => {
    assert.equal((await req('POST', `${B}/cifras/${cifra.id}/avaliacao`, { como: 'ana', corpo: { precisao: 5, facilidade: 5 } })).status, 400);
    const a = await req('POST', `${B}/cifras/${cifra.id}/avaliacao`, { como: 'bruno', corpo: { precisao: 4, facilidade: 3 } });
    assert.equal(a.json.n, 1);
    const extra = (await req('POST', `${B}/musicas/${obra.id}/cifras`, { como: 'ana', corpo: { texto: 'C\nspam' } })).json.cifra;
    const d = await req('POST', B + '/denuncias', { como: 'bruno', corpo: { alvo_tipo: 'cifra', alvo_id: extra.id, motivo: 'errada' } });
    const fila = await req('GET', '/staff/api/music/cifras/moderacao');
    assert.ok(fila.json.denuncias.some((x) => x.id === d.json.id));
    await req('POST', `/staff/api/music/cifras/denuncias/${d.json.id}`, { corpo: { procedente: true, motivo: 'teste' } });
    assert.equal((await req('GET', `${B}/cifras/${extra.id}`, { como: 'bruno' })).status, 403);
  });

  await t('staff: resumo com importações, sessões ao vivo e custo de IA', async () => {
    const r = await req('GET', '/staff/api/music/cifras/resumo');
    assert.equal(r.status, 200);
    assert.ok(r.json.musicas >= 3);
    assert.ok(r.json.importacoes.por_tipo.length >= 1);
    assert.equal(r.json.busca_fts, true);
  });

  await t('LGPD: backup com TUDO que é da pessoa; exclusão exige a frase e respeita banda', async () => {
    const b = await req('GET', B + '/meus-dados', { como: 'ana', cru: true });
    const dados = JSON.parse(b.texto);
    assert.ok(dados.musicas.length >= 3 && dados.revisoes.length >= 3 && dados.setlists.length >= 1);
    assert.equal((await req('POST', B + '/meus-dados/excluir', { como: 'ana', corpo: { confirmacao: 'sim' } })).status, 400);
    const dona = await req('POST', B + '/meus-dados/excluir', { como: 'ana', corpo: { confirmacao: 'EXCLUIR MINHAS CIFRAS' } });
    assert.equal(dona.status, 409, 'proprietária de banda precisa transferir antes');
    const nova = await req('POST', B + '/musicas', { como: 'sec', corpo: { titulo: 'Minha só', texto: 'C\nlá' } });
    assert.equal(nova.status, 200);
    const x = await req('POST', B + '/meus-dados/excluir', { como: 'sec', corpo: { confirmacao: 'EXCLUIR MINHAS CIFRAS' } });
    assert.equal(x.status, 200, JSON.stringify(x.json));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM obras WHERE dono = 'u-sec'").get().n, 0);
  });

  // ===================================================================
  secao('Cifras · cliente servido');

  await t('o MOTOR é servido ao navegador, compila e expõe o mesmo motor do servidor', async () => {
    const r = await req('GET', '/music/motor-cifras.js', { cru: true });
    assert.equal(r.status, 200);
    const self = {};
    new Function('self', r.texto)(self);
    const M = self.MusiqueMotor;
    assert.ok(M.nota && M.acorde && M.harmonia && M.documento && M.instrumentos);
    const d = M.documento.deChordPro('{key: C}\n[C]a [Bb]b');
    assert.deepEqual(M.documento.acordesEmOrdem(M.documento.transpor(d, 7)), ['G', 'F']);
    assert.equal(M.instrumentos.formas('C', 'violao').formas[0].desenho, 'x32010');
  });

  await t('o CLIENTE das cifras é servido INTEIRO, compila, e a página do app o carrega com o CSS', async () => {
    const js = await req('GET', '/music/cifras.js', { cru: true });
    assert.equal(js.status, 200);
    assert.ok(js.texto.length > 100000, 'tamanho suspeito: ' + js.texto.length + ' (arquivo truncado compila vazio)');
    for (const f of ['base', 'render', 'rolagem', 'escuta', 'telas-acervo', 'editor', 'importar', 'palco', 'bandas']) assert.ok(js.texto.includes('cliente/' + f + '.js'), f);
    assert.ok(js.texto.includes("'Tirar do áudio'") && js.texto.includes('Tom do áudio') && js.texto.includes('botaoSeguir'), 'as três funções de áudio estão ligadas às telas');
    new Function('window', js.texto);
    const css = await req('GET', '/music/cifras.css', { cru: true });
    assert.ok(css.texto.includes('.cf-doc') && css.texto.includes('.cf-palco'));
    assert.ok(!/\.cf-sec\{|\.cf-com\{/.test(css.texto), 'classe que colide com a cifra da Fase 2 voltou');
    const app = await req('GET', '/music/app', { cru: true });
    ['/music/cifras.css', '/music/motor-cifras.js', '/music/cifras.js'].forEach((u) => assert.ok(app.texto.includes(u), u));
    assert.ok(app.texto.indexOf('/music/motor-cifras.js') < app.texto.indexOf('/music/cifras.js'), 'o motor carrega antes do cliente');
  });

  await t('Cifra Club com o HTML NOVO (sem t1/t3): título e artista saem do <title>, sem o "- Cifra Club"', async () => {
    const { paraUrl } = require('./importar/fontes-externas');
    const a = paraUrl('https://www.cifraclub.com.br/legiao-urbana/tempo-perdido/');
    assert.equal(a.id, 'cifraclub');
    const html = '<html><head><title>Tempo Perdido - Legião Urbana - Cifra Club</title></head><body><h1 class="xYz">Tempo Perdido</h1><pre>Em   C\nlinha\n</pre></body></html>';
    const x = a.extrair(html);
    assert.equal(x.titulo, 'Tempo Perdido', 'o título não pode levar " - Legião Urbana - Cifra Club"');
    assert.equal(x.artista, 'Legião Urbana', 'sem artista a duplicata escapa');
  });

  await t('o TRABALHADOR de áudio é servido, carrega o motor e responde ao pedido de tom e de transcrição', async () => {
    const w = await req('GET', '/music/cifras-trabalhador.js', { cru: true });
    assert.equal(w.status, 200);
    assert.match(w.texto, /importScripts\('\/music\/motor-cifras\.js'\)/);
    const motor = (await req('GET', '/music/motor-cifras.js', { cru: true })).texto;
    const escopo = { postMessage(m) { escopo.saida.push(m); }, saida: [] };
    escopo.self = escopo;
    new Function('self', 'importScripts', 'postMessage', w.texto + '\nself.onmessage = onmessage;')(escopo, () => new Function('self', motor)(escopo), (m) => escopo.saida.push(m));
    const la = new Float32Array(22050); for (let k = 0; k < la.length; k++) la[k] = Math.sin(2 * Math.PI * 440 * k / 22050);
    escopo.onmessage({ data: { id: 1, tipo: 'tom', amostras: la, semitons: 12 } });
    const r = escopo.saida[0];
    assert.ok(r.ok && r.amostras.length === la.length);
    assert.ok(Math.abs(escopo.MusiqueMotor.audio.frequenciaDominante(r.amostras.subarray(2000), 22050) - 880) < 9);
    escopo.onmessage({ data: { id: 2, tipo: 'transcrever', amostras: la, taxa: 22050 } });
    assert.ok(escopo.saida[1].ok && escopo.saida[1].resultado);
  });

  await t('rascunho tirado do ÁUDIO: procedência "audio", confiança da análise e aviso de conferência', async () => {
    const r = await req('POST', B + '/importar/texto', { como: 'ana', corpo: { texto: '{key: G}\n{ci: 0:00}\n[G]     [C]?     [D]', titulo: 'Da gravação', origem: 'audio', confianca: 0.6, bpm: 96 } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.importacao.tipo, 'audio');
    assert.equal(r.json.resultado.fonte.tipo, 'audio');
    assert.ok(r.json.resultado.confianca <= 0.6, 'a confiança da análise limita a da prévia');
    assert.match(r.json.resultado.ambiguidades[0].motivo, /ÁUDIO/);
    const s = await req('POST', `${B}/importar/${r.json.importacao.id}/salvar`, { como: 'ana', corpo: { destino: 'nova_musica', meta: { titulo: 'Da gravação' } } });
    assert.equal(s.status, 200, JSON.stringify(s.json));
    assert.equal(db.prepare('SELECT tipo FROM cifra_fontes WHERE obra_id = ?').get(s.json.obra_id).tipo, 'audio');
  });

  await t('funções puras do cliente: linha ⇄ caracteres do editor (propriedade) e visão transposta', async () => {
    const motor = (await req('GET', '/music/motor-cifras.js', { cru: true })).texto;
    const cliente = (await req('GET', '/music/cifras.js', { cru: true })).texto;
    const janela = { MusiqueUI: { $: () => null, el: () => ({}), esc: (x) => x, api: () => Promise.resolve({}), aviso() {}, erro() {}, ir() {} },
      addEventListener() {}, requestAnimationFrame() {}, cancelAnimationFrame() {} };
    const documento = { readyState: 'complete', addEventListener() {}, removeEventListener() {} };
    const nav = { onLine: true };
    new Function('self', motor)(janela);
    new Function('window', 'document', 'navigator', 'location', 'history', cliente)(janela, documento, nav, { hash: '', pathname: '/music/app', search: '' }, { replaceState() {} });
    const C = janela.MusiqueCifras;
    const U2 = C.editorUtil;
    const Dm = janela.MusiqueMotor.documento;
    let semente = 7;
    const rnd = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff; };
    for (let k = 0; k < 300; k++) {
      const segs = [];
      const n = 1 + Math.floor(rnd() * 5);
      for (let g = 0; g < n; g++) segs.push({ acorde: g === 0 && rnd() < 0.3 ? null : ['C', 'G7', 'Am7(9)', 'D/F#'][Math.floor(rnd() * 4)], texto: ['Olha ', 'que ', 'coi', 'sa', 'ção '][Math.floor(rnd() * 5)] });
      segs[segs.length - 1].texto = segs[segs.length - 1].texto.trim() || 'x';
      const linha = Dm.deChordPro(Dm.paraChordPro({ formato: 'musique.cifra', versao: 1, meta: {}, secoes: [{ tipo: 'verso', rotulo: '', linhas: [{ tipo: 'letra', segmentos: segs }] }] })).secoes[0].linhas[0];
      const cc = U2.paraCaracteres(linha);
      assert.deepEqual(U2.deCaracteres(cc.texto, cc.marcas), linha.segmentos, JSON.stringify(linha.segmentos));
    }
    const doc = Dm.deChordPro('{key: G}\n[G]a [C]b [D7]c');
    const v = C.R.aplicarVisao(doc, { tom: 'A', capo: 2 });
    assert.equal(v.tom_soando, 'A');
    assert.equal(v.tom_formas, 'G');
    assert.deepEqual(Dm.acordesEmOrdem(v.doc), ['G', 'C', 'D7']);
  });
}

module.exports = { rodar };
