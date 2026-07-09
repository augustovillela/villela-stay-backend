// =====================================================================
// Villela CRM — MOTOR DO CRM por tenant (o app que o assinante usa).
// Tudo escopado por tenant_id (isolamento lógico, padrão vdocs/vsm).
//
// Aqui moram: provisionamento (funis/templates seed), contatos (ficha
// completa + dedupe + procedência UTM), empresas, oportunidades (kanban),
// timeline, tarefas/follow-ups, lead scoring, templates com variáveis,
// propostas (link público), campanhas segmentadas, automações (regras),
// agentes (motor de regras v1, LLM plugável) e o dashboard comercial.
// =====================================================================
'use strict';
const { db, transacao, nowISO, hojeISO, novoId, j } = require('./db');
const crypto = require('crypto');

const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const cent = (v) => Math.round(Number(v || 0));
const T = (v) => s(v, 40);

// telefone → E.164-ish (só dígitos; BR ganha 55 na frente quando faltar)
function normTelefone(t) {
  let d = String(t == null ? '' : t).replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d; // DDD + número local BR
  return d.slice(0, 15);
}

const TIPOS_CONTATO = ['lead', 'lead-hospedagem', 'lead-evento', 'hospede', 'cliente-recorrente', 'proprietario', 'parceiro',
  'fornecedor', 'aluno', 'comprador-livro', 'cliente-juridico', 'lead-b2b', 'assinante-saas', 'empresa', 'outro'];
const ORIGENS = ['site', 'landing', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'google-ads', 'meta-ads', 'indicacao',
  'airbnb', 'booking', 'decolar', 'google-business', 'email', 'ligacao', 'qrcode', 'evento', 'campanha', 'importacao',
  'busca-ativa', 'agente-ia', 'api', 'formulario-externo', 'outro'];

// =====================================================================
// PROVISIONAMENTO — cria config, funis padrão e templates seed do tenant
// =====================================================================
const FUNIS_SEED = [
  { slug: 'geral', nome: 'Funil geral', padrao: 1, estagios: [
    ['Novo lead', 'aberto'], ['Tentando contato', 'aberto'], ['Contato realizado', 'aberto'], ['Qualificação', 'aberto'],
    ['Proposta enviada', 'aberto'], ['Negociação', 'aberto'], ['Aguardando pagamento', 'aberto'],
    ['Fechado / ganho', 'ganho'], ['Perdido', 'perdido'], ['Pós-venda', 'ganho'], ['Reativação futura', 'aberto']] },
  { slug: 'hospedagem', nome: 'Hospedagem', padrao: 0, estagios: [
    ['Novo interessado', 'aberto'], ['Coleta de datas', 'aberto'], ['Disponibilidade', 'aberto'], ['Orçamento enviado', 'aberto'],
    ['Negociação', 'aberto'], ['Reserva pendente', 'aberto'], ['Reserva confirmada', 'ganho'], ['Pré-check-in', 'ganho'],
    ['Durante a estadia', 'ganho'], ['Pós-check-out', 'ganho'], ['Pedido de avaliação', 'ganho'], ['Recompra futura', 'aberto'],
    ['Perdido', 'perdido']] },
  { slug: 'eventos', nome: 'Eventos', padrao: 0, estagios: [
    ['Novo evento', 'aberto'], ['Coleta de informações', 'aberto'], ['Data disponível', 'aberto'], ['Orçamento enviado', 'aberto'],
    ['Visita agendada', 'aberto'], ['Contrato enviado', 'aberto'], ['Sinal pendente', 'aberto'], ['Evento fechado', 'ganho'],
    ['Pós-evento', 'ganho'], ['Perdido', 'perdido']] },
  { slug: 'saas', nome: 'SaaS', padrao: 0, estagios: [
    ['Lead captado', 'aberto'], ['Demo agendada', 'aberto'], ['Demo realizada', 'aberto'], ['Trial iniciado', 'aberto'],
    ['Ativação', 'aberto'], ['Assinante ativo', 'ganho'], ['Risco de churn', 'aberto'], ['Cancelado', 'perdido'], ['Recuperação', 'aberto']] },
  { slug: 'educacional', nome: 'Educacional', padrao: 0, estagios: [
    ['Interessado', 'aberto'], ['Conteúdo enviado', 'aberto'], ['Oferta apresentada', 'aberto'], ['Carrinho iniciado', 'aberto'],
    ['Compra realizada', 'ganho'], ['Aluno ativo', 'ganho'], ['Upsell', 'aberto'], ['Recompra', 'aberto'], ['Perdido', 'perdido']] },
];

const TEMPLATES_SEED = [
  ['Primeira resposta', 'primeira-resposta', 'whatsapp', '', 'Olá, {{nome}}! Obrigado pelo contato 😊 Sou {{nome_responsavel}}, da {{nome_empresa}}. Me conta rapidinho: qual é a sua necessidade e para quando?'],
  ['Pedido de dados (hospedagem)', 'qualificacao', 'whatsapp', '', 'Perfeito, {{nome}}! Para eu montar a melhor opção: quais as datas de check-in e check-out, e quantas pessoas?'],
  ['Envio de orçamento', 'orcamento', 'whatsapp', '', 'Olá, {{nome}}! Segue a cotação do(a) {{produto_interesse}}: {{data_inicio}} a {{data_fim}}, {{numero_hospedes}} pessoa(s) — total {{valor_proposta}}. Proposta completa: {{link_proposta}}. Posso reservar para você?'],
  ['Follow-up sem resposta', 'followup', 'whatsapp', '', 'Oi, {{nome}}! Passando para saber se ficou alguma dúvida sobre a proposta que enviei. As datas seguem disponíveis, mas a procura está alta — quer que eu segure para você?'],
  ['Recuperação de lead', 'recuperacao', 'whatsapp', '', 'Olá, {{nome}}! Vi que conversamos há um tempo sobre {{produto_interesse}}. Ainda faz sentido para você? Tenho condições especiais este mês. 😉'],
  ['Pagamento', 'pagamento', 'whatsapp', '', '{{nome}}, tudo certo! Para confirmar é só concluir o pagamento: {{link_pagamento}}. Qualquer dificuldade me chama.'],
  ['Pós-venda / avaliação', 'avaliacao', 'whatsapp', '', 'Olá, {{nome}}! Esperamos que a experiência tenha sido ótima 🙏 Sua avaliação nos ajuda muito — leva 1 minuto: {{link_reserva}}. Obrigado!'],
  ['Reativação 90 dias', 'reativacao', 'whatsapp', '', 'Oi, {{nome}}! Sentimos sua falta por aqui 😊 Que tal planejar a próxima? Clientes que já ficaram conosco têm condição especial.'],
  ['Boas-vindas por e-mail', 'onboarding', 'email', 'Bem-vindo(a), {{nome}}!', 'Olá, {{nome}}!\n\nObrigado pelo interesse em {{produto_interesse}}. Em breve nossa equipe entra em contato pelo telefone {{telefone}}.\n\nAbraço,\n{{nome_responsavel}} — {{nome_empresa}}'],
];

function provisionar(tenantId, { vertical = '' } = {}) {
  const tid = T(tenantId); const agora = nowISO();
  if (db.prepare('SELECT 1 FROM crm_config WHERE tenant_id = ?').get(tid)) return; // idempotente
  const token = 'wh_' + crypto.randomBytes(12).toString('base64url');
  db.prepare('INSERT INTO crm_config (tenant_id, config, webhook_token, atualizado_em) VALUES (?,?,?,?)')
    .run(tid, j.str({ vertical, sla_primeira_resposta_horas: 2, reativacao_dias: 90, proposta_followup_horas: 24 }), token, agora);
  for (const f of FUNIS_SEED) {
    const fid = novoId();
    db.prepare('INSERT INTO crm_funis (id, tenant_id, nome, slug, padrao, ativo, criado_em) VALUES (?,?,?,?,?,1,?)')
      .run(fid, tid, f.nome, f.slug, f.padrao, agora);
    f.estagios.forEach(([nome, tipo], i) => {
      db.prepare('INSERT INTO crm_estagios (id, tenant_id, funil_id, nome, ordem, tipo) VALUES (?,?,?,?,?,?)')
        .run(novoId(), tid, fid, nome, i, tipo);
    });
  }
  for (const [nome, cat, canal, assunto, corpo] of TEMPLATES_SEED) {
    db.prepare('INSERT INTO crm_templates (id, tenant_id, nome, categoria, canal, assunto, corpo, idioma, ativo, criado_em) VALUES (?,?,?,?,?,?,?,?,1,?)')
      .run(novoId(), tid, nome, cat, canal, assunto, corpo, 'pt', agora);
  }
}

const Config = {
  obter(tid) {
    const c = db.prepare('SELECT * FROM crm_config WHERE tenant_id = ?').get(T(tid));
    return c ? { ...c, config: j.parse(c.config, {}) } : null;
  },
  salvar(tid, novo) {
    const atual = Config.obter(tid) || { config: {} };
    db.prepare('UPDATE crm_config SET config = ?, atualizado_em = ? WHERE tenant_id = ?')
      .run(j.str({ ...atual.config, ...(novo || {}) }), nowISO(), T(tid));
    return Config.obter(tid);
  },
  porWebhookToken(token) {
    return db.prepare('SELECT tenant_id FROM crm_config WHERE webhook_token = ?').get(s(token, 60)) || null;
  },
};

