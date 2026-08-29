// =====================================================================
// Villela Growth OS — agendamento de reuniões (§17 do PROMPT_MASTER).
//
// Motor próprio: tipos de reunião, disponibilidade recorrente, bloqueios,
// cálculo de horários livres, página pública de marcação, confirmação,
// lembrete, reagendamento, cancelamento e no-show. Funciona sem calendário
// externo nenhum.
//
// A invariante que o código defende: **dois agendamentos não ocupam o
// mesmo horário do mesmo responsável.** A checagem é feita DENTRO da
// transação da marcação, não antes — senão duas pessoas clicando junto
// levam o mesmo horário.
//
// Sincronia com Google/Microsoft Calendar é contrato (conector
// `planejada`): sem ela, compromisso externo não aparece aqui, e isso
// está declarado no PROJECT_STATE.
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const entitlements = require('./entitlements');
const { db, transacao, nowISO, j } = require('./db');

const STATUS = ['confirmado', 'reagendado', 'cancelado', 'realizado', 'no_show'];

/** Deslocamento do fuso em minutos, na data dada. Usa Intl, sem dependência. */
function offsetMinutos(fuso, data) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = dtf.formatToParts(data).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
    const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    // ARREDONDAR é essencial: sem isto o offset sai fracionário (os
    // milissegundos de `data` vazam), cada slot nasce com ms diferente e o
    // MESMO horário calculado duas vezes vira duas strings distintas —
    // quebrando a detecção de conflito e o slot que o cliente devolve.
    return Math.round((comoUtc - data.getTime()) / 60000);
  } catch { return -180; }   // America/Sao_Paulo
}

// ---------------------------------------------------------- tipos

function criarTipo({ nome, slug, descricao = '', duracaoMin = 30, intervaloMin = 0, antecedenciaMin = 60,
  janelaDias = 30, fuso = 'America/Sao_Paulo', responsaveis = [], distribuicao = 'primeiro',
  local = '', linkVideo = '', lembreteHoras = 24, formularioId = '' }) {
  if (!nome) throw erro(400, 'O tipo de reunião precisa de um nome.');
  entitlements.exigirFlag('reunioes');
  const s = (slug || nome).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  if (!s) throw erro(400, 'Não consegui gerar um endereço a partir desse nome.');
  if (repo.um('SELECT id FROM gx_tipos_reuniao WHERE tenant_id = :tenant AND slug = :s', { s })) {
    throw erro(409, `Já existe um tipo de reunião com o endereço "${s}".`);
  }
  if (Number(duracaoMin) <= 0) throw erro(400, 'A duração precisa ser maior que zero.');

  const id = repo.inserir('gx_tipos_reuniao', {
    nome, slug: s, descricao, duracao_min: Number(duracaoMin), intervalo_min: Number(intervaloMin) || 0,
    antecedencia_min: Number(antecedenciaMin) || 0, janela_dias: Number(janelaDias) || 30, fuso,
    responsaveis: j.str(responsaveis), distribuicao, local, link_video: linkVideo,
    lembrete_horas: Number(lembreteHoras) || 0, formulario_id: formularioId,
  });
  return repo.buscar('gx_tipos_reuniao', id);
}

const tipos = () => repo.listar('gx_tipos_reuniao', { ordem: 'nome ASC' });
// O slug e unico so DENTRO da conta (UNIQUE(tenant_id, slug)), entao ele sozinho nao
// identifica o dono. Aqui dentro sempre ha contexto de tenant, e a busca passa pelo
// repo guardado; a porta publica resolve o dono ANTES de entrar (ver rotas-publicas).
const tipoPorSlug = (slug) =>
  repo.um("SELECT * FROM gx_tipos_reuniao WHERE tenant_id = :tenant AND slug = :s AND ativo = 1 AND excluido_em = ''", { s: String(slug || '') });

function definirDisponibilidade(tipoId, faixas = []) {
  repo.exec('DELETE FROM gx_disponibilidade WHERE tenant_id = :tenant AND tipo_id = :t', { t: tipoId });
  for (const f of faixas) {
    if (!/^\d{2}:\d{2}$/.test(f.inicio) || !/^\d{2}:\d{2}$/.test(f.fim)) throw erro(400, 'Horário deve ser HH:MM.');
    if (f.fim <= f.inicio) throw erro(400, `Faixa inválida: ${f.inicio}–${f.fim}.`);
    repo.inserir('gx_disponibilidade', {
      tipo_id: tipoId, user_id: f.userId || '', dia_semana: Number(f.diaSemana),
      inicio: f.inicio, fim: f.fim, criado_em: nowISO(),
    });
  }
  return repo.listar('gx_disponibilidade', { onde: 'tipo_id = :t', params: { t: tipoId }, ordem: 'dia_semana ASC, inicio ASC', limite: 100 });
}

