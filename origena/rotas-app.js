// =====================================================================
// ORIGENA — API da família: /origena/api/v1/familias/*
//
// TODA rota daqui para baixo passa por três portas, nesta ordem:
//   sessao.requireUsuario  → tem sessão?
//   tenancy.requireFamilia → é membro DESTA família? (senão 404, não 403)
//   rbac.exigir(permissao) → o papel permite ESTA ação?
//
// O family_id vem sempre da membership verificada. Família mandada pelo
// cliente no corpo, query ou header é ignorada — é a regra que o teste de
// tenancy (§94) prova rota a rota.
// =====================================================================
'use strict';
const sessao = require('./sessao');
const tenancy = require('./tenancy');
const rbac = require('./rbac');
const repo = require('./repo');
const emails = require('./emails');
const { erro } = require('./erros');
const privacidade = require('./privacidade');
const arvore = require('./arvore');
const { Persons, Relationships } = require('./repo-pessoas');
const { Families, Memberships, Invites, Auditoria, auditar, s } = repo;

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Toda rota escopada é declarada AQUI, e o selftest §94 varre esta lista
// para gerar o teste de isolamento. Rota nova sem entrada aqui quebra a
// suíte — de propósito: é assim que rota nova nasce coberta.
const ROTAS_ESCOPADAS = [];
const decl = (metodo, caminho) => { ROTAS_ESCOPADAS.push({ metodo, caminho }); return caminho; };