// =====================================================================
// LEAD SCORING — motor de regras (0-100) + faixa
// =====================================================================
function calcularScore(c, stats = {}) {
  let sc = 0;
  if (c.telefone) sc += 8;
  if (c.whatsapp || c.telefone) sc += 4;
  if (c.email) sc += 6;
  if (c.interesse || c.produto_interesse) sc += 8;
  if (c.orcamento_centavos > 0) sc += 8;
  if (c.ticket_centavos >= 500000) sc += 10;           // ticket alto (>= R$ 5.000)
  else if (c.ticket_centavos > 0) sc += 5;
  if (c.origem === 'indicacao') sc += 12;
  if (['google-business', 'site', 'landing'].includes(c.origem)) sc += 5;
  if (c.tipo === 'cliente-recorrente' || c.tipo === 'hospede') sc += 12; // já comprou antes
  if (c.tipo === 'lead-b2b' || c.tipo === 'empresa') sc += 6;           // perfil empresarial
  if (stats.respostas > 0) sc += 12;                    // respondeu
  if (stats.respostaRapida) sc += 6;                    // respondeu rápido
  if (stats.propostaAberta) sc += 8;                    // abriu/visualizou proposta
  if (stats.pediuVisita) sc += 8;
  if (c.proxima_acao_em && c.proxima_acao_em <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)) sc += 6; // urgência/data próxima
  // negativos
  if (!c.telefone && !c.email) sc -= 15;                // contato inválido
  if (stats.diasSemResposta >= 7) sc -= 10;
  if (stats.diasSemResposta >= 21) sc -= 10;
  if (stats.propostaRecusada) sc -= 15;
  if (['tiktok', 'outro'].includes(c.origem)) sc -= 3;  // origem de menor qualidade (ajustável)
  return Math.max(0, Math.min(100, sc));
}
const faixaScore = (n) => n <= 30 ? 'frio' : n <= 60 ? 'morno' : n <= 80 ? 'quente' : 'muito-quente';

function statsDoContato(tid, contatoId) {
  const ativ = db.prepare('SELECT tipo, data FROM crm_atividades WHERE tenant_id = ? AND contato_id = ? ORDER BY data').all(T(tid), T(contatoId));
  const recebidas = ativ.filter(a => a.tipo === 'mensagem-recebida');
  const ultRecebida = recebidas.length ? recebidas[recebidas.length - 1].data : '';
  const diasSemResposta = ultRecebida ? Math.floor((Date.now() - Date.parse(ultRecebida)) / 86400000)
    : (ativ.length ? Math.floor((Date.now() - Date.parse(ativ[0].data)) / 86400000) : 0);
  const props = db.prepare('SELECT status FROM crm_propostas WHERE tenant_id = ? AND contato_id = ?').all(T(tid), T(contatoId));
  return {
    respostas: recebidas.length,
    respostaRapida: recebidas.length > 0 && ativ.length >= 2,
    diasSemResposta,
    propostaAberta: props.some(p => ['visualizada', 'negociacao', 'aceita'].includes(p.status)),
    propostaRecusada: props.some(p => p.status === 'recusada'),
    pediuVisita: ativ.some(a => /visita/i.test(a.tipo)),
  };
}

function recalcularScore(tid, contatoId) {
  const c = db.prepare('SELECT * FROM crm_contatos WHERE tenant_id = ? AND id = ?').get(T(tid), T(contatoId));
  if (!c) return 0;
  const sc = calcularScore(c, statsDoContato(tid, contatoId));
  db.prepare('UPDATE crm_contatos SET score = ? WHERE id = ?').run(sc, c.id);
  return sc;
}

