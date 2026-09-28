// =====================================================================
// Musique Cifras — BANDAS e EQUIPES: papéis, convites (e-mail, link e
// QR Code), biblioteca compartilhada, tarefas, comentários e atividade.
//
// A banda da Fase 2 (`bandas` + `banda_membros`) é a MESMA: aqui ela
// ganha papéis de verdade (ver acesso.js) e o que uma equipe precisa
// para trabalhar junto. Não há segunda tabela de banda.
//
// CONVITE POR LINK: o token só existe na URL que o dono copia; no banco
// fica o HASH. Vazamento do banco não entrega convite válido.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, transacao, nowISO, novoId, novoToken, j } = require('../db');
const direitos = require('../direitos');
const acesso = require('./acesso');
const { Musicas, atividade, notificar, erro, resumo } = require('./acervo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const EMAIL = /^[^\s@]+@[^\s@]+$/;

const Bandas = {
  criar(usuario, { nome, descricao = '' }) {
    if (!s(nome)) throw erro('A banda precisa de um nome.');
    const id = novoId();
    transacao(() => {
      db.prepare('INSERT INTO bandas (id, dono, nome, descricao, criado_em) VALUES (?,?,?,?,?)').run(id, usuario, s(nome, 120), s(descricao, 500), nowISO());
      db.prepare("INSERT INTO banda_membros (banda_id, usuario, papel, entrou_em) VALUES (?,?,'proprietario',?)").run(id, usuario, nowISO());
    });
    atividade(id, usuario, 'banda.criada', id);
    direitos.registrar({ ator: usuario, acao: 'banda.criada', alvo: id, detalhe: { nome } });
    return Bandas.detalhe(usuario, id);
  },

  detalhe(usuario, bandaId, { nomeDe } = {}) {
    acesso.exigir(bandaId, usuario, 'ver', 'Você não faz parte desta banda.');
    const b = db.prepare('SELECT * FROM bandas WHERE id = ?').get(bandaId);
    const meu = acesso.papel(bandaId, usuario);
    const membros = acesso.membros(bandaId).map((m) => ({ usuario: m.usuario, papel: m.papel, rotulo: acesso.ROTULO[m.papel],
      instrumento: m.instrumento, entrou_em: m.entrou_em, nome: nomeDe ? nomeDe(m.usuario) : '' }));
    return {
      banda: { id: b.id, nome: b.nome, descricao: b.descricao, criado_em: b.criado_em },
      meu_papel: meu, poderes: Object.keys(acesso.PODERES).filter((p) => acesso.PODERES[p].includes(meu)),
      membros,
      convites: acesso.pode(bandaId, usuario, 'gerir_membros')
        ? db.prepare("SELECT id, email, papel, expira_em, usos, usos_max, criado_em FROM banda_convites WHERE banda_id = ? AND revogado_em = '' ORDER BY criado_em DESC")
          .all(bandaId).filter((c) => c.expira_em > nowISO() && c.usos < c.usos_max) : [],
      papeis: acesso.PAPEIS.map((p) => ({ id: p, rotulo: acesso.ROTULO[p] })),
    };
  },

  editar(usuario, bandaId, d = {}) {
    acesso.exigir(bandaId, usuario, 'gerir_membros');
    const b = db.prepare('SELECT * FROM bandas WHERE id = ?').get(bandaId);
    db.prepare('UPDATE bandas SET nome = ?, descricao = ? WHERE id = ?').run(d.nome !== undefined ? s(d.nome, 120) || b.nome : b.nome,
      d.descricao !== undefined ? s(d.descricao, 500) : b.descricao, bandaId);
    atividade(bandaId, usuario, 'banda.editada', bandaId);
    return true;
  },

  // ---------------- convites ----------------
  /**
   * Convite. Com e-mail de conta existente, a pessoa entra NA HORA (é o
   * comportamento da Fase 2, preservado). Sem e-mail — ou com e-mail de
   * quem ainda não tem conta — nasce um convite por LINK/QR, de uso
   * limitado e com validade.
   */
  convidar(usuario, bandaId, { emails = [], papel = 'musico', link = false, dias = 7, usos = 1 } = {}, buscarPorEmail) {
    acesso.exigir(bandaId, usuario, 'gerir_membros', 'Só a administração da banda convida.');
    const p = acesso.normalizarPapel(papel) || 'musico';
    if (p === 'proprietario') throw erro('Propriedade se transfere, não se convida.');
    const entraram = [], pendentes = [];
    (Array.isArray(emails) ? emails : String(emails).split(/[\s,;]+/)).map((e) => s(e, 200).toLowerCase()).filter(Boolean).forEach((e) => {
      if (!EMAIL.test(e)) { pendentes.push({ email: e, erro: 'e-mail inválido' }); return; }
      const conta = typeof buscarPorEmail === 'function' ? buscarPorEmail(e) : null;
      if (conta && conta.id) {
        db.prepare(`INSERT INTO banda_membros (banda_id, usuario, papel, entrou_em) VALUES (?,?,?,?) ON CONFLICT(banda_id, usuario) DO NOTHING`)
          .run(bandaId, conta.id, p, nowISO());
        notificar(conta.id, 'banda.convite', 'Você entrou numa banda na Musique', '/music/app#banda=' + bandaId);
        entraram.push(e);
      } else {
        pendentes.push({ email: e, ...Bandas._criarConvite(usuario, bandaId, { email: e, papel: p, dias, usos: 1 }) });
      }
    });
    let conviteLink = null;
    if (link) conviteLink = Bandas._criarConvite(usuario, bandaId, { papel: p, dias, usos: Math.max(1, Math.min(50, Number(usos) || 1)) });
    atividade(bandaId, usuario, 'banda.convidou', bandaId, { entraram: entraram.length, pendentes: pendentes.length, link: !!link });
    direitos.registrar({ ator: usuario, acao: 'banda.convite', alvo: bandaId, detalhe: { papel: p, entraram: entraram.length, link: !!link } });
    return { entraram, pendentes, link: conviteLink };
  },

  _criarConvite(usuario, bandaId, { email = '', papel, dias = 7, usos = 1 }) {
    const token = novoToken();
    const expira = new Date(Date.now() + Math.max(1, Math.min(60, Number(dias) || 7)) * 864e5).toISOString();
    const id = novoId();
    db.prepare(`INSERT INTO banda_convites (id, banda_id, email, token_hash, papel, criado_por, expira_em, usos_max, usos, criado_em)
      VALUES (?,?,?,?,?,?,?,?,0,?)`).run(id, bandaId, email, hash(token), papel, usuario, expira, usos, nowISO());
    return { id, token, url: '/music/app#convite=' + token, expira_em: expira, papel };
  },

  /** O que o convite mostra ANTES de aceitar (nome da banda e papel). */
  verConvite(token) {
    const c = db.prepare('SELECT * FROM banda_convites WHERE token_hash = ?').get(hash(token));
    if (!c || c.revogado_em || c.expira_em < nowISO() || c.usos >= c.usos_max) throw erro('Convite inválido ou expirado.', 404);
    const b = db.prepare('SELECT nome FROM bandas WHERE id = ?').get(c.banda_id);
    return { banda: b ? b.nome : '', papel: c.papel, rotulo: acesso.ROTULO[c.papel], expira_em: c.expira_em };
  },

  aceitar(usuario, token, { email = '' } = {}) {
    const c = db.prepare('SELECT * FROM banda_convites WHERE token_hash = ?').get(hash(token));
    if (!c || c.revogado_em || c.expira_em < nowISO() || c.usos >= c.usos_max) throw erro('Convite inválido ou expirado.', 404);
    // Convite nominal só vale para a conta daquele e-mail.
    if (c.email && String(email).toLowerCase() !== c.email) throw erro('Este convite foi feito para outro e-mail.', 403);
    transacao(() => {
      db.prepare('INSERT INTO banda_membros (banda_id, usuario, papel, entrou_em) VALUES (?,?,?,?) ON CONFLICT(banda_id, usuario) DO NOTHING')
        .run(c.banda_id, usuario, c.papel, nowISO());
      db.prepare('UPDATE banda_convites SET usos = usos + 1 WHERE id = ?').run(c.id);
    });
    atividade(c.banda_id, usuario, 'banda.entrou', usuario, { papel: c.papel });
    return { banda_id: c.banda_id };
  },

  revogarConvite(usuario, bandaId, conviteId) {
    acesso.exigir(bandaId, usuario, 'gerir_membros');
    db.prepare('UPDATE banda_convites SET revogado_em = ? WHERE id = ? AND banda_id = ?').run(nowISO(), conviteId, bandaId);
    direitos.registrar({ ator: usuario, acao: 'banda.convite_revogado', alvo: conviteId });
    return true;
  },

  // ---------------- membros ----------------
  mudarPapel(usuario, bandaId, alvo, papel) {
    acesso.exigir(bandaId, usuario, 'gerir_membros');
    const p = acesso.normalizarPapel(papel);
    if (!p || p === 'proprietario') throw erro('Papel inválido. Para passar a banda, use "transferir propriedade".');
    const atual = acesso.papel(bandaId, alvo);
    if (!atual) throw erro('Esta pessoa não está na banda.', 404);
    if (atual === 'proprietario') throw erro('O proprietário não muda de papel: transfira a propriedade antes.');
    // admin não promove a admin nem rebaixa admin: só o proprietário.
    const meu = acesso.papel(bandaId, usuario);
    if ((p === 'admin' || atual === 'admin') && meu !== 'proprietario') throw erro('Só o proprietário mexe no papel de administrador.', 403);
    db.prepare('UPDATE banda_membros SET papel = ? WHERE banda_id = ? AND usuario = ?').run(p, bandaId, alvo);
    atividade(bandaId, usuario, 'banda.papel', alvo, { de: atual, para: p });
    direitos.registrar({ ator: usuario, acao: 'banda.papel', alvo: bandaId, detalhe: { membro: alvo, de: atual, para: p } });
    return true;
  },

  definirInstrumento(usuario, bandaId, instrumento) {
    acesso.exigir(bandaId, usuario, 'ver');
    db.prepare('UPDATE banda_membros SET instrumento = ? WHERE banda_id = ? AND usuario = ?').run(s(instrumento, 40), bandaId, usuario);
    return true;
  },

  remover(usuario, bandaId, alvo) {
    const eu = alvo === usuario;
    if (!eu) acesso.exigir(bandaId, usuario, 'gerir_membros');
    const p = acesso.papel(bandaId, alvo);
    if (!p) throw erro('Esta pessoa não está na banda.', 404);
    if (p === 'proprietario') throw erro('O proprietário não sai da banda: transfira a propriedade antes.');
    if (!eu && p === 'admin' && acesso.papel(bandaId, usuario) !== 'proprietario') throw erro('Só o proprietário remove um administrador.', 403);
    db.prepare('DELETE FROM banda_membros WHERE banda_id = ? AND usuario = ?').run(bandaId, alvo);
    atividade(bandaId, usuario, eu ? 'banda.saiu' : 'banda.removeu', alvo);
    direitos.registrar({ ator: usuario, acao: eu ? 'banda.saiu' : 'banda.membro_removido', alvo: bandaId, detalhe: { membro: alvo } });
    return true;
  },

  /** Passa a banda a outro membro. O antigo proprietário vira admin. */
  transferir(usuario, bandaId, para) {
    acesso.exigir(bandaId, usuario, 'transferir', 'Só o proprietário transfere a banda.');
    if (!acesso.papel(bandaId, para)) throw erro('A pessoa precisa estar na banda.', 404);
    transacao(() => {
      db.prepare("UPDATE banda_membros SET papel = 'admin' WHERE banda_id = ? AND usuario = ?").run(bandaId, usuario);
      db.prepare("UPDATE banda_membros SET papel = 'proprietario' WHERE banda_id = ? AND usuario = ?").run(bandaId, para);
      db.prepare('UPDATE bandas SET dono = ? WHERE id = ?').run(para, bandaId);
    });
    atividade(bandaId, usuario, 'banda.transferida', para);
    direitos.registrar({ ator: usuario, acao: 'banda.transferida', alvo: bandaId, detalhe: { para } });
    return true;
  },

  excluir(usuario, bandaId) {
    acesso.exigir(bandaId, usuario, 'excluir_banda', 'Só o proprietário exclui a banda.');
    transacao(() => {
      db.prepare('DELETE FROM banda_obras WHERE banda_id = ?').run(bandaId);
      db.prepare('UPDATE banda_convites SET revogado_em = ? WHERE banda_id = ?').run(nowISO(), bandaId);
      db.prepare("UPDATE cifra_arranjos SET removido_em = ? WHERE banda_id = ? AND removido_em = ''").run(nowISO(), bandaId);
      db.prepare('DELETE FROM banda_membros WHERE banda_id = ?').run(bandaId);
      db.prepare('DELETE FROM bandas WHERE id = ?').run(bandaId);
    });
    direitos.registrar({ ator: usuario, acao: 'banda.excluida', alvo: bandaId });
    return true;
  },

  // ---------------- biblioteca compartilhada ----------------
  compartilhar(usuario, bandaId, obraId) {
    acesso.exigir(bandaId, usuario, 'compartilhar_obra');
    const o = Musicas.porId(obraId);
    const v = direitos.podeCompartilharComBanda(o, bandaId, usuario);
    if (!v.pode) throw erro(v.motivo, 403, { bloqueioDeDireitos: true });
    db.prepare('INSERT OR IGNORE INTO banda_obras (banda_id, obra_id, compartilhada_por, compartilhada_em) VALUES (?,?,?,?)')
      .run(bandaId, obraId, usuario, nowISO());
    atividade(bandaId, usuario, 'musica.compartilhada', obraId, { titulo: o.titulo });
    direitos.registrar({ ator: usuario, acao: 'obra.banda', alvo: obraId, detalhe: { banda: bandaId, titularidade: o.titularidade } });
    acesso.membros(bandaId).filter((m) => m.usuario !== usuario)
      .forEach((m) => notificar(m.usuario, 'banda.musica', `Nova música na banda: ${o.titulo}`, '/music/app#musica=' + obraId));
    return true;
  },

  /** Tirar da banda: o dono da música ou a administração. */
  descompartilhar(usuario, bandaId, obraId) {
    const o = Musicas.porId(obraId);
    if (!o) throw erro('Música não encontrada.', 404);
    if (o.dono !== usuario) acesso.exigir(bandaId, usuario, 'gerir_membros');
    db.prepare('DELETE FROM banda_obras WHERE banda_id = ? AND obra_id = ?').run(bandaId, obraId);
    atividade(bandaId, usuario, 'musica.retirada', obraId, { titulo: o.titulo });
    direitos.registrar({ ator: usuario, acao: 'obra.banda_retirada', alvo: obraId, detalhe: { banda: bandaId } });
    return true;
  },

  atividade(usuario, bandaId, limite = 50) {
    acesso.exigir(bandaId, usuario, 'ver');
    return db.prepare('SELECT * FROM banda_atividade WHERE banda_id = ? ORDER BY criado_em DESC LIMIT ?').all(bandaId, Math.min(200, Number(limite) || 50))
      .map((a) => ({ ...a, detalhe: j.parse(a.detalhe, {}) }));
  },
};

// ---------------------------------------------------------------------
// TAREFAS de revisão ("revisar tom", "confirmar arranjo")
// ---------------------------------------------------------------------
const Tarefas = {
  criar(usuario, bandaId, { alvo_tipo, alvo_id, titulo, responsavel = '', prazo = '' }) {
    acesso.exigir(bandaId, usuario, 'criar_tarefa');
    if (!s(titulo)) throw erro('A tarefa precisa de um título.');
    if (responsavel && !acesso.papel(bandaId, responsavel)) throw erro('O responsável precisa estar na banda.');
    const id = novoId();
    db.prepare(`INSERT INTO tarefas_revisao (id, banda_id, alvo_tipo, alvo_id, titulo, responsavel, status, prazo, criado_por, criado_em)
      VALUES (?,?,?,?,?,?,'aberta',?,?,?)`).run(id, bandaId, s(alvo_tipo, 20), s(alvo_id, 40), s(titulo, 200), responsavel,
      /^\d{4}-\d{2}-\d{2}/.test(prazo) ? prazo.slice(0, 10) : '', usuario, nowISO());
    if (responsavel) notificar(responsavel, 'tarefa', 'Tarefa para você: ' + s(titulo, 120), '/music/app#banda=' + bandaId);
    atividade(bandaId, usuario, 'tarefa.criada', id, { titulo });
    return db.prepare('SELECT * FROM tarefas_revisao WHERE id = ?').get(id);
  },
  listar(usuario, bandaId) {
    acesso.exigir(bandaId, usuario, 'ver');
    return db.prepare("SELECT * FROM tarefas_revisao WHERE banda_id = ? ORDER BY status = 'aberta' DESC, prazo, criado_em DESC").all(bandaId);
  },
  concluir(usuario, tarefaId, status = 'feita') {
    const t = db.prepare('SELECT * FROM tarefas_revisao WHERE id = ?').get(tarefaId);
    if (!t) throw erro('Tarefa não encontrada.', 404);
    if (t.responsavel !== usuario) acesso.exigir(t.banda_id, usuario, 'criar_tarefa');
    const st = ['feita', 'cancelada', 'aberta'].includes(status) ? status : 'feita';
    db.prepare('UPDATE tarefas_revisao SET status = ?, concluido_em = ? WHERE id = ?').run(st, st === 'aberta' ? '' : nowISO(), tarefaId);
    atividade(t.banda_id, usuario, 'tarefa.' + st, tarefaId);
    return true;
  },
};

// ---------------------------------------------------------------------
// COMENTÁRIOS (por música, seção ou acorde) e MENÇÕES
// ---------------------------------------------------------------------
const Comentarios = {
  /** `banda_id` vazio = nota PRIVADA do autor; com banda = da banda. */
  criar(usuario, { alvo_tipo, alvo_id, ancora = {}, texto, banda_id = '', pai_id = '' }, { nomeDe } = {}) {
    if (!['cifra', 'arranjo', 'setlist'].includes(alvo_tipo)) throw erro('Alvo de comentário inválido.');
    if (!s(texto)) throw erro('O comentário está vazio.');
    if (banda_id) acesso.exigir(banda_id, usuario, 'comentar', 'Seu papel na banda não permite comentar.');
    Comentarios._exigirAlvo(usuario, alvo_tipo, alvo_id, banda_id);
    const anc = { secao_id: s(ancora.secao_id, 20), linha_id: s(ancora.linha_id, 30), acorde: s(ancora.acorde, 40) };
    const id = novoId();
    db.prepare(`INSERT INTO comentarios (id, alvo_tipo, alvo_id, ancora, pai_id, texto, autor, banda_id, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id, alvo_tipo, alvo_id, JSON.stringify(anc), s(pai_id, 40), s(texto, 4000), usuario, banda_id, nowISO());
    // Menção: @nome de quem é da MESMA banda. Fora dela, a menção é texto.
    if (banda_id && nomeDe) {
      const membros = acesso.membros(banda_id);
      const alvos = membros.filter((m) => m.usuario !== usuario && (String(texto).toLowerCase().includes('@' + String(nomeDe(m.usuario) || '').toLowerCase().split(' ')[0])));
      alvos.forEach((m) => notificar(m.usuario, 'mencao', 'Você foi mencionado num comentário', '/music/app#' + alvo_tipo + '=' + alvo_id));
    }
    if (banda_id) atividade(banda_id, usuario, 'comentario', alvo_id);
    return db.prepare('SELECT * FROM comentarios WHERE id = ?').get(id);
  },
  _exigirAlvo(usuario, tipo, id, bandaId) {
    const { Cifras, Arranjos } = require('./acervo');
    if (tipo === 'cifra') {
      const c = Cifras.porId(id);
      if (!acesso.podeVerCifra(c, usuario).pode) throw erro('Sem acesso a esta cifra.', 403);
      if (bandaId && !db.prepare('SELECT 1 FROM banda_obras WHERE banda_id = ? AND obra_id = ?').get(bandaId, c.obra_id)) throw erro('Esta música não está na banda.');
    } else if (tipo === 'arranjo') {
      const a = Arranjos.porId(id);
      if (!acesso.podeVerArranjo(a, usuario)) throw erro('Sem acesso a este arranjo.', 403);
      if (bandaId && a.banda_id !== bandaId) throw erro('O arranjo é de outra banda.');
    } else {
      const rep = db.prepare('SELECT * FROM repertorios WHERE id = ?').get(id);
      if (!rep) throw erro('Setlist não encontrado.', 404);
      const ok = rep.dono === usuario || (rep.banda_id && acesso.papel(rep.banda_id, usuario));
      if (!ok) throw erro('Sem acesso a este setlist.', 403);
    }
  },
  listar(usuario, alvo_tipo, alvo_id) {
    Comentarios._exigirAlvo(usuario, alvo_tipo, alvo_id, '');
    const minhasBandas = new Set(acesso.bandasDe(usuario).map((b) => b.id));
    return db.prepare("SELECT * FROM comentarios WHERE alvo_tipo = ? AND alvo_id = ? AND removido_em = '' ORDER BY criado_em")
      .all(alvo_tipo, alvo_id)
      .filter((c) => (c.banda_id ? minhasBandas.has(c.banda_id) : c.autor === usuario))
      .map((c) => ({ ...c, ancora: j.parse(c.ancora, {}), meu: c.autor === usuario }));
  },
  resolver(usuario, id) {
    const c = db.prepare('SELECT * FROM comentarios WHERE id = ?').get(id);
    if (!c) throw erro('Comentário não encontrado.', 404);
    if (c.autor !== usuario && !(c.banda_id && acesso.pode(c.banda_id, usuario, 'editar_cifra'))) throw erro('Sem permissão.', 403);
    db.prepare('UPDATE comentarios SET resolvido_em = ? WHERE id = ?').run(c.resolvido_em ? '' : nowISO(), id);
    return true;
  },
  remover(usuario, id) {
    const c = db.prepare('SELECT * FROM comentarios WHERE id = ?').get(id);
    if (!c) throw erro('Comentário não encontrado.', 404);
    if (c.autor !== usuario && !(c.banda_id && acesso.pode(c.banda_id, usuario, 'gerir_membros'))) throw erro('Sem permissão.', 403);
    db.prepare('UPDATE comentarios SET removido_em = ? WHERE id = ?').run(nowISO(), id);
    return true;
  },
};

const Notificacoes = {
  listar: (usuario, { naoLidas = false } = {}) => db.prepare(
    `SELECT * FROM notificacoes_musica WHERE usuario = ? ${naoLidas ? "AND lida_em = ''" : ''} ORDER BY criado_em DESC LIMIT 100`).all(usuario),
  marcarLidas: (usuario) => db.prepare("UPDATE notificacoes_musica SET lida_em = ? WHERE usuario = ? AND lida_em = ''").run(nowISO(), usuario).changes,
};

/** Biblioteca da banda: as músicas compartilhadas, com quem compartilhou. */
function biblioteca(usuario, bandaId) {
  acesso.exigir(bandaId, usuario, 'ver');
  return db.prepare(`SELECT o.*, bo.compartilhada_por, bo.compartilhada_em FROM banda_obras bo JOIN obras o ON o.id = bo.obra_id
    WHERE bo.banda_id = ? AND o.removido_em = '' ORDER BY o.titulo COLLATE NOCASE`).all(bandaId)
    .map((o) => ({ ...resumo(o), compartilhada_por: o.compartilhada_por, compartilhada_em: o.compartilhada_em }));
}

module.exports = { Bandas, Tarefas, Comentarios, Notificacoes, biblioteca, hash };
