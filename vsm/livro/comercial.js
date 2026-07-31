// =====================================================================
// VSM · ONDA LIVRO — comercial.
//
// Cap. 23 · CRM: leads, hóspedes e proprietários; funil de 5 estágios com
//           próxima ação obrigatória e motivo de perda em categoria fechada
// Cap. 21 · datas especiais e a revisão semanal do calendário de preços
// Cap. 25/30 · documentação da reserva por faixa de valor, conferência das
//           nove etapas e sinalização de padrões atípicos (sem rotular ninguém)
// =====================================================================
'use strict';
const B = require('./base');
const { db, j, s, num, cent, dia, hoje, novoId, nowISO, dias, somaDias, sobrepoe, auditar, S } = B;
const appRepo = require('../app-repo');
const OP = require('./operacao');

const nomesImoveis = (tid) => {
  const m = {};
  for (const i of appRepo.Imoveis.listar(tid)) m[i.id] = i.nome;
  return m;
};
const MOTIVOS = S.MOTIVOS_PERDA.map(m => m[0]);
const ESTAGIOS = S.ESTAGIOS_FUNIL;

// =====================================================================
// CONTATOS (Cap. 23) — três públicos que não se misturam.
// =====================================================================
const Contatos = {
  listar(tenantId, { tipo = '', busca = '' } = {}) {
    const args = [s(tenantId, 40)];
    let sql = 'SELECT * FROM lv_contatos WHERE tenant_id = ?';
    if (tipo) { sql += ' AND tipo = ?'; args.push(s(tipo, 20)); }
    if (busca) { sql += ' AND (nome LIKE ? OR telefone LIKE ? OR email LIKE ?)'; const b = `%${s(busca, 60)}%`; args.push(b, b, b); }
    return db.prepare(sql + ' ORDER BY nome LIMIT 500').all(...args);
  },
  obter(tenantId, id) { return db.prepare('SELECT * FROM lv_contatos WHERE tenant_id = ? AND id = ?').get(s(tenantId, 40), s(id, 40)) || null; },
  salvar(tenantId, d, quem) {
    const tid = s(tenantId, 40);
    if (!s(d.nome)) throw new Error('Informe o nome do contato.');
    const tipo = ['lead', 'hospede', 'proprietario'].includes(s(d.tipo)) ? s(d.tipo) : 'lead';
    const id = s(d.id, 40) || novoId();
    const antes = Contatos.obter(tid, id);
    if (antes) {
      db.prepare(`UPDATE lv_contatos SET tipo=?, nome=?, telefone=?, email=?, idioma=?, origem=?, ultima_estadia=?,
        finalidade=?, opt_out=?, obs=?, atualizado_em=? WHERE id=? AND tenant_id=?`)
        .run(tipo, s(d.nome, 200), s(d.telefone, 40), s(d.email, 200), s(d.idioma, 5) || antes.idioma, s(d.origem, 80),
          dia(d.ultima_estadia) || antes.ultima_estadia, s(d.finalidade, 60), d.opt_out ? 1 : 0, s(d.obs, 2000), nowISO(), id, tid);
    } else {
      db.prepare(`INSERT INTO lv_contatos (id, tenant_id, tipo, nome, telefone, email, idioma, origem, primeiro_contato,
        ultima_estadia, finalidade, opt_out, obs, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, tid, tipo, s(d.nome, 200), s(d.telefone, 40), s(d.email, 200), s(d.idioma, 5) || 'pt', s(d.origem, 80),
          dia(d.primeiro_contato) || hoje(), dia(d.ultima_estadia), s(d.finalidade, 60), d.opt_out ? 1 : 0, s(d.obs, 2000), nowISO(), nowISO());
    }
    auditar(tid, quem, 'contato.salvar', 'lv_contatos', id, antes, null);
    return Contatos.obter(tid, id);
  },
  optOut(tenantId, id, quem) {
    db.prepare('UPDATE lv_contatos SET opt_out = 1, atualizado_em = ? WHERE tenant_id = ? AND id = ?').run(nowISO(), s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'contato.opt_out', 'lv_contatos', s(id, 40), null, { opt_out: 1 });
    return { ok: true };
  },
};

// =====================================================================
// OPORTUNIDADES (Cap. 23) — funil de cinco estágios.
// Duas regras fazem o funil funcionar e viram validação aqui:
//  · todo contato em estágio ABERTO tem próxima ação com data;
//  · toda perda tem MOTIVO em categoria fechada.
// =====================================================================
const Oportunidades = {
  listar(tenantId, { estagio = '', contato_id = '' } = {}) {
    const tid = s(tenantId, 40);
    const args = [tid];
    let sql = 'SELECT * FROM lv_oportunidades WHERE tenant_id = ?';
    if (estagio) { sql += ' AND estagio = ?'; args.push(s(estagio, 20)); }
    if (contato_id) { sql += ' AND contato_id = ?'; args.push(s(contato_id, 40)); }
    const nomes = nomesImoveis(tid);
    return db.prepare(sql + ' ORDER BY atualizado_em DESC LIMIT 500').all(...args).map(o => {
      const c = Contatos.obter(tid, o.contato_id);
      return {
        ...o, contato: c ? c.nome : '(removido)', contato_tipo: c ? c.tipo : '', imovel: nomes[o.imovel_id] || '',
        aberta: !['ganho', 'perdido'].includes(o.estagio),
        sem_proxima_acao: !['ganho', 'perdido'].includes(o.estagio) && (!o.proxima_acao || !o.proxima_acao_em),
        atrasada: !!(o.proxima_acao_em && o.proxima_acao_em < hoje() && !['ganho', 'perdido'].includes(o.estagio)),
      };
    });
  },
  salvar(tenantId, d, quem) {
    const tid = s(tenantId, 40);
    const contatoId = s(d.contato_id, 40);
    if (!Contatos.obter(tid, contatoId)) throw new Error('Contato não encontrado.');
    const id = s(d.id, 40) || novoId();
    const antes = db.prepare('SELECT * FROM lv_oportunidades WHERE tenant_id = ? AND id = ?').get(tid, id) || null;
    const estagio = ESTAGIOS.includes(s(d.estagio)) ? s(d.estagio) : (antes ? antes.estagio : 'novo');
    if (estagio === 'ganho') throw new Error('"Ganho" é resultado da conversão em reserva — use Converter.');
    if (estagio === 'perdido') throw new Error('Para perder, use Perder — o motivo é obrigatório (Cap. 23).');
    const campos = {
      imovel_id: s(d.imovel_id, 40), datas_de: dia(d.datas_de), datas_ate: dia(d.datas_ate),
      hospedes_qtd: num(d.hospedes_qtd, 0), finalidade: s(d.finalidade, 60), visitantes: num(d.visitantes, 0),
      valor_cotado_centavos: cent(d.valor_cotado_centavos), cotado_em: dia(d.cotado_em),
      proxima_acao: s(d.proxima_acao, 300), proxima_acao_em: dia(d.proxima_acao_em), responsavel: s(d.responsavel, 120),
    };
    // regra do capítulo: funil honesto é curto — estágio aberto exige próxima ação
    if (!campos.proxima_acao || !campos.proxima_acao_em) {
      throw new Error('Toda oportunidade aberta tem próxima ação COM DATA. Sem isso o funil vira lista de nomes mortos (Cap. 23).');
    }
    // qualificar antes de cotar
    if (['cotado', 'negociacao'].includes(estagio) && (!campos.hospedes_qtd || !campos.finalidade)) {
      throw new Error('Qualifique antes de cotar: número de pessoas e finalidade da viagem são obrigatórios (Cap. 24).');
    }
    if (antes) {
      db.prepare(`UPDATE lv_oportunidades SET imovel_id=?, datas_de=?, datas_ate=?, hospedes_qtd=?, finalidade=?, visitantes=?,
        valor_cotado_centavos=?, cotado_em=?, estagio=?, proxima_acao=?, proxima_acao_em=?, responsavel=?, atualizado_em=? WHERE id=? AND tenant_id=?`)
        .run(campos.imovel_id, campos.datas_de, campos.datas_ate, campos.hospedes_qtd, campos.finalidade, campos.visitantes,
          campos.valor_cotado_centavos, campos.cotado_em, estagio, campos.proxima_acao, campos.proxima_acao_em, campos.responsavel, nowISO(), id, tid);
    } else {
      db.prepare(`INSERT INTO lv_oportunidades (id, tenant_id, contato_id, imovel_id, datas_de, datas_ate, hospedes_qtd,
        finalidade, visitantes, valor_cotado_centavos, cotado_em, estagio, proxima_acao, proxima_acao_em, responsavel,
        motivo_perda, reserva_id, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'','',?,?)`)
        .run(id, tid, contatoId, campos.imovel_id, campos.datas_de, campos.datas_ate, campos.hospedes_qtd, campos.finalidade,
          campos.visitantes, campos.valor_cotado_centavos, campos.cotado_em, estagio, campos.proxima_acao, campos.proxima_acao_em,
          campos.responsavel, nowISO(), nowISO());
    }
    auditar(tid, quem, 'oportunidade.salvar', 'lv_oportunidades', id, antes, null);
    // Cap. 24: evento disfarçado de estadia é o risco mais caro do capítulo
    const aviso = campos.visitantes > 0 || /evento|casamento|formatura|anivers|confratern/i.test(campos.finalidade)
      ? 'ESCALONAR PARA PROPOSTA DE EVENTO — há visitantes que não se hospedam ou a finalidade indica evento. Contrato, caução e precificação próprios (Cap. 24).' : '';
    return { ...db.prepare('SELECT * FROM lv_oportunidades WHERE id = ?').get(id), aviso };
  },
  perder(tenantId, id, motivo, quem) {
    const tid = s(tenantId, 40);
    if (!MOTIVOS.includes(s(motivo))) throw new Error(`Motivo de perda inválido. Use uma das categorias: ${MOTIVOS.join(', ')} (Cap. 23).`);
    const antes = db.prepare('SELECT * FROM lv_oportunidades WHERE tenant_id = ? AND id = ?').get(tid, s(id, 40));
    if (!antes) throw new Error('Oportunidade não encontrada.');
    db.prepare("UPDATE lv_oportunidades SET estagio='perdido', motivo_perda=?, proxima_acao='', proxima_acao_em='', atualizado_em=? WHERE id=? AND tenant_id=?")
      .run(s(motivo, 40), nowISO(), s(id, 40), tid);
    auditar(tid, quem, 'oportunidade.perder', 'lv_oportunidades', s(id, 40), antes, { motivo });
    return db.prepare('SELECT * FROM lv_oportunidades WHERE id = ?').get(s(id, 40));
  },
  // ganhar = virar reserva de verdade (passa pelo anti-overbooking do núcleo
  // e pela guarda de interligação da ONDA LIVRO)
  converter(tenantId, id, extras, quem) {
    const tid = s(tenantId, 40);
    const o = db.prepare('SELECT * FROM lv_oportunidades WHERE tenant_id = ? AND id = ?').get(tid, s(id, 40));
    if (!o) throw new Error('Oportunidade não encontrada.');
    if (o.estagio === 'ganho') throw new Error('Esta oportunidade já virou reserva.');
    const c = Contatos.obter(tid, o.contato_id);
    const e = extras || {};
    const reserva = appRepo.Reservas.criar(tid, {
      imovel_id: s(e.imovel_id, 40) || o.imovel_id,
      hospede_nome: c ? c.nome : 'Hóspede',
      checkin: dia(e.checkin) || o.datas_de, checkout: dia(e.checkout) || o.datas_ate,
      hospedes_qtd: num(e.hospedes_qtd, o.hospedes_qtd) || 1,
      valor_centavos: cent(e.valor_centavos) || o.valor_cotado_centavos,
      canal: s(e.canal, 30) || 'direto', status: 'confirmada',
      obs: `Convertida da oportunidade ${o.id} — finalidade: ${o.finalidade || 'não declarada'}.`,
    });
    db.prepare("UPDATE lv_oportunidades SET estagio='ganho', reserva_id=?, proxima_acao='', proxima_acao_em='', atualizado_em=? WHERE id=?")
      .run(reserva.id, nowISO(), o.id);
    if (c) db.prepare("UPDATE lv_contatos SET tipo='hospede', ultima_estadia=?, finalidade=?, atualizado_em=? WHERE id=?")
      .run(reserva.checkin, o.finalidade || c.finalidade, nowISO(), c.id);
    auditar(tid, quem, 'oportunidade.converter', 'lv_oportunidades', o.id, o, { reserva_id: reserva.id });
    return { oportunidade: db.prepare('SELECT * FROM lv_oportunidades WHERE id = ?').get(o.id), reserva };
  },

  // A pauta comercial da semana (Cap. 23). O item de retorno mais imediato
  // é o (2): data liberada por cancelamento × quem consultou aquele período.
  pauta(tenantId) {
    const tid = s(tenantId, 40);
    const hj = hoje();
    const todas = Oportunidades.listar(tid);
    const semProximaAcao = todas.filter(o => o.sem_proxima_acao);
    const atrasadas = todas.filter(o => o.atrasada);

    // datas liberadas por cancelamento nos últimos 30 dias, ainda no futuro
    const canceladas = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ? AND status = 'cancelada'
      AND checkin >= ? AND atualizado_em >= ?`).all(tid, hj, somaDias(hj, -30) + 'T00:00:00.000Z');
    const nomes = nomesImoveis(tid);
    const datasLivres = canceladas.map(r => {
      const compativeis = todas.filter(o => o.estagio === 'perdido'
        && o.datas_de && sobrepoe(o.datas_de, o.datas_ate || o.datas_de, r.checkin, r.checkout)
        && ['data_indisponivel', 'preco', 'sumiu', 'escolheu_outro'].includes(o.motivo_perda));
      return {
        imovel: nomes[r.imovel_id] || r.imovel_id, de: r.checkin, ate: r.checkout,
        contatos: compativeis.map(o => ({ oportunidade_id: o.id, contato: o.contato, motivo_perda: o.motivo_perda })),
      };
    }).filter(x => x.contatos.length);

    // duas listas de reativação, com critério explícito — sem opt-out e sem
    // contato de origem não registrada
    const hospedes = Contatos.listar(tid, { tipo: 'hospede' }).filter(c => !c.opt_out && c.origem);
    const umAno = hospedes.filter(c => c.ultima_estadia && dias(c.ultima_estadia, hj) >= 330 && dias(c.ultima_estadia, hj) <= 400);
    const porFinalidade = {};
    for (const c of hospedes) if (c.finalidade) (porFinalidade[c.finalidade] = porFinalidade[c.finalidade] || []).push(c);
    const maiorSegmento = Object.entries(porFinalidade).sort((a, b) => b[1].length - a[1].length)[0];
    const reativacao = [
      { criterio: 'Hóspedes cuja última estadia foi há cerca de um ano — o gatilho de sazonalidade do Cap. 29.', contatos: umAno.map(c => ({ id: c.id, nome: c.nome, ultima_estadia: c.ultima_estadia })) },
    ];
    if (maiorSegmento) reativacao.push({ criterio: `Hóspedes que vieram por "${maiorSegmento[0]}" — segmento por finalidade.`, contatos: maiorSegmento[1].slice(0, 50).map(c => ({ id: c.id, nome: c.nome, ultima_estadia: c.ultima_estadia })) });

    // leitura dos motivos de perda
    const perdidas = todas.filter(o => o.estagio === 'perdido');
    const contMotivos = {};
    for (const o of perdidas) contMotivos[o.motivo_perda] = (contMotivos[o.motivo_perda] || 0) + 1;
    const ordenados = Object.entries(contMotivos).sort((a, b) => b[1] - a[1]);
    const rotulo = Object.fromEntries(S.MOTIVOS_PERDA.map(m => [m[0], m[1]]));
    const familia = Object.fromEntries(S.MOTIVOS_PERDA.map(m => [m[0], m[2]]));
    const leitura = ordenados.length
      ? `Motivo predominante: ${rotulo[ordenados[0][0]] || ordenados[0][0]} (${ordenados[0][1]} de ${perdidas.length}). ` +
        (familia[ordenados[0][0]] === 'produto'
          ? 'Não é perda comercial: é informação de produto — falta estoque, capacidade ou o preço está baixo demais (Cap. 23).'
          : familia[ordenados[0][0]] === 'processo'
            ? 'É perda de processo: o mais barato de corrigir é o tempo de primeira resposta.'
            : 'É perda comercial: revise posicionamento, cotação e a política de desconto.')
      : 'Sem perdas registradas no período — verifique se o funil está sendo alimentado.';

    return {
      gerado_em: hj,
      sem_proxima_acao: semProximaAcao, atrasadas, datas_livres: datasLivres, reativacao,
      motivos_perda: ordenados.map(([k, n]) => ({ motivo: k, rotulo: rotulo[k] || k, familia: familia[k] || '', n })),
      leitura,
      nota: 'Nada é enviado por este relatório. Lista de reativação é preparada por máquina e enviada com critério humano (Cap. 23).',
    };
  },

  funil(tenantId) {
    const todas = Oportunidades.listar(tenantId);
    const porEstagio = {};
    for (const e of ESTAGIOS) porEstagio[e] = todas.filter(o => o.estagio === e).length;
    const abertas = todas.filter(o => o.aberta);
    return {
      por_estagio: porEstagio, abertas: abertas.length,
      sem_proxima_acao: abertas.filter(o => o.sem_proxima_acao).length,
      conversao: porEstagio.ganho + porEstagio.perdido ? Number((porEstagio.ganho / (porEstagio.ganho + porEstagio.perdido) * 100).toFixed(1)) : 0,
      estagios: ESTAGIOS, motivos: S.MOTIVOS_PERDA.map(m => ({ chave: m[0], rotulo: m[1], familia: m[2] })),
    };
  },
};

// =====================================================================
// DATAS ESPECIAIS E REVENUE (Cap. 21)
// A recomendação é automática; a PUBLICAÇÃO é humana. Nada aqui altera
// tarifa em canal nenhum — o campo "aplicada" é um registro seu.
// =====================================================================
const DatasEspeciais = {
  listar(tenantId) {
    const nomes = nomesImoveis(s(tenantId, 40));
    return db.prepare('SELECT * FROM lv_datas_especiais WHERE tenant_id = ? ORDER BY de').all(s(tenantId, 40))
      .map(d2 => ({ ...d2, imovel: d2.imovel_id ? (nomes[d2.imovel_id] || d2.imovel_id) : '(todas)', aplicada: !!d2.aplicada }));
  },
  salvar(tenantId, d, quem) {
    const tid = s(tenantId, 40);
    if (!s(d.nome) || !dia(d.de) || !dia(d.ate)) throw new Error('Informe nome, início e fim da data especial.');
    if (dias(dia(d.de), dia(d.ate)) <= 0) throw new Error('O fim precisa ser posterior ao início.');
    const id = s(d.id, 40) || novoId();
    const antes = db.prepare('SELECT * FROM lv_datas_especiais WHERE tenant_id = ? AND id = ?').get(tid, id) || null;
    // trava do Cap. 21: nada abaixo da tarifa mínima da unidade
    const tarifa = cent(d.tarifa_proposta_centavos);
    if (d.imovel_id && tarifa) {
      const f = OP.Ficha.obter(tid, s(d.imovel_id, 40));
      if (f.tarifa_minima_centavos && tarifa < f.tarifa_minima_centavos) {
        throw new Error('Tarifa proposta abaixo da tarifa mínima da unidade. Sem piso, todo algoritmo tende a zero (Cap. 21).');
      }
    }
    if (antes) {
      db.prepare('UPDATE lv_datas_especiais SET nome=?, de=?, ate=?, imovel_id=?, tarifa_proposta_centavos=?, estadia_minima=?, revisar_em=?, justificativa=? WHERE id=? AND tenant_id=?')
        .run(s(d.nome, 160), dia(d.de), dia(d.ate), s(d.imovel_id, 40), tarifa, Math.max(1, num(d.estadia_minima, antes.estadia_minima)), dia(d.revisar_em), s(d.justificativa, 1000), id, tid);
    } else {
      db.prepare('INSERT INTO lv_datas_especiais (id, tenant_id, nome, de, ate, imovel_id, tarifa_proposta_centavos, estadia_minima, revisar_em, aplicada, justificativa, criado_em) VALUES (?,?,?,?,?,?,?,?,?,0,?,?)')
        .run(id, tid, s(d.nome, 160), dia(d.de), dia(d.ate), s(d.imovel_id, 40), tarifa, Math.max(1, num(d.estadia_minima, 1)), dia(d.revisar_em), s(d.justificativa, 1000), nowISO());
    }
    auditar(tid, quem, 'data_especial.salvar', 'lv_datas_especiais', id, antes, null);
    return db.prepare('SELECT * FROM lv_datas_especiais WHERE id = ?').get(id);
  },
  marcarAplicada(tenantId, id, quem) {
    // registro de que VOCÊ publicou no canal — o sistema não publica preço
    db.prepare('UPDATE lv_datas_especiais SET aplicada = 1 WHERE tenant_id = ? AND id = ?').run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'data_especial.aplicada', 'lv_datas_especiais', s(id, 40), null, { aplicada: 1, por: s(quem, 120) });
    return { ok: true, nota: 'Registrado que a publicação foi feita por uma pessoa. O sistema não publica preço em canal (Cap. 21).' };
  },
  remover(tenantId, id, quem) {
    db.prepare('DELETE FROM lv_datas_especiais WHERE tenant_id = ? AND id = ?').run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'data_especial.remover', 'lv_datas_especiais', s(id, 40), null, null);
    return { ok: true };
  },
};

