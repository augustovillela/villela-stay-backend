// =====================================================================
// Villela Academy — LIBERAÇÃO PROGRESSIVA (gotejamento) das aulas.
// Regra do Augusto, 22/09/2026: "duas aulas a cada dois dias, contadas a
// partir da matrícula do aluno". Aqui mora SÓ a regra — sem banco, sem
// usuário, sem rota: entra (posição da aula, config do curso, data-base,
// agora) e sai o estado. Quem busca os dados é repo-conteudo.Liberacao;
// quem fecha a porta são as rotas de vídeo/material.
//
// A condição tem DUAS partes, e as duas são obrigatórias:
//   liberada = (dias desde a matrícula >= periodo * ⌈posição/porPeriodo⌉ - periodo)
//              E (a aula tem o conteúdo que o tipo dela promete)
// Só o relógio não basta: se a aula 8 abrir no dia 8 e o vídeo não
// existir, o problema só muda de lugar — o aluno bate numa tela vazia.
// Se a produção acelerar, manda o relógio; se atrasar, manda o que
// existe. Nos dois casos ninguém chega a lugar nenhum.
// =====================================================================
'use strict';

const DIA_MS = 24 * 60 * 60 * 1000;

// 2 aulas a cada 2 dias é o DEFAULT DO RITMO, não uma regra fixa: o curso
// escolhe o seu. O que é fixo é o gotejamento nascer DESLIGADO — curso
// completo (Claude AI na Prática, Claude Jurídica) não pode ser afetado.
const PADRAO = Object.freeze({ aulas_por_periodo: 2, periodo_dias: 2, exigir_conteudo: true });

const MOTIVOS = Object.freeze({
  LIBERADA: 'liberada',
  DATA: 'aguardando_data',          // o relógio ainda não chegou
  PUBLICACAO: 'aguardando_publicacao', // o relógio chegou, o conteúdo não
});

const inteiro = (v, padrao, min, max) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao;
};

// products.config.gotejamento → config normalizada. Qualquer coisa que não
// seja um gotejamento válido e LIGADO devolve {ativo:false}: o padrão é o
// curso inteiro aberto na matrícula, como sempre foi.
function normalizar(config) {
  const c = (config && typeof config === 'object' ? config : {});
  const g = (c.gotejamento && typeof c.gotejamento === 'object') ? c.gotejamento : {};
  // `liberacao` é o interruptor documentado no schema desde a FASE 2
  const ligado = c.liberacao === 'gotejamento' || (c.liberacao == null && g.ativo === true);
  if (!ligado || g.ativo === false) return { ativo: false, ...PADRAO };
  return {
    ativo: true,
    aulas_por_periodo: inteiro(g.aulas_por_periodo, PADRAO.aulas_por_periodo, 1, 100),
    periodo_dias: inteiro(g.periodo_dias, PADRAO.periodo_dias, 1, 365),
    exigir_conteudo: g.exigir_conteudo !== false,
  };
}

// o que sai daqui é o que entra em products.config (guarda só o necessário)
function paraConfig(config, entrada = {}) {
  const base = (config && typeof config === 'object' ? { ...config } : {});
  const ativo = entrada.ativo === true || entrada.ativo === 'true' || entrada.ativo === 1;
  if (!ativo) { base.liberacao = 'imediata'; delete base.gotejamento; return base; }
  base.liberacao = 'gotejamento';
  base.gotejamento = {
    ativo: true,
    aulas_por_periodo: inteiro(entrada.aulas_por_periodo, PADRAO.aulas_por_periodo, 1, 100),
    periodo_dias: inteiro(entrada.periodo_dias, PADRAO.periodo_dias, 1, 365),
    exigir_conteudo: entrada.exigir_conteudo !== false && entrada.exigir_conteudo !== 'false',
  };
  return base;
}

// dia (contado da matrícula) em que a aula da POSIÇÃO n abre.
// 2 por 2: posições 1 e 2 → dia 0; 3 e 4 → dia 2; ...; 21 e 22 → dia 20.
function diaDeAbertura(posicao, cfg) {
  const n = Math.max(1, parseInt(posicao, 10) || 1);
  const c = cfg && cfg.aulas_por_periodo ? cfg : { ...PADRAO };
  return c.periodo_dias * Math.ceil(n / c.aulas_por_periodo) - c.periodo_dias;
}

// CONDIÇÃO 2 — a aula entrega o que o TIPO dela promete.
// ⚠️ A regra escrita diz "tem vídeo publicado". Ao pé da letra, as aulas de
// artigo/slides (tipo pdf) do curso de ChatGPT ficariam travadas para
// sempre, porque não têm nem terão vídeo — o oposto do que se quis. O que
// a regra protege é o aluno não bater numa tela vazia, então a checagem é
// por tipo: aula de VÍDEO sem vídeo continua travada por tempo indefinido,
// que é exatamente o caso das aulas ainda não gravadas.
function conteudoPronto(aula) {
  if (!aula) return false;
  const url = String(aula.url_externa || '').trim();
  const media = String(aula.media_id || '').trim();
  const texto = String(aula.conteudo || '').trim();
  switch (String(aula.tipo || '')) {
    case 'video': return !!(url || media);
    case 'link': return !!url;
    case 'pdf': case 'audio': case 'arquivo': return !!(media || url);
    default: return !!(texto || media || url); // texto
  }
}

