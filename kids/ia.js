// =====================================================================
// Villela Kids — MOTOR da missão guiada (onda 2). Regras duras moram
// aqui, ANTES de qualquer LLM:
//   • máquina de etapas do roteiro curado (avançar exige a entrada válida);
//   • varredura de dados pessoais no que a criança digita (não vai ao LLM);
//   • varredura de sinais de risco → notificação IMEDIATA ao responsável;
//   • limite de trocas por etapa (custo e anti-loop);
//   • fallback "modo simples" quando o LLM está fora — a missão nunca trava.
// O estado vive em child_missions.dados (JSON): { etapa, respostas,
// historico, trocas_na_etapa } — e por isso entra na exportação LGPD da
// família inteira, de graça (transparência total para o responsável).
// =====================================================================
'use strict';
const repo = require('./repo');
const llm = require('./ia-llm');
const { j, nowISO } = require('./db');
const { temRoteiro, roteiroDe } = require('./roteiros');
const { Criancas, Missoes, Notificacoes, s, evento } = repo;

const MAX_TROCAS_POR_ETAPA = 6;
const MAX_HISTORICO = 60;

// Dado pessoal digitado pela criança é barrado AQUI — nem chega ao LLM.
const pareceDadoPessoal = (t) => /@|\bhttps?:|\d{8,}/.test(String(t || ''));

// Sinais de risco: lista curta e literal de propósito (falso negativo é
// coberto pelo LLM, que também sinaliza; falso positivo só gera um aviso
// gentil ao responsável — custo aceitável).
const SINAIS_RISCO = [
  'me machucar', 'me machuco', 'me cortar', 'me corto', 'me bater', 'me bate', 'apanho',
  'quero morrer', 'quero sumir', 'me matar', 'suicidio', 'suicídio',
  'tenho medo dele', 'tenho medo dela', 'segredo com adulto', 'ninguem gosta de mim', 'ninguém gosta de mim',
];
const temSinalDeRisco = (t) => { const x = String(t || '').toLowerCase(); return SINAIS_RISCO.some((p) => x.includes(p)); };

function alertarResponsavel(userId, crianca, resumo) {
  Notificacoes.criar(userId, {
    titulo: `💛 Atenção: ${crianca.avatar} ${crianca.apelido} disse algo que merece a sua escuta`,
    texto: `Durante uma missão, apareceu: "${s(resumo, 300)}". Pode não ser nada — mas vale uma conversa carinhosa hoje. O tutor acolheu e orientou a falar com você.`,
    url: '/kids/app#pais', tipo: 'alerta',
  });
  evento(userId, 'tutor.alerta_responsavel', crianca.id, {});
}

// ---------------------------------------------------------------------
// Estado do jogo
// ---------------------------------------------------------------------
function carregar(userId, childId, missionId) {
  const c = Criancas.exigir(userId, childId);
  const mid = s(missionId, 60);
  const rot = roteiroDe(mid);
  if (!rot) throw new Error('Esta missão não tem modo guiado.');
  const m = Missoes.obter(mid);
  if (!m || !m.ativa) throw new Error('Missão não encontrada.');
  const p = Missoes.progresso(c.id, mid);
  if (!p) throw new Error('Inicie a missão antes de jogar.');
  if (p.status === 'concluida') throw new Error('Missão já concluída.');
  const dados = Object.assign({ etapa: 0, respostas: {}, historico: [], trocas_na_etapa: 0 }, j.parse(p.dados, {}));
  return { c, m, rot, p, dados };
}

const ctxDe = (dados, c) => ({ assistente: dados.respostas['nome'] || 'Assistente', apelido: c.apelido, respostas: dados.respostas });

function montarEstado({ c, m, rot, dados }) {
  const i = Math.min(dados.etapa, rot.etapas.length - 1);
  const e = rot.etapas[i];
  const ctx = ctxDe(dados, c);
  const estado = {
    missao: { id: m.id, titulo: m.titulo, emoji: m.emoji },
    indice: i + 1, total: rot.etapas.length,
    etapa: {
      id: e.id, titulo: e.titulo, tipo: e.tipo, conversa: !!e.conversa,
      texto: e.texto(ctx),
      entrada: e.entrada ? { rotulo: e.entrada.rotulo, dica: e.entrada.dica || '', multilinha: !!e.entrada.multilinha } : null,
    },
    historico: dados.historico.slice(-16),
    tutor: { nome: ctx.assistente, motor: llm.disponivel() ? 'llm' : 'simples' },
  };
  if (e.tipo === 'concluir') {
    const previa = rot.montarCriacao(dados.respostas, c);
    estado.previa = previa;
  }
  return estado;
}

const estado = (userId, childId, missionId) => montarEstado(carregar(userId, childId, missionId));

