// =====================================================================
// Villela Growth OS — suíte das Etapas 1 a 3.  npm run test:growth
//
// Banco descartável, worker desligado, Express real para as rotas de
// administração. O bloco mais importante é o ANTI-VAZAMENTO: ele tenta
// ler, escrever e listar dados de outra conta por três caminhos (SQL
// cru, repositório e sem contexto) e exige que os três falhem.
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'growth-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.CRM_ROTINAS = 'off';
process.env.GROWTH_WORKER = 'off';
process.env.GROWTH_FILA_BACKOFF_MS = '10';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

const CHAVE_COFRE = require('crypto').randomBytes(32).toString('hex');

let ok = 0;
const falhas = [];
function teste(nome, fn) {
  try { fn(); ok++; }
  catch (e) { falhas.push(`${nome}: ${e && e.message ? e.message : e}`); }
}
function lanca(nome, fn, padrao) {
  try {
    fn();
    falhas.push(`${nome}: era para lançar erro e NÃO lançou`);
  } catch (e) {
    if (padrao && !padrao.test(String(e.message))) falhas.push(`${nome}: lançou "${e.message}", esperava ${padrao}`);
    else ok++;
  }
}

// ------------------------------------------------------------- ambiente
const growth = require('./index');
const { tenancy, repo, rbac, contas, sessao, entitlements, eventos, fila, aprovacoes, incidentes, segredos, conectores,
  identidade, captura, segmentos, lgpd, conversas, canais } = growth;
const { db, novoId, nowISO, j, TABELAS_TENANT } = require('./db');

require('../crm/repo').semear();                 // planos e flags do control plane
growth.semear();
sessao.configurar({ jwtSecret: 'segredo-de-teste' });

// duas contas cliente para o teste de vazamento
function criarTenant(slug, nome, planoSlug = 'starter') {
  const id = novoId();
  const plano = db.prepare('SELECT id FROM plans WHERE slug = ?').get(planoSlug);
  db.prepare('INSERT INTO tenants (id, slug, nome, status, plan_id, criado_em) VALUES (?,?,?,?,?,?)')
    .run(id, slug, nome, 'ativa', plano ? plano.id : '', nowISO());
  return id;
}
const TA = criarTenant('conta-a', 'Conta A');
const TB = criarTenant('conta-b', 'Conta B');

const comoA = (fn) => tenancy.comTenant({ tenantId: TA, userId: 'u-a' }, fn);
const comoB = (fn) => tenancy.comTenant({ tenantId: TB, userId: 'u-b' }, fn);
const comoPlat = (fn) => tenancy.comoPlataforma({ userId: 'plat', motivo: 'selftest' }, fn);

// =====================================================================
// 1. SEMEADURA
// =====================================================================
teste('semeadura: organização plataforma existe', () => {
  const p = contas.plataforma();
  assert.ok(p && p.tipo === 'plataforma', 'plataforma não semeada');
});
teste('semeadura: 19 perfis de sistema', () => {
  const n = db.prepare("SELECT COUNT(*) AS n FROM gx_roles WHERE tenant_id = '' AND sistema = 1").get().n;
  assert.strictEqual(n, 19, `esperava 19 perfis, veio ${n}`);
});
teste('semeadura: é idempotente', () => {
  growth.semear(); growth.semear();
  const n = db.prepare("SELECT COUNT(*) AS n FROM gx_roles WHERE tenant_id = ''").get().n;
  assert.strictEqual(n, 19, `semear duplicou perfis: ${n}`);
});
teste('semeadura: catálogo de conectores no banco', () => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM gx_integracoes').get().n;
  assert.strictEqual(n, conectores.CONECTORES.length);
});

// =====================================================================
// 2. ANTI-VAZAMENTO  — o bloco que justifica a arquitetura
// =====================================================================
let equipeA = null;
teste('isolamento: conta A cria uma equipe', () => {
  equipeA = comoA(() => contas.criarEquipe({ nome: 'Comercial A' }));
  assert.ok(equipeA, 'não criou equipe');
});

lanca('isolamento: repositório SEM contexto recusa', () => repo.contar('gx_equipes'), /sem tenant no contexto/i);

teste('isolamento: conta B não vê a equipe da conta A', () => {
  comoB(() => {
    assert.strictEqual(repo.contar('gx_equipes'), 0, 'B enxergou equipe de A');
    assert.strictEqual(repo.buscar('gx_equipes', equipeA), null, 'B leu equipe de A por id');
    assert.strictEqual(repo.listar('gx_equipes').length, 0, 'B listou equipe de A');
  });
});

teste('isolamento: conta B não altera nem apaga linha da conta A', () => {
  comoB(() => {
    assert.strictEqual(repo.atualizar('gx_equipes', equipeA, { nome: 'invadida' }), 0, 'B alterou linha de A');
    assert.strictEqual(repo.remover('gx_equipes', equipeA), 0, 'B removeu linha de A');
  });
  comoA(() => {
    const e = repo.buscar('gx_equipes', equipeA);
    assert.strictEqual(e.nome, 'Comercial A', 'a linha de A foi alterada por B');
    assert.strictEqual(e.excluido_em, '', 'a linha de A foi excluída por B');
  });
});

lanca('isolamento: SQL sem filtro de tenant é recusado',
  () => comoB(() => repo.q('SELECT * FROM gx_equipes')), /sem filtro de tenant/i);

lanca('isolamento: parâmetro posicional é recusado',
  () => comoB(() => repo.q('SELECT * FROM gx_equipes WHERE tenant_id = ?', [TA])), /posicional/i);

lanca('isolamento: tenant do parâmetro diferente do contexto é recusado',
  () => comoB(() => repo.q('SELECT * FROM gx_equipes WHERE tenant_id = :tenant', { tenant: TA })), /difere do contexto/i);

teste('isolamento: o tenant do contexto vence o do payload na escrita', () => {
  const id = comoB(() => repo.inserir('gx_equipes', { nome: 'tentativa', tenant_id: TA }));
  const linha = db.prepare('SELECT tenant_id FROM gx_equipes WHERE id = ?').get(id);
  assert.strictEqual(linha.tenant_id, TB, 'o tenant_id do payload foi obedecido');
});

lanca('isolamento: escopo de plataforma exige comoPlataforma()',
  () => comoB(() => repo.qPlataforma('SELECT * FROM gx_equipes')), /comoPlataforma/i);

teste('isolamento: comoPlataforma() lê atravessando contas e deixa auditoria', () => {
  const antes = db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE acao = 'plataforma.consulta'").get().n;
  const linhas = comoPlat(() => repo.qPlataforma('SELECT * FROM gx_equipes', {}, { motivo: 'auditoria de teste' }));
  assert.ok(linhas.length >= 2, 'plataforma não enxergou as duas contas');
  const depois = db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE acao = 'plataforma.consulta'").get().n;
  assert.strictEqual(depois, antes + 1, 'leitura cruzada não gerou auditoria');
});

lanca('isolamento: comoPlataforma() exige motivo',
  () => tenancy.comoPlataforma({ userId: 'x' }, () => {}), /motivo/i);

// --- varredura automática: TODA tabela gx_* com tenant_id ------------
teste('isolamento: varredura de todas as tabelas com tenant_id', () => {
  const alvo = [...TABELAS_TENANT].filter(t => t.startsWith('gx_')).sort();
  assert.ok(alvo.length >= 8, `varredura encontrou poucas tabelas (${alvo.length})`);

  const sistemaRoles = db.prepare("SELECT COUNT(*) AS n FROM gx_roles WHERE tenant_id = ''").get().n;
  const problemas = [];

  db.exec('PRAGMA foreign_keys = OFF;');          // só para semear linhas sintéticas
  try {
    for (const tabela of alvo) {
      const cols = db.prepare(`PRAGMA table_info(${tabela})`).all();
      const dados = {};
      for (const c of cols) {
        if (c.name === 'tenant_id') { dados[c.name] = TA; continue; }
        if (c.pk && /INT/i.test(c.type)) continue;
        if (c.pk) { dados[c.name] = novoId(); continue; }
        if (!c.notnull || c.dflt_value !== null) continue;
        dados[c.name] = /INT/i.test(c.type) ? 0 : 'x';
      }
      if (dados.tenant_id === undefined) continue;
      const nomes = Object.keys(dados);
      try {
        db.prepare(`INSERT INTO ${tabela} (${nomes.join(', ')}) VALUES (${nomes.map(n => ':' + n).join(', ')})`).run(dados);
      } catch (e) { problemas.push(`${tabela}: não deu para semear (${e.message})`); continue; }

      const visto = comoB(() => repo.contar(tabela));
      const esperado = tabela === 'gx_roles' ? sistemaRoles : 0;   // perfis de sistema são visíveis a todos
      const soDeB = tabela === 'gx_equipes' ? 1 : 0;               // B criou uma equipe acima
      if (visto !== esperado + soDeB) {
        problemas.push(`${tabela}: conta B enxergou ${visto}, esperado ${esperado + soDeB}`);
      }
    }
  } finally { db.exec('PRAGMA foreign_keys = ON;'); }

  assert.strictEqual(problemas.length, 0, `VAZAMENTO ENTRE CONTAS → ${problemas.join(' · ')}`);
});

// =====================================================================
// 3. RBAC
// =====================================================================
teste('rbac: curinga casa por prefixo, não por acaso', () => {
  assert.ok(rbac.casa('crm.*', 'crm.contato.ler'));
  assert.ok(rbac.casa('*', 'qualquer.coisa'));
  assert.ok(!rbac.casa('crm.*', 'crmx.contato.ler'));
  assert.ok(!rbac.casa('crm.contato.ler', 'crm.contato.editar'));
});
teste('rbac: perfil de leitura não escreve', () => {
  const leitura = rbac.papelPorSlug('leitura');
  const p = new Set(j.parse(leitura.permissoes, []));
  assert.ok(rbac.pode(p, 'crm.contato.ler'));
  assert.ok(!rbac.pode(p, 'crm.contato.editar'));
});
teste('rbac: agente de IA nasce sem poder de escrita', () => {
  const agente = rbac.papelPorSlug('agente-ia');
  const p = new Set(j.parse(agente.permissoes, []));
  for (const proibida of ['crm.contato.editar', 'campanha.disparar', 'ads.orcamento.alterar', 'conteudo.publicar']) {
    assert.ok(!rbac.pode(p, proibida), `agente de IA veio com "${proibida}"`);
  }
});
lanca('rbac: exigir() sem permissão devolve 403',
  () => tenancy.comTenant({ tenantId: TA, userId: 'u', permissoes: new Set(['conta.ler']) },
    () => rbac.exigir('conta.usuario.remover')), /Sem permissão/i);

