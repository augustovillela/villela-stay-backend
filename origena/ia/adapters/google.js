// =====================================================================
// ORIGENA — adapter Google (Gemini). Três frentes:
// `transcrever_audio` (2.4), `embedding` (2.5) e as edições de imagem do
// Studio (3.1): restaurar, colorizar e ampliar.
//
// POR QUE ESTE PROVEDOR. A chave já é paga pelo grupo (é a mesma do
// Estúdio de Ilustração do Invente) e o modelo recebe áudio direto, sem
// serviço novo no meio. É o caminho de menor compromisso enquanto o
// Augusto decide se contrata um serviço dedicado.
//
// O QUE ELE NÃO FAZ, E ESTÁ DECLARADO: **diarização de verdade**. Quem
// separa vozes por assinatura acústica são serviços especializados
// (Deepgram, AssemblyAI). Aqui o modelo é instruído a marcar quem fala
// quando dá para distinguir, e a marcação é PALPITE — a tela chama de
// transcrição automática, para conferir. Entrevista com quatro pessoas
// falando por cima continua exigindo o provedor dedicado.
//
// LIGADO EM 10/08/2026, por decisão do Augusto. A conta foi CONFERIDA
// como paga (no tier gratuito o modelo de imagem tem limite zero, e ele
// respondeu 200), e o parecer jurídico ficou explicitamente para depois
// **enquanto o uso está restrito à família dele** — está registrado como
// pendência com gatilho, não esquecido. Sair da família reabre a questão:
// aqui se grava a voz de gente VIVA falando de terceiros.
// =====================================================================
'use strict';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = Number(process.env.ORIGENA_IA_TIMEOUT_MS) || 120000;

const chave = () => process.env.ORIGENA_GOOGLE_CHAVE || process.env.GEMINI_API_KEY || '';
const pronto = () => !!chave();

const INSTRUCAO = `Você transcreve entrevistas de história de família em português brasileiro.

Transcreva o áudio LITERALMENTE, com a pontuação que faça o texto ser lido em voz alta como foi
dito. Preserve o modo de falar de quem conta — regionalismo, repetição, expressão antiga: é isso
que faz a memória ser daquela pessoa, e não de um redator. NÃO resuma, NÃO corrija a gramática,
NÃO complete frase interrompida.

Onde não der para entender, escreva [inaudível]; se houver mais de uma voz e der para distinguir,
prefixe as falas com "— " a cada troca. Não invente nome de pessoa nem de lugar: se o som não
permitir identificar, deixe [inaudível].

Se não houver fala nenhuma no áudio, devolva a transcrição vazia.

Responda em JSON: {"transcricao": "...", "idioma": "pt-BR", "vozes": 1}.`;

const SCHEMA = {
  type: 'object',
  required: ['transcricao'],
  properties: {
    transcricao: { type: 'string' },
    idioma: { type: 'string' },
    vozes: { type: 'integer' },
  },
};

/** entrada = { arquivo: {mime, base64} } */
async function executar({ model, capability, entrada }) {
  if (capability === 'embedding') return embutir({ model, entrada });
  if (EDICOES[capability]) return editarImagem({ model, capability, entrada });
  if (capability !== 'transcrever_audio') throw new Error('capability não suportada: ' + capability);
  if (!pronto()) throw new Error('sem GEMINI_API_KEY');
  const arq = entrada && entrada.arquivo;
  if (!arq || !arq.base64) throw new Error('transcrever_audio exige áudio');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(`${BASE}/${model}:generateContent?key=${chave()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCAO }] },
        contents: [{ parts: [
          { inline_data: { mime_type: arq.mime || 'audio/webm', data: arq.base64 } },
          { text: 'Transcreva o áudio acima.' },
        ] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA,
          temperature: 0 },
      }),
    });
  } finally { clearTimeout(t); }

  if (!r.ok) throw new Error('Google ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const d = await r.json();
  const partes = (((d.candidates || [])[0] || {}).content || {}).parts || [];
  const texto = partes.map((p) => p.text || '').join('').trim();
  if (!texto) throw new Error('resposta sem conteúdo');

  const uso = d.usageMetadata || {};
  return {
    saida: JSON.parse(texto),
    tokens_in: uso.promptTokenCount || 0,
    tokens_out: uso.candidatesTokenCount || 0,
    // o custo real por segundo de áudio entra quando a tabela de preços do
    // provedor for plugada; por ora vale o estimado do registry
    custo_centavos: 0,
  };
}

/**
 * Embeddings (2.5). Vetor por trecho, para a busca semântica.
 *
 * 768 DIMENSÕES, não as 3072 do padrão: o índice cabe num banco pequeno, a
 * consulta é mais rápida e a perda de qualidade é marginal para acervo de
 * família. A dimensão vive em `config` — mudá-la exige reconstruir o
 * índice inteiro, e o código recusa misturar vetores de tamanhos
 * diferentes em vez de comparar coisa com coisa que não é.
 *
 * `taskType` importa: o Google gera vetores DIFERENTES para quem guarda
 * (`RETRIEVAL_DOCUMENT`) e para quem pergunta (`RETRIEVAL_QUERY`). Usar o
 * mesmo para os dois piora a busca em silêncio.
 */
async function embutir({ model, entrada }) {
  if (!pronto()) throw new Error('sem GEMINI_API_KEY');
  const texto = String((entrada || {}).texto || '').trim();
  if (!texto) throw new Error('embedding exige texto');
  const dim = Number((entrada || {}).dimensoes) || 768;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(`${BASE}/${model}:embedContent?key=${chave()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        content: { parts: [{ text: texto.slice(0, 8000) }] },
        outputDimensionality: dim,
        taskType: entrada.consulta ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
      }),
    });
  } finally { clearTimeout(t); }

  if (!r.ok) throw new Error('Google ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const d = await r.json();
  const vetor = ((d.embedding || {}).values) || [];
  if (vetor.length !== dim) throw new Error(`embedding veio com ${vetor.length} dimensões, esperava ${dim}`);
  return { saida: { vetor }, tokens_in: 0, tokens_out: 0, custo_centavos: 0 };
}

