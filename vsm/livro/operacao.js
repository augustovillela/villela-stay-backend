// =====================================================================
// VSM · ONDA LIVRO — central de operações.
//
// Cap. 6/10 · cadastro mestre da unidade (a fonte da verdade)
// Cap. 13/20 · interligações entre anúncios, aplicadas nas DUAS direções
// Cap. 22/37 · bloqueios de calendário (saem das noites disponíveis)
// Cap. 20 · auditoria diária de sincronização — construída para DUVIDAR
// Cap. 39 · sinal de vida das rotinas e o painel do dia (cinco perguntas)
// =====================================================================
'use strict';
const B = require('./base');
const { db, j, s, num, cent, dia, hoje, novoId, nowISO, dias, somaDias, sobrepoe, auditar } = B;
const appRepo = require('../app-repo');
const staysRepo = require('../app-stays-repo');

// fábrica do cliente Stays (injetável nos testes; o padrão é o cliente real)
let _fabStays = (cfg) => require('../stays').criarCliente(cfg);
function setFabricaStays(f) { _fabStays = f; }

// =====================================================================
// CADASTRO MESTRE (Cap. 6) — o manual, a régua e a escala saem daqui.
// =====================================================================
const FICHA_VAZIA = {
  capacidade_confortavel: 0, capacidade_maxima: 0, camas: [], comodidades_verificadas: [], nao_tem: [],
  preparacao_min: 0, janela_minima_min: 0, acesso_particularidades: '', estacionamento: '', wifi_rede: '',
  checkin_hora: '15:00', checkout_hora: '11:00', regras: '', tarifa_minima_centavos: 0, custo_fixo_mes_centavos: 0,
};
const Ficha = {
  obter(tenantId, imovelId) {
    const f = db.prepare('SELECT * FROM lv_ficha WHERE tenant_id = ? AND imovel_id = ?').get(s(tenantId, 40), s(imovelId, 40));
    if (!f) return { imovel_id: s(imovelId, 40), ...FICHA_VAZIA, completa: false, faltando: Object.keys(FICHA_VAZIA) };
    const out = { ...f, camas: j.parse(f.camas, []), comodidades_verificadas: j.parse(f.comodidades_verificadas, []), nao_tem: j.parse(f.nao_tem, []) };
    return { ...out, ...Ficha.completude(out) };
  },
  // "falta dado" é resposta legítima: a régua não envia mensagem de chegada
  // sem o que a chegada exige (Cap. 31).
  completude(f) {
    const exigidos = ['capacidade_confortavel', 'preparacao_min', 'checkin_hora', 'checkout_hora', 'estacionamento'];
    const faltando = exigidos.filter(k => !f[k]);
    return { completa: faltando.length === 0, faltando };
  },
  salvar(tenantId, imovelId, d, quem) {
    const tid = s(tenantId, 40), iid = s(imovelId, 40);
    if (!appRepo.Imoveis.obter(tid, iid)) throw new Error('Imóvel não encontrado.');
    const antes = db.prepare('SELECT * FROM lv_ficha WHERE tenant_id = ? AND imovel_id = ?').get(tid, iid) || null;
    const at = (k, def) => (d[k] === undefined && antes) ? antes[k] : def;
    const conf = num(d.capacidade_confortavel, at('capacidade_confortavel', 0));
    const max = num(d.capacidade_maxima, at('capacidade_maxima', 0));
    // Cap. 8 · validação de coerência: capacidade confortável ≤ máxima
    if (conf && max && conf > max) throw new Error('A capacidade confortável não pode ser maior que a máxima.');
    const lista = (k) => Array.isArray(d[k]) ? d[k].slice(0, 100).map(x => s(x, 200)) : (antes ? j.parse(antes[k], []) : []);
    const camas = Array.isArray(d.camas) ? d.camas.slice(0, 60).map(c => ({ comodo: s(c.comodo, 80), tipo: s(c.tipo, 60), qtd: num(c.qtd, 1) })) : (antes ? j.parse(antes.camas, []) : []);
    // Cap. 32 · a ficha guarda o NOME da rede, nunca a senha. Barramos na entrada.
    const wifi = s(d.wifi_rede === undefined && antes ? antes.wifi_rede : d.wifi_rede, 120);
    db.prepare(`INSERT INTO lv_ficha (imovel_id, tenant_id, capacidade_confortavel, capacidade_maxima, camas,
        comodidades_verificadas, nao_tem, preparacao_min, janela_minima_min, acesso_particularidades, estacionamento,
        wifi_rede, checkin_hora, checkout_hora, regras, tarifa_minima_centavos, custo_fixo_mes_centavos, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(imovel_id) DO UPDATE SET capacidade_confortavel=excluded.capacidade_confortavel,
        capacidade_maxima=excluded.capacidade_maxima, camas=excluded.camas,
        comodidades_verificadas=excluded.comodidades_verificadas, nao_tem=excluded.nao_tem,
        preparacao_min=excluded.preparacao_min, janela_minima_min=excluded.janela_minima_min,
        acesso_particularidades=excluded.acesso_particularidades, estacionamento=excluded.estacionamento,
        wifi_rede=excluded.wifi_rede, checkin_hora=excluded.checkin_hora, checkout_hora=excluded.checkout_hora,
        regras=excluded.regras, tarifa_minima_centavos=excluded.tarifa_minima_centavos,
        custo_fixo_mes_centavos=excluded.custo_fixo_mes_centavos, atualizado_em=excluded.atualizado_em`)
      .run(iid, tid, conf, max, j.str(camas), j.str(lista('comodidades_verificadas')), j.str(lista('nao_tem')),
        num(d.preparacao_min, at('preparacao_min', 0)), num(d.janela_minima_min, at('janela_minima_min', 0)),
        s(d.acesso_particularidades === undefined && antes ? antes.acesso_particularidades : d.acesso_particularidades, 2000),
        s(d.estacionamento === undefined && antes ? antes.estacionamento : d.estacionamento, 500), wifi,
        s(d.checkin_hora === undefined && antes ? antes.checkin_hora : d.checkin_hora, 5) || '15:00',
        s(d.checkout_hora === undefined && antes ? antes.checkout_hora : d.checkout_hora, 5) || '11:00',
        s(d.regras === undefined && antes ? antes.regras : d.regras, 4000),
        cent(d.tarifa_minima_centavos === undefined && antes ? antes.tarifa_minima_centavos : d.tarifa_minima_centavos),
        cent(d.custo_fixo_mes_centavos === undefined && antes ? antes.custo_fixo_mes_centavos : d.custo_fixo_mes_centavos),
        nowISO());
    const depois = Ficha.obter(tid, iid);
    auditar(tid, quem, 'ficha.salvar', 'lv_ficha', iid, antes, depois);
    return depois;
  },
  // painel de completude do cadastro: o que impede a operação de rodar
  panorama(tenantId) {
    return appRepo.Imoveis.listar(s(tenantId, 40)).map(i => {
      const f = Ficha.obter(tenantId, i.id);
      return { imovel_id: i.id, nome: i.nome, completa: f.completa, faltando: f.faltando, preparacao_min: f.preparacao_min, tarifa_minima_centavos: f.tarifa_minima_centavos };
    });
  },
};

