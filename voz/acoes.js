// =====================================================================
// Voz — CATÁLOGO DE AÇÕES. Fonte única do que pode ser pedido por voz e
// de que nível cada coisa é (trava 1 do plano).
//
// Copia o desenho que já provou no financeiro/rbac.js: o teto vem do
// catálogo, não de uma lista paralela em outro arquivo que alguém
// esqueceria de atualizar. Promover uma ação de 2 para 3 aqui fecha
// automaticamente a porta do `consultar` e passa a exigir aprovação —
// sem tocar em mais nada.
//
// OS NÍVEIS (plano §4):
//   1  leitura                     → `consultar`, livre
//   2  escrita interna reversível  → `executar`, sem aprovação
//   3  toca pessoa real ou dado externo → `executar` + aprovação
//   4  código e deploy             → `executar` + fila `codigo` + PR
//
// ⚠️ Ação sem ferramenta injetada NÃO é erro de programação: é
// funcionalidade que ainda não existe. Ela continua no catálogo, com o
// nível certo, e responde "isso eu ainda não sei fazer". Tirar do
// catálogo faria o cérebro tentar encaixar o pedido em outra ação —
// que é exatamente como se cadastra um cliente errado.
// =====================================================================
'use strict';

const NIVEIS = { LEITURA: 1, INTERNO: 2, EXTERNO: 3, CODIGO: 4 };

/**
 * Cada entrada:
 *   nivel      — o que decide o caminho (ver acima)
 *   descricao  — vai no prompt do cérebro; é o que o modelo lê para escolher
 *   parametros — nome → descrição (entra no schema que o cérebro preenche)
 *   exige      — parâmetros obrigatórios; faltando, o pedido volta perguntando
 *   resumo     — UMA linha, para o WhatsApp e para a tela de aprovação.
 *                É o texto que o Augusto lê antes de autorizar: tem que
 *                dizer o que vai acontecer, não o nome técnico da ação.
 *   fila       — onde o trabalho roda (nível 4 vai para `codigo`)
 */
