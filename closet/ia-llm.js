// =====================================================================
// Closet Club — motor de IA com LLM (Claude), onda 3.
//
// DIVISÃO DE TRABALHO (é o que torna isto seguro):
//   • As REGRAS (ia.js) continuam donas das restrições duras — quem está
//     disponível nas datas, o que serve no corpo, o que cabe no orçamento.
//   • O LLM entra só onde regra é ruim: gosto, combinação e linguagem.
//   • O LLM NUNCA inventa peça: recebe um catálogo de candidatas já
//     filtrado e devolve IDs, que são validados contra esse catálogo.
//     ID que não estiver na lista é descartado.
//
// Qualquer falha (sem chave, timeout, recusa, JSON fora do schema) cai de
// volta no motor de regras — a funcionalidade nunca fica indisponível.
//
// Ligar: CLOSET_IA_MOTOR=llm + ANTHROPIC_API_KEY.
// =====================================================================
'use strict';
const repo = require('./repo');
const { s, n } = repo;

const MODELO = process.env.CLOSET_IA_MODELO || 'claude-opus-5';
const TIMEOUT_MS = Number(process.env.CLOSET_IA_TIMEOUT_MS) || 45000;

let _cliente = null;
let _avisouIndisponivel = false;

function cliente() {
  if (_cliente) return _cliente;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    _cliente = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 2 });
    return _cliente;
  } catch (e) {
    if (!_avisouIndisponivel) { console.warn('[closet/ia-llm] SDK indisponível:', e.message); _avisouIndisponivel = true; }
    return null;
  }
}

const disponivel = () => String(process.env.CLOSET_IA_MOTOR || '').toLowerCase() === 'llm' && !!cliente();

// ---------------------------------------------------------------------
// Chamada padrão: saída estruturada + fallback de recusa + cache do prompt
// ---------------------------------------------------------------------
async function pedir({ sistema, mensagem, schema, esforco = 'medium' }) {
  const c = cliente();
  if (!c) throw new Error('IA com LLM não configurada.');

  const resp = await c.beta.messages.create({
    model: MODELO,
    max_tokens: 8000,
    // fallback de recusa: se o classificador recusar, a própria API refaz
    // o pedido no modelo alternativo em vez de devolver erro para o cliente
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: esforco,
      format: { type: 'json_schema', schema },
    },
    // o prompt de sistema é estável entre chamadas → cacheável
    system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: mensagem }],
  });

  if (resp.stop_reason === 'refusal') throw new Error('Pedido recusado pelo modelo.');
  if (resp.stop_reason === 'max_tokens') throw new Error('Resposta truncada.');
  const bloco = (resp.content || []).find((b) => b.type === 'text');
  if (!bloco) throw new Error('Resposta sem conteúdo.');
  return JSON.parse(bloco.text);
}

// ---------------------------------------------------------------------
// 1. Descrição de anúncio
// ---------------------------------------------------------------------
const SISTEMA_DESCRICAO = `Você escreve descrições de anúncio para o Closet Club, um marketplace brasileiro
de ALUGUEL de roupas entre pessoas (não é venda, não é brechó).

Voz da marca: luxo discreto, direta, concreta. Nada de superlativo vazio ("incrível", "maravilhoso",
"peça dos sonhos"), nada de emoji, nada de exclamação. Frases curtas.

Regras inegociáveis:
- Escreva SOMENTE a partir dos dados fornecidos. Não invente marca, tecido, medida, origem nem história.
- Se um dado não veio, não fale dele. Nunca escreva "provavelmente" ou "deve ser".
- É aluguel: nada de "leve para casa", "sua nova peça favorita" ou linguagem de compra.
- Se a condição for "usado", diga isso com naturalidade em vez de esconder.
- Português brasileiro. 60 a 110 palavras.
- As palavras-chave são o que uma pessoa digitaria no Google para achar esta peça para alugar.`;

const SCHEMA_DESCRICAO = {
  type: 'object',
  properties: {
    descricao: { type: 'string' },
    titulo_sugerido: { type: 'string' },
    palavras_chave: { type: 'array', items: { type: 'string' } },
    estilo: { type: 'string' },
  },
  required: ['descricao', 'titulo_sugerido', 'palavras_chave', 'estilo'],
  additionalProperties: false,
};

async function descreverPeca(item = {}) {
  const dados = {
    titulo: s(item.titulo, 140), categoria: s(item.categoria, 40), marca: s(item.marca, 60),
    cor: s(item.cor, 40), tamanho: s(item.tamanho, 20), condicao: s(item.condicao, 20),
    ocasioes: Array.isArray(item.ocasioes) ? item.ocasioes : [],
    estacao: s(item.estacao, 20), medidas: item.medidas || {}, modelo: item.modelo || {},
    cidade: s(item.cidade, 80),
  };
  const out = await pedir({
    sistema: SISTEMA_DESCRICAO,
    mensagem: `Dados da peça (campos vazios significam "não informado"):\n${JSON.stringify(dados, null, 2)}`,
    schema: SCHEMA_DESCRICAO,
    esforco: 'low',
  });
  return {
    motor: 'llm',
    descricao: s(out.descricao, 4000),
    titulo_sugerido: s(out.titulo_sugerido, 140),
    palavras: (out.palavras_chave || []).map((p) => s(p, 80)).slice(0, 12),
    estilo: { motor: 'llm', estilo: s(out.estilo, 40), confianca: 0.8, alternativas: [] },
  };
}

