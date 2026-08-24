// =====================================================================
// Villela Finance — administração da plataforma (/staff/api/finance/*).
//
// Só admin do Portal Staff. Atenção ao caminho: `/staff/api/finance`, com
// "finance" e não "financeiro" — `/staff/api/financeiro/*` continua sendo
// o módulo LEGADO em server.js, que este produto vai estrangular por
// feature flag (ver docs/financeiro/MIGRACAO.md). Os dois convivem até a
// reconciliação fechar.
//
// Toda leitura que atravessa contas passa por `comoPlataforma` com
// motivo — e o motivo entra na auditoria.
// =====================================================================
'use strict';
const { db, j } = require('./db');
const repo = require('./repo');
const tenancy = require('./tenancy');
const contasSvc = require('./contas');
const entitlements = require('./entitlements');
const ledger = require('./ledger');
const auditoria = require('./auditoria');
const diario = require('./diario');
const rbac = require('./rbac');
const dinheiro = require('./dinheiro');
const { responderErro } = require('./rotas-app');

function registrarRotasStaff(app, { requireAuth, requireAdmin, express }) {
  if (!requireAuth || !requireAdmin || !express) {
    throw new Error('financeiro/rotas-staff: faltam deps (requireAuth, requireAdmin, express).');
  }
  const B = '/staff/api/finance';
  const corpo = express.json({ limit: '2mb' });

  /** Envelope admin: abre contexto de plataforma com motivo auditável. */
  const admin = (fn, { json: comJson = false, motivo = 'administração da plataforma' } = {}) => {
    const meios = [requireAuth, requireAdmin];
    if (comJson) meios.push(corpo);
    meios.push((req, res) => {
      try {
        const saida = tenancy.comoPlataforma(
          { userId: (req.user && (req.user.email || req.user.nome)) || 'staff', motivo, correlationId: req.correlationId },
          () => fn(req, res));
        if (saida && typeof saida.then === 'function') {
          return saida.then(v => { if (v !== undefined && !res.headersSent) res.json(v); }).catch(e => responderErro(res, e));
        }
        if (saida !== undefined && !res.headersSent) res.json(saida);
      } catch (e) { responderErro(res, e); }
    });
    return meios;
  };

  // ------------------------------------------------------------ contas
  app.get(`${B}/tenants`, ...admin(() => ({
    tenants: repo.listarTenants().map(t => {
      const e = entitlements.resolver(t);
      const empresas = tenancy.comTenant({ tenantId: t.id, userId: 'plataforma' }, () => repo.listarEntidades());
      return {
        id: t.id, slug: t.slug, nome: t.nome, documento: t.documento, status: t.status,
        interno: t.interno === 1, criadoEm: t.criado_em, trialAte: t.trial_ate,
        contatoEmail: t.contato_email, contatoNome: t.contato_nome,
        plano: { slug: e.planoSlug, nome: e.planoNome }, empresas: empresas.length,
      };
    }),
  })));

  app.post(`${B}/tenants`, ...admin((req) => {
    const d = req.body || {};
    if (!d.nome) throw Object.assign(new Error('Informe o nome da conta.'), { status: 400 });
    const r = contasSvc.provisionar({
      nome: d.nome, slug: d.slug, documento: d.documento || '',
      planoSlug: d.planoSlug || 'trial',
      contatoEmail: d.contatoEmail || '', contatoNome: d.contatoNome || '',
      interno: !!d.interno,
      empresa: d.empresa || {},
    });
    return { ok: true, ...r };
  }, { json: true, motivo: 'provisionar conta' }));

  app.patch(`${B}/tenants/:id`, ...admin((req) => {
    const d = req.body || {};
    const t = repo.tenantPorId(req.params.id);
    if (!t) throw Object.assign(new Error('Conta não encontrada.'), { status: 404 });
    const campos = {};
    if (d.status) campos.status = String(d.status);
    if (d.planoSlug) {
      const p = repo.planoPorSlug(d.planoSlug);
      if (!p) throw Object.assign(new Error('Plano desconhecido.'), { status: 400 });
      campos.plano_id = p.id;
    }
    if (d.overrides) campos.overrides = j.str(d.overrides);
    if (d.nome) campos.nome = String(d.nome);
    const atualizado = repo.atualizarTenant(req.params.id, campos);
    tenancy.comTenant({ tenantId: t.id, userId: 'plataforma', perfil: 'plataforma' }, () => {
      auditoria.registrar(d.status === 'suspensa' ? 'tenant.suspender' : 'tenant.atualizar', {
        objetoTipo: 'tenant', objetoId: t.id,
        motivo: d.motivo || 'administração da plataforma',
        detalhe: campos,
      });
    });
    return { ok: true, tenant: atualizado };
  }, { json: true, motivo: 'alterar conta' }));

  app.post(`${B}/tenants/:id/usuarios`, ...admin((req) => {
    const d = req.body || {};
    const t = repo.tenantPorId(req.params.id);
    if (!t) throw Object.assign(new Error('Conta não encontrada.'), { status: 404 });
    return tenancy.comTenant({ tenantId: t.id, userId: 'plataforma', perfil: 'proprietario' }, () => ({
      ok: true, usuario: contasSvc.criarUsuario({ email: d.email, nome: d.nome, senha: d.senha, perfil: d.perfil || 'proprietario' }),
    }));
  }, { json: true, motivo: 'criar usuário do assinante' }));

  app.post(`${B}/tenants/:id/empresas`, ...admin((req) => {
    const d = req.body || {};
    const t = repo.tenantPorId(req.params.id);
    if (!t) throw Object.assign(new Error('Conta não encontrada.'), { status: 404 });
    return tenancy.comTenant({ tenantId: t.id, userId: 'plataforma', perfil: 'proprietario' }, () => ({
      ok: true, empresa: contasSvc.criarEmpresa({ nome: d.nome, documento: d.documento, regime: d.regime }),
    }));
  }, { json: true, motivo: 'criar empresa do assinante' }));

  // ------------------------------------------------------------ planos
  app.get(`${B}/planos`, ...admin(() => ({
    planos: repo.listarPlanos().map(p => ({
      id: p.id, slug: p.slug, nome: p.nome, precoCents: p.preco_cents, preco: dinheiro.formatar(p.preco_cents),
      periodo: p.periodo, modulos: j.parse(p.modulos, []), limites: j.parse(p.limites, {}),
      flags: j.parse(p.flags, {}), publico: p.publico === 1, ordem: p.ordem,
    })),
    catalogoModulos: entitlements.MODULOS,
    limitesConhecidos: entitlements.LIMITES,
  })));

  app.patch(`${B}/planos/:slug`, ...admin((req) => {
    const p = repo.planoPorSlug(req.params.slug);
    if (!p) throw Object.assign(new Error('Plano não encontrado.'), { status: 404 });
    const d = req.body || {};
    // Preço é mexido pelo painel comercial, não por esta rota — evita
    // trocar preço de plano com assinante ativo sem passar pelo fluxo.
    if (d.precoCents != null) {
      db.prepare('UPDATE plans SET preco_cents = ?, atualizado_em = ? WHERE id = ?')
        .run(dinheiro.naoNegativo(Number(d.precoCents), 'preço'), new Date().toISOString(), p.id);
    }
    repo.upsertPlano({
      slug: p.slug, nome: d.nome || p.nome,
      modulos: d.modulos || j.parse(p.modulos, []),
      limites: d.limites || j.parse(p.limites, {}),
      flags: d.flags || j.parse(p.flags, {}),
      ordem: d.ordem != null ? d.ordem : p.ordem,
      publico: d.publico != null ? d.publico : p.publico === 1,
    });
    return { ok: true, plano: repo.planoPorSlug(p.slug) };
  }, { json: true, motivo: 'alterar plano' }));

  // ------------------------------------------------------------ saúde
  /** O painel que responde "posso confiar nos números?" para TODAS as contas. */
  app.get(`${B}/saude`, ...admin(() => {
    const linhas = repo.listarTenants().map(t => tenancy.comTenant({ tenantId: t.id, userId: 'plataforma' }, () => {
      const empresas = repo.listarEntidades();
      const balanco = empresas.map(e => ({ empresa: e.nome, ...ledger.conferirBalanceamento(e.id) }));
      return {
        tenant: t.slug, nome: t.nome, status: t.status,
        empresas: balanco,
        razaoOk: balanco.every(b => b.ok),
        auditoria: auditoria.verificarCadeia(t.id),
      };
    }));
    return {
      contas: linhas,
      resumo: {
        total: linhas.length,
        razaoOk: linhas.filter(l => l.razaoOk).length,
        auditoriaOk: linhas.filter(l => l.auditoria.ok).length,
      },
      diario: diario.status(),
      // Sem isto no ar, "zero vazamento entre tenants" seria só uma frase.
      isolamento: { modelo: 'contexto + guarda no repositório', rls: false, testado: 'npm run test:finance' },
    };
  }, { motivo: 'auditoria de saúde da plataforma' }));

  app.post(`${B}/diario/replicar`, ...admin(() => diario.replicar(), { motivo: 'forçar replicação do diário' }));

  app.get(`${B}/diario/conferir/:competencia`, ...admin((req) => {
    // A conferência precisa do contexto de cada tenant para ler os lotes.
    const porTenant = repo.listarTenants().map(t =>
      tenancy.comTenant({ tenantId: t.id, userId: 'plataforma' }, () => ({
        tenant: t.slug, ...diario.conferir(repo, req.params.competencia),
      })));
    return { competencia: req.params.competencia, contas: porTenant };
  }, { motivo: 'conferir diário contra o banco' }));

  // -------------------------------------------------------- referência
  app.get(`${B}/catalogo`, ...admin(() => ({
    acoes: Object.entries(rbac.ACOES).map(([id, a]) => ({
      id, nivelMinimo: a.nivelMinimo, permissao: a.permissao, motivo: a.motivo || '',
    })),
    niveis: rbac.NIVEIS,
    perfis: Object.entries(rbac.PERFIS).map(([id, p]) => ({ id, ...p })),
    modulos: entitlements.MODULOS,
  })));
}

module.exports = { registrarRotasStaff };
