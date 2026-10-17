// =====================================================================
// Villela Academy Marketplace — repositório (regras de domínio da FASE 1):
// usuários, papéis/permissões, perfis de produtor e afiliado (com fluxo
// de aprovação), sessões revogáveis, auditoria, leads e config.
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const { db, transacao, nowISO, novoId, j } = require('./db');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

// ---- papéis e permissões -------------------------------------------------
// Papéis acumuláveis por usuário. Permissões são derivadas do papel; a
// autorização real de produtor/afiliado exige TAMBÉM perfil aprovado.
const PAPEIS = ['aluno', 'produtor', 'afiliado', 'admin'];
const PERMISSOES = {
  aluno: ['biblioteca.ver', 'progresso.ver', 'perfil.editar', 'suporte.abrir'],
  produtor: ['produtos.gerir', 'cursos.gerir', 'alunos.ver', 'vendas.ver', 'afiliacao.aprovar', 'cupons.gerir'],
  afiliado: ['links.gerir', 'cliques.ver', 'comissoes.ver', 'materiais.ver'],
  admin: ['usuarios.gerir', 'perfis.aprovar', 'moderacao.gerir', 'config.gerir', 'auditoria.ver', 'financeiro.plataforma'],
};

function normUser(u) {
  if (!u) return null;
  return { ...u, papeis: j.parse(u.papeis, ['aluno']), consentimentos: j.parse(u.consentimentos, {}) };
}
function semSegredos(u) { if (!u) return null; const { senha_hash, ...resto } = u; return resto; }

