// Segunda leitura independente do parecer privado do CEO.
// A IA recebe somente fatos já normalizados e a saída quantitativa. Ela
// não pesquisa, não executa operações e não pode converter falta de dado
// em convicção. Sem chave/API, o motor fica explicitamente bloqueado.
'use strict';

const MODELO = process.env.FINANCE_INV_LLM_MODEL || 'claude-sonnet-4-6';
const CONCLUSOES = new Set(['comprar', 'manter', 'reduzir', 'vender', 'evitar', 'nao_conclusivo']);

const SCHEMA = {
  type: 'object',
  properties: {
    analises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          conclusao: { type: 'string', enum: [...CONCLUSOES] },
          confianca_ppm: { type: 'integer', minimum: 0, maximum: 1000000 },
          fundamento: { type: 'string' },
          riscos: { type: 'array', items: { type: 'string' } },
          lacunas: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'conclusao', 'confianca_ppm', 'fundamento', 'riscos', 'lacunas'],
        additionalProperties: false,
      },
    },
  },
  required: ['analises'],
  additionalProperties: false,
};

let _cliente = null;
function cliente() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_cliente) {
    const Anthropic = require('@anthropic-ai/sdk');
    _cliente = new Anthropic({ timeout: 45_000, maxRetries: 2 });
  }
  return _cliente;
}

const disponivel = () => String(process.env.FINANCE_INV_IA || 'on').toLowerCase() !== 'off' && !!cliente();

function validarSaida(saida, permitidos) {
  const vistos = new Set();
  const validas = [];
  for (const a of (saida && saida.analises) || []) {
    if (!permitidos.has(a.id) || vistos.has(a.id) || !CONCLUSOES.has(a.conclusao)) continue;
    vistos.add(a.id);
    validas.push({
      id: a.id,
      conclusao: a.conclusao,
      confiancaPpm: Math.max(0, Math.min(1_000_000, Number(a.confianca_ppm) || 0)),
      fundamento: String(a.fundamento || '').slice(0, 2000),
      riscos: (a.riscos || []).map(String).slice(0, 12),
      lacunas: (a.lacunas || []).map(String).slice(0, 12),
    });
  }
  return validas;
}

async function analisar(itens, { clienteImpl } = {}) {
  const c = clienteImpl || cliente();
  if (!c) return { status: 'bloqueado', modelo: '', motivo: 'anthropic_api_indisponivel', analises: [] };
  const permitidos = new Set(itens.map(x => x.id));
  if (!permitidos.size) return { status: 'concluido', modelo: MODELO, motivo: '', analises: [] };
  const sistema = `Você é o motor crítico independente do parecer privado de investimentos do CEO do Grupo Villela.
Use EXCLUSIVAMENTE os fatos fornecidos. Não use memória externa, não invente preço, retorno, risco ou previsão.
Uma recomendação conclusiva só é permitida quando há preço atual, valor justo/metodologia verificável, atualidade e fonte ativa.
Se faltar qualquer elemento material, use nao_conclusivo e descreva as lacunas.
Você não envia ordens, não sugere alavancagem, não produz instruções operacionais e não transforma análise em certeza.
O parecer é privado ao CEO e sua implementação, se houver, é decisão humana fora do sistema.`;
  try {
    const resp = await c.beta.messages.create({
      model: MODELO,
      max_tokens: 6000,
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Analise criticamente estes itens:\n${JSON.stringify(itens)}` }],
    });
    if (resp.stop_reason === 'refusal' || resp.stop_reason === 'max_tokens') {
      throw new Error(`resposta incompleta: ${resp.stop_reason}`);
    }
    const bloco = (resp.content || []).find(x => x.type === 'text');
    if (!bloco) throw new Error('resposta sem conteúdo');
    return {
      status: 'concluido', modelo: MODELO, motivo: '',
      analises: validarSaida(JSON.parse(bloco.text), permitidos),
      uso: resp.usage || {},
    };
  } catch (e) {
    return { status: 'falhou', modelo: MODELO, motivo: String(e.message || e).slice(0, 500), analises: [] };
  }
}

module.exports = { MODELO, CONCLUSOES, SCHEMA, disponivel, validarSaida, analisar };
