// =====================================================================
// VSM · ONDA LIVRO — números.
//
// Apêndice F · as fórmulas, com as três convenções DECLARADAS em todo
//   relatório: competência por check-in pelo valor total da reserva;
//   bruto × líquido nomeados; noites disponíveis excluem bloqueio.
// Cap. 22 · os seis do painel, comparados com o MESMO período do ano anterior
// Cap. 40 · DRE por unidade, com provisões e rateio de critério estável
// Cap. 12 · prestação de contas compartimentada + portal do proprietário
// =====================================================================
'use strict';
const B = require('./base');
const { db, j, s, num, cent, dia, hoje, novoId, nowISO, token, dias, somaDias, mesRange, ultimoDia, auditar, ConfigFinanceira } = B;
const appRepo = require('../app-repo');
const OP = require('./operacao');

const nomesImoveis = (tid) => {
  const m = {};
  for (const i of appRepo.Imoveis.listar(tid)) m[i.id] = i.nome;
  return m;
};

// as convenções vão no cabeçalho de TODO relatório. É uma linha de texto
// que economiza discussões inteiras — inclusive com o contador.
function convencoes(cfg) {
  return {
    receita: 'COMPETÊNCIA por check-in, pelo VALOR TOTAL da reserva. Nunca tarifa × noites.',
    ocupacao: 'Noites do calendário dentro do período. Noites disponíveis EXCLUEM bloqueio de manutenção e reforma.',
    bruto_liquido: 'Bruta = valor total. Líquida = bruta − comissão do canal. Cada número está nomeado.',
    adr: 'ADR EXCLUI a taxa de limpeza (ela é reembolso de custo, não preço da noite).',
    interligados: 'Anúncios interligados contam como UM espaço: a mesma noite nunca é somada duas vezes.',
    reconhecimento_configurado: cfg ? cfg.reconhecimento : 'competencia',
    aviso: 'Esta é a visão de DESEMPENHO. A visão de CAIXA responde outra pergunta e não bate com esta — e as duas estão certas (Cap. 40).',
  };
}

// custos por estadia e percentuais da unidade (app_precificacao do núcleo)
function paramsDe(tid, imovelId, cfg) {
  const p = db.prepare('SELECT * FROM app_precificacao WHERE tenant_id = ? AND imovel_id = ?').get(tid, imovelId);
  return {
    faxina: p ? num(p.faxina_centavos, 0) : 0,
    lavanderia: p ? num(p.lavanderia_centavos, 0) : 0,
    insumos: p ? num(p.insumos_centavos, 0) : 0,
    custo_noite: p ? num(p.custo_noite_centavos, 0) : 0,
    comissao_pct: p ? num(p.comissao_pct, 0) : num(cfg.comissao_padrao_pct, 0),
  };
}

// noites de uma reserva que caem DENTRO do período [de, ate)
function noitesNoPeriodo(r, de, ate) {
  const ini = r.checkin > de ? r.checkin : de;
  const fim = r.checkout < ate ? r.checkout : ate;
  const n = dias(ini, fim);
  return n > 0 ? n : 0;
}

