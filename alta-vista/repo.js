// =====================================================================
// Villela Alta Vista 360 — núcleo de domínio (Onda 1).
// Regras que sustentam o produto desde o dia 1:
//   1. PREÇO      — vive no banco, em centavos; a interface só exibe.
//   2. HONESTIDADE — projeto conceitual carrega SEMPRE o aviso obrigatório;
//                    virar caso real exige consentimento registrado.
//   3. SEM PROMESSA — nenhum texto afirma aumento garantido de reservas.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('./db');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const n = (v, padrao = 0) => { const x = Number(v); return Number.isFinite(x) ? x : padrao; };
const cent = (v) => Math.max(0, Math.round(n(v, 0)));
const slugify = (t) => s(t, 120).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

// Aviso obrigatório dos projetos de demonstração (spec §8): aparece em TODO
// card e página de projeto conceitual, sem exceção.
const AVISO_CONCEITUAL = 'Projeto conceitual criado para demonstrar possibilidades técnicas. Não representa cliente atendido.';

const CATEGORIAS = ['video_ia', 'drone', 'foto360', 'tour', 'hospedagem', 'adicional'];
const STATUS_LEAD = ['novo', 'em_contato', 'proposta', 'ganho', 'perdido'];
const STATUS_PROPOSTA = ['rascunho', 'enviada', 'aceita', 'recusada', 'expirada'];

// Versão dos termos vigente — gravada em cada aceite de proposta. Muda quando
// o texto de /alta-vista/termos mudar (e vira data nova quando o advogado aprovar).
const TERMOS_VERSAO = '2026-08-06-minuta';

// ---------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------
const CONFIG_PADRAO = {
  whatsapp: { valor: '', descricao: 'WhatsApp comercial (só números, com DDI+DDD, ex.: 5561...). Vazio = CTA vira o formulário de orçamento.' },
  email_contato: { valor: '', descricao: 'E-mail de contato exibido no site e usado nos avisos.' },
  cidade_base: { valor: 'Brasília · DF', descricao: 'Onde o atendimento presencial acontece.' },
  capacidade_semanal: { valor: '2', descricao: 'Projetos simultâneos que a operação atende sem atraso (portão de prontidão).' },
  fundadores_ativo: { valor: '1', descricao: 'Programa Clientes Fundadores ativo (1) ou encerrado (0).' },
  fundadores_desconto_pct: { valor: '20', descricao: 'Desconto máximo dos Clientes Fundadores (%). Condicionado à autorização de portfólio.' },
  fundadores_vagas_total: { valor: '10', descricao: 'Total de vagas do programa Clientes Fundadores.' },
  fundadores_usadas: { valor: '0', descricao: 'Vagas de fundador já usadas (controle manual até a Onda 4).' },
  prazo_resposta: { valor: '1 dia útil', descricao: 'Compromisso de resposta exibido no site.' },
};

const Config = {
  todos() { return db.prepare('SELECT * FROM config ORDER BY chave').all(); },
  get(chave, padrao = '') {
    const r = db.prepare('SELECT valor FROM config WHERE chave = ?').get(String(chave));
    return r ? r.valor : padrao;
  },
  // Number('') é 0 e é finito — sem o guarda, chave vazia devolveria 0 em vez do padrão.
  num(chave, padrao = 0) { const v = Config.get(chave, ''); return v === '' ? padrao : n(v, padrao); },
  set(chave, valor) {
    db.prepare(`INSERT INTO config (chave, valor, descricao, atualizado_em) VALUES (?,?,'',?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`)
      .run(String(chave), String(valor == null ? '' : valor), nowISO());
    return { chave, valor };
  },
};

// ---------------------------------------------------------------------
// Serviços (catálogo)
// ---------------------------------------------------------------------
const Servicos = {
  listar({ incluirInativos = false, categoria = '' } = {}) {
    let sql = 'SELECT * FROM servicos';
    const cond = [], p = [];
    if (!incluirInativos) cond.push('ativo = 1');
    if (categoria) { cond.push('categoria = ?'); p.push(s(categoria, 30)); }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    return db.prepare(sql + ' ORDER BY ordem, nome').all(...p);
  },
  porSlug(slug) { return db.prepare('SELECT * FROM servicos WHERE slug = ?').get(s(slug, 80)) || null; },
  atualizar(id, d) {
    const sv = db.prepare('SELECT * FROM servicos WHERE id = ? OR slug = ?').get(s(id, 80), s(id, 80));
    if (!sv) throw new Error('Serviço não encontrado.');
    const upd = {
      nome: d.nome != null ? s(d.nome, 120) : sv.nome,
      resumo: d.resumo != null ? s(d.resumo, 300) : sv.resumo,
      entrega: d.entrega != null ? s(d.entrega, 1000) : sv.entrega,
      preco_centavos: d.preco_centavos != null ? cent(d.preco_centavos) : sv.preco_centavos,
      preco_apartir: d.preco_apartir != null ? (d.preco_apartir ? 1 : 0) : sv.preco_apartir,
      prazo: d.prazo != null ? s(d.prazo, 120) : sv.prazo,
      revisoes: d.revisoes != null ? Math.max(0, Math.round(n(d.revisoes, sv.revisoes))) : sv.revisoes,
      ativo: d.ativo != null ? (d.ativo ? 1 : 0) : sv.ativo,
      ordem: d.ordem != null ? Math.round(n(d.ordem, sv.ordem)) : sv.ordem,
    };
    db.prepare(`UPDATE servicos SET nome=?, resumo=?, entrega=?, preco_centavos=?, preco_apartir=?,
      prazo=?, revisoes=?, ativo=?, ordem=?, atualizado_em=? WHERE id = ?`)
      .run(upd.nome, upd.resumo, upd.entrega, upd.preco_centavos, upd.preco_apartir,
        upd.prazo, upd.revisoes, upd.ativo, upd.ordem, nowISO(), sv.id);
    return db.prepare('SELECT * FROM servicos WHERE id = ?').get(sv.id);
  },
};

// ---------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------
const Combos = {
  listar({ incluirInativos = false } = {}) {
    const q = incluirInativos ? 'SELECT * FROM combos ORDER BY ordem' : 'SELECT * FROM combos WHERE ativo = 1 ORDER BY ordem';
    return db.prepare(q).all().map((c) => ({ ...c, itens: j.parse(c.itens, []) }));
  },
  porSlug(slug) {
    const c = db.prepare('SELECT * FROM combos WHERE slug = ?').get(s(slug, 80));
    return c ? { ...c, itens: j.parse(c.itens, []) } : null;
  },
  atualizar(id, d) {
    const cb = db.prepare('SELECT * FROM combos WHERE id = ? OR slug = ?').get(s(id, 80), s(id, 80));
    if (!cb) throw new Error('Combo não encontrado.');
    db.prepare(`UPDATE combos SET nome=?, resumo=?, itens=?, preco_centavos=?, preco_apartir=?,
      destaque=?, ativo=?, ordem=?, atualizado_em=? WHERE id = ?`)
      .run(
        d.nome != null ? s(d.nome, 120) : cb.nome,
        d.resumo != null ? s(d.resumo, 400) : cb.resumo,
        d.itens != null ? j.str(Array.isArray(d.itens) ? d.itens.map((i) => s(i, 200)) : j.parse(cb.itens, [])) : cb.itens,
        d.preco_centavos != null ? cent(d.preco_centavos) : cb.preco_centavos,
        d.preco_apartir != null ? (d.preco_apartir ? 1 : 0) : cb.preco_apartir,
        d.destaque != null ? (d.destaque ? 1 : 0) : cb.destaque,
        d.ativo != null ? (d.ativo ? 1 : 0) : cb.ativo,
        d.ordem != null ? Math.round(n(d.ordem, cb.ordem)) : cb.ordem,
        nowISO(), cb.id
      );
    return Combos.porSlug(cb.slug);
  },
};

