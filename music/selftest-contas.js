// =====================================================================
// Musique — testes das CONTAS PRÓPRIAS (ADR-0011, 28/09/2026).
//
// Cada teste existe por uma frase do Augusto:
//   "Apenas a minha senha eu aceito compartilhar nos dois sistemas, que
//    são independentes. Apenas os cursos criados na Academia devem ter
//    relação com o Musique."
// Por isso o teste que mais importa é o que TENTA entrar com a sessão da
// Academia e precisa levar 401.
// =====================================================================
'use strict';
const sessaoAcademy = require('../nucleo/sessao-academy');
const jwt = require('jsonwebtoken');

async function rodar({ t, secao, req, assert, contas, CONTAS, EMAILS, ACAD, CURSOS, SEGREDO, cookieDe, repo, PROFESSORES }) {
  // Cookie da conta que acabou de nascer pela API (o Set-Cookie da resposta).
  const cookieDaResposta = (r) => {
    const c = (r.setCookie || []).find((x) => x.startsWith(contas.COOKIE + '='));
    return c ? c.split(';')[0] : '';
  };
  const cadastrar = (email, extra = {}) => req('POST', '/music/api/conta/cadastrar', {
    corpo: { nome: 'Pessoa ' + email, email, senha: 'senha-boa-123', aceite_termos: true, ...extra },
  });

  secao('ADR-0011 · conta própria: Musique e Academia são independentes');

  await t('sem sessão, /music/api/me devolve 401 apontando para a entrada DO MUSIQUE', async () => {
    const r = await req('GET', '/music/api/me');
    assert.equal(r.status, 401);
    assert.equal(r.json.entrar, '/music/entrar', '401 tem de dizer por onde entrar — e é pelo Musique, não pela Academia');
  });

  await t('com a sessão do Musique, /music/api/me responde e cria a projeção musical', async () => {
    const r = await req('GET', '/music/api/me', { como: 'ana' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.conta.email, 'ana@t');
    assert.ok(repo.Usuarios.porId('u-ana'), 'a projeção musical devia nascer no primeiro acesso');
  });

  await t('A SESSÃO DA ACADEMIA NÃO ABRE O MUSIQUE — nem com o mesmo id, nem com o mesmo segredo', async () => {
    // Cookie legítimo da Academia, assinado com o MESMO segredo da casa.
    const tokAcad = sessaoAcademy.assinar('u-ana', 'jti-academia', SEGREDO);
    const r1 = await req('GET', '/music/api/me', { headers: { Cookie: `${sessaoAcademy.COOKIE}=${tokAcad}` } });
    assert.equal(r1.status, 401, 'cookie academy_sess não pode valer aqui');
    // E o mesmo token enfiado no NOME do cookie do Musique também não:
    // falta o `tipo: musique` e a sessão não existe em sessoes_music.
    const r2 = await req('GET', '/music/api/me', { headers: { Cookie: `${contas.COOKIE}=${tokAcad}` } });
    assert.equal(r2.status, 401, 'token de outro produto com o nome certo ainda não é sessão do Musique');
    // Token com tipo certo mas jti inventado: sessão inexistente.
    const forjado = jwt.sign({ tipo: 'musique', cid: 'u-ana', jti: 'inventado' }, SEGREDO);
    const r3 = await req('GET', '/music/api/me', { headers: { Cookie: `${contas.COOKIE}=${forjado}` } });
    assert.equal(r3.status, 401, 'sem linha em sessoes_music não há sessão');
  });

  await t('quem só tem conta na Academia NÃO entra no Musique com a senha de lá', async () => {
    const bia = ACAD.find((a) => a.id === 'acad-bia');
    const r = await req('POST', '/music/api/conta/entrar', { corpo: { email: bia.email, senha: bia.senha } });
    assert.equal(r.status, 401);
    assert.match(r.json.erro, /separada da Academia/, 'a recusa explica por que — senão parece senha errada');
    assert.equal(contas.Contas.buscarPorEmail(bia.email), null, 'convite por e-mail não enxerga conta só da Academia');
  });

  await t('conta suspensa não entra', async () => {
    assert.equal((await req('GET', '/music/api/me', { como: 'suspenso' })).status, 401);
  });

  await t('SÓ A CONTA DO DONO nasce com a mesma senha — e com o mesmo id, para nada dele se perder', async () => {
    const dono = ACAD[0];
    const c = contas.Contas.porEmail(dono.email);
    assert.ok(c, 'a conta do dono devia ter sido semeada na montagem');
    assert.equal(c.id, dono.id, 'mesmo id = as cifras e bandas antigas dele continuam dele');
    assert.equal(c.origem, 'dono');
    const r = await req('POST', '/music/api/conta/entrar', { corpo: { email: dono.email, senha: dono.senha } });
    assert.equal(r.status, 200, 'a senha da Academia do dono entra no Musique');
    // Nenhuma outra conta da Academia foi copiada.
    ACAD.slice(1).forEach((a) => assert.equal(contas.Contas.porEmail(a.email), null, a.email + ' não podia ter sido copiada'));
  });

  await t('trocar a senha do dono aqui NÃO é desfeito pela semeadura (duas contas, cada uma segue sozinha)', async () => {
    const dono = ACAD[0];
    contas.Contas.trocarSenha(dono.id, 'senha-nova-do-musique');
    const r = contas.semearDono(() => dono);
    assert.ok(r.ja_existia, 'semear de novo tem de reconhecer a conta existente');
    assert.ok(contas.Contas.conferirSenha(contas.Contas.porId(dono.id), 'senha-nova-do-musique'), 'a senha trocada aqui continua valendo');
    assert.ok(!contas.Contas.conferirSenha(contas.Contas.porId(dono.id), dono.senha), 'e a da Academia deixou de valer aqui');
  });

  secao('ADR-0011 · cadastro, entrada, saída e senha');

  await t('cadastro exige aceite dos termos, e-mail válido e senha de 8+', async () => {
    let r = await req('POST', '/music/api/conta/cadastrar', { corpo: { nome: 'X', email: 'x@t', senha: 'senha-boa-123' } });
    assert.equal(r.status, 400); assert.match(r.json.erro, /Termos/);
    r = await cadastrar('curta@t', { senha: '123' });
    assert.equal(r.status, 400); assert.match(r.json.erro, /8/);
    r = await cadastrar('sem-arroba');
    assert.equal(r.status, 400);
  });

  let ckNova = '';
  await t('cadastro cria a conta, já entra, e o cookie é httpOnly e só de /music', async () => {
    const r = await cadastrar('nova@t');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const bruto = (r.setCookie || []).find((x) => x.startsWith(contas.COOKIE + '='));
    assert.ok(bruto, 'sem Set-Cookie do Musique: ' + JSON.stringify(r.setCookie));
    assert.match(bruto, /HttpOnly/i);
    assert.match(bruto, /Path=\/music(;|$)/, 'cookie do Musique não pode vazar para /academy nem para o resto do site');
    ckNova = cookieDaResposta(r);
    const me = await req('GET', '/music/api/me', { headers: { Cookie: ckNova } });
    assert.equal(me.status, 200);
    assert.equal(me.json.conta.email, 'nova@t');
    assert.ok(EMAILS.some((e) => e.para === 'nova@t' && /Musique/.test(e.assunto)), 'boas-vindas do Musique, não da Academia');
    assert.equal((await cadastrar('NOVA@t')).status, 400, 'e-mail repetido (com outra caixa) não cria segunda conta');
  });

  await t('entrar: senha errada é 401; certa abre sessão; sair revoga a sessão de verdade', async () => {
    assert.equal((await req('POST', '/music/api/conta/entrar', { corpo: { email: 'nova@t', senha: 'errada-123' } })).status, 401);
    const r = await req('POST', '/music/api/conta/entrar', { corpo: { email: 'nova@t', senha: 'senha-boa-123' } });
    assert.equal(r.status, 200);
    const ck = cookieDaResposta(r);
    assert.equal((await req('GET', '/music/api/me', { headers: { Cookie: ck } })).status, 200);
    await req('POST', '/music/api/conta/sair', { headers: { Cookie: ck } });
    assert.equal((await req('GET', '/music/api/me', { headers: { Cookie: ck } })).status, 401, 'o mesmo cookie, depois de sair, não pode valer');
  });

  await t('esqueci a senha: resposta idêntica com e sem conta; o link vale UMA vez', async () => {
    const antes = EMAILS.length;
    const a = await req('POST', '/music/api/conta/senha/esquecer', { corpo: { email: 'ninguem@t' } });
    const b = await req('POST', '/music/api/conta/senha/esquecer', { corpo: { email: 'nova@t' } });
    assert.equal(a.status, 200); assert.deepEqual(a.json, b.json, 'resposta diferente enumera e-mails');
    const novos = EMAILS.slice(antes);
    assert.equal(novos.length, 1, 'só quem tem conta recebe');
    const tok = (novos[0].html.match(/token=([\w.\-]+)/) || [])[1];
    assert.ok(tok, 'o e-mail traz o link');
    assert.ok(novos[0].html.includes('/music/redefinir-senha?token='), 'o link aponta para o Musique');
    let r = await req('POST', '/music/api/conta/senha/redefinir', { corpo: { token: tok, senha: 'senha-trocada-9' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    r = await req('POST', '/music/api/conta/senha/redefinir', { corpo: { token: tok, senha: 'outra-senha-99' } });
    assert.equal(r.status, 400, 'link já usado não pode trocar a senha de novo');
    assert.equal((await req('GET', '/music/api/me', { headers: { Cookie: ckNova } })).status, 401, 'redefinir derruba as sessões abertas');
    assert.equal((await req('POST', '/music/api/conta/entrar', { corpo: { email: 'nova@t', senha: 'senha-trocada-9' } })).status, 200);
  });

  await t('trocar a senha logado: derruba as OUTRAS sessões e mantém a de quem trocou', async () => {
    const r1 = await req('POST', '/music/api/conta/entrar', { corpo: { email: 'nova@t', senha: 'senha-trocada-9' } });
    const outra = cookieDaResposta(await req('POST', '/music/api/conta/entrar', { corpo: { email: 'nova@t', senha: 'senha-trocada-9' } }));
    const r = await req('POST', '/music/api/conta/senha', { headers: { Cookie: cookieDaResposta(r1) }, corpo: { senha_atual: 'senha-trocada-9', senha_nova: 'terceira-senha-1' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal((await req('GET', '/music/api/me', { headers: { Cookie: cookieDaResposta(r) } })).status, 200, 'quem trocou continua dentro');
    assert.equal((await req('GET', '/music/api/me', { headers: { Cookie: outra } })).status, 401, 'a outra sessão caiu');
  });

  secao('ADR-0011 · o elo são os cursos (vitrine, trilha → curso, professor)');

  await t('a vitrine mostra os cursos de música da Academia com endereço ABSOLUTO da Academia', async () => {
    const r = await req('GET', '/music/api/cursos');
    assert.equal(r.status, 200);
    assert.equal(r.json.cursos.length, CURSOS.length);
    r.json.cursos.forEach((c) => assert.match(c.url, /^https:\/\/academia\.villelastay\.com\.br\/academy\/cursos\//,
      'no host do Musique, /academy/... seria redirecionado para /music/academy/... e daria 404'));
  });

  await t('trilha → curso: o staff liga; curso inexistente é recusado; a trilha passa a mostrar o curso', async () => {
    const trilha = require('./academia').Trilhas.listar()[0];
    assert.equal((await req('PUT', '/staff/api/music/trilhas-cursos/' + trilha.id, { corpo: { curso_slug: 'nao-existe' } })).status, 400);
    assert.equal((await req('PUT', '/staff/api/music/trilhas-cursos/' + trilha.id, { staff: 'op', corpo: { curso_slug: 'violao-do-zero' } })).status, 403, 'só admin liga');
    const r = await req('PUT', '/staff/api/music/trilhas-cursos/' + trilha.id, { corpo: { curso_slug: 'violao-do-zero' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const e = await req('GET', '/music/api/estudo', { como: 'ana' });
    const t1 = e.json.trilhas.find((x) => x.id === trilha.id);
    assert.ok(t1.curso_academia && t1.curso_academia.slug === 'violao-do-zero', 'a trilha tinha de trazer o curso ligado');
    const painel = await req('GET', '/staff/api/music/trilhas-cursos');
    assert.ok(painel.json.trilhas.some((x) => x.id === trilha.id) && painel.json.cursos.length === CURSOS.length, 'o painel precisa das trilhas e dos cursos para montar a escolha');
    assert.ok(painel.json.ligacoes.some((l) => l.trilha_id === trilha.id && l.curso_slug === 'violao-do-zero'));
    await req('PUT', '/staff/api/music/trilhas-cursos/' + trilha.id, { corpo: { curso_slug: '' } });
    const e2 = await req('GET', '/music/api/estudo', { como: 'ana' });
    assert.equal(e2.json.trilhas.find((x) => x.id === trilha.id).curso_academia, null, 'desligar remove');
  });

  await t('professor pela Academia: só quem PROVA ser produtor aprovado; aluno de lá e 2FA sem código são recusados', async () => {
    const ck = cookieDaResposta(await cadastrar('professora@t'));
    const prof = () => req('GET', '/music/api/prof/tarefas', { headers: { Cookie: ck } });
    assert.equal((await prof()).status, 403, 'conta nova do Musique não é professora');
    let r = await req('POST', '/music/api/conta/vincular-academia', { headers: { Cookie: ck }, corpo: { email: 'bia@academia', senha: 'errada' } });
    assert.equal(r.status, 400);
    r = await req('POST', '/music/api/conta/vincular-academia', { headers: { Cookie: ck }, corpo: { email: 'caio@academia', senha: 'senha-do-caio-1' } });
    assert.equal(r.status, 400); assert.match(r.json.erro, /produtor/);
    r = await req('POST', '/music/api/conta/vincular-academia', { headers: { Cookie: ck }, corpo: { email: 'duda@academia', senha: 'senha-da-duda-1' } });
    assert.equal(r.status, 400); assert.ok(r.json.precisa_2fa, 'quem usa 2FA na Academia não perde a proteção aqui');
    r = await req('POST', '/music/api/conta/vincular-academia', { headers: { Cookie: ck }, corpo: { email: 'bia@academia', senha: 'senha-da-bia-1' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal((await prof()).status, 200, 'vinculada a produtor aprovado: área de professor liberada');
    const c = contas.Contas.porEmail('professora@t');
    assert.ok(!JSON.stringify(c).includes('senha-da-bia-1'), 'a senha da Academia não é guardada');
    // A mesma conta de produtor não serve a duas contas do Musique.
    const ck2 = cookieDaResposta(await cadastrar('outra-prof@t'));
    r = await req('POST', '/music/api/conta/vincular-academia', { headers: { Cookie: ck2 }, corpo: { email: 'bia@academia', senha: 'senha-da-bia-1' } });
    assert.equal(r.status, 400);
    assert.equal((await req('DELETE', '/music/api/conta/vincular-academia', { headers: { Cookie: ck } })).status, 200);
    assert.equal((await prof()).status, 403, 'desfeito o vínculo, a área fecha');
    assert.ok(PROFESSORES.has('u-prof'));
  });

  secao('ADR-0011 · a entrada é do Musique');

  await t('landing, app e ferramentas não mandam mais ninguém para a Academia para entrar', async () => {
    for (const u of ['/music', '/music/ferramentas', '/music/entrar']) {
      const r = await req('GET', u, { cru: true });
      assert.equal(r.status, 200, u);
      assert.ok(!/href="\/academy\/app/.test(r.texto), u + ' ainda aponta para o login da Academia');
    }
    const land = await req('GET', '/music', { cru: true });
    assert.ok(land.texto.includes('href="/music/entrar"'), 'o Entrar da landing é do Musique');
    const app = await req('GET', '/music/app.js', { cru: true });
    assert.ok(app.texto.includes("'/music/entrar?voltar='") && !app.texto.includes('/academy/app'), 'o 401 do app volta para a entrada do Musique');
  });

  await t('a tela de entrada fala só com a API do Musique, e o "voltar" só aceita caminho do Musique', async () => {
    const js = (await req('GET', '/music/entrar.js', { cru: true })).texto;
    assert.ok(!js.includes('/academy/'), 'a entrada não pode chamar a Academia');
    assert.ok(js.includes('/music/api/conta/entrar') && js.includes('/music/api/conta/cadastrar'));
    new Function(js.replace(/document|location|fetch/g, 'void 0&&x'));   // compila
    const { destinoSeguro } = require('./entrada');
    ['/music/app', '/music/app#cifra=abc', '/music/app#cifras', '/music'].forEach((v) => assert.equal(destinoSeguro(v), v, 'aceita ' + v));
    ['//site-malicioso.com', 'https://site-malicioso.com', '/academy/app', '/music/../staff', 'javascript:alert(1)', '/musicx', '/music/a b']
      .forEach((v) => assert.equal(destinoSeguro(v), '/music/app', 'recusa ' + v));
    const red = await req('GET', '/music/redefinir-senha?token=x', { cru: true });
    assert.equal(red.status, 200);
    assert.equal(red.headers.get('referrer-policy'), 'no-referrer', 'o token do link não pode vazar em Referer');
  });

  await t('staff lista as contas do Musique (sem hash de senha)', async () => {
    const r = await req('GET', '/staff/api/music/contas');
    assert.equal(r.status, 200);
    assert.ok(r.json.total >= Object.keys(CONTAS).length);
    assert.ok(!JSON.stringify(r.json).includes('senha_hash'));
  });
}

module.exports = { rodar };
