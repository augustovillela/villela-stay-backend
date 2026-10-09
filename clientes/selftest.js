// =====================================================================
// Clientes — suíte.   npm run test:clientes
//
// As bases são as REAIS de cada produto (schema de verdade, num DATA_DIR
// descartável), com uma carteira que parece a nossa: pedido pago, pedido
// reembolsado, pedido de teste, Pix de centavo, cortesia, conta do dono,
// teste grátis vigente e vencido, assinatura cancelada que já pagou. Os
// números esperados foram somados À MÃO, fora do código (ver TABELA abaixo):
// se o motor e o teste errassem juntos, a conta de cabeça não fecharia.
//
//   catálogo      todo sistema da central de comunicados está classificado
//   autorização   sem sessão 401 · membro 403 · PUBLISH_KEY só 403 · admin 200
//   normalização  cada fonte, com o que EXISTE e o que NÃO existe nela
//   receita       só pagamento registrado; cortesia/teste/interna/reembolso fora
//   resiliência   fonte que quebra vira "indisponível" e não derruba as outras
//   leitura       nenhuma escrita em banco de produto
// =====================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

process.env.DATA_DIR = path.join(os.tmpdir(), 'clientes-selftest-' + Date.now());
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
process.env.CLIENTES_CACHE_MS = '0';
process.env.CLIENTES_EMAILS_INTERNOS = 'dono@grupo-interno.com';
process.env.MUSIC_DONO_EMAIL = '';
process.env.PUBLISH_KEY = 'chave-de-teste';

