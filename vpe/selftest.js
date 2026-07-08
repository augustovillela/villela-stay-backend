// =====================================================================
// Villela Projects & Events — SUÍTE DE TESTES (Fase 1).
// App Express real + banco novo em diretório temporário; rotas HTTP de
// verdade (cookies). Prioridade nº 1: isolamento entre tenants.
//   node vpe/selftest.js      (ou: npm run test:vpe)
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'vpe-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const express = require('express');
const cookieParser = require('cookie-parser');

const STAFF = [
  { id: 'adm', nome: 'Admin Villela', email: 'adm@t', papel: 'admin', areas: ['*'], ativo: true },
  { id: 'ceo', nome: 'CEO Área', email: 'ceo@t', papel: 'membro', areas: ['ceo'], ativo: true },
  { id: 'fora', nome: 'Sem Acesso', email: 'fora@t', papel: 'membro', areas: ['vendas'], ativo: true },
];
function requireAuth(req, res, next) {
  const u = STAFF.find(x => x.id === (req.headers['x-test-user'] || 'adm'));
  if (!u) return res.status(401).json({ erro: 'não autenticado' });
  req.user = u; next();
}
const requireAdmin = (req, res, next) => (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'apenas admin' });
const alertas = [];
const emails = [];

const app = express();
app.use(cookieParser());
require('./index').montar(app, {
  express, requireAuth, requireAdmin,
  alertaAugusto: async (m) => alertas.push(m),
  enviarEmail: async (to, ass) => { emails.push({ to, ass }); return true; },
  jwtSecret: 'segredo-teste',
});

let BASE = '', ok = 0;
const falhas = [];
const jars = {};
async function req(metodo, caminho, { body, jar, staff } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (jar && jars[jar]) headers.Cookie = jars[jar];
  if (staff) headers['x-test-user'] = staff;
  const r = await fetch(BASE + caminho, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined });
  const setCookie = r.headers.get('set-cookie');
  if (jar && setCookie) jars[jar] = setCookie.split(';')[0];
  let dados = {};
  try { dados = await r.json(); } catch (_) {}
  return { status: r.status, dados };
}
function teste(nome, cond) {
  if (cond) { ok++; return; }
  falhas.push(nome);
  console.error('  ✗ FALHOU:', nome);
}