// =====================================================================
// 4. HIERARQUIA E ACESSO
// =====================================================================
let agencia = null, userAgencia = null;
teste('hierarquia: agência administra as contas vinculadas', () => {
  agencia = comoPlat(() => contas.criarOrg({ tipo: 'agencia', nome: 'Agência Teste', slug: 'ag-teste' }));
  comoPlat(() => contas.vincularConta(agencia.id, TA));
  const lista = contas.contasDaOrg(agencia.id);
  assert.strictEqual(lista.length, 1, 'agência não recebeu a conta');
  assert.strictEqual(contas.orgDoTenant(TA).id, agencia.id);
});
teste('hierarquia: uma conta pertence a uma organização só', () => {
  const outra = comoPlat(() => contas.criarOrg({ tipo: 'revenda', nome: 'Revenda', slug: 'rev-teste' }));
  comoPlat(() => contas.vincularConta(outra.id, TA));
  assert.strictEqual(contas.orgDoTenant(TA).id, outra.id, 'não migrou o vínculo');
  comoPlat(() => contas.vincularConta(agencia.id, TA));
  const n = db.prepare('SELECT COUNT(*) AS n FROM gx_org_contas WHERE tenant_id = ?').get(TA).n;
  assert.strictEqual(n, 1, `conta ficou em ${n} organizações`);
});
teste('acesso: membership na agência dá acesso derivado à conta dela', () => {
  userAgencia = comoPlat(() => contas.criarUsuario({ nome: 'Op Agência', email: 'op@agencia.test', senha: 'senha-forte-1' }));
  comoPlat(() => contas.conceder({ userId: userAgencia.id, escopoTipo: 'org', escopoId: agencia.id, roleSlug: 'agencia-admin' }));
  const acesso = contas.resolverAcesso(userAgencia.id, TA);
  assert.ok(acesso, 'não resolveu acesso via agência');
  assert.strictEqual(acesso.via, 'org');
  assert.ok(rbac.pode(acesso.permissoes, 'crm.contato.ler'));
});
teste('acesso: a mesma pessoa NÃO alcança conta fora da agência', () => {
  assert.strictEqual(contas.resolverAcesso(userAgencia.id, TB), null, 'alcançou conta de outra organização');
});
teste('acesso: membership revogado deixa de valer', () => {
  const u = comoPlat(() => contas.criarUsuario({ nome: 'Temp', email: 'temp@t.test' }));
  const m = comoPlat(() => contas.conceder({ userId: u.id, escopoTipo: 'tenant', escopoId: TB, roleSlug: 'leitura' }));
  assert.ok(contas.resolverAcesso(u.id, TB), 'não concedeu');
  comoPlat(() => contas.revogar(m.id));
  assert.strictEqual(contas.resolverAcesso(u.id, TB), null, 'acesso sobreviveu à revogação');
});
teste('acesso: ponte com o Villela CRM importa usuários legados', () => {
  db.prepare('INSERT INTO tenant_users (id, tenant_id, nome, email, papel, ativo, criado_em) VALUES (?,?,?,?,?,?,?)')
    .run(novoId(), TB, 'Legado', 'legado@t.test', 'gestor', 1, nowISO());
  const r = comoPlat(() => contas.sincronizarUsuariosLegados());
  assert.ok(r.total >= 1, 'não encontrou usuário legado');
  const u = contas.usuarioPorEmail('legado@t.test');
  assert.ok(u, 'não criou identidade global');
  const acesso = contas.resolverAcesso(u.id, TB);
  assert.ok(acesso && rbac.pode(acesso.permissoes, 'crm.oportunidade.editar'), 'papel legado não virou perfil');
  const r2 = comoPlat(() => contas.sincronizarUsuariosLegados());          // idempotência
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM gx_users WHERE lower(email) = ?').get('legado@t.test').n, 1);
  void r2;
});

// =====================================================================
// 5. SESSÕES
// =====================================================================
teste('sessão: senha errada não entra', () => {
  try { sessao.entrar({ email: 'op@agencia.test', senha: 'errada' }); falhas.push('sessão: senha errada entrou'); }
  catch (e) { assert.strictEqual(e.status, 401); }
});
let tokenAg = null;
teste('sessão: login devolve token e as contas disponíveis', () => {
  const r = sessao.entrar({ email: 'op@agencia.test', senha: 'senha-forte-1', ip: '1.2.3.4' });
  tokenAg = r.token;
  assert.ok(r.token, 'sem token');
  assert.ok(r.contas.some(c => c.id === TA), 'conta da agência não apareceu');
  assert.ok(!r.usuario.senha_hash, 'devolveu o hash da senha');
});
teste('sessão: comSessao() entra no contexto da conta ativa', () => {
  const v = sessao.validar(tokenAg);
  sessao.trocarConta(v.sessao.id, TA);
  const dentro = sessao.comSessao(tokenAg, () => tenancy.tenantAtual());
  assert.strictEqual(dentro, TA);
});
teste('sessão: trocar para conta sem acesso é 403', () => {
  const v = sessao.validar(tokenAg);
  try { sessao.trocarConta(v.sessao.id, TB); falhas.push('sessão: trocou para conta sem acesso'); }
  catch (e) { assert.strictEqual(e.status, 403); }
});
teste('sessão: revogar invalida na hora', () => {
  const v = sessao.validar(tokenAg);
  sessao.revogar(v.sessao.id);
  assert.strictEqual(sessao.validar(tokenAg), null, 'token sobreviveu à revogação');
});

// =====================================================================
// 6. ENTITLEMENTS
// =====================================================================
teste('entitlements: plano define o limite, override manda mais', () => {
  comoA(() => {
    const antes = entitlements.limite('usuarios');
    assert.ok(antes >= 0, 'limite não resolveu');
    entitlements.definirLimite('usuarios', 42);
    assert.strictEqual(entitlements.limite('usuarios'), 42, 'override não venceu');
  });
  comoB(() => assert.notStrictEqual(entitlements.limite('usuarios'), 42, 'override de A vazou para B'));
});
lanca('entitlements: estourar o limite devolve 402',
  () => comoA(() => entitlements.exigirDentroDoLimite('usuarios', 42)), /plano desta conta permite/i);
lanca('entitlements: recurso fora do plano devolve 402',
  () => comoA(() => entitlements.exigirFlag('anuncios')), /não está incluído no plano/i);
teste('entitlements: flag por conta liga e não vaza', () => {
  comoA(() => { entitlements.definirFlag('anuncios', true); assert.ok(entitlements.flagLigada('anuncios')); });
  comoB(() => assert.ok(!entitlements.flagLigada('anuncios'), 'flag de A vazou para B'));
});
teste('entitlements: consumo acumula e avisa quando cruza o teto', () => {
  comoA(() => {
    entitlements.definirLimite('mensagens_mes', 2);
    entitlements.consumir('mensagens_mes', 1);
    const r = entitlements.consumir('mensagens_mes', 2);
    assert.ok(r.estourou, 'não detectou estouro');
    assert.strictEqual(r.usado, 3);
  });
  const ev = db.prepare("SELECT * FROM gx_eventos WHERE tipo = 'usage.limit_reached' AND tenant_id = ?").all(TA);
  assert.strictEqual(ev.length, 1, `esperava 1 evento de limite, veio ${ev.length}`);
});

// =====================================================================
// 7. EVENTOS
// =====================================================================
eventos.limparAssinantes();
fila.limparHandlers();

teste('eventos: publicar grava com correlação e tenant do contexto', () => {
  const id = comoA(() => eventos.publicar('lead.created', { refTipo: 'contato', refId: 'c1', payload: { origem: 'site' } }));
  const ev = db.prepare('SELECT * FROM gx_eventos WHERE id = ?').get(id);
  assert.strictEqual(ev.tenant_id, TA);
  assert.ok(ev.correlation_id, 'sem correlation id');
  assert.strictEqual(ev.status, 'pendente');
});
teste('eventos: chave de idempotência barra a segunda publicação', () => {
  const a = comoA(() => eventos.publicar('form.submitted', { chaveIdem: 'form-123' }));
  const b = comoA(() => eventos.publicar('form.submitted', { chaveIdem: 'form-123' }));
  assert.ok(a, 'primeira publicação falhou');
  assert.strictEqual(b, null, 'publicou duplicado');
});
teste('eventos: assinante síncrono recebe no contexto do tenant dono', () => {
  const vistos = [];
  eventos.assinar('lead.qualified', 'teste-sync', (payload) => { vistos.push({ payload, tenant: tenancy.tenantAtual() }); });
  comoA(() => eventos.publicar('lead.qualified', { payload: { score: 80 } }));
  comoPlat(() => eventos.processarPendentes(50));
  assert.strictEqual(vistos.length, 1, `assinante chamado ${vistos.length}×`);
  assert.strictEqual(vistos[0].tenant, TA, 'handler rodou no tenant errado');
  assert.strictEqual(vistos[0].payload.score, 80);
});
teste('eventos: assinante assíncrono vira job na fila', () => {
  eventos.assinar('meeting.booked', 'teste-async', () => {}, { assincrono: true });
  comoA(() => eventos.publicar('meeting.booked', { payload: { quando: 'amanhã' } }));
  comoPlat(() => eventos.processarPendentes(50));
  const jobs = db.prepare("SELECT * FROM gx_jobs WHERE tipo LIKE 'evento:meeting.booked%'").all();
  assert.strictEqual(jobs.length, 1, `esperava 1 job, veio ${jobs.length}`);
  assert.strictEqual(jobs[0].tenant_id, TA, 'job nasceu no tenant errado');
});
teste('eventos: falha do assinante agenda nova tentativa, não perde o evento', () => {
  eventos.assinar('task.overdue', 'teste-falha', () => { throw new Error('falhou de propósito'); });
  const id = comoA(() => eventos.publicar('task.overdue', {}));
  comoPlat(() => eventos.processarPendentes(50));
  const ev = db.prepare('SELECT * FROM gx_eventos WHERE id = ?').get(id);
  assert.strictEqual(ev.status, 'pendente', 'evento não voltou para a fila');
  assert.strictEqual(ev.tentativas, 1);
  assert.ok(ev.proxima_em > nowISO(), 'não aplicou backoff');
  assert.ok(/falhou de propósito/.test(ev.ultimo_erro));
});
teste('eventos: replay é operação de plataforma e fica auditado', () => {
  const id = comoA(() => eventos.publicar('review.received', {}));
  comoPlat(() => eventos.processarPendentes(50));
  const r = comoPlat(() => eventos.reprocessar(id, { motivo: 'teste' }));
  assert.strictEqual(r.status, 'pendente');
  const aud = db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE acao = 'evento.replay'").get().n;
  assert.ok(aud >= 1, 'replay não auditado');
});
lanca('eventos: replay fora do escopo de plataforma é recusado',
  () => comoA(() => eventos.reprocessar('qualquer')), /plataforma/i);

