// =====================================================================
// Villela Legal SaaS — CRÉDITOS DE IA (pré-pago) e CHAVE PRÓPRIA.
//
// Regra do negócio (Augusto, 08/10/2026): toda IA de escritório assinante
// é paga por quem usa — em QUALQUER plano, inclusive trial e cortesia. Não
// há franquia nem saldo inicial. Dois caminhos, que convivem:
//   * CRÉDITO PRÉ-PAGO: o escritório recarrega (Mercado Pago), o sistema
//     RESERVA o custo máximo antes de chamar o provedor e, ao terminar,
//     cobra só o custo real. Sem saldo, a tarefa não roda.
//   * CHAVE PRÓPRIA: o escritório cadastra a chave de API dele no provedor;
//     as chamadas saem pela conta dele e não consomem crédito.
// O escritório INTERNO não passa por aqui (legal/llm.js nem consulta).
//
// Dinheiro em CENTAVOS inteiros. O razão (ia_movimentos) é só-acréscimo:
// correção é novo lançamento, nunca edição. Custo do provedor chega em
// micro-dólares (1e-6 USD) para não perder as chamadas baratas no
// arredondamento; vira centavos de real com câmbio + margem, sempre para
// cima e com piso de 1 centavo.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, transacao, nowISO, novoId, j } = require('./db');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let _dep = { segredo: '', mp: null, mpAtivo: () => false, validarChave: null, notificar: async () => {} };
function configurar(d = {}) { _dep = { ..._dep, ...d }; }

// ---------------------------------------------------------------- CONFIG
// margem e recarga mínima são números comerciais: nascem com um padrão e o
// Augusto muda no staff (⚖️💼 Legal SaaS → 🤖 IA e créditos).
const PADRAO = { margem_pct: 30, cambio_modo: 'auto', cambio_manual: 0, cambio_auto: 0, cambio_auto_em: '', recarga_minima_centavos: 2000 };
const Config = {
  ler() {
    const out = { ...PADRAO };
    for (const r of db.prepare('SELECT chave, valor FROM ia_config').all()) {
      if (!(r.chave in PADRAO)) continue;
      out[r.chave] = typeof PADRAO[r.chave] === 'number' ? Number(r.valor) : String(r.valor);
    }
    return out;
  },
  gravar(chave, valor) {
    db.prepare('INSERT INTO ia_config (chave, valor, atualizado_em) VALUES (?,?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em')
      .run(chave, String(valor), nowISO());
  },
  atualizar(d = {}) {
    if (d.margem_pct != null) {
      const m = Number(d.margem_pct);
      if (!Number.isFinite(m) || m < 0 || m > 500) throw new Error('Margem inválida (0 a 500%).');
      Config.gravar('margem_pct', m);
    }
    if (d.cambio_modo != null) {
      if (!['auto', 'manual'].includes(d.cambio_modo)) throw new Error('Modo de câmbio inválido.');
      Config.gravar('cambio_modo', d.cambio_modo);
    }
    if (d.cambio_manual != null) {
      const c = Number(d.cambio_manual);
      if (!Number.isFinite(c) || c < 0 || c > 100) throw new Error('Câmbio inválido.');
      Config.gravar('cambio_manual', c);
    }
    if (d.recarga_minima_centavos != null) {
      const r = Math.round(Number(d.recarga_minima_centavos));
      if (!Number.isFinite(r) || r < 100) throw new Error('Recarga mínima inválida (mínimo R$ 1,00).');
      Config.gravar('recarga_minima_centavos', r);
    }
    return Config.ler();
  },
};
// reais por dólar em vigor (0 = sem cotação → a IA por crédito fica travada, de propósito)
function cambio() {
  const c = Config.ler();
  return c.cambio_modo === 'manual' ? Number(c.cambio_manual) || 0 : Number(c.cambio_auto) || 0;
}
// PTAX de venda do Banco Central (último dia útil). Falha de rede mantém a cotação anterior.
async function atualizarCambio(fetchFn = fetch) {
  const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
  const url = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@i,dataFinalCotacao=@f)'
    + `?@i='${fmt(new Date(Date.now() - 10 * 86400000))}'&@f='${fmt(new Date())}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json`;
  const r = await fetchFn(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('PTAX respondeu ' + r.status);
  const v = ((await r.json()).value || [])[0];
  const venda = v && Number(v.cotacaoVenda);
  if (!venda || venda < 1 || venda > 100) throw new Error('PTAX sem cotação válida.');
  Config.gravar('cambio_auto', venda);
  Config.gravar('cambio_auto_em', String(v.dataHoraCotacao || nowISO()).slice(0, 19));
  return venda;
}
// micro-dólares do provedor → centavos de real cobrados (câmbio + margem, para cima, piso 1)
function centavosDe(usdMicros) {
  const m = Number(usdMicros) || 0;
  if (m <= 0) return 0;
  const cam = cambio();
  if (!cam) throw Object.assign(new Error('Cotação do dólar indisponível no momento — a IA por crédito está pausada. Tente em instantes ou use a sua chave de API.'), { codigo: 'IA_SEM_CAMBIO' });
  return Math.max(1, Math.ceil(m / 1e6 * cam * (1 + Config.ler().margem_pct / 100) * 100));
}

