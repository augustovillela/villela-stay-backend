// =====================================================================
// Villela CRM — FONTES da busca ativa (de onde vêm os lugares do Maps).
// Ver a decisão e os riscos em docs/integracoes/villela-crm.md (ADR-0001 da
// busca ativa). Resumo: a Places API do Google NÃO permite guardar nome,
// telefone, site nem endereço num banco (só place_id; lat/lng por 30 dias),
// então não serve para montar lista. A fonte executável é o Apify
// (actor compass/crawler-google-places), cobrado por lugar.
//
// Credencial SÓ por env: APIFY_TOKEN. Nada é chamado sem busca aprovada.
// =====================================================================
'use strict';

const ACTOR = process.env.CRM_BUSCA_APIFY_ACTOR || 'compass~crawler-google-places';
// preço público do actor (Apify Store): a partir de US$ 1,50 por 1.000 lugares.
// Confirmar no painel do Apify — o preço é do autor do actor e pode mudar.
const USD_POR_LUGAR = Number(process.env.CRM_BUSCA_USD_POR_LUGAR) || 0.0015;
const USD_BRL = Number(process.env.CRM_USD_BRL) || 5.6;

const FONTES = {
  apify: { rotulo: 'Apify (Google Maps)', configurada: () => !!process.env.APIFY_TOKEN },
};

/** Estimativa de custo de UMA varredura (teto: pior caso = max_resultados lugares). */
function estimarCusto(busca) {
  // o actor limita POR termo e por região: o pior caso é max × categorias × bairros
  const n = Math.max(0, Number(busca.max_resultados) || 0) * Math.max(1, Number(busca.n_termos) || 1) * Math.max(1, Number(busca.n_locais) || 1);
  const usd = n * USD_POR_LUGAR;
  return {
    lugares_max: n,
    usd: Math.round(usd * 100) / 100,
    usd_exato: usd, // sem arredondar: é o que a COBRANÇA usa (arredondar para centavos subestimaria o teto de buscas pequenas)
    brl_centavos: Math.ceil(usd * USD_BRL * 100),
    por_mes_centavos: Math.ceil(usd * USD_BRL * 100 * (30 / Math.max(1, Number(busca.frequencia_dias) || 7))),
    observacao: `US$ ${USD_POR_LUGAR * 1000}/mil lugares (preço público do actor), câmbio ${USD_BRL}. Cada varredura paga os lugares de novo, mesmo os já conhecidos.`,
  };
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const txt = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

/** Item cru do actor → lugar normalizado. Devolve null se não der para usar. */
function normalizarApify(it) {
  if (!it || typeof it !== 'object') return null;
  const place_id = txt(it.placeId, 120);
  const nome = txt(it.title, 200);
  if (!place_id || !nome) return null;
  if (it.permanentlyClosed || it.temporarilyClosed) return null;
  const loc = it.location || {};
  return {
    place_id, nome,
    categoria: txt(it.categoryName || (Array.isArray(it.categories) && it.categories[0]), 120),
    endereco: txt(it.address, 300),
    cidade: txt(it.city, 80), estado: txt(it.state, 40),
    telefone: txt(it.phoneUnformatted || it.phone, 40),
    site: txt(it.website, 300),
    lat: num(loc.lat), lng: num(loc.lng),
  };
}

/** Monta o input do actor a partir da busca. Sem scrapeContacts: o e-mail vem do site, por nós. */
function inputApify(busca) {
  const input = {
    searchStringsArray: (Array.isArray(busca.termos) && busca.termos.length ? busca.termos : [busca.termo]),
    maxCrawledPlacesPerSearch: busca.max_resultados,
    // Entrada MÍNIMA de propósito: os campos de "add-on ($)" do actor (skipClosedPlaces, maxReviews, maxImages,
    // scrapeSocialMediaProfiles…) são cobrados à parte, e scrapeSocialMediaProfiles exige scrapeContacts ligado —
    // mandá-lo com scrapeContacts=false derrubou a corrida inteira (run FAILED, 06/11/2026). Lugar fechado a gente
    // descarta em normalizarApify; o e-mail vem do site, por nós.
    language: 'pt-BR', countryCode: 'br',
    scrapeContacts: false,
  };
  if (busca.lat != null && busca.lng != null && busca.raio_m) {
    input.customGeolocation = { type: 'Point', coordinates: [busca.lng, busca.lat], radiusKm: Math.max(0.1, busca.raio_m / 1000) };
  } else if (busca.local_texto) {
    // o actor prefere formato simples ("Lago Sul, Brasília, DF"); " - DF" atrapalha o geocoder
    input.locationQuery = String(busca.local_texto).replace(/\s+-\s+/g, ', ');
  }
  return input;
}

// transporte injetável (testes): (url, init) => Response-like. Padrão: fetch global.
let _http = (...a) => fetch(...a);
function trocarTransporte(fn) { _http = fn || ((...a) => fetch(...a)); }

const apify = {
  // `opcoes.token`: token do próprio assinante (cofre); sem ele vale o do servidor (conta interna / créditos)
  async buscar(busca, opcoes = {}) {
    const token = opcoes.token || process.env.APIFY_TOKEN;
    if (!token) throw new Error('Token do Apify não configurado.');
    const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=240&clean=true&format=json&limit=${busca.max_resultados * Math.max(1, (busca.termos || []).length || 1)}`;
    const r = await _http(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(inputApify(busca)),
    });
    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      // Estourou o tempo da chamada (muitos lugares de uma vez): o Apify JÁ coletou uma parte e já cobra por ela.
      // Em vez de jogar fora, busca o que a execução guardou e segue (marcado como parcial).
      const run = /TIMED-OUT/.test(corpo) && corpo.match(/run ID:\s*([A-Za-z0-9]{8,30})/);
      if (run) {
        try {
          const lim = busca.max_resultados * Math.max(1, (busca.termos || []).length || 1);
          const h = { Authorization: 'Bearer ' + token };
          const info = await (await _http(`https://api.apify.com/v2/actor-runs/${run[1]}`, { headers: h })).json();
          const ds = info && info.data && info.data.defaultDatasetId;
          if (ds) {
            const parcial = await (await _http(`https://api.apify.com/v2/datasets/${ds}/items?clean=true&format=json&limit=${lim}`, { headers: h })).json();
            if (Array.isArray(parcial)) { const lista = parcial.slice(0, lim).map(normalizarApify).filter(Boolean); lista.parcial = true; return lista; }
          }
        } catch (_) { /* cai no erro original */ }
      }
      throw new Error(`Apify respondeu ${r.status}${r.status === 402 ? ' (sem crédito/limite do plano)' : ''}${/TIMED-OUT/.test(corpo) ? ' (tempo esgotado: peça menos lugares por região)' : ''}: ${corpo.slice(0, 160)}`);
    }
    const itens = await r.json();
    if (!Array.isArray(itens)) throw new Error('Resposta inesperada do Apify.');
    return itens.slice(0, busca.max_resultados * Math.max(1, (busca.termos || []).length || 1)).map(normalizarApify).filter(Boolean);
  },
};

function fonte(nome) { return nome === 'apify' ? apify : null; }

module.exports = { FONTES, estimarCusto, normalizarApify, inputApify, fonte, trocarTransporte, USD_POR_LUGAR, USD_BRL };