// A revisão semanal do Cap. 21. Regra deliberada: o silêncio é uma saída
// válida — um relatório que sempre acha dez coisas treina você a ignorá-lo.
function revisaoSemanal(tenantId, { horizonteDias = 120 } = {}) {
  const tid = s(tenantId, 40);
  const hj = hoje(), fim = somaDias(hj, num(horizonteDias, 120));
  const imoveis = appRepo.Imoveis.listar(tid, { incluirInativos: false });
  const itens = [];

  const reservas = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ? AND status IN ('pendente','confirmada')
    AND checkout > ? AND checkin < ?`).all(tid, hj, fim);

  for (const im of imoveis) {
    const f = OP.Ficha.obter(tid, im.id);
    const minhas = reservas.filter(r => r.imovel_id === im.id).sort((a, b) => a.checkin.localeCompare(b.checkin));

    // (c) buracos de 1 ou 2 noites entre reservas — nunca vendem com mínimo alto
    for (let i = 0; i + 1 < minhas.length; i++) {
      const gap = dias(minhas[i].checkout, minhas[i + 1].checkin);
      if (gap >= 1 && gap <= 2) {
        itens.push({
          unidade: im.nome, periodo: `${minhas[i].checkout} → ${minhas[i + 1].checkin}`, situacao: 'buraco de calendário',
          acao: `Permitir estadia de ${gap} noite(s) exatamente nesse intervalo. Com mínimo maior, essa noite nunca vende (Cap. 21).`,
          receita_em_risco_centavos: cent((im.tarifa_base_centavos || 0) * gap),
        });
      }
    }

    // (a)/(b) ritmo de venda nos próximos 60 dias
    const janela60 = somaDias(hj, 60);
    let noitesVendidas = 0;
    for (const r of minhas) {
      const ini = r.checkin > hj ? r.checkin : hj;
      const f2 = r.checkout < janela60 ? r.checkout : janela60;
      const d = dias(ini, f2); if (d > 0) noitesVendidas += d;
    }
    const ocup = noitesVendidas / 60;
    if (ocup >= 0.8) {
      itens.push({
        unidade: im.nome, periodo: `${hj} → ${janela60}`, situacao: 'enchendo cedo demais',
        acao: 'Calendário que enche cedo é dinheiro deixado na mesa — candidata a alta de tarifa (Cap. 21).',
        receita_em_risco_centavos: 0,
      });
    } else if (ocup <= 0.2) {
      itens.push({
        unidade: im.nome, periodo: `${hj} → ${janela60}`, situacao: 'ritmo abaixo com prazo curto',
        acao: `Revisar — e nem sempre é o preço: pode ser foto, estadia mínima ou política de cancelamento. Piso: ${f.tarifa_minima_centavos ? 'R$ ' + (f.tarifa_minima_centavos / 100).toFixed(2) : 'tarifa mínima NÃO definida'}.`,
        receita_em_risco_centavos: cent((im.tarifa_base_centavos || 0) * Math.round(60 * (0.5 - ocup))),
      });
    }
    if (!f.tarifa_minima_centavos) {
      itens.push({ unidade: im.nome, periodo: '—', situacao: 'sem tarifa mínima', acao: 'Defina o piso na ficha da unidade. Sem piso, todo algoritmo tende a zero.', receita_em_risco_centavos: 0 });
    }
  }

  // (d) datas especiais com data-limite de revisão chegando
  for (const de of DatasEspeciais.listar(tid)) {
    if (de.revisar_em && de.revisar_em <= somaDias(hj, 14) && !de.aplicada) {
      itens.push({
        unidade: de.imovel, periodo: `${de.de} → ${de.ate}`, situacao: `revisão de "${de.nome}" vencendo em ${de.revisar_em}`,
        acao: 'Decidir a tarifa e a estadia mínima antes do prazo. Datas especiais decididas na véspera são a maior perda de receita do ano.',
        receita_em_risco_centavos: de.tarifa_proposta_centavos * de.estadia_minima,
      });
    }
  }

  const ordenados = itens.sort((a, b) => b.receita_em_risco_centavos - a.receita_em_risco_centavos).slice(0, 10);
  try { OP.Rotinas.heartbeat(tid, 'revisao_revenue', { status: 'ok' }); } catch (_) {}
  return {
    gerado_em: hj,
    itens: ordenados,
    silencio: ordenados.length === 0,
    nota: ordenados.length ? 'Máximo 10 itens, ordenados por receita em risco. Nenhuma tarifa é publicada pelo sistema.' : 'Nada a fazer esta semana. O silêncio é uma saída válida — é o que faz você ler o relatório quando ele fala (Cap. 21).',
  };
}

// =====================================================================
// DOCUMENTAÇÃO E RISCO DA RESERVA (Cap. 25/30)
// =====================================================================
const PoliticaDoc = {
  listar(tenantId) { return db.prepare('SELECT * FROM lv_politica_doc WHERE tenant_id = ? ORDER BY de_centavos').all(s(tenantId, 40)); },
  salvar(tenantId, d, quem) {
    const id = s(d.id, 40) || novoId();
    const antes = db.prepare('SELECT * FROM lv_politica_doc WHERE tenant_id = ? AND id = ?').get(s(tenantId, 40), id) || null;
    const vals = [cent(d.de_centavos), cent(d.ate_centavos), d.exige_identificacao ? 1 : 0, d.exige_contrato ? 1 : 0, d.exige_caucao ? 1 : 0, Math.max(0, Math.min(100, num(d.sinal_pct, 0)))];
    if (antes) db.prepare('UPDATE lv_politica_doc SET de_centavos=?, ate_centavos=?, exige_identificacao=?, exige_contrato=?, exige_caucao=?, sinal_pct=? WHERE id=? AND tenant_id=?').run(...vals, id, s(tenantId, 40));
    else db.prepare('INSERT INTO lv_politica_doc (id, tenant_id, de_centavos, ate_centavos, exige_identificacao, exige_contrato, exige_caucao, sinal_pct, criado_em) VALUES (?,?,?,?,?,?,?,?,?)').run(id, s(tenantId, 40), ...vals, nowISO());
    auditar(tenantId, quem, 'politica_doc.salvar', 'lv_politica_doc', id, antes, null);
    return db.prepare('SELECT * FROM lv_politica_doc WHERE id = ?').get(id);
  },
  remover(tenantId, id, quem) {
    db.prepare('DELETE FROM lv_politica_doc WHERE tenant_id = ? AND id = ?').run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'politica_doc.remover', 'lv_politica_doc', s(id, 40), null, null);
    return { ok: true };
  },
  faixaDe(tenantId, valorCentavos) {
    const v = cent(valorCentavos);
    return PoliticaDoc.listar(tenantId).find(f => v >= f.de_centavos && (f.ate_centavos === 0 || v < f.ate_centavos)) || null;
  },
};

const Documentacao = {
  obter(tenantId, reservaId) {
    return db.prepare('SELECT * FROM lv_reserva_doc WHERE tenant_id = ? AND reserva_id = ?').get(s(tenantId, 40), s(reservaId, 40)) || null;
  },
  salvar(tenantId, reservaId, d, quem) {
    const tid = s(tenantId, 40), rid = s(reservaId, 40);
    const r = appRepo.Reservas.obter(tid, rid);
    if (!r) throw new Error('Reserva não encontrada.');
    const antes = Documentacao.obter(tid, rid);
    const at = (k, def) => (d[k] === undefined && antes) ? antes[k] : def;
    db.prepare(`INSERT INTO lv_reserva_doc (reserva_id, tenant_id, titular, identificacao_ok, contrato_ok, caucao_centavos,
        sinal_centavos, saldo_vence_em, saldo_recebido, regras_aceitas_em, confirmacao_enviada_em, visitantes, finalidade, obs, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(reserva_id) DO UPDATE SET titular=excluded.titular, identificacao_ok=excluded.identificacao_ok,
        contrato_ok=excluded.contrato_ok, caucao_centavos=excluded.caucao_centavos, sinal_centavos=excluded.sinal_centavos,
        saldo_vence_em=excluded.saldo_vence_em, saldo_recebido=excluded.saldo_recebido, regras_aceitas_em=excluded.regras_aceitas_em,
        confirmacao_enviada_em=excluded.confirmacao_enviada_em, visitantes=excluded.visitantes, finalidade=excluded.finalidade,
        obs=excluded.obs, atualizado_em=excluded.atualizado_em`)
      .run(rid, tid, s(d.titular === undefined && antes ? antes.titular : d.titular, 200),
        d.identificacao_ok === undefined ? at('identificacao_ok', 0) : (d.identificacao_ok ? 1 : 0),
        d.contrato_ok === undefined ? at('contrato_ok', 0) : (d.contrato_ok ? 1 : 0),
        cent(d.caucao_centavos === undefined && antes ? antes.caucao_centavos : d.caucao_centavos),
        cent(d.sinal_centavos === undefined && antes ? antes.sinal_centavos : d.sinal_centavos),
        dia(d.saldo_vence_em === undefined && antes ? antes.saldo_vence_em : d.saldo_vence_em),
        d.saldo_recebido === undefined ? at('saldo_recebido', 0) : (d.saldo_recebido ? 1 : 0),
        s(d.regras_aceitas_em === undefined && antes ? antes.regras_aceitas_em : d.regras_aceitas_em, 30),
        s(d.confirmacao_enviada_em === undefined && antes ? antes.confirmacao_enviada_em : d.confirmacao_enviada_em, 30),
        num(d.visitantes === undefined && antes ? antes.visitantes : d.visitantes, 0),
        s(d.finalidade === undefined && antes ? antes.finalidade : d.finalidade, 60),
        s(d.obs === undefined && antes ? antes.obs : d.obs, 2000), nowISO());
    auditar(tid, quem, 'reserva_doc.salvar', 'lv_reserva_doc', rid, antes, Documentacao.obter(tid, rid));
    return Documentacao.obter(tid, rid);
  },

  // A conferência do Cap. 30: "não presuma cumprimento por ausência de
  // registro — marque NÃO REGISTRADO". Encontra o erro antes do hóspede.
  conferir(tenantId, { dias: nd = 7 } = {}) {
    const tid = s(tenantId, 40);
    const hj = hoje();
    const nomes = nomesImoveis(tid);
    const recentes = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ? AND status IN ('pendente','confirmada')
      AND checkin >= ? ORDER BY checkin`).all(tid, somaDias(hj, -1));
    const linhas = [];
    for (const r of recentes.slice(0, 300)) {
      const doc = Documentacao.obter(tid, r.id) || {};
      const faixa = PoliticaDoc.faixaDe(tid, r.valor_centavos);
      const falta = [];
      if (!doc.titular) falta.push('titular responsável NÃO REGISTRADO');
      if (faixa && faixa.exige_identificacao && !doc.identificacao_ok) falta.push('identificação exigida pela faixa de valor');
      if (faixa && faixa.exige_contrato && !doc.contrato_ok) falta.push('contrato exigido pela faixa de valor');
      if (faixa && faixa.exige_caucao && !doc.caucao_centavos) falta.push('caução exigida pela faixa de valor');
      if (!doc.regras_aceitas_em) falta.push('regras aceitas antes do pagamento NÃO REGISTRADO');
      if (!doc.confirmacao_enviada_em) falta.push('confirmação com as oito informações NÃO REGISTRADA');
      if (faixa && faixa.sinal_pct && (doc.sinal_centavos || 0) < Math.round(r.valor_centavos * faixa.sinal_pct / 100)) falta.push(`sinal de ${faixa.sinal_pct}% não atingido`);
      if (doc.saldo_vence_em && !doc.saldo_recebido && doc.saldo_vence_em < hj) falta.push(`SALDO VENCIDO em ${doc.saldo_vence_em}`);
      const limpeza = db.prepare('SELECT COUNT(*) n FROM app_limpezas WHERE tenant_id = ? AND reserva_id = ?').get(tid, r.id).n;
      if (!limpeza) falta.push('tarefa de limpeza não gerada');
      const conflito = OP.Interligacoes.conflito(tid, { imovel_id: r.imovel_id, checkin: r.checkin, checkout: r.checkout, ignorarReservaId: r.id });
      if (conflito.conflito) falta.push(`CONFLITO com ${conflito.imovel_nome} (${conflito.tipo})`);
      if (!falta.length) continue;
      const diasAte = dias(hj, r.checkin);
      linhas.push({
        reserva_id: r.id, imovel: nomes[r.imovel_id] || r.imovel_id, hospede: r.hospede_nome,
        checkin: r.checkin, valor_centavos: r.valor_centavos, dias_ate_checkin: diasAte,
        faixa: faixa ? { de: faixa.de_centavos, ate: faixa.ate_centavos, exige_contrato: !!faixa.exige_contrato, exige_caucao: !!faixa.exige_caucao } : null,
        falta,
        critico: falta.some(f => /CONFLITO|SALDO VENCIDO/.test(f)) || (diasAte <= 2 && falta.length > 0),
      });
    }
    // ordena por risco: mais próxima do check-in e de maior valor primeiro
    linhas.sort((a, b) => (a.dias_ate_checkin - b.dias_ate_checkin) || (b.valor_centavos - a.valor_centavos));
    return {
      gerado_em: hj, total: linhas.length,
      criticas: linhas.filter(l => l.critico), demais: linhas.filter(l => !l.critico),
      nota: 'Ausência de registro não é evidência de cumprimento. O relatório não corrige nada (Cap. 30).',
    };
  },

  // Cap. 25 · sinais de fraude: sempre em CONJUNTO, nunca isoladamente, e
  // sem rotular ninguém. A máquina levanta o fato; o julgamento é humano.
  risco(tenantId, reservaId) {
    const tid = s(tenantId, 40);
    const r = appRepo.Reservas.obter(tid, s(reservaId, 40));
    if (!r) throw new Error('Reserva não encontrada.');
    const doc = Documentacao.obter(tid, r.id) || {};
    const faixa = PoliticaDoc.faixaDe(tid, r.valor_centavos);
    const pontos = [];
    const antecedencia = dias(String(r.criado_em).slice(0, 10), r.checkin);
    const media = db.prepare("SELECT AVG(valor_centavos) m FROM app_reservas WHERE tenant_id = ? AND status <> 'cancelada'").get(tid).m || 0;

    if (antecedencia <= 2) pontos.push({ fato: `Reserva feita com ${antecedencia} dia(s) de antecedência.`, base: 'antecedência' });
    if (media && r.valor_centavos > media * 2) pontos.push({ fato: 'Valor bem acima da média das suas reservas.', base: 'valor' });
    if (r.hospedes_qtd >= 10) pontos.push({ fato: `Grupo grande (${r.hospedes_qtd} pessoas).`, base: 'grupo' });
    if (num(doc.visitantes, 0) > 0) pontos.push({ fato: `${doc.visitantes} visitante(s) que não se hospedam — separa estadia de evento (Cap. 24).`, base: 'visitantes' });
    if (!doc.titular) pontos.push({ fato: 'Titular responsável não identificado.', base: 'identificação' });
    if (!doc.contrato_ok && faixa && faixa.exige_contrato) pontos.push({ fato: 'Faixa de valor exige contrato e ele não consta.', base: 'documentação' });

    const pendencias = [];
    if (faixa) {
      if (faixa.exige_identificacao && !doc.identificacao_ok) pendencias.push('identificação do titular');
      if (faixa.exige_contrato && !doc.contrato_ok) pendencias.push('contrato assinado');
      if (faixa.exige_caucao && !doc.caucao_centavos) pendencias.push('caução');
      if (faixa.sinal_pct && !doc.sinal_centavos) pendencias.push(`sinal de ${faixa.sinal_pct}%`);
    }
    return {
      reserva_id: r.id, valor_centavos: r.valor_centavos,
      documentacao_pendente: pendencias,
      pontos_de_atencao: pontos,
      // a regra do meio do prompt do Cap. 25, aplicada ao produto
      conclusao: pontos.length >= 3
        ? 'Três ou mais pontos de atenção em conjunto. Isso NÃO classifica ninguém: leve os fatos para decisão humana.'
        : 'Nenhum padrão relevante em conjunto. Sinal isolado não significa nada.',
      politica: faixa,
      aviso: 'O sistema não classifica pessoas, não recomenda recusar e não guarda dado de cartão (Cap. 25).',
    };
  },
};

module.exports = { Contatos, Oportunidades, DatasEspeciais, revisaoSemanal, PoliticaDoc, Documentacao, MOTIVOS, ESTAGIOS };
