// =====================================================================
// VSM · ONDA LIVRO — operação de campo e painel do dia.
//
// Cap. 35 · escala do dia (faxina/preparação/VIRADA), confirmação com
//           evidência, liberação formal da unidade, inspeção por amostragem
// Cap. 36 · previsão de consumo pelo calendário, enxoval por lote, fornecedores
// Cap. 37 · plano preventivo com janelas SEM HÓSPEDE e reincidência
// Cap. 39 · o painel do dia: as cinco perguntas da manhã
// =====================================================================
'use strict';
const B = require('./base');
const { db, j, s, num, cent, dia, hoje, novoId, nowISO, dias, somaDias, sobrepoe, auditar } = B;
const appRepo = require('../app-repo');
const OP = require('./operacao');

const nomesImoveis = (tid) => {
  const m = {};
  for (const i of appRepo.Imoveis.listar(tid)) m[i.id] = i.nome;
  return m;
};
const minutos = (hhmm) => {
  const p = String(hhmm || '').split(':');
  return (num(p[0], 0) * 60) + num(p[1], 0);
};

// =====================================================================
// ESCALA DO DIA (Cap. 35)
// Cada check-out gera FAXINA, cada check-in gera PREPARAÇÃO, os dois no
// mesmo dia e unidade geram VIRADA — e a janela é comparada com o tempo
// REAL de preparação da ficha. Menor que ele = RISCO.
// =====================================================================
const Escala = {
  doDia(tenantId, data) {
    const tid = s(tenantId, 40);
    const d = dia(data) || hoje();
    const amanha = somaDias(d, 1);
    const nomes = nomesImoveis(tid);
    const fichas = {};
    for (const id of Object.keys(nomes)) fichas[id] = OP.Ficha.obter(tid, id);

    const saidas = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ? AND checkout = ? AND status IN ('confirmada','concluida')`).all(tid, d);
    const chegadas = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ? AND checkin IN (?,?) AND status IN ('pendente','confirmada')`).all(tid, d, amanha);
    const novas = db.prepare(`SELECT id, imovel_id, checkin FROM app_reservas WHERE tenant_id = ? AND criado_em >= ?`).all(tid, somaDias(d, -1) + 'T00:00:00.000Z');
    const novasPorImovel = new Set(novas.map(r => r.imovel_id));

    const limpezas = db.prepare('SELECT * FROM app_limpezas WHERE tenant_id = ? AND data = ?').all(tid, d);
    const execs = {};
    for (const e of db.prepare('SELECT * FROM lv_limpeza_exec WHERE tenant_id = ?').all(tid)) execs[e.limpeza_id] = e;

    const chamados = db.prepare("SELECT * FROM app_manutencao WHERE tenant_id = ? AND status <> 'resolvido'").all(tid);

    const tarefas = [];
    const riscos = [];
    const semResponsavel = [];

    for (const sai of saidas) {
      const f = fichas[sai.imovel_id] || {};
      const chega = chegadas.find(c => c.imovel_id === sai.imovel_id && c.checkin === d);
      const lim = limpezas.find(l => l.imovel_id === sai.imovel_id) || null;
      const ex = lim ? execs[lim.id] : null;
      const tipo = chega ? 'virada' : 'faxina';
      const janela = chega ? (minutos(f.checkin_hora || '15:00') - minutos(f.checkout_hora || '11:00')) : null;
      const preparo = num(f.preparacao_min, 0);
      const risco = tipo === 'virada' && preparo > 0 && janela !== null && janela < preparo;
      const t = {
        tipo, imovel_id: sai.imovel_id, imovel: nomes[sai.imovel_id] || sai.imovel_id,
        saida_em: f.checkout_hora || '11:00', chegada_em: chega ? (f.checkin_hora || '15:00') : '',
        janela_min: janela, preparacao_min: preparo, risco,
        limpeza_id: lim ? lim.id : '', status: lim ? lim.status : 'nao_gerada',
        responsavel: lim ? lim.responsavel : '', confirmada_em: ex ? ex.confirmada_em : '',
        liberada: !!(ex && ex.liberada), reserva_saida: sai.id, reserva_chegada: chega ? chega.id : '',
        reserva_nova_24h: novasPorImovel.has(sai.imovel_id),
        manutencao_aberta: chamados.filter(c => c.imovel_id === sai.imovel_id).map(c => ({ id: c.id, titulo: c.titulo, prioridade: c.prioridade })),
      };
      if (risco) riscos.push(t);
      // Cap. 35: unidade sem responsável é ERRO sinalizado, não distribuição automática
      if (!t.responsavel) semResponsavel.push(t);
      tarefas.push(t);
    }
    // preparação de chegada em unidade que não teve saída hoje
    for (const c of chegadas.filter(x => x.checkin === d)) {
      if (tarefas.some(t => t.imovel_id === c.imovel_id)) continue;
      const f = fichas[c.imovel_id] || {};
      const lim = limpezas.find(l => l.imovel_id === c.imovel_id) || null;
      const ex = lim ? execs[lim.id] : null;
      const t = {
        tipo: 'preparacao', imovel_id: c.imovel_id, imovel: nomes[c.imovel_id] || c.imovel_id,
        saida_em: '', chegada_em: f.checkin_hora || '15:00', janela_min: null, preparacao_min: num(f.preparacao_min, 0), risco: false,
        limpeza_id: lim ? lim.id : '', status: lim ? lim.status : 'nao_gerada', responsavel: lim ? lim.responsavel : '',
        confirmada_em: ex ? ex.confirmada_em : '', liberada: !!(ex && ex.liberada),
        reserva_saida: '', reserva_chegada: c.id, reserva_nova_24h: novasPorImovel.has(c.imovel_id),
        manutencao_aberta: chamados.filter(x => x.imovel_id === c.imovel_id).map(x => ({ id: x.id, titulo: x.titulo, prioridade: x.prioridade })),
      };
      if (!t.responsavel) semResponsavel.push(t);
      tarefas.push(t);
    }

    // Cap. 35 · a distinção que o capítulo insiste: NÃO CONFIRMADO ≠ NÃO FEITO
    const criticas = tarefas.filter(t => t.chegada_em && !t.confirmada_em);
    return {
      data: d,
      convencao: 'Escala derivada do calendário. NÃO CONFIRMADO não é o mesmo que NÃO FEITO — o painel avisa você; a conversa é humana (Cap. 35).',
      tarefas, riscos, sem_responsavel: semResponsavel,
      criticas_sem_confirmacao: criticas,
      totais: { faxinas: tarefas.filter(t => t.tipo === 'faxina').length, viradas: tarefas.filter(t => t.tipo === 'virada').length, preparacoes: tarefas.filter(t => t.tipo === 'preparacao').length },
    };
  },
};

