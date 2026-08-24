// =====================================================================
// Villela Finance — perfis, permissões e NÍVEIS DE RISCO.
//
// A automação aqui não elimina controle: ela classifica o controle. Cada
// ação tem um nível, e o nível decide se roda sozinha, se pede prévia, se
// exige um segundo par de olhos ou se está simplesmente proibida.
//
//   0 — leitura e sugestão. Não muda nada.
//   1 — automática, reversível, baixo impacto (classificar, sugerir).
//   2 — prévia + aprovação simples do próprio operador.
//   3 — MATERIAL: maker-checker (quem pede ≠ quem aprova), alçada por
//       valor e segundo fator. Pagamento, favorecido novo, mudança de
//       dado bancário, fechamento, reabertura, estorno, permissão.
//   4 — PROIBIDA sem habilitação jurídica/regulatória específica. Ordem
//       de investimento e lance em leilão ficam aqui até decisão expressa
//       do Augusto com parecer — e o código recusa, não avisa.
//
// Regra que não se dobra: nada listado como 3 pode ser rebaixado por
// configuração. `nivelDe()` devolve o MAIOR entre o mínimo do catálogo e
// o que a conta configurou.
// =====================================================================
'use strict';

const NIVEIS = { LEITURA: 0, AUTO: 1, PREVIA: 2, MATERIAL: 3, PROIBIDA: 4 };

/**
 * Catálogo de ações. `nivelMinimo` é piso — configuração da conta só
 * consegue subir. `permissao` é a chave verificada contra o perfil.
 */
const ACOES = {
  // leitura
  'relatorio.ver':            { nivelMinimo: 0, permissao: 'ler' },
  'razao.ver':                { nivelMinimo: 0, permissao: 'ler' },
  'transacao.ver':            { nivelMinimo: 0, permissao: 'ler' },

  // automáticas reversíveis
  'transacao.importar':       { nivelMinimo: 1, permissao: 'lancar' },
  'transacao.sugerir':        { nivelMinimo: 1, permissao: 'lancar' },
  'transacao.ignorar':        { nivelMinimo: 1, permissao: 'lancar' },
  'regra.criar':              { nivelMinimo: 1, permissao: 'configurar' },
  'contraparte.criar':        { nivelMinimo: 1, permissao: 'cadastrar' },
  'diario.replicar':          { nivelMinimo: 1, permissao: 'configurar' },

  // prévia + aprovação simples
  'lote.contabilizar':        { nivelMinimo: 2, permissao: 'lancar' },
  'transacao.conciliar':      { nivelMinimo: 2, permissao: 'lancar' },
  'titulo.criar':             { nivelMinimo: 2, permissao: 'lancar' },
  'titulo.cancelar':          { nivelMinimo: 2, permissao: 'lancar' },
  'conta.criar':              { nivelMinimo: 2, permissao: 'configurar' },

  // MATERIAIS — piso 3, sem exceção
  'pagamento.executar':       { nivelMinimo: 3, permissao: 'pagar' },
  'pagamento.lote':           { nivelMinimo: 3, permissao: 'pagar' },
  'contraparte.dados_bancarios': { nivelMinimo: 3, permissao: 'cadastrar' },
  'contraparte.primeiro_pagamento': { nivelMinimo: 3, permissao: 'pagar' },
  'periodo.fechar':           { nivelMinimo: 3, permissao: 'fechar' },
  'resultado.apurar':         { nivelMinimo: 3, permissao: 'fechar' },
  'periodo.reabrir':          { nivelMinimo: 3, permissao: 'fechar' },
  'lote.estornar':            { nivelMinimo: 3, permissao: 'lancar' },
  'importacao.desfazer':      { nivelMinimo: 3, permissao: 'configurar' },
  'usuario.perfil':           { nivelMinimo: 3, permissao: 'administrar' },
  'conta_bancaria.alterar':   { nivelMinimo: 3, permissao: 'configurar' },
  'saldo_inicial.definir':    { nivelMinimo: 3, permissao: 'configurar' },

  // PROIBIDAS até autorização expressa (ver ROADMAP fases 6-8)
  'investimento.ordem':       { nivelMinimo: 4, permissao: 'proibido', motivo: 'Execução de ordem exige estrutura e autorização regulatória (Resolução CVM 19). Fora do escopo autorizado.' },
  'leilao.lance':             { nivelMinimo: 4, permissao: 'proibido', motivo: 'Lance em leilão é ato irreversível com efeito jurídico. Fora do escopo autorizado.' },
  'investimento.recomendar':  { nivelMinimo: 4, permissao: 'proibido', motivo: 'Recomendação individualizada exige habilitação regulatória. O sistema só produz análise impessoal e educacional.' },
};

/**
 * Perfis. `alcadaCents = 0` significa SEM alçada própria (precisa de
 * quem tenha). `-1` = sem teto.
 */