function registrarRotasApp(app) {
  const R = '/origena/api/v1';
  const logado = sessao.requireUsuario;
  const naFamilia = [sessao.requireUsuario, tenancy.requireFamilia];

  // ------------------------------------------------------------ famílias
  app.get(`${R}/familias`, logado, h(async (req, res) => {
    res.json({ familias: await Families.doUsuario(req.usuario.id) });
  }));

  app.post(`${R}/familias`, logado, h(async (req, res) => {
    const nome = s((req.body || {}).nome, 120);
    if (nome.length < 2) return res.status(400).json({ erro: req.t('erro.de_nome_familia'), codigo: 'erro.de_nome_familia' });
    if (!req.usuario.email_verificado) {
      throw erro('erro.verifique_email_antes', 403);
    }
    const f = await Families.criar({ nome, userId: req.usuario.id, sobrenomes: (req.body || {}).sobrenomes });
    res.status(201).json({ familia: { ...f, papel: 'OWNER' } });
  }));

  app.get(decl('GET', `${R}/familias/:familyId`), ...naFamilia, h(async (req, res) => {
    res.json({
      familia: req.familia,
      papel: req.papel,
      permissoes: rbac.permissoesDe(req.papel, req.permissoesExtra),
    });
  }));

  app.patch(decl('PATCH', `${R}/familias/:familyId`), ...naFamilia, rbac.exigir('familia.editar'),
    h(async (req, res) => {
      const nome = s((req.body || {}).nome, 120);
      if (nome.length < 2) return res.status(400).json({ erro: req.t('erro.nome_invalido'), codigo: 'erro.nome_invalido' });
      const antes = req.familia.nome;
      const f = await Families.renomear(req.familia.id, nome);
      await auditar({ familyId: req.familia.id, atorUserId: req.usuario.id, acao: 'familia.renomeada',
        alvoTipo: 'family', alvoId: req.familia.id, antes: { nome: antes }, depois: { nome }, req });
      res.json({ familia: f });
    }));

  // -------------------------------------------------------------- membros
  app.get(decl('GET', `${R}/familias/:familyId/membros`), ...naFamilia, h(async (req, res) => {
    const membros = await Memberships.listar(req.familia.id);
    // Quem não administra vê os nomes, não os e-mails dos outros.
    const podeVerContato = rbac.pode(req.papel, 'membros.gerenciar', req.permissoesExtra);
    res.json({ membros: membros.map((m) => podeVerContato ? m : { ...m, email: undefined }) });
  }));

  app.patch(decl('PATCH', `${R}/familias/:familyId/membros/:userId`), ...naFamilia,
    rbac.exigir('papeis.alterar'), sessao.exigirMFAparaAdmin, h(async (req, res) => {
      const papelNovo = s((req.body || {}).papel, 20);
      if (!rbac.papelValido(papelNovo)) throw erro('erro.papel_invalido', 400);
      // Erro daqui (inclusive o trigger do último OWNER) cai no tratador
      // central de erros.js, que traduz pela chave.
      const m = await Memberships.alterarPapel({
        familyId: req.familia.id, alvoUserId: req.params.userId, papelNovo,
        quemUserId: req.usuario.id, papelDeQuem: req.papel });
      res.json({ membro: m });
    }));

  app.delete(decl('DELETE', `${R}/familias/:familyId/membros/:userId`), ...naFamilia,
    rbac.exigir('membros.gerenciar'), sessao.exigirMFAparaAdmin, h(async (req, res) => {
      await Memberships.remover({ familyId: req.familia.id, alvoUserId: req.params.userId,
        quemUserId: req.usuario.id, papelDeQuem: req.papel });
      res.json({ ok: true, aviso: req.t('mensagem.acesso_revogado') });
    }));

  // ------------------------------------------------------------- convites
  app.get(decl('GET', `${R}/familias/:familyId/convites`), ...naFamilia,
    rbac.exigir('membros.convidar'), h(async (req, res) => {
      res.json({ convites: await Invites.listar(req.familia.id) });
    }));

  app.post(decl('POST', `${R}/familias/:familyId/convites`), ...naFamilia,
    rbac.exigir('membros.convidar'), sessao.exigirMFAparaAdmin, h(async (req, res) => {
      const d = req.body || {};
      const mail = repo.email(d.email);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return res.status(400).json({ erro: req.t('erro.email_invalido'), codigo: 'erro.email_invalido' });
      const papel = s(d.papel, 20) || 'CONTRIBUTOR';
      // Ninguém convida para um papel acima do seu.
      if ((rbac.NIVEL[papel] || 0) > (rbac.NIVEL[req.papel] || 0)) {
        throw erro('erro.nao_convida_acima', 403);
      }
      const { convite, token } = await Invites.criar({ familyId: req.familia.id, emailBruto: mail,
        papel, quemUserId: req.usuario.id, mensagem: s(d.mensagem, 500) });
      await emails.convite(mail, { familia: req.familia.nome, quem: req.usuario.nome, papel, token,
        mensagem: convite.mensagem }, req.idioma);
      res.status(201).json({ convite: { ...convite, token_hash: undefined } });
    }));

  app.delete(decl('DELETE', `${R}/familias/:familyId/convites/:id`), ...naFamilia,
    rbac.exigir('membros.convidar'), h(async (req, res) => {
      const c = await Invites.revogar(req.familia.id, req.params.id, req.usuario.id);
      if (!c) throw erro('erro.convite_nao_encontrado', 404);
      res.json({ ok: true });
    }));

  // Aceitar convite NÃO é rota de família (quem aceita ainda não é membro).
  app.get(`${R}/convites/:token`, sessao.usuarioOpcional, h(async (req, res) => {
    const c = await Invites.porToken(s(req.params.token, 200));
    if (!c || c.revogado_em || c.aceito_em || new Date(c.expira_em) <= new Date()) {
      throw erro('erro.convite_invalido', 404);
    }
    // Mostra o mínimo: nome da família e papel. Nada do acervo.
    res.json({ convite: { familia: c.familia_nome, papel: c.papel, email: c.email },
      precisa_entrar: !req.usuario });
  }));

  app.post(`${R}/convites/:token/aceitar`, logado, h(async (req, res) => {
    const r = await Invites.aceitar({ token: s(req.params.token, 200),
      userId: req.usuario.id, emailDoUsuario: req.usuario.email });
    res.json({ ok: true, ...r });
  }));

  // ------------------------------------------------------------- pessoas
  // Escopo de família em TODA consulta: `tenancy.noEscopoDe` abre a
  // transação com `app.family_id` posto, e o RLS faz o resto.
  app.get(decl('GET', `${R}/familias/:familyId/pessoas`), ...naFamilia, h(async (req, res) => {
    const pessoas = await tenancy.noEscopoDe(req, (t) => Persons.listar(t, req.familia.id, {
      busca: req.query.busca || '', limite: Number(req.query.limite) || 200 }));
    // Menor de idade não aparece para quem não é da família (§73).
    const visiveis = pessoas.filter((p) => privacidade.podeVer(p,
      { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra }).pode);
    res.json({ pessoas: visiveis, ocultas: pessoas.length - visiveis.length });
  }));

  app.post(decl('POST', `${R}/familias/:familyId/pessoas`), ...naFamilia,
    rbac.exigir('pessoas.criar'), h(async (req, res) => {
      const p = await tenancy.noEscopoDe(req, (t) => Persons.criar(t, {
        familyId: req.familia.id, userId: req.usuario.id, dados: req.body || {} }));
      res.status(201).json({ pessoa: p });
    }));

  app.get(decl('GET', `${R}/familias/:familyId/pessoas/:pessoaId`), ...naFamilia, h(async (req, res) => {
    const dossie = await tenancy.noEscopoDe(req, async (t) => {
      const p = await Persons.obter(t, req.params.pessoaId);
      if (!p) throw erro('erro.pessoa_nao_encontrada', 404);
      return { pessoa: p, familia: await arvore.familiaDe(t, p.id) };
    });
    const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
    const podeVer = privacidade.podeVer(dossie.pessoa, quem);
    if (!podeVer.pode) throw erro('erro.pessoa_nao_encontrada', 404);   // 404, nunca 403 (T2)
    res.json({ ...dossie, pode_editar: rbac.pode(req.papel, 'pessoas.editar', req.permissoesExtra) });
  }));

  app.patch(decl('PATCH', `${R}/familias/:familyId/pessoas/:pessoaId`), ...naFamilia,
    rbac.exigir('pessoas.editar'), h(async (req, res) => {
      const p = await tenancy.noEscopoDe(req, (t) => Persons.atualizar(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        id: req.params.pessoaId, dados: req.body || {} }));
      res.json({ pessoa: p });
    }));

  app.delete(decl('DELETE', `${R}/familias/:familyId/pessoas/:pessoaId`), ...naFamilia,
    rbac.exigir('excluir'), h(async (req, res) => {
      await tenancy.noEscopoDe(req, (t) => Persons.arquivar(t, {
        familyId: req.familia.id, userId: req.usuario.id, id: req.params.pessoaId }));
      res.json({ ok: true, aviso: req.t('mensagem.pessoa_arquivada') });
    }));

  // ---------------------------------------------------------- parentesco
  app.post(decl('POST', `${R}/familias/:familyId/parentescos`), ...naFamilia,
    rbac.exigir('parentesco.editar'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => Relationships.criar(t, {
        familyId: req.familia.id, userId: req.usuario.id, dados: req.body || {} }));
      res.status(201).json({ parentesco: r });
    }));

  app.delete(decl('DELETE', `${R}/familias/:familyId/parentescos/:relId`), ...naFamilia,
    rbac.exigir('parentesco.editar'), h(async (req, res) => {
      await tenancy.noEscopoDe(req, (t) => Relationships.remover(t, {
        familyId: req.familia.id, userId: req.usuario.id, id: req.params.relId }));
      res.json({ ok: true });
    }));

  // -------------------------------------------------------------- árvore
  app.get(decl('GET', `${R}/familias/:familyId/arvore/:pessoaId`), ...naFamilia, h(async (req, res) => {
    const modo = ['ancestral', 'descendentes', 'ambos'].includes(req.query.modo) ? req.query.modo : 'ambos';
    const geracoes = Math.min(Math.max(Number(req.query.geracoes) || 4, 1), 8);
    const dados = await tenancy.noEscopoDe(req, (t) => arvore.montar(t, req.params.pessoaId, { modo, geracoes }));
    res.json(dados);
  }));

  // ------------------------------------------------------------ auditoria
  app.get(decl('GET', `${R}/familias/:familyId/auditoria`), ...naFamilia,
    rbac.exigir('auditoria.ver'), h(async (req, res) => {
      res.json({ eventos: await Auditoria.daFamilia(req.familia.id, Number(req.query.limite) || 200) });
    }));

  return { ROTAS_ESCOPADAS };
}

module.exports = { registrarRotasApp, ROTAS_ESCOPADAS };