// =====================================================================
// 8. FILA
// =====================================================================
teste('fila: job roda no contexto do tenant e conclui', () => {
  let tenantVisto = null;
  fila.registrar('teste.ok', (payload) => { tenantVisto = tenancy.tenantAtual(); return { eco: payload.x }; });
  const id = comoA(() => fila.enfileirar({ tipo: 'teste.ok', payload: { x: 7 } }));
  comoPlat(() => fila.processarLote(10));
  const job = db.prepare('SELECT * FROM gx_jobs WHERE id = ?').get(id);
  assert.strictEqual(job.status, 'concluido', `status ${job.status}: ${job.ultimo_erro}`);
  assert.strictEqual(tenantVisto, TA, 'job rodou no tenant errado');
  assert.ok(/"eco":7/.test(job.resultado));
});
teste('fila: chave de idempotência barra o job duplicado', () => {
  const a = comoA(() => fila.enfileirar({ tipo: 'teste.ok', chaveIdem: 'unico-1' }));
  const b = comoA(() => fila.enfileirar({ tipo: 'teste.ok', chaveIdem: 'unico-1' }));
  assert.ok(a && b === null, 'enfileirou duplicado');
});
teste('fila: falha reagenda com backoff crescente', () => {
  fila.registrar('teste.falha', () => { throw new Error('erro proposital'); });
  const id = comoA(() => fila.enfileirar({ tipo: 'teste.falha', maxTentativas: 3 }));
  comoPlat(() => fila.processarLote(10));
  const job = db.prepare('SELECT * FROM gx_jobs WHERE id = ?').get(id);
  assert.strictEqual(job.status, 'pendente');
  assert.strictEqual(job.tentativas, 1);
  assert.ok(job.proxima_em > nowISO(), 'não aplicou backoff');
});
teste('fila: esgotadas as tentativas o job vai para a DLQ e avisa', () => {
  const id = comoA(() => fila.enfileirar({ tipo: 'teste.falha', maxTentativas: 1 }));
  db.prepare("UPDATE gx_jobs SET proxima_em = '' WHERE id = ?").run(id);
  comoPlat(() => fila.processarLote(10));
  const job = db.prepare('SELECT * FROM gx_jobs WHERE id = ?').get(id);
  assert.strictEqual(job.status, 'dlq', `status ${job.status}`);
  const ev = db.prepare("SELECT * FROM gx_eventos WHERE tipo = 'job.dead_lettered' AND ref_id = ?").all(id);
  assert.strictEqual(ev.length, 1, 'DLQ não emitiu evento');
});
teste('fila: job sem handler morre na hora, não fica girando', () => {
  const id = comoA(() => fila.enfileirar({ tipo: 'teste.inexistente', maxTentativas: 9 }));
  comoPlat(() => fila.processarLote(10));
  const job = db.prepare('SELECT * FROM gx_jobs WHERE id = ?').get(id);
  assert.strictEqual(job.status, 'dlq');
  assert.ok(/Sem handler/.test(job.ultimo_erro));
});
teste('fila: reenfileirar tira da DLQ e deixa auditoria', () => {
  const dlq = db.prepare("SELECT * FROM gx_jobs WHERE status = 'dlq' LIMIT 1").get();
  const r = comoPlat(() => fila.reenfileirar(dlq.id, { motivo: 'teste' }));
  assert.strictEqual(r.status, 'pendente');
  assert.strictEqual(r.tentativas, 0);
});
teste('fila: painel conta o que está preso', () => {
  const s = fila.estatisticas();
  assert.ok(typeof s.dlq === 'number' && typeof s.eventos_pendentes === 'number');
});

// =====================================================================
// 9. APROVAÇÕES
// =====================================================================
teste('aprovações: ação proibida é barrada no serviço', () => {
  const r = aprovacoes.avaliar('tenant.acessar_outro', 4);
  assert.strictEqual(r.permitido, false);
  assert.strictEqual(r.nivel, 4);
});
lanca('aprovações: ação proibida não vira pedido',
  () => comoA(() => aprovacoes.solicitar({ acao: 'politica.contornar' })), /proibida/i);
teste('aprovações: ação de risco sempre pede aprovação, mesmo com autonomia alta', () => {
  const r = aprovacoes.avaliar('anuncio.orcamento_alterar', 3);
  assert.ok(r.permitido && r.precisaAprovacao, 'passou sem aprovação');
});
teste('aprovações: ação desconhecida cai em nível 3', () => {
  assert.strictEqual(aprovacoes.nivelDaAcao('inventada.qualquer'), 3);
});
teste('aprovações: autonomia baixa eleva ação de baixo risco a aprovação', () => {
  const r = aprovacoes.avaliar('rascunho.criar', 1);
  assert.ok(r.precisaAprovacao, 'agente nível 1 executou ação nível 2');
});
let pedido = null;
teste('aprovações: pedido nasce pendente e emite evento', () => {
  pedido = comoA(() => aprovacoes.solicitar({
    acao: 'campanha.disparar', titulo: 'Disparo de teste',
    justificativa: 'teste', dados: { campanha: 'x' }, custoCentavos: 5000,
  }));
  assert.strictEqual(pedido.status, 'pendente');
  const ev = db.prepare("SELECT * FROM gx_eventos WHERE tipo = 'approval.requested' AND ref_id = ?").all(pedido.id);
  assert.strictEqual(ev.length, 1);
});
teste('aprovações: aprovar enfileira a execução (não executa direto)', () => {
  const r = comoA(() => aprovacoes.decidir(pedido.id, { decisao: 'aprovar', obs: 'ok', quem: 'augusto' }));
  assert.strictEqual(r.status, 'aprovada');
  assert.ok(r.job_id, 'não enfileirou a execução');
  const job = db.prepare('SELECT * FROM gx_jobs WHERE id = ?').get(r.job_id);
  assert.strictEqual(job.tenant_id, TA);
});
lanca('aprovações: decidir duas vezes é recusado',
  () => comoA(() => aprovacoes.decidir(pedido.id, { decisao: 'rejeitar' })), /já foi/i);
teste('aprovações: editar e aprovar guarda o que o humano mudou', () => {
  const p = comoA(() => aprovacoes.solicitar({ acao: 'proposta.enviar', dados: { valor: 100 } }));
  const r = comoA(() => aprovacoes.decidir(p.id, { decisao: 'editar_aprovar', dadosEditados: { valor: 250 }, quem: 'augusto' }));
  assert.ok(/250/.test(r.dados_editados), 'não guardou a edição');
  const job = db.prepare('SELECT * FROM gx_jobs WHERE id = ?').get(r.job_id);
  assert.ok(/250/.test(job.payload), 'executou com os dados antigos');
});
teste('aprovações: pedido de uma conta não aparece na outra', () => {
  comoB(() => assert.strictEqual(aprovacoes.pendentes().length, 0, 'pedido de A apareceu em B'));
});

// =====================================================================
// 10. COFRE DE SEGREDOS
// =====================================================================
teste('cofre: sem GROWTH_SECRET_KEY o cofre recusa gravar', () => {
  delete process.env.GROWTH_SECRET_KEY;
  assert.strictEqual(segredos.configurado(), false);
  try { comoA(() => segredos.guardar({ chave: 'x', valor: 'y' })); falhas.push('cofre: gravou sem chave'); }
  catch (e) { assert.ok(/GROWTH_SECRET_KEY/.test(e.message)); }
});
teste('cofre: guarda, devolve e não expõe o valor na listagem', () => {
  process.env.GROWTH_SECRET_KEY = CHAVE_COFRE;
  comoA(() => {
    segredos.guardar({ escopo: 'conexao', refId: 'con-1', chave: 'access_token', valor: 'TOKEN-SECRETO-123' });
    assert.strictEqual(segredos.revelar({ escopo: 'conexao', refId: 'con-1', chave: 'access_token' }), 'TOKEN-SECRETO-123');
    const lista = segredos.listar({ escopo: 'conexao', refId: 'con-1' });
    assert.strictEqual(lista.length, 1, `esperava 1 segredo, veio ${lista.length}`);
    const serializado = JSON.stringify(lista);
    assert.ok(!/TOKEN-SECRETO/.test(serializado), 'a listagem vazou o segredo');
    assert.ok(!/cifra|iv|tag/.test(serializado), 'a listagem expôs material criptográfico');
  });
});
teste('cofre: segredo de uma conta não é legível pela outra', () => {
  comoB(() => assert.strictEqual(segredos.revelar({ escopo: 'conexao', refId: 'con-1', chave: 'access_token' }), null));
});
teste('cofre: cifra adulterada não decifra (GCM autentica)', () => {
  const c = segredos.cifrar('valor');
  const adulterada = Buffer.from(c.cifra, 'base64');
  adulterada[0] = adulterada[0] ^ 0xff;
  try { segredos.decifrar({ cifra: adulterada.toString('base64'), iv: c.iv, tag: c.tag }); falhas.push('cofre: decifrou cifra adulterada'); }
  catch (_) { ok++; }
});