const CATALOGO = {
  // ---------------- nível 1 — leitura ----------------
  'agenda.dia': {
    nivel: NIVEIS.LEITURA,
    descricao: 'Chegadas e saídas de hóspedes de um dia. Sem data, é hoje.',
    parametros: { data: 'data no formato AAAA-MM-DD; ausente = hoje' },
    exige: [],
    resumo: (p) => `Agenda de ${p.data || 'hoje'}`,
  },
  'ocupacao.periodo': {
    nivel: NIVEIS.LEITURA,
    descricao: 'Quantas unidades estão ocupadas num dia ou período, e quais.',
    parametros: { de: 'data inicial AAAA-MM-DD; ausente = hoje', ate: 'data final AAAA-MM-DD; ausente = igual a "de"' },
    exige: [],
    resumo: (p) => `Ocupação de ${p.de || 'hoje'}${p.ate && p.ate !== p.de ? ` a ${p.ate}` : ''}`,
  },
  'financeiro.resumo': {
    nivel: NIVEIS.LEITURA,
    descricao: 'Resumo financeiro (faturamento, contas a receber e a pagar) de um mês ou período.',
    parametros: { competencia: 'mês no formato AAAA-MM; ausente = mês corrente' },
    exige: [],
    resumo: (p) => `Resumo financeiro de ${p.competencia || 'este mês'}`,
  },
  'reserva.disponibilidade': {
    nivel: NIVEIS.LEITURA,
    descricao: 'Diz se um imóvel está livre num período e quanto fica. Use antes de reservar.',
    parametros: {
      imovel: 'nome ou código do imóvel, como a pessoa falou (ex.: "Kubitschek", "Casa Modernista")',
      de: 'data de entrada AAAA-MM-DD',
      ate: 'data de saída AAAA-MM-DD',
    },
    exige: ['imovel', 'de', 'ate'],
    resumo: (p) => `Disponibilidade de ${p.imovel} de ${p.de} a ${p.ate}`,
  },
  // ⚠️ Existe porque o primeiro uso real mostrou o buraco: depois de um
  // pedido assincrono, a pergunta natural e "e ai, deu certo?" — e nao
  // havia acao nenhuma que respondesse. Quatro tentativas seguidas
  // cairam em "nao entendi" (26/08/2026), e a pessoa ficou sem saber o
  // que tinha acontecido com a propria reserva.
  //
  // Todo sistema que responde "te aviso depois" precisa responder
  // tambem "o que aconteceu com o que eu pedi?".
  'pedido.status': {
    nivel: NIVEIS.LEITURA,
    descricao: 'O que aconteceu com os últimos pedidos feitos por voz: concluído, falhou, '
      + 'esperando autorização. Use quando perguntarem "deu certo?", "foi concluída?", '
      + '"o que aconteceu com o meu pedido?".',
    parametros: { quantos: 'quantos pedidos olhar; ausente = 3' },
    exige: [],
    resumo: () => 'Status dos últimos pedidos',
  },
  'listas.ver': {
    nivel: NIVEIS.LEITURA,
    descricao: 'Mostra o que está na lista de compras ou na lista de pendências.',
    parametros: { tipo: 'compras | pendencias' },
    exige: ['tipo'],
    resumo: (p) => `Ver a lista de ${p.tipo}`,
  },

  // ---------------- nível 2 — escrita interna reversível ----------------
  'listas.adicionar': {
    nivel: NIVEIS.INTERNO,
    descricao: 'Acrescenta um item à lista de compras.',
    parametros: {
      nome: 'o item, em uma expressão curta (ex.: "papel higiênico")',
      quantidade: 'número; ausente = 1',
      obs: 'observação opcional (marca, tamanho, onde comprar)',
    },
    exige: ['nome'],
    resumo: (p) => `Acrescentar "${p.nome}"${p.quantidade && Number(p.quantidade) !== 1 ? ` (${p.quantidade})` : ''} à lista de compras`,
  },
  'tarefa.criar': {
    nivel: NIVEIS.INTERNO,
    descricao: 'Cria uma pendência/tarefa interna da equipe.',
    parametros: {
      nome: 'a tarefa, em uma frase curta',
      obs: 'detalhe opcional',
      categoria: 'área responsável, se dita (ex.: manutencao, limpeza, ti, juridico)',
    },
    exige: ['nome'],
    resumo: (p) => `Criar a pendência "${p.nome}"${p.categoria ? ` em ${p.categoria}` : ''}`,
  },

  // ---------------- nível 3 — toca pessoa real ou dado externo ----------------
  // ⚠️ "Cadastrar cliente" parece inocente e é nível 3: grava dado
  // pessoal de terceiro em sistema externo (decisão de 25/08/2026).
  'cliente.cadastrar': {
    nivel: NIVEIS.EXTERNO,
    descricao: 'Cadastra ou atualiza um cliente/hóspede na Stays.',
    parametros: {
      nome: 'nome completo do cliente',
      telefone: 'telefone com DDD, se dito',
      email: 'e-mail, se dito',
      obs: 'qualquer outro dado dito',
    },
    exige: ['nome'],
    resumo: (p) => `Cadastrar o cliente "${p.nome}" na Stays`,
  },
  'email.enviar': {
    nivel: NIVEIS.EXTERNO,
    descricao: 'Envia um e-mail a uma pessoa real.',
    parametros: { para: 'destinatário (nome ou e-mail)', assunto: 'assunto', corpo: 'o texto da mensagem' },
    exige: ['para', 'corpo'],
    resumo: (p) => `Enviar e-mail para ${p.para} — "${p.assunto || '(sem assunto)'}"`,
  },
  'whatsapp.enviar': {
    nivel: NIVEIS.EXTERNO,
    descricao: 'Envia uma mensagem de WhatsApp a uma pessoa real (equipe, técnico, hóspede).',
    parametros: { para: 'destinatário (nome ou telefone)', texto: 'a mensagem' },
    exige: ['para', 'texto'],
    resumo: (p) => `Enviar WhatsApp para ${p.para}`,
  },
  // ⚠️ A ação de MAIOR risco do catálogo: mexe em calendário, dinheiro e
  // na viagem de uma pessoa. Erro aqui não é um item errado na lista de
  // compras — é um hóspede sem casa.
  //
  // Duas travas específicas dela, além da aprovação (ver server.js):
  //  1. a disponibilidade é conferida também nos códigos INTERLIGADOS,
  //     porque o espelhamento da Stays tem furos e reservar um componente
  //     com o espaço inteiro ocupado é overbooking;
  //  2. hóspede EXISTENTE é reaproveitado. Criar cliente por API é
  //     irreversível (`DELETE /booking/clients` → 405), então cada nome
  //     ditado viraria um cadastro novo que só se apaga no painel.
  'reserva.criar': {
    nivel: NIVEIS.EXTERNO,
    descricao: 'Cria uma reserva de verdade na Stays, com hóspede e datas. Bloqueia o calendário.',
    parametros: {
      imovel: 'nome ou código do imóvel, como a pessoa falou',
      de: 'data de entrada AAAA-MM-DD',
      ate: 'data de saída AAAA-MM-DD',
      hospede: 'nome do hóspede',
      pessoas: 'quantas pessoas vão ficar',
    },
    exige: ['imovel', 'de', 'ate', 'hospede', 'pessoas'],
    resumo: (p) => `Reservar ${p.imovel} de ${p.de} a ${p.ate} para ${p.hospede} (${p.pessoas} pessoa${Number(p.pessoas) === 1 ? '' : 's'})`,
  },
  // Fora do MVP de propósito (decisão de 25/08/2026), mas no catálogo com
  // o nível certo: assim o pedido é RECONHECIDO e recusado com explicação,
  // em vez de ser encaixado à força em outra ação.
  'reserva.alterar': {
    nivel: NIVEIS.EXTERNO,
    descricao: 'Altera uma reserva, um preço ou o calendário na Stays.',
    parametros: { reserva: 'identificação da reserva', mudanca: 'o que muda' },
    exige: ['mudanca'],
    resumo: (p) => `Alterar reserva ${p.reserva || '(não identificada)'}: ${p.mudanca}`,
  },

  // ---------------- nível 4 — código e deploy ----------------
  'codigo.implementar': {
    nivel: NIVEIS.CODIGO,
    descricao: 'Pedido para implementar, mudar ou corrigir algo no próprio sistema.',
    parametros: { pedido: 'o que deve ser implementado, com as palavras do autor' },
    exige: ['pedido'],
    fila: 'codigo',
    resumo: (p) => `Implementar: ${p.pedido}`,
  },
};

