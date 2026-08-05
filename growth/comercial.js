// =====================================================================
// Villela Growth OS — comercialização (§23, §24 e §35 do PROMPT_MASTER).
//
// Esta etapa AMARRA o que as oito anteriores construíram: faz os planos
// carregarem de verdade os recursos, mostra ao assinante onde ele está no
// onboarding, dá à agência a visão das contas dela e libera a marca
// própria nas páginas públicas.
//
// Duas coisas que este arquivo NÃO faz, de propósito:
//   • não fixa preço no código — preço vive em `plans`, editável no painel
//     (§23 do prompt). Aqui só entram RECURSOS;
//   • não marca onboarding como feito por campo: o checklist é CALCULADO
//     do estado real da conta. Marcar à mão só serve para DISPENSAR um
//     passo que não se aplica ao negócio do assinante.
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const tenancy = require('./tenancy');
const entitlements = require('./entitlements');
const contas = require('./contas');
const { db, nowISO, j } = require('./db');

// ---------------------------------------------- matriz de recursos
// Plano → o que ele libera. Preço NÃO entra aqui.
// Os slugs são os mesmos do Villela CRM (ADR-0002); os nomes comerciais
// são "Villela CRM" na entrada e "Villela Growth" nos completos.
const MATRIZ = {
  trial: {
    flags: { crm: true, inbox: true, automacoes: true, ia: true, redes_sociais: true,
      reputacao: true, reunioes: true, landing_pages: true, api_publica: false,
      whatsapp_api: false, anuncios: false, white_label: false, agencia: false },
    limites: { contatos: 500, usuarios: 3, funis: 5, formularios: 3, paginas: 2, segmentos: 5,
      workflows: 3, automacoes_execucoes: 200, agentes: 2, conexoes: 1, mensagens_mes: 500,
      conteudos_mes: 10, midias: 50, contas_anuncio: 0 },
  },
  starter: {   // Villela CRM — Essencial
    flags: { crm: true, inbox: false, automacoes: false, ia: false, redes_sociais: false,
      reputacao: false, reunioes: true, landing_pages: true, api_publica: false,
      whatsapp_api: false, anuncios: false, white_label: false, agencia: false },
    limites: { contatos: 1000, usuarios: 2, funis: 1, formularios: 3, paginas: 2, segmentos: 3,
      workflows: 0, automacoes_execucoes: 0, agentes: 0, conexoes: 1, mensagens_mes: 0,
      conteudos_mes: 0, midias: 30, contas_anuncio: 0 },
  },
  professional: {   // Villela CRM — Profissional
    flags: { crm: true, inbox: true, automacoes: true, ia: false, redes_sociais: false,
      reputacao: true, reunioes: true, landing_pages: true, api_publica: false,
      whatsapp_api: false, anuncios: false, white_label: false, agencia: false },
    limites: { contatos: 10000, usuarios: 5, funis: 10, formularios: 10, paginas: 10, segmentos: 20,
      workflows: 10, automacoes_execucoes: 2000, agentes: 0, conexoes: 3, mensagens_mes: 3000,
      conteudos_mes: 0, midias: 200, contas_anuncio: 0 },
  },
  business: {   // Villela Growth — Completo
    flags: { crm: true, inbox: true, automacoes: true, ia: true, redes_sociais: true,
      reputacao: true, reunioes: true, landing_pages: true, api_publica: true,
      whatsapp_api: true, anuncios: true, white_label: true, agencia: false },
    limites: { contatos: 100000, usuarios: 15, funis: -1, formularios: 50, paginas: 50, segmentos: -1,
      workflows: 50, automacoes_execucoes: 20000, agentes: 12, conexoes: 10, mensagens_mes: 30000,
      conteudos_mes: 200, midias: 2000, contas_anuncio: 5 },
  },
  enterprise: {   // Villela Growth — Enterprise
    flags: { crm: true, inbox: true, automacoes: true, ia: true, redes_sociais: true,
      reputacao: true, reunioes: true, landing_pages: true, api_publica: true,
      whatsapp_api: true, anuncios: true, white_label: true, agencia: true },
    limites: { contatos: -1, usuarios: -1, funis: -1, formularios: -1, paginas: -1, segmentos: -1,
      workflows: -1, automacoes_execucoes: -1, agentes: -1, conexoes: -1, mensagens_mes: -1,
      conteudos_mes: -1, midias: -1, contas_anuncio: -1 },
  },
};

/**
 * Escreve a matriz nos planos existentes. Idempotente e conservadora:
 * mexe só em `flags` e `limites`, NUNCA em preço, nome ou status de
 * assinatura em vigor.
 */
