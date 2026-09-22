// =====================================================================
// Villela Academy — ECOSSISTEMA: o que transforma cursos soltos numa Academy.
//
//   • formatos de aula: "Villela Express" (1–3 min, biblioteca de consulta)
//     e "Faça comigo" (sessão prática com passos marcados no vídeo);
//   • trilhas: sequência de cursos por área (IA, Direito, Hospedagem), com
//     itens "em breve" e, opcionalmente, um CLUBE (assinatura) que as libera;
//   • lives mensais: agenda, inscrição com lembrete, perguntas antecipadas
//     com voto, gravação que vira aula e "O que mudou este mês";
//   • comunidade: áreas fixas, tópicos, respostas, curtidas, solução,
//     denúncia e moderação pelo dono.
//
// Regras que não se afrouxam:
//   • comunidade e lives são de quem TEM ACESSO a algum produto do produtor
//     (matrícula, assinatura, cortesia) — ou do próprio produtor/admin;
//   • link da live só vai para quem pode assistir;
//   • nada aqui dispara mensagem em massa sozinho: avisar os alunos de uma
//     live nova é um ato explícito (rota própria, pela chave);
//   • texto de aluno sai escapado na tela e entra na exportação/exclusão LGPD.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j, transacao } = require('./db');
const ct = require('./repo-conteudo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const slug = (v) => s(v, 80).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const erro = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };
const ehAdmin = (u) => !!u && (u.papeis || []).includes('admin');

// ---------------------------------------------------------------------
// PERTENCIMENTO: quem é "da casa" de um produtor (comunidade e lives)
// ---------------------------------------------------------------------
function membro(usuario, producerId) {
  if (!usuario) return false;
  if (usuario.id === producerId || ehAdmin(usuario)) return true;
  const u = db.prepare('SELECT cortesia FROM users WHERE id = ?').get(usuario.id);
  if (u && u.cortesia === 1) return true;
  if (db.prepare(`SELECT 1 FROM enrollments e JOIN products p ON p.id = e.product_id
    WHERE e.user_id = ? AND e.status = 'ativa' AND p.producer_id = ? LIMIT 1`).get(usuario.id, producerId)) return true;
  return !!db.prepare(`SELECT 1 FROM subscriptions s JOIN products p ON p.id = s.product_id
    WHERE s.user_id = ? AND s.status = 'ativa' AND p.producer_id = ? LIMIT 1`).get(usuario.id, producerId);
}
function moderador(usuario, producerId) { return !!usuario && (usuario.id === producerId || ehAdmin(usuario)); }
// produtores de cujo ecossistema o usuário faz parte (normalmente um: o Augusto)
function casasDoUsuario(usuario) {
  const ids = new Set(db.prepare(`SELECT DISTINCT p.producer_id id FROM enrollments e JOIN products p ON p.id = e.product_id
      WHERE e.user_id = ? AND e.status = 'ativa'
    UNION SELECT DISTINCT p.producer_id FROM subscriptions s JOIN products p ON p.id = s.product_id
      WHERE s.user_id = ? AND s.status = 'ativa'
    UNION SELECT DISTINCT producer_id FROM products WHERE producer_id = ?`).all(usuario.id, usuario.id, usuario.id).map(x => x.id));
  const u = db.prepare('SELECT cortesia FROM users WHERE id = ?').get(usuario.id);
  if ((u && u.cortesia === 1) || ehAdmin(usuario)) {
    // cortesia/admin: as casas que têm comunidade ou live (senão a lista não teria fim)
    for (const x of db.prepare('SELECT DISTINCT producer_id id FROM trilhas UNION SELECT DISTINCT producer_id FROM lives UNION SELECT DISTINCT producer_id FROM com_topicos').all()) ids.add(x.id);
  }
  return [...ids].map(id => {
    const perfil = db.prepare('SELECT nome_publico FROM producer_profiles WHERE user_id = ?').get(id);
    return { producer_id: id, nome: (perfil && perfil.nome_publico) || 'Villela Academy' };
  });
}
function nomeCurto(nome) { // privacidade: "Maria S." — nunca o nome completo nem o e-mail
  const p = s(nome, 120).split(/\s+/).filter(Boolean);
  if (!p.length) return 'Aluno';
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0].toUpperCase()}.` : p[0];
}

// ---------------------------------------------------------------------
// FORMATOS DE AULA — Villela Express e Faça comigo
// ---------------------------------------------------------------------
const FORMATOS = ['', 'express', 'faca-comigo', 'live'];
// passos do "Faça comigo": [{ini_seg, titulo, instrucao}] — o aluno pausa e faz junto
function validarPassos(passos, onde) {
  if (passos == null) return null;
  if (!Array.isArray(passos) || passos.length > 40) throw erro(`${onde}: "passos" deve ser uma lista (até 40).`);
  let ultimo = -1;
  return passos.map((p, i) => {
    const titulo = s(p && p.titulo, 140);
    const ini = Math.max(0, parseInt(p && p.ini_seg, 10) || 0);
    if (!titulo) throw erro(`${onde}, passo ${i + 1}: título obrigatório.`);
    if (ini < ultimo) throw erro(`${onde}, passo ${i + 1}: os passos precisam estar em ordem de tempo.`);
    ultimo = ini;
    return { ini_seg: ini, titulo, instrucao: s(p.instrucao, 800) };
  });
}
// biblioteca Villela Express: todas as aulas express que o aluno pode ver, de todos os cursos
function biblioteca(usuario, formato = 'express') {
  if (!FORMATOS.includes(formato) || !formato) throw erro('Formato inválido.');
  const linhas = db.prepare(`SELECT l.id, l.titulo, l.tipo, l.duracao_seg, l.gratuita, l.conteudo, l.passos, l.product_id, m.titulo modulo,
      p.titulo produto, p.slug, p.status, p.producer_id
    FROM lessons l JOIN course_modules m ON m.id = l.module_id JOIN products p ON p.id = l.product_id
    WHERE l.formato = ? AND p.status NOT IN ('suspenso','removido') ORDER BY p.titulo, m.ordem, l.ordem`).all(formato);
  const acesso = new Map();
  const pode = (pid, producerId) => {
    if (!acesso.has(pid)) acesso.set(pid, ct.temAcesso(usuario.id, pid) || usuario.id === producerId || ehAdmin(usuario));
    return acesso.get(pid);
  };
  return linhas.filter(l => l.status === 'publicado' || pode(l.product_id, l.producer_id)).map(l => {
    const liberada = pode(l.product_id, l.producer_id) || !!l.gratuita;
    return { id: l.id, titulo: l.titulo, tipo: l.tipo, duracao_seg: l.duracao_seg, produto_id: l.product_id, produto: l.produto, slug: l.slug,
      modulo: l.modulo, liberada, resumo: liberada ? s(l.conteudo, 280) : '', passos: liberada ? j.parse(l.passos, []).length : 0 };
  });
}

// ---------------------------------------------------------------------
// TRILHAS
// ---------------------------------------------------------------------
function validarTrilha(d, producerId) {
  const titulo = s(d && d.titulo, 120);
  if (!titulo) throw erro('trilha: título obrigatório.');
  const itens = Array.isArray(d.itens) ? d.itens : [];
  if (!itens.length || itens.length > 30) throw erro(`trilha "${titulo}": de 1 a 30 itens.`);
  const vistos = new Set();
  const prontos = itens.map((x, i) => {
    const tag = `trilha "${titulo}", item ${i + 1}`;
    if (x.produto_id) {
      const p = ct.Produtos.obter(s(x.produto_id, 40));
      if (!p || p.producer_id !== producerId) throw erro(`${tag}: produto não existe ou não é deste produtor.`);
      if (vistos.has(p.id)) throw erro(`${tag}: produto repetido.`);
      vistos.add(p.id);
      return { product_id: p.id, titulo: '', descricao: s(x.descricao, 400), status: 'disponivel' };
    }
    const t = s(x.titulo, 140);
    if (!t) throw erro(`${tag}: informe produto_id (curso existente) ou título (curso em breve).`);
    return { product_id: '', titulo: t, descricao: s(x.descricao, 400), status: 'em_breve' };
  });
  let clube = '';
  if (d.clube_produto_id) {
    const c = ct.Produtos.obter(s(d.clube_produto_id, 40));
    if (!c || c.producer_id !== producerId || c.tipo !== 'clube') throw erro(`trilha "${titulo}": o clube precisa ser um produto do tipo clube deste produtor.`);
    clube = c.id;
  }
  return { slug: slug(d.slug || titulo), titulo, subtitulo: s(d.subtitulo, 200), descricao: s(d.descricao, 2000), icone: s(d.icone, 8),
    publico: s(d.publico, 400), clube_product_id: clube, status: d.status === 'publicada' ? 'publicada' : 'rascunho', itens: prontos };
}
function importarTrilhas(produtor, lista) {
  if (!Array.isArray(lista) || !lista.length) throw erro('Envie "trilhas": [...]');
  const prontas = lista.map(t => validarTrilha(t, produtor.id));
  const r = [];
  transacao(() => {
    prontas.forEach((t, ordem) => {
      const ja = db.prepare('SELECT id, producer_id FROM trilhas WHERE slug = ?').get(t.slug);
      if (ja && ja.producer_id !== produtor.id) throw erro(`o endereço "${t.slug}" já é de outra trilha.`);
      const id = ja ? ja.id : novoId();
      if (ja) {
        db.prepare(`UPDATE trilhas SET titulo = ?, subtitulo = ?, descricao = ?, icone = ?, publico = ?, clube_product_id = ?, status = ?, ordem = ?, atualizado_em = ? WHERE id = ?`)
          .run(t.titulo, t.subtitulo, t.descricao, t.icone, t.publico, t.clube_product_id, t.status, ordem, nowISO(), id);
        db.prepare('DELETE FROM trilha_itens WHERE trilha_id = ?').run(id);
      } else {
        db.prepare(`INSERT INTO trilhas (id, producer_id, slug, titulo, subtitulo, descricao, icone, publico, clube_product_id, status, ordem, criado_em, atualizado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, produtor.id, t.slug, t.titulo, t.subtitulo, t.descricao, t.icone, t.publico, t.clube_product_id, t.status, ordem, nowISO(), nowISO());
      }
      const ins = db.prepare('INSERT INTO trilha_itens (id, trilha_id, ordem, product_id, titulo, descricao, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
      t.itens.forEach((x, i) => ins.run(novoId(), id, i, x.product_id, x.titulo, x.descricao, x.status));
      r.push({ slug: t.slug, status: t.status, itens: t.itens.length });
    });
  });
  return r;
}
function statusTrilha(produtor, slugT, status) {
  if (!['rascunho', 'publicada'].includes(status)) throw erro('status: rascunho|publicada');
  const n = db.prepare('UPDATE trilhas SET status = ?, atualizado_em = ? WHERE slug = ? AND producer_id = ?').run(status, nowISO(), s(slugT, 80), produtor.id).changes;
  if (!n) throw erro('Trilha não encontrada.', 404);
  return { ok: true };
}
function montarTrilha(t, usuario) {
  const itens = db.prepare('SELECT * FROM trilha_itens WHERE trilha_id = ? ORDER BY ordem').all(t.id).map(x => {
    if (!x.product_id) return { status: 'em_breve', titulo: x.titulo, descricao: x.descricao };
    const p = ct.Produtos.obter(x.product_id);
    if (!p || p.status !== 'publicado') return { status: 'em_breve', titulo: p ? p.titulo : x.titulo, descricao: x.descricao };
    const acesso = usuario ? ct.temAcesso(usuario.id, p.id) : false;
    const prog = acesso ? ct.Progresso.doProduto(usuario.id, p.id) : null;
    return { status: 'disponivel', produto_id: p.id, titulo: p.titulo, subtitulo: p.subtitulo, slug: p.slug, descricao: x.descricao || p.descricao_curta,
      capa_media_id: p.capa_media_id, preco_centavos: p.preco_promo_centavos || p.preco_centavos, acesso, progresso_pct: prog ? prog.pct : null };
  });
  let clube = null;
  if (t.clube_product_id) {
    const c = ct.Produtos.obter(t.clube_product_id);
    if (c && c.status === 'publicado') clube = { produto_id: c.id, titulo: c.titulo, slug: c.slug, preco_centavos: c.preco_promo_centavos || c.preco_centavos,
      assinante: usuario ? ct.temAcesso(usuario.id, c.id) : false };
  }
  const disp = itens.filter(i => i.status === 'disponivel');
  return { id: t.id, slug: t.slug, titulo: t.titulo, subtitulo: t.subtitulo, descricao: t.descricao, icone: t.icone, publico: t.publico, status: t.status,
    itens, clube, cursos: disp.length, em_breve: itens.length - disp.length,
    progresso_pct: usuario && disp.length ? Math.round(disp.reduce((a, i) => a + (i.progresso_pct || 0), 0) / disp.length) : null };
}
function trilhasPublicas(usuario) {
  const vis = (t) => t.status === 'publicada' || (usuario && (usuario.id === t.producer_id || ehAdmin(usuario)));
  return db.prepare('SELECT * FROM trilhas ORDER BY ordem, criado_em').all().filter(vis).map(t => montarTrilha(t, usuario));
}
function trilhaPorSlug(slugT, usuario) {
  const t = db.prepare('SELECT * FROM trilhas WHERE slug = ?').get(s(slugT, 80));
  if (!t || !(t.status === 'publicada' || (usuario && (usuario.id === t.producer_id || ehAdmin(usuario))))) return null;
  return montarTrilha(t, usuario);
}