// ---------------------------------------------------------------- CARTEIRA
const RESERVA_EXPIRA_MS = 30 * 60 * 1000; // processo caiu no meio da chamada → a reserva volta sozinha
function linha(tenantId) {
  const t = s(tenantId, 40);
  let c = db.prepare('SELECT * FROM ia_carteiras WHERE tenant_id = ?').get(t);
  if (!c) {
    db.prepare('INSERT INTO ia_carteiras (tenant_id, saldo_centavos, reservado_centavos, atualizado_em) VALUES (?,0,0,?)').run(t, nowISO());
    c = db.prepare('SELECT * FROM ia_carteiras WHERE tenant_id = ?').get(t);
  }
  return c;
}
function mover(tenantId, tipo, valor, { ref = '', detalhe = null, por = '' } = {}) {
  const c = linha(tenantId);
  const saldo = c.saldo_centavos + valor;
  db.prepare('UPDATE ia_carteiras SET saldo_centavos = ?, atualizado_em = ? WHERE tenant_id = ?').run(saldo, nowISO(), c.tenant_id);
  const id = novoId();
  db.prepare('INSERT INTO ia_movimentos (id, tenant_id, tipo, valor_centavos, saldo_apos_centavos, ref, detalhe, criado_em, criado_por) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, c.tenant_id, tipo, valor, saldo, s(ref, 120), j.str(detalhe), nowISO(), s(por, 120));
  return { id, saldo_centavos: saldo };
}
const Carteira = {
  // saldo = dinheiro do escritório; reservado = preso em tarefas em andamento; disponível = o que dá para gastar
  saldo(tenantId) {
    const c = linha(tenantId);
    return { saldo_centavos: c.saldo_centavos, reservado_centavos: c.reservado_centavos, disponivel_centavos: c.saldo_centavos - c.reservado_centavos };
  },
  extrato(tenantId, limite = 50) {
    return db.prepare('SELECT id, tipo, valor_centavos, saldo_apos_centavos, ref, detalhe, criado_em FROM ia_movimentos WHERE tenant_id = ? ORDER BY criado_em DESC, rowid DESC LIMIT ?')
      .all(s(tenantId, 40), Math.min(Number(limite) || 50, 500)).map(m => ({ ...m, detalhe: j.parse(m.detalhe, null) }));
  },
  liberarVencidas() {
    const corte = new Date(Date.now() - RESERVA_EXPIRA_MS).toISOString();
    for (const r of db.prepare("SELECT id FROM ia_reservas WHERE status = 'aberta' AND criado_em < ?").all(corte)) Carteira.cancelar(r.id, 'expirada');
  },
  // prende o custo MÁXIMO da tarefa. Sem saldo disponível → erro, e a tarefa não chama o provedor.
  reservar(tenantId, centavos, detalhe) {
    const valor = Math.max(1, Math.round(Number(centavos) || 0));
    return transacao(() => {
      Carteira.liberarVencidas();
      const c = linha(tenantId);
      const disp = c.saldo_centavos - c.reservado_centavos;
      if (disp < valor) {
        throw Object.assign(new Error(`Saldo de IA insuficiente: esta tarefa pode custar até ${brl(valor)} (você só paga o que for usado) e o saldo disponível é ${brl(Math.max(disp, 0))}. `
          + 'Recarregue em Painel → 🤖 Créditos de IA, ou cadastre a sua própria chave de API.'), { codigo: 'SALDO_IA', precisa_centavos: valor, disponivel_centavos: disp });
      }
      const id = novoId();
      db.prepare("INSERT INTO ia_reservas (id, tenant_id, valor_centavos, status, detalhe, criado_em) VALUES (?,?,?,'aberta',?,?)")
        .run(id, c.tenant_id, valor, j.str(detalhe || null), nowISO());
      db.prepare('UPDATE ia_carteiras SET reservado_centavos = reservado_centavos + ?, atualizado_em = ? WHERE tenant_id = ?').run(valor, nowISO(), c.tenant_id);
      return id;
    });
  },
  // solta a reserva e cobra o custo REAL (pode ser menor que o reservado; 0 = nada a cobrar)
  liquidar(reservaId, centavosReais, detalhe) {
    return transacao(() => {
      const r = db.prepare('SELECT * FROM ia_reservas WHERE id = ?').get(s(reservaId, 40));
      if (!r || r.status !== 'aberta') return { ok: false };
      const real = Math.max(0, Math.round(Number(centavosReais) || 0));
      db.prepare("UPDATE ia_reservas SET status = 'liquidada', cobrado_centavos = ?, fechado_em = ? WHERE id = ?").run(real, nowISO(), r.id);
      db.prepare('UPDATE ia_carteiras SET reservado_centavos = MAX(0, reservado_centavos - ?), atualizado_em = ? WHERE tenant_id = ?').run(r.valor_centavos, nowISO(), r.tenant_id);
      if (real > 0) mover(r.tenant_id, 'consumo', -real, { ref: 'reserva:' + r.id, detalhe: { ...(j.parse(r.detalhe, {}) || {}), ...(detalhe || {}), reservado_centavos: r.valor_centavos } });
      return { ok: true, cobrado_centavos: real };
    });
  },
  cancelar(reservaId, motivo = 'cancelada') {
    return transacao(() => {
      const r = db.prepare('SELECT * FROM ia_reservas WHERE id = ?').get(s(reservaId, 40));
      if (!r || r.status !== 'aberta') return { ok: false };
      db.prepare("UPDATE ia_reservas SET status = ?, fechado_em = ? WHERE id = ?").run(motivo === 'expirada' ? 'expirada' : 'cancelada', nowISO(), r.id);
      db.prepare('UPDATE ia_carteiras SET reservado_centavos = MAX(0, reservado_centavos - ?), atualizado_em = ? WHERE tenant_id = ?').run(r.valor_centavos, nowISO(), r.tenant_id);
      return { ok: true };
    });
  },
  // entrada de dinheiro. `ref` é a trava contra creditar duas vezes o mesmo pagamento.
  creditar(tenantId, centavos, { ref, detalhe, por } = {}) {
    const valor = Math.round(Number(centavos) || 0);
    if (valor <= 0) throw new Error('Valor de crédito inválido.');
    if (!s(ref)) throw new Error('Crédito exige referência (é ela que impede lançar duas vezes).');
    return transacao(() => {
      if (db.prepare("SELECT 1 FROM ia_movimentos WHERE tipo = 'recarga' AND ref = ?").get(s(ref, 120))) return { duplicado: true };
      return { duplicado: false, ...mover(tenantId, 'recarga', valor, { ref, detalhe, por }) };
    });
  },
  // acerto manual do staff (crédito ou débito), sempre com motivo
  ajustar(tenantId, centavos, motivo, por) {
    const valor = Math.round(Number(centavos) || 0);
    if (!valor) throw new Error('Informe o valor do ajuste.');
    if (s(motivo).length < 5) throw new Error('Explique o motivo do ajuste (fica no extrato do escritório).');
    return transacao(() => mover(tenantId, 'ajuste', valor, { ref: 'ajuste:' + novoId(), detalhe: { motivo: s(motivo, 300) }, por }));
  },
};

// ---------------------------------------------------------------- RECARGA (Mercado Pago)
const Recargas = {
  listar(tenantId, limite = 20) {
    return db.prepare('SELECT id, valor_centavos, status, link, criado_em, pago_em FROM ia_recargas WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT ?').all(s(tenantId, 40), Math.min(Number(limite) || 20, 100));
  },
  async criar(tenantId, centavos, { email, baseUrl } = {}) {
    const valor = Math.round(Number(centavos) || 0);
    const min = Config.ler().recarga_minima_centavos;
    if (!Number.isFinite(valor) || valor < min) throw new Error(`A recarga mínima é ${brl(min)}.`);
    if (valor > 5000000) throw new Error('Para recargas acima de R$ 50.000,00 fale com o suporte.');
    if (!_dep.mpAtivo() || !_dep.mp) throw new Error('Pagamento online indisponível no momento. Abra um chamado no Suporte para recarregar.');
    const id = novoId();
    db.prepare("INSERT INTO ia_recargas (id, tenant_id, valor_centavos, status, criado_em, criado_por) VALUES (?,?,?,'pendente',?,?)").run(id, s(tenantId, 40), valor, nowISO(), s(email, 120));
    const base = s(baseUrl, 200).replace(/\/+$/, '');
    const pref = await _dep.mp('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ title: 'Créditos de IA — Villela Legal', quantity: 1, unit_price: valor / 100, currency_id: 'BRL' }],
        ...(email ? { payer: { email } } : {}),
        external_reference: `legalsaas-ia:${s(tenantId, 40)}:${id}`,
        back_urls: { success: `${base}/juridico/app?creditos=1`, pending: `${base}/juridico/app?creditos=1`, failure: `${base}/juridico/app?creditos=1` },
        auto_return: 'approved',
        notification_url: `${base}/juridico/webhooks/mercadopago`,
        statement_descriptor: 'VILLELA LEGAL',
      }),
    });
    const link = pref.init_point || pref.sandbox_init_point || '';
    db.prepare('UPDATE ia_recargas SET mp_preference_id = ?, link = ? WHERE id = ?').run(s(pref.id, 80), s(link, 500), id);
    return { id, valor_centavos: valor, link };
  },
  // chamado pelo webhook com o pagamento JÁ re-buscado na API do MP (nunca com o corpo do webhook)
  confirmarPagamento(pay) {
    const ref = String((pay && pay.external_reference) || '');
    if (!ref.startsWith('legalsaas-ia:')) return { ok: false, ignorado: true };
    const [, tenantId, recargaId] = ref.split(':');
    const r = db.prepare('SELECT * FROM ia_recargas WHERE id = ? AND tenant_id = ?').get(s(recargaId, 40), s(tenantId, 40));
    if (!r) return { ok: false, motivo: 'recarga desconhecida' };
    if (pay.status !== 'approved') return { ok: false, motivo: 'pagamento ' + pay.status };
    // valor pago tem de cobrir o da recarga: Pix de centavo não vira crédito cheio
    const pago = Math.round(Number(pay.transaction_amount || 0) * 100);
    if (pago < r.valor_centavos) return { ok: false, motivo: `valor pago (${pago}) menor que o da recarga (${r.valor_centavos})` };
    const c = Carteira.creditar(r.tenant_id, r.valor_centavos, { ref: 'mp:' + String(pay.id), detalhe: { recarga_id: r.id, mp_payment_id: String(pay.id) }, por: 'mercadopago' });
    if (!c.duplicado) {
      db.prepare("UPDATE ia_recargas SET status = 'paga', mp_payment_id = ?, pago_em = ? WHERE id = ?").run(String(pay.id), nowISO(), r.id);
      Promise.resolve(_dep.notificar(`💳 Villela Legal: recarga de IA de ${brl(r.valor_centavos)} confirmada (escritório ${r.tenant_id}).`)).catch(() => {});
    }
    return { ok: true, duplicado: c.duplicado, tenant_id: r.tenant_id, valor_centavos: r.valor_centavos };
  },
};