// =====================================================================
// 11. CONECTORES
// =====================================================================
teste('conectores: nenhum promete capacidade sem documentação conferida', () => {
  for (const c of conectores.panorama()) {
    if (c.documentacao_conferida) continue;
    const capacidades = Object.values(c.capacidades || {});
    assert.ok(!capacidades.some(Boolean), `${c.chave} declara capacidade sem doc conferida`);
    assert.ok(!c.operacional, `${c.chave} aparece operacional sem doc conferida`);
  }
});
teste('conectores: capacidades padrão nascem todas em false', () => {
  const wa = conectores.obter('whatsapp_cloud');
  assert.ok(wa, 'conector não registrado');
  assert.ok(!Object.values(wa.capacidadesPadrao).some(Boolean), 'capacidade ligada sem implementação');
  assert.ok(!wa.operacional, 'conector planejado aparece como operacional');
});

// =====================================================================
// 12. INCIDENTES
// =====================================================================
teste('incidentes: abrir duas vezes a mesma referência não vira enxurrada', () => {
  comoA(() => {
    incidentes.abrir({ natureza: 'integracao', titulo: 'Token vencido', refTipo: 'conexao', refId: 'con-1' });
    incidentes.abrir({ natureza: 'integracao', titulo: 'Token vencido', refTipo: 'conexao', refId: 'con-1', detalhe: 'de novo' });
    assert.strictEqual(repo.contar('gx_incidentes', { onde: "ref_id = 'con-1'" }), 1);
  });
});
lanca('incidentes: panorama de todas as contas exige plataforma',
  () => comoA(() => incidentes.abertos()), /plataforma/i);

// =====================================================================
// 13. ETAPA 2 — RESOLUÇÃO DE IDENTIDADE
// =====================================================================
const appRepo = require('../crm/app-repo');
appRepo.provisionar(TA);
appRepo.provisionar(TB);

teste('identidade: normalização casa o que é a mesma chave escrita diferente', () => {
  const n = (t, v) => identidade.normalizar(t, v);
  assert.strictEqual(n('email', 'Maria.Silva+lead@Gmail.com'), n('email', 'mariasilva@gmail.com'));
  assert.notStrictEqual(n('email', 'a.b@outlook.com'), n('email', 'ab@outlook.com'), 'ponto só é ignorado no Gmail');
  assert.strictEqual(n('telefone', '(61) 99999-1234'), n('telefone', '+55 61 99999 1234'));
  assert.strictEqual(n('instagram', 'https://instagram.com/Fulana/'), 'fulana');
  assert.strictEqual(n('email', 'sem-arroba'), '', 'e-mail inválido não vira chave');
});

let contatoMaria = null;
teste('identidade: formulário cria a pessoa e registra a chave', () => {
  const r = comoA(() => identidade.resolver({
    identidades: [{ tipo: 'email', valor: 'Maria.Silva@Gmail.com' }],
    dados: { nome: 'Maria Silva' }, origem: 'landing',
  }));
  assert.ok(r.criado, 'não criou');
  contatoMaria = r.contatoId;
  const ids = comoA(() => identidade.identidadesDo(contatoMaria));
  assert.strictEqual(ids.length, 1);
  assert.strictEqual(ids[0].valor_norm, 'mariasilva@gmail.com');
});

teste('identidade: a mesma pessoa por outro canal NÃO vira ficha nova', () => {
  const r = comoA(() => identidade.resolver({
    identidades: [{ tipo: 'email', valor: 'mariasilva@gmail.com' }, { tipo: 'whatsapp', valor: '(61) 99999-1234' }],
    dados: { cidade: 'Brasília' }, origem: 'whatsapp',
  }));
  assert.strictEqual(r.criado, false, 'duplicou a pessoa');
  assert.strictEqual(r.contatoId, contatoMaria);
  const ids = comoA(() => identidade.identidadesDo(contatoMaria));
  assert.strictEqual(ids.length, 2, 'não anexou a chave nova');
  const ficha = appRepo.Contatos.obter(TA, contatoMaria);
  assert.strictEqual(ficha.cidade, 'Brasília', 'não preencheu a lacuna');
});

teste('identidade: chave fraca sozinha NÃO funde — vira ficha separada', () => {
  const r = comoA(() => identidade.resolver({
    identidades: [{ tipo: 'instagram', valor: '@maria.silva' }],
    dados: { nome: 'Maria S.' }, origem: 'instagram',
  }));
  assert.ok(r.criado, 'fundiu com base só no Instagram (peso 65 < 80)');
  assert.notStrictEqual(r.contatoId, contatoMaria);
});

teste('identidade: chave fraca + chave forte gera SUGESTÃO, não mesclagem automática', () => {
  const antes = appRepo.Contatos.contar(TA);
  const r = comoA(() => identidade.resolver({
    identidades: [{ tipo: 'instagram', valor: '@maria.silva' }, { tipo: 'whatsapp', valor: '5561999991234' }],
    origem: 'instagram',
  }));
  assert.strictEqual(r.contatoId, contatoMaria, 'não resolveu pela chave forte');
  assert.strictEqual(appRepo.Contatos.contar(TA), antes, 'mesclou sozinho — não podia');
  assert.ok(comoA(() => identidade.sugestoesPendentes()).length >= 1, 'não registrou a suspeita');
});

teste('identidade: só a decisão humana mescla, e o histórico segue a pessoa', () => {
  const sug = comoA(() => identidade.sugestoesPendentes())[0];
  const antes = appRepo.Contatos.contar(TA);
  comoA(() => identidade.decidirSugestao(sug.id, { decisao: 'aplicar', quem: 'augusto' }));
  assert.strictEqual(appRepo.Contatos.contar(TA), antes - 1, 'não mesclou');
  const ids = comoA(() => identidade.identidadesDo(contatoMaria)).map((i) => i.tipo).sort();
  assert.deepStrictEqual(ids, ['email', 'instagram', 'whatsapp'], `identidades após merge: ${ids}`);
  const ev = db.prepare("SELECT * FROM gx_eventos WHERE tipo = 'contact.identity_merged' AND tenant_id = ?").all(TA);
  assert.strictEqual(ev.length, 1, 'não emitiu contact.identity_merged');
});

teste('identidade: rejeitar a sugestão não altera dado nenhum', () => {
  const a = comoA(() => identidade.resolver({ identidades: [{ tipo: 'email', valor: 'joao@empresa.com' }], dados: { nome: 'João' } }));
  const b = comoA(() => identidade.resolver({ identidades: [{ tipo: 'email', valor: 'joao@outra.com' }], dados: { nome: 'João' } }));
  const sug = comoA(() => identidade.sugerir(a.contatoId, b.contatoId, 60, ['mesmo nome']));
  const antes = appRepo.Contatos.contar(TA);
  comoA(() => identidade.decidirSugestao(sug.id, { decisao: 'rejeitar', quem: 'augusto' }));
  assert.strictEqual(appRepo.Contatos.contar(TA), antes, 'rejeitar mexeu nas fichas');
});

teste('identidade: a mesma chave em contas diferentes são pessoas diferentes', () => {
  const rB = comoB(() => identidade.resolver({
    identidades: [{ tipo: 'email', valor: 'mariasilva@gmail.com' }], dados: { nome: 'Outra Maria' },
  }));
  assert.notStrictEqual(rB.contatoId, contatoMaria, 'a chave atravessou a fronteira entre contas');
  assert.strictEqual(comoB(() => identidade.identidadesDo(contatoMaria)).length, 0, 'B enxergou identidade de A');
});

// =====================================================================
// 14. ETAPA 2 — SEGMENTOS
// =====================================================================
teste('segmentos: a regra vira SQL parametrizado e texto legível', () => {
  const c = segmentos.compilar({ juncao: 'todas', condicoes: [
    { campo: 'cidade', operador: 'igual', valor: 'Brasília' },
    { campo: 'score', operador: 'maior', valor: 50 },
  ] });
  assert.ok(/cidade = :s0/.test(c.where) && /score > :s1/.test(c.where), c.where);
  assert.strictEqual(c.params.s0, 'Brasília');
  assert.ok(/Cidade é igual a Brasília e Score é maior que 50/.test(c.descricao), c.descricao);
});

teste('segmentos: campo ou operador fora da lista é ignorado, não vira SQL', () => {
  const c = segmentos.compilar({ condicoes: [
    { campo: 'nome; DROP TABLE crm_contatos', operador: 'igual', valor: 'x' },
    { campo: 'cidade', operador: 'ou 1=1', valor: 'x' },
  ] });
  assert.strictEqual(c.where, '1=1', `injeção passou: ${c.where}`);
});

teste('segmentos: filtra de verdade e não enxerga a outra conta', () => {
  const seg = comoA(() => segmentos.criar({
    nome: 'Brasília', regras: { condicoes: [{ campo: 'cidade', operador: 'igual', valor: 'Brasília' }] },
  }));
  const n = comoA(() => segmentos.contar(seg.id));
  assert.ok(n >= 1, `esperava ao menos 1 contato em Brasília, veio ${n}`);
  comoB(() => { try { segmentos.contar(seg.id); falhas.push('segmentos: B leu segmento de A'); } catch (_) { ok++; } });
});

// =====================================================================
// 15. ETAPA 2 — LGPD
// =====================================================================
teste('lgpd: supressão vence — e é por conta', () => {
  comoA(() => {
    lgpd.suprimir({ canal: 'email', valor: 'Maria.Silva+x@Gmail.com', motivo: 'opt_out' });
    assert.ok(lgpd.estaSuprimido('email', 'mariasilva@gmail.com'), 'não reconheceu a mesma chave escrita diferente');
    assert.ok(!lgpd.estaSuprimido('email', 'outra@gmail.com'));
  });
  comoB(() => assert.ok(!lgpd.estaSuprimido('email', 'mariasilva@gmail.com'), 'supressão de A vazou para B'));
});

