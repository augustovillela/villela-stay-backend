// =====================================================================
// Musique · Laboratório — MATRIZ DE ACESSO (ADR-0013). Fonte ÚNICA.
//
// Nenhuma tela decide sozinha o que é pago. Cada capacidade está aqui,
// com quem pode usar; as páginas perguntam a `pode()` e a API paga passa
// pelo `requireUsuario`, que já devolve 402 sem assinatura. O teste
// percorre a matriz inteira — capacidade nova sem linha aqui quebra.
//
// Regra do Augusto (28/09/2026): ferramentas e referências básicas são
// PÚBLICAS; o que é pessoal, sequencial ou avançado segue na assinatura.
// Preço e teste grátis NÃO mudam aqui.
// =====================================================================
'use strict';

// requer: 'nada' (sem conta) | 'assinatura' (conta com acesso ativo:
// teste grátis, assinatura, banda ou cortesia) | 'docente' (assinatura +
// professor pelos caminhos da ADR-0008).
const CAPACIDADES = {
  'hub':                 { requer: 'nada', nome: 'Laboratório, ambientes e busca' },
  'referencia':          { requer: 'nada', nome: 'Referências, atlas e glossário' },
  'paginas-teoria':      { requer: 'nada', nome: 'Páginas de nota, intervalo, escala, acorde e tonalidade' },
  'exploradores':        { requer: 'nada', nome: 'Piano, pauta, braços, círculos e identificadores' },
  'ferramentas-criar':   { requer: 'nada', nome: 'Piano virtual, transpositor, BPM, batidas, sequenciador, progressões' },
  'licoes-introdutorias': { requer: 'nada', nome: 'Primeiras lições da trilha (amostra)' },
  'pratica-demo':        { requer: 'nada', nome: 'Exercícios em demonstração (sessão curta, sem histórico)' },
  'jogos-demo':          { requer: 'nada', nome: 'Jogos em demonstração (recorde só neste aparelho)' },
  'separar-demo':        { requer: 'nada', nome: 'Separar trilhas: o primeiro minuto de cada música' },
  'transcrever-demo':    { requer: 'nada', nome: 'Transcrever música: o primeiro minuto de cada música' },
  'tutor-demo':          { requer: 'nada', nome: 'Tutor de braço: demonstração animada e 3 rodadas com o tutor por visita' },
  'licoes-completas':    { requer: 'assinatura', nome: 'Trilha completa de lições' },
  'pratica-completa':    { requer: 'assinatura', nome: 'Sessões completas, todos os níveis e repetição espaçada' },
  'progresso':           { requer: 'assinatura', nome: 'Progresso, histórico e domínio por habilidade' },
  'favoritos':           { requer: 'assinatura', nome: 'Favoritos sincronizados' },
  'jogos-historico':     { requer: 'assinatura', nome: 'Desafio do dia com histórico e melhores marcas na nuvem' },
  'exportar':            { requer: 'assinatura', nome: 'Exportar criações (MIDI, JSON)' },
  'separar-completo':    { requer: 'assinatura', nome: 'Separar trilhas da música inteira (até 8 minutos)' },
  'transcrever-completo': { requer: 'assinatura', nome: 'Transcrever música inteira (até 15 minutos) e ao vivo sem limite' },
  'tutor-completo':      { requer: 'assinatura', nome: 'Tutor de braço: rodadas ilimitadas, marca por exercício e conversa com o tutor' },
  'ensinar':             { requer: 'docente', nome: 'Atividades, atribuição e relatórios do professor' },
};

// Tamanho da sessão de demonstração. É convite, não muro: o valor da
// assinatura é o que fica guardado e o que se adapta, não a 11ª questão.
const DEMO_QUESTOES = 10;
const LICOES_ABERTAS = 3;

/** Contexto de acesso de quem pede: { logado, assinante, docente }. */
function contexto({ usuario = null, acessoDaConta = null, ehDocente = null } = {}) {
  if (!usuario) return { logado: false, assinante: false, docente: false };
  let assinante = false;
  try { assinante = !!(acessoDaConta ? acessoDaConta(usuario.id) : { acesso: false }).acesso; } catch (_) { assinante = false; }
  let docente = false;
  try { docente = assinante && !!(ehDocente && ehDocente(usuario)); } catch (_) { docente = false; }
  return { logado: true, assinante, docente };
}

/**
 * Pode usar? Devolve { ok, motivo, acao } — a tela mostra o motivo e a
 * ação (entrar / assinar), nunca um erro genérico.
 */
function pode(capacidade, ctx) {
  const c = CAPACIDADES[capacidade];
  if (!c) return { ok: false, motivo: 'Capacidade desconhecida.', acao: null };
  const x = ctx || {};
  if (c.requer === 'nada') return { ok: true };
  if (!x.logado) return { ok: false, motivo: `${c.nome} faz parte da assinatura do Musique.`, acao: { rotulo: 'Entrar ou começar o teste grátis', url: '/music/entrar' } };
  if (!x.assinante) return { ok: false, motivo: `${c.nome} faz parte da assinatura. O seu teste grátis terminou.`, acao: { rotulo: 'Assinar o Musique', url: '/music/app#conta' } };
  if (c.requer === 'docente' && !x.docente) {
    return { ok: false, motivo: 'Esta área é de professor: vincule a sua conta de produtor da Academia em "Minha conta" ou entre como professor de uma escola do Musique.', acao: { rotulo: 'Minha conta', url: '/music/app#conta' } };
  }
  return { ok: true };
}

module.exports = { CAPACIDADES, DEMO_QUESTOES, LICOES_ABERTAS, contexto, pode };