// ---------------------------------------------------------------- CHAVE PRÓPRIA
// Guardada CIFRADA (AES-256-GCM). O segredo vem do ambiente (LEGAL_SAAS_SECRET_KEY)
// ou, na falta, do segredo de sessão do servidor. A chave em claro só existe em
// memória, na hora da chamada; nenhuma rota a devolve.
function chaveMestra() {
  const seg = process.env.LEGAL_SAAS_SECRET_KEY || _dep.segredo;
  if (!seg || String(seg).length < 16) throw new Error('Cofre de chaves indisponível neste servidor.');
  return crypto.createHash('sha256').update('legalsaas-ia-chave|' + seg).digest();
}
function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveMestra(), iv);
  const ct = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map(b => b.toString('base64')).join('.');
}
function decifrar(pacote) {
  const [iv, tag, ct] = String(pacote).split('.').map(p => Buffer.from(p, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', chaveMestra(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
const Chaves = {
  // o que se pode mostrar: nunca a chave, só os 4 últimos caracteres
  resumo(tenantId) {
    const r = db.prepare('SELECT provedor, final4, criado_em FROM ia_chaves WHERE tenant_id = ?').get(s(tenantId, 40));
    return r ? { tem: true, provedor: r.provedor, final4: r.final4, desde: r.criado_em } : { tem: false };
  },
  ler(tenantId) {
    const r = db.prepare('SELECT chave_cifrada FROM ia_chaves WHERE tenant_id = ?').get(s(tenantId, 40));
    if (!r) return null;
    try { return decifrar(r.chave_cifrada); } catch (_) { return null; } // segredo trocado → tratar como sem chave
  },
  async salvar(tenantId, chave, por) {
    const k = String(chave || '').trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(k)) throw new Error('Chave inválida. Cole a chave de API da Anthropic (começa com "sk-ant-"), criada no Claude Console.');
    if (typeof _dep.validarChave === 'function') {
      const ok = await _dep.validarChave(k).catch(() => false);
      if (!ok) throw new Error('O provedor recusou esta chave. Confira se ela está ativa e copiada por inteiro.');
    }
    db.prepare(`INSERT INTO ia_chaves (tenant_id, provedor, chave_cifrada, final4, criado_em, criado_por) VALUES (?,?,?,?,?,?)
      ON CONFLICT(tenant_id) DO UPDATE SET provedor = excluded.provedor, chave_cifrada = excluded.chave_cifrada, final4 = excluded.final4, criado_em = excluded.criado_em, criado_por = excluded.criado_por`)
      .run(s(tenantId, 40), 'anthropic', cifrar(k), k.slice(-4), nowISO(), s(por, 120));
    return Chaves.resumo(tenantId);
  },
  remover(tenantId) { db.prepare('DELETE FROM ia_chaves WHERE tenant_id = ?').run(s(tenantId, 40)); return { tem: false }; },
};

// ---------------------------------------------------------------- PORTÃO da IA
// O que legal/llm.js pergunta antes de cada chamada de um escritório assinante.
// `tenantLegal` é o id do banco jurídico ('esc-<slug>'), vindo do contexto da requisição.
function portaoDoTenant(tenantLegal) {
  const slug = String(tenantLegal || '').replace(/^esc-/, '');
  const t = db.prepare('SELECT id, nome FROM tenants WHERE slug = ?').get(s(slug, 120));
  if (!t) return { modo: 'bloqueado', motivo: 'Escritório não reconhecido para uso de IA.' };
  const chave = Chaves.ler(t.id);
  if (chave) return { modo: 'chave', tenantId: t.id, apiKey: chave };
  return {
    modo: 'credito', tenantId: t.id,
    disponivel: () => Carteira.saldo(t.id).disponivel_centavos,
    reservar: (usdMicros, detalhe) => Carteira.reservar(t.id, centavosDe(usdMicros), detalhe),
    liquidar: (reservaId, usdMicros, detalhe) => Carteira.liquidar(reservaId, centavosDe(usdMicros), { ...(detalhe || {}), usd_micros: Math.round(usdMicros) }),
    cancelar: (reservaId) => Carteira.cancelar(reservaId),
  };
}

// visão da plataforma (staff): quanto há em carteira e quanto se consumiu
function resumoPlataforma() {
  const linhas = db.prepare(`SELECT t.id, t.nome, t.status, COALESCE(c.saldo_centavos, 0) AS saldo_centavos, COALESCE(c.reservado_centavos, 0) AS reservado_centavos,
      (SELECT COALESCE(-SUM(m.valor_centavos), 0) FROM ia_movimentos m WHERE m.tenant_id = t.id AND m.tipo = 'consumo') AS consumido_centavos,
      (SELECT COALESCE(SUM(m.valor_centavos), 0) FROM ia_movimentos m WHERE m.tenant_id = t.id AND m.tipo = 'recarga') AS recarregado_centavos,
      (SELECT final4 FROM ia_chaves k WHERE k.tenant_id = t.id) AS chave_final4
    FROM tenants t LEFT JOIN ia_carteiras c ON c.tenant_id = t.id ORDER BY t.criado_em DESC`).all();
  return { config: Config.ler(), cambio: cambio(), escritorios: linhas };
}

module.exports = { configurar, Config, cambio, atualizarCambio, centavosDe, Carteira, Recargas, Chaves, portaoDoTenant, resumoPlataforma, brl };