teste('lgpd: segmento com excluirSuprimidos tira quem pediu para não receber', () => {
  const seg = comoA(() => segmentos.criar({
    nome: 'Todos ativos', regras: { condicoes: [{ campo: 'email', operador: 'preenchido' }] },
  }));
  const todos = comoA(() => segmentos.contatos(seg.id, { excluirSuprimidos: false }));
  const limpos = comoA(() => segmentos.contatos(seg.id, { excluirSuprimidos: true }));
  assert.ok(limpos.length < todos.length, `supressão não filtrou (${todos.length} → ${limpos.length})`);
});

teste('lgpd: solicitação nasce com prazo de 15 dias', () => {
  const s = comoA(() => lgpd.abrirSolicitacao({ contatoId: contatoMaria, tipo: 'acesso', canal: 'email' }));
  assert.strictEqual(s.status, 'aberta');
  const dias = Math.round((new Date(s.prazo) - new Date()) / 86400000);
  assert.ok(dias >= 14 && dias <= 15, `prazo veio com ${dias} dias`);
});

teste('lgpd: exportação do titular traz ficha, identidades e procedência', () => {
  const dump = comoA(() => lgpd.exportarTitular(contatoMaria));
  assert.ok(dump.contato && dump.contato.id === contatoMaria);
  assert.ok(dump.identidades.length >= 3, 'faltaram identidades na exportação');
  assert.ok('navegacao' in dump && 'consentimento' in dump);
});

teste('lgpd: anonimizar apaga identificadores e as chaves de identidade', () => {
  const alvo = comoA(() => identidade.resolver({
    identidades: [{ tipo: 'email', valor: 'apagar@teste.com' }], dados: { nome: 'Para Apagar' },
  })).contatoId;
  comoA(() => lgpd.anonimizar(alvo, { motivo: 'teste' }));
  const ficha = appRepo.Contatos.obter(TA, alvo);
  assert.strictEqual(ficha.email, '', 'e-mail sobreviveu');
  assert.strictEqual(ficha.nome, 'Titular anonimizado');
  assert.strictEqual(comoA(() => identidade.identidadesDo(alvo)).length, 0, 'chave de identidade sobreviveu → dá para reidentificar');
  assert.strictEqual(comoA(() => identidade.porChave('email', 'apagar@teste.com')), null);
});

// =====================================================================
// 16. ETAPA 3 — INBOX OMNICHANNEL
// =====================================================================
let filaAtendimento = null;
teste('inbox: fila com SLA de primeira resposta', () => {
  filaAtendimento = comoA(() => conversas.criarFila({
    nome: 'Atendimento', canais: ['chat_site', 'whatsapp'], slaPrimeiraMin: 15, padrao: true,
  }));
  assert.strictEqual(filaAtendimento.sla_primeira_min, 15);
});

let convChat = null;
teste('inbox: mensagem que chega abre a conversa e identifica a pessoa', () => {
  const r = comoA(() => conversas.registrarEntrada({
    canal: 'chat_site', chaveExterna: 'sess-001', texto: 'Oi, quero alugar para um casamento',
    externaId: 'ext-1',
    identidades: [{ tipo: 'email', valor: 'noiva@teste.com' }],
    dadosContato: { nome: 'Bianca' },
  }));
  convChat = r.conversa;
  assert.ok(r.contatoId, 'não identificou a pessoa');
  assert.strictEqual(convChat.total_mensagens, 1);
  assert.strictEqual(convChat.nao_lidas, 1);
  assert.strictEqual(convChat.ultima_de, 'cliente');
  assert.ok(convChat.sla_primeira_venc, 'não armou o SLA de primeira resposta');
  assert.strictEqual(convChat.fila_id, filaAtendimento.id, 'não caiu na fila do canal');
});

teste('inbox: reentrega do mesmo webhook não duplica a mensagem', () => {
  const r = comoA(() => conversas.registrarEntrada({
    canal: 'chat_site', chaveExterna: 'sess-001', texto: 'Oi, quero alugar para um casamento', externaId: 'ext-1',
  }));
  assert.ok(r.duplicada, 'a mensagem repetida entrou de novo');
  const n = comoA(() => repo.contar('gx_mensagens', { onde: 'conversa_id = :c', params: { c: convChat.id } }));
  assert.strictEqual(n, 1, `esperava 1 mensagem, veio ${n}`);
});

teste('inbox: responder marca a primeira resposta e enfileira a entrega', () => {
  const r = comoA(() => conversas.responder(convChat.id, { texto: 'Oi Bianca! Temos disponibilidade.', autorId: 'u-atendente' }));
  assert.ok(r.mensagemId);
  assert.ok(r.conversa.primeira_resposta_em, 'não registrou a primeira resposta');
  assert.strictEqual(r.conversa.nao_lidas, 0);
  const job = db.prepare("SELECT * FROM gx_jobs WHERE tenant_id = ? AND tipo = 'mensagem:entregar'").all(TA);
  assert.strictEqual(job.length, 1, 'não enfileirou a entrega');
});

teste('inbox: nota interna não vai para o cliente nem vira entrega', () => {
  const antes = db.prepare("SELECT COUNT(*) AS n FROM gx_jobs WHERE tenant_id = ? AND tipo = 'mensagem:entregar'").get(TA).n;
  const r = comoA(() => conversas.responder(convChat.id, { texto: 'Cliente do casamento da Ana', interna: true, autorId: 'u-atendente' }));
  const m = comoA(() => repo.buscar('gx_mensagens', r.mensagemId));
  assert.strictEqual(m.interna, 1);
  assert.strictEqual(m.status, 'enviada', 'nota interna não deveria ficar pendente de entrega');
  const depois = db.prepare("SELECT COUNT(*) AS n FROM gx_jobs WHERE tenant_id = ? AND tipo = 'mensagem:entregar'").get(TA).n;
  assert.strictEqual(depois, antes, 'nota interna enfileirou entrega');
});

teste('inbox: supressão bloqueia o envio — a checagem é no serviço', () => {
  const contato = appRepo.Contatos.listar(TA, { busca: 'Bianca' })[0];
  comoA(() => lgpd.suprimir({ canal: 'whatsapp', valor: contato.telefone || '5561900000000', motivo: 'opt_out' }));
  const conv = comoA(() => conversas.localizarOuAbrir({ canal: 'whatsapp', chaveExterna: '5561900000000', contatoId: contato.id }));
  comoA(() => conversas.registrarEntrada({ canal: 'whatsapp', chaveExterna: '5561900000000', texto: 'oi', externaId: 'w1' }));
  appRepo.Contatos.atualizar(TA, contato.id, { telefone: '5561900000000' }, 'teste');
  try {
    comoA(() => conversas.responder(conv.id, { texto: 'oi', autorId: 'u' }));
    falhas.push('inbox: enviou para contato suprimido');
  } catch (e) {
    assert.strictEqual(e.status, 403);
    assert.ok(/não receber/i.test(e.message));
    ok++;
  }
});

teste('inbox: janela do WhatsApp — sem mensagem do cliente, só template', () => {
  const conv = comoA(() => conversas.localizarOuAbrir({ canal: 'whatsapp', chaveExterna: '5561911112222' }));
  const p = comoA(() => conversas.politicaDeJanela(conv));
  assert.strictEqual(p.podeTextoLivre, false);
  assert.ok(/template/i.test(p.motivo), p.motivo);
  try {
    comoA(() => conversas.responder(conv.id, { texto: 'oi', autorId: 'u' }));
    falhas.push('inbox: mandou texto livre sem janela aberta');
  } catch (e) { assert.strictEqual(e.status, 422); ok++; }
});

teste('inbox: janela do WhatsApp — com mensagem recente, texto livre passa', () => {
  comoA(() => conversas.registrarEntrada({ canal: 'whatsapp', chaveExterna: '5561911112222', texto: 'oi', externaId: 'w2' }));
  const conv = comoA(() => repo.um("SELECT * FROM gx_conversas WHERE tenant_id = :tenant AND chave_externa = '5561911112222'"));
  const p = comoA(() => conversas.politicaDeJanela(conv));
  assert.strictEqual(p.podeTextoLivre, true, p.motivo);
  const r = comoA(() => conversas.responder(conv.id, { texto: 'Olá!', autorId: 'u' }));
  assert.ok(r.mensagemId);
});

teste('inbox: janela do WhatsApp — passadas 24h, texto livre volta a ser bloqueado', () => {
  const conv = comoA(() => repo.um("SELECT * FROM gx_conversas WHERE tenant_id = :tenant AND chave_externa = '5561911112222'"));
  const velho = new Date(Date.now() - 30 * 3600000).toISOString();
  db.prepare("UPDATE gx_mensagens SET criado_em = ? WHERE conversa_id = ? AND direcao = 'entrada'").run(velho, conv.id);
  const p = comoA(() => conversas.politicaDeJanela(conv));
  assert.strictEqual(p.podeTextoLivre, false, 'a janela de 24h não fechou');
  assert.ok(/24h/.test(p.motivo), p.motivo);
  // com template aprovado, passa
  const r = comoA(() => conversas.responder(conv.id, { texto: 'Retomando', template: 'retomada_pt', autorId: 'u' }));
  assert.ok(r.mensagemId, 'template deveria passar mesmo fora da janela');
});

teste('inbox: dois atendentes não respondem ao mesmo tempo sem aviso', () => {
  const a = comoA(() => conversas.assumirDigitacao(convChat.id, 'atendente-1'));
  assert.ok(a.ok);
  const b = comoA(() => conversas.assumirDigitacao(convChat.id, 'atendente-2'));
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.ocupadaPor, 'atendente-1');
  try {
    comoA(() => conversas.responder(convChat.id, { texto: 'duplicando', autorId: 'atendente-2' }));
    falhas.push('inbox: dois atendentes responderam sem aviso');
  } catch (e) { assert.strictEqual(e.status, 409); ok++; }
  // assumir conscientemente é permitido
  const forcado = comoA(() => conversas.responder(convChat.id, { texto: 'assumindo', autorId: 'atendente-2', forcar: true }));
  assert.ok(forcado.mensagemId);
});