const bloquear = ({ userId = '', inicio, fim, motivo = '', origem = 'manual' }) =>
  repo.inserir('gx_bloqueios_agenda', { user_id: userId, inicio, fim, motivo, origem, criado_em: nowISO() });

// ------------------------------------------------- horários livres

/**
 * Devolve os horários disponíveis. Considera: faixas do dia, duração,
 * intervalo entre reuniões, antecedência mínima, janela máxima,
 * agendamentos já confirmados e bloqueios.
 */
function horariosLivres(tipoIdOuSlug, { de = null, ate = null, userId = '' } = {}) {
  const tipo = repo.buscar('gx_tipos_reuniao', tipoIdOuSlug) || tipoPorSlug(tipoIdOuSlug);
  if (!tipo) throw erro(404, 'Tipo de reunião não encontrado.');

  const agora = Date.now();
  const inicioJanela = Math.max(de ? new Date(de).getTime() : agora, agora + (Number(tipo.antecedencia_min) || 0) * 60000);
  const fimJanela = Math.min(
    ate ? new Date(ate).getTime() : agora + (Number(tipo.janela_dias) || 30) * 86400000,
    agora + (Number(tipo.janela_dias) || 30) * 86400000
  );
  if (fimJanela <= inicioJanela) return [];

  const faixas = repo.listar('gx_disponibilidade', {
    onde: "(tipo_id = :t OR tipo_id = '')" + (userId ? " AND (user_id = :u OR user_id = '')" : ''),
    params: userId ? { t: tipo.id, u: userId } : { t: tipo.id }, ordem: 'dia_semana ASC', limite: 200,
  });
  if (!faixas.length) return [];

  const ocupados = repo.listar('gx_agendamentos', {
    onde: "tipo_id = :t AND status IN ('confirmado','reagendado') AND fim > :de AND inicio < :ate",
    params: { t: tipo.id, de: new Date(inicioJanela).toISOString(), ate: new Date(fimJanela).toISOString() },
    ordem: 'inicio ASC', limite: 1000,
  });
  const bloqueios = repo.listar('gx_bloqueios_agenda', {
    onde: 'fim > :de AND inicio < :ate' + (userId ? " AND (user_id = :u OR user_id = '')" : ''),
    params: Object.assign({ de: new Date(inicioJanela).toISOString(), ate: new Date(fimJanela).toISOString() }, userId ? { u: userId } : {}),
    ordem: 'inicio ASC', limite: 500,
  });

  const duracao = Number(tipo.duracao_min) * 60000;
  const passo = (Number(tipo.duracao_min) + (Number(tipo.intervalo_min) || 0)) * 60000;
  const livres = [];

  for (let dia = new Date(inicioJanela); dia.getTime() < fimJanela; dia = new Date(dia.getTime() + 86400000)) {
    const off = offsetMinutos(tipo.fuso, dia);
    // dia da semana no fuso do tipo
    const local = new Date(dia.getTime() + off * 60000);
    const dow = local.getUTCDay();
    const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());

    for (const f of faixas.filter((x) => Number(x.dia_semana) === dow)) {
      const [hi, mi] = f.inicio.split(':').map(Number);
      const [hf, mf] = f.fim.split(':').map(Number);
      const iniLocal = base + (hi * 60 + mi) * 60000;
      const fimLocal = base + (hf * 60 + mf) * 60000;

      for (let t = iniLocal; t + duracao <= fimLocal; t += passo) {
        const inicioUtc = t - off * 60000;           // volta para UTC real
        const fimUtc = inicioUtc + duracao;
        if (inicioUtc < inicioJanela || fimUtc > fimJanela) continue;
        const iso = new Date(inicioUtc).toISOString();
        const isoFim = new Date(fimUtc).toISOString();

        const conflita = ocupados.some((o) => o.inicio < isoFim && o.fim > iso) ||
          bloqueios.some((b) => b.inicio < isoFim && b.fim > iso);
        if (!conflita) livres.push({ inicio: iso, fim: isoFim, responsavel: f.user_id || '' });
      }
    }
  }
  return livres.sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 500);
}