(async () => {
  const srv = app.listen(0);
  BASE = `http://127.0.0.1:${srv.address().port}`;
  const repo = require('./repo');

  // ---------- páginas públicas ----------
  for (const p of ['/vpe', '/vpe/cadastro', '/vpe/login']) {
    const r = await fetch(BASE + p);
    teste(`página ${p} responde 200 html`, r.status === 200 && (r.headers.get('content-type') || '').includes('text/html'));
  }

  // ---------- cadastro / login ----------
  let r = await req('POST', '/vpe/api/cadastro', { body: { empresa: 'Eventos Alfa', nome: 'Ana', email: 'ana@alfa.com', senha: 'senha1234' }, jar: 'anaA' });
  teste('cadastro tenant A (trial)', r.status === 200 && r.dados.tenant.slug === 'eventos-alfa');
  r = await req('POST', '/vpe/api/cadastro', { body: { empresa: 'Construtora Beta', nome: 'Bob', email: 'bob@beta.com', senha: 'senha1234' }, jar: 'bobB' });
  teste('cadastro tenant B', r.status === 200);
  r = await req('GET', '/vpe/api/me', { jar: 'anaA' });
  const tenantA = r.dados.tenant;
  teste('me: dono com todas as permissões e enums', r.dados.papel === 'dono' && r.dados.permissoes.administrar_cobranca === true && Array.isArray(r.dados.enums.estagios));
  r = await req('GET', '/vpe/api/me', { jar: 'bobB' });
  const tenantB = r.dados.tenant;
  teste('tenants distintos', tenantA.id !== tenantB.id);
  r = await req('POST', '/vpe/api/login', { body: { email: 'ana@alfa.com', senha: 'errada99' } });
  teste('login errado → 401', r.status === 401);
  r = await req('GET', '/vpe/api/dashboard', {});
  teste('dashboard sem sessão → 401', r.status === 401);

  // ---------- portfólio ----------
  r = await req('POST', '/vpe/api/projetos', { body: { nome: 'Food bike de brunch', categoria: 'gastronomia', estagio: 'ideia', prioridade: 'alta', investimento_estimado: 1500000, receita_potencial: 12000000, proximos_passos: 'Validar cardápio' }, jar: 'anaA' });
  teste('projeto criado', r.status === 200 && r.dados.projeto.estagio === 'ideia');
  const projA = r.dados.projeto.id;
  r = await req('PATCH', '/vpe/api/projetos/' + projA, { body: { estagio: 'viabilidade', viabilidade: 70 }, jar: 'anaA' });
  teste('mudança de estágio registrada', r.status === 200 && r.dados.projeto.estagio === 'viabilidade' && r.dados.projeto.viabilidade === 70);
  r = await req('GET', '/vpe/api/auditoria', { jar: 'anaA' });
  teste('auditoria tem projeto.mudar_estagio', r.dados.eventos.some(e => e.acao === 'projeto.mudar_estagio'));
  r = await req('GET', '/vpe/api/projetos?estagio=viabilidade', { jar: 'anaA' });
  teste('filtro por estágio', r.dados.projetos.some(p => p.id === projA));

  // ---------- ISOLAMENTO ----------
  r = await req('GET', '/vpe/api/projetos', { jar: 'bobB' });
  teste('B não vê projetos de A', r.status === 200 && !r.dados.projetos.some(p => p.id === projA));
  r = await req('GET', '/vpe/api/projetos/' + projA, { jar: 'bobB' });
  teste('B não abre projeto de A (anti-IDOR)', r.status === 400 || r.status === 404);
  r = await req('PATCH', '/vpe/api/projetos/' + projA, { body: { nome: 'hack' }, jar: 'bobB' });
  teste('B não edita projeto de A', r.status === 400 || r.status === 403 || r.status === 404);
  r = await req('POST', '/vpe/api/trocar-tenant', { body: { tenant_id: tenantA.id }, jar: 'bobB' });
  teste('B não troca para tenant A', r.status === 400 || r.status === 403);
  r = await req('GET', '/vpe/api/usuarios', { jar: 'bobB' });
  teste('usuários de B não contêm A', r.status === 200 && !r.dados.usuarios.some(u => u.email.endsWith('@alfa.com')));

  // ---------- convites + RBAC ----------
  r = await req('POST', '/vpe/api/convites', { body: { email: 'carla@alfa.com', papel: 'comercial' }, jar: 'anaA' });
  teste('convite criado com link e e-mail', r.status === 200 && /\/vpe\/convite\//.test(r.dados.link) && emails.length >= 1);
  const token = r.dados.link.split('/convite/')[1];
  r = await req('POST', '/vpe/api/convites', { body: { email: 'x@alfa.com', papel: 'dono' }, jar: 'anaA' });
  teste('convite não concede dono', r.status === 400);
  r = await req('POST', '/vpe/api/convites/aceitar', { body: { token, nome: 'Carla', senha: 'senha1234' }, jar: 'carlaA' });
  teste('aceite loga a Carla', r.status === 200);
  r = await req('POST', '/vpe/api/convites/aceitar', { body: { token, nome: 'Eve', senha: 'senha1234' } });
  teste('token de convite é uso único', r.status === 400);
  r = await req('GET', '/vpe/api/me', { jar: 'carlaA' });
  teste('Carla é comercial (gerir_crm sim, criar_projeto não)', r.dados.permissoes.gerir_crm === true && !r.dados.permissoes.criar_projeto);
  r = await req('POST', '/vpe/api/projetos', { body: { nome: 'x' }, jar: 'carlaA' });
  teste('comercial não cria projeto (403)', r.status === 403);
  r = await req('PATCH', '/vpe/api/projetos/' + projA, { body: { status: 'arquivado' }, jar: 'carlaA' });
  teste('arquivar exige decidir_projeto', r.status === 403);
  r = await req('GET', '/vpe/api/auditoria', { jar: 'carlaA' });
  teste('comercial não vê auditoria', r.status === 403);

  // ---------- papéis custom + dono protegido ----------
  r = await req('POST', '/vpe/api/papeis', { body: { nome: 'Estagiário', permissoes: ['ver_projetos', 'chave_falsa'] }, jar: 'anaA' });
  teste('papel custom criado (inválidas filtradas)', r.status === 200);
  const roleId = r.dados.id;
  const usuariosA = (await req('GET', '/vpe/api/usuarios', { jar: 'anaA' })).dados.usuarios;
  const vincCarla = usuariosA.find(u => u.email === 'carla@alfa.com').vinculo_id;
  r = await req('PATCH', '/vpe/api/usuarios/' + vincCarla, { body: { papel: 'custom:' + roleId }, jar: 'anaA' });
  teste('Carla assume papel custom', r.status === 200);
  r = await req('GET', '/vpe/api/me', { jar: 'carlaA' });
  teste('papel custom vale (ver_projetos sim, gerir_crm não)', r.dados.permissoes.ver_projetos === true && !r.dados.permissoes.gerir_crm);
  r = await req('DELETE', '/vpe/api/papeis/' + roleId, { jar: 'anaA' });
  teste('papel em uso não é excluído', r.status === 400);
  const vincAna = usuariosA.find(u => u.email === 'ana@alfa.com').vinculo_id;
  r = await req('PATCH', '/vpe/api/usuarios/' + vincAna, { body: { status: 'suspenso' }, jar: 'anaA' });
  teste('último dono não pode ser suspenso', r.status === 400);

  // ---------- limites do plano ----------
  const staffAtor = { id: 'adm', nome: 'Admin Villela' };
  repo.administrarTenant(tenantB.id, { plano_slug: 'starter' }, staffAtor, 'teste'); // 15 projetos
  for (let i = 0; i < 15; i++) repo.criarProjeto(tenantB.id, { nome: 'P' + i }, staffAtor, 'teste');
  let estourou = false;
  try { repo.criarProjeto(tenantB.id, { nome: 'P16' }, staffAtor, 'teste'); }
  catch (e) { estourou = /Limite do plano/.test(e.message); }
  teste('limite de projetos do Starter bloqueia o 16º', estourou);

  // ---------- SEED INTERNO VILLELA (16 projetos) ----------
  r = await req('POST', '/staff/api/vpe/semear-interno', { body: {}, staff: 'ceo' });
  teste('seed interno exige admin (ceo → 403)', r.status === 403);
  r = await req('POST', '/staff/api/vpe/semear-interno', { body: {}, staff: 'adm' });
  teste('seed interno cria tenant + 16 projetos + senha inicial', r.status === 200 && r.dados.projetos_criados === 16 && /^Villela-/.test(r.dados.senha_inicial));
  const senhaInterna = r.dados.senha_inicial;
  r = await req('POST', '/staff/api/vpe/semear-interno', { body: {}, staff: 'adm' });
  teste('seed é idempotente (0 novos, sem nova senha)', r.status === 200 && r.dados.projetos_criados === 0 && !r.dados.senha_inicial);
  // dono interno loga e vê os 16
  r = await req('POST', '/vpe/api/login', { body: { email: 'augusto.villela@gmail.com', senha: senhaInterna }, jar: 'gus' });
  teste('dono do workspace interno loga', r.status === 200);
  r = await req('GET', '/vpe/api/projetos', { jar: 'gus' });
  teste('workspace interno tem os 16 projetos', r.dados.projetos.length === 16 && r.dados.projetos.some(p => p.nome.includes('Villela Stay')));
  r = await req('GET', '/vpe/api/dashboard', { jar: 'gus' });
  teste('dashboard interno marca interno=true e soma estágios', r.dados.empresa.interno === true && r.dados.projetos_total === 16);
  // interno não trava por limite (enterprise + flag interno) e não pode ser suspenso
  let travou = false;
  try { for (let i = 0; i < 5; i++) repo.criarProjeto(repo.tenantPorSlug('villela-interno').id, { nome: 'Extra ' + i }, staffAtor, 'teste'); } catch (_) { travou = true; }
  teste('workspace interno não trava por limite', !travou);
  r = await req('PATCH', '/staff/api/vpe/tenants/' + repo.tenantPorSlug('villela-interno').id, { body: { status: 'suspensa' }, staff: 'adm' });
  teste('workspace interno não pode ser suspenso', r.status === 400);
  // isolamento também vale p/ o interno
  r = await req('GET', '/vpe/api/projetos', { jar: 'anaA' });
  teste('tenant A não vê projetos internos da Villela', !r.dados.projetos.some(p => p.nome.includes('Villela Stay')));

  // ================== FASE 2: portfólio avançado ==================
  // plano de negócio com versões
  r = await req('PUT', '/vpe/api/projetos/' + projA + '/plano', { body: { secoes: { resumo: 'Food bike de brunch para eventos e hospedagens.', modelo_receita: 'Venda por evento + assinatura mensal p/ pousadas.' } }, jar: 'anaA' });
  teste('plano salvo gera v1 e completude', r.status === 200 && r.dados.plano.versao === 1 && r.dados.completude > 0);
  r = await req('PUT', '/vpe/api/projetos/' + projA + '/plano', { body: { secoes: { swot: 'F: mobilidade. O: eventos. F: clima. A: concorrência.' }, status: 'em_analise' }, jar: 'anaA' });
  teste('2º salvamento vira v2, mescla seções e muda status', r.dados.plano.versao === 2 && r.dados.plano.status === 'em_analise' && r.dados.secoes.resumo.includes('Food bike'));
  r = await req('GET', '/vpe/api/projetos/' + projA + '/plano/versoes', { jar: 'anaA' });
  teste('lista de versões tem 2', r.dados.versoes.length === 2);
  r = await req('GET', '/vpe/api/projetos/' + projA + '/plano/versoes/1', { jar: 'anaA' });
  teste('snapshot v1 não tem o SWOT', r.status === 200 && !r.dados.secoes.swot);
  r = await req('PUT', '/vpe/api/projetos/' + projA + '/plano', { body: { secoes: { resumo: 'hack' } }, jar: 'carlaA' });
  teste('papel custom sem editar_projeto não salva plano', r.status === 403);
  r = await req('GET', '/vpe/api/projetos/' + projA + '/plano', { jar: 'bobB' });
  teste('B não lê plano de A (anti-IDOR)', r.status === 400 || r.status === 404);

  // viabilidade guiada → espelha em projects.viabilidade
  r = await req('PUT', '/vpe/api/projetos/' + projA + '/viabilidade', { body: { criterios: { potencial_mercado: 8, sinergia: 9, investimento: 7, margem: 8 }, observacoes: 'Forte sinergia com hospedagem.' }, jar: 'anaA' });
  teste('score = média×10 dos preenchidos (8)', r.status === 200 && r.dados.score === 80);
  r = await req('GET', '/vpe/api/projetos/' + projA, { jar: 'anaA' });
  teste('projects.viabilidade espelhado', r.dados.projeto.viabilidade === 80);
  r = await req('PUT', '/vpe/api/projetos/' + projA + '/viabilidade', { body: { criterios: { risco_regulatorio: 15 } }, jar: 'anaA' });
  teste('nota é limitada a 0-10', r.dados.criterios.risco_regulatorio === 10);

  // decisões (governança)
  r = await req('POST', '/vpe/api/projetos/' + projA + '/decisoes', { body: { decisao: 'avancar' }, jar: 'anaA' });
  teste('decisão sem justificativa é recusada', r.status === 400);
  r = await req('POST', '/vpe/api/projetos/' + projA + '/decisoes', { body: { decisao: 'avancar', justificativa: 'Score 80 e sinergia alta — seguir para plano completo.' }, jar: 'anaA' });
  teste('decisão avançar registrada', r.status === 200 && r.dados.decisoes[0].decisao === 'avancar');
  r = await req('POST', '/vpe/api/projetos/' + projA + '/decisoes', { body: { decisao: 'pausar', justificativa: 'Aguardar alta temporada.' }, jar: 'anaA' });
  teste('decisão pausar aplica status no projeto', r.status === 200);
  r = await req('GET', '/vpe/api/projetos/' + projA, { jar: 'anaA' });
  teste('projeto ficou pausado', r.dados.projeto.status === 'pausado');
  r = await req('POST', '/vpe/api/projetos/' + projA + '/decisoes', { body: { decisao: 'retomar', justificativa: 'Temporada chegou.' }, jar: 'anaA' });
  r = await req('GET', '/vpe/api/projetos/' + projA, { jar: 'anaA' });
  teste('retomar volta a ativo', r.dados.projeto.status === 'ativo');
  r = await req('POST', '/vpe/api/projetos/' + projA + '/decisoes', { body: { decisao: 'pausar', justificativa: 'x' }, jar: 'carlaA' });
  teste('decisão exige decidir_projeto (custom sem ela → 403)', r.status === 403);

  // ranking / matriz
  r = await req('GET', '/vpe/api/portfolio/ranking', { jar: 'anaA' });
  teste('ranking ordena por score composto e marca quadrante+plano', r.status === 200 && r.dados.ranking.length >= 1 &&
    r.dados.ranking[0].score_composto >= (r.dados.ranking[1] ? r.dados.ranking[1].score_composto : 0) &&
    r.dados.ranking.find(x => x.id === projA).tem_plano === true && ['ganho_rapido', 'aposta_grande', 'tarefa_menor', 'reavaliar'].includes(r.dados.ranking[0].quadrante));
  r = await req('GET', '/vpe/api/portfolio/ranking', { jar: 'bobB' });
  teste('ranking de B não contém projA', !r.dados.ranking.some(x => x.id === projA));

  // ================== FASE 3: execução (tarefas, checklists, riscos) ==================
  // criar tarefa exige gerir_tarefas; comercial (Carla, papel custom sem ela) não pode
  r = await req('POST', '/vpe/api/projetos/' + projA + '/tarefas', { body: { titulo: 'Testar cardápio' }, jar: 'carlaA' });
  teste('papel sem gerir_tarefas não cria tarefa', r.status === 403);
  r = await req('POST', '/vpe/api/projetos/' + projA + '/tarefas', { body: { titulo: 'Comprar a food bike', prioridade: 'alta', prazo: '2020-01-01' }, jar: 'anaA' });
  teste('tarefa criada', r.status === 200 && r.dados.tarefa.status === 'pendente');
  const tA = r.dados.tarefa.id;
  r = await req('GET', '/vpe/api/tarefas', { jar: 'anaA' });
  const tObj = r.dados.tarefas.find(x => x.id === tA);
  teste('tarefa com prazo passado vem marcada atrasada (derivado)', tObj && tObj.atrasada === true);
  // dependência trava conclusão
  r = await req('POST', '/vpe/api/projetos/' + projA + '/tarefas', { body: { titulo: 'Montar operação', dependencia_de: tA }, jar: 'anaA' });
  const tDep = r.dados.tarefa.id;
  r = await req('PATCH', '/vpe/api/tarefas/' + tDep, { body: { status: 'concluida' }, jar: 'anaA' });
  teste('conclusão travada por dependência aberta', r.status === 400 && /dependência/i.test(r.dados.erro));
  r = await req('PATCH', '/vpe/api/tarefas/' + tA, { body: { status: 'concluida' }, jar: 'anaA' });
  teste('concluir a dependência registra concluida_em', r.status === 200 && r.dados.tarefa.concluida_em);
  r = await req('PATCH', '/vpe/api/tarefas/' + tDep, { body: { status: 'concluida' }, jar: 'anaA' });
  teste('agora a dependente conclui', r.status === 200 && r.dados.tarefa.status === 'concluida');
  // subtarefa (2 níveis; 3º recusado)
  r = await req('POST', '/vpe/api/projetos/' + projA + '/tarefas', { body: { titulo: 'Sub 1', parent_id: tDep }, jar: 'anaA' });
  teste('subtarefa criada', r.status === 200);
  const sub = r.dados.tarefa.id;
  r = await req('POST', '/vpe/api/projetos/' + projA + '/tarefas', { body: { titulo: 'Sub da sub', parent_id: sub }, jar: 'anaA' });
  teste('subtarefa de subtarefa é recusada (máx 2 níveis)', r.status === 400);
  // checklist sanitizado
  r = await req('PATCH', '/vpe/api/tarefas/' + tDep, { body: { checklist: [{ t: 'Alugar espaço', feito: true }, { t: '', feito: false }, { t: 'Contratar chef' }] }, jar: 'anaA' });
  teste('checklist descarta itens vazios e normaliza', r.status === 200 && r.dados.tarefa.checklist.length === 2 && r.dados.tarefa.checklist[0].feito === true);
  // responsável precisa ser do tenant
  r = await req('PATCH', '/vpe/api/tarefas/' + tDep, { body: { responsavel_id: 'bob-fake' }, jar: 'anaA' });
  teste('responsável fora da empresa recusado', r.status === 400);
  // kanban
  r = await req('GET', '/vpe/api/projetos/' + projA + '/kanban', { jar: 'anaA' });
  teste('kanban agrupa por status', r.status === 200 && Array.isArray(r.dados.colunas.concluida) && r.dados.ordem_colunas.includes('em_andamento'));
  // agenda + resumo no dashboard
  r = await req('GET', '/vpe/api/tarefas/agenda?dias=30', { jar: 'anaA' });
  teste('agenda retorna dias agrupados', r.status === 200 && Array.isArray(r.dados.dias));
  r = await req('GET', '/vpe/api/dashboard', { jar: 'anaA' });
  teste('dashboard traz métricas de execução', typeof r.dados.tarefas_abertas === 'number' && typeof r.dados.tarefas_atrasadas === 'number' && typeof r.dados.riscos_criticos === 'number');

  // isolamento das tarefas
  r = await req('GET', '/vpe/api/tarefas/' + tDep, { jar: 'bobB' });
  teste('B não abre tarefa de A (anti-IDOR)', r.status === 400 || r.status === 404);
  r = await req('POST', '/vpe/api/projetos/' + projA + '/tarefas', { body: { titulo: 'hack' }, jar: 'bobB' });
  teste('B não cria tarefa em projeto de A', r.status === 400 || r.status === 403 || r.status === 404);

  // riscos (probabilidade × impacto → severidade; exige editar_projeto)
  r = await req('POST', '/vpe/api/projetos/' + projA + '/riscos', { body: { descricao: 'Clima no dia do evento', probabilidade: 'alta', impacto: 'alto', plano_prevencao: 'Tenda reserva.' }, jar: 'anaA' });
  teste('risco criado', r.status === 200);
  r = await req('POST', '/vpe/api/projetos/' + projA + '/riscos', { body: { descricao: 'x' }, jar: 'carlaA' });
  teste('risco exige editar_projeto (403)', r.status === 403);
  r = await req('GET', '/vpe/api/projetos/' + projA + '/riscos', { jar: 'anaA' });
  const rk = r.dados.riscos[0];
  teste('risco alta×alto = severidade 9 e vem no topo', rk && rk.severidade === 9);
  r = await req('PATCH', '/vpe/api/riscos/' + rk.id, { body: { status: 'mitigado' }, jar: 'anaA' });
  teste('risco pode ser mitigado', r.status === 200);
  r = await req('GET', '/vpe/api/dashboard', { jar: 'anaA' });
  teste('risco mitigado não conta mais como crítico', r.dados.riscos_criticos === 0);

  // ================== FASE 4: eventos ==================
  // criar evento exige gerir_eventos; comercial (Carla, custom sem ela) não pode
  r = await req('POST', '/vpe/api/eventos', { body: { nome: 'Casamento teste' }, jar: 'carlaA' });
  teste('papel sem gerir_eventos não cria evento', r.status === 403);
  r = await req('POST', '/vpe/api/eventos', { body: { nome: 'Casamento na Casa Modernista', tipo: 'casamento', cliente_nome: 'Maria', data: '2026-12-20', convidados_previstos: 80, receita_centavos: 4000000, orcamento_centavos: 1500000, project_id: projA }, jar: 'anaA' });
  teste('evento criado (status lead) com vínculo a projeto', r.status === 200 && r.dados.evento.status === 'lead' && r.dados.evento.project_id === projA);
  const evA = r.dados.evento.id;
  r = await req('PATCH', '/vpe/api/eventos/' + evA, { body: { status: 'confirmado', briefing: { objetivo: 'Celebrar o casamento', alimentacao: 'Buffet completo + bar' } }, jar: 'anaA' });
  teste('mudança de status + briefing salvos', r.status === 200 && r.dados.evento.status === 'confirmado' && r.dados.evento.briefing.objetivo.includes('Celebrar'));
  r = await req('GET', '/vpe/api/auditoria', { jar: 'anaA' });
  teste('auditoria registra evento.mudar_status', r.dados.eventos.some(e => e.acao === 'evento.mudar_status'));

  // fornecedores (tenant) + alocação ao evento
  r = await req('POST', '/vpe/api/fornecedores', { body: { nome: 'Buffet Sabor & Arte', categoria: 'buffet', telefone: '61999990000' }, jar: 'anaA' });
  teste('fornecedor criado', r.status === 200);
  const supA = r.dados.id;
  r = await req('POST', '/vpe/api/fornecedores', { body: { nome: 'x' }, jar: 'carlaA' });
  teste('fornecedor exige gerir_fornecedores (403)', r.status === 403);
  r = await req('POST', '/vpe/api/eventos/' + evA + '/fornecedores', { body: { supplier_id: supA, valor_centavos: 900000, status: 'confirmado' }, jar: 'anaA' });
  teste('fornecedor alocado ao evento', r.status === 200);
  const alocA = r.dados.id;
  r = await req('GET', '/vpe/api/eventos/' + evA, { jar: 'anaA' });
  teste('financeiro consolida receita − custo evento − fornecedores', r.dados.evento.financeiro.custo_fornecedores === 900000 && r.dados.evento.financeiro.margem === 4000000 - 1500000 - 900000);
  // fornecedor bloqueado não aloca
  r = await req('PATCH', '/vpe/api/fornecedores/' + supA, { body: { bloqueado: true }, jar: 'anaA' });
  r = await req('POST', '/vpe/api/eventos/' + evA + '/fornecedores', { body: { supplier_id: supA }, jar: 'anaA' });
  teste('fornecedor bloqueado não pode ser alocado', r.status === 400);
  r = await req('PATCH', '/vpe/api/fornecedores/' + supA, { body: { bloqueado: false }, jar: 'anaA' });
  r = await req('DELETE', '/vpe/api/eventos-fornecedores/' + alocA, { jar: 'anaA' });
  teste('alocação removida', r.status === 200);

  // convidados: RSVP, acompanhantes e check-in
  r = await req('POST', '/vpe/api/eventos/' + evA + '/convidados', { body: { nome: 'João e família', acompanhantes: 3, restricao_alimentar: 'sem glúten' }, jar: 'anaA' });
  const gA = r.dados.id;
  r = await req('PATCH', '/vpe/api/convidados/' + gA, { body: { rsvp: 'confirmado' }, jar: 'anaA' });
  teste('RSVP confirmado', r.status === 200);
  r = await req('GET', '/vpe/api/eventos/' + evA, { jar: 'anaA' });
  teste('convidados contam titular + acompanhantes (4)', r.dados.evento.convidados.confirmados === 4);
  r = await req('PATCH', '/vpe/api/convidados/' + gA, { body: { checkin: true }, jar: 'anaA' });
  r = await req('GET', '/vpe/api/eventos/' + evA, { jar: 'anaA' });
  teste('check-in registrado', r.dados.evento.convidados.checkins === 1);

  // checklist e pós-evento
  r = await req('PATCH', '/vpe/api/eventos/' + evA, { body: { checklist: [{ t: 'Confirmar cardápio', feito: true }, { t: '', feito: false }, { t: 'Escala da equipe' }] }, jar: 'anaA' });
  teste('checklist do evento sanitizado', r.dados.evento.checklist.length === 2);
  r = await req('PATCH', '/vpe/api/eventos/' + evA, { body: { status: 'realizado', pos_evento: { avaliacao: 'Cliente muito satisfeito', depoimento: 'Melhor evento!' } }, jar: 'anaA' });
  teste('pós-evento salvo', r.status === 200 && r.dados.evento.pos_evento.avaliacao.includes('satisfeito'));

  // isolamento entre tenants
  r = await req('GET', '/vpe/api/eventos/' + evA, { jar: 'bobB' });
  teste('B não abre evento de A (anti-IDOR)', r.status === 400 || r.status === 404);
  r = await req('GET', '/vpe/api/eventos', { jar: 'bobB' });
  teste('lista de eventos de B não contém o de A', !r.dados.eventos.some(e => e.id === evA));
  r = await req('POST', '/vpe/api/eventos/' + evA + '/fornecedores', { body: { supplier_id: supA }, jar: 'bobB' });
  teste('B não aloca fornecedor no evento de A', r.status === 400 || r.status === 403 || r.status === 404);

  // limite de eventos do plano (tenant B no Starter: 5/mês)
  const staffAtor2 = { id: 'adm', nome: 'Admin Villela' };
  const eventosMod = require('./eventos');
  for (let i = 0; i < 5; i++) eventosMod.criarEvento(tenantB.id, { nome: 'Ev ' + i }, staffAtor2, 'teste');
  let estourouEv = false;
  try { eventosMod.criarEvento(tenantB.id, { nome: 'Ev6' }, staffAtor2, 'teste'); } catch (e) { estourouEv = /Limite do plano/.test(e.message); }
  teste('limite de eventos/mês do Starter bloqueia o 6º', estourouEv);

  // dashboard traz resumo de eventos
  r = await req('GET', '/vpe/api/dashboard', { jar: 'anaA' });
  teste('dashboard traz métricas de eventos', typeof r.dados.eventos_confirmados === 'number' && typeof r.dados.eventos_proximos_30d === 'number');

  // ================== FASE 5: comercial + financeiro ==================
  // CRM: deals no funil (exige gerir_crm). Carla é comercial? Não — virou papel custom sem gerir_crm.
  r = await req('POST', '/vpe/api/crm/deals', { body: { titulo: 'Casamento 200 pessoas', cliente_nome: 'Beatriz', valor_estimado_centavos: 5000000 }, jar: 'carlaA' });
  teste('papel sem gerir_crm não cria deal', r.status === 403);
  r = await req('POST', '/vpe/api/crm/deals', { body: { titulo: 'Casamento 200 pessoas', cliente_nome: 'Beatriz', empresa: '', valor_estimado_centavos: 5000000, probabilidade: 60 }, jar: 'anaA' });
  teste('deal criado (funil novo)', r.status === 200 && r.dados.deal.estagio === 'novo' && r.dados.deal.status === 'aberto');
  const dealA = r.dados.deal.id;
  r = await req('POST', '/vpe/api/crm/deals/' + dealA + '/notas', { body: { texto: 'Cliente pediu proposta com bar aberto.' }, jar: 'anaA' });
  teste('follow-up registrado', r.status === 200 && r.dados.deal.notas.length === 1);
  r = await req('PATCH', '/vpe/api/crm/deals/' + dealA, { body: { estagio: 'negociacao' }, jar: 'anaA' });
  teste('deal movido no funil', r.status === 200 && r.dados.deal.estagio === 'negociacao');
  r = await req('GET', '/vpe/api/crm/funil', { jar: 'anaA' });
  teste('funil agrupa por estágio com valor e taxa', r.status === 200 && r.dados.colunas.negociacao.deals.some(d => d.id === dealA) && typeof r.dados.taxa_conversao === 'number');
  // converter em evento (exige gerir_eventos além de gerir_crm)
  r = await req('POST', '/vpe/api/crm/deals/' + dealA + '/converter', { body: { alvo: 'evento' }, jar: 'anaA' });
  teste('deal convertido em evento', r.status === 200 && r.dados.event_id);
  const evConv = r.dados.event_id;
  r = await req('GET', '/vpe/api/crm/deals/' + dealA, { jar: 'anaA' });
  teste('deal marcado ganho após conversão', r.dados.deal.status === 'ganho' && r.dados.deal.event_id === evConv);
  // isolamento
  r = await req('GET', '/vpe/api/crm/deals/' + dealA, { jar: 'bobB' });
  teste('B não abre deal de A', r.status === 400 || r.status === 404);

  // Propostas: total = itens×qtd − desconto
  r = await req('POST', '/vpe/api/propostas', { body: { titulo: 'Proposta casamento', deal_id: dealA, itens: [{ descricao: 'Buffet', qtd: 200, preco_unit_centavos: 15000 }, { descricao: 'Decoração', qtd: 1, preco_unit_centavos: 800000 }], desconto_centavos: 300000 }, jar: 'anaA' });
  teste('proposta com total calculado', r.status === 200 && r.dados.proposta.total_centavos === (200 * 15000 + 800000 - 300000));
  const propA = r.dados.proposta.id;
  r = await req('POST', '/vpe/api/propostas', { body: { titulo: 'x' }, jar: 'carlaA' });
  teste('proposta exige gerir_propostas (403)', r.status === 403);
  r = await req('PATCH', '/vpe/api/propostas/' + propA, { body: { status: 'enviada', itens: [{ descricao: 'Item', qtd: 2, preco_unit_centavos: 5000 }], desconto_centavos: 0 }, jar: 'anaA' });
  teste('proposta atualizada recalcula total', r.status === 200 && r.dados.proposta.total_centavos === 10000 && r.dados.proposta.status === 'enviada');

  // Contratos: sempre minuta; salvar gera versão; aceite
  r = await req('POST', '/vpe/api/contratos', { body: { titulo: 'Contrato de evento', tipo: 'evento', event_id: evConv }, jar: 'anaA' });
  teste('contrato criado (minuta)', r.status === 200 && r.dados.contrato.minuta === true && r.dados.contrato.versao === 0);
  const contA = r.dados.contrato.id;
  r = await req('PATCH', '/vpe/api/contratos/' + contA, { body: { conteudo: 'CLÁUSULA 1...' }, jar: 'anaA' });
  teste('salvar conteúdo gera v1', r.status === 200 && r.dados.contrato.versao === 1);
  r = await req('PATCH', '/vpe/api/contratos/' + contA, { body: { conteudo: 'CLÁUSULA 1 revisada...' }, jar: 'anaA' });
  teste('novo conteúdo gera v2 (histórico)', r.dados.contrato.versao === 2 && r.dados.contrato.versoes.length === 2);
  r = await req('POST', '/vpe/api/contratos/' + contA + '/aceite', { body: { nome: 'Beatriz' }, jar: 'anaA' });
  teste('aceite registrado com data/nome', r.status === 200 && r.dados.contrato.status === 'aceito' && r.dados.contrato.aceite.nome === 'Beatriz');
  r = await req('GET', '/vpe/api/contratos/' + contA, { jar: 'bobB' });
  teste('B não abre contrato de A', r.status === 400 || r.status === 404);

  // Financeiro: receitas/despesas, consolidação, atrasado derivado
  r = await req('POST', '/vpe/api/financeiro', { body: { tipo: 'receita', descricao: 'Sinal do casamento', valor_centavos: 2000000, event_id: evConv, vencimento: '2020-01-01', status: 'pendente' }, jar: 'anaA' });
  teste('receita lançada', r.status === 200);
  const finA = r.dados.lancamento.id;
  r = await req('POST', '/vpe/api/financeiro', { body: { tipo: 'receita', descricao: 'x' }, jar: 'carlaA' });
  teste('financeiro exige lancar_financeiro (403)', r.status === 403);
  r = await req('POST', '/vpe/api/financeiro', { body: { tipo: 'despesa', descricao: 'Buffet', valor_centavos: 900000, event_id: evConv, status: 'pendente' }, jar: 'anaA' });
  r = await req('GET', '/vpe/api/financeiro?evento=' + evConv, { jar: 'anaA' });
  teste('consolidado do evento: a receber, a pagar, margem prevista', r.dados.consolidado.a_receber === 2000000 && r.dados.consolidado.a_pagar === 900000 && r.dados.consolidado.margem_prevista === 2000000 - 900000);
  teste('lançamento vencido vem marcado atrasado (derivado)', r.dados.lancamentos.find(l => l.id === finA).atrasado === true);
  teste('inadimplência conta a receita vencida', r.dados.consolidado.inadimplencia === 2000000);
  r = await req('PATCH', '/vpe/api/financeiro/' + finA, { body: { status: 'pago' }, jar: 'anaA' });
  teste('marcar pago registra liquidação e sai da inadimplência', r.status === 200 && r.dados.lancamento.status === 'pago' && r.dados.lancamento.liquidado_em);
  r = await req('GET', '/vpe/api/financeiro?evento=' + evConv, { jar: 'anaA' });
  teste('após pago: receita realizada sobe, inadimplência zera', r.dados.consolidado.receita_realizada === 2000000 && r.dados.consolidado.inadimplencia === 0);
  // ver_financeiro (auditor/financeiro) vê mas não lança
  r = await req('GET', '/vpe/api/financeiro', { jar: 'bobB' });
  teste('financeiro de B não vê lançamentos de A', r.status === 200 && !r.dados.lancamentos.some(l => l.id === finA));
  // dashboard com resumo financeiro
  r = await req('GET', '/vpe/api/dashboard', { jar: 'anaA' });
  teste('dashboard traz a_receber/a_pagar/inadimplência', typeof r.dados.a_receber === 'number' && typeof r.dados.a_pagar === 'number');

  // ================== FASE 6: IA + automações + relatório do CEO ==================
  const ia = require('./ia');
  ia.__mockParaTeste(async ({ schema }) => {
    if (schema) { const jr = { resposta: 'Com base nos dados, há projetos de alta prioridade a acompanhar.', nao_encontrado: false, nivel_confianca: 'alto' }; return { texto: JSON.stringify(jr), json: jr, modelo: 'mock-1', usage: { input_tokens: 120, output_tokens: 40 } }; }
    return { texto: 'RASCUNHO — análise executiva de teste com 3 recomendações.', json: null, modelo: 'mock-1', usage: { input_tokens: 90, output_tokens: 30 } };
  });

  // -- assistente (ancorado nos dados; consome ia_consultas) --
  r = await req('GET', '/vpe/api/ia/status', { jar: 'anaA' });
  teste('IA status: ativa (mock) + catálogo de agentes', r.status === 200 && r.dados.ativo === true && r.dados.agentes.length >= 6);
  r = await req('POST', '/vpe/api/ia/perguntar', { body: { escopo_tipo: 'geral', pergunta: 'Quais projetos de alta prioridade preciso acompanhar?' }, jar: 'anaA' });
  teste('assistente responde e abre conversa', r.status === 200 && r.dados.mensagem.conteudo && r.dados.conversation_id);
  const convA = r.dados.conversation_id;
  r = await req('POST', '/vpe/api/ia/perguntar', { body: { conversation_id: convA, escopo_tipo: 'geral', pergunta: 'E os riscos?' }, jar: 'anaA' });
  teste('acompanhamento na mesma conversa', r.status === 200 && r.dados.conversation_id === convA);
  r = await req('GET', '/vpe/api/ia/conversas', { jar: 'anaA' });
  teste('lista de conversas do usuário', r.status === 200 && r.dados.conversas.some(c => c.id === convA));
  r = await req('GET', '/vpe/api/ia/conversas/' + convA, { jar: 'anaA' });
  teste('conversa traz as mensagens (2 perguntas + 2 respostas)', r.status === 200 && r.dados.conversa.mensagens.length === 4);
  r = await req('POST', '/vpe/api/ia/perguntar', { body: { pergunta: 'x' }, jar: 'carlaA' });
  teste('assistente exige usar_ia (403)', r.status === 403);
  r = await req('GET', '/vpe/api/ia/conversas/' + convA, { jar: 'bobB' });
  teste('B não abre conversa de A', r.status === 400 || r.status === 404);

  // -- agentes especialistas --
  r = await req('POST', '/vpe/api/ia/agentes/executar', { body: { agente: 'resumo_executivo', escopo_tipo: 'geral' }, jar: 'anaA' });
  teste('agente resumo_executivo entrega rascunho', r.status === 200 && r.dados.resultado.saida.length > 10);
  r = await req('POST', '/vpe/api/ia/agentes/executar', { body: { agente: 'plano_negocio', escopo_ref: projA }, jar: 'anaA' });
  teste('agente de projeto carimba MINUTA', r.status === 200 && /MINUTA/.test(r.dados.resultado.saida) && r.dados.resultado.escopo_tipo === 'projeto');
  r = await req('POST', '/vpe/api/ia/agentes/executar', { body: { agente: 'agente_inexistente' }, jar: 'anaA' });
  teste('agente inexistente é rejeitado', r.status === 400);
  r = await req('POST', '/vpe/api/ia/agentes/executar', { body: { agente: 'plano_negocio', escopo_ref: projA }, jar: 'bobB' });
  teste('B não roda agente sobre projeto de A (anti-IDOR)', r.status === 400 || r.status === 404);
  r = await req('GET', '/vpe/api/ia/agentes', { jar: 'anaA' });
  teste('execuções de agente ficam registradas', r.status === 200 && r.dados.execucoes.length >= 2);

  // -- automações (gatilho → ação) --
  await req('POST', '/vpe/api/financeiro', { body: { tipo: 'receita', descricao: 'Parcela atrasada', valor_centavos: 500000, vencimento: '2020-05-01', status: 'pendente' }, jar: 'anaA' });
  r = await req('POST', '/vpe/api/automacoes', { body: { nome: 'Cobrar contas vencidas', gatilho: 'conta_vencendo', gatilho_config: { dias: 30 }, acao: 'notificar_augusto' }, jar: 'anaA' });
  teste('automação criada', r.status === 200 && r.dados.automacao.ativo === true);
  const autoA = r.dados.automacao.id;
  r = await req('POST', '/vpe/api/automacoes', { body: { nome: 'x', gatilho: 'foo', acao: 'registrar_log' }, jar: 'anaA' });
  teste('gatilho inválido rejeitado', r.status === 400);
  r = await req('POST', '/vpe/api/automacoes', { body: { nome: 'x', gatilho: 'tarefa_atrasada', acao: 'registrar_log' }, jar: 'carlaA' });
  teste('automação exige gerir_automacoes (403)', r.status === 403);
  const alertasAntes = alertas.length;
  r = await req('POST', '/vpe/api/automacoes/' + autoA + '/testar', { jar: 'anaA' });
  teste('testar (dry-run) mostra que dispararia sem notificar', r.status === 200 && r.dados.resultado.disparou === true && alertas.length === alertasAntes);
  r = await req('POST', '/vpe/api/automacoes/avaliar', { jar: 'anaA' });
  teste('avaliar dispara ação (WhatsApp ao dono)', r.status === 200 && r.dados.dispararam >= 1 && alertas.length > alertasAntes);
  r = await req('GET', '/vpe/api/automacoes/' + autoA, { jar: 'anaA' });
  teste('histórico da automação registra a execução', r.status === 200 && r.dados.historico.length >= 1 && r.dados.historico[0].disparou === true);
  // ação por e-mail
  const emailsAntes = emails.length;
  r = await req('POST', '/vpe/api/automacoes', { body: { nome: 'Alertar financeiro', gatilho: 'conta_vencendo', gatilho_config: { dias: 30 }, acao: 'alerta_email', acao_config: { email: 'financeiro@alfa.com' } }, jar: 'anaA' });
  await req('POST', '/vpe/api/automacoes/avaliar', { jar: 'anaA' });
  teste('ação alerta_email envia e-mail', emails.length > emailsAntes);
  r = await req('PATCH', '/vpe/api/automacoes/' + autoA, { body: { ativo: false }, jar: 'anaA' });
  teste('pausar automação', r.status === 200 && r.dados.automacao.ativo === false);
  r = await req('GET', '/vpe/api/automacoes', { jar: 'bobB' });
  teste('B não vê automações de A', r.status === 200 && !r.dados.automacoes.some(a => a.id === autoA));

  // -- relatório do CEO --
  r = await req('GET', '/vpe/api/ceo/relatorios', { jar: 'anaA' });
  teste('CEO: consolidação atual com números', r.status === 200 && typeof r.dados.atual.projetos_total === 'number' && typeof r.dados.atual.a_receber === 'number');
  r = await req('POST', '/vpe/api/ceo/relatorios/gerar', { body: {}, jar: 'anaA' });
  teste('gerar relatório do CEO com narrativa (IA)', r.status === 200 && r.dados.relatorio.narrativa && r.dados.relatorio.data);
  r = await req('POST', '/vpe/api/ceo/relatorios/gerar', { body: {}, jar: 'anaA' });
  r = await req('GET', '/vpe/api/ceo/relatorios', { jar: 'anaA' });
  teste('regerar no mesmo dia faz upsert (1 relatório)', r.dados.relatorios.length === 1);
  r = await req('POST', '/vpe/api/ceo/relatorios/gerar', { body: {}, jar: 'carlaA' });
  teste('relatório do CEO exige ver_relatorios (403)', r.status === 403);
  r = await req('GET', '/vpe/api/ceo/relatorios', { jar: 'bobB' });
  teste('relatórios do CEO isolados por tenant', r.status === 200 && r.dados.relatorios.length === 0);

  ia.__mockParaTeste(null);

  // ---------- staff da plataforma ----------
  r = await req('GET', '/staff/api/vpe/resumo', { staff: 'ceo' });
  teste('staff resumo com projetos_total e MRR', r.status === 200 && r.dados.projetos_total >= 17 && typeof r.dados.mrr_centavos === 'number');
  r = await req('GET', '/staff/api/vpe/tenants', { staff: 'fora' });
  teste('área sem acesso → 403', r.status === 403);
  r = await req('PATCH', '/staff/api/vpe/tenants/' + tenantB.id, { body: { status: 'suspensa' }, staff: 'adm' });
  teste('admin suspende tenant B', r.status === 200 && r.dados.tenant.status === 'suspensa');
  r = await req('GET', '/vpe/api/dashboard', { jar: 'bobB' });
  teste('tenant suspenso → 402', r.status === 402);
  r = await req('PATCH', '/staff/api/vpe/tenants/' + tenantB.id, { body: { status: 'ativa' }, staff: 'adm' });
  teste('admin reativa tenant B', r.status === 200);

  // ---------- leads ----------
  r = await req('POST', '/vpe/api/leads', { body: { nome: 'Lead', email: 'lead@x.com', empresa: 'X Eventos' } });
  teste('lead da landing gravado', r.status === 200);
  r = await req('GET', '/staff/api/vpe/leads', { staff: 'adm' });
  teste('staff lista leads', r.status === 200 && r.dados.leads.some(l => l.email === 'lead@x.com'));
  teste('alertas de trial/lead disparados', alertas.length >= 3);

  srv.close();
  console.log(`\nVillela Projects selftest: ${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { console.error('Falhas:', falhas); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('ERRO FATAL DO SELFTEST:', e); process.exit(1); });