// =====================================================================
// INTERLIGAÇÕES (Cap. 13/20) — camada 2 do anti-overbooking.
// Ocupar a casa inteira bloqueia os quartos; ocupar um quarto bloqueia a
// casa inteira. As duas direções, sempre.
// =====================================================================
const Interligacoes = {
  listar(tenantId) {
    const tid = s(tenantId, 40);
    const nomes = {};
    for (const i of appRepo.Imoveis.listar(tid)) nomes[i.id] = i.nome;
    return db.prepare('SELECT * FROM lv_interligacoes WHERE tenant_id = ? ORDER BY criado_em').all(tid)
      .map(r => ({ ...r, nome_a: nomes[r.imovel_a] || '(removido)', nome_b: nomes[r.imovel_b] || '(removido)' }));
  },
  criar(tenantId, d, quem) {
    const tid = s(tenantId, 40), a = s(d.imovel_a, 40), b = s(d.imovel_b, 40);
    if (!a || !b || a === b) throw new Error('Escolha dois imóveis diferentes.');
    if (!appRepo.Imoveis.obter(tid, a) || !appRepo.Imoveis.obter(tid, b)) throw new Error('Imóvel não encontrado.');
    const existe = db.prepare('SELECT 1 FROM lv_interligacoes WHERE tenant_id = ? AND ((imovel_a=? AND imovel_b=?) OR (imovel_a=? AND imovel_b=?))').get(tid, a, b, b, a);
    if (existe) throw new Error('Esses dois anúncios já estão interligados.');
    const id = novoId();
    db.prepare('INSERT INTO lv_interligacoes (id, tenant_id, imovel_a, imovel_b, obs, criado_em) VALUES (?,?,?,?,?,?)')
      .run(id, tid, a, b, s(d.obs, 500), nowISO());
    auditar(tid, quem, 'interligacao.criar', 'lv_interligacoes', id, null, { a, b });
    return { ok: true, id };
  },
  remover(tenantId, id, quem) {
    const antes = db.prepare('SELECT * FROM lv_interligacoes WHERE tenant_id = ? AND id = ?').get(s(tenantId, 40), s(id, 40));
    db.prepare('DELETE FROM lv_interligacoes WHERE tenant_id = ? AND id = ?').run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'interligacao.remover', 'lv_interligacoes', s(id, 40), antes, null);
    return { ok: true };
  },
  // vizinhos diretos de um imóvel (as duas direções da tabela)
  vizinhos(tenantId, imovelId) {
    const tid = s(tenantId, 40), iid = s(imovelId, 40);
    const rs = db.prepare('SELECT imovel_a, imovel_b FROM lv_interligacoes WHERE tenant_id = ? AND (imovel_a = ? OR imovel_b = ?)').all(tid, iid, iid);
    return [...new Set(rs.map(r => (r.imovel_a === iid ? r.imovel_b : r.imovel_a)))];
  },
  // fecho transitivo: o "espaço físico" a que o anúncio pertence. É o que
  // faz a ocupação contar UMA vez (Apêndice F, F1).
  espacos(tenantId) {
    const tid = s(tenantId, 40);
    const pai = {};
    const achar = (x) => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; };
    for (const i of appRepo.Imoveis.listar(tid)) pai[i.id] = i.id;
    for (const r of db.prepare('SELECT imovel_a, imovel_b FROM lv_interligacoes WHERE tenant_id = ?').all(tid)) {
      if (pai[r.imovel_a] === undefined || pai[r.imovel_b] === undefined) continue;
      const ra = achar(r.imovel_a), rb = achar(r.imovel_b);
      if (ra !== rb) pai[ra] = rb;
    }
    const grupos = {};
    for (const id of Object.keys(pai)) {
      const r = achar(id);
      (grupos[r] = grupos[r] || []).push(id);
    }
    return { representante: (id) => (pai[id] === undefined ? id : achar(id)), grupos: Object.values(grupos) };
  },
  // conflito considerando a interligação — o que o núcleo sozinho não vê
  conflito(tenantId, { imovel_id, checkin, checkout, ignorarReservaId = '' }) {
    const tid = s(tenantId, 40), iid = s(imovel_id, 40);
    const ci = dia(checkin), co = dia(checkout);
    const alvos = [iid, ...Interligacoes.vizinhos(tid, iid)];
    const nomes = {};
    for (const i of appRepo.Imoveis.listar(tid)) nomes[i.id] = i.nome;
    for (const alvo of alvos) {
      const rs = db.prepare(`SELECT id, imovel_id, checkin, checkout, hospede_nome FROM app_reservas
        WHERE tenant_id = ? AND imovel_id = ? AND status IN ('pendente','confirmada') AND id <> ?`).all(tid, alvo, s(ignorarReservaId, 40));
      for (const r of rs) {
        if (sobrepoe(ci, co, r.checkin, r.checkout)) {
          return {
            conflito: true, tipo: alvo === iid ? 'mesma_unidade' : 'interligado',
            imovel_id: alvo, imovel_nome: nomes[alvo] || alvo, reserva_id: r.id,
            checkin: r.checkin, checkout: r.checkout, hospede: r.hospede_nome,
          };
        }
      }
      // bloqueio de calendário também impede venda
      const bs = db.prepare('SELECT id, de, ate, motivo FROM lv_bloqueios WHERE tenant_id = ? AND imovel_id = ?').all(tid, alvo);
      for (const b of bs) {
        if (sobrepoe(ci, co, b.de, b.ate)) {
          return { conflito: true, tipo: 'bloqueio', imovel_id: alvo, imovel_nome: nomes[alvo] || alvo, bloqueio_id: b.id, checkin: b.de, checkout: b.ate, motivo: b.motivo };
        }
      }
    }
    return { conflito: false };
  },
};