// ---------------------------------------------------------------------
// 2. Montagem de looks — o LLM CURA, as regras FILTRAM
// ---------------------------------------------------------------------
const SISTEMA_LOOKS = `Você é consultor de imagem do Closet Club, marketplace brasileiro de aluguel de roupas.

Recebe (a) o briefing de uma pessoa e (b) um catálogo de peças JÁ FILTRADO pelo sistema — todas
disponíveis nas datas dela, no tamanho dela e na cidade dela. Sua tarefa é montar conjuntos que
funcionem juntos.

Regras inegociáveis:
- Use SOMENTE ids que estão no catálogo. Não invente id, peça, cor ou preço.
- Cada look precisa de uma peça-chave (vestido, terno, blazer ou saia) e de 1 a 3 complementos
  de categorias diferentes (sapato, bolsa, joia, acessório). Nunca repita categoria no mesmo look.
- Uma peça pode aparecer em no máximo um look.
- Respeite o orçamento por diária quando ele vier no briefing.
- Monte looks visualmente distintos entre si: não devolva variações da mesma ideia.
- Os "porquês" são para a cliente ler: concretos e curtos ("o verde puxa o dourado da clutch"),
  nunca genéricos ("combina bem", "fica lindo"). Máximo 8 palavras cada. Sem emoji.
- O título nomeia a ocasião e o clima do look, em até 5 palavras.
- Se o catálogo não permitir um conjunto honesto, devolva menos looks. Melhor 1 bom que 4 forçados.`;

const SCHEMA_LOOKS = {
  type: 'object',
  properties: {
    looks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          item_ids: { type: 'array', items: { type: 'string' } },
          porques: { type: 'array', items: { type: 'string' } },
        },
        required: ['titulo', 'item_ids', 'porques'],
        additionalProperties: false,
      },
    },
  },
  required: ['looks'],
  additionalProperties: false,
};

// candidatas = peças já filtradas pelo motor de regras (disponibilidade + tamanho + cidade)
async function montarLooks(brief = {}, candidatas = [], { quantidade = 4 } = {}) {
  if (!candidatas.length) return { motor: 'llm', looks: [] };
  const catalogo = candidatas.slice(0, 60).map((i) => ({
    id: i.id, titulo: i.titulo, categoria: i.categoria, cor: i.cor, marca: i.marca,
    tamanho: i.tamanho, estilo: i.estilo, ocasioes: i.ocasioes,
    diaria_reais: Math.round((i.preco_diaria_centavos || 0) / 100),
  }));
  const out = await pedir({
    sistema: SISTEMA_LOOKS,
    mensagem: `Briefing da cliente:\n${JSON.stringify(brief, null, 2)}\n\n`
      + `Catálogo disponível (${catalogo.length} peças):\n${JSON.stringify(catalogo)}\n\n`
      + `Monte até ${Math.min(n(quantidade, 4), 8)} looks.`,
    schema: SCHEMA_LOOKS,
    esforco: 'medium',
  });

  // ---- validação: nada que o modelo devolveu entra sem conferência ----
  const porId = new Map(candidatas.map((i) => [i.id, i]));
  const usadas = new Set();
  const looks = [];
  for (const L of (out.looks || [])) {
    const itens = [];
    const categorias = new Set();
    for (const id of (L.item_ids || [])) {
      const it = porId.get(s(id, 40));
      if (!it) continue;                        // id inventado → descartado
      if (usadas.has(it.id)) continue;          // peça repetida entre looks
      if (categorias.has(it.categoria)) continue; // categoria repetida no look
      categorias.add(it.categoria);
      itens.push(it);
    }
    if (itens.length < 2) continue;             // não é conjunto
    itens.forEach((i) => usadas.add(i.id));
    const custo = itens.reduce((t, i) => t + i.preco_diaria_centavos, 0);
    looks.push({
      titulo: s(L.titulo, 90) || 'Look sugerido',
      itens: itens.map((i, k) => ({
        id: i.id, titulo: i.titulo, categoria: i.categoria, papel: k === 0 ? 'peça-chave' : i.categoria,
        cor: i.cor, tamanho: i.tamanho, marca: i.marca,
        preco_diaria_centavos: i.preco_diaria_centavos, foto: (i.fotos || [])[0] || null, owner_id: i.owner_id,
        porques: [],
      })),
      donos: [...new Set(itens.map((i) => i.owner_id))].length,
      preco_diaria_soma_centavos: custo,
      preco_diaria_look_centavos: Math.round(custo * 0.9),
      desconto_pct: 10,
      porques: (L.porques || []).map((p) => s(p, 120)).slice(0, 5),
      pontuacao: 0,
    });
  }
  return { motor: 'llm', looks };
}

module.exports = { disponivel, descreverPeca, montarLooks, MODELO };