// ---------------------------------------------------------------------
// LIVES MENSAIS + "O que mudou este mês"
// ---------------------------------------------------------------------
const STATUS_LIVE = ['agendada', 'ao_vivo', 'encerrada', 'cancelada'];
function validarLive(d) {
  const titulo = s(d && d.titulo, 160);
  if (!titulo) throw erro('live: título obrigatório.');
  const inicio = new Date(s(d.inicio_em, 40));
  if (isNaN(inicio)) throw erro('live: "inicio_em" precisa ser data e hora ISO (ex.: 2026-10-15T20:00:00-03:00).');
  const link = s(d.link, 400);
  if (link && !/^https:\/\//.test(link)) throw erro('live: o link precisa ser https://');
  const gravacao = s(d.gravacao_url, 400);
  if (gravacao && !/^https:\/\//.test(gravacao)) throw erro('live: a gravação precisa ser https://');
  const status = STATUS_LIVE.includes(d.status) ? d.status : 'agendada';
  const produtos = (Array.isArray(d.produtos) ? d.produtos : []).map(x => s(x, 40)).filter(Boolean);
  const novidades = (Array.isArray(d.novidades) ? d.novidades : []).map(n => ({ titulo: s(n && n.titulo, 160), texto: s(n && n.texto, 1200), fonte: s(n && n.fonte, 400) }))
    .filter(n => n.titulo);
  for (const n of novidades) if (n.fonte && !/^https:\/\//.test(n.fonte)) throw erro(`novidade "${n.titulo}": a fonte precisa ser um link https://`);
  return { titulo, descricao: s(d.descricao, 3000), inicio_em: inicio.toISOString(), duracao_min: Math.max(15, Math.min(300, parseInt(d.duracao_min, 10) || 60)),
    link, gravacao_url: gravacao, gravacao_lesson_id: s(d.gravacao_lesson_id, 40), status, produtos, publicada: d.publicada === true ? 1 : 0, novidades };
}
function salvarLive(produtor, d) {
  const v = validarLive(d);
  for (const pid of v.produtos) {
    const p = ct.Produtos.obter(pid);
    if (!p || p.producer_id !== produtor.id) throw erro(`live: o produto ${pid} não é deste produtor.`);
  }
  const id = s(d.id, 40) || novoId();
  const ja = db.prepare('SELECT producer_id FROM lives WHERE id = ?').get(id);
  if (ja && ja.producer_id !== produtor.id) throw erro('Live de outro produtor.', 403);
  if (ja) {
    db.prepare(`UPDATE lives SET titulo = ?, descricao = ?, inicio_em = ?, duracao_min = ?, link = ?, gravacao_url = ?, gravacao_lesson_id = ?, status = ?, produtos = ?,
      publicada = ?, novidades = ?, atualizado_em = ? WHERE id = ?`)
      .run(v.titulo, v.descricao, v.inicio_em, v.duracao_min, v.link, v.gravacao_url, v.gravacao_lesson_id, v.status, j.str(v.produtos), v.publicada, j.str(v.novidades), nowISO(), id);
  } else {
    db.prepare(`INSERT INTO lives (id, producer_id, titulo, descricao, inicio_em, duracao_min, link, gravacao_url, gravacao_lesson_id, status, produtos, publicada, novidades, lembrete_em, criado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`)
      .run(id, produtor.id, v.titulo, v.descricao, v.inicio_em, v.duracao_min, v.link, v.gravacao_url, v.gravacao_lesson_id, v.status, j.str(v.produtos), v.publicada, j.str(v.novidades), nowISO(), nowISO());
  }
  return { id, ...v };
}
// pode assistir: membro da casa; se a live é de produtos específicos, só quem tem acesso a um deles
function podeAssistir(usuario, live) {
  if (moderador(usuario, live.producer_id)) return true;
  if (!membro(usuario, live.producer_id)) return false;
  const produtos = j.parse(live.produtos, []);
  return !produtos.length || produtos.some(pid => ct.temAcesso(usuario.id, pid));
}
function livePublica(l, usuario) {
  const pode = podeAssistir(usuario, l);
  const inicio = Date.parse(l.inicio_em), agora = Date.now();
  // o link aparece a partir de 30 min antes para quem pode assistir — antes disso, só o "inscreva-se"
  const linkLiberado = pode && l.link && (agora >= inicio - 30 * 60e3 || moderador(usuario, l.producer_id)) && l.status !== 'cancelada';
  const inscrito = !!db.prepare('SELECT 1 FROM live_inscricoes WHERE live_id = ? AND user_id = ?').get(l.id, usuario.id);
  return { id: l.id, titulo: l.titulo, descricao: l.descricao, inicio_em: l.inicio_em, duracao_min: l.duracao_min, status: l.status, publicada: !!l.publicada,
    pode_assistir: pode, link: linkLiberado ? l.link : '', gravacao_url: pode ? l.gravacao_url : '', gravacao_lesson_id: pode ? l.gravacao_lesson_id : '',
    inscrito, inscritos: db.prepare('SELECT COUNT(*) n FROM live_inscricoes WHERE live_id = ?').get(l.id).n,
    novidades: j.parse(l.novidades, []), moderador: moderador(usuario, l.producer_id) };
}
function lives(usuario) {
  const casas = casasDoUsuario(usuario).map(c => c.producer_id);
  if (!casas.length) return [];
  const ph = casas.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM lives WHERE producer_id IN (${ph}) ORDER BY inicio_em DESC`).all(...casas)
    .filter(l => l.publicada || moderador(usuario, l.producer_id))
    .filter(l => podeAssistir(usuario, l) || moderador(usuario, l.producer_id))
    .map(l => livePublica(l, usuario));
}
function liveVisivel(usuario, id) {
  const l = db.prepare('SELECT * FROM lives WHERE id = ?').get(s(id, 40));
  if (!l || !(l.publicada || moderador(usuario, l.producer_id)) || !podeAssistir(usuario, l)) throw erro('Live não encontrada.', 404);
  return l;
}
function inscrever(usuario, id, sim = true) {
  const l = liveVisivel(usuario, id);
  if (sim) db.prepare('INSERT INTO live_inscricoes (live_id, user_id, criado_em) VALUES (?, ?, ?) ON CONFLICT(live_id, user_id) DO NOTHING').run(l.id, usuario.id, nowISO());
  else db.prepare('DELETE FROM live_inscricoes WHERE live_id = ? AND user_id = ?').run(l.id, usuario.id);
  return livePublica(l, usuario);
}
function perguntas(usuario, id) {
  const l = liveVisivel(usuario, id);
  const mod = moderador(usuario, l.producer_id);
  return db.prepare(`SELECT q.id, q.texto, q.votos, q.status, q.criado_em, q.user_id, u.nome FROM live_perguntas q JOIN users u ON u.id = q.user_id
    WHERE q.live_id = ? ${mod ? '' : "AND q.status != 'oculta'"} ORDER BY q.votos DESC, q.criado_em`).all(l.id).map(q => ({
    id: q.id, texto: q.texto, votos: q.votos, status: q.status, autor: nomeCurto(q.nome), minha: q.user_id === usuario.id, criado_em: q.criado_em,
    votei: !!db.prepare('SELECT 1 FROM live_votos WHERE pergunta_id = ? AND user_id = ?').get(q.id, usuario.id),
  }));
}
function perguntar(usuario, id, texto) {
  const l = liveVisivel(usuario, id);
  if (l.status === 'encerrada' || l.status === 'cancelada') throw erro('As perguntas desta live estão encerradas.', 409);
  const t = s(texto, 600);
  if (t.length < 10) throw erro('Escreva a pergunta com um pouco mais de detalhe.');
  const n = db.prepare('SELECT COUNT(*) n FROM live_perguntas WHERE live_id = ? AND user_id = ?').get(l.id, usuario.id).n;
  if (n >= 3) throw erro('Cada aluno pode enviar até 3 perguntas por live — vote nas dos colegas.', 429);
  db.prepare("INSERT INTO live_perguntas (id, live_id, user_id, texto, votos, status, criado_em) VALUES (?, ?, ?, ?, 0, 'aberta', ?)").run(novoId(), l.id, usuario.id, t, nowISO());
  return perguntas(usuario, id);
}
function votar(usuario, perguntaId) {
  const q = db.prepare('SELECT * FROM live_perguntas WHERE id = ?').get(s(perguntaId, 40));
  if (!q) throw erro('Pergunta não encontrada.', 404);
  liveVisivel(usuario, q.live_id);
  if (q.user_id === usuario.id) throw erro('Não dá para votar na própria pergunta.');
  transacao(() => {
    const ja = db.prepare('SELECT 1 FROM live_votos WHERE pergunta_id = ? AND user_id = ?').get(q.id, usuario.id);
    if (ja) db.prepare('DELETE FROM live_votos WHERE pergunta_id = ? AND user_id = ?').run(q.id, usuario.id);
    else db.prepare('INSERT INTO live_votos (pergunta_id, user_id) VALUES (?, ?)').run(q.id, usuario.id);
    db.prepare('UPDATE live_perguntas SET votos = (SELECT COUNT(*) FROM live_votos WHERE pergunta_id = ?) WHERE id = ?').run(q.id, q.id);
  });
  return perguntas(usuario, q.live_id);
}
function moderarPergunta(usuario, perguntaId, status) {
  const q = db.prepare('SELECT q.*, l.producer_id FROM live_perguntas q JOIN lives l ON l.id = q.live_id WHERE q.id = ?').get(s(perguntaId, 40));
  if (!q || !moderador(usuario, q.producer_id)) throw erro('Sem permissão.', 403);
  if (!['aberta', 'respondida', 'oculta'].includes(status)) throw erro('status: aberta|respondida|oculta');
  db.prepare('UPDATE live_perguntas SET status = ? WHERE id = ?').run(status, q.id);
  return perguntas(usuario, q.live_id);
}
// destinatários de um aviso: quem pode assistir (lista calculada, o envio é decisão explícita)
function destinatarios(live) {
  const produtos = j.parse(live.produtos, []);
  const q = produtos.length
    ? db.prepare(`SELECT DISTINCT e.user_id id FROM enrollments e WHERE e.status = 'ativa' AND e.product_id IN (${produtos.map(() => '?').join(',')})
        UNION SELECT DISTINCT s.user_id FROM subscriptions s JOIN club_items ci ON ci.club_product_id = s.product_id WHERE s.status = 'ativa' AND ci.product_id IN (${produtos.map(() => '?').join(',')})`).all(...produtos, ...produtos)
    : db.prepare(`SELECT DISTINCT e.user_id id FROM enrollments e JOIN products p ON p.id = e.product_id WHERE e.status = 'ativa' AND p.producer_id = ?
        UNION SELECT DISTINCT s.user_id FROM subscriptions s JOIN products p ON p.id = s.product_id WHERE s.status = 'ativa' AND p.producer_id = ?`).all(live.producer_id, live.producer_id);
  return q.map(x => x.id).filter(id => id !== live.producer_id);
}
// lembrete automático só para quem SE INSCREVEU (pediu para ser lembrado), 1 vez, ~1h antes
function lembretesPendentes(agora = Date.now()) {
  return db.prepare("SELECT * FROM lives WHERE publicada = 1 AND status = 'agendada' AND lembrete_em = ''").all()
    .filter(l => { const t = Date.parse(l.inicio_em); return t - agora <= 70 * 60e3 && t - agora > 0; });
}
function marcarLembrete(liveId) { db.prepare('UPDATE lives SET lembrete_em = ? WHERE id = ?').run(nowISO(), liveId); }
function inscritos(liveId) { return db.prepare('SELECT user_id FROM live_inscricoes WHERE live_id = ?').all(liveId).map(x => x.user_id); }

// ---------------------------------------------------------------------
// COMUNIDADE
// ---------------------------------------------------------------------
const AREAS = [
  { id: 'duvidas', nome: 'Dúvidas', icone: '❓', desc: 'Travou em alguma aula? Pergunte aqui.' },
  { id: 'prompts', nome: 'Prompts', icone: '🧩', desc: 'Compartilhe prompts que funcionaram.' },
  { id: 'projetos', nome: 'Projetos', icone: '🏗️', desc: 'O seu projeto final e os dos colegas.' },
  { id: 'ferramentas', nome: 'Ferramentas', icone: '🛠️', desc: 'Apps, skills, conectores e como usar.' },
  { id: 'novidades', nome: 'Novidades de IA', icone: '📰', desc: 'O que mudou — com a fonte.' },
  { id: 'mostre', nome: 'Mostre o que você criou', icone: '🎉', desc: 'Resultados reais, com antes e depois.' },
  { id: 'oportunidades', nome: 'Oportunidades', icone: '💼', desc: 'Vagas, parcerias e projetos. Sem spam.' },
];
const REGRAS = [
  'Respeito sempre: critique ideias, nunca pessoas.',
  'Nada de dado pessoal de terceiros (CPF, telefone, nome de cliente, processo identificado). Anonimize.',
  'Não compartilhe senha, chave de API, token nem certificado — nem em print.',
  'Dúvida jurídica sobre caso real não é respondida aqui: a comunidade discute método, não dá parecer.',
  'Divulgação só na área Oportunidades, com transparência. Spam é removido.',
  'Conteúdo de terceiros: cite a fonte. Material pago do curso não se reproduz inteiro.',
];
const LIMITE_DIA = 20; // tópicos + respostas por aluno por dia (anti-spam)
const DENUNCIAS_OCULTAM = 3;

function exigirMembro(usuario, producerId) {
  if (!membro(usuario, producerId)) throw erro('A comunidade é para alunos da Academy. Matricule-se em um curso para participar.', 403);
}
function cotaDia(usuario) {
  const hoje = new Date().toISOString().slice(0, 10);
  const n = db.prepare('SELECT (SELECT COUNT(*) FROM com_topicos WHERE user_id = ? AND criado_em >= ?) + (SELECT COUNT(*) FROM com_respostas WHERE user_id = ? AND criado_em >= ?) n')
    .get(usuario.id, hoje, usuario.id, hoje).n;
  if (n >= LIMITE_DIA) throw erro(`Limite de ${LIMITE_DIA} publicações por dia atingido. Volte amanhã.`, 429);
}
function texto(t, min, max, rotulo) {
  const v = s(t, max);
  if (v.length < min) throw erro(`${rotulo}: escreva pelo menos ${min} caracteres.`);
  return v;
}
// trava de segredo: quem cola chave/senha não publica (o aluno agradece depois)
function semSegredo(t) {
  if (/\b(sk-[a-z0-9_-]{16,}|sk-ant-[a-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{20,})/i.test(t)) throw erro('Parece que o texto tem uma chave de API ou token. Remova antes de publicar.');
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(t)) throw erro('Parece que o texto tem um CPF. Anonimize antes de publicar.');
  return t;
}
function curtidas(tipo, id, uid) {
  return { n: db.prepare('SELECT COUNT(*) n FROM com_curtidas WHERE alvo_tipo = ? AND alvo_id = ?').get(tipo, id).n,
    minha: !!db.prepare('SELECT 1 FROM com_curtidas WHERE alvo_tipo = ? AND alvo_id = ? AND user_id = ?').get(tipo, id, uid) };
}
function listarTopicos(usuario, producerId, { area = '', busca = '', produto = '' } = {}) {
  exigirMembro(usuario, producerId);
  const mod = moderador(usuario, producerId);
  const cond = ['t.producer_id = ?', mod ? "t.status != 'removido'" : "t.status = 'visivel'"], args = [producerId];
  if (area) { cond.push('t.area = ?'); args.push(s(area, 30)); }
  if (produto) { cond.push('t.product_id = ?'); args.push(s(produto, 40)); }
  if (busca) { cond.push('(t.titulo LIKE ? OR t.texto LIKE ?)'); args.push(`%${s(busca, 80)}%`, `%${s(busca, 80)}%`); }
  return {
    areas: AREAS.map(a => ({ ...a, topicos: db.prepare("SELECT COUNT(*) n FROM com_topicos WHERE producer_id = ? AND area = ? AND status = 'visivel'").get(producerId, a.id).n })),
    regras: REGRAS, moderador: mod,
    topicos: db.prepare(`SELECT t.*, u.nome, p.titulo produto FROM com_topicos t JOIN users u ON u.id = t.user_id LEFT JOIN products p ON p.id = t.product_id
      WHERE ${cond.join(' AND ')} ORDER BY t.fixado DESC, t.ultimo_em DESC LIMIT 60`).all(...args).map(t => ({
      id: t.id, area: t.area, titulo: t.titulo, resumo: s(t.texto, 220), autor: nomeCurto(t.nome), minha: t.user_id === usuario.id, produto: t.produto || '',
      respostas: t.respostas_n, resolvido: !!t.solucao_id, fixado: !!t.fixado, status: t.status, criado_em: t.criado_em, ultimo_em: t.ultimo_em,
      curtidas: curtidas('topico', t.id, usuario.id).n,
    })),
  };
}
function topico(usuario, id) {
  const t = db.prepare('SELECT t.*, u.nome, p.titulo produto FROM com_topicos t JOIN users u ON u.id = t.user_id LEFT JOIN products p ON p.id = t.product_id WHERE t.id = ?').get(s(id, 40));
  if (!t || t.status === 'removido') throw erro('Tópico não encontrado.', 404);
  exigirMembro(usuario, t.producer_id);
  const mod = moderador(usuario, t.producer_id);
  if (t.status !== 'visivel' && !mod && t.user_id !== usuario.id) throw erro('Tópico não encontrado.', 404);
  const resp = db.prepare(`SELECT r.*, u.nome FROM com_respostas r JOIN users u ON u.id = r.user_id WHERE r.topico_id = ? ${mod ? "AND r.status != 'removido'" : "AND r.status = 'visivel'"} ORDER BY r.criado_em`).all(t.id);
  return { id: t.id, producer_id: t.producer_id, area: t.area, titulo: t.titulo, texto: t.texto, autor: nomeCurto(t.nome), minha: t.user_id === usuario.id, produto: t.produto || '',
    status: t.status, fixado: !!t.fixado, solucao_id: t.solucao_id, criado_em: t.criado_em, moderador: mod, curtidas: curtidas('topico', t.id, usuario.id),
    autor_equipe: moderador({ id: t.user_id, papeis: [] }, t.producer_id),
    respostas: resp.map(r => ({ id: r.id, texto: r.texto, autor: nomeCurto(r.nome), minha: r.user_id === usuario.id, status: r.status, criado_em: r.criado_em,
      solucao: r.id === t.solucao_id, equipe: r.user_id === t.producer_id, curtidas: curtidas('resposta', r.id, usuario.id) })) };
}
function criarTopico(usuario, producerId, d = {}) {
  exigirMembro(usuario, producerId);
  cotaDia(usuario);
  const area = AREAS.find(a => a.id === s(d.area, 30));
  if (!area) throw erro('Escolha a área do tópico.');
  if (area.id === 'novidades' && !/https:\/\//.test(s(d.texto, 6000))) throw erro('Em Novidades de IA, inclua o link da fonte (https://).');
  const titulo = semSegredo(texto(d.titulo, 8, 160, 'Título'));
  const corpo = semSegredo(texto(d.texto, 20, 6000, 'Texto'));
  let produto = '';
  if (d.product_id) {
    const p = ct.Produtos.obter(s(d.product_id, 40));
    if (p && p.producer_id === producerId) produto = p.id;
  }
  const id = novoId();
  db.prepare(`INSERT INTO com_topicos (id, producer_id, area, product_id, user_id, titulo, texto, status, fixado, solucao_id, respostas_n, denuncias, criado_em, ultimo_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'visivel', 0, '', 0, 0, ?, ?)`).run(id, producerId, area.id, produto, usuario.id, titulo, corpo, nowISO(), nowISO());
  return topico(usuario, id);
}
function responder(usuario, topicoId, textoResp) {
  const t = db.prepare('SELECT * FROM com_topicos WHERE id = ?').get(s(topicoId, 40));
  if (!t || t.status !== 'visivel') throw erro('Tópico não encontrado ou fechado.', 404);
  exigirMembro(usuario, t.producer_id);
  cotaDia(usuario);
  const corpo = semSegredo(texto(textoResp, 5, 4000, 'Resposta'));
  transacao(() => {
    db.prepare("INSERT INTO com_respostas (id, topico_id, user_id, texto, status, denuncias, criado_em) VALUES (?, ?, ?, ?, 'visivel', 0, ?)").run(novoId(), t.id, usuario.id, corpo, nowISO());
    db.prepare("UPDATE com_topicos SET respostas_n = (SELECT COUNT(*) FROM com_respostas WHERE topico_id = ? AND status = 'visivel'), ultimo_em = ? WHERE id = ?").run(t.id, nowISO(), t.id);
  });
  // avisa o autor do tópico (uma notificação interna, não uma mensagem em massa)
  if (t.user_id !== usuario.id) {
    try { require('./emails').Notificacoes.criar(t.user_id, '💬 Nova resposta na comunidade', `Responderam ao seu tópico "${s(t.titulo, 80)}".`, '/academy/app'); } catch (_) {}
  }
  return topico(usuario, t.id);
}
function curtir(usuario, tipo, id) {
  if (!['topico', 'resposta'].includes(tipo)) throw erro('Tipo inválido.');
  const alvo = tipo === 'topico' ? db.prepare('SELECT producer_id, id, user_id FROM com_topicos WHERE id = ?').get(s(id, 40))
    : db.prepare('SELECT t.producer_id, r.id, r.user_id FROM com_respostas r JOIN com_topicos t ON t.id = r.topico_id WHERE r.id = ?').get(s(id, 40));
  if (!alvo) throw erro('Não encontrado.', 404);
  exigirMembro(usuario, alvo.producer_id);
  const ja = db.prepare('SELECT 1 FROM com_curtidas WHERE alvo_tipo = ? AND alvo_id = ? AND user_id = ?').get(tipo, alvo.id, usuario.id);
  if (ja) db.prepare('DELETE FROM com_curtidas WHERE alvo_tipo = ? AND alvo_id = ? AND user_id = ?').run(tipo, alvo.id, usuario.id);
  else db.prepare('INSERT INTO com_curtidas (alvo_tipo, alvo_id, user_id, criado_em) VALUES (?, ?, ?, ?)').run(tipo, alvo.id, usuario.id, nowISO());
  return curtidas(tipo, alvo.id, usuario.id);
}
// o autor do tópico (ou o moderador) marca a resposta que resolveu
function marcarSolucao(usuario, topicoId, respostaId) {
  const t = db.prepare('SELECT * FROM com_topicos WHERE id = ?').get(s(topicoId, 40));
  if (!t) throw erro('Tópico não encontrado.', 404);
  if (t.user_id !== usuario.id && !moderador(usuario, t.producer_id)) throw erro('Só quem perguntou pode marcar a solução.', 403);
  const r = respostaId ? db.prepare("SELECT id FROM com_respostas WHERE id = ? AND topico_id = ? AND status = 'visivel'").get(s(respostaId, 40), t.id) : null;
  if (respostaId && !r) throw erro('Resposta não encontrada.', 404);
  db.prepare('UPDATE com_topicos SET solucao_id = ? WHERE id = ?').run(r ? r.id : '', t.id);
  return topico(usuario, t.id);
}
function denunciar(usuario, tipo, id, motivo) {
  if (!['topico', 'resposta'].includes(tipo)) throw erro('Tipo inválido.');
  const tabela = tipo === 'topico' ? 'com_topicos' : 'com_respostas';
  const alvo = tipo === 'topico' ? db.prepare('SELECT id, producer_id, user_id FROM com_topicos WHERE id = ?').get(s(id, 40))
    : db.prepare('SELECT r.id, t.producer_id, r.user_id FROM com_respostas r JOIN com_topicos t ON t.id = r.topico_id WHERE r.id = ?').get(s(id, 40));
  if (!alvo) throw erro('Não encontrado.', 404);
  exigirMembro(usuario, alvo.producer_id);
  if (alvo.user_id === usuario.id) throw erro('Você não pode denunciar o próprio conteúdo — edite ou peça remoção.');
  const ja = db.prepare('SELECT 1 FROM com_denuncias WHERE alvo_tipo = ? AND alvo_id = ? AND user_id = ?').get(tipo, alvo.id, usuario.id);
  if (ja) return { ok: true, ja_denunciado: true };
  db.prepare("INSERT INTO com_denuncias (id, alvo_tipo, alvo_id, producer_id, user_id, motivo, status, criado_em) VALUES (?, ?, ?, ?, ?, ?, 'aberta', ?)")
    .run(novoId(), tipo, alvo.id, alvo.producer_id, usuario.id, s(motivo, 400), nowISO());
  const n = db.prepare("SELECT COUNT(*) n FROM com_denuncias WHERE alvo_tipo = ? AND alvo_id = ? AND status = 'aberta'").get(tipo, alvo.id).n;
  db.prepare(`UPDATE ${tabela} SET denuncias = ? WHERE id = ?`).run(n, alvo.id);
  // várias denúncias escondem na hora; o moderador decide depois se volta
  if (n >= DENUNCIAS_OCULTAM) db.prepare(`UPDATE ${tabela} SET status = 'oculto' WHERE id = ? AND status = 'visivel'`).run(alvo.id);
  try { require('./emails').Notificacoes.criar(alvo.producer_id, '🚩 Denúncia na comunidade', `${n} denúncia(s) em um ${tipo}. Revise na comunidade.`, '/academy/app'); } catch (_) {}
  return { ok: true, denuncias: n, ocultado: n >= DENUNCIAS_OCULTAM };
}
function moderar(usuario, tipo, id, acao) {
  const tabela = tipo === 'topico' ? 'com_topicos' : tipo === 'resposta' ? 'com_respostas' : '';
  if (!tabela) throw erro('Tipo inválido.');
  const alvo = tipo === 'topico' ? db.prepare('SELECT id, producer_id, id topico_id FROM com_topicos WHERE id = ?').get(s(id, 40))
    : db.prepare('SELECT r.id, t.producer_id, r.topico_id FROM com_respostas r JOIN com_topicos t ON t.id = r.topico_id WHERE r.id = ?').get(s(id, 40));
  if (!alvo || !moderador(usuario, alvo.producer_id)) throw erro('Sem permissão.', 403);
  const mapa = { ocultar: 'oculto', mostrar: 'visivel', remover: 'removido' };
  if (acao === 'fixar' || acao === 'desafixar') {
    if (tipo !== 'topico') throw erro('Só tópico se fixa.');
    db.prepare('UPDATE com_topicos SET fixado = ? WHERE id = ?').run(acao === 'fixar' ? 1 : 0, alvo.id);
  } else if (mapa[acao]) {
    db.prepare(`UPDATE ${tabela} SET status = ? WHERE id = ?`).run(mapa[acao], alvo.id);
    db.prepare("UPDATE com_denuncias SET status = 'resolvida' WHERE alvo_tipo = ? AND alvo_id = ?").run(tipo, alvo.id);
    if (tipo === 'resposta') db.prepare("UPDATE com_topicos SET respostas_n = (SELECT COUNT(*) FROM com_respostas WHERE topico_id = ? AND status = 'visivel') WHERE id = ?").run(alvo.topico_id, alvo.topico_id);
  } else throw erro('Ação: ocultar|mostrar|remover|fixar|desafixar');
  return { ok: true };
}
// o autor apaga o que escreveu (a resposta some; o tópico vira "removido pelo autor")
function apagarMeu(usuario, tipo, id) {
  if (tipo === 'topico') {
    const n = db.prepare("UPDATE com_topicos SET status = 'removido', texto = '', titulo = '[removido pelo autor]' WHERE id = ? AND user_id = ?").run(s(id, 40), usuario.id).changes;
    if (!n) throw erro('Não encontrado.', 404);
  } else {
    const r = db.prepare('SELECT topico_id FROM com_respostas WHERE id = ? AND user_id = ?').get(s(id, 40), usuario.id);
    if (!r) throw erro('Não encontrado.', 404);
    db.prepare("UPDATE com_respostas SET status = 'removido', texto = '' WHERE id = ?").run(s(id, 40));
    db.prepare("UPDATE com_topicos SET respostas_n = (SELECT COUNT(*) FROM com_respostas WHERE topico_id = ? AND status = 'visivel') WHERE id = ?").run(r.topico_id, r.topico_id);
  }
  return { ok: true };
}
function denunciasAbertas(usuario, producerId) {
  if (!moderador(usuario, producerId)) throw erro('Sem permissão.', 403);
  return db.prepare("SELECT alvo_tipo, alvo_id, COUNT(*) n, MAX(criado_em) ultima FROM com_denuncias WHERE producer_id = ? AND status = 'aberta' GROUP BY alvo_tipo, alvo_id ORDER BY n DESC").all(producerId)
    .map(d => {
      const x = d.alvo_tipo === 'topico' ? db.prepare('SELECT id topico_id, titulo, texto, status FROM com_topicos WHERE id = ?').get(d.alvo_id)
        : db.prepare('SELECT r.topico_id, t.titulo, r.texto, r.status FROM com_respostas r JOIN com_topicos t ON t.id = r.topico_id WHERE r.id = ?').get(d.alvo_id);
      return { ...d, topico_id: x && x.topico_id, titulo: x && x.titulo, trecho: x ? s(x.texto, 200) : '', status: x && x.status,
        motivos: db.prepare("SELECT motivo FROM com_denuncias WHERE alvo_tipo = ? AND alvo_id = ? AND status = 'aberta'").all(d.alvo_tipo, d.alvo_id).map(m => m.motivo).filter(Boolean) };
    });
}

// ---------------------------------------------------------------------
// LGPD: o que o aluno escreveu aqui
// ---------------------------------------------------------------------
function exportar(userId) {
  return {
    comunidade_topicos: db.prepare('SELECT area, titulo, texto, status, criado_em FROM com_topicos WHERE user_id = ?').all(userId),
    comunidade_respostas: db.prepare('SELECT topico_id, texto, status, criado_em FROM com_respostas WHERE user_id = ?').all(userId),
    live_perguntas: db.prepare('SELECT live_id, texto, criado_em FROM live_perguntas WHERE user_id = ?').all(userId),
  };
}
function apagarDoTitular(userId) {
  db.prepare("UPDATE com_topicos SET status = 'removido', texto = '', titulo = '[removido]' WHERE user_id = ?").run(userId);
  db.prepare("UPDATE com_respostas SET status = 'removido', texto = '' WHERE user_id = ?").run(userId);
  db.prepare('DELETE FROM live_perguntas WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM com_curtidas WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM live_inscricoes WHERE user_id = ?').run(userId);
}

module.exports = {
  FORMATOS, AREAS, REGRAS, membro, moderador, casasDoUsuario, nomeCurto, validarPassos, biblioteca,
  importarTrilhas, statusTrilha, trilhasPublicas, trilhaPorSlug,
  salvarLive, lives, liveVisivel, livePublica, inscrever, perguntas, perguntar, votar, moderarPergunta, destinatarios, lembretesPendentes, marcarLembrete, inscritos,
  listarTopicos, topico, criarTopico, responder, curtir, marcarSolucao, denunciar, moderar, apagarMeu, denunciasAbertas,
  exportar, apagarDoTitular,
};