teste('inbox: atribuir deixa histórico e emite evento', () => {
  comoA(() => conversas.atribuir(convChat.id, { paraUsuario: 'u-vendedor', motivo: 'virou oportunidade' }));
  const c = comoA(() => conversas.conversa(convChat.id));
  assert.strictEqual(c.responsavel, 'u-vendedor');
  assert.ok(c.atribuicoes.length >= 1, 'não registrou a transferência');
  const ev = db.prepare("SELECT * FROM gx_eventos WHERE tipo = 'conversation.assigned' AND tenant_id = ?").all(TA);
  assert.ok(ev.length >= 1);
});

teste('inbox: resposta salva aplica as variáveis do contato', () => {
  comoA(() => conversas.salvarResposta({ atalho: '/ola', titulo: 'Saudação', texto: 'Olá {{nome}}, tudo bem?' }));
  const contato = appRepo.Contatos.listar(TA, { busca: 'Bianca' })[0];
  const texto = comoA(() => conversas.aplicarResposta('/ola', contato.id));
  assert.strictEqual(texto, 'Olá Bianca, tudo bem?');
});

teste('inbox: a conta B não vê conversa nem mensagem da conta A', () => {
  comoB(() => {
    assert.strictEqual(conversas.caixa({ status: 'todas' }).length, 0, 'B enxergou conversa de A');
    assert.strictEqual(conversas.conversa(convChat.id), null, 'B abriu conversa de A');
  });
});

// =====================================================================
// 17. ROTAS DE ADMINISTRAÇÃO
// =====================================================================
const USUARIOS = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', areas: ['*'], ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', areas: ['ti'], ativo: true },
];
function requireAuth(req, res, next) {
  const u = USUARIOS.find(x => x.id === (req.headers['x-test-user'] || 'adm'));
  if (!u) return res.status(401).json({ erro: 'sem sessão' });
  req.user = u; next();
}
const requireAdmin = (req, res, next) => (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'admin' });

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
growth.montar(app, { express, requireAuth, requireAdmin, jwtSecret: 'segredo-de-teste', alertaAugusto: async () => {} });