// ---------------------------------------------------------------------
// Portfólio
// ---------------------------------------------------------------------
const Portfolio = {
  listar({ incluirOcultos = false } = {}) {
    const q = incluirOcultos ? 'SELECT * FROM portfolio ORDER BY ordem' : 'SELECT * FROM portfolio WHERE publicado = 1 ORDER BY ordem';
    return db.prepare(q).all().map((p) => ({ ...p, servicos: j.parse(p.servicos, []) }));
  },
  porSlug(slug) {
    const p = db.prepare('SELECT * FROM portfolio WHERE slug = ?').get(s(slug, 80));
    return p ? { ...p, servicos: j.parse(p.servicos, []), consentimento: j.parse(p.consentimento, null) } : null;
  },
  salvar(d, { quem = 'staff' } = {}) {
    const agora = nowISO();
    const existente = d.id ? db.prepare('SELECT * FROM portfolio WHERE id = ?').get(s(d.id, 40)) : null;
    // REGRA DE HONESTIDADE: só deixa de ser conceitual com consentimento registrado.
    const querReal = d.conceitual != null && !d.conceitual;
    const consent = d.consentimento && d.consentimento.autorizado_por
      ? { autorizado_por: s(d.consentimento.autorizado_por, 160), data: s(d.consentimento.data, 30) || agora.slice(0, 10), escopo: s(d.consentimento.escopo, 400) }
      : (existente ? j.parse(existente.consentimento, null) : null);
    if (querReal && !(consent && consent.autorizado_por)) {
      throw new Error('Para publicar como caso real é obrigatório registrar o consentimento (autorizado_por, data, escopo).');
    }
    const linha = {
      id: existente ? existente.id : novoId(),
      slug: s(d.slug, 80) || (existente ? existente.slug : slugify(d.titulo)),
      titulo: s(d.titulo, 160) || (existente ? existente.titulo : ''),
      tipo_imovel: d.tipo_imovel != null ? s(d.tipo_imovel, 80) : (existente ? existente.tipo_imovel : ''),
      cidade: d.cidade != null ? s(d.cidade, 80) : (existente ? existente.cidade : 'Brasília · DF'),
      resumo: d.resumo != null ? s(d.resumo, 400) : (existente ? existente.resumo : ''),
      corpo: d.corpo != null ? s(d.corpo, 8000) : (existente ? existente.corpo : ''),
      servicos: j.str(Array.isArray(d.servicos) ? d.servicos.map((x) => s(x, 80)) : (existente ? j.parse(existente.servicos, []) : [])),
      conceitual: d.conceitual != null ? (d.conceitual ? 1 : 0) : (existente ? existente.conceitual : 1),
      consentimento: consent ? j.str(consent) : '',
      capa_url: d.capa_url != null ? s(d.capa_url, 400) : (existente ? existente.capa_url : ''),
      publicado: d.publicado != null ? (d.publicado ? 1 : 0) : (existente ? existente.publicado : 1),
      ordem: d.ordem != null ? Math.round(n(d.ordem, 100)) : (existente ? existente.ordem : 100),
    };
    if (!linha.titulo) throw new Error('Título é obrigatório.');
    db.prepare(`INSERT INTO portfolio (id, slug, titulo, tipo_imovel, cidade, resumo, corpo, servicos, conceitual,
        consentimento, capa_url, publicado, ordem, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, titulo=excluded.titulo, tipo_imovel=excluded.tipo_imovel,
        cidade=excluded.cidade, resumo=excluded.resumo, corpo=excluded.corpo, servicos=excluded.servicos,
        conceitual=excluded.conceitual, consentimento=excluded.consentimento, capa_url=excluded.capa_url,
        publicado=excluded.publicado, ordem=excluded.ordem, atualizado_em=excluded.atualizado_em`)
      .run(linha.id, linha.slug, linha.titulo, linha.tipo_imovel, linha.cidade, linha.resumo, linha.corpo,
        linha.servicos, linha.conceitual, linha.consentimento, linha.capa_url, linha.publicado, linha.ordem,
        existente ? existente.criado_em : agora, agora);
    Auditoria.registrar({ quem, acao: existente ? 'portfolio.editar' : 'portfolio.criar', entidade: 'portfolio', entidade_id: linha.id, detalhe: linha.slug });
    return Portfolio.porSlug(linha.slug);
  },
  remover(id, { quem = 'staff' } = {}) {
    db.prepare('DELETE FROM portfolio WHERE id = ?').run(s(id, 40));
    Auditoria.registrar({ quem, acao: 'portfolio.remover', entidade: 'portfolio', entidade_id: s(id, 40), detalhe: '' });
  },
};

// ---------------------------------------------------------------------
// FAQs e conteúdos
// ---------------------------------------------------------------------
const Faqs = {
  listar({ incluirOcultas = false } = {}) {
    const q = incluirOcultas ? 'SELECT * FROM faqs ORDER BY ordem' : 'SELECT * FROM faqs WHERE publicado = 1 ORDER BY ordem';
    return db.prepare(q).all();
  },
  salvar(d) {
    const id = d.id ? s(d.id, 40) : novoId();
    db.prepare(`INSERT INTO faqs (id, pergunta, resposta, ordem, publicado, criado_em) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET pergunta=excluded.pergunta, resposta=excluded.resposta,
        ordem=excluded.ordem, publicado=excluded.publicado`)
      .run(id, s(d.pergunta, 300), s(d.resposta, 3000), Math.round(n(d.ordem, 100)), d.publicado === false ? 0 : 1, nowISO());
    return db.prepare('SELECT * FROM faqs WHERE id = ?').get(id);
  },
  remover(id) { db.prepare('DELETE FROM faqs WHERE id = ?').run(s(id, 40)); },
};

const Conteudos = {
  listarPublicados() {
    return db.prepare("SELECT * FROM conteudos WHERE status = 'publicado' ORDER BY publicado_em DESC").all();
  },
  listarTodos() { return db.prepare('SELECT * FROM conteudos ORDER BY criado_em DESC').all(); },
  porSlug(slug) { return db.prepare('SELECT * FROM conteudos WHERE slug = ?').get(s(slug, 80)) || null; },
  salvar(d) {
    const agora = nowISO();
    const existente = d.id ? db.prepare('SELECT * FROM conteudos WHERE id = ?').get(s(d.id, 40)) : null;
    const id = existente ? existente.id : novoId();
    const status = d.status === 'publicado' ? 'publicado' : (d.status === 'rascunho' ? 'rascunho' : (existente ? existente.status : 'rascunho'));
    const publicadoEm = status === 'publicado'
      ? ((existente && existente.publicado_em) || agora) : (existente ? existente.publicado_em : '');
    db.prepare(`INSERT INTO conteudos (id, slug, titulo, resumo, corpo, status, publicado_em, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, titulo=excluded.titulo, resumo=excluded.resumo,
        corpo=excluded.corpo, status=excluded.status, publicado_em=excluded.publicado_em, atualizado_em=excluded.atualizado_em`)
      .run(id, s(d.slug, 80) || slugify(d.titulo), s(d.titulo, 200), s(d.resumo, 400), s(d.corpo, 40000),
        status, publicadoEm, existente ? existente.criado_em : agora, agora);
    return db.prepare('SELECT * FROM conteudos WHERE id = ?').get(id);
  },
  remover(id) { db.prepare('DELETE FROM conteudos WHERE id = ?').run(s(id, 40)); },
};

