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
const prov = require('./proveniencia');
const midia = require('./midia');
const storage = require('./storage');
const fila = require('./fila');
const documentos = require('./documentos');
const documentosIA = require('./documentos-ia');
const entrevistas = require('./entrevistas');
const historias = require('./historias');
const busca = require('./busca');
const tempo = require('./tempo');
const creditos = require('./creditos');
const router = require('./ia/router');
const conhecimento = require('./conhecimento');
const exportar = require('./exportar');
const purga = require('./purga');
const tradicoes = require('./tradicoes');
const historiador = require('./historiador');
const missoes = require('./missoes');
const billing = require('./billing');
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

  // --------------------------------------------------------- proveniência
  // A tela nunca diz "claim" nem "evidência" (§82): o usuário responde
  // "Quando ele nasceu?" e "Como você sabe disso?". O modelo fica aqui.

  app.get(decl('GET', `${R}/familias/:familyId/pessoas/:pessoaId/fatos`), ...naFamilia,
    h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, async (t) => ({
        fatos: await prov.fatosDe(t, req.params.pessoaId),
        divergencias: await prov.divergenciasDe(t, req.params.pessoaId),
      }));
      res.json(r);
    }));

  /** "De onde veio isto?" — todas as versões, com autor, data e fonte. */
  app.get(decl('GET', `${R}/familias/:familyId/pessoas/:pessoaId/fatos/:predicado`), ...naFamilia,
    h(async (req, res) => {
      if (!prov.PREDICADOS[req.params.predicado]) throw erro('erro.predicado_desconhecido', 400);
      const versoes = await tenancy.noEscopoDe(req, (t) =>
        prov.versoesDe(t, req.params.pessoaId, req.params.predicado));
      res.json({ predicado: req.params.predicado, versoes });
    }));

  /** Afirmar um fato COM a fonte. Não existe caminho sem fonte. */
  app.post(decl('POST', `${R}/familias/:familyId/pessoas/:pessoaId/fatos`), ...naFamilia,
    rbac.exigir('claims.criar'), h(async (req, res) => {
      const d = req.body || {};
      const r = await tenancy.noEscopoDe(req, async (t) => {
        // A "fonte" que o usuário informa em linguagem humana: um
        // documento que ele tem, ou a memória dele mesmo.
        const fonte = await prov.criarFonte(t, {
          familyId: req.familia.id, userId: req.usuario.id,
          tipo: s(d.fonte_tipo, 30) || 'RELATO',
          titulo: s(d.fonte_titulo, 200),
          referenciaExterna: s(d.fonte_referencia, 300) });
        return prov.afirmar(t, {
          familyId: req.familia.id, userId: req.usuario.id,
          sujeitoId: req.params.pessoaId, predicado: s(d.predicado, 40),
          valor: d.valor, fonte, trecho: s(d.trecho, 2000) });
      });
      res.status(201).json({ fato: r });
    }));

  /** Acrescentar outra fonte a uma versão — inclusive CONTRADIZENDO. */
  app.post(decl('POST', `${R}/familias/:familyId/fatos/:claimId/fontes`), ...naFamilia,
    rbac.exigir('fontes.gerenciar'), h(async (req, res) => {
      const d = req.body || {};
      const ev = await tenancy.noEscopoDe(req, async (t) => {
        const fonte = await prov.criarFonte(t, {
          familyId: req.familia.id, userId: req.usuario.id,
          tipo: s(d.fonte_tipo, 30) || 'RELATO', titulo: s(d.fonte_titulo, 200),
          referenciaExterna: s(d.fonte_referencia, 300) });
        return prov.anexarEvidencia(t, {
          familyId: req.familia.id, userId: req.usuario.id, claimId: req.params.claimId,
          fonte, posicao: d.posicao === 'CONTRADIZ' ? 'CONTRADIZ' : 'SUPORTA',
          forca: ['forte', 'media', 'fraca'].includes(d.forca) ? d.forca : 'media',
          trecho: s(d.trecho, 2000), nota: s(d.nota, 500) });
      });
      res.status(201).json({ evidencia: ev });
    }));

  /** A família escolhe uma versão. As outras CONTINUAM ali. */
  app.post(decl('POST', `${R}/familias/:familyId/pessoas/:pessoaId/fatos/:predicado/resolver`),
    ...naFamilia, rbac.exigir('claims.resolver'), h(async (req, res) => {
      const d = req.body || {};
      const r = await tenancy.noEscopoDe(req, (t) => prov.resolver(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        sujeitoId: req.params.pessoaId, predicado: req.params.predicado,
        claimAceitoId: d.claim_id, motivo: s(d.motivo, 500) }));
      res.json({ resolucao: r, aviso: req.t('mensagem.divergencia_preservada') });
    }));

  /** Sugestão da IA vira fato só por ato humano registrado (§6). */
  app.post(decl('POST', `${R}/familias/:familyId/fatos/:claimId/confirmar`), ...naFamilia,
    rbac.exigir('claims.resolver'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => prov.confirmarInferencia(t, {
        familyId: req.familia.id, userId: req.usuario.id, claimId: req.params.claimId,
        novoStatus: s((req.body || {}).status, 20) || 'FAMILY_REPORTED' }));
      res.status(201).json({ fato: r });
    }));

  // ------------------------------------------------------- contribuições
  app.get(decl('GET', `${R}/familias/:familyId/pessoas/:pessoaId/contribuicoes`), ...naFamilia,
    h(async (req, res) => {
      const lista = await tenancy.noEscopoDe(req, (t) =>
        prov.contribuicoesDe(t, 'person', req.params.pessoaId));
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      res.json({ contribuicoes: privacidade.filtrar(lista, quem) });
    }));

  app.post(decl('POST', `${R}/familias/:familyId/pessoas/:pessoaId/contribuicoes`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const d = req.body || {};
      const c = await tenancy.noEscopoDe(req, (t) => prov.contribuir(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        alvoTipo: 'person', alvoId: req.params.pessoaId,
        corpo: d.corpo, tipo: s(d.tipo, 20) || 'relato',
        privacidade: ['PUBLIC', 'FAMILY', 'GROUP', 'PRIVATE'].includes(d.privacidade) ? d.privacidade : 'FAMILY' }));
      res.status(201).json({ contribuicao: c });
    }));

  /** Editar NÃO sobrescreve: cria revisão e a original continua (§15). */
  app.patch(decl('PATCH', `${R}/familias/:familyId/contribuicoes/:contribId`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const nova = await tenancy.noEscopoDe(req, (t) => prov.revisarContribuicao(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        id: req.params.contribId, corpo: (req.body || {}).corpo }));
      res.json({ contribuicao: nova, aviso: req.t('mensagem.revisao_preserva') });
    }));

  /** Painel de divergências da família inteira — a fila do historiador. */
  app.get(decl('GET', `${R}/familias/:familyId/divergencias`), ...naFamilia,
    h(async (req, res) => {
      const lista = await tenancy.noEscopoDe(req, (t) => t.todas(
        `SELECT d.*, p.nome_exibicao FROM v_divergencias d
           JOIN persons p ON p.id = d.sujeito_id
          WHERE d.sujeito_tipo = 'person' AND p.deleted_at IS NULL
          ORDER BY p.nome_exibicao, d.predicado LIMIT 200`));
      res.json({ divergencias: lista });
    }));

  // --------------------------------------------------------------- mídia
  // O binário nunca passa por aqui: o web assina a URL e o navegador
  // fala direto com o R2 (ARCHITECTURE.md §4).

  app.get(decl('GET', `${R}/familias/:familyId/midias`), ...naFamilia, h(async (req, res) => {
    const lista = await tenancy.noEscopoDe(req, (t) => midia.listar(t, req.familia.id, {
      tipo: ['FOTO', 'VIDEO', 'AUDIO', 'DOCUMENTO'].includes(req.query.tipo) ? req.query.tipo : null,
      limite: Number(req.query.limite) || 60,
      antesDe: req.query.antes_de || null,
      pessoaId: tenancy.UUID.test(String(req.query.pessoa || '')) ? req.query.pessoa : null }));
    const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
    const visiveis = lista.filter((m) => privacidade.podeVer({ ...m, created_by: m.created_by }, quem).pode);
    res.json({
      midias: visiveis,
      ocultas: lista.length - visiveis.length,
      proximo_cursor: visiveis.length ? visiveis[visiveis.length - 1].created_at : null,
    });
  }));

  /** Passo 1: peço para enviar. Duplicata morre aqui, antes do byte subir. */
  app.post(decl('POST', `${R}/familias/:familyId/midias/preparar`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const d = req.body || {};
      const r = await tenancy.noEscopoDe(req, (t) => midia.preparar(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        nome: d.nome, bytes: d.bytes, sha256: d.sha256,
        mimeDeclarado: d.mime, tipoSugerido: d.tipo }));
      res.status(r.duplicado ? 200 : 201).json(r);
    }));

  /** Passo 2: terminei o PUT. O worker assume daqui. */
  app.post(decl('POST', `${R}/familias/:familyId/midias/:mediaId/confirmar`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const m = await tenancy.noEscopoDe(req, (t) => midia.confirmar(t, {
        familyId: req.familia.id, userId: req.usuario.id, mediaId: req.params.mediaId, fila }));
      res.status(202).json({ midia: m, estado: 'PROCESSANDO' });
    }));

  /** Miniatura: derivado gerado no navegador (midia.js explica o porquê). */
  app.post(decl('POST', `${R}/familias/:familyId/midias/:mediaId/derivados`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const d = req.body || {};
      if (!['THUMB', 'PREVIEW'].includes(d.papel)) throw erro('erro.derivado_papel_invalido', 400);
      const r = await tenancy.noEscopoDe(req, (t) => midia.registrarDerivado(t, {
        familyId: req.familia.id, userId: req.usuario.id, originalId: req.params.mediaId,
        papel: d.papel, sha256: d.sha256, bytes: d.bytes, mime: d.mime,
        largura: d.largura, altura: d.altura }));
      res.status(201).json({ derivado: r.derivado, url_envio: r.url_envio });
    }));

  app.get(decl('GET', `${R}/familias/:familyId/midias/:mediaId`), ...naFamilia, h(async (req, res) => {
    const r = await tenancy.noEscopoDe(req, async (t) => {
      const m = await midia.obter(t, req.params.mediaId);
      if (!m) throw erro('erro.midia_nao_encontrada', 404);
      return {
        midia: m,
        pessoas: await midia.pessoasDe(t, m.id),
        contribuicoes: await prov.contribuicoesDe(t, 'media', m.id),
        derivados: await t.todas(
          `SELECT id, papel, ai_class, largura, altura, bytes FROM media
            WHERE derivado_de = $1 AND deleted_at IS NULL ORDER BY bytes`, [m.id]),
      };
    });
    const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
    if (!privacidade.podeVer(r.midia, quem).pode) throw erro('erro.midia_nao_encontrada', 404);
    res.json(r);
  }));

  /**
   * A URL de leitura. É AQUI que a privacidade decide — nunca no R2, que
   * não sabe quem é quem. Documento exige a permissão própria (§11).
   */
  app.get(decl('GET', `${R}/familias/:familyId/midias/:mediaId/url`), ...naFamilia,
    h(async (req, res) => {
      const m = await tenancy.noEscopoDe(req, (t) => midia.obter(t, req.params.mediaId));
      if (!m) throw erro('erro.midia_nao_encontrada', 404);
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      const veredito = m.tipo === 'DOCUMENTO'
        ? privacidade.podeVerDocumento(m, quem) : privacidade.podeVer(m, quem);
      if (!veredito.pode) throw erro('erro.midia_nao_encontrada', 404);
      // Acesso de terceiro a item privado, e download de documento
      // sensível, ficam registrados (§65).
      if (veredito.auditar || m.tipo === 'DOCUMENTO') {
        await auditar({ familyId: req.familia.id, atorUserId: req.usuario.id,
          acao: 'midia.baixada', alvoTipo: 'media', alvoId: m.id,
          motivo: veredito.motivo, req });
      }
      res.json({ url: storage.urlDeLeitura(m.storage_key), expira_em_seg: 600 });
    }));

  app.patch(decl('PATCH', `${R}/familias/:familyId/midias/:mediaId`), ...naFamilia,
    rbac.exigir('editar'), h(async (req, res) => {
      const d = req.body || {};
      const m = await tenancy.noEscopoDe(req, (t) => t.uma(
        `UPDATE media SET titulo = COALESCE($2, titulo), descricao = COALESCE($3, descricao),
                privacidade = COALESCE($4, privacidade), updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
        [req.params.mediaId, d.titulo != null ? s(d.titulo, 200) : null,
          d.descricao != null ? s(d.descricao, 2000) : null,
          ['PUBLIC', 'FAMILY', 'GROUP', 'PRIVATE'].includes(d.privacidade) ? d.privacidade : null]));
      if (!m) throw erro('erro.midia_nao_encontrada', 404);
      res.json({ midia: m });
    }));

  app.delete(decl('DELETE', `${R}/familias/:familyId/midias/:mediaId`), ...naFamilia,
    rbac.exigir('excluir'), h(async (req, res) => {
      await tenancy.noEscopoDe(req, (t) => midia.arquivar(t, {
        familyId: req.familia.id, userId: req.usuario.id, mediaId: req.params.mediaId }));
      res.json({ ok: true, aviso: req.t('mensagem.midia_arquivada') });
    }));

  /** "CONTE A HISTÓRIA DESTA FOTO" (§23). */
  app.post(decl('POST', `${R}/familias/:familyId/midias/:mediaId/historia`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => midia.contarHistoria(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        mediaId: req.params.mediaId, respostas: req.body || {} }));
      res.status(201).json({ registrado: r });
    }));

  app.post(decl('POST', `${R}/familias/:familyId/midias/:mediaId/pessoas`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => midia.identificar(t, {
        familyId: req.familia.id, userId: req.usuario.id, mediaId: req.params.mediaId,
        personId: (req.body || {}).person_id, origem: 'MANUAL' }));
      res.status(201).json({ identificacao: r });
    }));

  app.post(decl('POST', `${R}/familias/:familyId/identificacoes/:idId/confirmar`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => midia.confirmarIdentificacao(t, {
        familyId: req.familia.id, userId: req.usuario.id, id: req.params.idId }));
      res.json({ identificacao: r });
    }));

  // --------------------------------------------------------------- álbuns
  app.get(decl('GET', `${R}/familias/:familyId/albuns`), ...naFamilia, h(async (req, res) => {
    const lista = await tenancy.noEscopoDe(req, (t) => t.todas(
      `SELECT a.*, (SELECT count(*)::int FROM album_items i WHERE i.album_id = a.id) AS itens
         FROM albums a WHERE a.deleted_at IS NULL ORDER BY a.created_at DESC`));
    const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
    res.json({ albuns: privacidade.filtrar(lista, quem) });
  }));

  app.post(decl('POST', `${R}/familias/:familyId/albuns`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const titulo = s((req.body || {}).titulo, 200);
      if (titulo.length < 2) throw erro('erro.album_sem_titulo', 400);
      const a = await tenancy.noEscopoDe(req, (t) => t.uma(
        `INSERT INTO albums (family_id, titulo, descricao, created_by)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.familia.id, titulo, s((req.body || {}).descricao, 1000), req.usuario.id]));
      res.status(201).json({ album: a });
    }));

  app.post(decl('POST', `${R}/familias/:familyId/albuns/:albumId/itens`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      // Álbum REFERENCIA a mídia; não duplica byte nenhum.
      const r = await tenancy.noEscopoDe(req, (t) => t.uma(
        `INSERT INTO album_items (family_id, album_id, media_id, ordem)
         VALUES ($1,$2,$3,COALESCE((SELECT max(ordem)+1 FROM album_items WHERE album_id=$2),0))
         ON CONFLICT (album_id, media_id) DO NOTHING RETURNING *`,
        [req.familia.id, req.params.albumId, (req.body || {}).media_id]));
      res.status(r ? 201 : 200).json({ item: r, ja_estava: !r });
    }));

  // ---------------------------------------------------------- documentos
  app.get(decl('GET', `${R}/familias/:familyId/midias/:mediaId/texto`), ...naFamilia,
    h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, async (t) => {
        const m = await midia.obter(t, req.params.mediaId);
        if (!m) throw erro('erro.midia_nao_encontrada', 404);
        return { m, texto: await documentos.textoDe(t, m.id) };
      });
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      if (!privacidade.podeVerDocumento(r.m, quem).pode) throw erro('erro.midia_nao_encontrada', 404);
      res.json({ texto: r.texto || { status: 'pendente' } });
    }));

  /** O que ainda NÃO é buscável. A família precisa saber disso. */
  app.get(decl('GET', `${R}/familias/:familyId/documentos/pendentes`), ...naFamilia,
    rbac.exigir('ver.documentos'), h(async (req, res) => {
      res.json({ pendentes: await tenancy.noEscopoDe(req, (t) => documentos.pendentes(t, req.familia.id)) });
    }));

  /**
   * Ler o documento com IA (§24, fase 2.3). Sem `confirmar`, devolve a
   * COTAÇÃO. Com, transcreve e guarda SUGESTÕES — que não são fatos até
   * alguém dizer de quem o papel fala.
   */
  app.post(decl('POST', `${R}/familias/:familyId/midias/:mediaId/analisar`), ...naFamilia,
    rbac.exigir('ia.usar'), h(async (req, res) => {
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      res.json(await documentosIA.analisar({ familyId: req.familia.id, userId: req.usuario.id,
        mediaId: req.params.mediaId, quem, confirmar: !!(req.body || {}).confirmar }));
    }));

  app.get(decl('GET', `${R}/familias/:familyId/midias/:mediaId/achados`), ...naFamilia,
    rbac.exigir('ver.documentos'), h(async (req, res) => {
      res.json({ achados: await tenancy.noEscopoDe(req,
        (t) => documentosIA.achadosDe(t, req.params.mediaId)) });
    }));

  /** Fila da família: tudo que a IA leu e ninguém decidiu ainda. */
  app.get(decl('GET', `${R}/familias/:familyId/achados`), ...naFamilia,
    rbac.exigir('ver.documentos'), h(async (req, res) => {
      res.json({ achados: await tenancy.noEscopoDe(req,
        (t) => documentosIA.pendentesDaFamilia(t, req.familia.id, req.query.limite)) });
    }));

  /** Aceitar: a pessoa aponta de quem o documento fala, e o fato nasce. */
  app.post(decl('POST', `${R}/familias/:familyId/achados/:achadoId/aceitar`), ...naFamilia,
    rbac.exigir('claims.criar'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => documentosIA.aceitar(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        achadoId: req.params.achadoId, personId: (req.body || {}).pessoa }));
      res.status(201).json({ claim: r.claim });
    }));

  app.post(decl('POST', `${R}/familias/:familyId/achados/:achadoId/descartar`), ...naFamilia,
    rbac.exigir('claims.criar'), h(async (req, res) => {
      await tenancy.noEscopoDe(req, (t) => documentosIA.descartar(t, {
        familyId: req.familia.id, userId: req.usuario.id, achadoId: req.params.achadoId }));
      res.json({ ok: true });
    }));

  // --------------------------------------------------------- entrevistas
  /**
   * Entrevistas Origena (§27/§28). O roteiro só existe para quem conduz
   * não travar na primeira pergunta — a família pode acrescentar as suas.
   */
  app.get(decl('GET', `${R}/familias/:familyId/entrevistas`), ...naFamilia, h(async (req, res) => {
    const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
    const dados = await tenancy.noEscopoDe(req, async (t) => ({
      lista: await entrevistas.listar(t, req.familia.id, {
        pessoaId: tenancy.UUID.test(String(req.query.pessoa || '')) ? req.query.pessoa : null,
        limite: req.query.limite }),
      transcricao_disponivel: await entrevistas.transcricaoDisponivel(t),
    }));
    res.json({
      entrevistas: privacidade.filtrar(dados.lista, quem),
      transcricao_disponivel: dados.transcricao_disponivel,
      roteiros: entrevistas.ROTEIROS.map((r) => ({ chave: r.chave,
        perguntas: entrevistas.perguntasDe(r.chave) })),
    });
  }));

  app.post(decl('POST', `${R}/familias/:familyId/entrevistas`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const b = req.body || {};
      const e = await tenancy.noEscopoDe(req, (t) => entrevistas.criar(t, {
        familyId: req.familia.id, userId: req.usuario.id, personId: b.pessoa,
        roteiro: b.roteiro, privacidade: b.privacidade }));
      res.status(201).json({ entrevista: e });
    }));

  app.get(decl('GET', `${R}/familias/:familyId/entrevistas/:entrevistaId`), ...naFamilia,
    h(async (req, res) => {
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      const dados = await tenancy.noEscopoDe(req, async (t) => {
        const e = await entrevistas.obter(t, req.params.entrevistaId);
        if (!privacidade.podeVer(e, quem).pode) throw erro('erro.entrevista_nao_encontrada', 404);
        for (const r of e.respostas) r.achados = await documentosIA.achadosDaResposta(t, r.id);
        return { entrevista: e, transcricao_disponivel: await entrevistas.transcricaoDisponivel(t) };
      });
      res.json(dados);
    }));

  app.post(decl('POST', `${R}/familias/:familyId/entrevistas/:entrevistaId/perguntas`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => entrevistas.acrescentarPergunta(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        interviewId: req.params.entrevistaId, texto: (req.body || {}).texto }));
      res.status(201).json({ resposta: r });
    }));

  app.post(decl('POST', `${R}/familias/:familyId/entrevistas/:entrevistaId/concluir`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      res.json({ entrevista: await tenancy.noEscopoDe(req, (t) => entrevistas.concluir(t, {
        familyId: req.familia.id, userId: req.usuario.id, interviewId: req.params.entrevistaId })) });
    }));

  app.delete(decl('DELETE', `${R}/familias/:familyId/entrevistas/:entrevistaId`), ...naFamilia,
    rbac.exigir('excluir'), h(async (req, res) => {
      await tenancy.noEscopoDe(req, (t) => entrevistas.arquivar(t, {
        familyId: req.familia.id, userId: req.usuario.id, interviewId: req.params.entrevistaId }));
      res.json({ ok: true });
    }));

  /** Liga o áudio JÁ enviado (fluxo normal de mídia) à pergunta. */
  app.post(decl('POST', `${R}/familias/:familyId/respostas/:respostaId/audio`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const b = req.body || {};
      const r = await tenancy.noEscopoDe(req, (t) => entrevistas.registrarAudio(t, {
        familyId: req.familia.id, userId: req.usuario.id, respostaId: req.params.respostaId,
        mediaId: b.midia, duracaoSeg: b.duracao_seg }));
      res.json({ resposta: { id: r.id, status: r.status } });
    }));

  /** Escrever/corrigir à mão — o que mantém a entrevista viva sem provedor. */
  app.patch(decl('PATCH', `${R}/familias/:familyId/respostas/:respostaId`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const b = req.body || {};
      if (b.pular) {
        await tenancy.noEscopoDe(req, (t) => entrevistas.pular(t, req.params.respostaId));
        return res.json({ ok: true });
      }
      const r = await tenancy.noEscopoDe(req, (t) => entrevistas.corrigir(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        respostaId: req.params.respostaId, texto: b.transcricao }));
      res.json({ resposta: { id: r.id, transcricao: r.transcricao,
        transcricao_origem: r.transcricao_origem } });
    }));

  /** Transcrever (cota antes; 503 quando não há provedor ligado). */
  app.post(decl('POST', `${R}/familias/:familyId/respostas/:respostaId/transcrever`), ...naFamilia,
    rbac.exigir('ia.usar'), h(async (req, res) => {
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      res.json(await entrevistas.transcrever({ familyId: req.familia.id, userId: req.usuario.id,
        respostaId: req.params.respostaId, quem, confirmar: !!(req.body || {}).confirmar }));
    }));

  /** Pessoas, datas e lugares da transcrição — como SUGESTÃO (§28). */
  app.post(decl('POST', `${R}/familias/:familyId/respostas/:respostaId/entidades`), ...naFamilia,
    rbac.exigir('ia.usar'), h(async (req, res) => {
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      res.json(await entrevistas.extrairEntidades({ familyId: req.familia.id,
        userId: req.usuario.id, respostaId: req.params.respostaId, quem,
        confirmar: !!(req.body || {}).confirmar }));
    }));

  // ----------------------------------------------------------- histórias
  app.get(decl('GET', `${R}/familias/:familyId/historias`), ...naFamilia, h(async (req, res) => {
    const lista = await tenancy.noEscopoDe(req, (t) => historias.listar(t, req.familia.id, {
      pessoaId: tenancy.UUID.test(String(req.query.pessoa || '')) ? req.query.pessoa : null,
      limite: Number(req.query.limite) || 50 }));
    const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
    res.json({ historias: lista.filter((x) => privacidade.podeVer(
      { privacidade: x.privacidade, created_by: x.created_by }, quem).pode) });
  }));

  app.post(decl('POST', `${R}/familias/:familyId/historias`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const x = await tenancy.noEscopoDe(req, (t) => historias.criar(t, {
        familyId: req.familia.id, userId: req.usuario.id, dados: req.body || {} }));
      res.status(201).json({ historia: x });
    }));

  app.get(decl('GET', `${R}/familias/:familyId/historias/:storyId`), ...naFamilia,
    h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => historias.obter(t, req.params.storyId));
      if (!r) throw erro('erro.historia_nao_encontrada', 404);
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      if (!privacidade.podeVer(
        { privacidade: r.historia.privacidade, created_by: r.historia.created_by }, quem).pode) {
        throw erro('erro.historia_nao_encontrada', 404);
      }
      res.json(r);
    }));

  /** Editar CRIA a versão seguinte; a anterior fica consultável (§67). */
  app.patch(decl('PATCH', `${R}/familias/:familyId/historias/:storyId`), ...naFamilia,
    rbac.exigir('editar'), h(async (req, res) => {
      const x = await tenancy.noEscopoDe(req, (t) => historias.editar(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        storyId: req.params.storyId, dados: req.body || {} }));
      res.json({ historia: x, aviso: req.t('mensagem.versao_preservada') });
    }));

  // ----------------------------------------------------- tradições (§35–37)
  // Receita, celebração, música, expressão e saber moram na MESMA
  // entidade; a receita ganha ingredientes e preparo. O manuscrito da
  // vovó é `media` — a transcrição não o substitui.
  app.get(decl('GET', `${R}/familias/:familyId/tradicoes`), ...naFamilia, h(async (req, res) => {
    const lista = await tenancy.noEscopoDe(req, (t) => tradicoes.Tradicoes.listar(t, req.familia.id, {
      categoria: tradicoes.CATEGORIAS.includes(req.query.categoria) ? req.query.categoria : null,
      pessoaId: tenancy.UUID.test(String(req.query.pessoa || '')) ? req.query.pessoa : null }));
    const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
    const visiveis = lista.filter((x) =>
      privacidade.podeVer({ privacidade: x.privacidade, created_by: x.created_by }, quem).pode);
    res.json({ tradicoes: visiveis, ocultas: lista.length - visiveis.length,
      categorias: tradicoes.CATEGORIAS });
  }));

  app.post(decl('POST', `${R}/familias/:familyId/tradicoes`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const tr = await tenancy.noEscopoDe(req, (t) => tradicoes.Tradicoes.criar(t, {
        familyId: req.familia.id, userId: req.usuario.id, dados: req.body || {} }));
      res.status(201).json({ tradicao: tr });
    }));

  app.get(decl('GET', `${R}/familias/:familyId/tradicoes/:tradicaoId`), ...naFamilia,
    h(async (req, res) => {
      const tr = await tenancy.noEscopoDe(req, (t) =>
        tradicoes.Tradicoes.obter(t, req.params.tradicaoId));
      if (!tr) throw erro('erro.tradicao_nao_encontrada', 404);
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      if (!privacidade.podeVer(tr, quem).pode) throw erro('erro.tradicao_nao_encontrada', 404);
      res.json({ tradicao: tr });
    }));

  app.patch(decl('PATCH', `${R}/familias/:familyId/tradicoes/:tradicaoId`), ...naFamilia,
    rbac.exigir('editar'), h(async (req, res) => {
      const tr = await tenancy.noEscopoDe(req, (t) => tradicoes.Tradicoes.atualizar(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        id: req.params.tradicaoId, dados: req.body || {} }));
      res.json({ tradicao: tr });
    }));

  app.delete(decl('DELETE', `${R}/familias/:familyId/tradicoes/:tradicaoId`), ...naFamilia,
    rbac.exigir('excluir'), h(async (req, res) => {
      await tenancy.noEscopoDe(req, (t) => tradicoes.Tradicoes.arquivar(t, {
        familyId: req.familia.id, userId: req.usuario.id, id: req.params.tradicaoId }));
      res.json({ ok: true, aviso: req.t('mensagem.tradicao_arquivada') });
    }));

  /** "Quem aprendeu a fazer" — o que impede a receita de morrer (§36). */
  app.post(decl('POST', `${R}/familias/:familyId/tradicoes/:tradicaoId/aprendizes`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const d = req.body || {};
      const l = await tenancy.noEscopoDe(req, (t) => tradicoes.Tradicoes.aprendeu(t, {
        familyId: req.familia.id, userId: req.usuario.id, tradicaoId: req.params.tradicaoId,
        personId: d.person_id, quando: d.quando, nota: d.nota }));
      res.status(201).json({ aprendiz: l });
    }));

  /** A corrente do saber: quem ensinou → quem aprendeu (§37). */
  app.post(decl('POST', `${R}/familias/:familyId/tradicoes/:tradicaoId/transmissoes`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const d = req.body || {};
      const x = await tenancy.noEscopoDe(req, (t) => tradicoes.Tradicoes.transmitir(t, {
        familyId: req.familia.id, userId: req.usuario.id, tradicaoId: req.params.tradicaoId,
        dePersonId: d.de_person_id, paraPersonId: d.para_person_id,
        quando: d.quando, nota: d.nota }));
      res.status(201).json({ transmissao: x });
    }));

  // ------------------------------------------------------ relíquias (§38)
  app.get(decl('GET', `${R}/familias/:familyId/reliquias`), ...naFamilia, h(async (req, res) => {
    const lista = await tenancy.noEscopoDe(req, (t) => tradicoes.Reliquias.listar(t, req.familia.id, {
      pessoaId: tenancy.UUID.test(String(req.query.pessoa || '')) ? req.query.pessoa : null }));
    const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
    const visiveis = lista.filter((x) =>
      privacidade.podeVer({ privacidade: x.privacidade, created_by: x.created_by }, quem).pode);
    res.json({ reliquias: visiveis, ocultas: lista.length - visiveis.length });
  }));

  app.post(decl('POST', `${R}/familias/:familyId/reliquias`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => tradicoes.Reliquias.criar(t, {
        familyId: req.familia.id, userId: req.usuario.id, dados: req.body || {} }));
      res.status(201).json({ reliquia: r });
    }));

  app.get(decl('GET', `${R}/familias/:familyId/reliquias/:reliquiaId`), ...naFamilia,
    h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) =>
        tradicoes.Reliquias.obter(t, req.params.reliquiaId));
      if (!r) throw erro('erro.reliquia_nao_encontrada', 404);
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      if (!privacidade.podeVer(r, quem).pode) throw erro('erro.reliquia_nao_encontrada', 404);
      res.json({ reliquia: r });
    }));

  app.delete(decl('DELETE', `${R}/familias/:familyId/reliquias/:reliquiaId`), ...naFamilia,
    rbac.exigir('excluir'), h(async (req, res) => {
      await tenancy.noEscopoDe(req, (t) => tradicoes.Reliquias.arquivar(t, {
        familyId: req.familia.id, userId: req.usuario.id, id: req.params.reliquiaId }));
      res.json({ ok: true, aviso: req.t('mensagem.reliquia_arquivada') });
    }));

  /**
   * Passar o objeto de mão. FECHA a custódia anterior e ABRE a nova — a
   * corrente inteira continua legível, e a resposta a "como você sabe?"
   * entra como FONTE, igual ao resto do sistema.
   */
  app.post(decl('POST', `${R}/familias/:familyId/reliquias/:reliquiaId/custodia`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const d = req.body || {};
      const c = await tenancy.noEscopoDe(req, async (t) => {
        let fonte = null;
        if (d.fonte_titulo || d.fonte_referencia || d.fonte_tipo) {
          fonte = await prov.criarFonte(t, {
            familyId: req.familia.id, userId: req.usuario.id,
            tipo: s(d.fonte_tipo, 30) || 'RELATO', titulo: s(d.fonte_titulo, 200),
            referenciaExterna: s(d.fonte_referencia, 300) });
        }
        return tradicoes.Reliquias.transferir(t, {
          familyId: req.familia.id, userId: req.usuario.id, heirloomId: req.params.reliquiaId,
          personId: d.person_id, de: d.de, ate: d.ate, nota: s(d.nota, 500),
          sourceId: fonte && fonte.id });
      });
      res.status(201).json({ custodia: c });
    }));

  // ------------------------------------------ historiador e missões (§29–32)
  /**
   * O que FALTA no acervo. É consulta, não IA: custa zero crédito, não
   * depende de provedor e não inventa lacuna que não existe.
   */
  app.get(decl('GET', `${R}/familias/:familyId/historiador`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => historiador.lacunas(t, req.familia.id));
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      const visiveis = r.lacunas.filter((l) =>
        privacidade.podeVer({ privacidade: l.privacidade, created_by: l.criado_por }, quem).pode);
      const porTipo = {};
      for (const l of visiveis) porTipo[l.tipo] = (porTipo[l.tipo] || 0) + 1;
      res.json({ lacunas: visiveis, por_tipo: porTipo,
        ocultas: r.lacunas.length - visiveis.length,
        // o que a varredura CORTOU aparece: silêncio aqui viraria
        // "não falta mais nada" quando ainda falta
        alem_do_teto: r.cortados, teto: historiador.TETO });
    }));

  app.get(decl('GET', `${R}/familias/:familyId/missoes`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const status = ['aberta', 'respondida', 'resolvida', 'dispensada', 'todas']
        .includes(req.query.status) ? req.query.status : 'aberta';
      const r = await tenancy.noEscopoDe(req, async (t) => ({
        missoes: await missoes.listar(t, req.familia.id, { status }),
        contagem: await missoes.contar(t, req.familia.id),
      }));
      // A pergunta chega traduzida para o idioma de QUEM lê (§86) — e o
      // nome do campo divergente também ("data_nascimento" não é frase).
      res.json({ ...r, missoes: r.missoes.map((m) => {
        const vars = { ...(m.pergunta_vars || {}) };
        if (vars.campo) vars.campo = req.t('predicado.' + vars.campo);
        return { ...m, pergunta: req.t(m.pergunta_chave, vars) };
      }) });
    }));

  app.post(decl('POST', `${R}/familias/:familyId/missoes/sincronizar`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => missoes.sincronizar(t, {
        familyId: req.familia.id, userId: req.usuario.id }));
      // E-mail FORA da transação, e só para quem pediu — com a contagem,
      // nunca com as perguntas (PRIVACY.md §7).
      for (const u of r.avisar) {
        await emails.missoes(u.email, { familia: req.familia.nome, n: r.criadas }, u.idioma);
      }
      res.json({ criadas: r.criadas, resolvidas: r.resolvidas, lacunas: r.lacunas,
        alem_do_teto: r.cortados, avisados: r.avisar.length });
    }));

  app.post(decl('POST', `${R}/familias/:familyId/missoes/:missaoId/responder`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => missoes.responder(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        missionId: req.params.missaoId, corpo: (req.body || {}).corpo }));
      res.status(201).json(r);
    }));

  app.post(decl('POST', `${R}/familias/:familyId/missoes/:missaoId/dispensar`), ...naFamilia,
    rbac.exigir('editar'), h(async (req, res) => {
      const m = await tenancy.noEscopoDe(req, (t) => missoes.dispensar(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        missionId: req.params.missaoId, motivo: (req.body || {}).motivo }));
      res.json({ missao: m, aviso: req.t('mensagem.missao_nao_volta') });
    }));

  /**
   * Índice de memória (§31). SEM RANKING: sai em ordem de NOME, e o que
   * a tela mostra é a LACUNA nomeada, não a posição.
   */
  app.get(decl('GET', `${R}/familias/:familyId/indice-memoria`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const lista = await tenancy.noEscopoDe(req, (t) =>
        historiador.indiceDaFamilia(t, req.familia.id));
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      const visiveis = lista.filter((p) =>
        privacidade.podeVer({ privacidade: p.privacidade, created_by: p.criado_por }, quem).pode);
      res.json({ pessoas: visiveis, dimensoes: historiador.DIMENSOES,
        ocultas: lista.length - visiveis.length, ordenado_por: 'nome' });
    }));

  app.get(decl('GET', `${R}/familias/:familyId/pessoas/:pessoaId/indice-memoria`), ...naFamilia,
    h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, async (t) => {
        const p = await Persons.obter(t, req.params.pessoaId);
        if (!p) return null;
        return { pessoa: p, indice: await historiador.indiceDaPessoa(t, req.params.pessoaId),
          quem_sabe: await historiador.quemSabe(t, req.params.pessoaId) };
      });
      if (!r) throw erro('erro.pessoa_nao_encontrada', 404);
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      if (!privacidade.podeVer(r.pessoa, quem).pode) throw erro('erro.pessoa_nao_encontrada', 404);
      res.json({ indice: r.indice, quem_sabe: r.quem_sabe, dimensoes: historiador.DIMENSOES });
    }));

  // ------------------------------------------------- notificações (§87)
  // OPT-IN: sem linha na tabela, ninguém recebe nada.
  app.get(decl('GET', `${R}/familias/:familyId/notificacoes`), ...naFamilia, h(async (req, res) => {
    const prefs = await tenancy.noEscopoDe(req, (t) =>
      missoes.prefsDe(t, req.familia.id, req.usuario.id));
    res.json({ preferencias: prefs, eventos: missoes.EVENTOS,
      frequencias: missoes.FREQUENCIAS, padrao: 'nunca' });
  }));

  app.patch(decl('PATCH', `${R}/familias/:familyId/notificacoes`), ...naFamilia,
    h(async (req, res) => {
      const d = req.body || {};
      const p = await tenancy.noEscopoDe(req, (t) => missoes.definirPref(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        evento: s(d.evento, 40) || 'missoes', frequencia: s(d.frequencia, 20) }));
      res.json({ preferencia: p });
    }));

  // --------------------------------------------------------------- busca
  /**
   * Uma caixa para todo o acervo (§43). O resultado passa por `podeVer`
   * ANTES de sair: documento privado não aparece nem como título.
   */
  app.get(decl('GET', `${R}/familias/:familyId/busca`), ...naFamilia, h(async (req, res) => {
    const q = req.query || {};
    const tipos = s(q.tipos, 200) ? s(q.tipos, 200).split(',').filter(Boolean) : null;
    const linhas = await tenancy.noEscopoDe(req, (t) => busca.procurar(t, req.familia.id, {
      termo: s(q.q, 200),
      tipos,
      pessoaId: tenancy.UUID.test(String(q.pessoa || '')) ? q.pessoa : null,
      autorId: tenancy.UUID.test(String(q.autor || '')) ? q.autor : null,
      de: s(q.de, 12) || null, ate: s(q.ate, 12) || null,
      local: s(q.local, 100),
      limite: Number(q.limite) || 40, offset: Number(q.offset) || 0 }));
    const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
    const visiveis = busca.filtrar(linhas, quem);
    res.json({ resultados: visiveis, ocultos: linhas.length - visiveis.length });
  }));

  // -------------------------------------------------------------- lugares
  app.get(decl('GET', `${R}/familias/:familyId/lugares`), ...naFamilia, h(async (req, res) => {
    res.json({ lugares: await tenancy.noEscopoDe(req, (t) => tempo.Places.listar(t, req.familia.id)) });
  }));

  app.post(decl('POST', `${R}/familias/:familyId/lugares`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const p = await tenancy.noEscopoDe(req, (t) => tempo.Places.criar(t, {
        familyId: req.familia.id, userId: req.usuario.id, dados: req.body || {} }));
      res.status(201).json({ lugar: p });
    }));

  /** Renomear PRESERVA o nome antigo — é o que está no verso das fotos. */
  app.patch(decl('PATCH', `${R}/familias/:familyId/lugares/:lugarId`), ...naFamilia,
    rbac.exigir('editar'), h(async (req, res) => {
      const p = await tenancy.noEscopoDe(req, (t) => tempo.Places.renomear(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        id: req.params.lugarId, nome: (req.body || {}).nome }));
      res.json({ lugar: p, aviso: req.t('mensagem.nome_historico_preservado') });
    }));

  // -------------------------------------------------------------- eventos
  app.post(decl('POST', `${R}/familias/:familyId/eventos`), ...naFamilia,
    rbac.exigir('contribuir'), h(async (req, res) => {
      const ev = await tenancy.noEscopoDe(req, (t) => tempo.Events.criar(t, {
        familyId: req.familia.id, userId: req.usuario.id, dados: req.body || {} }));
      res.status(201).json({ evento: ev });
    }));

  app.get(decl('GET', `${R}/familias/:familyId/eventos/:eventoId`), ...naFamilia,
    h(async (req, res) => {
      const ev = await tenancy.noEscopoDe(req, (t) => tempo.Events.obter(t, req.params.eventoId));
      if (!ev) throw erro('erro.evento_nao_encontrado', 404);
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      if (!privacidade.podeVer({ privacidade: ev.privacidade, created_by: ev.created_by }, quem).pode) {
        throw erro('erro.evento_nao_encontrado', 404);
      }
      res.json({ evento: ev });
    }));

  // ------------------------------------------------------------- timeline
  /**
   * §33: individual (?pessoa=) e familiar. A projeção é reconstruída a
   * cada consulta — não existe estado velho (tempo.js explica o custo).
   * O resultado passa por podeVer, como tudo o que sai da API.
   */
  app.get(decl('GET', `${R}/familias/:familyId/timeline`), ...naFamilia, h(async (req, res) => {
    const q = req.query || {};
    const linhas = await tenancy.noEscopoDe(req, (t) => tempo.listar(t, req.familia.id, {
      pessoaId: tenancy.UUID.test(String(q.pessoa || '')) ? q.pessoa : null,
      de: s(q.de, 12) || null, ate: s(q.ate, 12) || null,
      limite: Number(q.limite) || 300 }));
    const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
    const visiveis = linhas.filter((l) =>
      privacidade.podeVer({ privacidade: l.privacidade, created_by: l.criado_por }, quem).pode);
    res.json({ itens: visiveis, ocultos: linhas.length - visiveis.length });
  }));

  // ------------------------------------------------------- créditos e IA
  app.get(decl('GET', `${R}/familias/:familyId/creditos`), ...naFamilia, h(async (req, res) => {
    const r = await tenancy.noEscopoDe(req, async (t) => ({
      carteira: await creditos.carteira(t, req.familia.id),
      extrato: await creditos.extrato(t, req.familia.id, 50),
    }));
    res.json({ saldo: r.carteira.saldo, extrato: r.extrato });
  }));

  /**
   * Planos e pacotes de crédito (§48/§50). A família vê PREÇO, nunca custo
   * nem margem — esses são do staff. `pagamento` diz se há gateway ligado:
   * sem ele a tela pede contato em vez de fingir um botão que não cobra.
   */
  app.get(decl('GET', `${R}/familias/:familyId/planos`), ...naFamilia, h(async (req, res) => {
    const db = require('./db');
    const planos = await db.todas(
      `SELECT codigo, nome, preco_centavos, preco_anual_centavos, storage_gb,
              creditos_mes, familias FROM plans WHERE ativo ORDER BY ordem, preco_centavos`);
    const pacotes = await db.todas(
      `SELECT codigo, nome, preco_centavos, creditos FROM products
        WHERE ativo AND categoria = 'creditos' ORDER BY ordem, preco_centavos`);
    const dados = await tenancy.noEscopoDe(req, async (t) => {
      // Créditos do ciclo entram aqui, na visita — o produto ainda não tem
      // agendador próprio, e a chamada é idempotente pela competência.
      await billing.renovarCiclo(t, req.familia.id);
      const assinatura = await t.uma(
        `SELECT s.status, s.ciclo, s.proximo_ciclo, s.preco_centavos, p.codigo, p.nome
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id
          WHERE s.family_id = $1 ORDER BY s.inicio DESC LIMIT 1`, [req.familia.id]);
      const saldo = await creditos.carteira(t, req.familia.id);
      return { assinatura, saldo: saldo.saldo, pedidos: await billing.pedidosDe(t, req.familia.id, 10) };
    });
    res.json({ planos, pacotes, ...dados, pagamento: billing.ativo() ? 'mercadopago' : 'manual' });
  }));

  /**
   * Comprar créditos (§50). Devolve o LINK do gateway; o crédito só entra
   * quando o webhook confirmar o pagamento com o Mercado Pago — nunca aqui.
   */
  app.post(decl('POST', `${R}/familias/:familyId/pedidos`), ...naFamilia,
    rbac.exigir('creditos.comprar'), h(async (req, res) => {
      const pedido = await tenancy.noEscopoDe(req, (t) => billing.pedirCreditos(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        produtoCodigo: (req.body || {}).pacote }));
      const pag = await billing.linkDePagamento(pedido,
        { email: req.usuario.email, nome: req.usuario.nome });
      res.status(201).json({ pedido: { id: pedido.id, codigo: pedido.codigo,
        total_centavos: pedido.total_centavos, creditos: pedido.creditos }, pagamento: pag });
    }));

  /** Histórico de compras da família — o que pagou, quando e por quanto. */
  app.get(decl('GET', `${R}/familias/:familyId/pedidos`), ...naFamilia,
    rbac.exigir('creditos.comprar'), h(async (req, res) => {
      res.json({ pedidos: await tenancy.noEscopoDe(req,
        (t) => billing.pedidosDe(t, req.familia.id, Number(req.query.limite) || 30)) });
    }));

  /** Assinar (ou trocar de) plano — recorrência no gateway, uma por família. */
  app.post(decl('POST', `${R}/familias/:familyId/assinatura`), ...naFamilia,
    rbac.exigir('creditos.comprar'), h(async (req, res) => {
      const b = req.body || {};
      const pedido = await tenancy.noEscopoDe(req, (t) => billing.pedirAssinatura(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        planoCodigo: b.plano, ciclo: b.ciclo === 'anual' ? 'anual' : 'mensal' }));
      const pag = await billing.linkDePagamento(pedido,
        { email: req.usuario.email, nome: req.usuario.nome });
      res.status(201).json({ pedido: { id: pedido.id, codigo: pedido.codigo,
        total_centavos: pedido.total_centavos }, pagamento: pag });
    }));

  /** Cancelar: vale até o fim do ciclo já pago. */
  app.delete(decl('DELETE', `${R}/familias/:familyId/assinatura`), ...naFamilia,
    rbac.exigir('creditos.comprar'), h(async (req, res) => {
      const sub = await tenancy.noEscopoDe(req, (t) => billing.cancelarAssinatura(t, {
        familyId: req.familia.id, userId: req.usuario.id }));
      res.json({ ok: true, vale_ate: sub.proximo_ciclo });
    }));

  /** O que a IA sabe fazer HOJE — a UI só mostra botão do que existe (ADR-0004). */
  app.get(decl('GET', `${R}/familias/:familyId/ia/capacidades`), ...naFamilia, h(async (req, res) => {
    const caps = {};
    await tenancy.noEscopoDe(req, async (t) => {
      for (const c of ['gerar_biografia', 'responder_familia', 'analisar_documento']) {
        const cot = await router.cotar(t, c);
        caps[c] = cot ? { disponivel: true, creditos: cot.creditos } : { disponivel: false };
      }
    });
    res.json({ capacidades: caps });
  }));

  /**
   * Biografia (§18/§19). Sem `confirmar`: devolve a COTAÇÃO ("custará X
   * créditos"). Com `confirmar`: reserva → gera → versão nova com fontes.
   */
  app.post(decl('POST', `${R}/familias/:familyId/pessoas/:pessoaId/biografia`), ...naFamilia,
    rbac.exigir('ia.usar'), h(async (req, res) => {
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      const r = await conhecimento.gerarBiografia({
        familyId: req.familia.id, userId: req.usuario.id,
        personId: req.params.pessoaId, quem, confirmar: !!(req.body || {}).confirmar });
      res.status(r.cotacao ? 200 : 201).json(r);
    }));

  app.get(decl('GET', `${R}/familias/:familyId/pessoas/:pessoaId/biografia`), ...naFamilia,
    h(async (req, res) => {
      const bio = await tenancy.noEscopoDe(req, (t) =>
        conhecimento.biografiaDe(t, req.params.pessoaId));
      res.json({ biografia: bio });
    }));

  /** "Pergunte à Origena" (§44). */
  app.post(decl('POST', `${R}/familias/:familyId/perguntar`), ...naFamilia,
    rbac.exigir('ia.usar'), h(async (req, res) => {
      const quem = { userId: req.usuario.id, papel: req.papel, permissoesExtra: req.permissoesExtra };
      const r = await conhecimento.perguntar({
        familyId: req.familia.id, userId: req.usuario.id,
        pergunta: (req.body || {}).pergunta, quem, confirmar: !!(req.body || {}).confirmar });
      res.json(r);
    }));

  // --------------------------------------------------- exportação (§68)
  app.post(decl('POST', `${R}/familias/:familyId/exportacoes`), ...naFamilia,
    rbac.exigir('exportar'), h(async (req, res) => {
      const exp = await tenancy.noEscopoDe(req, async (t) => {
        const e = await t.uma(
          `INSERT INTO exports (family_id, created_by) VALUES ($1,$2) RETURNING *`,
          [req.familia.id, req.usuario.id]);
        await fila.enfileirar({ tipo: 'export.gerar', fila: 'cara',
          familyId: req.familia.id,
          payload: { exportId: e.id, familyId: req.familia.id },
          chaveIdem: 'export:' + e.id }, t);
        await auditar({ familyId: req.familia.id, atorUserId: req.usuario.id,
          acao: 'exportacao.pedida', alvoTipo: 'export', alvoId: e.id }, t);
        return e;
      });
      res.status(202).json({ exportacao: exp, estado: 'PROCESSANDO' });
    }));

  app.get(decl('GET', `${R}/familias/:familyId/exportacoes/:exportId`), ...naFamilia,
    rbac.exigir('exportar'), h(async (req, res) => {
      const e = await tenancy.noEscopoDe(req, (t) =>
        t.uma(`SELECT * FROM exports WHERE id = $1`, [req.params.exportId]));
      if (!e) throw erro('erro.export_nao_encontrado', 404);
      res.json({
        exportacao: { id: e.id, status: e.status, bytes: Number(e.bytes), itens: e.itens },
        url: e.status === 'pronto' ? storage.urlDeLeitura(e.storage_key, { segundos: 3600 }) : null,
      });
    }));

  /** GEDCOM direto (texto): rápido, sem job — é só a árvore (§70). */
  app.get(decl('GET', `${R}/familias/:familyId/gedcom`), ...naFamilia,
    rbac.exigir('exportar'), h(async (req, res) => {
      const ged = await tenancy.noEscopoDe(req, (t) =>
        exportar.gedcomDe(t, req.familia.id, req.familia.nome));
      res.type('text/plain; charset=utf-8').send(ged);
    }));

  // -------------------------------------------------- importação (§69/70)
  app.post(decl('POST', `${R}/familias/:familyId/importar`), ...naFamilia,
    rbac.exigir('familia.editar'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => exportar.importarDados(t, {
        familyId: req.familia.id, userId: req.usuario.id, dados: (req.body || {}).dados }));
      res.status(201).json({ importado: r });
    }));

  app.post(decl('POST', `${R}/familias/:familyId/importar-gedcom`), ...naFamilia,
    rbac.exigir('familia.editar'), h(async (req, res) => {
      const r = await tenancy.noEscopoDe(req, (t) => exportar.importarGedcom(t, {
        familyId: req.familia.id, userId: req.usuario.id, texto: (req.body || {}).texto }));
      res.status(201).json({ importado: r });
    }));

  // ------------------------------------------------------- lixeira (§66)
  app.get(decl('GET', `${R}/familias/:familyId/lixeira`), ...naFamilia,
    rbac.exigir('restaurar'), h(async (req, res) => {
      res.json(await tenancy.noEscopoDe(req, (t) => purga.lixeira(t, req.familia.id)));
    }));

  app.post(decl('POST', `${R}/familias/:familyId/lixeira/:tipo/:itemId/restaurar`), ...naFamilia,
    rbac.exigir('restaurar'), h(async (req, res) => {
      await tenancy.noEscopoDe(req, (t) => purga.restaurar(t, {
        familyId: req.familia.id, userId: req.usuario.id,
        tipo: req.params.tipo, id: req.params.itemId }));
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