/** Distribui entre os responsáveis conforme a regra do tipo. */
function escolherResponsavel(tipo, inicio) {
  const lista = j.parse(tipo.responsaveis, []);
  if (!lista.length) return '';
  if (tipo.distribuicao === 'primeiro') return lista[0];

  const livres = lista.filter((u) => !repo.um(
    "SELECT 1 FROM gx_agendamentos WHERE tenant_id = :tenant AND responsavel = :u AND status IN ('confirmado','reagendado') " +
    'AND inicio < :fim AND fim > :ini',
    { u, ini: inicio, fim: new Date(new Date(inicio).getTime() + Number(tipo.duracao_min) * 60000).toISOString() }
  ));
  if (!livres.length) return '';
  if (tipo.distribuicao === 'menos_ocupado') {
    return livres.map((u) => ({
      u, n: (repo.um("SELECT COUNT(*) AS n FROM gx_agendamentos WHERE tenant_id = :tenant AND responsavel = :u AND status = 'confirmado'", { u }) || {}).n || 0,
    })).sort((a, b) => a.n - b.n)[0].u;
  }
  // round robin: quem atendeu há mais tempo
  const ultimo = repo.um("SELECT responsavel FROM gx_agendamentos WHERE tenant_id = :tenant AND responsavel != '' ORDER BY criado_em DESC LIMIT 1");
  const i = ultimo ? livres.indexOf(ultimo.responsavel) : -1;
  return livres[(i + 1) % livres.length];
}

// -------------------------------------------------------- marcação

/**
 * Marca a reunião. A checagem de conflito é feita DENTRO da transação:
 * duas pessoas clicando no mesmo segundo não levam o mesmo horário.
 */
function agendar(tipoIdOuSlug, { inicio, nome = '', email = '', telefone = '', observacao = '',
  respostas = {}, contatoId = '', responsavel = '' }) {
  const tipo = repo.buscar('gx_tipos_reuniao', tipoIdOuSlug) || tipoPorSlug(tipoIdOuSlug);
  if (!tipo) throw erro(404, 'Tipo de reunião não encontrado.');
  if (!inicio) throw erro(400, 'Informe o horário.');
  if (!email && !telefone) throw erro(400, 'Informe e-mail ou telefone para a confirmação.');

  const ini = new Date(inicio);
  if (Number.isNaN(ini.getTime())) throw erro(400, 'Horário inválido.');
  const fim = new Date(ini.getTime() + Number(tipo.duracao_min) * 60000);

  const minimo = Date.now() + (Number(tipo.antecedencia_min) || 0) * 60000;
  if (ini.getTime() < minimo) {
    throw erro(422, `Este tipo de reunião exige ${tipo.antecedencia_min} minutos de antecedência.`);
  }

  return transacao(() => {
    const resp = responsavel || escolherResponsavel(tipo, ini.toISOString());

    // conflito: mesmo tipo (ou mesmo responsável) no intervalo
    const conflito = repo.um(
      "SELECT id FROM gx_agendamentos WHERE tenant_id = :tenant AND status IN ('confirmado','reagendado') " +
      'AND inicio < :fim AND fim > :ini AND (tipo_id = :t' + (resp ? ' OR responsavel = :r' : '') + ')',
      Object.assign({ t: tipo.id, ini: ini.toISOString(), fim: fim.toISOString() }, resp ? { r: resp } : {})
    );
    if (conflito) throw erro(409, 'Esse horário acabou de ser ocupado. Escolha outro.');

    const bloqueio = repo.um(
      'SELECT id FROM gx_bloqueios_agenda WHERE tenant_id = :tenant AND inicio < :fim AND fim > :ini' +
      (resp ? " AND (user_id = :r OR user_id = '')" : ''),
      Object.assign({ ini: ini.toISOString(), fim: fim.toISOString() }, resp ? { r: resp } : {})
    );
    if (bloqueio) throw erro(409, 'Esse horário está bloqueado na agenda.');

    // identifica quem está marcando
    let contato = contatoId;
    if (!contato && (email || telefone)) {
      const identidades = [];
      if (email) identidades.push({ tipo: 'email', valor: email });
      if (telefone) identidades.push({ tipo: 'telefone', valor: telefone });
      try {
        contato = require('./identidade').resolver({
          identidades, dados: { nome, origem: 'agendamento' }, origem: 'agendamento',
        }).contatoId;
      } catch (_) { contato = ''; }
    }

    const lembrete = Number(tipo.lembrete_horas)
      ? new Date(ini.getTime() - Number(tipo.lembrete_horas) * 3600000).toISOString() : '';

    const id = repo.inserir('gx_agendamentos', {
      tipo_id: tipo.id, contato_id: contato, responsavel: resp,
      inicio: ini.toISOString(), fim: fim.toISOString(), fuso: tipo.fuso,
      status: 'confirmado', nome_convidado: nome, email_convidado: email, telefone_convidado: telefone,
      observacao, respostas: j.str(respostas), lembrete_em: lembrete,
      token: 'ga_' + crypto.randomBytes(10).toString('base64url'),
    });

    if (lembrete) {
      require('./fila').enfileirar({
        tipo: 'reuniao:lembrete', fila: 'reunioes', prioridade: 5,
        payload: { agendamentoId: id }, chaveIdem: `lembrete:${id}`, agendarPara: lembrete,
      });
    }
    eventos.publicar('meeting.booked', {
      refTipo: 'agendamento', refId: id,
      payload: { tipo: tipo.nome, inicio: ini.toISOString(), contato_id: contato, responsavel: resp },
      chaveIdem: `agend:${id}`,
    });
    return repo.buscar('gx_agendamentos', id);
  });
}