// ---------------------------------------------------------- Studio (3.1)
/**
 * As três edições de imagem. A instrução é do PRODUTO, não do usuário:
 * quem envia texto livre para um modelo de imagem acaba pedindo que ele
 * "melhore" o bisavô — e aí a foto deixa de ser dele. Cada modo diz o que
 * pode e, principalmente, o que NÃO pode inventar.
 */
const EDICOES = {
  restaurar_foto: `Restaure esta fotografia antiga preservando a identidade da imagem.
PODE: remover riscos, manchas, dobras e ruído; corrigir contraste e exposição; recompor bordas
danificadas quando o padrão ao redor for evidente.
NÃO PODE, EM HIPÓTESE NENHUMA: alterar traços de rosto, expressão, idade aparente, corpo, roupa,
objetos ou cenário; acrescentar pessoas, elementos ou detalhes que não estejam visíveis; "melhorar"
a aparência de quem quer que seja. Onde a informação foi destruída, deixe como está — falta de
informação é melhor que informação inventada.
Devolva apenas a imagem restaurada, no mesmo enquadramento.`,

  colorizar_foto: `Colorize esta fotografia em preto e branco de forma plausível e sóbria.
PODE: atribuir cores naturais a pele, cabelo, vegetação, céu, madeira e tecidos comuns.
NÃO PODE: mudar o desenho da imagem, os traços de rosto, o enquadramento ou qualquer elemento;
saturar como cartão-postal; inventar cor de roupa ou objeto com cor culturalmente significativa
(uniforme, bandeira, hábito religioso) — nesses casos use tons neutros.
Cor é PALPITE: o resultado é uma interpretação, não um registro. Devolva apenas a imagem.`,

  ampliar_foto: `Amplie esta fotografia com mais definição, mantendo-a fiel ao original.
PODE: aumentar a resolução e recuperar nitidez de bordas e texturas já presentes.
NÃO PODE: inventar detalhe que não exista no original — sobretudo em rostos, onde um olho ou uma
boca "reconstruídos" mudam a pessoa. Prefira suave e fiel a nítido e diferente.
Devolva apenas a imagem ampliada, no mesmo enquadramento.`,
};

async function editarImagem({ model, capability, entrada }) {
  if (!pronto()) throw new Error('sem GEMINI_API_KEY');
  const arq = entrada && entrada.arquivo;
  if (!arq || !arq.base64) throw new Error(capability + ' exige a imagem original');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(`${BASE}/${model}:generateContent?key=${chave()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: arq.mime || 'image/jpeg', data: arq.base64 } },
          { text: EDICOES[capability] },
        ] }],
      }),
    });
  } finally { clearTimeout(t); }

  if (!r.ok) throw new Error('Google ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const d = await r.json();
  const partes = (((d.candidates || [])[0] || {}).content || {}).parts || [];
  const img = partes.find((p) => p.inlineData && String(p.inlineData.mimeType || '').startsWith('image/'));
  // Recusa do modelo é resposta legítima (foto com pessoa, conteúdo sensível):
  // devolver erro claro é melhor que devolver o original fingindo trabalho.
  if (!img) throw new Error('o modelo não devolveu imagem: ' +
    (partes.map((p) => p.text || '').join(' ').slice(0, 160) || 'sem motivo declarado'));

  const uso = d.usageMetadata || {};
  return {
    saida: { mime: img.inlineData.mimeType, base64: img.inlineData.data },
    tokens_in: uso.promptTokenCount || 0,
    tokens_out: uso.candidatesTokenCount || 0,
    custo_centavos: 0,
  };
}

module.exports = { pronto, executar, EDICOES };