const servidor = app.listen(0, async () => {
  const BASE = `http://127.0.0.1:${servidor.address().port}`;
  const req = async (metodo, caminho, { corpo, user = 'adm' } = {}) => {
    const r = await fetch(BASE + caminho, {
      method: metodo,
      headers: Object.assign({ 'x-test-user': user }, corpo ? { 'content-type': 'application/json' } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let dados = null;
    try { dados = await r.json(); } catch (_) {}
    return { status: r.status, dados };
  };

  const t = async (nome, fn) => { try { await fn(); ok++; } catch (e) { falhas.push(`${nome}: ${e.message}`); } };

  await t('rotas: panorama responde com os números da plataforma', async () => {
    const r = await req('GET', '/staff/api/growth/panorama');
    assert.strictEqual(r.status, 200);
    assert.ok(r.dados.contas >= 2 && r.dados.perfis === 19, JSON.stringify(r.dados).slice(0, 200));
    assert.ok(Array.isArray(r.dados.integracoes));
  });

  await t('rotas: não-admin é barrado', async () => {
    const r = await req('GET', '/staff/api/growth/panorama', { user: 'op' });
    assert.strictEqual(r.status, 403);
  });

  await t('rotas: criar organização e vincular conta', async () => {
    const c = await req('POST', '/staff/api/growth/orgs', { corpo: { tipo: 'agencia', nome: 'Ag HTTP', slug: 'ag-http' } });
    assert.strictEqual(c.status, 200, JSON.stringify(c.dados));
    const v = await req('POST', `/staff/api/growth/orgs/${c.dados.id}/contas`, { corpo: { tenantId: TB } });
    assert.strictEqual(v.status, 200);
  });

  await t('rotas: slug repetido devolve 409 com mensagem útil', async () => {
    const r = await req('POST', '/staff/api/growth/orgs', { corpo: { tipo: 'agencia', nome: 'X', slug: 'ag-http' } });
    assert.strictEqual(r.status, 409);
    assert.ok(/já existe/i.test(r.dados.erro));
  });

  await t('rotas: entrada inválida devolve 400, não 500', async () => {
    const r = await req('POST', '/staff/api/growth/orgs', { corpo: { tipo: 'agencia' } });
    assert.strictEqual(r.status, 400);
  });

  await t('rotas: toda rota de plataforma fica auditada com correlação', async () => {
    const antes = db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE acao = 'plataforma.rota'").get().n;
    await req('GET', '/staff/api/growth/contas');
    const linha = db.prepare("SELECT * FROM audit_logs WHERE acao = 'plataforma.rota' ORDER BY quando DESC LIMIT 1").get();
    const depois = db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE acao = 'plataforma.rota'").get().n;
    assert.ok(depois > antes, 'rota de plataforma não auditou');
    assert.ok(/GET \/staff\/api\/growth\/contas/.test(linha.entidade_id), `auditou "${linha.entidade_id}"`);
    assert.ok(linha.correlation_id, 'auditoria sem correlation id');
  });

  await t('rotas: catálogo de integrações é honesto sobre o que falta', async () => {
    const r = await req('GET', '/staff/api/growth/integracoes');
    assert.strictEqual(r.status, 200);
    const wa = r.dados.find(i => i.chave === 'whatsapp_cloud');
    assert.strictEqual(wa.status, 'aguardando_aprovacao', 'o WhatsApp não pode aparecer como pronto');
    assert.strictEqual(wa.documentacao_conferida, false, 'nenhuma doc oficial foi consultada — não pode dizer que foi');
    assert.strictEqual(wa.operacional, false);
    assert.ok(wa.bloqueio.length > 0, 'não diz o que falta');
    // o chat do site é NOSSO: é o único canal que pode nascer operacional
    const chat = r.dados.find(i => i.chave === 'chat_site');
    assert.strictEqual(chat.status, 'producao');
    assert.ok(chat.operacional && chat.capacidades.canReplyMessages, 'o chat do site deveria estar operacional');
  });

  await t('rotas: worker manual processa eventos e fila', async () => {
    const r = await req('POST', '/staff/api/growth/worker/rodar');
    assert.strictEqual(r.status, 200);
    assert.ok(r.dados.eventos && r.dados.jobs);
  });

  await t('conectores: método não implementado rejeita com 501 e diz o que falta', async () => {
    const wa = conectores.obter('whatsapp_cloud');
    try { await wa.authorize(); throw new Error('authorize não lançou'); }
    catch (e) {
      assert.strictEqual(e.status, 501, `status ${e.status}: ${e.message}`);
      assert.ok(/conta empresarial|template/i.test(e.message), `mensagem sem pendência: ${e.message}`);
    }
    const caps = await wa.getCapabilities();
    assert.ok(!Object.values(caps).some(Boolean), 'getCapabilities devolveu capacidade ligada');
  });

  // ===================================================================
  // FLUXO E2E OBRIGATÓRIO (§31 do PROMPT_MASTER)
  // lead preenche a página → contato criado → identidade resolvida →
  // evento emitido → procedência registrada → tudo auditado
  // ===================================================================
  let formToken = null, formId = null;

  await t('e2e: formulário é criado e publicado pela administração', async () => {
    const c = await req('POST', `/staff/api/growth/contas/${TA}/formularios`, { corpo: {
      nome: 'Cotação de Evento',
      campos: [
        { chave: 'nome', rotulo: 'Seu nome', tipo: 'texto', obrigatorio: true, mapeia: 'nome' },
        { chave: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true, mapeia: 'email' },
        { chave: 'fone', rotulo: 'WhatsApp', tipo: 'telefone', mapeia: 'whatsapp' },
        { chave: 'mensagem', rotulo: 'Conte sobre o evento', tipo: 'textarea', mapeia: 'primeira_mensagem' },
      ],
      config: { mensagem_ok: 'Recebido! Retornamos em breve.', consentimento_obrigatorio: true,
        consentimento_texto: 'Autorizo o contato.', base_legal: 'consentimento' },
    } });
    assert.strictEqual(c.status, 200, JSON.stringify(c.dados));
    formId = c.dados.id;
    const p = await req('POST', `/staff/api/growth/contas/${TA}/formularios/${formId}/publicar`);
    assert.strictEqual(p.status, 200, JSON.stringify(p.dados));
    formToken = p.dados.token;
    assert.ok(formToken && formToken.startsWith('gf_'));
  });

  await t('e2e: publicar sem e-mail nem telefone é recusado com motivo', async () => {
    const c = await req('POST', `/staff/api/growth/contas/${TA}/formularios`, { corpo: {
      nome: 'Só nome', campos: [{ chave: 'n', rotulo: 'Nome', tipo: 'texto', mapeia: 'nome' }],
    } });
    const p = await req('POST', `/staff/api/growth/contas/${TA}/formularios/${c.dados.id}/publicar`);
    assert.strictEqual(p.status, 400);
    assert.ok(/e-mail ou telefone/i.test(p.dados.erro), p.dados.erro);
  });

  const postForm = async (corpo) => {
    const r = await fetch(`${BASE}/growth/f/${formToken}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
    });
    let dados = null; try { dados = await r.json(); } catch (_) {}
    return { status: r.status, dados };
  };

  await t('e2e: a definição pública do formulário não vaza configuração interna', async () => {
    const r = await fetch(`${BASE}/growth/f/${formToken}`);
    const d = await r.json();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(d.campos.length, 4);
    assert.ok(d.consentimento.obrigatorio);
    assert.ok(!('base_legal' in d) && !('tenant_id' in d) && !('token' in d), 'vazou dado interno');
  });

  await t('e2e: lead preenche → contato criado, identidade resolvida, evento emitido', async () => {
    const antes = appRepo.Contatos.contar(TA);
    const r = await postForm({
      dados: { nome: 'Paula Andrade', email: 'Paula.Andrade@Gmail.com', fone: '(61) 98888-7777', mensagem: 'Casamento em outubro' },
      consentimento: true, visitante: 'v_teste_paula',
      procedencia: { url: 'https://villelastay.com.br/eventos?utm_source=instagram&utm_campaign=casamentos', referrer: 'https://instagram.com/' },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.dados));
    assert.strictEqual(r.dados.mensagem, 'Recebido! Retornamos em breve.');
    assert.ok(!('contatoId' in r.dados), 'devolveu o id do contato para a internet');
    assert.strictEqual(appRepo.Contatos.contar(TA), antes + 1, 'não criou o contato');

    const contato = appRepo.Contatos.listar(TA, { busca: 'Paula' })[0];
    assert.ok(contato, 'contato não encontrado');
    assert.strictEqual(contato.email, 'paula.andrade@gmail.com');
    assert.strictEqual(contato.campanha, 'casamentos', 'UTM não virou procedência');
    assert.strictEqual(contato.primeira_mensagem, 'Casamento em outubro');
    const cons = typeof contato.consentimento === 'string' ? JSON.parse(contato.consentimento) : contato.consentimento;
    assert.strictEqual(cons.optIn, true, 'consentimento não registrado');

    // conta só o evento DESTA submissão: a suíte da Etapa 1 publica um
    // form.submitted sintético na mesma conta para testar idempotência
    const ev = db.prepare("SELECT * FROM gx_eventos WHERE tipo = 'form.submitted' AND tenant_id = ? AND chave_idem LIKE 'formresp:%'").all(TA);
    assert.strictEqual(ev.length, 1, `esperava 1 form.submitted desta submissão, veio ${ev.length}`);
    const lead = db.prepare("SELECT * FROM gx_eventos WHERE tipo = 'lead.created' AND tenant_id = ?").all(TA);
    assert.ok(lead.length >= 1, 'não emitiu lead.created');
  });

  await t('e2e: a MESMA pessoa reenviando não vira segunda ficha', async () => {
    const antes = appRepo.Contatos.contar(TA);
    const r = await postForm({
      dados: { nome: 'Paula A.', email: 'paulaandrade@gmail.com', fone: '61988887777', mensagem: 'Reforçando' },
      consentimento: true, visitante: 'v_outro_navegador',
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(appRepo.Contatos.contar(TA), antes, 'duplicou a pessoa por causa do ponto no Gmail');
  });

  await t('e2e: bot que preenche o campo-armadilha é descartado sem virar lead', async () => {
    const antes = appRepo.Contatos.contar(TA);
    const r = await postForm({
      dados: { nome: 'Bot', email: 'bot@spam.com' }, consentimento: true, _hp: 'http://spam.example',
    });
    assert.strictEqual(r.status, 200, 'o bot precisa achar que deu certo');
    assert.strictEqual(appRepo.Contatos.contar(TA), antes, 'o bot virou contato');
    const spam = db.prepare('SELECT COUNT(*) AS n FROM gx_form_respostas WHERE tenant_id = ? AND spam = 1').get(TA).n;
    assert.ok(spam >= 1, 'o descarte não ficou registrado');
  });

  await t('e2e: campo obrigatório em branco devolve 400 com o nome do campo', async () => {
    const r = await postForm({ dados: { nome: 'Sem email' }, consentimento: true });
    assert.strictEqual(r.status, 400);
    assert.ok(/E-mail/.test(r.dados.erro), r.dados.erro);
  });

  await t('e2e: consentimento obrigatório não aceita envio sem aceite', async () => {
    const r = await postForm({ dados: { nome: 'X', email: 'x@y.com' } });
    assert.strictEqual(r.status, 400);
    assert.ok(/consentimento/i.test(r.dados.erro));
  });

  await t('e2e: envio idêntico repetido é tratado como duplicata, não como novo lead', async () => {
    const corpo = { dados: { nome: 'Repetido', email: 'repetido@teste.com' }, consentimento: true };
    const a = await postForm(corpo);
    const antes = db.prepare('SELECT COUNT(*) AS n FROM gx_form_respostas WHERE tenant_id = ? AND spam = 0').get(TA).n;
    const b = await postForm(corpo);
    const depois = db.prepare('SELECT COUNT(*) AS n FROM gx_form_respostas WHERE tenant_id = ? AND spam = 0').get(TA).n;
    assert.strictEqual(a.status, 200); assert.strictEqual(b.status, 200);
    assert.strictEqual(depois, antes, 'gravou a duplicata como resposta nova');
  });

  await t('e2e: tracking anônimo é vinculado à pessoa quando ela se identifica', async () => {
    const chave = db.prepare('SELECT webhook_token FROM crm_config WHERE tenant_id = ?').get(TA).webhook_token;
    for (const url of ['https://villelastay.com.br/?utm_source=google', 'https://villelastay.com.br/eventos']) {
      const r = await fetch(`${BASE}/growth/t?k=${encodeURIComponent(chave)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitante: 'v_anon_1', url, referrer: 'https://google.com' }),
      });
      assert.strictEqual(r.status, 204);
    }
    const r = await postForm({
      dados: { nome: 'Anônimo Virou Lead', email: 'anon@teste.com' }, consentimento: true, visitante: 'v_anon_1',
    });
    assert.strictEqual(r.status, 200);
    const contato = appRepo.Contatos.listar(TA, { busca: 'Anônimo' })[0];
    const trilha = db.prepare('SELECT COUNT(*) AS n FROM gx_tracking WHERE tenant_id = ? AND contato_id = ?').get(TA, contato.id).n;
    assert.strictEqual(trilha, 2, `a navegação anterior não foi ligada à pessoa (${trilha})`);
    const atr = tenancy.comTenant({ tenantId: TA, userId: 't' }, () => captura.atribuicao(contato.id));
    assert.strictEqual(atr.first.utm.source, 'google', 'first touch errado');
    assert.strictEqual(atr.toques, 2);
  });

  await t('e2e: tracking com chave de conta inexistente é recusado', async () => {
    const r = await fetch(`${BASE}/growth/t?k=chave-inventada`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitante: 'v' }),
    });
    assert.strictEqual(r.status, 404);
  });

  await t('e2e: página de captura publica, renderiza o formulário e escapa o conteúdo', async () => {
    const pagId = tenancy.comTenant({ tenantId: TA, userId: 'staff' }, () => repo.inserir('gx_paginas', {
      slug: 'evento-2026', titulo: 'Seu evento no Lago Sul', template: 'captura', formulario_id: formId,
      blocos: [
        { tipo: 'titulo', texto: 'Casamentos <script>alert(1)</script>' },
        { tipo: 'texto', texto: 'Quatro casas, uma equipe.' },
        { tipo: 'botao', texto: 'Quero um orçamento', url: '#gxf' },
      ],
      seo: { descricao: 'Eventos no Lago Sul', indexavel: true },
      status: 'publicada', publicado_em: nowISO(),
    }));
    assert.ok(pagId);
    const r = await fetch(`${BASE}/growth/p/evento-2026`);
    const html = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(html.includes('Seu evento no Lago Sul'), 'título ausente');
    assert.ok(html.includes('Quatro casas, uma equipe.'), 'bloco de texto ausente');
    assert.ok(!html.includes('<script>alert(1)</script>'), 'XSS: o conteúdo do bloco não foi escapado');
    assert.ok(html.includes('&lt;script&gt;'), 'o texto deveria aparecer escapado');
    assert.ok(html.includes(formToken), 'o formulário não foi embutido');
    assert.ok(html.includes('class="hp"'), 'a armadilha de bot não está na página');
  });

  await t('e2e: página não publicada devolve 404', async () => {
    tenancy.comTenant({ tenantId: TA, userId: 'staff' }, () => repo.inserir('gx_paginas', {
      slug: 'rascunho-x', titulo: 'Rascunho', status: 'rascunho',
    }));
    const r = await fetch(`${BASE}/growth/p/rascunho-x`);
    assert.strictEqual(r.status, 404);
  });

  await t('e2e: a conta B não enxerga formulário, resposta nem página da conta A', async () => {
    const f = await req('GET', `/staff/api/growth/contas/${TB}/formularios`);
    assert.strictEqual(f.status, 200);
    assert.ok(!f.dados.some((x) => x.id === formId), 'formulário de A apareceu em B');
    const r = await req('GET', `/staff/api/growth/contas/${TB}/formularios/${formId}/respostas`);
    assert.ok(!r.dados.length, 'respostas de A apareceram em B');
  });

  await t('e2e: administração vê as duplicatas prováveis e o painel LGPD da conta', async () => {
    const d = await req('GET', `/staff/api/growth/contas/${TA}/duplicatas`);
    assert.strictEqual(d.status, 200);
    const l = await req('GET', `/staff/api/growth/contas/${TA}/lgpd`);
    assert.strictEqual(l.status, 200);
    assert.ok(l.dados.inventario.length >= 5, 'inventário de tratamentos vazio');
    assert.ok(l.dados.inventario.every((i) => i.finalidade), 'tratamento sem finalidade declarada');
  });

  await t('e2e: rajada da mesma origem é barrada com 429', async () => {
    let bloqueou = false;
    for (let i = 0; i < 12; i++) {
      const r = await postForm({ dados: { nome: 'Rajada ' + i, email: `rajada${i}@teste.com` }, consentimento: true });
      if (r.status === 429) { bloqueou = true; break; }
    }
    assert.ok(bloqueou, 'não houve limite por origem');
  });

  // ===================================================================
  // FLUXO E2E OBRIGATÓRIO 2 (§31 do PROMPT_MASTER)
  // mensagem chega por canal conectado → webhook validado → evento
  // deduplicado → conversa localizada → contato identificado → mensagem
  // em tempo real → responsável atribuído → resposta → tudo auditado
  // ===================================================================
  const chavePublica = db.prepare('SELECT webhook_token FROM crm_config WHERE tenant_id = ?').get(TA).webhook_token;
  const SESSAO = 'sess-e2e-chat';

  await t('e2e canal: visitante escreve no chat do site e a conversa nasce identificada', async () => {
    const r = await fetch(`${BASE}/growth/chat/${encodeURIComponent(chavePublica)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessao: SESSAO, texto: 'Quero alugar a Villa Kubitschek em dezembro',
        nome: 'Carlos Mendes', email: 'carlos@teste.com', url: 'https://villelastay.com.br/villa-kubitschek' }),
    });
    const d = await r.json();
    assert.strictEqual(r.status, 200, JSON.stringify(d));
    const conv = tenancy.comTenant({ tenantId: TA, userId: 't' }, () =>
      repo.um("SELECT * FROM gx_conversas WHERE tenant_id = :tenant AND chave_externa = :s", { s: SESSAO }));
    assert.ok(conv, 'conversa não foi criada');
    assert.strictEqual(conv.canal, 'chat_site');
    assert.ok(conv.contato_id, 'não identificou a pessoa');
    const contato = appRepo.Contatos.obter(TA, conv.contato_id);
    assert.strictEqual(contato.email, 'carlos@teste.com');
  });

  await t('e2e canal: o payload bruto fica guardado para auditoria', async () => {
    const bruto = db.prepare("SELECT * FROM gx_webhook_eventos WHERE integracao = 'chat_site' ORDER BY recebido_em DESC LIMIT 1").get();
    assert.ok(bruto, 'payload bruto não foi preservado');
    assert.strictEqual(bruto.assinatura_ok, 1);
    assert.ok(bruto.processado_em, 'não marcou como processado');
    assert.ok(/Villa Kubitschek/.test(bruto.payload), 'o payload guardado não bate com o recebido');
  });

  await t('e2e canal: reenvio idêntico é deduplicado antes de virar mensagem', async () => {
    const antes = db.prepare("SELECT COUNT(*) AS n FROM gx_webhook_eventos WHERE integracao = 'chat_site'").get().n;
    await fetch(`${BASE}/growth/chat/${encodeURIComponent(chavePublica)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessao: SESSAO, texto: 'Quero alugar a Villa Kubitschek em dezembro',
        nome: 'Carlos Mendes', email: 'carlos@teste.com', url: 'https://villelastay.com.br/villa-kubitschek' }),
    });
    const depois = db.prepare("SELECT COUNT(*) AS n FROM gx_webhook_eventos WHERE integracao = 'chat_site'").get().n;
    assert.strictEqual(depois, antes, 'o mesmo payload entrou duas vezes');
  });

  await t('e2e canal: atendimento responde e a entrega é processada pela fila', async () => {
    const conv = tenancy.comTenant({ tenantId: TA, userId: 't' }, () =>
      repo.um("SELECT * FROM gx_conversas WHERE tenant_id = :tenant AND chave_externa = :s", { s: SESSAO }));
    const at = await req('POST', `/staff/api/growth/contas/${TA}/inbox/${conv.id}/atribuir`, { corpo: { paraUsuario: 'adm' } });
    assert.strictEqual(at.status, 200);
    const rp = await req('POST', `/staff/api/growth/contas/${TA}/inbox/${conv.id}/responder`, {
      corpo: { texto: 'Oi Carlos! Dezembro tem disponibilidade sim.' },
    });
    assert.strictEqual(rp.status, 200, JSON.stringify(rp.dados));
    // a entrega é job: roda o worker e confere o desfecho
    const r = tenancy.comoPlataforma({ userId: 'w', motivo: 'teste' }, () => fila.processarLote(20));
    await (r && r.then ? r : Promise.resolve(r));
    const msg = db.prepare("SELECT * FROM gx_mensagens WHERE conversa_id = ? AND direcao = 'saida' ORDER BY criado_em DESC LIMIT 1").get(conv.id);
    assert.ok(['enviada', 'entregue'].includes(msg.status), `mensagem ficou em ${msg.status}: ${msg.erro}`);
    assert.ok(msg.externa_id.startsWith('site:'), 'o conector não devolveu o id externo');
  });

  await t('e2e canal: o visitante vê a resposta e NÃO vê a nota interna', async () => {
    const conv = tenancy.comTenant({ tenantId: TA, userId: 't' }, () =>
      repo.um("SELECT * FROM gx_conversas WHERE tenant_id = :tenant AND chave_externa = :s", { s: SESSAO }));
    await req('POST', `/staff/api/growth/contas/${TA}/inbox/${conv.id}/responder`, {
      corpo: { texto: 'SEGREDO INTERNO: cliente veio da campanha X', interna: true },
    });
    const r = await fetch(`${BASE}/growth/chat/${encodeURIComponent(chavePublica)}/${SESSAO}`);
    const d = await r.json();
    assert.strictEqual(r.status, 200);
    assert.ok(d.mensagens.some((m) => m.de === 'voce' && /Villa Kubitschek/.test(m.texto)), 'faltou a mensagem do visitante');
    assert.ok(d.mensagens.some((m) => m.de === 'atendimento' && /disponibilidade/.test(m.texto)), 'faltou a resposta');
    assert.ok(!JSON.stringify(d).includes('SEGREDO INTERNO'), 'a nota interna vazou para o visitante');
  });

  await t('e2e canal: sessão de outro visitante não devolve conversa alheia', async () => {
    const r = await fetch(`${BASE}/growth/chat/${encodeURIComponent(chavePublica)}/sess-de-outro`);
    const d = await r.json();
    assert.strictEqual(d.mensagens.length, 0);
    assert.strictEqual(d.status, 'nova');
  });

  await t('e2e canal: chave de conta inválida não abre conversa', async () => {
    const r = await fetch(`${BASE}/growth/chat/chave-falsa`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessao: 'x', texto: 'oi' }),
    });
    assert.strictEqual(r.status, 404);
  });

  await t('e2e canal: webhook do WhatsApp é RECUSADO enquanto a assinatura não é verificável', async () => {
    delete process.env.WHATSAPP_MOCK;
    const r = await canais.receberWebhook({
      integracao: 'whatsapp_cloud', tenantId: TA,
      corpo: { mensagens: [{ de: '5561955554444', texto: 'oi', id: 'wamid-1', nome: 'Teste' }] },
    });
    assert.strictEqual(r.ok, false, 'aceitou webhook sem verificar assinatura');
    assert.strictEqual(r.recusado, 'assinatura');
    const conv = tenancy.comTenant({ tenantId: TA, userId: 't' }, () =>
      repo.um("SELECT * FROM gx_conversas WHERE tenant_id = :tenant AND chave_externa = '5561955554444'"));
    assert.strictEqual(conv, null, 'a mensagem entrou no domínio mesmo sem assinatura válida');
    const bruto = db.prepare("SELECT * FROM gx_webhook_eventos WHERE integracao = 'whatsapp_cloud' ORDER BY recebido_em DESC LIMIT 1").get();
    assert.ok(bruto && bruto.assinatura_ok === 0 && bruto.erro, 'o descarte não ficou registrado com o motivo');
  });

  await t('e2e canal: com o mock ligado, o pipeline do WhatsApp roda ponta a ponta', async () => {
    process.env.WHATSAPP_MOCK = '1';
    const r = await canais.receberWebhook({
      integracao: 'whatsapp_cloud', tenantId: TA,
      corpo: { mensagens: [{ de: '+55 61 95555-4444', texto: 'Vi o anúncio de vocês', id: 'wamid-2', nome: 'Rita' }] },
    });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.mensagens, 1);
    const conv = tenancy.comTenant({ tenantId: TA, userId: 't' }, () =>
      repo.um("SELECT * FROM gx_conversas WHERE tenant_id = :tenant AND canal = 'whatsapp' AND chave_externa = '5561955554444'"));
    assert.ok(conv, 'conversa do WhatsApp não foi criada');
    assert.ok(conv.contato_id, 'não identificou a pessoa pelo número');
    delete process.env.WHATSAPP_MOCK;
  });

  await t('e2e canal: o painel de canais informa o que cada conta PODE fazer', async () => {
    const r = await req('GET', `/staff/api/growth/contas/${TA}/canais`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.dados.capacidades.chat_site.capacidades.canReplyMessages, true, 'o chat do site deveria poder responder');
    assert.strictEqual(r.dados.capacidades.whatsapp_cloud.conectado, false, 'WhatsApp não está conectado e não pode dizer que está');
    const wa = r.dados.disponiveis.find((i) => i.chave === 'whatsapp_cloud');
    assert.strictEqual(wa.operacional, false);
    assert.ok(!Object.values(wa.capacidades).some(Boolean), 'WhatsApp declarou capacidade sem aprovação');
  });

  await t('e2e canal: a inbox lista a conversa com SLA e fila', async () => {
    const r = await req('GET', `/staff/api/growth/contas/${TA}/inbox?status=aberta`);
    assert.strictEqual(r.status, 200);
    assert.ok(r.dados.conversas.length >= 1, 'a inbox veio vazia');
    assert.ok(r.dados.filas.length >= 1, 'nenhuma fila');
    assert.ok(Array.isArray(r.dados.sla_em_risco));
  });

  await t('rotas: correlation id volta no cabeçalho', async () => {
    const r = await fetch(`${BASE}/staff/api/growth/panorama`, { headers: { 'x-test-user': 'adm' } });
    assert.ok(r.headers.get('x-correlation-id'), 'sem X-Correlation-Id');
  });

  // ------------------------------------------------------------ fecho
  growth.pararWorker();
  servidor.close();

  console.log(`\n${'='.repeat(64)}`);
  if (falhas.length) {
    console.log(`❌ Villela Growth OS — Etapas 1 a 3: ${ok} passaram, ${falhas.length} FALHARAM\n`);
    for (const f of falhas) console.log('  ✗ ' + f);
    console.log('');
    process.exit(1);
  }
  console.log(`✅ Villela Growth OS — Etapas 1 a 3: ${ok} testes passaram.`);
  console.log(`   Isolamento entre contas verificado em ${[...TABELAS_TENANT].filter(t => t.startsWith('gx_')).length} tabelas.\n`);
  process.exit(0);
});