// dias INTEIROS decorridos desde a matrícula. Conta em milissegundos, não
// em calendário, de propósito: fuso e horário de verão viram bomba-relógio
// em teste e em produção, e "faltam 2 dias" não depende de meia-noite.
function diasDesde(baseMs, agoraMs) {
  if (!Number.isFinite(baseMs)) return null;
  return Math.floor((agoraMs - baseMs) / DIA_MS);
}

// Estado de UMA aula. `posicao` é a ordem dela na TRILHA INTEIRA (1..n),
// não o lessons.ordem — esse reinicia a cada módulo (MAX(ordem) por
// module_id), e usá-lo abriria a aula 1 de todos os módulos no dia 0.
function estadoDaAula({ aula, posicao, cfg, baseMs, agora = Date.now() }) {
  const c = (cfg && cfg.ativo) ? cfg : null;
  const pronta = conteudoPronto(aula);
  const livre = (motivo) => ({
    liberada: true, motivo: motivo || MOTIVOS.LIBERADA, posicao: posicao || 0,
    dia_abre: 0, abre_em: '', abre_em_dias: 0, conteudo_pronto: pronta,
  });
  if (!c) return livre();

  const dia = diaDeAbertura(posicao, c);
  const dias = diasDesde(baseMs, agora);
  // sem data de referência (cortesia vitalícia, acesso do dono) o gotejamento
  // não se aplica — não há "dias desde a matrícula" para contar.
  if (dias == null) return livre();

  const naData = dias >= dia;
  const abreEmMs = baseMs + dia * DIA_MS;
  const faltam = Math.max(0, Math.ceil((abreEmMs - agora) / DIA_MS));

  if (!naData) {
    return {
      liberada: false, motivo: MOTIVOS.DATA, posicao, dia_abre: dia,
      abre_em: new Date(abreEmMs).toISOString(), abre_em_dias: faltam, conteudo_pronto: pronta,
    };
  }
  if (c.exigir_conteudo && !pronta) {
    return {
      liberada: false, motivo: MOTIVOS.PUBLICACAO, posicao, dia_abre: dia,
      abre_em: '', abre_em_dias: 0, conteudo_pronto: false,
    };
  }
  return { ...livre(), posicao, dia_abre: dia };
}

// frase única para a tela do aluno (grade, player e aviso) — o mesmo texto
// em todo lugar, para a trilha ser lida como método e não como curso trancado
function rotulo(estado) {
  if (!estado || estado.liberada) return '';
  if (estado.motivo === MOTIVOS.PUBLICACAO) return 'aguardando publicação';
  if (estado.abre_em_dias <= 0) return 'abre hoje';
  return estado.abre_em_dias === 1 ? 'abre amanhã' : `abre em ${estado.abre_em_dias} dias`;
}

// "duas aulas novas a cada dois dias" — a promessa em uma linha, do jeito
// que o ritmo configurado manda. Usada na página de venda e no estúdio.
function promessa(cfg) {
  if (!cfg || !cfg.ativo) return '';
  const n = cfg.aulas_por_periodo, d = cfg.periodo_dias;
  const aulas = n === 1 ? 'uma aula nova' : `${porExtenso(n)} aulas novas`;
  const prazo = d === 1 ? 'por dia' : `a cada ${porExtenso(d, 'm')} dias`;
  return `${aulas.charAt(0).toUpperCase()}${aulas.slice(1)} ${prazo}`;
}
// aula é feminino, dia é masculino: "duas aulas a cada dois dias".
// Uma lista só escreveria "a cada duas dias" — e a frase vai para a página
// de venda, onde erro de concordância custa credibilidade.
const EXTENSO_F = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
const EXTENSO_M = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
function porExtenso(n, genero = 'f') {
  const lista = genero === 'm' ? EXTENSO_M : EXTENSO_F;
  return lista[n] || String(n);
}

// dias até a trilha inteira abrir, para a página de venda dizer o tamanho
// do compromisso sem inventar número
function diasAteOFim(totalAulas, cfg) {
  if (!cfg || !cfg.ativo || !totalAulas) return 0;
  return diaDeAbertura(totalAulas, cfg);
}

module.exports = {
  DIA_MS, PADRAO, MOTIVOS,
  normalizar, paraConfig, diaDeAbertura, conteudoPronto, diasDesde,
  estadoDaAula, rotulo, promessa, diasAteOFim,
};
