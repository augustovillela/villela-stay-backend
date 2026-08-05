// =====================================================================
// Closet Club — parceiros e entrega.
//
// PARCEIROS (lavanderia, fotógrafo, costureira, stylist, maquiador,
// cabeleireiro, joalheria, transportadora): o cliente monta o evento
// inteiro, não só a roupa. Serviços aparecem no checkout da reserva, na
// cidade em que o parceiro atende, e geram comissão para a plataforma.
//
// O parceiro NÃO tem login próprio: ele é um usuário comum com
// `papel='parceiro'` ligado ao registro em `partners`. Reaproveitar a
// sessão que já existe evita um segundo sistema de autenticação — que
// seria mais uma superfície para manter e para vazar.
//
// ENTREGA: zonas com preço e prazo por cidade/bairro, substituindo o
// frete fixo da onda 1.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const { Config, Users, Notificacoes, Auditoria, evento, lancar, s, n, cent, slugify } = repo;

const TIPOS = ['lavanderia', 'fotografo', 'costureira', 'stylist', 'maquiador', 'cabeleireiro', 'joalheria', 'entrega'];

const Parceiros = {
  TIPOS,

  // candidatura pública: cria o registro em análise (não vira parceiro sozinho)
  candidatar(d = {}, { userId = '' } = {}) {
    const nome = s(d.nome, 140);
    if (!nome) throw new Error('Informe o nome do negócio.');
    const tipo = TIPOS.includes(s(d.tipo, 30)) ? s(d.tipo, 30) : 'lavanderia';
    const id = novoId();
    db.prepare(`INSERT INTO partners (id, user_id, slug, logo_url, nome, tipo, descricao, cidade, uf, telefone, email, comissao_pct, status, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'analise', ?)`)
      .run(id, s(userId, 40), slugify(nome) + '-' + id.slice(0, 5).toLowerCase(), s(d.logo_url, 400), nome, tipo,
        s(d.descricao, 1500), s(d.cidade, 80), s(d.uf, 2).toUpperCase(), s(d.telefone, 30), s(d.email, 120).toLowerCase(),
        n(d.comissao_pct, Config.num('comissao_servico_pct', 15)), nowISO());
    for (const sv of (Array.isArray(d.servicos) ? d.servicos : []).slice(0, 12)) Parceiros.addServico(id, sv);
    for (const a of (Array.isArray(d.areas) ? d.areas : []).slice(0, 40)) Parceiros.addArea(id, a);
    evento(userId, 'parceiro.candidatura', id, { nome, tipo });
    return Parceiros.obter(id);
  },

  addServico(partnerId, sv = {}) {
    const nome = s(sv.nome, 140);
    if (!nome) throw new Error('O serviço precisa de nome.');
    const id = novoId();
    db.prepare(`INSERT INTO partner_services (id, partner_id, nome, tipo, preco_centavos, descricao, ativo, criado_em)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, s(partnerId, 40), nome, s(sv.tipo, 30) || 'lavanderia', cent(sv.preco_centavos), s(sv.descricao, 600),
        sv.ativo === false ? 0 : 1, nowISO());
    return id;
  },
  mudarServico(id, partnerId, d = {}) {
    const sv = db.prepare('SELECT * FROM partner_services WHERE id = ?').get(s(id, 40));
    if (!sv) throw new Error('Serviço não encontrado.');
    if (partnerId && sv.partner_id !== partnerId) throw new Error('Este serviço não é seu.');
    db.prepare('UPDATE partner_services SET nome=?, preco_centavos=?, descricao=?, ativo=? WHERE id=?')
      .run(s(d.nome, 140) || sv.nome, d.preco_centavos == null ? sv.preco_centavos : cent(d.preco_centavos),
        d.descricao == null ? sv.descricao : s(d.descricao, 600), d.ativo === false ? 0 : 1, sv.id);
    return { ok: true };
  },
  addArea(partnerId, a = {}) {
    db.prepare('INSERT OR REPLACE INTO partner_areas (partner_id, cidade, uf, bairro) VALUES (?,?,?,?)')
      .run(s(partnerId, 40), s(a.cidade, 80), s(a.uf, 2).toUpperCase(), s(a.bairro, 80));
  },

  obter(id) {
    const p = db.prepare('SELECT * FROM partners WHERE id = ? OR slug = ?').get(s(id, 90), s(id, 90));
    if (!p) return null;
    return {
      ...p,
      servicos: db.prepare('SELECT * FROM partner_services WHERE partner_id = ? ORDER BY preco_centavos').all(p.id),
      areas: db.prepare('SELECT * FROM partner_areas WHERE partner_id = ?').all(p.id),
    };
  },
  doUsuario(userId) {
    const p = db.prepare('SELECT id FROM partners WHERE user_id = ? LIMIT 1').get(s(userId, 40));
    return p ? Parceiros.obter(p.id) : null;
  },
  listar({ status = '', tipo = '', cidade = '' } = {}) {
    let q = 'SELECT * FROM partners WHERE 1=1';
    const p = [];
    if (status) { q += ' AND status = ?'; p.push(s(status, 20)); }
    if (tipo) { q += ' AND tipo = ?'; p.push(s(tipo, 30)); }
    if (cidade) { q += ' AND cidade = ?'; p.push(s(cidade, 80)); }
    return db.prepare(q + ' ORDER BY criado_em DESC LIMIT 300').all(...p).map((x) => Parceiros.obter(x.id));
  },

  // aprovação pela plataforma: é aqui que a conta ganha o papel 'parceiro'
  aprovar(id, aprovado, quem) {
    const p = db.prepare('SELECT * FROM partners WHERE id = ?').get(s(id, 40));
    if (!p) throw new Error('Parceiro não encontrado.');
    db.prepare('UPDATE partners SET status = ? WHERE id = ?').run(aprovado ? 'ativo' : 'recusado', p.id);
    if (aprovado && p.user_id) {
      try { Users.papel(p.user_id, 'parceiro'); } catch (_) {}
      Notificacoes.criar(p.user_id, {
        titulo: aprovado ? '🤝 Parceria aprovada' : 'Parceria não aprovada',
        texto: aprovado ? `${p.nome} já aparece no checkout das reservas da sua cidade.` : 'Fale com o suporte para entender os próximos passos.',
        url: '/closet/app#parceiro',
      });
    }
    evento('', 'parceiro.' + (aprovado ? 'aprovado' : 'recusado'), p.id, { quem: s(quem, 80) });
    return Parceiros.obter(p.id);
  },

  // serviços oferecidos no checkout, para a cidade/bairro da reserva
  disponiveis({ cidade = '', bairro = '' } = {}) {
    const linhas = db.prepare(`SELECT ps.*, p.nome AS parceiro, p.slug AS parceiro_slug, p.cidade, p.uf, p.nota_media, p.comissao_pct
      FROM partner_services ps JOIN partners p ON p.id = ps.partner_id
      WHERE ps.ativo = 1 AND p.status = 'ativo'
        AND (? = '' OR p.cidade = ? OR EXISTS (SELECT 1 FROM partner_areas a WHERE a.partner_id = p.id AND a.cidade = ?))
      ORDER BY ps.tipo, ps.preco_centavos`).all(s(cidade, 80), s(cidade, 80), s(cidade, 80));
    if (!bairro) return linhas;
    // quando o parceiro declarou bairros, respeita a cobertura
    return linhas.filter((l) => {
      const areas = db.prepare("SELECT bairro FROM partner_areas WHERE partner_id = ? AND bairro != ''").all(l.partner_id);
      return !areas.length || areas.some((a) => a.bairro.toLowerCase() === s(bairro, 80).toLowerCase());
    });
  },

  // agenda do parceiro: serviços contratados nas reservas
  agenda(partnerId, { status = '' } = {}) {
    let q = `SELECT bs.*, b.codigo, b.data_retirada, b.data_devolucao, b.status AS reserva_status
      FROM booking_services bs JOIN bookings b ON b.id = bs.booking_id WHERE bs.partner_id = ?`;
    const p = [s(partnerId, 40)];
    if (status) { q += ' AND bs.status = ?'; p.push(s(status, 20)); }
    return db.prepare(q + ' ORDER BY b.data_retirada DESC LIMIT 200').all(...p);
  },

  concluirServico(bookingServiceId, partnerId) {
    const bs = db.prepare('SELECT * FROM booking_services WHERE id = ?').get(s(bookingServiceId, 40));
    if (!bs) throw new Error('Serviço não encontrado.');
    if (partnerId && bs.partner_id !== partnerId) throw new Error('Este serviço não é seu.');
    if (bs.status === 'concluido') return { ok: true, ja: true };
    db.prepare("UPDATE booking_services SET status = 'concluido' WHERE id = ?").run(bs.id);
    // a comissão do serviço só é reconhecida quando o serviço acontece
    const p = db.prepare('SELECT comissao_pct FROM partners WHERE id = ?').get(bs.partner_id) || { comissao_pct: 15 };
    const comissao = Math.round(bs.preco_centavos * n(p.comissao_pct, 15) / 100);
    lancar('servico', comissao, { bookingId: bs.booking_id, descricao: `Comissão de serviço (${bs.nome})` });
    evento('', 'servico.concluido', bs.id, { comissao });
    return { ok: true, comissao_centavos: comissao };
  },

  resumo() {
    const c = (sql, ...p) => n((db.prepare(sql).get(...p) || {}).c, 0);
    return {
      total: c('SELECT COUNT(*) c FROM partners'),
      ativos: c("SELECT COUNT(*) c FROM partners WHERE status = 'ativo'"),
      em_analise: c("SELECT COUNT(*) c FROM partners WHERE status = 'analise'"),
      servicos: c("SELECT COUNT(*) c FROM partner_services WHERE ativo = 1"),
      contratados: c('SELECT COUNT(*) c FROM booking_services'),
      receita_servicos_centavos: n((db.prepare("SELECT COALESCE(SUM(valor_centavos),0) c FROM ledger WHERE tipo = 'servico'").get() || {}).c, 0),
    };
  },
};

// ---------------------------------------------------------------------
// Entrega por zona (substitui o frete fixo)
// ---------------------------------------------------------------------
const Entrega = {
  listar({ cidade = '' } = {}) {
    const q = cidade ? 'SELECT * FROM zonas_entrega WHERE cidade = ? ORDER BY cidade, bairro' : 'SELECT * FROM zonas_entrega ORDER BY cidade, bairro';
    return cidade ? db.prepare(q).all(s(cidade, 80)) : db.prepare(q).all();
  },
  salvar(d = {}) {
    const id = s(d.id, 40) || novoId();
    const existe = db.prepare('SELECT 1 FROM zonas_entrega WHERE id = ?').get(id);
    if (existe) {
      db.prepare('UPDATE zonas_entrega SET cidade=?, uf=?, bairro=?, preco_centavos=?, prazo_h=?, partner_id=?, ativo=? WHERE id=?')
        .run(s(d.cidade, 80), s(d.uf, 2).toUpperCase(), s(d.bairro, 80), cent(d.preco_centavos), n(d.prazo_h, 24), s(d.partner_id, 40), d.ativo === false ? 0 : 1, id);
    } else {
      db.prepare('INSERT INTO zonas_entrega (id, cidade, uf, bairro, preco_centavos, prazo_h, partner_id, ativo, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, s(d.cidade, 80), s(d.uf, 2).toUpperCase(), s(d.bairro, 80), cent(d.preco_centavos), n(d.prazo_h, 24), s(d.partner_id, 40), d.ativo === false ? 0 : 1, nowISO());
    }
    return db.prepare('SELECT * FROM zonas_entrega WHERE id = ?').get(id);
  },
  remover(id) { db.prepare('DELETE FROM zonas_entrega WHERE id = ?').run(s(id, 40)); return { ok: true }; },

  // Cotação do frete: bairro exato ganha da regra da cidade inteira.
  // Sem zona cadastrada, a entrega não é oferecida (melhor não oferecer do
  // que cobrar um valor inventado e ter de honrar depois).
  cotar({ cidade = '', bairro = '' } = {}) {
    if (!cidade) return null;
    const porBairro = bairro
      ? db.prepare('SELECT * FROM zonas_entrega WHERE ativo = 1 AND cidade = ? AND lower(bairro) = ? LIMIT 1').get(s(cidade, 80), s(bairro, 80).toLowerCase())
      : null;
    const zona = porBairro || db.prepare("SELECT * FROM zonas_entrega WHERE ativo = 1 AND cidade = ? AND bairro = '' LIMIT 1").get(s(cidade, 80));
    if (!zona) return null;
    return { id: zona.id, cidade: zona.cidade, bairro: zona.bairro, preco_centavos: zona.preco_centavos, prazo_h: zona.prazo_h, partner_id: zona.partner_id };
  },
};

module.exports = { Parceiros, Entrega, TIPOS };