// =====================================================================
// EXECUÇÃO DA LIMPEZA: evidência, confirmação e LIBERAÇÃO (Cap. 35)
// Enquanto não liberada, a unidade não deveria receber check-in.
// =====================================================================
const Execucao = {
  obter(tenantId, limpezaId) {
    const e = db.prepare('SELECT * FROM lv_limpeza_exec WHERE tenant_id = ? AND limpeza_id = ?').get(s(tenantId, 40), s(limpezaId, 40));
    return e ? { ...e, evidencias: j.parse(e.evidencias, []), liberada: !!e.liberada } : null;
  },
  confirmar(tenantId, limpezaId, d, quem) {
    const tid = s(tenantId, 40), lid = s(limpezaId, 40);
    const lim = db.prepare('SELECT * FROM app_limpezas WHERE tenant_id = ? AND id = ?').get(tid, lid);
    if (!lim) throw new Error('Limpeza não encontrada.');
    const evid = (Array.isArray(d.evidencias) ? d.evidencias : []).slice(0, 12).map(x => s(x, 500)).filter(Boolean);
    const antes = Execucao.obter(tid, lid);
    db.prepare(`INSERT INTO lv_limpeza_exec (limpeza_id, tenant_id, executor, evidencias, pendencias, confirmada_em, liberada, liberada_em, liberada_por)
      VALUES (?,?,?,?,?,?,0,'','')
      ON CONFLICT(limpeza_id) DO UPDATE SET executor=excluded.executor, evidencias=excluded.evidencias,
        pendencias=excluded.pendencias, confirmada_em=excluded.confirmada_em`)
      .run(lid, tid, s(d.executor, 120) || s(quem, 120), j.str(evid), s(d.pendencias, 1000), nowISO());
    auditar(tid, quem, 'limpeza.confirmar', 'lv_limpeza_exec', lid, antes, Execucao.obter(tid, lid));
    return Execucao.obter(tid, lid);
  },
  // liberar é ato formal e exige o que o E4 exige: confirmação e evidência.
  liberar(tenantId, limpezaId, quem) {
    const tid = s(tenantId, 40), lid = s(limpezaId, 40);
    const e = Execucao.obter(tid, lid);
    if (!e || !e.confirmada_em) throw new Error('Confirme a conclusão (com quem executou) antes de liberar a unidade.');
    if (!e.evidencias.length) throw new Error('A liberação exige evidência do estado da casa pronta (Cap. 35 / E4).');
    db.prepare('UPDATE lv_limpeza_exec SET liberada = 1, liberada_em = ?, liberada_por = ? WHERE limpeza_id = ?').run(nowISO(), s(quem, 120), lid);
    auditar(tid, quem, 'limpeza.liberar', 'lv_limpeza_exec', lid, e, Execucao.obter(tid, lid));
    return Execucao.obter(tid, lid);
  },
};