// =====================================================================
// ATIVIDADES (timeline)
// =====================================================================
const Atividades = {
  registrar(tid, d) {
    const id = novoId();
    db.prepare('INSERT INTO crm_atividades (id, tenant_id, contato_id, oportunidade_id, tipo, canal, texto, autor, data) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, T(tid), T(d.contato_id), T(d.oportunidade_id || ''), s(d.tipo, 40) || 'nota', s(d.canal, 30), s(d.texto, 4000), s(d.autor, 120), d.data || nowISO());
    if (d.contato_id) db.prepare('UPDATE crm_contatos SET ultima_interacao = ?, atualizado_em = ? WHERE tenant_id = ? AND id = ?')
      .run(nowISO(), nowISO(), T(tid), T(d.contato_id));
    return id;
  },
  doContato(tid, contatoId, { tipo = '', limite = 200 } = {}) {
    let sql = 'SELECT * FROM crm_atividades WHERE tenant_id = ? AND contato_id = ?';
    const args = [T(tid), T(contatoId)];
    if (tipo) { sql += ' AND tipo = ?'; args.push(s(tipo, 40)); }
    sql += ' ORDER BY data DESC LIMIT ?'; args.push(Math.min(Number(limite) || 200, 500));
    return db.prepare(sql).all(...args);
  },
};

// =====================================================================
// CONTATOS — ficha completa + dedupe + procedência
// =====================================================================
const Contatos = {
  contar: (tid) => db.prepare("SELECT COUNT(*) n FROM crm_contatos WHERE tenant_id = ? AND status != 'arquivado'").get(T(tid)).n,
  listar(tid, q = {}) {
    let sql = 'SELECT * FROM crm_contatos WHERE tenant_id = ?';
    const args = [T(tid)];
    if (q.status !== 'todos') { sql += " AND status = ?"; args.push(q.status === 'arquivado' ? 'arquivado' : 'ativo'); }
    if (q.busca) { sql += ' AND (nome LIKE ? OR sobrenome LIKE ? OR telefone LIKE ? OR email LIKE ? OR empresa_nome LIKE ?)'; const b = `%${s(q.busca, 100)}%`; args.push(b, b, b, b, b); }
    if (q.tipo) { sql += ' AND tipo = ?'; args.push(s(q.tipo, 30)); }
    if (q.origem) { sql += ' AND origem = ?'; args.push(s(q.origem, 30)); }
    if (q.responsavel) { sql += ' AND responsavel = ?'; args.push(s(q.responsavel, 120)); }
    if (q.cidade) { sql += ' AND cidade LIKE ?'; args.push(`%${s(q.cidade, 60)}%`); }
    if (q.tag) { sql += ' AND tags LIKE ?'; args.push(`%"${s(q.tag, 40)}"%`); }
    if (q.score_min) { sql += ' AND score >= ?'; args.push(Number(q.score_min) || 0); }
    if (q.score_max) { sql += ' AND score <= ?'; args.push(Number(q.score_max) || 100); }
    if (q.empresa_id) { sql += ' AND empresa_id = ?'; args.push(T(q.empresa_id)); }
    if (q.dias_sem_interacao) {
      const corte = new Date(Date.now() - (Number(q.dias_sem_interacao) || 0) * 86400000).toISOString();
      sql += " AND (ultima_interacao = '' OR ultima_interacao < ?)"; args.push(corte);
    }
    sql += ' ORDER BY atualizado_em DESC, criado_em DESC LIMIT ?';
    args.push(Math.min(Number(q.limite) || 500, 2000));
    return db.prepare(sql).all(...args).map(hidratarContato);
  },
  obter(tid, id) {
    const c = db.prepare('SELECT * FROM crm_contatos WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    return c ? hidratarContato(c) : null;
  },
  ficha(tid, id) {
    const c = Contatos.obter(tid, id);
    if (!c) return null;
    c.atividades = Atividades.doContato(tid, id);
    c.tarefas = db.prepare("SELECT * FROM crm_tarefas WHERE tenant_id = ? AND contato_id = ? AND status = 'aberta' ORDER BY vence_em").all(T(tid), T(id));
    c.oportunidades = db.prepare('SELECT o.*, e.nome AS estagio_nome, f.nome AS funil_nome FROM crm_oportunidades o LEFT JOIN crm_estagios e ON e.id = o.estagio_id LEFT JOIN crm_funis f ON f.id = o.funil_id WHERE o.tenant_id = ? AND o.contato_id = ? ORDER BY o.criado_em DESC').all(T(tid), T(id));
    c.propostas = db.prepare('SELECT id, titulo, valor_centavos, status, validade, token, criado_em FROM crm_propostas WHERE tenant_id = ? AND contato_id = ? ORDER BY criado_em DESC').all(T(tid), T(id));
    c.score_faixa = faixaScore(c.score);
    return c;
  },
  // dedupe: telefone normalizado > e-mail. Se existir, faz merge dos campos vazios e retorna {contato, existente:true}.
  criar(tid, d, autor) {
    const tel = normTelefone(d.telefone || d.whatsapp);
    const email = s(d.email, 120).toLowerCase();
    let existente = null;
    if (tel) existente = db.prepare("SELECT * FROM crm_contatos WHERE tenant_id = ? AND telefone = ? AND status != 'arquivado'").get(T(tid), tel);
    if (!existente && email) existente = db.prepare("SELECT * FROM crm_contatos WHERE tenant_id = ? AND lower(email) = ? AND status != 'arquivado'").get(T(tid), email);
    if (existente) {
      const merge = {};
      for (const campo of ['nome', 'sobrenome', 'email', 'cargo', 'cidade', 'estado', 'interesse', 'produto_interesse', 'primeira_mensagem', 'campanha', 'pagina_entrada']) {
        if (!existente[campo] && d[campo]) merge[campo] = d[campo];
      }
      if (Object.keys(merge).length) Contatos.atualizar(tid, existente.id, merge, autor || 'sistema');
      return { contato: Contatos.obter(tid, existente.id), existente: true };
    }
    const id = novoId(); const agora = nowISO();
    const tipo = TIPOS_CONTATO.includes(d.tipo) ? d.tipo : 'lead';
    const origem = ORIGENS.includes(d.origem) ? d.origem : (d.origem ? 'outro' : '');
    db.prepare(`INSERT INTO crm_contatos (id, tenant_id, nome, sobrenome, telefone, whatsapp, email, empresa_id, empresa_nome, cargo,
      cidade, estado, pais, idioma, tipo, origem, canal_entrada, campanha, anuncio, palavra_chave, utm, pagina_entrada, formulario,
      dispositivo, localizacao, primeira_mensagem, interesse, produto_interesse, orcamento_centavos, ticket_centavos,
      responsavel, prioridade, tags, obs, proxima_acao, proxima_acao_em, consentimento, ultima_interacao, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, T(tid), s(d.nome, 120), s(d.sobrenome, 120), tel, normTelefone(d.whatsapp) || tel, email,
        T(d.empresa_id || ''), s(d.empresa_nome || d.empresa, 200), s(d.cargo, 100),
        s(d.cidade, 80), s(d.estado, 40), s(d.pais, 40) || 'BR', s(d.idioma, 10) || 'pt',
        tipo, origem, s(d.canal_entrada, 40), s(d.campanha, 120), s(d.anuncio, 120), s(d.palavra_chave, 120),
        j.str(d.utm || {}), s(d.pagina_entrada, 300), s(d.formulario, 120), s(d.dispositivo, 60), s(d.localizacao, 120),
        s(d.primeira_mensagem, 2000), s(d.interesse, 300), s(d.produto_interesse, 200),
        cent(d.orcamento_centavos), cent(d.ticket_centavos),
        s(d.responsavel, 120), ['alta', 'media', 'baixa'].includes(d.prioridade) ? d.prioridade : 'media',
        j.str(Array.isArray(d.tags) ? d.tags.map(t => s(t, 40)) : []), s(d.obs, 2000),
        s(d.proxima_acao, 200), s(d.proxima_acao_em, 10), j.str(d.consentimento || {}), '', agora, agora);
    Atividades.registrar(tid, { contato_id: id, tipo: 'criacao', texto: `Contato criado${origem ? ' via ' + origem : ''}${d.primeira_mensagem ? ': "' + s(d.primeira_mensagem, 200) + '"' : ''}`, autor: autor || 'sistema' });
    recalcularScore(tid, id);
    require('./repo').Uso.set(tid, 'contatos', Contatos.contar(tid));
    return { contato: Contatos.obter(tid, id), existente: false };
  },
  atualizar(tid, id, d, autor) {
    const c = db.prepare('SELECT * FROM crm_contatos WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!c) throw new Error('Contato não encontrado.');
    const texto = ['nome', 'sobrenome', 'email', 'empresa_nome', 'cargo', 'cidade', 'estado', 'pais', 'idioma', 'canal_entrada',
      'campanha', 'anuncio', 'palavra_chave', 'pagina_entrada', 'formulario', 'dispositivo', 'localizacao', 'primeira_mensagem',
      'interesse', 'produto_interesse', 'responsavel', 'obs', 'proxima_acao', 'proxima_acao_em', 'motivo_perda', 'motivo_ganho'];
    for (const campo of texto) if (d[campo] != null) c[campo] = s(d[campo], campo === 'obs' || campo === 'primeira_mensagem' ? 2000 : 300);
    if (d.telefone != null) c.telefone = normTelefone(d.telefone);
    if (d.whatsapp != null) c.whatsapp = normTelefone(d.whatsapp);
    if (d.empresa_id != null) c.empresa_id = T(d.empresa_id);
    if (d.tipo != null && TIPOS_CONTATO.includes(d.tipo)) c.tipo = d.tipo;
    if (d.origem != null) c.origem = ORIGENS.includes(d.origem) ? d.origem : 'outro';
    if (d.prioridade != null && ['alta', 'media', 'baixa'].includes(d.prioridade)) c.prioridade = d.prioridade;
    if (d.orcamento_centavos != null) c.orcamento_centavos = cent(d.orcamento_centavos);
    if (d.ticket_centavos != null) c.ticket_centavos = cent(d.ticket_centavos);
    if (d.tags != null) c.tags = j.str((Array.isArray(d.tags) ? d.tags : []).map(t => s(t, 40)));
    if (d.utm != null) c.utm = j.str(d.utm);
    if (d.consentimento != null) c.consentimento = j.str(d.consentimento);
    if (d.status != null && ['ativo', 'arquivado'].includes(d.status)) c.status = d.status;
    if (d.responsavel != null && d.responsavel !== c.responsavel) {
      Atividades.registrar(tid, { contato_id: id, tipo: 'mudanca-responsavel', texto: 'Responsável: ' + (d.responsavel || '—'), autor });
    }
    db.prepare(`UPDATE crm_contatos SET nome=?, sobrenome=?, telefone=?, whatsapp=?, email=?, empresa_id=?, empresa_nome=?, cargo=?,
      cidade=?, estado=?, pais=?, idioma=?, tipo=?, origem=?, canal_entrada=?, campanha=?, anuncio=?, palavra_chave=?, utm=?,
      pagina_entrada=?, formulario=?, dispositivo=?, localizacao=?, primeira_mensagem=?, interesse=?, produto_interesse=?,
      orcamento_centavos=?, ticket_centavos=?, status=?, responsavel=?, prioridade=?, tags=?, obs=?, proxima_acao=?, proxima_acao_em=?,
      motivo_perda=?, motivo_ganho=?, consentimento=?, atualizado_em=? WHERE id=?`)
      .run(c.nome, c.sobrenome, c.telefone, c.whatsapp, c.email, c.empresa_id, c.empresa_nome, c.cargo,
        c.cidade, c.estado, c.pais, c.idioma, c.tipo, c.origem, c.canal_entrada, c.campanha, c.anuncio, c.palavra_chave,
        typeof c.utm === 'string' ? c.utm : j.str(c.utm), c.pagina_entrada, c.formulario, c.dispositivo, c.localizacao,
        c.primeira_mensagem, c.interesse, c.produto_interesse, c.orcamento_centavos, c.ticket_centavos, c.status,
        c.responsavel, c.prioridade, typeof c.tags === 'string' ? c.tags : j.str(c.tags), c.obs, c.proxima_acao, c.proxima_acao_em,
        c.motivo_perda, c.motivo_ganho, typeof c.consentimento === 'string' ? c.consentimento : j.str(c.consentimento), nowISO(), c.id);
    recalcularScore(tid, id);
    return Contatos.obter(tid, id);
  },
  excluir(tid, id) { // LGPD: exclusão definitiva (contato + timeline + tarefas + alvos)
    return transacao(() => {
      db.prepare('DELETE FROM crm_atividades WHERE tenant_id = ? AND contato_id = ?').run(T(tid), T(id));
      db.prepare('DELETE FROM crm_tarefas WHERE tenant_id = ? AND contato_id = ?').run(T(tid), T(id));
      db.prepare('DELETE FROM crm_campanha_alvos WHERE tenant_id = ? AND contato_id = ?').run(T(tid), T(id));
      db.prepare('DELETE FROM crm_propostas WHERE tenant_id = ? AND contato_id = ?').run(T(tid), T(id));
      db.prepare('DELETE FROM crm_oportunidades WHERE tenant_id = ? AND contato_id = ?').run(T(tid), T(id));
      const r = db.prepare('DELETE FROM crm_contatos WHERE tenant_id = ? AND id = ?').run(T(tid), T(id));
      require('./repo').Uso.set(tid, 'contatos', Contatos.contar(tid));
      return { removido: r.changes > 0 };
    });
  },
  // exportação CSV (todos os campos principais)
  exportarCSV(tid, q = {}) {
    const cols = ['id', 'nome', 'sobrenome', 'telefone', 'whatsapp', 'email', 'empresa_nome', 'cargo', 'cidade', 'estado', 'pais',
      'tipo', 'origem', 'campanha', 'interesse', 'produto_interesse', 'ticket_centavos', 'responsavel', 'prioridade', 'score',
      'proxima_acao', 'proxima_acao_em', 'ultima_interacao', 'criado_em'];
    const esc = (v) => { const t = String(v == null ? '' : v); return /[",;\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const linhas = Contatos.listar(tid, { ...q, limite: 2000 }).map(c => cols.map(k => esc(Array.isArray(c[k]) ? c[k].join('|') : c[k])).join(';'));
    return cols.join(';') + '\n' + linhas.join('\n');
  },
  // importação CSV (separador ; ou ,) com mapeamento por cabeçalho e dedupe
  importarCSV(tid, csvTexto, autor) {
    const linhas = String(csvTexto || '').split(/\r?\n/).filter(l => l.trim());
    if (linhas.length < 2) throw new Error('CSV vazio ou sem linhas de dados.');
    const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
    const parseLinha = (l) => {
      const campos = []; let atual = '', dentro = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { if (dentro && l[i + 1] === '"') { atual += '"'; i++; } else dentro = !dentro; }
        else if (ch === sep && !dentro) { campos.push(atual); atual = ''; }
        else atual += ch;
      }
      campos.push(atual); return campos.map(c => c.trim());
    };
    const cab = parseLinha(linhas[0]).map(c => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    const MAPA = { nome: 'nome', sobrenome: 'sobrenome', telefone: 'telefone', celular: 'telefone', whatsapp: 'whatsapp', 'e-mail': 'email', email: 'email', empresa: 'empresa_nome', cargo: 'cargo', cidade: 'cidade', estado: 'estado', uf: 'estado', pais: 'pais', tipo: 'tipo', origem: 'origem', campanha: 'campanha', interesse: 'interesse', produto: 'produto_interesse', observacao: 'obs', obs: 'obs', tags: 'tags' };
    let criados = 0, duplicados = 0, invalidos = 0;
    for (let i = 1; i < linhas.length; i++) {
      const vals = parseLinha(linhas[i]);
      const d = {};
      cab.forEach((c, k) => { const alvo = MAPA[c]; if (alvo && vals[k]) d[alvo] = alvo === 'tags' ? vals[k].split('|').map(t => t.trim()).filter(Boolean) : vals[k]; });
      if (!d.nome && !d.telefone && !d.email) { invalidos++; continue; }
      d.origem = d.origem || 'importacao';
      const r = Contatos.criar(tid, d, autor || 'importacao');
      if (r.existente) duplicados++; else criados++;
    }
    return { criados, duplicados, invalidos, total: linhas.length - 1 };
  },
};
function hidratarContato(c) {
  return { ...c, tags: j.parse(c.tags, []), utm: j.parse(c.utm, {}), consentimento: j.parse(c.consentimento, {}), score_faixa: faixaScore(c.score) };
}

// =====================================================================
// EMPRESAS (B2B)
// =====================================================================
const Empresas = {
  listar(tid, busca = '') {
    let sql = 'SELECT e.*, (SELECT COUNT(*) FROM crm_contatos c WHERE c.tenant_id = e.tenant_id AND c.empresa_id = e.id) AS contatos FROM crm_empresas e WHERE e.tenant_id = ?';
    const args = [T(tid)];
    if (busca) { sql += ' AND (e.nome LIKE ? OR e.cnpj LIKE ?)'; const b = `%${s(busca, 80)}%`; args.push(b, b); }
    return db.prepare(sql + ' ORDER BY e.nome LIMIT 500').all(...args);
  },
  criar(tid, d) {
    const nome = s(d.nome, 200);
    if (!nome) throw new Error('Informe o nome da empresa.');
    const id = novoId();
    db.prepare('INSERT INTO crm_empresas (id, tenant_id, nome, cnpj, site, segmento, cidade, estado, telefone, obs, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, T(tid), nome, s(d.cnpj, 20), s(d.site, 200), s(d.segmento, 80), s(d.cidade, 80), s(d.estado, 40), normTelefone(d.telefone), s(d.obs, 1000), nowISO());
    return db.prepare('SELECT * FROM crm_empresas WHERE id = ?').get(id);
  },
  atualizar(tid, id, d) {
    const e = db.prepare('SELECT * FROM crm_empresas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!e) throw new Error('Empresa não encontrada.');
    for (const c of ['nome', 'cnpj', 'site', 'segmento', 'cidade', 'estado', 'obs']) if (d[c] != null) e[c] = s(d[c], 200);
    if (d.telefone != null) e.telefone = normTelefone(d.telefone);
    db.prepare('UPDATE crm_empresas SET nome=?, cnpj=?, site=?, segmento=?, cidade=?, estado=?, telefone=?, obs=?, atualizado_em=? WHERE id=?')
      .run(e.nome, e.cnpj, e.site, e.segmento, e.cidade, e.estado, e.telefone, e.obs, nowISO(), e.id);
    return e;
  },
};

// =====================================================================
// FUNIS / ESTÁGIOS + OPORTUNIDADES (kanban)
// =====================================================================
const Funis = {
  contar: (tid) => db.prepare('SELECT COUNT(*) n FROM crm_funis WHERE tenant_id = ? AND ativo = 1').get(T(tid)).n,
  listar(tid) {
    return db.prepare('SELECT * FROM crm_funis WHERE tenant_id = ? AND ativo = 1 ORDER BY padrao DESC, criado_em').all(T(tid))
      .map(f => ({ ...f, estagios: db.prepare('SELECT * FROM crm_estagios WHERE funil_id = ? ORDER BY ordem').all(f.id) }));
  },
  obter(tid, id) {
    const f = db.prepare('SELECT * FROM crm_funis WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!f) return null;
    f.estagios = db.prepare('SELECT * FROM crm_estagios WHERE funil_id = ? ORDER BY ordem').all(f.id);
    return f;
  },
  padrao(tid) {
    const f = db.prepare('SELECT id FROM crm_funis WHERE tenant_id = ? AND ativo = 1 ORDER BY padrao DESC, criado_em LIMIT 1').get(T(tid));
    return f ? Funis.obter(tid, f.id) : null;
  },
  criar(tid, d) {
    const nome = s(d.nome, 120);
    if (!nome) throw new Error('Informe o nome do funil.');
    const estagios = Array.isArray(d.estagios) && d.estagios.length ? d.estagios : [['Novo', 'aberto'], ['Em andamento', 'aberto'], ['Ganho', 'ganho'], ['Perdido', 'perdido']];
    return transacao(() => {
      const id = novoId();
      db.prepare('INSERT INTO crm_funis (id, tenant_id, nome, slug, padrao, ativo, criado_em) VALUES (?,?,?,?,0,1,?)')
        .run(id, T(tid), nome, require('./repo').slugify(nome), nowISO());
      estagios.forEach((e, i) => {
        const [n, tp] = Array.isArray(e) ? e : [e.nome, e.tipo];
        db.prepare('INSERT INTO crm_estagios (id, tenant_id, funil_id, nome, ordem, tipo) VALUES (?,?,?,?,?,?)')
          .run(novoId(), T(tid), id, s(n, 80) || 'Etapa', i, ['ganho', 'perdido'].includes(tp) ? tp : 'aberto');
      });
      require('./repo').Uso.set(tid, 'funis', Funis.contar(tid));
      return Funis.obter(tid, id);
    });
  },
  // kanban: oportunidades agrupadas por estágio do funil
  kanban(tid, funilId) {
    const f = funilId ? Funis.obter(tid, funilId) : Funis.padrao(tid);
    if (!f) return null;
    const ops = db.prepare(`SELECT o.*, c.nome AS contato_nome, c.telefone AS contato_telefone, c.tipo AS contato_tipo,
      c.origem AS contato_origem, c.score AS contato_score, c.prioridade AS contato_prioridade,
      c.proxima_acao_em AS contato_proxima_em, c.ultima_interacao AS contato_ultima
      FROM crm_oportunidades o JOIN crm_contatos c ON c.id = o.contato_id
      WHERE o.tenant_id = ? AND o.funil_id = ? ORDER BY o.atualizado_em DESC`).all(T(tid), f.id);
    const hoje = hojeISO();
    const colunas = f.estagios.map(e => {
      const lista = ops.filter(o => o.estagio_id === e.id).map(o => ({ ...o, atrasada: !!(o.status === 'aberta' && o.previsao && o.previsao < hoje) }));
      return { ...e, oportunidades: lista, total_centavos: lista.reduce((sum, o) => sum + (o.valor_centavos || 0), 0) };
    });
    return { funil: { id: f.id, nome: f.nome, slug: f.slug }, colunas };
  },
};

const Oportunidades = {
  criar(tid, d, autor) {
    const contato = Contatos.obter(tid, d.contato_id);
    if (!contato) throw new Error('Contato não encontrado.');
    const funil = d.funil_id ? Funis.obter(tid, d.funil_id) : Funis.padrao(tid);
    if (!funil) throw new Error('Funil não encontrado.');
    const estagio = d.estagio_id ? funil.estagios.find(e => e.id === d.estagio_id) : funil.estagios[0];
    if (!estagio) throw new Error('Estágio inválido.');
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO crm_oportunidades (id, tenant_id, contato_id, funil_id, estagio_id, titulo, produto, valor_centavos,
      previsao, responsavel, prioridade, status, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,'aberta',?,?)`)
      .run(id, T(tid), contato.id, funil.id, estagio.id, s(d.titulo, 200) || ('Negócio — ' + (contato.nome || contato.telefone)),
        s(d.produto, 200), cent(d.valor_centavos), s(d.previsao, 10), s(d.responsavel || contato.responsavel, 120),
        ['alta', 'media', 'baixa'].includes(d.prioridade) ? d.prioridade : 'media', agora, agora);
    Atividades.registrar(tid, { contato_id: contato.id, oportunidade_id: id, tipo: 'nota', texto: `Oportunidade criada: ${s(d.titulo, 100) || 'negócio'} (${funil.nome} · ${estagio.nome})`, autor });
    return Oportunidades.obter(tid, id);
  },
  obter(tid, id) {
    return db.prepare(`SELECT o.*, c.nome AS contato_nome, e.nome AS estagio_nome, e.tipo AS estagio_tipo, f.nome AS funil_nome
      FROM crm_oportunidades o LEFT JOIN crm_contatos c ON c.id = o.contato_id
      LEFT JOIN crm_estagios e ON e.id = o.estagio_id LEFT JOIN crm_funis f ON f.id = o.funil_id
      WHERE o.tenant_id = ? AND o.id = ?`).get(T(tid), T(id)) || null;
  },
  atualizar(tid, id, d, autor) {
    const o = db.prepare('SELECT * FROM crm_oportunidades WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!o) throw new Error('Oportunidade não encontrada.');
    for (const c of ['titulo', 'produto', 'previsao', 'responsavel', 'motivo']) if (d[c] != null) o[c] = s(d[c], 200);
    if (d.valor_centavos != null) o.valor_centavos = cent(d.valor_centavos);
    if (d.prioridade != null && ['alta', 'media', 'baixa'].includes(d.prioridade)) o.prioridade = d.prioridade;
    db.prepare('UPDATE crm_oportunidades SET titulo=?, produto=?, valor_centavos=?, previsao=?, responsavel=?, prioridade=?, motivo=?, atualizado_em=? WHERE id=?')
      .run(o.titulo, o.produto, o.valor_centavos, o.previsao, o.responsavel, o.prioridade, o.motivo, nowISO(), o.id);
    return Oportunidades.obter(tid, id);
  },
  // mover no kanban; se o estágio destino é ganho/perdido, fecha a oportunidade
  mover(tid, id, estagioId, autor, motivo) {
    const o = db.prepare('SELECT * FROM crm_oportunidades WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!o) throw new Error('Oportunidade não encontrada.');
    const est = db.prepare('SELECT * FROM crm_estagios WHERE tenant_id = ? AND id = ? AND funil_id = ?').get(T(tid), T(estagioId), o.funil_id);
    if (!est) throw new Error('Estágio inválido para este funil.');
    const agora = nowISO();
    const status = est.tipo === 'ganho' ? 'ganha' : est.tipo === 'perdido' ? 'perdida' : 'aberta';
    db.prepare('UPDATE crm_oportunidades SET estagio_id=?, status=?, motivo=?, fechada_em=?, atualizado_em=? WHERE id=?')
      .run(est.id, status, motivo != null ? s(motivo, 300) : o.motivo, status === 'aberta' ? '' : (o.fechada_em || agora), agora, o.id);
    Atividades.registrar(tid, { contato_id: o.contato_id, oportunidade_id: o.id, tipo: status === 'ganha' ? 'ganho' : status === 'perdida' ? 'perda' : 'mudanca-estagio', texto: `→ ${est.nome}${motivo ? ' (' + s(motivo, 120) + ')' : ''}`, autor });
    if (status === 'ganha') Contatos.atualizar(tid, o.contato_id, { motivo_ganho: motivo || est.nome, tipo: 'cliente-recorrente' }, autor || 'sistema');
    if (status === 'perdida' && motivo) Contatos.atualizar(tid, o.contato_id, { motivo_perda: motivo }, autor || 'sistema');
    return Oportunidades.obter(tid, id);
  },
};

// =====================================================================
// TAREFAS / FOLLOW-UPS
// =====================================================================
const Tarefas = {
  listar(tid, q = {}) {
    let sql = `SELECT t.*, c.nome AS contato_nome, c.telefone AS contato_telefone FROM crm_tarefas t
      LEFT JOIN crm_contatos c ON c.id = t.contato_id WHERE t.tenant_id = ?`;
    const args = [T(tid)];
    if (q.status) { sql += ' AND t.status = ?'; args.push(s(q.status, 20)); }
    if (q.responsavel) { sql += ' AND t.responsavel = ?'; args.push(s(q.responsavel, 120)); }
    if (q.contato_id) { sql += ' AND t.contato_id = ?'; args.push(T(q.contato_id)); }
    sql += " ORDER BY CASE WHEN t.vence_em = '' THEN 1 ELSE 0 END, t.vence_em, t.criado_em LIMIT 500";
    return db.prepare(sql).all(...args);
  },
  criar(tid, d, autor) {
    const id = novoId();
    db.prepare('INSERT INTO crm_tarefas (id, tenant_id, contato_id, oportunidade_id, titulo, tipo, vence_em, responsavel, status, origem, obs, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, T(tid), T(d.contato_id || ''), T(d.oportunidade_id || ''), s(d.titulo, 200) || 'Follow-up',
        s(d.tipo, 20) || 'followup', s(d.vence_em, 10), s(d.responsavel, 120), 'aberta', s(d.origem, 20) || 'manual', s(d.obs, 1000), nowISO());
    if (d.contato_id) Atividades.registrar(tid, { contato_id: d.contato_id, tipo: 'tarefa', texto: `Tarefa criada: ${s(d.titulo, 120)}${d.vence_em ? ' (até ' + d.vence_em + ')' : ''}`, autor });
    return db.prepare('SELECT * FROM crm_tarefas WHERE id = ?').get(id);
  },
  concluir(tid, id, autor) {
    const t = db.prepare('SELECT * FROM crm_tarefas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!t) throw new Error('Tarefa não encontrada.');
    db.prepare("UPDATE crm_tarefas SET status = 'concluida', concluida_em = ? WHERE id = ?").run(nowISO(), t.id);
    if (t.contato_id) Atividades.registrar(tid, { contato_id: t.contato_id, tipo: 'tarefa', texto: 'Tarefa concluída: ' + t.titulo, autor });
    return { ok: true };
  },
  cancelar(tid, id) {
    db.prepare("UPDATE crm_tarefas SET status = 'cancelada' WHERE tenant_id = ? AND id = ?").run(T(tid), T(id));
    return { ok: true };
  },
  // caixa de trabalho: o que precisa de ação (atrasadas / hoje / próximas) + leads parados + propostas sem resposta
  caixa(tid) {
    const hoje = hojeISO();
    const abertas = Tarefas.listar(tid, { status: 'aberta' });
    const cfg = (Config.obter(tid) || { config: {} }).config;
    const corteParado = new Date(Date.now() - 7 * 86400000).toISOString();
    const paradas = db.prepare(`SELECT id, nome, telefone, score, origem, ultima_interacao FROM crm_contatos
      WHERE tenant_id = ? AND status = 'ativo' AND (ultima_interacao = '' OR ultima_interacao < ?)
      AND id IN (SELECT contato_id FROM crm_oportunidades WHERE tenant_id = ? AND status = 'aberta')
      ORDER BY score DESC LIMIT 30`).all(T(tid), corteParado, T(tid));
    const horasProp = Number(cfg.proposta_followup_horas || 24);
    const corteProp = new Date(Date.now() - horasProp * 3600000).toISOString();
    const propsSem = db.prepare(`SELECT p.id, p.titulo, p.valor_centavos, p.enviada_em, c.nome AS contato_nome, c.id AS contato_id
      FROM crm_propostas p JOIN crm_contatos c ON c.id = p.contato_id
      WHERE p.tenant_id = ? AND p.status IN ('enviada','visualizada') AND p.enviada_em != '' AND p.enviada_em < ?
      ORDER BY p.enviada_em LIMIT 30`).all(T(tid), corteProp);
    return {
      atrasadas: abertas.filter(t => t.vence_em && t.vence_em < hoje),
      hoje: abertas.filter(t => t.vence_em === hoje),
      proximas: abertas.filter(t => !t.vence_em || t.vence_em > hoje).slice(0, 30),
      leads_parados: paradas,
      propostas_sem_resposta: propsSem,
    };
  },
};

// =====================================================================
// TEMPLATES DE MENSAGENS (com variáveis)
// =====================================================================
const VARIAVEIS = ['nome', 'telefone', 'email', 'empresa', 'produto_interesse', 'imovel', 'data_inicio', 'data_fim',
  'numero_hospedes', 'valor_proposta', 'link_proposta', 'link_pagamento', 'link_reserva', 'nome_responsavel', 'nome_empresa'];
const Templates = {
  contar: (tid) => db.prepare('SELECT COUNT(*) n FROM crm_templates WHERE tenant_id = ?').get(T(tid)).n,
  listar(tid, q = {}) {
    let sql = 'SELECT * FROM crm_templates WHERE tenant_id = ?'; const args = [T(tid)];
    if (q.canal) { sql += ' AND canal = ?'; args.push(s(q.canal, 20)); }
    if (q.categoria) { sql += ' AND categoria = ?'; args.push(s(q.categoria, 40)); }
    if (q.ativo !== 'todos') sql += ' AND ativo = 1';
    return db.prepare(sql + ' ORDER BY categoria, nome LIMIT 300').all(...args);
  },
  criar(tid, d) {
    if (!s(d.nome, 120) || !s(d.corpo, 4000)) throw new Error('Informe nome e corpo do template.');
    const id = novoId();
    db.prepare('INSERT INTO crm_templates (id, tenant_id, nome, categoria, canal, assunto, corpo, idioma, vertical, etapa, objetivo, ativo, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)')
      .run(id, T(tid), s(d.nome, 120), s(d.categoria, 40), s(d.canal, 20) || 'whatsapp', s(d.assunto, 200), s(d.corpo, 4000),
        s(d.idioma, 10) || 'pt', s(d.vertical, 40), s(d.etapa, 80), s(d.objetivo, 200), nowISO());
    require('./repo').Uso.set(tid, 'templates', Templates.contar(tid));
    return db.prepare('SELECT * FROM crm_templates WHERE id = ?').get(id);
  },
  atualizar(tid, id, d) {
    const t = db.prepare('SELECT * FROM crm_templates WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!t) throw new Error('Template não encontrado.');
    for (const c of ['nome', 'categoria', 'canal', 'assunto', 'corpo', 'idioma', 'vertical', 'etapa', 'objetivo']) if (d[c] != null) t[c] = s(d[c], c === 'corpo' ? 4000 : 200);
    if (d.ativo != null) t.ativo = d.ativo ? 1 : 0;
    db.prepare('UPDATE crm_templates SET nome=?, categoria=?, canal=?, assunto=?, corpo=?, idioma=?, vertical=?, etapa=?, objetivo=?, ativo=?, atualizado_em=? WHERE id=?')
      .run(t.nome, t.categoria, t.canal, t.assunto, t.corpo, t.idioma, t.vertical, t.etapa, t.objetivo, t.ativo, nowISO(), t.id);
    return t;
  },
  // substitui {{variaveis}} com dados do contato + extras
  render(tid, templateId, contatoId, extras = {}) {
    const t = db.prepare('SELECT * FROM crm_templates WHERE tenant_id = ? AND id = ?').get(T(tid), T(templateId));
    if (!t) throw new Error('Template não encontrado.');
    const c = contatoId ? Contatos.obter(tid, contatoId) : {};
    const vals = {
      nome: (c && c.nome) || '', telefone: (c && c.telefone) || '', email: (c && c.email) || '',
      empresa: (c && c.empresa_nome) || '', produto_interesse: (c && c.produto_interesse) || '',
      imovel: (c && c.produto_interesse) || '', ...extras,
    };
    const troca = (texto) => String(texto || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (vals[k] != null && vals[k] !== '' ? String(vals[k]) : m));
    return { assunto: troca(t.assunto), corpo: troca(t.corpo), canal: t.canal, template: { id: t.id, nome: t.nome } };
  },
};

// =====================================================================
// PROPOSTAS (com link público /crm/p/:token)
// =====================================================================
const Propostas = {
  listar(tid, q = {}) {
    let sql = `SELECT p.*, c.nome AS contato_nome FROM crm_propostas p LEFT JOIN crm_contatos c ON c.id = p.contato_id WHERE p.tenant_id = ?`;
    const args = [T(tid)];
    if (q.status) { sql += ' AND p.status = ?'; args.push(s(q.status, 20)); }
    if (q.contato_id) { sql += ' AND p.contato_id = ?'; args.push(T(q.contato_id)); }
    return db.prepare(sql + ' ORDER BY p.criado_em DESC LIMIT 300').all(...args).map(p => ({ ...p, itens: j.parse(p.itens, []) }));
  },
  obter(tid, id) {
    const p = db.prepare('SELECT * FROM crm_propostas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    return p ? { ...p, itens: j.parse(p.itens, []) } : null;
  },
  criar(tid, d, autor) {
    const contato = Contatos.obter(tid, d.contato_id);
    if (!contato) throw new Error('Contato não encontrado.');
    const itens = (Array.isArray(d.itens) ? d.itens : []).map(i => ({ descricao: s(i.descricao, 300), qtd: Number(i.qtd) || 1, valor_centavos: cent(i.valor_centavos) }));
    const soma = itens.reduce((sum, i) => sum + i.qtd * i.valor_centavos, 0);
    const valor = d.valor_centavos != null ? cent(d.valor_centavos) : soma;
    const id = novoId();
    db.prepare(`INSERT INTO crm_propostas (id, tenant_id, contato_id, oportunidade_id, titulo, itens, valor_centavos, desconto_centavos,
      validade, condicoes, link_pagamento, link_reserva, status, obs, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'rascunho',?,?,?)`)
      .run(id, T(tid), contato.id, T(d.oportunidade_id || ''), s(d.titulo, 200) || 'Proposta', j.str(itens), valor,
        cent(d.desconto_centavos), s(d.validade, 10), s(d.condicoes, 2000), s(d.link_pagamento, 400), s(d.link_reserva, 400), s(d.obs, 1000), nowISO(), nowISO());
    return Propostas.obter(tid, id);
  },
  atualizar(tid, id, d) {
    const p = db.prepare('SELECT * FROM crm_propostas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!p) throw new Error('Proposta não encontrada.');
    for (const c of ['titulo', 'validade', 'condicoes', 'link_pagamento', 'link_reserva', 'obs']) if (d[c] != null) p[c] = s(d[c], 2000);
    if (d.itens != null) {
      const itens = (Array.isArray(d.itens) ? d.itens : []).map(i => ({ descricao: s(i.descricao, 300), qtd: Number(i.qtd) || 1, valor_centavos: cent(i.valor_centavos) }));
      p.itens = j.str(itens);
      p.valor_centavos = d.valor_centavos != null ? cent(d.valor_centavos) : itens.reduce((sum, i) => sum + i.qtd * i.valor_centavos, 0);
    } else if (d.valor_centavos != null) p.valor_centavos = cent(d.valor_centavos);
    if (d.desconto_centavos != null) p.desconto_centavos = cent(d.desconto_centavos);
    db.prepare('UPDATE crm_propostas SET titulo=?, itens=?, valor_centavos=?, desconto_centavos=?, validade=?, condicoes=?, link_pagamento=?, link_reserva=?, obs=?, atualizado_em=? WHERE id=?')
      .run(p.titulo, p.itens, p.valor_centavos, p.desconto_centavos, p.validade, p.condicoes, p.link_pagamento, p.link_reserva, p.obs, nowISO(), p.id);
    return Propostas.obter(tid, id);
  },
  enviar(tid, id, autor) {
    const p = db.prepare('SELECT * FROM crm_propostas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!p) throw new Error('Proposta não encontrada.');
    const token = p.token || ('pp_' + crypto.randomBytes(12).toString('base64url'));
    db.prepare("UPDATE crm_propostas SET status = 'enviada', token = ?, enviada_em = ?, atualizado_em = ? WHERE id = ?")
      .run(token, nowISO(), nowISO(), p.id);
    Atividades.registrar(tid, { contato_id: p.contato_id, oportunidade_id: p.oportunidade_id, tipo: 'proposta', texto: `Proposta enviada: ${p.titulo} (R$ ${(p.valor_centavos / 100).toFixed(2)})`, autor });
    return Propostas.obter(tid, id);
  },
  mudarStatus(tid, id, status, autor) {
    const ok = ['rascunho', 'enviada', 'visualizada', 'negociacao', 'aceita', 'recusada', 'vencida'];
    if (!ok.includes(status)) throw new Error('Status inválido.');
    const p = db.prepare('SELECT * FROM crm_propostas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!p) throw new Error('Proposta não encontrada.');
    db.prepare('UPDATE crm_propostas SET status = ?, respondida_em = ?, atualizado_em = ? WHERE id = ?')
      .run(status, ['aceita', 'recusada'].includes(status) ? nowISO() : p.respondida_em, nowISO(), p.id);
    if (['aceita', 'recusada'].includes(status)) {
      Atividades.registrar(tid, { contato_id: p.contato_id, tipo: 'proposta', texto: `Proposta ${status}: ${p.titulo}`, autor: autor || 'cliente' });
      recalcularScore(tid, p.contato_id);
    }
    return Propostas.obter(tid, id);
  },
  // visão pública (sem dados sensíveis; registra visualização)
  publica(token) {
    const p = db.prepare('SELECT * FROM crm_propostas WHERE token = ?').get(s(token, 60));
    if (!p) return null;
    if (p.status === 'enviada') {
      db.prepare("UPDATE crm_propostas SET status = 'visualizada', atualizado_em = ? WHERE id = ?").run(nowISO(), p.id);
      Atividades.registrar(p.tenant_id, { contato_id: p.contato_id, tipo: 'proposta', texto: 'Proposta visualizada pelo cliente: ' + p.titulo, autor: 'cliente' });
      recalcularScore(p.tenant_id, p.contato_id);
      p.status = 'visualizada';
    }
    const c = Contatos.obter(p.tenant_id, p.contato_id) || {};
    const emp = db.prepare('SELECT nome FROM tenants WHERE id = ?').get(p.tenant_id) || {};
    return {
      titulo: p.titulo, itens: j.parse(p.itens, []), valor_centavos: p.valor_centavos, desconto_centavos: p.desconto_centavos,
      validade: p.validade, condicoes: p.condicoes, link_pagamento: p.link_pagamento, link_reserva: p.link_reserva,
      status: p.status, cliente: c.nome || '', empresa: emp.nome || '', token: p.token,
    };
  },
  responderPublica(token, aceite) {
    const p = db.prepare('SELECT * FROM crm_propostas WHERE token = ?').get(s(token, 60));
    if (!p) throw new Error('Proposta não encontrada.');
    if (['aceita', 'recusada'].includes(p.status)) return { status: p.status };
    return { status: Propostas.mudarStatus(p.tenant_id, p.id, aceite ? 'aceita' : 'recusada', 'cliente').status };
  },
};

// =====================================================================
// CAMPANHAS + SEGMENTAÇÃO (semiautomáticas)
// =====================================================================
const Campanhas = {
  listar(tid) {
    return db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM crm_campanha_alvos a WHERE a.campanha_id = c.id) AS alvos,
      (SELECT COUNT(*) FROM crm_campanha_alvos a WHERE a.campanha_id = c.id AND a.status = 'enviado') AS enviados,
      (SELECT COUNT(*) FROM crm_campanha_alvos a WHERE a.campanha_id = c.id AND a.status = 'respondido') AS respondidos
      FROM crm_campanhas c WHERE c.tenant_id = ? ORDER BY c.criado_em DESC LIMIT 100`).all(T(tid))
      .map(c => ({ ...c, segmento: j.parse(c.segmento, {}) }));
  },
  criar(tid, d, autor) {
    const nome = s(d.nome, 200);
    if (!nome) throw new Error('Informe o nome da campanha.');
    const segmento = d.segmento || {};
    const contatos = Contatos.listar(tid, { ...segmento, limite: 1000 })
      .filter(c => (c.consentimento && c.consentimento.optIn === false) ? false : true); // respeita opt-out
    if (!contatos.length) throw new Error('O segmento não retornou nenhum contato.');
    return transacao(() => {
      const id = novoId(); const agora = nowISO();
      db.prepare('INSERT INTO crm_campanhas (id, tenant_id, nome, tipo, segmento, template_id, mensagem, status, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id, T(tid), nome, s(d.tipo, 20) || 'whatsapp', j.str(segmento), T(d.template_id || ''), s(d.mensagem, 4000), 'em_andamento', agora, agora);
      const ins = db.prepare('INSERT INTO crm_campanha_alvos (id, tenant_id, campanha_id, contato_id, status, atualizado_em) VALUES (?,?,?,?,?,?)');
      for (const c of contatos) ins.run(novoId(), T(tid), id, c.id, 'pendente', agora);
      require('./repo').Uso.registrar(tid, 'campanhas_mes', 1);
      return { id, alvos: contatos.length };
    });
  },
  alvos(tid, campanhaId, status = '') {
    let sql = `SELECT a.*, c.nome, c.telefone, c.email, c.score, c.tipo AS contato_tipo FROM crm_campanha_alvos a
      JOIN crm_contatos c ON c.id = a.contato_id WHERE a.tenant_id = ? AND a.campanha_id = ?`;
    const args = [T(tid), T(campanhaId)];
    if (status) { sql += ' AND a.status = ?'; args.push(s(status, 20)); }
    return db.prepare(sql + ' ORDER BY c.score DESC LIMIT 1000').all(...args);
  },
  marcarAlvo(tid, alvoId, status, autor) {
    const ok = ['pendente', 'enviado', 'respondido', 'pulado'];
    if (!ok.includes(status)) throw new Error('Status inválido.');
    const a = db.prepare('SELECT a.*, c.nome AS campanha_nome FROM crm_campanha_alvos a JOIN crm_campanhas c ON c.id = a.campanha_id WHERE a.tenant_id = ? AND a.id = ?').get(T(tid), T(alvoId));
    if (!a) throw new Error('Alvo não encontrado.');
    db.prepare('UPDATE crm_campanha_alvos SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), a.id);
    if (status === 'enviado') Atividades.registrar(tid, { contato_id: a.contato_id, tipo: 'campanha', texto: 'Campanha enviada: ' + a.campanha_nome, autor });
    if (status === 'respondido') { Atividades.registrar(tid, { contato_id: a.contato_id, tipo: 'mensagem-recebida', canal: 'whatsapp', texto: 'Respondeu à campanha ' + a.campanha_nome, autor }); recalcularScore(tid, a.contato_id); }
    return { ok: true };
  },
  mudarStatus(tid, id, status) {
    const ok = ['rascunho', 'em_andamento', 'concluida', 'cancelada'];
    if (!ok.includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE crm_campanhas SET status = ?, atualizado_em = ? WHERE tenant_id = ? AND id = ?').run(status, nowISO(), T(tid), T(id));
    return { ok: true };
  },
};

// =====================================================================
// AUTOMAÇÕES — regras de follow-up (rodam na rotina diária ou sob demanda)
// =====================================================================
function rodarAutomacoes(tid) {
  const agora = nowISO(); const hoje = hojeISO();
  const cfg = (Config.obter(tid) || { config: {} }).config;
  let criadas = 0, vencidas = 0, priorizados = 0;
  const jaTemTarefa = (contatoId, tipo) => !!db.prepare("SELECT 1 FROM crm_tarefas WHERE tenant_id = ? AND contato_id = ? AND status = 'aberta' AND origem = 'automacao' AND tipo = ?").get(T(tid), contatoId, tipo);

  // 1) proposta enviada há +24h (config) sem resposta → tarefa de follow-up
  const horasProp = Number(cfg.proposta_followup_horas || 24);
  const corteProp = new Date(Date.now() - horasProp * 3600000).toISOString();
  for (const p of db.prepare("SELECT * FROM crm_propostas WHERE tenant_id = ? AND status IN ('enviada','visualizada') AND enviada_em != '' AND enviada_em < ?").all(T(tid), corteProp)) {
    if (jaTemTarefa(p.contato_id, 'proposta')) continue;
    Tarefas.criar(tid, { contato_id: p.contato_id, titulo: `Follow-up da proposta "${p.titulo}" (sem resposta há +${horasProp}h)`, tipo: 'proposta', vence_em: hoje, origem: 'automacao' }, 'automacao');
    criadas++;
  }
  // 2) proposta com validade vencida → status 'vencida'
  for (const p of db.prepare("SELECT id FROM crm_propostas WHERE tenant_id = ? AND status IN ('enviada','visualizada','negociacao') AND validade != '' AND validade < ?").all(T(tid), hoje)) {
    db.prepare("UPDATE crm_propostas SET status = 'vencida', atualizado_em = ? WHERE id = ?").run(agora, p.id);
    vencidas++;
  }
  // 3) lead novo sem responsável há +30min → tarefa "atribuir"
  const corte30 = new Date(Date.now() - 30 * 60000).toISOString();
  for (const c of db.prepare("SELECT id, nome, telefone FROM crm_contatos WHERE tenant_id = ? AND status = 'ativo' AND responsavel = '' AND ultima_interacao = '' AND criado_em < ?").all(T(tid), corte30)) {
    if (jaTemTarefa(c.id, 'followup')) continue;
    Tarefas.criar(tid, { contato_id: c.id, titulo: `Lead sem responsável: ${c.nome || c.telefone} — atribuir e responder`, tipo: 'followup', vence_em: hoje, origem: 'automacao' }, 'automacao');
    criadas++;
  }
  // 4) lead quente (score>60) sem interação há +12h → prioridade alta + tarefa
  const corte12 = new Date(Date.now() - 12 * 3600000).toISOString();
  for (const c of db.prepare("SELECT id, nome, telefone, prioridade FROM crm_contatos WHERE tenant_id = ? AND status = 'ativo' AND score > 60 AND ultima_interacao != '' AND ultima_interacao < ?").all(T(tid), corte12)) {
    if (c.prioridade !== 'alta') { db.prepare("UPDATE crm_contatos SET prioridade = 'alta' WHERE id = ?").run(c.id); priorizados++; }
    if (!jaTemTarefa(c.id, 'mensagem')) {
      Tarefas.criar(tid, { contato_id: c.id, titulo: `Lead quente parado: ${c.nome || c.telefone}`, tipo: 'mensagem', vence_em: hoje, origem: 'automacao' }, 'automacao');
      criadas++;
    }
  }
  // 5) cliente antigo sem contato há +90 dias (config) → sugerir reativação
  const diasReat = Number(cfg.reativacao_dias || 90);
  const corteReat = new Date(Date.now() - diasReat * 86400000).toISOString();
  for (const c of db.prepare(`SELECT id, nome, telefone FROM crm_contatos WHERE tenant_id = ? AND status = 'ativo'
    AND tipo IN ('hospede','cliente-recorrente','aluno','comprador-livro') AND ultima_interacao != '' AND ultima_interacao < ? LIMIT 20`).all(T(tid), corteReat)) {
    if (jaTemTarefa(c.id, 'outro')) continue;
    Tarefas.criar(tid, { contato_id: c.id, titulo: `Reativação: ${c.nome || c.telefone} (${diasReat}+ dias sem contato)`, tipo: 'outro', vence_em: hoje, origem: 'automacao' }, 'automacao');
    criadas++;
  }
  return { tarefas_criadas: criadas, propostas_vencidas: vencidas, priorizados };
}

// =====================================================================
// AGENTES (motor de regras v1; LLM plugável via campo motor='llm')
// Toda saída é SUGESTÃO com log — revisão humana sempre.
// =====================================================================
function logIA(tid, agente, contatoId, entrada, saida, motor = 'regras') {
  const id = novoId();
  db.prepare('INSERT INTO crm_ia_logs (id, tenant_id, agente, contato_id, entrada, saida, motor, status, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, T(tid), s(agente, 30), T(contatoId || ''), j.str(entrada).slice(0, 4000), j.str(saida).slice(0, 8000), motor, 'sugerido', nowISO());
  require('./repo').Uso.registrar(tid, 'ia_mes', 1);
  return id;
}
const Agentes = {
  // Agente de qualificação: analisa o lead e sugere perfil/prioridade/próxima ação
  qualificar(tid, contatoId) {
    const c = Contatos.obter(tid, contatoId);
    if (!c) throw new Error('Contato não encontrado.');
    const stats = statsDoContato(tid, contatoId);
    const score = calcularScore(c, stats);
    const faixa = faixaScore(score);
    const faltantes = [];
    if (!c.telefone) faltantes.push('telefone/WhatsApp');
    if (!c.email) faltantes.push('e-mail');
    if (!c.produto_interesse && !c.interesse) faltantes.push('interesse principal');
    if (!c.ticket_centavos && !c.orcamento_centavos) faltantes.push('orçamento/ticket estimado');
    const perguntas = [];
    if (c.tipo.includes('hospedagem') || c.tipo === 'hospede' || c.tipo === 'lead') perguntas.push('Quais as datas e quantas pessoas?', 'Já conhece a região / tem preferência de imóvel?');
    if (c.tipo === 'lead-evento') perguntas.push('Qual a data e o número de convidados?', 'Que tipo de evento?');
    if (c.tipo === 'lead-b2b' || c.tipo === 'assinante-saas') perguntas.push('Qual o tamanho da operação hoje?', 'Qual problema quer resolver primeiro?');
    const saida = {
      perfil: `${c.tipo} · origem ${c.origem || 'desconhecida'} · ${faixa} (score ${score})`,
      prioridade_sugerida: faixa === 'muito-quente' || faixa === 'quente' ? 'alta' : faixa === 'morno' ? 'media' : 'baixa',
      chance_conversao: faixa === 'muito-quente' ? 'alta' : faixa === 'quente' ? 'boa' : faixa === 'morno' ? 'média' : 'baixa',
      dados_faltantes: faltantes,
      perguntas_sugeridas: perguntas,
      proxima_acao: stats.diasSemResposta > 3 ? 'Retomar contato hoje (parado há ' + stats.diasSemResposta + ' dias)' : (faltantes.length ? 'Coletar: ' + faltantes.join(', ') : 'Avançar para proposta'),
    };
    const logId = logIA(tid, 'qualificacao', contatoId, { score, stats }, saida);
    return { ...saida, log_id: logId };
  },
  // Agente de follow-up: leads parados + mensagem sugerida (usa template de followup se houver)
  followups(tid) {
    const parados = db.prepare(`SELECT id, nome, telefone, score, ultima_interacao FROM crm_contatos
      WHERE tenant_id = ? AND status = 'ativo' AND ultima_interacao != '' AND ultima_interacao < ?
      AND id IN (SELECT contato_id FROM crm_oportunidades WHERE tenant_id = ? AND status = 'aberta')
      ORDER BY score DESC LIMIT 15`).all(T(tid), new Date(Date.now() - 3 * 86400000).toISOString(), T(tid));
    const tpl = db.prepare("SELECT id FROM crm_templates WHERE tenant_id = ? AND categoria = 'followup' AND ativo = 1 LIMIT 1").get(T(tid));
    const sugestoes = parados.map(c => ({
      contato_id: c.id, nome: c.nome, telefone: c.telefone, score: c.score,
      dias_parado: Math.floor((Date.now() - Date.parse(c.ultima_interacao)) / 86400000),
      mensagem: tpl ? Templates.render(tid, tpl.id, c.id).corpo : `Oi, ${(c.nome || '').split(' ')[0]}! Passando para saber se ainda posso ajudar. 😊`,
    }));
    const logId = logIA(tid, 'followup', '', { parados: parados.length }, { sugestoes: sugestoes.length });
    return { sugestoes, log_id: logId };
  },
  // Agente de reativação: clientes antigos com potencial
  reativacao(tid) {
    const cfg = (Config.obter(tid) || { config: {} }).config;
    const corte = new Date(Date.now() - Number(cfg.reativacao_dias || 90) * 86400000).toISOString();
    const antigos = db.prepare(`SELECT id, nome, telefone, tipo, ticket_centavos, ultima_interacao FROM crm_contatos
      WHERE tenant_id = ? AND status = 'ativo' AND tipo IN ('hospede','cliente-recorrente','aluno','comprador-livro')
      AND ultima_interacao != '' AND ultima_interacao < ? ORDER BY ticket_centavos DESC LIMIT 20`).all(T(tid), corte);
    const logId = logIA(tid, 'reativacao', '', { corte }, { candidatos: antigos.length });
    return { candidatos: antigos, log_id: logId };
  },
  // Agente de análise de perdas
  perdas(tid) {
    const motivos = db.prepare(`SELECT motivo, COUNT(*) n FROM crm_oportunidades WHERE tenant_id = ? AND status = 'perdida' AND motivo != '' GROUP BY motivo ORDER BY n DESC LIMIT 10`).all(T(tid));
    const porOrigem = db.prepare(`SELECT c.origem, COUNT(*) n FROM crm_oportunidades o JOIN crm_contatos c ON c.id = o.contato_id
      WHERE o.tenant_id = ? AND o.status = 'perdida' GROUP BY c.origem ORDER BY n DESC LIMIT 10`).all(T(tid));
    const sugestoes = [];
    if (motivos[0]) sugestoes.push(`Maior motivo de perda: "${motivos[0].motivo}" (${motivos[0].n}×) — atacar com template/oferta específica.`);
    if (porOrigem[0] && porOrigem[0].origem) sugestoes.push(`Origem com mais perdas: ${porOrigem[0].origem} — revisar qualificação na entrada.`);
    const saida = { motivos, por_origem: porOrigem, sugestoes };
    const logId = logIA(tid, 'perdas', '', {}, saida);
    return { ...saida, log_id: logId };
  },
  // Agente de resposta: sugere resposta personalizada por canal (motor de regras/templates)
  resposta(tid, contatoId, { canal = 'whatsapp', objetivo = 'followup' } = {}) {
    const c = Contatos.obter(tid, contatoId);
    if (!c) throw new Error('Contato não encontrado.');
    const tpl = db.prepare('SELECT id FROM crm_templates WHERE tenant_id = ? AND categoria = ? AND canal = ? AND ativo = 1 LIMIT 1').get(T(tid), s(objetivo, 40), s(canal, 20))
      || db.prepare('SELECT id FROM crm_templates WHERE tenant_id = ? AND categoria = ? AND ativo = 1 LIMIT 1').get(T(tid), s(objetivo, 40));
    const msg = tpl ? Templates.render(tid, tpl.id, contatoId) : { corpo: `Olá, ${(c.nome || '').split(' ')[0]}! Como posso ajudar?`, assunto: '' };
    const logId = logIA(tid, 'resposta', contatoId, { canal, objetivo }, { corpo: msg.corpo });
    return { ...msg, log_id: logId };
  },
  logs(tid, n = 100) {
    return db.prepare('SELECT * FROM crm_ia_logs WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT ?').all(T(tid), Math.min(Number(n) || 100, 300))
      .map(l => ({ ...l, entrada: j.parse(l.entrada, {}), saida: j.parse(l.saida, {}) }));
  },
  avaliarLog(tid, id, status) {
    if (!['aceito', 'descartado'].includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE crm_ia_logs SET status = ? WHERE tenant_id = ? AND id = ?').run(status, T(tid), T(id));
    return { ok: true };
  },
};

// =====================================================================
// API KEYS (API pública do tenant)
// =====================================================================
const ApiKeys = {
  listar: (tid) => db.prepare('SELECT id, nome, ativo, criado_em, ultimo_uso, substr(chave,1,8) || \'••••\' AS chave_mascarada FROM crm_api_keys WHERE tenant_id = ?').all(T(tid)),
  criar(tid, nome) {
    const chave = 'vc_' + crypto.randomBytes(18).toString('base64url');
    db.prepare('INSERT INTO crm_api_keys (id, tenant_id, chave, nome, ativo, criado_em) VALUES (?,?,?,?,1,?)')
      .run(novoId(), T(tid), chave, s(nome, 80) || 'chave', nowISO());
    return { chave }; // só exibida na criação
  },
  resolver(chave) {
    const k = db.prepare('SELECT * FROM crm_api_keys WHERE chave = ? AND ativo = 1').get(s(chave, 80));
    if (k) db.prepare('UPDATE crm_api_keys SET ultimo_uso = ? WHERE id = ?').run(nowISO(), k.id);
    return k || null;
  },
  revogar(tid, id) { db.prepare('UPDATE crm_api_keys SET ativo = 0 WHERE tenant_id = ? AND id = ?').run(T(tid), T(id)); return { ok: true }; },
};

// =====================================================================
// DASHBOARD COMERCIAL do tenant
// =====================================================================
function dashboard(tid) {
  const um = (sql, ...a) => db.prepare(sql).get(T(tid), ...a).n;
  const hoje = hojeISO();
  const seteDias = new Date(Date.now() - 7 * 86400000).toISOString();
  const abertas = db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v, COUNT(*) n FROM crm_oportunidades WHERE tenant_id = ? AND status = 'aberta'").get(T(tid));
  const ganhas = db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v, COUNT(*) n FROM crm_oportunidades WHERE tenant_id = ? AND status = 'ganha'").get(T(tid));
  const perdidas = um("SELECT COUNT(*) n FROM crm_oportunidades WHERE tenant_id = ? AND status = 'perdida'");
  const decididas = ganhas.n + perdidas;
  // tempo médio de fechamento (dias) das ganhas
  const tm = db.prepare("SELECT AVG(julianday(fechada_em) - julianday(criado_em)) d FROM crm_oportunidades WHERE tenant_id = ? AND status = 'ganha' AND fechada_em != ''").get(T(tid)).d;
  // previsão de receita por mês (previsao das abertas)
  const porMes = db.prepare(`SELECT substr(previsao,1,7) mes, SUM(valor_centavos) v FROM crm_oportunidades
    WHERE tenant_id = ? AND status = 'aberta' AND previsao != '' GROUP BY mes ORDER BY mes LIMIT 6`).all(T(tid));
  return {
    leads_novos_7d: um('SELECT COUNT(*) n FROM crm_contatos WHERE tenant_id = ? AND criado_em >= ?', seteDias),
    contatos_total: um("SELECT COUNT(*) n FROM crm_contatos WHERE tenant_id = ? AND status = 'ativo'"),
    leads_quentes: um("SELECT COUNT(*) n FROM crm_contatos WHERE tenant_id = ? AND status = 'ativo' AND score > 60"),
    leads_sem_acao: um(`SELECT COUNT(*) n FROM crm_contatos WHERE tenant_id = ? AND status = 'ativo' AND responsavel = '' AND ultima_interacao = ''`),
    tarefas_hoje: um("SELECT COUNT(*) n FROM crm_tarefas WHERE tenant_id = ? AND status = 'aberta' AND vence_em = ?", hoje),
    tarefas_atrasadas: um("SELECT COUNT(*) n FROM crm_tarefas WHERE tenant_id = ? AND status = 'aberta' AND vence_em != '' AND vence_em < ?", hoje),
    oportunidades_abertas: abertas.n, valor_em_negociacao_centavos: abertas.v,
    vendas_ganhas: ganhas.n, valor_ganho_centavos: ganhas.v, vendas_perdidas: perdidas,
    taxa_conversao_pct: decididas ? Math.round(100 * ganhas.n / decididas) : 0,
    tempo_medio_fechamento_dias: tm ? Math.round(tm * 10) / 10 : null,
    propostas_enviadas: um("SELECT COUNT(*) n FROM crm_propostas WHERE tenant_id = ? AND status IN ('enviada','visualizada','negociacao')"),
    propostas_aceitas: um("SELECT COUNT(*) n FROM crm_propostas WHERE tenant_id = ? AND status = 'aceita'"),
    propostas_vencidas: um("SELECT COUNT(*) n FROM crm_propostas WHERE tenant_id = ? AND status = 'vencida'"),
    previsao_receita_mes: porMes,
    por_origem: db.prepare(`SELECT origem, COUNT(*) leads,
      SUM(CASE WHEN id IN (SELECT contato_id FROM crm_oportunidades WHERE tenant_id = ? AND status = 'ganha') THEN 1 ELSE 0 END) convertidos
      FROM crm_contatos WHERE tenant_id = ? GROUP BY origem ORDER BY leads DESC LIMIT 15`).all(T(tid), T(tid)),
    receita_por_origem: db.prepare(`SELECT c.origem, SUM(o.valor_centavos) v FROM crm_oportunidades o JOIN crm_contatos c ON c.id = o.contato_id
      WHERE o.tenant_id = ? AND o.status = 'ganha' GROUP BY c.origem ORDER BY v DESC LIMIT 10`).all(T(tid)),
    por_responsavel: db.prepare(`SELECT responsavel, COUNT(*) n, SUM(CASE WHEN status='ganha' THEN 1 ELSE 0 END) ganhas,
      COALESCE(SUM(CASE WHEN status='ganha' THEN valor_centavos ELSE 0 END),0) valor_ganho
      FROM crm_oportunidades WHERE tenant_id = ? AND responsavel != '' GROUP BY responsavel ORDER BY valor_ganho DESC LIMIT 10`).all(T(tid)),
    motivos_perda: db.prepare(`SELECT motivo, COUNT(*) n FROM crm_oportunidades WHERE tenant_id = ? AND status = 'perdida' AND motivo != '' GROUP BY motivo ORDER BY n DESC LIMIT 10`).all(T(tid)),
    por_tipo: db.prepare('SELECT tipo, COUNT(*) n FROM crm_contatos WHERE tenant_id = ? GROUP BY tipo ORDER BY n DESC').all(T(tid)),
    score_faixas: db.prepare(`SELECT CASE WHEN score <= 30 THEN 'frio' WHEN score <= 60 THEN 'morno' WHEN score <= 80 THEN 'quente' ELSE 'muito-quente' END faixa, COUNT(*) n
      FROM crm_contatos WHERE tenant_id = ? AND status = 'ativo' GROUP BY faixa`).all(T(tid)),
  };
}

module.exports = {
  provisionar, Config, TIPOS_CONTATO, ORIGENS, VARIAVEIS, normTelefone,
  calcularScore, faixaScore, recalcularScore, statsDoContato,
  Contatos, Empresas, Funis, Oportunidades, Atividades, Tarefas, Templates, Propostas, Campanhas,
  rodarAutomacoes, Agentes, ApiKeys, dashboard,
};
