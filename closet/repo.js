// =====================================================================
// Closet Club — núcleo de domínio.
// Aqui moram as três regras que sustentam o negócio:
//   1. PREÇO   — orcamento() é a única fonte de verdade do valor.
//   2. AGENDA  — disponibilidade por sobreposição de bloqueios (+ higienização).
//   3. ESCROW  — a máquina de estados da reserva (dinheiro só solta no fim).
// Rotas nunca calculam dinheiro nem mudam status "na mão": passam por aqui.
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const {
  db, transacao, nowISO, hojeISO, novoId, novoToken, novoCodigo, periodoAtual, j,
  diaValido, diasEntre, somaDias,
} = require('./db');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const n = (v, padrao = 0) => { const x = Number(v); return Number.isFinite(x) ? x : padrao; };
const cent = (v) => Math.max(0, Math.round(n(v, 0)));
const slugify = (t) => s(t, 120).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

// ---------------------------------------------------------------------
// Catálogo de domínio (usado na vitrine, nos filtros e na IA)
// ---------------------------------------------------------------------
const OCASIOES = [
  { slug: 'casamento', nome: 'Casamento', emoji: '💍' },
  { slug: 'formatura', nome: 'Formatura', emoji: '🎓' },
  { slug: 'executivo', nome: 'Executivo', emoji: '💼' },
  { slug: 'noite', nome: 'Noite', emoji: '🌙' },
  { slug: 'jantar', nome: 'Jantar', emoji: '🍷' },
  { slug: 'praia', nome: 'Praia', emoji: '🌊' },
  { slug: 'festival', nome: 'Festival', emoji: '🎪' },
  { slug: 'reveillon', nome: 'Réveillon', emoji: '🎆' },
  { slug: 'natal', nome: 'Natal', emoji: '🎄' },
  { slug: 'sessao-fotos', nome: 'Sessão de fotos', emoji: '📸' },
];
const CATEGORIAS = ['vestido', 'terno', 'saia', 'blazer', 'bolsa', 'sapato', 'joia', 'acessorio', 'infantil', 'fantasia', 'gestante', 'plus'];
const ESTILOS = ['classico', 'moderno', 'boho', 'minimalista', 'romantico', 'street', 'alfaiataria'];
const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'unico'];
const CONDICOES = ['novo', 'seminovo', 'usado'];

// Estados da reserva. `fluxo` = caminho feliz; os demais são saídas laterais.
const STATUS_BOOKING = {
  aguardando_pagamento: 'Aguardando pagamento',
  pago_bloqueado: 'Pago — valor bloqueado',
  confirmado: 'Confirmado pelo proprietário',
  retirado: 'Peça com o cliente',
  devolvido: 'Devolvida — em vistoria',
  concluido: 'Concluída — repasse liberado',
  recusado: 'Recusada pelo proprietário',
  cancelado: 'Cancelada',
  expirado: 'Expirada (sem pagamento)',
  em_disputa: 'Em disputa',
  reembolsado: 'Reembolsada',
};
const ABERTOS = ['pago_bloqueado', 'confirmado', 'retirado', 'devolvido', 'em_disputa'];

// ---------------------------------------------------------------------
// Configuração da plataforma
// ---------------------------------------------------------------------
const CONFIG_PADRAO = {
  comissao_pct: { valor: '20', descricao: 'Comissão da plataforma sobre a locação (%). Não incide sobre caução.' },
  prazo_confirmacao_h: { valor: '24', descricao: 'Horas que o proprietário tem para confirmar antes do estorno automático.' },
  janela_vistoria_h: { valor: '24', descricao: 'Horas após a devolução em que o proprietário pode abrir disputa por dano.' },
  seguro_pct: { valor: '8', descricao: 'Seguro opcional: % sobre o valor de reposição da peça.' },
  comissao_servico_pct: { valor: '15', descricao: 'Comissão da plataforma sobre serviços de parceiros (lavanderia, foto, entrega).' },
  cancelamento: {
    valor: JSON.stringify([{ dias: 7, reembolso_pct: 100 }, { dias: 3, reembolso_pct: 50 }, { dias: 0, reembolso_pct: 0 }]),
    descricao: 'Política de cancelamento pelo cliente: reembolso por antecedência (em dias).',
  },
  pix_expira_min: { valor: '30', descricao: 'Minutos de validade do Pix antes de expirar a reserva.' },
  cidade_padrao: { valor: 'Brasília', descricao: 'Cidade usada na vitrine quando o visitante não escolheu nenhuma.' },
};

const Config = {
  todos() {
    const linhas = db.prepare('SELECT * FROM config ORDER BY chave').all();
    return linhas.map((l) => ({ chave: l.chave, valor: l.valor, descricao: l.descricao }));
  },
  get(chave, padrao = '') {
    const r = db.prepare('SELECT valor FROM config WHERE chave = ?').get(String(chave));
    return r ? r.valor : padrao;
  },
  // Atenção: Number('') é 0 e é finito — sem este guarda, chave ausente
  // devolveria 0 em vez do padrão, e um 0 silencioso em percentual de
  // comissão é receita perdida sem ninguém perceber.
  num(chave, padrao = 0) { const v = Config.get(chave, ''); return v === '' ? padrao : n(v, padrao); },
  json(chave, padrao) { return j.parse(Config.get(chave, ''), padrao); },
  set(chave, valor) {
    db.prepare(`INSERT INTO config (chave, valor, descricao, atualizado_em) VALUES (?,?,'',?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`)
      .run(String(chave), String(valor == null ? '' : valor), nowISO());
    return { chave, valor };
  },
};

// ---------------------------------------------------------------------
// Planos (Premium do anunciante)
// ---------------------------------------------------------------------
const PLANOS_SEED = [
  {
    slug: 'free', nome: 'Grátis', preco_centavos: 0, comissao_pct: 0, ordem: 1, // 0 = usa o padrão da plataforma
    descricao: 'Anuncie sem mensalidade. A plataforma só ganha quando você ganha.',
    limites: { pecas: 10, fotos_por_peca: 5, videos: 0, destaques_mes: 0, looks: 2 },
    flags: { ia: false, analytics: false, agenda_auto: false, video: false, destaque: false, sem_fundo: false, api: false },
  },
  {
    slug: 'premium', nome: 'Premium', preco_centavos: 3900, comissao_pct: 0, ordem: 2, // 0 = usa o padrão da plataforma
    descricao: 'Mais destaque, mais fotos, vídeo, analytics e a IA trabalhando por você.',
    limites: { pecas: 0, fotos_por_peca: 15, videos: 3, destaques_mes: 5, looks: 0 },
    flags: { ia: true, analytics: true, agenda_auto: true, video: true, destaque: true, sem_fundo: true, api: true },
  },
];

