// =====================================================================
// Villela Finance — provisionamento de conta (tenant) e de empresa.
//
// Criar uma conta aqui significa deixá-la PRONTA PARA USAR: plano de
// contas semeado, período corrente aberto, regras iniciais de
// classificação e o primeiro usuário. "Primeiro insight útil no mesmo dia
// do onboarding" não sai de discurso — sai de a conta nascer completa.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { transacao, novoId, nowISO, hojeISO } = require('./db');
const repo = require('./repo');
const tenancy = require('./tenancy');
const planoContas = require('./plano-contas');
const entitlements = require('./entitlements');
const auditoria = require('./auditoria');
const rbac = require('./rbac');

/** Slug do próprio grupo — a Villela Stay é o tenant nº 1 e é interna. */
const SLUG_INTERNO = 'villela-stay';

class ErroDeConta extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDeConta'; this.status = 400; }
}

const slugificar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/**
 * Cria uma conta com a primeira empresa pronta. Idempotente pelo slug:
 * chamar de novo devolve a que existe, sem duplicar nem re-semear.
 */
function provisionar({ nome, slug, documento = '', planoSlug = 'trial', contatoEmail = '', contatoNome = '', interno = false, empresa = {} }) {
  const chave = slugificar(slug || nome);
  if (!chave) throw new ErroDeConta('Informe o nome da conta.');

  const existente = repo.tenantPorSlug(chave);
  if (existente) {
    return { tenant: existente, criada: false, entidade: primeiraEntidade(existente.id) };
  }
  const plano = repo.planoPorSlug(planoSlug) || repo.planoPorSlug('trial');

  return transacao(() => {
    const tenant = repo.criarTenant({
      slug: chave, nome, documento, planoId: plano ? plano.id : '',
      status: interno ? 'ativa' : 'trial',
      trialAte: interno ? '' : new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10),
      contatoEmail, contatoNome, interno,
      criadoPor: tenancy.userAtual() || 'provisionamento',
    });

    // A partir daqui tudo roda DENTRO do tenant — inclusive a auditoria.
    return tenancy.comTenant({ tenantId: tenant.id, userId: tenancy.userAtual() || 'provisionamento', perfil: 'proprietario' }, () => {
      const entidade = criarEmpresa({
        nome: empresa.nome || nome,
        documento: empresa.documento || documento,
        regime: empresa.regime || 'simples',
      });
      auditoria.registrar('tenant.provisionar', {
        objetoTipo: 'tenant', objetoId: tenant.id,
        motivo: 'onboarding',
        detalhe: { slug: chave, plano: plano ? plano.slug : '', interno: !!interno, entidade: entidade.id },
      });
      return { tenant, criada: true, entidade };
    });
  });
}

/**
 * Cria uma empresa (entidade legal) dentro da conta corrente e a deixa
 * operável: plano de contas, período aberto e regras iniciais.
 */
function criarEmpresa({ nome, documento = '', regime = 'simples' }) {
  if (!String(nome || '').trim()) throw new ErroDeConta('Informe o nome da empresa.');
  const entidade = repo.criarEntidade({ nome, documento, regime });
  planoContas.semear(entidade.id);
  repo.criarPeriodo(entidade.id, hojeISO().slice(0, 7));
  semearRegras(entidade.id);
  return entidade;
}

/**
 * Regras iniciais de classificação: os padrões que aparecem em quase
 * todo extrato de PME brasileira. Nascem com confiança conservadora —
 * quem confirma é o usuário, e a regra sobe sozinha.
 */
