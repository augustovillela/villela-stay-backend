// =====================================================================
// Musique — testes da ASSINATURA (28/09/2026).
// O Mercado Pago e a Academia são FALSOS (injetados pelo selftest.js);
// o caminho testado — rotas, webhook, ciclo, cortesia — é o de produção.
// =====================================================================
'use strict';

async function rodar({ t, secao, req, assert, MP, CORTESIA, AVISOS, contas, SEGREDO }) {
  const assinatura = require('./assinatura');
  const { db } = require('./db');
  const hook = (corpo, headers) => req('POST', '/music/api/pagamentos/mp', { corpo, headers });

  secao('Assinatura · R$ 250,00/mês e cortesia dos cursos da Academia');

  await t('a conta do DONO é cortesia vitalícia e recebe os cursos sem cobrança', async () => {
    const dono = db.prepare("SELECT id, email FROM contas_music WHERE origem = 'dono'").get();
    const a = assinatura.vigente(dono.id);
    assert.equal(a.status, 'cortesia'); assert.equal(a.origem, 'dono');
    await assinatura.sincronizar(dono.id);
    assert.ok(CORTESIA.concedidas.includes(dono.email), 'a cortesia do dono tem de chegar na Academia');
    await assert.rejects(() => Promise.resolve().then(() => assinatura.encerrarCortesia(dono.id)), /vitalícia/);
  });

  await t('quem não confirmou o e-mail NÃO assina (o e-mail é o caminho da matrícula)', async () => {
    const r = await req('POST', '/music/api/conta/cadastrar', { corpo: { nome: 'Sem Conf', email: 'semconf@t', senha: 'senha-boa-123', aceite_termos: true } });
    const ck = (r.setCookie || []).find((x) => x.startsWith(contas.COOKIE + '=')).split(';')[0];
    const a = await req('POST', '/music/api/assinatura/assinar', { headers: { Cookie: ck } });
    assert.equal(a.status, 400); assert.match(a.json.erro, /Confirme o seu e-mail/);
    assert.equal(MP.criados.length, 0, 'nada pode ir ao Mercado Pago');
  });

  let assinId = '', preId = '';
  await t('assinar cria preapproval MENSAL de R$ 250,00 com notification_url NO CORPO e devolve o link do MP', async () => {
    const st = await req('GET', '/music/api/assinatura', { como: 'ana' });
    assert.equal(st.json.plano.preco_cents, 25000);
    assert.equal(st.json.acesso, false);
    const r = await req('POST', '/music/api/assinatura/assinar', { como: 'ana' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.match(r.json.link, /^https:\/\/mp\.teste\//);
    const b = MP.criados[0];
    assert.equal(b.auto_recurring.transaction_amount, 250);
    assert.equal(b.auto_recurring.frequency_type, 'months');
    assert.equal(b.auto_recurring.currency_id, 'BRL');
    assert.match(b.notification_url, /\/music\/api\/pagamentos\/mp$/, 'sem isto o MP nunca avisa a assinatura (o painel não cobre preapproval)');
    assert.equal(b.payer_email, 'ana@t');
    assert.match(b.external_reference, /^musique:u-ana:/);
    assinId = r.json.assinatura_id; preId = MP.ultimoId;
    const st2 = await req('GET', '/music/api/assinatura', { como: 'ana' });
    assert.equal(st2.json.assinatura.status, 'pendente');
    assert.equal(st2.json.acesso, false, 'pendente não é pago: sem curso ainda');
  });

  await t('webhook "authorized": vira ativa, a Academia matricula pelo e-mail e o Augusto é avisado; repetido não duplica', async () => {
    MP.pre[preId].status = 'authorized';
    const r = await hook({ type: 'subscription_preapproval', data: { id: preId } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.resultado, 'registrado');
    assert.equal(assinatura.vigente('u-ana').status, 'ativa');
    assert.ok(CORTESIA.concedidas.includes('ana@t'));
    assert.ok(AVISOS.some((m) => /novo assinante/.test(m)));
    const r2 = await hook({ type: 'subscription_preapproval', data: { id: preId } });
    assert.equal(r2.json.resultado, 'ja-registrado', 'o MP reenvia a notificação: não pode virar dois pagamentos');
    const st = await req('GET', '/music/api/assinatura', { como: 'ana' });
    assert.equal(st.json.acesso, true);
    assert.ok(st.json.cortesia_academia && st.json.cortesia_academia.email === 'ana@t');
  });

  await t('mensalidade chega como subscription_authorized_payment (não como payment) e é idempotente', async () => {
    MP.aut.ap1 = { id: 'ap1', preapproval_id: preId, status: 'processed', transaction_amount: 250, payment: { id: 'pg1', status: 'approved' } };
    const r = await hook({ type: 'subscription_authorized_payment', data: { id: 'ap1' } });
    assert.equal(r.json.resultado, 'registrado');
    await hook({ type: 'subscription_authorized_payment', data: { id: 'ap1' } });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM assinatura_pagamentos WHERE ref = 'pg1'").get().n, 1);
  });

  await t('pagamento recusado → tolerância (curso fica); passou a tolerância → curso sai; pagou → volta', async () => {
    MP.aut.ap2 = { id: 'ap2', preapproval_id: preId, status: 'recycling', payment: { id: 'pg2', status: 'rejected' } };
    await hook({ type: 'subscription_authorized_payment', data: { id: 'ap2' } });
    assert.equal(assinatura.vigente('u-ana').status, 'inadimplente');
    assert.equal((await req('GET', '/music/api/assinatura', { como: 'ana' })).json.acesso, true, 'dentro dos 5 dias o curso continua');
    // 10 dias depois:
    db.prepare("UPDATE assinaturas_music SET inadimplente_desde = ? WHERE id = ?").run(new Date(Date.now() - 10 * 864e5).toISOString(), assinId);
    const antes = CORTESIA.revogadas.length;
    await assinatura.ciclo();
    assert.equal(CORTESIA.revogadas.length, antes + 1, 'passada a tolerância, a cortesia sai da Academia');
    assert.equal((await req('GET', '/music/api/assinatura', { como: 'ana' })).json.acesso, false);
    MP.aut.ap3 = { id: 'ap3', preapproval_id: preId, status: 'processed', payment: { id: 'pg3', status: 'approved' } };
    const n = CORTESIA.concedidas.length;
    await hook({ type: 'subscription_authorized_payment', data: { id: 'ap3' } });
    assert.equal(assinatura.vigente('u-ana').status, 'ativa');
    assert.ok(CORTESIA.concedidas.length > n, 'pagou de novo: os cursos voltam');
  });

  await t('webhook com assinatura HMAC errada é recusado quando há segredo; id com barra é ignorado', async () => {
    process.env.MUSIC_MP_WEBHOOK_SECRET = 'segredo-webhook-teste';
    try {
      const r = await hook({ type: 'subscription_preapproval', data: { id: preId } }, { 'x-signature': 'ts=1,v1=forjado', 'x-request-id': 'x' });
      assert.equal(r.status, 401);
    } finally { delete process.env.MUSIC_MP_WEBHOOK_SECRET; }
    const r2 = await hook({ type: 'subscription_preapproval', data: { id: '../../v1/payments' } });
    assert.equal(r2.json.ignorado, 'id inválido', 'o id vai para a URL da API do MP com a credencial da casa');
  });

  await t('referência de OUTRA conta no preapproval não mexe em assinatura alheia', async () => {
    MP.pre.forjado = { id: 'forjado', status: 'authorized', external_reference: 'musique:u-bruno:' + assinId };
    const r = await hook({ type: 'subscription_preapproval', data: { id: 'forjado' } });
    assert.equal(r.json.ignorado, 'assinatura não encontrada');
    assert.equal(assinatura.vigente('u-bruno'), null);
  });

  await t('cancelar: avisa o MP (PUT cancelled) e encerra — mas o mês JÁ PAGO continua valendo, com os cursos', async () => {
    const antes = CORTESIA.revogadas.length;
    const r = await req('POST', '/music/api/assinatura/cancelar', { como: 'ana' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(MP.puts.some((p) => p.caminho === '/preapproval/' + preId && p.corpo.status === 'cancelled'));
    assert.equal(assinatura.vigente('u-ana'), null);
    assert.equal(CORTESIA.revogadas.length, antes, 'pagou o mês: os cursos ficam até o fim dele');
    const st = await req('GET', '/music/api/assinatura', { como: 'ana' });
    assert.equal(st.json.uso.motivo, 'pago_ate');
    assert.equal((await req('GET', '/music/api/estudo', { como: 'ana' })).status, 200, 'e o app também');
    // 31 dias depois do último pagamento: acabou.
    db.prepare("UPDATE assinaturas_music SET ultimo_pagamento_em = ? WHERE conta_id = 'u-ana'").run(new Date(Date.now() - 31 * 864e5).toISOString());
    await assinatura.ciclo();
    assert.equal(CORTESIA.revogadas.length, antes + 1, 'fim do mês pago: a cortesia sai da Academia');
  });

  await t('MUSIQUE PAGO: teste grátis de 14 dias; depois, 402 em tudo — menos conta, assinar e levar os próprios dados', async () => {
    const r = await req('POST', '/music/api/conta/cadastrar', { corpo: { nome: 'Teste Pago', email: 'testepago@t', senha: 'senha-boa-123', aceite_termos: true } });
    const ck = { Cookie: (r.setCookie || []).find((x) => x.startsWith(contas.COOKIE + '=')).split(';')[0] };
    const st = await req('GET', '/music/api/assinatura', { headers: ck });
    assert.equal(st.json.uso.motivo, 'teste');
    assert.equal(st.json.uso.teste.dias_restantes, 14);
    assert.equal((await req('GET', '/music/api/estudo', { headers: ck })).status, 200, 'no teste, tudo liberado');
    // O teste NÃO dá curso da Academia: eles também são vendidos lá.
    const c = contas.Contas.porEmail('testepago@t');
    contas.Contas.marcarEmailVerificado(c.id);
    assert.equal((await assinatura.sincronizar(c.id)).resultado, 'nada-a-fazer');
    // Teste vencido:
    db.prepare('UPDATE contas_music SET criado_em = ? WHERE id = ?').run(new Date(Date.now() - 20 * 864e5).toISOString(), c.id);
    const cfg = require('./repo').Config.get('assinatura', {});
    require('./repo').Config.set('assinatura', { ...cfg, pago_desde: new Date(Date.now() - 30 * 864e5).toISOString() });
    try {
      const b = await req('GET', '/music/api/estudo', { headers: ck });
      assert.equal(b.status, 402); assert.equal(b.json.codigo, 'ASSINATURA');
      assert.equal((await req('GET', '/music/api/cifras/musicas', { headers: ck })).status, 402, 'as Cifras também fecham');
      for (const u of ['/music/api/me', '/music/api/conta', '/music/api/assinatura', '/music/api/cifras/meus-dados']) {
        assert.equal((await req('GET', u, { headers: ck })).status, 200, u + ' tem de continuar aberto (conta, assinar, LGPD)');
      }
      const st2 = await req('GET', '/music/api/assinatura', { headers: ck });
      assert.equal(st2.json.uso.acesso, false);
      // Conta ANTIGA (criada antes da cobrança) ganha o teste a partir do lançamento, não da criação.
      require('./repo').Config.set('assinatura', { ...cfg, pago_desde: new Date(Date.now() - 2 * 864e5).toISOString() });
      const st3 = await req('GET', '/music/api/assinatura', { headers: ck });
      assert.equal(st3.json.uso.motivo, 'teste'); assert.equal(st3.json.uso.teste.dias_restantes, 12);
      // O dono, cortesia vitalícia, nunca é bloqueado.
      const dono = db.prepare("SELECT id FROM contas_music WHERE origem = 'dono'").get();
      assert.equal(assinatura.acessoDaConta(dono.id).acesso, true);
    } finally { require('./repo').Config.set('assinatura', cfg); }
    // Grátis, sem conta (Augusto): ferramentas, landing e cifras públicas.
    const f = (await req('GET', '/music/ferramentas', { cru: true })).texto;
    assert.ok(!f.includes('/music/entrar?voltar=/music/ferramentas'), 'ferramentas voltaram a ser públicas');
    const land = (await req('GET', '/music', { cru: true })).texto;
    assert.ok(land.includes('Grátis, sem conta') && land.includes('R$ 875,00') && land.includes('/music/cifras-publicas'));
    for (const u of ['/music', '/music/app', '/music/entrar', '/music/ferramentas', '/music/cifras-publicas']) {
      assert.ok((await req('GET', u, { cru: true })).texto.includes('rel=\"icon\"'), u + ' sem ícone na aba do navegador');
    }
  });

  await t('PLANO BANDA: 5 assinaturas com 30% (R$ 875), a titular distribui as vagas e cada vaga vale como assinatura', async () => {
    const r = await req('POST', '/music/api/assinatura/assinar', { como: 'prof', corpo: { plano: 'banda' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const b = MP.criados[MP.criados.length - 1];
    assert.equal(b.auto_recurring.transaction_amount, 875, '5 × 250 × 0,7');
    assert.match(b.reason, /plano banda \(5 assinaturas\)/);
    const pre = MP.ultimoId;
    let st = (await req('GET', '/music/api/assinatura', { como: 'prof' })).json;
    assert.equal(st.banda.papel, 'titular'); assert.equal(st.banda.ocupadas.length, 1, 'a titular ocupa a primeira vaga');
    MP.pre[pre].status = 'authorized';
    await hook({ type: 'subscription_preapproval', data: { id: pre } });
    // vagas
    assert.equal((await req('POST', '/music/api/assinatura/vagas', { como: 'prof', corpo: { email: 'naotem@t' } })).status, 400);
    const add = await req('POST', '/music/api/assinatura/vagas', { como: 'prof', corpo: { email: 'sec@t' } });
    assert.equal(add.status, 200, JSON.stringify(add.json));
    const us = assinatura.acessoDaConta('u-sec');
    assert.equal(us.motivo, 'banda'); assert.equal(us.titular, 'Prof. Clara');
    assert.ok(CORTESIA.concedidas.includes('sec@t'), 'cada vaga ganha os cursos da Academia');
    for (const e of ['prof2@t', 'menor@t', 'resp@t']) assert.equal((await req('POST', '/music/api/assinatura/vagas', { como: 'prof', corpo: { email: e } })).status, 200);
    const cheia = await req('POST', '/music/api/assinatura/vagas', { como: 'prof', corpo: { email: 'forasteiro@t' } });
    assert.equal(cheia.status, 400); assert.match(cheia.json.erro, /5 vagas/);
    // Integrante não tira outro; mas pode sair da própria vaga.
    st = (await req('GET', '/music/api/assinatura', { como: 'prof' })).json;
    const aid = st.banda.assinatura_id;
    assert.equal((await req('DELETE', `/music/api/assinatura/vagas/${aid}/u-prof2`, { como: 'sec' })).status, 403);
    assert.equal((await req('DELETE', `/music/api/assinatura/vagas/${aid}/u-sec`, { como: 'sec' })).status, 200);
    assert.notEqual(assinatura.acessoDaConta('u-sec').motivo, 'banda');
    assert.equal((await req('DELETE', `/music/api/assinatura/vagas/${aid}/u-prof`, { como: 'prof' })).status, 400, 'a titular não sai da própria vaga');
    // Titular cancela: a banda usa até o fim do mês pago; depois, sai tudo.
    const antes = CORTESIA.revogadas.length;
    await req('POST', '/music/api/assinatura/cancelar', { como: 'prof' });
    assert.equal(assinatura.acessoDaConta('u-prof2').motivo, 'banda', 'mês pago continua valendo para a banda');
    db.prepare("UPDATE assinaturas_music SET ultimo_pagamento_em = ? WHERE id = ?").run(new Date(Date.now() - 31 * 864e5).toISOString(), aid);
    await assinatura.ciclo();
    assert.notEqual(assinatura.acessoDaConta('u-prof2').motivo, 'banda');
    assert.ok(CORTESIA.revogadas.length >= antes + 3, 'a cortesia sai de todos os integrantes');
  });

  await t('CIFRAS PÚBLICAS: qualquer pessoa, sem conta, vê a lista e a cifra; privada dá 404', async () => {
    const acervo = require('./cifras/acervo');
    const m = acervo.Musicas.criar('u-bruno', { titulo: 'Canção Pública do Teste', artista: 'Autor Próprio', titularidade: 'propria', separada: true });
    acervo.Cifras.criar('u-bruno', m.id, { texto: 'Tom: G\n\nG        D\numa linha própria' });
    const priv = acervo.Musicas.criar('u-bruno', { titulo: 'Canção Privada do Teste', titularidade: 'propria', separada: true });
    acervo.Cifras.criar('u-bruno', priv.id, { texto: 'C\nlinha' });
    require('./direitos').definirVisibilidade({ obraId: m.id, usuario: 'u-bruno', visibilidade: 'publica' });
    const lista = await req('GET', '/music/cifras-publicas', { cru: true });
    assert.equal(lista.status, 200);
    assert.ok(lista.texto.includes('Canção Pública do Teste') && !lista.texto.includes('Canção Privada do Teste'));
    const pag = await req('GET', '/music/p/' + m.id, { cru: true });
    assert.equal(pag.status, 200);
    assert.ok(pag.texto.includes('Canção Pública do Teste') && pag.texto.includes('index,follow'));
    assert.equal((await req('GET', '/music/p/' + priv.id, { cru: true })).status, 404, 'privada não abre para quem não é dono');
    const api = await req('GET', '/music/api/publico/cifras');
    assert.ok(api.json.cifras.some((x) => x.id === m.id) && !api.json.cifras.some((x) => x.id === priv.id));
  });

  await t('staff: preço só admin e vale para as NOVAS; cortesia manual pelo e-mail da conta; encerrar tira os cursos', async () => {
    assert.equal((await req('PUT', '/staff/api/music/assinaturas/plano', { staff: 'op', corpo: { preco_cents: 19900 } })).status, 403);
    const p = await req('PUT', '/staff/api/music/assinaturas/plano', { corpo: { preco_cents: 19900, carencia_dias: 7 } });
    assert.equal(p.json.plano.preco_cents, 19900);
    await req('PUT', '/staff/api/music/assinaturas/plano', { corpo: { preco_cents: 25000, carencia_dias: 5 } });
    assert.equal((await req('POST', '/staff/api/music/assinaturas/cortesia', { corpo: { email: 'naoexiste@t' } })).status, 400);
    const c = await req('POST', '/staff/api/music/assinaturas/cortesia', { corpo: { email: 'bruno@t', motivo: 'professor parceiro' } });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    assert.equal(c.json.academia.resultado, 'concedida');
    const res = await req('GET', '/staff/api/music/assinaturas');
    assert.ok(res.json.assinaturas.some((a) => a.email === 'bruno@t' && a.status === 'cortesia'));
    assert.ok(!JSON.stringify(res.json).includes('senha_hash'));
    const e = await req('POST', '/staff/api/music/assinaturas/cortesia/u-bruno/encerrar', { corpo: {} });
    assert.equal(e.status, 200);
    assert.equal(e.json.academia.resultado, 'revogada');
  });

  await t('as telas: Minha conta e Cursos mostram a assinatura; o app compila', async () => {
    const js = (await req('GET', '/music/app.js', { cru: true })).texto;
    assert.ok(js.includes('cartaoAssinatura') && js.includes('/assinatura/assinar') && js.includes('incluído na sua assinatura'));
    new Function('window', 'document', js);
    const land = (await req('GET', '/music', { cru: true })).texto;
    assert.ok(land.includes('id="planos"') && land.includes('R$ 250,00'), 'a landing mostra os planos com o preço da config');
    assert.ok(!/Escolas e turmas, e a reprodução/.test(land), 'escolas já existem: não podem constar como "ainda não está aqui"');
    const termos = (await req('GET', '/music/termos', { cru: true })).texto;
    assert.ok(termos.includes('art. 49') && termos.includes('MINUTA'), 'termos da assinatura com arrependimento, carimbados MINUTA');
    void SEGREDO;
  });
}

module.exports = { rodar };
