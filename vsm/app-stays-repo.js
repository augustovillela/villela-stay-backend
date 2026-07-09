// =====================================================================
// Villela Stay Manager (VSM) — sincronização com a Stays.net POR TENANT.
//
// Conecta a conta Stays do assinante e IMPORTA anúncios → app_imoveis e
// reservas → app_reservas (upsert por id externo). Credenciais guardadas em
// app_stays_conta (nunca devolvidas cruas — só versão mascarada). Módulo
// 'canais'. A fábrica de cliente é injetável (setFabrica) para os testes.
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');
const appRepo = require('./app-repo');

let _fab = require('./stays').criarCliente; // (cfg[, fetchImpl]) => cliente
function setFabrica(fn) { _fab = fn; }       // usado no selftest (sem rede)

const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const cent = (v) => Math.round(Number(v || 0));
const dia = (v) => s(v, 10).slice(0, 10);
const noites = (ci, co) => Math.max(0, Math.round((Date.parse(co + 'T00:00:00Z') - Date.parse(ci + 'T00:00:00Z')) / 86400000));
const mascarar = (t) => { t = s(t); return t.length <= 4 ? '••••' : ('••••' + t.slice(-4)); };

function canalDe(partner) {
  const raw = (partner && partner.name ? String(partner.name) : '').toLowerCase();
  if (!raw) return 'direto';
  if (raw.includes('airbnb')) return 'airbnb';
  if (raw.includes('booking')) return 'booking';
  if (raw.includes('decolar') || raw.includes('despegar')) return 'decolar';
  if (raw.includes('expedia')) return 'expedia';
  if (raw.includes('vrbo') || raw.includes('homeaway')) return 'vrbo';
  if (raw.includes('google')) return 'google';
  if (raw.includes('external') || raw.includes('api') || raw.includes('direct')) return 'direto';
  return 'outro';
}
function statusDe(tipo) {
  if (tipo === 'canceled') return 'cancelada';
  if (tipo === 'blocked') return null; // bloqueios não viram reserva de hóspede
  return 'confirmada'; // booked|reserved|contract
}

// =====================================================================
// CONTA (credenciais Stays do tenant)
// =====================================================================
const Conta = {
  obter(tenantId) { return db.prepare('SELECT * FROM app_stays_conta WHERE tenant_id = ?').get(s(tenantId, 40)) || null; },
  statusPublico(tenantId) {
    const c = Conta.obter(tenantId);
    if (!c) return { conectada: false };
    return {
      conectada: true, base_url: c.base_url, client_id: mascarar(c.client_id),
      status: c.status, ultimo_sync: c.ultimo_sync, ultimo_erro: c.ultimo_erro,
      imoveis_sync: c.imoveis_sync, reservas_sync: c.reservas_sync,
    };
  },
  async salvar(tenantId, d) {
    const cfg = { base_url: d.base_url, client_id: d.client_id, secret: d.secret };
    if (!s(cfg.base_url) || !s(cfg.client_id) || !s(cfg.secret)) throw new Error('Informe a URL da conta, o client_id e o secret da Stays.');
    const cli = _fab(cfg);
    await cli.testar(); // valida a credencial antes de gravar (lança se inválida)
    const agora = nowISO();
    db.prepare(`INSERT INTO app_stays_conta (tenant_id, base_url, client_id, secret, status, criado_em, atualizado_em)
      VALUES (?,?,?,?,'conectada',?,?)
      ON CONFLICT(tenant_id) DO UPDATE SET base_url=excluded.base_url, client_id=excluded.client_id, secret=excluded.secret, status='conectada', ultimo_erro='', atualizado_em=excluded.atualizado_em`)
      .run(s(tenantId, 40), cli.base, s(cfg.client_id, 200), s(cfg.secret, 500), agora, agora);
    repo.evento(tenantId, 'stays.conectada', cli.base, {});
    return Conta.statusPublico(tenantId);
  },
  desconectar(tenantId) { db.prepare('DELETE FROM app_stays_conta WHERE tenant_id = ?').run(s(tenantId, 40)); return { ok: true }; },
};

// =====================================================================
// IMPORT (upsert por id externo)
// =====================================================================
function upsertImovel(tenantId, L) {
  const staysId = s(L._id || L.id, 60);
  if (!staysId) return null;
  const nome = s((L._mstitle && (L._mstitle.pt_BR || L._mstitle.en_US)) || L.id || staysId, 200);
  const cap = Math.max(1, Number(L._i_maxGuests || L.maxGuests || 1) || 1);
  const quartos = Math.max(0, Number(L._i_rooms || L.rooms || 0) || 0);
  const existe = db.prepare('SELECT id FROM app_imoveis WHERE tenant_id = ? AND stays_id = ?').get(tenantId, staysId);
  const agora = nowISO();
  if (existe) {
    db.prepare('UPDATE app_imoveis SET nome=?, capacidade=?, quartos=?, codigo=?, atualizado_em=? WHERE id=?')
      .run(nome, cap, quartos, s(L.id, 40), agora, existe.id);
    return existe.id;
  }
  const id = novoId();
  db.prepare(`INSERT INTO app_imoveis (id, tenant_id, codigo, nome, tipo, quartos, capacidade, comodidades, tarifa_base_centavos, ativo, obs, stays_id, origem, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,1,?,?, 'stays', ?, ?)`)
    .run(id, tenantId, s(L.id, 40), nome, 'stays', quartos, cap, '[]', 0, '', staysId, agora, agora);
  return id;
}