// Origena: só o banco LOCAL de teste serve. O `db.js` dela cai na URL de
// PRODUÇÃO quando a de teste falta — então a de produção sai do ambiente aqui.
// A URL de teste vem do ambiente ou do .env do clone (só essa chave é lida).
function urlDeTesteOrigena() {
  if (process.env.ORIGENA_TEST_DATABASE_URL) return process.env.ORIGENA_TEST_DATABASE_URL;
  for (const arq of [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '..', '.env')]) {
    try {
      const m = fs.readFileSync(arq, 'utf8').match(/^ORIGENA_TEST_DATABASE_URL=(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch (_) { /* sem .env: segue */ }
  }
  return '';
}
const PG_TESTE = urlDeTesteOrigena();
delete process.env.ORIGENA_DATABASE_URL;
if (PG_TESTE) { process.env.ORIGENA_TEST_DATABASE_URL = PG_TESTE; process.env.ORIGENA_DB_SCHEMA = 't_clientes_' + crypto.randomBytes(4).toString('hex'); }
else delete process.env.ORIGENA_DB_SCHEMA;

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

// ---- staff falso: a sessão é o cookie, como no portal de verdade ----
function requireAuth(req, res, next) {
  const c = req.cookies && req.cookies.staff_token;
  if (c === 'adm') { req.user = { id: 'adm', nome: 'Admin', email: 'adm@villela.test', papel: 'admin' }; return next(); }
  if (c === 'op') { req.user = { id: 'op', nome: 'Operação', email: 'op@villela.test', papel: 'membro' }; return next(); }
  return res.status(401).json({ erro: 'não autenticado' });
}
const requireAdmin = (req, res, next) => req.user && req.user.papel === 'admin' ? next() : res.status(403).json({ erro: 'apenas administrador' });
const auditoria = [];
const registrarAuditoria = (req, acao, detalhe) => auditoria.push({ acao, detalhe });

// ---- fixture ----
const ins = (db, tabela, o) => {
  const cols = Object.keys(o);
  db.prepare(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => o[c]));
};
const D = (dia, hora = '12:00:00') => `${dia}T${hora}.000Z`;
const AGORA = new Date().toISOString();
const DAQUI_A = (dias) => new Date(Date.now() + dias * 864e5).toISOString();
const J = JSON.stringify;

// Livraria -----------------------------------------------------------------
const liv = require('../livraria/db').db;
for (const [id, titulo] of [['b1', 'Claude AI na Prática'], ['b2', 'O Homem Essencial']]) {
  ins(liv, 'books', { id, slug: id, titulo, preco_pdf: 4990, preco_impresso: 8990, created_at: D('2026-07-01'), updated_at: D('2026-07-01') });
}
const cliLiv = (id, nome, email, whatsapp) => ins(liv, 'customers', { id, nome, email, whatsapp, created_at: D('2026-08-01'), updated_at: D('2026-08-01') });
cliLiv('c1', 'Ana Prado', 'Ana@Ex.com', '(61) 99999-0001');
cliLiv('c2', 'Bruno Reis', 'bruno@ex.com', '');
cliLiv('c3', 'QA Livraria', 'qa@livraria.local', '');
cliLiv('c4', 'Carrinho Abandonado', 'abandonou@ex.com', '');
cliLiv('c5', 'Carla Centavo', 'carla@ex.com', '');
const pedLiv = (id, customer_id, status, valor_total, quando, extra = {}) => ins(liv, 'orders', { id, customer_id, status, valor_bruto: valor_total, valor_total,
  created_at: quando, updated_at: quando, pago_em: status === 'pendente' ? null : quando, ...extra });
const itemLiv = (id, order_id, book_id, tipo, titulo, preco, qtd) => ins(liv, 'order_items', { id, order_id, book_id, tipo, titulo_snapshot: titulo, preco_unit: preco, quantidade: qtd, created_at: AGORA, updated_at: AGORA });
pedLiv('o1', 'c1', 'pago', 22970, D('2026-09-10'), { tem_pdf: 1, tem_impresso: 1 });
itemLiv('i1', 'o1', 'b1', 'pdf', 'Claude AI na Prática', 4990, 1);
itemLiv('i2', 'o1', 'b2', 'impresso', 'O Homem Essencial', 8990, 2);
pedLiv('o2', 'c2', 'reembolsado', 4990, D('2026-08-05')); itemLiv('i3', 'o2', 'b1', 'pdf', 'Claude AI na Prática', 4990, 1);
pedLiv('o3', 'c3', 'pago', 4990, D('2026-09-01'), { teste: 1 }); itemLiv('i4', 'o3', 'b1', 'pdf', 'Claude AI na Prática', 4990, 1);
pedLiv('o4', 'c4', 'pendente', 4990, D('2026-09-02')); itemLiv('i5', 'o4', 'b1', 'pdf', 'Claude AI na Prática', 4990, 1);
pedLiv('o5', 'c5', 'pago', 1, D('2026-09-03')); itemLiv('i6', 'o5', 'b1', 'pdf', '=HYPERLINK("http://x")', 1, 1);

// Academy ------------------------------------------------------------------
const acad = require('../academy/db').db;
const uAc = (id, nome, email, telefone, extra = {}) => ins(acad, 'users', { id, nome, email, telefone, status: 'ativo', criado_em: D('2026-08-01'), ...extra });
uAc('prod', 'Augusto Produtor', 'dono@grupo-interno.com', '');
uAc('a1', 'Ana Prado', 'ana@ex.com', '61999990001');
uAc('a2', 'Dário Lima', 'dario@ex.com', '');
uAc('a3', 'Elisa Nunes', 'elisa@ex.com', '11988887777');
uAc('a4', 'Fábio Grátis', 'fabio@ex.com', '');
uAc('a5', 'Gil Clube', 'gil@ex.com', '');
const prodAc = (id, tipo, titulo, preco) => ins(acad, 'products', { id, producer_id: 'prod', tipo, titulo, slug: id, preco_centavos: preco, status: 'publicado', criado_em: D('2026-07-01') });
prodAc('p1', 'curso', 'Claude AI na Prática', 14500); prodAc('p2', 'curso', 'IA para Advogados', 0); prodAc('k1', 'clube', 'Clube Villela', 4900);
const pedAc = (id, user_id, product_id, titulo, valor, status, quando, extra = {}) => ins(acad, 'orders', { id, user_id, product_id, produto_titulo: titulo, producer_id: 'prod',
  valor_centavos: valor, status, criado_em: quando, pago_em: quando, ...extra });
const matAc = (id, user_id, product_id, origem, status, quando, criado_por = '') => ins(acad, 'enrollments', { id, user_id, product_id, origem, status, criado_em: quando, criado_por });
pedAc('ao1', 'a1', 'p1', 'Claude AI na Prática', 14500, 'paga', D('2026-09-12')); matAc('e1', 'a1', 'p1', 'compra', 'ativa', D('2026-09-12'), 'mercadopago');
pedAc('ao2', 'a2', 'p1', 'Claude AI na Prática', 14500, 'reembolsada', D('2026-08-20')); matAc('e2', 'a2', 'p1', 'compra', 'revogada', D('2026-08-20'), 'mercadopago');
matAc('e3', 'a3', 'p2', 'cortesia', 'ativa', D('2026-09-01'), 'admin:prod');
pedAc('ao4', 'a4', 'p2', 'IA para Advogados', 0, 'paga', D('2026-09-04')); matAc('e4', 'a4', 'p2', 'compra', 'ativa', D('2026-09-04'), 'checkout-gratis');
const subAc = (id, user_id, status, quando) => ins(acad, 'subscriptions', { id, user_id, product_id: 'k1', produto_titulo: 'Clube Villela', producer_id: 'prod', valor_centavos: 4900, status, criado_em: quando, ativa_em: status === 'ativa' ? quando : '' });
subAc('s1', 'a5', 'ativa', D('2026-08-15')); subAc('s2', 'a3', 'pendente', D('2026-09-20'));
pedAc('ao5', 'a5', 'k1', 'Clube Villela', 4900, 'paga', D('2026-08-15'), { tipo: 'assinatura', subscription_id: 's1' });
pedAc('ao6', 'a5', 'k1', 'Clube Villela', 4900, 'paga', D('2026-09-15'), { tipo: 'assinatura', subscription_id: 's1' });

// SaaS de conta: VSM, CRM, Legal ------------------------------------------------
function contaSimples(mod, { id, nome, status, telefone = '', plan = '', trial = '', dono, papel, faturas = [] }) {
  const db = require(`../${mod}/db`).db;
  ins(db, 'tenants', { id, slug: id, nome, status, telefone, plan_id: plan, trial_expira_em: trial, criado_em: D('2026-07-10') });
  if (dono) ins(db, 'tenant_users', { id: 'u-' + id, tenant_id: id, nome: dono[0], email: dono[1], papel, ativo: 1, criado_em: D('2026-07-10') });
  // um funcionário cadastrado ANTES do dono não pode virar o contato da conta
  ins(db, 'tenant_users', { id: 'f-' + id, tenant_id: id, nome: 'Funcionário', email: `equipe-${id}@ex.com`, papel: 'usuario', ativo: 1, criado_em: D('2026-07-01') });
  if (plan) ins(db, 'subscriptions', { id: 'sub-' + id, tenant_id: id, plan_id: plan, status: status === 'trial' ? 'trial' : 'ativa', inicio: D('2026-07-15'), criado_em: D('2026-07-15') });
  faturas.forEach(([valor, st, quando], i) => ins(db, 'invoices', { id: `inv-${id}-${i}`, tenant_id: id, valor_centavos: valor, status: st, criado_em: quando, pago_em: st === 'paga' ? quando : '' }));
}
const planoSimples = (mod, id, nome, preco) => ins(require(`../${mod}/db`).db, 'plans', { id, slug: id + '-teste', nome, preco_centavos: preco, criado_em: D('2026-07-01') });
planoSimples('vsm', 'pl-pro', 'Pro', 19900);
contaSimples('vsm', { id: 'v1', nome: 'Pousada Sol', status: 'ativa', telefone: '(61) 98888-0000', plan: 'pl-pro', dono: ['Vera Sol', 'vera@pousada.com'], papel: 'admin',
  faturas: [[19900, 'paga', D('2026-08-01')], [19900, 'paga', D('2026-09-01')], [19900, 'aberta', D('2026-10-01')]] });
contaSimples('vsm', { id: 'v2', nome: 'Chalé Novo', status: 'trial', plan: 'pl-pro', trial: DAQUI_A(10), dono: ['Tito Novo', 'tito@chale.com'], papel: 'admin' });
contaSimples('vsm', { id: 'v3', nome: 'Smoke VSM', status: 'trial', plan: 'pl-pro', trial: D('2026-07-20'), dono: ['Smoke', 'smoke@vsm.local'], papel: 'admin' });
contaSimples('vsm', { id: 'v4', nome: 'Augusto Villela Teste', status: 'cortesia', plan: 'pl-pro', dono: ['Augusto', 'dono@grupo-interno.com'], papel: 'admin' });
contaSimples('vsm', { id: 'v5', nome: 'Hostel Antigo', status: 'cancelada', plan: 'pl-pro', dono: ['Zeca', 'zeca@hostel.com'], papel: 'admin', faturas: [[19900, 'paga', D('2026-03-01')]] });
planoSimples('crm', 'pl-start', 'Start', 9900);
contaSimples('crm', { id: 'r1', nome: 'Prado Consultoria', status: 'ativa', telefone: '6133330000', plan: 'pl-start', dono: ['Ana Prado', 'ana@ex.com'], papel: 'owner', faturas: [[9900, 'paga', D('2026-09-20')]] });
planoSimples('legal-saas', 'pl-adv', 'Escritório', 39900);
contaSimples('legal-saas', { id: 'j1', nome: 'Moura Advogados', status: 'ativa', plan: 'pl-adv', dono: ['Dra. Moura', 'moura@adv.com'], papel: 'admin' });   // ativa, sem fatura paga

// SaaS de identidade global: Docs e Projects ---------------------------------------
function contaGlobal(mod, { id, nome, status, telefone = '', plan, dono, pagamentos = [], extra = {} }) {
  const db = require(`../${mod}/db`).db;
  ins(db, 'tenants', { id, slug: id, nome, status, telefone, criado_em: D('2026-07-10'), ...extra });
  ins(db, 'users', { id: 'u-' + id, email: dono[1], nome: dono[0], criado_em: D('2026-07-10') });
  ins(db, 'tenant_users', { id: 'tu-' + id, tenant_id: id, user_id: 'u-' + id, papel: 'dono', status: 'ativo', criado_em: D('2026-07-10') });
  if (plan) ins(db, 'subscriptions', { id: 'sub-' + id, tenant_id: id, plan_id: plan, status: 'ativa', inicio: D('2026-07-12'), criado_em: D('2026-07-12') });
  pagamentos.forEach(([valor, st, quando], i) => ins(db, 'payments', { id: `pg-${id}-${i}`, tenant_id: id, mp_payment_id: `mp-${id}-${i}`, valor_centavos: valor, status: st, criado_em: quando }));
}
const planoGlobal = (mod, id, nome, preco) => ins(require(`../${mod}/db`).db, 'plans', { id, slug: id + '-teste', nome, preco_centavos: preco, criado_em: D('2026-07-01') });
planoGlobal('vdocs', 'pl-eq', 'Equipe', 29900);
contaGlobal('vdocs', { id: 'd1', nome: 'Cartório Central', status: 'ativa', telefone: '1140000000', plan: 'pl-eq', dono: ['Hugo Paz', 'hugo@docs.com'], pagamentos: [[29900, 'aprovado', D('2026-09-03')], [29900, 'rejeitado', D('2026-09-02')]] });
contaGlobal('vdocs', { id: 'd2', nome: 'Augusto Villela Teste', status: 'cortesia', plan: 'pl-eq', dono: ['Augusto', 'dono@grupo-interno.com'] });
planoGlobal('vpe', 'pl-ev', 'Eventos', 15000);
contaGlobal('vpe', { id: 'e1', nome: 'Festa & Cia', status: 'ativa', plan: 'pl-ev', dono: ['Lia Festa', 'lia@festa.com'], pagamentos: [[15000, 'aprovado', D('2026-09-05')]] });
// o workspace interno é `ativa` + interno=1 (o Projects não tem status cortesia) — e tem até pagamento de teste
contaGlobal('vpe', { id: 'e2', nome: 'Augusto Villela Ltda.', status: 'ativa', plan: 'pl-ev', dono: ['Augusto', 'outro-email-do-dono@ex.com'], pagamentos: [[15000, 'aprovado', D('2026-09-06')]], extra: { interno: 1 } });

// Finance (pelo repo: SQL solto em tabela de conta é proibido lá) -------------------------
const finRepo = require('../financeiro/repo'), finTen = require('../financeiro/tenancy');
const planoFin = finRepo.upsertPlano({ slug: 'essencial-teste', nome: 'Essencial', precoCents: 25000 });
const tFin = finRepo.criarTenant({ slug: 'prado-fin', nome: 'Prado Finanças', status: 'ativa', planoId: planoFin.id });
finTen.comTenant({ tenantId: tFin.id, userId: 'teste' }, () => {
  finRepo.criarUsuario({ email: 'ana@ex.com', nome: 'Ana Prado', perfil: 'proprietario' });
  finRepo.criarAssinatura({ planoId: planoFin.id, status: 'ativa', inicio: D('2026-09-08') });
  finRepo.criarInvoice({ competencia: '2026-09', valorCents: 25000, status: 'paga', pagoEm: D('2026-09-08') });
  finRepo.criarInvoice({ competencia: '2026-10', valorCents: 25000, status: 'aberta' });
});
const tFinInt = finRepo.criarTenant({ slug: 'villela-interno', nome: 'Villela Stay (interno)', status: 'ativa', planoId: planoFin.id, interno: true, contatoEmail: 'financeiro@villela.test', contatoNome: 'Financeiro' });
const tFinTrial = finRepo.criarTenant({ slug: 'novato-fin', nome: 'Novato Ltda', status: 'trial', planoId: planoFin.id, trialAte: DAQUI_A(5), contatoEmail: 'novato@ex.com', contatoNome: 'Novato' });
void tFinInt; void tFinTrial;

// Closet -------------------------------------------------------------------
const clo = require('../closet/db').db;
ins(clo, 'users', { id: 'cu1', nome: 'Marta Closet', email: 'marta@ex.com', telefone: '21977776666', criado_em: D('2026-08-01') });
ins(clo, 'plans', { id: 'cp1', slug: 'premium-teste', nome: 'Premium', preco_centavos: 3900, criado_em: D('2026-07-01') });
ins(clo, 'subscriptions', { id: 'cs1', user_id: 'cu1', plan_id: 'cp1', status: 'ativa', inicio: D('2026-09-11'), criado_em: D('2026-09-11') });
ins(clo, 'invoices', { id: 'ci1', user_id: 'cu1', valor_centavos: 3900, status: 'paga', criado_em: D('2026-09-11'), pago_em: D('2026-09-11') });

// Musique ------------------------------------------------------------------
const mus = require('../music/db').db;
const contaMus = (id, nome, email, criado = D('2026-08-01'), telefone = '') => ins(mus, 'contas_music', { id, nome, email, senha_hash: 'x', telefone, criado_em: criado, atualizado_em: criado });
const assMus = (id, conta_id, status, origem, preco, quando) => ins(mus, 'assinaturas_music', { id, conta_id, status, origem, preco_cents: preco, criado_em: quando, atualizado_em: quando });
contaMus('m1', 'Nara Violão', 'nara@ex.com', D('2026-08-01'), '31966665555'); assMus('ma1', 'm1', 'ativa', 'mp', 25000, D('2026-09-28'));
ins(mus, 'assinatura_pagamentos', { ref: 'mp-1', assinatura_id: 'ma1', valor_cents: 25000, pago_em: D('2026-09-28') });
contaMus('m2', 'Otto Convidado', 'otto@ex.com'); assMus('ma2', 'm2', 'cortesia', 'cortesia', 0, D('2026-09-29'));
contaMus('m3', 'Augusto Músico', 'augusto-musico@ex.com'); assMus('ma3', 'm3', 'cortesia', 'dono', 0, D('2026-09-28'));
contaMus('m4', 'Pedro Desistiu', 'pedro@ex.com', D('2026-06-01')); assMus('ma4', 'm4', 'pendente', 'mp', 25000, D('2026-09-30'));
contaMus('m5', 'Rita Recém', 'rita@ex.com', AGORA);

// Alta Vista ---------------------------------------------------------------
const av = require('../alta-vista/db').db;
ins(av, 'clientes', { id: 'ac1', nome: 'Imobiliária Lago', email: 'contato@lago.com', whatsapp: '61955554444', criado_em: D('2026-08-20') });
ins(av, 'projetos', { id: 'ap1', cliente_id: 'ac1', titulo: 'Tour 360 — Casa do Lago', total_centavos: 200000, status: 'in_production', criado_em: D('2026-09-01') });
ins(av, 'projetos', { id: 'ap2', cliente_id: 'ac1', titulo: 'Vídeo de drone', total_centavos: 90000, status: 'awaiting_payment', criado_em: D('2026-09-25') });
const parc = (id, projeto_id, valor, status, quando) => ins(av, 'parcelas', { id, projeto_id, cliente_id: 'ac1', rotulo: id, valor_centavos: valor, status, pago_em: status === 'aprovado' ? quando : '', criado_em: quando });
parc('pa1', 'ap1', 120000, 'aprovado', D('2026-09-02')); parc('pa2', 'ap1', 80000, 'pendente', D('2026-09-02')); parc('pa3', 'ap2', 90000, 'pendente', D('2026-09-25'));

// Origena: banco falso com o MESMO contrato do `origena/db` + `tenancy` (a
// consulta de verdade roda contra o PostgreSQL local no último teste). -------------------
const ORIGENA_FALSA = {
  familias: [{ id: '11111111-1111-4111-8111-111111111111', nome: 'Souza', status: 'ativa', created_at: new Date(D('2026-09-01')) },
    { id: '22222222-2222-4222-8222-222222222222', nome: 'Lima', status: 'ativa', created_at: new Date(D('2026-08-01')) }],
  porFamilia: {
    '11111111-1111-4111-8111-111111111111': {
      dono: { nome: 'Sônia Souza', email: 'sonia@ex.com' },
      assinatura: { id: 'os1', status: 'ativa', gateway: 'mercadopago', inicio: new Date(D('2026-09-07')), ciclo: 'mensal', preco_centavos: 4990, trial_ate: null, plano: 'Origena Família' },
      pedidos: [{ id: 'oo1', tipo: 'assinatura', descricao: 'Origena Família (mensal)', total_centavos: 4990, status: 'pago', pago_em: new Date(D('2026-09-07')), created_at: new Date(D('2026-09-07')) },
        { id: 'oo2', tipo: 'creditos', descricao: '100 créditos de IA', total_centavos: 1990, status: 'pago', pago_em: new Date(D('2026-09-09')), created_at: new Date(D('2026-09-09')) }],
    },
    '22222222-2222-4222-8222-222222222222': {
      dono: { nome: 'Leo Lima', email: 'leo@ex.com' },
      assinatura: { id: 'os2', status: 'ativa', gateway: 'manual', inicio: new Date(D('2026-08-01')), ciclo: 'mensal', preco_centavos: 0, trial_ate: null, plano: 'Origena Essencial' },
      pedidos: [],
    },
  },
};
const origenaFalsa = {
  db: { configurado: () => true, todas: async () => ORIGENA_FALSA.familias },
  tenancy: { comEscopo: async (id, fn) => { const d = ORIGENA_FALSA.porFamilia[id]; let n = 0; return fn({
    uma: async () => (n++ === 0 ? d.dono : d.assinatura), todas: async () => d.pedidos }); } },
};

// TABELA — receita esperada, somada à mão (centavos):
//   Livraria   22.970  (o1; o2 reembolsado, o3 teste, o5 de 1 centavo e o4 pendente ficam fora)
//   Academy    24.300  (ao1 14.500 + clube 2 × 4.900; ao2 reembolsado; ao4 gratuito)
//   VSM        59.700  (v1 2 × 19.900 + v5 cancelada que pagou 19.900 em março)
//   CRM         9.900   ·  Legal 0 (ativa sem fatura paga)
//   Docs       29.900  (o rejeitado não conta)  ·  Projects 15.000 (o interno NÃO conta)
//   Finance    25.000   ·  Closet 3.900  ·  Musique 25.000  ·  Alta Vista 120.000
//   Origena     6.980  (4.990 + 1.990)
const ESPERADO = { livraria: 22970, academy: 24300, vsm: 59700, crm: 9900, vdocs: 29900, vpe: 15000, finance: 25000, closet: 3900, music: 25000, 'alta-vista': 120000, origena: 6980 };
const TOTAL = 342650;
const SETEMBRO = 297950;   // TOTAL menos o que foi pago fora de 09/2026: VSM em 08 (19.900) e em 03 (19.900) e o clube em 08 (4.900)

// ---- app ----
const clientes = require('./index');
const { motor } = clientes;
const logs = [];
const app = express();
app.use(cookieParser());
clientes.montar(app, { requireAuth, requireAdmin, registrarAuditoria, emailsInternos: () => ['adm@villela.test'], origena: origenaFalsa });
motor.configurar({ log: (m) => logs.push(m) });

let base;
async function req(url, { cookie, chave } = {}) {
  const h = {};
  if (cookie) h.cookie = 'staff_token=' + cookie;
  if (chave) h['x-publish-key'] = process.env.PUBLISH_KEY;
  const r = await fetch(base + url, { headers: h });
  // Pelos BYTES: o `r.text()` do fetch engole o BOM, e o BOM é justamente o que o teste do CSV confere.
  const texto = Buffer.from(await r.arrayBuffer()).toString('utf8');
  let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { status: r.status, json, texto, headers: r.headers };
}
const tudo = async (q = '') => (await req('/staff/api/clientes?por_pagina=200' + q, { cookie: 'adm' })).json;
const de = (r, sistema) => r.clientes.filter((l) => l.sistema === sistema);
const um = (r, sistema, origemId) => { const l = r.clientes.find((x) => x.sistema === sistema && x.origem_id === origemId); assert.ok(l, `faltou ${sistema}/${origemId}`); return l; };

let ok = 0, pulados = 0; const falhas = [];
async function t(nome, fn, { pularSe } = {}) {
  try { await fn(); ok++; console.log('  ok  ' + nome); }
  catch (e) {
    // Banco de teste desligado não é defeito do código — mas também não é verde: sai como PULADO, em voz alta.
    if (pularSe && pularSe(e)) {
      pulados++;
      console.log(' PULADO ' + nome + '\n        o PostgreSQL local de teste não respondeu — o SQL da Origena NÃO foi exercitado nesta rodada');
      return;
    }
    falhas.push({ nome, erro: e.message }); console.log(' FALHA ' + nome + '\n        ' + e.message);
  }
}

(async () => {
  const srv = app.listen(0); base = 'http://127.0.0.1:' + srv.address().port;
  const BANCOS = ['academy', 'livraria', 'vsm', 'crm', 'legal-saas', 'vdocs', 'vpe', 'financeiro', 'closet', 'music', 'alta-vista'];
  const mudancas = () => BANCOS.map((m) => require(`../${m}/db`).db.prepare('SELECT total_changes() n').get().n).join(',');
  const antes = mudancas();

  await t('catálogo: todo sistema da central de comunicados está classificado (leitor ou motivo)', async () => {
    const cat = motor.catalogo();
    const soltos = cat.filter((f) => f.sem_classificacao).map((f) => f.chave);
    assert.deepEqual(soltos, [], 'sistema novo em comunicados/fontes.js sem leitor nem motivo em clientes/motor.js');
    for (const f of require('../comunicados/fontes').todas()) assert.ok(cat.find((c) => c.chave === f.chave), `${f.chave} sumiu do catálogo`);
    for (const f of cat) assert.ok(f.ler || (f.estado && f.motivo && f.motivo.length > 20), `${f.chave}: fora da lista sem motivo escrito`);
    for (const k of Object.keys(motor._int.LEITORES).concat(Object.keys(motor._int.FORA))) {
      assert.ok(require('../comunicados/fontes').obter(k), `clientes classifica "${k}", que não existe mais na central`);
    }
  });

  await t('autorização: sem sessão 401 · membro 403 · PUBLISH_KEY só 403 · admin 200 — lista e CSV', async () => {
    for (const rota of ['/staff/api/clientes', '/staff/api/clientes.csv']) {
      assert.equal((await req(rota)).status, 401, rota + ' sem sessão');
      assert.equal((await req(rota, { cookie: 'op' })).status, 403, rota + ' membro');
      const soChave = await req(rota, { chave: true });
      assert.equal(soChave.status, 403, rota + ' só com a chave');
      assert.ok(!/@/.test(soChave.texto), 'a recusa não pode carregar e-mail de ninguém');
      assert.equal((await req(rota, { cookie: 'invalido', chave: true })).status, 401, rota + ' chave + cookie inválido');
      const adm = await req(rota, { cookie: 'adm' });
      assert.equal(adm.status, 200, rota + ' admin');
      assert.match(adm.headers.get('cache-control'), /no-store/, rota + ' sem cache');
    }
  });

  await t('fontes: as lidas, as não integradas e as que não se aplicam aparecem — com motivo', async () => {
    const r = await tudo();
    const e = Object.fromEntries(r.fontes.map((f) => [f.chave, f]));
    for (const k of Object.keys(ESPERADO)) assert.equal(e[k].estado, 'ok', `${k}: ${e[k].motivo}`);
    assert.equal(e.cozinhe.estado, 'nao_integrada'); assert.equal(e['viver-de-chacara'].estado, 'nao_integrada');
    for (const k of ['vitrine', 'kids', 'hospede']) assert.equal(e[k].estado, 'nao_se_aplica');
    for (const f of r.fontes.filter((x) => x.estado !== 'ok')) assert.ok(f.motivo.length > 20, `${f.chave} sem motivo`);
    assert.deepEqual(r.totais.fontes_nao_integradas.sort(), ['Cozinhe', 'Viver de Chácara']);
  });

  await t('Livraria: pedido pago com itens e exemplares; reembolso, teste e Pix de centavo marcados; pendente fora', async () => {
    const r = await tudo('&sistema=livraria');
    assert.equal(r.clientes.length, 4, 'o pendente (carrinho abandonado) não entra');
    const o1 = um(r, 'livraria', 'o1');
    assert.deepEqual([o1.tipo, o1.nome, o1.email, o1.telefone], ['comprador', 'Ana Prado', 'ana@ex.com', '(61) 99999-0001']);
    assert.equal(o1.item, 'Claude AI na Prática (pdf); O Homem Essencial (impresso) ×2');
    assert.deepEqual([o1.valor_pago_centavos, o1.quantidade, o1.status, o1.natureza, o1.conta_na_receita], [22970, 3, 'paga', 'pago', true]);
    assert.equal(o1.data.slice(0, 10), '2026-09-10');
    const o2 = um(r, 'livraria', 'o2');
    assert.deepEqual([o2.status, o2.natureza, o2.reembolsado_centavos, o2.conta_na_receita], ['reembolsada', 'reembolsado', 4990, false]);
    const o3 = um(r, 'livraria', 'o3');
    assert.deepEqual([o3.natureza, o3.interna, o3.conta_na_receita], ['compra_teste', true, false], 'teste=1 e e-mail .local');
    const o5 = um(r, 'livraria', 'o5');
    assert.deepEqual([o5.natureza, o5.valor_pago_centavos, o5.conta_na_receita], ['compra_teste', 1, false], 'Pix de centavo não é venda');
    assert.equal(r.totais.destaques.livros_vendidos, 3); assert.equal(r.totais.destaques.pedidos_de_livro, 1);
  });

  await t('Academy: aluno pagante, reembolsado, cortesia, gratuito e assinante de clube com o total das cobranças', async () => {
    const r = await tudo('&sistema=academy');
    assert.equal(r.clientes.length, 5, 'assinatura pendente não entra');
    const e1 = um(r, 'academy', 'e1');
    assert.deepEqual([e1.tipo, e1.item, e1.valor_pago_centavos, e1.status, e1.natureza, e1.telefone], ['aluno', 'Claude AI na Prática', 14500, 'ativa', 'pago', '61999990001']);
    const e2 = um(r, 'academy', 'e2');
    assert.deepEqual([e2.status, e2.natureza, e2.reembolsado_centavos, e2.conta_na_receita], ['reembolsada', 'reembolsado', 14500, false]);
    const e3 = um(r, 'academy', 'e3');
    assert.deepEqual([e3.status, e3.natureza, e3.valor_pago_centavos], ['cortesia', 'cortesia', null], 'cortesia NÃO ganha o preço de tabela do curso');
    const e4 = um(r, 'academy', 'e4');
    assert.deepEqual([e4.natureza, e4.valor_pago_centavos, e4.conta_na_receita], ['gratuito', 0, false]);
    const s1 = um(r, 'academy', 'assinatura:s1');
    assert.deepEqual([s1.tipo, s1.item, s1.mensalidade_centavos, s1.valor_pago_centavos, s1.pagamentos_n, s1.natureza], ['assinante', 'Clube Villela', 4900, 9800, 2, 'pago']);
    assert.equal(s1.ultimo_pagamento_em.slice(0, 10), '2026-09-15');
    assert.equal(r.totais.destaques.alunos, 3, 'Ana, Elisa (cortesia) e Fábio (gratuito); o reembolsado saiu');
    assert.equal(r.totais.destaques.alunos_pagantes, 1);
  });

  await t('SaaS de conta (VSM/CRM/Legal): dono é o contato, telefone é o da empresa, faturas pagas somam, cortesia e teste ficam fora', async () => {
    const r = await tudo();
    const v1 = um(r, 'vsm', 'v1');
    assert.deepEqual([v1.tipo, v1.nome, v1.email, v1.telefone, v1.conta, v1.item], ['assinante', 'Vera Sol', 'vera@pousada.com', '(61) 98888-0000', 'Pousada Sol', 'Plano Pro']);
    assert.deepEqual([v1.status, v1.natureza, v1.valor_pago_centavos, v1.pagamentos_n, v1.mensalidade_centavos], ['ativa', 'pago', 39800, 2, 19900], 'a fatura aberta não é pagamento');
    assert.equal(v1.data.slice(0, 10), '2026-07-15', 'data = início da assinatura');
    assert.deepEqual([um(r, 'vsm', 'v2').status, um(r, 'vsm', 'v2').natureza, um(r, 'vsm', 'v2').valor_pago_centavos, um(r, 'vsm', 'v2').mensalidade_centavos], ['em_teste', 'em_teste', null, null]);
    assert.equal(um(r, 'vsm', 'v3').status, 'teste_vencido');
    assert.equal(um(r, 'vsm', 'v3').interna, true, 'tenant de fumaça com e-mail .local é conta de demonstração');
    const v4 = um(r, 'vsm', 'v4');
    assert.deepEqual([v4.status, v4.natureza, v4.interna, v4.conta_na_receita, v4.valor_pago_centavos], ['cortesia', 'cortesia', true, false, null]);
    const v5 = um(r, 'vsm', 'v5');
    assert.deepEqual([v5.status, v5.natureza, v5.valor_pago_centavos], ['cancelada', 'pago', 19900], 'cancelou, mas o que pagou continua pago');
    assert.deepEqual([um(r, 'crm', 'r1').email, um(r, 'crm', 'r1').valor_pago_centavos], ['ana@ex.com', 9900], 'no CRM o dono é papel owner');
    const j1 = um(r, 'legal-saas', 'j1');
    assert.deepEqual([j1.status, j1.natureza, j1.valor_pago_centavos, j1.conta_na_receita], ['ativa', 'sem_pagamento', null, false], 'ativa sem fatura paga: valor NULO, não o preço do plano');
    assert.match(j1.obs, /sem registro de pagamento/);
  });

  await t('Docs e Projects: plano vem de subscriptions; só pagamento aprovado; interno=1 é cortesia e não soma', async () => {
    const r = await tudo();
    const d1 = um(r, 'vdocs', 'd1');
    assert.deepEqual([d1.nome, d1.email, d1.telefone, d1.item, d1.valor_pago_centavos, d1.pagamentos_n], ['Hugo Paz', 'hugo@docs.com', '1140000000', 'Plano Equipe', 29900, 1]);
    assert.deepEqual([um(r, 'vdocs', 'd2').status, um(r, 'vdocs', 'd2').interna], ['cortesia', true]);
    assert.equal(um(r, 'vpe', 'e1').valor_pago_centavos, 15000);
    const e2 = um(r, 'vpe', 'e2');
    assert.deepEqual([e2.status, e2.natureza, e2.interna, e2.conta_na_receita], ['cortesia', 'cortesia', true, false], 'o Projects marca por COLUNA, não por status');
    assert.equal(e2.valor_pago_centavos, 15000, 'o pagamento existe e é mostrado — só não entra na receita');
  });

  await t('Finance, Closet, Musique e Alta Vista: cada um com o que tem (e sem inventar o que não tem)', async () => {
    const r = await tudo();
    const f = de(r, 'finance');
    const paga = f.find((l) => l.conta === 'Prado Finanças');
    assert.deepEqual([paga.email, paga.telefone, paga.item, paga.valor_pago_centavos, paga.natureza], ['ana@ex.com', '', 'Plano Essencial', 25000, 'pago'],
      'o Finance não guarda telefone: fica vazio, mesmo a Ana tendo telefone na Academy e na Livraria');
    const interno = f.find((l) => l.conta === 'Villela Stay (interno)');
    assert.deepEqual([interno.status, interno.interna, interno.email], ['cortesia', true, 'financeiro@villela.test']);
    assert.equal(f.find((l) => l.conta === 'Novato Ltda').status, 'em_teste');
    const c = um(r, 'closet', 'cs1');
    assert.deepEqual([c.item, c.valor_pago_centavos, c.mensalidade_centavos, c.telefone], ['Plano Premium', 3900, 3900, '21977776666']);
    const m = de(r, 'music');
    assert.equal(m.length, 4, 'a pendente do Pedro não entra como assinatura, e o teste grátis dele (conta de junho) já venceu');
    const nara = um(r, 'music', 'ma1');
    assert.deepEqual([nara.status, nara.natureza, nara.valor_pago_centavos, nara.mensalidade_centavos], ['ativa', 'pago', 25000, 25000]);
    assert.deepEqual([um(r, 'music', 'ma2').natureza, um(r, 'music', 'ma2').interna], ['cortesia', false]);
    assert.deepEqual([um(r, 'music', 'ma3').natureza, um(r, 'music', 'ma3').interna], ['cortesia', true], 'origem "dono" é a conta do Augusto');
    assert.deepEqual([um(r, 'music', 'conta:m5').status, um(r, 'music', 'conta:m5').valor_pago_centavos], ['em_teste', null]);
    const a = de(r, 'alta-vista');
    assert.equal(a.length, 1, 'projeto que só aguarda o 1º pagamento não é cliente pagante ainda');
    assert.deepEqual([a[0].tipo, a[0].item, a[0].valor_pago_centavos, a[0].status, a[0].telefone], ['comprador', 'Tour 360 — Casa do Lago', 120000, 'em_andamento', '61955554444']);
  });

  await t('Origena: assinatura paga, compra de créditos e plano gratuito — sem telefone', async () => {
    const r = await tudo('&sistema=origena');
    assert.equal(r.clientes.length, 3);
    const s = um(r, 'origena', 'assinatura:os1');
    assert.deepEqual([s.nome, s.email, s.conta, s.item, s.valor_pago_centavos, s.mensalidade_centavos, s.telefone], ['Sônia Souza', 'sonia@ex.com', 'Família Souza', 'Origena Família (mensal)', 4990, 4990, '']);
    assert.deepEqual([um(r, 'origena', 'pedido:oo2').tipo, um(r, 'origena', 'pedido:oo2').valor_pago_centavos], ['comprador', 1990]);
    assert.deepEqual([um(r, 'origena', 'assinatura:os2').natureza, um(r, 'origena', 'assinatura:os2').conta_na_receita], ['gratuito', false]);
  });

  await t('receita: fecha com a soma feita à mão, por sistema e no total; cortesia, teste, interna e reembolso contados à parte', async () => {
    const r = await tudo();
    for (const [k, v] of Object.entries(ESPERADO)) assert.equal(r.totais.por_sistema[k].receita_centavos, v, `receita de ${k}`);
    assert.equal(r.totais.por_sistema['legal-saas'].receita_centavos, 0);
    assert.equal(r.totais.receita.pago_centavos, TOTAL);
    assert.equal(Object.values(ESPERADO).reduce((a, b) => a + b, 0), TOTAL, 'a própria tabela do teste tem de fechar');
    const fora = r.totais.receita.fora_da_receita;
    assert.deepEqual([fora.reembolsado.linhas, fora.reembolsado.centavos], [2, 4990 + 14500]);
    assert.deepEqual([fora.compra_teste.linhas, fora.compra_teste.centavos], [2, 4990 + 1]);
    assert.ok(fora.cortesia >= 6 && fora.em_teste >= 4 && fora.internas.linhas >= 6);
    assert.equal(fora.internas.centavos, 4990 + 15000, 'o que conta interna pagou (teste da Livraria + Projects interno) fica visível, fora da receita');
    assert.equal(r.totais.destaques.assinantes_ativos, 9, 'clube, Pousada, Prado CRM, Cartório, Festa, Prado Finanças, Marta, Nara e Souza');
    assert.equal(r.totais.destaques.assinantes_ativos_sem_pagamento, 1, 'Moura Advogados');
  });

  await t('período: a lista filtra pela data do vínculo; a receita, pela data de cada PAGAMENTO', async () => {
    const r = await tudo('&de=2026-09-01&ate=2026-09-30');
    assert.equal(r.totais.receita.pago_centavos, SETEMBRO);
    assert.ok(!r.clientes.find((l) => l.origem_id === 'v1'), 'a Pousada assinou em julho: não é linha de setembro…');
    assert.equal(r.totais.receita.por_sistema.vsm, 19900, '…mas a fatura que ela pagou em setembro é receita de setembro');
    assert.ok(r.clientes.every((l) => l.data.slice(0, 10) >= '2026-09-01' && l.data.slice(0, 10) <= '2026-09-30'));
    assert.equal((await tudo('&de=2030-01-01')).totais.receita.pago_centavos, 0);
    assert.equal((await tudo('&de=ontem')).filtros.de, '', 'data malformada é ignorada, não vira filtro maluco');
  });

  await t('filtros, busca e paginação', async () => {
    assert.ok((await tudo('&tipo=comprador')).clientes.every((l) => l.tipo === 'comprador'));
    assert.ok((await tudo('&natureza=cortesia')).clientes.every((l) => l.natureza === 'cortesia'));
    assert.ok((await tudo('&status=em_teste')).clientes.every((l) => l.status === 'em_teste'));
    assert.ok((await tudo('&internas=0')).clientes.every((l) => !l.interna));
    assert.equal((await tudo('&internas=0')).totais.receita.pago_centavos, TOTAL, 'esconder internas não muda a receita: elas já não somavam');
    const busca = await tudo('&q=PRADO');
    assert.deepEqual([...new Set(busca.clientes.map((l) => l.sistema))].sort(), ['academy', 'crm', 'finance', 'livraria']);
    assert.equal((await tudo('&q=homem essencial')).clientes.length, 1, 'busca também pelo item');
    const p1 = (await req('/staff/api/clientes?por_pagina=5&pagina=1', { cookie: 'adm' })).json;
    const p2 = (await req('/staff/api/clientes?por_pagina=5&pagina=2', { cookie: 'adm' })).json;
    assert.equal(p1.clientes.length, 5); assert.ok(p1.paginacao.paginas > 1);
    assert.ok(!p1.clientes.some((a) => p2.clientes.some((b) => a.sistema === b.sistema && a.origem_id === b.origem_id)), 'páginas não repetem linha');
    const datas = (await tudo()).clientes.map((l) => l.data);
    assert.deepEqual(datas, datas.slice().sort().reverse(), 'mais recente primeiro');
    assert.equal(p1.totais.linhas, (await tudo()).totais.linhas, 'os totais são do filtro inteiro, não da página');
  });

  await t('agrupar por pessoa: a Ana aparece UMA vez, com os quatro sistemas e o que pagou em cada', async () => {
    const r = (await req('/staff/api/clientes?agrupar=email&por_pagina=200', { cookie: 'adm' })).json;
    const ana = r.grupos.filter((g) => g.email === 'ana@ex.com');
    assert.equal(ana.length, 1, 'e-mail com maiúscula na Livraria é a mesma pessoa');
    assert.equal(ana[0].vinculos, 4);
    assert.deepEqual(ana[0].sistemas.slice().sort(), ['Livraria Villela', 'Villela Academy', 'Villela CRM', 'Villela Finance']);
    assert.equal(ana[0].total_pago_centavos, 22970 + 14500 + 9900 + 25000);
    assert.deepEqual(ana[0].telefones.slice().sort(), ['(61) 99999-0001', '6133330000', '61999990001'], 'telefones como cada sistema guarda — sem fundir nem completar');
    assert.equal(r.paginacao.total, r.totais.pessoas);
  });

  await t('CSV: mesmos filtros, BOM, ponto e vírgula, fórmula neutralizada e auditoria sem dado pessoal', async () => {
    auditoria.length = 0;
    const r = await req('/staff/api/clientes.csv?sistema=livraria', { cookie: 'adm' });
    assert.match(r.headers.get('content-type'), /text\/csv/);
    assert.match(r.headers.get('content-disposition'), /attachment; filename="clientes-/);
    assert.match(r.headers.get('cache-control'), /no-store/);
    const linhas = r.texto.replace(/^﻿/, '').trim().split('\r\n');
    assert.ok(r.texto.charCodeAt(0) === 0xFEFF, 'BOM para o Excel');
    assert.equal(linhas.length, 1 + 4);
    assert.match(linhas[0], /^Sistema;Tipo;Nome;E-mail;Telefone;/);
    assert.ok(linhas.some((l) => l.includes('Ana Prado;ana@ex.com;(61) 99999-0001') && l.includes(';229,70;')));
    assert.ok(r.texto.includes(`"'=HYPERLINK(""http://x"") (pdf)"`), 'célula que começa com = sai como texto');
    assert.equal(auditoria.length, 1);
    assert.equal(auditoria[0].acao, 'clientes.exportar');
    assert.ok(!/@|Prado|9999/.test(auditoria[0].detalhe), 'auditoria guarda a contagem, não quem são os clientes');
  });

  await t('resiliência: fonte que quebra vira "indisponível", não derruba a página nem vaza dado no log', async () => {
    const L = motor._int.LEITORES, original = L.academy;
    L.academy = () => { throw new Error('SQLITE_ERROR: no such column: u.telefone'); };
    logs.length = 0;
    try {
      const r = await tudo();
      const ac = r.fontes.find((f) => f.chave === 'academy');
      assert.equal(ac.estado, 'indisponivel');
      assert.deepEqual(r.totais.fontes_indisponiveis, ['Villela Academy']);
      assert.equal(de(r, 'academy').length, 0);
      assert.equal(r.totais.receita.pago_centavos, TOTAL - ESPERADO.academy, 'as outras fontes continuam somando');
      assert.equal(logs.length, 1);
      assert.ok(!/@ex\.com|Prado|99999/.test(logs.join('')), 'log sem dado pessoal');
    } finally { L.academy = original; }
    assert.equal((await tudo()).fontes.find((f) => f.chave === 'academy').estado, 'ok');
  });

  await t('Origena sem banco configurado aparece como NÃO INTEGRADA, com o motivo', async () => {
    motor.configurar({ origena: { db: { configurado: () => false }, tenancy: {} } });
    try {
      const o = (await tudo()).fontes.find((f) => f.chave === 'origena');
      assert.equal(o.estado, 'nao_integrada'); assert.match(o.motivo, /ORIGENA_DATABASE_URL/);
    } finally { motor.configurar({ origena: origenaFalsa }); }
  });

  await t('somente leitura: depois de tudo isso, nenhum banco de produto recebeu uma escrita', async () => {
    assert.equal(mudancas(), antes);
  });

  // A consulta de VERDADE da Origena: o banco falso acima prova a normalização,
  // não o SQL. Aqui o SQL roda contra o PostgreSQL local, com RLS de pé.
  if (!PG_TESTE) {
    pulados++;
    console.log(' PULADO Origena contra o PostgreSQL real — sem ORIGENA_TEST_DATABASE_URL (o SQL da Origena NÃO foi exercitado nesta rodada)');
  } else {
    await t('Origena: a consulta roda no PostgreSQL REAL (schema descartável, RLS por família)', async () => {
      const odb = require('../origena/db'), ten = require('../origena/tenancy'), L = require('./leitores');
      await odb.migrar({ silencioso: true });
      try {
        const u = await odb.uma(`INSERT INTO users (nome, email, senha_hash) VALUES ('Sônia Souza', 'sonia@ex.com', 'x') RETURNING id`);
        const fam = async (nome) => {
          const f = await odb.uma('INSERT INTO families (nome, slug, created_by) VALUES ($1, $2, $3) RETURNING id', [nome, nome.toLowerCase(), u.id]);
          await odb.q(`INSERT INTO family_memberships (family_id, user_id, papel) VALUES ($1, $2, 'OWNER')`, [f.id, u.id]);
          return f.id;
        };
        const souza = await fam('Souza'), lima = await fam('Lima');
        await ten.comEscopo(souza, async (tx) => {
          const plano = await tx.uma(`SELECT id FROM plans WHERE codigo = 'familia'`);
          await tx.q(`INSERT INTO subscriptions (family_id, plan_id, status, gateway, ciclo, preco_centavos) VALUES ($1, $2, 'ativa', 'mercadopago', 'mensal', 4990)`, [souza, plano.id]);
          await tx.q(`INSERT INTO orders (family_id, codigo, tipo, plan_id, descricao, total_centavos, status, gateway, pago_em)
            VALUES ($1, 'T-1', 'assinatura', $2, 'Origena Família (mensal)', 4990, 'pago', 'mercadopago', now())`, [souza, plano.id]);
          await tx.q(`INSERT INTO orders (family_id, codigo, tipo, descricao, total_centavos, creditos, status) VALUES ($1, 'T-2', 'creditos', '100 créditos', 1990, 100, 'aguardando_pagamento')`, [souza]);
        });
        const bruto = await L._int.consultarOrigena({ db: odb, tenancy: ten });
        assert.equal(bruto.familias.length, 2);
        const linhas = L._int.normalizarOrigena(bruto);
        const s = linhas.find((l) => l.conta === 'Família Souza');
        assert.deepEqual([s.email, s.item, s.natureza, s.pagamentos.length, s.pagamentos[0].centavos], ['sonia@ex.com', 'Origena Família (mensal)', 'pago', 1, 4990]);
        assert.equal(linhas.filter((l) => l.conta === 'Família Souza').length, 1, 'pedido aguardando pagamento não vira linha');
        assert.equal(linhas.filter((l) => l.conta === 'Família Lima').length, 0, 'família sem assinatura nem pedido não é cliente');
        void lima;
      } finally { try { await odb.derrubarSchema(); } catch (_) { /* banco fora do ar: nada a derrubar */ } try { await odb.fechar(); } catch (_) {} }
    }, { pularSe: (e) => /ECONNREFUSED/.test(`${e && e.message} ${e && e.code}`) || (e && e.errors || []).some((x) => x.code === 'ECONNREFUSED') });
  }

  srv.close();
  console.log(`\n${ok} ok, ${falhas.length} falha(s)${pulados ? `, ${pulados} PULADO(S)` : ''}`);
  try { fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  process.exit(falhas.length ? 1 : 0);
})();
