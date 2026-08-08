// =====================================================================
// ORIGENA — cadastro, sessão, verificação de e-mail, senha e MFA.
// Rotas em /origena/api/v1/conta/* (API versionada, §92).
//
// Autorização SEMPRE no backend (§92). Estas rotas não tocam conteúdo de
// família — quem faz isso é rotas-app.js, e lá tudo passa por tenancy.
// =====================================================================
'use strict';
const crypto = require('crypto');
const db = require('./db');
const sessao = require('./sessao');
const emails = require('./emails');
const repo = require('./repo');
const { Users, Consents, auditar, s, email: normEmail } = repo;

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const publico = (u) => ({
  id: u.id, nome: u.nome, email: u.email, idioma: u.idioma,
  email_verificado: u.email_verificado, mfa_ativo: u.mfa_ativo,
});

function registrarRotasConta(app, { jwtSecret }) {
  sessao.configurar({ jwtSecret });
  const R = '/origena/api/v1/conta';

  // ------------------------------------------------------------ cadastro
  app.post(`${R}/cadastrar`, h(async (req, res) => {
    const d = req.body || {};
    const nome = s(d.nome, 120);
    const mail = normEmail(d.email);
    if (nome.length < 2) return res.status(400).json({ erro: req.t('erro.diga_seu_nome'), codigo: 'erro.diga_seu_nome' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return res.status(400).json({ erro: req.t('erro.email_invalido'), codigo: 'erro.email_invalido' });
    const fraca = sessao.senhaFraca(d.senha);
    if (fraca) return res.status(400).json({ erro: req.t(fraca), codigo: fraca });
    if (!d.aceito_termos) return res.status(400).json({ erro: req.t('erro.aceite_termos'), codigo: 'erro.aceite_termos' });

    if (await Users.porEmail(mail)) {
      // Não confirmamos que o e-mail existe (evita enumerar contas).
      return res.status(202).json({ ok: true, mensagem: req.t('mensagem.cadastro_talvez') });
    }
    const { usuario, tokenVerificacao } = await Users.criar({
      nome, emailBruto: mail, senhaHash: await sessao.hashSenha(d.senha), idioma: s(d.idioma, 10) || 'pt-BR' });
    await Consents.registrar({ userId: usuario.id, finalidade: 'termos', concedido: true, versaoTexto: '1.0', req });
    await auditar({ atorUserId: usuario.id, acao: 'conta.criada', alvoTipo: 'user', alvoId: usuario.id, req });
    await emails.verificacao(mail, nome, tokenVerificacao, req.idioma);
    res.status(201).json({ ok: true, mensagem: req.t('mensagem.cadastro_enviado') });
  }));

  app.get('/origena/api/v1/conta/verificar', h(async (req, res) => {
    const u = await Users.verificarEmail(s(req.query.token, 200));
    if (!u) return res.status(400).json({ erro: req.t('erro.link_vencido'), codigo: 'erro.link_vencido' });
    await auditar({ atorUserId: u.id, acao: 'conta.email_verificado', alvoTipo: 'user', alvoId: u.id, req });
    sessao.emitir(res, u);
    res.json({ ok: true, usuario: publico(u) });
  }));

  // ------------------------------------------------------------- entrar
  app.post(`${R}/entrar`, h(async (req, res) => {
    const d = req.body || {};
    const mail = normEmail(d.email);
    const chaveIp = 'ip:' + s(req.ip, 60);
    const chaveEmail = 'email:' + mail;

    if (await sessao.bloqueado(chaveIp) || await sessao.bloqueado(chaveEmail)) {
      return res.status(429).json({ erro: req.t('erro.muitas_tentativas'), codigo: 'erro.muitas_tentativas' });
    }
    const u = await Users.porEmail(mail);
    const ok = u && u.status === 'ativo' && await sessao.conferirSenha(d.senha, u.senha_hash);
    if (!ok) {
      await sessao.registrarFalha(chaveIp); await sessao.registrarFalha(chaveEmail);
      // Mesma resposta para e-mail inexistente e senha errada.
      return res.status(401).json({ erro: req.t('erro.credenciais'), codigo: 'erro.credenciais' });
    }
    // MFA: senha correta ainda não é sessão. Devolve um desafio curto.
    if (u.mfa_ativo) {
      const codigo = s(d.codigo, 20);
      if (!codigo) return res.status(200).json({ mfa_necessario: true });
      const segredo = sessao.decifrar(u.mfa_segredo_cif);
      const porTotp = sessao.conferirTOTP(segredo, codigo);
      const hashCod = repo.hashToken(codigo.toUpperCase().replace(/\s/g, ''));
      const porBackup = (u.mfa_backup_hashes || []).includes(hashCod);
      if (!porTotp && !porBackup) {
        await sessao.registrarFalha(chaveEmail);
        return res.status(401).json({ erro: req.t('erro.codigo_incorreto'), codigo: 'erro.codigo_incorreto', mfa_necessario: true });
      }
      if (porBackup) {   // código de backup é de uso único
        await db.q('UPDATE users SET mfa_backup_hashes = array_remove(mfa_backup_hashes, $2) WHERE id = $1',
          [u.id, hashCod]);
      }
    }
    await sessao.limparFalhas(chaveIp); await sessao.limparFalhas(chaveEmail);
    await Users.marcarAcesso(u.id);
    await auditar({ atorUserId: u.id, acao: 'conta.entrou', alvoTipo: 'user', alvoId: u.id, req });
    sessao.emitir(res, u);
    res.json({ ok: true, usuario: publico(u) });
  }));

  app.post(`${R}/sair`, h(async (req, res) => { sessao.encerrar(res); res.json({ ok: true }); }));

  app.post(`${R}/sair-de-todos`, sessao.requireUsuario, h(async (req, res) => {
    await Users.derrubarSessoes(req.usuario.id);
    await auditar({ atorUserId: req.usuario.id, acao: 'conta.sessoes_derrubadas', req });
    sessao.encerrar(res);
    res.json({ ok: true });
  }));

  app.get(`${R}/eu`, sessao.requireUsuario, h(async (req, res) => {
    res.json({ usuario: publico(req.usuario), familias: await repo.Families.doUsuario(req.usuario.id) });
  }));

  // ------------------------------------------------------------- senha
  app.post(`${R}/esqueci`, h(async (req, res) => {
    const u = await Users.porEmail(normEmail((req.body || {}).email));
    if (u) {
      const token = repo.novoToken();
      await db.q(`UPDATE users SET reset_token = $2, reset_expira_em = now() + interval '1 hour' WHERE id = $1`,
        [u.id, repo.hashToken(token)]);
      await emails.recuperacao(u.email, u.nome, token, u.idioma);
    }
    // Resposta idêntica exista ou não a conta.
    res.json({ ok: true, mensagem: req.t('mensagem.recuperacao_enviada') });
  }));

  app.post(`${R}/nova-senha`, h(async (req, res) => {
    const d = req.body || {};
    const fraca = sessao.senhaFraca(d.senha);
    if (fraca) return res.status(400).json({ erro: req.t(fraca), codigo: fraca });
    const u = await db.uma(
      `SELECT * FROM users WHERE reset_token = $1 AND reset_expira_em > now() AND deleted_at IS NULL`,
      [repo.hashToken(s(d.token, 200))]);
    if (!u) return res.status(400).json({ erro: req.t('erro.link_vencido'), codigo: 'erro.link_vencido' });
    await Users.trocarSenha(u.id, await sessao.hashSenha(d.senha));
    await auditar({ atorUserId: u.id, acao: 'conta.senha_trocada', alvoTipo: 'user', alvoId: u.id, req });
    await emails.avisoSeguranca(u.email, u.nome, 'email.seguranca_senha', u.idioma);
    sessao.encerrar(res);
    res.json({ ok: true });
  }));

  // -------------------------------------------------------------- MFA
  app.post(`${R}/mfa/iniciar`, sessao.requireUsuario, h(async (req, res) => {
    if (!sessao.mfaDisponivel()) {
      return res.status(503).json({ erro: req.t('erro.mfa_indisponivel'), codigo: 'erro.mfa_indisponivel' });
    }
    if (req.usuario.mfa_ativo) return res.status(409).json({ erro: req.t('erro.mfa_ja_ativo'), codigo: 'erro.mfa_ja_ativo' });
    const segredo = sessao.gerarSegredoTOTP();
    // Guardado cifrado e ainda INATIVO: só liga depois de o usuário provar
    // que o aplicativo dele gera o código certo.
    await db.q('UPDATE users SET mfa_segredo_cif = $2 WHERE id = $1', [req.usuario.id, sessao.cifrar(segredo)]);
    res.json({ segredo, otpauth: sessao.urlOtpauth(req.usuario.email, segredo) });
  }));

  app.post(`${R}/mfa/confirmar`, sessao.requireUsuario, h(async (req, res) => {
    const u = await Users.porId(req.usuario.id);
    if (!u.mfa_segredo_cif) return res.status(400).json({ erro: req.t('erro.mfa_comece_pelo_inicio'), codigo: 'erro.mfa_comece_pelo_inicio' });
    if (!sessao.conferirTOTP(sessao.decifrar(u.mfa_segredo_cif), (req.body || {}).codigo)) {
      return res.status(400).json({ erro: req.t('erro.codigo_incorreto_horario'), codigo: 'erro.codigo_incorreto_horario' });
    }
    const backups = sessao.gerarCodigosBackup();
    await Users.ativarMFA(u.id, u.mfa_segredo_cif, backups.map((c) => repo.hashToken(c)));
    await auditar({ atorUserId: u.id, acao: 'conta.mfa_ativado', alvoTipo: 'user', alvoId: u.id, req });
    await emails.avisoSeguranca(u.email, u.nome, 'email.seguranca_mfa_on', u.idioma);
    // Códigos de backup aparecem UMA vez — depois só o hash existe.
    res.json({ ok: true, codigos_backup: backups });
  }));

  app.post(`${R}/mfa/desativar`, sessao.requireUsuario, h(async (req, res) => {
    const u = await Users.porId(req.usuario.id);
    if (!u.mfa_ativo) return res.json({ ok: true });
    if (!await sessao.conferirSenha((req.body || {}).senha, u.senha_hash)) {
      return res.status(401).json({ erro: req.t('erro.confirme_senha'), codigo: 'erro.confirme_senha' });
    }
    await Users.desativarMFA(u.id);
    await auditar({ atorUserId: u.id, acao: 'conta.mfa_desativado', alvoTipo: 'user', alvoId: u.id, req });
    await emails.avisoSeguranca(u.email, u.nome, 'email.seguranca_mfa_off', u.idioma);
    res.json({ ok: true });
  }));

  return { requireUsuario: sessao.requireUsuario };
}

module.exports = { registrarRotasConta };