const Usuarios = {
  porId(id) { return normUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)); },
  porEmail(email) { return normUser(db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(s(email, 120).toLowerCase())); },

  criar({ nome, email, senha, telefone, marketing }) {
    nome = s(nome, 120); email = s(email, 120).toLowerCase();
    if (!nome || !email || !email.includes('@')) throw new Error('Informe nome e e-mail válidos.');
    if (String(senha || '').length < 8) throw new Error('A senha precisa de 8+ caracteres.');
    if (this.porEmail(email)) throw new Error('Já existe uma conta com este e-mail.');
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO users (id, nome, email, senha_hash, papeis, telefone, status, consentimentos, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, 'ativo', ?, ?)`).run(
      id, nome, email, bcrypt.hashSync(String(senha), 10), j.str(['aluno']), s(telefone, 40),
      j.str({ termos_em: agora, privacidade_em: agora, marketing: !!marketing }), agora);
    return this.porId(id);
  },

  conferirSenha(u, senha) { return !!(u && u.senha_hash && bcrypt.compareSync(String(senha || ''), u.senha_hash)); },
  trocarSenha(id, nova) {
    if (String(nova || '').length < 8) throw new Error('A senha precisa de 8+ caracteres.');
    db.prepare('UPDATE users SET senha_hash = ?, atualizado_em = ? WHERE id = ?').run(bcrypt.hashSync(String(nova), 10), nowISO(), id);
  },

  editar(id, { nome, telefone }) {
    const u = this.porId(id); if (!u) throw new Error('Usuário não encontrado.');
    db.prepare('UPDATE users SET nome = ?, telefone = ?, atualizado_em = ? WHERE id = ?')
      .run(nome != null ? s(nome, 120) : u.nome, telefone != null ? s(telefone, 40) : u.telefone, nowISO(), id);
    return this.porId(id);
  },

  marcarEmailVerificado(id) {
    db.prepare('UPDATE users SET email_verificado = 1, atualizado_em = ? WHERE id = ?').run(nowISO(), id);
  },

  mudarStatus(id, status) {
    if (!['ativo', 'suspenso', 'bloqueado'].includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE users SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), id);
    if (status !== 'ativo') Sessoes.revogarDoUsuario(id);
    return this.porId(id);
  },

  concederPapel(id, papel) {
    if (!PAPEIS.includes(papel)) throw new Error('Papel inválido.');
    const u = this.porId(id); if (!u) throw new Error('Usuário não encontrado.');
    if (!u.papeis.includes(papel)) {
      u.papeis.push(papel);
      db.prepare('UPDATE users SET papeis = ?, atualizado_em = ? WHERE id = ?').run(j.str(u.papeis), nowISO(), id);
    }
    return this.porId(id);
  },
  revogarPapel(id, papel) {
    if (papel === 'aluno') throw new Error('Todo usuário é aluno; suspenda a conta se necessário.');
    const u = this.porId(id); if (!u) throw new Error('Usuário não encontrado.');
    db.prepare('UPDATE users SET papeis = ?, atualizado_em = ? WHERE id = ?')
      .run(j.str(u.papeis.filter(p => p !== papel)), nowISO(), id);
    return this.porId(id);
  },

  listar({ q, papel, status, n } = {}) {
    let rows = db.prepare('SELECT * FROM users ORDER BY criado_em DESC LIMIT ?').all(Math.min(parseInt(n, 10) || 200, 1000)).map(normUser);
    if (q) { const t = s(q, 80).toLowerCase(); rows = rows.filter(u => u.nome.toLowerCase().includes(t) || u.email.includes(t)); }
    if (papel) rows = rows.filter(u => u.papeis.includes(papel));
    if (status) rows = rows.filter(u => u.status === status);
    return rows.map(semSegredos);
  },

  // LGPD: exportação de dados do titular (takeout JSON)
  exportar(id) {
    const u = this.porId(id); if (!u) throw new Error('Usuário não encontrado.');
    return {
      exportado_em: nowISO(),
      usuario: semSegredos(u),
      perfil_produtor: Perfis.produtor(id) || null,
      perfil_afiliado: Perfis.afiliado(id) || null,
      sessoes: db.prepare('SELECT criada_em, expira_em, ip, user_agent, revogada FROM sessions WHERE user_id = ?').all(id),
      auditoria: db.prepare('SELECT quando, acao, entidade, detalhe, ip FROM audit_logs WHERE quem = ? ORDER BY id DESC LIMIT 500').all(id),
      aprendizagem: textosDoAluno(id),
      // o que a conta TEM e FEZ (segunda revisão, 11/10/2026, L1): compras, matrículas, assinaturas, progresso,
      // certificados, avaliações, suporte, o que o Estude registrou (evidências, provas, plano, estado das aulas)
      // e a carteira de IA (movimentos e recargas). Antes a exportação levava só o que o aluno escreveu.
      registros: registrosDoTitular(id),
      // Estude: o PERCURSO PARTICULAR (título, programa e questões que o titular importou) e a lista dos arquivos
      // que ele enviou para pedidos — não cabem na lista de tabelas de texto (require tardio: pedidos → carteira → repo)
      estude: (() => { try { return require('./estudo/pedidos').exportarDoTitular(id); } catch (_) { return { percursos_particulares: [], arquivos_enviados: [] }; } })(),
      comunidade: require('./ecossistema').exportar(id), // require tardio: ecossistema → repo-conteudo → repo
    };
  },

  // LGPD: exclusão = anonimizar (preserva integridade financeira/auditoria futura)
  anonimizar(id) {
    const u = this.porId(id); if (!u) throw new Error('Usuário não encontrado.');
    return transacao(() => {
      db.prepare(`UPDATE users SET nome = 'Usuário excluído', email = ?, senha_hash = '', telefone = '',
        status = 'excluido', consentimentos = '{}', atualizado_em = ? WHERE id = ?`)
        .run(`excluido-${id}@anonimizado.local`, nowISO(), id);
      db.prepare("UPDATE producer_profiles SET nome_publico = '', documento = '', bio = '', site = '', dados_pagamento = '{}', status = 'bloqueado', atualizado_em = ? WHERE user_id = ?").run(nowISO(), id);
      db.prepare("UPDATE affiliate_profiles SET nome_publico = '', documento = '', canais = '', dados_pagamento = '{}', status = 'bloqueado', atualizado_em = ? WHERE user_id = ?").run(nowISO(), id);
      Sessoes.revogarDoUsuario(id);
      // segundo fator e inscrições de notificação são da PESSOA: saem com ela
      db.prepare("UPDATE users SET totp_secret = '', totp_ativo = 0 WHERE id = ?").run(id);
      db.prepare('DELETE FROM push_subs WHERE user_id = ?').run(id);
      // o NOME sai do certificado (a página pública passa a dizer que o titular removeu os dados)
      require('./governanca').Certificados.esquecerTitular(id); // require tardio: governanca → repo
      // texto livre fora da lista de aprendizagem: o que ele escreveu ao SUPORTE (assunto e mensagens; o e-mail
      // dele era o `autor`) e o texto das AVALIAÇÕES de curso (a nota fica, sem autor identificável)
      db.prepare("UPDATE support_messages SET texto = '[removido a pedido do titular]', autor = '' WHERE lado = 'usuario' AND ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ?)").run(id);
      db.prepare("UPDATE support_tickets SET assunto = '[removido a pedido do titular]' WHERE user_id = ?").run(id);
      db.prepare("UPDATE reviews SET texto = '' WHERE user_id = ?").run(id);
      // o que o aluno ESCREVEU (caderno, tutor, missões, desafio) é dele: sai inteiro.
      // Notas ficam (sem texto livre), como as vendas.
      // (no Estude: marcações, anotações, tentativas e notas de aula saem; o pedido pago FICA — é registro
      // financeiro — mas sem o que o aluno escreveu ou falou: resposta, transcrição, correção e contestação)
      // o ÁUDIO da prova oral sai na hora, sem esperar o prazo de guarda — e ANTES de limpar a entrada do pedido,
      // que é onde está o endereço dele (require tardio: pedidos → carteira → repo).
      // Junto saem TODA mídia de pedido do titular (os PDFs de prova, gabarito e edital também) e o PERCURSO
      // PARTICULAR dele: o escopo, o programa e as questões que ele importou (`apagarDoTitular`).
      // NADA de "tenta e segue": uma falha aqui deixava o texto no banco, a transação confirmava e a rota respondia
      // `ok: true`, sem log. Agora o erro sobe — a transação inteira é desfeita e quem pediu a exclusão fica sabendo.
      require('./estudo/pedidos').apagarDoTitular(id);
      for (const [tabela, , apagar] of TEXTOS_DO_ALUNO) db.prepare(apagar || `DELETE FROM ${tabela} WHERE user_id = ?`).run(id);
      // Estude, o que não é texto mas é do aluno: as respostas marcadas em cada prova (a linha da tentativa sai
      // inteira — a evidência por competência, sem texto, fica) e o plano de estudo (disponibilidade e datas dele)
      db.prepare('DELETE FROM est_tentativas WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM est_planos WHERE user_id = ?').run(id);
      require('./ecossistema').apagarDoTitular(id); // comunidade e lives: o texto sai, o fio da conversa fica
      return true;
    });
  },
};

// tabelas com texto livre do aluno — exportação e exclusão (LGPD) leem desta lista
const TEXTOS_DO_ALUNO = [
  ['caderno_respostas', 'SELECT product_id, lesson_id, campo, texto, atualizado_em FROM caderno_respostas WHERE user_id = ?'],
  ['tutor_conversas', 'SELECT product_id, lesson_id, pergunta, resposta, criado_em FROM tutor_conversas WHERE user_id = ?'],
  ['lab_entregas', 'SELECT product_id, missao_id, respostas, entregue_em, feedback, atualizado_em FROM lab_entregas WHERE user_id = ?'],
  ['desafio_checkins', 'SELECT product_id, dia, nota, criado_em FROM desafio_checkins WHERE user_id = ?'],
  // ESTUDE (academy\estudo): o grifo com a nota, a anotação do caderno de erros, a tentativa escrita em cada
  // bloco da aula, a nota livre da aula e os textos dos pedidos pagos. O terceiro campo, quando existe, é
  // como APAGAR sem apagar a linha (o pedido tem valor cobrado: a linha fica, o texto sai).
  ['est_marcacoes', 'SELECT escopo_id, unidade, texto, cor, nota, criado_em FROM est_marcacoes WHERE user_id = ?'],
  ['est_anotacoes', 'SELECT escopo_id, questao_id, texto, atualizado_em FROM est_anotacoes WHERE user_id = ?'],
  ['est_tentativas_bloco', 'SELECT escopo_id, unidade, bloco, texto, atualizado_em FROM est_tentativas_bloco WHERE user_id = ?'],
  ['est_notas_aula', 'SELECT escopo_id, unidade, texto, atualizado_em FROM est_notas_aula WHERE user_id = ?'],
  ['est_pedidos', 'SELECT product_id, tipo, estado, questao_id, entrada, resultado, contestacao, criado_em FROM est_pedidos WHERE user_id = ?',
    "UPDATE est_pedidos SET entrada = '{}', resultado = '', contestacao = '', erro = '' WHERE user_id = ?"],
];
// EXPORTAÇÃO (LGPD): os REGISTROS da conta, tabela por tabela — sempre filtrados pelo próprio usuário. Colunas
// escolhidas uma a uma (nada de `SELECT *`): não vai o que é de outra pessoa (comissão do produtor, do afiliado),
// nem o gabarito congelado das provas (o conteúdo do curso não é dado do titular).
const REGISTROS_DO_TITULAR = [
  ['compras', 'SELECT id, product_id, produto_titulo, valor_centavos, status, tipo, criado_em, pago_em FROM orders WHERE user_id = ? ORDER BY criado_em'],
  ['matriculas', 'SELECT product_id, origem, status, criado_em FROM enrollments WHERE user_id = ? ORDER BY criado_em'],
  ['assinaturas', 'SELECT id, product_id, produto_titulo, valor_centavos, status, criado_em, ativa_em, cancelada_em FROM subscriptions WHERE user_id = ? ORDER BY criado_em'],
  ['progresso', 'SELECT product_id, lesson_id, concluida, posicao_seg, atualizado_em FROM student_progress WHERE user_id = ?'],
  ['tempo_nas_aulas', 'SELECT product_id, lesson_id, dia, segundos FROM study_time WHERE user_id = ? ORDER BY dia'],
  ['certificados', 'SELECT id AS codigo, product_id, produto_titulo, aluno_nome, total_aulas, carga_horaria_min, emitido_em, revogado_em FROM certificates WHERE user_id = ?'],
  ['avaliacoes_de_curso', 'SELECT product_id, nota, texto, status, criado_em FROM reviews WHERE user_id = ?'],
  ['suporte', `SELECT t.id AS ticket, t.assunto, t.categoria, t.status, m.lado, m.texto, m.criado_em FROM support_tickets t
     LEFT JOIN support_messages m ON m.ticket_id = t.id WHERE t.user_id = ? ORDER BY t.criado_em, m.criado_em`],
  ['estude_evidencias', 'SELECT escopo_id, competencia_codigo, origem, ref_id, tentativa_id, modo, acerto, pistas, inedita, tempo_seg, confianca, criado_em FROM est_evidencias WHERE user_id = ? ORDER BY criado_em'],
  ['estude_provas', 'SELECT id, escopo_id, modo, estado, inicio_em, prazo_em, salvo_em, enviado_em, respostas FROM est_tentativas WHERE user_id = ? ORDER BY inicio_em'],
  ['estude_planos', 'SELECT escopo_id, entrada, plano, versao, atualizado_em FROM est_planos WHERE user_id = ?'],
  ['estude_aulas', 'SELECT escopo_id, unidade, aberta_em, lida_em, video_pos_seg, video_assistido, video_em FROM est_aula_estado WHERE user_id = ?'],
  ['estude_revisoes', 'SELECT escopo_id, alvo, alvo_id, passo, vencimento, ultimo_resultado, atualizado_em FROM est_revisoes WHERE user_id = ?'],
  ['carteira_ia_movimentos', 'SELECT tipo, milesimos, detalhe, criado_em FROM ia_movimentos WHERE user_id = ? ORDER BY criado_em'],
  ['carteira_ia_recargas', 'SELECT id, valor_centavos, status, criado_em, pago_em FROM ia_recargas WHERE user_id = ? ORDER BY criado_em'],
  ['uso_de_ia', 'SELECT quando, agente, status, cobranca, milesimos, product_id FROM ai_usage_logs WHERE user_id = ? ORDER BY quando'],
];
function registrosDoTitular(id) {
  const out = {};
  for (const [nome, sql] of REGISTROS_DO_TITULAR) {
    // tabela que ainda não existe neste banco não derruba a exportação — mas a lacuna vai DITA, não escondida
    try { out[nome] = db.prepare(sql).all(id); } catch (e) { out[nome] = []; out._nao_exportado = (out._nao_exportado || []).concat(nome); }
  }
  return out;
}
function textosDoAluno(id) {
  const out = {};
  for (const [tabela, sql] of TEXTOS_DO_ALUNO) { try { out[tabela] = db.prepare(sql).all(id); } catch (_) { out[tabela] = []; } }
  return out;
}

// ---- perfis (produtor/afiliado) com fluxo de aprovação --------------------
const STATUS_PERFIL = ['em_analise', 'aprovado', 'rejeitado', 'suspenso', 'bloqueado'];
function normPerfil(p, tabela) { return p ? { ...p, dados_pagamento: undefined, _tabela: undefined } : null; }

const Perfis = {
  produtor(userId) { return db.prepare('SELECT * FROM producer_profiles WHERE user_id = ?').get(userId) || null; },
  afiliado(userId) { return db.prepare('SELECT * FROM affiliate_profiles WHERE user_id = ?').get(userId) || null; },

  solicitarProdutor(userId, d = {}) {
    if (this.produtor(userId)) throw new Error('Você já tem um cadastro de produtor.');
    const slugBase = s(d.nome_publico || '', 80).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'produtor';
    let slug = slugBase, i = 1;
    while (db.prepare('SELECT 1 FROM producer_profiles WHERE slug = ?').get(slug)) slug = `${slugBase}-${++i}`;
    db.prepare(`INSERT INTO producer_profiles (user_id, nome_publico, slug, tipo_pessoa, documento, bio, site, status, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'em_analise', ?)`).run(
      userId, s(d.nome_publico, 120), slug, d.tipo_pessoa === 'pj' ? 'pj' : 'pf',
      s(d.documento, 20), s(d.bio, 2000), s(d.site, 200), nowISO());
    return this.produtor(userId);
  },
  solicitarAfiliado(userId, d = {}) {
    if (this.afiliado(userId)) throw new Error('Você já tem um cadastro de afiliado.');
    db.prepare(`INSERT INTO affiliate_profiles (user_id, nome_publico, canais, documento, status, criado_em)
      VALUES (?, ?, ?, ?, 'em_analise', ?)`).run(userId, s(d.nome_publico, 120), s(d.canais, 500), s(d.documento, 20), nowISO());
    return this.afiliado(userId);
  },

  // decisão da plataforma; aprovar concede o papel, suspender/bloquear NÃO
  // remove o papel (o gate por status do perfil basta e preserva histórico)
  decidir(tipo, userId, status, motivo) {
    if (!STATUS_PERFIL.includes(status)) throw new Error('Status inválido.');
    const tabela = tipo === 'produtor' ? 'producer_profiles' : 'affiliate_profiles';
    const p = db.prepare(`SELECT * FROM ${tabela} WHERE user_id = ?`).get(userId);
    if (!p) throw new Error('Perfil não encontrado.');
    return transacao(() => {
      db.prepare(`UPDATE ${tabela} SET status = ?, motivo_status = ?, atualizado_em = ? WHERE user_id = ?`)
        .run(status, s(motivo, 500), nowISO(), userId);
      if (status === 'aprovado') Usuarios.concederPapel(userId, tipo);
      return db.prepare(`SELECT * FROM ${tabela} WHERE user_id = ?`).get(userId);
    });
  },

  // produtores cadastrados (id, nome, e-mail, status) — leitura de administração
  listarProdutores() {
    return db.prepare(`SELECT p.user_id AS id, u.nome, u.email, p.nome_publico, p.slug, p.status, p.criado_em
      FROM producer_profiles p JOIN users u ON u.id = p.user_id ORDER BY p.criado_em`).all();
  },

  pendentes() {
    return {
      produtores: db.prepare("SELECT p.*, u.nome, u.email FROM producer_profiles p JOIN users u ON u.id = p.user_id WHERE p.status = 'em_analise' ORDER BY p.criado_em").all(),
      afiliados: db.prepare("SELECT a.*, u.nome, u.email FROM affiliate_profiles a JOIN users u ON u.id = a.user_id WHERE a.status = 'em_analise' ORDER BY a.criado_em").all(),
    };
  },
};

// papel efetivo: tem o papel E (se produtor/afiliado) o perfil está aprovado
function podeAgirComo(u, papel) {
  if (!u || u.status !== 'ativo' || !u.papeis.includes(papel)) return false;
  if (papel === 'produtor') { const p = Perfis.produtor(u.id); return !!(p && p.status === 'aprovado'); }
  if (papel === 'afiliado') { const p = Perfis.afiliado(u.id); return !!(p && p.status === 'aprovado'); }
  return true;
}
function permissoesDe(u) {
  const set = new Set();
  for (const p of PAPEIS) if (podeAgirComo(u, p)) for (const perm of PERMISSOES[p]) set.add(perm);
  return [...set];
}

// ---- sessões revogáveis ----------------------------------------------------
const Sessoes = {
  criar(userId, { ip, userAgent, dias = 30 } = {}) {
    const id = novoId();
    db.prepare('INSERT INTO sessions (id, user_id, criada_em, expira_em, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, userId, nowISO(), new Date(Date.now() + dias * 864e5).toISOString(), s(ip, 60), s(userAgent, 200));
    return id;
  },
  valida(jti) {
    const ss = db.prepare('SELECT * FROM sessions WHERE id = ?').get(jti);
    return !!(ss && !ss.revogada && ss.expira_em > nowISO());
  },
  revogar(jti) { db.prepare('UPDATE sessions SET revogada = 1 WHERE id = ?').run(jti); },
  revogarDoUsuario(userId) { db.prepare('UPDATE sessions SET revogada = 1 WHERE user_id = ?').run(userId); },
};

// ---- auditoria -------------------------------------------------------------
const Auditoria = {
  registrar({ quem, papel, acao, entidade, entidade_id, detalhe, ip }) {
    db.prepare('INSERT INTO audit_logs (quando, quem, papel, acao, entidade, entidade_id, detalhe, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(nowISO(), s(quem, 80), s(papel, 20), s(acao, 80), s(entidade, 40), s(entidade_id, 40), s(detalhe, 800), s(ip, 60));
  },
  listar(n) { return db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(Math.min(parseInt(n, 10) || 200, 2000)); },
  doUsuario(userId, n) { return db.prepare('SELECT * FROM audit_logs WHERE quem = ? ORDER BY id DESC LIMIT ?').all(userId, Math.min(parseInt(n, 10) || 100, 500)); },
};

// ---- leads / config --------------------------------------------------------
const Leads = {
  criar(d = {}) {
    const id = novoId();
    db.prepare('INSERT INTO leads (id, nome, email, telefone, interesse, mensagem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, s(d.nome, 120), s(d.email, 120), s(d.telefone, 40), s(d.interesse, 30), s(d.mensagem, 2000), nowISO());
    return id;
  },
  listar(n) { return db.prepare('SELECT * FROM leads ORDER BY criado_em DESC LIMIT ?').all(Math.min(parseInt(n, 10) || 100, 500)); },
  status(id, st) { db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(s(st, 20), id); },
};

const Config = {
  obter(chave, padrao) { const r = db.prepare('SELECT valor FROM platform_settings WHERE chave = ?').get(chave); return r ? j.parse(r.valor, padrao) : padrao; },
  salvar(chave, valor) {
    db.prepare('INSERT INTO platform_settings (chave, valor, atualizado_em) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em')
      .run(s(chave, 80), j.str(valor), nowISO());
  },
};

// defaults comerciais (upsert idempotente; preserva valores editados)
// Números OFICIAIS (decisão do Augusto 09/07/2026, benchmark de mercado):
// plataforma 8,9% + R$1,00 fixo por venda; afiliado 10%.
// Fonte: regras\regras-negocio.md. A migração 'comissoes-oficiais-2026-07-09'
// (db.js) atualiza bancos que nasceram com valores anteriores (10%/10%).
function semear() {
  if (Config.obter('comissoes', null) == null) {
    Config.salvar('comissoes', { plataforma_pct: 8.9, fixo_centavos: 100, afiliado_padrao_pct: 10, cookie_dias: 30 });
  }
}

// ---- dashboards ------------------------------------------------------------
const Dashboard = {
  plataforma() {
    const c = (sql) => (db.prepare(sql).get() || { n: 0 }).n;
    return {
      usuarios: c('SELECT COUNT(*) n FROM users'),
      alunos_ativos: c("SELECT COUNT(*) n FROM users WHERE status = 'ativo'"),
      produtores_aprovados: c("SELECT COUNT(*) n FROM producer_profiles WHERE status = 'aprovado'"),
      afiliados_aprovados: c("SELECT COUNT(*) n FROM affiliate_profiles WHERE status = 'aprovado'"),
      perfis_em_analise: c("SELECT COUNT(*) n FROM producer_profiles WHERE status = 'em_analise'") + c("SELECT COUNT(*) n FROM affiliate_profiles WHERE status = 'em_analise'"),
      leads_novos: c("SELECT COUNT(*) n FROM leads WHERE status = 'novo'"),
      produtos: c("SELECT COUNT(*) n FROM products WHERE status NOT IN ('removido')"),
      produtos_em_revisao: c("SELECT COUNT(*) n FROM products WHERE status = 'em_revisao'"),
      cursos_publicados: c("SELECT COUNT(*) n FROM products WHERE status = 'publicado'"),
      matriculas_ativas: c("SELECT COUNT(*) n FROM enrollments WHERE status = 'ativa'"),
      gmv_centavos: c("SELECT COALESCE(SUM(valor_centavos),0) n FROM orders WHERE status = 'paga'"),
      receita_plataforma_centavos: c("SELECT COALESCE(SUM(comissao_plataforma_centavos),0) n FROM orders WHERE status = 'paga'"),
      vendas: c("SELECT COUNT(*) n FROM orders WHERE status = 'paga'"),
      pedidos_pendentes: c("SELECT COUNT(*) n FROM orders WHERE status = 'pendente'"),
      reembolsos: c("SELECT COUNT(*) n FROM orders WHERE status = 'reembolsada'"),
      assinaturas_ativas: c("SELECT COUNT(*) n FROM subscriptions WHERE status = 'ativa'"),
      mrr_centavos: c("SELECT COALESCE(SUM(valor_centavos),0) n FROM subscriptions WHERE status = 'ativa'"),
    };
  },
  aluno(userId) { // composição rica (biblioteca+progresso) em repo-conteudo.dashboardAluno
    return { cursos: [], progresso: [], certificados: [], compras: [], assinaturas: [] };
  },
  produtor(userId) {
    const c = (sql, ...a) => (db.prepare(sql).get(...a) || { n: 0 }).n;
    return {
      produtos: c("SELECT COUNT(*) n FROM products WHERE producer_id = ? AND status != 'removido'", userId),
      publicados: c("SELECT COUNT(*) n FROM products WHERE producer_id = ? AND status = 'publicado'", userId),
      alunos: c("SELECT COUNT(DISTINCT e.user_id) n FROM enrollments e JOIN products p ON p.id = e.product_id WHERE p.producer_id = ? AND e.status = 'ativa'", userId),
      vendas_mes_centavos: (db.prepare("SELECT COALESCE(SUM(liquido_produtor_centavos),0) v FROM orders WHERE producer_id = ? AND status = 'paga' AND pago_em >= ?")
        .get(userId, new Date().toISOString().slice(0, 7)) || { v: 0 }).v, // líquido (já sem a comissão da plataforma)
      comissoes_pendentes_centavos: 0, avaliacoes: [], // F5/F3
    };
  },
  afiliado(userId) {
    const c = (sql, ...a) => (db.prepare(sql).get(...a) || { n: 0 }).n;
    const soma = (st) => (db.prepare('SELECT COALESCE(SUM(valor_centavos),0) n FROM commissions WHERE affiliate_user_id = ? AND status = ?').get(userId, st) || { n: 0 }).n;
    return {
      links: db.prepare('SELECT id FROM affiliate_links WHERE affiliate_user_id = ?').all(userId),
      cliques: c('SELECT COUNT(*) n FROM affiliate_clicks c JOIN affiliate_links l ON l.id = c.link_id WHERE l.affiliate_user_id = ?', userId),
      conversoes: c("SELECT COUNT(*) n FROM commissions WHERE affiliate_user_id = ? AND status != 'cancelada'", userId),
      comissao_pendente_centavos: soma('pendente'),
      comissao_disponivel_centavos: soma('disponivel'),
      comissao_paga_centavos: soma('paga'),
    };
  },
};

module.exports = {
  PAPEIS, PERMISSOES, STATUS_PERFIL,
  Usuarios, Perfis, Sessoes, Auditoria, Leads, Config, Dashboard,
  podeAgirComo, permissoesDe, semSegredos, semear,
};