// =====================================================================
// INSPEÇÃO POR AMOSTRAGEM (Cap. 35/38)
// Aleatória, feita por OUTRA pessoa, e sobre o PROCEDIMENTO — nunca sobre
// a pessoa. Item que falha em unidades diferentes = SISTÊMICO: o POP é que
// precisa de revisão.
// =====================================================================
const CLASSES_DESVIO = ['procedimento', 'material', 'treinamento', 'pontual'];
const Inspecoes = {
  sortear(tenantId) {
    const imoveis = appRepo.Imoveis.listar(s(tenantId, 40), { incluirInativos: false });
    if (!imoveis.length) throw new Error('Nenhum imóvel ativo para sortear.');
    // menos inspecionado primeiro; empate desempata pela data mais antiga
    const cont = {};
    for (const r of db.prepare('SELECT imovel_id, MAX(data) ultima, COUNT(*) n FROM lv_inspecoes WHERE tenant_id = ? GROUP BY imovel_id').all(s(tenantId, 40))) cont[r.imovel_id] = r;
    const ordenado = imoveis.slice().sort((a, b) => {
      const ca = cont[a.id] || { n: 0, ultima: '' }, cb = cont[b.id] || { n: 0, ultima: '' };
      return (ca.n - cb.n) || String(ca.ultima).localeCompare(String(cb.ultima));
    });
    const candidatos = ordenado.filter(i => (cont[i.id] || { n: 0 }).n === (cont[ordenado[0].id] || { n: 0 }).n);
    const escolhido = candidatos[Math.floor(Math.random() * candidatos.length)];
    return { imovel_id: escolhido.id, imovel: escolhido.nome, checklist: 'e5' };
  },
  listar(tenantId, limite = 100) {
    const nomes = nomesImoveis(s(tenantId, 40));
    return db.prepare('SELECT * FROM lv_inspecoes WHERE tenant_id = ? ORDER BY data DESC LIMIT ?').all(s(tenantId, 40), Math.min(500, num(limite, 100)))
      .map(r => ({ ...r, desvios: j.parse(r.desvios, []), imovel: nomes[r.imovel_id] || r.imovel_id }));
  },
  registrar(tenantId, d, quem) {
    const tid = s(tenantId, 40), iid = s(d.imovel_id, 40);
    if (!appRepo.Imoveis.obter(tid, iid)) throw new Error('Imóvel não encontrado.');
    const inspetor = s(d.inspetor, 120), executor = s(d.executor, 120);
    // Cap. 38: autoinspeção não enxerga o próprio hábito
    if (inspetor && executor && inspetor.toLowerCase() === executor.toLowerCase()) {
      throw new Error('A inspeção precisa ser feita por pessoa diferente de quem executou (Cap. 38).');
    }
    const desvios = (Array.isArray(d.desvios) ? d.desvios : []).slice(0, 60).map(x => ({
      item: s(x.item, 200),
      classificacao: CLASSES_DESVIO.includes(s(x.classificacao)) ? s(x.classificacao) : 'pontual',
    })).filter(x => x.item);
    const id = novoId();
    db.prepare('INSERT INTO lv_inspecoes (id, tenant_id, imovel_id, data, inspetor, executor, desvios, obs, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, tid, iid, dia(d.data) || hoje(), inspetor, executor, j.str(desvios), s(d.obs, 2000), nowISO());
    auditar(tid, quem, 'inspecao.registrar', 'lv_inspecoes', id, null, { iid, desvios: desvios.length });
    return db.prepare('SELECT * FROM lv_inspecoes WHERE id = ?').get(id);
  },
  // o relatório do Cap. 38: por ITEM e por UNIDADE, nunca por pessoa
  qualidade(tenantId, { meses = 6 } = {}) {
    const tid = s(tenantId, 40);
    const corte = somaDias(hoje(), -Math.max(1, num(meses, 6)) * 30);
    const rs = db.prepare('SELECT * FROM lv_inspecoes WHERE tenant_id = ? AND data >= ?').all(tid, corte);
    const porItem = {};
    for (const r of rs) {
      for (const dv of j.parse(r.desvios, [])) {
        const k = dv.item.toLowerCase();
        porItem[k] = porItem[k] || { item: dv.item, ocorrencias: 0, unidades: new Set(), classificacoes: {} };
        porItem[k].ocorrencias++;
        porItem[k].unidades.add(r.imovel_id);
        porItem[k].classificacoes[dv.classificacao] = (porItem[k].classificacoes[dv.classificacao] || 0) + 1;
      }
    }
    const itens = Object.values(porItem).map(x => ({
      item: x.item, ocorrencias: x.ocorrencias, unidades: x.unidades.size,
      classificacoes: x.classificacoes,
      // mesmo item falhando em unidades diferentes = problema do POP, não da execução
      sistemico: x.unidades.size > 1,
    })).sort((a, b) => b.ocorrencias - a.ocorrencias);
    return {
      periodo_meses: num(meses, 6), inspecoes: rs.length, itens,
      sistemicos: itens.filter(i => i.sistemico),
      pops_a_revisar: itens.filter(i => i.sistemico || (i.classificacoes.procedimento || 0) > 0).map(i => i.item),
      nota: 'Análise por item e por unidade. O sistema não ranqueia pessoas — o dado serve para melhorar o procedimento (Cap. 38).',
    };
  },
};

// =====================================================================
// PLANO PREVENTIVO (Cap. 37)
// Propõe janelas SEM HÓSPEDE. Não bloqueia calendário, não aciona técnico
// e não autoriza despesa — as três coisas são decisão humana.
// =====================================================================
const Preventiva = {
  listar(tenantId) {
    const tid = s(tenantId, 40);
    const nomes = nomesImoveis(tid);
    const forn = {};
    for (const f of db.prepare('SELECT id, nome FROM lv_fornecedores WHERE tenant_id = ?').all(tid)) forn[f.id] = f.nome;
    return db.prepare('SELECT * FROM lv_preventiva WHERE tenant_id = ? ORDER BY imovel_id, equipamento').all(tid).map(p => ({
      ...p, imovel: nomes[p.imovel_id] || p.imovel_id, fornecedor: forn[p.fornecedor_id] || '',
      vence_em: p.ultima_execucao ? somaDias(p.ultima_execucao, p.periodicidade_dias) : '',
      sem_registro: !p.ultima_execucao,
    }));
  },
  salvar(tenantId, d, quem) {
    const tid = s(tenantId, 40), iid = s(d.imovel_id, 40);
    if (!appRepo.Imoveis.obter(tid, iid)) throw new Error('Imóvel não encontrado.');
    const equip = s(d.equipamento, 160);
    if (!equip) throw new Error('Informe o equipamento.');
    const id = s(d.id, 40) || novoId();
    const antes = db.prepare('SELECT * FROM lv_preventiva WHERE tenant_id = ? AND id = ?').get(tid, id) || null;
    if (antes) {
      db.prepare('UPDATE lv_preventiva SET imovel_id=?, equipamento=?, periodicidade_dias=?, ultima_execucao=?, duracao_horas=?, fornecedor_id=?, obs=? WHERE id=? AND tenant_id=?')
        .run(iid, equip, Math.max(1, num(d.periodicidade_dias, antes.periodicidade_dias)), dia(d.ultima_execucao), Math.max(1, num(d.duracao_horas, antes.duracao_horas)), s(d.fornecedor_id, 40), s(d.obs, 1000), id, tid);
    } else {
      db.prepare('INSERT INTO lv_preventiva (id, tenant_id, imovel_id, equipamento, periodicidade_dias, ultima_execucao, duracao_horas, fornecedor_id, obs, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id, tid, iid, equip, Math.max(1, num(d.periodicidade_dias, 180)), dia(d.ultima_execucao), Math.max(1, num(d.duracao_horas, 4)), s(d.fornecedor_id, 40), s(d.obs, 1000), nowISO());
    }
    auditar(tid, quem, 'preventiva.salvar', 'lv_preventiva', id, antes, null);
    return db.prepare('SELECT * FROM lv_preventiva WHERE id = ?').get(id);
  },
  remover(tenantId, id, quem) {
    const antes = db.prepare('SELECT * FROM lv_preventiva WHERE tenant_id = ? AND id = ?').get(s(tenantId, 40), s(id, 40));
    db.prepare('DELETE FROM lv_preventiva WHERE tenant_id = ? AND id = ?').run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'preventiva.remover', 'lv_preventiva', s(id, 40), antes, null);
    return { ok: true };
  },
  executada(tenantId, id, data, quem) {
    const tid = s(tenantId, 40);
    const antes = db.prepare('SELECT * FROM lv_preventiva WHERE tenant_id = ? AND id = ?').get(tid, s(id, 40));
    if (!antes) throw new Error('Item do plano não encontrado.');
    db.prepare('UPDATE lv_preventiva SET ultima_execucao = ? WHERE id = ? AND tenant_id = ?').run(dia(data) || hoje(), s(id, 40), tid);
    auditar(tid, quem, 'preventiva.executada', 'lv_preventiva', s(id, 40), antes, { ultima_execucao: dia(data) || hoje() });
    return db.prepare('SELECT * FROM lv_preventiva WHERE id = ?').get(s(id, 40));
  },
  // o plano do mês: vencidas + as que vencem em 30 dias, com janelas propostas
  plano(tenantId, { horizonteDias = 30, janelaBuscaDias = 60 } = {}) {
    const tid = s(tenantId, 40);
    const hj = hoje();
    const limite = somaDias(hj, num(horizonteDias, 30));
    const fim = somaDias(hj, num(janelaBuscaDias, 60));
    const itens = Preventiva.listar(tid);
    const reservas = db.prepare(`SELECT imovel_id, checkin, checkout FROM app_reservas WHERE tenant_id = ?
      AND status IN ('pendente','confirmada') AND checkout > ? AND checkin < ?`).all(tid, hj, fim);
    const bloqueios = db.prepare('SELECT imovel_id, de, ate FROM lv_bloqueios WHERE tenant_id = ?').all(tid);

    const livre = (imovelId, d, nDias) => {
      const ate = somaDias(d, nDias);
      // interligados também precisam estar livres: o técnico ocupa o espaço físico
      const alvos = [imovelId, ...OP.Interligacoes.vizinhos(tid, imovelId)];
      for (const alvo of alvos) {
        for (const r of reservas) if (r.imovel_id === alvo && sobrepoe(d, ate, r.checkin, r.checkout)) return false;
        for (const b of bloqueios) if (b.imovel_id === alvo && sobrepoe(d, ate, b.de, b.ate)) return false;
      }
      return true;
    };

    const vencidas = [], doMes = [], semJanela = [], semRegistro = [];
    for (const it of itens) {
      if (it.sem_registro) { semRegistro.push(it); continue; }
      if (!it.vence_em || it.vence_em > limite) continue;
      const nDias = Math.max(1, Math.ceil(num(it.duracao_horas, 4) / 24));
      const janelas = [];
      for (let k = 0; k < num(janelaBuscaDias, 60) && janelas.length < 3; k++) {
        const d = somaDias(hj, k);
        if (livre(it.imovel_id, d, nDias)) janelas.push({ de: d, ate: somaDias(d, nDias) });
      }
      const linha = { ...it, vencida: it.vence_em < hj, janelas };
      if (!janelas.length) semJanela.push(linha);
      else if (linha.vencida) vencidas.push(linha);
      else doMes.push(linha);
    }

    // reincidência por equipamento (Cap. 37): 3+ chamados em 12 meses
    const corte = somaDias(hj, -365);
    const chamados = db.prepare('SELECT imovel_id, titulo FROM app_manutencao WHERE tenant_id = ? AND criado_em >= ?').all(tid, corte + 'T00:00:00.000Z');
    const nomes = nomesImoveis(tid);
    const porEquip = {};
    for (const c of chamados) {
      const k = `${c.imovel_id}|${s(c.titulo, 80).toLowerCase()}`;
      porEquip[k] = porEquip[k] || { imovel: nomes[c.imovel_id] || c.imovel_id, equipamento: c.titulo, ocorrencias: 0 };
      porEquip[k].ocorrencias++;
    }
    const reincidentes = Object.values(porEquip).filter(x => x.ocorrencias >= 3).sort((a, b) => b.ocorrencias - a.ocorrencias);

    // crítico: chamado que impede o uso de unidade com check-in em 7 dias
    const criticos = [];
    const abertos = db.prepare("SELECT * FROM app_manutencao WHERE tenant_id = ? AND status <> 'resolvido'").all(tid);
    for (const c of abertos) {
      const prox = db.prepare(`SELECT checkin FROM app_reservas WHERE tenant_id = ? AND imovel_id = ?
        AND status IN ('pendente','confirmada') AND checkin >= ? AND checkin <= ? ORDER BY checkin LIMIT 1`).get(tid, c.imovel_id, hj, somaDias(hj, 7));
      if (prox && c.prioridade === 'alta') criticos.push({ chamado: c.titulo, imovel: nomes[c.imovel_id] || c.imovel_id, checkin: prox.checkin });
    }

    return {
      gerado_em: hj, criticos, vencidas, do_mes: doMes, sem_janela: semJanela, sem_registro: semRegistro, reincidentes,
      nota: 'O sistema propõe janelas sem hóspede. NÃO bloqueia calendário, NÃO aciona técnico e NÃO autoriza despesa — as três são decisão sua (Cap. 37).',
    };
  },
};

// =====================================================================
// FORNECEDORES (Cap. 36/37) — dois para cada especialidade crítica.
// =====================================================================
const ESPECIALIDADES_CRITICAS = ['piscina', 'ar_condicionado', 'eletrica', 'hidraulica', 'chaveiro'];
const Fornecedores = {
  listar(tenantId) { return db.prepare('SELECT * FROM lv_fornecedores WHERE tenant_id = ? ORDER BY especialidade, nome').all(s(tenantId, 40)); },
  salvar(tenantId, d, quem) {
    const id = s(d.id, 40) || novoId();
    if (!s(d.nome)) throw new Error('Informe o nome do fornecedor.');
    const esp = s(d.especialidade, 60).toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'outro';
    const antes = db.prepare('SELECT * FROM lv_fornecedores WHERE tenant_id = ? AND id = ?').get(s(tenantId, 40), id) || null;
    if (antes) {
      db.prepare('UPDATE lv_fornecedores SET especialidade=?, nome=?, contato=?, prazo_resposta=?, obs=? WHERE id=? AND tenant_id=?')
        .run(esp, s(d.nome, 200), s(d.contato, 200), s(d.prazo_resposta, 120), s(d.obs, 1000), id, s(tenantId, 40));
    } else {
      db.prepare('INSERT INTO lv_fornecedores (id, tenant_id, especialidade, nome, contato, prazo_resposta, obs, criado_em) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, s(tenantId, 40), esp, s(d.nome, 200), s(d.contato, 200), s(d.prazo_resposta, 120), s(d.obs, 1000), nowISO());
    }
    auditar(tenantId, quem, 'fornecedor.salvar', 'lv_fornecedores', id, antes, null);
    return db.prepare('SELECT * FROM lv_fornecedores WHERE id = ?').get(id);
  },
  remover(tenantId, id, quem) {
    db.prepare('DELETE FROM lv_fornecedores WHERE tenant_id = ? AND id = ?').run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'fornecedor.remover', 'lv_fornecedores', s(id, 40), null, null);
    return { ok: true };
  },
  // fornecedor único em especialidade crítica é problema sem saída numa
  // sexta-feira de feriado (Cap. 36/37)
  cobertura(tenantId) {
    const rs = Fornecedores.listar(tenantId);
    const porEsp = {};
    for (const f of rs) porEsp[f.especialidade] = (porEsp[f.especialidade] || 0) + 1;
    return ESPECIALIDADES_CRITICAS.map(e => ({ especialidade: e, quantidade: porEsp[e] || 0, alerta: (porEsp[e] || 0) < 2 }));
  },
};

// =====================================================================
// SUPRIMENTOS (Cap. 36)
// Previsão pelo CALENDÁRIO (não por média de mercado), consumo atípico
// sinalizado e nunca "corrigido", enxoval por lote com vida útil.
// =====================================================================
const Suprimentos = {
  // projeta o consumo dos próximos N dias a partir das reservas confirmadas
  previsao(tenantId, { dias: nd = 30, margemPct = 15 } = {}) {
    const tid = s(tenantId, 40);
    const hj = hoje(), fim = somaDias(hj, Math.max(1, num(nd, 30)));
    const reservas = db.prepare(`SELECT imovel_id, checkin, checkout, hospedes_qtd FROM app_reservas
      WHERE tenant_id = ? AND status IN ('pendente','confirmada') AND checkin >= ? AND checkin < ?`).all(tid, hj, fim);
    const margem = Math.max(0, num(margemPct, 15));
    const itens = db.prepare('SELECT * FROM app_estoque WHERE tenant_id = ?').all(tid);
    const forn = Fornecedores.listar(tid);

    const criticos = [], lista = [];
    const proximas7 = reservas.filter(r => r.checkin <= somaDias(hj, 7)).length;
    for (const it of itens) {
      const porReserva = num(it.por_reserva, 0);
      const previsto = Math.ceil(porReserva * reservas.length * (1 + margem / 100));
      const saldoProjetado = num(it.quantidade, 0) - previsto;
      const comprar = Math.max(0, num(it.minimo, 0) + previsto - num(it.quantidade, 0));
      const linha = {
        id: it.id, nome: it.nome, categoria: it.categoria, unidade: it.unidade,
        estoque: num(it.quantidade, 0), minimo: num(it.minimo, 0), por_reserva: porReserva,
        reservas_previstas: reservas.length, consumo_previsto: previsto, saldo_projetado: saldoProjetado,
        comprar,
      };
      if (num(it.quantidade, 0) < num(it.minimo, 0) && proximas7 > 0) criticos.push(linha);
      if (comprar > 0) lista.push(linha);
    }

    // consumo atípico: variação > 30% contra o histórico. NÃO ajustamos a
    // projeção — variação é informação, não erro a corrigir (Cap. 36).
    const atipicos = [];
    const corte = somaDias(hj, -60) + 'T00:00:00.000Z';
    for (const it of itens) {
      const movs = db.prepare("SELECT delta, criado_em FROM app_estoque_mov WHERE tenant_id = ? AND item_id = ? AND criado_em >= ? AND delta < 0").all(tid, it.id, corte);
      if (movs.length < 4) continue;
      const total = movs.reduce((a, m) => a + Math.abs(num(m.delta, 0)), 0);
      const media = total / movs.length;
      const recentes = movs.filter(m => m.criado_em >= somaDias(hj, -30) + 'T00:00:00.000Z');
      if (!recentes.length) continue;
      const mediaRecente = recentes.reduce((a, m) => a + Math.abs(num(m.delta, 0)), 0) / recentes.length;
      if (media > 0 && Math.abs(mediaRecente - media) / media > 0.3) {
        atipicos.push({ item: it.nome, media_historica: Number(media.toFixed(2)), media_recente: Number(mediaRecente.toFixed(2)), nota: 'CONSUMO ATÍPICO — exige investigação, não correção da média.' });
      }
    }

    return {
      periodo_dias: num(nd, 30), margem_seguranca_pct: margem, reservas_previstas: reservas.length,
      criticos, lista, atipicos,
      enxoval_a_aposentar: Suprimentos.enxovalVencido(tid),
      fornecedores: forn.length,
      nota: 'Previsão a partir das reservas confirmadas do calendário — nunca de média de mercado. O sistema não compra e não aprova despesa (Cap. 36).',
    };
  },
  enxoval(tenantId) {
    const nomes = nomesImoveis(s(tenantId, 40));
    return db.prepare('SELECT * FROM lv_enxoval WHERE tenant_id = ? ORDER BY item, entrada_em').all(s(tenantId, 40)).map(e => ({
      ...e, imovel: e.imovel_id ? (nomes[e.imovel_id] || e.imovel_id) : '(compartilhado)',
      vence_em: e.entrada_em ? somaDias(e.entrada_em, num(e.vida_util_meses, 18) * 30) : '',
    }));
  },
  enxovalVencido(tenantId) {
    return Suprimentos.enxoval(tenantId).filter(e => !e.aposentado_em && e.vence_em && e.vence_em <= hoje());
  },
  salvarEnxoval(tenantId, d, quem) {
    const id = s(d.id, 40) || novoId();
    if (!s(d.item)) throw new Error('Informe o item do enxoval.');
    const antes = db.prepare('SELECT * FROM lv_enxoval WHERE tenant_id = ? AND id = ?').get(s(tenantId, 40), id) || null;
    if (antes) {
      db.prepare('UPDATE lv_enxoval SET imovel_id=?, item=?, lote=?, qtd=?, entrada_em=?, vida_util_meses=?, aposentado_em=?, destino=? WHERE id=? AND tenant_id=?')
        .run(s(d.imovel_id, 40), s(d.item, 160), s(d.lote, 80), num(d.qtd, antes.qtd), dia(d.entrada_em) || antes.entrada_em, Math.max(1, num(d.vida_util_meses, antes.vida_util_meses)), dia(d.aposentado_em), s(d.destino, 200), id, s(tenantId, 40));
    } else {
      db.prepare('INSERT INTO lv_enxoval (id, tenant_id, imovel_id, item, lote, qtd, entrada_em, vida_util_meses, aposentado_em, destino, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, s(tenantId, 40), s(d.imovel_id, 40), s(d.item, 160), s(d.lote, 80), num(d.qtd, 0), dia(d.entrada_em) || hoje(), Math.max(1, num(d.vida_util_meses, 18)), '', s(d.destino, 200), nowISO());
    }
    auditar(tenantId, quem, 'enxoval.salvar', 'lv_enxoval', id, antes, null);
    return db.prepare('SELECT * FROM lv_enxoval WHERE id = ?').get(id);
  },
  aposentarEnxoval(tenantId, id, destino, quem) {
    // Cap. 36: peça sem destino volta para a cama
    if (!s(destino)) throw new Error('Informe o destino da peça aposentada (pano de limpeza, doação...).');
    db.prepare('UPDATE lv_enxoval SET aposentado_em = ?, destino = ? WHERE tenant_id = ? AND id = ?').run(hoje(), s(destino, 200), s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'enxoval.aposentar', 'lv_enxoval', s(id, 40), null, { destino: s(destino, 200) });
    return { ok: true };
  },
};

// =====================================================================
// O PAINEL DO DIA (Cap. 39) — as cinco perguntas, todas as manhãs.
// Declara PARCIAL quando alguma fonte não pôde ser lida e nunca conclui
// "tudo certo" sobre o que não foi verificado.
// =====================================================================
function painelDoDia(tenantId, data) {
  const tid = s(tenantId, 40);
  const d = dia(data) || hoje();
  const amanha = somaDias(d, 1);
  const nomes = nomesImoveis(tid);
  const fontesIndisponiveis = [];

  // 1 · quem chega e quem sai hoje
  const chegadas = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ? AND checkin IN (?,?) AND status IN ('pendente','confirmada') ORDER BY checkin`).all(tid, d, amanha);
  const saidas = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ? AND checkout IN (?,?) AND status IN ('confirmada','concluida') ORDER BY checkout`).all(tid, d, amanha);

  // 2 · as unidades que recebem hoje estão prontas?
  const escala = Escala.doDia(tid, d);
  const prontidao = chegadas.filter(c => c.checkin === d).map(c => {
    const t = escala.tarefas.find(x => x.imovel_id === c.imovel_id);
    const doc = db.prepare('SELECT * FROM lv_reserva_doc WHERE tenant_id = ? AND reserva_id = ?').get(tid, c.id);
    const manut = db.prepare("SELECT COUNT(*) n FROM app_manutencao WHERE tenant_id = ? AND imovel_id = ? AND status <> 'resolvido' AND prioridade = 'alta'").get(tid, c.imovel_id).n;
    return {
      reserva_id: c.id, imovel: nomes[c.imovel_id] || c.imovel_id, hospede: c.hospede_nome, hospedes_qtd: c.hospedes_qtd,
      limpeza_confirmada: !!(t && t.confirmada_em), unidade_liberada: !!(t && t.liberada),
      limpeza_registrada: !!(t && t.limpeza_id),
      manutencao_alta_aberta: manut,
      documentacao_ok: !!(doc && doc.identificacao_ok), saldo_recebido: !!(doc && doc.saldo_recebido),
      instrucoes_enviadas: !!db.prepare("SELECT 1 FROM lv_fila_mensagens WHERE tenant_id=? AND reserva_id=? AND modelo='d5_chegada' AND situacao='enviada'").get(tid, c.id),
      dado_acesso: 'pendente de envio manual', // Cap. 32: nunca exibido, nunca automatizado
    };
  });

  // 3 · o que está pendente e vence hoje
  const pendencias = [];
  for (const p of prontidao) {
    if (!p.limpeza_registrada) pendencias.push({ nivel: 'critico', texto: `Chegada em ${p.imovel} sem limpeza registrada.` });
    else if (!p.limpeza_confirmada) pendencias.push({ nivel: 'critico', texto: `Chegada em ${p.imovel} com limpeza NÃO CONFIRMADA (não é o mesmo que não feita).` });
    if (p.manutencao_alta_aberta) pendencias.push({ nivel: 'alto', texto: `${p.imovel} tem ${p.manutencao_alta_aberta} chamado(s) de prioridade alta em aberto com check-in hoje.` });
    if (!p.saldo_recebido) pendencias.push({ nivel: 'alto', texto: `Saldo não registrado como recebido na reserva de ${p.hospede || 'hóspede'} (${p.imovel}).` });
    if (!p.instrucoes_enviadas) pendencias.push({ nivel: 'alto', texto: `Instruções de chegada não registradas como enviadas para ${p.hospede || 'o hóspede'} (${p.imovel}).` });
  }
  for (const r of escala.riscos) pendencias.push({ nivel: 'alto', texto: `VIRADA com janela de ${r.janela_min} min em ${r.imovel}, menor que o tempo real de preparação (${r.preparacao_min} min).` });
  for (const r of escala.sem_responsavel) pendencias.push({ nivel: 'alto', texto: `${r.imovel} está na escala de hoje SEM RESPONSÁVEL.` });
  const saldos = db.prepare("SELECT * FROM lv_reserva_doc WHERE tenant_id = ? AND saldo_recebido = 0 AND saldo_vence_em <> '' AND saldo_vence_em <= ?").all(tid, d);
  for (const sv of saldos) pendencias.push({ nivel: 'alto', texto: `Saldo vencido em ${sv.saldo_vence_em} na reserva ${sv.reserva_id}.` });

  // 4 · unidades bloqueadas, e por quê
  const bloqueadas = OP.Bloqueios.listar(tid, { desde: d }).filter(b => b.de <= amanha);
  for (const b of OP.Bloqueios.vencidos(tid)) pendencias.push({ nivel: 'medio', texto: `Data segurada vencida em ${b.imovel_nome} (${b.de}→${b.ate}, prazo ${b.expira_em}).` });

  // 5 · alguma automação ou integração falhou? (a pergunta que quase ninguém faz)
  const rotinas = OP.Rotinas.listar(tid);
  const semSinal = rotinas.filter(r => r.situacao === 'sem_sinal');
  const emFalha = rotinas.filter(r => r.situacao === 'falha');
  const naoIniciadas = rotinas.filter(r => r.situacao === 'nao_iniciada');
  for (const r of semSinal) pendencias.push({ nivel: 'critico', texto: `A rotina "${r.nome}" parou de reportar execução. Rotina morta não reclama (Cap. 39).` });
  for (const r of emFalha) pendencias.push({ nivel: 'alto', texto: `A rotina "${r.nome}" reportou falha: ${r.ultimo_erro || 'sem detalhe'}.` });
  if (naoIniciadas.length) pendencias.push({ nivel: 'medio', texto: `${naoIniciadas.length} rotina(s) ainda não executaram nenhuma vez: ${naoIniciadas.map(r => r.nome).join(', ')}.` });

  const ultimaAud = require('./operacao').Auditorias.ultima(tid);
  if (!ultimaAud) fontesIndisponiveis.push({ fonte: 'auditoria_sincronizacao', motivo: 'Nunca executada — a concordância entre calendários não foi verificada.' });
  else {
    if (ultimaAud.parcial) fontesIndisponiveis.push(...ultimaAud.fontes_indisponiveis);
    for (const dv of ultimaAud.divergencias.filter(x => x.risco === 'critico')) pendencias.push({ nivel: 'critico', texto: dv.texto });
  }

  const parcial = fontesIndisponiveis.length > 0;
  return {
    data: d,
    parcial,
    fontes_indisponiveis: fontesIndisponiveis,
    veredito: parcial ? 'PAINEL PARCIAL — ausência de erro não é evidência de acerto (Cap. 39).' : 'painel completo',
    chegadas: chegadas.map(c => ({ id: c.id, quando: c.checkin, imovel: nomes[c.imovel_id] || c.imovel_id, hospede: c.hospede_nome, hospedes_qtd: c.hospedes_qtd, canal: c.canal })),
    saidas: saidas.map(c => ({ id: c.id, quando: c.checkout, imovel: nomes[c.imovel_id] || c.imovel_id, hospede: c.hospede_nome })),
    prontidao,
    criticos: pendencias.filter(p => p.nivel === 'critico'),
    altos: pendencias.filter(p => p.nivel === 'alto'),
    informativos: pendencias.filter(p => p.nivel === 'medio'),
    bloqueios: bloqueadas,
    rotinas,
    escala: { totais: escala.totais, riscos: escala.riscos.length, sem_responsavel: escala.sem_responsavel.length },
    auditoria: ultimaAud ? { quando: ultimaAud.quando, parcial: ultimaAud.parcial, resumo: ultimaAud.resumo } : null,
  };
}

module.exports = { Escala, Execucao, Inspecoes, Preventiva, Fornecedores, Suprimentos, painelDoDia, CLASSES_DESVIO, ESPECIALIDADES_CRITICAS };
