// =====================================================================
// Academia ← Musique: a PONTE da assinatura (28/09/2026).
//
// Quem assina o Musique ganha cortesia dos cursos de MÚSICA da Academia,
// pelo mesmo e-mail, enquanto a assinatura estiver ativa. Os dois sistemas
// são independentes (ADR-0011 da Musique): o Musique só diz "matricule /
// desmatricule este e-mail"; quem sabe o que é matrícula é a Academia —
// por isso a ponte mora AQUI, com teste no `test:academy`.
//
// A marca `criado_por = 'musique:assinatura'` é o que permite revogar SÓ o
// que o Musique deu. Curso comprado, cortesia dada pelo staff e assinatura
// da própria Academia nunca são tocados.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const ct = require('./repo-conteudo');
const repo = require('./repo');
const { db } = require('./db');

const MARCA = 'musique:assinatura';
const CATEGORIA = 'musica';
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function criar({ jwtSecret, enviarEmail, baseUrl = 'https://academia.villelastay.com.br' } = {}) {
  const cursosDeMusica = () => ct.Marketplace.listar({ categoria: CATEGORIA, n: 200 }).map((p) => p.id);

  return {
    /** Matricula (cortesia) em todos os cursos de música publicados. Idempotente. */
    conceder({ email, nome, novaConta } = {}) {
      const ids = cursosDeMusica();
      const { usuario, novo } = ct.Cortesia.acharOuCriarUsuario({ nome, email });
      let novos = 0;
      for (const pid of ids) {
        const antes = db.prepare('SELECT status FROM enrollments WHERE user_id = ? AND product_id = ?').get(usuario.id, pid);
        ct.Cortesia.garantirMatricula(usuario, pid, MARCA);
        if (!antes || antes.status !== 'ativa') novos++;   // nova OU reativada (voltou a assinar)
      }
      // Conta criada agora: a pessoa define a senha pelo link (30 dias).
      if (novo && novaConta !== false && typeof enviarEmail === 'function' && jwtSecret) {
        const tok = jwt.sign({ tipo: 'academy-reset', uid: usuario.id }, jwtSecret, { expiresIn: '30d' });
        const link = `${baseUrl}/academy/redefinir-senha?token=${tok}`;
        Promise.resolve().then(() => enviarEmail(usuario.email, 'Seus cursos de música chegaram — Academia Villela',
          `<p>Olá, ${esc(usuario.nome)}!</p><p>A sua assinatura do Musique inclui os cursos de música da Academia Villela.
           Criamos a sua conta na Academia com este e-mail. Defina a sua senha (o link vale 30 dias):</p>
           <p><a href="${link}">Criar minha senha na Academia</a></p>
           <p style="color:#5B6478">A conta da Academia é separada da conta do Musique.</p>`)).catch(() => {});
      }
      repo.Auditoria.registrar({ quem: MARCA, acao: 'cortesia.musique.conceder', entidade: 'users', entidade_id: usuario.id, detalhe: `${usuario.email} — ${ids.length} curso(s)` });
      return { academia_user_id: usuario.id, cursos: ids.length, novos, conta_nova: novo };
    },

    /** Revoga SÓ as matrículas que o Musique deu. */
    revogar({ email } = {}) {
      const u = repo.Usuarios.porEmail(email);
      if (!u) return { revogadas: 0 };
      const r = db.prepare(`UPDATE enrollments SET status = 'revogada'
        WHERE user_id = ? AND origem = 'cortesia' AND criado_por = ? AND status = 'ativa'`).run(u.id, MARCA);
      repo.Auditoria.registrar({ quem: MARCA, acao: 'cortesia.musique.revogar', entidade: 'users', entidade_id: u.id, detalhe: `${r.changes} matrícula(s)` });
      return { revogadas: r.changes };
    },
  };
}

module.exports = { criar, MARCA, CATEGORIA };
