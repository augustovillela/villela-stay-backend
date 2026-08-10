// =====================================================================
// ORIGENA — adapter Google (Gemini). Existe por UMA capability:
// `transcrever_audio` (fase 2.4).
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
// A LINHA DO REGISTRY NASCE DESLIGADA (schema 015). Ligar exige duas
// coisas fora do código: conta PAGA (no tier gratuito o conteúdo pode ser
// usado para melhoria de produto) e o parecer da Q4 — aqui se grava a voz
// de gente VIVA falando de terceiros que nunca souberam da Origena.
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

module.exports = { pronto, executar };