const existe = (acao) => Object.prototype.hasOwnProperty.call(CATALOGO, acao);
const definicao = (acao) => (existe(acao) ? CATALOGO[acao] : null);
const chaves = () => Object.keys(CATALOGO).sort();

/**
 * Nível de uma ação. Ação DESCONHECIDA devolve Infinity, não 0 — assim
 * um erro de digitação no nome é barrado por toda comparação de teto em
 * vez de passar como se fosse leitura livre.
 */
function nivelDe(acao) {
  const d = definicao(acao);
  return d ? d.nivel : Infinity;
}

const exigeAprovacao = (acao) => nivelDe(acao) >= NIVEIS.EXTERNO;
const filaDe = (acao) => (definicao(acao) || {}).fila || 'rapida';

/** Uma linha legível do que vai acontecer. Nunca o nome técnico. */
function resumir(acao, parametros = {}) {
  const d = definicao(acao);
  if (!d) return `Ação desconhecida: ${acao}`;
  try { return String(d.resumo(parametros || {})).slice(0, 300); }
  catch (_) { return `${acao} (parâmetros ilegíveis)`; }
}

/**
 * Nome do parâmetro → como se DIZ em voz alta.
 *
 * ⚠️ Sem isto a pergunta sai com as chaves do código: "Faltou imovel e
 * de e ate e hospede e pessoas" — sem acento, com "e" repetido, e com
 * "de"/"ate" soltos, que falados são quase ininteligíveis. A chave é boa
 * para o código; para o ouvido, não.
 *
 * Chave desconhecida cai nela mesma: melhor uma palavra técnica do que
 * um buraco na frase.
 */
const ROTULOS = {
  imovel: 'qual imóvel', de: 'a data de entrada', ate: 'a data de saída',
  data: 'a data', competencia: 'o mês', tipo: 'qual lista',
  hospede: 'o nome do hóspede', pessoas: 'quantas pessoas',
  nome: 'o nome', quantidade: 'a quantidade', obs: 'a observação',
  categoria: 'a área responsável', responsavel: 'quem é o responsável',
  para: 'para quem', assunto: 'o assunto', corpo: 'o texto da mensagem',
  texto: 'a mensagem', telefone: 'o telefone', email: 'o e-mail',
  reserva: 'qual reserva', mudanca: 'o que muda', pedido: 'o que implementar',
};
const rotularParametro = (k) => ROTULOS[k] || String(k || '');

/** "a, b e c" — não "a e b e c", que é como um `join(' e ')` sai. */
function listarEmPortugues(itens) {
  const l = (itens || []).filter(Boolean);
  if (!l.length) return '';
  if (l.length === 1) return l[0];
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}

/** Parâmetros obrigatórios que faltaram. Vazio = pode seguir. */
function faltando(acao, parametros = {}) {
  const d = definicao(acao);
  if (!d) return [];
  return (d.exige || []).filter((k) => {
    const v = parametros ? parametros[k] : undefined;
    return v == null || String(v).trim() === '';
  });
}

/** O catálogo como o cérebro o vê. Só o que ele precisa para escolher. */
const paraOCerebro = () => chaves().map((acao) => ({
  acao,
  nivel: CATALOGO[acao].nivel,
  descricao: CATALOGO[acao].descricao,
  parametros: CATALOGO[acao].parametros,
}));

module.exports = {
  NIVEIS, CATALOGO,
  existe, definicao, chaves, nivelDe, exigeAprovacao, filaDe, resumir, faltando, paraOCerebro,
  rotularParametro, listarEmPortugues, ROTULOS,
};