// A camada 2 aplicada de verdade: envolvemos Reservas.criar do núcleo em vez
// de reescrevê-lo. O núcleo continua bloqueando a mesma unidade; a guarda
// acrescenta os interligados e os bloqueios de calendário.
let _guardaInstalada = false;
function instalarGuardaInterligacao() {
  if (_guardaInstalada) return;
  const original = appRepo.Reservas.criar.bind(appRepo.Reservas);
  appRepo.Reservas.criar = function (tenantId, d) {
    const c = Interligacoes.conflito(tenantId, { imovel_id: d && d.imovel_id, checkin: d && d.checkin, checkout: d && d.checkout });
    if (c.conflito && c.tipo !== 'mesma_unidade') {
      const quando = `${c.checkin} → ${c.checkout}`;
      throw new Error(c.tipo === 'bloqueio'
        ? `Essa data está bloqueada em "${c.imovel_nome}" (${c.motivo}, ${quando}).`
        : `"${c.imovel_nome}" está interligado a este anúncio e já tem reserva em ${quando}. Ocupar um bloqueia o outro (Cap. 13).`);
    }
    return original(tenantId, d);
  };
  _guardaInstalada = true;
}

// =====================================================================
// BLOQUEIOS DE CALENDÁRIO (Cap. 22/30/37)
// =====================================================================
const Bloqueios = {
  listar(tenantId, { imovel_id = '', desde = '' } = {}) {
    const tid = s(tenantId, 40);
    const args = [tid];
    let sql = 'SELECT * FROM lv_bloqueios WHERE tenant_id = ?';
    if (imovel_id) { sql += ' AND imovel_id = ?'; args.push(s(imovel_id, 40)); }
    if (desde) { sql += ' AND ate >= ?'; args.push(dia(desde)); }
    const nomes = {};
    for (const i of appRepo.Imoveis.listar(tid)) nomes[i.id] = i.nome;
    return db.prepare(sql + ' ORDER BY de').all(...args).map(b => ({ ...b, imovel_nome: nomes[b.imovel_id] || '(removido)' }));
  },
  criar(tenantId, d, quem) {
    const tid = s(tenantId, 40), iid = s(d.imovel_id, 40);
    const de = dia(d.de), ate = dia(d.ate);
    if (!appRepo.Imoveis.obter(tid, iid)) throw new Error('Imóvel não encontrado.');
    if (!de || !ate || dias(de, ate) <= 0) throw new Error('Informe um período válido (o fim é exclusivo, como o check-out).');
    // não bloqueamos por cima de reserva viva: isso seria decidir por alguém
    const r = db.prepare(`SELECT id, checkin, checkout FROM app_reservas WHERE tenant_id = ? AND imovel_id = ?
      AND status IN ('pendente','confirmada')`).all(tid, iid).find(x => sobrepoe(de, ate, x.checkin, x.checkout));
    if (r) throw new Error(`Existe reserva ativa nesse período (${r.checkin} → ${r.checkout}). Resolva a reserva antes de bloquear.`);
    const id = novoId();
    const motivo = ['manutencao', 'reforma', 'proprietario', 'reserva_segurada'].includes(s(d.motivo)) ? s(d.motivo) : 'manutencao';
    // Cap. 30: data segurada SEM prazo é data perdida por educação
    if (motivo === 'reserva_segurada' && !dia(d.expira_em)) throw new Error('Data segurada exige prazo de validade (Cap. 30).');
    db.prepare('INSERT INTO lv_bloqueios (id, tenant_id, imovel_id, de, ate, motivo, detalhe, expira_em, responsavel, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, tid, iid, de, ate, motivo, s(d.detalhe, 500), dia(d.expira_em), s(d.responsavel, 120), nowISO());
    auditar(tid, quem, 'bloqueio.criar', 'lv_bloqueios', id, null, { iid, de, ate, motivo });
    return db.prepare('SELECT * FROM lv_bloqueios WHERE id = ?').get(id);
  },
  remover(tenantId, id, quem) {
    const antes = db.prepare('SELECT * FROM lv_bloqueios WHERE tenant_id = ? AND id = ?').get(s(tenantId, 40), s(id, 40));
    db.prepare('DELETE FROM lv_bloqueios WHERE tenant_id = ? AND id = ?').run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'bloqueio.remover', 'lv_bloqueios', s(id, 40), antes, null);
    return { ok: true };
  },
  // noites bloqueadas por manutenção/reforma dentro de um período (saem do
  // denominador da ocupação — Apêndice F, convenção 3)
  noitesBloqueadas(tenantId, imovelId, de, ate) {
    const rs = db.prepare("SELECT de, ate, motivo FROM lv_bloqueios WHERE tenant_id = ? AND imovel_id = ? AND motivo IN ('manutencao','reforma')")
      .all(s(tenantId, 40), s(imovelId, 40));
    let n = 0;
    for (const b of rs) {
      const ini = b.de > de ? b.de : de;
      const fim = b.ate < ate ? b.ate : ate;
      const d = dias(ini, fim);
      if (d > 0) n += d;
    }
    return n;
  },
  // Cap. 30 · datas seguradas cujo prazo passou e ninguém soltou
  vencidos(tenantId) {
    return Bloqueios.listar(tenantId).filter(b => b.motivo === 'reserva_segurada' && b.expira_em && b.expira_em < hoje());
  },
};