function semearRecursos() {
  let atualizados = 0;
  for (const [slug, def] of Object.entries(MATRIZ)) {
    const plano = db.prepare('SELECT * FROM plans WHERE slug = ?').get(slug);
    if (!plano) continue;

    // A MATRIZ é a definição comercial do plano — ela manda no que é dela.
    // O que o plano tinha e a matriz não conhece é preservado. O ajuste
    // por CONTA continua vencendo os dois, em tempo de resolução
    // (tenant_settings e gx_entitlements), então nenhum cliente com
    // condição especial é atropelado por esta semeadura.
    //
    // ⚠️ CONVENÇÃO DE LIMITE: aqui, -1 = ilimitado e 0 = NÃO incluído.
    // O Villela CRM nasceu com 0 = ilimitado. A matriz normaliza para a
    // convenção do Growth OS, senão o plano Enterprise (`funis: 0` no
    // legado) seria lido como "zero funis permitidos" e bloquearia tudo.
    const flags = Object.assign({}, j.parse(plano.flags, {}), def.flags);
    const limites = Object.assign({}, j.parse(plano.limites, {}), def.limites);

    db.prepare('UPDATE plans SET flags = ?, limites = ?, atualizado_em = ? WHERE slug = ?')
      .run(j.str(flags), j.str(limites), nowISO(), slug);
    atualizados++;
  }
  return atualizados;
}

/** Comparativo dos planos para a página de preços. Preço vem do banco. */
function comparativo() {
  const planos = db.prepare('SELECT * FROM plans WHERE ativo = 1 ORDER BY ordem').all();
  return planos.map((p) => ({
    slug: p.slug, nome: p.nome, descricao: p.descricao,
    preco_centavos: p.preco_centavos, ciclo: p.ciclo,
    flags: j.parse(p.flags, {}), limites: j.parse(p.limites, {}),
  }));
}

// ------------------------------------------------------ onboarding

/**
 * Os passos. `verificar` olha o ESTADO REAL da conta — nada de campo
 * marcado à mão. `exige` é a flag de plano que torna o passo aplicável.
 */
const PASSOS = [
  { chave: 'equipe', titulo: 'Convide seu time', peso: 1,
    verificar: () => repo.contar('gx_equipes') > 0 || contasDoTenant() > 1 },
  { chave: 'funil', titulo: 'Confira o funil de vendas', peso: 2,
    verificar: () => repo.contar('crm_funis') > 0 },
  { chave: 'contatos', titulo: 'Traga seus contatos', peso: 3,
    verificar: () => repo.contar('crm_contatos') > 0 },
  { chave: 'formulario', titulo: 'Publique um formulário de captura', peso: 2,
    verificar: () => repo.contar('gx_formularios', { onde: "status = 'publicado'" }) > 0 },
  { chave: 'canal', titulo: 'Conecte um canal de atendimento', peso: 3, exige: 'inbox',
    verificar: () => repo.contar('gx_conexoes', { onde: "status = 'ativa'" }) > 0 },
  { chave: 'automacao', titulo: 'Publique sua primeira automação', peso: 2, exige: 'automacoes',
    verificar: () => repo.contar('gx_workflows', { onde: "status = 'publicado'" }) > 0 },
  { chave: 'conhecimento', titulo: 'Alimente a base de conhecimento', peso: 2, exige: 'ia',
    verificar: () => repo.contar('gx_conhecimento', { onde: "status = 'aprovado'" }) > 0 },
  { chave: 'agente', titulo: 'Ligue um agente de IA', peso: 1, exige: 'ia',
    verificar: () => repo.contar('gx_agentes', { onde: 'ativo = 1' }) > 0 },
  { chave: 'reuniao', titulo: 'Crie um tipo de reunião', peso: 1, exige: 'reunioes',
    verificar: () => repo.contar('gx_tipos_reuniao') > 0 },
  { chave: 'pesquisa', titulo: 'Ative uma pesquisa de satisfação', peso: 1, exige: 'reputacao',
    verificar: () => repo.contar('gx_pesquisas', { onde: "status = 'ativa'" }) > 0 },
  { chave: 'lgpd', titulo: 'Defina seu papel na LGPD e a política', peso: 3,
    verificar: () => { const c = require('./lgpd').config(); return !!c.politica_url; } },
];

const contasDoTenant = () => {
  try { return repo.q("SELECT COUNT(*) AS n FROM gx_memberships WHERE escopo_tipo = 'tenant' AND escopo_id = :tenant")[0].n; }
  catch { return 0; }
};

