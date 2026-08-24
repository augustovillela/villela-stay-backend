// =====================================================================
// Villela Finance — API do assinante (/finance/api/*).
//
// Cookie `fin_sess` restrito ao path /finance: isolado do Portal Staff e
// dos outros produtos. TODO handler roda DENTRO de `tenancy.comTenant` —
// não existe caminho que toque o banco sem contexto, e o repo.js recusa
// se alguém tentar.
//
// O tenant vem SEMPRE da sessão. Um `tenantId` no corpo é ignorado; a
// empresa pedida no cabeçalho é VALIDADA contra a conta antes de valer.
//
// Padrão do envelope copiado de growth/rotas-assinante.js: quem envelopa
// é o handler, não o `next()` — assim o contexto cobre exatamente a
// execução da rota, inclusive quando ela é assíncrona.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const { db, j } = require('./db');
const repo = require('./repo');
const tenancy = require('./tenancy');
const contasSvc = require('./contas');
const entitlements = require('./entitlements');
const rbac = require('./rbac');
const ledger = require('./ledger');
const bancos = require('./bancos');
const classificacao = require('./classificacao');
const periodos = require('./periodos');
const relatorios = require('./relatorios');
const aprovacoes = require('./aprovacoes');
const auditoria = require('./auditoria');
const planoContas = require('./plano-contas');
const dinheiro = require('./dinheiro');
const diario = require('./diario');
const stays = require('./stays');

const COOKIE = 'fin_sess';
const DIAS = 30;

/** Erro → resposta. Mensagem útil, sem stack e sem interno vazando. */
function responderErro(res, e) {
  if (res.headersSent) return;
  const status = e && e.status ? e.status : 500;
  const corpo = { erro: (e && e.message) || 'Falha inesperada.' };
  if (e && e.detalhe) corpo.detalhe = e.detalhe;
  if (status >= 500) console.error('[finance]', e);
  res.status(status).json(corpo);
}

