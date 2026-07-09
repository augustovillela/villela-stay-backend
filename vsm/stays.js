// =====================================================================
// Villela Stay Manager (VSM) — cliente Stays.net POR TENANT.
//
// Cada operação assinante conecta a PRÓPRIA conta Stays.net (channel manager
// que já sincroniza Airbnb/Booking/Decolar/Vrbo/Expedia/Google...). Aqui mora
// o cliente HTTP genérico (Basic Auth com as credenciais do tenant). Mesmo
// padrão do cliente da casa (server.js: stays()/staysPaginado()), mas sem
// credencial fixa — recebe a config do tenant.
// =====================================================================
'use strict';

// normaliza a base: aceita "conta.stays.com.br", URL completa ou com /external/v1
function normalizarBase(raw) {
  let b = String(raw || '').trim().replace(/\/+$/, '');
  if (!b) throw new Error('Informe a URL/base da sua conta Stays.');
  if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
  if (!/\/external\/v\d/i.test(b)) b += '/external/v1';
  return b;
}

// cria um cliente para uma conta Stays. fetchImpl injetável (testes).
function criarCliente(cfg, fetchImpl) {
  const base = normalizarBase(cfg.base_url || cfg.baseUrl);
  const id = String(cfg.client_id || cfg.clientId || '').trim();
  const secret = String(cfg.secret || '').trim();
  if (!id || !secret) throw new Error('Informe client_id e secret da sua conta Stays.');
  const auth = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
  const doFetch = fetchImpl || fetch;

  async function get(pathname, params) {
    const url = new URL(base + pathname);
    for (const [k, v] of Object.entries(params || {})) if (v != null) url.searchParams.set(k, v);
    const r = await doFetch(url.toString(), { headers: { Authorization: auth } });
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Stays ${r.status}: ${String(t).slice(0, 200)}`); }
    return r.json();
  }
  async function paginado(pathname, params) {
    const limit = 20; let skip = 0; const out = [];
    for (let i = 0; i < 500; i++) {
      const page = await get(pathname, { ...(params || {}), limit, skip });
      const arr = Array.isArray(page) ? page : (page && Array.isArray(page.results) ? page.results : []);
      out.push(...arr);
      if (arr.length < limit) break;
      skip += limit;
    }
    return out;
  }
  return {
    base,
    listings: () => paginado('/content/listings', {}),
    reservations: ({ from, to, dateType = 'arrival' }) => paginado('/booking/reservations', { from, to, dateType }),
    cliente: (cid) => get(`/booking/clients/${cid}`),
    // validação leve da credencial: 1 página de anúncios
    testar: async () => { await get('/content/listings', { limit: 1, skip: 0 }); return true; },
  };
}

module.exports = { criarCliente, normalizarBase };