/** Checklist com o estado real + o que foi dispensado. */
function onboarding() {
  const tid = tenancy.tenantAtual();
  const ent = entitlements.resolver();
  const overrides = db.prepare('SELECT * FROM gx_onboarding WHERE tenant_id = ?').all(tid)
    .reduce((a, o) => { a[o.passo] = o; return a; }, {});

  const passos = PASSOS
    .filter((p) => !p.exige || ent.flags[p.exige])   // passo de recurso que o plano não tem some
    .map((p) => {
      const ov = overrides[p.chave];
      if (ov && ov.status === 'dispensado') return { chave: p.chave, titulo: p.titulo, peso: p.peso, status: 'dispensado', observacao: ov.observacao };
      let feito = false;
      try { feito = !!p.verificar(); } catch (_) { feito = false; }
      return { chave: p.chave, titulo: p.titulo, peso: p.peso, status: feito ? 'feito' : 'pendente' };
    });

  const contam = passos.filter((p) => p.status !== 'dispensado');
  const pesoTotal = contam.reduce((s, p) => s + p.peso, 0);
  const pesoFeito = contam.filter((p) => p.status === 'feito').reduce((s, p) => s + p.peso, 0);

  return {
    passos,
    concluido_pct: pesoTotal ? Math.round((pesoFeito / pesoTotal) * 100) : 100,
    proximo: contam.find((p) => p.status === 'pendente') || null,
    plano: ent.plano ? { slug: ent.plano.slug, nome: ent.plano.nome } : null,
  };
}

/** Dispensar um passo que não se aplica ao negócio do assinante. */
function dispensarPasso(passo, { observacao = '' } = {}) {
  if (!PASSOS.some((p) => p.chave === passo)) throw erro(404, `Passo desconhecido: ${passo}`);
  const tid = tenancy.tenantAtual();
  db.prepare(
    'INSERT INTO gx_onboarding (tenant_id, passo, status, observacao, atualizado_em, atualizado_por) VALUES (?,?,?,?,?,?) ' +
    'ON CONFLICT(tenant_id, passo) DO UPDATE SET status = excluded.status, observacao = excluded.observacao, ' +
    'atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por'
  ).run(tid, passo, 'dispensado', observacao, nowISO(), tenancy.userAtual());
  return onboarding();
}

// ------------------------------------------------- painel de agência

/**
 * Visão consolidada das contas da agência. Cada conta é lida DENTRO do
 * próprio contexto — não existe consulta que atravessa contas de uma vez.
 * É mais lento e é assim mesmo: é o preço de não ter vazamento.
 */
function painelAgencia(orgId) {
  const org = contas.orgPorId(orgId);
  if (!org) throw erro(404, 'Organização não encontrada.');
  if (!tenancy.ehPlataforma()) {
    // operador de agência: precisa ter membership NA organização
    const eu = tenancy.userAtual();
    const m = db.prepare("SELECT 1 FROM gx_memberships WHERE user_id = ? AND escopo_tipo = 'org' AND escopo_id = ? AND status = 'ativo'")
      .get(eu, orgId);
    if (!m) throw erro(403, 'Você não administra esta organização.');
  }

  const linhas = contas.contasDaOrg(orgId).map((t) =>
    tenancy.comTenant({ tenantId: t.id, userId: tenancy.userAtual() || 'agencia' }, () => {
      const ent = entitlements.resolver();
      const ob = onboarding();
      return {
        tenant_id: t.id, nome: t.nome, slug: t.slug, status: t.status,
        plano: ent.plano ? ent.plano.nome : null,
        onboarding_pct: ob.concluido_pct,
        contatos: repo.contar('crm_contatos'),
        conversas_abertas: safe(() => repo.contar('gx_conversas', { onde: "status = 'aberta'" })),
        automacoes: safe(() => repo.contar('gx_workflows', { onde: "status = 'publicado'" })),
        aprovacoes_pendentes: safe(() => repo.contar('gx_aprovacoes', { onde: "status = 'pendente'" })),
        uso_mes: entitlements.consumoAtual('mensagens_mes'),
      };
    })
  );

  return {
    organizacao: { id: org.id, nome: org.nome, tipo: org.tipo },
    contas: linhas,
    totais: {
      contas: linhas.length,
      contatos: linhas.reduce((s, l) => s + l.contatos, 0),
      aprovacoes_pendentes: linhas.reduce((s, l) => s + l.aprovacoes_pendentes, 0),
      onboarding_medio_pct: linhas.length ? Math.round(linhas.reduce((s, l) => s + l.onboarding_pct, 0) / linhas.length) : 0,
    },
  };
}

