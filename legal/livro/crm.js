// =====================================================================
// ONDA LIVRO · 47.1 CRM JURÍDICO (Cap. 15 triagem · 16 funil · 17 conflitos)
// Travas do livro: proposta NÃO sai sem aprovação humana (47.1) e caso não
// abre sem conflito de interesses pesquisado e liberado (17.1).
// =====================================================================
'use strict';
const B = require('../repo-livro');
const { EL, s, cent, int, bool, valida, hoje, patch, um, todos, novoId, nowISO, j, db } = B;

// ---------------------------------------------------------------- LEADS
const Leads = {
  listar({ estagio = '', responsavel = '', busca = '', area = '', limite = 200 } = {}) {
    let sql = 'SELECT * FROM crm_leads', w = [], a = [];
    if (estagio) { w.push('estagio = ?'); a.push(estagio); }
    if (responsavel) { w.push('responsavel_id = ?'); a.push(responsavel); }
    if (area) { w.push('area = ?'); a.push(area); }
    if (busca) { w.push('(nome LIKE ? OR email LIKE ? OR telefone LIKE ?)'); const b = `%${busca}%`; a.push(b, b, b); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY criado_em DESC LIMIT ?'; a.push(Math.min(int(limite, 200), 500));
    return todos(sql, ...a);
  },
  obter(id) {
    const l = um('SELECT * FROM crm_leads WHERE id = ?', id);
    if (!l) return null;
    l.interacoes = todos('SELECT * FROM crm_interactions WHERE lead_id = ? ORDER BY quando DESC', id);
    l.propostas = todos('SELECT * FROM crm_proposals WHERE lead_id = ? ORDER BY criado_em DESC', id);
    l.conflitos = todos('SELECT * FROM conflict_checks WHERE lead_id = ? ORDER BY criado_em DESC', id);
    l.kyc = um('SELECT * FROM kyc_checks WHERE lead_id = ? ORDER BY criado_em DESC LIMIT 1', id) || null;
    return l;
  },
  // 15.7 classificação de oportunidade: pontuação transparente (nunca "caixa preta").
  // Só ordena a fila de atendimento — não decide contratação nem antecipa parecer.
  score(d) {
    let n = 40;
    if (d.urgencia === 'imediata') n += 20; else if (d.urgencia === 'alta') n += 12;
    if (s(d.risco_prescricao)) n += 10;
    if (d.origem === 'indicacao' || d.origem === 'cliente') n += 15;
    else if (d.origem === 'conteudo') n += 8;
    if (s(d.documento)) n += 5;
    if (s(d.email) && s(d.telefone)) n += 5;
    if (s(d.resumo_fato).length > 120) n += 5;
    return Math.max(0, Math.min(100, n));
  },
  // 15.9 prevenção contra spam/fraude: sinais objetivos, decisão fica humana.
  spam(d) {
    let n = 0;
    const t = (s(d.resumo_fato) + ' ' + s(d.nome)).toLowerCase();
    if (!s(d.email) && !s(d.telefone)) n += 40;
    if (s(d.resumo_fato).length < 15) n += 25;
    if (/https?:\/\//.test(t)) n += 15;
    if (/(bitcoin|crypto|investimento garantido|seo|marketing digital|proposta comercial)/.test(t)) n += 30;
    if (/(.)\1{6,}/.test(t)) n += 15;
    if (s(d.nome).length < 3) n += 20;
    return Math.max(0, Math.min(100, n));
  },
  criar(d = {}, quem) {
    const agora = nowISO();
    const dados = {
      origem: valida(d.origem, EL.origemLead, 'origem'),
      urgencia: valida(d.urgencia, EL.urgencia, 'urgencia'),
      pode_atender: valida(d.pode_atender, EL.podeAtender, 'pode_atender'),
      estagio: valida(d.estagio, EL.estagioLead, 'estagio'),
    };
    const base = { ...d, ...dados };
    const id = novoId();
    db.prepare(`INSERT INTO crm_leads (id, nome, email, telefone, documento, origem, area, resumo_fato,
      urgencia, risco_prescricao, competencia, pode_atender, motivo_recusa, score, spam_score, estagio,
      responsavel_id, client_id, case_id, motivo_desfecho, primeira_resposta_em, conflito_ok, observacoes,
      criado_em, atualizado_em, fechado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'')`)
      .run(id, s(d.nome, 200), s(d.email, 160), s(d.telefone, 40), s(d.documento, 20), dados.origem,
        s(d.area, 60), s(d.resumo_fato, 4000), dados.urgencia, s(d.risco_prescricao, 400), s(d.competencia, 200),
        dados.pode_atender, s(d.motivo_recusa, 400), Leads.score(base), Leads.spam(base), dados.estagio,
        s(d.responsavel_id, 40), s(d.client_id, 40), s(d.case_id, 40), s(d.motivo_desfecho, 300),
        s(d.primeira_resposta_em, 40), bool(d.conflito_ok), s(d.observacoes, 2000), agora, agora);
    if (quem) Leads.interagir(id, { canal: 'outro', direcao: 'entrada', resumo: 'Lead registrado no funil.' }, quem);
    return Leads.obter(id);
  },
  atualizar(id, d = {}) {
    const atual = um('SELECT * FROM crm_leads WHERE id = ?', id);
    if (!atual) throw new Error('Lead não encontrado.');
    const c = {};
    if (d.nome !== undefined) c.nome = s(d.nome, 200);
    if (d.email !== undefined) c.email = s(d.email, 160);
    if (d.telefone !== undefined) c.telefone = s(d.telefone, 40);
    if (d.documento !== undefined) c.documento = s(d.documento, 20);
    if (d.origem !== undefined) c.origem = valida(d.origem, EL.origemLead, 'origem');
    if (d.area !== undefined) c.area = s(d.area, 60);
    if (d.resumo_fato !== undefined) c.resumo_fato = s(d.resumo_fato, 4000);
    if (d.urgencia !== undefined) c.urgencia = valida(d.urgencia, EL.urgencia, 'urgencia');
    if (d.risco_prescricao !== undefined) c.risco_prescricao = s(d.risco_prescricao, 400);
    if (d.competencia !== undefined) c.competencia = s(d.competencia, 200);
    if (d.pode_atender !== undefined) c.pode_atender = valida(d.pode_atender, EL.podeAtender, 'pode_atender');
    if (d.motivo_recusa !== undefined) c.motivo_recusa = s(d.motivo_recusa, 400);
    if (d.responsavel_id !== undefined) c.responsavel_id = s(d.responsavel_id, 40);
    if (d.motivo_desfecho !== undefined) c.motivo_desfecho = s(d.motivo_desfecho, 300);
    if (d.observacoes !== undefined) c.observacoes = s(d.observacoes, 2000);
    if (d.estagio !== undefined) {
      c.estagio = valida(d.estagio, EL.estagioLead, 'estagio');
      // 17.1: não se abre caso sem conflito liberado — a trava vale na conversão.
      if (c.estagio === 'contratado' && !atual.conflito_ok) {
        throw new Error('Pesquisa de conflito de interesses pendente (Cap. 17.1). Registre o veredito "livre" antes de marcar como contratado.');
      }
      if (['contratado', 'perdido', 'descartado'].includes(c.estagio)) c.fechado_em = nowISO();
    }
    // recalcula o score com o estado resultante
    const novo = { ...atual, ...c };
    c.score = Leads.score(novo); c.spam_score = Leads.spam(novo);
    patch('crm_leads', id, c);
    return Leads.obter(id);
  },
  interagir(id, d = {}, quem) {
    const iid = novoId();
    db.prepare('INSERT INTO crm_interactions (id, lead_id, client_id, canal, direcao, resumo, quem, quando) VALUES (?,?,?,?,?,?,?,?)')
      .run(iid, s(id, 40), s(d.client_id, 40), valida(d.canal, EL.canalInter, 'canal'),
        valida(d.direcao, EL.direcao, 'direcao'), s(d.resumo, 2000), s(quem, 120), nowISO());
    // 16.10/40.7 tempo de resposta: marca a 1ª saída do escritório
    if (d.direcao === 'saida') {
      const l = um('SELECT primeira_resposta_em FROM crm_leads WHERE id = ?', id);
      if (l && !l.primeira_resposta_em) patch('crm_leads', id, { primeira_resposta_em: nowISO() });
    }
    return iid;
  },
  // 17.10 abertura formal do caso: lead → cliente (+ caso opcional).
  // NÃO cria o cliente aqui (isso é do repo.Clientes); só vincula e move o funil.
  vincular(id, { client_id, case_id } = {}) {
    const l = um('SELECT * FROM crm_leads WHERE id = ?', id);
    if (!l) throw new Error('Lead não encontrado.');
    if (!l.conflito_ok) throw new Error('Conflito de interesses não liberado (Cap. 17.1) — não é possível abrir o caso.');
    patch('crm_leads', id, {
      client_id: s(client_id, 40) || l.client_id, case_id: s(case_id, 40) || l.case_id,
      estagio: 'contratado', fechado_em: nowISO(),
    });
    return Leads.obter(id);
  },
};

// ------------------------------------------------------------ PROPOSTAS
// 47.1: "Aprovação humana: envio de proposta e qualquer mensagem com
// conteúdo jurídico." A proposta nasce rascunho; só sai depois de aprovada.
const Propostas = {
  criar(lead_id, d = {}, quem) {
    if (!um('SELECT id FROM crm_leads WHERE id = ?', lead_id)) throw new Error('Lead não encontrado.');
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO crm_proposals (id, lead_id, escopo, fora_escopo, modalidade, valor_centavos,
      percentual_exito, parcelas, validade, texto, status, criado_por, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,'rascunho',?,?,?)`)
      .run(id, lead_id, s(d.escopo, 4000), s(d.fora_escopo, 2000), valida(d.modalidade, EL.modalidadeHon, 'modalidade'),
        cent(d.valor_centavos), Number(d.percentual_exito || 0), Math.max(1, int(d.parcelas, 1)),
        s(d.validade, 20), s(d.texto, 20000), s(quem, 120), agora, agora);
    patch('crm_leads', lead_id, { estagio: 'proposta' });
    return um('SELECT * FROM crm_proposals WHERE id = ?', id);
  },
  atualizar(id, d = {}) {
    const p = um('SELECT * FROM crm_proposals WHERE id = ?', id);
    if (!p) throw new Error('Proposta não encontrada.');
    if (['enviada', 'aceita', 'recusada'].includes(p.status) && d.status === undefined) {
      throw new Error('Proposta já enviada — registre o desfecho em vez de editar o conteúdo.');
    }
    const c = {};
    for (const k of ['escopo', 'fora_escopo', 'texto', 'validade']) if (d[k] !== undefined) c[k] = s(d[k], 20000);
    if (d.modalidade !== undefined) c.modalidade = valida(d.modalidade, EL.modalidadeHon, 'modalidade');
    if (d.valor_centavos !== undefined) c.valor_centavos = cent(d.valor_centavos);
    if (d.percentual_exito !== undefined) c.percentual_exito = Number(d.percentual_exito || 0);
    if (d.parcelas !== undefined) c.parcelas = Math.max(1, int(d.parcelas, 1));
    // conteúdo alterado invalida a aprovação anterior (não se aprova texto em branco)
    if (Object.keys(c).length && p.status === 'aprovada') { c.status = 'rascunho'; c.aprovada_por = ''; c.aprovada_em = ''; }
    patch('crm_proposals', id, c);
    return um('SELECT * FROM crm_proposals WHERE id = ?', id);
  },
  aprovar(id, quem) {
    const p = um('SELECT * FROM crm_proposals WHERE id = ?', id);
    if (!p) throw new Error('Proposta não encontrada.');
    if (p.status !== 'rascunho') throw new Error('Só proposta em rascunho pode ser aprovada.');
    if (!s(p.texto) && !s(p.escopo)) throw new Error('Proposta sem escopo/texto — nada a aprovar.');
    patch('crm_proposals', id, { status: 'aprovada', aprovada_por: s(quem, 120), aprovada_em: nowISO() });
    return um('SELECT * FROM crm_proposals WHERE id = ?', id);
  },
  // marcar como enviada: exige aprovação humana registrada (trava do 47.1)
  marcarEnviada(id, quem) {
    const p = um('SELECT * FROM crm_proposals WHERE id = ?', id);
    if (!p) throw new Error('Proposta não encontrada.');
    if (p.status !== 'aprovada' || !s(p.aprovada_por)) {
      throw new Error('Proposta exige aprovação humana antes do envio (Cap. 47.1).');
    }
    patch('crm_proposals', id, { status: 'enviada', enviada_em: nowISO() });
    Leads.interagir(p.lead_id, { canal: 'email', direcao: 'saida', resumo: 'Proposta de honorários enviada.' }, quem);
    return um('SELECT * FROM crm_proposals WHERE id = ?', id);
  },
  desfecho(id, { status, motivo } = {}) {
    const p = um('SELECT * FROM crm_proposals WHERE id = ?', id);
    if (!p) throw new Error('Proposta não encontrada.');
    const st = valida(status, EL.statusProposta, 'status');
    if (!['aceita', 'recusada', 'expirada'].includes(st)) throw new Error('Desfecho deve ser aceita, recusada ou expirada.');
    patch('crm_proposals', id, { status: st, respondida_em: nowISO() });
    // 16.7 motivo de contratação/perda fica no lead (é lá que o funil lê)
    patch('crm_leads', p.lead_id, {
      motivo_desfecho: s(motivo, 300),
      estagio: st === 'aceita' ? 'proposta' : 'perdido',
      fechado_em: st === 'aceita' ? '' : nowISO(),
    });
    return um('SELECT * FROM crm_proposals WHERE id = ?', id);
  },
};

// ------------------------------------------------- CONFLITO DE INTERESSES
// 17.1/17.2: varre clientes, partes de processos e leads pelo termo. O
// VEREDITO é humano — o sistema só entrega os cruzamentos encontrados.
const Conflitos = {
  pesquisar(termo) {
    const t = s(termo, 200);
    if (t.length < 3) throw new Error('Informe ao menos 3 caracteres para a pesquisa de conflito.');
    const like = `%${t}%`;
    const res = [];
    for (const c of todos('SELECT id, nome, cpf_cnpj, tipo_cliente FROM clients WHERE nome LIKE ? OR cpf_cnpj LIKE ? LIMIT 50', like, like)) {
      res.push({ tipo: 'cliente', id: c.id, nome: c.nome, papel: c.tipo_cliente, detalhe: 'cadastro de cliente' });
    }
    for (const p of todos(`SELECT p.id, p.nome, p.tipo, p.polo, p.case_id, c.numero_cnj FROM case_parties p
        LEFT JOIN cases c ON c.id = p.case_id WHERE p.nome LIKE ? OR p.doc LIKE ? LIMIT 50`, like, like)) {
      res.push({ tipo: 'parte', id: p.id, nome: p.nome, papel: p.tipo || p.polo, detalhe: 'processo ' + (p.numero_cnj || p.case_id || '') });
    }
    for (const l of todos('SELECT id, nome, estagio FROM crm_leads WHERE nome LIKE ? OR documento LIKE ? LIMIT 50', like, like)) {
      res.push({ tipo: 'lead', id: l.id, nome: l.nome, papel: l.estagio, detalhe: 'lead no funil' });
    }
    return { termo: t, resultados: res, sugestao: res.some(r => r.tipo === 'parte') ? 'impedido' : (res.length ? 'atencao' : 'livre') };
  },
  registrar(d = {}, quem) {
    const { termo, resultados } = Conflitos.pesquisar(d.termo);
    const veredito = valida(d.veredito, EL.veredito, 'veredito');
    const id = novoId();
    db.prepare(`INSERT INTO conflict_checks (id, termo, lead_id, client_id, resultados, veredito, justificativa, decidido_por, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, termo, s(d.lead_id, 40), s(d.client_id, 40), j.str(d.resultados || resultados),
        veredito, s(d.justificativa, 2000), s(quem, 120), nowISO());
    if (d.lead_id) patch('crm_leads', d.lead_id, { conflito_ok: veredito === 'livre' ? 1 : 0 });
    return um('SELECT * FROM conflict_checks WHERE id = ?', id);
  },
  listar({ n = 100 } = {}) { return todos('SELECT * FROM conflict_checks ORDER BY criado_em DESC LIMIT ?', Math.min(int(n, 100), 300)); },
};

// ------------------------------------------------------------------- KYC
// 17.3/17.4 identificação do cliente, procuração e validação documental.
const KYC = {
  salvar(d = {}, quem) {
    const existente = d.id ? um('SELECT * FROM kyc_checks WHERE id = ?', d.id) : null;
    const agora = nowISO();
    const itens = j.str((Array.isArray(d.itens) ? d.itens : []).map(i => ({
      item: s(i.item, 200), situacao: s(i.situacao, 40) || 'pendente', observacao: s(i.observacao, 400),
    })));
    if (existente) {
      patch('kyc_checks', d.id, {
        itens, documento_ok: bool(d.documento_ok), procuracao_ok: bool(d.procuracao_ok),
        representacao: s(d.representacao, 1000), pendencias: s(d.pendencias, 1000), concluido_por: s(quem, 120),
      });
      return um('SELECT * FROM kyc_checks WHERE id = ?', d.id);
    }
    const id = novoId();
    db.prepare(`INSERT INTO kyc_checks (id, client_id, lead_id, itens, documento_ok, procuracao_ok,
      representacao, pendencias, concluido_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, s(d.client_id, 40), s(d.lead_id, 40), itens, bool(d.documento_ok), bool(d.procuracao_ok),
        s(d.representacao, 1000), s(d.pendencias, 1000), s(quem, 120), agora, agora);
    return um('SELECT * FROM kyc_checks WHERE id = ?', id);
  },
  de({ client_id, lead_id } = {}) {
    if (client_id) return todos('SELECT * FROM kyc_checks WHERE client_id = ? ORDER BY criado_em DESC', client_id);
    if (lead_id) return todos('SELECT * FROM kyc_checks WHERE lead_id = ? ORDER BY criado_em DESC', lead_id);
    return todos('SELECT * FROM kyc_checks ORDER BY criado_em DESC LIMIT 100');
  },
};

// ------------------------------------------------------- FUNIL / MÉTRICAS
// 16.1 painel do funil · 16.10 indicadores de conversão e tempo de resposta
const Funil = {
  painel({ dias = 90 } = {}) {
    const desde = B.maisDias(-Math.abs(int(dias, 90)));
    const porEstagio = {};
    for (const e of EL.estagioLead) porEstagio[e] = 0;
    for (const r of todos('SELECT estagio, COUNT(*) n FROM crm_leads GROUP BY estagio')) porEstagio[r.estagio] = r.n;
    const noPeriodo = todos('SELECT * FROM crm_leads WHERE criado_em >= ?', desde);
    const contratados = noPeriodo.filter(l => l.estagio === 'contratado').length;
    const perdidos = noPeriodo.filter(l => ['perdido', 'descartado'].includes(l.estagio)).length;
    // tempo médio até a 1ª resposta (horas) — 40.7
    const respondidos = noPeriodo.filter(l => l.primeira_resposta_em);
    const horas = respondidos.length
      ? respondidos.reduce((acc, l) => acc + (new Date(l.primeira_resposta_em) - new Date(l.criado_em)) / 36e5, 0) / respondidos.length
      : 0;
    const porOrigem = todos('SELECT origem, COUNT(*) n, SUM(CASE WHEN estagio = \'contratado\' THEN 1 ELSE 0 END) ganhos FROM crm_leads WHERE criado_em >= ? GROUP BY origem', desde);
    // 16.7 motivos de perda mais frequentes no período
    const motivos = todos(`SELECT motivo_desfecho m, COUNT(*) n FROM crm_leads
      WHERE estagio IN ('perdido','descartado') AND motivo_desfecho != '' AND criado_em >= ?
      GROUP BY motivo_desfecho ORDER BY n DESC LIMIT 10`, desde);
    return {
      periodo_dias: Math.abs(int(dias, 90)), por_estagio: porEstagio,
      novos: noPeriodo.length, contratados, perdidos,
      conversao_pct: noPeriodo.length ? Math.round((contratados / noPeriodo.length) * 1000) / 10 : 0,
      horas_primeira_resposta: Math.round(horas * 10) / 10,
      sem_resposta: noPeriodo.filter(l => !l.primeira_resposta_em && !['perdido', 'descartado'].includes(l.estagio)).length,
      por_origem: porOrigem, motivos_perda: motivos,
      propostas: {
        rascunho: um("SELECT COUNT(*) n FROM crm_proposals WHERE status = 'rascunho'").n,
        aguardando_aprovacao: um("SELECT COUNT(*) n FROM crm_proposals WHERE status = 'rascunho'").n,
        enviadas: um("SELECT COUNT(*) n FROM crm_proposals WHERE status = 'enviada'").n,
        aceitas: um("SELECT COUNT(*) n FROM crm_proposals WHERE status = 'aceita'").n,
      },
      conflitos_pendentes: um("SELECT COUNT(*) n FROM crm_leads WHERE conflito_ok = 0 AND estagio IN ('qualificado','proposta')").n,
    };
  },
};

module.exports = { Leads, Propostas, Conflitos, KYC, Funil };
