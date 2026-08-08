// =====================================================================
// ORIGENA — acesso a dados da Fase 1 (contas, famílias, membros,
// convites, consentimento, auditoria).
//
// `users`, `family_memberships` e `invites` são escopadas por USUÁRIO,
// não por família — é preciso listar "minhas famílias" antes de ter uma
// família escolhida. Por isso elas NÃO têm RLS, e o escopo é imposto
// aqui, com teste. Toda função que lê membership recebe o `userId` e o
// usa no WHERE. Não existe `obterPorId` sem dono.
// =====================================================================
'use strict';
const crypto = require('crypto');
const db = require('./db');
const tenancy = require('./tenancy');
const rbac = require('./rbac');
const { erro } = require('./erros');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const email = (v) => s(v, 200).toLowerCase();
const novoToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function slugificar(nome) {
  return s(nome, 60).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'familia';
}

// ---------------------------------------------------------------- auditoria
const SQL_AUDIT = `INSERT INTO audit_log (family_id, ator_user_id, ator_kind, acao, alvo_tipo, alvo_id,
                          antes, depois, motivo, ip, user_agent)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`;

/**
 * Registra evento crítico (§65). Guarda METADADO, nunca conteúdo.
 *
 * `t` opcional: passe o cliente da transação para o registro entrar junto
 * com a mudança — ou os dois acontecem, ou nenhum.
 *
 * ⚠️ `audit_log` tem RLS com WITH CHECK. Gravar linha de família **sem**
 * `app.family_id` posto é recusado pelo banco — foi assim que o muro se
 * mostrou de pé na primeira execução dos testes. Por isso a função põe o
 * escopo ela mesma: quem audita nem sempre está numa transação escopada
 * (criar família, por exemplo, é escrita ANTES de a família existir).
 */
async function auditar({ familyId = null, atorUserId = null, atorKind = 'user', acao,
  alvoTipo = null, alvoId = null, antes = null, depois = null, motivo = null, req = null }, t = null) {
  const valores = [familyId, atorUserId, atorKind, s(acao, 80), alvoTipo, alvoId,
    antes ? JSON.stringify(antes) : null, depois ? JSON.stringify(depois) : null,
    motivo ? s(motivo, 500) : null,
    req ? s(req.ip, 60) : null, req ? s(req.get && req.get('user-agent'), 300) : null];

  if (t) {
    if (familyId) await t.q('SELECT set_config($1,$2,true)', ['app.family_id', String(familyId)]);
    return void await t.q(SQL_AUDIT, valores);
  }
  if (!familyId) return void await db.q(SQL_AUDIT, valores);   // evento global (conta, login)
  return void await tenancy.comEscopo(familyId, (e) => e.q(SQL_AUDIT, valores));
}

