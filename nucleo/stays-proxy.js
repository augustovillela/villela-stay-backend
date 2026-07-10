// =====================================================================
// Núcleo · Proxy da API Stays para o Portal Staff: imóveis, central de
// hóspedes, ficha do hóspede, reservas por período, disponibilidade e
// CRIAÇÃO de reserva/bloqueio (admin — espelha nos canais conectados).
// Extraído do server.js (Projeto 2). Montado por montar(app, deps).
// deps: { stays, staysPaginado, staysPost, getStaysClientes, getListingMap,
//   resolverClientes, invalidarStaysClientes, nomeCliente, normalizarPlataforma,
//   semAcento, CAL_STATUS, registrarAuditoria, requireAuth, requireAdmin }
// =====================================================================
'use strict';

module.exports.montar = function montar(app, deps) {
  const { stays, staysPaginado, staysPost, getStaysClientes, getListingMap, resolverClientes,
    invalidarStaysClientes, nomeCliente, normalizarPlataforma, semAcento, CAL_STATUS,
    registrarAuditoria, requireAuth, requireAdmin } = deps;

  // Imóveis (para os selects do formulário de criação)
  app.get('/staff/api/stays/imoveis', requireAuth, async (req, res) => {
    try {
      const listings = await staysPaginado('/content/listings', {});
      const ordemSub = { entire_home: 0, private_room: 1 };
      const imoveis = listings.filter(l => l.status === 'active').map(l => ({
        idlisting: l._id, codigo: l.id, titulo: (l.internalName || (l._mstitle && l._mstitle.pt_BR) || l.id), subtype: l.subtype || ''
      })).sort((a, b) => (ordemSub[a.subtype] ?? 9) - (ordemSub[b.subtype] ?? 9) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
      res.json({ imoveis });
    } catch (e) { console.error('[stays imoveis]', e.message); res.status(502).json({ erro: 'Falha ao listar imóveis.' }); }
  });

  // Central de hóspedes (lista + busca, paginada)
  app.get('/staff/api/stays/clientes', requireAuth, async (req, res) => {
    try {
      let lista = await getStaysClientes();
      const q = semAcento(req.query.busca || '').trim();
      if (q) lista = lista.filter(c => semAcento(nomeCliente(c)).includes(q));
      // ordem alfabética por nome (sem acento/caixa); nomes vazios/"—" vão para o fim
      const chaveOrd = (c) => { const n = semAcento(nomeCliente(c)).trim(); return (!n || !/[a-z0-9]/.test(n[0])) ? '￿' + n : n; };
      lista = lista.slice().sort((a, b) => chaveOrd(a).localeCompare(chaveOrd(b), 'pt-BR'));
      const total = lista.length;
      const skip = Math.max(0, parseInt(req.query.skip) || 0);
      const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 30), 100);
      const clientes = lista.slice(skip, skip + limit).map(c => ({
        id: c._id, nome: nomeCliente(c), origem: c.clientSource || '', criadoEm: c.creationDate || ''
      }));
      res.json({ total, skip, limit, clientes });
    } catch (e) { console.error('[stays clientes]', e.message); res.status(502).json({ erro: 'Falha ao listar hóspedes.' }); }
  });

  // Ficha do hóspede (contato + reservas + gasto) — o objeto do cliente já traz reservations.
  app.get('/staff/api/stays/cliente/:id', requireAuth, async (req, res) => {
    try {
      const cli = await stays(`/booking/clients/${req.params.id}`);
      const mapa = await getListingMap();
      const reservas = (cli.reservations || []).map(r => ({
        id: r.id || r._id, imovel: (mapa[r._idlisting] && mapa[r._idlisting].codigo) || '',
        imovelTitulo: (mapa[r._idlisting] && mapa[r._idlisting].titulo) || '',
        checkIn: r.checkInDate, checkOut: r.checkOutDate, status: r.type, statusRotulo: CAL_STATUS[r.type] || r.type,
        valorTotal: (r.price && r.price._f_total != null) ? r.price._f_total : null, moeda: (r.price && r.price.currency) || 'BRL', hospedes: r.guests
      })).sort((a, b) => (b.checkIn || '').localeCompare(a.checkIn || ''));
      const telefones = (cli.phones || []).map(p => p.iso || p.number || p).filter(v => typeof v === 'string' && v);
      const emails = (cli.emails || []).map(e => (e && (e.address || e.email)) || (typeof e === 'string' ? e : '')).filter(Boolean);
      if (!emails.length && cli.email) emails.push(cli.email);
      const totalGasto = reservas.filter(r => r.status !== 'canceled' && r.status !== 'blocked').reduce((s, r) => s + (r.valorTotal || 0), 0);
      res.json({ id: cli._id, nome: nomeCliente(cli), telefones, emails, origem: cli.clientSource || '', criadoEm: cli.creationDate || '', totalReservas: reservas.length, totalGasto, reservas });
    } catch (e) { console.error('[stays cliente]', e.message); res.status(502).json({ erro: 'Falha ao carregar o hóspede.' }); }
  });

  // Buscar reservas por hóspede/imóvel num período
  app.get('/staff/api/stays/reservas', requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || ''))
        return res.status(400).json({ erro: 'Parâmetros from e to (yyyy-MM-dd) são obrigatórios.' });
      const mapa = await getListingMap();
      const brutas = await staysPaginado('/booking/reservations', { from, to, dateType: 'included' });
      const validas = brutas.filter(r => r.type !== 'canceled');
      const cache = await resolverClientes(validas.map(r => r._idclient));
      const q = semAcento(req.query.busca || '').trim();
      let reservas = validas.map(r => {
        const ehBloqueio = r.type === 'blocked' || r.type === 'maintenance';
        const plat = normalizarPlataforma(r.partner);
        return {
          id: r.id || r._id, idInterno: r._id, idclient: r._idclient || '',
          imovel: (mapa[r._idlisting] && mapa[r._idlisting].codigo) || '', imovelTitulo: (mapa[r._idlisting] && mapa[r._idlisting].titulo) || '',
          hospede: ehBloqueio ? (CAL_STATUS[r.type] || 'Bloqueio') : ((r._idclient && cache[r._idclient]) || '—'), bloqueio: ehBloqueio,
          plataformaRotulo: ehBloqueio ? '' : plat.rotulo, status: r.type, statusRotulo: CAL_STATUS[r.type] || r.type,
          checkIn: r.checkInDate, checkOut: r.checkOutDate,
          noites: (r.checkInDate && r.checkOutDate) ? Math.max(0, Math.round((Date.parse(r.checkOutDate) - Date.parse(r.checkInDate)) / 86400000)) : null,
          hospedes: r.guests, valorTotal: (r.price && r.price._f_total != null) ? r.price._f_total : null, moeda: (r.price && r.price.currency) || 'BRL', reservationUrl: r.reservationUrl || ''
        };
      });
      if (q) reservas = reservas.filter(r => semAcento(r.hospede).includes(q) || semAcento(r.imovel).includes(q) || semAcento(r.id).includes(q));
      reservas.sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));
      res.json({ from, to, reservas });
    } catch (e) { console.error('[stays reservas]', e.message); res.status(502).json({ erro: 'Falha ao buscar reservas.' }); }
  });

  // Disponibilidade + preço sugerido de um imóvel no período (para o formulário de criação)
  app.get('/staff/api/stays/disponibilidade', requireAuth, async (req, res) => {
    try {
      const { listingId, from, to } = req.query;
      if (!listingId || !/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || to <= from)
        return res.status(400).json({ erro: 'Informe imóvel e datas válidas (check-out depois do check-in).' });
      const cal = await stays(`/calendar/listing/${listingId}`, { from, to });
      const noites = cal.filter(d => d.date >= from && d.date < to).map(d => ({
        date: d.date, avail: d.avail > 0, precoBRL: d.prices && d.prices[0] ? d.prices[0]._mcval.BRL : null
      }));
      res.json({ listingId, from, to, todasLivres: noites.length > 0 && noites.every(n => n.avail), noites, totalSugerido: noites.reduce((s, n) => s + (n.precoBRL || 0), 0) });
    } catch (e) { console.error('[stays disp]', e.message); res.status(502).json({ erro: 'Falha ao consultar disponibilidade.' }); }
  });

  // Criar reserva (direta) ou bloqueio — SOMENTE ADMIN. Cria na Stays, que espelha o
  // bloqueio nos canais conectados (Airbnb/Booking/Decolar...) automaticamente.
  app.post('/staff/api/stays/reserva', requireAuth, requireAdmin, async (req, res) => {
    try {
      const d = req.body || {};
      const tipo = d.tipo === 'bloqueio' ? 'bloqueio' : 'reserva';
      const { listingId, checkInDate, checkOutDate } = d;
      if (!listingId || !/^\d{4}-\d{2}-\d{2}$/.test(checkInDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDate || '') || checkOutDate <= checkInDate)
        return res.status(400).json({ erro: 'Informe imóvel e datas válidas (check-out depois do check-in).' });
      // Confere disponibilidade (todas as noites livres) antes de criar
      const cal = await stays(`/calendar/listing/${listingId}`, { from: checkInDate, to: checkOutDate });
      const noites = cal.filter(x => x.date >= checkInDate && x.date < checkOutDate);
      if (!(noites.length > 0 && noites.every(x => x.avail > 0)))
        return res.status(409).json({ erro: 'As datas escolhidas não estão totalmente livres na Stays. Atualize a disponibilidade e tente outro período.' });

      if (tipo === 'bloqueio') {
        const r = await staysPost('/booking/reservations', { type: 'blocked', listingId, checkInDate, checkOutDate });
        registrarAuditoria(req, 'stays.bloqueio', `${listingId} ${checkInDate}→${checkOutDate}`);
        return res.json({ ok: true, tipo: 'bloqueio', reserva: { id: r.id, idInterno: r._id, checkIn: r.checkInDate, checkOut: r.checkOutDate } });
      }
      // Reserva: garante o cliente (existente ou cadastra novo)
      let clienteId = d.clienteId;
      if (!clienteId && d.novoCliente && String(d.novoCliente.nome || '').trim()) {
        const partes = String(d.novoCliente.nome).trim().split(/\s+/);
        const fName = partes.shift() || 'Hóspede'; const lName = partes.join(' ') || '-';
        const corpoCli = { fName, lName };
        const contato = String(d.novoCliente.contato || '').trim();
        if (contato.includes('@')) corpoCli.email = contato; else if (contato) corpoCli.phones = [{ iso: contato }];
        const novo = await staysPost('/booking/clients', corpoCli);
        clienteId = novo._id;
        invalidarStaysClientes(); // invalida o cache de hóspedes
      }
      if (!clienteId) return res.status(400).json({ erro: 'Informe um hóspede (escolha um existente ou cadastre um novo).' });
      const guests = Math.max(1, parseInt(d.guests) || 1);
      const r = await staysPost('/booking/reservations', { type: 'booked', listingId, checkInDate, checkOutDate, _idclient: clienteId, guests });
      registrarAuditoria(req, 'stays.reserva', `${listingId} ${checkInDate}→${checkOutDate} (${guests} hósp.)`);
      res.json({ ok: true, tipo: 'reserva', reserva: { id: r.id, idInterno: r._id, checkIn: r.checkInDate, checkOut: r.checkOutDate, valorTotal: (r.price && r.price._f_total) || null, moeda: (r.price && r.price.currency) || 'BRL', hospedes: r.guests } });
    } catch (e) {
      console.error('[stays criar]', e.message);
      res.status(502).json({ erro: 'Falha ao criar na Stays. ' + (e.message || '') });
    }
  });
};