const Planos = {
  listar({ incluirInativos = false } = {}) {
    const q = incluirInativos ? 'SELECT * FROM plans ORDER BY ordem' : 'SELECT * FROM plans WHERE ativo = 1 ORDER BY ordem';
    return db.prepare(q).all().map(mapPlano);
  },
  porSlug(slug) { const p = db.prepare('SELECT * FROM plans WHERE slug = ?').get(s(slug, 40)); return p ? mapPlano(p) : null; },
  atualizar(id, d) {
    const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(s(id, 40));
    if (!p) throw new Error('Plano não encontrado.');
    db.prepare('UPDATE plans SET nome=?, descricao=?, preco_centavos=?, comissao_pct=?, limites=?, flags=?, ativo=?, atualizado_em=? WHERE id=?')
      .run(s(d.nome, 60) || p.nome, s(d.descricao, 300) || p.descricao,
        d.preco_centavos == null ? p.preco_centavos : cent(d.preco_centavos),
        d.comissao_pct == null ? p.comissao_pct : n(d.comissao_pct, p.comissao_pct),
        d.limites ? j.str(d.limites) : p.limites, d.flags ? j.str(d.flags) : p.flags,
        d.ativo == null ? p.ativo : (d.ativo ? 1 : 0), nowISO(), p.id);
    return Planos.porSlug(p.slug);
  },
};
const mapPlano = (p) => ({ ...p, limites: j.parse(p.limites, {}), flags: j.parse(p.flags, {}), ativo: !!p.ativo });

function semear() {
  for (const p of PLANOS_SEED) {
    const ex = db.prepare('SELECT id FROM plans WHERE slug = ?').get(p.slug);
    if (ex) { // preserva preço/comissão já editados no painel; só repõe o descritivo
      db.prepare('UPDATE plans SET nome=?, descricao=?, limites=?, flags=?, ordem=? WHERE id=?')
        .run(p.nome, p.descricao, j.str(p.limites), j.str(p.flags), p.ordem, ex.id);
      continue;
    }
    db.prepare('INSERT INTO plans (id, slug, nome, descricao, preco_centavos, comissao_pct, limites, flags, ordem, ativo, criado_em) VALUES (?,?,?,?,?,?,?,?,?,1,?)')
      .run(novoId(), p.slug, p.nome, p.descricao, p.preco_centavos, p.comissao_pct, j.str(p.limites), j.str(p.flags), p.ordem, nowISO());
  }
  for (const [chave, v] of Object.entries(CONFIG_PADRAO)) {
    if (db.prepare('SELECT 1 FROM config WHERE chave = ?').get(chave)) continue;
    db.prepare('INSERT INTO config (chave, valor, descricao, atualizado_em) VALUES (?,?,?,?)').run(chave, v.valor, v.descricao, nowISO());
  }
}

// entitlements do usuário conforme o plano vigente.
// Comissão: `plans.comissao_pct = 0` significa "usa o padrão da plataforma"
// (config `comissao_pct`). Assim existe UMA fonte de verdade — mudar a
// comissão no painel vale para todo mundo — e um plano ainda pode fixar a
// sua própria taxa quando o Augusto quiser diferenciar.
function entitlements(user) {
  const plano = Planos.porSlug(user && user.plano === 'premium' && (!user.premium_ate || user.premium_ate >= nowISO()) ? 'premium' : 'free')
    || Planos.porSlug('free');
  return {
    plano: plano.slug, nome: plano.nome, limites: plano.limites, flags: plano.flags,
    comissao_pct: plano.comissao_pct > 0 ? plano.comissao_pct : Config.num('comissao_pct', 20),
  };
}

// ---------------------------------------------------------------------
// Eventos e auditoria
// ---------------------------------------------------------------------
function evento(userId, tipo, ref, dados) {
  db.prepare('INSERT INTO platform_events (id, user_id, tipo, ref, dados, quando) VALUES (?,?,?,?,?,?)')
    .run(novoId(), s(userId, 40), s(tipo, 60), s(ref, 80), j.str(dados || {}), nowISO());
}
const Auditoria = {
  registrar({ quem, acao, entidade, entidade_id, detalhe, ip } = {}) {
    db.prepare('INSERT INTO auditoria (id, quem, acao, entidade, entidade_id, detalhe, ip, quando) VALUES (?,?,?,?,?,?,?,?)')
      .run(novoId(), s(quem, 120), s(acao, 60), s(entidade, 40), s(entidade_id, 60), s(detalhe, 400), s(ip, 60), nowISO());
  },
  listar({ limite = 200 } = {}) { return db.prepare('SELECT * FROM auditoria ORDER BY quando DESC LIMIT ?').all(Math.min(n(limite, 200), 1000)); },
};

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
// Usuários
// ---------------------------------------------------------------------
const CAMPOS_PUBLICOS = 'id, nome, avatar_url, bio, cidade, uf, nota_media, num_avaliacoes, num_alugueis, resposta_min, verificado, criado_em';