// ---------------------------------------------------------------------
// Avançar de etapa (determinístico; entrada validada pelo roteiro)
// ---------------------------------------------------------------------
function avancar(userId, childId, missionId, { entrada } = {}) {
  const jogo = carregar(userId, childId, missionId);
  const { c, rot, p, dados } = jogo;
  const e = rot.etapas[Math.min(dados.etapa, rot.etapas.length - 1)];
  if (e.tipo === 'concluir') throw new Error('Esta etapa se fecha guardando a criação no portfólio.');
  if (e.tipo === 'entrada') {
    const t = s(entrada, e.entrada.max || 500);
    if (t.length < (e.entrada.min || 1)) throw new Error(`Capriche um pouco mais: escreva pelo menos ${e.entrada.min || 1} letras.`);
    if (pareceDadoPessoal(t)) throw new Error('Opa — nada de dados pessoais (telefone, e-mail, endereço) por aqui! Reescreva sem eles.');
    dados.respostas[e.id] = t;
  }
  dados.etapa = Math.min(dados.etapa + 1, rot.etapas.length - 1);
  dados.trocas_na_etapa = 0;
  Missoes.salvarDados(c.id, jogo.m.id, dados);
  return montarEstado({ ...jogo, dados, p });
}

// ---------------------------------------------------------------------
// Conversar com o tutor dentro da etapa
// ---------------------------------------------------------------------
async function responder(userId, childId, missionId, texto) {
  const jogo = carregar(userId, childId, missionId);
  const { c, m, rot, dados } = jogo;
  const e = rot.etapas[Math.min(dados.etapa, rot.etapas.length - 1)];
  if (!e.conversa) throw new Error('Nesta etapa não tem chat — siga a instrução da tela.');
  const msg = s(texto, 500);
  if (!msg) throw new Error('Escreva alguma coisa para o tutor.');

  const registrar = (resposta, motor) => {
    dados.historico.push({ de: 'crianca', texto: msg, em: nowISO(), etapa: e.id });
    dados.historico.push({ de: 'tutor', texto: resposta, em: nowISO(), etapa: e.id });
    dados.historico = dados.historico.slice(-MAX_HISTORICO);
    dados.trocas_na_etapa = (dados.trocas_na_etapa || 0) + 1;
    Missoes.salvarDados(c.id, m.id, dados);
    return { resposta, motor };
  };

  // Regras duras primeiro — nada disso depende (nem chega) ao LLM.
  if (temSinalDeRisco(msg)) {
    alertarResponsavel(userId, c, msg);
    return registrar('Isso que você contou é importante de verdade — obrigado por confiar em mim. 💛 Agora vai lá contar AGORA para o seu responsável, tá? Ele vai saber ajudar. Eu fico aqui te esperando para continuar a missão.', 'guarda');
  }
  if (pareceDadoPessoal(msg)) {
    return registrar('Opa! Dados pessoais (telefone, endereço, e-mail, senha) a gente NUNCA conta na internet — nem para mim. 😉 Apaga da cabeça que eu nem li. Vamos voltar para a missão?', 'guarda');
  }
  if ((dados.trocas_na_etapa || 0) >= MAX_TROCAS_POR_ETAPA) {
    return registrar('A gente já conversou bastante nesta etapa — bora colocar a mão na massa? Complete a atividade da tela para a missão continuar! 🚀', 'guarda');
  }

  // LLM quando disponível; qualquer falha cai no modo simples do roteiro.
  if (llm.disponivel()) {
    try {
      const r = await llm.responderComoTutor({
        crianca: { apelido: c.apelido, faixa: c.faixa },
        assistente: dados.respostas['nome'] || '',
        missao: m, etapa: e, objetivo: e.objetivo,
        historico: dados.historico.filter((h) => h.etapa === e.id).slice(-8),
        respostas: dados.respostas, mensagem: msg,
      });
      if (r.resposta) {
        if (r.alerta) alertarResponsavel(userId, c, r.alerta);
        return registrar(r.resposta, 'llm');
      }
    } catch (err) {
      console.warn('[kids/ia] LLM falhou, caindo no modo simples:', err.message);
    }
  }
  const fb = e.fallbacks && e.fallbacks.length
    ? e.fallbacks[(dados.trocas_na_etapa || 0) % e.fallbacks.length]
    : 'Boa! Continue a atividade da tela que a missão anda. (Hoje estou no modo simples, sem a conversa esperta.)';
  return registrar(fb, 'simples');
}

// ---------------------------------------------------------------------
// Concluir a missão guiada: o motor compõe a criação a partir das
// respostas e entrega ao mesmo núcleo da onda 1 (concluir → portfólio).
// ---------------------------------------------------------------------
function concluirGuiada(userId, childId, missionId, { titulo } = {}) {
  const jogo = carregar(userId, childId, missionId);
  const { c, m, rot, dados } = jogo;
  const e = rot.etapas[Math.min(dados.etapa, rot.etapas.length - 1)];
  if (e.tipo !== 'concluir') throw new Error('Complete as etapas da missão antes de guardar a criação.');
  const previa = rot.montarCriacao(dados.respostas, c);
  return Missoes.concluir(userId, c.id, m.id, {
    titulo: s(titulo, 140) || previa.titulo_sugerido,
    conteudo: previa.conteudo,
  });
}

module.exports = { temRoteiro, estado, avancar, responder, concluirGuiada, MAX_TROCAS_POR_ETAPA };
