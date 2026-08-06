// =====================================================================
// Villela Alta Vista 360 — tours virtuais 360° (Onda 6).
// O VISUALIZADOR é o WebGL da casa (backend/site/src/tour360/visualizador.js),
// servido SEM FORK: esta camada só monta o manifesto window.TOUR360 a partir
// do banco e serve as texturas com gate de acesso. Regras:
//   · a ORDEM das cenas é o roteiro da visita;
//   · publicar valida links quebrados (hotspot sem destino vivo não publica);
//   · público | não listado (noindex) | senha (cookie assinado de 2 h);
//   · rascunho só abre com o preview_token (e não conta visita);
//   · expirado não exibe o tour — renovação vira parcela e o webhook estende;
//   · endereço exato do imóvel nunca aparece no tour.
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const { db, transacao, nowISO, hojeISO, novoId, novoToken } = require('./db');
const repo = require('./repo');
const storage = require('./storage');
const { Auditoria, s, n, slugify } = repo;

const VISIBILIDADES = ['publico', 'nao_listado', 'senha'];
const FRANQUIA_PADRAO_MESES = 6;

const somaDias = (baseISO, dias) => new Date(Date.parse(baseISO + 'T12:00:00Z') + dias * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------
// Tours
// ---------------------------------------------------------------------
const Tours = {
  _mapa(t) { return t ? { ...t, cenas: Cenas.doTour(t.id) } : null; },
  criar({ cliente_id, projeto_id = '', titulo }, { quem = 'staff' } = {}) {
    if (!db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(s(cliente_id, 40))) throw new Error('Cliente não encontrado.');
    if (!s(titulo, 160)) throw new Error('Título do tour é obrigatório.');
    let slug = slugify(titulo) || 'tour';
    if (db.prepare('SELECT 1 FROM tours WHERE slug = ?').get(slug)) slug = `${slug}-${novoId().slice(0, 5).toLowerCase()}`;
    const id = novoId();
    db.prepare(`INSERT INTO tours (id, cliente_id, projeto_id, slug, titulo, preview_token, criado_em)
      VALUES (?,?,?,?,?,?,?)`)
      .run(id, s(cliente_id, 40), s(projeto_id, 40), slug, s(titulo, 160), novoToken(), nowISO());
    Auditoria.registrar({ quem, acao: 'tour.criar', entidade: 'tours', entidade_id: id, detalhe: slug });
    return Tours.obter(id);
  },
  obter(id) { return Tours._mapa(db.prepare('SELECT * FROM tours WHERE id = ?').get(s(id, 40))); },
  porSlug(slug) { return Tours._mapa(db.prepare('SELECT * FROM tours WHERE slug = ?').get(s(slug, 120))); },
  listar({ cliente_id = '' } = {}) {
    const linhas = cliente_id
      ? db.prepare('SELECT * FROM tours WHERE cliente_id = ? ORDER BY criado_em DESC').all(s(cliente_id, 40))
      : db.prepare('SELECT * FROM tours ORDER BY criado_em DESC LIMIT 300').all();
    return linhas.map((t) => ({
      ...t,
      cenas_total: db.prepare('SELECT COUNT(*) c FROM tour_cenas WHERE tour_id = ?').get(t.id).c,
      views_total: n((db.prepare('SELECT SUM(hits) v FROM tour_views WHERE tour_id = ?').get(t.id) || {}).v, 0),
    }));
  },
  atualizar(id, d, { quem = 'staff' } = {}) {
    const t = db.prepare('SELECT * FROM tours WHERE id = ?').get(s(id, 40));
    if (!t) throw new Error('Tour não encontrado.');
    const visibilidade = d.visibilidade != null
      ? (VISIBILIDADES.includes(d.visibilidade) ? d.visibilidade : t.visibilidade) : t.visibilidade;
    let senhaHash = t.senha_hash;
    if (d.senha != null && d.senha !== '') {
      if (String(d.senha).length < 4) throw new Error('Senha do tour: mínimo 4 caracteres.');
      senhaHash = bcrypt.hashSync(String(d.senha), 8);
    }
    db.prepare(`UPDATE tours SET titulo=?, marca_nome=?, marca_cor=?, contato_url=?, visibilidade=?,
        senha_hash=?, cena_inicial=?, expira_em=?, projeto_id=?, atualizado_em=? WHERE id = ?`)
      .run(
        d.titulo != null ? (s(d.titulo, 160) || t.titulo) : t.titulo,
        d.marca_nome != null ? s(d.marca_nome, 120) : t.marca_nome,
        d.marca_cor != null ? (/^#[0-9a-fA-F]{6}$/.test(d.marca_cor) ? d.marca_cor : t.marca_cor) : t.marca_cor,
        d.contato_url != null ? (/^https?:\/\//.test(d.contato_url) || d.contato_url === '' ? s(d.contato_url, 400) : t.contato_url) : t.contato_url,
        visibilidade, senhaHash,
        d.cena_inicial != null ? s(d.cena_inicial, 40) : t.cena_inicial,
        d.expira_em != null ? s(d.expira_em, 10) : t.expira_em,
        d.projeto_id != null ? s(d.projeto_id, 40) : t.projeto_id,
        nowISO(), t.id
      );
    Auditoria.registrar({ quem, acao: 'tour.editar', entidade: 'tours', entidade_id: t.id, detalhe: Object.keys(d).join(',') });
    return Tours.obter(t.id);
  },
  // validação de publicação — devolve a LISTA de problemas (links quebrados etc.)
  validar(id) {
    const t = Tours.obter(id);
    if (!t) return ['Tour não encontrado.'];
    const problemas = [];
    if (!t.cenas.length) problemas.push('O tour não tem nenhuma cena.');
    const ids = new Set(t.cenas.map((c) => c.id));
    if (t.cena_inicial && !ids.has(t.cena_inicial)) problemas.push('A cena inicial apontada não existe mais.');
    for (const c of t.cenas) {
      for (const h of c.hotspots) {
        if (h.tipo === 'cena' && !ids.has(h.destino_cena_id)) {
          problemas.push(`Hotspot "${h.texto || 'sem texto'}" na cena "${c.titulo}" aponta para cena que não existe (link quebrado).`);
        }
      }
    }
    if (t.visibilidade === 'senha' && !t.senha_hash) problemas.push('Visibilidade por senha exige definir a senha.');
    return problemas;
  },
  publicar(id, { quem = 'staff' } = {}) {
    const problemas = Tours.validar(id);
    if (problemas.length) throw new Error('Não dá para publicar: ' + problemas.join(' · '));
    const t = Tours.obter(id);
    const cenaInicial = t.cena_inicial || t.cenas[0].id;
    const expira = t.expira_em || somaDias(hojeISO(), FRANQUIA_PADRAO_MESES * 30); // franquia padrão; o staff ajusta pelo combo
    db.prepare("UPDATE tours SET status = 'publicado', cena_inicial = ?, expira_em = ?, atualizado_em = ? WHERE id = ?")
      .run(cenaInicial, expira, nowISO(), t.id);
    Auditoria.registrar({ quem, acao: 'tour.publicar', entidade: 'tours', entidade_id: t.id, detalhe: t.slug });
    return Tours.obter(t.id);
  },
  despublicar(id, { quem = 'staff' } = {}) {
    db.prepare("UPDATE tours SET status = 'rascunho', atualizado_em = ? WHERE id = ?").run(nowISO(), s(id, 40));
    Auditoria.registrar({ quem, acao: 'tour.despublicar', entidade: 'tours', entidade_id: s(id, 40), detalhe: '' });
    return Tours.obter(id);
  },
  duplicar(id, { quem = 'staff' } = {}) {
    const t = Tours.obter(id);
    if (!t) throw new Error('Tour não encontrado.');
    return transacao(() => {
      const novoIdTour = novoId();
      let slug = `${t.slug}-copia`;
      if (db.prepare('SELECT 1 FROM tours WHERE slug = ?').get(slug)) slug = `${slug}-${novoId().slice(0, 5).toLowerCase()}`;
      db.prepare(`INSERT INTO tours (id, cliente_id, projeto_id, slug, titulo, marca_nome, marca_cor, contato_url,
          visibilidade, senha_hash, status, cena_inicial, preview_token, expira_em, criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'rascunho', '', ?, '', ?)`)
        .run(novoIdTour, t.cliente_id, t.projeto_id, slug, t.titulo + ' (cópia)', t.marca_nome, t.marca_cor,
          t.contato_url, t.visibilidade, t.senha_hash, novoToken(), nowISO());
      const mapa = {}; // cena antiga → nova (para remapear hotspots)
      for (const c of t.cenas) {
        const novaCena = novoId();
        mapa[c.id] = novaCena;
        db.prepare('INSERT INTO tour_cenas (id, tour_id, ordem, titulo, chave, yaw, pitch, fov, hub, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(novaCena, novoIdTour, c.ordem, c.titulo, c.chave, c.yaw, c.pitch, c.fov, c.hub, nowISO());
      }
      for (const c of t.cenas) {
        for (const h of c.hotspots) {
          db.prepare('INSERT INTO tour_hotspots (id, tour_id, cena_id, yaw, pitch, tipo, texto, destino_cena_id, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
            .run(novoId(), novoIdTour, mapa[c.id], h.yaw, h.pitch, h.tipo, h.texto, mapa[h.destino_cena_id] || '', nowISO());
        }
      }
      db.prepare('UPDATE tours SET cena_inicial = ? WHERE id = ?').run(mapa[t.cena_inicial] || '', novoIdTour);
      Auditoria.registrar({ quem, acao: 'tour.duplicar', entidade: 'tours', entidade_id: novoIdTour, detalhe: 'de ' + t.slug });
      return Tours.obter(novoIdTour);
    });
  },
  expirado(t) { return !!(t.expira_em && t.expira_em < hojeISO()); },
  registrarView(tourId) {
    db.prepare(`INSERT INTO tour_views (tour_id, dia, hits) VALUES (?,?,1)
      ON CONFLICT(tour_id, dia) DO UPDATE SET hits = hits + 1`).run(s(tourId, 40), hojeISO());
  },
  stats(tourId) {
    const total = n((db.prepare('SELECT SUM(hits) v FROM tour_views WHERE tour_id = ?').get(s(tourId, 40)) || {}).v, 0);
    const dias = db.prepare('SELECT dia, hits FROM tour_views WHERE tour_id = ? ORDER BY dia DESC LIMIT 30').all(s(tourId, 40));
    return { total, ultimos_30_dias: dias };
  },
  // renovação paga: o webhook do billing chama isto quando aprova parcela de hospedagem
  estenderPorParcela(parcela) {
    if (!/^Hospedagem do tour/.test(parcela.rotulo || '')) return false;
    const dias = /anual/.test(parcela.rotulo) ? 365 : 30;
    const tours = db.prepare('SELECT * FROM tours WHERE projeto_id = ?').all(parcela.projeto_id);
    for (const t of tours) {
      const base = (t.expira_em && t.expira_em > hojeISO()) ? t.expira_em : hojeISO();
      db.prepare('UPDATE tours SET expira_em = ?, atualizado_em = ? WHERE id = ?').run(somaDias(base, dias), nowISO(), t.id);
      Auditoria.registrar({ quem: 'billing', acao: 'tour.renovar', entidade: 'tours', entidade_id: t.id, detalhe: `+${dias}d (${parcela.rotulo})` });
    }
    return tours.length > 0;
  },
};

// ---------------------------------------------------------------------
// Cenas e hotspots
// ---------------------------------------------------------------------
const Cenas = {
  doTour(tourId) {
    return db.prepare('SELECT * FROM tour_cenas WHERE tour_id = ? ORDER BY ordem, criado_em').all(s(tourId, 40))
      .map((c) => ({ ...c, hotspots: db.prepare('SELECT * FROM tour_hotspots WHERE cena_id = ? ORDER BY criado_em').all(c.id) }));
  },
  obter(id) { return db.prepare('SELECT * FROM tour_cenas WHERE id = ?').get(s(id, 40)) || null; },
  async criar(tourId, { upload_id, titulo }, { quem = 'staff' } = {}) {
    const t = db.prepare('SELECT * FROM tours WHERE id = ?').get(s(tourId, 40));
    if (!t) throw new Error('Tour não encontrado.');
    const arquivos = require('./arquivos');
    const up = await arquivos.Uploads.consumir(upload_id, { tipo: 'tour-cena', tour_id: t.id });
    if (!up.mime.startsWith('image/')) throw new Error('Panorama precisa ser imagem (JPG equiretangular 2:1).');
    const ordem = n((db.prepare('SELECT MAX(ordem) m FROM tour_cenas WHERE tour_id = ?').get(t.id) || {}).m, 0) + 10;
    const id = novoId();
    db.prepare('INSERT INTO tour_cenas (id, tour_id, ordem, titulo, chave, criado_em) VALUES (?,?,?,?,?,?)')
      .run(id, t.id, ordem, s(titulo, 120) || 'Ambiente', up.chave, nowISO());
    Auditoria.registrar({ quem, acao: 'tour.cena.criar', entidade: 'tour_cenas', entidade_id: id, detalhe: s(titulo, 80) });
    return { ...Cenas.obter(id), hotspots: [] };
  },
  atualizar(id, d) {
    const c = Cenas.obter(id);
    if (!c) throw new Error('Cena não encontrada.');
    db.prepare('UPDATE tour_cenas SET titulo=?, ordem=?, yaw=?, pitch=?, fov=?, hub=? WHERE id = ?')
      .run(
        d.titulo != null ? (s(d.titulo, 120) || c.titulo) : c.titulo,
        d.ordem != null ? Math.round(n(d.ordem, c.ordem)) : c.ordem,
        d.yaw != null ? n(d.yaw, c.yaw) : c.yaw,
        d.pitch != null ? Math.max(-85, Math.min(85, n(d.pitch, c.pitch))) : c.pitch,
        d.fov != null ? Math.max(32, Math.min(100, n(d.fov, c.fov))) : c.fov,
        d.hub != null ? (d.hub ? 1 : 0) : c.hub,
        c.id
      );
    return Cenas.obter(c.id);
  },
  remover(id, { quem = 'staff' } = {}) {
    const c = Cenas.obter(id);
    if (!c) return;
    transacao(() => {
      db.prepare('DELETE FROM tour_hotspots WHERE cena_id = ? OR destino_cena_id = ?').run(c.id, c.id);
      db.prepare('DELETE FROM tour_cenas WHERE id = ?').run(c.id);
      db.prepare("UPDATE tours SET cena_inicial = '' WHERE id = ? AND cena_inicial = ?").run(c.tour_id, c.id);
    });
    storage.removerArquivo(c.chave);
    Auditoria.registrar({ quem, acao: 'tour.cena.remover', entidade: 'tour_cenas', entidade_id: c.id, detalhe: c.titulo });
  },
};

const Hotspots = {
  criar(cenaId, d) {
    const c = Cenas.obter(cenaId);
    if (!c) throw new Error('Cena não encontrada.');
    const tipo = d.tipo === 'info' ? 'info' : 'cena';
    let destino = '';
    if (tipo === 'cena') {
      const alvo = Cenas.obter(d.destino_cena_id);
      if (!alvo || alvo.tour_id !== c.tour_id) throw new Error('Hotspot de navegação precisa apontar para uma cena DESTE tour.');
      destino = alvo.id;
    } else if (!s(d.texto, 200)) {
      throw new Error('Hotspot de informação precisa de texto.');
    }
    const id = novoId();
    db.prepare('INSERT INTO tour_hotspots (id, tour_id, cena_id, yaw, pitch, tipo, texto, destino_cena_id, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, c.tour_id, c.id, n(d.yaw, 0), Math.max(-85, Math.min(85, n(d.pitch, 0))), tipo, s(d.texto, 200), destino, nowISO());
    return db.prepare('SELECT * FROM tour_hotspots WHERE id = ?').get(id);
  },
  remover(id) { db.prepare('DELETE FROM tour_hotspots WHERE id = ?').run(s(id, 40)); },
  // importa o JSON do editor visual da casa (?editor=1 → "Exportar tudo"):
  // { "<cenaId>": [{yaw,pitch,tipo,destino,texto}, …], … } — substitui os da cena
  importarDoEditor(tourId, dados, { quem = 'staff' } = {}) {
    const t = Tours.obter(tourId);
    if (!t) throw new Error('Tour não encontrado.');
    const ids = new Set(t.cenas.map((c) => c.id));
    let aplicados = 0;
    transacao(() => {
      for (const [cenaId, lista] of Object.entries(dados || {})) {
        if (!ids.has(cenaId) || !Array.isArray(lista)) continue;
        db.prepare('DELETE FROM tour_hotspots WHERE cena_id = ?').run(cenaId);
        for (const h of lista) {
          const tipo = h.tipo === 'info' ? 'info' : 'cena';
          if (tipo === 'cena' && !ids.has(String(h.destino || ''))) continue; // link quebrado não entra
          db.prepare('INSERT INTO tour_hotspots (id, tour_id, cena_id, yaw, pitch, tipo, texto, destino_cena_id, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
            .run(novoId(), t.id, cenaId, n(h.yaw, 0), Math.max(-85, Math.min(85, n(h.pitch, 0))), tipo, s(h.texto, 200), tipo === 'cena' ? String(h.destino) : '', nowISO());
          aplicados++;
        }
      }
    });
    Auditoria.registrar({ quem, acao: 'tour.hotspots.importar', entidade: 'tours', entidade_id: t.id, detalhe: aplicados + ' hotspots' });
    return { aplicados };
  },
};

module.exports = { Tours, Cenas, Hotspots, VISIBILIDADES, FRANQUIA_PADRAO_MESES };