const Users = {
  criar(d, { ip = '', origem = '' } = {}) {
    const email = s(d.email, 120).toLowerCase();
    const nome = s(d.nome, 120);
    if (!nome) throw new Error('Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
    if (String(d.senha || '').length < 8) throw new Error('A senha precisa de 8+ caracteres.');
    if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) throw new Error('Já existe uma conta com este e-mail.');
    if (!d.aceite_termos) throw new Error('É preciso aceitar os termos de uso e a política de privacidade.');
    const id = novoId();
    const agora = nowISO();
    // o código de indicação é do PERFIL de quem convida (users.codigo_indicacao);
    // `referrals` é o log de cada convite, não a fonte do código.
    const padrinho = d.indicacao
      ? (db.prepare("SELECT id FROM users WHERE codigo_indicacao = ? AND status = 'ativo'").get(s(d.indicacao, 40).toUpperCase()) || {}).id
      : '';
    db.prepare(`INSERT INTO users (id, nome, email, senha_hash, telefone, cidade, uf, papel, plano, aceite_termos_em, consentimento, origem, indicado_por, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,'usuario','free',?,?,?,?,?,?)`)
      .run(id, nome, email, bcrypt.hashSync(String(d.senha), 10), s(d.telefone, 30), s(d.cidade, 80), s(d.uf, 2).toUpperCase(),
        agora, j.str({ marketing: !!d.consent_marketing, dados: true, em: agora, ip }), s(origem || d.origem, 120), s(padrinho || '', 40), agora, agora);
    if (padrinho) {
      try { require('./crescimento').Indicacoes.registrar(padrinho, id, s(d.indicacao, 40)); } catch (_) {}
    }
    evento(id, 'user.criado', email, { origem: s(origem || d.origem, 120) });
    return Users.obter(id);
  },

  autenticar(email, senha) {
    const u = db.prepare("SELECT * FROM users WHERE lower(email) = ? AND status != 'excluido'").get(s(email, 120).toLowerCase());
    if (!u || !u.senha_hash || !bcrypt.compareSync(String(senha || ''), u.senha_hash)) return null;
    if (u.status === 'bloqueado') throw new Error('Conta bloqueada. Fale com o suporte.');
    db.prepare('UPDATE users SET ultimo_login = ? WHERE id = ?').run(nowISO(), u.id);
    return Users.obter(u.id);
  },

  definirSenha(id, senha) {
    if (String(senha || '').length < 8) throw new Error('A senha precisa de 8+ caracteres.');
    db.prepare('UPDATE users SET senha_hash = ?, atualizado_em = ? WHERE id = ?').run(bcrypt.hashSync(String(senha), 10), nowISO(), s(id, 40));
  },

  obter(id) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s(id, 40));
    if (!u) return null;
    const { senha_hash, ...resto } = u;
    return {
      ...resto,
      perfil_corpo: j.parse(u.perfil_corpo, {}),
      consentimento: j.parse(u.consentimento, {}),
      verificado: !!u.verificado,
      entitlements: entitlements(u),
    };
  },
  porEmail(email) {
    const u = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(s(email, 120).toLowerCase());
    return u ? Users.obter(u.id) : null;
  },
  // ficha pública do proprietário (sem CPF, sem e-mail, sem telefone — LGPD)
  publico(id) {
    const u = db.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM users WHERE id = ?`).get(s(id, 40));
    if (!u) return null;
    const dias = Math.max(0, Math.round((Date.now() - Date.parse(u.criado_em)) / 86400000));
    return { ...u, verificado: !!u.verificado, tempo_plataforma_dias: dias, num_pecas: n((db.prepare("SELECT COUNT(*) c FROM items WHERE owner_id = ? AND status = 'ativo' AND moderacao = 'aprovado'").get(u.id) || {}).c) };
  },

  atualizar(id, d) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s(id, 40));
    if (!u) throw new Error('Usuário não encontrado.');
    const campos = {
      nome: s(d.nome, 120) || u.nome, telefone: s(d.telefone, 30), bio: s(d.bio, 800), avatar_url: s(d.avatar_url, 400),
      cidade: s(d.cidade, 80), uf: s(d.uf, 2).toUpperCase(), bairro: s(d.bairro, 80), cep: s(d.cep, 12),
      lat: n(d.lat, u.lat), lng: n(d.lng, u.lng),
      cpf: d.cpf == null ? u.cpf : s(d.cpf, 20), nascimento: d.nascimento == null ? u.nascimento : s(d.nascimento, 10),
      pix_tipo: d.pix_tipo == null ? u.pix_tipo : s(d.pix_tipo, 20), pix_chave: d.pix_chave == null ? u.pix_chave : s(d.pix_chave, 140),
      perfil_corpo: d.perfil_corpo ? j.str(d.perfil_corpo) : u.perfil_corpo,
    };
    for (const k of ['telefone', 'bio', 'avatar_url', 'cidade', 'uf', 'bairro', 'cep']) if (d[k] == null) campos[k] = u[k];
    db.prepare(`UPDATE users SET nome=?, telefone=?, bio=?, avatar_url=?, cidade=?, uf=?, bairro=?, cep=?, lat=?, lng=?, cpf=?, nascimento=?, pix_tipo=?, pix_chave=?, perfil_corpo=?, atualizado_em=? WHERE id=?`)
      .run(campos.nome, campos.telefone, campos.bio, campos.avatar_url, campos.cidade, campos.uf, campos.bairro, campos.cep,
        campos.lat, campos.lng, campos.cpf, campos.nascimento, campos.pix_tipo, campos.pix_chave, campos.perfil_corpo, nowISO(), u.id);
    return Users.obter(u.id);
  },

  listar({ busca = '', status = '', papel = '', limite = 200 } = {}) {
    let q = 'SELECT id, nome, email, cidade, uf, papel, plano, status, verificado, nota_media, num_alugueis, num_locacoes, strikes, criado_em FROM users WHERE 1=1';
    const p = [];
    if (busca) { q += ' AND (nome LIKE ? OR email LIKE ?)'; p.push('%' + s(busca, 60) + '%', '%' + s(busca, 60) + '%'); }
    if (status) { q += ' AND status = ?'; p.push(s(status, 20)); }
    if (papel) { q += ' AND papel = ?'; p.push(s(papel, 20)); }
    q += ' ORDER BY criado_em DESC LIMIT ?'; p.push(Math.min(n(limite, 200), 1000));
    return db.prepare(q).all(...p).map((u) => ({ ...u, verificado: !!u.verificado }));
  },

  mudarStatus(id, status, quem, motivo) {
    if (!['ativo', 'bloqueado', 'excluido'].includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE users SET status=?, motivo_status=?, atualizado_em=? WHERE id=?').run(status, s(motivo, 300), nowISO(), s(id, 40));
    if (status !== 'ativo') db.prepare("UPDATE items SET status = 'pausado' WHERE owner_id = ?").run(s(id, 40));
    evento(id, 'user.status', status, { quem: s(quem, 80), motivo: s(motivo, 200) });
    return Users.obter(id);
  },
  papel(id, papel) {
    if (!['usuario', 'admin', 'moderador', 'parceiro'].includes(papel)) throw new Error('Papel inválido.');
    db.prepare('UPDATE users SET papel=?, atualizado_em=? WHERE id=?').run(papel, nowISO(), s(id, 40));
    return Users.obter(id);
  },
  verificar(id, aprovado, quem) {
    db.prepare('UPDATE users SET verificado=?, verificacao_status=?, atualizado_em=? WHERE id=?')
      .run(aprovado ? 1 : 0, aprovado ? 'aprovado' : 'reprovado', nowISO(), s(id, 40));
    evento(id, 'user.verificacao', aprovado ? 'aprovado' : 'reprovado', { quem: s(quem, 80) });
    return Users.obter(id);
  },
  strike(id, motivo) {
    db.prepare('UPDATE users SET strikes = strikes + 1, atualizado_em = ? WHERE id = ?').run(nowISO(), s(id, 40));
    const u = db.prepare('SELECT strikes FROM users WHERE id = ?').get(s(id, 40));
    evento(id, 'user.strike', String(u ? u.strikes : 0), { motivo: s(motivo, 200) });
    if (u && u.strikes >= 3) Users.mudarStatus(id, 'bloqueado', 'antifraude', 'reincidência: 3 strikes');
    return u ? u.strikes : 0;
  },
  // LGPD: apagar a conta preservando o histórico financeiro exigido por lei (anonimização)
  anonimizar(id, quem) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s(id, 40));
    if (!u) throw new Error('Usuário não encontrado.');
    if (db.prepare(`SELECT 1 FROM bookings WHERE cliente_id = ? AND status IN (${ABERTOS.map(() => '?').join(',')})`).get(u.id, ...ABERTOS)) {
      throw new Error('Há reservas em andamento nesta conta. Conclua-as antes de excluir.');
    }
    db.prepare(`UPDATE users SET nome='Conta excluída', email=?, senha_hash='', telefone='', cpf='', nascimento='', bio='', avatar_url='',
      cep='', lat=0, lng=0, pix_chave='', pix_tipo='', perfil_corpo='{}', status='excluido', atualizado_em=? WHERE id=?`)
      .run(`excluido-${u.id}@closet.local`, nowISO(), u.id);
    db.prepare("UPDATE items SET status='removido' WHERE owner_id=?").run(u.id);
    Auditoria.registrar({ quem: s(quem, 80), acao: 'lgpd.excluir', entidade: 'users', entidade_id: u.id, detalhe: 'anonimização' });
    return { ok: true };
  },
  // Portabilidade LGPD: tudo que a plataforma guarda sobre a pessoa.
  exportar(id) {
    const u = Users.obter(id);
    if (!u) throw new Error('Usuário não encontrado.');
    return {
      gerado_em: nowISO(), conta: u,
      pecas: db.prepare('SELECT * FROM items WHERE owner_id = ?').all(u.id),
      reservas_como_cliente: db.prepare('SELECT * FROM bookings WHERE cliente_id = ?').all(u.id),
      reservas_como_proprietario: db.prepare('SELECT b.* FROM bookings b JOIN booking_items bi ON bi.booking_id = b.id WHERE bi.owner_id = ? GROUP BY b.id').all(u.id),
      avaliacoes: db.prepare('SELECT * FROM reviews WHERE autor_id = ? OR alvo_id = ?').all(u.id, u.id),
      mensagens: db.prepare('SELECT m.* FROM messages m JOIN threads t ON t.id = m.thread_id WHERE t.cliente_id = ? OR t.owner_id = ?').all(u.id, u.id),
      repasses: db.prepare('SELECT * FROM payouts WHERE owner_id = ?').all(u.id),
    };
  },
};

// ---------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------
function mapItem(i, { dono = null } = {}) {
  if (!i) return null;
  return {
    ...i,
    ocasioes: j.parse(i.ocasioes, []), cores: j.parse(i.cores, []), medidas: j.parse(i.medidas, {}),
    modelo: j.parse(i.modelo, {}), fotos: j.parse(i.fotos, []), entrega: j.parse(i.entrega, ['retirada']),
    seo_keywords: j.parse(i.seo_keywords, []), ia: j.parse(i.ia, {}),
    destacado: !!(i.destaque_ate && i.destaque_ate >= nowISO()),
    proprietario: dono || undefined,
  };
}

const Items = {
  criar(ownerId, d) {
    const owner = Users.obter(ownerId);
    if (!owner) throw new Error('Proprietário não encontrado.');
    const ent = owner.entitlements;
    if (ent.limites.pecas) {
      const qtd = n((db.prepare("SELECT COUNT(*) c FROM items WHERE owner_id = ? AND status != 'removido'").get(ownerId) || {}).c);
      if (qtd >= ent.limites.pecas) throw new Error(`Seu plano ${ent.nome} permite ${ent.limites.pecas} peças. Assine o Premium para anunciar sem limite.`);
    }
    const titulo = s(d.titulo, 140);
    if (!titulo) throw new Error('Dê um título à peça.');
    if (cent(d.preco_diaria_centavos) <= 0) throw new Error('Informe o preço da diária.');
    const id = novoId();
    const agora = nowISO();
    const fotos = (Array.isArray(d.fotos) ? d.fotos : []).slice(0, Math.max(1, ent.limites.fotos_por_peca || 5));
    db.prepare(`INSERT INTO items (id, owner_id, slug, titulo, descricao, categoria, subcategoria, ocasioes, cor, cores, tamanho, marca, estilo, estacao, condicao,
      medidas, modelo, preco_diaria_centavos, preco_3dias_centavos, caucao_centavos, valor_reposicao_centavos, min_dias, prep_dias, antecedencia_dias,
      fotos, video_url, cidade, uf, bairro, lat, lng, entrega, seo_keywords, status, moderacao, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pendente',?,?)`)
      .run(id, ownerId, slugify(titulo) + '-' + id.slice(0, 5).toLowerCase(), titulo, s(d.descricao, 4000),
        s(d.categoria, 40) || 'vestido', s(d.subcategoria, 40), j.str(Array.isArray(d.ocasioes) ? d.ocasioes.map((o) => s(o, 40)) : []),
        s(d.cor, 40), j.str(Array.isArray(d.cores) ? d.cores : []), s(d.tamanho, 20), s(d.marca, 60), s(d.estilo, 40),
        s(d.estacao, 20) || 'todas', s(d.condicao, 20) || 'seminovo', j.str(d.medidas || {}), j.str(d.modelo || {}),
        cent(d.preco_diaria_centavos), cent(d.preco_3dias_centavos), cent(d.caucao_centavos), cent(d.valor_reposicao_centavos),
        Math.max(1, n(d.min_dias, 1)), Math.max(0, n(d.prep_dias, 1)), Math.max(0, n(d.antecedencia_dias, 0)),
        j.str(fotos), s(d.video_url, 400), s(d.cidade, 80) || owner.cidade, s(d.uf, 2).toUpperCase() || owner.uf,
        s(d.bairro, 80) || owner.bairro, n(d.lat, owner.lat), n(d.lng, owner.lng),
        j.str(Array.isArray(d.entrega) && d.entrega.length ? d.entrega : ['retirada']), j.str(Array.isArray(d.seo_keywords) ? d.seo_keywords : []),
        s(d.status, 20) === 'ativo' ? 'ativo' : 'rascunho', agora, agora);
    evento(ownerId, 'item.criado', id, { titulo });
    return Items.obter(id);
  },

  atualizar(id, ownerId, d) {
    const i = db.prepare('SELECT * FROM items WHERE id = ?').get(s(id, 40));
    if (!i) throw new Error('Peça não encontrada.');
    if (ownerId && i.owner_id !== ownerId) throw new Error('Esta peça não é sua.');
    const g = (k, conv, atual) => (d[k] === undefined ? atual : conv(d[k]));
    const owner = Users.obter(i.owner_id);
    const maxFotos = Math.max(1, owner.entitlements.limites.fotos_por_peca || 5);
    // Mexer no preço/regra de uma peça com reserva em andamento confundiria o que já foi contratado:
    // o valor da reserva é congelado em booking_items, então aqui só bloqueamos despublicar.
    const novoStatus = g('status', (v) => (['rascunho', 'ativo', 'pausado', 'removido'].includes(s(v, 20)) ? s(v, 20) : i.status), i.status);
    if (novoStatus === 'removido' && Items.temReservaAberta(i.id)) throw new Error('Há reserva em andamento com esta peça. Conclua-a antes de remover.');
    db.prepare(`UPDATE items SET titulo=?, descricao=?, categoria=?, subcategoria=?, ocasioes=?, cor=?, cores=?, tamanho=?, marca=?, estilo=?, estacao=?, condicao=?,
      medidas=?, modelo=?, preco_diaria_centavos=?, preco_3dias_centavos=?, caucao_centavos=?, valor_reposicao_centavos=?, min_dias=?, prep_dias=?, antecedencia_dias=?,
      fotos=?, video_url=?, cidade=?, uf=?, bairro=?, entrega=?, seo_keywords=?, status=?, atualizado_em=? WHERE id=?`)
      .run(g('titulo', (v) => s(v, 140) || i.titulo, i.titulo), g('descricao', (v) => s(v, 4000), i.descricao),
        g('categoria', (v) => s(v, 40), i.categoria), g('subcategoria', (v) => s(v, 40), i.subcategoria),
        g('ocasioes', (v) => j.str(Array.isArray(v) ? v : []), i.ocasioes), g('cor', (v) => s(v, 40), i.cor),
        g('cores', (v) => j.str(Array.isArray(v) ? v : []), i.cores), g('tamanho', (v) => s(v, 20), i.tamanho),
        g('marca', (v) => s(v, 60), i.marca), g('estilo', (v) => s(v, 40), i.estilo), g('estacao', (v) => s(v, 20), i.estacao),
        g('condicao', (v) => s(v, 20), i.condicao), g('medidas', (v) => j.str(v || {}), i.medidas), g('modelo', (v) => j.str(v || {}), i.modelo),
        g('preco_diaria_centavos', cent, i.preco_diaria_centavos), g('preco_3dias_centavos', cent, i.preco_3dias_centavos),
        g('caucao_centavos', cent, i.caucao_centavos), g('valor_reposicao_centavos', cent, i.valor_reposicao_centavos),
        g('min_dias', (v) => Math.max(1, n(v, 1)), i.min_dias), g('prep_dias', (v) => Math.max(0, n(v, 1)), i.prep_dias),
        g('antecedencia_dias', (v) => Math.max(0, n(v, 0)), i.antecedencia_dias),
        g('fotos', (v) => j.str((Array.isArray(v) ? v : []).slice(0, maxFotos)), i.fotos), g('video_url', (v) => s(v, 400), i.video_url),
        g('cidade', (v) => s(v, 80), i.cidade), g('uf', (v) => s(v, 2).toUpperCase(), i.uf), g('bairro', (v) => s(v, 80), i.bairro),
        g('entrega', (v) => j.str(Array.isArray(v) && v.length ? v : ['retirada']), i.entrega),
        g('seo_keywords', (v) => j.str(Array.isArray(v) ? v : []), i.seo_keywords), novoStatus, nowISO(), i.id);
    return Items.obter(i.id);
  },

  obter(id, { comDono = false } = {}) {
    const i = db.prepare('SELECT * FROM items WHERE id = ? OR slug = ?').get(s(id, 90), s(id, 90));
    if (!i) return null;
    return mapItem(i, { dono: comDono ? Users.publico(i.owner_id) : null });
  },

  temReservaAberta(itemId) {
    return !!db.prepare(`SELECT 1 FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id
      WHERE bi.item_id = ? AND b.status IN (${ABERTOS.map(() => '?').join(',')}) LIMIT 1`).get(s(itemId, 40), ...ABERTOS);
  },

  doOwner(ownerId, { status = '' } = {}) {
    const q = status ? 'SELECT * FROM items WHERE owner_id = ? AND status = ? ORDER BY criado_em DESC'
      : "SELECT * FROM items WHERE owner_id = ? AND status != 'removido' ORDER BY criado_em DESC";
    const linhas = status ? db.prepare(q).all(s(ownerId, 40), s(status, 20)) : db.prepare(q).all(s(ownerId, 40));
    return linhas.map((i) => mapItem(i));
  },

  moderar(id, aprovado, nota, quem) {
    db.prepare('UPDATE items SET moderacao=?, moderacao_nota=?, status=?, atualizado_em=? WHERE id=?')
      .run(aprovado ? 'aprovado' : 'reprovado', s(nota, 400), aprovado ? 'ativo' : 'pausado', nowISO(), s(id, 40));
    evento('', 'item.moderado', s(id, 40), { aprovado: !!aprovado, quem: s(quem, 80) });
    return Items.obter(id);
  },

  destacar(id, dias, quem) {
    const ate = new Date(Date.now() + Math.max(1, n(dias, 7)) * 86400000).toISOString();
    db.prepare('UPDATE items SET destaque_ate=?, atualizado_em=? WHERE id=?').run(ate, nowISO(), s(id, 40));
    evento('', 'item.destaque', s(id, 40), { ate, quem: s(quem, 80) });
    return Items.obter(id);
  },

  registrarVisualizacao(id, userId, origem) {
    db.prepare('UPDATE items SET visualizacoes = visualizacoes + 1 WHERE id = ?').run(s(id, 40));
    db.prepare('INSERT INTO item_views (id, item_id, user_id, origem, dia, quando) VALUES (?,?,?,?,?,?)')
      .run(novoId(), s(id, 40), s(userId, 40), s(origem, 60), hojeISO(), nowISO());
  },

  // ----- VITRINE: busca com todos os filtros da experiência -----
  buscar(f = {}) {
    const p = [];
    let q = `SELECT i.* FROM items i JOIN users u ON u.id = i.owner_id
             WHERE i.status = 'ativo' AND i.moderacao = 'aprovado' AND u.status = 'ativo'`;
    const like = (campo, v) => { q += ` AND ${campo} LIKE ?`; p.push('%' + s(v, 60) + '%'); };
    if (f.q) { q += ' AND (i.titulo LIKE ? OR i.descricao LIKE ? OR i.marca LIKE ?)'; const t = '%' + s(f.q, 60) + '%'; p.push(t, t, t); }
    if (f.ocasiao) like('i.ocasioes', f.ocasiao);
    if (f.categoria) { q += ' AND i.categoria = ?'; p.push(s(f.categoria, 40)); }
    if (f.cor) { q += ' AND (i.cor = ? OR i.cores LIKE ?)'; p.push(s(f.cor, 40), '%' + s(f.cor, 40) + '%'); }
    if (f.tamanho) { q += ' AND i.tamanho = ?'; p.push(s(f.tamanho, 20)); }
    if (f.marca) like('i.marca', f.marca);
    if (f.estilo) { q += ' AND i.estilo = ?'; p.push(s(f.estilo, 40)); }
    if (f.estacao) { q += " AND (i.estacao = ? OR i.estacao = 'todas')"; p.push(s(f.estacao, 20)); }
    if (f.cidade) { q += ' AND i.cidade = ?'; p.push(s(f.cidade, 80)); }
    if (f.uf) { q += ' AND i.uf = ?'; p.push(s(f.uf, 2).toUpperCase()); }
    if (f.preco_min) { q += ' AND i.preco_diaria_centavos >= ?'; p.push(cent(f.preco_min)); }
    if (f.preco_max) { q += ' AND i.preco_diaria_centavos <= ?'; p.push(cent(f.preco_max)); }
    if (f.nota_min) { q += ' AND i.nota_media >= ?'; p.push(n(f.nota_min, 0)); }
    if (f.owner_id) { q += ' AND i.owner_id = ?'; p.push(s(f.owner_id, 40)); }
    // ordem: destaque primeiro (Premium/patrocinado), depois o critério pedido
    const ordens = {
      relevancia: 'i.alugueis DESC, i.nota_media DESC, i.visualizacoes DESC',
      recentes: 'i.criado_em DESC',
      preco_asc: 'i.preco_diaria_centavos ASC',
      preco_desc: 'i.preco_diaria_centavos DESC',
      avaliacao: 'i.nota_media DESC, i.num_avaliacoes DESC',
    };
    const ordem = ordens[s(f.ordem, 20)] || ordens.relevancia;
    q += ` ORDER BY (CASE WHEN i.destaque_ate >= ? THEN 0 ELSE 1 END), ${ordem} LIMIT ? OFFSET ?`;
    const limite = Math.min(Math.max(n(f.limite, 24), 1), 96);
    const offset = Math.max(0, n(f.offset, 0));
    p.push(nowISO(), limite, offset);
    let linhas = db.prepare(q).all(...p).map((i) => mapItem(i));
    // disponibilidade só é filtrada quando o cliente informou as datas (custa uma varredura por peça)
    if (diaValido(f.de) && diaValido(f.ate)) {
      linhas = linhas.filter((i) => Agenda.disponivel(i.id, f.de, f.ate).disponivel);
    }
    return { itens: linhas, limite, offset };
  },

  // "peças que combinam": mesma ocasião/cidade, categorias complementares
  complementares(item, limite = 8) {
    const oc = (item.ocasioes || [])[0] || '';
    const linhas = db.prepare(`SELECT * FROM items WHERE status='ativo' AND moderacao='aprovado' AND id != ? AND categoria != ?
      AND (cidade = ? OR ? = '') AND (ocasioes LIKE ? OR ? = '') ORDER BY nota_media DESC, alugueis DESC LIMIT ?`)
      .all(item.id, item.categoria, item.cidade, item.cidade, '%' + oc + '%', oc, Math.min(n(limite, 8), 24));
    return linhas.map((i) => mapItem(i));
  },
};

