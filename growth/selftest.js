// =====================================================================
// Villela Growth OS — suíte da Etapa 1.  npm run test:growth
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
const { tenancy, repo, rbac, contas, sessao, entitlements, eventos, fila, aprovacoes, incidentes, segredos, conectores } = growth;
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
// 13. ROTAS DE ADMINISTRAÇÃO
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
    assert.strictEqual(wa.status, 'planejada');
    assert.strictEqual(wa.documentacao_conferida, false);
    assert.ok(wa.bloqueio.length > 0, 'não diz o que falta');
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

  await t('rotas: correlation id volta no cabeçalho', async () => {
    const r = await fetch(`${BASE}/staff/api/growth/panorama`, { headers: { 'x-test-user': 'adm' } });
    assert.ok(r.headers.get('x-correlation-id'), 'sem X-Correlation-Id');
  });

  // ------------------------------------------------------------ fecho
  growth.pararWorker();
  servidor.close();

  console.log(`\n${'='.repeat(64)}`);
  if (falhas.length) {
    console.log(`❌ Villela Growth OS — Etapa 1: ${ok} passaram, ${falhas.length} FALHARAM\n`);
    for (const f of falhas) console.log('  ✗ ' + f);
    console.log('');
    process.exit(1);
  }
  console.log(`✅ Villela Growth OS — Etapa 1: ${ok} testes passaram.`);
  console.log(`   Isolamento entre contas verificado em ${[...TABELAS_TENANT].filter(t => t.startsWith('gx_')).length} tabelas.\n`);
  process.exit(0);
});