// =====================================================================
// MÉTRICAS (Apêndice F) — por unidade e por espaço físico.
// =====================================================================
function metricas(tenantId, ano, mes) {
  const tid = s(tenantId, 40);
  const a = num(ano, 0) || new Date().getUTCFullYear(), m = Math.min(12, Math.max(1, num(mes, 0) || (new Date().getUTCMonth() + 1)));
  const cfg = ConfigFinanceira.obter(tid);
  const { de, ate } = mesRange(a, m);
  const diasMes = ultimoDia(a, m);
  const imoveis = appRepo.Imoveis.listar(tid, { incluirInativos: false });
  const nomes = nomesImoveis(tid);
  const esp = OP.Interligacoes.espacos(tid);

  const calcular = (ini, fim, nDias) => {
    const reservas = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ? AND status IN ('confirmada','concluida')`).all(tid);
    const avals = db.prepare('SELECT imovel_id, nota FROM lv_avaliacoes WHERE tenant_id = ? AND data >= ? AND data < ? AND nota > 0').all(tid, ini, fim);

    const porImovel = {};
    for (const im of imoveis) {
      porImovel[im.id] = {
        imovel_id: im.id, nome: im.nome, espaco: esp.representante(im.id),
        receita_bruta_centavos: 0, receita_hospedagem_centavos: 0, taxas_limpeza_centavos: 0, comissao_centavos: 0,
        noites_ocupadas: 0, reservas: 0, noites_bloqueadas: OP.Bloqueios.noitesBloqueadas(tid, im.id, ini, fim),
        notas: [],
      };
    }
    for (const r of reservas) {
      const alvo = porImovel[r.imovel_id];
      if (!alvo) continue;
      const p = paramsDe(tid, r.imovel_id, cfg);
      // RECEITA: competência por check-in, valor total
      if (r.checkin >= ini && r.checkin < fim) {
        alvo.receita_bruta_centavos += num(r.valor_centavos, 0);
        alvo.taxas_limpeza_centavos += p.faxina;
        alvo.receita_hospedagem_centavos += Math.max(0, num(r.valor_centavos, 0) - p.faxina);
        alvo.comissao_centavos += Math.round(num(r.valor_centavos, 0) * p.comissao_pct / 100);
        alvo.reservas++;
      }
      // OCUPAÇÃO: noites do calendário dentro do período
      alvo.noites_ocupadas += noitesNoPeriodo(r, ini, fim);
    }
    for (const av of avals) if (porImovel[av.imovel_id]) porImovel[av.imovel_id].notas.push(av.nota);

    // agrega por ESPAÇO FÍSICO: a mesma noite nunca conta duas vezes (F1)
    const porEspaco = {};
    for (const x of Object.values(porImovel)) {
      const k = x.espaco;
      porEspaco[k] = porEspaco[k] || { espaco: k, unidades: [], receita_bruta_centavos: 0, receita_hospedagem_centavos: 0, comissao_centavos: 0, noites_ocupadas: 0, noites_bloqueadas: 0, reservas: 0, notas: [] };
      const e = porEspaco[k];
      e.unidades.push(x.nome);
      e.receita_bruta_centavos += x.receita_bruta_centavos;
      e.receita_hospedagem_centavos += x.receita_hospedagem_centavos;
      e.comissao_centavos += x.comissao_centavos;
      e.noites_ocupadas += x.noites_ocupadas;
      e.noites_bloqueadas = Math.max(e.noites_bloqueadas, x.noites_bloqueadas);
      e.reservas += x.reservas;
      e.notas.push(...x.notas);
    }

    const linhas = Object.values(porEspaco).map(e => {
      const disponiveis = Math.max(0, nDias - e.noites_bloqueadas);
      // teto: um espaço não pode vender mais noites do que tem
      const ocupadas = Math.min(e.noites_ocupadas, disponiveis || nDias);
      const liquida = e.receita_bruta_centavos - e.comissao_centavos;
      const adr = ocupadas ? Math.round(e.receita_hospedagem_centavos / ocupadas) : 0;
      return {
        espaco: e.espaco, unidades: e.unidades, interligado: e.unidades.length > 1,
        noites_disponiveis: disponiveis, noites_ocupadas: ocupadas, noites_bloqueadas: e.noites_bloqueadas,
        ocupacao: disponiveis ? Number((ocupadas / disponiveis * 100).toFixed(1)) : 0,
        adr_centavos: adr,
        revpar_centavos: disponiveis ? Math.round(e.receita_hospedagem_centavos / disponiveis) : 0,
        receita_bruta_centavos: e.receita_bruta_centavos, comissao_centavos: e.comissao_centavos,
        receita_liquida_centavos: liquida, reservas: e.reservas,
        estadia_media: e.reservas ? Number((ocupadas / e.reservas).toFixed(1)) : 0,
        nota_media: e.notas.length ? Number((e.notas.reduce((x, y) => x + y, 0) / e.notas.length).toFixed(2)) : null,
      };
    }).sort((x, y) => y.receita_liquida_centavos - x.receita_liquida_centavos);

    const tot = linhas.reduce((acc, l) => ({
      noites_disponiveis: acc.noites_disponiveis + l.noites_disponiveis,
      noites_ocupadas: acc.noites_ocupadas + l.noites_ocupadas,
      receita_bruta_centavos: acc.receita_bruta_centavos + l.receita_bruta_centavos,
      receita_liquida_centavos: acc.receita_liquida_centavos + l.receita_liquida_centavos,
      comissao_centavos: acc.comissao_centavos + l.comissao_centavos,
      receita_hospedagem_centavos: acc.receita_hospedagem_centavos + (l.adr_centavos * l.noites_ocupadas),
      reservas: acc.reservas + l.reservas,
    }), { noites_disponiveis: 0, noites_ocupadas: 0, receita_bruta_centavos: 0, receita_liquida_centavos: 0, comissao_centavos: 0, receita_hospedagem_centavos: 0, reservas: 0 });

    const notasTodas = linhas.filter(l => l.nota_media != null).map(l => l.nota_media);
    return {
      linhas,
      total: {
        ...tot,
        ocupacao: tot.noites_disponiveis ? Number((tot.noites_ocupadas / tot.noites_disponiveis * 100).toFixed(1)) : 0,
        adr_centavos: tot.noites_ocupadas ? Math.round(tot.receita_hospedagem_centavos / tot.noites_ocupadas) : 0,
        revpar_centavos: tot.noites_disponiveis ? Math.round(tot.receita_hospedagem_centavos / tot.noites_disponiveis) : 0,
        nota_media: notasTodas.length ? Number((notasTodas.reduce((x, y) => x + y, 0) / notasTodas.length).toFixed(2)) : null,
      },
    };
  };

  const atual = calcular(de, ate, diasMes);
  // comparação com o MESMO período do ano anterior — nunca com o mês anterior
  const anoAnt = mesRange(a - 1, m);
  const anterior = calcular(anoAnt.de, anoAnt.ate, ultimoDia(a - 1, m));

  const variacao = (x, y) => (y ? Number(((x - y) / Math.abs(y) * 100).toFixed(1)) : (x ? 100 : 0));
  return {
    periodo: { ano: a, mes: m, de, ate, dias: diasMes },
    convencoes: convencoes(cfg),
    seis_do_painel: B.S.SEIS_DO_PAINEL,
    dicionario: B.S.DICIONARIO_METRICAS,
    por_espaco: atual.linhas,
    total: atual.total,
    ano_anterior: { periodo: anoAnt, total: anterior.total },
    variacao_anual: {
      ocupacao: Number((atual.total.ocupacao - anterior.total.ocupacao).toFixed(1)),
      adr: variacao(atual.total.adr_centavos, anterior.total.adr_centavos),
      revpar: variacao(atual.total.revpar_centavos, anterior.total.revpar_centavos),
      receita_liquida: variacao(atual.total.receita_liquida_centavos, anterior.total.receita_liquida_centavos),
      reservas: variacao(atual.total.reservas, anterior.total.reservas),
    },
    comparacao: 'Contra o MESMO mês do ano anterior. Comparar com o mês anterior num negócio sazonal produz conclusão falsa todo ano (Cap. 22).',
  };
}

// alertas do Cap. 22: raros de propósito. Alerta que dispara todo dia vira ruído.
function alertas(tenantId) {
  const tid = s(tenantId, 40);
  const agora = new Date();
  const m = metricas(tid, agora.getUTCFullYear(), agora.getUTCMonth() + 1);
  const out = [];
  // noite vendida abaixo da tarifa mínima — nunca deveria acontecer
  for (const im of appRepo.Imoveis.listar(tid, { incluirInativos: false })) {
    const f = OP.Ficha.obter(tid, im.id);
    if (!f.tarifa_minima_centavos) continue;
    const rs = db.prepare(`SELECT id, checkin, checkout, valor_centavos, noites FROM app_reservas
      WHERE tenant_id = ? AND imovel_id = ? AND status IN ('confirmada','concluida') AND checkin >= ?`).all(tid, im.id, somaDias(hoje(), -90));
    for (const r of rs) {
      const porNoite = Math.round(num(r.valor_centavos, 0) / Math.max(1, num(r.noites, 1)));
      if (porNoite && porNoite < f.tarifa_minima_centavos) {
        out.push({ nivel: 'alto', texto: `Reserva ${r.id} em ${im.nome} a R$ ${(porNoite / 100).toFixed(2)}/noite, abaixo da tarifa mínima de R$ ${(f.tarifa_minima_centavos / 100).toFixed(2)}.` });
      }
    }
  }
  // ritmo abaixo do ano anterior com prazo se aproximando
  if (m.variacao_anual.ocupacao < -10) out.push({ nivel: 'alto', texto: `Ocupação ${Math.abs(m.variacao_anual.ocupacao)} pontos abaixo do mesmo mês do ano anterior.` });
  // avaliação abaixo do patamar, no momento em que é publicada
  const ruins = db.prepare('SELECT * FROM lv_avaliacoes WHERE tenant_id = ? AND nota > 0 AND nota <= 3 AND data >= ?').all(tid, somaDias(hoje(), -30));
  for (const a of ruins) out.push({ nivel: 'alto', texto: `Avaliação ${a.nota} em ${a.data} (${a.canal}) — responder e classificar o assunto (Cap. 29).` });
  return { alertas: out, nota: 'Alerta bom é raro. Se disparar todo dia, vira ruído e você desliga (Cap. 22).' };
}

// =====================================================================
// DRE POR UNIDADE (Cap. 40)
// Financeiro de hospedagem não se faz no consolidado. Se faz por imóvel.
// =====================================================================
function dre(tenantId, ano, mes, imovelId) {
  const tid = s(tenantId, 40);
  const a = num(ano, 0) || new Date().getUTCFullYear(), m = Math.min(12, Math.max(1, num(mes, 0) || (new Date().getUTCMonth() + 1)));
  const cfg = ConfigFinanceira.obter(tid);
  const { de, ate } = mesRange(a, m);
  const imoveis = appRepo.Imoveis.listar(tid).filter(i => !imovelId || i.id === s(imovelId, 40));
  const nomes = nomesImoveis(tid);

  // despesas do mês, por unidade; as sem unidade vão para o rateio
  const despesas = db.prepare("SELECT * FROM app_financeiro WHERE tenant_id = ? AND tipo = 'despesa' AND data >= ? AND data < ?").all(tid, de, ate);
  const comuns = despesas.filter(d => !d.imovel_id);
  const totalComum = comuns.reduce((x, d) => x + num(d.valor_centavos, 0), 0);
  const aConferir = despesas.filter(d => !d.categoria).map(d => ({ id: d.id, descricao: d.descricao, valor_centavos: d.valor_centavos, motivo: 'despesa sem categoria — classificada por suposição seria erro' }));

  // base do rateio, pelo critério ESCRITO E ESTÁVEL
  const met = metricas(tid, a, m);
  const receitaPorImovel = {};
  const noitesPorImovel = {};
  for (const im of appRepo.Imoveis.listar(tid)) {
    const rs = db.prepare(`SELECT valor_centavos, checkin, checkout FROM app_reservas WHERE tenant_id = ? AND imovel_id = ?
      AND status IN ('confirmada','concluida')`).all(tid, im.id);
    receitaPorImovel[im.id] = rs.filter(r => r.checkin >= de && r.checkin < ate).reduce((x, r) => x + num(r.valor_centavos, 0), 0);
    noitesPorImovel[im.id] = rs.reduce((x, r) => x + noitesNoPeriodo(r, de, ate), 0);
  }
  const somaReceita = Object.values(receitaPorImovel).reduce((x, y) => x + y, 0);
  const somaNoites = Object.values(noitesPorImovel).reduce((x, y) => x + y, 0);
  const nUnidades = appRepo.Imoveis.listar(tid).length || 1;
  const fatorRateio = (imId) => {
    if (cfg.rateio_criterio === 'unidades') return 1 / nUnidades;
    if (cfg.rateio_criterio === 'noites') return somaNoites ? (noitesPorImovel[imId] || 0) / somaNoites : 0;
    return somaReceita ? (receitaPorImovel[imId] || 0) / somaReceita : 0;
  };

  const linhas = imoveis.map(im => {
    const p = paramsDe(tid, im.id, cfg);
    const f = OP.Ficha.obter(tid, im.id);
    const rs = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ? AND imovel_id = ? AND status IN ('confirmada','concluida')
      AND checkin >= ? AND checkin < ?`).all(tid, im.id, de, ate);
    const noites = noitesPorImovel[im.id] || 0;

    const receitaHospedagem = rs.reduce((x, r) => x + Math.max(0, num(r.valor_centavos, 0) - p.faxina), 0);
    const taxasLimpeza = p.faxina * rs.length;   // reembolso de custo, não receita
    const receitaBruta = receitaHospedagem + taxasLimpeza;
    const comissoes = rs.reduce((x, r) => x + Math.round(num(r.valor_centavos, 0) * p.comissao_pct / 100), 0);
    const receitaLiquida = receitaBruta - comissoes;

    // custos variáveis: limpeza, lavanderia, insumos (por estadia) + consumo/noite
    const varPorEstadia = (p.faxina + p.lavanderia + p.insumos) * rs.length;
    const varPorNoite = p.custo_noite * noites;
    const despesasDaUnidade = despesas.filter(d => d.imovel_id === im.id).reduce((x, d) => x + num(d.valor_centavos, 0), 0);
    const custosVariaveis = varPorEstadia + varPorNoite;
    const margemContribuicao = receitaLiquida - custosVariaveis;

    const custosFixos = num(f.custo_fixo_mes_centavos, 0) + Math.round(totalComum * fatorRateio(im.id)) + despesasDaUnidade;
    const provManut = Math.round(receitaLiquida * num(cfg.provisao_manutencao_pct, 0) / 100);
    const provRepo = Math.round(receitaLiquida * num(cfg.provisao_reposicao_pct, 0) / 100);
    const provVac = Math.round(receitaLiquida * num(cfg.provisao_vacancia_pct, 0) / 100);
    const provisoes = provManut + provRepo + provVac;
    const resultadoUnidade = margemContribuicao - custosFixos - provisoes;

    const prop = db.prepare(`SELECT p.* FROM lv_proprietarios p JOIN lv_imovel_proprietario ip ON ip.proprietario_id = p.id
      WHERE ip.tenant_id = ? AND ip.imovel_id = ?`).get(tid, im.id) || null;
    const baseRemun = prop ? (prop.base_calculo === 'bruto' ? receitaBruta : receitaLiquida) : 0;
    const remuneracao = prop ? Math.round(baseRemun * num(prop.remuneracao_pct, 0) / 100) : 0;

    return {
      imovel_id: im.id, nome: im.nome, reservas: rs.length, noites_ocupadas: noites,
      receita_hospedagem_centavos: receitaHospedagem,
      taxas_extras_e_servicos_centavos: taxasLimpeza,
      receita_bruta_centavos: receitaBruta,
      comissoes_centavos: comissoes,
      receita_liquida_centavos: receitaLiquida,
      custos_variaveis_centavos: custosVariaveis,
      margem_contribuicao_centavos: margemContribuicao,
      custos_fixos_centavos: custosFixos,
      provisoes_centavos: provisoes,
      provisoes_detalhe: { manutencao: provManut, reposicao: provRepo, vacancia: provVac },
      resultado_unidade_centavos: resultadoUnidade,
      remuneracao_administradora_centavos: remuneracao,
      resultado_proprietario_centavos: resultadoUnidade - remuneracao,
      margem_operacional: receitaLiquida ? Number(((receitaLiquida - custosVariaveis - custosFixos - provisoes) / receitaLiquida * 100).toFixed(1)) : 0,
      lucro_por_reserva_centavos: rs.length ? Math.round(margemContribuicao / rs.length) : 0,
      alerta_margem_contribuicao: margemContribuicao < 0 ? 'Margem de contribuição NEGATIVA: cada reserva piora a situação. O problema é preço ou custo variável (Cap. 40).' : '',
    };
  }).sort((x, y) => y.resultado_unidade_centavos - x.resultado_unidade_centavos);

  return {
    periodo: { ano: a, mes: m, de, ate },
    visao: 'COMPETÊNCIA',
    convencoes: convencoes(cfg),
    rateio: { criterio: cfg.rateio_criterio, total_comum_centavos: totalComum, nota: 'Critério escrito e estável. Mudar o critério a cada mês impossibilita comparação temporal.' },
    provisoes_pct: { manutencao: cfg.provisao_manutencao_pct, reposicao: cfg.provisao_reposicao_pct, vacancia: cfg.provisao_vacancia_pct },
    linhas,
    a_conferir: aConferir,
    caucao: db.prepare('SELECT COALESCE(SUM(caucao_centavos),0) t FROM lv_reserva_doc WHERE tenant_id = ?').get(tid).t,
    nota_caucao: 'Caução NÃO é receita: é valor de terceiro em sua posse temporária e aparece em conta separada (Cap. 40).',
    total_metricas: met.total,
  };
}

