// =====================================================================
// Villela Alta Vista 360 — ADMINISTRAÇÃO (Portal Staff).
// Prefixo /staff/api/alta-vista/*, protegido por requireAuth + requireAdmin
// do Portal Staff. Onda 1: catálogo/preços, portfólio, FAQ, conteúdos,
// leads e configuração — tudo editável sem tocar em código.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const repo = require('./repo');
const { db, j } = require('./db');
const { esc, brl2, SITE, BASE } = require('./paginas');
const { Config, Servicos, Combos, Portfolio, Faqs, Conteudos, Leads, Propostas, Interacoes, Tarefas,
  Clientes, Imoveis, Projetos, Mensagens, Auditoria, s, n, STATUS_LEAD, STATUS_PROJETO, TRANSICOES, TERMINAIS } = repo;

function registrarRotasStaff(app, { requireAuth, requireAdmin, enviarEmail = null, notificar = async () => {}, jwtSecret = '' }) {
  const A = [requireAuth, requireAdmin];
  // try/catch explícito: Promise.resolve(fn(...)) NÃO captura throw síncrono
  // (o fn roda antes do wrap) e o erro viraria 500 do Express em vez de 400.
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { res.status(400).json({ erro: e.message }); }
  };
  const quem = (req) => (req.user && (req.user.nome || req.user.email)) || 'staff';
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const aud = (req, acao, ent, id, det) => Auditoria.registrar({ quem: quem(req), acao, entidade: ent, entidade_id: id, detalhe: det, ip: ipDe(req) });

  app.use('/staff/api/alta-vista', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---------------- visão geral ----------------
  app.get('/staff/api/alta-vista/dashboard', ...A, h((req, res) => {
    const c = (sql, ...p) => n((db.prepare(sql).get(...p) || {}).c, 0);
    res.json({
      leads: {
        novos: c("SELECT COUNT(*) c FROM leads WHERE status='novo'"),
        em_contato: c("SELECT COUNT(*) c FROM leads WHERE status='em_contato'"),
        proposta: c("SELECT COUNT(*) c FROM leads WHERE status='proposta'"),
        ganhos: c("SELECT COUNT(*) c FROM leads WHERE status='ganho'"),
        total: c('SELECT COUNT(*) c FROM leads'),
        semana: c('SELECT COUNT(*) c FROM leads WHERE criado_em >= ?', new Date(Date.now() - 7 * 86400000).toISOString()),
      },
      catalogo: {
        servicos: c('SELECT COUNT(*) c FROM servicos WHERE ativo=1'),
        combos: c('SELECT COUNT(*) c FROM combos WHERE ativo=1'),
        portfolio: c('SELECT COUNT(*) c FROM portfolio WHERE publicado=1'),
        conceituais: c('SELECT COUNT(*) c FROM portfolio WHERE publicado=1 AND conceitual=1'),
        conteudos_publicados: c("SELECT COUNT(*) c FROM conteudos WHERE status='publicado'"),
      },
      propostas: {
        enviadas: c("SELECT COUNT(*) c FROM propostas WHERE status='enviada'"),
        aceitas: c("SELECT COUNT(*) c FROM propostas WHERE status='aceita'"),
        valor_aceito_centavos: c("SELECT COALESCE(SUM(total_centavos),0) c FROM propostas WHERE status='aceita'"),
      },
      tarefas_pendentes: c('SELECT COUNT(*) c FROM tarefas WHERE feita=0'),
      conversao_por_origem: Leads.conversaoPorOrigem(),
      config: Config.todos(),
      fundadores: {
        ativo: Config.num('fundadores_ativo', 1),
        vagas_total: Config.num('fundadores_vagas_total', 10),
        usadas: Config.num('fundadores_usadas', 0),
      },
    });
  }));

  // ---------------- configuração ----------------
  app.get('/staff/api/alta-vista/config', ...A, h((req, res) => res.json({ config: Config.todos() })));
  app.patch('/staff/api/alta-vista/config', ...A, h((req, res) => {
    const d = req.body || {};
    for (const [k, v] of Object.entries(d)) Config.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
    aud(req, 'config.editar', 'config', '', Object.keys(d).join(','));
    res.json({ ok: true, config: Config.todos() });
  }));

  // ---------------- catálogo (preços editáveis) ----------------
  app.get('/staff/api/alta-vista/catalogo', ...A, h((req, res) => res.json({
    servicos: Servicos.listar({ incluirInativos: true }),
    combos: Combos.listar({ incluirInativos: true }),
  })));
  app.patch('/staff/api/alta-vista/servicos/:id', ...A, h((req, res) => {
    const sv = Servicos.atualizar(req.params.id, req.body || {});
    aud(req, 'servico.editar', 'servicos', sv.id, `${sv.slug} → ${sv.preco_centavos}`);
    res.json({ ok: true, servico: sv });
  }));
  app.patch('/staff/api/alta-vista/combos/:id', ...A, h((req, res) => {
    const cb = Combos.atualizar(req.params.id, req.body || {});
    aud(req, 'combo.editar', 'combos', cb.id, `${cb.slug} → ${cb.preco_centavos}`);
    res.json({ ok: true, combo: cb });
  }));

  // ---------------- portfólio ----------------
  app.get('/staff/api/alta-vista/portfolio', ...A, h((req, res) => res.json({ itens: Portfolio.listar({ incluirOcultos: true }) })));
  app.post('/staff/api/alta-vista/portfolio', ...A, h((req, res) => {
    const p = Portfolio.salvar(req.body || {}, { quem: quem(req) });
    res.json({ ok: true, item: p });
  }));
  app.delete('/staff/api/alta-vista/portfolio/:id', ...A, h((req, res) => {
    Portfolio.remover(req.params.id, { quem: quem(req) });
    res.json({ ok: true });
  }));

  // ---------------- FAQs ----------------
  app.get('/staff/api/alta-vista/faqs', ...A, h((req, res) => res.json({ faqs: Faqs.listar({ incluirOcultas: true }) })));
  app.post('/staff/api/alta-vista/faqs', ...A, h((req, res) => {
    const f = Faqs.salvar(req.body || {});
    aud(req, 'faq.salvar', 'faqs', f.id, f.pergunta.slice(0, 80));
    res.json({ ok: true, faq: f });
  }));
  app.delete('/staff/api/alta-vista/faqs/:id', ...A, h((req, res) => {
    Faqs.remover(req.params.id);
    aud(req, 'faq.remover', 'faqs', req.params.id, '');
    res.json({ ok: true });
  }));

  // ---------------- conteúdos ----------------
  app.get('/staff/api/alta-vista/conteudos', ...A, h((req, res) => res.json({ conteudos: Conteudos.listarTodos() })));
  app.post('/staff/api/alta-vista/conteudos', ...A, h((req, res) => {
    const c = Conteudos.salvar(req.body || {});
    aud(req, 'conteudo.salvar', 'conteudos', c.id, `${c.slug} (${c.status})`);
    res.json({ ok: true, conteudo: c });
  }));
  app.delete('/staff/api/alta-vista/conteudos/:id', ...A, h((req, res) => {
    Conteudos.remover(req.params.id);
    aud(req, 'conteudo.remover', 'conteudos', req.params.id, '');
    res.json({ ok: true });
  }));

  // ---------------- leads (CRM) ----------------
  app.get('/staff/api/alta-vista/leads', ...A, h((req, res) => res.json({
    leads: Leads.listar({ status: s((req.query || {}).status, 30) }),
    status_possiveis: STATUS_LEAD,
  })));
  app.get('/staff/api/alta-vista/leads.csv', ...A, h((req, res) => {
    const leads = Leads.listar({ limite: 500 });
    const cab = ['criado_em', 'nome', 'email', 'whatsapp', 'cidade', 'tipo_imovel', 'finalidade', 'status', 'pontuacao', 'responsavel', 'origem', 'utm_source', 'motivo_perda'];
    const cel = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const linhas = leads.map((l) => [l.criado_em, l.nome, l.email, l.whatsapp, l.cidade, l.tipo_imovel,
      l.finalidade, l.status, l.pontuacao, l.responsavel, l.origem, (l.utm || {}).utm_source || '', l.motivo_perda].map(cel).join(';'));
    // BOM via fromCharCode: o caractere literal e o escape se perdem em edições do fonte;
    // sem BOM o Excel PT-BR abre o CSV com acento quebrado.
    res.type('text/csv; charset=utf-8').send(String.fromCharCode(0xFEFF) + cab.join(';') + '\n' + linhas.join('\n'));
  }));
  app.get('/staff/api/alta-vista/leads/:id', ...A, h((req, res) => {
    const l = Leads.obter(req.params.id);
    if (!l) return res.status(404).json({ erro: 'Lead não encontrado.' });
    res.json({ lead: l, interacoes: Interacoes.doLead(l.id), tarefas: Tarefas.listar({ lead_id: l.id, pendentes: false }), propostas: Propostas.listar({ lead_id: l.id }) });
  }));
  app.patch('/staff/api/alta-vista/leads/:id', ...A, h((req, res) => {
    res.json({ ok: true, lead: Leads.atualizar(req.params.id, req.body || {}, { quem: quem(req) }) });
  }));
  app.post('/staff/api/alta-vista/leads/:id/status', ...A, h((req, res) => {
    const d = req.body || {};
    const l = Leads.mudarStatus(req.params.id, s(d.status, 30), d.nota, { quem: quem(req), motivo: s(d.motivo, 300) });
    res.json({ ok: true, lead: l });
  }));
  app.post('/staff/api/alta-vista/leads/:id/interacoes', ...A, h((req, res) => {
    const d = req.body || {};
    if (!s(d.texto, 2000)) throw new Error('Texto da interação é obrigatório.');
    Interacoes.registrar(req.params.id, s(d.tipo, 20), d.texto, quem(req));
    res.json({ ok: true, interacoes: Interacoes.doLead(req.params.id) });
  }));

  // ---------------- tarefas ----------------
  app.get('/staff/api/alta-vista/tarefas', ...A, h((req, res) => res.json({ tarefas: Tarefas.listar({ pendentes: (req.query || {}).todas !== '1' }) })));
  app.post('/staff/api/alta-vista/tarefas', ...A, h((req, res) => {
    const d = req.body || {};
    res.json({ ok: true, tarefa: Tarefas.criar({ lead_id: s(d.lead_id, 40), texto: d.texto, vence_em: s(d.vence_em, 10), quem: quem(req) }) });
  }));
  app.post('/staff/api/alta-vista/tarefas/:id/concluir', ...A, h((req, res) => {
    Tarefas.concluir(req.params.id);
    res.json({ ok: true });
  }));

  // ---------------- propostas ----------------
  app.get('/staff/api/alta-vista/propostas', ...A, h((req, res) => res.json({ propostas: Propostas.listar({ lead_id: s((req.query || {}).lead_id, 40) }) })));
  app.post('/staff/api/alta-vista/propostas', ...A, h((req, res) => {
    const p = Propostas.criar(req.body || {}, { quem: quem(req) });
    res.json({ ok: true, proposta: p, link: `${SITE}${BASE}/proposta/${p.token}` });
  }));
  app.post('/staff/api/alta-vista/propostas/:id/enviar', ...A, h(async (req, res) => {
    const p = Propostas.enviar(req.params.id, { quem: quem(req) });
    const lead = Leads.obter(p.lead_id);
    const link = `${SITE}${BASE}/proposta/${p.token}`;
    let emailEnviado = false;
    if (lead && lead.email && typeof enviarEmail === 'function') {
      await enviarEmail(lead.email, 'Sua proposta — Villela Alta Vista 360',
        `<p>Olá, ${esc(lead.nome)}!</p>
         <p>Sua proposta da <b>Villela Alta Vista 360</b> está pronta: <b>${brl2(p.total_centavos)}</b>
         (${p.itens.map((i) => esc(i.nome)).join(' + ')}), válida por ${p.validade_dias} dia(s).</p>
         <p><a href="${link}">Ver a proposta e aceitar on-line</a></p>
         <p>Qualquer dúvida, é só responder este e-mail.<br>— Villela Alta Vista 360 · Seu espaço visto por todos os ângulos.</p>`).catch(() => {});
      emailEnviado = true;
      Interacoes.registrar(p.lead_id, 'email', 'proposta enviada por e-mail: ' + link, quem(req));
    }
    res.json({ ok: true, proposta: p, link, email_enviado: emailEnviado });
  }));
  app.post('/staff/api/alta-vista/propostas/:id/status', ...A, h((req, res) => {
    res.json({ ok: true, proposta: Propostas.marcarStatus(req.params.id, s((req.body || {}).status, 20), { quem: quem(req) }) });
  }));

  // ---------------- Onda 3: clientes ----------------
  app.get('/staff/api/alta-vista/clientes', ...A, h((req, res) => res.json({ clientes: Clientes.listar() })));
  app.get('/staff/api/alta-vista/clientes/:id', ...A, h((req, res) => {
    const c = Clientes.obter(req.params.id);
    if (!c) return res.status(404).json({ erro: 'Cliente não encontrado.' });
    res.json({ cliente: c, imoveis: Imoveis.doCliente(c.id), projetos: Projetos.doCliente(c.id) });
  }));

  // convite: (re)envia o link de definição de senha para o cliente
  const enviarConvite = async (cliente) => {
    if (!cliente.email || typeof enviarEmail !== 'function' || !jwtSecret) return false;
    const tok = jwt.sign({ tipo: 'av-senha', uid: cliente.id }, jwtSecret, { expiresIn: '7d' });
    const link = `${SITE}${BASE}/definir-senha?token=${tok}`;
    await enviarEmail(cliente.email, 'Seu acesso — Villela Alta Vista 360',
      `<p>Olá, ${esc(cliente.nome)}!</p>
       <p>Criamos o seu acesso ao painel da <b>Villela Alta Vista 360</b> — por lá você acompanha o projeto, preenche o briefing e fala com a equipe.</p>
       <p><a href="${link}">Definir minha senha e entrar</a> (link válido por 7 dias)</p>
       <p>— Villela Alta Vista 360 · Seu espaço visto por todos os ângulos.</p>`).catch(() => {});
    return true;
  };
  app.post('/staff/api/alta-vista/clientes/:id/convite', ...A, h(async (req, res) => {
    const c = Clientes.obter(req.params.id);
    if (!c) return res.status(404).json({ erro: 'Cliente não encontrado.' });
    const enviado = await enviarConvite(c);
    aud(req, 'cliente.convite', 'clientes', c.id, c.email);
    res.json({ ok: true, email_enviado: enviado });
  }));

  // ---------------- Onda 3: projetos ----------------
  app.get('/staff/api/alta-vista/projetos', ...A, h((req, res) => {
    const projetos = Projetos.listar({ status: s((req.query || {}).status, 40) })
      .map((p) => ({ ...p, cliente: Clientes.obter(p.cliente_id) }));
    res.json({ projetos, status_rotulos: STATUS_PROJETO, transicoes: TRANSICOES, terminais: TERMINAIS });
  }));
  app.get('/staff/api/alta-vista/projetos/:id', ...A, h((req, res) => {
    const p = Projetos.obter(req.params.id);
    if (!p) return res.status(404).json({ erro: 'Projeto não encontrado.' });
    const arquivos = require('./arquivos');
    res.json({
      projeto: p, cliente: Clientes.obter(p.cliente_id),
      imovel: p.imovel_id ? Imoveis.obter(p.cliente_id, p.imovel_id) : null,
      eventos: Projetos.eventos(p.id), mensagens: Mensagens.doProjeto(p.id),
      entregas: arquivos.Entregas.doProjeto(p.id), materiais: arquivos.Materiais.doProjeto(p.id),
      status_rotulos: STATUS_PROJETO, transicoes: TRANSICOES, terminais: TERMINAIS,
    });
  }));
  app.post('/staff/api/alta-vista/projetos', ...A, h((req, res) => {
    const p = Projetos.criar(req.body || {}, { quem: quem(req) });
    res.json({ ok: true, projeto: p });
  }));
  app.post('/staff/api/alta-vista/projetos/de-proposta/:propostaId', ...A, h(async (req, res) => {
    const { projeto, cliente, clienteNovo } = Projetos.criarDeProposta(req.params.propostaId, { quem: quem(req) });
    let convite = false;
    if (clienteNovo || !cliente.tem_senha) convite = await enviarConvite(Clientes.porEmail(cliente.email) ? { ...cliente } : cliente);
    aud(req, 'projeto.de_proposta', 'projetos', projeto.id, `cliente ${cliente.email}${clienteNovo ? ' (novo)' : ''}`);
    res.json({ ok: true, projeto, cliente, cliente_novo: clienteNovo, convite_enviado: convite });
  }));
  app.post('/staff/api/alta-vista/projetos/:id/status', ...A, h((req, res) => {
    const d = req.body || {};
    const p = Projetos.mudarStatus(req.params.id, s(d.status, 40), { quem: quem(req), justificativa: s(d.justificativa, 500) });
    res.json({ ok: true, projeto: p });
  }));
  app.patch('/staff/api/alta-vista/projetos/:id', ...A, h((req, res) => {
    res.json({ ok: true, projeto: Projetos.atualizar(req.params.id, req.body || {}, { quem: quem(req) }) });
  }));
  app.post('/staff/api/alta-vista/projetos/:id/mensagens', ...A, h(async (req, res) => {
    const p = Projetos.obter(req.params.id);
    if (!p) return res.status(404).json({ erro: 'Projeto não encontrado.' });
    const m = Mensagens.enviar(p.id, { autor: 'equipe', autor_nome: quem(req), texto: (req.body || {}).texto });
    const cliente = Clientes.obter(p.cliente_id);
    if (cliente && cliente.email && typeof enviarEmail === 'function') {
      enviarEmail(cliente.email, `Nova mensagem no seu projeto — Villela Alta Vista 360`,
        `<p>Olá, ${esc(cliente.nome)}! A equipe respondeu no projeto <b>${esc(p.titulo)}</b>:</p>
         <blockquote>${esc(m.texto)}</blockquote>
         <p><a href="${SITE}${BASE}/app">Abrir o painel para responder</a></p>`).catch(() => {});
    }
    res.json({ ok: true, mensagens: Mensagens.doProjeto(p.id) });
  }));

  // ---------------- Onda 4: cobrança e financeiro ----------------
  const billing = require('./billing');
  app.post('/staff/api/alta-vista/projetos/:id/cobranca', ...A, h((req, res) => {
    const d = req.body || {};
    const p = Projetos.obter(req.params.id);
    if (!p) return res.status(404).json({ erro: 'Projeto não encontrado.' });
    // presencial por padrão vem da recomendação do lead; o staff pode sobrescrever
    let presencial = true;
    if (d.presencial != null) presencial = !!d.presencial;
    else if (p.lead_id) {
      const lead = Leads.obter(p.lead_id);
      if (lead && lead.recomendacao && lead.recomendacao.atendimento) presencial = lead.recomendacao.atendimento === 'presencial';
    }
    const parcelas = billing.gerarParcelas(p.id, { presencial, quem: quem(req) });
    res.json({ ok: true, parcelas, presencial });
  }));
  app.get('/staff/api/alta-vista/projetos/:id/parcelas', ...A, h((req, res) => {
    res.json({ parcelas: billing.Parcelas.doProjeto(req.params.id), saldo_centavos: billing.saldo(req.params.id), pagamento_online: billing.ativo() });
  }));
  app.post('/staff/api/alta-vista/parcelas/:id/marcar-pago', ...A, h((req, res) => {
    res.json({ ok: true, parcela: billing.marcarPagoManual(req.params.id, { quem: quem(req), justificativa: (req.body || {}).justificativa }) });
  }));
  app.post('/staff/api/alta-vista/parcelas/:id/reembolsar', ...A, h(async (req, res) => {
    res.json({ ok: true, parcela: await billing.reembolsar(req.params.id, { quem: quem(req), confirmar: !!(req.body || {}).confirmar }) });
  }));
  app.get('/staff/api/alta-vista/financeiro', ...A, h((req, res) => {
    res.json({ ...billing.financeiro(), despesas: billing.Despesas.listar(), pagamento_online: billing.ativo() });
  }));
  app.get('/staff/api/alta-vista/financeiro.csv', ...A, h((req, res) => {
    const parcelas = db.prepare(`SELECT pa.criado_em, pr.titulo, pa.rotulo, pa.valor_centavos, pa.status,
        pa.pago_em, pa.pago_via, pa.mp_payment_id
      FROM parcelas pa LEFT JOIN projetos pr ON pr.id = pa.projeto_id ORDER BY pa.criado_em DESC LIMIT 1000`).all();
    const cel = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const linhas = parcelas.map((p) => [p.criado_em, p.titulo, p.rotulo, (p.valor_centavos / 100).toFixed(2).replace('.', ','), p.status, p.pago_em, p.pago_via, p.mp_payment_id].map(cel).join(';'));
    res.type('text/csv; charset=utf-8').send(String.fromCharCode(0xFEFF) + 'criado_em;projeto;parcela;valor;status;pago_em;via;mp_payment_id\n' + linhas.join('\n'));
  }));
  app.post('/staff/api/alta-vista/despesas', ...A, h((req, res) => {
    res.json({ ok: true, despesa: billing.Despesas.criar(req.body || {}, { quem: quem(req) }) });
  }));
  app.delete('/staff/api/alta-vista/despesas/:id', ...A, h((req, res) => {
    billing.Despesas.remover(req.params.id, { quem: quem(req) });
    res.json({ ok: true });
  }));

  // ---------------- Onda 5: entregas, versões e materiais ----------------
  const arq = require('./arquivos');
  app.post('/staff/api/alta-vista/projetos/:id/entregas', ...A, h((req, res) => {
    const d = req.body || {};
    res.json({ ok: true, entrega: arq.Entregas.criar(req.params.id, { titulo: d.titulo, tipo: d.tipo }, { quem: quem(req) }) });
  }));
  app.post('/staff/api/alta-vista/entregas/:id/upload-url', ...A, h((req, res) => {
    const d = req.body || {};
    if (!db.prepare('SELECT 1 FROM entregas WHERE id = ?').get(req.params.id)) return res.status(404).json({ erro: 'Entrega não encontrada.' });
    res.json({ ok: true, ...arq.Uploads.criar(s(d.mime, 60), { tipo: 'versao', entrega_id: req.params.id, tamanho: n(d.tamanho, 0) }) });
  }));
  app.post('/staff/api/alta-vista/entregas/:id/versoes', ...A, h(async (req, res) => {
    const d = req.body || {};
    const v = await arq.Versoes.criar(req.params.id, { upload_id: d.upload_id, nota: d.nota, quem: quem(req) });
    // avisa o cliente que há material novo para revisar
    const e = db.prepare('SELECT * FROM entregas WHERE id = ?').get(req.params.id);
    const p = Projetos.obter(e.projeto_id);
    const cliente = p ? Clientes.obter(p.cliente_id) : null;
    if (cliente && cliente.email && typeof enviarEmail === 'function' && !cliente.email.endsWith('.invalid')) {
      enviarEmail(cliente.email, 'Nova versão para você revisar — Villela Alta Vista 360',
        `<p>Olá, ${esc(cliente.nome)}!</p>
         <p>A versão ${v.numero} de <b>${esc(e.titulo)}</b> está pronta para a sua revisão no projeto <b>${esc(p.titulo)}</b>.</p>
         <p><a href="${SITE}${BASE}/app">Abrir o painel, comentar e aprovar</a></p>`).catch(() => {});
    }
    res.json({ ok: true, versao: v });
  }));
  app.get('/staff/api/alta-vista/versoes/:id/ver', ...A, h((req, res) => {
    const storage = require('./storage');
    const v = arq.Versoes.obter(req.params.id);
    if (!v) return res.status(404).json({ erro: 'Versão não encontrada.' });
    res.json({ ok: true, url: storage.assinarUrl(v.chave, 600), mime: v.mime });
  }));
  app.post('/staff/api/alta-vista/versoes/:id/comentarios', ...A, h((req, res) => {
    const d = req.body || {};
    const c = arq.Comentarios.criar(req.params.id, { autor: 'equipe', autor_nome: quem(req), texto: d.texto, ancora: d.ancora });
    res.json({ ok: true, comentario: c });
  }));
  app.get('/staff/api/alta-vista/materiais/:id/ver', ...A, h((req, res) => {
    res.json({ ok: true, ...arq.Materiais.ver(req.params.id) });
  }));

  // ---------------- Onda 6: tours 360° ----------------
  const { Tours, Cenas, Hotspots } = require('./tours');
  const storage = require('./storage');
  app.get('/staff/api/alta-vista/tours', ...A, h((req, res) => {
    const tours = Tours.listar().map((t) => ({ ...t, cliente: Clientes.obter(t.cliente_id) }));
    res.json({ tours });
  }));
  app.post('/staff/api/alta-vista/tours', ...A, h((req, res) => {
    const d = req.body || {};
    let clienteId = s(d.cliente_id, 40);
    if (!clienteId && d.projeto_id) { const p = Projetos.obter(d.projeto_id); clienteId = p ? p.cliente_id : ''; }
    res.json({ ok: true, tour: Tours.criar({ cliente_id: clienteId, projeto_id: s(d.projeto_id, 40), titulo: d.titulo }, { quem: quem(req) }) });
  }));
  app.get('/staff/api/alta-vista/tours/:id', ...A, h((req, res) => {
    const t = Tours.obter(req.params.id);
    if (!t) return res.status(404).json({ erro: 'Tour não encontrado.' });
    res.json({
      tour: t, cliente: Clientes.obter(t.cliente_id), problemas: Tours.validar(t.id), stats: Tours.stats(t.id),
      url: `${SITE}${BASE}/t/${t.slug}`,
      preview_url: `${SITE}${BASE}/t/${t.slug}?chave=${t.preview_token}`,
      editor_url: `${SITE}${BASE}/t/${t.slug}?chave=${t.preview_token}&editor=1`,
    });
  }));
  app.patch('/staff/api/alta-vista/tours/:id', ...A, h((req, res) => {
    res.json({ ok: true, tour: Tours.atualizar(req.params.id, req.body || {}, { quem: quem(req) }) });
  }));
  app.post('/staff/api/alta-vista/tours/:id/publicar', ...A, h((req, res) => {
    res.json({ ok: true, tour: Tours.publicar(req.params.id, { quem: quem(req) }) });
  }));
  app.post('/staff/api/alta-vista/tours/:id/despublicar', ...A, h((req, res) => {
    res.json({ ok: true, tour: Tours.despublicar(req.params.id, { quem: quem(req) }) });
  }));
  app.post('/staff/api/alta-vista/tours/:id/duplicar', ...A, h((req, res) => {
    res.json({ ok: true, tour: Tours.duplicar(req.params.id, { quem: quem(req) }) });
  }));
  app.post('/staff/api/alta-vista/tours/:id/cenas/upload-url', ...A, h((req, res) => {
    const d = req.body || {};
    if (!Tours.obter(req.params.id)) return res.status(404).json({ erro: 'Tour não encontrado.' });
    res.json({ ok: true, ...arq.Uploads.criar(s(d.mime, 60), { tipo: 'tour-cena', tour_id: req.params.id, tamanho: n(d.tamanho, 0) }) });
  }));
  app.post('/staff/api/alta-vista/tours/:id/cenas', ...A, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, cena: await Cenas.criar(req.params.id, { upload_id: d.upload_id, titulo: d.titulo }, { quem: quem(req) }) });
  }));
  app.patch('/staff/api/alta-vista/tours/cenas/:id', ...A, h((req, res) => {
    res.json({ ok: true, cena: Cenas.atualizar(req.params.id, req.body || {}) });
  }));
  app.delete('/staff/api/alta-vista/tours/cenas/:id', ...A, h((req, res) => {
    Cenas.remover(req.params.id, { quem: quem(req) });
    res.json({ ok: true });
  }));
  app.get('/staff/api/alta-vista/tours/cenas/:id/ver', ...A, h((req, res) => {
    const c = Cenas.obter(req.params.id);
    if (!c) return res.status(404).json({ erro: 'Cena não encontrada.' });
    res.json({ ok: true, url: storage.assinarUrl(c.chave, 600) });
  }));
  app.post('/staff/api/alta-vista/tours/cenas/:id/hotspots', ...A, h((req, res) => {
    res.json({ ok: true, hotspot: Hotspots.criar(req.params.id, req.body || {}) });
  }));
  app.delete('/staff/api/alta-vista/tours/hotspots/:id', ...A, h((req, res) => {
    Hotspots.remover(req.params.id);
    res.json({ ok: true });
  }));
  app.post('/staff/api/alta-vista/tours/:id/hotspots/importar', ...A, h((req, res) => {
    res.json({ ok: true, ...Hotspots.importarDoEditor(req.params.id, (req.body || {}).dados, { quem: quem(req) }) });
  }));
  app.get('/staff/api/alta-vista/tours/:id/qr', ...A, h(async (req, res) => {
    const t = Tours.obter(req.params.id);
    if (!t) return res.status(404).json({ erro: 'Tour não encontrado.' });
    const QRCode = require('qrcode');
    const svg = await QRCode.toString(`${SITE}${BASE}/t/${t.slug}`, { type: 'svg', margin: 1, width: 280, color: { dark: '#071A2B', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  }));

  // ---------------- Onda 7: operação, prontidão e lançamento ----------------
  const op = require('./operacao');
  app.get('/staff/api/alta-vista/operacao', ...A, h((req, res) => {
    const projetos = Projetos.listar().map((p) => ({
      ...p, cliente: Clientes.obter(p.cliente_id),
      atrasado: !!(p.prazo_em && p.prazo_em < new Date().toISOString().slice(0, 10)
        && !['delivered', 'portfolio_consent', 'completed', 'archived', 'cancelled'].includes(p.status)),
    }));
    res.json({ projetos, status_rotulos: STATUS_PROJETO, capacidade: op.capacidade() });
  }));
  app.get('/staff/api/alta-vista/projetos/:id/checklists', ...A, h((req, res) => {
    res.json({ checklists: op.Checklists.doProjeto(req.params.id), templates: Object.keys(op.TEMPLATES_CHECKLIST) });
  }));
  app.post('/staff/api/alta-vista/projetos/:id/checklists', ...A, h((req, res) => {
    res.json({ ok: true, checklist: op.Checklists.criar(req.params.id, s((req.body || {}).categoria, 20), { quem: quem(req) }) });
  }));
  app.post('/staff/api/alta-vista/checklists/:id/itens/:itemId', ...A, h((req, res) => {
    res.json({ ok: true, checklist: op.Checklists.marcarItem(req.params.id, req.params.itemId, !!(req.body || {}).feito, { quem: quem(req) }) });
  }));
  app.post('/staff/api/alta-vista/checklists/:id/decisao', ...A, h((req, res) => {
    res.json({ ok: true, checklist: op.Checklists.decidir(req.params.id, s((req.body || {}).decisao, 20), { quem: quem(req) }) });
  }));

  app.get('/staff/api/alta-vista/prontidao', ...A, h((req, res) => {
    res.json({
      itens: op.Prontidao.listar(), apto: op.Prontidao.apto(),
      divulgacao_liberada: Config.num('divulgacao_liberada', 0) === 1,
      capacidade: op.capacidade(),
    });
  }));
  app.post('/staff/api/alta-vista/prontidao/:chave', ...A, h((req, res) => {
    const d = req.body || {};
    res.json({ ok: true, itens: op.Prontidao.marcar(req.params.chave, { feito: !!d.feito, nota: d.nota, quem: quem(req) }), divulgacao_liberada: Config.num('divulgacao_liberada', 0) === 1 });
  }));
  app.post('/staff/api/alta-vista/prontidao-liberar', ...A, h((req, res) => {
    res.json({ ok: true, ...op.Prontidao.liberarDivulgacao({ quem: quem(req) }) });
  }));

  app.get('/staff/api/alta-vista/campanha', ...A, h((req, res) => res.json(op.CustosMarketing.painel())));
  app.post('/staff/api/alta-vista/campanha/custos', ...A, h((req, res) => {
    res.json({ ok: true, custo: op.CustosMarketing.criar(req.body || {}, { quem: quem(req) }) });
  }));
  app.delete('/staff/api/alta-vista/campanha/custos/:id', ...A, h((req, res) => {
    op.CustosMarketing.remover(req.params.id);
    res.json({ ok: true });
  }));

  app.get('/staff/api/alta-vista/relatorios', ...A, h((req, res) => res.json(op.relatorios())));

  // ---------------- auditoria ----------------
  app.get('/staff/api/alta-vista/auditoria', ...A, h((req, res) => res.json({ eventos: Auditoria.listar(n((req.query || {}).limite, 200)) })));
}

module.exports = { registrarRotasStaff };