function registrarRotasApp(app, { jwtSecret, express }) {
  if (!jwtSecret || !express) throw new Error('financeiro/rotas-app: faltam deps (jwtSecret, express).');
  const seguro = process.env.NODE_ENV === 'production';
  const corpo = express.json({ limit: '8mb' });

  /**
   * Lê a sessão. É o ÚNICO lugar do módulo com SQL fora do repo.js: para
   * saber o tenant é preciso ler o usuário, e para ler pelo repo já
   * seria preciso saber o tenant. O guarda de isolamento começa depois
   * daqui, com o contexto aberto.
   */
  function usuarioDaSessao(req) {
    try {
      const { uid } = jwt.verify((req.cookies || {})[COOKIE], jwtSecret);
      return db.prepare(
        `SELECT u.*, t.slug AS tenant_slug, t.nome AS tenant_nome, t.status AS tenant_status
           FROM tenant_users u JOIN tenants t ON t.id = u.tenant_id
          WHERE u.id = ? AND u.status = 'ativo'`).get(uid) || null;
    } catch (_) { return null; }
  }

  /**
   * Envelope de rota autenticada.
   *   permissao — chave do RBAC exigida do perfil;
   *   modulo    — módulo do plano exigido para ESCREVER (leitura nunca);
   *   medida    — limite de volume conferido junto do módulo;
   *   json      — monta o parser de corpo.
   * O handler devolve o objeto de resposta (ou usa `res` e não devolve).
   */
  const rota = (fn, { permissao = '', modulo = '', medida = '', json: comJson = false } = {}) => {
    const meios = comJson ? [corpo] : [];
    meios.push((req, res) => {
      const u = usuarioDaSessao(req);
      if (!u) return res.status(401).json({ erro: 'Sessão expirada. Entre de novo.' });
      req.assinante = u;

      try {
        const saida = tenancy.comTenant({
          tenantId: u.tenant_id, userId: u.id, perfil: u.perfil,
          correlationId: req.correlationId, ip: req.ip,
          // MFA de verdade entra na fase 2 (TOTP). Até lá, o cabeçalho
          // marca a intenção e o selftest cobre os dois caminhos — o que
          // NÃO se faz é deixar ação material passar sem exigir nada.
          mfa: String(req.headers['x-mfa'] || '').length >= 6,
        }, () => {
          const tenant = repo.tenantPorId(u.tenant_id);
          req.tenant = tenant;

          const pedida = String(req.headers['x-empresa'] || req.query.empresa || '');
          const empresas = repo.listarEntidades();
          const entidade = (pedida && empresas.find(e => e.id === pedida)) || empresas[0] || null;
          if (!entidade) throw Object.assign(new Error('Nenhuma empresa cadastrada nesta conta.'), { status: 400 });

          return tenancy.comEntidade(entidade.id, () => {
            req.entidade = entidade;
            if (permissao && !rbac.podeFazer(u.perfil, permissao)) {
              const p = rbac.perfil(u.perfil);
              throw new rbac.ErroDePermissao(`O perfil ${p ? p.nome : u.perfil} não tem permissão para esta ação.`);
            }
            if (modulo) entitlements.exigir(tenant, modulo, medida ? { medida } : {});
            return fn(req, res);
          });
        });

        if (saida && typeof saida.then === 'function') {
          return saida.then(v => { if (v !== undefined && !res.headersSent) res.json(v); })
            .catch(e => responderErro(res, e));
        }
        if (saida !== undefined && !res.headersSent) res.json(saida);
      } catch (e) { responderErro(res, e); }
    });
    return meios;
  };

  // ------------------------------------------------------------ sessão
  app.post('/finance/api/login', corpo, (req, res) => {
    const email = String((req.body || {}).email || '').toLowerCase().trim();
    const senha = String((req.body || {}).senha || '');
    const u = db.prepare(
      "SELECT * FROM tenant_users WHERE email = ? AND status = 'ativo' ORDER BY criado_em LIMIT 1").get(email);
    // Resposta idêntica para e-mail inexistente e senha errada: a tela de
    // login não entrega a lista de quem tem conta.
    if (!u || !u.senha_hash || !contasSvc.conferirSenha(senha, u.senha_hash)) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }
    const token = jwt.sign({ uid: u.id }, jwtSecret, { expiresIn: `${DIAS}d` });
    res.cookie(COOKIE, token, { httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: DIAS * 86400_000, path: '/finance' });
    db.prepare('UPDATE tenant_users SET ultimo_acesso = ? WHERE id = ?').run(new Date().toISOString(), u.id);
    tenancy.comTenant({ tenantId: u.tenant_id, userId: u.id, perfil: u.perfil, ip: req.ip }, () => {
      auditoria.registrar('sessao.entrar', { objetoTipo: 'usuario', objetoId: u.id });
    });
    res.json({ ok: true });
  });

  app.post('/finance/api/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/finance' });
    res.json({ ok: true });
  });

  app.get('/finance/api/eu', ...rota((req) => {
    const e = entitlements.resolver(req.tenant);
    const perfil = rbac.perfil(req.assinante.perfil);
    return {
      usuario: { id: req.assinante.id, nome: req.assinante.nome, email: req.assinante.email, perfil: req.assinante.perfil },
      perfil: perfil && { nome: perfil.nome, descricao: perfil.descricao, permissoes: perfil.permissoes, alcadaCents: perfil.alcadaCents },
      conta: { slug: req.assinante.tenant_slug, nome: req.assinante.tenant_nome, status: req.assinante.tenant_status },
      plano: { slug: e.planoSlug, nome: e.planoNome, modulos: e.modulos, limites: e.limites, flags: e.flags, cortesia: e.cortesia, bloqueiaEscrita: e.bloqueiaEscrita },
      empresa: { id: req.entidade.id, nome: req.entidade.nome, documento: req.entidade.documento },
      empresas: repo.listarEntidades().map(x => ({ id: x.id, nome: x.nome })),
    };
  }));

  // --------------------------------------------------------- estrutura
  app.get('/finance/api/plano-contas', ...rota((req) => {
    const saldos = {};
    for (const l of ledger.balancete(req.entidade.id, {}).linhas) saldos[l.contaId] = l.saldoCents;
    return { arvore: planoContas.arvore(req.entidade.id, saldos) };
  }));

  app.get('/finance/api/contas', ...rota((req) => ({
    contas: repo.listarContas(req.entidade.id, { somenteAnaliticas: req.query.analiticas === '1' }),
  })));

  app.get('/finance/api/centros-custo', ...rota((req) => ({ centros: repo.listarCentrosCusto(req.entidade.id) })));

  app.post('/finance/api/centros-custo', ...rota((req) => {
    const d = req.body || {};
    if (!d.codigo || !d.nome) throw Object.assign(new Error('Informe código e nome do centro de custo.'), { status: 400 });
    if (repo.centroCustoPorCodigo(req.entidade.id, d.codigo)) {
      throw Object.assign(new Error('Já existe centro de custo com esse código.'), { status: 409 });
    }
    const c = repo.criarCentroCusto({ entidadeId: req.entidade.id, codigo: d.codigo, nome: d.nome, tipo: d.tipo, externoId: d.externoId });
    auditoria.registrar('centro_custo.criar', { objetoTipo: 'centro_custo', objetoId: c.id, detalhe: { codigo: c.codigo, nome: c.nome } });
    return { ok: true, centro: c };
  }, { permissao: 'cadastrar', modulo: 'centros', json: true }));

  // --------------------------------------------------- contas bancárias
  app.get('/finance/api/bancos', ...rota((req) => ({ contas: repo.listarContasBancarias(req.entidade.id) })));

  app.post('/finance/api/bancos', ...rota((req) => {
    const d = req.body || {};
    if (!d.nome) throw Object.assign(new Error('Informe o nome da conta bancária.'), { status: 400 });
    // Toda conta bancária nasce com a própria conta contábil analítica —
    // sem espelho no razão ela teria extrato, mas não teria saldo.
    const irmas = repo.listarContasBancarias(req.entidade.id).length;
    const pai = repo.contaPorCodigo(req.entidade.id, '1.1.1');
    const contaContabil = repo.criarConta({
      entidadeId: req.entidade.id,
      codigo: `1.1.1.${String(100 + irmas + 1).padStart(3, '0')}`,
      nome: `Banco — ${d.nome}`, natureza: 'ativo', saldoNormal: 'devedora',
      paiId: pai ? pai.id : '', aceitaLancamento: true, subledger: 'bancos',
    });
    const cb = repo.criarContaBancaria({
      entidadeId: req.entidade.id, nome: d.nome, banco: d.banco, agencia: d.agencia,
      numero: d.numero, tipo: d.tipo, contaId: contaContabil.id,
      saldoInicialCents: d.saldoInicialCents ? dinheiro.centavos(d.saldoInicialCents, 'saldo inicial') : 0,
      saldoInicialData: d.saldoInicialData || '',
    });
    auditoria.registrar('conta_bancaria.criar', {
      objetoTipo: 'conta_bancaria', objetoId: cb.id,
      detalhe: { nome: cb.nome, conta_contabil: contaContabil.codigo },
    });
    return { ok: true, conta: cb, contaContabil };
  }, { permissao: 'configurar', modulo: 'bancos', medida: 'contas_bancarias', json: true }));

  // ------------------------------------------------------------ extrato
  app.post('/finance/api/bancos/:id/importar', ...rota((req) => bancos.importar({
    entidadeId: req.entidade.id,
    contaBancariaId: req.params.id,
    conteudo: (req.body || {}).conteudo,
    fonte: (req.body || {}).fonte,
    formato: (req.body || {}).formato || 'csv',
    mapa: (req.body || {}).mapa || {},
  }), { permissao: 'lancar', modulo: 'bancos', medida: 'transacoes_mes', json: true }));

  app.get('/finance/api/transacoes', ...rota((req) => {
    const lista = repo.listarTransacoes(req.entidade.id, {
      status: String(req.query.status || ''),
      contaBancariaId: String(req.query.banco || ''),
      desde: String(req.query.desde || ''), ate: String(req.query.ate || ''),
      limite: Math.min(Number(req.query.limite) || 200, 1000),
    });
    return {
      transacoes: lista.map(t => ({
        id: t.id, data: t.data, valorCents: t.valor_cents, valor: dinheiro.formatar(t.valor_cents),
        descricao: t.descricao, documento: t.documento, contraparte: t.contraparte_nome,
        status: t.status, loteId: t.lote_id, sugestao: j.parse(t.sugestao, null),
        contaBancariaId: t.conta_bancaria_id,
      })),
      contagem: repo.contarTransacoes(req.entidade.id),
    };
  }));

  /**
   * Conciliar: o ponto em que o extrato vira contabilidade. É aqui que a
   * classificação por risco aparece na prática — sugestão de confiança
   * alta passa direto, o resto exige escolha explícita de quem lança.
   */
  app.post('/finance/api/transacoes/:id/conciliar', ...rota((req) => {
    const d = req.body || {};
    const t = repo.transacao(req.params.id);
    if (!t) throw Object.assign(new Error('Transação não encontrada.'), { status: 404 });

    const sugestao = j.parse(t.sugestao, {}) || {};
    let contaId = d.contaId || '';
    if (!contaId) {
      if (!sugestao.contaId) throw Object.assign(new Error('Escolha a conta contábil — não há sugestão para esta transação.'), { status: 400 });
      if (!sugestao.alta) {
        throw Object.assign(
          new Error(`A sugestão tem confiança de ${sugestao.confianca}%. Confirme a conta explicitamente.`),
          { status: 400, detalhe: sugestao });
      }
      contaId = sugestao.contaId;
    }

    const r = bancos.conciliar(req.params.id, {
      contaId,
      centroCustoId: d.centroCustoId || sugestao.centroCustoId || '',
      contraparteId: d.contraparteId || sugestao.contraparteId || '',
      memo: d.memo || '',
    });

    // Classificação manual vira regra — é o que faz a taxa automática subir.
    if (d.aprender && d.contaId) {
      try { classificacao.aprender({ entidadeId: req.entidade.id, transacao: t, contaId: d.contaId, centroCustoId: d.centroCustoId }); }
      catch (_) { /* aprender é melhor esforço; conciliar já aconteceu */ }
    }
    return r;
  }, { permissao: 'lancar', modulo: 'bancos', medida: 'lancamentos_mes', json: true }));

  app.post('/finance/api/transacoes/:id/ignorar', ...rota((req) => ({
    ok: true, transacao: bancos.ignorar(req.params.id, { motivo: (req.body || {}).motivo }),
  }), { permissao: 'lancar', modulo: 'bancos', json: true }));

  app.post('/finance/api/classificacao/reprocessar', ...rota(
    (req) => classificacao.reprocessar(req.entidade.id),
    { permissao: 'lancar', modulo: 'bancos' }));

  app.get('/finance/api/bancos/:id/conciliacao', ...rota((req) =>
    bancos.painel(req.entidade.id, req.params.id, { ate: String(req.query.ate || '') || undefined })));

  // -------------------------------------------------------------- razão
  app.post('/finance/api/lancamentos', ...rota((req) => {
    const d = req.body || {};
    return Object.assign({ ok: true }, ledger.lancar({
      entidadeId: req.entidade.id, data: d.data, competencia: d.competencia,
      memo: d.memo, origem: 'manual', idempotencia: d.idempotencia || '',
      linhas: d.linhas || [],
    }));
  }, { permissao: 'lancar', modulo: 'razao', medida: 'lancamentos_mes', json: true }));

  app.get('/finance/api/lancamentos', ...rota((req) => ({
    lotes: repo.listarLotes(req.entidade.id, {
      competencia: String(req.query.competencia || ''),
      status: String(req.query.status || ''),
      limite: Math.min(Number(req.query.limite) || 200, 500),
    }),
  })));

  app.get('/finance/api/lancamentos/:id', ...rota((req, res) => {
    const l = ledger.lote(req.params.id);
    if (!l) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
    // Drill-down até a origem: veio do banco? devolve a transação inteira.
    const origem = (l.lote.origem === 'banco' && l.lote.origem_ref) ? repo.transacao(l.lote.origem_ref) : null;
    return Object.assign({}, l, {
      origemDetalhe: origem,
      auditoria: auditoria.listar({ objetoTipo: 'lote', objetoId: req.params.id, limite: 20 }),
    });
  }));

  /** Estorno é nível 3: vira solicitação, não executa aqui. */
  app.post('/finance/api/lancamentos/:id/estornar', ...rota((req) => {
    const motivo = String((req.body || {}).motivo || '');
    const l = repo.lotePorId(req.params.id);
    if (!l) throw Object.assign(new Error('Lançamento não encontrado.'), { status: 404 });
    const s = aprovacoes.solicitar({
      acao: 'lote.estornar', entidadeId: req.entidade.id,
      objetoTipo: 'lote', objetoId: l.id,
      payload: { loteId: l.id, motivo },
      previa: { numero: l.numero, data: l.data, competencia: l.competencia, total: dinheiro.formatar(l.total_cents), memo: l.memo },
      valorCents: l.total_cents, motivo,
    });
    return { ok: true, aprovacao: s, aviso: 'Estorno é ação material: precisa da aprovação de outra pessoa com alçada.' };
  }, { permissao: 'lancar', json: true }));

  app.get('/finance/api/razao/:contaId', ...rota((req) => ledger.razao(req.params.contaId, {
    desde: String(req.query.desde || ''), ate: String(req.query.ate || ''),
    limite: Math.min(Number(req.query.limite) || 500, 2000),
  })));

  // --------------------------------------------------------- relatórios
  const comp = (req) => String(req.query.competencia || new Date().toISOString().slice(0, 7));

  app.get('/finance/api/cockpit', ...rota((req) => relatorios.cockpit(req.entidade.id, comp(req))));
  app.get('/finance/api/dre', ...rota((req) => relatorios.dre(req.entidade.id, comp(req))));
  app.get('/finance/api/resultado-por-centro', ...rota((req) => relatorios.porCentroCusto(req.entidade.id, comp(req))));
  app.get('/finance/api/caixa', ...rota((req) => relatorios.posicaoDeCaixa(req.entidade.id, {})));
  app.get('/finance/api/balancete', ...rota((req) => {
    const { desde, ate } = relatorios.intervalo(comp(req));
    return ledger.balancete(req.entidade.id, { desde, ate });
  }));

  // --------------------------------------------------------- fechamento
  app.get('/finance/api/periodos', ...rota((req) => ({ periodos: periodos.listar(req.entidade.id) })));

  app.get('/finance/api/fechamento/:competencia', ...rota((req) =>
    periodos.checklist(req.entidade.id, req.params.competencia)));

  app.post('/finance/api/fechamento/:competencia', ...rota((req) => {
    const c = periodos.checklist(req.entidade.id, req.params.competencia);
    const s = aprovacoes.solicitar({
      acao: 'periodo.fechar', entidadeId: req.entidade.id,
      objetoTipo: 'periodo', objetoId: `${req.entidade.id}:${req.params.competencia}`,
      payload: { entidadeId: req.entidade.id, competencia: req.params.competencia, forcar: !!(req.body || {}).forcar, motivo: (req.body || {}).motivo || '' },
      previa: { competencia: req.params.competencia, checklist: c.itens, pode: c.pode, bloqueadores: c.bloqueadores },
      motivo: (req.body || {}).motivo || `fechar ${req.params.competencia}`,
    });
    return { ok: true, aprovacao: s, checklist: c };
  }, { permissao: 'fechar', modulo: 'fechamento', json: true }));

  app.post('/finance/api/periodos/:competencia/reabrir', ...rota((req) => {
    const motivo = String((req.body || {}).motivo || '');
    const s = aprovacoes.solicitar({
      acao: 'periodo.reabrir', entidadeId: req.entidade.id,
      objetoTipo: 'periodo', objetoId: `${req.entidade.id}:${req.params.competencia}`,
      payload: { entidadeId: req.entidade.id, competencia: req.params.competencia, motivo },
      previa: { competencia: req.params.competencia, impacto: 'Permite lançar de novo em competência já reportada.' },
      motivo,
    });
    return { ok: true, aprovacao: s };
  }, { permissao: 'fechar', modulo: 'fechamento', json: true }));

  // --------------------------------------------------------- aprovações
  app.get('/finance/api/aprovacoes', ...rota((req) => ({
    aprovacoes: aprovacoes.listar(String(req.query.status || 'pendente'), 200).map(a => ({
      id: a.id, acao: a.acao, nivel: a.nivel, status: a.status,
      objetoTipo: a.objeto_tipo, objetoId: a.objeto_id,
      previa: j.parse(a.previa, {}), valorCents: a.valor_cents, valor: dinheiro.formatar(a.valor_cents),
      solicitante: a.solicitante, solicitadoEm: a.solicitado_em, motivo: a.motivo,
      expiraEm: a.expira_em, decisor: a.decisor, decididoEm: a.decidido_em,
      // A tela precisa saber ANTES se este usuário pode decidir — não
      // adianta oferecer o botão e recusar no clique.
      posso: rbac.podeAprovar({
        perfilDecisor: req.assinante.perfil, usuarioDecisor: req.assinante.id,
        usuarioSolicitante: a.solicitante, valorCents: a.valor_cents,
      }),
    })),
  })));

  app.post('/finance/api/aprovacoes/:id/aprovar', ...rota((req) => aprovacoes.aprovar(req.params.id, {
    motivo: (req.body || {}).motivo || '',
    perfilDecisor: req.assinante.perfil,
    usuarioDecisor: req.assinante.id,
    mfa: tenancy.mfaVerificado(),
  }), { permissao: 'aprovar', modulo: 'aprovacoes', json: true }));

  app.post('/finance/api/aprovacoes/:id/recusar', ...rota((req) => ({
    ok: true,
    aprovacao: aprovacoes.recusar(req.params.id, {
      motivo: (req.body || {}).motivo || '',
      perfilDecisor: req.assinante.perfil, usuarioDecisor: req.assinante.id,
    }),
  }), { permissao: 'aprovar', modulo: 'aprovacoes', json: true }));

  // ------------------------------------------------- hospedagem (Stays)
  app.get('/finance/api/stays/estado', ...rota(() => ({
    configurado: stays.configurado(),
    // Diz o que fazer quando não está ligado, em vez de devolver tela vazia.
    aviso: stays.configurado() ? '' : 'A integração com a Stays não está configurada neste servidor.',
    convencao: 'Competência por data de CHECK-IN · receita = price._f_total · líquido = total − comissão do canal.',
  })));

  app.post('/finance/api/stays/sincronizar', ...rota((req) => stays.sincronizar({
    entidadeId: req.entidade.id,
    competencia: String((req.body || {}).competencia || '').trim(),
    // Prévia: calcula o que mudaria sem gravar nada. É o que permite olhar
    // antes de deixar o adaptador escrever no razão.
    dryRun: !!(req.body || {}).dryRun,
  }), { permissao: 'lancar', modulo: 'hospitalidade', medida: 'lancamentos_mes', json: true }));

  app.get('/finance/api/stays/conferir', ...rota((req) => stays.conferir({
    entidadeId: req.entidade.id,
    competencia: String(req.query.competencia || new Date().toISOString().slice(0, 7)),
  })));

  // ---------------------------------------------------------- auditoria
  app.get('/finance/api/auditoria', ...rota((req) => ({
    eventos: auditoria.listar({
      objetoTipo: String(req.query.objetoTipo || ''), objetoId: String(req.query.objetoId || ''),
      limite: Math.min(Number(req.query.limite) || 200, 500),
    }),
    cadeia: auditoria.verificarCadeia(req.assinante.tenant_id),
  })));

  app.get('/finance/api/saude', ...rota((req) => ({
    razao: ledger.conferirBalanceamento(req.entidade.id),
    auditoria: auditoria.verificarCadeia(req.assinante.tenant_id),
    diario: diario.status(),
  })));
}

module.exports = { registrarRotasApp, COOKIE, responderErro };
