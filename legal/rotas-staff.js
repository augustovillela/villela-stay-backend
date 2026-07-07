// =====================================================================
// Villela Legal Intelligence — rotas da API (Portal Staff)
// Prefixo /staff/api/legal/*. Autenticação via requireAuth (injetado do
// server.js). Autorização via matriz de permissões (permissoes.js).
// Ingestão por agentes (andamentos/publicações/webhooks/IA) aceita a
// PUBLISH_KEY via requirePublishOrSession — perfil efetivo: agente_ia.
// Toda escrita registra auditoria em audit_logs.
// =====================================================================
'use strict';

function registrarRotasStaff(app, deps) {
  const { repo, permissoes, feriados, ia, llm, pecas, contratos, portalCliente, notif, jwtSecret, requireAuth, requirePublishOrSession, lerUsuarios } = deps;
  const jwt = require('jsonwebtoken');
  const ipDe = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();

  // permissões efetivas do request (sessão => usuário do portal; PUBLISH_KEY => agente_ia)
  function permsDe(req) {
    if (req.viaChave) {
      const def = permissoes.PERFIS.find(x => x.id === 'agente_ia');
      const set = {}; for (const p of permissoes.PERMISSOES) set[p] = def.permissoes.includes(p);
      return { perfil: 'agente_ia', nome: def.nome, permissoes: set };
    }
    return permissoes.permissoesDe(req.user);
  }
  const quemFez = (req) => req.viaChave ? 'agente/chave' : ((req.user && (req.user.nome || req.user.email)) || 'desconhecido');
  const auditar = (req, acao, entidade, entidade_id, detalhe) => repo.Auditoria.registrar({
    user_id: req.user && req.user.id, quem: quemFez(req), acao, entidade, entidade_id, detalhe, ip: ipDe(req),
  });

  // guard: exige acesso ao módulo + uma permissão específica
  const pode = (perm) => (req, res, next) => {
    const p = permsDe(req);
    if (!p) return res.status(403).json({ erro: 'Sem acesso ao módulo jurídico. Peça ao administrador um perfil na aba Equipe.' });
    if (perm && !p.permissoes[perm]) return res.status(403).json({ erro: 'Sem permissão para esta ação (' + perm + ').' });
    req.legal = p;
    next();
  };

  app.use('/staff/api/legal', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // erro padronizado p/ handlers síncronos
  const h = (fn) => (req, res) => { try { fn(req, res); } catch (e) { res.status(400).json({ erro: e.message }); } };

  // ------------------------------------------------------- EU / CATÁLOGOS
  app.get('/staff/api/legal/eu', requireAuth, h((req, res) => {
    const p = permsDe(req);
    if (!p) return res.status(403).json({ erro: 'Sem acesso ao módulo jurídico.' });
    res.json({ ...p, nucleos: permissoes.NUCLEOS, enums: repo.E });
  }));

  app.get('/staff/api/legal/dashboard', requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ resumo: repo.Dashboard.resumo() });
  }));

  // ------------------------------------------------------- EQUIPE (perfis jurídicos)
  app.get('/staff/api/legal/equipe', requireAuth, pode('gerir_usuarios'), h((req, res) => {
    // usuários do portal disponíveis p/ receber perfil + perfis já atribuídos
    const portal = lerUsuarios().filter(u => u.ativo).map(u => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, areas: u.areas || [] }));
    res.json({ membros: permissoes.listarEquipe(), usuariosPortal: portal, perfis: permissoes.PERFIS.map(p => ({ id: p.id, nome: p.nome, permissoes: p.permissoes })) });
  }));
  app.post('/staff/api/legal/equipe', requireAuth, pode('gerir_usuarios'), h((req, res) => {
    const d = req.body || {};
    const portal = lerUsuarios().find(u => u.id === d.id);
    if (!portal) return res.status(404).json({ erro: 'Usuário do portal não encontrado.' });
    const m = permissoes.salvarMembro({ id: portal.id, nome: portal.nome, email: portal.email, role_id: d.role_id, oab: d.oab, nucleos: d.nucleos, ativo: d.ativo });
    auditar(req, 'equipe.perfil', 'users', portal.id, `perfil ${d.role_id} p/ ${portal.email}`);
    res.json({ ok: true, membro: m });
  }));

  // ------------------------------------------------------- CLIENTES
  app.get('/staff/api/legal/clientes', requireAuth, pode('gerir_clientes'), h((req, res) => {
    res.json({ clientes: repo.Clientes.listar(req.query) });
  }));
  app.get('/staff/api/legal/clientes/:id', requireAuth, pode('gerir_clientes'), h((req, res) => {
    const c = repo.Clientes.obter(req.params.id);
    if (!c) return res.status(404).json({ erro: 'Cliente não encontrado.' });
    if (!req.legal.permissoes.ver_dados_sensiveis) { c.cpf_cnpj = c.cpf_cnpj ? '***' : ''; c.rg = c.rg ? '***' : ''; }
    res.json({ cliente: c });
  }));
  app.post('/staff/api/legal/clientes', requireAuth, pode('gerir_clientes'), h((req, res) => {
    const c = repo.Clientes.criar(req.body || {}, req.user && req.user.id);
    auditar(req, 'cliente.criar', 'clients', c.id, c.nome);
    res.json({ ok: true, cliente: c });
  }));
  app.patch('/staff/api/legal/clientes/:id', requireAuth, pode('gerir_clientes'), h((req, res) => {
    const c = repo.Clientes.atualizar(req.params.id, req.body || {});
    auditar(req, 'cliente.editar', 'clients', c.id, c.nome);
    res.json({ ok: true, cliente: c });
  }));
  app.post('/staff/api/legal/clientes/:id/contatos', requireAuth, pode('gerir_clientes'), h((req, res) => {
    const id = repo.Clientes.addContato(req.params.id, req.body || {});
    auditar(req, 'cliente.contato', 'client_contacts', id, '');
    res.json({ ok: true, id });
  }));
  app.post('/staff/api/legal/clientes/:id/consentimentos', requireAuth, pode('gerir_clientes'), h((req, res) => {
    const id = repo.Clientes.addConsentimento(req.params.id, req.body || {});
    auditar(req, 'cliente.consentimento', 'client_consents', id, (req.body || {}).finalidade);
    res.json({ ok: true, id });
  }));
  app.post('/staff/api/legal/clientes/:id/notas', requireAuth, pode('gerir_clientes'), h((req, res) => {
    const d = req.body || {};
    const id = repo.Clientes.addNota(req.params.id, d, quemFez(req));
    // nota NÃO interna = mensagem ao cliente → avisa no portal/e-mail
    if (d.interna === false) {
      notif.notificarCliente(req.params.id, {
        titulo: 'Nova mensagem do escritório', corpo: String(d.texto || '').slice(0, 300),
        ref_tipo: 'client', ref_id: req.params.id,
      }).catch(() => {});
    }
    res.json({ ok: true, id });
  }));

  // ------------------------------------------------------- PORTAL DO CLIENTE (Fase 5): acesso
  app.get('/staff/api/legal/clientes/:id/portal-acesso', requireAuth, pode('gerir_clientes'), h((req, res) => {
    res.json({ conta: portalCliente.Contas.de(req.params.id) || null });
  }));
  app.post('/staff/api/legal/clientes/:id/portal-acesso', requireAuth, pode('gerir_clientes'), h((req, res) => {
    const r = portalCliente.Contas.criarOuResetar(req.params.id, (req.body || {}).email);
    const token = jwt.sign({ tipo: 'legal-cli-setup', aid: r.account_id }, jwtSecret, { expiresIn: '7d' });
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const url = `${proto}://${req.get('host')}/cliente-juridico/definir-senha?token=${token}`;
    auditar(req, 'cliente.portal-acesso', 'client_accounts', r.account_id, (r.reset ? 'reset ' : 'criado ') + r.email);
    res.json({ ok: true, ...r, url, validade: '7 dias' });
  }));

  // ------------------------------------------------------- PROCESSOS
  app.get('/staff/api/legal/processos', requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ processos: repo.Processos.listar(req.query) });
  }));
  app.get('/staff/api/legal/processos/:id', requireAuth, pode('ver_processos'), h((req, res) => {
    const c = repo.Processos.obter(req.params.id, { comSigilo: !!req.legal.permissoes.ver_dados_sensiveis });
    if (!c) return res.status(404).json({ erro: 'Processo não encontrado.' });
    res.json({ processo: c });
  }));
  app.post('/staff/api/legal/processos', requireAuth, pode('criar_processos'), h((req, res) => {
    const c = repo.Processos.criar(req.body || {}, req.user && req.user.id);
    auditar(req, 'processo.criar', 'cases', c.id, c.numero_cnj || c.assunto);
    res.json({ ok: true, processo: c });
  }));
  app.patch('/staff/api/legal/processos/:id', requireAuth, pode('editar_processos'), h((req, res) => {
    const c = repo.Processos.atualizar(req.params.id, req.body || {});
    auditar(req, 'processo.editar', 'cases', c.id, c.numero_cnj);
    res.json({ ok: true, processo: c });
  }));
  app.post('/staff/api/legal/processos/:id/partes', requireAuth, pode('editar_processos'), h((req, res) => {
    const id = repo.Processos.addParte(req.params.id, req.body || {});
    auditar(req, 'processo.parte', 'case_parties', id, '');
    res.json({ ok: true, id });
  }));
  app.post('/staff/api/legal/processos/:id/advogados', requireAuth, pode('editar_processos'), h((req, res) => {
    const id = repo.Processos.addAdvogado(req.params.id, req.body || {});
    res.json({ ok: true, id });
  }));

  // ------------------------------------------------------- ANDAMENTOS (ingestão: sessão OU PUBLISH_KEY)
  app.get('/staff/api/legal/processos/:id/andamentos', requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ andamentos: repo.Andamentos.listar({ case_id: req.params.id, ...req.query }) });
  }));
  app.post('/staff/api/legal/processos/:id/andamentos', requirePublishOrSession, pode('editar_processos'), h((req, res) => {
    const r = repo.Andamentos.criar(req.params.id, req.body || {}, req.user && req.user.id);
    if (!r.duplicado) {
      auditar(req, 'andamento.criar', 'case_movements', r.id, (req.body || {}).fonte || 'manual');
      // notifica o cliente do processo (best-effort, não bloqueia a resposta)
      const kase = require('./db').db.prepare('SELECT client_id, numero_cnj, sigiloso FROM cases WHERE id = ?').get(req.params.id);
      if (kase && kase.client_id && !kase.sigiloso && (req.body || {}).notificar_cliente !== false) {
        const d = req.body || {};
        notif.notificarCliente(kase.client_id, {
          titulo: 'Novidade no seu processo ' + (kase.numero_cnj || ''),
          corpo: String(d.resumo || d.descricao || '').slice(0, 300),
          ref_tipo: 'case', ref_id: req.params.id,
        }).catch(() => {});
      }
    }
    res.json({ ok: true, ...r });
  }));

  // ------------------------------------------------------- PUBLICAÇÕES (ingestão idem)
  app.get('/staff/api/legal/publicacoes', requireAuth, pode('gerir_publicacoes'), h((req, res) => {
    res.json({ publicacoes: repo.Publicacoes.listar(req.query) });
  }));
  app.post('/staff/api/legal/publicacoes', requirePublishOrSession, pode('gerir_publicacoes'), h((req, res) => {
    const r = repo.Publicacoes.criar(req.body || {}, req.user && req.user.id);
    if (!r.duplicado) auditar(req, 'publicacao.criar', 'case_publications', r.id, (req.body || {}).fonte || 'manual');
    res.json({ ok: true, ...r });
  }));
  app.patch('/staff/api/legal/publicacoes/:id', requireAuth, pode('gerir_publicacoes'), h((req, res) => {
    const p = repo.Publicacoes.atualizar(req.params.id, req.body || {});
    auditar(req, 'publicacao.editar', 'case_publications', p.id, p.status);
    res.json({ ok: true, publicacao: p });
  }));

  // ------------------------------------------------------- PRAZOS
  app.get('/staff/api/legal/prazos', requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ prazos: repo.Prazos.listar(req.query) });
  }));
  // calculadora de prazo (Fase 2): SUGESTÃO auditada — nunca vira prazo válido sem validação humana
  app.post('/staff/api/legal/prazos/calcular', requirePublishOrSession, pode('gerir_prazos'), h((req, res) => {
    const d = req.body || {};
    const r = feriados.calcularPrazo({ termo_inicial: d.termo_inicial, dias: d.dias, modo: d.modo, ambito: d.ambito }, quemFez(req));
    res.json({ ok: true, ...r, aviso: 'Sugestão automática — validação por advogado obrigatória (validado_por).' });
  }));
  app.post('/staff/api/legal/prazos', requirePublishOrSession, pode('gerir_prazos'), h((req, res) => {
    const p = repo.Prazos.criar(req.body || {}, quemFez(req));
    if ((req.body || {}).calculo_log_id) feriados.vincularLog(req.body.calculo_log_id, p.id); // amarra o log do cálculo ao prazo
    auditar(req, 'prazo.criar', 'deadlines', p.id, p.titulo);
    res.json({ ok: true, prazo: p });
  }));
  app.patch('/staff/api/legal/prazos/:id', requireAuth, pode('gerir_prazos'), h((req, res) => {
    const p = repo.Prazos.atualizar(req.params.id, req.body || {}, quemFez(req));
    auditar(req, 'prazo.editar', 'deadlines', p.id, p.status);
    res.json({ ok: true, prazo: p });
  }));
  app.get('/staff/api/legal/prazos/:id/eventos', requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ eventos: repo.Prazos.eventos(req.params.id) });
  }));

  // ------------------------------------------------------- TAREFAS
  app.get('/staff/api/legal/tarefas', requireAuth, pode('gerir_tarefas'), h((req, res) => {
    res.json({ tarefas: repo.Tarefas.listar(req.query) });
  }));
  app.get('/staff/api/legal/tarefas/kanban', requireAuth, pode('gerir_tarefas'), h((req, res) => {
    res.json({ colunas: repo.Tarefas.kanban() });
  }));
  app.post('/staff/api/legal/tarefas', requirePublishOrSession, pode('gerir_tarefas'), h((req, res) => {
    const t = repo.Tarefas.criar(req.body || {}, quemFez(req));
    auditar(req, 'tarefa.criar', 'tasks', t.id, t.titulo);
    res.json({ ok: true, tarefa: t });
  }));
  app.patch('/staff/api/legal/tarefas/:id', requireAuth, pode('gerir_tarefas'), h((req, res) => {
    const t = repo.Tarefas.atualizar(req.params.id, req.body || {}, quemFez(req));
    res.json({ ok: true, tarefa: t });
  }));
  app.get('/staff/api/legal/tarefas/:id/historico', requireAuth, pode('gerir_tarefas'), h((req, res) => {
    res.json({ historico: repo.Tarefas.historico(req.params.id) });
  }));
  app.post('/staff/api/legal/tarefas/:id/comentarios', requireAuth, pode('gerir_tarefas'), h((req, res) => {
    const id = repo.Tarefas.addComentario(req.params.id, (req.body || {}).texto, quemFez(req));
    res.json({ ok: true, id });
  }));
  app.get('/staff/api/legal/tarefas/:id/comentarios', requireAuth, pode('gerir_tarefas'), h((req, res) => {
    res.json({ comentarios: repo.Tarefas.comentarios(req.params.id) });
  }));

  // ------------------------------------------------------- AUDIÊNCIAS (Fase 2)
  app.get('/staff/api/legal/audiencias', requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ audiencias: repo.Audiencias.listar(req.query) });
  }));
  app.get('/staff/api/legal/audiencias/:id', requireAuth, pode('ver_processos'), h((req, res) => {
    const a = repo.Audiencias.obter(req.params.id, { comSigilo: !!req.legal.permissoes.ver_dados_sensiveis });
    if (!a) return res.status(404).json({ erro: 'Audiência não encontrada.' });
    res.json({ audiencia: a });
  }));
  app.post('/staff/api/legal/audiencias', requirePublishOrSession, pode('gerir_prazos'), h((req, res) => {
    const a = repo.Audiencias.criar(req.body || {}, req.user && req.user.id);
    auditar(req, 'audiencia.criar', 'hearings', a.id, a.tipo + ' ' + a.data_hora);
    res.json({ ok: true, audiencia: a });
  }));
  app.patch('/staff/api/legal/audiencias/:id', requireAuth, pode('gerir_prazos'), h((req, res) => {
    const a = repo.Audiencias.atualizar(req.params.id, req.body || {});
    auditar(req, 'audiencia.editar', 'hearings', a.id, a.status);
    res.json({ ok: true, audiencia: a });
  }));
  app.post('/staff/api/legal/audiencias/:id/participantes', requireAuth, pode('gerir_prazos'), h((req, res) => {
    const id = repo.Audiencias.addParticipante(req.params.id, req.body || {});
    res.json({ ok: true, id });
  }));
  app.delete('/staff/api/legal/audiencias/participantes/:id', requireAuth, pode('gerir_prazos'), h((req, res) => {
    repo.Audiencias.rmParticipante(req.params.id);
    res.json({ ok: true });
  }));
  // providência pós-audiência — opcionalmente já vira tarefa (criar_tarefa: true)
  app.post('/staff/api/legal/audiencias/:id/providencias', requireAuth, pode('gerir_prazos'), h((req, res) => {
    const d = req.body || {};
    let taskId = '';
    if (d.criar_tarefa) {
      const a = repo.Audiencias.obter(req.params.id);
      const t = repo.Tarefas.criar({ titulo: d.descricao, case_id: a && a.case_id, prazo: d.prazo, responsavel: d.responsavel, prioridade: 'alta', descricao: 'Providência pós-audiência ' + req.params.id }, quemFez(req));
      taskId = t.id;
    }
    const id = repo.Audiencias.addProvidencia(req.params.id, d, taskId);
    auditar(req, 'audiencia.providencia', 'hearing_followups', id, d.descricao);
    res.json({ ok: true, id, task_id: taskId });
  }));
  app.patch('/staff/api/legal/providencias/:id', requireAuth, pode('gerir_prazos'), h((req, res) => {
    repo.Audiencias.providenciaStatus(req.params.id, (req.body || {}).status);
    res.json({ ok: true });
  }));

  // ------------------------------------------------------- AGENDA + FERIADOS (Fase 2)
  app.get('/staff/api/legal/agenda', requireAuth, pode('ver_processos'), h((req, res) => {
    res.json(repo.Agenda.proxima(req.query.dias));
  }));
  app.get('/staff/api/legal/feriados', requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ feriados: feriados.Feriados.listar(req.query) });
  }));
  app.post('/staff/api/legal/feriados', requireAuth, pode('gerir_prazos'), h((req, res) => {
    feriados.Feriados.criar(req.body || {});
    auditar(req, 'feriado.criar', 'court_holidays', (req.body || {}).data, (req.body || {}).descricao);
    res.json({ ok: true });
  }));
  app.delete('/staff/api/legal/feriados', requireAuth, pode('gerir_prazos'), h((req, res) => {
    feriados.Feriados.remover(req.query.data, req.query.ambito);
    auditar(req, 'feriado.remover', 'court_holidays', req.query.data, req.query.ambito);
    res.json({ ok: true });
  }));

  // ------------------------------------------------------- IMPORTAÇÃO DO LEGADO (Fase 2)
  // Espelha prazos-juridicos.json (portal antigo) → deadlines. Idempotente ([legado:id]).
  app.post('/staff/api/legal/importar/prazos-legado', requireAuth, pode('gerir_prazos'), h((req, res) => {
    const r = repo.Legado.importarPrazos(req.user && req.user.id);
    auditar(req, 'legado.importar-prazos', 'deadlines', '', `encontrados ${r.encontrados}, importados ${r.importados}, pulados ${r.pulados}`);
    res.json({ ok: true, ...r });
  }));

  // ------------------------------------------------------- DOCUMENTOS
  app.get('/staff/api/legal/documentos', requireAuth, pode('ver_documentos'), h((req, res) => {
    res.json({ documentos: repo.Documentos.listar(req.query) });
  }));
  app.get('/staff/api/legal/documentos/:id', requireAuth, pode('ver_documentos'), h((req, res) => {
    const doc = repo.Documentos.obter(req.params.id);
    if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
    repo.Documentos.logAcesso(doc.id, req.user, 'visualizou', ipDe(req));
    res.json({ documento: doc, acessos: req.legal.permissoes.ver_auditoria ? repo.Documentos.acessos(doc.id) : [] });
  }));
  app.post('/staff/api/legal/documentos', requireAuth, pode('criar_documentos'), h((req, res) => {
    const id = repo.Documentos.criar(req.body || {}, req.user && req.user.id);
    auditar(req, 'documento.criar', 'documents', id, (req.body || {}).titulo);
    res.json({ ok: true, id });
  }));
  app.post('/staff/api/legal/documentos/:id/versao', requireAuth, pode('editar_documentos'), h((req, res) => {
    const versao = repo.Documentos.novaVersao(req.params.id, req.body || {}, req.user && req.user.id);
    auditar(req, 'documento.versao', 'documents', req.params.id, 'v' + versao);
    res.json({ ok: true, versao });
  }));
  app.patch('/staff/api/legal/documentos/:id', requireAuth, pode('editar_documentos'), h((req, res) => {
    const d = req.body || {};
    // aprovar / enviar ao cliente exigem permissões próprias (fluxo de estados do documento)
    if (d.status === 'aprovado' && !req.legal.permissoes.aprovar_documentos) return res.status(403).json({ erro: 'Sem permissão para aprovar documentos.' });
    if (d.status === 'enviado_cliente' && !req.legal.permissoes.enviar_cliente) return res.status(403).json({ erro: 'Sem permissão para enviar ao cliente.' });
    if (d.status === 'protocolado' && !req.legal.permissoes.protocolar) return res.status(403).json({ erro: 'Sem permissão para marcar como protocolado.' });
    const antes = repo.Documentos.obter(req.params.id);
    const doc = repo.Documentos.atualizar(req.params.id, d);
    auditar(req, 'documento.editar', 'documents', doc.id, doc.status);
    // documento liberado/enviado ao cliente → avisa o cliente dono
    const liberou = (d.status === 'enviado_cliente' && antes && antes.status !== 'enviado_cliente')
      || (d.sigilo === 'cliente' && antes && antes.sigilo !== 'cliente');
    if (liberou) {
      const dono = doc.client_id || (doc.case_id && (require('./db').db.prepare('SELECT client_id FROM cases WHERE id = ?').get(doc.case_id) || {}).client_id);
      if (dono) {
        notif.notificarCliente(dono, {
          titulo: 'Documento disponível no seu portal', corpo: doc.titulo,
          ref_tipo: 'document', ref_id: doc.id,
        }).catch(() => {});
      }
    }
    res.json({ ok: true, documento: doc });
  }));
  app.get('/staff/api/legal/documentos/:id/download', requireAuth, pode('ver_documentos'), h((req, res) => {
    const doc = repo.Documentos.obter(req.params.id);
    if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
    if (doc.sigilo === 'restrito' && !req.legal.permissoes.ver_dados_sensiveis) return res.status(403).json({ erro: 'Documento restrito.' });
    const arq = repo.Documentos.caminhoArquivo(doc.id, req.query.versao);
    if (!arq) return res.status(404).json({ erro: 'Arquivo não encontrado no disco.' });
    repo.Documentos.logAcesso(doc.id, req.user, 'baixou', ipDe(req));
    res.download(arq.caminho, arq.versao.nome_original || 'documento');
  }));

  // ------------------------------------------------------- IA JURÍDICA (Fase 3: RAG + consultas + fila)
  const ha = (fn) => (req, res) => { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); };

  app.get('/staff/api/legal/ia', requireAuth, pode('usar_ia'), h((req, res) => {
    res.json({ consultas: repo.IA.listar(req.query) });
  }));
  // modo de operação (direto via API Anthropic × fila p/ agente local) + saúde do RAG
  app.get('/staff/api/legal/ia/status', requireAuth, pode('usar_ia'), h((req, res) => {
    res.json({ modo: llm.ativo() ? 'direto' : 'fila', modelos: llm.MODELOS, rag: ia.ftsOK, pendentes: repo.IA.pendentes(100).length });
  }));
  app.get('/staff/api/legal/ia/agentes', requireAuth, pode('usar_ia'), h((req, res) => {
    res.json({ agentes: ia.agentes() });
  }));
  app.get('/staff/api/legal/ia/prompts', requireAuth, pode('usar_ia'), h((req, res) => {
    res.json({ prompts: ia.prompts() });
  }));
  // busca RAG (BM25 sobre fontes internas)
  app.get('/staff/api/legal/ia/buscar', requireAuth, pode('usar_ia'), h((req, res) => {
    const tipos = String(req.query.tipos || '').split(',').map(t => t.trim()).filter(Boolean);
    res.json(ia.buscar(req.query.q, { limite: req.query.limite, tipos }));
  }));
  // nova consulta: responde na hora (LLM direto) ou entra na fila
  app.post('/staff/api/legal/ia/consultas', requireAuth, pode('usar_ia'), ha(async (req, res) => {
    const r = await ia.consultar(req.body || {}, req.user && req.user.id);
    auditar(req, 'ia.consultar', 'ai_queries', r.query_id, (req.body || {}).agente || 'geral');
    res.json({ ok: true, ...r, aviso: 'Resposta de IA é MINUTA — revisão de advogado obrigatória.' });
  }));
  // fila para o agente jurídico local (PUBLISH_KEY): consultas sem resposta + contexto RAG
  app.get('/staff/api/legal/ia/consultas/pendentes', requirePublishOrSession, pode('usar_ia'), h((req, res) => {
    const pendentes = repo.IA.pendentes(req.query.limite).map(q => ({
      ...q,
      agente_prompt: (q.agente && (ia.agente(q.agente) || {}).system_prompt) || '',
      contexto_rag: ia.montarContexto(q.pergunta, { case_id: q.case_id }).texto,
    }));
    res.json({ pendentes, guardrails: llm.GUARDRAILS });
  }));
  // o agente local devolve a resposta estruturada da consulta
  app.post('/staff/api/legal/ia/consultas/:id/responder', requirePublishOrSession, pode('usar_ia'), h((req, res) => {
    const rid = repo.IA.responder(req.params.id, req.body || {});
    auditar(req, 'ia.responder', 'ai_responses', rid, 'via ' + (req.viaChave ? 'agente local' : 'sessão'));
    res.json({ ok: true, response_id: rid, aviso: 'Registrada como rascunho — exige revisão humana.' });
  }));
  // base de conhecimento curada (entra no RAG)
  app.get('/staff/api/legal/ia/conhecimento', requireAuth, pode('usar_ia'), h((req, res) => {
    res.json({ itens: ia.Conhecimento.listar(req.query) });
  }));
  app.post('/staff/api/legal/ia/conhecimento', requirePublishOrSession, pode('usar_ia'), h((req, res) => {
    const k = ia.Conhecimento.criar(req.body || {}, req.user && req.user.id);
    auditar(req, 'ia.conhecimento.criar', 'legal_knowledge_base', k.id, k.titulo);
    res.json({ ok: true, item: k });
  }));
  app.delete('/staff/api/legal/ia/conhecimento/:id', requireAuth, pode('usar_ia'), h((req, res) => {
    ia.Conhecimento.remover(req.params.id);
    auditar(req, 'ia.conhecimento.remover', 'legal_knowledge_base', req.params.id, '');
    res.json({ ok: true });
  }));
  // texto extraído de documento (agente local faz OCR/extração e manda p/ o RAG)
  app.post('/staff/api/legal/ia/extracao', requirePublishOrSession, pode('usar_ia'), h((req, res) => {
    const d = req.body || {};
    ia.registrarExtracao(d.document_id, d.texto, d.metodo, quemFez(req));
    auditar(req, 'ia.extracao', 'document_text_extractions', d.document_id, d.metodo || '');
    res.json({ ok: true });
  }));
  app.post('/staff/api/legal/ia/reindexar', requireAuth, pode('usar_ia'), h((req, res) => {
    const r = ia.reindexarTudo();
    auditar(req, 'ia.reindexar', 'rag_index', '', 'indexados: ' + (r.indexados || 0));
    res.json({ ok: true, ...r });
  }));
  // custos/execuções de IA (controle de custos — §4 arquitetura)
  app.get('/staff/api/legal/ia/runs', requireAuth, pode('ver_auditoria'), h((req, res) => {
    const runs = require('./db').db.prepare('SELECT * FROM ai_agent_runs ORDER BY quando DESC LIMIT ?').all(Math.min(parseInt(req.query.n) || 100, 500));
    const totais = require('./db').db.prepare(`SELECT COUNT(*) chamadas, SUM(input_tokens) tokens_in, SUM(output_tokens) tokens_out,
      SUM(custo_centavos_usd) custo_centavos FROM ai_agent_runs WHERE quando >= ?`).get(new Date(Date.now() - 30 * 86400000).toISOString());
    res.json({ runs, ultimos_30_dias: totais });
  }));
  app.get('/staff/api/legal/ia/respostas/:id', requireAuth, pode('usar_ia'), h((req, res) => {
    const r = repo.IA.obterResposta(req.params.id);
    if (!r) return res.status(404).json({ erro: 'Resposta não encontrada.' });
    res.json({ resposta: r, aviso: 'Minuta gerada por IA. Revisão de advogado obrigatória antes de uso profissional.' });
  }));
  app.post('/staff/api/legal/ia/registrar', requirePublishOrSession, pode('usar_ia'), h((req, res) => {
    const r = repo.IA.registrar(req.body || {}, req.user && req.user.id);
    auditar(req, 'ia.registrar', 'ai_queries', r.query_id, (req.body || {}).agente || '');
    res.json({ ok: true, ...r, aviso: 'Registrado como rascunho — exige revisão humana.' });
  }));
  app.post('/staff/api/legal/ia/respostas/:id/revisar', requireAuth, pode('aprovar_documentos'), h((req, res) => {
    const status = repo.IA.revisar(req.params.id, req.body || {}, quemFez(req));
    auditar(req, 'ia.revisar', 'ai_responses', req.params.id, status);
    res.json({ ok: true, status });
  }));

  // ------------------------------------------------------- FINANCEIRO
  app.get('/staff/api/legal/financeiro', requireAuth, pode('ver_financeiro'), h((req, res) => {
    res.json({ lancamentos: repo.Financeiro.listar(req.query) });
  }));
  app.post('/staff/api/legal/financeiro', requireAuth, pode('gerir_financeiro'), h((req, res) => {
    const f = repo.Financeiro.criar(req.body || {}, req.user && req.user.id);
    auditar(req, 'financeiro.criar', 'financial_accounts', f.id, f.tipo + ' ' + f.valor);
    res.json({ ok: true, lancamento: f });
  }));
  app.patch('/staff/api/legal/financeiro/:id', requireAuth, pode('gerir_financeiro'), h((req, res) => {
    const f = repo.Financeiro.atualizar(req.params.id, req.body || {});
    auditar(req, 'financeiro.editar', 'financial_accounts', f.id, f.status);
    res.json({ ok: true, lancamento: f });
  }));

  // ------------------------------------------------------- PEÇAS JURÍDICAS (Fase 4, Módulo 10)
  app.get('/staff/api/legal/pecas', requireAuth, pode('ver_documentos'), h((req, res) => {
    res.json({ pecas: pecas.Pecas.listar(req.query), tipos: pecas.Pecas.TIPOS_PECA, status: pecas.Pecas.STATUS_PECA });
  }));
  app.get('/staff/api/legal/pecas/:id', requireAuth, pode('ver_documentos'), h((req, res) => {
    const d = pecas.Pecas.obter(req.params.id);
    if (!d) return res.status(404).json({ erro: 'Peça não encontrada.' });
    res.json({ peca: d });
  }));
  app.post('/staff/api/legal/pecas', requireAuth, pode('criar_documentos'), h((req, res) => {
    const d = pecas.Pecas.criar(req.body || {}, req.user && req.user.id);
    auditar(req, 'peca.criar', 'legal_drafts', d.id, d.tipo_peca);
    res.json({ ok: true, peca: d });
  }));
  // nova versão do conteúdo — sessão OU agente local (fila de geração devolve aqui)
  app.post('/staff/api/legal/pecas/:id/versoes', requirePublishOrSession, pode('criar_documentos'), h((req, res) => {
    const v = pecas.Pecas.novaVersao(req.params.id, req.body || {}, quemFez(req), { viaIA: !!req.viaChave || !!(req.body || {}).via_ia });
    auditar(req, 'peca.versao', 'legal_drafts', req.params.id, 'v' + v.versao);
    res.json({ ok: true, ...v });
  }));
  // geração assistida por IA (direto ou fila)
  app.post('/staff/api/legal/pecas/:id/gerar', requireAuth, pode('usar_ia'), ha(async (req, res) => {
    const r = await pecas.Pecas.gerar(req.params.id, req.user && req.user.id);
    auditar(req, 'peca.gerar', 'legal_drafts', req.params.id, r.situacao);
    res.json({ ok: true, ...r, aviso: 'Minuta gerada por IA — revisão integral por advogado é obrigatória.' });
  }));
  // transições de status — gates de permissão; aprovar é SEMPRE sessão humana
  app.patch('/staff/api/legal/pecas/:id', requireAuth, pode('editar_documentos'), h((req, res) => {
    const novo = (req.body || {}).status;
    if (novo === 'aprovado' && !req.legal.permissoes.aprovar_documentos) return res.status(403).json({ erro: 'Sem permissão para aprovar peças.' });
    if (novo === 'protocolado' && !req.legal.permissoes.protocolar) return res.status(403).json({ erro: 'Sem permissão para protocolar.' });
    if (novo === 'enviado_cliente' && !req.legal.permissoes.enviar_cliente) return res.status(403).json({ erro: 'Sem permissão para enviar ao cliente.' });
    const d = pecas.Pecas.mudarStatus(req.params.id, novo, quemFez(req), { aprovador: novo === 'aprovado' ? quemFez(req) : '' });
    auditar(req, 'peca.status', 'legal_drafts', d.id, d.status);
    res.json({ ok: true, peca: d });
  }));
  app.get('/staff/api/legal/pecas/:id/exportar', requireAuth, pode('ver_documentos'), h((req, res) => {
    const e = pecas.Pecas.exportar(req.params.id, req.query.formato, quemFez(req));
    auditar(req, 'peca.exportar', 'legal_drafts', req.params.id, e.nome);
    if (e.doc) {
      res.setHeader('Content-Type', 'application/msword');
      res.setHeader('Content-Disposition', `attachment; filename="${e.nome}"`);
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    res.send(e.html);
  }));

  // ------------------------------------------------------- CONTRATOS (Fase 4, Módulos 12+13)
  app.get('/staff/api/legal/contratos/templates', requireAuth, pode('ver_documentos'), h((req, res) => {
    res.json({ templates: contratos.Templates.listar() });
  }));
  // wizard: gera a minuta de contrato a partir do modelo + respostas
  app.post('/staff/api/legal/contratos/gerar', requireAuth, pode('criar_documentos'), h((req, res) => {
    const r = contratos.gerarContrato(req.body || {}, req.user && req.user.id);
    auditar(req, 'contrato.gerar', 'legal_drafts', r.draft_id, (req.body || {}).template_id);
    res.json({ ok: true, ...r, aviso: 'MINUTA de contrato — revisão de advogado obrigatória.' });
  }));
  app.get('/staff/api/legal/contratos/analises', requireAuth, pode('ver_documentos'), h((req, res) => {
    res.json({ analises: contratos.Analises.listar(req.query) });
  }));
  app.get('/staff/api/legal/contratos/analises/:id', requireAuth, pode('ver_documentos'), h((req, res) => {
    const r = contratos.Analises.obter(req.params.id);
    if (!r) return res.status(404).json({ erro: 'Análise não encontrada.' });
    res.json({ analise: r });
  }));
  app.post('/staff/api/legal/contratos/analises', requireAuth, pode('usar_ia'), ha(async (req, res) => {
    const r = await contratos.Analises.criar(req.body || {}, req.user && req.user.id);
    auditar(req, 'contrato.analisar', 'contract_reviews', r.review_id, r.situacao);
    res.json({ ok: true, ...r });
  }));
  // o agente local devolve a análise estruturada (ou um humano ajusta o status)
  app.patch('/staff/api/legal/contratos/analises/:id', requirePublishOrSession, pode('usar_ia'), h((req, res) => {
    const d = req.body || {};
    let r;
    if (d.analise) r = contratos.Analises.registrarResultado(req.params.id, d.analise, quemFez(req));
    else if (d.status) {
      if (d.status === 'aprovado' && (req.viaChave || !req.legal.permissoes.aprovar_documentos)) {
        return res.status(403).json({ erro: 'Aprovar análise exige sessão humana com permissão.' });
      }
      r = contratos.Analises.revisar(req.params.id, d, quemFez(req));
    } else return res.status(400).json({ erro: 'Envie "analise" (resultado) ou "status".' });
    auditar(req, 'contrato.analise.atualizar', 'contract_reviews', req.params.id, d.status || 'resultado');
    res.json({ ok: true, analise: r });
  }));
  // migração dos contratos do portal antigo (contratos.json) — idempotente
  app.post('/staff/api/legal/importar/contratos-legado', requireAuth, pode('criar_documentos'), h((req, res) => {
    const r = contratos.importarContratosLegado(req.user && req.user.id);
    auditar(req, 'legado.importar-contratos', 'documents', '', `encontrados ${r.encontrados}, importados ${r.importados}, pulados ${r.pulados}`);
    res.json({ ok: true, ...r });
  }));

  // ------------------------------------------------------- NOTIFICAÇÕES DA EQUIPE (Fase 5)
  app.get('/staff/api/legal/notificacoes', requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ notificacoes: notif.Notificacoes.daEquipe(req.query.limite) });
  }));

  // ------------------------------------------------------- AUDITORIA / INTEGRAÇÕES / WEBHOOKS
  app.get('/staff/api/legal/auditoria', requireAuth, pode('ver_auditoria'), h((req, res) => {
    res.json({ eventos: repo.Auditoria.listar(req.query) });
  }));
  app.get('/staff/api/legal/integracoes', requireAuth, pode('ver_auditoria'), h((req, res) => {
    res.json({ logs: repo.Integracoes.listar(req.query.n), webhooks: repo.Integracoes.webhooks(req.query.n) });
  }));
  // registro de execução de rotina de coleta (agentes/Tarefas do Windows via PUBLISH_KEY)
  app.post('/staff/api/legal/integracoes/log', requirePublishOrSession, pode('gerir_publicacoes'), h((req, res) => {
    const d = req.body || {};
    repo.Integracoes.log(d.fonte, d.operacao, d.status, d.detalhe, d.itens);
    res.json({ ok: true });
  }));
  // webhooks de fornecedores futuros — só ARMAZENA o evento (processamento nas Fases 7+)
  app.post('/staff/api/legal/webhooks/:origem', requirePublishOrSession, pode('gerir_publicacoes'), h((req, res) => {
    const id = repo.Integracoes.webhook(req.params.origem, (req.body || {}).evento, req.body);
    res.json({ ok: true, id });
  }));
}

module.exports = { registrarRotasStaff };
