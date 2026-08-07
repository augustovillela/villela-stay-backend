// =====================================================================
// Villela Kids — núcleo de domínio (responsáveis, perfis de criança,
// missões, progresso e portfólio). Rotas nunca mexem no banco "na mão":
// passam por aqui, que valida, aplica as regras de LGPD infantil e audita.
// Regra central de segurança: TODO acesso a criança/portfólio filtra pelo
// user_id da sessão do responsável — esconder botão não é segurança.
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const { db, transacao, nowISO, novoId, novoToken, j } = require('./db');
const { MISSOES } = require('./missoes-catalogo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const n = (v, padrao = 0) => { const x = Number(v); return Number.isFinite(x) ? x : padrao; };
const inteiro = (v, padrao = 0) => Math.trunc(n(v, padrao));

const FAIXAS = ['7-8', '9-11'];
const MAX_PERFIS = 6; // teto por família (beta): acima disso é uso fora do combinado

// ---------------------------------------------------------------------
// Configuração da plataforma
// ---------------------------------------------------------------------
const CONFIG_PADRAO = {
  max_perfis_por_conta: { valor: String(MAX_PERFIS), descricao: 'Perfis de criança por conta de responsável.' },
  beta_fechado: { valor: 'on', descricao: 'on = fase 1 (beta em família); a landing avisa que a entrada é por convite.' },
};

const Config = {
  todos() { return db.prepare('SELECT chave, valor, descricao FROM config ORDER BY chave').all(); },
  get(chave, padrao = '') {
    const r = db.prepare('SELECT valor FROM config WHERE chave = ?').get(String(chave));
    return r ? r.valor : padrao;
  },
  // Number('') é 0 e é finito — sem o guarda, chave ausente devolveria 0 (lição do Closet).
  num(chave, padrao = 0) { const v = Config.get(chave, ''); return v === '' ? padrao : n(v, padrao); },
  set(chave, valor) {
    db.prepare(`INSERT INTO config (chave, valor, descricao, atualizado_em) VALUES (?,?,'',?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`)
      .run(String(chave), String(valor == null ? '' : valor), nowISO());
    return { chave, valor };
  },
};

// ---------------------------------------------------------------------
// Auditoria e eventos
// ---------------------------------------------------------------------
const Auditoria = {
  registrar({ quem, acao, entidade, entidade_id, detalhe, ip } = {}) {
    db.prepare('INSERT INTO auditoria (id, quem, acao, entidade, entidade_id, detalhe, ip, quando) VALUES (?,?,?,?,?,?,?,?)')
      .run(novoId(), s(quem, 120), s(acao, 60), s(entidade, 40), s(entidade_id, 60), s(detalhe, 400), s(ip, 60), nowISO());
  },
  listar({ limite = 200 } = {}) { return db.prepare('SELECT * FROM auditoria ORDER BY quando DESC LIMIT ?').all(Math.min(inteiro(limite, 200), 1000)); },
};

function evento(userId, tipo, ref, dados) {
  db.prepare('INSERT INTO platform_events (id, user_id, tipo, ref, dados, quando) VALUES (?,?,?,?,?,?)')
    .run(novoId(), s(userId, 40), s(tipo, 60), s(ref, 80), j.str(dados || {}), nowISO());
}

const Notificacoes = {
  criar(userId, { titulo, texto, url, tipo } = {}) {
    const id = novoId();
    db.prepare('INSERT INTO notifications (id, user_id, titulo, texto, url, tipo, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(id, s(userId, 40), s(titulo, 140), s(texto, 600), s(url, 300), s(tipo, 30) || 'info', nowISO());
    return id;
  },
  listar(userId, { naoLidas = false } = {}) {
    const q = naoLidas
      ? "SELECT * FROM notifications WHERE user_id = ? AND lida_em = '' ORDER BY criado_em DESC LIMIT 60"
      : 'SELECT * FROM notifications WHERE user_id = ? ORDER BY criado_em DESC LIMIT 60';
    return db.prepare(q).all(s(userId, 40));
  },
  marcarLidas(userId) { db.prepare("UPDATE notifications SET lida_em = ? WHERE user_id = ? AND lida_em = ''").run(nowISO(), s(userId, 40)); },
};

// ---------------------------------------------------------------------
// Responsáveis (titular da conta e do consentimento — LGPD art. 14)
// ---------------------------------------------------------------------
const Users = {
  criar(d, { ip = '', origem = '' } = {}) {
    const email = s(d.email, 120).toLowerCase();
    const nome = s(d.nome, 120);
    if (!nome) throw new Error('Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
    if (String(d.senha || '').length < 8) throw new Error('A senha precisa de 8+ caracteres.');
    if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) throw new Error('Já existe uma conta com este e-mail.');
    if (!d.aceite_termos) throw new Error('É preciso aceitar os termos de uso e a política de privacidade.');
    // Consentimento parental específico e destacado (LGPD art. 14, §1º):
    // sem ele a conta nem nasce — não é um checkbox opcional de marketing.
    if (!d.consentimento_parental) throw new Error('É preciso o consentimento do responsável para o uso pelas crianças.');
    const id = novoId();
    const agora = nowISO();
    db.prepare(`INSERT INTO users (id, nome, email, senha_hash, verif_token, aceite_termos_em, consentimento, origem, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, nome, email, bcrypt.hashSync(String(d.senha), 10), novoToken(), agora,
        j.str({ termos: true, parental: true, ip }), s(origem, 120), agora, agora);
    evento(id, 'conta.criar', email, { origem });
    return Users.obter(id);
  },
  obter(id) { return db.prepare('SELECT * FROM users WHERE id = ?').get(s(id, 40)) || null; },
  porEmail(email) { return db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(s(email, 120).toLowerCase()) || null; },
  autenticar(email, senha) {
    const u = Users.porEmail(email);
    if (!u || u.status !== 'ativo') return null;
    return bcrypt.compareSync(String(senha || ''), u.senha_hash) ? u : null;
  },
  definirSenha(id, senha) {
    if (String(senha || '').length < 8) throw new Error('A senha precisa de 8+ caracteres.');
    db.prepare('UPDATE users SET senha_hash = ?, atualizado_em = ? WHERE id = ?').run(bcrypt.hashSync(String(senha), 10), nowISO(), s(id, 40));
  },
  atualizar(id, d) {
    const u = Users.obter(id);
    if (!u) throw new Error('Conta não encontrada.');
    db.prepare('UPDATE users SET nome = ?, atualizado_em = ? WHERE id = ?').run(s(d.nome, 120) || u.nome, nowISO(), u.id);
    return Users.obter(id);
  },
  verificarEmail(token) {
    const u = db.prepare("SELECT * FROM users WHERE verif_token = ? AND verif_token != ''").get(s(token, 80));
    if (!u) return null;
    db.prepare("UPDATE users SET email_verificado = 1, verif_token = '', atualizado_em = ? WHERE id = ?").run(nowISO(), u.id);
    evento(u.id, 'conta.email_verificado', u.email);
    return Users.obter(u.id);
  },
  bloquear(id, motivo, quem) {
    db.prepare("UPDATE users SET status = 'bloqueado', atualizado_em = ? WHERE id = ?").run(nowISO(), s(id, 40));
    Auditoria.registrar({ quem, acao: 'usuario.bloquear', entidade: 'users', entidade_id: id, detalhe: s(motivo, 300) });
  },
  reativar(id, quem) {
    db.prepare("UPDATE users SET status = 'ativo', atualizado_em = ? WHERE id = ?").run(nowISO(), s(id, 40));
    Auditoria.registrar({ quem, acao: 'usuario.reativar', entidade: 'users', entidade_id: id });
  },
  listar({ busca = '', limite = 100 } = {}) {
    const like = '%' + s(busca, 80) + '%';
    return db.prepare(`SELECT u.id, u.nome, u.email, u.status, u.email_verificado, u.criado_em,
        (SELECT COUNT(*) FROM children c WHERE c.user_id = u.id AND c.status = 'ativo') AS criancas
      FROM users u WHERE u.nome LIKE ? OR u.email LIKE ? ORDER BY u.criado_em DESC LIMIT ?`)
      .all(like, like, Math.min(inteiro(limite, 100), 500));
  },
  // LGPD: portabilidade — os dados da família inteira, de uma vez.
  exportar(id) {
    const u = Users.obter(id);
    if (!u) return null;
    const { senha_hash, verif_token, ...conta } = u;
    const criancas = db.prepare('SELECT * FROM children WHERE user_id = ?').all(id);
    return {
      conta,
      criancas: criancas.map((c) => ({
        ...c,
        progresso: db.prepare('SELECT * FROM child_missions WHERE child_id = ?').all(c.id),
        portfolio: db.prepare('SELECT * FROM portfolio WHERE child_id = ?').all(c.id),
      })),
    };
  },
  // LGPD: exclusão — dado de criança se APAGA de verdade (portfólio e
  // progresso), não se anonimiza: não há obrigação financeira que o retenha.
  anonimizar(id) {
    const u = Users.obter(id);
    if (!u) throw new Error('Conta não encontrada.');
    transacao(() => {
      for (const c of db.prepare('SELECT id FROM children WHERE user_id = ?').all(id)) {
        db.prepare('DELETE FROM portfolio WHERE child_id = ?').run(c.id);
        db.prepare('DELETE FROM child_missions WHERE child_id = ?').run(c.id);
      }
      db.prepare('DELETE FROM children WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM notifications WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM push_subs WHERE user_id = ?').run(id);
      db.prepare(`UPDATE users SET nome = 'Conta excluída', email = ?, senha_hash = 'x', status = 'excluido',
        verif_token = '', atualizado_em = ? WHERE id = ?`).run('excluido+' + id + '@kids.local', nowISO(), id);
    });
    Auditoria.registrar({ quem: 'titular', acao: 'lgpd.excluir', entidade: 'users', entidade_id: id });
    return { ok: true, mensagem: 'Conta excluída. As criações e o progresso das crianças foram apagados em definitivo.' };
  },
};

// ---------------------------------------------------------------------
// Perfis de criança (dado mínimo: apelido + faixa + emoji)
// ---------------------------------------------------------------------
const Criancas = {
  criar(userId, d) {
    const apelido = s(d.apelido, 40);
    if (!apelido) throw new Error('Escolha um apelido para a criança.');
    if (/@|\d{4,}/.test(apelido)) throw new Error('O apelido não pode ter e-mail nem números longos — é só como a criança quer ser chamada.');
    const faixa = FAIXAS.includes(d.faixa) ? d.faixa : '9-11';
    const ativos = db.prepare("SELECT COUNT(*) AS c FROM children WHERE user_id = ? AND status = 'ativo'").get(userId).c;
    if (ativos >= Config.num('max_perfis_por_conta', MAX_PERFIS)) throw new Error('Limite de perfis desta conta atingido.');
    const id = novoId();
    db.prepare('INSERT INTO children (id, user_id, apelido, faixa, avatar, criado_em) VALUES (?,?,?,?,?,?)')
      .run(id, s(userId, 40), apelido, faixa, s(d.avatar, 8) || '🙂', nowISO());
    evento(userId, 'crianca.criar', id, { faixa });
    return Criancas.obter(userId, id);
  },
  // SEMPRE pelo par (userId, childId): perfil de outra família não existe para esta sessão.
  obter(userId, childId) {
    return db.prepare("SELECT * FROM children WHERE id = ? AND user_id = ? AND status = 'ativo'")
      .get(s(childId, 40), s(userId, 40)) || null;
  },
  exigir(userId, childId) {
    const c = Criancas.obter(userId, childId);
    if (!c) throw new Error('Perfil não encontrado.');
    return c;
  },
  listar(userId) {
    return db.prepare("SELECT * FROM children WHERE user_id = ? AND status = 'ativo' ORDER BY criado_em").all(s(userId, 40));
  },
  atualizar(userId, childId, d) {
    const c = Criancas.exigir(userId, childId);
    db.prepare('UPDATE children SET apelido = ?, faixa = ?, avatar = ? WHERE id = ?')
      .run(s(d.apelido, 40) || c.apelido, FAIXAS.includes(d.faixa) ? d.faixa : c.faixa, s(d.avatar, 8) || c.avatar, c.id);
    return Criancas.obter(userId, childId);
  },
  arquivar(userId, childId) {
    const c = Criancas.exigir(userId, childId);
    db.prepare("UPDATE children SET status = 'arquivado' WHERE id = ?").run(c.id);
    evento(userId, 'crianca.arquivar', c.id);
    return { ok: true };
  },
};

// ---------------------------------------------------------------------
// Missões: catálogo (upsert do código) + progresso por criança
// ---------------------------------------------------------------------
const Missoes = {
  catalogo({ incluirInativas = false } = {}) {
    return db.prepare(`SELECT * FROM missions ${incluirInativas ? '' : 'WHERE ativa = 1'} ORDER BY ordem`).all();
  },
  obter(id) { return db.prepare('SELECT * FROM missions WHERE id = ?').get(s(id, 60)) || null; },
  ativar(id, ativa, quem) {
    if (!Missoes.obter(id)) throw new Error('Missão não encontrada.');
    db.prepare('UPDATE missions SET ativa = ? WHERE id = ?').run(ativa ? 1 : 0, s(id, 60));
    Auditoria.registrar({ quem, acao: ativa ? 'missao.ativar' : 'missao.desativar', entidade: 'missions', entidade_id: id });
    return Missoes.obter(id);
  },

  // Trilha da criança: catálogo + status calculado. Desbloqueio linear —
  // a missão N+1 abre quando a N conclui (regra do design da fase 1).
  trilha(childId) {
    const progresso = new Map(db.prepare('SELECT * FROM child_missions WHERE child_id = ?').all(s(childId, 40)).map((p) => [p.mission_id, p]));
    let anteriorConcluida = true; // a 1ª missão nasce disponível
    return Missoes.catalogo().map((m) => {
      const p = progresso.get(m.id) || null;
      let status = 'bloqueada';
      if (p && p.status === 'concluida') status = 'concluida';
      else if (p) status = 'em_andamento';
      else if (anteriorConcluida) status = 'disponivel';
      anteriorConcluida = (status === 'concluida');
      return { ...m, status, iniciado_em: p ? p.iniciado_em : '', concluido_em: p ? p.concluido_em : '' };
    });
  },

  iniciar(userId, childId, missionId) {
    const c = Criancas.exigir(userId, childId);
    const etapa = Missoes.trilha(c.id).find((m) => m.id === s(missionId, 60));
    if (!etapa) throw new Error('Missão não encontrada.');
    if (etapa.status === 'bloqueada') throw new Error('Esta missão ainda está bloqueada — conclua a anterior primeiro.');
    if (etapa.status === 'concluida') throw new Error('Missão já concluída.');
    if (etapa.status === 'em_andamento') return etapa;
    db.prepare('INSERT INTO child_missions (id, child_id, mission_id, iniciado_em) VALUES (?,?,?,?)')
      .run(novoId(), c.id, etapa.id, nowISO());
    evento(userId, 'missao.iniciar', etapa.id, { child: c.id });
    return Missoes.trilha(c.id).find((m) => m.id === etapa.id);
  },

  // Concluir = registrar a criação no portfólio. É o núcleo definitivo:
  // na onda 2 o tutor conduz até aqui, mas a chegada é a mesma.
  concluir(userId, childId, missionId, { titulo, conteudo } = {}) {
    const c = Criancas.exigir(userId, childId);
    const mid = s(missionId, 60);
    const p = db.prepare('SELECT * FROM child_missions WHERE child_id = ? AND mission_id = ?').get(c.id, mid);
    if (!p) throw new Error('Inicie a missão antes de concluir.');
    if (p.status === 'concluida') throw new Error('Missão já concluída.');
    const tit = s(titulo, 140);
    const txt = s(conteudo, 20000);
    if (!tit || !txt) throw new Error('Toda missão termina com uma criação: dê um título e cole o que você criou.');
    const m = Missoes.obter(mid);
    return transacao(() => {
      const pid = novoId();
      db.prepare('INSERT INTO portfolio (id, child_id, mission_id, tipo, titulo, conteudo, criado_em) VALUES (?,?,?,?,?,?,?)')
        .run(pid, c.id, mid, 'texto', tit, txt, nowISO());
      db.prepare("UPDATE child_missions SET status = 'concluida', concluido_em = ? WHERE id = ?").run(nowISO(), p.id);
      evento(userId, 'missao.concluir', mid, { child: c.id, portfolio: pid });
      Notificacoes.criar(userId, {
        titulo: `${c.avatar} ${c.apelido} concluiu "${m ? m.titulo : mid}"!`,
        texto: `A criação "${tit}" entrou no portfólio. ${m && m.momento_familia ? 'Momento família: ' + m.momento_familia : ''}`,
        url: '/kids/app#portfolio',
      });
      return { ok: true, portfolio_id: pid, proxima: Missoes.trilha(c.id).find((x) => x.status === 'disponivel') || null };
    });
  },
};

const Portfolio = {
  listar(userId, childId) {
    const c = Criancas.exigir(userId, childId);
    return db.prepare('SELECT * FROM portfolio WHERE child_id = ? ORDER BY criado_em DESC').all(c.id);
  },
  obter(userId, childId, id) {
    const c = Criancas.exigir(userId, childId);
    return db.prepare('SELECT * FROM portfolio WHERE id = ? AND child_id = ?').get(s(id, 40), c.id) || null;
  },
};

// ---------------------------------------------------------------------
// Semeadura de boot: config + catálogo de missões (upsert, nunca apaga
// progresso — remover missão do ar é `ativa = 0`, não DELETE).
// ---------------------------------------------------------------------
function semear() {
  for (const [chave, def] of Object.entries(CONFIG_PADRAO)) {
    db.prepare(`INSERT INTO config (chave, valor, descricao, atualizado_em) VALUES (?,?,?,?)
      ON CONFLICT(chave) DO UPDATE SET descricao = excluded.descricao`)
      .run(chave, def.valor, def.descricao, nowISO());
  }
  for (const m of MISSOES) {
    db.prepare(`INSERT INTO missions (id, ordem, emoji, titulo, eixo, resumo, produto_final, momento_familia, ativa)
      VALUES (?,?,?,?,?,?,?,?,1)
      ON CONFLICT(id) DO UPDATE SET ordem = excluded.ordem, emoji = excluded.emoji, titulo = excluded.titulo,
        eixo = excluded.eixo, resumo = excluded.resumo, produto_final = excluded.produto_final,
        momento_familia = excluded.momento_familia`)
      .run(m.id, m.ordem, m.emoji, m.titulo, m.eixo, m.resumo, m.produto_final, m.momento_familia);
  }
}

module.exports = { Config, Auditoria, Notificacoes, Users, Criancas, Missoes, Portfolio, semear, evento, s, n, inteiro, FAIXAS };