// ---------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------
const Leads = {
  criar(d) {
    const nome = s(d.nome, 160);
    const email = s(d.email, 200).toLowerCase();
    const whatsapp = s(d.whatsapp, 30).replace(/\D/g, '');
    if (!nome) throw new Error('Informe seu nome.');
    if (!email && !whatsapp) throw new Error('Informe e-mail ou WhatsApp para conseguirmos responder.');
    if (!d.consentimento) throw new Error('É preciso autorizar o contato para enviarmos a resposta (LGPD).');
    // dedupe razoável: mesmo contato nas últimas 24 h só atualiza a mensagem
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const dup = db.prepare(`SELECT * FROM leads WHERE criado_em >= ? AND ((email != '' AND email = ?) OR (whatsapp != '' AND whatsapp = ?))
      ORDER BY criado_em DESC LIMIT 1`).get(desde, email, whatsapp);
    if (dup) {
      const msg = [dup.mensagem, s(d.mensagem, 2000)].filter(Boolean).join('\n---\n').slice(0, 4000);
      db.prepare('UPDATE leads SET mensagem = ?, atualizado_em = ? WHERE id = ?').run(msg, nowISO(), dup.id);
      return { ...dup, duplicado: true };
    }
    const linha = {
      id: novoId(), nome, email, whatsapp,
      cidade: s(d.cidade, 120), tipo_imovel: s(d.tipo_imovel, 80), finalidade: s(d.finalidade, 80),
      interesses: j.str(Array.isArray(d.interesses) ? d.interesses.map((x) => s(x, 80)).slice(0, 12) : []),
      mensagem: s(d.mensagem, 2000), origem: s(d.origem, 200), utm: j.str(d.utm && typeof d.utm === 'object' ? d.utm : {}),
      respostas: d.respostas && typeof d.respostas === 'object' ? j.str(d.respostas) : '',
      recomendacao: d.recomendacao && typeof d.recomendacao === 'object' ? j.str(d.recomendacao) : '',
      pontuacao: Math.max(0, Math.min(10, Math.round(n(d.pontuacao, 0)))),
      consentimento: 1, criado_em: nowISO(),
    };
    db.prepare(`INSERT INTO leads (id, nome, email, whatsapp, cidade, tipo_imovel, finalidade, interesses,
        mensagem, origem, utm, respostas, recomendacao, pontuacao, consentimento, status, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'novo', ?)`)
      .run(linha.id, linha.nome, linha.email, linha.whatsapp, linha.cidade, linha.tipo_imovel, linha.finalidade,
        linha.interesses, linha.mensagem, linha.origem, linha.utm, linha.respostas, linha.recomendacao,
        linha.pontuacao, linha.consentimento, linha.criado_em);
    return linha;
  },
  obter(id) {
    const l = db.prepare('SELECT * FROM leads WHERE id = ?').get(s(id, 40));
    return l ? { ...l, interesses: j.parse(l.interesses, []), utm: j.parse(l.utm, {}), respostas: j.parse(l.respostas, null), recomendacao: j.parse(l.recomendacao, null) } : null;
  },
  atualizar(id, d, { quem = 'staff' } = {}) {
    const l = db.prepare('SELECT * FROM leads WHERE id = ?').get(s(id, 40));
    if (!l) throw new Error('Lead não encontrado.');
    db.prepare('UPDATE leads SET responsavel = ?, proxima_acao = ?, nota = ?, atualizado_em = ? WHERE id = ?')
      .run(
        d.responsavel != null ? s(d.responsavel, 120) : l.responsavel,
        d.proxima_acao != null ? s(d.proxima_acao, 300) : l.proxima_acao,
        d.nota != null ? s(d.nota, 1000) : l.nota,
        nowISO(), l.id
      );
    Auditoria.registrar({ quem, acao: 'lead.editar', entidade: 'leads', entidade_id: l.id, detalhe: Object.keys(d).join(',') });
    return Leads.obter(l.id);
  },
  conversaoPorOrigem() {
    return db.prepare(`SELECT COALESCE(NULLIF(origem,''),'(sem origem)') origem, COUNT(*) total,
        SUM(CASE WHEN status='ganho' THEN 1 ELSE 0 END) ganhos
      FROM leads GROUP BY 1 ORDER BY total DESC`).all();
  },
  listar({ status = '', limite = 200 } = {}) {
    const p = [];
    let sql = 'SELECT * FROM leads';
    if (status) { sql += ' WHERE status = ?'; p.push(s(status, 30)); }
    sql += ' ORDER BY criado_em DESC LIMIT ?'; p.push(Math.min(500, Math.max(1, n(limite, 200))));
    return db.prepare(sql).all(...p).map((l) => ({
      ...l, interesses: j.parse(l.interesses, []), utm: j.parse(l.utm, {}),
      respostas: j.parse(l.respostas, null), recomendacao: j.parse(l.recomendacao, null),
    }));
  },
  mudarStatus(id, status, nota, { quem = 'staff', motivo = '' } = {}) {
    if (!STATUS_LEAD.includes(status)) throw new Error('Status inválido: ' + status);
    const l = db.prepare('SELECT * FROM leads WHERE id = ?').get(s(id, 40));
    if (!l) throw new Error('Lead não encontrado.');
    if (status === 'perdido' && !s(motivo, 300) && !l.motivo_perda) {
      throw new Error('Para marcar como perdido, informe o motivo da perda.');
    }
    db.prepare('UPDATE leads SET status = ?, nota = ?, motivo_perda = ?, atualizado_em = ? WHERE id = ?')
      .run(status, nota != null ? s(nota, 1000) : l.nota,
        status === 'perdido' ? (s(motivo, 300) || l.motivo_perda) : l.motivo_perda, nowISO(), l.id);
    Interacoes.registrar(l.id, 'sistema', `status: ${l.status} → ${status}${motivo ? ' (' + s(motivo, 300) + ')' : ''}`, quem);
    Auditoria.registrar({ quem, acao: 'lead.status', entidade: 'leads', entidade_id: l.id, detalhe: `${l.status} → ${status}` });
    return db.prepare('SELECT * FROM leads WHERE id = ?').get(l.id);
  },
};

// ---------------------------------------------------------------------
// Interações e tarefas do funil
// ---------------------------------------------------------------------
const Interacoes = {
  registrar(leadId, tipo, texto, quem = '') {
    const tipos = ['nota', 'whatsapp', 'email', 'ligacao', 'sistema'];
    db.prepare('INSERT INTO interacoes (id, lead_id, tipo, texto, quem, criado_em) VALUES (?,?,?,?,?,?)')
      .run(novoId(), s(leadId, 40), tipos.includes(tipo) ? tipo : 'nota', s(texto, 2000), s(quem, 120), nowISO());
  },
  doLead(leadId) {
    return db.prepare('SELECT * FROM interacoes WHERE lead_id = ? ORDER BY criado_em DESC LIMIT 200').all(s(leadId, 40));
  },
};

const Tarefas = {
  criar({ lead_id = '', texto, vence_em = '', quem = '' }) {
    if (!s(texto, 300)) throw new Error('Texto da tarefa é obrigatório.');
    const id = novoId();
    db.prepare('INSERT INTO tarefas (id, lead_id, texto, vence_em, quem, criado_em) VALUES (?,?,?,?,?,?)')
      .run(id, s(lead_id, 40), s(texto, 300), s(vence_em, 10), s(quem, 120), nowISO());
    return db.prepare('SELECT * FROM tarefas WHERE id = ?').get(id);
  },
  concluir(id) {
    db.prepare('UPDATE tarefas SET feita = 1, feita_em = ? WHERE id = ?').run(nowISO(), s(id, 40));
  },
  listar({ lead_id = '', pendentes = true } = {}) {
    const cond = [], p = [];
    if (lead_id) { cond.push('lead_id = ?'); p.push(s(lead_id, 40)); }
    if (pendentes) cond.push('feita = 0');
    return db.prepare(`SELECT * FROM tarefas${cond.length ? ' WHERE ' + cond.join(' AND ') : ''} ORDER BY CASE WHEN vence_em='' THEN 1 ELSE 0 END, vence_em, criado_em LIMIT 300`).all(...p);
  },
};