// =====================================================================
// ROTINAS E SINAL DE VIDA (Cap. 39)
// "Ausência de sinal é um alerta — rotina que morreu não reporta erro."
// =====================================================================
const Rotinas = {
  listar(tenantId) {
    const agora = Date.now();
    return db.prepare('SELECT * FROM lv_rotinas WHERE tenant_id = ? ORDER BY nome').all(s(tenantId, 40)).map(r => {
      const tol = (r.periodicidade_min || 1440) * 2 * 60000; // duas janelas de tolerância
      // rotina que NUNCA executou é "não iniciada", não "sem sinal": só vira
      // alerta quem já deu sinal alguma vez e parou — que é o caso perigoso
      // do Cap. 39. Um alerta que dispara no primeiro dia vira ruído (Cap. 22).
      const nunca = !r.ultima_execucao;
      const atrasada = !!r.ativa && !nunca && (agora - Date.parse(r.ultima_execucao)) > tol;
      const situacao = !r.ativa ? 'desligada'
        : nunca ? 'nao_iniciada'
          : atrasada ? 'sem_sinal'
            : (r.ultimo_status === 'falha' ? 'falha' : 'ok');
      return { ...r, atrasada, nunca_executou: nunca, situacao };
    });
  },
  registrar(tenantId, d, quem) {
    const nome = s(d.nome, 80).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!nome) throw new Error('Informe o nome da rotina.');
    const antes = db.prepare('SELECT * FROM lv_rotinas WHERE tenant_id = ? AND nome = ?').get(s(tenantId, 40), nome) || null;
    db.prepare(`INSERT INTO lv_rotinas (id, tenant_id, nome, descricao, periodicidade_min, ativa, criado_em)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id, nome) DO UPDATE SET descricao=excluded.descricao, periodicidade_min=excluded.periodicidade_min, ativa=excluded.ativa`)
      .run(antes ? antes.id : novoId(), s(tenantId, 40), nome, s(d.descricao, 500), Math.max(1, num(d.periodicidade_min, 1440)), d.ativa === false ? 0 : 1, nowISO());
    auditar(tenantId, quem, 'rotina.registrar', 'lv_rotinas', nome, antes, null);
    return db.prepare('SELECT * FROM lv_rotinas WHERE tenant_id = ? AND nome = ?').get(s(tenantId, 40), nome);
  },
  // o heartbeat do Cap. 39: a rotina declara que executou E com que resultado.
  // "falha alta": erro reportado NUNCA vira status ok.
  heartbeat(tenantId, nome, { status = 'ok', erro = '' } = {}) {
    const n = s(nome, 80).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const r = db.prepare('SELECT * FROM lv_rotinas WHERE tenant_id = ? AND nome = ?').get(s(tenantId, 40), n);
    if (!r) throw new Error('Rotina não registrada.');
    const st = (s(erro) || s(status) === 'falha') ? 'falha' : 'ok';
    db.prepare('UPDATE lv_rotinas SET ultima_execucao = ?, ultimo_status = ?, ultimo_erro = ? WHERE id = ?')
      .run(nowISO(), st, s(erro, 500), r.id);
    return { ok: true, status: st };
  },
};

