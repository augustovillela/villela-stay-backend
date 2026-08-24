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
const { j } = require('./db');
const sessao = require('./sessao');
const billing = require('./billing');
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
const contrapartes = require('./contrapartes');
const titulos = require('./titulos');
const liquidacoes = require('./liquidacoes');
const apuracao = require('./apuracao');
const caixa = require('./caixa');
const orcamento = require('./orcamento');
const cfo = require('./cfo');
const conselho = require('./conselho');
const exportacao = require('./exportacao');
const mfa = require('./mfa');

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
   * Lê a sessão. As consultas pré-contexto vivem todas em `sessao.js` —
   * ver o cabeçalho de lá para o porquê da exceção.
   */
  function usuarioDaSessao(req) {
    try { return sessao.porId(jwt.verify((req.cookies || {})[COOKIE], jwtSecret).uid); }
    catch (_) { return null; }
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
          // TOTP de verdade (fase 10): o cabeçalho traz o CÓDIGO, e ele é
          // conferido contra o segredo cifrado do usuário. Código já usado
          // na mesma janela não vale de novo. Sem MFA ativo, `mfa` é
          // false e a ação material é recusada com o motivo.
          mfa: mfa.verificar(u.id, req.headers['x-mfa']).ok,
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
    const u = sessao.porEmail(email);
    // Resposta idêntica para e-mail inexistente e senha errada: a tela de
    // login não entrega a lista de quem tem conta.
    if (!u || !u.senha_hash || !contasSvc.conferirSenha(senha, u.senha_hash)) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }
    const token = jwt.sign({ uid: u.id }, jwtSecret, { expiresIn: `${DIAS}d` });
    res.cookie(COOKIE, token, { httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: DIAS * 86400_000, path: '/finance' });
    sessao.marcarAcesso(u.id);
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

  // ------------------------------ gestão e fechamento (fase 4)
  app.get('/finance/api/balanco', ...rota((req) => apuracao.balanco(req.entidade.id, {
    ate: String(req.query.ate || '') || undefined,
  })));

  app.get('/finance/api/fluxo-caixa', ...rota((req) => {
    const { desde, ate } = relatorios.intervalo(comp(req));
    return String(req.query.metodo || 'direto') === 'indireto'
      ? caixa.fluxoIndireto(req.entidade.id, { desde, ate })
      : caixa.fluxoDireto(req.entidade.id, { desde, ate });
  }));

  app.get('/finance/api/previsao-caixa', ...rota((req) => caixa.previsao(req.entidade.id, {
    dias: Math.min(Number(req.query.dias) || 90, 365),
    referencia: String(req.query.referencia || '') || undefined,
  })));

  app.get('/finance/api/consolidado', ...rota((req) => apuracao.consolidar({
    ate: String(req.query.ate || '') || undefined,
  }), { modulo: '' }));

  // ------------------------------------------------------- orçamento
  app.get('/finance/api/orcamentos', ...rota((req) => ({
    orcamentos: orcamento.listar(req.entidade.id, {
      exercicio: String(req.query.exercicio || ''), status: String(req.query.status || ''),
    }),
  })));

  app.get('/finance/api/orcamentos/:id', ...rota((req, res) => {
    const o = orcamento.buscar(req.params.id);
    if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' });
    return o;
  }));

  app.post('/finance/api/orcamentos', ...rota((req) => ({
    ok: true, orcamento: orcamento.criar({ entidadeId: req.entidade.id, ...(req.body || {}) }),
  }), { permissao: 'configurar', modulo: 'orcamento', json: true }));

  app.put('/finance/api/orcamentos/:id/linhas', ...rota((req) => ({
    ok: true,
    linhas: orcamento.definirLinhas(req.params.id, req.entidade.id, (req.body || {}).linhas || []),
    orcamento: orcamento.buscar(req.params.id),
  }), { permissao: 'configurar', modulo: 'orcamento', json: true }));

  app.post('/finance/api/orcamentos/:id/aprovar', ...rota((req) => ({
    ok: true, orcamento: orcamento.aprovar(req.params.id, { motivo: (req.body || {}).motivo }),
  }), { permissao: 'configurar', modulo: 'orcamento', json: true }));

  app.get('/finance/api/orcado-realizado', ...rota((req) => orcamento.realizado(req.entidade.id, {
    orcamentoId: String(req.query.orcamento || '') || undefined,
    competencia: comp(req),
    acumulado: req.query.acumulado === '1',
  }), { modulo: '' }));

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

  app.get('/finance/api/apuracao/:competencia', ...rota((req) =>
    apuracao.previaApuracao(req.entidade.id, { competencia: req.params.competencia })));

  /** Apurar resultado é nível 3: depois dela o DRE do período zera. */
  app.post('/finance/api/apuracao/:competencia', ...rota((req) => {
    const previa = apuracao.previaApuracao(req.entidade.id, { competencia: req.params.competencia });
    const s = aprovacoes.solicitar({
      acao: 'resultado.apurar', entidadeId: req.entidade.id,
      objetoTipo: 'apuracao', objetoId: `${req.entidade.id}:${req.params.competencia}`,
      payload: { entidadeId: req.entidade.id, competencia: req.params.competencia, motivo: (req.body || {}).motivo || '' },
      previa: {
        periodo: `${previa.desde} a ${previa.ate}`,
        contasZeradas: previa.contas.length,
        resultado: previa.resultado, tipo: previa.tipo,
        aviso: previa.aviso,
      },
      valorCents: Math.abs(previa.resultadoCents),
      motivo: (req.body || {}).motivo || `apuração de ${req.params.competencia}`,
    });
    return { ok: true, aprovacao: s, previa };
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

  // ------------------------------------------- contrapartes (fase 3)
  app.get('/finance/api/contrapartes', ...rota((req) => ({
    contrapartes: contrapartes.listar(req.entidade.id, String(req.query.tipo || '')),
  })));

  app.post('/finance/api/contrapartes', ...rota((req) => {
    const d = req.body || {};
    return { ok: true, contraparte: contrapartes.criar({ entidadeId: req.entidade.id, ...d }) };
  }, { permissao: 'cadastrar', modulo: 'razao', json: true }));

  app.patch('/finance/api/contrapartes/:id', ...rota((req) => ({
    ok: true, contraparte: contrapartes.atualizar(req.params.id, req.body || {}),
  }), { permissao: 'cadastrar', modulo: 'razao', json: true }));

  /** Dado bancário é nível 3: vira solicitação com antes/depois na prévia. */
  app.post('/finance/api/contrapartes/:id/dados-bancarios', ...rota((req) => ({
    ok: true,
    aprovacao: contrapartes.solicitarDadosBancarios(req.params.id, req.body || {}),
    aviso: 'Mudança de dado bancário é ação material: precisa da aprovação de outra pessoa.',
  }), { permissao: 'cadastrar', modulo: 'razao', json: true }));

  // ------------------------------------ contas a pagar e receber (fase 3)
  app.get('/finance/api/titulos', ...rota((req) => ({
    titulos: titulos.listar(req.entidade.id, {
      especie: String(req.query.especie || ''),
      status: String(req.query.status || ''),
      contraparteId: String(req.query.contraparte || ''),
      limite: Math.min(Number(req.query.limite) || 200, 500),
    }),
  })));

  app.get('/finance/api/titulos/:id', ...rota((req, res) => {
    const t = titulos.buscar(req.params.id);
    if (!t) return res.status(404).json({ erro: 'Título não encontrado.' });
    return Object.assign({}, t, {
      liquidacoesPorParcela: Object.fromEntries(
        t.parcelas.map(p => [p.id, liquidacoes.listarDaParcela(p.id)])),
      auditoria: auditoria.listar({ objetoTipo: 'titulo', objetoId: req.params.id, limite: 20 }),
    });
  }));

  app.post('/finance/api/titulos', ...rota((req) => {
    const r = titulos.criar({ entidadeId: req.entidade.id, ...(req.body || {}) });
    return { ok: true, ...r };
  }, { permissao: 'lancar', modulo: 'razao', medida: 'lancamentos_mes', json: true }));

  app.post('/finance/api/titulos/:id/cancelar', ...rota((req) => ({
    ok: true, ...titulos.cancelar(req.params.id, { motivo: (req.body || {}).motivo }),
  }), { permissao: 'lancar', modulo: 'razao', json: true }));

  app.get('/finance/api/aging', ...rota((req) => titulos.aging(req.entidade.id, {
    especie: String(req.query.especie || 'receber'),
    referencia: String(req.query.referencia || '') || undefined,
  })));

  app.get('/finance/api/inadimplentes', ...rota((req) => ({
    especie: String(req.query.especie || 'receber'),
    inadimplentes: titulos.inadimplentes(req.entidade.id, {
      especie: String(req.query.especie || 'receber'),
      limite: Math.min(Number(req.query.limite) || 20, 100),
    }),
  })));

  // -------------------------------------------------------- liquidação
  app.post('/finance/api/parcelas/:id/liquidar', ...rota((req) => ({
    ok: true, ...liquidacoes.liquidar({ parcelaId: req.params.id, ...(req.body || {}) }),
  }), { permissao: 'lancar', modulo: 'razao', medida: 'lancamentos_mes', json: true }));

  app.post('/finance/api/liquidacoes/:id/estornar', ...rota((req) => ({
    ok: true, ...liquidacoes.estornar(req.params.id, { motivo: (req.body || {}).motivo }),
  }), { permissao: 'lancar', modulo: 'razao', json: true }));

  /**
   * Ordem de pagamento: nível 3. Registra a ORDEM com aprovação e alçada.
   * **Não executa transferência bancária** — aprovada, ela vira a
   * liquidação contábil; quem move o dinheiro é uma pessoa, no banco.
   */
  app.post('/finance/api/parcelas/:id/ordem-pagamento', ...rota((req) => {
    const d = req.body || {};
    const preparada = liquidacoes.prepararOrdemDePagamento({ parcelaId: req.params.id, ...d });
    const s = aprovacoes.solicitar({
      acao: 'pagamento.executar', entidadeId: req.entidade.id,
      objetoTipo: 'parcela', objetoId: req.params.id,
      payload: preparada.payload, previa: preparada.previa,
      valorCents: preparada.valorCents,
      motivo: d.motivo || `pagamento de ${preparada.previa.favorecido}`,
    });
    return {
      ok: true, aprovacao: s,
      aviso: 'A ordem foi registrada e aguarda aprovação. O sistema NÃO executa a transferência — ' +
             'aprovada, ela vira o lançamento de que o pagamento foi feito.',
    };
  }, { permissao: 'pagar', modulo: 'pagar', json: true }));

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

  // ------------------------------------- CFO inteligente (fase 6)
  app.get('/finance/api/cfo/briefing', ...rota((req) => cfo.briefing(req.entidade.id, comp(req), {
    dias: Math.min(Number(req.query.dias) || 90, 365),
    referencia: String(req.query.referencia || '') || undefined,
  }), { modulo: '' }));

  /**
   * Conselho dos Mestres. Só aparece princípio que os NÚMEROS acionaram —
   * e cada um vem com onde conferir no manuscrito, o que o limita e com
   * quem ele diverge.
   */
  app.get('/finance/api/conselho', ...rota(
    (req) => conselho.montarPara(req.entidade.id, comp(req)), { modulo: '' }));

  app.get('/finance/api/conselho/principios', ...rota(() => ({
    principios: conselho.PRINCIPIOS.map(p => ({
      id: p.id, autor: p.autor, obraOriginal: p.obraOriginal,
      capitulo: p.capitulo, secao: p.secao, linhas: p.linhas,
      dominioDeOrigem: p.dominio, resumo: p.resumo,
      aplicabilidade: p.aplicabilidade, limitacoes: p.limitacoes,
      contraArgumento: p.contraArgumento, conflitaCom: p.conflitaCom,
    })),
    obra: conselho.OBRA, arquivo: conselho.ARQUIVO,
  }), { modulo: '' }));

  // ------------------------------------- segundo fator (fase 10)
  app.get('/finance/api/mfa', ...rota((req) => mfa.estado(req.assinante.id)));

  /** Passo 1: gera o QR. O segredo em claro aparece UMA vez, aqui. */
  app.post('/finance/api/mfa/iniciar', ...rota((req) => {
    const r = mfa.iniciar(req.assinante.id);
    auditoria.registrar('mfa.iniciar', { objetoTipo: 'usuario', objetoId: req.assinante.id });
    return r;
  }, { json: true }));

  /** Passo 2: prova que leu o QR. Só aqui o segundo fator passa a valer. */
  app.post('/finance/api/mfa/confirmar', ...rota((req) => {
    const r = mfa.confirmar(req.assinante.id, (req.body || {}).codigo);
    auditoria.registrar('mfa.ativar', {
      objetoTipo: 'usuario', objetoId: req.assinante.id,
      motivo: 'segundo fator ativado pelo próprio usuário',
    });
    return r;
  }, { json: true }));

  app.post('/finance/api/mfa/desativar', ...rota((req) => {
    const r = mfa.desativar(req.assinante.id, (req.body || {}).codigo);
    auditoria.registrar('mfa.desativar', {
      objetoTipo: 'usuario', objetoId: req.assinante.id,
      motivo: 'desativado pelo próprio usuário, com código válido',
    });
    return r;
  }, { json: true }));

  // --------------------------------- exportação e portabilidade (fase 9)
  // Leitura pura: NÃO passa por entitlements. Conta suspensa continua
  // exportando o próprio razão — reter dado contábil de quem deve é
  // problema jurídico, não alavanca comercial.
  app.get('/finance/api/exportar', ...rota((req) => exportacao.inventario(req.entidade.id)));

  app.get('/finance/api/exportar/razao.csv', ...rota((req, res) => {
    const r = exportacao.razaoCsv(req.entidade.id, {
      desde: String(req.query.desde || ''), ate: String(req.query.ate || ''),
    });
    res.type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="razao-${req.entidade.id}.csv"`)
      .send(r.csv);
  }));

  app.get('/finance/api/exportar/completo.json', ...rota((req, res) => {
    const pacote = exportacao.pacoteCompleto(req.entidade.id, {
      desde: String(req.query.desde || ''), ate: String(req.query.ate || ''),
    });
    res.type('application/json; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="villela-finance-${req.entidade.id}.json"`)
      .send(JSON.stringify(pacote, null, 2));
  }));

  // --------------------------------------------- assinatura (cobrança)
  // Leitura do estado é para qualquer perfil: quem opera precisa saber
  // que a conta vai vencer. Assinar e cancelar são do DONO da conta.
  app.get('/finance/api/assinatura', ...rota((req) => billing.estado(req.tenant)));

  app.post('/finance/api/assinatura', ...rota((req) => billing.assinar(
    req.tenant, (req.body || {}).plano, {
      email: req.assinante.email,
      baseUrl: `${req.protocol}://${req.get('host')}`,
    }), { permissao: 'administrar', json: true }));

  app.post('/finance/api/assinatura/cancelar', ...rota((req) => billing.cancelar(req.tenant, {
    motivo: String((req.body || {}).motivo || 'cancelamento pedido pelo assinante'),
  }), { permissao: 'administrar', json: true }));

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