// ---------------------------------------------------------------------
// Looks (o conjunto completo — peças podem ser de donos diferentes)
// ---------------------------------------------------------------------
const Looks = {
  criar(curadorId, d) {
    const titulo = s(d.titulo, 140);
    if (!titulo) throw new Error('Dê um nome ao look (ex.: "Look Casamento no Campo").');
    const ids = (Array.isArray(d.itens) ? d.itens : []).map((x) => s(typeof x === 'string' ? x : x.item_id, 40)).filter(Boolean);
    if (ids.length < 2) throw new Error('Um look precisa de pelo menos 2 peças.');
    const id = novoId();
    const agora = nowISO();
    return transacao(() => {
      db.prepare(`INSERT INTO looks (id, curador_id, curadoria, slug, titulo, descricao, ocasiao, estilo, cidade, uf, desconto_pct, foto_capa, fotos, status, moderacao, criado_em, atualizado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pendente', ?,?)`)
        .run(id, s(curadorId, 40), s(d.curadoria, 20) || 'proprietario', slugify(titulo) + '-' + id.slice(0, 5).toLowerCase(),
          titulo, s(d.descricao, 3000), s(d.ocasiao, 40), s(d.estilo, 40), s(d.cidade, 80), s(d.uf, 2).toUpperCase(),
          Math.min(Math.max(n(d.desconto_pct, 10), 0), Config.num('comissao_pct', 20)), s(d.foto_capa, 400), j.str(Array.isArray(d.fotos) ? d.fotos : []),
          s(d.status, 20) === 'ativo' ? 'ativo' : 'rascunho', agora, agora);
      ids.forEach((itemId, k) => {
        const it = db.prepare("SELECT id FROM items WHERE id = ? AND status != 'removido'").get(itemId);
        if (!it) throw new Error('Peça do look não encontrada: ' + itemId);
        const meta = (Array.isArray(d.itens) ? d.itens : []).find((x) => (typeof x === 'string' ? x : x.item_id) === itemId) || {};
        db.prepare('INSERT INTO look_items (look_id, item_id, papel, ordem) VALUES (?,?,?,?)').run(id, itemId, s(meta.papel, 40), k);
      });
      evento(curadorId, 'look.criado', id, { titulo, pecas: ids.length });
      return Looks.obter(id);
    });
  },

  obter(id) {
    const l = db.prepare('SELECT * FROM looks WHERE id = ? OR slug = ?').get(s(id, 90), s(id, 90));
    if (!l) return null;
    const itens = db.prepare(`SELECT i.*, li.papel, li.ordem FROM look_items li JOIN items i ON i.id = li.item_id
      WHERE li.look_id = ? ORDER BY li.ordem`).all(l.id).map((i) => mapItem(i, { dono: Users.publico(i.owner_id) }));
    const soma = itens.reduce((t, i) => t + i.preco_diaria_centavos, 0);
    return {
      ...l, fotos: j.parse(l.fotos, []), itens,
      donos: [...new Set(itens.map((i) => i.owner_id))].length,
      preco_diaria_soma_centavos: soma,
      preco_diaria_look_centavos: Math.round(soma * (1 - l.desconto_pct / 100)),
    };
  },

  atualizar(id, curadorId, d) {
    const l = db.prepare('SELECT * FROM looks WHERE id = ?').get(s(id, 40));
    if (!l) throw new Error('Look não encontrado.');
    if (curadorId && l.curador_id !== curadorId) throw new Error('Este look não é seu.');
    db.prepare('UPDATE looks SET titulo=?, descricao=?, ocasiao=?, estilo=?, cidade=?, uf=?, desconto_pct=?, foto_capa=?, fotos=?, status=?, atualizado_em=? WHERE id=?')
      .run(s(d.titulo, 140) || l.titulo, d.descricao === undefined ? l.descricao : s(d.descricao, 3000),
        d.ocasiao === undefined ? l.ocasiao : s(d.ocasiao, 40), d.estilo === undefined ? l.estilo : s(d.estilo, 40),
        d.cidade === undefined ? l.cidade : s(d.cidade, 80), d.uf === undefined ? l.uf : s(d.uf, 2).toUpperCase(),
        d.desconto_pct === undefined ? l.desconto_pct : Math.min(Math.max(n(d.desconto_pct, 10), 0), Config.num('comissao_pct', 20)),
        d.foto_capa === undefined ? l.foto_capa : s(d.foto_capa, 400),
        d.fotos === undefined ? l.fotos : j.str(Array.isArray(d.fotos) ? d.fotos : []),
        d.status === undefined ? l.status : (['rascunho', 'ativo', 'pausado', 'removido'].includes(s(d.status, 20)) ? s(d.status, 20) : l.status),
        nowISO(), l.id);
    if (Array.isArray(d.itens)) {
      const ids = d.itens.map((x) => s(typeof x === 'string' ? x : x.item_id, 40)).filter(Boolean);
      if (ids.length < 2) throw new Error('Um look precisa de pelo menos 2 peças.');
      db.prepare('DELETE FROM look_items WHERE look_id = ?').run(l.id);
      ids.forEach((itemId, k) => db.prepare('INSERT INTO look_items (look_id, item_id, papel, ordem) VALUES (?,?,?,?)').run(l.id, itemId, '', k));
    }
    return Looks.obter(l.id);
  },

  buscar(f = {}) {
    const p = [];
    let q = "SELECT * FROM looks WHERE status = 'ativo' AND moderacao = 'aprovado'";
    if (f.ocasiao) { q += ' AND ocasiao = ?'; p.push(s(f.ocasiao, 40)); }
    if (f.cidade) { q += ' AND cidade = ?'; p.push(s(f.cidade, 80)); }
    if (f.estilo) { q += ' AND estilo = ?'; p.push(s(f.estilo, 40)); }
    if (f.q) { q += ' AND (titulo LIKE ? OR descricao LIKE ?)'; const t = '%' + s(f.q, 60) + '%'; p.push(t, t); }
    q += ' ORDER BY alugueis DESC, criado_em DESC LIMIT ?'; p.push(Math.min(n(f.limite, 24), 60));
    return db.prepare(q).all(...p).map((l) => Looks.obter(l.id));
  },

  doCurador(curadorId) {
    return db.prepare("SELECT id FROM looks WHERE curador_id = ? AND status != 'removido' ORDER BY criado_em DESC")
      .all(s(curadorId, 40)).map((l) => Looks.obter(l.id));
  },

  moderar(id, aprovado, quem) {
    db.prepare('UPDATE looks SET moderacao=?, status=?, atualizado_em=? WHERE id=?')
      .run(aprovado ? 'aprovado' : 'reprovado', aprovado ? 'ativo' : 'pausado', nowISO(), s(id, 40));
    evento('', 'look.moderado', s(id, 40), { aprovado: !!aprovado, quem: s(quem, 80) });
    return Looks.obter(id);
  },
};

