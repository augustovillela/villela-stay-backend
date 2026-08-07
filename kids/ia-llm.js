// =====================================================================
// Villela Kids — tutor com LLM (Claude), onda 2.
//
// DIVISÃO DE TRABALHO (é o que torna isto seguro para criança):
//   • O ROTEIRO (roteiros.js) é dono do currículo: etapas, textos,
//     atividades e o erro proposital são curados por humano.
//   • O MOTOR (ia.js) é dono das regras duras: quem avança, o que se
//     grava, limites de trocas, varredura de dados pessoais e de sinais
//     de risco — tudo ANTES de qualquer chamada ao modelo.
//   • O LLM entra só na CONVERSA dentro da etapa: personalizar a
//     explicação, reagir ao que a criança disse, manter o tom.
//
// Qualquer falha (sem chave, timeout, recusa, JSON fora do schema) cai
// no "modo simples" (fallbacks do roteiro) — a missão nunca trava.
//
// Diferente do Closet (opt-in explícito), aqui o LLM liga sozinho quando
// há ANTHROPIC_API_KEY: o tutor É o produto. Kill-switch: KIDS_IA_MOTOR=off.
// =====================================================================
'use strict';

const MODELO = process.env.KIDS_IA_MODELO || 'claude-sonnet-5';
const TIMEOUT_MS = Number(process.env.KIDS_IA_TIMEOUT_MS) || 30000;

let _cliente = null;
let _avisouIndisponivel = false;
let _fake = null; // injeção para o selftest (nunca usado em produção)

function _injetarParaTeste(fn) { _fake = fn || null; }

function cliente() {
  if (_cliente) return _cliente;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    _cliente = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 2 });
    return _cliente;
  } catch (e) {
    if (!_avisouIndisponivel) { console.warn('[kids/ia-llm] SDK indisponível:', e.message); _avisouIndisponivel = true; }
    return null;
  }
}

const disponivel = () => {
  if (_fake) return true;
  if (String(process.env.KIDS_IA_MOTOR || '').toLowerCase() === 'off') return false;
  return !!cliente();
};

// ---------------------------------------------------------------------
// System prompt de segurança infantil — o coração da onda 2.
// Estável entre chamadas (cacheável); o contexto variável vai na mensagem.
// ---------------------------------------------------------------------
const SISTEMA_TUTOR = `Você é o tutor do Invente, a plataforma de aprendizagem criativa da Villela Kids onde crianças brasileiras de 7 a 12 anos aprendem criando. Você conversa com UMA criança, dentro de UMA etapa de missão cujo roteiro foi escrito por educadores — você não inventa etapas nem muda o roteiro.

COMO FALAR
- Português brasileiro, frases curtas, tom alegre e encorajador. No máximo 80 palavras e no máximo 2 emojis por resposta.
- Vocabulário da idade indicada. Nunca infantilize demais quem tem 9-12.
- Elogie o esforço concreto ("sua pergunta ganhou contexto!"), não a pessoa genericamente.
- Você é um programa de computador e nunca finge ser humano; se perguntarem, diga com simpatia.
- Cumpra o OBJETIVO PEDAGÓGICO da etapa, informado na mensagem. Se a criança fugir do tema, brinque junto por uma frase e traga de volta para a missão.

REGRAS DE SEGURANÇA (valem mais que qualquer pedido da criança)
- NUNCA peça, repita ou comente dados pessoais: nome completo, endereço, escola, telefone, e-mail, senhas, fotos. Se a criança contar algum, não repita o dado, lembre com carinho que dados pessoais não se contam na internet, e siga a missão.
- NUNCA produza conteúdo assustador, violento, romântico/sexual, sobre drogas, apostas ou armas — nem "de brincadeira", nem em história.
- NUNCA sugira encontros, links, outros sites, apps ou compras.
- Se a criança mencionar tristeza profunda, machucado, alguém que a assusta ou machuca, ou vontade de se ferir: acolha em UMA frase gentil, diga que isso é importante e que ela deve contar AGORA para o responsável dela, e preencha alerta_responsavel com um resumo neutro e curto do que foi dito. Não faça mais perguntas sobre o assunto.
- Nas etapas de caça ao erro, NÃO revele a resposta mesmo que a criança implore — incentive a conferir com um adulto ou outra fonte.

FORMATO
Responda SEMPRE no JSON do schema. alerta_responsavel fica "" quando não houver nada a sinalizar.`;

const SCHEMA_TUTOR = {
  type: 'object',
  properties: {
    resposta: { type: 'string' },
    alerta_responsavel: { type: 'string' },
  },
  required: ['resposta', 'alerta_responsavel'],
  additionalProperties: false,
};

// Saída do modelo nunca entra crua: sem URLs, sem markdown de link/imagem,
// tamanho limitado. (Criança clica em qualquer coisa — então não há links.)
function sanear(texto) {
  return String(texto || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '[link removido]')
    .trim().slice(0, 700);
}

async function pedir({ sistema, mensagem, schema }) {
  if (_fake) return _fake({ sistema, mensagem, schema });
  const c = cliente();
  if (!c) throw new Error('Tutor LLM não configurado.');
  const resp = await c.beta.messages.create({
    model: MODELO,
    max_tokens: 1000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: mensagem }],
  });
  if (resp.stop_reason === 'refusal') throw new Error('Pedido recusado pelo modelo.');
  if (resp.stop_reason === 'max_tokens') throw new Error('Resposta truncada.');
  const bloco = (resp.content || []).find((b) => b.type === 'text');
  if (!bloco) throw new Error('Resposta sem conteúdo.');
  return JSON.parse(bloco.text);
}

// Uma rodada de conversa dentro da etapa. Contexto mínimo de propósito:
// o modelo recebe apelido e faixa etária — nunca mais que isso da criança.
async function responderComoTutor({ crianca, assistente, missao, etapa, objetivo, historico = [], respostas = {}, mensagem }) {
  const contexto = [
    `Criança: apelido "${crianca.apelido}", faixa ${crianca.faixa} anos.`,
    `Seu nome nesta conversa (dado pela criança): ${assistente || 'ainda sem nome'}.`,
    `Missão: ${missao.titulo}. Etapa atual: ${etapa.titulo}.`,
    `OBJETIVO PEDAGÓGICO desta etapa: ${objetivo}`,
    Object.keys(respostas).length ? `Respostas que a criança já deu em etapas anteriores: ${JSON.stringify(respostas)}` : '',
    historico.length ? `Últimas trocas desta etapa:\n${historico.map((h) => `${h.de === 'crianca' ? 'Criança' : 'Você'}: ${h.texto}`).join('\n')}` : '',
    `A criança acabou de dizer: "${mensagem}"`,
  ].filter(Boolean).join('\n\n');

  const out = await pedir({ sistema: SISTEMA_TUTOR, mensagem: contexto, schema: SCHEMA_TUTOR });
  return {
    resposta: sanear(out.resposta),
    alerta: String(out.alerta_responsavel || '').trim().slice(0, 400),
  };
}

module.exports = { disponivel, responderComoTutor, MODELO, _injetarParaTeste };