function upsertReserva(tenantId, R, mapImovel, nomeHospede) {
  const status = statusDe(R.type);
  if (!status) return { pulou: true };
  const idlisting = s(R._idlisting || (R.listing && R.listing._id), 60);
  const imovelLocalId = mapImovel[idlisting];
  if (!imovelLocalId) return { pulou: true }; // anúncio não importado
  const checkin = dia(R.checkInDate), checkout = dia(R.checkOutDate);
  if (!checkin || !checkout || checkout <= checkin) return { pulou: true };
  const staysId = s(R._id || R.id, 60);
  const valor = cent((R.price && (R.price._f_total || (R.price._mcval && R.price._mcval.BRL))) || 0);
  const canal = canalDe(R.partner);
  const existe = staysId ? db.prepare('SELECT id FROM app_reservas WHERE tenant_id = ? AND stays_id = ?').get(tenantId, staysId) : null;
  const agora = nowISO();
  if (existe) {
    db.prepare('UPDATE app_reservas SET imovel_id=?, hospede_nome=?, checkin=?, checkout=?, noites=?, valor_centavos=?, canal=?, status=?, atualizado_em=? WHERE id=?')
      .run(imovelLocalId, s(nomeHospede, 200), checkin, checkout, noites(checkin, checkout), valor, canal, status, agora, existe.id);
    return { atualizou: true };
  }
  db.prepare(`INSERT INTO app_reservas (id, tenant_id, imovel_id, hospede_id, hospede_nome, checkin, checkout, noites, hospedes_qtd, valor_centavos, canal, status, obs, stays_id, origem, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'stays', ?, ?)`)
    .run(novoId(), tenantId, imovelLocalId, '', s(nomeHospede, 200), checkin, checkout, noites(checkin, checkout),
      Math.max(1, Number(R._i_guests || R.guests || 1) || 1), valor, canal, status, '', staysId, agora, agora);
  return { inseriu: true };
}

// janela padrão: 30 dias atrás até 365 à frente (chegadas)
function janela() {
  const hoje = new Date();
  const de = new Date(hoje.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const ate = new Date(hoje.getTime() + 365 * 86400000).toISOString().slice(0, 10);
  return { de, ate };
}

async function sincronizar(tenantId) {
  const c = Conta.obter(tenantId);
  if (!c) throw new Error('Conecte sua conta Stays antes de sincronizar.');
  const cli = _fab({ base_url: c.base_url, client_id: c.client_id, secret: c.secret });
  try {
    // 1) anúncios → imóveis
    const listings = await cli.listings();
    const mapImovel = {}; // _idlisting → app_imovel.id
    for (const L of listings) { const localId = upsertImovel(tenantId, L); if (localId) mapImovel[s(L._id || L.id, 60)] = localId; }
    appRepo.sincronizarUsoImoveis(tenantId);

    // 2) reservas (chegadas na janela) → reservas
    const { de, ate } = janela();
    const reservas = await cli.reservations({ from: de, to: ate, dateType: 'arrival' });
    // resolve nomes de hóspedes (best-effort, com cache local)
    const cacheNome = {};
    const ids = [...new Set(reservas.map(r => s(r._idclient, 60)).filter(Boolean))];
    for (const cid of ids) {
      try { const cl = await cli.cliente(cid); cacheNome[cid] = s((cl && (cl.name || [cl.fName, cl.lName].filter(Boolean).join(' '))) || '', 200); }
      catch (_) { cacheNome[cid] = ''; }
    }
    let inseridas = 0, atualizadas = 0;
    for (const R of reservas) {
      const r = upsertReserva(tenantId, R, mapImovel, cacheNome[s(R._idclient, 60)] || '');
      if (r.inseriu) inseridas++; else if (r.atualizou) atualizadas++;
    }
    const nImoveis = Object.keys(mapImovel).length;
    const agora = nowISO();
    db.prepare("UPDATE app_stays_conta SET status='conectada', ultimo_sync=?, ultimo_erro='', imoveis_sync=?, reservas_sync=?, atualizado_em=? WHERE tenant_id=?")
      .run(agora, nImoveis, inseridas + atualizadas, agora, s(tenantId, 40));
    repo.evento(tenantId, 'stays.sync', '', { imoveis: nImoveis, reservas_novas: inseridas, reservas_atualizadas: atualizadas });
    return { ok: true, imoveis: nImoveis, reservas_novas: inseridas, reservas_atualizadas: atualizadas };
  } catch (e) {
    db.prepare("UPDATE app_stays_conta SET status='erro', ultimo_erro=?, atualizado_em=? WHERE tenant_id=?").run(s(e.message, 300), nowISO(), s(tenantId, 40));
    throw e;
  }
}

module.exports = { Conta, sincronizar, setFabrica, canalDe };