// ---------------------------------------------------------------------
// Agenda / disponibilidade
// ---------------------------------------------------------------------
const Agenda = {
  bloqueios(itemId, de, ate) {
    const p = [s(itemId, 40)];
    let q = 'SELECT * FROM item_blocks WHERE item_id = ?';
    if (diaValido(de) && diaValido(ate)) { q += ' AND inicio <= ? AND fim >= ?'; p.push(ate, de); }
    return db.prepare(q + ' ORDER BY inicio').all(...p);
  },

  // Regra: a peça está livre se não há bloqueio sobrepondo o período pedido,
  // respeitando mínimo de diárias, antecedência e o status do anúncio.
  disponivel(itemId, de, ate) {
    const i = db.prepare('SELECT * FROM items WHERE id = ?').get(s(itemId, 40));
    if (!i) return { disponivel: false, motivo: 'Peça não encontrada.' };
    if (i.status !== 'ativo' || i.moderacao !== 'aprovado') return { disponivel: false, motivo: 'Peça indisponível no momento.' };
    if (!diaValido(de) || !diaValido(ate)) return { disponivel: false, motivo: 'Datas inválidas.' };
    const dias = diasEntre(de, ate) + 1;
    if (dias < 1) return { disponivel: false, motivo: 'A devolução tem de ser igual ou depois da retirada.' };
    if (dias < i.min_dias) return { disponivel: false, motivo: `Esta peça é alugada a partir de ${i.min_dias} diária(s).` };
    if (de < somaDias(hojeISO(), i.antecedencia_dias)) {
      return { disponivel: false, motivo: `Esta peça precisa de ${i.antecedencia_dias} dia(s) de antecedência.` };
    }
    const conflito = db.prepare('SELECT * FROM item_blocks WHERE item_id = ? AND inicio <= ? AND fim >= ? LIMIT 1').get(i.id, ate, de);
    if (conflito) return { disponivel: false, motivo: 'Já reservada nessas datas.', conflito: { inicio: conflito.inicio, fim: conflito.fim } };
    return { disponivel: true, dias };
  },

  bloquear(itemId, inicio, fim, motivo, bookingId) {
    if (!diaValido(inicio) || !diaValido(fim)) throw new Error('Datas inválidas.');
    const id = novoId();
    db.prepare('INSERT INTO item_blocks (id, item_id, inicio, fim, motivo, booking_id, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(id, s(itemId, 40), inicio, fim, s(motivo, 20) || 'manual', s(bookingId, 40), nowISO());
    return id;
  },
  desbloquear(id, ownerId) {
    const b = db.prepare('SELECT b.*, i.owner_id FROM item_blocks b JOIN items i ON i.id = b.item_id WHERE b.id = ?').get(s(id, 40));
    if (!b) throw new Error('Bloqueio não encontrado.');
    if (ownerId && b.owner_id !== ownerId) throw new Error('Este bloqueio não é seu.');
    if (b.motivo === 'reserva') throw new Error('Bloqueio de reserva confirmada não pode ser removido à mão.');
    db.prepare('DELETE FROM item_blocks WHERE id = ?').run(b.id);
    return { ok: true };
  },
  limparDaReserva(bookingId) { db.prepare('DELETE FROM item_blocks WHERE booking_id = ?').run(s(bookingId, 40)); },

  // calendário de 1 peça para a UI (dias ocupados no intervalo)
  calendario(itemId, de, ate) {
    const inicio = diaValido(de) ? de : hojeISO();
    const fim = diaValido(ate) ? ate : somaDias(inicio, 90);
    const ocupados = new Set();
    for (const b of Agenda.bloqueios(itemId, inicio, fim)) {
      let d = b.inicio < inicio ? inicio : b.inicio;
      while (d <= b.fim && d <= fim) { ocupados.add(d); d = somaDias(d, 1); }
    }
    return { de: inicio, ate: fim, ocupados: [...ocupados].sort() };
  },
};

// ---------------------------------------------------------------------
// PREÇO — fonte única de verdade
// ---------------------------------------------------------------------
const Precos = {
  // Preço de UMA peça no período: usa o pacote de 3 diárias quando compensa.
  daPeca(item, dias) {
    const d = Math.max(1, n(dias, 1));
    if (item.preco_3dias_centavos && d <= 3) return item.preco_3dias_centavos;
    if (item.preco_3dias_centavos && d > 3) return item.preco_3dias_centavos + (d - 3) * item.preco_diaria_centavos;
    return d * item.preco_diaria_centavos;
  },

  // Orçamento completo da reserva. Devolve o mesmo objeto que será gravado.
  // Nenhuma outra parte do sistema pode calcular dinheiro por conta própria.
  //
  // REGRA ECONÔMICA (importante): desconto de look e cupom são promoções da
  // PLATAFORMA — saem da comissão, nunca do repasse do proprietário. Um look
  // pode juntar peças de vários donos, e nenhum deles pode ganhar menos porque
  // outra pessoa montou um combo. Por isso os descontos são limitados à
  // comissão bruta: a plataforma pode zerar o próprio ganho, jamais o do dono.
  orcamento({ itens = [], look = null, de, ate, cupom = '', seguro = false, entrega_centavos = 0, servicos = [], clienteId = '', credito_disponivel_centavos = 0 } = {}) {
    if (!diaValido(de) || !diaValido(ate)) throw new Error('Informe as datas de retirada e devolução.');
    const dias = diasEntre(de, ate) + 1;
    if (dias < 1) throw new Error('A devolução tem de ser igual ou depois da retirada.');
    if (!itens.length) throw new Error('Nenhuma peça selecionada.');

    const comissaoPadrao = Config.num('comissao_pct', 20);
    const seguroPct = Config.num('seguro_pct', 8);

    // 1. valor cheio de cada peça e o que cabe a cada dono (independe de promoção)
    const linhas = itens.map((i) => {
      const bruto = Precos.daPeca(i, dias);
      const dono = Users.obter(i.owner_id);
      const pct = dono ? dono.entitlements.comissao_pct : comissaoPadrao;
      const comissao = Math.round(bruto * pct / 100);
      return {
        item_id: i.id, owner_id: i.owner_id, titulo: i.titulo,
        preco_diaria_centavos: i.preco_diaria_centavos, dias,
        subtotal_centavos: bruto, desconto_centavos: 0,
        caucao_centavos: i.caucao_centavos, valor_reposicao_centavos: i.valor_reposicao_centavos,
        comissao_pct: pct, comissao_centavos: comissao, repasse_centavos: bruto - comissao,
      };
    });

    const subtotal = linhas.reduce((t, l) => t + l.subtotal_centavos, 0);
    const repasse = linhas.reduce((t, l) => t + l.repasse_centavos, 0);
    const comissaoBruta = linhas.reduce((t, l) => t + l.comissao_centavos, 0);

    // 2. promoções, sempre bancadas pela comissão
    const descontoLookPct = look ? Math.min(Math.max(n(look.desconto_pct, 0), 0), 60) : 0;
    let descontoLook = Math.min(Math.round(subtotal * descontoLookPct / 100), comissaoBruta);

    let cupomAplicado = '';
    let descontoCupom = 0;
    if (cupom) {
      const c = Cupons.validar(cupom, subtotal - descontoLook, clienteId);
      const bruto = c.tipo === 'pct' ? Math.round((subtotal - descontoLook) * c.valor / 100) : c.valor;
      descontoCupom = Math.max(0, Math.min(bruto, comissaoBruta - descontoLook));
      if (descontoCupom > 0) cupomAplicado = c.codigo;
    }

    // crédito de indicação: entra por último, com o que ainda cabe na comissão.
    // O que não couber continua no saldo da pessoa — não some.
    const creditoDisponivel = cent(credito_disponivel_centavos);
    const creditoAplicado = Math.max(0, Math.min(creditoDisponivel, comissaoBruta - descontoLook - descontoCupom));

    const desconto = descontoLook + descontoCupom + creditoAplicado;

    // 3. fechamento: total = repasse + comissão líquida + extras + caução
    const caucao = linhas.reduce((t, l) => t + l.caucao_centavos, 0);
    const seguroValor = seguro ? Math.round(linhas.reduce((t, l) => t + l.valor_reposicao_centavos, 0) * seguroPct / 100) : 0;
    const servicosValor = (Array.isArray(servicos) ? servicos : []).reduce((t, sv) => t + cent(sv.preco_centavos), 0);
    const entrega = cent(entrega_centavos);
    const comissao = comissaoBruta - desconto;
    const total = (subtotal - desconto) + seguroValor + entrega + servicosValor + caucao;

    return {
      de, ate, dias, linhas,
      subtotal_centavos: subtotal, desconto_centavos: desconto, cupom: cupomAplicado,
      seguro_centavos: seguroValor, entrega_centavos: entrega, servicos_centavos: servicosValor,
      caucao_centavos: caucao, total_centavos: total,
      comissao_centavos: comissao, comissao_bruta_centavos: comissaoBruta, comissao_pct: comissaoPadrao,
      repasse_centavos: repasse,
      economia_look_centavos: descontoLook,
      desconto_cupom_centavos: descontoCupom,
      credito_centavos: creditoAplicado,
      credito_disponivel_centavos: creditoDisponivel,
    };
  },
};

// ---------------------------------------------------------------------
// Cupons
// ---------------------------------------------------------------------
const Cupons = {
  criar(d) {
    const codigo = s(d.codigo, 40).toUpperCase();
    if (!codigo) throw new Error('Informe o código do cupom.');
    db.prepare(`INSERT INTO coupons (codigo, descricao, tipo, valor, minimo_centavos, usos_max, por_usuario, valido_de, valido_ate, ativo, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(codigo) DO UPDATE SET descricao=excluded.descricao, tipo=excluded.tipo, valor=excluded.valor,
      minimo_centavos=excluded.minimo_centavos, usos_max=excluded.usos_max, por_usuario=excluded.por_usuario, valido_de=excluded.valido_de,
      valido_ate=excluded.valido_ate, ativo=excluded.ativo`)
      .run(codigo, s(d.descricao, 200), s(d.tipo, 10) === 'valor' ? 'valor' : 'pct', n(d.valor, 0), cent(d.minimo_centavos),
        n(d.usos_max, 0), Math.max(1, n(d.por_usuario, 1)), s(d.valido_de, 10), s(d.valido_ate, 10), d.ativo === false ? 0 : 1, nowISO());
    return db.prepare('SELECT * FROM coupons WHERE codigo = ?').get(codigo);
  },
  listar() { return db.prepare('SELECT * FROM coupons ORDER BY criado_em DESC').all(); },
  validar(codigo, valorCentavos, userId) {
    const c = db.prepare('SELECT * FROM coupons WHERE codigo = ? AND ativo = 1').get(s(codigo, 40).toUpperCase());
    if (!c) throw new Error('Cupom inválido.');
    const hoje = hojeISO();
    if (c.valido_de && hoje < c.valido_de) throw new Error('Este cupom ainda não está valendo.');
    if (c.valido_ate && hoje > c.valido_ate) throw new Error('Este cupom expirou.');
    if (c.usos_max && c.usos >= c.usos_max) throw new Error('Este cupom esgotou.');
    if (c.minimo_centavos && valorCentavos < c.minimo_centavos) throw new Error('Valor mínimo não atingido para este cupom.');
    if (userId) {
      const meus = n((db.prepare('SELECT COUNT(*) c FROM coupon_uses WHERE codigo = ? AND user_id = ?').get(c.codigo, s(userId, 40)) || {}).c);
      if (meus >= c.por_usuario) throw new Error('Você já usou este cupom.');
    }
    return c;
  },
  consumir(codigo, userId, bookingId) {
    if (!codigo) return;
    db.prepare('INSERT OR IGNORE INTO coupon_uses (codigo, user_id, booking_id, criado_em) VALUES (?,?,?,?)')
      .run(s(codigo, 40).toUpperCase(), s(userId, 40), s(bookingId, 40), nowISO());
    db.prepare('UPDATE coupons SET usos = usos + 1 WHERE codigo = ?').run(s(codigo, 40).toUpperCase());
  },
};

// ---------------------------------------------------------------------
// Razão financeiro
// ---------------------------------------------------------------------
function lancar(tipo, valorCentavos, { bookingId = '', userId = '', descricao = '' } = {}) {
  db.prepare('INSERT INTO ledger (id, booking_id, user_id, tipo, valor_centavos, descricao, competencia, criado_em) VALUES (?,?,?,?,?,?,?,?)')
    .run(novoId(), s(bookingId, 40), s(userId, 40), s(tipo, 30), Math.round(n(valorCentavos, 0)), s(descricao, 300), periodoAtual(), nowISO());
}

module.exports = {
  // catálogo
  OCASIOES, CATEGORIAS, ESTILOS, TAMANHOS, CONDICOES, STATUS_BOOKING, ABERTOS, PLANOS_SEED,
  // serviços
  Config, Planos, Users, Items, Looks, Agenda, Precos, Cupons, Notificacoes, Auditoria,
  semear, entitlements, evento, lancar, mapItem,
  // utilitários compartilhados com os outros arquivos do módulo
  s, n, cent, slugify,
};