const PERFIS = {
  proprietario: {
    nome: 'Proprietário',
    descricao: 'Dono da conta. Vê tudo, aprova tudo, administra usuários.',
    permissoes: ['ler', 'lancar', 'cadastrar', 'configurar', 'pagar', 'fechar', 'aprovar', 'administrar'],
    alcadaCents: -1,
  },
  controller: {
    nome: 'Controller',
    descricao: 'Conduz o financeiro e o fechamento. Aprova dentro da alçada.',
    permissoes: ['ler', 'lancar', 'cadastrar', 'configurar', 'pagar', 'fechar', 'aprovar'],
    alcadaCents: 5000000,        // R$ 50.000,00
  },
  aprovador: {
    nome: 'Aprovador',
    descricao: 'Segundo par de olhos. Aprova, mas não lança nem cadastra.',
    permissoes: ['ler', 'aprovar'],
    alcadaCents: 2000000,        // R$ 20.000,00
  },
  operador: {
    nome: 'Operador',
    descricao: 'Lança, importa e classifica. Não aprova o que ele mesmo pediu.',
    permissoes: ['ler', 'lancar', 'cadastrar'],
    alcadaCents: 0,
  },
  contador: {
    nome: 'Contador',
    descricao: 'Acesso contábil completo de leitura + fechamento. Não paga.',
    permissoes: ['ler', 'lancar', 'fechar'],
    alcadaCents: 0,
  },
  leitor: {
    nome: 'Leitor',
    descricao: 'Só consulta e relatório.',
    permissoes: ['ler'],
    alcadaCents: 0,
  },
};

class ErroDePermissao extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDePermissao'; this.status = 403; }
}

const perfil = (nome) => PERFIS[nome] || null;
const acao = (nome) => ACOES[nome] || null;

/** Nível efetivo: piso do catálogo, elevado (nunca rebaixado) pela conta. */
function nivelDe(nomeAcao, configuracaoDaConta = {}) {
  const a = acao(nomeAcao);
  if (!a) throw new ErroDePermissao(`Ação desconhecida: ${nomeAcao}.`);
  const configurado = Number(configuracaoDaConta[nomeAcao]);
  return Number.isInteger(configurado) ? Math.max(a.nivelMinimo, configurado) : a.nivelMinimo;
}

const podeFazer = (nomePerfil, permissao) => {
  const p = perfil(nomePerfil);
  return !!p && p.permissoes.includes(permissao);
};

/**
 * Guarda de entrada de toda ação. Devolve o plano de execução:
 * `{ nivel, exigeAprovacao, exigeMfa, motivo }`.
 *
 * Não executa nada — quem chama decide entre executar direto ou abrir
 * uma solicitação de aprovação. Separar as duas coisas é o que impede
 * "esqueci de checar" virar um pagamento.
 */
function autorizar(nomeAcao, { perfil: nomePerfil, valorCents = 0, mfa = false, configuracao = {} } = {}) {
  const a = acao(nomeAcao);
  if (!a) throw new ErroDePermissao(`Ação desconhecida: ${nomeAcao}.`);
  const nivel = nivelDe(nomeAcao, configuracao);

  if (nivel >= NIVEIS.PROIBIDA) {
    throw new ErroDePermissao(a.motivo || `A ação "${nomeAcao}" não está autorizada neste produto.`);
  }
  const p = perfil(nomePerfil);
  if (!p) throw new ErroDePermissao(`Perfil desconhecido: ${nomePerfil}.`);
  if (!p.permissoes.includes(a.permissao)) {
    throw new ErroDePermissao(`O perfil ${p.nome} não tem permissão para ${nomeAcao}.`);
  }

  if (nivel <= NIVEIS.AUTO) return { nivel, exigeAprovacao: false, exigeMfa: false };
  if (nivel === NIVEIS.PREVIA) return { nivel, exigeAprovacao: false, exigeMfa: false, exigePrevia: true };

  // Nível 3: maker-checker sempre, MFA sempre, alçada por valor.
  if (!mfa) {
    return { nivel, exigeAprovacao: true, exigeMfa: true, motivo: 'Ação material exige segundo fator de autenticação.' };
  }
  return { nivel, exigeAprovacao: true, exigeMfa: true, valorCents };
}

/**
 * Quem pode decidir esta solicitação. Duas regras juntas:
 *   • segregação: o solicitante nunca aprova a própria solicitação;
 *   • alçada: o decisor precisa de teto igual ou maior que o valor.
 */
function podeAprovar({ perfilDecisor, usuarioDecisor, usuarioSolicitante, valorCents = 0 }) {
  const p = perfil(perfilDecisor);
  if (!p) return { pode: false, motivo: `Perfil desconhecido: ${perfilDecisor}.` };
  if (!p.permissoes.includes('aprovar')) return { pode: false, motivo: `O perfil ${p.nome} não aprova solicitações.` };
  if (usuarioDecisor && usuarioDecisor === usuarioSolicitante) {
    return { pode: false, motivo: 'Segregação de funções: quem solicita não aprova a própria solicitação.' };
  }
  if (p.alcadaCents !== -1 && valorCents > p.alcadaCents) {
    return { pode: false, motivo: `Valor acima da alçada do perfil ${p.nome}.`, alcadaCents: p.alcadaCents };
  }
  return { pode: true, alcadaCents: p.alcadaCents };
}

module.exports = {
  NIVEIS, ACOES, PERFIS, ErroDePermissao,
  perfil, acao, nivelDe, podeFazer, autorizar, podeAprovar,
};