// =====================================================================
// PROPRIETÁRIOS (Cap. 12)
// A compartimentação é garantida por ARQUITETURA: toda consulta parte do
// proprietário e só alcança as unidades dele. Nem comparação anonimizada.
// =====================================================================
const Proprietarios = {
  listar(tenantId) {
    const tid = s(tenantId, 40);
    const nomes = nomesImoveis(tid);
    return db.prepare('SELECT * FROM lv_proprietarios WHERE tenant_id = ? ORDER BY nome').all(tid).map(p => {
      const uns = db.prepare('SELECT imovel_id FROM lv_imovel_proprietario WHERE tenant_id = ? AND proprietario_id = ?').all(tid, p.id);
      const { portal_token, ...semToken } = p;
      return {
        ...semToken, imoveis: uns.map(u => ({ id: u.imovel_id, nome: nomes[u.imovel_id] || u.imovel_id })),
        tem_portal: !!portal_token,
        // o silêncio é o indicador antecedente da perda (Cap. 12)
        dias_sem_contato: p.ultimo_contato ? dias(p.ultimo_contato, hoje()) : null,
      };
    });
  },
  salvar(tenantId, d, quem) {
    const tid = s(tenantId, 40);
    if (!s(d.nome)) throw new Error('Informe o nome do proprietário.');
    const base = ['bruto', 'liquido'].includes(s(d.base_calculo)) ? s(d.base_calculo) : 'liquido';
    const id = s(d.id, 40) || novoId();
    const antes = db.prepare('SELECT * FROM lv_proprietarios WHERE tenant_id = ? AND id = ?').get(tid, id) || null;
    if (antes) {
      db.prepare(`UPDATE lv_proprietarios SET nome=?, contato=?, email=?, remuneracao_pct=?, base_calculo=?, fundo_manutencao_pct=?,
        limite_autonomia_centavos=?, limite_emergencia_centavos=?, repasse_dia=?, ultimo_contato=?, atualizado_em=? WHERE id=? AND tenant_id=?`)
        .run(s(d.nome, 200), s(d.contato, 200), s(d.email, 200), B.pct(d.remuneracao_pct, antes.remuneracao_pct), base,
          B.pct(d.fundo_manutencao_pct, antes.fundo_manutencao_pct), cent(d.limite_autonomia_centavos), cent(d.limite_emergencia_centavos),
          Math.min(28, Math.max(1, num(d.repasse_dia, antes.repasse_dia))), dia(d.ultimo_contato) || antes.ultimo_contato, nowISO(), id, tid);
    } else {
      db.prepare(`INSERT INTO lv_proprietarios (id, tenant_id, nome, contato, email, remuneracao_pct, base_calculo,
        fundo_manutencao_pct, limite_autonomia_centavos, limite_emergencia_centavos, repasse_dia, portal_token, ultimo_contato, criado_em, atualizado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, tid, s(d.nome, 200), s(d.contato, 200), s(d.email, 200), B.pct(d.remuneracao_pct, 20), base,
          B.pct(d.fundo_manutencao_pct, 0), cent(d.limite_autonomia_centavos), cent(d.limite_emergencia_centavos),
          Math.min(28, Math.max(1, num(d.repasse_dia, 10))), '', dia(d.ultimo_contato), nowISO(), nowISO());
    }
    auditar(tid, quem, 'proprietario.salvar', 'lv_proprietarios', id, antes, null);
    return Proprietarios.listar(tid).find(p => p.id === id);
  },
  vincular(tenantId, imovelId, proprietarioId, quem) {
    const tid = s(tenantId, 40);
    if (!appRepo.Imoveis.obter(tid, s(imovelId, 40))) throw new Error('Imóvel não encontrado.');
    if (!db.prepare('SELECT 1 FROM lv_proprietarios WHERE tenant_id = ? AND id = ?').get(tid, s(proprietarioId, 40))) throw new Error('Proprietário não encontrado.');
    db.prepare('INSERT INTO lv_imovel_proprietario (imovel_id, tenant_id, proprietario_id, desde) VALUES (?,?,?,?) ON CONFLICT(imovel_id) DO UPDATE SET proprietario_id=excluded.proprietario_id, desde=excluded.desde')
      .run(s(imovelId, 40), tid, s(proprietarioId, 40), hoje());
    auditar(tid, quem, 'proprietario.vincular', 'lv_imovel_proprietario', s(imovelId, 40), null, { proprietario_id: s(proprietarioId, 40) });
    return { ok: true };
  },
  portal(tenantId, id, quem) {
    const tid = s(tenantId, 40);
    const p = db.prepare('SELECT * FROM lv_proprietarios WHERE tenant_id = ? AND id = ?').get(tid, s(id, 40));
    if (!p) throw new Error('Proprietário não encontrado.');
    let tk = p.portal_token;
    if (!tk) {
      tk = token();
      db.prepare('UPDATE lv_proprietarios SET portal_token = ? WHERE id = ?').run(tk, p.id);
      auditar(tid, quem, 'proprietario.portal', 'lv_proprietarios', p.id, null, { portal: true });
    }
    return { token: tk, url: `/gestao/proprietario/${tk}` };
  },
  revogarPortal(tenantId, id, quem) {
    db.prepare("UPDATE lv_proprietarios SET portal_token = '' WHERE tenant_id = ? AND id = ?").run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'proprietario.portal_revogar', 'lv_proprietarios', s(id, 40), null, null);
    return { ok: true };
  },

  // A prestação de contas: quatro blocos, uma página, sempre o mesmo layout.
  // E o número ruim com o MESMO destaque do bom.
  relatorio(tenantId, proprietarioId, ano, mes) {
    const tid = s(tenantId, 40);
    const p = db.prepare('SELECT * FROM lv_proprietarios WHERE tenant_id = ? AND id = ?').get(tid, s(proprietarioId, 40));
    if (!p) throw new Error('Proprietário não encontrado.');
    const meus = db.prepare('SELECT imovel_id FROM lv_imovel_proprietario WHERE tenant_id = ? AND proprietario_id = ?').all(tid, p.id).map(x => x.imovel_id);
    if (!meus.length) throw new Error('Este proprietário ainda não tem imóvel vinculado.');

    const a = num(ano, 0) || new Date().getUTCFullYear(), m = Math.min(12, Math.max(1, num(mes, 0) || (new Date().getUTCMonth() + 1)));
    const { de, ate } = mesRange(a, m);
    const anoAnt = mesRange(a - 1, m);
    const nomes = nomesImoveis(tid);
    const cfg = ConfigFinanceira.obter(tid);

    const blocos = meus.map(imId => {
      // COMPARTIMENTAÇÃO: cada consulta é filtrada pelo imóvel deste proprietário
      const dreUn = dre(tid, a, m, imId).linhas[0];
      const metUn = (() => {
        const rs = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ? AND imovel_id = ? AND status IN ('confirmada','concluida')`).all(tid, imId);
        const noites = rs.reduce((x, r) => x + noitesNoPeriodo(r, de, ate), 0);
        const noitesAnt = rs.reduce((x, r) => x + noitesNoPeriodo(r, anoAnt.de, anoAnt.ate), 0);
        const doMes = rs.filter(r => r.checkin >= de && r.checkin < ate);
        const doAnt = rs.filter(r => r.checkin >= anoAnt.de && r.checkin < anoAnt.ate);
        const disp = Math.max(0, ultimoDia(a, m) - OP.Bloqueios.noitesBloqueadas(tid, imId, de, ate));
        const dispAnt = Math.max(0, ultimoDia(a - 1, m) - OP.Bloqueios.noitesBloqueadas(tid, imId, anoAnt.de, anoAnt.ate));
        const p2 = paramsDe(tid, imId, cfg);
        const hosp = doMes.reduce((x, r) => x + Math.max(0, num(r.valor_centavos, 0) - p2.faxina), 0);
        return {
          ocupacao: disp ? Number((Math.min(noites, disp) / disp * 100).toFixed(1)) : 0,
          ocupacao_ano_anterior: dispAnt ? Number((Math.min(noitesAnt, dispAnt) / dispAnt * 100).toFixed(1)) : 0,
          adr_centavos: noites ? Math.round(hosp / noites) : 0,
          reservas: doMes.length, reservas_ano_anterior: doAnt.length,
          estadia_media: doMes.length ? Number((noites / doMes.length).toFixed(1)) : 0,
        };
      })();
      const manut = db.prepare(`SELECT * FROM app_manutencao WHERE tenant_id = ? AND imovel_id = ?
        AND (criado_em >= ? OR status <> 'resolvido') ORDER BY criado_em DESC LIMIT 40`).all(tid, imId, de + 'T00:00:00.000Z');
      const prev = OP.Ficha ? db.prepare('SELECT equipamento, ultima_execucao, periodicidade_dias FROM lv_preventiva WHERE tenant_id = ? AND imovel_id = ?').all(tid, imId) : [];
      const avals = db.prepare('SELECT nota, texto, data, canal FROM lv_avaliacoes WHERE tenant_id = ? AND imovel_id = ? AND data >= ? AND data < ? ORDER BY data DESC').all(tid, imId, de, ate);
      const notas = avals.filter(x => x.nota > 0).map(x => x.nota);

      // desvio > 20% contra o mesmo mês do ano anterior vira HIPÓTESE A CONFERIR
      const hipoteses = [];
      const dOcup = metUn.ocupacao - metUn.ocupacao_ano_anterior;
      if (Math.abs(dOcup) >= 20) hipoteses.push(`Ocupação variou ${dOcup.toFixed(1)} pontos contra o mesmo mês do ano anterior. HIPÓTESE A CONFERIR: ritmo de venda nos 60 dias anteriores.`);
      if (dreUn && dreUn.margem_contribuicao_centavos < 0) hipoteses.push('Margem de contribuição negativa no mês. HIPÓTESE A CONFERIR: custo variável ou tarifa praticada.');

      return {
        imovel: nomes[imId] || imId,
        // bloco 1 · resultado, nessa ordem, sem surpresa no fim
        resultado: dreUn ? {
          receita_bruta_centavos: dreUn.receita_bruta_centavos,
          comissoes_centavos: dreUn.comissoes_centavos,
          receita_liquida_centavos: dreUn.receita_liquida_centavos,
          custos_variaveis_centavos: dreUn.custos_variaveis_centavos,
          custos_fixos_centavos: dreUn.custos_fixos_centavos,
          provisoes_centavos: dreUn.provisoes_centavos,
          fundo_manutencao_centavos: Math.round(dreUn.receita_liquida_centavos * num(p.fundo_manutencao_pct, 0) / 100),
          remuneracao_administradora_centavos: dreUn.remuneracao_administradora_centavos,
          repasse_centavos: dreUn.resultado_proprietario_centavos - Math.round(dreUn.receita_liquida_centavos * num(p.fundo_manutencao_pct, 0) / 100),
        } : null,
        // bloco 2 · operação
        operacao: metUn,
        // bloco 3 · o imóvel
        imovel_estado: {
          manutencoes: manut.map(x => ({ titulo: x.titulo, status: x.status, prioridade: x.prioridade, em: String(x.criado_em).slice(0, 10) })),
          pendentes: manut.filter(x => x.status !== 'resolvido').length,
          preventivas: prev.map(x => ({ equipamento: x.equipamento, ultima_execucao: x.ultima_execucao, proxima: x.ultima_execucao ? somaDias(x.ultima_execucao, x.periodicidade_dias) : 'SEM REGISTRO' })),
        },
        // bloco 4 · avaliações — inclusive as ruins
        avaliacoes: { nota_media: notas.length ? Number((notas.reduce((x, y) => x + y, 0) / notas.length).toFixed(2)) : null, itens: avals },
        hipoteses,
      };
    });

    const exigemAutorizacao = [];
    if (p.limite_autonomia_centavos) {
      for (const b of blocos) {
        for (const mnt of b.imovel_estado.manutencoes.filter(x => x.status !== 'resolvido' && x.prioridade === 'alta')) {
          exigemAutorizacao.push(`${b.imovel}: "${mnt.titulo}" pode ultrapassar o limite de autonomia de R$ ${(p.limite_autonomia_centavos / 100).toFixed(2)}.`);
        }
      }
    }

    return {
      proprietario: { id: p.id, nome: p.nome, remuneracao_pct: p.remuneracao_pct, base_calculo: p.base_calculo, fundo_manutencao_pct: p.fundo_manutencao_pct, repasse_dia: p.repasse_dia },
      periodo: { ano: a, mes: m },
      convencoes: convencoes(cfg),
      compartimentacao: 'Este relatório contém EXCLUSIVAMENTE dados das unidades deste proprietário. Nenhuma comparação com outras unidades, nem anonimizada (Cap. 12).',
      blocos,
      exigem_autorizacao: exigemAutorizacao,
      pauta_sugerida: blocos.flatMap(b => b.hipoteses).concat(exigemAutorizacao),
      aviso_envio: 'Leia antes de enviar. Um erro no número do repasse custa a relação inteira (Cap. 12).',
    };
  },

  // leitura pública por token — só o que é do proprietário, sempre
  publico(tk, ano, mes) {
    const p = db.prepare("SELECT * FROM lv_proprietarios WHERE portal_token = ? AND portal_token <> ''").get(s(tk, 60));
    if (!p) return null;
    try {
      const r = Proprietarios.relatorio(p.tenant_id, p.id, ano, mes);
      return { nome: p.nome, ...r };
    } catch (_) { return null; }
  },
  registrarContato(tenantId, id, quem) {
    db.prepare('UPDATE lv_proprietarios SET ultimo_contato = ? WHERE tenant_id = ? AND id = ?').run(hoje(), s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'proprietario.contato', 'lv_proprietarios', s(id, 40), null, { em: hoje() });
    return { ok: true };
  },
};

module.exports = { metricas, alertas, dre, Proprietarios, convencoes };