// ------------------------------------------------------------------ usuários
const Users = {
  porEmail: (e) => db.uma('SELECT * FROM users WHERE lower(email) = $1 AND deleted_at IS NULL', [email(e)]),
  porId: (id) => db.uma('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]),

  async criar({ nome, emailBruto, senhaHash, idioma = 'pt-BR' }) {
    const token = novoToken();
    const u = await db.uma(
      `INSERT INTO users (nome, email, senha_hash, idioma, verif_token, verif_expira_em)
       VALUES ($1,$2,$3,$4,$5, now() + interval '3 days') RETURNING *`,
      [s(nome, 120), email(emailBruto), senhaHash, s(idioma, 10), hashToken(token)]);
    return { usuario: u, tokenVerificacao: token };
  },

  async verificarEmail(token) {
    const u = await db.uma(
      `UPDATE users SET email_verificado = true, verif_token = NULL, verif_expira_em = NULL,
              updated_at = now()
        WHERE verif_token = $1 AND verif_expira_em > now() AND deleted_at IS NULL
        RETURNING *`, [hashToken(token)]);
    return u;
  },

  /** Invalida TODAS as sessões (troca de senha, "sair de todos"). */
  derrubarSessoes: (id) => db.q('UPDATE users SET sessao_versao = sessao_versao + 1 WHERE id = $1', [id]),

  trocarSenha: (id, hash) => db.q(
    `UPDATE users SET senha_hash = $2, sessao_versao = sessao_versao + 1,
            reset_token = NULL, reset_expira_em = NULL, updated_at = now() WHERE id = $1`, [id, hash]),

  marcarAcesso: (id) => db.q('UPDATE users SET ultimo_acesso_em = now() WHERE id = $1', [id]),

  ativarMFA: (id, segredoCifrado, hashesBackup) => db.q(
    `UPDATE users SET mfa_segredo_cif = $2, mfa_ativo = true, mfa_backup_hashes = $3,
            updated_at = now() WHERE id = $1`, [id, segredoCifrado, hashesBackup]),

  desativarMFA: (id) => db.q(
    `UPDATE users SET mfa_segredo_cif = NULL, mfa_ativo = false, mfa_backup_hashes = '{}',
            updated_at = now() WHERE id = $1`, [id]),
};

// ------------------------------------------------------------------ famílias
const Families = {
  /**
   * Cria a família e o vínculo de OWNER na MESMA transação. Família sem
   * dono é um estado que nunca deve existir, nem por um instante.
   */
  async criar({ nome, userId, sobrenomes = [] }) {
    return db.transacao(async (t) => {
      const base = slugificar(nome);
      let slug = base;
      for (let i = 2; i <= 50; i++) {
        const existe = await t.uma('SELECT 1 FROM families WHERE slug = $1 AND deleted_at IS NULL', [slug]);
        if (!existe) break;
        slug = `${base}-${i}`;
      }
      const f = await t.uma(
        `INSERT INTO families (nome, slug, sobrenomes, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
        [s(nome, 120), slug, (sobrenomes || []).map((x) => s(x, 60)).slice(0, 20), userId]);
      await t.q(
        `INSERT INTO family_memberships (family_id, user_id, papel) VALUES ($1,$2,'OWNER')`,
        [f.id, userId]);
      await auditar({ familyId: f.id, atorUserId: userId, acao: 'familia.criada',
        alvoTipo: 'family', alvoId: f.id, depois: { nome: f.nome } }, t);
      return f;
    });
  },

  /** As famílias de um usuário. Escopo por user_id, sempre. */
  doUsuario: (userId) => db.todas(
    `SELECT f.id, f.nome, f.slug, f.status, m.papel, m.created_at AS membro_desde
       FROM family_memberships m JOIN families f ON f.id = m.family_id
      WHERE m.user_id = $1 AND m.status = 'ativo' AND f.deleted_at IS NULL
      ORDER BY f.nome`, [userId]),

  /** Nunca por id sozinho: exige que o usuário seja membro. */
  paraUsuario: (familyId, userId) => db.uma(
    `SELECT f.*, m.papel FROM families f
       JOIN family_memberships m ON m.family_id = f.id AND m.user_id = $2 AND m.status = 'ativo'
      WHERE f.id = $1 AND f.deleted_at IS NULL`, [familyId, userId]),

  renomear: (familyId, nome) => db.uma(
    `UPDATE families SET nome = $2, updated_at = now() WHERE id = $1 RETURNING *`, [familyId, s(nome, 120)]),
};

// ------------------------------------------------------------------ membros
const Memberships = {
  listar: (familyId) => db.todas(
    `SELECT m.id, m.papel, m.status, m.created_at, u.id AS user_id, u.nome, u.email, u.mfa_ativo
       FROM family_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.family_id = $1 AND m.status <> 'removido'
      ORDER BY CASE m.papel WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, u.nome`, [familyId]),

  de: (familyId, userId) => db.uma(
    `SELECT * FROM family_memberships WHERE family_id = $1 AND user_id = $2 AND status = 'ativo'`,
    [familyId, userId]),

  /** O trigger do banco é quem impede deixar a família sem OWNER. */
  async alterarPapel({ familyId, alvoUserId, papelNovo, quemUserId, papelDeQuem }) {
    const atual = await Memberships.de(familyId, alvoUserId);
    if (!atual) throw erro('erro.nao_e_membro', 404);
    if (!rbac.podeAlterarPapel(papelDeQuem, atual.papel, papelNovo)) {
      throw erro('erro.nao_promove_acima', 403);
    }
    return db.transacao(async (t) => {
      const m = await t.uma(
        `UPDATE family_memberships SET papel = $3, updated_at = now()
          WHERE family_id = $1 AND user_id = $2 RETURNING *`, [familyId, alvoUserId, papelNovo]);
      await auditar({ familyId, atorUserId: quemUserId, acao: 'membro.papel_alterado',
        alvoTipo: 'user', alvoId: alvoUserId,
        antes: { papel: atual.papel }, depois: { papel: papelNovo } }, t);
      return m;
    });
  },

  /**
   * Remover revoga o ACESSO. NÃO apaga o que a pessoa contribuiu (§15) —
   * isso é regra de produto: a história que ela contou continua sendo
   * dela e continua no acervo.
   */
  async remover({ familyId, alvoUserId, quemUserId, papelDeQuem }) {
    const atual = await Memberships.de(familyId, alvoUserId);
    if (!atual) throw erro('erro.nao_e_membro', 404);
    if (!rbac.podeAlterarPapel(papelDeQuem, atual.papel, 'GUEST')) {
      throw erro('erro.nao_remove_acima', 403);
    }
    return db.transacao(async (t) => {
      await t.q(`UPDATE family_memberships SET status = 'removido', updated_at = now()
                  WHERE family_id = $1 AND user_id = $2`, [familyId, alvoUserId]);
      await auditar({ familyId, atorUserId: quemUserId, acao: 'membro.removido',
        alvoTipo: 'user', alvoId: alvoUserId, antes: { papel: atual.papel } }, t);
      return true;
    });
  },
};

// ------------------------------------------------------------------ convites
const DIAS_CONVITE = 14;

const Invites = {
  /** Reenviar revoga o convite aberto anterior (índice único garante). */
  async criar({ familyId, emailBruto, papel, quemUserId, mensagem = '' }) {
    if (!['ADMIN', 'HISTORIAN', 'EDITOR', 'CONTRIBUTOR', 'FAMILY_MEMBER', 'GUEST'].includes(papel)) {
      throw erro('erro.papel_invalido_convite', 400);
    }
    const token = novoToken();
    return db.transacao(async (t) => {
      await t.q(`UPDATE invites SET revogado_em = now()
                  WHERE family_id = $1 AND lower(email) = $2 AND aceito_em IS NULL AND revogado_em IS NULL`,
      [familyId, email(emailBruto)]);
      const c = await t.uma(
        `INSERT INTO invites (family_id, email, papel, token_hash, mensagem, convidado_por, expira_em)
         VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' days')::interval) RETURNING *`,
        [familyId, email(emailBruto), papel, hashToken(token), s(mensagem, 500), quemUserId, String(DIAS_CONVITE)]);
      await auditar({ familyId, atorUserId: quemUserId, acao: 'convite.enviado',
        alvoTipo: 'invite', alvoId: c.id, depois: { email: c.email, papel } }, t);
      return { convite: c, token };
    });
  },

  /** Só o hash é consultável — o token cru nunca foi guardado. */
  porToken: (token) => db.uma(
    `SELECT i.*, f.nome AS familia_nome FROM invites i JOIN families f ON f.id = i.family_id
      WHERE i.token_hash = $1`, [hashToken(token)]),

  listar: (familyId) => db.todas(
    `SELECT id, email, papel, expira_em, aceito_em, revogado_em, created_at
       FROM invites WHERE family_id = $1 ORDER BY created_at DESC LIMIT 200`, [familyId]),

  revogar: (familyId, id, quemUserId) => db.transacao(async (t) => {
    const c = await t.uma(
      `UPDATE invites SET revogado_em = now()
        WHERE id = $1 AND family_id = $2 AND aceito_em IS NULL AND revogado_em IS NULL RETURNING *`,
      [id, familyId]);
    if (c) {
      await auditar({ familyId, atorUserId: quemUserId, acao: 'convite.revogado',
        alvoTipo: 'invite', alvoId: id }, t);
    }
    return c;
  }),

  /**
   * Aceitar: token de USO ÚNICO, expira, e o e-mail do convite precisa
   * bater com o da conta — senão um link vazado vira acesso para qualquer
   * pessoa que o encontre.
   */
  async aceitar({ token, userId, emailDoUsuario }) {
    const c = await Invites.porToken(token);
    if (!c) throw erro('erro.convite_nao_encontrado', 404);
    if (c.revogado_em) throw erro('erro.convite_cancelado', 410);
    if (c.aceito_em) throw erro('erro.convite_usado', 410);
    if (new Date(c.expira_em) <= new Date()) throw erro('erro.convite_vencido', 410);
    if (email(c.email) !== email(emailDoUsuario)) {
      throw erro('erro.convite_outro_email', 403);
    }
    return db.transacao(async (t) => {
      await t.q(
        `INSERT INTO family_memberships (family_id, user_id, papel, convidado_por)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (family_id, user_id) WHERE status <> 'removido'
         DO UPDATE SET papel = EXCLUDED.papel, status = 'ativo', updated_at = now()`,
        [c.family_id, userId, c.papel, c.convidado_por]);
      await t.q(`UPDATE invites SET aceito_em = now(), aceito_por = $2 WHERE id = $1`, [c.id, userId]);
      await auditar({ familyId: c.family_id, atorUserId: userId, acao: 'convite.aceito',
        alvoTipo: 'invite', alvoId: c.id, depois: { papel: c.papel } }, t);
      return { familyId: c.family_id, papel: c.papel, familia: c.familia_nome };
    });
  },
};

// -------------------------------------------------------------- consentimento
const Consents = {
  registrar: ({ userId, familyId = null, finalidade, concedido, versaoTexto = '', req = null }) => db.q(
    `INSERT INTO consents (user_id, family_id, finalidade, concedido, versao_texto, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, familyId, finalidade, !!concedido, s(versaoTexto, 40),
      req ? s(req.ip, 60) : null, req ? s(req.get && req.get('user-agent'), 300) : null]),

  /** Vale a linha mais recente da finalidade — revogar é NOVA linha. */
  vigente: async (userId, finalidade) => {
    const r = await db.uma(
      `SELECT concedido FROM consents WHERE user_id = $1 AND finalidade = $2
        ORDER BY created_at DESC LIMIT 1`, [userId, finalidade]);
    return !!(r && r.concedido);
  },
};

// ------------------------------------------------------------------ auditoria
const Auditoria = {
  /** Lê DENTRO do escopo da família — o RLS é quem garante o isolamento. */
  daFamilia: (familyId, limite = 200) => tenancy.comEscopo(familyId, (t) => t.todas(
    `SELECT a.id, a.acao, a.alvo_tipo, a.alvo_id, a.antes, a.depois, a.motivo,
            a.ator_kind, a.created_at, u.nome AS ator_nome
       FROM audit_log a LEFT JOIN users u ON u.id = a.ator_user_id
      WHERE a.family_id = $1 ORDER BY a.created_at DESC LIMIT $2`, [familyId, Math.min(limite, 500)])),
};

module.exports = {
  s, email, novoToken, hashToken, slugificar,
  auditar, Users, Families, Memberships, Invites, Consents, Auditoria,
};
