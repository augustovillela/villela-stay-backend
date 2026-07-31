// =====================================================================
// VSM · ONDA LIVRO — jornada do hóspede.
//
// Cap. 31/34 + Apêndice D · régua de mensagens: prepara, NUNCA envia sozinho
// Cap. 31/33 · manual digital, acessível durante a estadia
// Cap. 33 · triagem do concierge: escalonamento ANTES de tentar responder
// Cap. 29 · avaliações → diagnóstico → correção → verificação do ciclo
// =====================================================================
'use strict';
const B = require('./base');
const { db, j, s, num, dia, hoje, novoId, nowISO, token, dias, somaDias, auditar, S } = B;
const appRepo = require('../app-repo');
const OP = require('./operacao');

const nomesImoveis = (tid) => {
  const m = {};
  for (const i of appRepo.Imoveis.listar(tid)) m[i.id] = i.nome;
  return m;
};

// Cap. 32 · detector de dado de acesso escrito em texto.
// A regra do livro: "uma vez em texto, nunca mais se recolhe". Barramos na
// entrada, e não com um aviso que ninguém lê.
//
// Casa quando a palavra (senha / código / pin / code) aparece na MESMA linha
// que um `:` ou `=` seguido de um valor concreto. Deixa passar de propósito:
//   · "A senha é enviada pelo anfitrião."          (não há separador)
//   · "Wi-fi: [nome da rede]"                      (o valor é um marcador)
//   · "[DADO DE ACESSO — INSERIR NO ENVIO]"        (é justamente o certo)
function pareceAcesso(texto) {
  const linhas = String(texto || '').split(/\r?\n/);
  const gatilho = /(senha|senhas|c[óo]digo|c[óo]digos|pin|code|password|passcode)\b/i;
  // separador seguido de um valor que NÃO é um marcador entre colchetes
  const valor = /[:=]\s*(?!\[)[A-Za-z0-9@#$%*_-]{3,}/;
  for (const l of linhas) {
    if (!gatilho.test(l)) continue;
    const pos = l.search(gatilho);
    if (valor.test(l.slice(pos))) return true;
  }
  return false;
}

// =====================================================================
// MODELOS DA RÉGUA (Apêndice D)
// =====================================================================
const IDIOMAS = ['pt', 'en', 'es', 'fr'];
const Modelos = {
  listar(tenantId, idioma) {
    const args = [s(tenantId, 40)];
    let sql = 'SELECT * FROM lv_modelos WHERE tenant_id = ?';
    if (idioma) { sql += ' AND idioma = ?'; args.push(s(idioma, 5)); }
    return db.prepare(sql + ' ORDER BY chave, idioma').all(...args);
  },
  obter(tenantId, chave, idioma) {
    const tid = s(tenantId, 40);
    return db.prepare('SELECT * FROM lv_modelos WHERE tenant_id = ? AND chave = ? AND idioma = ?').get(tid, s(chave, 60), s(idioma, 5))
      || db.prepare('SELECT * FROM lv_modelos WHERE tenant_id = ? AND chave = ? AND idioma = ?').get(tid, s(chave, 60), 'pt')
      || null;
  },
  salvar(tenantId, d, quem) {
    const chave = s(d.chave, 60).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const idioma = IDIOMAS.includes(s(d.idioma, 5)) ? s(d.idioma, 5) : 'pt';
    if (!chave || !s(d.texto)) throw new Error('Informe a chave e o texto do modelo.');
    // Cap. 32 · a regra que não se negocia: dado de acesso não trafega em
    // mensagem automática. Aqui ela vira validação, não recomendação.
    if (pareceAcesso(d.texto)) {
      throw new Error(`Este modelo parece conter dado de acesso. Use o marcador ${S.MARCADOR_ACESSO} e envie o acesso manualmente, no dia (Cap. 32).`);
    }
    const antes = db.prepare('SELECT * FROM lv_modelos WHERE tenant_id = ? AND chave = ? AND idioma = ?').get(s(tenantId, 40), chave, idioma) || null;
    const gat = ['confirmacao', 'dias_antes', 'vespera', 'checkout_vespera', 'pos_checkout', 'manual'].includes(s(d.gatilho)) ? s(d.gatilho) : (antes ? antes.gatilho : 'manual');
    db.prepare(`INSERT INTO lv_modelos (id, tenant_id, chave, gatilho, dias, idioma, titulo, texto, ativo, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id, chave, idioma) DO UPDATE SET gatilho=excluded.gatilho, dias=excluded.dias,
        titulo=excluded.titulo, texto=excluded.texto, ativo=excluded.ativo`)
      .run(antes ? antes.id : novoId(), s(tenantId, 40), chave, gat, num(d.dias, antes ? antes.dias : 0), idioma,
        s(d.titulo, 200) || (antes ? antes.titulo : chave), s(d.texto, 8000), d.ativo === false ? 0 : 1, nowISO());
    const depois = db.prepare('SELECT * FROM lv_modelos WHERE tenant_id = ? AND chave = ? AND idioma = ?').get(s(tenantId, 40), chave, idioma);
    auditar(tenantId, quem, 'modelo.salvar', 'lv_modelos', `${chave}/${idioma}`, antes, depois);
    return depois;
  },
};

// =====================================================================
// RÉGUA (Cap. 31/34)
// Prepara as mensagens para conferência. Três regras do livro viram código:
// 1) a régua SABE o estado da reserva — cancelada ou já com check-in não gera;
// 2) estadia com problema vira CONTATO PESSOAL, nunca mensagem automática;
// 3) cadastro incompleto vira FALTA DADO — não se inventa o que não existe.
// =====================================================================
const Regua = {
  fila(tenantId, { situacao = '' } = {}) {
    const tid = s(tenantId, 40);
    const args = [tid];
    let sql = 'SELECT * FROM lv_fila_mensagens WHERE tenant_id = ?';
    if (situacao) { sql += ' AND situacao = ?'; args.push(s(situacao, 30)); }
    const nomes = nomesImoveis(tid);
    return db.prepare(sql + ' ORDER BY preparada_em DESC LIMIT 500').all(...args).map(m => {
      const r = db.prepare('SELECT imovel_id, hospede_nome, checkin, checkout FROM app_reservas WHERE id = ?').get(m.reserva_id);
      return { ...m, exige_insercao: !!m.exige_insercao, hospede: r ? r.hospede_nome : '', imovel: r ? (nomes[r.imovel_id] || r.imovel_id) : '', checkin: r ? r.checkin : '', checkout: r ? r.checkout : '' };
    });
  },

  // monta a fila dos próximos dias. Idempotente por (reserva, modelo).
  preparar(tenantId, { horizonteDias = 7 } = {}) {
    const tid = s(tenantId, 40);
    const hj = hoje();
    const nomes = nomesImoveis(tid);
    const preparadas = [], excecoes = [], faltaDado = [], contatoPessoal = [];

    const modelosAtivos = db.prepare("SELECT DISTINCT chave, gatilho, dias FROM lv_modelos WHERE tenant_id = ? AND ativo = 1 AND gatilho <> 'manual'").all(tid);
    const janelaFim = somaDias(hj, Math.max(1, num(horizonteDias, 7)));
    const reservas = db.prepare(`SELECT * FROM app_reservas WHERE tenant_id = ?
      AND ((checkin >= ? AND checkin <= ?) OR (checkout >= ? AND checkout <= ?))`).all(tid, somaDias(hj, -2), janelaFim, somaDias(hj, -2), janelaFim);

    for (const r of reservas) {
      // 1) a régua sabe o estado da reserva
      if (r.status === 'cancelada') { excecoes.push({ reserva_id: r.id, motivo: 'Reserva cancelada — nada é gerado.' }); continue; }
      const doc = db.prepare('SELECT * FROM lv_reserva_doc WHERE tenant_id = ? AND reserva_id = ?').get(tid, r.id) || {};
      const contato = r.hospede_id ? db.prepare('SELECT * FROM app_hospedes WHERE tenant_id = ? AND id = ?').get(tid, r.hospede_id) : null;
      const idioma = 'pt';
      const ficha = OP.Ficha.obter(tid, r.imovel_id);

      for (const m of modelosAtivos) {
        let alvo = null;
        if (m.gatilho === 'confirmacao') alvo = (r.status === 'confirmada') ? hj : null;
        else if (m.gatilho === 'dias_antes') alvo = somaDias(r.checkin, -Math.abs(num(m.dias, 0)));
        else if (m.gatilho === 'vespera') alvo = somaDias(r.checkin, -1);
        else if (m.gatilho === 'checkout_vespera') alvo = somaDias(r.checkout, -1);
        else if (m.gatilho === 'pos_checkout') alvo = r.checkout;
        if (!alvo || alvo > hj) continue;
        // já passou muito: não ressuscita mensagem velha
        if (dias(alvo, hj) > 3) continue;
        // já preparada antes?
        if (db.prepare('SELECT 1 FROM lv_fila_mensagens WHERE tenant_id = ? AND reserva_id = ? AND modelo = ?').get(tid, r.id, m.chave)) continue;
        // mensagem de chegada não vai para quem já entrou
        if (m.gatilho !== 'pos_checkout' && m.gatilho !== 'checkout_vespera' && r.status === 'concluida') {
          excecoes.push({ reserva_id: r.id, modelo: m.chave, motivo: 'Estadia já concluída — mensagem de pré-estadia não é gerada.' });
          continue;
        }

        const modelo = Modelos.obter(tid, m.chave, idioma);
        if (!modelo) continue;

        // 2) estadia com problema não recebe mensagem automática
        if (m.gatilho === 'pos_checkout') {
          const problema = db.prepare("SELECT COUNT(*) n FROM app_manutencao WHERE tenant_id = ? AND imovel_id = ? AND criado_em >= ? AND criado_em <= ?")
            .get(tid, r.imovel_id, r.checkin + 'T00:00:00.000Z', r.checkout + 'T23:59:59.999Z').n;
          const avalRuim = db.prepare('SELECT COUNT(*) n FROM lv_avaliacoes WHERE tenant_id = ? AND reserva_id = ? AND nota > 0 AND nota <= 3').get(tid, r.id).n;
          if (problema || avalRuim) {
            const id = Regua._gravar(tid, r, m.chave, idioma, '', 'contato_pessoal',
              `A estadia teve ${problema ? problema + ' chamado(s) de manutenção' : 'avaliação baixa'}. Essa conversa é humana (Cap. 34).`, 0, contato);
            contatoPessoal.push({ id, reserva_id: r.id, imovel: nomes[r.imovel_id] || r.imovel_id, hospede: r.hospede_nome });
            continue;
          }
        }

        // 3) cadastro incompleto = FALTA DADO
        if (m.chave === 'd5_chegada' && !ficha.completa) {
          const id = Regua._gravar(tid, r, m.chave, idioma, '', 'falta_dado',
            `Faltam dados do cadastro mestre para escrever a chegada: ${ficha.faltando.join(', ')} (Cap. 31).`, 0, contato);
          faltaDado.push({ id, reserva_id: r.id, imovel: nomes[r.imovel_id] || r.imovel_id, faltando: ficha.faltando });
          continue;
        }

        const texto = Regua.render(modelo.texto, { reserva: r, imovel: nomes[r.imovel_id] || r.imovel_id, ficha, doc, contato });
        const exigeInsercao = texto.includes(S.MARCADOR_ACESSO) ? 1 : 0;
        const id = Regua._gravar(tid, r, m.chave, idioma, texto, 'preparada', '', exigeInsercao, contato);
        preparadas.push({ id, reserva_id: r.id, modelo: m.chave, imovel: nomes[r.imovel_id] || r.imovel_id, hospede: r.hospede_nome, exige_insercao: !!exigeInsercao });
      }
    }
    try { OP.Rotinas.heartbeat(tid, 'regua_mensagens', { status: 'ok' }); } catch (_) {}
    return {
      preparadas, excecoes, falta_dado: faltaDado, contato_pessoal: contatoPessoal,
      nota: 'Nada foi enviado. A fila espera conferência humana — e o dado de acesso continua sendo inserido manualmente, no dia (Caps. 8 e 32).',
    };
  },

  _gravar(tid, r, modelo, idioma, texto, situacao, motivo, exigeInsercao, contato) {
    const id = novoId();
    db.prepare(`INSERT INTO lv_fila_mensagens (id, tenant_id, reserva_id, modelo, idioma, destino, texto, situacao, motivo, exige_insercao, preparada_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id, reserva_id, modelo) DO NOTHING`)
      .run(id, tid, r.id, modelo, idioma, contato ? s(contato.telefone || contato.email, 200) : '', s(texto, 8000), situacao, s(motivo, 600), exigeInsercao, nowISO());
    return id;
  },

  // substituição simples e explícita — sem inventar nada que não esteja no cadastro
  render(texto, ctx) {
    const r = ctx.reserva || {}, f = ctx.ficha || {}, d = ctx.doc || {};
    const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const br = (x) => (x ? String(x).slice(0, 10).split('-').reverse().join('/') : '[data]');
    const mapa = {
      '[nome]': r.hospede_nome || '[nome]', '[name]': r.hospede_nome || '[name]', '[nombre]': r.hospede_nome || '[nombre]', '[nom]': r.hospede_nome || '[nom]',
      '[unidade]': ctx.imovel || '[unidade]', '[unit]': ctx.imovel || '[unit]', '[unidad]': ctx.imovel || '[unidad]', '[logement]': ctx.imovel || '[logement]',
      '[N]': String(r.hospedes_qtd || '[N]'),
      '[datas]': `${br(r.checkin)} a ${br(r.checkout)}`, '[dates]': `${br(r.checkin)}–${br(r.checkout)}`, '[fechas]': `${br(r.checkin)} a ${br(r.checkout)}`,
      '[R$ X]': brl(r.valor_centavos), '[amount]': brl(r.valor_centavos), '[monto]': brl(r.valor_centavos), '[montant]': brl(r.valor_centavos),
      '[R$ Y]': brl(d.sinal_centavos || 0), '[R$ Z]': brl(Math.max(0, (r.valor_centavos || 0) - (d.sinal_centavos || 0))),
      '[titular]': d.titular || r.hospede_nome || '[titular]',
      '[hora]': f.checkin_hora || '[hora]', '[time]': f.checkin_hora || '[time]',
      '[nome da rede]': f.wifi_rede || '[nome da rede]', '[network name]': f.wifi_rede || '[network name]',
      '[onde, quantas vagas, como funciona]': f.estacionamento || '[estacionamento]',
    };
    let out = String(texto || '');
    for (const [k, v] of Object.entries(mapa)) out = out.split(k).join(v);
    return out;
  },

  // aprovar/marcar como enviada é ato humano e fica auditado
  resolver(tenantId, id, situacao, quem) {
    const tid = s(tenantId, 40);
    const m = db.prepare('SELECT * FROM lv_fila_mensagens WHERE tenant_id = ? AND id = ?').get(tid, s(id, 40));
    if (!m) throw new Error('Mensagem não encontrada na fila.');
    const st = ['aprovada', 'enviada', 'descartada'].includes(s(situacao)) ? s(situacao) : null;
    if (!st) throw new Error('Situação inválida.');
    if (st === 'enviada' && m.exige_insercao && !s(quem)) throw new Error('Marque quem enviou: esta mensagem exige inserção manual do dado de acesso.');
    db.prepare('UPDATE lv_fila_mensagens SET situacao = ?, resolvida_em = ?, quem = ? WHERE id = ?').run(st, nowISO(), s(quem, 120), m.id);
    auditar(tid, quem, 'regua.' + st, 'lv_fila_mensagens', m.id, { situacao: m.situacao }, { situacao: st });
    return db.prepare('SELECT * FROM lv_fila_mensagens WHERE id = ?').get(m.id);
  },
};

// =====================================================================
// MANUAL DIGITAL (Cap. 31/33)
// Sai do cadastro mestre, é buscável por assunto e nunca contém acesso.
// =====================================================================
const Manual = {
  listar(tenantId, imovelId) {
    return db.prepare('SELECT * FROM lv_manual WHERE tenant_id = ? AND imovel_id = ? ORDER BY ordem, assunto').all(s(tenantId, 40), s(imovelId, 40));
  },
  salvar(tenantId, d, quem) {
    const tid = s(tenantId, 40), iid = s(d.imovel_id, 40);
    if (!appRepo.Imoveis.obter(tid, iid)) throw new Error('Imóvel não encontrado.');
    if (!s(d.assunto)) throw new Error('Informe o assunto da seção.');
    if (pareceAcesso(d.corpo)) throw new Error('O manual não guarda senha nem código de acesso (Cap. 32). Essa informação é enviada por uma pessoa, no dia da chegada.');
    const id = s(d.id, 40) || novoId();
    const antes = db.prepare('SELECT * FROM lv_manual WHERE tenant_id = ? AND id = ?').get(tid, id) || null;
    if (antes) {
      db.prepare('UPDATE lv_manual SET assunto=?, corpo=?, idioma=?, ordem=?, atualizado_em=? WHERE id=? AND tenant_id=?')
        .run(s(d.assunto, 160), s(d.corpo, 8000), s(d.idioma, 5) || 'pt', num(d.ordem, antes.ordem), nowISO(), id, tid);
    } else {
      db.prepare('INSERT INTO lv_manual (id, tenant_id, imovel_id, assunto, corpo, idioma, ordem, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, tid, iid, s(d.assunto, 160), s(d.corpo, 8000), s(d.idioma, 5) || 'pt', num(d.ordem, 0), nowISO(), nowISO());
    }
    auditar(tid, quem, 'manual.salvar', 'lv_manual', id, antes, null);
    return db.prepare('SELECT * FROM lv_manual WHERE id = ?').get(id);
  },
  remover(tenantId, id, quem) {
    db.prepare('DELETE FROM lv_manual WHERE tenant_id = ? AND id = ?').run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'manual.remover', 'lv_manual', s(id, 40), null, null);
    return { ok: true };
  },
  // link público do manual (sem login, sem dado pessoal, sem acesso)
  link(tenantId, imovelId) {
    const tid = s(tenantId, 40), iid = s(imovelId, 40);
    let t = db.prepare('SELECT * FROM lv_manual_token WHERE tenant_id = ? AND imovel_id = ?').get(tid, iid);
    if (!t) {
      db.prepare('INSERT INTO lv_manual_token (imovel_id, tenant_id, token, criado_em) VALUES (?,?,?,?)').run(iid, tid, token(), nowISO());
      t = db.prepare('SELECT * FROM lv_manual_token WHERE imovel_id = ?').get(iid);
    }
    return { token: t.token, url: `/gestao/manual/${t.token}` };
  },
  regerarLink(tenantId, imovelId, quem) {
    const tid = s(tenantId, 40), iid = s(imovelId, 40);
    db.prepare('INSERT INTO lv_manual_token (imovel_id, tenant_id, token, criado_em) VALUES (?,?,?,?) ON CONFLICT(imovel_id) DO UPDATE SET token=excluded.token, criado_em=excluded.criado_em')
      .run(iid, tid, token(), nowISO());
    auditar(tid, quem, 'manual.regerar_link', 'lv_manual_token', iid, null, null);
    return Manual.link(tid, iid);
  },
  // leitura pública por token — devolve só o que o hóspede pode ver
  publico(tk) {
    const t = db.prepare('SELECT * FROM lv_manual_token WHERE token = ?').get(s(tk, 60));
    if (!t) return null;
    const imovel = appRepo.Imoveis.obter(t.tenant_id, t.imovel_id);
    if (!imovel) return null;
    const f = OP.Ficha.obter(t.tenant_id, t.imovel_id);
    return {
      imovel: imovel.nome,
      checkin_hora: f.checkin_hora, checkout_hora: f.checkout_hora,
      estacionamento: f.estacionamento, wifi_rede: f.wifi_rede, regras: f.regras,
      nao_tem: f.nao_tem,
      secoes: Manual.listar(t.tenant_id, t.imovel_id).map(x => ({ assunto: x.assunto, corpo: x.corpo })),
    };
  },
};

// =====================================================================
// CONCIERGE — triagem (Cap. 33)
// A verificação de escalonamento roda ANTES da tentativa de resposta. Um
// agente que primeiro tenta responder vai, mais cedo ou mais tarde, dar uma
// resposta educada a uma emergência.
// =====================================================================
const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const Concierge = {
  gatilhos(tenantId) { return db.prepare('SELECT * FROM lv_gatilhos WHERE tenant_id = ? ORDER BY categoria, termo').all(s(tenantId, 40)); },
  adicionarGatilho(tenantId, termo, categoria, quem) {
    const t = semAcento(s(termo, 80));
    if (!t) throw new Error('Informe o termo.');
    const id = novoId();
    db.prepare('INSERT INTO lv_gatilhos (id, tenant_id, termo, categoria, criado_em) VALUES (?,?,?,?,?)').run(id, s(tenantId, 40), t, s(categoria, 40) || 'outro', nowISO());
    auditar(tenantId, quem, 'gatilho.criar', 'lv_gatilhos', id, null, { termo: t });
    return { ok: true, id };
  },
  removerGatilho(tenantId, id, quem) {
    db.prepare('DELETE FROM lv_gatilhos WHERE tenant_id = ? AND id = ?').run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'gatilho.remover', 'lv_gatilhos', s(id, 40), null, null);
    return { ok: true };
  },
  plantao(tenantId) { return db.prepare('SELECT * FROM lv_plantao WHERE tenant_id = ? ORDER BY faixa').all(s(tenantId, 40)); },
  salvarPlantao(tenantId, d, quem) {
    const id = s(d.id, 40) || novoId();
    if (!s(d.faixa)) throw new Error('Informe a faixa de horário (ex.: 08:00-20:00).');
    db.prepare(`INSERT INTO lv_plantao (id, tenant_id, faixa, responsavel, contato, criado_em) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET faixa=excluded.faixa, responsavel=excluded.responsavel, contato=excluded.contato`)
      .run(id, s(tenantId, 40), s(d.faixa, 40), s(d.responsavel, 120), s(d.contato, 200), nowISO());
    auditar(tenantId, quem, 'plantao.salvar', 'lv_plantao', id, null, null);
    return db.prepare('SELECT * FROM lv_plantao WHERE id = ?').get(id);
  },
  removerPlantao(tenantId, id, quem) {
    db.prepare('DELETE FROM lv_plantao WHERE tenant_id = ? AND id = ?').run(s(tenantId, 40), s(id, 40));
    auditar(tenantId, quem, 'plantao.remover', 'lv_plantao', s(id, 40), null, null);
    return { ok: true };
  },

  // A triagem é determinística de propósito: a fronteira entre INFORMAÇÃO e
  // SITUAÇÃO é uma lista, não um julgamento.
  triar(tenantId, { mensagem = '', reserva_id = '' } = {}) {
    const tid = s(tenantId, 40);
    const texto = semAcento(mensagem);
    if (!texto) throw new Error('Informe a mensagem do hóspede.');
    const gats = Concierge.gatilhos(tid);
    const achados = gats.filter(g => texto.includes(semAcento(g.termo)));

    let resultado;
    if (achados.length) {
      const cats = [...new Set(achados.map(g => g.categoria))];
      const plantao = Concierge.plantao(tid);
      resultado = {
        decisao: 'escalonar',
        motivo: `Gatilho de escalonamento: ${achados.map(g => g.termo).join(', ')} (${cats.join(', ')}).`,
        categorias: cats,
        resumo: `Hóspede escreveu sobre ${cats.join('/')}. Mensagem: "${s(mensagem, 300)}"`,
        plantao,
        // Cap. 33: escalonar para ninguém não é escalonar
        alerta_plantao: plantao.length ? '' : 'Não há plantão definido. Escalonar para ninguém não é escalonar (Cap. 33).',
        resposta: '',
        fonte: '',
      };
    } else {
      // busca a resposta APENAS nas fontes autorizadas (manual da unidade)
      const reserva = reserva_id ? db.prepare('SELECT * FROM app_reservas WHERE tenant_id = ? AND id = ?').get(tid, s(reserva_id, 40)) : null;
      const secoes = reserva ? Manual.listar(tid, reserva.imovel_id) : [];
      const palavras = texto.split(/[^a-z0-9]+/).filter(w => w.length > 3);
      let melhor = null, melhorPontos = 0;
      for (const sec of secoes) {
        const alvo = semAcento(sec.assunto + ' ' + sec.corpo);
        const pontos = palavras.reduce((a, w) => a + (alvo.includes(w) ? 1 : 0), 0);
        if (pontos > melhorPontos) { melhorPontos = pontos; melhor = sec; }
      }
      resultado = melhor && melhorPontos >= 2
        ? { decisao: 'responder', motivo: 'Dúvida informacional respondida pelo manual da unidade.', categorias: [], resumo: '', plantao: [], alerta_plantao: '', resposta: melhor.corpo, fonte: melhor.assunto }
        : { decisao: 'sem_fonte', motivo: 'A resposta não está nas fontes autorizadas. Diga que vai confirmar e escale (Cap. 33).', categorias: [], resumo: s(mensagem, 300), plantao: Concierge.plantao(tid), alerta_plantao: '', resposta: '', fonte: '' };
    }

    // toda conversa fica registrada, com a fonte de cada resposta
    const id = novoId();
    db.prepare('INSERT INTO lv_triagens (id, tenant_id, reserva_id, mensagem, decisao, motivo, fonte, resposta, quando) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, tid, s(reserva_id, 40), s(mensagem, 2000), resultado.decisao, s(resultado.motivo, 600), s(resultado.fonte, 200), s(resultado.resposta, 4000), nowISO());
    return { id, ...resultado, sempre_oferecer_pessoa: 'Se preferir falar com alguém agora, é só dizer "atendimento".' };
  },

  triagens(tenantId, limite = 100) {
    return db.prepare('SELECT * FROM lv_triagens WHERE tenant_id = ? ORDER BY quando DESC LIMIT ?').all(s(tenantId, 40), Math.min(500, num(limite, 100)));
  },
  // Cap. 33: as dúvidas recorrentes alimentam o manual
  assuntosMaisPerguntados(tenantId) {
    const rs = db.prepare("SELECT mensagem FROM lv_triagens WHERE tenant_id = ? AND decisao = 'sem_fonte' ORDER BY quando DESC LIMIT 300").all(s(tenantId, 40));
    const cont = {};
    for (const r of rs) {
      for (const w of semAcento(r.mensagem).split(/[^a-z0-9]+/).filter(x => x.length > 4)) cont[w] = (cont[w] || 0) + 1;
    }
    return Object.entries(cont).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([termo, n]) => ({ termo, ocorrencias: n, acao: 'Sem fonte no manual — candidato a virar seção.' }));
  },
};

// =====================================================================
// REPUTAÇÃO (Cap. 29)
// Uma crítica é opinião. Três sobre a mesma coisa são um relatório de
// manutenção recebido de graça. Agrupa, classifica, ordena por impacto e
// FECHA O CICLO — com AMOSTRA INSUFICIENTE quando o volume não permite.
// =====================================================================
const CLASSES_AVAL = ['fisico', 'processo', 'expectativa'];
const Reputacao = {
  listar(tenantId, { imovel_id = '', limite = 200 } = {}) {
    const tid = s(tenantId, 40);
    const args = [tid];
    let sql = 'SELECT * FROM lv_avaliacoes WHERE tenant_id = ?';
    if (imovel_id) { sql += ' AND imovel_id = ?'; args.push(s(imovel_id, 40)); }
    args.push(Math.min(1000, num(limite, 200)));
    const nomes = nomesImoveis(tid);
    return db.prepare(sql + ' ORDER BY data DESC LIMIT ?').all(...args)
      .map(a => ({ ...a, assuntos: j.parse(a.assuntos, []), imovel: nomes[a.imovel_id] || '' }));
  },
  registrar(tenantId, d, quem) {
    const tid = s(tenantId, 40);
    const nota = Math.max(0, Math.min(5, num(d.nota, 0)));
    const assuntos = (Array.isArray(d.assuntos) ? d.assuntos : []).slice(0, 20).map(a => ({
      assunto: s(a.assunto, 80).toLowerCase(), classe: CLASSES_AVAL.includes(s(a.classe)) ? s(a.classe) : 'fisico',
    })).filter(a => a.assunto);
    const id = s(d.id, 40) || novoId();
    const antes = db.prepare('SELECT * FROM lv_avaliacoes WHERE tenant_id = ? AND id = ?').get(tid, id) || null;
    if (antes) {
      db.prepare('UPDATE lv_avaliacoes SET imovel_id=?, reserva_id=?, canal=?, nota=?, texto=?, data=?, assuntos=? WHERE id=? AND tenant_id=?')
        .run(s(d.imovel_id, 40), s(d.reserva_id, 40), s(d.canal, 40) || 'direto', nota, s(d.texto, 4000), dia(d.data) || antes.data, j.str(assuntos.length ? assuntos : j.parse(antes.assuntos, [])), id, tid);
    } else {
      db.prepare('INSERT INTO lv_avaliacoes (id, tenant_id, imovel_id, reserva_id, canal, nota, texto, data, assuntos, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id, tid, s(d.imovel_id, 40), s(d.reserva_id, 40), s(d.canal, 40) || 'direto', nota, s(d.texto, 4000), dia(d.data) || hoje(), j.str(assuntos), nowISO());
    }
    auditar(tid, quem, 'avaliacao.registrar', 'lv_avaliacoes', id, antes, null);
    return db.prepare('SELECT * FROM lv_avaliacoes WHERE id = ?').get(id);
  },
  responder(tenantId, id, resposta, quem) {
    const tid = s(tenantId, 40);
    if (!s(resposta)) throw new Error('Escreva a resposta.');
    db.prepare('UPDATE lv_avaliacoes SET resposta = ?, respondida_em = ? WHERE tenant_id = ? AND id = ?').run(s(resposta, 4000), nowISO(), tid, s(id, 40));
    auditar(tid, quem, 'avaliacao.responder', 'lv_avaliacoes', s(id, 40), null, null);
    // publicar a resposta continua sendo ato humano no canal: aqui só guardamos
    return db.prepare('SELECT * FROM lv_avaliacoes WHERE id = ?').get(s(id, 40));
  },

  // diagnóstico: agrupa por assunto, classifica, ordena por IMPACTO
  // (menções × queda de nota nas avaliações que citam o assunto)
  diagnostico(tenantId, { meses = 12 } = {}) {
    const tid = s(tenantId, 40);
    const corte = somaDias(hoje(), -Math.max(1, num(meses, 12)) * 30);
    const avals = Reputacao.listar(tid, { limite: 1000 }).filter(a => a.data >= corte);
    const comNota = avals.filter(a => a.nota > 0);
    const media = comNota.length ? comNota.reduce((x, a) => x + a.nota, 0) / comNota.length : 0;

    const porAssunto = {};
    for (const a of avals) {
      for (const s1 of a.assuntos) {
        const k = s1.assunto;
        porAssunto[k] = porAssunto[k] || { assunto: k, classe: s1.classe, mencoes: 0, notas: [] };
        porAssunto[k].mencoes++;
        if (a.nota > 0) porAssunto[k].notas.push(a.nota);
      }
    }
    const itens = Object.values(porAssunto).map(x => {
      const m = x.notas.length ? x.notas.reduce((a, b) => a + b, 0) / x.notas.length : media;
      const queda = Math.max(0, media - m);
      return { assunto: x.assunto, classe: x.classe, mencoes: x.mencoes, nota_media_quando_citado: Number(m.toFixed(2)), queda: Number(queda.toFixed(2)), impacto: Number((x.mencoes * queda).toFixed(2)) };
    }).sort((a, b) => b.impacto - a.impacto);

    return {
      periodo_meses: num(meses, 12), avaliacoes: avals.length, nota_media: Number(media.toFixed(2)),
      itens,
      // a categoria mais barata: resolve no anúncio, sem consertar nada
      expectativa: itens.filter(i => i.classe === 'expectativa'),
      fisico: itens.filter(i => i.classe === 'fisico'),
      processo: itens.filter(i => i.classe === 'processo'),
      nota: 'Ordenado por impacto = menções × queda de nota. Comece por "expectativa": resolve no anúncio, sem gastar nada (Cap. 29).',
    };
  },

  correcoes(tenantId) { return db.prepare('SELECT * FROM lv_correcoes WHERE tenant_id = ? ORDER BY criado_em DESC').all(s(tenantId, 40)); },
  registrarCorrecao(tenantId, d, quem) {
    const id = novoId();
    if (!s(d.assunto)) throw new Error('Informe o assunto corrigido.');
    db.prepare('INSERT INTO lv_correcoes (id, tenant_id, assunto, classe, imovel_id, corrigido_em, responsavel, obs, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, s(tenantId, 40), s(d.assunto, 80).toLowerCase(), CLASSES_AVAL.includes(s(d.classe)) ? s(d.classe) : 'fisico', s(d.imovel_id, 40), dia(d.corrigido_em) || hoje(), s(d.responsavel, 120), s(d.obs, 1000), nowISO());
    auditar(tenantId, quem, 'correcao.registrar', 'lv_correcoes', id, null, { assunto: s(d.assunto, 80) });
    return db.prepare('SELECT * FROM lv_correcoes WHERE id = ?').get(id);
  },

  // o ciclo do Cap. 29: a correção surtiu efeito? AMOSTRA INSUFICIENTE é
  // resposta legítima — comemorar correção com três estadias é erro comum.
  ciclo(tenantId) {
    const tid = s(tenantId, 40);
    const corrs = Reputacao.correcoes(tid);
    const avals = Reputacao.listar(tid, { limite: 1000 });
    return corrs.map(c => {
      const antes = avals.filter(a => a.data < c.corrigido_em && a.assuntos.some(x => x.assunto === c.assunto));
      const depoisTodas = avals.filter(a => a.data >= c.corrigido_em);
      const depois = depoisTodas.filter(a => a.assuntos.some(x => x.assunto === c.assunto));
      let status;
      if (depoisTodas.length < 5) status = 'AMOSTRA INSUFICIENTE';
      else if (depois.length === 0) status = 'RESOLVIDO';
      else status = 'PERSISTENTE';
      return {
        assunto: c.assunto, classe: c.classe, corrigido_em: c.corrigido_em,
        mencoes_antes: antes.length, mencoes_depois: depois.length,
        estadias_avaliadas_depois: depoisTodas.length, status,
        observacao: status === 'AMOSTRA INSUFICIENTE' ? 'Poucas avaliações após a correção para concluir qualquer coisa.' : '',
      };
    });
  },
};

module.exports = { Modelos, Regua, Manual, Concierge, Reputacao, IDIOMAS, CLASSES_AVAL };
