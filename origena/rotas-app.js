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
    if (nome.length < 2) return res.status(400).json({ erro: 'Dê um nome à família.' });
    if (!req.usuario.email_verificado) {
      return res.status(403).json({ erro: 'Confirme seu e-mail antes de criar uma família.' });
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
      if (nome.length < 2) return res.status(400).json({ erro: 'Nome inválido.' });
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
      if (!rbac.papelValido(papelNovo)) return res.status(400).json({ erro: 'Papel inválido.' });
      try {
        const m = await Memberships.alterarPapel({
          familyId: req.familia.id, alvoUserId: req.params.userId, papelNovo,
          quemUserId: req.usuario.id, papelDeQuem: req.papel });
        res.json({ membro: m });
      } catch (e) {
        // O trigger do banco protege o último OWNER — a mensagem dele é boa.
        res.status(e.status || 400).json({ erro: e.message });
      }
    }));

  app.delete(decl('DELETE', `${R}/familias/:familyId/membros/:userId`), ...naFamilia,
    rbac.exigir('membros.gerenciar'), sessao.exigirMFAparaAdmin, h(async (req, res) => {
      try {
        await Memberships.remover({ familyId: req.familia.id, alvoUserId: req.params.userId,
          quemUserId: req.usuario.id, papelDeQuem: req.papel });
        res.json({ ok: true, aviso: 'O acesso foi revogado. O que esta pessoa contribuiu continua no acervo.' });
      } catch (e) { res.status(e.status || 400).json({ erro: e.message }); }
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
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return res.status(400).json({ erro: 'E-mail inválido.' });
      const papel = s(d.papel, 20) || 'CONTRIBUTOR';
      // Ninguém convida para um papel acima do seu.
      if ((rbac.NIVEL[papel] || 0) > (rbac.NIVEL[req.papel] || 0)) {
        return res.status(403).json({ erro: 'Você não pode convidar alguém para um papel acima do seu.' });
      }
      try {
        const { convite, token } = await Invites.criar({ familyId: req.familia.id, emailBruto: mail,
          papel, quemUserId: req.usuario.id, mensagem: s(d.mensagem, 500) });
        await emails.convite(mail, { familia: req.familia.nome, quem: req.usuario.nome, papel, token,
          mensagem: convite.mensagem });
        res.status(201).json({ convite: { ...convite, token_hash: undefined } });
      } catch (e) { res.status(400).json({ erro: e.message }); }
    }));

  app.delete(decl('DELETE', `${R}/familias/:familyId/convites/:id`), ...naFamilia,
    rbac.exigir('membros.convidar'), h(async (req, res) => {
      const c = await Invites.revogar(req.familia.id, req.params.id, req.usuario.id);
      if (!c) return res.status(404).json({ erro: 'Convite não encontrado.' });
      res.json({ ok: true });
    }));

  // Aceitar convite NÃO é rota de família (quem aceita ainda não é membro).
  app.get(`${R}/convites/:token`, sessao.usuarioOpcional, h(async (req, res) => {
    const c = await Invites.porToken(s(req.params.token, 200));
    if (!c || c.revogado_em || c.aceito_em || new Date(c.expira_em) <= new Date()) {
      return res.status(404).json({ erro: 'Convite inválido, já usado ou vencido.' });
    }
    // Mostra o mínimo: nome da família e papel. Nada do acervo.
    res.json({ convite: { familia: c.familia_nome, papel: c.papel, email: c.email },
      precisa_entrar: !req.usuario });
  }));

  app.post(`${R}/convites/:token/aceitar`, logado, h(async (req, res) => {
    try {
      const r = await Invites.aceitar({ token: s(req.params.token, 200),
        userId: req.usuario.id, emailDoUsuario: req.usuario.email });
      res.json({ ok: true, ...r });
    } catch (e) { res.status(e.status || 400).json({ erro: e.message }); }
  }));

  // ------------------------------------------------------------ auditoria
  app.get(decl('GET', `${R}/familias/:familyId/auditoria`), ...naFamilia,
    rbac.exigir('auditoria.ver'), h(async (req, res) => {
      res.json({ eventos: await Auditoria.daFamilia(req.familia.id, Number(req.query.limite) || 200) });
    }));

  return { ROTAS_ESCOPADAS };
}

module.exports = { registrarRotasApp, ROTAS_ESCOPADAS };