// =====================================================================
// AUDITORIA DE SINCRONIZAÇÃO (Cap. 20)
// Compara FONTES INDEPENDENTES e falha alto. Ausência de erro não é
// evidência de acerto: se uma fonte não pôde ser lida, o relatório é
// declarado PARCIAL e nunca conclui "tudo certo".
// =====================================================================
const RISCOS = { CRITICO: 'critico', ALTO: 'alto', MEDIO: 'medio', BAIXO: 'baixo' };

async function rodarAuditoria(tenantId, { janelaDias = 90 } = {}) {
  const tid = s(tenantId, 40);
  const de = hoje(), ate = somaDias(de, Math.max(1, num(janelaDias, 90)));
  const divergencias = [];
  const fontesIndisponiveis = [];
  const imoveis = appRepo.Imoveis.listar(tid);
  const nomes = {}; for (const i of imoveis) nomes[i.id] = i.nome;

  // ---- verificação 1: interligações nas DUAS direções ----
  // não basta a tabela existir: a ocupação de um precisa impedir a venda do outro.
  const reservasVivas = db.prepare(`SELECT id, imovel_id, checkin, checkout, hospede_nome FROM app_reservas
    WHERE tenant_id = ? AND status IN ('pendente','confirmada') AND checkout > ? AND checkin < ?`).all(tid, de, ate);
  for (const r of reservasVivas) {
    for (const viz of Interligacoes.vizinhos(tid, r.imovel_id)) {
      for (const outra of reservasVivas) {
        if (outra.imovel_id !== viz || outra.id === r.id) continue;
        if (!sobrepoe(r.checkin, r.checkout, outra.checkin, outra.checkout)) continue;
        // par duplicado: reporta uma vez só, na ordem estável dos ids
        if (r.id > outra.id) continue;
        divergencias.push({
          risco: RISCOS.CRITICO, tipo: 'interligados_vendidos',
          unidade: nomes[r.imovel_id] || r.imovel_id, data: r.checkin,
          texto: `A mesma noite está vendida em dois anúncios interligados: "${nomes[r.imovel_id] || r.imovel_id}" (${r.checkin}→${r.checkout}) e "${nomes[outra.imovel_id] || outra.imovel_id}" (${outra.checkin}→${outra.checkout}).`,
          valor_a: r.id, valor_b: outra.id,
        });
      }
    }
    // reserva viva sobre bloqueio de manutenção
    for (const b of db.prepare("SELECT de, ate, motivo FROM lv_bloqueios WHERE tenant_id = ? AND imovel_id = ? AND motivo IN ('manutencao','reforma')").all(tid, r.imovel_id)) {
      if (sobrepoe(r.checkin, r.checkout, b.de, b.ate)) {
        divergencias.push({
          risco: RISCOS.ALTO, tipo: 'reserva_sobre_bloqueio', unidade: nomes[r.imovel_id] || r.imovel_id, data: r.checkin,
          texto: `Reserva ${r.checkin}→${r.checkout} coincide com bloqueio de ${b.motivo} (${b.de}→${b.ate}).`,
        });
      }
    }
  }

  // ---- verificação 2: bloqueio expirado que ninguém soltou (Cap. 20, item 7) ----
  for (const b of Bloqueios.vencidos(tid)) {
    divergencias.push({
      risco: RISCOS.MEDIO, tipo: 'bloqueio_expirado', unidade: b.imovel_nome, data: b.de,
      texto: `Data segurada em "${b.imovel_nome}" (${b.de}→${b.ate}) venceu em ${b.expira_em} e continua bloqueada. Ocupa estoque sem vender.`,
    });
  }

  // ---- verificação 3: PMS × channel manager (fontes independentes) ----
  const conta = staysRepo.Conta.obter(tid);
  if (!conta) {
    fontesIndisponiveis.push({ fonte: 'stays', motivo: 'Nenhuma conta de channel manager conectada — a comparação entre fontes independentes não foi feita.' });
  } else {
    try {
      const cli = _fabStays({ base_url: conta.base_url, client_id: conta.client_id, secret: conta.secret });
      const externas = await cli.reservations({ from: de, to: ate, dateType: 'arrival' });
      const porStaysId = {};
      for (const r of db.prepare('SELECT id, stays_id, imovel_id, checkin, checkout, status, valor_centavos FROM app_reservas WHERE tenant_id = ?').all(tid)) {
        if (r.stays_id) porStaysId[r.stays_id] = r;
      }
      let conferidas = 0;
      for (const e of (externas || [])) {
        const eid = s(e._id || e.id, 60);
        if (!eid) continue;
        const tipo = s(e.type || e._t_reservationType || '', 40).toLowerCase();
        if (tipo === 'blocked') continue;
        conferidas++;
        const local = porStaysId[eid];
        const ci = dia(e.checkInDate || e.arrivalDate || e.from), co = dia(e.checkOutDate || e.departureDate || e.to);
        if (!local) {
          divergencias.push({
            risco: RISCOS.CRITICO, tipo: 'reserva_nao_propagada', unidade: '(canal)', data: ci,
            texto: `Reserva ${eid} existe no channel manager (${ci}→${co}) e NÃO existe no sistema. A data segue vendável aqui.`,
          });
          continue;
        }
        if (ci && co && (local.checkin !== ci || local.checkout !== co)) {
          divergencias.push({
            risco: RISCOS.CRITICO, tipo: 'datas_divergentes', unidade: nomes[local.imovel_id] || local.imovel_id, data: ci,
            texto: `Datas divergentes na reserva ${eid}.`, valor_a: `${local.checkin}→${local.checkout} (sistema)`, valor_b: `${ci}→${co} (canal)`,
          });
        }
        const vExt = cent(((e.price && (e.price._f_total || e.price.total)) || 0) * 100);
        if (vExt && local.valor_centavos && Math.abs(vExt - local.valor_centavos) > 100) {
          divergencias.push({
            risco: RISCOS.ALTO, tipo: 'valor_divergente', unidade: nomes[local.imovel_id] || local.imovel_id, data: ci,
            texto: `Valor divergente na reserva ${eid}.`, valor_a: `${(local.valor_centavos / 100).toFixed(2)} (sistema)`, valor_b: `${(vExt / 100).toFixed(2)} (canal)`,
          });
        }
      }
      // o inverso: reserva local de origem stays que sumiu do canal
      for (const [sid, local] of Object.entries(porStaysId)) {
        if (local.status === 'cancelada' || local.checkin < de || local.checkin >= ate) continue;
        if (!(externas || []).some(e => s(e._id || e.id, 60) === sid)) {
          divergencias.push({
            risco: RISCOS.ALTO, tipo: 'sumiu_do_canal', unidade: nomes[local.imovel_id] || local.imovel_id, data: local.checkin,
            texto: `A reserva ${sid} existe aqui e não voltou na leitura do canal. Pode ter sido cancelada lá sem propagar.`,
          });
        }
      }
      if (!conferidas) fontesIndisponiveis.push({ fonte: 'stays', motivo: 'O canal respondeu sem nenhuma reserva na janela — verifique se é real antes de concluir que está tudo certo.' });
    } catch (e) {
      // regra de projeto do Cap. 20: fonte ilegível é ALERTA, nunca "tudo certo"
      fontesIndisponiveis.push({ fonte: 'stays', motivo: `Não foi possível ler o channel manager: ${s(e.message, 300)}` });
    }
  }

  const parcial = fontesIndisponiveis.length > 0;
  const resumo = {
    criticas: divergencias.filter(d => d.risco === RISCOS.CRITICO).length,
    altas: divergencias.filter(d => d.risco === RISCOS.ALTO).length,
    medias: divergencias.filter(d => d.risco === RISCOS.MEDIO).length,
    baixas: divergencias.filter(d => d.risco === RISCOS.BAIXO).length,
    janela_dias: num(janelaDias, 90), imoveis: imoveis.length,
    veredito: parcial ? 'PARCIAL — não conclua que está tudo certo' : (divergencias.length ? 'DIVERGÊNCIAS ENCONTRADAS' : 'sem divergências nas fontes lidas'),
  };
  const id = novoId();
  db.prepare('INSERT INTO lv_auditorias (id, tenant_id, quando, parcial, fontes_indisponiveis, divergencias, resumo) VALUES (?,?,?,?,?,?,?)')
    .run(id, tid, nowISO(), parcial ? 1 : 0, j.str(fontesIndisponiveis), j.str(divergencias), j.str(resumo));
  // a própria auditoria dá sinal de vida — e falha alto quando é parcial
  try { Rotinas.heartbeat(tid, 'auditoria_sincronizacao', { status: parcial ? 'falha' : 'ok', erro: parcial ? 'fonte indisponível' : '' }); } catch (_) {}
  return { id, quando: nowISO(), parcial, fontes_indisponiveis: fontesIndisponiveis, divergencias, resumo };
}

const Auditorias = {
  ultima(tenantId) {
    const r = db.prepare('SELECT * FROM lv_auditorias WHERE tenant_id = ? ORDER BY quando DESC LIMIT 1').get(s(tenantId, 40));
    if (!r) return null;
    return { ...r, parcial: !!r.parcial, fontes_indisponiveis: j.parse(r.fontes_indisponiveis, []), divergencias: j.parse(r.divergencias, []), resumo: j.parse(r.resumo, {}) };
  },
  listar(tenantId, limite = 30) {
    return db.prepare('SELECT id, quando, parcial, resumo FROM lv_auditorias WHERE tenant_id = ? ORDER BY quando DESC LIMIT ?')
      .all(s(tenantId, 40), Math.min(200, num(limite, 30))).map(r => ({ ...r, parcial: !!r.parcial, resumo: j.parse(r.resumo, {}) }));
  },
};

module.exports = {
  Ficha, Interligacoes, Bloqueios, Rotinas, Auditorias, rodarAuditoria,
  instalarGuardaInterligacao, setFabricaStays, RISCOS,
};