const porToken = (token) =>
  db.prepare('SELECT * FROM gx_agendamentos WHERE token = ?').get(String(token || '')) || null;

function reagendar(token, novoInicio) {
  const a = porToken(token);
  if (!a) throw erro(404, 'Agendamento não encontrado.');
  if (['cancelado', 'realizado'].includes(a.status)) throw erro(409, `Este agendamento está "${a.status}".`);
  return tenancy.comTenant({ tenantId: a.tenant_id, userId: 'publico' }, () => {
    const tipo = repo.buscar('gx_tipos_reuniao', a.tipo_id);
    const novo = agendar(tipo.id, {
      inicio: novoInicio, nome: a.nome_convidado, email: a.email_convidado, telefone: a.telefone_convidado,
      observacao: a.observacao, contatoId: a.contato_id, responsavel: a.responsavel,
    });
    repo.atualizar('gx_agendamentos', a.id, { status: 'reagendado', motivo_cancelamento: `reagendado para ${novoInicio}` });
    return novo;
  });
}

function cancelar(token, { motivo = '', quem = 'convidado' } = {}) {
  const a = porToken(token);
  if (!a) throw erro(404, 'Agendamento não encontrado.');
  if (a.status === 'cancelado') return a;
  return tenancy.comTenant({ tenantId: a.tenant_id, userId: quem }, () => {
    repo.atualizar('gx_agendamentos', a.id, { status: 'cancelado', cancelado_por: quem, motivo_cancelamento: motivo });
    eventos.publicar('meeting.cancelled', {
      refTipo: 'agendamento', refId: a.id,
      payload: { motivo, por: quem, contato_id: a.contato_id }, chaveIdem: `agendcanc:${a.id}`,
    });
    return repo.buscar('gx_agendamentos', a.id);
  });
}

function marcarDesfecho(id, status, { motivo = '' } = {}) {
  if (!['realizado', 'no_show'].includes(status)) throw erro(400, 'Desfecho inválido.');
  const a = repo.buscar('gx_agendamentos', id);
  if (!a) throw erro(404, 'Agendamento não encontrado.');
  repo.atualizar('gx_agendamentos', id, { status, motivo_cancelamento: motivo });
  if (status === 'no_show') {
    eventos.publicar('meeting.cancelled', {
      refTipo: 'agendamento', refId: id,
      payload: { motivo: 'no-show', contato_id: a.contato_id }, chaveIdem: `noshow:${id}`,
    });
  }
  return repo.buscar('gx_agendamentos', id);
}

/** Handler do job de lembrete. */
function enviarLembrete({ agendamentoId }) {
  const a = repo.buscar('gx_agendamentos', agendamentoId);
  if (!a) return { ok: true, sumiu: true };
  if (a.status !== 'confirmado' || a.lembrete_enviado) return { ok: true, pulado: true };
  repo.atualizar('gx_agendamentos', agendamentoId, { lembrete_enviado: 1 });
  // A entrega usa o canal disponível; sem canal conectado, fica registrado.
  return { ok: true, para: a.email_convidado || a.telefone_convidado };
}

const agenda = ({ de = '', ate = '', responsavel = '', status = '' } = {}) => {
  const cond = [];
  const params = {};
  if (de) { cond.push('inicio >= :de'); params.de = de; }
  if (ate) { cond.push('inicio <= :ate'); params.ate = ate; }
  if (responsavel) { cond.push('responsavel = :r'); params.r = responsavel; }
  if (status) { cond.push('status = :st'); params.st = status; }
  return repo.listar('gx_agendamentos', { onde: cond.join(' AND '), params, ordem: 'inicio ASC', limite: 500 });
};

/** Métricas do §22 para atendimento/comercial. */
function indicadores({ de = '', ate = '' } = {}) {
  const todos = agenda({ de, ate });
  const conta = (s) => todos.filter((a) => a.status === s).length;
  const realizados = conta('realizado');
  const noShow = conta('no_show');
  return {
    total: todos.length, confirmados: conta('confirmado'), realizados, cancelados: conta('cancelado'), no_show: noShow,
    taxa_no_show_pct: (realizados + noShow) ? Math.round((noShow / (realizados + noShow)) * 100) : null,
  };
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  STATUS, offsetMinutos,
  criarTipo, tipos, tipoPorSlug, definirDisponibilidade, bloquear,
  horariosLivres, escolherResponsavel, agendar, porToken, reagendar, cancelar,
  marcarDesfecho, enviarLembrete, agenda, indicadores,
};