function semearRegras(entidadeId) {
  const conta = (codigo) => {
    const c = repo.contaPorCodigo(entidadeId, codigo);
    return c ? c.id : '';
  };
  const SEMENTE = [
    ['Tarifa bancária', 'tarifa', 'saida', '4.4.1.001', 90],
    ['Tarifa de pacote', 'cesta de servicos', 'saida', '4.4.1.001', 90],
    ['IOF', 'iof', 'saida', '4.4.1.003', 90],
    ['Energia elétrica', 'neoenergia', 'saida', '4.1.1.005', 85],
    ['Energia elétrica (CEB)', 'ceb', 'saida', '4.1.1.005', 80],
    ['Água e esgoto', 'caesb', 'saida', '4.1.1.006', 85],
    ['Internet e TV', 'claro', 'saida', '4.1.1.008', 75],
    ['Internet e TV (Vivo)', 'vivo', 'saida', '4.1.1.008', 75],
    ['Internet e TV (Oi)', 'oi fibra', 'saida', '4.1.1.008', 80],
    ['Software e assinaturas', 'assinatura', 'saida', '4.2.1.005', 70],
    ['Pró-labore', 'pro labore', 'saida', '4.2.1.002', 85],
    ['Simples Nacional', 'darf', 'saida', '4.9.1.001', 70],
    ['Anúncios', 'google ads', 'saida', '4.3.1.001', 90],
    ['Anúncios (Meta)', 'facebook', 'saida', '4.3.1.001', 85],
  ];
  let criadas = 0;
  for (const [nome, padrao, sentido, codigo, confianca] of SEMENTE) {
    const contaId = conta(codigo);
    if (!contaId) continue;
    repo.criarRegra({ entidadeId, nome, padrao, sentido, contaId, confianca, prioridade: 200, origem: 'sistema' });
    criadas++;
  }
  return criadas;
}

const primeiraEntidade = (tenantId) => tenancy.comTenant({ tenantId, userId: 'sistema' }, () => {
  const lista = repo.listarEntidades();
  return lista[0] || null;
});

const hashSenha = (senha) => {
  const sal = crypto.randomBytes(16).toString('hex');
  const derivada = crypto.scryptSync(String(senha), sal, 32).toString('hex');
  return `scrypt$${sal}$${derivada}`;
};
const conferirSenha = (senha, hash) => {
  const [algo, sal, esperado] = String(hash || '').split('$');
  if (algo !== 'scrypt' || !sal || !esperado) return false;
  const derivada = crypto.scryptSync(String(senha), sal, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derivada, 'hex'), Buffer.from(esperado, 'hex'));
};

/** Cria usuário da conta corrente. Perfil tem de existir no catálogo. */
function criarUsuario({ email, nome, senha, perfil = 'operador' }) {
  if (!rbac.perfil(perfil)) throw new ErroDeConta(`Perfil desconhecido: ${perfil}.`);
  if (!String(email || '').includes('@')) throw new ErroDeConta('Informe um e-mail válido.');
  if (repo.usuarioPorEmail(email)) throw new ErroDeConta('Já existe usuário com este e-mail nesta conta.');
  const u = repo.criarUsuario({ email, nome, perfil, senhaHash: senha ? hashSenha(senha) : '' });
  auditoria.registrar('usuario.criar', {
    objetoTipo: 'usuario', objetoId: u.id,
    detalhe: { email: u.email, perfil },
  });
  return { id: u.id, email: u.email, nome: u.nome, perfil: u.perfil, status: u.status };
};

/** Semeadura de boot: planos + a conta interna do grupo. */
function semearPlataforma() {
  const planos = entitlements.semear();
  const interno = tenancy.semContexto(() => provisionar({
    nome: 'Villela Stay', slug: SLUG_INTERNO,
    documento: '56.776.526/0001-12',
    planoSlug: 'enterprise', interno: true,
    contatoNome: 'Augusto Villela',
    empresa: { nome: 'Augusto Villela Ltda', documento: '56.776.526/0001-12', regime: 'simples' },
  }));
  return { planos, tenantInterno: interno.tenant.slug, criada: interno.criada, entidade: interno.entidade && interno.entidade.id };
}

module.exports = {
  ErroDeConta, SLUG_INTERNO, provisionar, criarEmpresa, semearRegras,
  criarUsuario, hashSenha, conferirSenha, semearPlataforma, slugificar, primeiraEntidade,
};