// ---------------------------------------------------------------------
// Propostas — itens são SNAPSHOT (imunes a edição posterior de preço)
// ---------------------------------------------------------------------
const { novoToken } = require('./db');
const Propostas = {
  _mapa(p) {
    return p ? { ...p, itens: j.parse(p.itens, []), aceite: j.parse(p.aceite, null) } : null;
  },
  criar({ lead_id, itens = [], desconto_pct = 0, motivo_desconto = '', validade_dias = 7, nota = '' }, { quem = 'staff' } = {}) {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(s(lead_id, 40));
    if (!lead) throw new Error('Lead não encontrado.');
    if (!Array.isArray(itens) || !itens.length) throw new Error('A proposta precisa de pelo menos um item.');
    const snapshot = itens.map((it) => {
      const slug = s(typeof it === 'string' ? it : it.slug, 80);
      const qtd = Math.max(1, Math.round(n(typeof it === 'object' ? it.qtd : 1, 1)));
      const sv = Servicos.porSlug(slug);
      const cb = sv ? null : Combos.porSlug(slug);
      if (!sv && !cb) throw new Error('Item fora do catálogo: ' + slug);
      const alvo = sv || cb;
      return { slug, nome: alvo.nome, preco_centavos: alvo.preco_centavos, qtd };
    });
    const subtotal = snapshot.reduce((t, it) => t + it.preco_centavos * it.qtd, 0);
    const pct = Math.max(0, Math.min(50, Math.round(n(desconto_pct, 0)))); // teto de 50%: erro de digitação não vira prejuízo
    const total = Math.round(subtotal * (100 - pct) / 100);
    const id = novoId(), token = novoToken(), agora = nowISO();
    db.prepare(`INSERT INTO propostas (id, token, lead_id, itens, subtotal_centavos, desconto_pct,
        motivo_desconto, total_centavos, validade_dias, nota, status, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'rascunho', ?)`)
      .run(id, token, lead.id, j.str(snapshot), subtotal, pct, s(motivo_desconto, 200), total,
        Math.max(1, Math.min(60, Math.round(n(validade_dias, 7)))), s(nota, 1000), agora);
    Auditoria.registrar({ quem, acao: 'proposta.criar', entidade: 'propostas', entidade_id: id, detalhe: `${lead.nome} · ${total} centavos` });
    return Propostas._mapa(db.prepare('SELECT * FROM propostas WHERE id = ?').get(id));
  },
  enviar(id, { quem = 'staff' } = {}) {
    const p = db.prepare('SELECT * FROM propostas WHERE id = ?').get(s(id, 40));
    if (!p) throw new Error('Proposta não encontrada.');
    if (p.status === 'aceita') throw new Error('Proposta já aceita — não reenvie; crie outra se precisar.');
    db.prepare("UPDATE propostas SET status = 'enviada', enviada_em = ?, atualizado_em = ? WHERE id = ?")
      .run(nowISO(), nowISO(), p.id);
    db.prepare("UPDATE leads SET status = 'proposta', atualizado_em = ? WHERE id = ? AND status IN ('novo','em_contato')")
      .run(nowISO(), p.lead_id);
    Interacoes.registrar(p.lead_id, 'sistema', 'proposta enviada (' + p.id + ')', quem);
    Auditoria.registrar({ quem, acao: 'proposta.enviar', entidade: 'propostas', entidade_id: p.id, detalhe: '' });
    return Propostas._mapa(db.prepare('SELECT * FROM propostas WHERE id = ?').get(p.id));
  },
  porToken(token) {
    const p = db.prepare('SELECT * FROM propostas WHERE token = ?').get(s(token, 60));
    if (!p) return null;
    // expiração avaliada na leitura (sem cron): enviada + validade vencida = expirada
    if (p.status === 'enviada' && p.enviada_em) {
      const limite = Date.parse(p.enviada_em) + p.validade_dias * 86400000;
      if (Date.now() > limite) {
        db.prepare("UPDATE propostas SET status = 'expirada', atualizado_em = ? WHERE id = ?").run(nowISO(), p.id);
        p.status = 'expirada';
      }
    }
    return Propostas._mapa(p);
  },
  aceitar(token, { nome, ip = '' } = {}) {
    const p = Propostas.porToken(token);
    if (!p) throw new Error('Proposta não encontrada.');
    if (p.status === 'aceita') throw new Error('Esta proposta já foi aceita.');
    if (p.status === 'expirada') throw new Error('Esta proposta expirou. Peça uma atualização pelo contato.');
    if (p.status !== 'enviada') throw new Error('Esta proposta ainda não está disponível para aceite.');
    if (!s(nome, 160)) throw new Error('Informe seu nome completo para registrar o aceite.');
    const aceite = { nome: s(nome, 160), ip: s(ip, 60), em: nowISO(), termos_versao: TERMOS_VERSAO };
    return transacao(() => {
      db.prepare("UPDATE propostas SET status = 'aceita', aceite = ?, atualizado_em = ? WHERE id = ?")
        .run(j.str(aceite), nowISO(), p.id);
      db.prepare("UPDATE leads SET status = 'ganho', atualizado_em = ? WHERE id = ?").run(nowISO(), p.lead_id);
      Interacoes.registrar(p.lead_id, 'sistema', `proposta aceita por ${aceite.nome} (termos ${TERMOS_VERSAO})`, 'cliente');
      Auditoria.registrar({ quem: aceite.nome, acao: 'proposta.aceitar', entidade: 'propostas', entidade_id: p.id, detalhe: 'termos ' + TERMOS_VERSAO, ip: aceite.ip });
      return Propostas._mapa(db.prepare('SELECT * FROM propostas WHERE id = ?').get(p.id));
    });
  },
  marcarStatus(id, status, { quem = 'staff' } = {}) {
    if (!['recusada', 'expirada'].includes(status)) throw new Error('Só é possível marcar recusada ou expirada manualmente.');
    const p = db.prepare('SELECT * FROM propostas WHERE id = ?').get(s(id, 40));
    if (!p) throw new Error('Proposta não encontrada.');
    if (p.status === 'aceita') throw new Error('Proposta aceita não muda de status.');
    db.prepare('UPDATE propostas SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), p.id);
    Auditoria.registrar({ quem, acao: 'proposta.' + status, entidade: 'propostas', entidade_id: p.id, detalhe: '' });
    return Propostas._mapa(db.prepare('SELECT * FROM propostas WHERE id = ?').get(p.id));
  },
  listar({ lead_id = '' } = {}) {
    const p = lead_id
      ? db.prepare('SELECT * FROM propostas WHERE lead_id = ? ORDER BY criado_em DESC').all(s(lead_id, 40))
      : db.prepare('SELECT * FROM propostas ORDER BY criado_em DESC LIMIT 300').all();
    return p.map(Propostas._mapa);
  },
};

// ---------------------------------------------------------------------
// Onda 3 — Clientes (conta do cliente final)
// ---------------------------------------------------------------------
const bcrypt = require('bcryptjs');

const Clientes = {
  criar({ nome, email, senha = '', whatsapp = '', aceite_termos = false }) {
    const n2 = s(nome, 160), e = s(email, 200).toLowerCase();
    if (!n2) throw new Error('Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('E-mail inválido.');
    if (senha && String(senha).length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
    if (!aceite_termos) throw new Error('É preciso aceitar os Termos de Serviço.');
    if (db.prepare('SELECT 1 FROM clientes WHERE email = ?').get(e)) throw new Error('Já existe conta com este e-mail. Use "esqueci a senha" se precisar.');
    const id = novoId();
    db.prepare(`INSERT INTO clientes (id, nome, email, senha_hash, whatsapp, status, aceite_termos, criado_em)
      VALUES (?,?,?,?,?, 'ativo', ?, ?)`)
      .run(id, n2, e, senha ? bcrypt.hashSync(String(senha), 10) : '', s(whatsapp, 30).replace(/\D/g, ''), TERMOS_VERSAO, nowISO());
    return Clientes.obter(id);
  },
  obter(id) {
    const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(s(id, 40));
    if (!c) return null;
    const { senha_hash, ...pub } = c;
    return { ...pub, tem_senha: !!senha_hash };
  },
  porEmail(email) { return db.prepare('SELECT * FROM clientes WHERE email = ?').get(s(email, 200).toLowerCase()) || null; },
  autenticar(email, senha) {
    const c = Clientes.porEmail(email);
    if (!c || c.status !== 'ativo' || !c.senha_hash) return null;
    return bcrypt.compareSync(String(senha || ''), c.senha_hash) ? Clientes.obter(c.id) : null;
  },
  definirSenha(id, senha) {
    if (String(senha || '').length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
    db.prepare('UPDATE clientes SET senha_hash = ?, atualizado_em = ? WHERE id = ?')
      .run(bcrypt.hashSync(String(senha), 10), nowISO(), s(id, 40));
  },
  atualizar(id, d) {
    const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(s(id, 40));
    if (!c) throw new Error('Conta não encontrada.');
    db.prepare('UPDATE clientes SET nome = ?, whatsapp = ?, atualizado_em = ? WHERE id = ?')
      .run(d.nome != null ? (s(d.nome, 160) || c.nome) : c.nome,
        d.whatsapp != null ? s(d.whatsapp, 30).replace(/\D/g, '') : c.whatsapp, nowISO(), c.id);
    return Clientes.obter(c.id);
  },
  listar() {
    return db.prepare("SELECT id, nome, email, whatsapp, status, criado_em FROM clientes WHERE status != 'excluido' ORDER BY criado_em DESC LIMIT 500").all();
  },
  // LGPD: exclusão = anonimizar (projetos/histórico ficam, sem dado pessoal).
  excluir(id) {
    const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(s(id, 40));
    if (!c) throw new Error('Conta não encontrada.');
    const ativos = db.prepare(`SELECT COUNT(*) c FROM projetos WHERE cliente_id = ?
      AND status NOT IN ('completed','archived','cancelled','delivered')`).get(c.id).c;
    if (ativos) throw new Error('Há projeto em andamento nesta conta. Conclua ou cancele antes de excluir (fale com a equipe).');
    transacao(() => {
      db.prepare(`UPDATE clientes SET nome = 'Conta excluída', email = ?, senha_hash = '', whatsapp = '',
        status = 'excluido', atualizado_em = ? WHERE id = ?`)
        .run('excluido-' + c.id + '@anon.invalid', nowISO(), c.id);
      db.prepare("UPDATE imoveis SET endereco = '', acesso = '', contato_local = '' WHERE cliente_id = ?").run(c.id);
      Auditoria.registrar({ quem: c.email, acao: 'cliente.excluir_lgpd', entidade: 'clientes', entidade_id: c.id, detalhe: 'anonimizado' });
    });
  },
};

// ---------------------------------------------------------------------
// Onda 3 — Imóveis (endereço e acesso são PRIVADOS)
// ---------------------------------------------------------------------
const Imoveis = {
  salvar(clienteId, d) {
    const existente = d.id ? db.prepare('SELECT * FROM imoveis WHERE id = ? AND cliente_id = ?').get(s(d.id, 40), s(clienteId, 40)) : null;
    if (d.id && !existente) throw new Error('Imóvel não encontrado.');
    const linha = {
      id: existente ? existente.id : novoId(),
      nome: s(d.nome, 120) || (existente ? existente.nome : ''),
      tipo: d.tipo != null ? s(d.tipo, 80) : (existente ? existente.tipo : ''),
      finalidade: d.finalidade != null ? s(d.finalidade, 80) : (existente ? existente.finalidade : ''),
      endereco: d.endereco != null ? s(d.endereco, 400) : (existente ? existente.endereco : ''),
      cidade: d.cidade != null ? s(d.cidade, 120) : (existente ? existente.cidade : ''),
      area_m2: d.area_m2 != null ? s(d.area_m2, 20) : (existente ? existente.area_m2 : ''),
      ambientes: d.ambientes != null ? Math.max(0, Math.round(n(d.ambientes, 0))) : (existente ? existente.ambientes : 0),
      plataformas: d.plataformas != null
        ? j.str((Array.isArray(d.plataformas) ? d.plataformas : []).slice(0, 10).map((p) => ({ nome: s(p.nome, 60), link: s(p.link, 400) })))
        : (existente ? existente.plataformas : '[]'),
      acesso: d.acesso != null ? s(d.acesso, 1000) : (existente ? existente.acesso : ''),
      contato_local: d.contato_local != null ? s(d.contato_local, 200) : (existente ? existente.contato_local : ''),
    };
    if (!linha.nome) throw new Error('Dê um nome ao imóvel (ex.: "Casa do Lago").');
    db.prepare(`INSERT INTO imoveis (id, cliente_id, nome, tipo, finalidade, endereco, cidade, area_m2,
        ambientes, plataformas, acesso, contato_local, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, tipo=excluded.tipo, finalidade=excluded.finalidade,
        endereco=excluded.endereco, cidade=excluded.cidade, area_m2=excluded.area_m2, ambientes=excluded.ambientes,
        plataformas=excluded.plataformas, acesso=excluded.acesso, contato_local=excluded.contato_local,
        atualizado_em=excluded.atualizado_em`)
      .run(linha.id, s(clienteId, 40), linha.nome, linha.tipo, linha.finalidade, linha.endereco, linha.cidade,
        linha.area_m2, linha.ambientes, linha.plataformas, linha.acesso, linha.contato_local,
        existente ? existente.criado_em : nowISO(), nowISO());
    return Imoveis.obter(clienteId, linha.id);
  },
  obter(clienteId, id) {
    const i = db.prepare('SELECT * FROM imoveis WHERE id = ? AND cliente_id = ?').get(s(id, 40), s(clienteId, 40));
    return i ? { ...i, plataformas: j.parse(i.plataformas, []) } : null;
  },
  doCliente(clienteId) {
    return db.prepare('SELECT * FROM imoveis WHERE cliente_id = ? ORDER BY criado_em DESC').all(s(clienteId, 40))
      .map((i) => ({ ...i, plataformas: j.parse(i.plataformas, []) }));
  },
  remover(clienteId, id) {
    const emUso = db.prepare(`SELECT COUNT(*) c FROM projetos WHERE imovel_id = ? AND cliente_id = ?
      AND status NOT IN ('completed','archived','cancelled')`).get(s(id, 40), s(clienteId, 40)).c;
    if (emUso) throw new Error('Este imóvel tem projeto em andamento — não dá para remover agora.');
    db.prepare('DELETE FROM imoveis WHERE id = ? AND cliente_id = ?').run(s(id, 40), s(clienteId, 40));
  },
};

// ---------------------------------------------------------------------
// Onda 3 — Projetos: a máquina de estados da spec (18 status)
// ---------------------------------------------------------------------
const STATUS_PROJETO = {
  lead: 'Contato inicial', qualification: 'Qualificação', feasibility: 'Análise de viabilidade',
  proposal_sent: 'Proposta enviada', awaiting_acceptance: 'Aguardando aceite', awaiting_payment: 'Aguardando pagamento',
  briefing_pending: 'Briefing pendente', scheduling: 'Agendamento', production: 'Em produção',
  quality_control: 'Controle de qualidade', client_review: 'Em revisão pelo cliente', changes_requested: 'Ajustes solicitados',
  approved: 'Aprovado', delivered: 'Entregue', portfolio_consent: 'Consentimento de portfólio',
  completed: 'Concluído', archived: 'Arquivado', cancelled: 'Cancelado',
};
// Caminho feliz + saídas laterais. Qualquer status não-terminal pode ir a cancelled.
const TRANSICOES = {
  lead: ['qualification'],
  qualification: ['feasibility'],
  feasibility: ['proposal_sent'],
  proposal_sent: ['awaiting_acceptance'],
  awaiting_acceptance: ['awaiting_payment'],
  awaiting_payment: ['briefing_pending'],
  briefing_pending: ['scheduling'],
  scheduling: ['production'],
  production: ['quality_control'],
  quality_control: ['client_review', 'production'],
  client_review: ['changes_requested', 'approved'],
  changes_requested: ['production'],
  approved: ['delivered'],
  delivered: ['portfolio_consent', 'completed'],
  portfolio_consent: ['completed'],
  completed: ['archived'],
  archived: [],
  cancelled: ['archived'],
};
const TERMINAIS = ['completed', 'archived', 'cancelled'];

const Projetos = {
  _mapa(p) { return p ? { ...p, itens: j.parse(p.itens, []), briefing: j.parse(p.briefing, null) } : null; },
  criar({ cliente_id, imovel_id = '', lead_id = '', proposta_id = '', titulo, itens = [], total_centavos = 0, status = 'awaiting_payment', responsavel = '', prazo_em = '' }, { quem = 'staff' } = {}) {
    if (!db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(s(cliente_id, 40))) throw new Error('Cliente não encontrado.');
    if (!s(titulo, 200)) throw new Error('Título do projeto é obrigatório.');
    if (!STATUS_PROJETO[status]) throw new Error('Status inválido: ' + status);
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO projetos (id, cliente_id, imovel_id, lead_id, proposta_id, titulo, itens,
        total_centavos, status, responsavel, prazo_em, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, s(cliente_id, 40), s(imovel_id, 40), s(lead_id, 40), s(proposta_id, 40), s(titulo, 200),
        j.str(Array.isArray(itens) ? itens : []), cent(total_centavos), status, s(responsavel, 120), s(prazo_em, 10), agora);
    db.prepare('INSERT INTO projeto_eventos (id, projeto_id, de, para, quem, justificativa, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), id, '', status, s(quem, 120), 'projeto criado', agora);
    Auditoria.registrar({ quem, acao: 'projeto.criar', entidade: 'projetos', entidade_id: id, detalhe: s(titulo, 120) });
    return Projetos.obter(id);
  },
  // Cria a partir de proposta ACEITA: snapshot dos itens/total, cliente por e-mail do lead.
  criarDeProposta(propostaId, { quem = 'staff' } = {}) {
    const p = Propostas._mapa(db.prepare('SELECT * FROM propostas WHERE id = ?').get(s(propostaId, 40)));
    if (!p) throw new Error('Proposta não encontrada.');
    if (p.status !== 'aceita') throw new Error('Só proposta ACEITA vira projeto.');
    if (db.prepare('SELECT 1 FROM projetos WHERE proposta_id = ?').get(p.id)) throw new Error('Esta proposta já tem projeto.');
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(p.lead_id);
    if (!lead || !lead.email) throw new Error('O lead da proposta não tem e-mail — crie a conta do cliente manualmente.');
    let cliente = Clientes.porEmail(lead.email);
    let clienteNovo = false;
    if (!cliente) {
      // convite: conta sem senha (define pelo fluxo de recuperação) — aceite formal da
      // proposta já registrou os termos; a conta nasce vinculada a ele.
      const id = novoId();
      db.prepare(`INSERT INTO clientes (id, nome, email, senha_hash, whatsapp, status, aceite_termos, criado_em)
        VALUES (?,?,?, '', ?, 'ativo', ?, ?)`)
        .run(id, lead.nome, lead.email.toLowerCase(), s(lead.whatsapp, 30), TERMOS_VERSAO, nowISO());
      cliente = Clientes.obter(id);
      clienteNovo = true;
    }
    const projeto = Projetos.criar({
      cliente_id: cliente.id, lead_id: lead.id, proposta_id: p.id,
      titulo: p.itens.map((i) => i.nome).join(' + '),
      itens: p.itens, total_centavos: p.total_centavos, status: 'awaiting_payment',
    }, { quem });
    return { projeto, cliente, clienteNovo };
  },
  obter(id) { return Projetos._mapa(db.prepare('SELECT * FROM projetos WHERE id = ?').get(s(id, 40))); },
  doCliente(clienteId, id = '') {
    if (id) {
      const p = db.prepare('SELECT * FROM projetos WHERE id = ? AND cliente_id = ?').get(s(id, 40), s(clienteId, 40));
      return Projetos._mapa(p);
    }
    return db.prepare('SELECT * FROM projetos WHERE cliente_id = ? ORDER BY criado_em DESC').all(s(clienteId, 40)).map(Projetos._mapa);
  },
  listar({ status = '' } = {}) {
    const p = status
      ? db.prepare('SELECT * FROM projetos WHERE status = ? ORDER BY criado_em DESC LIMIT 300').all(s(status, 40))
      : db.prepare('SELECT * FROM projetos ORDER BY criado_em DESC LIMIT 300').all();
    return p.map(Projetos._mapa);
  },
  mudarStatus(id, para, { quem = 'staff', justificativa = '' } = {}) {
    const p = db.prepare('SELECT * FROM projetos WHERE id = ?').get(s(id, 40));
    if (!p) throw new Error('Projeto não encontrado.');
    if (!STATUS_PROJETO[para]) throw new Error('Status inválido: ' + para);
    const permitidas = TRANSICOES[p.status] || [];
    const podeCancelar = para === 'cancelled' && !TERMINAIS.includes(p.status);
    if (!permitidas.includes(para) && !podeCancelar) {
      throw new Error(`Transição inválida: ${p.status} → ${para}. Permitidas: ${[...permitidas, ...(TERMINAIS.includes(p.status) ? [] : ['cancelled'])].join(', ') || 'nenhuma'}.`);
    }
    if ((para === 'cancelled' || !permitidas.includes(para)) && !s(justificativa, 500) && para === 'cancelled') {
      throw new Error('Cancelamento exige justificativa.');
    }
    const agora = nowISO();
    transacao(() => {
      db.prepare('UPDATE projetos SET status = ?, atualizado_em = ? WHERE id = ?').run(para, agora, p.id);
      db.prepare('INSERT INTO projeto_eventos (id, projeto_id, de, para, quem, justificativa, criado_em) VALUES (?,?,?,?,?,?,?)')
        .run(novoId(), p.id, p.status, para, s(quem, 120), s(justificativa, 500), agora);
      Auditoria.registrar({ quem, acao: 'projeto.status', entidade: 'projetos', entidade_id: p.id, detalhe: `${p.status} → ${para}` });
    });
    return Projetos.obter(p.id);
  },
  atualizar(id, d, { quem = 'staff' } = {}) {
    const p = db.prepare('SELECT * FROM projetos WHERE id = ?').get(s(id, 40));
    if (!p) throw new Error('Projeto não encontrado.');
    db.prepare('UPDATE projetos SET responsavel = ?, prazo_em = ?, agenda_em = ?, imovel_id = ?, atualizado_em = ? WHERE id = ?')
      .run(d.responsavel != null ? s(d.responsavel, 120) : p.responsavel,
        d.prazo_em != null ? s(d.prazo_em, 10) : p.prazo_em,
        d.agenda_em != null ? s(d.agenda_em, 20) : p.agenda_em,
        d.imovel_id != null ? s(d.imovel_id, 40) : p.imovel_id,
        nowISO(), p.id);
    Auditoria.registrar({ quem, acao: 'projeto.editar', entidade: 'projetos', entidade_id: p.id, detalhe: Object.keys(d).join(',') });
    return Projetos.obter(p.id);
  },
  // Briefing: o CLIENTE preenche; travado depois que a produção começa.
  salvarBriefing(clienteId, id, briefing) {
    const p = db.prepare('SELECT * FROM projetos WHERE id = ? AND cliente_id = ?').get(s(id, 40), s(clienteId, 40));
    if (!p) throw new Error('Projeto não encontrado.');
    const editaveis = ['awaiting_payment', 'briefing_pending', 'scheduling'];
    if (!editaveis.includes(p.status)) throw new Error('O briefing não pode mais ser alterado nesta fase — fale com a equipe pelas mensagens.');
    const b = {
      objetivo: s((briefing || {}).objetivo, 1000),
      destaques: s((briefing || {}).destaques, 1000),
      restricoes: s((briefing || {}).restricoes, 1000),
      referencias: s((briefing || {}).referencias, 1000),
      disponibilidade: s((briefing || {}).disponibilidade, 500),
      observacoes: s((briefing || {}).observacoes, 1000),
    };
    db.prepare('UPDATE projetos SET briefing = ?, briefing_em = ?, atualizado_em = ? WHERE id = ?')
      .run(j.str(b), nowISO(), nowISO(), p.id);
    return Projetos.obter(p.id);
  },
  eventos(id) { return db.prepare('SELECT * FROM projeto_eventos WHERE projeto_id = ? ORDER BY criado_em').all(s(id, 40)); },
};

// ---------------------------------------------------------------------
// Onda 3 — Mensagens do projeto
// ---------------------------------------------------------------------
const Mensagens = {
  enviar(projetoId, { autor, autor_nome = '', texto }) {
    if (!['cliente', 'equipe'].includes(autor)) throw new Error('Autor inválido.');
    if (!s(texto, 4000)) throw new Error('Mensagem vazia.');
    const id = novoId();
    db.prepare('INSERT INTO mensagens (id, projeto_id, autor, autor_nome, texto, criado_em) VALUES (?,?,?,?,?,?)')
      .run(id, s(projetoId, 40), autor, s(autor_nome, 120), s(texto, 4000), nowISO());
    return db.prepare('SELECT * FROM mensagens WHERE id = ?').get(id);
  },
  doProjeto(projetoId) {
    return db.prepare('SELECT * FROM mensagens WHERE projeto_id = ? ORDER BY criado_em LIMIT 500').all(s(projetoId, 40));
  },
};

// ---------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------
const Auditoria = {
  registrar({ quem = '', acao = '', entidade = '', entidade_id = '', detalhe = '', ip = '' } = {}) {
    db.prepare('INSERT INTO auditoria (id, quem, acao, entidade, entidade_id, detalhe, ip, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(novoId(), s(quem, 120), s(acao, 80), s(entidade, 60), s(entidade_id, 60), s(detalhe, 600), s(ip, 60), nowISO());
  },
  listar(limite = 200) {
    return db.prepare('SELECT * FROM auditoria ORDER BY criado_em DESC LIMIT ?').all(Math.min(1000, Math.max(1, n(limite, 200))));
  },
};

// ---------------------------------------------------------------------
// Seed (idempotente: INSERT OR IGNORE — nunca sobrescreve edição do admin)
// ---------------------------------------------------------------------
const SERVICOS_SEED = [
  { slug: 'video-ia-essencial', nome: 'Vídeo IA Essencial', categoria: 'video_ia', preco: 17900, ordem: 10,
    resumo: 'Vídeo de 30 s a partir das fotos que você já tem.',
    entrega: 'Até 12 fotos, vídeo de 30 segundos, 1 formato e 1 revisão.', prazo: '3–5 dias úteis', revisoes: 1 },
  { slug: 'video-ia-destaque', nome: 'Vídeo IA Destaque', categoria: 'video_ia', preco: 32900, ordem: 20,
    resumo: 'Vertical + horizontal, com texto e música.',
    entrega: 'Até 20 fotos, 45–60 segundos, versões vertical e horizontal, texto, música e 2 revisões.', prazo: '3–5 dias úteis', revisoes: 2 },
  { slug: 'video-ia-premium', nome: 'Vídeo IA Premium', categoria: 'video_ia', preco: 47900, ordem: 30,
    resumo: 'Três formatos, identidade e narração opcional.',
    entrega: 'Até 30 fotos, 60–75 segundos, 3 formatos, identidade visual, narração opcional e 2 revisões.', prazo: '3–5 dias úteis', revisoes: 2 },
  { slug: 'drone-essencial', nome: 'Drone Essencial', categoria: 'drone', preco: 69000, ordem: 40,
    resumo: 'Captação aérea e vídeo final de até 30 s.',
    entrega: 'Até 45 minutos de captação e vídeo final de até 30 segundos.', prazo: '5–7 dias úteis após a captação', revisoes: 1 },
  { slug: 'drone-destaque', nome: 'Drone Destaque', categoria: 'drone', preco: 99000, ordem: 50,
    resumo: 'Captação ampliada e vídeo em 2 formatos.',
    entrega: 'Até 90 minutos de captação, seleção ampliada e vídeo de 45–60 segundos em 2 formatos.', prazo: '5–7 dias úteis após a captação', revisoes: 1 },
  { slug: 'fotos-360', nome: 'Fotos 360°', categoria: 'foto360', preco: 59000, ordem: 60,
    resumo: 'Até 6 panoramas fotografados e tratados.',
    entrega: 'Até 6 panoramas 360° fotografados profissionalmente e tratados.', prazo: 'até 5 dias úteis', revisoes: 1 },
  { slug: 'fotos-360-ampliado', nome: 'Fotos 360° Ampliado', categoria: 'foto360', preco: 89000, ordem: 70,
    resumo: 'Até 12 panoramas fotografados e tratados.',
    entrega: 'Até 12 panoramas 360° fotografados profissionalmente e tratados.', prazo: 'até 5 dias úteis', revisoes: 1 },
  { slug: 'montagem-tour', nome: 'Montagem de Tour Virtual', categoria: 'tour', preco: 39000, ordem: 80,
    resumo: 'Tour navegável com até 8 pontos fornecidos por você.',
    entrega: 'Tour virtual navegável com até 8 pontos (panoramas fornecidos pelo cliente), link e incorporação.', prazo: 'até 7 dias úteis', revisoes: 1 },
  { slug: 'ponto-adicional', nome: 'Ponto adicional de tour', categoria: 'adicional', preco: 7000, ordem: 90, unidade: 'ponto',
    resumo: 'Captura, tratamento e inclusão de 1 ponto extra.',
    entrega: 'Captura, tratamento e inclusão de 1 ponto adicional no tour.', prazo: '', revisoes: 0 },
  { slug: 'hospedagem-mensal', nome: 'Hospedagem do tour (mensal)', categoria: 'hospedagem', preco: 2900, ordem: 100, unidade: 'mes',
    resumo: 'Hospedagem, link e incorporação após a franquia.',
    entrega: 'Hospedagem do tour com link exclusivo, incorporação e estatísticas, após a franquia incluída no pacote.', prazo: '', revisoes: 0 },
  { slug: 'hospedagem-anual', nome: 'Hospedagem do tour (anual)', categoria: 'hospedagem', preco: 29000, ordem: 110, unidade: 'ano',
    resumo: 'Doze meses de hospedagem pelo preço de dez.',
    entrega: 'Hospedagem do tour por 12 meses com link exclusivo, incorporação e estatísticas.', prazo: '', revisoes: 0 },
];

const COMBOS_SEED = [
  { slug: 'presenca-visual', nome: 'Presença Visual', preco: 94900, ordem: 10,
    resumo: 'O par que faz o anúncio se destacar: vídeo com as suas fotos + imagens aéreas.',
    itens: ['Vídeo IA Destaque completo', 'Drone Essencial (até 45 min de captação)', 'Versões prontas para anúncio, Reels e WhatsApp'] },
  { slug: 'imersao-360', nome: 'Imersão 360', preco: 84900, ordem: 20,
    resumo: 'O hóspede entende o espaço antes de reservar: panoramas + tour navegável no ar.',
    itens: ['Até 6 fotos panorâmicas 360° tratadas', 'Montagem do tour virtual navegável', '6 meses de hospedagem incluídos', 'Link exclusivo e código de incorporação'] },
  { slug: 'alta-vista-completo', nome: 'Alta Vista Completo', preco: 169000, ordem: 30, destaque: 1,
    resumo: 'A presença visual inteira do seu espaço: aéreas, vídeo, panoramas e tour por 12 meses.',
    itens: ['Drone Destaque (até 90 min de captação)', 'Vídeo IA Destaque', 'Até 6 fotos 360°', 'Tour virtual navegável', 'Vídeo em 2 formatos', '12 meses de hospedagem do tour'] },
  { slug: 'alta-vista-premium', nome: 'Alta Vista Premium', preco: 239000, ordem: 40, apartir: 1,
    resumo: 'Para portfólios e projetos maiores, com estratégia e prioridade de agenda.',
    itens: ['Briefing estratégico', 'Captação ampliada', 'Vídeo IA Premium', 'Até 12 pontos 360°', 'Tour personalizado com a sua identidade', 'Prioridade de agenda'] },
];

const PORTFOLIO_SEED = [
  { slug: 'apartamento-compacto', titulo: 'Apartamento compacto que parece maior do que é', tipo_imovel: 'Apartamento compacto', ordem: 10,
    servicos: ['video-ia-destaque', 'fotos-360'],
    resumo: 'Demonstração de como vídeo com IA e panoramas 360° dão sensação de amplitude a um studio de temporada.',
    corpo: 'Neste projeto conceitual, simulamos o pacote ideal para um studio de 32 m²: vídeo vertical de 45 segundos criado a partir de 18 fotos existentes, com texto e trilha, e 4 panoramas 360° que mostram a integração entre os ambientes. O objetivo demonstrado: o hóspede entender a distribuição real do espaço antes de reservar, sem surpresa no check-in.' },
  { slug: 'flat-executivo', titulo: 'Flat executivo com foco no viajante a trabalho', tipo_imovel: 'Flat executivo', ordem: 20,
    servicos: ['video-ia-essencial', 'montagem-tour'],
    resumo: 'Demonstração de tour virtual e vídeo curto pensados para quem decide a reserva em minutos.',
    corpo: 'Projeto conceitual para um flat executivo: tour de 6 pontos (quarto, área de trabalho, banheiro, cozinha compacta, academia e recepção do prédio) e vídeo de 30 segundos para o anúncio. A demonstração destaca a mesa de trabalho, a internet e a proximidade de centros empresariais — os três fatores que mais pesam para o viajante corporativo.' },
  { slug: 'casa-de-temporada', titulo: 'Casa de temporada com área externa como protagonista', tipo_imovel: 'Casa de temporada', ordem: 30,
    servicos: ['drone-destaque', 'video-ia-destaque', 'fotos-360'],
    resumo: 'Demonstração do pacote completo: imagens aéreas, vídeo e panoramas para uma casa com piscina e jardim.',
    corpo: 'Projeto conceitual de captação completa para casa de temporada: voo de drone mostrando o terreno, a piscina e a vizinhança arborizada; vídeo de 60 segundos em dois formatos; e 6 panoramas 360° dos ambientes sociais. A demonstração mostra como a perspectiva aérea comunica o que nenhuma foto interna consegue: a privacidade do lote e a área externa completa.' },
  { slug: 'pousada', titulo: 'Pousada com 8 acomodações e áreas comuns', tipo_imovel: 'Pousada', ordem: 40,
    servicos: ['fotos-360-ampliado', 'montagem-tour', 'drone-essencial'],
    resumo: 'Demonstração de tour multi-ambientes: recepção, restaurante, piscina e categorias de quarto.',
    corpo: 'Projeto conceitual para uma pousada: 12 panoramas 360° cobrindo recepção, restaurante, piscina e uma acomodação de cada categoria, montados em tour navegável com identidade da pousada. Complemento aéreo com drone para situar o terreno. A demonstração mostra como um tour reduz a assimetria entre a expectativa e a chegada — quem reserva já viu o quarto exato da categoria.' },
  { slug: 'imovel-a-venda', titulo: 'Imóvel à venda com visita virtual antes da visita real', tipo_imovel: 'Imóvel à venda', ordem: 50,
    servicos: ['montagem-tour', 'drone-essencial', 'video-ia-premium'],
    resumo: 'Demonstração para corretores: tour 360°, vídeo e aéreas filtram visitas e qualificam compradores.',
    corpo: 'Projeto conceitual voltado a corretores e imobiliárias: tour virtual de 8 pontos, vídeo de 75 segundos com narração e captação aérea do lote e da rua. A demonstração ilustra o uso típico: o corretor envia o tour antes da visita presencial, o interessado se qualifica sozinho e as visitas físicas passam a ser feitas por quem já gostou do imóvel.' },
];

const FAQS_SEED = [
  { o: 10, p: 'Vocês atendem fora de Brasília?', r: 'O atendimento presencial (drone e fotografia 360°) começa em Brasília e no Distrito Federal. Vídeos com IA a partir de fotos e a montagem de tours com panoramas fornecidos pelo cliente são feitos a distância para todo o Brasil.' },
  { o: 20, p: 'Quanto tempo leva cada entrega?', r: 'Vídeo IA: 3–5 dias úteis. Drone: 5–7 dias úteis após a captação. Fotos 360°: até 5 dias úteis. Tour virtual: até 7 dias úteis. Combos completos: 7–10 dias úteis. O prazo começa a contar depois do pagamento aplicável, do briefing e do recebimento dos arquivos necessários.' },
  { o: 30, p: 'O que as revisões incluem?', r: 'As revisões cobrem ajustes de edição, texto, música, ordem das cenas e navegação do tour. Uma nova captação por mudança de preferência (por exemplo, refotografar um ambiente que foi redecorado) é um serviço adicional.' },
  { o: 40, p: 'Os arquivos brutos estão incluídos?', r: 'Não, por padrão entregamos o material finalizado nos formatos combinados. Arquivos brutos podem ser negociados à parte no briefing.' },
  { o: 50, p: 'Como funciona a licença de uso do material?', r: 'A licença padrão vale para o imóvel retratado e para os canais do contratante: anúncios (Airbnb, Booking e similares), redes sociais, WhatsApp e site próprio. Uso por terceiros ou em outros imóveis exige nova licença.' },
  { o: 60, p: 'A IA pode "melhorar" o meu imóvel no vídeo?', r: 'Não. A IA trabalha com as fotos reais do imóvel e não inventa características que não existem. Quando alguma alteração material for usada (por exemplo, ambientação ilustrativa), ela é sinalizada como ilustrativa. Enganar o hóspede prejudica a avaliação — e o seu negócio.' },
  { o: 70, p: 'E se o tempo virar no dia do voo do drone?', r: 'Clima impróprio ou restrição do espaço aéreo geram reagendamento sem custo. Segurança vem antes do cronograma.' },
  { o: 80, p: 'A operação do drone é regularizada?', r: 'Sim. A operação observa as exigências da ANAC, do DECEA/SARPAS e da Anatel, e todo endereço passa por análise de viabilidade aérea antes de a captação ser confirmada. Em áreas com restrição, propomos alternativas.' },
  { o: 90, p: 'Como funciona o pagamento?', r: 'Pelo Mercado Pago (Pix e cartão). Serviços remotos: pagamento integral antes de iniciar. Presencial até R$ 1.000: integral na reserva da agenda. Acima de R$ 1.000: 50% na reserva e 50% antes da liberação final. Enquanto houver saldo, as prévias vão com marca d’água.' },
  { o: 100, p: 'Onde fica hospedado o tour 360°?', r: 'Na nossa plataforma, com link exclusivo, código de incorporação para o seu site e estatísticas de visualização. Os pacotes incluem uma franquia de hospedagem; depois dela, a renovação custa R$ 29/mês ou R$ 290/ano.' },
];

function semear() {
  const agora = nowISO();
  transacao(() => {
    for (const [chave, cfg] of Object.entries(CONFIG_PADRAO)) {
      db.prepare('INSERT OR IGNORE INTO config (chave, valor, descricao, atualizado_em) VALUES (?,?,?,?)')
        .run(chave, cfg.valor, cfg.descricao, agora);
    }
    for (const sv of SERVICOS_SEED) {
      db.prepare(`INSERT OR IGNORE INTO servicos (id, slug, nome, categoria, resumo, entrega, preco_centavos,
          preco_apartir, unidade, prazo, revisoes, ativo, ordem, criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`)
        .run(novoId(), sv.slug, sv.nome, sv.categoria, sv.resumo, sv.entrega, sv.preco,
          sv.apartir ? 1 : 0, sv.unidade || 'projeto', sv.prazo || '', sv.revisoes ?? 1, sv.ordem, agora);
    }
    for (const cb of COMBOS_SEED) {
      db.prepare(`INSERT OR IGNORE INTO combos (id, slug, nome, resumo, itens, preco_centavos, preco_apartir,
          destaque, ativo, ordem, criado_em) VALUES (?,?,?,?,?,?,?,?,1,?,?)`)
        .run(novoId(), cb.slug, cb.nome, cb.resumo, j.str(cb.itens), cb.preco, cb.apartir ? 1 : 0,
          cb.destaque ? 1 : 0, cb.ordem, agora);
    }
    for (const p of PORTFOLIO_SEED) {
      db.prepare(`INSERT OR IGNORE INTO portfolio (id, slug, titulo, tipo_imovel, cidade, resumo, corpo,
          servicos, conceitual, consentimento, capa_url, publicado, ordem, criado_em)
        VALUES (?,?,?,?,'Brasília · DF',?,?,?,1,'','',1,?,?)`)
        .run(novoId(), p.slug, p.titulo, p.tipo_imovel, p.resumo, p.corpo, j.str(p.servicos), p.ordem, agora);
    }
    // FAQs: sem slug natural — usa a pergunta como chave de idempotência
    for (const f of FAQS_SEED) {
      const existe = db.prepare('SELECT 1 FROM faqs WHERE pergunta = ?').get(f.p);
      if (!existe) db.prepare('INSERT INTO faqs (id, pergunta, resposta, ordem, publicado, criado_em) VALUES (?,?,?,?,1,?)')
        .run(novoId(), f.p, f.r, f.o, agora);
    }
  });
}

module.exports = {
  s, n, cent, slugify, AVISO_CONCEITUAL, CATEGORIAS, STATUS_LEAD, STATUS_PROPOSTA, TERMOS_VERSAO,
  STATUS_PROJETO, TRANSICOES, TERMINAIS,
  Config, Servicos, Combos, Portfolio, Faqs, Conteudos, Leads, Auditoria,
  Propostas, Interacoes, Tarefas, Clientes, Imoveis, Projetos, Mensagens, semear,
};