const safe = (fn) => { try { return fn(); } catch { return 0; } };

// ---------------------------------------------------- white-label

/**
 * A identidade que as páginas públicas devem usar. Sem o plano com
 * `white_label`, volta a marca do grupo — a marca original continua
 * disponível para quem não tem o recurso (§24 do prompt).
 */
function identidadePublica(tenantId = null) {
  const tid = tenantId || tenancy.tenantAtual();
  const padrao = {
    white_label: false, nome: 'Villela Growth OS', logo_url: '',
    cores: { primaria: '#1B2A4A', fundo: '#F8F9FA' }, dominio: '', remetente: '',
    rodape: 'Feito com Villela Growth OS',
  };
  const ent = entitlements.resolver(tid);
  if (!ent.flags.white_label) return padrao;

  const marca = db.prepare("SELECT * FROM gx_marcas WHERE tenant_id = ? AND excluido_em = '' ORDER BY principal DESC, criado_em ASC LIMIT 1").get(tid);
  if (!marca) return Object.assign({}, padrao, { white_label: true });

  const dominio = db.prepare("SELECT * FROM gx_dominios WHERE tenant_id = ? AND status = 'verificado' AND excluido_em = '' LIMIT 1").get(tid);
  return {
    white_label: true,
    nome: marca.nome,
    logo_url: marca.logo_url || '',
    cores: Object.assign({}, padrao.cores, j.parse(marca.cores, {})),
    dominio: (dominio && dominio.dominio) || marca.dominio || '',
    remetente: marca.remetente_email || '',
    rodape: '',                          // com white-label, sem assinatura nossa
  };
}

/** Registra um domínio próprio. A verificação é passo separado. */
function registrarDominio({ dominio, marcaId = '' }) {
  entitlements.exigirFlag('white_label');
  const d = String(dominio || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw erro(400, 'Domínio inválido.');
  const ja = db.prepare('SELECT tenant_id FROM gx_dominios WHERE dominio = ?').get(d);
  if (ja) throw erro(409, 'Este domínio já está registrado.');
  const id = repo.inserir('gx_dominios', {
    dominio: d, marca_id: marcaId, status: 'pendente',
    token_verificacao: 'gx-verify-' + crypto.randomBytes(8).toString('hex'),
  });
  repo.auditar({ acao: 'dominio.registrado', entidade: 'gx_dominios', entidadeId: id, detalhe: d });
  return repo.buscar('gx_dominios', id);
}

const dominios = () => repo.listar('gx_dominios', { ordem: 'criado_em DESC' });

// ------------------------------------------------------- assinatura

/** O que o assinante vê sobre o próprio plano: uso contra limite. */
function minhaAssinatura() {
  const ent = entitlements.resolver();
  const medidas = [
    ['contatos', () => repo.contar('crm_contatos')],
    ['usuarios', () => contasDoTenant()],
    ['formularios', () => repo.contar('gx_formularios')],
    ['workflows', () => repo.contar('gx_workflows')],
    ['conexoes', () => repo.contar('gx_conexoes')],
    ['contas_anuncio', () => safe(() => repo.contar('gx_contas_anuncio'))],
  ];
  const uso = medidas.map(([chave, medir]) => {
    const limite = Number(ent.limites[chave]);
    const atual = safe(medir);
    return {
      recurso: chave, usado: atual, limite,
      ilimitado: limite < 0,
      pct: limite > 0 ? Math.min(100, Math.round((atual / limite) * 100)) : null,
      estourado: limite >= 0 && atual >= limite,
    };
  });
  const porMes = ['mensagens_mes', 'automacoes_execucoes', 'conteudos_mes'].map((m) => ({
    recurso: m, usado: entitlements.consumoAtual(m), limite: Number(ent.limites[m]),
    ilimitado: Number(ent.limites[m]) < 0,
  }));

  return {
    plano: ent.plano ? { slug: ent.plano.slug, nome: ent.plano.nome, preco_centavos: ent.plano.preco_centavos } : null,
    recursos_liberados: Object.entries(ent.flags).filter(([, v]) => v).map(([k]) => k),
    recursos_bloqueados: Object.entries(ent.flags).filter(([, v]) => !v).map(([k]) => k),
    uso, uso_mensal: porMes,
    onboarding: onboarding(),
    identidade: identidadePublica(),
  };
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  MATRIZ, PASSOS,
  semearRecursos, comparativo, onboarding, dispensarPasso,
  painelAgencia, identidadePublica, registrarDominio, dominios, minhaAssinatura,
};
